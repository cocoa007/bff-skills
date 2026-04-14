#!/usr/bin/env bun
/**
 * hodlmm-bin-anchor.ts
 *
 * HODLMM Bin Anchor Analyzer — Identifies "anchor bins" that act as persistent
 * liquidity magnets, retaining disproportionate capital and stabilizing the pool.
 * Anchor bins are important because they absorb price shocks, reduce slippage,
 * and indicate strong LP conviction at specific price levels.
 *
 * Metrics:
 *  1. Anchor score: composite of size dominance, distance resilience, and
 *     concentration (0-100)
 *  2. Gravitational pull: how much a bin's TVL exceeds neighbors (ratio)
 *  3. Size dominance: bin TVL as multiple of pool median
 *  4. Isolation index: how far the anchor is from the next significant bin
 *  5. Anchor classification: MEGA / STRONG / MODERATE / WEAK / NONE
 *  6. Anchor map: spatial distribution of anchors relative to active bin
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 84).
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 25;

type AnchorClass = "MEGA" | "STRONG" | "MODERATE" | "WEAK" | "NONE";

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

interface BinAnchor {
  binId: number;
  distanceFromActive: number;
  totalUsd: number;
  sizeDominance: number;
  gravitationalPull: number;
  isolationIndex: number;
  neighborhoodShare: number;
  anchorScore: number;
  anchorClass: AnchorClass;
  supportsSide: "BID" | "ASK" | "BOTH";
  reserveSkew: number;
}

interface AnchorAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  totalAnchors: number;
  megaAnchors: number;
  strongAnchors: number;
  anchorTvlPct: number;
  anchorConcentration: number;
  bidAnchorTvl: number;
  askAnchorTvl: number;
  anchorAsymmetry: number;
  avgAnchorDistance: number;
  anchorSpread: number;
  anchors: BinAnchor[];
  topAnchors: BinAnchor[];
  bidAnchors: BinAnchor[];
  askAnchors: BinAnchor[];
  recommendation: string;
  asciiMap: string;
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

// -- Anchor analysis ----------------------------------------------------------

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function computeGravitationalPull(
  binIdx: number,
  populated: BinReserves[]
): number {
  const bin = populated[binIdx];
  if (!bin || bin.totalUsd <= 0) return 0;

  let neighborSum = 0;
  let neighborCount = 0;
  for (let offset = -3; offset <= 3; offset++) {
    if (offset === 0) continue;
    const nIdx = binIdx + offset;
    if (nIdx >= 0 && nIdx < populated.length) {
      neighborSum += populated[nIdx].totalUsd;
      neighborCount++;
    }
  }
  if (neighborCount === 0 || neighborSum === 0) return bin.totalUsd > 0 ? 10 : 0;
  const neighborAvg = neighborSum / neighborCount;
  return bin.totalUsd / neighborAvg;
}

function computeIsolationIndex(
  binIdx: number,
  populated: BinReserves[],
  medianTvl: number
): number {
  const bin = populated[binIdx];
  if (!bin) return 0;

  const threshold = medianTvl * 2;
  let minDist = Infinity;

  for (let i = 0; i < populated.length; i++) {
    if (i === binIdx) continue;
    if (populated[i].totalUsd >= threshold) {
      const dist = Math.abs(populated[i].binId - bin.binId);
      if (dist < minDist) minDist = dist;
    }
  }
  return minDist === Infinity ? populated.length : minDist;
}

function computeNeighborhoodShare(
  binIdx: number,
  populated: BinReserves[],
  windowSize: number
): number {
  const bin = populated[binIdx];
  if (!bin || bin.totalUsd <= 0) return 0;

  let windowTotal = 0;
  for (let offset = -windowSize; offset <= windowSize; offset++) {
    const nIdx = binIdx + offset;
    if (nIdx >= 0 && nIdx < populated.length) {
      windowTotal += populated[nIdx].totalUsd;
    }
  }
  return windowTotal > 0 ? bin.totalUsd / windowTotal : 0;
}

function classifyAnchor(score: number): AnchorClass {
  if (score >= 80) return "MEGA";
  if (score >= 60) return "STRONG";
  if (score >= 40) return "MODERATE";
  if (score >= 20) return "WEAK";
  return "NONE";
}

function analyzeAnchors(
  pool: AppPool,
  activeBinId: number,
  rawBins: BinReserves[]
): AnchorAnalysis {
  const populated = rawBins.filter((b) => b.totalUsd > 0.01);
  const scannedTvl = populated.reduce((s, b) => s + b.totalUsd, 0);
  const medianBinTvl = median(populated.map((b) => b.totalUsd));
  const feeBps = pool.feeBps ?? 30;

  const binAnchors: BinAnchor[] = populated.map((b, i) => {
    const sizeDominance = medianBinTvl > 0 ? b.totalUsd / medianBinTvl : 0;
    const gravitationalPull = computeGravitationalPull(i, populated);
    const isolationIndex = computeIsolationIndex(i, populated, medianBinTvl);
    const neighborhoodShare = computeNeighborhoodShare(i, populated, 5);

    const totalReserveUsd = b.reserveXUsd + b.reserveYUsd;
    const reserveSkew = totalReserveUsd > 0
      ? (b.reserveXUsd - b.reserveYUsd) / totalReserveUsd
      : 0;

    let supportsSide: "BID" | "ASK" | "BOTH";
    if (reserveSkew > 0.5) supportsSide = "ASK";
    else if (reserveSkew < -0.5) supportsSide = "BID";
    else supportsSide = "BOTH";

    // Anchor score: composite of size dominance, gravitational pull, isolation
    const sizeScore = Math.min(sizeDominance / 5, 1) * 35;
    const gravityScore = Math.min(gravitationalPull / 5, 1) * 30;
    const neighborScore = Math.min(neighborhoodShare / 0.5, 1) * 20;
    const isolationScore = Math.min(isolationIndex / 10, 1) * 15;
    const anchorScore = Math.min(Math.round(sizeScore + gravityScore + neighborScore + isolationScore), 100);

    return {
      binId: b.binId,
      distanceFromActive: b.binId - activeBinId,
      totalUsd: b.totalUsd,
      sizeDominance,
      gravitationalPull,
      isolationIndex,
      neighborhoodShare,
      anchorScore,
      anchorClass: classifyAnchor(anchorScore),
      supportsSide,
      reserveSkew,
    };
  });

  const anchors = binAnchors.filter((b) => b.anchorClass !== "NONE");
  const megaAnchors = anchors.filter((b) => b.anchorClass === "MEGA").length;
  const strongAnchors = anchors.filter((b) => b.anchorClass === "STRONG").length;
  const anchorTvl = anchors.reduce((s, b) => s + b.totalUsd, 0);
  const anchorTvlPct = scannedTvl > 0 ? (anchorTvl / scannedTvl) * 100 : 0;

  const anchorScores = anchors.map((b) => b.totalUsd);
  const anchorConcentration = computeGini(anchorScores);

  const bidAnchors = anchors.filter((b) => b.distanceFromActive < 0);
  const askAnchors = anchors.filter((b) => b.distanceFromActive > 0);
  const bidAnchorTvl = bidAnchors.reduce((s, b) => s + b.totalUsd, 0);
  const askAnchorTvl = askAnchors.reduce((s, b) => s + b.totalUsd, 0);
  const anchorAsymmetry = (bidAnchorTvl + askAnchorTvl) > 0
    ? (bidAnchorTvl - askAnchorTvl) / (bidAnchorTvl + askAnchorTvl)
    : 0;

  const anchorDistances = anchors.map((b) => Math.abs(b.distanceFromActive));
  const avgAnchorDistance = anchorDistances.length > 0
    ? anchorDistances.reduce((s, d) => s + d, 0) / anchorDistances.length
    : 0;

  const anchorBinIds = anchors.map((b) => b.binId).sort((a, b) => a - b);
  const anchorSpread = anchorBinIds.length >= 2
    ? anchorBinIds[anchorBinIds.length - 1] - anchorBinIds[0]
    : 0;

  const topAnchors = [...binAnchors]
    .sort((a, b) => b.anchorScore - a.anchorScore)
    .slice(0, 10);

  const asciiMap = buildAsciiMap(binAnchors, activeBinId);
  const recommendation = buildRecommendation(
    anchors.length, megaAnchors, strongAnchors, anchorTvlPct,
    anchorAsymmetry, avgAnchorDistance, anchorConcentration,
    topAnchors, pool
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
    totalAnchors: anchors.length,
    megaAnchors,
    strongAnchors,
    anchorTvlPct: Math.round(anchorTvlPct * 10) / 10,
    anchorConcentration: Math.round(anchorConcentration * 1000) / 1000,
    bidAnchorTvl,
    askAnchorTvl,
    anchorAsymmetry: Math.round(anchorAsymmetry * 1000) / 1000,
    avgAnchorDistance: Math.round(avgAnchorDistance * 10) / 10,
    anchorSpread,
    anchors: binAnchors,
    topAnchors,
    bidAnchors: bidAnchors.sort((a, b) => b.anchorScore - a.anchorScore).slice(0, 5),
    askAnchors: askAnchors.sort((a, b) => b.anchorScore - a.anchorScore).slice(0, 5),
    recommendation,
    asciiMap,
  };
}

function computeGini(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  const total = sorted.reduce((s, v) => s + v, 0);
  if (total <= 0) return 0;
  let giniNumerator = 0;
  for (let i = 0; i < n; i++) {
    giniNumerator += (2 * (i + 1) - n - 1) * sorted[i];
  }
  return giniNumerator / (n * total);
}

function buildAsciiMap(bins: BinAnchor[], activeBinId: number): string {
  if (bins.length === 0) return "(no populated bins)";

  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const barWidth = 35;
  const maxScore = Math.max(...sorted.map((b) => b.anchorScore), 1);
  const lines: string[] = [
    "  Bin  | Dist | $TVL     | Score | Class    | Side | Grav  | Bar",
  ];
  lines.push("-------+------+----------+-------+----------+------+-------+" + "-".repeat(barWidth + 1));

  for (const b of sorted) {
    const dist = b.distanceFromActive >= 0
      ? `+${b.distanceFromActive}`.padStart(4)
      : `${b.distanceFromActive}`.padStart(4);
    const barLen = Math.round((b.anchorScore / maxScore) * barWidth);
    const marker = b.binId === activeBinId ? "*" : b.anchorClass === "MEGA" ? "M" : b.anchorClass === "STRONG" ? "S" : " ";
    const classStr = b.anchorClass.padEnd(8);
    const scoreStr = String(b.anchorScore).padStart(5);
    const gravStr = b.gravitationalPull.toFixed(1).padStart(5);
    const sideStr = b.supportsSide.padEnd(4);
    const barChar = b.anchorClass === "MEGA" ? "@" : b.anchorClass === "STRONG" ? "#" : b.anchorClass === "MODERATE" ? "=" : "-";
    lines.push(
      `${marker}${b.binId.toString().padStart(5)} | ${dist} | $${fmtUsd(b.totalUsd).padStart(7)} | ${scoreStr} | ${classStr} | ${sideStr} | ${gravStr} | ${barChar.repeat(barLen)}`
    );
  }
  lines.push("");
  lines.push("  * = active bin  M = mega anchor  S = strong anchor  @ = mega  # = strong");
  return lines.join("\n");
}

function buildRecommendation(
  totalAnchors: number,
  megaAnchors: number,
  strongAnchors: number,
  anchorTvlPct: number,
  anchorAsymmetry: number,
  avgAnchorDistance: number,
  anchorConcentration: number,
  topAnchors: BinAnchor[],
  pool: AppPool
): string {
  const parts: string[] = [];

  if (megaAnchors > 0) {
    parts.push(
      `${megaAnchors} MEGA ANCHOR${megaAnchors > 1 ? "S" : ""} detected — ` +
      `massive liquidity concentrations that dominate their neighborhood. ` +
      `These bins act as price shock absorbers and indicate strong LP conviction.`
    );
  }

  if (totalAnchors === 0) {
    parts.push(
      "NO SIGNIFICANT ANCHORS — liquidity is evenly distributed across bins. " +
      "This pool may be more susceptible to price impact from large trades. " +
      "LPs are spread thin without strong conviction at any price level."
    );
  } else {
    parts.push(
      `${totalAnchors} ANCHOR BINS hold ${fmtPct(anchorTvlPct)} of scanned TVL. ` +
      `${strongAnchors} strong, ${megaAnchors} mega. ` +
      "Anchor bins provide stability — trade execution near anchors sees lower slippage."
    );
  }

  if (Math.abs(anchorAsymmetry) > 0.3) {
    const direction = anchorAsymmetry > 0 ? "BID side (below active)" : "ASK side (above active)";
    parts.push(
      `ANCHOR ASYMMETRY: ${(Math.abs(anchorAsymmetry) * 100).toFixed(0)}% — anchors lean toward the ${direction}. ` +
      "This suggests stronger LP conviction in one price direction, creating an asymmetric support/resistance profile."
    );
  } else {
    parts.push(
      `BALANCED ANCHORS — bid/ask anchor TVL is roughly symmetric (asymmetry ${(Math.abs(anchorAsymmetry) * 100).toFixed(0)}%). ` +
      "LPs show similar conviction on both sides of the active bin."
    );
  }

  if (anchorConcentration > 0.6) {
    parts.push(
      `HIGH ANCHOR CONCENTRATION (Gini ${anchorConcentration.toFixed(2)}) — ` +
      "a few anchors dominate while others are relatively small. " +
      "The pool's stability depends heavily on these top anchors remaining in place."
    );
  }

  if (topAnchors.length > 0) {
    const strongest = topAnchors[0];
    parts.push(
      `STRONGEST ANCHOR: Bin ${strongest.binId} (score ${strongest.anchorScore}, ` +
      `$${fmtUsd(strongest.totalUsd)} TVL, ${strongest.gravitationalPull.toFixed(1)}x neighbor pull, ` +
      `${strongest.supportsSide} side). ` +
      `${Math.abs(strongest.distanceFromActive)} bins from active — ` +
      (Math.abs(strongest.distanceFromActive) <= 3
        ? "near-active anchor provides immediate trade stability."
        : "distant anchor marks a significant support/resistance level.")
    );
  }

  if (avgAnchorDistance > 15) {
    parts.push(
      `DISTANT ANCHORS — average ${avgAnchorDistance.toFixed(0)} bins from active. ` +
      "Anchors are far from current price, suggesting LPs expect significant price movement or are positioned for range-bound strategies."
    );
  }

  return parts.join("\n\n");
}

// -- Output -------------------------------------------------------------------

function printAnalysis(a: AnchorAnalysis, format: string): void {
  if (format === "json") {
    console.log(JSON.stringify(a, null, 2));
    return;
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(`  HODLMM BIN ANCHOR — ${a.pair} (Pool #${a.poolId})`);
  console.log(`${"=".repeat(72)}`);
  console.log(`  TVL: $${fmtUsd(a.tvlUsd)}  |  Vol 24h: $${fmtUsd(a.volume24hUsd)}  |  Fee: ${a.feeBps} bps`);
  console.log(`  Active Bin: ${a.activeBinId}  |  Scanned: ${a.binsScanned} bins  |  Populated: ${a.binsPopulated}`);
  console.log(`  Scanned TVL: $${fmtUsd(a.scannedTvlUsd)}`);

  console.log(`\n── Anchor Overview ${"─".repeat(53)}`);
  console.log(`  Total Anchors:       ${a.totalAnchors}`);
  console.log(`  Mega Anchors:        ${a.megaAnchors}`);
  console.log(`  Strong Anchors:      ${a.strongAnchors}`);
  console.log(`  Anchor TVL Share:    ${fmtPct(a.anchorTvlPct)}`);
  console.log(`  Anchor Gini:         ${a.anchorConcentration.toFixed(3)}`);
  console.log(`  Avg Distance:        ${a.avgAnchorDistance} bins`);
  console.log(`  Anchor Spread:       ${a.anchorSpread} bins`);

  console.log(`\n── Bid/Ask Anchor Balance ${"─".repeat(47)}`);
  console.log(`  Bid Anchor TVL:      $${fmtUsd(a.bidAnchorTvl)}`);
  console.log(`  Ask Anchor TVL:      $${fmtUsd(a.askAnchorTvl)}`);
  console.log(`  Asymmetry:           ${(a.anchorAsymmetry * 100).toFixed(1)}% ${a.anchorAsymmetry > 0 ? "(bid-heavy)" : a.anchorAsymmetry < 0 ? "(ask-heavy)" : "(balanced)"}`);

  console.log(`\n── Top Anchors ${"─".repeat(57)}`);
  console.log(`  Bin    | Dist  | TVL        | Score | Class    | Side | Gravity | Iso`);
  console.log(`  -------+-------+------------+-------+----------+------+---------+-----`);
  for (const b of a.topAnchors) {
    const dist = b.distanceFromActive >= 0 ? `+${b.distanceFromActive}` : `${b.distanceFromActive}`;
    console.log(
      `  ${String(b.binId).padStart(6)} | ${dist.padStart(5)} | $${fmtUsd(b.totalUsd).padStart(9)} | ${String(b.anchorScore).padStart(5)} | ${b.anchorClass.padEnd(8)} | ${b.supportsSide.padEnd(4)} | ${b.gravitationalPull.toFixed(1).padStart(7)} | ${String(b.isolationIndex).padStart(3)}`
    );
  }

  if (a.bidAnchors.length > 0) {
    console.log(`\n── Bid-Side Anchors (support below active) ${"─".repeat(29)}`);
    console.log(`  Bin    | Dist  | TVL        | Score | Gravity | Skew`);
    console.log(`  -------+-------+------------+-------+---------+-------`);
    for (const b of a.bidAnchors) {
      const dist = `${b.distanceFromActive}`.padStart(5);
      console.log(
        `  ${String(b.binId).padStart(6)} | ${dist} | $${fmtUsd(b.totalUsd).padStart(9)} | ${String(b.anchorScore).padStart(5)} | ${b.gravitationalPull.toFixed(1).padStart(7)} | ${b.reserveSkew.toFixed(2).padStart(5)}`
      );
    }
  }

  if (a.askAnchors.length > 0) {
    console.log(`\n── Ask-Side Anchors (resistance above active) ${"─".repeat(26)}`);
    console.log(`  Bin    | Dist  | TVL        | Score | Gravity | Skew`);
    console.log(`  -------+-------+------------+-------+---------+-------`);
    for (const b of a.askAnchors) {
      const dist = `+${b.distanceFromActive}`.padStart(5);
      console.log(
        `  ${String(b.binId).padStart(6)} | ${dist} | $${fmtUsd(b.totalUsd).padStart(9)} | ${String(b.anchorScore).padStart(5)} | ${b.gravitationalPull.toFixed(1).padStart(7)} | ${b.reserveSkew.toFixed(2).padStart(5)}`
      );
    }
  }

  console.log(`\n── Anchor Map ${"─".repeat(58)}`);
  console.log(a.asciiMap);

  console.log(`\n── Recommendation ${"─".repeat(54)}`);
  console.log(a.recommendation);
  console.log();
}

// -- Main ---------------------------------------------------------------------

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("hodlmm-bin-anchor")
    .description("HODLMM Bin Anchor Analyzer — finds sticky liquidity magnets that stabilize the pool")
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

  console.log(`Analyzing anchors for ${targetPool.token0Symbol}/${targetPool.token1Symbol} (Pool #${targetPool.poolId})...`);

  const activeBin = targetPool.activeBinId ?? (await getActiveBin(targetPool.poolId!));
  console.log(`  Active bin: ${activeBin}, scanning +/-${radius} bins...`);

  const rawBins = await scanBins(targetPool.poolId!, activeBin, targetPool, radius);
  const analysis = analyzeAnchors(targetPool, activeBin, rawBins);

  printAnalysis(analysis, format);
}

main().catch((err) => {
  console.error("Fatal:", err.message ?? err);
  process.exit(1);
});
