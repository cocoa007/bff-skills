#!/usr/bin/env bun
/**
 * hodlmm-bin-symmetry.ts
 *
 * HODLMM Bin Symmetry Analyzer — Measures how symmetrically liquidity is
 * distributed around the active bin. Asymmetric distributions reveal
 * directional LP conviction, one-sided support/resistance, and potential
 * vulnerability to price movements in the thinner direction.
 *
 * Metrics:
 *  1. Symmetry score (0-100): composite of reserve ratio, depth match,
 *     shape correlation, and centroid offset
 *  2. Reserve ratio: bid-side vs ask-side USD totals
 *  3. Depth parity: how far meaningful liquidity extends on each side
 *  4. Shape correlation: Pearson r between mirrored bid/ask TVL profiles
 *  5. Centroid offset: TVL-weighted center of mass vs active bin
 *  6. Classification: SYMMETRIC / SLIGHT_SKEW / MODERATE_SKEW / HEAVY_SKEW / ONE_SIDED
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 85).
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 25;

type SymmetryClass = "SYMMETRIC" | "SLIGHT_SKEW" | "MODERATE_SKEW" | "HEAVY_SKEW" | "ONE_SIDED";

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
  reserveXUsd: number;
  reserveYUsd: number;
  totalUsd: number;
}

interface SideProfile {
  totalUsd: number;
  binsPopulated: number;
  maxDepth: number;
  tvlProfile: number[];
  peakBinOffset: number;
  peakTvl: number;
  cumulativePct: number[];
}

interface SymmetryAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  activeBinTvl: number;
  activeBinPct: number;
  bidSide: SideProfile;
  askSide: SideProfile;
  reserveRatio: number;
  depthParity: number;
  shapeCorrelation: number;
  centroidOffset: number;
  symmetryScore: number;
  symmetryClass: SymmetryClass;
  skewDirection: "BID" | "ASK" | "NEUTRAL";
  skewMagnitude: number;
  mirrorGaps: MirrorGap[];
  recommendation: string;
  asciiMirror: string;
}

interface MirrorGap {
  offset: number;
  bidTvl: number;
  askTvl: number;
  ratio: number;
  gapSeverity: "CRITICAL" | "MODERATE" | "MINOR" | "BALANCED";
}

// -- Helpers ------------------------------------------------------------------

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
  if (!resp.ok) throw new Error(`HTTP ${resp.status} calling ${fn}`);
  return resp.json();
}

function cvUint(n: number): string {
  const hex = n.toString(16).padStart(32, "0");
  return `0x01${hex}`;
}

function parseUintResult(hex: string): number {
  if (hex.startsWith("0x")) hex = hex.slice(2);
  if (hex.startsWith("00")) hex = hex.slice(2);
  const tag = hex.slice(0, 2);
  if (tag === "01") return parseInt(hex.slice(2), 16);
  return 0;
}

function parseTupleReserves(hex: string): { reserveX: number; reserveY: number } {
  const fallback = { reserveX: 0, reserveY: 0 };
  if (!hex || hex.length < 10) return fallback;
  if (hex.startsWith("0x")) hex = hex.slice(2);
  try {
    let pos = 0;
    if (hex.slice(pos, pos + 2) === "00") pos += 2;
    const tag = hex.slice(pos, pos + 2);
    pos += 2;
    if (tag !== "0c") return fallback;
    const numKeys = parseInt(hex.slice(pos, pos + 8), 16);
    pos += 8;
    const values: Record<string, number> = {};
    for (let i = 0; i < numKeys; i++) {
      const nameLen = parseInt(hex.slice(pos, pos + 2), 16);
      pos += 2;
      const nameBytes = hex.slice(pos, pos + nameLen * 2);
      pos += nameLen * 2;
      const name = Buffer.from(nameBytes, "hex").toString("ascii");
      const valTag = hex.slice(pos, pos + 2);
      pos += 2;
      if (valTag === "01") {
        const raw = hex.slice(pos, pos + 32);
        pos += 32;
        values[name] = parseInt(raw, 16);
      } else {
        break;
      }
    }
    return {
      reserveX: values["reserve-x"] ?? values["reserveX"] ?? 0,
      reserveY: values["reserve-y"] ?? values["reserveY"] ?? 0,
    };
  } catch {
    return fallback;
  }
}

function fmtUsd(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 1) return v.toFixed(2);
  if (v >= 0.001) return v.toFixed(4);
  return v.toFixed(6);
}

function fmtPct(v: number): string {
  return v.toFixed(1) + "%";
}

// -- Pool discovery -----------------------------------------------------------

async function discoverPools(): Promise<AppPool[]> {
  const data = await fetchJson(`${BFF_APP_BASE}/pools`);
  const pools: any[] = data.results ?? data.pools ?? data ?? [];
  return pools
    .filter((p: any) => {
      const tvl = Number(p.tvlUsd ?? p.tvl ?? 0);
      return tvl >= MIN_TVL_USD && p.poolId != null;
    })
    .map((p: any) => ({
      id: p.id ?? `${p.token0Symbol}-${p.token1Symbol}`,
      token0Symbol: p.token0Symbol ?? "?",
      token1Symbol: p.token1Symbol ?? "?",
      tvlUsd: Number(p.tvlUsd ?? p.tvl ?? 0),
      volume24hUsd: Number(p.volume24hUsd ?? p.volume24h ?? 0),
      poolId: Number(p.poolId),
      token0Decimals: Number(p.token0Decimals ?? 8),
      token1Decimals: Number(p.token1Decimals ?? 6),
      token0PriceUsd: Number(p.token0PriceUsd ?? 0),
      token1PriceUsd: Number(p.token1PriceUsd ?? 0),
      activeBinId: p.activeBinId != null ? Number(p.activeBinId) : undefined,
      feeBps: p.feeBps != null ? Number(p.feeBps) : undefined,
    }));
}

// -- On-chain reads -----------------------------------------------------------

async function getActiveBin(poolId: number): Promise<number> {
  const res = await callReadOnly("get-active-bin-id", [cvUint(poolId)]);
  return parseUintResult(res.result ?? "");
}

async function getBinReserves(
  poolId: number,
  binId: number,
  p: AppPool
): Promise<BinReserves> {
  const res = await callReadOnly("get-bin-reserves", [
    cvUint(poolId),
    cvUint(binId),
  ]);
  const hex = res.result ?? "";
  const { reserveX, reserveY } = parseTupleReserves(hex);

  const rx = reserveX / 10 ** p.token0Decimals;
  const ry = reserveY / 10 ** p.token1Decimals;
  const rxUsd = rx * p.token0PriceUsd;
  const ryUsd = ry * p.token1PriceUsd;

  return {
    binId,
    reserveX: rx,
    reserveY: ry,
    reserveXUsd: rxUsd,
    reserveYUsd: ryUsd,
    totalUsd: rxUsd + ryUsd,
  };
}

async function scanBins(
  poolId: number,
  activeBin: number,
  pool: AppPool,
  radius: number
): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const start = activeBin - radius;
  const end = activeBin + radius;

  const batch = 5;
  for (let i = start; i <= end; i += batch) {
    const chunk = [];
    for (let j = i; j < Math.min(i + batch, end + 1); j++) {
      chunk.push(getBinReserves(poolId, j, pool));
    }
    const results = await Promise.all(chunk);
    bins.push(...results);
  }
  return bins.sort((a, b) => a.binId - b.binId);
}

// -- Symmetry analysis --------------------------------------------------------

function buildSideProfile(bins: BinReserves[]): SideProfile {
  const populated = bins.filter((b) => b.totalUsd > 0.01);
  const totalUsd = populated.reduce((s, b) => s + b.totalUsd, 0);
  const tvlProfile = bins.map((b) => b.totalUsd);

  let maxDepth = 0;
  for (let i = bins.length - 1; i >= 0; i--) {
    if (bins[i].totalUsd > 0.01) {
      maxDepth = i + 1;
      break;
    }
  }

  let peakBinOffset = 0;
  let peakTvl = 0;
  for (let i = 0; i < bins.length; i++) {
    if (bins[i].totalUsd > peakTvl) {
      peakTvl = bins[i].totalUsd;
      peakBinOffset = i + 1;
    }
  }

  const cumulativePct: number[] = [];
  let cumSum = 0;
  for (const b of bins) {
    cumSum += b.totalUsd;
    cumulativePct.push(totalUsd > 0 ? (cumSum / totalUsd) * 100 : 0);
  }

  return {
    totalUsd,
    binsPopulated: populated.length,
    maxDepth,
    tvlProfile,
    peakBinOffset,
    peakTvl,
    cumulativePct,
  };
}

function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;

  let sumA = 0, sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i];
    sumB += b[i];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;

  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i++) {
    const dA = a[i] - meanA;
    const dB = b[i] - meanB;
    num += dA * dB;
    denA += dA * dA;
    denB += dB * dB;
  }

  const den = Math.sqrt(denA * denB);
  return den > 0 ? num / den : 0;
}

function classifyGap(ratio: number): "CRITICAL" | "MODERATE" | "MINOR" | "BALANCED" {
  if (ratio >= 10 || ratio <= 0.1) return "CRITICAL";
  if (ratio >= 4 || ratio <= 0.25) return "MODERATE";
  if (ratio >= 2 || ratio <= 0.5) return "MINOR";
  return "BALANCED";
}

function classifySymmetry(score: number): SymmetryClass {
  if (score >= 80) return "SYMMETRIC";
  if (score >= 60) return "SLIGHT_SKEW";
  if (score >= 40) return "MODERATE_SKEW";
  if (score >= 20) return "HEAVY_SKEW";
  return "ONE_SIDED";
}

function analyzeSymmetry(
  pool: AppPool,
  activeBinId: number,
  rawBins: BinReserves[]
): SymmetryAnalysis {
  const populated = rawBins.filter((b) => b.totalUsd > 0.01);
  const scannedTvl = populated.reduce((s, b) => s + b.totalUsd, 0);
  const feeBps = pool.feeBps ?? 30;

  const activeBinData = rawBins.find((b) => b.binId === activeBinId);
  const activeBinTvl = activeBinData?.totalUsd ?? 0;
  const activeBinPct = scannedTvl > 0 ? (activeBinTvl / scannedTvl) * 100 : 0;

  const bidBins = rawBins
    .filter((b) => b.binId < activeBinId)
    .sort((a, b) => b.binId - a.binId);
  const askBins = rawBins
    .filter((b) => b.binId > activeBinId)
    .sort((a, b) => a.binId - b.binId);

  const bidSide = buildSideProfile(bidBins);
  const askSide = buildSideProfile(askBins);

  const totalSideUsd = bidSide.totalUsd + askSide.totalUsd;
  const reserveRatio =
    totalSideUsd > 0
      ? Math.min(bidSide.totalUsd, askSide.totalUsd) /
        Math.max(bidSide.totalUsd, askSide.totalUsd, 0.01)
      : 0;

  const maxSideDepth = Math.max(bidSide.maxDepth, askSide.maxDepth, 1);
  const depthParity =
    Math.min(bidSide.maxDepth, askSide.maxDepth) /
    Math.max(bidSide.maxDepth, askSide.maxDepth, 1);

  const mirrorLen = Math.min(bidSide.tvlProfile.length, askSide.tvlProfile.length);
  const bidMirror = bidSide.tvlProfile.slice(0, mirrorLen);
  const askMirror = askSide.tvlProfile.slice(0, mirrorLen);
  const shapeCorrelation = pearsonCorrelation(bidMirror, askMirror);

  let centroidNum = 0;
  let centroidDen = 0;
  for (const b of rawBins) {
    if (b.totalUsd > 0.01) {
      centroidNum += (b.binId - activeBinId) * b.totalUsd;
      centroidDen += b.totalUsd;
    }
  }
  const centroidOffset = centroidDen > 0 ? centroidNum / centroidDen : 0;

  const ratioScore = reserveRatio * 30;
  const depthScore = depthParity * 20;
  const shapeScore = Math.max(0, (shapeCorrelation + 1) / 2) * 30;
  const centroidScore = Math.max(0, 1 - Math.abs(centroidOffset) / maxSideDepth) * 20;
  const symmetryScore = Math.min(
    Math.round(ratioScore + depthScore + shapeScore + centroidScore),
    100
  );

  const symmetryClass = classifySymmetry(symmetryScore);

  let skewDirection: "BID" | "ASK" | "NEUTRAL";
  if (bidSide.totalUsd > askSide.totalUsd * 1.2) skewDirection = "BID";
  else if (askSide.totalUsd > bidSide.totalUsd * 1.2) skewDirection = "ASK";
  else skewDirection = "NEUTRAL";

  const skewMagnitude =
    totalSideUsd > 0
      ? Math.abs(bidSide.totalUsd - askSide.totalUsd) / totalSideUsd
      : 0;

  const mirrorGaps: MirrorGap[] = [];
  for (let i = 0; i < mirrorLen; i++) {
    const bTvl = bidMirror[i];
    const aTvl = askMirror[i];
    const maxVal = Math.max(bTvl, aTvl, 0.01);
    const ratio = maxVal > 0.01 ? Math.max(bTvl, 0.001) / Math.max(aTvl, 0.001) : 1;
    if (bTvl > 0.01 || aTvl > 0.01) {
      mirrorGaps.push({
        offset: i + 1,
        bidTvl: bTvl,
        askTvl: aTvl,
        ratio,
        gapSeverity: classifyGap(ratio),
      });
    }
  }

  const asciiMirror = buildAsciiMirror(
    bidBins,
    askBins,
    activeBinId,
    activeBinTvl,
    scannedTvl
  );

  const recommendation = buildRecommendation(
    symmetryScore,
    symmetryClass,
    skewDirection,
    skewMagnitude,
    reserveRatio,
    depthParity,
    shapeCorrelation,
    centroidOffset,
    bidSide,
    askSide,
    mirrorGaps,
    pool
  );

  return {
    poolId: pool.poolId!,
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    feeBps,
    activeBinId,
    binsScanned: rawBins.length,
    binsPopulated: populated.length,
    scannedTvlUsd: scannedTvl,
    activeBinTvl,
    activeBinPct: Math.round(activeBinPct * 10) / 10,
    bidSide,
    askSide,
    reserveRatio: Math.round(reserveRatio * 1000) / 1000,
    depthParity: Math.round(depthParity * 1000) / 1000,
    shapeCorrelation: Math.round(shapeCorrelation * 1000) / 1000,
    centroidOffset: Math.round(centroidOffset * 100) / 100,
    symmetryScore,
    symmetryClass,
    skewDirection,
    skewMagnitude: Math.round(skewMagnitude * 1000) / 1000,
    mirrorGaps: mirrorGaps.filter((g) => g.gapSeverity !== "BALANCED").slice(0, 10),
    recommendation,
    asciiMirror,
  };
}

function buildAsciiMirror(
  bidBins: BinReserves[],
  askBins: BinReserves[],
  activeBinId: number,
  activeBinTvl: number,
  scannedTvl: number
): string {
  const maxLen = Math.max(bidBins.length, askBins.length);
  const allTvl = [
    activeBinTvl,
    ...bidBins.map((b) => b.totalUsd),
    ...askBins.map((b) => b.totalUsd),
  ];
  const maxTvl = Math.max(...allTvl, 0.01);
  const barWidth = 20;
  const lines: string[] = [];

  lines.push("  Offset | Bid $TVL     | <── Bid ║ Ask ──> | Ask $TVL");
  lines.push("  -------+--------------+" + "-".repeat(barWidth) + "║" + "-".repeat(barWidth) + "+--------------");

  lines.push(
    `  ACTIVE |              |${" ".repeat(barWidth)}║` +
    `${"█".repeat(Math.round((activeBinTvl / maxTvl) * barWidth)).padEnd(barWidth)}| $${fmtUsd(activeBinTvl).padStart(11)}`
  );

  for (let i = 0; i < maxLen; i++) {
    const bidTvl = i < bidBins.length ? bidBins[i].totalUsd : 0;
    const askTvl = i < askBins.length ? askBins[i].totalUsd : 0;

    const bidBar = "█".repeat(Math.round((bidTvl / maxTvl) * barWidth));
    const askBar = "█".repeat(Math.round((askTvl / maxTvl) * barWidth));

    const bidStr = bidTvl > 0.01 ? `$${fmtUsd(bidTvl)}` : "-";
    const askStr = askTvl > 0.01 ? `$${fmtUsd(askTvl)}` : "-";

    lines.push(
      `  ${String(i + 1).padStart(6)} | ${bidStr.padStart(12)} |${bidBar.padStart(barWidth)}║${askBar.padEnd(barWidth)}| ${askStr.padStart(12)}`
    );
  }

  return lines.join("\n");
}

function buildRecommendation(
  score: number,
  cls: SymmetryClass,
  direction: "BID" | "ASK" | "NEUTRAL",
  magnitude: number,
  reserveRatio: number,
  depthParity: number,
  shapeCorr: number,
  centroidOffset: number,
  bidSide: SideProfile,
  askSide: SideProfile,
  gaps: MirrorGap[],
  pool: AppPool
): string {
  const parts: string[] = [];

  const classLabels: Record<SymmetryClass, string> = {
    SYMMETRIC: "WELL-BALANCED",
    SLIGHT_SKEW: "SLIGHTLY SKEWED",
    MODERATE_SKEW: "MODERATELY SKEWED",
    HEAVY_SKEW: "HEAVILY SKEWED",
    ONE_SIDED: "ONE-SIDED",
  };

  parts.push(
    `${classLabels[cls]} DISTRIBUTION (score ${score}/100) — ` +
    `Liquidity around the active bin is ${cls === "SYMMETRIC" ? "evenly distributed" : `tilted toward the ${direction === "BID" ? "bid (buy support)" : direction === "ASK" ? "ask (sell resistance)" : "center"} side`}. ` +
    `Reserve ratio: ${(reserveRatio * 100).toFixed(0)}%, depth parity: ${(depthParity * 100).toFixed(0)}%, shape correlation: ${shapeCorr.toFixed(2)}.`
  );

  if (cls === "SYMMETRIC") {
    parts.push(
      "BALANCED PROFILE — Both sides of the active bin have similar liquidity depth, " +
      "distribution shape, and total reserves. This pool offers roughly equal slippage " +
      "protection for buys and sells, indicating balanced LP conviction."
    );
  }

  if (direction !== "NEUTRAL") {
    const strongSide = direction === "BID" ? "bid" : "ask";
    const weakSide = direction === "BID" ? "ask" : "bid";
    const strongUsd = direction === "BID" ? bidSide.totalUsd : askSide.totalUsd;
    const weakUsd = direction === "BID" ? askSide.totalUsd : bidSide.totalUsd;
    parts.push(
      `DIRECTIONAL BIAS: ${strongSide.toUpperCase()} side has $${fmtUsd(strongUsd)} vs ` +
      `$${fmtUsd(weakUsd)} on ${weakSide} (${(magnitude * 100).toFixed(0)}% skew). ` +
      `Large trades in the ${weakSide} direction will encounter more slippage. ` +
      `LPs are expressing stronger price conviction on the ${strongSide} side.`
    );
  }

  if (depthParity < 0.5) {
    const deepSide = bidSide.maxDepth > askSide.maxDepth ? "bid" : "ask";
    const shallowSide = deepSide === "bid" ? "ask" : "bid";
    parts.push(
      `DEPTH MISMATCH: ${deepSide} side extends ${Math.max(bidSide.maxDepth, askSide.maxDepth)} bins ` +
      `vs ${Math.min(bidSide.maxDepth, askSide.maxDepth)} on ${shallowSide}. ` +
      `The ${shallowSide} side has a liquidity cliff — sudden price moves in that direction ` +
      `will quickly exhaust available reserves.`
    );
  }

  if (shapeCorr < 0.3) {
    parts.push(
      `LOW SHAPE CORRELATION (r=${shapeCorr.toFixed(2)}) — The bid and ask liquidity ` +
      `profiles have dissimilar shapes. Even if total reserves are balanced, the ` +
      `distribution pattern differs — one side may have concentrated peaks while ` +
      `the other is spread thin.`
    );
  }

  const criticalGaps = gaps.filter((g) => g.gapSeverity === "CRITICAL");
  if (criticalGaps.length > 0) {
    const worst = criticalGaps[0];
    parts.push(
      `CRITICAL MIRROR GAP at offset ${worst.offset}: ` +
      `bid=$${fmtUsd(worst.bidTvl)} vs ask=$${fmtUsd(worst.askTvl)} ` +
      `(${worst.ratio.toFixed(1)}x ratio). ${criticalGaps.length} critical gap${criticalGaps.length > 1 ? "s" : ""} ` +
      `where mirrored bins have vastly different liquidity — these are vulnerability points.`
    );
  }

  if (Math.abs(centroidOffset) > 5) {
    const centroidSide = centroidOffset < 0 ? "bid (below active)" : "ask (above active)";
    parts.push(
      `TVL CENTROID: ${centroidOffset.toFixed(1)} bins from active, shifted toward ${centroidSide}. ` +
      `The center of mass of liquidity is displaced, meaning the pool's effective support ` +
      `level is not centered on the current price.`
    );
  }

  return parts.join("\n\n");
}

// -- Output -------------------------------------------------------------------

function printAnalysis(a: SymmetryAnalysis, format: string): void {
  if (format === "json") {
    console.log(JSON.stringify(a, null, 2));
    return;
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(`  HODLMM BIN SYMMETRY — ${a.pair} (Pool #${a.poolId})`);
  console.log(`${"=".repeat(72)}`);
  console.log(`  TVL: $${fmtUsd(a.tvlUsd)}  |  Vol 24h: $${fmtUsd(a.volume24hUsd)}  |  Fee: ${a.feeBps} bps`);
  console.log(`  Active Bin: ${a.activeBinId}  |  Scanned: ${a.binsScanned} bins  |  Populated: ${a.binsPopulated}`);
  console.log(`  Scanned TVL: $${fmtUsd(a.scannedTvlUsd)}  |  Active Bin TVL: $${fmtUsd(a.activeBinTvl)} (${fmtPct(a.activeBinPct)})`);

  console.log(`\n── Symmetry Score ${"─".repeat(54)}`);
  console.log(`  Score:              ${a.symmetryScore}/100`);
  console.log(`  Classification:     ${a.symmetryClass}`);
  console.log(`  Skew Direction:     ${a.skewDirection}`);
  console.log(`  Skew Magnitude:     ${fmtPct(a.skewMagnitude * 100)}`);

  console.log(`\n── Components ${"─".repeat(58)}`);
  console.log(`  Reserve Ratio:      ${fmtPct(a.reserveRatio * 100)} (min/max side TVL)`);
  console.log(`  Depth Parity:       ${fmtPct(a.depthParity * 100)} (min/max populated depth)`);
  console.log(`  Shape Correlation:  ${a.shapeCorrelation.toFixed(3)} (Pearson r of mirrored profiles)`);
  console.log(`  Centroid Offset:    ${a.centroidOffset.toFixed(2)} bins (TVL-weighted center of mass)`);

  console.log(`\n── Side Comparison ${"─".repeat(53)}`);
  console.log(`  Metric            | Bid Side       | Ask Side`);
  console.log(`  ------------------+----------------+----------------`);
  console.log(`  Total TVL         | $${fmtUsd(a.bidSide.totalUsd).padStart(13)} | $${fmtUsd(a.askSide.totalUsd).padStart(13)}`);
  console.log(`  Bins Populated    | ${String(a.bidSide.binsPopulated).padStart(14)} | ${String(a.askSide.binsPopulated).padStart(14)}`);
  console.log(`  Max Depth         | ${String(a.bidSide.maxDepth).padStart(14)} | ${String(a.askSide.maxDepth).padStart(14)}`);
  console.log(`  Peak TVL          | $${fmtUsd(a.bidSide.peakTvl).padStart(13)} | $${fmtUsd(a.askSide.peakTvl).padStart(13)}`);
  console.log(`  Peak Offset       | ${String(a.bidSide.peakBinOffset).padStart(14)} | ${String(a.askSide.peakBinOffset).padStart(14)}`);

  if (a.mirrorGaps.length > 0) {
    console.log(`\n── Mirror Gaps (asymmetric bins) ${"─".repeat(40)}`);
    console.log(`  Offset | Bid $TVL     | Ask $TVL     | Ratio  | Severity`);
    console.log(`  -------+--------------+--------------+--------+----------`);
    for (const g of a.mirrorGaps) {
      console.log(
        `  ${String(g.offset).padStart(6)} | $${fmtUsd(g.bidTvl).padStart(11)} | $${fmtUsd(g.askTvl).padStart(11)} | ${g.ratio.toFixed(1).padStart(6)} | ${g.gapSeverity}`
      );
    }
  }

  console.log(`\n── Mirror Chart ${"─".repeat(56)}`);
  console.log(a.asciiMirror);

  console.log(`\n── Recommendation ${"─".repeat(54)}`);
  console.log(a.recommendation);
  console.log();
}

// -- Main ---------------------------------------------------------------------

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("hodlmm-bin-symmetry")
    .description("HODLMM Bin Symmetry Analyzer — measures bid/ask liquidity balance around the active bin")
    .option("-p, --pool <id>", "Pool ID to analyze")
    .option("-s, --search <pair>", "Search for pool by token pair (e.g. STX/sBTC)")
    .option("-r, --radius <n>", "Bin scan radius", String(BIN_SCAN_RADIUS))
    .option("-f, --format <fmt>", "Output format: text | json", "text")
    .parse(process.argv);

  const opts = program.opts();
  const radius = parseInt(opts.radius) || BIN_SCAN_RADIUS;
  const format = opts.format || "text";

  console.log("Discovering HODLMM pools...");
  const pools = await discoverPools();

  if (pools.length === 0) {
    console.error("No HODLMM pools found with sufficient TVL.");
    process.exit(1);
  }

  let targetPool: AppPool | undefined;

  if (opts.pool) {
    const poolId = parseInt(opts.pool);
    targetPool = pools.find((p) => p.poolId === poolId);
    if (!targetPool) {
      console.error(`Pool ${poolId} not found. Available: ${pools.map((p) => `${p.poolId} (${p.token0Symbol}/${p.token1Symbol})`).join(", ")}`);
      process.exit(1);
    }
  } else if (opts.search) {
    const q = opts.search.toLowerCase();
    targetPool = pools.find(
      (p) =>
        `${p.token0Symbol}/${p.token1Symbol}`.toLowerCase().includes(q) ||
        `${p.token1Symbol}/${p.token0Symbol}`.toLowerCase().includes(q) ||
        p.token0Symbol.toLowerCase() === q ||
        p.token1Symbol.toLowerCase() === q
    );
    if (!targetPool) {
      console.error(`No pool matching "${opts.search}". Available: ${pools.map((p) => `${p.token0Symbol}/${p.token1Symbol}`).join(", ")}`);
      process.exit(1);
    }
  } else {
    targetPool = pools.sort((a, b) => b.tvlUsd - a.tvlUsd)[0];
    console.log(`No pool specified — using highest-TVL: ${targetPool.token0Symbol}/${targetPool.token1Symbol}`);
  }

  console.log(`Analyzing symmetry for ${targetPool.token0Symbol}/${targetPool.token1Symbol} (Pool #${targetPool.poolId})...`);

  const activeBin = targetPool.activeBinId ?? (await getActiveBin(targetPool.poolId!));
  console.log(`  Active bin: ${activeBin}, scanning +/-${radius} bins...`);

  const rawBins = await scanBins(targetPool.poolId!, activeBin, targetPool, radius);
  const analysis = analyzeSymmetry(targetPool, activeBin, rawBins);

  printAnalysis(analysis, format);
}

main().catch((err) => {
  console.error("Fatal:", err.message ?? err);
  process.exit(1);
});
