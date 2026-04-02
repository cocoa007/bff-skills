#!/usr/bin/env bun
/**
 * hodlmm-migration-advisor.ts
 *
 * HODLMM Liquidity Migration Advisor — Cross-pool opportunity scanner for
 * concentrated LP positions. Compares fee efficiency, volume intensity,
 * concentration quality, and TVL growth across all HODLMM pools to recommend
 * whether an LP should stay, migrate, or split their position.
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 23).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78"; // Read-only sender

const BIN_STEP_PRICE_FACTOR = 0.0001;
const MIN_TVL_USD = 1000; // Skip pools below this TVL
const DEFAULT_POSITION_USD = 1000; // Hypothetical position size for cost estimates

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
  feePct?: number;
}

interface PoolEfficiency {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeEfficiency: number; // volume/TVL ratio — higher = more fees per $ liquidity
  concentrationScore: number; // 0-100, how well concentrated liquidity is
  depthScore: number; // 0-100, how deep liquidity is near active bin
  compositeScore: number; // weighted combination
  activeBinId: number;
  binStep: number;
  estimatedDailyYieldBps: number; // estimated daily fee yield in basis points
}

interface MigrationRecommendation {
  action: "STAY" | "MIGRATE" | "SPLIT" | "REDUCE";
  confidence: number; // 0-100
  currentPool: PoolEfficiency;
  bestAlternative: PoolEfficiency | null;
  netBenefitBps: number; // estimated daily improvement in bps after costs
  migrationCostEstimate: MigrationCost;
  breakEvenDays: number; // days to recoup migration costs
  reasoning: string[];
}

interface MigrationCost {
  exitSlippageBps: number;
  entrySlippageBps: number;
  gasCostUsd: number;
  totalCostBps: number;
}

interface PoolRanking {
  rank: number;
  pool: PoolEfficiency;
  vsCurrentBps: number; // improvement over current pool
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

function encodeUint(n: number): string {
  return "0x01" + n.toString(16).padStart(32, "0");
}

function parseUintFromResult(text: string, field: string): number | null {
  const re = new RegExp(`${field}\\s+u(\\d+)`);
  const m = text.match(re);
  return m ? parseInt(m[1], 10) : null;
}

// ── Data Fetching ──────────────────────────────────────────────────────────────

async function fetchAppPools(): Promise<AppPool[]> {
  try {
    const resp = await fetchJson(`${BFF_APP_BASE}/pools`);
    const pools = resp.data || resp.pools || resp || [];
    return Array.isArray(pools) ? pools : [];
  } catch {
    return [];
  }
}

async function resolvePool(query: string, appPools: AppPool[]): Promise<{ poolId: number; pool: AppPool | null }> {
  const asNum = parseInt(query, 10);
  if (!isNaN(asNum) && asNum > 0) {
    const match = appPools.find((p) => p.poolId === asNum);
    return { poolId: asNum, pool: match || null };
  }
  const q = query.toLowerCase().replace(/[^a-z0-9]/g, "");
  const match = appPools.find((p) => {
    const pair = `${p.token0Symbol}${p.token1Symbol}`.toLowerCase().replace(/[^a-z0-9]/g, "");
    const pairRev = `${p.token1Symbol}${p.token0Symbol}`.toLowerCase().replace(/[^a-z0-9]/g, "");
    return pair.includes(q) || pairRev.includes(q) || q.includes(pair) || q.includes(pairRev);
  });
  if (!match || !match.poolId) throw new Error(`Pool not found: ${query}`);
  return { poolId: match.poolId, pool: match };
}

async function fetchOnChainPool(poolId: number): Promise<{ activeBinId: number; binStep: number } | null> {
  try {
    const result = await callReadOnly("get-pool", [encodeUint(poolId)]);
    const text = JSON.stringify(result);
    const activeBinId = parseUintFromResult(text, "active-bin-id");
    const binStep = parseUintFromResult(text, "bin-step");
    if (activeBinId === null || binStep === null) return null;
    return { activeBinId, binStep };
  } catch {
    return null;
  }
}

async function fetchBinReservesSample(
  poolId: number,
  activeBinId: number,
  sampleRange: number = 10
): Promise<{ nearReserve: number; totalReserve: number; nonEmptyBins: number; totalBins: number }> {
  let nearReserve = 0;
  let totalReserve = 0;
  let nonEmptyBins = 0;
  const totalBins = sampleRange * 2 + 1;

  const batchSize = 5;
  for (let i = activeBinId - sampleRange; i <= activeBinId + sampleRange; i += batchSize) {
    const batch = [];
    for (let j = i; j < Math.min(i + batchSize, activeBinId + sampleRange + 1); j++) {
      batch.push(j);
    }

    const results = await Promise.all(
      batch.map(async (binId) => {
        try {
          const result = await callReadOnly("get-bin", [encodeUint(poolId), encodeUint(binId)]);
          const text = JSON.stringify(result);
          const reserveX = parseUintFromResult(text, "reserve-x") || 0;
          const reserveY = parseUintFromResult(text, "reserve-y") || 0;
          return { binId, total: reserveX + reserveY };
        } catch {
          return { binId, total: 0 };
        }
      })
    );

    for (const r of results) {
      totalReserve += r.total;
      if (r.total > 0) nonEmptyBins++;
      if (Math.abs(r.binId - activeBinId) <= 2) nearReserve += r.total;
    }
  }

  return { nearReserve, totalReserve, nonEmptyBins, totalBins };
}

// ── Analysis Functions ─────────────────────────────────────────────────────────

function computeFeeEfficiency(volume24h: number, tvl: number): number {
  if (tvl === 0) return 0;
  return volume24h / tvl;
}

function estimateDailyYieldBps(volume24h: number, tvl: number, feePctDefault: number = 0.3): number {
  if (tvl === 0) return 0;
  // Daily fee = volume * fee% / TVL, converted to bps
  return (volume24h * (feePctDefault / 100) / tvl) * 10000;
}

function computeConcentrationScore(nearReserve: number, totalReserve: number): number {
  if (totalReserve === 0) return 50; // neutral if no data
  const concentration = nearReserve / totalReserve;
  // Score: well-concentrated near active bin is good (less competition spread thin)
  return Math.round(Math.min(concentration * 100, 100));
}

function computeDepthScore(nonEmptyBins: number, totalBins: number, tvl: number): number {
  if (totalBins === 0) return 0;
  const fillRatio = nonEmptyBins / totalBins;
  const tvlFactor = Math.min(tvl / 100000, 1); // normalize: 100k+ TVL = full score
  return Math.round(fillRatio * 50 + tvlFactor * 50);
}

function computeCompositeScore(
  feeEfficiency: number,
  concentrationScore: number,
  depthScore: number,
  tvl: number
): number {
  // Weighted composite: fee efficiency matters most, then depth, then concentration
  const feeScore = Math.min(feeEfficiency * 100, 100); // cap: 1.0 vol/TVL = 100
  const tvlScore = Math.min((tvl / 500000) * 100, 100); // cap: 500k = 100

  return Math.round(
    feeScore * 0.35 +
    depthScore * 0.25 +
    concentrationScore * 0.20 +
    tvlScore * 0.20
  );
}

function estimateMigrationCost(
  currentTvl: number,
  targetTvl: number,
  positionUsd: number
): MigrationCost {
  // Slippage estimate: based on position size relative to pool TVL
  const exitSlippageBps = currentTvl > 0
    ? Math.round(Math.min((positionUsd / currentTvl) * 50, 200)) // max 2%
    : 50;
  const entrySlippageBps = targetTvl > 0
    ? Math.round(Math.min((positionUsd / targetTvl) * 50, 200))
    : 50;

  // Gas cost estimate: ~0.5 STX per tx, 2 txs (remove + add), ~$0.50 total
  const gasCostUsd = 0.50;
  const gasCostBps = positionUsd > 0 ? Math.round((gasCostUsd / positionUsd) * 10000) : 5;

  return {
    exitSlippageBps,
    entrySlippageBps,
    gasCostUsd,
    totalCostBps: exitSlippageBps + entrySlippageBps + gasCostBps,
  };
}

function generateMigrationAdvice(
  current: PoolEfficiency,
  alternatives: PoolEfficiency[],
  positionUsd: number
): MigrationRecommendation {
  const sorted = [...alternatives]
    .filter((p) => p.poolId !== current.poolId)
    .sort((a, b) => b.compositeScore - a.compositeScore);

  const best = sorted.length > 0 ? sorted[0] : null;
  const reasoning: string[] = [];

  if (!best) {
    return {
      action: "STAY",
      confidence: 90,
      currentPool: current,
      bestAlternative: null,
      netBenefitBps: 0,
      migrationCostEstimate: { exitSlippageBps: 0, entrySlippageBps: 0, gasCostUsd: 0, totalCostBps: 0 },
      breakEvenDays: Infinity,
      reasoning: ["Only one pool available — no migration targets."],
    };
  }

  const yieldDiff = best.estimatedDailyYieldBps - current.estimatedDailyYieldBps;
  const migrationCost = estimateMigrationCost(current.tvlUsd, best.tvlUsd, positionUsd);
  const netDailyBenefit = yieldDiff; // daily improvement in bps
  const breakEvenDays = netDailyBenefit > 0
    ? Math.round((migrationCost.totalCostBps / netDailyBenefit) * 10) / 10
    : Infinity;

  // Decision logic
  let action: "STAY" | "MIGRATE" | "SPLIT" | "REDUCE";
  let confidence: number;

  if (yieldDiff <= 0) {
    action = "STAY";
    confidence = 80;
    reasoning.push(`Current pool already has the best or equal fee yield (${current.estimatedDailyYieldBps.toFixed(1)} bps/day).`);
    if (current.compositeScore < 30) {
      action = "REDUCE";
      reasoning.push("However, current pool has low overall efficiency — consider reducing exposure.");
    }
  } else if (breakEvenDays <= 3) {
    action = "MIGRATE";
    confidence = Math.min(85, 50 + Math.round(yieldDiff * 5));
    reasoning.push(
      `Strong migration signal: ${best.pair} offers +${yieldDiff.toFixed(1)} bps/day improvement.`
    );
    reasoning.push(`Break-even in ${breakEvenDays} days — fast payback.`);
  } else if (breakEvenDays <= 14) {
    // Consider splitting if break-even is moderate
    if (best.compositeScore > current.compositeScore * 1.3) {
      action = "MIGRATE";
      confidence = 60;
      reasoning.push(
        `${best.pair} scores ${best.compositeScore} vs current ${current.compositeScore} — meaningful upgrade.`
      );
      reasoning.push(`Break-even in ${breakEvenDays} days — reasonable payback period.`);
    } else {
      action = "SPLIT";
      confidence = 55;
      reasoning.push(
        `${best.pair} offers moderate improvement (+${yieldDiff.toFixed(1)} bps/day).`
      );
      reasoning.push("Consider splitting position between both pools to diversify.");
    }
  } else {
    action = "STAY";
    confidence = 70;
    reasoning.push(
      `Best alternative (${best.pair}) offers +${yieldDiff.toFixed(1)} bps/day but break-even is ${breakEvenDays} days.`
    );
    reasoning.push("Migration cost outweighs short-term benefit — stay and monitor.");
  }

  // Additional context
  if (current.feeEfficiency > 0.5) {
    reasoning.push(`Current pool is highly active (vol/TVL: ${current.feeEfficiency.toFixed(2)}) — good fee generation.`);
  }
  if (current.feeEfficiency < 0.05) {
    reasoning.push("Current pool has low trading activity — fee generation is weak.");
  }
  if (best.tvlUsd < current.tvlUsd * 0.3) {
    reasoning.push(`Warning: ${best.pair} has much lower TVL ($${best.tvlUsd.toFixed(0)}) — higher slippage risk.`);
  }

  return {
    action,
    confidence,
    currentPool: current,
    bestAlternative: best,
    netBenefitBps: Math.round(yieldDiff * 10) / 10,
    migrationCostEstimate: migrationCost,
    breakEvenDays,
    reasoning,
  };
}

// ── Pool Efficiency Profiling ─────────────────────────────────────────────────

async function profilePool(pool: AppPool): Promise<PoolEfficiency | null> {
  if (!pool.poolId || pool.tvlUsd < MIN_TVL_USD) return null;

  const feeEfficiency = computeFeeEfficiency(pool.volume24hUsd, pool.tvlUsd);
  const dailyYield = estimateDailyYieldBps(pool.volume24hUsd, pool.tvlUsd, pool.feePct || 0.3);

  // Try on-chain data for concentration/depth
  let concentrationScore = 50; // default
  let depthScore = 50;
  let activeBinId = 0;
  let binStep = 0;

  const onChain = await fetchOnChainPool(pool.poolId);
  if (onChain) {
    activeBinId = onChain.activeBinId;
    binStep = onChain.binStep;

    try {
      const sample = await fetchBinReservesSample(pool.poolId, activeBinId, 10);
      concentrationScore = computeConcentrationScore(sample.nearReserve, sample.totalReserve);
      depthScore = computeDepthScore(sample.nonEmptyBins, sample.totalBins, pool.tvlUsd);
    } catch {
      // Use defaults if bin sampling fails
    }
  }

  const compositeScore = computeCompositeScore(feeEfficiency, concentrationScore, depthScore, pool.tvlUsd);

  return {
    poolId: pool.poolId,
    pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    feeEfficiency,
    concentrationScore,
    depthScore,
    compositeScore,
    activeBinId,
    binStep,
    estimatedDailyYieldBps: Math.round(dailyYield * 10) / 10,
  };
}

// ── Command Handlers ───────────────────────────────────────────────────────────

async function runDoctor(): Promise<void> {
  const results: Record<string, string> = {};

  try {
    await fetchJson(`${BFF_APP_BASE}/pools`);
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
    await callReadOnly("get-pool", [encodeUint(1)]);
    results["dlmm_contract"] = "ok";
  } catch (e: any) {
    results["dlmm_contract"] = `error: ${e.message}`;
  }

  console.log(
    JSON.stringify({
      tool: "hodlmm-migration-advisor",
      command: "doctor",
      status: Object.values(results).every((v) => v === "ok") ? "healthy" : "degraded",
      checks: results,
    })
  );
}

async function runInstallPacks(): Promise<void> {
  console.log(
    JSON.stringify({
      tool: "hodlmm-migration-advisor",
      command: "install-packs",
      status: "ok",
      message: "No additional dependencies required. Uses commander (workspace) + native fetch.",
    })
  );
}

async function runMigrationAnalysis(options: {
  pool?: string;
  position?: string;
  top?: string;
}): Promise<void> {
  const poolQuery = options.pool || "sbtc-stx";
  const positionUsd = options.position ? parseFloat(options.position) : DEFAULT_POSITION_USD;
  const topN = options.top ? parseInt(options.top, 10) : 5;

  // 1. Fetch all pools
  const appPools = await fetchAppPools();
  if (appPools.length === 0) {
    console.log(
      JSON.stringify({ tool: "hodlmm-migration-advisor", error: "Could not fetch pool list from Bitflow API" })
    );
    return;
  }

  // 2. Resolve current pool
  let currentPoolId: number;
  let currentAppPool: AppPool | null;
  try {
    const resolved = await resolvePool(poolQuery, appPools);
    currentPoolId = resolved.poolId;
    currentAppPool = resolved.pool;
  } catch (e: any) {
    console.log(JSON.stringify({ tool: "hodlmm-migration-advisor", error: e.message }));
    return;
  }

  // 3. Profile current pool
  if (!currentAppPool) {
    console.log(
      JSON.stringify({ tool: "hodlmm-migration-advisor", error: `Pool metadata not found for ${poolQuery}` })
    );
    return;
  }

  const currentProfile = await profilePool(currentAppPool);
  if (!currentProfile) {
    console.log(
      JSON.stringify({ tool: "hodlmm-migration-advisor", error: "Failed to profile current pool" })
    );
    return;
  }

  // 4. Profile alternative HODLMM pools (with poolId = HODLMM pool)
  const hodlmmPools = appPools.filter((p) => p.poolId && p.poolId > 0 && p.tvlUsd >= MIN_TVL_USD);
  const profiles: PoolEfficiency[] = [currentProfile];

  // Profile alternatives sequentially to avoid rate limits
  for (const pool of hodlmmPools) {
    if (pool.poolId === currentPoolId) continue;
    const profile = await profilePool(pool);
    if (profile) profiles.push(profile);
  }

  // 5. Rank alternatives
  const rankings: PoolRanking[] = profiles
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .map((p, i) => ({
      rank: i + 1,
      pool: p,
      vsCurrentBps: Math.round((p.estimatedDailyYieldBps - currentProfile.estimatedDailyYieldBps) * 10) / 10,
    }))
    .slice(0, topN);

  // 6. Generate migration recommendation
  const recommendation = generateMigrationAdvice(currentProfile, profiles, positionUsd);

  console.log(
    JSON.stringify({
      tool: "hodlmm-migration-advisor",
      command: "run",
      currentPool: {
        id: currentProfile.poolId,
        pair: currentProfile.pair,
        tvlUsd: currentProfile.tvlUsd,
        volume24hUsd: currentProfile.volume24hUsd,
        compositeScore: currentProfile.compositeScore,
        estimatedDailyYieldBps: currentProfile.estimatedDailyYieldBps,
      },
      positionUsd,
      poolsAnalyzed: profiles.length,
      rankings,
      recommendation: {
        action: recommendation.action,
        confidence: recommendation.confidence,
        bestAlternative: recommendation.bestAlternative
          ? {
              pair: recommendation.bestAlternative.pair,
              compositeScore: recommendation.bestAlternative.compositeScore,
              estimatedDailyYieldBps: recommendation.bestAlternative.estimatedDailyYieldBps,
            }
          : null,
        netBenefitBps: recommendation.netBenefitBps,
        migrationCost: recommendation.migrationCostEstimate,
        breakEvenDays: recommendation.breakEvenDays,
        reasoning: recommendation.reasoning,
      },
      timestamp: new Date().toISOString(),
    })
  );
}

async function runScanAll(options: { top?: string }): Promise<void> {
  const topN = options.top ? parseInt(options.top, 10) : 10;

  // Fetch and profile all pools
  const appPools = await fetchAppPools();
  if (appPools.length === 0) {
    console.log(
      JSON.stringify({ tool: "hodlmm-migration-advisor", error: "Could not fetch pool list from Bitflow API" })
    );
    return;
  }

  const hodlmmPools = appPools.filter((p) => p.poolId && p.poolId > 0 && p.tvlUsd >= MIN_TVL_USD);
  const profiles: PoolEfficiency[] = [];

  for (const pool of hodlmmPools) {
    const profile = await profilePool(pool);
    if (profile) profiles.push(profile);
  }

  // Rank by composite score
  const ranked = profiles
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, topN)
    .map((p, i) => ({
      rank: i + 1,
      pair: p.pair,
      poolId: p.poolId,
      tvlUsd: Math.round(p.tvlUsd),
      volume24hUsd: Math.round(p.volume24hUsd),
      feeEfficiency: Math.round(p.feeEfficiency * 1000) / 1000,
      compositeScore: p.compositeScore,
      estimatedDailyYieldBps: p.estimatedDailyYieldBps,
    }));

  console.log(
    JSON.stringify({
      tool: "hodlmm-migration-advisor",
      command: "scan",
      poolsAnalyzed: profiles.length,
      topPools: ranked,
      timestamp: new Date().toISOString(),
    })
  );
}

// ── CLI Setup ──────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-migration-advisor")
  .description("HODLMM Liquidity Migration Advisor — Cross-pool opportunity scanner for concentrated LP positions")
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
  .description("Analyze migration opportunities from your current pool")
  .option("--pool <id>", "Current pool ID or token pair name (e.g., sbtc-stx, 1)", "sbtc-stx")
  .option("--position <usd>", "Position size in USD for cost estimates", String(DEFAULT_POSITION_USD))
  .option("--top <n>", "Number of top alternatives to show", "5")
  .action(runMigrationAnalysis);

program
  .command("scan")
  .description("Scan all HODLMM pools and rank by efficiency")
  .option("--top <n>", "Number of top pools to show", "10")
  .action(runScanAll);

program.parse();
