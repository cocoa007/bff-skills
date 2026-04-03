#!/usr/bin/env bun
/**
 * hodlmm-gas-efficiency.ts
 *
 * HODLMM Gas Efficiency Tracker — Analyzes gas cost efficiency of LP operations
 * (add/remove liquidity, fee claims) relative to position value and fee earnings.
 * Helps LPs understand if positions are large enough to justify management costs.
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 35).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 30;
const MAX_EVENT_PAGES = 3;

// Gas cost estimates (in STX microtokens) for common LP operations
// Based on observed Stacks tx costs for DLMM contract interactions
const GAS_ESTIMATES_USTX = {
  addLiquidity: 350_000, // ~0.35 STX — add-liquidity calls
  removeLiquidity: 300_000, // ~0.30 STX — remove-liquidity calls
  claimFees: 200_000, // ~0.20 STX — claim accumulated fees
  rebalance: 650_000, // ~0.65 STX — remove + add (compound operation)
} as const;

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

type EfficiencyRating = "EFFICIENT" | "MARGINAL" | "UNPROFITABLE";

interface GasCostBreakdown {
  operation: string;
  costUstx: number;
  costUsd: number;
  costAsPctOfPosition: number;
}

interface EfficiencyResult {
  pool: string;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  stxPriceUsd: number;
  gasCosts: GasCostBreakdown[];
  dailyFeeEstimateUsd: number;
  feeToGasRatio: number;
  minProfitablePositionUsd: number;
  breakEvenDays: number;
  rebalanceBreakEvenDays: number;
  optimalRebalanceFrequency: string;
  rating: EfficiencyRating;
  recommendation: string;
  details: {
    binCount: number;
    avgBinTvlUsd: number;
    concentrationPct: number;
    effectiveFeeYieldDaily: number;
  };
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

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

async function getStxPrice(): Promise<number> {
  try {
    const data = await fetchJson("https://api.coingecko.com/api/v3/simple/price?ids=blockstack&vs_currencies=usd");
    return data?.blockstack?.usd ?? 0.35;
  } catch {
    return 0.35; // fallback
  }
}

async function fetchPools(): Promise<AppPool[]> {
  const data = await fetchJson(`${BFF_APP_BASE}/pools`);
  return (data ?? []).filter(
    (p: AppPool) => p.tvlUsd >= MIN_TVL_USD && p.poolId != null
  );
}

async function fetchBins(poolId: number, activeBinId: number): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  for (let offset = -BIN_SCAN_RADIUS; offset <= BIN_SCAN_RADIUS; offset++) {
    const binId = activeBinId + offset;
    try {
      const result = await callReadOnly("get-bin", [uintCV(poolId), uintCV(binId)]);
      const raw = parseUintResult(result);
      if (raw > 0) {
        // Split packed reserves: upper 128 bits = reserveX, lower 128 bits = reserveY
        const hex = raw.toString(16).padStart(64, "0");
        const mid = Math.floor(hex.length / 2);
        const reserveX = parseInt(hex.slice(0, mid), 16) || 0;
        const reserveY = parseInt(hex.slice(mid), 16) || 0;
        bins.push({ binId, reserveX, reserveY, totalUsd: 0 });
      }
    } catch {
      // skip inaccessible bins
    }
  }
  return bins;
}

function rateEfficiency(feeToGasRatio: number): EfficiencyRating {
  if (feeToGasRatio >= 5.0) return "EFFICIENT";
  if (feeToGasRatio >= 1.5) return "MARGINAL";
  return "UNPROFITABLE";
}

function getRecommendation(rating: EfficiencyRating, minPosition: number, breakEvenDays: number): string {
  switch (rating) {
    case "EFFICIENT":
      return `Gas-efficient pool. Active management profitable above $${Math.round(minPosition)} positions. Break-even in ~${breakEvenDays} day(s).`;
    case "MARGINAL":
      return `Marginal gas efficiency. Consider larger positions (>$${Math.round(minPosition)}) or less frequent rebalancing. Break-even in ~${breakEvenDays} day(s).`;
    case "UNPROFITABLE":
      return `Gas costs exceed fee earnings at current volume. Position must be >$${Math.round(minPosition)} to profit. Consider passive hold or wait for higher volume.`;
  }
}

function getOptimalRebalanceFreq(rebalanceBreakEvenDays: number): string {
  if (rebalanceBreakEvenDays <= 1) return "Daily rebalancing is profitable";
  if (rebalanceBreakEvenDays <= 3) return "Rebalance every 2-3 days";
  if (rebalanceBreakEvenDays <= 7) return "Weekly rebalancing recommended";
  if (rebalanceBreakEvenDays <= 14) return "Bi-weekly rebalancing at most";
  if (rebalanceBreakEvenDays <= 30) return "Monthly rebalancing only";
  return "Avoid active rebalancing — gas costs too high relative to fees";
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function doctor() {
  const checks: { name: string; ok: boolean; detail: string }[] = [];

  try {
    const pools = await fetchPools();
    checks.push({ name: "BFF API", ok: true, detail: `${pools.length} pools` });
  } catch (e: any) {
    checks.push({ name: "BFF API", ok: false, detail: e.message });
  }

  try {
    const stxPrice = await getStxPrice();
    checks.push({ name: "STX Price", ok: stxPrice > 0, detail: `$${stxPrice}` });
  } catch (e: any) {
    checks.push({ name: "STX Price", ok: false, detail: e.message });
  }

  try {
    const result = await callReadOnly("get-pair", [uintCV(1)]);
    checks.push({ name: "DLMM Contract", ok: !!result, detail: "Responsive" });
  } catch (e: any) {
    checks.push({ name: "DLMM Contract", ok: false, detail: e.message });
  }

  console.log(
    JSON.stringify({
      tool: "hodlmm-gas-efficiency",
      command: "doctor",
      timestamp: new Date().toISOString(),
      checks,
      healthy: checks.every((c) => c.ok),
    }, null, 2)
  );
}

async function run(poolIdStr: string) {
  const stxPrice = await getStxPrice();
  const pools = await fetchPools();
  const pool = pools.find(
    (p) =>
      String(p.poolId) === poolIdStr ||
      p.id === poolIdStr ||
      `${p.token0Symbol}-${p.token1Symbol}`.toLowerCase() === poolIdStr.toLowerCase()
  );

  if (!pool || pool.poolId == null) {
    console.log(JSON.stringify({ error: `Pool "${poolIdStr}" not found`, hint: "Use pool ID number or token pair (e.g., STX-sBTC)" }));
    return;
  }

  const poolId = pool.poolId!;
  const activeBinId = pool.activeBinId ?? 8388608;
  const feeBps = pool.feeBps ?? 30;

  // Fetch bin data
  const bins = await fetchBins(poolId, activeBinId);

  // Price bins in USD
  for (const b of bins) {
    const xUsd = (b.reserveX / 10 ** pool.token0Decimals) * pool.token0PriceUsd;
    const yUsd = (b.reserveY / 10 ** pool.token1Decimals) * pool.token1PriceUsd;
    b.totalUsd = xUsd + yUsd;
  }

  const nonZeroBins = bins.filter((b) => b.totalUsd > 0);
  const totalBinTvl = nonZeroBins.reduce((s, b) => s + b.totalUsd, 0);
  const avgBinTvl = nonZeroBins.length > 0 ? totalBinTvl / nonZeroBins.length : 0;

  // Concentration: what % of TVL is in active bin +/- 2
  const nearActive = bins.filter((b) => Math.abs(b.binId - activeBinId) <= 2);
  const nearActiveTvl = nearActive.reduce((s, b) => s + b.totalUsd, 0);
  const concentrationPct = totalBinTvl > 0 ? (nearActiveTvl / totalBinTvl) * 100 : 0;

  // Daily fee estimate: volume * fee rate, then LP share proportional to concentration
  const dailyPoolFees = (pool.volume24hUsd * feeBps) / 10_000;
  // Concentrated LPs near active bin earn disproportionately more
  const concentrationBoost = concentrationPct > 0 ? Math.min(concentrationPct / 50, 2.0) : 1.0;
  const dailyFeeEstimate = dailyPoolFees * concentrationBoost;

  // Effective daily yield
  const effectiveFeeYieldDaily = pool.tvlUsd > 0 ? (dailyFeeEstimate / pool.tvlUsd) * 100 : 0;

  // Gas costs in USD
  const gasCosts: GasCostBreakdown[] = Object.entries(GAS_ESTIMATES_USTX).map(([op, ustx]) => {
    const costUsd = (ustx / 1_000_000) * stxPrice;
    return {
      operation: op,
      costUstx: ustx,
      costUsd: Math.round(costUsd * 10000) / 10000,
      costAsPctOfPosition: pool.tvlUsd > 0 ? (costUsd / pool.tvlUsd) * 100 : 0,
    };
  });

  // Fee-to-gas ratio: daily fees earned vs cost of one claim
  const claimCostUsd = (GAS_ESTIMATES_USTX.claimFees / 1_000_000) * stxPrice;
  const feeToGasRatio = claimCostUsd > 0 ? dailyFeeEstimate / claimCostUsd : 0;

  // Minimum profitable position: position where daily fee share > daily gas amortized over 7 days
  // dailyFee(position) = position * (effectiveFeeYieldDaily / 100)
  // breakEven: position * yield >= claimCost / 7
  const minProfitablePosition =
    effectiveFeeYieldDaily > 0
      ? (claimCostUsd / 7) / (effectiveFeeYieldDaily / 100)
      : Infinity;

  // Break-even days: how many days until fees cover one claim tx
  const breakEvenDays =
    dailyFeeEstimate > 0 ? Math.ceil(claimCostUsd / dailyFeeEstimate) : Infinity;

  // Rebalance break-even: days for fees to cover a full rebalance (remove + add)
  const rebalanceCostUsd = (GAS_ESTIMATES_USTX.rebalance / 1_000_000) * stxPrice;
  const rebalanceBreakEvenDays =
    dailyFeeEstimate > 0 ? Math.ceil(rebalanceCostUsd / dailyFeeEstimate) : Infinity;

  const rating = rateEfficiency(feeToGasRatio);

  const result: EfficiencyResult = {
    pool: String(poolId),
    pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
    tvlUsd: Math.round(pool.tvlUsd),
    volume24hUsd: Math.round(pool.volume24hUsd),
    feeBps,
    activeBinId,
    stxPriceUsd: stxPrice,
    gasCosts,
    dailyFeeEstimateUsd: Math.round(dailyFeeEstimate * 100) / 100,
    feeToGasRatio: Math.round(feeToGasRatio * 100) / 100,
    minProfitablePositionUsd: Math.round(minProfitablePosition),
    breakEvenDays: breakEvenDays === Infinity ? -1 : breakEvenDays,
    rebalanceBreakEvenDays: rebalanceBreakEvenDays === Infinity ? -1 : rebalanceBreakEvenDays,
    optimalRebalanceFrequency: getOptimalRebalanceFreq(rebalanceBreakEvenDays),
    rating,
    recommendation: getRecommendation(rating, minProfitablePosition, breakEvenDays),
    details: {
      binCount: nonZeroBins.length,
      avgBinTvlUsd: Math.round(avgBinTvl),
      concentrationPct: Math.round(concentrationPct * 10) / 10,
      effectiveFeeYieldDaily: Math.round(effectiveFeeYieldDaily * 10000) / 10000,
    },
  };

  console.log(
    JSON.stringify({ tool: "hodlmm-gas-efficiency", command: "run", timestamp: new Date().toISOString(), result }, null, 2)
  );
}

async function scan(opts: { top?: string; minTvl?: string }) {
  const topN = parseInt(opts.top ?? "10", 10);
  const minTvl = parseFloat(opts.minTvl ?? String(MIN_TVL_USD));
  const stxPrice = await getStxPrice();
  const pools = await fetchPools();

  const filtered = pools.filter((p) => p.tvlUsd >= minTvl);
  const results: Array<{
    pool: string;
    pair: string;
    tvlUsd: number;
    volume24hUsd: number;
    feeToGasRatio: number;
    rating: EfficiencyRating;
    minPositionUsd: number;
    breakEvenDays: number;
    dailyFeeUsd: number;
  }> = [];

  for (const pool of filtered) {
    try {
      const feeBps = pool.feeBps ?? 30;
      const dailyPoolFees = (pool.volume24hUsd * feeBps) / 10_000;
      const effectiveYield = pool.tvlUsd > 0 ? dailyPoolFees / pool.tvlUsd : 0;

      const claimCostUsd = (GAS_ESTIMATES_USTX.claimFees / 1_000_000) * stxPrice;
      const feeToGasRatio = claimCostUsd > 0 ? dailyPoolFees / claimCostUsd : 0;

      const minPosition = effectiveYield > 0 ? (claimCostUsd / 7) / effectiveYield : Infinity;
      const breakEvenDays = dailyPoolFees > 0 ? Math.ceil(claimCostUsd / dailyPoolFees) : -1;

      results.push({
        pool: String(pool.poolId),
        pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
        tvlUsd: Math.round(pool.tvlUsd),
        volume24hUsd: Math.round(pool.volume24hUsd),
        feeToGasRatio: Math.round(feeToGasRatio * 100) / 100,
        rating: rateEfficiency(feeToGasRatio),
        minPositionUsd: minPosition === Infinity ? -1 : Math.round(minPosition),
        breakEvenDays,
        dailyFeeUsd: Math.round(dailyPoolFees * 100) / 100,
      });
    } catch {
      /* skip pool */
    }
  }

  results.sort((a, b) => b.feeToGasRatio - a.feeToGasRatio);
  const top = results.slice(0, topN);

  const efficient = results.filter((r) => r.rating === "EFFICIENT").length;
  const marginal = results.filter((r) => r.rating === "MARGINAL").length;
  const unprofitable = results.filter((r) => r.rating === "UNPROFITABLE").length;

  console.log(
    JSON.stringify(
      {
        tool: "hodlmm-gas-efficiency",
        command: "scan",
        timestamp: new Date().toISOString(),
        stxPriceUsd: stxPrice,
        gasCostsUsd: {
          addLiquidity: Math.round((GAS_ESTIMATES_USTX.addLiquidity / 1_000_000) * stxPrice * 10000) / 10000,
          removeLiquidity: Math.round((GAS_ESTIMATES_USTX.removeLiquidity / 1_000_000) * stxPrice * 10000) / 10000,
          claimFees: Math.round((GAS_ESTIMATES_USTX.claimFees / 1_000_000) * stxPrice * 10000) / 10000,
          rebalance: Math.round((GAS_ESTIMATES_USTX.rebalance / 1_000_000) * stxPrice * 10000) / 10000,
        },
        poolsScanned: results.length,
        results: top,
        summary: {
          efficientCount: efficient,
          marginalCount: marginal,
          unprofitableCount: unprofitable,
          avgFeeToGasRatio:
            results.length > 0
              ? Math.round((results.reduce((s, r) => s + r.feeToGasRatio, 0) / results.length) * 100) / 100
              : 0,
          mostEfficient: top[0] ?? null,
          leastEfficient: results.length > 0 ? results[results.length - 1] : null,
        },
      },
      null,
      2
    )
  );
}

async function simulate(opts: { pool: string; position: string; days?: string }) {
  const stxPrice = await getStxPrice();
  const pools = await fetchPools();
  const pool = pools.find(
    (p) =>
      String(p.poolId) === opts.pool ||
      p.id === opts.pool ||
      `${p.token0Symbol}-${p.token1Symbol}`.toLowerCase() === opts.pool.toLowerCase()
  );

  if (!pool) {
    console.log(JSON.stringify({ error: `Pool "${opts.pool}" not found` }));
    return;
  }

  const positionUsd = parseFloat(opts.position);
  const days = parseInt(opts.days ?? "30", 10);
  const feeBps = pool.feeBps ?? 30;

  // Simulate position over time
  const dailyPoolFees = (pool.volume24hUsd * feeBps) / 10_000;
  const positionShare = pool.tvlUsd > 0 ? positionUsd / pool.tvlUsd : 0;
  const dailyFeeEarned = dailyPoolFees * positionShare;

  const claimCostUsd = (GAS_ESTIMATES_USTX.claimFees / 1_000_000) * stxPrice;
  const rebalanceCostUsd = (GAS_ESTIMATES_USTX.rebalance / 1_000_000) * stxPrice;
  const addCostUsd = (GAS_ESTIMATES_USTX.addLiquidity / 1_000_000) * stxPrice;

  // Simulate different management strategies
  const strategies = [
    {
      name: "Passive Hold",
      description: "Deposit once, claim fees monthly",
      gasCosts: addCostUsd + Math.floor(days / 30) * claimCostUsd,
      feeEarnings: dailyFeeEarned * days,
    },
    {
      name: "Weekly Rebalance",
      description: "Rebalance weekly, claim fees at rebalance",
      gasCosts: addCostUsd + Math.floor(days / 7) * rebalanceCostUsd,
      feeEarnings: dailyFeeEarned * days * 1.15, // 15% boost from active management
    },
    {
      name: "Daily Active",
      description: "Daily monitoring, rebalance when drifted, claim weekly",
      gasCosts: addCostUsd + Math.floor(days / 3) * rebalanceCostUsd + Math.floor(days / 7) * claimCostUsd,
      feeEarnings: dailyFeeEarned * days * 1.25, // 25% boost from aggressive management
    },
    {
      name: "Claim Only",
      description: "No rebalancing, claim fees weekly",
      gasCosts: addCostUsd + Math.floor(days / 7) * claimCostUsd,
      feeEarnings: dailyFeeEarned * days,
    },
  ];

  const strategyResults = strategies.map((s) => ({
    ...s,
    netProfitUsd: Math.round((s.feeEarnings - s.gasCosts) * 100) / 100,
    gasAsPctOfFees: s.feeEarnings > 0 ? Math.round((s.gasCosts / s.feeEarnings) * 10000) / 100 : -1,
    profitable: s.feeEarnings > s.gasCosts,
  }));

  strategyResults.sort((a, b) => b.netProfitUsd - a.netProfitUsd);

  console.log(
    JSON.stringify(
      {
        tool: "hodlmm-gas-efficiency",
        command: "simulate",
        timestamp: new Date().toISOString(),
        pool: {
          id: String(pool.poolId),
          pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
          tvlUsd: Math.round(pool.tvlUsd),
          feeBps,
        },
        simulation: {
          positionUsd,
          days,
          dailyFeeEarned: Math.round(dailyFeeEarned * 10000) / 10000,
          positionSharePct: Math.round(positionShare * 10000) / 100,
          stxPriceUsd: stxPrice,
        },
        strategies: strategyResults,
        bestStrategy: strategyResults[0]?.name ?? "None",
        verdict:
          strategyResults[0]?.profitable
            ? `Best approach: ${strategyResults[0].name} — net +$${strategyResults[0].netProfitUsd} over ${days} days`
            : `Position too small for profitable LP management at current volume. Consider increasing to >$${Math.round(positionUsd * 2)} or waiting for higher volume.`,
      },
      null,
      2
    )
  );
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const program = new Command();
program.name("hodlmm-gas-efficiency").description("Gas cost efficiency tracker for HODLMM LP operations").version("1.0.0");

program.command("doctor").description("Check API connectivity").action(doctor);
program.command("install-packs").description("No extra deps needed").action(() => {
  console.log(
    JSON.stringify({
      tool: "hodlmm-gas-efficiency",
      command: "install-packs",
      timestamp: new Date().toISOString(),
      message: "No additional packages required. Uses workspace commander + native fetch.",
    })
  );
});

program
  .command("run")
  .description("Full gas efficiency analysis for a specific pool")
  .requiredOption("--pool <id>", "HODLMM pool ID or pair (e.g., STX-sBTC)")
  .action((opts) => run(opts.pool));

program
  .command("scan")
  .description("Rank pools by gas efficiency (fee-to-gas ratio)")
  .option("--top <n>", "Number of pools to show", "10")
  .option("--min-tvl <usd>", "Minimum TVL filter", String(MIN_TVL_USD))
  .action(scan);

program
  .command("simulate")
  .description("Simulate gas costs for different management strategies")
  .requiredOption("--pool <id>", "HODLMM pool ID or pair")
  .requiredOption("--position <usd>", "Position size in USD")
  .option("--days <n>", "Simulation period in days", "30")
  .action(simulate);

program.parse();
