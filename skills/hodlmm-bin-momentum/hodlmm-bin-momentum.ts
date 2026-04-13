#!/usr/bin/env bun
/**
 * hodlmm-bin-momentum.ts
 *
 * HODLMM Bin Momentum Analyzer — Measures the rate and direction of active
 * bin movement by combining reserve gradient analysis with on-chain swap
 * event history. Unlike bin-shift (static asymmetry snapshot), momentum
 * detects acceleration/deceleration of price movement through bins.
 *
 * Key metrics:
 *  - Reserve depletion gradient (how steeply reserves fall off from active bin)
 *  - Swap event momentum (directional pressure from recent trades)
 *  - Momentum score: -100 (strong downward) to +100 (strong upward)
 *  - Momentum phase: ACCELERATING, DECELERATING, STEADY, STALLED
 *  - Exhaustion risk (how close reserves are to depletion on the leading edge)
 *  - Position timing signal: ENTER_NOW, WAIT, REPOSITION
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 45).
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
const SWAP_EVENT_LIMIT = 50;

// Momentum phase thresholds
const ACCELERATING_GRADIENT_THRESHOLD = 0.65;
const DECELERATING_GRADIENT_THRESHOLD = 0.35;
const STALLED_MOMENTUM_THRESHOLD = 10;

// Exhaustion thresholds
const EXHAUSTION_CRITICAL = 0.85;
const EXHAUSTION_WARNING = 0.60;

// ── Types ──────────────────────────────────────────────────────────────────────

interface AppPool {
  id: string;
  token0Symbol: string;
  token1Symbol: string;
  tvlUsd: number;
  volume24hUsd: number;
  poolId: number;
  token0Decimals: number;
  token1Decimals: number;
  token0PriceUsd: number;
  token1PriceUsd: number;
  activeBinId?: number;
  feeBps?: number;
  binStep?: number;
}

interface BinData {
  binId: number;
  offsetFromActive: number;
  reserveX: bigint;
  reserveY: bigint;
  reserveXUsd: number;
  reserveYUsd: number;
  totalUsd: number;
}

interface SwapEvent {
  direction: "BUY" | "SELL";
  amountIn: number;
  amountOut: number;
  blockHeight: number;
  txId: string;
}

type MomentumPhase = "ACCELERATING" | "DECELERATING" | "STEADY" | "STALLED";
type TimingSignal = "ENTER_NOW" | "WAIT" | "REPOSITION";

interface GradientProfile {
  upperGradient: number; // 0–1: how steeply reserves fall off above active
  lowerGradient: number; // 0–1: how steeply reserves fall off below active
  upperDepth: number;    // number of bins with meaningful liquidity above
  lowerDepth: number;    // number of bins with meaningful liquidity below
  upperExhaustion: number; // 0–1: how depleted upper reserves are
  lowerExhaustion: number; // 0–1: how depleted lower reserves are
}

interface MomentumAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  activeBinId: number;
  binStep: number;

  // Gradient profile
  gradient: GradientProfile;

  // Momentum metrics
  momentumScore: number;        // -100 to +100
  momentumPhase: MomentumPhase;
  momentumDirection: "UP" | "DOWN" | "FLAT";

  // Swap-based signals
  swapPressure: number;         // -100 to +100 (net directional pressure)
  swapCount: number;
  buyCount: number;
  sellCount: number;
  netVolumeDirection: "BUY_HEAVY" | "SELL_HEAVY" | "BALANCED";

  // Exhaustion
  leadingEdgeExhaustion: number; // 0–1 on the side price is moving toward
  exhaustionRisk: "CRITICAL" | "WARNING" | "OK";

  // Timing
  timingSignal: TimingSignal;
  reasoning: string;

  // Competition scoring
  competition_score: {
    momentum_magnitude: number;
    gradient_asymmetry: number;
    exhaustion_risk_score: number;
    swap_pressure_score: number;
    composite: number;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fetchJson(url: string, retries = 2): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const resp = await fetch(url);
    if (resp.ok) return resp.json();
    if (resp.status === 429 && attempt < retries) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    throw new Error(`HTTP ${resp.status} from ${url}`);
  }
}

async function callReadOnly(fn: string, args: string[], retries = 3): Promise<any> {
  const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/${fn}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sender: SENDER, arguments: args }),
    });
    if (resp.ok) return resp.json();
    if (resp.status === 429 && attempt < retries) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    throw new Error(`Contract call ${fn} failed: HTTP ${resp.status}`);
  }
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
    if (inner.startsWith("01")) return parseInt(inner.slice(2), 16) || 0;
    return parseInt(inner, 16) || 0;
  }
  if (hex.startsWith("01")) return parseInt(hex.slice(2), 16) || 0;
  return 0;
}

function parseBinReservesTuple(result: any): { reserveX: bigint; reserveY: bigint } | null {
  if (!result?.result) return null;
  const raw = result.result as string;
  try {
    const hex = raw.replace("0x", "");
    if (hex.startsWith("0a") || hex === "09") return null;
    const uintPattern = /01([0-9a-f]{32})/gi;
    const matches: bigint[] = [];
    let m: RegExpExecArray | null;
    while ((m = uintPattern.exec(hex)) !== null) {
      matches.push(BigInt("0x" + m[1]));
    }
    if (matches.length >= 2) return { reserveX: matches[0], reserveY: matches[1] };
  } catch { /* fall through */ }
  return null;
}

function formatUsd(n: number): string {
  if (n < 0) return "N/A";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(6)}`;
}

function bar(value: number, max: number, width: number = 20): string {
  if (max <= 0) return " ".repeat(width);
  const filled = Math.round((value / max) * width);
  return "█".repeat(Math.min(filled, width)) + "░".repeat(Math.max(width - filled, 0));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ── Pool Fetching ──────────────────────────────────────────────────────────────

let _poolCache: AppPool[] | null = null;

async function fetchAllPools(): Promise<AppPool[]> {
  if (_poolCache) return _poolCache;
  const data = await fetchJson(`${BFF_APP_BASE}/pools`);
  const raw: any[] = data?.data ?? data?.pools ?? data ?? [];
  if (!Array.isArray(raw)) throw new Error("Unexpected pool response format");
  const pools: AppPool[] = raw.map((p: any) => {
    const tokens = p.tokens ?? {};
    const tX = tokens.tokenX ?? {};
    const tY = tokens.tokenY ?? {};
    const pidStr = String(p.poolId ?? p.id ?? "0");
    const numericId = parseInt(pidStr.replace(/^dlmm_/, "")) || 0;
    return {
      id: pidStr,
      token0Symbol: tX.symbol ?? p.token0Symbol ?? "?",
      token1Symbol: tY.symbol ?? p.token1Symbol ?? "?",
      tvlUsd: parseFloat(String(p.tvlUsd ?? "0")),
      volume24hUsd: parseFloat(String(p.volumeUsd1d ?? p.volume24hUsd ?? "0")),
      poolId: numericId,
      token0Decimals: parseInt(String(tX.decimals ?? "6")),
      token1Decimals: parseInt(String(tY.decimals ?? "6")),
      token0PriceUsd: parseFloat(String(tX.priceUsd ?? "0")),
      token1PriceUsd: parseFloat(String(tY.priceUsd ?? "0")),
      activeBinId: parseInt(String(p.activeBinId ?? "0")) || undefined,
      feeBps: parseFloat(String(p.baseFee ?? p.feeBps ?? "30")),
      binStep: parseInt(String(p.binStep ?? "100")),
    };
  });
  _poolCache = pools.filter((p) => p.tvlUsd >= MIN_TVL_USD);
  return _poolCache;
}

async function getActiveBinId(poolId: number): Promise<number> {
  const result = await callReadOnly("get-active-bin-id", [uintCV(poolId)]);
  return parseUintResult(result);
}

async function fetchBinData(
  poolId: number,
  activeBinId: number,
  pool: AppPool
): Promise<BinData[]> {
  const bins: BinData[] = [];
  const start = activeBinId - BIN_SCAN_RADIUS;
  const end = activeBinId + BIN_SCAN_RADIUS;
  const priceX = pool.token0PriceUsd;
  const priceY = pool.token1PriceUsd;
  const decX = pool.token0Decimals;
  const decY = pool.token1Decimals;

  for (let binId = start; binId <= end; binId++) {
    try {
      const result = await callReadOnly("get-bin-reserves", [
        uintCV(poolId),
        uintCV(binId),
      ]);
      const parsed = parseBinReservesTuple(result);
      if (parsed && (parsed.reserveX > 0n || parsed.reserveY > 0n)) {
        const rX = Number(parsed.reserveX);
        const rY = Number(parsed.reserveY);
        const usdX = (rX / Math.pow(10, decX)) * priceX;
        const usdY = (rY / Math.pow(10, decY)) * priceY;
        bins.push({
          binId,
          offsetFromActive: binId - activeBinId,
          reserveX: parsed.reserveX,
          reserveY: parsed.reserveY,
          reserveXUsd: usdX,
          reserveYUsd: usdY,
          totalUsd: usdX + usdY,
        });
      }
    } catch { /* skip */ }
  }
  return bins;
}

// ── Swap Event Fetching ───────────────────────────────────────────────────────

async function fetchSwapEvents(poolId: number): Promise<SwapEvent[]> {
  const events: SwapEvent[] = [];
  try {
    const url = `${HIRO_API}/extended/v1/contract/${DLMM_CONTRACT_ADDR}.${DLMM_CONTRACT_NAME}/events?limit=${SWAP_EVENT_LIMIT}&offset=0`;
    const data = await fetchJson(url);
    const rawEvents: any[] = data?.results ?? data?.events ?? data ?? [];

    for (const ev of rawEvents) {
      if (ev.event_type !== "smart_contract_log") continue;
      const val = ev?.contract_log?.value?.repr ?? "";
      // Look for swap events — they contain amounts-in and amounts-out
      if (!val.includes("swap") && !val.includes("amount")) continue;

      // Parse amount patterns from Clarity repr
      const amountInMatch = val.match(/amount-in\s+u(\d+)/);
      const amountOutMatch = val.match(/amount-out\s+u(\d+)/);
      if (!amountInMatch || !amountOutMatch) continue;

      // Direction: if token-x-in is present, it's a SELL of X (buy Y) → price moves UP
      const isBuy = val.includes("token-x-in") || val.includes("is-x-to-y true");
      events.push({
        direction: isBuy ? "BUY" : "SELL",
        amountIn: parseInt(amountInMatch[1]),
        amountOut: parseInt(amountOutMatch[1]),
        blockHeight: ev.block_height ?? 0,
        txId: ev.tx_id ?? "",
      });
    }
  } catch {
    // Event fetching is best-effort
  }
  return events;
}

// ── Gradient Analysis ─────────────────────────────────────────────────────────

function computeGradientProfile(bins: BinData[], activeBinId: number): GradientProfile {
  const upperBins = bins
    .filter((b) => b.binId > activeBinId)
    .sort((a, b) => a.binId - b.binId);
  const lowerBins = bins
    .filter((b) => b.binId < activeBinId)
    .sort((a, b) => b.binId - a.binId); // closest to active first

  const computeGradient = (sortedBins: BinData[]): number => {
    if (sortedBins.length < 2) return 0;
    const maxUsd = Math.max(...sortedBins.map((b) => b.totalUsd), 0.01);
    let totalDrop = 0;
    let comparisons = 0;
    for (let i = 1; i < sortedBins.length; i++) {
      const prev = sortedBins[i - 1].totalUsd / maxUsd;
      const curr = sortedBins[i].totalUsd / maxUsd;
      totalDrop += Math.max(0, prev - curr);
      comparisons++;
    }
    return comparisons > 0 ? clamp(totalDrop / comparisons, 0, 1) : 0;
  };

  const computeExhaustion = (sortedBins: BinData[]): number => {
    if (sortedBins.length === 0) return 1.0;
    const totalUsd = sortedBins.reduce((s, b) => s + b.totalUsd, 0);
    if (totalUsd <= 0) return 1.0;
    // What fraction of reserves is in the first 3 bins (nearest to active)?
    const nearReserves = sortedBins.slice(0, 3).reduce((s, b) => s + b.totalUsd, 0);
    const farReserves = totalUsd - nearReserves;
    // If far reserves are small relative to near, the edge is exhausted
    return nearReserves > 0 ? clamp(1.0 - (farReserves / totalUsd), 0, 1) : 0.5;
  };

  const computeDepth = (sortedBins: BinData[]): number => {
    const threshold = 10; // $10 minimum per bin
    return sortedBins.filter((b) => b.totalUsd >= threshold).length;
  };

  return {
    upperGradient: computeGradient(upperBins),
    lowerGradient: computeGradient(lowerBins),
    upperDepth: computeDepth(upperBins),
    lowerDepth: computeDepth(lowerBins),
    upperExhaustion: computeExhaustion(upperBins),
    lowerExhaustion: computeExhaustion(lowerBins),
  };
}

// ── Momentum Computation ──────────────────────────────────────────────────────

function computeSwapPressure(swaps: SwapEvent[]): number {
  if (swaps.length === 0) return 0;

  // Weight recent swaps more heavily (exponential decay)
  let weightedBuy = 0;
  let weightedSell = 0;
  const decayFactor = 0.95;

  // Events should be sorted newest-first from the API
  for (let i = 0; i < swaps.length; i++) {
    const weight = Math.pow(decayFactor, i);
    const volume = swaps[i].amountIn;
    if (swaps[i].direction === "BUY") {
      weightedBuy += volume * weight;
    } else {
      weightedSell += volume * weight;
    }
  }

  const total = weightedBuy + weightedSell;
  if (total <= 0) return 0;

  // Scale to -100..+100
  return Math.round(((weightedBuy - weightedSell) / total) * 100);
}

function computeMomentumScore(
  gradient: GradientProfile,
  swapPressure: number,
  bins: BinData[],
  activeBinId: number
): number {
  // Signal 1: Reserve gradient asymmetry (40% weight)
  // Steep upper gradient + shallow lower = price moving up (momentum UP)
  const gradientSignal = (gradient.upperGradient - gradient.lowerGradient) * 100;

  // Signal 2: Reserve distribution imbalance (30% weight)
  const upperUsd = bins
    .filter((b) => b.binId > activeBinId)
    .reduce((s, b) => s + b.totalUsd, 0);
  const lowerUsd = bins
    .filter((b) => b.binId < activeBinId)
    .reduce((s, b) => s + b.totalUsd, 0);
  const totalSide = upperUsd + lowerUsd;
  const imbalanceSignal = totalSide > 0
    ? ((lowerUsd - upperUsd) / totalSide) * 100  // More below = price moved up
    : 0;

  // Signal 3: Swap pressure (30% weight)
  const swapSignal = swapPressure;

  const raw = gradientSignal * 0.4 + imbalanceSignal * 0.3 + swapSignal * 0.3;
  return clamp(Math.round(raw), -100, 100);
}

function classifyMomentumPhase(
  gradient: GradientProfile,
  momentumScore: number
): MomentumPhase {
  const absMomentum = Math.abs(momentumScore);
  if (absMomentum < STALLED_MOMENTUM_THRESHOLD) return "STALLED";

  // Leading edge gradient indicates whether momentum is building or fading
  const leadingGradient = momentumScore > 0
    ? gradient.upperGradient
    : gradient.lowerGradient;

  if (leadingGradient >= ACCELERATING_GRADIENT_THRESHOLD) return "ACCELERATING";
  if (leadingGradient <= DECELERATING_GRADIENT_THRESHOLD) return "DECELERATING";
  return "STEADY";
}

function determineTimingSignal(
  phase: MomentumPhase,
  exhaustionRisk: string,
  momentumScore: number
): { signal: TimingSignal; reason: string } {
  const absMomentum = Math.abs(momentumScore);
  const dir = momentumScore > 0 ? "upward" : "downward";

  if (exhaustionRisk === "CRITICAL") {
    return {
      signal: "REPOSITION",
      reason: `Leading edge reserves nearly depleted. Price ${dir} momentum may stall or reverse. Widen position or wait for mean reversion.`,
    };
  }

  if (phase === "STALLED") {
    return {
      signal: "ENTER_NOW",
      reason: `Momentum is stalled (score: ${momentumScore}). Stable price environment — good time for tight LP positioning around active bin.`,
    };
  }

  if (phase === "DECELERATING") {
    return {
      signal: "WAIT",
      reason: `${dir.charAt(0).toUpperCase() + dir.slice(1)} momentum is decelerating (score: ${momentumScore}). Wait for stabilization before entering or adjusting.`,
    };
  }

  if (phase === "ACCELERATING" && absMomentum >= 50) {
    return {
      signal: "REPOSITION",
      reason: `Strong ${dir} momentum accelerating (score: ${momentumScore}). Risk of range exit — widen position on the ${momentumScore > 0 ? "upper" : "lower"} side.`,
    };
  }

  if (phase === "ACCELERATING") {
    return {
      signal: "WAIT",
      reason: `${dir.charAt(0).toUpperCase() + dir.slice(1)} momentum building (score: ${momentumScore}). Wait for the move to complete before repositioning.`,
    };
  }

  // STEADY
  if (absMomentum < 30) {
    return {
      signal: "ENTER_NOW",
      reason: `Steady, mild ${dir} momentum (score: ${momentumScore}). Acceptable entry with moderate position width.`,
    };
  }
  return {
    signal: "WAIT",
    reason: `Steady ${dir} momentum at ${momentumScore}. Monitor for phase shift before committing.`,
  };
}

// ── Full Pool Analysis ────────────────────────────────────────────────────────

function analyzePool(
  poolId: number,
  pool: AppPool,
  activeBinId: number,
  bins: BinData[],
  swaps: SwapEvent[]
): MomentumAnalysis {
  const binStep = pool.binStep ?? 100;
  const gradient = computeGradientProfile(bins, activeBinId);
  const swapPressure = computeSwapPressure(swaps);
  const momentumScore = computeMomentumScore(gradient, swapPressure, bins, activeBinId);
  const momentumPhase = classifyMomentumPhase(gradient, momentumScore);

  const momentumDirection: "UP" | "DOWN" | "FLAT" =
    momentumScore > STALLED_MOMENTUM_THRESHOLD ? "UP" :
    momentumScore < -STALLED_MOMENTUM_THRESHOLD ? "DOWN" :
    "FLAT";

  const buyCount = swaps.filter((s) => s.direction === "BUY").length;
  const sellCount = swaps.filter((s) => s.direction === "SELL").length;
  const netVolumeDirection: "BUY_HEAVY" | "SELL_HEAVY" | "BALANCED" =
    buyCount > sellCount * 1.3 ? "BUY_HEAVY" :
    sellCount > buyCount * 1.3 ? "SELL_HEAVY" :
    "BALANCED";

  // Exhaustion on the leading edge
  const leadingEdgeExhaustion = momentumDirection === "UP"
    ? gradient.upperExhaustion
    : momentumDirection === "DOWN"
    ? gradient.lowerExhaustion
    : Math.max(gradient.upperExhaustion, gradient.lowerExhaustion);

  const exhaustionRisk: "CRITICAL" | "WARNING" | "OK" =
    leadingEdgeExhaustion >= EXHAUSTION_CRITICAL ? "CRITICAL" :
    leadingEdgeExhaustion >= EXHAUSTION_WARNING ? "WARNING" :
    "OK";

  const { signal: timingSignal, reason: reasoning } =
    determineTimingSignal(momentumPhase, exhaustionRisk, momentumScore);

  // Competition scoring
  const momentumMagnitude = Math.abs(momentumScore);
  const gradientAsymmetry = Math.round(
    Math.abs(gradient.upperGradient - gradient.lowerGradient) * 100
  );
  const exhaustionRiskScore = Math.round(leadingEdgeExhaustion * 100);
  const swapPressureScore = Math.abs(swapPressure);
  const composite = Math.round(
    momentumMagnitude * 0.35 +
    gradientAsymmetry * 0.25 +
    exhaustionRiskScore * 0.20 +
    swapPressureScore * 0.20
  );

  return {
    poolId,
    pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
    tvlUsd: Math.round(pool.tvlUsd),
    activeBinId,
    binStep,
    gradient,
    momentumScore,
    momentumPhase,
    momentumDirection,
    swapPressure,
    swapCount: swaps.length,
    buyCount,
    sellCount,
    netVolumeDirection,
    leadingEdgeExhaustion: Math.round(leadingEdgeExhaustion * 1000) / 1000,
    exhaustionRisk,
    timingSignal,
    reasoning,
    competition_score: {
      momentum_magnitude: momentumMagnitude,
      gradient_asymmetry: gradientAsymmetry,
      exhaustion_risk_score: exhaustionRiskScore,
      swap_pressure_score: swapPressureScore,
      composite,
    },
  };
}

// ── ASCII Visualization ───────────────────────────────────────────────────────

function renderMomentumGauge(score: number): string {
  const width = 41; // -20 to +20 with center
  const center = 20;
  const pos = center + Math.round(score / 5);
  const clamped = clamp(pos, 0, width - 1);
  let gauge = "";
  for (let i = 0; i < width; i++) {
    if (i === center) gauge += "|";
    else if (i === clamped) gauge += "●";
    else if ((i > center && i <= clamped) || (i < center && i >= clamped)) gauge += "═";
    else gauge += "─";
  }
  return gauge;
}

function renderGradientChart(
  bins: BinData[],
  activeBinId: number,
  pair: string,
  phase: MomentumPhase,
  score: number
): string {
  if (bins.length === 0) return "  [no bin data available]\n";

  const maxUsd = Math.max(...bins.map((b) => b.totalUsd), 0.01);
  const lines: string[] = [];
  const phaseEmoji =
    phase === "ACCELERATING" ? ">>" :
    phase === "DECELERATING" ? "<<" :
    phase === "STEADY" ? "--" : "..";

  lines.push(`  ${pair} — Momentum: ${score > 0 ? "+" : ""}${score}  Phase: ${phase} ${phaseEmoji}`);
  lines.push("  " + "─".repeat(60));
  lines.push(`  ${"Offset".padStart(7)}  ${"Bin ID".padEnd(7)}  ${"Gradient".padEnd(22)}  USD`);
  lines.push("  " + "─".repeat(60));

  const sorted = [...bins].sort((a, b) => b.binId - a.binId);

  for (const b of sorted) {
    const isActive = b.binId === activeBinId;
    const offsetStr = (b.offsetFromActive >= 0 ? "+" : "") + b.offsetFromActive.toString().padStart(3);
    const binStr = b.binId.toString().padEnd(7);
    const barStr = bar(b.totalUsd, maxUsd, 22);
    const usdStr = formatUsd(b.totalUsd).padStart(8);
    const marker = isActive ? " << ACTIVE" : "";
    lines.push(`  ${offsetStr.padStart(7)}  ${binStr}  ${barStr}  ${usdStr}${marker}`);
  }

  lines.push("  " + "─".repeat(60));
  return lines.join("\n") + "\n";
}

// ── Command Handlers ──────────────────────────────────────────────────────────

async function runDoctor(): Promise<void> {
  const results: Record<string, string> = {};

  try {
    await fetchJson(`${BFF_APP_BASE}/pools`);
    results["bitflow_bff_api"] = "ok";
  } catch (e: any) {
    results["bitflow_bff_api"] = `error: ${e.message}`;
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
    const url = `${HIRO_API}/extended/v1/contract/${DLMM_CONTRACT_ADDR}.${DLMM_CONTRACT_NAME}/events?limit=1`;
    await fetchJson(url);
    results["contract_events"] = "ok";
  } catch (e: any) {
    results["contract_events"] = `error: ${e.message}`;
  }

  console.log(
    JSON.stringify({
      tool: "hodlmm-bin-momentum",
      command: "doctor",
      status: Object.values(results).every((v) => v.startsWith("ok")) ? "healthy" : "degraded",
      checks: results,
      timestamp: new Date().toISOString(),
    }, null, 2)
  );
}

async function runInstallPacks(): Promise<void> {
  console.log(
    JSON.stringify({
      tool: "hodlmm-bin-momentum",
      command: "install-packs",
      status: "ok",
      message: "No additional dependencies required. Uses commander (workspace) + native fetch.",
      timestamp: new Date().toISOString(),
    })
  );
}

async function runAnalyze(options: {
  pool: string;
  json?: boolean;
}): Promise<void> {
  const poolId = parseInt(options.pool);
  if (isNaN(poolId)) {
    console.log(JSON.stringify({
      tool: "hodlmm-bin-momentum",
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
      tool: "hodlmm-bin-momentum",
      command: "run",
      timestamp: new Date().toISOString(),
      error: `Pool ${poolId} not found or below TVL threshold ($${MIN_TVL_USD})`,
    }));
    return;
  }

  const activeBinId = pool.activeBinId || await getActiveBinId(poolId);
  if (!activeBinId) {
    console.log(JSON.stringify({
      tool: "hodlmm-bin-momentum",
      command: "run",
      timestamp: new Date().toISOString(),
      error: `Could not determine active bin for pool ${poolId}`,
    }));
    return;
  }

  const [bins, swaps] = await Promise.all([
    fetchBinData(poolId, activeBinId, pool),
    fetchSwapEvents(poolId),
  ]);

  const analysis = analyzePool(poolId, pool, activeBinId, bins, swaps);

  if (options.json) {
    console.log(JSON.stringify({
      tool: "hodlmm-bin-momentum",
      command: "run",
      timestamp: new Date().toISOString(),
      ...analysis,
      binsScanned: BIN_SCAN_RADIUS * 2 + 1,
      binsWithLiquidity: bins.length,
    }, null, 2));
    return;
  }

  const chart = renderGradientChart(bins, activeBinId, analysis.pair, analysis.momentumPhase, analysis.momentumScore);
  const gauge = renderMomentumGauge(analysis.momentumScore);

  console.log(`\n  HODLMM Bin Momentum Analyzer — Pool ${poolId} (${analysis.pair})`);
  console.log(`  TVL: ${formatUsd(analysis.tvlUsd)}  |  Active Bin: ${activeBinId}  |  Bin Step: ${analysis.binStep} bps\n`);
  console.log(chart);
  console.log(`  Momentum Gauge: [${gauge}]`);
  console.log(`  Score: ${analysis.momentumScore > 0 ? "+" : ""}${analysis.momentumScore}  Direction: ${analysis.momentumDirection}  Phase: ${analysis.momentumPhase}\n`);
  console.log(`  Reserve Gradient:`);
  console.log(`    Upper: ${(analysis.gradient.upperGradient * 100).toFixed(1)}% slope  (${analysis.gradient.upperDepth} deep bins)  Exhaustion: ${(analysis.gradient.upperExhaustion * 100).toFixed(0)}%`);
  console.log(`    Lower: ${(analysis.gradient.lowerGradient * 100).toFixed(1)}% slope  (${analysis.gradient.lowerDepth} deep bins)  Exhaustion: ${(analysis.gradient.lowerExhaustion * 100).toFixed(0)}%\n`);
  console.log(`  Swap Analysis: ${analysis.swapCount} events  (${analysis.buyCount} buys / ${analysis.sellCount} sells)  Pressure: ${analysis.swapPressure > 0 ? "+" : ""}${analysis.swapPressure}`);
  console.log(`  Net Volume: ${analysis.netVolumeDirection}\n`);
  console.log(`  Exhaustion Risk: ${analysis.exhaustionRisk}  (leading edge: ${(analysis.leadingEdgeExhaustion * 100).toFixed(0)}%)`);
  console.log(`  Timing Signal: ${analysis.timingSignal}\n`);
  console.log(`  Analysis: ${analysis.reasoning}\n`);
  console.log(`  Competition Score: ${analysis.competition_score.composite}/100`);
  console.log();
}

async function runScan(options: {
  top?: string;
  minTvl?: string;
  json?: boolean;
}): Promise<void> {
  const topN = parseInt(options.top || "5");
  const minTvl = parseFloat(options.minTvl || String(MIN_TVL_USD));

  const pools = (await fetchAllPools()).filter((p) => p.tvlUsd >= minTvl);

  if (pools.length === 0) {
    console.log(JSON.stringify({
      tool: "hodlmm-bin-momentum",
      command: "scan",
      timestamp: new Date().toISOString(),
      error: "No pools found above TVL threshold",
    }));
    return;
  }

  const candidates = [...pools]
    .sort((a, b) => b.tvlUsd - a.tvlUsd)
    .slice(0, topN * 2);

  const results: MomentumAnalysis[] = [];

  for (const pool of candidates) {
    try {
      const activeBinId = pool.activeBinId || await getActiveBinId(pool.poolId);
      if (!activeBinId) continue;

      const [bins, swaps] = await Promise.all([
        fetchBinData(pool.poolId, activeBinId, pool),
        fetchSwapEvents(pool.poolId),
      ]);
      if (bins.length === 0) continue;

      const analysis = analyzePool(pool.poolId, pool, activeBinId, bins, swaps);
      results.push(analysis);
    } catch { /* skip */ }
  }

  // Sort by absolute momentum (most active first)
  results.sort((a, b) => Math.abs(b.momentumScore) - Math.abs(a.momentumScore));
  const ranked = results.slice(0, topN);

  const summary = {
    accelerating: ranked.filter((r) => r.momentumPhase === "ACCELERATING").length,
    decelerating: ranked.filter((r) => r.momentumPhase === "DECELERATING").length,
    steady: ranked.filter((r) => r.momentumPhase === "STEADY").length,
    stalled: ranked.filter((r) => r.momentumPhase === "STALLED").length,
    avgMomentum: ranked.length > 0
      ? Math.round(ranked.reduce((s, r) => s + Math.abs(r.momentumScore), 0) / ranked.length)
      : 0,
    exhaustionWarnings: ranked.filter((r) => r.exhaustionRisk !== "OK").length,
    strongestPool: ranked.length > 0 ? ranked[0].pair : null,
    strongestDirection: ranked.length > 0 ? ranked[0].momentumDirection : null,
  };

  if (options.json) {
    console.log(JSON.stringify({
      tool: "hodlmm-bin-momentum",
      command: "scan",
      timestamp: new Date().toISOString(),
      poolsScanned: results.length,
      results: ranked,
      summary,
    }, null, 2));
    return;
  }

  console.log(`\n  HODLMM Bin Momentum Analyzer — Top ${topN} Pools by Momentum Strength`);
  console.log(`  Scanned ${results.length} pools above $${minTvl.toLocaleString()} TVL\n`);
  console.log(`  ${"Pool".padEnd(6)}  ${"Pair".padEnd(16)}  ${"TVL".padStart(10)}  ${"Score".padStart(6)}  ${"Phase".padEnd(14)}  ${"Exhaust".padEnd(8)}  Signal`);
  console.log("  " + "─".repeat(80));

  for (const r of ranked) {
    const tvlStr = formatUsd(r.tvlUsd).padStart(10);
    const scoreStr = (r.momentumScore > 0 ? "+" : "") + String(r.momentumScore).padStart(4);
    const phaseStr = r.momentumPhase.padEnd(14);
    const pairStr = r.pair.padEnd(16);
    const exhaustStr = r.exhaustionRisk.padEnd(8);
    console.log(`  ${String(r.poolId).padEnd(6)}  ${pairStr}  ${tvlStr}  ${scoreStr}  ${phaseStr}  ${exhaustStr}  ${r.timingSignal}`);
  }

  console.log("  " + "─".repeat(80));
  console.log(`\n  Summary: ${summary.accelerating} ACCEL, ${summary.decelerating} DECEL, ${summary.steady} STEADY, ${summary.stalled} STALLED`);
  console.log(`  Avg |Momentum|: ${summary.avgMomentum}/100  |  Exhaustion Warnings: ${summary.exhaustionWarnings}`);

  if (summary.accelerating > 0) {
    console.log(`\n  Alert: ${summary.accelerating} pool(s) with accelerating momentum — monitor for range exits.`);
  }
  if (summary.stalled > ranked.length / 2) {
    console.log(`\n  Opportunity: Majority of pools are STALLED — good LP entry conditions.`);
  }
  console.log();
}

// ── CLI Setup ─────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-bin-momentum")
  .description(
    "HODLMM Bin Momentum Analyzer — Measures rate and direction of active bin movement from reserve gradients and swap event history"
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
  .description("Analyze bin momentum for a specific HODLMM pool")
  .requiredOption("--pool <id>", "HODLMM pool ID to analyze")
  .option("--json", "Output raw JSON instead of formatted report")
  .action(runAnalyze);

program
  .command("scan")
  .description("Scan top pools and rank by momentum strength")
  .option("--top <n>", "Number of top pools to display", "5")
  .option("--min-tvl <usd>", "Minimum TVL threshold in USD", String(MIN_TVL_USD))
  .option("--json", "Output raw JSON instead of formatted table")
  .action(runScan);

program.parse();
