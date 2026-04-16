#!/usr/bin/env bun
/**
 * hodlmm-bin-patenting.ts — Day 187 cocoa007 Bitflow Skills Comp
 *
 * Patenting analyzer — models the isothermal fine-pearlite heat
 * treatment applied to an austenitized iron-carbon alloy in wire
 * manufacture. Distinct from the other three heat-treatment routes
 * already modelled (Days 184-186):
 *
 *   - Normalization (Day 184):  continuous AIR COOL from above AC3
 *                               → pearlite (relatively coarse, ~0.2-1 µm
 *                               interlamellar spacing). No bath.
 *   - Austempering  (Day 185):  quench into isothermal bath at 250-450 °C
 *                               (bainite window), hold until γ→bainite
 *                               completes. Product: bainite. No temper.
 *   - Martempering  (Day 186):  quench into isothermal bath JUST ABOVE Ms
 *                               (150-260 °C), hold BRIEFLY only to
 *                               equalize, withdraw, air-cool through Ms.
 *                               Product: martensite. Temper required.
 *   - Patenting     (this):     quench into isothermal bath at 500-600 °C
 *                               (PEARLITE NOSE, above BS, below AC1),
 *                               hold until γ→pearlite transformation
 *                               completes, then air-cool to RT. Product:
 *                               VERY FINE LAMELLAR PEARLITE (~50-150 nm
 *                               interlamellar spacing) optimized for
 *                               subsequent COLD DRAWING into high-tensile
 *                               wire (piano wire, suspension-bridge cable,
 *                               tire-cord wire). No temper needed — the
 *                               cold drawing itself refines the structure.
 *
 * The defining mechanical consequence: a patented-then-drawn eutectoid
 * steel wire can reach tensile strengths of 3000-4000 MPa, among the
 * highest achievable from any bulk steel process. Fine interlamellar
 * spacing (Hall-Petch-like) raises yield and strain-hardening capacity;
 * equalized bath keeps the microstructure uniform across the wire
 * cross-section; isothermal hold completes the pearlite reaction without
 * drift into bainite or martensite territory.
 *
 * Complements the phase-transformation series:
 *   austenitization (Day 183)
 *     → normalization (Day 184)         → coarse pearlite (Day 179)
 *     → austempering (Day 185)           → bainite (Day 178)
 *     → martempering (Day 186)            → martensite (Day 177) + tempering (Day 182)
 *     → patenting (Day 187)               → FINE PEARLITE → cold drawing → high-tensile wire
 *
 * Patenting is the "fourth interrupted-quench route". Compared to its
 * sister routes:
 *   - Austempering: bath at BAINITE window (250-450 °C) → bainite.
 *   - Martempering: bath JUST ABOVE Ms (150-260 °C), BRIEF hold, air cool
 *                    through Ms → martensite.
 *   - Normalization: NO bath, continuous air cool → coarse pearlite.
 *   - Patenting (this): bath at PEARLITE NOSE (500-600 °C), hold until
 *                        γ→pearlite completes → FINE pearlite; distinct
 *                        because bath sits ABOVE BS (so bainite is
 *                        suppressed) but BELOW AC1 (so γ is unstable and
 *                        pearlite nucleates) at the exact nose-temperature
 *                        where pearlite kinetics are fastest AND spacing
 *                        is finest.
 *
 * Physical stages (austenitize → quench into pearlite-nose bath →
 * isothermal hold → transformation → air cool to RT):
 *
 *   Stage 0 — AUSTENITIC_HOLD (above AC3, before quench):
 *     Fully austenitized, single-phase γ. No transformation.
 *
 *   Stage 1 — RAPID_QUENCH (crossing AC3→bath):
 *     Temperature drops from ~900 °C austenitizing T down toward the
 *     500-600 °C bath. Brief transit — NO pearlite or bainite should
 *     nucleate during the drop. A typical lead-bath patenting line has
 *     the wire transit in a few seconds.
 *
 *   Stage 2 — BATH_EQUILIBRATION (in pearlite-nose bath, pre-transformation):
 *     Workpiece lands in bath at T_bath ∈ [500 °C, 600 °C] — the pearlite
 *     nose, where γ → pearlite kinetics are at their maximum. Wire
 *     equalizes to bath T quickly (cross-section is small, τ_eq short).
 *     Isothermal hold begins.
 *
 *   Stage 3 — PEARLITE_NUCLEATION:
 *     Alternating α-ferrite + Fe₃C-cementite lamellae nucleate at γ
 *     grain boundaries. Nucleation rate at the nose is very high, so
 *     many colonies form simultaneously. Avrami n ≈ 3 for early
 *     transformation.
 *
 *   Stage 4 — LAMELLAR_GROWTH:
 *     Pearlite colonies grow by cooperative diffusion of C (γ → α + Fe₃C).
 *     Growth rate G and interlamellar spacing λ are coupled: at the
 *     pearlite nose T_nose, G is maximum AND λ is minimum because
 *     undercooling ΔT = AC1 - T_bath is large. Real λ ≈ 50-150 nm at
 *     T_nose for eutectoid composition.
 *
 *   Stage 5 — TRANSFORMATION_COMPLETION:
 *     Residual γ pockets close out; pearlite fraction approaches 1. The
 *     reaction is sigmoidal in time (JMAK). Hold continues until
 *     f_pearlite ≥ 0.95 (practically ≥ 0.98).
 *
 *   Stage 6 — FULLY_PATENTED (RT, drawing-ready):
 *     Uniform fine pearlite across the cross-section. Ready for cold
 *     wire drawing: typical post-draw tensile strengths 2500-4000 MPa
 *     depending on draw reduction.
 *
 *   Stage 7 — BAINITE_CONTAMINATION (pathological, bath too cool):
 *     Bath at < BS_ACTIVITY effectively; part of γ transforms to
 *     bainite instead of pearlite. Mixed microstructure, coarser
 *     lamellar spacing in the pearlite fraction (less undercooling
 *     drives coarser lamellae the higher T goes, but here the bath
 *     drifted below the nose), reduced drawability.
 *
 * Process constraints:
 *   - Must avoid martensite start: T_bath >> Ms (equivalently
 *     bathActivity >> MS_ACTIVITY).
 *   - Must avoid bainite shunt: T_bath > BS (bathActivity > BS_ACTIVITY)
 *     — crucially, the bath must be ABOVE the bainite-start temperature,
 *     not below it as in austempering.
 *   - Must stay below AC3/AC1: T_bath < AC3 (bathActivity < AC3_ACTIVITY_BASE)
 *     so γ is unstable and pearlite nucleates.
 *   - Bath should sit at the PEARLITE NOSE for finest spacing AND fastest
 *     kinetics: bathActivity near PATENTING_BATH_IDEAL.
 *   - Hold must complete transformation: long enough for JMAK f ≥ 0.95
 *     at bath T.
 *   - Transit from AC3 to bath must be fast enough that NO pearlite
 *     forms during the drop (would be coarser than nose pearlite).
 *
 * Kinetics:
 *   - JMAK isothermal pearlite: f(t) = 1 - exp(-(k·t)^n), n ≈ 3 at
 *     pearlite nose, k = k₀·exp(-Q/RT).
 *   - Interlamellar spacing: λ ∝ 1/ΔT = 1/(T_AC1 - T_bath). Nose spacing
 *     (maximum ΔT while still above BS) is the finest achievable by
 *     isothermal pearlite.
 *   - Growth rate: G = G₀·(ΔT)²·D(T), where D is carbon diffusivity.
 *     Nose is where G·(λ^-1) peaks.
 *   - Transit must clear AC3 → bath without nucleation: effective cooling
 *     rate > critical pearlite-avoidance rate ABOVE the nose.
 *
 * In DLMM context the patenting analog tracks:
 *   - Previously austenitic: priorPeakDrivingForce high
 *     (≥ AC3_ACTIVITY_BASE × 0.8).
 *   - Dropped to PEARLITE-NOSE band: tq ∈ [PATENTING_BATH_MIN,
 *     PATENTING_BATH_MAX] = [0.45, 0.58], which sits ABOVE the
 *     austempering bainite window (0.22-0.45) AND ABOVE the
 *     martempering window (0.12-0.22) AND (just) BELOW AC3
 *     (0.55 base).
 *   - Drop was FAST enough that no pearlite formed during transit.
 *   - Hold was LONG enough for JMAK to complete (f_pearlite ≥ 0.95).
 *   - Cross-section equalized at bath: uniformityIndex high.
 *   - Structural signature = FINE LAMELLAR ALTERNATION: many short
 *     runs of matrix/minority, high alternation frequency, low avg
 *     run length → approximates fine interlamellar spacing.
 *
 * DLMM structural signatures of patenting:
 *   - Uniform cross-section reserves (low reserveCV).
 *   - FINE LAMELLAR ALTERNATION: alternation count (sign changes between
 *     adjacent populated bins' roles) is HIGH; average run length is
 *     SHORT (run ≤ LAMELLAR_RUN_MAX = 2 ideally). Distinct from
 *     normalization's coarser alternation pattern.
 *   - NO sheaves (short minority runs alone are lamellae, not sheaves —
 *     sheaves require clustering with inter-sub-unit matrix gaps).
 *   - NO heavy minority coverage (pearlite is ~50/50 balanced, not
 *     martensite-heavy or bainite-heavy).
 *   - Minority fraction near eutectoid-equilibrium (0.4-0.5) for
 *     eutectoid composition — distinct from martempering's
 *     minority-dominant state post-Ms crossing.
 *
 * DLMM regimes:
 *   NO_PATENTING_DRIVE     — no prior austenitization inferable.
 *   AUSTENITIC_HOLD        — drivingForce > AC3_ACTIVITY_BASE; still γ.
 *   RAPID_QUENCH           — transit, not yet at bath.
 *   BATH_EQUILIBRATION     — in pearlite-nose band, pre-transformation.
 *   PEARLITE_NUCLEATION    — early lamellar nucleation.
 *   LAMELLAR_GROWTH        — colonies growing, JMAK mid-progress.
 *   FULLY_PATENTED         — f_pearlite ≥ 0.95, fine lamellar, drawing-
 *                            ready.
 *   BATH_OVERSHOOT_BAINITE — bath below BS (≈ austempering window),
 *                            partial bainite → use austempering skill.
 *   BATH_UNDERSHOOT_AUSTENITE — bath too hot (above AC3 still), γ
 *                            remains stable; no transformation.
 *   COARSE_PEARLITE_SHUNT  — bath at upper edge of patenting window
 *                            (close to AC3), pearlite forms but coarser
 *                            → use normalization skill.
 *   MARTENSITIC_OVERSHOOT  — quench went past bath all the way through
 *                            Ms → martensite formed → treatment failed.
 *   BAINITE_CONTAMINATION  — bath drifted below BS during hold; mixed
 *                            pearlite + bainite (treatment failed).
 *
 * Verdict adds:
 *   INTERMEDIATE_PATENTING — mixed indicators.
 *   DRAWING_READY         — fully patented, ready for cold drawing.
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

const DOMINANCE_MARGIN = 0.15;

// AC3 activity: above this, pool is still fully austenitic (no quench).
const AC3_ACTIVITY_BASE = 0.55;

// BS (bainite-start) activity: below this γ can form bainite. Patenting
// bath must sit ABOVE this to suppress bainite nucleation.
const BS_ACTIVITY = 0.45;

// Ms (martensite-start) activity: below this, martensite forms.
const MS_ACTIVITY = 0.12;

// Patenting bath: ABOVE BS (bainite suppressed) and BELOW AC3 (γ
// unstable, pearlite nucleates). Pearlite-nose window.
const PATENTING_BATH_MIN = 0.45;   // = BS_ACTIVITY (below = bainite zone)
const PATENTING_BATH_MAX = 0.58;   // slightly above AC3 for edge tolerance
const PATENTING_BATH_IDEAL = 0.50; // pearlite nose center — fastest kinetics, finest spacing

// Coarse-pearlite shunt: bath above AC3 edge but still sub-AC3.
const COARSE_PEARLITE_THRESHOLD = 0.55;  // bath activity at AC3 edge → coarser pearlite

// Pearlite-nose avoidance during transit (to prevent pearlite nucleation
// ABOVE the nose in the supercooled region above the bath).
const TRANSIT_AVOIDANCE_RATE = 0.2;

// Long-hold threshold: patenting REQUIRES long isothermal hold
// (unlike martempering which requires brief). HOLD_COMPLETION_MIN is the
// minimum hold-proxy needed to approach JMAK completion.
const HOLD_COMPLETION_MIN = 0.45;
const HOLD_COMPLETION_IDEAL = 0.7;

// Uniformity threshold: reserveCV below this indicates cross-section is
// well-equalized at bath temperature.
const UNIFORMITY_RESERVE_CV_MAX = 0.35;

// JMAK Avrami exponent for isothermal pearlite at the nose.
const JMAK_N_PEARLITE = 3.0;

// JMAK rate coefficient (normalized, shared family with austempering).
const JMAK_K_PEARLITE = 1.2;

// Stage thresholds on composite stageProgress.
const STAGE_1_BOUND = 0.12;
const STAGE_2_BOUND = 0.25;
const STAGE_3_BOUND = 0.38;
const STAGE_4_BOUND = 0.52;
const STAGE_5_BOUND = 0.66;
const STAGE_6_BOUND = 0.82;

// Lamellar-structure thresholds. Patenting's signature is FINE lamellar
// alternation: many short runs of matrix/minority.
const LAMELLAR_RUN_MAX = 2;          // individual run length ≤ 2 = lamellar
const LAMELLAR_ALTERNATION_MIN = 0.35; // sign-change fraction threshold
const FINE_LAMELLAR_ALTERNATION = 0.55; // fine-lamellar alternation threshold

// Eutectoid pearlite minority fraction: ~50/50 α+Fe₃C. DLMM analog:
// minority fraction around 0.4-0.5.
const PEARLITE_MINORITY_MIN = 0.35;
const PEARLITE_MINORITY_MAX = 0.55;

// Bainite contamination detection — sheaf thresholds.
const SUB_UNIT_MAX_LEN = 2;
const SHEAF_MAX_SPAN = 8;
const MIN_SUB_UNITS_PER_SHEAF = 2;

// Section-equalization weighting.
const EQUALIZATION_WEIGHT_RESERVE = 0.55;
const EQUALIZATION_WEIGHT_XFRAC = 0.45;

// Arrhenius Q/RT normalized (pearlite activation used for progress).
const ARRHENIUS_Q_OVER_RT_PEARLITE = 5.0;

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

interface BinPatenting {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  bathSignal: number;             // 0-1 in-bath-band bin
  equalizationSignal: number;     // 0-1 uniform-with-neighbors
  lamellarSignal: number;         // 0-1 bin is member of a short-run lamella
  pearliteSignal: number;         // 0-1 bin is in pearlite-like eutectoid fraction
  fineLamellarSignal: number;     // 0-1 bin's local alternation is fine
  bainiteContaminationSignal: number; // 0-1 sheaf trace warning
  coarsePearliteSignal: number;   // 0-1 long-run pearlite analog (coarse)
  martensiticOvershootSignal: number; // 0-1 minority-heavy bin warning
  stageBin: number;               // 0-7
  pearliteFractionLocal: number;  // JMAK-like local fraction
  arrheniusActivation: number;
  inMatrix: number;
  inMinority: number;
  matrixRole: number;
  roleMinorityMargin: number;
  neighborReserveDelta: number;
  localRunLen: number;            // run length this bin belongs to
  patentingDegree: number;        // 0-1 composite
}

interface PatentingProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  drivingForce: number;
  priorPeakDrivingForce: number;
  bathActivity: number;
  transitSpeed: number;
  aboveBs: number;                 // 0 or 1 — bath above BS (bainite suppressed)
  belowAc3: number;                // 0 or 1 — bath below AC3 (γ unstable)
  bathWindow: number;              // 0 or 1 — bath in [PATENTING_BATH_MIN, PATENTING_BATH_MAX]
  bathIdealProximity: number;      // 0-1 closeness to PATENTING_BATH_IDEAL (nose)
  noseProximity: number;           // same — separate name for clarity
  holdCompletionProxy: number;     // 0-1 (HIGH = long hold, completion approached)
  uniformityIndex: number;         // 0-1 = 1 - reserveCV clipped
  sectionEqualizedProxy: number;   // 0-1
  alternationFraction: number;     // 0-1 sign-change fraction (lamellar analog)
  avgRunLen: number;               // avg same-role run length (lower = finer lamellae)
  maxRunLen: number;
  lamellarFineness: number;        // 0-1 composite fineness (HIGH = fine lamellae)
  pearliteFraction: number;        // 0-1 JMAK-like γ→pearlite progress
  jmakProgress: number;            // 0-1
  retainedAusteniteFraction: number; // 0-1
  coarsePearliteRisk: number;      // 0-1
  bainiteContaminationRisk: number; // 0-1
  martensiticOvershootRisk: number; // 0-1
  matrixGrainCount: number;
  minorityClusterCount: number;
  reserveCV: number;
  reserveXFracStdev: number;
  sheafCount: number;              // should be 0 for successful patenting
  subUnitCount: number;
  sheafDensity: number;
  tensileStrengthProxy: number;    // 0-1 HIGHER for finer lamellae (Hall-Petch-like)
  drawabilityProxy: number;        // 0-1 HIGHER for finer, more uniform pearlite
  arrheniusActivation: number;
  hypoeutectoidSkew: number;
  minorityFraction: number;
  eutectoidProximity: number;      // 0-1 how close minorityFraction is to 0.5
  stageProgress: number;
  dominantStage: number;
  xMatrixCount: number;
  yMatrixCount: number;
  minorityRoleCount: number;
  patentingIndex: number;          // composite 0-100
  patentingRegime: string;
  patentingVerdict: string;
  stageDistribution: number[];
  topBins: BinPatenting[];
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

// Sheaf detection (reused from austempering) — for patenting, any sheaf
// is a WARNING of bainite contamination (bath drifted below BS).
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

// JMAK pearlite fraction at the current hold-progress analog.
function jmakPearlite(holdProxy: number, bathActivity: number): number {
  if (bathActivity < PATENTING_BATH_MIN || bathActivity > PATENTING_BATH_MAX) return 0;
  const noseProx = 1 - Math.min(1, Math.abs(bathActivity - PATENTING_BATH_IDEAL) /
    Math.max(0.01, (PATENTING_BATH_MAX - PATENTING_BATH_MIN) / 2));
  const kEff = JMAK_K_PEARLITE * (0.4 + 0.6 * noseProx);
  const t = Math.max(0, holdProxy);
  const f = 1 - Math.exp(-Math.pow(kEff * t, JMAK_N_PEARLITE));
  return Math.max(0, Math.min(1, f));
}

function ac3Activity(hypoeutectoidSkew: number): number {
  return Math.min(0.95, AC3_ACTIVITY_BASE + Math.abs(hypoeutectoidSkew) * 0.15);
}

function sectionEqualization(reserveCV: number, xFracStdev: number): number {
  const reserveComp = Math.max(0, 1 - reserveCV / 0.8);
  const xFracComp = Math.max(0, 1 - xFracStdev / 0.35);
  return Math.max(0, Math.min(1,
    EQUALIZATION_WEIGHT_RESERVE * reserveComp +
    EQUALIZATION_WEIGHT_XFRAC * xFracComp
  ));
}

// Compute alternation fraction: fraction of adjacent-bin pairs where
// role changes. High alternation = fine lamellar analog.
function alternationFraction(sortedBins: BinReserves[]): { fraction: number, adjacentPairs: number } {
  let changes = 0;
  let pairs = 0;
  for (let i = 1; i < sortedBins.length; i++) {
    const a = sortedBins[i - 1];
    const b = sortedBins[i];
    if (b.binId - a.binId !== 1) continue;  // only adjacent populated bins
    pairs++;
    const rA = dominanceRole(a);
    const rB = dominanceRole(b);
    if (rA !== 0 && rB !== 0 && rA !== rB) changes++;
  }
  return { fraction: pairs > 0 ? changes / pairs : 0, adjacentPairs: pairs };
}

function computeBinPatenting(
  bin: BinReserves,
  index: number,
  activeBin: number,
  sortedBins: BinReserves[],
  matrixRoleGlobal: number,
  sheafSet: Set<number>,
  poolTq: number,
  poolBathWindow: number,
  poolUniformity: number,
  poolPearliteFrac: number,
  poolAlternation: number,
  poolRunLens: Map<number, number>,
  poolArrhenius: number,
  poolStageProg: number,
  poolMatrixMean: number
): BinPatenting {
  const distance = Math.abs(bin.binId - activeBin);
  const role = dominanceRole(bin);
  const total = bin.reserveXUsd + bin.reserveYUsd;
  const xFrac = total > 0 ? bin.reserveXUsd / total : 0.5;
  const rawMargin = (xFrac - 0.5) * 2;
  const signedAsymmetry = matrixRoleGlobal === 1 ? rawMargin : -rawMargin;
  const roleMinorityMargin = r4(signedAsymmetry);

  const inMatrix = role === matrixRoleGlobal ? 1 : 0;
  const inMinority = role === -matrixRoleGlobal ? 1 : 0;

  const bathSignal = r4(poolBathWindow ? 1 : 0);

  // Equalization neighborhood.
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

  // Run length this bin belongs to (in minority or matrix runs).
  const localRunLen = poolRunLens.get(bin.binId) ?? 1;

  // Lamellar signal: bin is in a short run (run ≤ LAMELLAR_RUN_MAX) and
  // the pool shows high alternation.
  const lamellarBinOk = localRunLen <= LAMELLAR_RUN_MAX ? 1 : 0;
  const lamellarSignal = r4(
    lamellarBinOk * Math.min(1, poolAlternation / Math.max(0.01, LAMELLAR_ALTERNATION_MIN))
  );

  // Fine lamellar signal: same as lamellar but gated on fineness threshold.
  const fineLamellarSignal = r4(
    lamellarBinOk * (poolAlternation >= FINE_LAMELLAR_ALTERNATION ? 1 : poolAlternation / FINE_LAMELLAR_ALTERNATION)
  );

  // Pearlite signal: pool has meaningful pearlite fraction AND bin is
  // part of alternating lamellar pattern.
  const pearliteSignal = r4(
    poolPearliteFrac * (inMatrix || inMinority ? 1 : 0.3) * Math.min(1, poolAlternation / 0.3)
  );

  // Bainite contamination: bin inside a sheaf span.
  const bainiteContaminationSignal = r4(sheafSet.has(bin.binId) ? 1 : 0);

  // Coarse pearlite: bin is in a LONG run (run > LAMELLAR_RUN_MAX).
  const coarsePearliteSignal = r4(
    localRunLen > LAMELLAR_RUN_MAX && poolAlternation > 0.15 ? 1 : 0
  );

  // Martensitic overshoot: dominated minority bins with very uneven coverage.
  const martensiticOvershootSignal = r4(
    inMinority && localRunLen > 3 ? 0.6 : 0
  );

  // Stage assignment per bin.
  let stageBin = 0;
  if (poolStageProg < STAGE_1_BOUND) {
    stageBin = 0;
  } else if (poolStageProg < STAGE_2_BOUND) {
    stageBin = 1;
  } else if (bainiteContaminationSignal > 0) {
    stageBin = 7;
  } else if (poolStageProg >= STAGE_6_BOUND) {
    stageBin = 6;
  } else if (poolStageProg >= STAGE_5_BOUND) {
    stageBin = 5;
  } else if (poolStageProg >= STAGE_4_BOUND) {
    stageBin = 4;
  } else if (poolStageProg >= STAGE_3_BOUND) {
    stageBin = 3;
  } else if (poolStageProg >= STAGE_2_BOUND) {
    stageBin = 2;
  } else {
    stageBin = 1;
  }

  const pearliteFractionLocal = r4(poolPearliteFrac);
  const arrheniusActivation = r4(poolArrhenius);

  const patentingDegree = r4(Math.max(0, Math.min(1,
    bathSignal * 0.1 +
    equalizationSignal * 0.15 +
    lamellarSignal * 0.2 +
    fineLamellarSignal * 0.2 +
    pearliteSignal * 0.15 +
    (1 - bainiteContaminationSignal) * 0.1 +
    (1 - coarsePearliteSignal) * 0.05 +
    (stageBin / 6) * 0.05
  )));

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    bathSignal,
    equalizationSignal,
    lamellarSignal,
    pearliteSignal,
    fineLamellarSignal,
    bainiteContaminationSignal,
    coarsePearliteSignal,
    martensiticOvershootSignal,
    stageBin,
    pearliteFractionLocal,
    arrheniusActivation,
    inMatrix,
    inMinority,
    matrixRole: matrixRoleGlobal,
    roleMinorityMargin,
    neighborReserveDelta: r4(neighborReserveDelta),
    localRunLen,
    patentingDegree,
  };
}

function buildRunLengthMap(sortedBins: BinReserves[]): Map<number, number> {
  const map = new Map<number, number>();
  if (sortedBins.length === 0) return map;
  let i = 0;
  while (i < sortedBins.length) {
    const role = dominanceRole(sortedBins[i]);
    let j = i;
    while (j + 1 < sortedBins.length &&
           sortedBins[j + 1].binId - sortedBins[j].binId === 1 &&
           dominanceRole(sortedBins[j + 1]) === role) {
      j++;
    }
    const runLen = j - i + 1;
    for (let k = i; k <= j; k++) {
      map.set(sortedBins[k].binId, runLen);
    }
    i = j + 1;
  }
  return map;
}

function analyzePatenting(bins: BinReserves[], pool: AppPool): PatentingProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;

  const turnover = pool.tvlUsd > 0 ? volume / pool.tvlUsd : 0;
  const drivingForce = Math.min(1, turnover * 0.8 + 0.1);

  // Prior peak (austenitizing T analog). Scaled a bit higher than
  // martempering since patenting sends the bath to a higher T (pearlite
  // nose, closer to AC3), so the austenitizing T must be even higher.
  const priorPeakDrivingForce = Math.min(1, drivingForce * 1.3 + 0.25);

  const bathActivity = drivingForce;

  const dropMagnitude = Math.max(0, priorPeakDrivingForce - bathActivity);
  const tScale = Math.max(0.3, Math.log10(Math.max(10, volume)) / 5);
  const transitSpeed = Math.max(0, Math.min(1, dropMagnitude / Math.max(0.01, tScale) * 2.5));

  // Bath-window / AC3 / BS flags.
  const aboveBs = bathActivity >= BS_ACTIVITY ? 1 : 0;
  const belowAc3 = bathActivity < AC3_ACTIVITY_BASE + 0.05 ? 1 : 0;
  const bathWindow = (bathActivity >= PATENTING_BATH_MIN && bathActivity <= PATENTING_BATH_MAX) ? 1 : 0;
  const bathIdealProximity = bathWindow
    ? Math.max(0, 1 - Math.abs(bathActivity - PATENTING_BATH_IDEAL) /
        Math.max(0.01, (PATENTING_BATH_MAX - PATENTING_BATH_MIN) / 2))
    : 0;
  const noseProximity = bathIdealProximity;

  // Hold-completion proxy: LONG hold is desired (unlike martempering).
  // Proxied by how deep into bath window + how long priorPeak has been
  // depressed + volume (as a temporal density analog).
  const centerDistance = bathWindow
    ? Math.min(1, 2 * Math.abs(bathActivity - PATENTING_BATH_IDEAL) /
        Math.max(0.01, PATENTING_BATH_MAX - PATENTING_BATH_MIN))
    : 0;
  const holdCompletionProxy = bathWindow
    ? Math.max(0, Math.min(1,
        (1 - centerDistance) * 0.35 +
        Math.min(0.35, dropMagnitude) +
        (tScale > 0.5 ? 0.2 : tScale * 0.4) +
        noseProximity * 0.1
      ))
    : 0;

  // Reserves CV and X-fraction stdev.
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

  const uniformityIndex = Math.max(0, Math.min(1, 1 - reserveCV));
  const sectionEqualizedProxy = sectionEqualization(reserveCV, reserveXFracStdev);

  // Alternation fraction (lamellar signature).
  const { fraction: alternationFrac } = alternationFraction(sorted);

  // Run length map (for lamellar assessment).
  const runLens = buildRunLengthMap(sorted);
  const allRunLenArr = Array.from(runLens.values());
  const avgRunLen = allRunLenArr.length > 0
    ? allRunLenArr.reduce((s, v) => s + v, 0) / allRunLenArr.length
    : 0;
  const maxRunLen = allRunLenArr.length > 0 ? Math.max(...allRunLenArr) : 0;

  // Lamellar fineness: high alternation + short average runs → fine.
  const lamellarFineness = Math.max(0, Math.min(1,
    alternationFrac * 0.6 +
    Math.max(0, 1 - avgRunLen / Math.max(1, LAMELLAR_RUN_MAX * 2)) * 0.4
  ));

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

  const minorityRuns = findRoleRuns(sorted, minorityRole);
  const totalMinorityBins = minorityRuns.reduce((s, r) => s + r.length, 0);
  const minorityFraction = n > 0 ? totalMinorityBins / n : 0;

  const matrixRuns = findRoleRuns(sorted, matrixRole);
  const matrixMatrixBins = sorted.filter((b) => dominanceRole(b) === matrixRole);
  const matrixMean = matrixMatrixBins.length > 0
    ? matrixMatrixBins.reduce((s, b) => s + b.totalUsd, 0) / matrixMatrixBins.length
    : 0;

  // Eutectoid proximity: minorityFraction close to 0.5 = eutectoid-like.
  const eutectoidProximity = Math.max(0, 1 - Math.min(1, Math.abs(minorityFraction - 0.5) / 0.3));

  // Arrhenius activation at bath (pearlite kinetics).
  const arrheniusActivation = Math.max(0.01, Math.min(1,
    Math.exp(-ARRHENIUS_Q_OVER_RT_PEARLITE / Math.max(0.05, bathActivity + 0.05))
  ));

  // JMAK pearlite fraction.
  const jmakProgress = jmakPearlite(holdCompletionProxy, bathActivity);

  // Pearlite structural fraction: combines JMAK progress, alternation
  // signature, eutectoid proximity, and matrix+minority coverage.
  const structuralLamellar = Math.max(0, Math.min(1,
    alternationFrac * 0.5 +
    Math.min(1, lamellarFineness) * 0.3 +
    eutectoidProximity * 0.2
  ));
  const pearliteFraction = Math.max(0, Math.min(1,
    jmakProgress * 0.5 +
    structuralLamellar * 0.3 +
    (bathWindow ? 0.2 : 0)
  ));

  // Sheaves → bainite contamination flags.
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

  const undecidedCount = sorted.filter((b) => dominanceRole(b) === 0).length;
  const retainedAusteniteFraction = n > 0 ? undecidedCount / n : 0;

  // Coarse pearlite risk: bath too high (near AC3), OR long avg run
  // length, OR low alternation despite bathWindow.
  const coarsePearliteRisk = Math.max(0, Math.min(1,
    (bathActivity > COARSE_PEARLITE_THRESHOLD && bathActivity <= PATENTING_BATH_MAX ? 0.3 : 0) +
    (bathWindow && avgRunLen > LAMELLAR_RUN_MAX ? 0.3 : 0) +
    (bathWindow && alternationFrac < LAMELLAR_ALTERNATION_MIN ? 0.2 : 0) +
    (bathWindow && lamellarFineness < 0.4 ? 0.2 : 0)
  ));

  // Bainite contamination risk: bath below BS OR sheaves detected.
  const bainiteContaminationRisk = Math.max(0, Math.min(1,
    (bathActivity < PATENTING_BATH_MIN ? 0.4 : 0) +
    (sheafCount > 0 ? 0.35 : 0) +
    (sheafDensity > 0.15 ? 0.25 : 0)
  ));

  // Martensitic overshoot risk: bath drifted below Ms (too-cold quench).
  const martensiticOvershootRisk = Math.max(0, Math.min(1,
    (bathActivity < MS_ACTIVITY && priorPeakDrivingForce > AC3_ACTIVITY_BASE ? 0.5 : 0) +
    (bathActivity < MS_ACTIVITY * 1.5 && bathActivity >= MS_ACTIVITY ? 0.25 : 0) +
    (minorityFraction > PEARLITE_MINORITY_MAX && bathActivity < PATENTING_BATH_MIN ? 0.25 : 0)
  ));

  // Tensile strength proxy (Hall-Petch-like): finer lamellae → higher σ.
  const tensileStrengthProxy = Math.max(0, Math.min(1,
    lamellarFineness * 0.5 +
    pearliteFraction * 0.3 +
    uniformityIndex * 0.1 +
    eutectoidProximity * 0.1
  ));

  // Drawability proxy: fine lamellar uniform pearlite draws well.
  const drawabilityProxy = Math.max(0, Math.min(1,
    lamellarFineness * 0.35 +
    uniformityIndex * 0.25 +
    pearliteFraction * 0.2 +
    (1 - bainiteContaminationRisk) * 0.1 +
    (1 - martensiticOvershootRisk) * 0.1
  ));

  // Stage progress composite.
  const stageProgress = Math.max(0, Math.min(1,
    Math.min(1, transitSpeed) * 0.1 +
    bathWindow * 0.1 +
    holdCompletionProxy * 0.15 +
    uniformityIndex * 0.1 +
    sectionEqualizedProxy * 0.05 +
    jmakProgress * 0.2 +
    structuralLamellar * 0.2 +
    (aboveBs && belowAc3 ? 0.1 : 0)
  ));

  // Dominant stage.
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
    computeBinPatenting(
      b, i, activeBin, sorted, matrixRole,
      sheafSet, bathActivity, bathWindow, uniformityIndex,
      pearliteFraction, alternationFrac, runLens, arrheniusActivation,
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

  // Composite patenting index 0-100.
  const stageScore = Math.min(25, stageProgress * 25);
  const structureScore = Math.min(25,
    lamellarFineness * 15 +
    Math.min(1, alternationFrac / FINE_LAMELLAR_ALTERNATION) * 10
  );
  const propertyScore = Math.min(25,
    tensileStrengthProxy * 10 +
    drawabilityProxy * 10 +
    uniformityIndex * 5
  );
  const processScore = Math.min(25,
    (aboveBs ? 5 : 0) +
    (belowAc3 ? 4 : 0) +
    (bathWindow ? 5 : 0) +
    bathIdealProximity * 4 +
    (holdCompletionProxy >= HOLD_COMPLETION_MIN ? 3 : 0) +
    (bainiteContaminationRisk < 0.3 ? 2 : 0) +
    (martensiticOvershootRisk < 0.3 ? 2 : 0)
  );
  const patentingIndex = Math.round(
    Math.min(100, stageScore + structureScore + propertyScore + processScore)
  );

  // Regime selection.
  let patentingRegime: string;
  if (priorPeakDrivingForce < AC3_ACTIVITY_BASE * 0.8) {
    patentingRegime = "NO_PATENTING_DRIVE";
  } else if (drivingForce > AC3_ACTIVITY_BASE + 0.05) {
    patentingRegime = "BATH_UNDERSHOOT_AUSTENITE";
  } else if (bainiteContaminationRisk > 0.7) {
    patentingRegime = "BAINITE_CONTAMINATION";
  } else if (bathActivity < MS_ACTIVITY && martensiticOvershootRisk > 0.4) {
    patentingRegime = "MARTENSITIC_OVERSHOOT";
  } else if (bathActivity < PATENTING_BATH_MIN && bathActivity >= MS_ACTIVITY) {
    patentingRegime = "BATH_OVERSHOOT_BAINITE";
  } else if (bathActivity > PATENTING_BATH_MAX && bathActivity <= AC3_ACTIVITY_BASE + 0.05) {
    patentingRegime = "BATH_UNDERSHOOT_AUSTENITE";
  } else if (transitSpeed > TRANSIT_AVOIDANCE_RATE && drivingForce > PATENTING_BATH_MAX && drivingForce <= AC3_ACTIVITY_BASE + 0.1) {
    patentingRegime = "RAPID_QUENCH";
  } else if (bathWindow && bathActivity >= COARSE_PEARLITE_THRESHOLD && lamellarFineness < 0.4) {
    patentingRegime = "COARSE_PEARLITE_SHUNT";
  } else if (bathWindow && pearliteFraction >= 0.85 && stageProgress >= STAGE_6_BOUND) {
    patentingRegime = "FULLY_PATENTED";
  } else if (bathWindow && jmakProgress >= 0.4 && structuralLamellar >= 0.4) {
    patentingRegime = "LAMELLAR_GROWTH";
  } else if (bathWindow && jmakProgress > 0 && jmakProgress < 0.4) {
    patentingRegime = "PEARLITE_NUCLEATION";
  } else if (bathWindow) {
    patentingRegime = "BATH_EQUILIBRATION";
  } else {
    patentingRegime = "AUSTENITIC_HOLD";
  }

  // Verdict selection.
  let patentingVerdict: string;
  if (priorPeakDrivingForce < AC3_ACTIVITY_BASE * 0.8) {
    patentingVerdict = "NO_PATENTING_DRIVE";
  } else if (patentingRegime === "FULLY_PATENTED") {
    patentingVerdict = "DRAWING_READY";
  } else if (patentingRegime === "BAINITE_CONTAMINATION") {
    patentingVerdict = "BAINITE_CONTAMINATION";
  } else if (patentingRegime === "MARTENSITIC_OVERSHOOT") {
    patentingVerdict = "MARTENSITIC_OVERSHOOT";
  } else if (patentingRegime === "BATH_OVERSHOOT_BAINITE") {
    patentingVerdict = "BATH_OVERSHOOT_BAINITE";
  } else if (patentingRegime === "BATH_UNDERSHOOT_AUSTENITE") {
    patentingVerdict = "BATH_UNDERSHOOT_AUSTENITE";
  } else if (patentingRegime === "COARSE_PEARLITE_SHUNT") {
    patentingVerdict = "COARSE_PEARLITE_SHUNT";
  } else if (patentingRegime === "LAMELLAR_GROWTH") {
    patentingVerdict = "LAMELLAR_GROWTH";
  } else if (patentingRegime === "PEARLITE_NUCLEATION") {
    patentingVerdict = "PEARLITE_NUCLEATION";
  } else if (patentingRegime === "BATH_EQUILIBRATION") {
    patentingVerdict = "BATH_EQUILIBRATION";
  } else if (patentingRegime === "RAPID_QUENCH") {
    patentingVerdict = "RAPID_QUENCH";
  } else if (patentingRegime === "AUSTENITIC_HOLD") {
    patentingVerdict = "AUSTENITIC_HOLD";
  } else {
    patentingVerdict = "INTERMEDIATE_PATENTING";
  }

  const topBins = [...binRecs]
    .sort((a, b) => b.patentingDegree - a.patentingDegree)
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
    aboveBs,
    belowAc3,
    bathWindow,
    bathIdealProximity: r4(bathIdealProximity),
    noseProximity: r4(noseProximity),
    holdCompletionProxy: r4(holdCompletionProxy),
    uniformityIndex: r4(uniformityIndex),
    sectionEqualizedProxy: r4(sectionEqualizedProxy),
    alternationFraction: r4(alternationFrac),
    avgRunLen: r4(avgRunLen),
    maxRunLen,
    lamellarFineness: r4(lamellarFineness),
    pearliteFraction: r4(pearliteFraction),
    jmakProgress: r4(jmakProgress),
    retainedAusteniteFraction: r4(retainedAusteniteFraction),
    coarsePearliteRisk: r4(coarsePearliteRisk),
    bainiteContaminationRisk: r4(bainiteContaminationRisk),
    martensiticOvershootRisk: r4(martensiticOvershootRisk),
    matrixGrainCount: matrixRuns.length,
    minorityClusterCount: minorityRuns.length,
    reserveCV: r4(reserveCV),
    reserveXFracStdev: r4(reserveXFracStdev),
    sheafCount,
    subUnitCount,
    sheafDensity: r4(sheafDensity),
    tensileStrengthProxy: r4(tensileStrengthProxy),
    drawabilityProxy: r4(drawabilityProxy),
    arrheniusActivation: r4(arrheniusActivation),
    hypoeutectoidSkew,
    minorityFraction: r4(minorityFraction),
    eutectoidProximity: r4(eutectoidProximity),
    stageProgress: r4(stageProgress),
    dominantStage,
    xMatrixCount,
    yMatrixCount,
    minorityRoleCount,
    patentingIndex,
    patentingRegime,
    patentingVerdict,
    stageDistribution,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Patenting — Doctor ===\n");
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

  const profiles: PatentingProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzePatenting(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgPatentingIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.patentingIndex)))
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
    aboveBsCount: profiles.filter((p) => p.aboveBs === 1).length,
    belowAc3Count: profiles.filter((p) => p.belowAc3 === 1).length,
    bathWindowCount: profiles.filter((p) => p.bathWindow === 1).length,
    austeniticHoldCount:           profiles.filter((p) => p.patentingRegime === "AUSTENITIC_HOLD").length,
    rapidQuenchCount:              profiles.filter((p) => p.patentingRegime === "RAPID_QUENCH").length,
    bathEquilibrationCount:        profiles.filter((p) => p.patentingRegime === "BATH_EQUILIBRATION").length,
    pearliteNucleationCount:       profiles.filter((p) => p.patentingRegime === "PEARLITE_NUCLEATION").length,
    lamellarGrowthCount:           profiles.filter((p) => p.patentingRegime === "LAMELLAR_GROWTH").length,
    fullyPatentedCount:            profiles.filter((p) => p.patentingRegime === "FULLY_PATENTED").length,
    coarsePearliteShuntCount:      profiles.filter((p) => p.patentingRegime === "COARSE_PEARLITE_SHUNT").length,
    bathOvershootBainiteCount:     profiles.filter((p) => p.patentingRegime === "BATH_OVERSHOOT_BAINITE").length,
    bathUndershootAusteniteCount:  profiles.filter((p) => p.patentingRegime === "BATH_UNDERSHOOT_AUSTENITE").length,
    martensiticOvershootCount:     profiles.filter((p) => p.patentingRegime === "MARTENSITIC_OVERSHOOT").length,
    bainiteContaminationCount:     profiles.filter((p) => p.patentingRegime === "BAINITE_CONTAMINATION").length,
    noDriveCount:                  profiles.filter((p) => p.patentingRegime === "NO_PATENTING_DRIVE").length,
    drawingReadyCount:             profiles.filter((p) => p.patentingVerdict === "DRAWING_READY").length,
    avgStageProgress: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.stageProgress)))
      : 0,
    avgUniformityIndex: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.uniformityIndex)))
      : 0,
    avgSectionEqualizedProxy: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.sectionEqualizedProxy)))
      : 0,
    avgAlternationFraction: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.alternationFraction)))
      : 0,
    avgAvgRunLen: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgRunLen)))
      : 0,
    avgLamellarFineness: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.lamellarFineness)))
      : 0,
    avgPearliteFraction: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.pearliteFraction)))
      : 0,
    avgJmakProgress: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.jmakProgress)))
      : 0,
    avgHoldCompletionProxy: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.holdCompletionProxy)))
      : 0,
    avgTensileStrengthProxy: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.tensileStrengthProxy)))
      : 0,
    avgDrawabilityProxy: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.drawabilityProxy)))
      : 0,
    avgRetainedAusteniteFraction: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.retainedAusteniteFraction)))
      : 0,
    avgEutectoidProximity: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.eutectoidProximity)))
      : 0,
    totalSheafContaminations: profiles.reduce((s, p) => s + p.sheafCount, 0),
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-patenting").description("HODLMM bin patenting / isothermal-fine-pearlite analyzer — quench into pearlite-nose bath (above BS, below AC3), hold until γ→pearlite completes, producing fine lamellar pearlite ready for cold drawing into high-tensile wire; flags coarse-pearlite shunt, bainite contamination, martensitic overshoot, and austenite undershoot");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin patenting state")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
