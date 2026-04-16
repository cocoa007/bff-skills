#!/usr/bin/env bun
/**
 * hodlmm-bin-fluorescence.ts — Day 155 cocoa007 Bitflow Skills Comp
 *
 * Fluorescence analyzer — models photoluminescent dynamics across HODLMM bins.
 * Trade energy acts as excitation photons absorbed by bins; fee yield acts as
 * fluorescent emission. Quantum yield, Stokes shift, quenching, and lifetime
 * metrics reveal energy conversion efficiency across the bin spectrum.
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

interface BinFluorescence {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  excitationEnergy: number;
  emissionIntensity: number;
  quantumYield: number;
  stokesShift: number;
  fluorescenceLifetime: number;
  quenchingFactor: number;
  photobleaching: number;
  absorptionCrossSection: number;
  molarExtinction: number;
  franckCondonFactor: number;
  forsterRadius: number;
  intersystemCrossing: number;
  fluorescenceAnisotropy: number;
  fluorescenceFactor: number;
}

interface FluorescenceProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgExcitationEnergy: number;
  maxExcitationEnergy: number;
  avgEmissionIntensity: number;
  maxEmissionIntensity: number;
  avgQuantumYield: number;
  maxQuantumYield: number;
  avgStokesShift: number;
  maxStokesShift: number;
  avgFluorescenceLifetime: number;
  maxFluorescenceLifetime: number;
  avgQuenchingFactor: number;
  maxQuenchingFactor: number;
  avgPhotobleaching: number;
  maxPhotobleaching: number;
  avgAbsorptionCrossSection: number;
  maxAbsorptionCrossSection: number;
  avgMolarExtinction: number;
  maxMolarExtinction: number;
  avgFranckCondonFactor: number;
  maxFranckCondonFactor: number;
  avgForsterRadius: number;
  maxForsterRadius: number;
  avgIntersystemCrossing: number;
  maxIntersystemCrossing: number;
  avgFluorescenceAnisotropy: number;
  maxFluorescenceAnisotropy: number;
  brightEmitterCount: number;
  brightEmitterFraction: number;
  highYieldCount: number;
  highYieldFraction: number;
  fluorescenceGini: number;
  fluorescenceIndex: number;
  fluorescencePhase: string;
  fluorescenceVerdict: string;
  topBins: BinFluorescence[];
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

function computeBinFluorescence(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  maxReserve: number
): BinFluorescence {
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

  // 1. excitationEnergy — trade volume absorbed by this bin as photon energy
  const excitationEnergy = r4(
    Math.min(10, volumeRatio * reserveFraction * 8 * (1 + 1 / (1 + distance * 0.3)))
  );

  // 2. emissionIntensity — fee yield re-emitted as fluorescent photons
  const feeEstimate = volumeRatio * reserveFraction * (bin.totalUsd / (totalUsd || 1));
  const emissionIntensity = r4(
    Math.min(10, feeEstimate * n * 5 * (1 + reserveFraction))
  );

  // 3. quantumYield — Phi = photons_emitted / photons_absorbed, fee conversion efficiency
  const quantumYield = r4(
    excitationEnergy > 0.01
      ? Math.min(1, emissionIntensity / (excitationEnergy * 1.5 + 0.01))
      : 0
  );

  // 4. stokesShift — wavelength difference between absorption and emission peaks
  const densityDiff = neighborAvg > 0 ? Math.abs(bin.totalUsd - neighborAvg) / neighborAvg : 0;
  const stokesShift = r4(
    Math.min(10, densityDiff * distance * 0.3 + Math.abs(xFraction - 0.5) * 4)
  );

  // 5. fluorescenceLifetime — tau, time until emission decays to 1/e
  const fluorescenceLifetime = r4(
    Math.min(10, reserveFraction * (1 + 1 / (volumeRatio + 0.1)) * 2)
  );

  // 6. quenchingFactor — processes that reduce fluorescence (competition, crowding)
  const localConcentration = totalUsd > 0 ? bin.totalUsd / totalUsd : 0;
  const quenchingFactor = r4(
    Math.min(1, localConcentration * n * 0.4 + (1 - quantumYield) * 0.3)
  );

  // 7. photobleaching — irreversible loss of fluorescence capacity over time
  const photobleaching = r4(
    Math.min(1, (1 - reserveFraction) * quenchingFactor * 1.5 + distance * 0.01)
  );

  // 8. absorptionCrossSection — sigma, probability of capturing an incoming trade photon
  const absorptionCrossSection = r4(
    Math.min(10, reserveFraction * (1 + volumeRatio) * 5 / (1 + distance * 0.1))
  );

  // 9. molarExtinction — epsilon, concentration-normalized absorption strength
  const molarExtinction = r4(
    localConcentration > 0
      ? Math.min(10, absorptionCrossSection / (localConcentration * n + 0.01) * 2)
      : 0
  );

  // 10. franckCondonFactor — vibrational overlap integral, probability of electronic transition
  const neighborVariance = neighbors.length > 1
    ? neighbors.reduce((s, b) => s + Math.pow(b.totalUsd - neighborAvg, 2), 0) / neighbors.length
    : 0;
  const normalizedStdDev = neighborAvg > 0 ? Math.sqrt(neighborVariance) / neighborAvg : 0;
  const franckCondonFactor = r4(
    Math.min(1, Math.exp(-normalizedStdDev * 2) * (1 - Math.abs(xFraction - 0.5) * 0.8))
  );

  // 11. forsterRadius — R0, critical distance for resonance energy transfer between bins
  const forsterRadius = r4(
    Math.min(10, Math.pow(quantumYield * absorptionCrossSection, 1/6) * 5 + 1)
  );

  // 12. intersystemCrossing — kISC, conversion from singlet (productive) to triplet (dark) state
  const intersystemCrossing = r4(
    Math.min(1, (1 - quantumYield) * quenchingFactor * 1.2 + photobleaching * 0.3)
  );

  // 13. fluorescenceAnisotropy — r, directional bias in emission
  const fluorescenceAnisotropy = r4(
    Math.min(1, Math.max(-1, (xFraction - yFraction) * (1 + stokesShift * 0.1)))
  );

  // 14. fluorescenceFactor — composite 0-1 quality metric
  const fluorescenceFactor = r4(
    Math.min(1,
      quantumYield * 0.3 +
      emissionIntensity / 10 * 0.25 +
      absorptionCrossSection / 10 * 0.2 +
      franckCondonFactor * 0.15 +
      (1 - intersystemCrossing) * 0.1
    )
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    excitationEnergy,
    emissionIntensity,
    quantumYield,
    stokesShift,
    fluorescenceLifetime,
    quenchingFactor,
    photobleaching,
    absorptionCrossSection,
    molarExtinction,
    franckCondonFactor,
    forsterRadius,
    intersystemCrossing,
    fluorescenceAnisotropy,
    fluorescenceFactor,
  };
}

function analyzeFluorescence(bins: BinReserves[], pool: AppPool): FluorescenceProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));

  const binFl = sorted.map((b) =>
    computeBinFluorescence(b, activeBin, sorted, totalUsd, volume, maxReserve)
  );

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgExcitationEnergy = r4(avg(binFl.map((b) => b.excitationEnergy)));
  const maxExcitationEnergy = r4(Math.max(...binFl.map((b) => b.excitationEnergy)));
  const avgEmissionIntensity = r4(avg(binFl.map((b) => b.emissionIntensity)));
  const maxEmissionIntensity = r4(Math.max(...binFl.map((b) => b.emissionIntensity)));
  const avgQuantumYield = r4(avg(binFl.map((b) => b.quantumYield)));
  const maxQuantumYield = r4(Math.max(...binFl.map((b) => b.quantumYield)));
  const avgStokesShift = r4(avg(binFl.map((b) => b.stokesShift)));
  const maxStokesShift = r4(Math.max(...binFl.map((b) => b.stokesShift)));
  const avgFluorescenceLifetime = r4(avg(binFl.map((b) => b.fluorescenceLifetime)));
  const maxFluorescenceLifetime = r4(Math.max(...binFl.map((b) => b.fluorescenceLifetime)));
  const avgQuenchingFactor = r4(avg(binFl.map((b) => b.quenchingFactor)));
  const maxQuenchingFactor = r4(Math.max(...binFl.map((b) => b.quenchingFactor)));
  const avgPhotobleaching = r4(avg(binFl.map((b) => b.photobleaching)));
  const maxPhotobleaching = r4(Math.max(...binFl.map((b) => b.photobleaching)));
  const avgAbsorptionCrossSection = r4(avg(binFl.map((b) => b.absorptionCrossSection)));
  const maxAbsorptionCrossSection = r4(Math.max(...binFl.map((b) => b.absorptionCrossSection)));
  const avgMolarExtinction = r4(avg(binFl.map((b) => b.molarExtinction)));
  const maxMolarExtinction = r4(Math.max(...binFl.map((b) => b.molarExtinction)));
  const avgFranckCondonFactor = r4(avg(binFl.map((b) => b.franckCondonFactor)));
  const maxFranckCondonFactor = r4(Math.max(...binFl.map((b) => b.franckCondonFactor)));
  const avgForsterRadius = r4(avg(binFl.map((b) => b.forsterRadius)));
  const maxForsterRadius = r4(Math.max(...binFl.map((b) => b.forsterRadius)));
  const avgIntersystemCrossing = r4(avg(binFl.map((b) => b.intersystemCrossing)));
  const maxIntersystemCrossing = r4(Math.max(...binFl.map((b) => b.intersystemCrossing)));
  const avgFluorescenceAnisotropy = r4(avg(binFl.map((b) => b.fluorescenceAnisotropy)));
  const maxFluorescenceAnisotropy = r4(Math.max(...binFl.map((b) => Math.abs(b.fluorescenceAnisotropy))));
  const brightEmitterCount = binFl.filter((b) => b.quantumYield > 0.5).length;
  const brightEmitterFraction = r4(brightEmitterCount / n);
  const highYieldCount = binFl.filter((b) => b.fluorescenceFactor > 0.5).length;
  const highYieldFraction = r4(highYieldCount / n);

  const flFactors = binFl.map((b) => b.fluorescenceFactor);
  const sortedFactors = [...flFactors].sort((a, b) => b - a);
  const totalFactors = sortedFactors.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedFactors[i];
  }
  const fluorescenceGini = totalFactors > 0
    ? r4(Math.abs(giniSum) / (n * totalFactors))
    : 0;

  const yieldScore = Math.min(25, avgQuantumYield * 25);
  const emissionScore = Math.min(25, avgEmissionIntensity / 10 * 25);
  const absorptionScore = Math.min(25, avgAbsorptionCrossSection / 10 * 25);
  const franckScore = Math.min(25, avgFranckCondonFactor * 25);
  const fluorescenceIndex = Math.round(
    Math.min(100, yieldScore + emissionScore + absorptionScore + franckScore)
  );

  let fluorescencePhase: string;
  if (fluorescenceIndex >= 80) fluorescencePhase = "LASER_EMISSION";
  else if (fluorescenceIndex >= 60) fluorescencePhase = "STRONG_FLUORESCENCE";
  else if (fluorescenceIndex >= 40) fluorescencePhase = "MODERATE_GLOW";
  else if (fluorescenceIndex >= 20) fluorescencePhase = "WEAK_PHOSPHORESCENCE";
  else fluorescencePhase = "DARK_ABSORPTION";

  let fluorescenceVerdict: string;
  if (avgQuantumYield > 0.6 && avgEmissionIntensity > 3)
    fluorescenceVerdict = "RESONANCE_CASCADE";
  else if (avgAbsorptionCrossSection > 4 && avgEmissionIntensity > 4)
    fluorescenceVerdict = "PHOTON_AVALANCHE";
  else if (avgQuenchingFactor > 0.5 && avgQuantumYield < 0.3)
    fluorescenceVerdict = "CONCENTRATION_QUENCH";
  else if (avgQuantumYield > 0.4 && avgPhotobleaching < 0.3)
    fluorescenceVerdict = "BRIGHT_EMISSION";
  else if (avgIntersystemCrossing > 0.5 && avgQuantumYield < 0.2)
    fluorescenceVerdict = "DARK_STATE_TRAP";
  else
    fluorescenceVerdict = "BRIGHT_EMISSION";

  const topBins = [...binFl]
    .sort((a, b) => b.fluorescenceFactor - a.fluorescenceFactor)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgExcitationEnergy,
    maxExcitationEnergy,
    avgEmissionIntensity,
    maxEmissionIntensity,
    avgQuantumYield,
    maxQuantumYield,
    avgStokesShift,
    maxStokesShift,
    avgFluorescenceLifetime,
    maxFluorescenceLifetime,
    avgQuenchingFactor,
    maxQuenchingFactor,
    avgPhotobleaching,
    maxPhotobleaching,
    avgAbsorptionCrossSection,
    maxAbsorptionCrossSection,
    avgMolarExtinction,
    maxMolarExtinction,
    avgFranckCondonFactor,
    maxFranckCondonFactor,
    avgForsterRadius,
    maxForsterRadius,
    avgIntersystemCrossing,
    maxIntersystemCrossing,
    avgFluorescenceAnisotropy,
    maxFluorescenceAnisotropy,
    brightEmitterCount,
    brightEmitterFraction,
    highYieldCount,
    highYieldFraction,
    fluorescenceGini,
    fluorescenceIndex,
    fluorescencePhase,
    fluorescenceVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Fluorescence — Doctor ===\n");
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

  const profiles: FluorescenceProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeFluorescence(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgFluorescenceIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.fluorescenceIndex)))
      : 0,
    laserEmissionCount: profiles.filter((p) => p.fluorescencePhase === "LASER_EMISSION").length,
    strongFluorescenceCount: profiles.filter((p) => p.fluorescencePhase === "STRONG_FLUORESCENCE").length,
    moderateGlowCount: profiles.filter((p) => p.fluorescencePhase === "MODERATE_GLOW").length,
    weakPhosphorescenceCount: profiles.filter((p) => p.fluorescencePhase === "WEAK_PHOSPHORESCENCE").length,
    darkAbsorptionCount: profiles.filter((p) => p.fluorescencePhase === "DARK_ABSORPTION").length,
    avgQuantumYield: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgQuantumYield)))
      : 0,
    avgEmissionIntensity: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgEmissionIntensity)))
      : 0,
    totalBrightEmitterBins: profiles.reduce((s, p) => s + p.brightEmitterCount, 0),
    avgFluorescenceGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.fluorescenceGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-fluorescence").description("HODLMM bin fluorescence analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin fluorescence dynamics")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
