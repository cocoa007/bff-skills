#!/usr/bin/env bun
/**
 * hodlmm-spread-analyzer.ts
 *
 * HODLMM Spread Analyzer — Bid-ask spread measurement for HODLMM pools.
 * Analyzes reserve distribution around the active bin to compute effective spread,
 * size-dependent spread impact, and overall execution quality scoring.
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 29).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const SCAN_RADIUS = 15; // bins each direction from active
const DEFAULT_SIZES = [100, 500, 1000, 5000];

// Bin step: each bin represents a ~0.01% price increment (basis point step)
// For DLMM pools, price ratio between adjacent bins = (1 + binStep/10000)
// Default binStep is typically 1-100 depending on pool configuration
const DEFAULT_BIN_STEP_BPS = 10; // conservative estimate for spread calc

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

interface SpreadResult {
  effectiveSpreadBps: number;
  bidReservesUsd: number;
  askReservesUsd: number;
  midPriceBinId: number;
  tightestBidBin: number;
  tightestAskBin: number;
}

interface SizeImpactEntry {
  tradeSizeUsd: number;
  spreadBps: number;
  spreadCostUsd: number;
  binsConsumed: number;
}

interface GapInfo {
  startBin: number;
  endBin: number;
  gapBins: number;
  side: "bid" | "ask";
  distanceFromActive: number;
}

interface QualityResult {
  tightnessScore: number;
  grade: "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "ILLIQUID";
  spreadToFeeRatio: number;
  emptyBinGaps: number;
  depthBalance: number;
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

// ── Analysis Functions ─────────────────────────────────────────────────────────

function computeEffectiveSpread(
  bins: BinReserves[],
  activeBinId: number,
  binStepBps: number
): SpreadResult {
  // Bid side: bins at or below active (contain token Y = quote token ready to buy X)
  // Ask side: bins at or above active (contain token X = base token ready to sell)
  const bidBins = bins
    .filter((b) => b.binId <= activeBinId && b.reserveYUsd > 0.01)
    .sort((a, b) => b.binId - a.binId); // closest to active first

  const askBins = bins
    .filter((b) => b.binId >= activeBinId && b.reserveXUsd > 0.01)
    .sort((a, b) => a.binId - b.binId); // closest to active first

  const bidReservesUsd = bidBins.reduce((s, b) => s + b.reserveYUsd, 0);
  const askReservesUsd = askBins.reduce((s, b) => s + b.reserveXUsd, 0);

  // Tightest bid: highest bin with Y reserves (closest to active on buy side)
  const tightestBidBin = bidBins.length > 0 ? bidBins[0].binId : activeBinId - 1;
  // Tightest ask: lowest bin with X reserves (closest to active on sell side)
  const tightestAskBin = askBins.length > 0 ? askBins[0].binId : activeBinId + 1;

  // Effective spread = distance in bins between tightest bid and ask * binStep
  const gapBins = tightestAskBin - tightestBidBin;
  const effectiveSpreadBps = Math.round(gapBins * binStepBps * 100) / 100;

  return {
    effectiveSpreadBps: Math.max(0, effectiveSpreadBps),
    bidReservesUsd: Math.round(bidReservesUsd),
    askReservesUsd: Math.round(askReservesUsd),
    midPriceBinId: activeBinId,
    tightestBidBin,
    tightestAskBin,
  };
}

function computeSizeImpact(
  bins: BinReserves[],
  activeBinId: number,
  binStepBps: number,
  sizes: number[]
): SizeImpactEntry[] {
  return sizes.map((size) => {
    // Simulate buying token X (consuming ask-side reserves)
    const askBins = bins
      .filter((b) => b.binId >= activeBinId && b.reserveXUsd > 0.01)
      .sort((a, b) => a.binId - b.binId);

    let remaining = size;
    let binsConsumed = 0;
    let maxBinReached = activeBinId;

    for (const bin of askBins) {
      if (remaining <= 0) break;
      const consumed = Math.min(remaining, bin.reserveXUsd);
      remaining -= consumed;
      binsConsumed++;
      maxBinReached = bin.binId;
    }

    // Spread in bps = distance from active to furthest consumed bin * binStep
    const distanceBins = maxBinReached - activeBinId;
    const spreadBps = Math.round(distanceBins * binStepBps * 100) / 100;
    const spreadCostUsd = Math.round((size * spreadBps) / 10000 * 100) / 100;

    return {
      tradeSizeUsd: size,
      spreadBps: Math.max(0, spreadBps),
      spreadCostUsd: Math.max(0, spreadCostUsd),
      binsConsumed,
    };
  });
}

function detectGaps(
  bins: BinReserves[],
  activeBinId: number,
  radius: number
): GapInfo[] {
  const gaps: GapInfo[] = [];

  // Check bid side (below active)
  const bidRange = bins
    .filter((b) => b.binId < activeBinId && b.binId >= activeBinId - radius)
    .sort((a, b) => b.binId - a.binId); // descending from active

  let gapStart: number | null = null;
  for (let i = 0; i < bidRange.length; i++) {
    if (bidRange[i].isEmpty) {
      if (gapStart === null) gapStart = bidRange[i].binId;
    } else if (gapStart !== null) {
      gaps.push({
        startBin: bidRange[i].binId + 1,
        endBin: gapStart,
        gapBins: gapStart - bidRange[i].binId,
        side: "bid",
        distanceFromActive: activeBinId - gapStart,
      });
      gapStart = null;
    }
  }
  if (gapStart !== null) {
    const lastBin = bidRange[bidRange.length - 1]?.binId || activeBinId - radius;
    gaps.push({
      startBin: lastBin,
      endBin: gapStart,
      gapBins: gapStart - lastBin + 1,
      side: "bid",
      distanceFromActive: activeBinId - gapStart,
    });
  }

  // Check ask side (above active)
  const askRange = bins
    .filter((b) => b.binId > activeBinId && b.binId <= activeBinId + radius)
    .sort((a, b) => a.binId - b.binId); // ascending from active

  gapStart = null;
  for (let i = 0; i < askRange.length; i++) {
    if (askRange[i].isEmpty) {
      if (gapStart === null) gapStart = askRange[i].binId;
    } else if (gapStart !== null) {
      gaps.push({
        startBin: gapStart,
        endBin: askRange[i].binId - 1,
        gapBins: askRange[i].binId - gapStart,
        side: "ask",
        distanceFromActive: gapStart - activeBinId,
      });
      gapStart = null;
    }
  }
  if (gapStart !== null) {
    const lastBin = askRange[askRange.length - 1]?.binId || activeBinId + radius;
    gaps.push({
      startBin: gapStart,
      endBin: lastBin,
      gapBins: lastBin - gapStart + 1,
      side: "ask",
      distanceFromActive: gapStart - activeBinId,
    });
  }

  // Only return gaps within 5 bins of active (close enough to matter)
  return gaps.filter((g) => g.distanceFromActive <= 5).sort((a, b) => a.distanceFromActive - b.distanceFromActive);
}

function computeQuality(
  spread: SpreadResult,
  gaps: GapInfo[],
  feeRateBps: number
): QualityResult {
  // Spread-to-fee ratio
  const spreadToFeeRatio = feeRateBps > 0
    ? Math.round((spread.effectiveSpreadBps / feeRateBps) * 1000) / 1000
    : 0;

  // Depth balance: ratio of smaller to larger side (1.0 = perfect balance)
  const minDepth = Math.min(spread.bidReservesUsd, spread.askReservesUsd);
  const maxDepth = Math.max(spread.bidReservesUsd, spread.askReservesUsd);
  const depthBalance = maxDepth > 0 ? Math.round((minDepth / maxDepth) * 1000) / 1000 : 0;

  // Tightness score (0-100)
  // Components: spread (40%), depth balance (30%), gaps (30%)
  const spreadScore = Math.max(0, 100 - spread.effectiveSpreadBps * 2); // wider = lower
  const balanceScore = depthBalance * 100;
  const gapScore = Math.max(0, 100 - gaps.length * 25); // each gap costs 25 points

  const tightnessScore = Math.round(
    spreadScore * 0.4 + balanceScore * 0.3 + gapScore * 0.3
  );

  let grade: QualityResult["grade"];
  if (tightnessScore >= 80) grade = "EXCELLENT";
  else if (tightnessScore >= 60) grade = "GOOD";
  else if (tightnessScore >= 40) grade = "FAIR";
  else if (tightnessScore >= 20) grade = "POOR";
  else grade = "ILLIQUID";

  let reasoning: string;
  if (grade === "EXCELLENT") {
    reasoning = "Very tight spread with deep, balanced liquidity. Excellent execution quality.";
  } else if (grade === "GOOD") {
    reasoning = `Good spread (${spread.effectiveSpreadBps} bps). ${depthBalance < 0.5 ? "Bid/ask depth somewhat imbalanced." : "Well-balanced depth."}`;
  } else if (grade === "FAIR") {
    reasoning = `Moderate spread (${spread.effectiveSpreadBps} bps). ${gaps.length > 0 ? `${gaps.length} empty bin gap(s) near active price.` : "Consider smaller trade sizes for better execution."}`;
  } else if (grade === "POOR") {
    reasoning = `Wide spread (${spread.effectiveSpreadBps} bps). Thin liquidity — expect significant price impact on larger trades.`;
  } else {
    reasoning = `Very wide spread or significant liquidity gaps. Not suitable for large trades.`;
  }

  return {
    tightnessScore: Math.min(100, Math.max(0, tightnessScore)),
    grade,
    spreadToFeeRatio,
    emptyBinGaps: gaps.length,
    depthBalance,
    reasoning,
  };
}

function generateReasoning(
  spread: SpreadResult,
  quality: QualityResult,
  gaps: GapInfo[],
  pool: AppPool
): string[] {
  const reasons: string[] = [];
  const feeRateBps = pool.feeRateBps || 30;

  reasons.push(
    `Effective spread: ${spread.effectiveSpreadBps} bps (${quality.spreadToFeeRatio < 1 ? "within" : "exceeds"} ${feeRateBps} bps fee tier).`
  );

  reasons.push(
    `Bid depth: $${spread.bidReservesUsd.toLocaleString()} | Ask depth: $${spread.askReservesUsd.toLocaleString()} (balance: ${(quality.depthBalance * 100).toFixed(0)}%).`
  );

  if (gaps.length > 0) {
    const nearestGap = gaps[0];
    reasons.push(
      `${gaps.length} empty bin gap(s) detected. Nearest: ${nearestGap.gapBins} bin(s) on ${nearestGap.side} side, ${nearestGap.distanceFromActive} bin(s) from active.`
    );
  } else {
    reasons.push("No empty bin gaps near active price — continuous liquidity.");
  }

  reasons.push(`Execution quality: ${quality.grade} (tightness ${quality.tightnessScore}/100).`);

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

  try {
    const result = await callReadOnly("get-pair-information", [encodeUint(1)]);
    results["pair_info_read"] = result.result ? "ok" : "no result";
  } catch (e: any) {
    results["pair_info_read"] = `error: ${e.message}`;
  }

  console.log(
    JSON.stringify({
      tool: "hodlmm-spread-analyzer",
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
      tool: "hodlmm-spread-analyzer",
      command: "install-packs",
      status: "ok",
      message: "No additional dependencies required. Uses commander (workspace) + native fetch.",
      timestamp: new Date().toISOString(),
    })
  );
}

async function runSpreadAnalysis(options: {
  pool?: string;
  sizes?: string;
}): Promise<void> {
  const poolQuery = options.pool || "sbtc-stx";
  const sizes = options.sizes
    ? options.sizes.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => n > 0)
    : DEFAULT_SIZES;

  const appPools = await fetchAppPools();
  if (appPools.length === 0) {
    console.log(
      JSON.stringify({ tool: "hodlmm-spread-analyzer", error: "Could not fetch pool list from Bitflow API", timestamp: new Date().toISOString() })
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
    console.log(JSON.stringify({ tool: "hodlmm-spread-analyzer", error: e.message, timestamp: new Date().toISOString() }));
    return;
  }

  if (!appPool) {
    console.log(
      JSON.stringify({ tool: "hodlmm-spread-analyzer", error: `Pool metadata not found for ${poolQuery}`, timestamp: new Date().toISOString() })
    );
    return;
  }

  const activeBinId = appPool.activeBinId || (await fetchActiveBin(poolId));
  if (!activeBinId) {
    console.log(
      JSON.stringify({ tool: "hodlmm-spread-analyzer", error: `Could not determine active bin for pool ${poolId}`, timestamp: new Date().toISOString() })
    );
    return;
  }

  // Fetch bin step for accurate spread calculation
  const binStepBps = appPool.binStep || (await fetchBinStep(poolId));
  const feeRateBps = appPool.feeRateBps || 30;

  const bins = await scanBinsAroundActive(poolId, activeBinId, SCAN_RADIUS, appPool);
  const spread = computeEffectiveSpread(bins, activeBinId, binStepBps);
  const sizeImpact = computeSizeImpact(bins, activeBinId, binStepBps, sizes);
  const gaps = detectGaps(bins, activeBinId, SCAN_RADIUS);
  const quality = computeQuality(spread, gaps, feeRateBps);
  const reasoning = generateReasoning(spread, quality, gaps, appPool);

  console.log(
    JSON.stringify({
      tool: "hodlmm-spread-analyzer",
      command: "run",
      pool: {
        id: poolId,
        pair: `${appPool.token0Symbol}-${appPool.token1Symbol}`,
        tvlUsd: Math.round(appPool.tvlUsd || 0),
        activeBinId,
        feeRateBps,
        binStepBps,
      },
      spread,
      sizeImpact,
      quality,
      gaps,
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
  const sortBy = options.sort || "spread";

  const appPools = await fetchAppPools();
  if (appPools.length === 0) {
    console.log(
      JSON.stringify({ tool: "hodlmm-spread-analyzer", error: "Could not fetch pool list from Bitflow API", timestamp: new Date().toISOString() })
    );
    return;
  }

  const hodlmmPools = appPools.filter((p) => p.poolId && p.poolId > 0 && p.tvlUsd >= MIN_TVL_USD);
  const analyses: Array<{
    pair: string;
    poolId: number;
    tvlUsd: number;
    effectiveSpreadBps: number;
    bidDepthUsd: number;
    askDepthUsd: number;
    depthBalance: number;
    tightnessScore: number;
    grade: string;
    spreadToFeeRatio: number;
    emptyBinGaps: number;
  }> = [];

  for (const pool of hodlmmPools) {
    if (!pool.poolId) continue;

    const activeBinId = pool.activeBinId || (await fetchActiveBin(pool.poolId));
    if (!activeBinId) continue;

    const binStepBps = pool.binStep || DEFAULT_BIN_STEP_BPS;
    const feeRateBps = pool.feeRateBps || 30;

    // Use smaller radius for scan (faster)
    const bins = await scanBinsAroundActive(pool.poolId, activeBinId, 10, pool);
    const spread = computeEffectiveSpread(bins, activeBinId, binStepBps);
    const gaps = detectGaps(bins, activeBinId, 10);
    const quality = computeQuality(spread, gaps, feeRateBps);

    analyses.push({
      pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
      poolId: pool.poolId,
      tvlUsd: Math.round(pool.tvlUsd || 0),
      effectiveSpreadBps: spread.effectiveSpreadBps,
      bidDepthUsd: spread.bidReservesUsd,
      askDepthUsd: spread.askReservesUsd,
      depthBalance: quality.depthBalance,
      tightnessScore: quality.tightnessScore,
      grade: quality.grade,
      spreadToFeeRatio: quality.spreadToFeeRatio,
      emptyBinGaps: quality.emptyBinGaps,
    });
  }

  let sorted: typeof analyses;
  switch (sortBy) {
    case "tightness":
      sorted = analyses.sort((a, b) => b.tightnessScore - a.tightnessScore);
      break;
    case "tvl":
      sorted = analyses.sort((a, b) => b.tvlUsd - a.tvlUsd);
      break;
    default: // spread — tightest first
      sorted = analyses.sort((a, b) => a.effectiveSpreadBps - b.effectiveSpreadBps);
  }

  const ranked = sorted.slice(0, topN).map((a, i) => ({ rank: i + 1, ...a }));

  const avgTightness = analyses.length > 0
    ? Math.round(analyses.reduce((s, a) => s + a.tightnessScore, 0) / analyses.length)
    : 0;

  console.log(
    JSON.stringify({
      tool: "hodlmm-spread-analyzer",
      command: "scan",
      poolsAnalyzed: analyses.length,
      sortBy,
      topPools: ranked,
      summary: {
        excellent: analyses.filter((a) => a.grade === "EXCELLENT").length,
        good: analyses.filter((a) => a.grade === "GOOD").length,
        fair: analyses.filter((a) => a.grade === "FAIR").length,
        poor: analyses.filter((a) => a.grade === "POOR").length,
        illiquid: analyses.filter((a) => a.grade === "ILLIQUID").length,
        avgTightnessScore: avgTightness,
        avgSpreadBps: analyses.length > 0
          ? Math.round(analyses.reduce((s, a) => s + a.effectiveSpreadBps, 0) / analyses.length * 100) / 100
          : 0,
        poolsWithGaps: analyses.filter((a) => a.emptyBinGaps > 0).length,
      },
      timestamp: new Date().toISOString(),
    })
  );
}

// ── CLI Setup ──────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-spread-analyzer")
  .description("HODLMM Spread Analyzer — Bid-ask spread measurement, size impact, and execution quality scoring")
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
  .description("Analyze spread for a specific pool")
  .option("--pool <id>", "Pool ID or token pair name (e.g., sbtc-stx, 1)", "sbtc-stx")
  .option("--sizes <csv>", "Trade sizes in USD to analyze (comma-separated)", "100,500,1000,5000")
  .action(runSpreadAnalysis);

program
  .command("scan")
  .description("Scan all HODLMM pools for spread quality")
  .option("--top <n>", "Number of pools to show", "10")
  .option("--sort <field>", "Sort by: spread, tightness, tvl", "spread")
  .action(runScanAll);

program.parse();
