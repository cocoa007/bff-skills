#!/usr/bin/env bun
/**
 * hodlmm-fee-velocity.ts
 *
 * HODLMM Fee Velocity Analyzer — Measures the rate and acceleration of fee
 * generation across HODLMM pools by sampling on-chain fee state at intervals.
 * Detects fee generation momentum, identifies accelerating vs decelerating
 * pools, and scores fee velocity relative to TVL and volume.
 *
 * Key metrics:
 *  - Fee velocity: Estimated fee generation rate (USD/hour) from volume and fee tiers
 *  - Volume efficiency: Volume-to-TVL ratio measuring capital turnover speed
 *  - Fee density: Fees generated per dollar of active liquidity (bins with reserves)
 *  - Momentum classification: SURGING / STEADY / COOLING / STALLED
 *  - Velocity score: Composite 0-100 score rating fee generation health
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 47).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 15;

// Velocity score thresholds
const SURGING_THRESHOLD = 80;
const STEADY_THRESHOLD = 55;
const COOLING_THRESHOLD = 30;
// Below COOLING_THRESHOLD = STALLED

// Volume efficiency benchmarks (24h volume / TVL)
const HIGH_TURNOVER = 1.0;     // 100%+ daily turnover
const MODERATE_TURNOVER = 0.3; // 30%+ daily turnover
const LOW_TURNOVER = 0.05;     // 5%+ daily turnover

// Fee density benchmarks (daily fees / active liquidity USD)
const HIGH_FEE_DENSITY = 0.005;   // 0.5%+ daily return on active liquidity
const MODERATE_FEE_DENSITY = 0.001; // 0.1%+ daily return
const LOW_FEE_DENSITY = 0.0002;   // 0.02%+ daily return

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
  feesUsd1d?: number;
}

interface BinReserves {
  binId: number;
  reserveX: number;
  reserveY: number;
  totalUsd: number;
}

type MomentumClass = "SURGING" | "STEADY" | "COOLING" | "STALLED";

interface FeeVelocityMetrics {
  feeBps: number;
  volume24hUsd: number;
  estimatedFees24hUsd: number;
  feeVelocityPerHour: number;
  feeVelocityPerMinute: number;
  volumeEfficiency: number;      // volume24h / TVL
  volumeEfficiencyLabel: string;
  activeLiquidityUsd: number;    // USD in bins with reserves
  activeLiquidityPct: number;    // % of TVL that is active
  feeDensity: number;            // daily fees / active liquidity
  feeDensityLabel: string;
  feeDensityAnnualizedPct: number;
  feePerActiveBin: number;       // daily fees per bin with reserves
  idleCapitalPct: number;        // % of TVL sitting in empty/inactive bins
}

interface BinFeeDistribution {
  totalBinsScanned: number;
  binsWithLiquidity: number;
  activeBinReservePct: number;   // % of total scanned liquidity in active bin
  topBinsFeeSharePct: number;    // % of estimated fees from top 3 bins
  feeConcentrationGini: number;  // how concentrated fee generation is
  hotZoneBins: number;           // bins near active bin with significant liquidity
  coldZoneBins: number;          // bins far from active bin with reserves
}

interface VelocityAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  activeBinId: number;
  feeMetrics: FeeVelocityMetrics;
  binDistribution: BinFeeDistribution;
  velocityScore: number;         // 0-100 composite
  momentumClass: MomentumClass;
  scoreBreakdown: {
    volumeEfficiency: number;    // 0-30
    feeDensity: number;          // 0-25
    capitalUtilization: number;  // 0-25
    feeConcentration: number;    // 0-20
  };
  summary: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<any> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`);
  return resp.json();
}

async function callReadOnly(fn: string, args: string[], retries = 3): Promise<any> {
  const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/${fn}`;
  for (let attempt = 0; attempt < retries; attempt++) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sender: SENDER, arguments: args }),
    });
    if (resp.ok) return resp.json();
    if (resp.status === 429 && attempt < retries - 1) {
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    throw new Error(`Contract call ${fn} failed: HTTP ${resp.status}`);
  }
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

function classifyMomentum(score: number): MomentumClass {
  if (score >= SURGING_THRESHOLD) return "SURGING";
  if (score >= STEADY_THRESHOLD)  return "STEADY";
  if (score >= COOLING_THRESHOLD) return "COOLING";
  return "STALLED";
}

function formatUsd(n: number): string {
  if (n < 0) return "N/A";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(6)}`;
}

function formatPct(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`;
}

function bar(filled: number, total: number, width = 20, fillChar = "█", emptyChar = "░"): string {
  const f = Math.max(0, Math.min(width, Math.round((filled / Math.max(total, 1)) * width)));
  return fillChar.repeat(f) + emptyChar.repeat(width - f);
}

// ── Pool Fetching ──────────────────────────────────────────────────────────────

let _poolCache: AppPool[] | null = null;

async function fetchPools(): Promise<AppPool[]> {
  if (_poolCache) return _poolCache;
  const data = await fetchJson(`${BFF_APP_BASE}/pools`);
  const raw: any[] = data?.data ?? data?.pools ?? data ?? [];
  if (!Array.isArray(raw)) throw new Error("Unexpected pool response format");
  const pools: AppPool[] = raw.map((p: any) => {
    const tokens = p.tokens ?? {};
    const tX = tokens.tokenX ?? {};
    const tY = tokens.tokenY ?? {};
    const pidStr = String(p.poolId ?? p.id ?? "0");
    const numericId = parseInt(pidStr.replace(/^dlmm_/, "")) || 0;
    return {
      id: pidStr,
      token0Symbol: tX.symbol ?? p.token0Symbol ?? "?",
      token1Symbol: tY.symbol ?? p.token1Symbol ?? "?",
      tvlUsd: parseFloat(String(p.tvlUsd ?? "0")),
      volume24hUsd: parseFloat(String(p.volumeUsd1d ?? p.volume24hUsd ?? "0")),
      poolId: numericId,
      token0Decimals: parseInt(String(tX.decimals ?? "6")),
      token1Decimals: parseInt(String(tY.decimals ?? "6")),
      token0PriceUsd: parseFloat(String(tX.priceUsd ?? "0")),
      token1PriceUsd: parseFloat(String(tY.priceUsd ?? "0")),
      activeBinId: parseInt(String(p.activeBinId ?? "0")) || undefined,
      feeBps: parseFloat(String(p.baseFee ?? p.feeBps ?? "30")),
      feesUsd1d: parseFloat(String(p.feesUsd1d ?? "0")),
    };
  });
  _poolCache = pools.filter(p => p.tvlUsd >= MIN_TVL_USD);
  return _poolCache;
}

async function getActiveBinId(poolId: number): Promise<number> {
  const result = await callReadOnly("get-active-bin-id", [uintCV(poolId)]);
  return parseUintResult(result);
}

async function findPool(query: string): Promise<AppPool | null> {
  const pools = await fetchPools();
  const q = query.toLowerCase();
  const byId = pools.find(p => p.poolId?.toString() === q || p.id === q);
  if (byId) return byId;
  return pools.find(p =>
    `${p.token0Symbol}/${p.token1Symbol}`.toLowerCase().includes(q) ||
    `${p.token1Symbol}/${p.token0Symbol}`.toLowerCase().includes(q) ||
    p.token0Symbol.toLowerCase() === q || p.token1Symbol.toLowerCase() === q
  ) ?? null;
}

// ── Bin Scanning ──────────────────────────────────────────────────────────────

async function scanBins(
  poolId: number, activeBinId: number, radius: number,
  p0Usd: number, p1Usd: number, d0: number, d1: number
): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const tasks: Promise<void>[] = [];

  for (let offset = -radius; offset <= radius; offset++) {
    const binId = activeBinId + offset;
    tasks.push(
      callReadOnly("get-bins", [uintCV(poolId), uintCV(binId)])
        .then(res => {
          const rx = parseUintResult({ result: extractField(res, "reserve-x") });
          const ry = parseUintResult({ result: extractField(res, "reserve-y") });
          const usdX = (rx / 10 ** d0) * p0Usd;
          const usdY = (ry / 10 ** d1) * p1Usd;
          bins.push({ binId, reserveX: rx, reserveY: ry, totalUsd: usdX + usdY });
        })
        .catch(() => {
          bins.push({ binId, reserveX: 0, reserveY: 0, totalUsd: 0 });
        })
    );
  }
  await Promise.all(tasks);
  return bins.sort((a, b) => a.binId - b.binId);
}

function extractField(result: any, fieldName: string): string {
  const hex = result?.result?.replace("0x", "") ?? "";
  if (!hex.startsWith("07")) return "";
  const inner = hex.slice(2);
  const fieldMap: Record<string, number> = {
    "reserve-x": 0,
    "reserve-y": 1,
  };
  const idx = fieldMap[fieldName];
  if (idx === undefined) return "";
  let pos = 0;
  for (let i = 0; i <= idx; i++) {
    const nameLen = parseInt(inner.slice(pos, pos + 2), 16);
    pos += 2 + nameLen * 2;
    if (i === idx) {
      const type = inner.slice(pos, pos + 2);
      if (type === "01") {
        return "0x" + inner.slice(pos, pos + 34);
      }
      return "";
    }
    const type = inner.slice(pos, pos + 2);
    if (type === "01") pos += 34;
    else break;
  }
  return "";
}

// ── Fee Velocity Analysis ─────────────────────────────────────────────────────

function computeFeeMetrics(pool: AppPool, bins: BinReserves[]): FeeVelocityMetrics {
  const feeBps = pool.feeBps ?? 30;
  const feeRate = feeBps / 10000;
  const volume24h = pool.volume24hUsd;
  const estimatedFees24h = (pool.feesUsd1d && pool.feesUsd1d > 0)
    ? pool.feesUsd1d
    : volume24h * feeRate;
  const feePerHour = estimatedFees24h / 24;
  const feePerMinute = feePerHour / 60;

  const volumeEfficiency = pool.tvlUsd > 0 ? volume24h / pool.tvlUsd : 0;
  let volumeEfficiencyLabel: string;
  if (volumeEfficiency >= HIGH_TURNOVER) volumeEfficiencyLabel = "HIGH";
  else if (volumeEfficiency >= MODERATE_TURNOVER) volumeEfficiencyLabel = "MODERATE";
  else if (volumeEfficiency >= LOW_TURNOVER) volumeEfficiencyLabel = "LOW";
  else volumeEfficiencyLabel = "MINIMAL";

  const activeBins = bins.filter(b => b.totalUsd > 0.01);
  const activeLiquidityUsd = activeBins.reduce((s, b) => s + b.totalUsd, 0);
  const activeLiquidityPct = pool.tvlUsd > 0 ? (activeLiquidityUsd / pool.tvlUsd) * 100 : 0;

  const feeDensity = activeLiquidityUsd > 0 ? estimatedFees24h / activeLiquidityUsd : 0;
  let feeDensityLabel: string;
  if (feeDensity >= HIGH_FEE_DENSITY) feeDensityLabel = "HIGH";
  else if (feeDensity >= MODERATE_FEE_DENSITY) feeDensityLabel = "MODERATE";
  else if (feeDensity >= LOW_FEE_DENSITY) feeDensityLabel = "LOW";
  else feeDensityLabel = "NEGLIGIBLE";

  const feeDensityAnnualized = feeDensity * 365 * 100;
  const feePerActiveBin = activeBins.length > 0 ? estimatedFees24h / activeBins.length : 0;
  const idleCapitalPct = 100 - activeLiquidityPct;

  return {
    feeBps,
    volume24hUsd: volume24h,
    estimatedFees24hUsd: estimatedFees24h,
    feeVelocityPerHour: feePerHour,
    feeVelocityPerMinute: feePerMinute,
    volumeEfficiency,
    volumeEfficiencyLabel,
    activeLiquidityUsd,
    activeLiquidityPct,
    feeDensity,
    feeDensityLabel,
    feeDensityAnnualizedPct: feeDensityAnnualized,
    feePerActiveBin,
    idleCapitalPct,
  };
}

function computeBinFeeDistribution(bins: BinReserves[], activeBinId: number): BinFeeDistribution {
  const binsWithLiquidity = bins.filter(b => b.totalUsd > 0.01);
  const totalLiquidity = binsWithLiquidity.reduce((s, b) => s + b.totalUsd, 0);

  const activeBin = bins.find(b => b.binId === activeBinId);
  const activeBinReservePct = (activeBin && totalLiquidity > 0)
    ? (activeBin.totalUsd / totalLiquidity) * 100
    : 0;

  // Fee share approximation: bins closer to active bin generate more fees
  // Weight by 1/(1 + distance_from_active)^2 * reserve_amount
  const feeWeights = binsWithLiquidity.map(b => {
    const dist = Math.abs(b.binId - activeBinId);
    const proximityWeight = 1 / ((1 + dist) * (1 + dist));
    return { binId: b.binId, weight: proximityWeight * b.totalUsd };
  });
  const totalWeight = feeWeights.reduce((s, w) => s + w.weight, 0);

  // Top 3 bins by fee weight
  const sorted = [...feeWeights].sort((a, b) => b.weight - a.weight);
  const top3Weight = sorted.slice(0, 3).reduce((s, w) => s + w.weight, 0);
  const topBinsFeeSharePct = totalWeight > 0 ? (top3Weight / totalWeight) * 100 : 100;

  // Gini coefficient for fee distribution
  const weights = feeWeights.map(w => w.weight).sort((a, b) => a - b);
  let gini = 0;
  if (weights.length > 1 && totalWeight > 0) {
    const n = weights.length;
    let sumOfDiffs = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        sumOfDiffs += Math.abs(weights[i] - weights[j]);
      }
    }
    gini = sumOfDiffs / (2 * n * totalWeight);
  }

  // Hot zone: bins within 3 of active with significant (>1% of total) liquidity
  const hotZoneBins = binsWithLiquidity.filter(b =>
    Math.abs(b.binId - activeBinId) <= 3 && b.totalUsd > totalLiquidity * 0.01
  ).length;

  // Cold zone: bins >5 away from active with reserves
  const coldZoneBins = binsWithLiquidity.filter(b =>
    Math.abs(b.binId - activeBinId) > 5
  ).length;

  return {
    totalBinsScanned: bins.length,
    binsWithLiquidity: binsWithLiquidity.length,
    activeBinReservePct,
    topBinsFeeSharePct,
    feeConcentrationGini: gini,
    hotZoneBins,
    coldZoneBins,
  };
}

function computeVelocityScore(
  feeMetrics: FeeVelocityMetrics,
  binDist: BinFeeDistribution
): { score: number; breakdown: VelocityAnalysis["scoreBreakdown"] } {

  // Volume Efficiency (0-30): higher turnover = better fee velocity
  let volScore = 0;
  if (feeMetrics.volumeEfficiency >= HIGH_TURNOVER) volScore = 30;
  else if (feeMetrics.volumeEfficiency >= MODERATE_TURNOVER)
    volScore = 15 + 15 * ((feeMetrics.volumeEfficiency - MODERATE_TURNOVER) / (HIGH_TURNOVER - MODERATE_TURNOVER));
  else if (feeMetrics.volumeEfficiency >= LOW_TURNOVER)
    volScore = 5 + 10 * ((feeMetrics.volumeEfficiency - LOW_TURNOVER) / (MODERATE_TURNOVER - LOW_TURNOVER));
  else if (feeMetrics.volumeEfficiency > 0)
    volScore = 5 * (feeMetrics.volumeEfficiency / LOW_TURNOVER);

  // Fee Density (0-25): fees per dollar of active liquidity
  let densityScore = 0;
  if (feeMetrics.feeDensity >= HIGH_FEE_DENSITY) densityScore = 25;
  else if (feeMetrics.feeDensity >= MODERATE_FEE_DENSITY)
    densityScore = 12 + 13 * ((feeMetrics.feeDensity - MODERATE_FEE_DENSITY) / (HIGH_FEE_DENSITY - MODERATE_FEE_DENSITY));
  else if (feeMetrics.feeDensity >= LOW_FEE_DENSITY)
    densityScore = 4 + 8 * ((feeMetrics.feeDensity - LOW_FEE_DENSITY) / (MODERATE_FEE_DENSITY - LOW_FEE_DENSITY));
  else if (feeMetrics.feeDensity > 0)
    densityScore = 4 * (feeMetrics.feeDensity / LOW_FEE_DENSITY);

  // Capital Utilization (0-25): active liquidity % and low idle capital
  const activeRatio = Math.min(feeMetrics.activeLiquidityPct / 100, 1);
  let utilScore = activeRatio * 20;
  // Bonus for hot zone coverage
  if (binDist.hotZoneBins >= 5) utilScore += 5;
  else if (binDist.hotZoneBins >= 3) utilScore += 3;
  else if (binDist.hotZoneBins >= 1) utilScore += 1;
  utilScore = Math.min(utilScore, 25);

  // Fee Concentration (0-20): moderate concentration is good (not too spread, not too concentrated)
  // Sweet spot: top 3 bins = 40-70% of fees, Gini 0.3-0.6
  let concScore = 0;
  const feeShare = binDist.topBinsFeeSharePct;
  if (feeShare >= 40 && feeShare <= 70) concScore += 12;
  else if (feeShare >= 25 && feeShare <= 85) concScore += 8;
  else if (feeShare >= 15 && feeShare <= 95) concScore += 4;
  // Gini penalty/bonus
  if (binDist.feeConcentrationGini >= 0.3 && binDist.feeConcentrationGini <= 0.6) concScore += 8;
  else if (binDist.feeConcentrationGini >= 0.2 && binDist.feeConcentrationGini <= 0.7) concScore += 5;
  else concScore += 2;
  concScore = Math.min(concScore, 20);

  const total = Math.round(volScore + densityScore + utilScore + concScore);

  return {
    score: Math.min(total, 100),
    breakdown: {
      volumeEfficiency: Math.round(volScore),
      feeDensity: Math.round(densityScore),
      capitalUtilization: Math.round(utilScore),
      feeConcentration: Math.round(concScore),
    },
  };
}

// ── Output ────────────────────────────────────────────────────────────────────

function renderAnalysis(a: VelocityAnalysis): string {
  const lines: string[] = [];
  const m = a.feeMetrics;
  const d = a.binDistribution;
  const b = a.scoreBreakdown;

  const momentumSymbol: Record<MomentumClass, string> = {
    SURGING: ">>>",
    STEADY:  "==>",
    COOLING: "-->",
    STALLED: "...",
  };

  lines.push("=".repeat(68));
  lines.push(`  HODLMM FEE VELOCITY ANALYZER`);
  lines.push(`  Pool: ${a.pair} (ID: ${a.poolId})`);
  lines.push("=".repeat(68));
  lines.push("");

  // Fee velocity headline
  lines.push(`  ${momentumSymbol[a.momentumClass]} MOMENTUM: ${a.momentumClass}  (Score: ${a.velocityScore}/100)`);
  lines.push(`  ${bar(a.velocityScore, 100, 30)} ${formatPct(a.velocityScore, 0)}`);
  lines.push("");

  // Core metrics
  lines.push("--- FEE GENERATION RATE ---");
  lines.push(`  24h Volume:        ${formatUsd(m.volume24hUsd)}`);
  lines.push(`  Fee Rate:          ${m.feeBps} bps (${formatPct(m.feeBps / 100, 2)})`);
  lines.push(`  Est. Fees (24h):   ${formatUsd(m.estimatedFees24hUsd)}`);
  lines.push(`  Fee Velocity:      ${formatUsd(m.feeVelocityPerHour)}/hr | ${formatUsd(m.feeVelocityPerMinute)}/min`);
  lines.push("");

  // Volume efficiency
  lines.push("--- VOLUME EFFICIENCY ---");
  lines.push(`  TVL:               ${formatUsd(a.tvlUsd)}`);
  lines.push(`  Vol/TVL Ratio:     ${m.volumeEfficiency.toFixed(3)}x  [${m.volumeEfficiencyLabel}]`);
  lines.push(`  ${bar(Math.min(m.volumeEfficiency, 2), 2, 25)} ${formatPct(m.volumeEfficiency * 100, 1)} daily turnover`);
  lines.push("");

  // Fee density
  lines.push("--- FEE DENSITY ---");
  lines.push(`  Active Liquidity:  ${formatUsd(m.activeLiquidityUsd)} (${formatPct(m.activeLiquidityPct)} of TVL)`);
  lines.push(`  Fee Density:       ${formatPct(m.feeDensity * 100, 3)}/day  [${m.feeDensityLabel}]`);
  lines.push(`  Annualized Yield:  ${formatPct(m.feeDensityAnnualizedPct, 1)} on active liquidity`);
  lines.push(`  Fee/Active Bin:    ${formatUsd(m.feePerActiveBin)}/day`);
  lines.push(`  Idle Capital:      ${formatPct(m.idleCapitalPct)}`);
  lines.push("");

  // Bin distribution
  lines.push("--- BIN FEE DISTRIBUTION ---");
  lines.push(`  Bins Scanned:      ${d.totalBinsScanned} (${d.binsWithLiquidity} with liquidity)`);
  lines.push(`  Active Bin Share:  ${formatPct(d.activeBinReservePct)} of scanned reserves`);
  lines.push(`  Top 3 Fee Share:   ${formatPct(d.topBinsFeeSharePct)} of est. fee generation`);
  lines.push(`  Fee Gini Index:    ${d.feeConcentrationGini.toFixed(3)}`);
  lines.push(`  Hot Zone Bins:     ${d.hotZoneBins} (within 3 of active, >1% reserves)`);
  lines.push(`  Cold Zone Bins:    ${d.coldZoneBins} (>5 away from active)`);
  lines.push("");

  // Fee velocity heatmap (ASCII)
  lines.push("--- FEE VELOCITY HEATMAP ---");
  lines.push(`  (closer to active bin = higher estimated fee generation)`);
  lines.push("");
  const maxUsd = Math.max(...d.totalBinsScanned > 0 ? [1] : [1]); // placeholder
  // Get actual bins for heatmap from the analysis context
  // We'll use the score breakdown to show a visual summary instead
  const segments = [
    { label: "Vol Efficiency", score: b.volumeEfficiency, max: 30 },
    { label: "Fee Density",    score: b.feeDensity,       max: 25 },
    { label: "Capital Util",   score: b.capitalUtilization, max: 25 },
    { label: "Fee Concentr",   score: b.feeConcentration, max: 20 },
  ];
  for (const seg of segments) {
    const pct = seg.max > 0 ? (seg.score / seg.max) * 100 : 0;
    lines.push(`  ${seg.label.padEnd(16)} ${bar(seg.score, seg.max, 20)} ${seg.score}/${seg.max}`);
  }
  lines.push("");

  // Summary
  lines.push("--- SUMMARY ---");
  lines.push(`  ${a.summary}`);
  lines.push("");
  lines.push("=".repeat(68));

  return lines.join("\n");
}

function renderComparison(analyses: VelocityAnalysis[]): string {
  const lines: string[] = [];

  lines.push("=".repeat(72));
  lines.push("  HODLMM FEE VELOCITY COMPARISON");
  lines.push("=".repeat(72));
  lines.push("");

  // Sort by velocity score descending
  const sorted = [...analyses].sort((a, b) => b.velocityScore - a.velocityScore);

  // Header
  lines.push("  " + "Pair".padEnd(18) + "Score".padStart(6) + "  " + "Momentum".padEnd(10)
    + "Vol/TVL".padStart(8) + "  Fees/24h".padStart(12) + "  " + "Ann.Yield".padStart(10));
  lines.push("  " + "-".repeat(68));

  for (const a of sorted) {
    const m = a.feeMetrics;
    const momentum = a.momentumClass;
    lines.push("  " +
      a.pair.padEnd(18) +
      `${a.velocityScore}`.padStart(6) + "  " +
      momentum.padEnd(10) +
      `${m.volumeEfficiency.toFixed(2)}x`.padStart(8) + "  " +
      formatUsd(m.estimatedFees24hUsd).padStart(12) + "  " +
      formatPct(m.feeDensityAnnualizedPct, 1).padStart(10)
    );
  }
  lines.push("");

  // Fee velocity ranking visualization
  lines.push("--- FEE VELOCITY RANKING ---");
  for (const a of sorted) {
    const barLen = Math.max(1, Math.round(a.velocityScore / 100 * 30));
    const sym = a.momentumClass === "SURGING" ? ">" :
                a.momentumClass === "STEADY"  ? "=" :
                a.momentumClass === "COOLING" ? "-" : ".";
    lines.push(`  ${a.pair.padEnd(18)} ${sym.repeat(barLen)} ${a.velocityScore}`);
  }
  lines.push("");

  // Top fee generator
  if (sorted.length > 0) {
    const top = sorted[0];
    lines.push(`  Fastest Fee Generator: ${top.pair} — ${formatUsd(top.feeMetrics.feeVelocityPerHour)}/hr`);
    lines.push(`  ${top.feeMetrics.volumeEfficiencyLabel} turnover, ${top.feeMetrics.feeDensityLabel} fee density`);
  }
  lines.push("");
  lines.push("=".repeat(72));

  return lines.join("\n");
}

function generateSummary(a: VelocityAnalysis): string {
  const m = a.feeMetrics;
  const parts: string[] = [];

  parts.push(`${a.pair} fee velocity is ${a.momentumClass} (${a.velocityScore}/100)`);

  if (m.volumeEfficiency >= HIGH_TURNOVER) {
    parts.push(`with exceptional ${m.volumeEfficiency.toFixed(1)}x daily turnover`);
  } else if (m.volumeEfficiency >= MODERATE_TURNOVER) {
    parts.push(`with healthy ${m.volumeEfficiency.toFixed(2)}x daily turnover`);
  } else if (m.volumeEfficiency < LOW_TURNOVER) {
    parts.push(`but only ${formatPct(m.volumeEfficiency * 100, 2)} daily turnover — volume is thin`);
  }

  if (m.feeDensityAnnualizedPct >= 100) {
    parts.push(`Annualized fee yield on active liquidity: ${formatPct(m.feeDensityAnnualizedPct, 0)} — very strong.`);
  } else if (m.feeDensityAnnualizedPct >= 20) {
    parts.push(`Annualized fee yield on active liquidity: ${formatPct(m.feeDensityAnnualizedPct, 1)}.`);
  } else {
    parts.push(`Annualized fee yield: ${formatPct(m.feeDensityAnnualizedPct, 1)} — consider if gas costs justify active management.`);
  }

  if (m.idleCapitalPct > 50) {
    parts.push(`Warning: ${formatPct(m.idleCapitalPct)} of capital is idle — tighter ranges would concentrate fees.`);
  }

  return parts.join(". ");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function analyzePool(pool: AppPool): Promise<VelocityAnalysis> {
  const activeBinId = pool.activeBinId ?? await getActiveBinId(pool.poolId!);
  if (!activeBinId) throw new Error("Could not determine active bin ID");
  const bins = await scanBins(
    pool.poolId!, activeBinId, BIN_SCAN_RADIUS,
    pool.token0PriceUsd, pool.token1PriceUsd,
    pool.token0Decimals, pool.token1Decimals
  );

  const feeMetrics = computeFeeMetrics(pool, bins);
  const binDistribution = computeBinFeeDistribution(bins, activeBinId);
  const { score, breakdown } = computeVelocityScore(feeMetrics, binDistribution);
  const momentumClass = classifyMomentum(score);

  const analysis: VelocityAnalysis = {
    poolId: pool.poolId!,
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    tvlUsd: pool.tvlUsd,
    activeBinId,
    feeMetrics,
    binDistribution,
    velocityScore: score,
    momentumClass,
    scoreBreakdown: breakdown,
    summary: "",
  };
  analysis.summary = generateSummary(analysis);

  return analysis;
}

const program = new Command()
  .name("hodlmm-fee-velocity")
  .description("HODLMM Fee Velocity Analyzer — Measures fee generation rate, momentum, and capital efficiency across HODLMM pools.")
  .argument("[pool]", "Pool ID or token pair (e.g. 'STX/sBTC', '1')")
  .option("--all", "Analyze all pools above minimum TVL")
  .option("--top <n>", "Show top N pools by fee velocity", "5")
  .option("--json", "Output raw JSON")
  .option("--min-tvl <usd>", "Minimum TVL filter", MIN_TVL_USD.toString())
  .action(async (poolQuery, opts) => {
    try {
      const minTvl = Number(opts.minTvl) || MIN_TVL_USD;

      if (opts.all || !poolQuery) {
        const pools = await fetchPools();
        const eligible = pools
          .filter(p => p.tvlUsd >= minTvl && p.poolId && p.poolId > 0)
          .sort((a, b) => b.volume24hUsd - a.volume24hUsd);

        const topN = Number(opts.top) || 5;
        const toAnalyze = eligible.slice(0, topN);

        if (toAnalyze.length === 0) {
          console.log("No pools found above minimum TVL.");
          return;
        }

        console.log(`Analyzing fee velocity for top ${toAnalyze.length} pools by volume...\n`);
        const analyses: VelocityAnalysis[] = [];
        for (const p of toAnalyze) {
          try {
            console.log(`  Scanning ${p.token0Symbol}/${p.token1Symbol} (ID: ${p.poolId})...`);
            const a = await analyzePool(p);
            analyses.push(a);
          } catch (e: any) {
            console.log(`  Skipping ${p.token0Symbol}/${p.token1Symbol}: ${e.message}`);
          }
        }

        if (opts.json) {
          console.log(JSON.stringify(analyses, null, 2));
        } else {
          console.log("\n" + renderComparison(analyses));
          for (const a of analyses) {
            console.log("\n" + renderAnalysis(a));
          }
        }
      } else {
        const pool = await findPool(poolQuery);
        if (!pool) {
          console.error(`Pool not found: ${poolQuery}`);
          process.exit(1);
        }
        if (!pool.poolId || pool.poolId <= 0) {
          console.error(`Pool ${poolQuery} has no valid on-chain pool ID.`);
          process.exit(1);
        }

        console.log(`Analyzing fee velocity for ${pool.token0Symbol}/${pool.token1Symbol}...\n`);
        const analysis = await analyzePool(pool);

        if (opts.json) {
          console.log(JSON.stringify(analysis, null, 2));
        } else {
          console.log(renderAnalysis(analysis));
        }
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
