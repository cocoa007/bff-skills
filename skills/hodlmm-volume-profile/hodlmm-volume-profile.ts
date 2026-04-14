#!/usr/bin/env bun
/**
 * hodlmm-volume-profile.ts
 *
 * HODLMM Volume Profile — Maps trading volume distribution across DLMM bin
 * ranges to identify High Volume Nodes (HVN), Low Volume Nodes (LVN),
 * Point of Control (POC), and Value Area for LP positioning decisions.
 *
 * Traditional volume profile analysis adapted for concentrated liquidity:
 *  - Scans on-chain swap events to map volume to specific bin ranges
 *  - Identifies POC: the bin range with highest traded volume
 *  - Calculates Value Area (70% of volume) — the range where most trading occurs
 *  - Detects HVNs (support/resistance) and LVNs (fast price movement zones)
 *  - Provides LP positioning guidance based on volume distribution shape
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 68).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 500;
const EVENT_SCAN_LIMIT = 50;
const VALUE_AREA_PCT = 0.70;
const HVN_THRESHOLD_MULTIPLIER = 1.5;
const LVN_THRESHOLD_MULTIPLIER = 0.3;
const BIN_GROUP_SIZE = 5;

// ── Types ──────────────────────────────────────────────────────────────────────

interface AppPool {
  id: string;
  token0Symbol: string;
  token1Symbol: string;
  tvlUsd: number;
  volume24hUsd: number;
  poolId?: number;
  token0Decimals: number;
  token1Decimals: number;
  token0PriceUsd: number;
  token1PriceUsd: number;
  activeBinId?: number;
  feeBps?: number;
}

interface BinVolume {
  binId: number;
  volumeUsd: number;
  swapCount: number;
  buyVolume: number;
  sellVolume: number;
  netFlow: number;
}

interface BinGroup {
  startBin: number;
  endBin: number;
  label: string;
  volumeUsd: number;
  swapCount: number;
  buyVolume: number;
  sellVolume: number;
  pctOfTotal: number;
  classification: "HVN" | "LVN" | "NORMAL";
}

type ProfileShape = "BALANCED" | "LEFT-SKEWED" | "RIGHT-SKEWED" | "BIMODAL" | "CONCENTRATED" | "FLAT";

interface VolumeProfileAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  totalSwapsAnalyzed: number;
  totalVolumeUsd: number;
  uniqueBinsTraded: number;
  poc: {
    binGroup: string;
    volumeUsd: number;
    pctOfTotal: number;
    distanceFromActive: number;
  };
  valueArea: {
    lowBin: number;
    highBin: number;
    width: number;
    volumeUsd: number;
    pctOfTotal: number;
    containsActiveBin: boolean;
  };
  hvnCount: number;
  lvnCount: number;
  hvns: BinGroup[];
  lvns: BinGroup[];
  profileShape: ProfileShape;
  volumeConcentration: number;
  buyPressurePct: number;
  sellPressurePct: number;
  lpGuidance: string;
  riskFlags: string[];
  verdict: string;
  binGroups: BinGroup[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string, retries = 3): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (!r.ok) {
        if (r.status === 429 && i < retries) {
          await sleep(2500 * (i + 1));
          continue;
        }
        throw new Error(`HTTP ${r.status} for ${url}`);
      }
      return r.json();
    } catch (e: any) {
      if (i === retries) throw e;
      await sleep(1200 * (i + 1));
    }
  }
}

function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`;
}

function profileBar(pct: number, width = 20): string {
  const filled = Math.round((pct / 100) * width);
  return "█".repeat(Math.min(filled, width)) + "░".repeat(Math.max(width - filled, 0));
}

function shortAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function classifyShape(groups: BinGroup[], pocIdx: number): ProfileShape {
  if (groups.length === 0) return "FLAT";
  const volumes = groups.map((g) => g.volumeUsd);
  const maxVol = Math.max(...volumes);
  const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;

  if (maxVol < avgVol * 1.3) return "FLAT";

  const topGroups = groups.filter((g) => g.volumeUsd > avgVol * HVN_THRESHOLD_MULTIPLIER);
  if (topGroups.length >= 2) {
    const indices = topGroups.map((g) => groups.indexOf(g));
    const gap = Math.max(...indices) - Math.min(...indices);
    if (gap > groups.length * 0.4) return "BIMODAL";
  }

  const topPct = groups[pocIdx]?.pctOfTotal ?? 0;
  if (topPct > 40) return "CONCENTRATED";

  const mid = groups.length / 2;
  if (pocIdx < mid * 0.7) return "LEFT-SKEWED";
  if (pocIdx > mid * 1.3) return "RIGHT-SKEWED";

  return "BALANCED";
}

function shapeIcon(shape: ProfileShape): string {
  switch (shape) {
    case "BALANCED":      return "⚖️";
    case "LEFT-SKEWED":   return "◀️";
    case "RIGHT-SKEWED":  return "▶️";
    case "BIMODAL":       return "🏔️";
    case "CONCENTRATED":  return "🎯";
    case "FLAT":          return "➖";
  }
}

// ── Data Fetching ─────────────────────────────────────────────────────────────

async function fetchPools(): Promise<AppPool[]> {
  const allPools: any[] = [];
  let url = `${BFF_APP_BASE}/pools?limit=50`;
  for (let page = 0; page < 10; page++) {
    const data = await fetchJson(url);
    const items: any[] = Array.isArray(data) ? data : data?.data ?? data?.pools ?? [];
    allPools.push(...items);
    if (!data?.hasMore || !data?.nextCursor) break;
    url = `${BFF_APP_BASE}/pools?limit=50&cursor=${encodeURIComponent(data.nextCursor)}`;
  }

  return allPools
    .filter((p: any) => {
      const types: string[] = p.types ?? [];
      return types.includes("DLMM") || types.includes("ALL_POOLS");
    })
    .map((p: any) => {
      const tx = p.tokens?.tokenX ?? {};
      const ty = p.tokens?.tokenY ?? {};
      const rawId: string = String(p.poolId ?? "0");
      const numericId = parseInt(rawId.replace(/\D+/g, "")) || 0;
      const feeBps = p.baseFee != null
        ? parseFloat(String(p.baseFee)) * 10_000
        : parseFloat(p.feeBps ?? "30");
      return {
        id: rawId,
        token0Symbol: tx.symbol ?? p.token0Symbol ?? "?",
        token1Symbol: ty.symbol ?? p.token1Symbol ?? "?",
        tvlUsd: parseFloat(String(p.tvlUsd ?? "0")),
        volume24hUsd: parseFloat(String(p.volumeUsd1d ?? p.volume24hUsd ?? "0")),
        poolId: numericId,
        token0Decimals: parseInt(String(tx.decimals ?? p.token0Decimals ?? "6")),
        token1Decimals: parseInt(String(ty.decimals ?? p.token1Decimals ?? "6")),
        token0PriceUsd: parseFloat(String(tx.priceUsd ?? p.token0PriceUsd ?? "0")),
        token1PriceUsd: parseFloat(String(ty.priceUsd ?? p.token1PriceUsd ?? "0")),
        activeBinId: parseInt(String(p.activeBinId ?? "0")) || undefined,
        feeBps,
      } as AppPool;
    })
    .filter((p: AppPool) => p.tvlUsd >= MIN_TVL_USD);
}

function findPool(query: string, pools: AppPool[]): AppPool | null {
  const q = query.toLowerCase();
  return (
    pools.find((p) => String(p.poolId) === q) ??
    pools.find((p) => p.id?.toLowerCase() === q) ??
    pools.find((p) => {
      const pair = `${p.token0Symbol}-${p.token1Symbol}`.toLowerCase();
      return pair.includes(q) || q.includes(pair);
    }) ??
    pools.find((p) => {
      const sym = `${p.token0Symbol}${p.token1Symbol}`.toLowerCase();
      return sym.includes(q);
    }) ??
    null
  );
}

async function fetchContractEvents(offset = 0, limit = EVENT_SCAN_LIMIT): Promise<any[]> {
  const url = `${HIRO_API}/extended/v1/contract/${DLMM_CONTRACT_ADDR}.${DLMM_CONTRACT_NAME}/events?offset=${offset}&limit=${limit}`;
  const data = await fetchJson(url);
  return data?.results ?? data?.events ?? [];
}

// ── Volume Profile Construction ───────────────────────────────────────────────

interface SwapInfo {
  binId: number;
  volumeUsd: number;
  direction: "BUY" | "SELL" | "UNKNOWN";
}

function parseSwapsToBins(rawEvents: any[], pool: AppPool): SwapInfo[] {
  const swaps: SwapInfo[] = [];
  const poolId = pool.poolId ?? parseInt(pool.id);

  for (const event of rawEvents) {
    if (event.event_type !== "smart_contract_log") continue;
    const repr: string = event?.contract_log?.value?.repr ?? "";
    if (!repr) continue;

    const isSwap =
      repr.includes("swap") ||
      repr.includes("token-in") ||
      repr.includes("amount-in") ||
      repr.includes("amount-x-in") ||
      repr.includes("amount-y-in");
    if (!isSwap) continue;

    const pidMatch = repr.match(/pool-id\s+u(\d+)/);
    if (pidMatch && parseInt(pidMatch[1]) !== poolId) continue;
    if (!pidMatch) continue;

    const activeBinMatch =
      repr.match(/active-id\s+u(\d+)/) ??
      repr.match(/active-bin\s+u(\d+)/) ??
      repr.match(/new-active-id\s+u(\d+)/);
    const binId = activeBinMatch ? parseInt(activeBinMatch[1]) : (pool.activeBinId ?? 0);
    if (binId === 0) continue;

    const amountInMatch =
      repr.match(/amount-in\s+u(\d+)/) ??
      repr.match(/amount-x-in\s+u(\d+)/) ??
      repr.match(/amount-y-in\s+u(\d+)/);
    const amountOutMatch =
      repr.match(/amount-out\s+u(\d+)/) ??
      repr.match(/amount-x-out\s+u(\d+)/) ??
      repr.match(/amount-y-out\s+u(\d+)/);

    const amountInRaw = amountInMatch ? parseInt(amountInMatch[1]) : 0;
    const amountOutRaw = amountOutMatch ? parseInt(amountOutMatch[1]) : 0;

    let volumeUsd = 0;
    if (amountInRaw > 0 && pool.token0PriceUsd > 0) {
      const tokenAmt = amountInRaw / 10 ** pool.token0Decimals;
      volumeUsd = Math.min(tokenAmt * pool.token0PriceUsd, pool.tvlUsd * 0.5);
    }
    if (volumeUsd === 0 && amountOutRaw > 0 && pool.token1PriceUsd > 0) {
      const tokenAmt = amountOutRaw / 10 ** pool.token1Decimals;
      volumeUsd = Math.min(tokenAmt * pool.token1PriceUsd, pool.tvlUsd * 0.5);
    }

    let direction: "BUY" | "SELL" | "UNKNOWN" = "UNKNOWN";
    if (repr.includes("swap-x-to-y") || repr.includes("x-to-y") || repr.includes("buy") || repr.includes("amount-y-out")) {
      direction = "BUY";
    } else if (repr.includes("swap-y-to-x") || repr.includes("y-to-x") || repr.includes("sell") || repr.includes("amount-x-out")) {
      direction = "SELL";
    }

    swaps.push({ binId, volumeUsd, direction });
  }

  return swaps;
}

function buildBinVolumeMap(swaps: SwapInfo[]): Map<number, BinVolume> {
  const map = new Map<number, BinVolume>();
  for (const s of swaps) {
    const existing = map.get(s.binId) ?? {
      binId: s.binId,
      volumeUsd: 0,
      swapCount: 0,
      buyVolume: 0,
      sellVolume: 0,
      netFlow: 0,
    };
    existing.volumeUsd += s.volumeUsd;
    existing.swapCount += 1;
    if (s.direction === "BUY") {
      existing.buyVolume += s.volumeUsd;
      existing.netFlow += s.volumeUsd;
    } else if (s.direction === "SELL") {
      existing.sellVolume += s.volumeUsd;
      existing.netFlow -= s.volumeUsd;
    }
    map.set(s.binId, existing);
  }
  return map;
}

function groupBins(binMap: Map<number, BinVolume>, totalVolumeUsd: number): BinGroup[] {
  if (binMap.size === 0) return [];

  const bins = Array.from(binMap.values()).sort((a, b) => a.binId - b.binId);
  const minBin = bins[0].binId;
  const maxBin = bins[bins.length - 1].binId;
  const range = maxBin - minBin + 1;
  const groupSize = Math.max(BIN_GROUP_SIZE, Math.ceil(range / 20));

  const groups: BinGroup[] = [];
  for (let start = minBin; start <= maxBin; start += groupSize) {
    const end = Math.min(start + groupSize - 1, maxBin);
    const binsInGroup = bins.filter((b) => b.binId >= start && b.binId <= end);
    const volumeUsd = binsInGroup.reduce((s, b) => s + b.volumeUsd, 0);
    const swapCount = binsInGroup.reduce((s, b) => s + b.swapCount, 0);
    const buyVolume = binsInGroup.reduce((s, b) => s + b.buyVolume, 0);
    const sellVolume = binsInGroup.reduce((s, b) => s + b.sellVolume, 0);
    const pctOfTotal = totalVolumeUsd > 0 ? (volumeUsd / totalVolumeUsd) * 100 : 0;

    groups.push({
      startBin: start,
      endBin: end,
      label: start === end ? `${start}` : `${start}-${end}`,
      volumeUsd,
      swapCount,
      buyVolume,
      sellVolume,
      pctOfTotal,
      classification: "NORMAL",
    });
  }

  const avgVol = totalVolumeUsd / Math.max(groups.length, 1);
  for (const g of groups) {
    if (g.volumeUsd > avgVol * HVN_THRESHOLD_MULTIPLIER) {
      g.classification = "HVN";
    } else if (g.volumeUsd < avgVol * LVN_THRESHOLD_MULTIPLIER && g.volumeUsd > 0) {
      g.classification = "LVN";
    }
  }

  return groups;
}

function findValueArea(groups: BinGroup[], totalVolumeUsd: number): { lowIdx: number; highIdx: number; volumeUsd: number } {
  if (groups.length === 0) return { lowIdx: 0, highIdx: 0, volumeUsd: 0 };

  const pocIdx = groups.reduce((best, g, i) =>
    g.volumeUsd > groups[best].volumeUsd ? i : best, 0);

  let low = pocIdx;
  let high = pocIdx;
  let accumulated = groups[pocIdx].volumeUsd;
  const target = totalVolumeUsd * VALUE_AREA_PCT;

  while (accumulated < target && (low > 0 || high < groups.length - 1)) {
    const leftVol = low > 0 ? groups[low - 1].volumeUsd : -1;
    const rightVol = high < groups.length - 1 ? groups[high + 1].volumeUsd : -1;

    if (leftVol >= rightVol && low > 0) {
      low--;
      accumulated += groups[low].volumeUsd;
    } else if (high < groups.length - 1) {
      high++;
      accumulated += groups[high].volumeUsd;
    } else {
      break;
    }
  }

  return { lowIdx: low, highIdx: high, volumeUsd: accumulated };
}

// ── Analysis ──────────────────────────────────────────────────────────────────

async function analyzePool(pool: AppPool): Promise<VolumeProfileAnalysis> {
  const rawEvents = await fetchContractEvents(0, EVENT_SCAN_LIMIT);
  const swaps = parseSwapsToBins(rawEvents, pool);
  const binMap = buildBinVolumeMap(swaps);
  const totalVolumeUsd = swaps.reduce((s, sw) => s + sw.volumeUsd, 0);
  const groups = groupBins(binMap, totalVolumeUsd);

  const pocIdx = groups.length > 0
    ? groups.reduce((best, g, i) => g.volumeUsd > groups[best].volumeUsd ? i : best, 0)
    : 0;
  const pocGroup = groups[pocIdx];

  const va = findValueArea(groups, totalVolumeUsd);
  const activeBin = pool.activeBinId ?? 0;
  const vaContainsActive = activeBin > 0 &&
    groups[va.lowIdx]?.startBin <= activeBin &&
    groups[va.highIdx]?.endBin >= activeBin;

  const hvns = groups.filter((g) => g.classification === "HVN");
  const lvns = groups.filter((g) => g.classification === "LVN");

  const shape = classifyShape(groups, pocIdx);

  const totalBuy = swaps.filter((s) => s.direction === "BUY").reduce((s, sw) => s + sw.volumeUsd, 0);
  const totalSell = swaps.filter((s) => s.direction === "SELL").reduce((s, sw) => s + sw.volumeUsd, 0);
  const buyPct = totalVolumeUsd > 0 ? (totalBuy / totalVolumeUsd) * 100 : 50;
  const sellPct = totalVolumeUsd > 0 ? (totalSell / totalVolumeUsd) * 100 : 50;

  const topGroupPct = pocGroup?.pctOfTotal ?? 0;
  const volumeConcentration = Math.min(100, topGroupPct * 2);

  const pocDistFromActive = activeBin > 0 && pocGroup
    ? Math.abs(((pocGroup.startBin + pocGroup.endBin) / 2) - activeBin)
    : 0;

  const riskFlags: string[] = [];
  if (swaps.length < 5) riskFlags.push("LOW_SAMPLE: fewer than 5 swaps analyzed");
  if (!vaContainsActive) riskFlags.push("ACTIVE_OUTSIDE_VA: current price outside value area");
  if (lvns.length > hvns.length * 2) riskFlags.push("MANY_LVN_GAPS: multiple low-volume gaps increase slippage risk");
  if (shape === "BIMODAL") riskFlags.push("BIMODAL: volume split between two zones — mean-reversion likely");
  if (volumeConcentration > 70) riskFlags.push("HIGH_CONCENTRATION: volume heavily concentrated in narrow range");
  if (buyPct > 75) riskFlags.push("STRONG_BUY_PRESSURE: imbalanced buy flow may push price up");
  if (sellPct > 75) riskFlags.push("STRONG_SELL_PRESSURE: imbalanced sell flow may push price down");

  let lpGuidance: string;
  if (swaps.length < 3) {
    lpGuidance = "Insufficient swap data — wait for more on-chain activity before positioning.";
  } else if (shape === "CONCENTRATED" && vaContainsActive) {
    lpGuidance = "Volume concentrated near active bin — tight range LP captures most fees. Monitor for breakout.";
  } else if (shape === "BIMODAL") {
    lpGuidance = "Bimodal volume suggests oscillating price. Consider wider range or split positions at each HVN.";
  } else if (!vaContainsActive) {
    lpGuidance = "Active bin outside Value Area — price has moved away from historical volume. Rebalance toward POC or wait for reversion.";
  } else if (shape === "FLAT") {
    lpGuidance = "Uniform volume distribution — no strong volume concentration. Wider LP range recommended.";
  } else {
    lpGuidance = "Volume profile suggests positioning LP range to cover the Value Area for optimal fee capture.";
  }

  const verdict = swaps.length < 3
    ? `Low data: only ${swaps.length} swaps. Volume profile unreliable.`
    : `${shapeIcon(shape)} ${shape} profile | POC at bins ${pocGroup?.label ?? "?"} (${fmtPct(topGroupPct)} of volume) | VA width: ${groups[va.highIdx]?.endBin - groups[va.lowIdx]?.startBin + 1} bins | ${hvns.length} HVN / ${lvns.length} LVN | Buy pressure: ${fmtPct(buyPct)}`;

  return {
    poolId: pool.poolId ?? 0,
    pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    feeBps: pool.feeBps ?? 30,
    activeBinId: activeBin,
    totalSwapsAnalyzed: swaps.length,
    totalVolumeUsd,
    uniqueBinsTraded: binMap.size,
    poc: {
      binGroup: pocGroup?.label ?? "N/A",
      volumeUsd: pocGroup?.volumeUsd ?? 0,
      pctOfTotal: topGroupPct,
      distanceFromActive: pocDistFromActive,
    },
    valueArea: {
      lowBin: groups[va.lowIdx]?.startBin ?? 0,
      highBin: groups[va.highIdx]?.endBin ?? 0,
      width: (groups[va.highIdx]?.endBin ?? 0) - (groups[va.lowIdx]?.startBin ?? 0) + 1,
      volumeUsd: va.volumeUsd,
      pctOfTotal: totalVolumeUsd > 0 ? (va.volumeUsd / totalVolumeUsd) * 100 : 0,
      containsActiveBin: vaContainsActive,
    },
    hvnCount: hvns.length,
    lvnCount: lvns.length,
    hvns,
    lvns,
    profileShape: shape,
    volumeConcentration,
    buyPressurePct: buyPct,
    sellPressurePct: sellPct,
    lpGuidance,
    riskFlags,
    verdict,
    binGroups: groups,
  };
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderProfile(a: VolumeProfileAnalysis, json: boolean): string {
  if (json) return JSON.stringify(a, null, 2);

  const lines: string[] = [];

  lines.push(`\n${"═".repeat(70)}`);
  lines.push(`  HODLMM VOLUME PROFILE — ${a.pair} (Pool #${a.poolId})`);
  lines.push(`${"═".repeat(70)}`);
  lines.push(`  TVL: ${fmtUsd(a.tvlUsd)}  |  Vol 24h: ${fmtUsd(a.volume24hUsd)}  |  Fee: ${a.feeBps} bps  |  Active Bin: ${a.activeBinId}`);
  lines.push(`  Swaps Analyzed: ${a.totalSwapsAnalyzed}  |  Volume Mapped: ${fmtUsd(a.totalVolumeUsd)}  |  Unique Bins: ${a.uniqueBinsTraded}`);
  lines.push(`${"─".repeat(70)}`);

  // POC + Value Area summary
  lines.push(`  📍 Point of Control (POC):`);
  lines.push(`     Bins ${a.poc.binGroup}  |  ${fmtUsd(a.poc.volumeUsd)} (${fmtPct(a.poc.pctOfTotal)} of total)  |  ${a.poc.distanceFromActive} bins from active`);
  lines.push(``);
  lines.push(`  📏 Value Area (${fmtPct(VALUE_AREA_PCT * 100, 0)} of volume):`);
  lines.push(`     Bins ${a.valueArea.lowBin}–${a.valueArea.highBin}  |  Width: ${a.valueArea.width} bins  |  ${fmtUsd(a.valueArea.volumeUsd)}`);
  lines.push(`     Active bin ${a.valueArea.containsActiveBin ? "✅ INSIDE" : "⚠️ OUTSIDE"} Value Area`);
  lines.push(``);

  // Profile shape
  lines.push(`  ${shapeIcon(a.profileShape)} Profile Shape: ${a.profileShape}  |  Concentration: ${fmtPct(a.volumeConcentration)}`);
  lines.push(`  Buy Pressure: ${fmtPct(a.buyPressurePct)}  |  Sell Pressure: ${fmtPct(a.sellPressurePct)}`);
  lines.push(`${"─".repeat(70)}`);

  // Volume histogram
  lines.push(`  VOLUME DISTRIBUTION:`);
  const maxPct = Math.max(...a.binGroups.map((g) => g.pctOfTotal), 1);
  for (const g of a.binGroups) {
    if (g.volumeUsd === 0) continue;
    const barLen = Math.round((g.pctOfTotal / maxPct) * 20);
    const bar = "█".repeat(Math.max(barLen, 1));
    const tag =
      g.classification === "HVN" ? " ← HVN" :
      g.classification === "LVN" ? " ← LVN" : "";
    const label = g.label.padStart(12);
    lines.push(`  ${label} | ${bar} ${fmtPct(g.pctOfTotal)} (${fmtUsd(g.volumeUsd)})${tag}`);
  }
  lines.push(``);

  // HVN / LVN details
  if (a.hvns.length > 0) {
    lines.push(`  🟢 High Volume Nodes (${a.hvnCount}):`);
    for (const h of a.hvns) {
      lines.push(`     Bins ${h.label}: ${fmtUsd(h.volumeUsd)} (${fmtPct(h.pctOfTotal)}) — ${h.swapCount} swaps`);
    }
    lines.push(``);
  }
  if (a.lvns.length > 0) {
    lines.push(`  🔴 Low Volume Nodes (${a.lvnCount}):`);
    for (const l of a.lvns.slice(0, 5)) {
      lines.push(`     Bins ${l.label}: ${fmtUsd(l.volumeUsd)} (${fmtPct(l.pctOfTotal)}) — ${l.swapCount} swaps`);
    }
    lines.push(``);
  }

  // LP Guidance
  lines.push(`${"─".repeat(70)}`);
  lines.push(`  💡 LP GUIDANCE: ${a.lpGuidance}`);
  lines.push(``);

  // Risk flags
  if (a.riskFlags.length > 0) {
    lines.push(`  ⚠️ Risk Flags:`);
    for (const f of a.riskFlags) {
      lines.push(`     • ${f}`);
    }
    lines.push(``);
  }

  // Verdict
  lines.push(`${"─".repeat(70)}`);
  lines.push(`  VERDICT: ${a.verdict}`);
  lines.push(`${"═".repeat(70)}\n`);

  return lines.join("\n");
}

function renderMultiSummary(analyses: VolumeProfileAnalysis[], json: boolean): string {
  if (json) return JSON.stringify(analyses, null, 2);

  const lines: string[] = [];
  lines.push(`\n${"═".repeat(78)}`);
  lines.push(`  HODLMM VOLUME PROFILE — MULTI-POOL SUMMARY`);
  lines.push(`${"═".repeat(78)}`);
  lines.push(`  ${"Pair".padEnd(16)} ${"Shape".padEnd(14)} ${"POC".padEnd(14)} ${"VA Width".padEnd(10)} ${"HVN".padEnd(5)} ${"LVN".padEnd(5)} ${"Buy%".padEnd(7)} Conc.`);
  lines.push(`  ${"─".repeat(74)}`);

  for (const a of analyses) {
    const pair = a.pair.padEnd(16);
    const shape = `${shapeIcon(a.profileShape)} ${a.profileShape}`.padEnd(14);
    const poc = a.poc.binGroup.padEnd(14);
    const vaW = `${a.valueArea.width} bins`.padEnd(10);
    const hvn = String(a.hvnCount).padEnd(5);
    const lvn = String(a.lvnCount).padEnd(5);
    const buy = fmtPct(a.buyPressurePct).padEnd(7);
    const conc = fmtPct(a.volumeConcentration);
    lines.push(`  ${pair} ${shape} ${poc} ${vaW} ${hvn} ${lvn} ${buy} ${conc}`);
  }

  lines.push(`${"═".repeat(78)}\n`);
  return lines.join("\n");
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-volume-profile")
  .description(
    "HODLMM Volume Profile — Maps trading volume distribution across DLMM " +
    "bin ranges. Identifies Point of Control (POC), Value Area, High/Low " +
    "Volume Nodes for LP positioning decisions."
  )
  .argument("[pool]", "Pool ID, pair name, or token symbol (e.g., 'STX-sBTC', '1')")
  .option("-j, --json", "Output as JSON", false)
  .option("-a, --all", "Analyze all DLMM pools with sufficient TVL", false)
  .option("-t, --top <n>", "Analyze top N pools by TVL", "0")
  .action(async (poolQuery: string | undefined, opts: any) => {
    try {
      const pools = await fetchPools();
      if (pools.length === 0) {
        console.log("No DLMM pools found with sufficient TVL.");
        return;
      }

      if (opts.all || parseInt(opts.top) > 0) {
        const sorted = [...pools].sort((a, b) => b.tvlUsd - a.tvlUsd);
        const limit = parseInt(opts.top) > 0 ? parseInt(opts.top) : sorted.length;
        const targets = sorted.slice(0, Math.min(limit, 10));

        console.log(`Analyzing volume profile for ${targets.length} DLMM pools...\n`);
        const results: VolumeProfileAnalysis[] = [];
        for (const pool of targets) {
          try {
            const analysis = await analyzePool(pool);
            results.push(analysis);
            if (!opts.json) {
              process.stdout.write(`  ✓ ${pool.token0Symbol}-${pool.token1Symbol}\n`);
            }
          } catch (e: any) {
            if (!opts.json) {
              process.stdout.write(`  ✗ ${pool.token0Symbol}-${pool.token1Symbol}: ${e.message}\n`);
            }
          }
          await sleep(500);
        }

        if (results.length > 0) {
          console.log(renderMultiSummary(results, opts.json));
          if (!opts.json) {
            for (const r of results) {
              console.log(renderProfile(r, false));
            }
          }
        }
      } else {
        if (!poolQuery) {
          console.log("Usage: hodlmm-volume-profile <pool> [options]");
          console.log("\nAvailable DLMM pools:");
          const sorted = [...pools].sort((a, b) => b.tvlUsd - a.tvlUsd);
          for (const p of sorted.slice(0, 15)) {
            console.log(`  Pool #${p.poolId ?? "?"} | ${p.token0Symbol}-${p.token1Symbol} | TVL: ${fmtUsd(p.tvlUsd)}`);
          }
          return;
        }

        const pool = findPool(poolQuery, pools);
        if (!pool) {
          console.log(`Pool not found: "${poolQuery}"`);
          console.log("\nAvailable DLMM pools:");
          for (const p of pools.slice(0, 10)) {
            console.log(`  Pool #${p.poolId ?? "?"} | ${p.token0Symbol}-${p.token1Symbol}`);
          }
          return;
        }

        console.log(`Analyzing volume profile for ${pool.token0Symbol}-${pool.token1Symbol}...`);
        const analysis = await analyzePool(pool);
        console.log(renderProfile(analysis, opts.json));
      }
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });

program.parse();
