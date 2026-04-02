#!/usr/bin/env bun
/**
 * hodlmm-bin-utilization.ts
 *
 * HODLMM Bin Utilization Monitor — Capital efficiency tracker for HODLMM pools.
 * Measures active vs idle liquidity, identifies dead capital in out-of-range bins,
 * calculates effective TVL, and scores capital efficiency.
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 26).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const DEFAULT_RADIUS = 10;
const FAR_OUT_OF_RANGE_BINS = 20; // bins beyond this from active = "far out"
const HIGH_EFFICIENCY_THRESHOLD = 80;
const MODERATE_EFFICIENCY_THRESHOLD = 50;

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
}

interface BinData {
  binId: number;
  reserveX: number;
  reserveY: number;
  reserveXUsd: number;
  reserveYUsd: number;
  totalUsd: number;
  distanceFromActive: number;
}

interface UtilizationResult {
  totalBinsWithLiquidity: number;
  activeBins: number;
  idleBins: number;
  activeLiquidityUsd: number;
  idleLiquidityUsd: number;
  effectiveTvlPct: number;
  capitalEfficiencyScore: number;
}

interface ConcentrationResult {
  giniCoefficient: number;
  top5BinsPct: number;
  profile: "CONCENTRATED" | "MODERATE" | "DISPERSED";
}

interface DeadCapitalResult {
  totalIdleUsd: number;
  farOutOfRange: number;
  recommendation: "HOLD" | "TIGHTEN" | "REBALANCE" | "URGENT";
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

function parseUintFromRepr(repr: string): number | null {
  // Parse (ok (tuple (reserve-x u123) (reserve-y u456)))
  const match = repr.match(/u(\d+)/g);
  return match ? parseInt(match[0].substring(1), 10) : null;
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

// ── Bin Scanning ───────────────────────────────────────────────────────────────

async function scanBinsAroundActive(
  poolId: number,
  activeBinId: number,
  radius: number,
  pool: AppPool
): Promise<BinData[]> {
  const bins: BinData[] = [];
  const xDecimals = pool.token0Decimals || 8;
  const yDecimals = pool.token1Decimals || 6;
  const xPrice = pool.token0PriceUsd || 0;
  const yPrice = pool.token1PriceUsd || 0;

  // Scan bins from (active - radius*2) to (active + radius*2) to capture idle range too
  const scanRadius = radius * 2;
  const startBin = activeBinId - scanRadius;
  const endBin = activeBinId + scanRadius;

  // Batch fetch — scan outward from active bin for efficiency
  const binIds: number[] = [];
  for (let i = 0; i <= scanRadius; i++) {
    binIds.push(activeBinId + i);
    if (i > 0) binIds.push(activeBinId - i);
  }

  // Limit concurrent requests to avoid rate limiting
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
          distanceFromActive: Math.abs(binId - activeBinId),
        };
      })
    );
    bins.push(...results);
  }

  return bins.filter((b) => b.totalUsd > 0).sort((a, b) => a.distanceFromActive - b.distanceFromActive);
}

// ── Analysis Functions ─────────────────────────────────────────────────────────

function computeUtilization(
  bins: BinData[],
  radius: number,
  tvlUsd: number
): UtilizationResult {
  const activeBins = bins.filter((b) => b.distanceFromActive <= radius);
  const idleBins = bins.filter((b) => b.distanceFromActive > radius);

  const activeLiquidityUsd = activeBins.reduce((sum, b) => sum + b.totalUsd, 0);
  const idleLiquidityUsd = idleBins.reduce((sum, b) => sum + b.totalUsd, 0);
  const totalScannedUsd = activeLiquidityUsd + idleLiquidityUsd;

  // Use scanned total as denominator (more accurate than API TVL for bin-level analysis)
  const denominator = totalScannedUsd > 0 ? totalScannedUsd : tvlUsd || 1;
  const effectiveTvlPct = Math.round((activeLiquidityUsd / denominator) * 1000) / 10;

  // Capital efficiency score
  const tvlRatioScore = Math.min((activeLiquidityUsd / denominator) * 100, 100);

  // Proximity score — how close is liquidity to active bin
  const totalWeight = bins.reduce((sum, b) => sum + b.totalUsd, 0);
  const weightedDistance = totalWeight > 0
    ? bins.reduce((sum, b) => sum + b.totalUsd * b.distanceFromActive, 0) / totalWeight
    : radius;
  const proximityScore = Math.max(0, 100 - (weightedDistance / radius) * 50);

  // Bin count efficiency — not too many bins with tiny amounts
  const significantBins = bins.filter((b) => b.totalUsd > denominator * 0.01).length;
  const binEfficiency = bins.length > 0
    ? Math.min((significantBins / bins.length) * 100, 100)
    : 50;

  const capitalEfficiencyScore = Math.round(
    tvlRatioScore * 0.45 +
    computeConcentrationScore(bins) * 0.25 +
    proximityScore * 0.20 +
    binEfficiency * 0.10
  );

  return {
    totalBinsWithLiquidity: bins.length,
    activeBins: activeBins.length,
    idleBins: idleBins.length,
    activeLiquidityUsd: Math.round(activeLiquidityUsd),
    idleLiquidityUsd: Math.round(idleLiquidityUsd),
    effectiveTvlPct,
    capitalEfficiencyScore,
  };
}

function computeConcentrationScore(bins: BinData[]): number {
  const gini = computeGini(bins.map((b) => b.totalUsd));
  // Ideal Gini is 0.3-0.5 (moderate concentration)
  if (gini >= 0.3 && gini <= 0.5) return 100;
  if (gini < 0.3) return 50 + (gini / 0.3) * 50; // too dispersed
  return Math.max(0, 100 - (gini - 0.5) * 200); // too concentrated
}

function computeGini(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const total = sorted.reduce((s, v) => s + v, 0);
  if (total === 0) return 0;

  let sumOfDiffs = 0;
  for (let i = 0; i < n; i++) {
    sumOfDiffs += (2 * (i + 1) - n - 1) * sorted[i];
  }
  return sumOfDiffs / (n * total);
}

function computeConcentration(bins: BinData[]): ConcentrationResult {
  const gini = computeGini(bins.map((b) => b.totalUsd));
  const totalUsd = bins.reduce((s, b) => s + b.totalUsd, 0);

  const sorted = [...bins].sort((a, b) => b.totalUsd - a.totalUsd);
  const top5Usd = sorted.slice(0, 5).reduce((s, b) => s + b.totalUsd, 0);
  const top5Pct = totalUsd > 0 ? Math.round((top5Usd / totalUsd) * 1000) / 10 : 0;

  let profile: "CONCENTRATED" | "MODERATE" | "DISPERSED";
  if (gini > 0.6) profile = "CONCENTRATED";
  else if (gini < 0.3) profile = "DISPERSED";
  else profile = "MODERATE";

  return {
    giniCoefficient: Math.round(gini * 1000) / 1000,
    top5BinsPct: top5Pct,
    profile,
  };
}

function computeDeadCapital(
  bins: BinData[],
  radius: number,
  tvlUsd: number
): DeadCapitalResult {
  const idleBins = bins.filter((b) => b.distanceFromActive > radius);
  const farBins = bins.filter((b) => b.distanceFromActive > FAR_OUT_OF_RANGE_BINS);

  const totalIdleUsd = Math.round(idleBins.reduce((s, b) => s + b.totalUsd, 0));
  const farOutOfRange = Math.round(farBins.reduce((s, b) => s + b.totalUsd, 0));

  const totalScanned = bins.reduce((s, b) => s + b.totalUsd, 0);
  const denominator = totalScanned > 0 ? totalScanned : tvlUsd || 1;
  const idlePct = (totalIdleUsd / denominator) * 100;
  const farPct = (farOutOfRange / denominator) * 100;

  let recommendation: "HOLD" | "TIGHTEN" | "REBALANCE" | "URGENT";
  let reasoning: string;

  if (farPct > 20) {
    recommendation = "URGENT";
    reasoning = `${Math.round(farPct)}% of TVL far out of range (>${FAR_OUT_OF_RANGE_BINS} bins from active). Immediate rebalance recommended.`;
  } else if (idlePct > 50) {
    recommendation = "REBALANCE";
    reasoning = `${Math.round(idlePct)}% of TVL in idle bins. Most capital is not earning fees.`;
  } else if (idlePct > 20) {
    recommendation = "TIGHTEN";
    reasoning = `${Math.round(idlePct)}% of TVL in idle bins. ${Math.round(farPct)}% far out of range.`;
  } else {
    recommendation = "HOLD";
    reasoning = `Only ${Math.round(idlePct)}% of TVL in idle bins. Capital is well-deployed.`;
  }

  return { totalIdleUsd, farOutOfRange, recommendation, reasoning };
}

function classifyEfficiency(effectivePct: number): string {
  if (effectivePct >= HIGH_EFFICIENCY_THRESHOLD) return "HIGH_EFFICIENCY";
  if (effectivePct >= MODERATE_EFFICIENCY_THRESHOLD) return "MODERATE_EFFICIENCY";
  return "LOW_EFFICIENCY";
}

function generateReasoning(
  utilization: UtilizationResult,
  concentration: ConcentrationResult,
  deadCapital: DeadCapitalResult
): string[] {
  const reasons: string[] = [];

  reasons.push(
    `${utilization.effectiveTvlPct}% of TVL is actively earning fees (${utilization.activeBins} active bins, ${utilization.idleBins} idle).`
  );

  if (concentration.profile === "CONCENTRATED") {
    reasons.push(
      `Gini ${concentration.giniCoefficient} — highly concentrated. Top 5 bins hold ${concentration.top5BinsPct}% of liquidity.`
    );
  } else if (concentration.profile === "DISPERSED") {
    reasons.push(
      `Gini ${concentration.giniCoefficient} — dispersed liquidity. Capital may be too spread out.`
    );
  } else {
    reasons.push(
      `Gini ${concentration.giniCoefficient} — moderate concentration. Top 5 bins hold ${concentration.top5BinsPct}%.`
    );
  }

  if (deadCapital.totalIdleUsd > 0) {
    reasons.push(
      `$${deadCapital.totalIdleUsd.toLocaleString()} in idle bins. ${deadCapital.recommendation}: ${deadCapital.reasoning}`
    );
  }

  if (utilization.capitalEfficiencyScore >= 80) {
    reasons.push("Strong capital efficiency — liquidity well-positioned near active trading range.");
  } else if (utilization.capitalEfficiencyScore < 40) {
    reasons.push("Low capital efficiency — consider concentrating liquidity closer to active bin.");
  }

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
    // Test a read-only contract call
    const result = await callReadOnly("get-active-bin-id", [encodeUint(1)]);
    results["contract_read"] = result.result ? "ok" : "no result";
  } catch (e: any) {
    results["contract_read"] = `error: ${e.message}`;
  }

  console.log(
    JSON.stringify({
      tool: "hodlmm-bin-utilization",
      command: "doctor",
      status: Object.values(results).every((v) => v === "ok") ? "healthy" : "degraded",
      checks: results,
    })
  );
}

async function runInstallPacks(): Promise<void> {
  console.log(
    JSON.stringify({
      tool: "hodlmm-bin-utilization",
      command: "install-packs",
      status: "ok",
      message: "No additional dependencies required. Uses commander (workspace) + native fetch.",
    })
  );
}

async function runUtilizationAnalysis(options: {
  pool?: string;
  radius?: string;
}): Promise<void> {
  const poolQuery = options.pool || "sbtc-stx";
  const radius = options.radius ? parseInt(options.radius, 10) : DEFAULT_RADIUS;

  // 1. Fetch pool metadata
  const appPools = await fetchAppPools();
  if (appPools.length === 0) {
    console.log(
      JSON.stringify({ tool: "hodlmm-bin-utilization", error: "Could not fetch pool list from Bitflow API" })
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
    console.log(JSON.stringify({ tool: "hodlmm-bin-utilization", error: e.message }));
    return;
  }

  if (!appPool) {
    console.log(
      JSON.stringify({ tool: "hodlmm-bin-utilization", error: `Pool metadata not found for ${poolQuery}` })
    );
    return;
  }

  // 2. Get active bin
  const activeBinId = appPool.activeBinId || (await fetchActiveBin(poolId));
  if (!activeBinId) {
    console.log(
      JSON.stringify({ tool: "hodlmm-bin-utilization", error: `Could not determine active bin for pool ${poolId}` })
    );
    return;
  }

  // 3. Scan bins around active
  const bins = await scanBinsAroundActive(poolId, activeBinId, radius, appPool);

  // 4. Compute utilization metrics
  const tvlUsd = appPool.tvlUsd || 0;
  const utilization = computeUtilization(bins, radius, tvlUsd);
  const concentration = computeConcentration(bins);
  const deadCapital = computeDeadCapital(bins, radius, tvlUsd);
  const signal = classifyEfficiency(utilization.effectiveTvlPct);
  const reasoning = generateReasoning(utilization, concentration, deadCapital);

  console.log(
    JSON.stringify({
      tool: "hodlmm-bin-utilization",
      command: "run",
      pool: {
        id: poolId,
        pair: `${appPool.token0Symbol}-${appPool.token1Symbol}`,
        tvlUsd: Math.round(tvlUsd),
        activeBinId,
      },
      utilization,
      concentration,
      deadCapital,
      signal,
      reasoning,
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
  const sortBy = options.sort || "efficiency";

  const appPools = await fetchAppPools();
  if (appPools.length === 0) {
    console.log(
      JSON.stringify({ tool: "hodlmm-bin-utilization", error: "Could not fetch pool list from Bitflow API" })
    );
    return;
  }

  const hodlmmPools = appPools.filter((p) => p.poolId && p.poolId > 0 && p.tvlUsd >= MIN_TVL_USD);
  const analyses: Array<{
    pair: string;
    poolId: number;
    tvlUsd: number;
    activeBinId: number;
    effectiveTvlPct: number;
    capitalEfficiencyScore: number;
    idleUsd: number;
    idlePct: number;
    concentrationProfile: string;
    recommendation: string;
    signal: string;
  }> = [];

  for (const pool of hodlmmPools) {
    if (!pool.poolId) continue;

    const activeBinId = pool.activeBinId || (await fetchActiveBin(pool.poolId));
    if (!activeBinId) continue;

    const bins = await scanBinsAroundActive(pool.poolId, activeBinId, DEFAULT_RADIUS, pool);
    const tvl = pool.tvlUsd || 1;
    const utilization = computeUtilization(bins, DEFAULT_RADIUS, tvl);
    const concentration = computeConcentration(bins);
    const deadCapital = computeDeadCapital(bins, DEFAULT_RADIUS, tvl);

    analyses.push({
      pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
      poolId: pool.poolId,
      tvlUsd: Math.round(tvl),
      activeBinId,
      effectiveTvlPct: utilization.effectiveTvlPct,
      capitalEfficiencyScore: utilization.capitalEfficiencyScore,
      idleUsd: utilization.idleLiquidityUsd,
      idlePct: Math.round((utilization.idleLiquidityUsd / tvl) * 1000) / 10,
      concentrationProfile: concentration.profile,
      recommendation: deadCapital.recommendation,
      signal: classifyEfficiency(utilization.effectiveTvlPct),
    });
  }

  // Sort based on requested field
  let sorted: typeof analyses;
  switch (sortBy) {
    case "idle":
      sorted = analyses.sort((a, b) => b.idleUsd - a.idleUsd);
      break;
    case "tvl":
      sorted = analyses.sort((a, b) => b.tvlUsd - a.tvlUsd);
      break;
    default: // efficiency
      sorted = analyses.sort((a, b) => b.capitalEfficiencyScore - a.capitalEfficiencyScore);
  }

  const ranked = sorted.slice(0, topN).map((a, i) => ({ rank: i + 1, ...a }));

  console.log(
    JSON.stringify({
      tool: "hodlmm-bin-utilization",
      command: "scan",
      poolsAnalyzed: analyses.length,
      sortBy,
      topPools: ranked,
      summary: {
        avgEfficiency: analyses.length > 0
          ? Math.round(analyses.reduce((s, a) => s + a.capitalEfficiencyScore, 0) / analyses.length)
          : 0,
        highEfficiencyCount: analyses.filter((a) => a.signal === "HIGH_EFFICIENCY").length,
        moderateCount: analyses.filter((a) => a.signal === "MODERATE_EFFICIENCY").length,
        lowEfficiencyCount: analyses.filter((a) => a.signal === "LOW_EFFICIENCY").length,
        urgentRebalanceCount: analyses.filter((a) => a.recommendation === "URGENT").length,
      },
      timestamp: new Date().toISOString(),
    })
  );
}

// ── CLI Setup ──────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-bin-utilization")
  .description("HODLMM Bin Utilization Monitor — Capital efficiency tracking, dead capital detection, effective TVL analysis")
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
  .description("Analyze bin utilization for a specific pool")
  .option("--pool <id>", "Pool ID or token pair name (e.g., sbtc-stx, 1)", "sbtc-stx")
  .option("--radius <n>", "Bins around active bin considered 'in range'", String(DEFAULT_RADIUS))
  .action(runUtilizationAnalysis);

program
  .command("scan")
  .description("Scan all HODLMM pools for capital efficiency")
  .option("--top <n>", "Number of pools to show", "10")
  .option("--sort <field>", "Sort by: efficiency, idle, tvl", "efficiency")
  .action(runScanAll);

program.parse();
