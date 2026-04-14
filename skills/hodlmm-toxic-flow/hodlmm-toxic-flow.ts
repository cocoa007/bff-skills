#!/usr/bin/env bun
/**
 * hodlmm-toxic-flow.ts
 *
 * HODLMM Toxic Flow Detector — Analyzes swap events on HODLMM (DLMM) pools
 * to detect toxic order flow: informed trading that systematically extracts
 * value from liquidity providers through adverse selection.
 *
 * Key signals:
 *  - Directional clustering: sequences of same-direction swaps (buy-buy-buy)
 *    suggest informed traders front-running or momentum-chasing
 *  - Size anomaly: swaps significantly larger than median indicate
 *    whale / bot activity that overwhelms LP inventory
 *  - Timing clustering: bursts of rapid swaps signal MEV or bot activity
 *  - Active bin impact: swaps that repeatedly move the active bin suggest
 *    informed trading ahead of price moves
 *  - Repeat addresses: addresses appearing in many swaps may be arb bots
 *
 * Output: per-pool toxic flow score (0-100), flow classification, and
 * estimated adverse selection cost for LPs.
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 67).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 500;
const EVENT_SCAN_LIMIT = 50;

// Toxic flow classification thresholds
const TOXIC_SCORE_THRESHOLD_ARB_HEAVY = 60;
const TOXIC_SCORE_THRESHOLD_MIXED = 35;
// Below MIXED = ORGANIC
// Above ARB_HEAVY with extreme signals = TOXIC

// Size anomaly: swaps > this multiple of median are flagged as large
const LARGE_SWAP_MULTIPLIER = 2.0;

// Repeat address: address with this many or more swaps is bot-suspect
const BOT_SWAP_COUNT_THRESHOLD = 3;

// Direction run: same-direction run of this length or more is flagged
const DIRECTION_RUN_THRESHOLD = 4;

// Timing: block gap below this is a burst (within 2 blocks = very fast)
const BURST_BLOCK_GAP = 3;

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

type SwapDirection = "BUY" | "SELL" | "UNKNOWN";
type FlowClass = "ORGANIC" | "MIXED" | "ARB-HEAVY" | "TOXIC";

interface SwapEvent {
  txId: string;
  sender: string;
  blockHeight: number;
  direction: SwapDirection;
  amountInRaw: number;
  amountOutRaw: number;
  estimatedUsd: number;
  activeBinBefore?: number;
  activeBinAfter?: number;
  binMoved: boolean;
  toxicScore: number;
  toxicReasons: string[];
}

interface DirectionalStats {
  buyCount: number;
  sellCount: number;
  unknownCount: number;
  totalSwaps: number;
  buyPct: number;
  sellPct: number;
  longestRun: number;
  runDirection: SwapDirection;
  clusteringScore: number; // 0-100
}

interface SizeAnomalyStats {
  medianUsd: number;
  largeThresholdUsd: number;
  outsizedCount: number;
  outsizedPct: number;
  maxSwapUsd: number;
  sizeAnomalyScore: number; // 0-100
}

interface TimingStats {
  avgBlockGap: number;
  minBlockGap: number;
  burstCount: number;
  burstPct: number;
  timingScore: number; // 0-100
}

interface RepeatAddressStats {
  uniqueSwappers: number;
  topAddress: string;
  topAddressSwaps: number;
  topAddressPct: number;
  botSuspectCount: number;
  repeatScore: number; // 0-100
}

interface BinImpactStats {
  binMovements: number;
  binsMovedPct: number;
  totalActiveBinChanges: number;
  binImpactScore: number; // 0-100
}

interface ToxicFlowAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  totalSwapsAnalyzed: number;
  toxicFlowScore: number; // 0-100 composite
  classification: FlowClass;
  directional: DirectionalStats;
  sizeAnomaly: SizeAnomalyStats;
  timing: TimingStats;
  repeatAddress: RepeatAddressStats;
  binImpact: BinImpactStats;
  topToxicAddresses: Array<{ address: string; swaps: number; pct: number }>;
  estimatedAdverseSelectionUsd: number;
  riskFlags: string[];
  verdict: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string, retries = 3): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (!r.ok) {
        if (r.status === 429 && i < retries) {
          await sleep(2500 * (i + 1));
          continue;
        }
        throw new Error(`HTTP ${r.status} for ${url}`);
      }
      return r.json();
    } catch (e: any) {
      if (i === retries) throw e;
      await sleep(1200 * (i + 1));
    }
  }
}

function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`;
}

function scoreBar(score: number, width = 12): string {
  const filled = Math.round((score / 100) * width);
  return "█".repeat(Math.min(filled, width)) + "░".repeat(Math.max(width - filled, 0));
}

function shortAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function classifyToxicFlow(score: number): FlowClass {
  if (score >= 75) return "TOXIC";
  if (score >= TOXIC_SCORE_THRESHOLD_ARB_HEAVY) return "ARB-HEAVY";
  if (score >= TOXIC_SCORE_THRESHOLD_MIXED) return "MIXED";
  return "ORGANIC";
}

function classIcon(cls: FlowClass): string {
  switch (cls) {
    case "ORGANIC":   return "🌿";
    case "MIXED":     return "⚖️";
    case "ARB-HEAVY": return "⚡";
    case "TOXIC":     return "☠️";
  }
}

function scoreIcon(score: number): string {
  if (score >= 70) return "🔴";
  if (score >= 45) return "🟠";
  if (score >= 25) return "🟡";
  return "🟢";
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ── Data Fetching ─────────────────────────────────────────────────────────────

async function fetchPools(): Promise<AppPool[]> {
  // Fetch all pages from the pools endpoint
  const allPools: any[] = [];
  let url = `${BFF_APP_BASE}/pools?limit=50`;
  for (let page = 0; page < 10; page++) {
    const data = await fetchJson(url);
    const items: any[] = Array.isArray(data) ? data : data?.data ?? data?.pools ?? [];
    allPools.push(...items);
    if (!data?.hasMore || !data?.nextCursor) break;
    url = `${BFF_APP_BASE}/pools?limit=50&cursor=${encodeURIComponent(data.nextCursor)}`;
  }

  return allPools
    .filter((p: any) => {
      // Only DLMM pools
      const types: string[] = p.types ?? [];
      return types.includes("DLMM") || types.includes("ALL_POOLS");
    })
    .map((p: any) => {
      // New API structure uses tokens.tokenX / tokens.tokenY
      const tx = p.tokens?.tokenX ?? {};
      const ty = p.tokens?.tokenY ?? {};
      // Extract numeric pool ID from poolId string like "dlmm_1" → 1
      const rawId: string = String(p.poolId ?? "0");
      const numericId = parseInt(rawId.replace(/\D+/g, "")) || 0;
      // feeBps: baseFee is a decimal (e.g. 0.003 = 0.3%) → convert to bps
      const feeBps = p.baseFee != null
        ? parseFloat(String(p.baseFee)) * 10_000
        : parseFloat(p.feeBps ?? "30");
      return {
        id: rawId,
        token0Symbol: tx.symbol ?? p.token0Symbol ?? "?",
        token1Symbol: ty.symbol ?? p.token1Symbol ?? "?",
        tvlUsd: parseFloat(String(p.tvlUsd ?? "0")),
        volume24hUsd: parseFloat(String(p.volumeUsd1d ?? p.volume24hUsd ?? "0")),
        poolId: numericId,
        token0Decimals: parseInt(String(tx.decimals ?? p.token0Decimals ?? "6")),
        token1Decimals: parseInt(String(ty.decimals ?? p.token1Decimals ?? "6")),
        token0PriceUsd: parseFloat(String(tx.priceUsd ?? p.token0PriceUsd ?? "0")),
        token1PriceUsd: parseFloat(String(ty.priceUsd ?? p.token1PriceUsd ?? "0")),
        activeBinId: parseInt(String(p.activeBinId ?? "0")) || undefined,
        feeBps,
      } as AppPool;
    })
    .filter((p: AppPool) => p.tvlUsd >= MIN_TVL_USD);
}

function findPool(query: string, pools: AppPool[]): AppPool | null {
  const q = query.toLowerCase();
  return (
    pools.find((p) => String(p.poolId) === q) ??
    pools.find((p) => p.id?.toLowerCase() === q) ??
    pools.find((p) => {
      const pair = `${p.token0Symbol}-${p.token1Symbol}`.toLowerCase();
      return pair.includes(q) || q.includes(pair);
    }) ??
    pools.find((p) => {
      const sym = `${p.token0Symbol}${p.token1Symbol}`.toLowerCase();
      return sym.includes(q);
    }) ??
    null
  );
}

async function fetchContractEvents(offset = 0, limit = EVENT_SCAN_LIMIT): Promise<any[]> {
  const url = `${HIRO_API}/extended/v1/contract/${DLMM_CONTRACT_ADDR}.${DLMM_CONTRACT_NAME}/events?offset=${offset}&limit=${limit}`;
  const data = await fetchJson(url);
  return data?.results ?? data?.events ?? [];
}

// ── Swap Event Parsing ─────────────────────────────────────────────────────────

/**
 * Parse contract log events to extract swap data.
 * DLMM print events contain Clarity tuple values with swap details.
 * We look for events with `swap` in their repr, extract sender, amounts,
 * and active bin information.
 */
function parseSwapEvents(rawEvents: any[], pool: AppPool): SwapEvent[] {
  const swaps: SwapEvent[] = [];
  const poolId = pool.poolId ?? parseInt(pool.id);

  for (const event of rawEvents) {
    // Only process smart_contract_log events
    if (event.event_type !== "smart_contract_log") continue;

    const repr: string = event?.contract_log?.value?.repr ?? "";
    if (!repr) continue;

    // Filter to swap events: must mention "swap"
    const isSwap =
      repr.includes("swap") ||
      repr.includes("token-in") ||
      repr.includes("amount-in") ||
      repr.includes("amount-x-in") ||
      repr.includes("amount-y-in");
    if (!isSwap) continue;

    // Filter by pool ID if present
    const pidMatch = repr.match(/pool-id\s+u(\d+)/);
    if (pidMatch && parseInt(pidMatch[1]) !== poolId) continue;
    // If no pool-id in repr, we can't confirm it's for this pool — skip
    if (!pidMatch) continue;

    const txId = event.tx_id ?? "";
    const blockHeight = event.block_height ?? 0;

    // Extract sender address
    const senderMatch =
      repr.match(/sender\s+(SP[A-Z0-9]+)/) ??
      repr.match(/swapper\s+(SP[A-Z0-9]+)/) ??
      repr.match(/user\s+(SP[A-Z0-9]+)/);
    const sender = senderMatch?.[1] ?? (event.sender ?? "");

    // Extract raw amounts — try several field name patterns
    const amountInMatch =
      repr.match(/amount-in\s+u(\d+)/) ??
      repr.match(/amount-x-in\s+u(\d+)/) ??
      repr.match(/amount-y-in\s+u(\d+)/) ??
      repr.match(/token-in\s+u(\d+)/);
    const amountOutMatch =
      repr.match(/amount-out\s+u(\d+)/) ??
      repr.match(/amount-x-out\s+u(\d+)/) ??
      repr.match(/amount-y-out\s+u(\d+)/) ??
      repr.match(/token-out\s+u(\d+)/);

    const amountInRaw = amountInMatch ? parseInt(amountInMatch[1]) : 0;
    const amountOutRaw = amountOutMatch ? parseInt(amountOutMatch[1]) : 0;

    // Detect swap direction:
    // "swap-x-to-y" / "buy-y" = buying token1 with token0 → BUY
    // "swap-y-to-x" / "sell-y" = selling token1 for token0 → SELL
    let direction: SwapDirection = "UNKNOWN";
    if (
      repr.includes("swap-x-to-y") ||
      repr.includes("x-to-y") ||
      repr.includes("buy") ||
      repr.includes("amount-y-out")
    ) {
      direction = "BUY";
    } else if (
      repr.includes("swap-y-to-x") ||
      repr.includes("y-to-x") ||
      repr.includes("sell") ||
      repr.includes("amount-x-out")
    ) {
      direction = "SELL";
    }

    // Extract active bin if available
    const activeBinMatch =
      repr.match(/active-id\s+u(\d+)/) ??
      repr.match(/active-bin\s+u(\d+)/) ??
      repr.match(/new-active-id\s+u(\d+)/);
    const oldBinMatch =
      repr.match(/old-active-id\s+u(\d+)/) ??
      repr.match(/prev-active-id\s+u(\d+)/);

    const activeBinAfter = activeBinMatch ? parseInt(activeBinMatch[1]) : undefined;
    const activeBinBefore = oldBinMatch ? parseInt(oldBinMatch[1]) : undefined;
    const binMoved =
      activeBinBefore !== undefined &&
      activeBinAfter !== undefined &&
      activeBinBefore !== activeBinAfter;

    // Estimate USD value: use token0 price as reference
    // If amount-in is in token0 units, convert directly
    // Fallback: use fraction of pool volume to avoid wild swings
    let estimatedUsd = 0;
    if (amountInRaw > 0 && pool.token0PriceUsd > 0) {
      const tokenAmt = amountInRaw / 10 ** pool.token0Decimals;
      const candidateUsd = tokenAmt * pool.token0PriceUsd;
      // Sanity cap: a single swap shouldn't exceed 50% of TVL
      estimatedUsd = Math.min(candidateUsd, pool.tvlUsd * 0.5);
    }
    if (estimatedUsd === 0 && amountOutRaw > 0 && pool.token1PriceUsd > 0) {
      const tokenAmt = amountOutRaw / 10 ** pool.token1Decimals;
      const candidateUsd = tokenAmt * pool.token1PriceUsd;
      estimatedUsd = Math.min(candidateUsd, pool.tvlUsd * 0.5);
    }

    swaps.push({
      txId,
      sender,
      blockHeight,
      direction,
      amountInRaw,
      amountOutRaw,
      estimatedUsd,
      activeBinBefore,
      activeBinAfter,
      binMoved,
      toxicScore: 0,
      toxicReasons: [],
    });
  }

  // Sort oldest first so sequential analysis is meaningful
  return swaps.sort((a, b) => a.blockHeight - b.blockHeight);
}

// ── Signal Analysis ────────────────────────────────────────────────────────────

function analyzeDirectionalClustering(swaps: SwapEvent[]): DirectionalStats {
  const directed = swaps.filter((s) => s.direction !== "UNKNOWN");
  const buyCount = directed.filter((s) => s.direction === "BUY").length;
  const sellCount = directed.filter((s) => s.direction === "SELL").length;
  const unknownCount = swaps.length - directed.length;
  const total = swaps.length;

  // Find longest same-direction run
  let longestRun = 0;
  let runDirection: SwapDirection = "UNKNOWN";
  let currentRun = 0;
  let currentDir: SwapDirection = "UNKNOWN";

  for (const swap of swaps) {
    if (swap.direction === "UNKNOWN") {
      currentRun = 0;
      currentDir = "UNKNOWN";
      continue;
    }
    if (swap.direction === currentDir) {
      currentRun++;
    } else {
      currentRun = 1;
      currentDir = swap.direction;
    }
    if (currentRun > longestRun) {
      longestRun = currentRun;
      runDirection = currentDir;
    }
  }

  const totalKnown = buyCount + sellCount;
  const buyPct = totalKnown > 0 ? (buyCount / totalKnown) * 100 : 50;
  const sellPct = totalKnown > 0 ? (sellCount / totalKnown) * 100 : 50;

  // Clustering score: long runs and heavy directional bias both increase it
  let clusteringScore = 0;
  // Run length contribution
  if (longestRun >= 8) clusteringScore += 40;
  else if (longestRun >= DIRECTION_RUN_THRESHOLD) clusteringScore += 20 + (longestRun - DIRECTION_RUN_THRESHOLD) * 4;
  // Directional bias contribution (how far from 50/50)
  const bias = Math.abs(buyPct - 50);
  if (bias >= 40) clusteringScore += 35;
  else if (bias >= 25) clusteringScore += 20;
  else if (bias >= 15) clusteringScore += 10;
  // Low data penalty
  if (total < 5) clusteringScore = Math.min(clusteringScore, 30);

  return {
    buyCount,
    sellCount,
    unknownCount,
    totalSwaps: total,
    buyPct,
    sellPct,
    longestRun,
    runDirection,
    clusteringScore: Math.min(clusteringScore, 100),
  };
}

function analyzeSizeAnomaly(swaps: SwapEvent[]): SizeAnomalyStats {
  const usdValues = swaps.map((s) => s.estimatedUsd).filter((v) => v > 0);
  if (usdValues.length === 0) {
    return {
      medianUsd: 0,
      largeThresholdUsd: 0,
      outsizedCount: 0,
      outsizedPct: 0,
      maxSwapUsd: 0,
      sizeAnomalyScore: 0,
    };
  }

  const med = median(usdValues);
  const largeThreshold = med * LARGE_SWAP_MULTIPLIER;
  const outsized = usdValues.filter((v) => v > largeThreshold);
  const outsizedPct = (outsized.length / usdValues.length) * 100;
  const maxSwapUsd = Math.max(...usdValues);

  // Score: more outsized swaps and bigger max/median ratio = higher
  let sizeAnomalyScore = 0;
  if (outsizedPct >= 30) sizeAnomalyScore += 40;
  else if (outsizedPct >= 15) sizeAnomalyScore += 25;
  else if (outsizedPct >= 5) sizeAnomalyScore += 10;

  const maxToMedianRatio = med > 0 ? maxSwapUsd / med : 0;
  if (maxToMedianRatio >= 20) sizeAnomalyScore += 35;
  else if (maxToMedianRatio >= 10) sizeAnomalyScore += 20;
  else if (maxToMedianRatio >= 5) sizeAnomalyScore += 10;

  // Absolute size contribution: large swaps relative to TVL are more risky
  if (maxSwapUsd > 0 && usdValues.length > 0) {
    const avgSwap = usdValues.reduce((a, b) => a + b, 0) / usdValues.length;
    if (avgSwap > 5000) sizeAnomalyScore += 25;
    else if (avgSwap > 1000) sizeAnomalyScore += 15;
    else if (avgSwap > 500) sizeAnomalyScore += 5;
  }

  return {
    medianUsd: med,
    largeThresholdUsd: largeThreshold,
    outsizedCount: outsized.length,
    outsizedPct,
    maxSwapUsd,
    sizeAnomalyScore: Math.min(sizeAnomalyScore, 100),
  };
}

function analyzeTimingClustering(swaps: SwapEvent[]): TimingStats {
  if (swaps.length < 2) {
    return {
      avgBlockGap: 0,
      minBlockGap: 0,
      burstCount: 0,
      burstPct: 0,
      timingScore: 0,
    };
  }

  const gaps: number[] = [];
  for (let i = 1; i < swaps.length; i++) {
    const gap = Math.abs(swaps[i].blockHeight - swaps[i - 1].blockHeight);
    gaps.push(gap);
  }

  const avgBlockGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const minBlockGap = Math.min(...gaps);
  const burstCount = gaps.filter((g) => g < BURST_BLOCK_GAP).length;
  const burstPct = (burstCount / gaps.length) * 100;

  // Timing score: more bursts and faster avg = higher toxicity
  let timingScore = 0;
  if (avgBlockGap < 1) timingScore += 40;
  else if (avgBlockGap < 3) timingScore += 25;
  else if (avgBlockGap < 6) timingScore += 10;

  if (burstPct >= 40) timingScore += 35;
  else if (burstPct >= 20) timingScore += 20;
  else if (burstPct >= 10) timingScore += 10;

  if (minBlockGap === 0) timingScore += 25; // Same-block swaps = very suspicious

  return {
    avgBlockGap,
    minBlockGap,
    burstCount,
    burstPct,
    timingScore: Math.min(timingScore, 100),
  };
}

function analyzeRepeatAddresses(swaps: SwapEvent[]): RepeatAddressStats {
  const counts: Map<string, number> = new Map();
  for (const swap of swaps) {
    if (!swap.sender) continue;
    counts.set(swap.sender, (counts.get(swap.sender) ?? 0) + 1);
  }

  const uniqueSwappers = counts.size;
  if (uniqueSwappers === 0) {
    return {
      uniqueSwappers: 0,
      topAddress: "",
      topAddressSwaps: 0,
      topAddressPct: 0,
      botSuspectCount: 0,
      repeatScore: 0,
    };
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [topAddress, topAddressSwaps] = sorted[0];
  const topAddressPct = (topAddressSwaps / swaps.length) * 100;
  const botSuspectCount = [...counts.values()].filter(
    (c) => c >= BOT_SWAP_COUNT_THRESHOLD
  ).length;

  // Score: few unique swappers, dominant address, many bots = higher
  let repeatScore = 0;
  const uniquenessRatio = uniqueSwappers / Math.max(swaps.length, 1);
  if (uniquenessRatio < 0.2) repeatScore += 35; // <20% unique = very concentrated
  else if (uniquenessRatio < 0.4) repeatScore += 20;
  else if (uniquenessRatio < 0.6) repeatScore += 10;

  if (topAddressPct >= 40) repeatScore += 35;
  else if (topAddressPct >= 25) repeatScore += 20;
  else if (topAddressPct >= 15) repeatScore += 10;

  if (botSuspectCount >= 3) repeatScore += 30;
  else if (botSuspectCount >= 2) repeatScore += 20;
  else if (botSuspectCount >= 1) repeatScore += 10;

  return {
    uniqueSwappers,
    topAddress,
    topAddressSwaps,
    topAddressPct,
    botSuspectCount,
    repeatScore: Math.min(repeatScore, 100),
  };
}

function analyzeBinImpact(swaps: SwapEvent[]): BinImpactStats {
  const binMovingSwaps = swaps.filter((s) => s.binMoved);
  const totalActiveBinChanges = binMovingSwaps.length;
  const binsMovedPct =
    swaps.length > 0 ? (totalActiveBinChanges / swaps.length) * 100 : 0;
  // Count swaps that recorded any active-bin field at all
  const swapsWithBinData = swaps.filter(
    (s) => s.activeBinAfter !== undefined
  ).length;
  const binMovements = totalActiveBinChanges;

  // Score: frequent bin movement suggests informed directional pressure
  let binImpactScore = 0;
  if (binsMovedPct >= 30) binImpactScore += 50;
  else if (binsMovedPct >= 15) binImpactScore += 30;
  else if (binsMovedPct >= 5) binImpactScore += 15;

  if (binMovements >= 5) binImpactScore += 30;
  else if (binMovements >= 2) binImpactScore += 15;
  else if (binMovements >= 1) binImpactScore += 5;

  // If we have no bin data at all, set a neutral low score
  if (swapsWithBinData === 0) binImpactScore = Math.min(binImpactScore, 10);

  return {
    binMovements,
    binsMovedPct,
    totalActiveBinChanges,
    binImpactScore: Math.min(binImpactScore, 100),
  };
}

/**
 * Score each swap individually for toxicity, annotating reasons.
 * Scores feed into per-swap classification; aggregate drives pool-level metrics.
 */
function scoreSwaps(
  swaps: SwapEvent[],
  sizeStats: SizeAnomalyStats,
  repeatStats: RepeatAddressStats,
  dirStats: DirectionalStats
): void {
  const totalSwaps = swaps.length;

  // Find addresses that are repeat/bot-suspect
  const counts: Map<string, number> = new Map();
  for (const s of swaps) {
    if (s.sender) counts.set(s.sender, (counts.get(s.sender) ?? 0) + 1);
  }

  // Track run position for each swap
  let currentRun = 0;
  let currentDir: SwapDirection = "UNKNOWN";

  for (let i = 0; i < swaps.length; i++) {
    const swap = swaps[i];
    let score = 0;
    const reasons: string[] = [];

    // 1. Size anomaly
    if (
      sizeStats.largeThresholdUsd > 0 &&
      swap.estimatedUsd > sizeStats.largeThresholdUsd
    ) {
      score += 25;
      reasons.push(`large swap (${fmtUsd(swap.estimatedUsd)} > ${fmtUsd(sizeStats.largeThresholdUsd)} threshold)`);
    }

    // 2. Repeat address
    const addrCount = counts.get(swap.sender) ?? 0;
    if (addrCount >= BOT_SWAP_COUNT_THRESHOLD) {
      score += 20;
      reasons.push(`repeat address (${addrCount} swaps)`);
    }

    // 3. Timing: burst with previous swap
    if (i > 0) {
      const gap = Math.abs(swap.blockHeight - swaps[i - 1].blockHeight);
      if (gap === 0) {
        score += 20;
        reasons.push("same-block as previous swap");
      } else if (gap < BURST_BLOCK_GAP) {
        score += 10;
        reasons.push(`rapid succession (${gap} block gap)`);
      }
    }

    // 4. Direction run: is this swap part of a long same-direction run?
    if (swap.direction !== "UNKNOWN") {
      if (swap.direction === currentDir) {
        currentRun++;
      } else {
        currentRun = 1;
        currentDir = swap.direction;
      }
      if (currentRun >= DIRECTION_RUN_THRESHOLD) {
        score += 15;
        reasons.push(`part of ${currentRun}-swap ${currentDir} run`);
      }
    } else {
      currentRun = 0;
      currentDir = "UNKNOWN";
    }

    // 5. Bin movement
    if (swap.binMoved) {
      score += 20;
      reasons.push("moved active bin");
    }

    swap.toxicScore = Math.min(score, 100);
    swap.toxicReasons = reasons;
  }
}

function buildRiskFlags(
  analysis: Omit<ToxicFlowAnalysis, "riskFlags" | "verdict">
): string[] {
  const flags: string[] = [];
  const d = analysis;

  if (d.directional.longestRun >= 6) {
    flags.push(`Long ${d.directional.runDirection} run of ${d.directional.longestRun} swaps — strong directional pressure on LPs`);
  }
  if (d.directional.buyPct >= 75 || d.directional.sellPct >= 75) {
    const dom = d.directional.buyPct >= 75 ? "BUY" : "SELL";
    flags.push(`Heavy ${dom} bias (${fmtPct(Math.max(d.directional.buyPct, d.directional.sellPct))}) — asymmetric LP inventory drain`);
  }
  if (d.sizeAnomaly.outsizedPct >= 20) {
    flags.push(`${fmtPct(d.sizeAnomaly.outsizedPct)} of swaps are outsized — whale/bot activity drains thin bins`);
  }
  if (d.timing.minBlockGap === 0 && d.totalSwapsAnalyzed >= 2) {
    flags.push("Same-block swaps detected — likely MEV or atomic arbitrage");
  }
  if (d.timing.burstPct >= 30) {
    flags.push(`${fmtPct(d.timing.burstPct)} of swaps are in rapid bursts — bot-like execution pattern`);
  }
  if (d.repeatAddress.topAddressPct >= 30) {
    flags.push(`Single address ${shortAddr(d.repeatAddress.topAddress)} accounts for ${fmtPct(d.repeatAddress.topAddressPct)} of swaps`);
  }
  if (d.repeatAddress.botSuspectCount >= 2) {
    flags.push(`${d.repeatAddress.botSuspectCount} bot-suspect addresses (≥${BOT_SWAP_COUNT_THRESHOLD} swaps each)`);
  }
  if (d.binImpact.binsMovedPct >= 20) {
    flags.push(`${fmtPct(d.binImpact.binsMovedPct)} of swaps move the active bin — sustained directional impact`);
  }
  if (d.totalSwapsAnalyzed < 5) {
    flags.push("Very few swap events — analysis confidence is low");
  }

  return flags;
}

function generateVerdict(
  classification: FlowClass,
  score: number,
  pair: string,
  adverseSelectionUsd: number
): string {
  switch (classification) {
    case "ORGANIC":
      return `${pair} shows mostly organic swap flow. LP adverse selection risk is low. Fee income should roughly match expectations with minimal informed-trader discount.`;
    case "MIXED":
      return `${pair} has a mix of organic and strategic swap flow. Some arb activity is present but not dominant. LPs should expect modest adverse selection (~${fmtUsd(adverseSelectionUsd)}/day estimate).`;
    case "ARB-HEAVY":
      return `${pair} exhibits heavy arbitrage and/or bot flow. LPs face meaningful adverse selection — their positions are systematically traded against by better-informed actors. Consider tighter fee settings or narrower ranges.`;
    case "TOXIC":
      return `${pair} shows highly toxic flow patterns. LPs are experiencing significant adverse selection from informed/bot trading. Fee income is likely insufficient to compensate for inventory losses. Review position viability carefully.`;
  }
}

// ── Core Analysis ─────────────────────────────────────────────────────────────

async function analyzePool(pool: AppPool): Promise<ToxicFlowAnalysis> {
  const poolId = pool.poolId ?? parseInt(pool.id);
  const pair = `${pool.token0Symbol}-${pool.token1Symbol}`;

  const rawEvents = await fetchContractEvents(0, EVENT_SCAN_LIMIT);
  const swaps = parseSwapEvents(rawEvents, pool);

  const directional = analyzeDirectionalClustering(swaps);
  const sizeAnomaly = analyzeSizeAnomaly(swaps);
  const timing = analyzeTimingClustering(swaps);
  const repeatAddress = analyzeRepeatAddresses(swaps);
  const binImpact = analyzeBinImpact(swaps);

  // Score each swap individually
  scoreSwaps(swaps, sizeAnomaly, repeatAddress, directional);

  // Composite toxic flow score (weighted)
  const toxicFlowScore = Math.round(
    directional.clusteringScore   * 0.25 +
    sizeAnomaly.sizeAnomalyScore  * 0.20 +
    timing.timingScore            * 0.20 +
    repeatAddress.repeatScore     * 0.20 +
    binImpact.binImpactScore      * 0.15
  );

  const classification = classifyToxicFlow(toxicFlowScore);

  // Top toxic addresses: those with most swaps
  const addrCounts: Map<string, number> = new Map();
  for (const s of swaps) {
    if (s.sender) addrCounts.set(s.sender, (addrCounts.get(s.sender) ?? 0) + 1);
  }
  const topToxicAddresses = [...addrCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([address, count]) => ({
      address,
      swaps: count,
      pct: swaps.length > 0 ? (count / swaps.length) * 100 : 0,
    }));

  // Adverse selection estimate:
  // Informed traders extract value proportional to price impact they cause.
  // Simple proxy: toxic flow share × daily volume × fee rate ÷ 2
  // (informed traders earn at least the fee they pay back from LP inventory)
  const toxicFlowPct = toxicFlowScore / 100;
  const dailyVol = pool.volume24hUsd;
  const feePct = (pool.feeBps ?? 30) / 10_000;
  const estimatedAdverseSelectionUsd = dailyVol * toxicFlowPct * feePct * 0.5;

  const partial = {
    poolId,
    pair,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    feeBps: pool.feeBps ?? 30,
    totalSwapsAnalyzed: swaps.length,
    toxicFlowScore,
    classification,
    directional,
    sizeAnomaly,
    timing,
    repeatAddress,
    binImpact,
    topToxicAddresses,
    estimatedAdverseSelectionUsd,
  };

  const riskFlags = buildRiskFlags(partial);
  const verdict = generateVerdict(classification, toxicFlowScore, pair, estimatedAdverseSelectionUsd);

  return { ...partial, riskFlags, verdict };
}

// ── Display ───────────────────────────────────────────────────────────────────

function displayAnalysis(r: ToxicFlowAnalysis): void {
  const W = 70;
  const line = "═".repeat(W);
  const dash = "─".repeat(W - 4);

  console.log(`\n╔${line}╗`);
  console.log(`║${" ".repeat(18)}HODLMM TOXIC FLOW DETECTOR${" ".repeat(26)}║`);
  console.log(`╠${line}╣`);
  console.log(`║ Pool #${r.poolId}: ${r.pair}${" ".repeat(Math.max(0, W - 10 - r.pair.length - String(r.poolId).length))}║`);
  console.log(`║ TVL: ${fmtUsd(r.tvlUsd).padEnd(12)} Volume 24h: ${fmtUsd(r.volume24hUsd).padEnd(12)} Fee: ${r.feeBps}bps${" ".repeat(Math.max(0, W - 46 - fmtUsd(r.tvlUsd).length - fmtUsd(r.volume24hUsd).length))}║`);
  console.log(`╚${line}╝`);

  // Overall score
  console.log(`\n🔬 FLOW ANALYSIS (last ${EVENT_SCAN_LIMIT} events)`);
  console.log(`   Total swaps analyzed:     ${r.totalSwapsAnalyzed}`);
  const bar = scoreBar(r.toxicFlowScore, 14);
  console.log(`   Toxic flow score:         ${r.toxicFlowScore}/100  [${bar}]`);
  console.log(`   Classification:           ${classIcon(r.classification)} ${r.classification}`);

  // Directional clustering
  const d = r.directional;
  console.log(`\n   📈 Directional Clustering`);
  console.log(`      Longest same-direction run:  ${d.longestRun} swap${d.longestRun !== 1 ? "s" : ""} (${d.runDirection})`);
  console.log(`      Direction bias:              ${fmtPct(d.buyPct)} buy / ${fmtPct(d.sellPct)} sell`);
  console.log(`      Clustering score:            ${scoreIcon(d.clusteringScore)} ${d.clusteringScore}/100  [${scoreBar(d.clusteringScore, 10)}]`);

  // Size anomaly
  const sa = r.sizeAnomaly;
  console.log(`\n   🐋 Size Anomaly Detection`);
  console.log(`      Median swap size:       ${fmtUsd(sa.medianUsd)}`);
  console.log(`      Large swap threshold:   ${fmtUsd(sa.largeThresholdUsd)} (>${LARGE_SWAP_MULTIPLIER}x median)`);
  console.log(`      Outsized swaps:         ${sa.outsizedCount} / ${r.totalSwapsAnalyzed} (${fmtPct(sa.outsizedPct)})`);
  console.log(`      Max swap size:          ${fmtUsd(sa.maxSwapUsd)}`);
  console.log(`      Size anomaly score:     ${scoreIcon(sa.sizeAnomalyScore)} ${sa.sizeAnomalyScore}/100  [${scoreBar(sa.sizeAnomalyScore, 10)}]`);

  // Timing
  const t = r.timing;
  console.log(`\n   ⚡ Timing Analysis`);
  if (t.avgBlockGap > 0) {
    console.log(`      Avg blocks between swaps:  ${t.avgBlockGap.toFixed(1)}`);
    console.log(`      Min block gap:             ${t.minBlockGap}${t.minBlockGap === 0 ? " (same-block!)" : ""}`);
    console.log(`      Burst events (<${BURST_BLOCK_GAP} blocks):  ${t.burstCount} (${fmtPct(t.burstPct)})`);
    console.log(`      Timing score:              ${scoreIcon(t.timingScore)} ${t.timingScore}/100  [${scoreBar(t.timingScore, 10)}]`);
  } else {
    console.log(`      Insufficient timing data (fewer than 2 swaps)`);
  }

  // Repeat addresses
  const ra = r.repeatAddress;
  console.log(`\n   🔄 Repeat Addresses`);
  console.log(`      Unique swappers:        ${ra.uniqueSwappers}`);
  if (ra.topAddress) {
    console.log(`      Top address swaps:      ${ra.topAddressSwaps} (${fmtPct(ra.topAddressPct)}) — ${shortAddr(ra.topAddress)}`);
  }
  console.log(`      Bot-suspect addresses:  ${ra.botSuspectCount} (≥${BOT_SWAP_COUNT_THRESHOLD} swaps each)`);
  console.log(`      Repeat score:           ${scoreIcon(ra.repeatScore)} ${ra.repeatScore}/100  [${scoreBar(ra.repeatScore, 10)}]`);

  // Bin impact
  const bi = r.binImpact;
  console.log(`\n   📦 Active Bin Impact`);
  console.log(`      Swaps that moved active bin:  ${bi.binMovements} / ${r.totalSwapsAnalyzed} (${fmtPct(bi.binsMovedPct)})`);
  console.log(`      Bin impact score:             ${scoreIcon(bi.binImpactScore)} ${bi.binImpactScore}/100  [${scoreBar(bi.binImpactScore, 10)}]`);

  // Top toxic addresses
  if (r.topToxicAddresses.length > 0) {
    console.log(`\n   👤 Top Addresses by Swap Count`);
    for (const a of r.topToxicAddresses) {
      const botTag = a.swaps >= BOT_SWAP_COUNT_THRESHOLD ? " 🤖" : "";
      console.log(`      ${shortAddr(a.address).padEnd(14)} ${a.swaps.toString().padStart(3)} swaps  (${fmtPct(a.pct)})${botTag}`);
    }
  }

  // LP impact
  console.log(`\n   💰 LP Impact Assessment`);
  console.log(`      Est. adverse selection:  ${fmtUsd(r.estimatedAdverseSelectionUsd)}/day`);
  const feePct = r.feeBps / 10_000;
  const dailyFeeTotal = r.volume24hUsd * feePct;
  console.log(`      Est. total daily fees:   ${fmtUsd(dailyFeeTotal)}`);
  if (dailyFeeTotal > 0) {
    const adversePct = (r.estimatedAdverseSelectionUsd / dailyFeeTotal) * 100;
    console.log(`      Adverse selection %:     ${fmtPct(adversePct)} of fees`);
  }
  const riskLevel =
    r.toxicFlowScore >= 75 ? "SEVERE" :
    r.toxicFlowScore >= 60 ? "HIGH" :
    r.toxicFlowScore >= 35 ? "MODERATE" :
    "LOW";
  console.log(`      Risk level:             ${riskLevel}`);

  // Risk flags
  if (r.riskFlags.length > 0) {
    console.log(`\n   ⚠️  Risk Flags`);
    for (const flag of r.riskFlags) {
      console.log(`      • ${flag}`);
    }
  }

  // Verdict
  console.log(`\n🏷️  VERDICT: ${classIcon(r.classification)} ${r.classification}`);
  console.log(`   ${r.verdict}`);

  console.log(`\n${"═".repeat(W + 2)}`);
}

function displayMultiPool(results: ToxicFlowAnalysis[]): void {
  const W = 80;
  console.log(`\n${"═".repeat(W)}`);
  console.log(`  HODLMM TOXIC FLOW DETECTOR — MULTI-POOL SCAN`);
  console.log(`${"═".repeat(W)}`);

  const sorted = [...results].sort((a, b) => b.toxicFlowScore - a.toxicFlowScore);

  console.log(`\n  ${"Pair".padEnd(18)} ${"Score".padEnd(8)} ${"Class".padEnd(12)} ${"Swaps".padEnd(8)} ${"Vol/24h".padEnd(12)} ${"Adv.Sel/day"}`);
  console.log(`  ${"─".repeat(76)}`);

  for (const r of sorted) {
    console.log(
      `  ${r.pair.padEnd(18)} ` +
      `${(r.toxicFlowScore + "/100").padEnd(8)} ` +
      `${(classIcon(r.classification) + " " + r.classification).padEnd(14)} ` +
      `${String(r.totalSwapsAnalyzed).padEnd(8)} ` +
      `${fmtUsd(r.volume24hUsd).padEnd(12)} ` +
      `${fmtUsd(r.estimatedAdverseSelectionUsd)}`
    );
  }

  // Distribution
  const classCounts: Record<FlowClass, number> = {
    ORGANIC: 0,
    MIXED: 0,
    "ARB-HEAVY": 0,
    TOXIC: 0,
  };
  for (const r of results) classCounts[r.classification]++;

  console.log(`\n── Classification Distribution ${"─".repeat(48)}`);
  console.log(`  🌿 Organic:    ${classCounts.ORGANIC} pools`);
  console.log(`  ⚖️  Mixed:      ${classCounts.MIXED} pools`);
  console.log(`  ⚡ Arb-Heavy: ${classCounts["ARB-HEAVY"]} pools`);
  console.log(`  ☠️  Toxic:      ${classCounts.TOXIC} pools`);

  const avgScore = results.reduce((s, r) => s + r.toxicFlowScore, 0) / results.length;
  const totalAdverse = results.reduce((s, r) => s + r.estimatedAdverseSelectionUsd, 0);
  const totalFlags = results.reduce((s, r) => s + r.riskFlags.length, 0);

  console.log(`\n── Ecosystem Summary ${"─".repeat(57)}`);
  console.log(`  Avg toxic flow score:          ${avgScore.toFixed(0)}/100`);
  console.log(`  Total est. adverse selection:  ${fmtUsd(totalAdverse)}/day across all pools`);
  console.log(`  Total risk flags:              ${totalFlags}`);

  if (classCounts.TOXIC > 0 || classCounts["ARB-HEAVY"] > 0) {
    const risky = sorted.filter(
      (r) => r.classification === "TOXIC" || r.classification === "ARB-HEAVY"
    );
    console.log(`\n  ⚠️  High-risk pools (review before adding liquidity):`);
    for (const r of risky) {
      console.log(`     ${classIcon(r.classification)} ${r.pair}: ${r.toxicFlowScore}/100 — ${r.classification}`);
    }
  }

  console.log(`\n${"═".repeat(W)}`);
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-toxic-flow")
  .description(
    "Detect toxic order flow in HODLMM pools by analyzing swap event patterns: " +
    "directional clustering, size anomalies, timing bursts, repeat addresses, " +
    "and active bin impact. Classifies pools as ORGANIC / MIXED / ARB-HEAVY / TOXIC " +
    "and estimates LP adverse selection costs."
  )
  .argument("[pool]", "Pool ID or token pair to analyze (e.g. 'STX-sBTC')")
  .option("--all", "Scan all pools with sufficient TVL")
  .option("--top <n>", "Scan top N pools by TVL (default: 5)", "5")
  .option("--json", "Output raw JSON")
  .action(async (poolQuery: string | undefined, opts: any) => {
    let pools: AppPool[];
    try {
      pools = await fetchPools();
    } catch (e: any) {
      console.error(`Failed to fetch pools: ${e.message}`);
      process.exit(1);
    }

    if (pools.length === 0) {
      console.error(`No pools found above $${MIN_TVL_USD} TVL threshold.`);
      process.exit(1);
    }

    if (opts.all || !poolQuery) {
      const topN = opts.all
        ? pools.length
        : Math.min(parseInt(opts.top) || 5, pools.length);
      const selected = [...pools]
        .sort((a, b) => b.tvlUsd - a.tvlUsd)
        .slice(0, topN);

      process.stderr.write(`Analyzing toxic flow for ${selected.length} pool(s)...\n`);
      const results: ToxicFlowAnalysis[] = [];

      for (const pool of selected) {
        const label = `${pool.token0Symbol}-${pool.token1Symbol}`;
        try {
          const result = await analyzePool(pool);
          results.push(result);
          process.stderr.write(
            `  ✓ ${label} — ${result.classification} (score: ${result.toxicFlowScore}/100)\n`
          );
        } catch (e: any) {
          process.stderr.write(`  ✗ ${label}: ${e.message}\n`);
        }
        await sleep(400);
      }

      if (results.length === 0) {
        console.error("No pools could be analyzed.");
        process.exit(1);
      }

      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        displayMultiPool(results);
      }
    } else {
      const pool = findPool(poolQuery, pools);
      if (!pool) {
        console.error(`Pool not found: "${poolQuery}"`);
        console.error("Available pools:");
        pools
          .sort((a, b) => b.tvlUsd - a.tvlUsd)
          .slice(0, 10)
          .forEach((p) =>
            console.error(
              `  #${p.poolId} ${p.token0Symbol}-${p.token1Symbol} (${fmtUsd(p.tvlUsd)})`
            )
          );
        process.exit(1);
      }

      const label = `${pool.token0Symbol}-${pool.token1Symbol}`;
      process.stderr.write(`Analyzing toxic flow for ${label}...\n`);

      let result: ToxicFlowAnalysis;
      try {
        result = await analyzePool(pool);
      } catch (e: any) {
        console.error(`Analysis failed: ${e.message}`);
        process.exit(1);
      }

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        displayAnalysis(result);
      }
    }
  });

program.parse();
