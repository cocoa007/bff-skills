#!/usr/bin/env bun
/**
 * hodlmm-bin-desorption.ts — Day 151 cocoa007 Bitflow Skills Comp
 *
 * Desorption analyzer — models the detachment of reserve "molecules"
 * from bin surfaces. Arrhenius kinetics: desorption rate depends on
 * binding energy, surface coverage, and thermal activation from volume.
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

interface BinDesorption {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  surfaceCoverage: number;
  bindingEnergy: number;
  desorptionEnergy: number;
  desorptionRate: number;
  stickingCoefficient: number;
  surfaceFlux: number;
  desorptionOrder: number;
  activationBarrier: number;
  thermalDesorption: number;
  preExponentialFactor: number;
  coverageDecay: number;
  readsorptionRate: number;
  surfaceLifetime: number;
  desorptionFlux: number;
}

interface DesorptionProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgSurfaceCoverage: number;
  maxSurfaceCoverage: number;
  avgBindingEnergy: number;
  maxBindingEnergy: number;
  avgDesorptionEnergy: number;
  minDesorptionEnergy: number;
  avgDesorptionRate: number;
  maxDesorptionRate: number;
  avgStickingCoefficient: number;
  minStickingCoefficient: number;
  avgSurfaceFlux: number;
  maxSurfaceFlux: number;
  avgDesorptionOrder: number;
  avgActivationBarrier: number;
  minActivationBarrier: number;
  avgThermalDesorption: number;
  maxThermalDesorption: number;
  avgPreExponentialFactor: number;
  avgCoverageDecay: number;
  maxCoverageDecay: number;
  avgReadsorptionRate: number;
  maxReadsorptionRate: number;
  avgSurfaceLifetime: number;
  minSurfaceLifetime: number;
  avgDesorptionFlux: number;
  maxDesorptionFlux: number;
  highDesorptionCount: number;
  highDesorptionFraction: number;
  chemisorbedCount: number;
  chemisorbedFraction: number;
  desorptionGini: number;
  desorptionIndex: number;
  desorptionPhase: string;
  desorptionVerdict: string;
  topBins: BinDesorption[];
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

function computeBinDesorption(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  maxReserve: number
): BinDesorption {
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
  const neighborMax = neighbors.length > 0
    ? Math.max(...neighbors.map((b) => b.totalUsd))
    : 0;

  // 1. surfaceCoverage — fraction of bin capacity occupied (Langmuir theta)
  const surfaceCoverage = r4(
    Math.min(1, reserveFraction)
  );

  // 2. bindingEnergy — strength of reserve attachment to this bin surface
  // Fee generation and proximity to active bin create binding energy
  const feeAttraction = volumeRatio * Math.max(0, 1 - distance * 0.08);
  const neighborCohesion = neighborAvg / (maxReserve || 1);
  const bindingEnergy = r4(
    Math.min(10, (feeAttraction * 5 + neighborCohesion * 3 + surfaceCoverage * 2))
  );

  // 3. desorptionEnergy — activation energy barrier for reserve detachment
  // Higher for bins with deep reserves surrounded by dense neighbors
  const desorptionEnergy = r4(
    Math.min(10, bindingEnergy * (1 + surfaceCoverage * 0.5) * (1 + neighborCohesion * 0.3))
  );

  // 4. desorptionRate — Arrhenius: rate = A * exp(-Ea / kT)
  // Temperature (kT) comes from trading volume
  const kT = Math.max(0.01, volumeRatio * 2);
  const arrheniusExponent = desorptionEnergy > 0 ? -desorptionEnergy / (kT + 0.01) : 0;
  const rawRate = Math.exp(Math.max(-20, arrheniusExponent));
  const desorptionRate = r4(
    Math.min(1, rawRate * (1 + distance * 0.03))
  );

  // 5. stickingCoefficient — probability reserves remain adsorbed on arrival
  // High near active bin, decays with distance and existing coverage
  const stickingCoefficient = r4(
    Math.min(1, Math.max(0, (1 - surfaceCoverage * 0.4) * Math.exp(-distance * 0.1) * (1 + feeAttraction * 0.3)))
  );

  // 6. surfaceFlux — rate of reserves arriving at the bin surface
  const surfaceFlux = r4(
    Math.min(1, volumeRatio * (1 - distance * 0.02) * (1 - surfaceCoverage * 0.3) * 0.5)
  );

  // 7. desorptionOrder — first-order (1.0, random exits) to zero-order (0.0, steady drain)
  // Coverage-dependent: high coverage = zero-order, low coverage = first-order
  const desorptionOrder = r4(
    Math.min(2, 1.0 + (1 - surfaceCoverage) * 0.5 - neighborCohesion * 0.3)
  );

  // 8. activationBarrier — energy gap between adsorbed and free states
  const activationBarrier = r4(
    Math.min(10, desorptionEnergy - kT * 0.5)
  );

  // 9. thermalDesorption — volume-driven reserve release (temperature-programmed desorption)
  const thermalDesorption = r4(
    Math.min(1, desorptionRate * volumeRatio * (1 + (1 - surfaceCoverage) * 0.5))
  );

  // 10. preExponentialFactor — frequency factor in Arrhenius (attempt frequency)
  const preExponentialFactor = r4(
    Math.min(10, n * 0.1 * (1 + volumeRatio) * (1 + distance * 0.02))
  );

  // 11. coverageDecay — rate at which surface coverage decreases
  const coverageDecay = r4(
    Math.min(1, desorptionRate * surfaceCoverage * (1 - stickingCoefficient * surfaceFlux))
  );

  // 12. readsorptionRate — rate at which desorbed reserves return to the bin
  const readsorptionRate = r4(
    Math.min(1, stickingCoefficient * surfaceFlux * (1 - surfaceCoverage) * (1 + neighborCohesion * 0.5))
  );

  // 13. surfaceLifetime — average time reserves spend adsorbed
  const surfaceLifetime = r4(
    desorptionRate > 0.001
      ? Math.min(100, (1 / desorptionRate) * (1 + bindingEnergy * 0.3))
      : 100
  );

  // 14. desorptionFlux — mass flow of reserves leaving per unit time
  const desorptionFlux = r4(
    Math.min(1, desorptionRate * surfaceCoverage * (1 + (activationBarrier < kT ? 0.5 : 0)))
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    surfaceCoverage,
    bindingEnergy,
    desorptionEnergy,
    desorptionRate,
    stickingCoefficient,
    surfaceFlux,
    desorptionOrder,
    activationBarrier,
    thermalDesorption,
    preExponentialFactor,
    coverageDecay,
    readsorptionRate,
    surfaceLifetime,
    desorptionFlux,
  };
}

function analyzeDesorption(bins: BinReserves[], pool: AppPool): DesorptionProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));

  const binDes = sorted.map((b) =>
    computeBinDesorption(b, activeBin, sorted, totalUsd, volume, maxReserve)
  );

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgSurfaceCoverage = r4(avg(binDes.map((b) => b.surfaceCoverage)));
  const maxSurfaceCoverage = r4(Math.max(...binDes.map((b) => b.surfaceCoverage)));
  const avgBindingEnergy = r4(avg(binDes.map((b) => b.bindingEnergy)));
  const maxBindingEnergy = r4(Math.max(...binDes.map((b) => b.bindingEnergy)));
  const avgDesorptionEnergy = r4(avg(binDes.map((b) => b.desorptionEnergy)));
  const minDesorptionEnergy = r4(Math.min(...binDes.map((b) => b.desorptionEnergy)));
  const avgDesorptionRate = r4(avg(binDes.map((b) => b.desorptionRate)));
  const maxDesorptionRate = r4(Math.max(...binDes.map((b) => b.desorptionRate)));
  const avgStickingCoefficient = r4(avg(binDes.map((b) => b.stickingCoefficient)));
  const minStickingCoefficient = r4(Math.min(...binDes.map((b) => b.stickingCoefficient)));
  const avgSurfaceFlux = r4(avg(binDes.map((b) => b.surfaceFlux)));
  const maxSurfaceFlux = r4(Math.max(...binDes.map((b) => b.surfaceFlux)));
  const avgDesorptionOrder = r4(avg(binDes.map((b) => b.desorptionOrder)));
  const avgActivationBarrier = r4(avg(binDes.map((b) => b.activationBarrier)));
  const minActivationBarrier = r4(Math.min(...binDes.map((b) => b.activationBarrier)));
  const avgThermalDesorption = r4(avg(binDes.map((b) => b.thermalDesorption)));
  const maxThermalDesorption = r4(Math.max(...binDes.map((b) => b.thermalDesorption)));
  const avgPreExponentialFactor = r4(avg(binDes.map((b) => b.preExponentialFactor)));
  const avgCoverageDecay = r4(avg(binDes.map((b) => b.coverageDecay)));
  const maxCoverageDecay = r4(Math.max(...binDes.map((b) => b.coverageDecay)));
  const avgReadsorptionRate = r4(avg(binDes.map((b) => b.readsorptionRate)));
  const maxReadsorptionRate = r4(Math.max(...binDes.map((b) => b.readsorptionRate)));
  const avgSurfaceLifetime = r4(avg(binDes.map((b) => b.surfaceLifetime)));
  const minSurfaceLifetime = r4(Math.min(...binDes.map((b) => b.surfaceLifetime)));
  const avgDesorptionFlux = r4(avg(binDes.map((b) => b.desorptionFlux)));
  const maxDesorptionFlux = r4(Math.max(...binDes.map((b) => b.desorptionFlux)));
  const highDesorptionCount = binDes.filter((b) => b.desorptionRate > 0.3).length;
  const highDesorptionFraction = r4(highDesorptionCount / n);
  const chemisorbedCount = binDes.filter((b) => b.desorptionRate < 0.05).length;
  const chemisorbedFraction = r4(chemisorbedCount / n);

  // Gini coefficient on desorption rates
  const rates = binDes.map((b) => b.desorptionRate);
  const sortedRates = [...rates].sort((a, b) => b - a);
  const totalRates = sortedRates.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedRates[i];
  }
  const desorptionGini = totalRates > 0
    ? r4(Math.abs(giniSum) / (n * totalRates))
    : 0;

  // Composite desorption index (0-100)
  const rateScore = Math.min(25, avgDesorptionRate * 50);
  const fluxScore = Math.min(25, avgDesorptionFlux * 50);
  const thermalScore = Math.min(25, avgThermalDesorption * 50);
  const decayScore = Math.min(25, avgCoverageDecay * 50);
  const desorptionIndex = Math.round(
    Math.min(100, rateScore + fluxScore + thermalScore + decayScore)
  );

  let desorptionPhase: string;
  if (desorptionIndex >= 80) desorptionPhase = "FLASH_DESORPTION";
  else if (desorptionIndex >= 60) desorptionPhase = "THERMAL_DESORPTION";
  else if (desorptionIndex >= 40) desorptionPhase = "ACTIVATED_DESORPTION";
  else if (desorptionIndex >= 20) desorptionPhase = "PHYSISORPTION";
  else desorptionPhase = "CHEMISORPTION";

  let desorptionVerdict: string;
  if (highDesorptionFraction > 0.4 && avgCoverageDecay > 0.2)
    desorptionVerdict = "SURFACE_AVALANCHE";
  else if (highDesorptionFraction < 0.15 && maxDesorptionRate > 0.5)
    desorptionVerdict = "SELECTIVE_DESORPTION";
  else if (avgReadsorptionRate > 0.1 && Math.abs(avgDesorptionRate - avgReadsorptionRate) < 0.1)
    desorptionVerdict = "DYNAMIC_EQUILIBRIUM";
  else if (chemisorbedFraction > 0.7)
    desorptionVerdict = "MONOLAYER_LOCK";
  else if (avgSurfaceCoverage > 0.7 && avgDesorptionOrder < 0.5)
    desorptionVerdict = "MULTILAYER_DRAIN";
  else
    desorptionVerdict = "DYNAMIC_EQUILIBRIUM";

  const topBins = [...binDes]
    .sort((a, b) => b.desorptionRate - a.desorptionRate)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgSurfaceCoverage,
    maxSurfaceCoverage,
    avgBindingEnergy,
    maxBindingEnergy,
    avgDesorptionEnergy,
    minDesorptionEnergy,
    avgDesorptionRate,
    maxDesorptionRate,
    avgStickingCoefficient,
    minStickingCoefficient,
    avgSurfaceFlux,
    maxSurfaceFlux,
    avgDesorptionOrder,
    avgActivationBarrier,
    minActivationBarrier,
    avgThermalDesorption,
    maxThermalDesorption,
    avgPreExponentialFactor,
    avgCoverageDecay,
    maxCoverageDecay,
    avgReadsorptionRate,
    maxReadsorptionRate,
    avgSurfaceLifetime,
    minSurfaceLifetime,
    avgDesorptionFlux,
    maxDesorptionFlux,
    highDesorptionCount,
    highDesorptionFraction,
    chemisorbedCount,
    chemisorbedFraction,
    desorptionGini,
    desorptionIndex,
    desorptionPhase,
    desorptionVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Desorption — Doctor ===\n");
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

  const profiles: DesorptionProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeDesorption(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgDesorptionIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.desorptionIndex)))
      : 0,
    flashDesorptionCount: profiles.filter((p) => p.desorptionPhase === "FLASH_DESORPTION").length,
    thermalDesorptionCount: profiles.filter((p) => p.desorptionPhase === "THERMAL_DESORPTION").length,
    activatedDesorptionCount: profiles.filter((p) => p.desorptionPhase === "ACTIVATED_DESORPTION").length,
    physisorptionCount: profiles.filter((p) => p.desorptionPhase === "PHYSISORPTION").length,
    chemisorptionCount: profiles.filter((p) => p.desorptionPhase === "CHEMISORPTION").length,
    avgDesorptionRate: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgDesorptionRate)))
      : 0,
    avgBindingEnergy: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgBindingEnergy)))
      : 0,
    totalHighDesorptionBins: profiles.reduce((s, p) => s + p.highDesorptionCount, 0),
    avgDesorptionGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.desorptionGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-desorption").description("HODLMM bin desorption analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin desorption dynamics")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
