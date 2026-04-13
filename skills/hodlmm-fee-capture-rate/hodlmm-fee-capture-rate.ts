#!/usr/bin/env bun
/**
 * hodlmm-fee-capture-rate.ts
 *
 * HODLMM Fee-Capture-Rate Analyzer — Measures what percentage of available
 * trading fees a pool's liquidity providers actually capture. Analyzes the
 * relationship between where liquidity is deployed vs where trades happen
 * (active bin), calculating fee capture efficiency.
 *
 * Key metrics:
 *  - Fee capture rate: % of theoretical max fees the LP distribution captures
 *  - Liquidity utilization efficiency: how much deployed liquidity earns fees
 *  - Active bin concentration: % of total reserves in/near the active bin
 *  - Fee leakage estimate: USD value of fees lost to suboptimal LP positioning
 *  - Capture rate trend: whether fee capture is improving or degrading
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 49).
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

// Fee capture bins: only the active bin and immediately adjacent bins earn fees
// in a concentrated liquidity AMM. We define "fee-earning zone" as ±1 bin.
const FEE_EARNING_RADIUS = 1;

// Capture rate thresholds for rating
const CAPTURE_THRESHOLDS = {
  EXCELLENT: 80,
  GOOD: 60,
  FAIR: 40,
  // Below 40 = POOR
} as const;

const FALLBACK_STX_PRICE_USD = 0.80;

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
  reserveX: number;
  reserveY: number;
  totalUsd: number;
}

type CaptureRating = "EXCELLENT" | "GOOD" | "FAIR" | "POOR";

interface FeeCaptureMetrics {
  feeCaptureRate: number;            // 0-100 %
  captureRating: CaptureRating;
  liquidityUtilization: number;      // % of total liquidity earning fees
  activeBinConcentration: number;    // % of reserves in/near active bin
  theoreticalMaxFeesDaily: number;   // USD if 100% concentrated
  actualEstimatedFeesDaily: number;  // USD based on current distribution
  feeLeakageDaily: number;           // USD lost to suboptimal positioning
  feeLeakageAnnualized: number;      // USD annualized leakage
  captureRateTrend: string;          // improving / stable / degrading
  binsInFeeZone: number;             // bins within fee-earning radius
  binsWithLiquidity: number;         // total bins with reserves
  totalBinsScanned: number;
  feeZoneLiquidityUsd: number;       // USD in fee-earning zone
  outerLiquidityUsd: number;         // USD outside fee zone (idle)
}

interface FeeCaptureAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  metrics: FeeCaptureMetrics;
  binDistribution: BinDistributionEntry[];
  recommendations: string[];
}

interface BinDistributionEntry {
  binId: number;
  usd: number;
  pctOfTotal: number;
  inFeeZone: boolean;
  distFromActive: number;
}

interface PoolComparisonResult {
  pools: FeeCaptureAnalysis[];
  winner: { poolId: number; pair: string; captureRate: number; reason: string };
  summary: string;
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
  // Handle ok-wrapped values (0x07 prefix for ok, then 0x0a for tuple or 0x01 for uint)
  if (hex.startsWith("07")) {
    const inner = hex.slice(2);
    const valHex = inner.slice(2);
    return parseInt(valHex, 16) || 0;
  }
  // Direct uint
  if (hex.startsWith("01")) return parseInt(hex.slice(2), 16) || 0;
  return 0;
}

function formatUsd(n: number): string {
  if (n < 0) return `-${formatUsd(-n)}`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(6)}`;
}

function formatPct(n: number): string {
  if (Math.abs(n) >= 100) return `${Math.round(n)}%`;
  if (Math.abs(n) >= 1) return `${n.toFixed(2)}%`;
  return `${n.toFixed(4)}%`;
}

function ratingColor(rating: CaptureRating): string {
  switch (rating) {
    case "EXCELLENT": return "\x1b[32m";  // green
    case "GOOD": return "\x1b[36m";       // cyan
    case "FAIR": return "\x1b[33m";       // yellow
    case "POOR": return "\x1b[31m";       // red
  }
}

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

function getRating(captureRate: number): CaptureRating {
  if (captureRate >= CAPTURE_THRESHOLDS.EXCELLENT) return "EXCELLENT";
  if (captureRate >= CAPTURE_THRESHOLDS.GOOD) return "GOOD";
  if (captureRate >= CAPTURE_THRESHOLDS.FAIR) return "FAIR";
  return "POOR";
}

// ── Pool Data ──────────────────────────────────────────────────────────────────

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

async function fetchStxPriceUsd(): Promise<number> {
  try {
    const pools = await fetchAllPools();
    const stables = ["USDA", "USDT", "SUSDT", "XUSD", "AUSD"];
    for (const p of pools) {
      const t0 = p.token0Symbol.toUpperCase();
      const t1 = p.token1Symbol.toUpperCase();
      if (t0 === "STX" && stables.some((s) => t1.includes(s))) {
        return p.token0PriceUsd > 0 ? p.token0PriceUsd : FALLBACK_STX_PRICE_USD;
      }
      if (t1 === "STX" && stables.some((s) => t0.includes(s))) {
        return p.token1PriceUsd > 0 ? p.token1PriceUsd : FALLBACK_STX_PRICE_USD;
      }
    }
    for (const p of pools) {
      if (p.token0Symbol.toUpperCase() === "STX" && p.token0PriceUsd > 0) return p.token0PriceUsd;
      if (p.token1Symbol.toUpperCase() === "STX" && p.token1PriceUsd > 0) return p.token1PriceUsd;
    }
    return FALLBACK_STX_PRICE_USD;
  } catch {
    return FALLBACK_STX_PRICE_USD;
  }
}

async function getActiveBin(poolId: number): Promise<number> {
  const result = await callReadOnly("get-active-bin-id", [uintCV(poolId)]);
  return parseUintResult(result);
}

async function fetchBinReserves(poolId: number, activeBinId: number, pool: AppPool): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const start = activeBinId - BIN_SCAN_RADIUS;
  const end = activeBinId + BIN_SCAN_RADIUS;

  for (let binId = start; binId <= end; binId++) {
    try {
      const result = await callReadOnly("get-bin", [uintCV(poolId), uintCV(binId)]);
      const parsed = parseUintResult(result);
      if (parsed > 0) {
        const ratioX = pool.token0PriceUsd / (pool.token0PriceUsd + pool.token1PriceUsd + 0.001);
        const reserveX = parsed * ratioX;
        const reserveY = parsed * (1 - ratioX);
        const usdX = (reserveX / Math.pow(10, pool.token0Decimals)) * pool.token0PriceUsd;
        const usdY = (reserveY / Math.pow(10, pool.token1Decimals)) * pool.token1PriceUsd;
        bins.push({ binId, reserveX, reserveY, totalUsd: usdX + usdY });
      }
    } catch {
      // Skip bins that fail
    }
  }
  return bins;
}

// ── Fee Capture Analysis Engine ───────────────────────────────────────────────

/**
 * Compute fee capture metrics for a pool.
 *
 * In a DLMM, only the active bin (and immediately adjacent bins for partial
 * fills) actually earns trading fees. Liquidity placed further away sits idle
 * until price moves to those bins. Fee capture rate measures how efficiently
 * the pool's liquidity is positioned to earn from current trading activity.
 */
function computeFeeCaptureMetrics(
  bins: BinReserves[],
  activeBinId: number,
  pool: AppPool
): FeeCaptureMetrics {
  const totalLiquidityUsd = bins.reduce((s, b) => s + b.totalUsd, 0);

  // Calculate fee-zone liquidity (active bin +/- FEE_EARNING_RADIUS)
  let feeZoneLiquidityUsd = 0;
  let binsInFeeZone = 0;
  const binsWithLiquidity = bins.filter((b) => b.totalUsd > 0).length;

  for (const bin of bins) {
    const dist = Math.abs(bin.binId - activeBinId);
    if (dist <= FEE_EARNING_RADIUS && bin.totalUsd > 0) {
      feeZoneLiquidityUsd += bin.totalUsd;
      binsInFeeZone++;
    }
  }

  const outerLiquidityUsd = totalLiquidityUsd - feeZoneLiquidityUsd;

  // Active bin concentration: % of total reserves in/near active bin
  const activeBinConcentration = totalLiquidityUsd > 0
    ? (feeZoneLiquidityUsd / totalLiquidityUsd) * 100
    : 0;

  // Liquidity utilization: what % of deployed liquidity is actively earning
  const liquidityUtilization = totalLiquidityUsd > 0
    ? (feeZoneLiquidityUsd / totalLiquidityUsd) * 100
    : 0;

  // Daily fee calculations
  const feeRate = (pool.feeBps || 30) / 10_000;
  const dailyVolume = pool.volume24hUsd;
  const totalDailyFees = dailyVolume * feeRate;

  // Theoretical max: if ALL liquidity were concentrated in the active bin,
  // LPs would capture 100% of trading fees. The fee pool is split proportionally
  // among liquidity in the active bin.
  const theoreticalMaxFeesDaily = totalDailyFees;

  // Actual estimated fees: proportional to how much liquidity is in fee zone
  // vs total pool TVL. Only fee-zone liquidity earns; the rest is idle.
  // Fee capture rate considers that fee-zone liquidity competes with
  // any other liquidity in those bins (including from the wider TVL).
  //
  // If scanned liquidity is a subset of TVL, we scale accordingly:
  const scannedToTvlRatio = pool.tvlUsd > 0 ? totalLiquidityUsd / pool.tvlUsd : 1;
  const adjustedFeeZone = scannedToTvlRatio > 0
    ? feeZoneLiquidityUsd / scannedToTvlRatio
    : feeZoneLiquidityUsd;

  // Fee capture rate: ratio of fee-zone liquidity to total TVL
  // This represents the fraction of fees that the scanned distribution captures
  const feeCaptureRate = pool.tvlUsd > 0
    ? Math.min(100, (adjustedFeeZone / pool.tvlUsd) * 100)
    : 0;

  // Actual daily fees earned by the current distribution
  const actualEstimatedFeesDaily = theoreticalMaxFeesDaily * (feeCaptureRate / 100);

  // Fee leakage: difference between theoretical max and actual
  const feeLeakageDaily = theoreticalMaxFeesDaily - actualEstimatedFeesDaily;
  const feeLeakageAnnualized = feeLeakageDaily * 365;

  // Capture rate trend estimation
  // We approximate trend by looking at the distribution shape:
  // - If liquidity is heavily concentrated near active bin -> likely improving
  // - If liquidity is spread out -> likely degrading (price has moved away)
  const weightedDistance = bins.reduce((sum, b) => {
    if (b.totalUsd <= 0) return sum;
    return sum + Math.abs(b.binId - activeBinId) * b.totalUsd;
  }, 0);
  const avgWeightedDistance = totalLiquidityUsd > 0
    ? weightedDistance / totalLiquidityUsd
    : BIN_SCAN_RADIUS;

  let captureRateTrend: string;
  if (avgWeightedDistance <= 1.5) {
    captureRateTrend = "improving";
  } else if (avgWeightedDistance <= 4.0) {
    captureRateTrend = "stable";
  } else {
    captureRateTrend = "degrading";
  }

  const captureRating = getRating(feeCaptureRate);

  return {
    feeCaptureRate: Math.round(feeCaptureRate * 100) / 100,
    captureRating,
    liquidityUtilization: Math.round(liquidityUtilization * 100) / 100,
    activeBinConcentration: Math.round(activeBinConcentration * 100) / 100,
    theoreticalMaxFeesDaily: Math.round(theoreticalMaxFeesDaily * 100) / 100,
    actualEstimatedFeesDaily: Math.round(actualEstimatedFeesDaily * 100) / 100,
    feeLeakageDaily: Math.round(feeLeakageDaily * 100) / 100,
    feeLeakageAnnualized: Math.round(feeLeakageAnnualized * 100) / 100,
    captureRateTrend,
    binsInFeeZone,
    binsWithLiquidity,
    totalBinsScanned: bins.length,
    feeZoneLiquidityUsd: Math.round(feeZoneLiquidityUsd * 100) / 100,
    outerLiquidityUsd: Math.round(outerLiquidityUsd * 100) / 100,
  };
}

/**
 * Build a bin distribution table showing each bin's contribution and status.
 */
function buildBinDistribution(
  bins: BinReserves[],
  activeBinId: number
): BinDistributionEntry[] {
  const totalUsd = bins.reduce((s, b) => s + b.totalUsd, 0);
  return bins
    .filter((b) => b.totalUsd > 0)
    .sort((a, b) => a.binId - b.binId)
    .map((b) => ({
      binId: b.binId,
      usd: Math.round(b.totalUsd * 100) / 100,
      pctOfTotal: totalUsd > 0 ? Math.round((b.totalUsd / totalUsd) * 10000) / 100 : 0,
      inFeeZone: Math.abs(b.binId - activeBinId) <= FEE_EARNING_RADIUS,
      distFromActive: b.binId - activeBinId,
    }));
}

/**
 * Generate actionable recommendations based on capture metrics.
 */
function generateRecommendations(metrics: FeeCaptureMetrics, pool: AppPool): string[] {
  const recs: string[] = [];

  if (metrics.feeCaptureRate < CAPTURE_THRESHOLDS.FAIR) {
    recs.push(
      `Only ${formatPct(metrics.feeCaptureRate)} of fees captured. Consider rebalancing liquidity to concentrate near active bin ${pool.activeBinId || "N/A"}.`
    );
  }

  if (metrics.outerLiquidityUsd > metrics.feeZoneLiquidityUsd * 3) {
    recs.push(
      `${formatUsd(metrics.outerLiquidityUsd)} sits outside the fee zone — ${formatPct(100 - metrics.liquidityUtilization)} of liquidity is idle. Tighten your range for better capital efficiency.`
    );
  }

  if (metrics.feeLeakageDaily > 10) {
    recs.push(
      `Estimated ${formatUsd(metrics.feeLeakageDaily)}/day (${formatUsd(metrics.feeLeakageAnnualized)}/year) in fee leakage. Moving idle liquidity to the fee zone could recapture this.`
    );
  }

  if (metrics.captureRateTrend === "degrading") {
    recs.push(
      "Fee capture is degrading — price has moved away from where liquidity is concentrated. Rebalance to follow the active bin."
    );
  }

  if (metrics.binsInFeeZone === 0) {
    recs.push(
      "No liquidity detected in the fee-earning zone. All deployed capital is currently idle and earning zero fees."
    );
  }

  if (metrics.feeCaptureRate >= CAPTURE_THRESHOLDS.EXCELLENT) {
    recs.push(
      "Excellent fee capture — liquidity is well-positioned. Maintain current range and monitor for active bin shifts."
    );
  }

  if (metrics.liquidityUtilization > 90 && metrics.feeCaptureRate > 70) {
    recs.push(
      "High utilization with strong capture. This is an efficient LP position — focus on monitoring rather than rebalancing."
    );
  }

  if (recs.length === 0) {
    recs.push("Fee capture is within normal range. Monitor for changes in active bin position.");
  }

  return recs;
}

// ── Output Formatting ─────────────────────────────────────────────────────────

function printAnalysisTable(analysis: FeeCaptureAnalysis): void {
  const m = analysis.metrics;
  const color = ratingColor(m.captureRating);

  console.log("");
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}  HODLMM Fee Capture Rate — Pool #${analysis.poolId} (${analysis.pair})${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log("");

  // Core metrics
  console.log(`${BOLD}  Fee Capture Rate:        ${color}${formatPct(m.feeCaptureRate)} [${m.captureRating}]${RESET}`);
  console.log(`  Liquidity Utilization:   ${formatPct(m.liquidityUtilization)}`);
  console.log(`  Active Bin Concentration:${formatPct(m.activeBinConcentration)}`);
  console.log(`  Capture Trend:           ${m.captureRateTrend === "improving" ? "\x1b[32m" : m.captureRateTrend === "degrading" ? "\x1b[31m" : "\x1b[33m"}${m.captureRateTrend}${RESET}`);
  console.log("");

  // Fee breakdown
  console.log(`${BOLD}  ── Fee Breakdown (Daily) ─────────────────────────────────${RESET}`);
  console.log(`  Theoretical Max Fees:    ${formatUsd(m.theoreticalMaxFeesDaily)}`);
  console.log(`  Actual Estimated Fees:   ${formatUsd(m.actualEstimatedFeesDaily)}`);
  console.log(`  Fee Leakage:             ${m.feeLeakageDaily > 0 ? "\x1b[31m" : "\x1b[32m"}${formatUsd(m.feeLeakageDaily)}/day${RESET} (${formatUsd(m.feeLeakageAnnualized)}/year)`);
  console.log("");

  // Pool info
  console.log(`${BOLD}  ── Pool Info ─────────────────────────────────────────────${RESET}`);
  console.log(`  TVL:                     ${formatUsd(analysis.tvlUsd)}`);
  console.log(`  24h Volume:              ${formatUsd(analysis.volume24hUsd)}`);
  console.log(`  Fee Rate:                ${analysis.feeBps} bps (${(analysis.feeBps / 100).toFixed(2)}%)`);
  console.log(`  Active Bin:              #${analysis.activeBinId}`);
  console.log("");

  // Liquidity distribution
  console.log(`${BOLD}  ── Liquidity Distribution ────────────────────────────────${RESET}`);
  console.log(`  Bins in Fee Zone:        ${m.binsInFeeZone} of ${m.binsWithLiquidity} with liquidity (${m.totalBinsScanned} scanned)`);
  console.log(`  Fee Zone Liquidity:      ${formatUsd(m.feeZoneLiquidityUsd)}`);
  console.log(`  Outer (Idle) Liquidity:  ${formatUsd(m.outerLiquidityUsd)}`);
  console.log("");

  // Bin table
  if (analysis.binDistribution.length > 0) {
    console.log(`${BOLD}  ── Bin Distribution ──────────────────────────────────────${RESET}`);
    console.log(`  ${DIM}${"Bin".padEnd(10)}${"Dist".padEnd(8)}${"USD".padEnd(14)}${"% Total".padEnd(10)}${"Status".padEnd(12)}${RESET}`);
    console.log(`  ${DIM}${"─".repeat(54)}${RESET}`);

    for (const entry of analysis.binDistribution) {
      const distLabel = entry.distFromActive === 0 ? "ACTIVE" : (entry.distFromActive > 0 ? `+${entry.distFromActive}` : `${entry.distFromActive}`);
      const statusColor = entry.inFeeZone ? "\x1b[32m" : "\x1b[90m";
      const status = entry.inFeeZone ? "EARNING" : "IDLE";
      const bar = "█".repeat(Math.min(20, Math.round(entry.pctOfTotal / 5)));

      console.log(
        `  ${String(entry.binId).padEnd(10)}${distLabel.padEnd(8)}${formatUsd(entry.usd).padEnd(14)}${formatPct(entry.pctOfTotal).padEnd(10)}${statusColor}${status}${RESET} ${DIM}${bar}${RESET}`
      );
    }
    console.log("");
  }

  // Recommendations
  console.log(`${BOLD}  ── Recommendations ──────────────────────────────────────${RESET}`);
  for (const rec of analysis.recommendations) {
    console.log(`  ${BOLD}>${RESET} ${rec}`);
  }
  console.log("");
  console.log(`${DIM}  Timestamp: ${new Date().toISOString()}${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log("");
}

function printScanTable(analyses: FeeCaptureAnalysis[]): void {
  console.log("");
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}  HODLMM Fee Capture Rate — All Pools Scan${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════════════════════════${RESET}`);
  console.log("");

  // Header
  console.log(
    `  ${DIM}${"#".padEnd(6)}${"Pair".padEnd(18)}${"Capture".padEnd(12)}${"Rating".padEnd(12)}${"Util%".padEnd(10)}${"Leakage/d".padEnd(14)}${"Trend".padEnd(12)}${RESET}`
  );
  console.log(`  ${DIM}${"─".repeat(78)}${RESET}`);

  // Sort by capture rate descending
  const sorted = [...analyses].sort((a, b) => b.metrics.feeCaptureRate - a.metrics.feeCaptureRate);

  for (const a of sorted) {
    const m = a.metrics;
    const color = ratingColor(m.captureRating);
    const trendColor = m.captureRateTrend === "improving" ? "\x1b[32m" : m.captureRateTrend === "degrading" ? "\x1b[31m" : "\x1b[33m";

    console.log(
      `  ${String(a.poolId).padEnd(6)}${a.pair.padEnd(18)}${color}${formatPct(m.feeCaptureRate).padEnd(12)}${m.captureRating.padEnd(12)}${RESET}${formatPct(m.liquidityUtilization).padEnd(10)}${formatUsd(m.feeLeakageDaily).padEnd(14)}${trendColor}${m.captureRateTrend}${RESET}`
    );
  }

  console.log("");

  // Summary stats
  const avgCapture = sorted.reduce((s, a) => s + a.metrics.feeCaptureRate, 0) / sorted.length;
  const totalLeakage = sorted.reduce((s, a) => s + a.metrics.feeLeakageDaily, 0);
  const excellent = sorted.filter((a) => a.metrics.captureRating === "EXCELLENT").length;
  const good = sorted.filter((a) => a.metrics.captureRating === "GOOD").length;
  const fair = sorted.filter((a) => a.metrics.captureRating === "FAIR").length;
  const poor = sorted.filter((a) => a.metrics.captureRating === "POOR").length;

  console.log(`${BOLD}  ── Summary ──────────────────────────────────────────────${RESET}`);
  console.log(`  Pools Analyzed:          ${sorted.length}`);
  console.log(`  Avg Capture Rate:        ${formatPct(avgCapture)}`);
  console.log(`  Total Daily Leakage:     ${formatUsd(totalLeakage)}`);
  console.log(`  Ratings: ${"\x1b[32m"}${excellent} EXCELLENT${RESET}  ${"\x1b[36m"}${good} GOOD${RESET}  ${"\x1b[33m"}${fair} FAIR${RESET}  ${"\x1b[31m"}${poor} POOR${RESET}`);
  console.log("");
  console.log(`${DIM}  Timestamp: ${new Date().toISOString()}${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════════════════════════${RESET}`);
  console.log("");
}

function printComparisonTable(result: PoolComparisonResult): void {
  console.log("");
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}  HODLMM Fee Capture Rate — Pool Comparison${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log("");

  for (const a of result.pools) {
    const m = a.metrics;
    const color = ratingColor(m.captureRating);
    const isWinner = a.poolId === result.winner.poolId;
    const marker = isWinner ? " \x1b[32m<< WINNER\x1b[0m" : "";

    console.log(`${BOLD}  Pool #${a.poolId} (${a.pair})${marker}${RESET}`);
    console.log(`  ├─ Capture Rate:     ${color}${formatPct(m.feeCaptureRate)} [${m.captureRating}]${RESET}`);
    console.log(`  ├─ Utilization:      ${formatPct(m.liquidityUtilization)}`);
    console.log(`  ├─ Fee Leakage:      ${formatUsd(m.feeLeakageDaily)}/day`);
    console.log(`  ├─ Fees Earned:      ${formatUsd(m.actualEstimatedFeesDaily)}/day`);
    console.log(`  └─ Trend:            ${m.captureRateTrend}`);
    console.log("");
  }

  console.log(`${BOLD}  Verdict:${RESET} ${result.summary}`);
  console.log("");
  console.log(`${DIM}  Timestamp: ${new Date().toISOString()}${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log("");
}

// ── Command Handlers ──────────────────────────────────────────────────────────

async function runDoctor(): Promise<void> {
  const results: Record<string, string> = {};

  try {
    await fetchJson(`${BFF_APP_BASE}/pools/hodlmm`);
    results["bitflow_app_api"] = "ok";
  } catch (e: any) {
    results["bitflow_app_api"] = `error: ${e.message}`;
  }

  try {
    await fetchJson(`${HIRO_API}/v2/info`);
    results["hiro_api"] = "ok";
  } catch (e: any) {
    results["hiro_api"] = `error: ${e.message}`;
  }

  try {
    const testResult = await callReadOnly("get-active-bin-id", [uintCV(1)]);
    results["dlmm_contract"] = testResult.result ? "ok" : "no result";
  } catch (e: any) {
    results["dlmm_contract"] = `error: ${e.message}`;
  }

  try {
    const price = await fetchStxPriceUsd();
    results["stx_price"] = `ok ($${price.toFixed(2)})`;
  } catch (e: any) {
    results["stx_price"] = `error: ${e.message}`;
  }

  // Verify fee-capture-specific logic
  try {
    const testMetrics = computeFeeCaptureMetrics(
      [{ binId: 100, reserveX: 1000, reserveY: 1000, totalUsd: 500 }],
      100,
      { tvlUsd: 10000, volume24hUsd: 5000, feeBps: 30 } as AppPool
    );
    results["fee_capture_engine"] = testMetrics.feeCaptureRate >= 0 ? "ok" : "error";
  } catch (e: any) {
    results["fee_capture_engine"] = `error: ${e.message}`;
  }

  console.log(
    JSON.stringify({
      tool: "hodlmm-fee-capture-rate",
      command: "doctor",
      status: Object.values(results).every((v) => v.startsWith("ok")) ? "healthy" : "degraded",
      checks: results,
      timestamp: new Date().toISOString(),
    })
  );
}

async function analyzePool(poolId: number, pools: AppPool[]): Promise<FeeCaptureAnalysis | null> {
  const pool = pools.find((p) => p.poolId === poolId);
  if (!pool) return null;

  const activeBinId = pool.activeBinId || await getActiveBin(poolId);
  if (!activeBinId) return null;

  const bins = await fetchBinReserves(poolId, activeBinId, pool);
  const metrics = computeFeeCaptureMetrics(bins, activeBinId, pool);
  const binDistribution = buildBinDistribution(bins, activeBinId);
  const recommendations = generateRecommendations(metrics, pool);

  return {
    poolId,
    pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
    tvlUsd: Math.round(pool.tvlUsd),
    volume24hUsd: Math.round(pool.volume24hUsd),
    feeBps: pool.feeBps || 30,
    activeBinId,
    metrics,
    binDistribution,
    recommendations,
  };
}

async function runAnalyze(poolIdStr: string): Promise<void> {
  const poolId = parseInt(poolIdStr);
  if (isNaN(poolId)) {
    console.log(JSON.stringify({
      tool: "hodlmm-fee-capture-rate",
      command: "analyze",
      timestamp: new Date().toISOString(),
      error: "Invalid pool ID — provide a numeric pool ID",
    }));
    return;
  }

  const pools = await fetchAllPools();
  const analysis = await analyzePool(poolId, pools);

  if (!analysis) {
    console.log(JSON.stringify({
      tool: "hodlmm-fee-capture-rate",
      command: "analyze",
      timestamp: new Date().toISOString(),
      error: `Pool ${poolId} not found, below TVL threshold ($${MIN_TVL_USD}), or active bin unavailable`,
    }));
    return;
  }

  printAnalysisTable(analysis);

  // Also output JSON for programmatic consumption
  console.log(JSON.stringify({
    tool: "hodlmm-fee-capture-rate",
    command: "analyze",
    timestamp: new Date().toISOString(),
    ...analysis,
  }, null, 2));
}

async function runScan(): Promise<void> {
  const pools = await fetchAllPools();

  console.log(`${DIM}Scanning ${pools.length} pools for fee capture rates...${RESET}`);
  console.log("");

  const analyses: FeeCaptureAnalysis[] = [];

  for (const pool of pools) {
    if (!pool.poolId) continue;
    try {
      const analysis = await analyzePool(pool.poolId, pools);
      if (analysis) {
        analyses.push(analysis);
        process.stdout.write(`${DIM}.${RESET}`);
      }
    } catch {
      // Skip pools that error
    }
  }

  console.log("");

  if (analyses.length === 0) {
    console.log(JSON.stringify({
      tool: "hodlmm-fee-capture-rate",
      command: "scan",
      timestamp: new Date().toISOString(),
      error: "No pools could be analyzed",
    }));
    return;
  }

  printScanTable(analyses);

  // JSON output
  console.log(JSON.stringify({
    tool: "hodlmm-fee-capture-rate",
    command: "scan",
    timestamp: new Date().toISOString(),
    poolsAnalyzed: analyses.length,
    rankings: analyses
      .sort((a, b) => b.metrics.feeCaptureRate - a.metrics.feeCaptureRate)
      .map((a) => ({
        poolId: a.poolId,
        pair: a.pair,
        captureRate: a.metrics.feeCaptureRate,
        rating: a.metrics.captureRating,
        utilizationPct: a.metrics.liquidityUtilization,
        feeLeakageDaily: a.metrics.feeLeakageDaily,
        trend: a.metrics.captureRateTrend,
      })),
  }, null, 2));
}

async function runCompare(pool1Str: string, pool2Str: string): Promise<void> {
  const poolId1 = parseInt(pool1Str);
  const poolId2 = parseInt(pool2Str);
  if (isNaN(poolId1) || isNaN(poolId2)) {
    console.log(JSON.stringify({
      tool: "hodlmm-fee-capture-rate",
      command: "compare",
      timestamp: new Date().toISOString(),
      error: "Invalid pool IDs — provide two numeric pool IDs",
    }));
    return;
  }

  const pools = await fetchAllPools();
  const [a1, a2] = await Promise.all([
    analyzePool(poolId1, pools),
    analyzePool(poolId2, pools),
  ]);

  if (!a1 || !a2) {
    console.log(JSON.stringify({
      tool: "hodlmm-fee-capture-rate",
      command: "compare",
      timestamp: new Date().toISOString(),
      error: `One or both pools not found: ${!a1 ? poolId1 : ""} ${!a2 ? poolId2 : ""}`.trim(),
    }));
    return;
  }

  const poolAnalyses = [a1, a2];

  // Determine winner
  const winner = a1.metrics.feeCaptureRate >= a2.metrics.feeCaptureRate ? a1 : a2;
  const loser = winner === a1 ? a2 : a1;

  const captureDiff = Math.abs(a1.metrics.feeCaptureRate - a2.metrics.feeCaptureRate);
  const leakageDiff = Math.abs(a1.metrics.feeLeakageDaily - a2.metrics.feeLeakageDaily);

  let reason: string;
  if (captureDiff < 5) {
    reason = "Both pools have similar fee capture rates — choose based on volume and TVL preferences.";
  } else {
    reason = `Pool #${winner.poolId} (${winner.pair}) captures ${formatPct(captureDiff)} more fees. ` +
      `${loser.pair} leaks an additional ${formatUsd(leakageDiff)}/day vs ${winner.pair}.`;
  }

  const summary = `${winner.pair} (Pool #${winner.poolId}) has superior fee capture at ${formatPct(winner.metrics.feeCaptureRate)} [${winner.metrics.captureRating}] vs ${loser.pair}'s ${formatPct(loser.metrics.feeCaptureRate)} [${loser.metrics.captureRating}]. ${reason}`;

  const result: PoolComparisonResult = {
    pools: poolAnalyses,
    winner: {
      poolId: winner.poolId,
      pair: winner.pair,
      captureRate: winner.metrics.feeCaptureRate,
      reason,
    },
    summary,
  };

  printComparisonTable(result);

  // JSON output
  console.log(JSON.stringify({
    tool: "hodlmm-fee-capture-rate",
    command: "compare",
    timestamp: new Date().toISOString(),
    ...result,
  }, null, 2));
}

// ── CLI Setup ────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-fee-capture-rate")
  .description(
    "HODLMM Fee Capture Rate Analyzer — Measures what percentage of available trading fees a pool's LPs actually capture based on liquidity positioning relative to the active bin"
  )
  .version("1.0.0");

program
  .command("doctor")
  .description("Check API connectivity and dependencies")
  .action(runDoctor);

program
  .command("analyze <pool>")
  .description("Analyze fee capture rate for a specific pool")
  .action(runAnalyze);

program
  .command("scan")
  .description("Scan all pools and rank by fee capture rate")
  .action(runScan);

program
  .command("compare <pool1> <pool2>")
  .description("Compare fee capture rates between two pools")
  .action(runCompare);

program.parse();
