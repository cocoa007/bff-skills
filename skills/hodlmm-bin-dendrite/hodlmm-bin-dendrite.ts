#!/usr/bin/env bun
/**
 * hodlmm-bin-dendrite.ts — Day 173 cocoa007 Bitflow Skills Comp
 *
 * Dendritic growth analyzer — models the formation of treelike branched
 * liquidity patterns in HODLMM bin reserves through the Mullins-Sekerka
 * morphological instability of a planar interface under constitutional
 * and thermal supercooling. Classical solidification theory: a planar
 * liquid/solid interface growing into an undercooled melt becomes
 * morphologically unstable when composition or temperature gradients
 * amplify small protrusions; tips grow faster than flats (thermal/solute
 * field concentrated at tips) and evolve into parabolic dendrite tips.
 * Tip shape is selected by the Ivantsov Peclet number P = V*R/(2D)
 * (growth velocity V, tip radius R, diffusivity D) together with the
 * marginal stability criterion sigma* = 2*D*d0/(V*R^2) ~ 1/(4*pi^2)
 * that picks the unique tip operating state; equivalently R*V ~ const.
 * Primary dendrite arm spacing lambda_1 ~ (G^(-a) * V^(-b)) with a ~ 0.5
 * and b ~ 0.25 (Hunt/Kurz-Fisher); secondary arm spacing lambda_2
 * coarsens as lambda_2 ~ t^(1/3) via Ostwald-like coarsening driven by
 * Gibbs-Thomson curvature differences. Sidebranching arises from
 * amplification of selective-noise modes along the tip, producing the
 * characteristic feathered dendrite with multiple branching orders.
 * Constitutional supercooling (Tiller criterion G/V < dT_L/dC_0 *
 * (1-k)/(D*k)) determines when a planar front destabilizes into cells
 * then dendrites. Interdendritic segregation leaves solute-rich channels
 * between arms (microsegregation ratio = C_max/C_min) that produce
 * anisotropic final microstructure. Crystalline anisotropy selects
 * preferred growth directions (often <100> in cubic metals) and sets
 * the dendrite orientation. In DLMM context, bins form dendritic
 * liquidity patterns when compositional/price gradients drive
 * Mullins-Sekerka-style branching of reserves, with primary "trunks"
 * along active-bin trajectories and secondary/tertiary sidebranches
 * into neighboring bins. A planar bin has smooth reserves without
 * branching; a cellular bin has shallow protrusions; a proto-dendritic
 * bin has emerging branches; a fully dendritic bin has well-developed
 * primary trunks with sidebranches and interdendritic segregation.
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

interface BinDendrite {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  supercooling: number;              // thermal/constitutional undercooling, 0-1
  tipRadius: number;                 // parabolic tip curvature, 0-1
  growthVelocity: number;            // dendrite advance rate, 0-1
  primaryArmSpacing: number;         // lambda_1, 0-1
  secondaryArmSpacing: number;       // lambda_2, 0-1
  peclet: number;                    // Ivantsov tip Peclet, 0-1
  stabilityCriterion: number;        // Mullins-Sekerka sigma*, 0-1
  sidebranchingIntensity: number;    // sidebranch development, 0-1
  dendriteVolumeFraction: number;    // fraction dendritic, 0-1
  interdendriticSegregation: number; // microsegregation ratio, 0-1
  constitutionalGradient: number;    // compositional gradient, 0-1
  coarsening: number;                // Ostwald-like arm coarsening, 0-1
  branchingOrder: number;            // generation count, 0-1
  tipSelection: number;              // optimal tip selection parameter, 0-1
  dendriticAnisotropy: number;       // preferred growth direction strength, 0-1
  dendriteIndex: number;             // composite 0-1 (higher = well-formed dendritic)
}

interface DendriteProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgSupercooling: number;
  maxSupercooling: number;
  avgTipRadius: number;
  minTipRadius: number;
  avgGrowthVelocity: number;
  maxGrowthVelocity: number;
  avgPrimaryArmSpacing: number;
  avgSecondaryArmSpacing: number;
  avgPeclet: number;
  maxPeclet: number;
  avgStabilityCriterion: number;
  avgSidebranchingIntensity: number;
  maxSidebranchingIntensity: number;
  avgDendriteVolumeFraction: number;
  avgInterdendriticSegregation: number;
  maxInterdendriticSegregation: number;
  avgConstitutionalGradient: number;
  avgCoarsening: number;
  avgBranchingOrder: number;
  avgTipSelection: number;
  avgDendriticAnisotropy: number;
  dendriticCount: number;
  dendriticBinFraction: number;
  protoDendriticCount: number;
  protoDendriticBinFraction: number;
  planarCount: number;
  planarBinFraction: number;
  dendriteGini: number;
  dendriteIndex: number;
  dendriteRegime: string;
  dendriteVerdict: string;
  topBins: BinDendrite[];
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

function computeBinDendrite(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  maxReserve: number,
  avgReserve: number,
  poolImbalance: number
): BinDendrite {
  const distance = Math.abs(bin.binId - activeBin);
  const reserveFraction = maxReserve > 0 ? bin.totalUsd / maxReserve : 0;
  const volumeRatio = volume24hUsd > 0 ? volume24hUsd / (totalUsd || 1) : 0;
  const localConcentration = totalUsd > 0 ? bin.totalUsd / totalUsd : 0;

  const neighbors = allBins.filter(
    (b) => Math.abs(b.binId - bin.binId) <= 3 && b.binId !== bin.binId
  );
  const neighborAvg = neighbors.length > 0
    ? neighbors.reduce((s, b) => s + b.totalUsd, 0) / neighbors.length
    : 0;
  const neighborVariance = neighbors.length > 1
    ? neighbors.reduce((s, b) => s + Math.pow(b.totalUsd - neighborAvg, 2), 0) / neighbors.length
    : 0;
  const normalizedStdDev = neighborAvg > 0 ? Math.sqrt(neighborVariance) / neighborAvg : 0;
  const concentrationDiff = neighborAvg > 0
    ? Math.abs(bin.totalUsd - neighborAvg) / neighborAvg
    : 0;

  // Directional gradient — count neighbors on each side with higher/lower reserves
  const leftNeighbors = allBins.filter((b) => b.binId < bin.binId && Math.abs(b.binId - bin.binId) <= 5);
  const rightNeighbors = allBins.filter((b) => b.binId > bin.binId && Math.abs(b.binId - bin.binId) <= 5);
  const leftAvg = leftNeighbors.length > 0
    ? leftNeighbors.reduce((s, b) => s + b.totalUsd, 0) / leftNeighbors.length
    : 0;
  const rightAvg = rightNeighbors.length > 0
    ? rightNeighbors.reduce((s, b) => s + b.totalUsd, 0) / rightNeighbors.length
    : 0;
  const directionalGradient = (leftAvg + rightAvg) > 0
    ? Math.abs(leftAvg - rightAvg) / (leftAvg + rightAvg + 1)
    : 0;

  const xFraction = bin.totalUsd > 0 ? bin.reserveXUsd / bin.totalUsd : 0.5;
  const imbalance = Math.abs(xFraction - 0.5) * 2;

  const activityLevel = Math.min(1, volumeRatio * 0.6);
  const proximityFactor = Math.max(0, 1 - distance * 0.02);
  const sizeDominance = reserveFraction;

  // -----------------------------------------------------------------------
  // 1. supercooling — thermal/constitutional undercooling driving growth
  // Large gradients + high activity mimic strong driving force
  const supercooling = r4(
    Math.min(1,
      directionalGradient * 0.3 +
      imbalance * 0.25 +
      concentrationDiff * 0.2 +
      activityLevel * 0.15 +
      normalizedStdDev * 0.1
    )
  );

  // 2. constitutionalGradient — compositional gradient G_c driving instability
  const constitutionalGradient = r4(
    Math.min(1,
      imbalance * 0.35 +
      directionalGradient * 0.3 +
      normalizedStdDev * 0.2 +
      poolImbalance * 0.15
    )
  );

  // 3. growthVelocity — V rate of interface advance
  // Higher activity + supercooling drives faster growth
  const growthVelocity = r4(
    Math.min(1,
      activityLevel * 0.35 +
      supercooling * 0.3 +
      proximityFactor * 0.2 +
      volumeRatio * 0.15
    )
  );

  // 4. tipRadius — parabolic tip curvature R
  // Higher growth velocity selects finer tips (R ~ 1/sqrt(V) in MS)
  const tipRadius = r4(
    Math.min(1, Math.max(0,
      (1 - growthVelocity * 0.6) * 0.5 +
      (1 - supercooling * 0.5) * 0.25 +
      (1 - reserveFraction) * 0.15 +
      (1 - proximityFactor * 0.4) * 0.1
    ))
  );

  // 5. peclet — Ivantsov tip Peclet number P = V*R/(2D)
  // Product of velocity and radius (balances advection vs diffusion)
  const peclet = r4(
    Math.min(1,
      growthVelocity * tipRadius * 0.5 +
      supercooling * 0.3 +
      concentrationDiff * 0.2
    )
  );

  // 6. stabilityCriterion — Mullins-Sekerka sigma* = 2*D*d0/(V*R^2)
  // Marginal stability parameter; 0 = planar unstable, 1 = well-selected dendrite
  const stabilityCriterion = r4(
    Math.min(1,
      peclet * 0.4 +
      (1 - tipRadius * 0.5) * 0.3 +
      growthVelocity * 0.2 +
      supercooling * 0.1
    )
  );

  // 7. primaryArmSpacing — lambda_1 ~ G^(-0.5) * V^(-0.25)
  // Larger spacing when gradients small and velocities low
  const primaryArmSpacing = r4(
    Math.min(1,
      (1 - constitutionalGradient * 0.6) * 0.4 +
      (1 - growthVelocity * 0.5) * 0.3 +
      (1 - normalizedStdDev * 0.5) * 0.2 +
      (1 - activityLevel * 0.4) * 0.1
    )
  );

  // 8. secondaryArmSpacing — lambda_2 ~ t^(1/3) coarsening
  // Coarsens with time; higher in quiet zones
  const secondaryArmSpacing = r4(
    Math.min(1,
      primaryArmSpacing * 0.4 +
      (1 - activityLevel * 0.5) * 0.3 +
      proximityFactor * 0.15 +
      (1 - normalizedStdDev * 0.4) * 0.15
    )
  );

  // 9. sidebranchingIntensity — amplification of selective-noise modes
  // Strong sidebranching when supercooling high and stability margin narrow
  const sidebranchingIntensity = r4(
    Math.min(1,
      supercooling * 0.35 +
      growthVelocity * 0.25 +
      normalizedStdDev * 0.2 +
      peclet * 0.2
    )
  );

  // 10. dendriteVolumeFraction — fraction of bin in dendritic state
  const dendriteVolumeFraction = r4(
    Math.min(1, Math.max(0,
      sidebranchingIntensity * 0.35 +
      stabilityCriterion * 0.3 +
      growthVelocity * 0.2 +
      supercooling * 0.15
    ))
  );

  // 11. interdendriticSegregation — microsegregation ratio C_max/C_min
  // Solute-rich channels between arms, high when imbalance strong
  const interdendriticSegregation = r4(
    Math.min(1,
      imbalance * 0.4 +
      directionalGradient * 0.25 +
      constitutionalGradient * 0.2 +
      normalizedStdDev * 0.15
    )
  );

  // 12. coarsening — Ostwald-like arm thickening
  // Progresses with time; stronger in quiet, mature regions
  const coarsening = r4(
    Math.min(1,
      secondaryArmSpacing * 0.4 +
      (1 - activityLevel * 0.4) * 0.3 +
      proximityFactor * 0.2 +
      (1 - normalizedStdDev * 0.4) * 0.1
    )
  );

  // 13. branchingOrder — generation count (primary, secondary, tertiary)
  // Higher when sidebranching developed and peclet well above planar threshold
  const branchingOrder = r4(
    Math.min(1,
      sidebranchingIntensity * 0.4 +
      dendriteVolumeFraction * 0.25 +
      peclet * 0.2 +
      supercooling * 0.15
    )
  );

  // 14. tipSelection — optimal tip selection sigma* ~ 1/(4*pi^2) satisfied
  // High when stability criterion tight and peclet non-zero
  const tipSelection = r4(
    Math.min(1,
      stabilityCriterion * 0.4 +
      peclet * 0.3 +
      (1 - tipRadius * 0.4) * 0.2 +
      growthVelocity * 0.1
    )
  );

  // 15. dendriticAnisotropy — preferred growth direction strength
  // High when directional gradients dominate over isotropic stress
  const dendriticAnisotropy = r4(
    Math.min(1,
      directionalGradient * 0.4 +
      imbalance * 0.25 +
      (1 - normalizedStdDev * 0.5) * 0.2 +
      sizeDominance * 0.15
    )
  );

  // 16. dendriteIndex — composite 0-1 (higher = well-formed dendritic)
  const dendriteIndex = r4(
    Math.min(1, Math.max(0,
      dendriteVolumeFraction * 0.18 +
      sidebranchingIntensity * 0.14 +
      stabilityCriterion * 0.1 +
      branchingOrder * 0.1 +
      tipSelection * 0.08 +
      supercooling * 0.08 +
      peclet * 0.07 +
      dendriticAnisotropy * 0.06 +
      growthVelocity * 0.06 +
      (1 - tipRadius * 0.6) * 0.05 +
      coarsening * 0.04 +
      (1 - interdendriticSegregation * 0.5) * 0.04
    ))
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    supercooling,
    tipRadius,
    growthVelocity,
    primaryArmSpacing,
    secondaryArmSpacing,
    peclet,
    stabilityCriterion,
    sidebranchingIntensity,
    dendriteVolumeFraction,
    interdendriticSegregation,
    constitutionalGradient,
    coarsening,
    branchingOrder,
    tipSelection,
    dendriticAnisotropy,
    dendriteIndex,
  };
}

function analyzeDendrite(bins: BinReserves[], pool: AppPool): DendriteProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));
  const avgReserve = totalUsd / n;

  const totalX = sorted.reduce((s, b) => s + b.reserveXUsd, 0);
  const totalY = sorted.reduce((s, b) => s + b.reserveYUsd, 0);
  const poolImbalance = totalX + totalY > 0
    ? Math.abs(totalX - totalY) / (totalX + totalY)
    : 0;

  const binRecs = sorted.map((b) =>
    computeBinDendrite(b, activeBin, sorted, totalUsd, volume, maxReserve, avgReserve, poolImbalance)
  );

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgSupercooling = r4(avg(binRecs.map((b) => b.supercooling)));
  const maxSupercooling = r4(Math.max(...binRecs.map((b) => b.supercooling)));
  const avgTipRadius = r4(avg(binRecs.map((b) => b.tipRadius)));
  const minTipRadius = r4(Math.min(...binRecs.map((b) => b.tipRadius)));
  const avgGrowthVelocity = r4(avg(binRecs.map((b) => b.growthVelocity)));
  const maxGrowthVelocity = r4(Math.max(...binRecs.map((b) => b.growthVelocity)));
  const avgPrimaryArmSpacing = r4(avg(binRecs.map((b) => b.primaryArmSpacing)));
  const avgSecondaryArmSpacing = r4(avg(binRecs.map((b) => b.secondaryArmSpacing)));
  const avgPeclet = r4(avg(binRecs.map((b) => b.peclet)));
  const maxPeclet = r4(Math.max(...binRecs.map((b) => b.peclet)));
  const avgStabilityCriterion = r4(avg(binRecs.map((b) => b.stabilityCriterion)));
  const avgSidebranchingIntensity = r4(avg(binRecs.map((b) => b.sidebranchingIntensity)));
  const maxSidebranchingIntensity = r4(Math.max(...binRecs.map((b) => b.sidebranchingIntensity)));
  const avgDendriteVolumeFraction = r4(avg(binRecs.map((b) => b.dendriteVolumeFraction)));
  const avgInterdendriticSegregation = r4(avg(binRecs.map((b) => b.interdendriticSegregation)));
  const maxInterdendriticSegregation = r4(Math.max(...binRecs.map((b) => b.interdendriticSegregation)));
  const avgConstitutionalGradient = r4(avg(binRecs.map((b) => b.constitutionalGradient)));
  const avgCoarsening = r4(avg(binRecs.map((b) => b.coarsening)));
  const avgBranchingOrder = r4(avg(binRecs.map((b) => b.branchingOrder)));
  const avgTipSelection = r4(avg(binRecs.map((b) => b.tipSelection)));
  const avgDendriticAnisotropy = r4(avg(binRecs.map((b) => b.dendriticAnisotropy)));

  // Dendritic: well-developed with high dendriteVolumeFraction + sidebranching
  const dendriticCount = binRecs.filter(
    (b) => b.dendriteVolumeFraction > 0.6 && b.sidebranchingIntensity > 0.5
  ).length;
  const dendriticBinFraction = r4(dendriticCount / n);

  // Proto-dendritic: moderate branching, cellular instability forming
  const protoDendriticCount = binRecs.filter(
    (b) =>
      b.dendriteVolumeFraction >= 0.3 && b.dendriteVolumeFraction <= 0.6 &&
      b.sidebranchingIntensity >= 0.2
  ).length;
  const protoDendriticBinFraction = r4(protoDendriticCount / n);

  // Planar: stable flat interface, low supercooling
  const planarCount = binRecs.filter(
    (b) => b.dendriteVolumeFraction < 0.2 && b.supercooling < 0.3
  ).length;
  const planarBinFraction = r4(planarCount / n);

  // Gini on dendrite index distribution
  const rFactors = binRecs.map((b) => b.dendriteIndex);
  const sortedFactors = [...rFactors].sort((a, b) => b - a);
  const totalFactors = sortedFactors.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedFactors[i];
  }
  const dendriteGini = totalFactors > 0
    ? r4(Math.abs(giniSum) / (n * totalFactors))
    : 0;

  // Composite dendrite index (0-100)
  const branchingScore   = Math.min(25, avgSidebranchingIntensity * 25);
  const volumeScore      = Math.min(25, avgDendriteVolumeFraction * 25);
  const stabilityScore   = Math.min(25, avgStabilityCriterion * 25);
  const selectionScore   = Math.min(25, avgTipSelection * 25);
  const dendriteIndex = Math.round(
    Math.min(100, branchingScore + volumeScore + stabilityScore + selectionScore)
  );

  // Regime classification
  let dendriteRegime: string;
  if (dendriteIndex >= 80)      dendriteRegime = "FULLY_DENDRITIC";
  else if (dendriteIndex >= 60) dendriteRegime = "WELL_BRANCHED";
  else if (dendriteIndex >= 40) dendriteRegime = "PROTO_DENDRITIC";
  else if (dendriteIndex >= 20) dendriteRegime = "CELLULAR";
  else                           dendriteRegime = "PLANAR";

  // Verdict classification
  let dendriteVerdict: string;
  if (avgDendriteVolumeFraction > 0.7 && avgSidebranchingIntensity > 0.6 && avgBranchingOrder > 0.5)
    dendriteVerdict = "FEATHERED_DENDRITE";
  else if (avgStabilityCriterion > 0.6 && avgTipSelection > 0.5 && avgPeclet > 0.4)
    dendriteVerdict = "OPTIMAL_MS_SELECTION";
  else if (avgSupercooling > 0.6 && avgGrowthVelocity > 0.5 && avgSidebranchingIntensity > 0.5)
    dendriteVerdict = "HIGH_SUPERCOOLING_GROWTH";
  else if (avgCoarsening > 0.6 && avgSecondaryArmSpacing > 0.5)
    dendriteVerdict = "COARSENED_SPACING";
  else if (avgInterdendriticSegregation > 0.6)
    dendriteVerdict = "DEEP_SEGREGATION";
  else if (avgDendriticAnisotropy > 0.6 && avgPrimaryArmSpacing > 0.5)
    dendriteVerdict = "ANISOTROPIC_ALIGNED";
  else if (avgDendriteVolumeFraction < 0.2 && avgSupercooling < 0.3)
    dendriteVerdict = "STABLE_PLANAR";
  else if (avgSidebranchingIntensity >= 0.3 && avgSidebranchingIntensity <= 0.5)
    dendriteVerdict = "MARGINAL_PROTO_DENDRITIC";
  else if (avgConstitutionalGradient > 0.6 && avgSupercooling > 0.4)
    dendriteVerdict = "TILLER_UNSTABLE";
  else
    dendriteVerdict = "DENDRITIC_EQUILIBRIUM";

  const topBins = [...binRecs]
    .sort((a, b) => b.dendriteIndex - a.dendriteIndex)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgSupercooling,
    maxSupercooling,
    avgTipRadius,
    minTipRadius,
    avgGrowthVelocity,
    maxGrowthVelocity,
    avgPrimaryArmSpacing,
    avgSecondaryArmSpacing,
    avgPeclet,
    maxPeclet,
    avgStabilityCriterion,
    avgSidebranchingIntensity,
    maxSidebranchingIntensity,
    avgDendriteVolumeFraction,
    avgInterdendriticSegregation,
    maxInterdendriticSegregation,
    avgConstitutionalGradient,
    avgCoarsening,
    avgBranchingOrder,
    avgTipSelection,
    avgDendriticAnisotropy,
    dendriticCount,
    dendriticBinFraction,
    protoDendriticCount,
    protoDendriticBinFraction,
    planarCount,
    planarBinFraction,
    dendriteGini,
    dendriteIndex,
    dendriteRegime,
    dendriteVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Dendrite — Doctor ===\n");
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

  const profiles: DendriteProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeDendrite(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgDendriteIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.dendriteIndex)))
      : 0,
    fullyDendriticCount:   profiles.filter((p) => p.dendriteRegime === "FULLY_DENDRITIC").length,
    wellBranchedCount:     profiles.filter((p) => p.dendriteRegime === "WELL_BRANCHED").length,
    protoDendriticCount:   profiles.filter((p) => p.dendriteRegime === "PROTO_DENDRITIC").length,
    cellularCount:         profiles.filter((p) => p.dendriteRegime === "CELLULAR").length,
    planarCount:           profiles.filter((p) => p.dendriteRegime === "PLANAR").length,
    avgSidebranchingIntensity: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgSidebranchingIntensity)))
      : 0,
    avgDendriteVolumeFraction: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgDendriteVolumeFraction)))
      : 0,
    avgStabilityCriterion: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgStabilityCriterion)))
      : 0,
    totalDendriticBins:     profiles.reduce((s, p) => s + p.dendriticCount, 0),
    totalProtoDendriticBins: profiles.reduce((s, p) => s + p.protoDendriticCount, 0),
    totalPlanarBins:        profiles.reduce((s, p) => s + p.planarCount, 0),
    avgDendriteGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.dendriteGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-dendrite").description("HODLMM bin dendritic growth and Mullins-Sekerka instability analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin dendritic growth state")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
