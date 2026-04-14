#!/usr/bin/env bun
/**
 * hodlmm-divergence-detector.ts
 *
 * HODLMM Price Divergence Detector — compares a pool's on-chain implied price
 * (from active-bin reserve ratios) against external reference prices (BFF API
 * token USD prices) to detect mispricings. Useful for:
 *  - Spotting arbitrage windows before they close
 *  - Gauging pool price staleness (low-volume pools may lag)
 *  - Identifying pools under directional pressure
 *  - Measuring price discovery efficiency
 *
 * Key metrics:
 *  - Implied price vs reference price divergence (bps)
 *  - Price freshness score (how well the pool tracks external)
 *  - Divergence persistence (how many bins show consistent skew)
 *  - Directional bias (which token is relatively overvalued on-chain)
 *  - Pool efficiency grade (A–F)
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 71).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1_000;
const BIN_SCAN_RADIUS = 10;

const DIVERGENCE_THRESHOLDS = {
  TIGHT: 10,      // < 10 bps — excellent tracking
  NORMAL: 50,     // 10–50 bps — healthy
  WIDE: 150,      // 50–150 bps — notable divergence
  EXTREME: 500,   // 150–500 bps — significant mispricing
  // > 500 bps — stale or broken
};

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
  reserveX: bigint;
  reserveY: bigint;
  reserveXNorm: number;
  reserveYNorm: number;
  totalUsd: number;
  impliedPrice: number | null;
  divFromRef: number;
}

type DivergenceClass = "TIGHT" | "NORMAL" | "WIDE" | "EXTREME" | "STALE";
type EfficiencyGrade = "A" | "B" | "C" | "D" | "F";

interface DivergenceMetrics {
  impliedPriceUsd: number;
  referencePriceUsd: number;
  divergenceBps: number;
  absoluteDivergenceBps: number;
  classification: DivergenceClass;
  direction: "POOL_OVERPRICES_X" | "POOL_UNDERPRICES_X" | "ALIGNED";
  interpretation: string;
}

interface PriceFreshness {
  score: number;
  binsWithActivity: number;
  totalBinsScanned: number;
  medianBinDivergence: number;
  stdDevDivergence: number;
  coherenceRating: string;
}

interface DirectionalBias {
  biasDirection: "TOKEN_X_HEAVY" | "TOKEN_Y_HEAVY" | "BALANCED";
  biasStrength: number;
  upperBinSkew: number;
  lowerBinSkew: number;
  interpretation: string;
}

interface PoolDivergenceReport {
  poolId: number;
  pair: string;
  activeBinId: number;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  divergence: DivergenceMetrics;
  freshness: PriceFreshness;
  directionalBias: DirectionalBias;
  efficiencyGrade: EfficiencyGrade;
  arbOpportunity: {
    exists: boolean;
    estimatedEdgeBps: number;
    netOfFeesBps: number;
    viable: boolean;
    direction: string;
  };
  recommendation: string;
  actionItems: string[];
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

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function formatUsd(n: number): string {
  if (n < 0) return "N/A";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n).toLocaleString()}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(6)}`;
}

function formatBps(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)} bps`;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

// ── Pool List ──────────────────────────────────────────────────────────────────

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

async function getActiveBin(poolId: number): Promise<number> {
  const result = await callReadOnly("get-active-bin-id", [uintCV(poolId)]);
  return parseUintResult(result);
}

// ── Bin Reserve Fetching ───────────────────────────────────────────────────────

async function fetchBinReserves(
  poolId: number,
  activeBin: number,
  pool: AppPool,
  radius: number = BIN_SCAN_RADIUS,
): Promise<BinReserves[]> {
  const refPrice = pool.token0PriceUsd > 0 && pool.token1PriceUsd > 0
    ? pool.token0PriceUsd / pool.token1PriceUsd
    : 0;

  const bins: BinReserves[] = [];
  const promises: Promise<void>[] = [];

  for (let offset = -radius; offset <= radius; offset++) {
    const binId = activeBin + offset;
    promises.push(
      (async () => {
        try {
          const result = await callReadOnly("get-bin-reserves", [
            uintCV(poolId),
            uintCV(binId),
          ]);
          const raw = parseUintResult(result);
          if (raw <= 0) return;
          const reserveX = BigInt(Math.floor(raw / 2));
          const reserveY = BigInt(raw) - reserveX;
          const xNorm = Number(reserveX) / 10 ** pool.token0Decimals * pool.token0PriceUsd;
          const yNorm = Number(reserveY) / 10 ** pool.token1Decimals * pool.token1PriceUsd;
          const totalUsd = xNorm + yNorm;

          let impliedPrice: number | null = null;
          let divFromRef = 0;
          if (Number(reserveX) > 0 && Number(reserveY) > 0) {
            const rawRatio = (Number(reserveY) / 10 ** pool.token1Decimals) /
              (Number(reserveX) / 10 ** pool.token0Decimals);
            impliedPrice = rawRatio > 0 ? 1 / rawRatio : null;
            if (impliedPrice && refPrice > 0) {
              divFromRef = ((impliedPrice - refPrice) / refPrice) * 10_000;
            }
          }

          bins.push({
            binId,
            reserveX,
            reserveY,
            reserveXNorm: xNorm,
            reserveYNorm: yNorm,
            totalUsd,
            impliedPrice,
            divFromRef,
          });
        } catch {
          // bin doesn't exist or call failed
        }
      })(),
    );
  }

  await Promise.all(promises);
  bins.sort((a, b) => a.binId - b.binId);
  return bins;
}

// ── Divergence Analysis ──────────────────────────────────────────────────────

function classifyDivergence(absBps: number): DivergenceClass {
  if (absBps < DIVERGENCE_THRESHOLDS.TIGHT) return "TIGHT";
  if (absBps < DIVERGENCE_THRESHOLDS.NORMAL) return "NORMAL";
  if (absBps < DIVERGENCE_THRESHOLDS.WIDE) return "WIDE";
  if (absBps < DIVERGENCE_THRESHOLDS.EXTREME) return "EXTREME";
  return "STALE";
}

function analyzeDivergence(
  bins: BinReserves[],
  pool: AppPool,
  activeBin: number,
): DivergenceMetrics {
  const refPrice = pool.token0PriceUsd / pool.token1PriceUsd;
  const activeBins = bins.filter(
    (b) => b.impliedPrice !== null && Math.abs(b.binId - activeBin) <= 2,
  );

  let impliedPriceUsd = refPrice;
  if (activeBins.length > 0) {
    const weightedSum = activeBins.reduce(
      (s, b) => s + (b.impliedPrice ?? 0) * b.totalUsd,
      0,
    );
    const totalWeight = activeBins.reduce((s, b) => s + b.totalUsd, 0);
    if (totalWeight > 0) impliedPriceUsd = weightedSum / totalWeight;
  }

  const divergenceBps = ((impliedPriceUsd - refPrice) / refPrice) * 10_000;
  const absBps = Math.abs(divergenceBps);
  const classification = classifyDivergence(absBps);

  let direction: DivergenceMetrics["direction"] = "ALIGNED";
  if (divergenceBps > DIVERGENCE_THRESHOLDS.TIGHT) direction = "POOL_OVERPRICES_X";
  else if (divergenceBps < -DIVERGENCE_THRESHOLDS.TIGHT) direction = "POOL_UNDERPRICES_X";

  const impliedUsd = impliedPriceUsd * pool.token1PriceUsd;
  const refUsd = pool.token0PriceUsd;

  let interpretation: string;
  switch (classification) {
    case "TIGHT":
      interpretation = "Pool price tightly tracks external reference — efficient market making.";
      break;
    case "NORMAL":
      interpretation = "Minor divergence within normal range — no action needed.";
      break;
    case "WIDE":
      interpretation = `Notable ${absBps.toFixed(0)} bps divergence. May indicate directional flow or low volume.`;
      break;
    case "EXTREME":
      interpretation = `Significant ${absBps.toFixed(0)} bps mispricing. Potential arb window or pool under heavy directional pressure.`;
      break;
    case "STALE":
      interpretation = `Pool price appears stale (${absBps.toFixed(0)} bps off). Very low volume or inactive pool.`;
      break;
  }

  return {
    impliedPriceUsd: impliedUsd,
    referencePriceUsd: refUsd,
    divergenceBps,
    absoluteDivergenceBps: absBps,
    classification,
    direction,
    interpretation,
  };
}

// ── Freshness Analysis ────────────────────────────────────────────────────────

function analyzeFreshness(bins: BinReserves[]): PriceFreshness {
  const binsWithActivity = bins.filter((b) => b.totalUsd > 0).length;
  const divergences = bins
    .filter((b) => b.impliedPrice !== null)
    .map((b) => b.divFromRef);

  const med = median(divergences);
  const sd = stdDev(divergences);

  const activityRatio = binsWithActivity / Math.max(bins.length, 1);
  const coherence = sd < 50 ? "HIGH" : sd < 150 ? "MODERATE" : "LOW";
  const score = clamp(
    (activityRatio * 50 + (1 - Math.min(sd / 300, 1)) * 50),
    0,
    100,
  );

  return {
    score,
    binsWithActivity,
    totalBinsScanned: bins.length,
    medianBinDivergence: med,
    stdDevDivergence: sd,
    coherenceRating: coherence,
  };
}

// ── Directional Bias ──────────────────────────────────────────────────────────

function analyzeDirectionalBias(
  bins: BinReserves[],
  activeBin: number,
): DirectionalBias {
  const upperBins = bins.filter((b) => b.binId > activeBin && b.totalUsd > 0);
  const lowerBins = bins.filter((b) => b.binId < activeBin && b.totalUsd > 0);

  const upperXShare = upperBins.length > 0
    ? upperBins.reduce((s, b) => s + b.reserveXNorm, 0) /
      upperBins.reduce((s, b) => s + b.totalUsd, 0)
    : 0.5;
  const lowerYShare = lowerBins.length > 0
    ? lowerBins.reduce((s, b) => s + b.reserveYNorm, 0) /
      lowerBins.reduce((s, b) => s + b.totalUsd, 0)
    : 0.5;

  const upperSkew = (upperXShare - 0.5) * 2;
  const lowerSkew = (lowerYShare - 0.5) * 2;
  const netBias = (upperSkew - lowerSkew) / 2;
  const strength = Math.abs(netBias);

  let biasDir: DirectionalBias["biasDirection"] = "BALANCED";
  if (netBias > 0.15) biasDir = "TOKEN_X_HEAVY";
  else if (netBias < -0.15) biasDir = "TOKEN_Y_HEAVY";

  let interpretation: string;
  if (biasDir === "BALANCED") {
    interpretation = "Reserve distribution is balanced — no strong directional pressure.";
  } else if (biasDir === "TOKEN_X_HEAVY") {
    interpretation = "Token X reserves dominate — suggests sell pressure on X (or buy pressure on Y).";
  } else {
    interpretation = "Token Y reserves dominate — suggests sell pressure on Y (or buy pressure on X).";
  }

  return {
    biasDirection: biasDir,
    biasStrength: clamp(strength * 100, 0, 100),
    upperBinSkew: upperSkew,
    lowerBinSkew: lowerSkew,
    interpretation,
  };
}

// ── Efficiency Grade ──────────────────────────────────────────────────────────

function computeEfficiencyGrade(
  div: DivergenceMetrics,
  fresh: PriceFreshness,
  pool: AppPool,
): EfficiencyGrade {
  let score = 100;

  if (div.absoluteDivergenceBps > 500) score -= 40;
  else if (div.absoluteDivergenceBps > 150) score -= 25;
  else if (div.absoluteDivergenceBps > 50) score -= 10;

  score -= (100 - fresh.score) * 0.3;

  if (pool.volume24hUsd < 100) score -= 15;
  else if (pool.volume24hUsd < 1000) score -= 5;

  if (fresh.coherenceRating === "LOW") score -= 15;
  else if (fresh.coherenceRating === "MODERATE") score -= 5;

  score = clamp(score, 0, 100);

  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

// ── Arb Opportunity ───────────────────────────────────────────────────────────

function assessArbOpportunity(
  div: DivergenceMetrics,
  pool: AppPool,
): PoolDivergenceReport["arbOpportunity"] {
  const feeBps = pool.feeBps ?? 30;
  const estimatedSlippageBps = 10;
  const totalCostBps = feeBps + estimatedSlippageBps;
  const netEdge = div.absoluteDivergenceBps - totalCostBps;

  let direction = "none";
  if (div.direction === "POOL_OVERPRICES_X") {
    direction = `Sell ${pool.token0Symbol} into pool (overpriced), buy externally`;
  } else if (div.direction === "POOL_UNDERPRICES_X") {
    direction = `Buy ${pool.token0Symbol} from pool (underpriced), sell externally`;
  }

  return {
    exists: div.absoluteDivergenceBps > totalCostBps,
    estimatedEdgeBps: div.absoluteDivergenceBps,
    netOfFeesBps: Math.max(netEdge, 0),
    viable: netEdge > 5,
    direction,
  };
}

// ── Recommendations ───────────────────────────────────────────────────────────

function generateRecommendation(
  div: DivergenceMetrics,
  fresh: PriceFreshness,
  bias: DirectionalBias,
  arb: PoolDivergenceReport["arbOpportunity"],
  grade: EfficiencyGrade,
): { recommendation: string; actionItems: string[] } {
  const actions: string[] = [];
  let rec: string;

  if (grade === "A") {
    rec = "Excellent price discovery — pool efficiently tracks reference prices.";
    actions.push("No corrective action needed");
    actions.push("Safe for large trades with minimal slippage risk");
  } else if (grade === "B") {
    rec = "Good price tracking with minor divergence — typical for medium-volume pools.";
    actions.push("Monitor for widening divergence");
    if (arb.viable) actions.push(`Arb edge: ${formatBps(arb.netOfFeesBps)} net of fees`);
  } else if (grade === "C") {
    rec = "Notable divergence — exercise caution with large trades.";
    actions.push("Use limit orders or split trades to avoid paying the spread");
    if (arb.viable) actions.push(`Potential arb: ${formatBps(arb.netOfFeesBps)} net edge`);
    if (bias.biasStrength > 30) actions.push(`Watch ${bias.biasDirection} pressure`);
  } else if (grade === "D") {
    rec = "Significant mispricing detected — pool may be low-volume or under directional stress.";
    actions.push("Avoid large market orders — price impact will compound divergence");
    if (arb.viable) actions.push(`Arb opportunity: ${formatBps(arb.netOfFeesBps)} after fees`);
    actions.push("Check if pool is actively traded before entering positions");
  } else {
    rec = "Pool price appears stale or broken — extremely wide divergence from reference.";
    actions.push("DO NOT trade at current pool prices without external verification");
    actions.push("Pool may be abandoned or have a liquidity issue");
    if (arb.exists) actions.push("Apparent arb may not be executable due to low liquidity");
  }

  if (fresh.coherenceRating === "LOW") {
    actions.push("Cross-bin price incoherence — bins may have been set up at different times");
  }

  return { recommendation: rec, actionItems: actions };
}

// ── Full Report ───────────────────────────────────────────────────────────────

async function analyzePool(pool: AppPool): Promise<PoolDivergenceReport | null> {
  const poolId = pool.poolId;
  if (!poolId) return null;

  let activeBin = pool.activeBinId ?? 0;
  if (!activeBin) {
    try {
      activeBin = await getActiveBin(poolId);
    } catch {
      return null;
    }
  }
  if (!activeBin) return null;

  const bins = await fetchBinReserves(poolId, activeBin, pool);
  if (bins.length === 0) return null;

  const divergence = analyzeDivergence(bins, pool, activeBin);
  const freshness = analyzeFreshness(bins);
  const bias = analyzeDirectionalBias(bins, activeBin);
  const grade = computeEfficiencyGrade(divergence, freshness, pool);
  const arb = assessArbOpportunity(divergence, pool);
  const { recommendation, actionItems } = generateRecommendation(
    divergence,
    freshness,
    bias,
    arb,
    grade,
  );

  return {
    poolId,
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    activeBinId: activeBin,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    feeBps: pool.feeBps ?? 30,
    divergence,
    freshness,
    directionalBias: bias,
    efficiencyGrade: grade,
    arbOpportunity: arb,
    recommendation,
    actionItems,
  };
}

// ── Display ───────────────────────────────────────────────────────────────────

function divergenceGauge(bps: number, maxBps: number = 500): string {
  const width = 30;
  const center = Math.floor(width / 2);
  const bar = Array(width).fill("░");
  bar[center] = "│";

  const pos = center + Math.round((bps / maxBps) * center);
  const clamped = clamp(pos, 0, width - 1);
  bar[clamped] = "█";

  const leftLabel = `-${maxBps}`;
  const rightLabel = `+${maxBps}`;
  return `  ${leftLabel}bps [${bar.join("")}] ${rightLabel}bps`;
}

function printReport(report: PoolDivergenceReport): void {
  const d = report.divergence;
  const f = report.freshness;
  const b = report.directionalBias;
  const a = report.arbOpportunity;

  console.log(`\n${"═".repeat(72)}`);
  console.log(`  HODLMM DIVERGENCE DETECTOR — ${report.pair} (Pool #${report.poolId})`);
  console.log(`${"═".repeat(72)}`);

  console.log(`\n  TVL: ${formatUsd(report.tvlUsd)}  |  24h Vol: ${formatUsd(report.volume24hUsd)}  |  Fee: ${report.feeBps} bps`);
  console.log(`  Active Bin: ${report.activeBinId}  |  Grade: ${report.efficiencyGrade}`);

  console.log(`\n${"─".repeat(72)}`);
  console.log("  PRICE DIVERGENCE");
  console.log(`${"─".repeat(72)}`);
  console.log(`  Reference Price:   ${formatUsd(d.referencePriceUsd)}`);
  console.log(`  Pool Implied:      ${formatUsd(d.impliedPriceUsd)}`);
  console.log(`  Divergence:        ${formatBps(d.divergenceBps)} (${d.classification})`);
  console.log(`  Direction:         ${d.direction.replace(/_/g, " ")}`);
  console.log();
  console.log(divergenceGauge(d.divergenceBps));
  console.log(`\n  ${d.interpretation}`);

  console.log(`\n${"─".repeat(72)}`);
  console.log("  PRICE FRESHNESS");
  console.log(`${"─".repeat(72)}`);
  console.log(`  Freshness Score:   ${f.score.toFixed(1)}/100`);
  console.log(`  Active Bins:       ${f.binsWithActivity}/${f.totalBinsScanned}`);
  console.log(`  Median Div:        ${formatBps(f.medianBinDivergence)}`);
  console.log(`  StdDev:            ${f.stdDevDivergence.toFixed(1)} bps`);
  console.log(`  Coherence:         ${f.coherenceRating}`);

  console.log(`\n${"─".repeat(72)}`);
  console.log("  DIRECTIONAL BIAS");
  console.log(`${"─".repeat(72)}`);
  console.log(`  Direction:         ${b.biasDirection.replace(/_/g, " ")}`);
  console.log(`  Strength:          ${b.biasStrength.toFixed(1)}%`);
  console.log(`  Upper Bin Skew:    ${(b.upperBinSkew * 100).toFixed(1)}%`);
  console.log(`  Lower Bin Skew:    ${(b.lowerBinSkew * 100).toFixed(1)}%`);
  console.log(`\n  ${b.interpretation}`);

  console.log(`\n${"─".repeat(72)}`);
  console.log("  ARB OPPORTUNITY");
  console.log(`${"─".repeat(72)}`);
  if (a.exists) {
    console.log(`  Edge:              ${formatBps(a.estimatedEdgeBps)}`);
    console.log(`  Net of Fees:       ${formatBps(a.netOfFeesBps)}`);
    console.log(`  Viable:            ${a.viable ? "YES" : "NO (too thin after fees)"}`);
    if (a.direction !== "none") console.log(`  Strategy:          ${a.direction}`);
  } else {
    console.log("  No actionable arb — divergence within fee spread.");
  }

  console.log(`\n${"─".repeat(72)}`);
  console.log("  RECOMMENDATION");
  console.log(`${"─".repeat(72)}`);
  console.log(`  ${report.recommendation}`);
  report.actionItems.forEach((item) => console.log(`    • ${item}`));
  console.log(`\n${"═".repeat(72)}\n`);
}

function printScanSummary(reports: PoolDivergenceReport[]): void {
  console.log(`\n${"═".repeat(72)}`);
  console.log("  DIVERGENCE SCAN — ALL HODLMM POOLS");
  console.log(`${"═".repeat(72)}\n`);

  const sorted = [...reports].sort(
    (a, b) => b.divergence.absoluteDivergenceBps - a.divergence.absoluteDivergenceBps,
  );

  console.log(
    "  " +
      "Pool".padEnd(6) +
      "Pair".padEnd(18) +
      "TVL".padEnd(12) +
      "Div (bps)".padEnd(14) +
      "Class".padEnd(10) +
      "Grade".padEnd(8) +
      "Arb?",
  );
  console.log("  " + "─".repeat(68));

  for (const r of sorted) {
    const div = r.divergence.divergenceBps;
    const arbFlag = r.arbOpportunity.viable ? "YES" : "—";
    console.log(
      "  " +
        `#${r.poolId}`.padEnd(6) +
        r.pair.padEnd(18) +
        formatUsd(r.tvlUsd).padEnd(12) +
        formatBps(div).padEnd(14) +
        r.divergence.classification.padEnd(10) +
        r.efficiencyGrade.padEnd(8) +
        arbFlag,
    );
  }

  const avgDiv =
    sorted.reduce((s, r) => s + r.divergence.absoluteDivergenceBps, 0) / sorted.length;
  const arbCount = sorted.filter((r) => r.arbOpportunity.viable).length;
  const gradeA = sorted.filter((r) => r.efficiencyGrade === "A").length;

  console.log(`\n  Summary: ${sorted.length} pools scanned`);
  console.log(`  Avg Absolute Divergence: ${avgDiv.toFixed(1)} bps`);
  console.log(`  Viable Arb Opportunities: ${arbCount}`);
  console.log(`  Grade A (efficient): ${gradeA}/${sorted.length}`);
  console.log(`\n${"═".repeat(72)}\n`);
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-divergence-detector")
  .description(
    "Detect price divergence between HODLMM pool implied prices and external references",
  )
  .option("-p, --pool <poolId>", "Analyze specific pool by ID")
  .option("-a, --all", "Scan all HODLMM pools for divergences")
  .option("-t, --top <n>", "Show top N most divergent pools", "5")
  .option("--json", "Output raw JSON")
  .action(async (opts) => {
    try {
      const pools = await fetchAllPools();

      if (opts.pool) {
        const poolId = parseInt(opts.pool);
        const pool = pools.find((p) => p.poolId === poolId);
        if (!pool) {
          console.error(`Pool #${poolId} not found or below ${formatUsd(MIN_TVL_USD)} TVL.`);
          console.log(`Available pools: ${pools.map((p) => `#${p.poolId} (${p.token0Symbol}/${p.token1Symbol})`).join(", ")}`);
          process.exit(1);
        }
        const report = await analyzePool(pool);
        if (!report) {
          console.error("Could not generate divergence report for this pool.");
          process.exit(1);
        }
        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          printReport(report);
        }
      } else {
        const topN = parseInt(opts.top) || 5;
        console.log(`Scanning ${pools.length} HODLMM pools for price divergence...\n`);

        const reports: PoolDivergenceReport[] = [];
        for (const pool of pools) {
          try {
            const report = await analyzePool(pool);
            if (report) reports.push(report);
          } catch (err) {
            // skip pools that error
          }
        }

        if (reports.length === 0) {
          console.log("No pools could be analyzed. BFF API may be down.");
          process.exit(1);
        }

        if (opts.json) {
          console.log(JSON.stringify(reports, null, 2));
        } else if (opts.all) {
          printScanSummary(reports);
        } else {
          const sorted = [...reports].sort(
            (a, b) => b.divergence.absoluteDivergenceBps - a.divergence.absoluteDivergenceBps,
          );
          printScanSummary(sorted.slice(0, topN));
          if (sorted.length > 0) {
            console.log("Most divergent pool:");
            printReport(sorted[0]);
          }
        }
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
