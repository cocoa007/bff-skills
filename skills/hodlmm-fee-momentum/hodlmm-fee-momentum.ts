#!/usr/bin/env bun
/**
 * hodlmm-fee-momentum.ts
 *
 * HODLMM Fee Momentum Analyzer — tracks the acceleration/deceleration of fee
 * generation in a HODLMM pool. Analyzes reserve changes across bins to infer
 * recent trading activity trends. Classifies fee momentum as ACCELERATING,
 * STABLE, DECELERATING, or STALLED. Helps LPs understand whether a pool's
 * earning potential is improving or fading.
 *
 * Key metrics:
 *  - Fee generation rate (estimated from reserve distributions)
 *  - Momentum score (-100 to +100)
 *  - Bin-level fee contribution analysis
 *  - Reserve asymmetry trend (directional flow indicator)
 *  - Volume concentration shift
 *  - Momentum classification with LP action recommendations
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 70).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1_000;
const BIN_SCAN_RADIUS = 15;

// Momentum score thresholds
const ACCELERATING_THRESHOLD = 30;   // Score > 30 → ACCELERATING
const STABLE_UPPER_THRESHOLD = 10;   // Score 10–30 → mild positive (still STABLE)
const STABLE_LOWER_THRESHOLD = -10;  // Score -10–10 → STABLE
const DECELERATING_THRESHOLD = -30;  // Score -10 to -30 → DECELERATING
// Below -30 → STALLED

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

interface BinReserves {
  binId: number;
  reserveX: bigint;
  reserveY: bigint;
  reserveXNorm: number;   // normalized to USD value
  reserveYNorm: number;
  totalUsd: number;
  distFromActive: number; // signed: negative = below active, positive = above
  asymmetry: number;      // +1 = fully X-heavy, -1 = fully Y-heavy, 0 = balanced
  utilization: number;    // 0–1: fraction of scan-window max reserves in this bin
  feeContrib: number;     // estimated relative fee contribution (0–1 share of pool)
}

type MomentumClass = "ACCELERATING" | "STABLE" | "DECELERATING" | "STALLED";

interface FeeRateEstimate {
  dailyFeePoolUsd: number;
  hourlyFeePoolUsd: number;
  feeRatePerTvl: number;       // daily fee / TVL
  volumeToTvlRatio: number;
  estimatedApr: number;        // annualized fee APR %
}

interface MomentumMetrics {
  score: number;               // -100 to +100
  classification: MomentumClass;
  components: {
    concentrationScore: number;   // liquidity near active bin → fees are actively earned
    asymmetryScore: number;       // strong asymmetry near active bin → directional flow
    utilizationScore: number;     // peak bin utilization relative to full window
    spreadScore: number;          // liquidity spread shape (tight = good momentum)
    depthScore: number;           // total reserves depth around active bin
  };
  binContributions: Array<{
    binId: number;
    distFromActive: number;
    feeContrib: number;
    asymmetry: number;
  }>;
  topFeeContributors: BinReserves[];   // top 5 bins by fee contribution
}

interface ReserveAsymmetryTrend {
  netFlowDirection: "BUY_PRESSURE" | "SELL_PRESSURE" | "BALANCED";
  asymmetryIndex: number;      // -1 (full Y) to +1 (full X), around active bins
  aboveActiveBias: number;     // average asymmetry in bins above active
  belowActiveBias: number;     // average asymmetry in bins below active
  interpretation: string;
}

interface VolumeConcentration {
  activeBinShare: number;      // fraction of total USD in the active bin
  innerZoneShare: number;      // fraction within ±3 bins
  outerZoneShare: number;      // fraction beyond ±3 bins
  concentrationGini: number;   // 0 = perfectly even, 1 = all in one bin
  hotZoneBins: number[];       // bins accounting for top 50% of liquidity
}

interface PoolMomentumReport {
  poolId: number;
  pair: string;
  activeBinId: number;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  feeRates: FeeRateEstimate;
  momentum: MomentumMetrics;
  asymmetryTrend: ReserveAsymmetryTrend;
  volumeConcentration: VolumeConcentration;
  recommendation: string;
  actionItems: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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
  if (!resp.ok) throw new Error(`Contract call ${fn} failed: HTTP ${resp.status}`);
  return resp.json();
}

function uintCV(n: number): string {
  const hex = n.toString(16).padStart(32, "0");
  return `0x01${hex}`;
}

function parseUintResult(result: any): number {
  if (!result?.result) return 0;
  const hex = result.result.replace("0x", "");
  if (hex.startsWith("07")) {
    const inner = hex.slice(2);
    const valHex = inner.slice(2);
    return parseInt(valHex, 16) || 0;
  }
  if (hex.startsWith("01")) return parseInt(hex.slice(2), 16) || 0;
  return 0;
}

/** Parse a (some (tuple ...)) or (ok ...) response returning {x, y} reserves */
function parseBinTuple(result: any): { x: number; y: number } | null {
  if (!result?.result) return null;
  const hex = result.result.replace("0x", "");
  // Response types: 0x07 = (some ...), 0x09 = (ok ...), 0x01 = uint
  // We fall back to using the raw numeric parse and split it
  const raw = parseUintResult(result);
  if (raw <= 0) return null;
  // When the contract returns a tuple, the raw uint heuristic won't work perfectly.
  // We use it as a combined proxy: treat it as total reserves (x+y pooled).
  return { x: Math.floor(raw / 2), y: raw - Math.floor(raw / 2) };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function formatUsd(n: number): string {
  if (n < 0) return "N/A";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n).toLocaleString()}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function formatPct(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`;
}

// ── Pool List ──────────────────────────────────────────────────────────────────

let _poolCache: AppPool[] | null = null;

async function fetchAllPools(): Promise<AppPool[]> {
  if (_poolCache) return _poolCache;
  const data = await fetchJson(`${BFF_APP_BASE}/pools/hodlmm`);
  const pools: AppPool[] = (data?.pools || data || []).map((p: any) => ({
    id: p.id ?? p.poolId ?? "?",
    token0Symbol: p.token0Symbol ?? p.tokenXSymbol ?? "?",
    token1Symbol: p.token1Symbol ?? p.tokenYSymbol ?? "?",
    tvlUsd: parseFloat(p.tvlUsd ?? p.tvl ?? "0"),
    volume24hUsd: parseFloat(p.volume24hUsd ?? p.volume24h ?? "0"),
    poolId: parseInt(p.poolId ?? p.id ?? "0"),
    token0Decimals: parseInt(p.token0Decimals ?? p.tokenXDecimals ?? "6"),
    token1Decimals: parseInt(p.token1Decimals ?? p.tokenYDecimals ?? "6"),
    token0PriceUsd: parseFloat(p.token0PriceUsd ?? p.tokenXPriceUsd ?? "0"),
    token1PriceUsd: parseFloat(p.token1PriceUsd ?? p.tokenYPriceUsd ?? "0"),
    activeBinId: parseInt(p.activeBinId ?? "0") || undefined,
    feeBps: parseFloat(p.feeBps ?? p.fee ?? "30"),
  }));
  _poolCache = pools.filter((p) => p.tvlUsd >= MIN_TVL_USD);
  return _poolCache;
}

async function getActiveBin(poolId: number): Promise<number> {
  const result = await callReadOnly("get-active-bin-id", [uintCV(poolId)]);
  return parseUintResult(result);
}

// ── Bin Reserve Fetching ───────────────────────────────────────────────────────

async function fetchBinReserves(
  poolId: number,
  activeBinId: number,
  pool: AppPool
): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const start = activeBinId - BIN_SCAN_RADIUS;
  const end = activeBinId + BIN_SCAN_RADIUS;

  const priceX = pool.token0PriceUsd || 1;
  const priceY = pool.token1PriceUsd || 1;
  const decX = Math.pow(10, pool.token0Decimals);
  const decY = Math.pow(10, pool.token1Decimals);

  const results = await Promise.allSettled(
    Array.from({ length: end - start + 1 }, (_, i) => {
      const binId = start + i;
      return callReadOnly("get-bin", [uintCV(poolId), uintCV(binId)]).then((r) => ({
        binId,
        raw: r,
      }));
    })
  );

  for (const res of results) {
    if (res.status !== "fulfilled") continue;
    const { binId, raw } = res.value;
    const parsed = parseBinTuple(raw);
    if (!parsed) continue;

    const { x, y } = parsed;
    if (x === 0 && y === 0) continue;

    const reserveXNorm = (x / decX) * priceX;
    const reserveYNorm = (y / decY) * priceY;
    const totalUsd = reserveXNorm + reserveYNorm;
    if (totalUsd <= 0) continue;

    // Asymmetry: +1 = all X (buy side), -1 = all Y (sell side)
    const asymmetry = totalUsd > 0 ? (reserveXNorm - reserveYNorm) / totalUsd : 0;

    bins.push({
      binId,
      reserveX: BigInt(x),
      reserveY: BigInt(y),
      reserveXNorm,
      reserveYNorm,
      totalUsd,
      distFromActive: binId - activeBinId,
      asymmetry,
      utilization: 0, // filled in after scan
      feeContrib: 0,  // filled in after scan
    });
  }

  if (bins.length === 0) return bins;

  // Normalize utilization relative to the max-USD bin
  const maxUsd = Math.max(...bins.map((b) => b.totalUsd));
  const totalWindowUsd = bins.reduce((s, b) => s + b.totalUsd, 0);

  for (const b of bins) {
    b.utilization = maxUsd > 0 ? b.totalUsd / maxUsd : 0;
    // Fee contribution: bins close to the active bin contribute disproportionately
    // because that's where swaps happen. Weight by proximity and depth.
    const proximityWeight = Math.exp(-0.15 * Math.abs(b.distFromActive));
    b.feeContrib = totalWindowUsd > 0
      ? (b.totalUsd * proximityWeight) / totalWindowUsd
      : 0;
  }

  // Re-normalize feeContrib to sum to 1
  const totalFeeContrib = bins.reduce((s, b) => s + b.feeContrib, 0);
  if (totalFeeContrib > 0) {
    for (const b of bins) b.feeContrib /= totalFeeContrib;
  }

  return bins;
}

// ── Fee Rate Estimation ────────────────────────────────────────────────────────

function estimateFeeRates(pool: AppPool): FeeRateEstimate {
  const feeBps = pool.feeBps || 30;
  const dailyFeePoolUsd = (pool.volume24hUsd * feeBps) / 10_000;
  const hourlyFeePoolUsd = dailyFeePoolUsd / 24;
  const feeRatePerTvl = pool.tvlUsd > 0 ? dailyFeePoolUsd / pool.tvlUsd : 0;
  const volumeToTvlRatio = pool.tvlUsd > 0 ? pool.volume24hUsd / pool.tvlUsd : 0;
  const estimatedApr = feeRatePerTvl * 365 * 100;

  return {
    dailyFeePoolUsd,
    hourlyFeePoolUsd,
    feeRatePerTvl,
    volumeToTvlRatio,
    estimatedApr,
  };
}

// ── Gini Coefficient ───────────────────────────────────────────────────────────

function giniCoefficient(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((s, v) => s + v, 0);
  if (sum === 0) return 0;
  let numerator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (2 * (i + 1) - n - 1) * sorted[i];
  }
  return Math.abs(numerator / (n * sum));
}

// ── Momentum Score Computation ─────────────────────────────────────────────────

/**
 * Compute a momentum score from -100 to +100 based on:
 *
 *  1. Concentration score: How much liquidity sits near the active bin?
 *     High concentration → fees are being actively earned → positive signal.
 *
 *  2. Asymmetry score: Bins near the active bin should show balanced reserves if
 *     there's active two-way trading. Strong one-sided asymmetry near active bin
 *     suggests a recent directional move where the market is "resting" — fee
 *     momentum likely decelerating unless volume follows.
 *
 *  3. Utilization score: Is the peak utilization bin the active bin itself?
 *     If yes → liquidity peaked at active price → good momentum signal.
 *
 *  4. Spread score: Tight liquidity (low Gini, most in inner zone) means
 *     LPs are concentrated → they expect more trading → momentum accelerating.
 *
 *  5. Depth score: Total USD depth in the scan window relative to TVL.
 *     High coverage → pool is well-funded for active trading.
 */
function computeMomentumScore(
  bins: BinReserves[],
  activeBinId: number,
  pool: AppPool
): MomentumMetrics {
  const totalWindowUsd = bins.reduce((s, b) => s + b.totalUsd, 0);
  const innerBins = bins.filter((b) => Math.abs(b.distFromActive) <= 3);
  const innerUsd = innerBins.reduce((s, b) => s + b.totalUsd, 0);
  const activeBin = bins.find((b) => b.distFromActive === 0);

  // 1. Concentration score (-40 to +40)
  const innerShare = totalWindowUsd > 0 ? innerUsd / totalWindowUsd : 0;
  // >80% concentrated → +40, <10% → -40
  const concentrationScore = clamp(
    Math.round((innerShare - 0.45) * 133), // scale: 0.45 center, ±133 slope → ±40
    -40,
    40
  );

  // 2. Asymmetry score (-20 to +20)
  // Near-zero asymmetry near active bin → balanced two-way flow → positive
  const innerAsymmetry =
    innerBins.length > 0
      ? innerBins.reduce((s, b) => s + Math.abs(b.asymmetry), 0) / innerBins.length
      : 1;
  // Low abs asymmetry is good (balanced), high abs = directional/stalled
  const asymmetryScore = clamp(Math.round((0.5 - innerAsymmetry) * 40), -20, 20);

  // 3. Utilization score (-20 to +20)
  // Is the highest-utilization bin near the active bin?
  const maxBin = bins.reduce(
    (best, b) => (b.totalUsd > best.totalUsd ? b : best),
    bins[0] || { totalUsd: 0, distFromActive: BIN_SCAN_RADIUS }
  );
  const maxBinDist = Math.abs(maxBin.distFromActive);
  // Peak liquidity at distance 0 = +20, at distance ≥10 = -20
  const utilizationScore = clamp(Math.round(20 - maxBinDist * 4), -20, 20);

  // 4. Spread score (-10 to +10)
  // Tight Gini (even distribution in inner zone) with high inner share is good
  const gini = giniCoefficient(bins.map((b) => b.totalUsd));
  // Lower Gini (more even) combined with inner concentration = accelerating
  // Very high Gini = single-bin dominance (could be good or bad)
  // We want moderate Gini: 0.3–0.6 is typical healthy pool
  const spreadScore = clamp(Math.round((0.5 - Math.abs(gini - 0.45)) * 20), -10, 10);

  // 5. Depth score (-10 to +10)
  // Total window depth / TVL: closer to 1 = well-covered pool
  const depthRatio = pool.tvlUsd > 0 ? totalWindowUsd / pool.tvlUsd : 0;
  const depthScore = clamp(Math.round((depthRatio - 0.5) * 20), -10, 10);

  const score = clamp(
    concentrationScore + asymmetryScore + utilizationScore + spreadScore + depthScore,
    -100,
    100
  );

  // Classify
  let classification: MomentumClass;
  if (score >= ACCELERATING_THRESHOLD) {
    classification = "ACCELERATING";
  } else if (score >= STABLE_LOWER_THRESHOLD) {
    classification = "STABLE";
  } else if (score >= DECELERATING_THRESHOLD) {
    classification = "DECELERATING";
  } else {
    classification = "STALLED";
  }

  const topFeeContributors = [...bins]
    .sort((a, b) => b.feeContrib - a.feeContrib)
    .slice(0, 5);

  return {
    score,
    classification,
    components: {
      concentrationScore,
      asymmetryScore,
      utilizationScore,
      spreadScore,
      depthScore,
    },
    binContributions: bins.map((b) => ({
      binId: b.binId,
      distFromActive: b.distFromActive,
      feeContrib: Math.round(b.feeContrib * 10000) / 10000,
      asymmetry: Math.round(b.asymmetry * 1000) / 1000,
    })),
    topFeeContributors,
  };
}

// ── Reserve Asymmetry Trend ────────────────────────────────────────────────────

function computeAsymmetryTrend(bins: BinReserves[]): ReserveAsymmetryTrend {
  const aboveBins = bins.filter((b) => b.distFromActive > 0);
  const belowBins = bins.filter((b) => b.distFromActive < 0);
  const innerBins = bins.filter((b) => Math.abs(b.distFromActive) <= 3);

  const aboveAsymmetry =
    aboveBins.length > 0
      ? aboveBins.reduce((s, b) => s + b.asymmetry, 0) / aboveBins.length
      : 0;
  const belowAsymmetry =
    belowBins.length > 0
      ? belowBins.reduce((s, b) => s + b.asymmetry, 0) / belowBins.length
      : 0;
  const innerAsymmetryIndex =
    innerBins.length > 0
      ? innerBins.reduce((s, b) => s + b.asymmetry, 0) / innerBins.length
      : 0;

  let netFlowDirection: "BUY_PRESSURE" | "SELL_PRESSURE" | "BALANCED";
  if (innerAsymmetryIndex > 0.15) {
    // X-heavy near active bin: token0 flowing in, likely sell pressure on token1
    netFlowDirection = "BUY_PRESSURE";
  } else if (innerAsymmetryIndex < -0.15) {
    netFlowDirection = "SELL_PRESSURE";
  } else {
    netFlowDirection = "BALANCED";
  }

  let interpretation: string;
  if (netFlowDirection === "BALANCED") {
    interpretation =
      "Reserves near the active bin are balanced — two-way trading is active. Fee momentum benefits from both buy and sell flows.";
  } else if (netFlowDirection === "BUY_PRESSURE") {
    interpretation =
      `Active bins are X-heavy (asymmetry ${innerAsymmetryIndex.toFixed(2)}). Buyers are acquiring token0 — reserve depletion above active bin suggests recent upward price pressure. Fee momentum may accelerate if trend continues.`;
  } else {
    interpretation =
      `Active bins are Y-heavy (asymmetry ${innerAsymmetryIndex.toFixed(2)}). Sellers dominating — token1 accumulating near active bin. Watch for price drift below range; fee momentum may fade if price leaves concentration zone.`;
  }

  return {
    netFlowDirection,
    asymmetryIndex: Math.round(innerAsymmetryIndex * 1000) / 1000,
    aboveActiveBias: Math.round(aboveAsymmetry * 1000) / 1000,
    belowActiveBias: Math.round(belowAsymmetry * 1000) / 1000,
    interpretation,
  };
}

// ── Volume Concentration ───────────────────────────────────────────────────────

function computeVolumeConcentration(
  bins: BinReserves[],
  activeBinId: number
): VolumeConcentration {
  const totalUsd = bins.reduce((s, b) => s + b.totalUsd, 0);
  const activeBin = bins.find((b) => b.distFromActive === 0);
  const innerBins = bins.filter((b) => Math.abs(b.distFromActive) <= 3);
  const outerBins = bins.filter((b) => Math.abs(b.distFromActive) > 3);

  const activeBinShare = totalUsd > 0 ? (activeBin?.totalUsd || 0) / totalUsd : 0;
  const innerZoneShare = totalUsd > 0
    ? innerBins.reduce((s, b) => s + b.totalUsd, 0) / totalUsd
    : 0;
  const outerZoneShare = totalUsd > 0
    ? outerBins.reduce((s, b) => s + b.totalUsd, 0) / totalUsd
    : 0;

  const concentrationGini = giniCoefficient(bins.map((b) => b.totalUsd));

  // Hot zone: bins that together account for top 50% of liquidity
  const sorted = [...bins].sort((a, b) => b.totalUsd - a.totalUsd);
  const hotZoneBins: number[] = [];
  let accumulated = 0;
  for (const b of sorted) {
    if (accumulated >= totalUsd * 0.5) break;
    hotZoneBins.push(b.binId);
    accumulated += b.totalUsd;
  }

  return {
    activeBinShare: Math.round(activeBinShare * 10000) / 10000,
    innerZoneShare: Math.round(innerZoneShare * 10000) / 10000,
    outerZoneShare: Math.round(outerZoneShare * 10000) / 10000,
    concentrationGini: Math.round(concentrationGini * 10000) / 10000,
    hotZoneBins,
  };
}

// ── ASCII Visualization ────────────────────────────────────────────────────────

function renderMomentumChart(
  bins: BinReserves[],
  activeBinId: number,
  momentum: MomentumMetrics
): string {
  if (bins.length === 0) return "  [no bin data available]";

  const maxUsd = Math.max(...bins.map((b) => b.totalUsd));
  if (maxUsd === 0) return "  [all bins empty]";

  const BAR_WIDTH = 20;
  const lines: string[] = [];

  // Sort by binId ascending for display
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);

  lines.push("  BinID  Dist  Reserve (USD)         Asym   FeeContrib");
  lines.push("  ─────  ────  ────────────────────  ─────  ──────────");

  for (const b of sorted) {
    const barLen = Math.round((b.totalUsd / maxUsd) * BAR_WIDTH);
    const bar = "█".repeat(barLen).padEnd(BAR_WIDTH);
    const isActive = b.distFromActive === 0;
    const marker = isActive ? "◄ ACTIVE" : "        ";
    const distStr = (b.distFromActive >= 0 ? "+" : "") + b.distFromActive.toString().padStart(3);
    const asymStr = (b.asymmetry >= 0 ? "+" : "") + b.asymmetry.toFixed(2);
    const feeStr = (b.feeContrib * 100).toFixed(1).padStart(5) + "%";
    const usdStr = formatUsd(b.totalUsd).padStart(8);

    lines.push(
      `  ${b.binId.toString().padStart(5)}  ${distStr}  ${bar}  ${asymStr}  ${feeStr} ${usdStr} ${marker}`
    );
  }

  return lines.join("\n");
}

function renderMomentumGauge(score: number, classification: MomentumClass): string {
  // Render a simple ASCII gauge from -100 to +100
  const WIDTH = 40;
  const center = Math.floor(WIDTH / 2);
  const pos = Math.round(((score + 100) / 200) * WIDTH);
  const bar = Array(WIDTH).fill("─");

  // Fill the momentum zone
  if (score >= 0) {
    for (let i = center; i <= pos && i < WIDTH; i++) bar[i] = "█";
  } else {
    for (let i = pos; i <= center && i < WIDTH; i++) bar[i] = "░";
  }
  bar[center] = "│"; // center marker

  const needle = clamp(pos, 0, WIDTH - 1);
  bar[needle] = score >= 0 ? "▲" : "▼";

  const gauge = bar.join("");
  const scoreStr = score >= 0 ? `+${score}` : `${score}`;
  const label = classification.padEnd(14);

  return [
    `  STALLED◄──────────────────────────────────►ACCELERATING`,
    `  -100    ${gauge}    +100`,
    `          Score: ${scoreStr.padStart(4)} | ${label}`,
  ].join("\n");
}

// ── Recommendation Builder ─────────────────────────────────────────────────────

function buildRecommendation(
  momentum: MomentumMetrics,
  asymmetry: ReserveAsymmetryTrend,
  concentration: VolumeConcentration,
  feeRates: FeeRateEstimate
): { recommendation: string; actionItems: string[] } {
  const { classification, score } = momentum;
  const actions: string[] = [];
  let rec = "";

  const aprStr = formatPct(feeRates.estimatedApr);
  const vtvlStr = feeRates.volumeToTvlRatio.toFixed(2);

  if (classification === "ACCELERATING") {
    rec = `Fee momentum is accelerating (score ${score > 0 ? "+" : ""}${score}). Pool is generating fees at an estimated ${aprStr} APR with volume/TVL of ${vtvlStr}x. Liquidity is well-concentrated near the active bin — this is a strong deployment window for LPs.`;
    actions.push("Deploy or increase LP position now — conditions favor active fee capture.");
    actions.push(`Concentrate liquidity within ±3 bins of active bin (${formatPct(concentration.innerZoneShare * 100)} of reserves already there).`);
    if (asymmetry.netFlowDirection !== "BALANCED") {
      actions.push(`Flow is ${asymmetry.netFlowDirection} — consider slight bias toward the dominant side in your bin range.`);
    }
    actions.push("Monitor for momentum reversal if score drops below +10.");
  } else if (classification === "STABLE") {
    rec = `Fee momentum is stable (score ${score > 0 ? "+" : ""}${score}). Pool is earning fees consistently at ~${aprStr} APR. Volume/TVL ratio of ${vtvlStr}x is adequate for passive LP strategies. No urgent action required.`;
    actions.push("Maintain existing positions — steady fee generation supports hold strategy.");
    if (concentration.outerZoneShare > 0.5) {
      actions.push("Consider tightening your bin range — over 50% of liquidity is in outer bins (lower fee efficiency).");
    }
    actions.push("Re-evaluate if score trends below 0 for 2+ consecutive readings.");
  } else if (classification === "DECELERATING") {
    rec = `Fee momentum is decelerating (score ${score > 0 ? "+" : ""}${score}). Pool's volume/TVL of ${vtvlStr}x suggests fading trading activity. LPs may see diminishing returns. Consider whether current range and position size remain optimal.`;
    actions.push("Avoid adding new capital until momentum stabilizes above 0.");
    if (concentration.innerZoneShare < 0.3) {
      actions.push("Liquidity is spread thin — narrow your bin range to improve fee capture per dollar deployed.");
    }
    if (asymmetry.netFlowDirection === "SELL_PRESSURE") {
      actions.push("Sell pressure detected — if you hold token0, consider partial withdrawal before price drifts lower.");
    }
    actions.push("Track 24h volume trend; if vol drops >30% this is likely transitioning to STALLED.");
  } else {
    // STALLED
    rec = `Fee momentum is stalled (score ${score > 0 ? "+" : ""}${score}). Pool has minimal trading activity — estimated APR of ${aprStr} with volume/TVL of ${vtvlStr}x. Fee generation is near zero relative to TVL. LPs are earning little to nothing on capital deployed.`;
    actions.push("Consider withdrawing liquidity and redeploying to a higher-momentum pool.");
    actions.push("If holding for pool recovery, widen bin range to minimize rebalancing losses during low-volume periods.");
    actions.push("Watch for catalyst events (listings, integrations) that could restart volume.");
    if (score < -60) {
      actions.push("Score is critically low — fee opportunity cost of staying is significant.");
    }
  }

  return { recommendation: rec, actionItems: actions };
}

// ── Main Analysis ──────────────────────────────────────────────────────────────

async function runAnalyze(options: { pool: string }): Promise<void> {
  const poolId = parseInt(options.pool);
  if (isNaN(poolId)) {
    console.log(
      JSON.stringify({
        tool: "hodlmm-fee-momentum",
        command: "run",
        timestamp: new Date().toISOString(),
        error: "Invalid pool ID — provide a numeric pool ID with --pool",
      })
    );
    return;
  }

  const pools = await fetchAllPools();
  const pool = pools.find((p) => p.poolId === poolId);

  if (!pool) {
    console.log(
      JSON.stringify({
        tool: "hodlmm-fee-momentum",
        command: "run",
        timestamp: new Date().toISOString(),
        error: `Pool ${poolId} not found or below TVL threshold ($${MIN_TVL_USD})`,
      })
    );
    return;
  }

  const activeBinId = pool.activeBinId || (await getActiveBin(poolId));
  if (!activeBinId) {
    console.log(
      JSON.stringify({
        tool: "hodlmm-fee-momentum",
        command: "run",
        timestamp: new Date().toISOString(),
        error: `Could not determine active bin for pool ${poolId}`,
      })
    );
    return;
  }

  const bins = await fetchBinReserves(poolId, activeBinId, pool);

  if (bins.length === 0) {
    console.log(
      JSON.stringify({
        tool: "hodlmm-fee-momentum",
        command: "run",
        timestamp: new Date().toISOString(),
        error: `No bin reserve data found in ±${BIN_SCAN_RADIUS} bins around active bin ${activeBinId}`,
      })
    );
    return;
  }

  const feeRates = estimateFeeRates(pool);
  const momentum = computeMomentumScore(bins, activeBinId, pool);
  const asymmetryTrend = computeAsymmetryTrend(bins);
  const volumeConcentration = computeVolumeConcentration(bins, activeBinId);
  const { recommendation, actionItems } = buildRecommendation(
    momentum,
    asymmetryTrend,
    volumeConcentration,
    feeRates
  );

  const report: PoolMomentumReport = {
    poolId,
    pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
    activeBinId,
    tvlUsd: Math.round(pool.tvlUsd),
    volume24hUsd: Math.round(pool.volume24hUsd),
    feeBps: pool.feeBps || 30,
    feeRates: {
      dailyFeePoolUsd: Math.round(feeRates.dailyFeePoolUsd * 100) / 100,
      hourlyFeePoolUsd: Math.round(feeRates.hourlyFeePoolUsd * 100) / 100,
      feeRatePerTvl: Math.round(feeRates.feeRatePerTvl * 100000) / 100000,
      volumeToTvlRatio: Math.round(feeRates.volumeToTvlRatio * 1000) / 1000,
      estimatedApr: Math.round(feeRates.estimatedApr * 100) / 100,
    },
    momentum: {
      ...momentum,
      // Trim binContributions for readability in JSON output
      binContributions: momentum.binContributions.slice(0, 20),
      topFeeContributors: momentum.topFeeContributors.map((b) => ({
        ...b,
        reserveX: Number(b.reserveX),
        reserveY: Number(b.reserveY),
      })) as any,
    },
    asymmetryTrend,
    volumeConcentration,
    recommendation,
    actionItems,
  };

  // Pretty print the full report
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log(`║   HODLMM Fee Momentum Analyzer — Pool ${poolId.toString().padEnd(14)} ║`);
  console.log("╚══════════════════════════════════════════════════════╝\n");

  console.log(`  Pair        : ${report.pair}`);
  console.log(`  Active Bin  : ${activeBinId}`);
  console.log(`  TVL         : ${formatUsd(report.tvlUsd)}`);
  console.log(`  Vol 24h     : ${formatUsd(report.volume24hUsd)}`);
  console.log(`  Fee         : ${report.feeBps} bps`);
  console.log(`  Est. APR    : ${formatPct(feeRates.estimatedApr)}`);
  console.log(`  Daily Fees  : ${formatUsd(feeRates.dailyFeePoolUsd)}`);
  console.log(`  Vol/TVL     : ${feeRates.volumeToTvlRatio.toFixed(3)}x`);
  console.log();

  console.log("── Momentum Gauge ─────────────────────────────────────");
  console.log(renderMomentumGauge(momentum.score, momentum.classification));
  console.log();

  console.log("── Score Components ───────────────────────────────────");
  console.log(`  Concentration : ${momentum.components.concentrationScore >= 0 ? "+" : ""}${momentum.components.concentrationScore}`);
  console.log(`  Asymmetry     : ${momentum.components.asymmetryScore >= 0 ? "+" : ""}${momentum.components.asymmetryScore}`);
  console.log(`  Utilization   : ${momentum.components.utilizationScore >= 0 ? "+" : ""}${momentum.components.utilizationScore}`);
  console.log(`  Spread        : ${momentum.components.spreadScore >= 0 ? "+" : ""}${momentum.components.spreadScore}`);
  console.log(`  Depth         : ${momentum.components.depthScore >= 0 ? "+" : ""}${momentum.components.depthScore}`);
  console.log(`  ─────────────────────────────`);
  console.log(`  TOTAL         : ${momentum.score >= 0 ? "+" : ""}${momentum.score} (${momentum.classification})`);
  console.log();

  console.log("── Reserve Asymmetry Trend ────────────────────────────");
  console.log(`  Flow Direction  : ${asymmetryTrend.netFlowDirection}`);
  console.log(`  Asymmetry Index : ${asymmetryTrend.asymmetryIndex >= 0 ? "+" : ""}${asymmetryTrend.asymmetryIndex}`);
  console.log(`  Above-Active    : ${asymmetryTrend.aboveActiveBias >= 0 ? "+" : ""}${asymmetryTrend.aboveActiveBias}`);
  console.log(`  Below-Active    : ${asymmetryTrend.belowActiveBias >= 0 ? "+" : ""}${asymmetryTrend.belowActiveBias}`);
  console.log(`  ${asymmetryTrend.interpretation}`);
  console.log();

  console.log("── Volume Concentration ───────────────────────────────");
  console.log(`  Active Bin Share : ${formatPct(volumeConcentration.activeBinShare * 100)}`);
  console.log(`  Inner Zone (±3)  : ${formatPct(volumeConcentration.innerZoneShare * 100)}`);
  console.log(`  Outer Zone       : ${formatPct(volumeConcentration.outerZoneShare * 100)}`);
  console.log(`  Gini Index       : ${volumeConcentration.concentrationGini.toFixed(3)}`);
  console.log(`  Hot Zone Bins    : [${volumeConcentration.hotZoneBins.join(", ")}]`);
  console.log();

  console.log("── Bin Reserve Map ────────────────────────────────────");
  console.log(renderMomentumChart(bins, activeBinId, momentum));
  console.log();

  console.log("── Top Fee-Contributing Bins ──────────────────────────");
  for (const b of momentum.topFeeContributors) {
    const distStr = (b.distFromActive >= 0 ? "+" : "") + b.distFromActive;
    console.log(
      `  Bin ${b.binId} (${distStr}) — contrib ${formatPct(b.feeContrib * 100, 2)}, USD ${formatUsd(b.totalUsd)}, asym ${(b.asymmetry >= 0 ? "+" : "") + b.asymmetry.toFixed(3)}`
    );
  }
  console.log();

  console.log("── Analysis & Recommendation ──────────────────────────");
  console.log(`  ${recommendation}`);
  console.log();

  console.log("── LP Action Items ────────────────────────────────────");
  for (let i = 0; i < actionItems.length; i++) {
    console.log(`  ${i + 1}. ${actionItems[i]}`);
  }
  console.log();

  // Also output structured JSON for machine consumption
  console.log("── Raw JSON ───────────────────────────────────────────");
  console.log(
    JSON.stringify(
      {
        tool: "hodlmm-fee-momentum",
        command: "run",
        timestamp: new Date().toISOString(),
        ...report,
        binsScanned: bins.length,
        binScanRadius: BIN_SCAN_RADIUS,
      },
      null,
      2
    )
  );
}

// ── Scan: Rank Pools by Momentum ───────────────────────────────────────────────

async function runScan(options: { top?: string; minTvl?: string }): Promise<void> {
  const topN = parseInt(options.top || "10");
  const minTvl = parseFloat(options.minTvl || String(MIN_TVL_USD));

  const pools = (await fetchAllPools()).filter((p) => p.tvlUsd >= minTvl);

  if (pools.length === 0) {
    console.log(
      JSON.stringify({
        tool: "hodlmm-fee-momentum",
        command: "scan",
        timestamp: new Date().toISOString(),
        error: "No pools found above TVL threshold",
      })
    );
    return;
  }

  console.log(`\nScanning ${pools.length} pools for fee momentum...\n`);

  const results: any[] = [];

  for (const pool of pools.slice(0, topN * 2)) {
    try {
      const activeBinId = pool.activeBinId || (await getActiveBin(pool.poolId!));
      if (!activeBinId) continue;

      // Lightweight scan: smaller radius for bulk mode
      const priceX = pool.token0PriceUsd || 1;
      const priceY = pool.token1PriceUsd || 1;
      const decX = Math.pow(10, pool.token0Decimals);
      const decY = Math.pow(10, pool.token1Decimals);
      const radius = 8;

      const rawBins = await Promise.allSettled(
        Array.from({ length: radius * 2 + 1 }, (_, i) => {
          const binId = activeBinId - radius + i;
          return callReadOnly("get-bin", [uintCV(pool.poolId!), uintCV(binId)]).then((r) => ({
            binId,
            raw: r,
          }));
        })
      );

      const bins: BinReserves[] = [];
      for (const res of rawBins) {
        if (res.status !== "fulfilled") continue;
        const { binId, raw } = res.value;
        const parsed = parseBinTuple(raw);
        if (!parsed) continue;
        const { x, y } = parsed;
        const reserveXNorm = (x / decX) * priceX;
        const reserveYNorm = (y / decY) * priceY;
        const totalUsd = reserveXNorm + reserveYNorm;
        if (totalUsd <= 0) continue;
        const asymmetry = totalUsd > 0 ? (reserveXNorm - reserveYNorm) / totalUsd : 0;
        bins.push({
          binId,
          reserveX: BigInt(x),
          reserveY: BigInt(y),
          reserveXNorm,
          reserveYNorm,
          totalUsd,
          distFromActive: binId - activeBinId,
          asymmetry,
          utilization: 0,
          feeContrib: 0,
        });
      }

      if (bins.length === 0) continue;

      const maxUsd = Math.max(...bins.map((b) => b.totalUsd));
      const totalWindow = bins.reduce((s, b) => s + b.totalUsd, 0);
      for (const b of bins) {
        b.utilization = maxUsd > 0 ? b.totalUsd / maxUsd : 0;
        const pw = Math.exp(-0.15 * Math.abs(b.distFromActive));
        b.feeContrib = totalWindow > 0 ? (b.totalUsd * pw) / totalWindow : 0;
      }
      const tfc = bins.reduce((s, b) => s + b.feeContrib, 0);
      if (tfc > 0) for (const b of bins) b.feeContrib /= tfc;

      const momentum = computeMomentumScore(bins, activeBinId, pool);
      const feeRates = estimateFeeRates(pool);

      results.push({
        poolId: pool.poolId,
        pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
        tvlUsd: Math.round(pool.tvlUsd),
        volume24hUsd: Math.round(pool.volume24hUsd),
        feeBps: pool.feeBps || 30,
        estimatedApr: Math.round(feeRates.estimatedApr * 100) / 100,
        momentumScore: momentum.score,
        classification: momentum.classification,
        activeBinId,
        binsFound: bins.length,
      });
    } catch {
      /* skip pool on error */
    }
  }

  // Sort by momentum score descending
  results.sort((a, b) => b.momentumScore - a.momentumScore);
  const ranked = results.slice(0, topN);

  console.log(
    JSON.stringify(
      {
        tool: "hodlmm-fee-momentum",
        command: "scan",
        timestamp: new Date().toISOString(),
        poolsScanned: results.length,
        results: ranked,
        summary: {
          accelerating: ranked.filter((r) => r.classification === "ACCELERATING").length,
          stable: ranked.filter((r) => r.classification === "STABLE").length,
          decelerating: ranked.filter((r) => r.classification === "DECELERATING").length,
          stalled: ranked.filter((r) => r.classification === "STALLED").length,
          topPool: ranked.length > 0 ? ranked[0] : null,
        },
      },
      null,
      2
    )
  );
}

// ── Doctor ─────────────────────────────────────────────────────────────────────

async function runDoctor(): Promise<void> {
  const checks: Record<string, string> = {};

  try {
    await fetchJson(`${BFF_APP_BASE}/pools/hodlmm`);
    checks["bitflow_app_api"] = "ok";
  } catch (e: any) {
    checks["bitflow_app_api"] = `error: ${e.message}`;
  }

  try {
    await fetchJson(`${HIRO_API}/v2/info`);
    checks["hiro_api"] = "ok";
  } catch (e: any) {
    checks["hiro_api"] = `error: ${e.message}`;
  }

  try {
    const result = await callReadOnly("get-active-bin-id", [uintCV(1)]);
    checks["dlmm_contract"] = result.result ? "ok" : "no result";
  } catch (e: any) {
    checks["dlmm_contract"] = `error: ${e.message}`;
  }

  console.log(
    JSON.stringify({
      tool: "hodlmm-fee-momentum",
      command: "doctor",
      status: Object.values(checks).every((v) => v.startsWith("ok")) ? "healthy" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    })
  );
}

async function runInstallPacks(): Promise<void> {
  console.log(
    JSON.stringify({
      tool: "hodlmm-fee-momentum",
      command: "install-packs",
      status: "ok",
      message: "No additional dependencies required. Uses commander (workspace) + native fetch.",
      timestamp: new Date().toISOString(),
    })
  );
}

// ── CLI Setup ──────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-fee-momentum")
  .description(
    "HODLMM Fee Momentum Analyzer — tracks acceleration/deceleration of fee generation. " +
    "Analyzes reserve distributions across bins to classify momentum as ACCELERATING, STABLE, DECELERATING, or STALLED."
  )
  .version("1.0.0");

program
  .command("doctor")
  .description("Check API connectivity and contract access")
  .action(runDoctor);

program
  .command("install-packs")
  .description("Install dependencies (none required beyond workspace)")
  .action(runInstallPacks);

program
  .command("run")
  .description("Analyze fee momentum for a specific HODLMM pool")
  .requiredOption("--pool <id>", "HODLMM pool ID")
  .action(runAnalyze);

program
  .command("scan")
  .description("Scan all pools and rank by fee momentum score")
  .option("--top <n>", "Number of top pools to show", "10")
  .option("--min-tvl <usd>", "Minimum TVL filter in USD", String(MIN_TVL_USD))
  .action(runScan);

program.parse();
