#!/usr/bin/env bun
/**
 * hodlmm-bin-carbonitriding.ts — Day 190 cocoa007 Bitflow Skills Comp
 *
 * Carbonitriding analyzer — models the THERMOCHEMICAL DUAL-SPECIES
 * (CARBON + NITROGEN) SURFACE-DIFFUSION case-hardening treatment held
 * at the INTERMEDIATE temperature window (760-870 °C, between nitriding
 * α-field 500-570 °C and carburizing γ-field 870-950 °C) in a HYBRID
 * atmosphere (endothermic CH₄/CO + dissociated NH₃). BOTH carbon and
 * nitrogen dissociate at the surface and co-diffuse INWARD per coupled
 * Fickian fields:
 *
 *     C(x, t) = C₀ + (Cs − C₀) · erfc( x / (2 · √(D_C · t)) )
 *     N(x, t) = N₀ + (Ns − N₀) · erfc( x / (2 · √(D_N · t)) )
 *
 * The added N performs THREE distinct roles that distinguish carbo-
 * nitriding from carburizing:
 *
 *   1. STABILIZES AUSTENITE — extends the γ-field DOWNWARD; intermediate
 *      hold T (760-870 °C) is INSIDE the γ + α-N stabilized austenite
 *      window. Carburizing CANNOT run here (γ collapses).
 *   2. LOWERS Ms — N in solid solution shifts the martensite-start
 *      temperature DOWN by ≈ 50-100 °C, allowing a MILDER OIL QUENCH (or
 *      gas quench) to still produce martensitic case. Less severe quench
 *      → LESS DISTORTION than carburizing.
 *   3. IMPROVES HARDENABILITY — cleaner martensitic transformation
 *      across the case section, including in LEANER (lower-alloy) base
 *      steels. Carburizing requires higher-alloy or oil quench; carbo-
 *      nitriding can use plain-carbon steels with mild oil quench.
 *
 * Plus N forms FINE COHERENT CARBONITRIDE PRECIPITATES — M(C,N) where
 * M = Fe, Cr, Mo, V — which contribute additional Orowan precipitation
 * hardening on top of the martensitic transformation. The case product
 * is therefore TRIPLE-HARDENING: martensitic transformation + carbide
 * precipitation + nitride precipitation, intercepted into a single
 * hybrid treatment.
 *
 * SEVENTH heat-treatment route in the phase-transformation series and
 * the THIRD spatial-gradient route (after carburizing Day 188 and
 * nitriding Day 189). It is the FIRST route to combine TWO diffusing
 * species and the FIRST route to use the INTERMEDIATE-temperature
 * γ-with-N-stabilization window. Distinct from carburizing and
 * nitriding on FOUR orthogonal axes:
 *
 *   - PHASE FIELD:        Carbonitriding holds in the INTERMEDIATE
 *                         γ-with-N-stabilization band (760-870 °C),
 *                         BELOW carburizing (870-950 °C γ-field) and
 *                         ABOVE nitriding (500-570 °C α-field). The
 *                         normalized drivingForce window is
 *                         INTERMEDIATE_FIELD_MIN=0.40,
 *                         INTERMEDIATE_FIELD_MAX=0.70,
 *                         INTERMEDIATE_FIELD_IDEAL=0.55.
 *   - DIFFUSING SPECIES:  TWO species (C from CH₄/CO + N from NH₃),
 *                         vs C-only (carburizing) or N-only (nitriding).
 *                         The C/N flux ratio (CN_RATIO_IDEAL ≈ 0.70 by
 *                         mass = ~70% C, ~30% N) is the KEY process
 *                         knob.
 *   - POST-TREATMENT:     MILD oil or gas quench REQUIRED — milder
 *                         than carburizing's full oil quench because N
 *                         lowers Ms, but unlike nitriding which needs
 *                         no quench at all. Plus a temper to control
 *                         retained austenite (RA — N stabilizes γ →
 *                         elevated RA, typically 10-30 vol%).
 *   - HARDENING:          TRIPLE mechanism: (a) martensitic phase
 *                         transformation in the case (like carburizing),
 *                         (b) M(C,N) carbonitride precipitation
 *                         (intermediate between carbide and nitride),
 *                         (c) solid-solution strengthening from N in
 *                         retained austenite. Carburizing has only (a)
 *                         + carbide precipitation; nitriding has only
 *                         alloy-nitride precipitation (no martensite).
 *
 * Two-structural-layer product (similar to carburizing but with N):
 *
 *   COMPOUND-FREE EDGE LAYER (outermost ≤ 25 µm — the hardened case):
 *     - High-C+N martensite + retained austenite (RA, typically
 *       10-30 vol%) + fine M(C,N) carbonitride precipitates
 *       (≤ 50 nm).
 *     - Surface hardness 60-65 HRC (between carburizing 58-62 and
 *       nitriding 65-70). Real surface C+N can reach 0.8-1.0 wt% C
 *       and 0.2-0.5 wt% N.
 *     - Excessive RA (> 35 vol%) is a defect — soft case spots,
 *       dimensional instability after secondary aging.
 *     - Distinct from nitriding: NO Fe-N compound layer (no white
 *       layer). The hold T is too HIGH for compound-layer formation
 *       (compound layer is α-field only). Surface phases are
 *       martensite + RA + M(C,N), not γ' or ε.
 *
 *   DIFFUSION ZONE (below edge layer, up to ≈300 µm):
 *     - Hardness gradient from edge (≈ 700-800 HV) to core
 *       (≈ 250-300 HV) across 0.05-0.75 mm — between nitriding
 *       (0.1-0.5 mm) and carburizing (0.5-2.0 mm) in DEPTH.
 *     - Effective Case Depth (ECD): depth at which HV drops to
 *       core + 50 (or ≈ 550 HV — the "carbonitriding spec" value).
 *
 * After the isothermal hold the workpiece is OIL- (or GAS-) QUENCHED
 * (mild) → martensitic case + RA + M(C,N) precipitates → LOW-T
 * temper (150-200 °C, lower than carburizing's 180-200 °C) to
 * reduce RA to ≤ 25 vol%. The case hardness REQUIRES the quench
 * to lock in martensite — distinct from nitriding (no quench).
 *
 * Physical stages (ramp → potential establishment → dual diffusion →
 * carbonitride precipitation → effective case → quench-ready):
 *
 *   Stage 0 — PRE_CARBONITRIDE (cold or sub-process T):
 *     Workpiece below ≈ 700 °C. α-field ferrite, no C or N potential.
 *     Bulk composition unchanged.
 *
 *   Stage 1 — TEMPERATURE_RAMP (ascending into intermediate window):
 *     T rises into 760-870 °C band. Crosses AC1 (≈ 727 °C plain-C)
 *     into the γ+α two-phase region, then into stabilized γ (N
 *     extends γ down). Atmosphere not yet equilibrated. Surface
 *     activity rising.
 *
 *   Stage 2 — POTENTIAL_ESTABLISHMENT:
 *     Both Kc (carbon potential) and Kn (nitrogen potential) stabilize
 *     at process setpoint. Surface C and N rise toward solubility in
 *     N-stabilized γ. Combined potential KCN = Kc · 0.7 + Kn · 0.3
 *     reaches working window. Diffusion not yet substantial.
 *
 *   Stage 3 — DUAL_DIFFUSION:
 *     Surface-deposited C and N diffuse inward per coupled Fickian
 *     fields. Carbon diffusivity is LOWER than in pure carburizing
 *     (lower T → smaller D_C) but the N coupling boosts effective
 *     surface depletion → composite case-depth growth ≈ √(D_eff · t)
 *     where D_eff is intermediate. Case depth grows.
 *
 *   Stage 4 — CARBONITRIDE_PRECIPITATION:
 *     Surface (C+N) exceeds austenite solubility. Fine M(C,N)
 *     precipitates (Fe(C,N), Cr(C,N), Mo(C,N), V(C,N)) nucleate in
 *     the case as coherent nanometric particles. Surface hardness
 *     rises pre-quench.
 *
 *   Stage 5 — EFFECTIVE_CASE_FORMATION:
 *     Effective Case Depth (ECD) reaches target. Diffusion zone meets
 *     spec. Surface C+N at saturation; precipitates dispersed.
 *     Pre-quench condition.
 *
 *   Stage 6 — QUENCH_READY (service-ready after quench + temper):
 *     Effective case depth + carbonitride precipitates established.
 *     Workpiece is QUENCH_READY — pull to oil (or gas) quench. Quench
 *     produces martensitic case + RA + retained M(C,N). Temper at
 *     150-200 °C reduces RA. Service-ready AFTER QUENCH+TEMPER.
 *
 *   Stage 7 — OVER_CARBONITRIDED (pathological):
 *     Excess surface (C+N) → continuous M(C,N) carbonitride NETWORK
 *     at grain boundaries (brittle), and/or excessive RA (> 35 vol%)
 *     after quench (soft spots, dimensional instability). Remedy:
 *     reduce KCN, shorten hold, or redesign atmosphere C/N ratio.
 *
 * Process constraints (intermediate γ-with-N-stabilization field):
 *
 *   - Must be IN intermediate field: drivingForce ∈
 *     [INTERMEDIATE_FIELD_MIN=0.40, INTERMEDIATE_FIELD_MAX=0.70]
 *     → intermediateFieldOk = 1. Above → degenerates to carburizing
 *     (T too high — N decomposes); below → degenerates to nitriding
 *     (T too low — γ collapses to α, no martensite possible on quench).
 *   - Combined potential KCN in window: kcnProxy ∈ [KCN_MIN=0.50,
 *     KCN_MAX=1.10], kcnIdeal = 0.80.
 *   - C/N ratio (mass) in working band: cnRatio ∈ [CN_RATIO_MIN=0.45,
 *     CN_RATIO_MAX=0.85], cnRatioIdeal = 0.70.
 *   - Surface (C+N) potential effective: surfaceActivity ≥
 *     SURFACE_MIN_CN = 0.65.
 *   - Carbonitride network not continuous: networkRisk ≤
 *     NETWORK_MAX = 0.45.
 *   - Retained austenite controlled: raProxy ≤ RA_MAX = 0.35.
 *   - Diffusion-zone gradient monotonic: gradientMonotonicity ≥
 *     MONOTONICITY_MIN = 0.55.
 *   - Diffusion-zone gradient fits erfc: erfcFit ≥ ERFC_FIT_MIN = 0.55.
 *   - Edges symmetric (no atmosphere shadow): asymmetryIndex ≤
 *     ASYMMETRY_MAX = 0.35.
 *
 * Kinetics:
 *
 *   - Two coupled Fick fields (C and N), single dominant case-depth
 *     proxy fitted to the bin profile.
 *   - Arrhenius D for the BLENDED diffusion: D_eff =
 *     0.7 · D_C + 0.3 · D_N. On the normalized drivingForce axis,
 *     Q_OVER_RT_CN_DIFFUSION = 4.1 (between carburizing 4.8 and
 *     nitriding 3.4).
 *   - √(Dt) reference: FDT_REFERENCE_CARBONITRIDING = 0.26 (between
 *     carburizing 0.30 and nitriding 0.22). Real case depth scales
 *     as √(Dt) just like the parent treatments.
 *
 * In DLMM context the carbonitriding analog tracks each bin's position
 * in the 1-D scan window as an analog "depth from the nearest surface".
 * Bins at the OUTERMOST edges (first & last CASE_BAND_FRAC = 0.18 of
 * populated bins) are SURFACE / EDGE-LAYER bins; bins near the center
 * (CORE_BAND_FRAC = 0.30) are CORE bins. Each bin's normalized reserve
 * serves as the local "C+N concentration" analog. A carbonitrided pool
 * shows EDGE-ERFC structure WITHOUT plateau (no compound layer — γ
 * field too hot for Fe-N compound formation), at LOWER drivingForce
 * than carburizing, and with measurable RETAINED-AUSTENITE proxy
 * (compound-layer-edge variance ABOVE pure carburizing's level due
 * to RA presence).
 *
 * DLMM structural signatures of carbonitriding:
 *
 *   - EDGE-DOMINANT WITHOUT PLATEAU — outer band bins hold higher
 *     reserves than core; outermost 1-2 bins do NOT plateau (no Fe-N
 *     compound layer at this T). Distinct from nitriding (plateau)
 *     and matches carburizing structurally.
 *   - INTERMEDIATE drivingForce — between α (nitriding) and pure γ
 *     (carburizing). Above ALPHA_FIELD_MAX (0.50) of nitriding AND
 *     below GAMMA_FIELD_MIN (0.50) of carburizing's higher band.
 *   - DUAL-SPECIES SIGNATURE — split flow, asymmetric x-fraction
 *     distribution detectable as an elevated (but bounded) edge
 *     variance vs pure carburizing. Carbonitride proxy combines
 *     surface concentration and reserveXFracStdev.
 *   - RA SIGNATURE — within-edge variance ELEVATED relative to
 *     carburizing (because RA softens edge spots), but bounded
 *     (ra ≤ RA_MAX = 0.35 under control).
 *   - MONOTONIC GRADIENT — moving from edge toward center, reserves
 *     DECREASE.
 *   - ERFC SHAPE — gradient fits erfc(x / √(Dt)).
 *   - SYMMETRIC EDGES — left and right outer bands comparable.
 *   - SHALLOWER CASE than carburizing — caseDepthProxy bounded by
 *     FDT_REFERENCE_CARBONITRIDING = 0.26.
 *   - INTERMEDIATE caseHardness — CARBONITRIDING_HV_SCALE = 1.05
 *     (between nitriding 1.10 and carburizing 1.00).
 *   - LOWER distortionProxy than carburizing — milder quench.
 *   - Distinct from nitriding (plateau + lower drivingForce).
 *   - Distinct from carburizing (lower drivingForce, presence of N
 *     signal, elevated RA).
 *   - Distinct from the four bulk routes (uniform cross-section).
 *
 * DLMM phase analog:
 *
 *   - Bulk (C+N) (C₀)         ≈ coreActivity.
 *   - Surface (C+N) (Cs)      ≈ surfaceActivity.
 *   - Edge layer (case)       ≈ outermost CASE_BAND_FRAC bins.
 *   - Diffusion zone          ≈ same outer band (no compound layer
 *                               separation — all of the outer band is
 *                               case here, distinct from nitriding).
 *   - Hold T                  ≈ drivingForce (must be in intermediate
 *                               field).
 *   - Kc                      ≈ kcProxy (carbon potential, mapped from
 *                               drivingForce × surfaceActivity).
 *   - Kn                      ≈ knProxy (nitrogen potential, mapped
 *                               from cnRatio × surfaceActivity).
 *   - KCN                     = 0.7·Kc + 0.3·Kn (combined potential).
 *   - C/N flux ratio          ≈ cnRatio (mapped from xFrac asymmetry).
 *   - √(Dt)                   ≈ caseDepthProxy.
 *   - ECD                      = bin depth where activity drops to
 *                               ECD_THRESHOLD (0.40).
 *   - Carbonitride proxy      ≈ M(C,N) precipitation density signature.
 *   - RA proxy                ≈ within-edge variance + cnRatio
 *                               contribution (N stabilizes γ → RA).
 *   - Network risk            ≈ Continuous-network proxy (over-CN).
 *
 * Regimes:
 *   NO_CARBONITRIDING_DRIVE  — no prior intermediate-field hold inferable.
 *   PRE_CARBONITRIDE         — cold, no C or N potential.
 *   TEMPERATURE_RAMP         — heating into intermediate window.
 *   POTENTIAL_ESTABLISHMENT  — Kc and Kn rising toward setpoint.
 *   DUAL_DIFFUSION           — both species diffusing inward.
 *   CARBONITRIDE_PRECIPITATION — M(C,N) carbonitrides nucleating.
 *   EFFECTIVE_CASE_FORMATION — case reaches target depth.
 *   QUENCH_READY             — service-ready after mild quench + temper.
 *   OVER_CARBONITRIDED       — continuous network or excess RA.
 *   EXCESS_RETAINED_AUSTENITE — soft spots from N over-stabilizing γ.
 *   UNDER_CARBONITRIDED      — KCN low or hold short, no effective case.
 *   UNEVEN_CARBONITRIDING    — gas-flow asymmetry.
 *   DECARBURIZATION_LIKE     — reverse gradient (surface < core).
 *   OVER_INTERMEDIATE_FIELD  — T crossed into pure γ (use carburizing).
 *   SUB_INTERMEDIATE_FIELD   — T below γ — use nitriding skill.
 *
 * Verdicts:
 *   NO_CARBONITRIDING_DRIVE — no prior hold inferable.
 *   QUENCH_READY            — proceed to oil/gas quench + temper.
 *   OVER_CARBONITRIDED      — continuous M(C,N) network defect.
 *   EXCESS_RA               — retained austenite > RA_MAX.
 *   UNDER_CARBONITRIDED     — case insufficient.
 *   UNEVEN_CARBONITRIDING   — atmosphere shadowing defect.
 *   DECARBURIZATION_LIKE    — treatment running backward.
 *   OVER_INTERMEDIATE_FIELD — T above intermediate; use carburizing.
 *   SUB_INTERMEDIATE_FIELD  — T below intermediate; use nitriding.
 *   CARBONITRIDE_PRECIPITATION — mid-late stage.
 *   DUAL_DIFFUSION          — mid stage.
 *   POTENTIAL_ESTABLISHMENT — early stage.
 *   TEMPERATURE_RAMP        — ramping.
 *   PRE_CARBONITRIDE        — cold.
 *   INTERMEDIATE_CARBONITRIDING — mixed indicators.
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

// Intermediate γ-with-N-stabilization band on the normalized drivingForce
// axis. Carbonitriding requires the workpiece to be held BETWEEN the
// nitriding α-field (0.20-0.50) and the carburizing γ-field (0.50-0.85)
// — specifically in the BAND where N can stabilize γ down to ≈ 760 °C.
// Above → degenerates to pure carburizing (T too high — N decomposes);
// below → degenerates to nitriding (γ collapses to α).
const INTERMEDIATE_FIELD_MIN = 0.40;
const INTERMEDIATE_FIELD_MAX = 0.70;
const INTERMEDIATE_FIELD_IDEAL = 0.55;

// Combined carbonitriding potential KCN = 0.7·Kc + 0.3·Kn (mass-weighted).
// Working window for monophase martensitic-case + carbonitride control.
const KCN_MIN = 0.50;
const KCN_MAX = 1.10;
const KCN_IDEAL = 0.80;

// C/N flux ratio (mass). Real carbonitriding atmospheres target ~70%
// carbon flux and ~30% nitrogen flux. Outside this band → unbalanced
// case (too-pure carbide or too-pure nitride character).
const CN_RATIO_MIN = 0.45;
const CN_RATIO_MAX = 0.85;
const CN_RATIO_IDEAL = 0.70;

// Surface (C+N) potential thresholds on a normalized concentration axis.
const SURFACE_MIN_CN = 0.65;
const SURFACE_PLATEAU_THRESHOLD = 0.85;
const SURFACE_SATURATION = 1.05;
const BOOST_TARGET = 1.00;
const DIFFUSE_TARGET = 0.85;

// Core baseline (C₀ + N₀ analog).
const CORE_BASELINE = 0.18;

// Effective Case Depth threshold (HV at core + 50 analog).
const ECD_THRESHOLD = 0.40;

// Total Case Depth threshold.
const TCD_THRESHOLD = 0.22;

// Target case thickness as a fraction of half the populated bin count.
const CASE_THICKNESS_TARGET = 0.24;

// Edge / core band fractions.
const CASE_BAND_FRAC = 0.18;
const CORE_BAND_FRAC = 0.30;

// Continuous M(C,N) carbonitride NETWORK risk threshold. Surface-band
// concentration above this fraction → continuous brittle network.
const NETWORK_SURFACE_FRAC = 0.50;
const NETWORK_MAX = 0.45;

// Retained austenite (RA) maximum control limit. N stabilizes γ → RA
// 10-30 vol% common; above 35 vol% → defect (soft spots, dim. instability).
const RA_MAX = 0.35;
const RA_IDEAL = 0.18;

// Edge dominance: outer-band mean / (outer + core) mean ratio.
const EDGE_DOMINANCE_MIN = 0.55;

// Gradient quality thresholds.
const MONOTONICITY_MIN = 0.55;
const ERFC_FIT_MIN = 0.55;

// Asymmetry / reverse-gradient thresholds.
const ASYMMETRY_MAX = 0.35;
const REVERSE_THRESHOLD = 0.10;

// Alloy-former proxy minimum (M = Cr, Mo, V, Fe — all M(C,N)-formers).
const ALLOY_FACTOR_MIN = 0.25;

// Uniformity reference (informational — carbonitriding INTENTIONALLY
// breaks uniformity).
const UNIFORMITY_REFERENCE = 0.60;

// Arrhenius Q/RT for BLENDED C+N diffusion in N-stabilized γ-Fe
// (normalized). Tuned BETWEEN carburizing's 4.8 (γ at 900 °C) and
// nitriding's 3.4 (α at 550 °C). The intermediate-field band 0.40-0.70
// gives an intermediate exponent.
const Q_OVER_RT_CN_DIFFUSION = 4.1;

// √(Dt) reference for case-depth proxy. Carbonitriding case depth is
// SHALLOWER than carburizing (lower T) but DEEPER than nitriding
// (higher T + dual species). FDT_REF tuned to fall between the two
// parents.
const FDT_REFERENCE_CARBONITRIDING = 0.26;

// Case-hardness scaling. Carbonitriding case hardness is INTERMEDIATE
// in real units (60-65 HRC, between carburizing 58-62 and nitriding
// 65-70), driven by triple hardening: martensite + carbide + nitride.
const CARBONITRIDING_HV_SCALE = 1.05;

// Distortion baseline. Carbonitriding distortion is BETWEEN carburizing
// (high — full oil quench) and nitriding (≈ zero — no quench). Mild
// quench + lower hold T + N-lowered Ms → ≈ 0.05-0.15% real dimensional
// change vs carburizing's 0.10-0.30%.
const DISTORTION_BASELINE = 0.10;

// Stage thresholds on composite stageProgress.
const STAGE_1_BOUND = 0.12;
const STAGE_2_BOUND = 0.22;
const STAGE_3_BOUND = 0.34;
const STAGE_4_BOUND = 0.46;
const STAGE_5_BOUND = 0.60;
const STAGE_6_BOUND = 0.78;

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

interface BinCarbonitriding {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  depthFromSurface: number;          // 0 at edge, 1 at core (normalized)
  concentration: number;             // 0-1 normalized (C+N)-analog
  expectedErfc: number;              // 0-1 fitted erfc expectation
  erfcResidual: number;              // |concentration - expectedErfc|
  inEdgeLayer: number;               // 0/1 bin in outer CASE_BAND_FRAC band
  inDiffusionZone: number;           // 0/1 same — no compound layer split
  inCoreBand: number;                // 0/1
  edgeLayerSignal: number;           // 0-1 bin in case with high (C+N)
  diffusionZoneSignal: number;       // 0-1 bin in diffusion zone with effective (C+N)
  caseSignal: number;                // 0-1 bin inside effective case
  gradientSignal: number;            // 0-1 monotonic decrease toward core
  carbonitrideSignal: number;        // 0-1 bin shows M(C,N) precipitate signature
  raSignal: number;                  // 0-1 bin shows retained-austenite signature
  networkSignal: number;             // 0-1 bin in over-CN network position
  reverseSignal: number;             // 0-1 surface-band bin lower than core
  unevenSignal: number;              // 0-1 L/R asymmetry contribution
  stageBin: number;                  // 0-7
  arrheniusActivation: number;
  carbonitridingDegree: number;      // 0-1 composite
}

interface CarbonitridingProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  drivingForce: number;
  priorPeakDrivingForce: number;
  intermediateFieldOk: number;       // 0/1
  intermediateFieldProximity: number;// 0-1 closeness to IDEAL
  subIntermediateField: number;      // 0/1
  overIntermediateField: number;     // 0/1
  kcProxy: number;                   // 0-1 carbon-potential analog
  knProxy: number;                   // 0-1 nitrogen-potential analog
  kcnProxy: number;                  // 0-2 combined potential
  kcnInWindow: number;               // 0/1
  kcnProximity: number;              // 0-1 closeness to KCN_IDEAL
  cnRatio: number;                   // C/N mass ratio analog
  cnRatioInWindow: number;           // 0/1
  cnRatioProximity: number;          // 0-1 closeness to CN_RATIO_IDEAL
  surfaceActivity: number;
  edgeLayerActivity: number;         // outer band activity
  diffusionZoneActivity: number;
  coreActivity: number;
  surfaceCoreDelta: number;
  surfaceCoreRatio: number;
  edgeDominanceFraction: number;
  surfaceLeftActivity: number;
  surfaceRightActivity: number;
  asymmetryIndex: number;
  gradientMonotonicity: number;
  erfcFit: number;
  erfcDt: number;
  diffusivityProxy: number;
  caseDepthProxy: number;
  effectiveCaseBins: number;
  totalCaseBins: number;
  caseThicknessFraction: number;
  caseThicknessMeetsTarget: number;
  carbonitrideProxy: number;         // 0-1 M(C,N) precipitate development
  raProxy: number;                   // 0-1 retained austenite analog
  raExceedsTarget: number;           // 0/1
  networkRisk: number;               // 0-1 continuous M(C,N) network
  alloyFactorProxy: number;
  alloyFormerOk: number;
  diffusionZoneProxy: number;
  surfaceEstablishedProxy: number;
  uniformityIndex: number;           // INFORMATIONAL — HIGH = NOT carbonitrided
  reserveCV: number;
  reserveXFracStdev: number;
  underCarbonitrideRisk: number;
  unevenCarbonitridingRisk: number;
  reverseGradientRisk: number;
  overIntermediateRisk: number;
  subIntermediateRisk: number;
  caseHardnessProxy: number;
  coreToughnessProxy: number;
  wearResistanceProxy: number;
  fatigueResistanceProxy: number;
  distortionProxy: number;           // INTERMEDIATE — milder than carburizing
  caseCoreRatio: number;
  arrheniusActivation: number;
  stageProgress: number;
  dominantStage: number;             // 0-7
  carbonitridingIndex: number;       // 0-100 composite
  carbonitridingRegime: string;
  carbonitridingVerdict: string;
  stageDistribution: number[];       // length 8
  topBins: BinCarbonitriding[];
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

function xFracOf(bin: BinReserves): number {
  const t = bin.reserveXUsd + bin.reserveYUsd;
  if (t === 0) return 0.5;
  return bin.reserveXUsd / t;
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

function erfc(x: number): number {
  return 1 - erf(x);
}

function depthFromSurface(index: number, n: number): number {
  if (n <= 1) return 0;
  const half = (n - 1) / 2;
  const edgeDist = Math.min(index, n - 1 - index);
  return Math.max(0, Math.min(1, edgeDist / Math.max(0.5, half)));
}

function normalizeConcentrations(sortedBins: BinReserves[]): number[] {
  if (sortedBins.length === 0) return [];
  const maxU = Math.max(...sortedBins.map((b) => b.totalUsd));
  if (maxU <= 0) return sortedBins.map(() => 0);
  return sortedBins.map((b) => b.totalUsd / maxU);
}

// Outer band / core band partitioning. Carbonitriding does NOT have a
// compound layer at the surface (T too high for Fe-N white layer), so the
// outer band is treated as a single edge layer (case + diffusion zone
// continuous), distinct from nitriding's compound + diffusion split.
function partitionBands(n: number): {
  leftEdge: number[],
  rightEdge: number[],
  edge: number[],
  core: number[],
} {
  const edgeK = Math.max(1, Math.floor(n * CASE_BAND_FRAC));
  const leftEdge: number[] = [];
  const rightEdge: number[] = [];
  for (let i = 0; i < Math.min(edgeK, n); i++) leftEdge.push(i);
  for (let i = Math.max(0, n - edgeK); i < n; i++) rightEdge.push(i);
  const edge = [...leftEdge, ...rightEdge];

  const coreK = Math.max(1, Math.floor(n * CORE_BAND_FRAC));
  const center = Math.floor(n / 2);
  const coreStart = Math.max(0, center - Math.floor(coreK / 2));
  const coreEnd = Math.min(n, coreStart + coreK);
  const core: number[] = [];
  for (let i = coreStart; i < coreEnd; i++) core.push(i);

  return { leftEdge, rightEdge, edge, core };
}

function bandMean(indices: number[], concentrations: number[]): number {
  if (indices.length === 0) return 0;
  let s = 0;
  for (const i of indices) s += concentrations[i];
  return s / indices.length;
}

function bandStdev(indices: number[], concentrations: number[]): number {
  if (indices.length < 2) return 0;
  const m = bandMean(indices, concentrations);
  let v = 0;
  for (const i of indices) v += (concentrations[i] - m) ** 2;
  return Math.sqrt(v / indices.length);
}

function gradientMonotonicity(concentrations: number[]): number {
  const n = concentrations.length;
  if (n < 3) return 0;
  const center = Math.floor(n / 2);
  const tol = 0.03;
  let total = 0;
  let hits = 0;
  for (let i = 0; i < center; i++) {
    const a = concentrations[i];
    const b = concentrations[i + 1];
    total++;
    if (a + tol >= b) hits++;
  }
  for (let i = n - 1; i > center; i--) {
    const a = concentrations[i];
    const b = concentrations[i - 1];
    total++;
    if (a + tol >= b) hits++;
  }
  return total > 0 ? hits / total : 0;
}

function fitErfc(
  depths: number[],
  concentrations: number[],
  surfaceC: number,
  coreC: number
): { fit: number, dt: number, expected: number[] } {
  const n = depths.length;
  if (n < 3) return { fit: 0, dt: 0, expected: new Array(n).fill(coreC) };

  const candidates = [0.05, 0.08, 0.12, 0.16, 0.22, 0.30, 0.40, 0.55, 0.80];
  let bestDt = candidates[0];
  let bestSSE = Infinity;
  let bestExpected: number[] = new Array(n).fill(coreC);

  const range = Math.max(1e-9, surfaceC - coreC);
  const meanObs = concentrations.reduce((s, v) => s + v, 0) / n;
  const varObs = concentrations.reduce((s, v) => s + (v - meanObs) ** 2, 0) / n;
  const varNorm = Math.max(1e-9, varObs);

  for (const dt of candidates) {
    let sse = 0;
    const expected: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = depths[i];
      const arg = x / (2 * Math.max(1e-6, dt));
      const e = coreC + range * erfc(arg);
      expected.push(e);
      const d = concentrations[i] - e;
      sse += d * d;
    }
    if (sse < bestSSE) {
      bestSSE = sse;
      bestDt = dt;
      bestExpected = expected;
    }
  }

  const mseNorm = bestSSE / n / varNorm;
  const fit = Math.max(0, Math.min(1, 1 - mseNorm));
  return { fit, dt: bestDt, expected: bestExpected };
}

function computeBinCarbonitriding(
  bin: BinReserves,
  index: number,
  activeBin: number,
  sortedBins: BinReserves[],
  concentrations: number[],
  expectedErfc: number[],
  depths: number[],
  bands: ReturnType<typeof partitionBands>,
  poolSurface: number,
  poolEdge: number,
  poolCore: number,
  poolAsymmetry: number,
  poolMonotonicity: number,
  poolErfcFit: number,
  poolIntermediateFieldOk: number,
  poolNetworkRisk: number,
  poolRaProxy: number,
  poolStageProg: number,
  poolCnRatioInWindow: number
): BinCarbonitriding {
  const distance = Math.abs(bin.binId - activeBin);
  const depth = depths[index];
  const conc = concentrations[index];
  const expected = expectedErfc[index];
  const residual = Math.abs(conc - expected);

  const inEdgeLayer = bands.edge.includes(index) ? 1 : 0;
  const inDiffusionZone = inEdgeLayer; // single-layer case
  const inCoreBand = bands.core.includes(index) ? 1 : 0;

  // Edge-layer signal: bin in case with high (C+N) AND pool in intermediate
  // field.
  const edgeLayerSignal = r4(
    inEdgeLayer *
      (conc >= ECD_THRESHOLD ? 1 : conc / Math.max(0.01, ECD_THRESHOLD)) *
      poolIntermediateFieldOk
  );

  // Diffusion-zone signal: same band, scaled by ECD.
  const diffusionZoneSignal = r4(
    inEdgeLayer * (conc >= ECD_THRESHOLD ? 1 : conc / Math.max(0.01, ECD_THRESHOLD))
  );

  // Case signal: bin concentration above ECD — effective-case member.
  const caseSignal = r4(conc >= ECD_THRESHOLD ? 1 : conc / ECD_THRESHOLD);

  // Carbonitride-precipitate signal: high (C+N) bin near edge with the
  // C/N ratio in window — M(C,N) precipitates can form.
  const carbonitrideSignal = r4(
    inEdgeLayer *
      (conc >= 0.6 ? 1 : conc / 0.6) *
      poolCnRatioInWindow
  );

  // Retained-austenite signal: edge-band bin with elevated local activity
  // AND the pool RA proxy elevated (RA forms in N-stabilized γ on quench).
  const raSignal = r4(
    inEdgeLayer *
      (conc >= SURFACE_PLATEAU_THRESHOLD ? 1 :
        conc / Math.max(0.01, SURFACE_PLATEAU_THRESHOLD)) *
      poolRaProxy
  );

  // Network signal: edge bin in a pool with continuous M(C,N) network risk.
  const networkSignal = r4(
    inEdgeLayer * (poolNetworkRisk > NETWORK_MAX ? 1 : poolNetworkRisk / Math.max(0.01, NETWORK_MAX))
  );

  // Gradient signal — monotonic decrease from this bin toward the center.
  let gradientSignal = 0;
  const n = concentrations.length;
  const center = Math.floor(n / 2);
  const tol = 0.03;
  if (index < center) {
    const a = conc;
    const b = concentrations[Math.min(n - 1, index + 1)];
    gradientSignal = a + tol >= b ? 1 : Math.max(0, 1 - (b - a) / Math.max(0.05, a + 0.05));
  } else if (index > center) {
    const a = conc;
    const b = concentrations[Math.max(0, index - 1)];
    gradientSignal = a + tol >= b ? 1 : Math.max(0, 1 - (b - a) / Math.max(0.05, a + 0.05));
  } else {
    gradientSignal = poolMonotonicity;
  }
  gradientSignal = r4(gradientSignal);

  // Reverse signal (decarburization-like — surface below core).
  const reverseSignal = r4(
    inEdgeLayer && conc + REVERSE_THRESHOLD < poolCore ? 1 : 0
  );

  // Uneven signal.
  let unevenSignal = 0;
  if (inEdgeLayer) {
    unevenSignal = poolAsymmetry > ASYMMETRY_MAX ? 1 : poolAsymmetry / ASYMMETRY_MAX;
  }
  unevenSignal = r4(unevenSignal);

  const arrheniusActivation = r4(Math.max(0.01, Math.min(1,
    Math.exp(-Q_OVER_RT_CN_DIFFUSION / Math.max(0.05, INTERMEDIATE_FIELD_IDEAL + 0.05))
  )));

  // Stage assignment per bin (follows pool progress banding).
  let stageBin = 0;
  if (poolNetworkRisk > 0.7 && inEdgeLayer) {
    stageBin = 7;
  } else if (poolStageProg < STAGE_1_BOUND) {
    stageBin = 0;
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
  } else if (poolStageProg >= STAGE_1_BOUND) {
    stageBin = 1;
  } else {
    stageBin = 0;
  }

  const carbonitridingDegree = r4(Math.max(0, Math.min(1,
    edgeLayerSignal * 0.20 +
    diffusionZoneSignal * 0.15 +
    caseSignal * 0.15 +
    gradientSignal * 0.15 +
    carbonitrideSignal * 0.10 +
    (1 - networkSignal) * 0.05 +
    (1 - raSignal * 0.5) * 0.05 +
    (1 - reverseSignal) * 0.05 +
    (stageBin / 6) * 0.10
  )));

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    depthFromSurface: r4(depth),
    concentration: r4(conc),
    expectedErfc: r4(expected),
    erfcResidual: r4(residual),
    inEdgeLayer,
    inDiffusionZone,
    inCoreBand,
    edgeLayerSignal,
    diffusionZoneSignal,
    caseSignal,
    gradientSignal,
    carbonitrideSignal,
    raSignal,
    networkSignal,
    reverseSignal,
    unevenSignal,
    stageBin,
    arrheniusActivation,
    carbonitridingDegree,
  };
}

function analyzeCarbonitriding(bins: BinReserves[], pool: AppPool): CarbonitridingProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;

  const turnover = pool.tvlUsd > 0 ? volume / pool.tvlUsd : 0;
  // For carbonitriding, drivingForce is mapped to the INTERMEDIATE band
  // — between nitriding (α-field 0.10-0.60) and carburizing (γ-field
  // ≈ 0.30-0.95). Raw turnover is mapped into the intermediate band
  // 0.20-0.80.
  const drivingForce = Math.min(1, turnover * 0.6 + 0.20);

  const priorPeakDrivingForce = Math.min(1, drivingForce * 1.3 + 0.15);

  // Intermediate-field checks.
  const intermediateFieldOk = (drivingForce >= INTERMEDIATE_FIELD_MIN && drivingForce <= INTERMEDIATE_FIELD_MAX) ? 1 : 0;
  const subIntermediateField = drivingForce < INTERMEDIATE_FIELD_MIN ? 1 : 0;
  const overIntermediateField = drivingForce > INTERMEDIATE_FIELD_MAX ? 1 : 0;
  const intermediateFieldProximity = intermediateFieldOk
    ? Math.max(0, 1 - Math.abs(drivingForce - INTERMEDIATE_FIELD_IDEAL) /
        Math.max(0.01, (INTERMEDIATE_FIELD_MAX - INTERMEDIATE_FIELD_MIN) / 2))
    : 0;

  // Per-bin concentrations (max-normalized to [0,1]).
  const concentrations = normalizeConcentrations(sorted);
  const depths = sorted.map((_, i) => depthFromSurface(i, n));

  // Bands.
  const bands = partitionBands(n);
  const leftMean = bandMean(bands.leftEdge, concentrations);
  const rightMean = bandMean(bands.rightEdge, concentrations);
  const edgeMean = bandMean(bands.edge, concentrations);
  const coreMean = bandMean(bands.core, concentrations);
  const surfaceMean = edgeMean; // surface = outer-band mean for carbonitriding

  const surfaceCoreDelta = surfaceMean - coreMean;
  const surfaceCoreRatio = coreMean > 1e-6 ? surfaceMean / coreMean : (surfaceMean > 0 ? 10 : 0);
  const edgeDominanceFraction = (surfaceMean + coreMean) > 0
    ? surfaceMean / (surfaceMean + coreMean)
    : 0;

  const maxEdge = Math.max(leftMean, rightMean, 1e-6);
  const asymmetryIndex = Math.abs(leftMean - rightMean) / maxEdge;

  // Edge-layer variance — proxy for retained-austenite heterogeneity.
  const edgeVariance = bandStdev(bands.edge, concentrations);

  // Monotonic gradient quality.
  const monotonicity = gradientMonotonicity(concentrations);

  // Erfc fit (fit to the diffusion zone — combined C+N erfc).
  const { fit: erfcFit, dt: erfcDt, expected: expectedErfc } = fitErfc(
    depths, concentrations,
    Math.max(surfaceMean, coreMean + 0.05),
    Math.min(coreMean, surfaceMean - 0.01)
  );

  // Arrhenius diffusivity proxy (blended C+N in N-stabilized γ-Fe).
  const diffusivityProxy = Math.max(0, Math.min(1,
    Math.exp(-Q_OVER_RT_CN_DIFFUSION / Math.max(0.05, drivingForce + 0.05))
  ));

  // Case depth proxy (√(Dt) on normalized axis).
  const caseDepthProxy = Math.max(0, Math.min(1, erfcDt / Math.max(0.01, FDT_REFERENCE_CARBONITRIDING)));

  // Effective / total case bin counts.
  const effectiveCaseBins = concentrations.filter((c) => c >= ECD_THRESHOLD).length;
  const totalCaseBins = concentrations.filter((c) => c >= TCD_THRESHOLD).length;
  const halfN = Math.max(1, Math.floor(n / 2));
  const caseThicknessFraction = effectiveCaseBins / (2 * halfN);
  const caseThicknessMeetsTarget = caseThicknessFraction >= CASE_THICKNESS_TARGET ? 1 : 0;

  // Alloy-former proxy — use xFracStdev as surrogate for alloying-element
  // heterogeneity. M = Cr, Mo, V, Fe — all M(C,N)-formers.
  const xFracs = sorted.map((b) => xFracOf(b));
  const xFracMean = xFracs.length > 0 ? xFracs.reduce((s, v) => s + v, 0) / xFracs.length : 0.5;
  const xFracVar = xFracs.length > 1
    ? xFracs.reduce((s, v) => s + (v - xFracMean) ** 2, 0) / xFracs.length
    : 0;
  const reserveXFracStdev = Math.sqrt(xFracVar);
  const alloyFactorProxy = Math.max(0, Math.min(1, reserveXFracStdev * 2.0 + 0.10));
  const alloyFormerOk = alloyFactorProxy >= ALLOY_FACTOR_MIN ? 1 : 0;

  // C/N ratio proxy — derived from xFracMean + reserveXFracStdev. The
  // x-fraction asymmetry across bins is treated as the structural
  // analog of dual-species (C+N) flux balance.
  // Map xFracMean from [0,1] into a CN_RATIO range via logistic-like
  // transform centered at 0.5. Real cnRatio = 0.7 ± 0.2 is target.
  const cnRatio = Math.max(0, Math.min(1.5,
    0.4 + (xFracMean - 0.3) * 0.6 + reserveXFracStdev * 0.4
  ));
  const cnRatioInWindow = (cnRatio >= CN_RATIO_MIN && cnRatio <= CN_RATIO_MAX) ? 1 : 0;
  const cnRatioProximity = cnRatioInWindow
    ? Math.max(0, 1 - Math.abs(cnRatio - CN_RATIO_IDEAL) /
        Math.max(0.01, (CN_RATIO_MAX - CN_RATIO_MIN) / 2))
    : 0;

  // Carbon and nitrogen potential proxies. Kc dominates by mass (~70%)
  // and Kn by ~30%. Both rise with surfaceMean and intermediateFieldOk.
  const kcProxy = Math.max(0, Math.min(2,
    (intermediateFieldOk ? 1.0 : 0.3) * surfaceMean * 1.0 +
    intermediateFieldProximity * 0.15
  ));
  const knProxy = Math.max(0, Math.min(2,
    (intermediateFieldOk ? 1.0 : 0.3) * surfaceMean * 0.9 +
    cnRatioProximity * 0.20
  ));
  const kcnProxy = Math.max(0, Math.min(2,
    kcProxy * 0.7 + knProxy * 0.3
  ));
  const kcnInWindow = (kcnProxy >= KCN_MIN && kcnProxy <= KCN_MAX) ? 1 : 0;
  const kcnProximity = kcnInWindow
    ? Math.max(0, 1 - Math.abs(kcnProxy - KCN_IDEAL) /
        Math.max(0.01, (KCN_MAX - KCN_MIN) / 2))
    : 0;

  // Surface establishment proxy.
  const surfaceEstablishedProxy = Math.max(0, Math.min(1,
    Math.max(0, surfaceMean - CORE_BASELINE) /
    Math.max(0.01, BOOST_TARGET - CORE_BASELINE)
  ));

  // Diffusion-zone proxy — how developed is the case.
  const diffusionZoneProxy = Math.max(0, Math.min(1,
    (edgeMean >= ECD_THRESHOLD ? 0.4 : edgeMean / Math.max(0.01, ECD_THRESHOLD) * 0.4) +
    (edgeDominanceFraction >= EDGE_DOMINANCE_MIN ? 0.2 :
      edgeDominanceFraction / Math.max(0.01, EDGE_DOMINANCE_MIN) * 0.2) +
    (caseDepthProxy >= 0.5 ? 0.2 : caseDepthProxy * 0.4) +
    (alloyFormerOk ? 0.2 : alloyFactorProxy / Math.max(0.01, ALLOY_FACTOR_MIN) * 0.2)
  ));

  // Carbonitride-precipitate proxy — combines surface enrichment, C/N
  // ratio control, alloy formers, and case depth. Real M(C,N) develops
  // when surface (C+N) > austenite solubility AND C/N ratio is balanced
  // AND M (Cr, Mo, V, Fe) is present.
  const carbonitrideProxy = Math.max(0, Math.min(1,
    (surfaceMean >= 0.7 ? 0.30 : surfaceMean / 0.7 * 0.30) +
    cnRatioProximity * 0.25 +
    (kcnInWindow ? 0.15 : 0) +
    (alloyFormerOk ? 0.15 : alloyFactorProxy / Math.max(0.01, ALLOY_FACTOR_MIN) * 0.15) +
    caseDepthProxy * 0.15
  ));

  // Retained-austenite proxy — N stabilizes γ → RA on quench. Higher
  // when cnRatio leans toward N (lower cnRatio → more N → more RA),
  // when surfaceMean is high, and when edge variance is elevated.
  // Bounded by RA_MAX.
  const raProxy = Math.max(0, Math.min(1,
    Math.max(0, (CN_RATIO_IDEAL - cnRatio)) * 0.40 +     // N-rich → more RA
    (surfaceMean > SURFACE_PLATEAU_THRESHOLD ? 0.20 : surfaceMean / SURFACE_PLATEAU_THRESHOLD * 0.20) +
    edgeVariance * 0.30 +
    (kcnProxy > KCN_MAX ? 0.20 : 0)
  ));
  const raExceedsTarget = raProxy > RA_MAX ? 1 : 0;

  // Network risk — continuous M(C,N) carbonitride network at grain
  // boundaries. Triggers when surface activity is over-saturated
  // (surface → SURFACE_SATURATION) or KCN is above window.
  const networkRisk = Math.max(0, Math.min(1,
    (edgeMean > NETWORK_SURFACE_FRAC + 0.30 ? 0.50 :
      Math.max(0, edgeMean - NETWORK_SURFACE_FRAC) / 0.30 * 0.50) +
    (surfaceMean > SURFACE_SATURATION ? 0.30 : 0) +
    (kcnProxy > KCN_MAX ? 0.20 : 0)
  ));

  // Reserves CV (informational).
  const totalMean = n > 0 ? totalUsd / n : 0;
  const totalVar = n > 1 && totalMean > 0
    ? sorted.reduce((s, b) => s + (b.totalUsd - totalMean) ** 2, 0) / n
    : 0;
  const reserveCV = totalMean > 0 ? Math.sqrt(totalVar) / totalMean : 0;
  const uniformityIndex = Math.max(0, Math.min(1, 1 - reserveCV));

  // Other risks.
  const underCarbonitrideRisk = Math.max(0, Math.min(1,
    (kcnProxy < KCN_MIN ? 0.40 : 0) +
    (surfaceMean < SURFACE_MIN_CN ? 0.25 : 0) +
    (caseThicknessFraction < CASE_THICKNESS_TARGET ? 0.20 : 0) +
    (!alloyFormerOk ? 0.15 : 0)
  ));

  const unevenCarbonitridingRisk = Math.max(0, Math.min(1,
    (asymmetryIndex > ASYMMETRY_MAX ? 0.50 : asymmetryIndex / Math.max(0.01, ASYMMETRY_MAX) * 0.50) +
    (asymmetryIndex > 0.5 ? 0.30 : 0) +
    (leftMean < 0.2 || rightMean < 0.2 ? 0.20 : 0)
  ));

  const reverseGradientRisk = Math.max(0, Math.min(1,
    (surfaceMean + REVERSE_THRESHOLD < coreMean ? 0.60 : 0) +
    (edgeDominanceFraction < 0.45 ? 0.25 : 0) +
    (surfaceMean < CORE_BASELINE ? 0.15 : 0)
  ));

  const overIntermediateRisk = overIntermediateField ?
    Math.min(1, (drivingForce - INTERMEDIATE_FIELD_MAX) / 0.25 + 0.5) : 0;
  const subIntermediateRisk = subIntermediateField ?
    Math.min(1, (INTERMEDIATE_FIELD_MIN - drivingForce) / 0.20 + 0.5) : 0;

  // Case hardness & core toughness proxies (carbonitriding scale).
  const caseHardnessProxy = Math.max(0, Math.min(1,
    CARBONITRIDING_HV_SCALE * (
      surfaceMean * 0.30 +
      caseThicknessFraction * 0.20 +
      carbonitrideProxy * 0.20 +
      (1 - networkRisk) * 0.10 +
      (1 - raProxy * 0.5) * 0.10 +     // RA softens case
      kcnProximity * 0.10
    )
  ));
  // Core toughness — carbonitriding's mild quench preserves more core
  // toughness than carburizing's full oil quench. Proxy: low core
  // concentration + intermediate-field control + low uneven risk.
  const coreToughnessProxy = Math.max(0, Math.min(1,
    Math.max(0, 1 - coreMean) * 0.40 +
    (coreMean <= CORE_BASELINE + 0.15 ? 0.30 :
      Math.max(0, 0.30 - (coreMean - CORE_BASELINE) * 1.0)) +
    (1 - overIntermediateRisk) * 0.20 +
    (1 - unevenCarbonitridingRisk) * 0.10
  ));
  const wearResistanceProxy = Math.max(0, Math.min(1,
    caseHardnessProxy * 0.55 +
    carbonitrideProxy * 0.20 +
    (1 - networkRisk) * 0.15 +
    (1 - raProxy * 0.5) * 0.10
  ));
  // Fatigue resistance — carbonitriding inherits BOTH benefits:
  // compressive residual stress (from quench-derived martensite +
  // case-core volume mismatch, like carburizing) AND fine M(C,N)
  // precipitates (intermediate between carbide and nitride). Strong
  // but not as flagship as nitriding (which has lower distortion).
  const fatigueResistanceProxy = Math.max(0, Math.min(1,
    caseHardnessProxy * 0.40 +
    carbonitrideProxy * 0.20 +
    (1 - reverseGradientRisk) * 0.15 +
    (1 - networkRisk) * 0.15 +
    diffusionZoneProxy * 0.10
  ));
  // Distortion is INTERMEDIATE for carbonitriding. Mild quench + lower
  // hold T + N-lowered Ms → less distortion than carburizing but more
  // than nitriding's near-zero. Triggers from network risk and uneven.
  const distortionProxy = Math.max(0, Math.min(1,
    DISTORTION_BASELINE +
    overIntermediateRisk * 0.40 +
    networkRisk * 0.25 +
    unevenCarbonitridingRisk * 0.15 +
    raProxy * 0.20  // RA → secondary aging instability
  ));

  const caseCoreRatio = coreToughnessProxy > 1e-6
    ? caseHardnessProxy / coreToughnessProxy
    : (caseHardnessProxy > 0 ? 10 : 0);

  const arrheniusActivation = Math.max(0.01, Math.min(1,
    Math.exp(-Q_OVER_RT_CN_DIFFUSION / Math.max(0.05, drivingForce + 0.05))
  ));

  // Composite stage progress.
  const stageProgress = Math.max(0, Math.min(1,
    intermediateFieldOk * 0.10 +
    kcnInWindow * 0.10 +
    cnRatioInWindow * 0.05 +
    surfaceEstablishedProxy * 0.10 +
    diffusionZoneProxy * 0.10 +
    carbonitrideProxy * 0.15 +
    monotonicity * 0.10 +
    erfcFit * 0.10 +
    Math.max(0, 1 - asymmetryIndex) * 0.05 +
    caseDepthProxy * 0.10 +
    Math.max(0, 1 - networkRisk) * 0.05
  ));

  // Dominant stage.
  let dominantStage = 0;
  if (networkRisk > 0.7 || (raExceedsTarget && stageProgress >= STAGE_5_BOUND)) {
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
    computeBinCarbonitriding(
      b, i, activeBin, sorted,
      concentrations, expectedErfc, depths, bands,
      surfaceMean, edgeMean, coreMean,
      asymmetryIndex, monotonicity, erfcFit,
      intermediateFieldOk, networkRisk, raProxy, stageProgress, cnRatioInWindow
    )
  );

  const stageDistribution = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const b of binRecs) {
    stageDistribution[Math.min(7, Math.max(0, b.stageBin))]++;
  }

  // Composite carbonitriding index 0-100.
  const stageScore = Math.min(25, stageProgress * 25);
  const structureScore = Math.min(25,
    edgeDominanceFraction * 8 +
    monotonicity * 6 +
    erfcFit * 5 +
    diffusionZoneProxy * 3 +
    carbonitrideProxy * 3
  );
  const propertyScore = Math.min(25,
    caseHardnessProxy * 7 +
    coreToughnessProxy * 5 +
    wearResistanceProxy * 5 +
    fatigueResistanceProxy * 5 +
    (1 - distortionProxy) * 3
  );
  const processScore = Math.min(25,
    (intermediateFieldOk ? 4 : 0) +
    intermediateFieldProximity * 2 +
    (kcnInWindow ? 3 : 0) +
    kcnProximity * 2 +
    (cnRatioInWindow ? 3 : 0) +
    cnRatioProximity * 2 +
    (caseThicknessMeetsTarget ? 3 : 0) +
    (alloyFormerOk ? 2 : 0) +
    Math.max(0, 2 - networkRisk * 2) +
    Math.max(0, 2 - raProxy * 2)
  );
  const carbonitridingIndex = Math.round(
    Math.min(100, stageScore + structureScore + propertyScore + processScore)
  );

  // Regime selection.
  let carbonitridingRegime: string;
  if (priorPeakDrivingForce < INTERMEDIATE_FIELD_MIN * 0.8) {
    carbonitridingRegime = "NO_CARBONITRIDING_DRIVE";
  } else if (overIntermediateField) {
    carbonitridingRegime = "OVER_INTERMEDIATE_FIELD";
  } else if (subIntermediateField) {
    carbonitridingRegime = "SUB_INTERMEDIATE_FIELD";
  } else if (networkRisk > 0.7) {
    carbonitridingRegime = "OVER_CARBONITRIDED";
  } else if (raExceedsTarget && stageProgress >= STAGE_4_BOUND) {
    carbonitridingRegime = "EXCESS_RETAINED_AUSTENITE";
  } else if (reverseGradientRisk > 0.6) {
    carbonitridingRegime = "DECARBURIZATION_LIKE";
  } else if (unevenCarbonitridingRisk > 0.6) {
    carbonitridingRegime = "UNEVEN_CARBONITRIDING";
  } else if (underCarbonitrideRisk > 0.6 && stageProgress < STAGE_4_BOUND) {
    carbonitridingRegime = "UNDER_CARBONITRIDED";
  } else if (
    intermediateFieldOk &&
    kcnInWindow &&
    cnRatioInWindow &&
    surfaceMean >= SURFACE_MIN_CN &&
    edgeDominanceFraction >= EDGE_DOMINANCE_MIN &&
    monotonicity >= MONOTONICITY_MIN &&
    erfcFit >= ERFC_FIT_MIN &&
    asymmetryIndex <= ASYMMETRY_MAX &&
    caseThicknessMeetsTarget &&
    carbonitrideProxy >= 0.5 &&
    !raExceedsTarget &&
    stageProgress >= STAGE_6_BOUND
  ) {
    carbonitridingRegime = "QUENCH_READY";
  } else if (intermediateFieldOk && carbonitrideProxy >= 0.4) {
    carbonitridingRegime = "EFFECTIVE_CASE_FORMATION";
  } else if (intermediateFieldOk && carbonitrideProxy >= 0.25 && diffusionZoneProxy >= 0.4) {
    carbonitridingRegime = "CARBONITRIDE_PRECIPITATION";
  } else if (intermediateFieldOk && diffusionZoneProxy >= 0.30) {
    carbonitridingRegime = "DUAL_DIFFUSION";
  } else if (intermediateFieldOk && surfaceEstablishedProxy >= 0.30) {
    carbonitridingRegime = "POTENTIAL_ESTABLISHMENT";
  } else if (intermediateFieldOk) {
    carbonitridingRegime = "TEMPERATURE_RAMP";
  } else {
    carbonitridingRegime = "PRE_CARBONITRIDE";
  }

  // Verdict selection.
  let carbonitridingVerdict: string;
  if (priorPeakDrivingForce < INTERMEDIATE_FIELD_MIN * 0.8) {
    carbonitridingVerdict = "NO_CARBONITRIDING_DRIVE";
  } else if (carbonitridingRegime === "QUENCH_READY") {
    carbonitridingVerdict = "QUENCH_READY";
  } else if (carbonitridingRegime === "OVER_CARBONITRIDED") {
    carbonitridingVerdict = "OVER_CARBONITRIDED";
  } else if (carbonitridingRegime === "EXCESS_RETAINED_AUSTENITE") {
    carbonitridingVerdict = "EXCESS_RA";
  } else if (carbonitridingRegime === "UNDER_CARBONITRIDED") {
    carbonitridingVerdict = "UNDER_CARBONITRIDED";
  } else if (carbonitridingRegime === "UNEVEN_CARBONITRIDING") {
    carbonitridingVerdict = "UNEVEN_CARBONITRIDING";
  } else if (carbonitridingRegime === "DECARBURIZATION_LIKE") {
    carbonitridingVerdict = "DECARBURIZATION_LIKE";
  } else if (carbonitridingRegime === "OVER_INTERMEDIATE_FIELD") {
    carbonitridingVerdict = "OVER_INTERMEDIATE_FIELD";
  } else if (carbonitridingRegime === "SUB_INTERMEDIATE_FIELD") {
    carbonitridingVerdict = "SUB_INTERMEDIATE_FIELD";
  } else if (carbonitridingRegime === "EFFECTIVE_CASE_FORMATION") {
    carbonitridingVerdict = "EFFECTIVE_CASE_FORMATION";
  } else if (carbonitridingRegime === "CARBONITRIDE_PRECIPITATION") {
    carbonitridingVerdict = "CARBONITRIDE_PRECIPITATION";
  } else if (carbonitridingRegime === "DUAL_DIFFUSION") {
    carbonitridingVerdict = "DUAL_DIFFUSION";
  } else if (carbonitridingRegime === "POTENTIAL_ESTABLISHMENT") {
    carbonitridingVerdict = "POTENTIAL_ESTABLISHMENT";
  } else if (carbonitridingRegime === "TEMPERATURE_RAMP") {
    carbonitridingVerdict = "TEMPERATURE_RAMP";
  } else if (carbonitridingRegime === "PRE_CARBONITRIDE") {
    carbonitridingVerdict = "PRE_CARBONITRIDE";
  } else {
    carbonitridingVerdict = "INTERMEDIATE_CARBONITRIDING";
  }

  const topBins = [...binRecs]
    .sort((a, b) => b.carbonitridingDegree - a.carbonitridingDegree)
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
    intermediateFieldOk,
    intermediateFieldProximity: r4(intermediateFieldProximity),
    subIntermediateField,
    overIntermediateField,
    kcProxy: r4(kcProxy),
    knProxy: r4(knProxy),
    kcnProxy: r4(kcnProxy),
    kcnInWindow,
    kcnProximity: r4(kcnProximity),
    cnRatio: r4(cnRatio),
    cnRatioInWindow,
    cnRatioProximity: r4(cnRatioProximity),
    surfaceActivity: r4(surfaceMean),
    edgeLayerActivity: r4(edgeMean),
    diffusionZoneActivity: r4(edgeMean),  // single-layer
    coreActivity: r4(coreMean),
    surfaceCoreDelta: r4(surfaceCoreDelta),
    surfaceCoreRatio: r4(surfaceCoreRatio),
    edgeDominanceFraction: r4(edgeDominanceFraction),
    surfaceLeftActivity: r4(leftMean),
    surfaceRightActivity: r4(rightMean),
    asymmetryIndex: r4(asymmetryIndex),
    gradientMonotonicity: r4(monotonicity),
    erfcFit: r4(erfcFit),
    erfcDt: r4(erfcDt),
    diffusivityProxy: r4(diffusivityProxy),
    caseDepthProxy: r4(caseDepthProxy),
    effectiveCaseBins,
    totalCaseBins,
    caseThicknessFraction: r4(caseThicknessFraction),
    caseThicknessMeetsTarget,
    carbonitrideProxy: r4(carbonitrideProxy),
    raProxy: r4(raProxy),
    raExceedsTarget,
    networkRisk: r4(networkRisk),
    alloyFactorProxy: r4(alloyFactorProxy),
    alloyFormerOk,
    diffusionZoneProxy: r4(diffusionZoneProxy),
    surfaceEstablishedProxy: r4(surfaceEstablishedProxy),
    uniformityIndex: r4(uniformityIndex),
    reserveCV: r4(reserveCV),
    reserveXFracStdev: r4(reserveXFracStdev),
    underCarbonitrideRisk: r4(underCarbonitrideRisk),
    unevenCarbonitridingRisk: r4(unevenCarbonitridingRisk),
    reverseGradientRisk: r4(reverseGradientRisk),
    overIntermediateRisk: r4(overIntermediateRisk),
    subIntermediateRisk: r4(subIntermediateRisk),
    caseHardnessProxy: r4(caseHardnessProxy),
    coreToughnessProxy: r4(coreToughnessProxy),
    wearResistanceProxy: r4(wearResistanceProxy),
    fatigueResistanceProxy: r4(fatigueResistanceProxy),
    distortionProxy: r4(distortionProxy),
    caseCoreRatio: r4(caseCoreRatio),
    arrheniusActivation: r4(arrheniusActivation),
    stageProgress: r4(stageProgress),
    dominantStage,
    carbonitridingIndex,
    carbonitridingRegime,
    carbonitridingVerdict,
    stageDistribution,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Carbonitriding — Doctor ===\n");
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

  const profiles: CarbonitridingProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeCarbonitriding(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgCarbonitridingIndex: profiles.length > 0 ? r2(avg(profiles.map((p) => p.carbonitridingIndex))) : 0,
    avgDrivingForce: profiles.length > 0 ? r4(avg(profiles.map((p) => p.drivingForce))) : 0,
    avgKcnProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.kcnProxy))) : 0,
    avgCnRatio: profiles.length > 0 ? r4(avg(profiles.map((p) => p.cnRatio))) : 0,
    avgSurfaceActivity: profiles.length > 0 ? r4(avg(profiles.map((p) => p.surfaceActivity))) : 0,
    avgEdgeLayerActivity: profiles.length > 0 ? r4(avg(profiles.map((p) => p.edgeLayerActivity))) : 0,
    avgCoreActivity: profiles.length > 0 ? r4(avg(profiles.map((p) => p.coreActivity))) : 0,
    avgSurfaceCoreDelta: profiles.length > 0 ? r4(avg(profiles.map((p) => p.surfaceCoreDelta))) : 0,
    avgEdgeDominanceFraction: profiles.length > 0 ? r4(avg(profiles.map((p) => p.edgeDominanceFraction))) : 0,
    avgAsymmetryIndex: profiles.length > 0 ? r4(avg(profiles.map((p) => p.asymmetryIndex))) : 0,
    avgGradientMonotonicity: profiles.length > 0 ? r4(avg(profiles.map((p) => p.gradientMonotonicity))) : 0,
    avgErfcFit: profiles.length > 0 ? r4(avg(profiles.map((p) => p.erfcFit))) : 0,
    avgErfcDt: profiles.length > 0 ? r4(avg(profiles.map((p) => p.erfcDt))) : 0,
    avgCaseDepthProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.caseDepthProxy))) : 0,
    avgCaseHardnessProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.caseHardnessProxy))) : 0,
    avgCoreToughnessProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.coreToughnessProxy))) : 0,
    avgWearResistanceProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.wearResistanceProxy))) : 0,
    avgFatigueResistanceProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.fatigueResistanceProxy))) : 0,
    avgDistortionProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.distortionProxy))) : 0,
    avgCaseThicknessFraction: profiles.length > 0 ? r4(avg(profiles.map((p) => p.caseThicknessFraction))) : 0,
    avgCarbonitrideProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.carbonitrideProxy))) : 0,
    avgRaProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.raProxy))) : 0,
    avgNetworkRisk: profiles.length > 0 ? r4(avg(profiles.map((p) => p.networkRisk))) : 0,
    avgAlloyFactorProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.alloyFactorProxy))) : 0,
    avgDiffusionZoneProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.diffusionZoneProxy))) : 0,
    avgStageProgress: profiles.length > 0 ? r4(avg(profiles.map((p) => p.stageProgress))) : 0,
    avgUnderCarbonitrideRisk: profiles.length > 0 ? r4(avg(profiles.map((p) => p.underCarbonitrideRisk))) : 0,
    avgUnevenCarbonitridingRisk: profiles.length > 0 ? r4(avg(profiles.map((p) => p.unevenCarbonitridingRisk))) : 0,
    intermediateFieldOkCount:    profiles.filter((p) => p.intermediateFieldOk === 1).length,
    subIntermediateFieldCount:   profiles.filter((p) => p.subIntermediateField === 1).length,
    overIntermediateFieldCount:  profiles.filter((p) => p.overIntermediateField === 1).length,
    kcnInWindowCount:            profiles.filter((p) => p.kcnInWindow === 1).length,
    cnRatioInWindowCount:        profiles.filter((p) => p.cnRatioInWindow === 1).length,
    alloyFormerOkCount:          profiles.filter((p) => p.alloyFormerOk === 1).length,
    caseThicknessMeetsTargetCount: profiles.filter((p) => p.caseThicknessMeetsTarget === 1).length,
    raExceedsTargetCount:        profiles.filter((p) => p.raExceedsTarget === 1).length,
    preCarbonitrideCount:        profiles.filter((p) => p.carbonitridingRegime === "PRE_CARBONITRIDE").length,
    temperatureRampCount:        profiles.filter((p) => p.carbonitridingRegime === "TEMPERATURE_RAMP").length,
    potentialEstablishmentCount: profiles.filter((p) => p.carbonitridingRegime === "POTENTIAL_ESTABLISHMENT").length,
    dualDiffusionCount:          profiles.filter((p) => p.carbonitridingRegime === "DUAL_DIFFUSION").length,
    carbonitridePrecipitationCount: profiles.filter((p) => p.carbonitridingRegime === "CARBONITRIDE_PRECIPITATION").length,
    effectiveCaseFormationCount: profiles.filter((p) => p.carbonitridingRegime === "EFFECTIVE_CASE_FORMATION").length,
    quenchReadyCount:            profiles.filter((p) => p.carbonitridingRegime === "QUENCH_READY").length,
    overCarbonitridedCount:      profiles.filter((p) => p.carbonitridingRegime === "OVER_CARBONITRIDED").length,
    excessRetainedAusteniteCount: profiles.filter((p) => p.carbonitridingRegime === "EXCESS_RETAINED_AUSTENITE").length,
    underCarbonitridedCount:     profiles.filter((p) => p.carbonitridingRegime === "UNDER_CARBONITRIDED").length,
    unevenCarbonitridingCount:   profiles.filter((p) => p.carbonitridingRegime === "UNEVEN_CARBONITRIDING").length,
    decarburizationLikeCount:    profiles.filter((p) => p.carbonitridingRegime === "DECARBURIZATION_LIKE").length,
    overIntermediateFieldRegimeCount: profiles.filter((p) => p.carbonitridingRegime === "OVER_INTERMEDIATE_FIELD").length,
    subIntermediateFieldRegimeCount:  profiles.filter((p) => p.carbonitridingRegime === "SUB_INTERMEDIATE_FIELD").length,
    noDriveCount:                profiles.filter((p) => p.carbonitridingRegime === "NO_CARBONITRIDING_DRIVE").length,
    quenchReadyVerdictCount:     profiles.filter((p) => p.carbonitridingVerdict === "QUENCH_READY").length,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-carbonitriding").description("HODLMM bin carbonitriding / dual-species (C+N) thermochemical surface-diffusion analyzer — hold in INTERMEDIATE field (0.40-0.70 drivingForce analog, 760-870 °C analog, between nitriding α-field and carburizing γ-field) in hybrid CH₄/CO + NH₃ atmosphere, diffuse BOTH C and N inward per coupled Fickian fields producing an erfc concentration profile + M(C,N) carbonitride precipitates in a martensitic case (after MILD oil/gas quench); flags quench-ready pools (intermediate-field hold, KCN in window, C/N ratio balanced, monotonic erfc gradient, symmetric, alloy-former sufficient, retained austenite controlled), as well as over-carbonitriding (continuous M(C,N) network), excess retained austenite (N over-stabilizes γ on quench), under-carbonitriding, uneven carbonitriding, reverse gradient, and over/sub intermediate-field conditions");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin carbonitriding state")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
