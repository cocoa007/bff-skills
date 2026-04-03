#!/usr/bin/env bun
/**
 * hodlmm-sentiment-index.ts
 *
 * HODLMM Sentiment Index — Aggregates multiple on-chain signals from HODLMM
 * DLMM pools into a composite market sentiment score. Combines reserve
 * asymmetry, volume intensity, liquidity concentration, inventory pressure,
 * and bin drift into a single directional reading.
 *
 * Key metrics:
 *  - Directional bias from reserve asymmetry (bullish/bearish lean)
 *  - Volume intensity (24h volume vs TVL efficiency)
 *  - Liquidity concentration profile (Gini coefficient)
 *  - Inventory pressure (token-side imbalance around active bin)
 *  - Bin drift signal (weighted center vs active bin)
 *  - Composite sentiment score: -100 (max bearish) to +100 (max bullish)
 *  - Sentiment classification: STRONG_BULL / BULL / NEUTRAL / BEAR / STRONG_BEAR
 *  - Confidence level based on signal agreement
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 43).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 15;

// Sentiment thresholds
const STRONG_BULL_THRESHOLD = 50;
const BULL_THRESHOLD = 20;
const BEAR_THRESHOLD = -20;
const STRONG_BEAR_THRESHOLD = -50;

// Signal weights for composite score
const SIGNAL_WEIGHTS = {
  reserveAsymmetry: 0.30,  // strongest directional signal
  inventoryPressure: 0.25, // token-side imbalance
  binDrift: 0.20,          // weighted center offset
  volumeIntensity: 0.15,   // activity level (bullish bias when high)
  concentration: 0.10,     // Gini — tight = conviction, spread = uncertainty
} as const;

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

type SentimentClass = "STRONG_BULL" | "BULL" | "NEUTRAL" | "BEAR" | "STRONG_BEAR";

interface SignalReading {
  name: string;
  value: number;      // raw signal value
  score: number;      // normalized to -100..+100
  weight: number;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  explanation: string;
}

interface SentimentAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  activeBinId: number;

  // Individual signals
  signals: SignalReading[];

  // Composite
  compositeScore: number;        // -100 to +100
  sentiment: SentimentClass;
  confidence: number;            // 0–100 (signal agreement)
  signalAgreement: number;       // fraction of signals pointing same direction

  // Summary
  dominantSignal: string;
  reasoning: string;

  // Competition scoring
  competition_score: {
    signal_count: number;
    composite_magnitude: number;     // 0–100 (abs of composite)
    confidence_score: number;        // 0–100
    signal_diversity: number;        // 0–100 (how many unique directions)
    composite: number;
  };
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
  } catch { /* skip */ }
  return null;
}

function formatUsd(n: number): string {
  if (n < 0) return "N/A";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(3)}`;
}

function sentimentEmoji(s: SentimentClass): string {
  switch (s) {
    case "STRONG_BULL": return "++";
    case "BULL": return "+";
    case "NEUTRAL": return "=";
    case "BEAR": return "-";
    case "STRONG_BEAR": return "--";
  }
}

function classifySentiment(score: number): SentimentClass {
  if (score >= STRONG_BULL_THRESHOLD) return "STRONG_BULL";
  if (score >= BULL_THRESHOLD) return "BULL";
  if (score <= STRONG_BEAR_THRESHOLD) return "STRONG_BEAR";
  if (score <= BEAR_THRESHOLD) return "BEAR";
  return "NEUTRAL";
}

function bar(value: number, max: number, width: number = 20): string {
  if (max <= 0) return " ".repeat(width);
  const filled = Math.round((Math.abs(value) / max) * width);
  return "#".repeat(Math.min(filled, width)) + ".".repeat(Math.max(width - filled, 0));
}

// ── Pool Fetching ──────────────────────────────────────────────────────────────

let _poolCache: AppPool[] | null = null;

async function fetchAllPools(): Promise<AppPool[]> {
  if (_poolCache) return _poolCache;
  const data = await fetchJson(`${BFF_APP_BASE}/dlmm/pools`);
  const raw: any[] = data?.pools ?? data ?? [];
  const pools: AppPool[] = raw.map((p: any) => ({
    id: String(p.id ?? p.poolId ?? "?"),
    token0Symbol: p.token0Symbol ?? p.tokenXSymbol ?? "?",
    token1Symbol: p.token1Symbol ?? p.tokenYSymbol ?? "?",
    tvlUsd: parseFloat(p.tvlUsd ?? p.tvl ?? "0"),
    volume24hUsd: parseFloat(p.volume24hUsd ?? p.volume24h ?? "0"),
    poolId: parseInt(String(p.poolId ?? p.id ?? "0")),
    token0Decimals: parseInt(String(p.token0Decimals ?? p.tokenXDecimals ?? "6")),
    token1Decimals: parseInt(String(p.token1Decimals ?? p.tokenYDecimals ?? "6")),
    token0PriceUsd: parseFloat(p.token0PriceUsd ?? p.tokenXPriceUsd ?? "0"),
    token1PriceUsd: parseFloat(p.token1PriceUsd ?? p.tokenYPriceUsd ?? "0"),
    activeBinId: parseInt(String(p.activeBinId ?? "0")) || undefined,
    feeBps: parseFloat(String(p.feeBps ?? p.fee ?? "30")),
    binStep: parseInt(String(p.binStep ?? "100")),
  }));
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

// ── Signal Computation ────────────────────────────────────────────────────────

/**
 * Signal 1: Reserve Asymmetry
 * Measures directional bias from how reserves split across the active bin.
 * Bins below active hold token-X (bullish if depleted = price moved up).
 * Score: -100 (all reserves above = bearish) to +100 (all reserves below = bullish).
 */
function computeReserveAsymmetry(bins: BinData[], activeBinId: number): SignalReading {
  const below = bins.filter(b => b.binId < activeBinId);
  const above = bins.filter(b => b.binId > activeBinId);

  const belowUsd = below.reduce((s, b) => s + b.totalUsd, 0);
  const aboveUsd = above.reduce((s, b) => s + b.totalUsd, 0);
  const total = belowUsd + aboveUsd;

  if (total <= 0) {
    return {
      name: "Reserve Asymmetry",
      value: 0,
      score: 0,
      weight: SIGNAL_WEIGHTS.reserveAsymmetry,
      direction: "NEUTRAL",
      explanation: "No reserves found around active bin",
    };
  }

  // belowFrac > 0.5 means more reserves below = price has moved UP (bullish)
  const belowFrac = belowUsd / total;
  const rawScore = (belowFrac - 0.5) * 200; // -100 to +100

  const score = Math.max(-100, Math.min(100, Math.round(rawScore)));
  const direction = score > 10 ? "BULLISH" : score < -10 ? "BEARISH" : "NEUTRAL";
  const pct = Math.round(Math.max(belowFrac, 1 - belowFrac) * 100);

  return {
    name: "Reserve Asymmetry",
    value: Math.round(belowFrac * 1000) / 1000,
    score,
    weight: SIGNAL_WEIGHTS.reserveAsymmetry,
    direction,
    explanation: `${pct}% of reserves on ${belowFrac > 0.5 ? "token-X (below)" : "token-Y (above)"} side — ${direction.toLowerCase()} bias`,
  };
}

/**
 * Signal 2: Inventory Pressure
 * Measures the token-X vs token-Y balance specifically in bins near the active bin.
 * Heavier token-X near active = price recently dropped (bearish pressure).
 * Heavier token-Y near active = price recently rose (bullish pressure).
 */
function computeInventoryPressure(bins: BinData[], activeBinId: number): SignalReading {
  // Look at bins within ±3 of active (immediate neighborhood)
  const nearBins = bins.filter(b => Math.abs(b.offsetFromActive) <= 3);

  const totalX = nearBins.reduce((s, b) => s + b.reserveXUsd, 0);
  const totalY = nearBins.reduce((s, b) => s + b.reserveYUsd, 0);
  const total = totalX + totalY;

  if (total <= 0) {
    return {
      name: "Inventory Pressure",
      value: 0,
      score: 0,
      weight: SIGNAL_WEIGHTS.inventoryPressure,
      direction: "NEUTRAL",
      explanation: "No liquidity near active bin",
    };
  }

  // Higher Y fraction near active = bullish (Y gets consumed when price moves up,
  // so having Y means price hasn't fully consumed it yet — recent upward momentum)
  const yFrac = totalY / total;
  const rawScore = (yFrac - 0.5) * 200;
  const score = Math.max(-100, Math.min(100, Math.round(rawScore)));
  const direction = score > 10 ? "BULLISH" : score < -10 ? "BEARISH" : "NEUTRAL";

  return {
    name: "Inventory Pressure",
    value: Math.round(yFrac * 1000) / 1000,
    score,
    weight: SIGNAL_WEIGHTS.inventoryPressure,
    direction,
    explanation: `Near-active inventory: ${Math.round(yFrac * 100)}% token-Y, ${Math.round((1 - yFrac) * 100)}% token-X — ${direction.toLowerCase()} pressure`,
  };
}

/**
 * Signal 3: Bin Drift
 * Measures the liquidity-weighted center of mass relative to the active bin.
 * Positive drift (center above active) = liquidity positioned for upward move (bullish).
 * Negative drift = liquidity positioned below (bearish).
 */
function computeBinDrift(bins: BinData[], activeBinId: number): SignalReading {
  let weightedSum = 0;
  let weightTotal = 0;

  for (const b of bins) {
    weightedSum += b.offsetFromActive * b.totalUsd;
    weightTotal += b.totalUsd;
  }

  if (weightTotal <= 0) {
    return {
      name: "Bin Drift",
      value: 0,
      score: 0,
      weight: SIGNAL_WEIGHTS.binDrift,
      direction: "NEUTRAL",
      explanation: "No liquidity data for drift calculation",
    };
  }

  const centerOffset = weightedSum / weightTotal;
  // Normalize: offset of ±BIN_SCAN_RADIUS maps to ±100
  const rawScore = (centerOffset / BIN_SCAN_RADIUS) * 100;
  const score = Math.max(-100, Math.min(100, Math.round(rawScore)));
  const direction = score > 10 ? "BULLISH" : score < -10 ? "BEARISH" : "NEUTRAL";

  return {
    name: "Bin Drift",
    value: Math.round(centerOffset * 100) / 100,
    score,
    weight: SIGNAL_WEIGHTS.binDrift,
    direction,
    explanation: `Liquidity center offset ${centerOffset > 0 ? "+" : ""}${centerOffset.toFixed(1)} bins from active — ${direction.toLowerCase()} positioning`,
  };
}

/**
 * Signal 4: Volume Intensity
 * Measures 24h volume relative to TVL. High volume/TVL = active trading = conviction.
 * Very high ratios lean slightly bullish (activity often accompanies upward momentum).
 * Low ratios = neutral/stagnant.
 */
function computeVolumeIntensity(pool: AppPool): SignalReading {
  const volTvlRatio = pool.tvlUsd > 0 ? pool.volume24hUsd / pool.tvlUsd : 0;

  // Map ratio to score: 0% = -20, 10% = 0, 50% = +30, 100%+ = +50
  let rawScore: number;
  if (volTvlRatio < 0.10) {
    rawScore = -20 + (volTvlRatio / 0.10) * 20; // -20 to 0
  } else if (volTvlRatio < 0.50) {
    rawScore = ((volTvlRatio - 0.10) / 0.40) * 30; // 0 to 30
  } else {
    rawScore = 30 + Math.min((volTvlRatio - 0.50) / 0.50, 1) * 20; // 30 to 50
  }

  const score = Math.max(-100, Math.min(100, Math.round(rawScore)));
  const direction = score > 10 ? "BULLISH" : score < -10 ? "BEARISH" : "NEUTRAL";
  const pct = (volTvlRatio * 100).toFixed(1);

  return {
    name: "Volume Intensity",
    value: Math.round(volTvlRatio * 1000) / 1000,
    score,
    weight: SIGNAL_WEIGHTS.volumeIntensity,
    direction,
    explanation: `24h volume/TVL ratio: ${pct}% — ${volTvlRatio > 0.50 ? "high activity" : volTvlRatio > 0.10 ? "moderate activity" : "low activity"}`,
  };
}

/**
 * Signal 5: Liquidity Concentration (Gini)
 * Measures how concentrated liquidity is across bins.
 * High Gini (concentrated) = strong conviction in current price range.
 * Low Gini (spread out) = uncertainty, hedging.
 * Concentrated + directional = amplifies other signals.
 * Concentrated + neutral = stability.
 */
function computeConcentration(bins: BinData[]): SignalReading {
  if (bins.length < 2) {
    return {
      name: "Concentration",
      value: 0,
      score: 0,
      weight: SIGNAL_WEIGHTS.concentration,
      direction: "NEUTRAL",
      explanation: "Insufficient bins for concentration analysis",
    };
  }

  // Gini coefficient of bin USD values
  const values = bins.map(b => b.totalUsd).sort((a, b) => a - b);
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;

  if (mean <= 0) {
    return {
      name: "Concentration",
      value: 0,
      score: 0,
      weight: SIGNAL_WEIGHTS.concentration,
      direction: "NEUTRAL",
      explanation: "No meaningful liquidity for Gini calculation",
    };
  }

  let sumDiffs = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumDiffs += Math.abs(values[i] - values[j]);
    }
  }
  const gini = sumDiffs / (2 * n * n * mean);

  // High Gini = concentrated = conviction (slightly bullish bias, as concentrated
  // liquidity often accompanies directional moves)
  // Score: Gini 0 = -10, Gini 0.5 = 0, Gini 0.8+ = +20
  const rawScore = (gini - 0.5) * 66; // maps 0.5 to 0, 0.8 to ~20
  const score = Math.max(-100, Math.min(100, Math.round(rawScore)));
  const direction = score > 10 ? "BULLISH" : score < -10 ? "BEARISH" : "NEUTRAL";

  return {
    name: "Concentration",
    value: Math.round(gini * 1000) / 1000,
    score,
    weight: SIGNAL_WEIGHTS.concentration,
    direction,
    explanation: `Gini: ${gini.toFixed(3)} — ${gini > 0.7 ? "highly concentrated (strong conviction)" : gini > 0.4 ? "moderately concentrated" : "spread out (uncertain)"}`,
  };
}

// ── Analysis Engine ───────────────────────────────────────────────────────────

function analyzePool(
  pool: AppPool,
  activeBinId: number,
  bins: BinData[]
): SentimentAnalysis {
  // Compute all signals
  const signals: SignalReading[] = [
    computeReserveAsymmetry(bins, activeBinId),
    computeInventoryPressure(bins, activeBinId),
    computeBinDrift(bins, activeBinId),
    computeVolumeIntensity(pool),
    computeConcentration(bins),
  ];

  // Weighted composite score
  const compositeScore = Math.round(
    signals.reduce((s, sig) => s + sig.score * sig.weight, 0)
  );

  const sentiment = classifySentiment(compositeScore);

  // Signal agreement: fraction of non-neutral signals pointing in the same direction
  const directional = signals.filter(s => s.direction !== "NEUTRAL");
  const bullishCount = directional.filter(s => s.direction === "BULLISH").length;
  const bearishCount = directional.filter(s => s.direction === "BEARISH").length;
  const majorityCount = Math.max(bullishCount, bearishCount);
  const signalAgreement = directional.length > 0
    ? majorityCount / directional.length
    : 0.5;

  // Confidence: based on signal agreement and magnitude
  const magnitudeConf = Math.min(Math.abs(compositeScore) / 60, 1.0);
  const agreementConf = signalAgreement;
  const confidence = Math.round((magnitudeConf * 0.4 + agreementConf * 0.6) * 100);

  // Dominant signal: highest abs weighted contribution
  const dominant = signals.reduce((best, sig) => {
    const contrib = Math.abs(sig.score * sig.weight);
    const bestContrib = Math.abs(best.score * best.weight);
    return contrib > bestContrib ? sig : best;
  });

  // Reasoning
  const dirStr = compositeScore > 0 ? "bullish" : compositeScore < 0 ? "bearish" : "neutral";
  const agreePct = Math.round(signalAgreement * 100);
  const reasoning = `Composite sentiment: ${compositeScore > 0 ? "+" : ""}${compositeScore}/100 (${sentiment}). ${directional.length > 0 ? `${agreePct}% of directional signals agree (${bullishCount} bullish, ${bearishCount} bearish).` : "No strong directional signals."} Dominant signal: ${dominant.name} (${dominant.direction}, score ${dominant.score > 0 ? "+" : ""}${dominant.score}). ${confidence >= 70 ? "High confidence — signals align." : confidence >= 40 ? "Moderate confidence — mixed signals." : "Low confidence — signals diverge."}`;

  // Competition score
  const compositeMagnitude = Math.min(Math.abs(compositeScore), 100);
  const signalDiversity = Math.round(
    (new Set(signals.map(s => s.direction)).size / 3) * 100
  );

  return {
    poolId: pool.poolId,
    pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
    tvlUsd: Math.round(pool.tvlUsd),
    volume24hUsd: Math.round(pool.volume24hUsd),
    activeBinId,
    signals,
    compositeScore,
    sentiment,
    confidence,
    signalAgreement: Math.round(signalAgreement * 1000) / 1000,
    dominantSignal: dominant.name,
    reasoning,
    competition_score: {
      signal_count: signals.length,
      composite_magnitude: compositeMagnitude,
      confidence_score: confidence,
      signal_diversity: signalDiversity,
      composite: Math.round(
        compositeMagnitude * 0.3 +
        confidence * 0.3 +
        signalDiversity * 0.2 +
        signals.length * 4 * 0.2
      ),
    },
  };
}

// ── ASCII Visualization ────────────────────────────────────────────────────────

function renderSignalGauge(analysis: SentimentAnalysis): string {
  const lines: string[] = [];

  lines.push(`  ${analysis.pair} — Sentiment Index`);
  lines.push("  " + "-".repeat(60));

  // Gauge: -100 ====[===|====]===== +100
  const gaugeWidth = 40;
  const center = gaugeWidth / 2;
  const pos = Math.round(((analysis.compositeScore + 100) / 200) * gaugeWidth);
  let gauge = "";
  for (let i = 0; i <= gaugeWidth; i++) {
    if (i === pos) gauge += "*";
    else if (i === center) gauge += "|";
    else gauge += "-";
  }
  lines.push(`  -100 ${gauge} +100`);
  lines.push(`  Score: ${analysis.compositeScore > 0 ? "+" : ""}${analysis.compositeScore}  Sentiment: ${analysis.sentiment}  Confidence: ${analysis.confidence}%`);
  lines.push("");

  // Signal breakdown
  lines.push(`  ${"Signal".padEnd(22)}  ${"Dir".padEnd(8)}  ${"Score".padStart(6)}  ${"Wt".padStart(4)}  Explanation`);
  lines.push("  " + "-".repeat(80));

  for (const sig of analysis.signals) {
    const dirStr = sig.direction.padEnd(8);
    const scoreStr = (sig.score > 0 ? "+" : "") + sig.score.toString();
    const wtStr = (sig.weight * 100).toFixed(0) + "%";
    lines.push(`  ${sig.name.padEnd(22)}  ${dirStr}  ${scoreStr.padStart(6)}  ${wtStr.padStart(4)}  ${sig.explanation}`);
  }

  lines.push("  " + "-".repeat(80));
  return lines.join("\n") + "\n";
}

// ── Command Handlers ────────────────────────────────────────────────────────────

async function runDoctor(): Promise<void> {
  const results: Record<string, string> = {};

  try {
    await fetchJson(`${BFF_APP_BASE}/dlmm/pools`);
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

  console.log(
    JSON.stringify({
      tool: "hodlmm-sentiment-index",
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
      tool: "hodlmm-sentiment-index",
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
      tool: "hodlmm-sentiment-index",
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
      tool: "hodlmm-sentiment-index",
      command: "run",
      timestamp: new Date().toISOString(),
      error: `Pool ${poolId} not found or below TVL threshold ($${MIN_TVL_USD})`,
    }));
    return;
  }

  const activeBinId = pool.activeBinId || await getActiveBinId(poolId);
  if (!activeBinId) {
    console.log(JSON.stringify({
      tool: "hodlmm-sentiment-index",
      command: "run",
      timestamp: new Date().toISOString(),
      error: `Could not determine active bin for pool ${poolId}`,
    }));
    return;
  }

  const bins = await fetchBinData(poolId, activeBinId, pool);
  const analysis = analyzePool(pool, activeBinId, bins);

  if (options.json) {
    console.log(JSON.stringify({
      tool: "hodlmm-sentiment-index",
      command: "run",
      timestamp: new Date().toISOString(),
      ...analysis,
      binsScanned: BIN_SCAN_RADIUS * 2 + 1,
      binsWithLiquidity: bins.length,
    }, null, 2));
    return;
  }

  const gauge = renderSignalGauge(analysis);
  console.log(`\n  HODLMM Sentiment Index — Pool ${poolId} (${analysis.pair})`);
  console.log(`  TVL: ${formatUsd(analysis.tvlUsd)}  |  24h Vol: ${formatUsd(analysis.volume24hUsd)}  |  Active Bin: ${activeBinId}\n`);
  console.log(gauge);
  console.log(`  Dominant Signal: ${analysis.dominantSignal}`);
  console.log(`  Signal Agreement: ${Math.round(analysis.signalAgreement * 100)}%`);
  console.log(`\n  ${analysis.reasoning}\n`);
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
      tool: "hodlmm-sentiment-index",
      command: "scan",
      timestamp: new Date().toISOString(),
      error: "No pools found above TVL threshold",
    }));
    return;
  }

  const candidates = [...pools]
    .sort((a, b) => b.tvlUsd - a.tvlUsd)
    .slice(0, topN * 2);

  const results: SentimentAnalysis[] = [];

  for (const pool of candidates) {
    try {
      const activeBinId = pool.activeBinId || await getActiveBinId(pool.poolId);
      if (!activeBinId) continue;
      const bins = await fetchBinData(pool.poolId, activeBinId, pool);
      if (bins.length === 0) continue;
      results.push(analyzePool(pool, activeBinId, bins));
    } catch { /* skip */ }
  }

  // Sort by absolute sentiment (most extreme first — most interesting)
  results.sort((a, b) => Math.abs(b.compositeScore) - Math.abs(a.compositeScore));
  const ranked = results.slice(0, topN);

  const summary = {
    bullishPools: ranked.filter(r => r.compositeScore > BULL_THRESHOLD).length,
    bearishPools: ranked.filter(r => r.compositeScore < BEAR_THRESHOLD).length,
    neutralPools: ranked.filter(r => Math.abs(r.compositeScore) <= BULL_THRESHOLD).length,
    avgSentiment: ranked.length > 0
      ? Math.round(ranked.reduce((s, r) => s + r.compositeScore, 0) / ranked.length)
      : 0,
    avgConfidence: ranked.length > 0
      ? Math.round(ranked.reduce((s, r) => s + r.confidence, 0) / ranked.length)
      : 0,
    strongestSignal: ranked.length > 0
      ? `${ranked[0].pair}: ${ranked[0].sentiment} (${ranked[0].compositeScore > 0 ? "+" : ""}${ranked[0].compositeScore})`
      : "none",
  };

  if (options.json) {
    console.log(JSON.stringify({
      tool: "hodlmm-sentiment-index",
      command: "scan",
      timestamp: new Date().toISOString(),
      poolsScanned: results.length,
      results: ranked,
      summary,
    }, null, 2));
    return;
  }

  console.log(`\n  HODLMM Sentiment Index — Top ${topN} Pools by Sentiment Strength`);
  console.log(`  Scanned ${results.length} pools above ${formatUsd(minTvl)} TVL\n`);
  console.log(`  ${"Pool".padEnd(6)}  ${"Pair".padEnd(16)}  ${"TVL".padStart(10)}  ${"Score".padStart(6)}  ${"Sentiment".padEnd(12)}  ${"Conf".padStart(4)}  Dominant Signal`);
  console.log("  " + "-".repeat(82));

  for (const r of ranked) {
    const scoreStr = (r.compositeScore > 0 ? "+" : "") + r.compositeScore.toString();
    console.log(
      `  ${String(r.poolId).padEnd(6)}  ${r.pair.padEnd(16)}  ${formatUsd(r.tvlUsd).padStart(10)}  ${scoreStr.padStart(6)}  ${r.sentiment.padEnd(12)}  ${(r.confidence + "%").padStart(4)}  ${r.dominantSignal}`
    );
  }

  console.log("  " + "-".repeat(82));
  console.log(`\n  Market Overview: ${summary.bullishPools} bullish, ${summary.bearishPools} bearish, ${summary.neutralPools} neutral`);
  console.log(`  Avg Sentiment: ${summary.avgSentiment > 0 ? "+" : ""}${summary.avgSentiment}  |  Avg Confidence: ${summary.avgConfidence}%`);
  console.log(`  Strongest: ${summary.strongestSignal}`);

  if (summary.avgSentiment > BULL_THRESHOLD) {
    console.log(`\n  Market Mood: Broadly BULLISH across top pools — consider adding liquidity.`);
  } else if (summary.avgSentiment < BEAR_THRESHOLD) {
    console.log(`\n  Market Mood: Broadly BEARISH — consider widening ranges or reducing exposure.`);
  } else {
    console.log(`\n  Market Mood: Mixed/NEUTRAL — monitor signals for emerging trends.`);
  }
  console.log();
}

// ── CLI Setup ──────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-sentiment-index")
  .description(
    "HODLMM Sentiment Index — Composite market sentiment from on-chain DLMM signals"
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
  .description("Analyze market sentiment for a specific HODLMM pool")
  .requiredOption("--pool <id>", "HODLMM pool ID to analyze")
  .option("--json", "Output raw JSON instead of formatted report")
  .action(runAnalyze);

program
  .command("scan")
  .description("Scan top pools and rank by sentiment strength")
  .option("--top <n>", "Number of top pools to display", "5")
  .option("--min-tvl <usd>", "Minimum TVL threshold in USD", String(MIN_TVL_USD))
  .option("--json", "Output raw JSON instead of formatted table")
  .action(runScan);

program.parse();
