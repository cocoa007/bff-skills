#!/usr/bin/env bun
/**
 * hodlmm-bin-congestion.ts
 *
 * HODLMM Bin Congestion Analyzer — Detects overcrowded bins where too many
 * LPs compete for limited fee revenue, resulting in diluted returns per
 * dollar of liquidity. Finds the sweet spot between proximity to active
 * bin (fee generation) and capital competition (congestion).
 *
 * Metrics:
 *  1. Congestion score: TVL density vs fee opportunity (0-100)
 *  2. Fee yield density: estimated fee capture per $1 of LP capital
 *  3. Crowding ratio: bin TVL relative to pool average
 *  4. Efficiency frontier: bins offering best fee/congestion tradeoff
 *  5. Congestion zones: EMPTY / LIGHT / MODERATE / HEAVY / GRIDLOCK
 *  6. Optimal entry bins: uncongested bins near active with fee potential
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 83).
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 25;

type CongestionZone = "EMPTY" | "LIGHT" | "MODERATE" | "HEAVY" | "GRIDLOCK";

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

interface BinReserves {
  binId: number;
  reserveX: number;
  reserveY: number;
  reserveXUsd: number;
  reserveYUsd: number;
  totalUsd: number;
}

interface BinCongestion {
  binId: number;
  distanceFromActive: number;
  totalUsd: number;
  feeProximityWeight: number;
  estimatedDailyFeesUsd: number;
  feeYieldPerDollar: number;
  crowdingRatio: number;
  congestionScore: number;
  zone: CongestionZone;
  efficiencyRank: number;
  isOptimalEntry: boolean;
}

interface CongestionAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  estimatedDailyPoolFeesUsd: number;
  avgBinTvlUsd: number;
  medianBinTvlUsd: number;
  avgCongestionScore: number;
  zoneCounts: Record<CongestionZone, number>;
  zoneTvl: Record<CongestionZone, number>;
  gridlockBinsPct: number;
  lightBinsPct: number;
  congestionGini: number;
  optimalEntryBins: BinCongestion[];
  mostCongestedBins: BinCongestion[];
  leastCongestedBins: BinCongestion[];
  efficiencyFrontier: BinCongestion[];
  bins: BinCongestion[];
  recommendation: string;
  asciiChart: string;
}

// -- Helpers ------------------------------------------------------------------

async function fetchJson(url: string): Promise<any> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`);
  return resp.json();
}

async function callReadOnly(fn: string, args: string[]): Promise<any> {
  const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/${fn}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sender: SENDER, arguments: args }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} calling ${fn}`);
  return resp.json();
}

function cvUint(n: number): string {
  const hex = n.toString(16).padStart(32, "0");
  return `0x01${hex}`;
}

function parseUintResult(hex: string): number {
  if (hex.startsWith("0x")) hex = hex.slice(2);
  if (hex.startsWith("00")) hex = hex.slice(2);
  const tag = hex.slice(0, 2);
  if (tag === "01") return parseInt(hex.slice(2), 16);
  return 0;
}

function parseTupleReserves(hex: string): { reserveX: number; reserveY: number } {
  const fallback = { reserveX: 0, reserveY: 0 };
  if (!hex || hex.length < 10) return fallback;
  if (hex.startsWith("0x")) hex = hex.slice(2);
  try {
    let pos = 0;
    if (hex.slice(pos, pos + 2) === "00") pos += 2;
    const tag = hex.slice(pos, pos + 2);
    pos += 2;
    if (tag !== "0c") return fallback;
    const numKeys = parseInt(hex.slice(pos, pos + 8), 16);
    pos += 8;
    const values: Record<string, number> = {};
    for (let i = 0; i < numKeys; i++) {
      const nameLen = parseInt(hex.slice(pos, pos + 2), 16);
      pos += 2;
      const nameBytes = hex.slice(pos, pos + nameLen * 2);
      pos += nameLen * 2;
      const name = Buffer.from(nameBytes, "hex").toString("ascii");
      const valTag = hex.slice(pos, pos + 2);
      pos += 2;
      if (valTag === "01") {
        const raw = hex.slice(pos, pos + 32);
        pos += 32;
        values[name] = parseInt(raw, 16);
      } else {
        break;
      }
    }
    return {
      reserveX: values["reserve-x"] ?? values["reserveX"] ?? 0,
      reserveY: values["reserve-y"] ?? values["reserveY"] ?? 0,
    };
  } catch {
    return fallback;
  }
}

function fmtUsd(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 1) return v.toFixed(2);
  if (v >= 0.001) return v.toFixed(4);
  return v.toFixed(6);
}

function fmtPct(v: number): string {
  return v.toFixed(1) + "%";
}

// -- Pool discovery -----------------------------------------------------------

async function discoverPools(): Promise<AppPool[]> {
  const data = await fetchJson(`${BFF_APP_BASE}/pools`);
  const pools: any[] = data.results ?? data.pools ?? data ?? [];
  return pools
    .filter((p: any) => {
      const tvl = Number(p.tvlUsd ?? p.tvl ?? 0);
      return tvl >= MIN_TVL_USD && p.poolId != null;
    })
    .map((p: any) => ({
      id: p.id ?? `${p.token0Symbol}-${p.token1Symbol}`,
      token0Symbol: p.token0Symbol ?? "?",
      token1Symbol: p.token1Symbol ?? "?",
      tvlUsd: Number(p.tvlUsd ?? p.tvl ?? 0),
      volume24hUsd: Number(p.volume24hUsd ?? p.volume24h ?? 0),
      poolId: Number(p.poolId),
      token0Decimals: Number(p.token0Decimals ?? 8),
      token1Decimals: Number(p.token1Decimals ?? 6),
      token0PriceUsd: Number(p.token0PriceUsd ?? 0),
      token1PriceUsd: Number(p.token1PriceUsd ?? 0),
      activeBinId: p.activeBinId != null ? Number(p.activeBinId) : undefined,
      feeBps: p.feeBps != null ? Number(p.feeBps) : undefined,
    }));
}

// -- On-chain reads -----------------------------------------------------------

async function getActiveBin(poolId: number): Promise<number> {
  const res = await callReadOnly("get-active-bin-id", [cvUint(poolId)]);
  return parseUintResult(res.result ?? "");
}

async function getBinReserves(
  poolId: number,
  binId: number,
  p: AppPool
): Promise<BinReserves> {
  const res = await callReadOnly("get-bin-reserves", [
    cvUint(poolId),
    cvUint(binId),
  ]);
  const hex = res.result ?? "";
  const { reserveX, reserveY } = parseTupleReserves(hex);

  const rx = reserveX / 10 ** p.token0Decimals;
  const ry = reserveY / 10 ** p.token1Decimals;
  const rxUsd = rx * p.token0PriceUsd;
  const ryUsd = ry * p.token1PriceUsd;

  return {
    binId,
    reserveX: rx,
    reserveY: ry,
    reserveXUsd: rxUsd,
    reserveYUsd: ryUsd,
    totalUsd: rxUsd + ryUsd,
  };
}

async function scanBins(
  poolId: number,
  activeBin: number,
  pool: AppPool,
  radius: number
): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const start = activeBin - radius;
  const end = activeBin + radius;

  const batch = 5;
  for (let i = start; i <= end; i += batch) {
    const chunk = [];
    for (let j = i; j < Math.min(i + batch, end + 1); j++) {
      chunk.push(getBinReserves(poolId, j, pool));
    }
    const results = await Promise.all(chunk);
    bins.push(...results);
  }
  return bins.sort((a, b) => a.binId - b.binId);
}

// -- Congestion analysis ------------------------------------------------------

function feeProximityWeight(distanceFromActive: number): number {
  const lambda = Math.LN2 / 5;
  return Math.exp(-lambda * Math.abs(distanceFromActive));
}

function classifyZone(congestionScore: number): CongestionZone {
  if (congestionScore >= 80) return "GRIDLOCK";
  if (congestionScore >= 55) return "HEAVY";
  if (congestionScore >= 30) return "MODERATE";
  if (congestionScore >= 5) return "LIGHT";
  return "EMPTY";
}

function computeGini(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  const total = sorted.reduce((s, v) => s + v, 0);
  if (total <= 0) return 0;
  let giniNumerator = 0;
  for (let i = 0; i < n; i++) {
    giniNumerator += (2 * (i + 1) - n - 1) * sorted[i];
  }
  return giniNumerator / (n * total);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function analyzeCongestion(
  pool: AppPool,
  activeBinId: number,
  rawBins: BinReserves[]
): CongestionAnalysis {
  const populated = rawBins.filter((b) => b.totalUsd > 0.01);
  const scannedTvl = populated.reduce((s, b) => s + b.totalUsd, 0);
  const avgBinTvl = populated.length > 0 ? scannedTvl / populated.length : 0;
  const medianBinTvl = median(populated.map((b) => b.totalUsd));

  const feeBps = pool.feeBps ?? 30;
  const dailyPoolFees = pool.volume24hUsd * (feeBps / 10000);

  // Compute fee proximity weights for all populated bins
  let totalFeeWeight = 0;
  const feeWeights = populated.map((b) => {
    const w = feeProximityWeight(b.binId - activeBinId);
    totalFeeWeight += w;
    return w;
  });

  // Build congestion records
  const binCongestion: BinCongestion[] = populated.map((b, i) => {
    const feeWeight = feeWeights[i];
    const feeSharePct = totalFeeWeight > 0 ? feeWeight / totalFeeWeight : 0;
    const estimatedDailyFees = dailyPoolFees * feeSharePct;
    const feeYieldPerDollar = b.totalUsd > 0 ? estimatedDailyFees / b.totalUsd : 0;
    const crowdingRatio = avgBinTvl > 0 ? b.totalUsd / avgBinTvl : 0;

    // Congestion score: high TVL + low fee yield = congested
    // Scale: 0 (uncongested) to 100 (gridlocked)
    const tvlNorm = Math.min(crowdingRatio / 4, 1);
    const yieldPenalty = feeYieldPerDollar > 0
      ? Math.max(0, 1 - feeYieldPerDollar / 0.005)
      : 1;
    const distancePenalty = Math.min(Math.abs(b.binId - activeBinId) / BIN_SCAN_RADIUS, 1);
    const congestionScore = Math.round(
      (tvlNorm * 40 + yieldPenalty * 35 + distancePenalty * 25) * 100 / 100
    );

    return {
      binId: b.binId,
      distanceFromActive: b.binId - activeBinId,
      totalUsd: b.totalUsd,
      feeProximityWeight: feeWeight,
      estimatedDailyFeesUsd: estimatedDailyFees,
      feeYieldPerDollar,
      crowdingRatio,
      congestionScore: Math.min(congestionScore, 100),
      zone: classifyZone(congestionScore),
      efficiencyRank: 0,
      isOptimalEntry: false,
    };
  });

  // Efficiency rank: best fee yield per dollar (higher = better, lower rank = more efficient)
  const byEfficiency = [...binCongestion]
    .filter((b) => b.feeYieldPerDollar > 0)
    .sort((a, b) => b.feeYieldPerDollar - a.feeYieldPerDollar);
  byEfficiency.forEach((b, i) => { b.efficiencyRank = i + 1; });

  // Optimal entry: within 10 bins of active, below-average congestion, positive fee yield
  for (const b of binCongestion) {
    b.isOptimalEntry =
      Math.abs(b.distanceFromActive) <= 10 &&
      b.congestionScore < 40 &&
      b.feeYieldPerDollar > 0 &&
      b.crowdingRatio < 1.5;
  }

  // Zone distribution
  const zones: CongestionZone[] = ["EMPTY", "LIGHT", "MODERATE", "HEAVY", "GRIDLOCK"];
  const zoneCounts: Record<CongestionZone, number> = { EMPTY: 0, LIGHT: 0, MODERATE: 0, HEAVY: 0, GRIDLOCK: 0 };
  const zoneTvl: Record<CongestionZone, number> = { EMPTY: 0, LIGHT: 0, MODERATE: 0, HEAVY: 0, GRIDLOCK: 0 };
  for (const b of binCongestion) {
    zoneCounts[b.zone]++;
    zoneTvl[b.zone] += b.totalUsd;
  }

  const gridlockPct = populated.length > 0 ? (zoneCounts.GRIDLOCK / populated.length) * 100 : 0;
  const lightPct = populated.length > 0 ? ((zoneCounts.LIGHT + zoneCounts.EMPTY) / populated.length) * 100 : 0;
  const avgCongestion = binCongestion.length > 0
    ? binCongestion.reduce((s, b) => s + b.congestionScore, 0) / binCongestion.length
    : 0;

  const congestionGini = computeGini(binCongestion.map((b) => b.totalUsd));

  // Sort by congestion for output
  const byCongestion = [...binCongestion].sort((a, b) => b.congestionScore - a.congestionScore);
  const optimalEntries = binCongestion
    .filter((b) => b.isOptimalEntry)
    .sort((a, b) => b.feeYieldPerDollar - a.feeYieldPerDollar);

  const asciiChart = buildAsciiChart(binCongestion, activeBinId);
  const recommendation = buildRecommendation(
    avgCongestion, gridlockPct, lightPct, congestionGini,
    optimalEntries.length, byCongestion, pool, dailyPoolFees
  );

  return {
    poolId: pool.poolId!,
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    feeBps,
    activeBinId,
    binsScanned: rawBins.length,
    binsPopulated: populated.length,
    scannedTvlUsd: scannedTvl,
    estimatedDailyPoolFeesUsd: dailyPoolFees,
    avgBinTvlUsd: avgBinTvl,
    medianBinTvlUsd: medianBinTvl,
    avgCongestionScore: Math.round(avgCongestion),
    zoneCounts,
    zoneTvl,
    gridlockBinsPct: Math.round(gridlockPct * 10) / 10,
    lightBinsPct: Math.round(lightPct * 10) / 10,
    congestionGini: Math.round(congestionGini * 1000) / 1000,
    optimalEntryBins: optimalEntries.slice(0, 5),
    mostCongestedBins: byCongestion.slice(0, 5),
    leastCongestedBins: byCongestion.slice(-5).reverse(),
    efficiencyFrontier: byEfficiency.slice(0, 5),
    bins: binCongestion,
    recommendation,
    asciiChart,
  };
}

function buildAsciiChart(bins: BinCongestion[], activeBinId: number): string {
  if (bins.length === 0) return "(no populated bins)";

  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const barWidth = 40;
  const lines: string[] = [
    "  Bin  | Dist | $TVL     | Congest | Zone     | Yield/$ | Bar",
  ];
  lines.push("-------+------+----------+---------+----------+---------+" + "-".repeat(barWidth + 1));

  for (const b of sorted) {
    const dist = b.distanceFromActive >= 0
      ? `+${b.distanceFromActive}`.padStart(4)
      : `${b.distanceFromActive}`.padStart(4);
    const barLen = Math.round((b.congestionScore / 100) * barWidth);
    const marker = b.binId === activeBinId ? "*" : b.isOptimalEntry ? ">" : " ";
    const zoneStr = b.zone.padEnd(8);
    const scoreStr = String(b.congestionScore).padStart(5);
    const yieldStr = (b.feeYieldPerDollar * 100).toFixed(2).padStart(5) + "%";
    const barChar = b.zone === "GRIDLOCK" ? "X" : b.zone === "HEAVY" ? "#" : b.zone === "MODERATE" ? "=" : "-";
    lines.push(
      `${marker}${b.binId.toString().padStart(5)} | ${dist} | $${fmtUsd(b.totalUsd).padStart(7)} | ${scoreStr}   | ${zoneStr} | ${yieldStr} | ${barChar.repeat(barLen)}`
    );
  }
  lines.push("");
  lines.push("  * = active bin  > = optimal entry");
  return lines.join("\n");
}

function buildRecommendation(
  avgCongestion: number,
  gridlockPct: number,
  lightPct: number,
  gini: number,
  optimalCount: number,
  byCongestion: BinCongestion[],
  pool: AppPool,
  dailyFees: number
): string {
  const parts: string[] = [];

  if (avgCongestion >= 60) {
    parts.push(
      `HEAVILY CONGESTED POOL — Average congestion score ${Math.round(avgCongestion)}/100. ` +
      `${fmtPct(gridlockPct)} of bins are in GRIDLOCK. ` +
      "Most LPs are competing for limited fee revenue. Consider alternative pools or wider bin ranges to reduce competition."
    );
  } else if (avgCongestion >= 40) {
    parts.push(
      `MODERATELY CONGESTED — Average score ${Math.round(avgCongestion)}/100. ` +
      "Some bins are overcrowded but opportunities exist in less-populated areas."
    );
  } else {
    parts.push(
      `LIGHT CONGESTION — Average score ${Math.round(avgCongestion)}/100. ` +
      `${fmtPct(lightPct)} of bins have light or no congestion. ` +
      "Good entry conditions for new LPs."
    );
  }

  if (optimalCount > 0) {
    parts.push(
      `${optimalCount} OPTIMAL ENTRY BINS found — near active bin, below-average congestion, positive fee yield. ` +
      "These bins offer the best risk/reward for new LP positions."
    );
  } else {
    parts.push(
      "NO OPTIMAL ENTRY BINS detected — all near-active bins are congested. " +
      "Consider waiting for price movement to open gaps, or position in adjacent bin ranges."
    );
  }

  if (gini > 0.7) {
    parts.push(
      `HIGH INEQUALITY (Gini ${gini.toFixed(2)}) — Capital is unevenly distributed. ` +
      "A few bins absorb most liquidity while others sit nearly empty. Exploit the gaps."
    );
  }

  if (dailyFees > 0 && pool.tvlUsd > 0) {
    const poolYield = (dailyFees / pool.tvlUsd) * 365 * 100;
    parts.push(
      `POOL FEE YIELD: ~${poolYield.toFixed(1)}% APR ($${fmtUsd(dailyFees)}/day on $${fmtUsd(pool.tvlUsd)} TVL). ` +
      "Concentrated positions in uncongested bins near active can significantly outperform this average."
    );
  }

  if (byCongestion.length > 0) {
    const worst = byCongestion[0];
    parts.push(
      `MOST CONGESTED: Bin ${worst.binId} (score ${worst.congestionScore}, ` +
      `$${fmtUsd(worst.totalUsd)} TVL, ${worst.crowdingRatio.toFixed(1)}x avg). ` +
      "Avoid adding liquidity here — returns are heavily diluted."
    );
  }

  return parts.join("\n\n");
}

// -- Output -------------------------------------------------------------------

function printAnalysis(a: CongestionAnalysis, format: string): void {
  if (format === "json") {
    console.log(JSON.stringify(a, null, 2));
    return;
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(`  HODLMM BIN CONGESTION — ${a.pair} (Pool #${a.poolId})`);
  console.log(`${"=".repeat(72)}`);
  console.log(`  TVL: $${fmtUsd(a.tvlUsd)}  |  Vol 24h: $${fmtUsd(a.volume24hUsd)}  |  Fee: ${a.feeBps} bps`);
  console.log(`  Active Bin: ${a.activeBinId}  |  Scanned: ${a.binsScanned} bins  |  Populated: ${a.binsPopulated}`);
  console.log(`  Scanned TVL: $${fmtUsd(a.scannedTvlUsd)}  |  Est Daily Fees: $${fmtUsd(a.estimatedDailyPoolFeesUsd)}`);

  console.log(`\n── Congestion Overview ${"─".repeat(50)}`);
  console.log(`  Avg Congestion Score:  ${a.avgCongestionScore}/100`);
  console.log(`  Avg Bin TVL:           $${fmtUsd(a.avgBinTvlUsd)}`);
  console.log(`  Median Bin TVL:        $${fmtUsd(a.medianBinTvlUsd)}`);
  console.log(`  TVL Gini:              ${a.congestionGini.toFixed(3)}`);
  console.log(`  Gridlock Bins:         ${fmtPct(a.gridlockBinsPct)}`);
  console.log(`  Light/Empty Bins:      ${fmtPct(a.lightBinsPct)}`);

  console.log(`\n── Congestion Zones ${"─".repeat(52)}`);
  const zones: CongestionZone[] = ["GRIDLOCK", "HEAVY", "MODERATE", "LIGHT", "EMPTY"];
  for (const z of zones) {
    const count = a.zoneCounts[z];
    const tvl = a.zoneTvl[z];
    const pct = a.scannedTvlUsd > 0 ? (tvl / a.scannedTvlUsd) * 100 : 0;
    const indicator = z === "GRIDLOCK" ? "X" : z === "HEAVY" ? "#" : z === "MODERATE" ? "=" : z === "LIGHT" ? "-" : ".";
    console.log(`  ${indicator} ${z.padEnd(10)} ${String(count).padStart(3)} bins  |  $${fmtUsd(tvl).padStart(8)}  |  ${fmtPct(pct).padStart(6)}`);
  }

  console.log(`\n── Most Congested Bins (avoid) ${"─".repeat(42)}`);
  console.log(`  Bin    | Dist  | TVL        | Score | Crowd | Yield/$  | Zone`);
  console.log(`  -------+-------+------------+-------+-------+----------+----------`);
  for (const b of a.mostCongestedBins) {
    const dist = b.distanceFromActive >= 0 ? `+${b.distanceFromActive}` : `${b.distanceFromActive}`;
    const yieldStr = (b.feeYieldPerDollar * 100).toFixed(3) + "%";
    console.log(
      `  ${String(b.binId).padStart(6)} | ${dist.padStart(5)} | $${fmtUsd(b.totalUsd).padStart(9)} | ${String(b.congestionScore).padStart(5)} | ${b.crowdingRatio.toFixed(1).padStart(5)} | ${yieldStr.padStart(8)} | ${b.zone}`
    );
  }

  console.log(`\n── Efficiency Frontier (best yield/$) ${"─".repeat(35)}`);
  console.log(`  Bin    | Dist  | TVL        | Score | Yield/$  | Zone`);
  console.log(`  -------+-------+------------+-------+----------+----------`);
  for (const b of a.efficiencyFrontier) {
    const dist = b.distanceFromActive >= 0 ? `+${b.distanceFromActive}` : `${b.distanceFromActive}`;
    const yieldStr = (b.feeYieldPerDollar * 100).toFixed(3) + "%";
    console.log(
      `  ${String(b.binId).padStart(6)} | ${dist.padStart(5)} | $${fmtUsd(b.totalUsd).padStart(9)} | ${String(b.congestionScore).padStart(5)} | ${yieldStr.padStart(8)} | ${b.zone}`
    );
  }

  if (a.optimalEntryBins.length > 0) {
    console.log(`\n── Optimal Entry Bins ${"─".repeat(50)}`);
    console.log(`  Bin    | Dist  | TVL        | Score | Yield/$  | Zone`);
    console.log(`  -------+-------+------------+-------+----------+----------`);
    for (const b of a.optimalEntryBins) {
      const dist = b.distanceFromActive >= 0 ? `+${b.distanceFromActive}` : `${b.distanceFromActive}`;
      const yieldStr = (b.feeYieldPerDollar * 100).toFixed(3) + "%";
      console.log(
        `  ${String(b.binId).padStart(6)} | ${dist.padStart(5)} | $${fmtUsd(b.totalUsd).padStart(9)} | ${String(b.congestionScore).padStart(5)} | ${yieldStr.padStart(8)} | ${b.zone}`
      );
    }
  }

  console.log(`\n── Congestion Map ${"─".repeat(54)}`);
  console.log(a.asciiChart);

  console.log(`\n── Recommendation ${"─".repeat(54)}`);
  console.log(a.recommendation);
  console.log();
}

// -- Main ---------------------------------------------------------------------

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("hodlmm-bin-congestion")
    .description("HODLMM Bin Congestion Analyzer — finds overcrowded bins with diluted LP returns")
    .option("-p, --pool <id>", "Pool ID to analyze")
    .option("-s, --search <pair>", "Search for pool by token pair (e.g. STX/sBTC)")
    .option("-r, --radius <n>", "Bin scan radius", String(BIN_SCAN_RADIUS))
    .option("-f, --format <fmt>", "Output format: text | json", "text")
    .parse(process.argv);

  const opts = program.opts();
  const radius = parseInt(opts.radius) || BIN_SCAN_RADIUS;
  const format = opts.format || "text";

  console.log("Discovering HODLMM pools...");
  const pools = await discoverPools();

  if (pools.length === 0) {
    console.error("No HODLMM pools found with sufficient TVL.");
    process.exit(1);
  }

  let targetPool: AppPool | undefined;

  if (opts.pool) {
    const poolId = parseInt(opts.pool);
    targetPool = pools.find((p) => p.poolId === poolId);
    if (!targetPool) {
      console.error(`Pool ${poolId} not found. Available: ${pools.map((p) => `${p.poolId} (${p.token0Symbol}/${p.token1Symbol})`).join(", ")}`);
      process.exit(1);
    }
  } else if (opts.search) {
    const q = opts.search.toLowerCase();
    targetPool = pools.find(
      (p) =>
        `${p.token0Symbol}/${p.token1Symbol}`.toLowerCase().includes(q) ||
        `${p.token1Symbol}/${p.token0Symbol}`.toLowerCase().includes(q) ||
        p.token0Symbol.toLowerCase() === q ||
        p.token1Symbol.toLowerCase() === q
    );
    if (!targetPool) {
      console.error(`No pool matching "${opts.search}". Available: ${pools.map((p) => `${p.token0Symbol}/${p.token1Symbol}`).join(", ")}`);
      process.exit(1);
    }
  } else {
    targetPool = pools.sort((a, b) => b.tvlUsd - a.tvlUsd)[0];
    console.log(`No pool specified — using highest-TVL: ${targetPool.token0Symbol}/${targetPool.token1Symbol}`);
  }

  console.log(`Analyzing congestion for ${targetPool.token0Symbol}/${targetPool.token1Symbol} (Pool #${targetPool.poolId})...`);

  const activeBin = targetPool.activeBinId ?? (await getActiveBin(targetPool.poolId!));
  console.log(`  Active bin: ${activeBin}, scanning +/-${radius} bins...`);

  const rawBins = await scanBins(targetPool.poolId!, activeBin, targetPool, radius);
  const analysis = analyzeCongestion(targetPool, activeBin, rawBins);

  printAnalysis(analysis, format);
}

main().catch((err) => {
  console.error("Fatal:", err.message ?? err);
  process.exit(1);
});
