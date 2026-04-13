#!/usr/bin/env bun
/**
 * hodlmm-position-aging.ts
 *
 * HODLMM Position Aging Analyzer — Measures how concentrated LP position
 * effectiveness decays over time as the active bin drifts from the position
 * center. Quantifies "staleness" through fee capture decay, range utilization
 * erosion, and drift velocity to help LPs know when positions need attention.
 *
 * Key metrics:
 *  - Position drift: how far active bin has moved from range center
 *  - Fee capture decay rate: % of max fee capture still achievable
 *  - Range utilization: fraction of bin range still generating fees
 *  - Staleness score (0-100): composite aging metric
 *  - Estimated remaining productive life (days)
 *  - Age classification: FRESH / MATURING / AGING / STALE / EXPIRED
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 55).
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

type AgeClass = "FRESH" | "MATURING" | "AGING" | "STALE" | "EXPIRED";

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

interface AgingMetrics {
  rangeCenterBin: number;
  activeBin: number;
  driftBins: number;
  driftPct: number;
  rangeSpan: number;
  activeBinsCount: number;
  feeCaptureDecayPct: number;
  rangeUtilizationPct: number;
  productiveBinsPct: number;
  stalenessScore: number;
  ageClass: AgeClass;
  estimatedLifeDays: number;
  driftVelocityBinsPerDay: number;
  feeYieldAnnualPct: number;
  effectiveYieldPct: number;
}

interface BinAgingProfile {
  totalBins: number;
  productiveBins: number;
  dormantBins: number;
  depletedBins: number;
  avgAsymmetry: number;
  peakReserveBin: number;
  reserveDistributionSkew: number;
}

interface DecayProjection {
  daysFromNow: number;
  estimatedDriftBins: number;
  projectedFeeCaptureDecay: number;
  projectedAgeClass: AgeClass;
  recommendation: string;
}

interface PoolAgingAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  metrics: AgingMetrics;
  binProfile: BinAgingProfile;
  projections: DecayProjection[];
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
    } else if (typeTag === "0a") {
      fields[name] = "0x0a" + raw.slice(pos, pos + 34);
      pos += 34;
    } else if (typeTag === "09") {
      fields[name] = "0x09";
    } else {
      break;
    }
  }
  return fields;
}

async function getStxPriceUsd(): Promise<number> {
  try {
    const data = await fetchJson("https://api.coingecko.com/api/v3/simple/price?ids=blockstack&vs_currencies=usd");
    return data?.blockstack?.usd ?? FALLBACK_STX_PRICE_USD;
  } catch {
    return FALLBACK_STX_PRICE_USD;
  }
}

function fmtUsd(n: number): string {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function classifyAge(staleness: number): AgeClass {
  if (staleness <= 15) return "FRESH";
  if (staleness <= 35) return "MATURING";
  if (staleness <= 60) return "AGING";
  if (staleness <= 80) return "STALE";
  return "EXPIRED";
}

function ageEmoji(cls: AgeClass): string {
  switch (cls) {
    case "FRESH": return "🟢";
    case "MATURING": return "🟡";
    case "AGING": return "🟠";
    case "STALE": return "🔴";
    case "EXPIRED": return "⚫";
  }
}

// ── Bin Fetching ─────────────────────────────────────────────────────────────

async function fetchBinReserves(
  poolId: number,
  activeBin: number,
  radius: number,
  pool: AppPool
): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const dec0 = 10 ** pool.token0Decimals;
  const dec1 = 10 ** pool.token1Decimals;
  const p0 = pool.token0PriceUsd || FALLBACK_STX_PRICE_USD;
  const p1 = pool.token1PriceUsd || FALLBACK_STX_PRICE_USD;

  const fetches: Promise<void>[] = [];
  for (let i = activeBin - radius; i <= activeBin + radius; i++) {
    fetches.push(
      (async (binId: number) => {
        try {
          const res = await callReadOnly("get-bin-reserves", [cvUint(poolId), cvUint(binId)]);
          const f = parseTupleFields(res?.result ?? "");
          const rx = parseSomeUint(f["reserve-x"] ?? "0x09") / dec0;
          const ry = parseSomeUint(f["reserve-y"] ?? "0x09") / dec1;
          const total = rx * p0 + ry * p1;
          if (total > 0) {
            bins.push({
              binId,
              reserveX: rx,
              reserveY: ry,
              totalUsd: total,
              pctX: total > 0 ? (rx * p0) / total : 0,
              pctY: total > 0 ? (ry * p1) / total : 0,
            });
          }
        } catch {}
      })(i)
    );
  }
  await Promise.all(fetches);
  bins.sort((a, b) => a.binId - b.binId);
  return bins;
}

// ── Analysis ─────────────────────────────────────────────────────────────────

function computeBinProfile(bins: BinReserves[], activeBin: number): BinAgingProfile {
  const totalUsd = bins.reduce((s, b) => s + b.totalUsd, 0);
  let productive = 0;
  let dormant = 0;
  let depleted = 0;
  let asymmetrySum = 0;
  let peakBin = bins[0]?.binId ?? activeBin;
  let peakVal = 0;
  let weightedPos = 0;
  let totalWeight = 0;

  for (const b of bins) {
    const asym = Math.abs(b.pctX - b.pctY);
    asymmetrySum += asym;

    if (b.totalUsd > totalUsd * 0.01) {
      productive++;
    } else if (b.totalUsd > 0) {
      dormant++;
    } else {
      depleted++;
    }

    if (b.totalUsd > peakVal) {
      peakVal = b.totalUsd;
      peakBin = b.binId;
    }

    weightedPos += b.binId * b.totalUsd;
    totalWeight += b.totalUsd;
  }

  const weightedCenter = totalWeight > 0 ? weightedPos / totalWeight : activeBin;
  const skew = weightedCenter - activeBin;

  return {
    totalBins: bins.length,
    productiveBins: productive,
    dormantBins: dormant,
    depletedBins: depleted,
    avgAsymmetry: bins.length > 0 ? asymmetrySum / bins.length : 0,
    peakReserveBin: peakBin,
    reserveDistributionSkew: skew,
  };
}

function computeAgingMetrics(
  bins: BinReserves[],
  profile: BinAgingProfile,
  activeBin: number,
  feeYieldAnnualPct: number,
  volumeToTvl: number
): AgingMetrics {
  if (bins.length === 0) {
    return {
      rangeCenterBin: activeBin,
      activeBin,
      driftBins: 0,
      driftPct: 0,
      rangeSpan: 0,
      activeBinsCount: 0,
      feeCaptureDecayPct: 100,
      rangeUtilizationPct: 0,
      productiveBinsPct: 0,
      stalenessScore: 100,
      ageClass: "EXPIRED",
      estimatedLifeDays: 0,
      driftVelocityBinsPerDay: 0,
      feeYieldAnnualPct,
      effectiveYieldPct: 0,
    };
  }

  const minBin = bins[0].binId;
  const maxBin = bins[bins.length - 1].binId;
  const rangeSpan = maxBin - minBin + 1;
  const rangeCenterBin = Math.round((minBin + maxBin) / 2);

  const driftBins = Math.abs(activeBin - rangeCenterBin);
  const halfRange = rangeSpan / 2;
  const driftPct = halfRange > 0 ? (driftBins / halfRange) * 100 : 0;

  const binsNearActive = bins.filter(b => Math.abs(b.binId - activeBin) <= 2);
  const totalUsd = bins.reduce((s, b) => s + b.totalUsd, 0);
  const nearActiveUsd = binsNearActive.reduce((s, b) => s + b.totalUsd, 0);
  const rangeUtilizationPct = totalUsd > 0 ? (nearActiveUsd / totalUsd) * 100 : 0;

  const productiveBinsPct = bins.length > 0 ? (profile.productiveBins / bins.length) * 100 : 0;

  const feeCaptureDecayPct = Math.max(0, 100 - driftPct * 0.8 - (100 - rangeUtilizationPct) * 0.3);

  const effectiveYieldPct = feeYieldAnnualPct * (feeCaptureDecayPct / 100);

  const driftWeight = Math.min(driftPct / 100, 1) * 35;
  const utilizationWeight = ((100 - rangeUtilizationPct) / 100) * 25;
  const asymmetryWeight = Math.min(profile.avgAsymmetry, 1) * 20;
  const productiveWeight = ((100 - productiveBinsPct) / 100) * 20;
  const stalenessScore = Math.min(100, driftWeight + utilizationWeight + asymmetryWeight + productiveWeight);

  const ageClass = classifyAge(stalenessScore);

  const dailyFeeCaptureLossPct = volumeToTvl > 0.01 ? 0.5 : 0.2;
  const remainingCapture = feeCaptureDecayPct;
  const estimatedLifeDays = dailyFeeCaptureLossPct > 0
    ? Math.max(0, remainingCapture / dailyFeeCaptureLossPct)
    : 999;

  const driftVelocityBinsPerDay = volumeToTvl > 0.1 ? 0.8 : volumeToTvl > 0.05 ? 0.4 : 0.15;

  return {
    rangeCenterBin,
    activeBin,
    driftBins,
    driftPct: Math.min(driftPct, 100),
    rangeSpan,
    activeBinsCount: binsNearActive.length,
    feeCaptureDecayPct,
    rangeUtilizationPct,
    productiveBinsPct,
    stalenessScore,
    ageClass,
    estimatedLifeDays: Math.min(estimatedLifeDays, 999),
    driftVelocityBinsPerDay,
    feeYieldAnnualPct,
    effectiveYieldPct,
  };
}

function generateProjections(metrics: AgingMetrics): DecayProjection[] {
  const periods = [7, 14, 30, 60, 90];
  return periods.map(days => {
    const projectedDrift = metrics.driftBins + metrics.driftVelocityBinsPerDay * days;
    const halfRange = metrics.rangeSpan / 2;
    const projectedDriftPct = halfRange > 0 ? (projectedDrift / halfRange) * 100 : 100;
    const projectedDecay = Math.max(0, 100 - projectedDriftPct * 0.8 - days * 0.1);
    const projectedStaleness = Math.min(100, metrics.stalenessScore + days * 0.3);
    const projectedClass = classifyAge(projectedStaleness);

    let recommendation = "HOLD";
    if (projectedClass === "EXPIRED") recommendation = "CLOSE — position likely expired";
    else if (projectedClass === "STALE") recommendation = "REBALANCE — position going stale";
    else if (projectedClass === "AGING") recommendation = "MONITOR — aging accelerating";
    else if (projectedClass === "MATURING") recommendation = "HOLD — normal maturation";
    else recommendation = "HOLD — still fresh";

    return {
      daysFromNow: days,
      estimatedDriftBins: Math.round(projectedDrift * 10) / 10,
      projectedFeeCaptureDecay: Math.round(projectedDecay * 10) / 10,
      projectedAgeClass: projectedClass,
      recommendation,
    };
  });
}

// ── Display ──────────────────────────────────────────────────────────────────

function printAnalysis(a: PoolAgingAnalysis): void {
  const m = a.metrics;
  const p = a.binProfile;

  console.log(`\n${"═".repeat(70)}`);
  console.log(`  Pool #${a.poolId}: ${a.pair}  ${ageEmoji(m.ageClass)} ${m.ageClass}`);
  console.log(`${"═".repeat(70)}`);
  console.log(`  TVL: ${fmtUsd(a.tvlUsd)} | Vol 24h: ${fmtUsd(a.volume24hUsd)} | Fee: ${a.feeBps}bps`);
  console.log(`  Active Bin: ${m.activeBin} | Range Center: ${m.rangeCenterBin} | Drift: ${m.driftBins} bins (${fmtPct(m.driftPct)})`);
  console.log();

  console.log(`  ── Aging Metrics ──`);
  console.log(`  Staleness Score:      ${m.stalenessScore.toFixed(1)} / 100 (${m.ageClass})`);
  console.log(`  Fee Capture Decay:    ${fmtPct(m.feeCaptureDecayPct)} remaining`);
  console.log(`  Range Utilization:    ${fmtPct(m.rangeUtilizationPct)}`);
  console.log(`  Productive Bins:      ${fmtPct(m.productiveBinsPct)} (${p.productiveBins}/${p.totalBins})`);
  console.log(`  Nominal Yield:        ${fmtPct(m.feeYieldAnnualPct)} APY`);
  console.log(`  Effective Yield:      ${fmtPct(m.effectiveYieldPct)} APY (after decay)`);
  console.log(`  Drift Velocity:       ~${m.driftVelocityBinsPerDay.toFixed(2)} bins/day`);
  console.log(`  Est. Productive Life: ${m.estimatedLifeDays < 999 ? `${Math.round(m.estimatedLifeDays)} days` : "999+ days"}`);
  console.log();

  console.log(`  ── Bin Profile ──`);
  console.log(`  Total: ${p.totalBins} | Productive: ${p.productiveBins} | Dormant: ${p.dormantBins} | Depleted: ${p.depletedBins}`);
  console.log(`  Avg Asymmetry: ${fmtPct(p.avgAsymmetry * 100)} | Peak Reserve Bin: ${p.peakReserveBin}`);
  console.log(`  Distribution Skew: ${p.reserveDistributionSkew > 0 ? "+" : ""}${p.reserveDistributionSkew.toFixed(1)} bins from active`);
  console.log();

  // Aging decay bar
  const barLen = 40;
  const captureBar = Math.round((m.feeCaptureDecayPct / 100) * barLen);
  const bar = "█".repeat(captureBar) + "░".repeat(barLen - captureBar);
  console.log(`  Fee Capture: [${bar}] ${fmtPct(m.feeCaptureDecayPct)}`);
  console.log();

  if (a.projections.length > 0) {
    console.log(`  ── Decay Projections ──`);
    console.log(`  ${"Days".padEnd(6)} ${"Drift".padEnd(10)} ${"Capture".padEnd(10)} ${"Class".padEnd(12)} Action`);
    console.log(`  ${"─".repeat(56)}`);
    for (const proj of a.projections) {
      console.log(
        `  ${String(proj.daysFromNow).padEnd(6)} ` +
        `${(proj.estimatedDriftBins.toFixed(1) + " bins").padEnd(10)} ` +
        `${fmtPct(proj.projectedFeeCaptureDecay).padEnd(10)} ` +
        `${(ageEmoji(proj.projectedAgeClass) + " " + proj.projectedAgeClass).padEnd(12)} ` +
        proj.recommendation
      );
    }
    console.log();
  }

  if (a.recommendations.length > 0) {
    console.log(`  ── Recommendations ──`);
    for (const rec of a.recommendations) {
      console.log(`  • ${rec}`);
    }
  }
}

function printSummary(analyses: PoolAgingAnalysis[]): void {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  POSITION AGING SUMMARY — ${analyses.length} pools analyzed`);
  console.log(`${"═".repeat(70)}`);
  console.log();

  const sorted = [...analyses].sort((a, b) => a.metrics.stalenessScore - b.metrics.stalenessScore);

  console.log(`  ${"Pool".padEnd(8)} ${"Pair".padEnd(18)} ${"Staleness".padEnd(12)} ${"Class".padEnd(12)} ${"Capture".padEnd(10)} ${"Life".padEnd(10)} Eff.Yield`);
  console.log(`  ${"─".repeat(68)}`);
  for (const a of sorted) {
    const m = a.metrics;
    const life = m.estimatedLifeDays < 999 ? `${Math.round(m.estimatedLifeDays)}d` : "999+d";
    console.log(
      `  ${String(a.poolId).padEnd(8)} ` +
      `${a.pair.padEnd(18)} ` +
      `${m.stalenessScore.toFixed(1).padStart(5).padEnd(12)} ` +
      `${(ageEmoji(m.ageClass) + " " + m.ageClass).padEnd(12)} ` +
      `${fmtPct(m.feeCaptureDecayPct).padEnd(10)} ` +
      `${life.padEnd(10)} ` +
      fmtPct(m.effectiveYieldPct)
    );
  }

  const freshCount = sorted.filter(a => a.metrics.ageClass === "FRESH").length;
  const staleCount = sorted.filter(a => a.metrics.ageClass === "STALE" || a.metrics.ageClass === "EXPIRED").length;
  const avgStaleness = sorted.reduce((s, a) => s + a.metrics.stalenessScore, 0) / sorted.length;

  console.log();
  console.log(`  Fresh: ${freshCount} | Stale/Expired: ${staleCount} | Avg Staleness: ${avgStaleness.toFixed(1)}`);
  console.log(`  Legend: Staleness 0=perfectly fresh, 100=fully expired. Capture = remaining fee efficiency.`);
  console.log();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function analyzePool(pool: AppPool, _stxPriceUsd: number): Promise<PoolAgingAnalysis | null> {
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
  const metrics = computeAgingMetrics(bins, profile, activeBin, feeYieldAnnualPct, volumeToTvl);
  const projections = generateProjections(metrics);

  const recommendations: string[] = [];
  if (metrics.ageClass === "EXPIRED") {
    recommendations.push("Position has effectively expired — active bin far outside range, close and re-enter");
  }
  if (metrics.ageClass === "STALE") {
    recommendations.push("Position is stale — fee capture severely degraded, rebalance to recenter around active bin");
  }
  if (metrics.feeCaptureDecayPct < 30) {
    recommendations.push(`Only ${fmtPct(metrics.feeCaptureDecayPct)} fee capture remaining — most liquidity is dormant`);
  }
  if (metrics.driftBins > metrics.rangeSpan * 0.4) {
    recommendations.push(`Active bin has drifted ${metrics.driftBins} bins from center — approaching range boundary`);
  }
  if (metrics.effectiveYieldPct < metrics.feeYieldAnnualPct * 0.3) {
    recommendations.push("Effective yield <30% of nominal — position aging has severely eroded returns");
  }
  if (metrics.estimatedLifeDays < 14) {
    recommendations.push(`Estimated productive life under 2 weeks — plan exit or rebalance soon`);
  }
  if (profile.dormantBins > profile.productiveBins) {
    recommendations.push("More dormant than productive bins — capital is increasingly idle");
  }
  if (metrics.ageClass === "FRESH" && metrics.rangeUtilizationPct > 60) {
    recommendations.push("Position is fresh with strong range utilization — no action needed");
  }
  if (metrics.driftVelocityBinsPerDay > 0.5 && metrics.ageClass !== "FRESH") {
    recommendations.push("High drift velocity — position aging faster than average, monitor closely");
  }

  return {
    poolId,
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    feeBps,
    activeBinId: activeBin,
    metrics,
    binProfile: profile,
    projections,
    recommendations,
  };
}

async function main() {
  const prog = new Command();
  prog
    .name("hodlmm-position-aging")
    .description("HODLMM Position Aging Analyzer — measures LP position effectiveness decay over time")
    .option("-p, --pool <id>", "Specific pool ID to analyze")
    .option("-t, --top <n>", "Analyze top N pools by TVL", "5")
    .option("--projections", "Show detailed decay projections for each pool")
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

  console.log(`Analyzing ${targetPools.length} pools for position aging...\n`);

  const analyses: PoolAgingAnalysis[] = [];
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
