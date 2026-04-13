#!/usr/bin/env bun
/**
 * hodlmm-time-decay.ts
 *
 * HODLMM Time-Decay Analyzer — Measures how LP returns change over different
 * holding periods. Calculates time-weighted APR accounting for compounding
 * and IL drag, detects optimal holding periods where fee accrual plateaus
 * vs IL erosion, and compares time-decay curves across pools.
 *
 * Key metrics:
 *  - Fee accrual rates over 1h/4h/1d/7d/30d windows
 *  - Time-weighted APR with IL adjustment
 *  - Optimal holding period detection (fee plateau vs IL erosion)
 *  - Holding period risk score (short-term vs long-term viability)
 *  - Cross-pool time-decay curve comparison
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 48).
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

// Time windows in hours
const TIME_WINDOWS = [1, 4, 24, 168, 720] as const; // 1h, 4h, 1d, 7d, 30d
const WINDOW_LABELS: Record<number, string> = {
  1: "1h",
  4: "4h",
  24: "1d",
  168: "7d",
  720: "30d",
};

// IL model constants — typical HODLMM volatility profiles
// Annualized volatility buckets for IL estimation
const VOLATILITY_PROFILES = {
  stablePair: 0.05,    // e.g. USDA-USDT
  correlated: 0.25,    // e.g. STX-sBTC
  volatile: 0.60,      // e.g. STX-memecoin
  highVol: 1.20,       // e.g. memecoin-memecoin
} as const;

// Risk score thresholds
const RISK_THRESHOLDS = {
  LOW: 25,
  MEDIUM: 50,
  HIGH: 75,
  // Above 75 = CRITICAL
} as const;

const FALLBACK_STX_PRICE_USD = 0.80;

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

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface TimeWindowMetrics {
  windowHours: number;
  windowLabel: string;
  feeAccrualUsd: number;
  feeAccrualRate: number;         // USD per hour
  cumulativeFeesPct: number;      // as % of position
  estimatedILPct: number;         // IL drag as % of position
  netReturnPct: number;           // fee - IL as % of position
  annualizedApr: number;          // annualized from this window
  compoundedApy: number;          // with hourly compounding
  marginalReturnRate: number;     // incremental return per additional hour
}

interface OptimalHoldingResult {
  optimalHours: number;
  optimalLabel: string;
  peakNetReturnPct: number;
  peakApr: number;
  ilCrossoverHours: number;       // when IL starts exceeding fee gains
  reasoning: string;
}

interface HoldingRiskScore {
  score: number;                  // 0-100
  level: RiskLevel;
  shortTermViability: string;     // <24h assessment
  longTermViability: string;      // >7d assessment
  factors: string[];
}

interface TimeDecayAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  volatilityProfile: string;
  annualizedVolatility: number;
  positionSizeUsd: number;
  timeWindows: TimeWindowMetrics[];
  optimalHolding: OptimalHoldingResult;
  riskScore: HoldingRiskScore;
  recommendation: string;
}

interface PoolComparison {
  pools: TimeDecayAnalysis[];
  bestShortTerm: { poolId: number; pair: string; apr1d: number };
  bestLongTerm: { poolId: number; pair: string; apr30d: number };
  bestOverall: { poolId: number; pair: string; reason: string };
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

function formatPct(n: number): string {
  if (Math.abs(n) >= 100) return `${Math.round(n)}%`;
  if (Math.abs(n) >= 1) return `${n.toFixed(2)}%`;
  return `${n.toFixed(4)}%`;
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
      if (t0 === "STX" && stables.some((s) => t1.includes(s))) {
        return p.token0PriceUsd > 0 ? p.token0PriceUsd : FALLBACK_STX_PRICE_USD;
      }
      if (t1 === "STX" && stables.some((s) => t0.includes(s))) {
        return p.token1PriceUsd > 0 ? p.token1PriceUsd : FALLBACK_STX_PRICE_USD;
      }
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

async function fetchBinReserves(poolId: number, activeBinId: number, pool: AppPool): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const start = activeBinId - BIN_SCAN_RADIUS;
  const end = activeBinId + BIN_SCAN_RADIUS;

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

// ── Volatility & IL Estimation ─────────────────────────────────────────────────

/**
 * Classify pool volatility based on token pair characteristics.
 * In production, this would use historical price data; here we infer from
 * the token symbols and price ratios.
 */
function classifyVolatility(pool: AppPool): { profile: string; annualVol: number } {
  const t0 = pool.token0Symbol.toUpperCase();
  const t1 = pool.token1Symbol.toUpperCase();
  const stables = ["USDA", "USDT", "SUSDT", "XUSD", "AUSD", "USDH"];

  const t0Stable = stables.some((s) => t0.includes(s));
  const t1Stable = stables.some((s) => t1.includes(s));

  // Both stablecoins
  if (t0Stable && t1Stable) {
    return { profile: "stablePair", annualVol: VOLATILITY_PROFILES.stablePair };
  }

  // One BTC-derivative + one stable or major
  const btcTokens = ["BTC", "SBTC", "XBTC", "ABTC"];
  const t0Btc = btcTokens.some((s) => t0.includes(s));
  const t1Btc = btcTokens.some((s) => t1.includes(s));

  if ((t0Btc || t1Btc) && (t0Stable || t1Stable)) {
    return { profile: "correlated", annualVol: VOLATILITY_PROFILES.correlated };
  }

  // STX + stable
  if ((t0 === "STX" || t1 === "STX") && (t0Stable || t1Stable)) {
    return { profile: "correlated", annualVol: VOLATILITY_PROFILES.correlated };
  }

  // STX + BTC
  if ((t0 === "STX" || t1 === "STX") && (t0Btc || t1Btc)) {
    return { profile: "correlated", annualVol: 0.35 };
  }

  // One major + one unknown (likely volatile)
  const majors = ["STX", "BTC", "SBTC", "XBTC"];
  const hasMajor = majors.some((m) => t0 === m || t1 === m);
  if (hasMajor) {
    return { profile: "volatile", annualVol: VOLATILITY_PROFILES.volatile };
  }

  // Both unknown — assume high vol
  return { profile: "highVol", annualVol: VOLATILITY_PROFILES.highVol };
}

/**
 * Estimate impermanent loss for a concentrated liquidity position over a time window.
 *
 * Uses the IL formula for CLMM: IL ~ 0.5 * sigma^2 * t * concentration_factor
 * where sigma is volatility, t is time in years, and concentration_factor
 * reflects how tightly liquidity is concentrated (tighter = more IL).
 *
 * For HODLMM bins, concentration factor is derived from bin width.
 */
function estimateILPct(
  annualVolatility: number,
  windowHours: number,
  concentrationFactor: number = 1.5
): number {
  const timeYears = windowHours / 8760;
  // Concentrated IL approximation: IL% ~ 0.5 * sigma^2 * t * C
  // where C is concentration multiplier (1.0 for full-range, higher for concentrated)
  const ilPct = 0.5 * Math.pow(annualVolatility, 2) * timeYears * concentrationFactor * 100;
  return Math.max(0, ilPct);
}

/**
 * Compute concentration factor from bin distribution.
 * More concentrated = higher IL sensitivity.
 */
function computeConcentrationFactor(
  bins: BinReserves[],
  activeBinId: number,
  totalUsd: number
): number {
  if (bins.length === 0 || totalUsd <= 0) return 1.5;

  // Fraction of liquidity within +/- 3 bins
  const nearBins = bins.filter((b) => Math.abs(b.binId - activeBinId) <= 3);
  const nearUsd = nearBins.reduce((s, b) => s + b.totalUsd, 0);
  const nearShare = nearUsd / totalUsd;

  // Higher concentration = higher IL factor
  if (nearShare > 0.8) return 2.5;  // Very concentrated
  if (nearShare > 0.5) return 2.0;
  if (nearShare > 0.2) return 1.5;
  return 1.0; // Spread wide — lower IL
}

// ── Time-Decay Analysis ────────────────────────────────────────────────────────

/**
 * Calculate fee accrual metrics for each time window.
 * Uses current 24h volume as the basis and scales to each window.
 * Applies a volume decay factor for longer windows (volume isn't constant).
 */
function computeTimeWindowMetrics(
  positionUsd: number,
  tvlUsd: number,
  volume24hUsd: number,
  feeBps: number,
  annualVolatility: number,
  concentrationFactor: number
): TimeWindowMetrics[] {
  if (tvlUsd <= 0 || positionUsd <= 0) return [];

  const hourlyVolume = volume24hUsd / 24;
  const feeRate = feeBps / 10_000;
  const positionShare = positionUsd / tvlUsd;

  return TIME_WINDOWS.map((windowHours) => {
    // Volume decay factor: longer windows tend to have lower avg volume
    // due to mean reversion. Apply sqrt-time scaling for conservative estimate.
    const volumeDecay = windowHours <= 24
      ? 1.0
      : Math.pow(24 / windowHours, 0.15); // Gentle decay

    const windowVolume = hourlyVolume * windowHours * volumeDecay;
    const windowPoolFees = windowVolume * feeRate;
    const feeAccrualUsd = windowPoolFees * positionShare;

    const feeAccrualRate = windowHours > 0 ? feeAccrualUsd / windowHours : 0;
    const cumulativeFeesPct = positionUsd > 0 ? (feeAccrualUsd / positionUsd) * 100 : 0;

    const estimatedILPct = estimateILPct(annualVolatility, windowHours, concentrationFactor);
    const netReturnPct = cumulativeFeesPct - estimatedILPct;

    // Annualized APR from this window's rate
    const hoursPerYear = 8760;
    const annualizedApr = (netReturnPct / windowHours) * hoursPerYear;

    // Compounded APY (hourly compounding)
    const hourlyRate = netReturnPct / 100 / windowHours;
    const compoundedApy = hourlyRate > -1
      ? (Math.pow(1 + hourlyRate, hoursPerYear) - 1) * 100
      : -100;

    // Marginal return rate: the incremental return per additional hour
    // at this window's edge (derivative of return curve)
    const nextHourFees = (hourlyVolume * feeRate * positionShare * volumeDecay) / positionUsd * 100;
    const nextHourIL = estimateILPct(annualVolatility, windowHours + 1, concentrationFactor)
      - estimateILPct(annualVolatility, windowHours, concentrationFactor);
    const marginalReturnRate = nextHourFees - nextHourIL;

    return {
      windowHours,
      windowLabel: WINDOW_LABELS[windowHours] || `${windowHours}h`,
      feeAccrualUsd: Math.round(feeAccrualUsd * 10000) / 10000,
      feeAccrualRate: Math.round(feeAccrualRate * 10000) / 10000,
      cumulativeFeesPct: Math.round(cumulativeFeesPct * 10000) / 10000,
      estimatedILPct: Math.round(estimatedILPct * 10000) / 10000,
      netReturnPct: Math.round(netReturnPct * 10000) / 10000,
      annualizedApr: Math.round(annualizedApr * 100) / 100,
      compoundedApy: Math.round(compoundedApy * 100) / 100,
      marginalReturnRate: Math.round(marginalReturnRate * 100000) / 100000,
    };
  });
}

/**
 * Detect the optimal holding period — where net return per hour starts declining
 * significantly, meaning fee accrual is plateauing relative to IL growth.
 */
function findOptimalHolding(windows: TimeWindowMetrics[]): OptimalHoldingResult {
  if (windows.length === 0) {
    return {
      optimalHours: 0,
      optimalLabel: "N/A",
      peakNetReturnPct: 0,
      peakApr: 0,
      ilCrossoverHours: 0,
      reasoning: "No data available",
    };
  }

  // Find window with highest annualized APR (the sweet spot)
  let bestIdx = 0;
  let bestApr = -Infinity;
  for (let i = 0; i < windows.length; i++) {
    if (windows[i].annualizedApr > bestApr) {
      bestApr = windows[i].annualizedApr;
      bestIdx = i;
    }
  }

  const bestWindow = windows[bestIdx];

  // Find IL crossover: where cumulative IL exceeds cumulative fees
  let ilCrossoverHours = 0;
  for (const w of windows) {
    if (w.netReturnPct < 0 && ilCrossoverHours === 0) {
      ilCrossoverHours = w.windowHours;
    }
  }

  // If no crossover found within our windows, estimate from the curve
  if (ilCrossoverHours === 0) {
    // Linear extrapolation from the last two windows
    const lastTwo = windows.slice(-2);
    if (lastTwo.length === 2 && lastTwo[1].marginalReturnRate < lastTwo[0].marginalReturnRate) {
      // Marginal return is declining — estimate when it hits zero
      const declineRate = (lastTwo[0].marginalReturnRate - lastTwo[1].marginalReturnRate) /
        (lastTwo[1].windowHours - lastTwo[0].windowHours);
      if (declineRate > 0) {
        ilCrossoverHours = Math.round(
          lastTwo[1].windowHours + lastTwo[1].marginalReturnRate / declineRate
        );
      }
    }
  }

  let reasoning: string;
  if (bestApr > 100) {
    reasoning = `Strong fee generation dominates IL. Optimal holding at ${bestWindow.windowLabel} yields ${bestApr.toFixed(0)}% APR. Fees outpace IL even at longer horizons — active management adds value.`;
  } else if (bestApr > 20) {
    reasoning = `Moderate returns with manageable IL. Best risk-adjusted return at ${bestWindow.windowLabel} (${bestApr.toFixed(1)}% APR). Beyond this, IL erosion reduces marginal gains.`;
  } else if (bestApr > 0) {
    reasoning = `Low fee generation relative to IL risk. Holding beyond ${bestWindow.windowLabel} sees diminishing returns. Consider tighter ranges for better fee capture or wider ranges to reduce IL.`;
  } else {
    reasoning = `IL exceeds fee accrual at all measured windows. This pool is net-negative for LPs at current volume levels. Avoid providing liquidity unless volume significantly increases.`;
  }

  return {
    optimalHours: bestWindow.windowHours,
    optimalLabel: bestWindow.windowLabel,
    peakNetReturnPct: bestWindow.netReturnPct,
    peakApr: bestApr,
    ilCrossoverHours: ilCrossoverHours || -1,
    reasoning,
  };
}

/**
 * Compute holding period risk score.
 */
function computeRiskScore(
  windows: TimeWindowMetrics[],
  annualVolatility: number,
  volume24hUsd: number,
  tvlUsd: number
): HoldingRiskScore {
  const factors: string[] = [];
  let score = 0;

  // Factor 1: Volatility (0-25 points)
  if (annualVolatility > 1.0) {
    score += 25;
    factors.push("Extreme volatility — IL risk is very high");
  } else if (annualVolatility > 0.5) {
    score += 18;
    factors.push("High volatility — significant IL exposure");
  } else if (annualVolatility > 0.2) {
    score += 10;
    factors.push("Moderate volatility — manageable IL");
  } else {
    score += 3;
    factors.push("Low volatility — minimal IL risk");
  }

  // Factor 2: Volume-to-TVL ratio (0-25 points)
  const volToTvl = tvlUsd > 0 ? volume24hUsd / tvlUsd : 0;
  if (volToTvl < 0.01) {
    score += 25;
    factors.push("Very low volume/TVL ratio — fees unlikely to cover IL");
  } else if (volToTvl < 0.05) {
    score += 15;
    factors.push("Low volume/TVL — fee accrual is slow");
  } else if (volToTvl < 0.2) {
    score += 8;
    factors.push("Decent volume/TVL — healthy fee generation");
  } else {
    score += 3;
    factors.push("High volume/TVL — strong fee generation");
  }

  // Factor 3: Time-decay steepness (0-25 points)
  if (windows.length >= 2) {
    const shortApr = windows[0]?.annualizedApr || 0;
    const longApr = windows[windows.length - 1]?.annualizedApr || 0;
    const decay = shortApr - longApr;

    if (decay > 100) {
      score += 25;
      factors.push("Steep time-decay — returns collapse over longer holding periods");
    } else if (decay > 30) {
      score += 15;
      factors.push("Moderate time-decay — returns decline with holding period");
    } else if (decay > 5) {
      score += 8;
      factors.push("Gentle time-decay — returns are relatively stable");
    } else {
      score += 3;
      factors.push("Flat time-decay — returns consistent across timeframes");
    }
  }

  // Factor 4: Net return at 30d window (0-25 points)
  const window30d = windows.find((w) => w.windowHours === 720);
  if (window30d) {
    if (window30d.netReturnPct < 0) {
      score += 25;
      factors.push("30d net return is negative — long-term holding is unprofitable");
    } else if (window30d.netReturnPct < 0.5) {
      score += 18;
      factors.push("30d net return is marginal — barely profitable");
    } else if (window30d.netReturnPct < 2) {
      score += 10;
      factors.push("30d net return is moderate — acceptable for passive LPs");
    } else {
      score += 3;
      factors.push("30d net return is strong — profitable long-term hold");
    }
  }

  score = Math.min(100, score);

  let level: RiskLevel;
  if (score <= RISK_THRESHOLDS.LOW) level = "LOW";
  else if (score <= RISK_THRESHOLDS.MEDIUM) level = "MEDIUM";
  else if (score <= RISK_THRESHOLDS.HIGH) level = "HIGH";
  else level = "CRITICAL";

  const window1d = windows.find((w) => w.windowHours === 24);
  const shortTermViability = window1d
    ? window1d.netReturnPct > 0
      ? `Viable — ${formatPct(window1d.netReturnPct)} net return in 24h (${window1d.annualizedApr.toFixed(0)}% APR)`
      : `Risky — negative ${formatPct(Math.abs(window1d.netReturnPct))} net return in 24h`
    : "Unknown — insufficient data";

  const longTermViability = window30d
    ? window30d.netReturnPct > 1
      ? `Strong — ${formatPct(window30d.netReturnPct)} net return over 30d`
      : window30d.netReturnPct > 0
        ? `Marginal — only ${formatPct(window30d.netReturnPct)} net return over 30d`
        : `Unprofitable — IL exceeds fees over 30d`
    : "Unknown — insufficient data";

  return { score, level, shortTermViability, longTermViability, factors };
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

  // Verify time-decay specific logic
  try {
    const testMetrics = computeTimeWindowMetrics(1000, 100000, 5000, 30, 0.5, 1.5);
    results["time_decay_engine"] = testMetrics.length === TIME_WINDOWS.length ? "ok" : "partial";
  } catch (e: any) {
    results["time_decay_engine"] = `error: ${e.message}`;
  }

  console.log(
    JSON.stringify({
      tool: "hodlmm-time-decay",
      command: "doctor",
      status: Object.values(results).every((v) => v.startsWith("ok")) ? "healthy" : "degraded",
      checks: results,
      timestamp: new Date().toISOString(),
    })
  );
}

async function runAnalyze(poolIdStr: string, options: { position?: string }): Promise<void> {
  const poolId = parseInt(poolIdStr);
  if (isNaN(poolId)) {
    console.log(JSON.stringify({
      tool: "hodlmm-time-decay",
      command: "analyze",
      timestamp: new Date().toISOString(),
      error: "Invalid pool ID — provide a numeric pool ID",
    }));
    return;
  }

  const positionUsd = options.position ? parseFloat(options.position) : 1000;
  const pools = await fetchAllPools();
  const pool = pools.find((p) => p.poolId === poolId);

  if (!pool) {
    console.log(JSON.stringify({
      tool: "hodlmm-time-decay",
      command: "analyze",
      timestamp: new Date().toISOString(),
      error: `Pool ${poolId} not found or below TVL threshold ($${MIN_TVL_USD})`,
    }));
    return;
  }

  const activeBinId = pool.activeBinId || await getActiveBin(poolId);
  if (!activeBinId) {
    console.log(JSON.stringify({
      tool: "hodlmm-time-decay",
      command: "analyze",
      timestamp: new Date().toISOString(),
      error: `Could not determine active bin for pool ${poolId}`,
    }));
    return;
  }

  const bins = await fetchBinReserves(poolId, activeBinId, pool);
  const binTotalUsd = bins.reduce((s, b) => s + b.totalUsd, 0);
  const concFactor = computeConcentrationFactor(bins, activeBinId, binTotalUsd);
  const { profile, annualVol } = classifyVolatility(pool);

  const timeWindows = computeTimeWindowMetrics(
    positionUsd, pool.tvlUsd, pool.volume24hUsd, pool.feeBps || 30, annualVol, concFactor
  );

  const optimalHolding = findOptimalHolding(timeWindows);
  const riskScore = computeRiskScore(timeWindows, annualVol, pool.volume24hUsd, pool.tvlUsd);

  let recommendation: string;
  if (riskScore.level === "LOW") {
    recommendation = `Low risk — fees dominate IL across all windows. Hold for ${optimalHolding.optimalLabel}+ to maximize compounded returns. Active rebalancing adds value.`;
  } else if (riskScore.level === "MEDIUM") {
    recommendation = `Moderate risk — target ${optimalHolding.optimalLabel} holding periods for best risk-adjusted return (${optimalHolding.peakApr.toFixed(0)}% APR). Monitor IL and rebalance if price moves > 5%.`;
  } else if (riskScore.level === "HIGH") {
    recommendation = `High risk — IL erodes returns quickly. Short-term positions (< ${optimalHolding.optimalLabel}) may still be profitable but require active monitoring. Consider reducing position size.`;
  } else {
    recommendation = `Critical risk — this pool is likely unprofitable for LPs at current volume. IL overwhelms fee generation. Wait for higher volume or avoid.`;
  }

  const analysis: TimeDecayAnalysis = {
    poolId,
    pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
    tvlUsd: Math.round(pool.tvlUsd),
    volume24hUsd: Math.round(pool.volume24hUsd),
    feeBps: pool.feeBps || 30,
    volatilityProfile: profile,
    annualizedVolatility: annualVol,
    positionSizeUsd: positionUsd,
    timeWindows,
    optimalHolding,
    riskScore,
    recommendation,
  };

  console.log(JSON.stringify({
    tool: "hodlmm-time-decay",
    command: "analyze",
    timestamp: new Date().toISOString(),
    ...analysis,
    binsScanned: bins.length,
    binsWithLiquidity: bins.filter((b) => b.totalUsd > 0).length,
    concentrationFactor: Math.round(concFactor * 100) / 100,
  }, null, 2));
}

async function runCompare(pool1Str: string, pool2Str: string, options: { position?: string }): Promise<void> {
  const poolId1 = parseInt(pool1Str);
  const poolId2 = parseInt(pool2Str);
  if (isNaN(poolId1) || isNaN(poolId2)) {
    console.log(JSON.stringify({
      tool: "hodlmm-time-decay",
      command: "compare",
      timestamp: new Date().toISOString(),
      error: "Invalid pool IDs — provide two numeric pool IDs",
    }));
    return;
  }

  const positionUsd = options.position ? parseFloat(options.position) : 1000;
  const pools = await fetchAllPools();

  const analyzePool = async (poolId: number): Promise<TimeDecayAnalysis | null> => {
    const pool = pools.find((p) => p.poolId === poolId);
    if (!pool) return null;

    const activeBinId = pool.activeBinId || await getActiveBin(poolId);
    if (!activeBinId) return null;

    const bins = await fetchBinReserves(poolId, activeBinId, pool);
    const binTotalUsd = bins.reduce((s, b) => s + b.totalUsd, 0);
    const concFactor = computeConcentrationFactor(bins, activeBinId, binTotalUsd);
    const { profile, annualVol } = classifyVolatility(pool);

    const timeWindows = computeTimeWindowMetrics(
      positionUsd, pool.tvlUsd, pool.volume24hUsd, pool.feeBps || 30, annualVol, concFactor
    );

    const optimalHolding = findOptimalHolding(timeWindows);
    const riskScore = computeRiskScore(timeWindows, annualVol, pool.volume24hUsd, pool.tvlUsd);

    return {
      poolId,
      pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
      tvlUsd: Math.round(pool.tvlUsd),
      volume24hUsd: Math.round(pool.volume24hUsd),
      feeBps: pool.feeBps || 30,
      volatilityProfile: profile,
      annualizedVolatility: annualVol,
      positionSizeUsd: positionUsd,
      timeWindows,
      optimalHolding,
      riskScore,
      recommendation: "",
    };
  };

  const [a1, a2] = await Promise.all([analyzePool(poolId1), analyzePool(poolId2)]);

  if (!a1 || !a2) {
    console.log(JSON.stringify({
      tool: "hodlmm-time-decay",
      command: "compare",
      timestamp: new Date().toISOString(),
      error: `One or both pools not found: ${!a1 ? poolId1 : ""} ${!a2 ? poolId2 : ""}`.trim(),
    }));
    return;
  }

  const poolAnalyses = [a1, a2];

  // Determine best short-term (1d APR)
  const apr1d = poolAnalyses.map((p) => ({
    poolId: p.poolId,
    pair: p.pair,
    apr1d: p.timeWindows.find((w) => w.windowHours === 24)?.annualizedApr || 0,
  }));
  const bestShort = apr1d.sort((a, b) => b.apr1d - a.apr1d)[0];

  // Best long-term (30d APR)
  const apr30d = poolAnalyses.map((p) => ({
    poolId: p.poolId,
    pair: p.pair,
    apr30d: p.timeWindows.find((w) => w.windowHours === 720)?.annualizedApr || 0,
  }));
  const bestLong = apr30d.sort((a, b) => b.apr30d - a.apr30d)[0];

  // Best overall (lowest risk + best peak APR)
  const scored = poolAnalyses.map((p) => ({
    poolId: p.poolId,
    pair: p.pair,
    score: p.optimalHolding.peakApr - p.riskScore.score,
  }));
  const bestOverall = scored.sort((a, b) => b.score - a.score)[0];

  const comparison: PoolComparison = {
    pools: poolAnalyses,
    bestShortTerm: bestShort,
    bestLongTerm: bestLong,
    bestOverall: {
      poolId: bestOverall.poolId,
      pair: bestOverall.pair,
      reason: `Best risk-adjusted return (peak APR minus risk score)`,
    },
  };

  console.log(JSON.stringify({
    tool: "hodlmm-time-decay",
    command: "compare",
    timestamp: new Date().toISOString(),
    positionSizeUsd: positionUsd,
    ...comparison,
  }, null, 2));
}

async function runOptimal(poolIdStr: string, options: { position?: string }): Promise<void> {
  const poolId = parseInt(poolIdStr);
  if (isNaN(poolId)) {
    console.log(JSON.stringify({
      tool: "hodlmm-time-decay",
      command: "optimal",
      timestamp: new Date().toISOString(),
      error: "Invalid pool ID — provide a numeric pool ID",
    }));
    return;
  }

  const positionUsd = options.position ? parseFloat(options.position) : 1000;
  const pools = await fetchAllPools();
  const pool = pools.find((p) => p.poolId === poolId);

  if (!pool) {
    console.log(JSON.stringify({
      tool: "hodlmm-time-decay",
      command: "optimal",
      timestamp: new Date().toISOString(),
      error: `Pool ${poolId} not found or below TVL threshold`,
    }));
    return;
  }

  const activeBinId = pool.activeBinId || await getActiveBin(poolId);
  if (!activeBinId) {
    console.log(JSON.stringify({
      tool: "hodlmm-time-decay",
      command: "optimal",
      timestamp: new Date().toISOString(),
      error: `Could not determine active bin for pool ${poolId}`,
    }));
    return;
  }

  const bins = await fetchBinReserves(poolId, activeBinId, pool);
  const binTotalUsd = bins.reduce((s, b) => s + b.totalUsd, 0);
  const concFactor = computeConcentrationFactor(bins, activeBinId, binTotalUsd);
  const { profile, annualVol } = classifyVolatility(pool);

  // Extended time windows for finer optimal detection
  const extendedHours = [1, 2, 4, 8, 12, 24, 48, 72, 168, 336, 720];
  const extendedLabels: Record<number, string> = {
    1: "1h", 2: "2h", 4: "4h", 8: "8h", 12: "12h",
    24: "1d", 48: "2d", 72: "3d", 168: "7d", 336: "14d", 720: "30d",
  };

  const hourlyVolume = pool.volume24hUsd / 24;
  const feeRate = (pool.feeBps || 30) / 10_000;
  const positionShare = positionUsd / pool.tvlUsd;

  const curve = extendedHours.map((h) => {
    const volumeDecay = h <= 24 ? 1.0 : Math.pow(24 / h, 0.15);
    const windowVolume = hourlyVolume * h * volumeDecay;
    const feeAccrual = windowVolume * feeRate * positionShare;
    const feePct = (feeAccrual / positionUsd) * 100;
    const ilPct = estimateILPct(annualVol, h, concFactor);
    const netPct = feePct - ilPct;
    const apr = (netPct / h) * 8760;

    return {
      hours: h,
      label: extendedLabels[h] || `${h}h`,
      feePct: Math.round(feePct * 10000) / 10000,
      ilPct: Math.round(ilPct * 10000) / 10000,
      netPct: Math.round(netPct * 10000) / 10000,
      apr: Math.round(apr * 100) / 100,
    };
  });

  // Find peak APR point
  let peakIdx = 0;
  for (let i = 1; i < curve.length; i++) {
    if (curve[i].apr > curve[peakIdx].apr) peakIdx = i;
  }

  // Find IL crossover
  let crossoverIdx = -1;
  for (let i = 0; i < curve.length; i++) {
    if (curve[i].netPct < 0) {
      crossoverIdx = i;
      break;
    }
  }

  const peak = curve[peakIdx];

  console.log(JSON.stringify({
    tool: "hodlmm-time-decay",
    command: "optimal",
    timestamp: new Date().toISOString(),
    poolId,
    pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
    positionSizeUsd: positionUsd,
    volatilityProfile: profile,
    annualizedVolatility: annualVol,
    concentrationFactor: Math.round(concFactor * 100) / 100,
    optimalHoldingPeriod: {
      hours: peak.hours,
      label: peak.label,
      feePct: peak.feePct,
      ilPct: peak.ilPct,
      netReturnPct: peak.netPct,
      annualizedApr: peak.apr,
    },
    ilCrossover: crossoverIdx >= 0
      ? { hours: curve[crossoverIdx].hours, label: curve[crossoverIdx].label }
      : { hours: -1, label: "None within 30d — fees dominate" },
    returnCurve: curve,
    strategy: peak.apr > 50
      ? `Aggressive — hold for ${peak.label}, rebalance at expiry. High APR justifies active management.`
      : peak.apr > 10
        ? `Moderate — hold for ${peak.label}, monitor IL. Rebalance only on significant price moves.`
        : peak.apr > 0
          ? `Conservative — wider ranges recommended. Fee capture is low relative to IL. Consider ${peak.label} holding max.`
          : `Avoid — IL exceeds fees at all timeframes. Wait for higher volume conditions.`,
  }, null, 2));
}

// ── CLI Setup ──────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-time-decay")
  .description(
    "HODLMM Time-Decay Analyzer — Measures how LP returns change over different holding periods, accounting for fee accrual, IL drag, and compounding"
  )
  .version("1.0.0");

program
  .command("doctor")
  .description("Check API connectivity and dependencies")
  .action(runDoctor);

program
  .command("analyze <pool>")
  .description("Analyze time-decay return curves for a specific pool")
  .option("--position <usd>", "Position size in USD (default: 1000)")
  .action(runAnalyze);

program
  .command("compare <pool1> <pool2>")
  .description("Compare time-decay curves across two pools")
  .option("--position <usd>", "Position size in USD (default: 1000)")
  .action(runCompare);

program
  .command("optimal <pool>")
  .description("Find optimal holding period with detailed return curve")
  .option("--position <usd>", "Position size in USD (default: 1000)")
  .action(runOptimal);

program.parse();
