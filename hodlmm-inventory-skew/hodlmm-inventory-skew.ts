#!/usr/bin/env bun
/**
 * hodlmm-inventory-skew.ts
 *
 * HODLMM Inventory Skew Monitor — Token balance asymmetry tracker for HODLMM pools.
 * Measures reserve ratios across bins to detect directional pressure, inventory risk,
 * and token accumulation/depletion patterns.
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 28).
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

// Skew thresholds
const HEAVY_SKEW_THRESHOLD = 0.75; // >75% one token = heavy skew
const MODERATE_SKEW_THRESHOLD = 0.60; // >60% one token = moderate
const EXTREME_SKEW_THRESHOLD = 0.90; // >90% one token = extreme

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
  skewRatio: number; // 0 = all Y, 0.5 = balanced, 1 = all X
}

type SkewDirection = "TOKEN_X_HEAVY" | "TOKEN_Y_HEAVY" | "BALANCED";
type SkewSeverity = "EXTREME" | "HEAVY" | "MODERATE" | "BALANCED";
type PressureSignal = "STRONG_BUY_X" | "BUY_X" | "NEUTRAL" | "BUY_Y" | "STRONG_BUY_Y";

interface SkewResult {
  overallSkewRatio: number;
  direction: SkewDirection;
  severity: SkewSeverity;
  tokenXPct: number;
  tokenYPct: number;
  tokenXUsd: number;
  tokenYUsd: number;
}

interface PressureResult {
  signal: PressureSignal;
  leftSkew: number;  // skew in bins below active (buy side)
  rightSkew: number; // skew in bins above active (sell side)
  asymmetry: number; // difference between left and right skew
  reasoning: string;
}

interface InventoryRiskResult {
  riskScore: number; // 0-100
  level: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  singleTokenExposure: number; // % of TVL in one token
  depletionWarning: boolean;
  reasoning: string;
}

interface ZoneAnalysis {
  zone: string;
  bins: number;
  skewRatio: number;
  dominantToken: string;
  totalUsd: number;
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

// ── Bin Scanning ───────────────────────────────────────────────────────────────

async function scanBins(
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

  const scanRadius = radius * 2;
  const binIds: number[] = [];
  for (let i = 0; i <= scanRadius; i++) {
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
        const skewRatio = totalUsd > 0 ? reserveXUsd / totalUsd : 0.5;
        return {
          binId,
          reserveX: reserves.reserveX,
          reserveY: reserves.reserveY,
          reserveXUsd: Math.round(reserveXUsd * 100) / 100,
          reserveYUsd: Math.round(reserveYUsd * 100) / 100,
          totalUsd: Math.round(totalUsd * 100) / 100,
          distanceFromActive: binId - activeBinId, // signed: negative = below, positive = above
          skewRatio: Math.round(skewRatio * 1000) / 1000,
        };
      })
    );
    bins.push(...results);
  }

  return bins.filter((b) => b.totalUsd > 0).sort((a, b) => a.binId - b.binId);
}

// ── Analysis Functions ─────────────────────────────────────────────────────────

function computeOverallSkew(bins: BinData[], pool: AppPool): SkewResult {
  const totalXUsd = bins.reduce((s, b) => s + b.reserveXUsd, 0);
  const totalYUsd = bins.reduce((s, b) => s + b.reserveYUsd, 0);
  const totalUsd = totalXUsd + totalYUsd;

  const overallSkewRatio = totalUsd > 0 ? totalXUsd / totalUsd : 0.5;
  const tokenXPct = Math.round(overallSkewRatio * 1000) / 10;
  const tokenYPct = Math.round((1 - overallSkewRatio) * 1000) / 10;

  let direction: SkewDirection;
  if (overallSkewRatio > 0.55) direction = "TOKEN_X_HEAVY";
  else if (overallSkewRatio < 0.45) direction = "TOKEN_Y_HEAVY";
  else direction = "BALANCED";

  const dominantPct = Math.max(overallSkewRatio, 1 - overallSkewRatio);
  let severity: SkewSeverity;
  if (dominantPct >= EXTREME_SKEW_THRESHOLD) severity = "EXTREME";
  else if (dominantPct >= HEAVY_SKEW_THRESHOLD) severity = "HEAVY";
  else if (dominantPct >= MODERATE_SKEW_THRESHOLD) severity = "MODERATE";
  else severity = "BALANCED";

  return {
    overallSkewRatio: Math.round(overallSkewRatio * 1000) / 1000,
    direction,
    severity,
    tokenXPct,
    tokenYPct,
    tokenXUsd: Math.round(totalXUsd),
    tokenYUsd: Math.round(totalYUsd),
  };
}

function computeDirectionalPressure(bins: BinData[], activeBinId: number): PressureResult {
  const leftBins = bins.filter((b) => b.binId < activeBinId);
  const rightBins = bins.filter((b) => b.binId > activeBinId);

  // Left side (below active): buy-side liquidity. More token Y = ready to buy X
  const leftXUsd = leftBins.reduce((s, b) => s + b.reserveXUsd, 0);
  const leftYUsd = leftBins.reduce((s, b) => s + b.reserveYUsd, 0);
  const leftTotal = leftXUsd + leftYUsd;
  const leftSkew = leftTotal > 0 ? leftXUsd / leftTotal : 0.5;

  // Right side (above active): sell-side liquidity. More token X = ready to sell X
  const rightXUsd = rightBins.reduce((s, b) => s + b.reserveXUsd, 0);
  const rightYUsd = rightBins.reduce((s, b) => s + b.reserveYUsd, 0);
  const rightTotal = rightXUsd + rightYUsd;
  const rightSkew = rightTotal > 0 ? rightXUsd / rightTotal : 0.5;

  // Asymmetry: positive = more sell pressure (X heavy on right), negative = more buy pressure
  const asymmetry = Math.round((rightSkew - leftSkew) * 1000) / 1000;

  let signal: PressureSignal;
  let reasoning: string;

  if (asymmetry > 0.3) {
    signal = "STRONG_BUY_Y";
    reasoning = "Heavy token X reserves above active bin — significant sell pressure on X, buy pressure on Y.";
  } else if (asymmetry > 0.15) {
    signal = "BUY_Y";
    reasoning = "Moderate token X accumulation above active bin — some sell pressure on X.";
  } else if (asymmetry < -0.3) {
    signal = "STRONG_BUY_X";
    reasoning = "Heavy token Y reserves below active bin — significant buy pressure on X.";
  } else if (asymmetry < -0.15) {
    signal = "BUY_X";
    reasoning = "Moderate token Y accumulation below active bin — some buy pressure on X.";
  } else {
    signal = "NEUTRAL";
    reasoning = "Reserve distribution is relatively symmetric around active bin.";
  }

  return {
    signal,
    leftSkew: Math.round(leftSkew * 1000) / 1000,
    rightSkew: Math.round(rightSkew * 1000) / 1000,
    asymmetry,
    reasoning,
  };
}

function computeInventoryRisk(skew: SkewResult, pool: AppPool): InventoryRiskResult {
  const dominantPct = Math.max(skew.tokenXPct, skew.tokenYPct);
  const depletionWarning = dominantPct > 85;

  // Risk score based on how far from 50/50
  const imbalance = Math.abs(skew.overallSkewRatio - 0.5) * 2; // 0 = balanced, 1 = fully one-sided
  const riskScore = Math.round(imbalance * 100);

  let level: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  if (riskScore >= 80) level = "CRITICAL";
  else if (riskScore >= 50) level = "HIGH";
  else if (riskScore >= 20) level = "MODERATE";
  else level = "LOW";

  const dominantToken = skew.tokenXPct > skew.tokenYPct
    ? pool.token0Symbol
    : pool.token1Symbol;
  const depletedToken = skew.tokenXPct > skew.tokenYPct
    ? pool.token1Symbol
    : pool.token0Symbol;

  let reasoning: string;
  if (level === "CRITICAL") {
    reasoning = `Pool is ${dominantPct}% ${dominantToken} — ${depletedToken} nearly depleted. LPs face maximum one-sided exposure.`;
  } else if (level === "HIGH") {
    reasoning = `Pool is ${dominantPct}% ${dominantToken}. Significant inventory imbalance — LPs hold disproportionate ${dominantToken} risk.`;
  } else if (level === "MODERATE") {
    reasoning = `Pool shows moderate ${dominantToken} tilt (${dominantPct}%). Normal for directional markets.`;
  } else {
    reasoning = `Pool is near 50/50 balance. Inventory risk is minimal.`;
  }

  return {
    riskScore,
    level,
    singleTokenExposure: dominantPct,
    depletionWarning,
    reasoning,
  };
}

function computeZoneAnalysis(
  bins: BinData[],
  activeBinId: number,
  radius: number,
  pool: AppPool
): ZoneAnalysis[] {
  const zones: ZoneAnalysis[] = [];

  // Zone 1: Inner range (within radius of active)
  const innerBins = bins.filter((b) => Math.abs(b.binId - activeBinId) <= radius);
  const innerXUsd = innerBins.reduce((s, b) => s + b.reserveXUsd, 0);
  const innerYUsd = innerBins.reduce((s, b) => s + b.reserveYUsd, 0);
  const innerTotal = innerXUsd + innerYUsd;
  const innerSkew = innerTotal > 0 ? innerXUsd / innerTotal : 0.5;
  zones.push({
    zone: "inner",
    bins: innerBins.length,
    skewRatio: Math.round(innerSkew * 1000) / 1000,
    dominantToken: innerSkew > 0.5 ? pool.token0Symbol : pool.token1Symbol,
    totalUsd: Math.round(innerTotal),
  });

  // Zone 2: Left outer (below active, beyond radius)
  const leftOuter = bins.filter((b) => b.binId < activeBinId - radius);
  if (leftOuter.length > 0) {
    const loXUsd = leftOuter.reduce((s, b) => s + b.reserveXUsd, 0);
    const loYUsd = leftOuter.reduce((s, b) => s + b.reserveYUsd, 0);
    const loTotal = loXUsd + loYUsd;
    const loSkew = loTotal > 0 ? loXUsd / loTotal : 0.5;
    zones.push({
      zone: "left_outer",
      bins: leftOuter.length,
      skewRatio: Math.round(loSkew * 1000) / 1000,
      dominantToken: loSkew > 0.5 ? pool.token0Symbol : pool.token1Symbol,
      totalUsd: Math.round(loTotal),
    });
  }

  // Zone 3: Right outer (above active, beyond radius)
  const rightOuter = bins.filter((b) => b.binId > activeBinId + radius);
  if (rightOuter.length > 0) {
    const roXUsd = rightOuter.reduce((s, b) => s + b.reserveXUsd, 0);
    const roYUsd = rightOuter.reduce((s, b) => s + b.reserveYUsd, 0);
    const roTotal = roXUsd + roYUsd;
    const roSkew = roTotal > 0 ? roXUsd / roTotal : 0.5;
    zones.push({
      zone: "right_outer",
      bins: rightOuter.length,
      skewRatio: Math.round(roSkew * 1000) / 1000,
      dominantToken: roSkew > 0.5 ? pool.token0Symbol : pool.token1Symbol,
      totalUsd: Math.round(roTotal),
    });
  }

  return zones;
}

function generateReasoning(
  skew: SkewResult,
  pressure: PressureResult,
  risk: InventoryRiskResult,
  pool: AppPool
): string[] {
  const reasons: string[] = [];

  reasons.push(
    `Pool is ${skew.tokenXPct}% ${pool.token0Symbol} / ${skew.tokenYPct}% ${pool.token1Symbol} (${skew.severity} skew, ${skew.direction}).`
  );

  if (pressure.signal !== "NEUTRAL") {
    reasons.push(`Directional pressure: ${pressure.signal}. ${pressure.reasoning}`);
  } else {
    reasons.push("No significant directional pressure detected.");
  }

  reasons.push(`Inventory risk: ${risk.level} (score ${risk.riskScore}/100). ${risk.reasoning}`);

  if (risk.depletionWarning) {
    const depleted = skew.tokenXPct < skew.tokenYPct ? pool.token0Symbol : pool.token1Symbol;
    reasons.push(`WARNING: ${depleted} is nearly depleted. Pool may fail to fill ${depleted} buy orders.`);
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
    const result = await callReadOnly("get-active-bin-id", [encodeUint(1)]);
    results["contract_read"] = result.result ? "ok" : "no result";
  } catch (e: any) {
    results["contract_read"] = `error: ${e.message}`;
  }

  console.log(
    JSON.stringify({
      tool: "hodlmm-inventory-skew",
      command: "doctor",
      status: Object.values(results).every((v) => v === "ok") ? "healthy" : "degraded",
      checks: results,
    })
  );
}

async function runInstallPacks(): Promise<void> {
  console.log(
    JSON.stringify({
      tool: "hodlmm-inventory-skew",
      command: "install-packs",
      status: "ok",
      message: "No additional dependencies required. Uses commander (workspace) + native fetch.",
    })
  );
}

async function runSkewAnalysis(options: {
  pool?: string;
  radius?: string;
}): Promise<void> {
  const poolQuery = options.pool || "sbtc-stx";
  const radius = options.radius ? parseInt(options.radius, 10) : DEFAULT_RADIUS;

  const appPools = await fetchAppPools();
  if (appPools.length === 0) {
    console.log(
      JSON.stringify({ tool: "hodlmm-inventory-skew", error: "Could not fetch pool list from Bitflow API" })
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
    console.log(JSON.stringify({ tool: "hodlmm-inventory-skew", error: e.message }));
    return;
  }

  if (!appPool) {
    console.log(
      JSON.stringify({ tool: "hodlmm-inventory-skew", error: `Pool metadata not found for ${poolQuery}` })
    );
    return;
  }

  const activeBinId = appPool.activeBinId || (await fetchActiveBin(poolId));
  if (!activeBinId) {
    console.log(
      JSON.stringify({ tool: "hodlmm-inventory-skew", error: `Could not determine active bin for pool ${poolId}` })
    );
    return;
  }

  const bins = await scanBins(poolId, activeBinId, radius, appPool);
  const skew = computeOverallSkew(bins, appPool);
  const pressure = computeDirectionalPressure(bins, activeBinId);
  const risk = computeInventoryRisk(skew, appPool);
  const zones = computeZoneAnalysis(bins, activeBinId, radius, appPool);
  const reasoning = generateReasoning(skew, pressure, risk, appPool);

  console.log(
    JSON.stringify({
      tool: "hodlmm-inventory-skew",
      command: "run",
      pool: {
        id: poolId,
        pair: `${appPool.token0Symbol}-${appPool.token1Symbol}`,
        tvlUsd: Math.round(appPool.tvlUsd || 0),
        activeBinId,
      },
      skew,
      pressure,
      inventoryRisk: risk,
      zones,
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
  const sortBy = options.sort || "skew";

  const appPools = await fetchAppPools();
  if (appPools.length === 0) {
    console.log(
      JSON.stringify({ tool: "hodlmm-inventory-skew", error: "Could not fetch pool list from Bitflow API" })
    );
    return;
  }

  const hodlmmPools = appPools.filter((p) => p.poolId && p.poolId > 0 && p.tvlUsd >= MIN_TVL_USD);
  const analyses: Array<{
    pair: string;
    poolId: number;
    tvlUsd: number;
    tokenXPct: number;
    tokenYPct: number;
    direction: SkewDirection;
    severity: SkewSeverity;
    pressureSignal: PressureSignal;
    inventoryRiskLevel: string;
    inventoryRiskScore: number;
    depletionWarning: boolean;
  }> = [];

  for (const pool of hodlmmPools) {
    if (!pool.poolId) continue;

    const activeBinId = pool.activeBinId || (await fetchActiveBin(pool.poolId));
    if (!activeBinId) continue;

    const bins = await scanBins(pool.poolId, activeBinId, DEFAULT_RADIUS, pool);
    const skew = computeOverallSkew(bins, pool);
    const pressure = computeDirectionalPressure(bins, activeBinId);
    const risk = computeInventoryRisk(skew, pool);

    analyses.push({
      pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
      poolId: pool.poolId,
      tvlUsd: Math.round(pool.tvlUsd || 0),
      tokenXPct: skew.tokenXPct,
      tokenYPct: skew.tokenYPct,
      direction: skew.direction,
      severity: skew.severity,
      pressureSignal: pressure.signal,
      inventoryRiskLevel: risk.level,
      inventoryRiskScore: risk.riskScore,
      depletionWarning: risk.depletionWarning,
    });
  }

  let sorted: typeof analyses;
  switch (sortBy) {
    case "risk":
      sorted = analyses.sort((a, b) => b.inventoryRiskScore - a.inventoryRiskScore);
      break;
    case "tvl":
      sorted = analyses.sort((a, b) => b.tvlUsd - a.tvlUsd);
      break;
    default: // skew — most imbalanced first
      sorted = analyses.sort((a, b) => {
        const aImbalance = Math.abs(a.tokenXPct - 50);
        const bImbalance = Math.abs(b.tokenXPct - 50);
        return bImbalance - aImbalance;
      });
  }

  const ranked = sorted.slice(0, topN).map((a, i) => ({ rank: i + 1, ...a }));

  console.log(
    JSON.stringify({
      tool: "hodlmm-inventory-skew",
      command: "scan",
      poolsAnalyzed: analyses.length,
      sortBy,
      topPools: ranked,
      summary: {
        extremeSkew: analyses.filter((a) => a.severity === "EXTREME").length,
        heavySkew: analyses.filter((a) => a.severity === "HEAVY").length,
        moderateSkew: analyses.filter((a) => a.severity === "MODERATE").length,
        balanced: analyses.filter((a) => a.severity === "BALANCED").length,
        depletionWarnings: analyses.filter((a) => a.depletionWarning).length,
        avgRiskScore: analyses.length > 0
          ? Math.round(analyses.reduce((s, a) => s + a.inventoryRiskScore, 0) / analyses.length)
          : 0,
      },
      timestamp: new Date().toISOString(),
    })
  );
}

// ── CLI Setup ──────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-inventory-skew")
  .description("HODLMM Inventory Skew Monitor — Token balance asymmetry, directional pressure, and inventory risk")
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
  .description("Analyze inventory skew for a specific pool")
  .option("--pool <id>", "Pool ID or token pair name (e.g., sbtc-stx, 1)", "sbtc-stx")
  .option("--radius <n>", "Bins around active bin to scan", String(DEFAULT_RADIUS))
  .action(runSkewAnalysis);

program
  .command("scan")
  .description("Scan all HODLMM pools for inventory skew")
  .option("--top <n>", "Number of pools to show", "10")
  .option("--sort <field>", "Sort by: skew, risk, tvl", "skew")
  .action(runScanAll);

program.parse();
