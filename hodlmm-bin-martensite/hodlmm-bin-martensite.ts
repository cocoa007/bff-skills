#!/usr/bin/env bun
/**
 * hodlmm-bin-martensite.ts — Day 177 cocoa007 Bitflow Skills Comp
 *
 * Martensitic transformation analyzer — models DLMM bin reserves as
 * the product of a diffusionless, displacive, athermal phase
 * transformation. Where Avrami (JMAK) describes slow diffusion-driven
 * nucleation-and-growth kinetics, martensite describes the opposite
 * regime: a rapid, shear-mediated snap from parent (austenite) to
 * product (martensite) phase, with no long-range atomic transport.
 *
 * Classical Koistinen-Marburger equation:
 *
 *    fM = 1 - exp(-α · (Ms - T))     for T < Ms, 0 otherwise
 *
 * where fM is the martensite volume fraction, α ≈ 0.011 /K is the
 * empirical rate constant, Ms is the martensite-start temperature,
 * and (Ms - T) is the undercooling below Ms — the thermodynamic
 * driving force. Unlike JMAK, Koistinen-Marburger is athermal: the
 * fraction transformed depends on how far below Ms the system sits,
 * not on time spent at that temperature. Martensite nucleates and
 * grows at the speed of sound in the parent phase — no rate-limited
 * atomic diffusion.
 *
 * Key characteristics of martensitic transformation:
 *   - Diffusionless — composition of product = composition of parent.
 *     No long-range transport of atoms across the interface.
 *   - Displacive — coordinated shear of atoms along well-defined
 *     crystallographic directions (habit plane + shape-change vector).
 *   - Athermal — fM set by undercooling below Ms, not by time.
 *   - Shape memory — reverse transformation on heating recovers
 *     parent phase with pseudoelastic behavior.
 *   - Morphology variants — lath, plate, and twin morphologies emerge
 *     depending on composition and transformation temperature.
 *   - Retained austenite — pockets of parent phase fail to transform,
 *     stabilized by transformation-induced stress fields.
 *   - Autocatalysis — once a martensite lath forms, its surrounding
 *     strain field triggers nucleation of adjacent laths (cascade).
 *   - Habit plane — transformation front adopts a specific orientation
 *     (invariant plane strain) minimizing coherency strain.
 *   - Twin variants — crystallographically equivalent product
 *     orientations that coexist to minimize macroscopic shape change.
 *
 * In DLMM context, the transformation is from "austenite"
 * (near-uniformly-populated, ergodic bin distribution with smooth
 * reserve gradient) to "martensite" (sharply segregated bin
 * populations with abrupt reserve discontinuities, multiple distinct
 * clusters of populated bins, and residual empty pockets — "retained
 * austenite" — within otherwise-filled regions). Where avrami (JMAK)
 * describes liquidity accreting gradually through bins via diffusive
 * swap rebalancing, martensite describes the opposite: large coordinated
 * shifts of liquidity — a single sudden price move or correlated LP
 * event leaves behind a distinctive snap-transformed pattern with
 * sharp boundaries, multi-cluster coexistence, and residual pockets.
 *
 * The "driving force" (Ms - T) is proxied from the magnitude of
 * recent volume flux relative to TVL — a pool with high 24h volume
 * flux has experienced high "undercooling" in the last window. The
 * "martensite fraction" fM is inferred from bin-pattern characteristics:
 * sharpness of populated/empty boundaries, multi-cluster count, and
 * absence of smooth gradient.
 *
 * Snapshot-based martensite analysis identifies:
 *   - Martensite fraction: what portion of populated bins show
 *     snap-like (rather than gradient-like) signature.
 *   - Retained austenite: empty pockets within otherwise-populated
 *     regions (failed to transform).
 *   - Twin variant count: distinct connected populated clusters.
 *   - Shear magnitude: average distance from active bin (offset
 *     asymmetry = shear component).
 *   - Habit-plane coherence: spatial continuity of the populated
 *     region (habit plane = interface).
 *   - Autocatalysis index: clustering tendency of populated bins
 *     (neighbor-triggered cascade).
 *   - Koistinen-Marburger compliance: how well the observed fraction
 *     fits fM ~ 1 - exp(-α · driving force).
 *   - Morphology classification: LATH (narrow stringers), PLATE
 *     (wider slabs), TWIN (paired symmetric variants), MIXED.
 *
 * Regime classification:
 *   AUSTENITE_STABLE      — driving force insufficient to trigger
 *                            transformation (fM ~ 0), smooth gradient.
 *   ISOTHERMAL            — slow time-dependent transformation,
 *                            fM < 0.3, weak cluster structure.
 *   ATHERMAL_TRANSFORMATION — classical martensite, 0.3 ≤ fM < 0.7,
 *                            multiple variants, sharp boundaries.
 *   BURST                 — autocatalytic cascade, 0.7 ≤ fM < 0.9,
 *                            high autocatalysis, connected variants.
 *   STRESS_INDUCED        — fM ≥ 0.9, transformation saturated by
 *                            external driving, minimal retained austenite.
 *
 * Verdict taxonomy includes RAPID_DISPLACIVE_SNAP, HEAVY_RETAINED_AUSTENITE,
 * TWIN_VARIANT_COEXISTENCE, AUTOCATALYTIC_CASCADE, SHAPE_MEMORY_INDICATOR,
 * SATURATED_TRANSFORMATION, SUB_MS_STABLE, NO_TRANSFORMATION_DRIVE,
 * LATH_MORPHOLOGY, PLATE_MORPHOLOGY, TWIN_MORPHOLOGY, and
 * INTERMEDIATE_MARTENSITIC.
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

// Koistinen-Marburger empirical constant — in steel α ≈ 0.011 /K;
// here a normalized proxy in the same functional form.
const KM_ALPHA = 0.011;

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

interface BinMartensite {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  martensiteFraction: number;          // local fM, 0-1
  retainedAustenite: number;           // local retained-parent fraction, 0-1
  msUndercooling: number;              // (Ms - T) proxy, 0-1
  koistinenMarburgerConstant: number;  // α·(Ms-T) value, 0-1
  transformationDrivingForce: number;  // shear driving force, 0-1
  twinVariantScore: number;            // variant membership strength, 0-1
  shearStrainMagnitude: number;        // bin-offset shear, 0-1
  habitPlaneCoherence: number;         // spatial continuity, 0-1
  athermalCharacter: number;           // time-independence score, 0-1
  autocatalysisIndex: number;          // neighbor-triggered index, 0-1
  residualStressIndex: number;         // packed-density proxy, 0-1
  transformationHysteresis: number;    // asymmetry of shift, 0-1
  progressVsMf: number;                // distance to Mf (finish), 0-1
  kmCompliance: number;                // fit to Koistinen-Marburger, 0-1
  morphologyScore: number;             // LATH vs PLATE vs TWIN, 0-1
  martensiteIndex: number;             // composite, 0-1
}

interface MartensiteProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  drivingForce: number;                // pool-level (Ms - T) proxy
  martensiteFraction: number;          // pool-level fM
  retainedAustenite: number;           // pool-level retained fraction
  twinVariantCount: number;            // distinct connected populated clusters
  avgMartensiteFraction: number;
  avgRetainedAustenite: number;
  avgMsUndercooling: number;
  avgKoistinenMarburger: number;
  avgTransformationDrivingForce: number;
  avgTwinVariantScore: number;
  avgShearStrainMagnitude: number;
  avgHabitPlaneCoherence: number;
  avgAthermalCharacter: number;
  avgAutocatalysisIndex: number;
  avgResidualStressIndex: number;
  avgTransformationHysteresis: number;
  avgProgressVsMf: number;
  avgKmCompliance: number;
  avgMorphologyScore: number;
  austeniteCount: number;
  austeniteBinFraction: number;
  lathCount: number;
  lathBinFraction: number;
  plateCount: number;
  plateBinFraction: number;
  twinCount: number;
  twinBinFraction: number;
  shearAsymmetry: number;              // signed offset of mass center from active bin
  martensiteGini: number;
  martensiteIndex: number;
  martensiteRegime: string;
  martensiteVerdict: string;
  topBins: BinMartensite[];
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

// Identify connected clusters of populated bins. Bins within a gap of
// `maxGap` bin-ids count as the same cluster (martensite variants are
// spatially coherent regions separated by retained-austenite gaps).
function findClusters(sortedBins: BinReserves[], maxGap: number = 2): BinReserves[][] {
  if (sortedBins.length === 0) return [];
  const clusters: BinReserves[][] = [];
  let current: BinReserves[] = [sortedBins[0]];
  for (let i = 1; i < sortedBins.length; i++) {
    const gap = sortedBins[i].binId - sortedBins[i - 1].binId;
    if (gap <= maxGap) {
      current.push(sortedBins[i]);
    } else {
      clusters.push(current);
      current = [sortedBins[i]];
    }
  }
  clusters.push(current);
  return clusters;
}

// Koistinen-Marburger prediction: fM = 1 - exp(-α·(Ms-T)).
// Driving force proxy is in [0, 1]; α·drivingForceNormalizer scales
// to give fM in [0, 1] range over physically-sensible drives.
function kmPrediction(drivingForce: number): number {
  const effectiveDriving = drivingForce * 100;  // scale to match α·driving
  return 1 - Math.exp(-KM_ALPHA * 100 * drivingForce);
  // equivalent to 1 - exp(-1.1·drivingForce) — gives fM ~ 0 at driving=0,
  // fM ~ 0.67 at driving=1; models the sub-saturation regime.
}

function computeBinMartensite(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  meanReserve: number,
  maxReserve: number,
  drivingForce: number,
  clusterOfBin: BinReserves[] | null,
  clusterCount: number,
  largestClusterSize: number,
  habitPlaneCoherence: number,
  retainedAusteniteFraction: number,
  binIdSet: Set<number>
): BinMartensite {
  const distance = Math.abs(bin.binId - activeBin);
  const R = bin.totalUsd;
  const relToMean = meanReserve > 0 ? R / meanReserve : 1;
  const normSize = maxReserve > 0 ? R / maxReserve : 0;

  const neighbors = allBins.filter(
    (b) => Math.abs(b.binId - bin.binId) <= 3 && b.binId !== bin.binId
  );
  const nearNeighborCount = neighbors.length;
  const neighborAvg = neighbors.length > 0
    ? neighbors.reduce((s, b) => s + b.totalUsd, 0) / neighbors.length
    : 0;

  // Local sharpness: is this bin on a sharp populated/empty boundary?
  // Martensite signature: sharp boundary, not smooth gradient.
  const leftEmpty = !binIdSet.has(bin.binId - 1);
  const rightEmpty = !binIdSet.has(bin.binId + 1);
  const boundaryCount = (leftEmpty ? 1 : 0) + (rightEmpty ? 1 : 0);
  const boundarySharpness = boundaryCount / 2;  // 0, 0.5, or 1

  // Reserve discontinuity: how much does this bin's reserve differ
  // from its populated neighbors? Martensite pattern has abrupt
  // reserve discontinuities at cluster boundaries.
  const neighborRatio = neighborAvg > 0
    ? Math.min(R, neighborAvg) / Math.max(R, neighborAvg)
    : 1;
  const discontinuity = 1 - neighborRatio;  // high = abrupt change

  // Cluster size of this bin's variant
  const clusterSize = clusterOfBin ? clusterOfBin.length : 1;
  const relativeClusterSize = largestClusterSize > 0 ? clusterSize / largestClusterSize : 0;

  // 1. martensiteFraction — local fM
  //    High when: sharp boundary, large cluster, reserve matches cluster mean
  const martensiteFraction = r4(
    Math.min(1,
      boundarySharpness * 0.3 +
      relativeClusterSize * 0.3 +
      (1 - discontinuity * 0.5) * 0.2 +
      drivingForce * 0.2
    )
  );

  // 2. retainedAustenite — local pocket of untransformed phase
  //    High when this bin borders an empty pocket within the cluster
  //    (neighbors exist but some adjacent bins are empty)
  const isInterior = !leftEmpty && !rightEmpty && nearNeighborCount >= 4;
  const emptyInBand = 6 - nearNeighborCount;  // out of max 6 neighbors in ±3
  const retainedAustenite = r4(
    Math.min(1,
      isInterior && emptyInBand > 0
        ? (emptyInBand / 6) * 0.6 + retainedAusteniteFraction * 0.4
        : retainedAusteniteFraction * 0.3 + (1 - relativeClusterSize) * 0.3
    )
  );

  // 3. msUndercooling — (Ms - T) at this bin's locale
  //    Proxied by local driving force + distance-scaled proximity to
  //    the active bin (where driving force is concentrated)
  const distanceScale = Math.max(0, 1 - distance / BIN_SCAN_RADIUS);
  const msUndercooling = r4(
    Math.min(1, drivingForce * 0.5 + distanceScale * 0.3 + martensiteFraction * 0.2)
  );

  // 4. koistinenMarburgerConstant — α·(Ms-T) value
  //    In classical K-M: α ≈ 0.011 /K, so α·(Ms-T) spans 0 to ~1.1
  //    for meaningful undercooling. Here we use the product as signal.
  const koistinenMarburgerConstant = r4(
    Math.min(1, KM_ALPHA * msUndercooling * 100)  // normalized: α=0.011, max T-diff=100
  );

  // 5. transformationDrivingForce — shear magnitude at this bin
  //    Combines size, boundary sharpness, and distance from active bin
  const transformationDrivingForce = r4(
    Math.min(1,
      drivingForce * 0.4 +
      boundarySharpness * 0.3 +
      normSize * 0.2 +
      distanceScale * 0.1
    )
  );

  // 6. twinVariantScore — strength of variant membership
  //    High when bin is in a well-defined cluster (not an isolated outlier)
  const twinVariantScore = r4(
    Math.min(1,
      (clusterSize >= 3 ? 1 : clusterSize / 3) * 0.5 +
      relativeClusterSize * 0.3 +
      (clusterCount >= 2 ? 0.2 : clusterCount * 0.1)
    )
  );

  // 7. shearStrainMagnitude — displacement-like character
  //    High at offset bins (shear = finite displacement from reference)
  const shearStrainMagnitude = r4(
    Math.min(1, (distance / BIN_SCAN_RADIUS) * 0.6 + normSize * 0.2 + boundarySharpness * 0.2)
  );

  // 8. habitPlaneCoherence — spatial continuity at the cluster interface
  //    Classical martensite has a coherent habit plane (specific
  //    orientation relationship between parent and product)
  const habitPlaneCoherenceLocal = r4(
    Math.min(1, habitPlaneCoherence * 0.6 + neighborRatio * 0.2 + relativeClusterSize * 0.2)
  );

  // 9. athermalCharacter — time-independence score
  //    Athermal martensite: fM set by undercooling, not time.
  //    High when pattern is sharply clustered (not smoothly distributed)
  //    and driving force is substantial.
  const athermalCharacter = r4(
    Math.min(1,
      boundarySharpness * 0.4 +
      (1 - retainedAustenite) * 0.2 +
      drivingForce * 0.2 +
      (clusterCount > 1 ? 0.2 : clusterCount * 0.1)
    )
  );

  // 10. autocatalysisIndex — neighbor-triggered cascade strength
  //     Once one martensite lath forms, adjacent nucleation is favored
  //     by the strain field. High when this bin sits in a cluster with
  //     high neighbor density.
  const autocatalysisIndex = r4(
    Math.min(1,
      Math.min(1, nearNeighborCount / 6) * 0.5 +
      relativeClusterSize * 0.3 +
      relToMean * 0.2
    )
  );

  // 11. residualStressIndex — packed-density proxy
  //     Martensite has characteristic residual stress fields; high stress
  //     at cluster boundaries, low in the interior and in retained austenite.
  const residualStressIndex = r4(
    Math.min(1,
      boundarySharpness * 0.5 +
      discontinuity * 0.3 +
      shearStrainMagnitude * 0.2
    )
  );

  // 12. transformationHysteresis — asymmetry of shift
  //     Martensite has forward/reverse hysteresis. Proxy: offset asymmetry
  //     of this bin relative to cluster centroid.
  const clusterCentroid = clusterOfBin && clusterOfBin.length > 0
    ? clusterOfBin.reduce((s, b) => s + b.binId, 0) / clusterOfBin.length
    : bin.binId;
  const offsetFromCentroid = Math.abs(bin.binId - clusterCentroid);
  const transformationHysteresis = r4(
    Math.min(1,
      Math.min(1, offsetFromCentroid / 5) * 0.5 +
      shearStrainMagnitude * 0.3 +
      boundarySharpness * 0.2
    )
  );

  // 13. progressVsMf — distance toward transformation finish Mf
  //     In K-M, Mf is where fM = 1 asymptotically. Here: how close is fM to 1?
  const progressVsMf = r4(
    Math.min(1, martensiteFraction * 0.6 + (1 - retainedAustenite) * 0.4)
  );

  // 14. kmCompliance — fit to Koistinen-Marburger prediction
  //     Compare local fM to kmPrediction(drivingForce)
  const kmPredicted = kmPrediction(msUndercooling);
  const kmDeviation = Math.abs(martensiteFraction - kmPredicted);
  const kmCompliance = r4(Math.min(1, Math.max(0, 1 - kmDeviation * 1.5)));

  // 15. morphologyScore — LATH (low) vs PLATE vs TWIN (high)
  //     Normalize cluster shape: small isolated cluster = lath,
  //     large connected cluster = plate, multiple matched clusters = twin
  let morphologyScore: number;
  if (clusterCount >= 2 && clusterSize >= 2) {
    // twin-like: multiple comparable clusters
    morphologyScore = 0.85;
  } else if (clusterSize >= 8) {
    morphologyScore = 0.55;  // plate
  } else if (clusterSize >= 3) {
    morphologyScore = 0.3;   // lath
  } else {
    morphologyScore = 0.15;  // isolated
  }
  morphologyScore = r4(morphologyScore);

  // 16. martensiteIndex — composite snap-transformation score
  const martensiteIndex = r4(
    Math.min(1, Math.max(0,
      martensiteFraction * 0.15 +
      athermalCharacter * 0.12 +
      koistinenMarburgerConstant * 0.1 +
      boundarySharpness * 0.1 +
      twinVariantScore * 0.08 +
      habitPlaneCoherenceLocal * 0.08 +
      autocatalysisIndex * 0.07 +
      residualStressIndex * 0.06 +
      shearStrainMagnitude * 0.05 +
      progressVsMf * 0.05 +
      kmCompliance * 0.04 +
      transformationDrivingForce * 0.04 +
      transformationHysteresis * 0.03 +
      morphologyScore * 0.03
    ))
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    martensiteFraction,
    retainedAustenite,
    msUndercooling,
    koistinenMarburgerConstant,
    transformationDrivingForce,
    twinVariantScore,
    shearStrainMagnitude,
    habitPlaneCoherence: habitPlaneCoherenceLocal,
    athermalCharacter,
    autocatalysisIndex,
    residualStressIndex,
    transformationHysteresis,
    progressVsMf,
    kmCompliance,
    morphologyScore,
    martensiteIndex,
  };
}

function analyzeMartensite(bins: BinReserves[], pool: AppPool): MartensiteProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));
  const meanReserve = totalUsd / n;

  // Pool-level driving force: volume flux relative to TVL is our
  // proxy for (Ms - T) undercooling — heavy recent flux = heavy undercooling.
  const turnover = pool.tvlUsd > 0 ? volume / pool.tvlUsd : 0;
  const drivingForce = Math.min(1, turnover * 0.8 + 0.1);  // clamp to [0.1, 1]

  // Find connected clusters (variants)
  const clusters = findClusters(sorted, 2);
  const clusterCount = clusters.length;
  const largestClusterSize = clusters.length > 0
    ? Math.max(...clusters.map((c) => c.length))
    : 0;
  const binIdSet = new Set(sorted.map((b) => b.binId));

  // Map bin_id -> cluster containing it
  const binCluster = new Map<number, BinReserves[]>();
  for (const cluster of clusters) {
    for (const b of cluster) binCluster.set(b.binId, cluster);
  }

  // Pool-level habit-plane coherence: fraction of populated bins
  // that sit in adjacent-populated pairs (high = coherent habit plane)
  let adjacentPairs = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (Math.abs(sorted[i + 1].binId - sorted[i].binId) === 1) adjacentPairs++;
  }
  const habitPlaneCoherence = n > 1 ? adjacentPairs / (n - 1) : 0;

  // Retained austenite fraction: empty pockets inside the cluster span
  // = empty bins between min and max populated bin-id, bracketed by populated regions
  const minBin = sorted[0].binId;
  const maxBin = sorted[sorted.length - 1].binId;
  const span = maxBin - minBin + 1;
  const emptyInSpan = span - n;
  const retainedAusteniteFraction = span > 0 ? emptyInSpan / span : 0;

  // Pool-level fM: populated fraction of scanned range, weighted by
  // sharpness (snap signature) and cluster structure (twin-variant coexistence).
  const populatedFraction = n / binsScanned;
  const sharpnessBonus = habitPlaneCoherence > 0.7 ? 0.15 : 0;
  const clusterBonus = clusterCount >= 2 ? 0.1 : 0;
  const martensiteFraction = Math.min(1, populatedFraction + sharpnessBonus + clusterBonus);

  // Shear asymmetry: mass-weighted center offset from active bin
  const centerOfMass = totalUsd > 0
    ? sorted.reduce((s, b) => s + b.binId * b.totalUsd, 0) / totalUsd
    : activeBin;
  const shearAsymmetry = r4(Math.min(1, Math.abs(centerOfMass - activeBin) / BIN_SCAN_RADIUS));

  const binRecs = sorted.map((b) =>
    computeBinMartensite(
      b,
      activeBin,
      sorted,
      meanReserve,
      maxReserve,
      drivingForce,
      binCluster.get(b.binId) || null,
      clusterCount,
      largestClusterSize,
      habitPlaneCoherence,
      retainedAusteniteFraction,
      binIdSet
    )
  );

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgMartensiteFraction = r4(avg(binRecs.map((b) => b.martensiteFraction)));
  const avgRetainedAustenite = r4(avg(binRecs.map((b) => b.retainedAustenite)));
  const avgMsUndercooling = r4(avg(binRecs.map((b) => b.msUndercooling)));
  const avgKoistinenMarburger = r4(avg(binRecs.map((b) => b.koistinenMarburgerConstant)));
  const avgTransformationDrivingForce = r4(avg(binRecs.map((b) => b.transformationDrivingForce)));
  const avgTwinVariantScore = r4(avg(binRecs.map((b) => b.twinVariantScore)));
  const avgShearStrainMagnitude = r4(avg(binRecs.map((b) => b.shearStrainMagnitude)));
  const avgHabitPlaneCoherence = r4(avg(binRecs.map((b) => b.habitPlaneCoherence)));
  const avgAthermalCharacter = r4(avg(binRecs.map((b) => b.athermalCharacter)));
  const avgAutocatalysisIndex = r4(avg(binRecs.map((b) => b.autocatalysisIndex)));
  const avgResidualStressIndex = r4(avg(binRecs.map((b) => b.residualStressIndex)));
  const avgTransformationHysteresis = r4(avg(binRecs.map((b) => b.transformationHysteresis)));
  const avgProgressVsMf = r4(avg(binRecs.map((b) => b.progressVsMf)));
  const avgKmCompliance = r4(avg(binRecs.map((b) => b.kmCompliance)));
  const avgMorphologyScore = r4(avg(binRecs.map((b) => b.morphologyScore)));

  // Bin morphology classification by morphologyScore
  const austeniteCount = binRecs.filter((b) => b.martensiteFraction < 0.2).length;
  const lathCount = binRecs.filter((b) => b.morphologyScore >= 0.2 && b.morphologyScore < 0.45).length;
  const plateCount = binRecs.filter((b) => b.morphologyScore >= 0.45 && b.morphologyScore < 0.7).length;
  const twinCount = binRecs.filter((b) => b.morphologyScore >= 0.7).length;
  const austeniteBinFraction = r4(austeniteCount / n);
  const lathBinFraction = r4(lathCount / n);
  const plateBinFraction = r4(plateCount / n);
  const twinBinFraction = r4(twinCount / n);

  // Gini coefficient of martensite index distribution
  const rFactors = binRecs.map((b) => b.martensiteIndex);
  const sortedFactors = [...rFactors].sort((a, b) => b - a);
  const totalFactors = sortedFactors.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedFactors[i];
  }
  const martensiteGini = totalFactors > 0
    ? r4(Math.abs(giniSum) / (n * totalFactors))
    : 0;

  // Composite index (0-100)
  const fractionScore   = Math.min(25, martensiteFraction * 25);
  const athermalScore   = Math.min(25, avgAthermalCharacter * 25);
  const variantScore    = Math.min(25, Math.min(1, clusterCount / 3) * 12 + avgTwinVariantScore * 13);
  const kmScore         = Math.min(25, avgKmCompliance * 25);
  const martensiteIndex = Math.round(
    Math.min(100, fractionScore + athermalScore + variantScore + kmScore)
  );

  // Regime classification
  let martensiteRegime: string;
  if (drivingForce < 0.2 && martensiteFraction < 0.2) {
    martensiteRegime = "AUSTENITE_STABLE";
  } else if (martensiteFraction >= 0.9) {
    martensiteRegime = "STRESS_INDUCED";
  } else if (martensiteFraction >= 0.7 && avgAutocatalysisIndex > 0.5) {
    martensiteRegime = "BURST";
  } else if (martensiteFraction >= 0.3) {
    martensiteRegime = "ATHERMAL_TRANSFORMATION";
  } else {
    martensiteRegime = "ISOTHERMAL";
  }

  // Verdict classification
  let martensiteVerdict: string;
  if (drivingForce < 0.15)
    martensiteVerdict = "NO_TRANSFORMATION_DRIVE";
  else if (martensiteFraction < 0.2)
    martensiteVerdict = "SUB_MS_STABLE";
  else if (martensiteFraction >= 0.9)
    martensiteVerdict = "SATURATED_TRANSFORMATION";
  else if (avgAutocatalysisIndex > 0.6 && martensiteFraction > 0.6)
    martensiteVerdict = "AUTOCATALYTIC_CASCADE";
  else if (clusterCount >= 2 && avgTwinVariantScore > 0.5)
    martensiteVerdict = "TWIN_VARIANT_COEXISTENCE";
  else if (retainedAusteniteFraction > 0.3)
    martensiteVerdict = "HEAVY_RETAINED_AUSTENITE";
  else if (avgAthermalCharacter > 0.6 && avgHabitPlaneCoherence > 0.5)
    martensiteVerdict = "RAPID_DISPLACIVE_SNAP";
  else if (avgMorphologyScore >= 0.7)
    martensiteVerdict = "TWIN_MORPHOLOGY";
  else if (avgMorphologyScore >= 0.45)
    martensiteVerdict = "PLATE_MORPHOLOGY";
  else if (avgMorphologyScore >= 0.2)
    martensiteVerdict = "LATH_MORPHOLOGY";
  else if (avgTransformationHysteresis > 0.5 && avgKmCompliance > 0.5)
    martensiteVerdict = "SHAPE_MEMORY_INDICATOR";
  else
    martensiteVerdict = "INTERMEDIATE_MARTENSITIC";

  const topBins = [...binRecs]
    .sort((a, b) => b.martensiteIndex - a.martensiteIndex)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    drivingForce: r4(drivingForce),
    martensiteFraction: r4(martensiteFraction),
    retainedAustenite: r4(retainedAusteniteFraction),
    twinVariantCount: clusterCount,
    avgMartensiteFraction,
    avgRetainedAustenite,
    avgMsUndercooling,
    avgKoistinenMarburger,
    avgTransformationDrivingForce,
    avgTwinVariantScore,
    avgShearStrainMagnitude,
    avgHabitPlaneCoherence,
    avgAthermalCharacter,
    avgAutocatalysisIndex,
    avgResidualStressIndex,
    avgTransformationHysteresis,
    avgProgressVsMf,
    avgKmCompliance,
    avgMorphologyScore,
    austeniteCount,
    austeniteBinFraction,
    lathCount,
    lathBinFraction,
    plateCount,
    plateBinFraction,
    twinCount,
    twinBinFraction,
    shearAsymmetry,
    martensiteGini,
    martensiteIndex,
    martensiteRegime,
    martensiteVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Martensite — Doctor ===\n");
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

  const profiles: MartensiteProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeMartensite(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgMartensiteIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.martensiteIndex)))
      : 0,
    avgDrivingForce: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.drivingForce)))
      : 0,
    austeniteStableCount:           profiles.filter((p) => p.martensiteRegime === "AUSTENITE_STABLE").length,
    isothermalCount:                profiles.filter((p) => p.martensiteRegime === "ISOTHERMAL").length,
    athermalTransformationCount:    profiles.filter((p) => p.martensiteRegime === "ATHERMAL_TRANSFORMATION").length,
    burstCount:                     profiles.filter((p) => p.martensiteRegime === "BURST").length,
    stressInducedCount:             profiles.filter((p) => p.martensiteRegime === "STRESS_INDUCED").length,
    avgMartensiteFraction: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.martensiteFraction)))
      : 0,
    avgRetainedAustenite: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.retainedAustenite)))
      : 0,
    avgTwinVariantCount: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.twinVariantCount)))
      : 0,
    avgAthermalCharacter: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgAthermalCharacter)))
      : 0,
    avgKmCompliance: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgKmCompliance)))
      : 0,
    avgHabitPlaneCoherence: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgHabitPlaneCoherence)))
      : 0,
    totalAusteniteBins:  profiles.reduce((s, p) => s + p.austeniteCount, 0),
    totalLathBins:       profiles.reduce((s, p) => s + p.lathCount, 0),
    totalPlateBins:      profiles.reduce((s, p) => s + p.plateCount, 0),
    totalTwinBins:       profiles.reduce((s, p) => s + p.twinCount, 0),
    avgMartensiteGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.martensiteGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-martensite").description("HODLMM bin martensitic transformation analyzer (Koistinen-Marburger)");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin martensitic transformation state")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
