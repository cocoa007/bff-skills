#!/usr/bin/env bun
/**
 * hodlmm-bin-nucleation.ts — Day 129 cocoa007 Bitflow Skills Comp
 *
 * Nucleation site detector — identifies seed bins where liquidity
 * clusters spontaneously form and measures growth gradients around them.
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
const GROWTH_SCAN_RADIUS = 4;
const SEED_THRESHOLD_MULTIPLIER = 1.8;

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

interface NucleationSeed {
  binId: number;
  seedUsd: number;
  localContrast: number;
  growthGradientLeft: number;
  growthGradientRight: number;
  growthSymmetry: number;
  clusterSize: number;
  clusterUsd: number;
  maturity: string;
  criticalMass: boolean;
}

interface NucleationProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsAnalyzed: number;
  seeds: NucleationSeed[];
  seedCount: number;
  seedDensity: number;
  avgLocalContrast: number;
  maxLocalContrast: number;
  avgGrowthGradient: number;
  nucleationBarrier: number;
  clusterCoverage: number;
  matureSeeds: number;
  nascentSeeds: number;
  nucleationAsymmetry: number;
  nucleationIndex: number;
  nucleationClass: string;
  nucleationRisk: string;
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

function computeGrowthGradient(
  sorted: BinReserves[],
  seedIdx: number,
  direction: -1 | 1
): number {
  const seedBin = sorted[seedIdx];
  let totalDecay = 0;
  let steps = 0;

  for (let r = 1; r <= GROWTH_SCAN_RADIUS; r++) {
    const ni = seedIdx + direction * r;
    if (ni < 0 || ni >= sorted.length) break;
    if (sorted[ni].binId !== seedBin.binId + direction * r) break;
    const ratio = sorted[ni].totalUsd / seedBin.totalUsd;
    totalDecay += ratio / r;
    steps++;
  }

  return steps > 0 ? totalDecay / steps : 0;
}

function analyzeNucleation(bins: BinReserves[], pool: AppPool): NucleationProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const poolAvgUsd = sorted.reduce((s, b) => s + b.totalUsd, 0) / n;
  const nucleationBarrier = poolAvgUsd * SEED_THRESHOLD_MULTIPLIER;

  const seeds: NucleationSeed[] = [];
  const binMap = new Map<number, number>();
  sorted.forEach((b, i) => binMap.set(b.binId, i));

  for (let i = 0; i < n; i++) {
    const bin = sorted[i];
    if (bin.totalUsd < nucleationBarrier) continue;

    let isLocalMax = true;
    for (const dir of [-1, 1]) {
      const ni = binMap.get(bin.binId + dir);
      if (ni !== undefined && sorted[ni].totalUsd > bin.totalUsd) {
        isLocalMax = false;
        break;
      }
    }
    if (!isLocalMax) continue;

    let immediateSum = 0;
    let immediateCount = 0;
    for (const dir of [-1, 1]) {
      const ni = binMap.get(bin.binId + dir);
      if (ni !== undefined) {
        immediateSum += sorted[ni].totalUsd;
        immediateCount++;
      }
    }
    const immediateAvg = immediateCount > 0 ? immediateSum / immediateCount : 0;
    const localContrast = immediateAvg > 0 ? bin.totalUsd / immediateAvg : bin.totalUsd / poolAvgUsd;

    const gradientLeft = computeGrowthGradient(sorted, i, -1);
    const gradientRight = computeGrowthGradient(sorted, i, 1);
    const avgGradient = (gradientLeft + gradientRight) / 2;
    const maxGrad = Math.max(gradientLeft, gradientRight);
    const minGrad = Math.min(gradientLeft, gradientRight);
    const growthSymmetry = maxGrad > 0 ? minGrad / maxGrad : 0;

    let clusterSize = 1;
    let clusterUsd = bin.totalUsd;
    for (const dir of [-1, 1] as const) {
      for (let r = 1; r <= GROWTH_SCAN_RADIUS; r++) {
        const ni = binMap.get(bin.binId + dir * r);
        if (ni === undefined) break;
        if (sorted[ni].totalUsd < poolAvgUsd * 0.5) break;
        clusterSize++;
        clusterUsd += sorted[ni].totalUsd;
      }
    }

    let maturity: string;
    if (clusterSize >= 7 && avgGradient > 0.3) {
      maturity = "MATURE";
    } else if (clusterSize >= 4 && avgGradient > 0.15) {
      maturity = "GROWING";
    } else if (clusterSize >= 2) {
      maturity = "NASCENT";
    } else {
      maturity = "EMBRYONIC";
    }

    const criticalMass = bin.totalUsd > poolAvgUsd * 3 && clusterSize >= 3;

    seeds.push({
      binId: bin.binId,
      seedUsd: bin.totalUsd,
      localContrast: Math.round(localContrast * 100) / 100,
      growthGradientLeft: Math.round(gradientLeft * 1000) / 1000,
      growthGradientRight: Math.round(gradientRight * 1000) / 1000,
      growthSymmetry: Math.round(growthSymmetry * 100) / 100,
      clusterSize,
      clusterUsd: Math.round(clusterUsd * 100) / 100,
      maturity,
      criticalMass,
    });
  }

  const seedCount = seeds.length;
  const seedDensity = seedCount / n;
  const avgLocalContrast = seedCount > 0
    ? seeds.reduce((s, sd) => s + sd.localContrast, 0) / seedCount
    : 0;
  const maxLocalContrast = seedCount > 0
    ? Math.max(...seeds.map(sd => sd.localContrast))
    : 0;
  const avgGrowthGradient = seedCount > 0
    ? seeds.reduce((s, sd) => s + (sd.growthGradientLeft + sd.growthGradientRight) / 2, 0) / seedCount
    : 0;

  const clusterBins = new Set<number>();
  for (const seed of seeds) {
    for (let r = -Math.floor(seed.clusterSize / 2); r <= Math.floor(seed.clusterSize / 2); r++) {
      clusterBins.add(seed.binId + r);
    }
  }
  const coveredBinCount = sorted.filter(b => clusterBins.has(b.binId)).length;
  const clusterCoverage = coveredBinCount / n;

  const matureSeeds = seeds.filter(s => s.maturity === "MATURE" || s.maturity === "GROWING").length;
  const nascentSeeds = seeds.filter(s => s.maturity === "NASCENT" || s.maturity === "EMBRYONIC").length;

  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const leftSeeds = seeds.filter(s => s.binId < activeBin).length;
  const rightSeeds = seeds.filter(s => s.binId > activeBin).length;
  const totalSeeds = leftSeeds + rightSeeds;
  const nucleationAsymmetry = totalSeeds > 0 ? (rightSeeds - leftSeeds) / totalSeeds : 0;

  const densityScore = Math.min(seedDensity * 6, 1) * 20;
  const contrastScore = Math.min(avgLocalContrast / 4, 1) * 20;
  const gradientScore = Math.min(avgGrowthGradient / 0.5, 1) * 20;
  const coverageScore = clusterCoverage * 20;
  const maturityScore = (matureSeeds / Math.max(seedCount, 1)) * 20;
  const nucleationIndex = Math.round(densityScore + contrastScore + gradientScore + coverageScore + maturityScore);

  let nucleationClass: string;
  if (nucleationIndex >= 75) nucleationClass = "FULLY_NUCLEATED";
  else if (nucleationIndex >= 50) nucleationClass = "CRYSTALLIZING";
  else if (nucleationIndex >= 25) nucleationClass = "SEEDED";
  else nucleationClass = "SUPERCOOLED";

  let nucleationRisk: string;
  if (seedCount <= 1 && maxLocalContrast > 5) {
    nucleationRisk = "HIGH";
  } else if (seedCount <= 2 && clusterCoverage < 0.3) {
    nucleationRisk = "MODERATE";
  } else if (nucleationIndex < 15) {
    nucleationRisk = "NONE";
  } else {
    nucleationRisk = "LOW";
  }

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsAnalyzed: n,
    seeds: seeds.slice(0, 10),
    seedCount,
    seedDensity: Math.round(seedDensity * 1000) / 1000,
    avgLocalContrast: Math.round(avgLocalContrast * 100) / 100,
    maxLocalContrast: Math.round(maxLocalContrast * 100) / 100,
    avgGrowthGradient: Math.round(avgGrowthGradient * 1000) / 1000,
    nucleationBarrier: Math.round(nucleationBarrier * 100) / 100,
    clusterCoverage: Math.round(clusterCoverage * 100) / 100,
    matureSeeds,
    nascentSeeds,
    nucleationAsymmetry: Math.round(nucleationAsymmetry * 100) / 100,
    nucleationIndex,
    nucleationClass,
    nucleationRisk,
    tvlUsd: pool.tvlUsd,
  };
}

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Nucleation — Doctor ===\n");
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

  const profiles: NucleationProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeNucleation(bins, pool));
    } catch {
      continue;
    }
  }

  const summary = {
    poolsAnalyzed: profiles.length,
    avgNucleationIndex: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + p.nucleationIndex, 0) / profiles.length) * 10) / 10
      : 0,
    fullyNucleatedCount: profiles.filter((p) => p.nucleationClass === "FULLY_NUCLEATED").length,
    crystallizingCount: profiles.filter((p) => p.nucleationClass === "CRYSTALLIZING").length,
    seededCount: profiles.filter((p) => p.nucleationClass === "SEEDED").length,
    supercooledCount: profiles.filter((p) => p.nucleationClass === "SUPERCOOLED").length,
    noneCount: profiles.filter((p) => p.nucleationRisk === "NONE").length,
    lowCount: profiles.filter((p) => p.nucleationRisk === "LOW").length,
    moderateCount: profiles.filter((p) => p.nucleationRisk === "MODERATE").length,
    highCount: profiles.filter((p) => p.nucleationRisk === "HIGH").length,
    avgSeedDensity: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + p.seedDensity, 0) / profiles.length) * 1000) / 1000
      : 0,
    avgClusterCoverage: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + p.clusterCoverage, 0) / profiles.length) * 100) / 100
      : 0,
    totalMatureSeeds: profiles.reduce((s, p) => s + p.matureSeeds, 0),
    totalNascentSeeds: profiles.reduce((s, p) => s + p.nascentSeeds, 0),
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-nucleation").description("HODLMM bin nucleation site detector");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Detect nucleation sites")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
