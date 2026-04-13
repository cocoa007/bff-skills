#!/usr/bin/env bun
/**
 * hodlmm-protocol-revenue.ts
 *
 * HODLMM Protocol Revenue Tracker — Aggregates fee generation across all
 * HODLMM pools to produce a protocol-level revenue overview. Identifies
 * top revenue-generating pools, calculates effective take rates, and
 * classifies revenue health.
 *
 * Key metrics:
 *  - Total protocol fee revenue (estimated daily/weekly/monthly)
 *  - Top revenue pools ranked by fee generation
 *  - Revenue concentration (Gini coefficient across pools)
 *  - Fee-to-TVL efficiency (which pools generate most revenue per $ locked)
 *  - Revenue health classification (STRONG / MODERATE / WEAK / CRITICAL)
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 44).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 500;
const BIN_SCAN_RADIUS = 10;

const FALLBACK_STX_PRICE_USD = 0.80;

// Revenue health thresholds (annualized fee yield as % of TVL)
const STRONG_YIELD_PCT = 10.0;     // >10% annualized = strong
const MODERATE_YIELD_PCT = 3.0;    // 3-10% = moderate
const WEAK_YIELD_PCT = 0.5;       // 0.5-3% = weak
// Below 0.5% = CRITICAL

// ── Types ──────────────────────────────────────────────────────────────────────

interface AppPool {
  id: string;
  token0Symbol: string;
  token1Symbol: string;
  tvlUsd: number;
  volume24hUsd: number;
  feesUsd1d: number;
  feesUsd7d: number;
  feesUsd30d: number;
  apr: number;
  poolId?: number | string;
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

type RevenueHealth = "STRONG" | "MODERATE" | "WEAK" | "CRITICAL";

interface PoolRevenue {
  poolName: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  dailyFeeUsd: number;
  weeklyFeeUsd: number;
  monthlyFeeUsd: number;
  annualizedYieldPct: number;
  feeToTvlEfficiency: number;
  activeBins: number;
  totalBinsWithLiquidity: number;
  concentrationScore: number;
  health: RevenueHealth;
}

interface ProtocolSummary {
  totalTvlUsd: number;
  totalVolume24hUsd: number;
  totalDailyFeeUsd: number;
  totalWeeklyFeeUsd: number;
  totalMonthlyFeeUsd: number;
  avgAnnualizedYieldPct: number;
  weightedAnnualizedYieldPct: number;
  poolCount: number;
  activePoolCount: number;
  revenueGini: number;
  top3RevenueSharePct: number;
  overallHealth: RevenueHealth;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    } catch (e) {
      if (i === retries) throw e;
      await sleep(1000 * (i + 1));
    }
  }
}

async function callReadOnly(
  fn: string,
  args: string[],
): Promise<any> {
  const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/${fn}`;
  const body = JSON.stringify({ sender: SENDER, arguments: args });
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    } catch (e) {
      if (i === 2) throw e;
      await sleep(1000 * (i + 1));
    }
  }
}

function cvUint(n: number): string {
  const hex = n.toString(16).padStart(32, "0");
  return `0x0100000000000000000000000000000000${hex.slice(-32)}`;
}

function parseUintResult(hex: string): number {
  if (!hex || typeof hex !== "string") return 0;
  const clean = hex.replace(/^0x/, "");
  if (clean.length < 34) return 0;
  const valuePart = clean.slice(2);
  return parseInt(valuePart, 16) || 0;
}

function parseBinReserves(
  hex: string,
  t0Dec: number,
  t1Dec: number,
  t0Price: number,
  t1Price: number,
): { reserveX: number; reserveY: number; totalUsd: number } {
  if (!hex || typeof hex !== "string") return { reserveX: 0, reserveY: 0, totalUsd: 0 };
  const clean = hex.replace(/^0x/, "");
  if (clean.length < 66) return { reserveX: 0, reserveY: 0, totalUsd: 0 };
  const rxHex = clean.slice(2, 34);
  const ryHex = clean.slice(34, 66);
  const reserveX = parseInt(rxHex, 16) / 10 ** t0Dec;
  const reserveY = parseInt(ryHex, 16) / 10 ** t1Dec;
  const totalUsd = reserveX * t0Price + reserveY * t1Price;
  return { reserveX, reserveY, totalUsd };
}

async function fetchStxPrice(): Promise<number> {
  try {
    const data = await fetchJson(
      "https://api.coingecko.com/api/v3/simple/price?ids=blockstack&vs_currencies=usd",
    );
    return data?.blockstack?.usd ?? FALLBACK_STX_PRICE_USD;
  } catch {
    return FALLBACK_STX_PRICE_USD;
  }
}

async function fetchPools(): Promise<AppPool[]> {
  const data = await fetchJson(`${BFF_APP_BASE}/pools`);
  const raw: any[] = Array.isArray(data) ? data : data?.pools ?? data?.data ?? [];
  return raw
    .filter((p: any) => (p.tvlUsd ?? p.tvl_usd ?? 0) >= MIN_TVL_USD)
    .map((p: any) => {
      const tX = p.tokens?.tokenX ?? {};
      const tY = p.tokens?.tokenY ?? {};
      return {
        id: p.poolId ?? p.id ?? "?",
        token0Symbol: tX.symbol ?? p.token0Symbol ?? "T0",
        token1Symbol: tY.symbol ?? p.token1Symbol ?? "T1",
        tvlUsd: p.tvlUsd ?? p.tvl_usd ?? 0,
        volume24hUsd: p.volumeUsd1d ?? p.volume24hUsd ?? 0,
        feesUsd1d: p.feesUsd1d ?? 0,
        feesUsd7d: p.feesUsd7d ?? 0,
        feesUsd30d: p.feesUsd30d ?? 0,
        apr: p.apr ?? 0,
        poolId: p.poolId ?? undefined,
        token0Decimals: tX.decimals ?? p.token0Decimals ?? 6,
        token1Decimals: tY.decimals ?? p.token1Decimals ?? 6,
        token0PriceUsd: tX.priceUsd ?? p.token0PriceUsd ?? 0,
        token1PriceUsd: tY.priceUsd ?? p.token1PriceUsd ?? 0,
        activeBinId: p.activeBinId ?? p.active_bin_id ?? undefined,
        feeBps: p.feeBps ?? Math.round((p.baseFee ?? 0.003) * 10000) ?? 30,
      };
    });
}

async function scanBins(
  poolId: number,
  activeBin: number,
  t0Dec: number,
  t1Dec: number,
  t0Price: number,
  t1Price: number,
): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const start = activeBin - BIN_SCAN_RADIUS;
  const end = activeBin + BIN_SCAN_RADIUS;

  for (let binId = start; binId <= end; binId++) {
    try {
      const res = await callReadOnly("get-bin-reserves", [
        cvUint(poolId),
        cvUint(binId),
      ]);
      if (res?.result) {
        const parsed = parseBinReserves(
          res.result,
          t0Dec,
          t1Dec,
          t0Price,
          t1Price,
        );
        if (parsed.totalUsd > 0) {
          bins.push({ binId, ...parsed });
        }
      }
    } catch {
      // skip failed bins
    }
  }
  return bins;
}

function calculateGini(values: number[]): number {
  if (values.length <= 1) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  if (mean === 0) return 0;
  let numerator = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      numerator += Math.abs(sorted[i] - sorted[j]);
    }
  }
  return numerator / (2 * n * n * mean);
}

function classifyHealth(annualizedYield: number): RevenueHealth {
  if (annualizedYield >= STRONG_YIELD_PCT) return "STRONG";
  if (annualizedYield >= MODERATE_YIELD_PCT) return "MODERATE";
  if (annualizedYield >= WEAK_YIELD_PCT) return "WEAK";
  return "CRITICAL";
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function formatPct(n: number): string {
  return `${n.toFixed(2)}%`;
}

function healthEmoji(h: RevenueHealth): string {
  switch (h) {
    case "STRONG": return "🟢";
    case "MODERATE": return "🟡";
    case "WEAK": return "🟠";
    case "CRITICAL": return "🔴";
  }
}

// ── Analysis ───────────────────────────────────────────────────────────────────

async function analyzePoolRevenue(
  pool: AppPool,
  verbose: boolean,
): Promise<PoolRevenue | null> {
  const feeBps = pool.feeBps ?? 30;
  const dailyFeeUsd = pool.feesUsd1d > 0 ? pool.feesUsd1d : pool.volume24hUsd * (feeBps / 10_000);
  const weeklyFeeUsd = pool.feesUsd7d > 0 ? pool.feesUsd7d : dailyFeeUsd * 7;
  const monthlyFeeUsd = pool.feesUsd30d > 0 ? pool.feesUsd30d : dailyFeeUsd * 30;
  const annualizedYieldPct =
    pool.tvlUsd > 0 ? (dailyFeeUsd * 365 * 100) / pool.tvlUsd : 0;
  const feeToTvlEfficiency =
    pool.tvlUsd > 0 ? (dailyFeeUsd * 1000) / pool.tvlUsd : 0;

  let activeBins = 0;
  let totalBinsWithLiquidity = 0;
  let concentrationScore = 0;

  const numericPoolId = typeof pool.poolId === "string"
    ? parseInt(String(pool.poolId).replace(/\D/g, ""), 10)
    : pool.poolId;

  if (numericPoolId !== undefined && !isNaN(numericPoolId) && pool.activeBinId !== undefined) {
    try {
      const bins = await scanBins(
        numericPoolId,
        pool.activeBinId,
        pool.token0Decimals,
        pool.token1Decimals,
        pool.token0PriceUsd,
        pool.token1PriceUsd,
      );
      totalBinsWithLiquidity = bins.length;
      if (bins.length > 0) {
        const totalLiq = bins.reduce((s, b) => s + b.totalUsd, 0);
        const activeBinData = bins.find((b) => b.binId === pool.activeBinId);
        const activeBinPct =
          activeBinData && totalLiq > 0
            ? (activeBinData.totalUsd / totalLiq) * 100
            : 0;
        concentrationScore = activeBinPct;
        activeBins = bins.filter((b) => b.totalUsd > totalLiq * 0.01).length;
      }
    } catch {
      // continue with API-only data
    }
  }

  const health = classifyHealth(annualizedYieldPct);

  return {
    poolName: `${pool.token0Symbol}/${pool.token1Symbol}`,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    feeBps,
    dailyFeeUsd,
    weeklyFeeUsd,
    monthlyFeeUsd,
    annualizedYieldPct,
    feeToTvlEfficiency,
    activeBins,
    totalBinsWithLiquidity,
    concentrationScore,
    health,
  };
}

function buildProtocolSummary(pools: PoolRevenue[]): ProtocolSummary {
  const totalTvlUsd = pools.reduce((s, p) => s + p.tvlUsd, 0);
  const totalVolume24hUsd = pools.reduce((s, p) => s + p.volume24hUsd, 0);
  const totalDailyFeeUsd = pools.reduce((s, p) => s + p.dailyFeeUsd, 0);
  const totalWeeklyFeeUsd = totalDailyFeeUsd * 7;
  const totalMonthlyFeeUsd = totalDailyFeeUsd * 30;

  const avgAnnualizedYieldPct =
    pools.length > 0
      ? pools.reduce((s, p) => s + p.annualizedYieldPct, 0) / pools.length
      : 0;
  const weightedAnnualizedYieldPct =
    totalTvlUsd > 0 ? (totalDailyFeeUsd * 365 * 100) / totalTvlUsd : 0;

  const dailyFees = pools.map((p) => p.dailyFeeUsd);
  const revenueGini = calculateGini(dailyFees);

  const sorted = [...pools].sort((a, b) => b.dailyFeeUsd - a.dailyFeeUsd);
  const top3Revenue = sorted.slice(0, 3).reduce((s, p) => s + p.dailyFeeUsd, 0);
  const top3RevenueSharePct =
    totalDailyFeeUsd > 0 ? (top3Revenue / totalDailyFeeUsd) * 100 : 0;

  const activePoolCount = pools.filter(
    (p) => p.dailyFeeUsd > 0 && p.health !== "CRITICAL",
  ).length;

  const overallHealth = classifyHealth(weightedAnnualizedYieldPct);

  return {
    totalTvlUsd,
    totalVolume24hUsd,
    totalDailyFeeUsd,
    totalWeeklyFeeUsd,
    totalMonthlyFeeUsd,
    avgAnnualizedYieldPct,
    weightedAnnualizedYieldPct,
    poolCount: pools.length,
    activePoolCount,
    revenueGini,
    top3RevenueSharePct,
    overallHealth,
  };
}

// ── Output Formatters ──────────────────────────────────────────────────────────

function renderText(summary: ProtocolSummary, pools: PoolRevenue[], top: number): string {
  const lines: string[] = [];
  const ts = new Date().toISOString();

  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push("║        HODLMM Protocol Revenue Tracker                     ║");
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");
  lines.push(`  Timestamp: ${ts}`);
  lines.push("");

  // Protocol overview
  lines.push("─── Protocol Overview ────────────────────────────────────────");
  lines.push(`  Total TVL:              ${formatUsd(summary.totalTvlUsd)}`);
  lines.push(`  24h Volume:             ${formatUsd(summary.totalVolume24hUsd)}`);
  lines.push(`  Daily Fees:             ${formatUsd(summary.totalDailyFeeUsd)}`);
  lines.push(`  Weekly Fees:            ${formatUsd(summary.totalWeeklyFeeUsd)}`);
  lines.push(`  Monthly Fees:           ${formatUsd(summary.totalMonthlyFeeUsd)}`);
  lines.push(`  Annualized (weighted):  ${formatPct(summary.weightedAnnualizedYieldPct)}`);
  lines.push(`  Annualized (avg pool):  ${formatPct(summary.avgAnnualizedYieldPct)}`);
  lines.push(`  Active Pools:           ${summary.activePoolCount} / ${summary.poolCount}`);
  lines.push(`  Revenue Gini:           ${summary.revenueGini.toFixed(3)} (0=equal, 1=concentrated)`);
  lines.push(`  Top 3 Revenue Share:    ${formatPct(summary.top3RevenueSharePct)}`);
  lines.push(`  Overall Health:         ${healthEmoji(summary.overallHealth)} ${summary.overallHealth}`);
  lines.push("");

  // Top revenue pools
  const sorted = [...pools].sort((a, b) => b.dailyFeeUsd - a.dailyFeeUsd);
  const topPools = sorted.slice(0, top);

  lines.push(`─── Top ${top} Revenue Pools ────────────────────────────────────`);
  lines.push(
    "  #  Pool                  Daily Fee    APY%     TVL          Vol/TVL   Health",
  );
  lines.push(
    "  ── ────────────────────  ─────────    ──────   ──────────   ───────   ──────",
  );

  topPools.forEach((p, i) => {
    const rank = String(i + 1).padStart(2);
    const name = p.poolName.padEnd(20).slice(0, 20);
    const daily = formatUsd(p.dailyFeeUsd).padStart(9);
    const apy = formatPct(p.annualizedYieldPct).padStart(8);
    const tvl = formatUsd(p.tvlUsd).padStart(10);
    const volTvl =
      p.tvlUsd > 0
        ? (p.volume24hUsd / p.tvlUsd).toFixed(2).padStart(7)
        : "   N/A";
    const health = `${healthEmoji(p.health)} ${p.health}`;
    lines.push(`  ${rank} ${name}  ${daily}    ${apy}   ${tvl}   ${volTvl}   ${health}`);
  });
  lines.push("");

  // Revenue concentration analysis
  lines.push("─── Revenue Concentration ───────────────────────────────────");
  const healthCounts = { STRONG: 0, MODERATE: 0, WEAK: 0, CRITICAL: 0 };
  pools.forEach((p) => healthCounts[p.health]++);
  lines.push(`  🟢 STRONG:   ${healthCounts.STRONG} pools (>10% APY)`);
  lines.push(`  🟡 MODERATE: ${healthCounts.MODERATE} pools (3-10% APY)`);
  lines.push(`  🟠 WEAK:     ${healthCounts.WEAK} pools (0.5-3% APY)`);
  lines.push(`  🔴 CRITICAL: ${healthCounts.CRITICAL} pools (<0.5% APY)`);
  lines.push("");

  // Fee efficiency leaderboard
  const byEfficiency = [...pools]
    .filter((p) => p.feeToTvlEfficiency > 0)
    .sort((a, b) => b.feeToTvlEfficiency - a.feeToTvlEfficiency);
  const topEfficient = byEfficiency.slice(0, 5);

  if (topEfficient.length > 0) {
    lines.push("─── Fee Efficiency Leaders (daily fees per $1K TVL) ──────────");
    topEfficient.forEach((p, i) => {
      const rank = String(i + 1).padStart(2);
      const name = p.poolName.padEnd(20).slice(0, 20);
      const eff = `$${p.feeToTvlEfficiency.toFixed(3)}`;
      lines.push(`  ${rank} ${name}  ${eff}/day per $1K TVL`);
    });
    lines.push("");
  }

  // Concentration insights
  const binsAnalyzed = pools.filter((p) => p.totalBinsWithLiquidity > 0);
  if (binsAnalyzed.length > 0) {
    lines.push("─── On-Chain Bin Analysis ────────────────────────────────────");
    binsAnalyzed
      .sort((a, b) => b.concentrationScore - a.concentrationScore)
      .slice(0, 5)
      .forEach((p) => {
        const name = p.poolName.padEnd(20).slice(0, 20);
        const conc = p.concentrationScore.toFixed(1);
        const bins = p.totalBinsWithLiquidity;
        const active = p.activeBins;
        lines.push(
          `  ${name}  Active bin: ${conc}% of TVL | ${active}/${bins} bins utilized`,
        );
      });
    lines.push("");
  }

  // Actionable insights
  lines.push("─── Insights ────────────────────────────────────────────────");
  if (summary.revenueGini > 0.7) {
    lines.push("  ⚠  Revenue highly concentrated — protocol depends on few pools.");
  }
  if (summary.top3RevenueSharePct > 80) {
    lines.push("  ⚠  Top 3 pools generate >80% of revenue — diversification risk.");
  }
  if (healthCounts.CRITICAL > healthCounts.STRONG) {
    lines.push("  ⚠  More CRITICAL pools than STRONG — protocol health declining.");
  }
  if (summary.weightedAnnualizedYieldPct < MODERATE_YIELD_PCT) {
    lines.push("  ⚠  Weighted yield below 3% — fee generation underperforming TVL.");
  }
  if (summary.weightedAnnualizedYieldPct >= STRONG_YIELD_PCT) {
    lines.push("  ✓  Protocol yield above 10% — strong fee generation relative to TVL.");
  }
  if (summary.revenueGini < 0.5) {
    lines.push("  ✓  Revenue well-distributed across pools — healthy diversification.");
  }
  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  return lines.join("\n");
}

function renderJson(summary: ProtocolSummary, pools: PoolRevenue[]): string {
  return JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      protocol: summary,
      pools: pools.sort((a, b) => b.dailyFeeUsd - a.dailyFeeUsd),
    },
    null,
    2,
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

const program = new Command();
program
  .name("hodlmm-protocol-revenue")
  .description(
    "HODLMM Protocol Revenue Tracker — aggregates fee generation across all pools to produce protocol-level revenue analysis with health classification and concentration metrics.",
  )
  .option("-t, --top <n>", "Number of top pools to display", "10")
  .option("-j, --json", "Output as JSON")
  .option("-v, --verbose", "Show detailed bin analysis per pool")
  .action(async (opts) => {
    const top = parseInt(opts.top, 10) || 10;
    const verbose = !!opts.verbose;

    process.stderr.write("Fetching HODLMM pools...\n");
    const rawPools = await fetchPools();

    if (rawPools.length === 0) {
      console.log("No HODLMM pools found with TVL >= $500.");
      process.exit(0);
    }

    process.stderr.write(
      `Analyzing ${rawPools.length} pools for revenue...\n`,
    );

    const poolRevenues: PoolRevenue[] = [];
    for (const pool of rawPools) {
      try {
        const rev = await analyzePoolRevenue(pool, verbose);
        if (rev) poolRevenues.push(rev);
      } catch {
        // skip failed pool
      }
      if (verbose && pool.poolId !== undefined) {
        await sleep(200);
      }
    }

    const summary = buildProtocolSummary(poolRevenues);

    if (opts.json) {
      console.log(renderJson(summary, poolRevenues));
    } else {
      console.log(renderText(summary, poolRevenues, top));
    }
  });

program.parse();
