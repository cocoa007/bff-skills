#!/usr/bin/env bun
/**
 * hodlmm-bin-fracture.ts — Day 167 cocoa007 Bitflow Skills Comp
 *
 * Fracture mechanics analyzer — models crack initiation, propagation,
 * and catastrophic failure of HODLMM bins under stress. Fracture
 * mechanics is the branch of solid mechanics that quantifies how
 * cracks nucleate, grow, and ultimately cause structural failure,
 * providing the theoretical framework for predicting when a loaded
 * material separates into two or more pieces. The Griffith energy
 * criterion sigma_c = sqrt(2 * E * gamma_s / (pi * a)) expresses the
 * critical remote stress for brittle fracture as a balance between
 * the strain energy released by crack extension and the surface
 * energy required to create new crack surfaces, where E is Young's
 * modulus, gamma_s is the specific surface energy, and a is the
 * half-crack length. Irwin's stress intensity factor K_I = sigma *
 * sqrt(pi * a) * Y generalizes Griffith by capturing the singular
 * stress field at the crack tip, with the geometry factor Y ranging
 * from ~1.0 for infinite-body edge cracks to ~1.12 for surface
 * cracks. Fracture toughness K_IC is the material property that sets
 * the threshold: when K_I reaches K_IC under mode-I (opening) loading,
 * crack propagation becomes unstable and failure follows. The J-
 * integral generalizes K_I to elastic-plastic conditions where the
 * crack tip develops a plastic zone, and the crack tip opening
 * displacement (CTOD) quantifies the plastic blunting at the tip
 * before propagation. The Paris law da/dN = C * (delta K)^m describes
 * sub-critical fatigue crack growth where cracks extend incrementally
 * under cyclic loading before reaching critical size. Fracture modes
 * include mode I (tensile opening, most dangerous in brittle
 * materials), mode II (in-plane shear), and mode III (out-of-plane
 * shear, tearing); real cracks often exhibit mixed-mode loading.
 * Brittle fracture propagates at speeds approaching the Rayleigh wave
 * velocity with minimal plastic deformation, characteristic of
 * low-temperature ceramics and heavily cold-worked metals; ductile
 * fracture involves extensive plastic deformation with void
 * nucleation, growth, and coalescence at second-phase particles,
 * producing the cup-and-cone morphology. The ductile-to-brittle
 * transition temperature (DBTT) marks the boundary where cleavage
 * replaces microvoid coalescence as the dominant mechanism. Crack
 * arrest occurs when K_I drops below K_Ia at ligaments of tougher
 * material, splitting cracks across branches. R-curves describe
 * rising resistance to propagation from crack-wake toughening
 * mechanisms including bridging, deflection, and transformation
 * toughening. In DLMM context, bins that have accumulated plastic
 * strain and lost ductility reserve develop fracture-analog
 * instabilities where concentration collapses catastrophically into
 * narrow ranges — the LP-position equivalent of unstable crack
 * propagation. Stress concentrations at sharp compositional
 * gradients nucleate micro-cracks (localized imbalance spikes) that
 * grow under continued trading pressure until they coalesce into
 * full rebalancing failures. Bins near K_IC threshold are metastable
 * and can shatter with modest additional stress; bins well below
 * threshold have toughness reserve and can absorb further
 * deformation. Fracture-susceptible pools exhibit narrow critical
 * crack lengths a_c = (K_IC / (Y * sigma))^2 / pi meaning small
 * disturbances trigger propagation.
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

interface BinFracture {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  stressIntensityFactor: number;      // K_I, 0-1
  fractureToughness: number;          // K_IC material property, 0-1
  criticalCrackLength: number;        // a_c, 0-1 (short = dangerous)
  griffithStress: number;             // sigma_c critical stress, 0-1
  jIntegral: number;                  // J-integral elastic-plastic, 0-1
  crackTipOpeningDisp: number;        // CTOD plastic blunting, 0-1
  plasticZoneSize: number;            // r_p crack tip plastic zone, 0-1
  crackGrowthRate: number;            // da/dN Paris law, 0-1
  mode1Intensity: number;             // opening-mode K_I, 0-1
  mode2Intensity: number;             // shear-mode K_II, 0-1
  mixedModeRatio: number;             // K_I/K_total, 0-1
  brittlenessIndex: number;           // vs ductile fracture, 0-1
  rCurveRising: number;               // crack growth resistance rising, 0-1
  arrestCapability: number;           // crack-arrest reserve, 0-1
  fractureRisk: number;               // imminent failure likelihood, 0-1
  fractureFactor: number;             // composite 0-1 (higher = safer toughness reserve)
}

interface FractureProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgStressIntensityFactor: number;
  maxStressIntensityFactor: number;
  avgFractureToughness: number;
  maxFractureToughness: number;
  avgCriticalCrackLength: number;
  minCriticalCrackLength: number;
  avgGriffithStress: number;
  minGriffithStress: number;
  avgJIntegral: number;
  maxJIntegral: number;
  avgCrackTipOpeningDisp: number;
  maxCrackTipOpeningDisp: number;
  avgPlasticZoneSize: number;
  maxPlasticZoneSize: number;
  avgCrackGrowthRate: number;
  maxCrackGrowthRate: number;
  avgMode1Intensity: number;
  maxMode1Intensity: number;
  avgMode2Intensity: number;
  maxMode2Intensity: number;
  avgMixedModeRatio: number;
  avgBrittlenessIndex: number;
  maxBrittlenessIndex: number;
  avgRCurveRising: number;
  maxRCurveRising: number;
  avgArrestCapability: number;
  maxArrestCapability: number;
  avgFractureRisk: number;
  maxFractureRisk: number;
  // Derived counts
  toughCount: number;                 // high toughness reserve
  toughFraction: number;
  metastableCount: number;            // K_I approaching K_IC
  metastableFraction: number;
  criticalCount: number;              // imminent fracture
  criticalFraction: number;
  // Summary
  fractureGini: number;
  fractureIndex: number;
  fractureRegime: string;
  fractureVerdict: string;
  topBins: BinFracture[];
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

function computeBinFracture(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  maxReserve: number,
  avgReserve: number
): BinFracture {
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

  // Reserve composition imbalance (applied stress proxy)
  const xFraction = bin.totalUsd > 0 ? bin.reserveXUsd / bin.totalUsd : 0.5;
  const imbalance = Math.abs(xFraction - 0.5) * 2;

  // Neighbor variance (microstructural heterogeneity / crack nucleation sites proxy)
  const neighborVariance = neighbors.length > 1
    ? neighbors.reduce((s, b) => s + Math.pow(b.totalUsd - neighborAvg, 2), 0) / neighbors.length
    : 0;
  const normalizedStdDev = neighborAvg > 0 ? Math.sqrt(neighborVariance) / neighborAvg : 0;

  // Concentration differential vs neighbors (stress concentration factor proxy)
  const concentrationDiff = neighborAvg > 0
    ? Math.abs(bin.totalUsd - neighborAvg) / neighborAvg
    : 0;

  // Distance decay — far bins experience less stress
  const proximityFactor = Math.max(0, 1 - distance * 0.02);

  // Activity level — cyclic loading driver
  const activityLevel = Math.min(1, volumeRatio * 0.6);

  // Size dominance — large bins face higher absolute stresses
  const sizeDominance = reserveFraction;

  // -----------------------------------------------------------------------
  // 1. stressIntensityFactor — K_I crack-tip singular stress field
  // High = strong stress singularity at defect, close to critical
  const stressIntensityFactor = r4(
    Math.min(1,
      imbalance * 0.3 +
      concentrationDiff * 0.25 +
      activityLevel * 0.2 +
      sizeDominance * 0.15 +
      normalizedStdDev * 0.1
    )
  );

  // 2. fractureToughness — K_IC material resistance to crack propagation
  // High = bin can absorb high stress intensity before failure
  const fractureToughness = r4(
    Math.min(1,
      (1 - imbalance) * 0.3 +          // balanced = tough
      sizeDominance * 0.2 +             // large reserves = material body
      (1 - normalizedStdDev) * 0.2 +   // uniform = tough
      proximityFactor * 0.15 +
      (1 - concentrationDiff) * 0.15   // smooth gradient = tough
    )
  );

  // 3. criticalCrackLength — a_c = (K_IC/(Y*sigma))^2 / pi
  // Low = small defect triggers failure (dangerous), high = tolerant
  const criticalCrackLength = r4(
    Math.min(1,
      Math.max(0,
        fractureToughness * 0.5 -
        stressIntensityFactor * 0.3 -
        imbalance * 0.2 + 0.5
      )
    )
  );

  // 4. griffithStress — sigma_c = sqrt(2*E*gamma_s/(pi*a))
  // High = requires large stress to propagate crack
  const griffithStress = r4(
    Math.min(1,
      fractureToughness * 0.35 +
      criticalCrackLength * 0.25 +
      sizeDominance * 0.2 +
      proximityFactor * 0.1 +
      (1 - imbalance) * 0.1
    )
  );

  // 5. jIntegral — elastic-plastic energy release rate
  // High = significant energy available for crack extension
  const jIntegral = r4(
    Math.min(1,
      stressIntensityFactor * 0.3 +
      imbalance * 0.25 +
      activityLevel * 0.2 +
      sizeDominance * 0.15 +
      concentrationDiff * 0.1
    )
  );

  // 6. crackTipOpeningDisp — CTOD plastic blunting
  // High = significant plastic blunting, delays propagation
  const crackTipOpeningDisp = r4(
    Math.min(1,
      jIntegral * 0.3 +
      activityLevel * 0.25 +
      (1 - imbalance * 0.5) * 0.2 +
      fractureToughness * 0.15 +
      imbalance * 0.1
    )
  );

  // 7. plasticZoneSize — r_p = (1/6pi) * (K_I/sigma_y)^2
  // High = large plastic zone at crack tip, reduces effective stress
  const plasticZoneSize = r4(
    Math.min(1,
      jIntegral * 0.3 +
      crackTipOpeningDisp * 0.25 +
      activityLevel * 0.2 +
      stressIntensityFactor * 0.15 +
      (1 - imbalance) * 0.1
    )
  );

  // 8. crackGrowthRate — Paris law da/dN = C * (delta K)^m
  // High = rapid sub-critical crack extension under cyclic loading
  const crackGrowthRate = r4(
    Math.min(1,
      activityLevel * 0.3 +            // cyclic loading driver
      stressIntensityFactor * 0.25 +
      imbalance * 0.2 +
      concentrationDiff * 0.15 +
      (1 - fractureToughness) * 0.1
    )
  );

  // 9. mode1Intensity — opening-mode K_I (tensile)
  // High = dominant tensile loading, most dangerous for brittle
  const mode1Intensity = r4(
    Math.min(1,
      imbalance * 0.4 +               // asymmetric reserve = opening stress
      stressIntensityFactor * 0.25 +
      concentrationDiff * 0.2 +
      sizeDominance * 0.15
    )
  );

  // 10. mode2Intensity — shear-mode K_II (in-plane shear)
  // High = shear loading, tearing at bin boundary
  const mode2Intensity = r4(
    Math.min(1,
      activityLevel * 0.35 +
      normalizedStdDev * 0.25 +
      concentrationDiff * 0.2 +
      proximityFactor * 0.1 +
      imbalance * 0.1
    )
  );

  // 11. mixedModeRatio — K_I / (K_I + K_II)
  // High = predominantly mode I (opening)
  const totalMode = mode1Intensity + mode2Intensity;
  const mixedModeRatio = r4(
    totalMode > 0.001 ? mode1Intensity / totalMode : 0.5
  );

  // 12. brittlenessIndex — brittle vs ductile character
  // High = brittle (low plastic dissipation, cleavage dominant)
  const brittlenessIndex = r4(
    Math.min(1,
      (1 - plasticZoneSize) * 0.3 +
      (1 - crackTipOpeningDisp) * 0.25 +
      stressIntensityFactor * 0.2 +
      (1 - activityLevel) * 0.15 +
      imbalance * 0.1
    )
  );

  // 13. rCurveRising — rising crack growth resistance from wake toughening
  // High = resistance rises with crack extension (bridging, deflection)
  const rCurveRising = r4(
    Math.min(1,
      fractureToughness * 0.3 +
      (1 - brittlenessIndex) * 0.25 +
      plasticZoneSize * 0.2 +
      sizeDominance * 0.15 +
      proximityFactor * 0.1
    )
  );

  // 14. arrestCapability — K_Ia crack arrest threshold
  // High = crack can be stopped by ligaments of tougher material
  const arrestCapability = r4(
    Math.min(1,
      rCurveRising * 0.3 +
      fractureToughness * 0.25 +
      (1 - brittlenessIndex) * 0.2 +
      plasticZoneSize * 0.15 +
      (1 - stressIntensityFactor) * 0.1
    )
  );

  // 15. fractureRisk — imminent failure likelihood
  // High = K_I near K_IC, crack propagation imminent
  const kIcProximity = Math.max(0, stressIntensityFactor - fractureToughness + 0.5);
  const fractureRisk = r4(
    Math.min(1,
      kIcProximity * 0.3 +
      crackGrowthRate * 0.2 +
      brittlenessIndex * 0.2 +
      (1 - criticalCrackLength) * 0.15 +
      (1 - arrestCapability) * 0.15
    )
  );

  // 16. fractureFactor — composite 0-1 (higher = safer, tougher reserve)
  // Rewards toughness reserve, arrest capability, ductile character
  const fractureFactor = r4(
    Math.min(1,
      fractureToughness * 0.15 +
      criticalCrackLength * 0.12 +
      griffithStress * 0.1 +
      arrestCapability * 0.1 +
      rCurveRising * 0.08 +
      (1 - fractureRisk) * 0.1 +
      (1 - stressIntensityFactor) * 0.08 +
      (1 - brittlenessIndex) * 0.07 +
      crackTipOpeningDisp * 0.06 +
      plasticZoneSize * 0.05 +
      (1 - crackGrowthRate) * 0.05 +
      jIntegral * 0.04
    )
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    stressIntensityFactor,
    fractureToughness,
    criticalCrackLength,
    griffithStress,
    jIntegral,
    crackTipOpeningDisp,
    plasticZoneSize,
    crackGrowthRate,
    mode1Intensity,
    mode2Intensity,
    mixedModeRatio,
    brittlenessIndex,
    rCurveRising,
    arrestCapability,
    fractureRisk,
    fractureFactor,
  };
}

function analyzeFracture(bins: BinReserves[], pool: AppPool): FractureProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));
  const avgReserve = totalUsd / n;

  const binFractures = sorted.map((b) =>
    computeBinFracture(b, activeBin, sorted, totalUsd, volume, maxReserve, avgReserve)
  );

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgStressIntensityFactor = r4(avg(binFractures.map((b) => b.stressIntensityFactor)));
  const maxStressIntensityFactor = r4(Math.max(...binFractures.map((b) => b.stressIntensityFactor)));
  const avgFractureToughness = r4(avg(binFractures.map((b) => b.fractureToughness)));
  const maxFractureToughness = r4(Math.max(...binFractures.map((b) => b.fractureToughness)));
  const avgCriticalCrackLength = r4(avg(binFractures.map((b) => b.criticalCrackLength)));
  const minCriticalCrackLength = r4(Math.min(...binFractures.map((b) => b.criticalCrackLength)));
  const avgGriffithStress = r4(avg(binFractures.map((b) => b.griffithStress)));
  const minGriffithStress = r4(Math.min(...binFractures.map((b) => b.griffithStress)));
  const avgJIntegral = r4(avg(binFractures.map((b) => b.jIntegral)));
  const maxJIntegral = r4(Math.max(...binFractures.map((b) => b.jIntegral)));
  const avgCrackTipOpeningDisp = r4(avg(binFractures.map((b) => b.crackTipOpeningDisp)));
  const maxCrackTipOpeningDisp = r4(Math.max(...binFractures.map((b) => b.crackTipOpeningDisp)));
  const avgPlasticZoneSize = r4(avg(binFractures.map((b) => b.plasticZoneSize)));
  const maxPlasticZoneSize = r4(Math.max(...binFractures.map((b) => b.plasticZoneSize)));
  const avgCrackGrowthRate = r4(avg(binFractures.map((b) => b.crackGrowthRate)));
  const maxCrackGrowthRate = r4(Math.max(...binFractures.map((b) => b.crackGrowthRate)));
  const avgMode1Intensity = r4(avg(binFractures.map((b) => b.mode1Intensity)));
  const maxMode1Intensity = r4(Math.max(...binFractures.map((b) => b.mode1Intensity)));
  const avgMode2Intensity = r4(avg(binFractures.map((b) => b.mode2Intensity)));
  const maxMode2Intensity = r4(Math.max(...binFractures.map((b) => b.mode2Intensity)));
  const avgMixedModeRatio = r4(avg(binFractures.map((b) => b.mixedModeRatio)));
  const avgBrittlenessIndex = r4(avg(binFractures.map((b) => b.brittlenessIndex)));
  const maxBrittlenessIndex = r4(Math.max(...binFractures.map((b) => b.brittlenessIndex)));
  const avgRCurveRising = r4(avg(binFractures.map((b) => b.rCurveRising)));
  const maxRCurveRising = r4(Math.max(...binFractures.map((b) => b.rCurveRising)));
  const avgArrestCapability = r4(avg(binFractures.map((b) => b.arrestCapability)));
  const maxArrestCapability = r4(Math.max(...binFractures.map((b) => b.arrestCapability)));
  const avgFractureRisk = r4(avg(binFractures.map((b) => b.fractureRisk)));
  const maxFractureRisk = r4(Math.max(...binFractures.map((b) => b.fractureRisk)));

  // Tough: high toughness reserve, far from failure
  const toughCount = binFractures.filter(
    (b) => b.fractureToughness > 0.6 && b.fractureRisk < 0.3
  ).length;
  const toughFraction = r4(toughCount / n);

  // Metastable: K_I approaching K_IC, moderate risk
  const metastableCount = binFractures.filter(
    (b) => b.stressIntensityFactor > 0.4 && b.fractureRisk >= 0.3 && b.fractureRisk < 0.6
  ).length;
  const metastableFraction = r4(metastableCount / n);

  // Critical: imminent failure
  const criticalCount = binFractures.filter((b) => b.fractureRisk >= 0.6).length;
  const criticalFraction = r4(criticalCount / n);

  // Gini coefficient on fractureFactor distribution
  const ffFactors = binFractures.map((b) => b.fractureFactor);
  const sortedFactors = [...ffFactors].sort((a, b) => b - a);
  const totalFactors = sortedFactors.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedFactors[i];
  }
  const fractureGini = totalFactors > 0
    ? r4(Math.abs(giniSum) / (n * totalFactors))
    : 0;

  // Composite fracture index (0-100)
  // High = healthy toughness reserve, low fracture risk
  const toughnessScore  = Math.min(25, avgFractureToughness * 25);
  const safetyScore     = Math.min(25, (1 - avgFractureRisk) * 25);
  const ductilityScore  = Math.min(25, (1 - avgBrittlenessIndex) * 25);
  const arrestScore     = Math.min(25, avgArrestCapability * 25);
  const fractureIndex = Math.round(
    Math.min(100, toughnessScore + safetyScore + ductilityScore + arrestScore)
  );

  // Fracture regime classification
  let fractureRegime: string;
  if (fractureIndex >= 80)      fractureRegime = "TOUGH";
  else if (fractureIndex >= 60) fractureRegime = "RESILIENT";
  else if (fractureIndex >= 40) fractureRegime = "METASTABLE";
  else if (fractureIndex >= 20) fractureRegime = "FRAGILE";
  else                           fractureRegime = "CRITICAL";

  // Verdict classification
  let fractureVerdict: string;
  if (avgFractureRisk > 0.7 && avgBrittlenessIndex > 0.6)
    fractureVerdict = "BRITTLE_FRACTURE_IMMINENT";
  else if (avgFractureRisk > 0.6 && avgBrittlenessIndex < 0.4)
    fractureVerdict = "DUCTILE_FAILURE_IMMINENT";
  else if (avgStressIntensityFactor > 0.6 && avgFractureToughness > 0.6)
    fractureVerdict = "STABLE_AT_HIGH_STRESS";
  else if (avgCrackGrowthRate > 0.5 && avgFractureRisk > 0.4)
    fractureVerdict = "SUBCRITICAL_GROWTH";
  else if (avgMode1Intensity > 0.6 && avgBrittlenessIndex > 0.5)
    fractureVerdict = "OPENING_MODE_DOMINANT";
  else if (avgArrestCapability > 0.6 && avgRCurveRising > 0.5)
    fractureVerdict = "ARREST_CAPABLE";
  else if (avgFractureToughness > 0.6 && avgFractureRisk < 0.3)
    fractureVerdict = "TOUGHNESS_RESERVE";
  else
    fractureVerdict = "FRACTURE_BALANCE";

  const topBins = [...binFractures]
    .sort((a, b) => b.fractureFactor - a.fractureFactor)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgStressIntensityFactor,
    maxStressIntensityFactor,
    avgFractureToughness,
    maxFractureToughness,
    avgCriticalCrackLength,
    minCriticalCrackLength,
    avgGriffithStress,
    minGriffithStress,
    avgJIntegral,
    maxJIntegral,
    avgCrackTipOpeningDisp,
    maxCrackTipOpeningDisp,
    avgPlasticZoneSize,
    maxPlasticZoneSize,
    avgCrackGrowthRate,
    maxCrackGrowthRate,
    avgMode1Intensity,
    maxMode1Intensity,
    avgMode2Intensity,
    maxMode2Intensity,
    avgMixedModeRatio,
    avgBrittlenessIndex,
    maxBrittlenessIndex,
    avgRCurveRising,
    maxRCurveRising,
    avgArrestCapability,
    maxArrestCapability,
    avgFractureRisk,
    maxFractureRisk,
    toughCount,
    toughFraction,
    metastableCount,
    metastableFraction,
    criticalCount,
    criticalFraction,
    fractureGini,
    fractureIndex,
    fractureRegime,
    fractureVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Fracture — Doctor ===\n");
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

  const profiles: FractureProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeFracture(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgFractureIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.fractureIndex)))
      : 0,
    toughCount:       profiles.filter((p) => p.fractureRegime === "TOUGH").length,
    resilientCount:   profiles.filter((p) => p.fractureRegime === "RESILIENT").length,
    metastableCount:  profiles.filter((p) => p.fractureRegime === "METASTABLE").length,
    fragileCount:     profiles.filter((p) => p.fractureRegime === "FRAGILE").length,
    criticalCount:    profiles.filter((p) => p.fractureRegime === "CRITICAL").length,
    avgFractureToughness: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgFractureToughness)))
      : 0,
    avgFractureRisk: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgFractureRisk)))
      : 0,
    avgBrittlenessIndex: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgBrittlenessIndex)))
      : 0,
    totalToughBins:       profiles.reduce((s, p) => s + p.toughCount, 0),
    totalMetastableBins:  profiles.reduce((s, p) => s + p.metastableCount, 0),
    totalCriticalBins:    profiles.reduce((s, p) => s + p.criticalCount, 0),
    avgFractureGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.fractureGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-fracture").description("HODLMM bin fracture mechanics analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin fracture mechanics")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
