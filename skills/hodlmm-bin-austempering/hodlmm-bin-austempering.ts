#!/usr/bin/env bun
/**
 * hodlmm-bin-austempering.ts — Day 185 cocoa007 Bitflow Skills Comp
 *
 * Austempering analyzer — models the isothermal bainite-formation heat
 * treatment applied to an austenitized iron-carbon alloy. Austempering
 * is distinct from both normalization (air-cool, fine pearlite) and
 * quenching (water/oil, martensite): the workpiece is rapidly quenched
 * from above AC3 into a molten-salt or hot-oil bath at a hold
 * temperature TQ above Ms but below BS (typically 250-450 °C), then
 * held isothermally until the γ → bainite transformation completes.
 * Cooling to room temperature afterward produces bainite + retained γ
 * with NO martensite and NO tempering step required — the result is
 * tough, ductile, dimensionally stable, and distortion-free.
 *
 * Complements the phase-transformation series:
 *   austenitization (Day 183) → austempering (Day 185) → bainite
 *     (Day 178, product phase)
 *   vs. normalization (Day 184) → pearlite (Day 179)
 *   vs. quenching → martensite (Day 177) → tempering (Day 182)
 *      → spheroidite (Day 181)
 *
 * Physical stages (austenitize → quench into isothermal bath → hold):
 *
 *   Stage 0 — AUSTENITIC_HOLD (above BS, before quench):
 *     Fully austenitized, still in γ region. No transformation.
 *
 *   Stage 1 — RAPID_QUENCH (crossing pearlite nose):
 *     Temperature drops from austenitizing T through the TTT
 *     pearlite-nose region (~550-650 °C). Must be fast enough to
 *     avoid pearlite/proeutectoid phase formation. Quench severity
 *     must place the workpiece at TQ without touching Ms.
 *
 *   Stage 2 — ISOTHERMAL_EQUILIBRATION (at TQ):
 *     Temperature equalizes across cross-section. Thin sections
 *     equilibrate in seconds; thick sections may not fully equalize
 *     (center cooler than edges, risking center martensite).
 *     TQ_UPPER_BAINITE ≈ 400-550 °C  → coarser upper bainite.
 *     TQ_LOWER_BAINITE ≈ 250-400 °C  → finer lower bainite.
 *
 *   Stage 3 — BAINITE_NUCLEATION (isothermal at TQ):
 *     Acicular ferrite sub-units nucleate heterogeneously at prior-γ
 *     grain boundaries via displacive shear (bcc nucleus within fcc γ,
 *     Kurdjumov-Sachs orientation relationship). Incubation time
 *     follows Arrhenius: τ = τ_0·exp(Q/RT) with Q ≈ 150-250 kJ/mol.
 *
 *   Stage 4 — BAINITIC_SHEAF_GROWTH (isothermal, progressing):
 *     Sub-units form sheaves (clusters) by sympathetic nucleation
 *     and autocatalysis. Sheaves propagate along preferred γ
 *     directions. Growth velocity v ≈ 10⁻⁶-10⁻⁴ m/s, much slower
 *     than martensitic shear. Carbon partitions into retained γ as
 *     sub-units form.
 *
 *   Stage 5 — CARBIDE_PARTITION (within/between sheaves):
 *     Upper bainite (TQ > ~350 °C): cementite plates form BETWEEN
 *     ferrite sub-units as C-enriched γ transforms. Coarser carbides.
 *     Lower bainite (TQ < ~350 °C): cementite (or ε-carbide at very
 *     low TQ) precipitates WITHIN ferrite sub-units at ~55-60° to the
 *     sub-unit long axis. Finer, more uniformly distributed carbides.
 *
 *   Stage 6 — FULLY_AUSTEMPERED (isothermal hold complete):
 *     All transformable γ consumed. Retained γ fraction depends on T0
 *     (composition-dependent incomplete-reaction plateau):
 *        f_bainite_max ≈ (C_T0 - C_bulk) / (C_T0 - C_αB)
 *     Final cool to RT: no further transformation (retained γ stable).
 *     Typical plain-carbon austempered outcome:
 *        - Hardness 45-55 HRC (upper bainite 35-45; lower 50-58)
 *        - Yield 1000-1400 MPa
 *        - Tensile 1400-1800 MPa
 *        - Elongation 5-12% (higher than quench-tempered martensite
 *          at same hardness)
 *        - Charpy impact 30-80 J (higher than Q+T martensite)
 *        - Distortion minimal vs. water quench.
 *
 *   Stage 7 — OVER_AUSTEMPERED (pathological, excess hold time):
 *     Carbide coarsening via Ostwald ripening reduces hardness and
 *     toughness. Transforms into tempered-bainite-like structure.
 *
 * Process constraints:
 *   - Must avoid pearlite nose: quench velocity CR_AVOID > TTT_NOSE_CR
 *     (section-size-limited).
 *   - Must land above Ms: TQ > Ms (typically 200-320 °C for plain C).
 *   - Must land below BS: TQ < BS ≈ 550 °C (composition-dependent).
 *   - Must hold long enough: t > t_99% where 99% transformed (seconds
 *     to hours depending on TQ).
 *   - Incomplete reaction: at some TQ the reaction stalls before 100%
 *     due to carbon diffusion limit (T0 curve).
 *
 * Kinetics:
 *   - Isothermal JMAK: X = 1 - exp(-(k·t)^n) with n ≈ 1.5-2.0 for
 *     bainite (vs. 2-3 for continuous-cooled pearlite).
 *   - Arrhenius: k = k_0·exp(-Q/RT), Q ≈ 150-250 kJ/mol for bainite.
 *   - T0 curve determines max bainite fraction: f_max < 1 for many
 *     alloys → "incomplete reaction phenomenon".
 *   - Transit through TTT: cooling curve from austenitization must
 *     clear the pearlite nose (~550-650 °C) at CR > critical.
 *
 * In DLMM context the austempering analog tracks:
 *   - The pool previously had high-activity (austenitic) state
 *     (priorPeakDrivingForce > AC3 analog).
 *   - Activity has dropped to a sustained moderate band (TQ window:
 *     Ms_ACTIVITY ≤ drivingForce ≤ BS_ACTIVITY) — NOT to very low
 *     (which would be martensite/quenched) and NOT to high (still γ).
 *   - The drop was FAST (transitSpeed > PEARLITE_AVOIDANCE_RATE) to
 *     avoid pearlite.
 *   - The current activity has STABILIZED at TQ (isothermalHoldProxy
 *     high — activity variance near zero recently).
 *   - Structural outcome: SHEAF-LIKE minority clusters (multiple short
 *     minority sub-runs grouped together, separated by matrix runs),
 *     rather than fine alternating lamellae (pearlite) or uniform γ
 *     (austenitic).
 *
 * DLMM structural signatures of bainite sheaves:
 *   - Sheaf: a region with 2-4 minority sub-runs (sub-units) separated
 *     by short matrix segments, flanked by long matrix runs on both
 *     sides.
 *   - Sub-unit: individual short minority run ≤ SUB_UNIT_MAX_LEN = 2.
 *   - Sheaf span: total width of a sheaf (sub-units + intra-sheaf
 *     matrix) ≤ SHEAF_MAX_SPAN = 8.
 *   - Acicularity: sub-unit aspect ratio analog (length / neighbor
 *     cluster size) → higher = more acicular.
 *   - Carbide partition signal:
 *       Upper-bainite: minority clusters of intermediate size (3-4
 *         bins) with matrix-interstitial "cementite" analog bins of
 *         small USD reserves between them.
 *       Lower-bainite: minority sub-units with internal low-reserve
 *         dips (ε-carbide/Fe3C analog within sub-unit).
 *
 * Regimes:
 *   AUSTENITIC_HOLD          — drivingForce > BS_ACTIVITY; pre-quench.
 *   TRANSIT_TO_ISOTHERMAL    — cooling through TTT window (fast drop).
 *   PEARLITE_SHUNT           — cooling too slow, pearlite-like analog
 *                              formed instead (handoff to normalization
 *                              skill).
 *   MARTENSITIC_SHUNT        — dropped below Ms, martensite formed
 *                              (handoff to martensite skill).
 *   ISOTHERMAL_HOLD          — TQ reached, no transformation yet.
 *   BAINITE_NUCLEATION       — early sheaf seeds visible.
 *   UPPER_BAINITE_GROWTH     — sheaf pattern spreading, TQ > upper/lower
 *                              threshold.
 *   LOWER_BAINITE_GROWTH     — sheaf pattern spreading, TQ < threshold,
 *                              finer sub-units.
 *   FULLY_AUSTEMPERED        — transformation complete, stable sheaves.
 *   OVER_AUSTEMPERED         — coarsened, mergedSubUnits; property loss.
 *   INCOMPLETE_REACTION      — stalled at T0 plateau, residual γ high.
 *   NO_AUSTEMPERING_DRIVE    — no prior peak, no quench to infer.
 *
 * Verdict adds:
 *   INTERMEDIATE_AUSTEMPERING — mixed indicators.
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

// Dominance margin to call a bin matrix vs minority role.
const DOMINANCE_MARGIN = 0.15;

// AC3 activity: above this, pool is still fully austenitic (no quench).
const AC3_ACTIVITY_BASE = 0.55;

// BS (bainite-start) activity: transformation can start at or below
// this. Above BS, still austenitic hold.
const BS_ACTIVITY = 0.45;

// Ms (martensite-start) activity: below this, martensite forms (shunt).
const MS_ACTIVITY = 0.12;

// Upper/Lower bainite boundary on the TQ analog axis.
// TQ > UPPER_BAINITE_MIN → upper bainite (coarser).
// TQ < UPPER_BAINITE_MIN → lower bainite (finer).
const UPPER_BAINITE_MIN = 0.28;

// Sub-unit and sheaf thresholds (DLMM bin-length analog).
const SUB_UNIT_MAX_LEN = 2;
const SHEAF_MAX_SPAN = 8;
const MIN_SUB_UNITS_PER_SHEAF = 2;

// Sheaf detection window: search for clustered minority runs within a
// moving window of populated bins.
const SHEAF_WINDOW = 8;

// Pearlite-nose-avoidance: quench speed must exceed this to avoid
// pearlite. Below this → PEARLITE_SHUNT regime.
const PEARLITE_AVOIDANCE_RATE = 0.25;

// Isothermal hold detection: drivingForce variance proxy.
// Snapshot-based proxy uses volume/tvl stability and distance from
// priorPeak.
const ISOTHERMAL_STABILITY_THRESHOLD = 0.6;

// Arrhenius Q/RT normalized — bainite regime has higher activation
// than pearlite (diffusion-controlled carbide partitioning).
const ARRHENIUS_Q_OVER_RT = 6.0;

// JMAK exponent for isothermal bainite (1.5-2.0).
const JMA_N_EXPONENT = 1.7;

// Incomplete-reaction plateau: max bainite fraction by T0 proxy.
const T0_INCOMPLETE_BASELINE = 0.65;

// Stage thresholds on composite stageProgress.
const STAGE_1_BOUND = 0.12;
const STAGE_2_BOUND = 0.25;
const STAGE_3_BOUND = 0.4;
const STAGE_4_BOUND = 0.55;
const STAGE_5_BOUND = 0.7;
const STAGE_6_BOUND = 0.85;

// Carbide-partition signal thresholds.
const CEMENTITE_RESERVE_DIP = 0.35;   // reserveUsd/neighborhoodMean
const CARBIDE_GAP_MAX_LEN = 2;

// Over-austempering: sub-unit merging threshold.
const SUB_UNIT_MERGE_LEN = 4;

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

interface BinAustempering {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  sheafSignal: number;          // 0-1
  subUnitSignal: number;        // 0-1
  acicularitySignal: number;    // 0-1
  upperBainiteSignal: number;   // 0-1
  lowerBainiteSignal: number;   // 0-1
  carbidePartitionSignal: number; // 0-1
  cementiteGap: number;         // 0 or 1 (upper-bainite gap detected)
  retainedAusteniteSignal: number; // 0-1
  stageBin: number;             // 0-7
  jmaProgress: number;
  arrheniusActivation: number;
  inMatrix: number;
  inMinority: number;
  matrixRole: number;
  roleMinorityMargin: number;
  sheafId: number;              // which sheaf this bin belongs to (0 = none)
  austemperingDegree: number;   // 0-1 composite
}

interface AustemperingProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  drivingForce: number;
  priorPeakDrivingForce: number;
  tqActivity: number;            // TQ analog
  transitSpeed: number;          // 0-1 normalized
  pearliteAvoided: number;       // 0 or 1
  msAvoided: number;             // 0 or 1 (stayed above Ms)
  bsCrossed: number;             // 0 or 1 (dropped below BS into window)
  bainiteWindow: number;         // 0 or 1 (Ms < drivingForce < BS)
  isothermalHoldProxy: number;   // 0-1
  arrheniusActivation: number;
  jmaProgress: number;
  t0Plateau: number;             // 0-1 incomplete-reaction fraction
  minorityFraction: number;
  hypoeutectoidSkew: number;
  sheafCount: number;
  subUnitCount: number;
  avgSubUnitLen: number;
  maxSubUnitLen: number;
  avgSheafSpan: number;
  maxSheafSpan: number;
  sheafDensity: number;          // fraction of populated bins in sheaves
  acicularityIndex: number;      // 0-1 aspect-ratio proxy
  upperBainiteFraction: number;  // 0-1
  lowerBainiteFraction: number;  // 0-1
  carbidePartitionCount: number; // count of gap/dip signals
  carbideFraction: number;       // carbidePartitionCount / populated
  retainedAusteniteFraction: number; // 0-1 residual γ proxy
  matrixGrainCount: number;
  minorityClusterCount: number;
  reserveCV: number;
  reserveXFracStdev: number;
  bainiteTypeDominant: string;   // UPPER | LOWER | MIXED | NONE
  hardnessProxy: number;         // 0-1 (lower bainite > upper)
  toughnessProxy: number;        // 0-1 (balanced in bainite window)
  distortionProxy: number;       // 0-1 (low for austempered)
  overAustemperingRisk: number;  // 0-1
  incompleteReactionRisk: number; // 0-1
  stageProgress: number;
  dominantStage: number;         // 0-7
  xMatrixCount: number;
  yMatrixCount: number;
  minorityRoleCount: number;
  austemperingIndex: number;     // composite 0-100
  austemperingRegime: string;
  austemperingVerdict: string;
  stageDistribution: number[];   // [s0..s7]
  topBins: BinAustempering[];
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

function dominanceRole(bin: BinReserves): number {
  const total = bin.reserveXUsd + bin.reserveYUsd;
  if (total === 0) return 0;
  const xFrac = bin.reserveXUsd / total;
  if (xFrac > 0.5 + DOMINANCE_MARGIN) return 1;
  if (xFrac < 0.5 - DOMINANCE_MARGIN) return -1;
  return 0;
}

function xFracOf(bin: BinReserves): number {
  const t = bin.reserveXUsd + bin.reserveYUsd;
  if (t === 0) return 0.5;
  return bin.reserveXUsd / t;
}

function findRoleRuns(
  sortedBins: BinReserves[],
  role: number
): BinReserves[][] {
  if (sortedBins.length === 0) return [];
  const runs: BinReserves[][] = [];
  let current: BinReserves[] = [];
  let lastBinId = -Infinity;
  for (const b of sortedBins) {
    const r = dominanceRole(b);
    const adjacent = b.binId - lastBinId === 1;
    if (r === role && adjacent) {
      current.push(b);
    } else if (r === role) {
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
  return runs;
}

// A sheaf is a cluster of ≥ MIN_SUB_UNITS_PER_SHEAF minority runs,
// each ≤ SUB_UNIT_MAX_LEN long, all within a span ≤ SHEAF_MAX_SPAN
// consecutive bin positions (by binId).
interface Sheaf {
  id: number;
  subUnits: BinReserves[][];  // list of minority runs
  spanStart: number;
  spanEnd: number;
  spanLen: number;
  subUnitCount: number;
  avgSubUnitLen: number;
  maxSubUnitLen: number;
  intraSheafMatrix: number;    // count of matrix bins inside the span
}

function detectSheaves(sortedBins: BinReserves[], minorityRole: number): Sheaf[] {
  const minorityRuns = findRoleRuns(sortedBins, minorityRole)
    .filter((r) => r.length > 0 && r.length <= SUB_UNIT_MAX_LEN);
  if (minorityRuns.length < MIN_SUB_UNITS_PER_SHEAF) return [];

  // Sort minority runs by start binId.
  minorityRuns.sort((a, b) => a[0].binId - b[0].binId);

  const sheaves: Sheaf[] = [];
  let i = 0;
  let idCounter = 1;
  while (i < minorityRuns.length) {
    // Try to extend sheaf starting at i.
    const group: BinReserves[][] = [minorityRuns[i]];
    let j = i + 1;
    while (j < minorityRuns.length) {
      const spanStart = group[0][0].binId;
      const nextEnd = minorityRuns[j][minorityRuns[j].length - 1].binId;
      if (nextEnd - spanStart <= SHEAF_MAX_SPAN) {
        group.push(minorityRuns[j]);
        j++;
      } else {
        break;
      }
    }
    if (group.length >= MIN_SUB_UNITS_PER_SHEAF) {
      const spanStart = group[0][0].binId;
      const spanEnd = group[group.length - 1][group[group.length - 1].length - 1].binId;
      const spanLen = spanEnd - spanStart + 1;
      const subUnitLens = group.map((g) => g.length);
      const totalMinorityInSheaf = subUnitLens.reduce((s, v) => s + v, 0);
      // Intra-sheaf matrix: bins in [spanStart, spanEnd] that are NOT
      // part of sub-units.
      const intraSheafMatrix = spanLen - totalMinorityInSheaf;
      sheaves.push({
        id: idCounter++,
        subUnits: group,
        spanStart,
        spanEnd,
        spanLen,
        subUnitCount: group.length,
        avgSubUnitLen: subUnitLens.reduce((s, v) => s + v, 0) / subUnitLens.length,
        maxSubUnitLen: Math.max(...subUnitLens),
        intraSheafMatrix,
      });
      i = j;
    } else {
      i++;
    }
  }
  return sheaves;
}

// Detect cementite-gap (upper-bainite signature): matrix bins inside a
// sheaf span with low reserveUsd relative to the pool matrix mean
// (carbide analog — depleted matrix between ferrite sub-units).
function detectCementiteGaps(
  sortedBins: BinReserves[],
  sheaves: Sheaf[],
  matrixRoleGlobal: number,
  matrixMean: number
): Set<number> {
  const gaps = new Set<number>();
  for (const sheaf of sheaves) {
    for (const b of sortedBins) {
      if (b.binId < sheaf.spanStart || b.binId > sheaf.spanEnd) continue;
      const r = dominanceRole(b);
      if (r !== matrixRoleGlobal) continue;
      if (matrixMean > 0 && b.totalUsd / matrixMean < CEMENTITE_RESERVE_DIP) {
        gaps.add(b.binId);
      }
    }
  }
  return gaps;
}

// JMA fraction transformed for isothermal (vs continuous cooling).
function jmaTransformedIsothermal(
  isothermalHold: number,
  arrhenius: number
): number {
  const k = arrhenius;
  const t = isothermalHold; // 0-1 proxy for "time at TQ"
  const kt = k * t;
  if (kt <= 0) return 0;
  const x = 1 - Math.exp(-Math.pow(kt, JMA_N_EXPONENT));
  return Math.max(0, Math.min(1, x));
}

// T0 incomplete-reaction plateau: composition (via hypoeutectoidSkew)
// raises or lowers max bainite fraction.
function t0Plateau(skew: number, tq: number): number {
  // Higher TQ (nearer BS) → lower f_max. Higher |skew| → slight drop.
  const tqFactor = 1 - Math.max(0, Math.min(1, (tq - UPPER_BAINITE_MIN) / 0.4)) * 0.3;
  const skewFactor = 1 - Math.min(0.2, Math.abs(skew) * 0.4);
  return Math.max(0.3, Math.min(1, T0_INCOMPLETE_BASELINE * tqFactor * skewFactor + 0.15));
}

function bainiteTypeFromTq(tq: number): string {
  if (tq >= BS_ACTIVITY) return "NONE";
  if (tq < MS_ACTIVITY) return "NONE";
  if (tq >= UPPER_BAINITE_MIN) return "UPPER";
  return "LOWER";
}

// AC3 activity lightly composition-adjusted (same scheme as normalization).
function ac3Activity(hypoeutectoidSkew: number): number {
  return Math.min(0.95, AC3_ACTIVITY_BASE + Math.abs(hypoeutectoidSkew) * 0.15);
}

function computeBinAustempering(
  bin: BinReserves,
  index: number,
  activeBin: number,
  sortedBins: BinReserves[],
  matrixRoleGlobal: number,
  sheafOfBin: Map<number, Sheaf>,
  cementiteGapSet: Set<number>,
  upperFraction: number,
  lowerFraction: number,
  poolDriving: number,
  poolArrhenius: number,
  poolTq: number,
  poolJmaProg: number,
  poolStageProg: number
): BinAustempering {
  const distance = Math.abs(bin.binId - activeBin);
  const role = dominanceRole(bin);
  const total = bin.reserveXUsd + bin.reserveYUsd;
  const xFrac = total > 0 ? bin.reserveXUsd / total : 0.5;
  const rawMargin = (xFrac - 0.5) * 2;
  const signedAsymmetry = matrixRoleGlobal === 1 ? rawMargin : -rawMargin;
  const roleMinorityMargin = r4(signedAsymmetry);

  const inMatrix = role === matrixRoleGlobal ? 1 : 0;
  const inMinority = role === -matrixRoleGlobal ? 1 : 0;

  const sheaf = sheafOfBin.get(bin.binId);
  const sheafId = sheaf ? sheaf.id : 0;

  // Sub-unit signal: minority-role bin inside a sheaf.
  const subUnitSignal = r4(
    inMinority && sheaf ? 1 : 0
  );

  // Sheaf signal: any bin inside a sheaf span.
  const sheafSignal = r4(sheaf ? 1 : 0);

  // Acicularity: sub-unit is "acicular" if avgSubUnitLen in its sheaf
  // is small relative to number of sub-units (fine, multiple, thin).
  let acicularitySignal = 0;
  if (sheaf && subUnitSignal > 0) {
    const aspect = sheaf.subUnitCount / Math.max(1, sheaf.avgSubUnitLen);
    acicularitySignal = Math.max(0, Math.min(1, aspect / 3));
  }
  acicularitySignal = r4(acicularitySignal);

  // Upper / lower bainite signals.
  const upperBainiteSignal = r4(
    sheafSignal > 0 && poolTq >= UPPER_BAINITE_MIN ? upperFraction : 0
  );
  const lowerBainiteSignal = r4(
    sheafSignal > 0 && poolTq < UPPER_BAINITE_MIN && poolTq >= MS_ACTIVITY ? lowerFraction : 0
  );

  // Carbide partition signal: bin is a cementite-gap (upper bainite
  // matrix-interstitial) or bin is a low-reserve minority sub-unit tail
  // (lower bainite internal Fe3C analog).
  let carbidePartitionSignal = 0;
  const cementiteGap = cementiteGapSet.has(bin.binId) ? 1 : 0;
  if (cementiteGap) {
    carbidePartitionSignal = 0.8;
  } else if (inMinority && sheaf && bin.totalUsd > 0) {
    // Lower-bainite internal carbide proxy: minority bin with low USD
    // reserve vs its sheaf average.
    let sheafMinorityMean = 0;
    let n = 0;
    for (const sub of sheaf.subUnits) {
      for (const sb of sub) {
        sheafMinorityMean += sb.totalUsd; n++;
      }
    }
    sheafMinorityMean = n > 0 ? sheafMinorityMean / n : 0;
    if (sheafMinorityMean > 0 && bin.totalUsd / sheafMinorityMean < 0.5 && poolTq < UPPER_BAINITE_MIN) {
      carbidePartitionSignal = 0.6;
    }
  }
  carbidePartitionSignal = r4(carbidePartitionSignal);

  // Retained austenite signal: untransformed γ analog — bin near
  // xFrac ≈ 0.5 (balanced, no role resolution) in a populated region.
  const balancedness = 1 - Math.min(1, Math.abs(xFrac - 0.5) * 2);
  const retainedAusteniteSignal = r4(
    inMatrix === 0 && inMinority === 0 ? balancedness : 0
  );

  // Stage assignment.
  let stageBin = 0;
  if (poolStageProg < STAGE_1_BOUND) {
    stageBin = 0;
  } else if (poolStageProg < STAGE_2_BOUND) {
    stageBin = 1;
  } else if (sheafSignal > 0 && poolStageProg >= STAGE_6_BOUND) {
    stageBin = 6;
  } else if (sheafSignal > 0 && carbidePartitionSignal > 0) {
    stageBin = 5;
  } else if (sheafSignal > 0 && poolStageProg >= STAGE_4_BOUND) {
    stageBin = 4;
  } else if (sheafSignal > 0 && poolStageProg >= STAGE_3_BOUND) {
    stageBin = 3;
  } else if (poolStageProg >= STAGE_2_BOUND) {
    stageBin = 2;
  } else {
    stageBin = 1;
  }

  const jmaProgress = r4(poolJmaProg);
  const arrheniusActivation = r4(poolArrhenius);

  const austemperingDegree = r4(Math.max(0, Math.min(1,
    sheafSignal * 0.3 +
    subUnitSignal * 0.2 +
    carbidePartitionSignal * 0.15 +
    acicularitySignal * 0.1 +
    (stageBin / 6) * 0.15 +
    (1 - retainedAusteniteSignal) * 0.1
  )));

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    sheafSignal,
    subUnitSignal,
    acicularitySignal,
    upperBainiteSignal,
    lowerBainiteSignal,
    carbidePartitionSignal,
    cementiteGap,
    retainedAusteniteSignal,
    stageBin,
    jmaProgress,
    arrheniusActivation,
    inMatrix,
    inMinority,
    matrixRole: matrixRoleGlobal,
    roleMinorityMargin,
    sheafId,
    austemperingDegree,
  };
}

function analyzeAustempering(bins: BinReserves[], pool: AppPool): AustemperingProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;

  const turnover = pool.tvlUsd > 0 ? volume / pool.tvlUsd : 0;
  const drivingForce = Math.min(1, turnover * 0.8 + 0.1);

  // Prior peak (austenitizing T analog).
  const priorPeakDrivingForce = Math.min(1, drivingForce * 1.35 + 0.2);

  // TQ analog = current drivingForce.
  const tqActivity = drivingForce;

  // Transit speed: how fast the drop from priorPeak to TQ happened.
  // Higher volume → more data resolution → more-trustworthy fast drop.
  const dropMagnitude = Math.max(0, priorPeakDrivingForce - tqActivity);
  const tScale = Math.max(0.3, Math.log10(Math.max(10, volume)) / 5);
  const transitSpeed = Math.max(0, Math.min(1, dropMagnitude / Math.max(0.01, tScale) * 2.5));

  // Pearlite avoided iff transitSpeed > PEARLITE_AVOIDANCE_RATE.
  const pearliteAvoided = transitSpeed > PEARLITE_AVOIDANCE_RATE ? 1 : 0;

  // Ms avoided iff TQ > Ms. (stayed above martensite-start)
  const msAvoided = tqActivity >= MS_ACTIVITY ? 1 : 0;

  // BS crossed iff TQ < BS (entered bainite window from above).
  const bsCrossed = tqActivity < BS_ACTIVITY ? 1 : 0;

  // Bainite window.
  const bainiteWindow = tqActivity >= MS_ACTIVITY && tqActivity < BS_ACTIVITY ? 1 : 0;

  // Isothermal hold proxy: low recent activity change. Use ratio of
  // current drivingForce to priorPeak — if close to the floor of the
  // window and volume is still nontrivial, treat as "held".
  const tqBandPosition = bainiteWindow
    ? (tqActivity - MS_ACTIVITY) / Math.max(0.01, BS_ACTIVITY - MS_ACTIVITY)
    : 0;
  // If TQ is well within window AND dropMagnitude is modest (slowed
  // after initial drop), isothermal hold is plausible.
  const stillSlope = tqBandPosition > 0 && tqBandPosition < 1
    ? 1 - Math.abs(tqBandPosition - 0.5) * 2
    : 0;
  const isothermalHoldProxy = Math.max(0, Math.min(1,
    bainiteWindow * (0.5 + 0.5 * stillSlope)
  ));

  const arrheniusActivation = Math.max(0.01, Math.min(1,
    Math.exp(-ARRHENIUS_Q_OVER_RT / Math.max(0.05, tqActivity + 0.05))
  ));

  const jmaProg = jmaTransformedIsothermal(isothermalHoldProxy, arrheniusActivation);

  // Skew & roles.
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
  const matrixRole = xDom >= yDom ? 1 : -1;
  const minorityRole = -matrixRole;

  const t0 = t0Plateau(hypoeutectoidSkew, tqActivity);

  // Minority clusters & total.
  const minorityRuns = findRoleRuns(sorted, minorityRole);
  const totalMinorityBins = minorityRuns.reduce((s, r) => s + r.length, 0);
  const minorityFraction = n > 0 ? totalMinorityBins / n : 0;

  // Matrix grains.
  const matrixRuns = findRoleRuns(sorted, matrixRole);

  // Sheaves (bainite clusters of sub-units).
  const sheaves = detectSheaves(sorted, minorityRole);
  const sheafOfBin = new Map<number, Sheaf>();
  for (const s of sheaves) {
    for (const sub of s.subUnits) {
      for (const b of sub) sheafOfBin.set(b.binId, s);
    }
    // Also map intra-sheaf matrix bins into the sheaf for upper-bainite
    // gap analysis.
    for (const b of sorted) {
      if (b.binId >= s.spanStart && b.binId <= s.spanEnd && !sheafOfBin.has(b.binId)) {
        sheafOfBin.set(b.binId, s);
      }
    }
  }

  const sheafCount = sheaves.length;
  const subUnitCount = sheaves.reduce((s, sh) => s + sh.subUnitCount, 0);
  const subUnitLens: number[] = [];
  for (const s of sheaves) for (const sub of s.subUnits) subUnitLens.push(sub.length);
  const avgSubUnitLen = subUnitLens.length > 0
    ? subUnitLens.reduce((s, v) => s + v, 0) / subUnitLens.length
    : 0;
  const maxSubUnitLen = subUnitLens.length > 0 ? Math.max(...subUnitLens) : 0;
  const sheafSpans = sheaves.map((s) => s.spanLen);
  const avgSheafSpan = sheafSpans.length > 0
    ? sheafSpans.reduce((s, v) => s + v, 0) / sheafSpans.length
    : 0;
  const maxSheafSpan = sheafSpans.length > 0 ? Math.max(...sheafSpans) : 0;

  // Sheaf density: fraction of populated bins that are inside any sheaf span.
  const binsInSheaf = sorted.filter((b) =>
    sheaves.some((s) => b.binId >= s.spanStart && b.binId <= s.spanEnd)
  ).length;
  const sheafDensity = n > 0 ? binsInSheaf / n : 0;

  // Acicularity: high if many short sub-units per sheaf.
  const acicularityIndex = sheafCount > 0
    ? Math.max(0, Math.min(1,
        (subUnitCount / Math.max(1, sheafCount)) / 3 *
        (1 - Math.min(1, avgSubUnitLen / SUB_UNIT_MAX_LEN) * 0.3)
      ))
    : 0;

  // Upper/lower bainite fractions.
  let upperFraction = 0;
  let lowerFraction = 0;
  if (bainiteWindow && sheafCount > 0) {
    if (tqActivity >= UPPER_BAINITE_MIN) {
      upperFraction = Math.max(0, Math.min(1, sheafDensity * (tqActivity - UPPER_BAINITE_MIN) / (BS_ACTIVITY - UPPER_BAINITE_MIN) + sheafDensity * 0.5));
      lowerFraction = Math.max(0, Math.min(1, sheafDensity - upperFraction));
    } else {
      lowerFraction = Math.max(0, Math.min(1, sheafDensity * (UPPER_BAINITE_MIN - tqActivity) / (UPPER_BAINITE_MIN - MS_ACTIVITY) + sheafDensity * 0.5));
      upperFraction = Math.max(0, Math.min(1, sheafDensity - lowerFraction));
    }
  }

  // Cementite gaps (upper-bainite matrix-interstitial low-reserve).
  const matrixMatrixBins = sorted.filter((b) => dominanceRole(b) === matrixRole);
  const matrixMean = matrixMatrixBins.length > 0
    ? matrixMatrixBins.reduce((s, b) => s + b.totalUsd, 0) / matrixMatrixBins.length
    : 0;
  const cementiteGapSet = detectCementiteGaps(sorted, sheaves, matrixRole, matrixMean);
  const carbidePartitionCount = cementiteGapSet.size;
  const carbideFraction = n > 0 ? carbidePartitionCount / n : 0;

  // Retained austenite proxy: fraction of populated bins with role = 0
  // (balanced xFrac).
  const undecidedCount = sorted.filter((b) => dominanceRole(b) === 0).length;
  const retainedAusteniteFraction = n > 0 ? undecidedCount / n : 0;

  // Reserves CV.
  const totalMean = n > 0 ? totalUsd / n : 0;
  const totalVar = n > 1 && totalMean > 0
    ? sorted.reduce((s, b) => s + (b.totalUsd - totalMean) ** 2, 0) / n
    : 0;
  const reserveCV = totalMean > 0 ? Math.sqrt(totalVar) / totalMean : 0;

  const xFracs = sorted.map((b) => xFracOf(b));
  const xFracMean = xFracs.length > 0 ? xFracs.reduce((s, v) => s + v, 0) / xFracs.length : 0.5;
  const xFracVar = xFracs.length > 1
    ? xFracs.reduce((s, v) => s + (v - xFracMean) ** 2, 0) / xFracs.length
    : 0;
  const reserveXFracStdev = Math.sqrt(xFracVar);

  // Bainite type dominant.
  let bainiteTypeDominant = "NONE";
  if (bainiteWindow && sheafCount > 0) {
    if (upperFraction > lowerFraction * 1.3) bainiteTypeDominant = "UPPER";
    else if (lowerFraction > upperFraction * 1.3) bainiteTypeDominant = "LOWER";
    else bainiteTypeDominant = "MIXED";
  }

  // Property proxies.
  // Lower bainite = harder; upper bainite = softer. Both more ductile
  // than quench+temper martensite at equivalent hardness.
  const hardnessProxy = r4(Math.max(0, Math.min(1,
    0.4 * sheafDensity +
    0.35 * lowerFraction +
    0.15 * acicularityIndex +
    0.1 * (1 - retainedAusteniteFraction)
  )));
  const toughnessProxy = r4(Math.max(0, Math.min(1,
    0.3 * sheafDensity +
    0.25 * Math.min(1, retainedAusteniteFraction * 2) +
    0.2 * acicularityIndex +
    0.15 * (bainiteWindow ? 1 : 0) +
    0.1 * (1 - Math.min(1, maxSubUnitLen / SUB_UNIT_MERGE_LEN))
  )));
  const distortionProxy = r4(Math.max(0, Math.min(1,
    // Low for austempered (isothermal = low thermal-stress).
    0.3 * (1 - isothermalHoldProxy) +
    0.2 * (1 - (pearliteAvoided * msAvoided)) +
    0.1 * retainedAusteniteFraction
  )));

  // Risks.
  const overAustemperingRisk = Math.max(0, Math.min(1,
    (maxSubUnitLen >= SUB_UNIT_MERGE_LEN ? 0.5 : 0) +
    (sheafCount > 0 && avgSheafSpan > SHEAF_MAX_SPAN * 0.8 ? 0.3 : 0) +
    (isothermalHoldProxy > 0.8 && sheafDensity > 0.6 ? 0.2 : 0)
  ));
  const incompleteReactionRisk = Math.max(0, Math.min(1,
    (retainedAusteniteFraction > 0.4 ? 0.4 : 0) +
    (bainiteWindow && jmaProg < 0.4 ? 0.3 : 0) +
    (t0 < 0.5 ? 0.3 : 0)
  ));

  // Stage progress.
  const stageProgress = Math.max(0, Math.min(1,
    Math.min(1, transitSpeed) * 0.15 +
    bainiteWindow * isothermalHoldProxy * 0.2 +
    sheafDensity * 0.25 +
    jmaProg * 0.2 +
    (bainiteWindow ? Math.min(1, subUnitCount / 4) * 0.1 : 0) +
    (pearliteAvoided && msAvoided ? 0.1 : 0)
  ));

  // Dominant stage 0-7.
  let dominantStage = 0;
  if (overAustemperingRisk > 0.7) {
    dominantStage = 7;
  } else if (stageProgress >= STAGE_6_BOUND) {
    dominantStage = 6;
  } else if (stageProgress >= STAGE_5_BOUND) {
    dominantStage = 5;
  } else if (stageProgress >= STAGE_4_BOUND) {
    dominantStage = 4;
  } else if (stageProgress >= STAGE_3_BOUND) {
    dominantStage = 3;
  } else if (stageProgress >= STAGE_2_BOUND) {
    dominantStage = 2;
  } else if (stageProgress >= STAGE_1_BOUND) {
    dominantStage = 1;
  } else {
    dominantStage = 0;
  }

  // Per-bin analysis.
  const binRecs = sorted.map((b, i) =>
    computeBinAustempering(
      b, i, activeBin, sorted, matrixRole,
      sheafOfBin, cementiteGapSet, upperFraction, lowerFraction,
      drivingForce, arrheniusActivation, tqActivity, jmaProg, stageProgress
    )
  );

  const stageDistribution = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const b of binRecs) {
    stageDistribution[Math.min(7, Math.max(0, b.stageBin))]++;
  }

  const xMatrixCount = sorted.filter((b) => dominanceRole(b) === 1).length;
  const yMatrixCount = sorted.filter((b) => dominanceRole(b) === -1).length;
  const minorityRoleCount = sorted.filter((b) => dominanceRole(b) === minorityRole).length;

  // Composite austempering index 0-100.
  const stageScore = Math.min(25, stageProgress * 25);
  const structureScore = Math.min(25, sheafDensity * 15 + acicularityIndex * 10);
  const propertyScore = Math.min(25, hardnessProxy * 12 + toughnessProxy * 13);
  const processScore = Math.min(25,
    (pearliteAvoided ? 8 : 0) +
    (msAvoided ? 5 : 0) +
    (bainiteWindow ? 7 : 0) +
    isothermalHoldProxy * 5
  );
  const austemperingIndex = Math.round(
    Math.min(100, stageScore + structureScore + propertyScore + processScore)
  );

  // Regime.
  let austemperingRegime: string;
  if (priorPeakDrivingForce < AC3_ACTIVITY_BASE * 0.6) {
    austemperingRegime = "NO_AUSTEMPERING_DRIVE";
  } else if (drivingForce > BS_ACTIVITY) {
    austemperingRegime = "AUSTENITIC_HOLD";
  } else if (!pearliteAvoided && bsCrossed === 1) {
    austemperingRegime = "PEARLITE_SHUNT";
  } else if (!msAvoided) {
    austemperingRegime = "MARTENSITIC_SHUNT";
  } else if (transitSpeed > PEARLITE_AVOIDANCE_RATE && isothermalHoldProxy < ISOTHERMAL_STABILITY_THRESHOLD * 0.3) {
    austemperingRegime = "TRANSIT_TO_ISOTHERMAL";
  } else if (overAustemperingRisk > 0.7) {
    austemperingRegime = "OVER_AUSTEMPERED";
  } else if (incompleteReactionRisk > 0.6 && sheafDensity > 0.1) {
    austemperingRegime = "INCOMPLETE_REACTION";
  } else if (bainiteWindow && stageProgress >= STAGE_6_BOUND) {
    austemperingRegime = "FULLY_AUSTEMPERED";
  } else if (bainiteWindow && sheafDensity > 0.3 && stageProgress >= STAGE_4_BOUND) {
    austemperingRegime = tqActivity >= UPPER_BAINITE_MIN
      ? "UPPER_BAINITE_GROWTH" : "LOWER_BAINITE_GROWTH";
  } else if (bainiteWindow && sheafCount > 0) {
    austemperingRegime = "BAINITE_NUCLEATION";
  } else if (bainiteWindow) {
    austemperingRegime = "ISOTHERMAL_HOLD";
  } else {
    austemperingRegime = "AUSTENITIC_HOLD";
  }

  // Verdict.
  let austemperingVerdict: string;
  if (priorPeakDrivingForce < AC3_ACTIVITY_BASE * 0.6) {
    austemperingVerdict = "NO_AUSTEMPERING_DRIVE";
  } else if (austemperingRegime === "PEARLITE_SHUNT") {
    austemperingVerdict = "PEARLITE_SHUNT";
  } else if (austemperingRegime === "MARTENSITIC_SHUNT") {
    austemperingVerdict = "MARTENSITIC_SHUNT";
  } else if (austemperingRegime === "OVER_AUSTEMPERED") {
    austemperingVerdict = "OVER_AUSTEMPERED";
  } else if (austemperingRegime === "INCOMPLETE_REACTION") {
    austemperingVerdict = "INCOMPLETE_REACTION";
  } else if (austemperingRegime === "FULLY_AUSTEMPERED") {
    austemperingVerdict = "FULLY_AUSTEMPERED";
  } else if (austemperingRegime === "UPPER_BAINITE_GROWTH") {
    austemperingVerdict = "UPPER_BAINITE_GROWTH";
  } else if (austemperingRegime === "LOWER_BAINITE_GROWTH") {
    austemperingVerdict = "LOWER_BAINITE_GROWTH";
  } else if (austemperingRegime === "BAINITE_NUCLEATION") {
    austemperingVerdict = "BAINITE_NUCLEATION";
  } else if (austemperingRegime === "ISOTHERMAL_HOLD") {
    austemperingVerdict = "ISOTHERMAL_HOLD";
  } else if (austemperingRegime === "TRANSIT_TO_ISOTHERMAL") {
    austemperingVerdict = "TRANSIT_TO_ISOTHERMAL";
  } else if (austemperingRegime === "AUSTENITIC_HOLD") {
    austemperingVerdict = "AUSTENITIC_HOLD";
  } else {
    austemperingVerdict = "INTERMEDIATE_AUSTEMPERING";
  }

  const topBins = [...binRecs]
    .sort((a, b) => b.austemperingDegree - a.austemperingDegree)
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
    priorPeakDrivingForce: r4(priorPeakDrivingForce),
    tqActivity: r4(tqActivity),
    transitSpeed: r4(transitSpeed),
    pearliteAvoided,
    msAvoided,
    bsCrossed,
    bainiteWindow,
    isothermalHoldProxy: r4(isothermalHoldProxy),
    arrheniusActivation: r4(arrheniusActivation),
    jmaProgress: r4(jmaProg),
    t0Plateau: r4(t0),
    minorityFraction: r4(minorityFraction),
    hypoeutectoidSkew,
    sheafCount,
    subUnitCount,
    avgSubUnitLen: r2(avgSubUnitLen),
    maxSubUnitLen,
    avgSheafSpan: r2(avgSheafSpan),
    maxSheafSpan,
    sheafDensity: r4(sheafDensity),
    acicularityIndex: r4(acicularityIndex),
    upperBainiteFraction: r4(upperFraction),
    lowerBainiteFraction: r4(lowerFraction),
    carbidePartitionCount,
    carbideFraction: r4(carbideFraction),
    retainedAusteniteFraction: r4(retainedAusteniteFraction),
    matrixGrainCount: matrixRuns.length,
    minorityClusterCount: minorityRuns.length,
    reserveCV: r4(reserveCV),
    reserveXFracStdev: r4(reserveXFracStdev),
    bainiteTypeDominant,
    hardnessProxy,
    toughnessProxy,
    distortionProxy,
    overAustemperingRisk: r4(overAustemperingRisk),
    incompleteReactionRisk: r4(incompleteReactionRisk),
    stageProgress: r4(stageProgress),
    dominantStage,
    xMatrixCount,
    yMatrixCount,
    minorityRoleCount,
    austemperingIndex,
    austemperingRegime,
    austemperingVerdict,
    stageDistribution,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Austempering — Doctor ===\n");
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

  const profiles: AustemperingProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeAustempering(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgAustemperingIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.austemperingIndex)))
      : 0,
    avgDrivingForce: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.drivingForce)))
      : 0,
    avgTqActivity: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.tqActivity)))
      : 0,
    avgTransitSpeed: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.transitSpeed)))
      : 0,
    pearliteAvoidedCount: profiles.filter((p) => p.pearliteAvoided === 1).length,
    msAvoidedCount: profiles.filter((p) => p.msAvoided === 1).length,
    bainiteWindowCount: profiles.filter((p) => p.bainiteWindow === 1).length,
    austeniticHoldCount:    profiles.filter((p) => p.austemperingRegime === "AUSTENITIC_HOLD").length,
    transitCount:           profiles.filter((p) => p.austemperingRegime === "TRANSIT_TO_ISOTHERMAL").length,
    isothermalHoldCount:    profiles.filter((p) => p.austemperingRegime === "ISOTHERMAL_HOLD").length,
    bainiteNucleationCount: profiles.filter((p) => p.austemperingRegime === "BAINITE_NUCLEATION").length,
    upperBainiteCount:      profiles.filter((p) => p.austemperingRegime === "UPPER_BAINITE_GROWTH").length,
    lowerBainiteCount:      profiles.filter((p) => p.austemperingRegime === "LOWER_BAINITE_GROWTH").length,
    fullyAustemperedCount:  profiles.filter((p) => p.austemperingRegime === "FULLY_AUSTEMPERED").length,
    overAustemperedCount:   profiles.filter((p) => p.austemperingRegime === "OVER_AUSTEMPERED").length,
    incompleteReactionCount: profiles.filter((p) => p.austemperingRegime === "INCOMPLETE_REACTION").length,
    pearliteShuntCount:     profiles.filter((p) => p.austemperingRegime === "PEARLITE_SHUNT").length,
    martensiticShuntCount:  profiles.filter((p) => p.austemperingRegime === "MARTENSITIC_SHUNT").length,
    noDriveCount:           profiles.filter((p) => p.austemperingRegime === "NO_AUSTEMPERING_DRIVE").length,
    upperTypeDominantCount: profiles.filter((p) => p.bainiteTypeDominant === "UPPER").length,
    lowerTypeDominantCount: profiles.filter((p) => p.bainiteTypeDominant === "LOWER").length,
    mixedTypeDominantCount: profiles.filter((p) => p.bainiteTypeDominant === "MIXED").length,
    avgStageProgress: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.stageProgress)))
      : 0,
    avgSheafDensity: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.sheafDensity)))
      : 0,
    avgAcicularityIndex: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.acicularityIndex)))
      : 0,
    avgIsothermalHoldProxy: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.isothermalHoldProxy)))
      : 0,
    avgJmaProgress: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.jmaProgress)))
      : 0,
    avgHardnessProxy: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.hardnessProxy)))
      : 0,
    avgToughnessProxy: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.toughnessProxy)))
      : 0,
    avgRetainedAusteniteFraction: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.retainedAusteniteFraction)))
      : 0,
    totalSheaves: profiles.reduce((s, p) => s + p.sheafCount, 0),
    totalSubUnits: profiles.reduce((s, p) => s + p.subUnitCount, 0),
    totalCarbideGaps: profiles.reduce((s, p) => s + p.carbidePartitionCount, 0),
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-austempering").description("HODLMM bin austempering / isothermal-bainite-formation analyzer (pearlite-nose avoidance, Ms-avoidance, isothermal hold in bainite window, sheaf and sub-unit detection, upper/lower bainite classification, carbide-partition signatures)");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin austempering state")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
