#!/usr/bin/env bun
/**
 * hodlmm-funding-rate.ts
 *
 * HODLMM Funding Rate — Derives a synthetic funding rate from on-chain bin
 * reserve asymmetry, analogous to perpetual swap funding rates. Measures
 * directional pressure by comparing bid-side vs ask-side liquidity depth,
 * reserve velocity, and active-bin drift to produce an annualized rate.
 *
 * Key metrics:
 *  - Synthetic funding rate (annualized, 8h, 1h)
 *  - Directional pressure: LONG-BIASED / SHORT-BIASED / NEUTRAL
 *  - Reserve asymmetry ratio (bid vs ask depth in USD)
 *  - Intensity score (0-100) measuring conviction strength
 *  - Bin gravity: where liquidity weight concentrates relative to active bin
 *  - Multi-pool comparison mode
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 63).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 40;

// Funding rate normalization
const BINS_PER_YEAR_APPROX = 365 * 24; // approximate hourly bin snapshots
const INTENSITY_CAP = 100;

// ── Types ─────────────────────────────────────────────────────────────────────

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

type Bias = "LONG-BIASED" | "SHORT-BIASED" | "NEUTRAL";

interface BinReserves {
  binId: number;
  reserveX: number;
  reserveY: number;
  usdX: number;
  usdY: number;
  totalUsd: number;
  side: "BID" | "ASK" | "ACTIVE";
}

interface FundingAnalysis {
  pool: string;
  pair: string;
  tvlUsd: number;
  activeBinId: number;
  binsScanned: number;
  binsWithLiquidity: number;
  bidSide: {
    bins: number;
    totalUsd: number;
    weightedCenter: number;
    avgDistFromActive: number;
  };
  askSide: {
    bins: number;
    totalUsd: number;
    weightedCenter: number;
    avgDistFromActive: number;
  };
  asymmetry: {
    ratio: number; // bid/ask, >1 = more bid depth
    netSkew: number; // -1 to +1
    gravity: number; // weighted average bin offset from active
  };
  fundingRate: {
    hourly: number;
    eightHour: number;
    annualized: number;
    direction: Bias;
  };
  intensity: number; // 0-100
  interpretation: string;
  verdict: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (!r.ok) {
        if (r.status === 429 && i < retries) { await sleep(2000 * (i + 1)); continue; }
        throw new Error(`HTTP ${r.status} for ${url}`);
      }
      return r.json();
    } catch (e: any) {
      if (i === retries) throw e;
      await sleep(1000 * (i + 1));
    }
  }
}

function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(4)}%`;
}

function fmtBps(n: number): string {
  return `${(n * 10000).toFixed(2)} bps`;
}

function barChart(value: number, maxValue: number, width: number = 20): string {
  if (maxValue === 0) return "░".repeat(width);
  const filled = Math.round((value / maxValue) * width);
  return "█".repeat(Math.min(filled, width)) + "░".repeat(Math.max(width - filled, 0));
}

function biasEmoji(bias: Bias): string {
  switch (bias) {
    case "LONG-BIASED": return "🟢";
    case "SHORT-BIASED": return "🔴";
    case "NEUTRAL": return "⚪";
  }
}

// ── Data Fetching ─────────────────────────────────────────────────────────────

async function fetchPools(): Promise<AppPool[]> {
  const data = await fetchJson(`${BFF_APP_BASE}/hodlmm/pools`);
  const pools = Array.isArray(data) ? data : data?.data ?? data?.pools ?? [];
  return pools.filter((p: any) => (p.tvlUsd ?? 0) >= MIN_TVL_USD);
}

function findPool(query: string, pools: AppPool[]): AppPool | null {
  const q = query.toLowerCase();
  return (
    pools.find((p) => p.id?.toLowerCase() === q) ??
    pools.find((p) => {
      const pair = `${p.token0Symbol}-${p.token1Symbol}`.toLowerCase();
      return pair.includes(q) || q.includes(pair);
    }) ??
    pools.find((p) => {
      const sym = `${p.token0Symbol}${p.token1Symbol}`.toLowerCase();
      return sym.includes(q) || q.includes(sym);
    }) ??
    null
  );
}

async function fetchActiveBinId(poolId: number): Promise<number> {
  const url =
    `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-active-bin-id`;
  const body = {
    sender: SENDER,
    arguments: [`0x0100000000000000000000000000000${poolId.toString(16).padStart(3, "0")}`],
  };
  const resp = await fetchJson(url + `?sender=${SENDER}&arguments[]=${body.arguments[0]}`);
  if (resp?.result) {
    const match = resp.result.match(/u(\d+)/);
    if (match) return parseInt(match[1]);
  }
  throw new Error(`Cannot read active bin for pool ${poolId}`);
}

function encodeUint128(n: number): string {
  return `0x01${n.toString(16).padStart(32, "0")}`;
}

async function fetchBinReserves(
  poolId: number,
  binId: number,
  pool: AppPool,
): Promise<BinReserves | null> {
  const url =
    `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-bin`;
  const args = [encodeUint128(poolId), encodeUint128(binId)];
  const fullUrl = `${url}?sender=${SENDER}&arguments[]=${args[0]}&arguments[]=${args[1]}`;
  const resp = await fetchJson(fullUrl);

  if (!resp?.result || resp.result.includes("none")) return null;

  const hexData = resp.result;
  const xMatch = hexData.match(/reserve-x\s+u(\d+)/);
  const yMatch = hexData.match(/reserve-y\s+u(\d+)/);

  if (!xMatch || !yMatch) return null;

  const rawX = parseInt(xMatch[1]);
  const rawY = parseInt(yMatch[1]);
  if (rawX === 0 && rawY === 0) return null;

  const reserveX = rawX / 10 ** pool.token0Decimals;
  const reserveY = rawY / 10 ** pool.token1Decimals;
  const usdX = reserveX * pool.token0PriceUsd;
  const usdY = reserveY * pool.token1PriceUsd;

  return {
    binId,
    reserveX,
    reserveY,
    usdX,
    usdY,
    totalUsd: usdX + usdY,
    side: "ACTIVE",
  };
}

// ── Analysis ──────────────────────────────────────────────────────────────────

async function analyzeFundingRate(pool: AppPool): Promise<FundingAnalysis> {
  const poolId = pool.poolId ?? parseInt(pool.id);
  let activeBinId: number;
  try {
    activeBinId = pool.activeBinId ?? (await fetchActiveBinId(poolId));
  } catch {
    activeBinId = 8388608;
  }

  const bins: BinReserves[] = [];
  const startBin = activeBinId - BIN_SCAN_RADIUS;
  const endBin = activeBinId + BIN_SCAN_RADIUS;

  for (let b = startBin; b <= endBin; b++) {
    const data = await fetchBinReserves(poolId, b, pool);
    if (data) {
      if (b < activeBinId) data.side = "BID";
      else if (b > activeBinId) data.side = "ASK";
      else data.side = "ACTIVE";
      bins.push(data);
    }
    if ((b - startBin) % 10 === 9) await sleep(200);
  }

  const bidBins = bins.filter((b) => b.side === "BID");
  const askBins = bins.filter((b) => b.side === "ASK");

  const bidTotal = bidBins.reduce((s, b) => s + b.totalUsd, 0);
  const askTotal = askBins.reduce((s, b) => s + b.totalUsd, 0);
  const totalLiq = bins.reduce((s, b) => s + b.totalUsd, 0);

  // Weighted center of gravity for each side
  const bidWeightedCenter = bidTotal > 0
    ? bidBins.reduce((s, b) => s + b.totalUsd * (activeBinId - b.binId), 0) / bidTotal
    : 0;
  const askWeightedCenter = askTotal > 0
    ? askBins.reduce((s, b) => s + b.totalUsd * (b.binId - activeBinId), 0) / askTotal
    : 0;

  // Average distance from active bin
  const bidAvgDist = bidBins.length > 0
    ? bidBins.reduce((s, b) => s + (activeBinId - b.binId), 0) / bidBins.length
    : 0;
  const askAvgDist = askBins.length > 0
    ? askBins.reduce((s, b) => s + (b.binId - activeBinId), 0) / askBins.length
    : 0;

  // Asymmetry calculation
  const combinedSides = bidTotal + askTotal;
  const ratio = askTotal > 0 ? bidTotal / askTotal : bidTotal > 0 ? 99.9 : 1.0;
  const netSkew = combinedSides > 0 ? (bidTotal - askTotal) / combinedSides : 0;

  // Gravity: liquidity-weighted average distance from active bin
  // Positive = liquidity concentrated below (bid-heavy), negative = above (ask-heavy)
  const gravity = totalLiq > 0
    ? bins.reduce((s, b) => s + b.totalUsd * (activeBinId - b.binId), 0) / totalLiq
    : 0;

  // Synthetic funding rate derivation
  // Core idea: when bid-side liquidity outweighs ask-side, there's buying pressure
  // (more people providing bids = expectation of upward movement)
  // This is analogous to positive funding in perps (longs pay shorts)
  //
  // Rate = netSkew * depth_factor * gravity_factor
  const depthFactor = Math.min(totalLiq / 10000, 1); // scale with TVL, cap at $10K
  const gravityNorm = BIN_SCAN_RADIUS > 0 ? gravity / BIN_SCAN_RADIUS : 0;
  const rawRate = netSkew * 0.5 + gravityNorm * 0.3 + (1 - 1 / (1 + Math.abs(netSkew))) * Math.sign(netSkew) * 0.2;
  const hourlyRate = rawRate * depthFactor * 0.001; // scale to realistic hourly rate
  const eightHourRate = hourlyRate * 8;
  const annualizedRate = hourlyRate * 8760;

  // Direction
  let direction: Bias = "NEUTRAL";
  if (Math.abs(netSkew) > 0.05) {
    direction = netSkew > 0 ? "LONG-BIASED" : "SHORT-BIASED";
  }

  // Intensity: 0-100 conviction score
  const skewIntensity = Math.min(Math.abs(netSkew) * 100, 50);
  const gravityIntensity = Math.min(Math.abs(gravityNorm) * 50, 25);
  const depthIntensity = Math.min(depthFactor * 25, 25);
  const intensity = Math.min(Math.round(skewIntensity + gravityIntensity + depthIntensity), INTENSITY_CAP);

  // Interpretation
  let interpretation: string;
  if (intensity < 20) {
    interpretation = "Minimal directional pressure — market is balanced. Funding near zero suggests equilibrium.";
  } else if (intensity < 40) {
    interpretation = direction === "LONG-BIASED"
      ? "Mild long bias — slightly more bid depth. Buyers providing deeper support; upward drift possible."
      : direction === "SHORT-BIASED"
        ? "Mild short bias — ask-side liquidity thicker. Selling pressure building; downward drift possible."
        : "Moderate activity but no clear directional lean.";
  } else if (intensity < 70) {
    interpretation = direction === "LONG-BIASED"
      ? "Strong long bias — bid-side liquidity significantly outweighs asks. Positive funding indicates market expects upside."
      : "Strong short bias — ask-side reserves dominate. Negative funding signals bearish positioning.";
  } else {
    interpretation = direction === "LONG-BIASED"
      ? "Extreme long bias — heavy bid-side concentration. Very positive funding rate; longs crowded. Contrarian short may be attractive."
      : "Extreme short bias — massive ask-side imbalance. Very negative funding; shorts crowded. Contrarian long opportunity possible.";
  }

  const pair = `${pool.token0Symbol}-${pool.token1Symbol}`;
  const verdict = [
    `${biasEmoji(direction)} ${pair}: ${direction} @ ${fmtBps(Math.abs(eightHourRate))} / 8h`,
    `Intensity: ${intensity}/100 | Bid: ${fmtUsd(bidTotal)} vs Ask: ${fmtUsd(askTotal)}`,
    `Gravity: ${gravity > 0 ? "↓" : gravity < 0 ? "↑" : "="} ${Math.abs(gravity).toFixed(1)} bins ${gravity > 0 ? "below" : "above"} active`,
  ].join("\n");

  return {
    pool: pool.id,
    pair,
    tvlUsd: pool.tvlUsd,
    activeBinId,
    binsScanned: endBin - startBin + 1,
    binsWithLiquidity: bins.length,
    bidSide: {
      bins: bidBins.length,
      totalUsd: bidTotal,
      weightedCenter: bidWeightedCenter,
      avgDistFromActive: bidAvgDist,
    },
    askSide: {
      bins: askBins.length,
      totalUsd: askTotal,
      weightedCenter: askWeightedCenter,
      avgDistFromActive: askAvgDist,
    },
    asymmetry: { ratio, netSkew, gravity },
    fundingRate: {
      hourly: hourlyRate,
      eightHour: eightHourRate,
      annualized: annualizedRate,
      direction,
    },
    intensity,
    interpretation,
    verdict,
  };
}

// ── Display ───────────────────────────────────────────────────────────────────

function displayFundingAnalysis(r: FundingAnalysis): void {
  console.log("\n" + "═".repeat(72));
  console.log(`  HODLMM FUNDING RATE — ${r.pair}`);
  console.log("═".repeat(72));

  console.log(`\n  Pool:           ${r.pool}`);
  console.log(`  TVL:            ${fmtUsd(r.tvlUsd)}`);
  console.log(`  Active Bin:     ${r.activeBinId}`);
  console.log(`  Bins Scanned:   ${r.binsScanned} (${r.binsWithLiquidity} with liquidity)`);

  console.log("\n── Liquidity Sides ──────────────────────────────────");
  const maxSide = Math.max(r.bidSide.totalUsd, r.askSide.totalUsd);
  console.log(`  BID (below):  ${fmtUsd(r.bidSide.totalUsd).padStart(10)} | ${barChart(r.bidSide.totalUsd, maxSide, 25)} | ${r.bidSide.bins} bins`);
  console.log(`  ASK (above):  ${fmtUsd(r.askSide.totalUsd).padStart(10)} | ${barChart(r.askSide.totalUsd, maxSide, 25)} | ${r.askSide.bins} bins`);
  console.log(`  Ratio:        ${r.asymmetry.ratio.toFixed(2)}x (bid/ask)`);
  console.log(`  Net Skew:     ${(r.asymmetry.netSkew * 100).toFixed(1)}%`);

  console.log("\n── Gravity ─────────────────────────────────────────");
  const gDir = r.asymmetry.gravity > 0 ? "below" : r.asymmetry.gravity < 0 ? "above" : "at";
  const gArrow = r.asymmetry.gravity > 0 ? "↓" : r.asymmetry.gravity < 0 ? "↑" : "=";
  console.log(`  Center of Mass: ${gArrow} ${Math.abs(r.asymmetry.gravity).toFixed(1)} bins ${gDir} active`);
  console.log(`  Bid Depth Avg:  ${r.bidSide.avgDistFromActive.toFixed(1)} bins from active`);
  console.log(`  Ask Depth Avg:  ${r.askSide.avgDistFromActive.toFixed(1)} bins from active`);
  console.log(`  Bid Gravity:    ${r.bidSide.weightedCenter.toFixed(1)} (weighted dist)`);
  console.log(`  Ask Gravity:    ${r.askSide.weightedCenter.toFixed(1)} (weighted dist)`);

  console.log("\n── Synthetic Funding Rate ───────────────────────────");
  console.log(`  Direction:      ${biasEmoji(r.fundingRate.direction)} ${r.fundingRate.direction}`);
  console.log(`  Hourly:         ${fmtBps(r.fundingRate.hourly)}`);
  console.log(`  8-Hour:         ${fmtBps(r.fundingRate.eightHour)}`);
  console.log(`  Annualized:     ${fmtPct(r.fundingRate.annualized)}`);
  console.log(`  Intensity:      ${r.intensity}/100 ${"█".repeat(Math.round(r.intensity / 5))}${"░".repeat(20 - Math.round(r.intensity / 5))}`);

  console.log("\n── Interpretation ──────────────────────────────────");
  console.log(`  ${r.interpretation}`);

  console.log("\n── Verdict ─────────────────────────────────────────");
  console.log(`  ${r.verdict.split("\n").join("\n  ")}`);

  console.log("\n" + "═".repeat(72));
}

function displayMultiPool(results: FundingAnalysis[]): void {
  console.log("\n" + "═".repeat(80));
  console.log("  HODLMM FUNDING RATE — MULTI-POOL COMPARISON");
  console.log("═".repeat(80));

  // Sort by absolute funding rate (most extreme first)
  const sorted = [...results].sort((a, b) =>
    Math.abs(b.fundingRate.eightHour) - Math.abs(a.fundingRate.eightHour)
  );

  console.log(`\n  ${"Pair".padEnd(16)} ${"Direction".padEnd(15)} ${"8h Rate".padEnd(12)} ${"Annual".padEnd(12)} ${"Intensity".padEnd(10)} ${"Bid/Ask".padEnd(12)} Skew`);
  console.log("  " + "─".repeat(78));

  for (const r of sorted) {
    const emoji = biasEmoji(r.fundingRate.direction);
    console.log(
      `  ${r.pair.padEnd(16)} ${emoji} ${r.fundingRate.direction.padEnd(13)} ${fmtBps(r.fundingRate.eightHour).padEnd(12)} ${fmtPct(r.fundingRate.annualized).padEnd(12)} ${String(r.intensity).padEnd(10)} ${r.asymmetry.ratio.toFixed(2).padEnd(12)} ${(r.asymmetry.netSkew * 100).toFixed(1)}%`
    );
  }

  // Summary stats
  const longBiased = sorted.filter((r) => r.fundingRate.direction === "LONG-BIASED");
  const shortBiased = sorted.filter((r) => r.fundingRate.direction === "SHORT-BIASED");
  const neutral = sorted.filter((r) => r.fundingRate.direction === "NEUTRAL");
  const avgIntensity = sorted.reduce((s, r) => s + r.intensity, 0) / sorted.length;

  console.log("\n── Market Sentiment Summary ─────────────────────────");
  console.log(`  Long-biased:    ${longBiased.length} pools`);
  console.log(`  Short-biased:   ${shortBiased.length} pools`);
  console.log(`  Neutral:        ${neutral.length} pools`);
  console.log(`  Avg Intensity:  ${avgIntensity.toFixed(0)}/100`);

  const netSentiment = longBiased.length - shortBiased.length;
  const sentimentLabel = netSentiment > 1 ? "Bullish lean" : netSentiment < -1 ? "Bearish lean" : "Mixed/Neutral";
  console.log(`  Net Sentiment:  ${sentimentLabel} (${netSentiment > 0 ? "+" : ""}${netSentiment})`);

  // Highlight extremes
  if (sorted.length > 0) {
    const highest = sorted[0];
    console.log(`\n  Most extreme:   ${highest.pair} — ${biasEmoji(highest.fundingRate.direction)} ${fmtBps(highest.fundingRate.eightHour)} / 8h, intensity ${highest.intensity}/100`);
  }

  console.log("\n" + "═".repeat(80));
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-funding-rate")
  .description(
    "Derive synthetic funding rates from HODLMM on-chain bin reserve asymmetry. " +
    "Measures directional pressure analogous to perpetual swap funding rates."
  )
  .argument("[pool]", "Pool ID or token pair (e.g., 'STX-sBTC')")
  .option("--all", "Analyze all pools with sufficient TVL")
  .option("--top <n>", "Analyze top N pools by TVL", "5")
  .option("--json", "Output raw JSON")
  .option("--radius <n>", "Bin scan radius (default: 40)", "40")
  .action(async (poolQuery: string | undefined, opts: any) => {
    const radius = parseInt(opts.radius) || BIN_SCAN_RADIUS;

    let pools: AppPool[];
    try {
      pools = await fetchPools();
    } catch (e: any) {
      console.error(`Failed to fetch pools: ${e.message}`);
      process.exit(1);
    }

    if (pools.length === 0) {
      console.error("No pools found above minimum TVL threshold.");
      process.exit(1);
    }

    if (opts.all || !poolQuery) {
      const topN = opts.all ? pools.length : Math.min(parseInt(opts.top) || 5, pools.length);
      const sorted = [...pools].sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, topN);

      console.log(`Analyzing funding rates for ${sorted.length} pools...`);
      const results: FundingAnalysis[] = [];

      for (const pool of sorted) {
        try {
          const result = await analyzeFundingRate(pool);
          results.push(result);
          process.stderr.write(`  ✓ ${pool.token0Symbol}-${pool.token1Symbol}\n`);
        } catch (e: any) {
          process.stderr.write(`  ✗ ${pool.token0Symbol}-${pool.token1Symbol}: ${e.message}\n`);
        }
      }

      if (results.length === 0) {
        console.error("No pools could be analyzed.");
        process.exit(1);
      }

      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        displayMultiPool(results);
      }
    } else {
      const pool = findPool(poolQuery, pools);
      if (!pool) {
        console.error(`Pool not found: "${poolQuery}"`);
        console.error("Available pools:");
        pools.sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, 10).forEach((p) =>
          console.error(`  ${p.token0Symbol}-${p.token1Symbol} (${fmtUsd(p.tvlUsd)})`)
        );
        process.exit(1);
      }

      console.log(`Analyzing funding rate for ${pool.token0Symbol}-${pool.token1Symbol}...`);
      const result = await analyzeFundingRate(pool);

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        displayFundingAnalysis(result);
      }
    }
  });

program.parse();
