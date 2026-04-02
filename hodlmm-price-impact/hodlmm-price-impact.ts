#!/usr/bin/env bun
/**
 * hodlmm-price-impact.ts
 *
 * HODLMM Price Impact Simulator — Trade execution cost estimator for HODLMM pools.
 * Walks through on-chain bin reserves to calculate slippage, effective price,
 * and optimal trade sizing before executing.
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 27).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MAX_BINS_WALK = 50;
const BATCH_SIZE = 5;
const DEFAULT_TRADE_USD = 1000;
const DEFAULT_LADDER_SIZES = [100, 500, 1000, 5000, 10000];

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

interface BinReserves {
  binId: number;
  reserveX: number;
  reserveY: number;
}

interface TradeStep {
  binId: number;
  inputConsumed: number;
  outputReceived: number;
  binPriceUsd: number;
}

interface TradeResult {
  inputAmountUsd: number;
  direction: string;
  outputAmountUsd: number;
  effectivePrice: number;
  spotPrice: number;
  slippagePct: number;
  slippageCostUsd: number;
  binsConsumed: number;
  marginalImpactPct: number;
  partialFill: boolean;
  fillPct: number;
}

interface LadderEntry {
  amountUsd: number;
  slippagePct: number;
  slippageCostUsd: number;
  binsConsumed: number;
  classification: string;
  partialFill: boolean;
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

function classifyImpact(slippagePct: number): string {
  if (slippagePct < 0.1) return "NEGLIGIBLE";
  if (slippagePct < 1.0) return "LOW_IMPACT";
  if (slippagePct < 3.0) return "MODERATE_IMPACT";
  return "HIGH_IMPACT";
}

function impactScore(slippagePct: number, binsConsumed: number, totalBinsAvailable: number, marginalPct: number): number {
  // Lower is better (0 = perfect, 100 = terrible)
  const slippageComponent = Math.min(slippagePct * 10, 50); // 50% weight, caps at 5% slippage
  const binsComponent = totalBinsAvailable > 0
    ? (binsConsumed / totalBinsAvailable) * 25
    : 25; // 25% weight
  const marginalComponent = Math.min(marginalPct * 12.5, 25); // 25% weight, caps at 2%
  return Math.round(Math.min(slippageComponent + binsComponent + marginalComponent, 100));
}

function output(data: Record<string, any>): void {
  console.log(JSON.stringify({ tool: "hodlmm-price-impact", timestamp: new Date().toISOString(), ...data }, null, 2));
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

async function fetchBinReserves(poolId: number, binId: number): Promise<BinReserves> {
  try {
    const result = await callReadOnly("get-bin", [encodeUint(poolId), encodeUint(binId)]);
    const repr = result.result || "";
    const reserves = parseReservesFromRepr(repr);
    return { binId, ...reserves };
  } catch {
    return { binId, reserveX: 0, reserveY: 0 };
  }
}

async function fetchBinsBatch(poolId: number, binIds: number[]): Promise<BinReserves[]> {
  const results: BinReserves[] = [];
  for (let i = 0; i < binIds.length; i += BATCH_SIZE) {
    const batch = binIds.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map((id) => fetchBinReserves(poolId, id)));
    results.push(...batchResults);
  }
  return results;
}

// ── Price Impact Simulation ────────────────────────────────────────────────────

/**
 * Simulate a trade by walking through bins sequentially.
 *
 * For a "buy" (selling token0/X to get token1/Y): walk bins upward from active.
 *   Each bin has reserveY available to buy. We consume reserveY and pay in token0.
 *
 * For a "sell" (selling token1/Y to get token0/X): walk bins downward from active.
 *   Each bin has reserveX available. We consume reserveX and pay in token1.
 *
 * Simplified model: each bin has a fixed price, and we consume available reserves at that price.
 * Real AMM uses constant-sum within bins, which this approximates.
 */
async function simulateTrade(
  poolId: number,
  activeBinId: number,
  pool: AppPool,
  amountUsd: number,
  direction: "buy" | "sell"
): Promise<TradeResult> {
  const xDecimals = pool.token0Decimals || 8;
  const yDecimals = pool.token1Decimals || 6;
  const xPrice = pool.token0PriceUsd || 0;
  const yPrice = pool.token1PriceUsd || 0;

  if (xPrice === 0 || yPrice === 0) {
    return {
      inputAmountUsd: amountUsd, direction, outputAmountUsd: 0,
      effectivePrice: 0, spotPrice: 0, slippagePct: 100, slippageCostUsd: amountUsd,
      binsConsumed: 0, marginalImpactPct: 0, partialFill: true, fillPct: 0,
    };
  }

  // Spot price: token0 in terms of token1
  const spotPriceRatio = xPrice / yPrice;

  let remainingInputUsd = amountUsd;
  let totalOutputUsd = 0;
  let binsConsumed = 0;
  let lastBinImpact = 0;
  const steps: TradeStep[] = [];

  // Determine bin walk direction
  // "buy" = buying token1 with token0 → consume token1 reserves → walk upward (higher bins)
  // "sell" = selling token1 for token0 → consume token0 reserves → walk downward (lower bins)
  const binStep = direction === "buy" ? 1 : -1;

  // Pre-fetch bins in direction of walk
  const binIdsToFetch: number[] = [];
  for (let i = 0; i < MAX_BINS_WALK; i++) {
    binIdsToFetch.push(activeBinId + i * binStep);
  }
  const allBins = await fetchBinsBatch(poolId, binIdsToFetch);
  const binMap = new Map(allBins.map((b) => [b.binId, b]));

  for (let i = 0; i < MAX_BINS_WALK && remainingInputUsd > 0.01; i++) {
    const currentBinId = activeBinId + i * binStep;
    const bin = binMap.get(currentBinId);
    if (!bin) continue;

    // Available liquidity in this bin (in USD)
    let availableUsd: number;
    if (direction === "buy") {
      // Consuming token1 (Y) reserves
      const reserveYHuman = bin.reserveY / Math.pow(10, yDecimals);
      availableUsd = reserveYHuman * yPrice;
    } else {
      // Consuming token0 (X) reserves
      const reserveXHuman = bin.reserveX / Math.pow(10, xDecimals);
      availableUsd = reserveXHuman * xPrice;
    }

    if (availableUsd <= 0) continue;

    // Bin price adjustment: each bin step away from active adds a small premium
    // HODLMM bin step is typically 1-100 basis points per bin
    const binDistance = Math.abs(i);
    const priceAdjustment = 1 + binDistance * 0.001; // ~10bps per bin (simplified)

    const consumeUsd = Math.min(remainingInputUsd, availableUsd);

    // Output received is reduced by price adjustment (worse price further from active)
    const outputUsd = consumeUsd / priceAdjustment;

    steps.push({
      binId: currentBinId,
      inputConsumed: consumeUsd,
      outputReceived: outputUsd,
      binPriceUsd: priceAdjustment,
    });

    remainingInputUsd -= consumeUsd;
    totalOutputUsd += outputUsd;
    binsConsumed++;

    // Track marginal impact of last bin
    if (consumeUsd > 0) {
      lastBinImpact = ((consumeUsd - outputUsd) / consumeUsd) * 100;
    }
  }

  const filledUsd = amountUsd - remainingInputUsd;
  const partialFill = remainingInputUsd > 0.01;
  const fillPct = (filledUsd / amountUsd) * 100;

  const slippageCostUsd = filledUsd - totalOutputUsd;
  const slippagePct = filledUsd > 0 ? (slippageCostUsd / filledUsd) * 100 : 0;

  // Effective price (how much token0 per token1 you actually got)
  const effectivePrice = filledUsd > 0 ? (filledUsd / totalOutputUsd) * spotPriceRatio : 0;

  return {
    inputAmountUsd: amountUsd,
    direction,
    outputAmountUsd: Math.round(totalOutputUsd * 100) / 100,
    effectivePrice: Math.round(effectivePrice * 100) / 100,
    spotPrice: Math.round(spotPriceRatio * 100) / 100,
    slippagePct: Math.round(slippagePct * 1000) / 1000,
    slippageCostUsd: Math.round(slippageCostUsd * 100) / 100,
    binsConsumed,
    marginalImpactPct: Math.round(lastBinImpact * 1000) / 1000,
    partialFill,
    fillPct: Math.round(fillPct * 10) / 10,
  };
}

// ── Commands ───────────────────────────────────────────────────────────────────

async function doctorCmd(): Promise<void> {
  const checks: Record<string, string> = {};

  try {
    await fetchJson(`${BFF_APP_BASE}/pools`);
    checks["bitflow-app-api"] = "ok";
  } catch (e: any) {
    checks["bitflow-app-api"] = `FAIL: ${e.message}`;
  }

  try {
    await callReadOnly("get-active-bin-id", [encodeUint(1)]);
    checks["hiro-read-only"] = "ok";
  } catch (e: any) {
    checks["hiro-read-only"] = `FAIL: ${e.message}`;
  }

  const allOk = Object.values(checks).every((v) => v === "ok");
  output({ command: "doctor", status: allOk ? "healthy" : "degraded", checks });
}

async function runCmd(poolQuery: string, amountUsd: number, direction: string): Promise<void> {
  const dir = direction === "sell" ? "sell" : "buy";
  const appPools = await fetchAppPools();
  if (appPools.length === 0) {
    output({ command: "run", error: "Failed to fetch pool list from Bitflow API" });
    return;
  }

  let poolId: number;
  let pool: AppPool | null;
  try {
    const resolved = await resolvePool(poolQuery, appPools);
    poolId = resolved.poolId;
    pool = resolved.pool;
  } catch (e: any) {
    output({ command: "run", error: e.message });
    return;
  }

  if (!pool) {
    output({ command: "run", error: `Pool metadata not found for ${poolQuery}` });
    return;
  }

  const activeBinId = pool.activeBinId || (await fetchActiveBin(poolId));
  if (!activeBinId) {
    output({ command: "run", error: `Could not determine active bin for pool ${poolId}` });
    return;
  }

  const trade = await simulateTrade(poolId, activeBinId, pool, amountUsd, dir as "buy" | "sell");
  const classification = classifyImpact(trade.slippagePct);
  const score = impactScore(trade.slippagePct, trade.binsConsumed, MAX_BINS_WALK, trade.marginalImpactPct);

  const reasoning: string[] = [];
  reasoning.push(`Trade consumes ${trade.binsConsumed} bin${trade.binsConsumed !== 1 ? "s" : ""} with ${trade.slippagePct}% slippage.`);
  if (trade.partialFill) {
    reasoning.push(`Partial fill: only ${trade.fillPct}% of trade could be executed with available liquidity.`);
  }
  if (trade.marginalImpactPct > 0.5) {
    reasoning.push(`Marginal impact ${trade.marginalImpactPct}% is high — splitting the trade would reduce cost.`);
  } else if (trade.binsConsumed < 3) {
    reasoning.push(`Marginal impact ${trade.marginalImpactPct}% — room for larger trades.`);
  }
  if (classification === "HIGH_IMPACT") {
    reasoning.push("Consider splitting across multiple transactions or using a different pool.");
  }

  output({
    command: "run",
    pool: {
      id: poolId,
      pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
      activeBinId,
      tvlUsd: pool.tvlUsd,
      spotPrice: Math.round((pool.token0PriceUsd / (pool.token1PriceUsd || 1)) * 100) / 100,
    },
    trade,
    classification,
    impactScore: score,
    reasoning,
  });
}

async function ladderCmd(poolQuery: string, sizesStr: string): Promise<void> {
  const sizes = sizesStr
    .split(",")
    .map((s) => parseFloat(s.trim()))
    .filter((n) => !isNaN(n) && n > 0)
    .sort((a, b) => a - b);

  if (sizes.length === 0) {
    output({ command: "ladder", error: "No valid trade sizes provided" });
    return;
  }

  const appPools = await fetchAppPools();
  if (appPools.length === 0) {
    output({ command: "ladder", error: "Failed to fetch pool list from Bitflow API" });
    return;
  }

  let poolId: number;
  let pool: AppPool | null;
  try {
    const resolved = await resolvePool(poolQuery, appPools);
    poolId = resolved.poolId;
    pool = resolved.pool;
  } catch (e: any) {
    output({ command: "ladder", error: e.message });
    return;
  }

  if (!pool) {
    output({ command: "ladder", error: `Pool metadata not found for ${poolQuery}` });
    return;
  }

  const activeBinId = pool.activeBinId || (await fetchActiveBin(poolId));
  if (!activeBinId) {
    output({ command: "ladder", error: `Could not determine active bin for pool ${poolId}` });
    return;
  }

  const ladder: LadderEntry[] = [];
  for (const size of sizes) {
    const trade = await simulateTrade(poolId, activeBinId, pool, size, "buy");
    ladder.push({
      amountUsd: size,
      slippagePct: trade.slippagePct,
      slippageCostUsd: trade.slippageCostUsd,
      binsConsumed: trade.binsConsumed,
      classification: classifyImpact(trade.slippagePct),
      partialFill: trade.partialFill,
    });
  }

  // Find optimal sizes at key thresholds via interpolation
  const findMaxAtThreshold = (thresholdPct: number): number => {
    // Find between which two sizes the threshold is crossed
    for (let i = 0; i < ladder.length - 1; i++) {
      if (ladder[i].slippagePct <= thresholdPct && ladder[i + 1].slippagePct > thresholdPct) {
        // Linear interpolation
        const ratio = (thresholdPct - ladder[i].slippagePct) / (ladder[i + 1].slippagePct - ladder[i].slippagePct);
        return Math.round(ladder[i].amountUsd + ratio * (ladder[i + 1].amountUsd - ladder[i].amountUsd));
      }
    }
    // If all below threshold, return the largest size tested
    if (ladder[ladder.length - 1].slippagePct <= thresholdPct) {
      return ladder[ladder.length - 1].amountUsd;
    }
    // If even smallest exceeds threshold
    return 0;
  };

  const optimalSize = {
    maxUsdAt05Pct: findMaxAtThreshold(0.5),
    maxUsdAt1Pct: findMaxAtThreshold(1.0),
    maxUsdAt2Pct: findMaxAtThreshold(2.0),
  };

  const deepest = ladder[ladder.length - 1];
  const summary = deepest.slippagePct < 1
    ? `Pool absorbs up to $${sizes[sizes.length - 1].toLocaleString()} with <1% slippage. Deep liquidity.`
    : `Pool absorbs up to $${optimalSize.maxUsdAt1Pct.toLocaleString()} with <1% slippage. Impact accelerates beyond $${optimalSize.maxUsdAt2Pct.toLocaleString()}.`;

  output({
    command: "ladder",
    pool: {
      id: poolId,
      pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
      tvlUsd: pool.tvlUsd,
    },
    ladder,
    optimalSize,
    summary,
  });
}

// ── CLI ────────────────────────────────────────────────────────────────────────

const program = new Command();
program.name("hodlmm-price-impact").description("HODLMM Price Impact Simulator — Trade execution cost estimator").version("1.0.0");

program.command("doctor").description("Check API connectivity").action(doctorCmd);

program
  .command("install-packs")
  .description("No extra dependencies needed")
  .action(() => output({ command: "install-packs", message: "No additional dependencies — uses workspace commander + native fetch." }));

program
  .command("run")
  .description("Simulate trade price impact")
  .option("--pool <id>", "Pool ID or token pair name", "sbtc-stx")
  .option("--amount <usd>", "Trade size in USD", String(DEFAULT_TRADE_USD))
  .option("--direction <dir>", "Trade direction: buy or sell", "buy")
  .action((opts) => runCmd(opts.pool, parseFloat(opts.amount), opts.direction));

program
  .command("ladder")
  .description("Simulate multiple trade sizes")
  .option("--pool <id>", "Pool ID or token pair name", "sbtc-stx")
  .option("--sizes <list>", "Comma-separated USD amounts", DEFAULT_LADDER_SIZES.join(","))
  .action((opts) => ladderCmd(opts.pool, opts.sizes));

program.parse();
