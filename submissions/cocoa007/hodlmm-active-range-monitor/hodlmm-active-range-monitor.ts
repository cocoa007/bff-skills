#!/usr/bin/env bun
/**
 * hodlmm-active-range-monitor.ts
 *
 * HODLMM Active Range Monitor — Tracks the active trading range boundaries,
 * measures range utilization and width, detects edge proximity, and signals
 * when LP positions may need adjustment.
 *
 * Key metrics:
 *  - Active range boundaries (lower/upper bin with meaningful liquidity)
 *  - Range width and utilization efficiency
 *  - Edge proximity alerts (active bin near range boundary)
 *  - Liquidity density profile across the range
 *  - Range symmetry score (balance of liquidity above/below active bin)
 *  - Position adjustment signals: HOLD / MONITOR / WIDEN / SHIFT / EMERGENCY
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 62).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 40;

// Edge proximity thresholds (fraction of range width)
const EDGE_DANGER = 0.10;  // within 10% of boundary → EMERGENCY
const EDGE_WARNING = 0.20; // within 20% → SHIFT
const EDGE_CAUTION = 0.35; // within 35% → MONITOR

// Range utilization thresholds
const LIQ_THRESHOLD_USD = 0.01; // minimum USD to count as "has liquidity"

// ── Types ─────────────────────────────────────────────────────────────────────

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

type Signal = "HOLD" | "MONITOR" | "WIDEN" | "SHIFT" | "EMERGENCY";

interface BinData {
  binId: number;
  reserveX: number;
  reserveY: number;
  totalUsd: number;
  shareOfTotal: number;
  distanceFromActive: number;
}

interface RangeZone {
  label: string;
  lower: number;
  upper: number;
  bins: number;
  liquidityUsd: number;
  pctOfTotal: number;
}

interface RangeAnalysis {
  pool: string;
  pair: string;
  tvlUsd: number;
  activeBinId: number;
  binsScanned: number;
  binsWithLiquidity: number;
  range: {
    lower: number;
    upper: number;
    width: number;
  };
  activeBinPosition: {
    distFromLower: number;
    distFromUpper: number;
    pctFromLower: number;
    pctFromUpper: number;
  };
  utilization: {
    activeBins: number;
    totalBins: number;
    pct: number;
    densityScore: number;
  };
  symmetry: {
    belowActiveLiq: number;
    aboveActiveLiq: number;
    ratio: number;
    score: number;
    skewDirection: "BALANCED" | "BID-HEAVY" | "ASK-HEAVY";
  };
  zones: RangeZone[];
  signal: Signal;
  signalReason: string;
  verdict: string;
  bins: BinData[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (!r.ok) {
        if (r.status === 429 && i < retries) { await sleep(2000 * (i + 1)); continue; }
        throw new Error(`HTTP ${r.status} for ${url}`);
      }
      return r.json();
    } catch (e: any) {
      if (i === retries) throw e;
      await sleep(1000 * (i + 1));
    }
  }
}

function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function barChart(value: number, maxValue: number, width: number = 20): string {
  if (maxValue === 0) return "░".repeat(width);
  const filled = Math.round((value / maxValue) * width);
  return "█".repeat(Math.min(filled, width)) + "░".repeat(Math.max(width - filled, 0));
}

function signalColor(signal: Signal): string {
  switch (signal) {
    case "HOLD": return "🟢";
    case "MONITOR": return "🔵";
    case "WIDEN": return "🟡";
    case "SHIFT": return "🟠";
    case "EMERGENCY": return "🔴";
  }
}

// ── Data Fetching ─────────────────────────────────────────────────────────────

async function fetchPools(): Promise<AppPool[]> {
  const data = await fetchJson(`${BFF_APP_BASE}/hodlmm/pools`);
  const pools = Array.isArray(data) ? data : data?.data ?? data?.pools ?? [];
  return pools.filter((p: any) => (p.tvlUsd ?? 0) >= MIN_TVL_USD);
}

function findPool(query: string, pools: AppPool[]): AppPool | null {
  const q = query.toLowerCase();
  return (
    pools.find((p) => p.id?.toLowerCase() === q) ??
    pools.find((p) => {
      const pair = `${p.token0Symbol}-${p.token1Symbol}`.toLowerCase();
      return pair.includes(q) || q.includes(pair);
    }) ??
    pools.find((p) => {
      const sym = `${p.token0Symbol}${p.token1Symbol}`.toLowerCase();
      return sym.includes(q) || q.includes(sym);
    }) ??
    null
  );
}

async function fetchActiveBinId(poolId: number): Promise<number> {
  const url =
    `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-active-bin-id`;
  const body = {
    sender: SENDER,
    arguments: [`0x0100000000000000000000000000000${poolId.toString(16).padStart(3, "0")}`],
  };
  const resp = await fetchJson(url + `?sender=${SENDER}&arguments[]=${body.arguments[0]}`);
  if (resp?.result) {
    const match = resp.result.match(/u(\d+)/);
    if (match) return parseInt(match[1]);
  }
  return 8388608;
}

async function fetchBinReserves(
  poolId: number,
  binId: number,
): Promise<{ reserveX: number; reserveY: number }> {
  const poolHex = `0x0100000000000000000000000000000${poolId.toString(16).padStart(3, "0")}`;
  const binHex = `0x0100000000000000000000000000${binId.toString(16).padStart(6, "0")}`;
  const url =
    `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-bin` +
    `?sender=${SENDER}&arguments[]=${poolHex}&arguments[]=${binHex}`;

  try {
    const resp = await fetchJson(url);
    if (resp?.result) {
      const rxMatch = resp.result.match(/reserve-x\s+u(\d+)/);
      const ryMatch = resp.result.match(/reserve-y\s+u(\d+)/);
      return {
        reserveX: rxMatch ? parseInt(rxMatch[1]) : 0,
        reserveY: ryMatch ? parseInt(ryMatch[1]) : 0,
      };
    }
  } catch {}
  return { reserveX: 0, reserveY: 0 };
}

async function scanBins(
  pool: AppPool,
  activeBinId: number,
  radius: number
): Promise<BinData[]> {
  const bins: BinData[] = [];
  const dec0 = pool.token0Decimals || 6;
  const dec1 = pool.token1Decimals || 6;
  const p0 = pool.token0PriceUsd || 0;
  const p1 = pool.token1PriceUsd || 0;
  const poolId = pool.poolId ?? 1;

  const startBin = activeBinId - radius;
  const endBin = activeBinId + radius;

  const batchSize = 5;
  for (let i = startBin; i <= endBin; i += batchSize) {
    const batch = Array.from(
      { length: Math.min(batchSize, endBin - i + 1) },
      (_, k) => i + k
    );

    const results = await Promise.all(
      batch.map((binId) => fetchBinReserves(poolId, binId))
    );

    for (let k = 0; k < batch.length; k++) {
      const { reserveX, reserveY } = results[k];
      const rx = reserveX / 10 ** dec0;
      const ry = reserveY / 10 ** dec1;
      const totalUsd = rx * p0 + ry * p1;

      bins.push({
        binId: batch[k],
        reserveX: rx,
        reserveY: ry,
        totalUsd,
        shareOfTotal: 0,
        distanceFromActive: Math.abs(batch[k] - activeBinId),
      });
    }

    if (i + batchSize <= endBin) await sleep(200);
  }

  const totalLiq = bins.reduce((s, b) => s + b.totalUsd, 0);
  for (const b of bins) {
    b.shareOfTotal = totalLiq > 0 ? b.totalUsd / totalLiq : 0;
  }

  return bins;
}

// ── Analysis ────────────────────────────────────────────────────────────────

function findRange(bins: BinData[]): { lower: number; upper: number; width: number } {
  const withLiq = bins.filter((b) => b.totalUsd >= LIQ_THRESHOLD_USD);
  if (withLiq.length === 0) return { lower: 0, upper: 0, width: 0 };

  const sorted = withLiq.sort((a, b) => a.binId - b.binId);
  return {
    lower: sorted[0].binId,
    upper: sorted[sorted.length - 1].binId,
    width: sorted[sorted.length - 1].binId - sorted[0].binId + 1,
  };
}

function computeActiveBinPosition(
  activeBinId: number,
  range: { lower: number; upper: number; width: number }
) {
  const distFromLower = activeBinId - range.lower;
  const distFromUpper = range.upper - activeBinId;
  const width = range.width || 1;

  return {
    distFromLower,
    distFromUpper,
    pctFromLower: distFromLower / width,
    pctFromUpper: distFromUpper / width,
  };
}

function computeUtilization(bins: BinData[], range: { lower: number; upper: number }) {
  const inRange = bins.filter((b) => b.binId >= range.lower && b.binId <= range.upper);
  const activeBins = inRange.filter((b) => b.totalUsd >= LIQ_THRESHOLD_USD);
  const totalBins = inRange.length || 1;

  const pct = activeBins.length / totalBins;

  // Density score: how evenly distributed is liquidity within the range
  const shares = activeBins.map((b) => b.shareOfTotal);
  const meanShare = shares.length > 0 ? shares.reduce((s, v) => s + v, 0) / shares.length : 0;
  const variance = shares.length > 0
    ? shares.reduce((s, v) => s + (v - meanShare) ** 2, 0) / shares.length
    : 0;
  const cv = meanShare > 0 ? Math.sqrt(variance) / meanShare : 0;
  const densityScore = Math.max(0, Math.min(100, 100 * (1 - cv / 2)));

  return { activeBins: activeBins.length, totalBins, pct, densityScore };
}

function computeSymmetry(bins: BinData[], activeBinId: number) {
  const below = bins.filter((b) => b.binId < activeBinId);
  const above = bins.filter((b) => b.binId > activeBinId);

  const belowLiq = below.reduce((s, b) => s + b.totalUsd, 0);
  const aboveLiq = above.reduce((s, b) => s + b.totalUsd, 0);
  const total = belowLiq + aboveLiq;

  const ratio = total > 0 ? belowLiq / total : 0.5;
  const deviation = Math.abs(ratio - 0.5);
  const score = Math.max(0, Math.min(100, 100 * (1 - deviation * 2)));

  let skewDirection: "BALANCED" | "BID-HEAVY" | "ASK-HEAVY";
  if (deviation < 0.1) skewDirection = "BALANCED";
  else if (ratio > 0.5) skewDirection = "BID-HEAVY";
  else skewDirection = "ASK-HEAVY";

  return { belowActiveLiq: belowLiq, aboveActiveLiq: aboveLiq, ratio, score, skewDirection };
}

function computeZones(
  bins: BinData[],
  activeBinId: number,
  range: { lower: number; upper: number; width: number }
): RangeZone[] {
  if (range.width === 0) return [];

  const quarterWidth = Math.max(1, Math.floor(range.width / 4));
  const zones: RangeZone[] = [];

  const zoneDefs = [
    { label: "DEEP-BID", lower: range.lower, upper: range.lower + quarterWidth - 1 },
    { label: "NEAR-BID", lower: range.lower + quarterWidth, upper: activeBinId - 1 },
    { label: "ACTIVE", lower: activeBinId, upper: activeBinId },
    { label: "NEAR-ASK", lower: activeBinId + 1, upper: range.upper - quarterWidth },
    { label: "DEEP-ASK", lower: range.upper - quarterWidth + 1, upper: range.upper },
  ];

  const totalLiq = bins.reduce((s, b) => s + b.totalUsd, 0);

  for (const def of zoneDefs) {
    const zoneBins = bins.filter((b) => b.binId >= def.lower && b.binId <= def.upper);
    const liq = zoneBins.reduce((s, b) => s + b.totalUsd, 0);
    zones.push({
      label: def.label,
      lower: def.lower,
      upper: def.upper,
      bins: zoneBins.length,
      liquidityUsd: liq,
      pctOfTotal: totalLiq > 0 ? liq / totalLiq : 0,
    });
  }

  return zones;
}

function determineSignal(
  position: { pctFromLower: number; pctFromUpper: number },
  utilization: { pct: number; densityScore: number },
  symmetry: { score: number; skewDirection: string },
  rangeWidth: number
): { signal: Signal; reason: string } {
  const nearestEdge = Math.min(position.pctFromLower, position.pctFromUpper);
  const edgeSide = position.pctFromLower < position.pctFromUpper ? "lower" : "upper";

  if (nearestEdge <= EDGE_DANGER) {
    return {
      signal: "EMERGENCY",
      reason: `Active bin is ${fmtPct(nearestEdge)} from ${edgeSide} boundary — price is about to exit the range. Immediate rebalancing needed.`,
    };
  }

  if (nearestEdge <= EDGE_WARNING) {
    return {
      signal: "SHIFT",
      reason: `Active bin is ${fmtPct(nearestEdge)} from ${edgeSide} boundary — position is drifting. Consider shifting the range center toward current price.`,
    };
  }

  if (rangeWidth < 5) {
    return {
      signal: "WIDEN",
      reason: `Range is extremely narrow (${rangeWidth} bins). High IL risk on any price movement. Consider widening the range.`,
    };
  }

  if (nearestEdge <= EDGE_CAUTION) {
    return {
      signal: "MONITOR",
      reason: `Active bin is ${fmtPct(nearestEdge)} from ${edgeSide} boundary — within caution zone. Monitor price direction closely.`,
    };
  }

  if (utilization.pct < 0.3) {
    return {
      signal: "WIDEN",
      reason: `Low utilization (${fmtPct(utilization.pct)}) — most bins in range are empty. Range may be wider than needed, concentrating liquidity could improve fee capture.`,
    };
  }

  if (symmetry.score < 30) {
    return {
      signal: "MONITOR",
      reason: `Highly asymmetric liquidity (${symmetry.skewDirection}, symmetry ${symmetry.score.toFixed(0)}/100). One side of the range is significantly underweight.`,
    };
  }

  return {
    signal: "HOLD",
    reason: `Active bin is well-centered (${fmtPct(position.pctFromLower)} from lower, ${fmtPct(position.pctFromUpper)} from upper). Range utilization and symmetry are healthy.`,
  };
}

function generateVerdict(analysis: RangeAnalysis): string {
  const lines: string[] = [];
  const { range, activeBinPosition: pos, utilization, symmetry } = analysis;

  lines.push(
    `${analysis.pair} active range spans ${range.width} bins ` +
    `(${range.lower}–${range.upper}), with ${utilization.activeBins} bins carrying liquidity ` +
    `(${fmtPct(utilization.pct)} utilization).`
  );

  if (pos.pctFromLower < 0.3 || pos.pctFromUpper < 0.3) {
    const side = pos.pctFromLower < pos.pctFromUpper ? "lower" : "upper";
    lines.push(
      `Active bin sits close to the ${side} edge — only ${fmtPct(Math.min(pos.pctFromLower, pos.pctFromUpper))} buffer before exiting range.`
    );
  } else {
    lines.push(
      `Active bin is well-centered with ${fmtPct(pos.pctFromLower)} buffer below and ${fmtPct(pos.pctFromUpper)} above.`
    );
  }

  if (symmetry.skewDirection !== "BALANCED") {
    lines.push(
      `Liquidity is ${symmetry.skewDirection.toLowerCase()} (${fmtPct(symmetry.ratio)} below active bin).`
    );
  }

  lines.push(`Signal: ${analysis.signal} — ${analysis.signalReason}`);

  return lines.join(" ");
}

// ── Display ─────────────────────────────────────────────────────────────────

function displayAnalysis(analysis: RangeAnalysis, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(analysis, null, 2));
    return;
  }

  console.log(`\n${"═".repeat(72)}`);
  console.log(`  HODLMM ACTIVE RANGE MONITOR`);
  console.log(`${"═".repeat(72)}`);

  console.log(`\n  Pool:             ${analysis.pool}`);
  console.log(`  Pair:             ${analysis.pair}`);
  console.log(`  TVL:              ${fmtUsd(analysis.tvlUsd)}`);
  console.log(`  Active Bin:       ${analysis.activeBinId}`);
  console.log(`  Bins Scanned:     ${analysis.binsScanned}`);
  console.log(`  Bins w/ Liq:      ${analysis.binsWithLiquidity}`);

  // Range info
  console.log(`\n${"─".repeat(72)}`);
  console.log(`  RANGE BOUNDARIES`);
  console.log(`${"─".repeat(72)}`);
  console.log(`  Lower Bound:      Bin ${analysis.range.lower}`);
  console.log(`  Upper Bound:      Bin ${analysis.range.upper}`);
  console.log(`  Width:            ${analysis.range.width} bins`);

  // Position visualization
  const pos = analysis.activeBinPosition;
  const rangeBar = (width: number) => {
    const totalChars = width;
    const activePos = Math.round(pos.pctFromLower * totalChars);
    let bar = "";
    for (let i = 0; i < totalChars; i++) {
      if (i === activePos) bar += "▼";
      else if (i < activePos) bar += "─";
      else bar += "─";
    }
    return bar;
  };

  console.log(`\n  Position:         [${rangeBar(40)}]`);
  console.log(`  From Lower:       ${pos.distFromLower} bins (${fmtPct(pos.pctFromLower)})`);
  console.log(`  From Upper:       ${pos.distFromUpper} bins (${fmtPct(pos.pctFromUpper)})`);

  // Utilization
  console.log(`\n${"─".repeat(72)}`);
  console.log(`  UTILIZATION`);
  console.log(`${"─".repeat(72)}`);
  console.log(`  Active Bins:      ${analysis.utilization.activeBins} / ${analysis.utilization.totalBins} (${fmtPct(analysis.utilization.pct)})`);
  console.log(`  Density Score:    ${analysis.utilization.densityScore.toFixed(0)}/100`);

  // Symmetry
  console.log(`\n${"─".repeat(72)}`);
  console.log(`  SYMMETRY`);
  console.log(`${"─".repeat(72)}`);
  console.log(`  Below Active:     ${fmtUsd(analysis.symmetry.belowActiveLiq)}`);
  console.log(`  Above Active:     ${fmtUsd(analysis.symmetry.aboveActiveLiq)}`);
  console.log(`  Ratio:            ${fmtPct(analysis.symmetry.ratio)} below`);
  console.log(`  Score:            ${analysis.symmetry.score.toFixed(0)}/100`);
  console.log(`  Skew:             ${analysis.symmetry.skewDirection}`);

  // Zone breakdown
  console.log(`\n${"─".repeat(72)}`);
  console.log(`  ZONE BREAKDOWN`);
  console.log(`${"─".repeat(72)}`);

  const maxZoneLiq = Math.max(...analysis.zones.map((z) => z.liquidityUsd));
  for (const zone of analysis.zones) {
    const bar = barChart(zone.liquidityUsd, maxZoneLiq, 18);
    console.log(
      `  ${zone.label.padEnd(10)} │ ${bar} │ ${fmtUsd(zone.liquidityUsd).padStart(10)} │ ${fmtPct(zone.pctOfTotal).padStart(6)} │ ${zone.bins} bins`
    );
  }

  // Range heatmap
  console.log(`\n${"─".repeat(72)}`);
  console.log(`  RANGE HEATMAP (top 40 bins by liquidity)`);
  console.log(`${"─".repeat(72)}`);

  const sorted = [...analysis.bins]
    .filter((b) => b.totalUsd >= LIQ_THRESHOLD_USD)
    .sort((a, b) => a.binId - b.binId)
    .slice(0, 40);

  const maxUsd = Math.max(...sorted.map((b) => b.totalUsd));

  for (const bin of sorted) {
    const marker = bin.binId === analysis.activeBinId ? "▶" : " ";
    const bar = barChart(bin.totalUsd, maxUsd, 22);
    const dist = bin.distanceFromActive === 0 ? " [ACTIVE]" :
      ` ${bin.binId < analysis.activeBinId ? "↓" : "↑"}${bin.distanceFromActive}`;
    console.log(
      `  ${marker} Bin ${String(bin.binId).padStart(8)} │ ${bar} │ ${fmtUsd(bin.totalUsd).padStart(10)}${dist}`
    );
  }

  // Signal
  console.log(`\n${"─".repeat(72)}`);
  console.log(`  SIGNAL`);
  console.log(`${"─".repeat(72)}`);
  console.log(`  ${signalColor(analysis.signal)} ${analysis.signal}: ${analysis.signalReason}`);

  console.log(`\n${"─".repeat(72)}`);
  console.log(`  VERDICT`);
  console.log(`${"─".repeat(72)}`);
  console.log(`  ${analysis.verdict}`);
  console.log(`\n${"═".repeat(72)}\n`);
}

// ── Scan All Pools ──────────────────────────────────────────────────────────

async function displayPoolRankings(pools: AppPool[], json: boolean): Promise<void> {
  console.log("\nScanning active ranges across pools...\n");

  const results: {
    pair: string;
    tvlUsd: number;
    rangeWidth: number;
    utilPct: number;
    symmetryScore: number;
    signal: Signal;
    edgeDist: number;
  }[] = [];

  for (const pool of pools.slice(0, 15)) {
    try {
      const activeBinId = pool.activeBinId ?? (await fetchActiveBinId(pool.poolId ?? 1));
      const bins = await scanBins(pool, activeBinId, 25);
      const range = findRange(bins);
      const pos = computeActiveBinPosition(activeBinId, range);
      const util = computeUtilization(bins, range);
      const sym = computeSymmetry(bins, activeBinId);
      const { signal } = determineSignal(pos, util, sym, range.width);

      results.push({
        pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
        tvlUsd: pool.tvlUsd,
        rangeWidth: range.width,
        utilPct: util.pct,
        symmetryScore: sym.score,
        signal,
        edgeDist: Math.min(pos.pctFromLower, pos.pctFromUpper),
      });
    } catch {}

    await sleep(500);
  }

  if (json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // Sort: emergency/shift first, then by edge distance
  const signalPriority: Record<Signal, number> = { EMERGENCY: 0, SHIFT: 1, WIDEN: 2, MONITOR: 3, HOLD: 4 };
  results.sort((a, b) => signalPriority[a.signal] - signalPriority[b.signal] || a.edgeDist - b.edgeDist);

  console.log(`${"═".repeat(82)}`);
  console.log(`  HODLMM ACTIVE RANGE MONITOR — ALL POOLS`);
  console.log(`${"═".repeat(82)}`);
  console.log(
    `  ${"Pair".padEnd(18)} ${"TVL".padStart(10)} ${"Width".padStart(6)} ${"Util%".padStart(7)} ${"Sym".padStart(5)} ${"Edge%".padStart(7)} ${"Signal".padStart(12)}`
  );
  console.log(`  ${"─".repeat(72)}`);

  for (const r of results) {
    console.log(
      `  ${r.pair.padEnd(18)} ${fmtUsd(r.tvlUsd).padStart(10)} ${String(r.rangeWidth).padStart(6)} ` +
      `${fmtPct(r.utilPct).padStart(7)} ${r.symmetryScore.toFixed(0).padStart(5)} ` +
      `${fmtPct(r.edgeDist).padStart(7)} ${signalColor(r.signal)} ${r.signal.padStart(10)}`
    );
  }

  const alerts = results.filter((r) => r.signal === "EMERGENCY" || r.signal === "SHIFT");
  if (alerts.length > 0) {
    console.log(`\n  ⚠ ${alerts.length} pool(s) need attention (EMERGENCY/SHIFT signal)`);
  } else {
    console.log(`\n  All pools within healthy range boundaries.`);
  }
  console.log(`${"═".repeat(82)}\n`);
}

// ── Main ────────────────────────────────────────────────────────────────────

const program = new Command();
program
  .name("hodlmm-active-range-monitor")
  .description(
    "Active trading range monitor for HODLMM pools. Tracks range boundaries, " +
    "measures utilization and symmetry, detects edge proximity, and signals " +
    "when LP positions need adjustment (HOLD/MONITOR/WIDEN/SHIFT/EMERGENCY)."
  )
  .argument("[pool]", "Pool ID or token pair (e.g. STX-sBTC). Omit to scan all pools.")
  .option("--radius <n>", "Number of bins to scan on each side of active bin", "40")
  .option("--json", "Output in JSON format", false)
  .action(async (poolQuery?: string) => {
    const opts = program.opts();
    const radius = parseInt(opts.radius) || BIN_SCAN_RADIUS;
    const jsonOutput = opts.json;

    try {
      const pools = await fetchPools();
      if (pools.length === 0) {
        console.error("No HODLMM pools found with sufficient TVL.");
        process.exit(1);
      }

      if (!poolQuery) {
        await displayPoolRankings(pools, jsonOutput);
        return;
      }

      const pool = findPool(poolQuery, pools);
      if (!pool) {
        console.error(`Pool "${poolQuery}" not found. Available pools:`);
        for (const p of pools.slice(0, 10)) {
          console.error(`  ${p.token0Symbol}-${p.token1Symbol} (${fmtUsd(p.tvlUsd)})`);
        }
        process.exit(1);
      }

      const pair = `${pool.token0Symbol}-${pool.token1Symbol}`;
      console.log(`\nMonitoring active range for ${pair}...`);

      const activeBinId = pool.activeBinId ?? (await fetchActiveBinId(pool.poolId ?? 1));
      const bins = await scanBins(pool, activeBinId, radius);

      const range = findRange(bins);
      const position = computeActiveBinPosition(activeBinId, range);
      const utilization = computeUtilization(bins, range);
      const symmetry = computeSymmetry(bins, activeBinId);
      const zones = computeZones(bins, activeBinId, range);
      const { signal, reason } = determineSignal(position, utilization, symmetry, range.width);

      const analysis: RangeAnalysis = {
        pool: pool.id,
        pair,
        tvlUsd: pool.tvlUsd,
        activeBinId,
        binsScanned: bins.length,
        binsWithLiquidity: bins.filter((b) => b.totalUsd >= LIQ_THRESHOLD_USD).length,
        range,
        activeBinPosition: position,
        utilization,
        symmetry,
        zones,
        signal,
        signalReason: reason,
        verdict: "",
        bins,
      };

      analysis.verdict = generateVerdict(analysis);
      displayAnalysis(analysis, jsonOutput);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
