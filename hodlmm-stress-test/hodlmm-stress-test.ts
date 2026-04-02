#!/usr/bin/env bun
/**
 * hodlmm-stress-test.ts
 *
 * HODLMM Pool Stress Test — Simulates escalating trade sizes to find
 * liquidity breaking points, exhaustion thresholds, and fragility scores.
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 30).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const STRESS_RADIUS = 25; // wider than normal — need to find breaking point
const DEFAULT_MAX_USD = 100000;
const DEFAULT_STEPS = 20;
const DEFAULT_BIN_STEP_BPS = 10;

// Verdict thresholds (slippage in bps)
const SAFE_THRESHOLD_BPS = 50;
const CAUTION_THRESHOLD_BPS = 200;
const DANGER_THRESHOLD_BPS = 500;

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
  feeRateBps?: number;
  binStep?: number;
}

interface BinReserves {
  binId: number;
  reserveX: number;
  reserveY: number;
  reserveXUsd: number;
  reserveYUsd: number;
  totalUsd: number;
  distanceFromActive: number;
  isEmpty: boolean;
}

interface StressEntry {
  tradeSizeUsd: number;
  slippageBps: number;
  binsConsumed: number;
  reserveDepletionPct: number;
  verdict: "SAFE" | "CAUTION" | "DANGER" | "BREAKING";
}

interface Thresholds {
  safeLimitUsd: number;
  dangerLimitUsd: number;
  breakingPointUsd: number;
  totalAbsorbableUsd: number;
}

interface FragilityResult {
  score: number;
  grade: "RESILIENT" | "STURDY" | "MODERATE" | "FRAGILE" | "BRITTLE";
  reasoning: string;
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

function parseReservesFromRepr(repr: string): { reserveX: number; reserveY: number } {
  const xMatch = repr.match(/reserve-x\s+u(\d+)/);
  const yMatch = repr.match(/reserve-y\s+u(\d+)/);
  return {
    reserveX: xMatch ? parseInt(xMatch[1], 10) : 0,
    reserveY: yMatch ? parseInt(yMatch[1], 10) : 0,
  };
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

async function resolvePool(
  query: string,
  appPools: AppPool[]
): Promise<{ poolId: number; pool: AppPool | null }> {
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

async function fetchActiveBin(poolId: number): Promise<number | null> {
  try {
    const result = await callReadOnly("get-active-bin-id", [encodeUint(poolId)]);
    const repr = result.result || "";
    const match = repr.match(/u(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}

async function fetchBinReserves(
  poolId: number,
  binId: number
): Promise<{ reserveX: number; reserveY: number }> {
  try {
    const result = await callReadOnly("get-bin", [encodeUint(poolId), encodeUint(binId)]);
    const repr = result.result || "";
    return parseReservesFromRepr(repr);
  } catch {
    return { reserveX: 0, reserveY: 0 };
  }
}

async function fetchBinStep(poolId: number): Promise<number> {
  try {
    const result = await callReadOnly("get-pair-information", [encodeUint(poolId)]);
    const repr = result.result || "";
    const binStepMatch = repr.match(/bin-step\s+u(\d+)/);
    return binStepMatch ? parseInt(binStepMatch[1], 10) : DEFAULT_BIN_STEP_BPS;
  } catch {
    return DEFAULT_BIN_STEP_BPS;
  }
}

// ── Bin Scanning ───────────────────────────────────────────────────────────────

async function scanBinsAroundActive(
  poolId: number,
  activeBinId: number,
  radius: number,
  pool: AppPool
): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const xDecimals = pool.token0Decimals || 8;
  const yDecimals = pool.token1Decimals || 6;
  const xPrice = pool.token0PriceUsd || 0;
  const yPrice = pool.token1PriceUsd || 0;

  const binIds: number[] = [];
  for (let i = 0; i <= radius; i++) {
    binIds.push(activeBinId + i);
    if (i > 0) binIds.push(activeBinId - i);
  }

  const batchSize = 5;
  for (let i = 0; i < binIds.length; i += batchSize) {
    const batch = binIds.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (binId) => {
        const reserves = await fetchBinReserves(poolId, binId);
        const reserveXUsd = (reserves.reserveX / Math.pow(10, xDecimals)) * xPrice;
        const reserveYUsd = (reserves.reserveY / Math.pow(10, yDecimals)) * yPrice;
        const totalUsd = reserveXUsd + reserveYUsd;
        return {
          binId,
          reserveX: reserves.reserveX,
          reserveY: reserves.reserveY,
          reserveXUsd: Math.round(reserveXUsd * 100) / 100,
          reserveYUsd: Math.round(reserveYUsd * 100) / 100,
          totalUsd: Math.round(totalUsd * 100) / 100,
          distanceFromActive: binId - activeBinId,
          isEmpty: totalUsd < 0.01,
        };
      })
    );
    bins.push(...results);
  }

  return bins.sort((a, b) => a.binId - b.binId);
}

// ── Stress Test Engine ────────────────────────────────────────────────────────

function simulateStress(
  bins: BinReserves[],
  activeBinId: number,
  binStepBps: number,
  maxUsd: number,
  steps: number
): { profile: StressEntry[]; thresholds: Thresholds } {
  // Simulate buying token X (consuming ask-side reserves upward from active bin)
  const askBins = bins
    .filter((b) => b.binId >= activeBinId && b.reserveXUsd > 0.01)
    .sort((a, b) => a.binId - b.binId);

  // Also simulate selling token X (consuming bid-side reserves downward)
  const bidBins = bins
    .filter((b) => b.binId <= activeBinId && b.reserveYUsd > 0.01)
    .sort((a, b) => b.binId - a.binId);

  // Total absorbable on each side
  const totalAskUsd = askBins.reduce((s, b) => s + b.reserveXUsd, 0);
  const totalBidUsd = bidBins.reduce((s, b) => s + b.reserveYUsd, 0);

  // Use the weaker side for stress testing (worst case)
  const weakerSide = totalAskUsd <= totalBidUsd ? "ask" : "bid";
  const targetBins = weakerSide === "ask" ? askBins : bidBins;
  const totalAbsorbableUsd = Math.min(totalAskUsd, totalBidUsd);

  // Generate escalating trade sizes
  const tradeSizes: number[] = [];
  for (let i = 1; i <= steps; i++) {
    tradeSizes.push(Math.round((maxUsd * i) / steps));
  }

  const profile: StressEntry[] = [];
  let safeLimitUsd = 0;
  let dangerLimitUsd = 0;
  let breakingPointUsd = 0;

  for (const size of tradeSizes) {
    let remaining = size;
    let binsConsumed = 0;
    let maxBinReached = activeBinId;

    for (const bin of targetBins) {
      if (remaining <= 0) break;
      const available = weakerSide === "ask" ? bin.reserveXUsd : bin.reserveYUsd;
      const consumed = Math.min(remaining, available);
      remaining -= consumed;
      binsConsumed++;
      maxBinReached = bin.binId;
    }

    const distanceBins = Math.abs(maxBinReached - activeBinId);
    const slippageBps = Math.round(distanceBins * binStepBps * 100) / 100;
    const depleted = totalAbsorbableUsd > 0
      ? Math.round((size / totalAbsorbableUsd) * 10000) / 100
      : 100;

    let verdict: StressEntry["verdict"];
    if (slippageBps < SAFE_THRESHOLD_BPS && depleted < 20) {
      verdict = "SAFE";
      safeLimitUsd = size;
    } else if (slippageBps < CAUTION_THRESHOLD_BPS && depleted < 50) {
      verdict = "CAUTION";
      if (dangerLimitUsd === 0 && safeLimitUsd > 0) dangerLimitUsd = size;
    } else if (slippageBps < DANGER_THRESHOLD_BPS && depleted < 80) {
      verdict = "DANGER";
      if (dangerLimitUsd === 0) dangerLimitUsd = size;
    } else {
      verdict = "BREAKING";
      if (breakingPointUsd === 0) breakingPointUsd = size;
      if (dangerLimitUsd === 0) dangerLimitUsd = size;
    }

    profile.push({
      tradeSizeUsd: size,
      slippageBps,
      binsConsumed,
      reserveDepletionPct: Math.min(100, depleted),
      verdict,
    });
  }

  // If thresholds weren't hit, set them to max
  if (dangerLimitUsd === 0) dangerLimitUsd = maxUsd;
  if (breakingPointUsd === 0) breakingPointUsd = maxUsd;

  return {
    profile,
    thresholds: {
      safeLimitUsd,
      dangerLimitUsd,
      breakingPointUsd,
      totalAbsorbableUsd: Math.round(totalAbsorbableUsd),
    },
  };
}

function computeFragility(
  thresholds: Thresholds,
  profile: StressEntry[],
  tvlUsd: number
): FragilityResult {
  // Component 1: Safe limit relative to TVL (0-25 points of fragility)
  const safeTvlRatio = tvlUsd > 0 ? thresholds.safeLimitUsd / tvlUsd : 0;
  const safeScore = Math.max(0, 25 - safeTvlRatio * 100); // lower ratio = more fragile

  // Component 2: Steepness of slippage curve (0-25 points)
  // Measure how quickly slippage escalates between steps
  let maxSlippageJump = 0;
  for (let i = 1; i < profile.length; i++) {
    const jump = profile[i].slippageBps - profile[i - 1].slippageBps;
    const sizeIncrease = profile[i].tradeSizeUsd - profile[i - 1].tradeSizeUsd;
    if (sizeIncrease > 0) {
      const normalized = (jump / sizeIncrease) * 1000; // bps per $1000
      maxSlippageJump = Math.max(maxSlippageJump, normalized);
    }
  }
  const steepnessScore = Math.min(25, maxSlippageJump * 5);

  // Component 3: Capacity utilization at midpoint (0-25 points)
  const midIdx = Math.floor(profile.length / 2);
  const midDepletion = midIdx < profile.length ? profile[midIdx].reserveDepletionPct : 50;
  const depletionScore = Math.min(25, midDepletion * 0.5);

  // Component 4: Gap between safe and breaking (0-25 points)
  // Narrow gap = brittle (no gradual degradation zone)
  const gap = thresholds.breakingPointUsd - thresholds.safeLimitUsd;
  const gapRatio = thresholds.breakingPointUsd > 0 ? gap / thresholds.breakingPointUsd : 0;
  const gapScore = Math.max(0, 25 - gapRatio * 50); // wider gap = less fragile

  const totalScore = Math.round(
    Math.min(100, Math.max(0, safeScore + steepnessScore + depletionScore + gapScore))
  );

  let grade: FragilityResult["grade"];
  if (totalScore <= 20) grade = "RESILIENT";
  else if (totalScore <= 40) grade = "STURDY";
  else if (totalScore <= 60) grade = "MODERATE";
  else if (totalScore <= 80) grade = "FRAGILE";
  else grade = "BRITTLE";

  let reasoning: string;
  if (grade === "RESILIENT") {
    reasoning = `Deep liquidity — pool absorbs up to $${thresholds.safeLimitUsd.toLocaleString()} safely with gradual degradation beyond.`;
  } else if (grade === "STURDY") {
    reasoning = `Good capacity. Safe limit $${thresholds.safeLimitUsd.toLocaleString()}, breaking at $${thresholds.breakingPointUsd.toLocaleString()}.`;
  } else if (grade === "MODERATE") {
    reasoning = `Pool can absorb ~$${thresholds.safeLimitUsd.toLocaleString()} safely but deteriorates ${gap < thresholds.safeLimitUsd ? "rapidly" : "gradually"} above $${thresholds.dangerLimitUsd.toLocaleString()}.`;
  } else if (grade === "FRAGILE") {
    reasoning = `Thin liquidity. Safe limit only $${thresholds.safeLimitUsd.toLocaleString()} — slippage escalates quickly. Split large trades.`;
  } else {
    reasoning = `Very low capacity. Even moderate trades cause significant slippage. Avoid trades above $${thresholds.safeLimitUsd.toLocaleString()}.`;
  }

  return { score: totalScore, grade, reasoning };
}

function generateReasoning(
  thresholds: Thresholds,
  fragility: FragilityResult,
  profile: StressEntry[],
  pool: AppPool
): string[] {
  const reasons: string[] = [];

  reasons.push(
    `Safe trading up to $${thresholds.safeLimitUsd.toLocaleString()} (slippage < ${SAFE_THRESHOLD_BPS} bps).`
  );

  if (thresholds.dangerLimitUsd > thresholds.safeLimitUsd) {
    reasons.push(
      `Caution zone: $${thresholds.safeLimitUsd.toLocaleString()}-$${thresholds.dangerLimitUsd.toLocaleString()} (elevated but manageable slippage).`
    );
  }

  reasons.push(
    `Breaking point: $${thresholds.breakingPointUsd.toLocaleString()} (>${DANGER_THRESHOLD_BPS} bps slippage or >80% reserve depletion).`
  );

  const tvlUsd = pool.tvlUsd || 0;
  if (tvlUsd > 0) {
    const safePct = Math.round((thresholds.safeLimitUsd / tvlUsd) * 100);
    reasons.push(
      `Safe limit is ${safePct}% of pool TVL ($${Math.round(tvlUsd).toLocaleString()}).`
    );
  }

  reasons.push(`Fragility: ${fragility.grade} (${fragility.score}/100).`);

  return reasons;
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
    const result = await callReadOnly("get-active-bin-id", [encodeUint(1)]);
    results["contract_read"] = result.result ? "ok" : "no result";
  } catch (e: any) {
    results["contract_read"] = `error: ${e.message}`;
  }

  console.log(
    JSON.stringify({
      tool: "hodlmm-stress-test",
      command: "doctor",
      status: Object.values(results).every((v) => v === "ok") ? "healthy" : "degraded",
      checks: results,
      timestamp: new Date().toISOString(),
    })
  );
}

async function runInstallPacks(): Promise<void> {
  console.log(
    JSON.stringify({
      tool: "hodlmm-stress-test",
      command: "install-packs",
      status: "ok",
      message: "No additional dependencies required. Uses commander (workspace) + native fetch.",
      timestamp: new Date().toISOString(),
    })
  );
}

async function runStressTest(options: {
  pool?: string;
  maxUsd?: string;
  steps?: string;
}): Promise<void> {
  const poolQuery = options.pool || "sbtc-stx";
  const maxUsd = options.maxUsd ? parseInt(options.maxUsd, 10) : DEFAULT_MAX_USD;
  const steps = options.steps ? parseInt(options.steps, 10) : DEFAULT_STEPS;

  if (maxUsd <= 0 || steps <= 0) {
    console.log(
      JSON.stringify({ tool: "hodlmm-stress-test", error: "max-usd and steps must be positive", timestamp: new Date().toISOString() })
    );
    return;
  }

  const appPools = await fetchAppPools();
  if (appPools.length === 0) {
    console.log(
      JSON.stringify({ tool: "hodlmm-stress-test", error: "Could not fetch pool list from Bitflow API", timestamp: new Date().toISOString() })
    );
    return;
  }

  let poolId: number;
  let appPool: AppPool | null;
  try {
    const resolved = await resolvePool(poolQuery, appPools);
    poolId = resolved.poolId;
    appPool = resolved.pool;
  } catch (e: any) {
    console.log(JSON.stringify({ tool: "hodlmm-stress-test", error: e.message, timestamp: new Date().toISOString() }));
    return;
  }

  if (!appPool) {
    console.log(
      JSON.stringify({ tool: "hodlmm-stress-test", error: `Pool metadata not found for ${poolQuery}`, timestamp: new Date().toISOString() })
    );
    return;
  }

  const activeBinId = appPool.activeBinId || (await fetchActiveBin(poolId));
  if (!activeBinId) {
    console.log(
      JSON.stringify({ tool: "hodlmm-stress-test", error: `Could not determine active bin for pool ${poolId}`, timestamp: new Date().toISOString() })
    );
    return;
  }

  const binStepBps = appPool.binStep || (await fetchBinStep(poolId));

  // Wider scan for stress testing
  const bins = await scanBinsAroundActive(poolId, activeBinId, STRESS_RADIUS, appPool);

  const { profile, thresholds } = simulateStress(bins, activeBinId, binStepBps, maxUsd, steps);
  const fragility = computeFragility(thresholds, profile, appPool.tvlUsd || 0);
  const reasoning = generateReasoning(thresholds, fragility, profile, appPool);

  console.log(
    JSON.stringify({
      tool: "hodlmm-stress-test",
      command: "run",
      pool: {
        id: poolId,
        pair: `${appPool.token0Symbol}-${appPool.token1Symbol}`,
        tvlUsd: Math.round(appPool.tvlUsd || 0),
        activeBinId,
        binStepBps,
      },
      stressProfile: profile,
      thresholds,
      fragility,
      reasoning,
      weakerSide: {
        side: bins.filter((b) => b.binId >= activeBinId).reduce((s, b) => s + b.reserveXUsd, 0) <=
              bins.filter((b) => b.binId <= activeBinId).reduce((s, b) => s + b.reserveYUsd, 0)
          ? "ask" : "bid",
        totalUsd: Math.round(Math.min(
          bins.filter((b) => b.binId >= activeBinId).reduce((s, b) => s + b.reserveXUsd, 0),
          bins.filter((b) => b.binId <= activeBinId).reduce((s, b) => s + b.reserveYUsd, 0)
        )),
      },
      binsScanned: bins.length,
      timestamp: new Date().toISOString(),
    })
  );
}

async function runScanAll(options: {
  top?: string;
  sort?: string;
}): Promise<void> {
  const topN = options.top ? parseInt(options.top, 10) : 10;
  const sortBy = options.sort || "resilience";

  const appPools = await fetchAppPools();
  if (appPools.length === 0) {
    console.log(
      JSON.stringify({ tool: "hodlmm-stress-test", error: "Could not fetch pool list from Bitflow API", timestamp: new Date().toISOString() })
    );
    return;
  }

  const hodlmmPools = appPools.filter((p) => p.poolId && p.poolId > 0 && p.tvlUsd >= MIN_TVL_USD);
  const analyses: Array<{
    pair: string;
    poolId: number;
    tvlUsd: number;
    safeLimitUsd: number;
    dangerLimitUsd: number;
    breakingPointUsd: number;
    totalAbsorbableUsd: number;
    fragilityScore: number;
    fragilityGrade: string;
    safeToTvlPct: number;
  }> = [];

  for (const pool of hodlmmPools) {
    if (!pool.poolId) continue;

    const activeBinId = pool.activeBinId || (await fetchActiveBin(pool.poolId));
    if (!activeBinId) continue;

    const binStepBps = pool.binStep || DEFAULT_BIN_STEP_BPS;

    // Moderate radius for scan (balance speed vs accuracy)
    const bins = await scanBinsAroundActive(pool.poolId, activeBinId, 15, pool);
    const scanMaxUsd = Math.max(50000, (pool.tvlUsd || 0) * 0.5);
    const { profile, thresholds } = simulateStress(bins, activeBinId, binStepBps, scanMaxUsd, 10);
    const fragility = computeFragility(thresholds, profile, pool.tvlUsd || 0);

    analyses.push({
      pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
      poolId: pool.poolId,
      tvlUsd: Math.round(pool.tvlUsd || 0),
      safeLimitUsd: thresholds.safeLimitUsd,
      dangerLimitUsd: thresholds.dangerLimitUsd,
      breakingPointUsd: thresholds.breakingPointUsd,
      totalAbsorbableUsd: thresholds.totalAbsorbableUsd,
      fragilityScore: fragility.score,
      fragilityGrade: fragility.grade,
      safeToTvlPct: pool.tvlUsd > 0
        ? Math.round((thresholds.safeLimitUsd / pool.tvlUsd) * 10000) / 100
        : 0,
    });
  }

  let sorted: typeof analyses;
  switch (sortBy) {
    case "safe-limit":
      sorted = analyses.sort((a, b) => b.safeLimitUsd - a.safeLimitUsd);
      break;
    case "tvl":
      sorted = analyses.sort((a, b) => b.tvlUsd - a.tvlUsd);
      break;
    default: // resilience — lowest fragility first
      sorted = analyses.sort((a, b) => a.fragilityScore - b.fragilityScore);
  }

  const ranked = sorted.slice(0, topN).map((a, i) => ({ rank: i + 1, ...a }));

  const avgFragility = analyses.length > 0
    ? Math.round(analyses.reduce((s, a) => s + a.fragilityScore, 0) / analyses.length)
    : 0;

  console.log(
    JSON.stringify({
      tool: "hodlmm-stress-test",
      command: "scan",
      poolsAnalyzed: analyses.length,
      sortBy,
      topPools: ranked,
      summary: {
        resilient: analyses.filter((a) => a.fragilityGrade === "RESILIENT").length,
        sturdy: analyses.filter((a) => a.fragilityGrade === "STURDY").length,
        moderate: analyses.filter((a) => a.fragilityGrade === "MODERATE").length,
        fragile: analyses.filter((a) => a.fragilityGrade === "FRAGILE").length,
        brittle: analyses.filter((a) => a.fragilityGrade === "BRITTLE").length,
        avgFragilityScore: avgFragility,
        avgSafeLimitUsd: analyses.length > 0
          ? Math.round(analyses.reduce((s, a) => s + a.safeLimitUsd, 0) / analyses.length)
          : 0,
        totalAbsorbableAllPoolsUsd: analyses.reduce((s, a) => s + a.totalAbsorbableUsd, 0),
      },
      timestamp: new Date().toISOString(),
    })
  );
}

// ── CLI Setup ──────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-stress-test")
  .description("HODLMM Pool Stress Test — Escalating trade simulation, breaking points, and fragility scoring")
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
  .description("Stress test a specific pool with escalating trade sizes")
  .option("--pool <id>", "Pool ID or token pair name (e.g., sbtc-stx, 1)", "sbtc-stx")
  .option("--max-usd <n>", "Maximum trade size to simulate in USD", String(DEFAULT_MAX_USD))
  .option("--steps <n>", "Number of escalation steps", String(DEFAULT_STEPS))
  .action(runStressTest);

program
  .command("scan")
  .description("Scan all HODLMM pools for resilience")
  .option("--top <n>", "Number of pools to show", "10")
  .option("--sort <field>", "Sort by: resilience, safe-limit, tvl", "resilience")
  .action(runScanAll);

program.parse();
