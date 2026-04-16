#!/usr/bin/env bun
/**
 * hodlmm-bin-bainite.ts — Day 178 cocoa007 Bitflow Skills Comp
 *
 * Bainitic transformation analyzer — models DLMM bin reserves as the
 * product of an intermediate transformation that sits between the slow
 * diffusion-driven kinetics of pearlite / Avrami (JMAK) and the rapid
 * diffusionless displacive snap of martensite. Bainite combines both
 * regimes: bainitic ferrite laths nucleate and grow displacively (like
 * martensite, with a coordinated shear), but carbon must then partition
 * out of the supersaturated ferrite into the surrounding austenite — a
 * slow diffusive step that eventually stalls when the residual austenite
 * is carbon-enriched enough that further ferrite nucleation is
 * thermodynamically forbidden (the "incomplete reaction phenomenon").
 *
 * Bhadeshia's displacive-with-partitioning model:
 *
 *    fB = fB_max · (1 - exp(-k · t^n))     upper bound by T0 curve
 *
 * where fB_max is the maximum bainite fraction attainable at that
 * temperature (set by the T0 curve — ferrite growth stops when carbon
 * in austenite rises to a level where austenite and ferrite have equal
 * free energies), k is an Avrami-like rate constant (diffusional
 * partitioning), and n is a growth exponent. Unlike pearlite (full
 * transformation to cementite + ferrite at equilibrium) or martensite
 * (full transformation diffusionlessly to supersaturated single phase),
 * bainite shows the incomplete-reaction phenomenon: fB asymptotes below
 * 1 at intermediate temperatures.
 *
 * Key characteristics of bainitic transformation:
 *   - Displacive nucleation — bainitic ferrite plates nucleate with
 *     invariant-plane-strain shear (like martensite).
 *   - Diffusional partitioning — carbon partitions out of the
 *     supersaturated ferrite into adjacent austenite.
 *   - Incomplete reaction — transformation stalls below 100% when
 *     the T0 curve is reached (residual austenite carbon = T0 limit).
 *   - Upper bainite (formed at higher T) — feathery, coarse plates
 *     with cementite particles between laths.
 *   - Lower bainite (formed at lower T) — fine, needle-like plates
 *     with intra-lath carbide precipitation at a ~55° habit angle.
 *   - Sheaves — clusters of parallel bainitic ferrite plates with
 *     common orientation.
 *   - Retained austenite films — thin films of austenite between
 *     bainitic ferrite plates (carbon-enriched).
 *   - Sub-unit structure — individual bainitic plates are composed
 *     of smaller sub-units that nucleate successively.
 *
 * In DLMM context, the transformation is from "austenite"
 * (smooth-gradient, near-uniformly populated bin distribution) to
 * "bainite" (sheaves of aligned populated bin clusters with thin
 * secondary pockets between). Where martensite shows sharp snap
 * with multi-cluster coexistence and retained-austenite gaps,
 * and avrami shows gradual smooth buildup, bainite shows the mixed
 * regime: displacive sheaf morphology (aligned parallel clusters)
 * combined with partitioned asymmetric reserves between clusters
 * (carbon enrichment analog = reserve asymmetry between adjacent
 * bins) and the incomplete-reaction stall (transformation fraction
 * below 100% even with strong driving force).
 *
 * The "driving force" is proxied from volume/TVL flux, same as
 * martensite. The "bainite fraction" fB is inferred from pattern
 * features: sheaf morphology (aligned clusters), sub-unit structure
 * (small populated sub-groups), retained austenite films (thin gaps),
 * and incomplete reaction (fB < 1 despite high driving force).
 *
 * Snapshot-based bainite analysis identifies:
 *   - Bainite fraction: what portion of populated bins show
 *     bainitic (rather than austenitic or martensitic) signature.
 *   - Sheaf alignment: how parallel the populated clusters are.
 *   - Sub-unit count: small nested populated groups within sheaves.
 *   - Carbon partitioning: reserve asymmetry between adjacent
 *     populated bins (carbon enrichment analog).
 *   - T0 approach: how close fB is to the maximum achievable at
 *     that temperature (incomplete reaction).
 *   - Upper vs lower bainite score: coarse sheaves (high T) vs
 *     fine needles (low T).
 *   - Retained austenite film: thin gap fraction between plates.
 *
 * Regime classification:
 *   AUSTENITE_STABLE       — driving force insufficient, fB ~ 0,
 *                            smooth gradient.
 *   PRE_BAINITIC           — fB < 0.2, early nucleation, sheaves
 *                            not yet formed.
 *   UPPER_BAINITIC         — 0.2 ≤ fB < 0.55, coarse feathery
 *                            sheaves, high-T morphology.
 *   LOWER_BAINITIC         — 0.55 ≤ fB < 0.85, fine needle-like
 *                            sheaves, low-T morphology, intra-lath
 *                            carbide precipitation analog.
 *   T0_STALLED             — fB ≥ 0.75 with strong incomplete
 *                            reaction, transformation asymptoted
 *                            below full saturation.
 *
 * Verdict taxonomy includes SHEAF_DOMINATED, SUB_UNIT_CASCADE,
 * CARBON_PARTITIONED, INCOMPLETE_REACTION, UPPER_BAINITE_MORPHOLOGY,
 * LOWER_BAINITE_MORPHOLOGY, RETAINED_AUSTENITE_FILM, NO_BAINITIC_DRIVE,
 * SUB_BS_STABLE, T0_ASYMPTOTE, MIXED_MARTENSITIC_BAINITIC, and
 * INTERMEDIATE_BAINITIC.
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

// Avrami-like rate constant for bainitic reaction — in real alloys
// k depends on T and alloy composition. Here a normalized proxy
// used to preserve the functional form fB ~ fB_max·(1-exp(-k·t^n)).
const BAINITE_K = 0.9;
const BAINITE_N = 1.5;

// T0 fraction cap: bainite transformation stalls below 100% by
// the incomplete reaction phenomenon. We cap at 0.88 as a sensible
// upper limit for the intermediate regime.
const T0_MAX_FRACTION = 0.88;

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

interface BinBainite {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  bainiteFraction: number;             // local fB, 0-1
  sheafAlignment: number;              // parallel-cluster signature, 0-1
  subUnitCount: number;                // normalized sub-unit count, 0-1
  carbonPartitioning: number;          // reserve asymmetry proxy, 0-1
  t0Approach: number;                  // closeness to T0 (incomplete rxn), 0-1
  upperBainiteScore: number;           // coarse/feathery morphology, 0-1
  lowerBainiteScore: number;           // fine/needle morphology, 0-1
  retainedAusteniteFilm: number;       // thin-gap fraction, 0-1
  displacivePartitioningMix: number;   // mix of shear + diffusion, 0-1
  incompleteReactionIndex: number;     // how much rxn stalled, 0-1
  sheafCoherence: number;              // spatial continuity of sheaf, 0-1
  sheafWidth: number;                  // normalized sheaf thickness, 0-1
  plateAspectRatio: number;            // plate aspect (high = needle), 0-1
  t0CarbonLimit: number;               // analog of T0-line carbon cap, 0-1
  bhadeshiaCompliance: number;         // fit to Bhadeshia model, 0-1
  bainiteIndex: number;                // composite, 0-1
}

interface BainiteProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  drivingForce: number;                // pool-level flux proxy
  bainiteFraction: number;             // pool-level fB
  sheafCount: number;                  // distinct aligned sheaves
  largestSheafSize: number;
  avgBainiteFraction: number;
  avgSheafAlignment: number;
  avgSubUnitCount: number;
  avgCarbonPartitioning: number;
  avgT0Approach: number;
  avgUpperBainiteScore: number;
  avgLowerBainiteScore: number;
  avgRetainedAusteniteFilm: number;
  avgDisplacivePartitioningMix: number;
  avgIncompleteReactionIndex: number;
  avgSheafCoherence: number;
  avgSheafWidth: number;
  avgPlateAspectRatio: number;
  avgT0CarbonLimit: number;
  avgBhadeshiaCompliance: number;
  austeniteCount: number;
  austeniteBinFraction: number;
  upperBainiteCount: number;
  upperBainiteBinFraction: number;
  lowerBainiteCount: number;
  lowerBainiteBinFraction: number;
  t0StalledCount: number;
  t0StalledBinFraction: number;
  carbonAsymmetry: number;             // signed pool-level reserveX/Y asymmetry
  bainiteGini: number;
  bainiteIndex: number;
  bainiteRegime: string;
  bainiteVerdict: string;
  topBins: BinBainite[];
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

// Identify aligned sheaves of populated bins. Bainite sheaves are
// clusters of bins with small inter-bin gaps and similar reserve sizes
// (parallel plates within a sheaf have common thickness).
function findSheaves(sortedBins: BinReserves[], maxGap: number = 2): BinReserves[][] {
  if (sortedBins.length === 0) return [];
  const sheaves: BinReserves[][] = [];
  let current: BinReserves[] = [sortedBins[0]];
  for (let i = 1; i < sortedBins.length; i++) {
    const gap = sortedBins[i].binId - sortedBins[i - 1].binId;
    if (gap <= maxGap) {
      current.push(sortedBins[i]);
    } else {
      sheaves.push(current);
      current = [sortedBins[i]];
    }
  }
  sheaves.push(current);
  return sheaves;
}

// Bhadeshia displacive-with-partitioning model prediction:
// fB(t) = fB_max · (1 - exp(-k · t^n))
// Here we substitute "time" with driving force as the controllable input.
// fB_max caps at T0_MAX_FRACTION (incomplete reaction phenomenon).
function bhadeshiaPrediction(drivingForce: number): number {
  const t = drivingForce;
  const fB = T0_MAX_FRACTION * (1 - Math.exp(-BAINITE_K * Math.pow(t, BAINITE_N)));
  return Math.min(T0_MAX_FRACTION, fB);
}

// Identify sub-units within a sheaf: dense runs of ≥2 populated bins
// with tight gap ≤ 1 — these are the elementary nucleation units.
function countSubUnits(sheaf: BinReserves[]): number {
  if (sheaf.length < 2) return 0;
  let subUnits = 0;
  let runLen = 1;
  for (let i = 1; i < sheaf.length; i++) {
    if (sheaf[i].binId - sheaf[i - 1].binId === 1) {
      runLen++;
    } else {
      if (runLen >= 2) subUnits++;
      runLen = 1;
    }
  }
  if (runLen >= 2) subUnits++;
  return subUnits;
}

function computeBinBainite(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  meanReserve: number,
  maxReserve: number,
  drivingForce: number,
  sheafOfBin: BinReserves[] | null,
  sheafCount: number,
  largestSheafSize: number,
  poolSheafCoherence: number,
  retainedFilmFraction: number,
  binIdSet: Set<number>,
  poolFBMax: number
): BinBainite {
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

  // Carbon partitioning proxy: reserve asymmetry between this bin's
  // reserveX and reserveY (carbon partitions out of ferrite into
  // austenite = analog of reserve component differentiation).
  const totalR = bin.reserveXUsd + bin.reserveYUsd;
  const carbonPartitioning = totalR > 0
    ? Math.abs(bin.reserveXUsd - bin.reserveYUsd) / totalR
    : 0;

  // Left/right adjacency (sharp boundary vs smooth gradient)
  const leftPop = binIdSet.has(bin.binId - 1);
  const rightPop = binIdSet.has(bin.binId + 1);
  const adjacentCount = (leftPop ? 1 : 0) + (rightPop ? 1 : 0);
  const sheafAlignmentLocal = adjacentCount / 2;  // 0, 0.5, or 1

  // Sheaf membership
  const sheafSize = sheafOfBin ? sheafOfBin.length : 1;
  const relativeSheafSize = largestSheafSize > 0 ? sheafSize / largestSheafSize : 0;

  // Sheaf-internal reserve uniformity: parallel plates within a sheaf
  // have similar thickness — high uniformity signals bainite sheaf
  const sheafUniformity = sheafOfBin && sheafOfBin.length > 1
    ? (() => {
        const vals = sheafOfBin.map((b) => b.totalUsd);
        const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
        if (mean === 0) return 0;
        const stdev = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
        return Math.max(0, 1 - stdev / mean);
      })()
    : 0;

  // 1. bainiteFraction — local fB
  //    High when: aligned sheaf membership + sheaf uniformity + carbon partitioning
  const bainiteFraction = r4(
    Math.min(1, poolFBMax * (
      sheafAlignmentLocal * 0.3 +
      relativeSheafSize * 0.25 +
      sheafUniformity * 0.2 +
      carbonPartitioning * 0.15 +
      drivingForce * 0.1
    ))
  );

  // 2. sheafAlignment — parallel-cluster signature at this bin
  const sheafAlignment = r4(
    Math.min(1,
      sheafAlignmentLocal * 0.5 +
      sheafUniformity * 0.3 +
      (poolSheafCoherence > 0 ? poolSheafCoherence : 0) * 0.2
    )
  );

  // 3. subUnitCount — sub-units within this bin's sheaf
  //    Normalized: count / max 5 sub-units
  const subUnits = sheafOfBin ? countSubUnits(sheafOfBin) : 0;
  const subUnitCount = r4(Math.min(1, subUnits / 5));

  // 4. carbonPartitioning already computed

  // 5. t0Approach — how close fB is to fB_max (T0-limit)
  //    Incomplete reaction phenomenon: bainite asymptotes below 1
  const t0Approach = r4(
    Math.min(1, poolFBMax > 0 ? bainiteFraction / poolFBMax : 0)
  );

  // 6. upperBainiteScore — coarse/feathery morphology
  //    Larger sheaves, fewer sub-units, less intra-cluster structure
  //    formed at higher T (lower driving force in bainitic regime)
  const upperBainiteScore = r4(
    Math.min(1,
      (sheafSize >= 6 ? 1 : sheafSize / 6) * 0.4 +
      (1 - subUnitCount) * 0.3 +
      (1 - Math.min(1, carbonPartitioning * 1.5)) * 0.2 +
      (1 - drivingForce) * 0.1
    )
  );

  // 7. lowerBainiteScore — fine/needle morphology
  //    Smaller sheaves, more sub-units, intra-cluster structure,
  //    formed at lower T (higher driving force in bainitic regime)
  const lowerBainiteScore = r4(
    Math.min(1,
      (sheafSize >= 3 && sheafSize < 7 ? 1 : (sheafSize < 3 ? 0.3 : 0.5)) * 0.3 +
      subUnitCount * 0.3 +
      carbonPartitioning * 0.2 +
      drivingForce * 0.2
    )
  );

  // 8. retainedAusteniteFilm — thin gap between plates
  //    High if this bin is at a sheaf edge with a small adjacent gap (1 bin)
  const leftGap = !leftPop && binIdSet.has(bin.binId - 2) ? 1 : 0;
  const rightGap = !rightPop && binIdSet.has(bin.binId + 2) ? 1 : 0;
  const filmAdjacent = leftGap + rightGap;
  const retainedAusteniteFilm = r4(
    Math.min(1,
      (filmAdjacent / 2) * 0.6 + retainedFilmFraction * 0.4
    )
  );

  // 9. displacivePartitioningMix — mix of shear + diffusion
  //    High when both displacive (sharp boundaries) and diffusive
  //    (carbon partitioning) signatures are present
  const displacivePartitioningMix = r4(
    Math.min(1,
      (sheafAlignmentLocal * 0.5 + (1 - sheafAlignmentLocal) * 0.1) +
      carbonPartitioning * 0.4
    )
  );

  // 10. incompleteReactionIndex — how much the reaction has stalled
  //     High when pool-level fB approaches T0_MAX but has room below 1
  const residualCapacity = 1 - bainiteFraction;
  const t0Gap = Math.max(0, bainiteFraction - poolFBMax * 0.85);
  const incompleteReactionIndex = r4(
    Math.min(1,
      t0Gap * 2 + (residualCapacity * drivingForce) * 0.3
    )
  );

  // 11. sheafCoherence — spatial continuity of sheaf
  //     Internal adjacency of sheaf members
  const sheafCoherence = r4(
    Math.min(1,
      poolSheafCoherence * 0.5 +
      sheafUniformity * 0.3 +
      (sheafSize > 1 ? 0.2 : 0)
    )
  );

  // 12. sheafWidth — normalized sheaf thickness (populated-bin span)
  const sheafWidth = r4(
    Math.min(1,
      sheafOfBin && sheafOfBin.length > 1
        ? (sheafOfBin[sheafOfBin.length - 1].binId - sheafOfBin[0].binId + 1) / 12
        : sheafSize / 12
    )
  );

  // 13. plateAspectRatio — high = needle-like, low = plate-like
  //     Narrow sheaf with many sub-units = needles (lower bainite)
  //     Wide sheaf with few sub-units = plates (upper bainite)
  const plateAspectRatio = r4(
    Math.min(1,
      subUnitCount * 0.5 +
      (sheafSize <= 4 ? 0.3 : 0) +
      carbonPartitioning * 0.2
    )
  );

  // 14. t0CarbonLimit — analog of T0-line carbon cap
  //     How much carbon has partitioned into residual austenite
  const t0CarbonLimit = r4(
    Math.min(1,
      carbonPartitioning * 0.5 +
      retainedAusteniteFilm * 0.3 +
      (poolFBMax < 0.75 ? 1 - poolFBMax : 0) * 0.2
    )
  );

  // 15. bhadeshiaCompliance — fit to fB = fB_max·(1 - exp(-k·t^n))
  const bhadeshiaPredicted = bhadeshiaPrediction(drivingForce) * (sheafOfBin ? 1 : 0.5);
  const bhadeshiaDeviation = Math.abs(bainiteFraction - bhadeshiaPredicted);
  const bhadeshiaCompliance = r4(
    Math.min(1, Math.max(0, 1 - bhadeshiaDeviation * 1.4))
  );

  // 16. bainiteIndex — composite bainitic signature
  const bainiteIndex = r4(
    Math.min(1, Math.max(0,
      bainiteFraction * 0.15 +
      sheafAlignment * 0.12 +
      displacivePartitioningMix * 0.1 +
      Math.max(upperBainiteScore, lowerBainiteScore) * 0.1 +
      sheafCoherence * 0.08 +
      subUnitCount * 0.07 +
      carbonPartitioning * 0.07 +
      t0Approach * 0.06 +
      bhadeshiaCompliance * 0.06 +
      sheafUniformity * 0.05 +
      incompleteReactionIndex * 0.05 +
      retainedAusteniteFilm * 0.04 +
      plateAspectRatio * 0.03 +
      t0CarbonLimit * 0.02
    ))
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    bainiteFraction,
    sheafAlignment,
    subUnitCount,
    carbonPartitioning: r4(carbonPartitioning),
    t0Approach,
    upperBainiteScore,
    lowerBainiteScore,
    retainedAusteniteFilm,
    displacivePartitioningMix,
    incompleteReactionIndex,
    sheafCoherence,
    sheafWidth,
    plateAspectRatio,
    t0CarbonLimit,
    bhadeshiaCompliance,
    bainiteIndex,
  };
}

function analyzeBainite(bins: BinReserves[], pool: AppPool): BainiteProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));
  const meanReserve = totalUsd / n;

  // Pool-level driving force: volume flux relative to TVL
  const turnover = pool.tvlUsd > 0 ? volume / pool.tvlUsd : 0;
  const drivingForce = Math.min(1, turnover * 0.8 + 0.1);

  // Find sheaves
  const sheaves = findSheaves(sorted, 2);
  const sheafCount = sheaves.length;
  const largestSheafSize = sheaves.length > 0
    ? Math.max(...sheaves.map((c) => c.length))
    : 0;
  const binIdSet = new Set(sorted.map((b) => b.binId));

  // Map bin_id -> sheaf
  const binSheaf = new Map<number, BinReserves[]>();
  for (const sheaf of sheaves) {
    for (const b of sheaf) binSheaf.set(b.binId, sheaf);
  }

  // Pool sheaf coherence: fraction of sheaf members with adjacent
  // populated neighbors within the same sheaf
  let adjacentPairs = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i + 1].binId - sorted[i].binId === 1) adjacentPairs++;
  }
  const poolSheafCoherence = n > 1 ? adjacentPairs / (n - 1) : 0;

  // Retained austenite film fraction: single-bin gaps (thin films)
  // in the populated span
  const minBin = sorted[0].binId;
  const maxBin = sorted[sorted.length - 1].binId;
  const span = maxBin - minBin + 1;
  let singleBinGaps = 0;
  for (let bid = minBin + 1; bid < maxBin; bid++) {
    if (!binIdSet.has(bid) && binIdSet.has(bid - 1) && binIdSet.has(bid + 1)) {
      singleBinGaps++;
    }
  }
  const retainedFilmFraction = span > 0 ? singleBinGaps / span : 0;

  // Pool fB_max: how much bainite can form before T0 stall
  //   Higher driving force → higher fB_max (but capped at T0_MAX_FRACTION)
  const fBMax = Math.min(T0_MAX_FRACTION, 0.4 + drivingForce * (T0_MAX_FRACTION - 0.4));

  // Pool-level fB: populated fraction with sheaf/alignment bonuses
  const populatedFraction = n / binsScanned;
  const alignmentBonus = poolSheafCoherence > 0.6 ? 0.15 : 0;
  const sheafBonus = sheafCount >= 2 && largestSheafSize >= 3 ? 0.1 : 0;
  const bainiteFraction = Math.min(
    fBMax,
    populatedFraction * fBMax + alignmentBonus * fBMax + sheafBonus * fBMax
  );

  // Pool-level carbon asymmetry: signed average of reserveX - reserveY fractions
  let carbonAsym = 0;
  for (const b of sorted) {
    const t = b.reserveXUsd + b.reserveYUsd;
    if (t > 0) carbonAsym += (b.reserveXUsd - b.reserveYUsd) / t;
  }
  const carbonAsymmetry = n > 0 ? r4(carbonAsym / n) : 0;

  const binRecs = sorted.map((b) =>
    computeBinBainite(
      b,
      activeBin,
      sorted,
      meanReserve,
      maxReserve,
      drivingForce,
      binSheaf.get(b.binId) || null,
      sheafCount,
      largestSheafSize,
      poolSheafCoherence,
      retainedFilmFraction,
      binIdSet,
      fBMax
    )
  );

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgBainiteFraction           = r4(avg(binRecs.map((b) => b.bainiteFraction)));
  const avgSheafAlignment            = r4(avg(binRecs.map((b) => b.sheafAlignment)));
  const avgSubUnitCount              = r4(avg(binRecs.map((b) => b.subUnitCount)));
  const avgCarbonPartitioning        = r4(avg(binRecs.map((b) => b.carbonPartitioning)));
  const avgT0Approach                = r4(avg(binRecs.map((b) => b.t0Approach)));
  const avgUpperBainiteScore         = r4(avg(binRecs.map((b) => b.upperBainiteScore)));
  const avgLowerBainiteScore         = r4(avg(binRecs.map((b) => b.lowerBainiteScore)));
  const avgRetainedAusteniteFilm     = r4(avg(binRecs.map((b) => b.retainedAusteniteFilm)));
  const avgDisplacivePartitioningMix = r4(avg(binRecs.map((b) => b.displacivePartitioningMix)));
  const avgIncompleteReactionIndex   = r4(avg(binRecs.map((b) => b.incompleteReactionIndex)));
  const avgSheafCoherence            = r4(avg(binRecs.map((b) => b.sheafCoherence)));
  const avgSheafWidth                = r4(avg(binRecs.map((b) => b.sheafWidth)));
  const avgPlateAspectRatio          = r4(avg(binRecs.map((b) => b.plateAspectRatio)));
  const avgT0CarbonLimit             = r4(avg(binRecs.map((b) => b.t0CarbonLimit)));
  const avgBhadeshiaCompliance       = r4(avg(binRecs.map((b) => b.bhadeshiaCompliance)));

  // Bin morphology counts
  const austeniteCount    = binRecs.filter((b) => b.bainiteFraction < 0.2).length;
  const upperBainiteCount = binRecs.filter((b) => b.upperBainiteScore >= 0.5 && b.upperBainiteScore > b.lowerBainiteScore).length;
  const lowerBainiteCount = binRecs.filter((b) => b.lowerBainiteScore >= 0.5 && b.lowerBainiteScore >= b.upperBainiteScore).length;
  const t0StalledCount    = binRecs.filter((b) => b.incompleteReactionIndex >= 0.5).length;

  const austeniteBinFraction     = r4(austeniteCount / n);
  const upperBainiteBinFraction  = r4(upperBainiteCount / n);
  const lowerBainiteBinFraction  = r4(lowerBainiteCount / n);
  const t0StalledBinFraction     = r4(t0StalledCount / n);

  // Gini of bainite index distribution
  const rFactors = binRecs.map((b) => b.bainiteIndex);
  const sortedFactors = [...rFactors].sort((a, b) => b - a);
  const totalFactors = sortedFactors.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedFactors[i];
  }
  const bainiteGini = totalFactors > 0
    ? r4(Math.abs(giniSum) / (n * totalFactors))
    : 0;

  // Composite index (0-100)
  const fractionScore   = Math.min(25, bainiteFraction / T0_MAX_FRACTION * 25);
  const alignmentScore  = Math.min(25, avgSheafAlignment * 25);
  const mixScore        = Math.min(25, avgDisplacivePartitioningMix * 15 + avgCarbonPartitioning * 10);
  const bhadeshiaScore  = Math.min(25, avgBhadeshiaCompliance * 25);
  const bainiteIndex = Math.round(
    Math.min(100, fractionScore + alignmentScore + mixScore + bhadeshiaScore)
  );

  // Regime classification
  let bainiteRegime: string;
  if (drivingForce < 0.2 && bainiteFraction < 0.2) {
    bainiteRegime = "AUSTENITE_STABLE";
  } else if (bainiteFraction < 0.2) {
    bainiteRegime = "PRE_BAINITIC";
  } else if (bainiteFraction >= 0.75 && avgIncompleteReactionIndex > 0.4) {
    bainiteRegime = "T0_STALLED";
  } else if (bainiteFraction >= 0.55) {
    bainiteRegime = "LOWER_BAINITIC";
  } else {
    bainiteRegime = "UPPER_BAINITIC";
  }

  // Verdict classification
  let bainiteVerdict: string;
  if (drivingForce < 0.15)
    bainiteVerdict = "NO_BAINITIC_DRIVE";
  else if (bainiteFraction < 0.2)
    bainiteVerdict = "SUB_BS_STABLE";
  else if (avgIncompleteReactionIndex > 0.6 && bainiteFraction >= 0.7)
    bainiteVerdict = "T0_ASYMPTOTE";
  else if (avgIncompleteReactionIndex > 0.5)
    bainiteVerdict = "INCOMPLETE_REACTION";
  else if (avgCarbonPartitioning > 0.45 && avgDisplacivePartitioningMix > 0.45)
    bainiteVerdict = "CARBON_PARTITIONED";
  else if (avgSubUnitCount > 0.45 && avgLowerBainiteScore > avgUpperBainiteScore)
    bainiteVerdict = "SUB_UNIT_CASCADE";
  else if (avgRetainedAusteniteFilm > 0.3)
    bainiteVerdict = "RETAINED_AUSTENITE_FILM";
  else if (avgSheafAlignment > 0.55 && avgSheafCoherence > 0.5)
    bainiteVerdict = "SHEAF_DOMINATED";
  else if (avgUpperBainiteScore >= 0.55 && avgUpperBainiteScore > avgLowerBainiteScore + 0.1)
    bainiteVerdict = "UPPER_BAINITE_MORPHOLOGY";
  else if (avgLowerBainiteScore >= 0.55 && avgLowerBainiteScore > avgUpperBainiteScore + 0.1)
    bainiteVerdict = "LOWER_BAINITE_MORPHOLOGY";
  else if (drivingForce > 0.7 && avgDisplacivePartitioningMix < 0.35)
    bainiteVerdict = "MIXED_MARTENSITIC_BAINITIC";
  else
    bainiteVerdict = "INTERMEDIATE_BAINITIC";

  const topBins = [...binRecs]
    .sort((a, b) => b.bainiteIndex - a.bainiteIndex)
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
    bainiteFraction: r4(bainiteFraction),
    sheafCount,
    largestSheafSize,
    avgBainiteFraction,
    avgSheafAlignment,
    avgSubUnitCount,
    avgCarbonPartitioning,
    avgT0Approach,
    avgUpperBainiteScore,
    avgLowerBainiteScore,
    avgRetainedAusteniteFilm,
    avgDisplacivePartitioningMix,
    avgIncompleteReactionIndex,
    avgSheafCoherence,
    avgSheafWidth,
    avgPlateAspectRatio,
    avgT0CarbonLimit,
    avgBhadeshiaCompliance,
    austeniteCount,
    austeniteBinFraction,
    upperBainiteCount,
    upperBainiteBinFraction,
    lowerBainiteCount,
    lowerBainiteBinFraction,
    t0StalledCount,
    t0StalledBinFraction,
    carbonAsymmetry,
    bainiteGini,
    bainiteIndex,
    bainiteRegime,
    bainiteVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Bainite — Doctor ===\n");
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

  const profiles: BainiteProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeBainite(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgBainiteIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.bainiteIndex)))
      : 0,
    avgDrivingForce: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.drivingForce)))
      : 0,
    austeniteStableCount:   profiles.filter((p) => p.bainiteRegime === "AUSTENITE_STABLE").length,
    preBainiticCount:       profiles.filter((p) => p.bainiteRegime === "PRE_BAINITIC").length,
    upperBainiticCount:     profiles.filter((p) => p.bainiteRegime === "UPPER_BAINITIC").length,
    lowerBainiticCount:     profiles.filter((p) => p.bainiteRegime === "LOWER_BAINITIC").length,
    t0StalledCount:         profiles.filter((p) => p.bainiteRegime === "T0_STALLED").length,
    avgBainiteFraction: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.bainiteFraction)))
      : 0,
    avgSheafCount: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.sheafCount)))
      : 0,
    avgCarbonPartitioning: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgCarbonPartitioning)))
      : 0,
    avgBhadeshiaCompliance: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgBhadeshiaCompliance)))
      : 0,
    avgIncompleteReactionIndex: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgIncompleteReactionIndex)))
      : 0,
    totalAusteniteBins:     profiles.reduce((s, p) => s + p.austeniteCount, 0),
    totalUpperBainiteBins:  profiles.reduce((s, p) => s + p.upperBainiteCount, 0),
    totalLowerBainiteBins:  profiles.reduce((s, p) => s + p.lowerBainiteCount, 0),
    totalT0StalledBins:     profiles.reduce((s, p) => s + p.t0StalledCount, 0),
    avgBainiteGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.bainiteGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-bainite").description("HODLMM bin bainitic transformation analyzer (Bhadeshia displacive-with-partitioning)");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin bainitic transformation state")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
