#!/usr/bin/env bun
/**
 * hodlmm-bin-widmanstatten.ts — Day 180 cocoa007 Bitflow Skills Comp
 *
 * Widmanstätten proeutectoid transformation analyzer — models DLMM
 * bin reserves as the product of intragranular plate-growth of
 * proeutectoid ferrite (or cementite) from austenite grain
 * boundaries at moderate undercooling below A3 (or A_cm). Widmanstätten
 * ferrite is the parallel-plate morphology intermediate between
 * the grain-boundary allotriomorph (equiaxed, diffusional) at low
 * undercooling and bainitic ferrite (displacive, carbide-containing)
 * at high undercooling. It forms between ~650-800 °C in Fe-C by
 * moderate-rate cooling, with parallel plates (or needles) nucleating
 * at austenite grain boundaries and growing into the grain interior,
 * or nucleating intragranularly as secondary plates.
 *
 * Widmanstätten transformation characteristics:
 *
 *   - Kurdjumov-Sachs orientation relationship:
 *       {111}γ ∥ {110}α    ⟨1̄10⟩γ ∥ ⟨1̄11⟩α
 *     24 K-S variants per austenite grain, with ~1° rotational
 *     spread. Plates within one colony share a common variant.
 *
 *   - Plate habit plane close to {5 5 6}γ (irrational) or
 *     {101}α; plates grow along a specific low-index austenite
 *     direction (variant selection).
 *
 *   - Growth mechanism: ledge (step) growth at broad plate faces
 *     (ferrite/austenite semi-coherent interface), with diffusional
 *     transport of carbon at the plate tip. Plate tip curvature is
 *     governed by the Gibbs-Thomson effect:
 *         ΔG_eff = ΔG_bulk − 2γ/r
 *     where γ is interfacial energy and r is tip radius. This sets
 *     a minimum plate tip radius below which growth cannot proceed.
 *
 *   - Primary Widmanstätten: plates emerge from grain-boundary
 *     allotriomorphs (GB-emergent). Secondary (intragranular)
 *     Widmanstätten: plates nucleate intragranularly at inclusions,
 *     prior plates, or dislocations.
 *
 *   - Thin parallel plates typically 1-3 μm thick, with aspect ratio
 *     ~10-100. Plate-plate spacing varies with driving force: higher
 *     ΔT → thinner, more closely spaced plates.
 *
 *   - Distinct from:
 *       * Allotriomorphic ferrite (equiaxed grain-boundary ferrite,
 *         diffusional, no plate shape).
 *       * Pearlite (lamellar α+Fe3C cooperative growth at γ/P front).
 *       * Bainite (displacive, carbide-containing sheaves).
 *       * Martensite (diffusionless snap, acicular single-phase).
 *
 * In DLMM context, the transformation is from "austenite" (smooth
 * reserve distribution within a bin grain) to "proeutectoid
 * plates" (parallel thin runs of minority-role bins emerging from
 * majority-role boundaries, or intragranularly nucleated). Where
 * pearlite shows lamellar alternation with regular interlamellar
 * spacing and bainite shows aligned sheaves with carbon partitioning,
 * Widmanstätten shows directional parallel plates of the minority
 * phase with specific variant orientation.
 *
 * Snapshot-based Widmanstätten analysis identifies:
 *   - Plate fraction: populated bins showing plate-morphology signature.
 *   - Plate alignment: parallelism of plates (parallel → Widmanstätten,
 *     random → bainite).
 *   - Plate thickness: consecutive same-role minority bins.
 *   - Plate direction: inward (toward active bin) vs outward.
 *   - Boundary proximity: distance from majority-phase boundary.
 *   - Primary vs secondary: GB-emergent (primary) vs intragranular
 *     (secondary).
 *   - K-S variant signature: dominant plate orientation.
 *   - Habit plane compliance: fit to preferred plate direction.
 *   - Ledge growth signature: step-wise thickness increase.
 *   - Gibbs-Thomson compliance: plate tip radius consistency.
 *
 * Regime classification:
 *   ALLOTRIOMORPH_STABLE   — driving force insufficient (below
 *                             plate-start), GB-ferrite equiaxed only.
 *   INCUBATING_WIDMANSTATTEN — pF < 0.2, early plate nucleation.
 *   PRIMARY_WIDMANSTATTEN   — 0.2 ≤ pF < 0.5, GB-emergent plates
 *                             dominant.
 *   SECONDARY_WIDMANSTATTEN — 0.5 ≤ pF < 0.75, intragranular plates
 *                             dominant.
 *   BAINITE_BORDER          — pF ≥ 0.75, very high driving force,
 *                             near-bainite regime (plates densely
 *                             packed, variant selection weakens).
 *
 * Verdict taxonomy includes PARALLEL_PLATES, GB_EMERGENT,
 * INTRAGRANULAR_DOMINATED, K_S_VARIANT_SELECTED, K_S_RANDOM,
 * LEDGE_GROWTH, GIBBS_THOMSON_COMPLIANT, ALLOTRIOMORPH_CAP,
 * SECONDARY_NUCLEATION, HYPOEUTECTOID_STABLE, HYPEREUTECTOID_SKEW,
 * NO_PROEUTECTOID_DRIVE, and INTERMEDIATE_WIDMANSTATTEN.
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

// Normalized K-S orientation variant count proxy. Real K-S has 24
// variants per austenite grain; here we simplify to 4 directional
// buckets (inward-close, inward-far, outward-close, outward-far)
// representing "plate direction" and "plate start position".
const KS_VARIANT_COUNT = 4;

// Gibbs-Thomson critical tip curvature proxy: below this local
// reserve gradient, plate tip cannot propagate.
const GIBBS_THOMSON_MIN_GRADIENT = 0.08;

// Minimum dominance margin: reserveX/Y separation to count as
// majority (matrix) or minority (plate-analog) role.
const DOMINANCE_MARGIN = 0.15;

// Maximum plate thickness (in bin units). Real Widmanstätten plates
// are 1-3 μm thick, here proxied as 1-3 consecutive same-role bins.
const MAX_PLATE_THICKNESS = 3;

// Rate constants for Widmanstätten transformation (JMAK-like,
// site-saturated at grain boundaries for primary; random for
// secondary intragranular). Normalized proxy values.
const WIDMANSTATTEN_K = 1.0;
const WIDMANSTATTEN_N = 1.8;

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

interface BinWidmanstatten {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  plateFraction: number;             // local plate-morphology signal, 0-1
  plateAlignment: number;            // parallelism with other plates, 0-1
  plateThickness: number;            // consecutive same-role minority bins, 0-1
  plateLength: number;               // plate-run length along bin axis, 0-1
  plateDirection: number;            // -1 outward, 0 mixed, +1 inward
  boundaryProximity: number;         // distance from majority boundary, 0-1 (low=close)
  primaryVsSecondary: number;        // -1 primary (GB-emergent), 0 mixed, +1 secondary (intragranular)
  ksVariantIndex: number;            // -1 untransformed, or 0..KS_VARIANT_COUNT-1
  habitPlaneCompliance: number;      // fit to preferred direction, 0-1
  ledgeGrowthSignature: number;      // step-wise growth signal, 0-1
  gibbsThomsonCompliance: number;    // tip radius consistency, 0-1
  variantSelection: number;          // dominance of local variant, 0-1
  plateSpacing: number;              // gap to nearest parallel plate, 0-1
  intragranularNucleation: number;   // intragranular plate signal, 0-1
  matrixRole: number;                // -1 Y-matrix, +1 X-matrix, 0 mixed
  roleMinorityMargin: number;        // signed asymmetry: negative = minority (plate), positive = majority (matrix), 0-1 magnitude
  widmanstattenIndex: number;        // composite, 0-1
}

interface WidmanstattenProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  drivingForce: number;              // undercooling below A3 proxy
  plateFraction: number;             // pool-level fraction of plate bins
  plateCount: number;                // number of distinct plate runs
  largestPlateLength: number;
  primaryPlateCount: number;         // GB-emergent plates
  secondaryPlateCount: number;       // intragranular plates
  avgPlateThickness: number;
  avgPlateAlignment: number;
  avgPlateLength: number;
  avgBoundaryProximity: number;
  avgHabitPlaneCompliance: number;
  avgLedgeGrowthSignature: number;
  avgGibbsThomsonCompliance: number;
  avgVariantSelection: number;
  avgPlateSpacing: number;
  avgIntragranularNucleation: number;
  dominantKsVariant: number;
  ksVariantDistribution: number[];   // size KS_VARIANT_COUNT
  ksVariantSelectionStrength: number;// 0-1, how dominant the top variant is
  allotriomorphCount: number;        // equiaxed boundary bins
  primaryWidmanstattenBinCount: number;
  secondaryWidmanstattenBinCount: number;
  bainiteBorderCount: number;
  xMatrixCount: number;
  yMatrixCount: number;
  minorityRoleCount: number;         // minority-role bins (plate candidates)
  hypoeutectoidSkew: number;         // signed reserveX vs Y skew (proeutectoid phase)
  plateGini: number;
  widmanstattenIndex: number;
  widmanstattenRegime: string;
  widmanstattenVerdict: string;
  topBins: BinWidmanstatten[];
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

// Classify a bin's dominance role:
// +1 = reserveX-dominant (proeutectoid cementite analog if overall Y-heavy,
//      matrix analog if overall X-heavy)
// -1 = reserveY-dominant (proeutectoid ferrite analog if overall X-heavy,
//      matrix analog if overall Y-heavy)
//  0 = mixed (within margin)
function dominanceRole(bin: BinReserves): number {
  const total = bin.reserveXUsd + bin.reserveYUsd;
  if (total === 0) return 0;
  const xFrac = bin.reserveXUsd / total;
  if (xFrac > 0.5 + DOMINANCE_MARGIN) return 1;
  if (xFrac < 0.5 - DOMINANCE_MARGIN) return -1;
  return 0;
}

// Find plate runs: sequences of 1-MAX_PLATE_THICKNESS consecutive
// adjacent populated bins with the same minority role.
function findPlateRuns(
  sortedBins: BinReserves[],
  minorityRole: number
): BinReserves[][] {
  if (sortedBins.length === 0) return [];
  const runs: BinReserves[][] = [];
  let current: BinReserves[] = [];
  let lastBinId = -Infinity;
  for (const b of sortedBins) {
    const role = dominanceRole(b);
    const adjacent = b.binId - lastBinId === 1;
    if (role === minorityRole && adjacent) {
      current.push(b);
    } else if (role === minorityRole) {
      if (current.length > 0) runs.push(current);
      current = [b];
    } else {
      if (current.length > 0) {
        runs.push(current);
        current = [];
      }
    }
    lastBinId = b.binId;
  }
  if (current.length > 0) runs.push(current);
  // Retain only plates of thickness 1..MAX_PLATE_THICKNESS (thicker
  // than MAX are allotriomorph-like equiaxed cluster, not plates)
  return runs.filter((r) => r.length >= 1 && r.length <= MAX_PLATE_THICKNESS);
}

// JMAK prediction for Widmanstätten transformation, n ~ 1.8 (reflects
// primary GB-emergent + some intragranular).
function jmakWidmanstatten(drivingForce: number): number {
  const t = drivingForce;
  return Math.min(1, 1 - Math.exp(-WIDMANSTATTEN_K * Math.pow(t, WIDMANSTATTEN_N)));
}

// Classify K-S variant for a plate bin based on plate start
// position relative to active bin and plate direction.
//  0 = inward-close start (plate grows from boundary close to active bin toward away)
//  1 = inward-far (plate grows from a boundary distant from active toward away)
//  2 = outward-close (plate grows from boundary close to active toward active)
//  3 = outward-far (plate grows from distant boundary toward active)
function classifyKsVariant(
  run: BinReserves[],
  activeBin: number,
  binIdSet: Set<number>,
  minorityRole: number
): number {
  if (run.length === 0) return -1;
  const startBin = run[0].binId;
  const endBin = run[run.length - 1].binId;
  const runMid = (startBin + endBin) / 2;

  // Determine plate direction: which end is closer to a boundary
  // (matrix-role bin). Plate grows AWAY from boundary.
  const leftNeighbor = startBin - 1;
  const rightNeighbor = endBin + 1;
  const hasLeftBoundary = binIdSet.has(leftNeighbor);
  const hasRightBoundary = binIdSet.has(rightNeighbor);

  // Plate direction: +1 if plate extends rightward (start is at left
  // boundary), -1 if extends leftward (end at right boundary).
  let direction = 0;
  if (hasLeftBoundary && !hasRightBoundary) direction = 1;
  else if (!hasLeftBoundary && hasRightBoundary) direction = -1;
  else if (hasLeftBoundary && hasRightBoundary) direction = 0;

  // Plate growth direction relative to active bin:
  //   inward (+1) = toward active bin
  //   outward (-1) = away from active bin
  const growthDirection = direction > 0
    ? (runMid < activeBin ? 1 : -1)
    : direction < 0
    ? (runMid > activeBin ? 1 : -1)
    : 0;

  // Proximity: close if within 10 bins of active, far otherwise
  const close = Math.abs(runMid - activeBin) < 10;

  if (growthDirection === 1 && close) return 0;   // inward-close
  if (growthDirection === 1 && !close) return 1;  // inward-far
  if (growthDirection === -1 && close) return 2;  // outward-close
  if (growthDirection === -1 && !close) return 3; // outward-far
  return -1;
}

// Compute Shannon entropy of K-S variant distribution, normalized.
// Low entropy → strong variant selection (one variant dominates).
// High entropy → random K-S variants (bainite-like).
function variantSelectionStrength(dist: number[]): number {
  const total = dist.reduce((s, v) => s + v, 0);
  if (total === 0) return 0;
  const probs = dist.map((v) => v / total).filter((p) => p > 0);
  if (probs.length <= 1) return 1;
  const H = -probs.reduce((s, p) => s + p * Math.log(p), 0);
  const Hmax = Math.log(dist.length);
  return Math.max(0, 1 - H / Hmax);  // 1 = perfect selection, 0 = uniform
}

function computeBinWidmanstatten(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  drivingForce: number,
  runOfBin: BinReserves[] | null,
  runKsVariant: number,
  plateCount: number,
  largestPlateLength: number,
  binIdSet: Set<number>,
  poolPlateFraction: number,
  minorityRole: number,
  overallSkew: number,
  variantDist: number[]
): BinWidmanstatten {
  const distance = Math.abs(bin.binId - activeBin);
  const role = dominanceRole(bin);

  // Matrix role: the majority (opposite of minority) reserve role
  // in this pool.
  const matrixRole = -minorityRole;

  // Signed role-minority margin: negative means bin is on minority
  // side (plate candidate), positive means majority (matrix).
  const total = bin.reserveXUsd + bin.reserveYUsd;
  const xFrac = total > 0 ? bin.reserveXUsd / total : 0.5;
  const rawMargin = (xFrac - 0.5) * 2;  // -1..+1
  const signedAsymmetry = matrixRole === 1 ? rawMargin : -rawMargin;
  // Positive = toward matrix (majority), negative = toward minority (plate)
  const roleMinorityMargin = r4(signedAsymmetry);

  // 1. plateThickness — consecutive same-role minority bins
  const thickness = runOfBin ? runOfBin.length : 0;
  const plateThickness = r4(Math.min(1, thickness / MAX_PLATE_THICKNESS));

  // 2. plateLength — run length along bin axis (relative)
  const plateLength = r4(largestPlateLength > 0
    ? Math.min(1, thickness / largestPlateLength)
    : 0);

  // 3. boundaryProximity — distance from nearest matrix-role bin
  let nearestBoundary = 30;
  for (const b of allBins) {
    if (dominanceRole(b) === matrixRole) {
      const d = Math.abs(b.binId - bin.binId);
      if (d > 0 && d < nearestBoundary) nearestBoundary = d;
    }
  }
  // Lower distance = closer to boundary = higher proximity signal (invert)
  const boundaryProximity = r4(Math.max(0, 1 - nearestBoundary / 10));

  // 4. plateDirection — +1 inward toward active, -1 outward away
  let plateDirection = 0;
  if (runOfBin && runOfBin.length > 0) {
    const runMid = (runOfBin[0].binId + runOfBin[runOfBin.length - 1].binId) / 2;
    const leftStart = runOfBin[0].binId;
    const rightEnd = runOfBin[runOfBin.length - 1].binId;
    const hasLeftBoundary = binIdSet.has(leftStart - 1)
      && (allBins.find((b) => b.binId === leftStart - 1) &&
          dominanceRole(allBins.find((b) => b.binId === leftStart - 1)!) === matrixRole);
    const hasRightBoundary = binIdSet.has(rightEnd + 1)
      && (allBins.find((b) => b.binId === rightEnd + 1) &&
          dominanceRole(allBins.find((b) => b.binId === rightEnd + 1)!) === matrixRole);
    const growingRight = hasLeftBoundary && !hasRightBoundary;
    const growingLeft = !hasLeftBoundary && hasRightBoundary;
    if (growingRight) {
      plateDirection = runMid < activeBin ? 1 : -1;
    } else if (growingLeft) {
      plateDirection = runMid > activeBin ? 1 : -1;
    }
  }

  // 5. primaryVsSecondary
  //   Primary (-1): plate emerges from a grain-boundary matrix-role
  //     bin (at least one end adjacent to matrix bin).
  //   Secondary (+1): plate is intragranular (not adjacent to any
  //     matrix bin).
  let primaryVsSecondary = 0;
  if (runOfBin && runOfBin.length > 0) {
    const startBin = runOfBin[0].binId;
    const endBin = runOfBin[runOfBin.length - 1].binId;
    const leftN = allBins.find((b) => b.binId === startBin - 1);
    const rightN = allBins.find((b) => b.binId === endBin + 1);
    const leftIsBoundary = leftN && dominanceRole(leftN) === matrixRole;
    const rightIsBoundary = rightN && dominanceRole(rightN) === matrixRole;
    if (leftIsBoundary || rightIsBoundary) primaryVsSecondary = -1;
    else primaryVsSecondary = 1;
  }

  // 6. intragranularNucleation signal (high when secondary)
  const intragranularNucleation = r4(primaryVsSecondary === 1 ? 1 : 0);

  // 7. plateFraction — local plate-morphology signal
  //    High when: this bin is in a plate run + near boundary (primary)
  //    + moderate thickness + appropriate minority role
  const plateFraction = r4(
    runOfBin
      ? Math.min(1,
          0.4 + plateThickness * 0.2 + boundaryProximity * 0.2 +
          (role === minorityRole ? 0.2 : 0)
        )
      : 0
  );

  // 8. plateAlignment — parallelism with other plates
  //    High when this plate's direction aligns with plate count > 1
  //    and variant selection is strong
  const variantStrength = variantSelectionStrength(variantDist);
  const plateAlignment = r4(
    runOfBin && plateCount >= 2
      ? Math.min(1, variantStrength * 0.7 + 0.3)
      : runOfBin ? 0.3 : 0
  );

  // 9. habitPlaneCompliance — fit to preferred growth direction
  //    Plates whose run direction aligns with dominant variant get
  //    higher score
  const habitPlaneCompliance = r4(
    runKsVariant >= 0 && variantDist.length > 0
      ? (() => {
          const total = variantDist.reduce((s, v) => s + v, 0);
          const myFraction = total > 0 ? variantDist[runKsVariant] / total : 0;
          return Math.min(1, myFraction * 1.3);
        })()
      : 0
  );

  // 10. ledgeGrowthSignature — step-wise growth pattern
  //     Ledge growth: plate broadens in discrete increments, so
  //     adjacent plate bins have similar or step-decreasing reserves
  let ledgeGrowthSignature = 0;
  if (runOfBin && runOfBin.length >= 2) {
    let monotonic = 0;
    for (let i = 1; i < runOfBin.length; i++) {
      const diff = runOfBin[i].totalUsd - runOfBin[i - 1].totalUsd;
      if (Math.abs(diff) < runOfBin[i - 1].totalUsd * 0.2) monotonic++;
    }
    ledgeGrowthSignature = r4(monotonic / (runOfBin.length - 1));
  }

  // 11. gibbsThomsonCompliance — tip curvature consistency
  //     Plate tip must have reserve gradient > GIBBS_THOMSON_MIN_GRADIENT
  //     relative to adjacent matrix bin to be a valid tip
  let gibbsThomsonCompliance = 0;
  if (runOfBin && runOfBin.length > 0) {
    const tipBin = runOfBin[0].binId === bin.binId
      ? bin
      : runOfBin[runOfBin.length - 1].binId === bin.binId
      ? bin
      : null;
    if (tipBin) {
      const adjBinId = tipBin === runOfBin[0]
        ? tipBin.binId - 1
        : tipBin.binId + 1;
      const adjBin = allBins.find((b) => b.binId === adjBinId);
      if (adjBin) {
        const tipTotal = tipBin.reserveXUsd + tipBin.reserveYUsd;
        const adjTotal = adjBin.reserveXUsd + adjBin.reserveYUsd;
        const maxTotal = Math.max(tipTotal, adjTotal);
        if (maxTotal > 0) {
          const gradient = Math.abs(tipTotal - adjTotal) / maxTotal;
          gibbsThomsonCompliance = r4(
            Math.min(1, Math.max(0, (gradient - GIBBS_THOMSON_MIN_GRADIENT) * 3))
          );
        }
      }
    }
  }

  // 12. variantSelection — local dominance of the run's variant
  //     High when this bin's variant is the dominant one in the pool
  const variantSelection = r4(
    runKsVariant >= 0 && variantDist.length > 0
      ? (() => {
          const maxVariant = Math.max(...variantDist);
          return maxVariant > 0 && variantDist[runKsVariant] === maxVariant ? 1 : 0.4;
        })()
      : 0
  );

  // 13. plateSpacing — gap to nearest parallel plate
  //     Low spacing → densely packed plates (high driving force)
  //     High spacing → sparse plates (low driving force)
  let plateSpacing = 1;
  if (runOfBin && runOfBin.length > 0) {
    let nearest = 30;
    for (const b of allBins) {
      if (dominanceRole(b) !== minorityRole) continue;
      const d = Math.abs(b.binId - bin.binId);
      if (d > 0 && d < nearest) nearest = d;
    }
    plateSpacing = r4(Math.min(1, nearest / 10));
  } else {
    plateSpacing = 0;
  }

  // 14. widmanstattenIndex — composite
  const widmanstattenIndex = r4(
    Math.min(1, Math.max(0,
      plateFraction * 0.18 +
      plateAlignment * 0.12 +
      plateThickness * 0.08 +
      plateLength * 0.07 +
      habitPlaneCompliance * 0.1 +
      ledgeGrowthSignature * 0.08 +
      gibbsThomsonCompliance * 0.08 +
      variantSelection * 0.1 +
      boundaryProximity * 0.07 +
      (primaryVsSecondary !== 0 ? 0.06 : 0) +
      (plateDirection !== 0 ? 0.06 : 0)
    ))
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    plateFraction,
    plateAlignment,
    plateThickness,
    plateLength,
    plateDirection,
    boundaryProximity,
    primaryVsSecondary,
    ksVariantIndex: runOfBin ? runKsVariant : -1,
    habitPlaneCompliance,
    ledgeGrowthSignature,
    gibbsThomsonCompliance,
    variantSelection,
    plateSpacing,
    intragranularNucleation,
    matrixRole,
    roleMinorityMargin,
    widmanstattenIndex,
  };
}

function analyzeWidmanstatten(bins: BinReserves[], pool: AppPool): WidmanstattenProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;

  // Driving force: undercooling below A3 proxy = volume/TVL turnover.
  const turnover = pool.tvlUsd > 0 ? volume / pool.tvlUsd : 0;
  const drivingForce = Math.min(1, turnover * 0.8 + 0.1);

  // Compute pool-level hypoeutectoid skew (signed reserveX vs Y)
  let skewSum = 0;
  let xDom = 0;
  let yDom = 0;
  for (const b of sorted) {
    const t = b.reserveXUsd + b.reserveYUsd;
    if (t > 0) skewSum += (b.reserveXUsd - b.reserveYUsd) / t;
    const r = dominanceRole(b);
    if (r === 1) xDom++;
    else if (r === -1) yDom++;
  }
  const hypoeutectoidSkew = n > 0 ? r4(skewSum / n) : 0;

  // Determine matrix role (majority) and minority role (plate candidate)
  //   Hypoeutectoid steel (overall carbon < eutectoid): γ decomposes
  //   to α (ferrite, proeutectoid minority phase) as plates.
  //   Here: if X-dominant overall, proeutectoid phase = Y-dominant (minority).
  const matrixRole = xDom >= yDom ? 1 : -1;
  const minorityRole = -matrixRole;
  const binIdSet = new Set(sorted.map((b) => b.binId));

  // Find plate runs in minority role
  const plateRuns = findPlateRuns(sorted, minorityRole);
  const plateCount = plateRuns.length;
  const largestPlateLength = plateRuns.length > 0
    ? Math.max(...plateRuns.map((r) => r.length))
    : 0;

  // K-S variant distribution across all plate runs
  const variantDist = new Array(KS_VARIANT_COUNT).fill(0);
  const runVariants = new Map<number, number>();
  const binToRun = new Map<number, BinReserves[]>();
  for (const run of plateRuns) {
    const variant = classifyKsVariant(run, activeBin, binIdSet, minorityRole);
    if (variant >= 0 && variant < KS_VARIANT_COUNT) {
      variantDist[variant] += run.length;
      runVariants.set(run[0].binId, variant);
    } else {
      runVariants.set(run[0].binId, -1);
    }
    for (const b of run) binToRun.set(b.binId, run);
  }

  const dominantKsVariant = variantDist.indexOf(Math.max(...variantDist));
  const ksVariantSelectionStrength = r4(variantSelectionStrength(variantDist));

  // Primary vs secondary plate counts
  let primaryPlateCount = 0;
  let secondaryPlateCount = 0;
  for (const run of plateRuns) {
    const startBin = run[0].binId;
    const endBin = run[run.length - 1].binId;
    const leftN = sorted.find((b) => b.binId === startBin - 1);
    const rightN = sorted.find((b) => b.binId === endBin + 1);
    const leftIsBoundary = leftN && dominanceRole(leftN) === matrixRole;
    const rightIsBoundary = rightN && dominanceRole(rightN) === matrixRole;
    if (leftIsBoundary || rightIsBoundary) primaryPlateCount++;
    else secondaryPlateCount++;
  }

  const plateBinCount = plateRuns.reduce((s, r) => s + r.length, 0);
  const plateFraction = n > 0
    ? Math.min(1, (plateBinCount / n) * (1 + jmakWidmanstatten(drivingForce) * 0.3))
    : 0;

  const binRecs = sorted.map((b) => {
    const runOfBin = binToRun.get(b.binId) || null;
    const runKsVariant = runOfBin ? (runVariants.get(runOfBin[0].binId) ?? -1) : -1;
    return computeBinWidmanstatten(
      b,
      activeBin,
      sorted,
      drivingForce,
      runOfBin,
      runKsVariant,
      plateCount,
      largestPlateLength,
      binIdSet,
      plateFraction,
      minorityRole,
      hypoeutectoidSkew,
      variantDist
    );
  });

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const plateBins = binRecs.filter((b) => b.plateFraction > 0);
  const avgPlateThickness        = r4(avg(plateBins.map((b) => b.plateThickness)));
  const avgPlateAlignment        = r4(avg(plateBins.map((b) => b.plateAlignment)));
  const avgPlateLength           = r4(avg(plateBins.map((b) => b.plateLength)));
  const avgBoundaryProximity     = r4(avg(binRecs.map((b) => b.boundaryProximity)));
  const avgHabitPlaneCompliance  = r4(avg(plateBins.map((b) => b.habitPlaneCompliance)));
  const avgLedgeGrowthSignature  = r4(avg(plateBins.map((b) => b.ledgeGrowthSignature)));
  const avgGibbsThomsonCompliance= r4(avg(plateBins.map((b) => b.gibbsThomsonCompliance)));
  const avgVariantSelection      = r4(avg(plateBins.map((b) => b.variantSelection)));
  const avgPlateSpacing          = r4(avg(plateBins.map((b) => b.plateSpacing)));
  const avgIntragranularNucleation = r4(avg(binRecs.map((b) => b.intragranularNucleation)));

  // Bin regime counts
  const allotriomorphCount           = binRecs.filter((b) => b.matrixRole !== 0 && b.roleMinorityMargin > 0.3 && b.plateFraction < 0.2).length;
  const primaryWidmanstattenBinCount = binRecs.filter((b) => b.primaryVsSecondary === -1).length;
  const secondaryWidmanstattenBinCount = binRecs.filter((b) => b.primaryVsSecondary === 1).length;
  const bainiteBorderCount           = binRecs.filter((b) => b.plateFraction >= 0.6 && b.plateAlignment < 0.3).length;
  const xMatrixCount                 = binRecs.filter((b) => dominanceRoleFromBin(b) === 1).length;
  const yMatrixCount                 = binRecs.filter((b) => dominanceRoleFromBin(b) === -1).length;
  const minorityRoleCount            = binRecs.filter((b) => dominanceRoleFromBin(b) === minorityRole).length;

  // Gini of widmanstattenIndex distribution
  const rFactors = binRecs.map((b) => b.widmanstattenIndex);
  const sortedFactors = [...rFactors].sort((a, b) => b - a);
  const totalFactors = sortedFactors.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedFactors[i];
  }
  const plateGini = totalFactors > 0
    ? r4(Math.abs(giniSum) / (n * totalFactors))
    : 0;

  // Composite Widmanstätten index (0-100)
  const fractionScore  = Math.min(25, plateFraction * 25);
  const alignmentScore = Math.min(25, avgPlateAlignment * 25);
  const morphScore     = Math.min(25,
    avgHabitPlaneCompliance * 10 +
    avgLedgeGrowthSignature * 8 +
    avgGibbsThomsonCompliance * 7
  );
  const selectionScore = Math.min(25,
    ksVariantSelectionStrength * 13 +
    avgVariantSelection * 12
  );
  const widmanstattenIndex = Math.round(
    Math.min(100, fractionScore + alignmentScore + morphScore + selectionScore)
  );

  // Regime classification
  let widmanstattenRegime: string;
  if (drivingForce < 0.2 && plateFraction < 0.15) {
    widmanstattenRegime = "ALLOTRIOMORPH_STABLE";
  } else if (plateFraction < 0.2) {
    widmanstattenRegime = "INCUBATING_WIDMANSTATTEN";
  } else if (plateFraction >= 0.75) {
    widmanstattenRegime = "BAINITE_BORDER";
  } else if (plateFraction >= 0.5) {
    widmanstattenRegime = "SECONDARY_WIDMANSTATTEN";
  } else {
    widmanstattenRegime = "PRIMARY_WIDMANSTATTEN";
  }

  // Verdict classification
  let widmanstattenVerdict: string;
  if (drivingForce < 0.15)
    widmanstattenVerdict = "NO_PROEUTECTOID_DRIVE";
  else if (plateFraction < 0.1 && allotriomorphCount > secondaryPlateCount * 2)
    widmanstattenVerdict = "ALLOTRIOMORPH_CAP";
  else if (plateFraction < 0.15)
    widmanstattenVerdict = "HYPOEUTECTOID_STABLE";
  else if (Math.abs(hypoeutectoidSkew) > 0.35)
    widmanstattenVerdict = "HYPEREUTECTOID_SKEW";
  else if (secondaryPlateCount >= 2 && secondaryPlateCount > primaryPlateCount)
    widmanstattenVerdict = "SECONDARY_NUCLEATION";
  else if (primaryPlateCount >= 2 && primaryPlateCount > secondaryPlateCount)
    widmanstattenVerdict = "GB_EMERGENT";
  else if (ksVariantSelectionStrength > 0.55 && plateCount >= 2)
    widmanstattenVerdict = "K_S_VARIANT_SELECTED";
  else if (ksVariantSelectionStrength < 0.25 && plateCount >= 3)
    widmanstattenVerdict = "K_S_RANDOM";
  else if (avgLedgeGrowthSignature > 0.55 && plateCount >= 2)
    widmanstattenVerdict = "LEDGE_GROWTH";
  else if (avgGibbsThomsonCompliance > 0.55 && plateCount >= 2)
    widmanstattenVerdict = "GIBBS_THOMSON_COMPLIANT";
  else if (avgPlateAlignment > 0.5 && plateCount >= 2)
    widmanstattenVerdict = "PARALLEL_PLATES";
  else if (secondaryPlateCount >= 1 && primaryPlateCount === 0)
    widmanstattenVerdict = "INTRAGRANULAR_DOMINATED";
  else
    widmanstattenVerdict = "INTERMEDIATE_WIDMANSTATTEN";

  const topBins = [...binRecs]
    .sort((a, b) => b.widmanstattenIndex - a.widmanstattenIndex)
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
    plateFraction: r4(plateFraction),
    plateCount,
    largestPlateLength,
    primaryPlateCount,
    secondaryPlateCount,
    avgPlateThickness,
    avgPlateAlignment,
    avgPlateLength,
    avgBoundaryProximity,
    avgHabitPlaneCompliance,
    avgLedgeGrowthSignature,
    avgGibbsThomsonCompliance,
    avgVariantSelection,
    avgPlateSpacing,
    avgIntragranularNucleation,
    dominantKsVariant: variantDist.some((v) => v > 0) ? dominantKsVariant : -1,
    ksVariantDistribution: variantDist,
    ksVariantSelectionStrength,
    allotriomorphCount,
    primaryWidmanstattenBinCount,
    secondaryWidmanstattenBinCount,
    bainiteBorderCount,
    xMatrixCount,
    yMatrixCount,
    minorityRoleCount,
    hypoeutectoidSkew,
    plateGini,
    widmanstattenIndex,
    widmanstattenRegime,
    widmanstattenVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

// Helper: recover dominance role from the computed bin record.
function dominanceRoleFromBin(rec: BinWidmanstatten): number {
  // Approximate: sign of signed asymmetry tells us matrix vs minority,
  // and matrixRole flags which direction is matrix.
  // Since roleMinorityMargin > 0 means majority (matrix), the absolute
  // role sign is matrixRole when margin > threshold, else -matrixRole
  // when below, or 0 when within margin.
  const m = rec.roleMinorityMargin;
  if (m > 0.15) return rec.matrixRole;
  if (m < -0.15) return -rec.matrixRole;
  return 0;
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Widmanstätten — Doctor ===\n");
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

  const profiles: WidmanstattenProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeWidmanstatten(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgWidmanstattenIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.widmanstattenIndex)))
      : 0,
    avgDrivingForce: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.drivingForce)))
      : 0,
    allotriomorphStableCount:  profiles.filter((p) => p.widmanstattenRegime === "ALLOTRIOMORPH_STABLE").length,
    incubatingCount:           profiles.filter((p) => p.widmanstattenRegime === "INCUBATING_WIDMANSTATTEN").length,
    primaryCount:              profiles.filter((p) => p.widmanstattenRegime === "PRIMARY_WIDMANSTATTEN").length,
    secondaryCount:            profiles.filter((p) => p.widmanstattenRegime === "SECONDARY_WIDMANSTATTEN").length,
    bainiteBorderCount:        profiles.filter((p) => p.widmanstattenRegime === "BAINITE_BORDER").length,
    avgPlateFraction: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.plateFraction)))
      : 0,
    avgPlateCount: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.plateCount)))
      : 0,
    avgPlateThickness: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgPlateThickness)))
      : 0,
    avgPlateAlignment: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgPlateAlignment)))
      : 0,
    avgKsVariantSelectionStrength: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.ksVariantSelectionStrength)))
      : 0,
    avgLedgeGrowthSignature: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgLedgeGrowthSignature)))
      : 0,
    avgGibbsThomsonCompliance: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgGibbsThomsonCompliance)))
      : 0,
    totalPrimaryPlates:   profiles.reduce((s, p) => s + p.primaryPlateCount, 0),
    totalSecondaryPlates: profiles.reduce((s, p) => s + p.secondaryPlateCount, 0),
    totalAllotriomorphBins: profiles.reduce((s, p) => s + p.allotriomorphCount, 0),
    totalBainiteBorderBins: profiles.reduce((s, p) => s + p.bainiteBorderCount, 0),
    avgPlateGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.plateGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-widmanstatten").description("HODLMM bin Widmanstätten proeutectoid transformation analyzer (parallel plate morphology, K-S variant, ledge+Gibbs-Thomson)");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin Widmanstätten transformation state")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
