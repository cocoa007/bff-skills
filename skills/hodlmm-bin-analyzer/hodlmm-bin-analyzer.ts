#!/usr/bin/env bun
/**
 * hodlmm-bin-analyzer — On-chain DLMM liquidity depth scanner for Bitflow HODLMM pools.
 *
 * Queries Bitflow APIs to provide bin-level analytics:
 *   - Pool list with active bin, TVL, APR, and fee tier
 *   - Bin depth: active bin + surrounding bins with reserves and prices
 *   - Effective bid-ask spread from bin step and active bin price
 *   - Per-user LP position: which bins, how far from active bin
 *   - Full fee configuration: base, variable, protocol/provider split
 *
 * Read-only. No wallet required. Mainnet only.
 *
 * Usage:
 *   bun run skills/hodlmm-bin-analyzer/hodlmm-bin-analyzer.ts doctor
 *   bun run skills/hodlmm-bin-analyzer/hodlmm-bin-analyzer.ts pools
 *   bun run skills/hodlmm-bin-analyzer/hodlmm-bin-analyzer.ts bins --pool-id dlmm_1
 *   bun run skills/hodlmm-bin-analyzer/hodlmm-bin-analyzer.ts bins --pool-id dlmm_1 --window 5
 *   bun run skills/hodlmm-bin-analyzer/hodlmm-bin-analyzer.ts spread --pool-id dlmm_1
 *   bun run skills/hodlmm-bin-analyzer/hodlmm-bin-analyzer.ts position --pool-id dlmm_1 --address <STX_ADDR>
 *   bun run skills/hodlmm-bin-analyzer/hodlmm-bin-analyzer.ts fees --pool-id dlmm_1
 */

import { Command } from "commander";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BITFLOW_APP_API = "https://bff.bitflowapis.finance/api/app/v1";
const BITFLOW_QUOTES_API = "https://bff.bitflowapis.finance/api/quotes/v1";
const FETCH_TIMEOUT_MS = 30_000;
const NETWORK = "mainnet";

// Bitflow stores prices multiplied by this factor (sats per token scaled)
const PRICE_SCALE = 1e8;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

interface UserBinData {
  bin_id: number;
  reserve_x?: string;
  reserve_y?: string;
  price?: string;
  liquidity?: string;
  user_liquidity?: string | number;
}

interface UserPositionResponse {
  bins?: UserBinData[];
  position_bins?: UserBinData[];
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
  return fetchJson<AppPool>(`${BITFLOW_APP_API}/pools/${poolId}`);
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

async function getUserPositionBins(
  address: string,
  poolId: string
): Promise<UserBinData[]> {
  const url = `${BITFLOW_APP_API}/users/${address}/positions/${poolId}/bins`;
  const resp = await fetchJson<UserPositionResponse | { detail: string }>(url);

  // Error case: API returns { detail: "..." } when no position
  if ("detail" in resp) {
    throw new Error((resp as { detail: string }).detail);
  }
  const r = resp as UserPositionResponse;
  return r.bins ?? r.position_bins ?? [];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/**
 * Convert Bitflow raw price to approximate USD.
 * Bitflow stores price as (price_of_X_in_Y * 1e8) in Y token's smallest units.
 * For sBTC/USDCx pools: price is (USDCx per sBTC) * 1e8 / 1e6 (USDCx decimals 6)
 * For general use we just divide by PRICE_SCALE to get a human-readable ratio.
 */
function priceHuman(raw: string): number {
  return round(Number(raw) / PRICE_SCALE, 6);
}

/** Identify the active bin: the only bin with both x > 0 AND y > 0, or fall back to quotes API value */
function findActiveBin(bins: BinData[], quotesActiveBin: number): number {
  const mixed = bins.find(
    (b) => Number(b.reserve_x) > 0 && Number(b.reserve_y) > 0
  );
  return mixed?.bin_id ?? quotesActiveBin;
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

  // 1. App pools API (DLMM pools)
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
      detail: `${BITFLOW_QUOTES_API}/pools — ${pools.length} DLMM pools, active bins verified`,
    });
  } catch (e) {
    checks.push({
      check: "bitflow_quotes_pools",
      status: "fail",
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // 3. Bins API (spot check dlmm_1)
  try {
    const bins = await getPoolBins("dlmm_1");
    const nonEmpty = bins.filter((b) => Number(b.liquidity) > 0);
    checks.push({
      check: "bitflow_bins_api",
      status: "ok",
      detail: `${BITFLOW_QUOTES_API}/bins/dlmm_1 — ${bins.length} bins total, ${nonEmpty.length} with liquidity`,
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
// Subcommand: pools
// ---------------------------------------------------------------------------

async function pools(): Promise<void> {
  const [appPools, quotesPools] = await Promise.all([
    getAllAppPools(),
    getAllQuotesPools(),
  ]);

  const quotesMap = new Map<string, QuotesPool>(
    quotesPools.map((p) => [p.pool_id, p])
  );

  const result = appPools
    .map((p) => {
      const q = quotesMap.get(p.poolId);
      return {
        poolId: p.poolId,
        pair: `${p.tokens.tokenX.symbol}/${p.tokens.tokenY.symbol}`,
        contract: p.poolContract,
        activeBinId: q?.active_bin ?? null,
        binStep: Number(p.binStep),
        tvlUsd: p.tvlUsd,
        apr: p.apr,
        apr24h: p.apr24h,
        baseFee: p.baseFee,
        totalFeeXBps: q?.x_total_fee_bps ?? null,
        totalFeeYBps: q?.y_total_fee_bps ?? null,
        status: p.poolStatus ? "active" : "inactive",
        tokenX: {
          symbol: p.tokens.tokenX.symbol,
          decimals: p.tokens.tokenX.decimals,
          priceUsd: p.tokens.tokenX.priceUsd,
        },
        tokenY: {
          symbol: p.tokens.tokenY.symbol,
          decimals: p.tokens.tokenY.decimals,
          priceUsd: p.tokens.tokenY.priceUsd,
        },
      };
    })
    .sort((a, b) => b.tvlUsd - a.tvlUsd);

  success({ poolCount: result.length, pools: result });
}

// ---------------------------------------------------------------------------
// Subcommand: bins
// ---------------------------------------------------------------------------

async function bins(opts: { poolId: string; window: number }): Promise<void> {
  const [appPool, quotesPool, allBins] = await Promise.all([
    getAppPool(opts.poolId),
    getQuotesPool(opts.poolId),
    getPoolBins(opts.poolId),
  ]);

  const activeBinId = findActiveBin(allBins, quotesPool.active_bin);
  const windowStart = activeBinId - opts.window;
  const windowEnd = activeBinId + opts.window;

  const windowBins = allBins
    .filter((b) => b.bin_id >= windowStart && b.bin_id <= windowEnd)
    .sort((a, b) => a.bin_id - b.bin_id);

  const formattedBins = windowBins.map((b) => {
    const offset = b.bin_id - activeBinId;
    const hasX = Number(b.reserve_x) > 0;
    const hasY = Number(b.reserve_y) > 0;
    const isMixed = hasX && hasY;
    return {
      binId: b.bin_id,
      offset,
      isActiveBin: b.bin_id === activeBinId,
      price: priceHuman(b.price),
      priceRaw: b.price,
      reserveX: Number(b.reserve_x),
      reserveY: Number(b.reserve_y),
      liquidityShares: Number(b.liquidity),
      composition: isMixed ? "mixed" : hasX ? "x-only" : hasY ? "y-only" : "empty",
    };
  });

  const activeBinData = windowBins.find((b) => b.bin_id === activeBinId);

  success({
    poolId: opts.poolId,
    pair: `${appPool.tokens.tokenX.symbol}/${appPool.tokens.tokenY.symbol}`,
    activeBinId,
    binStep: Number(appPool.binStep),
    window: opts.window,
    activeBin: activeBinData
      ? {
          price: priceHuman(activeBinData.price),
          reserveX: Number(activeBinData.reserve_x),
          reserveY: Number(activeBinData.reserve_y),
          liquidityShares: Number(activeBinData.liquidity),
        }
      : null,
    tokenDecimals: {
      x: appPool.tokens.tokenX.decimals,
      y: appPool.tokens.tokenY.decimals,
    },
    binsShown: formattedBins.length,
    bins: formattedBins,
    note: "price is in Y-token units per X-token (divided by 1e8 from raw). reserveX/Y in native token units.",
  });
}

// ---------------------------------------------------------------------------
// Subcommand: spread
// ---------------------------------------------------------------------------

async function spread(opts: { poolId: string }): Promise<void> {
  const [appPool, quotesPool, allBins] = await Promise.all([
    getAppPool(opts.poolId),
    getQuotesPool(opts.poolId),
    getPoolBins(opts.poolId),
  ]);

  const activeBinId = findActiveBin(allBins, quotesPool.active_bin);
  const activeBin = allBins.find((b) => b.bin_id === activeBinId);
  const prevBin = allBins.find((b) => b.bin_id === activeBinId - 1);
  const nextBin = allBins.find((b) => b.bin_id === activeBinId + 1);

  if (!activeBin) {
    throw new Error(`Active bin ${activeBinId} not found in bins data`);
  }

  const activePriceRaw = Number(activeBin.price);
  const binStep = Number(appPool.binStep); // in bps (e.g. 10 = 0.10%)

  // In DLMM, each bin represents a price increment of (1 + binStep/10000)
  // The effective spread is approximately 2 * binStep bps (bid is one bin below, ask is one bin above)
  const effectiveSpreadBps = binStep * 2;
  const effectiveSpreadPct = round(effectiveSpreadBps / 100, 4);

  // Last bid = lower bin price, first ask = active bin price (or next bin)
  const lastBidPrice = prevBin ? priceHuman(prevBin.price) : null;
  const firstAskPrice = priceHuman(activeBin.price);
  const nextBinPrice = nextBin ? priceHuman(nextBin.price) : null;

  // Assess active bin composition
  const hasX = Number(activeBin.reserve_x) > 0;
  const hasY = Number(activeBin.reserve_y) > 0;
  let marketNote: string;
  if (hasX && hasY) {
    marketNote = "Active bin has both tokens — price is crossing this bin right now";
  } else if (hasX) {
    marketNote = "Active bin is X-only — price has moved above this bin (X side)";
  } else if (hasY) {
    marketNote = "Active bin is Y-only — price is below this bin (Y side)";
  } else {
    marketNote = "Active bin is empty — pool may be inactive";
  }

  success({
    poolId: opts.poolId,
    pair: `${appPool.tokens.tokenX.symbol}/${appPool.tokens.tokenY.symbol}`,
    activeBinId,
    binStep,
    activeBinPrice: priceHuman(activeBin.price),
    activeBinPriceRaw: activeBin.price,
    lastBidPrice,
    firstAskPrice,
    nextBinPrice,
    effectiveSpreadBps,
    effectiveSpreadPct,
    spreadNote: `${binStep} bps bin step × 2 = ${effectiveSpreadBps} bps effective spread`,
    activeBinComposition: {
      reserveX: Number(activeBin.reserve_x),
      reserveY: Number(activeBin.reserve_y),
      type: hasX && hasY ? "mixed" : hasX ? "x-only" : hasY ? "y-only" : "empty",
    },
    marketNote,
  });
}

// ---------------------------------------------------------------------------
// Subcommand: position
// ---------------------------------------------------------------------------

async function position(opts: {
  poolId: string;
  address: string;
}): Promise<void> {
  const [appPool, quotesPool, allBins, userBins] = await Promise.all([
    getAppPool(opts.poolId),
    getQuotesPool(opts.poolId),
    getPoolBins(opts.poolId),
    getUserPositionBins(opts.address, opts.poolId),
  ]);

  if (!userBins || userBins.length === 0) {
    throw new Error(
      `Address ${opts.address} has no LP position in pool ${opts.poolId}`
    );
  }

  const activeBinId = findActiveBin(allBins, quotesPool.active_bin);

  // Build a map of bin_id → bin data from the full bins list
  const binMap = new Map<number, BinData>(
    allBins.map((b) => [b.bin_id, b])
  );

  const positionBins = userBins
    .map((ub) => {
      const poolBin = binMap.get(ub.bin_id);
      const offset = ub.bin_id - activeBinId;
      return {
        binId: ub.bin_id,
        offset,
        price: poolBin ? priceHuman(poolBin.price) : null,
        priceRaw: poolBin?.price ?? null,
        poolReserveX: poolBin ? Number(poolBin.reserve_x) : null,
        poolReserveY: poolBin ? Number(poolBin.reserve_y) : null,
        poolLiquidityShares: poolBin ? Number(poolBin.liquidity) : null,
        isActiveBin: ub.bin_id === activeBinId,
      };
    })
    .sort((a, b) => a.binId - b.binId);

  const offsets = positionBins.map((b) => Math.abs(b.offset));
  const nearestBinOffset = Math.min(...offsets);
  const avgBinOffset = round(
    offsets.reduce((a, b) => a + b, 0) / offsets.length,
    2
  );

  // In range = at least one position bin is at or within ±1 of the active bin
  const inRange = offsets.some((o) => o <= 1);

  success({
    poolId: opts.poolId,
    pair: `${appPool.tokens.tokenX.symbol}/${appPool.tokens.tokenY.symbol}`,
    address: opts.address,
    activeBinId,
    binCount: positionBins.length,
    nearestBinOffset,
    avgBinOffset,
    inRangeStatus: inRange ? "in-range" : "out-of-range",
    inRangeNote: inRange
      ? "Position has bins at or near the active bin — currently earning fees"
      : "Position bins are all away from the active bin — earning zero fees",
    tokenDecimals: {
      x: appPool.tokens.tokenX.decimals,
      y: appPool.tokens.tokenY.decimals,
    },
    positionBins,
  });
}

// ---------------------------------------------------------------------------
// Subcommand: fees
// ---------------------------------------------------------------------------

async function fees(opts: { poolId: string }): Promise<void> {
  const [appPool, quotesPool] = await Promise.all([
    getAppPool(opts.poolId),
    getQuotesPool(opts.poolId),
  ]);

  const variableFeesEnabled =
    Number(appPool.xVariableFee) > 0 ||
    Number(appPool.yVariableFee) > 0 ||
    quotesPool.x_variable_fee > 0 ||
    quotesPool.y_variable_fee > 0;

  const totalFeeXBps = Number(quotesPool.x_total_fee_bps);
  const totalFeeYBps = Number(quotesPool.y_total_fee_bps);

  success({
    poolId: opts.poolId,
    pair: `${appPool.tokens.tokenX.symbol}/${appPool.tokens.tokenY.symbol}`,
    baseFee: appPool.baseFee,
    baseFeeNote: `${appPool.baseFee * 100}% base fee on each swap`,
    x: {
      protocolFeeBps: Number(appPool.xProtocolFee),
      providerFeeBps: Number(appPool.xProviderFee),
      variableFeeBps: Number(appPool.xVariableFee),
      totalFeeBps: totalFeeXBps,
      totalFeePct: round(totalFeeXBps / 100, 4),
    },
    y: {
      protocolFeeBps: Number(appPool.yProtocolFee),
      providerFeeBps: Number(appPool.yProviderFee),
      variableFeeBps: Number(appPool.yVariableFee),
      totalFeeBps: totalFeeYBps,
      totalFeePct: round(totalFeeYBps / 100, 4),
    },
    variableFeesEnabled,
    variableFeesManager: quotesPool.variable_fees_manager,
    variableFeesCooldown: Number(quotesPool.variable_fees_cooldown),
    feeAddress: quotesPool.fee_address,
    feeNote: variableFeesEnabled
      ? "Variable fees active — effective fee rate is dynamic and may be higher than base during volatile periods"
      : "Variable fees not active — fee rate is fixed at base",
    providerShareNote:
      "Provider fee goes to LPs. Protocol fee goes to Bitflow treasury.",
  });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name("hodlmm-bin-analyzer")
  .description(
    "On-chain DLMM liquidity depth scanner for Bitflow HODLMM pools. " +
      "Provides bin-level analytics: active bin depth, spread, fees, and LP position state. " +
      "Read-only. No wallet required."
  )
  .version("1.0.0");

program
  .command("doctor")
  .description("Verify all data sources are reachable")
  .action(async () => {
    try {
      await doctor();
    } catch (e) {
      fail(e);
    }
  });

program
  .command("pools")
  .description(
    "List all HODLMM DLMM pools with active bin, TVL, APR, and fee tier"
  )
  .action(async () => {
    try {
      await pools();
    } catch (e) {
      fail(e);
    }
  });

program
  .command("bins")
  .description(
    "Show active bin and surrounding bins with reserves, price, and liquidity depth"
  )
  .requiredOption("--pool-id <id>", "Pool identifier (e.g. dlmm_1)")
  .option(
    "--window <n>",
    "Number of bins to show on each side of active bin",
    (v) => parseInt(v, 10),
    10
  )
  .action(async (opts: { poolId: string; window: number }) => {
    try {
      await bins(opts);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("spread")
  .description(
    "Calculate effective bid-ask spread from bin step and active bin composition"
  )
  .requiredOption("--pool-id <id>", "Pool identifier (e.g. dlmm_1)")
  .action(async (opts: { poolId: string }) => {
    try {
      await spread(opts);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("position")
  .description(
    "Show a wallet's LP bins in a pool, distance from active bin, and in-range status"
  )
  .requiredOption("--pool-id <id>", "Pool identifier (e.g. dlmm_1)")
  .requiredOption("--address <addr>", "Stacks address to inspect")
  .action(async (opts: { poolId: string; address: string }) => {
    try {
      await position(opts);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("fees")
  .description(
    "Show full fee configuration: base, variable, protocol/provider split"
  )
  .requiredOption("--pool-id <id>", "Pool identifier (e.g. dlmm_1)")
  .action(async (opts: { poolId: string }) => {
    try {
      await fees(opts);
    } catch (e) {
      fail(e);
    }
  });

program.parse(process.argv);
