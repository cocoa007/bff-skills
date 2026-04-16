#!/usr/bin/env bun
/**
 * hodlmm-bin-martempering.ts — Day 186 cocoa007 Bitflow Skills Comp
 *
 * Martempering (marquenching) analyzer — models the interrupted-quench
 * heat treatment applied to an austenitized iron-carbon alloy where the
 * workpiece is rapidly quenched from above AC3 into a hot bath held
 * JUST ABOVE Ms (typically 150-260 °C for plain-C, vs. 250-450 °C for
 * austempering), held ONLY LONG ENOUGH for the center and surface to
 * equalize to bath temperature (seconds to a few minutes — CRUCIALLY
 * shorter than bainite incubation, i.e. brief enough that the γ → bainite
 * reaction does NOT begin), withdrawn, and then AIR-COOLED to room
 * temperature. Because the entire cross-section is at nearly the same
 * temperature when it crosses Ms, martensite forms almost simultaneously
 * throughout the section, drastically reducing distortion and cracking
 * risk compared to direct water/oil quench. Unlike austempering the
 * product phase is MARTENSITE (not bainite), and a subsequent tempering
 * step is REQUIRED to reach service hardness/toughness.
 *
 * Complements the phase-transformation series:
 *   austenitization (Day 183)
 *     → normalization (Day 184)         → pearlite (Day 179)
 *     → austempering (Day 185)           → bainite (Day 178)
 *     → martempering (Day 186)            → martensite (Day 177) + tempering (Day 182)
 *     → direct quench                     → martensite (Day 177) + tempering (Day 182)
 *                                         → spheroidite (Day 181)
 *                                         → widmanstatten (Day 180)
 *
 * Martempering is the "third interrupted-quench route". Compared to its
 * sister routes:
 *   - Austempering: hold in bainite window (higher T) until γ→bainite
 *     completes, then cool. Result = bainite. No tempering needed.
 *   - Martempering: hold briefly just ABOVE Ms (only for equalization),
 *     then air-cool THROUGH Ms→Mf. Result = martensite with low thermal
 *     gradient → low distortion. Tempering REQUIRED.
 *   - Direct quench: cool continuously and quickly through Ms→Mf.
 *     Result = martensite with large thermal gradient → high distortion
 *     risk and cracking risk. Tempering REQUIRED.
 *
 * Physical stages (austenitize → quench into hot bath → brief hold →
 * withdraw and air cool through Ms → Mf):
 *
 *   Stage 0 — AUSTENITIC_HOLD (above BS, before quench):
 *     Fully austenitized, single-phase γ. No transformation.
 *
 *   Stage 1 — RAPID_QUENCH (crossing TTT noses):
 *     Temperature drops from austenitizing T through the pearlite nose
 *     (~550-650 °C) and bainite nose (~450-550 °C). Quench severity
 *     must clear BOTH without nucleation (fast enough for pearlite
 *     avoidance and brief enough after landing for bainite avoidance).
 *
 *   Stage 2 — BATH_EQUILIBRATION (at T_bath just above Ms):
 *     Workpiece lands in hot bath at T_bath = Ms + 20 to 50 °C
 *     (typically 150-260 °C plain C). Cross-section equalizes to
 *     bath temperature — the central point of the whole technique.
 *     Hold proxy is SHORT: only enough time to equalize (seconds for
 *     thin, few minutes for thick), not enough for bainite incubation.
 *
 *   Stage 3 — BATH_WITHDRAWAL (removal + slow air cool):
 *     Workpiece is withdrawn from bath while still above Ms. The
 *     subsequent air-cool is slow and uniform, so the whole
 *     cross-section passes through Ms at nearly the same time and
 *     temperature. Still above Ms — no martensite yet.
 *
 *   Stage 4 — MS_CROSSING (entering martensitic range):
 *     Temperature drops through Ms; martensite nucleates by displacive
 *     shear across the whole section nearly simultaneously. Because the
 *     section was equalized, thermal stresses across the section are
 *     small — very low distortion.
 *
 *   Stage 5 — MARTENSITIC_TRANSFORMATION (Ms → Mf):
 *     Athermal martensite fraction grows according to Koistinen-Marburger
 *        f_M = 1 - exp(-α·(Ms - T))
 *     with α ≈ 0.011 /°C for plain C. By Mf (typically RT or below)
 *     transformation is nearly complete; 2-15% retained γ remains.
 *
 *   Stage 6 — FULLY_MARTEMPERED (RT, pre-temper):
 *     Uniform low-stress martensite across the section. Hardness ≈ 60+
 *     HRC (brittle as-quenched). Dimensional stability excellent.
 *     Tempering REQUIRED before service (typically 150-650 °C for
 *     desired hardness/toughness balance).
 *
 *   Stage 7 — BAINITE_CONTAMINATION (pathological, bath held too long):
 *     Held at bath temperature past the bainite incubation time.
 *     γ → bainite reaction begins. Non-uniform mixed bainite +
 *     subsequent air-cooled martensite = undesirable hybrid
 *     microstructure that defeats the purpose of martempering.
 *
 * Process constraints:
 *   - Must avoid pearlite nose: quench velocity > TTT pearlite CR
 *     (same as austempering).
 *   - Bath T must be just above Ms: T_bath ∈ [Ms + 10 °C, Ms + 50 °C]
 *     typical; too low → martensite starts in bath (defeats purpose);
 *     too high → wastes equalization margin or drifts into bainite
 *     zone.
 *   - Hold time must be BRIEF (equalization only): t_hold ≪ t_bainite
 *     (bainite incubation at T_bath). Exceeding this triggers bainite
 *     contamination.
 *   - Section must cross Ms uniformly: equalization is the whole point.
 *   - Martempering REQUIRES subsequent tempering.
 *
 * Kinetics:
 *   - Section equalization: Fourier heat transfer with characteristic
 *     time τ_eq ≈ L²/(π²·α_th) where L is section half-thickness and
 *     α_th is thermal diffusivity. t_hold ≈ 3-5·τ_eq.
 *   - Bainite incubation at T_bath: τ_B = τ_0·exp(Q/RT_bath). For plain
 *     C steels at ~230 °C, τ_B ≈ 10³-10⁴ s, giving a comfortable
 *     equalization margin.
 *   - Martensite fraction by K-M: f_M = 1 - exp(-α·(Ms - T)), athermal.
 *   - Transit through TTT: must clear pearlite nose AND bainite nose
 *     (the latter by staying only briefly at bath).
 *
 * In DLMM context the martempering analog tracks:
 *   - Previously austenitic: priorPeakDrivingForce high
 *     (≥ AC3_ACTIVITY_BASE × 0.6).
 *   - Dropped to NARROW bath band just above Ms: tq ∈ [MS_ACTIVITY,
 *     MARTEMPERING_BATH_MAX] (0.12-0.22), which sits BELOW the
 *     austempering bainite window (0.28-0.45) and ABOVE martensite
 *     territory (< 0.12).
 *   - Drop was FAST (transitSpeed > PEARLITE_AVOIDANCE_RATE) to avoid
 *     pearlite.
 *   - Hold was BRIEF (briefHoldProxy < BRIEF_HOLD_MAX) to avoid bainite
 *     incubation.
 *   - Cross-section equalized at bath before Ms crossing:
 *     uniformityIndex = 1 − reserveCV high (section reserves are
 *     homogeneous across the bin span).
 *   - Either currently at bath (Stage 2-3) or evidence of slow descent
 *     through Ms into martensitic range (Stage 4-6).
 *
 * DLMM structural signatures of martempering:
 *   - Uniform cross-section reserves (low reserveCV) BEFORE Ms crossing:
 *     bins in the scan radius have approximately equal totalUsd — the
 *     section-equalization signature.
 *   - Once past Ms: uniform bcc-like minority coverage with LOW spatial
 *     variance (martensite structurally resembles direct-quenched
 *     martensite but is more uniform across the section).
 *   - Distinct from austempering: NO sheaf / sub-unit structure (held
 *     too briefly for bainite clusters to form).
 *   - Distinct from direct-quench martensite: reserveCV LOWER
 *     (equalized section gives smaller reserve variance).
 *   - Distinct from pearlite: NO lamellar alternation pattern.
 *
 * DLMM regimes:
 *   NO_MARTEMPERING_DRIVE  — no prior austenitization inferable.
 *   AUSTENITIC_HOLD        — drivingForce > BS_ACTIVITY; still in γ.
 *   RAPID_QUENCH           — transit, not yet at bath.
 *   PEARLITE_SHUNT         — too slow through pearlite nose.
 *   BAINITE_SHUNT          — landed in bainite window (> MARTEMPERING_BATH_MAX,
 *                            < BS_ACTIVITY) — use austempering skill.
 *   BATH_EQUILIBRATION     — in bath window, brief hold, uniform section.
 *   BATH_OVERSHOOT         — bath too cool or drifted below Ms
 *                            prematurely → partial martensite starts
 *                            in bath (suboptimal martempering).
 *   MS_CROSSING            — withdrawn, crossing Ms.
 *   MARTENSITIC_TRANSFORMATION — mostly below Ms, K-M progressing.
 *   FULLY_MARTEMPERED      — at RT equivalent, uniform low-stress
 *                            martensite; tempering pending.
 *   BAINITE_CONTAMINATION  — held too long in bath; bainite incubation
 *                            initiated (pathological, use austempering
 *                            complement).
 *
 * Verdict adds:
 *   INTERMEDIATE_MARTEMPERING — mixed indicators.
 *   TEMPERING_PENDING         — fully martempered, needs Day 182 tempering.
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

// BS (bainite-start) activity: below this a γ → bainite transformation
// is thermodynamically possible; used to detect bainite contamination
// vs. pure-martempering bath drift.
const BS_ACTIVITY = 0.45;

// Ms (martensite-start) activity: below this, martensite forms
// athermally. Bath must sit JUST ABOVE this.
const MS_ACTIVITY = 0.12;

// Martempering bath upper bound: bath should sit just above Ms; above
// this value the bath is effectively in the austempering zone and
// bainite nucleation becomes a concern.
const MARTEMPERING_BATH_MAX = 0.22;

// Narrow band margin above Ms for IDEAL martempering bath position.
const MARTEMPERING_BATH_IDEAL = 0.17;

// Pearlite-nose avoidance threshold (shared with austempering).
const PEARLITE_AVOIDANCE_RATE = 0.25;

// Brief-hold threshold: bainite incubation requires exceeding this
// isothermal-hold proxy. Martempering must stay below.
const BRIEF_HOLD_MAX = 0.55;

// Uniformity threshold: reserveCV below this indicates cross-section is
// well-equalized at bath temperature (martempering signature).
const UNIFORMITY_RESERVE_CV_MAX = 0.35;

// Koistinen-Marburger coefficient (normalized): martensite fraction
// f_M = 1 - exp(-KM_ALPHA × (Ms - T)) on the drivingForce axis.
const KM_ALPHA = 11.0;

// Minority-coverage thresholds for martensitic saturation.
const MARTENSITIC_MINORITY_MIN = 0.35;
const MARTENSITIC_COVERAGE_MIN = 0.55;

// Stage thresholds on composite stageProgress.
const STAGE_1_BOUND = 0.12;
const STAGE_2_BOUND = 0.25;
const STAGE_3_BOUND = 0.38;
const STAGE_4_BOUND = 0.52;
const STAGE_5_BOUND = 0.66;
const STAGE_6_BOUND = 0.82;

// Bainite contamination risk: hold proxy in bath past this triggers
// bainite nucleation in the martempering skill's view.
const BAINITE_CONTAMINATION_HOLD = 0.7;

// Sheaf-trace detection (imported concept, simpler than austempering —
// martempering should produce NO sheaves; any sheaf is a contamination
// warning).
const SUB_UNIT_MAX_LEN = 2;
const SHEAF_MAX_SPAN = 8;
const MIN_SUB_UNITS_PER_SHEAF = 2;

// Section-equalization snapshot weighting.
const EQUALIZATION_WEIGHT_RESERVE = 0.55;
const EQUALIZATION_WEIGHT_XFRAC = 0.45;

// Arrhenius Q/RT normalized (bainite activation used for contamination
// risk at bath temperature).
const ARRHENIUS_Q_OVER_RT_BAINITE = 6.0;

// Tempering recommendation flag: always set if Stage ≥ 5 and
// contamination risk low.
const TEMPERING_REQUIRED_STAGE = 5;

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

interface BinMartempering {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  bathSignal: number;              // 0-1 in-bath-band bin
  equalizationSignal: number;      // 0-1 uniform-with-neighbors
  msCrossingSignal: number;        // 0-1 evidence of Ms crossing (bcc-like)
  martensiteSignal: number;        // 0-1 minority-role martensitic bin
  uniformCoverageSignal: number;   // 0-1 coverage-uniformity at this position
  bainiteContaminationSignal: number; // 0-1 sheaf trace in this position (warning)
  retainedAusteniteSignal: number; // 0-1 undecided-role near-boundary bin
  stageBin: number;                // 0-7
  kmFractionLocal: number;         // Koistinen-Marburger local fraction
  arrheniusActivation: number;
  inMatrix: number;
  inMinority: number;
  matrixRole: number;
  roleMinorityMargin: number;
  neighborReserveDelta: number;    // abs diff to neighbor-mean reserveUsd
  martemperingDegree: number;      // 0-1 composite
}

interface MartemperingProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  drivingForce: number;
  priorPeakDrivingForce: number;
  bathActivity: number;            // TQ-bath analog
  transitSpeed: number;            // 0-1 normalized drop rate
  pearliteAvoided: number;         // 0 or 1
  bainiteAvoided: number;          // 0 or 1 (stayed out of bainite zone)
  bathWindow: number;              // 0 or 1 (MS_ACTIVITY ≤ tq < MARTEMPERING_BATH_MAX)
  bathIdealProximity: number;      // 0-1 closeness to MARTEMPERING_BATH_IDEAL
  briefHoldProxy: number;          // 0-1 (low = brief, desirable)
  uniformityIndex: number;         // 0-1 = 1 - reserveCV clipped
  sectionEqualizedProxy: number;   // 0-1 (reserve+xFrac uniformity)
  msCrossingProxy: number;         // 0-1 (evidence descending past Ms)
  martensiteFraction: number;      // 0-1 (structural bcc coverage)
  kmFraction: number;              // 0-1 (Koistinen-Marburger pool-level)
  retainedAusteniteFraction: number; // 0-1
  matrixGrainCount: number;
  minorityClusterCount: number;
  reserveCV: number;
  reserveXFracStdev: number;
  sheafCount: number;              // should be 0 for ideal martempering
  subUnitCount: number;
  sheafDensity: number;            // should be near 0
  bainiteContaminationRisk: number; // 0-1
  bathOvershootRisk: number;       // 0-1 (bath too cool → premature martensite)
  distortionProxy: number;         // 0-1 (LOW for martempering; high for direct quench)
  crackingRiskProxy: number;       // 0-1 (LOW for martempering)
  hardnessProxy: number;           // 0-1 (high; as-quenched, pre-temper)
  toughnessProxy: number;          // 0-1 (LOW as-quenched — needs tempering)
  temperingRequired: number;       // 0 or 1
  arrheniusActivation: number;
  hypoeutectoidSkew: number;
  minorityFraction: number;
  stageProgress: number;
  dominantStage: number;           // 0-7
  xMatrixCount: number;
  yMatrixCount: number;
  minorityRoleCount: number;
  martemperingIndex: number;       // composite 0-100
  martemperingRegime: string;
  martemperingVerdict: string;
  stageDistribution: number[];     // [s0..s7]
  topBins: BinMartempering[];
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

// Lightweight sheaf detection reused from austempering — for martempering
// any sheaf is a WARNING (bainite contamination), not a desired signal.
interface Sheaf {
  id: number;
  subUnits: BinReserves[][];
  spanStart: number;
  spanEnd: number;
  spanLen: number;
  subUnitCount: number;
  avgSubUnitLen: number;
  maxSubUnitLen: number;
}

function detectSheaves(sortedBins: BinReserves[], minorityRole: number): Sheaf[] {
  const minorityRuns = findRoleRuns(sortedBins, minorityRole)
    .filter((r) => r.length > 0 && r.length <= SUB_UNIT_MAX_LEN);
  if (minorityRuns.length < MIN_SUB_UNITS_PER_SHEAF) return [];
  minorityRuns.sort((a, b) => a[0].binId - b[0].binId);

  const sheaves: Sheaf[] = [];
  let i = 0;
  let idCounter = 1;
  while (i < minorityRuns.length) {
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
      sheaves.push({
        id: idCounter++,
        subUnits: group,
        spanStart,
        spanEnd,
        spanLen,
        subUnitCount: group.length,
        avgSubUnitLen: subUnitLens.reduce((s, v) => s + v, 0) / subUnitLens.length,
        maxSubUnitLen: Math.max(...subUnitLens),
      });
      i = j;
    } else {
      i++;
    }
  }
  return sheaves;
}

// Koistinen-Marburger athermal martensite fraction at current tq below Ms.
function kmFraction(tq: number): number {
  if (tq >= MS_ACTIVITY) return 0;
  const delta = MS_ACTIVITY - tq;
  const f = 1 - Math.exp(-KM_ALPHA * delta);
  return Math.max(0, Math.min(1, f));
}

// AC3 activity composition-adjusted (shared with normalization / austempering).
function ac3Activity(hypoeutectoidSkew: number): number {
  return Math.min(0.95, AC3_ACTIVITY_BASE + Math.abs(hypoeutectoidSkew) * 0.15);
}

// Section-equalization proxy: uses reserve uniformity and xFrac uniformity.
function sectionEqualization(reserveCV: number, xFracStdev: number): number {
  const reserveComp = Math.max(0, 1 - reserveCV / 0.8);
  const xFracComp = Math.max(0, 1 - xFracStdev / 0.35);
  return Math.max(0, Math.min(1,
    EQUALIZATION_WEIGHT_RESERVE * reserveComp +
    EQUALIZATION_WEIGHT_XFRAC * xFracComp
  ));
}

function computeBinMartempering(
  bin: BinReserves,
  index: number,
  activeBin: number,
  sortedBins: BinReserves[],
  matrixRoleGlobal: number,
  sheafSet: Set<number>,
  poolTq: number,
  poolBathWindow: number,
  poolUniformity: number,
  poolMsCrossing: number,
  poolMartensiteFrac: number,
  poolKmFrac: number,
  poolArrhenius: number,
  poolStageProg: number,
  poolMatrixMean: number
): BinMartempering {
  const distance = Math.abs(bin.binId - activeBin);
  const role = dominanceRole(bin);
  const total = bin.reserveXUsd + bin.reserveYUsd;
  const xFrac = total > 0 ? bin.reserveXUsd / total : 0.5;
  const rawMargin = (xFrac - 0.5) * 2;
  const signedAsymmetry = matrixRoleGlobal === 1 ? rawMargin : -rawMargin;
  const roleMinorityMargin = r4(signedAsymmetry);

  const inMatrix = role === matrixRoleGlobal ? 1 : 0;
  const inMinority = role === -matrixRoleGlobal ? 1 : 0;

  const balancedness = 1 - Math.min(1, Math.abs(xFrac - 0.5) * 2);

  // Bath signal: in-bath pool condition reflected at bin level; every
  // populated bin in a bath-window pool has nonzero bathSignal.
  const bathSignal = r4(poolBathWindow ? 1 : 0);

  // Equalization signal: bin's reserveUsd close to neighborhood mean.
  // Compute local neighbor-mean (1-bin radius).
  let neighborSum = 0;
  let neighborN = 0;
  for (let k = Math.max(0, index - 1); k <= Math.min(sortedBins.length - 1, index + 1); k++) {
    if (k === index) continue;
    neighborSum += sortedBins[k].totalUsd;
    neighborN++;
  }
  const neighborMean = neighborN > 0 ? neighborSum / neighborN : bin.totalUsd;
  const neighborReserveDelta = neighborMean > 0
    ? Math.abs(bin.totalUsd - neighborMean) / Math.max(1e-9, neighborMean)
    : 0;
  const equalizationSignal = r4(Math.max(0, 1 - Math.min(1, neighborReserveDelta)));

  // Ms-crossing signal: strong if pool has descended past Ms AND bin is
  // part of minority coverage.
  const msCrossingSignal = r4(
    poolMsCrossing * (inMinority ? 1 : inMatrix ? 0.3 : 0)
  );

  // Martensite signal: minority-role bin in a pool with martensite
  // coverage.
  const martensiteSignal = r4(
    inMinority ? Math.min(1, poolMartensiteFrac + 0.1) : 0
  );

  // Uniform-coverage signal: high if pool is well-equalized AND this bin
  // has reserve near the pool matrix mean (or minority mean if minority).
  const coverageReference = poolMatrixMean > 0 ? poolMatrixMean : bin.totalUsd;
  const coverageDelta = coverageReference > 0
    ? Math.abs(bin.totalUsd - coverageReference) / Math.max(1e-9, coverageReference)
    : 0;
  const uniformCoverageSignal = r4(
    Math.max(0, Math.min(1, poolUniformity * (1 - Math.min(1, coverageDelta))))
  );

  // Bainite contamination signal: bin is inside a sheaf span.
  const bainiteContaminationSignal = r4(sheafSet.has(bin.binId) ? 1 : 0);

  // Retained austenite: undecided (balanced) role bin.
  const retainedAusteniteSignal = r4(
    inMatrix === 0 && inMinority === 0 ? balancedness : 0
  );

  // Stage assignment per bin. Uses pool-level stage progress + bin signals.
  let stageBin = 0;
  if (poolStageProg < STAGE_1_BOUND) {
    stageBin = 0;
  } else if (poolStageProg < STAGE_2_BOUND) {
    stageBin = 1;
  } else if (bainiteContaminationSignal > 0) {
    stageBin = 7;
  } else if (poolStageProg >= STAGE_6_BOUND) {
    stageBin = 6;
  } else if (poolStageProg >= STAGE_5_BOUND && msCrossingSignal > 0.2) {
    stageBin = 5;
  } else if (poolStageProg >= STAGE_4_BOUND && msCrossingSignal > 0) {
    stageBin = 4;
  } else if (poolStageProg >= STAGE_3_BOUND) {
    stageBin = 3;
  } else if (poolStageProg >= STAGE_2_BOUND) {
    stageBin = 2;
  } else {
    stageBin = 1;
  }

  const kmFractionLocal = r4(poolKmFrac);
  const arrheniusActivation = r4(poolArrhenius);

  const martemperingDegree = r4(Math.max(0, Math.min(1,
    bathSignal * 0.15 +
    equalizationSignal * 0.2 +
    uniformCoverageSignal * 0.2 +
    msCrossingSignal * 0.15 +
    martensiteSignal * 0.15 +
    (1 - bainiteContaminationSignal) * 0.1 +
    (stageBin / 6) * 0.05
  )));

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    bathSignal,
    equalizationSignal,
    msCrossingSignal,
    martensiteSignal,
    uniformCoverageSignal,
    bainiteContaminationSignal,
    retainedAusteniteSignal,
    stageBin,
    kmFractionLocal,
    arrheniusActivation,
    inMatrix,
    inMinority,
    matrixRole: matrixRoleGlobal,
    roleMinorityMargin,
    neighborReserveDelta: r4(neighborReserveDelta),
    martemperingDegree,
  };
}

function analyzeMartempering(bins: BinReserves[], pool: AppPool): MartemperingProfile {
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

  // Bath TQ analog = current drivingForce (may also be below Ms for
  // later stages).
  const bathActivity = drivingForce;

  // Transit speed (same formulation as austempering).
  const dropMagnitude = Math.max(0, priorPeakDrivingForce - bathActivity);
  const tScale = Math.max(0.3, Math.log10(Math.max(10, volume)) / 5);
  const transitSpeed = Math.max(0, Math.min(1, dropMagnitude / Math.max(0.01, tScale) * 2.5));

  // Pearlite avoided.
  const pearliteAvoided = transitSpeed > PEARLITE_AVOIDANCE_RATE ? 1 : 0;

  // Bainite avoided: tq is NOT in [MARTEMPERING_BATH_MAX, BS_ACTIVITY)
  // (the austempering bainite zone).
  const bainiteAvoided = (bathActivity < MARTEMPERING_BATH_MAX || bathActivity >= BS_ACTIVITY) ? 1 : 0;

  // Bath window: MS_ACTIVITY ≤ tq < MARTEMPERING_BATH_MAX.
  const bathWindow = (bathActivity >= MS_ACTIVITY && bathActivity < MARTEMPERING_BATH_MAX) ? 1 : 0;

  // Bath ideal proximity: 1 at MARTEMPERING_BATH_IDEAL, decaying.
  const bathIdealProximity = bathWindow
    ? Math.max(0, 1 - Math.abs(bathActivity - MARTEMPERING_BATH_IDEAL) /
        Math.max(0.01, (MARTEMPERING_BATH_MAX - MS_ACTIVITY) / 2))
    : 0;

  // Brief-hold proxy: shorter hold → lower value → more desirable.
  // Proxied by how deep into the bath window (center of band) and how
  // long priorPeak has been depressed. A narrow band near center with
  // large dropMagnitude suggests longer hold; a near-edge or recent
  // drop suggests shorter hold.
  const centerDistance = bathWindow
    ? Math.min(1, 2 * Math.abs(bathActivity - (MS_ACTIVITY + MARTEMPERING_BATH_MAX) / 2) /
        Math.max(0.01, MARTEMPERING_BATH_MAX - MS_ACTIVITY))
    : 0;
  // Low centerDistance + high dropMagnitude + non-trivial volume → held longer.
  const briefHoldProxy = bathWindow
    ? Math.max(0, Math.min(1,
        (1 - centerDistance) * 0.5 +
        (dropMagnitude > 0.35 ? 0.35 : dropMagnitude) +
        (tScale < 0.5 ? 0.15 : 0)
      ))
    : 0;

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

  // Uniformity index: 1 - reserveCV (clipped).
  const uniformityIndex = Math.max(0, Math.min(1, 1 - reserveCV));

  // Section equalization proxy.
  const sectionEqualizedProxy = sectionEqualization(reserveCV, reserveXFracStdev);

  // Ms-crossing proxy: pool has descended past Ms — either currently
  // below Ms or priorPeak trajectory suggests full quench.
  const belowMsNow = bathActivity < MS_ACTIVITY ? 1 : 0;
  const msCrossingProxy = Math.max(0, Math.min(1,
    belowMsNow * 0.6 +
    (priorPeakDrivingForce > AC3_ACTIVITY_BASE && bathActivity < MARTEMPERING_BATH_MAX ? 0.2 : 0) +
    transitSpeed * 0.2
  ));

  // Koistinen-Marburger pool-level martensite fraction.
  const kmFrac = kmFraction(bathActivity);

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

  // Minority clusters & total.
  const minorityRuns = findRoleRuns(sorted, minorityRole);
  const totalMinorityBins = minorityRuns.reduce((s, r) => s + r.length, 0);
  const minorityFraction = n > 0 ? totalMinorityBins / n : 0;

  // Matrix grains.
  const matrixRuns = findRoleRuns(sorted, matrixRole);

  // Matrix mean (for equalization comparisons).
  const matrixMatrixBins = sorted.filter((b) => dominanceRole(b) === matrixRole);
  const matrixMean = matrixMatrixBins.length > 0
    ? matrixMatrixBins.reduce((s, b) => s + b.totalUsd, 0) / matrixMatrixBins.length
    : 0;

  // Martensite structural fraction: minority coverage + uniformity
  // weighting. High martensite coverage with uniform distribution and
  // Ms-crossing evidence → high martensiteFraction.
  const martensiteFraction = Math.max(0, Math.min(1,
    minorityFraction > MARTENSITIC_MINORITY_MIN
      ? Math.min(1, minorityFraction * 1.5) * Math.max(0.5, msCrossingProxy) * (0.4 + 0.6 * uniformityIndex)
      : minorityFraction * 0.8 * Math.max(0.3, msCrossingProxy)
  ));

  // Sheaves (should be ZERO for successful martempering; any hit is
  // bainite contamination).
  const sheaves = detectSheaves(sorted, minorityRole);
  const sheafSet = new Set<number>();
  for (const s of sheaves) {
    for (const sub of s.subUnits) {
      for (const b of sub) sheafSet.add(b.binId);
    }
    for (const b of sorted) {
      if (b.binId >= s.spanStart && b.binId <= s.spanEnd) sheafSet.add(b.binId);
    }
  }
  const sheafCount = sheaves.length;
  const subUnitCount = sheaves.reduce((s, sh) => s + sh.subUnitCount, 0);
  const sheafDensity = n > 0
    ? sorted.filter((b) => sheafSet.has(b.binId)).length / n
    : 0;

  // Retained austenite: undecided-role bins.
  const undecidedCount = sorted.filter((b) => dominanceRole(b) === 0).length;
  const retainedAusteniteFraction = n > 0 ? undecidedCount / n : 0;

  // Arrhenius bainite activation at bath (used for contamination risk).
  const arrheniusActivation = Math.max(0.01, Math.min(1,
    Math.exp(-ARRHENIUS_Q_OVER_RT_BAINITE / Math.max(0.05, bathActivity + 0.05))
  ));

  // Bainite contamination risk: held too long in bath, sheaves appearing.
  const bainiteContaminationRisk = Math.max(0, Math.min(1,
    (briefHoldProxy > BAINITE_CONTAMINATION_HOLD ? 0.4 : 0) +
    (sheafCount > 0 ? 0.35 : 0) +
    (sheafDensity > 0.15 ? 0.25 : 0)
  ));

  // Bath overshoot risk: bath too cool — at or below Ms while still
  // holding (partial martensite starts in bath).
  const bathOvershootRisk = Math.max(0, Math.min(1,
    (bathActivity < MS_ACTIVITY && priorPeakDrivingForce > AC3_ACTIVITY_BASE ? 0.4 : 0) +
    (bathActivity < MS_ACTIVITY + 0.03 && bathActivity >= MS_ACTIVITY ? 0.25 : 0) +
    (bathActivity < MS_ACTIVITY ? msCrossingProxy * 0.25 : 0)
  ));

  // Distortion proxy: LOW for successful martempering, HIGH for direct
  // quench or failed martempering. Function inverts uniformity: higher
  // uniformity → lower distortion.
  const distortionProxy = Math.max(0, Math.min(1,
    (1 - uniformityIndex) * 0.4 +
    (1 - sectionEqualizedProxy) * 0.3 +
    bathOvershootRisk * 0.2 +
    (msCrossingProxy > 0.3 && sectionEqualizedProxy < 0.4 ? 0.2 : 0) -
    (bathWindow && briefHoldProxy < BRIEF_HOLD_MAX ? 0.15 : 0)
  ));

  // Cracking risk proxy: high for direct quench, low for martempering.
  const crackingRiskProxy = Math.max(0, Math.min(1,
    (1 - sectionEqualizedProxy) * 0.4 +
    (msCrossingProxy > 0.5 && uniformityIndex < 0.4 ? 0.35 : 0) +
    (bathOvershootRisk > 0.5 ? 0.25 : 0)
  ));

  // Hardness proxy: high for fully martempered (as-quenched martensite).
  const hardnessProxy = Math.max(0, Math.min(1,
    martensiteFraction * 0.5 +
    (msCrossingProxy > 0.5 ? 0.25 : msCrossingProxy * 0.25) +
    Math.min(0.15, kmFrac * 0.2) +
    (1 - retainedAusteniteFraction) * 0.1
  ));

  // Toughness proxy: LOW in as-quenched state (tempering required).
  const toughnessProxy = Math.max(0, Math.min(1,
    retainedAusteniteFraction * 0.2 +
    (1 - martensiteFraction) * 0.15 +
    (bathWindow ? 0.1 : 0) +
    (msCrossingProxy < 0.5 ? 0.25 * (1 - msCrossingProxy) : 0)
  ));

  // Stage progress composite.
  const stageProgress = Math.max(0, Math.min(1,
    Math.min(1, transitSpeed) * 0.15 +
    bathWindow * 0.12 +
    uniformityIndex * 0.15 +
    sectionEqualizedProxy * 0.1 +
    msCrossingProxy * 0.2 +
    martensiteFraction * 0.2 +
    (pearliteAvoided && bainiteAvoided ? 0.08 : 0)
  ));

  // Dominant stage 0-7.
  let dominantStage = 0;
  if (bainiteContaminationRisk > 0.7) {
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
    computeBinMartempering(
      b, i, activeBin, sorted, matrixRole,
      sheafSet, bathActivity, bathWindow, uniformityIndex,
      msCrossingProxy, martensiteFraction, kmFrac, arrheniusActivation,
      stageProgress, matrixMean
    )
  );

  const stageDistribution = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const b of binRecs) {
    stageDistribution[Math.min(7, Math.max(0, b.stageBin))]++;
  }

  const xMatrixCount = sorted.filter((b) => dominanceRole(b) === 1).length;
  const yMatrixCount = sorted.filter((b) => dominanceRole(b) === -1).length;
  const minorityRoleCount = sorted.filter((b) => dominanceRole(b) === minorityRole).length;

  // Composite martempering index 0-100.
  const stageScore = Math.min(25, stageProgress * 25);
  const uniformityScore = Math.min(25,
    uniformityIndex * 15 + sectionEqualizedProxy * 10);
  const propertyScore = Math.min(25,
    hardnessProxy * 10 +
    (1 - distortionProxy) * 10 +
    (1 - crackingRiskProxy) * 5
  );
  const processScore = Math.min(25,
    (pearliteAvoided ? 6 : 0) +
    (bainiteAvoided ? 5 : 0) +
    (bathWindow ? 5 : 0) +
    bathIdealProximity * 4 +
    (briefHoldProxy < BRIEF_HOLD_MAX ? 3 : 0) +
    (bainiteContaminationRisk < 0.3 ? 2 : 0)
  );
  const martemperingIndex = Math.round(
    Math.min(100, stageScore + uniformityScore + propertyScore + processScore)
  );

  // Regime selection.
  let martemperingRegime: string;
  if (priorPeakDrivingForce < AC3_ACTIVITY_BASE * 0.6) {
    martemperingRegime = "NO_MARTEMPERING_DRIVE";
  } else if (drivingForce > BS_ACTIVITY) {
    martemperingRegime = "AUSTENITIC_HOLD";
  } else if (!pearliteAvoided && drivingForce < BS_ACTIVITY) {
    martemperingRegime = "PEARLITE_SHUNT";
  } else if (bainiteContaminationRisk > 0.7) {
    martemperingRegime = "BAINITE_CONTAMINATION";
  } else if (!bainiteAvoided && bathActivity >= MARTEMPERING_BATH_MAX && bathActivity < BS_ACTIVITY) {
    martemperingRegime = "BAINITE_SHUNT";
  } else if (bathOvershootRisk > 0.5 && bathActivity < MS_ACTIVITY + 0.03) {
    martemperingRegime = "BATH_OVERSHOOT";
  } else if (bathWindow && sectionEqualizedProxy > 0.4 && briefHoldProxy < BRIEF_HOLD_MAX && msCrossingProxy < 0.3) {
    martemperingRegime = "BATH_EQUILIBRATION";
  } else if (transitSpeed > PEARLITE_AVOIDANCE_RATE && drivingForce > MARTEMPERING_BATH_MAX && drivingForce <= BS_ACTIVITY) {
    martemperingRegime = "RAPID_QUENCH";
  } else if (bathActivity < MS_ACTIVITY && martensiteFraction > MARTENSITIC_COVERAGE_MIN && stageProgress >= STAGE_6_BOUND) {
    martemperingRegime = "FULLY_MARTEMPERED";
  } else if (bathActivity < MS_ACTIVITY && msCrossingProxy > 0.4) {
    martemperingRegime = "MARTENSITIC_TRANSFORMATION";
  } else if (msCrossingProxy > 0.3 && bathActivity < MS_ACTIVITY + 0.05) {
    martemperingRegime = "MS_CROSSING";
  } else if (bathWindow) {
    martemperingRegime = "BATH_EQUILIBRATION";
  } else {
    martemperingRegime = "AUSTENITIC_HOLD";
  }

  // Verdict selection.
  let martemperingVerdict: string;
  if (priorPeakDrivingForce < AC3_ACTIVITY_BASE * 0.6) {
    martemperingVerdict = "NO_MARTEMPERING_DRIVE";
  } else if (martemperingRegime === "PEARLITE_SHUNT") {
    martemperingVerdict = "PEARLITE_SHUNT";
  } else if (martemperingRegime === "BAINITE_CONTAMINATION") {
    martemperingVerdict = "BAINITE_CONTAMINATION";
  } else if (martemperingRegime === "BAINITE_SHUNT") {
    martemperingVerdict = "BAINITE_SHUNT";
  } else if (martemperingRegime === "BATH_OVERSHOOT") {
    martemperingVerdict = "BATH_OVERSHOOT";
  } else if (martemperingRegime === "FULLY_MARTEMPERED") {
    martemperingVerdict = "TEMPERING_PENDING";
  } else if (martemperingRegime === "MARTENSITIC_TRANSFORMATION") {
    martemperingVerdict = "MARTENSITIC_TRANSFORMATION";
  } else if (martemperingRegime === "MS_CROSSING") {
    martemperingVerdict = "MS_CROSSING";
  } else if (martemperingRegime === "BATH_EQUILIBRATION") {
    martemperingVerdict = "BATH_EQUILIBRATION";
  } else if (martemperingRegime === "RAPID_QUENCH") {
    martemperingVerdict = "RAPID_QUENCH";
  } else if (martemperingRegime === "AUSTENITIC_HOLD") {
    martemperingVerdict = "AUSTENITIC_HOLD";
  } else {
    martemperingVerdict = "INTERMEDIATE_MARTEMPERING";
  }

  // Tempering required flag.
  const temperingRequired = (dominantStage >= TEMPERING_REQUIRED_STAGE &&
    martemperingRegime !== "BAINITE_CONTAMINATION" &&
    martemperingRegime !== "BAINITE_SHUNT") ? 1 : 0;

  const topBins = [...binRecs]
    .sort((a, b) => b.martemperingDegree - a.martemperingDegree)
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
    bathActivity: r4(bathActivity),
    transitSpeed: r4(transitSpeed),
    pearliteAvoided,
    bainiteAvoided,
    bathWindow,
    bathIdealProximity: r4(bathIdealProximity),
    briefHoldProxy: r4(briefHoldProxy),
    uniformityIndex: r4(uniformityIndex),
    sectionEqualizedProxy: r4(sectionEqualizedProxy),
    msCrossingProxy: r4(msCrossingProxy),
    martensiteFraction: r4(martensiteFraction),
    kmFraction: r4(kmFrac),
    retainedAusteniteFraction: r4(retainedAusteniteFraction),
    matrixGrainCount: matrixRuns.length,
    minorityClusterCount: minorityRuns.length,
    reserveCV: r4(reserveCV),
    reserveXFracStdev: r4(reserveXFracStdev),
    sheafCount,
    subUnitCount,
    sheafDensity: r4(sheafDensity),
    bainiteContaminationRisk: r4(bainiteContaminationRisk),
    bathOvershootRisk: r4(bathOvershootRisk),
    distortionProxy: r4(distortionProxy),
    crackingRiskProxy: r4(crackingRiskProxy),
    hardnessProxy: r4(hardnessProxy),
    toughnessProxy: r4(toughnessProxy),
    temperingRequired,
    arrheniusActivation: r4(arrheniusActivation),
    hypoeutectoidSkew,
    minorityFraction: r4(minorityFraction),
    stageProgress: r4(stageProgress),
    dominantStage,
    xMatrixCount,
    yMatrixCount,
    minorityRoleCount,
    martemperingIndex,
    martemperingRegime,
    martemperingVerdict,
    stageDistribution,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Martempering — Doctor ===\n");
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

  const profiles: MartemperingProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeMartempering(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgMartemperingIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.martemperingIndex)))
      : 0,
    avgDrivingForce: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.drivingForce)))
      : 0,
    avgBathActivity: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.bathActivity)))
      : 0,
    avgTransitSpeed: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.transitSpeed)))
      : 0,
    pearliteAvoidedCount: profiles.filter((p) => p.pearliteAvoided === 1).length,
    bainiteAvoidedCount: profiles.filter((p) => p.bainiteAvoided === 1).length,
    bathWindowCount: profiles.filter((p) => p.bathWindow === 1).length,
    austeniticHoldCount:          profiles.filter((p) => p.martemperingRegime === "AUSTENITIC_HOLD").length,
    rapidQuenchCount:             profiles.filter((p) => p.martemperingRegime === "RAPID_QUENCH").length,
    bathEquilibrationCount:       profiles.filter((p) => p.martemperingRegime === "BATH_EQUILIBRATION").length,
    bathOvershootCount:           profiles.filter((p) => p.martemperingRegime === "BATH_OVERSHOOT").length,
    msCrossingCount:              profiles.filter((p) => p.martemperingRegime === "MS_CROSSING").length,
    martensiticTransformationCount: profiles.filter((p) => p.martemperingRegime === "MARTENSITIC_TRANSFORMATION").length,
    fullyMartemperedCount:        profiles.filter((p) => p.martemperingRegime === "FULLY_MARTEMPERED").length,
    bainiteContaminationCount:    profiles.filter((p) => p.martemperingRegime === "BAINITE_CONTAMINATION").length,
    bainiteShuntCount:            profiles.filter((p) => p.martemperingRegime === "BAINITE_SHUNT").length,
    pearliteShuntCount:           profiles.filter((p) => p.martemperingRegime === "PEARLITE_SHUNT").length,
    noDriveCount:                 profiles.filter((p) => p.martemperingRegime === "NO_MARTEMPERING_DRIVE").length,
    temperingRequiredCount:       profiles.filter((p) => p.temperingRequired === 1).length,
    avgStageProgress: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.stageProgress)))
      : 0,
    avgUniformityIndex: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.uniformityIndex)))
      : 0,
    avgSectionEqualizedProxy: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.sectionEqualizedProxy)))
      : 0,
    avgMsCrossingProxy: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.msCrossingProxy)))
      : 0,
    avgMartensiteFraction: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.martensiteFraction)))
      : 0,
    avgKmFraction: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.kmFraction)))
      : 0,
    avgBriefHoldProxy: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.briefHoldProxy)))
      : 0,
    avgDistortionProxy: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.distortionProxy)))
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
    totalSheafContaminations: profiles.reduce((s, p) => s + p.sheafCount, 0),
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-martempering").description("HODLMM bin martempering / interrupted-quench-to-uniform-martensite analyzer (pearlite-nose avoidance, bath hold just above Ms, brief equalization, Ms crossing to uniform low-stress martensite, bainite contamination warning, tempering-required flag)");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin martempering state")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
