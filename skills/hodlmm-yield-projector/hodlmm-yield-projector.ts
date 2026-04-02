#!/usr/bin/env bun
/**
 * hodlmm-yield-projector.ts
 * Forward-looking fee yield estimator for Bitflow HODLMM concentrated liquidity positions.
 *
 * Author: cocoa007 (Fluid Briar) — FastPool CEO
 * Competition: AIBTC x BFF Skills Comp Day 11
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
  "Projections based on recent historical volume. Not a guarantee. " +
  "Actual returns depend on sustained volume, position staying in range, " +
  "and impermanent loss (IL), which can exceed fee income on volatile pairs.";

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------
interface AppPool {
  pool_id: string;
  pool_name?: string;
  name?: string;
  volume_24h?: number;
  volume24h?: number;
  tvl?: number;
  apr?: number;
  fee_bps?: number;
  fee?: number;
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

interface ProjectionResult {
  status: "success" | "error";
  pool_id?: string;
  pool_name?: string;
  bin_range?: { low: number; high: number; active_bin: number; bin_count: number };
  projections?: {
    daily_fee_yield_pct: number;
    weekly_fee_yield_pct: number;
    monthly_fee_yield_pct: number;
    annualized_fee_yield_pct: number;
  };
  inputs?: {
    volume_24h_usd: number;
    fee_bps: number;
    concentration_factor: number;
    position_tvl_estimate_usd: number;
    active_bin_liquidity_usd: number;
    total_pool_liquidity_usd: number;
  };
  warnings?: string[];
  disclaimer?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "hodlmm-yield-projector/1.0" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Data fetchers
// ---------------------------------------------------------------------------
async function fetchAppPools(): Promise<AppPool[]> {
  const data = await fetchJson(`${BFF_APP_BASE}/pools`);
  // API might return array directly or wrapped
  if (Array.isArray(data)) return data as AppPool[];
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.pools)) return d.pools as AppPool[];
  if (Array.isArray(d.data)) return d.data as AppPool[];
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
function getActiveBinId(qp: QuotesPool): number {
  return (qp.active_bin_id ?? qp.activeBinId ?? 0) as number;
}

function getBinStep(qp: QuotesPool): number {
  return (qp.bin_step ?? qp.binStep ?? 10) as number;
}

function getFeeBps(appPool: AppPool, qPool: QuotesPool): number {
  const raw = appPool.fee_bps ?? appPool.fee ?? qPool.fee_bps ?? 30;
  // Some pools return fee as a decimal (e.g., 0.003 = 0.3% = 30 bps)
  if (typeof raw === "number" && raw < 1) return Math.round(raw * 10000);
  return raw as number;
}

function getVolume24h(appPool: AppPool): number {
  return (appPool.volume_24h ?? appPool.volume24h ?? 0) as number;
}

function getTvl(appPool: AppPool): number {
  return (appPool.tvl ?? 0) as number;
}

function getPoolName(appPool: AppPool): string {
  return (appPool.pool_name ?? appPool.name ?? appPool.pool_id) as string;
}

function getBinId(bin: BinData): number {
  return (bin.bin_id ?? bin.id ?? 0) as number;
}

function getBinLiquidity(bin: BinData): number {
  // Use explicit liquidity field first, fall back to sum of reserves
  if (typeof bin.liquidity === "number") return bin.liquidity;
  const rx = (bin.reserve_x ?? bin.reserveX ?? 0) as number;
  const ry = (bin.reserve_y ?? bin.reserveY ?? 0) as number;
  return rx + ry;
}

// ---------------------------------------------------------------------------
// Yield projection core
// ---------------------------------------------------------------------------
function projectYield(
  volume24hUsd: number,
  feeBps: number,
  concentrationFactor: number,
  positionTvlUsd: number,
  totalPoolTvlUsd: number
): { daily: number; weekly: number; monthly: number; annual: number } {
  // Fee income generated by the whole pool per day
  const poolDailyFees = volume24hUsd * (feeBps / 10000);

  // LP's share of fee income based on their share of active-bin liquidity
  // concentration_factor = active_bin_liquidity / total_pool_liquidity
  // position_share = (positionTvlUsd / active_bin_liquidity)
  //
  // Combined: lp_daily_fees = poolDailyFees * concentration_factor * (positionTvlUsd / totalPoolTvlUsd)
  // Yield % = lp_daily_fees / positionTvlUsd * 100
  //         = poolDailyFees * concentration_factor / totalPoolTvlUsd * 100

  if (totalPoolTvlUsd === 0 || positionTvlUsd === 0) {
    return { daily: 0, weekly: 0, monthly: 0, annual: 0 };
  }

  const dailyFeeYieldPct =
    (poolDailyFees * concentrationFactor) / totalPoolTvlUsd * 100;

  return {
    daily: round4(dailyFeeYieldPct),
    weekly: round4(dailyFeeYieldPct * 7),
    monthly: round4(dailyFeeYieldPct * 30),
    annual: round4(dailyFeeYieldPct * 365),
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// Concentration factor calculation
// ---------------------------------------------------------------------------
function calcConcentrationFactor(
  bins: BinData[],
  lowBin: number,
  highBin: number
): { factor: number; activeLiquidityUsd: number; totalLiquidityUsd: number } {
  let totalLiq = 0;
  let rangeLiq = 0;

  for (const bin of bins) {
    const id = getBinId(bin);
    const liq = getBinLiquidity(bin);
    totalLiq += liq;
    if (id >= lowBin && id <= highBin) {
      rangeLiq += liq;
    }
  }

  const factor = totalLiq > 0 ? rangeLiq / totalLiq : 0;
  return {
    factor: round4(factor),
    activeLiquidityUsd: rangeLiq,
    totalLiquidityUsd: totalLiq,
  };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

// doctor — verify API connectivity
async function cmdDoctor(): Promise<void> {
  const checks: Array<{ check: string; status: "ok" | "error"; detail: string }> = [];

  // Check 1: App pools
  try {
    const pools = await fetchAppPools();
    const dlmmPools = pools.filter(
      (p) => p.pool_id?.startsWith("dlmm") || p.pool_id?.includes("hodlmm")
    );
    checks.push({
      check: "bitflow_app_pools",
      status: "ok",
      detail: `${pools.length} pools total, ${dlmmPools.length} DLMM pools`,
    });
  } catch (e) {
    checks.push({ check: "bitflow_app_pools", status: "error", detail: String(e) });
  }

  // Check 2: Quotes pools
  try {
    const qPools = await fetchQuotesPools();
    const active = qPools.filter((p) => getActiveBinId(p) > 0);
    checks.push({
      check: "bitflow_quotes_pools",
      status: "ok",
      detail: `${qPools.length} pools, ${active.length} with active bins`,
    });
  } catch (e) {
    checks.push({ check: "bitflow_quotes_pools", status: "error", detail: String(e) });
  }

  // Check 3: Bins API for dlmm_1
  try {
    const bins = await fetchBins("dlmm_1");
    const withLiq = bins.filter((b) => getBinLiquidity(b) > 0);
    checks.push({
      check: "bitflow_bins_api",
      status: "ok",
      detail: `${bins.length} bins total, ${withLiq.length} with liquidity`,
    });
  } catch (e) {
    checks.push({ check: "bitflow_bins_api", status: "error", detail: String(e) });
  }

  const allOk = checks.every((c) => c.status === "ok");
  console.log(
    JSON.stringify({
      status: allOk ? "ready" : "degraded",
      checks,
      message: allOk
        ? "All data sources reachable. Ready to estimate yields."
        : "Some data sources unavailable — projections may be incomplete.",
    })
  );
}

// estimate — project yield for a pool/range
async function cmdEstimate(opts: {
  poolId: string;
  binRange: string;
  positionSize: number;
}): Promise<void> {
  const { poolId, binRange, positionSize } = opts;

  let appPool: AppPool | undefined;
  let qPool: QuotesPool | undefined;

  try {
    const [appPools, qPools] = await Promise.all([fetchAppPools(), fetchQuotesPools()]);

    appPool = appPools.find((p) => p.pool_id === poolId);
    qPool = qPools.find((p) => p.pool_id === poolId);

    if (!appPool || !qPool) {
      const available = appPools.map((p) => p.pool_id).join(", ");
      output({ error: `Pool ${poolId} not found. Available pools: ${available}` });
      process.exit(1);
    }
  } catch (e) {
    output({ error: `Failed to fetch pool list: ${String(e)}` });
    process.exit(1);
  }

  const activeBinId = getActiveBinId(qPool);
  const binStep = getBinStep(qPool);
  const feeBps = getFeeBps(appPool, qPool);
  const volume24h = getVolume24h(appPool);
  const tvlUsd = getTvl(appPool);
  const poolName = getPoolName(appPool);

  // Resolve bin range
  let lowBin: number;
  let highBin: number;

  if (binRange === "active" || binRange === "") {
    // Default: active bin ± 5 (11-bin range, reasonable default)
    lowBin = Math.max(0, activeBinId - 5);
    highBin = activeBinId + 5;
  } else if (binRange.includes("-")) {
    const parts = binRange.split("-");
    if (parts.length !== 2 || isNaN(Number(parts[0])) || isNaN(Number(parts[1]))) {
      output({ error: `Invalid bin range format. Use "low-high" or "active". Got: ${binRange}` });
      process.exit(1);
    }
    lowBin = parseInt(parts[0]);
    highBin = parseInt(parts[1]);
  } else {
    output({ error: `Invalid --bin-range. Use "active" or "low-high" (e.g. "500-510").` });
    process.exit(1);
  }

  if (lowBin > highBin) {
    output({ error: `Bin range low (${lowBin}) must be <= high (${highBin}).` });
    process.exit(1);
  }

  // Fetch bin liquidity data
  let bins: BinData[] = [];
  try {
    bins = await fetchBins(poolId);
  } catch (e) {
    // Non-fatal — fall back to TVL-based concentration estimate
    bins = [];
  }

  const warnings: string[] = [];

  // Concentration factor
  let concentrationFactor: number;
  let activeLiqUsd: number;
  let totalLiqUsd: number;

  if (bins.length > 0) {
    const cf = calcConcentrationFactor(bins, lowBin, highBin);
    concentrationFactor = cf.factor;
    activeLiqUsd = cf.activeLiquidityUsd;
    totalLiqUsd = cf.totalLiquidityUsd;

    if (concentrationFactor === 0) {
      warnings.push(
        `Bin range ${lowBin}-${highBin} has no current liquidity. ` +
        `If you deploy here alone, you'd earn all fees while in-range — but this is a thin market.`
      );
      // Use 1.0 as concentration factor for "you'd own this bin" scenario
      concentrationFactor = 1.0;
    }
  } else {
    // Fallback: estimate concentration as (binCount / totalBinCount)
    const binCount = highBin - lowBin + 1;
    const totalBins = Math.max(binCount, 100); // rough estimate
    concentrationFactor = Math.min(1, binCount / totalBins);
    activeLiqUsd = tvlUsd * concentrationFactor;
    totalLiqUsd = tvlUsd;
    warnings.push("Bin-level liquidity data unavailable — using TVL-based concentration estimate.");
  }

  // Position size default
  const posSize = positionSize > 0 ? positionSize : Math.min(tvlUsd * 0.01, 1000);

  if (volume24h < 10000) {
    warnings.push(
      `Low 24h volume ($${volume24h.toLocaleString()}). Yield projections are unreliable at low volume.`
    );
  }

  if (volume24h === 0) {
    output({ error: "No 24h volume data available for this pool. Cannot project yield." });
    process.exit(1);
  }

  const proj = projectYield(volume24h, feeBps, concentrationFactor, posSize, tvlUsd);

  const result: ProjectionResult = {
    status: "success",
    pool_id: poolId,
    pool_name: poolName,
    bin_range: {
      low: lowBin,
      high: highBin,
      active_bin: activeBinId,
      bin_count: highBin - lowBin + 1,
    },
    projections: {
      daily_fee_yield_pct: proj.daily,
      weekly_fee_yield_pct: proj.weekly,
      monthly_fee_yield_pct: proj.monthly,
      annualized_fee_yield_pct: proj.annual,
    },
    inputs: {
      volume_24h_usd: volume24h,
      fee_bps: feeBps,
      concentration_factor: concentrationFactor,
      position_tvl_estimate_usd: posSize,
      active_bin_liquidity_usd: round4(activeLiqUsd),
      total_pool_liquidity_usd: round4(totalLiqUsd),
    },
    warnings,
    disclaimer: DISCLAIMER,
  };

  output(result);
}

// compare — rank pools by projected yield
async function cmdCompare(opts: { pools: string }): Promise<void> {
  let appPools: AppPool[];
  let qPools: QuotesPool[];

  try {
    [appPools, qPools] = await Promise.all([fetchAppPools(), fetchQuotesPools()]);
  } catch (e) {
    output({ error: `Failed to fetch pool data: ${String(e)}` });
    process.exit(1);
  }

  // Filter to requested pools (or all DLMM pools)
  let filterIds: string[] | null = null;
  if (opts.pools && opts.pools.trim() !== "") {
    filterIds = opts.pools.split(",").map((s) => s.trim());
  }

  const dlmmAppPools = appPools.filter((p) => {
    if (filterIds) return filterIds.includes(p.pool_id);
    return p.pool_id?.startsWith("dlmm") || p.pool_id?.includes("hodlmm");
  });

  if (dlmmAppPools.length === 0) {
    output({ error: "No DLMM pools found matching the requested filter." });
    process.exit(1);
  }

  type RankedPool = {
    pool_id: string;
    pool_name: string;
    annualized_yield_pct: number;
    daily_yield_pct: number;
    volume_24h_usd: number;
    tvl_usd: number;
    fee_bps: number;
    active_bin: number;
    concentration_factor: number;
    warnings: string[];
  };

  const ranked: RankedPool[] = [];

  for (const ap of dlmmAppPools) {
    const qp = qPools.find((q) => q.pool_id === ap.pool_id);
    const activeBin = qp ? getActiveBinId(qp) : 0;
    const feeBps = qp ? getFeeBps(ap, qp) : (ap.fee_bps ?? 30) as number;
    const volume24h = getVolume24h(ap);
    const tvlUsd = getTvl(ap);
    const poolWarnings: string[] = [];

    if (volume24h < 10000) {
      poolWarnings.push("Low 24h volume — projection unreliable");
    }

    // Fetch bins for concentration factor (best effort)
    let concentrationFactor = 0.5; // default assumption
    try {
      const bins = await fetchBins(ap.pool_id);
      if (bins.length > 0 && activeBin > 0) {
        // Use active bin ± 5 as the "default" range for comparison
        const low = Math.max(0, activeBin - 5);
        const high = activeBin + 5;
        const cf = calcConcentrationFactor(bins, low, high);
        concentrationFactor = cf.factor > 0 ? cf.factor : 0.5;
      }
    } catch {
      poolWarnings.push("Bin data unavailable — using estimated concentration factor");
    }

    const proj = projectYield(volume24h, feeBps, concentrationFactor, tvlUsd * 0.01, tvlUsd);

    ranked.push({
      pool_id: ap.pool_id,
      pool_name: getPoolName(ap),
      annualized_yield_pct: proj.annual,
      daily_yield_pct: proj.daily,
      volume_24h_usd: volume24h,
      tvl_usd: tvlUsd,
      fee_bps: feeBps,
      active_bin: activeBin,
      concentration_factor: concentrationFactor,
      warnings: poolWarnings,
    });
  }

  // Sort by annualized yield descending
  ranked.sort((a, b) => b.annualized_yield_pct - a.annualized_yield_pct);

  const top = ranked[0];
  const recommendation =
    ranked.length > 0
      ? `${top.pool_id} (${top.pool_name}) offers the highest projected yield at ${top.annualized_yield_pct.toFixed(2)}% APR (24h basis, active bin ±5 range).`
      : "No pools available for comparison.";

  output({
    status: "success",
    compared_pools: ranked.length,
    ranked,
    recommendation,
    disclaimer: DISCLAIMER,
  });
}

// history — show historical fee generation data
async function cmdHistory(opts: { poolId: string }): Promise<void> {
  const { poolId } = opts;

  let appPools: AppPool[];
  let qPools: QuotesPool[];

  try {
    [appPools, qPools] = await Promise.all([fetchAppPools(), fetchQuotesPools()]);
  } catch (e) {
    output({ error: `Failed to fetch pool data: ${String(e)}` });
    process.exit(1);
  }

  const appPool = appPools.find((p) => p.pool_id === poolId);
  const qPool = qPools.find((p) => p.pool_id === poolId);

  if (!appPool) {
    const available = appPools.map((p) => p.pool_id).join(", ");
    output({ error: `Pool ${poolId} not found. Available pools: ${available}` });
    process.exit(1);
  }

  const feeBps = qPool ? getFeeBps(appPool, qPool) : (appPool.fee_bps ?? 30) as number;
  const volume24h = getVolume24h(appPool);
  const tvlUsd = getTvl(appPool);
  const activeBin = qPool ? getActiveBinId(qPool) : 0;
  const binStep = qPool ? getBinStep(qPool) : 10;
  const apr = (appPool.apr ?? 0) as number;

  // Fetch bin data for depth analysis
  let bins: BinData[] = [];
  let binStats: {
    total_bins: number;
    bins_with_liquidity: number;
    median_bin_liquidity: number;
    top_5_bins_by_liquidity: Array<{ bin_id: number; liquidity: number }>;
  } | null = null;

  try {
    bins = await fetchBins(poolId);
    const withLiq = bins.filter((b) => getBinLiquidity(b) > 0);
    const sorted = withLiq.sort((a, b) => getBinLiquidity(b) - getBinLiquidity(a));
    const mid = Math.floor(withLiq.length / 2);
    const medianLiq = withLiq.length > 0 ? getBinLiquidity(withLiq[mid]) : 0;

    binStats = {
      total_bins: bins.length,
      bins_with_liquidity: withLiq.length,
      median_bin_liquidity: round4(medianLiq),
      top_5_bins_by_liquidity: sorted.slice(0, 5).map((b) => ({
        bin_id: getBinId(b),
        liquidity: round4(getBinLiquidity(b)),
      })),
    };
  } catch {
    // Non-fatal
  }

  // Project yields at different concentration scenarios
  const scenarios = [
    { label: "tight_3_bins", binCount: 3, description: "Active bin ±1 (highest concentration, highest IL risk)" },
    { label: "medium_11_bins", binCount: 11, description: "Active bin ±5 (balanced range)" },
    { label: "wide_21_bins", binCount: 21, description: "Active bin ±10 (wider, lower IL risk)" },
    { label: "full_pool_100_bins", binCount: 100, description: "Full range (lowest concentration, similar to standard AMM)" },
  ].map((s) => {
    const totalBins = Math.max(bins.length || 100, 100);
    const concentrationFactor = Math.min(1, s.binCount / totalBins);
    const proj = projectYield(volume24h, feeBps, concentrationFactor, tvlUsd * 0.01, tvlUsd);
    return {
      ...s,
      concentration_factor: round4(concentrationFactor),
      annualized_yield_pct: proj.annual,
      daily_yield_pct: proj.daily,
    };
  });

  output({
    status: "success",
    pool_id: poolId,
    pool_name: getPoolName(appPool),
    snapshot: {
      volume_24h_usd: volume24h,
      tvl_usd: tvlUsd,
      fee_bps: feeBps,
      reported_apr_pct: apr,
      active_bin: activeBin,
      bin_step: binStep,
      as_of: new Date().toISOString(),
    },
    bin_distribution: binStats,
    yield_scenarios: scenarios,
    interpretation: [
      `Fee rate: ${feeBps} bps (${(feeBps / 100).toFixed(2)}% per swap)`,
      `Daily fee pool income: $${round4(volume24h * feeBps / 10000).toLocaleString()} at current volume`,
      `Reported APR (from Bitflow): ${apr}%`,
      `IL risk note: tighter ranges (tight_3_bins) can earn 10-30x more fees per $ deployed when in-range, but drift out-of-range faster on volatile pairs`,
    ],
    disclaimer: DISCLAIMER,
  });
}

// ---------------------------------------------------------------------------
// Output helper
// ---------------------------------------------------------------------------
function output(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const program = new Command();

program
  .name("hodlmm-yield-projector")
  .description(
    "Forward-looking fee yield estimator for Bitflow HODLMM concentrated liquidity positions."
  )
  .version("1.0.0");

program
  .command("doctor")
  .description("Check Bitflow API connectivity and data availability")
  .action(async () => {
    try {
      await cmdDoctor();
    } catch (e) {
      output({ error: String(e) });
      process.exit(1);
    }
  });

program
  .command("estimate")
  .description('Project fee yield for a pool and bin range')
  .requiredOption("--pool-id <id>", "Pool ID (e.g. dlmm_1)")
  .option(
    "--bin-range <range>",
    'Bin range as "low-high" or "active" for current active bin',
    "active"
  )
  .option(
    "--position-size <usd>",
    "Hypothetical position size in USD (default: 1% of pool TVL)",
    "0"
  )
  .action(async (opts) => {
    try {
      await cmdEstimate({
        poolId: opts.poolId,
        binRange: opts.binRange,
        positionSize: parseFloat(opts.positionSize) || 0,
      });
    } catch (e) {
      output({ error: String(e) });
      process.exit(1);
    }
  });

program
  .command("compare")
  .description("Compare projected yields across multiple pools")
  .option("--pools <ids>", "Comma-separated pool IDs (default: all DLMM pools)", "")
  .action(async (opts) => {
    try {
      await cmdCompare({ pools: opts.pools });
    } catch (e) {
      output({ error: String(e) });
      process.exit(1);
    }
  });

program
  .command("history")
  .description("Show historical fee data and yield scenarios for a pool")
  .requiredOption("--pool-id <id>", "Pool ID (e.g. dlmm_1)")
  .action(async (opts) => {
    try {
      await cmdHistory({ poolId: opts.poolId });
    } catch (e) {
      output({ error: String(e) });
      process.exit(1);
    }
  });

program.parse(process.argv);
