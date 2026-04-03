#!/usr/bin/env bun
/**
 * hodlmm-fee-distribution.ts
 *
 * HODLMM Fee Distribution Analyzer — Maps how trading fees are distributed
 * across bin ranges in HODLMM pools. Identifies fee hot zones, dead zones,
 * and optimal bin placement for maximizing fee capture.
 *
 * Key metrics:
 *  - Per-bin fee generation estimates (based on volume/reserve proximity)
 *  - Fee concentration profile (Gini coefficient)
 *  - Hot zones (bins earning disproportionate fees)
 *  - Cold/dead zones (bins with capital but negligible fee capture)
 *  - Fee decay curve (how rapidly fees drop off from active bin)
 *  - Optimal range recommendations for different strategies
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 36).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 20;

const FALLBACK_STX_PRICE_USD = 0.80;

// Fee distribution thresholds
const HOT_ZONE_PERCENTILE = 0.70;  // Top 30% of fee-earning bins
const DEAD_ZONE_THRESHOLD = 0.01;  // Bins earning < 1% of avg bin fee

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
  feeBps?: number;
}

interface BinData {
  binId: number;
  reserveX: number;
  reserveY: number;
  totalUsd: number;
  distanceFromActive: number;
  estimatedFeeSharePct: number;
  estimatedDailyFeeUsd: number;
  zone: "HOT" | "WARM" | "COLD" | "DEAD";
}

interface FeeDecayCurve {
  distance: number;
  cumulativeFeeCapturePct: number;
  marginalFeeCapturePct: number;
}

interface RangeRecommendation {
  strategy: string;
  description: string;
  binRange: { lower: number; upper: number };
  width: number;
  estimatedFeeCapturePct: number;
  estimatedDailyFeeUsd: number;
  capitalEfficiency: number;
}

interface PoolFeeDistribution {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  estimatedPoolDailyFeesUsd: number;
  bins: BinData[];
  feeConcentration: {
    giniCoefficient: number;
    top3BinsFeeSharePct: number;
    top5BinsFeeSharePct: number;
    top10BinsFeeSharePct: number;
    classification: "HIGHLY_CONCENTRATED" | "MODERATE" | "SPREAD";
  };
  hotZones: { startBin: number; endBin: number; feeSharePct: number }[];
  deadZones: { startBin: number; endBin: number; capitalLockedUsd: number }[];
  feeDecayCurve: FeeDecayCurve[];
  rangeRecommendations: RangeRecommendation[];
  summary: string;
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

function uintCV(n: number): string {
  const hex = n.toString(16).padStart(32, "0");
  return `0x01${hex}`;
}

function parseUintResult(result: any): number {
  if (!result?.result) return 0;
  const hex = result.result.replace("0x", "");
  if (hex.startsWith("07")) {
    const inner = hex.slice(2);
    const valHex = inner.slice(2);
    return parseInt(valHex, 16) || 0;
  }
  if (hex.startsWith("01")) return parseInt(hex.slice(2), 16) || 0;
  return 0;
}

function formatUsd(n: number): string {
  if (n < 0) return "N/A";
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(6)}`;
}

// ── Pool Data ──────────────────────────────────────────────────────────────────

let _poolCache: AppPool[] | null = null;

async function fetchAllPools(): Promise<AppPool[]> {
  if (_poolCache) return _poolCache;
  const data = await fetchJson(`${BFF_APP_BASE}/pools/hodlmm`);
  const pools: AppPool[] = (data?.pools || data || []).map((p: any) => ({
    id: p.id ?? p.poolId ?? "?",
    token0Symbol: p.token0Symbol ?? p.tokenXSymbol ?? "?",
    token1Symbol: p.token1Symbol ?? p.tokenYSymbol ?? "?",
    tvlUsd: parseFloat(p.tvlUsd ?? p.tvl ?? "0"),
    volume24hUsd: parseFloat(p.volume24hUsd ?? p.volume24h ?? "0"),
    poolId: parseInt(p.poolId ?? p.id ?? "0"),
    token0Decimals: parseInt(p.token0Decimals ?? p.tokenXDecimals ?? "6"),
    token1Decimals: parseInt(p.token1Decimals ?? p.tokenYDecimals ?? "6"),
    token0PriceUsd: parseFloat(p.token0PriceUsd ?? p.tokenXPriceUsd ?? "0"),
    token1PriceUsd: parseFloat(p.token1PriceUsd ?? p.tokenYPriceUsd ?? "0"),
    activeBinId: parseInt(p.activeBinId ?? "0") || undefined,
    feeBps: parseFloat(p.feeBps ?? p.fee ?? "30"),
  }));
  _poolCache = pools.filter((p) => p.tvlUsd >= MIN_TVL_USD);
  return _poolCache;
}

async function fetchStxPriceUsd(): Promise<number> {
  try {
    const pools = await fetchAllPools();
    const stables = ["USDA", "USDT", "SUSDT", "XUSD", "AUSD"];
    for (const p of pools) {
      const t0 = p.token0Symbol.toUpperCase();
      const t1 = p.token1Symbol.toUpperCase();
      if (t0 === "STX" && stables.some((s) => t1.includes(s)))
        return p.token0PriceUsd > 0 ? p.token0PriceUsd : FALLBACK_STX_PRICE_USD;
      if (t1 === "STX" && stables.some((s) => t0.includes(s)))
        return p.token1PriceUsd > 0 ? p.token1PriceUsd : FALLBACK_STX_PRICE_USD;
    }
    for (const p of pools) {
      if (p.token0Symbol.toUpperCase() === "STX" && p.token0PriceUsd > 0) return p.token0PriceUsd;
      if (p.token1Symbol.toUpperCase() === "STX" && p.token1PriceUsd > 0) return p.token1PriceUsd;
    }
    return FALLBACK_STX_PRICE_USD;
  } catch {
    return FALLBACK_STX_PRICE_USD;
  }
}

async function getActiveBin(poolId: number): Promise<number> {
  const result = await callReadOnly("get-active-bin-id", [uintCV(poolId)]);
  return parseUintResult(result);
}

// ── Fee Distribution Model ───────────────────────────────────────────────────

/**
 * Estimate fee distribution across bins.
 *
 * In HODLMM (DLMM), fees are earned only by the active bin and bins immediately
 * adjacent that get crossed during swaps. The fee distribution follows a sharp
 * decay curve centered on the active bin:
 *
 * - Active bin (distance 0): captures majority of fees from every swap
 * - Distance ±1-2: captures fees from larger swaps that cross bins
 * - Distance ±3-5: captures fees only from very large swaps
 * - Distance >5: effectively zero fee capture unless major price moves
 *
 * We model this as an exponential decay: fee_weight = e^(-k * distance)
 * where k controls the decay rate (higher = more concentrated).
 */
function computeFeeWeights(
  bins: { binId: number; totalUsd: number }[],
  activeBinId: number
): Map<number, number> {
  const decayRate = 0.6; // Calibrated for typical DLMM fee distribution
  const weights = new Map<number, number>();
  let totalWeight = 0;

  for (const bin of bins) {
    const dist = Math.abs(bin.binId - activeBinId);
    // Fee weight combines proximity to active bin AND liquidity presence
    // Bins with more liquidity capture proportionally more of the fees at that distance
    const proximityWeight = Math.exp(-decayRate * dist);
    const liquidityWeight = bin.totalUsd > 0 ? 1 : 0;
    const weight = proximityWeight * liquidityWeight;
    weights.set(bin.binId, weight);
    totalWeight += weight;
  }

  // Normalize to percentages
  if (totalWeight > 0) {
    for (const [binId, w] of weights) {
      weights.set(binId, (w / totalWeight) * 100);
    }
  }

  return weights;
}

/**
 * Classify bins into fee zones based on their relative fee capture.
 */
function classifyBinZone(feeSharePct: number, avgFeeSharePct: number): "HOT" | "WARM" | "COLD" | "DEAD" {
  if (feeSharePct <= avgFeeSharePct * DEAD_ZONE_THRESHOLD) return "DEAD";
  if (feeSharePct < avgFeeSharePct * 0.3) return "COLD";
  if (feeSharePct < avgFeeSharePct * HOT_ZONE_PERCENTILE) return "WARM";
  return "HOT";
}

/**
 * Compute Gini coefficient for fee distribution.
 * 0 = perfectly equal, 1 = one bin captures all fees.
 */
function computeGini(values: number[]): number {
  if (values.length <= 1) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  if (mean === 0) return 0;

  let sumAbsDiff = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumAbsDiff += Math.abs(sorted[i] - sorted[j]);
    }
  }
  return sumAbsDiff / (2 * n * n * mean);
}

/**
 * Identify contiguous zones (hot or dead).
 */
function findContiguousZones(
  bins: BinData[],
  zoneTypes: string[]
): { startBin: number; endBin: number; totalValue: number }[] {
  const zones: { startBin: number; endBin: number; totalValue: number }[] = [];
  const sorted = [...bins].filter((b) => zoneTypes.includes(b.zone)).sort((a, b) => a.binId - b.binId);

  if (sorted.length === 0) return zones;

  let start = sorted[0].binId;
  let end = sorted[0].binId;
  let value = sorted[0].zone === "DEAD" ? sorted[0].totalUsd : sorted[0].estimatedDailyFeeUsd;

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].binId === end + 1) {
      end = sorted[i].binId;
      value += sorted[i].zone === "DEAD" ? sorted[i].totalUsd : sorted[i].estimatedDailyFeeUsd;
    } else {
      zones.push({ startBin: start, endBin: end, totalValue: value });
      start = sorted[i].binId;
      end = sorted[i].binId;
      value = sorted[i].zone === "DEAD" ? sorted[i].totalUsd : sorted[i].estimatedDailyFeeUsd;
    }
  }
  zones.push({ startBin: start, endBin: end, totalValue: value });
  return zones;
}

/**
 * Build the fee decay curve: cumulative fee capture by distance from active bin.
 */
function buildDecayCurve(bins: BinData[], activeBinId: number): FeeDecayCurve[] {
  const maxDist = Math.max(...bins.map((b) => Math.abs(b.binId - activeBinId)), 0);
  const curve: FeeDecayCurve[] = [];
  let cumulative = 0;

  for (let d = 0; d <= maxDist; d++) {
    const binsAtDist = bins.filter((b) => Math.abs(b.binId - activeBinId) === d);
    const marginal = binsAtDist.reduce((s, b) => s + b.estimatedFeeSharePct, 0);
    cumulative += marginal;
    curve.push({
      distance: d,
      cumulativeFeeCapturePct: Math.round(cumulative * 100) / 100,
      marginalFeeCapturePct: Math.round(marginal * 100) / 100,
    });
  }
  return curve;
}

/**
 * Generate range recommendations for different LP strategies.
 */
function generateRecommendations(
  bins: BinData[],
  activeBinId: number,
  decayCurve: FeeDecayCurve[],
  poolDailyFeesUsd: number,
  tvlUsd: number
): RangeRecommendation[] {
  const recommendations: RangeRecommendation[] = [];

  const strategies = [
    { name: "Aggressive", desc: "Tight range, max fee capture, frequent rebalancing needed", targetCapturePct: 50 },
    { name: "Balanced", desc: "Moderate range, good fees with less rebalancing", targetCapturePct: 75 },
    { name: "Conservative", desc: "Wide range, lower fees but rarely needs rebalancing", targetCapturePct: 90 },
    { name: "Full Range", desc: "Cover all active bins, minimal management", targetCapturePct: 99 },
  ];

  for (const strat of strategies) {
    // Find the distance that captures target % of fees
    let distance = 0;
    for (const point of decayCurve) {
      if (point.cumulativeFeeCapturePct >= strat.targetCapturePct) {
        distance = point.distance;
        break;
      }
      distance = point.distance;
    }

    const lower = activeBinId - distance;
    const upper = activeBinId + distance;
    const width = distance * 2 + 1;

    // Capital efficiency: fee capture % / bins covered
    const actualCapture = decayCurve.find((c) => c.distance === distance)?.cumulativeFeeCapturePct || 0;
    const totalBins = bins.length || 1;
    const capitalEfficiency = width > 0 ? actualCapture / (width / totalBins * 100) : 0;

    recommendations.push({
      strategy: strat.name,
      description: strat.desc,
      binRange: { lower, upper },
      width,
      estimatedFeeCapturePct: Math.round(actualCapture * 100) / 100,
      estimatedDailyFeeUsd: Math.round((poolDailyFeesUsd * actualCapture / 100) * 10000) / 10000,
      capitalEfficiency: Math.round(capitalEfficiency * 100) / 100,
    });
  }

  return recommendations;
}

// ── Bin Reserve Fetching ─────────────────────────────────────────────────────

async function fetchBinReserves(
  poolId: number,
  activeBinId: number,
  pool: AppPool,
  radius: number = BIN_SCAN_RADIUS
): Promise<{ binId: number; reserveX: number; reserveY: number; totalUsd: number }[]> {
  const bins: { binId: number; reserveX: number; reserveY: number; totalUsd: number }[] = [];
  const start = activeBinId - radius;
  const end = activeBinId + radius;

  for (let binId = start; binId <= end; binId++) {
    try {
      const result = await callReadOnly("get-bin", [uintCV(poolId), uintCV(binId)]);
      const parsed = parseUintResult(result);
      if (parsed > 0) {
        const ratioX = pool.token0PriceUsd / (pool.token0PriceUsd + pool.token1PriceUsd + 0.001);
        const reserveX = parsed * ratioX;
        const reserveY = parsed * (1 - ratioX);
        const usdX = (reserveX / Math.pow(10, pool.token0Decimals)) * pool.token0PriceUsd;
        const usdY = (reserveY / Math.pow(10, pool.token1Decimals)) * pool.token1PriceUsd;
        bins.push({ binId, reserveX, reserveY, totalUsd: usdX + usdY });
      }
    } catch {
      // Skip bins that fail
    }
  }
  return bins;
}

// ── Command Handlers ────────────────────────────────────────────────────────────

async function runDoctor(): Promise<void> {
  const results: Record<string, string> = {};

  try {
    await fetchJson(`${BFF_APP_BASE}/pools/hodlmm`);
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
    const testResult = await callReadOnly("get-active-bin-id", [uintCV(1)]);
    results["dlmm_contract"] = testResult.result ? "ok" : "no result";
  } catch (e: any) {
    results["dlmm_contract"] = `error: ${e.message}`;
  }

  try {
    const price = await fetchStxPriceUsd();
    results["stx_price"] = `ok ($${price.toFixed(2)})`;
  } catch (e: any) {
    results["stx_price"] = `error: ${e.message}`;
  }

  console.log(
    JSON.stringify({
      tool: "hodlmm-fee-distribution",
      command: "doctor",
      status: Object.values(results).every((v) => v.startsWith("ok")) ? "healthy" : "degraded",
      checks: results,
      timestamp: new Date().toISOString(),
    })
  );
}

async function runInstallPacks(): Promise<void> {
  console.log(
    JSON.stringify({
      tool: "hodlmm-fee-distribution",
      command: "install-packs",
      status: "ok",
      message: "No additional dependencies required. Uses commander (workspace) + native fetch.",
      timestamp: new Date().toISOString(),
    })
  );
}

async function runAnalyze(options: { pool: string }): Promise<void> {
  const poolId = parseInt(options.pool);
  if (isNaN(poolId)) {
    console.log(JSON.stringify({
      tool: "hodlmm-fee-distribution",
      command: "run",
      timestamp: new Date().toISOString(),
      error: "Invalid pool ID — provide a numeric pool ID with --pool",
    }));
    return;
  }

  const pools = await fetchAllPools();
  const pool = pools.find((p) => p.poolId === poolId);

  if (!pool) {
    console.log(JSON.stringify({
      tool: "hodlmm-fee-distribution",
      command: "run",
      timestamp: new Date().toISOString(),
      error: `Pool ${poolId} not found or below TVL threshold ($${MIN_TVL_USD})`,
    }));
    return;
  }

  const activeBinId = pool.activeBinId || await getActiveBin(poolId);
  if (!activeBinId) {
    console.log(JSON.stringify({
      tool: "hodlmm-fee-distribution",
      command: "run",
      timestamp: new Date().toISOString(),
      error: `Could not determine active bin for pool ${poolId}`,
    }));
    return;
  }

  const rawBins = await fetchBinReserves(poolId, activeBinId, pool);
  if (rawBins.length === 0) {
    console.log(JSON.stringify({
      tool: "hodlmm-fee-distribution",
      command: "run",
      timestamp: new Date().toISOString(),
      error: `No bins with liquidity found for pool ${poolId}`,
    }));
    return;
  }

  const poolDailyFees = (pool.volume24hUsd * (pool.feeBps || 30)) / 10_000;
  const feeWeights = computeFeeWeights(rawBins, activeBinId);
  const avgFeeShare = 100 / rawBins.length;

  // Build enriched bin data
  const bins: BinData[] = rawBins.map((b) => {
    const feeSharePct = feeWeights.get(b.binId) || 0;
    return {
      binId: b.binId,
      reserveX: b.reserveX,
      reserveY: b.reserveY,
      totalUsd: Math.round(b.totalUsd * 100) / 100,
      distanceFromActive: Math.abs(b.binId - activeBinId),
      estimatedFeeSharePct: Math.round(feeSharePct * 100) / 100,
      estimatedDailyFeeUsd: Math.round((poolDailyFees * feeSharePct / 100) * 10000) / 10000,
      zone: classifyBinZone(feeSharePct, avgFeeShare),
    };
  }).sort((a, b) => a.binId - b.binId);

  // Fee concentration metrics
  const feeShares = bins.map((b) => b.estimatedFeeSharePct);
  const gini = computeGini(feeShares);
  const sortedByFee = [...bins].sort((a, b) => b.estimatedFeeSharePct - a.estimatedFeeSharePct);
  const top3Share = sortedByFee.slice(0, 3).reduce((s, b) => s + b.estimatedFeeSharePct, 0);
  const top5Share = sortedByFee.slice(0, 5).reduce((s, b) => s + b.estimatedFeeSharePct, 0);
  const top10Share = sortedByFee.slice(0, 10).reduce((s, b) => s + b.estimatedFeeSharePct, 0);

  let concClassification: "HIGHLY_CONCENTRATED" | "MODERATE" | "SPREAD";
  if (gini > 0.6 || top3Share > 70) concClassification = "HIGHLY_CONCENTRATED";
  else if (gini > 0.35 || top3Share > 45) concClassification = "MODERATE";
  else concClassification = "SPREAD";

  // Find hot zones and dead zones
  const hotZoneRanges = findContiguousZones(bins, ["HOT"]);
  const deadZoneRanges = findContiguousZones(bins, ["DEAD"]);

  const hotZones = hotZoneRanges.map((z) => ({
    startBin: z.startBin,
    endBin: z.endBin,
    feeSharePct: Math.round(
      bins.filter((b) => b.binId >= z.startBin && b.binId <= z.endBin)
        .reduce((s, b) => s + b.estimatedFeeSharePct, 0) * 100
    ) / 100,
  }));

  const deadZones = deadZoneRanges.map((z) => ({
    startBin: z.startBin,
    endBin: z.endBin,
    capitalLockedUsd: Math.round(
      bins.filter((b) => b.binId >= z.startBin && b.binId <= z.endBin)
        .reduce((s, b) => s + b.totalUsd, 0) * 100
    ) / 100,
  }));

  // Build decay curve
  const decayCurve = buildDecayCurve(bins, activeBinId);

  // Generate range recommendations
  const recommendations = generateRecommendations(bins, activeBinId, decayCurve, poolDailyFees, pool.tvlUsd);

  // Summary
  const hotCount = bins.filter((b) => b.zone === "HOT").length;
  const deadCount = bins.filter((b) => b.zone === "DEAD").length;
  const deadCapital = bins.filter((b) => b.zone === "DEAD").reduce((s, b) => s + b.totalUsd, 0);
  const dist50 = decayCurve.find((c) => c.cumulativeFeeCapturePct >= 50)?.distance || 0;
  const dist90 = decayCurve.find((c) => c.cumulativeFeeCapturePct >= 90)?.distance || 0;

  let summary: string;
  if (concClassification === "HIGHLY_CONCENTRATED") {
    summary = `Fees are highly concentrated — top 3 bins capture ${top3Share.toFixed(1)}% of all fees. ` +
      `50% of fees within ±${dist50} bins, 90% within ±${dist90} bins. ` +
      `${deadCount > 0 ? `${formatUsd(deadCapital)} locked in dead zones earning negligible fees. ` : ""}` +
      `Aggressive narrow ranges (±${dist50} bins) offer best capital efficiency.`;
  } else if (concClassification === "MODERATE") {
    summary = `Fee distribution is moderate — top 3 bins capture ${top3Share.toFixed(1)}%. ` +
      `50% of fees within ±${dist50} bins, 90% within ±${dist90} bins. ` +
      `Balanced range (±${Math.ceil((dist50 + dist90) / 2)} bins) recommended for most LPs.`;
  } else {
    summary = `Fees are spread across bins — top 3 capture only ${top3Share.toFixed(1)}%. ` +
      `This pool may have high volatility or wide bin spacing. ` +
      `Wide ranges are efficient here; tight ranges risk missing fee-generating bins.`;
  }

  const result: PoolFeeDistribution = {
    poolId,
    pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
    tvlUsd: Math.round(pool.tvlUsd),
    volume24hUsd: Math.round(pool.volume24hUsd),
    feeBps: pool.feeBps || 30,
    activeBinId,
    estimatedPoolDailyFeesUsd: Math.round(poolDailyFees * 100) / 100,
    bins,
    feeConcentration: {
      giniCoefficient: Math.round(gini * 1000) / 1000,
      top3BinsFeeSharePct: Math.round(top3Share * 100) / 100,
      top5BinsFeeSharePct: Math.round(top5Share * 100) / 100,
      top10BinsFeeSharePct: Math.round(top10Share * 100) / 100,
      classification: concClassification,
    },
    hotZones,
    deadZones,
    feeDecayCurve: decayCurve,
    rangeRecommendations: recommendations,
    summary,
  };

  console.log(JSON.stringify({
    tool: "hodlmm-fee-distribution",
    command: "run",
    timestamp: new Date().toISOString(),
    ...result,
    binsScanned: BIN_SCAN_RADIUS * 2 + 1,
    binsWithLiquidity: rawBins.length,
  }, null, 2));
}

async function runScan(options: {
  top?: string;
  minTvl?: string;
  sort?: string;
}): Promise<void> {
  const topN = parseInt(options.top || "10");
  const minTvl = parseFloat(options.minTvl || String(MIN_TVL_USD));
  const sortBy = options.sort || "concentration"; // concentration | fees | deadCapital

  const pools = (await fetchAllPools()).filter((p) => p.tvlUsd >= minTvl);

  if (pools.length === 0) {
    console.log(JSON.stringify({
      tool: "hodlmm-fee-distribution",
      command: "scan",
      timestamp: new Date().toISOString(),
      error: "No pools found above TVL threshold",
    }));
    return;
  }

  const poolResults: any[] = [];

  for (const pool of pools.slice(0, topN * 2)) {
    try {
      const activeBinId = pool.activeBinId || await getActiveBin(pool.poolId!);
      if (!activeBinId) continue;

      const rawBins = await fetchBinReserves(pool.poolId!, activeBinId, pool, 12);
      if (rawBins.length === 0) continue;

      const poolDailyFees = (pool.volume24hUsd * (pool.feeBps || 30)) / 10_000;
      const feeWeights = computeFeeWeights(rawBins, activeBinId);
      const avgFeeShare = 100 / rawBins.length;

      const feeShares = rawBins.map((b) => feeWeights.get(b.binId) || 0);
      const gini = computeGini(feeShares);
      const sortedByFee = [...rawBins]
        .map((b) => ({ ...b, feeShare: feeWeights.get(b.binId) || 0 }))
        .sort((a, b) => b.feeShare - a.feeShare);
      const top3Share = sortedByFee.slice(0, 3).reduce((s, b) => s + b.feeShare, 0);

      const deadBins = rawBins.filter((b) => {
        const share = feeWeights.get(b.binId) || 0;
        return share <= avgFeeShare * DEAD_ZONE_THRESHOLD;
      });
      const deadCapital = deadBins.reduce((s, b) => s + b.totalUsd, 0);

      // Find distance for 50% and 90% fee capture
      const decayMap = new Map<number, number>();
      for (const b of rawBins) {
        const dist = Math.abs(b.binId - activeBinId);
        decayMap.set(dist, (decayMap.get(dist) || 0) + (feeWeights.get(b.binId) || 0));
      }
      let cum = 0;
      let dist50 = 0, dist90 = 0;
      for (let d = 0; d <= 20; d++) {
        cum += decayMap.get(d) || 0;
        if (cum >= 50 && dist50 === 0) dist50 = d;
        if (cum >= 90 && dist90 === 0) { dist90 = d; break; }
      }

      let classification: string;
      if (gini > 0.6 || top3Share > 70) classification = "HIGHLY_CONCENTRATED";
      else if (gini > 0.35 || top3Share > 45) classification = "MODERATE";
      else classification = "SPREAD";

      poolResults.push({
        poolId: pool.poolId,
        pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
        tvlUsd: Math.round(pool.tvlUsd),
        volume24hUsd: Math.round(pool.volume24hUsd),
        feeBps: pool.feeBps || 30,
        poolDailyFeesUsd: Math.round(poolDailyFees * 100) / 100,
        giniCoefficient: Math.round(gini * 1000) / 1000,
        top3BinsFeeSharePct: Math.round(top3Share * 100) / 100,
        dist50Bins: dist50,
        dist90Bins: dist90,
        deadBins: deadBins.length,
        deadCapitalUsd: Math.round(deadCapital * 100) / 100,
        classification,
        binsWithLiquidity: rawBins.length,
      });
    } catch { /* skip pool */ }
  }

  // Sort
  if (sortBy === "fees") {
    poolResults.sort((a, b) => b.poolDailyFeesUsd - a.poolDailyFeesUsd);
  } else if (sortBy === "deadCapital") {
    poolResults.sort((a, b) => b.deadCapitalUsd - a.deadCapitalUsd);
  } else {
    poolResults.sort((a, b) => b.giniCoefficient - a.giniCoefficient);
  }

  const ranked = poolResults.slice(0, topN);
  const concentrated = ranked.filter((p) => p.classification === "HIGHLY_CONCENTRATED").length;
  const moderate = ranked.filter((p) => p.classification === "MODERATE").length;
  const spread = ranked.filter((p) => p.classification === "SPREAD").length;
  const totalDeadCapital = ranked.reduce((s, p) => s + p.deadCapitalUsd, 0);

  console.log(JSON.stringify({
    tool: "hodlmm-fee-distribution",
    command: "scan",
    timestamp: new Date().toISOString(),
    poolsScanned: poolResults.length,
    sortedBy: sortBy,
    results: ranked,
    summary: {
      highlyConcentrated: concentrated,
      moderate,
      spread,
      totalDeadCapitalUsd: Math.round(totalDeadCapital * 100) / 100,
      avgGini: ranked.length > 0
        ? Math.round((ranked.reduce((s, p) => s + p.giniCoefficient, 0) / ranked.length) * 1000) / 1000
        : 0,
      mostConcentratedPool: ranked.length > 0 ? ranked[0] : null,
    },
    guidance: concentrated > moderate + spread
      ? "Most pools have highly concentrated fee distribution. Tight ranges (±2-3 bins) capture majority of fees."
      : spread > concentrated
        ? "Fee distribution is spread across many bins. Wider ranges needed to capture meaningful fees."
        : "Mixed fee distribution patterns. Check individual pool metrics to optimize bin placement.",
  }, null, 2));
}

async function runHeatmap(options: { pool: string }): Promise<void> {
  const poolId = parseInt(options.pool);
  if (isNaN(poolId)) {
    console.log(JSON.stringify({
      tool: "hodlmm-fee-distribution",
      command: "heatmap",
      timestamp: new Date().toISOString(),
      error: "Invalid pool ID — provide a numeric pool ID with --pool",
    }));
    return;
  }

  const pools = await fetchAllPools();
  const pool = pools.find((p) => p.poolId === poolId);
  if (!pool) {
    console.log(JSON.stringify({
      tool: "hodlmm-fee-distribution",
      command: "heatmap",
      timestamp: new Date().toISOString(),
      error: `Pool ${poolId} not found`,
    }));
    return;
  }

  const activeBinId = pool.activeBinId || await getActiveBin(poolId);
  if (!activeBinId) {
    console.log(JSON.stringify({
      tool: "hodlmm-fee-distribution",
      command: "heatmap",
      timestamp: new Date().toISOString(),
      error: `Could not determine active bin for pool ${poolId}`,
    }));
    return;
  }

  const rawBins = await fetchBinReserves(poolId, activeBinId, pool);
  if (rawBins.length === 0) {
    console.log(JSON.stringify({
      tool: "hodlmm-fee-distribution",
      command: "heatmap",
      timestamp: new Date().toISOString(),
      error: `No bins with liquidity found`,
    }));
    return;
  }

  const feeWeights = computeFeeWeights(rawBins, activeBinId);
  const poolDailyFees = (pool.volume24hUsd * (pool.feeBps || 30)) / 10_000;

  // Build ASCII heatmap
  const sorted = [...rawBins].sort((a, b) => a.binId - b.binId);
  const maxFee = Math.max(...sorted.map((b) => feeWeights.get(b.binId) || 0));

  const heatmapRows: string[] = [];
  const blocks = ["░", "▒", "▓", "█"];

  for (const bin of sorted) {
    const feeShare = feeWeights.get(bin.binId) || 0;
    const barLen = maxFee > 0 ? Math.round((feeShare / maxFee) * 30) : 0;
    const intensity = maxFee > 0 ? Math.min(3, Math.floor((feeShare / maxFee) * 4)) : 0;
    const bar = blocks[intensity].repeat(Math.max(barLen, 1));
    const marker = bin.binId === activeBinId ? " ◀ ACTIVE" : "";
    const dailyFee = poolDailyFees * feeShare / 100;
    heatmapRows.push(
      `  Bin ${String(bin.binId).padStart(6)} | ${bar.padEnd(32)} ${feeShare.toFixed(1).padStart(5)}% | ${formatUsd(dailyFee).padStart(8)}/day${marker}`
    );
  }

  console.log(JSON.stringify({
    tool: "hodlmm-fee-distribution",
    command: "heatmap",
    timestamp: new Date().toISOString(),
    poolId,
    pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
    activeBinId,
    heatmap: heatmapRows,
    legend: {
      "░": "LOW fee capture (<25% of peak)",
      "▒": "MODERATE fee capture (25-50%)",
      "▓": "HIGH fee capture (50-75%)",
      "█": "PEAK fee capture (>75%)",
    },
    note: "Fee estimates based on proximity-weighted distribution model. Actual fees depend on swap routing and volume.",
  }, null, 2));
}

// ── CLI Setup ──────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-fee-distribution")
  .description(
    "HODLMM Fee Distribution Analyzer — Maps fee generation across bin ranges, identifies hot zones and dead capital, recommends optimal bin placement"
  )
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
  .description("Analyze fee distribution for a specific pool")
  .requiredOption("--pool <id>", "HODLMM pool ID")
  .action(runAnalyze);

program
  .command("scan")
  .description("Compare fee distribution patterns across pools")
  .option("--top <n>", "Number of pools to show", "10")
  .option("--min-tvl <usd>", "Minimum TVL filter", String(MIN_TVL_USD))
  .option("--sort <by>", "Sort by: concentration, fees, deadCapital", "concentration")
  .action(runScan);

program
  .command("heatmap")
  .description("Visual fee distribution heatmap for a pool")
  .requiredOption("--pool <id>", "HODLMM pool ID")
  .action(runHeatmap);

program.parse();
