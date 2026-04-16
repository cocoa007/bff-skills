#!/usr/bin/env bun
/**
 * hodlmm-bin-thermocouple.ts — Day 157 cocoa007 Bitflow Skills Comp
 *
 * Thermocouple analyzer — models fee yield differentials across HODLMM bin
 * junctions as thermal EMF via the Seebeck effect. Hot bins (high activity)
 * paired with cold bins (low activity) create measurable thermal gradients
 * that drive electromotive force across the junction. Seebeck coefficient,
 * thermal conductivity, junction temperature, EMF output, figure of merit
 * (ZT), Thomson coefficient, and Peltier coefficient reveal thermoelectric
 * conversion efficiency across the bin lattice.
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

interface BinThermocouple {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  junctionTemperature: number;
  seebeckCoefficient: number;
  thermalGradient: number;
  emfOutput: number;
  thermalConductivity: number;
  electricalConductivity: number;
  figureOfMerit: number;
  peltierCoefficient: number;
  thomsonCoefficient: number;
  thermalResistance: number;
  contactResistance: number;
  jouleHeating: number;
  carnotEfficiency: number;
  thermocoupleFactor: number;
}

interface ThermocoupleProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgJunctionTemperature: number;
  maxJunctionTemperature: number;
  avgSeebeckCoefficient: number;
  maxSeebeckCoefficient: number;
  avgThermalGradient: number;
  maxThermalGradient: number;
  avgEmfOutput: number;
  maxEmfOutput: number;
  avgThermalConductivity: number;
  maxThermalConductivity: number;
  avgElectricalConductivity: number;
  maxElectricalConductivity: number;
  avgFigureOfMerit: number;
  maxFigureOfMerit: number;
  avgPeltierCoefficient: number;
  maxPeltierCoefficient: number;
  avgThomsonCoefficient: number;
  maxThomsonCoefficient: number;
  avgThermalResistance: number;
  maxThermalResistance: number;
  avgContactResistance: number;
  maxContactResistance: number;
  avgJouleHeating: number;
  maxJouleHeating: number;
  avgCarnotEfficiency: number;
  maxCarnotEfficiency: number;
  highSeebeckCount: number;
  highSeebeckFraction: number;
  highZTCount: number;
  highZTFraction: number;
  thermocoupleGini: number;
  thermocoupleIndex: number;
  thermocouplePhase: string;
  thermocoupleVerdict: string;
  topBins: BinThermocouple[];
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

function computeBinThermocouple(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  maxReserve: number
): BinThermocouple {
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

  // 1. junctionTemperature — thermal activity level of this bin
  const junctionTemperature = r4(
    Math.min(10, volumeRatio * reserveFraction * 6 * (1 + 1 / (1 + distance * 0.3)) + localConcentration * n * 0.5)
  );

  // 2. seebeckCoefficient — voltage generated per unit temperature difference
  const neighborTempProxy = neighbors.length > 0
    ? neighbors.reduce((s, b) => s + (b.totalUsd / maxReserve) * volumeRatio, 0) / neighbors.length
    : 0;
  const tempDiff = Math.abs(reserveFraction * volumeRatio - neighborTempProxy);
  const seebeckCoefficient = r4(
    Math.min(1, tempDiff * 8 * (1 + localConcentration * 2) / (1 + distance * 0.1))
  );

  // 3. thermalGradient — temperature difference across the junction
  const thermalGradient = r4(
    Math.min(10, tempDiff * n * 3 * (1 + junctionTemperature * 0.1))
  );

  // 4. emfOutput — thermoelectric EMF from Seebeck effect (V = S * deltaT)
  const emfOutput = r4(
    Math.min(10, seebeckCoefficient * thermalGradient * 3 / (1 + distance * 0.05))
  );

  // 5. thermalConductivity — heat flow through the bin (unwanted in thermoelectric)
  const neighborVariance = neighbors.length > 1
    ? neighbors.reduce((s, b) => s + Math.pow(b.totalUsd - neighborAvg, 2), 0) / neighbors.length
    : 0;
  const normalizedStdDev = neighborAvg > 0 ? Math.sqrt(neighborVariance) / neighborAvg : 0;
  const thermalConductivity = r4(
    Math.min(10, reserveFraction * n * 0.4 * (1 - normalizedStdDev * 0.3) + localConcentration * 5)
  );

  // 6. electricalConductivity — charge carrier mobility
  const electricalConductivity = r4(
    Math.min(10, volumeRatio * reserveFraction * 5 * (1 + seebeckCoefficient * 2) + junctionTemperature * 0.3)
  );

  // 7. figureOfMerit — ZT = S^2 * sigma * T / kappa
  const figureOfMerit = r4(
    thermalConductivity > 0.01
      ? Math.min(5, (seebeckCoefficient * seebeckCoefficient * electricalConductivity * junctionTemperature) / (thermalConductivity + 0.01))
      : 0
  );

  // 8. peltierCoefficient — heat absorbed/released at junction (Pi = S * T)
  const peltierCoefficient = r4(
    Math.min(10, seebeckCoefficient * junctionTemperature * 1.5)
  );

  // 9. thomsonCoefficient — heat exchange in a conductor with temperature gradient
  const thomsonCoefficient = r4(
    Math.min(1, Math.abs(seebeckCoefficient - (neighbors.length > 0
      ? neighbors.reduce((s, b) => {
          const nrf = maxReserve > 0 ? b.totalUsd / maxReserve : 0;
          const ntd = Math.abs(nrf * volumeRatio - neighborTempProxy);
          return s + Math.min(1, ntd * 8 * ((totalUsd > 0 ? b.totalUsd / totalUsd : 0) * 2) / (1 + Math.abs(b.binId - activeBin) * 0.1));
        }, 0) / neighbors.length
      : 0)) * 2)
  );

  // 10. thermalResistance — resistance to heat flow (inverse of conductivity)
  const thermalResistance = r4(
    thermalConductivity > 0.01
      ? Math.min(10, 1 / (thermalConductivity * 0.15 + 0.01))
      : 10
  );

  // 11. contactResistance — interface losses at bin boundaries
  const contactResistance = r4(
    Math.min(1, (1 - reserveFraction) * 0.4 + Math.abs(xFraction - 0.5) * 0.8 + distance * 0.01)
  );

  // 12. jouleHeating — resistive losses (I^2 * R, parasitic heat)
  const jouleHeating = r4(
    Math.min(1, electricalConductivity * contactResistance * 0.15 + (1 - seebeckCoefficient) * 0.2)
  );

  // 13. carnotEfficiency — theoretical maximum conversion efficiency
  const hotTemp = Math.max(junctionTemperature, 0.1);
  const coldTemp = Math.max(hotTemp - thermalGradient * 0.5, 0.01);
  const carnotEfficiency = r4(
    Math.min(1, (hotTemp - coldTemp) / (hotTemp + 0.01) * (1 - jouleHeating * 0.3))
  );

  // 14. thermocoupleFactor — composite 0-1
  const thermocoupleFactor = r4(
    Math.min(1,
      seebeckCoefficient * 0.25 +
      emfOutput / 10 * 0.2 +
      figureOfMerit / 5 * 0.2 +
      carnotEfficiency * 0.15 +
      (1 - jouleHeating) * 0.1 +
      (1 - contactResistance) * 0.1
    )
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    junctionTemperature,
    seebeckCoefficient,
    thermalGradient,
    emfOutput,
    thermalConductivity,
    electricalConductivity,
    figureOfMerit,
    peltierCoefficient,
    thomsonCoefficient,
    thermalResistance,
    contactResistance,
    jouleHeating,
    carnotEfficiency,
    thermocoupleFactor,
  };
}

function analyzeThermocouple(bins: BinReserves[], pool: AppPool): ThermocoupleProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));

  const binTc = sorted.map((b) =>
    computeBinThermocouple(b, activeBin, sorted, totalUsd, volume, maxReserve)
  );

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgJunctionTemperature = r4(avg(binTc.map((b) => b.junctionTemperature)));
  const maxJunctionTemperature = r4(Math.max(...binTc.map((b) => b.junctionTemperature)));
  const avgSeebeckCoefficient = r4(avg(binTc.map((b) => b.seebeckCoefficient)));
  const maxSeebeckCoefficient = r4(Math.max(...binTc.map((b) => b.seebeckCoefficient)));
  const avgThermalGradient = r4(avg(binTc.map((b) => b.thermalGradient)));
  const maxThermalGradient = r4(Math.max(...binTc.map((b) => b.thermalGradient)));
  const avgEmfOutput = r4(avg(binTc.map((b) => b.emfOutput)));
  const maxEmfOutput = r4(Math.max(...binTc.map((b) => b.emfOutput)));
  const avgThermalConductivity = r4(avg(binTc.map((b) => b.thermalConductivity)));
  const maxThermalConductivity = r4(Math.max(...binTc.map((b) => b.thermalConductivity)));
  const avgElectricalConductivity = r4(avg(binTc.map((b) => b.electricalConductivity)));
  const maxElectricalConductivity = r4(Math.max(...binTc.map((b) => b.electricalConductivity)));
  const avgFigureOfMerit = r4(avg(binTc.map((b) => b.figureOfMerit)));
  const maxFigureOfMerit = r4(Math.max(...binTc.map((b) => b.figureOfMerit)));
  const avgPeltierCoefficient = r4(avg(binTc.map((b) => b.peltierCoefficient)));
  const maxPeltierCoefficient = r4(Math.max(...binTc.map((b) => b.peltierCoefficient)));
  const avgThomsonCoefficient = r4(avg(binTc.map((b) => b.thomsonCoefficient)));
  const maxThomsonCoefficient = r4(Math.max(...binTc.map((b) => b.thomsonCoefficient)));
  const avgThermalResistance = r4(avg(binTc.map((b) => b.thermalResistance)));
  const maxThermalResistance = r4(Math.max(...binTc.map((b) => b.thermalResistance)));
  const avgContactResistance = r4(avg(binTc.map((b) => b.contactResistance)));
  const maxContactResistance = r4(Math.max(...binTc.map((b) => b.contactResistance)));
  const avgJouleHeating = r4(avg(binTc.map((b) => b.jouleHeating)));
  const maxJouleHeating = r4(Math.max(...binTc.map((b) => b.jouleHeating)));
  const avgCarnotEfficiency = r4(avg(binTc.map((b) => b.carnotEfficiency)));
  const maxCarnotEfficiency = r4(Math.max(...binTc.map((b) => b.carnotEfficiency)));
  const highSeebeckCount = binTc.filter((b) => b.seebeckCoefficient > 0.5).length;
  const highSeebeckFraction = r4(highSeebeckCount / n);
  const highZTCount = binTc.filter((b) => b.figureOfMerit > 1).length;
  const highZTFraction = r4(highZTCount / n);

  const tcFactors = binTc.map((b) => b.thermocoupleFactor);
  const sortedFactors = [...tcFactors].sort((a, b) => b - a);
  const totalFactors = sortedFactors.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedFactors[i];
  }
  const thermocoupleGini = totalFactors > 0
    ? r4(Math.abs(giniSum) / (n * totalFactors))
    : 0;

  const seebeckScore = Math.min(25, avgSeebeckCoefficient * 25);
  const emfScore = Math.min(25, avgEmfOutput / 10 * 25);
  const ztScore = Math.min(25, avgFigureOfMerit / 5 * 25);
  const efficiencyScore = Math.min(25, avgCarnotEfficiency * 25);
  const thermocoupleIndex = Math.round(
    Math.min(100, seebeckScore + emfScore + ztScore + efficiencyScore)
  );

  let thermocouplePhase: string;
  if (thermocoupleIndex >= 80) thermocouplePhase = "OPTIMAL_THERMOELECTRIC";
  else if (thermocoupleIndex >= 60) thermocouplePhase = "STRONG_SEEBECK";
  else if (thermocoupleIndex >= 40) thermocouplePhase = "MODERATE_GRADIENT";
  else if (thermocoupleIndex >= 20) thermocouplePhase = "WEAK_JUNCTION";
  else thermocouplePhase = "THERMAL_EQUILIBRIUM";

  let thermocoupleVerdict: string;
  if (avgSeebeckCoefficient > 0.6 && avgEmfOutput > 3)
    thermocoupleVerdict = "POWER_GENERATOR";
  else if (avgFigureOfMerit > 2 && avgCarnotEfficiency > 0.4)
    thermocoupleVerdict = "HIGH_ZT_CONVERTER";
  else if (avgThermalConductivity > 5 && avgEmfOutput < 2)
    thermocoupleVerdict = "THERMAL_SHORT_CIRCUIT";
  else if (avgSeebeckCoefficient > 0.4 && avgJouleHeating < 0.3)
    thermocoupleVerdict = "EFFICIENT_JUNCTION";
  else if (avgContactResistance > 0.6 && avgSeebeckCoefficient < 0.2)
    thermocoupleVerdict = "DEGRADED_CONTACT";
  else
    thermocoupleVerdict = "EFFICIENT_JUNCTION";

  const topBins = [...binTc]
    .sort((a, b) => b.thermocoupleFactor - a.thermocoupleFactor)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgJunctionTemperature,
    maxJunctionTemperature,
    avgSeebeckCoefficient,
    maxSeebeckCoefficient,
    avgThermalGradient,
    maxThermalGradient,
    avgEmfOutput,
    maxEmfOutput,
    avgThermalConductivity,
    maxThermalConductivity,
    avgElectricalConductivity,
    maxElectricalConductivity,
    avgFigureOfMerit,
    maxFigureOfMerit,
    avgPeltierCoefficient,
    maxPeltierCoefficient,
    avgThomsonCoefficient,
    maxThomsonCoefficient,
    avgThermalResistance,
    maxThermalResistance,
    avgContactResistance,
    maxContactResistance,
    avgJouleHeating,
    maxJouleHeating,
    avgCarnotEfficiency,
    maxCarnotEfficiency,
    highSeebeckCount,
    highSeebeckFraction,
    highZTCount,
    highZTFraction,
    thermocoupleGini,
    thermocoupleIndex,
    thermocouplePhase,
    thermocoupleVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Thermocouple — Doctor ===\n");
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

  const profiles: ThermocoupleProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeThermocouple(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgThermocoupleIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.thermocoupleIndex)))
      : 0,
    optimalThermoelectricCount: profiles.filter((p) => p.thermocouplePhase === "OPTIMAL_THERMOELECTRIC").length,
    strongSeebeckCount: profiles.filter((p) => p.thermocouplePhase === "STRONG_SEEBECK").length,
    moderateGradientCount: profiles.filter((p) => p.thermocouplePhase === "MODERATE_GRADIENT").length,
    weakJunctionCount: profiles.filter((p) => p.thermocouplePhase === "WEAK_JUNCTION").length,
    thermalEquilibriumCount: profiles.filter((p) => p.thermocouplePhase === "THERMAL_EQUILIBRIUM").length,
    avgSeebeckCoefficient: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgSeebeckCoefficient)))
      : 0,
    avgEmfOutput: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgEmfOutput)))
      : 0,
    totalHighZTBins: profiles.reduce((s, p) => s + p.highZTCount, 0),
    avgThermocoupleGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.thermocoupleGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-thermocouple").description("HODLMM bin thermocouple analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin thermocouple dynamics")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
