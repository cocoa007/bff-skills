#!/usr/bin/env bun
/**
 * hodlmm-il-calculator.ts
 * Impermanent loss calculator for Bitflow HODLMM concentrated liquidity positions.
 * Models IL across price scenarios and compares against projected fee income
 * to show net P&L and breakeven thresholds.
 *
 * Author: cocoa007 (Fluid Briar) — FastPool CEO
 * Competition: AIBTC x BFF Skills Comp Day 14
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
  "IL estimates use simplified geometric models for concentrated liquidity. " +
  "Actual IL depends on exact bin distribution, fee reinvestment, rebalancing, " +
  "and path-dependent price action. Not financial advice.";

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
    headers: { Accept: "application/json", "User-Agent": "hodlmm-il-calculator/1.0" },
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

function getPoolId(pool: AppPool | QuotesPool): string {
  return ((pool as AppPool).poolId ?? pool.pool_id ?? "") as string;
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
function getActiveBinId(qp: QuotesPool): number {
  return ((qp as Record<string, unknown>).active_bin ?? qp.active_bin_id ?? qp.activeBinId ?? 0) as number;
}

function getBinStep(qp: QuotesPool): number {
  return (qp.bin_step ?? qp.binStep ?? 10) as number;
}

function getFeeBps(appPool: AppPool, qPool: QuotesPool): number {
  // baseFee from app API is decimal (e.g. 0.003 = 30 bps)
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
  if (typeof bin.liquidity === "number") return bin.liquidity;
  const rx = (bin.reserve_x ?? bin.reserveX ?? 0) as number;
  const ry = (bin.reserve_y ?? bin.reserveY ?? 0) as number;
  return rx + ry;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// IL calculation core
// ---------------------------------------------------------------------------

/**
 * Standard AMM IL for a given price ratio (new_price / entry_price).
 * IL = 2 * sqrt(r) / (1 + r) - 1
 * where r = price_ratio
 * Returns a negative number (loss).
 */
function standardIL(priceRatio: number): number {
  if (priceRatio <= 0) return -1;
  return 2 * Math.sqrt(priceRatio) / (1 + priceRatio) - 1;
}

/**
 * Concentrated liquidity IL amplification factor.
 * For a position covering bins from priceLow to priceHigh,
 * the IL is amplified relative to a full-range position.
 *
 * Amplification ~ 1 / (1 - sqrt(priceLow / priceHigh))
 * This captures how narrower ranges experience proportionally more IL.
 *
 * For DLMM: each bin step represents a (1 + binStep/10000) price multiplier.
 * A range of N bins centered on active bin covers a price range of:
 *   priceLow = activePrice * (1 + binStep/10000)^(-N/2)
 *   priceHigh = activePrice * (1 + binStep/10000)^(N/2)
 */
function concentratedIL(
  priceRatio: number,
  binCount: number,
  binStep: number
): { il_pct: number; amplification: number; in_range: boolean } {
  const stepMultiplier = 1 + binStep / 10000;
  const halfRange = binCount / 2;

  // Price bounds relative to entry (entry = 1.0)
  const priceLow = Math.pow(stepMultiplier, -halfRange);
  const priceHigh = Math.pow(stepMultiplier, halfRange);

  // Check if current price is still in range
  const inRange = priceRatio >= priceLow && priceRatio <= priceHigh;

  // Amplification factor for concentrated liquidity
  const sqrtRatio = Math.sqrt(priceLow / priceHigh);
  const amplification = sqrtRatio < 1 ? 1 / (1 - sqrtRatio) : 100;

  let ilPct: number;

  if (inRange) {
    // In-range: IL is amplified standard IL
    ilPct = standardIL(priceRatio) * amplification;
  } else {
    // Out-of-range: position is 100% one token
    // IL equals the loss from holding 100% of the depreciated token
    // vs holding the original 50/50 mix
    if (priceRatio < priceLow) {
      // Price dropped below range — position is 100% token X (the base token)
      // Value = priceRatio (all in token X which lost value)
      // HODL value = (1 + priceRatio) / 2
      // IL = priceRatio / ((1 + priceRatio) / 2) - 1... simplified:
      // More accurately: position value relative to HODL
      const posValue = priceRatio / priceLow; // normalized position value
      const hodlValue = (1 + priceRatio) / 2;
      ilPct = posValue * priceLow / hodlValue - 1;
    } else {
      // Price rose above range — position is 100% token Y (the quote token)
      // Position value stuck at priceHigh equivalent
      const posValue = priceHigh; // normalized
      const hodlValue = (1 + priceRatio) / 2;
      ilPct = posValue / hodlValue / 2 - 1;
    }
    // Clamp to reasonable range
    ilPct = Math.max(ilPct, -0.99);
  }

  return {
    il_pct: round4(ilPct * 100),
    amplification: round2(amplification),
    in_range: inRange,
  };
}

/**
 * Calculate fee income for a given period (days).
 * Returns percentage of position value earned in fees.
 */
function feeIncomePct(
  volume24hUsd: number,
  feeBps: number,
  concentrationFactor: number,
  totalPoolTvlUsd: number,
  days: number
): number {
  if (totalPoolTvlUsd === 0) return 0;
  const dailyFeeYieldPct = (volume24hUsd * (feeBps / 10000) * concentrationFactor) / totalPoolTvlUsd * 100;
  return round4(dailyFeeYieldPct * days);
}

/**
 * Find the price move (as ratio) where IL equals accumulated fee income.
 * Uses binary search.
 */
function findBreakevenMove(
  binCount: number,
  binStep: number,
  feeYieldPct: number,
  direction: "up" | "down"
): { breakeven_ratio: number; breakeven_pct_move: number } {
  let lo = direction === "down" ? 0.01 : 1.0;
  let hi = direction === "down" ? 1.0 : 5.0;

  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const il = concentratedIL(mid, binCount, binStep);
    const netPct = feeYieldPct + il.il_pct; // il_pct is negative

    if (Math.abs(netPct) < 0.01) {
      return {
        breakeven_ratio: round4(mid),
        breakeven_pct_move: round2((mid - 1) * 100),
      };
    }

    if (direction === "down") {
      if (netPct > 0) hi = mid; // need more price drop
      else lo = mid;
    } else {
      if (netPct > 0) lo = mid; // need more price rise
      else hi = mid;
    }
  }

  return {
    breakeven_ratio: round4((lo + hi) / 2),
    breakeven_pct_move: round2(((lo + hi) / 2 - 1) * 100),
  };
}

// ---------------------------------------------------------------------------
// Concentration factor from bins
// ---------------------------------------------------------------------------
function calcConcentrationFactor(
  bins: BinData[],
  lowBin: number,
  highBin: number
): number {
  let totalLiq = 0;
  let rangeLiq = 0;
  for (const bin of bins) {
    const id = getBinId(bin);
    const liq = getBinLiquidity(bin);
    totalLiq += liq;
    if (id >= lowBin && id <= highBin) rangeLiq += liq;
  }
  return totalLiq > 0 ? round4(rangeLiq / totalLiq) : 0.5;
}

// ---------------------------------------------------------------------------
// Output helper
// ---------------------------------------------------------------------------
function output(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdDoctor(): Promise<void> {
  const checks: Array<{ check: string; status: "ok" | "error"; detail: string }> = [];

  try {
    const pools = await fetchAppPools();
    const dlmm = pools.filter((p) => { const id = getPoolId(p); return id.startsWith("dlmm") || id.includes("hodlmm"); });
    checks.push({ check: "bitflow_app_pools", status: "ok", detail: `${pools.length} pools, ${dlmm.length} DLMM` });
  } catch (e) {
    checks.push({ check: "bitflow_app_pools", status: "error", detail: String(e) });
  }

  try {
    const qPools = await fetchQuotesPools();
    const active = qPools.filter((p) => getActiveBinId(p) > 0);
    checks.push({ check: "bitflow_quotes_pools", status: "ok", detail: `${qPools.length} pools, ${active.length} with active bins` });
  } catch (e) {
    checks.push({ check: "bitflow_quotes_pools", status: "error", detail: String(e) });
  }

  try {
    const bins = await fetchBins("dlmm_1");
    const withLiq = bins.filter((b) => getBinLiquidity(b) > 0);
    checks.push({ check: "bitflow_bins_api", status: "ok", detail: `${bins.length} bins, ${withLiq.length} with liquidity` });
  } catch (e) {
    checks.push({ check: "bitflow_bins_api", status: "error", detail: String(e) });
  }

  const allOk = checks.every((c) => c.status === "ok");
  output({
    status: allOk ? "ready" : "degraded",
    checks,
    message: allOk
      ? "All data sources reachable. Ready to calculate IL."
      : "Some data sources unavailable — IL estimates may be incomplete.",
  });
}

async function cmdAssess(opts: {
  poolId: string;
  binRange: string;
  holdDays: number;
}): Promise<void> {
  const { poolId, binRange, holdDays } = opts;

  let appPool: AppPool | undefined;
  let qPool: QuotesPool | undefined;

  try {
    const [appPools, qPools] = await Promise.all([fetchAppPools(), fetchQuotesPools()]);
    appPool = appPools.find((p) => getPoolId(p) === poolId);
    qPool = qPools.find((p) => getPoolId(p) === poolId);

    if (!appPool || !qPool) {
      const available = appPools.map((p) => getPoolId(p)).filter(Boolean).join(", ");
      output({ error: `Pool ${poolId} not found. Available: ${available}` });
      process.exit(1);
    }
  } catch (e) {
    output({ error: `Failed to fetch pool data: ${String(e)}` });
    process.exit(1);
  }

  const activeBinId = getActiveBinId(qPool);
  const binStep = getBinStep(qPool) || (appPool.binStep as number) || 10;
  const feeBps = getFeeBps(appPool, qPool);
  const volume24h = getVolume24h(appPool);
  const tvlUsd = getTvl(appPool);
  const poolName = getPoolName(appPool);

  // Resolve bin range
  let lowBin: number;
  let highBin: number;

  if (binRange === "active" || binRange === "") {
    lowBin = Math.max(0, activeBinId - 5);
    highBin = activeBinId + 5;
  } else if (binRange.includes("-")) {
    const parts = binRange.split("-");
    if (parts.length !== 2 || isNaN(Number(parts[0])) || isNaN(Number(parts[1]))) {
      output({ error: `Invalid bin range. Use "low-high" or "active". Got: ${binRange}` });
      process.exit(1);
    }
    lowBin = parseInt(parts[0]);
    highBin = parseInt(parts[1]);
  } else {
    output({ error: `Invalid --bin-range. Use "active" or "low-high".` });
    process.exit(1);
  }

  const binCount = highBin - lowBin + 1;

  // Fetch bins for concentration factor
  let concentrationFactor = 0.5;
  try {
    const bins = await fetchBins(poolId);
    if (bins.length > 0) {
      concentrationFactor = calcConcentrationFactor(bins, lowBin, highBin);
      if (concentrationFactor === 0) concentrationFactor = 0.5;
    }
  } catch {
    // Non-fatal
  }

  // Projected fee income over hold period
  const feePct = feeIncomePct(volume24h, feeBps, concentrationFactor, tvlUsd, holdDays);

  // Price scenarios: -50%, -30%, -20%, -10%, -5%, +5%, +10%, +20%, +30%, +50%
  const scenarios = [-0.5, -0.3, -0.2, -0.1, -0.05, 0.05, 0.1, 0.2, 0.3, 0.5].map((move) => {
    const priceRatio = 1 + move;
    const il = concentratedIL(priceRatio, binCount, binStep);
    const netPnlPct = round4(feePct + il.il_pct);

    return {
      price_move_pct: round2(move * 100),
      price_ratio: round4(priceRatio),
      il_pct: il.il_pct,
      il_amplification: il.amplification,
      in_range: il.in_range,
      fee_income_pct: feePct,
      net_pnl_pct: netPnlPct,
      verdict: netPnlPct >= 0 ? "PROFITABLE" : "LOSS",
    };
  });

  // Breakeven thresholds
  const breakevenDown = findBreakevenMove(binCount, binStep, feePct, "down");
  const breakevenUp = findBreakevenMove(binCount, binStep, feePct, "up");

  // Range width in price terms
  const stepMult = 1 + binStep / 10000;
  const halfRange = binCount / 2;
  const rangeLowPrice = round4(Math.pow(stepMult, -halfRange));
  const rangeHighPrice = round4(Math.pow(stepMult, halfRange));
  const rangeWidthPct = round2((rangeHighPrice - rangeLowPrice) * 100);

  const warnings: string[] = [];
  if (binCount <= 3) {
    warnings.push("Extremely tight range (<=3 bins). High fee capture when in-range, but very high IL and frequent out-of-range events.");
  }
  if (volume24h < 10000) {
    warnings.push(`Low 24h volume ($${volume24h.toLocaleString()}). Fee income projections unreliable.`);
  }
  if (binStep >= 100) {
    warnings.push(`High bin step (${binStep}). Each bin covers ${round2(binStep / 100)}% price range — volatile pair expected.`);
  }

  output({
    status: "success",
    pool_id: poolId,
    pool_name: poolName,
    position: {
      bin_range: { low: lowBin, high: highBin, active_bin: activeBinId, bin_count: binCount },
      bin_step: binStep,
      range_width_pct: rangeWidthPct,
      price_bounds: { low: rangeLowPrice, high: rangeHighPrice },
      hold_period_days: holdDays,
    },
    fee_projection: {
      volume_24h_usd: volume24h,
      fee_bps: feeBps,
      concentration_factor: concentrationFactor,
      projected_fee_income_pct: feePct,
    },
    il_scenarios: scenarios,
    breakeven: {
      downside: {
        breakeven_price_move_pct: breakevenDown.breakeven_pct_move,
        interpretation: `Price can drop ${Math.abs(breakevenDown.breakeven_pct_move).toFixed(1)}% before IL exceeds ${holdDays}-day fee income`,
      },
      upside: {
        breakeven_price_move_pct: breakevenUp.breakeven_pct_move,
        interpretation: `Price can rise ${breakevenUp.breakeven_pct_move.toFixed(1)}% before IL exceeds ${holdDays}-day fee income`,
      },
    },
    risk_summary: {
      il_amplification: round2(1 / (1 - Math.sqrt(rangeLowPrice / rangeHighPrice))),
      vs_standard_amm: `IL is ~${round2(1 / (1 - Math.sqrt(rangeLowPrice / rangeHighPrice)))}x a full-range position for same price move`,
      tightest_safe_move_pct: Math.min(
        Math.abs(breakevenDown.breakeven_pct_move),
        breakevenUp.breakeven_pct_move
      ),
    },
    warnings,
    disclaimer: DISCLAIMER,
  });
}

async function cmdBreakeven(opts: {
  poolId: string;
  binRange: string;
  holdDays: string;
}): Promise<void> {
  const { poolId, binRange } = opts;
  const holdPeriods = opts.holdDays.split(",").map((d) => parseInt(d.trim()));

  let appPool: AppPool | undefined;
  let qPool: QuotesPool | undefined;

  try {
    const [appPools, qPools] = await Promise.all([fetchAppPools(), fetchQuotesPools()]);
    appPool = appPools.find((p) => getPoolId(p) === poolId);
    qPool = qPools.find((p) => getPoolId(p) === poolId);

    if (!appPool || !qPool) {
      const available = appPools.map((p) => getPoolId(p)).filter(Boolean).join(", ");
      output({ error: `Pool ${poolId} not found. Available: ${available}` });
      process.exit(1);
    }
  } catch (e) {
    output({ error: `Failed to fetch pool data: ${String(e)}` });
    process.exit(1);
  }

  const activeBinId = getActiveBinId(qPool);
  const binStep = getBinStep(qPool) || (appPool.binStep as number) || 10;
  const feeBps = getFeeBps(appPool, qPool);
  const volume24h = getVolume24h(appPool);
  const tvlUsd = getTvl(appPool);
  const poolName = getPoolName(appPool);

  let lowBin: number;
  let highBin: number;
  if (binRange === "active" || binRange === "") {
    lowBin = Math.max(0, activeBinId - 5);
    highBin = activeBinId + 5;
  } else if (binRange.includes("-")) {
    const parts = binRange.split("-");
    lowBin = parseInt(parts[0]);
    highBin = parseInt(parts[1]);
  } else {
    output({ error: `Invalid --bin-range.` });
    process.exit(1);
  }

  const binCount = highBin - lowBin + 1;

  let concentrationFactor = 0.5;
  try {
    const bins = await fetchBins(poolId);
    if (bins.length > 0) {
      concentrationFactor = calcConcentrationFactor(bins, lowBin, highBin);
      if (concentrationFactor === 0) concentrationFactor = 0.5;
    }
  } catch {
    // Non-fatal
  }

  const periods = holdPeriods.map((days) => {
    const feePct = feeIncomePct(volume24h, feeBps, concentrationFactor, tvlUsd, days);
    const beDown = findBreakevenMove(binCount, binStep, feePct, "down");
    const beUp = findBreakevenMove(binCount, binStep, feePct, "up");

    return {
      hold_days: days,
      fee_income_pct: feePct,
      breakeven_down_pct: beDown.breakeven_pct_move,
      breakeven_up_pct: beUp.breakeven_pct_move,
      safe_range_pct: round2(beUp.breakeven_pct_move - beDown.breakeven_pct_move),
      interpretation:
        `After ${days} days: fees cover a ${Math.abs(beDown.breakeven_pct_move).toFixed(1)}% drop ` +
        `or ${beUp.breakeven_pct_move.toFixed(1)}% rise before IL wins`,
    };
  });

  output({
    status: "success",
    pool_id: poolId,
    pool_name: poolName,
    position: {
      bin_range: { low: lowBin, high: highBin, bin_count: binCount },
      bin_step: binStep,
    },
    breakeven_analysis: periods,
    takeaway:
      periods.length > 1
        ? `Longer hold = more fee buffer. ` +
          `${periods[periods.length - 1].hold_days}-day hold tolerates ` +
          `${periods[periods.length - 1].safe_range_pct.toFixed(1)}% price swing vs ` +
          `${periods[0].safe_range_pct.toFixed(1)}% for ${periods[0].hold_days}-day hold.`
        : `${periods[0].hold_days}-day hold tolerates ${periods[0].safe_range_pct.toFixed(1)}% total price swing.`,
    disclaimer: DISCLAIMER,
  });
}

async function cmdCompare(opts: { pools: string; holdDays: number }): Promise<void> {
  const { holdDays } = opts;

  let appPools: AppPool[];
  let qPools: QuotesPool[];

  try {
    [appPools, qPools] = await Promise.all([fetchAppPools(), fetchQuotesPools()]);
  } catch (e) {
    output({ error: `Failed to fetch pool data: ${String(e)}` });
    process.exit(1);
  }

  let filterIds: string[] | null = null;
  if (opts.pools && opts.pools.trim() !== "") {
    filterIds = opts.pools.split(",").map((s) => s.trim());
  }

  const dlmmPools = appPools.filter((p) => {
    const id = getPoolId(p);
    if (filterIds) return filterIds.includes(id);
    return id.startsWith("dlmm") || id.includes("hodlmm");
  });

  if (dlmmPools.length === 0) {
    output({ error: "No DLMM pools found." });
    process.exit(1);
  }

  type RankedPool = {
    pool_id: string;
    pool_name: string;
    fee_income_pct: number;
    il_at_10pct_drop: number;
    il_at_10pct_rise: number;
    net_pnl_10pct_drop: number;
    net_pnl_10pct_rise: number;
    breakeven_down_pct: number;
    breakeven_up_pct: number;
    il_amplification: number;
    risk_adjusted_score: number;
    warnings: string[];
  };

  const ranked: RankedPool[] = [];

  for (const ap of dlmmPools) {
    const apId = getPoolId(ap);
    const qp = qPools.find((q) => getPoolId(q) === apId);
    const activeBin = qp ? getActiveBinId(qp) : 0;
    const binStep = qp ? getBinStep(qp) : (ap.binStep as number) || 10;
    const feeBps = qp ? getFeeBps(ap, qp) : 30;
    const volume24h = getVolume24h(ap);
    const tvlUsd = getTvl(ap);
    const poolWarnings: string[] = [];

    // Default range: active ± 5
    const lowBin = Math.max(0, activeBin - 5);
    const highBin = activeBin + 5;
    const binCount = highBin - lowBin + 1;

    let concentrationFactor = 0.5;
    try {
      const bins = await fetchBins(apId);
      if (bins.length > 0) {
        concentrationFactor = calcConcentrationFactor(bins, lowBin, highBin);
        if (concentrationFactor === 0) concentrationFactor = 0.5;
      }
    } catch {
      poolWarnings.push("Bin data unavailable");
    }

    const feePct = feeIncomePct(volume24h, feeBps, concentrationFactor, tvlUsd, holdDays);

    // IL at ±10% price move
    const ilDown10 = concentratedIL(0.9, binCount, binStep);
    const ilUp10 = concentratedIL(1.1, binCount, binStep);

    const netDown = round4(feePct + ilDown10.il_pct);
    const netUp = round4(feePct + ilUp10.il_pct);

    // Breakeven
    const beDown = findBreakevenMove(binCount, binStep, feePct, "down");
    const beUp = findBreakevenMove(binCount, binStep, feePct, "up");

    // Risk-adjusted score: fee income weighted by breakeven tolerance
    // Higher is better: you earn more fees AND can tolerate larger price moves
    const safeRange = beUp.breakeven_pct_move - beDown.breakeven_pct_move;
    const riskAdjustedScore = round4(feePct * safeRange / 100);

    if (volume24h < 10000) poolWarnings.push("Low volume");

    ranked.push({
      pool_id: apId,
      pool_name: getPoolName(ap),
      fee_income_pct: feePct,
      il_at_10pct_drop: ilDown10.il_pct,
      il_at_10pct_rise: ilUp10.il_pct,
      net_pnl_10pct_drop: netDown,
      net_pnl_10pct_rise: netUp,
      breakeven_down_pct: beDown.breakeven_pct_move,
      breakeven_up_pct: beUp.breakeven_pct_move,
      il_amplification: ilDown10.amplification,
      risk_adjusted_score: riskAdjustedScore,
      warnings: poolWarnings,
    });
  }

  // Sort by risk-adjusted score descending
  ranked.sort((a, b) => b.risk_adjusted_score - a.risk_adjusted_score);

  const best = ranked[0];
  const recommendation = ranked.length > 0
    ? `${best.pool_id} (${best.pool_name}) has the best risk-adjusted profile: ` +
      `${best.fee_income_pct.toFixed(2)}% fee income over ${holdDays} days with ` +
      `${Math.abs(best.breakeven_down_pct).toFixed(1)}% downside / ${best.breakeven_up_pct.toFixed(1)}% upside tolerance.`
    : "No pools available.";

  output({
    status: "success",
    hold_period_days: holdDays,
    compared_pools: ranked.length,
    ranked,
    recommendation,
    scoring_method: "risk_adjusted_score = fee_income_pct * breakeven_range / 100 (higher = better fee/risk ratio)",
    disclaimer: DISCLAIMER,
  });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const program = new Command();

program
  .name("hodlmm-il-calculator")
  .description("Impermanent loss calculator for Bitflow HODLMM concentrated liquidity positions.")
  .version("1.0.0");

program
  .command("doctor")
  .description("Check Bitflow API connectivity")
  .action(async () => {
    try { await cmdDoctor(); } catch (e) { output({ error: String(e) }); process.exit(1); }
  });

program
  .command("assess")
  .description("Calculate IL across price scenarios for a pool position")
  .requiredOption("--pool-id <id>", "Pool ID (e.g. dlmm_1)")
  .option("--bin-range <range>", 'Bin range as "low-high" or "active"', "active")
  .option("--hold-days <days>", "Expected hold period in days", "30")
  .action(async (opts) => {
    try {
      await cmdAssess({
        poolId: opts.poolId,
        binRange: opts.binRange,
        holdDays: parseInt(opts.holdDays) || 30,
      });
    } catch (e) { output({ error: String(e) }); process.exit(1); }
  });

program
  .command("breakeven")
  .description("Find price move thresholds where IL exceeds fee income")
  .requiredOption("--pool-id <id>", "Pool ID (e.g. dlmm_1)")
  .option("--bin-range <range>", 'Bin range as "low-high" or "active"', "active")
  .option("--hold-days <days>", "Comma-separated hold periods (e.g. 7,14,30,90)", "7,14,30,90")
  .action(async (opts) => {
    try {
      await cmdBreakeven({
        poolId: opts.poolId,
        binRange: opts.binRange,
        holdDays: opts.holdDays,
      });
    } catch (e) { output({ error: String(e) }); process.exit(1); }
  });

program
  .command("compare")
  .description("Rank pools by IL-adjusted net yield (risk-adjusted)")
  .option("--pools <ids>", "Comma-separated pool IDs (default: all DLMM)", "")
  .option("--hold-days <days>", "Hold period in days for comparison", "30")
  .action(async (opts) => {
    try {
      await cmdCompare({ pools: opts.pools, holdDays: parseInt(opts.holdDays) || 30 });
    } catch (e) { output({ error: String(e) }); process.exit(1); }
  });

program.parse(process.argv);
