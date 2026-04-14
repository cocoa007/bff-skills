#!/usr/bin/env bun
/**
 * hodlmm-bin-clustering.ts
 *
 * HODLMM Bin Clustering Analyzer — Identifies natural liquidity clusters within
 * bin distributions using density-based grouping. Detects multi-modal liquidity
 * patterns, dead zones, cluster boundaries, and optimal LP range recommendations.
 *
 * Key metrics:
 *  - Number of distinct liquidity clusters (density-based detection)
 *  - Cluster centroids, widths, and total liquidity
 *  - Inter-cluster gaps (dead zones between populated regions)
 *  - Dominant cluster identification (largest by liquidity)
 *  - Cluster concentration score (how focused vs spread liquidity is)
 *  - Optimal LP range based on cluster boundaries
 *  - ASCII cluster map with labeled regions
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 75).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 25;
const GAP_THRESHOLD = 2; // consecutive empty bins to split clusters

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
  reserveXUsd: number;
  reserveYUsd: number;
  totalUsd: number;
  balanceRatio: number;
}

interface LiquidityCluster {
  id: number;
  startBin: number;
  endBin: number;
  width: number;
  centroid: number;
  totalUsd: number;
  peakBin: number;
  peakUsd: number;
  avgUsdPerBin: number;
  populatedBins: number;
  density: number; // populated / width
  containsActiveBin: boolean;
  distanceFromActive: number;
  shareOfTotal: number;
  label: string;
}

interface GapRegion {
  startBin: number;
  endBin: number;
  width: number;
  leftClusterId: number;
  rightClusterId: number;
}

type ClusterPattern = "SINGLE_PEAK" | "DUAL_PEAK" | "MULTI_PEAK" | "DISPERSED" | "EMPTY";
type ConcentrationGrade = "TIGHT" | "MODERATE" | "SPREAD" | "FRAGMENTED";

interface ClusterAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  populationRate: number;
  clusters: LiquidityCluster[];
  gaps: GapRegion[];
  pattern: ClusterPattern;
  concentrationScore: number;
  concentrationGrade: ConcentrationGrade;
  dominantClusterId: number;
  dominantClusterShare: number;
  hhi: number;
  optimalRange: { startBin: number; endBin: number; width: number; coveragePercent: number };
  recommendation: string;
  asciiMap: string;
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
  if (n < 0) return "N/A";
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(6)}`;
}

// ── Pool Data ──────────────────────────────────────────────────────────────────

let _poolCache: AppPool[] | null = null;

async function fetchAllPools(): Promise<AppPool[]> {
  if (_poolCache) return _poolCache;
  const data = await fetchJson(`${BFF_APP_BASE}/pools/hodlmm`);
  const pools: AppPool[] = (data?.pools || data || []).map((p: any) => ({
    id: p.id ?? p.poolId ?? "?",
    token0Symbol: p.token0Symbol ?? p.tokenXSymbol ?? "?",
    token1Symbol: p.token1Symbol ?? p.tokenYSymbol ?? "?",
    tvlUsd: parseFloat(p.tvlUsd ?? p.tvl ?? "0"),
    volume24hUsd: parseFloat(p.volume24hUsd ?? p.volume24h ?? "0"),
    poolId: parseInt(p.poolId ?? p.id ?? "0"),
    token0Decimals: parseInt(p.token0Decimals ?? p.tokenXDecimals ?? "6"),
    token1Decimals: parseInt(p.token1Decimals ?? p.tokenYDecimals ?? "6"),
    token0PriceUsd: parseFloat(p.token0PriceUsd ?? p.tokenXPriceUsd ?? "0"),
    token1PriceUsd: parseFloat(p.token1PriceUsd ?? p.tokenYPriceUsd ?? "0"),
    activeBinId: parseInt(p.activeBinId ?? "0") || undefined,
    feeBps: parseFloat(p.feeBps ?? p.fee ?? "30"),
  }));
  _poolCache = pools.filter((p) => p.tvlUsd >= MIN_TVL_USD);
  return _poolCache;
}

async function getActiveBin(poolId: number): Promise<number> {
  const result = await callReadOnly("get-active-bin-id", [uintCV(poolId)]);
  return parseUintResult(result);
}

async function fetchBinReserves(poolId: number, activeBinId: number, pool: AppPool): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const start = activeBinId - BIN_SCAN_RADIUS;
  const end = activeBinId + BIN_SCAN_RADIUS;

  for (let binId = start; binId <= end; binId++) {
    try {
      const result = await callReadOnly("get-bin", [uintCV(poolId), uintCV(binId)]);
      const parsed = parseUintResult(result);
      if (parsed > 0) {
        const priceSum = pool.token0PriceUsd + pool.token1PriceUsd + 0.001;
        const ratioX = pool.token0PriceUsd / priceSum;
        const reserveX = parsed * ratioX;
        const reserveY = parsed * (1 - ratioX);
        const reserveXUsd = (reserveX / Math.pow(10, pool.token0Decimals)) * pool.token0PriceUsd;
        const reserveYUsd = (reserveY / Math.pow(10, pool.token1Decimals)) * pool.token1PriceUsd;
        const totalUsd = reserveXUsd + reserveYUsd;
        const balanceRatio = totalUsd > 0 ? reserveXUsd / totalUsd : 0.5;
        bins.push({ binId, reserveX, reserveY, reserveXUsd, reserveYUsd, totalUsd, balanceRatio });
      } else {
        bins.push({ binId, reserveX: 0, reserveY: 0, reserveXUsd: 0, reserveYUsd: 0, totalUsd: 0, balanceRatio: 0.5 });
      }
    } catch {
      bins.push({ binId, reserveX: 0, reserveY: 0, reserveXUsd: 0, reserveYUsd: 0, totalUsd: 0, balanceRatio: 0.5 });
    }
  }
  return bins;
}

// ── Cluster Detection ────────────────────────────────────────────────────────

function detectClusters(bins: BinReserves[], activeBinId: number): LiquidityCluster[] {
  const clusters: LiquidityCluster[] = [];
  let currentCluster: BinReserves[] = [];
  let gapCount = 0;

  for (const bin of bins) {
    if (bin.totalUsd > 0) {
      if (gapCount > 0 && gapCount >= GAP_THRESHOLD && currentCluster.length > 0) {
        clusters.push(buildCluster(currentCluster, clusters.length + 1, activeBinId, 0));
        currentCluster = [];
      }
      gapCount = 0;
      currentCluster.push(bin);
    } else {
      gapCount++;
    }
  }

  if (currentCluster.length > 0) {
    clusters.push(buildCluster(currentCluster, clusters.length + 1, activeBinId, 0));
  }

  const totalUsd = clusters.reduce((s, c) => s + c.totalUsd, 0);
  for (const c of clusters) {
    c.shareOfTotal = totalUsd > 0 ? Math.round((c.totalUsd / totalUsd) * 10000) / 100 : 0;
  }

  return clusters.sort((a, b) => b.totalUsd - a.totalUsd);
}

function buildCluster(bins: BinReserves[], id: number, activeBinId: number, _totalUsd: number): LiquidityCluster {
  const startBin = bins[0].binId;
  const endBin = bins[bins.length - 1].binId;
  const width = endBin - startBin + 1;
  const totalUsd = bins.reduce((s, b) => s + b.totalUsd, 0);
  const populatedBins = bins.filter((b) => b.totalUsd > 0).length;

  let weightedBinSum = 0;
  let peakBin = bins[0].binId;
  let peakUsd = 0;
  for (const b of bins) {
    if (b.totalUsd > 0) {
      weightedBinSum += b.binId * b.totalUsd;
    }
    if (b.totalUsd > peakUsd) {
      peakUsd = b.totalUsd;
      peakBin = b.binId;
    }
  }

  const centroid = totalUsd > 0 ? Math.round((weightedBinSum / totalUsd) * 100) / 100 : startBin;
  const containsActiveBin = activeBinId >= startBin && activeBinId <= endBin;
  const distanceFromActive = containsActiveBin
    ? 0
    : Math.min(Math.abs(startBin - activeBinId), Math.abs(endBin - activeBinId));

  const label = containsActiveBin ? "ACTIVE" : distanceFromActive <= 5 ? "NEAR" : "FAR";

  return {
    id,
    startBin,
    endBin,
    width,
    centroid,
    totalUsd: Math.round(totalUsd * 100) / 100,
    peakBin,
    peakUsd: Math.round(peakUsd * 100) / 100,
    avgUsdPerBin: populatedBins > 0 ? Math.round((totalUsd / populatedBins) * 100) / 100 : 0,
    populatedBins,
    density: width > 0 ? Math.round((populatedBins / width) * 1000) / 1000 : 0,
    containsActiveBin,
    distanceFromActive,
    shareOfTotal: 0,
    label,
  };
}

function detectGaps(clusters: LiquidityCluster[]): GapRegion[] {
  const sorted = [...clusters].sort((a, b) => a.startBin - b.startBin);
  const gaps: GapRegion[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const left = sorted[i];
    const right = sorted[i + 1];
    const gapStart = left.endBin + 1;
    const gapEnd = right.startBin - 1;
    if (gapEnd >= gapStart) {
      gaps.push({
        startBin: gapStart,
        endBin: gapEnd,
        width: gapEnd - gapStart + 1,
        leftClusterId: left.id,
        rightClusterId: right.id,
      });
    }
  }

  return gaps;
}

function classifyPattern(clusters: LiquidityCluster[]): ClusterPattern {
  if (clusters.length === 0) return "EMPTY";
  if (clusters.length === 1) return "SINGLE_PEAK";
  if (clusters.length === 2) return "DUAL_PEAK";
  if (clusters.length <= 4) return "MULTI_PEAK";
  return "DISPERSED";
}

function computeConcentration(clusters: LiquidityCluster[]): number {
  if (clusters.length === 0) return 0;
  if (clusters.length === 1) return 100;
  const totalUsd = clusters.reduce((s, c) => s + c.totalUsd, 0);
  if (totalUsd === 0) return 0;

  const shares = clusters.map((c) => c.totalUsd / totalUsd);
  const hhi = shares.reduce((s, sh) => s + sh * sh, 0);
  return Math.round(hhi * 100);
}

function getConcentrationGrade(score: number): ConcentrationGrade {
  if (score >= 70) return "TIGHT";
  if (score >= 45) return "MODERATE";
  if (score >= 25) return "SPREAD";
  return "FRAGMENTED";
}

function computeHHI(clusters: LiquidityCluster[]): number {
  const totalUsd = clusters.reduce((s, c) => s + c.totalUsd, 0);
  if (totalUsd === 0) return 0;
  const shares = clusters.map((c) => (c.totalUsd / totalUsd) * 10000);
  return Math.round(shares.reduce((s, sh) => s + (sh / 100) * (sh / 100), 0));
}

function computeOptimalRange(
  clusters: LiquidityCluster[],
  totalUsd: number,
  activeBinId: number
): { startBin: number; endBin: number; width: number; coveragePercent: number } {
  if (clusters.length === 0) {
    return { startBin: activeBinId - 5, endBin: activeBinId + 5, width: 11, coveragePercent: 0 };
  }

  const sorted = [...clusters].sort((a, b) => b.totalUsd - a.totalUsd);
  let coveredUsd = 0;
  let rangeStart = sorted[0].startBin;
  let rangeEnd = sorted[0].endBin;

  for (const c of sorted) {
    coveredUsd += c.totalUsd;
    rangeStart = Math.min(rangeStart, c.startBin);
    rangeEnd = Math.max(rangeEnd, c.endBin);
    if (coveredUsd / totalUsd >= 0.80) break;
  }

  if (rangeStart > activeBinId) rangeStart = activeBinId;
  if (rangeEnd < activeBinId) rangeEnd = activeBinId;

  return {
    startBin: rangeStart,
    endBin: rangeEnd,
    width: rangeEnd - rangeStart + 1,
    coveragePercent: totalUsd > 0 ? Math.round((coveredUsd / totalUsd) * 100) : 0,
  };
}

// ── ASCII Map ─────────────────────────────────────────────────────────────────

function buildAsciiMap(bins: BinReserves[], clusters: LiquidityCluster[], activeBinId: number): string {
  const lines: string[] = [];
  lines.push("  Bin Cluster Map");
  lines.push("  ──────────────────────────────────────────────────");

  const clusterLabels: string[] = clusters.slice(0, 6).map(
    (c) => `C${c.id}(${formatUsd(c.totalUsd)}, ${c.shareOfTotal}%)`
  );
  lines.push(`  Clusters: ${clusterLabels.join(" | ") || "none"}`);
  lines.push("");

  const maxUsd = Math.max(...bins.map((b) => b.totalUsd), 0.01);
  const barWidth = 35;

  for (const bin of bins) {
    const marker = bin.binId === activeBinId ? "▼" : " ";
    const dist = bin.binId - activeBinId;
    const distStr = dist >= 0 ? `+${dist}`.padStart(4) : `${dist}`.padStart(4);

    if (bin.totalUsd <= 0) {
      lines.push(`  ${marker}${distStr} │${"·".padEnd(barWidth)}│`);
      continue;
    }

    const sorted = [...clusters].sort((a, b) => a.startBin - b.startBin);
    const cluster = sorted.find((c) => bin.binId >= c.startBin && bin.binId <= c.endBin);
    const clusterTag = cluster ? `C${cluster.id}` : "??";

    const fillLen = Math.max(1, Math.round((bin.totalUsd / maxUsd) * barWidth));
    const bar = "█".repeat(fillLen).padEnd(barWidth);

    lines.push(`  ${marker}${distStr} │${bar}│ ${formatUsd(bin.totalUsd)} [${clusterTag}]`);
  }

  lines.push("");
  return lines.join("\n");
}

// ── Command Handlers ─────────────────────────────────────────────────────────

async function runDoctor(): Promise<void> {
  const results: Record<string, string> = {};

  try {
    await fetchJson(`${BFF_APP_BASE}/pools/hodlmm`);
    results["bitflow_app_api"] = "ok";
  } catch (e: any) {
    results["bitflow_app_api"] = `error: ${e.message}`;
  }

  try {
    await fetchJson(`${HIRO_API}/v2/info`);
    results["hiro_api"] = "ok";
  } catch (e: any) {
    results["hiro_api"] = `error: ${e.message}`;
  }

  try {
    const testResult = await callReadOnly("get-active-bin-id", [uintCV(1)]);
    results["dlmm_contract"] = testResult.result ? "ok" : "no result";
  } catch (e: any) {
    results["dlmm_contract"] = `error: ${e.message}`;
  }

  console.log(
    JSON.stringify({
      tool: "hodlmm-bin-clustering",
      command: "doctor",
      status: Object.values(results).every((v) => v.startsWith("ok")) ? "healthy" : "degraded",
      checks: results,
      timestamp: new Date().toISOString(),
    })
  );
}

async function runInstallPacks(): Promise<void> {
  console.log(
    JSON.stringify({
      tool: "hodlmm-bin-clustering",
      command: "install-packs",
      status: "ok",
      message: "No additional dependencies required. Uses commander (workspace) + native fetch.",
      timestamp: new Date().toISOString(),
    })
  );
}

async function runAnalyze(options: { pool: string }): Promise<void> {
  const poolId = parseInt(options.pool);
  if (isNaN(poolId)) {
    console.log(JSON.stringify({
      tool: "hodlmm-bin-clustering",
      command: "run",
      timestamp: new Date().toISOString(),
      error: "Invalid pool ID — provide a numeric pool ID with --pool",
    }));
    return;
  }

  const pools = await fetchAllPools();
  const pool = pools.find((p) => p.poolId === poolId);

  if (!pool) {
    console.log(JSON.stringify({
      tool: "hodlmm-bin-clustering",
      command: "run",
      timestamp: new Date().toISOString(),
      error: `Pool ${poolId} not found or below TVL threshold ($${MIN_TVL_USD})`,
    }));
    return;
  }

  const activeBinId = pool.activeBinId || await getActiveBin(poolId);
  if (!activeBinId) {
    console.log(JSON.stringify({
      tool: "hodlmm-bin-clustering",
      command: "run",
      timestamp: new Date().toISOString(),
      error: `Could not determine active bin for pool ${poolId}`,
    }));
    return;
  }

  const rawBins = await fetchBinReserves(poolId, activeBinId, pool);
  const binsPopulated = rawBins.filter((b) => b.totalUsd > 0).length;
  const totalUsd = rawBins.reduce((s, b) => s + b.totalUsd, 0);

  const clusters = detectClusters(rawBins, activeBinId);
  const gaps = detectGaps(clusters);
  const pattern = classifyPattern(clusters);
  const concentrationScore = computeConcentration(clusters);
  const concentrationGrade = getConcentrationGrade(concentrationScore);
  const hhi = computeHHI(clusters);
  const dominantCluster = clusters.length > 0 ? clusters[0] : null;
  const optimalRange = computeOptimalRange(clusters, totalUsd, activeBinId);
  const asciiMap = buildAsciiMap(rawBins, clusters, activeBinId);

  let recommendation: string;
  if (pattern === "EMPTY") {
    recommendation = "No populated bins found in scan range. Pool may be inactive or liquidity is outside the scan window.";
  } else if (pattern === "SINGLE_PEAK") {
    recommendation = `Single liquidity cluster detected (bins ${clusters[0].startBin}-${clusters[0].endBin}, density ${clusters[0].density}). `;
    recommendation += clusters[0].containsActiveBin
      ? "Active bin is within the cluster — concentrated LP positions are well-placed."
      : `Active bin is ${clusters[0].distanceFromActive} bins from cluster — consider repositioning toward the active range.`;
  } else if (pattern === "DUAL_PEAK") {
    recommendation = `Dual-peak distribution: ${clusters.length} clusters with ${gaps.length > 0 ? `${gaps[0].width}-bin gap` : "minimal gap"} between them. `;
    if (concentrationGrade === "TIGHT") {
      recommendation += "Liquidity heavily concentrated in the dominant cluster — the secondary cluster sees less activity.";
    } else {
      recommendation += "Consider covering both clusters with a wide range or focus on the cluster containing the active bin.";
    }
  } else if (pattern === "MULTI_PEAK") {
    recommendation = `Multi-modal distribution: ${clusters.length} distinct clusters. Concentration is ${concentrationGrade.toLowerCase()} (HHI ${hhi}). `;
    recommendation += `Optimal range covers ${optimalRange.coveragePercent}% of liquidity in ${optimalRange.width} bins. Focus LP on the cluster with the active bin for best fee capture.`;
  } else {
    recommendation = `Dispersed liquidity across ${clusters.length} fragments. High fragmentation reduces fee efficiency — `;
    recommendation += `consider concentrating around the active bin (optimal range: ${optimalRange.startBin}-${optimalRange.endBin}).`;
  }

  const out: ClusterAnalysis = {
    poolId,
    pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
    tvlUsd: Math.round(pool.tvlUsd),
    volume24hUsd: Math.round(pool.volume24hUsd),
    feeBps: pool.feeBps || 30,
    activeBinId,
    binsScanned: rawBins.length,
    binsPopulated,
    populationRate: rawBins.length > 0 ? Math.round((binsPopulated / rawBins.length) * 100) : 0,
    clusters,
    gaps,
    pattern,
    concentrationScore,
    concentrationGrade,
    dominantClusterId: dominantCluster?.id ?? 0,
    dominantClusterShare: dominantCluster?.shareOfTotal ?? 0,
    hhi,
    optimalRange,
    recommendation,
    asciiMap,
  };

  console.log(JSON.stringify({
    tool: "hodlmm-bin-clustering",
    command: "run",
    timestamp: new Date().toISOString(),
    ...out,
  }, null, 2));
}

async function runScan(options: {
  top?: string;
  minTvl?: string;
  sort?: string;
}): Promise<void> {
  const topN = parseInt(options.top || "10");
  const minTvl = parseFloat(options.minTvl || String(MIN_TVL_USD));
  const sortBy = options.sort || "clusters";

  const pools = (await fetchAllPools()).filter((p) => p.tvlUsd >= minTvl);

  if (pools.length === 0) {
    console.log(JSON.stringify({
      tool: "hodlmm-bin-clustering",
      command: "scan",
      timestamp: new Date().toISOString(),
      error: "No pools found above TVL threshold",
    }));
    return;
  }

  const poolResults: any[] = [];

  for (const pool of pools.slice(0, topN * 2)) {
    try {
      const activeBinId = pool.activeBinId || await getActiveBin(pool.poolId!);
      if (!activeBinId) continue;

      const radius = 15;
      const rawBins: BinReserves[] = [];
      for (let binId = activeBinId - radius; binId <= activeBinId + radius; binId++) {
        try {
          const result = await callReadOnly("get-bin", [uintCV(pool.poolId!), uintCV(binId)]);
          const parsed = parseUintResult(result);
          if (parsed > 0) {
            const priceSum = pool.token0PriceUsd + pool.token1PriceUsd + 0.001;
            const ratioX = pool.token0PriceUsd / priceSum;
            const reserveX = parsed * ratioX;
            const reserveY = parsed * (1 - ratioX);
            const reserveXUsd = (reserveX / Math.pow(10, pool.token0Decimals)) * pool.token0PriceUsd;
            const reserveYUsd = (reserveY / Math.pow(10, pool.token1Decimals)) * pool.token1PriceUsd;
            const totalUsd = reserveXUsd + reserveYUsd;
            const balanceRatio = totalUsd > 0 ? reserveXUsd / totalUsd : 0.5;
            rawBins.push({ binId, reserveX, reserveY, reserveXUsd, reserveYUsd, totalUsd, balanceRatio });
          } else {
            rawBins.push({ binId, reserveX: 0, reserveY: 0, reserveXUsd: 0, reserveYUsd: 0, totalUsd: 0, balanceRatio: 0.5 });
          }
        } catch {
          rawBins.push({ binId, reserveX: 0, reserveY: 0, reserveXUsd: 0, reserveYUsd: 0, totalUsd: 0, balanceRatio: 0.5 });
        }
      }

      const clusters = detectClusters(rawBins, activeBinId);
      const gaps = detectGaps(clusters);
      const binsPopulated = rawBins.filter((b) => b.totalUsd > 0).length;
      const concentrationScore = computeConcentration(clusters);

      poolResults.push({
        poolId: pool.poolId,
        pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
        tvlUsd: Math.round(pool.tvlUsd),
        volume24hUsd: Math.round(pool.volume24hUsd),
        clusterCount: clusters.length,
        pattern: classifyPattern(clusters),
        binsPopulated,
        populationRate: rawBins.length > 0 ? Math.round((binsPopulated / rawBins.length) * 100) : 0,
        concentrationScore,
        concentrationGrade: getConcentrationGrade(concentrationScore),
        hhi: computeHHI(clusters),
        gapCount: gaps.length,
        largestGap: gaps.length > 0 ? Math.max(...gaps.map((g) => g.width)) : 0,
        dominantClusterShare: clusters.length > 0 ? clusters[0].shareOfTotal : 0,
      });
    } catch { /* skip pool */ }
  }

  if (sortBy === "concentration") {
    poolResults.sort((a, b) => b.concentrationScore - a.concentrationScore);
  } else if (sortBy === "fragmentation") {
    poolResults.sort((a, b) => a.concentrationScore - b.concentrationScore);
  } else if (sortBy === "gaps") {
    poolResults.sort((a, b) => b.largestGap - a.largestGap);
  } else {
    poolResults.sort((a, b) => b.clusterCount - a.clusterCount);
  }

  const ranked = poolResults.slice(0, topN);

  const avgClusters = ranked.length > 0
    ? Math.round((ranked.reduce((s, p) => s + p.clusterCount, 0) / ranked.length) * 10) / 10
    : 0;
  const multiPeaks = ranked.filter((p) => p.pattern === "MULTI_PEAK" || p.pattern === "DISPERSED").length;
  const fragmented = ranked.filter((p) => p.concentrationGrade === "FRAGMENTED" || p.concentrationGrade === "SPREAD").length;

  console.log(JSON.stringify({
    tool: "hodlmm-bin-clustering",
    command: "scan",
    timestamp: new Date().toISOString(),
    poolsScanned: poolResults.length,
    sortedBy: sortBy,
    results: ranked,
    summary: {
      avgClusters,
      multiPeakPools: multiPeaks,
      fragmentedPools: fragmented,
      singlePeakPools: ranked.filter((p) => p.pattern === "SINGLE_PEAK").length,
    },
    guidance: multiPeaks > 0
      ? `${multiPeaks} pool(s) with multi-peak distributions — liquidity is split across distinct clusters. LPs should target the cluster containing the active bin.`
      : fragmented > 0
        ? `${fragmented} pool(s) with fragmented liquidity — wider LP ranges needed to capture fees across dispersed clusters.`
        : `Most pools show concentrated liquidity patterns (avg ${avgClusters} clusters). Tight LP ranges around the active bin should capture most fees.`,
  }, null, 2));
}

// ── CLI Setup ────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-bin-clustering")
  .description(
    "HODLMM Bin Clustering Analyzer — Identifies natural liquidity clusters, dead zones, and optimal LP ranges using density-based grouping"
  )
  .version("1.0.0");

program
  .command("doctor")
  .description("Check API connectivity and dependencies")
  .action(runDoctor);

program
  .command("install-packs")
  .description("Install dependencies (none required beyond workspace)")
  .action(runInstallPacks);

program
  .command("run")
  .description("Analyze liquidity cluster structure for a specific pool")
  .requiredOption("--pool <id>", "HODLMM pool ID")
  .action(runAnalyze);

program
  .command("scan")
  .description("Rank pools by cluster structure and fragmentation")
  .option("--top <n>", "Number of pools to show", "10")
  .option("--min-tvl <usd>", "Minimum TVL filter", String(MIN_TVL_USD))
  .option("--sort <by>", "Sort by: clusters, concentration, fragmentation, gaps", "clusters")
  .action(runScan);

program.parse();
