#!/usr/bin/env bun
/**
 * hodlmm-correlation-tracker.ts
 * Monitors token pair price correlation in Bitflow HODLMM concentrated LP pools.
 * Detects decorrelation events that amplify impermanent loss risk, tracks
 * correlation regimes (TIGHT/NORMAL/LOOSE/DIVERGING), and estimates
 * IL exposure from correlation breakdown.
 *
 * Author: cocoa007 (Fluid Briar) — FastPool CEO
 * Competition: AIBTC x BFF Skills Comp Day 18
 *
 * Read-only. No wallet required. No transactions.
 * All data from Bitflow public APIs.
 */

import { Command } from "commander";

// ---------------------------------------------------------------------------
// API endpoints
// ---------------------------------------------------------------------------
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const BFF_QUOTES_BASE = "https://bff.bitflowapis.finance/api/quotes/v1";

const DISCLAIMER =
  "Correlation analysis is based on pool snapshot data and bin distribution. " +
  "Price movements, volume, and liquidity change constantly. Always combine " +
  "with il-calculator and safety-check before making LP decisions. Not financial advice.";

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------
interface AppPool {
  pool_id?: string;
  poolId?: string;
  pool_name?: string;
  name?: string;
  volume_24h?: number;
  volume24h?: number;
  volumeUsd1d?: number;
  tvl?: number;
  tvlUsd?: number;
  apr?: number;
  fee_bps?: number;
  fee?: number;
  baseFee?: number;
  binStep?: number;
  token_x?: { symbol: string; decimals: number; price_usd?: number };
  token_y?: { symbol: string; decimals: number; price_usd?: number };
  [key: string]: unknown;
}

interface QuotesPool {
  pool_id: string;
  active_bin_id?: number;
  activeBinId?: number;
  bin_step?: number;
  binStep?: number;
  fee_bps?: number;
  [key: string]: unknown;
}

interface BinData {
  bin_id: number;
  id?: number;
  reserve_x?: number;
  reserveX?: number;
  reserve_y?: number;
  reserveY?: number;
  liquidity?: number;
  price?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "hodlmm-correlation-tracker/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Data fetchers
// ---------------------------------------------------------------------------
async function fetchAppPools(): Promise<AppPool[]> {
  const data = await fetchJson(`${BFF_APP_BASE}/pools`);
  if (Array.isArray(data)) return data as AppPool[];
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.data)) return d.data as AppPool[];
  if (Array.isArray(d.pools)) return d.pools as AppPool[];
  throw new Error("Unexpected pools response shape");
}

async function fetchQuotesPools(): Promise<QuotesPool[]> {
  const data = await fetchJson(`${BFF_QUOTES_BASE}/pools`);
  if (Array.isArray(data)) return data as QuotesPool[];
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.pools)) return d.pools as QuotesPool[];
  if (Array.isArray(d.data)) return d.data as QuotesPool[];
  throw new Error("Unexpected quotes pools response shape");
}

async function fetchBins(poolId: string): Promise<BinData[]> {
  const data = await fetchJson(`${BFF_QUOTES_BASE}/bins/${poolId}`);
  if (Array.isArray(data)) return data as BinData[];
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.bins)) return d.bins as BinData[];
  if (Array.isArray(d.data)) return d.data as BinData[];
  return [];
}

// ---------------------------------------------------------------------------
// Pool resolution helpers
// ---------------------------------------------------------------------------
function getPoolId(pool: AppPool | QuotesPool): string {
  return ((pool as AppPool).poolId ?? pool.pool_id ?? "") as string;
}

function getActiveBinId(qp: QuotesPool): number {
  return ((qp as Record<string, unknown>).active_bin ?? qp.active_bin_id ?? qp.activeBinId ?? 0) as number;
}

function getBinStep(qp: QuotesPool): number {
  return (qp.bin_step ?? qp.binStep ?? 10) as number;
}

function getFeeBps(appPool: AppPool, qPool: QuotesPool): number {
  const raw = appPool.baseFee ?? appPool.fee_bps ?? appPool.fee ?? qPool.fee_bps ?? 0.003;
  if (typeof raw === "number" && raw < 1) return Math.round(raw * 10000);
  return raw as number;
}

function getVolume24h(appPool: AppPool): number {
  return (appPool.volumeUsd1d ?? appPool.volume_24h ?? appPool.volume24h ?? 0) as number;
}

function getTvl(appPool: AppPool): number {
  return (appPool.tvlUsd ?? appPool.tvl ?? 0) as number;
}

function getPoolName(appPool: AppPool): string {
  return (appPool.pool_name ?? appPool.name ?? getPoolId(appPool)) as string;
}

function getBinId(bin: BinData): number {
  return (bin.bin_id ?? bin.id ?? 0) as number;
}

function getBinLiquidity(bin: BinData): number {
  if (bin.liquidity != null) {
    const v = Number(bin.liquidity);
    if (!isNaN(v) && v > 0) return v;
  }
  const rx = Number(bin.reserve_x ?? bin.reserveX ?? 0) || 0;
  const ry = Number(bin.reserve_y ?? bin.reserveY ?? 0) || 0;
  return rx + ry;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function output(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// Correlation analysis core
// ---------------------------------------------------------------------------

/**
 * Compute reserve ratio asymmetry across bins.
 * In a perfectly correlated pair (e.g. sBTC/BTC), reserves are balanced.
 * Decorrelation causes one-sided bins: heavy X or heavy Y.
 */
function computeReserveAsymmetry(bins: BinData[]): {
  asymmetryScore: number;
  xDominantBins: number;
  yDominantBins: number;
  balancedBins: number;
  totalActiveBins: number;
} {
  let xDom = 0, yDom = 0, balanced = 0, totalActive = 0;
  const asymmetries: number[] = [];

  for (const bin of bins) {
    const rx = Number(bin.reserve_x ?? bin.reserveX ?? 0) || 0;
    const ry = Number(bin.reserve_y ?? bin.reserveY ?? 0) || 0;
    const total = rx + ry;
    if (total <= 0) continue;
    totalActive++;

    const ratio = rx / total; // 0 = all Y, 1 = all X, 0.5 = balanced
    const asym = Math.abs(ratio - 0.5) * 2; // 0 = balanced, 1 = fully one-sided
    asymmetries.push(asym);

    if (ratio > 0.7) xDom++;
    else if (ratio < 0.3) yDom++;
    else balanced++;
  }

  const avgAsym = asymmetries.length > 0
    ? asymmetries.reduce((a, b) => a + b, 0) / asymmetries.length
    : 0;

  return {
    asymmetryScore: round4(avgAsym),
    xDominantBins: xDom,
    yDominantBins: yDom,
    balancedBins: balanced,
    totalActiveBins: totalActive,
  };
}

/**
 * Compute liquidity concentration around the active bin.
 * Tight correlation = liquidity concentrated near active bin.
 * Decorrelation = liquidity spread wide or shifted away.
 */
function computeConcentrationProfile(
  bins: BinData[],
  activeBin: number,
  binStep: number
): {
  concentrationScore: number;
  liquidityWithin5: number;
  liquidityWithin10: number;
  liquidityWithin25: number;
  totalLiquidity: number;
  centerOfMass: number;
  centerOfMassOffset: number;
} {
  let within5 = 0, within10 = 0, within25 = 0, totalLiq = 0;
  let weightedSum = 0;

  for (const bin of bins) {
    const id = getBinId(bin);
    const liq = getBinLiquidity(bin);
    if (liq <= 0) continue;

    const dist = Math.abs(id - activeBin);
    totalLiq += liq;
    weightedSum += id * liq;

    if (dist <= 5) within5 += liq;
    if (dist <= 10) within10 += liq;
    if (dist <= 25) within25 += liq;
  }

  const centerOfMass = totalLiq > 0 ? weightedSum / totalLiq : activeBin;
  const offset = centerOfMass - activeBin;

  // Concentration score: fraction of liquidity within ±10 bins
  const concScore = totalLiq > 0 ? within10 / totalLiq : 0;

  return {
    concentrationScore: round4(concScore),
    liquidityWithin5: round2(within5),
    liquidityWithin10: round2(within10),
    liquidityWithin25: round2(within25),
    totalLiquidity: round2(totalLiq),
    centerOfMass: round2(centerOfMass),
    centerOfMassOffset: round2(offset),
  };
}

/**
 * Detect price spread across bins to estimate price divergence.
 * In correlated pairs, price range is narrow. In decorrelating pairs, it widens.
 */
function computePriceSpread(
  bins: BinData[],
  activeBin: number,
  binStep: number
): {
  priceRangeRatio: number;
  effectiveSpreadBps: number;
  spreadRegime: string;
} {
  const activeBins = bins.filter(b => getBinLiquidity(b) > 0);
  if (activeBins.length === 0) {
    return { priceRangeRatio: 0, effectiveSpreadBps: 0, spreadRegime: "EMPTY" };
  }

  const ids = activeBins.map(b => getBinId(b));
  const minId = Math.min(...ids);
  const maxId = Math.max(...ids);
  const range = maxId - minId;

  // Each bin step = binStep bps of price movement
  const spreadBps = range * binStep;

  // Classify spread regime
  let regime: string;
  if (spreadBps <= 50) regime = "TIGHT";
  else if (spreadBps <= 200) regime = "NORMAL";
  else if (spreadBps <= 500) regime = "WIDE";
  else regime = "EXTREME";

  // Price ratio: max/min bin implied price ratio
  const stepFactor = 1 + binStep / 10000;
  const priceRatio = Math.pow(stepFactor, range);

  return {
    priceRangeRatio: round4(priceRatio),
    effectiveSpreadBps: spreadBps,
    spreadRegime: regime,
  };
}

/**
 * Estimate IL from current bin distribution relative to active bin.
 * Uses the standard AMM IL formula based on price ratio.
 */
function standardIL(priceRatio: number): number {
  if (priceRatio <= 0) return -1;
  return 2 * Math.sqrt(priceRatio) / (1 + priceRatio) - 1;
}

/**
 * Compute correlation regime from multiple signals.
 */
type CorrelationRegime = "TIGHT" | "NORMAL" | "LOOSE" | "DIVERGING";

function classifyCorrelation(
  asymmetry: number,
  concentration: number,
  spreadBps: number
): {
  regime: CorrelationRegime;
  score: number;
  riskLevel: number;
} {
  // Correlation score: 0 = fully decorrelated, 1 = perfectly correlated
  // High concentration + low asymmetry + tight spread = high correlation
  const concComponent = concentration * 0.4;
  const asymComponent = (1 - asymmetry) * 0.35;
  const spreadComponent = Math.max(0, 1 - spreadBps / 500) * 0.25;

  const score = round4(concComponent + asymComponent + spreadComponent);

  let regime: CorrelationRegime;
  let riskLevel: number;

  if (score >= 0.75) {
    regime = "TIGHT";
    riskLevel = 1;
  } else if (score >= 0.5) {
    regime = "NORMAL";
    riskLevel = 3;
  } else if (score >= 0.3) {
    regime = "LOOSE";
    riskLevel = 6;
  } else {
    regime = "DIVERGING";
    riskLevel = 9;
  }

  return { regime, score, riskLevel };
}

/**
 * Generate LP action recommendation based on correlation regime.
 */
function generateRecommendation(
  regime: CorrelationRegime,
  riskLevel: number,
  centerOffset: number,
  feeBps: number,
  vol24h: number,
  tvl: number
): {
  action: string;
  reasoning: string;
  urgency: number;
} {
  const volumeTvlRatio = tvl > 0 ? vol24h / tvl : 0;
  const feeYieldDaily = volumeTvlRatio * feeBps / 10000;
  const driftSignificant = Math.abs(centerOffset) > 5;

  switch (regime) {
    case "TIGHT":
      return {
        action: "HOLD — Correlation intact",
        reasoning: `Token pair tracking closely. Center-of-mass offset: ${centerOffset} bins. ` +
          `Daily fee yield ~${round4(feeYieldDaily * 100)}%. IL risk minimal at current correlation.`,
        urgency: 1,
      };

    case "NORMAL":
      return {
        action: driftSignificant ? "MONITOR — Mild drift detected" : "HOLD — Normal correlation range",
        reasoning: `Pair within normal correlation band. ${driftSignificant ? `Center drifting ${centerOffset > 0 ? "right" : "left"} by ${Math.abs(centerOffset)} bins — watch for further movement.` : "No significant drift."} ` +
          `Fee yield ${round4(feeYieldDaily * 100)}% daily should offset mild IL.`,
        urgency: driftSignificant ? 4 : 2,
      };

    case "LOOSE":
      return {
        action: "REBALANCE — Correlation weakening",
        reasoning: `Pair decorrelating — reserves becoming one-sided. ${driftSignificant ? `Significant center shift of ${Math.abs(centerOffset)} bins.` : ""} ` +
          `Fee yield ${round4(feeYieldDaily * 100)}% may not offset growing IL. Consider narrowing range or waiting for re-correlation.`,
        urgency: 6,
      };

    case "DIVERGING":
      return {
        action: "EXIT RISK — Strong decorrelation",
        reasoning: `Token pair showing strong divergence. Reserves heavily one-sided, liquidity spread wide. ` +
          `IL accumulating faster than fee income (${round4(feeYieldDaily * 100)}% daily yield). ` +
          `Cross-check with exit-optimizer and il-calculator for position-specific assessment.`,
        urgency: 8,
      };
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function analyzePool(poolIdOrName: string): Promise<void> {
  const [appPools, quotesPools] = await Promise.all([fetchAppPools(), fetchQuotesPools()]);

  const search = poolIdOrName.toLowerCase();
  const appPool = appPools.find(
    p => getPoolId(p).toLowerCase() === search ||
      getPoolName(p).toLowerCase().includes(search)
  );
  if (!appPool) {
    output({ error: `Pool not found: ${poolIdOrName}`, hint: "Use 'list' to see available pools" });
    return;
  }

  const poolId = getPoolId(appPool);
  const qPool = quotesPools.find(p => getPoolId(p) === poolId);
  if (!qPool) {
    output({ error: `No quotes data for pool ${poolId}` });
    return;
  }

  const activeBin = getActiveBinId(qPool);
  const binStep = getBinStep(qPool);
  const feeBps = getFeeBps(appPool, qPool);
  const vol24h = getVolume24h(appPool);
  const tvl = getTvl(appPool);

  const bins = await fetchBins(poolId);
  if (bins.length === 0) {
    output({ error: `No bin data for pool ${poolId}` });
    return;
  }

  // Run all analyses
  const asymmetry = computeReserveAsymmetry(bins);
  const concentration = computeConcentrationProfile(bins, activeBin, binStep);
  const spread = computePriceSpread(bins, activeBin, binStep);

  // Classify correlation
  const correlation = classifyCorrelation(
    asymmetry.asymmetryScore,
    concentration.concentrationScore,
    spread.effectiveSpreadBps
  );

  // Estimate IL from price spread
  const ilEstimate = standardIL(spread.priceRangeRatio);

  // Generate recommendation
  const recommendation = generateRecommendation(
    correlation.regime,
    correlation.riskLevel,
    concentration.centerOfMassOffset,
    feeBps,
    vol24h,
    tvl
  );

  output({
    pool: {
      id: poolId,
      name: getPoolName(appPool),
      activeBin,
      binStep,
      feeBps,
      volume24hUsd: round2(vol24h),
      tvlUsd: round2(tvl),
      tokenX: appPool.token_x?.symbol ?? "?",
      tokenY: appPool.token_y?.symbol ?? "?",
    },
    correlation: {
      regime: correlation.regime,
      score: correlation.score,
      riskLevel: correlation.riskLevel,
      riskLabel: ["", "MINIMAL", "LOW", "MODERATE", "", "", "ELEVATED", "", "HIGH", "CRITICAL"][correlation.riskLevel] || "UNKNOWN",
    },
    reserveAsymmetry: asymmetry,
    concentrationProfile: concentration,
    priceSpread: spread,
    ilEstimate: {
      currentIL: `${round4(ilEstimate * 100)}%`,
      rawIL: round4(ilEstimate),
      priceRangeRatio: spread.priceRangeRatio,
    },
    recommendation,
    disclaimer: DISCLAIMER,
  });
}

async function listPools(): Promise<void> {
  const [appPools, quotesPools] = await Promise.all([fetchAppPools(), fetchQuotesPools()]);

  const results = [];
  for (const ap of appPools) {
    const poolId = getPoolId(ap);
    const qp = quotesPools.find(p => getPoolId(p) === poolId);
    if (!qp) continue;

    const tvl = getTvl(ap);
    if (tvl < 100) continue; // skip dust pools

    results.push({
      id: poolId,
      name: getPoolName(ap),
      tokenX: ap.token_x?.symbol ?? "?",
      tokenY: ap.token_y?.symbol ?? "?",
      tvlUsd: round2(tvl),
      volume24hUsd: round2(getVolume24h(ap)),
      binStep: getBinStep(qp),
    });
  }

  results.sort((a, b) => b.tvlUsd - a.tvlUsd);

  output({
    pools: results,
    count: results.length,
    hint: "Use 'analyze <pool-id>' to run correlation analysis on a specific pool",
  });
}

async function scanAll(opts: { top?: string; threshold?: string }): Promise<void> {
  const topN = parseInt(opts.top ?? "10", 10);
  const riskThreshold = parseInt(opts.threshold ?? "0", 10);

  const [appPools, quotesPools] = await Promise.all([fetchAppPools(), fetchQuotesPools()]);

  // Sort by TVL, take top N
  const sorted = [...appPools]
    .filter(ap => getTvl(ap) >= 100)
    .sort((a, b) => getTvl(b) - getTvl(a))
    .slice(0, topN);

  const results = [];
  for (const ap of sorted) {
    const poolId = getPoolId(ap);
    const qp = quotesPools.find(p => getPoolId(p) === poolId);
    if (!qp) continue;

    const activeBin = getActiveBinId(qp);
    const binStep = getBinStep(qp);
    const feeBps = getFeeBps(ap, qp);

    try {
      const bins = await fetchBins(poolId);
      if (bins.length === 0) continue;

      const asymmetry = computeReserveAsymmetry(bins);
      const concentration = computeConcentrationProfile(bins, activeBin, binStep);
      const spread = computePriceSpread(bins, activeBin, binStep);
      const correlation = classifyCorrelation(
        asymmetry.asymmetryScore,
        concentration.concentrationScore,
        spread.effectiveSpreadBps
      );

      if (correlation.riskLevel < riskThreshold) continue;

      results.push({
        pool: getPoolName(ap),
        id: poolId,
        tokenX: ap.token_x?.symbol ?? "?",
        tokenY: ap.token_y?.symbol ?? "?",
        tvlUsd: round2(getTvl(ap)),
        regime: correlation.regime,
        correlationScore: correlation.score,
        riskLevel: correlation.riskLevel,
        asymmetry: asymmetry.asymmetryScore,
        concentrationNear: round4(concentration.concentrationScore),
        spreadBps: spread.effectiveSpreadBps,
      });
    } catch {
      // Skip pools with fetch errors
    }
  }

  // Sort by risk level descending
  results.sort((a, b) => b.riskLevel - a.riskLevel || a.correlationScore - b.correlationScore);

  output({
    scan: results,
    count: results.length,
    filter: riskThreshold > 0 ? `Risk >= ${riskThreshold}` : "All",
    disclaimer: DISCLAIMER,
  });
}

// ---------------------------------------------------------------------------
// CLI setup
// ---------------------------------------------------------------------------
const program = new Command();
program
  .name("hodlmm-correlation-tracker")
  .description(
    "Monitor token pair price correlation in Bitflow HODLMM concentrated LP pools. " +
    "Detects decorrelation events that amplify impermanent loss risk."
  )
  .version("1.0.0");

program
  .command("analyze <pool>")
  .description("Deep correlation analysis for a specific HODLMM pool")
  .action(async (pool: string) => {
    await analyzePool(pool);
  });

program
  .command("list")
  .description("List available HODLMM pools with basic info")
  .action(async () => {
    await listPools();
  });

program
  .command("scan")
  .description("Scan top pools for decorrelation risk")
  .option("--top <n>", "Number of top pools to scan", "10")
  .option("--threshold <n>", "Minimum risk level to show (0-9)", "0")
  .action(async (opts: { top?: string; threshold?: string }) => {
    await scanAll(opts);
  });

program.parse();
