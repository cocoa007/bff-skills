#!/usr/bin/env bun
/**
 * hodlmm-bin-tessellation.ts — Day 137 cocoa007 Bitflow Skills Comp
 *
 * Tessellation analyzer — measures how completely and uniformly HODLMM bin
 * reserves tile the active price range, detecting coverage gaps, fragmentation,
 * symmetry, and tiling regularity.
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 30;
const MIN_POPULATED_BINS = 5;

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

interface GapInfo {
  startBin: number;
  endBin: number;
  width: number;
  position: string;
}

interface TileSegment {
  startBin: number;
  endBin: number;
  length: number;
  totalUsd: number;
  avgUsd: number;
}

interface TessellationProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  coverageRatio: number;
  gapCount: number;
  maxGapWidth: number;
  avgGapWidth: number;
  gapFraction: number;
  tileDensity: number;
  tileUniformity: number;
  edgeTaperLeft: number;
  edgeTaperRight: number;
  edgeTaperAvg: number;
  contiguousSegments: number;
  longestSegment: number;
  shortestSegment: number;
  fragmentationIndex: number;
  symmetryScore: number;
  perimeterRatio: number;
  compactnessIndex: number;
  mosaicEntropy: number;
  maxMosaicEntropy: number;
  entropyRatio: number;
  concentrationGini: number;
  activeBinCoverage: number;
  activeBinNeighborhood: number;
  spanEfficiency: number;
  tileVariance: number;
  tessellationIndex: number;
  tessellationClass: string;
  coverageVerdict: string;
  gaps: GapInfo[];
  segments: TileSegment[];
  tvlUsd: number;
}

async function fetchPools(): Promise<AppPool[]> {
  const resp = await fetch(`${BFF_APP_BASE}/pools`);
  if (!resp.ok) throw new Error(`BFF API ${resp.status}`);
  const data = (await resp.json()) as any;
  const pools: any[] = data.pools || data.data || data;
  return pools
    .filter((p: any) => (p.tvlUsd || 0) >= MIN_TVL_USD)
    .map((p: any) => ({
      id: p.id || p.poolId?.toString() || "0",
      token0Symbol: p.token0Symbol || p.tokenXSymbol || "?",
      token1Symbol: p.token1Symbol || p.tokenYSymbol || "?",
      tvlUsd: p.tvlUsd || 0,
      volume24hUsd: p.volume24hUsd || p.volumeUsd24h || 0,
      poolId: p.poolId || parseInt(p.id) || 0,
      token0Decimals: p.token0Decimals || p.tokenXDecimals || 6,
      token1Decimals: p.token1Decimals || p.tokenYDecimals || 6,
      token0PriceUsd: p.token0PriceUsd || p.tokenXPriceUsd || 0,
      token1PriceUsd: p.token1PriceUsd || p.tokenYPriceUsd || 0,
      activeBinId: p.activeBinId || p.activeId || undefined,
      feeBps: p.feeBps || p.baseFee || undefined,
    }));
}

async function fetchActiveBin(poolId: number): Promise<number> {
  const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-active-bin-id`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: SENDER,
      arguments: [`0x0100000000000000000000000000000${poolId.toString(16).padStart(3, "0")}`],
    }),
  });
  if (!resp.ok) throw new Error(`Hiro API ${resp.status}`);
  const data = (await resp.json()) as any;
  if (!data.okay || data.result === undefined) throw new Error("get-active-bin-id failed");
  const hex = data.result.replace("0x", "");
  if (hex.startsWith("09")) {
    const inner = hex.slice(2);
    if (inner.startsWith("01")) return parseInt(inner.slice(2), 16);
  }
  if (hex.startsWith("01")) return parseInt(hex.slice(2), 16);
  return parseInt(hex, 16);
}

async function fetchBinReserves(
  poolId: number,
  activeBin: number,
  pool: AppPool
): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  for (let offset = -BIN_SCAN_RADIUS; offset <= BIN_SCAN_RADIUS; offset++) {
    const binId = activeBin + offset;
    const pIdHex = poolId.toString(16).padStart(3, "0");
    const bIdHex = binId < 0
      ? (0x100000000 + binId).toString(16).padStart(8, "0")
      : binId.toString(16).padStart(8, "0");

    const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-bin`;
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: SENDER,
          arguments: [
            `0x0100000000000000000000000000000${pIdHex}`,
            `0x01000000000000000000000000${bIdHex}`,
          ],
        }),
      });
      if (!resp.ok) continue;
      const data = (await resp.json()) as any;
      if (!data.okay) continue;

      const hex = data.result.replace("0x", "");
      const reserveX = extractReserve(hex, "reserve-x");
      const reserveY = extractReserve(hex, "reserve-y");
      if (reserveX === 0 && reserveY === 0) continue;

      const reserveXUsd = (reserveX / Math.pow(10, pool.token0Decimals)) * pool.token0PriceUsd;
      const reserveYUsd = (reserveY / Math.pow(10, pool.token1Decimals)) * pool.token1PriceUsd;

      bins.push({
        binId,
        reserveX,
        reserveY,
        reserveXUsd,
        reserveYUsd,
        totalUsd: reserveXUsd + reserveYUsd,
      });
    } catch {
      continue;
    }
  }
  return bins;
}

function extractReserve(hex: string, field: string): number {
  const fieldHex = Buffer.from(field).toString("hex");
  const idx = hex.indexOf(fieldHex);
  if (idx === -1) return 0;
  const afterField = hex.slice(idx + fieldHex.length);
  if (afterField.startsWith("01")) {
    return parseInt(afterField.slice(2, 34), 16);
  }
  return 0;
}

function analyzeTessellation(bins: BinReserves[], pool: AppPool): TessellationProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);

  const minBin = sorted[0].binId;
  const maxBin = sorted[n - 1].binId;
  const spanWidth = maxBin - minBin + 1;
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;

  const populatedSet = new Set(sorted.map((b) => b.binId));
  const coverageRatio = r4(n / binsScanned);

  const gaps: GapInfo[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gapWidth = sorted[i].binId - sorted[i - 1].binId - 1;
    if (gapWidth > 0) {
      const gapCenter = (sorted[i - 1].binId + sorted[i].binId) / 2;
      let position: string;
      if (gapCenter < activeBin - 5) position = "LEFT";
      else if (gapCenter > activeBin + 5) position = "RIGHT";
      else position = "CENTER";
      gaps.push({
        startBin: sorted[i - 1].binId + 1,
        endBin: sorted[i].binId - 1,
        width: gapWidth,
        position,
      });
    }
  }

  const gapCount = gaps.length;
  const maxGapWidth = gaps.length > 0 ? Math.max(...gaps.map((g) => g.width)) : 0;
  const avgGapWidth = gaps.length > 0 ? r2(gaps.reduce((s, g) => s + g.width, 0) / gaps.length) : 0;
  const totalGapBins = gaps.reduce((s, g) => s + g.width, 0);
  const gapFraction = spanWidth > 0 ? r4(totalGapBins / spanWidth) : 0;

  const tileDensity = n > 0 ? r2(totalUsd / n) : 0;

  const reserves = sorted.map((b) => b.totalUsd);
  const mean = reserves.reduce((s, v) => s + v, 0) / reserves.length;
  const variance = reserves.reduce((s, v) => s + (v - mean) ** 2, 0) / reserves.length;
  const std = Math.sqrt(variance);
  const cv = mean > 0 ? std / mean : 0;
  const tileUniformity = r4(Math.max(0, 1 - cv));

  const tileVariance = r2(variance);

  const segments: TileSegment[] = [];
  let segStart = 0;
  for (let i = 1; i <= sorted.length; i++) {
    if (i === sorted.length || sorted[i].binId - sorted[i - 1].binId > 1) {
      const seg = sorted.slice(segStart, i);
      const segTotal = seg.reduce((s, b) => s + b.totalUsd, 0);
      segments.push({
        startBin: seg[0].binId,
        endBin: seg[seg.length - 1].binId,
        length: seg.length,
        totalUsd: r2(segTotal),
        avgUsd: r2(segTotal / seg.length),
      });
      segStart = i;
    }
  }

  const contiguousSegments = segments.length;
  const longestSegment = Math.max(...segments.map((s) => s.length));
  const shortestSegment = Math.min(...segments.map((s) => s.length));
  const fragmentationIndex = n > 0 ? r4(1 - longestSegment / n) : 1;

  const edgeCount = Math.max(1, Math.floor(n * 0.2));
  const centerCount = Math.max(1, n - 2 * edgeCount);
  const leftEdgeAvg = reserves.slice(0, edgeCount).reduce((s, v) => s + v, 0) / edgeCount;
  const rightEdgeAvg = reserves.slice(-edgeCount).reduce((s, v) => s + v, 0) / edgeCount;
  const centerAvg = reserves.slice(edgeCount, edgeCount + centerCount).reduce((s, v) => s + v, 0) / centerCount;
  const edgeTaperLeft = centerAvg > 0 ? r4(leftEdgeAvg / centerAvg) : 0;
  const edgeTaperRight = centerAvg > 0 ? r4(rightEdgeAvg / centerAvg) : 0;
  const edgeTaperAvg = r4((edgeTaperLeft + edgeTaperRight) / 2);

  const activeBinIdx = sorted.findIndex((b) => b.binId >= activeBin);
  const leftHalf = activeBinIdx > 0 ? reserves.slice(0, activeBinIdx).reverse() : [];
  const rightHalf = activeBinIdx < n ? reserves.slice(activeBinIdx) : [];
  const minHalfLen = Math.min(leftHalf.length, rightHalf.length);

  let symmetryScore = 0;
  if (minHalfLen >= 2) {
    const l = leftHalf.slice(0, minHalfLen);
    const r = rightHalf.slice(0, minHalfLen);
    const lm = l.reduce((s, v) => s + v, 0) / l.length;
    const rm = r.reduce((s, v) => s + v, 0) / r.length;
    let num = 0, d1 = 0, d2 = 0;
    for (let j = 0; j < minHalfLen; j++) {
      num += (l[j] - lm) * (r[j] - rm);
      d1 += (l[j] - lm) ** 2;
      d2 += (r[j] - rm) ** 2;
    }
    const denom = Math.sqrt(d1 * d2);
    symmetryScore = denom > 0 ? r4(Math.max(0, num / denom)) : 0;
  }

  let perimeter = 0;
  for (let i = 1; i < reserves.length; i++) {
    perimeter += Math.abs(reserves[i] - reserves[i - 1]);
  }
  perimeter += reserves[0] + reserves[reserves.length - 1];
  const area = totalUsd;
  const perimeterRatio = area > 0 ? r4(perimeter / area) : 0;

  const idealPerimeter = mean * 2;
  const compactnessIndex = idealPerimeter > 0 && perimeter > 0
    ? r4(Math.min(1, idealPerimeter / perimeter))
    : 0;

  let mosaicEntropy = 0;
  for (const v of reserves) {
    const p = totalUsd > 0 ? v / totalUsd : 0;
    if (p > 0) mosaicEntropy -= p * Math.log2(p);
  }
  const maxMosaicEntropy = n > 0 ? Math.log2(n) : 0;
  const entropyRatio = maxMosaicEntropy > 0 ? r4(mosaicEntropy / maxMosaicEntropy) : 0;
  mosaicEntropy = r4(mosaicEntropy);

  const sortedReserves = [...reserves].sort((a, b) => a - b);
  let giniNum = 0;
  for (let i = 0; i < sortedReserves.length; i++) {
    giniNum += (2 * (i + 1) - sortedReserves.length - 1) * sortedReserves[i];
  }
  const giniDenom = sortedReserves.length * sortedReserves.reduce((s, v) => s + v, 0);
  const concentrationGini = giniDenom > 0 ? r4(giniNum / giniDenom) : 0;

  const activeBinEntry = sorted.find((b) => b.binId === activeBin);
  const activeBinCoverage = activeBinEntry ? r4(activeBinEntry.totalUsd / (totalUsd || 1)) : 0;

  const neighborhoodRadius = 3;
  const neighborhoodBins = sorted.filter(
    (b) => Math.abs(b.binId - activeBin) <= neighborhoodRadius
  );
  const neighborhoodUsd = neighborhoodBins.reduce((s, b) => s + b.totalUsd, 0);
  const activeBinNeighborhood = totalUsd > 0 ? r4(neighborhoodUsd / totalUsd) : 0;

  const spanEfficiency = spanWidth > 0 ? r4(n / spanWidth) : 0;

  const coverageScore = Math.min(25, coverageRatio * 25);
  const uniformityScore = Math.min(25, tileUniformity * 25);
  const contiguityScore = Math.min(25, (1 - fragmentationIndex) * 25);
  const entropyScore = Math.min(25, entropyRatio * 25);
  const tessellationIndex = Math.round(
    Math.min(100, coverageScore + uniformityScore + contiguityScore + entropyScore)
  );

  let tessellationClass: string;
  if (tessellationIndex >= 80) tessellationClass = "PERFECT";
  else if (tessellationIndex >= 60) tessellationClass = "REGULAR";
  else if (tessellationIndex >= 40) tessellationClass = "IRREGULAR";
  else if (tessellationIndex >= 20) tessellationClass = "SPARSE";
  else tessellationClass = "BROKEN";

  let coverageVerdict: string;
  if (coverageRatio > 0.8 && gapCount === 0) coverageVerdict = "COMPLETE";
  else if (coverageRatio > 0.6 && maxGapWidth <= 2) coverageVerdict = "MINOR_GAPS";
  else if (coverageRatio > 0.4) coverageVerdict = "PATCHY";
  else if (coverageRatio > 0.2) coverageVerdict = "SPARSE";
  else coverageVerdict = "FRAGMENTED";

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    coverageRatio,
    gapCount,
    maxGapWidth,
    avgGapWidth,
    gapFraction,
    tileDensity,
    tileUniformity,
    edgeTaperLeft,
    edgeTaperRight,
    edgeTaperAvg,
    contiguousSegments,
    longestSegment,
    shortestSegment,
    fragmentationIndex,
    symmetryScore,
    perimeterRatio,
    compactnessIndex,
    mosaicEntropy,
    maxMosaicEntropy: r4(maxMosaicEntropy),
    entropyRatio,
    concentrationGini,
    activeBinCoverage,
    activeBinNeighborhood,
    spanEfficiency,
    tileVariance,
    tessellationIndex,
    tessellationClass,
    coverageVerdict,
    gaps: gaps.slice(0, 10),
    segments: segments.slice(0, 10),
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Tessellation — Doctor ===\n");
  let ok = true;

  try {
    const r = await fetch(`${BFF_APP_BASE}/pools`);
    console.log(`  BFF API:  ${r.ok ? "OK" : "FAIL"} (${r.status})`);
    if (!r.ok) ok = false;
  } catch (e: any) {
    console.log(`  BFF API:  FAIL (${e.message})`);
    ok = false;
  }

  try {
    const r = await fetch(`${HIRO_API}/v2/info`);
    console.log(`  Hiro API: ${r.ok ? "OK" : "FAIL"} (${r.status})`);
    if (!r.ok) ok = false;
  } catch (e: any) {
    console.log(`  Hiro API: FAIL (${e.message})`);
    ok = false;
  }

  console.log(`\n  Result: ${ok ? "PASS" : "FAIL"}`);
  if (!ok) process.exit(1);
}

async function runStatus(): Promise<void> {
  const pools = await fetchPools();
  console.log(
    JSON.stringify({
      result: "success",
      poolsAvailable: pools.length,
      pools: pools.slice(0, 10).map((p) => ({
        pair: `${p.token0Symbol}/${p.token1Symbol}`,
        poolId: p.poolId,
        tvlUsd: p.tvlUsd,
      })),
    })
  );
}

async function runAnalysis(opts: { pool?: string; top?: string }): Promise<void> {
  const pools = await fetchPools();
  let targets: AppPool[];

  if (opts.pool) {
    const pid = parseInt(opts.pool);
    targets = pools.filter((p) => p.poolId === pid);
    if (targets.length === 0) {
      console.log(JSON.stringify({ error: `Pool #${opts.pool} not found` }));
      return;
    }
  } else {
    const topN = parseInt(opts.top || "5");
    targets = pools.sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, topN);
  }

  const profiles: TessellationProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeTessellation(bins, pool));
    } catch {
      continue;
    }
  }

  const summary = {
    poolsAnalyzed: profiles.length,
    avgTessellationIndex: profiles.length > 0
      ? r2(profiles.reduce((s, p) => s + p.tessellationIndex, 0) / profiles.length)
      : 0,
    perfectCount: profiles.filter((p) => p.tessellationClass === "PERFECT").length,
    regularCount: profiles.filter((p) => p.tessellationClass === "REGULAR").length,
    irregularCount: profiles.filter((p) => p.tessellationClass === "IRREGULAR").length,
    sparseCount: profiles.filter((p) => p.tessellationClass === "SPARSE").length,
    brokenCount: profiles.filter((p) => p.tessellationClass === "BROKEN").length,
    avgCoverageRatio: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.coverageRatio, 0) / profiles.length)
      : 0,
    avgTileUniformity: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.tileUniformity, 0) / profiles.length)
      : 0,
    avgFragmentationIndex: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.fragmentationIndex, 0) / profiles.length)
      : 0,
    avgGini: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.concentrationGini, 0) / profiles.length)
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-tessellation").description("HODLMM bin tessellation analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin tessellation")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
