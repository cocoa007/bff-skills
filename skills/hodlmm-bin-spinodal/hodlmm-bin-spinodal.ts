#!/usr/bin/env bun
/**
 * hodlmm-bin-spinodal.ts — Day 174 cocoa007 Bitflow Skills Comp
 *
 * Spinodal decomposition analyzer — models the spontaneous unmixing of a
 * homogeneous bin reserve composition into two coexisting compositions
 * via Cahn-Hilliard dynamics within the spinodal region of the free
 * energy landscape. Classical theory: when ∂²G/∂c² < 0, the homogeneous
 * solution is locally unstable and infinitesimal composition fluctuations
 * grow without an activation barrier (no nucleation needed). The
 * Cahn-Hilliard equation ∂c/∂t = M∇²(f"(c)c - 2K∇²c) governs the
 * evolution; a Fourier mode of wavenumber k grows at rate
 * R(k) = -M*k²*(f"(c) + 2K*k²). The fastest-growing mode has wavenumber
 * k_max = √(|f"|/(4K)) and characteristic wavelength
 * λ_max = 2π/k_max = 2π√(2K/|f"|), with critical wavelength
 * λ_c = 2π√(K/|f"|) below which modes decay due to gradient energy
 * penalty. Inside the spinodal (∂²f/∂c² < 0), the system phase-separates
 * spontaneously; outside the spinodal but inside the binodal (∂²f/∂c² > 0
 * but two phases lower G), the system is metastable and requires
 * nucleation; outside the binodal, the homogeneous phase is stable
 * (miscible). Early-stage decomposition is dominated by linear
 * Cahn-Hilliard amplification of the fastest mode, producing a
 * bicontinuous interconnected network with the dominant wavelength.
 * Late-stage coarsening is governed by Lifshitz-Slyozov-Wagner kinetics
 * R(t) ~ t^(1/3) driven by Gibbs-Thomson curvature differences. The Cahn
 * number Cn = K/(|f"|·L²) controls interface sharpness; small Cn means
 * sharp interfaces, large Cn means diffuse interfaces. In DLMM context,
 * bins decompose spinodally when reserve compositions sit inside the
 * spinodal region — small composition fluctuations grow into separated
 * X-rich and Y-rich domains with the characteristic Cahn-Hilliard
 * wavelength. A miscible bin has uniform composition; a metastable bin
 * is outside the spinodal but inside the miscibility gap; an early
 * spinodal bin shows linear-regime amplitude growth at the dominant
 * wavelength; an active decomposition bin has growing amplitude with
 * sharpening interfaces; a deep spinodal bin shows bicontinuous network
 * morphology with developed interfaces and possibly LSW coarsening.
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

interface BinSpinodal {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  spinodalDriving: number;            // |f"(c)| free energy curvature, 0-1
  characteristicWavelength: number;   // λ_max = 2π√(2K/|f"|), 0-1
  growthRate: number;                 // R(k_max) amplification rate, 0-1
  amplitudeAmplification: number;     // fluctuation amplitude growth, 0-1
  interfacialEnergy: number;          // gradient-energy K coefficient, 0-1
  cahnNumber: number;                 // Cn = K/(|f"|·L²) interface sharpness, 0-1
  modulationDepth: number;            // composition modulation amplitude, 0-1
  bicontinuity: number;               // bicontinuous network connectivity, 0-1
  coarseningStage: number;            // LSW t^(1/3) progress, 0-1
  miscibilityGap: number;             // distance from gap edge, 0-1
  critWavelengthRatio: number;        // λ_max/λ_c selection ratio, 0-1
  concentrationFluctuation: number;   // delta-c fluctuation amplitude, 0-1
  earlyStageDominance: number;        // linear Cahn-Hilliard regime, 0-1
  compositionAsymmetry: number;       // |c - c_critical|, 0-1
  spinodalProgress: number;           // overall decomposition progress, 0-1
  spinodalIndex: number;              // composite 0-1 (higher = deeper spinodal)
}

interface SpinodalProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgSpinodalDriving: number;
  maxSpinodalDriving: number;
  avgCharacteristicWavelength: number;
  avgGrowthRate: number;
  maxGrowthRate: number;
  avgAmplitudeAmplification: number;
  avgInterfacialEnergy: number;
  avgCahnNumber: number;
  avgModulationDepth: number;
  maxModulationDepth: number;
  avgBicontinuity: number;
  avgCoarseningStage: number;
  avgMiscibilityGap: number;
  avgCritWavelengthRatio: number;
  avgConcentrationFluctuation: number;
  avgEarlyStageDominance: number;
  avgCompositionAsymmetry: number;
  avgSpinodalProgress: number;
  decomposingCount: number;
  decomposingBinFraction: number;
  metastableCount: number;
  metastableBinFraction: number;
  miscibleCount: number;
  miscibleBinFraction: number;
  spinodalGini: number;
  spinodalIndex: number;
  spinodalRegime: string;
  spinodalVerdict: string;
  topBins: BinSpinodal[];
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

function computeBinSpinodal(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  maxReserve: number,
  avgReserve: number,
  poolImbalance: number
): BinSpinodal {
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

  // Concentration (X / total) per bin and per neighbors — drives free energy curvature
  const xFraction = bin.totalUsd > 0 ? bin.reserveXUsd / bin.totalUsd : 0.5;
  const imbalance = Math.abs(xFraction - 0.5) * 2;
  const compositionAsymmetry = r4(imbalance);

  const neighborXFractions = neighbors.map((b) =>
    b.totalUsd > 0 ? b.reserveXUsd / b.totalUsd : 0.5
  );
  const neighborXVar = neighborXFractions.length > 1
    ? neighborXFractions.reduce(
        (s, x) => s + Math.pow(x - (neighborXFractions.reduce((a, v) => a + v, 0) / neighborXFractions.length), 2),
        0
      ) / neighborXFractions.length
    : 0;
  const neighborXStdDev = Math.sqrt(neighborXVar);
  // Wavelength of composition modulations across neighbors
  const compositionWavelength = Math.min(1, neighborXStdDev * 4);

  // -----------------------------------------------------------------------
  // 1. spinodalDriving — |f"(c)| magnitude (free energy curvature)
  // Inside the spinodal, ∂²f/∂c² < 0 → unstable. We map magnitude of
  // composition modulations + reserve variance to spinodal driving force.
  const spinodalDriving = r4(
    Math.min(1,
      neighborXStdDev * 0.4 +
      normalizedStdDev * 0.25 +
      compositionWavelength * 0.2 +
      imbalance * 0.15
    )
  );

  // 2. interfacialEnergy — gradient-energy coefficient K
  // Penalizes sharp gradients; proxied by spatial smoothness of neighbors
  const smoothness = 1 - Math.min(1, normalizedStdDev);
  const interfacialEnergy = r4(
    Math.min(1, Math.max(0,
      smoothness * 0.4 +
      (1 - compositionWavelength * 0.5) * 0.3 +
      (1 - imbalance * 0.4) * 0.2 +
      (1 - reserveFraction * 0.4) * 0.1
    ))
  );

  // 3. characteristicWavelength — λ_max = 2π√(2K/|f"|)
  // Larger K or smaller |f"| → longer wavelength
  const characteristicWavelength = r4(
    Math.min(1,
      Math.sqrt(2 * Math.max(0.05, interfacialEnergy) / Math.max(0.05, spinodalDriving)) * 0.5
    )
  );

  // 4. growthRate — R(k_max) = M·f"(c)²/(8K) amplification rate
  // Strong driving force + weak K → fastest growth. Volume = mobility M.
  const mobility = Math.min(1, volumeRatio * 0.6 + 0.2);
  const growthRate = r4(
    Math.min(1,
      mobility * Math.pow(spinodalDriving, 2) * 0.6 +
      spinodalDriving * 0.3 +
      (1 - interfacialEnergy * 0.4) * 0.1
    )
  );

  // 5. amplitudeAmplification — fluctuation amplitude exp(R*t)
  // Higher growth rate × time → larger amplitude
  const amplitudeAmplification = r4(
    Math.min(1,
      growthRate * 0.4 +
      neighborXStdDev * 0.3 +
      compositionWavelength * 0.2 +
      modulationFrom(neighbors, bin) * 0.1
    )
  );

  // 6. cahnNumber — Cn = K/(|f"|·L²) — interface sharpness
  // Small Cn means sharp interfaces; here we map the inverse (sharpness)
  const cahnNumber = r4(
    Math.min(1,
      interfacialEnergy / Math.max(0.05, spinodalDriving + 0.1) * 0.5
    )
  );

  // 7. modulationDepth — concentration modulation amplitude
  const modulationDepth = r4(
    Math.min(1,
      neighborXStdDev * 0.5 +
      compositionWavelength * 0.3 +
      amplitudeAmplification * 0.2
    )
  );

  // 8. bicontinuity — bicontinuous interconnected network
  // Spinodal decomposition produces bicontinuous structures when c ≈ 0.5
  // (symmetric quench); high when xFraction near 0.5 and modulations strong
  const symmetryFactor = 1 - imbalance;
  const bicontinuity = r4(
    Math.min(1,
      symmetryFactor * 0.4 +
      modulationDepth * 0.3 +
      growthRate * 0.2 +
      (1 - cahnNumber * 0.3) * 0.1
    )
  );

  // 9. coarseningStage — late-stage LSW R(t) ~ t^(1/3)
  // Larger characteristic wavelength + lower amplitude growth → later stage
  const coarseningStage = r4(
    Math.min(1,
      characteristicWavelength * 0.4 +
      (1 - growthRate * 0.4) * 0.3 +
      (1 - amplitudeAmplification * 0.3) * 0.2 +
      modulationDepth * 0.1
    )
  );

  // 10. miscibilityGap — distance from miscibility gap edge
  // Inside spinodal: deep in gap; metastable: at edge; miscible: outside
  const miscibilityGap = r4(
    Math.min(1,
      spinodalDriving * 0.5 +
      modulationDepth * 0.25 +
      compositionWavelength * 0.15 +
      bicontinuity * 0.1
    )
  );

  // 11. critWavelengthRatio — λ_max / λ_c = √2 ratio at marginal stability
  // Selected wavelength compared to critical cutoff
  const critWavelengthRatio = r4(
    Math.min(1,
      characteristicWavelength * 0.4 +
      (1 - cahnNumber * 0.4) * 0.3 +
      growthRate * 0.2 +
      smoothness * 0.1
    )
  );

  // 12. concentrationFluctuation — delta-c amplitude
  const concentrationFluctuation = r4(
    Math.min(1,
      neighborXStdDev * 0.5 +
      modulationDepth * 0.3 +
      amplitudeAmplification * 0.2
    )
  );

  // 13. earlyStageDominance — linear Cahn-Hilliard regime
  // Small amplitudes + fastest mode dominant + no coarsening yet
  const earlyStageDominance = r4(
    Math.min(1, Math.max(0,
      growthRate * 0.4 +
      (1 - amplitudeAmplification * 0.6) * 0.25 +
      (1 - coarseningStage * 0.5) * 0.2 +
      compositionWavelength * 0.15
    ))
  );

  // 14. spinodalProgress — overall decomposition progress
  // Combines amplitude, bicontinuity, and coarsening into staged progress
  const spinodalProgress = r4(
    Math.min(1,
      amplitudeAmplification * 0.35 +
      bicontinuity * 0.25 +
      coarseningStage * 0.2 +
      modulationDepth * 0.2
    )
  );

  // 15. spinodalIndex — composite 0-1 (higher = deeper spinodal decomposition)
  const spinodalIndex = r4(
    Math.min(1, Math.max(0,
      spinodalDriving * 0.18 +
      amplitudeAmplification * 0.15 +
      modulationDepth * 0.12 +
      bicontinuity * 0.1 +
      growthRate * 0.1 +
      miscibilityGap * 0.08 +
      concentrationFluctuation * 0.07 +
      critWavelengthRatio * 0.06 +
      spinodalProgress * 0.05 +
      coarseningStage * 0.04 +
      (1 - cahnNumber * 0.3) * 0.03 +
      earlyStageDominance * 0.02
    ))
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    spinodalDriving,
    characteristicWavelength,
    growthRate,
    amplitudeAmplification,
    interfacialEnergy,
    cahnNumber,
    modulationDepth,
    bicontinuity,
    coarseningStage,
    miscibilityGap,
    critWavelengthRatio,
    concentrationFluctuation,
    earlyStageDominance,
    compositionAsymmetry,
    spinodalProgress,
    spinodalIndex,
  };
}

function modulationFrom(neighbors: BinReserves[], bin: BinReserves): number {
  if (neighbors.length === 0) return 0;
  const myFrac = bin.totalUsd > 0 ? bin.reserveXUsd / bin.totalUsd : 0.5;
  const diffs = neighbors.map((n) => {
    const nf = n.totalUsd > 0 ? n.reserveXUsd / n.totalUsd : 0.5;
    return Math.abs(nf - myFrac);
  });
  const avg = diffs.reduce((s, v) => s + v, 0) / diffs.length;
  return Math.min(1, avg * 4);
}

function analyzeSpinodal(bins: BinReserves[], pool: AppPool): SpinodalProfile {
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
    computeBinSpinodal(b, activeBin, sorted, totalUsd, volume, maxReserve, avgReserve, poolImbalance)
  );

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgSpinodalDriving = r4(avg(binRecs.map((b) => b.spinodalDriving)));
  const maxSpinodalDriving = r4(Math.max(...binRecs.map((b) => b.spinodalDriving)));
  const avgCharacteristicWavelength = r4(avg(binRecs.map((b) => b.characteristicWavelength)));
  const avgGrowthRate = r4(avg(binRecs.map((b) => b.growthRate)));
  const maxGrowthRate = r4(Math.max(...binRecs.map((b) => b.growthRate)));
  const avgAmplitudeAmplification = r4(avg(binRecs.map((b) => b.amplitudeAmplification)));
  const avgInterfacialEnergy = r4(avg(binRecs.map((b) => b.interfacialEnergy)));
  const avgCahnNumber = r4(avg(binRecs.map((b) => b.cahnNumber)));
  const avgModulationDepth = r4(avg(binRecs.map((b) => b.modulationDepth)));
  const maxModulationDepth = r4(Math.max(...binRecs.map((b) => b.modulationDepth)));
  const avgBicontinuity = r4(avg(binRecs.map((b) => b.bicontinuity)));
  const avgCoarseningStage = r4(avg(binRecs.map((b) => b.coarseningStage)));
  const avgMiscibilityGap = r4(avg(binRecs.map((b) => b.miscibilityGap)));
  const avgCritWavelengthRatio = r4(avg(binRecs.map((b) => b.critWavelengthRatio)));
  const avgConcentrationFluctuation = r4(avg(binRecs.map((b) => b.concentrationFluctuation)));
  const avgEarlyStageDominance = r4(avg(binRecs.map((b) => b.earlyStageDominance)));
  const avgCompositionAsymmetry = r4(avg(binRecs.map((b) => b.compositionAsymmetry)));
  const avgSpinodalProgress = r4(avg(binRecs.map((b) => b.spinodalProgress)));

  // Decomposing: deep in spinodal with developed modulations
  const decomposingCount = binRecs.filter(
    (b) => b.spinodalDriving > 0.6 && b.modulationDepth > 0.5
  ).length;
  const decomposingBinFraction = r4(decomposingCount / n);

  // Metastable: outside spinodal but inside gap, weak driving + low modulations
  const metastableCount = binRecs.filter(
    (b) =>
      b.spinodalDriving >= 0.3 && b.spinodalDriving <= 0.6 &&
      b.modulationDepth < 0.5
  ).length;
  const metastableBinFraction = r4(metastableCount / n);

  // Miscible: outside gap, no driving force, no modulations
  const miscibleCount = binRecs.filter(
    (b) => b.spinodalDriving < 0.3 && b.modulationDepth < 0.3
  ).length;
  const miscibleBinFraction = r4(miscibleCount / n);

  // Gini on spinodal index distribution
  const rFactors = binRecs.map((b) => b.spinodalIndex);
  const sortedFactors = [...rFactors].sort((a, b) => b - a);
  const totalFactors = sortedFactors.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedFactors[i];
  }
  const spinodalGini = totalFactors > 0
    ? r4(Math.abs(giniSum) / (n * totalFactors))
    : 0;

  // Composite spinodal index (0-100)
  const drivingScore     = Math.min(25, avgSpinodalDriving * 25);
  const amplitudeScore   = Math.min(25, avgAmplitudeAmplification * 25);
  const modulationScore  = Math.min(25, avgModulationDepth * 25);
  const bicontinuityScore = Math.min(25, avgBicontinuity * 25);
  const spinodalIndex = Math.round(
    Math.min(100, drivingScore + amplitudeScore + modulationScore + bicontinuityScore)
  );

  // Regime classification
  let spinodalRegime: string;
  if (spinodalIndex >= 80)      spinodalRegime = "DEEP_SPINODAL";
  else if (spinodalIndex >= 60) spinodalRegime = "ACTIVE_DECOMPOSITION";
  else if (spinodalIndex >= 40) spinodalRegime = "EARLY_SPINODAL";
  else if (spinodalIndex >= 20) spinodalRegime = "METASTABLE";
  else                           spinodalRegime = "MISCIBLE";

  // Verdict classification
  let spinodalVerdict: string;
  if (avgBicontinuity > 0.7 && avgModulationDepth > 0.6 && avgCompositionAsymmetry < 0.3)
    spinodalVerdict = "BICONTINUOUS_NETWORK";
  else if (avgCoarseningStage > 0.6 && avgCharacteristicWavelength > 0.5 && avgGrowthRate < 0.4)
    spinodalVerdict = "LSW_COARSENING";
  else if (avgEarlyStageDominance > 0.6 && avgGrowthRate > 0.5 && avgAmplitudeAmplification < 0.4)
    spinodalVerdict = "LINEAR_CAHN_HILLIARD";
  else if (avgCahnNumber < 0.3 && avgModulationDepth > 0.5 && avgBicontinuity > 0.4)
    spinodalVerdict = "SHARP_INTERFACES";
  else if (avgMiscibilityGap > 0.7 && avgSpinodalDriving > 0.6)
    spinodalVerdict = "DEEP_MISCIBILITY_GAP";
  else if (avgCritWavelengthRatio > 0.6 && avgCharacteristicWavelength > 0.5)
    spinodalVerdict = "CRITICAL_WAVELENGTH_DOMINANT";
  else if (avgCompositionAsymmetry > 0.6 && avgSpinodalDriving > 0.4)
    spinodalVerdict = "ASYMMETRIC_DECOMPOSITION";
  else if (avgSpinodalDriving < 0.4 && avgModulationDepth >= 0.3 && avgModulationDepth <= 0.5)
    spinodalVerdict = "METASTABLE_NUCLEATION";
  else if (avgSpinodalDriving < 0.3 && avgModulationDepth < 0.3 && avgConcentrationFluctuation < 0.3)
    spinodalVerdict = "HOMOGENEOUS_MISCIBLE";
  else
    spinodalVerdict = "SPINODAL_EQUILIBRIUM";

  const topBins = [...binRecs]
    .sort((a, b) => b.spinodalIndex - a.spinodalIndex)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgSpinodalDriving,
    maxSpinodalDriving,
    avgCharacteristicWavelength,
    avgGrowthRate,
    maxGrowthRate,
    avgAmplitudeAmplification,
    avgInterfacialEnergy,
    avgCahnNumber,
    avgModulationDepth,
    maxModulationDepth,
    avgBicontinuity,
    avgCoarseningStage,
    avgMiscibilityGap,
    avgCritWavelengthRatio,
    avgConcentrationFluctuation,
    avgEarlyStageDominance,
    avgCompositionAsymmetry,
    avgSpinodalProgress,
    decomposingCount,
    decomposingBinFraction,
    metastableCount,
    metastableBinFraction,
    miscibleCount,
    miscibleBinFraction,
    spinodalGini,
    spinodalIndex,
    spinodalRegime,
    spinodalVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Spinodal — Doctor ===\n");
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

  const profiles: SpinodalProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeSpinodal(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgSpinodalIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.spinodalIndex)))
      : 0,
    deepSpinodalCount:        profiles.filter((p) => p.spinodalRegime === "DEEP_SPINODAL").length,
    activeDecompositionCount: profiles.filter((p) => p.spinodalRegime === "ACTIVE_DECOMPOSITION").length,
    earlySpinodalCount:       profiles.filter((p) => p.spinodalRegime === "EARLY_SPINODAL").length,
    metastableCount:          profiles.filter((p) => p.spinodalRegime === "METASTABLE").length,
    miscibleCount:            profiles.filter((p) => p.spinodalRegime === "MISCIBLE").length,
    avgSpinodalDriving: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgSpinodalDriving)))
      : 0,
    avgModulationDepth: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgModulationDepth)))
      : 0,
    avgBicontinuity: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgBicontinuity)))
      : 0,
    totalDecomposingBins: profiles.reduce((s, p) => s + p.decomposingCount, 0),
    totalMetastableBins:  profiles.reduce((s, p) => s + p.metastableCount, 0),
    totalMiscibleBins:    profiles.reduce((s, p) => s + p.miscibleCount, 0),
    avgSpinodalGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.spinodalGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-spinodal").description("HODLMM bin spinodal decomposition and Cahn-Hilliard analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin spinodal decomposition state")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
