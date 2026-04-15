#!/usr/bin/env bun
/**
 * hodlmm-bin-percolation.ts — Day 138 cocoa007 Bitflow Skills Comp
 *
 * Percolation analyzer — measures how effectively liquidity percolates through
 * the HODLMM bin lattice, detecting connectivity thresholds, bottlenecks,
 * backbone paths, and flow continuity.
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

interface Cluster {
  startBin: number;
  endBin: number;
  length: number;
  totalUsd: number;
  avgUsd: number;
  minUsd: number;
  containsActiveBin: boolean;
}

interface Bottleneck {
  binId: number;
  reserveUsd: number;
  leftNeighborUsd: number;
  rightNeighborUsd: number;
  constrictionRatio: number;
  position: string;
}

interface PercolationProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  siteOccupancy: number;
  clusterCount: number;
  largestClusterSize: number;
  largestClusterRatio: number;
  spanningCluster: boolean;
  percolationProbability: number;
  backboneLength: number;
  backboneRatio: number;
  backboneDensity: number;
  deadEndCount: number;
  deadEndRatio: number;
  bottleneckCount: number;
  worstBottleneckRatio: number;
  avgBondStrength: number;
  minBondStrength: number;
  bondVariance: number;
  tortuosity: number;
  flowConductance: number;
  criticalBinCount: number;
  criticalBinFraction: number;
  activeBinConnected: boolean;
  activeBinClusterSize: number;
  percolationLength: number;
  correlationLength: number;
  concentrationGini: number;
  percolationIndex: number;
  percolationClass: string;
  flowVerdict: string;
  clusters: Cluster[];
  bottlenecks: Bottleneck[];
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

function analyzePercolation(bins: BinReserves[], pool: AppPool): PercolationProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;

  const populatedSet = new Set(sorted.map((b) => b.binId));
  const siteOccupancy = r4(n / binsScanned);

  // Cluster detection
  const clusters: Cluster[] = [];
  let segStart = 0;
  for (let i = 1; i <= sorted.length; i++) {
    if (i === sorted.length || sorted[i].binId - sorted[i - 1].binId > 1) {
      const seg = sorted.slice(segStart, i);
      const segTotal = seg.reduce((s, b) => s + b.totalUsd, 0);
      const segMin = Math.min(...seg.map((b) => b.totalUsd));
      const containsActive = seg.some((b) => b.binId === activeBin);
      clusters.push({
        startBin: seg[0].binId,
        endBin: seg[seg.length - 1].binId,
        length: seg.length,
        totalUsd: r2(segTotal),
        avgUsd: r2(segTotal / seg.length),
        minUsd: r2(segMin),
        containsActiveBin: containsActive,
      });
      segStart = i;
    }
  }

  const clusterCount = clusters.length;
  const largestCluster = clusters.reduce((max, c) => c.length > max.length ? c : max, clusters[0]);
  const largestClusterSize = largestCluster.length;
  const largestClusterRatio = r4(largestClusterSize / n);

  const minBin = activeBin - BIN_SCAN_RADIUS;
  const maxBin = activeBin + BIN_SCAN_RADIUS;
  const spanningCluster = clusters.some(
    (c) => c.startBin <= minBin + 2 && c.endBin >= maxBin - 2
  );

  // Percolation probability: fraction of adjacent bin pairs that are both populated
  let connectedPairs = 0;
  let totalPairsChecked = 0;
  for (let bid = minBin; bid < maxBin; bid++) {
    totalPairsChecked++;
    if (populatedSet.has(bid) && populatedSet.has(bid + 1)) {
      connectedPairs++;
    }
  }
  const percolationProbability = totalPairsChecked > 0
    ? r4(connectedPairs / totalPairsChecked)
    : 0;

  // Backbone: the longest contiguous path (the largest cluster)
  const backboneLength = largestClusterSize;
  const backboneRatio = n > 0 ? r4(backboneLength / n) : 0;
  const backboneDensity = backboneLength > 0
    ? r2(largestCluster.totalUsd / backboneLength)
    : 0;

  // Dead ends: clusters of size 1 (isolated bins with no neighbors)
  const deadEndCount = clusters.filter((c) => c.length === 1).length;
  const deadEndRatio = n > 0 ? r4(deadEndCount / n) : 0;

  // Bond strength: reserve ratio between adjacent populated bins
  const bondStrengths: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].binId - sorted[i - 1].binId === 1) {
      const minR = Math.min(sorted[i].totalUsd, sorted[i - 1].totalUsd);
      const maxR = Math.max(sorted[i].totalUsd, sorted[i - 1].totalUsd);
      bondStrengths.push(maxR > 0 ? minR / maxR : 0);
    }
  }
  const avgBondStrength = bondStrengths.length > 0
    ? r4(bondStrengths.reduce((s, v) => s + v, 0) / bondStrengths.length)
    : 0;
  const minBondStrength = bondStrengths.length > 0
    ? r4(Math.min(...bondStrengths))
    : 0;
  const bondMean = avgBondStrength;
  const bondVariance = bondStrengths.length > 0
    ? r4(bondStrengths.reduce((s, v) => s + (v - bondMean) ** 2, 0) / bondStrengths.length)
    : 0;

  // Bottleneck detection: populated bins where reserves are much lower than neighbors
  const bottlenecks: Bottleneck[] = [];
  for (let i = 1; i < sorted.length - 1; i++) {
    if (sorted[i].binId - sorted[i - 1].binId === 1 && sorted[i + 1].binId - sorted[i].binId === 1) {
      const leftUsd = sorted[i - 1].totalUsd;
      const rightUsd = sorted[i + 1].totalUsd;
      const centerUsd = sorted[i].totalUsd;
      const neighborAvg = (leftUsd + rightUsd) / 2;
      if (neighborAvg > 0 && centerUsd < neighborAvg * 0.3) {
        const gapCenter = sorted[i].binId;
        let position: string;
        if (gapCenter < activeBin - 5) position = "LEFT";
        else if (gapCenter > activeBin + 5) position = "RIGHT";
        else position = "CENTER";
        bottlenecks.push({
          binId: sorted[i].binId,
          reserveUsd: r2(centerUsd),
          leftNeighborUsd: r2(leftUsd),
          rightNeighborUsd: r2(rightUsd),
          constrictionRatio: r4(centerUsd / neighborAvg),
          position,
        });
      }
    }
  }
  bottlenecks.sort((a, b) => a.constrictionRatio - b.constrictionRatio);
  const bottleneckCount = bottlenecks.length;
  const worstBottleneckRatio = bottlenecks.length > 0
    ? bottlenecks[0].constrictionRatio
    : 1;

  // Tortuosity: ratio of actual percolation path to straight-line distance
  const percolationLength = backboneLength;
  const straightLineDistance = largestCluster
    ? largestCluster.endBin - largestCluster.startBin + 1
    : 0;
  const tortuosity = straightLineDistance > 0
    ? r4(percolationLength / straightLineDistance)
    : 0;

  // Flow conductance: combines occupancy, bond strength, and bottleneck-free fraction
  const bottleneckFreeFraction = n > 0 ? Math.max(0, 1 - bottleneckCount / n) : 0;
  const flowConductance = r4(
    siteOccupancy * 0.3 + avgBondStrength * 0.3 + backboneRatio * 0.2 + bottleneckFreeFraction * 0.2
  );

  // Critical bins: bins whose removal would split their cluster
  let criticalBinCount = 0;
  for (const cluster of clusters) {
    if (cluster.length <= 2) continue;
    const clusterBins = sorted.filter(
      (b) => b.binId >= cluster.startBin && b.binId <= cluster.endBin
    );
    for (let i = 1; i < clusterBins.length - 1; i++) {
      if (
        clusterBins[i].binId - clusterBins[i - 1].binId === 1 &&
        clusterBins[i + 1].binId - clusterBins[i].binId === 1
      ) {
        criticalBinCount++;
      }
    }
  }
  const criticalBinFraction = n > 0 ? r4(criticalBinCount / n) : 0;

  // Active bin connectivity
  const activeCluster = clusters.find((c) => c.containsActiveBin);
  const activeBinConnected = !!activeCluster;
  const activeBinClusterSize = activeCluster ? activeCluster.length : 0;

  // Correlation length: average cluster size weighted by size
  const totalClusterSquared = clusters.reduce((s, c) => s + c.length * c.length, 0);
  const totalClusterLen = clusters.reduce((s, c) => s + c.length, 0);
  const correlationLength = totalClusterLen > 0
    ? r4(totalClusterSquared / totalClusterLen)
    : 0;

  // Gini coefficient
  const reserves = sorted.map((b) => b.totalUsd);
  const sortedReserves = [...reserves].sort((a, b) => a - b);
  let giniNum = 0;
  for (let i = 0; i < sortedReserves.length; i++) {
    giniNum += (2 * (i + 1) - sortedReserves.length - 1) * sortedReserves[i];
  }
  const giniDenom = sortedReserves.length * sortedReserves.reduce((s, v) => s + v, 0);
  const concentrationGini = giniDenom > 0 ? r4(giniNum / giniDenom) : 0;

  // Composite percolation index
  const occupancyScore = Math.min(25, siteOccupancy * 25);
  const connectivityScore = Math.min(25, backboneRatio * 25);
  const bondScore = Math.min(25, avgBondStrength * 25);
  const conductanceScore = Math.min(25, flowConductance * 25);
  const percolationIndex = Math.round(
    Math.min(100, occupancyScore + connectivityScore + bondScore + conductanceScore)
  );

  let percolationClass: string;
  if (percolationIndex >= 80) percolationClass = "SUPERCRITICAL";
  else if (percolationIndex >= 60) percolationClass = "CRITICAL";
  else if (percolationIndex >= 40) percolationClass = "SUBCRITICAL";
  else if (percolationIndex >= 20) percolationClass = "DISCONNECTED";
  else percolationClass = "IMPERMEABLE";

  let flowVerdict: string;
  if (spanningCluster && avgBondStrength > 0.5) flowVerdict = "FREE_FLOW";
  else if (spanningCluster && avgBondStrength > 0.2) flowVerdict = "CONSTRICTED";
  else if (backboneRatio > 0.5) flowVerdict = "PARTIAL";
  else if (clusterCount <= 3) flowVerdict = "FRAGMENTED";
  else flowVerdict = "BLOCKED";

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    siteOccupancy,
    clusterCount,
    largestClusterSize,
    largestClusterRatio,
    spanningCluster,
    percolationProbability,
    backboneLength,
    backboneRatio,
    backboneDensity,
    deadEndCount,
    deadEndRatio,
    bottleneckCount,
    worstBottleneckRatio,
    avgBondStrength,
    minBondStrength,
    bondVariance,
    tortuosity,
    flowConductance,
    criticalBinCount,
    criticalBinFraction,
    activeBinConnected,
    activeBinClusterSize,
    percolationLength,
    correlationLength,
    concentrationGini,
    percolationIndex,
    percolationClass,
    flowVerdict,
    clusters: clusters.slice(0, 10),
    bottlenecks: bottlenecks.slice(0, 10),
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Percolation — Doctor ===\n");
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

  const profiles: PercolationProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzePercolation(bins, pool));
    } catch {
      continue;
    }
  }

  const summary = {
    poolsAnalyzed: profiles.length,
    avgPercolationIndex: profiles.length > 0
      ? r2(profiles.reduce((s, p) => s + p.percolationIndex, 0) / profiles.length)
      : 0,
    supercriticalCount: profiles.filter((p) => p.percolationClass === "SUPERCRITICAL").length,
    criticalCount: profiles.filter((p) => p.percolationClass === "CRITICAL").length,
    subcriticalCount: profiles.filter((p) => p.percolationClass === "SUBCRITICAL").length,
    disconnectedCount: profiles.filter((p) => p.percolationClass === "DISCONNECTED").length,
    impermeableCount: profiles.filter((p) => p.percolationClass === "IMPERMEABLE").length,
    avgSiteOccupancy: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.siteOccupancy, 0) / profiles.length)
      : 0,
    avgBondStrength: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.avgBondStrength, 0) / profiles.length)
      : 0,
    avgFlowConductance: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.flowConductance, 0) / profiles.length)
      : 0,
    avgGini: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.concentrationGini, 0) / profiles.length)
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-percolation").description("HODLMM bin percolation analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin percolation")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
