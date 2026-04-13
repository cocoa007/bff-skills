#!/usr/bin/env bun
/**
 * hodlmm-liquidity-resilience.ts
 *
 * HODLMM Liquidity Resilience Analyzer — Measures how well a HODLMM pool
 * absorbs and recovers from large trades and liquidity shocks. Scores pools
 * on their ability to handle stress without catastrophic price impact or
 * reserve depletion.
 *
 * Key metrics:
 *  - Shock absorption: How much a large trade displaces the active bin vs
 *    total reserve depletion
 *  - Recovery depth: How many bins deep reserves exist to absorb sequential trades
 *  - Asymmetry resilience: Whether the pool handles buy vs sell pressure equally
 *  - Concentration fragility: How dependent the pool is on a few whale bins
 *  - Resilience score: Composite 0-100 score with classification
 *    (ANTIFRAGILE / RESILIENT / MODERATE / FRAGILE / BRITTLE)
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 46).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 25; // scan wider for resilience — need to see the full depth

// Shock sizes to simulate (as fractions of pool TVL)
const SHOCK_SIZES_PCT = [0.01, 0.05, 0.10, 0.25, 0.50]; // 1%, 5%, 10%, 25%, 50%

// Resilience score thresholds
const ANTIFRAGILE_THRESHOLD = 85;
const RESILIENT_THRESHOLD = 70;
const MODERATE_THRESHOLD = 50;
const FRAGILE_THRESHOLD = 30;
// Below FRAGILE_THRESHOLD = BRITTLE

// HHI concentration thresholds (Herfindahl-Hirschman Index, 0-10000)
const HHI_CONCENTRATED = 2500;   // Highly concentrated (equivalent to <4 equal bins)
const HHI_MODERATE     = 1500;   // Moderately concentrated
// Below 1500 = well distributed

// Gini coefficient thresholds (0 = perfect equality, 1 = maximum inequality)
const GINI_HIGH_FRAGILITY   = 0.70;
const GINI_MEDIUM_FRAGILITY = 0.45;

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

type ResilienceClass = "ANTIFRAGILE" | "RESILIENT" | "MODERATE" | "FRAGILE" | "BRITTLE";

interface ShockSimulation {
  shockSizePct: number;
  shockSizeUsd: number;
  binsTraversed: number;
  reserveDepletionPct: number;     // % of total reserve consumed
  priceImpactPct: number;          // estimated price impact
  activeBinDisplacedBy: number;    // how many bins the active bin moved
  absorbed: boolean;               // pool survived without total depletion
}

interface BuySellAsymmetry {
  buyDepthUsd: number;    // liquidity available on the buy side (above active bin)
  sellDepthUsd: number;   // liquidity available on the sell side (below active bin)
  asymmetryRatio: number; // buyDepth / sellDepth (1.0 = perfect symmetry)
  asymmetryScore: number; // 0-100, 100 = perfectly symmetric
  dominantSide: "BUY" | "SELL" | "BALANCED";
}

interface ConcentrationRisk {
  totalBins: number;
  activeBins: number;         // bins with nonzero reserves
  hhi: number;                // Herfindahl-Hirschman Index (0-10000)
  giniCoefficient: number;    // 0.0 (equal) to 1.0 (one bin has everything)
  top3BinsSharePct: number;   // % of TVL in top 3 bins
  top1BinSharePct: number;    // % of TVL in single largest bin
  whaleRisk: "HIGH" | "MEDIUM" | "LOW";
}

interface ResilienceAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  activeBinId: number;
  binsScanned: number;
  binsWithLiquidity: number;
  shockSimulations: ShockSimulation[];
  buySellAsymmetry: BuySellAsymmetry;
  concentrationRisk: ConcentrationRisk;
  recoveryDepthBins: number;          // how many bins deep the reserve buffer extends
  recoveryDepthUsd: number;           // total USD in the recovery buffer
  recoveryDepthPctOfTvl: number;      // recovery buffer as % of TVL
  shock5PctSurvived: boolean;
  shock10PctSurvived: boolean;
  shock25PctSurvived: boolean;
  resilienceScore: number;            // 0-100 composite
  resilienceClass: ResilienceClass;
  scoreBreakdown: {
    shockAbsorption: number;          // 0-30
    recoveryDepth: number;            // 0-25
    asymmetryBalance: number;         // 0-20
    concentrationHealth: number;      // 0-25
  };
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
  if (hex.startsWith("07")) {
    const inner = hex.slice(2);
    const valHex = inner.slice(2);
    return parseInt(valHex, 16) || 0;
  }
  if (hex.startsWith("01")) return parseInt(hex.slice(2), 16) || 0;
  return 0;
}

function classifyResilience(score: number): ResilienceClass {
  if (score >= ANTIFRAGILE_THRESHOLD) return "ANTIFRAGILE";
  if (score >= RESILIENT_THRESHOLD)   return "RESILIENT";
  if (score >= MODERATE_THRESHOLD)    return "MODERATE";
  if (score >= FRAGILE_THRESHOLD)     return "FRAGILE";
  return "BRITTLE";
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
  const f = Math.max(0, Math.min(total, Math.round((filled / total) * width)));
  return fillChar.repeat(f) + emptyChar.repeat(width - f);
}

// ── Pool Fetching ──────────────────────────────────────────────────────────────

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

async function fetchBinReserves(poolId: number, activeBinId: number, pool: AppPool): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const start = activeBinId - BIN_SCAN_RADIUS;
  const end = activeBinId + BIN_SCAN_RADIUS;

  for (let binId = start; binId <= end; binId++) {
    try {
      const result = await callReadOnly("get-bin", [uintCV(poolId), uintCV(binId)]);
      const parsed = parseUintResult(result);
      if (parsed > 0) {
        // Estimate split between X and Y based on price ratio
        // Bins below active tend to hold token0, bins above hold token1
        let ratioX: number;
        const distFromActive = binId - activeBinId;
        if (distFromActive < 0) {
          ratioX = 0.9; // below active: mostly token0 (cheaper side)
        } else if (distFromActive > 0) {
          ratioX = 0.1; // above active: mostly token1
        } else {
          ratioX = 0.5; // active bin: mixed
        }
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

// ── Analysis Computations ──────────────────────────────────────────────────────

/**
 * Simulate a sequence of trades of escalating size and measure how far
 * through the bin book each trade penetrates.
 */
function simulateShocks(
  bins: BinReserves[],
  activeBinId: number,
  tvlUsd: number
): ShockSimulation[] {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const totalReserveUsd = bins.reduce((s, b) => s + b.totalUsd, 0);

  return SHOCK_SIZES_PCT.map((pct) => {
    const shockUsd = tvlUsd * pct;
    let remaining = shockUsd;
    let binsTraversed = 0;
    let consumed = 0;
    let lastBinId = activeBinId;

    // Walk through bins starting from active bin outward (sell shock: go down)
    // We model a sell shock (selling token0 pushes price down — traverses lower bins)
    const sellSide = sorted.filter((b) => b.binId <= activeBinId).reverse();

    for (const bin of sellSide) {
      if (remaining <= 0) break;
      const absorb = Math.min(bin.totalUsd, remaining);
      consumed += absorb;
      remaining -= absorb;
      binsTraversed++;
      lastBinId = bin.binId;
    }

    const reserveDepletionPct = totalReserveUsd > 0 ? (consumed / totalReserveUsd) * 100 : 100;
    const activeBinDisplacedBy = Math.abs(activeBinId - lastBinId);

    // Price impact: each bin traversal represents roughly 0.5% price movement (bin step)
    // Actual step size depends on pool config; use 0.5% as conservative default
    const priceImpactPct = activeBinDisplacedBy * 0.5;

    return {
      shockSizePct: pct * 100,
      shockSizeUsd: Math.round(shockUsd),
      binsTraversed,
      reserveDepletionPct: Math.round(reserveDepletionPct * 10) / 10,
      priceImpactPct: Math.round(priceImpactPct * 10) / 10,
      activeBinDisplacedBy,
      absorbed: remaining <= 0 || reserveDepletionPct < 95,
    };
  });
}

/**
 * Compute buy-side vs sell-side liquidity depth and asymmetry.
 */
function computeBuySellAsymmetry(bins: BinReserves[], activeBinId: number): BuySellAsymmetry {
  const buyBins  = bins.filter((b) => b.binId > activeBinId);   // above active = buy wall
  const sellBins = bins.filter((b) => b.binId < activeBinId);   // below active = sell wall

  const buyDepthUsd  = buyBins.reduce((s, b) => s + b.totalUsd, 0);
  const sellDepthUsd = sellBins.reduce((s, b) => s + b.totalUsd, 0);

  const asymmetryRatio = sellDepthUsd > 0 ? buyDepthUsd / sellDepthUsd : (buyDepthUsd > 0 ? Infinity : 1);

  // Score: 100 when perfectly symmetric, decays as ratio diverges from 1
  // Use a log-based score so extreme ratios degrade more gracefully
  const logRatio = Math.abs(Math.log(Math.max(asymmetryRatio, 0.001)));
  const asymmetryScore = Math.max(0, Math.round(100 - logRatio * 30));

  let dominantSide: "BUY" | "SELL" | "BALANCED";
  if (asymmetryRatio > 1.5) dominantSide = "BUY";
  else if (asymmetryRatio < 0.67) dominantSide = "SELL";
  else dominantSide = "BALANCED";

  return {
    buyDepthUsd: Math.round(buyDepthUsd),
    sellDepthUsd: Math.round(sellDepthUsd),
    asymmetryRatio: Math.round(asymmetryRatio * 100) / 100,
    asymmetryScore,
    dominantSide,
  };
}

/**
 * Compute HHI (Herfindahl-Hirschman Index) and Gini coefficient for bin
 * liquidity distribution. High values = concentrated = fragile.
 */
function computeConcentrationRisk(bins: BinReserves[]): ConcentrationRisk {
  const activeBins = bins.filter((b) => b.totalUsd > 0);
  const totalUsd = activeBins.reduce((s, b) => s + b.totalUsd, 0);
  const n = activeBins.length;

  if (n === 0) {
    return {
      totalBins: bins.length,
      activeBins: 0,
      hhi: 10000,
      giniCoefficient: 1.0,
      top3BinsSharePct: 100,
      top1BinSharePct: 100,
      whaleRisk: "HIGH",
    };
  }

  // HHI: sum of squared market shares (in percent, 0-10000)
  const shares = activeBins.map((b) => (b.totalUsd / totalUsd) * 100);
  const hhi = Math.round(shares.reduce((s, pct) => s + pct * pct, 0));

  // Gini coefficient
  const sorted = [...activeBins].sort((a, b) => a.totalUsd - b.totalUsd);
  let giniNumerator = 0;
  for (let i = 0; i < n; i++) {
    giniNumerator += (2 * (i + 1) - n - 1) * sorted[i].totalUsd;
  }
  const gini = n > 1 ? Math.abs(giniNumerator) / (n * totalUsd) : 0;

  // Top bin shares
  const topSorted = [...activeBins].sort((a, b) => b.totalUsd - a.totalUsd);
  const top3Usd = topSorted.slice(0, 3).reduce((s, b) => s + b.totalUsd, 0);
  const top1Usd = topSorted[0]?.totalUsd ?? 0;

  const top3BinsSharePct = Math.round((top3Usd / totalUsd) * 1000) / 10;
  const top1BinSharePct  = Math.round((top1Usd / totalUsd) * 1000) / 10;

  let whaleRisk: "HIGH" | "MEDIUM" | "LOW";
  if (hhi >= HHI_CONCENTRATED || gini >= GINI_HIGH_FRAGILITY) whaleRisk = "HIGH";
  else if (hhi >= HHI_MODERATE || gini >= GINI_MEDIUM_FRAGILITY) whaleRisk = "MEDIUM";
  else whaleRisk = "LOW";

  return {
    totalBins: bins.length,
    activeBins: n,
    hhi,
    giniCoefficient: Math.round(gini * 1000) / 1000,
    top3BinsSharePct,
    top1BinSharePct,
    whaleRisk,
  };
}

/**
 * Compute recovery depth: how many bins beyond the active bin have reserve
 * buffer to absorb sequential trades.
 */
function computeRecoveryDepth(
  bins: BinReserves[],
  activeBinId: number
): { depthBins: number; depthUsd: number; depthPct: number } {
  const totalUsd = bins.reduce((s, b) => s + b.totalUsd, 0);

  // Count consecutive bins below active with reserves (sell-side recovery depth)
  // A bin is part of the recovery buffer if it's within 10 bins of the active bin
  // and has nonzero liquidity
  const sellSide = bins
    .filter((b) => b.binId < activeBinId && b.totalUsd > 0)
    .sort((a, b) => b.binId - a.binId); // closest to active first

  let depthBins = 0;
  let depthUsd = 0;
  let prevBin = activeBinId;

  for (const bin of sellSide) {
    if (prevBin - bin.binId > 3) break; // gap > 3 bins breaks recovery continuity
    depthBins++;
    depthUsd += bin.totalUsd;
    prevBin = bin.binId;
  }

  const depthPct = totalUsd > 0 ? (depthUsd / totalUsd) * 100 : 0;

  return {
    depthBins,
    depthUsd: Math.round(depthUsd),
    depthPct: Math.round(depthPct * 10) / 10,
  };
}

/**
 * Compute the composite resilience score (0-100).
 *
 * Breakdown:
 *  - Shock absorption (0-30): Can the pool survive a 10% trade without near-total depletion?
 *  - Recovery depth (0-25): How many layers of reserve buffer exist beyond the active bin?
 *  - Asymmetry balance (0-20): Are buy and sell walls roughly equal?
 *  - Concentration health (0-25): Is liquidity spread across many bins or dominated by whales?
 */
function computeResilienceScore(
  shocks: ShockSimulation[],
  recovery: { depthBins: number; depthUsd: number; depthPct: number },
  asymmetry: BuySellAsymmetry,
  concentration: ConcentrationRisk
): { total: number; breakdown: { shockAbsorption: number; recoveryDepth: number; asymmetryBalance: number; concentrationHealth: number } } {

  // Shock absorption score (0-30)
  // Based on how many of the escalating shocks the pool survived
  const survived = shocks.filter((s) => s.absorbed).length;
  const survivedPct = survived / shocks.length;
  // Also penalize heavily if a 10% shock causes >50% depletion
  const shock10 = shocks.find((s) => s.shockSizePct === 10);
  const shock10Penalty = shock10 && shock10.reserveDepletionPct > 50 ? 10 : 0;
  const shockAbsorption = Math.max(0, Math.round(survivedPct * 30) - shock10Penalty);

  // Recovery depth score (0-25)
  // Full score if depth covers >8 bins or >30% of TVL
  let recoveryScore: number;
  if (recovery.depthBins >= 8 || recovery.depthPct >= 30) recoveryScore = 25;
  else if (recovery.depthBins >= 5 || recovery.depthPct >= 20) recoveryScore = 20;
  else if (recovery.depthBins >= 3 || recovery.depthPct >= 10) recoveryScore = 14;
  else if (recovery.depthBins >= 1 || recovery.depthPct >= 5)  recoveryScore = 8;
  else recoveryScore = 2;

  // Asymmetry balance score (0-20) — use asymmetryScore directly
  const asymmetryBalance = Math.round((asymmetry.asymmetryScore / 100) * 20);

  // Concentration health score (0-25)
  let concScore: number;
  if (concentration.whaleRisk === "LOW") {
    // Granular scoring by HHI
    if (concentration.hhi < 500)  concScore = 25;
    else if (concentration.hhi < 800)  concScore = 22;
    else if (concentration.hhi < 1200) concScore = 18;
    else concScore = 14;
  } else if (concentration.whaleRisk === "MEDIUM") {
    concScore = concentration.hhi < 2000 ? 10 : 7;
  } else {
    // HIGH whale risk
    concScore = concentration.giniCoefficient > 0.85 ? 2 : 5;
  }

  const total = Math.min(100, shockAbsorption + recoveryScore + asymmetryBalance + concScore);

  return {
    total,
    breakdown: {
      shockAbsorption,
      recoveryDepth: recoveryScore,
      asymmetryBalance,
      concentrationHealth: concScore,
    },
  };
}

// ── Main Analysis ──────────────────────────────────────────────────────────────

async function analyzePool(pool: AppPool): Promise<ResilienceAnalysis> {
  const poolId = pool.poolId!;
  const activeBinId = pool.activeBinId || await getActiveBin(poolId);

  if (!activeBinId) {
    throw new Error(`Could not determine active bin for pool ${poolId}`);
  }

  const bins = await fetchBinReserves(poolId, activeBinId, pool);
  const activeBins = bins.filter((b) => b.totalUsd > 0);

  // Run all analysis
  const shocks = simulateShocks(bins, activeBinId, pool.tvlUsd);
  const asymmetry = computeBuySellAsymmetry(bins, activeBinId);
  const concentration = computeConcentrationRisk(bins);
  const recovery = computeRecoveryDepth(bins, activeBinId);
  const { total: resilienceScore, breakdown } = computeResilienceScore(
    shocks, recovery, asymmetry, concentration
  );
  const resilienceClass = classifyResilience(resilienceScore);

  const shock5  = shocks.find((s) => s.shockSizePct === 5)!;
  const shock10 = shocks.find((s) => s.shockSizePct === 10)!;
  const shock25 = shocks.find((s) => s.shockSizePct === 25)!;

  // Build summary
  let summary: string;
  if (resilienceClass === "ANTIFRAGILE") {
    summary = `Pool has deep, well-distributed liquidity across ${concentration.activeBins} bins. Can absorb large trades with minimal price impact. HHI=${concentration.hhi} (diversified), Gini=${concentration.giniCoefficient.toFixed(2)} (low concentration).`;
  } else if (resilienceClass === "RESILIENT") {
    summary = `Pool has solid liquidity depth with ${recovery.depthBins} recovery bins (${formatUsd(recovery.depthUsd)} buffer). A ${formatUsd(shock10.shockSizeUsd)} (10%) sell shock traverses ${shock10.binsTraversed} bins. ${asymmetry.dominantSide !== "BALANCED" ? `${asymmetry.dominantSide} side is dominant (ratio: ${asymmetry.asymmetryRatio}x).` : "Buy/sell walls are balanced."}`;
  } else if (resilienceClass === "MODERATE") {
    summary = `Pool has moderate resilience. 10% shock depletes ${formatPct(shock10.reserveDepletionPct)} of reserves, causing ~${formatPct(shock10.priceImpactPct)} price impact. ${concentration.whaleRisk === "HIGH" ? `High concentration fragility (top bin holds ${formatPct(concentration.top1BinSharePct)} of liquidity).` : "Concentration is acceptable."}`;
  } else if (resilienceClass === "FRAGILE") {
    summary = `Pool is fragile. A 5% shock already depletes ${formatPct(shock5.reserveDepletionPct)} of reserves. Only ${recovery.depthBins} recovery bins available. Consider reducing position concentration (HHI=${concentration.hhi}).`;
  } else {
    summary = `Pool is brittle — liquidity is critically thin or concentrated. Even small trades (1-5% of TVL) may cause severe price impact. HHI=${concentration.hhi}, Gini=${concentration.giniCoefficient.toFixed(2)}, top bin holds ${formatPct(concentration.top1BinSharePct)} of all liquidity.`;
  }

  return {
    poolId,
    pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
    tvlUsd: Math.round(pool.tvlUsd),
    activeBinId,
    binsScanned: bins.length,
    binsWithLiquidity: activeBins.length,
    shockSimulations: shocks,
    buySellAsymmetry: asymmetry,
    concentrationRisk: concentration,
    recoveryDepthBins: recovery.depthBins,
    recoveryDepthUsd: recovery.depthUsd,
    recoveryDepthPctOfTvl: recovery.depthPct,
    shock5PctSurvived: shock5.absorbed,
    shock10PctSurvived: shock10.absorbed,
    shock25PctSurvived: shock25.absorbed,
    resilienceScore,
    resilienceClass,
    scoreBreakdown: breakdown,
    summary,
  };
}

// ── ASCII Visualization ────────────────────────────────────────────────────────

function renderResilienceReport(r: ResilienceAnalysis): void {
  const cls = r.resilienceClass;
  const clsIcon: Record<ResilienceClass, string> = {
    ANTIFRAGILE: "[**]",
    RESILIENT:   "[* ]",
    MODERATE:    "[~ ]",
    FRAGILE:     "[! ]",
    BRITTLE:     "[!!]",
  };

  console.log();
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log(`║   HODLMM Liquidity Resilience — Pool ${r.poolId}: ${r.pair.padEnd(20)} ║`);
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log();
  console.log(`  TVL: ${formatUsd(r.tvlUsd).padEnd(14)} Active Bin: ${r.activeBinId}`);
  console.log(`  Bins scanned: ${r.binsScanned}   With liquidity: ${r.binsWithLiquidity}`);
  console.log();

  // Resilience score
  console.log("── RESILIENCE SCORE ─────────────────────────────────────────────");
  const scoreBar = bar(r.resilienceScore, 100, 40, "█", "░");
  console.log(`  ${clsIcon[cls]} ${cls.padEnd(14)} ${scoreBar} ${r.resilienceScore}/100`);
  console.log();
  console.log("  Score breakdown:");
  const bd = r.scoreBreakdown;
  console.log(`    Shock Absorption   ${bar(bd.shockAbsorption, 30, 20)}  ${bd.shockAbsorption}/30`);
  console.log(`    Recovery Depth     ${bar(bd.recoveryDepth, 25, 20)}  ${bd.recoveryDepth}/25`);
  console.log(`    Asymmetry Balance  ${bar(bd.asymmetryBalance, 20, 20)}  ${bd.asymmetryBalance}/20`);
  console.log(`    Concentration Hlth ${bar(bd.concentrationHealth, 25, 20)}  ${bd.concentrationHealth}/25`);
  console.log();

  // Shock simulations
  console.log("── SHOCK ABSORPTION ─────────────────────────────────────────────");
  console.log("  Size      Trade$      Bins  Depletion   PriceImpact  Survived?");
  console.log("  ──────────────────────────────────────────────────────────────");
  for (const s of r.shockSimulations) {
    const sizeLabel = `${s.shockSizePct}%`.padEnd(8);
    const tradeLabel = formatUsd(s.shockSizeUsd).padEnd(12);
    const binsLabel  = String(s.binsTraversed).padEnd(6);
    const depLabel   = formatPct(s.reserveDepletionPct).padEnd(12);
    const impLabel   = formatPct(s.priceImpactPct).padEnd(13);
    const survLabel  = s.absorbed ? "YES" : "NO ";
    console.log(`  ${sizeLabel} ${tradeLabel} ${binsLabel} ${depLabel} ${impLabel} ${survLabel}`);
  }
  console.log();

  // Recovery depth
  console.log("── RECOVERY DEPTH ───────────────────────────────────────────────");
  const depthBar = bar(r.recoveryDepthBins, Math.max(r.recoveryDepthBins, 10), 30);
  console.log(`  Continuous reserve bins: ${r.recoveryDepthBins}`);
  console.log(`  Buffer depth: ${formatUsd(r.recoveryDepthUsd)} (${formatPct(r.recoveryDepthPctOfTvl)} of TVL)`);
  console.log(`  [${depthBar}] ${r.recoveryDepthBins} bins`);
  console.log();

  // Buy/sell asymmetry
  const a = r.buySellAsymmetry;
  console.log("── BUY / SELL ASYMMETRY ─────────────────────────────────────────");
  console.log(`  Buy-side depth:  ${formatUsd(a.buyDepthUsd).padEnd(12)} (above active bin)`);
  console.log(`  Sell-side depth: ${formatUsd(a.sellDepthUsd).padEnd(12)} (below active bin)`);
  console.log(`  Ratio (buy/sell): ${a.asymmetryRatio}x   Dominant: ${a.dominantSide}`);
  const asymBar = bar(a.asymmetryScore, 100, 30);
  console.log(`  Symmetry score: [${asymBar}] ${a.asymmetryScore}/100`);
  console.log();

  // Concentration risk
  const c = r.concentrationRisk;
  console.log("── CONCENTRATION RISK ───────────────────────────────────────────");
  console.log(`  Active bins: ${c.activeBins}   HHI: ${c.hhi}   Gini: ${c.giniCoefficient.toFixed(3)}`);
  console.log(`  Top 1 bin: ${formatPct(c.top1BinSharePct)} of TVL`);
  console.log(`  Top 3 bins: ${formatPct(c.top3BinsSharePct)} of TVL`);
  const hhiNorm = Math.min(c.hhi, 10000);
  const hhiBar = bar(10000 - hhiNorm, 10000, 30, "█", "░");
  console.log(`  Distribution health: [${hhiBar}]  Whale risk: ${c.whaleRisk}`);
  console.log();

  // Survival markers
  console.log("── STRESS TEST RESULTS ──────────────────────────────────────────");
  const mark = (b: boolean) => b ? "[PASS]" : "[FAIL]";
  console.log(`  ${mark(r.shock5PctSurvived)}  5% trade shock (${formatUsd(Math.round(r.tvlUsd * 0.05))})`);
  console.log(`  ${mark(r.shock10PctSurvived)} 10% trade shock (${formatUsd(Math.round(r.tvlUsd * 0.10))})`);
  console.log(`  ${mark(r.shock25PctSurvived)} 25% trade shock (${formatUsd(Math.round(r.tvlUsd * 0.25))})`);
  console.log();

  // Summary
  console.log("── SUMMARY ──────────────────────────────────────────────────────");
  // Word-wrap summary at ~66 chars
  const words = r.summary.split(" ");
  let line = "  ";
  for (const w of words) {
    if ((line + w).length > 66) {
      console.log(line);
      line = "  " + w + " ";
    } else {
      line += w + " ";
    }
  }
  if (line.trim()) console.log(line);
  console.log();
  console.log("─────────────────────────────────────────────────────────────────");
  console.log();
}

// ── Command Handlers ────────────────────────────────────────────────────────────

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

  console.log(
    JSON.stringify({
      tool: "hodlmm-liquidity-resilience",
      command: "doctor",
      status: Object.values(results).every((v) => v.startsWith("ok")) ? "healthy" : "degraded",
      checks: results,
      timestamp: new Date().toISOString(),
    }, null, 2)
  );
}

async function runInstallPacks(): Promise<void> {
  console.log(
    JSON.stringify({
      tool: "hodlmm-liquidity-resilience",
      command: "install-packs",
      status: "ok",
      message: "No additional dependencies required. Uses commander (workspace) + native fetch.",
      timestamp: new Date().toISOString(),
    })
  );
}

async function runAnalyze(options: { pool: string; json?: boolean }): Promise<void> {
  const poolId = parseInt(options.pool);
  if (isNaN(poolId)) {
    console.error("Error: Invalid pool ID — provide a numeric pool ID with --pool");
    process.exit(1);
  }

  const pools = await fetchAllPools();
  const pool = pools.find((p) => p.poolId === poolId);

  if (!pool) {
    console.error(`Error: Pool ${poolId} not found or below TVL threshold ($${MIN_TVL_USD})`);
    process.exit(1);
  }

  try {
    const result = await analyzePool(pool);

    if (options.json) {
      console.log(JSON.stringify({
        tool: "hodlmm-liquidity-resilience",
        command: "run",
        timestamp: new Date().toISOString(),
        ...result,
      }, null, 2));
    } else {
      renderResilienceReport(result);
    }
  } catch (e: any) {
    console.error(`Error analyzing pool ${poolId}: ${e.message}`);
    process.exit(1);
  }
}

async function runScan(options: { top?: string; json?: boolean }): Promise<void> {
  const topN = parseInt(options.top || "10");

  const pools = await fetchAllPools();

  if (pools.length === 0) {
    console.error("Error: No pools found above TVL threshold");
    process.exit(1);
  }

  const results: ResilienceAnalysis[] = [];
  const errors: { poolId: number; error: string }[] = [];

  for (const pool of pools.slice(0, topN * 2)) {
    try {
      const r = await analyzePool(pool);
      results.push(r);
    } catch (e: any) {
      errors.push({ poolId: pool.poolId!, error: e.message });
    }
  }

  // Sort by resilience score descending
  results.sort((a, b) => b.resilienceScore - a.resilienceScore);
  const ranked = results.slice(0, topN);

  if (options.json) {
    const classCounts: Record<string, number> = {
      ANTIFRAGILE: 0, RESILIENT: 0, MODERATE: 0, FRAGILE: 0, BRITTLE: 0
    };
    for (const r of ranked) classCounts[r.resilienceClass]++;

    console.log(JSON.stringify({
      tool: "hodlmm-liquidity-resilience",
      command: "scan",
      timestamp: new Date().toISOString(),
      poolsAnalyzed: results.length,
      errors: errors.length,
      summary: classCounts,
      avgResilienceScore: ranked.length > 0
        ? Math.round(ranked.reduce((s, r) => s + r.resilienceScore, 0) / ranked.length)
        : 0,
      results: ranked,
    }, null, 2));
    return;
  }

  // ASCII table output
  console.log();
  console.log("╔══════════════════════════════════════════════════════════════════════════╗");
  console.log("║          HODLMM Liquidity Resilience — Pool Rankings (Day 46)            ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════╝");
  console.log();
  console.log(` ${"#".padEnd(4)} ${"Pool".padEnd(8)} ${"Pair".padEnd(16)} ${"TVL".padEnd(12)} ${"Score".padEnd(8)} ${"Class".padEnd(14)} 5%  10%  25%`);
  console.log(" " + "─".repeat(77));

  let rank = 1;
  for (const r of ranked) {
    const pct5  = r.shock5PctSurvived  ? "OK " : "!! ";
    const pct10 = r.shock10PctSurvived ? "OK " : "!! ";
    const pct25 = r.shock25PctSurvived ? "OK " : "!! ";
    const scoreBar = bar(r.resilienceScore, 100, 10);
    console.log(
      ` ${String(rank).padEnd(4)} ${String(r.poolId).padEnd(8)} ${r.pair.padEnd(16)} ${formatUsd(r.tvlUsd).padEnd(12)} ${(r.resilienceScore + "/100").padEnd(8)} ${r.resilienceClass.padEnd(14)} ${pct5} ${pct10} ${pct25}`
    );
    rank++;
  }

  console.log();

  // Class distribution
  const classCounts: Record<string, number> = {
    ANTIFRAGILE: 0, RESILIENT: 0, MODERATE: 0, FRAGILE: 0, BRITTLE: 0
  };
  for (const r of ranked) classCounts[r.resilienceClass]++;

  console.log("── Classification Distribution ───────────────────────────────────");
  for (const [cls, count] of Object.entries(classCounts)) {
    if (count === 0) continue;
    const pct = Math.round((count / ranked.length) * 100);
    console.log(`  ${cls.padEnd(14)}: ${"█".repeat(count)}${"░".repeat(Math.max(0, topN - count))} ${count} (${pct}%)`);
  }

  console.log();
  const avgScore = ranked.length > 0
    ? Math.round(ranked.reduce((s, r) => s + r.resilienceScore, 0) / ranked.length)
    : 0;
  console.log(`  Average resilience score: ${avgScore}/100`);
  const mostResilient = ranked[0];
  if (mostResilient) {
    console.log(`  Most resilient: Pool ${mostResilient.poolId} (${mostResilient.pair}) — ${mostResilient.resilienceScore}/100 ${mostResilient.resilienceClass}`);
  }
  if (errors.length > 0) {
    console.log(`  Skipped (errors): ${errors.length} pools`);
  }
  console.log();
  console.log("─────────────────────────────────────────────────────────────────");
  console.log();
}

// ── CLI Setup ──────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-liquidity-resilience")
  .description(
    "HODLMM Liquidity Resilience Analyzer — Scores pools on shock absorption, recovery depth, buy/sell symmetry, and concentration fragility"
  )
  .version("1.0.0");

program
  .command("doctor")
  .description("Check API connectivity and dependencies")
  .action(runDoctor);

program
  .command("install-packs")
  .description("Install dependencies (none required beyond workspace)")
  .action(runInstallPacks);

program
  .command("run")
  .description("Analyze liquidity resilience for a specific pool")
  .requiredOption("--pool <id>", "HODLMM pool ID")
  .option("--json", "Output raw JSON instead of ASCII report")
  .action(runAnalyze);

program
  .command("scan")
  .description("Rank pools by resilience score (top N)")
  .option("--top <n>", "Number of top pools to analyze and rank", "10")
  .option("--json", "Output raw JSON instead of ASCII table")
  .action(runScan);

program.parse();
