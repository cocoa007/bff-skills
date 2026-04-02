#!/usr/bin/env bun
/**
 * hodlmm-entry-optimizer.ts
 * Finds optimal bin ranges for new Bitflow HODLMM concentrated LP positions.
 * Analyzes liquidity distribution, volume hotspots, and fee/IL tradeoffs
 * to recommend where to place liquidity.
 *
 * Author: cocoa007 (Fluid Briar) — FastPool CEO
 * Competition: AIBTC x BFF Skills Comp Day 16
 *
 * Read-only. No wallet required. No transactions.
 * All data from Bitflow public APIs.
 */

import { Command } from "commander";

// ---------------------------------------------------------------------------
// API endpoints
// ---------------------------------------------------------------------------
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const BFF_QUOTES_BASE = "https://bff.bitflowapis.finance/api/quotes/v1";

const DISCLAIMER =
  "Entry recommendations are snapshot-based estimates. Liquidity distribution, " +
  "volume, and bin occupancy change constantly. Always verify with safety-check " +
  "and il-calculator before deploying capital. Not financial advice.";

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------
interface AppPool {
  pool_id?: string;
  poolId?: string;
  pool_name?: string;
  name?: string;
  volume_24h?: number;
  volume24h?: number;
  volumeUsd1d?: number;
  tvl?: number;
  tvlUsd?: number;
  apr?: number;
  fee_bps?: number;
  fee?: number;
  baseFee?: number;
  binStep?: number;
  token_x?: { symbol: string; decimals: number; price_usd?: number };
  token_y?: { symbol: string; decimals: number; price_usd?: number };
  [key: string]: unknown;
}

interface QuotesPool {
  pool_id: string;
  active_bin_id?: number;
  activeBinId?: number;
  bin_step?: number;
  binStep?: number;
  fee_bps?: number;
  [key: string]: unknown;
}

interface BinData {
  bin_id: number;
  id?: number;
  reserve_x?: number;
  reserveX?: number;
  reserve_y?: number;
  reserveY?: number;
  liquidity?: number;
  price?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "hodlmm-entry-optimizer/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Data fetchers
// ---------------------------------------------------------------------------
async function fetchAppPools(): Promise<AppPool[]> {
  const data = await fetchJson(`${BFF_APP_BASE}/pools`);
  if (Array.isArray(data)) return data as AppPool[];
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.data)) return d.data as AppPool[];
  if (Array.isArray(d.pools)) return d.pools as AppPool[];
  throw new Error("Unexpected pools response shape");
}

async function fetchQuotesPools(): Promise<QuotesPool[]> {
  const data = await fetchJson(`${BFF_QUOTES_BASE}/pools`);
  if (Array.isArray(data)) return data as QuotesPool[];
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.pools)) return d.pools as QuotesPool[];
  if (Array.isArray(d.data)) return d.data as QuotesPool[];
  throw new Error("Unexpected quotes pools response shape");
}

async function fetchBins(poolId: string): Promise<BinData[]> {
  const data = await fetchJson(`${BFF_QUOTES_BASE}/bins/${poolId}`);
  if (Array.isArray(data)) return data as BinData[];
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.bins)) return d.bins as BinData[];
  if (Array.isArray(d.data)) return d.data as BinData[];
  return [];
}

// ---------------------------------------------------------------------------
// Pool resolution helpers
// ---------------------------------------------------------------------------
function getPoolId(pool: AppPool | QuotesPool): string {
  return ((pool as AppPool).poolId ?? pool.pool_id ?? "") as string;
}

function getActiveBinId(qp: QuotesPool): number {
  return ((qp as Record<string, unknown>).active_bin ?? qp.active_bin_id ?? qp.activeBinId ?? 0) as number;
}

function getBinStep(qp: QuotesPool): number {
  return (qp.bin_step ?? qp.binStep ?? 10) as number;
}

function getFeeBps(appPool: AppPool, qPool: QuotesPool): number {
  const raw = appPool.baseFee ?? appPool.fee_bps ?? appPool.fee ?? qPool.fee_bps ?? 0.003;
  if (typeof raw === "number" && raw < 1) return Math.round(raw * 10000);
  return raw as number;
}

function getVolume24h(appPool: AppPool): number {
  return (appPool.volumeUsd1d ?? appPool.volume_24h ?? appPool.volume24h ?? 0) as number;
}

function getTvl(appPool: AppPool): number {
  return (appPool.tvlUsd ?? appPool.tvl ?? 0) as number;
}

function getPoolName(appPool: AppPool): string {
  return (appPool.pool_name ?? appPool.name ?? getPoolId(appPool)) as string;
}

function getBinId(bin: BinData): number {
  return (bin.bin_id ?? bin.id ?? 0) as number;
}

function getBinLiquidity(bin: BinData): number {
  if (bin.liquidity != null) {
    const v = Number(bin.liquidity);
    if (!isNaN(v) && v > 0) return v;
  }
  const rx = Number(bin.reserve_x ?? bin.reserveX ?? 0) || 0;
  const ry = Number(bin.reserve_y ?? bin.reserveY ?? 0) || 0;
  return rx + ry;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function output(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// IL calculation (same core as il-calculator)
// ---------------------------------------------------------------------------
function standardIL(priceRatio: number): number {
  if (priceRatio <= 0) return -1;
  return 2 * Math.sqrt(priceRatio) / (1 + priceRatio) - 1;
}

function concentratedILPct(priceRatio: number, binCount: number, binStep: number): number {
  const stepMult = 1 + binStep / 10000;
  const halfRange = binCount / 2;
  const priceLow = Math.pow(stepMult, -halfRange);
  const priceHigh = Math.pow(stepMult, halfRange);
  const sqrtRatio = Math.sqrt(priceLow / priceHigh);
  const amplification = sqrtRatio < 1 ? 1 / (1 - sqrtRatio) : 100;
  const inRange = priceRatio >= priceLow && priceRatio <= priceHigh;

  if (inRange) {
    return round4(standardIL(priceRatio) * amplification * 100);
  }
  // Out of range: simplified worst case
  if (priceRatio < priceLow) {
    const posValue = priceRatio / priceLow;
    const hodlValue = (1 + priceRatio) / 2;
    return round4((posValue * priceLow / hodlValue - 1) * 100);
  }
  const posValue = priceHigh;
  const hodlValue = (1 + priceRatio) / 2;
  return round4(Math.max((posValue / hodlValue / 2 - 1) * 100, -99));
}

function feeIncomePct(
  volume24hUsd: number,
  feeBps: number,
  concentrationFactor: number,
  totalPoolTvlUsd: number,
  days: number
): number {
  if (totalPoolTvlUsd === 0) return 0;
  const dailyFeeYieldPct = (volume24hUsd * (feeBps / 10000) * concentrationFactor) / totalPoolTvlUsd * 100;
  return round4(dailyFeeYieldPct * days);
}

// ---------------------------------------------------------------------------
// Gini coefficient for liquidity distribution
// ---------------------------------------------------------------------------
function giniCoefficient(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  if (mean === 0) return 0;

  let sumDiffs = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumDiffs += Math.abs(sorted[i] - sorted[j]);
    }
  }
  return round4(sumDiffs / (2 * n * n * mean));
}

// ---------------------------------------------------------------------------
// Core analysis
// ---------------------------------------------------------------------------
interface RangeRecommendation {
  label: string;
  risk_level: string;
  bin_range: { low: number; high: number; count: number };
  range_width_pct: number;
  projected_fee_pct_30d: number;
  il_at_10pct_move: number;
  net_pnl_30d_10pct: number;
  competition_density: number;
  entry_score: number;
  interpretation: string;
}

interface GapEntry {
  bin_id: number;
  liquidity: number;
  vs_avg_pct: number;
  distance_from_active: number;
  opportunity: string;
}

function analyzeRange(
  activeBin: number,
  halfWidth: number,
  bins: BinData[],
  binStep: number,
  feeBps: number,
  volume24h: number,
  tvlUsd: number,
  allBinsAvgLiq: number
): { range: { low: number; high: number; count: number }; feePct30d: number; ilAt10: number; compDensity: number } {
  const low = activeBin - halfWidth;
  const high = activeBin + halfWidth;
  const count = high - low + 1;

  // Concentration: what fraction of total liquidity is in this range
  let totalLiq = 0;
  let rangeLiq = 0;
  for (const bin of bins) {
    const id = getBinId(bin);
    const liq = getBinLiquidity(bin);
    totalLiq += liq;
    if (id >= low && id <= high) rangeLiq += liq;
  }
  const concentrationFactor = totalLiq > 0 ? rangeLiq / totalLiq : 0.5;

  // Competition density: how full are the bins in this range vs average
  const rangeBins = bins.filter(b => { const id = getBinId(b); return id >= low && id <= high; });
  const rangeAvgLiq = rangeBins.length > 0
    ? rangeBins.reduce((s, b) => s + getBinLiquidity(b), 0) / rangeBins.length
    : 0;
  const compDensity = allBinsAvgLiq > 0 ? round4(rangeAvgLiq / allBinsAvgLiq) : 1;

  const feePct30d = feeIncomePct(volume24h, feeBps, concentrationFactor, tvlUsd, 30);
  const ilAt10 = concentratedILPct(0.9, count, binStep);

  return { range: { low, high, count }, feePct30d, ilAt10, compDensity };
}

function computeEntryScore(feePct: number, compDensity: number, ilAt10: number, maxFeePct: number): number {
  // Normalize fee potential (0-10)
  const feePotential = maxFeePct > 0 ? Math.min(feePct / maxFeePct, 1) * 10 : 5;
  // Gap opportunity: lower competition = better (invert density)
  const gapOpp = Math.max(0, Math.min(10, (1 - Math.min(compDensity, 2) / 2) * 10));
  // IL safety: less IL = better
  const ilSafety = Math.max(0, Math.min(10, (1 - Math.abs(ilAt10) / 20) * 10));

  return round2(0.4 * feePotential + 0.35 * gapOpp + 0.25 * ilSafety);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdDoctor(): Promise<void> {
  const checks: Array<{ check: string; status: "ok" | "error"; detail: string }> = [];

  try {
    const pools = await fetchAppPools();
    const dlmm = pools.filter(p => { const id = getPoolId(p); return id.startsWith("dlmm") || id.includes("hodlmm"); });
    checks.push({ check: "bitflow_app_pools", status: "ok", detail: `${pools.length} pools, ${dlmm.length} DLMM` });
  } catch (e) {
    checks.push({ check: "bitflow_app_pools", status: "error", detail: String(e) });
  }

  try {
    const qPools = await fetchQuotesPools();
    const active = qPools.filter(p => getActiveBinId(p) > 0);
    checks.push({ check: "bitflow_quotes_pools", status: "ok", detail: `${qPools.length} pools, ${active.length} with active bins` });
  } catch (e) {
    checks.push({ check: "bitflow_quotes_pools", status: "error", detail: String(e) });
  }

  try {
    const bins = await fetchBins("dlmm_1");
    const withLiq = bins.filter(b => getBinLiquidity(b) > 0);
    checks.push({ check: "bitflow_bins_api", status: "ok", detail: `${bins.length} bins, ${withLiq.length} with liquidity` });
  } catch (e) {
    checks.push({ check: "bitflow_bins_api", status: "error", detail: String(e) });
  }

  const allOk = checks.every(c => c.status === "ok");
  output({
    status: allOk ? "ready" : "degraded",
    checks,
    message: allOk
      ? "All data sources reachable. Ready to optimize entries."
      : "Some data sources unavailable — analysis may be incomplete.",
  });
}

async function cmdScout(opts: { poolId: string; budget: number }): Promise<void> {
  const { poolId, budget } = opts;

  let appPool: AppPool | undefined;
  let qPool: QuotesPool | undefined;

  try {
    const [appPools, qPools] = await Promise.all([fetchAppPools(), fetchQuotesPools()]);
    appPool = appPools.find(p => getPoolId(p) === poolId);
    qPool = qPools.find(p => getPoolId(p) === poolId);

    if (!appPool || !qPool) {
      const available = appPools.map(p => getPoolId(p)).filter(Boolean).join(", ");
      output({ error: `Pool ${poolId} not found. Available: ${available}` });
      process.exit(1);
    }
  } catch (e) {
    output({ error: `Failed to fetch pool data: ${String(e)}` });
    process.exit(1);
  }

  const activeBin = getActiveBinId(qPool);
  const binStep = getBinStep(qPool) || (appPool.binStep as number) || 10;
  const feeBps = getFeeBps(appPool, qPool);
  const volume24h = getVolume24h(appPool);
  const tvlUsd = getTvl(appPool);
  const poolName = getPoolName(appPool);

  let bins: BinData[] = [];
  try {
    bins = await fetchBins(poolId);
  } catch {
    // Continue with empty bins
  }

  const binsWithLiq = bins.filter(b => getBinLiquidity(b) > 0);
  const allLiquidity = binsWithLiq.map(b => getBinLiquidity(b));
  const avgLiq = allLiquidity.length > 0 ? allLiquidity.reduce((s, v) => s + v, 0) / allLiquidity.length : 0;
  const liqGini = giniCoefficient(allLiquidity);

  // Analyze three range widths: tight (5), medium (11), wide (21)
  const configs: Array<{ label: string; risk: string; halfWidth: number }> = [
    { label: "tight", risk: "high", halfWidth: 2 },
    { label: "medium", risk: "medium", halfWidth: 5 },
    { label: "wide", risk: "low", halfWidth: 10 },
  ];

  const analyses = configs.map(c => ({
    ...c,
    ...analyzeRange(activeBin, c.halfWidth, bins, binStep, feeBps, volume24h, tvlUsd, avgLiq),
  }));

  // Max fee for normalization
  const maxFee = Math.max(...analyses.map(a => a.feePct30d), 0.01);

  const recommendations: RangeRecommendation[] = analyses.map(a => {
    const score = computeEntryScore(a.feePct30d, a.compDensity, a.ilAt10, maxFee);
    const stepMult = 1 + binStep / 10000;
    const halfRange = a.range.count / 2;
    const rangeWidthPct = round2((Math.pow(stepMult, halfRange) - Math.pow(stepMult, -halfRange)) * 100);
    const netPnl = round4(a.feePct30d + a.ilAt10);

    return {
      label: a.label,
      risk_level: a.risk,
      bin_range: a.range,
      range_width_pct: rangeWidthPct,
      projected_fee_pct_30d: a.feePct30d,
      il_at_10pct_move: a.ilAt10,
      net_pnl_30d_10pct: netPnl,
      competition_density: a.compDensity,
      entry_score: score,
      interpretation:
        score >= 7 ? `Strong entry — ${a.feePct30d.toFixed(2)}% projected fees with manageable IL` :
        score >= 4 ? `Moderate — check IL calculator before entering at this width` :
        `Weak — high IL risk relative to fee income at this range`,
    };
  });

  // Sort by entry score descending
  recommendations.sort((a, b) => b.entry_score - a.entry_score);

  // Find liquidity gaps near active bin (±15 bins)
  const gapRadius = 15;
  const nearbyBins: GapEntry[] = [];
  for (let offset = -gapRadius; offset <= gapRadius; offset++) {
    const binId = activeBin + offset;
    const bin = bins.find(b => getBinId(b) === binId);
    const liq = bin ? getBinLiquidity(bin) : 0;
    const vsAvg = avgLiq > 0 ? round2((liq - avgLiq) / avgLiq * 100) : 0;
    nearbyBins.push({
      bin_id: binId,
      liquidity: round2(liq),
      vs_avg_pct: vsAvg,
      distance_from_active: Math.abs(offset),
      opportunity: vsAvg < -50 ? "HIGH" : vsAvg < -20 ? "MEDIUM" : "LOW",
    });
  }

  // Top gaps (highest opportunity bins closest to active)
  const topGaps = nearbyBins
    .filter(b => b.opportunity !== "LOW")
    .sort((a, b) => a.vs_avg_pct - b.vs_avg_pct)
    .slice(0, 10);

  const warnings: string[] = [];
  if (volume24h < 10000) {
    warnings.push(`Low 24h volume ($${volume24h.toLocaleString()}). Fee projections unreliable.`);
  }
  if (liqGini < 0.15) {
    warnings.push("Liquidity is evenly distributed — no standout gap opportunities.");
  }
  if (binsWithLiq.length < 5) {
    warnings.push("Very few bins have liquidity. Pool may be new or illiquid.");
  }
  if (budget > 0 && tvlUsd > 0) {
    const impactPct = round2(budget / tvlUsd * 100);
    if (impactPct > 5) {
      warnings.push(`Budget ($${budget}) is ${impactPct}% of pool TVL — your entry will significantly shift liquidity distribution.`);
    }
  }

  const best = recommendations[0];
  output({
    status: "success",
    pool_id: poolId,
    pool_name: poolName,
    active_bin: activeBin,
    bin_step: binStep,
    pool_metrics: {
      tvl_usd: tvlUsd,
      volume_24h_usd: volume24h,
      fee_bps: feeBps,
      volume_to_tvl_ratio: tvlUsd > 0 ? round4(volume24h / tvlUsd) : 0,
    },
    landscape: {
      total_bins_with_liquidity: binsWithLiq.length,
      bins_analyzed: nearbyBins.length,
      avg_liquidity_per_bin: round2(avgLiq),
      liquidity_gini: liqGini,
    },
    recommendations,
    top_gaps: topGaps,
    best_entry: {
      recommendation: best.label,
      reason: `${best.label} range (${best.bin_range.count} bins) scores ${best.entry_score}/10 — ` +
        `${best.projected_fee_pct_30d.toFixed(2)}% projected 30d fees, ` +
        `${best.il_at_10pct_move.toFixed(2)}% IL at 10% price move, ` +
        `competition density ${best.competition_density.toFixed(2)}`,
    },
    budget_note: budget > 0
      ? `$${budget} budget = ${tvlUsd > 0 ? round2(budget / tvlUsd * 100) : "?"}% of pool TVL`
      : "No budget specified — entry scores are relative, not absolute",
    warnings,
    disclaimer: DISCLAIMER,
  });
}

async function cmdNarrow(opts: { poolId: string; risk: string }): Promise<void> {
  const { poolId, risk } = opts;

  const halfWidthMap: Record<string, number> = { low: 10, med: 5, high: 2 };
  const halfWidth = halfWidthMap[risk] ?? 5;
  const riskLabel = risk === "low" ? "conservative" : risk === "high" ? "aggressive" : "balanced";

  let appPool: AppPool | undefined;
  let qPool: QuotesPool | undefined;

  try {
    const [appPools, qPools] = await Promise.all([fetchAppPools(), fetchQuotesPools()]);
    appPool = appPools.find(p => getPoolId(p) === poolId);
    qPool = qPools.find(p => getPoolId(p) === poolId);

    if (!appPool || !qPool) {
      const available = appPools.map(p => getPoolId(p)).filter(Boolean).join(", ");
      output({ error: `Pool ${poolId} not found. Available: ${available}` });
      process.exit(1);
    }
  } catch (e) {
    output({ error: `Failed to fetch pool data: ${String(e)}` });
    process.exit(1);
  }

  const activeBin = getActiveBinId(qPool);
  const binStep = getBinStep(qPool) || (appPool.binStep as number) || 10;
  const feeBps = getFeeBps(appPool, qPool);
  const volume24h = getVolume24h(appPool);
  const tvlUsd = getTvl(appPool);
  const poolName = getPoolName(appPool);

  let bins: BinData[] = [];
  try {
    bins = await fetchBins(poolId);
  } catch {
    // Continue
  }

  const allLiquidity = bins.filter(b => getBinLiquidity(b) > 0).map(b => getBinLiquidity(b));
  const avgLiq = allLiquidity.length > 0 ? allLiquidity.reduce((s, v) => s + v, 0) / allLiquidity.length : 0;

  const analysis = analyzeRange(activeBin, halfWidth, bins, binStep, feeBps, volume24h, tvlUsd, avgLiq);
  const score = computeEntryScore(analysis.feePct30d, analysis.compDensity, analysis.ilAt10, analysis.feePct30d || 1);

  const stepMult = 1 + binStep / 10000;
  const halfRange = analysis.range.count / 2;
  const rangeWidthPct = round2((Math.pow(stepMult, halfRange) - Math.pow(stepMult, -halfRange)) * 100);
  const netPnl = round4(analysis.feePct30d + analysis.ilAt10);

  const warnings: string[] = [];
  if (volume24h < 10000) warnings.push("Low 24h volume — fee projections unreliable.");
  if (risk === "high" && analysis.ilAt10 < -5) {
    warnings.push(`Aggressive range with ${analysis.ilAt10.toFixed(1)}% IL at 10% move. Consider 'med' risk if you plan to hold 30+ days.`);
  }

  output({
    status: "success",
    pool_id: poolId,
    pool_name: poolName,
    risk_preference: riskLabel,
    recommendation: {
      bin_range: analysis.range,
      range_width_pct: rangeWidthPct,
      projected_fee_pct_30d: analysis.feePct30d,
      il_at_10pct_move: analysis.ilAt10,
      net_pnl_30d_10pct: netPnl,
      competition_density: analysis.compDensity,
      entry_score: score,
    },
    action: netPnl >= 0
      ? `ENTER — ${riskLabel} range nets positive after 30d fees even with 10% price move`
      : `CAUTION — ${riskLabel} range nets ${netPnl.toFixed(2)}% after 30d with 10% move. Wider range or shorter hold may help.`,
    next_steps: [
      `Validate IL: bun run hodlmm-il-calculator/hodlmm-il-calculator.ts assess --pool-id ${poolId} --bin-range ${analysis.range.low}-${analysis.range.high}`,
      `Safety check: bun run hodlmm-safety-check/hodlmm-safety-check.ts check --pool-id ${poolId}`,
    ],
    warnings,
    disclaimer: DISCLAIMER,
  });
}

async function cmdGaps(opts: { poolId: string }): Promise<void> {
  const { poolId } = opts;

  let appPool: AppPool | undefined;
  let qPool: QuotesPool | undefined;

  try {
    const [appPools, qPools] = await Promise.all([fetchAppPools(), fetchQuotesPools()]);
    appPool = appPools.find(p => getPoolId(p) === poolId);
    qPool = qPools.find(p => getPoolId(p) === poolId);

    if (!appPool || !qPool) {
      const available = appPools.map(p => getPoolId(p)).filter(Boolean).join(", ");
      output({ error: `Pool ${poolId} not found. Available: ${available}` });
      process.exit(1);
    }
  } catch (e) {
    output({ error: `Failed to fetch pool data: ${String(e)}` });
    process.exit(1);
  }

  const activeBin = getActiveBinId(qPool);
  const binStep = getBinStep(qPool) || (appPool.binStep as number) || 10;
  const poolName = getPoolName(appPool);

  let bins: BinData[] = [];
  try {
    bins = await fetchBins(poolId);
  } catch (e) {
    output({ error: `Failed to fetch bin data: ${String(e)}` });
    process.exit(1);
  }

  if (bins.length === 0) {
    output({ error: `No bin data available for ${poolId}` });
    process.exit(1);
  }

  const binsWithLiq = bins.filter(b => getBinLiquidity(b) > 0);
  const allLiquidity = binsWithLiq.map(b => getBinLiquidity(b));
  const avgLiq = allLiquidity.reduce((s, v) => s + v, 0) / allLiquidity.length;
  const medianLiq = [...allLiquidity].sort((a, b) => a - b)[Math.floor(allLiquidity.length / 2)] || 0;
  const liqGini = giniCoefficient(allLiquidity);

  // Analyze bins within ±20 of active bin
  const radius = 20;
  const gapEntries: GapEntry[] = [];

  for (let offset = -radius; offset <= radius; offset++) {
    const binId = activeBin + offset;
    const bin = bins.find(b => getBinId(b) === binId);
    const liq = bin ? getBinLiquidity(bin) : 0;
    const vsAvg = avgLiq > 0 ? round2((liq - avgLiq) / avgLiq * 100) : 0;

    gapEntries.push({
      bin_id: binId,
      liquidity: round2(liq),
      vs_avg_pct: vsAvg,
      distance_from_active: Math.abs(offset),
      opportunity: vsAvg < -60 ? "HIGH" : vsAvg < -30 ? "MEDIUM" : vsAvg < 0 ? "LOW" : "NONE",
    });
  }

  // Sort by opportunity (most underserved first), then by distance from active
  const gaps = gapEntries
    .filter(g => g.opportunity !== "NONE")
    .sort((a, b) => {
      const oppOrder = { HIGH: 0, MEDIUM: 1, LOW: 2, NONE: 3 };
      const diff = oppOrder[a.opportunity as keyof typeof oppOrder] - oppOrder[b.opportunity as keyof typeof oppOrder];
      if (diff !== 0) return diff;
      return a.distance_from_active - b.distance_from_active;
    });

  // Suggest a gap-optimized range: find the cluster of underserved bins closest to active
  let bestGapRange: { low: number; high: number } | null = null;
  if (gaps.length >= 2) {
    // Find consecutive gap bins near active
    const gapBinIds = gaps.filter(g => g.opportunity !== "LOW").map(g => g.bin_id).sort((a, b) => a - b);
    if (gapBinIds.length >= 2) {
      bestGapRange = { low: gapBinIds[0], high: gapBinIds[gapBinIds.length - 1] };
    }
  }

  output({
    status: "success",
    pool_id: poolId,
    pool_name: poolName,
    active_bin: activeBin,
    bin_step: binStep,
    distribution: {
      total_bins_with_liquidity: binsWithLiq.length,
      avg_liquidity: round2(avgLiq),
      median_liquidity: round2(medianLiq),
      gini_coefficient: liqGini,
      gini_interpretation: liqGini > 0.5 ? "Highly concentrated — large gaps exist" :
        liqGini > 0.3 ? "Moderately concentrated — some gaps" : "Evenly distributed — few gaps",
    },
    gaps,
    gap_optimized_range: bestGapRange
      ? {
          ...bestGapRange,
          count: bestGapRange.high - bestGapRange.low + 1,
          note: "Range covering the most underserved bins near active price",
        }
      : { note: "No significant liquidity gaps found near active bin" },
    total_gaps: gaps.length,
    high_opportunity_gaps: gaps.filter(g => g.opportunity === "HIGH").length,
    disclaimer: DISCLAIMER,
  });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const program = new Command();

program
  .name("hodlmm-entry-optimizer")
  .description("Find optimal bin ranges for new Bitflow HODLMM concentrated LP positions.")
  .version("1.0.0");

program
  .command("doctor")
  .description("Check Bitflow API connectivity")
  .action(async () => {
    try { await cmdDoctor(); } catch (e) { output({ error: String(e) }); process.exit(1); }
  });

program
  .command("scout")
  .description("Full entry analysis with recommendations at three risk levels")
  .requiredOption("--pool-id <id>", "Pool ID (e.g. dlmm_1)")
  .option("--budget <usd>", "Budget in USD (for impact estimation)", "0")
  .action(async (opts) => {
    try {
      await cmdScout({ poolId: opts.poolId, budget: parseFloat(opts.budget) || 0 });
    } catch (e) { output({ error: String(e) }); process.exit(1); }
  });

program
  .command("narrow")
  .description("Single range recommendation tuned to risk preference")
  .requiredOption("--pool-id <id>", "Pool ID (e.g. dlmm_1)")
  .option("--risk <level>", "Risk level: low, med, high", "med")
  .action(async (opts) => {
    try {
      await cmdNarrow({ poolId: opts.poolId, risk: opts.risk });
    } catch (e) { output({ error: String(e) }); process.exit(1); }
  });

program
  .command("gaps")
  .description("Raw liquidity gap analysis — find underserved bins")
  .requiredOption("--pool-id <id>", "Pool ID (e.g. dlmm_1)")
  .action(async (opts) => {
    try {
      await cmdGaps({ poolId: opts.poolId });
    } catch (e) { output({ error: String(e) }); process.exit(1); }
  });

program.parse(process.argv);
