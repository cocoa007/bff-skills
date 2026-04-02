#!/usr/bin/env bun
/**
 * hodlmm-position-health.ts
 *
 * HODLMM Position Health — Unified health monitor for concentrated LP positions.
 * Combines drift, IL exposure, fee efficiency, volatility regime, and flow momentum
 * into a single composite health score (0-100) with traffic-light status.
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 25).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78"; // Read-only sender

const TOOL_NAME = "hodlmm-position-health";
const BIN_STEP_PRICE_FACTOR = 0.0001; // Each bin step ~ 0.01% price change (base)
const DEFAULT_SCAN_RANGE = 20; // bins on each side of active for full analysis

// ── Dimension Weights ──────────────────────────────────────────────────────────

const WEIGHTS = {
  drift: 0.25,
  ilExposure: 0.20,
  feeEfficiency: 0.25,
  volatility: 0.15,
  flowMomentum: 0.15,
} as const;

// ── Composite Thresholds ───────────────────────────────────────────────────────

type HealthStatus = "HEALTHY" | "CAUTION" | "WARNING" | "CRITICAL";

function classifyHealth(score: number): HealthStatus {
  if (score >= 75) return "HEALTHY";
  if (score >= 50) return "CAUTION";
  if (score >= 25) return "WARNING";
  return "CRITICAL";
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface AppPool {
  id: string;
  token0Symbol: string;
  token1Symbol: string;
  tvlUsd: number;
  volume24hUsd: number;
  feesUsd1d: number;
  feesUsd7d: number;
  volumeUsd1d: number;
  volumeUsd7d: number;
  apr: number;
  apr24h: number;
  poolId?: number;
  token0Decimals: number;
  token1Decimals: number;
  token0PriceUsd: number;
  token1PriceUsd: number;
}

interface HodlmmPool {
  id: string;
  poolId?: number;
  token0Symbol: string;
  token1Symbol: string;
  tvlUsd: number;
  volume24hUsd: number;
  feesUsd1d: number;
  feesUsd7d: number;
  volumeUsd1d: number;
  volumeUsd7d: number;
  apr: number;
  apr24h: number;
  token0Decimals: number;
  token1Decimals: number;
  token0PriceUsd: number;
  token1PriceUsd: number;
}

interface BinData {
  binId: number;
  reserveX: number;
  reserveY: number;
  distanceFromActive: number;
}

interface DimensionResult {
  score: number;
  weight: number;
  detail: string;
}

interface HealthReport {
  compositeScore: number;
  status: HealthStatus;
  dimensions: {
    drift: DimensionResult;
    ilExposure: DimensionResult;
    feeEfficiency: DimensionResult;
    volatility: DimensionResult;
    flowMomentum: DimensionResult;
  };
  weakestDimension: string;
  recommendations: string[];
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

function pricePctFromBinDistance(distance: number, binStep: number): number {
  return Math.abs(distance) * binStep * BIN_STEP_PRICE_FACTOR * 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function jsonOut(obj: Record<string, any>): void {
  console.log(JSON.stringify(obj));
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

async function fetchHodlmmPools(): Promise<HodlmmPool[]> {
  try {
    const resp = await fetchJson(`${BFF_APP_BASE}/hodlmm/pools`);
    const pools = resp.data || resp.pools || resp || [];
    return Array.isArray(pools) ? pools : [];
  } catch {
    return [];
  }
}

async function resolvePool(
  query: string,
  appPools: AppPool[],
  hodlmmPools: HodlmmPool[]
): Promise<{ poolId: number; appPool: AppPool | null; hodlmmPool: HodlmmPool | null }> {
  // Try numeric ID first
  const asNum = parseInt(query, 10);
  if (!isNaN(asNum) && asNum > 0) {
    const appMatch = appPools.find((p) => p.poolId === asNum);
    const hodlmmMatch = hodlmmPools.find((p) => p.poolId === asNum);
    return { poolId: asNum, appPool: appMatch || null, hodlmmPool: hodlmmMatch || null };
  }

  // Token pair name matching
  const q = query.toLowerCase().replace(/[^a-z0-9]/g, "");
  const matchPool = (p: { token0Symbol: string; token1Symbol: string }) => {
    const pair = `${p.token0Symbol}${p.token1Symbol}`.toLowerCase().replace(/[^a-z0-9]/g, "");
    const pairRev = `${p.token1Symbol}${p.token0Symbol}`.toLowerCase().replace(/[^a-z0-9]/g, "");
    return pair.includes(q) || pairRev.includes(q) || q.includes(pair) || q.includes(pairRev);
  };

  // Prefer HODLMM pools, fall back to app pools
  const hodlmmMatch = hodlmmPools.find(matchPool);
  if (hodlmmMatch && hodlmmMatch.poolId) {
    const appMatch = appPools.find((p) => p.poolId === hodlmmMatch.poolId);
    return { poolId: hodlmmMatch.poolId, appPool: appMatch || null, hodlmmPool: hodlmmMatch };
  }

  const appMatch = appPools.find(matchPool);
  if (appMatch && appMatch.poolId) {
    return { poolId: appMatch.poolId, appPool: appMatch, hodlmmPool: null };
  }

  throw new Error(`Pool not found: ${query}`);
}

async function fetchOnChainPool(poolId: number): Promise<{ activeBinId: number; binStep: number }> {
  const result = await callReadOnly("get-pool", [encodeUint(poolId)]);
  const text = JSON.stringify(result);
  const activeBinId = parseUintFromResult(text, "active-bin-id");
  const binStep = parseUintFromResult(text, "bin-step");
  if (activeBinId === null || binStep === null) {
    throw new Error(`Failed to parse pool ${poolId} on-chain data`);
  }
  return { activeBinId, binStep };
}

async function fetchBinReserves(
  poolId: number,
  activeBinId: number,
  range: number
): Promise<BinData[]> {
  const bins: BinData[] = [];
  const startBin = activeBinId - range;
  const endBin = activeBinId + range;

  const batchSize = 5;
  for (let i = startBin; i <= endBin; i += batchSize) {
    const batch: number[] = [];
    for (let j = i; j < Math.min(i + batchSize, endBin + 1); j++) {
      batch.push(j);
    }

    const results = await Promise.all(
      batch.map(async (binId) => {
        try {
          const result = await callReadOnly("get-bin", [encodeUint(poolId), encodeUint(binId)]);
          const text = JSON.stringify(result);
          const reserveX = parseUintFromResult(text, "reserve-x") || 0;
          const reserveY = parseUintFromResult(text, "reserve-y") || 0;
          return {
            binId,
            reserveX,
            reserveY,
            distanceFromActive: binId - activeBinId,
          };
        } catch {
          return {
            binId,
            reserveX: 0,
            reserveY: 0,
            distanceFromActive: binId - activeBinId,
          };
        }
      })
    );
    bins.push(...results);
  }
  return bins;
}

// ── Dimension Scorers ──────────────────────────────────────────────────────────

/**
 * Drift Score (0-100)
 * Measures how far the active bin has drifted from the position's center bin.
 * 100 = active bin IS the center bin. Decays as distance increases.
 */
function scoreDrift(
  activeBinId: number,
  centerBinId: number,
  binStep: number
): DimensionResult {
  const distance = Math.abs(activeBinId - centerBinId);
  const priceDrift = pricePctFromBinDistance(distance, binStep);

  // Score decays: 100 at 0 drift, ~50 at 10 bins, ~0 at 25+ bins
  let score: number;
  if (distance === 0) {
    score = 100;
  } else if (distance <= 3) {
    score = 95 - distance * 5; // 90, 85, 80
  } else if (distance <= 10) {
    score = 80 - (distance - 3) * 5; // 75 -> 45
  } else if (distance <= 25) {
    score = 45 - (distance - 10) * 3; // 42 -> 0
  } else {
    score = 0;
  }
  score = clamp(score, 0, 100);

  const direction = activeBinId > centerBinId ? "above" : activeBinId < centerBinId ? "below" : "at";
  const detail =
    distance === 0
      ? "Active bin is at position center"
      : `Active bin ${distance} bins ${direction} center (${priceDrift.toFixed(2)}% price drift)`;

  return { score: Math.round(score), weight: WEIGHTS.drift, detail };
}

/**
 * IL Exposure Score (0-100)
 * Measures impermanent loss risk via reserve asymmetry.
 * 100 = perfectly balanced X/Y reserves. 0 = fully one-sided.
 */
function scoreILExposure(bins: BinData[]): DimensionResult {
  let totalX = 0;
  let totalY = 0;
  for (const b of bins) {
    totalX += b.reserveX;
    totalY += b.reserveY;
  }
  const total = totalX + totalY;

  if (total === 0) {
    return {
      score: 50,
      weight: WEIGHTS.ilExposure,
      detail: "No reserves detected — cannot assess IL exposure",
    };
  }

  const ratio = totalX / total; // 0 = all Y, 1 = all X, 0.5 = balanced
  const skew = Math.abs(ratio - 0.5) * 2; // 0 = balanced, 1 = fully one-sided

  // Score: 100 at balanced, decays with skew
  // skew 0 -> 100, skew 0.3 -> ~70, skew 0.6 -> ~40, skew 1.0 -> 0
  const score = clamp(Math.round(100 * (1 - skew)), 0, 100);

  const xPct = Math.round(ratio * 100);
  const dominantSide = skew < 0.15 ? "balanced" : ratio > 0.5 ? "X" : "Y";
  const detail =
    dominantSide === "balanced"
      ? `Balanced reserves (${xPct}% X / ${100 - xPct}% Y)`
      : `${dominantSide === "X" ? "Moderate" : "Moderate"} ${dominantSide}-side skew (${xPct}% X / ${100 - xPct}% Y)`;

  return { score, weight: WEIGHTS.ilExposure, detail };
}

/**
 * Fee Efficiency Score (0-100)
 * Measures fee generation relative to TVL. Higher volume/TVL = more efficient.
 */
function scoreFeeEfficiency(pool: {
  tvlUsd: number;
  volume24hUsd?: number;
  volumeUsd1d?: number;
  feesUsd1d?: number;
  feesUsd7d?: number;
  apr?: number;
  apr24h?: number;
}): DimensionResult {
  const tvl = pool.tvlUsd || 0;
  const volume = pool.volume24hUsd || pool.volumeUsd1d || 0;
  const fees1d = pool.feesUsd1d || 0;
  const fees7d = pool.feesUsd7d || 0;
  const apr = pool.apr || 0;
  const apr24h = pool.apr24h || 0;

  if (tvl === 0) {
    return {
      score: 0,
      weight: WEIGHTS.feeEfficiency,
      detail: "Zero TVL — no fee efficiency measurable",
    };
  }

  // Primary signal: volume/TVL ratio (daily turnover)
  const volumeTvlRatio = volume / tvl;

  // Secondary signal: fee velocity (1d fees vs 7d daily average)
  const avgDailyFees = fees7d / 7;
  const feeVelocity = avgDailyFees > 0 ? fees1d / avgDailyFees : 1;

  // Tertiary signal: APR health
  const aprRatio = apr > 0 ? apr24h / apr : 1;

  // Scoring:
  // volumeTvlRatio: 0.5+ is excellent, 0.1 is decent, <0.01 is poor
  let volScore: number;
  if (volumeTvlRatio >= 0.5) volScore = 100;
  else if (volumeTvlRatio >= 0.2) volScore = 70 + (volumeTvlRatio - 0.2) / 0.3 * 30;
  else if (volumeTvlRatio >= 0.05) volScore = 40 + (volumeTvlRatio - 0.05) / 0.15 * 30;
  else volScore = volumeTvlRatio / 0.05 * 40;

  // Fee velocity multiplier (boosts/penalizes based on trend)
  const velocityMult = clamp(feeVelocity, 0.5, 2.0);
  const adjustedScore = volScore * (0.5 + velocityMult * 0.25);

  // APR ratio minor adjustment
  const aprAdj = aprRatio > 1.5 ? 5 : aprRatio < 0.5 ? -5 : 0;

  const score = clamp(Math.round(adjustedScore + aprAdj), 0, 100);

  const detail = `Volume/TVL ratio ${volumeTvlRatio.toFixed(3)}, fee velocity ${feeVelocity.toFixed(2)}x`;
  return { score, weight: WEIGHTS.feeEfficiency, detail };
}

/**
 * Volatility Score (0-100)
 * Higher score = LOWER volatility = healthier for LP.
 * Inverted from volatility-gauge: low vol = high health score.
 */
function scoreVolatility(
  bins: BinData[],
  activeBinId: number,
  pool: { volume24hUsd?: number; volumeUsd1d?: number; tvlUsd: number }
): DimensionResult {
  const totalBins = bins.length;
  const nonEmptyBins = bins.filter((b) => b.reserveX + b.reserveY > 0).length;
  const emptyRatio = totalBins > 0 ? (totalBins - nonEmptyBins) / totalBins : 0;

  // Concentration: % of reserves in active +/- 2 bins
  const totalReserve = bins.reduce((s, b) => s + b.reserveX + b.reserveY, 0);
  let concentration = 0;
  if (totalReserve > 0) {
    const nearReserve = bins
      .filter((b) => Math.abs(b.binId - activeBinId) <= 2)
      .reduce((s, b) => s + b.reserveX + b.reserveY, 0);
    concentration = nearReserve / totalReserve;
  }

  // Reserve spread (coefficient of variation)
  const nonEmpty = bins.filter((b) => b.reserveX + b.reserveY > 0);
  let spreadCV = 0;
  if (nonEmpty.length >= 2) {
    const mean = totalReserve / nonEmpty.length;
    let variance = 0;
    for (const b of nonEmpty) {
      const diff = b.reserveX + b.reserveY - mean;
      variance += diff * diff;
    }
    variance /= nonEmpty.length;
    spreadCV = mean > 0 ? Math.sqrt(variance) / mean : 0;
  }

  // Volume/TVL ratio as realized volatility proxy
  const volume = pool.volume24hUsd || pool.volumeUsd1d || 0;
  const tvl = pool.tvlUsd || 1;
  const volTvlRatio = volume / tvl;

  // Compute raw volatility score (higher = more volatile)
  let rawVol = 0;
  rawVol += (1 - concentration) * 25;
  rawVol += Math.min(spreadCV / 3, 1) * 20;
  rawVol += emptyRatio * 15;
  rawVol += Math.min(volTvlRatio / 2, 1) * 20;

  // Asymmetry adds to volatility
  let totalX = 0;
  let totalY = 0;
  for (const b of bins) {
    totalX += b.reserveX;
    totalY += b.reserveY;
  }
  const total = totalX + totalY;
  const skew = total > 0 ? Math.abs(totalX / total - 0.5) * 2 : 0;
  rawVol += skew * 20;

  rawVol = clamp(rawVol, 0, 100);

  // INVERT: low volatility = high health score
  const score = Math.round(100 - rawVol);

  const regime =
    rawVol < 25 ? "LOW" : rawVol < 50 ? "MODERATE" : rawVol < 75 ? "HIGH" : "EXTREME";
  const detail = `${regime} regime (raw vol ${Math.round(rawVol)}/100, concentration ${Math.round(concentration * 100)}%)`;

  return { score, weight: WEIGHTS.volatility, detail };
}

/**
 * Volatility Score (lightweight) — used in check mode without bin data.
 * Approximates from pool-level metrics only.
 */
function scoreVolatilityLight(pool: {
  volume24hUsd?: number;
  volumeUsd1d?: number;
  tvlUsd: number;
  apr?: number;
  apr24h?: number;
}): DimensionResult {
  const volume = pool.volume24hUsd || pool.volumeUsd1d || 0;
  const tvl = pool.tvlUsd || 1;
  const volTvlRatio = volume / tvl;
  const apr = pool.apr || 0;
  const apr24h = pool.apr24h || 0;

  // Volume/TVL as vol proxy
  let rawVol = Math.min(volTvlRatio / 2, 1) * 50;

  // APR spike as vol proxy
  if (apr > 0 && apr24h > 0) {
    const aprDelta = Math.abs(apr24h / apr - 1);
    rawVol += Math.min(aprDelta, 2) * 25;
  }

  rawVol = clamp(rawVol, 0, 100);
  const score = Math.round(100 - rawVol);
  const regime =
    rawVol < 25 ? "LOW" : rawVol < 50 ? "MODERATE" : rawVol < 75 ? "HIGH" : "EXTREME";

  return {
    score,
    weight: WEIGHTS.volatility,
    detail: `${regime} regime (approximate, vol/TVL ${volTvlRatio.toFixed(3)})`,
  };
}

/**
 * Flow Momentum Score (0-100)
 * Measures net liquidity flow direction. Inflows = healthy, outflows = risk.
 * Uses TVL trend approximation from fee/volume patterns.
 */
function scoreFlowMomentum(pool: {
  tvlUsd: number;
  feesUsd1d?: number;
  feesUsd7d?: number;
  volumeUsd1d?: number;
  volumeUsd7d?: number;
}): DimensionResult {
  const fees1d = pool.feesUsd1d || 0;
  const fees7d = pool.feesUsd7d || 0;
  const vol1d = pool.volumeUsd1d || 0;
  const vol7d = pool.volumeUsd7d || 0;
  const tvl = pool.tvlUsd || 0;

  // Fee velocity: >1 means fees accelerating (implies growing activity/TVL)
  const avgDailyFees = fees7d / 7;
  const feeVelocity = avgDailyFees > 0 ? fees1d / avgDailyFees : 1;

  // Volume velocity
  const avgDailyVol = vol7d / 7;
  const volVelocity = avgDailyVol > 0 ? vol1d / avgDailyVol : 1;

  // Combined momentum signal
  // velocity > 1 = accelerating = likely inflows (score up)
  // velocity < 1 = decelerating = likely outflows (score down)
  const combinedVelocity = feeVelocity * 0.6 + volVelocity * 0.4;

  // Map velocity to score: 0.5x -> ~30, 1.0x -> ~65, 2.0x -> ~90, 3.0x -> 100
  let score: number;
  if (combinedVelocity >= 3.0) {
    score = 100;
  } else if (combinedVelocity >= 1.5) {
    score = 80 + (combinedVelocity - 1.5) / 1.5 * 20;
  } else if (combinedVelocity >= 1.0) {
    score = 65 + (combinedVelocity - 1.0) / 0.5 * 15;
  } else if (combinedVelocity >= 0.5) {
    score = 30 + (combinedVelocity - 0.5) / 0.5 * 35;
  } else {
    score = combinedVelocity / 0.5 * 30;
  }
  score = clamp(Math.round(score), 0, 100);

  const flowDirection =
    combinedVelocity >= 1.2
      ? "net inflow (accumulation)"
      : combinedVelocity >= 0.8
        ? "neutral flow"
        : "net outflow (distribution)";

  const detail = `${flowDirection}, combined velocity ${combinedVelocity.toFixed(2)}x`;
  return { score, weight: WEIGHTS.flowMomentum, detail };
}

// ── Composite Health ───────────────────────────────────────────────────────────

function computeCompositeHealth(dimensions: {
  drift: DimensionResult;
  ilExposure: DimensionResult;
  feeEfficiency: DimensionResult;
  volatility: DimensionResult;
  flowMomentum: DimensionResult;
}): HealthReport {
  const entries = Object.entries(dimensions) as [string, DimensionResult][];

  // Weighted composite
  let compositeScore = 0;
  for (const [, dim] of entries) {
    compositeScore += dim.score * dim.weight;
  }
  compositeScore = Math.round(clamp(compositeScore, 0, 100));

  const status = classifyHealth(compositeScore);

  // Find weakest dimension
  let weakest = entries[0];
  for (const entry of entries) {
    if (entry[1].score < weakest[1].score) {
      weakest = entry;
    }
  }

  // Generate recommendations
  const recommendations = generateRecommendations(status, dimensions, weakest[0]);

  return {
    compositeScore,
    status,
    dimensions,
    weakestDimension: weakest[0],
    recommendations,
  };
}

function generateRecommendations(
  status: HealthStatus,
  dimensions: {
    drift: DimensionResult;
    ilExposure: DimensionResult;
    feeEfficiency: DimensionResult;
    volatility: DimensionResult;
    flowMomentum: DimensionResult;
  },
  weakestDim: string
): string[] {
  const recs: string[] = [];

  if (status === "CRITICAL") {
    recs.push("URGENT: Position health is critical. Evaluate immediate exit or emergency rebalance.");
  }

  if (dimensions.drift.score < 30) {
    recs.push(
      "Drift is severe — active bin has moved significantly from position center. Rebalancing recommended."
    );
  } else if (dimensions.drift.score < 50) {
    recs.push("Drift is elevated — monitor for further movement away from center bin.");
  }

  if (dimensions.ilExposure.score < 30) {
    recs.push(
      "IL exposure is high — reserves are heavily one-sided. Consider reducing range or partial exit."
    );
  } else if (dimensions.ilExposure.score < 50) {
    recs.push("IL exposure is moderate — reserve asymmetry building. Watch for directional continuation.");
  }

  if (dimensions.feeEfficiency.score < 30) {
    recs.push(
      "Fee efficiency is poor — low volume relative to TVL. Consider migrating to a more active pool."
    );
  } else if (dimensions.feeEfficiency.score < 50) {
    recs.push("Fee efficiency is below average — volume may be declining. Cross-check with hodlmm-pulse.");
  }

  if (dimensions.volatility.score < 30) {
    recs.push(
      "Volatility is extreme — widen range significantly or reduce position size to limit IL."
    );
  } else if (dimensions.volatility.score < 50) {
    recs.push("Volatility is elevated — consider widening range for IL protection.");
  }

  if (dimensions.flowMomentum.score < 30) {
    recs.push(
      "Liquidity outflows detected — other LPs may be exiting. Evaluate whether to follow."
    );
  } else if (dimensions.flowMomentum.score < 50) {
    recs.push("Flow momentum is weakening — activity declining relative to 7-day average.");
  }

  if (status === "HEALTHY" && recs.length === 0) {
    recs.push("Position is healthy across all dimensions. Continue monitoring at standard cadence.");
  }

  if (recs.length === 0) {
    recs.push(`Weakest dimension is ${weakestDim} — monitor for further deterioration.`);
  }

  return recs;
}

// ── Command Handlers ───────────────────────────────────────────────────────────

async function runDoctor(): Promise<void> {
  const results: Record<string, string> = {};

  // Check Bitflow App API
  try {
    const pools = await fetchJson(`${BFF_APP_BASE}/pools`);
    const count = Array.isArray(pools?.data || pools?.pools || pools) ? "ok" : "ok (format unknown)";
    results["bitflow_app_api"] = count;
  } catch (e: any) {
    results["bitflow_app_api"] = `error: ${e.message}`;
  }

  // Check Bitflow HODLMM API
  try {
    await fetchJson(`${BFF_APP_BASE}/hodlmm/pools`);
    results["bitflow_hodlmm_api"] = "ok";
  } catch (e: any) {
    results["bitflow_hodlmm_api"] = `error: ${e.message}`;
  }

  // Check Hiro API
  try {
    await fetchJson(`${HIRO_API}/v2/info`);
    results["hiro_api"] = "ok";
  } catch (e: any) {
    results["hiro_api"] = `error: ${e.message}`;
  }

  // Check DLMM contract read-only
  try {
    await callReadOnly("get-pool", [encodeUint(1)]);
    results["dlmm_contract"] = "ok";
  } catch (e: any) {
    results["dlmm_contract"] = `degraded: ${e.message} (known issue with read-only sender)`;
  }

  const allOk = Object.values(results).every((v) => v === "ok");
  const hasCritical =
    results["bitflow_app_api"]?.startsWith("error") ||
    results["hiro_api"]?.startsWith("error");

  jsonOut({
    tool: TOOL_NAME,
    command: "doctor",
    status: allOk ? "healthy" : hasCritical ? "degraded" : "partial",
    checks: results,
    note: results["dlmm_contract"]?.startsWith("degraded")
      ? "DLMM read-only calls may fail — check/run modes will use Bitflow API fallback"
      : undefined,
  });
}

async function runCheck(options: { pool?: string }): Promise<void> {
  const poolQuery = options.pool || "sbtc-stx";

  // Fetch pool data from both APIs
  const [appPools, hodlmmPools] = await Promise.all([fetchAppPools(), fetchHodlmmPools()]);

  if (appPools.length === 0 && hodlmmPools.length === 0) {
    jsonOut({ tool: TOOL_NAME, error: "Could not fetch pool data from Bitflow API" });
    return;
  }

  // Resolve pool
  let poolId: number;
  let appPool: AppPool | null;
  let hodlmmPool: HodlmmPool | null;
  try {
    const resolved = await resolvePool(poolQuery, appPools, hodlmmPools);
    poolId = resolved.poolId;
    appPool = resolved.appPool;
    hodlmmPool = resolved.hodlmmPool;
  } catch (e: any) {
    jsonOut({ tool: TOOL_NAME, error: e.message });
    return;
  }

  const poolData = hodlmmPool || appPool;
  if (!poolData) {
    jsonOut({ tool: TOOL_NAME, error: `No data found for pool ${poolQuery}` });
    return;
  }

  // Try to get on-chain data for drift calculation
  let activeBinId: number | null = null;
  let binStep: number | null = null;
  try {
    const onChain = await fetchOnChainPool(poolId);
    activeBinId = onChain.activeBinId;
    binStep = onChain.binStep;
  } catch {
    // Graceful fallback — drift dimension will use neutral score
  }

  // Score each dimension (lightweight mode — no bin scanning)
  const drift: DimensionResult =
    activeBinId !== null && binStep !== null
      ? scoreDrift(activeBinId, activeBinId, binStep) // No center override in check, assume active = center
      : { score: 75, weight: WEIGHTS.drift, detail: "On-chain data unavailable — using neutral estimate" };

  const ilExposure: DimensionResult = {
    score: 65,
    weight: WEIGHTS.ilExposure,
    detail: "Approximate — full bin scan needed for precise IL assessment (use run command)",
  };

  const feeEfficiency = scoreFeeEfficiency(poolData);
  const volatility = scoreVolatilityLight(poolData);
  const flowMomentum = scoreFlowMomentum(poolData);

  const health = computeCompositeHealth({
    drift,
    ilExposure,
    feeEfficiency,
    volatility,
    flowMomentum,
  });

  const pair = `${poolData.token0Symbol}-${poolData.token1Symbol}`;

  jsonOut({
    tool: TOOL_NAME,
    command: "check",
    mode: "lightweight",
    pool: {
      id: poolId,
      pair,
      tvlUsd: poolData.tvlUsd,
      volume24hUsd: poolData.volume24hUsd || poolData.volumeUsd1d || 0,
    },
    health,
    note: activeBinId === null
      ? "On-chain data unavailable — drift and IL scores are approximations. Use 'run' for full analysis."
      : "Lightweight check — IL uses estimate. Use 'run' for full bin-level analysis.",
    timestamp: new Date().toISOString(),
  });
}

async function runFull(options: { pool?: string; center?: string }): Promise<void> {
  const poolQuery = options.pool || "sbtc-stx";

  // 1. Fetch pool data from both APIs
  const [appPools, hodlmmPools] = await Promise.all([fetchAppPools(), fetchHodlmmPools()]);

  if (appPools.length === 0 && hodlmmPools.length === 0) {
    jsonOut({ tool: TOOL_NAME, error: "Could not fetch pool data from Bitflow API" });
    return;
  }

  // 2. Resolve pool
  let poolId: number;
  let appPool: AppPool | null;
  let hodlmmPool: HodlmmPool | null;
  try {
    const resolved = await resolvePool(poolQuery, appPools, hodlmmPools);
    poolId = resolved.poolId;
    appPool = resolved.appPool;
    hodlmmPool = resolved.hodlmmPool;
  } catch (e: any) {
    jsonOut({ tool: TOOL_NAME, error: e.message });
    return;
  }

  const poolData = hodlmmPool || appPool;
  if (!poolData) {
    jsonOut({ tool: TOOL_NAME, error: `No data found for pool ${poolQuery}` });
    return;
  }

  // 3. Fetch on-chain pool state
  let activeBinId: number;
  let binStep: number;
  try {
    const onChain = await fetchOnChainPool(poolId);
    activeBinId = onChain.activeBinId;
    binStep = onChain.binStep;
  } catch (e: any) {
    // Fallback to check mode
    jsonOut({
      tool: TOOL_NAME,
      command: "run",
      fallback: true,
      warning: `On-chain data unavailable: ${e.message}. Falling back to lightweight check mode.`,
    });
    await runCheck(options);
    return;
  }

  // 4. Determine center bin
  const centerBinId = options.center ? parseInt(options.center, 10) : activeBinId;
  if (isNaN(centerBinId)) {
    jsonOut({ tool: TOOL_NAME, error: `Invalid center bin: ${options.center}` });
    return;
  }

  // 5. Scan bin reserves
  const bins = await fetchBinReserves(poolId, activeBinId, DEFAULT_SCAN_RANGE);

  // 6. Score all five dimensions
  const drift = scoreDrift(activeBinId, centerBinId, binStep);
  const ilExposure = scoreILExposure(bins);
  const feeEfficiency = scoreFeeEfficiency(poolData);
  const volatility = scoreVolatility(bins, activeBinId, poolData);
  const flowMomentum = scoreFlowMomentum(poolData);

  // 7. Compute composite health
  const health = computeCompositeHealth({
    drift,
    ilExposure,
    feeEfficiency,
    volatility,
    flowMomentum,
  });

  const pair = `${poolData.token0Symbol}-${poolData.token1Symbol}`;

  // 8. Bin summary stats
  const totalBins = bins.length;
  const nonEmptyBins = bins.filter((b) => b.reserveX + b.reserveY > 0).length;
  const totalReserveX = bins.reduce((s, b) => s + b.reserveX, 0);
  const totalReserveY = bins.reduce((s, b) => s + b.reserveY, 0);

  jsonOut({
    tool: TOOL_NAME,
    command: "run",
    mode: "full",
    pool: {
      id: poolId,
      pair,
      tvlUsd: poolData.tvlUsd,
      volume24hUsd: poolData.volume24hUsd || poolData.volumeUsd1d || 0,
      activeBinId,
      binStep,
    },
    position: {
      centerBinId,
      driftBins: Math.abs(activeBinId - centerBinId),
      driftDirection: activeBinId > centerBinId ? "up" : activeBinId < centerBinId ? "down" : "centered",
      driftPricePct: pricePctFromBinDistance(Math.abs(activeBinId - centerBinId), binStep),
    },
    scan: {
      range: DEFAULT_SCAN_RANGE,
      totalBins,
      nonEmptyBins,
      totalReserveX,
      totalReserveY,
    },
    health,
    timestamp: new Date().toISOString(),
  });
}

// ── CLI Setup ──────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-position-health")
  .description(
    "HODLMM Position Health — Unified health monitor for concentrated LP positions"
  )
  .version("1.0.0");

program
  .command("doctor")
  .description("Check API connectivity and data source availability")
  .action(runDoctor);

program
  .command("check")
  .description("Quick health summary (lightweight, no bin scanning)")
  .option("--pool <id>", "Pool ID or token pair name", "sbtc-stx")
  .action(runCheck);

program
  .command("run")
  .description("Full health analysis with on-chain bin scanning")
  .option("--pool <id>", "Pool ID or token pair name", "sbtc-stx")
  .option("--center <bin>", "Center bin of your position (default: current active bin)")
  .action(runFull);

program.parse();
