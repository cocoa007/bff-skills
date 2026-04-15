#!/usr/bin/env bun
/**
 * hodlmm-bin-catalysis.ts — Day 128 cocoa007 Bitflow Skills Comp
 *
 * Bin catalysis analyzer — identifies bins that act as catalysts,
 * amplifying liquidity concentration in their neighbors relative to
 * the broader pool distribution.
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
const CATALYST_RADIUS = 3;

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

interface CatalystBin {
  binId: number;
  selfUsd: number;
  neighborAvgUsd: number;
  poolAvgUsd: number;
  catalyticRatio: number;
  neighborEnhancement: number;
  radiusOfInfluence: number;
  catalystType: string;
}

interface CatalysisProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsAnalyzed: number;
  catalystBins: CatalystBin[];
  catalystCount: number;
  catalystDensity: number;
  avgCatalyticRatio: number;
  maxCatalyticRatio: number;
  neighborEnhancementAvg: number;
  catalystCoverage: number;
  catalystAsymmetry: number;
  catalystClustering: number;
  catalysisIndex: number;
  catalysisClass: string;
  catalysisRisk: string;
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

function analyzeCatalysis(bins: BinReserves[], pool: AppPool): CatalysisProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const poolAvgUsd = sorted.reduce((s, b) => s + b.totalUsd, 0) / n;
  const poolMedianUsd = sorted.map(b => b.totalUsd).sort((a, b) => a - b)[Math.floor(n / 2)];

  const catalystThreshold = poolAvgUsd * 1.5;
  const catalysts: CatalystBin[] = [];

  for (let i = 0; i < n; i++) {
    const bin = sorted[i];
    if (bin.totalUsd < catalystThreshold) continue;

    let neighborSum = 0;
    let neighborCount = 0;
    let maxInfluence = 0;

    for (let r = 1; r <= CATALYST_RADIUS; r++) {
      for (const dir of [-1, 1]) {
        const ni = i + dir * r;
        if (ni < 0 || ni >= n) continue;
        const neighbor = sorted[ni];
        if (sorted[ni].binId !== bin.binId + dir * r) continue;
        neighborSum += neighbor.totalUsd;
        neighborCount++;
        if (neighbor.totalUsd > poolAvgUsd * 0.8) {
          maxInfluence = Math.max(maxInfluence, r);
        }
      }
    }

    const neighborAvg = neighborCount > 0 ? neighborSum / neighborCount : 0;
    const catalyticRatio = bin.totalUsd / poolAvgUsd;
    const neighborEnhancement = neighborAvg / poolAvgUsd;

    let catalystType: string;
    if (neighborEnhancement > 1.5 && catalyticRatio > 3) {
      catalystType = "STRONG_CATALYST";
    } else if (neighborEnhancement > 1.0 && catalyticRatio > 2) {
      catalystType = "MODERATE_CATALYST";
    } else if (neighborEnhancement < 0.5 && catalyticRatio > 3) {
      catalystType = "ISOLATED_PEAK";
    } else if (neighborEnhancement > 1.2) {
      catalystType = "WEAK_CATALYST";
    } else {
      catalystType = "NON_CATALYTIC";
    }

    catalysts.push({
      binId: bin.binId,
      selfUsd: bin.totalUsd,
      neighborAvgUsd: neighborAvg,
      poolAvgUsd,
      catalyticRatio,
      neighborEnhancement,
      radiusOfInfluence: maxInfluence || 1,
      catalystType,
    });
  }

  const catalystCount = catalysts.filter(c => c.catalystType !== "NON_CATALYTIC" && c.catalystType !== "ISOLATED_PEAK").length;
  const catalystDensity = catalystCount / n;

  const avgCatalyticRatio = catalysts.length > 0
    ? catalysts.reduce((s, c) => s + c.catalyticRatio, 0) / catalysts.length
    : 0;
  const maxCatalyticRatio = catalysts.length > 0
    ? Math.max(...catalysts.map(c => c.catalyticRatio))
    : 0;
  const neighborEnhancementAvg = catalysts.length > 0
    ? catalysts.reduce((s, c) => s + c.neighborEnhancement, 0) / catalysts.length
    : 0;

  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const leftCatalysts = catalysts.filter(c => c.binId < activeBin).length;
  const rightCatalysts = catalysts.filter(c => c.binId > activeBin).length;
  const totalCat = leftCatalysts + rightCatalysts;
  const catalystAsymmetry = totalCat > 0 ? (rightCatalysts - leftCatalysts) / totalCat : 0;

  let catalystCoverage = 0;
  const influenceSet = new Set<number>();
  for (const cat of catalysts) {
    if (cat.catalystType === "NON_CATALYTIC" || cat.catalystType === "ISOLATED_PEAK") continue;
    for (let r = -cat.radiusOfInfluence; r <= cat.radiusOfInfluence; r++) {
      influenceSet.add(cat.binId + r);
    }
  }
  const coveredBins = sorted.filter(b => influenceSet.has(b.binId)).length;
  catalystCoverage = coveredBins / n;

  let catalystClustering = 0;
  const catBinIds = catalysts
    .filter(c => c.catalystType !== "NON_CATALYTIC" && c.catalystType !== "ISOLATED_PEAK")
    .map(c => c.binId)
    .sort((a, b) => a - b);
  if (catBinIds.length >= 2) {
    let adjacentPairs = 0;
    for (let i = 1; i < catBinIds.length; i++) {
      if (catBinIds[i] - catBinIds[i - 1] <= 2) adjacentPairs++;
    }
    catalystClustering = adjacentPairs / (catBinIds.length - 1);
  }

  const densityScore = Math.min(catalystDensity * 5, 1) * 25;
  const enhancementScore = Math.min(neighborEnhancementAvg / 2, 1) * 25;
  const coverageScore = catalystCoverage * 25;
  const ratioScore = Math.min(avgCatalyticRatio / 5, 1) * 25;
  const catalysisIndex = Math.round(densityScore + enhancementScore + coverageScore + ratioScore);

  let catalysisClass: string;
  if (catalysisIndex >= 75) catalysisClass = "HIGHLY_CATALYTIC";
  else if (catalysisIndex >= 50) catalysisClass = "CATALYTIC";
  else if (catalysisIndex >= 25) catalysisClass = "WEAKLY_CATALYTIC";
  else catalysisClass = "INERT";

  let catalysisRisk: string;
  if (maxCatalyticRatio > 5 && catalystCount <= 2 && catalystCoverage < 0.3) {
    catalysisRisk = "HIGH";
  } else if (maxCatalyticRatio > 3 && catalystCoverage < 0.5) {
    catalysisRisk = "MODERATE";
  } else if (catalysisIndex < 15) {
    catalysisRisk = "NONE";
  } else {
    catalysisRisk = "LOW";
  }

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin: activeBin,
    binsAnalyzed: n,
    catalystBins: catalysts.slice(0, 10),
    catalystCount,
    catalystDensity: Math.round(catalystDensity * 1000) / 1000,
    avgCatalyticRatio: Math.round(avgCatalyticRatio * 100) / 100,
    maxCatalyticRatio: Math.round(maxCatalyticRatio * 100) / 100,
    neighborEnhancementAvg: Math.round(neighborEnhancementAvg * 100) / 100,
    catalystCoverage: Math.round(catalystCoverage * 100) / 100,
    catalystAsymmetry: Math.round(catalystAsymmetry * 100) / 100,
    catalystClustering: Math.round(catalystClustering * 100) / 100,
    catalysisIndex,
    catalysisClass,
    catalysisRisk,
    tvlUsd: pool.tvlUsd,
  };
}

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Catalysis — Doctor ===\n");
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

  const profiles: CatalysisProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeCatalysis(bins, pool));
    } catch {
      continue;
    }
  }

  const summary = {
    poolsAnalyzed: profiles.length,
    avgCatalysisIndex: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + p.catalysisIndex, 0) / profiles.length) * 10) / 10
      : 0,
    highCatalyticCount: profiles.filter((p) => p.catalysisClass === "HIGHLY_CATALYTIC").length,
    catalyticCount: profiles.filter((p) => p.catalysisClass === "CATALYTIC").length,
    weaklyCatalyticCount: profiles.filter((p) => p.catalysisClass === "WEAKLY_CATALYTIC").length,
    inertCount: profiles.filter((p) => p.catalysisClass === "INERT").length,
    noneCount: profiles.filter((p) => p.catalysisRisk === "NONE").length,
    lowCount: profiles.filter((p) => p.catalysisRisk === "LOW").length,
    moderateCount: profiles.filter((p) => p.catalysisRisk === "MODERATE").length,
    highCount: profiles.filter((p) => p.catalysisRisk === "HIGH").length,
    avgCatalystDensity: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + p.catalystDensity, 0) / profiles.length) * 1000) / 1000
      : 0,
    avgCatalystCoverage: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + p.catalystCoverage, 0) / profiles.length) * 100) / 100
      : 0,
    avgNeighborEnhancement: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + p.neighborEnhancementAvg, 0) / profiles.length) * 100) / 100
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-catalysis").description("HODLMM bin catalysis analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin catalysis")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
