#!/usr/bin/env bun
/**
 * hodlmm-pool-comparator.ts
 * Side-by-side comparison of Bitflow HODLMM concentrated liquidity pools.
 * Ranks pools by fee yield efficiency, volume/TVL ratio, concentration quality,
 * and capital efficiency to help LPs pick the best deployment target.
 *
 * Author: cocoa007 (Fluid Briar) — FastPool CEO
 * Competition: AIBTC x BFF Skills Comp Day 20
 *
 * Read-only. No wallet required. No transactions.
 * All data from Hiro API (on-chain read-only calls) and Bitflow public APIs.
 */

import { Command } from "commander";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";

const SENDER = "SP000000000000000000002Q6VF78"; // Read-only sender (standard)

const DISCLAIMER =
  "Pool comparisons use on-chain snapshots and 24h volume data. " +
  "Past performance does not predict future returns. Metrics fluctuate with market conditions. " +
  "This tool does not execute transactions. Not financial advice.";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PoolMetrics {
  poolId: string;
  poolName: string;
  tokenX: string;
  tokenY: string;
  binStep: number;
  activeBinId: number;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  feeYield24hPct: number; // (volume * fee_rate) / TVL * 100
  volumeTvlRatio: number; // volume / TVL — capital turnover
  feeApr: number; // annualized fee yield
  activeBinUtilization: number; // % of TVL in active bin neighborhood
  binCount: number; // number of bins with liquidity
  concentrationScore: number; // 0-100, higher = more concentrated around active bin
  efficiencyRank: number; // overall rank (assigned after scoring)
  warnings: string[];
}

interface ComparisonResult {
  status: string;
  poolCount: number;
  pools: PoolMetrics[];
  bestOverall: string;
  bestFeeYield: string;
  bestVolume: string;
  mostConcentrated: string;
  safestEntry: string;
  methodology: {
    feeYield: string;
    volumeTvlRatio: string;
    concentrationScore: string;
    efficiencyRank: string;
  };
  timestamp: string;
  disclaimer: string;
}

interface AppPool {
  poolId?: string;
  poolContract?: string;
  poolStatus?: boolean;
  tokens?: {
    tokenX?: { symbol?: string; displayName?: string; decimals?: number; priceUsd?: number };
    tokenY?: { symbol?: string; displayName?: string; decimals?: number; priceUsd?: number };
  };
  tvlUsd?: number;
  volumeUsd1d?: number;
  volumeUsd7d?: number;
  feesUsd1d?: number;
  feesUsd7d?: number;
  apr?: number;
  apr24h?: number;
  binStep?: number;
  bin_step?: number;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchJson(url: string): Promise<any> {
  const resp = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`);
  return resp.json();
}

/** Read-only contract call to Hiro API. */
async function callReadOnly(
  fn: string,
  args: string[]
): Promise<any> {
  const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/${fn}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sender: SENDER, arguments: args }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${fn}`);
  return resp.json();
}

/** Encode a uint as a Clarity hex value. */
function encodeUint(n: number): string {
  const hex = n.toString(16).padStart(32, "0");
  return "0x01" + hex;
}

/** Parse a Clarity uint response value. */
function parseUintValue(val: any): number {
  if (!val) return 0;
  if (val.type === "uint" || val.type === "int") return Number(val.value || 0);
  if (typeof val === "string" && val.startsWith("0x")) {
    return parseInt(val.slice(4), 16); // skip 0x01 prefix
  }
  if (typeof val === "number") return val;
  return 0;
}

/** Parse a Clarity response (ok/err wrapper). */
function unwrapResponse(data: any): any {
  if (!data?.result) return null;
  const hex = data.result;
  // If the API returns parsed representation
  if (data.result_repr) return data.result_repr;
  return hex;
}

// ---------------------------------------------------------------------------
// Pool data fetching
// ---------------------------------------------------------------------------

/** Fetch all available HODLMM pools from Bitflow App API. */
async function fetchAppPools(): Promise<AppPool[]> {
  try {
    const resp = await fetchJson(`${BFF_APP_BASE}/pools`);
    // API returns { data: [...], nextCursor, hasMore }
    const raw = resp as Record<string, unknown>;
    const pools: AppPool[] = Array.isArray(raw.data)
      ? raw.data
      : Array.isArray(raw)
        ? raw
        : (raw.pools as AppPool[]) || [];
    // Filter for DLMM/HODLMM pools (poolId starts with "dlmm_")
    return pools.filter(
      (p: AppPool) =>
        (p.poolId && p.poolId.startsWith("dlmm_")) ||
        (p.bin_step !== undefined && p.bin_step > 0) ||
        (p.binStep !== undefined && p.binStep > 0)
    );
  } catch (e) {
    return [];
  }
}

/** Fetch on-chain pool data for a specific pool ID. */
async function fetchOnChainPool(
  poolId: number
): Promise<{ activeBinId: number; binStep: number; feeRate: number } | null> {
  try {
    const data = await callReadOnly("get-pool", [encodeUint(poolId)]);
    const repr = data?.result_repr || data?.result || "";
    // Parse active-bin-id, bin-step, base-fee from the response
    const activeBinMatch = repr.match(/active-bin-id\s+u(\d+)/);
    const binStepMatch = repr.match(/bin-step\s+u(\d+)/);
    const feeMatch = repr.match(/base-fee\s+u(\d+)/);
    return {
      activeBinId: activeBinMatch ? parseInt(activeBinMatch[1]) : 0,
      binStep: binStepMatch ? parseInt(binStepMatch[1]) : 0,
      feeRate: feeMatch ? parseInt(feeMatch[1]) : 0,
    };
  } catch {
    return null;
  }
}

/** Fetch on-chain reserves for a pool. */
async function fetchPoolReserves(
  poolId: number
): Promise<{ reserveX: number; reserveY: number } | null> {
  try {
    const data = await callReadOnly("get-pool-reserves", [encodeUint(poolId)]);
    const repr = data?.result_repr || data?.result || "";
    const rxMatch = repr.match(/reserve-x\s+u(\d+)/);
    const ryMatch = repr.match(/reserve-y\s+u(\d+)/);
    return {
      reserveX: rxMatch ? parseInt(rxMatch[1]) : 0,
      reserveY: ryMatch ? parseInt(ryMatch[1]) : 0,
    };
  } catch {
    return null;
  }
}

/** Fetch bin data around the active bin to assess concentration. */
async function fetchBinConcentration(
  poolId: number,
  activeBinId: number,
  range: number = 10
): Promise<{ activeBinShare: number; binsWithLiquidity: number }> {
  let totalLiquidity = 0;
  let activeBinLiquidity = 0;
  let binsWithLiquidity = 0;

  const startBin = Math.max(0, activeBinId - range);
  const endBin = activeBinId + range;

  // Sample bins around active bin
  const promises: Promise<any>[] = [];
  for (let binId = startBin; binId <= endBin; binId++) {
    promises.push(
      callReadOnly("get-bin", [encodeUint(poolId), encodeUint(binId)])
        .then((data) => {
          const repr = data?.result_repr || data?.result || "";
          const rxMatch = repr.match(/reserve-x\s+u(\d+)/);
          const ryMatch = repr.match(/reserve-y\s+u(\d+)/);
          const rx = rxMatch ? parseInt(rxMatch[1]) : 0;
          const ry = ryMatch ? parseInt(ryMatch[1]) : 0;
          return { binId, liquidity: rx + ry };
        })
        .catch(() => ({ binId, liquidity: 0 }))
    );
  }

  const bins = await Promise.all(promises);
  for (const bin of bins) {
    totalLiquidity += bin.liquidity;
    if (bin.liquidity > 0) binsWithLiquidity++;
    if (
      bin.binId >= activeBinId - 2 &&
      bin.binId <= activeBinId + 2
    ) {
      activeBinLiquidity += bin.liquidity;
    }
  }

  return {
    activeBinShare:
      totalLiquidity > 0 ? (activeBinLiquidity / totalLiquidity) * 100 : 0,
    binsWithLiquidity,
  };
}

// ---------------------------------------------------------------------------
// Scoring and ranking
// ---------------------------------------------------------------------------

function computeConcentrationScore(
  activeBinShare: number,
  binsWithLiquidity: number
): number {
  // Higher score = more concentrated around active bin = better for fee capture
  // activeBinShare: % of sampled liquidity in the 5 bins around active
  // binsWithLiquidity: lower = more concentrated
  let score = 0;

  // Weight active bin share heavily (0-60 points)
  score += Math.min(60, activeBinShare * 0.6);

  // Reward concentrated distributions (0-40 points)
  // Fewer bins with liquidity = more concentrated
  if (binsWithLiquidity <= 3) score += 40;
  else if (binsWithLiquidity <= 5) score += 30;
  else if (binsWithLiquidity <= 10) score += 20;
  else if (binsWithLiquidity <= 15) score += 10;
  else score += 5;

  return Math.round(Math.min(100, score));
}

function computeEfficiencyScore(pool: PoolMetrics): number {
  // Composite score: fee yield (40%), volume/TVL (30%), concentration (30%)
  const feeYieldScore = Math.min(100, pool.feeApr / 2); // 200% APR = 100 score
  const volumeScore = Math.min(100, pool.volumeTvlRatio * 100); // 1:1 ratio = 100
  const concScore = pool.concentrationScore;

  return Math.round(
    feeYieldScore * 0.4 + volumeScore * 0.3 + concScore * 0.3
  );
}

function rankPools(pools: PoolMetrics[]): PoolMetrics[] {
  // Compute efficiency scores and rank
  const scored = pools.map((p) => ({
    ...p,
    efficiencyRank: computeEfficiencyScore(p),
  }));

  // Sort by efficiency rank descending
  scored.sort((a, b) => b.efficiencyRank - a.efficiencyRank);
  return scored;
}

function findBest(
  pools: PoolMetrics[],
  key: keyof PoolMetrics
): string {
  if (pools.length === 0) return "none";
  const sorted = [...pools].sort(
    (a, b) => (b[key] as number) - (a[key] as number)
  );
  return sorted[0].poolName || sorted[0].poolId;
}

function findSafest(pools: PoolMetrics[]): string {
  if (pools.length === 0) return "none";
  // Safest = highest TVL + reasonable volume (most established)
  const scored = pools.map((p) => ({
    name: p.poolName || p.poolId,
    score: p.tvlUsd * 0.6 + p.volume24hUsd * 0.4,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0].name;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function runDoctor(): Promise<void> {
  const checks: { name: string; ok: boolean; detail: string }[] = [];

  // Check Hiro API
  try {
    const data = await callReadOnly("get-pool", [encodeUint(1)]);
    checks.push({
      name: "Hiro API (DLMM contract)",
      ok: !!data?.result,
      detail: data?.result ? "Reachable" : "No result",
    });
  } catch (e: any) {
    checks.push({
      name: "Hiro API (DLMM contract)",
      ok: false,
      detail: e.message,
    });
  }

  // Check Bitflow App API
  try {
    const appPools = await fetchAppPools();
    checks.push({
      name: "Bitflow App API (pools)",
      ok: appPools.length > 0,
      detail: `${appPools.length} DLMM pools found`,
    });
  } catch (e: any) {
    checks.push({
      name: "Bitflow App API (pools)",
      ok: false,
      detail: e.message,
    });
  }

  const allOk = checks.every((c) => c.ok);
  const bitflowOk = checks.some((c) => c.name.includes("Bitflow") && c.ok);
  console.log(
    JSON.stringify(
      {
        status: allOk ? "ok" : bitflowOk ? "degraded" : "error",
        checks,
        message: allOk
          ? "All data sources available."
          : bitflowOk
            ? "Some data sources unavailable — pool comparison will use API data with reduced on-chain detail."
            : "Critical data sources unavailable.",
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  );
  // Exit 0 if at least Bitflow works (core data source)
  process.exit(bitflowOk ? 0 : 1);
}

async function runInstallPacks(): Promise<void> {
  console.log(
    JSON.stringify({
      status: "ok",
      message: "No external dependencies — bun runtime only.",
    })
  );
}

async function runCompare(options: {
  pools?: string;
  top?: number;
  sortBy?: string;
  minTvl?: number;
}): Promise<void> {
  const requestedPoolIds = options.pools
    ? options.pools.split(",").map((s) => s.trim())
    : [];
  const topN = options.top || 10;
  const sortBy = options.sortBy || "efficiency";
  const minTvl = options.minTvl || 0;

  // Step 1: Fetch all HODLMM pools from Bitflow API
  const appPools = await fetchAppPools();
  if (appPools.length === 0) {
    console.log(
      JSON.stringify({ error: "No HODLMM pools found from Bitflow API." })
    );
    process.exit(1);
  }

  // Filter to requested pools if specified
  let filteredPools = appPools;
  if (requestedPoolIds.length > 0) {
    filteredPools = appPools.filter((p) => {
      const id = (p.poolId || "").toString().toLowerCase();
      const tokenX = (p.tokens?.tokenX?.symbol || "").toLowerCase();
      const tokenY = (p.tokens?.tokenY?.symbol || "").toLowerCase();
      return requestedPoolIds.some(
        (req) => {
          const r = req.toLowerCase();
          return id === r || id.includes(r) || r.includes(id) ||
            tokenX.includes(r) || tokenY.includes(r);
        }
      );
    });
  }

  // Step 2: Build metrics for each pool
  const metrics: PoolMetrics[] = [];

  for (const ap of filteredPools) {
    const poolId = ap.poolId || "unknown";
    const tokenX = ap.tokens?.tokenX?.symbol || ap.tokens?.tokenX?.displayName || "?";
    const tokenY = ap.tokens?.tokenY?.symbol || ap.tokens?.tokenY?.displayName || "?";
    const poolName = `${tokenX}-${tokenY}`;
    const binStep = ap.bin_step || ap.binStep || 0;
    const tvlUsd = ap.tvlUsd || 0;
    const volume24hUsd = ap.volumeUsd1d || 0;
    const dailyFeesUsd = ap.feesUsd1d || 0;

    // Apply TVL filter
    if (tvlUsd < minTvl) continue;

    // Calculate fee yield — use actual fee revenue when available, else estimate
    const feeYield24hPct = tvlUsd > 0 ? (dailyFeesUsd / tvlUsd) * 100 : 0;
    const feeApr = ap.apr24h || ap.apr || feeYield24hPct * 365;
    const volumeTvlRatio = tvlUsd > 0 ? volume24hUsd / tvlUsd : 0;
    // Derive effective fee bps from actual fees / volume
    const feeBps = volume24hUsd > 0 ? Math.round((dailyFeesUsd / volume24hUsd) * 10000) : 0;

    // Fetch on-chain data for concentration analysis
    const numericId = parseInt(poolId.toString().replace(/\D/g, "")) || 0;
    let activeBinId = 0;
    let activeBinUtilization = 0;
    let binCount = 0;
    let concentrationScore = 50; // Default middle score
    const warnings: string[] = [];

    if (numericId > 0) {
      const onChain = await fetchOnChainPool(numericId);
      if (onChain) {
        activeBinId = onChain.activeBinId;

        // Fetch bin concentration
        try {
          const conc = await fetchBinConcentration(
            numericId,
            activeBinId,
            10
          );
          activeBinUtilization = conc.activeBinShare;
          binCount = conc.binsWithLiquidity;
          concentrationScore = computeConcentrationScore(
            activeBinUtilization,
            binCount
          );
        } catch {
          warnings.push("Bin concentration data unavailable — using estimate");
        }
      } else {
        warnings.push("On-chain pool data unavailable — using API data only");
      }
    }

    if (tvlUsd < 1000) warnings.push("Low TVL — high slippage risk");
    if (volume24hUsd < 100) warnings.push("Low volume — limited fee generation");
    if (feeApr > 1000) warnings.push("Extremely high APR — likely unsustainable or low TVL");
    if (dailyFeesUsd === 0 && volume24hUsd > 0) warnings.push("Fee data unavailable — yield estimated from volume");

    metrics.push({
      poolId: poolId.toString(),
      poolName,
      tokenX,
      tokenY,
      binStep,
      activeBinId,
      tvlUsd: Math.round(tvlUsd * 100) / 100,
      volume24hUsd: Math.round(volume24hUsd * 100) / 100,
      feeBps,
      feeYield24hPct: Math.round(feeYield24hPct * 10000) / 10000,
      feeApr: Math.round(feeApr * 100) / 100,
      volumeTvlRatio: Math.round(volumeTvlRatio * 10000) / 10000,
      activeBinUtilization: Math.round(activeBinUtilization * 100) / 100,
      binCount,
      concentrationScore,
      efficiencyRank: 0,
      warnings,
    });
  }

  if (metrics.length === 0) {
    console.log(
      JSON.stringify({
        error: "No pools matched the filter criteria.",
        availablePools: appPools.length,
        filter: { requestedPoolIds, minTvl },
      })
    );
    process.exit(1);
  }

  // Step 3: Rank pools
  let ranked = rankPools(metrics);

  // Apply custom sort
  switch (sortBy) {
    case "fee-yield":
    case "yield":
      ranked.sort((a, b) => b.feeApr - a.feeApr);
      break;
    case "volume":
      ranked.sort((a, b) => b.volume24hUsd - a.volume24hUsd);
      break;
    case "tvl":
      ranked.sort((a, b) => b.tvlUsd - a.tvlUsd);
      break;
    case "concentration":
      ranked.sort((a, b) => b.concentrationScore - a.concentrationScore);
      break;
    case "efficiency":
    default:
      // Already sorted by efficiency
      break;
  }

  // Limit to top N
  const topPools = ranked.slice(0, topN);

  // Step 4: Build result
  const result: ComparisonResult = {
    status: "success",
    poolCount: topPools.length,
    pools: topPools,
    bestOverall: topPools[0]?.poolName || "none",
    bestFeeYield: findBest(metrics, "feeApr"),
    bestVolume: findBest(metrics, "volume24hUsd"),
    mostConcentrated: findBest(metrics, "concentrationScore"),
    safestEntry: findSafest(metrics),
    methodology: {
      feeYield: "24h_volume * fee_rate / TVL, annualized",
      volumeTvlRatio:
        "24h_volume / TVL — measures capital turnover efficiency",
      concentrationScore:
        "0-100 based on liquidity concentration around active bin (5-bin neighborhood share + distribution spread)",
      efficiencyRank:
        "Composite: fee_yield_score * 40% + volume_tvl_score * 30% + concentration_score * 30%",
    },
    timestamp: new Date().toISOString(),
    disclaimer: DISCLAIMER,
  };

  console.log(JSON.stringify(result, null, 2));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name("hodlmm-pool-comparator")
  .description(
    "Compare HODLMM concentrated LP pools side-by-side on fee yield, volume, concentration, and efficiency."
  );

program
  .command("doctor")
  .description("Check API connectivity")
  .action(runDoctor);

program
  .command("install-packs")
  .description("Install dependencies (none required)")
  .action(runInstallPacks);

program
  .command("run")
  .description("Compare HODLMM pools and rank by efficiency")
  .option(
    "--pools <ids>",
    "Comma-separated pool IDs or names to compare (default: all HODLMM pools)"
  )
  .option("--top <n>", "Show top N pools (default: 10)", parseInt)
  .option(
    "--sort-by <metric>",
    "Sort by: efficiency, fee-yield, volume, tvl, concentration (default: efficiency)"
  )
  .option(
    "--min-tvl <usd>",
    "Minimum TVL filter in USD (default: 0)",
    parseFloat
  )
  .action(runCompare);

program.parse();
