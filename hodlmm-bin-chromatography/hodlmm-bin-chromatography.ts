#!/usr/bin/env bun
/**
 * hodlmm-bin-chromatography.ts — Day 153 cocoa007 Bitflow Skills Comp
 *
 * Chromatography analyzer — models reserve separation dynamics across HODLMM bins.
 * The bin range acts as a chromatographic column where token reserves partition
 * between stationary and mobile phases. Partition coefficients, retention factors,
 * plate heights, and resolution metrics reveal separation efficiency.
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

interface BinChromatography {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  partitionCoefficient: number;
  retentionFactor: number;
  plateHeight: number;
  resolution: number;
  peakAsymmetry: number;
  capacityFactor: number;
  selectivity: number;
  bandBroadening: number;
  tailingFactor: number;
  columnEfficiency: number;
  eluteStrength: number;
  deadVolume: number;
  peakCapacity: number;
  separationFactor: number;
}

interface ChromatographyProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgPartitionCoefficient: number;
  maxPartitionCoefficient: number;
  avgRetentionFactor: number;
  minRetentionFactor: number;
  avgPlateHeight: number;
  maxPlateHeight: number;
  avgResolution: number;
  minResolution: number;
  avgPeakAsymmetry: number;
  maxPeakAsymmetry: number;
  avgCapacityFactor: number;
  maxCapacityFactor: number;
  avgSelectivity: number;
  maxSelectivity: number;
  avgBandBroadening: number;
  maxBandBroadening: number;
  avgTailingFactor: number;
  maxTailingFactor: number;
  avgColumnEfficiency: number;
  maxColumnEfficiency: number;
  avgEluteStrength: number;
  maxEluteStrength: number;
  avgDeadVolume: number;
  maxDeadVolume: number;
  avgPeakCapacity: number;
  totalPeakCapacity: number;
  avgSeparationFactor: number;
  minSeparationFactor: number;
  highRetentionCount: number;
  highRetentionFraction: number;
  wellResolvedCount: number;
  wellResolvedFraction: number;
  chromatographyGini: number;
  chromatographyIndex: number;
  chromatographyPhase: string;
  chromatographyVerdict: string;
  topBins: BinChromatography[];
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

function computeBinChromatography(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  maxReserve: number
): BinChromatography {
  const distance = Math.abs(bin.binId - activeBin);
  const n = allBins.length;
  const reserveFraction = maxReserve > 0 ? bin.totalUsd / maxReserve : 0;
  const volumeRatio = volume24hUsd > 0 ? volume24hUsd / (totalUsd || 1) : 0;

  const neighbors = allBins.filter(
    (b) => Math.abs(b.binId - bin.binId) <= 3 && b.binId !== bin.binId
  );
  const neighborAvg = neighbors.length > 0
    ? neighbors.reduce((s, b) => s + b.totalUsd, 0) / neighbors.length
    : 0;

  const xFraction = bin.totalUsd > 0 ? bin.reserveXUsd / bin.totalUsd : 0.5;
  const yFraction = 1 - xFraction;

  // 1. partitionCoefficient — K = Cs/Cm (stationary Y / mobile X phase ratio)
  const partitionCoefficient = r4(
    xFraction > 0.01 ? Math.min(10, yFraction / xFraction) : 10
  );

  // 2. retentionFactor — Rf = 1/(1+K), how mobile the reserves are
  const retentionFactor = r4(
    1 / (1 + partitionCoefficient)
  );

  // 3. plateHeight — H = sigma^2/L, separation efficiency per bin step
  const neighborVariance = neighbors.length > 1
    ? neighbors.reduce((s, b) => s + Math.pow(b.totalUsd - neighborAvg, 2), 0) / neighbors.length
    : 0;
  const normalizedVariance = totalUsd > 0 ? neighborVariance / (totalUsd * totalUsd / (n * n)) : 0;
  const plateHeight = r4(
    Math.min(5, Math.sqrt(normalizedVariance) * 2)
  );

  // 4. resolution — peak separation from neighboring reserve clusters
  const leftNeighbors = allBins.filter(b => b.binId < bin.binId && b.binId >= bin.binId - 3);
  const rightNeighbors = allBins.filter(b => b.binId > bin.binId && b.binId <= bin.binId + 3);
  const leftAvg = leftNeighbors.length > 0 ? leftNeighbors.reduce((s, b) => s + b.totalUsd, 0) / leftNeighbors.length : 0;
  const rightAvg = rightNeighbors.length > 0 ? rightNeighbors.reduce((s, b) => s + b.totalUsd, 0) / rightNeighbors.length : 0;
  const peakDiff = Math.abs(bin.totalUsd - Math.max(leftAvg, rightAvg));
  const peakWidth = Math.max(1, (bin.totalUsd + leftAvg + rightAvg) / 3);
  const resolution = r4(
    Math.min(3, peakDiff / peakWidth * 2)
  );

  // 5. peakAsymmetry — asymmetry of reserve distribution around this bin
  const leftSum = leftNeighbors.reduce((s, b) => s + b.totalUsd, 0);
  const rightSum = rightNeighbors.reduce((s, b) => s + b.totalUsd, 0);
  const peakAsymmetry = r4(
    leftSum + rightSum > 0
      ? Math.min(3, Math.max(0.33, rightSum > 0 ? leftSum / rightSum : 3))
      : 1
  );

  // 6. capacityFactor — k' = column loading ratio
  const capacityFactor = r4(
    Math.min(10, reserveFraction * (1 + partitionCoefficient) * 2)
  );

  // 7. selectivity — alpha = relative retention between X and Y phases
  const neighborXFrac = neighbors.length > 0
    ? neighbors.reduce((s, b) => s + (b.totalUsd > 0 ? b.reserveXUsd / b.totalUsd : 0.5), 0) / neighbors.length
    : 0.5;
  const selectivity = r4(
    Math.min(5, Math.max(0.2, xFraction > 0.01 && neighborXFrac > 0.01
      ? (yFraction / xFraction) / (((1 - neighborXFrac) / neighborXFrac) || 1)
      : 1))
  );

  // 8. bandBroadening — sigma, reserve spread from concentration center
  const bandBroadening = r4(
    Math.min(1, Math.sqrt(normalizedVariance) * (1 + distance * 0.05) * 0.5)
  );

  // 9. tailingFactor — asymmetry of trailing edge
  const tailingFactor = r4(
    Math.min(3, peakAsymmetry > 1 ? peakAsymmetry * (1 + volumeRatio * 0.2) : 1 / (peakAsymmetry + 0.01) * (1 + volumeRatio * 0.2))
  );

  // 10. columnEfficiency — N = theoretical plates (higher = better separation)
  const columnEfficiency = r4(
    Math.min(100, plateHeight > 0.01 ? Math.min(100, n / plateHeight * 2) : 100)
  );

  // 11. eluteStrength — mobile phase strength driving elution
  const eluteStrength = r4(
    Math.min(1, volumeRatio * 0.5 + xFraction * 0.5)
  );

  // 12. deadVolume — unoccupied bin capacity not participating in separation
  const deadVolume = r4(
    Math.min(1, Math.max(0, 1 - reserveFraction))
  );

  // 13. peakCapacity — local resolvable peak count
  const localResolution = resolution > 0.5 ? 1 : 0;
  const peakCapacity = r4(
    Math.min(5, 1 + Math.sqrt(columnEfficiency) * resolution * 0.1)
  );

  // 14. separationFactor — overall quality of component separation at this bin
  const separationFactor = r4(
    Math.min(1, (resolution * 0.3 + (columnEfficiency / 100) * 0.3 + selectivity / 5 * 0.2 + (1 - bandBroadening) * 0.2))
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    partitionCoefficient,
    retentionFactor,
    plateHeight,
    resolution,
    peakAsymmetry,
    capacityFactor,
    selectivity,
    bandBroadening,
    tailingFactor,
    columnEfficiency,
    eluteStrength,
    deadVolume,
    peakCapacity,
    separationFactor,
  };
}

function analyzeChromatography(bins: BinReserves[], pool: AppPool): ChromatographyProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));

  const binChrom = sorted.map((b) =>
    computeBinChromatography(b, activeBin, sorted, totalUsd, volume, maxReserve)
  );

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgPartitionCoefficient = r4(avg(binChrom.map((b) => b.partitionCoefficient)));
  const maxPartitionCoefficient = r4(Math.max(...binChrom.map((b) => b.partitionCoefficient)));
  const avgRetentionFactor = r4(avg(binChrom.map((b) => b.retentionFactor)));
  const minRetentionFactor = r4(Math.min(...binChrom.map((b) => b.retentionFactor)));
  const avgPlateHeight = r4(avg(binChrom.map((b) => b.plateHeight)));
  const maxPlateHeight = r4(Math.max(...binChrom.map((b) => b.plateHeight)));
  const avgResolution = r4(avg(binChrom.map((b) => b.resolution)));
  const minResolution = r4(Math.min(...binChrom.map((b) => b.resolution)));
  const avgPeakAsymmetry = r4(avg(binChrom.map((b) => b.peakAsymmetry)));
  const maxPeakAsymmetry = r4(Math.max(...binChrom.map((b) => b.peakAsymmetry)));
  const avgCapacityFactor = r4(avg(binChrom.map((b) => b.capacityFactor)));
  const maxCapacityFactor = r4(Math.max(...binChrom.map((b) => b.capacityFactor)));
  const avgSelectivity = r4(avg(binChrom.map((b) => b.selectivity)));
  const maxSelectivity = r4(Math.max(...binChrom.map((b) => b.selectivity)));
  const avgBandBroadening = r4(avg(binChrom.map((b) => b.bandBroadening)));
  const maxBandBroadening = r4(Math.max(...binChrom.map((b) => b.bandBroadening)));
  const avgTailingFactor = r4(avg(binChrom.map((b) => b.tailingFactor)));
  const maxTailingFactor = r4(Math.max(...binChrom.map((b) => b.tailingFactor)));
  const avgColumnEfficiency = r4(avg(binChrom.map((b) => b.columnEfficiency)));
  const maxColumnEfficiency = r4(Math.max(...binChrom.map((b) => b.columnEfficiency)));
  const avgEluteStrength = r4(avg(binChrom.map((b) => b.eluteStrength)));
  const maxEluteStrength = r4(Math.max(...binChrom.map((b) => b.eluteStrength)));
  const avgDeadVolume = r4(avg(binChrom.map((b) => b.deadVolume)));
  const maxDeadVolume = r4(Math.max(...binChrom.map((b) => b.deadVolume)));
  const avgPeakCapacity = r4(avg(binChrom.map((b) => b.peakCapacity)));
  const totalPeakCapacity = r2(binChrom.reduce((s, b) => s + b.peakCapacity, 0));
  const avgSeparationFactor = r4(avg(binChrom.map((b) => b.separationFactor)));
  const minSeparationFactor = r4(Math.min(...binChrom.map((b) => b.separationFactor)));
  const highRetentionCount = binChrom.filter((b) => b.retentionFactor < 0.3).length;
  const highRetentionFraction = r4(highRetentionCount / n);
  const wellResolvedCount = binChrom.filter((b) => b.resolution > 1.0).length;
  const wellResolvedFraction = r4(wellResolvedCount / n);

  // Gini coefficient on partition coefficients
  const partitions = binChrom.map((b) => b.partitionCoefficient);
  const sortedPartitions = [...partitions].sort((a, b) => b - a);
  const totalPartitions = sortedPartitions.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedPartitions[i];
  }
  const chromatographyGini = totalPartitions > 0
    ? r4(Math.abs(giniSum) / (n * totalPartitions))
    : 0;

  // Composite chromatography index (0-100)
  const retentionScore = Math.min(25, highRetentionFraction * 50);
  const efficiencyScore = Math.min(25, (1 - avgPlateHeight / 5) * 25);
  const broadenScore = Math.min(25, avgBandBroadening * 50);
  const asymmetryScore = Math.min(25, Math.abs(avgPeakAsymmetry - 1) * 25);
  const chromatographyIndex = Math.round(
    Math.min(100, retentionScore + (25 - efficiencyScore) + broadenScore + asymmetryScore)
  );

  let chromatographyPhase: string;
  if (chromatographyIndex >= 80) chromatographyPhase = "OVERLOADED_COLUMN";
  else if (chromatographyIndex >= 60) chromatographyPhase = "GRADIENT_ELUTION";
  else if (chromatographyIndex >= 40) chromatographyPhase = "ISOCRATIC_FLOW";
  else if (chromatographyIndex >= 20) chromatographyPhase = "EQUILIBRATED_COLUMN";
  else chromatographyPhase = "VOID_COLUMN";

  let chromatographyVerdict: string;
  if (avgBandBroadening > 0.5 && avgResolution < 0.5)
    chromatographyVerdict = "BAND_COLLAPSE";
  else if (avgPeakAsymmetry < 0.7 && highRetentionFraction > 0.3)
    chromatographyVerdict = "FRONTING_CASCADE";
  else if (avgTailingFactor > 2 && avgPeakAsymmetry > 1.5)
    chromatographyVerdict = "TAILING_DRIFT";
  else if (wellResolvedFraction > 0.5 && avgColumnEfficiency > 50)
    chromatographyVerdict = "BASELINE_RESOLUTION";
  else if (avgResolution < 0.3 && avgBandBroadening > 0.3)
    chromatographyVerdict = "COELUTION_TRAP";
  else
    chromatographyVerdict = "BASELINE_RESOLUTION";

  const topBins = [...binChrom]
    .sort((a, b) => b.capacityFactor - a.capacityFactor)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgPartitionCoefficient,
    maxPartitionCoefficient,
    avgRetentionFactor,
    minRetentionFactor,
    avgPlateHeight,
    maxPlateHeight,
    avgResolution,
    minResolution,
    avgPeakAsymmetry,
    maxPeakAsymmetry,
    avgCapacityFactor,
    maxCapacityFactor,
    avgSelectivity,
    maxSelectivity,
    avgBandBroadening,
    maxBandBroadening,
    avgTailingFactor,
    maxTailingFactor,
    avgColumnEfficiency,
    maxColumnEfficiency,
    avgEluteStrength,
    maxEluteStrength,
    avgDeadVolume,
    maxDeadVolume,
    avgPeakCapacity,
    totalPeakCapacity,
    avgSeparationFactor,
    minSeparationFactor,
    highRetentionCount,
    highRetentionFraction,
    wellResolvedCount,
    wellResolvedFraction,
    chromatographyGini,
    chromatographyIndex,
    chromatographyPhase,
    chromatographyVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Chromatography — Doctor ===\n");
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
        volume24hUsd: p.volume24hUsd,
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

  const profiles: ChromatographyProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeChromatography(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgChromatographyIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.chromatographyIndex)))
      : 0,
    overloadedColumnCount: profiles.filter((p) => p.chromatographyPhase === "OVERLOADED_COLUMN").length,
    gradientElutionCount: profiles.filter((p) => p.chromatographyPhase === "GRADIENT_ELUTION").length,
    isocraticFlowCount: profiles.filter((p) => p.chromatographyPhase === "ISOCRATIC_FLOW").length,
    equilibratedColumnCount: profiles.filter((p) => p.chromatographyPhase === "EQUILIBRATED_COLUMN").length,
    voidColumnCount: profiles.filter((p) => p.chromatographyPhase === "VOID_COLUMN").length,
    avgPartitionCoefficient: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgPartitionCoefficient)))
      : 0,
    avgColumnEfficiency: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgColumnEfficiency)))
      : 0,
    totalHighRetentionBins: profiles.reduce((s, p) => s + p.highRetentionCount, 0),
    avgChromatographyGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.chromatographyGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-chromatography").description("HODLMM bin chromatography analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin chromatographic separation dynamics")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
