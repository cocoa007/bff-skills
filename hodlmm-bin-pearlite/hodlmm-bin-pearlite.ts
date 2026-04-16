#!/usr/bin/env bun
/**
 * hodlmm-bin-pearlite.ts — Day 179 cocoa007 Bitflow Skills Comp
 *
 * Pearlitic transformation analyzer — models DLMM bin reserves as
 * the product of the classical eutectoid decomposition austenite →
 * α + Fe3C (ferrite + cementite, lamellar). Pearlite is the slow,
 * diffusional, equilibrium counterpart to the martensitic snap
 * (diffusionless, displacive) and bainitic intermediate regime
 * (displacive nucleation + diffusional partitioning). It forms on
 * slow cooling below A1 (~727 °C) by cooperative nucleation and
 * growth of alternating lamellae of ferrite and cementite, with
 * carbon partitioning entirely across the γ/P interface.
 *
 * Zener-Hillert model of pearlite growth:
 *
 *    v = k · (ΔT)^2             (growth velocity vs undercooling)
 *    S = C / ΔT                 (interlamellar spacing vs undercooling)
 *
 * where v is lamellar edgewise growth velocity, ΔT is undercooling
 * below A1, S is interlamellar spacing, k and C are material
 * constants. Fast cooling (high ΔT) → fine lamellae (low S).
 * Slow cooling (low ΔT) → coarse lamellae (high S).
 *
 * Key characteristics of pearlitic transformation:
 *   - Lamellar morphology — alternating plates of α (ferrite, low
 *     carbon) and Fe3C (cementite, high carbon) with well-defined
 *     interlamellar spacing.
 *   - Cooperative growth — both ferrite and cementite grow
 *     simultaneously at the γ/P front, carbon partitions across
 *     very short distances (half-lamellar spacing).
 *   - Nodules/colonies — groups of parallel lamellae with common
 *     orientation nucleate at austenite grain boundaries and grow
 *     outward as hemispherical nodules.
 *   - Equilibrium transformation — both phases are at equilibrium
 *     composition (ferrite ~ 0.02 wt% C, cementite 6.67 wt% C).
 *     No supersaturation unlike bainite or martensite.
 *   - Undercooling-controlled fineness:
 *       Coarse pearlite — low ΔT, S > 0.4 μm, "pearlite proper"
 *       Fine pearlite   — moderate ΔT, S ~ 0.1-0.4 μm
 *       Sorbite         — high ΔT, S < 0.1 μm, very fine
 *       Troostite       — extreme ΔT, S < 0.05 μm, near bainite
 *   - JMAK kinetics similar to Avrami but distinct morphology:
 *       fP(t) = 1 - exp(-k·t^n), n typically 4 (site-saturated
 *       nucleation of nodules growing hemispherically).
 *
 * In DLMM context, the transformation is from "austenite"
 * (smooth-gradient uniform bin distribution, no alternation) to
 * "pearlite" (alternating reserveX-dominant / reserveY-dominant
 * bin bands, with coherent lamellar pattern). Where martensite
 * shows sharp snap with multi-cluster coexistence, and bainite
 * shows aligned sheaves with carbon partitioning, pearlite shows
 * the cooperative alternation: reserveX-heavy bands interleaved
 * with reserveY-heavy bands at regular interlamellar spacing,
 * analogous to the ferrite/cementite lamellar pattern.
 *
 * The "driving force" is proxied from volume/TVL flux, same as
 * martensite and bainite. The "pearlite fraction" fP is inferred
 * from pattern features: lamellar alternation (reserveX/Y
 * dominance switches), interlamellar spacing (bin gap between
 * switches), nodule count (colonies of aligned lamellae), and
 * Zener-Hillert compliance (does S match C/ΔT?).
 *
 * Snapshot-based pearlite analysis identifies:
 *   - Pearlite fraction: what portion of populated bins show
 *     pearlitic (rather than austenitic or martensitic) signature.
 *   - Lamellar alignment: regularity of reserveX/Y alternation.
 *   - Interlamellar spacing S: average gap between dominance
 *     switches (in bin units).
 *   - Nodule count: colonies of parallel lamellae.
 *   - Zener-Hillert compliance: fit of S to C/ΔT.
 *   - Sorbite / coarse / fine morphology: classification of
 *     interlamellar fineness.
 *   - Cooperative growth: joint presence of both reserve phases
 *     in adjacent bins.
 *
 * Regime classification:
 *   AUSTENITE_STABLE     — driving force insufficient, fP ~ 0,
 *                          smooth gradient, no alternation.
 *   INCUBATING_PEARLITE  — fP < 0.2, early nucleation, nodules
 *                          not yet formed.
 *   COARSE_PEARLITIC     — 0.2 ≤ fP < 0.5, thick lamellae,
 *                          low ΔT, high S.
 *   FINE_PEARLITIC       — 0.5 ≤ fP < 0.75, moderate ΔT,
 *                          moderate S.
 *   SORBITIC             — fP ≥ 0.75, high ΔT, low S (very fine
 *                          pearlite / sorbite / troostite regime).
 *
 * Verdict taxonomy includes NODULAR_COLONIES, LAMELLAR_DOMINATED,
 * COOPERATIVE_GROWTH, EQUILIBRIUM_PARTITIONED, ZENER_HILLERT_COMPLIANT,
 * SORBITE_MORPHOLOGY, COARSE_PEARLITE_MORPHOLOGY, TROOSTITE_REGIME,
 * SUB_EUTECTOID_STABLE, HYPEREUTECTOID_SKEW, NO_PEARLITIC_DRIVE, and
 * INTERMEDIATE_PEARLITIC.
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

// JMAK rate constant for pearlite (site-saturated nucleation)
// fP = 1 - exp(-k·t^n), n ~ 4 for spherical nodule growth.
// Here normalized proxy constants.
const PEARLITE_K = 1.1;
const PEARLITE_N = 2.0;

// Zener-Hillert spacing constant: S = C / ΔT (dimensionless in
// this normalized analogue). C controls how quickly S shrinks with
// driving force. Fit to yield S ~ 3 bins at ΔT = 0.3 and S ~ 1 bin
// at ΔT = 0.9.
const ZENER_HILLERT_C = 0.9;

// Minimum dominance margin: fraction by which reserveX (or Y) must
// exceed reserveY (or X) for a bin to count as X-dominant (or
// Y-dominant). Bins within ±MARGIN are "mixed" (no lamellar role).
const DOMINANCE_MARGIN = 0.15;

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

interface BinPearlite {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  pearliteFraction: number;            // local fP, 0-1
  lamellarAlignment: number;           // dominance alternation, 0-1
  interlamellarSpacing: number;        // normalized S, 0-1 (low = fine)
  dominanceRole: number;               // -1 Y-dom, 0 mixed, +1 X-dom
  noduleMembership: number;            // colony membership signal, 0-1
  cooperativeGrowth: number;           // both-phase presence, 0-1
  zenerHillertCompliance: number;      // fit of S to C/ΔT, 0-1
  sorbiteScore: number;                // very-fine morphology, 0-1
  coarsePearliteScore: number;         // thick-lamellae morphology, 0-1
  troostiteScore: number;              // extreme-fine morphology, 0-1
  equilibriumPartitioning: number;     // clean partition signature, 0-1
  colonyCoherence: number;             // spatial colony continuity, 0-1
  lamellarThickness: number;           // bin-lamella thickness, 0-1
  carbideAnalog: number;               // cementite-rich bin (X-heavy), 0-1
  jmakCompliance: number;              // fit to JMAK fP, 0-1
  pearliteIndex: number;               // composite, 0-1
}

interface PearliteProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  drivingForce: number;                // undercooling proxy
  pearliteFraction: number;            // pool-level fP
  noduleCount: number;                 // colonies of lamellae
  largestNoduleSize: number;
  dominanceSwitchCount: number;        // reserveX ↔ reserveY alternations
  avgInterlamellarSpacing: number;     // mean S across the populated span
  avgPearliteFraction: number;
  avgLamellarAlignment: number;
  avgNoduleMembership: number;
  avgCooperativeGrowth: number;
  avgZenerHillertCompliance: number;
  avgSorbiteScore: number;
  avgCoarsePearliteScore: number;
  avgTroostiteScore: number;
  avgEquilibriumPartitioning: number;
  avgColonyCoherence: number;
  avgLamellarThickness: number;
  avgCarbideAnalog: number;
  avgJmakCompliance: number;
  austeniteCount: number;
  austeniteBinFraction: number;
  coarsePearliteCount: number;
  coarsePearliteBinFraction: number;
  finePearliteCount: number;
  finePearliteBinFraction: number;
  sorbiteCount: number;
  sorbiteBinFraction: number;
  xDominantCount: number;
  yDominantCount: number;
  mixedCount: number;
  hypereutectoidSkew: number;          // signed reserveX vs Y skew
  pearliteGini: number;
  pearliteIndex: number;
  pearliteRegime: string;
  pearliteVerdict: string;
  topBins: BinPearlite[];
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
// +1 = reserveX-dominant (> reserveY by DOMINANCE_MARGIN)  [cementite analog]
// -1 = reserveY-dominant (> reserveX by DOMINANCE_MARGIN)  [ferrite analog]
//  0 = mixed (within margin)                               [untransformed]
function dominanceRole(bin: BinReserves): number {
  const total = bin.reserveXUsd + bin.reserveYUsd;
  if (total === 0) return 0;
  const xFrac = bin.reserveXUsd / total;
  if (xFrac > 0.5 + DOMINANCE_MARGIN) return 1;
  if (xFrac < 0.5 - DOMINANCE_MARGIN) return -1;
  return 0;
}

// Identify nodules: colonies of adjacent populated bins that
// show a consistent lamellar pattern (at least one dominance
// switch within the colony).
function findNodules(sortedBins: BinReserves[], maxGap: number = 2): BinReserves[][] {
  if (sortedBins.length === 0) return [];
  const nodules: BinReserves[][] = [];
  let current: BinReserves[] = [sortedBins[0]];
  for (let i = 1; i < sortedBins.length; i++) {
    const gap = sortedBins[i].binId - sortedBins[i - 1].binId;
    if (gap <= maxGap) {
      current.push(sortedBins[i]);
    } else {
      if (current.length >= 2 && colonyHasSwitch(current)) {
        nodules.push(current);
      }
      current = [sortedBins[i]];
    }
  }
  if (current.length >= 2 && colonyHasSwitch(current)) {
    nodules.push(current);
  }
  return nodules;
}

function colonyHasSwitch(colony: BinReserves[]): boolean {
  let prev = 0;
  for (const b of colony) {
    const d = dominanceRole(b);
    if (d !== 0 && prev !== 0 && d !== prev) return true;
    if (d !== 0) prev = d;
  }
  return false;
}

// JMAK prediction for pearlite: fP(t) = 1 - exp(-k·t^n), n ~ 2-4.
function jmakPrediction(drivingForce: number): number {
  const t = drivingForce;
  return Math.min(1, 1 - Math.exp(-PEARLITE_K * Math.pow(t, PEARLITE_N)));
}

// Zener-Hillert interlamellar spacing prediction: S = C/ΔT.
// Normalized into [0,1] range where S=1 is coarse (low drive),
// S=0 is extreme fine (high drive).
function zenerHillertSpacing(drivingForce: number): number {
  if (drivingForce <= 0.05) return 1;
  const raw = ZENER_HILLERT_C / drivingForce;
  return Math.min(1, raw / 10);  // cap at 10 bins → maps to 1.0
}

// Count dominance switches in a bin sequence.
function countSwitches(bins: BinReserves[]): number {
  let switches = 0;
  let prev = 0;
  for (const b of bins) {
    const d = dominanceRole(b);
    if (d === 0) continue;
    if (prev !== 0 && d !== prev) switches++;
    prev = d;
  }
  return switches;
}

// Average interlamellar spacing in a bin sequence: average gap
// (in bin units) between successive dominance switches.
function averageSpacing(bins: BinReserves[]): number {
  const switchPositions: number[] = [];
  let prev = 0;
  for (const b of bins) {
    const d = dominanceRole(b);
    if (d === 0) continue;
    if (prev !== 0 && d !== prev) switchPositions.push(b.binId);
    prev = d;
  }
  if (switchPositions.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < switchPositions.length; i++) {
    total += switchPositions[i] - switchPositions[i - 1];
  }
  return total / (switchPositions.length - 1);
}

function computeBinPearlite(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  meanReserve: number,
  maxReserve: number,
  drivingForce: number,
  noduleOfBin: BinReserves[] | null,
  noduleCount: number,
  largestNoduleSize: number,
  poolSwitchCount: number,
  poolAvgSpacing: number,
  binIdSet: Set<number>,
  poolFP: number
): BinPearlite {
  const distance = Math.abs(bin.binId - activeBin);
  const R = bin.totalUsd;

  // Dominance role for this bin
  const role = dominanceRole(bin);

  // Neighboring roles
  const leftBin = allBins.find((b) => b.binId === bin.binId - 1);
  const rightBin = allBins.find((b) => b.binId === bin.binId + 1);
  const leftRole = leftBin ? dominanceRole(leftBin) : 0;
  const rightRole = rightBin ? dominanceRole(rightBin) : 0;

  // 1. lamellarAlignment — local alternation signature
  //    High when this bin's role is opposite to its immediate neighbors
  let alternations = 0;
  if (role !== 0) {
    if (leftRole !== 0 && leftRole !== role) alternations++;
    if (rightRole !== 0 && rightRole !== role) alternations++;
  }
  const lamellarAlignment = r4(alternations / 2);

  // 2. interlamellarSpacing — local spacing proxy
  //    Distance to nearest dominance switch, normalized to 10 bins
  let nearestSwitchDistance = 30;
  for (const b of allBins) {
    const d = dominanceRole(b);
    if (d !== 0 && d !== role && role !== 0) {
      const dist = Math.abs(b.binId - bin.binId);
      if (dist < nearestSwitchDistance) nearestSwitchDistance = dist;
    }
  }
  const interlamellarSpacing = r4(Math.min(1, nearestSwitchDistance / 10));

  // 3. cooperativeGrowth — both-phase presence at this bin
  //    High when bin has both reserveX and reserveY substantially
  //    (cooperative eutectoid signature)
  const total = bin.reserveXUsd + bin.reserveYUsd;
  const minFrac = total > 0
    ? Math.min(bin.reserveXUsd, bin.reserveYUsd) / total
    : 0;
  const cooperativeGrowth = r4(Math.min(1, minFrac * 2));  // 0.5 → 1.0

  // 4. noduleMembership — colony signal
  const noduleSize = noduleOfBin ? noduleOfBin.length : 0;
  const relativeNoduleSize = largestNoduleSize > 0
    ? noduleSize / largestNoduleSize
    : 0;
  const noduleMembership = r4(Math.min(1, relativeNoduleSize));

  // 5. zenerHillertCompliance — fit of local S to ZH prediction
  const zhPredicted = zenerHillertSpacing(drivingForce);
  const zhDeviation = Math.abs(interlamellarSpacing - zhPredicted);
  const zenerHillertCompliance = r4(
    Math.min(1, Math.max(0, 1 - zhDeviation * 1.5))
  );

  // 6. pearliteFraction — local fP
  //    High when: aligned lamella + nodule membership + cooperative growth
  //    + high driving force
  const pearliteFraction = r4(
    Math.min(1, poolFP * (
      lamellarAlignment * 0.3 +
      relativeNoduleSize * 0.25 +
      cooperativeGrowth * 0.2 +
      (role !== 0 ? 0.15 : 0) +
      drivingForce * 0.1
    ))
  );

  // 7. sorbiteScore — very-fine morphology
  //    High when: small local S + high driving force + aligned
  const sorbiteScore = r4(
    Math.min(1,
      (1 - interlamellarSpacing) * 0.5 +
      drivingForce * 0.3 +
      lamellarAlignment * 0.2
    )
  );

  // 8. coarsePearliteScore — thick-lamellae morphology
  //    High when: large local S + low driving force + aligned
  const coarsePearliteScore = r4(
    Math.min(1,
      interlamellarSpacing * 0.5 +
      (1 - drivingForce) * 0.3 +
      lamellarAlignment * 0.2
    )
  );

  // 9. troostiteScore — extreme-fine morphology (beyond sorbite)
  //    High when: tiny S + extreme driving force + high alternation density
  const troostiteScore = r4(
    Math.min(1,
      Math.max(0, 1 - interlamellarSpacing * 3) * 0.5 +
      Math.max(0, drivingForce - 0.6) / 0.4 * 0.3 +
      lamellarAlignment * 0.2
    )
  );

  // 10. equilibriumPartitioning — clean partition signature
  //     High when role is clear (not mixed) and cooperative growth is low
  //     (pure phase at this bin, both phases separated cleanly)
  const cleanRole = role !== 0 ? 1 : 0;
  const equilibriumPartitioning = r4(
    Math.min(1,
      cleanRole * 0.5 +
      (total > 0
        ? Math.max(bin.reserveXUsd, bin.reserveYUsd) / total - 0.5
        : 0) * 2 * 0.5
    )
  );

  // 11. colonyCoherence — spatial continuity
  //     High when nodule is internally adjacent
  const internalAdjacency = noduleOfBin && noduleOfBin.length > 1
    ? (() => {
        let adj = 0;
        for (let i = 0; i < noduleOfBin.length - 1; i++) {
          if (noduleOfBin[i + 1].binId - noduleOfBin[i].binId === 1) adj++;
        }
        return adj / (noduleOfBin.length - 1);
      })()
    : 0;
  const colonyCoherence = r4(internalAdjacency);

  // 12. lamellarThickness — this bin's lamella thickness
  //     Count consecutive same-role bins centered at this bin
  let thickness = 1;
  if (role !== 0) {
    let left = bin.binId - 1;
    while (binIdSet.has(left)) {
      const b = allBins.find((x) => x.binId === left);
      if (!b || dominanceRole(b) !== role) break;
      thickness++;
      left--;
    }
    let right = bin.binId + 1;
    while (binIdSet.has(right)) {
      const b = allBins.find((x) => x.binId === right);
      if (!b || dominanceRole(b) !== role) break;
      thickness++;
      right++;
    }
  }
  const lamellarThickness = r4(Math.min(1, thickness / 6));

  // 13. carbideAnalog — cementite-analog (reserveX-heavy) signature
  //     High when role = +1 and X fraction is high
  const xFraction = total > 0 ? bin.reserveXUsd / total : 0.5;
  const carbideAnalog = r4(
    Math.min(1,
      role === 1 ? Math.min(1, (xFraction - 0.5) * 2) : 0
    )
  );

  // 14. jmakCompliance — local fit to JMAK prediction
  const jmakPredicted = jmakPrediction(drivingForce) * (noduleOfBin ? 1 : 0.4);
  const jmakDeviation = Math.abs(pearliteFraction - jmakPredicted);
  const jmakCompliance = r4(
    Math.min(1, Math.max(0, 1 - jmakDeviation * 1.4))
  );

  // 15. pearliteIndex — composite
  const pearliteIndex = r4(
    Math.min(1, Math.max(0,
      pearliteFraction * 0.15 +
      lamellarAlignment * 0.12 +
      cooperativeGrowth * 0.1 +
      noduleMembership * 0.08 +
      zenerHillertCompliance * 0.08 +
      Math.max(sorbiteScore, coarsePearliteScore) * 0.08 +
      equilibriumPartitioning * 0.07 +
      colonyCoherence * 0.07 +
      jmakCompliance * 0.06 +
      troostiteScore * 0.05 +
      carbideAnalog * 0.05 +
      lamellarThickness * 0.04 +
      (1 - interlamellarSpacing) * 0.05
    ))
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    pearliteFraction,
    lamellarAlignment,
    interlamellarSpacing,
    dominanceRole: role,
    noduleMembership,
    cooperativeGrowth,
    zenerHillertCompliance,
    sorbiteScore,
    coarsePearliteScore,
    troostiteScore,
    equilibriumPartitioning,
    colonyCoherence,
    lamellarThickness,
    carbideAnalog,
    jmakCompliance,
    pearliteIndex,
  };
}

function analyzePearlite(bins: BinReserves[], pool: AppPool): PearliteProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));
  const meanReserve = totalUsd / n;

  // Pool-level driving force (undercooling proxy): volume flux vs TVL.
  const turnover = pool.tvlUsd > 0 ? volume / pool.tvlUsd : 0;
  const drivingForce = Math.min(1, turnover * 0.8 + 0.1);

  // Pool-level switches and spacing
  const poolSwitchCount = countSwitches(sorted);
  const poolAvgSpacing = averageSpacing(sorted);

  // Find nodules (colonies with at least one dominance switch)
  const nodules = findNodules(sorted, 2);
  const noduleCount = nodules.length;
  const largestNoduleSize = nodules.length > 0
    ? Math.max(...nodules.map((c) => c.length))
    : 0;

  const binIdSet = new Set(sorted.map((b) => b.binId));
  const binNodule = new Map<number, BinReserves[]>();
  for (const nodule of nodules) {
    for (const b of nodule) binNodule.set(b.binId, nodule);
  }

  // Pool-level fP: JMAK prediction + lamellar alignment bonus
  const fPBase = jmakPrediction(drivingForce);
  const alignmentBonus = poolSwitchCount >= 2 ? 0.12 : 0;
  const noduleBonus = noduleCount >= 2 ? 0.08 : 0;
  const pearliteFraction = Math.min(1, fPBase * (n / binsScanned) + alignmentBonus + noduleBonus);

  // Pool-level hypereutectoid skew (reserveX vs reserveY)
  let skewSum = 0;
  for (const b of sorted) {
    const t = b.reserveXUsd + b.reserveYUsd;
    if (t > 0) skewSum += (b.reserveXUsd - b.reserveYUsd) / t;
  }
  const hypereutectoidSkew = n > 0 ? r4(skewSum / n) : 0;

  const binRecs = sorted.map((b) =>
    computeBinPearlite(
      b,
      activeBin,
      sorted,
      meanReserve,
      maxReserve,
      drivingForce,
      binNodule.get(b.binId) || null,
      noduleCount,
      largestNoduleSize,
      poolSwitchCount,
      poolAvgSpacing,
      binIdSet,
      pearliteFraction
    )
  );

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgPearliteFraction       = r4(avg(binRecs.map((b) => b.pearliteFraction)));
  const avgLamellarAlignment      = r4(avg(binRecs.map((b) => b.lamellarAlignment)));
  const avgInterlamellarSpacing   = r4(avg(binRecs.map((b) => b.interlamellarSpacing)));
  const avgNoduleMembership       = r4(avg(binRecs.map((b) => b.noduleMembership)));
  const avgCooperativeGrowth      = r4(avg(binRecs.map((b) => b.cooperativeGrowth)));
  const avgZenerHillertCompliance = r4(avg(binRecs.map((b) => b.zenerHillertCompliance)));
  const avgSorbiteScore           = r4(avg(binRecs.map((b) => b.sorbiteScore)));
  const avgCoarsePearliteScore    = r4(avg(binRecs.map((b) => b.coarsePearliteScore)));
  const avgTroostiteScore         = r4(avg(binRecs.map((b) => b.troostiteScore)));
  const avgEquilibriumPartitioning= r4(avg(binRecs.map((b) => b.equilibriumPartitioning)));
  const avgColonyCoherence        = r4(avg(binRecs.map((b) => b.colonyCoherence)));
  const avgLamellarThickness      = r4(avg(binRecs.map((b) => b.lamellarThickness)));
  const avgCarbideAnalog          = r4(avg(binRecs.map((b) => b.carbideAnalog)));
  const avgJmakCompliance         = r4(avg(binRecs.map((b) => b.jmakCompliance)));

  // Bin morphology counts
  const austeniteCount       = binRecs.filter((b) => b.pearliteFraction < 0.2).length;
  const coarsePearliteCount  = binRecs.filter((b) => b.coarsePearliteScore >= 0.5 && b.coarsePearliteScore > b.sorbiteScore).length;
  const finePearliteCount    = binRecs.filter(
    (b) => b.pearliteFraction >= 0.4 &&
           b.pearliteFraction < 0.7 &&
           b.coarsePearliteScore < 0.5 &&
           b.sorbiteScore < 0.5
  ).length;
  const sorbiteCount         = binRecs.filter((b) => b.sorbiteScore >= 0.5 && b.sorbiteScore >= b.coarsePearliteScore).length;
  const xDominantCount       = binRecs.filter((b) => b.dominanceRole === 1).length;
  const yDominantCount       = binRecs.filter((b) => b.dominanceRole === -1).length;
  const mixedCount           = binRecs.filter((b) => b.dominanceRole === 0).length;

  const austeniteBinFraction      = r4(austeniteCount / n);
  const coarsePearliteBinFraction = r4(coarsePearliteCount / n);
  const finePearliteBinFraction   = r4(finePearliteCount / n);
  const sorbiteBinFraction        = r4(sorbiteCount / n);

  // Gini of pearlite index distribution
  const rFactors = binRecs.map((b) => b.pearliteIndex);
  const sortedFactors = [...rFactors].sort((a, b) => b - a);
  const totalFactors = sortedFactors.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedFactors[i];
  }
  const pearliteGini = totalFactors > 0
    ? r4(Math.abs(giniSum) / (n * totalFactors))
    : 0;

  // Composite pearlite index (0-100)
  const fractionScore  = Math.min(25, pearliteFraction * 25);
  const alignmentScore = Math.min(25, avgLamellarAlignment * 25);
  const morphScore     = Math.min(25,
    Math.max(avgSorbiteScore, avgCoarsePearliteScore) * 15 +
    avgCooperativeGrowth * 10
  );
  const complianceScore = Math.min(25,
    avgJmakCompliance * 13 + avgZenerHillertCompliance * 12
  );
  const pearliteIndex = Math.round(
    Math.min(100, fractionScore + alignmentScore + morphScore + complianceScore)
  );

  // Regime classification
  let pearliteRegime: string;
  if (drivingForce < 0.2 && pearliteFraction < 0.2) {
    pearliteRegime = "AUSTENITE_STABLE";
  } else if (pearliteFraction < 0.2) {
    pearliteRegime = "INCUBATING_PEARLITE";
  } else if (pearliteFraction >= 0.75) {
    pearliteRegime = "SORBITIC";
  } else if (pearliteFraction >= 0.5) {
    pearliteRegime = "FINE_PEARLITIC";
  } else {
    pearliteRegime = "COARSE_PEARLITIC";
  }

  // Verdict classification
  let pearliteVerdict: string;
  if (drivingForce < 0.15)
    pearliteVerdict = "NO_PEARLITIC_DRIVE";
  else if (pearliteFraction < 0.2)
    pearliteVerdict = "SUB_EUTECTOID_STABLE";
  else if (avgTroostiteScore > 0.55 && drivingForce > 0.7)
    pearliteVerdict = "TROOSTITE_REGIME";
  else if (avgSorbiteScore >= 0.55 && avgSorbiteScore > avgCoarsePearliteScore + 0.1)
    pearliteVerdict = "SORBITE_MORPHOLOGY";
  else if (avgCoarsePearliteScore >= 0.55 && avgCoarsePearliteScore > avgSorbiteScore + 0.1)
    pearliteVerdict = "COARSE_PEARLITE_MORPHOLOGY";
  else if (noduleCount >= 2 && avgColonyCoherence > 0.45)
    pearliteVerdict = "NODULAR_COLONIES";
  else if (avgZenerHillertCompliance > 0.55 && poolSwitchCount >= 2)
    pearliteVerdict = "ZENER_HILLERT_COMPLIANT";
  else if (avgEquilibriumPartitioning > 0.55 && avgCooperativeGrowth < 0.4)
    pearliteVerdict = "EQUILIBRIUM_PARTITIONED";
  else if (avgCooperativeGrowth > 0.5 && poolSwitchCount >= 2)
    pearliteVerdict = "COOPERATIVE_GROWTH";
  else if (avgLamellarAlignment > 0.5 && poolSwitchCount >= 2)
    pearliteVerdict = "LAMELLAR_DOMINATED";
  else if (Math.abs(hypereutectoidSkew) > 0.35)
    pearliteVerdict = "HYPEREUTECTOID_SKEW";
  else
    pearliteVerdict = "INTERMEDIATE_PEARLITIC";

  const topBins = [...binRecs]
    .sort((a, b) => b.pearliteIndex - a.pearliteIndex)
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
    pearliteFraction: r4(pearliteFraction),
    noduleCount,
    largestNoduleSize,
    dominanceSwitchCount: poolSwitchCount,
    avgInterlamellarSpacing: r4(poolAvgSpacing > 0 ? Math.min(1, poolAvgSpacing / 10) : avgInterlamellarSpacing),
    avgPearliteFraction,
    avgLamellarAlignment,
    avgNoduleMembership,
    avgCooperativeGrowth,
    avgZenerHillertCompliance,
    avgSorbiteScore,
    avgCoarsePearliteScore,
    avgTroostiteScore,
    avgEquilibriumPartitioning,
    avgColonyCoherence,
    avgLamellarThickness,
    avgCarbideAnalog,
    avgJmakCompliance,
    austeniteCount,
    austeniteBinFraction,
    coarsePearliteCount,
    coarsePearliteBinFraction,
    finePearliteCount,
    finePearliteBinFraction,
    sorbiteCount,
    sorbiteBinFraction,
    xDominantCount,
    yDominantCount,
    mixedCount,
    hypereutectoidSkew,
    pearliteGini,
    pearliteIndex,
    pearliteRegime,
    pearliteVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Pearlite — Doctor ===\n");
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

  const profiles: PearliteProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzePearlite(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgPearliteIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.pearliteIndex)))
      : 0,
    avgDrivingForce: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.drivingForce)))
      : 0,
    austeniteStableCount:   profiles.filter((p) => p.pearliteRegime === "AUSTENITE_STABLE").length,
    incubatingCount:        profiles.filter((p) => p.pearliteRegime === "INCUBATING_PEARLITE").length,
    coarsePearliticCount:   profiles.filter((p) => p.pearliteRegime === "COARSE_PEARLITIC").length,
    finePearliticCount:     profiles.filter((p) => p.pearliteRegime === "FINE_PEARLITIC").length,
    sorbiticCount:          profiles.filter((p) => p.pearliteRegime === "SORBITIC").length,
    avgPearliteFraction: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.pearliteFraction)))
      : 0,
    avgNoduleCount: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.noduleCount)))
      : 0,
    avgDominanceSwitchCount: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.dominanceSwitchCount)))
      : 0,
    avgInterlamellarSpacing: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgInterlamellarSpacing)))
      : 0,
    avgJmakCompliance: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgJmakCompliance)))
      : 0,
    avgZenerHillertCompliance: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgZenerHillertCompliance)))
      : 0,
    totalAusteniteBins:     profiles.reduce((s, p) => s + p.austeniteCount, 0),
    totalCoarsePearliteBins:profiles.reduce((s, p) => s + p.coarsePearliteCount, 0),
    totalFinePearliteBins:  profiles.reduce((s, p) => s + p.finePearliteCount, 0),
    totalSorbiteBins:       profiles.reduce((s, p) => s + p.sorbiteCount, 0),
    avgPearliteGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.pearliteGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-pearlite").description("HODLMM bin pearlitic transformation analyzer (Zener-Hillert lamellar eutectoid)");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin pearlitic transformation state")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
