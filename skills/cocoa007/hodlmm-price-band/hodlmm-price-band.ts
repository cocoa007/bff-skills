#!/usr/bin/env bun
/**
 * hodlmm-price-band.ts
 *
 * HODLMM Price Band Analyzer — Identifies trading ranges, support/resistance
 * levels, and mean-reversion signals from active bin movements and reserve
 * distributions. Helps LPs decide where to concentrate liquidity by mapping
 * where price has been spending time and where liquidity walls sit.
 *
 * Key metrics:
 *  - Current price band (bin range where 80% of liquidity resides)
 *  - Support/resistance bins (liquidity walls above/below active bin)
 *  - Band width vs active range (efficiency of LP deployment)
 *  - Mean-reversion score (how far price is from liquidity centroid)
 *  - Regime classification (RANGE-BOUND / TRENDING / BREAKOUT / COMPRESSED)
 *  - Optimal LP range recommendation
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 60).
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
const LIQUIDITY_BAND_THRESHOLD = 0.80;

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

interface BinData {
  binId: number;
  reserveX: number;
  reserveY: number;
  totalUsd: number;
  shareOfTotal: number;
  cumulativeShare: number;
}

interface LiquidityWall {
  binId: number;
  side: "support" | "resistance";
  strengthUsd: number;
  strengthPct: number;
  distanceFromActive: number;
}

interface PriceBand {
  lowerBin: number;
  upperBin: number;
  widthBins: number;
  coveragePct: number;
  totalUsd: number;
}

interface MeanReversionSignal {
  centroidBin: number;
  activeBin: number;
  deviation: number;
  deviationPct: number;
  signal: "STRONGLY_BELOW" | "BELOW" | "AT_CENTER" | "ABOVE" | "STRONGLY_ABOVE";
  interpretation: string;
}

type Regime = "RANGE-BOUND" | "TRENDING" | "BREAKOUT" | "COMPRESSED";

interface PriceBandAnalysis {
  pool: string;
  pair: string;
  tvlUsd: number;
  activeBinId: number;
  binsScanned: number;
  binsWithLiquidity: number;
  priceBand: PriceBand;
  supportWalls: LiquidityWall[];
  resistanceWalls: LiquidityWall[];
  meanReversion: MeanReversionSignal;
  regime: Regime;
  bandEfficiency: number;
  optimalRange: { lower: number; upper: number; reason: string };
  binDistribution: BinData[];
  verdict: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (!r.ok) {
        if (r.status === 429 && i < retries) {
          await sleep(2000 * (i + 1));
          continue;
        }
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
  return `${(n * 100).toFixed(1)}%`;
}

function barChart(value: number, maxValue: number, width: number = 20): string {
  if (maxValue === 0) return "░".repeat(width);
  const filled = Math.round((value / maxValue) * width);
  return "█".repeat(Math.min(filled, width)) + "░".repeat(Math.max(width - filled, 0));
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
  return 8388608;
}

async function fetchBinReserves(
  poolId: number,
  binId: number,
): Promise<{ reserveX: number; reserveY: number }> {
  const poolHex = `0x0100000000000000000000000000000${poolId.toString(16).padStart(3, "0")}`;
  const binHex = `0x0100000000000000000000000000${binId.toString(16).padStart(6, "0")}`;
  const url =
    `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-bin` +
    `?sender=${SENDER}&arguments[]=${poolHex}&arguments[]=${binHex}`;

  try {
    const resp = await fetchJson(url);
    if (resp?.result) {
      const rxMatch = resp.result.match(/reserve-x\s+u(\d+)/);
      const ryMatch = resp.result.match(/reserve-y\s+u(\d+)/);
      return {
        reserveX: rxMatch ? parseInt(rxMatch[1]) : 0,
        reserveY: ryMatch ? parseInt(ryMatch[1]) : 0,
      };
    }
  } catch {}
  return { reserveX: 0, reserveY: 0 };
}

async function scanBins(
  pool: AppPool,
  activeBinId: number,
  radius: number
): Promise<BinData[]> {
  const bins: BinData[] = [];
  const dec0 = pool.token0Decimals || 6;
  const dec1 = pool.token1Decimals || 6;
  const p0 = pool.token0PriceUsd || 0;
  const p1 = pool.token1PriceUsd || 0;
  const poolId = pool.poolId ?? 1;

  const startBin = activeBinId - radius;
  const endBin = activeBinId + radius;

  const batchSize = 5;
  for (let i = startBin; i <= endBin; i += batchSize) {
    const batch = Array.from(
      { length: Math.min(batchSize, endBin - i + 1) },
      (_, k) => i + k
    );

    const results = await Promise.all(
      batch.map((binId) => fetchBinReserves(poolId, binId))
    );

    for (let k = 0; k < batch.length; k++) {
      const { reserveX, reserveY } = results[k];
      const rx = reserveX / 10 ** dec0;
      const ry = reserveY / 10 ** dec1;
      const totalUsd = rx * p0 + ry * p1;

      bins.push({
        binId: batch[k],
        reserveX: rx,
        reserveY: ry,
        totalUsd,
        shareOfTotal: 0,
        cumulativeShare: 0,
      });
    }

    if (i + batchSize <= endBin) await sleep(200);
  }

  const totalLiq = bins.reduce((s, b) => s + b.totalUsd, 0);
  let cumulative = 0;
  for (const b of bins) {
    b.shareOfTotal = totalLiq > 0 ? b.totalUsd / totalLiq : 0;
    cumulative += b.shareOfTotal;
    b.cumulativeShare = cumulative;
  }

  return bins;
}

// ── Price Band Analysis ─────────────────────────────────────────────────────

function findPriceBand(bins: BinData[], threshold: number): PriceBand {
  const sorted = [...bins].sort((a, b) => b.totalUsd - a.totalUsd);
  const totalLiq = bins.reduce((s, b) => s + b.totalUsd, 0);
  if (totalLiq === 0) {
    return { lowerBin: 0, upperBin: 0, widthBins: 0, coveragePct: 0, totalUsd: 0 };
  }

  let accumulated = 0;
  const bandBins: number[] = [];

  for (const b of sorted) {
    accumulated += b.totalUsd;
    bandBins.push(b.binId);
    if (accumulated / totalLiq >= threshold) break;
  }

  bandBins.sort((a, b) => a - b);
  const lowerBin = bandBins[0];
  const upperBin = bandBins[bandBins.length - 1];

  return {
    lowerBin,
    upperBin,
    widthBins: upperBin - lowerBin + 1,
    coveragePct: accumulated / totalLiq,
    totalUsd: accumulated,
  };
}

function findLiquidityWalls(
  bins: BinData[],
  activeBinId: number,
  minStrengthPct: number = 0.03
): { support: LiquidityWall[]; resistance: LiquidityWall[] } {
  const totalLiq = bins.reduce((s, b) => s + b.totalUsd, 0);
  if (totalLiq === 0) return { support: [], resistance: [] };

  const support: LiquidityWall[] = [];
  const resistance: LiquidityWall[] = [];

  for (const bin of bins) {
    const pct = bin.totalUsd / totalLiq;
    if (pct < minStrengthPct || bin.binId === activeBinId) continue;

    const wall: LiquidityWall = {
      binId: bin.binId,
      side: bin.binId < activeBinId ? "support" : "resistance",
      strengthUsd: bin.totalUsd,
      strengthPct: pct,
      distanceFromActive: Math.abs(bin.binId - activeBinId),
    };

    if (wall.side === "support") support.push(wall);
    else resistance.push(wall);
  }

  support.sort((a, b) => b.strengthPct - a.strengthPct);
  resistance.sort((a, b) => b.strengthPct - a.strengthPct);

  return { support: support.slice(0, 5), resistance: resistance.slice(0, 5) };
}

function calculateMeanReversion(
  bins: BinData[],
  activeBinId: number
): MeanReversionSignal {
  const totalLiq = bins.reduce((s, b) => s + b.totalUsd, 0);
  if (totalLiq === 0) {
    return {
      centroidBin: activeBinId,
      activeBin: activeBinId,
      deviation: 0,
      deviationPct: 0,
      signal: "AT_CENTER",
      interpretation: "No liquidity data available.",
    };
  }

  const centroidBin = bins.reduce((s, b) => s + b.binId * b.totalUsd, 0) / totalLiq;

  const variance =
    bins.reduce((s, b) => s + b.totalUsd * Math.pow(b.binId - centroidBin, 2), 0) / totalLiq;
  const stdDev = Math.sqrt(variance);

  const deviation = activeBinId - centroidBin;
  const deviationPct = stdDev > 0 ? deviation / stdDev : 0;

  let signal: MeanReversionSignal["signal"];
  let interpretation: string;

  if (deviationPct < -1.5) {
    signal = "STRONGLY_BELOW";
    interpretation =
      `Active bin is ${Math.abs(deviation).toFixed(1)} bins (${Math.abs(deviationPct).toFixed(2)}σ) below ` +
      `liquidity centroid. Strong mean-reversion potential upward — price may bounce back toward concentrated liquidity.`;
  } else if (deviationPct < -0.5) {
    signal = "BELOW";
    interpretation =
      `Active bin is slightly below centroid (${Math.abs(deviationPct).toFixed(2)}σ). ` +
      `Mild upward reversion likely; current position favors token Y accumulation.`;
  } else if (deviationPct <= 0.5) {
    signal = "AT_CENTER";
    interpretation =
      `Active bin is near liquidity centroid (${Math.abs(deviationPct).toFixed(2)}σ deviation). ` +
      `Price is well-centered within the liquidity band — balanced LP exposure.`;
  } else if (deviationPct <= 1.5) {
    signal = "ABOVE";
    interpretation =
      `Active bin is slightly above centroid (${deviationPct.toFixed(2)}σ). ` +
      `Mild downward reversion likely; current position favors token X accumulation.`;
  } else {
    signal = "STRONGLY_ABOVE";
    interpretation =
      `Active bin is ${deviation.toFixed(1)} bins (${deviationPct.toFixed(2)}σ) above ` +
      `liquidity centroid. Strong mean-reversion potential downward — price may pull back toward concentrated liquidity.`;
  }

  return {
    centroidBin: Math.round(centroidBin),
    activeBin: activeBinId,
    deviation: Math.round(deviation),
    deviationPct,
    signal,
    interpretation,
  };
}

function classifyRegime(
  priceBand: PriceBand,
  meanReversion: MeanReversionSignal,
  bins: BinData[],
  activeBinId: number
): Regime {
  const withLiq = bins.filter((b) => b.totalUsd > 0);
  if (withLiq.length === 0) return "COMPRESSED";

  const liqSpread = withLiq[withLiq.length - 1].binId - withLiq[0].binId;
  const bandRatio = priceBand.widthBins / Math.max(liqSpread, 1);
  const absDeviation = Math.abs(meanReversion.deviationPct);

  if (priceBand.widthBins <= 5 && bandRatio < 0.2) return "COMPRESSED";
  if (absDeviation > 1.5) return "BREAKOUT";
  if (absDeviation > 0.8 && bandRatio > 0.5) return "TRENDING";
  return "RANGE-BOUND";
}

function calculateBandEfficiency(
  priceBand: PriceBand,
  totalScannedBins: number
): number {
  if (totalScannedBins === 0) return 0;
  return priceBand.coveragePct / (priceBand.widthBins / totalScannedBins);
}

function calculateOptimalRange(
  priceBand: PriceBand,
  meanReversion: MeanReversionSignal,
  regime: Regime,
  walls: { support: LiquidityWall[]; resistance: LiquidityWall[] }
): { lower: number; upper: number; reason: string } {
  const center = meanReversion.centroidBin;
  const halfWidth = Math.max(Math.floor(priceBand.widthBins / 2), 3);

  let lower = center - halfWidth;
  let upper = center + halfWidth;
  let reason = "";

  switch (regime) {
    case "COMPRESSED":
      lower = center - Math.max(halfWidth, 5);
      upper = center + Math.max(halfWidth, 5);
      reason = "Compressed range — widen beyond current band for breakout protection.";
      break;
    case "BREAKOUT":
      if (meanReversion.deviation > 0) {
        upper = meanReversion.activeBin + halfWidth;
        lower = center - Math.floor(halfWidth / 2);
      } else {
        lower = meanReversion.activeBin - halfWidth;
        upper = center + Math.floor(halfWidth / 2);
      }
      reason = `Breakout regime — skew range toward ${meanReversion.deviation > 0 ? "upside" : "downside"} momentum.`;
      break;
    case "TRENDING":
      if (meanReversion.deviation > 0) {
        upper += Math.floor(halfWidth * 0.3);
      } else {
        lower -= Math.floor(halfWidth * 0.3);
      }
      reason = `Trending ${meanReversion.deviation > 0 ? "up" : "down"} — extend range in trend direction.`;
      break;
    default:
      if (walls.support.length > 0) {
        lower = Math.min(lower, walls.support[0].binId);
      }
      if (walls.resistance.length > 0) {
        upper = Math.max(upper, walls.resistance[0].binId);
      }
      reason = "Range-bound — center on liquidity centroid with wall-to-wall coverage.";
      break;
  }

  return { lower, upper, reason };
}

// ── Verdict ─────────────────────────────────────────────────────────────────

function generateVerdict(analysis: PriceBandAnalysis): string {
  const lines: string[] = [];
  const { priceBand, meanReversion, regime, bandEfficiency } = analysis;

  lines.push(
    `${regime} regime detected. ${fmtPct(priceBand.coveragePct)} of liquidity (${fmtUsd(priceBand.totalUsd)}) ` +
    `sits within a ${priceBand.widthBins}-bin band (bins ${priceBand.lowerBin}–${priceBand.upperBin}).`
  );

  if (bandEfficiency > 5) {
    lines.push(`High band efficiency (${bandEfficiency.toFixed(1)}x) — liquidity is tightly concentrated relative to scan range.`);
  } else if (bandEfficiency < 2) {
    lines.push(`Low band efficiency (${bandEfficiency.toFixed(1)}x) — liquidity is dispersed across many bins.`);
  }

  lines.push(meanReversion.interpretation);

  const sWalls = analysis.supportWalls.length;
  const rWalls = analysis.resistanceWalls.length;
  if (sWalls > 0 || rWalls > 0) {
    lines.push(
      `Detected ${sWalls} support wall${sWalls !== 1 ? "s" : ""} and ` +
      `${rWalls} resistance wall${rWalls !== 1 ? "s" : ""}. ` +
      (sWalls > 0
        ? `Nearest support at bin ${analysis.supportWalls[0].binId} (${fmtPct(analysis.supportWalls[0].strengthPct)} of TVL). `
        : "") +
      (rWalls > 0
        ? `Nearest resistance at bin ${analysis.resistanceWalls[0].binId} (${fmtPct(analysis.resistanceWalls[0].strengthPct)} of TVL).`
        : "")
    );
  }

  lines.push(
    `Optimal LP range: bins ${analysis.optimalRange.lower}–${analysis.optimalRange.upper}. ` +
    analysis.optimalRange.reason
  );

  return lines.join(" ");
}

// ── Display ─────────────────────────────────────────────────────────────────

function displayAnalysis(analysis: PriceBandAnalysis, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(analysis, null, 2));
    return;
  }

  const { priceBand, meanReversion: mr } = analysis;

  console.log(`\n${"═".repeat(70)}`);
  console.log(`  HODLMM PRICE BAND ANALYZER`);
  console.log(`${"═".repeat(70)}`);

  console.log(`\n  Pool:           ${analysis.pool}`);
  console.log(`  Pair:           ${analysis.pair}`);
  console.log(`  TVL:            ${fmtUsd(analysis.tvlUsd)}`);
  console.log(`  Active Bin:     ${analysis.activeBinId}`);
  console.log(`  Bins Scanned:   ${analysis.binsScanned}`);
  console.log(`  Bins w/ Liq:    ${analysis.binsWithLiquidity}`);

  console.log(`\n${"─".repeat(70)}`);
  console.log(`  PRICE BAND (${fmtPct(LIQUIDITY_BAND_THRESHOLD)} coverage)`);
  console.log(`${"─".repeat(70)}`);

  console.log(`  Band Range:       ${priceBand.lowerBin} — ${priceBand.upperBin}`);
  console.log(`  Band Width:       ${priceBand.widthBins} bins`);
  console.log(`  Band TVL:         ${fmtUsd(priceBand.totalUsd)}`);
  console.log(`  Coverage:         ${fmtPct(priceBand.coveragePct)}`);
  console.log(`  Band Efficiency:  ${analysis.bandEfficiency.toFixed(1)}x`);
  console.log(`  Regime:           ${analysis.regime}`);

  console.log(`\n${"─".repeat(70)}`);
  console.log(`  MEAN REVERSION`);
  console.log(`${"─".repeat(70)}`);

  console.log(`  Liquidity Centroid: ${mr.centroidBin}`);
  console.log(`  Active Bin:         ${mr.activeBin}`);
  console.log(`  Deviation:          ${mr.deviation > 0 ? "+" : ""}${mr.deviation} bins (${mr.deviationPct > 0 ? "+" : ""}${mr.deviationPct.toFixed(2)}σ)`);
  console.log(`  Signal:             ${mr.signal}`);

  // Support walls
  console.log(`\n${"─".repeat(70)}`);
  console.log(`  LIQUIDITY WALLS`);
  console.log(`${"─".repeat(70)}`);

  if (analysis.supportWalls.length > 0) {
    console.log(`  SUPPORT:`);
    for (const w of analysis.supportWalls) {
      console.log(
        `    Bin ${String(w.binId).padStart(8)} │ ${fmtUsd(w.strengthUsd).padStart(10)} │ ` +
        `${fmtPct(w.strengthPct).padStart(6)} │ ${w.distanceFromActive} bins below`
      );
    }
  } else {
    console.log(`  SUPPORT: none detected`);
  }

  if (analysis.resistanceWalls.length > 0) {
    console.log(`  RESISTANCE:`);
    for (const w of analysis.resistanceWalls) {
      console.log(
        `    Bin ${String(w.binId).padStart(8)} │ ${fmtUsd(w.strengthUsd).padStart(10)} │ ` +
        `${fmtPct(w.strengthPct).padStart(6)} │ ${w.distanceFromActive} bins above`
      );
    }
  } else {
    console.log(`  RESISTANCE: none detected`);
  }

  // Optimal range
  console.log(`\n${"─".repeat(70)}`);
  console.log(`  OPTIMAL LP RANGE`);
  console.log(`${"─".repeat(70)}`);

  console.log(`  Recommended:  ${analysis.optimalRange.lower} — ${analysis.optimalRange.upper} (${analysis.optimalRange.upper - analysis.optimalRange.lower + 1} bins)`);
  console.log(`  Rationale:    ${analysis.optimalRange.reason}`);

  // ASCII band visualization
  console.log(`\n${"─".repeat(70)}`);
  console.log(`  BIN LIQUIDITY MAP`);
  console.log(`${"─".repeat(70)}`);

  const withLiq = analysis.binDistribution.filter((b) => b.totalUsd > 0.01);
  if (withLiq.length > 0) {
    const maxUsd = Math.max(...withLiq.map((b) => b.totalUsd));
    const displayBins = withLiq.slice(0, 50);

    for (const bin of displayBins) {
      const isActive = bin.binId === analysis.activeBinId;
      const inBand = bin.binId >= priceBand.lowerBin && bin.binId <= priceBand.upperBin;
      const isSupport = analysis.supportWalls.some((w) => w.binId === bin.binId);
      const isResistance = analysis.resistanceWalls.some((w) => w.binId === bin.binId);

      let marker = " ";
      if (isActive) marker = "→";
      else if (isSupport) marker = "S";
      else if (isResistance) marker = "R";

      const bandMarker = inBand ? "▓" : "░";
      const liqBar = barChart(bin.totalUsd, maxUsd, 20);
      console.log(
        `  ${marker} ${bandMarker} Bin ${String(bin.binId).padStart(8)} │ ${liqBar} │ ${fmtPct(bin.shareOfTotal).padStart(6)} │ ${fmtUsd(bin.totalUsd).padStart(10)}`
      );
    }

    if (withLiq.length > 50) {
      console.log(`  ... and ${withLiq.length - 50} more bins with liquidity`);
    }
    console.log(`\n  Legend: → active  S support  R resistance  ▓ in-band  ░ out-of-band`);
  } else {
    console.log("  No bins with liquidity found in scan range.");
  }

  console.log(`\n${"─".repeat(70)}`);
  console.log(`  VERDICT`);
  console.log(`${"─".repeat(70)}`);
  console.log(`  ${analysis.verdict}`);
  console.log(`\n${"═".repeat(70)}\n`);
}

// ── Pool Rankings ───────────────────────────────────────────────────────────

async function displayPoolRankings(pools: AppPool[], json: boolean): Promise<void> {
  console.log("\nScanning price band rankings...\n");

  const results: {
    pair: string;
    tvlUsd: number;
    bandWidth: number;
    regime: string;
    meanRevSignal: string;
    bandEfficiency: number;
  }[] = [];

  for (const pool of pools.slice(0, 15)) {
    try {
      const activeBinId = pool.activeBinId ?? (await fetchActiveBinId(pool.poolId ?? 1));
      const bins = await scanBins(pool, activeBinId, 25);
      const priceBand = findPriceBand(bins, LIQUIDITY_BAND_THRESHOLD);
      const meanReversion = calculateMeanReversion(bins, activeBinId);
      const regime = classifyRegime(priceBand, meanReversion, bins, activeBinId);
      const bandEfficiency = calculateBandEfficiency(priceBand, bins.length);

      results.push({
        pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
        tvlUsd: pool.tvlUsd,
        bandWidth: priceBand.widthBins,
        regime,
        meanRevSignal: meanReversion.signal,
        bandEfficiency,
      });
    } catch {
      // skip failed pools
    }

    await sleep(500);
  }

  if (json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  results.sort((a, b) => b.bandEfficiency - a.bandEfficiency);

  console.log(`${"═".repeat(78)}`);
  console.log(`  HODLMM PRICE BAND RANKINGS`);
  console.log(`${"═".repeat(78)}`);
  console.log(
    `  ${"Pair".padEnd(18)} ${"TVL".padStart(10)} ${"Width".padStart(7)} ${"Eff.".padStart(6)} ${"Regime".padStart(12)} ${"Mean Rev".padStart(16)}`
  );
  console.log(`  ${"─".repeat(72)}`);

  for (const r of results) {
    console.log(
      `  ${r.pair.padEnd(18)} ${fmtUsd(r.tvlUsd).padStart(10)} ${String(r.bandWidth).padStart(5)}b ` +
      `${r.bandEfficiency.toFixed(1).padStart(5)}x ${r.regime.padStart(12)} ${r.meanRevSignal.padStart(16)}`
    );
  }

  console.log(`\n  ${results.length} pools ranked by band efficiency (higher = more concentrated)`);
  console.log(`${"═".repeat(78)}\n`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

const program = new Command();
program
  .name("hodlmm-price-band")
  .description(
    "Price band analysis for HODLMM pools. Identifies trading ranges, " +
    "support/resistance levels from liquidity walls, mean-reversion signals, " +
    "and regime classification to help LPs optimize position placement."
  )
  .argument("[pool]", "Pool ID or token pair (e.g. STX-sBTC). Omit to rank all pools.")
  .option("--radius <n>", "Number of bins to scan on each side of active bin", "40")
  .option("--threshold <n>", "Liquidity coverage threshold for band (0-1)", "0.80")
  .option("--json", "Output in JSON format", false)
  .action(async (poolQuery?: string) => {
    const opts = program.opts();
    const radius = parseInt(opts.radius) || BIN_SCAN_RADIUS;
    const threshold = parseFloat(opts.threshold) || LIQUIDITY_BAND_THRESHOLD;
    const jsonOutput = opts.json;

    try {
      const pools = await fetchPools();
      if (pools.length === 0) {
        console.error("No HODLMM pools found with sufficient TVL.");
        process.exit(1);
      }

      if (!poolQuery) {
        await displayPoolRankings(pools, jsonOutput);
        return;
      }

      const pool = findPool(poolQuery, pools);
      if (!pool) {
        console.error(`Pool "${poolQuery}" not found. Available pools:`);
        for (const p of pools.slice(0, 10)) {
          console.error(`  ${p.token0Symbol}-${p.token1Symbol} (${fmtUsd(p.tvlUsd)})`);
        }
        process.exit(1);
      }

      const pair = `${pool.token0Symbol}-${pool.token1Symbol}`;
      console.log(`\nAnalyzing price bands for ${pair}...`);

      const activeBinId = pool.activeBinId ?? (await fetchActiveBinId(pool.poolId ?? 1));
      const bins = await scanBins(pool, activeBinId, radius);
      const priceBand = findPriceBand(bins, threshold);
      const walls = findLiquidityWalls(bins, activeBinId);
      const meanReversion = calculateMeanReversion(bins, activeBinId);
      const regime = classifyRegime(priceBand, meanReversion, bins, activeBinId);
      const bandEfficiency = calculateBandEfficiency(priceBand, bins.length);
      const optimalRange = calculateOptimalRange(priceBand, meanReversion, regime, walls);

      const analysis: PriceBandAnalysis = {
        pool: pool.id,
        pair,
        tvlUsd: pool.tvlUsd,
        activeBinId,
        binsScanned: bins.length,
        binsWithLiquidity: bins.filter((b) => b.totalUsd > 0.01).length,
        priceBand,
        supportWalls: walls.support,
        resistanceWalls: walls.resistance,
        meanReversion,
        regime,
        bandEfficiency,
        optimalRange,
        binDistribution: bins,
        verdict: "",
      };

      analysis.verdict = generateVerdict(analysis);
      displayAnalysis(analysis, jsonOutput);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
