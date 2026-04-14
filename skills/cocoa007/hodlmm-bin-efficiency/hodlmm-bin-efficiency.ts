#!/usr/bin/env bun
/**
 * hodlmm-bin-efficiency.ts
 *
 * HODLMM Bin Efficiency Scorer — For each populated bin around the active bin,
 * computes a composite efficiency score (0-100) combining multiple factors:
 *
 *  1. Balance quality     (25%): How close to 50/50 X/Y split. A balanced bin
 *     earns fees from both sides of trades. Score: 100 at 50/50, degrades
 *     linearly to 0 at 100/0.
 *
 *  2. Distance factor     (30%): Bins closer to the active bin earn more fees.
 *     Score: 100 at active bin, exponential decay with distance. Bins beyond
 *     scan radius get 0.
 *
 *  3. Capital density     (20%): What % of total pool TVL this bin holds.
 *     Score peaks at moderate density (not too thin, not too concentrated).
 *
 *  4. Reserve magnitude   (15%): Absolute USD value in the bin. Minimum
 *     threshold to be "meaningful" ($10), scales logarithmically.
 *
 *  5. Asymmetry signal    (10%): Bins with strong directional lean (heavily X
 *     or Y) suggest recent one-sided flow — interesting for rebalance hunters.
 *     Score higher when asymmetry is moderate (some lean = opportunity,
 *     extreme lean = depleted).
 *
 * Output:
 *  - Per-bin efficiency scores with component breakdown
 *  - Ranked table of top bins by efficiency
 *  - "Golden zone" identification: high efficiency bins with optimal entry
 *  - "Dead zone" identification: low efficiency bins (wasted capital)
 *  - Pool-wide efficiency summary (average, median, efficiency-weighted TVL)
 *  - ASCII efficiency heatmap showing scored bins around active
 *  - Recommendation text
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 81).
 */

import { Command } from "commander";

// -- Constants ----------------------------------------------------------------

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 25;

// Efficiency scoring weights (must sum to 1.0)
const W_BALANCE = 0.25;
const W_DISTANCE = 0.30;
const W_DENSITY = 0.20;
const W_MAGNITUDE = 0.15;
const W_ASYMMETRY = 0.10;

// Thresholds for classification
const GOLDEN_ZONE_THRESHOLD = 65; // composite score >= this = golden zone
const DEAD_ZONE_THRESHOLD = 25;   // composite score <= this = dead zone
const MIN_USD_MEANINGFUL = 10;    // minimum USD for a bin to be "meaningful"
const PEAK_DENSITY_PCT = 5;       // density % that scores 100 on density factor
const MAX_MEANINGFUL_USD = 50000; // USD beyond which magnitude score saturates

// -- Types --------------------------------------------------------------------

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

interface EfficiencyComponents {
  balance: number;      // 0-100: proximity to 50/50 X/Y split
  distance: number;     // 0-100: proximity to active bin
  density: number;      // 0-100: share of pool TVL (peaks at moderate %)
  magnitude: number;    // 0-100: absolute USD value (log scale)
  asymmetry: number;    // 0-100: moderate lean preferred over extreme
}

type EfficiencyTier = "GOLDEN" | "GOOD" | "FAIR" | "WEAK" | "DEAD";

interface BinEfficiency {
  binId: number;
  distanceFromActive: number;
  reserveXUsd: number;
  reserveYUsd: number;
  totalUsd: number;
  xPct: number;         // % of bin value in token X
  yPct: number;
  components: EfficiencyComponents;
  compositeScore: number; // 0-100 weighted composite
  tier: EfficiencyTier;
  densityPct: number;   // % of pool TVL this bin represents
  asymmetryPct: number; // how far from 50/50 (0 = balanced, 100 = fully one-sided)
  isGolden: boolean;
  isDead: boolean;
}

interface EfficiencyAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  // Pool-wide efficiency metrics
  avgEfficiency: number;
  medianEfficiency: number;
  efficiencyWeightedTvl: number;  // TVL-weighted average efficiency
  totalGoldenZoneTvl: number;
  totalDeadZoneTvl: number;
  goldenZoneCount: number;
  deadZoneCount: number;
  // Score distribution
  tierCounts: Record<EfficiencyTier, number>;
  // Top and bottom bins
  topBins: BinEfficiency[];
  bottomBins: BinEfficiency[];
  goldenBins: BinEfficiency[];
  deadBins: BinEfficiency[];
  // Component averages (where bins are populated)
  avgComponents: EfficiencyComponents;
  // Capital concentration
  top3BinsTvlPct: number;   // % of scanned TVL in top 3 bins by USD
  capitalGiniScore: number; // 0-1 Gini coefficient of capital distribution
  // Per-bin data
  bins: BinEfficiency[];
  recommendation: string;
  asciiMap: string;
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
  if (v >= 1) return v.toFixed(0);
  return v.toFixed(2);
}

function fmtScore(v: number): string {
  return v.toFixed(1).padStart(5);
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

// -- Efficiency scoring -------------------------------------------------------

/**
 * Balance score: 100 at perfect 50/50 split, 0 at fully one-sided.
 * Uses 1 - 2*|xPct - 0.5| (linear, symmetric).
 */
function scoreBalance(xUsd: number, yUsd: number): number {
  const total = xUsd + yUsd;
  if (total <= 0) return 0;
  const xFrac = xUsd / total;
  // |xFrac - 0.5| ranges 0 (balanced) to 0.5 (fully one-sided)
  const imbalance = Math.abs(xFrac - 0.5); // 0..0.5
  return Math.round((1 - imbalance * 2) * 1000) / 10; // 0..100
}

/**
 * Distance score: 100 at active bin, exponential decay with distance.
 * Half-life at distance 8 — far bins decay to near-zero quickly.
 */
function scoreDistance(distanceFromActive: number): number {
  const d = Math.abs(distanceFromActive);
  if (d > BIN_SCAN_RADIUS) return 0;
  // Exponential decay: score = 100 * exp(-lambda * d)
  // lambda chosen so score(8) = 50 => lambda = ln(2)/8
  const lambda = Math.LN2 / 8;
  return Math.round(Math.exp(-lambda * d) * 1000) / 10; // 0..100
}

/**
 * Density score: peaks at PEAK_DENSITY_PCT of pool TVL.
 * Too thin = low score. Too concentrated = diminishing returns.
 * Uses a tent/triangular function peaking at PEAK_DENSITY_PCT, then log decay.
 */
function scoreDensity(binTvlUsd: number, poolTvlUsd: number): number {
  if (poolTvlUsd <= 0 || binTvlUsd <= 0) return 0;
  const densityPct = (binTvlUsd / poolTvlUsd) * 100;

  if (densityPct <= 0) return 0;

  if (densityPct <= PEAK_DENSITY_PCT) {
    // Rising phase: linear 0→100 as density goes 0→PEAK_DENSITY_PCT
    return Math.round((densityPct / PEAK_DENSITY_PCT) * 1000) / 10;
  } else {
    // Falling phase: logarithmic decay from 100 at peak
    // At 2x peak: ~71, at 5x peak: ~30, at 10x peak: ~0
    const excess = densityPct / PEAK_DENSITY_PCT; // >= 1
    const decay = Math.max(0, 100 - 30 * Math.log2(excess));
    return Math.round(decay * 10) / 10;
  }
}

/**
 * Magnitude score: logarithmic scale from MIN_USD_MEANINGFUL to MAX_MEANINGFUL_USD.
 * Below minimum: 0. Above max: 100.
 */
function scoreMagnitude(totalUsd: number): number {
  if (totalUsd < MIN_USD_MEANINGFUL) return 0;
  if (totalUsd >= MAX_MEANINGFUL_USD) return 100;
  const logMin = Math.log10(MIN_USD_MEANINGFUL);
  const logMax = Math.log10(MAX_MEANINGFUL_USD);
  const logVal = Math.log10(totalUsd);
  return Math.round(((logVal - logMin) / (logMax - logMin)) * 1000) / 10;
}

/**
 * Asymmetry signal score: moderate lean is most interesting for rebalancers.
 * 0% asymmetry (perfect balance) = moderate opportunity score.
 * ~30-50% asymmetry = peak score (some directional lean = recent flow).
 * ~100% asymmetry (fully one-sided) = low score (depleted side).
 * Uses a bell curve peaking at 40% asymmetry.
 */
function scoreAsymmetry(xUsd: number, yUsd: number): number {
  const total = xUsd + yUsd;
  if (total <= 0) return 0;
  const xFrac = xUsd / total;
  // asymmetryPct: 0 at balanced, 100 at fully one-sided
  const asymPct = Math.abs(xFrac - 0.5) * 200; // 0..100

  // Bell curve peaking at 40%: gaussian with mean=40, sigma=25
  const mu = 40;
  const sigma = 25;
  const gaussian = Math.exp(-0.5 * Math.pow((asymPct - mu) / sigma, 2));
  return Math.round(gaussian * 1000) / 10;
}

function computeAsymmetryPct(xUsd: number, yUsd: number): number {
  const total = xUsd + yUsd;
  if (total <= 0) return 0;
  const xFrac = xUsd / total;
  return Math.round(Math.abs(xFrac - 0.5) * 2000) / 10; // 0..100
}

function classifyTier(score: number): EfficiencyTier {
  if (score >= GOLDEN_ZONE_THRESHOLD) return "GOLDEN";
  if (score >= 50) return "GOOD";
  if (score >= DEAD_ZONE_THRESHOLD + 1) return "FAIR";
  if (score >= 10) return "WEAK";
  return "DEAD";
}

function scoreBin(
  bin: BinReserves,
  activeBin: number,
  poolTvlUsd: number
): BinEfficiency {
  const total = bin.reserveXUsd + bin.reserveYUsd;
  const xPct = total > 0 ? (bin.reserveXUsd / total) * 100 : 50;
  const yPct = 100 - xPct;
  const distanceFromActive = bin.binId - activeBin;
  const densityPct = poolTvlUsd > 0 ? (total / poolTvlUsd) * 100 : 0;
  const asymmetryPct = computeAsymmetryPct(bin.reserveXUsd, bin.reserveYUsd);

  const components: EfficiencyComponents = {
    balance: scoreBalance(bin.reserveXUsd, bin.reserveYUsd),
    distance: scoreDistance(distanceFromActive),
    density: scoreDensity(total, poolTvlUsd),
    magnitude: scoreMagnitude(total),
    asymmetry: scoreAsymmetry(bin.reserveXUsd, bin.reserveYUsd),
  };

  const compositeScore = Math.round(
    (components.balance * W_BALANCE +
      components.distance * W_DISTANCE +
      components.density * W_DENSITY +
      components.magnitude * W_MAGNITUDE +
      components.asymmetry * W_ASYMMETRY) * 10
  ) / 10;

  const tier = classifyTier(compositeScore);

  return {
    binId: bin.binId,
    distanceFromActive,
    reserveXUsd: bin.reserveXUsd,
    reserveYUsd: bin.reserveYUsd,
    totalUsd: total,
    xPct: Math.round(xPct * 10) / 10,
    yPct: Math.round(yPct * 10) / 10,
    components,
    compositeScore,
    tier,
    densityPct: Math.round(densityPct * 100) / 100,
    asymmetryPct: Math.round(asymmetryPct * 10) / 10,
    isGolden: compositeScore >= GOLDEN_ZONE_THRESHOLD,
    isDead: compositeScore <= DEAD_ZONE_THRESHOLD && total > 0,
  };
}

// -- Statistics ---------------------------------------------------------------

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Gini coefficient: 0 = perfectly equal, 1 = all capital in one bin.
 */
function giniCoefficient(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  if (sum === 0) return 0;
  let numerator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (2 * (i + 1) - n - 1) * sorted[i];
  }
  return Math.round((numerator / (n * sum)) * 1000) / 1000;
}

function avgComponents(bins: BinEfficiency[]): EfficiencyComponents {
  const populated = bins.filter(b => b.totalUsd > 0);
  if (populated.length === 0) {
    return { balance: 0, distance: 0, density: 0, magnitude: 0, asymmetry: 0 };
  }
  const sum = populated.reduce(
    (acc, b) => ({
      balance: acc.balance + b.components.balance,
      distance: acc.distance + b.components.distance,
      density: acc.density + b.components.density,
      magnitude: acc.magnitude + b.components.magnitude,
      asymmetry: acc.asymmetry + b.components.asymmetry,
    }),
    { balance: 0, distance: 0, density: 0, magnitude: 0, asymmetry: 0 }
  );
  const n = populated.length;
  return {
    balance: Math.round((sum.balance / n) * 10) / 10,
    distance: Math.round((sum.distance / n) * 10) / 10,
    density: Math.round((sum.density / n) * 10) / 10,
    magnitude: Math.round((sum.magnitude / n) * 10) / 10,
    asymmetry: Math.round((sum.asymmetry / n) * 10) / 10,
  };
}

// -- ASCII heatmap ------------------------------------------------------------

function tierChar(tier: EfficiencyTier, isActive: boolean): string {
  if (isActive) return "A";
  switch (tier) {
    case "GOLDEN": return "#";
    case "GOOD":   return "+";
    case "FAIR":   return "~";
    case "WEAK":   return "-";
    case "DEAD":   return ".";
    default:       return " ";
  }
}

function tierColor(tier: EfficiencyTier): string {
  switch (tier) {
    case "GOLDEN": return "\x1b[93m"; // bright yellow
    case "GOOD":   return "\x1b[32m"; // green
    case "FAIR":   return "\x1b[36m"; // cyan
    case "WEAK":   return "\x1b[90m"; // dark grey
    case "DEAD":   return "\x1b[31m"; // red
    default:       return "\x1b[0m";
  }
}

const RESET = "\x1b[0m";

function buildAsciiMap(bins: BinEfficiency[], activeBin: number): string {
  const populated = bins.filter(b => b.totalUsd > 0 || b.binId === activeBin);
  if (populated.length === 0) return "  (no populated bins)";

  const lines: string[] = [];
  lines.push(
    "  Bin    | Score | Tier   | X%/Y%      | TVL $      | Density | Asym | Comp[Bal/Dis/Den/Mag/Asy]"
  );
  lines.push(
    "  -------+-------+--------+------------+------------+---------+------+---------------------------"
  );

  const barWidth = 20;
  const maxTotal = Math.max(...populated.map(b => b.totalUsd), 1);

  for (const b of populated) {
    const isActive = b.binId === activeBin;
    const marker = isActive ? ">" : " ";
    const scoreStr = fmtScore(b.compositeScore);
    const tierStr = b.tier.padEnd(6);
    const ratioStr = `${b.xPct.toFixed(0)}/${b.yPct.toFixed(0)}`.padStart(7);
    const tvlStr = `$${fmtUsd(b.totalUsd)}`.padEnd(10);
    const densStr = `${b.densityPct.toFixed(2)}%`.padStart(7);
    const asymStr = `${b.asymmetryPct.toFixed(0)}%`.padStart(4);
    const compStr = [
      b.components.balance.toFixed(0).padStart(3),
      b.components.distance.toFixed(0).padStart(3),
      b.components.density.toFixed(0).padStart(3),
      b.components.magnitude.toFixed(0).padStart(3),
      b.components.asymmetry.toFixed(0).padStart(3),
    ].join("/");

    // Bar chart showing bin TVL relative to max
    const barLen = Math.round((b.totalUsd / maxTotal) * barWidth);
    const filledChar = tierChar(b.tier, isActive);
    const bar = filledChar.repeat(Math.max(0, barLen)).padEnd(barWidth);

    lines.push(
      `${marker} ${String(b.binId).padStart(5)} | ${scoreStr} | ${tierStr} | ${ratioStr}   | ${tvlStr} | ${densStr} | ${asymStr} | [${compStr}] ${bar}`
    );
  }

  lines.push("");
  lines.push("  Legend: # = GOLDEN (>=65)  + = GOOD (50-64)  ~ = FAIR (26-49)  - = WEAK (10-25)  . = DEAD (<=9)");
  lines.push("  Comp: Bal=balance Dis=distance Den=density Mag=magnitude Asy=asymmetry");

  return lines.join("\n");
}

// -- Recommendations ----------------------------------------------------------

function generateRecommendation(
  a: Omit<EfficiencyAnalysis, "recommendation" | "asciiMap">
): string {
  const parts: string[] = [];

  // Overall efficiency summary
  parts.push(
    `Pool efficiency avg ${a.avgEfficiency.toFixed(1)}/100 (median ${a.medianEfficiency.toFixed(1)}/100), ` +
    `TVL-weighted ${a.efficiencyWeightedTvl.toFixed(1)}/100.`
  );

  // Golden zone
  if (a.goldenZoneCount > 0) {
    const goldenPct = a.totalGoldenZoneTvl > 0
      ? ((a.totalGoldenZoneTvl / a.tvlUsd) * 100).toFixed(1)
      : "0.0";
    const topGolden = a.goldenBins[0];
    parts.push(
      `${a.goldenZoneCount} golden zone bin(s) holding $${fmtUsd(a.totalGoldenZoneTvl)} (${goldenPct}% of TVL)` +
      (topGolden ? `, best at bin ${topGolden.binId} (score ${topGolden.compositeScore.toFixed(1)})` : "") +
      "."
    );
  } else {
    parts.push("No golden zone bins found — pool lacks high-efficiency positioning near active bin.");
  }

  // Dead zone warning
  if (a.deadZoneCount > 0) {
    const deadPct = a.totalDeadZoneTvl > 0
      ? ((a.totalDeadZoneTvl / a.tvlUsd) * 100).toFixed(1)
      : "0.0";
    parts.push(
      `${a.deadZoneCount} dead zone bin(s) with $${fmtUsd(a.totalDeadZoneTvl)} (${deadPct}% of TVL) ` +
      `earning minimal fees — consider rebalancing capital closer to active bin.`
    );
  }

  // Capital concentration
  if (a.capitalGiniScore > 0.7) {
    parts.push(
      `Capital highly concentrated (Gini ${a.capitalGiniScore.toFixed(2)}) — ` +
      `top 3 bins hold ${a.top3BinsTvlPct.toFixed(1)}% of scanned TVL. ` +
      `Wide spreads are underutilized.`
    );
  } else if (a.capitalGiniScore < 0.3) {
    parts.push(
      `Capital well distributed (Gini ${a.capitalGiniScore.toFixed(2)}) — ` +
      `even spread across bins. Consider concentration near active bin for higher fee capture.`
    );
  }

  // Component bottleneck
  const avgC = a.avgComponents;
  const componentScores = [
    { name: "balance", score: avgC.balance },
    { name: "distance", score: avgC.distance },
    { name: "density", score: avgC.density },
    { name: "magnitude", score: avgC.magnitude },
    { name: "asymmetry", score: avgC.asymmetry },
  ];
  const weakest = componentScores.sort((a, b) => a.score - b.score)[0];
  if (weakest.score < 40) {
    const advice: Record<string, string> = {
      balance: "Many bins are one-sided — balanced liquidity provision will improve fee capture.",
      distance: "Capital is spread too far from the active bin — tightening range will raise efficiency.",
      density: "Bins are too thinly spread or over-concentrated — moderate rebalancing recommended.",
      magnitude: "Many bins hold low USD value — consolidating thin bins will boost meaningful deployment.",
      asymmetry: "Asymmetry pattern is either too uniform or too extreme — moderate directional lean suggests better entry.",
    };
    parts.push(`Weakest component: ${weakest.name} (avg ${weakest.score.toFixed(1)}/100). ${advice[weakest.name]}`);
  }

  // LP entry recommendation
  if (a.goldenBins.length > 0) {
    const best = a.goldenBins[0];
    parts.push(
      `LP entry: bin ${best.binId} (distance ${best.distanceFromActive > 0 ? "+" : ""}${best.distanceFromActive}) ` +
      `offers best efficiency score ${best.compositeScore.toFixed(1)} with ` +
      `${best.xPct.toFixed(0)}% X / ${best.yPct.toFixed(0)}% Y balance.`
    );
  }

  return parts.join(" ");
}

// -- Main analysis ------------------------------------------------------------

async function analyzeEfficiency(pool: AppPool): Promise<EfficiencyAnalysis> {
  const poolId = pool.poolId!;
  const activeBin = pool.activeBinId ?? (await getActiveBin(poolId));
  const rawBins = await scanBins(poolId, activeBin, pool, BIN_SCAN_RADIUS);

  // Score all bins
  const bins = rawBins.map(b => scoreBin(b, activeBin, pool.tvlUsd));
  const populated = bins.filter(b => b.totalUsd > 0);

  // Efficiency stats on populated bins
  const scores = populated.map(b => b.compositeScore);
  const avgEff = scores.length > 0
    ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10
    : 0;
  const medEff = Math.round(median(scores) * 10) / 10;

  // TVL-weighted efficiency
  const totalScannedTvl = populated.reduce((s, b) => s + b.totalUsd, 0);
  const effWeightedTvl = totalScannedTvl > 0
    ? Math.round(
        (populated.reduce((s, b) => s + b.compositeScore * b.totalUsd, 0) / totalScannedTvl) * 10
      ) / 10
    : 0;

  // Golden / dead zones
  const goldenBins = populated
    .filter(b => b.isGolden)
    .sort((a, b) => b.compositeScore - a.compositeScore);
  const deadBins = populated
    .filter(b => b.isDead)
    .sort((a, b) => a.compositeScore - b.compositeScore);

  const totalGoldenZoneTvl = goldenBins.reduce((s, b) => s + b.totalUsd, 0);
  const totalDeadZoneTvl = deadBins.reduce((s, b) => s + b.totalUsd, 0);

  // Tier distribution
  const tierCounts: Record<EfficiencyTier, number> = {
    GOLDEN: 0, GOOD: 0, FAIR: 0, WEAK: 0, DEAD: 0,
  };
  for (const b of populated) tierCounts[b.tier]++;

  // Top / bottom bins
  const sortedByScore = [...populated].sort((a, b) => b.compositeScore - a.compositeScore);
  const topBins = sortedByScore.slice(0, 5);
  const bottomBins = sortedByScore.slice(-5).reverse();

  // Capital concentration
  const sortedByTvl = [...populated].sort((a, b) => b.totalUsd - a.totalUsd);
  const top3Tvl = sortedByTvl.slice(0, 3).reduce((s, b) => s + b.totalUsd, 0);
  const top3BinsTvlPct = totalScannedTvl > 0
    ? Math.round((top3Tvl / totalScannedTvl) * 1000) / 10
    : 0;

  const capitalGiniScore = giniCoefficient(populated.map(b => b.totalUsd));

  // Average component scores
  const avgC = avgComponents(bins);

  const partial: Omit<EfficiencyAnalysis, "recommendation" | "asciiMap"> = {
    poolId,
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    feeBps: pool.feeBps ?? 0,
    activeBinId: activeBin,
    binsScanned: rawBins.length,
    binsPopulated: populated.length,
    avgEfficiency: avgEff,
    medianEfficiency: medEff,
    efficiencyWeightedTvl: effWeightedTvl,
    totalGoldenZoneTvl,
    totalDeadZoneTvl,
    goldenZoneCount: goldenBins.length,
    deadZoneCount: deadBins.length,
    tierCounts,
    topBins,
    bottomBins,
    goldenBins,
    deadBins,
    avgComponents: avgC,
    top3BinsTvlPct,
    capitalGiniScore,
    bins,
  };

  const recommendation = generateRecommendation(partial);
  const asciiMap = buildAsciiMap(bins, activeBin);

  return { ...partial, recommendation, asciiMap };
}

// -- Output formatting --------------------------------------------------------

function tierBar(counts: Record<EfficiencyTier, number>): string {
  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  if (total === 0) return "(none)";
  const tiers: EfficiencyTier[] = ["GOLDEN", "GOOD", "FAIR", "WEAK", "DEAD"];
  const symbols = { GOLDEN: "#", GOOD: "+", FAIR: "~", WEAK: "-", DEAD: "." };
  return tiers.map(t => `${symbols[t]}${counts[t]}`).join(" ");
}

function printAnalysis(a: EfficiencyAnalysis): void {
  console.log(`  Pool ${a.poolId}: ${a.pair}`);
  console.log(
    `  TVL: $${(a.tvlUsd / 1000).toFixed(1)}k | Volume 24h: $${(a.volume24hUsd / 1000).toFixed(1)}k | Fee: ${a.feeBps} bps`
  );
  console.log(
    `  Active Bin: ${a.activeBinId} | Scanned: ${a.binsScanned} | Populated: ${a.binsPopulated}`
  );
  console.log();

  // Efficiency summary box
  console.log(`  ┌─ EFFICIENCY SUMMARY ─────────────────────────────────────┐`);
  console.log(`  │ Avg score:       ${fmtScore(a.avgEfficiency)}  Median: ${fmtScore(a.medianEfficiency)}                    │`);
  console.log(`  │ TVL-weighted:    ${fmtScore(a.efficiencyWeightedTvl)}                               │`);
  console.log(`  │ Golden zone:     ${String(a.goldenZoneCount).padEnd(3)} bins  $${fmtUsd(a.totalGoldenZoneTvl).padEnd(10)}         │`);
  console.log(`  │ Dead zone:       ${String(a.deadZoneCount).padEnd(3)} bins  $${fmtUsd(a.totalDeadZoneTvl).padEnd(10)}         │`);
  console.log(`  │ Capital Gini:    ${a.capitalGiniScore.toFixed(3).padEnd(6)}  Top-3 share: ${a.top3BinsTvlPct.toFixed(1)}%           │`);
  console.log(`  │ Tier dist:   ${tierBar(a.tierCounts).padEnd(42)} │`);
  console.log(`  └────────────────────────────────────────────────────────────┘`);
  console.log();

  // Component averages
  const c = a.avgComponents;
  console.log(`  AVG COMPONENT SCORES (across populated bins):`);
  const bar = (v: number, w: number) => {
    const filled = Math.round((v / 100) * 15);
    return `[${"█".repeat(filled)}${" ".repeat(15 - filled)}] ${fmtScore(v)} (wt ${(w * 100).toFixed(0)}%)`;
  };
  console.log(`    Balance    ${bar(c.balance, W_BALANCE)}`);
  console.log(`    Distance   ${bar(c.distance, W_DISTANCE)}`);
  console.log(`    Density    ${bar(c.density, W_DENSITY)}`);
  console.log(`    Magnitude  ${bar(c.magnitude, W_MAGNITUDE)}`);
  console.log(`    Asymmetry  ${bar(c.asymmetry, W_ASYMMETRY)}`);
  console.log();

  // Top bins table
  if (a.topBins.length > 0) {
    console.log(`  TOP BINS BY EFFICIENCY:`);
    console.log(`    Rank | Bin    | Score | Tier   | X%/Y%    | TVL $      | Dist`);
    console.log(`    -----+--------+-------+--------+----------+------------+-----`);
    a.topBins.forEach((b, i) => {
      console.log(
        `    ${String(i + 1).padStart(4)} | ${String(b.binId).padStart(6)} | ${fmtScore(b.compositeScore)} | ${b.tier.padEnd(6)} | ` +
        `${b.xPct.toFixed(0).padStart(3)}/${b.yPct.toFixed(0).padEnd(3)}  | $${fmtUsd(b.totalUsd).padEnd(10)} | ${(b.distanceFromActive >= 0 ? "+" : "") + b.distanceFromActive}`
      );
    });
    console.log();
  }

  // Golden zone detail
  if (a.goldenBins.length > 0) {
    console.log(`  GOLDEN ZONE BINS (score >= ${GOLDEN_ZONE_THRESHOLD}):`);
    for (const b of a.goldenBins) {
      console.log(
        `    Bin ${b.binId} (dist ${(b.distanceFromActive >= 0 ? "+" : "") + b.distanceFromActive}): ` +
        `score ${b.compositeScore.toFixed(1)} | ` +
        `$${fmtUsd(b.totalUsd)} TVL | ` +
        `${b.xPct.toFixed(0)}%X/${b.yPct.toFixed(0)}%Y | ` +
        `asym ${b.asymmetryPct.toFixed(0)}% | ` +
        `density ${b.densityPct.toFixed(2)}%`
      );
      console.log(
        `         components: bal=${b.components.balance.toFixed(0)} dis=${b.components.distance.toFixed(0)} ` +
        `den=${b.components.density.toFixed(0)} mag=${b.components.magnitude.toFixed(0)} asy=${b.components.asymmetry.toFixed(0)}`
      );
    }
    console.log();
  }

  // Dead zone detail (if any)
  if (a.deadBins.length > 0) {
    console.log(`  DEAD ZONE BINS (score <= ${DEAD_ZONE_THRESHOLD}, wasted capital):`);
    for (const b of a.deadBins.slice(0, 5)) {
      console.log(
        `    Bin ${b.binId} (dist ${(b.distanceFromActive >= 0 ? "+" : "") + b.distanceFromActive}): ` +
        `score ${b.compositeScore.toFixed(1)} | $${fmtUsd(b.totalUsd)} stranded`
      );
    }
    if (a.deadBins.length > 5) {
      console.log(`    ... and ${a.deadBins.length - 5} more dead zone bins`);
    }
    console.log();
  }

  // ASCII map
  console.log(a.asciiMap);
  console.log();
  console.log(`  Recommendation: ${a.recommendation}`);
  console.log();
  console.log("─".repeat(70));
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();

program
  .name("hodlmm-bin-efficiency")
  .description(
    "HODLMM Bin Efficiency Scorer — Computes a composite 0-100 efficiency score " +
    "for each bin around the active bin, combining balance quality, distance, " +
    "capital density, reserve magnitude, and asymmetry signal. Identifies golden " +
    "zones (high efficiency) and dead zones (wasted capital). " +
    "Part of cocoa007's Bitflow Skills Comp (Day 81)."
  )
  .option("-p, --pool <id>", "Specific pool ID to analyze")
  .option("-t, --top <n>", "Analyze top N pools by TVL", "3")
  .option("--json", "Output raw JSON instead of formatted text")
  .action(async (opts) => {
    try {
      const pools = await discoverPools();

      if (pools.length === 0) {
        console.log("No HODLMM pools found above TVL threshold.");
        return;
      }

      let targets: AppPool[];
      if (opts.pool) {
        const pid = Number(opts.pool);
        const match = pools.find((p) => p.poolId === pid);
        if (!match) {
          console.log(
            `Pool ${pid} not found. Available: ${pools
              .map((p) => `${p.poolId} (${p.token0Symbol}/${p.token1Symbol})`)
              .join(", ")}`
          );
          return;
        }
        targets = [match];
      } else {
        targets = pools
          .sort((a, b) => b.tvlUsd - a.tvlUsd)
          .slice(0, Number(opts.top));
      }

      const results: EfficiencyAnalysis[] = [];
      for (const pool of targets) {
        console.log(
          `\nAnalyzing ${pool.token0Symbol}/${pool.token1Symbol} (pool ${pool.poolId})...\n`
        );
        const analysis = await analyzeEfficiency(pool);
        results.push(analysis);

        if (opts.json) {
          console.log(JSON.stringify(analysis, null, 2));
        } else {
          printAnalysis(analysis);
        }
      }

      // Cross-pool comparison table
      if (!opts.json && results.length > 1) {
        console.log("\n  CROSS-POOL EFFICIENCY COMPARISON:");
        console.log("  " + "-".repeat(82));
        console.log(
          "  " +
          "Pool".padEnd(18) +
          "AvgEff".padEnd(8) +
          "MedEff".padEnd(8) +
          "WtdEff".padEnd(8) +
          "Golden".padEnd(8) +
          "Dead".padEnd(6) +
          "Gini".padEnd(7) +
          "Tier distribution"
        );
        console.log("  " + "-".repeat(82));
        for (const r of results) {
          console.log(
            "  " +
            r.pair.padEnd(18) +
            fmtScore(r.avgEfficiency).trim().padEnd(8) +
            fmtScore(r.medianEfficiency).trim().padEnd(8) +
            fmtScore(r.efficiencyWeightedTvl).trim().padEnd(8) +
            String(r.goldenZoneCount).padStart(3).padEnd(8) +
            String(r.deadZoneCount).padStart(2).padEnd(6) +
            r.capitalGiniScore.toFixed(2).padEnd(7) +
            tierBar(r.tierCounts)
          );
        }
        console.log();

        // Best golden zone bin across all pools
        const allGolden = results.flatMap(r =>
          r.goldenBins.map(b => ({ ...b, pair: r.pair, poolId: r.poolId }))
        ).sort((a, b) => b.compositeScore - a.compositeScore);

        if (allGolden.length > 0) {
          console.log("  TOP GOLDEN ZONE BINS ACROSS ALL ANALYZED POOLS:");
          console.log("  " + "-".repeat(65));
          for (const b of allGolden.slice(0, 5)) {
            console.log(
              `  ${(b as any).pair.padEnd(14)} bin ${String(b.binId).padStart(6)} ` +
              `score ${b.compositeScore.toFixed(1).padStart(5)} | ` +
              `$${fmtUsd(b.totalUsd).padEnd(8)} | dist ${(b.distanceFromActive >= 0 ? "+" : "") + b.distanceFromActive}`
            );
          }
          console.log();
        }
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
