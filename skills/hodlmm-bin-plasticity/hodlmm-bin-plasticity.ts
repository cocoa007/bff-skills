#!/usr/bin/env bun
/**
 * hodlmm-bin-plasticity.ts — Day 162 cocoa007 Bitflow Skills Comp
 *
 * Plasticity analyzer — models elastic-plastic deformation, yield behavior,
 * and strain hardening dynamics across HODLMM bins. In materials science,
 * solids under stress respond elastically below the yield point (full recovery
 * upon unloading) and plastically above it (permanent deformation that
 * remains after the load is removed). Strain hardening strengthens the
 * material as plastic deformation accumulates (Hollomon equation
 * sigma = K * epsilon^n). Beyond ultimate tensile strength, necking begins
 * — localized thinning that precedes ductile failure. The Bauschinger effect
 * causes asymmetric yielding under reverse loading, and anelasticity adds
 * time-dependent partial recovery to plastic strain. In DLMM context,
 * trading volume applies stress to bins. Reserves return to equilibrium
 * after small perturbations (elastic) but remain permanently displaced
 * after large ones (plastic). Bins that have already absorbed significant
 * trading become work-hardened — more resistant to further deformation.
 * Bins approaching ultimate strength show necking patterns and risk
 * structural failure.
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

interface BinPlasticity {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  yieldStress: number;            // threshold for plastic deformation, 0-1
  plasticStrain: number;          // permanent deformation accumulated, 0-1
  elasticStrain: number;          // recoverable deformation, 0-1
  strainHardening: number;        // work hardening from plastic deformation, 0-1
  ultimateStrength: number;       // max stress before failure, 0-1
  necking: number;                // localized thinning indicator, 0-1
  flowStress: number;             // stress required to maintain plastic flow, 0-10
  workHardeningExponent: number;  // n in sigma=K*epsilon^n, 0-1
  bauschingerEffect: number;      // asymmetric yielding under reverse load, 0-1
  anelasticity: number;           // time-dependent partial recovery, 0-1
  plasticZone: number;            // size of plastically deformed region, 0-1
  trueStress: number;             // stress accounting for area reduction, 0-10
  residualStress: number;         // locked-in stress after unloading, 0-10
  ductility: number;              // capacity for plastic deformation before failure, 0-1
  plasticityFactor: number;       // composite 0-1
}

interface PlasticityProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgYieldStress: number;
  maxYieldStress: number;
  avgPlasticStrain: number;
  maxPlasticStrain: number;
  avgElasticStrain: number;
  maxElasticStrain: number;
  avgStrainHardening: number;
  maxStrainHardening: number;
  avgUltimateStrength: number;
  maxUltimateStrength: number;
  avgNecking: number;
  maxNecking: number;
  avgFlowStress: number;
  maxFlowStress: number;
  avgWorkHardeningExponent: number;
  maxWorkHardeningExponent: number;
  avgBauschingerEffect: number;
  maxBauschingerEffect: number;
  avgAnelasticity: number;
  maxAnelasticity: number;
  avgPlasticZone: number;
  maxPlasticZone: number;
  avgTrueStress: number;
  maxTrueStress: number;
  avgResidualStress: number;
  maxResidualStress: number;
  avgDuctility: number;
  minDuctility: number;
  // Derived counts
  yieldedCount: number;            // bins with plasticStrain > 0.3
  yieldedFraction: number;
  workHardenedCount: number;       // bins with strainHardening > 0.5
  workHardenedFraction: number;
  neckingCount: number;            // bins with necking > 0.5
  neckingFraction: number;
  // Summary
  plasticityGini: number;
  plasticityIndex: number;
  deformationRegime: string;
  plasticityVerdict: string;
  topBins: BinPlasticity[];
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

function computeBinPlasticity(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  maxReserve: number,
  avgReserve: number
): BinPlasticity {
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

  // Reserve composition (asymmetry indicates deformation)
  const xFraction = bin.totalUsd > 0 ? bin.reserveXUsd / bin.totalUsd : 0.5;
  const imbalance = Math.abs(xFraction - 0.5) * 2;

  // Neighbor reserve variance — proxy for strain field
  const neighborVariance = neighbors.length > 1
    ? neighbors.reduce((s, b) => s + Math.pow(b.totalUsd - neighborAvg, 2), 0) / neighbors.length
    : 0;
  const normalizedStdDev = neighborAvg > 0 ? Math.sqrt(neighborVariance) / neighborAvg : 0;

  // Concentration differential vs neighbors — proxy for stress concentration
  const concentrationDiff = neighborAvg > 0
    ? Math.abs(bin.totalUsd - neighborAvg) / neighborAvg
    : 0;

  // Ratio to pool average
  const avgRatio = avgReserve > 0 ? bin.totalUsd / avgReserve : 1;

  // Neighbor imbalance gradient — directional asymmetry indicator
  const neighborImbalances = neighbors.map((b) => {
    const nxf = b.totalUsd > 0 ? b.reserveXUsd / b.totalUsd : 0.5;
    return Math.abs(nxf - 0.5) * 2;
  });
  const imbalanceGradient = neighborImbalances.length > 0
    ? Math.abs(imbalance - neighborImbalances.reduce((s, v) => s + v, 0) / neighborImbalances.length)
    : 0;

  // -----------------------------------------------------------------------
  // 1. yieldStress — threshold force above which the bin plastically deforms
  // High = strong yield resistance, bin maintains shape under load
  const yieldStress = r4(
    Math.min(1,
      reserveFraction * 0.35 +
      (1 - imbalance) * 0.25 +
      (1 - normalizedStdDev * 0.5) * 0.2 +
      localConcentration * n * 0.1 +
      (1 - distance * 0.008) * 0.1
    )
  );

  // 2. plasticStrain — permanent deformation accumulated
  // High = significant permanent reshaping, bin has been altered by trading stress
  const plasticStrain = r4(
    Math.min(1,
      imbalance * 0.3 +
      concentrationDiff * 0.25 +
      normalizedStdDev * 0.2 +
      volumeRatio * 0.1 +
      Math.abs(1 - avgRatio) * 0.15
    )
  );

  // 3. elasticStrain — recoverable deformation that returns to baseline
  // High = bin can spring back to original shape after stress is removed
  const elasticStrain = r4(
    Math.min(1,
      reserveFraction * 0.3 +
      (1 - imbalance) * 0.25 +
      (1 - plasticStrain) * 0.2 +
      yieldStress * 0.15 +
      (1 - normalizedStdDev * 0.5) * 0.1
    )
  );

  // 4. strainHardening — material strengthens with accumulated plastic strain
  // Hollomon: sigma = K * epsilon^n; high = bin has gained resistance from deformation
  const strainHardening = r4(
    Math.min(1,
      plasticStrain * yieldStress * 0.4 +
      reserveFraction * 0.2 +
      Math.sqrt(plasticStrain) * 0.2 +
      (1 - normalizedStdDev * 0.5) * 0.1 +
      Math.min(1, volumeRatio * 0.5) * 0.1
    )
  );

  // 5. ultimateStrength — maximum stress the bin can sustain before failure
  // High = robust bin, far from collapse
  const ultimateStrength = r4(
    Math.min(1,
      yieldStress * 0.4 +
      strainHardening * 0.25 +
      reserveFraction * 0.2 +
      (1 - imbalance) * 0.1 +
      elasticStrain * 0.05
    )
  );

  // 6. necking — localized thinning that precedes ductile failure
  // High = warning sign of imminent structural failure
  const sortedNeighbors = [...neighbors].sort((a, b) => b.totalUsd - a.totalUsd);
  const deepestNeighbor = sortedNeighbors.length > 0 ? sortedNeighbors[0].totalUsd : 0;
  const neckingRatio = deepestNeighbor > 0 ? bin.totalUsd / deepestNeighbor : 1;
  const necking = r4(
    Math.min(1,
      (1 - reserveFraction) * 0.3 +
      (1 - neckingRatio) * 0.25 +
      imbalance * 0.2 +
      plasticStrain * 0.15 +
      concentrationDiff * 0.1
    )
  );

  // 7. flowStress — stress required to maintain ongoing plastic deformation
  // sigma_f = K * epsilon^n; high = bin requires significant force to deform further
  const flowStress = r4(
    Math.min(10,
      yieldStress * 4 +
      strainHardening * 3 +
      Math.pow(plasticStrain + 0.01, 0.3) * 2 +
      reserveFraction * 1
    )
  );

  // 8. workHardeningExponent — strain hardening rate exponent n
  // High n = strong hardening with deformation; low n = easily yields further
  const workHardeningExponent = r4(
    Math.min(1,
      strainHardening * 0.4 +
      reserveFraction * 0.25 +
      (1 - normalizedStdDev * 0.5) * 0.2 +
      yieldStress * 0.15
    )
  );

  // 9. bauschingerEffect — asymmetric yielding under reverse load direction
  // High = bin yields more easily in the direction opposite to prior deformation
  const bauschingerEffect = r4(
    Math.min(1,
      imbalance * 0.35 +
      imbalanceGradient * 0.25 +
      plasticStrain * 0.2 +
      Math.abs(xFraction - 0.5) * 2 * 0.2
    )
  );

  // 10. anelasticity — time-dependent partial recovery after unloading
  // High = bin shows delayed elastic recovery, hysteretic behavior
  const anelasticity = r4(
    Math.min(1,
      elasticStrain * plasticStrain * 0.5 +
      normalizedStdDev * 0.2 +
      Math.min(1, volumeRatio * 0.5) * 0.15 +
      (1 - reserveFraction * 0.5) * 0.15
    )
  );

  // 11. plasticZone — size of region undergoing plastic deformation
  // High = large plastic zone, bin extensively deformed
  const plasticZone = r4(
    Math.min(1,
      plasticStrain * 0.4 +
      concentrationDiff * 0.25 +
      imbalance * 0.2 +
      normalizedStdDev * 0.15
    )
  );

  // 12. trueStress — stress accounting for cross-sectional area reduction
  // sigma_true = sigma_eng * (1 + epsilon); high = real stress on remaining material
  const trueStress = r4(
    Math.min(10,
      flowStress * (1 + plasticStrain) * 0.5 +
      necking * 3 +
      bauschingerEffect * 2
    )
  );

  // 13. residualStress — locked-in stress remaining after external load is removed
  // High = bin retains internal stress, structurally biased
  const residualStress = r4(
    Math.min(10,
      plasticStrain * 4 +
      bauschingerEffect * 3 +
      anelasticity * 2 +
      imbalance * 1
    )
  );

  // 14. ductility — capacity for plastic deformation before fracture
  // High = bin can absorb significant deformation before failing
  const ductility = r4(
    Math.min(1,
      (1 - necking) * 0.3 +
      reserveFraction * 0.25 +
      strainHardening * 0.2 +
      ultimateStrength * 0.15 +
      (1 - imbalance) * 0.1
    )
  );

  // 15. plasticityFactor — composite 0-1
  // Rewards high yield strength, balanced strain, healthy ductility, low residual stress
  const plasticityFactor = r4(
    Math.min(1,
      yieldStress * 0.15 +
      ultimateStrength * 0.15 +
      ductility * 0.12 +
      strainHardening * 0.1 +
      elasticStrain * 0.1 +
      (1 - necking) * 0.1 +
      (1 - residualStress / 10) * 0.08 +
      workHardeningExponent * 0.06 +
      (1 - plasticStrain * 0.5) * 0.06 +
      (1 - bauschingerEffect * 0.5) * 0.04 +
      (1 - plasticZone * 0.5) * 0.04
    )
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    yieldStress,
    plasticStrain,
    elasticStrain,
    strainHardening,
    ultimateStrength,
    necking,
    flowStress,
    workHardeningExponent,
    bauschingerEffect,
    anelasticity,
    plasticZone,
    trueStress,
    residualStress,
    ductility,
    plasticityFactor,
  };
}

function analyzePlasticity(bins: BinReserves[], pool: AppPool): PlasticityProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));
  const avgReserve = totalUsd / n;

  const binPlasticities = sorted.map((b) =>
    computeBinPlasticity(b, activeBin, sorted, totalUsd, volume, maxReserve, avgReserve)
  );

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgYieldStress = r4(avg(binPlasticities.map((b) => b.yieldStress)));
  const maxYieldStress = r4(Math.max(...binPlasticities.map((b) => b.yieldStress)));
  const avgPlasticStrain = r4(avg(binPlasticities.map((b) => b.plasticStrain)));
  const maxPlasticStrain = r4(Math.max(...binPlasticities.map((b) => b.plasticStrain)));
  const avgElasticStrain = r4(avg(binPlasticities.map((b) => b.elasticStrain)));
  const maxElasticStrain = r4(Math.max(...binPlasticities.map((b) => b.elasticStrain)));
  const avgStrainHardening = r4(avg(binPlasticities.map((b) => b.strainHardening)));
  const maxStrainHardening = r4(Math.max(...binPlasticities.map((b) => b.strainHardening)));
  const avgUltimateStrength = r4(avg(binPlasticities.map((b) => b.ultimateStrength)));
  const maxUltimateStrength = r4(Math.max(...binPlasticities.map((b) => b.ultimateStrength)));
  const avgNecking = r4(avg(binPlasticities.map((b) => b.necking)));
  const maxNecking = r4(Math.max(...binPlasticities.map((b) => b.necking)));
  const avgFlowStress = r4(avg(binPlasticities.map((b) => b.flowStress)));
  const maxFlowStress = r4(Math.max(...binPlasticities.map((b) => b.flowStress)));
  const avgWorkHardeningExponent = r4(avg(binPlasticities.map((b) => b.workHardeningExponent)));
  const maxWorkHardeningExponent = r4(Math.max(...binPlasticities.map((b) => b.workHardeningExponent)));
  const avgBauschingerEffect = r4(avg(binPlasticities.map((b) => b.bauschingerEffect)));
  const maxBauschingerEffect = r4(Math.max(...binPlasticities.map((b) => b.bauschingerEffect)));
  const avgAnelasticity = r4(avg(binPlasticities.map((b) => b.anelasticity)));
  const maxAnelasticity = r4(Math.max(...binPlasticities.map((b) => b.anelasticity)));
  const avgPlasticZone = r4(avg(binPlasticities.map((b) => b.plasticZone)));
  const maxPlasticZone = r4(Math.max(...binPlasticities.map((b) => b.plasticZone)));
  const avgTrueStress = r4(avg(binPlasticities.map((b) => b.trueStress)));
  const maxTrueStress = r4(Math.max(...binPlasticities.map((b) => b.trueStress)));
  const avgResidualStress = r4(avg(binPlasticities.map((b) => b.residualStress)));
  const maxResidualStress = r4(Math.max(...binPlasticities.map((b) => b.residualStress)));
  const avgDuctility = r4(avg(binPlasticities.map((b) => b.ductility)));
  const minDuctility = r4(Math.min(...binPlasticities.map((b) => b.ductility)));

  // Yielded: bins with significant permanent deformation
  const yieldedCount = binPlasticities.filter((b) => b.plasticStrain > 0.3).length;
  const yieldedFraction = r4(yieldedCount / n);

  // Work-hardened: bins that have gained strength from deformation
  const workHardenedCount = binPlasticities.filter((b) => b.strainHardening > 0.5).length;
  const workHardenedFraction = r4(workHardenedCount / n);

  // Necking: bins approaching localized failure
  const neckingCount = binPlasticities.filter((b) => b.necking > 0.5).length;
  const neckingFraction = r4(neckingCount / n);

  // Gini coefficient on plasticityFactor distribution
  const pfFactors = binPlasticities.map((b) => b.plasticityFactor);
  const sortedFactors = [...pfFactors].sort((a, b) => b - a);
  const totalFactors = sortedFactors.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedFactors[i];
  }
  const plasticityGini = totalFactors > 0
    ? r4(Math.abs(giniSum) / (n * totalFactors))
    : 0;

  // Composite plasticity index (0-100)
  // High score means structurally healthy: strong yield, good ductility, low residual stress, intact
  const yieldScore     = Math.min(25, avgYieldStress * 25);
  const ductilityScore = Math.min(25, avgDuctility * 25);
  const integrityScore = Math.min(25, (1 - avgNecking) * 25);
  const recoveryScore  = Math.min(25, (1 - avgResidualStress / 10) * 25);
  const plasticityIndex = Math.round(
    Math.min(100, yieldScore + ductilityScore + integrityScore + recoveryScore)
  );

  // Deformation regime classification (structural health spectrum)
  let deformationRegime: string;
  if (plasticityIndex >= 80)      deformationRegime = "HIGHLY_ELASTIC";
  else if (plasticityIndex >= 60) deformationRegime = "ELASTIC_PLASTIC";
  else if (plasticityIndex >= 40) deformationRegime = "WORK_HARDENED";
  else if (plasticityIndex >= 20) deformationRegime = "PLASTIC";
  else                            deformationRegime = "FAILING";

  // Verdict classification
  let plasticityVerdict: string;
  if (avgElasticStrain > 0.5 && avgPlasticStrain < 0.2 && avgYieldStress > 0.5)
    plasticityVerdict = "ELASTIC_RECOVERY";
  else if (avgPlasticStrain > 0.3 && avgPlasticStrain < 0.5 && avgFlowStress > 4)
    plasticityVerdict = "YIELDING";
  else if (avgStrainHardening > 0.5 && avgWorkHardeningExponent > 0.4)
    plasticityVerdict = "WORK_HARDENING";
  else if (avgPlasticStrain > 0.5 && avgFlowStress > 5)
    plasticityVerdict = "PLASTIC_FLOW";
  else if (avgNecking > 0.5 && neckingFraction > 0.3)
    plasticityVerdict = "NECKING";
  else
    plasticityVerdict = "ELASTIC_PLASTIC_BALANCE";

  const topBins = [...binPlasticities]
    .sort((a, b) => b.plasticityFactor - a.plasticityFactor)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgYieldStress,
    maxYieldStress,
    avgPlasticStrain,
    maxPlasticStrain,
    avgElasticStrain,
    maxElasticStrain,
    avgStrainHardening,
    maxStrainHardening,
    avgUltimateStrength,
    maxUltimateStrength,
    avgNecking,
    maxNecking,
    avgFlowStress,
    maxFlowStress,
    avgWorkHardeningExponent,
    maxWorkHardeningExponent,
    avgBauschingerEffect,
    maxBauschingerEffect,
    avgAnelasticity,
    maxAnelasticity,
    avgPlasticZone,
    maxPlasticZone,
    avgTrueStress,
    maxTrueStress,
    avgResidualStress,
    maxResidualStress,
    avgDuctility,
    minDuctility,
    yieldedCount,
    yieldedFraction,
    workHardenedCount,
    workHardenedFraction,
    neckingCount,
    neckingFraction,
    plasticityGini,
    plasticityIndex,
    deformationRegime,
    plasticityVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Plasticity — Doctor ===\n");
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

  const profiles: PlasticityProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzePlasticity(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgPlasticityIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.plasticityIndex)))
      : 0,
    highlyElasticCount:    profiles.filter((p) => p.deformationRegime === "HIGHLY_ELASTIC").length,
    elasticPlasticCount:   profiles.filter((p) => p.deformationRegime === "ELASTIC_PLASTIC").length,
    workHardenedCount:     profiles.filter((p) => p.deformationRegime === "WORK_HARDENED").length,
    plasticCount:          profiles.filter((p) => p.deformationRegime === "PLASTIC").length,
    failingCount:          profiles.filter((p) => p.deformationRegime === "FAILING").length,
    avgYieldStress: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgYieldStress)))
      : 0,
    avgDuctility: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgDuctility)))
      : 0,
    avgPlasticStrain: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgPlasticStrain)))
      : 0,
    totalYieldedBins: profiles.reduce((s, p) => s + p.yieldedCount, 0),
    totalNeckingBins: profiles.reduce((s, p) => s + p.neckingCount, 0),
    avgPlasticityGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.plasticityGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-plasticity").description("HODLMM bin plasticity analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin plasticity dynamics")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
