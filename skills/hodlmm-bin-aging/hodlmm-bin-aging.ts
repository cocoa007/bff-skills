#!/usr/bin/env bun
/**
 * hodlmm-bin-aging.ts — Day 169 cocoa007 Bitflow Skills Comp
 *
 * Aging analyzer — models precipitation hardening and property
 * evolution of HODLMM bins under prolonged trading exposure. Treats
 * reserve composition as a supersaturated solid solution that ages
 * over time, where excess solute (imbalance) precipitates out into
 * hardening particles that strengthen the bin until coarsening
 * (overaging) reduces the gain. The classical aging sequence runs
 * supersaturated solid solution alpha_ss -> Guinier-Preston (GP)
 * zones -> intermediate metastable phases (theta-double-prime,
 * theta-prime, eta-prime) -> equilibrium incoherent phases (theta,
 * eta), with strength rising through the underaged regime, peaking
 * at T6 temper when coherent precipitates achieve optimal size and
 * density, and declining through the overaged regime as Ostwald
 * ripening coarsens particles past the critical strengthening size
 * r_c. The Orowan looping mechanism dominates strengthening at
 * large precipitate spacing where dislocations bypass particles by
 * bowing between them: tau_Orowan = G * b / lambda. The shearing
 * mechanism dominates at small coherent particles where dislocations
 * cut through them: tau_shear scales with f^(1/2) * r^(1/2). Peak
 * hardness occurs at the cutting-to-looping transition. Coherency
 * strain arises from lattice mismatch. Coarsening kinetics follow
 * LSW theory r^3 - r_0^3 = K_LSW * t. Total yield strength sums
 * baseline matrix, solid solution, and precipitation contributions
 * via the Pythagorean superposition rule. In DLMM context, bins
 * acquire 'solute' over time as one-sided trading injects an excess
 * of one token; this supersaturated state can age by precipitating
 * the imbalance into stable concentration zones, or be depleted by
 * reverse flow.
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

interface BinAging {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  supersaturation: number;          // excess solute, 0-1
  nucleationRate: number;           // precipitate formation rate, 0-1
  growthRate: number;               // precipitate growth velocity, 0-1
  coarseningRate: number;           // Ostwald ripening rate, 0-1
  precipitateDensity: number;       // particle number density, 0-1
  precipitateSize: number;          // average particle radius, 0-1
  agingTime: number;                // effective aging exposure, 0-1
  strengthIncrement: number;        // sigma_ppt, 0-1
  peakHardness: number;             // T6 max strength, 0-1
  underagingDeficit: number;        // strength deficit from short aging, 0-1
  overagingPenalty: number;         // strength loss from coarsening, 0-1
  coherencyStrain: number;          // lattice mismatch strain, 0-1
  solidSolutionStrength: number;    // baseline matrix sigma_ss, 0-1
  precipitationHardening: number;   // composite strengthening, 0-1
  agingProximity: number;           // proximity to peak T6, 0-1
  agingFactor: number;              // composite 0-1 (higher = healthier)
}

interface AgingProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgSupersaturation: number;
  maxSupersaturation: number;
  avgNucleationRate: number;
  maxNucleationRate: number;
  avgGrowthRate: number;
  maxGrowthRate: number;
  avgCoarseningRate: number;
  maxCoarseningRate: number;
  avgPrecipitateDensity: number;
  maxPrecipitateDensity: number;
  avgPrecipitateSize: number;
  maxPrecipitateSize: number;
  avgAgingTime: number;
  maxAgingTime: number;
  avgStrengthIncrement: number;
  maxStrengthIncrement: number;
  avgPeakHardness: number;
  maxPeakHardness: number;
  avgUnderagingDeficit: number;
  maxUnderagingDeficit: number;
  avgOveragingPenalty: number;
  maxOveragingPenalty: number;
  avgCoherencyStrain: number;
  maxCoherencyStrain: number;
  avgSolidSolutionStrength: number;
  minSolidSolutionStrength: number;
  avgPrecipitationHardening: number;
  maxPrecipitationHardening: number;
  avgAgingProximity: number;
  maxAgingProximity: number;
  // Derived counts
  t6Count: number;
  t6Fraction: number;
  agingCount: number;
  agingFraction: number;
  depletedCount: number;
  depletedFraction: number;
  // Summary
  agingGini: number;
  agingIndex: number;
  agingRegime: string;
  agingVerdict: string;
  topBins: BinAging[];
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

function computeBinAging(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  maxReserve: number,
  avgReserve: number
): BinAging {
  const distance = Math.abs(bin.binId - activeBin);
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

  // Reserve composition imbalance (excess solute proxy)
  const xFraction = bin.totalUsd > 0 ? bin.reserveXUsd / bin.totalUsd : 0.5;
  const imbalance = Math.abs(xFraction - 0.5) * 2;

  // Neighbor variance (precipitate distribution heterogeneity proxy)
  const neighborVariance = neighbors.length > 1
    ? neighbors.reduce((s, b) => s + Math.pow(b.totalUsd - neighborAvg, 2), 0) / neighbors.length
    : 0;
  const normalizedStdDev = neighborAvg > 0 ? Math.sqrt(neighborVariance) / neighborAvg : 0;

  // Concentration differential vs neighbors (lattice mismatch proxy)
  const concentrationDiff = neighborAvg > 0
    ? Math.abs(bin.totalUsd - neighborAvg) / neighborAvg
    : 0;

  // Distance decay — far bins experience less trading driver for aging
  const proximityFactor = Math.max(0, 1 - distance * 0.02);

  // Activity level — opposing aging by remixing solute
  const activityLevel = Math.min(1, volumeRatio * 0.6);

  // Size dominance — large bins have more solute for precipitation
  const sizeDominance = reserveFraction;

  // -----------------------------------------------------------------------
  // 1. supersaturation — excess solute above equilibrium
  // High = far from equilibrium, has aging potential
  const supersaturation = r4(
    Math.min(1,
      imbalance * 0.4 +                // imbalance = excess of one species
      sizeDominance * 0.2 +
      concentrationDiff * 0.2 +
      (1 - activityLevel) * 0.1 +      // low activity = solute trapped
      (1 - proximityFactor) * 0.1
    )
  );

  // 2. nucleationRate — rate of new precipitate formation
  // Driven by supersaturation; classical nucleation theory rate
  // I = I_0 * exp(-DG*/kT) scales with supersaturation^2
  const nucleationRate = r4(
    Math.min(1,
      supersaturation * 0.4 +
      activityLevel * 0.25 +           // some activity drives nucleation kinetics
      normalizedStdDev * 0.15 +
      concentrationDiff * 0.1 +
      proximityFactor * 0.1
    )
  );

  // 3. growthRate — precipitate growth velocity
  // Diffusion-controlled growth dr/dt = D * (C - C_eq) / r
  const growthRate = r4(
    Math.min(1,
      supersaturation * 0.3 +
      activityLevel * 0.25 +           // diffusion driver
      sizeDominance * 0.2 +
      proximityFactor * 0.15 +
      (1 - normalizedStdDev) * 0.1
    )
  );

  // 4. agingTime — effective aging exposure
  // High = sustained imbalance with low remixing
  const agingTime = r4(
    Math.min(1,
      sizeDominance * 0.3 +            // large bins persist
      (1 - activityLevel) * 0.25 +     // low activity = long undisturbed
      imbalance * 0.2 +                // sustained one-sided
      (1 - normalizedStdDev) * 0.15 +
      proximityFactor * 0.1
    )
  );

  // 5. precipitateDensity — number density of hardening particles
  // High = abundant nuclei surviving to maturity
  const precipitateDensity = r4(
    Math.min(1,
      nucleationRate * 0.35 +
      sizeDominance * 0.2 +
      (1 - normalizedStdDev) * 0.15 +
      proximityFactor * 0.15 +
      supersaturation * 0.15
    )
  );

  // 6. precipitateSize — average particle radius normalized to r_c
  // Grows with aging time; coarsening drives further growth past peak
  const precipitateSize = r4(
    Math.min(1,
      agingTime * 0.4 +
      growthRate * 0.25 +
      (1 - nucleationRate) * 0.15 +    // few nuclei = each grows larger
      sizeDominance * 0.1 +
      activityLevel * 0.1
    )
  );

  // 7. coarseningRate — Ostwald ripening rate (LSW kinetics)
  // r^3 - r_0^3 = K_LSW * t — large particles grow at expense of small
  const coarseningRate = r4(
    Math.min(1,
      precipitateSize * 0.35 +         // larger particles coarsen faster
      activityLevel * 0.25 +           // diffusion driver
      agingTime * 0.2 +
      (1 - precipitateDensity) * 0.1 + // sparse population coarsens
      normalizedStdDev * 0.1
    )
  );

  // 8. coherencyStrain — lattice mismatch strain energy
  // High = strong precipitate-matrix coherency boosting tau_coh
  // Coherent at small sizes, lost at large sizes
  const coherencyStrain = r4(
    Math.min(1,
      (1 - precipitateSize) * 0.35 +   // small = coherent
      precipitateDensity * 0.2 +
      concentrationDiff * 0.2 +        // misfit proxy
      supersaturation * 0.15 +
      (1 - coarseningRate) * 0.1
    )
  );

  // 9. underagingDeficit — strength deficit from incomplete aging
  // High = aging time too short, precipitates underdeveloped
  const underagingDeficit = r4(
    Math.min(1,
      (1 - agingTime) * 0.35 +
      (1 - precipitateDensity) * 0.25 +
      (1 - precipitateSize) * 0.2 +    // undersized particles
      activityLevel * 0.1 +
      (1 - supersaturation) * 0.1
    )
  );

  // 10. overagingPenalty — strength loss from coarsening past peak
  // High = severe overaging with degraded strength
  const overagingPenalty = r4(
    Math.min(1,
      precipitateSize * 0.3 +          // oversized = past peak
      coarseningRate * 0.3 +
      (1 - coherencyStrain) * 0.2 +    // lost coherency
      agingTime * 0.1 +
      (1 - precipitateDensity) * 0.1   // sparse coarsened population
    )
  );

  // 11. solidSolutionStrength — sigma_ss baseline matrix
  // Fleischer scaling: tau_ss ~ f_solute^(2/3)
  const solidSolutionStrength = r4(
    Math.min(1,
      Math.pow(supersaturation, 2 / 3) * 0.4 +
      sizeDominance * 0.25 +
      (1 - precipitateDensity) * 0.15 + // solute remaining in matrix
      proximityFactor * 0.1 +
      (1 - imbalance) * 0.1            // dilute uniform = baseline
    )
  );

  // 12. strengthIncrement — sigma_ppt precipitation contribution
  // Orowan + shearing combined; peaks at intermediate r
  // Cutting: tau_shear ~ sqrt(f * r); Looping: tau_Orowan ~ G*b/lambda ~ G*b*sqrt(f)/r
  // Peak where they cross
  const cuttingContribution = Math.sqrt(precipitateDensity * (1 - precipitateSize)) * coherencyStrain;
  const loopingContribution = Math.sqrt(precipitateDensity) / Math.max(0.2, precipitateSize);
  const rawIncrement = Math.min(cuttingContribution, loopingContribution);
  const strengthIncrement = r4(
    Math.min(1,
      rawIncrement * 0.5 +
      precipitateDensity * 0.2 +
      coherencyStrain * 0.15 +
      (1 - overagingPenalty) * 0.15
    )
  );

  // 13. peakHardness — maximum strength achievable at T6
  // Pythagorean superposition: sigma_y^2 = sigma_matrix^2 + sigma_ss^2 + sigma_ppt^2
  const sigmaMatrix = 0.3 + 0.3 * sizeDominance;
  const peakHardnessRaw = Math.sqrt(
    sigmaMatrix * sigmaMatrix +
    solidSolutionStrength * solidSolutionStrength +
    strengthIncrement * strengthIncrement
  ) / Math.sqrt(3); // normalize to 0-1 range
  const peakHardness = r4(Math.min(1, peakHardnessRaw));

  // 14. precipitationHardening — composite precipitation contribution
  // High = dominant precipitation strengthening mechanism
  const precipitationHardening = r4(
    Math.min(1,
      strengthIncrement * 0.4 +
      precipitateDensity * 0.2 +
      coherencyStrain * 0.2 +
      (1 - overagingPenalty) * 0.1 +
      (1 - underagingDeficit) * 0.1
    )
  );

  // 15. agingProximity — proximity to peak T6 hardness
  // High = at peak; low = far from peak in either direction
  // Distance from peak = max of underaging and overaging deficits
  const distanceFromPeak = Math.max(underagingDeficit, overagingPenalty);
  const agingProximity = r4(
    Math.min(1, 1 - distanceFromPeak)
  );

  // 16. agingFactor — composite 0-1 (higher = healthier aged state)
  // Rewards near-peak strength with strong precipitation contribution
  // and minimal coarsening or under-development
  const agingFactor = r4(
    Math.min(1,
      peakHardness * 0.15 +
      agingProximity * 0.12 +
      strengthIncrement * 0.1 +
      precipitationHardening * 0.1 +
      (1 - overagingPenalty) * 0.1 +
      (1 - underagingDeficit) * 0.08 +
      coherencyStrain * 0.07 +
      precipitateDensity * 0.07 +
      (1 - coarseningRate) * 0.06 +
      solidSolutionStrength * 0.05 +
      supersaturation * 0.05 +
      (1 - precipitateSize) * 0.05
    )
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    supersaturation,
    nucleationRate,
    growthRate,
    coarseningRate,
    precipitateDensity,
    precipitateSize,
    agingTime,
    strengthIncrement,
    peakHardness,
    underagingDeficit,
    overagingPenalty,
    coherencyStrain,
    solidSolutionStrength,
    precipitationHardening,
    agingProximity,
    agingFactor,
  };
}

function analyzeAging(bins: BinReserves[], pool: AppPool): AgingProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));
  const avgReserve = totalUsd / n;

  const binAgings = sorted.map((b) =>
    computeBinAging(b, activeBin, sorted, totalUsd, volume, maxReserve, avgReserve)
  );

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgSupersaturation = r4(avg(binAgings.map((b) => b.supersaturation)));
  const maxSupersaturation = r4(Math.max(...binAgings.map((b) => b.supersaturation)));
  const avgNucleationRate = r4(avg(binAgings.map((b) => b.nucleationRate)));
  const maxNucleationRate = r4(Math.max(...binAgings.map((b) => b.nucleationRate)));
  const avgGrowthRate = r4(avg(binAgings.map((b) => b.growthRate)));
  const maxGrowthRate = r4(Math.max(...binAgings.map((b) => b.growthRate)));
  const avgCoarseningRate = r4(avg(binAgings.map((b) => b.coarseningRate)));
  const maxCoarseningRate = r4(Math.max(...binAgings.map((b) => b.coarseningRate)));
  const avgPrecipitateDensity = r4(avg(binAgings.map((b) => b.precipitateDensity)));
  const maxPrecipitateDensity = r4(Math.max(...binAgings.map((b) => b.precipitateDensity)));
  const avgPrecipitateSize = r4(avg(binAgings.map((b) => b.precipitateSize)));
  const maxPrecipitateSize = r4(Math.max(...binAgings.map((b) => b.precipitateSize)));
  const avgAgingTime = r4(avg(binAgings.map((b) => b.agingTime)));
  const maxAgingTime = r4(Math.max(...binAgings.map((b) => b.agingTime)));
  const avgStrengthIncrement = r4(avg(binAgings.map((b) => b.strengthIncrement)));
  const maxStrengthIncrement = r4(Math.max(...binAgings.map((b) => b.strengthIncrement)));
  const avgPeakHardness = r4(avg(binAgings.map((b) => b.peakHardness)));
  const maxPeakHardness = r4(Math.max(...binAgings.map((b) => b.peakHardness)));
  const avgUnderagingDeficit = r4(avg(binAgings.map((b) => b.underagingDeficit)));
  const maxUnderagingDeficit = r4(Math.max(...binAgings.map((b) => b.underagingDeficit)));
  const avgOveragingPenalty = r4(avg(binAgings.map((b) => b.overagingPenalty)));
  const maxOveragingPenalty = r4(Math.max(...binAgings.map((b) => b.overagingPenalty)));
  const avgCoherencyStrain = r4(avg(binAgings.map((b) => b.coherencyStrain)));
  const maxCoherencyStrain = r4(Math.max(...binAgings.map((b) => b.coherencyStrain)));
  const avgSolidSolutionStrength = r4(avg(binAgings.map((b) => b.solidSolutionStrength)));
  const minSolidSolutionStrength = r4(Math.min(...binAgings.map((b) => b.solidSolutionStrength)));
  const avgPrecipitationHardening = r4(avg(binAgings.map((b) => b.precipitationHardening)));
  const maxPrecipitationHardening = r4(Math.max(...binAgings.map((b) => b.precipitationHardening)));
  const avgAgingProximity = r4(avg(binAgings.map((b) => b.agingProximity)));
  const maxAgingProximity = r4(Math.max(...binAgings.map((b) => b.agingProximity)));

  // T6 (peak temper): high peak hardness with high aging proximity
  const t6Count = binAgings.filter(
    (b) => b.peakHardness > 0.6 && b.agingProximity > 0.6
  ).length;
  const t6Fraction = r4(t6Count / n);

  // Aging (mid-stage): moderate proximity with developing precipitates
  const agingCount = binAgings.filter(
    (b) => b.agingProximity >= 0.3 && b.agingProximity < 0.6
  ).length;
  const agingFraction = r4(agingCount / n);

  // Depleted: severe overaging or solute depletion
  const depletedCount = binAgings.filter(
    (b) => b.overagingPenalty >= 0.6 || (b.supersaturation < 0.2 && b.precipitationHardening < 0.3)
  ).length;
  const depletedFraction = r4(depletedCount / n);

  // Gini on agingFactor distribution
  const afFactors = binAgings.map((b) => b.agingFactor);
  const sortedFactors = [...afFactors].sort((a, b) => b - a);
  const totalFactors = sortedFactors.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedFactors[i];
  }
  const agingGini = totalFactors > 0
    ? r4(Math.abs(giniSum) / (n * totalFactors))
    : 0;

  // Composite aging index (0-100)
  // High = healthy aged state near peak with strong precipitation
  const peakScore       = Math.min(25, avgPeakHardness * 25);
  const proximityScore  = Math.min(25, avgAgingProximity * 25);
  const incrementScore  = Math.min(25, avgStrengthIncrement * 25);
  const reserveScore    = Math.min(25, (1 - avgOveragingPenalty) * 25);
  const agingIndex = Math.round(
    Math.min(100, peakScore + proximityScore + incrementScore + reserveScore)
  );

  // Aging regime classification
  let agingRegime: string;
  if (agingIndex >= 80)      agingRegime = "T6";
  else if (agingIndex >= 60) agingRegime = "HARDENED";
  else if (agingIndex >= 40) agingRegime = "AGING";
  else if (agingIndex >= 20) agingRegime = "UNDERAGED";
  else                        agingRegime = "DEPLETED";

  // Verdict classification
  let agingVerdict: string;
  if (avgStrengthIncrement > 0.6 && avgOveragingPenalty < 0.3 && avgUnderagingDeficit < 0.3)
    agingVerdict = "PEAK_HARDNESS";
  else if (avgUnderagingDeficit > 0.6 && avgPrecipitateDensity < 0.4)
    agingVerdict = "UNDERAGED_DEFICIT";
  else if (avgOveragingPenalty > 0.6 && avgCoarseningRate > 0.5)
    agingVerdict = "OVERAGING_DECLINE";
  else if (avgSupersaturation > 0.6 && avgAgingTime < 0.4)
    agingVerdict = "SUPERSATURATED_SOLUTE";
  else if (avgCoherencyStrain > 0.6 && avgPrecipitateSize < 0.4)
    agingVerdict = "COHERENT_DOMINANT";
  else if (avgPrecipitateSize > 0.6 && avgCoherencyStrain < 0.4)
    agingVerdict = "INCOHERENT_COARSE";
  else if (avgSolidSolutionStrength > 0.6 && avgPrecipitationHardening < 0.4)
    agingVerdict = "SOLID_SOLUTION_REGIME";
  else
    agingVerdict = "AGING_BALANCE";

  const topBins = [...binAgings]
    .sort((a, b) => b.agingFactor - a.agingFactor)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgSupersaturation,
    maxSupersaturation,
    avgNucleationRate,
    maxNucleationRate,
    avgGrowthRate,
    maxGrowthRate,
    avgCoarseningRate,
    maxCoarseningRate,
    avgPrecipitateDensity,
    maxPrecipitateDensity,
    avgPrecipitateSize,
    maxPrecipitateSize,
    avgAgingTime,
    maxAgingTime,
    avgStrengthIncrement,
    maxStrengthIncrement,
    avgPeakHardness,
    maxPeakHardness,
    avgUnderagingDeficit,
    maxUnderagingDeficit,
    avgOveragingPenalty,
    maxOveragingPenalty,
    avgCoherencyStrain,
    maxCoherencyStrain,
    avgSolidSolutionStrength,
    minSolidSolutionStrength,
    avgPrecipitationHardening,
    maxPrecipitationHardening,
    avgAgingProximity,
    maxAgingProximity,
    t6Count,
    t6Fraction,
    agingCount,
    agingFraction,
    depletedCount,
    depletedFraction,
    agingGini,
    agingIndex,
    agingRegime,
    agingVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Aging — Doctor ===\n");
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

  const profiles: AgingProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeAging(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgAgingIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.agingIndex)))
      : 0,
    t6Count:         profiles.filter((p) => p.agingRegime === "T6").length,
    hardenedCount:   profiles.filter((p) => p.agingRegime === "HARDENED").length,
    agingCount:      profiles.filter((p) => p.agingRegime === "AGING").length,
    underagedCount:  profiles.filter((p) => p.agingRegime === "UNDERAGED").length,
    depletedCount:   profiles.filter((p) => p.agingRegime === "DEPLETED").length,
    avgPeakHardness: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgPeakHardness)))
      : 0,
    avgAgingProximity: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgAgingProximity)))
      : 0,
    avgOveragingPenalty: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgOveragingPenalty)))
      : 0,
    totalT6Bins:        profiles.reduce((s, p) => s + p.t6Count, 0),
    totalAgingBins:     profiles.reduce((s, p) => s + p.agingCount, 0),
    totalDepletedBins:  profiles.reduce((s, p) => s + p.depletedCount, 0),
    avgAgingGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.agingGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-aging").description("HODLMM bin precipitation hardening / aging analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin aging state")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
