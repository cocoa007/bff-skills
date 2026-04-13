#!/usr/bin/env bun
/**
 * hodlmm-drawdown-analyzer.ts
 *
 * HODLMM Drawdown Analyzer — Measures maximum drawdown risk for concentrated
 * LP positions by analyzing bin reserve shifts, impermanent loss exposure,
 * and fee compensation. Helps LPs understand worst-case loss scenarios
 * and recovery timelines for their DLMM positions.
 *
 * Key metrics:
 *  - Current drawdown from peak position value
 *  - Maximum historical drawdown estimate (from reserve asymmetry)
 *  - IL-driven drawdown component vs fee recovery rate
 *  - Recovery period estimate (days to recoup losses from fees)
 *  - Drawdown severity classification (MINIMAL / MODERATE / SEVERE / CRITICAL)
 *  - Risk-adjusted return score accounting for drawdown depth
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 54).
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

type DrawdownSeverity = "MINIMAL" | "MODERATE" | "SEVERE" | "CRITICAL";

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
  pctX: number;
  pctY: number;
}

interface DrawdownMetrics {
  currentAsymmetry: number;
  peakAsymmetry: number;
  ilDrawdownPct: number;
  maxDrawdownPct: number;
  currentDrawdownPct: number;
  feeCompensationDailyPct: number;
  recoveryDays: number;
  severity: DrawdownSeverity;
  riskAdjustedScore: number;
}

interface PoolDrawdownAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  feeYieldAnnualPct: number;
  volumeToTvl: number;
  binCount: number;
  metrics: DrawdownMetrics;
  binProfile: BinDrawdownProfile;
  scenarios: DrawdownScenario[];
  recommendations: string[];
}

interface BinDrawdownProfile {
  totalBins: number;
  activeBins: number;
  xDominantBins: number;
  yDominantBins: number;
  balancedBins: number;
  weightedAsymmetry: number;
  maxSingleBinAsymmetry: number;
  depletionRiskBins: number;
}

interface DrawdownScenario {
  name: string;
  priceMovePct: number;
  estimatedDrawdownPct: number;
  feeOffsetDays: number;
  netImpactPct: number;
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

function parseSomeUint(hex: string): number {
  if (!hex || hex === "0x09") return 0;
  const clean = hex.startsWith("0x0a") ? "0x" + hex.slice(4) : hex;
  return Number(BigInt(clean || "0"));
}

function parseTupleFields(hex: string): Record<string, string> {
  const fields: Record<string, string> = {};
  if (!hex || hex.length < 6) return fields;
  const raw = hex.startsWith("0x") ? hex.slice(2) : hex;
  let pos = raw.startsWith("0c") ? 2 : 0;
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
            const total = usdX + usdY;
            const pctX = total > 0 ? usdX / total : 0.5;
            const pctY = total > 0 ? usdY / total : 0.5;
            bins.push({ binId, reserveX: rx, reserveY: ry, totalUsd: total, pctX, pctY });
          }
        })
        .catch(() => {})
    );
  }

  await Promise.all(tasks);
  return bins.sort((a, b) => a.binId - b.binId);
}

// ── Core Analysis ─────────────────────────────────────────────────────────────

function computeAsymmetry(bins: BinReserves[]): number {
  if (bins.length === 0) return 0;
  let totalValue = 0;
  let weightedAsym = 0;
  for (const b of bins) {
    const asym = Math.abs(b.pctX - b.pctY);
    weightedAsym += asym * b.totalUsd;
    totalValue += b.totalUsd;
  }
  return totalValue > 0 ? weightedAsym / totalValue : 0;
}

function computeBinProfile(bins: BinReserves[], activeBinId: number): BinDrawdownProfile {
  let xDom = 0, yDom = 0, balanced = 0, deplRisk = 0;
  let maxAsym = 0;

  for (const b of bins) {
    const asym = Math.abs(b.pctX - b.pctY);
    if (asym > maxAsym) maxAsym = asym;
    if (b.pctX > 0.8) { xDom++; if (b.pctX > 0.95) deplRisk++; }
    else if (b.pctY > 0.8) { yDom++; if (b.pctY > 0.95) deplRisk++; }
    else balanced++;
  }

  return {
    totalBins: bins.length,
    activeBins: bins.filter(b => b.totalUsd > 0).length,
    xDominantBins: xDom,
    yDominantBins: yDom,
    balancedBins: balanced,
    weightedAsymmetry: computeAsymmetry(bins),
    maxSingleBinAsymmetry: maxAsym,
    depletionRiskBins: deplRisk,
  };
}

function estimateILFromAsymmetry(asymmetry: number, volumeToTvl: number): number {
  const basePriceMove = asymmetry * 50;
  const sqrtRatio = Math.sqrt(1 + basePriceMove / 100);
  const ilRaw = 2 * sqrtRatio / (1 + (1 + basePriceMove / 100)) - 1;
  const concentrationMultiplier = 1 + asymmetry * 3;
  return Math.abs(ilRaw * 100 * concentrationMultiplier);
}

function classifySeverity(drawdownPct: number): DrawdownSeverity {
  if (drawdownPct < 2) return "MINIMAL";
  if (drawdownPct < 5) return "MODERATE";
  if (drawdownPct < 12) return "SEVERE";
  return "CRITICAL";
}

function computeDrawdownMetrics(
  bins: BinReserves[],
  profile: BinDrawdownProfile,
  feeYieldAnnualPct: number,
  volumeToTvl: number
): DrawdownMetrics {
  const currentAsymmetry = profile.weightedAsymmetry;
  const peakAsymmetry = Math.max(currentAsymmetry, profile.maxSingleBinAsymmetry * 0.7);

  const ilDrawdownPct = estimateILFromAsymmetry(currentAsymmetry, volumeToTvl);
  const maxIlDrawdown = estimateILFromAsymmetry(peakAsymmetry, volumeToTvl);

  const depletionPenalty = profile.depletionRiskBins * 0.8;
  const currentDrawdownPct = ilDrawdownPct + depletionPenalty * 0.5;
  const maxDrawdownPct = maxIlDrawdown + depletionPenalty;

  const feeCompensationDailyPct = feeYieldAnnualPct / 365;
  const recoveryDays = feeCompensationDailyPct > 0
    ? currentDrawdownPct / feeCompensationDailyPct
    : 999;

  const severity = classifySeverity(maxDrawdownPct);

  const drawdownPenalty = Math.min(maxDrawdownPct / 20, 1);
  const recoveryBonus = recoveryDays < 30 ? 0.3 : recoveryDays < 90 ? 0.15 : 0;
  const riskAdjustedScore = Math.round(Math.max(0, Math.min(100,
    (1 - drawdownPenalty) * 60 +
    recoveryBonus * 100 +
    (feeYieldAnnualPct > ilDrawdownPct ? 20 : 0)
  )));

  return {
    currentAsymmetry,
    peakAsymmetry,
    ilDrawdownPct,
    maxDrawdownPct,
    currentDrawdownPct,
    feeCompensationDailyPct,
    recoveryDays,
    severity,
    riskAdjustedScore,
  };
}

function generateScenarios(
  feeYieldAnnualPct: number,
  currentAsymmetry: number,
  volumeToTvl: number
): DrawdownScenario[] {
  const moves = [
    { name: "Minor dip (-5%)", pct: 5 },
    { name: "Moderate move (-10%)", pct: 10 },
    { name: "Sharp drop (-20%)", pct: 20 },
    { name: "Crash (-40%)", pct: 40 },
    { name: "Flash crash (-60%)", pct: 60 },
  ];

  const dailyFee = feeYieldAnnualPct / 365;

  return moves.map(m => {
    const sqrtR = Math.sqrt(1 - m.pct / 100);
    const holdValue = 1 - m.pct / 200;
    const lpValue = sqrtR;
    const ilPct = Math.abs((lpValue / holdValue - 1) * 100);
    const concentrationMult = 1 + currentAsymmetry * 2;
    const estimatedDrawdownPct = ilPct * concentrationMult;
    const feeOffsetDays = dailyFee > 0 ? estimatedDrawdownPct / dailyFee : 999;
    const netImpactPct = estimatedDrawdownPct - Math.min(feeOffsetDays, 30) * dailyFee;

    return {
      name: m.name,
      priceMovePct: m.pct,
      estimatedDrawdownPct: Math.round(estimatedDrawdownPct * 100) / 100,
      feeOffsetDays: Math.round(feeOffsetDays * 10) / 10,
      netImpactPct: Math.round(netImpactPct * 100) / 100,
    };
  });
}

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtUsd(v: number): string { return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtPct(v: number): string { return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`; }
function fmtDays(v: number): string { return v > 365 ? ">1y" : `${v.toFixed(1)}d`; }

function severityIcon(s: DrawdownSeverity): string {
  switch (s) {
    case "MINIMAL": return "✅";
    case "MODERATE": return "⚠️";
    case "SEVERE": return "🔴";
    case "CRITICAL": return "🚨";
  }
}

function drawdownBar(pct: number, width: number = 30): string {
  const filled = Math.min(Math.round((pct / 20) * width), width);
  return "█".repeat(filled) + "░".repeat(width - filled) + ` ${pct.toFixed(2)}%`;
}

function printAnalysis(a: PoolDrawdownAnalysis): void {
  console.log(`\n${"═".repeat(72)}`);
  console.log(`  HODLMM DRAWDOWN ANALYZER — ${a.pair}`);
  console.log(`${"═".repeat(72)}`);
  console.log(`  Pool ID:          ${a.poolId}`);
  console.log(`  TVL:              ${fmtUsd(a.tvlUsd)}`);
  console.log(`  24h Volume:       ${fmtUsd(a.volume24hUsd)}`);
  console.log(`  Fee Rate:         ${a.feeBps} bps`);
  console.log(`  Fee Yield (ann.): ${fmtPct(a.feeYieldAnnualPct)}`);
  console.log(`  Volume/TVL:       ${a.volumeToTvl.toFixed(3)}`);
  console.log(`  Active Bin:       ${a.activeBinId}`);

  const m = a.metrics;
  console.log(`\n  ── Drawdown Metrics ──`);
  console.log(`  Severity:         ${severityIcon(m.severity)} ${m.severity}`);
  console.log(`  Current DD:       ${drawdownBar(m.currentDrawdownPct)}`);
  console.log(`  Max DD (est.):    ${drawdownBar(m.maxDrawdownPct)}`);
  console.log(`  IL Component:     ${m.ilDrawdownPct.toFixed(2)}%`);
  console.log(`  Reserve Asymmetry: ${(m.currentAsymmetry * 100).toFixed(1)}%`);
  console.log(`  Peak Asymmetry:   ${(m.peakAsymmetry * 100).toFixed(1)}%`);
  console.log(`  Daily Fee Comp:   ${m.feeCompensationDailyPct.toFixed(4)}%`);
  console.log(`  Recovery Period:  ${fmtDays(m.recoveryDays)}`);
  console.log(`  Risk-Adj Score:   ${m.riskAdjustedScore}/100`);

  const bp = a.binProfile;
  console.log(`\n  ── Bin Profile ──`);
  console.log(`  Active Bins:      ${bp.activeBins}/${bp.totalBins}`);
  console.log(`  X-Dominant:       ${bp.xDominantBins} bins`);
  console.log(`  Y-Dominant:       ${bp.yDominantBins} bins`);
  console.log(`  Balanced:         ${bp.balancedBins} bins`);
  console.log(`  Depletion Risk:   ${bp.depletionRiskBins} bins (>95% one-sided)`);
  console.log(`  Max Bin Asym:     ${(bp.maxSingleBinAsymmetry * 100).toFixed(1)}%`);

  console.log(`\n  ── Stress Scenarios ──`);
  console.log(`  ${"Scenario".padEnd(24)} ${"DD%".padStart(8)} ${"Recovery".padStart(10)} ${"Net Impact".padStart(12)}`);
  console.log(`  ${"-".repeat(56)}`);
  for (const sc of a.scenarios) {
    console.log(
      `  ${sc.name.padEnd(24)} ${sc.estimatedDrawdownPct.toFixed(2).padStart(7)}% ${fmtDays(sc.feeOffsetDays).padStart(10)} ${fmtPct(-sc.netImpactPct).padStart(12)}`
    );
  }

  if (a.recommendations.length > 0) {
    console.log(`\n  ── Recommendations ──`);
    for (const rec of a.recommendations) {
      console.log(`  • ${rec}`);
    }
  }

  console.log(`\n${"═".repeat(72)}\n`);
}

function printSummary(analyses: PoolDrawdownAnalysis[]): void {
  console.log(`\n${"═".repeat(72)}`);
  console.log(`  DRAWDOWN SUMMARY — ${analyses.length} pools`);
  console.log(`${"═".repeat(72)}`);
  console.log(`  ${"Pair".padEnd(18)} ${"TVL".padStart(12)} ${"Max DD".padStart(10)} ${"Recovery".padStart(10)} ${"Severity".padStart(12)} ${"Score".padStart(6)}`);
  console.log(`  ${"-".repeat(70)}`);

  const sorted = [...analyses].sort((a, b) => a.metrics.maxDrawdownPct - b.metrics.maxDrawdownPct);

  for (const a of sorted) {
    const m = a.metrics;
    console.log(
      `  ${a.pair.padEnd(18)} ${fmtUsd(a.tvlUsd).padStart(12)} ${(m.maxDrawdownPct.toFixed(2) + "%").padStart(10)} ${fmtDays(m.recoveryDays).padStart(10)} ${(severityIcon(m.severity) + " " + m.severity).padStart(12)} ${String(m.riskAdjustedScore).padStart(6)}`
    );
  }

  console.log(`\n  Legend: Max DD = estimated max drawdown. Recovery = days to recoup from fees.`);
  console.log(`  Score = risk-adjusted return (0-100). Lower DD + faster recovery = better.\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function analyzePool(pool: AppPool, _stxPriceUsd: number): Promise<PoolDrawdownAnalysis | null> {
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
  if (bins.length === 0) return null;

  const profile = computeBinProfile(bins, activeBin);
  const metrics = computeDrawdownMetrics(bins, profile, feeYieldAnnualPct, volumeToTvl);
  const scenarios = generateScenarios(feeYieldAnnualPct, metrics.currentAsymmetry, volumeToTvl);

  const recommendations: string[] = [];
  if (metrics.severity === "CRITICAL") {
    recommendations.push("Position at critical drawdown risk — consider reducing exposure or widening bin range");
  }
  if (metrics.severity === "SEVERE") {
    recommendations.push("Significant drawdown exposure — monitor closely and set exit triggers");
  }
  if (metrics.recoveryDays > 90) {
    recommendations.push(`Recovery period (${Math.round(metrics.recoveryDays)}d) exceeds 90 days — fees insufficient to offset IL at current volume`);
  }
  if (profile.depletionRiskBins > 2) {
    recommendations.push(`${profile.depletionRiskBins} bins near depletion — price has moved significantly from entry, consider rebalancing`);
  }
  if (feeYieldAnnualPct > metrics.ilDrawdownPct * 2) {
    recommendations.push("Fee yield strongly exceeds IL — position well-compensated for drawdown risk");
  }
  if (metrics.currentAsymmetry > 0.6) {
    recommendations.push("High reserve asymmetry indicates concentrated directional exposure — elevated IL risk");
  }
  if (volumeToTvl < 0.03 && metrics.recoveryDays > 60) {
    recommendations.push("Low volume + slow recovery — consider migrating to a more active pool");
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
    binCount: bins.length,
    metrics,
    binProfile: profile,
    scenarios,
    recommendations,
  };
}

async function main() {
  const prog = new Command();
  prog
    .name("hodlmm-drawdown-analyzer")
    .description("HODLMM Drawdown Analyzer — maximum drawdown risk for concentrated LP positions")
    .option("-p, --pool <id>", "Specific pool ID to analyze")
    .option("-t, --top <n>", "Analyze top N pools by TVL", "5")
    .option("--scenario <move>", "Custom price move % for stress test (e.g., 25)")
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

  console.log(`Analyzing ${targetPools.length} pools for drawdown risk...\n`);

  const analyses: PoolDrawdownAnalysis[] = [];
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
