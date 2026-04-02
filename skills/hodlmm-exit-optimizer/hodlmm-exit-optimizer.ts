#!/usr/bin/env bun
/**
 * hodlmm-exit-optimizer.ts
 * Determines optimal exit timing for Bitflow HODLMM concentrated LP positions.
 * Analyzes position drift, fee exhaustion, IL breakeven, and market conditions
 * to recommend HOLD / MONITOR / EXIT with urgency scoring.
 *
 * Author: cocoa007 (Fluid Briar) — FastPool CEO
 * Competition: AIBTC x BFF Skills Comp Day 17
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
  "Exit recommendations are snapshot-based estimates. Market conditions, " +
  "volume, and liquidity change constantly. Always cross-check with " +
  "il-calculator and safety-check before closing positions. Not financial advice.";

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
    headers: { Accept: "application/json", "User-Agent": "hodlmm-exit-optimizer/1.0" },
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
// IL calculations
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
// Drift analysis — how far has price moved from position center
// ---------------------------------------------------------------------------
interface DriftResult {
  drift_bins: number;
  drift_pct: number;
  drift_direction: "above" | "below" | "centered";
  in_range: boolean;
  range_utilization_pct: number;
  bins_earning_fees: number;
  total_position_bins: number;
}

function analyzeDrift(
  activeBin: number,
  posLow: number,
  posHigh: number,
  binStep: number,
  bins: BinData[]
): DriftResult {
  const posCenter = Math.round((posLow + posHigh) / 2);
  const driftBins = activeBin - posCenter;
  const stepMult = 1 + binStep / 10000;
  const driftPct = round2((Math.pow(stepMult, Math.abs(driftBins)) - 1) * 100 * Math.sign(driftBins));
  const inRange = activeBin >= posLow && activeBin <= posHigh;
  const totalBins = posHigh - posLow + 1;

  // Count bins in position range that have liquidity (earning fees)
  let binsEarning = 0;
  for (let binId = posLow; binId <= posHigh; binId++) {
    const bin = bins.find(b => getBinId(b) === binId);
    if (bin && getBinLiquidity(bin) > 0) binsEarning++;
  }

  const rangeUtil = totalBins > 0 ? round2(binsEarning / totalBins * 100) : 0;

  return {
    drift_bins: driftBins,
    drift_pct: driftPct,
    drift_direction: driftBins > 0 ? "above" : driftBins < 0 ? "below" : "centered",
    in_range: inRange,
    range_utilization_pct: rangeUtil,
    bins_earning_fees: binsEarning,
    total_position_bins: totalBins,
  };
}

// ---------------------------------------------------------------------------
// Fee exhaustion — is the position still generating meaningful fees
// ---------------------------------------------------------------------------
interface FeeExhaustionResult {
  daily_fee_yield_pct: number;
  projected_30d_fee_pct: number;
  volume_to_tvl_ratio: number;
  fee_status: "generating" | "declining" | "exhausted";
  fee_rank: string;
}

function analyzeFeeExhaustion(
  volume24h: number,
  feeBps: number,
  tvlUsd: number,
  posLow: number,
  posHigh: number,
  activeBin: number,
  bins: BinData[]
): FeeExhaustionResult {
  const vtRatio = tvlUsd > 0 ? round4(volume24h / tvlUsd) : 0;

  // Estimate what fraction of pool fees this position captures
  let totalLiq = 0;
  let positionLiq = 0;
  for (const bin of bins) {
    const liq = getBinLiquidity(bin);
    totalLiq += liq;
    const id = getBinId(bin);
    if (id >= posLow && id <= posHigh) positionLiq += liq;
  }
  const concentrationFactor = totalLiq > 0 ? positionLiq / totalLiq : 0;

  // Only bins near active bin earn fees — if position is out of range, fees drop
  const inRange = activeBin >= posLow && activeBin <= posHigh;
  const effectiveConcentration = inRange ? concentrationFactor : concentrationFactor * 0.05;

  const dailyFee = feeIncomePct(volume24h, feeBps, effectiveConcentration, tvlUsd, 1);
  const projected30d = round4(dailyFee * 30);

  let feeStatus: "generating" | "declining" | "exhausted";
  if (!inRange || dailyFee < 0.001) {
    feeStatus = "exhausted";
  } else if (vtRatio < 0.05 || dailyFee < 0.01) {
    feeStatus = "declining";
  } else {
    feeStatus = "generating";
  }

  let feeRank: string;
  if (dailyFee >= 0.1) feeRank = "excellent";
  else if (dailyFee >= 0.03) feeRank = "good";
  else if (dailyFee >= 0.01) feeRank = "moderate";
  else if (dailyFee > 0) feeRank = "low";
  else feeRank = "zero";

  return {
    daily_fee_yield_pct: round4(dailyFee),
    projected_30d_fee_pct: projected30d,
    volume_to_tvl_ratio: vtRatio,
    fee_status: feeStatus,
    fee_rank: feeRank,
  };
}

// ---------------------------------------------------------------------------
// IL breakeven analysis
// ---------------------------------------------------------------------------
interface ILBreakevenResult {
  current_il_pct: number;
  il_severity: "negligible" | "moderate" | "significant" | "severe";
  days_of_fees_to_recover: number | null;
  fee_vs_il_ratio: number;
  breakeven_status: "fees_ahead" | "breakeven" | "il_ahead" | "deep_loss";
}

function analyzeILBreakeven(
  activeBin: number,
  posLow: number,
  posHigh: number,
  binStep: number,
  dailyFeePct: number
): ILBreakevenResult {
  const posCenter = Math.round((posLow + posHigh) / 2);
  const driftBins = Math.abs(activeBin - posCenter);
  const stepMult = 1 + binStep / 10000;
  const priceRatio = Math.pow(stepMult, driftBins);
  const binCount = posHigh - posLow + 1;

  const currentIL = concentratedILPct(priceRatio, binCount, binStep);

  let ilSeverity: "negligible" | "moderate" | "significant" | "severe";
  if (Math.abs(currentIL) < 1) ilSeverity = "negligible";
  else if (Math.abs(currentIL) < 5) ilSeverity = "moderate";
  else if (Math.abs(currentIL) < 15) ilSeverity = "significant";
  else ilSeverity = "severe";

  const absIL = Math.abs(currentIL);
  let daysToRecover: number | null = null;
  if (dailyFeePct > 0 && absIL > 0) {
    daysToRecover = Math.ceil(absIL / dailyFeePct);
  }

  const feeVsIL = dailyFeePct > 0 && absIL > 0 ? round4(dailyFeePct * 30 / absIL) : dailyFeePct > 0 ? 999 : 0;

  let breakevenStatus: "fees_ahead" | "breakeven" | "il_ahead" | "deep_loss";
  if (feeVsIL >= 2) breakevenStatus = "fees_ahead";
  else if (feeVsIL >= 0.8) breakevenStatus = "breakeven";
  else if (feeVsIL >= 0.3) breakevenStatus = "il_ahead";
  else breakevenStatus = "deep_loss";

  return {
    current_il_pct: currentIL,
    il_severity: ilSeverity,
    days_of_fees_to_recover: daysToRecover,
    fee_vs_il_ratio: feeVsIL,
    breakeven_status: breakevenStatus,
  };
}

// ---------------------------------------------------------------------------
// Exit urgency scoring (0-10)
// ---------------------------------------------------------------------------
interface ExitScore {
  score: number;
  signal: "HOLD" | "MONITOR" | "EXIT";
  components: {
    drift_penalty: number;
    fee_exhaustion_penalty: number;
    il_penalty: number;
    range_utilization_bonus: number;
  };
  reasoning: string;
}

function computeExitScore(
  drift: DriftResult,
  fees: FeeExhaustionResult,
  ilBreakeven: ILBreakevenResult
): ExitScore {
  // Drift penalty: 0 (centered) to 10 (far out of range)
  const driftPenalty = drift.in_range
    ? Math.min(Math.abs(drift.drift_bins) / (drift.total_position_bins / 2) * 3, 3)
    : Math.min(3 + Math.abs(drift.drift_bins) / 10 * 7, 10);

  // Fee exhaustion penalty: 0 (generating) to 10 (exhausted)
  let feePenalty: number;
  if (fees.fee_status === "generating") feePenalty = fees.fee_rank === "excellent" ? 0 : 1;
  else if (fees.fee_status === "declining") feePenalty = 4;
  else feePenalty = 8;

  // IL penalty: 0 (negligible) to 10 (severe + not recoverable)
  let ilPenalty: number;
  if (ilBreakeven.breakeven_status === "fees_ahead") ilPenalty = 0;
  else if (ilBreakeven.breakeven_status === "breakeven") ilPenalty = 2;
  else if (ilBreakeven.breakeven_status === "il_ahead") ilPenalty = 5;
  else ilPenalty = 9;

  // Range utilization bonus: reduces urgency if many bins still earning
  const utilBonus = drift.in_range ? round2(drift.range_utilization_pct / 100 * 2) : 0;

  const rawScore = round2(
    0.35 * driftPenalty + 0.30 * feePenalty + 0.35 * ilPenalty - utilBonus
  );
  const score = round2(Math.max(0, Math.min(10, rawScore)));

  let signal: "HOLD" | "MONITOR" | "EXIT";
  if (score >= 6) signal = "EXIT";
  else if (score >= 3) signal = "MONITOR";
  else signal = "HOLD";

  const reasons: string[] = [];
  if (!drift.in_range) reasons.push("price has drifted out of position range");
  if (fees.fee_status === "exhausted") reasons.push("fees have dried up");
  if (fees.fee_status === "declining") reasons.push("fee generation is declining");
  if (ilBreakeven.breakeven_status === "deep_loss") reasons.push("IL significantly exceeds fee income");
  if (ilBreakeven.breakeven_status === "il_ahead") reasons.push("IL outpacing fees");
  if (score < 3 && drift.in_range) reasons.push("position is healthy and earning fees");
  if (reasons.length === 0) reasons.push("mixed signals — review components individually");

  return {
    score,
    signal,
    components: {
      drift_penalty: round2(driftPenalty),
      fee_exhaustion_penalty: round2(feePenalty),
      il_penalty: round2(ilPenalty),
      range_utilization_bonus: utilBonus,
    },
    reasoning: reasons.join("; "),
  };
}

// ---------------------------------------------------------------------------
// Reentry suggestion — if exiting, where to re-enter
// ---------------------------------------------------------------------------
interface ReentryHint {
  suggested_range: { low: number; high: number; count: number };
  range_width_pct: number;
  rationale: string;
}

function suggestReentry(
  activeBin: number,
  oldLow: number,
  oldHigh: number,
  binStep: number,
  bins: BinData[]
): ReentryHint {
  const oldWidth = oldHigh - oldLow + 1;
  const halfWidth = Math.floor(oldWidth / 2);
  const newLow = activeBin - halfWidth;
  const newHigh = activeBin + halfWidth;

  const stepMult = 1 + binStep / 10000;
  const halfRange = oldWidth / 2;
  const rangeWidthPct = round2((Math.pow(stepMult, halfRange) - Math.pow(stepMult, -halfRange)) * 100);

  // Check if re-centering around active bin avoids crowded bins
  const binsInRange = bins.filter(b => {
    const id = getBinId(b);
    return id >= newLow && id <= newHigh;
  });
  const avgLiq = binsInRange.length > 0
    ? binsInRange.reduce((s, b) => s + getBinLiquidity(b), 0) / binsInRange.length
    : 0;

  const allLiq = bins.filter(b => getBinLiquidity(b) > 0).map(b => getBinLiquidity(b));
  const globalAvg = allLiq.length > 0 ? allLiq.reduce((s, v) => s + v, 0) / allLiq.length : 0;

  const crowded = globalAvg > 0 && avgLiq > globalAvg * 1.5;

  return {
    suggested_range: { low: newLow, high: newHigh, count: oldWidth },
    range_width_pct: rangeWidthPct,
    rationale: crowded
      ? `Re-centered ${oldWidth}-bin range on active bin ${activeBin}. Note: this range is crowded (${round2(avgLiq / globalAvg)}x avg liquidity). Consider widening or shifting.`
      : `Re-centered ${oldWidth}-bin range on active bin ${activeBin}. Liquidity density is reasonable for re-entry.`,
  };
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
      ? "All data sources reachable. Ready to analyze exit timing."
      : "Some data sources unavailable — analysis may be incomplete.",
  });
}

async function cmdAssess(opts: { poolId: string; posLow: number; posHigh: number; holdDays: number }): Promise<void> {
  const { poolId, posLow, posHigh, holdDays } = opts;

  if (posLow >= posHigh) {
    output({ error: "pos-low must be less than pos-high" });
    process.exit(1);
  }

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

  const drift = analyzeDrift(activeBin, posLow, posHigh, binStep, bins);
  const fees = analyzeFeeExhaustion(volume24h, feeBps, tvlUsd, posLow, posHigh, activeBin, bins);
  const ilBreakeven = analyzeILBreakeven(activeBin, posLow, posHigh, binStep, fees.daily_fee_yield_pct);
  const exitScore = computeExitScore(drift, fees, ilBreakeven);

  // Projected outcome if holding for specified days
  const projectedFees = round4(fees.daily_fee_yield_pct * holdDays);
  const projectedNet = round4(projectedFees + ilBreakeven.current_il_pct);

  const warnings: string[] = [];
  if (!drift.in_range) {
    warnings.push(`Position is OUT OF RANGE — active bin ${activeBin} is ${Math.abs(drift.drift_bins)} bins from your range [${posLow}-${posHigh}]. No fees accruing.`);
  }
  if (fees.fee_status === "exhausted" && drift.in_range) {
    warnings.push("In range but volume is too low to generate meaningful fees.");
  }
  if (ilBreakeven.il_severity === "severe") {
    warnings.push(`Severe IL: ${ilBreakeven.current_il_pct.toFixed(2)}%. ${ilBreakeven.days_of_fees_to_recover ? `Would take ~${ilBreakeven.days_of_fees_to_recover} days of current fees to recover.` : "Cannot recover at current fee rate."}`);
  }
  if (holdDays > 30 && !drift.in_range) {
    warnings.push("Holding out-of-range for 30+ days compounds opportunity cost.");
  }

  // Action items
  const actions: string[] = [];
  if (exitScore.signal === "EXIT") {
    actions.push("Consider removing liquidity and re-entering at current active bin.");
    actions.push(`Validate with: bun run hodlmm-entry-optimizer/hodlmm-entry-optimizer.ts scout --pool-id ${poolId}`);
  } else if (exitScore.signal === "MONITOR") {
    actions.push("Set a price alert for when active bin approaches your range boundaries.");
    actions.push(`Re-check in 24h: bun run hodlmm-exit-optimizer/hodlmm-exit-optimizer.ts assess --pool-id ${poolId} --pos-low ${posLow} --pos-high ${posHigh}`);
  } else {
    actions.push("Position is healthy. Continue holding and collecting fees.");
    actions.push(`Monitor IL: bun run hodlmm-il-calculator/hodlmm-il-calculator.ts assess --pool-id ${poolId} --bin-range ${posLow}-${posHigh}`);
  }

  // Reentry hint if exit is recommended
  const reentry = exitScore.signal === "EXIT"
    ? suggestReentry(activeBin, posLow, posHigh, binStep, bins)
    : null;

  output({
    status: "success",
    pool_id: poolId,
    pool_name: poolName,
    active_bin: activeBin,
    bin_step: binStep,
    position: { low: posLow, high: posHigh, bins: posHigh - posLow + 1 },
    pool_metrics: {
      tvl_usd: tvlUsd,
      volume_24h_usd: volume24h,
      fee_bps: feeBps,
    },
    drift,
    fee_analysis: fees,
    il_breakeven: ilBreakeven,
    exit_score: exitScore,
    hold_projection: {
      hold_days: holdDays,
      projected_fee_pct: projectedFees,
      current_il_pct: ilBreakeven.current_il_pct,
      projected_net_pct: projectedNet,
      verdict: projectedNet >= 0
        ? `Holding ${holdDays}d projects net positive: +${projectedNet.toFixed(2)}%`
        : `Holding ${holdDays}d projects net negative: ${projectedNet.toFixed(2)}%`,
    },
    reentry_hint: reentry,
    actions,
    warnings,
    disclaimer: DISCLAIMER,
  });
}

async function cmdScan(opts: { wallet?: string; topN: number }): Promise<void> {
  let appPools: AppPool[];
  let qPools: QuotesPool[];

  try {
    [appPools, qPools] = await Promise.all([fetchAppPools(), fetchQuotesPools()]);
  } catch (e) {
    output({ error: `Failed to fetch pool data: ${String(e)}` });
    process.exit(1);
  }

  // Find all DLMM pools
  const dlmmPools = appPools.filter(p => {
    const id = getPoolId(p);
    return id.startsWith("dlmm") || id.includes("hodlmm");
  });

  if (dlmmPools.length === 0) {
    output({ error: "No DLMM pools found" });
    process.exit(1);
  }

  // Analyze each pool for exit pressure indicators
  const poolScores: Array<{
    pool_id: string;
    pool_name: string;
    volume_24h: number;
    tvl: number;
    vt_ratio: number;
    fee_bps: number;
    active_bin: number;
    exit_pressure: "low" | "medium" | "high";
    note: string;
  }> = [];

  for (const appPool of dlmmPools) {
    const poolId = getPoolId(appPool);
    const qPool = qPools.find(p => getPoolId(p) === poolId);
    if (!qPool) continue;

    const activeBin = getActiveBinId(qPool);
    const volume24h = getVolume24h(appPool);
    const tvlUsd = getTvl(appPool);
    const feeBps = getFeeBps(appPool, qPool);
    const vtRatio = tvlUsd > 0 ? round4(volume24h / tvlUsd) : 0;

    let exitPressure: "low" | "medium" | "high";
    let note: string;

    if (vtRatio < 0.02) {
      exitPressure = "high";
      note = "Very low volume:TVL — fees unlikely to offset IL";
    } else if (vtRatio < 0.1) {
      exitPressure = "medium";
      note = "Moderate volume:TVL — check position-specific IL";
    } else {
      exitPressure = "low";
      note = "Healthy volume:TVL — fees likely covering IL";
    }

    poolScores.push({
      pool_id: poolId,
      pool_name: getPoolName(appPool),
      volume_24h: volume24h,
      tvl: tvlUsd,
      vt_ratio: vtRatio,
      fee_bps: feeBps,
      active_bin: activeBin,
      exit_pressure: exitPressure,
      note,
    });
  }

  // Sort by exit pressure (high first), then by volume:TVL ascending
  const pressureOrder = { high: 0, medium: 1, low: 2 };
  poolScores.sort((a, b) => {
    const diff = pressureOrder[a.exit_pressure] - pressureOrder[b.exit_pressure];
    if (diff !== 0) return diff;
    return a.vt_ratio - b.vt_ratio;
  });

  const topPools = poolScores.slice(0, opts.topN);

  output({
    status: "success",
    total_dlmm_pools: dlmmPools.length,
    analyzed: poolScores.length,
    showing: topPools.length,
    pools: topPools,
    summary: {
      high_pressure: poolScores.filter(p => p.exit_pressure === "high").length,
      medium_pressure: poolScores.filter(p => p.exit_pressure === "medium").length,
      low_pressure: poolScores.filter(p => p.exit_pressure === "low").length,
    },
    note: "Exit pressure is pool-level. For position-specific exit timing, use 'assess' with your bin range.",
    disclaimer: DISCLAIMER,
  });
}

async function cmdBreakeven(opts: { poolId: string; posLow: number; posHigh: number }): Promise<void> {
  const { poolId, posLow, posHigh } = opts;

  if (posLow >= posHigh) {
    output({ error: "pos-low must be less than pos-high" });
    process.exit(1);
  }

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

  const fees = analyzeFeeExhaustion(volume24h, feeBps, tvlUsd, posLow, posHigh, activeBin, bins);
  const binCount = posHigh - posLow + 1;
  const stepMult = 1 + binStep / 10000;

  // Calculate IL at various price move scenarios
  const scenarios = [0.95, 0.9, 0.85, 0.8, 0.7, 1.05, 1.1, 1.15, 1.2, 1.3];
  const breakevenTable = scenarios.map(ratio => {
    const ilPct = concentratedILPct(ratio, binCount, binStep);
    const daysToBreakeven = fees.daily_fee_yield_pct > 0
      ? Math.ceil(Math.abs(ilPct) / fees.daily_fee_yield_pct)
      : null;
    const priceMovePct = round2((ratio - 1) * 100);

    return {
      price_move_pct: priceMovePct,
      il_pct: ilPct,
      days_to_breakeven: daysToBreakeven,
      feasible: daysToBreakeven !== null && daysToBreakeven <= 365,
    };
  });

  // Find the maximum price move where breakeven is feasible within 30 days
  const feasible30d = breakevenTable
    .filter(s => s.days_to_breakeven !== null && s.days_to_breakeven <= 30)
    .sort((a, b) => Math.abs(b.price_move_pct) - Math.abs(a.price_move_pct));

  const maxSafe30d = feasible30d.length > 0
    ? `Position can absorb up to ${Math.abs(feasible30d[0].price_move_pct)}% price move and break even within 30 days at current fee rate.`
    : "At current fee rates, even small price moves may not break even within 30 days.";

  output({
    status: "success",
    pool_id: poolId,
    pool_name: poolName,
    position: { low: posLow, high: posHigh, bins: binCount },
    current_daily_fee_pct: fees.daily_fee_yield_pct,
    fee_status: fees.fee_status,
    breakeven_table: breakevenTable,
    max_safe_move_30d: maxSafe30d,
    interpretation: fees.daily_fee_yield_pct > 0
      ? `At ${fees.daily_fee_yield_pct.toFixed(4)}%/day fee yield, each 1% of IL takes ~${Math.ceil(1 / fees.daily_fee_yield_pct)} days to recover.`
      : "No fee income detected — any IL is a pure loss at current volume.",
    disclaimer: DISCLAIMER,
  });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const program = new Command();

program
  .name("hodlmm-exit-optimizer")
  .description("Determine optimal exit timing for Bitflow HODLMM concentrated LP positions.")
  .version("1.0.0");

program
  .command("doctor")
  .description("Check Bitflow API connectivity")
  .action(async () => {
    try { await cmdDoctor(); } catch (e) { output({ error: String(e) }); process.exit(1); }
  });

program
  .command("assess")
  .description("Full exit analysis for a specific position — HOLD / MONITOR / EXIT with urgency scoring")
  .requiredOption("--pool-id <id>", "Pool ID (e.g. dlmm_1)")
  .requiredOption("--pos-low <bin>", "Lower bin of your position", parseInt)
  .requiredOption("--pos-high <bin>", "Upper bin of your position", parseInt)
  .option("--hold-days <days>", "Projected hold duration in days", "30")
  .action(async (opts) => {
    try {
      await cmdAssess({
        poolId: opts.poolId,
        posLow: opts.posLow,
        posHigh: opts.posHigh,
        holdDays: parseInt(opts.holdDays) || 30,
      });
    } catch (e) { output({ error: String(e) }); process.exit(1); }
  });

program
  .command("scan")
  .description("Scan all DLMM pools for exit pressure indicators — find pools where LPs should be cautious")
  .option("--top <n>", "Number of pools to show", "10")
  .action(async (opts) => {
    try {
      await cmdScan({ topN: parseInt(opts.top) || 10 });
    } catch (e) { output({ error: String(e) }); process.exit(1); }
  });

program
  .command("breakeven")
  .description("IL breakeven table — how many days of fees to recover from various price moves")
  .requiredOption("--pool-id <id>", "Pool ID (e.g. dlmm_1)")
  .requiredOption("--pos-low <bin>", "Lower bin of your position", parseInt)
  .requiredOption("--pos-high <bin>", "Upper bin of your position", parseInt)
  .action(async (opts) => {
    try {
      await cmdBreakeven({ poolId: opts.poolId, posLow: opts.posLow, posHigh: opts.posHigh });
    } catch (e) { output({ error: String(e) }); process.exit(1); }
  });

program.parse(process.argv);
