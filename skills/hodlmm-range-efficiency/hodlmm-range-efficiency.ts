#!/usr/bin/env bun
/**
 * hodlmm-range-efficiency.ts
 *
 * HODLMM Range Efficiency Analyzer — Measures how effectively LP bin ranges
 * capture trading activity, identifies dead capital, and recommends optimal widths.
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 33).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const DEFAULT_BIN_DEPTH = 30;

// Bins within this distance of active bin are considered "active" (earning fees)
const ACTIVE_PROXIMITY_THRESHOLD = 3;

// ── Types ──────────────────────────────────────────────────────────────────────

interface TokenInfo {
  contract: string;
  displayName: string;
  symbol: string;
  decimals: number;
  priceUsd: number;
}

interface AppPool {
  poolId: string; // e.g. "dlmm_1"
  poolContract: string;
  tokens: {
    tokenX: TokenInfo;
    tokenY: TokenInfo;
  };
  tvlUsd: number;
  volumeUsd1d: number;
  types: string[];
  // Normalized helpers (set after fetch)
  _numericId: number;
  _pairLabel: string;
}

interface BinData {
  binId: number;
  reserveX: number;
  reserveY: number;
}

type RangeVerdict = "OPTIMAL" | "TOO_WIDE" | "TOO_NARROW" | "LOPSIDED" | "FRAGMENTED";

interface RangeAnalysis {
  totalPopulatedBins: number;
  activeBins: number;
  deadBins: number;
  rangeUtilizationPct: number;
  capitalInActiveBinsPct: number;
  capitalInDeadBinsPct: number;
  capitalEfficiencyPct: number;
  rangeWidth: number;
  optimalRangeWidth: number;
  rangeVerdict: RangeVerdict;
  deadCapitalPct: number;
  concentrationScore: number;
  symmetryScore: number;
  gapCount: number;
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
  const hex = n.toString(16).padStart(32, "0");
  return "0x01" + hex;
}

function extractTupleField(repr: string, field: string): number {
  const pattern = new RegExp(`${field}\\s+u(\\d+)`);
  const match = repr.match(pattern);
  return match ? parseInt(match[1], 10) : 0;
}

// ── Data Fetching ──────────────────────────────────────────────────────────────

function parseNumericPoolId(poolId: string): number {
  // "dlmm_1" -> 1, "dlmm_5" -> 5
  const match = poolId.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

async function fetchAppPools(): Promise<AppPool[]> {
  try {
    const resp = await fetchJson(`${BFF_APP_BASE}/pools`);
    const raw = resp.data || resp.pools || resp || [];
    const pools: AppPool[] = Array.isArray(raw) ? raw : [];
    // Normalize
    for (const p of pools) {
      p._numericId = parseNumericPoolId(p.poolId || "");
      const xSym = p.tokens?.tokenX?.symbol || "?";
      const ySym = p.tokens?.tokenY?.symbol || "?";
      p._pairLabel = `${xSym}-${ySym}`;
    }
    return pools;
  } catch {
    return [];
  }
}

async function resolvePool(
  query: string,
  appPools: AppPool[]
): Promise<{ poolId: number; pool: AppPool | null }> {
  // Try numeric match first (e.g. "1" -> dlmm_1)
  const asNum = parseInt(query, 10);
  if (!isNaN(asNum) && asNum > 0) {
    const match = appPools.find((p) => p._numericId === asNum);
    return { poolId: asNum, pool: match || null };
  }
  // Try token symbol match (e.g. "sbtc-stx", "sbtc", etc.)
  const q = query.toLowerCase().replace(/[^a-z0-9]/g, "");
  const match = appPools.find((p) => {
    const xSym = (p.tokens?.tokenX?.symbol || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const ySym = (p.tokens?.tokenY?.symbol || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const pair = `${xSym}${ySym}`;
    const pairRev = `${ySym}${xSym}`;
    return pair.includes(q) || pairRev.includes(q) || q.includes(pair) || q.includes(pairRev);
  });
  if (!match) throw new Error(`Pool not found: ${query}`);
  return { poolId: match._numericId, pool: match };
}

async function fetchActiveBin(poolId: number): Promise<{ binId: number } | null> {
  try {
    const result = await callReadOnly("get-active-bin", [encodeUint(poolId)]);
    const repr = result.result?.repr || result.repr || "";

    const directMatch = repr.match(/\(ok\s+u(\d+)\)/);
    if (directMatch) return { binId: parseInt(directMatch[1], 10) };

    const fieldMatch = extractTupleField(repr, "active-bin-id");
    if (fieldMatch > 0) return { binId: fieldMatch };

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

function getBinCapitalValue(bin: BinData, pool: AppPool): number {
  const xDecimals = pool.tokens?.tokenX?.decimals ?? 8;
  const yDecimals = pool.tokens?.tokenY?.decimals ?? 6;
  const xPriceUsd = pool.tokens?.tokenX?.priceUsd ?? 0;
  const yPriceUsd = pool.tokens?.tokenY?.priceUsd ?? 0;
  const xUsd = (bin.reserveX / Math.pow(10, xDecimals)) * xPriceUsd;
  const yUsd = (bin.reserveY / Math.pow(10, yDecimals)) * yPriceUsd;
  return xUsd + yUsd;
}

function analyzeRange(
  bins: BinData[],
  activeBinId: number,
  pool: AppPool
): RangeAnalysis {
  const populatedBins = bins.filter((b) => b.reserveX > 0 || b.reserveY > 0);
  const totalPopulated = populatedBins.length;

  if (totalPopulated === 0) {
    return {
      totalPopulatedBins: 0,
      activeBins: 0,
      deadBins: 0,
      rangeUtilizationPct: 0,
      capitalInActiveBinsPct: 0,
      capitalInDeadBinsPct: 0,
      capitalEfficiencyPct: 0,
      rangeWidth: 0,
      optimalRangeWidth: 0,
      rangeVerdict: "TOO_NARROW",
      deadCapitalPct: 0,
      concentrationScore: 0,
      symmetryScore: 50,
      gapCount: 0,
      reasoning: "No populated bins found — no liquidity deployed.",
    };
  }

  // Classify bins as active (near active bin) or dead (far from active bin)
  const activeBins = populatedBins.filter(
    (b) => Math.abs(b.binId - activeBinId) <= ACTIVE_PROXIMITY_THRESHOLD
  );
  const deadBins = populatedBins.filter(
    (b) => Math.abs(b.binId - activeBinId) > ACTIVE_PROXIMITY_THRESHOLD
  );

  // Calculate capital distribution
  let activeCapital = 0;
  let deadCapital = 0;
  let totalCapital = 0;

  for (const bin of populatedBins) {
    const val = getBinCapitalValue(bin, pool);
    totalCapital += val;
    if (Math.abs(bin.binId - activeBinId) <= ACTIVE_PROXIMITY_THRESHOLD) {
      activeCapital += val;
    } else {
      deadCapital += val;
    }
  }

  const capitalEfficiencyPct = totalCapital > 0
    ? Math.round((activeCapital / totalCapital) * 10000) / 100
    : 0;

  const rangeUtilizationPct = totalPopulated > 0
    ? Math.round((activeBins.length / totalPopulated) * 10000) / 100
    : 0;

  // Range width: distance between min and max populated bins
  const minBin = Math.min(...populatedBins.map((b) => b.binId));
  const maxBin = Math.max(...populatedBins.map((b) => b.binId));
  const rangeWidth = maxBin - minBin + 1;

  // Optimal range width: find the narrowest contiguous range containing 80% of capital
  const optimalWidth = findOptimalWidth(populatedBins, activeBinId, pool);

  // Symmetry: compare bins above vs below active bin
  const binsAbove = populatedBins.filter((b) => b.binId > activeBinId).length;
  const binsBelow = populatedBins.filter((b) => b.binId < activeBinId).length;
  const totalSides = binsAbove + binsBelow;
  const symmetryScore = totalSides > 0
    ? Math.round((1 - Math.abs(binsAbove - binsBelow) / totalSides) * 100)
    : 50;

  // Gap detection: count gaps in the populated bin range
  const sortedBinIds = populatedBins.map((b) => b.binId).sort((a, b) => a - b);
  let gapCount = 0;
  for (let i = 1; i < sortedBinIds.length; i++) {
    if (sortedBinIds[i] - sortedBinIds[i - 1] > 1) {
      gapCount++;
    }
  }

  // Concentration score: weighted by proximity to active bin
  let weightedSum = 0;
  let maxPossibleWeight = 0;
  for (const bin of populatedBins) {
    const distance = Math.abs(bin.binId - activeBinId);
    const capital = getBinCapitalValue(bin, pool);
    // Weight: 1/(1+distance) — closer bins have higher weight
    const weight = 1 / (1 + distance);
    weightedSum += capital * weight;
    maxPossibleWeight += capital; // max if all capital were at distance 0
  }
  const concentrationScore = maxPossibleWeight > 0
    ? Math.round((weightedSum / maxPossibleWeight) * 100)
    : 0;

  // Determine verdict
  const verdict = determineVerdict(
    totalPopulated,
    rangeUtilizationPct,
    capitalEfficiencyPct,
    symmetryScore,
    gapCount,
    rangeWidth,
    optimalWidth
  );

  // Build reasoning
  const reasoning = buildReasoning(
    verdict,
    totalPopulated,
    activeBins.length,
    deadBins.length,
    rangeUtilizationPct,
    capitalEfficiencyPct,
    deadCapital,
    totalCapital,
    rangeWidth,
    optimalWidth,
    symmetryScore,
    gapCount,
    concentrationScore
  );

  return {
    totalPopulatedBins: totalPopulated,
    activeBins: activeBins.length,
    deadBins: deadBins.length,
    rangeUtilizationPct,
    capitalInActiveBinsPct: capitalEfficiencyPct,
    capitalInDeadBinsPct: totalCapital > 0
      ? Math.round((deadCapital / totalCapital) * 10000) / 100
      : 0,
    capitalEfficiencyPct,
    rangeWidth,
    optimalRangeWidth: optimalWidth,
    rangeVerdict: verdict,
    deadCapitalPct: totalCapital > 0
      ? Math.round((deadCapital / totalCapital) * 10000) / 100
      : 0,
    concentrationScore,
    symmetryScore,
    gapCount,
    reasoning,
  };
}

function findOptimalWidth(
  populatedBins: BinData[],
  activeBinId: number,
  pool: AppPool
): number {
  if (populatedBins.length <= 2) return populatedBins.length;

  // Sort bins by distance from active bin
  const sorted = [...populatedBins].sort(
    (a, b) => Math.abs(a.binId - activeBinId) - Math.abs(b.binId - activeBinId)
  );

  // Calculate total capital
  let totalCapital = 0;
  for (const bin of sorted) {
    totalCapital += getBinCapitalValue(bin, pool);
  }

  if (totalCapital === 0) return populatedBins.length;

  // Find minimum bins needed to capture 80% of capital
  let cumulative = 0;
  let optimalBins = 0;
  for (const bin of sorted) {
    cumulative += getBinCapitalValue(bin, pool);
    optimalBins++;
    if (cumulative >= totalCapital * 0.8) break;
  }

  // Convert to range width (bins span from closest to furthest)
  if (optimalBins === 0) return populatedBins.length;
  const maxDistance = Math.abs(sorted[optimalBins - 1].binId - activeBinId);
  return maxDistance * 2 + 1; // Symmetric range centered on active bin
}

function determineVerdict(
  totalPopulated: number,
  utilization: number,
  efficiency: number,
  symmetry: number,
  gaps: number,
  rangeWidth: number,
  optimalWidth: number
): RangeVerdict {
  // Fragmented: many gaps
  if (gaps >= 3 && gaps >= totalPopulated * 0.3) return "FRAGMENTED";

  // Too narrow: very few bins
  if (totalPopulated <= 3) return "TOO_NARROW";

  // Lopsided: very asymmetric
  if (symmetry < 30) return "LOPSIDED";

  // Too wide: range much wider than optimal, low utilization
  if (rangeWidth > optimalWidth * 2 && utilization < 50) return "TOO_WIDE";
  if (efficiency < 40 && totalPopulated > 8) return "TOO_WIDE";

  // Optimal: good utilization and efficiency
  if (utilization >= 50 && efficiency >= 60) return "OPTIMAL";
  if (concentrationOk(efficiency, utilization)) return "OPTIMAL";

  // Default: too wide if efficiency is low
  if (efficiency < 50) return "TOO_WIDE";

  return "OPTIMAL";
}

function concentrationOk(efficiency: number, utilization: number): boolean {
  return efficiency >= 70 || (efficiency >= 55 && utilization >= 60);
}

function buildReasoning(
  verdict: RangeVerdict,
  totalPopulated: number,
  activeBinCount: number,
  deadBinCount: number,
  utilization: number,
  efficiency: number,
  deadCapital: number,
  totalCapital: number,
  rangeWidth: number,
  optimalWidth: number,
  symmetry: number,
  gaps: number,
  concentration: number
): string {
  const parts: string[] = [];

  switch (verdict) {
    case "OPTIMAL":
      parts.push(`Range well-calibrated: ${utilization.toFixed(0)}% of bins earning fees, ${efficiency.toFixed(0)}% of capital active.`);
      break;
    case "TOO_WIDE":
      parts.push(`Range over-provisioned: only ${utilization.toFixed(0)}% of ${totalPopulated} bins are near the active bin.`);
      if (deadCapital > 0) {
        const deadPct = ((deadCapital / totalCapital) * 100).toFixed(0);
        parts.push(`${deadPct}% of capital sits in dead bins earning no fees.`);
      }
      if (optimalWidth < rangeWidth) {
        parts.push(`Narrowing from ${rangeWidth} to ~${optimalWidth} bins would improve efficiency.`);
      }
      break;
    case "TOO_NARROW":
      parts.push(`Only ${totalPopulated} populated bins — high rebalancing risk if price moves.`);
      parts.push("Consider widening the range to reduce frequency of required adjustments.");
      break;
    case "LOPSIDED":
      parts.push(`Liquidity skewed to one side of the active bin (symmetry: ${symmetry}%).`);
      parts.push("Rebalancing to center liquidity around the active bin would improve range capture.");
      break;
    case "FRAGMENTED":
      parts.push(`${gaps} gaps detected in the bin range — fragmented liquidity reduces efficiency.`);
      parts.push("Consolidating into a contiguous range would capture more trading activity.");
      break;
  }

  if (concentration >= 80) {
    parts.push(`Concentration score ${concentration}/100 — capital tightly focused.`);
  } else if (concentration < 40) {
    parts.push(`Concentration score ${concentration}/100 — capital spread too thin.`);
  }

  return parts.join(" ");
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
      tool: "hodlmm-range-efficiency",
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
      tool: "hodlmm-range-efficiency",
      command: "install-packs",
      status: "ok",
      message: "No additional dependencies required. Uses commander (workspace) + native fetch.",
      timestamp: new Date().toISOString(),
    })
  );
}

async function runAnalysis(options: {
  pool?: string;
  depth?: string;
}): Promise<void> {
  const poolQuery = options.pool || "sbtc-stx";
  const depth = options.depth ? parseInt(options.depth, 10) : DEFAULT_BIN_DEPTH;

  const appPools = await fetchAppPools();
  if (appPools.length === 0) {
    console.log(
      JSON.stringify({ tool: "hodlmm-range-efficiency", error: "Could not fetch pool list from Bitflow API", timestamp: new Date().toISOString() })
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
    console.log(JSON.stringify({ tool: "hodlmm-range-efficiency", error: e.message, timestamp: new Date().toISOString() }));
    return;
  }

  if (!appPool) {
    console.log(
      JSON.stringify({ tool: "hodlmm-range-efficiency", error: `Pool metadata not found for ${poolQuery}`, timestamp: new Date().toISOString() })
    );
    return;
  }

  const activeBin = await fetchActiveBin(poolId);
  if (!activeBin) {
    console.log(
      JSON.stringify({ tool: "hodlmm-range-efficiency", error: `Could not determine active bin for pool ${poolId}`, timestamp: new Date().toISOString() })
    );
    return;
  }

  const bins = await fetchBinsAroundActive(poolId, activeBin.binId, depth);

  const rangeAnalysis = analyzeRange(bins, activeBin.binId, appPool);

  // Get active bin reserves for output
  const activeBinData = bins.find((b) => b.binId === activeBin.binId);

  console.log(
    JSON.stringify({
      tool: "hodlmm-range-efficiency",
      command: "run",
      pool: {
        id: poolId,
        pair: appPool._pairLabel,
        tvlUsd: Math.round(appPool.tvlUsd || 0),
      },
      activeBin: activeBinData
        ? { binId: activeBinData.binId, reserveX: activeBinData.reserveX, reserveY: activeBinData.reserveY }
        : { binId: activeBin.binId, reserveX: 0, reserveY: 0 },
      rangeAnalysis,
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
      JSON.stringify({ tool: "hodlmm-range-efficiency", error: "Could not fetch pool list from Bitflow API", timestamp: new Date().toISOString() })
    );
    return;
  }

  const hodlmmPools = appPools.filter((p) => p._numericId > 0 && p.tvlUsd >= MIN_TVL_USD);

  const analyses: Array<{
    pair: string;
    poolId: number;
    tvlUsd: number;
    activeBinId: number;
    rangeVerdict: RangeVerdict;
    capitalEfficiencyPct: number;
    rangeUtilizationPct: number;
    deadCapitalPct: number;
    concentrationScore: number;
    populatedBins: number;
    rangeWidth: number;
    optimalRangeWidth: number;
    reasoning: string;
  }> = [];

  for (const pool of hodlmmPools) {
    if (!pool._numericId) continue;

    try {
      const activeBin = await fetchActiveBin(pool._numericId);
      if (!activeBin) continue;

      // Smaller depth for scan to stay within rate limits
      const bins = await fetchBinsAroundActive(pool._numericId, activeBin.binId, 14);
      if (bins.length === 0) continue;

      const analysis = analyzeRange(bins, activeBin.binId, pool);

      analyses.push({
        pair: pool._pairLabel,
        poolId: pool._numericId,
        tvlUsd: Math.round(pool.tvlUsd || 0),
        activeBinId: activeBin.binId,
        rangeVerdict: analysis.rangeVerdict,
        capitalEfficiencyPct: analysis.capitalEfficiencyPct,
        rangeUtilizationPct: analysis.rangeUtilizationPct,
        deadCapitalPct: analysis.deadCapitalPct,
        concentrationScore: analysis.concentrationScore,
        populatedBins: analysis.totalPopulatedBins,
        rangeWidth: analysis.rangeWidth,
        optimalRangeWidth: analysis.optimalRangeWidth,
        reasoning: analysis.reasoning,
      });
    } catch {
      // Skip pools that fail
    }
  }

  let sorted: typeof analyses;
  switch (sortBy) {
    case "dead-capital":
      sorted = analyses.sort((a, b) => b.deadCapitalPct - a.deadCapitalPct);
      break;
    case "utilization":
      sorted = analyses.sort((a, b) => b.rangeUtilizationPct - a.rangeUtilizationPct);
      break;
    default: // efficiency
      sorted = analyses.sort((a, b) => b.capitalEfficiencyPct - a.capitalEfficiencyPct);
  }

  const ranked = sorted.slice(0, topN).map((a, i) => ({ rank: i + 1, ...a }));

  console.log(
    JSON.stringify({
      tool: "hodlmm-range-efficiency",
      command: "scan",
      poolsAnalyzed: analyses.length,
      sortBy,
      topPools: ranked,
      summary: {
        optimal: analyses.filter((a) => a.rangeVerdict === "OPTIMAL").length,
        tooWide: analyses.filter((a) => a.rangeVerdict === "TOO_WIDE").length,
        tooNarrow: analyses.filter((a) => a.rangeVerdict === "TOO_NARROW").length,
        lopsided: analyses.filter((a) => a.rangeVerdict === "LOPSIDED").length,
        fragmented: analyses.filter((a) => a.rangeVerdict === "FRAGMENTED").length,
        avgEfficiency: analyses.length > 0
          ? Math.round(analyses.reduce((s, a) => s + a.capitalEfficiencyPct, 0) / analyses.length)
          : 0,
        avgConcentration: analyses.length > 0
          ? Math.round(analyses.reduce((s, a) => s + a.concentrationScore, 0) / analyses.length)
          : 0,
      },
      timestamp: new Date().toISOString(),
    })
  );
}

// ── CLI Setup ──────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-range-efficiency")
  .description("HODLMM Range Efficiency Analyzer — LP bin range utilization, dead capital detection, optimal width recommendations")
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
  .description("Analyze range efficiency for a specific pool")
  .option("--pool <id>", "Pool ID or token pair name (e.g., sbtc-stx, 1)", "sbtc-stx")
  .option("--depth <n>", "Number of bins to analyze around active bin", String(DEFAULT_BIN_DEPTH))
  .action(runAnalysis);

program
  .command("scan")
  .description("Scan all HODLMM pools for range efficiency")
  .option("--top <n>", "Number of pools to show", "10")
  .option("--sort <field>", "Sort by: efficiency, dead-capital, utilization", "efficiency")
  .action(runScanAll);

program.parse();
