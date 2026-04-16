#!/usr/bin/env bun
/**
 * hodlmm-bin-magnetostriction.ts — Day 158 cocoa007 Bitflow Skills Comp
 *
 * Magnetostriction analyzer — models mechanical deformation of HODLMM bins
 * under magnetic loading from trade flow fields. In magnetostrictive physics,
 * ferromagnetic materials physically deform (strain) when exposed to a magnetic
 * field — the magnetostrictive coefficient lambda relates applied field strength
 * H to mechanical strain epsilon. In DLMM context, trade flow creates "magnetic
 * fields" across the bin lattice, causing bins to deform (strain): their reserve
 * ratios shift, concentration changes, and effective width contracts or expands
 * under magnetic loading. Magnetization, field strength, permeability, coercivity,
 * remanence, hysteresis loss, susceptibility, saturation, demagnetization, coupling,
 * Villari effect, and eddy current losses reveal magnetomechanical dynamics.
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

interface BinMagnetostriction {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  magnetization: number;
  fieldStrength: number;
  magnetostrictiveStrain: number;
  permeability: number;
  coercivity: number;
  remanence: number;
  hysteresisLoss: number;
  magneticSusceptibility: number;
  saturationMagnetization: number;
  demagnetizationFactor: number;
  magnetomechanicalCoupling: number;
  villariEffect: number;
  eddyCurrentLoss: number;
  magnetostrictionFactor: number;
}

interface MagnetostrictionProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgMagnetization: number;
  maxMagnetization: number;
  avgFieldStrength: number;
  maxFieldStrength: number;
  avgMagnetostrictiveStrain: number;
  maxMagnetostrictiveStrain: number;
  avgPermeability: number;
  maxPermeability: number;
  avgCoercivity: number;
  maxCoercivity: number;
  avgRemanence: number;
  maxRemanence: number;
  avgHysteresisLoss: number;
  maxHysteresisLoss: number;
  avgMagneticSusceptibility: number;
  maxMagneticSusceptibility: number;
  avgSaturationMagnetization: number;
  maxSaturationMagnetization: number;
  avgDemagnetizationFactor: number;
  maxDemagnetizationFactor: number;
  avgMagnetomechanicalCoupling: number;
  maxMagnetomechanicalCoupling: number;
  avgVillariEffect: number;
  maxVillariEffect: number;
  avgEddyCurrentLoss: number;
  maxEddyCurrentLoss: number;
  highMagnetizationCount: number;
  highMagnetizationFraction: number;
  highCouplingCount: number;
  highCouplingFraction: number;
  magnetostrictionGini: number;
  magnetostrictionIndex: number;
  magnetostrictionPhase: string;
  magnetostrictionVerdict: string;
  topBins: BinMagnetostriction[];
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

function computeBinMagnetostriction(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  maxReserve: number
): BinMagnetostriction {
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
  const localConcentration = totalUsd > 0 ? bin.totalUsd / totalUsd : 0;

  // 1. magnetization — M: alignment of magnetic domains under applied field
  // High M means bin reserves are strongly aligned with trade flow direction
  const magnetization = r4(
    Math.min(1, reserveFraction * 0.5 + volumeRatio * 0.3 * (1 + localConcentration * 2) / (1 + distance * 0.15))
  );

  // 2. fieldStrength — H: the applied magnetic field from trade flow
  // High H means intense trade pressure creating strong magnetic loading
  const fieldStrength = r4(
    Math.min(10, volumeRatio * n * 0.4 * (1 + reserveFraction * 0.5) / (1 + distance * 0.2) + localConcentration * 5)
  );

  // 3. magnetostrictiveStrain — lambda: mechanical deformation under magnetic field
  // lambda = dL/L, how much the bin deforms (reserve ratio shifts) under field
  const imbalance = Math.abs(xFraction - 0.5) * 2; // 0 = balanced, 1 = fully one-sided
  const neighborImbalanceAvg = neighbors.length > 0
    ? neighbors.reduce((s, b) => {
        const nxf = b.totalUsd > 0 ? b.reserveXUsd / b.totalUsd : 0.5;
        return s + Math.abs(nxf - 0.5) * 2;
      }, 0) / neighbors.length
    : 0;
  const magnetostrictiveStrain = r4(
    Math.min(1, imbalance * 0.4 + magnetization * fieldStrength * 0.05 + Math.abs(imbalance - neighborImbalanceAvg) * 0.3)
  );

  // 4. permeability — mu: ease with which magnetic flux penetrates the bin
  // High permeability means trade flow easily affects the bin's reserve structure
  const permeability = r4(
    Math.min(10, (reserveFraction + 0.1) * volumeRatio * 4 * (1 + localConcentration * 3) + magnetization * 2)
  );

  // 5. coercivity — Hc: field strength needed to demagnetize the bin
  // High coercivity means the bin resists returning to neutral after magnetization
  const coercivity = r4(
    Math.min(1, (1 - reserveFraction) * 0.3 + imbalance * 0.4 + distance * 0.01 + (1 - magnetization) * 0.2)
  );

  // 6. remanence — Mr: residual magnetization after field removal
  // How much deformation persists after trade flow subsides
  const remanence = r4(
    Math.min(1, magnetization * coercivity * 1.5 + imbalance * 0.3 * reserveFraction)
  );

  // 7. hysteresisLoss — energy dissipated per magnetization cycle
  // Proportional to area of B-H hysteresis loop
  const hysteresisLoss = r4(
    Math.min(1, coercivity * remanence * 2 + magnetostrictiveStrain * 0.2)
  );

  // 8. magneticSusceptibility — chi: ratio of magnetization to applied field (M/H)
  // High chi means the bin is easily magnetized by weak fields
  const magneticSusceptibility = r4(
    fieldStrength > 0.01
      ? Math.min(10, magnetization / (fieldStrength * 0.1 + 0.01) * (1 + localConcentration * 2))
      : 0
  );

  // 9. saturationMagnetization — Ms: maximum achievable magnetization
  // The ceiling on how much the bin can be deformed by any field strength
  const saturationMagnetization = r4(
    Math.min(1, reserveFraction * 0.6 + localConcentration * n * 0.05 + volumeRatio * 0.15)
  );

  // 10. demagnetizationFactor — N: self-demagnetization from bin geometry
  // High N means the bin's shape creates internal fields opposing applied field
  const neighborVariance = neighbors.length > 1
    ? neighbors.reduce((s, b) => s + Math.pow(b.totalUsd - neighborAvg, 2), 0) / neighbors.length
    : 0;
  const normalizedStdDev = neighborAvg > 0 ? Math.sqrt(neighborVariance) / neighborAvg : 0;
  const demagnetizationFactor = r4(
    Math.min(1, (1 - reserveFraction) * 0.3 + normalizedStdDev * 0.4 + (1 - localConcentration * n) * 0.1 + distance * 0.005)
  );

  // 11. magnetomechanicalCoupling — k: efficiency of field-to-strain conversion
  // k^2 = mechanical energy / magnetic energy, the transducer efficiency
  const magnetomechanicalCoupling = r4(
    Math.min(1,
      magnetostrictiveStrain > 0.01 && fieldStrength > 0.01
        ? Math.sqrt(Math.min(1, magnetostrictiveStrain * magnetization / (fieldStrength * 0.1 + 0.01))) * (1 - hysteresisLoss * 0.5)
        : 0
    )
  );

  // 12. villariEffect — inverse magnetostriction: strain affecting magnetic properties
  // How much mechanical deformation (reserve shifts) feeds back into magnetization
  const villariEffect = r4(
    Math.min(1, magnetostrictiveStrain * magneticSusceptibility * 0.15 + Math.abs(imbalance - neighborImbalanceAvg) * magnetization * 0.5)
  );

  // 13. eddyCurrentLoss — resistive losses from time-varying magnetic fields
  // Energy dissipated as circulating currents in the conductive material
  const eddyCurrentLoss = r4(
    Math.min(1, fieldStrength / 10 * 0.3 + volumeRatio * 0.2 * permeability / 10 + (1 - coercivity) * 0.15)
  );

  // 14. magnetostrictionFactor — composite 0-1
  const magnetostrictionFactor = r4(
    Math.min(1,
      magnetization * 0.15 +
      magnetostrictiveStrain * 0.2 +
      magnetomechanicalCoupling * 0.2 +
      (1 - hysteresisLoss) * 0.1 +
      permeability / 10 * 0.1 +
      villariEffect * 0.1 +
      saturationMagnetization * 0.1 +
      (1 - eddyCurrentLoss) * 0.05
    )
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    magnetization,
    fieldStrength,
    magnetostrictiveStrain,
    permeability,
    coercivity,
    remanence,
    hysteresisLoss,
    magneticSusceptibility,
    saturationMagnetization,
    demagnetizationFactor,
    magnetomechanicalCoupling,
    villariEffect,
    eddyCurrentLoss,
    magnetostrictionFactor,
  };
}

function analyzeMagnetostriction(bins: BinReserves[], pool: AppPool): MagnetostrictionProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));

  const binMs = sorted.map((b) =>
    computeBinMagnetostriction(b, activeBin, sorted, totalUsd, volume, maxReserve)
  );

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgMagnetization = r4(avg(binMs.map((b) => b.magnetization)));
  const maxMagnetization = r4(Math.max(...binMs.map((b) => b.magnetization)));
  const avgFieldStrength = r4(avg(binMs.map((b) => b.fieldStrength)));
  const maxFieldStrength = r4(Math.max(...binMs.map((b) => b.fieldStrength)));
  const avgMagnetostrictiveStrain = r4(avg(binMs.map((b) => b.magnetostrictiveStrain)));
  const maxMagnetostrictiveStrain = r4(Math.max(...binMs.map((b) => b.magnetostrictiveStrain)));
  const avgPermeability = r4(avg(binMs.map((b) => b.permeability)));
  const maxPermeability = r4(Math.max(...binMs.map((b) => b.permeability)));
  const avgCoercivity = r4(avg(binMs.map((b) => b.coercivity)));
  const maxCoercivity = r4(Math.max(...binMs.map((b) => b.coercivity)));
  const avgRemanence = r4(avg(binMs.map((b) => b.remanence)));
  const maxRemanence = r4(Math.max(...binMs.map((b) => b.remanence)));
  const avgHysteresisLoss = r4(avg(binMs.map((b) => b.hysteresisLoss)));
  const maxHysteresisLoss = r4(Math.max(...binMs.map((b) => b.hysteresisLoss)));
  const avgMagneticSusceptibility = r4(avg(binMs.map((b) => b.magneticSusceptibility)));
  const maxMagneticSusceptibility = r4(Math.max(...binMs.map((b) => b.magneticSusceptibility)));
  const avgSaturationMagnetization = r4(avg(binMs.map((b) => b.saturationMagnetization)));
  const maxSaturationMagnetization = r4(Math.max(...binMs.map((b) => b.saturationMagnetization)));
  const avgDemagnetizationFactor = r4(avg(binMs.map((b) => b.demagnetizationFactor)));
  const maxDemagnetizationFactor = r4(Math.max(...binMs.map((b) => b.demagnetizationFactor)));
  const avgMagnetomechanicalCoupling = r4(avg(binMs.map((b) => b.magnetomechanicalCoupling)));
  const maxMagnetomechanicalCoupling = r4(Math.max(...binMs.map((b) => b.magnetomechanicalCoupling)));
  const avgVillariEffect = r4(avg(binMs.map((b) => b.villariEffect)));
  const maxVillariEffect = r4(Math.max(...binMs.map((b) => b.villariEffect)));
  const avgEddyCurrentLoss = r4(avg(binMs.map((b) => b.eddyCurrentLoss)));
  const maxEddyCurrentLoss = r4(Math.max(...binMs.map((b) => b.eddyCurrentLoss)));
  const highMagnetizationCount = binMs.filter((b) => b.magnetization > 0.5).length;
  const highMagnetizationFraction = r4(highMagnetizationCount / n);
  const highCouplingCount = binMs.filter((b) => b.magnetomechanicalCoupling > 0.5).length;
  const highCouplingFraction = r4(highCouplingCount / n);

  const msFactors = binMs.map((b) => b.magnetostrictionFactor);
  const sortedFactors = [...msFactors].sort((a, b) => b - a);
  const totalFactors = sortedFactors.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedFactors[i];
  }
  const magnetostrictionGini = totalFactors > 0
    ? r4(Math.abs(giniSum) / (n * totalFactors))
    : 0;

  const magnetizationScore = Math.min(25, avgMagnetization * 25);
  const strainScore = Math.min(25, avgMagnetostrictiveStrain * 25);
  const couplingScore = Math.min(25, avgMagnetomechanicalCoupling * 25);
  const efficiencyScore = Math.min(25, (1 - avgHysteresisLoss) * 25);
  const magnetostrictionIndex = Math.round(
    Math.min(100, magnetizationScore + strainScore + couplingScore + efficiencyScore)
  );

  let magnetostrictionPhase: string;
  if (magnetostrictionIndex >= 80) magnetostrictionPhase = "SATURATED_FERROMAGNET";
  else if (magnetostrictionIndex >= 60) magnetostrictionPhase = "STRONG_DOMAIN";
  else if (magnetostrictionIndex >= 40) magnetostrictionPhase = "MODERATE_STRAIN";
  else if (magnetostrictionIndex >= 20) magnetostrictionPhase = "WEAK_RESPONSE";
  else magnetostrictionPhase = "PARAMAGNETIC";

  let magnetostrictionVerdict: string;
  if (avgMagnetization > 0.6 && avgMagnetomechanicalCoupling > 0.5)
    magnetostrictionVerdict = "GIANT_MAGNETOSTRICTIVE";
  else if (avgMagnetomechanicalCoupling > 0.4 && avgHysteresisLoss < 0.3)
    magnetostrictionVerdict = "HIGH_COUPLING_TRANSDUCER";
  else if (avgHysteresisLoss > 0.5 && avgCoercivity > 0.4)
    magnetostrictionVerdict = "HYSTERESIS_DOMINATED";
  else if (avgMagnetostrictiveStrain > 0.3 && avgEddyCurrentLoss < 0.3)
    magnetostrictionVerdict = "EFFICIENT_ACTUATOR";
  else if (avgMagnetization < 0.2 && avgFieldStrength < 2)
    magnetostrictionVerdict = "DEMAGNETIZED_CORE";
  else
    magnetostrictionVerdict = "EFFICIENT_ACTUATOR";

  const topBins = [...binMs]
    .sort((a, b) => b.magnetostrictionFactor - a.magnetostrictionFactor)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgMagnetization,
    maxMagnetization,
    avgFieldStrength,
    maxFieldStrength,
    avgMagnetostrictiveStrain,
    maxMagnetostrictiveStrain,
    avgPermeability,
    maxPermeability,
    avgCoercivity,
    maxCoercivity,
    avgRemanence,
    maxRemanence,
    avgHysteresisLoss,
    maxHysteresisLoss,
    avgMagneticSusceptibility,
    maxMagneticSusceptibility,
    avgSaturationMagnetization,
    maxSaturationMagnetization,
    avgDemagnetizationFactor,
    maxDemagnetizationFactor,
    avgMagnetomechanicalCoupling,
    maxMagnetomechanicalCoupling,
    avgVillariEffect,
    maxVillariEffect,
    avgEddyCurrentLoss,
    maxEddyCurrentLoss,
    highMagnetizationCount,
    highMagnetizationFraction,
    highCouplingCount,
    highCouplingFraction,
    magnetostrictionGini,
    magnetostrictionIndex,
    magnetostrictionPhase,
    magnetostrictionVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Magnetostriction — Doctor ===\n");
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

  const profiles: MagnetostrictionProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeMagnetostriction(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgMagnetostrictionIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.magnetostrictionIndex)))
      : 0,
    saturatedFerromagnetCount: profiles.filter((p) => p.magnetostrictionPhase === "SATURATED_FERROMAGNET").length,
    strongDomainCount: profiles.filter((p) => p.magnetostrictionPhase === "STRONG_DOMAIN").length,
    moderateStrainCount: profiles.filter((p) => p.magnetostrictionPhase === "MODERATE_STRAIN").length,
    weakResponseCount: profiles.filter((p) => p.magnetostrictionPhase === "WEAK_RESPONSE").length,
    paramagneticCount: profiles.filter((p) => p.magnetostrictionPhase === "PARAMAGNETIC").length,
    avgMagnetization: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgMagnetization)))
      : 0,
    avgMagnetostrictiveStrain: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgMagnetostrictiveStrain)))
      : 0,
    totalHighCouplingBins: profiles.reduce((s, p) => s + p.highCouplingCount, 0),
    avgMagnetostrictionGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.magnetostrictionGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-magnetostriction").description("HODLMM bin magnetostriction analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin magnetostriction dynamics")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
