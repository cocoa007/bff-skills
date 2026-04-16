#!/usr/bin/env bun
/**
 * hodlmm-bin-solidification.ts — Day 170 cocoa007 Bitflow Skills Comp
 *
 * Solidification analyzer — models the liquid-to-solid phase
 * transition of HODLMM bin reserves. Treats active high-turnover
 * bins as liquid melt that, when cooled by reduced trading
 * activity and sustained imbalance, nucleates a solid phase that
 * grows as dendrites into the surrounding bin space. Classical
 * solidification theory: the planar front destabilizes under
 * constitutional supercooling when the thermal gradient G_T is
 * smaller than the liquidus gradient m_L * C_0 * (1 - k) /
 * (D * k), and a Mullins-Sekerka instability triggers dendritic
 * growth. Primary dendrite arm spacing lambda_1 scales with
 * G_T^(-1/2) * V^(-1/4) and secondary spacing lambda_2 grows as
 * t^(1/3) via coarsening (Trivedi-Kurz). Solute partitioning is
 * governed by the partition coefficient k = C_s/C_l; Scheil-
 * Gulliver equation C_s = k * C_0 * (1 - f_s)^(k-1) describes
 * microsegregation in the mushy zone between liquidus and
 * solidus. Columnar-to-equiaxed transition (CET) occurs when
 * nucleation rate in the undercooled liquid exceeds a critical
 * threshold. In DLMM context, bins freeze when activity drops
 * and composition stabilizes; dendrites represent extended
 * stable concentration arms; mushy zones contain partially
 * solidified reserves in transition; equiaxed structures mark
 * polycrystalline pools with multiple nucleation sites.
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

interface BinSolidification {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  undercooling: number;              // thermal + constitutional, 0-1
  nucleationRate: number;            // heterogeneous nuclei density, 0-1
  solidFraction: number;             // f_s in mushy zone, 0-1
  dendriteGrowthRate: number;        // V_tip, 0-1
  primaryArmSpacing: number;         // lambda_1 normalized, 0-1 (high = coarse)
  secondaryArmSpacing: number;       // lambda_2 normalized, 0-1
  partitionCoefficient: number;      // k = C_s/C_l proxy, 0-1
  microsegregation: number;          // Scheil segregation index, 0-1
  macrosegregation: number;          // pool-scale composition gradient, 0-1
  mushyZoneWidth: number;            // liquidus-solidus gap, 0-1
  constitutionalSupercooling: number;// CS instability driver, 0-1
  equiaxedFraction: number;          // fraction of equiaxed vs columnar, 0-1
  solidificationVelocity: number;    // front advance rate, 0-1
  frozenStability: number;           // post-solidification robustness, 0-1
  solidificationFactor: number;      // composite 0-1 (higher = healthy solidification)
}

interface SolidificationProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgUndercooling: number;
  maxUndercooling: number;
  avgNucleationRate: number;
  maxNucleationRate: number;
  avgSolidFraction: number;
  maxSolidFraction: number;
  avgDendriteGrowthRate: number;
  maxDendriteGrowthRate: number;
  avgPrimaryArmSpacing: number;
  maxPrimaryArmSpacing: number;
  avgSecondaryArmSpacing: number;
  maxSecondaryArmSpacing: number;
  avgPartitionCoefficient: number;
  avgMicrosegregation: number;
  maxMicrosegregation: number;
  avgMacrosegregation: number;
  avgMushyZoneWidth: number;
  maxMushyZoneWidth: number;
  avgConstitutionalSupercooling: number;
  maxConstitutionalSupercooling: number;
  avgEquiaxedFraction: number;
  maxEquiaxedFraction: number;
  avgSolidificationVelocity: number;
  maxSolidificationVelocity: number;
  avgFrozenStability: number;
  maxFrozenStability: number;
  // Derived counts
  solidCount: number;
  solidFraction: number;
  mushyCount: number;
  mushyFractionPool: number;
  liquidCount: number;
  liquidFraction: number;
  // Summary
  solidificationGini: number;
  solidificationIndex: number;
  solidificationRegime: string;
  solidificationVerdict: string;
  topBins: BinSolidification[];
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

function computeBinSolidification(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  maxReserve: number,
  avgReserve: number,
  poolImbalance: number
): BinSolidification {
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

  // Composition imbalance — excess solute of one species
  const xFraction = bin.totalUsd > 0 ? bin.reserveXUsd / bin.totalUsd : 0.5;
  const imbalance = Math.abs(xFraction - 0.5) * 2;

  // Neighbor variance — heterogeneity in surrounding lattice
  const neighborVariance = neighbors.length > 1
    ? neighbors.reduce((s, b) => s + Math.pow(b.totalUsd - neighborAvg, 2), 0) / neighbors.length
    : 0;
  const normalizedStdDev = neighborAvg > 0 ? Math.sqrt(neighborVariance) / neighborAvg : 0;

  // Concentration differential vs neighbors (gradient proxy)
  const concentrationDiff = neighborAvg > 0
    ? Math.abs(bin.totalUsd - neighborAvg) / neighborAvg
    : 0;

  // Distance decay — far bins cool faster (less thermal input from trading)
  const proximityFactor = Math.max(0, 1 - distance * 0.02);

  // Activity level — high activity = high thermal energy = liquid
  const activityLevel = Math.min(1, volumeRatio * 0.6);

  // Size dominance — large bins have more mass to freeze
  const sizeDominance = reserveFraction;

  // Thermal gradient proxy from distance to active (hot zone)
  const thermalGradient = distance > 0 ? 1 / (1 + distance * 0.1) : 1;

  // -----------------------------------------------------------------------
  // 1. undercooling — temperature below liquidus (thermal + constitutional)
  // High = far below freezing point with strong driving force for solidification
  const undercooling = r4(
    Math.min(1,
      (1 - activityLevel) * 0.4 +      // low activity = cold
      (1 - proximityFactor) * 0.25 +   // far from active = cooler
      imbalance * 0.15 +               // solute redistribution enhances CS
      concentrationDiff * 0.1 +
      (1 - thermalGradient) * 0.1
    )
  );

  // 2. nucleationRate — heterogeneous nuclei density
  // I = I_0 * exp(-DG*/kT); high undercooling boosts nucleation
  // N_nuc scales with undercooling^n typically n=2-3
  const nucleationRate = r4(
    Math.min(1,
      Math.pow(undercooling, 2) * 0.4 +
      normalizedStdDev * 0.2 +         // heterogeneities = nucleation sites
      concentrationDiff * 0.15 +
      sizeDominance * 0.15 +
      imbalance * 0.1
    )
  );

  // 3. solidFraction — f_s in mushy zone (0 = liquid, 1 = fully solid)
  // Lever rule: f_s = (T_l - T) / (T_l - T_s)
  const solidFraction = r4(
    Math.min(1,
      undercooling * 0.35 +
      (1 - activityLevel) * 0.25 +     // stagnant = solidified
      sizeDominance * 0.15 +
      imbalance * 0.15 +               // imbalance = solidified composition
      nucleationRate * 0.1
    )
  );

  // 4. dendriteGrowthRate — V_tip dendrite tip velocity
  // V_tip ~ undercooling^2 in low-Peclet regime (Ivantsov solution)
  const dendriteGrowthRate = r4(
    Math.min(1,
      Math.pow(undercooling, 1.5) * 0.3 +
      activityLevel * 0.25 +           // some diffusion needed for tip advance
      concentrationDiff * 0.2 +
      (1 - solidFraction) * 0.15 +     // room to grow
      thermalGradient * 0.1
    )
  );

  // 5. primaryArmSpacing — lambda_1
  // lambda_1 ~ G_T^(-1/2) * V^(-1/4) (Hunt-Kurz)
  // Low G_T (low gradient) + low V (slow growth) = coarse primary
  const primaryArmSpacing = r4(
    Math.min(1,
      (1 - thermalGradient) * 0.35 +   // low gradient = coarse
      (1 - dendriteGrowthRate) * 0.25 +// slow growth = coarse
      sizeDominance * 0.15 +
      (1 - nucleationRate) * 0.15 +    // few nuclei = wide spacing
      solidFraction * 0.1
    )
  );

  // 6. secondaryArmSpacing — lambda_2
  // lambda_2 = (M * t)^(1/3) — coarsens with local solidification time
  // Gibbs-Thomson driven ripening of secondary arms
  const secondaryArmSpacing = r4(
    Math.min(1,
      Math.pow(solidFraction, 1/3) * 0.35 + // coarsens with freezing time
      (1 - activityLevel) * 0.25 +
      (1 - dendriteGrowthRate) * 0.15 +
      primaryArmSpacing * 0.15 +        // coarse primary often has coarse secondary
      undercooling * 0.1
    )
  );

  // 7. partitionCoefficient — k = C_s / C_l
  // k < 1 = solute rejected to liquid; k > 1 = solute absorbed
  // In DLMM: imbalance determines effective partitioning
  // Low k proxy = strong rejection (high segregation)
  const partitionCoefficient = r4(
    Math.min(1,
      (1 - imbalance) * 0.4 +          // low imbalance = k near 1
      (1 - concentrationDiff) * 0.25 +
      (1 - normalizedStdDev) * 0.15 +
      proximityFactor * 0.1 +
      (1 - undercooling * 0.3)
    )
  );

  // 8. microsegregation — Scheil-Gulliver segregation
  // Scheil: C_s = k * C_0 * (1 - f_s)^(k-1)
  // Low k and high f_s drive strong microsegregation
  const microsegregation = r4(
    Math.min(1,
      (1 - partitionCoefficient) * 0.35 +
      solidFraction * 0.25 +
      imbalance * 0.2 +
      concentrationDiff * 0.1 +
      secondaryArmSpacing * 0.1        // finer arms = less segregation (more back-diffusion)
    )
  );

  // 9. macrosegregation — pool-scale composition gradient
  const macrosegregation = r4(
    Math.min(1,
      poolImbalance * 0.35 +
      concentrationDiff * 0.25 +
      normalizedStdDev * 0.2 +
      solidFraction * 0.1 +
      (1 - partitionCoefficient) * 0.1
    )
  );

  // 10. mushyZoneWidth — liquidus-solidus gap
  // Wider = more extensive two-phase region, increased porosity/defect risk
  const mushyZoneWidth = r4(
    Math.min(1,
      partitionCoefficient < 0.5
        ? (1 - partitionCoefficient) * 0.4
        : (1 - partitionCoefficient) * 0.2 +
      solidFraction * (1 - solidFraction) * 4 * 0.25 + // peaks at f_s=0.5
      imbalance * 0.15 +
      concentrationDiff * 0.1 +
      undercooling * 0.1
    )
  );

  // 11. constitutionalSupercooling — CS instability driver
  // Morphological instability: G_T < m_L * C_0 * (1 - k) / (D * k)
  // When CS > 0, planar front destabilizes -> cellular/dendritic
  const constitutionalSupercooling = r4(
    Math.min(1,
      (1 - thermalGradient) * 0.3 +    // low G_T
      imbalance * 0.25 +               // C_0 analog
      (1 - partitionCoefficient) * 0.2 + // (1-k)/k analog
      dendriteGrowthRate * 0.15 +
      concentrationDiff * 0.1
    )
  );

  // 12. equiaxedFraction — fraction of equiaxed vs columnar grains
  // CET: high nucleation + low G_T => equiaxed; else columnar
  const equiaxedFraction = r4(
    Math.min(1,
      nucleationRate * 0.35 +
      (1 - thermalGradient) * 0.25 +
      (1 - dendriteGrowthRate * 0.3) +
      normalizedStdDev * 0.15 +
      activityLevel * 0.05 - 0.4
    )
  );
  const equiaxedFractionClamped = Math.max(0, Math.min(1, equiaxedFraction));

  // 13. solidificationVelocity — front advance rate
  // Combined thermal + solute controlled
  const solidificationVelocity = r4(
    Math.min(1,
      dendriteGrowthRate * 0.4 +
      undercooling * 0.25 +
      activityLevel * 0.15 +
      (1 - primaryArmSpacing) * 0.1 +   // fine arms = fast front
      nucleationRate * 0.1
    )
  );

  // 14. frozenStability — post-solidification robustness
  // Well-solidified bins with fine structure and low segregation = stable
  const frozenStability = r4(
    Math.min(1,
      solidFraction * 0.25 +
      (1 - microsegregation) * 0.2 +
      (1 - mushyZoneWidth) * 0.15 +
      (1 - macrosegregation) * 0.15 +
      (1 - primaryArmSpacing) * 0.1 +   // fine primary = robust
      equiaxedFractionClamped * 0.1 +   // equiaxed = isotropic stability
      (1 - undercooling * 0.2)
    )
  );

  // 15. solidificationFactor — composite 0-1 (higher = healthy solidification)
  const solidificationFactor = r4(
    Math.min(1,
      frozenStability * 0.15 +
      solidFraction * 0.12 +
      (1 - microsegregation) * 0.1 +
      (1 - mushyZoneWidth) * 0.1 +
      (1 - primaryArmSpacing) * 0.08 +   // fine = healthy
      (1 - secondaryArmSpacing) * 0.07 +
      nucleationRate * 0.07 +
      equiaxedFractionClamped * 0.07 +
      (1 - macrosegregation) * 0.06 +
      partitionCoefficient * 0.05 +
      undercooling * 0.05 +
      solidificationVelocity * 0.04 +
      (1 - constitutionalSupercooling) * 0.04
    )
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    undercooling,
    nucleationRate,
    solidFraction,
    dendriteGrowthRate,
    primaryArmSpacing,
    secondaryArmSpacing,
    partitionCoefficient,
    microsegregation,
    macrosegregation,
    mushyZoneWidth,
    constitutionalSupercooling,
    equiaxedFraction: equiaxedFractionClamped,
    solidificationVelocity,
    frozenStability,
    solidificationFactor,
  };
}

function analyzeSolidification(bins: BinReserves[], pool: AppPool): SolidificationProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));
  const avgReserve = totalUsd / n;

  // Pool-scale imbalance for macrosegregation calc
  const totalX = sorted.reduce((s, b) => s + b.reserveXUsd, 0);
  const totalY = sorted.reduce((s, b) => s + b.reserveYUsd, 0);
  const poolImbalance = totalX + totalY > 0
    ? Math.abs(totalX - totalY) / (totalX + totalY)
    : 0;

  const binSols = sorted.map((b) =>
    computeBinSolidification(b, activeBin, sorted, totalUsd, volume, maxReserve, avgReserve, poolImbalance)
  );

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgUndercooling = r4(avg(binSols.map((b) => b.undercooling)));
  const maxUndercooling = r4(Math.max(...binSols.map((b) => b.undercooling)));
  const avgNucleationRate = r4(avg(binSols.map((b) => b.nucleationRate)));
  const maxNucleationRate = r4(Math.max(...binSols.map((b) => b.nucleationRate)));
  const avgSolidFraction = r4(avg(binSols.map((b) => b.solidFraction)));
  const maxSolidFraction = r4(Math.max(...binSols.map((b) => b.solidFraction)));
  const avgDendriteGrowthRate = r4(avg(binSols.map((b) => b.dendriteGrowthRate)));
  const maxDendriteGrowthRate = r4(Math.max(...binSols.map((b) => b.dendriteGrowthRate)));
  const avgPrimaryArmSpacing = r4(avg(binSols.map((b) => b.primaryArmSpacing)));
  const maxPrimaryArmSpacing = r4(Math.max(...binSols.map((b) => b.primaryArmSpacing)));
  const avgSecondaryArmSpacing = r4(avg(binSols.map((b) => b.secondaryArmSpacing)));
  const maxSecondaryArmSpacing = r4(Math.max(...binSols.map((b) => b.secondaryArmSpacing)));
  const avgPartitionCoefficient = r4(avg(binSols.map((b) => b.partitionCoefficient)));
  const avgMicrosegregation = r4(avg(binSols.map((b) => b.microsegregation)));
  const maxMicrosegregation = r4(Math.max(...binSols.map((b) => b.microsegregation)));
  const avgMacrosegregation = r4(avg(binSols.map((b) => b.macrosegregation)));
  const avgMushyZoneWidth = r4(avg(binSols.map((b) => b.mushyZoneWidth)));
  const maxMushyZoneWidth = r4(Math.max(...binSols.map((b) => b.mushyZoneWidth)));
  const avgConstitutionalSupercooling = r4(avg(binSols.map((b) => b.constitutionalSupercooling)));
  const maxConstitutionalSupercooling = r4(Math.max(...binSols.map((b) => b.constitutionalSupercooling)));
  const avgEquiaxedFraction = r4(avg(binSols.map((b) => b.equiaxedFraction)));
  const maxEquiaxedFraction = r4(Math.max(...binSols.map((b) => b.equiaxedFraction)));
  const avgSolidificationVelocity = r4(avg(binSols.map((b) => b.solidificationVelocity)));
  const maxSolidificationVelocity = r4(Math.max(...binSols.map((b) => b.solidificationVelocity)));
  const avgFrozenStability = r4(avg(binSols.map((b) => b.frozenStability)));
  const maxFrozenStability = r4(Math.max(...binSols.map((b) => b.frozenStability)));

  // Solid: fully frozen bins (f_s > 0.7)
  const solidCount = binSols.filter((b) => b.solidFraction > 0.7).length;
  const solidFraction = r4(solidCount / n);

  // Mushy: partially solidified (0.3 <= f_s <= 0.7)
  const mushyCount = binSols.filter(
    (b) => b.solidFraction >= 0.3 && b.solidFraction <= 0.7
  ).length;
  const mushyFractionPool = r4(mushyCount / n);

  // Liquid: barely solidified (f_s < 0.3)
  const liquidCount = binSols.filter((b) => b.solidFraction < 0.3).length;
  const liquidFraction = r4(liquidCount / n);

  // Gini on solidificationFactor distribution
  const sfFactors = binSols.map((b) => b.solidificationFactor);
  const sortedFactors = [...sfFactors].sort((a, b) => b - a);
  const totalFactors = sortedFactors.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedFactors[i];
  }
  const solidificationGini = totalFactors > 0
    ? r4(Math.abs(giniSum) / (n * totalFactors))
    : 0;

  // Composite solidification index (0-100)
  // High = healthy frozen pool with fine structure, low segregation, high stability
  const stabilityScore  = Math.min(25, avgFrozenStability * 25);
  const segregationScore = Math.min(25, (1 - avgMicrosegregation) * 25);
  const structureScore  = Math.min(25, (1 - avgPrimaryArmSpacing) * 25);
  const solidScore      = Math.min(25, avgSolidFraction * 25);
  const solidificationIndex = Math.round(
    Math.min(100, stabilityScore + segregationScore + structureScore + solidScore)
  );

  // Regime classification
  let solidificationRegime: string;
  if (solidificationIndex >= 80)      solidificationRegime = "SOLID";
  else if (solidificationIndex >= 60) solidificationRegime = "SOLIDIFYING";
  else if (solidificationIndex >= 40) solidificationRegime = "MUSHY";
  else if (solidificationIndex >= 20) solidificationRegime = "NUCLEATING";
  else                                 solidificationRegime = "LIQUID";

  // Verdict classification
  let solidificationVerdict: string;
  if (avgFrozenStability > 0.6 && avgMicrosegregation < 0.3 && avgPrimaryArmSpacing < 0.4)
    solidificationVerdict = "FULLY_FROZEN";
  else if (avgMushyZoneWidth > 0.6 && avgSolidFraction > 0.3 && avgSolidFraction < 0.7)
    solidificationVerdict = "MUSHY_ZONE";
  else if (avgEquiaxedFraction > 0.6 && avgNucleationRate > 0.5)
    solidificationVerdict = "EQUIAXED_STRUCTURE";
  else if (avgDendriteGrowthRate > 0.6 && avgPrimaryArmSpacing > 0.5)
    solidificationVerdict = "COLUMNAR_DENDRITIC";
  else if (avgConstitutionalSupercooling > 0.6 && avgPartitionCoefficient < 0.4)
    solidificationVerdict = "CS_UNSTABLE";
  else if (avgMicrosegregation > 0.6 && avgMacrosegregation > 0.4)
    solidificationVerdict = "SEGREGATED_MELT";
  else if (avgUndercooling < 0.3 && avgSolidFraction < 0.3)
    solidificationVerdict = "SUPERHEATED_LIQUID";
  else if (avgNucleationRate > 0.6 && avgSolidFraction < 0.5)
    solidificationVerdict = "NUCLEATION_DOMINANT";
  else
    solidificationVerdict = "SOLIDIFICATION_BALANCE";

  const topBins = [...binSols]
    .sort((a, b) => b.solidificationFactor - a.solidificationFactor)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgUndercooling,
    maxUndercooling,
    avgNucleationRate,
    maxNucleationRate,
    avgSolidFraction,
    maxSolidFraction,
    avgDendriteGrowthRate,
    maxDendriteGrowthRate,
    avgPrimaryArmSpacing,
    maxPrimaryArmSpacing,
    avgSecondaryArmSpacing,
    maxSecondaryArmSpacing,
    avgPartitionCoefficient,
    avgMicrosegregation,
    maxMicrosegregation,
    avgMacrosegregation,
    avgMushyZoneWidth,
    maxMushyZoneWidth,
    avgConstitutionalSupercooling,
    maxConstitutionalSupercooling,
    avgEquiaxedFraction,
    maxEquiaxedFraction,
    avgSolidificationVelocity,
    maxSolidificationVelocity,
    avgFrozenStability,
    maxFrozenStability,
    solidCount,
    solidFraction,
    mushyCount,
    mushyFractionPool,
    liquidCount,
    liquidFraction,
    solidificationGini,
    solidificationIndex,
    solidificationRegime,
    solidificationVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Solidification — Doctor ===\n");
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

  const profiles: SolidificationProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeSolidification(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgSolidificationIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.solidificationIndex)))
      : 0,
    solidCount:       profiles.filter((p) => p.solidificationRegime === "SOLID").length,
    solidifyingCount: profiles.filter((p) => p.solidificationRegime === "SOLIDIFYING").length,
    mushyCount:       profiles.filter((p) => p.solidificationRegime === "MUSHY").length,
    nucleatingCount:  profiles.filter((p) => p.solidificationRegime === "NUCLEATING").length,
    liquidCount:      profiles.filter((p) => p.solidificationRegime === "LIQUID").length,
    avgFrozenStability: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgFrozenStability)))
      : 0,
    avgSolidFraction: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgSolidFraction)))
      : 0,
    avgMicrosegregation: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgMicrosegregation)))
      : 0,
    totalSolidBins:  profiles.reduce((s, p) => s + p.solidCount, 0),
    totalMushyBins:  profiles.reduce((s, p) => s + p.mushyCount, 0),
    totalLiquidBins: profiles.reduce((s, p) => s + p.liquidCount, 0),
    avgSolidificationGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.solidificationGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-solidification").description("HODLMM bin liquid-to-solid phase transition analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin solidification state")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
