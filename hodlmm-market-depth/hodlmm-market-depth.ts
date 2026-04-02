#!/usr/bin/env bun
/**
 * hodlmm-market-depth.ts
 * Analyzes liquidity depth across HODLMM price bins — estimates slippage for
 * different trade sizes, identifies thin liquidity gaps, and maps the full
 * depth profile around the active price. Helps traders plan execution and LPs
 * find underserved price zones to deploy capital.
 *
 * Author: cocoa007 (Fluid Briar) — FastPool CEO
 * Competition: AIBTC x BFF Skills Comp Day 21
 *
 * Read-only. No wallet required. No transactions.
 * All data from Hiro API (on-chain read-only calls) and Bitflow public APIs.
 */

import { Command } from "commander";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";

const SENDER = "SP000000000000000000002Q6VF78"; // Read-only sender

const DISCLAIMER =
  "Market depth analysis uses on-chain bin snapshots. Liquidity can change between " +
  "observation and trade execution. Slippage estimates are approximate — actual slippage " +
  "depends on concurrent trades and MEV. Not financial advice.";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BinData {
  binId: number;
  reserveX: number;
  reserveY: number;
  totalLiquidity: number;
  priceOffset: number; // bins from active bin (negative = below, positive = above)
}

interface SlippageEstimate {
  tradeSizeUsd: number;
  tokenIn: string;
  tokenOut: string;
  estimatedSlippagePct: number;
  binsConsumed: number;
  rating: "excellent" | "good" | "moderate" | "high" | "severe";
}

interface LiquidityGap {
  startBinOffset: number;
  endBinOffset: number;
  gapWidth: number;
  side: "bid" | "ask";
  severity: "minor" | "moderate" | "critical";
  description: string;
}

interface DepthProfile {
  poolId: string;
  poolName: string;
  tokenX: string;
  tokenY: string;
  activeBinId: number;
  binStep: number;
  tvlUsd: number;
  scanRange: number;
  totalBinsScanned: number;
  binsWithLiquidity: number;
  bidDepthUsd: number;
  askDepthUsd: number;
  bidAskRatio: number;
  depthScore: number; // 0-100
  slippageEstimates: SlippageEstimate[];
  liquidityGaps: LiquidityGap[];
  depthMap: {
    binOffset: number;
    reserveX: number;
    reserveY: number;
    cumulativeDepthUsd: number;
  }[];
  healthRating: "deep" | "adequate" | "shallow" | "thin";
  recommendations: string[];
  timestamp: string;
  disclaimer: string;
}

interface AppPool {
  poolId?: string;
  tokens?: {
    tokenX?: { symbol?: string; displayName?: string; decimals?: number; priceUsd?: number };
    tokenY?: { symbol?: string; displayName?: string; decimals?: number; priceUsd?: number };
  };
  tvlUsd?: number;
  volumeUsd1d?: number;
  binStep?: number;
  bin_step?: number;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchJson(url: string): Promise<any> {
  const resp = await fetch(url, {
    headers: { Accept: "application/json" },
  });
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
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${fn}`);
  return resp.json();
}

function encodeUint(n: number): string {
  const hex = n.toString(16).padStart(32, "0");
  return "0x01" + hex;
}

// ---------------------------------------------------------------------------
// Pool data
// ---------------------------------------------------------------------------

async function fetchAppPools(): Promise<AppPool[]> {
  try {
    const resp = await fetchJson(`${BFF_APP_BASE}/pools`);
    const raw = resp as Record<string, unknown>;
    const pools: AppPool[] = Array.isArray(raw.data)
      ? raw.data
      : Array.isArray(raw)
        ? raw
        : (raw.pools as AppPool[]) || [];
    return pools.filter(
      (p: AppPool) =>
        (p.poolId && p.poolId.startsWith("dlmm_")) ||
        (p.bin_step !== undefined && p.bin_step > 0) ||
        (p.binStep !== undefined && p.binStep > 0)
    );
  } catch {
    return [];
  }
}

async function fetchOnChainPool(
  poolId: number
): Promise<{ activeBinId: number; binStep: number } | null> {
  try {
    const data = await callReadOnly("get-pool", [encodeUint(poolId)]);
    const repr = data?.result_repr || data?.result || "";
    const activeBinMatch = repr.match(/active-bin-id\s+u(\d+)/);
    const binStepMatch = repr.match(/bin-step\s+u(\d+)/);
    return {
      activeBinId: activeBinMatch ? parseInt(activeBinMatch[1]) : 0,
      binStep: binStepMatch ? parseInt(binStepMatch[1]) : 0,
    };
  } catch {
    return null;
  }
}

async function fetchBinData(
  poolId: number,
  binId: number,
  activeBinId: number
): Promise<BinData> {
  try {
    const data = await callReadOnly("get-bin", [
      encodeUint(poolId),
      encodeUint(binId),
    ]);
    const repr = data?.result_repr || data?.result || "";
    const rxMatch = repr.match(/reserve-x\s+u(\d+)/);
    const ryMatch = repr.match(/reserve-y\s+u(\d+)/);
    const reserveX = rxMatch ? parseInt(rxMatch[1]) : 0;
    const reserveY = ryMatch ? parseInt(ryMatch[1]) : 0;
    return {
      binId,
      reserveX,
      reserveY,
      totalLiquidity: reserveX + reserveY,
      priceOffset: binId - activeBinId,
    };
  } catch {
    return {
      binId,
      reserveX: 0,
      reserveY: 0,
      totalLiquidity: 0,
      priceOffset: binId - activeBinId,
    };
  }
}

// ---------------------------------------------------------------------------
// Depth analysis
// ---------------------------------------------------------------------------

function estimateSlippage(
  bins: BinData[],
  activeBinId: number,
  tradeSizeUnits: number,
  direction: "buy" | "sell"
): { slippagePct: number; binsConsumed: number } {
  // For a buy (tokenY in, tokenX out): consume ask-side bins (above active)
  // For a sell (tokenX in, tokenY out): consume bid-side bins (below active)
  const relevantBins =
    direction === "buy"
      ? bins
          .filter((b) => b.binId >= activeBinId && b.reserveX > 0)
          .sort((a, b) => a.binId - b.binId)
      : bins
          .filter((b) => b.binId <= activeBinId && b.reserveY > 0)
          .sort((a, b) => b.binId - a.binId);

  let remaining = tradeSizeUnits;
  let binsConsumed = 0;

  for (const bin of relevantBins) {
    const available = direction === "buy" ? bin.reserveX : bin.reserveY;
    if (available <= 0) continue;

    binsConsumed++;
    remaining -= available;
    if (remaining <= 0) break;
  }

  // Slippage approximation: each bin crossed adds binStep bps of price impact
  // This is simplified — real slippage depends on bin width and exact fill levels
  const avgBinsCrossed = Math.max(0, binsConsumed - 1);
  const slippagePct = remaining > 0 ? 100 : avgBinsCrossed * 0.1; // ~10 bps per bin as rough estimate

  return { slippagePct: Math.round(slippagePct * 100) / 100, binsConsumed };
}

function rateSlippage(
  pct: number
): "excellent" | "good" | "moderate" | "high" | "severe" {
  if (pct < 0.1) return "excellent";
  if (pct < 0.5) return "good";
  if (pct < 1.0) return "moderate";
  if (pct < 5.0) return "high";
  return "severe";
}

function findLiquidityGaps(
  bins: BinData[],
  activeBinId: number
): LiquidityGap[] {
  const gaps: LiquidityGap[] = [];
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);

  let gapStart: number | null = null;
  let consecutiveEmpty = 0;

  for (let i = 0; i < sorted.length; i++) {
    const bin = sorted[i];
    if (bin.totalLiquidity === 0) {
      if (gapStart === null) gapStart = bin.priceOffset;
      consecutiveEmpty++;
    } else {
      if (gapStart !== null && consecutiveEmpty >= 2) {
        const endOffset = sorted[i - 1].priceOffset;
        const side: "bid" | "ask" = gapStart < 0 ? "bid" : "ask";
        const severity: "minor" | "moderate" | "critical" =
          consecutiveEmpty >= 8
            ? "critical"
            : consecutiveEmpty >= 4
              ? "moderate"
              : "minor";

        gaps.push({
          startBinOffset: gapStart,
          endBinOffset: endOffset,
          gapWidth: consecutiveEmpty,
          side,
          severity,
          description: `${consecutiveEmpty} empty bins ${side === "bid" ? "below" : "above"} active price (offset ${gapStart} to ${endOffset})`,
        });
      }
      gapStart = null;
      consecutiveEmpty = 0;
    }
  }

  // Handle trailing gap
  if (gapStart !== null && consecutiveEmpty >= 2) {
    const endOffset = sorted[sorted.length - 1].priceOffset;
    const side: "bid" | "ask" = gapStart < 0 ? "bid" : "ask";
    const severity: "minor" | "moderate" | "critical" =
      consecutiveEmpty >= 8
        ? "critical"
        : consecutiveEmpty >= 4
          ? "moderate"
          : "minor";
    gaps.push({
      startBinOffset: gapStart,
      endBinOffset: endOffset,
      gapWidth: consecutiveEmpty,
      side,
      severity,
      description: `${consecutiveEmpty} empty bins ${side === "bid" ? "below" : "above"} active price (offset ${gapStart} to ${endOffset})`,
    });
  }

  return gaps;
}

function computeDepthScore(
  binsWithLiquidity: number,
  totalBins: number,
  bidDepth: number,
  askDepth: number,
  gaps: LiquidityGap[]
): number {
  let score = 0;

  // Coverage: % of bins with liquidity (0-40 points)
  const coverage = totalBins > 0 ? binsWithLiquidity / totalBins : 0;
  score += Math.round(coverage * 40);

  // Balance: bid/ask ratio closeness to 1.0 (0-30 points)
  const total = bidDepth + askDepth;
  if (total > 0) {
    const ratio = Math.min(bidDepth, askDepth) / Math.max(bidDepth, askDepth);
    score += Math.round(ratio * 30);
  }

  // Continuity: penalize gaps (0-30 points)
  const criticalGaps = gaps.filter((g) => g.severity === "critical").length;
  const moderateGaps = gaps.filter((g) => g.severity === "moderate").length;
  const gapPenalty = criticalGaps * 15 + moderateGaps * 5;
  score += Math.max(0, 30 - gapPenalty);

  return Math.min(100, Math.max(0, score));
}

function rateHealth(
  score: number
): "deep" | "adequate" | "shallow" | "thin" {
  if (score >= 75) return "deep";
  if (score >= 50) return "adequate";
  if (score >= 25) return "shallow";
  return "thin";
}

function generateRecommendations(
  profile: Partial<DepthProfile>,
  gaps: LiquidityGap[]
): string[] {
  const recs: string[] = [];

  if (profile.healthRating === "thin") {
    recs.push(
      "Liquidity is extremely thin — large trades will experience significant slippage. Consider splitting orders or using limit orders."
    );
  }

  if (profile.bidAskRatio !== undefined) {
    if (profile.bidAskRatio < 0.3) {
      recs.push(
        "Bid-side depth is much weaker than ask-side. LPs can earn higher utilization by deploying below the active price."
      );
    } else if (profile.bidAskRatio > 3.0) {
      recs.push(
        "Ask-side depth is much weaker than bid-side. LPs can earn higher utilization by deploying above the active price."
      );
    }
  }

  const criticalGaps = gaps.filter((g) => g.severity === "critical");
  for (const gap of criticalGaps) {
    recs.push(
      `Critical liquidity gap on ${gap.side} side (${gap.gapWidth} empty bins at offset ${gap.startBinOffset} to ${gap.endBinOffset}). LPs deploying here would face little competition.`
    );
  }

  if (recs.length === 0) {
    recs.push(
      "Liquidity depth is healthy. No critical gaps or imbalances detected."
    );
  }

  return recs;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function runDoctor(): Promise<void> {
  const checks: { name: string; ok: boolean; detail: string }[] = [];

  try {
    const data = await callReadOnly("get-pool", [encodeUint(1)]);
    checks.push({
      name: "Hiro API (DLMM contract)",
      ok: !!data?.result,
      detail: data?.result ? "Reachable" : "No result",
    });
  } catch (e: any) {
    checks.push({
      name: "Hiro API (DLMM contract)",
      ok: false,
      detail: e.message,
    });
  }

  try {
    const appPools = await fetchAppPools();
    checks.push({
      name: "Bitflow App API (pools)",
      ok: appPools.length > 0,
      detail: `${appPools.length} DLMM pools found`,
    });
  } catch (e: any) {
    checks.push({
      name: "Bitflow App API (pools)",
      ok: false,
      detail: e.message,
    });
  }

  const allOk = checks.every((c) => c.ok);
  const bitflowOk = checks.some((c) => c.name.includes("Bitflow") && c.ok);
  console.log(
    JSON.stringify(
      {
        status: allOk ? "ok" : bitflowOk ? "degraded" : "error",
        checks,
        message: allOk
          ? "All data sources available."
          : bitflowOk
            ? "Some data sources unavailable — depth analysis will use API data with reduced on-chain detail."
            : "Critical data sources unavailable.",
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  );
  process.exit(bitflowOk ? 0 : 1);
}

async function runInstallPacks(): Promise<void> {
  console.log(
    JSON.stringify({
      status: "ok",
      message: "No external dependencies — bun runtime only.",
    })
  );
}

async function runDepthAnalysis(options: {
  pool?: string;
  range?: number;
  tradeSizes?: string;
}): Promise<void> {
  const poolFilter = options.pool || "";
  const scanRange = options.range || 25;
  const tradeSizesUsd = options.tradeSizes
    ? options.tradeSizes.split(",").map((s) => parseFloat(s.trim()))
    : [100, 500, 1000, 5000, 10000];

  // Fetch pools
  const appPools = await fetchAppPools();
  if (appPools.length === 0) {
    console.log(
      JSON.stringify({ error: "No HODLMM pools found from Bitflow API." })
    );
    process.exit(1);
  }

  // Find target pool
  let targetPool: AppPool | undefined;
  if (poolFilter) {
    const filter = poolFilter.toLowerCase();
    targetPool = appPools.find((p) => {
      const id = (p.poolId || "").toLowerCase();
      const tokenX = (p.tokens?.tokenX?.symbol || "").toLowerCase();
      const tokenY = (p.tokens?.tokenY?.symbol || "").toLowerCase();
      return (
        id === filter ||
        id.includes(filter) ||
        `${tokenX}-${tokenY}`.includes(filter) ||
        `${tokenY}-${tokenX}`.includes(filter)
      );
    });
  } else {
    // Default to highest TVL pool
    targetPool = appPools.sort(
      (a, b) => (b.tvlUsd || 0) - (a.tvlUsd || 0)
    )[0];
  }

  if (!targetPool) {
    console.log(
      JSON.stringify({
        error: `Pool "${poolFilter}" not found.`,
        availablePools: appPools
          .map(
            (p) =>
              `${p.poolId}: ${p.tokens?.tokenX?.symbol}-${p.tokens?.tokenY?.symbol}`
          )
          .slice(0, 10),
      })
    );
    process.exit(1);
  }

  const poolId = targetPool.poolId || "unknown";
  const tokenX =
    targetPool.tokens?.tokenX?.symbol ||
    targetPool.tokens?.tokenX?.displayName ||
    "?";
  const tokenY =
    targetPool.tokens?.tokenY?.symbol ||
    targetPool.tokens?.tokenY?.displayName ||
    "?";
  const poolName = `${tokenX}-${tokenY}`;
  const tvlUsd = targetPool.tvlUsd || 0;
  const priceX = targetPool.tokens?.tokenX?.priceUsd || 0;
  const priceY = targetPool.tokens?.tokenY?.priceUsd || 0;
  const decimalsX = targetPool.tokens?.tokenX?.decimals || 8;
  const decimalsY = targetPool.tokens?.tokenY?.decimals || 6;

  // Get on-chain pool data
  const numericId = parseInt(poolId.replace(/\D/g, "")) || 0;
  if (numericId === 0) {
    console.log(
      JSON.stringify({
        error: "Cannot derive numeric pool ID for on-chain query.",
        poolId,
      })
    );
    process.exit(1);
  }

  const onChain = await fetchOnChainPool(numericId);
  if (!onChain || onChain.activeBinId === 0) {
    console.log(
      JSON.stringify({
        error: "Could not fetch on-chain pool data.",
        poolId,
        hint: "Hiro API may be rate-limited or the pool ID may not match an on-chain pool.",
      })
    );
    process.exit(1);
  }

  const { activeBinId, binStep } = onChain;

  // Scan bins around active bin
  const startBin = activeBinId - scanRange;
  const endBin = activeBinId + scanRange;
  const totalBinsToScan = endBin - startBin + 1;

  // Fetch bin data in batches to avoid rate limits
  const batchSize = 10;
  const allBins: BinData[] = [];

  for (let i = startBin; i <= endBin; i += batchSize) {
    const batch: Promise<BinData>[] = [];
    for (let j = i; j < Math.min(i + batchSize, endBin + 1); j++) {
      batch.push(fetchBinData(numericId, j, activeBinId));
    }
    const results = await Promise.all(batch);
    allBins.push(...results);
  }

  // Analyze depth
  const binsWithLiquidity = allBins.filter((b) => b.totalLiquidity > 0).length;

  // Calculate bid/ask depth in USD
  let bidDepthRaw = 0; // Liquidity below active bin (tokenY reserves)
  let askDepthRaw = 0; // Liquidity above active bin (tokenX reserves)

  for (const bin of allBins) {
    if (bin.binId < activeBinId) {
      bidDepthRaw += bin.reserveY;
    } else if (bin.binId > activeBinId) {
      askDepthRaw += bin.reserveX;
    } else {
      // Active bin has both sides
      bidDepthRaw += bin.reserveY;
      askDepthRaw += bin.reserveX;
    }
  }

  // Convert to USD using token prices
  const bidDepthUsd =
    priceY > 0
      ? (bidDepthRaw / Math.pow(10, decimalsY)) * priceY
      : bidDepthRaw / 1e6; // fallback estimate
  const askDepthUsd =
    priceX > 0
      ? (askDepthRaw / Math.pow(10, decimalsX)) * priceX
      : askDepthRaw / 1e8; // fallback estimate

  const bidAskRatio =
    askDepthUsd > 0 ? Math.round((bidDepthUsd / askDepthUsd) * 100) / 100 : 0;

  // Slippage estimates
  const slippageEstimates: SlippageEstimate[] = [];
  for (const sizeUsd of tradeSizesUsd) {
    // Buy estimate (tokenY in → tokenX out)
    const buyUnits =
      priceX > 0 ? (sizeUsd / priceX) * Math.pow(10, decimalsX) : sizeUsd;
    const buySlip = estimateSlippage(allBins, activeBinId, buyUnits, "buy");
    slippageEstimates.push({
      tradeSizeUsd: sizeUsd,
      tokenIn: tokenY,
      tokenOut: tokenX,
      estimatedSlippagePct: buySlip.slippagePct,
      binsConsumed: buySlip.binsConsumed,
      rating: rateSlippage(buySlip.slippagePct),
    });

    // Sell estimate (tokenX in → tokenY out)
    const sellUnits =
      priceY > 0 ? (sizeUsd / priceY) * Math.pow(10, decimalsY) : sizeUsd;
    const sellSlip = estimateSlippage(allBins, activeBinId, sellUnits, "sell");
    slippageEstimates.push({
      tradeSizeUsd: sizeUsd,
      tokenIn: tokenX,
      tokenOut: tokenY,
      estimatedSlippagePct: sellSlip.slippagePct,
      binsConsumed: sellSlip.binsConsumed,
      rating: rateSlippage(sellSlip.slippagePct),
    });
  }

  // Find liquidity gaps
  const gaps = findLiquidityGaps(allBins, activeBinId);

  // Compute depth score
  const depthScore = computeDepthScore(
    binsWithLiquidity,
    totalBinsToScan,
    bidDepthUsd,
    askDepthUsd,
    gaps
  );
  const healthRating = rateHealth(depthScore);

  // Build depth map (summarized — every 5th bin for readability)
  let cumulativeDepth = 0;
  const depthMap = allBins
    .filter((_, i) => i % 5 === 0 || allBins[i].totalLiquidity > 0)
    .slice(0, 30) // Limit output size
    .map((bin) => {
      const binUsd =
        (bin.reserveX / Math.pow(10, decimalsX)) * (priceX || 0) +
        (bin.reserveY / Math.pow(10, decimalsY)) * (priceY || 0);
      cumulativeDepth += binUsd;
      return {
        binOffset: bin.priceOffset,
        reserveX: bin.reserveX,
        reserveY: bin.reserveY,
        cumulativeDepthUsd: Math.round(cumulativeDepth * 100) / 100,
      };
    });

  // Recommendations
  const partialProfile: Partial<DepthProfile> = {
    healthRating,
    bidAskRatio,
  };
  const recommendations = generateRecommendations(partialProfile, gaps);

  const result: DepthProfile = {
    poolId,
    poolName,
    tokenX,
    tokenY,
    activeBinId,
    binStep,
    tvlUsd: Math.round(tvlUsd * 100) / 100,
    scanRange,
    totalBinsScanned: totalBinsToScan,
    binsWithLiquidity,
    bidDepthUsd: Math.round(bidDepthUsd * 100) / 100,
    askDepthUsd: Math.round(askDepthUsd * 100) / 100,
    bidAskRatio,
    depthScore,
    slippageEstimates,
    liquidityGaps: gaps,
    depthMap,
    healthRating,
    recommendations,
    timestamp: new Date().toISOString(),
    disclaimer: DISCLAIMER,
  };

  console.log(JSON.stringify(result, null, 2));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name("hodlmm-market-depth")
  .description(
    "Analyze liquidity depth across HODLMM price bins — slippage estimation, gap detection, and depth profiling."
  );

program
  .command("doctor")
  .description("Check API connectivity")
  .action(runDoctor);

program
  .command("install-packs")
  .description("Install dependencies (none required)")
  .action(runInstallPacks);

program
  .command("run")
  .description("Analyze market depth for an HODLMM pool")
  .option(
    "--pool <id>",
    "Pool ID or token pair name (e.g., dlmm_1, sbtc-stx). Default: highest TVL pool"
  )
  .option(
    "--range <bins>",
    "Number of bins to scan on each side of active bin (default: 25)",
    parseInt
  )
  .option(
    "--trade-sizes <usd>",
    "Comma-separated trade sizes in USD for slippage estimates (default: 100,500,1000,5000,10000)"
  )
  .action(runDepthAnalysis);

program.parse();
