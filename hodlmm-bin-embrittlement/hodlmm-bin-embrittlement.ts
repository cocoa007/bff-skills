#!/usr/bin/env bun
/**
 * hodlmm-bin-embrittlement.ts — Day 171 cocoa007 Bitflow Skills Comp
 *
 * Embrittlement analyzer — models the ductile-to-brittle transition
 * of HODLMM bin reserves under cumulative stress damage, hydrogen
 * charging, grain-boundary impurity segregation, and irradiation-like
 * cyclic fatigue. Classical metallurgical embrittlement theory: a
 * material's fracture behavior shifts from ductile (plastic
 * deformation, high energy absorption, transgranular dimpled failure)
 * to brittle (cleavage, low energy, often intergranular) across a
 * narrow ductile-brittle transition temperature (DBTT). Charpy impact
 * energy E(T) follows a tanh-shaped master curve between upper-shelf
 * energy USE (plateau of tough ductile failure) and lower-shelf energy
 * LSE (plateau of brittle cleavage), with DBTT typically defined at
 * 0.5*(USE+LSE) or a fixed-energy criterion such as 27 J. Hydrogen
 * embrittlement (HE) occurs via two competing mechanisms: Hydrogen-
 * Enhanced Decohesion (HEDE) where H atoms reduce cohesive strength of
 * atomic bonds at stress concentrators, and Hydrogen-Enhanced
 * Localized Plasticity (HELP) where H softens dislocation slip
 * planes, localizes plasticity, and accelerates crack propagation. H
 * accumulation at crack tips obeys Oriani's equilibrium trapping with
 * hydrostatic stress as the driver: C_H = C_0 * exp(sigma_h * V_H /
 * RT). Temper embrittlement (TE) arises from segregation of tramp
 * impurities (P, Sn, Sb, As) to prior austenite grain boundaries
 * following McLean's isotherm x_gb / (1 - x_gb) = (x_0 / (1 - x_0)) *
 * exp(-DeltaG_seg / RT); reduced GB cohesive strength causes inter-
 * granular fracture. Irradiation embrittlement shifts DBTT upward via
 * Frank loops, voids, and Cu-rich precipitate hardening per the
 * Odette-Lucas correlation DeltaDBTT ~ a * sqrt(fluence). The Master
 * Curve method (ASTM E1921) parameterizes cleavage toughness as
 * K_Jc(T) = 30 + 70 * exp(0.019 * (T - T_0)) with T_0 as the
 * reference transition temperature. In DLMM context, bins embrittle
 * when accumulated trading stress, sustained composition imbalance,
 * and low activity conspire to make them incapable of absorbing
 * shocks — a formerly ductile bin that tolerated imbalance through
 * elastic rebalancing becomes a brittle bin where small perturbations
 * trigger cleavage-like liquidity fractures. High concentration near
 * bin boundaries (grain-boundary analog) concentrates risk and
 * triggers intergranular failure.
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

interface BinEmbrittlement {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  dbtt: number;                      // ductile-brittle transition proxy, 0-1 (high = easily brittle)
  impactEnergy: number;              // Charpy-like absorbed energy, 0-1 (high = tough/ductile)
  hydrogenConcentration: number;     // H at stress concentrators, 0-1
  temperEmbrittlement: number;       // GB impurity segregation, 0-1
  irradiationDose: number;           // accumulated cyclic damage, 0-1
  intergranularFraction: number;     // along-boundary fracture, 0-1
  transgranularFraction: number;     // through-grain cleavage, 0-1
  upperShelfEnergy: number;          // ductile plateau energy, 0-1
  lowerShelfEnergy: number;          // brittle plateau energy, 0-1
  transitionWidth: number;           // DBT temperature range, 0-1
  cleavageTendency: number;          // brittle cleavage propensity, 0-1
  grainBoundaryStrength: number;     // GB cohesive strength, 0-1
  crackTipHConc: number;             // Oriani crack-tip H, 0-1
  fractureToughness: number;         // K_IC equivalent, 0-1 (high = tough)
  ductilityIndex: number;            // composite 0-1 (higher = ductile/tough, healthy)
}

interface EmbrittlementProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgDbtt: number;
  maxDbtt: number;
  avgImpactEnergy: number;
  minImpactEnergy: number;
  avgHydrogenConcentration: number;
  maxHydrogenConcentration: number;
  avgTemperEmbrittlement: number;
  maxTemperEmbrittlement: number;
  avgIrradiationDose: number;
  maxIrradiationDose: number;
  avgIntergranularFraction: number;
  maxIntergranularFraction: number;
  avgTransgranularFraction: number;
  avgUpperShelfEnergy: number;
  avgLowerShelfEnergy: number;
  avgTransitionWidth: number;
  avgCleavageTendency: number;
  maxCleavageTendency: number;
  avgGrainBoundaryStrength: number;
  minGrainBoundaryStrength: number;
  avgCrackTipHConc: number;
  maxCrackTipHConc: number;
  avgFractureToughness: number;
  minFractureToughness: number;
  // Derived counts
  brittleCount: number;
  brittleFraction: number;
  transitionCount: number;
  transitionFraction: number;
  ductileCount: number;
  ductileFraction: number;
  // Summary
  embrittlementGini: number;
  ductilityIndex: number;
  embrittlementRegime: string;
  embrittlementVerdict: string;
  topBins: BinEmbrittlement[];
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

function computeBinEmbrittlement(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  maxReserve: number,
  avgReserve: number,
  poolImbalance: number
): BinEmbrittlement {
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

  // Composition imbalance — solute accumulation (H or impurity proxy)
  const xFraction = bin.totalUsd > 0 ? bin.reserveXUsd / bin.totalUsd : 0.5;
  const imbalance = Math.abs(xFraction - 0.5) * 2;

  // Neighbor variance — lattice heterogeneity / GB density proxy
  const neighborVariance = neighbors.length > 1
    ? neighbors.reduce((s, b) => s + Math.pow(b.totalUsd - neighborAvg, 2), 0) / neighbors.length
    : 0;
  const normalizedStdDev = neighborAvg > 0 ? Math.sqrt(neighborVariance) / neighborAvg : 0;

  // Concentration differential — stress gradient proxy
  const concentrationDiff = neighborAvg > 0
    ? Math.abs(bin.totalUsd - neighborAvg) / neighborAvg
    : 0;

  // Distance from active = cooler = closer to DBTT
  const proximityFactor = Math.max(0, 1 - distance * 0.02);

  // Activity level — plastic deformation rate proxy (high = ductile)
  const activityLevel = Math.min(1, volumeRatio * 0.6);

  // Size dominance — stress concentrator
  const sizeDominance = reserveFraction;

  // Hydrostatic stress proxy — high for concentrated bins at boundaries
  const hydrostaticStress = Math.min(1, sizeDominance * 0.6 + concentrationDiff * 0.4);

  // -----------------------------------------------------------------------
  // 1. dbtt — ductile-brittle transition temperature proxy
  // High = easily brittle (low transition threshold to overcome)
  // Shifted up by irradiation, H, and temper embrittlement
  const dbtt = r4(
    Math.min(1,
      (1 - activityLevel) * 0.3 +         // stagnant = cold = below DBTT
      (1 - proximityFactor) * 0.2 +       // far = cooler
      imbalance * 0.2 +                   // solute raises DBTT
      concentrationDiff * 0.15 +
      normalizedStdDev * 0.15
    )
  );

  // 2. hydrogenConcentration — H at stress concentrators
  // Oriani equilibrium: C_H = C_0 * exp(sigma_h * V_H / RT)
  const hydrogenConcentration = r4(
    Math.min(1,
      hydrostaticStress * 0.35 +
      imbalance * 0.25 +
      (1 - activityLevel) * 0.2 +        // H accumulates in stagnant bins
      sizeDominance * 0.1 +
      concentrationDiff * 0.1
    )
  );

  // 3. temperEmbrittlement — GB impurity segregation
  // McLean: x_gb / (1-x_gb) = (x_0/(1-x_0)) * exp(-DG_seg/RT)
  // Segregation peaks at moderate aging with cold conditions
  const temperEmbrittlement = r4(
    Math.min(1,
      imbalance * 0.3 +
      (1 - activityLevel) * 0.25 +
      normalizedStdDev * 0.2 +            // lattice distortion at GB
      distance * 0.01 +                   // far bins age longer
      concentrationDiff * 0.15
    )
  );

  // 4. irradiationDose — accumulated cyclic damage
  // Odette-Lucas: DeltaDBTT ~ a * sqrt(fluence)
  const irradiationDose = r4(
    Math.min(1,
      activityLevel * 0.3 +               // trading = radiation
      volumeRatio * 0.25 +
      normalizedStdDev * 0.2 +            // accumulated defects
      Math.pow(distance / BIN_SCAN_RADIUS, 0.5) * 0.15 +
      imbalance * 0.1
    )
  );

  // 5. intergranularFraction — along-boundary fracture fraction
  // High when GB segregation (temper) or H at GB
  const intergranularFraction = r4(
    Math.min(1,
      temperEmbrittlement * 0.35 +
      hydrogenConcentration * 0.25 +
      (1 - activityLevel) * 0.15 +
      normalizedStdDev * 0.15 +
      imbalance * 0.1
    )
  );

  // 6. transgranularFraction — through-grain cleavage fraction
  // Dominant at low T, low H, transgranular cleavage on {100} planes
  const transgranularFraction = r4(
    Math.min(1,
      Math.max(0, 1 - intergranularFraction) * 0.6 +
      dbtt * 0.2 +                        // cold = cleavage
      (1 - imbalance) * 0.1 +
      (1 - hydrogenConcentration * 0.3)
    )
  );

  // 7. upperShelfEnergy — ductile plateau energy
  // High = tough ductile tearing with microvoid coalescence
  const upperShelfEnergy = r4(
    Math.min(1,
      activityLevel * 0.3 +
      (1 - imbalance) * 0.25 +
      proximityFactor * 0.2 +
      (1 - hydrogenConcentration) * 0.15 +
      (1 - temperEmbrittlement) * 0.1
    )
  );

  // 8. lowerShelfEnergy — brittle plateau energy (always low, ~1-5% of USE)
  // Low = minimum energy absorbed during cleavage
  const lowerShelfEnergy = r4(
    Math.min(1,
      0.1 +                               // baseline low
      (1 - dbtt) * 0.15 +
      (1 - hydrogenConcentration) * 0.1 +
      activityLevel * 0.1 +
      (1 - temperEmbrittlement) * 0.05
    )
  );

  // 9. transitionWidth — DBT temperature range
  // Narrow = sharp transition (clean steel); wide = gradual
  const transitionWidth = r4(
    Math.min(1,
      normalizedStdDev * 0.35 +
      imbalance * 0.2 +
      temperEmbrittlement * 0.2 +
      irradiationDose * 0.15 +
      concentrationDiff * 0.1
    )
  );

  // 10. cleavageTendency — brittle cleavage propensity on {100}
  // High when dbtt elevated and USE reduced
  const cleavageTendency = r4(
    Math.min(1,
      dbtt * 0.3 +
      (1 - upperShelfEnergy) * 0.25 +
      hydrogenConcentration * 0.2 +
      temperEmbrittlement * 0.15 +
      (1 - activityLevel) * 0.1
    )
  );

  // 11. impactEnergy — Charpy-like absorbed energy at current "temperature"
  // Master curve: E(T) = LSE + (USE-LSE)/2 * (1 + tanh((T-DBTT)/W))
  // We proxy T as activityLevel (high = hot = above DBTT)
  // Above DBTT -> USE, Below DBTT -> LSE
  const temperatureProxy = activityLevel;
  const argument = transitionWidth > 0
    ? (temperatureProxy - dbtt) / Math.max(0.1, transitionWidth * 0.5)
    : 0;
  const tanhArg = Math.tanh(argument);
  const impactEnergy = r4(
    Math.min(1, Math.max(0,
      lowerShelfEnergy + (upperShelfEnergy - lowerShelfEnergy) * 0.5 * (1 + tanhArg)
    ))
  );

  // 12. grainBoundaryStrength — GB cohesive strength
  // Reduced by H (HEDE) and impurity segregation (TE)
  const grainBoundaryStrength = r4(
    Math.min(1, Math.max(0,
      (1 - hydrogenConcentration) * 0.35 +
      (1 - temperEmbrittlement) * 0.3 +
      (1 - intergranularFraction) * 0.15 +
      proximityFactor * 0.1 +
      activityLevel * 0.1
    ))
  );

  // 13. crackTipHConc — Oriani equilibrium H at crack tip
  // C_H = C_0 * exp(sigma_h * V_H / RT); hydrostatic stress drives enrichment
  const crackTipHConc = r4(
    Math.min(1,
      hydrogenConcentration * (0.5 + hydrostaticStress * 0.5) * 0.6 +
      hydrostaticStress * 0.25 +
      imbalance * 0.1 +
      sizeDominance * 0.05
    )
  );

  // 14. fractureToughness — K_IC equivalent (high = tough)
  // Master curve: K_Jc(T) = 30 + 70*exp(0.019*(T-T_0))
  // Tough when above DBTT with low embrittlement
  const fractureToughness = r4(
    Math.min(1, Math.max(0,
      upperShelfEnergy * 0.3 +
      (1 - dbtt) * 0.2 +
      activityLevel * 0.15 +
      (1 - hydrogenConcentration) * 0.1 +
      (1 - temperEmbrittlement) * 0.1 +
      (1 - irradiationDose * 0.3) * 0.1 +
      grainBoundaryStrength * 0.05
    ))
  );

  // 15. ductilityIndex — composite 0-1 (higher = ductile/tough = healthy)
  const ductilityIndex = r4(
    Math.min(1, Math.max(0,
      fractureToughness * 0.15 +
      impactEnergy * 0.12 +
      upperShelfEnergy * 0.1 +
      (1 - dbtt) * 0.1 +
      (1 - cleavageTendency) * 0.08 +
      (1 - hydrogenConcentration) * 0.07 +
      (1 - temperEmbrittlement) * 0.07 +
      grainBoundaryStrength * 0.07 +
      (1 - irradiationDose * 0.4) * 0.06 +
      (1 - intergranularFraction) * 0.06 +
      (1 - crackTipHConc) * 0.05 +
      activityLevel * 0.04 +
      (1 - transitionWidth) * 0.03
    ))
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    dbtt,
    impactEnergy,
    hydrogenConcentration,
    temperEmbrittlement,
    irradiationDose,
    intergranularFraction,
    transgranularFraction,
    upperShelfEnergy,
    lowerShelfEnergy,
    transitionWidth,
    cleavageTendency,
    grainBoundaryStrength,
    crackTipHConc,
    fractureToughness,
    ductilityIndex,
  };
}

function analyzeEmbrittlement(bins: BinReserves[], pool: AppPool): EmbrittlementProfile {
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

  const binEmbs = sorted.map((b) =>
    computeBinEmbrittlement(b, activeBin, sorted, totalUsd, volume, maxReserve, avgReserve, poolImbalance)
  );

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgDbtt = r4(avg(binEmbs.map((b) => b.dbtt)));
  const maxDbtt = r4(Math.max(...binEmbs.map((b) => b.dbtt)));
  const avgImpactEnergy = r4(avg(binEmbs.map((b) => b.impactEnergy)));
  const minImpactEnergy = r4(Math.min(...binEmbs.map((b) => b.impactEnergy)));
  const avgHydrogenConcentration = r4(avg(binEmbs.map((b) => b.hydrogenConcentration)));
  const maxHydrogenConcentration = r4(Math.max(...binEmbs.map((b) => b.hydrogenConcentration)));
  const avgTemperEmbrittlement = r4(avg(binEmbs.map((b) => b.temperEmbrittlement)));
  const maxTemperEmbrittlement = r4(Math.max(...binEmbs.map((b) => b.temperEmbrittlement)));
  const avgIrradiationDose = r4(avg(binEmbs.map((b) => b.irradiationDose)));
  const maxIrradiationDose = r4(Math.max(...binEmbs.map((b) => b.irradiationDose)));
  const avgIntergranularFraction = r4(avg(binEmbs.map((b) => b.intergranularFraction)));
  const maxIntergranularFraction = r4(Math.max(...binEmbs.map((b) => b.intergranularFraction)));
  const avgTransgranularFraction = r4(avg(binEmbs.map((b) => b.transgranularFraction)));
  const avgUpperShelfEnergy = r4(avg(binEmbs.map((b) => b.upperShelfEnergy)));
  const avgLowerShelfEnergy = r4(avg(binEmbs.map((b) => b.lowerShelfEnergy)));
  const avgTransitionWidth = r4(avg(binEmbs.map((b) => b.transitionWidth)));
  const avgCleavageTendency = r4(avg(binEmbs.map((b) => b.cleavageTendency)));
  const maxCleavageTendency = r4(Math.max(...binEmbs.map((b) => b.cleavageTendency)));
  const avgGrainBoundaryStrength = r4(avg(binEmbs.map((b) => b.grainBoundaryStrength)));
  const minGrainBoundaryStrength = r4(Math.min(...binEmbs.map((b) => b.grainBoundaryStrength)));
  const avgCrackTipHConc = r4(avg(binEmbs.map((b) => b.crackTipHConc)));
  const maxCrackTipHConc = r4(Math.max(...binEmbs.map((b) => b.crackTipHConc)));
  const avgFractureToughness = r4(avg(binEmbs.map((b) => b.fractureToughness)));
  const minFractureToughness = r4(Math.min(...binEmbs.map((b) => b.fractureToughness)));

  // Brittle: low impact energy AND high DBTT
  const brittleCount = binEmbs.filter(
    (b) => b.impactEnergy < 0.3 && b.dbtt > 0.5
  ).length;
  const brittleFraction = r4(brittleCount / n);

  // Transition: mid impact energy in DBTT zone
  const transitionCount = binEmbs.filter(
    (b) => b.impactEnergy >= 0.3 && b.impactEnergy <= 0.7
  ).length;
  const transitionFraction = r4(transitionCount / n);

  // Ductile: high impact energy with low DBTT
  const ductileCount = binEmbs.filter(
    (b) => b.impactEnergy > 0.7 || (b.impactEnergy > 0.5 && b.dbtt < 0.4)
  ).length;
  const ductileFraction = r4(ductileCount / n);

  // Gini on ductilityIndex distribution
  const dFactors = binEmbs.map((b) => b.ductilityIndex);
  const sortedFactors = [...dFactors].sort((a, b) => b - a);
  const totalFactors = sortedFactors.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedFactors[i];
  }
  const embrittlementGini = totalFactors > 0
    ? r4(Math.abs(giniSum) / (n * totalFactors))
    : 0;

  // Composite ductility index (0-100)
  // High = ductile/tough pool (healthy); low = embrittled (unhealthy)
  const toughnessScore   = Math.min(25, avgFractureToughness * 25);
  const impactScore      = Math.min(25, avgImpactEnergy * 25);
  const integrityScore   = Math.min(25, (1 - avgCleavageTendency) * 25);
  const boundaryScore    = Math.min(25, avgGrainBoundaryStrength * 25);
  const ductilityIndex = Math.round(
    Math.min(100, toughnessScore + impactScore + integrityScore + boundaryScore)
  );

  // Regime classification — high index = ductile (healthy)
  let embrittlementRegime: string;
  if (ductilityIndex >= 80)      embrittlementRegime = "DUCTILE";
  else if (ductilityIndex >= 60) embrittlementRegime = "TOUGH";
  else if (ductilityIndex >= 40) embrittlementRegime = "TRANSITION";
  else if (ductilityIndex >= 20) embrittlementRegime = "EMBRITTLING";
  else                            embrittlementRegime = "BRITTLE";

  // Verdict classification
  let embrittlementVerdict: string;
  if (avgFractureToughness > 0.6 && avgImpactEnergy > 0.6 && avgCleavageTendency < 0.3)
    embrittlementVerdict = "DUCTILE_PLATEAU";
  else if (avgCleavageTendency > 0.6 && avgImpactEnergy < 0.4 && avgDbtt > 0.5)
    embrittlementVerdict = "BRITTLE_FRACTURE";
  else if (avgHydrogenConcentration > 0.6 && avgCrackTipHConc > 0.5)
    embrittlementVerdict = "HYDROGEN_CHARGED";
  else if (avgTemperEmbrittlement > 0.6 && avgIntergranularFraction > 0.5)
    embrittlementVerdict = "TEMPER_EMBRITTLED";
  else if (avgIrradiationDose > 0.6 && avgDbtt > 0.5)
    embrittlementVerdict = "IRRADIATION_AGED";
  else if (avgIntergranularFraction > 0.5 && avgIntergranularFraction > avgTransgranularFraction)
    embrittlementVerdict = "INTERGRANULAR_DOMINANT";
  else if (avgTransgranularFraction > 0.5 && avgCleavageTendency > 0.4)
    embrittlementVerdict = "TRANSGRANULAR_DOMINANT";
  else if (avgImpactEnergy >= 0.3 && avgImpactEnergy <= 0.7 && avgTransitionWidth > 0.4)
    embrittlementVerdict = "TRANSITION_ZONE";
  else
    embrittlementVerdict = "EMBRITTLEMENT_BALANCE";

  const topBins = [...binEmbs]
    .sort((a, b) => b.ductilityIndex - a.ductilityIndex)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgDbtt,
    maxDbtt,
    avgImpactEnergy,
    minImpactEnergy,
    avgHydrogenConcentration,
    maxHydrogenConcentration,
    avgTemperEmbrittlement,
    maxTemperEmbrittlement,
    avgIrradiationDose,
    maxIrradiationDose,
    avgIntergranularFraction,
    maxIntergranularFraction,
    avgTransgranularFraction,
    avgUpperShelfEnergy,
    avgLowerShelfEnergy,
    avgTransitionWidth,
    avgCleavageTendency,
    maxCleavageTendency,
    avgGrainBoundaryStrength,
    minGrainBoundaryStrength,
    avgCrackTipHConc,
    maxCrackTipHConc,
    avgFractureToughness,
    minFractureToughness,
    brittleCount,
    brittleFraction,
    transitionCount,
    transitionFraction,
    ductileCount,
    ductileFraction,
    embrittlementGini,
    ductilityIndex,
    embrittlementRegime,
    embrittlementVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Embrittlement — Doctor ===\n");
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

  const profiles: EmbrittlementProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeEmbrittlement(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgDuctilityIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.ductilityIndex)))
      : 0,
    ductileCount:     profiles.filter((p) => p.embrittlementRegime === "DUCTILE").length,
    toughCount:       profiles.filter((p) => p.embrittlementRegime === "TOUGH").length,
    transitionCount:  profiles.filter((p) => p.embrittlementRegime === "TRANSITION").length,
    embrittlingCount: profiles.filter((p) => p.embrittlementRegime === "EMBRITTLING").length,
    brittleCount:     profiles.filter((p) => p.embrittlementRegime === "BRITTLE").length,
    avgFractureToughness: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgFractureToughness)))
      : 0,
    avgImpactEnergy: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgImpactEnergy)))
      : 0,
    avgCleavageTendency: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgCleavageTendency)))
      : 0,
    totalBrittleBins:    profiles.reduce((s, p) => s + p.brittleCount, 0),
    totalTransitionBins: profiles.reduce((s, p) => s + p.transitionCount, 0),
    totalDuctileBins:    profiles.reduce((s, p) => s + p.ductileCount, 0),
    avgEmbrittlementGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.embrittlementGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-embrittlement").description("HODLMM bin ductile-to-brittle transition analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin embrittlement state")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
