#!/usr/bin/env bun
/**
 * hodlmm-bin-relaxation.ts — Day 165 cocoa007 Bitflow Skills Comp
 *
 * Stress relaxation analyzer — models time-dependent stress decay
 * under held constant strain across HODLMM bins. Stress relaxation
 * is the dual phenomenon to creep: where creep describes strain
 * growth under held stress, relaxation describes stress decay under
 * held strain. The Maxwell model gives exponential decay
 * sigma(t) = sigma_0 * exp(-t/tau), where tau = eta/E is the
 * characteristic relaxation time (ratio of viscosity to elastic
 * modulus). Real materials exhibit a spectrum of relaxation times
 * rather than a single exponential, captured by the generalized
 * Maxwell model as a Prony series sigma(t) = sigma_inf +
 * sum(sigma_i * exp(-t/tau_i)), or by the Kohlrausch-Williams-Watts
 * stretched exponential sigma(t) = sigma_0 * exp(-(t/tau)^beta)
 * where beta between 0 and 1 controls the breadth of the relaxation
 * spectrum (beta = 1 is single Debye, beta < 1 is broad). The
 * Deborah number De = tau/t_obs distinguishes elastic (De >> 1)
 * from viscous (De << 1) behavior on the timescale of observation.
 * Viscoelastic materials exhibit both storage modulus E' (elastic,
 * in-phase with strain) and loss modulus E'' (viscous, 90-degrees
 * out-of-phase), with loss tangent tan(delta) = E''/E' measuring
 * the relative dissipation. In DLMM context, bins that have
 * accumulated composition imbalance are held at a "strained" state
 * where internal reactive pressure builds. This stress decays over
 * time as trading arbitrages the imbalance toward equilibrium. Bins
 * with high relaxation rate return quickly to natural composition,
 * while bins with low relaxation rate retain stress for extended
 * periods. The relaxation modulus E(t) = sigma(t)/epsilon_0
 * characterizes the time-dependent response. Polymers exhibit
 * primary (alpha) relaxation associated with cooperative segmental
 * motion and secondary (beta) relaxation associated with localized
 * side-group motion. Anelastic strain is the time-dependent but
 * reversible component that recovers upon stress removal, distinct
 * from permanent plastic deformation.
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

interface BinRelaxation {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  stressRelaxed: number;            // fraction of initial stress decayed, 0-1
  relaxationRate: number;           // initial decay rate (1/tau analogue), 0-1
  relaxationTime: number;           // tau in Maxwell model, 0-1 (long=high)
  deborahNumber: number;            // De = tau/t_obs, 0-1 (elastic when high)
  storageModulus: number;           // E' elastic in-phase component, 0-1
  lossModulus: number;              // E'' viscous out-of-phase component, 0-1
  lossTangent: number;              // tan(delta) = E''/E', 0-1
  relaxationModulus: number;        // E(t) = sigma(t)/eps_0, 0-1
  viscosity: number;                // eta, dashpot dissipation, 0-1
  kwwExponent: number;              // beta in stretched exponential, 0-1
  alphaRelaxation: number;          // primary cooperative motion, 0-1
  betaRelaxation: number;           // secondary localized motion, 0-1
  anelasticStrain: number;          // recoverable time-dependent strain, 0-1
  residualStress: number;           // sigma_inf at infinite time, 0-1
  relaxationSpectrum: number;       // breadth of tau distribution, 0-1
  relaxationFactor: number;         // composite 0-1
}

interface RelaxationProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgStressRelaxed: number;
  maxStressRelaxed: number;
  avgRelaxationRate: number;
  maxRelaxationRate: number;
  avgRelaxationTime: number;
  maxRelaxationTime: number;
  avgDeborahNumber: number;
  maxDeborahNumber: number;
  avgStorageModulus: number;
  maxStorageModulus: number;
  avgLossModulus: number;
  maxLossModulus: number;
  avgLossTangent: number;
  maxLossTangent: number;
  avgRelaxationModulus: number;
  maxRelaxationModulus: number;
  avgViscosity: number;
  maxViscosity: number;
  avgKwwExponent: number;
  minKwwExponent: number;
  avgAlphaRelaxation: number;
  maxAlphaRelaxation: number;
  avgBetaRelaxation: number;
  maxBetaRelaxation: number;
  avgAnelasticStrain: number;
  maxAnelasticStrain: number;
  avgResidualStress: number;
  maxResidualStress: number;
  avgRelaxationSpectrum: number;
  maxRelaxationSpectrum: number;
  // Derived counts
  rigidCount: number;               // elastic-dominated bins (De high)
  rigidFraction: number;
  relaxingCount: number;            // actively relaxing bins
  relaxingFraction: number;
  fluidCount: number;               // fully viscous bins
  fluidFraction: number;
  // Summary
  relaxationGini: number;
  relaxationIndex: number;
  relaxationRegime: string;
  relaxationVerdict: string;
  topBins: BinRelaxation[];
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

function computeBinRelaxation(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  maxReserve: number,
  avgReserve: number
): BinRelaxation {
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

  // Reserve composition (imbalance = held strain on bin)
  const xFraction = bin.totalUsd > 0 ? bin.reserveXUsd / bin.totalUsd : 0.5;
  const imbalance = Math.abs(xFraction - 0.5) * 2;

  // Neighbor reserve variance — proxy for structural heterogeneity
  const neighborVariance = neighbors.length > 1
    ? neighbors.reduce((s, b) => s + Math.pow(b.totalUsd - neighborAvg, 2), 0) / neighbors.length
    : 0;
  const normalizedStdDev = neighborAvg > 0 ? Math.sqrt(neighborVariance) / neighborAvg : 0;

  // Concentration differential vs neighbors
  const concentrationDiff = neighborAvg > 0
    ? Math.abs(bin.totalUsd - neighborAvg) / neighborAvg
    : 0;

  // Distance decay — bins far from active experience slower relaxation
  const proximityFactor = Math.max(0, 1 - distance * 0.02);

  // Activity level — drives arbitrage that relaxes stress
  const activityLevel = Math.min(1, volumeRatio * 0.6);

  // -----------------------------------------------------------------------
  // 1. stressRelaxed — fraction of initial stress that has decayed via arbitrage
  // High = stress has largely dissipated, bin is returning to equilibrium
  const stressRelaxed = r4(
    Math.min(1,
      activityLevel * 0.35 +
      proximityFactor * 0.25 +
      (1 - imbalance) * 0.2 +
      (1 - concentrationDiff) * 0.1 +
      reserveFraction * 0.1
    )
  );

  // 2. relaxationRate — initial decay rate 1/tau (Maxwell model)
  // High = fast stress dissipation, short characteristic time
  const relaxationRate = r4(
    Math.min(1,
      activityLevel * 0.35 +
      proximityFactor * 0.25 +
      reserveFraction * 0.2 +
      (1 - normalizedStdDev) * 0.1 +
      (1 - distance * 0.02) * 0.1
    )
  );

  // 3. relaxationTime — tau = eta/E characteristic relaxation time
  // High = slow relaxation (long tau), low = fast relaxation (short tau)
  const relaxationTime = r4(
    Math.min(1,
      (1 - activityLevel) * 0.35 +
      (1 - proximityFactor) * 0.25 +
      (1 - reserveFraction) * 0.2 +
      normalizedStdDev * 0.1 +
      imbalance * 0.1
    )
  );

  // 4. deborahNumber — De = tau/t_obs, distinguishes elastic vs viscous behavior
  // High De >> 1: elastic behavior, stress persists
  // Low De << 1: viscous behavior, stress relaxes rapidly
  const deborahNumber = r4(
    Math.min(1,
      relaxationTime * 0.4 +
      (1 - activityLevel) * 0.25 +
      imbalance * 0.2 +
      (1 - proximityFactor) * 0.15
    )
  );

  // 5. storageModulus — E' elastic in-phase component
  // High = strong elastic response, energy stored not dissipated
  const storageModulus = r4(
    Math.min(1,
      reserveFraction * 0.3 +
      (1 - activityLevel) * 0.25 +
      deborahNumber * 0.2 +
      proximityFactor * 0.15 +
      (1 - normalizedStdDev) * 0.1
    )
  );

  // 6. lossModulus — E'' viscous out-of-phase component
  // High = strong dissipation, energy converted to heat (fees)
  const lossModulus = r4(
    Math.min(1,
      activityLevel * 0.35 +
      imbalance * 0.2 +
      concentrationDiff * 0.15 +
      normalizedStdDev * 0.15 +
      (1 - deborahNumber) * 0.15
    )
  );

  // 7. lossTangent — tan(delta) = E''/E', relative dissipation
  // High = dissipative (viscous-dominated), low = elastic-dominated
  const lossTangent = r4(
    storageModulus > 0
      ? Math.min(1, lossModulus / Math.max(storageModulus, 0.1))
      : lossModulus
  );

  // 8. relaxationModulus — E(t) = sigma(t)/eps_0 remaining modulus
  // High = stress remains (little relaxation), low = fully relaxed
  const relaxationModulus = r4(
    Math.min(1,
      (1 - stressRelaxed) * 0.35 +
      storageModulus * 0.25 +
      deborahNumber * 0.2 +
      relaxationTime * 0.1 +
      (1 - lossTangent) * 0.1
    )
  );

  // 9. viscosity — eta dashpot dissipation coefficient
  // Controls rate of stress decay via Maxwell model (tau = eta/E)
  const viscosity = r4(
    Math.min(1,
      activityLevel * 0.3 +
      lossModulus * 0.3 +
      relaxationTime * 0.2 +
      imbalance * 0.1 +
      concentrationDiff * 0.1
    )
  );

  // 10. kwwExponent — beta in stretched exponential exp(-(t/tau)^beta)
  // High (~1) = single Debye exponential
  // Low (<1) = broad spectrum of relaxation times (heterogeneous)
  const kwwExponent = r4(
    Math.min(1,
      (1 - normalizedStdDev) * 0.35 +
      (1 - concentrationDiff) * 0.25 +
      reserveFraction * 0.2 +
      proximityFactor * 0.2
    )
  );

  // 11. alphaRelaxation — primary cooperative segmental motion
  // Dominant in glass transition, large-scale structural relaxation
  const alphaRelaxation = r4(
    Math.min(1,
      activityLevel * 0.3 +
      (1 - kwwExponent) * 0.25 +  // broad spectrum favors alpha
      concentrationDiff * 0.2 +
      imbalance * 0.15 +
      normalizedStdDev * 0.1
    )
  );

  // 12. betaRelaxation — secondary localized motion
  // Side-group or sub-unit motion, sub-glass relaxation
  const betaRelaxation = r4(
    Math.min(1,
      (1 - activityLevel) * 0.3 +
      kwwExponent * 0.25 +        // narrow spectrum favors discrete beta
      reserveFraction * 0.2 +
      proximityFactor * 0.15 +
      (1 - imbalance) * 0.1
    )
  );

  // 13. anelasticStrain — recoverable time-dependent strain
  // Reverses on stress removal (unlike plastic creep strain)
  const anelasticStrain = r4(
    Math.min(1,
      stressRelaxed * 0.3 +
      (1 - relaxationModulus) * 0.25 +
      activityLevel * 0.2 +
      lossModulus * 0.15 +
      (1 - imbalance) * 0.1
    )
  );

  // 14. residualStress — sigma_inf at infinite time (unrelaxed component)
  // High = permanent residual stress, never fully decays
  const residualStress = r4(
    Math.min(1,
      imbalance * 0.3 +
      (1 - activityLevel) * 0.25 +
      storageModulus * 0.2 +
      deborahNumber * 0.15 +
      (1 - proximityFactor) * 0.1
    )
  );

  // 15. relaxationSpectrum — breadth of tau distribution (1 - kwwExponent)
  // High = many relaxation times (heterogeneous), low = single time
  const relaxationSpectrum = r4(
    Math.min(1,
      (1 - kwwExponent) * 0.4 +
      normalizedStdDev * 0.25 +
      concentrationDiff * 0.2 +
      imbalance * 0.15
    )
  );

  // 16. relaxationFactor — composite 0-1
  // Rewards fast relaxation, low residual, balanced loss tangent
  const relaxationFactor = r4(
    Math.min(1,
      stressRelaxed * 0.15 +
      relaxationRate * 0.15 +
      (1 - residualStress) * 0.15 +
      (1 - relaxationTime * 0.5) * 0.1 +
      (1 - relaxationModulus) * 0.1 +
      (1 - deborahNumber * 0.5) * 0.08 +
      kwwExponent * 0.07 +
      anelasticStrain * 0.06 +
      (1 - relaxationSpectrum * 0.5) * 0.05 +
      (1 - Math.abs(lossTangent - 0.5) * 2) * 0.05 +    // balanced is best
      viscosity * 0.04
    )
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    stressRelaxed,
    relaxationRate,
    relaxationTime,
    deborahNumber,
    storageModulus,
    lossModulus,
    lossTangent,
    relaxationModulus,
    viscosity,
    kwwExponent,
    alphaRelaxation,
    betaRelaxation,
    anelasticStrain,
    residualStress,
    relaxationSpectrum,
    relaxationFactor,
  };
}

function analyzeRelaxation(bins: BinReserves[], pool: AppPool): RelaxationProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));
  const avgReserve = totalUsd / n;

  const binRelaxations = sorted.map((b) =>
    computeBinRelaxation(b, activeBin, sorted, totalUsd, volume, maxReserve, avgReserve)
  );

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgStressRelaxed = r4(avg(binRelaxations.map((b) => b.stressRelaxed)));
  const maxStressRelaxed = r4(Math.max(...binRelaxations.map((b) => b.stressRelaxed)));
  const avgRelaxationRate = r4(avg(binRelaxations.map((b) => b.relaxationRate)));
  const maxRelaxationRate = r4(Math.max(...binRelaxations.map((b) => b.relaxationRate)));
  const avgRelaxationTime = r4(avg(binRelaxations.map((b) => b.relaxationTime)));
  const maxRelaxationTime = r4(Math.max(...binRelaxations.map((b) => b.relaxationTime)));
  const avgDeborahNumber = r4(avg(binRelaxations.map((b) => b.deborahNumber)));
  const maxDeborahNumber = r4(Math.max(...binRelaxations.map((b) => b.deborahNumber)));
  const avgStorageModulus = r4(avg(binRelaxations.map((b) => b.storageModulus)));
  const maxStorageModulus = r4(Math.max(...binRelaxations.map((b) => b.storageModulus)));
  const avgLossModulus = r4(avg(binRelaxations.map((b) => b.lossModulus)));
  const maxLossModulus = r4(Math.max(...binRelaxations.map((b) => b.lossModulus)));
  const avgLossTangent = r4(avg(binRelaxations.map((b) => b.lossTangent)));
  const maxLossTangent = r4(Math.max(...binRelaxations.map((b) => b.lossTangent)));
  const avgRelaxationModulus = r4(avg(binRelaxations.map((b) => b.relaxationModulus)));
  const maxRelaxationModulus = r4(Math.max(...binRelaxations.map((b) => b.relaxationModulus)));
  const avgViscosity = r4(avg(binRelaxations.map((b) => b.viscosity)));
  const maxViscosity = r4(Math.max(...binRelaxations.map((b) => b.viscosity)));
  const avgKwwExponent = r4(avg(binRelaxations.map((b) => b.kwwExponent)));
  const minKwwExponent = r4(Math.min(...binRelaxations.map((b) => b.kwwExponent)));
  const avgAlphaRelaxation = r4(avg(binRelaxations.map((b) => b.alphaRelaxation)));
  const maxAlphaRelaxation = r4(Math.max(...binRelaxations.map((b) => b.alphaRelaxation)));
  const avgBetaRelaxation = r4(avg(binRelaxations.map((b) => b.betaRelaxation)));
  const maxBetaRelaxation = r4(Math.max(...binRelaxations.map((b) => b.betaRelaxation)));
  const avgAnelasticStrain = r4(avg(binRelaxations.map((b) => b.anelasticStrain)));
  const maxAnelasticStrain = r4(Math.max(...binRelaxations.map((b) => b.anelasticStrain)));
  const avgResidualStress = r4(avg(binRelaxations.map((b) => b.residualStress)));
  const maxResidualStress = r4(Math.max(...binRelaxations.map((b) => b.residualStress)));
  const avgRelaxationSpectrum = r4(avg(binRelaxations.map((b) => b.relaxationSpectrum)));
  const maxRelaxationSpectrum = r4(Math.max(...binRelaxations.map((b) => b.relaxationSpectrum)));

  // Rigid: high Deborah (elastic-dominated), low relaxation
  const rigidCount = binRelaxations.filter(
    (b) => b.deborahNumber > 0.6 && b.stressRelaxed < 0.3
  ).length;
  const rigidFraction = r4(rigidCount / n);

  // Relaxing: actively dissipating stress
  const relaxingCount = binRelaxations.filter(
    (b) => b.stressRelaxed > 0.3 && b.stressRelaxed < 0.8
  ).length;
  const relaxingFraction = r4(relaxingCount / n);

  // Fluid: low Deborah (viscous-dominated), fully relaxed
  const fluidCount = binRelaxations.filter(
    (b) => b.deborahNumber < 0.3 && b.stressRelaxed > 0.7
  ).length;
  const fluidFraction = r4(fluidCount / n);

  // Gini coefficient on relaxationFactor distribution
  const rfFactors = binRelaxations.map((b) => b.relaxationFactor);
  const sortedFactors = [...rfFactors].sort((a, b) => b - a);
  const totalFactors = sortedFactors.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedFactors[i];
  }
  const relaxationGini = totalFactors > 0
    ? r4(Math.abs(giniSum) / (n * totalFactors))
    : 0;

  // Composite relaxation index (0-100)
  // High score = effective relaxation: fast decay, low residual, balanced
  const decayScore    = Math.min(25, avgStressRelaxed * 25);
  const rateScore     = Math.min(25, avgRelaxationRate * 25);
  const residualScore = Math.min(25, (1 - avgResidualStress) * 25);
  const kwwScore      = Math.min(25, avgKwwExponent * 25);
  const relaxationIndex = Math.round(
    Math.min(100, decayScore + rateScore + residualScore + kwwScore)
  );

  // Relaxation regime classification (viscoelastic spectrum)
  let relaxationRegime: string;
  if (relaxationIndex >= 80)      relaxationRegime = "FLUID";
  else if (relaxationIndex >= 60) relaxationRegime = "VISCOUS";
  else if (relaxationIndex >= 40) relaxationRegime = "VISCOELASTIC";
  else if (relaxationIndex >= 20) relaxationRegime = "TRANSITIONING";
  else                            relaxationRegime = "RIGID";

  // Verdict classification
  let relaxationVerdict: string;
  if (avgDeborahNumber > 0.7 && avgStressRelaxed < 0.2)
    relaxationVerdict = "NO_RELAXATION";
  else if (avgRelaxationTime > 0.6 && avgStressRelaxed < 0.4)
    relaxationVerdict = "SLOW_RELAXATION";
  else if (avgKwwExponent > 0.7 && avgStressRelaxed > 0.4)
    relaxationVerdict = "EXPONENTIAL_DECAY";
  else if (avgRelaxationSpectrum > 0.5 && avgStressRelaxed > 0.3)
    relaxationVerdict = "STRETCHED_EXPONENTIAL";
  else if (avgStressRelaxed > 0.7 && avgResidualStress < 0.3)
    relaxationVerdict = "FULLY_RELAXED";
  else
    relaxationVerdict = "RELAXATION_BALANCE";

  const topBins = [...binRelaxations]
    .sort((a, b) => b.relaxationFactor - a.relaxationFactor)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgStressRelaxed,
    maxStressRelaxed,
    avgRelaxationRate,
    maxRelaxationRate,
    avgRelaxationTime,
    maxRelaxationTime,
    avgDeborahNumber,
    maxDeborahNumber,
    avgStorageModulus,
    maxStorageModulus,
    avgLossModulus,
    maxLossModulus,
    avgLossTangent,
    maxLossTangent,
    avgRelaxationModulus,
    maxRelaxationModulus,
    avgViscosity,
    maxViscosity,
    avgKwwExponent,
    minKwwExponent,
    avgAlphaRelaxation,
    maxAlphaRelaxation,
    avgBetaRelaxation,
    maxBetaRelaxation,
    avgAnelasticStrain,
    maxAnelasticStrain,
    avgResidualStress,
    maxResidualStress,
    avgRelaxationSpectrum,
    maxRelaxationSpectrum,
    rigidCount,
    rigidFraction,
    relaxingCount,
    relaxingFraction,
    fluidCount,
    fluidFraction,
    relaxationGini,
    relaxationIndex,
    relaxationRegime,
    relaxationVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Relaxation — Doctor ===\n");
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

  const profiles: RelaxationProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeRelaxation(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgRelaxationIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.relaxationIndex)))
      : 0,
    fluidCount:         profiles.filter((p) => p.relaxationRegime === "FLUID").length,
    viscousCount:       profiles.filter((p) => p.relaxationRegime === "VISCOUS").length,
    viscoelasticCount:  profiles.filter((p) => p.relaxationRegime === "VISCOELASTIC").length,
    transitioningCount: profiles.filter((p) => p.relaxationRegime === "TRANSITIONING").length,
    rigidCount:         profiles.filter((p) => p.relaxationRegime === "RIGID").length,
    avgStressRelaxed: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgStressRelaxed)))
      : 0,
    avgRelaxationRate: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgRelaxationRate)))
      : 0,
    avgResidualStress: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgResidualStress)))
      : 0,
    totalRigidBins:    profiles.reduce((s, p) => s + p.rigidCount, 0),
    totalRelaxingBins: profiles.reduce((s, p) => s + p.relaxingCount, 0),
    totalFluidBins:    profiles.reduce((s, p) => s + p.fluidCount, 0),
    avgRelaxationGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.relaxationGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-relaxation").description("HODLMM bin stress relaxation analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin stress relaxation dynamics")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
