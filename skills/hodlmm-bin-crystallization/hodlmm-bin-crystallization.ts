#!/usr/bin/env bun
/**
 * hodlmm-bin-crystallization.ts — Day 147 cocoa007 Bitflow Skills Comp
 *
 * Crystallization analyzer — models how liquidity forms rigid, ordered
 * lattice structures in HODLMM bin distributions.
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

interface BinCrystallization {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  latticePosition: number;
  latticeDeviation: number;
  grainId: number;
  isGrainBoundary: boolean;
  localOrder: number;
  defectType: string;
  latticeEnergy: number;
  meltingPoint: number;
  debyeAmplitude: number;
  nucleationPotential: number;
  slipPlaneProximity: number;
  thermalDisplacement: number;
  bindingStrength: number;
}

interface CrystallizationProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  latticeOrder: number;
  avgLatticeSpacing: number;
  latticeRegularity: number;
  grainCount: number;
  avgGrainSize: number;
  maxGrainSize: number;
  grainBoundaryCount: number;
  grainBoundaryFraction: number;
  avgMeltingPoint: number;
  minMeltingPoint: number;
  defectCount: number;
  vacancyCount: number;
  interstitialCount: number;
  dislocationDensity: number;
  crystalSymmetry: number;
  avgLatticeEnergy: number;
  totalLatticeEnergy: number;
  debyeTemperature: number;
  amorphousFraction: number;
  annealingPotential: number;
  solidificationRate: number;
  polycrystallinity: number;
  slipPlaneCount: number;
  crystallizationGini: number;
  crystallizationIndex: number;
  crystallizationPhase: string;
  crystalVerdict: string;
  topBins: BinCrystallization[];
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

function identifyGrains(bins: BinReserves[]): { grainId: number; bins: BinReserves[] }[] {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const grains: { grainId: number; bins: BinReserves[] }[] = [];
  let currentGrain: BinReserves[] = [];
  let grainId = 0;

  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) {
      currentGrain = [sorted[i]];
    } else if (sorted[i].binId - sorted[i - 1].binId <= 2) {
      currentGrain.push(sorted[i]);
    } else {
      if (currentGrain.length > 0) {
        grains.push({ grainId, bins: currentGrain });
        grainId++;
      }
      currentGrain = [sorted[i]];
    }
  }
  if (currentGrain.length > 0) {
    grains.push({ grainId, bins: currentGrain });
  }

  return grains;
}

function computeLatticeSpacings(bins: BinReserves[]): number[] {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const spacings: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    spacings.push(sorted[i].binId - sorted[i - 1].binId);
  }
  return spacings;
}

function computeBinCrystallization(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  grains: { grainId: number; bins: BinReserves[] }[],
  avgSpacing: number,
  spacings: number[]
): BinCrystallization {
  const distance = Math.abs(bin.binId - activeBin);
  const sorted = [...allBins].sort((a, b) => a.binId - b.binId);
  const binIndex = sorted.findIndex((b) => b.binId === bin.binId);
  const maxReserve = Math.max(...allBins.map((b) => b.totalUsd));
  const reserveFraction = maxReserve > 0 ? bin.totalUsd / maxReserve : 0;

  const idealPosition = binIndex * avgSpacing;
  const actualPosition = bin.binId - sorted[0].binId;
  const latticeDeviation = avgSpacing > 0 ? r4(Math.abs(actualPosition - idealPosition) / avgSpacing) : 0;

  const ownerGrain = grains.find((g) => g.bins.some((b) => b.binId === bin.binId));
  const grainId = ownerGrain ? ownerGrain.grainId : -1;

  let isGrainBoundary = false;
  if (ownerGrain) {
    const grainBins = ownerGrain.bins;
    const isFirst = grainBins[0].binId === bin.binId;
    const isLast = grainBins[grainBins.length - 1].binId === bin.binId;
    isGrainBoundary = (isFirst || isLast) && grains.length > 1;
  }

  let localOrder = 0;
  if (binIndex > 0 && binIndex < sorted.length - 1) {
    const spaceBefore = sorted[binIndex].binId - sorted[binIndex - 1].binId;
    const spaceAfter = sorted[binIndex + 1].binId - sorted[binIndex].binId;
    const spacingDiff = Math.abs(spaceBefore - spaceAfter);
    localOrder = r4(Math.max(0, 1 - spacingDiff / Math.max(1, avgSpacing)));
  } else {
    localOrder = 0.5;
  }

  let defectType = "NONE";
  if (binIndex > 0 && binIndex < sorted.length - 1) {
    const spaceBefore = sorted[binIndex].binId - sorted[binIndex - 1].binId;
    const spaceAfter = sorted[binIndex + 1].binId - sorted[binIndex].binId;
    if (spaceBefore > avgSpacing * 2 || spaceAfter > avgSpacing * 2) {
      defectType = "VACANCY";
    } else if (spaceBefore < avgSpacing * 0.5 && spaceAfter < avgSpacing * 0.5) {
      defectType = "INTERSTITIAL";
    } else if (latticeDeviation > 1.5) {
      defectType = "DISLOCATION";
    }
  }

  const neighbors = sorted.filter(
    (b) => Math.abs(b.binId - bin.binId) <= 3 && b.binId !== bin.binId
  );
  const neighborAvg = neighbors.length > 0
    ? neighbors.reduce((s, b) => s + b.totalUsd, 0) / neighbors.length
    : 0;
  const latticeEnergy = r4(
    neighborAvg > 0 ? Math.min(1, (bin.totalUsd + neighborAvg) / (2 * (maxReserve || 1))) : reserveFraction
  );

  const meltingPoint = r4(
    bin.totalUsd > 0
      ? Math.min(10, (bin.totalUsd / (volume24hUsd > 0 ? volume24hUsd : 1)) * 100)
      : 0
  );

  const reserveVariance = neighbors.length > 0
    ? neighbors.reduce((s, b) => s + Math.abs(b.totalUsd - bin.totalUsd), 0) / neighbors.length / (maxReserve || 1)
    : 0;
  const debyeAmplitude = r4(reserveVariance);

  const nucleationPotential = r4(
    reserveFraction > 0.3 && localOrder > 0.7 ? reserveFraction * localOrder : 0
  );

  let slipPlaneProximity = 0;
  if (grains.length > 1 && ownerGrain) {
    const grainBins = ownerGrain.bins;
    const distToStart = Math.abs(bin.binId - grainBins[0].binId);
    const distToEnd = Math.abs(bin.binId - grainBins[grainBins.length - 1].binId);
    const minDist = Math.min(distToStart, distToEnd);
    slipPlaneProximity = r4(Math.max(0, 1 - minDist / Math.max(1, grainBins.length)));
  }

  const thermalDisplacement = r4(debyeAmplitude * (volume24hUsd > 0 ? Math.min(1, volume24hUsd / (totalUsd || 1)) : 0));

  const bindingStrength = r4(
    latticeEnergy * localOrder * (1 - thermalDisplacement)
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    latticePosition: binIndex,
    latticeDeviation,
    grainId,
    isGrainBoundary,
    localOrder,
    defectType,
    latticeEnergy,
    meltingPoint,
    debyeAmplitude,
    nucleationPotential,
    slipPlaneProximity,
    thermalDisplacement,
    bindingStrength,
  };
}

function analyzeCrystallization(bins: BinReserves[], pool: AppPool): CrystallizationProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;

  const spacings = computeLatticeSpacings(sorted);
  const avgSpacing = spacings.length > 0
    ? spacings.reduce((s, v) => s + v, 0) / spacings.length
    : 1;

  const spacingVariance = spacings.length > 0
    ? spacings.reduce((s, v) => s + (v - avgSpacing) ** 2, 0) / spacings.length
    : 0;
  const latticeRegularity = r4(Math.max(0, 1 - Math.sqrt(spacingVariance) / Math.max(1, avgSpacing)));

  const grains = identifyGrains(sorted);
  const grainCount = grains.length;
  const grainSizes = grains.map((g) => g.bins.length);
  const avgGrainSize = r4(grainSizes.reduce((s, v) => s + v, 0) / grainCount);
  const maxGrainSize = Math.max(...grainSizes);

  const latticeOrder = r4(latticeRegularity * (1 - (grainCount - 1) / Math.max(1, n)));

  const binCryst = sorted.map((b) =>
    computeBinCrystallization(b, activeBin, sorted, totalUsd, volume, grains, avgSpacing, spacings)
  );

  const grainBoundaryCount = binCryst.filter((bc) => bc.isGrainBoundary).length;
  const grainBoundaryFraction = r4(grainBoundaryCount / n);

  const meltingPoints = binCryst.map((bc) => bc.meltingPoint);
  const avgMeltingPoint = r4(meltingPoints.reduce((s, v) => s + v, 0) / n);
  const minMeltingPoint = r4(Math.min(...meltingPoints));

  const defectCount = binCryst.filter((bc) => bc.defectType !== "NONE").length;
  const vacancyCount = binCryst.filter((bc) => bc.defectType === "VACANCY").length;
  const interstitialCount = binCryst.filter((bc) => bc.defectType === "INTERSTITIAL").length;
  const dislocationCount = binCryst.filter((bc) => bc.defectType === "DISLOCATION").length;
  const totalSpan = sorted[n - 1].binId - sorted[0].binId + 1;
  const dislocationDensity = r4(dislocationCount / Math.max(1, totalSpan));

  const reserves = sorted.map((b) => b.totalUsd);
  const reversed = [...reserves].reverse();
  let symmetryScore = 0;
  for (let i = 0; i < n; i++) {
    const maxVal = Math.max(reserves[i], reversed[i]);
    if (maxVal > 0) symmetryScore += 1 - Math.abs(reserves[i] - reversed[i]) / maxVal;
  }
  const crystalSymmetry = r4(symmetryScore / n);

  const avgLatticeEnergy = r4(binCryst.reduce((s, bc) => s + bc.latticeEnergy, 0) / n);
  const totalLatticeEnergy = r4(binCryst.reduce((s, bc) => s + bc.latticeEnergy, 0));

  const debyeValues = binCryst.map((bc) => bc.debyeAmplitude);
  const debyeTemperature = r4(debyeValues.reduce((s, v) => s + v, 0) / n);

  const amorphousFraction = r4(defectCount / n);

  const idealEnergy = latticeRegularity * crystalSymmetry;
  const currentEnergy = avgLatticeEnergy;
  const annealingPotential = r4(Math.max(0, idealEnergy - currentEnergy));

  const solidificationRate = r4(
    volume > 0 ? Math.max(0, 1 - volume / (totalUsd || 1)) : 1
  );

  const polycrystallinity = r4(
    grainCount > 1 ? 1 - 1 / grainCount : 0
  );

  let slipPlaneCount = 0;
  for (let i = 0; i < grains.length - 1; i++) {
    const lastBin = grains[i].bins[grains[i].bins.length - 1].binId;
    const nextBin = grains[i + 1].bins[0].binId;
    if (nextBin - lastBin > 2) slipPlaneCount++;
  }

  const sortedReserves = [...reserves].sort((a, b) => b - a);
  const totalRes = sortedReserves.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedReserves[i];
  }
  const crystallizationGini = totalRes > 0
    ? r4(Math.abs(giniSum) / (n * totalRes))
    : 0;

  const orderScore = Math.min(25, latticeOrder * 25);
  const grainScore = Math.min(25, (1 - amorphousFraction) * 25);
  const energyScore = Math.min(25, avgLatticeEnergy * 25);
  const stabilityScore = Math.min(25, solidificationRate * 25);
  const crystallizationIndex = Math.round(
    Math.min(100, orderScore + grainScore + energyScore + stabilityScore)
  );

  let crystallizationPhase: string;
  if (crystallizationIndex >= 80) crystallizationPhase = "FROZEN";
  else if (crystallizationIndex >= 65) crystallizationPhase = "SINGLE_CRYSTAL";
  else if (crystallizationIndex >= 45) crystallizationPhase = "POLYCRYSTALLINE";
  else if (crystallizationIndex >= 25) crystallizationPhase = "SUPERCOOLED";
  else crystallizationPhase = "LIQUID";

  let crystalVerdict: string;
  if (latticeRegularity > 0.85 && defectCount === 0)
    crystalVerdict = "PERFECT_LATTICE";
  else if (grainCount === 1 && latticeRegularity > 0.7)
    crystalVerdict = "MONOCRYSTAL";
  else if (grainCount > 1 && latticeRegularity > 0.5)
    crystalVerdict = "POLYCRYSTAL";
  else if (defectCount > n * 0.3)
    crystalVerdict = "DEFECTIVE";
  else
    crystalVerdict = "AMORPHOUS";

  const topBins = [...binCryst]
    .sort((a, b) => b.bindingStrength - a.bindingStrength)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    latticeOrder,
    avgLatticeSpacing: r4(avgSpacing),
    latticeRegularity,
    grainCount,
    avgGrainSize,
    maxGrainSize,
    grainBoundaryCount,
    grainBoundaryFraction,
    avgMeltingPoint,
    minMeltingPoint,
    defectCount,
    vacancyCount,
    interstitialCount,
    dislocationDensity,
    crystalSymmetry,
    avgLatticeEnergy,
    totalLatticeEnergy,
    debyeTemperature,
    amorphousFraction,
    annealingPotential,
    solidificationRate,
    polycrystallinity,
    slipPlaneCount,
    crystallizationGini,
    crystallizationIndex,
    crystallizationPhase,
    crystalVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Crystallization — Doctor ===\n");
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

  const profiles: CrystallizationProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeCrystallization(bins, pool));
    } catch {
      continue;
    }
  }

  const summary = {
    poolsAnalyzed: profiles.length,
    avgCrystallizationIndex: profiles.length > 0
      ? r2(profiles.reduce((s, p) => s + p.crystallizationIndex, 0) / profiles.length)
      : 0,
    frozenCount: profiles.filter((p) => p.crystallizationPhase === "FROZEN").length,
    singleCrystalCount: profiles.filter((p) => p.crystallizationPhase === "SINGLE_CRYSTAL").length,
    polycrystallineCount: profiles.filter((p) => p.crystallizationPhase === "POLYCRYSTALLINE").length,
    supercooledCount: profiles.filter((p) => p.crystallizationPhase === "SUPERCOOLED").length,
    liquidCount: profiles.filter((p) => p.crystallizationPhase === "LIQUID").length,
    avgLatticeOrder: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.latticeOrder, 0) / profiles.length)
      : 0,
    avgGrainCount: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.grainCount, 0) / profiles.length)
      : 0,
    totalDefects: profiles.reduce((s, p) => s + p.defectCount, 0),
    avgCrystalSymmetry: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.crystalSymmetry, 0) / profiles.length)
      : 0,
    avgCrystallizationGini: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.crystallizationGini, 0) / profiles.length)
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-crystallization").description("HODLMM bin crystallization analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin crystallization dynamics")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
