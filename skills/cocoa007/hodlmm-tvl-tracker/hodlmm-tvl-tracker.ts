#!/usr/bin/env bun
/**
 * hodlmm-tvl-tracker.ts
 *
 * HODLMM TVL Tracker — Monitors total value locked across all HODLMM pools,
 * ranks pools by TVL dominance, measures capital efficiency (fees generated
 * per $1 TVL), and classifies TVL tiers for capital allocation decisions.
 *
 * Key metrics:
 *  - Protocol-wide TVL and pool count
 *  - Per-pool TVL dominance (% of total TVL)
 *  - Capital efficiency ratio (24h fees / TVL, annualized)
 *  - TVL tier classification (MEGA / LARGE / MEDIUM / SMALL / MICRO)
 *  - Fee yield per $1 TVL ranking
 *  - Concentration analysis (top-N pool dominance, HHI)
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 40).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const MIN_TVL_USD = 10;

// TVL tier thresholds
const TVL_TIERS = [
  { name: "MEGA", min: 1_000_000, color: "🟣" },
  { name: "LARGE", min: 100_000, color: "🔵" },
  { name: "MEDIUM", min: 10_000, color: "🟢" },
  { name: "SMALL", min: 1_000, color: "🟡" },
  { name: "MICRO", min: 0, color: "🔴" },
] as const;

// ── Types ──────────────────────────────────────────────────────────────────────

interface AppPool {
  id: string;
  poolId: number;
  token0Symbol: string;
  token1Symbol: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  token0PriceUsd: number;
  token1PriceUsd: number;
}

interface PoolTvlEntry {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  fees24hUsd: number;
  capitalEfficiency: number;   // annualized fee yield per $1 TVL
  dominancePct: number;        // % of total protocol TVL
  tier: string;
  tierColor: string;
}

interface TvlTierSummary {
  tier: string;
  poolCount: number;
  totalTvlUsd: number;
  avgCapitalEfficiency: number;
  dominancePct: number;
}

interface TvlReport {
  timestamp: string;
  protocol: {
    totalTvlUsd: number;
    totalVolume24hUsd: number;
    totalFees24hUsd: number;
    poolCount: number;
    avgCapitalEfficiency: number;
    hhi: number;                     // Herfindahl-Hirschman Index
    hhiClass: string;
    top3DominancePct: number;
    top5DominancePct: number;
  };
  tiers: TvlTierSummary[];
  pools: PoolTvlEntry[];
  insights: string[];
  summary: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<any> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`);
  return resp.json();
}

function formatUsd(n: number): string {
  if (n < 0) return `-${formatUsd(-n)}`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(6)}`;
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function getTier(tvlUsd: number): { name: string; color: string } {
  for (const t of TVL_TIERS) {
    if (tvlUsd >= t.min) return { name: t.name, color: t.color };
  }
  return { name: "MICRO", color: "🔴" };
}

function computeHHI(shares: number[]): number {
  return shares.reduce((acc, s) => acc + s * s, 0);
}

function classifyHHI(hhi: number): string {
  if (hhi >= 0.25) return "HIGHLY_CONCENTRATED";
  if (hhi >= 0.15) return "CONCENTRATED";
  if (hhi >= 0.10) return "MODERATE";
  return "DIVERSIFIED";
}

// ── Pool Data ──────────────────────────────────────────────────────────────────

async function fetchAllPools(): Promise<AppPool[]> {
  const data = await fetchJson(`${BFF_APP_BASE}/pools`);
  const rawPools = data?.data || data?.pools || data || [];
  return rawPools
    .map((p: any) => {
      const tx = p.tokens?.tokenX || {};
      const ty = p.tokens?.tokenY || {};
      const poolIdStr = p.poolId || p.id || "0";
      const numericId = parseInt(poolIdStr.toString().replace(/^dlmm_/, "")) || 0;
      return {
        id: poolIdStr,
        poolId: numericId,
        token0Symbol: tx.symbol || p.token0Symbol || "?",
        token1Symbol: ty.symbol || p.token1Symbol || "?",
        tvlUsd: parseFloat(p.tvlUsd ?? "0"),
        volume24hUsd: parseFloat(p.volumeUsd1d ?? p.volume24hUsd ?? "0"),
        feeBps: parseFloat(p.feeBps ?? "30"),
        token0PriceUsd: parseFloat(tx.priceUsd ?? p.token0PriceUsd ?? "0"),
        token1PriceUsd: parseFloat(ty.priceUsd ?? p.token1PriceUsd ?? "0"),
      };
    })
    .filter((p: AppPool) => p.tvlUsd >= MIN_TVL_USD);
}

// ── Core Analysis ──────────────────────────────────────────────────────────────

async function buildTvlReport(opts: {
  sortBy: string;
  limit: number;
  tier?: string;
  minTvl: number;
}): Promise<TvlReport> {
  const pools = await fetchAllPools();

  if (pools.length === 0) throw new Error("No HODLMM pools found");

  const totalTvl = pools.reduce((s, p) => s + p.tvlUsd, 0);
  const totalVol = pools.reduce((s, p) => s + p.volume24hUsd, 0);

  // Build per-pool entries
  let entries: PoolTvlEntry[] = pools.map((p) => {
    const fees24h = p.volume24hUsd * (p.feeBps / 10_000);
    const capEff = p.tvlUsd > 0 ? (fees24h / p.tvlUsd) * 365 : 0;
    const dom = totalTvl > 0 ? p.tvlUsd / totalTvl : 0;
    const tier = getTier(p.tvlUsd);
    return {
      poolId: p.poolId,
      pair: `${p.token0Symbol}/${p.token1Symbol}`,
      tvlUsd: p.tvlUsd,
      volume24hUsd: p.volume24hUsd,
      feeBps: p.feeBps,
      fees24hUsd: fees24h,
      capitalEfficiency: capEff,
      dominancePct: dom,
      tier: tier.name,
      tierColor: tier.color,
    };
  });

  // Filter by tier if specified
  if (opts.tier) {
    const t = opts.tier.toUpperCase();
    entries = entries.filter((e) => e.tier === t);
  }

  // Filter by min TVL
  entries = entries.filter((e) => e.tvlUsd >= opts.minTvl);

  // Sort
  const sortFns: Record<string, (a: PoolTvlEntry, b: PoolTvlEntry) => number> = {
    tvl: (a, b) => b.tvlUsd - a.tvlUsd,
    efficiency: (a, b) => b.capitalEfficiency - a.capitalEfficiency,
    volume: (a, b) => b.volume24hUsd - a.volume24hUsd,
    fees: (a, b) => b.fees24hUsd - a.fees24hUsd,
    dominance: (a, b) => b.dominancePct - a.dominancePct,
  };
  entries.sort(sortFns[opts.sortBy] || sortFns.tvl);

  // Tier summaries (from all pools, not filtered)
  const allEntries: PoolTvlEntry[] = pools.map((p) => {
    const fees24h = p.volume24hUsd * (p.feeBps / 10_000);
    const capEff = p.tvlUsd > 0 ? (fees24h / p.tvlUsd) * 365 : 0;
    const dom = totalTvl > 0 ? p.tvlUsd / totalTvl : 0;
    const tier = getTier(p.tvlUsd);
    return {
      poolId: p.poolId, pair: `${p.token0Symbol}/${p.token1Symbol}`,
      tvlUsd: p.tvlUsd, volume24hUsd: p.volume24hUsd, feeBps: p.feeBps,
      fees24hUsd: fees24h, capitalEfficiency: capEff, dominancePct: dom,
      tier: tier.name, tierColor: tier.color,
    };
  });

  const tierGroups = new Map<string, PoolTvlEntry[]>();
  for (const e of allEntries) {
    const arr = tierGroups.get(e.tier) || [];
    arr.push(e);
    tierGroups.set(e.tier, arr);
  }

  const tiers: TvlTierSummary[] = TVL_TIERS.map((t) => {
    const group = tierGroups.get(t.name) || [];
    const tvl = group.reduce((s, g) => s + g.tvlUsd, 0);
    const avgEff = group.length > 0
      ? group.reduce((s, g) => s + g.capitalEfficiency, 0) / group.length
      : 0;
    return {
      tier: t.name,
      poolCount: group.length,
      totalTvlUsd: tvl,
      avgCapitalEfficiency: avgEff,
      dominancePct: totalTvl > 0 ? tvl / totalTvl : 0,
    };
  }).filter((t) => t.poolCount > 0);

  // Concentration metrics
  const shares = allEntries.map((e) => e.dominancePct);
  shares.sort((a, b) => b - a);
  const hhi = computeHHI(shares);
  const top3 = shares.slice(0, 3).reduce((s, v) => s + v, 0);
  const top5 = shares.slice(0, 5).reduce((s, v) => s + v, 0);
  const totalFees = allEntries.reduce((s, e) => s + e.fees24hUsd, 0);
  const avgCapEff = totalTvl > 0 ? (totalFees / totalTvl) * 365 : 0;

  // Insights
  const insights: string[] = [];
  const hhiClass = classifyHHI(hhi);
  if (hhiClass === "HIGHLY_CONCENTRATED") {
    insights.push(`TVL is highly concentrated — top 3 pools hold ${formatPct(top3)} of all liquidity`);
  } else if (hhiClass === "DIVERSIFIED") {
    insights.push(`TVL is well-diversified across ${pools.length} pools`);
  }

  const bestEff = [...allEntries].sort((a, b) => b.capitalEfficiency - a.capitalEfficiency)[0];
  if (bestEff && bestEff.capitalEfficiency > 0) {
    insights.push(`Most capital-efficient pool: ${bestEff.pair} (#${bestEff.poolId}) at ${formatPct(bestEff.capitalEfficiency)} annualized yield`);
  }

  const biggestPool = [...allEntries].sort((a, b) => b.tvlUsd - a.tvlUsd)[0];
  if (biggestPool) {
    insights.push(`Largest pool: ${biggestPool.pair} (#${biggestPool.poolId}) with ${formatUsd(biggestPool.tvlUsd)} TVL (${formatPct(biggestPool.dominancePct)} dominance)`);
  }

  const microPools = allEntries.filter((e) => e.tier === "MICRO");
  if (microPools.length > 0) {
    insights.push(`${microPools.length} micro pools (<$1K TVL) — may have high slippage and impermanent loss risk`);
  }

  if (avgCapEff > 0.5) {
    insights.push(`Protocol-wide capital efficiency is strong at ${formatPct(avgCapEff)} annualized`);
  } else if (avgCapEff < 0.05) {
    insights.push(`Protocol-wide capital efficiency is low at ${formatPct(avgCapEff)} — most TVL is idle`);
  }

  // Limit output
  const displayPools = entries.slice(0, opts.limit);

  const summary = `HODLMM protocol: ${formatUsd(totalTvl)} TVL across ${pools.length} pools. ` +
    `24h volume: ${formatUsd(totalVol)}, fees: ${formatUsd(totalFees)}. ` +
    `Capital efficiency: ${formatPct(avgCapEff)} annualized. ` +
    `Concentration: ${hhiClass} (HHI ${hhi.toFixed(4)}).`;

  return {
    timestamp: new Date().toISOString(),
    protocol: {
      totalTvlUsd: totalTvl,
      totalVolume24hUsd: totalVol,
      totalFees24hUsd: totalFees,
      poolCount: pools.length,
      avgCapitalEfficiency: avgCapEff,
      hhi,
      hhiClass,
      top3DominancePct: top3,
      top5DominancePct: top5,
    },
    tiers,
    pools: displayPools,
    insights,
    summary,
  };
}

// ── CLI ────────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-tvl-tracker")
  .description("Track TVL across all HODLMM pools — dominance, capital efficiency, tier analysis")
  .option("--sort <field>", "Sort by: tvl, efficiency, volume, fees, dominance", "tvl")
  .option("--limit <n>", "Max pools to display", "15")
  .option("--tier <name>", "Filter by tier: MEGA, LARGE, MEDIUM, SMALL, MICRO")
  .option("--min-tvl <usd>", "Minimum TVL filter", "10")
  .option("--json", "Output raw JSON")
  .action(async (opts) => {
    try {
      const report = await buildTvlReport({
        sortBy: opts.sort,
        limit: parseInt(opts.limit),
        tier: opts.tier,
        minTvl: parseFloat(opts.minTvl),
      });

      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }

      // Header
      console.log(`\n╔══════════════════════════════════════════════════════╗`);
      console.log(`║  HODLMM TVL Tracker                                 ║`);
      console.log(`╚══════════════════════════════════════════════════════╝`);

      // Protocol overview
      const p = report.protocol;
      console.log(`\n  Protocol Overview`);
      console.log(`  ─────────────────────────────────────────────`);
      console.log(`  Total TVL:           ${formatUsd(p.totalTvlUsd)}`);
      console.log(`  24h Volume:          ${formatUsd(p.totalVolume24hUsd)}`);
      console.log(`  24h Fees:            ${formatUsd(p.totalFees24hUsd)}`);
      console.log(`  Active Pools:        ${p.poolCount}`);
      console.log(`  Capital Efficiency:  ${formatPct(p.avgCapitalEfficiency)} annualized`);
      console.log(`  Concentration:       ${p.hhiClass} (HHI ${p.hhi.toFixed(4)})`);
      console.log(`  Top 3 Dominance:     ${formatPct(p.top3DominancePct)}`);
      console.log(`  Top 5 Dominance:     ${formatPct(p.top5DominancePct)}`);

      // Tier breakdown
      if (report.tiers.length > 0) {
        console.log(`\n  TVL Tiers`);
        console.log(`  ─────────────────────────────────────────────`);
        console.log(`  ${"Tier".padEnd(10)} ${"Pools".padEnd(7)} ${"TVL".padEnd(14)} ${"Dominance".padEnd(11)} ${"Avg Eff".padEnd(10)}`);
        for (const t of report.tiers) {
          console.log(
            `  ${t.tier.padEnd(10)} ${t.poolCount.toString().padEnd(7)} ${formatUsd(t.totalTvlUsd).padEnd(14)} ${formatPct(t.dominancePct).padEnd(11)} ${formatPct(t.avgCapitalEfficiency).padEnd(10)}`,
          );
        }
      }

      // Pool rankings
      if (report.pools.length > 0) {
        console.log(`\n  Pool Rankings (sorted by ${opts.sort})`);
        console.log(`  ─────────────────────────────────────────────────────────────────────────`);
        console.log(`  ${"#".padEnd(4)} ${"Pair".padEnd(16)} ${"TVL".padEnd(14)} ${"Vol 24h".padEnd(14)} ${"Fees 24h".padEnd(12)} ${"Cap Eff".padEnd(10)} ${"Dom".padEnd(8)} ${"Tier"}`);
        for (let i = 0; i < report.pools.length; i++) {
          const e = report.pools[i];
          console.log(
            `  ${(i + 1).toString().padEnd(4)} ${e.pair.padEnd(16)} ${formatUsd(e.tvlUsd).padEnd(14)} ${formatUsd(e.volume24hUsd).padEnd(14)} ${formatUsd(e.fees24hUsd).padEnd(12)} ${formatPct(e.capitalEfficiency).padEnd(10)} ${formatPct(e.dominancePct).padEnd(8)} ${e.tierColor} ${e.tier}`,
          );
        }
      }

      // TVL dominance bar chart
      console.log(`\n  TVL Dominance Chart`);
      console.log(`  ─────────────────────────────────────────────`);
      const top10 = report.pools.slice(0, 10).sort((a, b) => b.dominancePct - a.dominancePct);
      const maxDom = top10.length > 0 ? top10[0].dominancePct : 1;
      for (const e of top10) {
        const barLen = Math.max(1, Math.round((e.dominancePct / maxDom) * 30));
        const bar = "█".repeat(barLen);
        console.log(`  ${e.pair.padEnd(16)} ${bar} ${formatPct(e.dominancePct)}`);
      }

      // Insights
      if (report.insights.length > 0) {
        console.log(`\n  Insights`);
        console.log(`  ─────────────────────────────────────────────`);
        for (const i of report.insights) {
          console.log(`  • ${i}`);
        }
      }

      console.log(`\n  ${report.summary}`);
      console.log();
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
