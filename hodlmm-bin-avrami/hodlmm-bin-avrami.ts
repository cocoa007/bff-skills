#!/usr/bin/env bun
/**
 * hodlmm-bin-avrami.ts — Day 176 cocoa007 Bitflow Skills Comp
 *
 * Avrami / Johnson-Mehl-Avrami-Kolmogorov (JMAK) kinetics analyzer —
 * models the kinetics of a phase transformation (nucleation + growth)
 * in HODLMM bin reserves via the classical JMAK equation
 *
 *    X(t) = 1 - exp(-K·t^n)
 *
 * where X(t) is the fraction transformed, K is the rate constant, and
 * n is the Avrami exponent. The Avrami exponent encodes the geometry
 * and nucleation mode:
 *
 *   n = 1   1-D growth with saturated (pre-existing) nucleation sites,
 *           or interface-limited 3-D growth with site exhaustion.
 *   n = 2   2-D growth with saturation, or 1-D growth with constant
 *           nucleation rate.
 *   n = 3   3-D growth with saturated nucleation sites
 *           (growth-controlled).
 *   n = 4   3-D growth with a constant nucleation rate
 *           (nucleation-and-growth-controlled).
 *
 * JMAK assumes: random nucleation throughout the untransformed matrix,
 * isotropic growth at constant velocity, and impingement accounted for
 * via the "extended volume" trick X_ext = K·t^n then X = 1 - exp(-X_ext).
 * Linearization yields ln(-ln(1 - X)) = n·ln(t) + ln(K), so a plot of
 * ln(-ln(1 - X)) vs ln(t) has slope n and intercept ln(K). Interface-
 * limited growth gives n that differs from diffusion-limited growth
 * by half-integer steps: Cahn's "grain-boundary nucleation" can give
 * n as low as 1/2; diffusion-limited 3-D growth with constant nucleation
 * gives n ≈ 5/2.
 *
 * In DLMM context, the transformation is from "unpopulated" (no
 * reserves) to "populated" (has reserves): bins near the active bin
 * are "transformed" as LPs nucleate positions there and growth
 * accretes reserves via swap rebalancing. The "untransformed matrix"
 * is the set of empty bins; the "nucleation rate" is the rate new
 * bins acquire liquidity; the "growth velocity" is the rate populated
 * bins accrete reserves; "impingement" is the overlap of growing
 * populated regions. A low-conversion pool is in the incubation
 * regime (X < 0.2): early transformation with sparse nucleation.
 * A mid-conversion pool is in active-transformation regime
 * (0.2 < X < 0.6): dominant nucleation + growth with high dX/dt.
 * A late-conversion pool is in impingement regime (0.6 < X < 0.9):
 * growing regions touch and slow; dX/dt decreasing. A fully-transformed
 * pool is in saturation regime (X > 0.9): nearly all bins populated,
 * residual growth only.
 *
 * Snapshot-based Avrami analysis uses the populated fraction as X and
 * infers the effective exponent n from spatial pattern, neighbor
 * correlation, and accretion asymmetry. Rate constant K is proxied
 * from pool volume/turnover. Nucleation density is estimated from
 * empty-to-populated transitions. Growth front velocity from
 * populated-region boundary extensions. Impingement factor from
 * populated-neighbor density.
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

interface BinAvrami {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  transformedFraction: number;          // local X, 0-1
  avramiExponent: number;               // effective n at this bin, 0-1 (n/5)
  transformationRate: number;           // local K·t^n rate, 0-1
  nucleationDensity: number;            // local empty→populated density, 0-1
  growthFrontVelocity: number;          // edge growth rate proxy, 0-1
  impingementFactor: number;            // KJMA contact index, 0-1
  nucleationSiteExhaustion: number;     // fraction of sites spent, 0-1
  transformationCompletion: number;     // -ln(1-X), 0-1
  linearizationQuality: number;         // Avrami-plot fit quality, 0-1
  growthMode: number;                   // 0 = interface-ltd, 1 = diffusion-ltd
  reservoirFraction: number;            // untransformed matrix, 0-1
  kineticConstant: number;              // K proxy, 0-1
  transformationMaturity: number;       // overall maturity, 0-1
  jmakCompliance: number;               // fit to JMAK form, 0-1
  transformationProgress: number;       // overall progress, 0-1
  avramiIndex: number;                  // composite 0-1
}

interface AvramiProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  transformedFraction: number;          // X for the whole pool (populated fraction)
  avramiExponent: number;               // effective n inferred from spatial pattern
  avgTransformationRate: number;
  maxTransformationRate: number;
  avgNucleationDensity: number;
  avgGrowthFrontVelocity: number;
  avgImpingementFactor: number;
  avgNucleationSiteExhaustion: number;
  avgTransformationCompletion: number;
  avgLinearizationQuality: number;
  avgGrowthMode: number;
  avgReservoirFraction: number;
  avgKineticConstant: number;
  avgTransformationMaturity: number;
  avgJmakCompliance: number;
  avgTransformationProgress: number;
  incubationCount: number;
  incubationBinFraction: number;
  activeTransformationCount: number;
  activeTransformationBinFraction: number;
  impingementCount: number;
  impingementBinFraction: number;
  saturationCount: number;
  saturationBinFraction: number;
  reservoirBinFraction: number;
  avramiGini: number;
  avramiIndex: number;
  avramiRegime: string;
  avramiVerdict: string;
  topBins: BinAvrami[];
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

function inferAvramiExponent(
  populatedFraction: number,
  spatialContinuity: number,
  neighborCorrelation: number,
  edgeFraction: number
): number {
  // Infer effective Avrami exponent from snapshot spatial pattern.
  //
  // - High spatial continuity (contiguous populated regions) -> low n
  //   (saturated-site 1D/2D growth).
  // - Scattered nucleation everywhere -> high n (3D + constant
  //   nucleation rate).
  // - Strong neighbor correlation + low edge fraction -> mature growth
  //   (n ~ 1-2, impingement-dominated).
  // - Weak neighbor correlation + high edge fraction -> active
  //   nucleation-and-growth regime (n ~ 3-4).
  //
  // Map into [0.5, 4.5] then clamp.
  const scatter = Math.max(0, 1 - spatialContinuity);
  const nucleationWeight = scatter * 2.5;             // 0 to 2.5
  const growthWeight = neighborCorrelation * 1.5;     // 0 to 1.5
  const edgeWeight = edgeFraction * 1.0;              // 0 to 1.0
  // populated fraction contributes a small base growth dimensionality
  const fractionWeight = populatedFraction * 1.0;     // 0 to 1.0
  const n = 0.5 + nucleationWeight + growthWeight * 0.4 + edgeWeight * 0.4 + fractionWeight * 0.3;
  return Math.max(0.5, Math.min(4.5, n));
}

function computeBinAvrami(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  meanReserve: number,
  maxReserve: number,
  populatedFraction: number,
  inferredN: number,
  volume24hUsd: number,
  totalUsd: number,
  binsScanned: number
): BinAvrami {
  const distance = Math.abs(bin.binId - activeBin);
  const R = bin.totalUsd;
  const relToMean = meanReserve > 0 ? R / meanReserve : 1;
  const normSize = maxReserve > 0 ? R / maxReserve : 0;

  const neighbors = allBins.filter(
    (b) => Math.abs(b.binId - bin.binId) <= 5 && b.binId !== bin.binId
  );
  const nearNeighborCount = neighbors.length;
  const neighborAvg = neighbors.length > 0
    ? neighbors.reduce((s, b) => s + b.totalUsd, 0) / neighbors.length
    : 0;
  const neighborVariance = neighbors.length > 1
    ? neighbors.reduce((s, b) => s + Math.pow(b.totalUsd - neighborAvg, 2), 0) / neighbors.length
    : 0;
  const neighborStdDev = Math.sqrt(neighborVariance);

  // 1. transformedFraction — local X
  //    Proxied by how far this bin has accreted relative to max
  const transformedFraction = r4(
    Math.min(1, (normSize * 0.6 + relToMean * 0.3 + Math.min(1, nearNeighborCount / 10) * 0.1))
  );

  // 2. avramiExponent — local effective n (normalized to 0-1 via n/5)
  //    Use population structure + this bin's role
  const avramiExponent = r4(Math.min(1, Math.max(0, inferredN / 5)));

  // 3. transformationRate — local K·t^n proxied via volume-driven flux
  const mobility = Math.min(1, volume24hUsd > 0 ? volume24hUsd / (totalUsd || 1) * 0.5 + 0.1 : 0.1);
  const drivingForce = (1 - transformedFraction);
  const transformationRate = r4(
    Math.min(1, mobility * drivingForce * 0.5 + mobility * 0.2 + normSize * 0.2)
  );

  // 4. nucleationDensity — empty-to-populated transition density
  //    High when this bin sits at the edge of a populated region
  const emptyNeighborRatio = Math.max(0, (10 - nearNeighborCount) / 10);
  const nucleationDensity = r4(
    Math.min(1, emptyNeighborRatio * 0.5 + (1 - populatedFraction) * 0.3 + drivingForce * 0.2)
  );

  // 5. growthFrontVelocity — rate this bin's boundary advances
  //    Proxied by neighbor variance + mobility
  const growthFrontVelocity = r4(
    Math.min(1, mobility * 0.5 + neighborStdDev / Math.max(1, meanReserve) * 0.3 + emptyNeighborRatio * 0.2)
  );

  // 6. impingementFactor — KJMA contact index
  //    High when this bin is surrounded by populated neighbors
  //    (growing regions have met)
  const impingementFactor = r4(
    Math.min(1, Math.min(1, nearNeighborCount / 10) * 0.6 + relToMean * 0.2 + populatedFraction * 0.2)
  );

  // 7. nucleationSiteExhaustion — fraction of nucleation sites spent
  //    High when populated fraction is high
  const nucleationSiteExhaustion = r4(
    Math.min(1, populatedFraction * 0.7 + normSize * 0.2 + impingementFactor * 0.1)
  );

  // 8. transformationCompletion — -ln(1 - X), 0-1 normalized
  //    Classical Avrami completion variable
  const xClamp = Math.min(0.999, Math.max(0.001, transformedFraction));
  const rawCompletion = -Math.log(1 - xClamp);
  const transformationCompletion = r4(Math.min(1, rawCompletion / 6));  // -ln(1-0.998) ≈ 6.2

  // 9. linearizationQuality — quality of Avrami-plot fit at this bin
  //    Proxy: how cleanly the local X corresponds to expected ln/ln
  //    High when transformation proceeds monotonically (low variance)
  const linearizationQuality = r4(
    Math.min(1,
      (1 - Math.min(1, neighborStdDev / Math.max(1, meanReserve))) * 0.5 +
      Math.min(1, nearNeighborCount / 10) * 0.3 +
      (1 - Math.abs(transformedFraction - 0.5) * 0.8) * 0.2
    )
  );

  // 10. growthMode — 0 = interface-limited, 1 = diffusion-limited
  //     Interface-limited: local growth driven by boundary kinetics
  //     (fast rebalancing in DLMM). Diffusion-limited: matrix transport
  //     (swap volume) dominates.
  const growthMode = r4(
    Math.min(1, mobility * 0.6 + (1 - emptyNeighborRatio) * 0.2 + transformedFraction * 0.2)
  );

  // 11. reservoirFraction — untransformed "matrix" remaining
  //     1 - X at this bin's locale (uses empty-neighbor ratio for local)
  const reservoirFraction = r4(
    Math.min(1, Math.max(0, (1 - populatedFraction) * 0.6 + emptyNeighborRatio * 0.4))
  );

  // 12. kineticConstant — K extracted via K = -ln(1-X) / t^n with t=1
  //     Normalized: clip at K=6
  const kineticConstant = r4(
    Math.min(1, rawCompletion / 6)
  );

  // 13. transformationMaturity — overall maturity at this bin
  const transformationMaturity = r4(
    Math.min(1,
      transformedFraction * 0.4 +
      impingementFactor * 0.3 +
      nucleationSiteExhaustion * 0.2 +
      transformationCompletion * 0.1
    )
  );

  // 14. jmakCompliance — fit to JMAK equation form
  //     High when X(t) matches classical sigmoid (not linear, not plateau early)
  const sigmoidness = 1 - Math.abs(transformedFraction - 0.5) * 2;  // peaks at X=0.5
  const jmakCompliance = r4(
    Math.min(1,
      sigmoidness * 0.5 +
      linearizationQuality * 0.3 +
      (1 - Math.abs(avramiExponent - 0.5) * 0.6) * 0.2  // n in middle range = classical JMAK
    )
  );

  // 15. transformationProgress — overall progress indicator
  const transformationProgress = r4(
    Math.min(1,
      transformationCompletion * 0.3 +
      transformedFraction * 0.3 +
      transformationMaturity * 0.2 +
      nucleationSiteExhaustion * 0.2
    )
  );

  // 16. avramiIndex — composite JMAK-strength score
  const avramiIndex = r4(
    Math.min(1, Math.max(0,
      transformedFraction * 0.15 +
      transformationCompletion * 0.13 +
      transformationMaturity * 0.12 +
      jmakCompliance * 0.1 +
      impingementFactor * 0.1 +
      nucleationSiteExhaustion * 0.08 +
      transformationProgress * 0.08 +
      transformationRate * 0.07 +
      linearizationQuality * 0.06 +
      nucleationDensity * 0.04 +
      growthFrontVelocity * 0.03 +
      kineticConstant * 0.02 +
      avramiExponent * 0.02
    ))
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    transformedFraction,
    avramiExponent,
    transformationRate,
    nucleationDensity,
    growthFrontVelocity,
    impingementFactor,
    nucleationSiteExhaustion,
    transformationCompletion,
    linearizationQuality,
    growthMode,
    reservoirFraction,
    kineticConstant,
    transformationMaturity,
    jmakCompliance,
    transformationProgress,
    avramiIndex,
  };
}

function analyzeAvrami(bins: BinReserves[], pool: AppPool): AvramiProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));
  const meanReserve = totalUsd / n;

  // Pool-level X = fraction of scanned bins populated
  const populatedFraction = Math.min(1, n / binsScanned);

  // Spatial continuity: fraction of adjacent populated pairs
  let adjacentPairs = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (Math.abs(sorted[i + 1].binId - sorted[i].binId) === 1) adjacentPairs++;
  }
  const spatialContinuity = sorted.length > 1 ? adjacentPairs / (sorted.length - 1) : 0;

  // Neighbor correlation: variance of reserves among adjacent bins
  let corrSum = 0;
  let corrCount = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (Math.abs(sorted[i + 1].binId - sorted[i].binId) <= 3) {
      const ratio = sorted[i + 1].totalUsd > 0 && sorted[i].totalUsd > 0
        ? Math.min(sorted[i + 1].totalUsd, sorted[i].totalUsd) /
          Math.max(sorted[i + 1].totalUsd, sorted[i].totalUsd)
        : 0;
      corrSum += ratio;
      corrCount++;
    }
  }
  const neighborCorrelation = corrCount > 0 ? corrSum / corrCount : 0;

  // Edge fraction: fraction of populated bins that have an empty neighbor
  let edgeCount = 0;
  const binIdSet = new Set(sorted.map((b) => b.binId));
  for (const b of sorted) {
    if (!binIdSet.has(b.binId - 1) || !binIdSet.has(b.binId + 1)) edgeCount++;
  }
  const edgeFraction = sorted.length > 0 ? edgeCount / sorted.length : 0;

  const inferredN = inferAvramiExponent(
    populatedFraction,
    spatialContinuity,
    neighborCorrelation,
    edgeFraction
  );

  const binRecs = sorted.map((b) =>
    computeBinAvrami(b, activeBin, sorted, meanReserve, maxReserve, populatedFraction, inferredN, volume, totalUsd, binsScanned)
  );

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgTransformationRate = r4(avg(binRecs.map((b) => b.transformationRate)));
  const maxTransformationRate = r4(Math.max(...binRecs.map((b) => b.transformationRate)));
  const avgNucleationDensity = r4(avg(binRecs.map((b) => b.nucleationDensity)));
  const avgGrowthFrontVelocity = r4(avg(binRecs.map((b) => b.growthFrontVelocity)));
  const avgImpingementFactor = r4(avg(binRecs.map((b) => b.impingementFactor)));
  const avgNucleationSiteExhaustion = r4(avg(binRecs.map((b) => b.nucleationSiteExhaustion)));
  const avgTransformationCompletion = r4(avg(binRecs.map((b) => b.transformationCompletion)));
  const avgLinearizationQuality = r4(avg(binRecs.map((b) => b.linearizationQuality)));
  const avgGrowthMode = r4(avg(binRecs.map((b) => b.growthMode)));
  const avgReservoirFraction = r4(avg(binRecs.map((b) => b.reservoirFraction)));
  const avgKineticConstant = r4(avg(binRecs.map((b) => b.kineticConstant)));
  const avgTransformationMaturity = r4(avg(binRecs.map((b) => b.transformationMaturity)));
  const avgJmakCompliance = r4(avg(binRecs.map((b) => b.jmakCompliance)));
  const avgTransformationProgress = r4(avg(binRecs.map((b) => b.transformationProgress)));

  // Bin classification by transformedFraction
  const incubationCount = binRecs.filter((b) => b.transformedFraction < 0.2).length;
  const activeTransformationCount = binRecs.filter(
    (b) => b.transformedFraction >= 0.2 && b.transformedFraction < 0.6
  ).length;
  const impingementCount = binRecs.filter(
    (b) => b.transformedFraction >= 0.6 && b.transformedFraction < 0.9
  ).length;
  const saturationCount = binRecs.filter((b) => b.transformedFraction >= 0.9).length;
  const incubationBinFraction = r4(incubationCount / n);
  const activeTransformationBinFraction = r4(activeTransformationCount / n);
  const impingementBinFraction = r4(impingementCount / n);
  const saturationBinFraction = r4(saturationCount / n);
  const reservoirBinFraction = r4(1 - populatedFraction);

  // Gini on avrami index distribution
  const rFactors = binRecs.map((b) => b.avramiIndex);
  const sortedFactors = [...rFactors].sort((a, b) => b - a);
  const totalFactors = sortedFactors.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedFactors[i];
  }
  const avramiGini = totalFactors > 0
    ? r4(Math.abs(giniSum) / (n * totalFactors))
    : 0;

  // Composite index (0-100) — weighted blend of transformation state
  const xScore           = Math.min(25, populatedFraction * 25);
  const completionScore  = Math.min(25, avgTransformationCompletion * 25);
  const maturityScore    = Math.min(25, avgTransformationMaturity * 25);
  const jmakScore        = Math.min(25, avgJmakCompliance * 25);
  const avramiIndex = Math.round(
    Math.min(100, xScore + completionScore + maturityScore + jmakScore)
  );

  // Regime classification (by pool X)
  let avramiRegime: string;
  if (populatedFraction >= 0.9)       avramiRegime = "SATURATION";
  else if (populatedFraction >= 0.6)  avramiRegime = "IMPINGEMENT";
  else if (populatedFraction >= 0.2)  avramiRegime = "ACTIVE_TRANSFORMATION";
  else                                 avramiRegime = "INCUBATION";

  // Verdict classification
  let avramiVerdict: string;
  if (inferredN >= 3.5)
    avramiVerdict = "NUCLEATION_AND_GROWTH";           // n ~ 4 regime
  else if (inferredN >= 2.5)
    avramiVerdict = "THREE_D_GROWTH";                  // n ~ 3 regime
  else if (inferredN >= 1.5)
    avramiVerdict = "TWO_D_GROWTH";                    // n ~ 2 regime
  else if (inferredN >= 0.75)
    avramiVerdict = "ONE_D_SATURATED_GROWTH";          // n ~ 1 regime
  else if (avgJmakCompliance > 0.6 && avgLinearizationQuality > 0.6)
    avramiVerdict = "TEXTBOOK_JMAK_KINETICS";
  else if (avgImpingementFactor > 0.6 && populatedFraction > 0.5)
    avramiVerdict = "STRONG_IMPINGEMENT";
  else if (avgNucleationDensity > 0.6 && populatedFraction < 0.4)
    avramiVerdict = "HIGH_NUCLEATION_DENSITY";
  else if (avgNucleationSiteExhaustion > 0.6)
    avramiVerdict = "SITE_EXHAUSTION";
  else if (avgGrowthMode > 0.6)
    avramiVerdict = "DIFFUSION_LIMITED_GROWTH";
  else if (avgGrowthMode < 0.3)
    avramiVerdict = "INTERFACE_LIMITED_GROWTH";
  else
    avramiVerdict = "SUB_CRITICAL_AVRAMI";

  const topBins = [...binRecs]
    .sort((a, b) => b.avramiIndex - a.avramiIndex)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    transformedFraction: r4(populatedFraction),
    avramiExponent: r4(inferredN),
    avgTransformationRate,
    maxTransformationRate,
    avgNucleationDensity,
    avgGrowthFrontVelocity,
    avgImpingementFactor,
    avgNucleationSiteExhaustion,
    avgTransformationCompletion,
    avgLinearizationQuality,
    avgGrowthMode,
    avgReservoirFraction,
    avgKineticConstant,
    avgTransformationMaturity,
    avgJmakCompliance,
    avgTransformationProgress,
    incubationCount,
    incubationBinFraction,
    activeTransformationCount,
    activeTransformationBinFraction,
    impingementCount,
    impingementBinFraction,
    saturationCount,
    saturationBinFraction,
    reservoirBinFraction,
    avramiGini,
    avramiIndex,
    avramiRegime,
    avramiVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Avrami — Doctor ===\n");
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

  const profiles: AvramiProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeAvrami(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgAvramiIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.avramiIndex)))
      : 0,
    avgAvramiExponent: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avramiExponent)))
      : 0,
    saturationCount:            profiles.filter((p) => p.avramiRegime === "SATURATION").length,
    impingementCount:           profiles.filter((p) => p.avramiRegime === "IMPINGEMENT").length,
    activeTransformationCount:  profiles.filter((p) => p.avramiRegime === "ACTIVE_TRANSFORMATION").length,
    incubationCount:            profiles.filter((p) => p.avramiRegime === "INCUBATION").length,
    avgTransformedFraction: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.transformedFraction)))
      : 0,
    avgTransformationCompletion: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgTransformationCompletion)))
      : 0,
    avgTransformationMaturity: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgTransformationMaturity)))
      : 0,
    avgJmakCompliance: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgJmakCompliance)))
      : 0,
    avgGrowthMode: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgGrowthMode)))
      : 0,
    totalIncubationBins:            profiles.reduce((s, p) => s + p.incubationCount, 0),
    totalActiveTransformationBins:  profiles.reduce((s, p) => s + p.activeTransformationCount, 0),
    totalImpingementBins:           profiles.reduce((s, p) => s + p.impingementCount, 0),
    totalSaturationBins:            profiles.reduce((s, p) => s + p.saturationCount, 0),
    avgAvramiGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avramiGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-avrami").description("HODLMM bin Avrami / JMAK transformation-kinetics analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin Avrami / JMAK kinetics state")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
