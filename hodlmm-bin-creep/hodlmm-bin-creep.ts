#!/usr/bin/env bun
/**
 * hodlmm-bin-creep.ts — Day 164 cocoa007 Bitflow Skills Comp
 *
 * Creep analyzer — models time-dependent plastic deformation under
 * sustained stress across HODLMM bins. In materials science, creep is
 * the tendency of a solid material to move slowly or deform permanently
 * under the influence of persistent mechanical stresses, even below the
 * yield strength. Creep becomes significant at homologous temperatures
 * above ~0.4 Tm (fraction of melting point). It proceeds through three
 * classical stages: primary (transient) creep with decreasing strain
 * rate as dislocation substructure develops, secondary (steady-state)
 * creep at constant minimum strain rate where hardening and recovery
 * balance, and tertiary (accelerating) creep where void nucleation and
 * necking drive runaway deformation to rupture. Norton's power law
 * gives steady-state strain rate: d_epsilon/dt = A * sigma^n *
 * exp(-Q/RT), with stress exponent n identifying the dominant creep
 * mechanism (n ~ 1 for diffusional creep, n ~ 3-5 for dislocation
 * climb, n ~ 5-8 for dislocation glide). The Larson-Miller parameter
 * LMP = T(C + log(t_r)) collapses time-temperature-stress data onto
 * a single master curve for rupture life prediction. Andrade's
 * equation combines primary and secondary creep: epsilon = epsilon_0
 * + beta*t^(1/3) + kappa*t. Grain boundary sliding becomes dominant
 * at high temperatures, and void nucleation at boundaries precedes
 * tertiary creep and ultimate rupture. In DLMM context, sustained
 * trading pressure creates persistent stress on bins. High-volatility
 * pools operate at elevated homologous temperature analogues where
 * creep processes activate. Bins accumulate permanent deformation
 * (composition drift) that does not recover even after the driving
 * stress is removed, eventually leading to structural rupture where
 * reserve distributions become chaotic.
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

interface BinCreep {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  creepStrain: number;              // accumulated permanent deformation, 0-1
  creepRate: number;                // steady-state strain rate, 0-1
  stressLevel: number;              // applied sustained stress, 0-1
  homologousTemperature: number;    // T/Tm analogue (volatility proxy), 0-1
  primaryCreep: number;             // transient phase contribution, 0-1
  secondaryCreep: number;           // steady-state phase strength, 0-1
  tertiaryCreep: number;            // accelerating phase intensity, 0-1
  ruptureTime: number;              // estimated time to failure, 0-1
  stressExponent: number;           // Norton's n, 0-10
  activationEnergy: number;         // Q/RT analogue, 0-1
  larsonMillerParam: number;        // LMP rupture prediction, 0-1
  dislocationDensity: number;       // substructure indicator, 0-1
  diffusionFlux: number;            // atomic diffusion rate, 0-1
  grainBoundarySlide: number;       // boundary sliding contribution, 0-1
  voidNucleation: number;           // cavity formation at boundaries, 0-1
  creepFactor: number;              // composite 0-1
}

interface CreepProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgCreepStrain: number;
  maxCreepStrain: number;
  avgCreepRate: number;
  maxCreepRate: number;
  avgStressLevel: number;
  maxStressLevel: number;
  avgHomologousTemperature: number;
  maxHomologousTemperature: number;
  avgPrimaryCreep: number;
  maxPrimaryCreep: number;
  avgSecondaryCreep: number;
  maxSecondaryCreep: number;
  avgTertiaryCreep: number;
  maxTertiaryCreep: number;
  avgRuptureTime: number;
  minRuptureTime: number;
  avgStressExponent: number;
  maxStressExponent: number;
  avgActivationEnergy: number;
  maxActivationEnergy: number;
  avgLarsonMillerParam: number;
  maxLarsonMillerParam: number;
  avgDislocationDensity: number;
  maxDislocationDensity: number;
  avgDiffusionFlux: number;
  maxDiffusionFlux: number;
  avgGrainBoundarySlide: number;
  maxGrainBoundarySlide: number;
  avgVoidNucleation: number;
  maxVoidNucleation: number;
  // Derived counts
  noCreepCount: number;             // bins below creep threshold
  noCreepFraction: number;
  deformingCount: number;           // bins with significant creep strain
  deformingFraction: number;
  rupturingCount: number;           // bins in tertiary creep
  rupturingFraction: number;
  // Summary
  creepGini: number;
  creepIndex: number;
  creepRegime: string;
  creepVerdict: string;
  topBins: BinCreep[];
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

function computeBinCreep(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  maxReserve: number,
  avgReserve: number
): BinCreep {
  const distance = Math.abs(bin.binId - activeBin);
  const n = allBins.length;
  const reserveFraction = maxReserve > 0 ? bin.totalUsd / maxReserve : 0;
  const volumeRatio = volume24hUsd > 0 ? volume24hUsd / (totalUsd || 1) : 0;
  const localConcentration = totalUsd > 0 ? bin.totalUsd / totalUsd : 0;

  // Neighbors within +/-3 bins for gradient calculations
  const neighbors = allBins.filter(
    (b) => Math.abs(b.binId - bin.binId) <= 3 && b.binId !== bin.binId
  );
  const neighborAvg = neighbors.length > 0
    ? neighbors.reduce((s, b) => s + b.totalUsd, 0) / neighbors.length
    : 0;

  // Reserve composition (asymmetry indicates directional deformation)
  const xFraction = bin.totalUsd > 0 ? bin.reserveXUsd / bin.totalUsd : 0.5;
  const imbalance = Math.abs(xFraction - 0.5) * 2;

  // Neighbor reserve variance — proxy for local stress heterogeneity
  const neighborVariance = neighbors.length > 1
    ? neighbors.reduce((s, b) => s + Math.pow(b.totalUsd - neighborAvg, 2), 0) / neighbors.length
    : 0;
  const normalizedStdDev = neighborAvg > 0 ? Math.sqrt(neighborVariance) / neighborAvg : 0;

  // Concentration differential vs neighbors — proxy for local strain gradient
  const concentrationDiff = neighborAvg > 0
    ? Math.abs(bin.totalUsd - neighborAvg) / neighborAvg
    : 0;

  // Ratio to pool average
  const avgRatio = avgReserve > 0 ? bin.totalUsd / avgReserve : 1;

  // Distance decay — bins further from active experience less sustained stress
  const proximityFactor = Math.max(0, 1 - distance * 0.02);

  // -----------------------------------------------------------------------
  // 1. stressLevel — applied sustained stress driving creep deformation
  // High = sustained load drives faster creep strain accumulation
  const stressLevel = r4(
    Math.min(1,
      Math.min(1, volumeRatio * 0.5) * 0.3 +
      proximityFactor * 0.25 +
      imbalance * 0.2 +
      reserveFraction * 0.15 +
      localConcentration * n * 0.1
    )
  );

  // 2. homologousTemperature — T/Tm analogue from volatility
  // Creep becomes significant above T/Tm > 0.4
  const homologousTemperature = r4(
    Math.min(1,
      Math.min(1, volumeRatio * 0.6) * 0.35 +
      normalizedStdDev * 0.25 +
      imbalance * 0.2 +
      concentrationDiff * 0.2
    )
  );

  // 3. creepStrain — accumulated permanent deformation from sustained stress
  // Cannot recover even if stress is removed
  const creepStrain = r4(
    Math.min(1,
      imbalance * 0.3 +
      concentrationDiff * 0.25 +
      Math.min(1, volumeRatio * 0.4) * 0.2 +
      normalizedStdDev * 0.15 +
      (1 - reserveFraction) * 0.1
    )
  );

  // 4. creepRate — steady-state strain rate (Norton's law d_eps/dt = A*sigma^n)
  // High = rapid ongoing deformation, short life
  const creepRate = r4(
    Math.min(1,
      stressLevel * 0.3 +
      homologousTemperature * 0.3 +
      Math.min(1, volumeRatio * 0.5) * 0.2 +
      (1 - reserveFraction) * 0.1 +
      imbalance * 0.1
    )
  );

  // 5. primaryCreep — transient phase with decreasing strain rate
  // Dislocation substructure forming, strain hardening
  const primaryCreep = r4(
    Math.min(1,
      (1 - creepStrain) * 0.3 +                          // early in creep life
      stressLevel * 0.25 +
      homologousTemperature * 0.2 +
      Math.min(1, volumeRatio * 0.3) * 0.15 +
      (creepStrain < 0.3 ? 0.1 : 0)                      // bonus if early
    )
  );

  // 6. secondaryCreep — steady-state phase at constant minimum rate
  // Hardening and recovery balanced, longest phase
  const secondaryCreep = r4(
    Math.min(1,
      (creepStrain > 0.2 && creepStrain < 0.7 ? 0.3 : 0.1) +    // mid-life
      stressLevel * 0.25 +
      homologousTemperature * 0.2 +
      (1 - Math.abs(creepRate - 0.4)) * 0.15 +           // steady rate
      (1 - concentrationDiff * 0.5) * 0.1
    )
  );

  // 7. tertiaryCreep — accelerating phase toward rupture
  // Void nucleation, necking, rapid strain increase
  const tertiaryCreep = r4(
    Math.min(1,
      creepStrain * 0.3 +                                // advanced strain
      creepRate * 0.25 +
      (creepStrain > 0.6 ? 0.2 : 0) +                    // late phase bonus
      concentrationDiff * 0.15 +
      imbalance * 0.1
    )
  );

  // 8. ruptureTime — estimated time/fraction until creep rupture
  // Low = imminent rupture, high = long life remaining
  const ruptureTime = r4(
    Math.min(1,
      (1 - creepStrain) * 0.3 +
      (1 - creepRate) * 0.25 +
      (1 - tertiaryCreep) * 0.2 +
      reserveFraction * 0.15 +
      (1 - stressLevel) * 0.1
    )
  );

  // 9. stressExponent — Norton's n, identifies creep mechanism
  // n ~ 1: diffusional creep, n ~ 3-5: dislocation climb, n ~ 5-8: glide
  const stressExponent = r4(
    Math.min(10,
      3 +                                                 // baseline dislocation creep
      stressLevel * 3 +
      homologousTemperature * 2 +
      (1 - reserveFraction) * 2
    )
  );

  // 10. activationEnergy — Q/RT analogue, thermal activation for diffusion
  // High = difficult to activate creep (good), low = easy to creep
  const activationEnergy = r4(
    Math.min(1,
      (1 - homologousTemperature) * 0.35 +
      reserveFraction * 0.25 +
      (1 - stressLevel) * 0.2 +
      (1 - imbalance) * 0.2
    )
  );

  // 11. larsonMillerParam — LMP = T(C + log(t_r)) rupture parameter
  // Collapses time-temp-stress onto master curve for rupture prediction
  const larsonMillerParam = r4(
    Math.min(1,
      homologousTemperature * 0.35 +
      (1 - Math.log10(1 + stressLevel * 9) / Math.log10(10)) * 0.25 +  // log stress penalty
      creepStrain * 0.2 +
      tertiaryCreep * 0.2
    )
  );

  // 12. dislocationDensity — mobile + forest dislocation density
  // Substructure indicator, increases through primary, stable in secondary
  const dislocationDensity = r4(
    Math.min(1,
      creepStrain * 0.3 +
      primaryCreep * 0.25 +
      stressLevel * 0.2 +
      homologousTemperature * 0.15 +
      Math.min(1, volumeRatio * 0.3) * 0.1
    )
  );

  // 13. diffusionFlux — atomic diffusion rate (grain boundary + lattice)
  // Drives Coble/Nabarro-Herring creep at high T, low stress
  const diffusionFlux = r4(
    Math.min(1,
      homologousTemperature * 0.4 +
      (1 - reserveFraction) * 0.2 +                      // small reserves = fast diffusion
      normalizedStdDev * 0.2 +
      concentrationDiff * 0.2
    )
  );

  // 14. grainBoundarySlide — boundary sliding contribution
  // Dominant at high homologous T, contributes to creep deformation
  const grainBoundarySlide = r4(
    Math.min(1,
      homologousTemperature * 0.35 +
      diffusionFlux * 0.25 +
      concentrationDiff * 0.2 +
      imbalance * 0.2
    )
  );

  // 15. voidNucleation — cavity formation at grain boundaries
  // Precedes tertiary creep, ultimate failure mechanism
  const voidNucleation = r4(
    Math.min(1,
      tertiaryCreep * 0.35 +
      grainBoundarySlide * 0.2 +
      creepStrain * 0.2 +
      (1 - reserveFraction) * 0.15 +
      stressLevel * 0.1
    )
  );

  // 16. creepFactor — composite 0-1
  // Rewards low creep strain, low rate, long rupture time, minimal tertiary/voids
  const creepFactor = r4(
    Math.min(1,
      (1 - creepStrain) * 0.15 +
      (1 - creepRate) * 0.15 +
      ruptureTime * 0.15 +
      activationEnergy * 0.1 +
      (1 - tertiaryCreep) * 0.1 +
      (1 - voidNucleation) * 0.08 +
      (1 - grainBoundarySlide * 0.5) * 0.07 +
      (1 - larsonMillerParam) * 0.06 +
      (1 - dislocationDensity * 0.5) * 0.05 +
      (1 - homologousTemperature * 0.5) * 0.05 +
      (1 - diffusionFlux * 0.5) * 0.04
    )
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    creepStrain,
    creepRate,
    stressLevel,
    homologousTemperature,
    primaryCreep,
    secondaryCreep,
    tertiaryCreep,
    ruptureTime,
    stressExponent,
    activationEnergy,
    larsonMillerParam,
    dislocationDensity,
    diffusionFlux,
    grainBoundarySlide,
    voidNucleation,
    creepFactor,
  };
}

function analyzeCreep(bins: BinReserves[], pool: AppPool): CreepProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));
  const avgReserve = totalUsd / n;

  const binCreeps = sorted.map((b) =>
    computeBinCreep(b, activeBin, sorted, totalUsd, volume, maxReserve, avgReserve)
  );

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgCreepStrain = r4(avg(binCreeps.map((b) => b.creepStrain)));
  const maxCreepStrain = r4(Math.max(...binCreeps.map((b) => b.creepStrain)));
  const avgCreepRate = r4(avg(binCreeps.map((b) => b.creepRate)));
  const maxCreepRate = r4(Math.max(...binCreeps.map((b) => b.creepRate)));
  const avgStressLevel = r4(avg(binCreeps.map((b) => b.stressLevel)));
  const maxStressLevel = r4(Math.max(...binCreeps.map((b) => b.stressLevel)));
  const avgHomologousTemperature = r4(avg(binCreeps.map((b) => b.homologousTemperature)));
  const maxHomologousTemperature = r4(Math.max(...binCreeps.map((b) => b.homologousTemperature)));
  const avgPrimaryCreep = r4(avg(binCreeps.map((b) => b.primaryCreep)));
  const maxPrimaryCreep = r4(Math.max(...binCreeps.map((b) => b.primaryCreep)));
  const avgSecondaryCreep = r4(avg(binCreeps.map((b) => b.secondaryCreep)));
  const maxSecondaryCreep = r4(Math.max(...binCreeps.map((b) => b.secondaryCreep)));
  const avgTertiaryCreep = r4(avg(binCreeps.map((b) => b.tertiaryCreep)));
  const maxTertiaryCreep = r4(Math.max(...binCreeps.map((b) => b.tertiaryCreep)));
  const avgRuptureTime = r4(avg(binCreeps.map((b) => b.ruptureTime)));
  const minRuptureTime = r4(Math.min(...binCreeps.map((b) => b.ruptureTime)));
  const avgStressExponent = r4(avg(binCreeps.map((b) => b.stressExponent)));
  const maxStressExponent = r4(Math.max(...binCreeps.map((b) => b.stressExponent)));
  const avgActivationEnergy = r4(avg(binCreeps.map((b) => b.activationEnergy)));
  const maxActivationEnergy = r4(Math.max(...binCreeps.map((b) => b.activationEnergy)));
  const avgLarsonMillerParam = r4(avg(binCreeps.map((b) => b.larsonMillerParam)));
  const maxLarsonMillerParam = r4(Math.max(...binCreeps.map((b) => b.larsonMillerParam)));
  const avgDislocationDensity = r4(avg(binCreeps.map((b) => b.dislocationDensity)));
  const maxDislocationDensity = r4(Math.max(...binCreeps.map((b) => b.dislocationDensity)));
  const avgDiffusionFlux = r4(avg(binCreeps.map((b) => b.diffusionFlux)));
  const maxDiffusionFlux = r4(Math.max(...binCreeps.map((b) => b.diffusionFlux)));
  const avgGrainBoundarySlide = r4(avg(binCreeps.map((b) => b.grainBoundarySlide)));
  const maxGrainBoundarySlide = r4(Math.max(...binCreeps.map((b) => b.grainBoundarySlide)));
  const avgVoidNucleation = r4(avg(binCreeps.map((b) => b.voidNucleation)));
  const maxVoidNucleation = r4(Math.max(...binCreeps.map((b) => b.voidNucleation)));

  // No creep: bins below homologous T threshold (T/Tm < 0.4) with low strain
  const noCreepCount = binCreeps.filter(
    (b) => b.homologousTemperature < 0.4 && b.creepStrain < 0.2
  ).length;
  const noCreepFraction = r4(noCreepCount / n);

  // Deforming: bins with active creep strain
  const deformingCount = binCreeps.filter((b) => b.creepStrain > 0.4).length;
  const deformingFraction = r4(deformingCount / n);

  // Rupturing: bins in tertiary creep with void nucleation
  const rupturingCount = binCreeps.filter(
    (b) => b.tertiaryCreep > 0.5 && b.voidNucleation > 0.5
  ).length;
  const rupturingFraction = r4(rupturingCount / n);

  // Gini coefficient on creepFactor distribution
  const cfFactors = binCreeps.map((b) => b.creepFactor);
  const sortedFactors = [...cfFactors].sort((a, b) => b - a);
  const totalFactors = sortedFactors.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedFactors[i];
  }
  const creepGini = totalFactors > 0
    ? r4(Math.abs(giniSum) / (n * totalFactors))
    : 0;

  // Composite creep index (0-100)
  // High score = elastic/pristine: low strain, long rupture, no voids
  const strainScore    = Math.min(25, (1 - avgCreepStrain) * 25);
  const ruptureScore   = Math.min(25, avgRuptureTime * 25);
  const tertiaryScore  = Math.min(25, (1 - avgTertiaryCreep) * 25);
  const voidScore      = Math.min(25, (1 - avgVoidNucleation) * 25);
  const creepIndex = Math.round(
    Math.min(100, strainScore + ruptureScore + tertiaryScore + voidScore)
  );

  // Creep regime classification (deformation stage spectrum)
  let creepRegime: string;
  if (creepIndex >= 80)      creepRegime = "ELASTIC";
  else if (creepIndex >= 60) creepRegime = "PRIMARY";
  else if (creepIndex >= 40) creepRegime = "SECONDARY";
  else if (creepIndex >= 20) creepRegime = "TERTIARY";
  else                       creepRegime = "RUPTURE";

  // Verdict classification
  let creepVerdict: string;
  if (avgHomologousTemperature < 0.4 && avgCreepStrain < 0.15)
    creepVerdict = "NO_CREEP";
  else if (avgPrimaryCreep > 0.5 && avgCreepStrain < 0.3)
    creepVerdict = "TRANSIENT_STABILIZING";
  else if (avgSecondaryCreep > 0.5 && avgTertiaryCreep < 0.4)
    creepVerdict = "STEADY_STATE";
  else if (avgTertiaryCreep > 0.5 && avgVoidNucleation < 0.6)
    creepVerdict = "ACCELERATING";
  else if (avgVoidNucleation > 0.6 && rupturingFraction > 0.3)
    creepVerdict = "IMMINENT_RUPTURE";
  else
    creepVerdict = "CREEP_BALANCE";

  const topBins = [...binCreeps]
    .sort((a, b) => b.creepFactor - a.creepFactor)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgCreepStrain,
    maxCreepStrain,
    avgCreepRate,
    maxCreepRate,
    avgStressLevel,
    maxStressLevel,
    avgHomologousTemperature,
    maxHomologousTemperature,
    avgPrimaryCreep,
    maxPrimaryCreep,
    avgSecondaryCreep,
    maxSecondaryCreep,
    avgTertiaryCreep,
    maxTertiaryCreep,
    avgRuptureTime,
    minRuptureTime,
    avgStressExponent,
    maxStressExponent,
    avgActivationEnergy,
    maxActivationEnergy,
    avgLarsonMillerParam,
    maxLarsonMillerParam,
    avgDislocationDensity,
    maxDislocationDensity,
    avgDiffusionFlux,
    maxDiffusionFlux,
    avgGrainBoundarySlide,
    maxGrainBoundarySlide,
    avgVoidNucleation,
    maxVoidNucleation,
    noCreepCount,
    noCreepFraction,
    deformingCount,
    deformingFraction,
    rupturingCount,
    rupturingFraction,
    creepGini,
    creepIndex,
    creepRegime,
    creepVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Creep — Doctor ===\n");
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

  const profiles: CreepProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeCreep(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgCreepIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.creepIndex)))
      : 0,
    elasticCount:   profiles.filter((p) => p.creepRegime === "ELASTIC").length,
    primaryCount:   profiles.filter((p) => p.creepRegime === "PRIMARY").length,
    secondaryCount: profiles.filter((p) => p.creepRegime === "SECONDARY").length,
    tertiaryCount:  profiles.filter((p) => p.creepRegime === "TERTIARY").length,
    ruptureCount:   profiles.filter((p) => p.creepRegime === "RUPTURE").length,
    avgCreepStrain: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgCreepStrain)))
      : 0,
    avgRuptureTime: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgRuptureTime)))
      : 0,
    avgTertiaryCreep: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgTertiaryCreep)))
      : 0,
    totalDeformingBins: profiles.reduce((s, p) => s + p.deformingCount, 0),
    totalRupturingBins: profiles.reduce((s, p) => s + p.rupturingCount, 0),
    avgCreepGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.creepGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-creep").description("HODLMM bin creep analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin creep dynamics")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
