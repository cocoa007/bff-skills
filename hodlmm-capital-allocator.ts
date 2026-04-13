#!/usr/bin/env bun
/**
 * hodlmm-capital-allocator.ts
 *
 * HODLMM Capital Allocator — Recommends optimal capital distribution across
 * multiple HODLMM pools based on risk/reward profiling. Uses on-chain bin
 * data to assess fee yield, concentration risk, liquidity depth, and
 * volatility for each pool, then applies mean-variance optimization to
 * suggest allocation weights.
 *
 * Key metrics:
 *  - Per-pool risk score (0-100): concentration, depth, volatility composite
 *  - Per-pool reward score (0-100): fee yield, volume efficiency, capture rate
 *  - Sharpe-like ratio: reward/risk ranking
 *  - Allocation weights: recommended % of capital per pool
 *  - Diversification score: portfolio-level concentration (HHI-based)
 *  - Strategy profiles: CONSERVATIVE / BALANCED / AGGRESSIVE
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 56).
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

type Strategy = "CONSERVATIVE" | "BALANCED" | "AGGRESSIVE";

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

interface PoolRiskProfile {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;

  riskScore: number;
  rewardScore: number;
  sharpeRatio: number;

  concentrationRisk: number;
  depthScore: number;
  volatilityProxy: number;
  feeYieldAnnualPct: number;
  volumeEfficiency: number;
  captureRate: number;

  activeBins: number;
  totalBinsScanned: number;
  liquidityGini: number;
}

interface Allocation {
  poolId: number;
  pair: string;
  weightPct: number;
  expectedYieldPct: number;
  riskContribution: number;
}

interface PortfolioResult {
  strategy: Strategy;
  capitalUsd: number;
  allocations: Allocation[];
  portfolioYieldPct: number;
  portfolioRisk: number;
  diversificationScore: number;
  hhi: number;
  poolProfiles: PoolRiskProfile[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

async function getStxPriceUsd(): Promise<number> {
  try {
    const d = await fetchJson("https://api.coingecko.com/api/v3/simple/price?ids=blockstack&vs_currencies=usd");
    return d?.blockstack?.usd ?? FALLBACK_STX_PRICE_USD;
  } catch {
    return FALLBACK_STX_PRICE_USD;
  }
}

function cvHex(n: number): string {
  const hex = n.toString(16).padStart(32, "0");
  return `0x01${hex}`;
}

async function readBins(poolId: number, activeBin: number): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const lo = activeBin - BIN_SCAN_RADIUS;
  const hi = activeBin + BIN_SCAN_RADIUS;
  const calls: Promise<void>[] = [];

  for (let b = lo; b <= hi; b++) {
    const binNum = b;
    calls.push(
      (async () => {
        try {
          const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-bin`;
          const body = { sender: SENDER, arguments: [cvHex(poolId), cvHex(binNum)] };
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) return;
          const data = await res.json();
          if (!data.result || !data.okay) return;
          const hex = data.result.replace(/^0x/, "");
          if (hex.length < 66) return;
          const rx = parseInt(hex.slice(2, 34), 16);
          const ry = parseInt(hex.slice(34, 66), 16);
          if (rx > 0 || ry > 0) {
            bins.push({ binId: binNum, reserveX: rx, reserveY: ry, totalUsd: 0, pctX: 0, pctY: 0 });
          }
        } catch {}
      })()
    );
  }
  await Promise.all(calls);
  return bins.sort((a, b) => a.binId - b.binId);
}

function computeGini(values: number[]): number {
  if (values.length <= 1) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const total = sorted.reduce((s, v) => s + v, 0);
  if (total === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (2 * (i + 1) - n - 1) * sorted[i];
  return sum / (n * total);
}

function fmtPct(v: number): string { return v.toFixed(2) + "%"; }
function fmtUsd(v: number): string { return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function pad(s: string, n: number): string { return s.padEnd(n); }
function padL(s: string, n: number): string { return s.padStart(n); }

// ── Core Analysis ─────────────────────────────────────────────────────────────

function profilePool(pool: AppPool, bins: BinReserves[], stxPrice: number): PoolRiskProfile | null {
  if (bins.length === 0) return null;
  const activeBin = pool.activeBinId ?? 0;

  const totalReserves = bins.reduce((s, b) => s + b.reserveX + b.reserveY, 0);
  if (totalReserves === 0) return null;

  bins.forEach(b => {
    const total = b.reserveX + b.reserveY;
    b.pctX = total > 0 ? b.reserveX / total : 0;
    b.pctY = total > 0 ? b.reserveY / total : 0;
    b.totalUsd = (b.reserveX * pool.token0PriceUsd / 10 ** pool.token0Decimals) +
                 (b.reserveY * pool.token1PriceUsd / 10 ** pool.token1Decimals);
  });

  const totalUsd = bins.reduce((s, b) => s + b.totalUsd, 0);
  const activeBins = bins.filter(b => b.totalUsd > 0);

  const liquidityGini = computeGini(activeBins.map(b => b.totalUsd));

  // Concentration risk: how much liquidity is in the top 3 bins
  const sortedByUsd = [...activeBins].sort((a, b) => b.totalUsd - a.totalUsd);
  const top3Usd = sortedByUsd.slice(0, 3).reduce((s, b) => s + b.totalUsd, 0);
  const concentrationRisk = totalUsd > 0 ? (top3Usd / totalUsd) * 100 : 100;

  // Depth score: how many bins have meaningful liquidity (>1% of total)
  const meaningfulBins = activeBins.filter(b => b.totalUsd / totalUsd > 0.01).length;
  const depthScore = Math.min(100, (meaningfulBins / (BIN_SCAN_RADIUS * 2 + 1)) * 100);

  // Volatility proxy: reserve asymmetry spread across bins near active
  const nearBins = bins.filter(b => Math.abs(b.binId - activeBin) <= 3);
  const asymmetries = nearBins.map(b => Math.abs(b.pctX - b.pctY));
  const avgAsymmetry = asymmetries.length > 0 ? asymmetries.reduce((s, v) => s + v, 0) / asymmetries.length : 0.5;
  const volatilityProxy = avgAsymmetry * 100;

  // Fee yield (annualized)
  const feeBps = pool.feeBps ?? 30;
  const dailyVolume = pool.volume24hUsd;
  const dailyFees = dailyVolume * (feeBps / 10000);
  const feeYieldAnnualPct = totalUsd > 0 ? (dailyFees * 365 / totalUsd) * 100 : 0;

  // Volume efficiency: volume/TVL ratio
  const volumeEfficiency = pool.tvlUsd > 0 ? dailyVolume / pool.tvlUsd : 0;

  // Fee capture rate: how much of the fee is actually going to bins near active
  const nearBinUsd = nearBins.reduce((s, b) => s + b.totalUsd, 0);
  const captureRate = totalUsd > 0 ? (nearBinUsd / totalUsd) * 100 : 0;

  // Composite scores (0-100)
  const riskScore = Math.min(100, Math.max(0,
    concentrationRisk * 0.35 +
    (100 - depthScore) * 0.30 +
    volatilityProxy * 0.35
  ));

  const rewardScore = Math.min(100, Math.max(0,
    Math.min(100, feeYieldAnnualPct * 2) * 0.40 +
    Math.min(100, volumeEfficiency * 200) * 0.30 +
    captureRate * 0.30
  ));

  const sharpeRatio = riskScore > 0 ? rewardScore / riskScore : 0;

  return {
    poolId: pool.poolId ?? 0,
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: dailyVolume,
    feeBps,
    riskScore,
    rewardScore,
    sharpeRatio,
    concentrationRisk,
    depthScore,
    volatilityProxy,
    feeYieldAnnualPct,
    volumeEfficiency,
    captureRate,
    activeBins: activeBins.length,
    totalBinsScanned: bins.length,
    liquidityGini,
  };
}

function allocateCapital(
  profiles: PoolRiskProfile[],
  strategy: Strategy,
  capitalUsd: number,
): PortfolioResult {
  if (profiles.length === 0) {
    return {
      strategy, capitalUsd, allocations: [],
      portfolioYieldPct: 0, portfolioRisk: 0,
      diversificationScore: 0, hhi: 10000, poolProfiles: [],
    };
  }

  // Strategy weights for risk vs reward
  const riskAversion: Record<Strategy, number> = {
    CONSERVATIVE: 0.7,
    BALANCED: 0.5,
    AGGRESSIVE: 0.3,
  };
  const alpha = riskAversion[strategy];

  // Score each pool: higher = more desirable
  const scored = profiles.map(p => ({
    profile: p,
    score: p.rewardScore * (1 - alpha) - p.riskScore * alpha + p.sharpeRatio * 10,
  }));

  // Filter out negative-score pools for conservative strategy
  const eligible = strategy === "CONSERVATIVE"
    ? scored.filter(s => s.score > 0 && s.profile.riskScore < 60)
    : scored.filter(s => s.score > -20);

  if (eligible.length === 0) {
    return {
      strategy, capitalUsd, allocations: [],
      portfolioYieldPct: 0, portfolioRisk: 0,
      diversificationScore: 0, hhi: 10000, poolProfiles: profiles,
    };
  }

  // Normalize scores to weights
  const minScore = Math.min(...eligible.map(s => s.score));
  const shifted = eligible.map(s => ({ ...s, adjusted: s.score - minScore + 1 }));
  const totalAdj = shifted.reduce((s, e) => s + e.adjusted, 0);

  // Apply max-weight cap per strategy
  const maxWeight: Record<Strategy, number> = {
    CONSERVATIVE: 0.30,
    BALANCED: 0.40,
    AGGRESSIVE: 0.60,
  };
  const cap = maxWeight[strategy];

  let weights = shifted.map(s => ({
    profile: s.profile,
    rawWeight: s.adjusted / totalAdj,
  }));

  // Redistribute excess weight from capped pools
  let capped = true;
  while (capped) {
    capped = false;
    let excess = 0;
    let uncappedTotal = 0;
    for (const w of weights) {
      if (w.rawWeight > cap) {
        excess += w.rawWeight - cap;
        w.rawWeight = cap;
        capped = true;
      } else {
        uncappedTotal += w.rawWeight;
      }
    }
    if (excess > 0 && uncappedTotal > 0) {
      for (const w of weights) {
        if (w.rawWeight < cap) {
          w.rawWeight += excess * (w.rawWeight / uncappedTotal);
        }
      }
    }
  }

  // Normalize to 100%
  const totalW = weights.reduce((s, w) => s + w.rawWeight, 0);
  const allocations: Allocation[] = weights.map(w => {
    const pct = (w.rawWeight / totalW) * 100;
    return {
      poolId: w.profile.poolId,
      pair: w.profile.pair,
      weightPct: pct,
      expectedYieldPct: w.profile.feeYieldAnnualPct * (pct / 100),
      riskContribution: w.profile.riskScore * (pct / 100),
    };
  }).sort((a, b) => b.weightPct - a.weightPct);

  const portfolioYieldPct = allocations.reduce((s, a) => s + a.expectedYieldPct, 0);
  const portfolioRisk = allocations.reduce((s, a) => s + a.riskContribution, 0);

  // HHI for diversification
  const hhi = allocations.reduce((s, a) => s + (a.weightPct / 100) ** 2, 0) * 10000;
  const maxHhi = 10000;
  const minHhi = 10000 / allocations.length;
  const diversificationScore = allocations.length > 1
    ? Math.max(0, Math.min(100, ((maxHhi - hhi) / (maxHhi - minHhi)) * 100))
    : 0;

  return {
    strategy,
    capitalUsd,
    allocations,
    portfolioYieldPct,
    portfolioRisk,
    diversificationScore,
    hhi,
    poolProfiles: profiles,
  };
}

// ── Display ───────────────────────────────────────────────────────────────────

function printPoolProfiles(profiles: PoolRiskProfile[]): void {
  console.log("┌─────────────────────────────────────────────────────────────────────────────┐");
  console.log("│                        POOL RISK/REWARD PROFILES                            │");
  console.log("├────────┬──────────────┬────────────┬────────┬────────┬────────┬─────────────┤");
  console.log("│ PoolID │ Pair         │    TVL     │ Risk   │ Reward │ Sharpe │ Fee APY     │");
  console.log("├────────┼──────────────┼────────────┼────────┼────────┼────────┼─────────────┤");

  for (const p of profiles) {
    const risk = p.riskScore < 30 ? `🟢${fmtPct(p.riskScore)}` :
                 p.riskScore < 60 ? `🟡${fmtPct(p.riskScore)}` : `🔴${fmtPct(p.riskScore)}`;
    const reward = p.rewardScore > 60 ? `🟢${fmtPct(p.rewardScore)}` :
                   p.rewardScore > 30 ? `🟡${fmtPct(p.rewardScore)}` : `🔴${fmtPct(p.rewardScore)}`;

    console.log(
      `│ ${padL(String(p.poolId), 6)} │ ${pad(p.pair, 12)} │ ${padL(fmtUsd(p.tvlUsd), 10)} │ ${pad(risk, 6)} │ ${pad(reward, 6)} │ ${padL(p.sharpeRatio.toFixed(2), 6)} │ ${padL(fmtPct(p.feeYieldAnnualPct), 11)} │`
    );
  }
  console.log("└────────┴──────────────┴────────────┴────────┴────────┴────────┴─────────────┘");

  console.log("\n  Risk breakdown per pool:");
  for (const p of profiles) {
    console.log(`  Pool ${p.poolId} (${p.pair}):`);
    console.log(`    Concentration: ${fmtPct(p.concentrationRisk)} | Depth: ${fmtPct(p.depthScore)} | Vol proxy: ${fmtPct(p.volatilityProxy)}`);
    console.log(`    Active bins: ${p.activeBins}/${p.totalBinsScanned} | Gini: ${p.liquidityGini.toFixed(3)} | Vol/TVL: ${p.volumeEfficiency.toFixed(3)}`);
  }
}

function printAllocation(result: PortfolioResult): void {
  const { strategy, capitalUsd, allocations, portfolioYieldPct, portfolioRisk, diversificationScore, hhi } = result;

  console.log(`\n${"═".repeat(76)}`);
  console.log(`  CAPITAL ALLOCATION — ${strategy} STRATEGY`);
  console.log(`  Capital: ${fmtUsd(capitalUsd)} | Pools: ${allocations.length}`);
  console.log(`${"═".repeat(76)}`);

  if (allocations.length === 0) {
    console.log("  No eligible pools for this strategy.\n");
    return;
  }

  console.log("┌────────┬──────────────┬──────────┬────────────┬──────────────┬─────────────┐");
  console.log("│ PoolID │ Pair         │ Weight   │ Amount     │ Exp. Yield   │ Risk Contrib│");
  console.log("├────────┼──────────────┼──────────┼────────────┼──────────────┼─────────────┤");

  for (const a of allocations) {
    const amount = capitalUsd * a.weightPct / 100;
    const bar = "█".repeat(Math.round(a.weightPct / 5)) + "░".repeat(20 - Math.round(a.weightPct / 5));
    console.log(
      `│ ${padL(String(a.poolId), 6)} │ ${pad(a.pair, 12)} │ ${padL(fmtPct(a.weightPct), 8)} │ ${padL(fmtUsd(amount), 10)} │ ${padL(fmtPct(a.expectedYieldPct), 12)} │ ${padL(a.riskContribution.toFixed(1), 11)} │`
    );
    console.log(`│        │ ${pad(bar, 12)} │          │            │              │             │`);
  }
  console.log("└────────┴──────────────┴──────────┴────────────┴──────────────┴─────────────┘");

  console.log(`\n  Portfolio Summary:`);
  console.log(`    Expected yield:      ${fmtPct(portfolioYieldPct)}`);
  console.log(`    Weighted risk:       ${portfolioRisk.toFixed(1)}/100`);
  console.log(`    Diversification:     ${fmtPct(diversificationScore)} (HHI: ${Math.round(hhi)})`);

  const divClass = diversificationScore > 70 ? "WELL DIVERSIFIED" :
                   diversificationScore > 40 ? "MODERATELY DIVERSIFIED" : "CONCENTRATED";
  console.log(`    Classification:      ${divClass}`);
}

function printComparison(results: PortfolioResult[]): void {
  console.log(`\n${"═".repeat(76)}`);
  console.log("  STRATEGY COMPARISON");
  console.log(`${"═".repeat(76)}`);
  console.log("┌──────────────┬──────────────┬──────────────┬──────────────┬─────────────────┐");
  console.log("│ Strategy     │ Exp. Yield   │ Risk Score   │ Diversify    │ Pools Used      │");
  console.log("├──────────────┼──────────────┼──────────────┼──────────────┼─────────────────┤");

  for (const r of results) {
    console.log(
      `│ ${pad(r.strategy, 12)} │ ${padL(fmtPct(r.portfolioYieldPct), 12)} │ ${padL(r.portfolioRisk.toFixed(1), 12)} │ ${padL(fmtPct(r.diversificationScore), 12)} │ ${padL(String(r.allocations.length), 15)} │`
    );
  }
  console.log("└──────────────┴──────────────┴──────────────┴──────────────┴─────────────────┘");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const prog = new Command()
    .name("hodlmm-capital-allocator")
    .description("Optimal capital allocation across HODLMM pools based on risk/reward profiling")
    .option("-c, --capital <usd>", "Total capital to allocate (USD)", "10000")
    .option("-s, --strategy <type>", "Strategy: conservative, balanced, aggressive", "balanced")
    .option("-t, --top <n>", "Analyze top N pools by TVL", "8")
    .option("--compare", "Show all three strategies side by side")
    .option("--json", "Output as JSON")
    .parse(process.argv);

  const opts = prog.opts();
  const capitalUsd = parseFloat(opts.capital ?? "10000");
  const topN = parseInt(opts.top ?? "8", 10);
  const strategyInput = (opts.strategy ?? "balanced").toUpperCase() as Strategy;

  console.log("Fetching pool data and STX price...");
  const [pools, stxPriceUsd] = await Promise.all([
    fetchJson(`${BFF_APP_BASE}/hodlmm/pools`) as Promise<AppPool[]>,
    getStxPriceUsd(),
  ]);

  console.log(`STX price: ${fmtUsd(stxPriceUsd)} | ${pools.length} pools loaded`);

  const targetPools = pools
    .filter(p => p.tvlUsd >= MIN_TVL_USD && p.poolId && p.activeBinId)
    .sort((a, b) => b.tvlUsd - a.tvlUsd)
    .slice(0, topN);

  console.log(`Profiling ${targetPools.length} pools for capital allocation...\n`);

  const profiles: PoolRiskProfile[] = [];
  for (const pool of targetPools) {
    try {
      const bins = await readBins(pool.poolId!, pool.activeBinId!);
      const profile = profilePool(pool, bins, stxPriceUsd);
      if (profile) profiles.push(profile);
    } catch (e: any) {
      console.error(`Error profiling pool ${pool.poolId}: ${e.message}`);
    }
  }

  if (profiles.length === 0) {
    console.log("No pools met profiling criteria.");
    return;
  }

  if (!opts.json) {
    printPoolProfiles(profiles);
  }

  if (opts.compare) {
    const strategies: Strategy[] = ["CONSERVATIVE", "BALANCED", "AGGRESSIVE"];
    const results = strategies.map(s => allocateCapital(profiles, s, capitalUsd));
    if (opts.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      for (const r of results) printAllocation(r);
      printComparison(results);
    }
  } else {
    const result = allocateCapital(profiles, strategyInput, capitalUsd);
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printAllocation(result);
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
