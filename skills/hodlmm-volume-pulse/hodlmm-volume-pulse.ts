#!/usr/bin/env bun
/**
 * hodlmm-volume-pulse.ts
 * Fee generation intensity tracker for Bitflow HODLMM pools.
 * Monitors volume:TVL efficiency ratios to identify optimal LP timing.
 *
 * Author: cocoa007 (Fluid Briar) — FastPool CEO
 * Competition: AIBTC x BFF Skills Comp Day 13
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

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------
interface AppPool {
  pool_id: string;
  pool_name?: string;
  name?: string;
  volume_24h?: number;
  volume24h?: number;
  tvl?: number;
  apr?: number;
  fee_bps?: number;
  fee?: number;
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
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "hodlmm-volume-pulse/1.0" },
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
  if (Array.isArray(d.pools)) return d.pools as AppPool[];
  if (Array.isArray(d.data)) return d.data as AppPool[];
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
// Field accessors
// ---------------------------------------------------------------------------
function getVolume24h(p: AppPool): number {
  return (p.volume_24h ?? p.volume24h ?? 0) as number;
}

function getTvl(p: AppPool): number {
  return (p.tvl ?? 0) as number;
}

function getPoolName(p: AppPool): string {
  return (p.pool_name ?? p.name ?? p.pool_id) as string;
}

function getFeeBps(ap: AppPool, qp: QuotesPool): number {
  const raw = ap.fee_bps ?? ap.fee ?? qp.fee_bps ?? 30;
  if (typeof raw === "number" && raw < 1) return Math.round(raw * 10000);
  return raw as number;
}

function getActiveBinId(qp: QuotesPool): number {
  return (qp.active_bin_id ?? qp.activeBinId ?? 0) as number;
}

function getBinStep(qp: QuotesPool): number {
  return (qp.bin_step ?? qp.binStep ?? 10) as number;
}

function getBinLiquidity(bin: BinData): number {
  if (typeof bin.liquidity === "number") return bin.liquidity;
  const rx = (bin.reserve_x ?? bin.reserveX ?? 0) as number;
  const ry = (bin.reserve_y ?? bin.reserveY ?? 0) as number;
  return rx + ry;
}

function getBinId(bin: BinData): number {
  return (bin.bin_id ?? bin.id ?? 0) as number;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// Efficiency metrics
// ---------------------------------------------------------------------------

interface PoolPulse {
  pool_id: string;
  pool_name: string;
  volume_24h_usd: number;
  tvl_usd: number;
  fee_bps: number;
  efficiency_ratio: number; // volume / TVL — higher = more fee generation per $ locked
  daily_fee_generation_usd: number;
  fee_yield_daily_pct: number;
  fee_yield_annual_pct: number;
  active_bin: number;
  bin_step: number;
  signal: "HOT" | "WARM" | "COOL" | "COLD";
  signal_reason: string;
}

function classifySignal(
  efficiencyRatio: number,
  dailyFeePct: number,
  tvl: number,
  volume: number
): { signal: "HOT" | "WARM" | "COOL" | "COLD"; reason: string } {
  // HOT: efficiency > 2x (volume is 2x TVL) — fee generation is intense
  // WARM: efficiency 0.5-2x — healthy activity
  // COOL: efficiency 0.1-0.5x — moderate
  // COLD: efficiency < 0.1x — low activity, not worth LP'ing

  if (tvl < 100) {
    return { signal: "COLD", reason: "TVL too low (<$100) — pool may be inactive or bootstrapping" };
  }
  if (volume < 100) {
    return { signal: "COLD", reason: "Near-zero volume — no fee generation" };
  }
  if (efficiencyRatio >= 2.0) {
    return {
      signal: "HOT",
      reason: `Volume is ${efficiencyRatio.toFixed(1)}x TVL — exceptional fee generation. Good time to LP.`,
    };
  }
  if (efficiencyRatio >= 0.5) {
    return {
      signal: "WARM",
      reason: `Healthy volume:TVL ratio (${efficiencyRatio.toFixed(2)}x). Decent fee opportunity.`,
    };
  }
  if (efficiencyRatio >= 0.1) {
    return {
      signal: "COOL",
      reason: `Moderate activity (${efficiencyRatio.toFixed(2)}x volume:TVL). Fees are modest.`,
    };
  }
  return {
    signal: "COLD",
    reason: `Low activity (${efficiencyRatio.toFixed(3)}x volume:TVL). Fee income unlikely to justify IL risk.`,
  };
}

// ---------------------------------------------------------------------------
// Liquidity concentration analysis
// ---------------------------------------------------------------------------

interface ConcentrationProfile {
  total_bins: number;
  bins_with_liquidity: number;
  active_bin_share_pct: number;
  top_5_bin_share_pct: number;
  gini_coefficient: number; // 0 = perfectly even, 1 = all in one bin
  profile: "hyper-concentrated" | "concentrated" | "spread" | "even";
}

function analyzeConcentration(
  bins: BinData[],
  activeBinId: number
): ConcentrationProfile {
  const withLiq = bins.filter((b) => getBinLiquidity(b) > 0);
  const totalLiq = withLiq.reduce((sum, b) => sum + getBinLiquidity(b), 0);

  if (totalLiq === 0 || withLiq.length === 0) {
    return {
      total_bins: bins.length,
      bins_with_liquidity: 0,
      active_bin_share_pct: 0,
      top_5_bin_share_pct: 0,
      gini_coefficient: 0,
      profile: "even",
    };
  }

  // Active bin share
  const activeBin = withLiq.find((b) => getBinId(b) === activeBinId);
  const activeBinShare = activeBin ? getBinLiquidity(activeBin) / totalLiq : 0;

  // Top 5 bins share
  const sorted = [...withLiq].sort((a, b) => getBinLiquidity(b) - getBinLiquidity(a));
  const top5Liq = sorted.slice(0, 5).reduce((sum, b) => sum + getBinLiquidity(b), 0);
  const top5Share = top5Liq / totalLiq;

  // Gini coefficient
  const n = withLiq.length;
  const liquidity = withLiq.map((b) => getBinLiquidity(b)).sort((a, b) => a - b);
  let giniNumerator = 0;
  for (let i = 0; i < n; i++) {
    giniNumerator += (2 * (i + 1) - n - 1) * liquidity[i];
  }
  const gini = n > 1 ? giniNumerator / (n * totalLiq) : 0;

  let profile: ConcentrationProfile["profile"];
  if (gini > 0.8 || activeBinShare > 0.5) profile = "hyper-concentrated";
  else if (gini > 0.5 || top5Share > 0.7) profile = "concentrated";
  else if (gini > 0.3) profile = "spread";
  else profile = "even";

  return {
    total_bins: bins.length,
    bins_with_liquidity: withLiq.length,
    active_bin_share_pct: round4(activeBinShare * 100),
    top_5_bin_share_pct: round4(top5Share * 100),
    gini_coefficient: round4(gini),
    profile,
  };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

// doctor — verify API connectivity
async function cmdDoctor(): Promise<void> {
  const checks: Array<{ check: string; status: "ok" | "error"; detail: string }> = [];

  try {
    const pools = await fetchAppPools();
    const dlmm = pools.filter(
      (p) => p.pool_id?.startsWith("dlmm") || p.pool_id?.includes("hodlmm")
    );
    checks.push({
      check: "bitflow_app_pools",
      status: "ok",
      detail: `${pools.length} pools total, ${dlmm.length} DLMM pools`,
    });
  } catch (e) {
    checks.push({ check: "bitflow_app_pools", status: "error", detail: String(e) });
  }

  try {
    const qPools = await fetchQuotesPools();
    const active = qPools.filter((p) => getActiveBinId(p) > 0);
    checks.push({
      check: "bitflow_quotes_pools",
      status: "ok",
      detail: `${qPools.length} pools, ${active.length} with active bins`,
    });
  } catch (e) {
    checks.push({ check: "bitflow_quotes_pools", status: "error", detail: String(e) });
  }

  try {
    const bins = await fetchBins("dlmm_1");
    const withLiq = bins.filter((b) => getBinLiquidity(b) > 0);
    checks.push({
      check: "bitflow_bins_api",
      status: "ok",
      detail: `${bins.length} bins total, ${withLiq.length} with liquidity`,
    });
  } catch (e) {
    checks.push({ check: "bitflow_bins_api", status: "error", detail: String(e) });
  }

  const allOk = checks.every((c) => c.status === "ok");
  output({
    status: allOk ? "ready" : "degraded",
    checks,
    message: allOk
      ? "All data sources reachable. Ready to scan fee generation intensity."
      : "Some data sources unavailable — pulse readings may be incomplete.",
  });
}

// pulse — snapshot of volume:TVL efficiency across all DLMM pools
async function cmdPulse(opts: { pools: string; sort: string }): Promise<void> {
  let appPools: AppPool[];
  let qPools: QuotesPool[];

  try {
    [appPools, qPools] = await Promise.all([fetchAppPools(), fetchQuotesPools()]);
  } catch (e) {
    output({ error: `Failed to fetch pool data: ${String(e)}` });
    process.exit(1);
  }

  // Filter pools
  let filterIds: string[] | null = null;
  if (opts.pools && opts.pools.trim() !== "") {
    filterIds = opts.pools.split(",").map((s) => s.trim());
  }

  const dlmmPools = appPools.filter((p) => {
    if (filterIds) return filterIds.includes(p.pool_id);
    return p.pool_id?.startsWith("dlmm") || p.pool_id?.includes("hodlmm");
  });

  if (dlmmPools.length === 0) {
    output({ error: "No DLMM pools found matching filter." });
    process.exit(1);
  }

  const pulses: PoolPulse[] = [];

  for (const ap of dlmmPools) {
    const qp = qPools.find((q) => q.pool_id === ap.pool_id);
    const volume = getVolume24h(ap);
    const tvl = getTvl(ap);
    const feeBps = qp ? getFeeBps(ap, qp) : ((ap.fee_bps ?? 30) as number);
    const activeBin = qp ? getActiveBinId(qp) : 0;
    const binStep = qp ? getBinStep(qp) : 10;

    const efficiencyRatio = tvl > 0 ? round4(volume / tvl) : 0;
    const dailyFees = volume * (feeBps / 10000);
    const dailyFeePct = tvl > 0 ? round4((dailyFees / tvl) * 100) : 0;
    const annualFeePct = round4(dailyFeePct * 365);

    const { signal, reason } = classifySignal(efficiencyRatio, dailyFeePct, tvl, volume);

    pulses.push({
      pool_id: ap.pool_id,
      pool_name: getPoolName(ap),
      volume_24h_usd: volume,
      tvl_usd: tvl,
      fee_bps: feeBps,
      efficiency_ratio: efficiencyRatio,
      daily_fee_generation_usd: round4(dailyFees),
      fee_yield_daily_pct: dailyFeePct,
      fee_yield_annual_pct: annualFeePct,
      active_bin: activeBin,
      bin_step: binStep,
      signal,
      signal_reason: reason,
    });
  }

  // Sort
  const sortKey = opts.sort || "efficiency";
  if (sortKey === "volume") {
    pulses.sort((a, b) => b.volume_24h_usd - a.volume_24h_usd);
  } else if (sortKey === "tvl") {
    pulses.sort((a, b) => b.tvl_usd - a.tvl_usd);
  } else if (sortKey === "fees") {
    pulses.sort((a, b) => b.daily_fee_generation_usd - a.daily_fee_generation_usd);
  } else if (sortKey === "yield") {
    pulses.sort((a, b) => b.fee_yield_annual_pct - a.fee_yield_annual_pct);
  } else {
    // Default: efficiency ratio
    pulses.sort((a, b) => b.efficiency_ratio - a.efficiency_ratio);
  }

  const hot = pulses.filter((p) => p.signal === "HOT");
  const warm = pulses.filter((p) => p.signal === "WARM");
  const cool = pulses.filter((p) => p.signal === "COOL");
  const cold = pulses.filter((p) => p.signal === "COLD");

  const totalVolume = pulses.reduce((s, p) => s + p.volume_24h_usd, 0);
  const totalTvl = pulses.reduce((s, p) => s + p.tvl_usd, 0);
  const totalDailyFees = pulses.reduce((s, p) => s + p.daily_fee_generation_usd, 0);

  output({
    status: "success",
    timestamp: new Date().toISOString(),
    summary: {
      pools_scanned: pulses.length,
      hot: hot.length,
      warm: warm.length,
      cool: cool.length,
      cold: cold.length,
      total_volume_24h_usd: round4(totalVolume),
      total_tvl_usd: round4(totalTvl),
      total_daily_fees_usd: round4(totalDailyFees),
      ecosystem_efficiency: totalTvl > 0 ? round4(totalVolume / totalTvl) : 0,
    },
    pools: pulses,
    interpretation: [
      `${hot.length} HOT pool(s) — volume > 2x TVL, exceptional fee generation`,
      `${warm.length} WARM pool(s) — healthy 0.5-2x volume:TVL ratio`,
      `${cool.length} COOL pool(s) — moderate activity`,
      `${cold.length} COLD pool(s) — low activity, fees unlikely to justify IL risk`,
      hot.length > 0
        ? `Top opportunity: ${hot[0].pool_id} (${hot[0].pool_name}) — ${hot[0].efficiency_ratio}x efficiency, ${hot[0].fee_yield_annual_pct}% projected APR`
        : warm.length > 0
          ? `Best current option: ${warm[0].pool_id} (${warm[0].pool_name}) — ${warm[0].efficiency_ratio}x efficiency`
          : "No pools showing strong fee generation right now. Consider waiting for volume to pick up.",
    ],
    disclaimer:
      "Efficiency ratios based on 24h volume snapshot. Volume can spike or collapse. " +
      "A HOT signal means fees are high NOW, not that they will persist. " +
      "Always assess IL risk before deploying capital.",
  });
}

// hotspot — deep dive on the highest-efficiency pool
async function cmdHotspot(opts: { poolId: string }): Promise<void> {
  let appPools: AppPool[];
  let qPools: QuotesPool[];

  try {
    [appPools, qPools] = await Promise.all([fetchAppPools(), fetchQuotesPools()]);
  } catch (e) {
    output({ error: `Failed to fetch pool data: ${String(e)}` });
    process.exit(1);
  }

  const dlmmPools = appPools.filter(
    (p) => p.pool_id?.startsWith("dlmm") || p.pool_id?.includes("hodlmm")
  );

  // Find target pool (explicit or highest efficiency)
  let targetPool: AppPool;
  if (opts.poolId) {
    const found = dlmmPools.find((p) => p.pool_id === opts.poolId);
    if (!found) {
      const available = dlmmPools.map((p) => p.pool_id).join(", ");
      output({ error: `Pool ${opts.poolId} not found. Available: ${available}` });
      process.exit(1);
    }
    targetPool = found;
  } else {
    // Auto-detect: highest volume:TVL ratio with TVL > $100
    const ranked = dlmmPools
      .filter((p) => getTvl(p) > 100 && getVolume24h(p) > 0)
      .sort((a, b) => {
        const effA = getTvl(a) > 0 ? getVolume24h(a) / getTvl(a) : 0;
        const effB = getTvl(b) > 0 ? getVolume24h(b) / getTvl(b) : 0;
        return effB - effA;
      });

    if (ranked.length === 0) {
      output({ error: "No active DLMM pools with volume found." });
      process.exit(1);
    }
    targetPool = ranked[0];
  }

  const qp = qPools.find((q) => q.pool_id === targetPool.pool_id);
  const volume = getVolume24h(targetPool);
  const tvl = getTvl(targetPool);
  const feeBps = qp ? getFeeBps(targetPool, qp) : ((targetPool.fee_bps ?? 30) as number);
  const activeBin = qp ? getActiveBinId(qp) : 0;
  const binStep = qp ? getBinStep(qp) : 10;
  const efficiencyRatio = tvl > 0 ? round4(volume / tvl) : 0;
  const dailyFees = volume * (feeBps / 10000);
  const dailyFeePct = tvl > 0 ? round4((dailyFees / tvl) * 100) : 0;

  const { signal, reason } = classifySignal(efficiencyRatio, dailyFeePct, tvl, volume);

  // Fetch bins for concentration analysis
  let concentration: ConcentrationProfile | null = null;
  let binHeatmap: Array<{ bin_id: number; liquidity: number; share_pct: number }> = [];

  try {
    const bins = await fetchBins(targetPool.pool_id);
    if (bins.length > 0 && activeBin > 0) {
      concentration = analyzeConcentration(bins, activeBin);

      // Build heatmap around active bin (±15 bins)
      const low = Math.max(0, activeBin - 15);
      const high = activeBin + 15;
      const totalLiq = bins.reduce((s, b) => s + getBinLiquidity(b), 0);
      binHeatmap = bins
        .filter((b) => {
          const id = getBinId(b);
          return id >= low && id <= high;
        })
        .map((b) => ({
          bin_id: getBinId(b),
          liquidity: round4(getBinLiquidity(b)),
          share_pct: totalLiq > 0 ? round4((getBinLiquidity(b) / totalLiq) * 100) : 0,
        }))
        .sort((a, b) => a.bin_id - b.bin_id);
    }
  } catch {
    // Non-fatal
  }

  // LP entry scenarios
  const scenarios = [
    { label: "aggressive", bin_range: "active ±1 (3 bins)", concentration_est: 0.8, risk: "HIGH IL" },
    { label: "balanced", bin_range: "active ±5 (11 bins)", concentration_est: 0.5, risk: "MODERATE IL" },
    { label: "conservative", bin_range: "active ±10 (21 bins)", concentration_est: 0.3, risk: "LOWER IL" },
    { label: "wide", bin_range: "active ±20 (41 bins)", concentration_est: 0.15, risk: "MINIMAL IL" },
  ].map((s) => {
    const projDailyPct = tvl > 0
      ? round4((volume * (feeBps / 10000) * s.concentration_est) / tvl * 100)
      : 0;
    return {
      ...s,
      projected_daily_yield_pct: projDailyPct,
      projected_annual_yield_pct: round4(projDailyPct * 365),
    };
  });

  output({
    status: "success",
    timestamp: new Date().toISOString(),
    pool: {
      pool_id: targetPool.pool_id,
      pool_name: getPoolName(targetPool),
      volume_24h_usd: volume,
      tvl_usd: tvl,
      fee_bps: feeBps,
      active_bin: activeBin,
      bin_step: binStep,
    },
    pulse: {
      efficiency_ratio: efficiencyRatio,
      daily_fee_generation_usd: round4(dailyFees),
      fee_yield_daily_pct: dailyFeePct,
      fee_yield_annual_pct: round4(dailyFeePct * 365),
      signal,
      signal_reason: reason,
    },
    concentration: concentration,
    bin_heatmap: binHeatmap.length > 0 ? binHeatmap : undefined,
    lp_entry_scenarios: scenarios,
    recommendation: [
      signal === "HOT"
        ? "Fee generation is intense right now. Good entry window if you can tolerate IL."
        : signal === "WARM"
          ? "Healthy activity. Reasonable time to enter if your risk tolerance fits."
          : signal === "COOL"
            ? "Moderate activity. Fees may not compensate for IL on volatile pairs."
            : "Low activity. Consider waiting for volume to pick up before deploying capital.",
      concentration?.profile === "hyper-concentrated"
        ? "Liquidity is hyper-concentrated — competing for active-bin fees will be tough."
        : concentration?.profile === "concentrated"
          ? "Liquidity is concentrated around active bin — standard competitive environment."
          : concentration?.profile === "spread"
            ? "Liquidity is spread across bins — concentrated positions can capture outsized fees."
            : "Liquidity is evenly distributed — no particular advantage to concentration.",
      `At current rates, a balanced (±5 bin) position earns ~${scenarios[1].projected_annual_yield_pct}% APR in fees.`,
    ],
    disclaimer:
      "Based on 24h volume snapshot. Fee generation can change rapidly. " +
      "HOT signals indicate current intensity, not future persistence. " +
      "Always run hodlmm-safety-check before committing capital.",
  });
}

// ---------------------------------------------------------------------------
// Output helper
// ---------------------------------------------------------------------------
function output(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const program = new Command();

program
  .name("hodlmm-volume-pulse")
  .description(
    "Fee generation intensity tracker for Bitflow HODLMM concentrated liquidity pools. " +
    "Monitors volume:TVL efficiency ratios to identify optimal LP entry/exit timing."
  )
  .version("1.0.0");

program
  .command("doctor")
  .description("Check Bitflow API connectivity and data availability")
  .action(async () => {
    try {
      await cmdDoctor();
    } catch (e) {
      output({ error: String(e) });
      process.exit(1);
    }
  });

program
  .command("pulse")
  .description("Scan all HODLMM pools and rank by fee generation intensity")
  .option("--pools <ids>", "Comma-separated pool IDs (default: all DLMM pools)", "")
  .option(
    "--sort <key>",
    "Sort by: efficiency (default), volume, tvl, fees, yield",
    "efficiency"
  )
  .action(async (opts) => {
    try {
      await cmdPulse({ pools: opts.pools, sort: opts.sort });
    } catch (e) {
      output({ error: String(e) });
      process.exit(1);
    }
  });

program
  .command("hotspot")
  .description("Deep-dive on the highest-efficiency pool (or specify one)")
  .option("--pool-id <id>", "Pool ID to analyze (auto-detects hottest pool if omitted)", "")
  .action(async (opts) => {
    try {
      await cmdHotspot({ poolId: opts.poolId });
    } catch (e) {
      output({ error: String(e) });
      process.exit(1);
    }
  });

program.parse(process.argv);
