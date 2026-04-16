#!/usr/bin/env bun
/**
 * hodlmm-bin-ostwald.ts — Day 175 cocoa007 Bitflow Skills Comp
 *
 * Ostwald ripening / LSW coarsening analyzer — models the late-stage
 * diffusional coarsening of a polydisperse population of bin reserves
 * via the Lifshitz-Slyozov-Wagner (LSW) theory of Ostwald ripening.
 * Classical theory: once phase separation is established (e.g. via
 * nucleation or spinodal decomposition), smaller particles have higher
 * chemical potential than larger particles through the Gibbs-Thomson
 * capillary effect: μ(R) = μ_∞ + 2γΩ/R, where γ is interfacial tension
 * and Ω is molar volume. The chemical-potential gradient drives mass
 * transport from small particles to large particles via diffusion
 * through the matrix. Small particles dissolve (R decreases); large
 * particles grow (R increases). A critical radius R_c = 2γΩ/(Rg·T·ln(S))
 * separates shrinking (R < R_c) from growing (R > R_c) particles — it
 * equals the mean radius for a self-similar distribution. LSW theory
 * predicts the mean cubed radius grows linearly in time:
 * <R>³ - <R₀>³ = K·t with rate constant K = 8γΩ²D·c_eq/(9·Rg·T), the
 * number density decays N(t) ~ t^(-1), total volume fraction φ is
 * conserved, and the normalized size distribution f(R/<R>) converges
 * to a universal self-similar profile sharply cut off at R/<R> = 1.5.
 * The LSW distribution is unique: its shape, mean, variance, and
 * skewness are fixed — deviations (e.g. bimodal or broadened
 * distributions) indicate non-LSW ripening, encounter-modified
 * (MLSW) kinetics, or finite volume-fraction effects (Ardell's
 * theory). In DLMM context, bins with larger reserves have lower
 * effective capillary pressure and accumulate reserves from smaller
 * neighboring bins over time — an analog of Ostwald ripening with
 * bin reserve = particle size, trading-driven rebalancing = matrix
 * diffusion, and reserve-fraction disparity = chemical-potential
 * gradient. A quiescent pool has uniform reserves (monodisperse,
 * no ripening); a pre-ripening pool shows small disparities
 * building up; an active-ripening pool shows established
 * shrinking-vs-growing separation with visible critical radius;
 * a steady-LSW pool has self-similar size distribution with
 * <R>³ ∝ t coarsening; an advanced-coarsening pool has large
 * disparities with few dominant bins absorbing remaining
 * reserves.
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

interface BinOstwald {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  gibbsThompsonPressure: number;        // 2γΩ/R capillary pressure, 0-1
  criticalRadiusPosition: number;       // (R - R_c)/R_c, 0-1 (growing side)
  ripeningRate: number;                 // dR/dt projected, 0-1
  sizeDisparity: number;                // deviation from mean bin size, 0-1
  monodispersityDeviation: number;      // distance from monodisperse, 0-1
  lswAlignment: number;                 // alignment with LSW distribution, 0-1
  survivorLikelihood: number;           // probability of surviving coarsening, 0-1
  volumeFractionConservation: number;   // φ conservation indicator, 0-1
  coarseningMaturity: number;           // 0 = early, 1 = late-stage, 0-1
  numberDensityDecay: number;           // N ~ t^(-1) signature, 0-1
  matrixDiffusivity: number;            // proxied from volume/turnover, 0-1
  chemicalPotentialGradient: number;    // μ(R) gradient magnitude, 0-1
  interparticleSpacing: number;         // mean spacing to populated neighbors, 0-1
  ripeningSupersaturation: number;      // c_matrix - c_eq driving force, 0-1
  ripeningProgress: number;             // overall ripening progress, 0-1
  ostwaldIndex: number;                 // composite 0-1 (higher = deeper ripening)
}

interface OstwaldProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgGibbsThompsonPressure: number;
  maxGibbsThompsonPressure: number;
  avgCriticalRadiusPosition: number;
  avgRipeningRate: number;
  maxRipeningRate: number;
  avgSizeDisparity: number;
  maxSizeDisparity: number;
  avgMonodispersityDeviation: number;
  avgLswAlignment: number;
  avgSurvivorLikelihood: number;
  avgVolumeFractionConservation: number;
  avgCoarseningMaturity: number;
  avgNumberDensityDecay: number;
  avgMatrixDiffusivity: number;
  avgChemicalPotentialGradient: number;
  avgInterparticleSpacing: number;
  avgRipeningSupersaturation: number;
  avgRipeningProgress: number;
  growingCount: number;
  growingBinFraction: number;
  shrinkingCount: number;
  shrinkingBinFraction: number;
  criticalCount: number;
  criticalBinFraction: number;
  meanReserveUsd: number;
  reserveSizeCoefVar: number;
  ostwaldGini: number;
  ostwaldIndex: number;
  ostwaldRegime: string;
  ostwaldVerdict: string;
  topBins: BinOstwald[];
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

function computeBinOstwald(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  meanReserve: number,
  maxReserve: number,
  reserveStdDev: number,
  volume24hUsd: number,
  totalUsd: number
): BinOstwald {
  const distance = Math.abs(bin.binId - activeBin);
  // Treat reserve size as a proxy for "particle radius"
  const R = bin.totalUsd;
  const R_c = meanReserve;            // critical radius ≈ mean (LSW)
  const normSize = maxReserve > 0 ? R / maxReserve : 0;
  const relToMean = R_c > 0 ? R / R_c : 1;

  const neighbors = allBins.filter(
    (b) => Math.abs(b.binId - bin.binId) <= 5 && b.binId !== bin.binId
  );
  const neighborAvg = neighbors.length > 0
    ? neighbors.reduce((s, b) => s + b.totalUsd, 0) / neighbors.length
    : 0;
  const neighborVariance = neighbors.length > 1
    ? neighbors.reduce((s, b) => s + Math.pow(b.totalUsd - neighborAvg, 2), 0) / neighbors.length
    : 0;
  const neighborStdDev = Math.sqrt(neighborVariance);

  // 1. gibbsThompsonPressure — 2γΩ/R capillary pressure
  //    smaller R → higher pressure; map normalized inverse of size
  const gibbsThompsonPressure = r4(
    Math.min(1, R > 0 ? Math.min(1, meanReserve / Math.max(R, meanReserve * 0.05)) * 0.5 : 0.9)
  );

  // 2. criticalRadiusPosition — (R - R_c) / R_c — growing side positive
  //    Map so higher means further above critical (growing)
  const raw = R_c > 0 ? (R - R_c) / R_c : 0;
  const criticalRadiusPosition = r4(
    Math.min(1, Math.max(0, (raw + 1) / 3))  // ~0 at R=0, 0.33 at R=R_c, 0.66 at R=2R_c
  );

  // 3. ripeningRate — projected dR/dt via Gibbs-Thomson-driven flux
  //    Larger particles grow, smaller shrink; rate scales with driving
  //    force and matrix diffusivity (volume).
  const mobility = Math.min(1, volume24hUsd > 0 ? volume24hUsd / (totalUsd || 1) * 0.4 + 0.2 : 0.1);
  const drivingForce = Math.abs(raw);
  const ripeningRate = r4(
    Math.min(1, mobility * drivingForce * 0.6 + drivingForce * 0.2 + neighborStdDev / Math.max(1, meanReserve) * 0.2)
  );

  // 4. sizeDisparity — deviation from mean bin size, normalized
  const sizeDisparity = r4(
    Math.min(1, meanReserve > 0 ? Math.abs(R - meanReserve) / Math.max(meanReserve, 1) * 0.6 : 0)
  );

  // 5. monodispersityDeviation — how far from monodisperse population
  const coefVar = meanReserve > 0 ? reserveStdDev / meanReserve : 0;
  const monodispersityDeviation = r4(
    Math.min(1, coefVar * 0.8 + sizeDisparity * 0.2)
  );

  // 6. lswAlignment — alignment with LSW universal distribution
  //    LSW has cutoff at R/<R> = 1.5 and peak near R/<R> = 1.1
  //    Penalize outliers above 1.5
  const r_ratio = R_c > 0 ? R / R_c : 1;
  let lswAlignment: number;
  if (r_ratio <= 1.5) {
    // Inside LSW support — peak near 1.13
    lswAlignment = Math.max(0, 1 - Math.abs(r_ratio - 1.13) * 0.8);
  } else {
    // Beyond LSW cutoff — diminishing alignment
    lswAlignment = Math.max(0, 1 - (r_ratio - 1.5) * 0.6);
  }
  lswAlignment = r4(Math.min(1, lswAlignment));

  // 7. survivorLikelihood — probability this bin survives coarsening
  //    Larger bins more likely to survive
  const survivorLikelihood = r4(
    Math.min(1,
      Math.max(0,
        (relToMean - 0.5) * 0.6 +
        normSize * 0.3 +
        (1 - gibbsThompsonPressure * 0.5) * 0.1
      )
    )
  );

  // 8. volumeFractionConservation — φ conservation indicator
  //    High when total reserves are conserved (ripening preserves volume)
  //    Proxied via lack of extreme outlier
  const volumeFractionConservation = r4(
    Math.min(1, Math.max(0,
      (1 - Math.abs(relToMean - 1) * 0.3) * 0.5 +
      (1 - coefVar * 0.3) * 0.3 +
      0.2
    ))
  );

  // 9. coarseningMaturity — 0 = early, 1 = late-stage steady state
  //    Late stage has high disparity + survivor concentration
  const coarseningMaturity = r4(
    Math.min(1,
      sizeDisparity * 0.3 +
      monodispersityDeviation * 0.3 +
      survivorLikelihood * 0.2 +
      (1 - lswAlignment * 0.3) * 0.2
    )
  );

  // 10. numberDensityDecay — N ~ t^(-1) signature
  //     Proxied by empty-neighbor fraction
  const emptyNeighbors = 10 - neighbors.length;
  const numberDensityDecay = r4(
    Math.min(1, Math.max(0,
      emptyNeighbors / 10 * 0.6 +
      coarseningMaturity * 0.4
    ))
  );

  // 11. matrixDiffusivity — D in LSW rate constant
  //     Proxied by volume/turnover
  const matrixDiffusivity = r4(
    Math.min(1, mobility * 0.8 + (distance < 5 ? 0.2 : 0))
  );

  // 12. chemicalPotentialGradient — |μ(R) - μ(<R>)|
  //     Higher for smaller or larger outliers
  const chemicalPotentialGradient = r4(
    Math.min(1,
      Math.abs(raw) * 0.5 +
      gibbsThompsonPressure * 0.3 +
      neighborStdDev / Math.max(1, meanReserve) * 0.2
    )
  );

  // 13. interparticleSpacing — mean distance to nearby populated bins
  const populated = allBins.length;
  const maxSpacing = BIN_SCAN_RADIUS * 2 + 1;
  const spacingNorm = populated > 0 ? maxSpacing / populated : 1;
  const interparticleSpacing = r4(
    Math.min(1, spacingNorm / 10)
  );

  // 14. ripeningSupersaturation — c_matrix - c_eq driving force
  //     Proxied by overall population disparity
  const ripeningSupersaturation = r4(
    Math.min(1,
      coefVar * 0.5 +
      sizeDisparity * 0.3 +
      Math.abs(raw) * 0.2
    )
  );

  // 15. ripeningProgress — overall progress combining stages
  const ripeningProgress = r4(
    Math.min(1,
      coarseningMaturity * 0.4 +
      sizeDisparity * 0.3 +
      ripeningRate * 0.2 +
      monodispersityDeviation * 0.1
    )
  );

  // 16. ostwaldIndex — composite
  const ostwaldIndex = r4(
    Math.min(1, Math.max(0,
      sizeDisparity * 0.18 +
      monodispersityDeviation * 0.15 +
      gibbsThompsonPressure * 0.12 +
      ripeningSupersaturation * 0.1 +
      coarseningMaturity * 0.1 +
      ripeningRate * 0.08 +
      chemicalPotentialGradient * 0.07 +
      ripeningProgress * 0.06 +
      lswAlignment * 0.05 +
      numberDensityDecay * 0.04 +
      matrixDiffusivity * 0.03 +
      survivorLikelihood * 0.02
    ))
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    gibbsThompsonPressure,
    criticalRadiusPosition,
    ripeningRate,
    sizeDisparity,
    monodispersityDeviation,
    lswAlignment,
    survivorLikelihood,
    volumeFractionConservation,
    coarseningMaturity,
    numberDensityDecay,
    matrixDiffusivity,
    chemicalPotentialGradient,
    interparticleSpacing,
    ripeningSupersaturation,
    ripeningProgress,
    ostwaldIndex,
  };
}

function analyzeOstwald(bins: BinReserves[], pool: AppPool): OstwaldProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));
  const meanReserve = totalUsd / n;
  const variance = sorted.reduce((s, b) => s + Math.pow(b.totalUsd - meanReserve, 2), 0) / n;
  const reserveStdDev = Math.sqrt(variance);
  const reserveSizeCoefVar = meanReserve > 0 ? r4(reserveStdDev / meanReserve) : 0;

  const binRecs = sorted.map((b) =>
    computeBinOstwald(b, activeBin, sorted, meanReserve, maxReserve, reserveStdDev, volume, totalUsd)
  );

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgGibbsThompsonPressure = r4(avg(binRecs.map((b) => b.gibbsThompsonPressure)));
  const maxGibbsThompsonPressure = r4(Math.max(...binRecs.map((b) => b.gibbsThompsonPressure)));
  const avgCriticalRadiusPosition = r4(avg(binRecs.map((b) => b.criticalRadiusPosition)));
  const avgRipeningRate = r4(avg(binRecs.map((b) => b.ripeningRate)));
  const maxRipeningRate = r4(Math.max(...binRecs.map((b) => b.ripeningRate)));
  const avgSizeDisparity = r4(avg(binRecs.map((b) => b.sizeDisparity)));
  const maxSizeDisparity = r4(Math.max(...binRecs.map((b) => b.sizeDisparity)));
  const avgMonodispersityDeviation = r4(avg(binRecs.map((b) => b.monodispersityDeviation)));
  const avgLswAlignment = r4(avg(binRecs.map((b) => b.lswAlignment)));
  const avgSurvivorLikelihood = r4(avg(binRecs.map((b) => b.survivorLikelihood)));
  const avgVolumeFractionConservation = r4(avg(binRecs.map((b) => b.volumeFractionConservation)));
  const avgCoarseningMaturity = r4(avg(binRecs.map((b) => b.coarseningMaturity)));
  const avgNumberDensityDecay = r4(avg(binRecs.map((b) => b.numberDensityDecay)));
  const avgMatrixDiffusivity = r4(avg(binRecs.map((b) => b.matrixDiffusivity)));
  const avgChemicalPotentialGradient = r4(avg(binRecs.map((b) => b.chemicalPotentialGradient)));
  const avgInterparticleSpacing = r4(avg(binRecs.map((b) => b.interparticleSpacing)));
  const avgRipeningSupersaturation = r4(avg(binRecs.map((b) => b.ripeningSupersaturation)));
  const avgRipeningProgress = r4(avg(binRecs.map((b) => b.ripeningProgress)));

  // Growing: R > R_c significantly (above mean)
  const growingCount = binRecs.filter(
    (b) => b.criticalRadiusPosition > 0.4
  ).length;
  const growingBinFraction = r4(growingCount / n);

  // Shrinking: R < R_c (below mean)
  const shrinkingCount = binRecs.filter(
    (b) => b.criticalRadiusPosition < 0.25
  ).length;
  const shrinkingBinFraction = r4(shrinkingCount / n);

  // Critical: near R_c
  const criticalCount = binRecs.filter(
    (b) => b.criticalRadiusPosition >= 0.25 && b.criticalRadiusPosition <= 0.4
  ).length;
  const criticalBinFraction = r4(criticalCount / n);

  // Gini on ostwald index distribution
  const rFactors = binRecs.map((b) => b.ostwaldIndex);
  const sortedFactors = [...rFactors].sort((a, b) => b - a);
  const totalFactors = sortedFactors.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedFactors[i];
  }
  const ostwaldGini = totalFactors > 0
    ? r4(Math.abs(giniSum) / (n * totalFactors))
    : 0;

  // Composite index (0-100)
  const disparityScore  = Math.min(25, avgSizeDisparity * 25);
  const monoScore       = Math.min(25, avgMonodispersityDeviation * 25);
  const maturityScore   = Math.min(25, avgCoarseningMaturity * 25);
  const rateScore       = Math.min(25, avgRipeningRate * 25);
  const ostwaldIndex = Math.round(
    Math.min(100, disparityScore + monoScore + maturityScore + rateScore)
  );

  // Regime classification
  let ostwaldRegime: string;
  if (ostwaldIndex >= 80)      ostwaldRegime = "ADVANCED_COARSENING";
  else if (ostwaldIndex >= 60) ostwaldRegime = "STEADY_LSW";
  else if (ostwaldIndex >= 40) ostwaldRegime = "ACTIVE_RIPENING";
  else if (ostwaldIndex >= 20) ostwaldRegime = "PRE_RIPENING";
  else                          ostwaldRegime = "QUIESCENT";

  // Verdict classification
  let ostwaldVerdict: string;
  if (avgLswAlignment > 0.6 && avgCoarseningMaturity > 0.5 && avgMonodispersityDeviation > 0.4)
    ostwaldVerdict = "LSW_STEADY_STATE";
  else if (avgRipeningRate > 0.6 && avgChemicalPotentialGradient > 0.5)
    ostwaldVerdict = "ACCELERATED_COARSENING";
  else if (avgGibbsThompsonPressure > 0.6 && avgRipeningSupersaturation > 0.5)
    ostwaldVerdict = "STRONG_CAPILLARY_PRESSURE";
  else if (avgMonodispersityDeviation < 0.25 && avgSizeDisparity < 0.25)
    ostwaldVerdict = "MONODISPERSE_STABLE";
  else if (shrinkingBinFraction > 0.5 && avgRipeningRate > 0.3)
    ostwaldVerdict = "SHRINKING_POPULATION";
  else if (growingBinFraction > 0.4 && avgSurvivorLikelihood > 0.5)
    ostwaldVerdict = "GROWING_POPULATION";
  else if (criticalBinFraction > 0.4)
    ostwaldVerdict = "CRITICAL_RADIUS_TRANSITION";
  else if (avgCoarseningMaturity < 0.3 && avgRipeningRate < 0.3)
    ostwaldVerdict = "EARLY_RIPENING";
  else if (avgSizeDisparity > 0.5 && avgNumberDensityDecay > 0.4)
    ostwaldVerdict = "NUMBER_DENSITY_DECAY";
  else
    ostwaldVerdict = "RIPENING_EQUILIBRIUM";

  const topBins = [...binRecs]
    .sort((a, b) => b.ostwaldIndex - a.ostwaldIndex)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgGibbsThompsonPressure,
    maxGibbsThompsonPressure,
    avgCriticalRadiusPosition,
    avgRipeningRate,
    maxRipeningRate,
    avgSizeDisparity,
    maxSizeDisparity,
    avgMonodispersityDeviation,
    avgLswAlignment,
    avgSurvivorLikelihood,
    avgVolumeFractionConservation,
    avgCoarseningMaturity,
    avgNumberDensityDecay,
    avgMatrixDiffusivity,
    avgChemicalPotentialGradient,
    avgInterparticleSpacing,
    avgRipeningSupersaturation,
    avgRipeningProgress,
    growingCount,
    growingBinFraction,
    shrinkingCount,
    shrinkingBinFraction,
    criticalCount,
    criticalBinFraction,
    meanReserveUsd: r2(meanReserve),
    reserveSizeCoefVar,
    ostwaldGini,
    ostwaldIndex,
    ostwaldRegime,
    ostwaldVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Ostwald — Doctor ===\n");
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

  const profiles: OstwaldProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeOstwald(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgOstwaldIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.ostwaldIndex)))
      : 0,
    advancedCoarseningCount: profiles.filter((p) => p.ostwaldRegime === "ADVANCED_COARSENING").length,
    steadyLswCount:          profiles.filter((p) => p.ostwaldRegime === "STEADY_LSW").length,
    activeRipeningCount:     profiles.filter((p) => p.ostwaldRegime === "ACTIVE_RIPENING").length,
    preRipeningCount:        profiles.filter((p) => p.ostwaldRegime === "PRE_RIPENING").length,
    quiescentCount:          profiles.filter((p) => p.ostwaldRegime === "QUIESCENT").length,
    avgSizeDisparity: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgSizeDisparity)))
      : 0,
    avgMonodispersityDeviation: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgMonodispersityDeviation)))
      : 0,
    avgLswAlignment: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgLswAlignment)))
      : 0,
    avgCoarseningMaturity: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgCoarseningMaturity)))
      : 0,
    totalGrowingBins:   profiles.reduce((s, p) => s + p.growingCount, 0),
    totalShrinkingBins: profiles.reduce((s, p) => s + p.shrinkingCount, 0),
    totalCriticalBins:  profiles.reduce((s, p) => s + p.criticalCount, 0),
    avgOstwaldGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.ostwaldGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-ostwald").description("HODLMM bin Ostwald ripening and LSW coarsening analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin Ostwald ripening state")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
