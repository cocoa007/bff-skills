#!/usr/bin/env bun
/**
 * hodlmm-bin-shift.ts
 *
 * HODLMM Active Bin Shift Tracker — Monitors how the active bin (price center)
 * has migrated within HODLMM liquidity pools by analyzing reserve asymmetry
 * patterns across the bin range. Detects price behavior regimes and computes
 * bin migration velocity to inform LP positioning decisions.
 *
 * Key metrics:
 *  - Reserve asymmetry ratio (token-X vs token-Y distribution)
 *  - Bin migration velocity (bins shifted per unit of reserve imbalance)
 *  - Price regime classification: TRENDING, MEAN-REVERTING, or RANGING
 *  - Shift risk score (0-100, higher = more volatile bin movement)
 *  - Optimal position width recommendation based on observed patterns
 *  - ASCII bar chart visualization of reserve distribution around active bin
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 42).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 20; // Scan ±20 bins around active bin

// Regime classification thresholds
const TRENDING_ASYMMETRY_THRESHOLD = 0.72;    // >72% of reserves on one side
const RANGING_ASYMMETRY_THRESHOLD = 0.58;     // 42–58% on each side = RANGING

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
  offsetFromActive: number; // negative = below active (token-X side), positive = above
  reserveX: bigint;
  reserveY: bigint;
  reserveXUsd: number;
  reserveYUsd: number;
  totalUsd: number;
}

type PriceRegime = "TRENDING_UP" | "TRENDING_DOWN" | "MEAN_REVERTING" | "RANGING";

interface ShiftAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  activeBinId: number;
  binStep: number; // in BPS

  // Reserve distribution
  totalBinsWithLiquidity: number;
  binsAboveActive: number;  // token-Y heavy (price has room to go up)
  binsBelowActive: number;  // token-X heavy (price has room to go down)
  reserveXTotalUsd: number; // total reserves on token-X side
  reserveYTotalUsd: number; // total reserves on token-Y side
  reserveAsymmetryRatio: number; // 0.5 = balanced, 1.0 = all one side

  // Shift signals
  weightedBinCenter: number;  // liquidity-weighted bin center (vs activeBinId)
  centerOffset: number;       // weightedBinCenter - activeBinId (+ means price drifted up)
  migrationVelocity: number;  // |centerOffset| normalized by scan radius
  shiftDirection: "UP" | "DOWN" | "NEUTRAL";

  // Regime
  regime: PriceRegime;
  regimeConfidence: number; // 0–1

  // Risk score
  shiftRiskScore: number; // 0–100

  // Recommendations
  recommendedBinWidth: number; // bins on each side of active
  reasoning: string;

  // Competition scoring
  competition_score: {
    shift_risk_normalized: number;        // 0–100
    asymmetry_score: number;              // 0–100 (100 = maximally unbalanced)
    migration_velocity_score: number;     // 0–100 (100 = fast migration)
    regime_clarity_score: number;         // 0–100 (100 = clear regime signal)
    composite: number;                    // weighted average
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

/**
 * Parse a Clarity response value. Handles ok-wrapped uints and plain uints.
 * Returns 0 if the value is none, err, or unrecognized.
 */
function parseUintResult(result: any): number {
  if (!result?.result) return 0;
  const hex = result.result.replace("0x", "");
  // ok-wrapped uint: 07 followed by 01 + 16-byte value
  if (hex.startsWith("07")) {
    const inner = hex.slice(2);
    if (inner.startsWith("01")) {
      return parseInt(inner.slice(2), 16) || 0;
    }
    return parseInt(inner, 16) || 0;
  }
  // plain uint: 01 + 16-byte value
  if (hex.startsWith("01")) return parseInt(hex.slice(2), 16) || 0;
  return 0;
}

/**
 * Parse a tuple response from get-bin-reserves or similar calls.
 * Returns { reserveX, reserveY } as bigints.
 */
function parseBinReservesTuple(result: any): { reserveX: bigint; reserveY: bigint } | null {
  if (!result?.result) return null;
  const raw = result.result as string;
  // Clarity tuple encoding: 0x0c<count><key1><val1><key2><val2>...
  // We look for two consecutive uint values in the hex string.
  // Simpler approach: scan for "01" prefixed 16-byte segments.
  try {
    const hex = raw.replace("0x", "");
    if (hex.startsWith("0a") || hex === "09") return null; // none or err

    // Find all uint values in the response (01 + 16 hex bytes = 34 hex chars total)
    const uintPattern = /01([0-9a-f]{32})/gi;
    const matches: bigint[] = [];
    let m: RegExpExecArray | null;
    while ((m = uintPattern.exec(hex)) !== null) {
      matches.push(BigInt("0x" + m[1]));
    }
    if (matches.length >= 2) {
      return { reserveX: matches[0], reserveY: matches[1] };
    }
  } catch {
    // fall through
  }
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

/**
 * Fetch bin-level reserve data for a pool around its active bin.
 * Tries get-bin-reserves first, falls back to get-bin (simpler).
 */
async function fetchBinData(
  poolId: number,
  activeBinId: number,
  pool: AppPool
): Promise<BinData[]> {
  const bins: BinData[] = [];
  const start = activeBinId - BIN_SCAN_RADIUS;
  const end = activeBinId + BIN_SCAN_RADIUS;

  // Determine USD price per unit for token0 and token1
  const priceX = pool.token0PriceUsd;
  const priceY = pool.token1PriceUsd;
  const decX = pool.token0Decimals;
  const decY = pool.token1Decimals;

  for (let binId = start; binId <= end; binId++) {
    try {
      // Try get-bin-reserves(pool-id, bin-id)
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
    } catch {
      // Bin does not exist or read failed — skip silently
    }
  }

  return bins;
}

// ── Shift Analysis ─────────────────────────────────────────────────────────────

/**
 * Classify price regime from reserve distribution.
 *
 * In a HODLMM DLMM pool:
 * - Bins BELOW active hold mostly token-X (base asset)
 * - Bins ABOVE active hold mostly token-Y (quote asset)
 * - If most reserves are on one side, price has been moving toward that side
 *   (trending in that direction or has recently passed through)
 *
 * Reserve asymmetry patterns:
 * - TRENDING_UP: Y-side is heavily depleted, X-side has large reserves
 *   (price moved up, consuming Y along the way)
 * - TRENDING_DOWN: X-side is heavily depleted, Y-side has large reserves
 *   (price moved down, consuming X along the way)
 * - RANGING: Balanced distribution on both sides of active bin
 * - MEAN_REVERTING: Moderate asymmetry but weighted bin center near active
 *   (price oscillates around a stable center)
 */
function classifyRegime(
  bins: BinData[],
  activeBinId: number
): { regime: PriceRegime; confidence: number } {
  if (bins.length < 3) return { regime: "RANGING", confidence: 0.4 };

  const totalUsd = bins.reduce((s, b) => s + b.totalUsd, 0);
  if (totalUsd <= 0) return { regime: "RANGING", confidence: 0.4 };

  // Split into below-active and above-active
  const belowBins = bins.filter((b) => b.binId < activeBinId);
  const aboveBins = bins.filter((b) => b.binId > activeBinId);

  const belowUsd = belowBins.reduce((s, b) => s + b.totalUsd, 0);
  const aboveUsd = aboveBins.reduce((s, b) => s + b.totalUsd, 0);
  const sideTotal = belowUsd + aboveUsd;

  if (sideTotal <= 0) return { regime: "RANGING", confidence: 0.4 };

  const belowFrac = belowUsd / sideTotal;
  const aboveFrac = aboveUsd / sideTotal;

  // Liquidity-weighted center of mass
  let weightedSum = 0;
  let weightTotal = 0;
  for (const b of bins) {
    weightedSum += b.offsetFromActive * b.totalUsd;
    weightTotal += b.totalUsd;
  }
  const weightedCenter = weightTotal > 0 ? weightedSum / weightTotal : 0;

  if (belowFrac >= TRENDING_ASYMMETRY_THRESHOLD) {
    // Most liquidity below active: price trended UP through these bins, depleting Y above
    const confidence = Math.min((belowFrac - TRENDING_ASYMMETRY_THRESHOLD) / (1 - TRENDING_ASYMMETRY_THRESHOLD), 1.0);
    return { regime: "TRENDING_UP", confidence: 0.5 + confidence * 0.5 };
  }

  if (aboveFrac >= TRENDING_ASYMMETRY_THRESHOLD) {
    // Most liquidity above active: price trended DOWN
    const confidence = Math.min((aboveFrac - TRENDING_ASYMMETRY_THRESHOLD) / (1 - TRENDING_ASYMMETRY_THRESHOLD), 1.0);
    return { regime: "TRENDING_DOWN", confidence: 0.5 + confidence * 0.5 };
  }

  const maxFrac = Math.max(belowFrac, aboveFrac);
  if (maxFrac <= RANGING_ASYMMETRY_THRESHOLD && Math.abs(weightedCenter) <= 3) {
    // Balanced and centered — RANGING
    const confidence = 1.0 - (maxFrac - 0.5) / (RANGING_ASYMMETRY_THRESHOLD - 0.5);
    return { regime: "RANGING", confidence: 0.5 + confidence * 0.5 };
  }

  // Moderate asymmetry — MEAN_REVERTING
  const confidence = 1.0 - Math.abs(Math.abs(weightedCenter) - BIN_SCAN_RADIUS / 3) / (BIN_SCAN_RADIUS / 3);
  return { regime: "MEAN_REVERTING", confidence: Math.max(0.4, Math.min(0.9, confidence)) };
}

/**
 * Compute bin shift risk score (0–100).
 *
 * Higher score means higher risk of the active bin moving out of range:
 * - Trending regime + high migration velocity = high risk
 * - Ranging + low asymmetry = low risk
 * - Mean-reverting = moderate risk
 */
function computeShiftRiskScore(
  regime: PriceRegime,
  migrationVelocity: number, // 0–1
  asymmetryRatio: number     // 0.5–1.0
): number {
  const asymmetryContribution = (asymmetryRatio - 0.5) / 0.5 * 40; // 0–40
  const velocityContribution = migrationVelocity * 35;              // 0–35

  let regimeBase: number;
  switch (regime) {
    case "TRENDING_UP":
    case "TRENDING_DOWN":
      regimeBase = 25;
      break;
    case "MEAN_REVERTING":
      regimeBase = 12;
      break;
    case "RANGING":
      regimeBase = 5;
      break;
  }

  return Math.min(100, Math.round(regimeBase + asymmetryContribution + velocityContribution));
}

/**
 * Recommend a bin width (bins on each side of active bin) based on regime.
 *
 * - TRENDING: wide range to avoid frequent out-of-range exits
 * - RANGING: narrow range to maximize fee density per bin
 * - MEAN_REVERTING: medium range
 */
function recommendBinWidth(regime: PriceRegime, migrationVelocity: number): number {
  if (regime === "TRENDING_UP" || regime === "TRENDING_DOWN") {
    if (migrationVelocity > 0.6) return 15;
    return 10;
  }
  if (regime === "MEAN_REVERTING") return 7;
  // RANGING
  if (migrationVelocity < 0.2) return 4;
  return 5;
}

function analyzePool(
  poolId: number,
  pool: AppPool,
  activeBinId: number,
  bins: BinData[]
): ShiftAnalysis {
  const binStep = pool.binStep ?? 100;
  const totalUsd = bins.reduce((s, b) => s + b.totalUsd, 0);

  const binsAbove = bins.filter((b) => b.binId > activeBinId);
  const binsBelow = bins.filter((b) => b.binId < activeBinId);

  const reserveXTotalUsd = bins.reduce((s, b) => s + b.reserveXUsd, 0);
  const reserveYTotalUsd = bins.reduce((s, b) => s + b.reserveYUsd, 0);

  // Asymmetry based on below/above split
  const belowUsd = binsBelow.reduce((s, b) => s + b.totalUsd, 0);
  const aboveUsd = binsAbove.reduce((s, b) => s + b.totalUsd, 0);
  const sideTotal = belowUsd + aboveUsd;

  const asymmetryRatio = sideTotal > 0
    ? Math.max(belowUsd, aboveUsd) / sideTotal
    : 0.5;

  // Weighted bin center
  let weightedSum = 0;
  let weightTotal = 0;
  for (const b of bins) {
    weightedSum += b.offsetFromActive * b.totalUsd;
    weightTotal += b.totalUsd;
  }
  const weightedBinCenter = weightTotal > 0 ? weightedSum / weightTotal : 0;
  const centerOffset = weightedBinCenter;

  // Migration velocity: |centerOffset| normalized to scan radius
  const migrationVelocity = Math.min(Math.abs(centerOffset) / BIN_SCAN_RADIUS, 1.0);

  const shiftDirection: "UP" | "DOWN" | "NEUTRAL" =
    centerOffset > 1 ? "UP" :
    centerOffset < -1 ? "DOWN" :
    "NEUTRAL";

  const { regime, confidence: regimeConfidence } = classifyRegime(bins, activeBinId);
  const shiftRiskScore = computeShiftRiskScore(regime, migrationVelocity, asymmetryRatio);
  const recommendedBinWidth = recommendBinWidth(regime, migrationVelocity);

  // Reasoning
  let reasoning: string;
  const asymPct = Math.round(asymmetryRatio * 100);
  const centerStr = Math.abs(centerOffset) < 0.5
    ? "centered near active bin"
    : `offset ${centerOffset.toFixed(1)} bins ${shiftDirection === "UP" ? "above" : "below"} active`;

  if (regime === "TRENDING_UP") {
    reasoning = `${asymPct}% of reserves below active — price has been trending UP. Liquidity-weighted center is ${centerStr}. Use ${recommendedBinWidth} bins each side to avoid frequent range exits. Risk: ${shiftRiskScore}/100.`;
  } else if (regime === "TRENDING_DOWN") {
    reasoning = `${asymPct}% of reserves above active — price has been trending DOWN. Liquidity-weighted center is ${centerStr}. Use ${recommendedBinWidth} bins each side to avoid frequent range exits. Risk: ${shiftRiskScore}/100.`;
  } else if (regime === "MEAN_REVERTING") {
    reasoning = `Reserve distribution is moderately asymmetric (${asymPct}% on dominant side) but price reverts. Center is ${centerStr}. Use ${recommendedBinWidth} bins each side to capture reversions. Risk: ${shiftRiskScore}/100.`;
  } else {
    reasoning = `Reserves are well-balanced (${asymPct}% on dominant side) — RANGING behavior. Price oscillates tightly around active bin. Use ${recommendedBinWidth} bins each side for maximum fee density. Risk: ${shiftRiskScore}/100.`;
  }

  // Competition score
  const asymmetryScore = Math.round((asymmetryRatio - 0.5) / 0.5 * 100);
  const migrationVelocityScore = Math.round(migrationVelocity * 100);
  const regimeClarityScore = Math.round(regimeConfidence * 100);
  const composite = Math.round(
    shiftRiskScore * 0.4 +
    asymmetryScore * 0.2 +
    migrationVelocityScore * 0.2 +
    regimeClarityScore * 0.2
  );

  return {
    poolId,
    pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
    tvlUsd: Math.round(pool.tvlUsd),
    activeBinId,
    binStep,
    totalBinsWithLiquidity: bins.length,
    binsAboveActive: binsAbove.length,
    binsBelowActive: binsBelow.length,
    reserveXTotalUsd: Math.round(reserveXTotalUsd * 100) / 100,
    reserveYTotalUsd: Math.round(reserveYTotalUsd * 100) / 100,
    reserveAsymmetryRatio: Math.round(asymmetryRatio * 1000) / 1000,
    weightedBinCenter: Math.round(weightedBinCenter * 100) / 100,
    centerOffset: Math.round(centerOffset * 100) / 100,
    migrationVelocity: Math.round(migrationVelocity * 1000) / 1000,
    shiftDirection,
    regime,
    regimeConfidence: Math.round(regimeConfidence * 100) / 100,
    shiftRiskScore,
    recommendedBinWidth,
    reasoning,
    competition_score: {
      shift_risk_normalized: shiftRiskScore,
      asymmetry_score: asymmetryScore,
      migration_velocity_score: migrationVelocityScore,
      regime_clarity_score: regimeClarityScore,
      composite,
    },
  };
}

// ── ASCII Visualization ────────────────────────────────────────────────────────

function renderBinChart(
  bins: BinData[],
  activeBinId: number,
  pair: string,
  regime: PriceRegime,
  shiftRiskScore: number
): string {
  if (bins.length === 0) return "  [no bin data available]\n";

  const maxUsd = Math.max(...bins.map((b) => b.totalUsd), 0.01);
  const lines: string[] = [];

  lines.push(`  ${pair} — Active Bin: ${activeBinId}  Regime: ${regime}  Risk: ${shiftRiskScore}/100`);
  lines.push("  " + "─".repeat(58));
  lines.push(`  ${"Offset".padStart(7)}  ${"Bin ID".padEnd(7)}  ${"Reserves".padEnd(22)}  USD`);
  lines.push("  " + "─".repeat(58));

  // Render from top (+) to bottom (-)
  const sorted = [...bins].sort((a, b) => b.binId - a.binId);

  for (const b of sorted) {
    const isActive = b.binId === activeBinId;
    const offsetStr = (b.offsetFromActive >= 0 ? "+" : "") + b.offsetFromActive.toString().padStart(3);
    const binStr = b.binId.toString().padEnd(7);
    const barStr = bar(b.totalUsd, maxUsd, 22);
    const usdStr = formatUsd(b.totalUsd).padStart(8);
    const marker = isActive ? " ◄ ACTIVE" : "";
    lines.push(`  ${offsetStr.padStart(7)}  ${binStr}  ${barStr}  ${usdStr}${marker}`);
  }

  lines.push("  " + "─".repeat(58));
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
      tool: "hodlmm-bin-shift",
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
      tool: "hodlmm-bin-shift",
      command: "install-packs",
      status: "ok",
      message: "No additional dependencies required. Uses commander (workspace) + native fetch.",
      timestamp: new Date().toISOString(),
    })
  );
}

/**
 * Analyze a single pool's bin shift patterns.
 */
async function runAnalyze(options: {
  pool: string;
  json?: boolean;
}): Promise<void> {
  const poolId = parseInt(options.pool);
  if (isNaN(poolId)) {
    console.log(JSON.stringify({
      tool: "hodlmm-bin-shift",
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
      tool: "hodlmm-bin-shift",
      command: "run",
      timestamp: new Date().toISOString(),
      error: `Pool ${poolId} not found or below TVL threshold ($${MIN_TVL_USD})`,
    }));
    return;
  }

  const activeBinId = pool.activeBinId || await getActiveBinId(poolId);
  if (!activeBinId) {
    console.log(JSON.stringify({
      tool: "hodlmm-bin-shift",
      command: "run",
      timestamp: new Date().toISOString(),
      error: `Could not determine active bin for pool ${poolId}`,
    }));
    return;
  }

  const bins = await fetchBinData(poolId, activeBinId, pool);
  const analysis = analyzePool(poolId, pool, activeBinId, bins);

  if (options.json) {
    console.log(JSON.stringify({
      tool: "hodlmm-bin-shift",
      command: "run",
      timestamp: new Date().toISOString(),
      ...analysis,
      binsScanned: BIN_SCAN_RADIUS * 2 + 1,
      binsWithLiquidity: bins.length,
    }, null, 2));
    return;
  }

  // Human-readable output
  const chart = renderBinChart(bins, activeBinId, analysis.pair, analysis.regime, analysis.shiftRiskScore);
  console.log(`\n  HODLMM Bin Shift Tracker — Pool ${poolId} (${analysis.pair})`);
  console.log(`  TVL: ${formatUsd(analysis.tvlUsd)}  |  Active Bin: ${activeBinId}  |  Bin Step: ${analysis.binStep} bps\n`);
  console.log(chart);
  console.log(`  Regime:           ${analysis.regime} (confidence: ${(analysis.regimeConfidence * 100).toFixed(0)}%)`);
  console.log(`  Shift Direction:  ${analysis.shiftDirection}  (center offset: ${analysis.centerOffset > 0 ? "+" : ""}${analysis.centerOffset} bins)`);
  console.log(`  Asymmetry Ratio:  ${(analysis.reserveAsymmetryRatio * 100).toFixed(1)}% dominant side`);
  console.log(`  Migration Vel.:   ${(analysis.migrationVelocity * 100).toFixed(1)}% of scan radius`);
  console.log(`  Shift Risk Score: ${analysis.shiftRiskScore}/100`);
  console.log(`  Recommended Width: ±${analysis.recommendedBinWidth} bins`);
  console.log(`\n  Analysis: ${analysis.reasoning}\n`);
  console.log(`  Competition Score: ${analysis.competition_score.composite}/100`);
  console.log();
}

/**
 * Scan top N pools by TVL and rank them by shift risk.
 */
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
      tool: "hodlmm-bin-shift",
      command: "scan",
      timestamp: new Date().toISOString(),
      error: "No pools found above TVL threshold",
    }));
    return;
  }

  // Sort by TVL descending, take up to topN * 2 candidates for processing
  const candidates = [...pools]
    .sort((a, b) => b.tvlUsd - a.tvlUsd)
    .slice(0, topN * 2);

  const results: ShiftAnalysis[] = [];

  for (const pool of candidates) {
    try {
      const activeBinId = pool.activeBinId || await getActiveBinId(pool.poolId);
      if (!activeBinId) continue;

      const bins = await fetchBinData(pool.poolId, activeBinId, pool);
      if (bins.length === 0) continue;

      const analysis = analyzePool(pool.poolId, pool, activeBinId, bins);
      results.push(analysis);
    } catch {
      // Skip pools that error
    }
  }

  // Sort by shift risk descending (most risky first — most actionable)
  results.sort((a, b) => b.shiftRiskScore - a.shiftRiskScore);
  const ranked = results.slice(0, topN);

  const summary = {
    trending: ranked.filter((r) => r.regime.startsWith("TRENDING")).length,
    ranging: ranked.filter((r) => r.regime === "RANGING").length,
    meanReverting: ranked.filter((r) => r.regime === "MEAN_REVERTING").length,
    avgShiftRisk: ranked.length > 0
      ? Math.round(ranked.reduce((s, r) => s + r.shiftRiskScore, 0) / ranked.length)
      : 0,
    highRiskPools: ranked.filter((r) => r.shiftRiskScore >= 60).length,
    topRiskPool: ranked.length > 0 ? ranked[0].pair : null,
  };

  if (options.json) {
    console.log(JSON.stringify({
      tool: "hodlmm-bin-shift",
      command: "scan",
      timestamp: new Date().toISOString(),
      poolsScanned: results.length,
      results: ranked,
      summary,
    }, null, 2));
    return;
  }

  // Human-readable table output
  console.log(`\n  HODLMM Active Bin Shift Tracker — Top ${topN} Pools by Shift Risk`);
  console.log(`  Scanned ${results.length} pools above $${minTvl.toLocaleString()} TVL\n`);
  console.log(`  ${"Pool".padEnd(6)}  ${"Pair".padEnd(16)}  ${"TVL".padStart(10)}  ${"Regime".padEnd(16)}  ${"Risk".padStart(4)}  ${"Dir".padEnd(7)}  ${"Width"}`);
  console.log("  " + "─".repeat(78));

  for (const r of ranked) {
    const tvlStr = formatUsd(r.tvlUsd).padStart(10);
    const riskStr = String(r.shiftRiskScore).padStart(4);
    const dirStr = r.shiftDirection.padEnd(7);
    const regimeStr = r.regime.padEnd(16);
    const pairStr = r.pair.padEnd(16);
    const widthStr = `±${r.recommendedBinWidth}`;
    console.log(`  ${String(r.poolId).padEnd(6)}  ${pairStr}  ${tvlStr}  ${regimeStr}  ${riskStr}  ${dirStr}  ${widthStr}`);
  }

  console.log("  " + "─".repeat(78));
  console.log(`\n  Summary: ${summary.trending} TRENDING, ${summary.ranging} RANGING, ${summary.meanReverting} MEAN-REVERTING`);
  console.log(`  Avg Shift Risk: ${summary.avgShiftRisk}/100  |  High-Risk Pools (≥60): ${summary.highRiskPools}`);

  if (summary.trending > 0) {
    console.log(`\n  Tip: ${summary.trending} pool(s) showing trending behavior — widen positions to avoid range exits.`);
  } else if (summary.ranging > ranked.length / 2) {
    console.log(`\n  Tip: Majority of pools are RANGING — tight positions near active bin maximize fee capture.`);
  }
  console.log();
}

// ── CLI Setup ──────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-bin-shift")
  .description(
    "HODLMM Active Bin Shift Tracker — Detects price regime and bin migration velocity from reserve asymmetry patterns"
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
  .description("Analyze active bin shift for a specific HODLMM pool")
  .requiredOption("--pool <id>", "HODLMM pool ID to analyze")
  .option("--json", "Output raw JSON instead of formatted report")
  .action(runAnalyze);

program
  .command("scan")
  .description("Scan top pools and rank by bin shift risk")
  .option("--top <n>", "Number of top pools to display", "5")
  .option("--min-tvl <usd>", "Minimum TVL threshold in USD", String(MIN_TVL_USD))
  .option("--json", "Output raw JSON instead of formatted table")
  .action(runScan);

program.parse();
