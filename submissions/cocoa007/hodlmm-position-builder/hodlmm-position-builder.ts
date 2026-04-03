#!/usr/bin/env bun
/**
 * hodlmm-position-builder.ts
 *
 * HODLMM Position Builder — Constructs optimal multi-bin LP position
 * allocations based on risk profile, capital amount, and live on-chain
 * pool conditions. Recommends bin distribution strategies (uniform,
 * bell-curve, concentrated) with expected return/risk tradeoffs.
 *
 * Key metrics:
 *  - Bin allocation weights per strategy (uniform, bell-curve, concentrated)
 *  - Expected fee yield per strategy (from volume/TVL and fee tier)
 *  - IL exposure estimate per strategy
 *  - Capital efficiency score (active capital / total deployed)
 *  - Risk-adjusted recommendation based on user risk tolerance
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 39).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 100;
const BIN_SCAN_RADIUS = 15;
const FALLBACK_STX_PRICE_USD = 0.80;

// Gas cost estimates (uSTX)
const GAS_COST_PER_BIN_USTX = 80_000;    // ~0.08 STX incremental cost per bin
const BASE_GAS_COST_USTX = 400_000;      // ~0.40 STX base cost for add-liquidity

// Strategy names
type StrategyName = "UNIFORM" | "BELL_CURVE" | "CONCENTRATED" | "BARBELL";

// ── Types ──────────────────────────────────────────────────────────────────────

interface AppPool {
  id: string;
  poolContract: string;
  token0Symbol: string;
  token1Symbol: string;
  tvlUsd: number;
  volume24hUsd: number;
  poolId: number;
  token0Decimals: number;
  token1Decimals: number;
  token0PriceUsd: number;
  token1PriceUsd: number;
  activeBinId?: number;
  feeBps?: number;
}

interface BinData {
  binId: number;
  offset: number;
  reserveX: number;
  reserveY: number;
  totalReserveUsd: number;
  occupancy: number;
}

interface AllocationBin {
  binId: number;
  offset: number;
  weight: number;
  capitalUsd: number;
  existingLiquidityUsd: number;
  yourSharePct: number;
  expectedDailyFeesUsd: number;
}

interface Strategy {
  name: StrategyName;
  description: string;
  bins: AllocationBin[];
  totalCapitalUsd: number;
  activeCapitalPct: number;
  expectedDailyFeesUsd: number;
  expectedAnnualYieldPct: number;
  ilExposureClass: "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";
  gasCostUsd: number;
  breakEvenDays: number;
  riskScore: number;
  suitableFor: string;
}

interface PositionPlan {
  timestamp: string;
  pool: {
    poolId: number;
    pair: string;
    tvlUsd: number;
    volume24hUsd: number;
    feeBps: number;
    activeBinId: number;
    stxPriceUsd: number;
  };
  capitalUsd: number;
  riskProfile: string;
  binRange: { low: number; high: number; count: number };
  strategies: Strategy[];
  recommendation: Strategy;
  warnings: string[];
  summary: string;
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

// ── Pool Data ──────────────────────────────────────────────────────────────────

let _poolCache: AppPool[] | null = null;

async function fetchAllPools(): Promise<AppPool[]> {
  if (_poolCache) return _poolCache;
  const data = await fetchJson(`${BFF_APP_BASE}/pools`);
  const rawPools = data?.data || data?.pools || data || [];
  const pools: AppPool[] = rawPools.map((p: any) => {
    const tx = p.tokens?.tokenX || {};
    const ty = p.tokens?.tokenY || {};
    const poolIdStr = p.poolId || p.id || "0";
    const numericId = parseInt(poolIdStr.toString().replace(/^dlmm_/, "")) || 0;
    return {
      id: poolIdStr,
      poolContract: p.poolContract || "",
      token0Symbol: tx.symbol || p.token0Symbol || "?",
      token1Symbol: ty.symbol || p.token1Symbol || "?",
      tvlUsd: parseFloat(p.tvlUsd ?? "0"),
      volume24hUsd: parseFloat(p.volumeUsd1d ?? p.volume24hUsd ?? "0"),
      poolId: numericId,
      token0Decimals: parseInt(tx.decimals ?? p.token0Decimals ?? "6"),
      token1Decimals: parseInt(ty.decimals ?? p.token1Decimals ?? "6"),
      token0PriceUsd: parseFloat(tx.priceUsd ?? p.token0PriceUsd ?? "0"),
      token1PriceUsd: parseFloat(ty.priceUsd ?? p.token1PriceUsd ?? "0"),
      activeBinId: parseInt(p.activeBinId ?? "0") || undefined,
      feeBps: parseFloat(p.feeBps ?? "30"),
    };
  });
  _poolCache = pools.filter((p) => p.tvlUsd >= MIN_TVL_USD);
  return _poolCache;
}

function findPool(pools: AppPool[], id: number): AppPool | undefined {
  return pools.find((p) => p.poolId === id);
}

// ── STX Price ──────────────────────────────────────────────────────────────────

async function fetchStxPrice(): Promise<number> {
  try {
    const pools = await fetchAllPools();
    for (const p of pools) {
      if (p.token0Symbol === "STX" && p.token0PriceUsd > 0) return p.token0PriceUsd;
      if (p.token1Symbol === "STX" && p.token1PriceUsd > 0) return p.token1PriceUsd;
    }
  } catch { /* fallback */ }
  return FALLBACK_STX_PRICE_USD;
}

// ── Bin Scanning ───────────────────────────────────────────────────────────────

async function scanBins(pool: AppPool, radius: number): Promise<BinData[]> {
  if (!pool.activeBinId) return [];

  const bins: BinData[] = [];
  for (let d = -radius; d <= radius; d++) {
    const binId = pool.activeBinId + d;
    try {
      const result = await callReadOnly("get-bin", [uintCV(pool.poolId), uintCV(binId)]);

      let reserveX = 0, reserveY = 0;
      const val = result?.result;
      if (val) {
        const hexStr = typeof val === "string" ? val.replace("0x", "") : "";
        if (hexStr.startsWith("07")) {
          // OK response with tuple — parse reserve-x, reserve-y from the tuple
          // For simplicity, use a regex approach on the repr
          const repr = result?.result_repr || "";
          const rxMatch = repr.match(/reserve-x\s+u(\d+)/);
          const ryMatch = repr.match(/reserve-y\s+u(\d+)/);
          reserveX = rxMatch ? parseInt(rxMatch[1]) / Math.pow(10, pool.token0Decimals) : 0;
          reserveY = ryMatch ? parseInt(ryMatch[1]) / Math.pow(10, pool.token1Decimals) : 0;
        }
      }

      const usdValue = reserveX * (pool.token0PriceUsd || FALLBACK_STX_PRICE_USD) +
                        reserveY * (pool.token1PriceUsd || FALLBACK_STX_PRICE_USD);

      bins.push({
        binId,
        offset: d,
        reserveX,
        reserveY,
        totalReserveUsd: usdValue,
        occupancy: usdValue > 0 ? 1 : 0,
      });
    } catch {
      bins.push({ binId, offset: d, reserveX: 0, reserveY: 0, totalReserveUsd: 0, occupancy: 0 });
    }
  }

  return bins;
}

// ── Distribution Generators ────────────────────────────────────────────────────

function uniformWeights(count: number): number[] {
  return Array(count).fill(1 / count);
}

function bellCurveWeights(count: number): number[] {
  const center = (count - 1) / 2;
  const sigma = count / 4;
  const raw = Array.from({ length: count }, (_, i) => {
    const z = (i - center) / sigma;
    return Math.exp(-0.5 * z * z);
  });
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / sum);
}

function concentratedWeights(count: number): number[] {
  // 80% in center 3 bins, 20% spread across rest
  const center = Math.floor(count / 2);
  const raw = Array.from({ length: count }, (_, i) => {
    const dist = Math.abs(i - center);
    if (dist === 0) return 10;
    if (dist === 1) return 5;
    return 0.5;
  });
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / sum);
}

function barbellWeights(count: number): number[] {
  // Weight concentrated at edges and center — hedged approach
  const center = Math.floor(count / 2);
  const raw = Array.from({ length: count }, (_, i) => {
    const dist = Math.abs(i - center);
    const edgeDist = Math.min(i, count - 1 - i);
    if (dist === 0) return 6;
    if (edgeDist <= 1) return 4;
    return 1;
  });
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / sum);
}

// ── Strategy Builder ───────────────────────────────────────────────────────────

function buildStrategy(
  name: StrategyName,
  description: string,
  weights: number[],
  bins: BinData[],
  capitalUsd: number,
  pool: AppPool,
  stxPrice: number,
  suitableFor: string,
): Strategy {
  const feePct = (pool.feeBps || 30) / 10_000;
  const dailyVolumePerBinUsd = (pool.volume24hUsd || 0) / Math.max(bins.filter((b) => b.totalReserveUsd > 0).length, 1);

  const allocBins: AllocationBin[] = bins.map((bin, i) => {
    const weight = weights[i] || 0;
    const alloc = capitalUsd * weight;
    const totalLiqAfter = bin.totalReserveUsd + alloc;
    const yourShare = totalLiqAfter > 0 ? alloc / totalLiqAfter : 0;
    // Fee estimate: your share of fees generated in this bin
    const binFees = dailyVolumePerBinUsd * feePct * yourShare;

    return {
      binId: bin.binId,
      offset: bin.offset,
      weight,
      capitalUsd: alloc,
      existingLiquidityUsd: bin.totalReserveUsd,
      yourSharePct: yourShare,
      expectedDailyFeesUsd: binFees,
    };
  });

  const totalDailyFees = allocBins.reduce((s, b) => s + b.expectedDailyFeesUsd, 0);
  const annualYield = capitalUsd > 0 ? (totalDailyFees * 365) / capitalUsd : 0;

  // Active capital: how much is in bins near active bin (±2)
  const activeBins = allocBins.filter((b) => Math.abs(b.offset) <= 2);
  const activeCapital = activeBins.reduce((s, b) => s + b.capitalUsd, 0);
  const activeCapitalPct = capitalUsd > 0 ? activeCapital / capitalUsd : 0;

  // Gas cost for the position
  const numBins = allocBins.filter((b) => b.weight > 0).length;
  const gasCostUstx = BASE_GAS_COST_USTX + GAS_COST_PER_BIN_USTX * numBins;
  const gasCostUsd = (gasCostUstx / 1_000_000) * stxPrice;

  // Break-even: days until fees cover gas
  const breakEvenDays = totalDailyFees > 0 ? gasCostUsd / totalDailyFees : Infinity;

  // IL exposure based on spread
  const maxOffset = Math.max(...allocBins.filter((b) => b.weight > 0.01).map((b) => Math.abs(b.offset)));
  let ilExposureClass: "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";
  if (maxOffset <= 2) ilExposureClass = "VERY_HIGH";  // tight range = high IL risk if price moves out
  else if (maxOffset <= 5) ilExposureClass = "HIGH";
  else if (maxOffset <= 10) ilExposureClass = "MODERATE";
  else ilExposureClass = "LOW";

  // Risk score 0-100 (higher = riskier)
  const concentrationRisk = activeCapitalPct > 0.8 ? 30 : activeCapitalPct > 0.5 ? 15 : 5;
  const rangeRisk = maxOffset <= 2 ? 35 : maxOffset <= 5 ? 20 : maxOffset <= 10 ? 10 : 5;
  const sizeRisk = capitalUsd > pool.tvlUsd * 0.1 ? 25 : capitalUsd > pool.tvlUsd * 0.05 ? 15 : 5;
  const riskScore = Math.min(100, concentrationRisk + rangeRisk + sizeRisk);

  return {
    name,
    description,
    bins: allocBins.filter((b) => b.weight > 0.001),
    totalCapitalUsd: capitalUsd,
    activeCapitalPct,
    expectedDailyFeesUsd: totalDailyFees,
    expectedAnnualYieldPct: annualYield,
    ilExposureClass,
    gasCostUsd,
    breakEvenDays: breakEvenDays === Infinity ? 999 : Math.ceil(breakEvenDays),
    riskScore,
    suitableFor,
  };
}

// ── Recommendation Logic ───────────────────────────────────────────────────────

function pickRecommendation(strategies: Strategy[], risk: string): Strategy {
  // Score each strategy based on risk preference
  const scored = strategies.map((s) => {
    let score = 0;
    // Base: risk-adjusted yield
    score += s.expectedAnnualYieldPct * 100;

    // Penalize based on risk preference
    if (risk === "conservative") {
      score -= s.riskScore * 2;
      if (s.breakEvenDays > 30) score -= 20;
    } else if (risk === "moderate") {
      score -= s.riskScore;
      if (s.breakEvenDays > 14) score -= 10;
    } else {
      // aggressive
      score -= s.riskScore * 0.3;
      score += s.activeCapitalPct * 20; // reward high capital efficiency
    }

    // Penalize very long break-even
    if (s.breakEvenDays > 60) score -= 30;

    return { strategy: s, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].strategy;
}

// ── Main Analysis ──────────────────────────────────────────────────────────────

async function buildPositionPlan(
  poolId: number,
  capitalUsd: number,
  risk: string,
  rangeWidth: number,
): Promise<PositionPlan> {
  const pools = await fetchAllPools();
  const pool = findPool(pools, poolId);
  if (!pool) throw new Error(`Pool ${poolId} not found`);
  if (!pool.activeBinId) throw new Error(`Pool ${poolId} has no active bin`);

  const stxPrice = await fetchStxPrice();
  const radius = Math.min(Math.floor(rangeWidth / 2), BIN_SCAN_RADIUS);

  // Scan bins around active bin
  const bins = await scanBins(pool, radius);
  if (bins.length === 0) throw new Error("No bin data available");

  const warnings: string[] = [];

  // Capital size warnings
  if (capitalUsd > pool.tvlUsd * 0.2) {
    warnings.push(`Capital (${formatUsd(capitalUsd)}) is >${formatPct(0.2)} of pool TVL — significant price impact risk`);
  }
  if (capitalUsd < 10) {
    warnings.push("Capital too small — gas costs will likely exceed fee earnings");
  }

  // Pool health warnings
  if (pool.volume24hUsd < pool.tvlUsd * 0.01) {
    warnings.push("Very low volume/TVL ratio — fee generation may be minimal");
  }

  // Build 4 strategies
  const strategies: Strategy[] = [
    buildStrategy(
      "UNIFORM", "Equal allocation across all bins — maximum range, lowest concentration risk",
      uniformWeights(bins.length), bins, capitalUsd, pool, stxPrice,
      "Passive LPs who want broad coverage and minimal management",
    ),
    buildStrategy(
      "BELL_CURVE", "Gaussian distribution centered on active bin — balanced yield and range",
      bellCurveWeights(bins.length), bins, capitalUsd, pool, stxPrice,
      "Most LPs — good balance of fee capture and IL protection",
    ),
    buildStrategy(
      "CONCENTRATED", "Heavy weight on active bin ±1 — maximum fee capture, highest IL risk",
      concentratedWeights(bins.length), bins, capitalUsd, pool, stxPrice,
      "Active managers willing to rebalance frequently",
    ),
    buildStrategy(
      "BARBELL", "Weight at center and edges — hedged approach for uncertain markets",
      barbellWeights(bins.length), bins, capitalUsd, pool, stxPrice,
      "LPs expecting volatility who want some range protection",
    ),
  ];

  const recommendation = pickRecommendation(strategies, risk);

  // Summary
  const pair = `${pool.token0Symbol}/${pool.token1Symbol}`;
  const summary = [
    `Position Builder: ${pair} pool #${poolId}`,
    `Capital: ${formatUsd(capitalUsd)} | Risk: ${risk} | Range: ${bins.length} bins`,
    `Recommended: ${recommendation.name} — ${formatPct(recommendation.expectedAnnualYieldPct)} est. APY`,
    `Break-even: ${recommendation.breakEvenDays}d | IL exposure: ${recommendation.ilExposureClass}`,
    `Gas cost: ${formatUsd(recommendation.gasCostUsd)} | Risk score: ${recommendation.riskScore}/100`,
    warnings.length > 0 ? `\nWarnings:\n${warnings.map((w) => `  ⚠ ${w}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");

  return {
    timestamp: new Date().toISOString(),
    pool: {
      poolId: pool.poolId,
      pair,
      tvlUsd: pool.tvlUsd,
      volume24hUsd: pool.volume24hUsd,
      feeBps: pool.feeBps || 30,
      activeBinId: pool.activeBinId,
      stxPriceUsd: stxPrice,
    },
    capitalUsd,
    riskProfile: risk,
    binRange: {
      low: bins[0].binId,
      high: bins[bins.length - 1].binId,
      count: bins.length,
    },
    strategies,
    recommendation,
    warnings,
    summary,
  };
}

// ── ASCII Visualization ────────────────────────────────────────────────────────

function renderAllocationChart(strategy: Strategy): string {
  const bins = strategy.bins;
  if (bins.length === 0) return "(no bins)";

  const maxWeight = Math.max(...bins.map((b) => b.weight));
  const barWidth = 30;
  const lines: string[] = [
    `\n  ${strategy.name} Allocation (${bins.length} bins)`,
    `  ${"─".repeat(50)}`,
  ];

  for (const bin of bins) {
    const barLen = maxWeight > 0 ? Math.round((bin.weight / maxWeight) * barWidth) : 0;
    const bar = "█".repeat(barLen) + "░".repeat(barWidth - barLen);
    const marker = bin.offset === 0 ? " ◄ active" : "";
    lines.push(`  ${bin.offset >= 0 ? "+" : ""}${bin.offset.toString().padStart(3)} │${bar}│ ${(bin.weight * 100).toFixed(1)}% ${formatUsd(bin.capitalUsd)}${marker}`);
  }

  lines.push(`  ${"─".repeat(50)}`);
  lines.push(`  Daily fees: ${formatUsd(strategy.expectedDailyFeesUsd)} | APY: ${formatPct(strategy.expectedAnnualYieldPct)} | Risk: ${strategy.riskScore}/100`);

  return lines.join("\n");
}

// ── CLI ────────────────────────────────────────────────────────────────────────

const program = new Command();
program
  .name("hodlmm-position-builder")
  .description("Construct optimal multi-bin LP position allocations for HODLMM pools")
  .argument("<pool-id>", "HODLMM pool ID", parseInt)
  .option("-c, --capital <usd>", "Capital amount in USD", "100")
  .option("-r, --risk <profile>", "Risk profile: conservative, moderate, aggressive", "moderate")
  .option("-w, --width <bins>", "Bin range width (total bins to cover)", "20")
  .option("--json", "Output raw JSON")
  .option("--compare", "Show all strategies side-by-side")
  .action(async (poolId: number, opts: any) => {
    try {
      const capital = parseFloat(opts.capital);
      const risk = opts.risk.toLowerCase();
      const width = parseInt(opts.width);

      if (!["conservative", "moderate", "aggressive"].includes(risk)) {
        console.error("Error: --risk must be conservative, moderate, or aggressive");
        process.exit(1);
      }

      const plan = await buildPositionPlan(poolId, capital, risk, width);

      if (opts.json) {
        console.log(JSON.stringify(plan, null, 2));
        return;
      }

      // Header
      console.log(`\n╔══════════════════════════════════════════════════════╗`);
      console.log(`║  HODLMM Position Builder                            ║`);
      console.log(`╚══════════════════════════════════════════════════════╝`);
      console.log(`  Pool: ${plan.pool.pair} (#${plan.pool.poolId})`);
      console.log(`  TVL: ${formatUsd(plan.pool.tvlUsd)} | Vol 24h: ${formatUsd(plan.pool.volume24hUsd)} | Fee: ${plan.pool.feeBps}bps`);
      console.log(`  Active bin: ${plan.pool.activeBinId} | STX: ${formatUsd(plan.pool.stxPriceUsd)}`);
      console.log(`  Capital: ${formatUsd(plan.capitalUsd)} | Risk: ${plan.riskProfile} | Range: ${plan.binRange.count} bins`);

      if (plan.warnings.length > 0) {
        console.log(`\n  Warnings:`);
        for (const w of plan.warnings) console.log(`    ⚠ ${w}`);
      }

      if (opts.compare) {
        // Show all strategies
        for (const strat of plan.strategies) {
          console.log(renderAllocationChart(strat));
          console.log(`  ${strat.description}`);
          console.log(`  Suitable for: ${strat.suitableFor}`);
          console.log(`  Gas: ${formatUsd(strat.gasCostUsd)} | Break-even: ${strat.breakEvenDays}d | IL: ${strat.ilExposureClass}`);
        }
      }

      // Recommendation
      const rec = plan.recommendation;
      console.log(`\n  ★ RECOMMENDED: ${rec.name}`);
      console.log(`  ${rec.description}`);
      console.log(renderAllocationChart(rec));
      console.log(`\n  Metrics:`);
      console.log(`    Est. daily fees:   ${formatUsd(rec.expectedDailyFeesUsd)}`);
      console.log(`    Est. annual yield: ${formatPct(rec.expectedAnnualYieldPct)}`);
      console.log(`    Active capital:    ${formatPct(rec.activeCapitalPct)}`);
      console.log(`    IL exposure:       ${rec.ilExposureClass}`);
      console.log(`    Gas cost:          ${formatUsd(rec.gasCostUsd)}`);
      console.log(`    Break-even:        ${rec.breakEvenDays} days`);
      console.log(`    Risk score:        ${rec.riskScore}/100`);
      console.log(`    Suitable for:      ${rec.suitableFor}`);

      // Bin-level detail for recommended strategy
      console.log(`\n  Bin Allocations:`);
      console.log(`  ${"Bin".padEnd(8)} ${"Offset".padEnd(8)} ${"Weight".padEnd(8)} ${"Capital".padEnd(12)} ${"Existing".padEnd(12)} ${"Share".padEnd(8)} ${"Fees/d".padEnd(10)}`);
      console.log(`  ${"─".repeat(66)}`);
      for (const bin of rec.bins) {
        if (bin.weight < 0.001) continue;
        const marker = bin.offset === 0 ? " ◄" : "";
        console.log(
          `  ${bin.binId.toString().padEnd(8)} ${(bin.offset >= 0 ? "+" : "").concat(bin.offset.toString()).padEnd(8)} ${(bin.weight * 100).toFixed(1).padStart(5)}%  ${formatUsd(bin.capitalUsd).padEnd(12)} ${formatUsd(bin.existingLiquidityUsd).padEnd(12)} ${formatPct(bin.yourSharePct).padEnd(8)} ${formatUsd(bin.expectedDailyFeesUsd).padEnd(10)}${marker}`,
        );
      }

      console.log(`\n  ${plan.summary.split("\n")[0]}`);
      console.log();
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
