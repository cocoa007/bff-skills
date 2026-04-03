#!/usr/bin/env bun
/**
 * hodlmm-order-flow.ts
 *
 * HODLMM Order Flow Analyzer — Detects directional pressure, buy/sell ratios,
 * reserve asymmetry, and flow momentum using bin reserve proxy signals.
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 32).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const DEFAULT_BIN_DEPTH = 20;

// Flow score thresholds
const HEAVY_BUY_THRESHOLD = 60;
const BUY_THRESHOLD = 20;
const SELL_THRESHOLD = -20;
const HEAVY_SELL_THRESHOLD = -60;

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
}

interface ActiveBinResult {
  binId: number;
  reserveX: number;
  reserveY: number;
  xDominancePct: number;
}

type FlowDirection = "HEAVY_BUY" | "BUY" | "NEUTRAL" | "SELL" | "HEAVY_SELL";
type Momentum = "ACCELERATING" | "STEADY" | "DECELERATING" | "REVERSING";

interface FlowAnalysis {
  reserveAsymmetry: number;
  activeBinDrift: number;
  buyPressurePct: number;
  sellPressurePct: number;
  flowScore: number;
  flowDirection: FlowDirection;
  momentum: Momentum;
  reasoning: string;
}

interface BinDistribution {
  binsAnalyzed: number;
  binsWithReserves: number;
  avgXReserve: number;
  avgYReserve: number;
  xHeavyBins: number;
  yHeavyBins: number;
  balancedBins: number;
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
  const hex = n.toString(16).padStart(32, "0");
  return "0x01" + hex;
}

/**
 * Parse a Clarity value repr to extract uint values.
 * Handles (ok (tuple ...)) and (ok u123) patterns.
 */
function extractUintFromRepr(repr: string, key: string): number {
  // Match patterns like: key: u12345 or key u12345
  const pattern = new RegExp(`${key}[:\\s]+u(\\d+)`);
  const match = repr.match(pattern);
  if (match) return parseInt(match[1], 10);
  return 0;
}

function extractTupleField(repr: string, field: string): number {
  const pattern = new RegExp(`${field}\\s+u(\\d+)`);
  const match = repr.match(pattern);
  return match ? parseInt(match[1], 10) : 0;
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

async function fetchActiveBin(poolId: number): Promise<{ binId: number } | null> {
  try {
    const result = await callReadOnly("get-active-bin", [encodeUint(poolId)]);
    const repr = result.result?.repr || result.repr || "";

    // Pattern: (ok u8388608) or (ok {active-bin-id: u8388608, ...})
    const directMatch = repr.match(/\(ok\s+u(\d+)\)/);
    if (directMatch) return { binId: parseInt(directMatch[1], 10) };

    const fieldMatch = extractTupleField(repr, "active-bin-id");
    if (fieldMatch > 0) return { binId: fieldMatch };

    // Try bin-id field
    const binIdField = extractTupleField(repr, "bin-id");
    if (binIdField > 0) return { binId: binIdField };

    return null;
  } catch {
    return null;
  }
}

async function fetchBinData(poolId: number, binId: number): Promise<BinData | null> {
  try {
    const result = await callReadOnly("get-bin", [encodeUint(poolId), encodeUint(binId)]);
    const repr = result.result?.repr || result.repr || "";

    const reserveX = extractTupleField(repr, "reserve-x");
    const reserveY = extractTupleField(repr, "reserve-y");

    return { binId, reserveX, reserveY };
  } catch {
    return null;
  }
}

async function fetchBinsAroundActive(
  poolId: number,
  activeBinId: number,
  depth: number
): Promise<BinData[]> {
  const bins: BinData[] = [];
  const halfDepth = Math.floor(depth / 2);
  const startBin = activeBinId - halfDepth;
  const endBin = activeBinId + halfDepth;

  // Fetch bins in parallel batches to avoid rate limits
  const batchSize = 5;
  for (let i = startBin; i <= endBin; i += batchSize) {
    const batch: Promise<BinData | null>[] = [];
    for (let j = i; j < Math.min(i + batchSize, endBin + 1); j++) {
      batch.push(fetchBinData(poolId, j));
    }
    const results = await Promise.all(batch);
    for (const r of results) {
      if (r) bins.push(r);
    }
  }

  return bins;
}

// ── Analysis Engine ────────────────────────────────────────────────────────────

function analyzeActiveBin(bin: BinData): ActiveBinResult {
  const total = bin.reserveX + bin.reserveY;
  const xDominancePct = total > 0 ? (bin.reserveX / total) * 100 : 50;

  return {
    binId: bin.binId,
    reserveX: bin.reserveX,
    reserveY: bin.reserveY,
    xDominancePct: Math.round(xDominancePct * 100) / 100,
  };
}

function calculateReserveAsymmetry(bins: BinData[], activeBinId: number): number {
  // Bins below active: should have more token-x (bid side)
  // Bins above active: should have more token-y (ask side)
  // If bins above are depleted of token-y => buyers swept asks => buy pressure
  // If bins below are depleted of token-x => sellers swept bids => sell pressure

  let aboveXTotal = 0;
  let aboveYTotal = 0;
  let belowXTotal = 0;
  let belowYTotal = 0;

  for (const bin of bins) {
    if (bin.binId > activeBinId) {
      aboveXTotal += bin.reserveX;
      aboveYTotal += bin.reserveY;
    } else if (bin.binId < activeBinId) {
      belowXTotal += bin.reserveX;
      belowYTotal += bin.reserveY;
    }
  }

  // Asymmetry: positive = buy pressure (ask side depleted), negative = sell pressure
  const aboveTotal = aboveXTotal + aboveYTotal;
  const belowTotal = belowXTotal + belowYTotal;

  if (aboveTotal === 0 && belowTotal === 0) return 0;

  // If above bins have more X than Y, it means Y was swapped out (bought)
  const aboveXRatio = aboveTotal > 0 ? aboveXTotal / aboveTotal : 0.5;
  // If below bins have more Y than X, it means X was swapped out (sold)
  const belowYRatio = belowTotal > 0 ? belowYTotal / belowTotal : 0.5;

  // High aboveXRatio = token-y depleted from ask side = buy pressure
  // High belowYRatio = token-x depleted from bid side = sell pressure
  const asymmetry = (aboveXRatio - 0.5) - (belowYRatio - 0.5);

  // Clamp to [-1, 1]
  return Math.max(-1, Math.min(1, asymmetry));
}

function calculateActiveBinDrift(
  activeBinId: number,
  bins: BinData[]
): number {
  // Find the range of populated bins
  const populatedBins = bins.filter((b) => b.reserveX > 0 || b.reserveY > 0);
  if (populatedBins.length < 2) return 0;

  const minBin = Math.min(...populatedBins.map((b) => b.binId));
  const maxBin = Math.max(...populatedBins.map((b) => b.binId));
  const centerBin = Math.floor((minBin + maxBin) / 2);
  const range = maxBin - minBin;

  if (range === 0) return 0;

  // Drift: positive = active bin above center (buy pressure moved price up)
  // Normalized to [-1, 1]
  const drift = (activeBinId - centerBin) / (range / 2);
  return Math.max(-1, Math.min(1, drift));
}

function classifyBins(bins: BinData[]): BinDistribution {
  let xHeavy = 0;
  let yHeavy = 0;
  let balanced = 0;
  let totalX = 0;
  let totalY = 0;
  let withReserves = 0;

  for (const bin of bins) {
    const total = bin.reserveX + bin.reserveY;
    if (total === 0) continue;

    withReserves++;
    totalX += bin.reserveX;
    totalY += bin.reserveY;

    const xRatio = bin.reserveX / total;
    if (xRatio > 0.65) xHeavy++;
    else if (xRatio < 0.35) yHeavy++;
    else balanced++;
  }

  return {
    binsAnalyzed: bins.length,
    binsWithReserves: withReserves,
    avgXReserve: withReserves > 0 ? Math.round(totalX / withReserves) : 0,
    avgYReserve: withReserves > 0 ? Math.round(totalY / withReserves) : 0,
    xHeavyBins: xHeavy,
    yHeavyBins: yHeavy,
    balancedBins: balanced,
  };
}

function calculateFlowScore(
  reserveAsymmetry: number,
  activeBinDrift: number,
  binDist: BinDistribution
): number {
  // Weighted combination of proxy signals
  // Reserve asymmetry: strongest signal (weight 0.5)
  // Active bin drift: moderate signal (weight 0.3)
  // Bin classification ratio: supporting signal (weight 0.2)

  const asymmetryScore = reserveAsymmetry * 100; // [-100, 100]
  const driftScore = activeBinDrift * 100; // [-100, 100]

  // Bin ratio: more x-heavy bins = more sell pressure (sellers dumped x)
  // more y-heavy bins = more buy pressure (buyers took y)
  const totalClassified = binDist.xHeavyBins + binDist.yHeavyBins + binDist.balancedBins;
  let binRatioScore = 0;
  if (totalClassified > 0) {
    // x-heavy = sell signal, y-heavy = buy signal
    binRatioScore = ((binDist.yHeavyBins - binDist.xHeavyBins) / totalClassified) * 100;
  }

  const score = asymmetryScore * 0.5 + driftScore * 0.3 + binRatioScore * 0.2;
  return Math.round(Math.max(-100, Math.min(100, score)));
}

function classifyFlowDirection(score: number): FlowDirection {
  if (score >= HEAVY_BUY_THRESHOLD) return "HEAVY_BUY";
  if (score >= BUY_THRESHOLD) return "BUY";
  if (score <= HEAVY_SELL_THRESHOLD) return "HEAVY_SELL";
  if (score <= SELL_THRESHOLD) return "SELL";
  return "NEUTRAL";
}

function classifyMomentum(
  reserveAsymmetry: number,
  activeBinDrift: number
): Momentum {
  const asymSign = Math.sign(reserveAsymmetry);
  const driftSign = Math.sign(activeBinDrift);
  const asymMag = Math.abs(reserveAsymmetry);
  const driftMag = Math.abs(activeBinDrift);

  // If asymmetry and drift disagree in direction => reversing
  if (asymSign !== 0 && driftSign !== 0 && asymSign !== driftSign) {
    return "REVERSING";
  }

  // Both strong => accelerating
  if (asymMag > 0.4 && driftMag > 0.4) return "ACCELERATING";

  // Both weak => decelerating
  if (asymMag < 0.15 && driftMag < 0.15) return "DECELERATING";

  return "STEADY";
}

function buildReasoning(
  flowDirection: FlowDirection,
  momentum: Momentum,
  reserveAsymmetry: number,
  activeBinDrift: number,
  binDist: BinDistribution
): string {
  const parts: string[] = [];

  switch (flowDirection) {
    case "HEAVY_BUY":
      parts.push("Strong net buying pressure detected.");
      break;
    case "BUY":
      parts.push("Moderate buying pressure detected.");
      break;
    case "NEUTRAL":
      parts.push("No clear directional bias — flow is balanced.");
      break;
    case "SELL":
      parts.push("Moderate selling pressure detected.");
      break;
    case "HEAVY_SELL":
      parts.push("Strong net selling pressure detected.");
      break;
  }

  if (Math.abs(reserveAsymmetry) > 0.3) {
    const side = reserveAsymmetry > 0 ? "ask-side depleted (buy flow)" : "bid-side depleted (sell flow)";
    parts.push(`Reserve asymmetry ${reserveAsymmetry.toFixed(2)} shows ${side}.`);
  }

  if (Math.abs(activeBinDrift) > 0.2) {
    const dir = activeBinDrift > 0 ? "above" : "below";
    parts.push(`Active bin drifted ${dir} center by ${(Math.abs(activeBinDrift) * 100).toFixed(0)}%.`);
  }

  if (binDist.xHeavyBins > binDist.yHeavyBins * 2) {
    parts.push(`${binDist.xHeavyBins} x-heavy bins vs ${binDist.yHeavyBins} y-heavy — consistent with sell flow.`);
  } else if (binDist.yHeavyBins > binDist.xHeavyBins * 2) {
    parts.push(`${binDist.yHeavyBins} y-heavy bins vs ${binDist.xHeavyBins} x-heavy — consistent with buy flow.`);
  }

  switch (momentum) {
    case "ACCELERATING":
      parts.push("Momentum accelerating — both asymmetry and drift align strongly.");
      break;
    case "REVERSING":
      parts.push("WARNING: Possible reversal — asymmetry and drift disagree.");
      break;
    case "DECELERATING":
      parts.push("Momentum fading — signals are weak.");
      break;
  }

  return parts.join(" ");
}

function analyzeFlow(
  bins: BinData[],
  activeBinId: number,
  binDist: BinDistribution
): FlowAnalysis {
  const reserveAsymmetry = calculateReserveAsymmetry(bins, activeBinId);
  const activeBinDrift = calculateActiveBinDrift(activeBinId, bins);
  const flowScore = calculateFlowScore(reserveAsymmetry, activeBinDrift, binDist);
  const flowDirection = classifyFlowDirection(flowScore);
  const momentum = classifyMomentum(reserveAsymmetry, activeBinDrift);

  const buyPressurePct = Math.round(Math.max(0, Math.min(100, 50 + flowScore / 2)) * 100) / 100;
  const sellPressurePct = Math.round((100 - buyPressurePct) * 100) / 100;

  const reasoning = buildReasoning(flowDirection, momentum, reserveAsymmetry, activeBinDrift, binDist);

  return {
    reserveAsymmetry: Math.round(reserveAsymmetry * 1000) / 1000,
    activeBinDrift: Math.round(activeBinDrift * 1000) / 1000,
    buyPressurePct,
    sellPressurePct,
    flowScore,
    flowDirection,
    momentum,
    reasoning,
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
    const testResult = await callReadOnly("get-active-bin", [encodeUint(1)]);
    results["dlmm_contract"] = testResult.result ? "ok" : "no result";
  } catch (e: any) {
    results["dlmm_contract"] = `error: ${e.message}`;
  }

  console.log(
    JSON.stringify({
      tool: "hodlmm-order-flow",
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
      tool: "hodlmm-order-flow",
      command: "install-packs",
      status: "ok",
      message: "No additional dependencies required. Uses commander (workspace) + native fetch.",
      timestamp: new Date().toISOString(),
    })
  );
}

async function runOrderFlow(options: {
  pool?: string;
  depth?: string;
}): Promise<void> {
  const poolQuery = options.pool || "sbtc-stx";
  const depth = options.depth ? parseInt(options.depth, 10) : DEFAULT_BIN_DEPTH;

  const appPools = await fetchAppPools();
  if (appPools.length === 0) {
    console.log(
      JSON.stringify({ tool: "hodlmm-order-flow", error: "Could not fetch pool list from Bitflow API", timestamp: new Date().toISOString() })
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
    console.log(JSON.stringify({ tool: "hodlmm-order-flow", error: e.message, timestamp: new Date().toISOString() }));
    return;
  }

  if (!appPool) {
    console.log(
      JSON.stringify({ tool: "hodlmm-order-flow", error: `Pool metadata not found for ${poolQuery}`, timestamp: new Date().toISOString() })
    );
    return;
  }

  // Fetch active bin
  const activeBin = await fetchActiveBin(poolId);
  if (!activeBin) {
    console.log(
      JSON.stringify({ tool: "hodlmm-order-flow", error: `Could not determine active bin for pool ${poolId}`, timestamp: new Date().toISOString() })
    );
    return;
  }

  // Fetch bins around active bin
  const bins = await fetchBinsAroundActive(poolId, activeBin.binId, depth);
  if (bins.length === 0) {
    console.log(
      JSON.stringify({
        tool: "hodlmm-order-flow",
        command: "run",
        pool: { id: poolId, pair: `${appPool.token0Symbol}-${appPool.token1Symbol}`, tvlUsd: Math.round(appPool.tvlUsd || 0) },
        flowAnalysis: {
          reserveAsymmetry: 0,
          activeBinDrift: 0,
          buyPressurePct: 50,
          sellPressurePct: 50,
          flowScore: 0,
          flowDirection: "NEUTRAL",
          momentum: "STEADY",
          reasoning: "No bin data available — cannot analyze flow.",
        },
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  // Get active bin reserves
  const activeBinData = bins.find((b) => b.binId === activeBin.binId);
  const activeBinResult = activeBinData
    ? analyzeActiveBin(activeBinData)
    : { binId: activeBin.binId, reserveX: 0, reserveY: 0, xDominancePct: 50 };

  // Analyze
  const binDist = classifyBins(bins);
  const flowAnalysis = analyzeFlow(bins, activeBin.binId, binDist);

  console.log(
    JSON.stringify({
      tool: "hodlmm-order-flow",
      command: "run",
      pool: {
        id: poolId,
        pair: `${appPool.token0Symbol}-${appPool.token1Symbol}`,
        tvlUsd: Math.round(appPool.tvlUsd || 0),
      },
      activeBin: activeBinResult,
      flowAnalysis,
      binDistribution: binDist,
      timestamp: new Date().toISOString(),
    })
  );
}

async function runScanAll(options: {
  top?: string;
  sort?: string;
}): Promise<void> {
  const topN = options.top ? parseInt(options.top, 10) : 10;
  const sortBy = options.sort || "flow-score";

  const appPools = await fetchAppPools();
  if (appPools.length === 0) {
    console.log(
      JSON.stringify({ tool: "hodlmm-order-flow", error: "Could not fetch pool list from Bitflow API", timestamp: new Date().toISOString() })
    );
    return;
  }

  const hodlmmPools = appPools.filter((p) => p.poolId && p.poolId > 0 && p.tvlUsd >= MIN_TVL_USD);

  const analyses: Array<{
    pair: string;
    poolId: number;
    tvlUsd: number;
    activeBinId: number;
    flowScore: number;
    flowDirection: FlowDirection;
    momentum: Momentum;
    buyPressurePct: number;
    reserveAsymmetry: number;
    binsWithReserves: number;
    reasoning: string;
  }> = [];

  for (const pool of hodlmmPools) {
    if (!pool.poolId) continue;

    try {
      const activeBin = await fetchActiveBin(pool.poolId);
      if (!activeBin) continue;

      // Use smaller depth for scan to stay within rate limits
      const bins = await fetchBinsAroundActive(pool.poolId, activeBin.binId, 10);
      if (bins.length === 0) continue;

      const binDist = classifyBins(bins);
      const flow = analyzeFlow(bins, activeBin.binId, binDist);

      analyses.push({
        pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
        poolId: pool.poolId,
        tvlUsd: Math.round(pool.tvlUsd || 0),
        activeBinId: activeBin.binId,
        flowScore: flow.flowScore,
        flowDirection: flow.flowDirection,
        momentum: flow.momentum,
        buyPressurePct: flow.buyPressurePct,
        reserveAsymmetry: flow.reserveAsymmetry,
        binsWithReserves: binDist.binsWithReserves,
        reasoning: flow.reasoning,
      });
    } catch {
      // Skip pools that fail
    }
  }

  let sorted: typeof analyses;
  switch (sortBy) {
    case "buy-pressure":
      sorted = analyses.sort((a, b) => b.buyPressurePct - a.buyPressurePct);
      break;
    case "asymmetry":
      sorted = analyses.sort((a, b) => Math.abs(b.reserveAsymmetry) - Math.abs(a.reserveAsymmetry));
      break;
    default: // flow-score — highest absolute score first (most directional)
      sorted = analyses.sort((a, b) => Math.abs(b.flowScore) - Math.abs(a.flowScore));
  }

  const ranked = sorted.slice(0, topN).map((a, i) => ({ rank: i + 1, ...a }));

  console.log(
    JSON.stringify({
      tool: "hodlmm-order-flow",
      command: "scan",
      poolsAnalyzed: analyses.length,
      sortBy,
      topPools: ranked,
      summary: {
        heavyBuy: analyses.filter((a) => a.flowDirection === "HEAVY_BUY").length,
        buy: analyses.filter((a) => a.flowDirection === "BUY").length,
        neutral: analyses.filter((a) => a.flowDirection === "NEUTRAL").length,
        sell: analyses.filter((a) => a.flowDirection === "SELL").length,
        heavySell: analyses.filter((a) => a.flowDirection === "HEAVY_SELL").length,
        avgFlowScore: analyses.length > 0
          ? Math.round(analyses.reduce((s, a) => s + a.flowScore, 0) / analyses.length)
          : 0,
        poolsReversing: analyses.filter((a) => a.momentum === "REVERSING").length,
        poolsAccelerating: analyses.filter((a) => a.momentum === "ACCELERATING").length,
      },
      timestamp: new Date().toISOString(),
    })
  );
}

// ── CLI Setup ──────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-order-flow")
  .description("HODLMM Order Flow Analyzer — Directional pressure, buy/sell ratios, reserve asymmetry, momentum")
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
  .description("Analyze order flow for a specific pool")
  .option("--pool <id>", "Pool ID or token pair name (e.g., sbtc-stx, 1)", "sbtc-stx")
  .option("--depth <n>", "Number of bins to analyze around active bin", String(DEFAULT_BIN_DEPTH))
  .action(runOrderFlow);

program
  .command("scan")
  .description("Scan all HODLMM pools for order flow signals")
  .option("--top <n>", "Number of pools to show", "10")
  .option("--sort <field>", "Sort by: flow-score, buy-pressure, asymmetry", "flow-score")
  .action(runScanAll);

program.parse();
