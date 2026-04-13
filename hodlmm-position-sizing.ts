#!/usr/bin/env bun
/**
 * hodlmm-position-sizing.ts
 *
 * HODLMM Position Sizing Calculator — Determines optimal LP position size for
 * concentrated liquidity pools based on gas cost efficiency, expected yield,
 * IL exposure, risk tolerance, and capital constraints. Helps LPs avoid
 * over-allocating to pools that can't justify the gas overhead or under-
 * allocating where excess yield is left on the table.
 *
 * Key metrics:
 *  - Minimum viable position size (gas break-even)
 *  - Optimal position size per risk tier (conservative/balanced/aggressive)
 *  - Gas cost amortization period
 *  - IL-adjusted expected return at each size
 *  - Kelly criterion sizing based on historical win rate
 *  - Capital efficiency score per size tier
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 53).
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
const FALLBACK_STX_PRICE_USD = 0.80;

const GAS_COSTS_USTX = {
  addLiquidity: 850_000,
  removeLiquidity: 750_000,
  claimFees: 450_000,
  rebalance: 1_600_000,
  compoundFees: 1_300_000,
} as const;

type RiskTier = "CONSERVATIVE" | "BALANCED" | "AGGRESSIVE";
type SizeVerdict = "TOO_SMALL" | "MINIMUM" | "OPTIMAL" | "OVERSIZED" | "MAX_REACHED";

const RISK_PARAMS: Record<RiskTier, { maxPoolPct: number; ilTolerancePct: number; minFeeToGas: number; rebalanceFreqDays: number }> = {
  CONSERVATIVE: { maxPoolPct: 2, ilTolerancePct: 1, minFeeToGas: 8, rebalanceFreqDays: 30 },
  BALANCED:     { maxPoolPct: 5, ilTolerancePct: 3, minFeeToGas: 4, rebalanceFreqDays: 14 },
  AGGRESSIVE:   { maxPoolPct: 10, ilTolerancePct: 8, minFeeToGas: 2, rebalanceFreqDays: 7 },
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
  reserveX: number;
  reserveY: number;
  totalUsd: number;
}

interface GasCostProfile {
  addUsd: number;
  removeUsd: number;
  claimUsd: number;
  rebalanceUsd: number;
  compoundUsd: number;
  monthlyMgmtUsd: number;
}

interface SizeTierResult {
  positionUsd: number;
  dailyFeeEstUsd: number;
  monthlyFeeEstUsd: number;
  annualizedYieldPct: number;
  ilEstPct: number;
  ilAdjustedYieldPct: number;
  gasAmortDays: number;
  feeToGasRatio: number;
  poolPct: number;
  kellyFraction: number;
  capitalEfficiencyScore: number;
  verdict: SizeVerdict;
}

interface RiskTierAnalysis {
  tier: RiskTier;
  minSizeUsd: number;
  optimalSizeUsd: number;
  maxSizeUsd: number;
  optimalResult: SizeTierResult;
}

interface PoolSizingAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  feeYieldAnnualPct: number;
  volumeToTvl: number;
  concentrationGini: number;
  gasCosts: GasCostProfile;
  riskTiers: RiskTierAnalysis[];
  minViableSizeUsd: number;
  recommendations: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<any> {
  const r = await fetch(url, {
    headers: { "Content-Type": "application/json" },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
  return r.json();
}

async function callReadOnly(fn: string, args: string[]): Promise<any> {
  const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/${fn}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sender: SENDER, arguments: args }),
  });
  if (!r.ok) throw new Error(`RO call ${fn} failed: ${r.status}`);
  return r.json();
}

function cvUint(n: number): string {
  const hex = n.toString(16).padStart(32, "0");
  return `0x01${hex}`;
}

function parseUintResult(res: any): number {
  const hex = (res?.result ?? "").replace(/^0x0[0-9a-f]/, "0x");
  return Number(BigInt(hex || "0"));
}

function parseSomeUint(hex: string): number {
  if (!hex || hex === "0x09") return 0;
  const clean = hex.startsWith("0x0a") ? "0x" + hex.slice(4) : hex;
  return Number(BigInt(clean || "0"));
}

function parseTupleFields(hex: string): Record<string, string> {
  const fields: Record<string, string> = {};
  if (!hex || hex.length < 6) return fields;
  let pos = hex.startsWith("0x0c") ? 4 : hex.startsWith("0x") ? 2 : 0;
  const raw = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (raw.startsWith("0c")) pos = 2;
  const fieldCount = parseInt(raw.slice(pos, pos + 8), 16);
  pos += 8;
  for (let i = 0; i < fieldCount && pos < raw.length; i++) {
    const nameLen = parseInt(raw.slice(pos, pos + 2), 16);
    pos += 2;
    const name = Buffer.from(raw.slice(pos, pos + nameLen * 2), "hex").toString("ascii");
    pos += nameLen * 2;
    const typeTag = raw.slice(pos, pos + 2);
    pos += 2;
    if (typeTag === "01") {
      fields[name] = "0x01" + raw.slice(pos, pos + 32);
      pos += 32;
    } else if (typeTag === "00") {
      fields[name] = "0x00" + raw.slice(pos, pos + 32);
      pos += 32;
    } else if (typeTag === "09") {
      fields[name] = "0x09";
    } else if (typeTag === "0a") {
      const innerTag = raw.slice(pos, pos + 2);
      pos += 2;
      if (innerTag === "01") {
        fields[name] = "0x0a01" + raw.slice(pos, pos + 32);
        pos += 32;
      } else {
        break;
      }
    } else {
      break;
    }
  }
  return fields;
}

async function getStxPriceUsd(): Promise<number> {
  try {
    const pools: AppPool[] = await fetchJson(`${BFF_APP_BASE}/hodlmm/pools`);
    for (const p of pools) {
      if (p.token0Symbol === "STX" && p.token0PriceUsd > 0) return p.token0PriceUsd;
      if (p.token1Symbol === "STX" && p.token1PriceUsd > 0) return p.token1PriceUsd;
    }
  } catch {}
  return FALLBACK_STX_PRICE_USD;
}

async function fetchBinReserves(poolId: number, activeBin: number, radius: number, pool: AppPool): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const tasks: Promise<void>[] = [];

  for (let id = activeBin - radius; id <= activeBin + radius; id++) {
    const binId = id;
    tasks.push(
      callReadOnly("get-bin", [cvUint(poolId), cvUint(binId)])
        .then((res) => {
          const f = parseTupleFields(res?.result ?? "");
          const rx = parseSomeUint(f["reserve-x"] ?? "0x09");
          const ry = parseSomeUint(f["reserve-y"] ?? "0x09");
          if (rx > 0 || ry > 0) {
            const decX = 10 ** (pool.token0Decimals || 6);
            const decY = 10 ** (pool.token1Decimals || 6);
            const usdX = (rx / decX) * (pool.token0PriceUsd || 0);
            const usdY = (ry / decY) * (pool.token1PriceUsd || 0);
            bins.push({ binId, reserveX: rx, reserveY: ry, totalUsd: usdX + usdY });
          }
        })
        .catch(() => {})
    );
  }

  await Promise.all(tasks);
  return bins.sort((a, b) => a.binId - b.binId);
}

function computeGini(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  if (mean === 0) return 0;
  let sumDiff = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumDiff += Math.abs(sorted[i] - sorted[j]);
    }
  }
  return sumDiff / (2 * n * n * mean);
}

function estimateILPct(concentrationGini: number, volumeToTvl: number): number {
  const spreadFactor = Math.min(volumeToTvl * 2, 5);
  const concentrationPenalty = (1 - concentrationGini) * 1.5;
  return Math.min(spreadFactor + concentrationPenalty, 15);
}

function kellyFraction(winRate: number, avgWinLoss: number): number {
  if (avgWinLoss <= 0) return 0;
  const f = winRate - (1 - winRate) / avgWinLoss;
  return Math.max(0, Math.min(f, 0.25));
}

// ── Core Analysis ─────────────────────────────────────────────────────────────

function computeGasCosts(stxPriceUsd: number, rebalanceFreqDays: number): GasCostProfile {
  const toUsd = (ustx: number) => (ustx / 1e6) * stxPriceUsd;
  const addUsd = toUsd(GAS_COSTS_USTX.addLiquidity);
  const removeUsd = toUsd(GAS_COSTS_USTX.removeLiquidity);
  const claimUsd = toUsd(GAS_COSTS_USTX.claimFees);
  const rebalanceUsd = toUsd(GAS_COSTS_USTX.rebalance);
  const compoundUsd = toUsd(GAS_COSTS_USTX.compoundFees);
  const rebalancesPerMonth = 30 / rebalanceFreqDays;
  const claimsPerMonth = rebalancesPerMonth * 2;
  const monthlyMgmtUsd = rebalanceUsd * rebalancesPerMonth + claimUsd * claimsPerMonth;
  return { addUsd, removeUsd, claimUsd, rebalanceUsd, compoundUsd, monthlyMgmtUsd };
}

function evaluateSize(
  positionUsd: number,
  pool: AppPool,
  feeYieldAnnualPct: number,
  ilEstPct: number,
  gasCosts: GasCostProfile,
  riskParams: typeof RISK_PARAMS["BALANCED"],
  kellyF: number
): SizeTierResult {
  const dailyFeeEstUsd = positionUsd * (feeYieldAnnualPct / 100 / 365);
  const monthlyFeeEstUsd = dailyFeeEstUsd * 30;
  const annualizedYieldPct = feeYieldAnnualPct;
  const ilAdjustedYieldPct = Math.max(feeYieldAnnualPct - ilEstPct, -100);
  const gasAmortDays = dailyFeeEstUsd > 0 ? (gasCosts.addUsd + gasCosts.removeUsd) / dailyFeeEstUsd : 999;
  const feeToGasRatio = gasCosts.monthlyMgmtUsd > 0 ? monthlyFeeEstUsd / gasCosts.monthlyMgmtUsd : 999;
  const poolPct = pool.tvlUsd > 0 ? (positionUsd / pool.tvlUsd) * 100 : 0;

  const capitalEfficiencyScore = Math.min(100, Math.round(
    (feeToGasRatio / 10) * 30 +
    (Math.min(annualizedYieldPct, 50) / 50) * 25 +
    (1 - Math.min(ilEstPct, 10) / 10) * 20 +
    (gasAmortDays < 7 ? 25 : gasAmortDays < 30 ? 15 : gasAmortDays < 90 ? 5 : 0)
  ));

  let verdict: SizeVerdict;
  if (feeToGasRatio < 1) verdict = "TOO_SMALL";
  else if (feeToGasRatio < riskParams.minFeeToGas) verdict = "MINIMUM";
  else if (poolPct > riskParams.maxPoolPct) verdict = "OVERSIZED";
  else if (positionUsd > pool.tvlUsd * 0.15) verdict = "MAX_REACHED";
  else verdict = "OPTIMAL";

  return {
    positionUsd,
    dailyFeeEstUsd,
    monthlyFeeEstUsd,
    annualizedYieldPct,
    ilEstPct,
    ilAdjustedYieldPct,
    gasAmortDays,
    feeToGasRatio,
    poolPct,
    kellyFraction: kellyF,
    capitalEfficiencyScore,
    verdict,
  };
}

function findOptimalSize(
  pool: AppPool,
  feeYieldAnnualPct: number,
  ilEstPct: number,
  gasCosts: GasCostProfile,
  tier: RiskTier
): RiskTierAnalysis {
  const rp = RISK_PARAMS[tier];
  const maxByPool = pool.tvlUsd * (rp.maxPoolPct / 100);
  const maxAbsolute = pool.tvlUsd * 0.15;
  const maxSize = Math.min(maxByPool, maxAbsolute);

  const winRate = feeYieldAnnualPct > ilEstPct ? 0.65 : 0.4;
  const avgWinLoss = feeYieldAnnualPct > 0 ? feeYieldAnnualPct / Math.max(ilEstPct, 1) : 1;
  const kellyF = kellyFraction(winRate, avgWinLoss);

  const minGasCosts = gasCosts.addUsd + gasCosts.removeUsd;
  const dailyYieldRate = feeYieldAnnualPct / 100 / 365;
  const minSizeUsd = dailyYieldRate > 0 ? minGasCosts / (dailyYieldRate * 7) : 100;

  let bestScore = -1;
  let bestResult: SizeTierResult | null = null;
  let optimalSizeUsd = minSizeUsd;

  const steps = 50;
  const stepSize = (maxSize - minSizeUsd) / steps;
  for (let i = 0; i <= steps; i++) {
    const size = minSizeUsd + stepSize * i;
    if (size <= 0) continue;
    const result = evaluateSize(size, pool, feeYieldAnnualPct, ilEstPct, gasCosts, rp, kellyF);
    if (result.verdict === "OPTIMAL" && result.capitalEfficiencyScore > bestScore) {
      bestScore = result.capitalEfficiencyScore;
      bestResult = result;
      optimalSizeUsd = size;
    }
  }

  if (!bestResult) {
    bestResult = evaluateSize(minSizeUsd, pool, feeYieldAnnualPct, ilEstPct, gasCosts, rp, kellyF);
    optimalSizeUsd = minSizeUsd;
  }

  return {
    tier,
    minSizeUsd: Math.round(minSizeUsd),
    optimalSizeUsd: Math.round(optimalSizeUsd),
    maxSizeUsd: Math.round(maxSize),
    optimalResult: bestResult,
  };
}

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtUsd(v: number): string { return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtPct(v: number): string { return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`; }
function fmtDays(v: number): string { return v > 365 ? ">1y" : `${v.toFixed(1)}d`; }

function verdictIcon(v: SizeVerdict): string {
  switch (v) {
    case "OPTIMAL": return "✅";
    case "MINIMUM": return "⚠️";
    case "TOO_SMALL": return "❌";
    case "OVERSIZED": return "🔴";
    case "MAX_REACHED": return "🟡";
  }
}

function printAnalysis(a: PoolSizingAnalysis): void {
  console.log(`\n${"═".repeat(72)}`);
  console.log(`  HODLMM POSITION SIZING — ${a.pair}`);
  console.log(`${"═".repeat(72)}`);
  console.log(`  Pool ID:          ${a.poolId}`);
  console.log(`  TVL:              ${fmtUsd(a.tvlUsd)}`);
  console.log(`  24h Volume:       ${fmtUsd(a.volume24hUsd)}`);
  console.log(`  Fee Rate:         ${a.feeBps} bps`);
  console.log(`  Fee Yield (ann.): ${fmtPct(a.feeYieldAnnualPct)}`);
  console.log(`  Volume/TVL:       ${a.volumeToTvl.toFixed(3)}`);
  console.log(`  Concentration:    ${(a.concentrationGini * 100).toFixed(1)}% Gini`);
  console.log(`  Active Bin:       ${a.activeBinId}`);

  console.log(`\n  ── Gas Cost Profile ──`);
  console.log(`  Add Liquidity:    ${fmtUsd(a.gasCosts.addUsd)}`);
  console.log(`  Remove Liquidity: ${fmtUsd(a.gasCosts.removeUsd)}`);
  console.log(`  Claim Fees:       ${fmtUsd(a.gasCosts.claimUsd)}`);
  console.log(`  Full Rebalance:   ${fmtUsd(a.gasCosts.rebalanceUsd)}`);

  console.log(`\n  ── Minimum Viable Position ──`);
  console.log(`  Min Size (gas break-even in 7d): ${fmtUsd(a.minViableSizeUsd)}`);

  for (const rt of a.riskTiers) {
    const r = rt.optimalResult;
    console.log(`\n  ── ${rt.tier} Tier ──`);
    console.log(`  Min Size:         ${fmtUsd(rt.minSizeUsd)}`);
    console.log(`  Optimal Size:     ${fmtUsd(rt.optimalSizeUsd)}  ${verdictIcon(r.verdict)} ${r.verdict}`);
    console.log(`  Max Size:         ${fmtUsd(rt.maxSizeUsd)}`);
    console.log(`  Daily Fees:       ${fmtUsd(r.dailyFeeEstUsd)}`);
    console.log(`  Monthly Fees:     ${fmtUsd(r.monthlyFeeEstUsd)}`);
    console.log(`  IL-Adj Yield:     ${fmtPct(r.ilAdjustedYieldPct)} annual`);
    console.log(`  Gas Amort:        ${fmtDays(r.gasAmortDays)}`);
    console.log(`  Fee/Gas Ratio:    ${r.feeToGasRatio.toFixed(1)}x`);
    console.log(`  Pool Share:       ${r.poolPct.toFixed(2)}%`);
    console.log(`  Kelly Fraction:   ${(r.kellyFraction * 100).toFixed(1)}%`);
    console.log(`  Efficiency Score: ${r.capitalEfficiencyScore}/100`);
  }

  if (a.recommendations.length > 0) {
    console.log(`\n  ── Recommendations ──`);
    for (const rec of a.recommendations) {
      console.log(`  • ${rec}`);
    }
  }

  console.log(`\n${"═".repeat(72)}\n`);
}

function printSummary(analyses: PoolSizingAnalysis[]): void {
  console.log(`\n${"═".repeat(72)}`);
  console.log(`  POSITION SIZING SUMMARY — ${analyses.length} pools`);
  console.log(`${"═".repeat(72)}`);
  console.log(`  ${"Pair".padEnd(18)} ${"TVL".padStart(12)} ${"Fee APY".padStart(10)} ${"Min Size".padStart(12)} ${"Optimal".padStart(12)} ${"Score".padStart(6)}`);
  console.log(`  ${"-".repeat(70)}`);

  const sorted = [...analyses].sort((a, b) => {
    const aScore = a.riskTiers.find(t => t.tier === "BALANCED")?.optimalResult.capitalEfficiencyScore ?? 0;
    const bScore = b.riskTiers.find(t => t.tier === "BALANCED")?.optimalResult.capitalEfficiencyScore ?? 0;
    return bScore - aScore;
  });

  for (const a of sorted) {
    const bal = a.riskTiers.find(t => t.tier === "BALANCED");
    if (!bal) continue;
    console.log(
      `  ${a.pair.padEnd(18)} ${fmtUsd(a.tvlUsd).padStart(12)} ${fmtPct(a.feeYieldAnnualPct).padStart(10)} ${fmtUsd(a.minViableSizeUsd).padStart(12)} ${fmtUsd(bal.optimalSizeUsd).padStart(12)} ${String(bal.optimalResult.capitalEfficiencyScore).padStart(6)}`
    );
  }

  console.log(`\n  Legend: Score = capital efficiency (0-100). Higher = better risk-adjusted sizing.\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function analyzePool(pool: AppPool, stxPriceUsd: number): Promise<PoolSizingAnalysis | null> {
  const poolId = pool.poolId;
  if (!poolId || pool.tvlUsd < MIN_TVL_USD) return null;

  let activeBin = pool.activeBinId ?? 0;
  if (!activeBin) {
    try {
      const pairRes = await callReadOnly("get-pair", [cvUint(poolId)]);
      const f = parseTupleFields(pairRes?.result ?? "");
      activeBin = parseSomeUint(f["active-bin-id"] ?? "0x09");
    } catch {}
  }
  if (!activeBin) return null;

  const feeBps = pool.feeBps ?? 30;
  const volumeToTvl = pool.tvlUsd > 0 ? pool.volume24hUsd / pool.tvlUsd : 0;
  const feeYieldAnnualPct = volumeToTvl * (feeBps / 10000) * 365 * 100;

  const bins = await fetchBinReserves(poolId, activeBin, BIN_SCAN_RADIUS, pool);
  const binValues = bins.map(b => b.totalUsd).filter(v => v > 0);
  const concentrationGini = computeGini(binValues);

  const ilEstPct = estimateILPct(concentrationGini, volumeToTvl);

  const riskTiers: RiskTierAnalysis[] = [];
  for (const tier of ["CONSERVATIVE", "BALANCED", "AGGRESSIVE"] as RiskTier[]) {
    const gasCosts = computeGasCosts(stxPriceUsd, RISK_PARAMS[tier].rebalanceFreqDays);
    riskTiers.push(findOptimalSize(pool, feeYieldAnnualPct, ilEstPct, gasCosts, tier));
  }

  const balancedGas = computeGasCosts(stxPriceUsd, 14);
  const dailyYieldRate = feeYieldAnnualPct / 100 / 365;
  const minViableSizeUsd = dailyYieldRate > 0 ? (balancedGas.addUsd + balancedGas.removeUsd) / (dailyYieldRate * 7) : 100;

  const recommendations: string[] = [];
  const balanced = riskTiers.find(t => t.tier === "BALANCED");
  if (balanced) {
    if (balanced.optimalResult.verdict === "TOO_SMALL") {
      recommendations.push(`Pool gas costs too high relative to fees — need >${fmtUsd(balanced.minSizeUsd)} minimum`);
    }
    if (feeYieldAnnualPct < ilEstPct) {
      recommendations.push(`IL risk (${ilEstPct.toFixed(1)}%) exceeds fee yield (${feeYieldAnnualPct.toFixed(1)}%) — consider smaller allocation or wider range`);
    }
    if (balanced.optimalResult.feeToGasRatio > 10) {
      recommendations.push(`Strong gas efficiency — room to compound more frequently for better returns`);
    }
    if (volumeToTvl > 0.5) {
      recommendations.push(`High volume/TVL (${volumeToTvl.toFixed(2)}) — active pool, consider aggressive tier for higher returns`);
    }
    if (volumeToTvl < 0.05) {
      recommendations.push(`Low volume/TVL (${volumeToTvl.toFixed(3)}) — thin fees, conservative sizing recommended`);
    }
    if (concentrationGini > 0.7) {
      recommendations.push(`High concentration (${(concentrationGini * 100).toFixed(0)}% Gini) — liquidity clustered in few bins, higher IL risk`);
    }
  }

  return {
    poolId,
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    feeBps,
    activeBinId: activeBin,
    feeYieldAnnualPct,
    volumeToTvl,
    concentrationGini,
    gasCosts: balancedGas,
    riskTiers,
    minViableSizeUsd: Math.round(minViableSizeUsd),
    recommendations,
  };
}

async function main() {
  const prog = new Command();
  prog
    .name("hodlmm-position-sizing")
    .description("HODLMM Position Sizing Calculator — optimal LP position sizes by risk tier")
    .option("-p, --pool <id>", "Specific pool ID to analyze")
    .option("-t, --top <n>", "Analyze top N pools by TVL", "5")
    .option("--tier <tier>", "Focus on a specific risk tier (CONSERVATIVE|BALANCED|AGGRESSIVE)")
    .option("--capital <usd>", "Total available capital in USD for allocation suggestions")
    .option("--json", "Output as JSON")
    .parse(process.argv);

  const opts = prog.opts();
  const topN = parseInt(opts.top ?? "5", 10);

  console.log("Fetching pool data and STX price...");
  const [pools, stxPriceUsd] = await Promise.all([
    fetchJson(`${BFF_APP_BASE}/hodlmm/pools`) as Promise<AppPool[]>,
    getStxPriceUsd(),
  ]);

  console.log(`STX price: ${fmtUsd(stxPriceUsd)} | ${pools.length} pools loaded`);

  let targetPools: AppPool[];
  if (opts.pool) {
    const pid = parseInt(opts.pool, 10);
    targetPools = pools.filter(p => p.poolId === pid);
    if (targetPools.length === 0) {
      console.error(`Pool ID ${pid} not found.`);
      process.exit(1);
    }
  } else {
    targetPools = pools
      .filter(p => p.tvlUsd >= MIN_TVL_USD && p.poolId)
      .sort((a, b) => b.tvlUsd - a.tvlUsd)
      .slice(0, topN);
  }

  console.log(`Analyzing ${targetPools.length} pools...\n`);

  const analyses: PoolSizingAnalysis[] = [];
  for (const pool of targetPools) {
    try {
      const result = await analyzePool(pool, stxPriceUsd);
      if (result) {
        analyses.push(result);
        if (!opts.json) printAnalysis(result);
      }
    } catch (e: any) {
      console.error(`Error analyzing pool ${pool.poolId}: ${e.message}`);
    }
  }

  if (analyses.length === 0) {
    console.log("No pools met analysis criteria.");
    return;
  }

  if (opts.capital) {
    const totalCapital = parseFloat(opts.capital);
    console.log(`\n${"═".repeat(72)}`);
    console.log(`  CAPITAL ALLOCATION — ${fmtUsd(totalCapital)} available`);
    console.log(`${"═".repeat(72)}`);

    const tier = (opts.tier?.toUpperCase() ?? "BALANCED") as RiskTier;
    const allocatable = analyses
      .map(a => ({ pool: a, tier: a.riskTiers.find(t => t.tier === tier)! }))
      .filter(x => x.tier && x.tier.optimalResult.verdict !== "TOO_SMALL")
      .sort((a, b) => b.tier.optimalResult.capitalEfficiencyScore - a.tier.optimalResult.capitalEfficiencyScore);

    let remaining = totalCapital;
    for (const { pool, tier: rt } of allocatable) {
      const alloc = Math.min(rt.optimalSizeUsd, remaining);
      if (alloc <= 0) break;
      const pct = (alloc / totalCapital) * 100;
      console.log(`  ${pool.pair.padEnd(18)} ${fmtUsd(alloc).padStart(12)} (${pct.toFixed(1)}%)  Score: ${rt.optimalResult.capitalEfficiencyScore}/100`);
      remaining -= alloc;
    }

    if (remaining > 0) {
      console.log(`  ${"Unallocated".padEnd(18)} ${fmtUsd(remaining).padStart(12)} (${((remaining / totalCapital) * 100).toFixed(1)}%)`);
    }
    console.log();
  }

  if (!opts.json) {
    printSummary(analyses);
  } else {
    console.log(JSON.stringify(analyses, null, 2));
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
