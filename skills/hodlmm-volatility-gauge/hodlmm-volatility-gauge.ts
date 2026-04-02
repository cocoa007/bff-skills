#!/usr/bin/env bun
/**
 * hodlmm-volatility-gauge.ts
 *
 * HODLMM Volatility Gauge — Price volatility analysis for concentrated LP pools.
 * Analyzes bin-level reserve distributions and active bin positioning to estimate
 * volatility regime, bin migration patterns, and risk-adjusted position sizing.
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 22).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78"; // Read-only sender

const DEFAULT_SCAN_RANGE = 30; // bins on each side of active
const BIN_STEP_PRICE_FACTOR = 0.0001; // Each bin step ≈ 0.01% price change (base)

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
}

interface BinData {
  binId: number;
  reserveX: number;
  reserveY: number;
  totalReserveUsd: number;
  distanceFromActive: number;
  priceImpact: number;
}

interface ReserveAsymmetry {
  ratio: number; // 0 = all Y, 1 = all X, 0.5 = balanced
  dominantSide: "X" | "Y" | "balanced";
  skewMagnitude: number; // 0-1 how skewed
}

interface VolatilityProfile {
  regime: "LOW" | "MODERATE" | "HIGH" | "EXTREME";
  score: number; // 0-100
  binStep: number;
  activeBinId: number;
  reserveConcentration: number; // % of liquidity in active ± 2 bins
  reserveSpread: number; // how spread out reserves are
  asymmetryTrend: ReserveAsymmetry;
  emptyBinRatio: number; // % of scanned bins with zero reserves
  liquidityWalls: LiquidityWall[];
  effectivePriceRange: { lowerPct: number; upperPct: number };
  positionSizing: PositionSizing;
  recommendations: string[];
}

interface LiquidityWall {
  binId: number;
  side: "bid" | "ask";
  reserveUsd: number;
  distanceFromActive: number;
  pricePctFromActive: number;
}

interface PositionSizing {
  suggestedRangeBins: number;
  suggestedRangePct: number;
  riskLevel: "conservative" | "moderate" | "aggressive";
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

function parseUintFromResult(text: string, field: string): number | null {
  const re = new RegExp(`${field}\\s+u(\\d+)`);
  const m = text.match(re);
  return m ? parseInt(m[1], 10) : null;
}

function pricePctFromBinDistance(distance: number, binStep: number): number {
  return Math.abs(distance) * binStep * BIN_STEP_PRICE_FACTOR * 100;
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
    const batch = [];
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
          const distance = binId - activeBinId;
          return {
            binId,
            reserveX,
            reserveY,
            totalReserveUsd: 0, // computed later with prices
            distanceFromActive: distance,
            priceImpact: 0,
          };
        } catch {
          return {
            binId,
            reserveX: 0,
            reserveY: 0,
            totalReserveUsd: 0,
            distanceFromActive: binId - activeBinId,
            priceImpact: 0,
          };
        }
      })
    );
    bins.push(...results);
  }
  return bins;
}

// ── Analysis Functions ─────────────────────────────────────────────────────────

function computeReserveAsymmetry(bins: BinData[]): ReserveAsymmetry {
  let totalX = 0;
  let totalY = 0;
  for (const b of bins) {
    totalX += b.reserveX;
    totalY += b.reserveY;
  }
  const total = totalX + totalY;
  if (total === 0) return { ratio: 0.5, dominantSide: "balanced", skewMagnitude: 0 };

  const ratio = totalX / total;
  const skew = Math.abs(ratio - 0.5) * 2; // 0 = balanced, 1 = fully one-sided
  const side: "X" | "Y" | "balanced" = skew < 0.15 ? "balanced" : ratio > 0.5 ? "X" : "Y";

  return { ratio, dominantSide: side, skewMagnitude: skew };
}

function computeConcentration(bins: BinData[], activeBinId: number): number {
  const totalReserve = bins.reduce((s, b) => s + b.reserveX + b.reserveY, 0);
  if (totalReserve === 0) return 0;

  const nearBins = bins.filter((b) => Math.abs(b.binId - activeBinId) <= 2);
  const nearReserve = nearBins.reduce((s, b) => s + b.reserveX + b.reserveY, 0);
  return nearReserve / totalReserve;
}

function computeReserveSpread(bins: BinData[]): number {
  const nonEmpty = bins.filter((b) => b.reserveX + b.reserveY > 0);
  if (nonEmpty.length < 2) return 0;

  const totalReserve = nonEmpty.reduce((s, b) => s + b.reserveX + b.reserveY, 0);
  const mean = totalReserve / nonEmpty.length;

  let variance = 0;
  for (const b of nonEmpty) {
    const diff = b.reserveX + b.reserveY - mean;
    variance += diff * diff;
  }
  variance /= nonEmpty.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? stdDev / mean : 0; // Coefficient of variation

  return Math.min(cv, 5); // cap at 5 for scoring
}

function findLiquidityWalls(
  bins: BinData[],
  activeBinId: number,
  binStep: number,
  topN: number = 3
): LiquidityWall[] {
  const nonActive = bins.filter((b) => Math.abs(b.binId - activeBinId) > 1);

  return nonActive
    .filter((b) => b.reserveX + b.reserveY > 0)
    .map((b) => ({
      binId: b.binId,
      side: (b.binId > activeBinId ? "ask" : "bid") as "bid" | "ask",
      reserveUsd: b.totalReserveUsd || b.reserveX + b.reserveY,
      distanceFromActive: Math.abs(b.binId - activeBinId),
      pricePctFromActive: pricePctFromBinDistance(b.binId - activeBinId, binStep),
    }))
    .sort((a, b) => b.reserveUsd - a.reserveUsd)
    .slice(0, topN);
}

function computeEffectivePriceRange(
  bins: BinData[],
  activeBinId: number,
  binStep: number
): { lowerPct: number; upperPct: number } {
  const totalReserve = bins.reduce((s, b) => s + b.reserveX + b.reserveY, 0);
  if (totalReserve === 0) return { lowerPct: 0, upperPct: 0 };

  // Find range containing 90% of liquidity
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  let cumulative = 0;
  let lowerBin = activeBinId;
  let upperBin = activeBinId;
  const threshold = totalReserve * 0.9;

  for (const b of sorted) {
    cumulative += b.reserveX + b.reserveY;
    if (cumulative <= totalReserve * 0.05) lowerBin = b.binId;
    if (cumulative <= threshold) upperBin = b.binId;
  }

  return {
    lowerPct: pricePctFromBinDistance(activeBinId - lowerBin, binStep),
    upperPct: pricePctFromBinDistance(upperBin - activeBinId, binStep),
  };
}

function computeVolatilityScore(
  concentration: number,
  spread: number,
  asymmetry: ReserveAsymmetry,
  emptyRatio: number,
  volume24h: number,
  tvl: number
): number {
  // Higher score = higher implied volatility
  let score = 0;

  // Low concentration → reserves spread thin → higher volatility expectation
  score += (1 - concentration) * 25;

  // High spread (CV) → uneven distribution → volatility indicator
  score += Math.min(spread / 3, 1) * 20;

  // High asymmetry → directional pressure → potential volatility
  score += asymmetry.skewMagnitude * 20;

  // Many empty bins → fragmented liquidity → higher effective volatility
  score += emptyRatio * 15;

  // High volume/TVL ratio → active trading → realized volatility
  const volTvlRatio = tvl > 0 ? volume24h / tvl : 0;
  score += Math.min(volTvlRatio / 2, 1) * 20;

  return Math.round(Math.min(Math.max(score, 0), 100));
}

function classifyRegime(score: number): "LOW" | "MODERATE" | "HIGH" | "EXTREME" {
  if (score < 25) return "LOW";
  if (score < 50) return "MODERATE";
  if (score < 75) return "HIGH";
  return "EXTREME";
}

function computePositionSizing(
  score: number,
  binStep: number,
  concentration: number
): PositionSizing {
  if (score < 25) {
    const rangeBins = Math.max(5, Math.round(10 / (binStep * BIN_STEP_PRICE_FACTOR * 100 + 0.01)));
    return {
      suggestedRangeBins: rangeBins,
      suggestedRangePct: pricePctFromBinDistance(rangeBins, binStep),
      riskLevel: "aggressive",
      reasoning:
        "Low volatility environment. Tight ranges maximize fee capture with minimal IL risk.",
    };
  } else if (score < 50) {
    const rangeBins = Math.max(10, Math.round(20 / (binStep * BIN_STEP_PRICE_FACTOR * 100 + 0.01)));
    return {
      suggestedRangeBins: rangeBins,
      suggestedRangePct: pricePctFromBinDistance(rangeBins, binStep),
      riskLevel: "moderate",
      reasoning:
        "Moderate volatility. Balance between fee capture and IL protection with medium range.",
    };
  } else if (score < 75) {
    const rangeBins = Math.max(20, Math.round(40 / (binStep * BIN_STEP_PRICE_FACTOR * 100 + 0.01)));
    return {
      suggestedRangeBins: rangeBins,
      suggestedRangePct: pricePctFromBinDistance(rangeBins, binStep),
      riskLevel: "conservative",
      reasoning:
        "High volatility. Wide ranges protect against IL — consider reducing position size.",
    };
  } else {
    const rangeBins = Math.max(30, Math.round(60 / (binStep * BIN_STEP_PRICE_FACTOR * 100 + 0.01)));
    return {
      suggestedRangeBins: rangeBins,
      suggestedRangePct: pricePctFromBinDistance(rangeBins, binStep),
      riskLevel: "conservative",
      reasoning:
        "Extreme volatility. Consider waiting for regime change or use maximum range with small position.",
    };
  }
}

function generateRecommendations(
  regime: string,
  concentration: number,
  asymmetry: ReserveAsymmetry,
  emptyRatio: number,
  walls: LiquidityWall[]
): string[] {
  const recs: string[] = [];

  if (regime === "EXTREME") {
    recs.push("CAUTION: Extreme volatility regime — consider reducing exposure or widening ranges significantly.");
  }

  if (concentration > 0.8) {
    recs.push("Highly concentrated liquidity near active bin — tight ranges viable but watch for sudden moves.");
  } else if (concentration < 0.3) {
    recs.push("Liquidity spread thin across bins — wider range needed to stay in range.");
  }

  if (asymmetry.skewMagnitude > 0.5) {
    const direction = asymmetry.dominantSide === "X" ? "token X (sell pressure)" : "token Y (buy pressure)";
    recs.push(`Strong reserve asymmetry toward ${direction} — potential directional move incoming.`);
  }

  if (emptyRatio > 0.5) {
    recs.push("Many empty bins detected — fragmented liquidity may cause larger price jumps between bins.");
  }

  if (walls.length > 0) {
    const biggestWall = walls[0];
    recs.push(
      `Largest liquidity wall at bin ${biggestWall.binId} (${biggestWall.pricePctFromActive.toFixed(2)}% ${biggestWall.side}) — may act as support/resistance.`
    );
  }

  if (regime === "LOW" && concentration > 0.6) {
    recs.push("Favorable conditions for tight-range LPing — low vol + concentrated liquidity.");
  }

  if (recs.length === 0) {
    recs.push("Standard conditions — monitor regime changes and adjust range accordingly.");
  }

  return recs;
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
    // Test read-only call with pool 1
    await callReadOnly("get-pool", [encodeUint(1)]);
    results["dlmm_contract"] = "ok";
  } catch (e: any) {
    results["dlmm_contract"] = `error: ${e.message}`;
  }

  console.log(
    JSON.stringify({
      tool: "hodlmm-volatility-gauge",
      command: "doctor",
      status: Object.values(results).every((v) => v === "ok") ? "healthy" : "degraded",
      checks: results,
    })
  );
}

async function runInstallPacks(): Promise<void> {
  console.log(
    JSON.stringify({
      tool: "hodlmm-volatility-gauge",
      command: "install-packs",
      status: "ok",
      message: "No additional dependencies required. Uses commander (workspace) + native fetch.",
    })
  );
}

async function runVolatilityAnalysis(options: {
  pool?: string;
  range?: string;
}): Promise<void> {
  const scanRange = options.range ? parseInt(options.range, 10) : DEFAULT_SCAN_RANGE;
  const poolQuery = options.pool || "sbtc-stx";

  // 1. Fetch pools from Bitflow
  const appPools = await fetchAppPools();
  if (appPools.length === 0) {
    console.log(
      JSON.stringify({ tool: "hodlmm-volatility-gauge", error: "Could not fetch pool list from Bitflow API" })
    );
    return;
  }

  // 2. Resolve pool
  let poolId: number;
  let appPool: AppPool | null;
  try {
    const resolved = await resolvePool(poolQuery, appPools);
    poolId = resolved.poolId;
    appPool = resolved.pool;
  } catch (e: any) {
    console.log(JSON.stringify({ tool: "hodlmm-volatility-gauge", error: e.message }));
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
    // Fallback: use app data
    console.log(
      JSON.stringify({
        tool: "hodlmm-volatility-gauge",
        error: `On-chain pool data unavailable: ${e.message}. Hiro read-only sender may be blocked for DLMM calls.`,
        suggestion: "Try with a specific numeric pool ID",
      })
    );
    return;
  }

  // 4. Scan bin reserves
  const bins = await fetchBinReserves(poolId, activeBinId, scanRange);

  // 5. Enrich with USD values if we have price data
  if (appPool) {
    for (const b of bins) {
      const xUsd = (b.reserveX / Math.pow(10, appPool.token0Decimals || 6)) * (appPool.token0PriceUsd || 0);
      const yUsd = (b.reserveY / Math.pow(10, appPool.token1Decimals || 6)) * (appPool.token1PriceUsd || 0);
      b.totalReserveUsd = xUsd + yUsd;
    }
  }

  // 6. Compute volatility metrics
  const concentration = computeConcentration(bins, activeBinId);
  const spread = computeReserveSpread(bins);
  const asymmetry = computeReserveAsymmetry(bins);
  const totalBins = bins.length;
  const emptyBins = bins.filter((b) => b.reserveX + b.reserveY === 0).length;
  const emptyRatio = totalBins > 0 ? emptyBins / totalBins : 0;
  const walls = findLiquidityWalls(bins, activeBinId, binStep);
  const priceRange = computeEffectivePriceRange(bins, activeBinId, binStep);

  const volume24h = appPool?.volume24hUsd || 0;
  const tvl = appPool?.tvlUsd || 0;

  const score = computeVolatilityScore(concentration, spread, asymmetry, emptyRatio, volume24h, tvl);
  const regime = classifyRegime(score);
  const positionSizing = computePositionSizing(score, binStep, concentration);
  const recommendations = generateRecommendations(regime, concentration, asymmetry, emptyRatio, walls);

  const profile: VolatilityProfile = {
    regime,
    score,
    binStep,
    activeBinId,
    reserveConcentration: Math.round(concentration * 1000) / 10,
    reserveSpread: Math.round(spread * 100) / 100,
    asymmetryTrend: asymmetry,
    emptyBinRatio: Math.round(emptyRatio * 1000) / 10,
    liquidityWalls: walls,
    effectivePriceRange: {
      lowerPct: Math.round(priceRange.lowerPct * 100) / 100,
      upperPct: Math.round(priceRange.upperPct * 100) / 100,
    },
    positionSizing,
    recommendations,
  };

  console.log(
    JSON.stringify({
      tool: "hodlmm-volatility-gauge",
      command: "run",
      pool: {
        id: poolId,
        pair: appPool ? `${appPool.token0Symbol}-${appPool.token1Symbol}` : `pool-${poolId}`,
        tvlUsd: tvl,
        volume24hUsd: volume24h,
      },
      scan: {
        range: scanRange,
        totalBins: totalBins,
        nonEmptyBins: totalBins - emptyBins,
      },
      volatility: profile,
      timestamp: new Date().toISOString(),
    })
  );
}

// ── CLI Setup ──────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-volatility-gauge")
  .description("HODLMM Volatility Gauge — Price volatility analysis for concentrated LP pools")
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
  .description("Analyze volatility regime for a HODLMM pool")
  .option("--pool <id>", "Pool ID or token pair name (e.g., sbtc-stx, 1)", "sbtc-stx")
  .option("--range <bins>", "Number of bins to scan on each side of active", String(DEFAULT_SCAN_RANGE))
  .action(runVolatilityAnalysis);

program.parse();
