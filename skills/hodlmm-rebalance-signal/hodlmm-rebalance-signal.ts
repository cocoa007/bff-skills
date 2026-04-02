#!/usr/bin/env bun
/**
 * hodlmm-rebalance-signal — Concentrated LP position drift monitor for Bitflow HODLMM pools.
 *
 * Analyzes how far the active bin has moved relative to an LP's position range and
 * emits a three-level rebalance signal:
 *
 *   HOLD      — active bin is within the position range, not near boundary — earning fees
 *   MONITOR   — active bin is within 2 bins of range boundary — drift risk rising
 *   REBALANCE — active bin is outside position range — earning zero fees
 *
 * Also estimates the fee opportunity cost of being out of range (daily USD).
 *
 * Read-only. No wallet required. Mainnet only.
 *
 * Part of the HODLMM LP pipeline:
 *   hodlmm-safety-check    → entry gate
 *   hodlmm-bin-analyzer    → entry data
 *   hodlmm-yield-projector → entry projection
 *   hodlmm-rebalance-signal → position monitor  ← this skill
 *
 * Usage:
 *   bun run skills/hodlmm-rebalance-signal/hodlmm-rebalance-signal.ts doctor
 *   bun run skills/hodlmm-rebalance-signal/hodlmm-rebalance-signal.ts check --pool-id dlmm_1 --position-low 500 --position-high 510
 *   bun run skills/hodlmm-rebalance-signal/hodlmm-rebalance-signal.ts scan
 *   bun run skills/hodlmm-rebalance-signal/hodlmm-rebalance-signal.ts scan --pools dlmm_1,dlmm_2
 *
 * DISCLAIMER: Informational only. Not financial advice. Rebalancing incurs
 * transaction costs and impermanent loss risk. All signals are for
 * decision-support — final rebalance decisions require human or operator approval.
 */

import { Command } from "commander";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BITFLOW_APP_API = "https://bff.bitflowapis.finance/api/app/v1";
const BITFLOW_QUOTES_API = "https://bff.bitflowapis.finance/api/quotes/v1";
const FETCH_TIMEOUT_MS = 30_000;
const NETWORK = "mainnet";

/**
 * Number of bins from the position boundary at which the signal escalates from
 * HOLD to MONITOR. If the active bin is within MONITOR_THRESHOLD bins of either
 * edge, the signal is MONITOR.
 */
const MONITOR_THRESHOLD = 2;

const DISCLAIMER =
  "Informational only. Not financial advice. Rebalancing incurs transaction costs and IL risk.";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Signal = "HOLD" | "MONITOR" | "REBALANCE";
type DriftDirection = "above" | "below" | "centered" | "at-edge";

interface AppPoolToken {
  contract: string;
  displayName: string;
  symbol: string;
  decimals: number;
  priceUsd: number;
}

interface AppPool {
  poolId: string;
  poolContract: string;
  poolStatus: boolean;
  tokens: {
    tokenX: AppPoolToken;
    tokenY: AppPoolToken;
  };
  tvlUsd: number;
  apr: number;
  apr24h: number;
  volume24h?: number;
  binStep: string;
  baseFee: number;
  dynamicFee: number;
  xProtocolFee: string;
  xProviderFee: string;
  xVariableFee: string;
  yProtocolFee: string;
  yProviderFee: string;
  yVariableFee: string;
  types: string[];
}

interface AppPoolsResponse {
  data: AppPool[];
  nextCursor?: string;
  hasMore?: boolean;
}

interface QuotesPool {
  pool_id: string;
  pool_name: string;
  pool_symbol: string;
  pool_token: string;
  token_x: string;
  token_y: string;
  bin_step: number;
  active_bin: number;
  active: boolean;
  x_protocol_fee: number;
  x_provider_fee: number;
  x_variable_fee: number;
  y_protocol_fee: number;
  y_provider_fee: number;
  y_variable_fee: number;
  x_total_fee_bps: string;
  y_total_fee_bps: string;
  variable_fees_manager: string;
  fee_address: string;
  variable_fees_cooldown: string;
  freeze_variable_fees_manager: string;
  creation_height: string;
}

interface QuotesPoolsResponse {
  pools: QuotesPool[];
}

interface BinData {
  pool_id: string;
  bin_id: number;
  reserve_x: string;
  reserve_y: string;
  price: string;
  liquidity: string;
}

interface BinsResponse {
  success: boolean;
  pool_id: string;
  bins: BinData[];
}

interface DriftResult {
  binsFromCenter: number;
  binsFromNearestEdge: number;
  direction: DriftDirection;
  inRangeBins: number;
  totalPositionBins: number;
  inRangeRatioPct: number;
}

interface FeeOpportunityCost {
  estimatedDailyFeeUsd: number;
  missedFeesDailyUsd: number;
  note: string;
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function out(data: Record<string, unknown>): void {
  console.log(JSON.stringify(data, null, 2));
}

function fail(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  out({ status: "error", error: message });
  process.exit(1);
}

function success(data: Record<string, unknown>): void {
  out({
    status: "success",
    network: NETWORK,
    timestamp: new Date().toISOString(),
    ...data,
  });
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${url}`);
  }
  return res.json() as Promise<T>;
}

async function getAllAppPools(): Promise<AppPool[]> {
  const resp = await fetchJson<AppPoolsResponse>(`${BITFLOW_APP_API}/pools`);
  return (resp.data ?? []).filter((p) => p.types?.includes("DLMM"));
}

async function getAppPool(poolId: string): Promise<AppPool> {
  const all = await getAllAppPools();
  const found = all.find((p) => p.poolId === poolId);
  if (!found) throw new Error(`Pool ${poolId} not found in app API`);
  return found;
}

async function getAllQuotesPools(): Promise<QuotesPool[]> {
  const resp = await fetchJson<QuotesPoolsResponse>(
    `${BITFLOW_QUOTES_API}/pools`
  );
  return (resp.pools ?? []).filter((p) => p.pool_id.startsWith("dlmm"));
}

async function getQuotesPool(poolId: string): Promise<QuotesPool> {
  const all = await getAllQuotesPools();
  const found = all.find((p) => p.pool_id === poolId);
  if (!found) throw new Error(`Pool ${poolId} not found in quotes API`);
  return found;
}

async function getPoolBins(poolId: string): Promise<BinData[]> {
  const resp = await fetchJson<BinsResponse>(
    `${BITFLOW_QUOTES_API}/bins/${poolId}`
  );
  if (!resp.success) throw new Error(`Bins API returned failure for ${poolId}`);
  return resp.bins ?? [];
}

// ---------------------------------------------------------------------------
// Core logic helpers
// ---------------------------------------------------------------------------

/** Find the active bin — prefer the mixed bin (both x and y reserves), fall back to quotes API value. */
function findActiveBin(bins: BinData[], quotesActiveBin: number): number {
  const mixed = bins.find(
    (b) => Number(b.reserve_x) > 0 && Number(b.reserve_y) > 0
  );
  return mixed?.bin_id ?? quotesActiveBin;
}

/**
 * Compute drift metrics for a position given the current active bin.
 *
 * @param activeBin  Current active bin from the pool
 * @param posLow     Lowest bin in the user's LP position
 * @param posHigh    Highest bin in the user's LP position
 */
function computeDrift(
  activeBin: number,
  posLow: number,
  posHigh: number
): DriftResult {
  const posCenter = (posLow + posHigh) / 2;
  const totalPositionBins = posHigh - posLow + 1;

  // How many bins from center (can be negative — negative means below center)
  const binsFromCenter = round(activeBin - posCenter, 1);

  // How many bins from the nearest position edge (positive = outside, 0 = at edge, negative = inside)
  let binsFromNearestEdge: number;
  if (activeBin < posLow) {
    binsFromNearestEdge = activeBin - posLow; // negative: below the low edge
  } else if (activeBin > posHigh) {
    binsFromNearestEdge = activeBin - posHigh; // positive: above the high edge
  } else {
    // Inside the range — distance to nearest edge (positive value)
    binsFromNearestEdge = Math.min(activeBin - posLow, posHigh - activeBin);
  }

  // Direction of drift
  let direction: DriftDirection;
  if (activeBin > posHigh) {
    direction = "above";
  } else if (activeBin < posLow) {
    direction = "below";
  } else if (activeBin === posLow || activeBin === posHigh) {
    direction = "at-edge";
  } else {
    direction = "centered";
  }

  // In-range: the active bin must be within the position range to earn fees
  const inRange = activeBin >= posLow && activeBin <= posHigh;
  const inRangeBins = inRange ? 1 : 0; // 1 active bin is what generates fee income

  // In-range ratio: fraction of position that overlaps with the earning range
  // For concentrated LP, only the active bin earns fees. A wider position still
  // earns nothing if the active bin is outside the range.
  const inRangeRatioPct = inRange
    ? round((1 / totalPositionBins) * 100, 2)
    : 0;

  return {
    binsFromCenter: Math.abs(binsFromCenter),
    binsFromNearestEdge,
    direction,
    inRangeBins,
    totalPositionBins,
    inRangeRatioPct,
  };
}

/**
 * Determine the rebalance signal from drift metrics.
 */
function computeSignal(
  activeBin: number,
  posLow: number,
  posHigh: number,
  drift: DriftResult
): { signal: Signal; signalReason: string } {
  // Out of range — REBALANCE
  if (activeBin < posLow) {
    const binsBelow = posLow - activeBin;
    return {
      signal: "REBALANCE",
      signalReason: `Active bin ${activeBin} is ${binsBelow} bin${binsBelow !== 1 ? "s" : ""} below the position range (${posLow}-${posHigh}). Position is earning zero fees.`,
    };
  }
  if (activeBin > posHigh) {
    const binsAbove = activeBin - posHigh;
    return {
      signal: "REBALANCE",
      signalReason: `Active bin ${activeBin} is ${binsAbove} bin${binsAbove !== 1 ? "s" : ""} above the position range (${posLow}-${posHigh}). Position is earning zero fees.`,
    };
  }

  // Within range but near boundary — MONITOR
  const distToLow = activeBin - posLow;
  const distToHigh = posHigh - activeBin;
  const nearestEdgeDist = Math.min(distToLow, distToHigh);

  if (nearestEdgeDist <= MONITOR_THRESHOLD) {
    const edgeSide = distToLow < distToHigh ? "lower" : "upper";
    return {
      signal: "MONITOR",
      signalReason: `Active bin ${activeBin} is within ${nearestEdgeDist} bin${nearestEdgeDist !== 1 ? "s" : ""} of the ${edgeSide} boundary of the position range (${posLow}-${posHigh}). Drift risk is rising — monitor closely.`,
    };
  }

  // Comfortably in range — HOLD
  return {
    signal: "HOLD",
    signalReason: `Active bin ${activeBin} is within the position range (${posLow}-${posHigh}), ${nearestEdgeDist} bins from the nearest boundary. Position is earning fees normally.`,
  };
}

/**
 * Estimate the daily fee opportunity cost based on pool volume and fee rate.
 *
 * @param appPool        Pool data with volume/APR
 * @param quotesPool     Pool data with fee bps
 * @param inRangeRatio   Fraction of position currently earning (0-1)
 */
function computeFeeOpportunityCost(
  appPool: AppPool,
  quotesPool: QuotesPool,
  inRangeRatio: number
): FeeOpportunityCost {
  // Use APR to back-calculate implied daily fee yield
  // dailyFeeYieldPct = apr24h / 365
  const dailyFeeYieldPct = appPool.apr24h > 0 ? appPool.apr24h / 365 : 0;

  // Estimate fee revenue per $1000 of TVL for a position that is fully in range
  // This is a rough proxy — we use the pool's own APR as the baseline
  const tvl = appPool.tvlUsd > 0 ? appPool.tvlUsd : 1;
  const estimatedDailyFeeUsd = round((dailyFeeYieldPct / 100) * tvl, 4);

  // Missed fees = what the position would earn if in range, scaled by (1 - inRangeRatio)
  // For a fully out-of-range position, this equals estimatedDailyFeeUsd * position share
  // We assume the position is a representative share — the LP sees proportional fees
  const missedFeesDailyUsd = round(
    estimatedDailyFeeUsd * (1 - inRangeRatio),
    4
  );

  return {
    estimatedDailyFeeUsd,
    missedFeesDailyUsd,
    note: "Estimated from pool APR (24h basis) and TVL. Not a guarantee. Actual fees depend on position size, volume, and concentration.",
  };
}

// ---------------------------------------------------------------------------
// Subcommand: doctor
// ---------------------------------------------------------------------------

async function doctor(): Promise<void> {
  const checks: Array<{
    check: string;
    status: "ok" | "fail";
    detail: string;
  }> = [];

  // 1. App pools API
  try {
    const pools = await getAllAppPools();
    checks.push({
      check: "bitflow_app_pools",
      status: "ok",
      detail: `${BITFLOW_APP_API}/pools — ${pools.length} DLMM pools`,
    });
  } catch (e) {
    checks.push({
      check: "bitflow_app_pools",
      status: "fail",
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // 2. Quotes pools API
  try {
    const pools = await getAllQuotesPools();
    checks.push({
      check: "bitflow_quotes_pools",
      status: "ok",
      detail: `${BITFLOW_QUOTES_API}/pools — ${pools.length} DLMM pools`,
    });
  } catch (e) {
    checks.push({
      check: "bitflow_quotes_pools",
      status: "fail",
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // 3. Bins API spot check
  try {
    const bins = await getPoolBins("dlmm_1");
    const withLiquidity = bins.filter((b) => Number(b.liquidity) > 0);
    checks.push({
      check: "bitflow_bins_api",
      status: "ok",
      detail: `${BITFLOW_QUOTES_API}/bins/dlmm_1 — ${bins.length} bins total, ${withLiquidity.length} with liquidity`,
    });
  } catch (e) {
    checks.push({
      check: "bitflow_bins_api",
      status: "fail",
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  const allOk = checks.every((c) => c.status === "ok");
  out({
    status: allOk ? "ready" : "degraded",
    network: NETWORK,
    checks,
    note: "Read-only skill — no wallet required",
  });
  if (!allOk) process.exit(1);
}

// ---------------------------------------------------------------------------
// Subcommand: check
// ---------------------------------------------------------------------------

async function check(opts: {
  poolId: string;
  positionLow: number;
  positionHigh: number;
}): Promise<void> {
  const { poolId, positionLow, positionHigh } = opts;

  // Validate position range
  if (positionLow > positionHigh) {
    throw new Error(
      `--position-low (${positionLow}) must be <= --position-high (${positionHigh})`
    );
  }
  if (positionLow < 0 || positionHigh < 0) {
    throw new Error("Bin IDs must be non-negative integers");
  }

  // Fetch pool data
  const [appPool, quotesPool, allBins] = await Promise.all([
    getAppPool(poolId),
    getQuotesPool(poolId),
    getPoolBins(poolId),
  ]);

  const activeBinId = findActiveBin(allBins, quotesPool.active_bin);
  const positionCenter = (positionLow + positionHigh) / 2;
  const positionWidth = positionHigh - positionLow + 1;

  // Compute drift and signal
  const drift = computeDrift(activeBinId, positionLow, positionHigh);
  const { signal, signalReason } = computeSignal(
    activeBinId,
    positionLow,
    positionHigh,
    drift
  );

  // Fee opportunity cost
  const inRangeRatio = drift.inRangeRatioPct / 100;
  const feeOpportunityCost = computeFeeOpportunityCost(
    appPool,
    quotesPool,
    inRangeRatio
  );

  success({
    poolId,
    pair: `${appPool.tokens.tokenX.symbol}/${appPool.tokens.tokenY.symbol}`,
    activeBinId,
    binStep: Number(appPool.binStep),
    position: {
      low: positionLow,
      high: positionHigh,
      center: round(positionCenter, 1),
      width: positionWidth,
    },
    drift,
    signal,
    signalReason,
    feeOpportunityCost,
    disclaimer: DISCLAIMER,
  });
}

// ---------------------------------------------------------------------------
// Subcommand: scan
// ---------------------------------------------------------------------------

async function scan(opts: { pools?: string }): Promise<void> {
  // Fetch all pool data
  const [allAppPools, allQuotesPools] = await Promise.all([
    getAllAppPools(),
    getAllQuotesPools(),
  ]);

  // Filter to requested pools if specified
  let targetPoolIds: string[];
  if (opts.pools) {
    targetPoolIds = opts.pools.split(",").map((s) => s.trim());
    // Validate all requested pools exist
    const quotesIds = new Set(allQuotesPools.map((p) => p.pool_id));
    const missing = targetPoolIds.filter((id) => !quotesIds.has(id));
    if (missing.length > 0) {
      throw new Error(
        `Unknown pool IDs: ${missing.join(", ")}. Use doctor to confirm available pools.`
      );
    }
  } else {
    targetPoolIds = allQuotesPools.map((p) => p.pool_id);
  }

  const quotesMap = new Map<string, QuotesPool>(
    allQuotesPools.map((p) => [p.pool_id, p])
  );
  const appMap = new Map<string, AppPool>(
    allAppPools.map((p) => [p.poolId, p])
  );

  // Build scan results — one entry per pool
  const poolResults = await Promise.all(
    targetPoolIds.map(async (poolId) => {
      const quotesPool = quotesMap.get(poolId);
      const appPool = appMap.get(poolId);

      if (!quotesPool) {
        return { poolId, error: "Not found in quotes API" };
      }

      try {
        const allBins = await getPoolBins(poolId);
        const activeBinId = findActiveBin(allBins, quotesPool.active_bin);
        const binsWithLiquidity = allBins.filter(
          (b) => Number(b.liquidity) > 0
        );

        return {
          poolId,
          pair: appPool
            ? `${appPool.tokens.tokenX.symbol}/${appPool.tokens.tokenY.symbol}`
            : quotesPool.pool_symbol,
          activeBinId,
          binStep: quotesPool.bin_step,
          tvlUsd: appPool?.tvlUsd ?? null,
          apr24h: appPool?.apr24h ?? null,
          totalBinsWithLiquidity: binsWithLiquidity.length,
          note: "Active bin data available. Use `check` with your position range for a precise signal.",
        };
      } catch (e) {
        return {
          poolId,
          pair: appPool
            ? `${appPool.tokens.tokenX.symbol}/${appPool.tokens.tokenY.symbol}`
            : quotesPool.pool_symbol,
          activeBinId: quotesPool.active_bin,
          binStep: quotesPool.bin_step,
          tvlUsd: appPool?.tvlUsd ?? null,
          apr24h: appPool?.apr24h ?? null,
          error: e instanceof Error ? e.message : String(e),
          note: "Bins API unavailable — active bin from quotes API (may be stale).",
        };
      }
    })
  );

  success({
    poolCount: poolResults.length,
    pools: poolResults,
    usage: "Run `check --pool-id <id> --position-low <bin> --position-high <bin>` to get a HOLD/MONITOR/REBALANCE signal for your position.",
  });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name("hodlmm-rebalance-signal")
  .description(
    "Concentrated LP position drift monitor for Bitflow HODLMM pools. " +
      "Signals HOLD, MONITOR, or REBALANCE based on active bin drift relative to your position range. " +
      "Read-only. No wallet required. Mainnet only."
  )
  .version("1.0.0");

program
  .command("doctor")
  .description("Verify all Bitflow API endpoints are reachable")
  .action(async () => {
    try {
      await doctor();
    } catch (e) {
      fail(e);
    }
  });

program
  .command("check")
  .description(
    "Analyze an LP position and emit a HOLD / MONITOR / REBALANCE signal based on active bin drift"
  )
  .requiredOption("--pool-id <id>", "Pool identifier (e.g. dlmm_1)")
  .requiredOption(
    "--position-low <bin>",
    "Lowest bin ID of your LP position",
    (v) => parseInt(v, 10)
  )
  .requiredOption(
    "--position-high <bin>",
    "Highest bin ID of your LP position",
    (v) => parseInt(v, 10)
  )
  .action(
    async (opts: { poolId: string; positionLow: number; positionHigh: number }) => {
      try {
        await check(opts);
      } catch (e) {
        fail(e);
      }
    }
  );

program
  .command("scan")
  .description(
    "Scan HODLMM pools and report active bin positions for drift context"
  )
  .option(
    "--pools <ids>",
    "Comma-separated pool IDs to scan (default: all DLMM pools)"
  )
  .action(async (opts: { pools?: string }) => {
    try {
      await scan(opts);
    } catch (e) {
      fail(e);
    }
  });

program.parse(process.argv);
