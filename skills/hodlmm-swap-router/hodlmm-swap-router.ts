#!/usr/bin/env bun
/**
 * hodlmm-swap-router.ts
 *
 * HODLMM Swap Router — Optimal swap execution analyzer for HODLMM concentrated
 * liquidity pools. Walks on-chain bin reserves to simulate trade execution,
 * finds best direct and multi-hop paths, estimates slippage at different sizes,
 * and recommends optimal trade splitting strategies.
 *
 * Key metrics:
 *  - Effective price vs mid-market price
 *  - Slippage curves for multiple trade sizes
 *  - Multi-hop route discovery (A→B→C)
 *  - Trade splitting recommendations (optimal chunk sizes)
 *  - Fee impact analysis per route
 *  - Liquidity depth scoring per path
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 52).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 30;
const FALLBACK_STX_PRICE_USD = 0.80;

type RouteVerdict = "OPTIMAL" | "GOOD" | "FAIR" | "POOR" | "AVOID";

const SLIPPAGE_THRESHOLDS = {
  OPTIMAL: 0.1,
  GOOD: 0.5,
  FAIR: 1.0,
  POOR: 3.0,
} as const;

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

interface BinReserves {
  binId: number;
  reserveX: number;
  reserveY: number;
  totalUsd: number;
}

interface SwapSimResult {
  inputAmount: number;
  outputAmount: number;
  effectivePrice: number;
  midMarketPrice: number;
  slippagePct: number;
  feePaidUsd: number;
  binsTraversed: number;
  priceImpactPct: number;
}

interface RouteHop {
  poolId: number;
  pair: string;
  inputToken: string;
  outputToken: string;
  feeBps: number;
  tvlUsd: number;
  depthScore: number;
}

interface Route {
  hops: RouteHop[];
  path: string;
  totalFeeBps: number;
  estimatedSlippagePct: number;
  depthScore: number;
  verdict: RouteVerdict;
}

interface SlippageCurvePoint {
  tradeAmountUsd: number;
  slippagePct: number;
  effectivePrice: number;
  outputAmount: number;
  priceImpactPct: number;
  feePaidUsd: number;
}

interface SplitRecommendation {
  chunks: number;
  chunkSizeUsd: number;
  totalSlippagePct: number;
  savings: number;
  savingsPct: number;
  strategy: string;
}

interface PoolRouteAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  midMarketPrice: number;
  directRoutes: Route[];
  multiHopRoutes: Route[];
  slippageCurve: SlippageCurvePoint[];
  splitRecommendation: SplitRecommendation;
  maxTradeUsd: number;
  depthScore: number;
  verdict: RouteVerdict;
  recommendation: string;
}

// ── ANSI Formatting ──────────────────────────────────────────────────────────

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

function formatPct(n: number): string {
  return `${n.toFixed(3)}%`;
}

function verdictColor(v: RouteVerdict): string {
  switch (v) {
    case "OPTIMAL": return GREEN;
    case "GOOD": return CYAN;
    case "FAIR": return YELLOW;
    case "POOR": return RED;
    case "AVOID": return RED;
  }
}

// ── API Helpers ──────────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

async function fetchAllPools(): Promise<AppPool[]> {
  const data = await fetchJson(`${BFF_APP_BASE}/hodlmm/pools`);
  const raw: any[] = data?.pools || data?.data?.pools || data || [];
  return raw
    .filter((p: any) => {
      const tvl = p.tvlUsd ?? p.tvl_usd ?? 0;
      return tvl >= MIN_TVL_USD && (p.poolId ?? p.pool_id);
    })
    .map((p: any) => ({
      id: p.id || `${p.token0Symbol}-${p.token1Symbol}`,
      token0Symbol: p.token0Symbol ?? p.token_0_symbol ?? "?",
      token1Symbol: p.token1Symbol ?? p.token_1_symbol ?? "?",
      tvlUsd: p.tvlUsd ?? p.tvl_usd ?? 0,
      volume24hUsd: p.volume24hUsd ?? p.volume_24h_usd ?? 0,
      poolId: p.poolId ?? p.pool_id,
      token0Decimals: p.token0Decimals ?? p.token_0_decimals ?? 6,
      token1Decimals: p.token1Decimals ?? p.token_1_decimals ?? 6,
      token0PriceUsd: p.token0PriceUsd ?? p.token_0_price_usd ?? FALLBACK_STX_PRICE_USD,
      token1PriceUsd: p.token1PriceUsd ?? p.token_1_price_usd ?? FALLBACK_STX_PRICE_USD,
      activeBinId: p.activeBinId ?? p.active_bin_id,
      feeBps: p.feeBps ?? p.fee_bps ?? 30,
    }));
}

async function callReadOnly(fnName: string, args: string[]): Promise<any> {
  const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/${fnName}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sender: SENDER, arguments: args }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from call-read ${fnName}`);
  return res.json();
}

function cvUint(n: number): string {
  const hex = n.toString(16).padStart(32, "0");
  return `0x01${hex}`;
}

function parseClarityUint(hex: string): number {
  if (!hex || !hex.startsWith("0x")) return 0;
  const clean = hex.slice(2);
  if (clean.startsWith("01")) return parseInt(clean.slice(2), 16) || 0;
  return 0;
}

async function getActiveBin(poolId: number): Promise<number> {
  const result = await callReadOnly("get-active-bin-id", [cvUint(poolId)]);
  if (result.result) return parseClarityUint(result.result);
  throw new Error(`Cannot get active bin for pool ${poolId}`);
}

async function fetchBinReserves(
  poolId: number,
  activeBinId: number,
  pool: AppPool,
): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const startBin = activeBinId - BIN_SCAN_RADIUS;
  const endBin = activeBinId + BIN_SCAN_RADIUS;

  for (let binId = startBin; binId <= endBin; binId++) {
    try {
      const result = await callReadOnly("get-bin", [cvUint(poolId), cvUint(binId)]);
      if (!result.result) continue;
      const hex = result.result;

      let reserveX = 0;
      let reserveY = 0;

      const rxMatch = hex.match(/0a0972657365727665580100([0-9a-f]{32})/i);
      const ryMatch = hex.match(/0a0972657365727665590100([0-9a-f]{32})/i);

      if (rxMatch) reserveX = parseInt(rxMatch[1], 16) || 0;
      if (ryMatch) reserveY = parseInt(ryMatch[1], 16) || 0;

      const rx = reserveX / Math.pow(10, pool.token0Decimals);
      const ry = reserveY / Math.pow(10, pool.token1Decimals);
      const totalUsd = rx * pool.token0PriceUsd + ry * pool.token1PriceUsd;

      if (totalUsd > 0.01) {
        bins.push({ binId, reserveX: rx, reserveY: ry, totalUsd });
      }
    } catch {
      // Skip errored bins
    }
  }

  return bins;
}

// ── Swap Simulation ────────────────────────────────────────────────────────

function simulateSwap(
  bins: BinReserves[],
  activeBinId: number,
  pool: AppPool,
  inputAmountUsd: number,
  direction: "buy" | "sell",
): SwapSimResult {
  const feeBps = pool.feeBps || 30;
  const feeRate = feeBps / 10000;

  const midMarketPrice = pool.token0PriceUsd > 0
    ? pool.token1PriceUsd / pool.token0PriceUsd
    : 1;

  let remaining = inputAmountUsd;
  let totalOutput = 0;
  let binsTraversed = 0;
  let feePaidUsd = 0;

  const sortedBins = direction === "buy"
    ? [...bins].sort((a, b) => a.binId - b.binId).filter(b => b.binId >= activeBinId)
    : [...bins].sort((a, b) => b.binId - a.binId).filter(b => b.binId <= activeBinId);

  for (const bin of sortedBins) {
    if (remaining <= 0) break;

    const availableLiq = direction === "buy"
      ? bin.reserveY * pool.token1PriceUsd
      : bin.reserveX * pool.token0PriceUsd;

    if (availableLiq <= 0) continue;

    const consumed = Math.min(remaining, availableLiq);
    const fee = consumed * feeRate;
    const afterFee = consumed - fee;

    const outputPrice = direction === "buy" ? pool.token0PriceUsd : pool.token1PriceUsd;
    const output = outputPrice > 0 ? afterFee / outputPrice : 0;

    totalOutput += output;
    feePaidUsd += fee;
    remaining -= consumed;
    binsTraversed++;
  }

  const actualInput = inputAmountUsd - remaining;
  const effectivePrice = totalOutput > 0 ? actualInput / totalOutput : 0;
  const slippagePct = midMarketPrice > 0
    ? Math.abs((effectivePrice - (direction === "buy" ? pool.token0PriceUsd : pool.token1PriceUsd)) /
        (direction === "buy" ? pool.token0PriceUsd : pool.token1PriceUsd)) * 100
    : 0;

  const priceImpactPct = slippagePct - (feeBps / 100);

  return {
    inputAmount: actualInput,
    outputAmount: totalOutput,
    effectivePrice,
    midMarketPrice,
    slippagePct: Math.max(0, slippagePct),
    feePaidUsd,
    binsTraversed,
    priceImpactPct: Math.max(0, priceImpactPct),
  };
}

// ── Slippage Curve ─────────────────────────────────────────────────────────

function buildSlippageCurve(
  bins: BinReserves[],
  activeBinId: number,
  pool: AppPool,
  maxTradeUsd: number,
): SlippageCurvePoint[] {
  const points: SlippageCurvePoint[] = [];
  const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1.0];

  for (const frac of steps) {
    const tradeAmountUsd = maxTradeUsd * frac;
    if (tradeAmountUsd < 1) continue;

    const sim = simulateSwap(bins, activeBinId, pool, tradeAmountUsd, "buy");
    points.push({
      tradeAmountUsd,
      slippagePct: sim.slippagePct,
      effectivePrice: sim.effectivePrice,
      outputAmount: sim.outputAmount,
      priceImpactPct: sim.priceImpactPct,
      feePaidUsd: sim.feePaidUsd,
    });
  }

  return points;
}

// ── Route Discovery ────────────────────────────────────────────────────────

function findDirectRoutes(
  pool: AppPool,
  bins: BinReserves[],
  activeBinId: number,
): Route[] {
  const totalLiq = bins.reduce((s, b) => s + b.totalUsd, 0);
  const activeBins = bins.filter(b => Math.abs(b.binId - activeBinId) <= 2);
  const activeLiq = activeBins.reduce((s, b) => s + b.totalUsd, 0);
  const depthScore = totalLiq > 0 ? Math.min(100, (activeLiq / totalLiq) * 100 + (totalLiq / 1000)) : 0;

  const hop: RouteHop = {
    poolId: pool.poolId!,
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    inputToken: pool.token0Symbol,
    outputToken: pool.token1Symbol,
    feeBps: pool.feeBps || 30,
    tvlUsd: pool.tvlUsd,
    depthScore,
  };

  const feeBps = pool.feeBps || 30;
  const slippageEstimate = totalLiq > 10000 ? feeBps / 100 : (feeBps / 100) * 2;

  let verdict: RouteVerdict;
  if (slippageEstimate <= SLIPPAGE_THRESHOLDS.OPTIMAL) verdict = "OPTIMAL";
  else if (slippageEstimate <= SLIPPAGE_THRESHOLDS.GOOD) verdict = "GOOD";
  else if (slippageEstimate <= SLIPPAGE_THRESHOLDS.FAIR) verdict = "FAIR";
  else if (slippageEstimate <= SLIPPAGE_THRESHOLDS.POOR) verdict = "POOR";
  else verdict = "AVOID";

  const buyRoute: Route = {
    hops: [hop],
    path: `${pool.token0Symbol} → ${pool.token1Symbol}`,
    totalFeeBps: feeBps,
    estimatedSlippagePct: slippageEstimate,
    depthScore,
    verdict,
  };

  const sellHop: RouteHop = {
    ...hop,
    inputToken: pool.token1Symbol,
    outputToken: pool.token0Symbol,
  };

  const sellRoute: Route = {
    hops: [sellHop],
    path: `${pool.token1Symbol} → ${pool.token0Symbol}`,
    totalFeeBps: feeBps,
    estimatedSlippagePct: slippageEstimate,
    depthScore,
    verdict,
  };

  return [buyRoute, sellRoute];
}

function findMultiHopRoutes(
  targetPool: AppPool,
  allPools: AppPool[],
): Route[] {
  const routes: Route[] = [];
  const token0 = targetPool.token0Symbol;
  const token1 = targetPool.token1Symbol;

  for (const midPool of allPools) {
    if (midPool.poolId === targetPool.poolId) continue;
    if (midPool.tvlUsd < MIN_TVL_USD) continue;

    const midToken0 = midPool.token0Symbol;
    const midToken1 = midPool.token1Symbol;

    // token0 → midToken → token1 (buy via intermediate)
    if ((midToken0 === token0 || midToken1 === token0) &&
        (midToken0 === token1 || midToken1 === token1)) {
      continue; // Same pair, skip
    }

    // Find bridge: token0 → X → token1
    let bridgeToken: string | null = null;
    if (midToken0 === token0) bridgeToken = midToken1;
    else if (midToken1 === token0) bridgeToken = midToken0;

    if (!bridgeToken) continue;

    // Find second hop: bridgeToken → token1
    const secondHop = allPools.find(p =>
      p.poolId !== targetPool.poolId &&
      p.poolId !== midPool.poolId &&
      p.tvlUsd >= MIN_TVL_USD &&
      ((p.token0Symbol === bridgeToken && p.token1Symbol === token1) ||
       (p.token1Symbol === bridgeToken && p.token0Symbol === token1))
    );

    if (!secondHop) continue;

    const totalFee = (midPool.feeBps || 30) + (secondHop.feeBps || 30);
    const minTvl = Math.min(midPool.tvlUsd, secondHop.tvlUsd);
    const depthScore = Math.min(100, minTvl / 500);
    const slippageEstimate = (totalFee / 100) * 1.5;

    let verdict: RouteVerdict;
    if (slippageEstimate <= SLIPPAGE_THRESHOLDS.OPTIMAL) verdict = "OPTIMAL";
    else if (slippageEstimate <= SLIPPAGE_THRESHOLDS.GOOD) verdict = "GOOD";
    else if (slippageEstimate <= SLIPPAGE_THRESHOLDS.FAIR) verdict = "FAIR";
    else if (slippageEstimate <= SLIPPAGE_THRESHOLDS.POOR) verdict = "POOR";
    else verdict = "AVOID";

    routes.push({
      hops: [
        {
          poolId: midPool.poolId!,
          pair: `${midPool.token0Symbol}/${midPool.token1Symbol}`,
          inputToken: token0,
          outputToken: bridgeToken,
          feeBps: midPool.feeBps || 30,
          tvlUsd: midPool.tvlUsd,
          depthScore: Math.min(100, midPool.tvlUsd / 500),
        },
        {
          poolId: secondHop.poolId!,
          pair: `${secondHop.token0Symbol}/${secondHop.token1Symbol}`,
          inputToken: bridgeToken,
          outputToken: token1,
          feeBps: secondHop.feeBps || 30,
          tvlUsd: secondHop.tvlUsd,
          depthScore: Math.min(100, secondHop.tvlUsd / 500),
        },
      ],
      path: `${token0} → ${bridgeToken} → ${token1}`,
      totalFeeBps: totalFee,
      estimatedSlippagePct: slippageEstimate,
      depthScore,
      verdict,
    });
  }

  return routes.sort((a, b) => a.estimatedSlippagePct - b.estimatedSlippagePct).slice(0, 5);
}

// ── Split Recommendation ───────────────────────────────────────────────────

function recommendSplit(
  curve: SlippageCurvePoint[],
  tradeAmountUsd: number,
): SplitRecommendation {
  if (curve.length < 2) {
    return {
      chunks: 1,
      chunkSizeUsd: tradeAmountUsd,
      totalSlippagePct: 0,
      savings: 0,
      savingsPct: 0,
      strategy: "Insufficient data for split analysis",
    };
  }

  // Find the slippage for full trade
  const fullTradePoint = curve[curve.length - 1];
  const fullSlippage = fullTradePoint.slippagePct;

  // Estimate slippage for different split counts
  let bestChunks = 1;
  let bestSlippage = fullSlippage;
  let bestSavings = 0;

  for (const numChunks of [2, 3, 5, 10]) {
    const chunkSize = tradeAmountUsd / numChunks;
    const chunkPoint = curve.find(p => p.tradeAmountUsd >= chunkSize) || curve[0];
    const chunkSlippage = chunkPoint.slippagePct;
    // Each chunk sees independent slippage (liquidity replenishes between)
    const totalSlippage = chunkSlippage;
    const savings = fullSlippage - totalSlippage;

    if (savings > bestSavings && savings > 0.01) {
      bestChunks = numChunks;
      bestSlippage = totalSlippage;
      bestSavings = savings;
    }
  }

  const savingsPct = fullSlippage > 0 ? (bestSavings / fullSlippage) * 100 : 0;

  let strategy: string;
  if (bestChunks === 1 || bestSavings < 0.01) {
    strategy = "Single trade is optimal — slippage is minimal at this size.";
  } else if (bestChunks <= 3) {
    strategy = `Split into ${bestChunks} chunks of ${formatUsd(tradeAmountUsd / bestChunks)} each. Wait for liquidity to replenish between trades (1-2 blocks).`;
  } else {
    strategy = `TWAP recommended: ${bestChunks} trades of ${formatUsd(tradeAmountUsd / bestChunks)} over ${bestChunks * 2} blocks. Saves ~${formatPct(bestSavings)} in slippage.`;
  }

  return {
    chunks: bestChunks,
    chunkSizeUsd: tradeAmountUsd / bestChunks,
    totalSlippagePct: bestSlippage,
    savings: bestSavings,
    savingsPct,
    strategy,
  };
}

// ── Pool Analysis ──────────────────────────────────────────────────────────

async function analyzePool(
  pool: AppPool,
  allPools: AppPool[],
  tradeAmountUsd: number,
): Promise<PoolRouteAnalysis> {
  const poolId = pool.poolId!;
  const activeBinId = pool.activeBinId || await getActiveBin(poolId);
  const bins = await fetchBinReserves(poolId, activeBinId, pool);

  const totalLiq = bins.reduce((s, b) => s + b.totalUsd, 0);
  const maxTradeUsd = Math.max(tradeAmountUsd, totalLiq * 0.5);

  const midMarketPrice = pool.token0PriceUsd > 0
    ? pool.token1PriceUsd / pool.token0PriceUsd
    : 1;

  const directRoutes = findDirectRoutes(pool, bins, activeBinId);
  const multiHopRoutes = findMultiHopRoutes(pool, allPools);
  const slippageCurve = buildSlippageCurve(bins, activeBinId, pool, maxTradeUsd);
  const splitRecommendation = recommendSplit(slippageCurve, tradeAmountUsd);

  const activeBins = bins.filter(b => Math.abs(b.binId - activeBinId) <= 2);
  const activeLiq = activeBins.reduce((s, b) => s + b.totalUsd, 0);
  const depthScore = totalLiq > 0
    ? Math.min(100, Math.round((activeLiq / totalLiq) * 50 + Math.sqrt(totalLiq / 100) * 5))
    : 0;

  const tradeSlippage = slippageCurve.length > 0
    ? slippageCurve[slippageCurve.length - 1].slippagePct
    : 0;

  let verdict: RouteVerdict;
  if (tradeSlippage <= SLIPPAGE_THRESHOLDS.OPTIMAL) verdict = "OPTIMAL";
  else if (tradeSlippage <= SLIPPAGE_THRESHOLDS.GOOD) verdict = "GOOD";
  else if (tradeSlippage <= SLIPPAGE_THRESHOLDS.FAIR) verdict = "FAIR";
  else if (tradeSlippage <= SLIPPAGE_THRESHOLDS.POOR) verdict = "POOR";
  else verdict = "AVOID";

  let recommendation: string;
  switch (verdict) {
    case "OPTIMAL":
      recommendation = `Excellent liquidity depth. Trade ${formatUsd(tradeAmountUsd)} directly with minimal slippage (${formatPct(tradeSlippage)}). No splitting needed.`;
      break;
    case "GOOD":
      recommendation = `Good execution quality. Direct swap at ${formatPct(tradeSlippage)} slippage. ${multiHopRoutes.length > 0 ? "Multi-hop routes available but likely not needed at this size." : ""}`;
      break;
    case "FAIR":
      recommendation = `Moderate slippage (${formatPct(tradeSlippage)}). ${splitRecommendation.chunks > 1 ? splitRecommendation.strategy : "Consider smaller trade size or check multi-hop routes."}`;
      break;
    case "POOR":
      recommendation = `High slippage warning (${formatPct(tradeSlippage)}). ${splitRecommendation.chunks > 1 ? splitRecommendation.strategy : "Strongly recommend splitting or using multi-hop route."}`;
      break;
    case "AVOID":
      recommendation = `Extreme slippage (${formatPct(tradeSlippage)}). Pool lacks sufficient depth for this trade size. Use multi-hop or wait for liquidity.`;
      break;
  }

  return {
    poolId,
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    feeBps: pool.feeBps || 30,
    activeBinId,
    midMarketPrice,
    directRoutes,
    multiHopRoutes,
    slippageCurve,
    splitRecommendation,
    maxTradeUsd,
    depthScore,
    verdict,
    recommendation,
  };
}

// ── Output Formatting ───────────────────────────────────────────────────────

function printRouteReport(a: PoolRouteAnalysis, tradeAmountUsd: number): void {
  const vc = verdictColor(a.verdict);

  console.log("");
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}  HODLMM Swap Router — Pool #${a.poolId} (${a.pair})${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log("");

  // Verdict
  console.log(`${BOLD}  Route Quality:         ${vc}${a.verdict}${RESET}`);
  console.log(`  Trade Size:            ${formatUsd(tradeAmountUsd)}`);
  console.log(`  Mid-Market Price:      ${a.midMarketPrice.toFixed(6)}`);
  console.log(`  Depth Score:           ${a.depthScore}/100`);
  console.log("");

  // Pool context
  console.log(`${BOLD}  ── Pool Context ──────────────────────────────────────────${RESET}`);
  console.log(`  TVL:                   ${formatUsd(a.tvlUsd)}`);
  console.log(`  24h Volume:            ${formatUsd(a.volume24hUsd)}`);
  console.log(`  Fee Rate:              ${a.feeBps} bps`);
  console.log(`  Active Bin:            #${a.activeBinId}`);
  console.log(`  Max Safe Trade:        ${formatUsd(a.maxTradeUsd)}`);
  console.log("");

  // Direct routes
  console.log(`${BOLD}  ── Direct Routes ─────────────────────────────────────────${RESET}`);
  for (const route of a.directRoutes) {
    const rc = verdictColor(route.verdict);
    console.log(`  ${BOLD}${route.path}${RESET}`);
    console.log(`    Verdict: ${rc}${route.verdict}${RESET} | Fee: ${route.totalFeeBps}bps | Slippage: ~${formatPct(route.estimatedSlippagePct)} | Depth: ${route.depthScore.toFixed(0)}/100`);
  }
  console.log("");

  // Multi-hop routes
  if (a.multiHopRoutes.length > 0) {
    console.log(`${BOLD}  ── Multi-Hop Routes ──────────────────────────────────────${RESET}`);
    for (const route of a.multiHopRoutes.slice(0, 3)) {
      const rc = verdictColor(route.verdict);
      console.log(`  ${BOLD}${route.path}${RESET}`);
      console.log(`    Verdict: ${rc}${route.verdict}${RESET} | Fee: ${route.totalFeeBps}bps | Slippage: ~${formatPct(route.estimatedSlippagePct)} | Hops: ${route.hops.length}`);
      for (const hop of route.hops) {
        console.log(`    ${DIM}  Pool #${hop.poolId} (${hop.pair}) — TVL: ${formatUsd(hop.tvlUsd)}, ${hop.feeBps}bps${RESET}`);
      }
    }
    console.log("");
  } else {
    console.log(`${DIM}  No multi-hop routes available for this pair.${RESET}`);
    console.log("");
  }

  // Slippage curve
  console.log(`${BOLD}  ── Slippage Curve ────────────────────────────────────────${RESET}`);
  console.log(`  ${DIM}${"Trade Size".padEnd(14)}${"Slippage".padEnd(12)}${"Price Impact".padEnd(14)}${"Fees".padEnd(12)}${"Chart".padEnd(20)}${RESET}`);
  console.log(`  ${DIM}${"─".repeat(70)}${RESET}`);

  for (const point of a.slippageCurve) {
    const barLen = Math.max(1, Math.round(point.slippagePct * 10));
    const bar = "█".repeat(Math.min(barLen, 25));
    const sc = point.slippagePct <= 0.5 ? GREEN : point.slippagePct <= 2 ? YELLOW : RED;
    console.log(
      `  ${formatUsd(point.tradeAmountUsd).padEnd(14)}${sc}${formatPct(point.slippagePct).padEnd(12)}${RESET}${formatPct(point.priceImpactPct).padEnd(14)}${formatUsd(point.feePaidUsd).padEnd(12)}${sc}${bar}${RESET}`
    );
  }
  console.log("");

  // Split recommendation
  console.log(`${BOLD}  ── Trade Splitting ───────────────────────────────────────${RESET}`);
  const split = a.splitRecommendation;
  console.log(`  Optimal Chunks:        ${split.chunks}`);
  console.log(`  Chunk Size:            ${formatUsd(split.chunkSizeUsd)}`);
  console.log(`  Est. Slippage:         ${formatPct(split.totalSlippagePct)}`);
  if (split.savings > 0.01) {
    console.log(`  Savings vs Single:     ${GREEN}${formatPct(split.savings)} (${split.savingsPct.toFixed(0)}% less slippage)${RESET}`);
  }
  console.log(`  ${BOLD}>${RESET} ${split.strategy}`);
  console.log("");

  // Recommendation
  console.log(`${BOLD}  ── Recommendation ───────────────────────────────────────${RESET}`);
  console.log(`  ${BOLD}>${RESET} ${a.recommendation}`);
  console.log("");
  console.log(`${DIM}  Timestamp: ${new Date().toISOString()}${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log("");
}

function printScanTable(analyses: PoolRouteAnalysis[], tradeAmountUsd: number): void {
  console.log("");
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}  HODLMM Swap Router — All Pools Scan (trade: ${formatUsd(tradeAmountUsd)})${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════════════════════════════════════${RESET}`);
  console.log("");

  console.log(
    `  ${DIM}${"#".padEnd(6)}${"Pair".padEnd(16)}${"TVL".padEnd(12)}${"Verdict".padEnd(12)}${"Slippage".padEnd(12)}${"Depth".padEnd(8)}${"Fee".padEnd(8)}${"Hops".padEnd(8)}${"Split".padEnd(8)}${RESET}`
  );
  console.log(`  ${DIM}${"─".repeat(88)}${RESET}`);

  const sorted = [...analyses].sort((a, b) => a.depthScore > b.depthScore ? -1 : 1);

  for (const a of sorted) {
    const vc = verdictColor(a.verdict);
    const lastSlip = a.slippageCurve.length > 0 ? a.slippageCurve[a.slippageCurve.length - 1].slippagePct : 0;
    const hops = a.multiHopRoutes.length > 0 ? `${a.multiHopRoutes.length}` : "—";

    console.log(
      `  ${String(a.poolId).padEnd(6)}${a.pair.padEnd(16)}${formatUsd(a.tvlUsd).padEnd(12)}${vc}${a.verdict.padEnd(12)}${RESET}${formatPct(lastSlip).padEnd(12)}${String(a.depthScore + "/100").padEnd(8)}${(a.feeBps + "bp").padEnd(8)}${hops.padEnd(8)}${String(a.splitRecommendation.chunks) + "x"}`
    );
  }

  console.log("");

  // Summary
  const avgDepth = analyses.reduce((s, a) => s + a.depthScore, 0) / (analyses.length || 1);
  const optimalCount = analyses.filter(a => a.verdict === "OPTIMAL" || a.verdict === "GOOD").length;
  const avoidCount = analyses.filter(a => a.verdict === "AVOID").length;

  console.log(`${BOLD}  Summary${RESET}`);
  console.log(`  Pools scanned:         ${analyses.length}`);
  console.log(`  Avg Depth Score:       ${avgDepth.toFixed(0)}/100`);
  console.log(`  Optimal/Good routes:   ${GREEN}${optimalCount}${RESET}`);
  console.log(`  Avoid routes:          ${avoidCount > 0 ? RED : DIM}${avoidCount}${RESET}`);
  console.log(`  Trade size tested:     ${formatUsd(tradeAmountUsd)}`);
  console.log("");
  console.log(`${DIM}  Timestamp: ${new Date().toISOString()}${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════════════════════════════════════${RESET}`);
  console.log("");
}

function printCompareTable(analyses: PoolRouteAnalysis[], tradeAmountUsd: number): void {
  console.log("");
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}  HODLMM Swap Router — Route Comparison (${formatUsd(tradeAmountUsd)})${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log("");

  const sorted = [...analyses].sort((a, b) => b.depthScore - a.depthScore);

  for (const a of sorted) {
    const vc = verdictColor(a.verdict);
    const lastSlip = a.slippageCurve.length > 0 ? a.slippageCurve[a.slippageCurve.length - 1].slippagePct : 0;

    console.log(`  ${BOLD}Pool #${a.poolId} (${a.pair})${RESET}`);
    console.log(`    Verdict: ${vc}${a.verdict}${RESET} | Depth: ${a.depthScore}/100 | Slippage: ${formatPct(lastSlip)}`);
    console.log(`    TVL: ${formatUsd(a.tvlUsd)} | Volume: ${formatUsd(a.volume24hUsd)} | Fee: ${a.feeBps}bps`);
    console.log(`    Direct routes: ${a.directRoutes.length} | Multi-hop: ${a.multiHopRoutes.length}`);
    console.log(`    Split: ${a.splitRecommendation.chunks}x chunks of ${formatUsd(a.splitRecommendation.chunkSizeUsd)}`);
    console.log(`    ${a.recommendation}`);
    console.log("");
  }

  if (sorted.length >= 2) {
    const best = sorted[0];
    console.log(`${BOLD}  Best Route:${RESET} Pool #${best.poolId} (${best.pair}) — depth ${best.depthScore}/100, ${verdictColor(best.verdict)}${best.verdict}${RESET}`);
    console.log("");
  }

  console.log(`${DIM}  Timestamp: ${new Date().toISOString()}${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log("");
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-swap-router")
  .description("HODLMM Swap Router — optimal swap execution analyzer with slippage curves, multi-hop routes, and trade splitting")
  .version("1.0.0");

program
  .command("route")
  .description("Find optimal swap routes for a specific pool")
  .argument("<pool-id>", "HODLMM pool ID")
  .option("--amount <usd>", "Trade amount in USD", "100")
  .option("--json", "Output raw JSON")
  .action(async (poolIdStr: string, opts: any) => {
    const poolId = parseInt(poolIdStr);
    if (isNaN(poolId)) {
      console.error("Invalid pool ID");
      process.exit(1);
    }

    const tradeAmountUsd = parseFloat(opts.amount) || 100;
    const pools = await fetchAllPools();
    const pool = pools.find((p) => p.poolId === poolId);
    if (!pool) {
      console.error(`Pool #${poolId} not found or below ${formatUsd(MIN_TVL_USD)} TVL minimum`);
      process.exit(1);
    }

    const analysis = await analyzePool(pool, pools, tradeAmountUsd);

    if (opts.json) {
      console.log(JSON.stringify(analysis, null, 2));
    } else {
      printRouteReport(analysis, tradeAmountUsd);
    }
  });

program
  .command("scan")
  .description("Scan all pools for swap route quality")
  .option("--amount <usd>", "Trade amount in USD", "100")
  .option("--top <n>", "Show top N pools", "10")
  .option("--json", "Output raw JSON")
  .action(async (opts: any) => {
    const pools = await fetchAllPools();
    const topN = parseInt(opts.top) || 10;
    const tradeAmountUsd = parseFloat(opts.amount) || 100;

    console.log(`${DIM}Scanning ${pools.length} pools for swap routing (${formatUsd(tradeAmountUsd)} trade)...${RESET}`);

    const analyses: PoolRouteAnalysis[] = [];
    for (const pool of pools) {
      if (!pool.poolId) continue;
      try {
        const analysis = await analyzePool(pool, pools, tradeAmountUsd);
        analyses.push(analysis);
        process.stdout.write(`${DIM}.${RESET}`);
      } catch {
        // Skip pools that error
      }
    }
    console.log("");

    const topAnalyses = analyses
      .sort((a, b) => b.depthScore - a.depthScore)
      .slice(0, topN);

    if (opts.json) {
      console.log(JSON.stringify(topAnalyses, null, 2));
    } else {
      printScanTable(topAnalyses, tradeAmountUsd);
    }
  });

program
  .command("compare")
  .description("Compare swap routes across multiple pools")
  .argument("<pool-ids...>", "Two or more pool IDs to compare")
  .option("--amount <usd>", "Trade amount in USD", "100")
  .option("--json", "Output raw JSON")
  .action(async (poolIds: string[], opts: any) => {
    if (poolIds.length < 2) {
      console.error("Provide at least 2 pool IDs to compare");
      process.exit(1);
    }

    const tradeAmountUsd = parseFloat(opts.amount) || 100;
    const pools = await fetchAllPools();
    const analyses: PoolRouteAnalysis[] = [];

    for (const idStr of poolIds) {
      const poolId = parseInt(idStr);
      const pool = pools.find((p) => p.poolId === poolId);
      if (!pool) {
        console.error(`Pool #${poolId} not found`);
        continue;
      }
      analyses.push(await analyzePool(pool, pools, tradeAmountUsd));
    }

    if (analyses.length < 2) {
      console.error("Need at least 2 valid pools to compare");
      process.exit(1);
    }

    if (opts.json) {
      console.log(JSON.stringify(analyses, null, 2));
    } else {
      printCompareTable(analyses, tradeAmountUsd);
    }
  });

program.parse();
