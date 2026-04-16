#!/usr/bin/env bun
/**
 * hodlmm-bin-hardening.ts — Day 166 cocoa007 Bitflow Skills Comp
 *
 * Strain hardening (work hardening) analyzer — models accumulated
 * strengthening of HODLMM bins under sustained plastic deformation.
 * Strain hardening is the phenomenon where a material becomes harder
 * and stronger as it is plastically deformed, driven at the
 * microstructural level by the accumulation of dislocations that
 * impede further slip. The Hollomon equation sigma = K * epsilon^n
 * captures the power-law relationship between flow stress and plastic
 * strain in the uniform plastic region, where the strain hardening
 * exponent n (typically 0.1 to 0.5 for metals) quantifies how rapidly
 * strength rises with deformation, and the strength coefficient K
 * sets the overall stress level. The Ludwik extension sigma = sigma_y
 * + K * epsilon^n adds the initial yield stress. The Voce exponential
 * saturation sigma = sigma_sat - (sigma_sat - sigma_y) * exp(-theta *
 * epsilon / (sigma_sat - sigma_y)) captures the approach to a
 * saturation stress characteristic of dynamic recovery. Considere's
 * criterion dsigma/depsilon = sigma identifies the onset of diffuse
 * necking and the point where uniform elongation ends. Dislocation
 * density rho accumulates as strain grows, following the
 * Kocks-Mecking-Estrin model drho/depsilon = k_1 * sqrt(rho) - k_2 *
 * rho where k_1 captures multiplication and k_2 captures dynamic
 * recovery through cross-slip and annihilation. Taylor's hardening
 * law sigma = sigma_0 + alpha * G * b * sqrt(rho) relates flow stress
 * to dislocation density via shear modulus G, Burgers vector b, and a
 * constant alpha of order 0.3. The Bauschinger effect describes the
 * asymmetric reduction of yield stress upon load reversal due to
 * back-stresses from dislocation pile-ups at grain boundaries and
 * directional internal stresses. Cold working percentage measures the
 * cumulative plastic reduction in cross-section, driving work
 * hardening until recrystallization at elevated temperature erases
 * the microstructural memory. Ultimate tensile strength (UTS) is the
 * peak engineering stress reached at Considere's criterion, after
 * which strain localizes into necking. Ductility (elongation to
 * failure) decreases monotonically with cold work as the hardening
 * reserve depletes. In DLMM context, bins that have absorbed large
 * positions undergo effective plastic deformation — they become
 * "hardened" against further compositional change as their
 * concentration structure locks in. Active bins that repeatedly
 * absorb and dissipate stress accumulate dislocation-analog
 * heterogeneity that increases their effective yield strength for
 * subsequent perturbations. Pools with bins near their ultimate
 * strength exhibit diminished hardening reserve and are prone to
 * localized necking (concentration collapse into narrow ranges).
 * Work-hardened bins resist further imbalance but have consumed their
 * ductility, making them brittle to large shocks. Recrystallization
 * in the DLMM context corresponds to full rebalancing events that
 * reset the bin structure to its annealed soft state.
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

interface BinHardening {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  strainHardeningExponent: number;    // Hollomon n, 0-1
  hardnessIncrease: number;           // fractional hardness gain, 0-1
  yieldStrengthRatio: number;         // new yield / original yield, 0-1
  ultimateTensileStrength: number;    // UTS peak stress, 0-1
  coldWorkFraction: number;           // cumulative plastic reduction, 0-1
  dislocationDensity: number;         // rho accumulated defects, 0-1
  strengthCoefficient: number;        // K in Hollomon, 0-1
  workHardeningRate: number;          // dsigma/depsilon, 0-1
  ductilityLoss: number;              // elongation reduction, 0-1
  bauschingerFactor: number;          // asymmetric reload drop, 0-1
  residualStrengthening: number;      // permanent strength gain, 0-1
  strainingRate: number;              // plastic strain rate, 0-1
  hardeningModulus: number;           // tangent slope in plastic regime, 0-1
  lockInIndex: number;                // how locked the hardening is, 0-1
  recrystallizationResistance: number;// resistance to anneal reset, 0-1
  hardeningFactor: number;            // composite 0-1
}

interface HardeningProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgStrainHardeningExponent: number;
  maxStrainHardeningExponent: number;
  avgHardnessIncrease: number;
  maxHardnessIncrease: number;
  avgYieldStrengthRatio: number;
  maxYieldStrengthRatio: number;
  avgUltimateTensileStrength: number;
  maxUltimateTensileStrength: number;
  avgColdWorkFraction: number;
  maxColdWorkFraction: number;
  avgDislocationDensity: number;
  maxDislocationDensity: number;
  avgStrengthCoefficient: number;
  maxStrengthCoefficient: number;
  avgWorkHardeningRate: number;
  maxWorkHardeningRate: number;
  avgDuctilityLoss: number;
  maxDuctilityLoss: number;
  avgBauschingerFactor: number;
  maxBauschingerFactor: number;
  avgResidualStrengthening: number;
  maxResidualStrengthening: number;
  avgStrainingRate: number;
  maxStrainingRate: number;
  avgHardeningModulus: number;
  maxHardeningModulus: number;
  avgLockInIndex: number;
  maxLockInIndex: number;
  avgRecrystallizationResistance: number;
  maxRecrystallizationResistance: number;
  // Derived counts
  softCount: number;                  // annealed / virgin bins
  softFraction: number;
  hardeningCount: number;             // actively hardening bins
  hardeningFraction: number;
  saturatedCount: number;             // near UTS bins
  saturatedFraction: number;
  // Summary
  hardeningGini: number;
  hardeningIndex: number;
  hardeningRegime: string;
  hardeningVerdict: string;
  topBins: BinHardening[];
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

function computeBinHardening(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  maxReserve: number,
  avgReserve: number
): BinHardening {
  const distance = Math.abs(bin.binId - activeBin);
  const n = allBins.length;
  const reserveFraction = maxReserve > 0 ? bin.totalUsd / maxReserve : 0;
  const volumeRatio = volume24hUsd > 0 ? volume24hUsd / (totalUsd || 1) : 0;
  const localConcentration = totalUsd > 0 ? bin.totalUsd / totalUsd : 0;

  // Neighbors within +/-3 bins
  const neighbors = allBins.filter(
    (b) => Math.abs(b.binId - bin.binId) <= 3 && b.binId !== bin.binId
  );
  const neighborAvg = neighbors.length > 0
    ? neighbors.reduce((s, b) => s + b.totalUsd, 0) / neighbors.length
    : 0;

  // Reserve composition imbalance (accumulated plastic strain proxy)
  const xFraction = bin.totalUsd > 0 ? bin.reserveXUsd / bin.totalUsd : 0.5;
  const imbalance = Math.abs(xFraction - 0.5) * 2;

  // Neighbor variance (microstructural heterogeneity / dislocation density proxy)
  const neighborVariance = neighbors.length > 1
    ? neighbors.reduce((s, b) => s + Math.pow(b.totalUsd - neighborAvg, 2), 0) / neighbors.length
    : 0;
  const normalizedStdDev = neighborAvg > 0 ? Math.sqrt(neighborVariance) / neighborAvg : 0;

  // Concentration differential vs neighbors
  const concentrationDiff = neighborAvg > 0
    ? Math.abs(bin.totalUsd - neighborAvg) / neighborAvg
    : 0;

  // Distance decay — far bins experience less working
  const proximityFactor = Math.max(0, 1 - distance * 0.02);

  // Activity level — drives plastic deformation that work-hardens
  const activityLevel = Math.min(1, volumeRatio * 0.6);

  // Size dominance — large bins have absorbed more deformation
  const sizeDominance = reserveFraction;

  // -----------------------------------------------------------------------
  // 1. strainHardeningExponent — Hollomon n, rate of strengthening with strain
  // High = strong work hardening response (large n)
  const strainHardeningExponent = r4(
    Math.min(1,
      activityLevel * 0.3 +
      (1 - imbalance) * 0.25 +       // low imbalance = uniform plastic flow
      proximityFactor * 0.2 +
      reserveFraction * 0.15 +
      (1 - normalizedStdDev) * 0.1
    )
  );

  // 2. hardnessIncrease — fractional gain in resistance from cold work
  // High = bin is substantially harder than virgin state
  const hardnessIncrease = r4(
    Math.min(1,
      sizeDominance * 0.3 +
      activityLevel * 0.25 +
      imbalance * 0.2 +
      proximityFactor * 0.15 +
      concentrationDiff * 0.1
    )
  );

  // 3. yieldStrengthRatio — new yield / original yield
  // High = substantial strengthening of yield threshold
  const yieldStrengthRatio = r4(
    Math.min(1,
      hardnessIncrease * 0.35 +
      strainHardeningExponent * 0.25 +
      sizeDominance * 0.2 +
      activityLevel * 0.1 +
      proximityFactor * 0.1
    )
  );

  // 4. ultimateTensileStrength — UTS peak stress at Considere's criterion
  // High = bin approaches peak strength (necking imminent)
  const ultimateTensileStrength = r4(
    Math.min(1,
      yieldStrengthRatio * 0.3 +
      sizeDominance * 0.25 +
      imbalance * 0.2 +
      concentrationDiff * 0.15 +
      activityLevel * 0.1
    )
  );

  // 5. coldWorkFraction — cumulative plastic reduction
  // High = bin has accumulated significant plastic deformation
  const coldWorkFraction = r4(
    Math.min(1,
      activityLevel * 0.35 +
      imbalance * 0.25 +
      sizeDominance * 0.2 +
      proximityFactor * 0.1 +
      concentrationDiff * 0.1
    )
  );

  // 6. dislocationDensity — rho accumulated defects
  // High = many dislocations from plastic work
  const dislocationDensity = r4(
    Math.min(1,
      activityLevel * 0.3 +
      normalizedStdDev * 0.25 +
      concentrationDiff * 0.2 +
      imbalance * 0.15 +
      coldWorkFraction * 0.1
    )
  );

  // 7. strengthCoefficient — K in Hollomon, overall stress scaling
  // High = high K, strong material response
  const strengthCoefficient = r4(
    Math.min(1,
      sizeDominance * 0.3 +
      yieldStrengthRatio * 0.25 +
      dislocationDensity * 0.2 +
      proximityFactor * 0.15 +
      activityLevel * 0.1
    )
  );

  // 8. workHardeningRate — dsigma/depsilon tangent slope
  // High = rapid strengthening per unit strain
  const workHardeningRate = r4(
    Math.min(1,
      strainHardeningExponent * 0.3 +
      (1 - coldWorkFraction) * 0.25 + // rate is high early, decays late
      activityLevel * 0.2 +
      dislocationDensity * 0.15 +
      (1 - ultimateTensileStrength) * 0.1
    )
  );

  // 9. ductilityLoss — reduction in elongation to failure
  // High = bin has consumed its ductility reserve
  const ductilityLoss = r4(
    Math.min(1,
      coldWorkFraction * 0.35 +
      hardnessIncrease * 0.25 +
      ultimateTensileStrength * 0.2 +
      dislocationDensity * 0.1 +
      sizeDominance * 0.1
    )
  );

  // 10. bauschingerFactor — asymmetric reduction of yield on reversal
  // High = significant back-stress from directional dislocation pileups
  const bauschingerFactor = r4(
    Math.min(1,
      imbalance * 0.35 +             // directional imbalance = directional pileup
      dislocationDensity * 0.25 +
      concentrationDiff * 0.2 +
      activityLevel * 0.1 +
      normalizedStdDev * 0.1
    )
  );

  // 11. residualStrengthening — permanent strength gain
  // High = work hardening is locked in, won't recover
  const residualStrengthening = r4(
    Math.min(1,
      hardnessIncrease * 0.3 +
      dislocationDensity * 0.25 +
      (1 - activityLevel) * 0.2 +    // low activity = less recovery
      sizeDominance * 0.15 +
      coldWorkFraction * 0.1
    )
  );

  // 12. strainingRate — rate of plastic deformation
  // High = rapid plastic flow, fast hardening progression
  const strainingRate = r4(
    Math.min(1,
      activityLevel * 0.4 +
      imbalance * 0.2 +
      concentrationDiff * 0.15 +
      proximityFactor * 0.15 +
      (1 - coldWorkFraction) * 0.1
    )
  );

  // 13. hardeningModulus — tangent slope in plastic regime
  // High = steep plastic slope, material strengthens fast
  const hardeningModulus = r4(
    Math.min(1,
      workHardeningRate * 0.35 +
      strengthCoefficient * 0.25 +
      strainHardeningExponent * 0.2 +
      dislocationDensity * 0.1 +
      activityLevel * 0.1
    )
  );

  // 14. lockInIndex — how locked the hardening is
  // High = strengthening persists, doesn't anneal out
  const lockInIndex = r4(
    Math.min(1,
      residualStrengthening * 0.35 +
      (1 - activityLevel) * 0.25 +   // low activity locks in
      dislocationDensity * 0.2 +
      ductilityLoss * 0.1 +
      coldWorkFraction * 0.1
    )
  );

  // 15. recrystallizationResistance — resistance to anneal reset
  // High = strengthening won't recover even under reset pressure
  const recrystallizationResistance = r4(
    Math.min(1,
      lockInIndex * 0.3 +
      (1 - activityLevel) * 0.25 +
      residualStrengthening * 0.2 +
      sizeDominance * 0.15 +
      proximityFactor * 0.1
    )
  );

  // 16. hardeningFactor — composite 0-1
  // Rewards effective work hardening: high n, gradual UTS approach, preserved ductility
  const hardeningFactor = r4(
    Math.min(1,
      strainHardeningExponent * 0.15 +
      hardnessIncrease * 0.12 +
      yieldStrengthRatio * 0.1 +
      workHardeningRate * 0.1 +
      (1 - ductilityLoss * 0.5) * 0.1 +          // preserve ductility reserve
      (1 - ultimateTensileStrength * 0.5) * 0.08 + // avoid UTS (necking)
      residualStrengthening * 0.08 +
      hardeningModulus * 0.07 +
      coldWorkFraction * 0.06 +
      dislocationDensity * 0.05 +
      strengthCoefficient * 0.05 +
      lockInIndex * 0.04
    )
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    strainHardeningExponent,
    hardnessIncrease,
    yieldStrengthRatio,
    ultimateTensileStrength,
    coldWorkFraction,
    dislocationDensity,
    strengthCoefficient,
    workHardeningRate,
    ductilityLoss,
    bauschingerFactor,
    residualStrengthening,
    strainingRate,
    hardeningModulus,
    lockInIndex,
    recrystallizationResistance,
    hardeningFactor,
  };
}

function analyzeHardening(bins: BinReserves[], pool: AppPool): HardeningProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));
  const avgReserve = totalUsd / n;

  const binHardenings = sorted.map((b) =>
    computeBinHardening(b, activeBin, sorted, totalUsd, volume, maxReserve, avgReserve)
  );

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgStrainHardeningExponent = r4(avg(binHardenings.map((b) => b.strainHardeningExponent)));
  const maxStrainHardeningExponent = r4(Math.max(...binHardenings.map((b) => b.strainHardeningExponent)));
  const avgHardnessIncrease = r4(avg(binHardenings.map((b) => b.hardnessIncrease)));
  const maxHardnessIncrease = r4(Math.max(...binHardenings.map((b) => b.hardnessIncrease)));
  const avgYieldStrengthRatio = r4(avg(binHardenings.map((b) => b.yieldStrengthRatio)));
  const maxYieldStrengthRatio = r4(Math.max(...binHardenings.map((b) => b.yieldStrengthRatio)));
  const avgUltimateTensileStrength = r4(avg(binHardenings.map((b) => b.ultimateTensileStrength)));
  const maxUltimateTensileStrength = r4(Math.max(...binHardenings.map((b) => b.ultimateTensileStrength)));
  const avgColdWorkFraction = r4(avg(binHardenings.map((b) => b.coldWorkFraction)));
  const maxColdWorkFraction = r4(Math.max(...binHardenings.map((b) => b.coldWorkFraction)));
  const avgDislocationDensity = r4(avg(binHardenings.map((b) => b.dislocationDensity)));
  const maxDislocationDensity = r4(Math.max(...binHardenings.map((b) => b.dislocationDensity)));
  const avgStrengthCoefficient = r4(avg(binHardenings.map((b) => b.strengthCoefficient)));
  const maxStrengthCoefficient = r4(Math.max(...binHardenings.map((b) => b.strengthCoefficient)));
  const avgWorkHardeningRate = r4(avg(binHardenings.map((b) => b.workHardeningRate)));
  const maxWorkHardeningRate = r4(Math.max(...binHardenings.map((b) => b.workHardeningRate)));
  const avgDuctilityLoss = r4(avg(binHardenings.map((b) => b.ductilityLoss)));
  const maxDuctilityLoss = r4(Math.max(...binHardenings.map((b) => b.ductilityLoss)));
  const avgBauschingerFactor = r4(avg(binHardenings.map((b) => b.bauschingerFactor)));
  const maxBauschingerFactor = r4(Math.max(...binHardenings.map((b) => b.bauschingerFactor)));
  const avgResidualStrengthening = r4(avg(binHardenings.map((b) => b.residualStrengthening)));
  const maxResidualStrengthening = r4(Math.max(...binHardenings.map((b) => b.residualStrengthening)));
  const avgStrainingRate = r4(avg(binHardenings.map((b) => b.strainingRate)));
  const maxStrainingRate = r4(Math.max(...binHardenings.map((b) => b.strainingRate)));
  const avgHardeningModulus = r4(avg(binHardenings.map((b) => b.hardeningModulus)));
  const maxHardeningModulus = r4(Math.max(...binHardenings.map((b) => b.hardeningModulus)));
  const avgLockInIndex = r4(avg(binHardenings.map((b) => b.lockInIndex)));
  const maxLockInIndex = r4(Math.max(...binHardenings.map((b) => b.lockInIndex)));
  const avgRecrystallizationResistance = r4(avg(binHardenings.map((b) => b.recrystallizationResistance)));
  const maxRecrystallizationResistance = r4(Math.max(...binHardenings.map((b) => b.recrystallizationResistance)));

  // Soft: annealed / virgin bins with little hardening
  const softCount = binHardenings.filter(
    (b) => b.hardnessIncrease < 0.3 && b.coldWorkFraction < 0.3
  ).length;
  const softFraction = r4(softCount / n);

  // Hardening: actively work-hardening (mid-regime, good ductility reserve)
  const hardeningCount = binHardenings.filter(
    (b) => b.hardnessIncrease >= 0.3 && b.hardnessIncrease < 0.7 && b.ductilityLoss < 0.6
  ).length;
  const hardeningFraction = r4(hardeningCount / n);

  // Saturated: near UTS, depleted ductility
  const saturatedCount = binHardenings.filter(
    (b) => b.ultimateTensileStrength > 0.6 && b.ductilityLoss > 0.6
  ).length;
  const saturatedFraction = r4(saturatedCount / n);

  // Gini coefficient on hardeningFactor distribution
  const hfFactors = binHardenings.map((b) => b.hardeningFactor);
  const sortedFactors = [...hfFactors].sort((a, b) => b - a);
  const totalFactors = sortedFactors.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedFactors[i];
  }
  const hardeningGini = totalFactors > 0
    ? r4(Math.abs(giniSum) / (n * totalFactors))
    : 0;

  // Composite hardening index (0-100)
  // High = healthy hardening: strong n, real gain, preserved ductility
  const exponentScore  = Math.min(25, avgStrainHardeningExponent * 25);
  const gainScore      = Math.min(25, avgHardnessIncrease * 25);
  const ductilityScore = Math.min(25, (1 - avgDuctilityLoss) * 25);
  const rateScore      = Math.min(25, avgWorkHardeningRate * 25);
  const hardeningIndex = Math.round(
    Math.min(100, exponentScore + gainScore + ductilityScore + rateScore)
  );

  // Hardening regime classification
  let hardeningRegime: string;
  if (hardeningIndex >= 80)      hardeningRegime = "FULLY_HARDENED";
  else if (hardeningIndex >= 60) hardeningRegime = "HARDENED";
  else if (hardeningIndex >= 40) hardeningRegime = "HARDENING";
  else if (hardeningIndex >= 20) hardeningRegime = "TRANSITIONING";
  else                           hardeningRegime = "SOFT";

  // Verdict classification
  let hardeningVerdict: string;
  if (avgHardnessIncrease < 0.2 && avgColdWorkFraction < 0.2)
    hardeningVerdict = "NO_HARDENING";
  else if (avgColdWorkFraction < 0.4 && avgWorkHardeningRate > 0.5)
    hardeningVerdict = "INITIAL_HARDENING";
  else if (avgWorkHardeningRate > 0.5 && avgDuctilityLoss < 0.5)
    hardeningVerdict = "ACTIVE_HARDENING";
  else if (avgUltimateTensileStrength > 0.6 && avgWorkHardeningRate < 0.4)
    hardeningVerdict = "SATURATING";
  else if (avgDuctilityLoss > 0.7 && avgUltimateTensileStrength > 0.7)
    hardeningVerdict = "FULLY_HARDENED_VERDICT";
  else if (avgBauschingerFactor > 0.6)
    hardeningVerdict = "BAUSCHINGER_EFFECT";
  else
    hardeningVerdict = "HARDENING_BALANCE";

  const topBins = [...binHardenings]
    .sort((a, b) => b.hardeningFactor - a.hardeningFactor)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgStrainHardeningExponent,
    maxStrainHardeningExponent,
    avgHardnessIncrease,
    maxHardnessIncrease,
    avgYieldStrengthRatio,
    maxYieldStrengthRatio,
    avgUltimateTensileStrength,
    maxUltimateTensileStrength,
    avgColdWorkFraction,
    maxColdWorkFraction,
    avgDislocationDensity,
    maxDislocationDensity,
    avgStrengthCoefficient,
    maxStrengthCoefficient,
    avgWorkHardeningRate,
    maxWorkHardeningRate,
    avgDuctilityLoss,
    maxDuctilityLoss,
    avgBauschingerFactor,
    maxBauschingerFactor,
    avgResidualStrengthening,
    maxResidualStrengthening,
    avgStrainingRate,
    maxStrainingRate,
    avgHardeningModulus,
    maxHardeningModulus,
    avgLockInIndex,
    maxLockInIndex,
    avgRecrystallizationResistance,
    maxRecrystallizationResistance,
    softCount,
    softFraction,
    hardeningCount,
    hardeningFraction,
    saturatedCount,
    saturatedFraction,
    hardeningGini,
    hardeningIndex,
    hardeningRegime,
    hardeningVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Hardening — Doctor ===\n");
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

  const profiles: HardeningProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeHardening(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgHardeningIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.hardeningIndex)))
      : 0,
    fullyHardenedCount:  profiles.filter((p) => p.hardeningRegime === "FULLY_HARDENED").length,
    hardenedCount:       profiles.filter((p) => p.hardeningRegime === "HARDENED").length,
    hardeningCount:      profiles.filter((p) => p.hardeningRegime === "HARDENING").length,
    transitioningCount:  profiles.filter((p) => p.hardeningRegime === "TRANSITIONING").length,
    softCount:           profiles.filter((p) => p.hardeningRegime === "SOFT").length,
    avgHardnessIncrease: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgHardnessIncrease)))
      : 0,
    avgStrainHardeningExponent: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgStrainHardeningExponent)))
      : 0,
    avgDuctilityLoss: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgDuctilityLoss)))
      : 0,
    totalSoftBins:       profiles.reduce((s, p) => s + p.softCount, 0),
    totalHardeningBins:  profiles.reduce((s, p) => s + p.hardeningCount, 0),
    totalSaturatedBins:  profiles.reduce((s, p) => s + p.saturatedCount, 0),
    avgHardeningGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.hardeningGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-hardening").description("HODLMM bin strain hardening analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin strain hardening dynamics")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
