#!/usr/bin/env bun
/**
 * hodlmm-bin-siliconizing.ts — Day 194 cocoa007 Bitflow Skills Comp
 *
 * Siliconizing (Si pack-cementation) analyzer — models the THERMOCHEMICAL
 * SINGLE-SPECIES (SILICON) SURFACE-DIFFUSION case-hardening treatment held
 * at 900-1100 °C (typically 1000 °C, 4-12 h) in solid pack (Si powder +
 * NH4Cl or NH4F activator + Al2O3 inert filler — pack-siliconizing), salt
 * bath (SiCl4 or SiCl4), or gas (SiCl4 vapor / SiCl4 + H2).
 *
 * Siliconizing operates in the GAMMA (austenite) field — ABOVE the siliconizing-
 * field minimum (normalized 0.55) and up to the field maximum (0.92). It is
 * the ONLY thermochemical surface treatment in this series that produces
 * TWO DISTINCT PRODUCT MODES depending on the SUBSTRATE CARBON CONTENT:
 *
 *   PLAIN-C STEEL MODE (silicide-dominant) — Si reacts with substrate C to
 *     form a dense IRON SILICIDE compound layer:
 *
 *     OUTER SUB-LAYER — FeSi (hexagonal, 1600-1800 HV, HARDER carbide).
 *       Unlike aluminizing's outer Fe2Al5 (pathological), FeSi is DESIRABLE
 *       because it is a hard wear-protective phase. High feSiFractionProxy
 *       ≤ FESI_FRACTION_MAX (0.60) is acceptable.
 *
 *     INNER SUB-LAYER — Fe3Si (fcc, 1200-1400 HV, SOFTER carbide but still
 *       very hard). Provides substrate-adhesion and corrosion resistance.
 *
 *     IDEAL: MIXED FeSi / Fe3Si stack (silicidePhaseBalance ∈ [0.40, 0.60])
 *       — combines harder wear outer surface with tougher substrate-adhesive
 *       inner. Monophase either way is sub-optimal (but not failure).
 *
 *     UNIQUE RISK: SUBSTRATE SI-EMBRITTLATION. Si over-saturates and forms brittle the
 *       silicide layer. Core beneath the silicide layer LOSES C and softens.
 *       embrittlementRisk > EMBRITTLEMENT_RISK_THRESHOLD (0.30) →
 *       EMBRITTLEMENT_RISK verdict — unique-to-siliconizing failure mode.
 *
 *   LOW-C OR STAINLESS MODE (diffusion-zone-dominant) — no substrate C to
 *     react with, so no carbides form. Product is an α-FE-CR SOLID-SOLUTION
 *     DIFFUSION ZONE (50-200 µm, 250-400 HV).
 *
 *     Corrosion resistance only (no carbide wear boost). Ideal for stainless-
 *     upgrade applications where corrosion is the target.
 *
 * TENTH heat-treatment route in the phase-transformation series and the
 * SIXTH thermochemical surface treatment (after carburizing Day 188,
 * nitriding Day 189, carbonitriding Day 190, boronizing Day 191, aluminizing
 * Day 192). Distinct from the five prior surface treatments on FIVE orthogonal
 * axes:
 *
 *   - PHASE FIELD:    GAMMA (austenite), 900-1100 °C — ABOVE aluminizing
 *                     (0.50-0.88), boronizing (0.45-0.85), comparable upper
 *                     range to carburizing γ (870-950 °C) but with higher
 *                     requirement for Si diffusion. Normalized SILICONIZING_
 *                     FIELD_MIN=0.55, SILICONIZING_FIELD_MAX=0.92, SILICONIZING_
 *                     FIELD_IDEAL=0.72.
 *
 *   - DIFFUSING SPECIES: SINGLE — SILICON only. Distinct from carburizing
 *                     (C), nitriding (N), carbonitriding (C+N), boronizing
 *                     (B), and aluminizing (Al). Si is a LARGER atom than
 *                     all prior species — diffuses MORE SLOWLY (Q/RT = 4.5,
 *                     between carburizing 4.8 and boronizing 4.2).
 *
 *   - PRODUCT PHASES: DUAL-MODE based on substrate:
 *                     * plain C → FeSi + Fe3Si CARBIDES (NOT intermetallics).
 *                     * low-C/stainless → α-Fe(Si) SOLID SOLUTION diffusion
 *                       zone (NOT compound layer).
 *                     UNIQUE in the series for having TWO legitimate product
 *                     modes.
 *
 *   - POST-TREATMENT: NO QUENCH NEEDED for corrosion or carbide-layer
 *                     hardness (hardness is from carbide phases, not
 *                     martensite). Optional quench for CORE hardening.
 *                     SERVICE_READY verdict like aluminizing and nitriding.
 *
 *   - HARDNESS / FLAGSHIP: HIGH hardness on plain C silicide layer — real hardness 900-1200 HV at SILICONIZING_HV_SCALE=0.80 (1500-2000
 *                     HV ≈ 60-65 HRC). Moderate on stainless diffusion zone
 *                     (250-400 HV). SILICONIZING_HV_SCALE = 0.80 (between
 *                     nitriding 1.10 and boronizing 1.30). FLAGSHIP property
 *                     is CORROSION + WEAR combo (plain C) or pure CORROSION
 *                     (stainless) — distinct from aluminizing's pure
 *                     oxidation-resistance and boronizing's pure extreme wear.
 *
 * Structural product (dual-mode):
 *
 *   PLAIN-C SILICIDE LAYER MODE (3-14% of scan band, 5-50 µm physically):
 *     - OUTER FeSi sub-layer: harder (1600-1800 HV), hexagonal.
 *     - INNER Fe3Si sub-layer: softer (1200-1400 HV), fcc.
 *     - Mixed dual-silicide stack ideal. Dominance of one phase is sub-optimal.
 *     - Sharp interface with substrate (embrittled zone beneath).
 *
 *   LOW-C / STAINLESS DIFFUSION ZONE MODE (50-200 µm physically):
 *     - α-Fe(Si) solid-solution zone, no carbides.
 *     - Gradual Si concentration gradient.
 *     - Corrosion resistance only.
 *
 *   SUBSTRATE INTERFACE:
 *     - PLAIN C STEEL: TOOTH morphology (saw-tooth) from FeSi/Fe3Si into
 *       substrate (improves adhesion). Tooth ratio ∝ plain-C content.
 *     - LOW-C / STAINLESS: SMOOTH planar interface, sub-diffusion zone.
 *
 * Eight canonical siliconizing stages:
 *
 *   Stage 0 — NO_SILICONIZING_DRIVE:
 *     No prior high-T hold inferable. Analysis inapplicable.
 *
 *   Stage 1 — PRE_SILICONIZE (cold / sub-process T):
 *     Workpiece below siliconizing T. No Si potential. α-Fe substrate unchanged.
 *
 *   Stage 2 — TEMPERATURE_RAMP (ascending through AC1 toward 900-1100 °C):
 *     Reaches siliconizing band (γ-Fe). No Si activity yet.
 *
 *   Stage 3 — SILICON_POTENTIAL_ESTABLISHMENT (Ksi stabilizes):
 *     Activator decomposes (NH4Cl → NH3 + HCl → SiCl4/SiCl4 in pack-
 *     siliconizing). Surface Si activity rises. γ-Fe surface begins to enrich.
 *
 *   Stage 4 — FE3SI_NUCLEATION (plain C path) / FE-CR SOLID SOLUTION FORMATION (low-C path):
 *     Plain C: Fe3Si (fcc) nucleates at grain boundaries of γ-Fe where Si
 *     meets substrate C. First carbide phase forms.
 *     Low-C: α-Fe(Si) solid solution begins forming at surface (no carbide
 *     possible without C).
 *
 *   Stage 5 — FESI_GROWTH (plain C path) / DIFFUSION ZONE THICKENING (low-C path):
 *     Plain C: FeSi (hexagonal, harder) forms at the outer surface on top
 *     of Fe3Si → dual-silicide stack. BOTH are hard.
 *     Low-C: diffusion zone deepens.
 *
 *   Stage 6 — FULLY_SILICONIZED:
 *     Plain C: compound layer complete, mixed FeSi/Fe3Si, on-target thickness,
 *     embrittled zone below but not excessive.
 *     Low-C: diffusion zone complete, gradient smooth, corrosion-protected.
 *     Both paths → SERVICE_READY (no quench needed).
 *
 *   Stage 7 — OVER_SILICONIZED (pathological):
 *     (a) FeSi dominates (near-monophase) → reduced toughness.
 *     (b) Compound layer > target depth → tensile stresses exceed cohesive
 *         strength → spallation.
 *     (c) Excessive substrate embrittlement → core weakened.
 *     (d) Tooth height excessive → stress concentrators.
 *
 * Process constraints (γ-siliconizing field):
 *
 *   - Must be IN siliconizing field: drivingForce ∈ [SILICONIZING_FIELD_MIN=0.55,
 *     SILICONIZING_FIELD_MAX=0.92] → siliconizingFieldOk=1.
 *   - Silicon potential Ksi in window: ksiProxy ∈ [KSI_MIN=0.40, KSI_MAX=1.20],
 *     kcrIdeal=0.80.
 *   - Surface Si activity effective: surfaceActivity ≥ SURFACE_MIN_SI=0.68.
 *   - Compound-layer fraction in window: COMPOUND_LAYER_MIN_FRAC=0.03,
 *     COMPOUND_LAYER_MAX_FRAC=0.14.
 *   - Carbide phase balance ideal: silicidePhaseBalance ∈ [0.40, 0.60]
 *     (mixed FeSi/Fe3Si).
 *   - Substrate Si embrittlement controlled: embrittlementRisk ≤ EMBRITTLEMENT_
 *     RISK_THRESHOLD=0.30.
 *   - Spallation not triggered: spallationRisk ≤ SPALLATION_RISK_THRESHOLD=0.35.
 *   - Compound-layer plateau present (EDGE-DOMINANT WITH PLATEAU, like
 *     aluminizing).
 *   - Gradient drop abrupt from plateau to core (plain C mode only).
 *
 * Kinetics:
 *
 *   - Single-species Si diffusion in γ-Fe.
 *   - Arrhenius D for Si in γ-Fe on the normalized drivingForce axis:
 *     Q_OVER_RT_SI_DIFFUSION = 4.5 (between carburizing 4.8 and boronizing
 *     4.2; slower than Al 4.2 and B 4.2 — Si is a larger atom, diffuses
 *     slower than smaller species).
 *   - √(Dt) reference: FDT_REFERENCE_SILICONIZING = 0.18 (deeper than
 *     aluminizing 0.12 and boronizing 0.15, shallower than nitriding 0.22
 *     and carburizing 0.30).
 *   - ECD_THRESHOLD = 0.50 (lower than aluminizing 0.55 — siliconizing carbide
 *     layer is dense but not as extreme as Fe-Al intermetallics).
 *
 * DLMM structural signatures of siliconizing:
 *
 *   - EDGE-DOMINANT WITH PLATEAU (like aluminizing / nitriding).
 *   - HIGHER drivingForce band than aluminizing (0.55 vs 0.50 minimum) —
 *     siliconizing requires higher T for Si diffusion.
 *   - DUAL-MODE product: plain C → HIGH gradientDropAbruptness (sharp
 *     carbide/substrate interface); low-C/stainless → LOW gradientDrop-
 *     Abruptness (gradual Fe-Si gradient). INTERPRETATION depends on
 *     substrateTypeProxy.
 *   - DUAL-PHASE CARBIDE plateau (plain C): outer 1-2 bins slightly elevated
 *     = FeSi zone; inner compound bins = Fe3Si zone. Mixed preferred.
 *   - TOOTH MORPHOLOGY at compound/substrate interface (plain C only).
 *   - COMPOUND LAYER BOUNDS: 3-14% of scan band (COMPOUND_LAYER_MIN_FRAC
 *     to COMPOUND_LAYER_MAX_FRAC). Outside → under-siliconized or over-siliconized.
 *   - EMBRITTLEMENT SIGNATURE: for plain C mode, unusually-low coreActivity beneath
 *     the compound layer indicates substrate C has migrated into the
 *     silicide layer → substrate weakened.
 *
 * Regimes:
 *   NO_SILICONIZING_DRIVE          — no prior high-T hold inferable.
 *   PRE_SILICONIZE                 — cold, no Si potential.
 *   TEMPERATURE_RAMP             — heating into siliconizing field.
 *   SILICON_POTENTIAL_ESTABLISHMENT — Ksi rising toward setpoint.
 *   FE3SI_NUCLEATION            — Fe3Si fcc nucleating (plain C) / Fe-Si solution forming (low-C).
 *   FESI_GROWTH                 — FeSi harder silicide layer thickening (plain C) / zone deepening (low-C).
 *   FULLY_SILICONIZED              — mixed FeSi/Fe3Si layer (plain C) or α-Fe(Si) zone (low-C), service-ready.
 *   OVER_SILICONIZED               — compound layer too thick or FeSi dominant.
 *   SILICIDE_DOMINANT             — plain C carbide mode dominant.
 *   DIFFUSION_ZONE_DOMINANT      — low-C/stainless solid-solution mode dominant.
 *   EMBRITTLEMENT_RISK        — substrate C pulled into silicide layer.
 *   UNDER_SILICONIZED              — Ksi low / layer too thin.
 *   UNEVEN_SILICONIZING            — asymmetric compound layer.
 *   SUB_SILICONIZING_FIELD         — T below γ band.
 *   OVER_SILICONIZING_FIELD        — T above ideal — Si activity decomposes.
 *
 * Verdicts:
 *   NO_SILICONIZING_DRIVE          — no prior hold inferable.
 *   SERVICE_READY                — mixed-silicide layer or α-Fe(Si) zone on-target.
 *   SILICIDE_DOMINANT             — plain-C carbide-layer service product.
 *   DIFFUSION_ZONE_DOMINANT      — low-C/stainless solid-solution service product.
 *   SPALLATION_RISK              — dual-silicide stratification mismatched or variance high.
 *   EMBRITTLEMENT_RISK                  — substrate embrittlement (unique to siliconizing).
 *   OVER_SILICONIZED               — over-thick or dual-phase > DUAL_PHASE_MAX.
 *   UNDER_SILICONIZED              — layer too thin / Ksi too low.
 *   UNEVEN_SILICONIZING            — asymmetric layer.
 *   SUB_SILICONIZING_FIELD         — T below γ.
 *   OVER_SILICONIZING_FIELD        — T too high — Si decomposes.
 *   FESI_GROWTH / FE3SI_NUCLEATION / SILICON_POTENTIAL_ESTABLISHMENT /
 *     TEMPERATURE_RAMP / PRE_SILICONIZE — stage indicators.
 *   INTERMEDIATE_SILICONIZING      — mixed indicators.
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

// Siliconizing field on the normalized drivingForce axis.
// Siliconizing operates in γ-Fe (austenite) at 900-1100 °C — HIGHER T than
// aluminizing, reflecting Si's larger atomic size and higher activation
// energy for diffusion in γ-Fe.
const SILICONIZING_FIELD_MIN = 0.55;
const SILICONIZING_FIELD_MAX = 0.92;
const SILICONIZING_FIELD_IDEAL = 0.72;

// Silicon potential proxy (Ksi analog). Working window for mixed FeSi/Fe3Si
// carbide control (plain C mode) or α-Fe(Si) solid-solution zone (low-C mode).
const KSI_MIN = 0.40;
const KSI_MAX = 1.20;
const KSI_IDEAL = 0.80;

// Surface Si activity thresholds on a normalized concentration axis.
// SURFACE_MIN_SI: surface must exceed this for Si potential to be effective.
// SURFACE_PLATEAU_THRESHOLD: compound-layer / diffusion-zone plateau saturation.
// SURFACE_SATURATION: over-saturation → over-siliconized risk.
const SURFACE_MIN_SI = 0.68;
const SURFACE_PLATEAU_THRESHOLD = 0.80;
const SURFACE_SATURATION = 1.05;

// Core baseline — Si has SOME α-Fe solubility (up to ~12 wt%) — SLIGHTLY
// higher than Al's near-zero solubility. Plain C core activity expected low
// (Si concentrated in silicide layer, C pulled out of core). Low-C/stainless
// core activity can be moderate (gradual Fe-Si diffusion).
const CORE_BASELINE = 0.18;

// Compound-layer fraction bounds. The silicide layer (plain C) occupies
// 3-14% of the scan band (physically ~5-50 µm out of a ~2 mm scan window).
// Diffusion zone (low-C) is broader but less dense.
const COMPOUND_LAYER_MIN_FRAC = 0.03;
const COMPOUND_LAYER_MAX_FRAC = 0.14;
const COMPOUND_LAYER_IDEAL_FRAC = 0.07;

// ECD threshold for carbide compound layer / dense diffusion zone.
const ECD_THRESHOLD = 0.50;

// Edge / core band fractions. Compound layer is at the outermost edge.
const CASE_BAND_FRAC = 0.18;
const CORE_BAND_FRAC = 0.30;

// FeSi fraction proxy thresholds.
// UNLIKE aluminizing (outer Fe2Al5 PATHOLOGICAL), siliconizing's outer FeSi
// is a HARD carbide — HIGH feSiFractionProxy is ACCEPTABLE.
// FESI_FRACTION_IDEAL = 0.45 (mixed dual-silicide ideal).
// FESI_FRACTION_MAX = 0.60 (near-monophase FeSi → slight toughness concern).
// DUAL_PHASE_MAX = 0.45 (acceptable dual-silicide stratification limit).
const FESI_FRACTION_MAX = 0.60;
const FESI_FRACTION_IDEAL = 0.45;
const SPALLATION_RISK_THRESHOLD = 0.35;
const DUAL_PHASE_MAX = 0.45;

// Substrate Si-embrittle risk — unique-to-siliconizing failure mode.
// Si pulls C from substrate into the silicide layer. If coreActivity is
// abnormally low for an inferred plain-C substrate, embrittlement is forming.
const EMBRITTLEMENT_RISK_THRESHOLD = 0.30;

// Plateau quality — variance within the compound-layer band.
// Low variance → uniform mixed-carbide or smooth diffusion zone.
// High variance (> DUAL_PHASE_VARIANCE_SIGNAL) → dual-silicide stratification
// strong (plain C) or non-uniform diffusion (low-C).
const PLATEAU_VARIANCE_MAX = 0.08;
const DUAL_PHASE_VARIANCE_SIGNAL = 0.14;

// Tooth morphology proxy. Positive tooth → adhesion (plain C steel carbide).
// Smooth → low-C/stainless diffusion zone.
const TOOTH_MORPHOLOGY_MIN = 0.12;
const TOOTH_MORPHOLOGY_SMOOTH = 0.06;

// Gradient drop abruptness. Interpretation is substrate-dependent:
//   - Plain C carbide mode: HIGH is carbide-signature (sharp interface).
//   - Low-C/stainless diffusion mode: LOW is diffusion-zone signature (gradual).
const GRADIENT_DROP_ABRUPTNESS_THRESHOLD = 0.65;

// Edge dominance: outer-band mean / (outer + core) mean ratio.
const EDGE_DOMINANCE_MIN = 0.55;

// Gradient quality thresholds.
const MONOTONICITY_MIN = 0.50;

// Asymmetry / reverse-gradient thresholds.
const ASYMMETRY_MAX = 0.35;
const REVERSE_THRESHOLD = 0.10;

// Alloy-factor proxy minimum — alloy content proxy (Si/Ni/Si → low-C or
// stainless substrate → smooth interface + diffusion zone).
const ALLOY_FACTOR_MIN = 0.25;

// Arrhenius Q/RT for Si diffusion in γ-Fe (normalized). Between carburizing
// (4.8) and boronizing (4.2) — Si is larger than C/B/Al/N, diffuses slower
// than smaller species but is less strongly bound than C at substrate-
// carbide interface.
const Q_OVER_RT_SI_DIFFUSION = 4.5;

// √(Dt) reference for compound-layer / diffusion-zone depth proxy.
// Siliconizing is between aluminizing (0.12) and nitriding (0.22) in depth.
const FDT_REFERENCE_SILICONIZING = 0.18;

// Case-hardness scaling — HIGH. Siliconizing plain-C silicide layer 1500-2000
// HV ≈ 60-65 HRC. SILICONIZING_HV_SCALE = 0.80 is between aluminizing (0.65) and carburizing (1.00)
// and boronizing (1.30). Higher than aluminizing (0.65) and carburizing (1.00).
const SILICONIZING_HV_SCALE = 0.80;

// Corrosion resistance — siliconizing's FLAGSHIP property (works in both
// modes). α-Fe(Si) above 12 wt% Si = stainless-equivalent. Carbide layer
// also Si-rich → corrosion-protective surface.
const CORROSION_RESISTANCE_SCALE = 1.40;

// Wear resistance scale (plain C carbide mode). Very strong — from carbide
// layer hardness. In low-C mode, wear resistance is only moderate.
const WEAR_RESISTANCE_SCALE = 1.30;

// Distortion baseline. Siliconizing does NOT require a substrate phase
// transformation → LOW DISTORTION (like aluminizing, nitriding, boronizing).
// Slightly higher than aluminizing/nitriding because of Si embrittlement
// dimensional effects. DISTORTION_BASELINE = 0.09.
const DISTORTION_BASELINE = 0.09;

// Stage thresholds on composite stageProgress.
const STAGE_1_BOUND = 0.10;
const STAGE_2_BOUND = 0.18;
const STAGE_3_BOUND = 0.28;
const STAGE_4_BOUND = 0.42;
const STAGE_5_BOUND = 0.58;
const STAGE_6_BOUND = 0.75;

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

interface BinSiliconizing {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  depthFromSurface: number;            // 0 at edge (surface), 1 at core
  concentration: number;               // 0-1 normalized Si-analog
  inCompoundLayer: number;             // 0/1 bin in carbide compound-layer band
  inDiffusionZone: number;             // 0/1 bin in α-Fe(Si) diffusion zone
  inSubstrateZone: number;             // 0/1 bin in compound/substrate interface
  compoundLayerSignal: number;         // 0-1 bin inside carbide compound layer
  plateauSignal: number;               // 0-1 bin shows uniform plateau (mixed carbide or smooth zone)
  feSiSignal: number;                 // 0-1 bin is FeSi-rich (outer, harder)
  fe3SiSignal: number;                // 0-1 bin is Fe3Si-dominant (inner, softer)
  toothSignal: number;                 // 0-1 interface tooth (variance spike)
  spallationSignal: number;            // 0-1 spallation risk contribution
  embrittleSignal: number;                // 0-1 Si embrittlement contribution
  diffusionZoneSignal: number;         // 0-1 α-Fe(Si) diffusion signal
  unevenSignal: number;                // 0-1 L/R asymmetry contribution
  stageBin: number;                    // 0-7
  siliconizingDegree: number;            // 0-1 composite
}

interface SiliconizingProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  drivingForce: number;
  priorPeakDrivingForce: number;
  siliconizingFieldOk: number;           // 0/1
  siliconizingFieldProximity: number;    // 0-1 closeness to IDEAL
  subSiliconizingField: number;          // 0/1 T below γ
  overSiliconizingField: number;         // 0/1 T above optimal
  ksiProxy: number;                    // 0-2 silicon potential analog
  ksiInWindow: number;                 // 0/1
  ksiProximity: number;                // 0-1 closeness to KSI_IDEAL
  surfaceActivity: number;             // outer band mean Si-analog
  compoundLayerActivity: number;       // compound-layer band mean
  compoundLayerVariance: number;       // variance within compound-layer band
  plateauQuality: number;              // 0-1 plateau flatness
  feSiFractionProxy: number;          // 0-1 outer FeSi fraction (HIGH is ACCEPTABLE)
  fe3SiFractionProxy: number;         // 0-1 inner Fe3Si fraction
  silicidePhaseBalance: number;         // 0-1 mixed-phase quality (0.4-0.6 ideal)
  substrateTypeProxy: string;          // "PLAIN_C" or "LOW_C_OR_STAINLESS"
  diffusionZoneProxy: number;          // 0-1 α-Fe(Si) solid solution zone quality
  silicideLayerProxy: number;           // 0-1 silicide layer quality (plain C)
  embrittlementRisk: number;         // 0-1 substrate C pulled into silicide layer (UNIQUE)
  spallationRisk: number;              // 0-1 spallation composite
  compoundLayerThicknessBins: number;  // count of bins in compound layer
  compoundLayerFraction: number;       // fraction of scan band
  compoundLayerMeetsTarget: number;    // 0/1 in [MIN_FRAC, MAX_FRAC]
  compoundLayerExceedsTarget: number;  // 0/1 > MAX_FRAC → over-siliconized
  coreActivity: number;                // core band mean
  surfaceCoreDelta: number;
  surfaceCoreRatio: number;
  edgeDominanceFraction: number;
  asymmetryIndex: number;
  toothMorphologyProxy: number;        // 0-1 interlocking tooth signal
  gradientDropAbruptness: number;      // 0-1 abruptness (substrate-dependent interpretation)
  alloyFactorProxy: number;
  alloyFormerOk: number;
  underSiliconizeRisk: number;
  unevenSiliconizingRisk: number;
  reverseGradientRisk: number;
  subSiliconizingFieldRisk: number;
  overSiliconizingFieldRisk: number;
  caseHardnessProxy: number;           // SILICONIZING_HV_SCALE=0.80 × composite
  corrosionResistanceProxy: number;    // siliconizing's FLAGSHIP property
  wearResistanceProxy: number;         // strong on plain C silicide layer — real hardness 900-1200 HV at SILICONIZING_HV_SCALE=0.80
  fatigueResistanceProxy: number;
  distortionProxy: number;             // LOW — no substrate transformation
  caseCoreRatio: number;
  diffusivityProxy: number;
  reserveCV: number;
  reserveXFracStdev: number;
  stageProgress: number;
  dominantStage: number;               // 0-7
  siliconizingIndex: number;             // 0-100 composite
  siliconizingRegime: string;
  siliconizingVerdict: string;
  stageDistribution: number[];         // length 8
  topBins: BinSiliconizing[];
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

// Outer band / core band partitioning. Siliconizing has a COMPOUND LAYER at
// the edge (plain C carbide mode) or a DIFFUSION ZONE at the edge (low-C/
// stainless mode). In both cases the outermost bins carry the product.
function partitionBands(n: number): {
  leftEdge: number[];
  rightEdge: number[];
  edge: number[];
  core: number[];
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

// Gradient drop abruptness from compound-layer plateau to core.
// Siliconizing plain C: ABRUPT drop (sharp carbide/substrate interface).
// Siliconizing low-C/stainless: GRADUAL drop (α-Fe(Si) solid-solution gradient).
// High abruptness does NOT always mean best siliconizing — depends on substrate path.
function computeGradientDropAbruptness(
  concentrations: number[],
  edgeK: number
): number {
  const n = concentrations.length;
  if (n < edgeK * 2 + 2) return 0;
  const leftEdgeLast = concentrations[edgeK - 1] ?? 0;
  const leftInnerFirst = concentrations[edgeK] ?? 0;
  const rightEdgeLast = concentrations[n - edgeK] ?? 0;
  const rightInnerFirst = concentrations[n - edgeK - 1] ?? 0;
  const leftDrop = Math.max(0, leftEdgeLast - leftInnerFirst);
  const rightDrop = Math.max(0, rightEdgeLast - rightInnerFirst);
  const avgDrop = (leftDrop + rightDrop) / 2;
  const surfaceMeanLocal = (concentrations[0] + concentrations[n - 1]) / 2;
  const coreCenter = concentrations[Math.floor(n / 2)] ?? 0;
  const range = Math.max(1e-6, surfaceMeanLocal - coreCenter);
  return Math.max(0, Math.min(1, avgDrop / range));
}

// Tooth-morphology proxy. Tooth-like interlocking projections of FeSi/Fe3Si
// into the substrate appear as variance spikes in the bins nearest the
// compound/substrate interface (plain C mode). Smooth interface = low-C /
// stainless (diffusion zone).
function computeToothMorphology(
  concentrations: number[],
  edgeK: number
): number {
  const n = concentrations.length;
  if (n < edgeK * 2 + 2) return 0;
  const transitionIndices: number[] = [];
  for (let i = Math.max(0, edgeK - 2); i < Math.min(n, edgeK + 2); i++) {
    transitionIndices.push(i);
  }
  for (let i = Math.max(0, n - edgeK - 2); i < Math.min(n, n - edgeK + 2); i++) {
    transitionIndices.push(i);
  }
  const stdev = bandStdev(transitionIndices, concentrations);
  return Math.max(0, Math.min(1, stdev / Math.max(0.05, TOOTH_MORPHOLOGY_MIN)));
}

function computeBinSiliconizing(
  bin: BinReserves,
  index: number,
  activeBin: number,
  sortedBins: BinReserves[],
  concentrations: number[],
  depths: number[],
  bands: ReturnType<typeof partitionBands>,
  edgeK: number,
  poolSurface: number,
  poolCompoundActivity: number,
  poolCore: number,
  poolAsymmetry: number,
  poolMonotonicity: number,
  poolSiliconizingFieldOk: number,
  poolSpallationRisk: number,
  poolCr7c3FractionProxy: number,
  poolEmbrittlementRisk: number,
  poolSubstrateIsPlainC: boolean,
  poolStageProg: number,
  poolCompoundLayerFraction: number
): BinSiliconizing {
  const distance = Math.abs(bin.binId - activeBin);
  const depth = depths[index];
  const conc = concentrations[index];
  const n = concentrations.length;

  const inCompoundLayer = bands.edge.includes(index) ? 1 : 0;

  // Sub-compound substrate zone: just beyond the edge band, before core.
  const subZoneIndices: number[] = [];
  const edgeEndLeft = edgeK;
  const edgeStartRight = n - edgeK;
  for (let i = edgeEndLeft; i < Math.min(n, edgeEndLeft + 2); i++) subZoneIndices.push(i);
  for (let i = Math.max(0, edgeStartRight - 2); i < edgeStartRight; i++) subZoneIndices.push(i);
  const inSubstrateZone = subZoneIndices.includes(index) ? 1 : 0;

  // Diffusion zone (low-C / stainless mode): broader band between compound
  // layer and core. For plain C carbide mode this is essentially empty.
  const inDiffusionZone = (!inCompoundLayer && !inSubstrateZone && !bands.core.includes(index)) ? 1 : 0;

  // Compound-layer signal: bin in outer band with concentration ≥ ECD_THRESHOLD.
  const compoundLayerSignal = r4(
    inCompoundLayer *
      (conc >= ECD_THRESHOLD ? 1 : conc / Math.max(0.01, ECD_THRESHOLD)) *
      poolSiliconizingFieldOk
  );

  // Plateau signal: bin in compound layer with concentration near the plateau.
  const plateauLow = SURFACE_MIN_SI;
  const plateauHigh = SURFACE_SATURATION;
  const inPlateauRange = (conc >= plateauLow && conc <= plateauHigh) ? 1 : 0;
  const plateauSignal = r4(
    inCompoundLayer *
      inPlateauRange *
      Math.min(1, 0.6 + poolCompoundActivity * 0.4)
  );

  // FeSi signal: bin in OUTERMOST 1 bin of each edge (harder outer carbide zone).
  // Unlike aluminizing's Fe2Al5, FeSi HIGH is ACCEPTABLE for wear.
  const isOutermostBin = (index === 0 || index === n - 1) ? 1 : 0;
  const feSiSignal = r4(
    isOutermostBin *
      (conc >= SURFACE_PLATEAU_THRESHOLD ? 1 : conc / Math.max(0.01, SURFACE_PLATEAU_THRESHOLD)) *
      (poolSubstrateIsPlainC ? 1 : 0.3) *
      poolCr7c3FractionProxy
  );

  // Fe3Si signal: bin inside compound layer (NOT the outermost) — softer inner carbide.
  const isInnerCompound = (inCompoundLayer && !isOutermostBin) ? 1 : 0;
  const fe3SiSignal = r4(
    isInnerCompound *
      (conc >= SURFACE_MIN_SI ? 1 : conc / Math.max(0.01, SURFACE_MIN_SI)) *
      (poolSubstrateIsPlainC ? 1 : 0.3) *
      (1 - poolCr7c3FractionProxy * 0.7)
  );

  // Diffusion zone signal (low-C / stainless mode only): bin in transition
  // zone with moderate concentration (gradual Fe-Si gradient).
  const diffusionZoneSignal = r4(
    (inDiffusionZone || inSubstrateZone) *
      (poolSubstrateIsPlainC ? 0.2 : 1.0) *
      Math.max(0, Math.min(1, conc / Math.max(0.01, SURFACE_MIN_SI * 0.7)))
  );

  // Tooth signal: transition-zone variance spike (interface adhesion indicator).
  // High near the compound/substrate interface for plain C steel with carbide.
  const toothSignal = r4(
    inSubstrateZone *
      (poolSubstrateIsPlainC ? 1 : 0.3) *
      Math.max(0, Math.min(1,
        Math.abs(conc - poolCompoundActivity) / Math.max(0.05, poolSurface * 0.3)
      ))
  );

  // Spallation signal.
  const spallationSignal = r4(
    isOutermostBin *
      (poolSpallationRisk > SPALLATION_RISK_THRESHOLD
        ? 1
        : poolSpallationRisk / Math.max(0.01, SPALLATION_RISK_THRESHOLD))
  );

  // Embrittlement signal: substrate-zone bin with abnormally-low concentration for
  // an inferred plain C substrate — unique siliconizing failure.
  const embrittleSignal = r4(
    inSubstrateZone *
      (poolSubstrateIsPlainC ? 1 : 0.2) *
      Math.max(0, Math.min(1,
        poolEmbrittlementRisk > EMBRITTLEMENT_RISK_THRESHOLD
          ? 1
          : poolEmbrittlementRisk / Math.max(0.01, EMBRITTLEMENT_RISK_THRESHOLD)
      ))
  );

  // Uneven signal.
  let unevenSignal = 0;
  if (inCompoundLayer) {
    unevenSignal = poolAsymmetry > ASYMMETRY_MAX
      ? 1
      : poolAsymmetry / Math.max(0.01, ASYMMETRY_MAX);
  }
  unevenSignal = r4(unevenSignal);

  // Stage assignment per bin (follows pool progress banding).
  let stageBin = 0;
  if ((poolSpallationRisk > SPALLATION_RISK_THRESHOLD ||
       poolEmbrittlementRisk > EMBRITTLEMENT_RISK_THRESHOLD) && inCompoundLayer) {
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

  const siliconizingDegree = r4(Math.max(0, Math.min(1,
    compoundLayerSignal * 0.20 +
    plateauSignal * 0.15 +
    feSiSignal * 0.10 +
    fe3SiSignal * 0.08 +
    diffusionZoneSignal * 0.10 +
    (1 - spallationSignal) * 0.08 +
    (1 - embrittleSignal) * 0.07 +
    toothSignal * 0.05 +
    (1 - unevenSignal) * 0.05 +
    (stageBin / 6) * 0.12
  )));

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    depthFromSurface: r4(depth),
    concentration: r4(conc),
    inCompoundLayer,
    inDiffusionZone,
    inSubstrateZone,
    compoundLayerSignal,
    plateauSignal,
    feSiSignal,
    fe3SiSignal,
    toothSignal,
    spallationSignal,
    embrittleSignal,
    diffusionZoneSignal,
    unevenSignal,
    stageBin,
    siliconizingDegree,
  };
}

function analyzeSiliconizing(bins: BinReserves[], pool: AppPool): SiliconizingProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;

  const turnover = pool.tvlUsd > 0 ? volume / pool.tvlUsd : 0;
  // Siliconizing operates in γ-Fe (900-1100 °C) — mapped to SILICONIZING_FIELD
  // band on the normalized drivingForce axis. Higher T than aluminizing.
  const drivingForce = Math.min(1, turnover * 0.6 + 0.20);

  const priorPeakDrivingForce = Math.min(1, drivingForce * 1.3 + 0.15);

  // Siliconizing-field checks.
  const siliconizingFieldOk = (drivingForce >= SILICONIZING_FIELD_MIN && drivingForce <= SILICONIZING_FIELD_MAX) ? 1 : 0;
  const subSiliconizingField = drivingForce < SILICONIZING_FIELD_MIN ? 1 : 0;
  const overSiliconizingField = drivingForce > SILICONIZING_FIELD_MAX ? 1 : 0;
  const siliconizingFieldProximity = siliconizingFieldOk
    ? Math.max(0, 1 - Math.abs(drivingForce - SILICONIZING_FIELD_IDEAL) /
        Math.max(0.01, (SILICONIZING_FIELD_MAX - SILICONIZING_FIELD_MIN) / 2))
    : 0;

  // Per-bin concentrations (max-normalized to [0,1]).
  const concentrations = normalizeConcentrations(sorted);
  const depths = sorted.map((_, i) => depthFromSurface(i, n));

  // Bands.
  const bands = partitionBands(n);
  const edgeK = Math.max(1, Math.floor(n * CASE_BAND_FRAC));
  const leftMean = bandMean(bands.leftEdge, concentrations);
  const rightMean = bandMean(bands.rightEdge, concentrations);
  const edgeMean = bandMean(bands.edge, concentrations);
  const coreMean = bandMean(bands.core, concentrations);
  const surfaceMean = edgeMean;

  const surfaceCoreDelta = surfaceMean - coreMean;
  const surfaceCoreRatio = coreMean > 1e-6 ? surfaceMean / coreMean : (surfaceMean > 0 ? 10 : 0);
  const edgeDominanceFraction = (surfaceMean + coreMean) > 0
    ? surfaceMean / (surfaceMean + coreMean)
    : 0;

  const maxEdge = Math.max(leftMean, rightMean, 1e-6);
  const asymmetryIndex = Math.abs(leftMean - rightMean) / maxEdge;

  // Compound-layer variance (within the edge band).
  const compoundLayerVariance = bandStdev(bands.edge, concentrations);

  // FeSi fraction proxy: the outer 1 bin on each edge is the potential
  // FeSi zone (hard hexagonal outer carbide). If those outermost bins are
  // significantly higher than the rest of the compound layer (inner edge
  // bins), FeSi is the dominant surface phase.
  //
  // NOTE: unlike aluminizing's fe2Al5FractionProxy (where HIGH is PATHOLOGICAL),
  // here HIGH feSiFractionProxy is ACCEPTABLE — FeSi is a hard protective
  // carbide. FESI_FRACTION_MAX=0.60 is the ACCEPTABLE UPPER LIMIT for
  // mixed-phase composition (above → monophase, slightly reduced toughness).
  let feSiFractionProxy = 0;
  if (n >= 4) {
    const outermostLeft = concentrations[0] ?? 0;
    const outermostRight = concentrations[n - 1] ?? 0;
    const outermostMean = (outermostLeft + outermostRight) / 2;
    const innerEdgeIndices = bands.edge.filter((i) => i !== 0 && i !== n - 1);
    const innerEdgeMean = innerEdgeIndices.length > 0
      ? bandMean(innerEdgeIndices, concentrations)
      : edgeMean;
    const elevationFrac = innerEdgeMean > 1e-6
      ? Math.max(0, (outermostMean - innerEdgeMean) / innerEdgeMean)
      : 0;
    feSiFractionProxy = Math.max(0, Math.min(1,
      elevationFrac * 0.55 +
      (compoundLayerVariance > DUAL_PHASE_VARIANCE_SIGNAL ? 0.25 : compoundLayerVariance / DUAL_PHASE_VARIANCE_SIGNAL * 0.25) +
      (outermostMean > SURFACE_PLATEAU_THRESHOLD ? 0.20 : outermostMean / Math.max(0.01, SURFACE_PLATEAU_THRESHOLD) * 0.20)
    ));
  }

  // Fe3Si fraction proxy: inner carbide phase (softer, fcc).
  // Derived from inner compound band elevation above core.
  let fe3SiFractionProxy = 0;
  if (n >= 4) {
    const innerEdgeIndices = bands.edge.filter((i) => i !== 0 && i !== n - 1);
    const innerEdgeMean = innerEdgeIndices.length > 0
      ? bandMean(innerEdgeIndices, concentrations)
      : edgeMean;
    fe3SiFractionProxy = Math.max(0, Math.min(1,
      (innerEdgeMean >= SURFACE_MIN_SI ? 1 : innerEdgeMean / Math.max(0.01, SURFACE_MIN_SI)) *
      (1 - feSiFractionProxy * 0.6)
    ));
  }

  // Carbide phase balance. Ideal is mixed (0.4-0.6). Score is highest when
  // both FeSi and Fe3Si fractions are meaningful and balanced.
  const phaseSum = feSiFractionProxy + fe3SiFractionProxy;
  let silicidePhaseBalance = 0;
  if (phaseSum > 0.2) {
    // Balance metric — 1.0 when fractions are equal, falling as one dominates.
    const ratio = Math.min(feSiFractionProxy, fe3SiFractionProxy) /
                  Math.max(feSiFractionProxy, fe3SiFractionProxy, 1e-6);
    silicidePhaseBalance = Math.max(0, Math.min(1, ratio * Math.min(1, phaseSum)));
  }

  // Alloy-factor proxy — use xFracStdev as surrogate for alloying-element
  // heterogeneity. High alloy content → low-C or stainless → smooth
  // interface, sub-compound diffusion zone, no carbides.
  const xFracs = sorted.map((b) => xFracOf(b));
  const xFracMean = xFracs.length > 0 ? xFracs.reduce((s, v) => s + v, 0) / xFracs.length : 0.5;
  const xFracVar = xFracs.length > 1
    ? xFracs.reduce((s, v) => s + (v - xFracMean) ** 2, 0) / xFracs.length
    : 0;
  const reserveXFracStdev = Math.sqrt(xFracVar);
  const alloyFactorProxy = Math.max(0, Math.min(1, reserveXFracStdev * 2.0 + 0.10));
  const alloyFormerOk = alloyFactorProxy >= ALLOY_FACTOR_MIN ? 1 : 0;

  // Tooth morphology proxy.
  const toothMorphologyProxy = computeToothMorphology(concentrations, edgeK);

  // Gradient drop abruptness.
  const gradientDropAbruptness = computeGradientDropAbruptness(concentrations, edgeK);

  // Substrate type inference:
  //   - PLAIN_C: low alloy factor + high carbide indicators (tooth, abrupt
  //     gradient drop, high compound-layer variance).
  //   - LOW_C_OR_STAINLESS: high alloy factor + smooth interface (low tooth,
  //     gradual gradient drop, low compound variance).
  const plainCSignature =
    (alloyFactorProxy < 0.35 ? 1 : 0) +
    (toothMorphologyProxy > TOOTH_MORPHOLOGY_MIN ? 1 : 0) +
    (gradientDropAbruptness > GRADIENT_DROP_ABRUPTNESS_THRESHOLD ? 1 : 0) +
    (compoundLayerVariance > PLATEAU_VARIANCE_MAX ? 1 : 0);
  const substrateIsPlainC = plainCSignature >= 2;
  const substrateTypeProxy = substrateIsPlainC ? "PLAIN_C" : "LOW_C_OR_STAINLESS";

  // Carbide layer proxy (plain C mode). High when compound layer is on-
  // target, carbide phase balance is meaningful, and substrate is plain C.
  const silicideLayerProxy = Math.max(0, Math.min(1,
    (substrateIsPlainC ? 0.30 : 0.05) +
    (silicidePhaseBalance > 0.25 ? silicidePhaseBalance * 0.35 : 0) +
    (feSiFractionProxy > 0 ? Math.min(0.20, feSiFractionProxy * 0.40) : 0) +
    (edgeMean >= SURFACE_MIN_SI ? 0.15 : edgeMean / Math.max(0.01, SURFACE_MIN_SI) * 0.15)
  ));

  // Diffusion zone proxy (low-C / stainless mode). High when substrate is
  // low-C/stainless, gradient is gradual, and surface activity is moderate.
  const diffusionZoneProxy = Math.max(0, Math.min(1,
    (substrateIsPlainC ? 0.10 : 0.40) +
    alloyFactorProxy * 0.20 +
    (gradientDropAbruptness < GRADIENT_DROP_ABRUPTNESS_THRESHOLD - 0.15 ? 0.20 : 0) +
    (edgeMean >= SURFACE_MIN_SI * 0.8 ? 0.20 : edgeMean / Math.max(0.01, SURFACE_MIN_SI * 0.8) * 0.20) +
    (compoundLayerVariance <= PLATEAU_VARIANCE_MAX ? 0.10 : 0)
  ));

  // Embrittlement risk. UNIQUE to siliconizing: Si over-saturates and forms brittle
  // silicide layer, weakening core. Detected as abnormally-low coreActivity
  // for an inferred plain C substrate with meaningful silicide layer present.
  let embrittlementRisk = 0;
  if (substrateIsPlainC && silicideLayerProxy > 0.3) {
    // Expected core activity for a plain C substrate = CORE_BASELINE.
    // If core activity is well below, embrittlement is likely.
    const coreDeficit = Math.max(0, CORE_BASELINE - coreMean) / CORE_BASELINE;
    const carbideLoad = Math.min(1, silicideLayerProxy * 1.2);
    embrittlementRisk = Math.max(0, Math.min(1,
      coreDeficit * 0.45 +
      carbideLoad * 0.30 +
      (feSiFractionProxy + fe3SiFractionProxy) * 0.25
    ));
  }

  // Spallation risk: dual-phase stratification mismatch + over-thick layer
  // + variance. For siliconizing this is less severe than aluminizing because
  // BOTH carbide phases are hard. But near-monophase FeSi or over-thick
  // compound layer still risk adhesion failure.
  const spallationRisk = Math.max(0, Math.min(1,
    (feSiFractionProxy > FESI_FRACTION_MAX ? 0.35 : feSiFractionProxy / Math.max(0.01, FESI_FRACTION_MAX) * 0.20) +
    (compoundLayerVariance > DUAL_PHASE_VARIANCE_SIGNAL ? 0.30 : compoundLayerVariance / DUAL_PHASE_VARIANCE_SIGNAL * 0.25) +
    (surfaceMean > SURFACE_SATURATION ? 0.25 : 0) +
    ((feSiFractionProxy + fe3SiFractionProxy) > DUAL_PHASE_MAX * 2 ? 0.20 : 0)
  ));

  // Plateau quality: uniform/flat compound layer.
  const plateauQuality = Math.max(0, Math.min(1,
    (compoundLayerVariance <= PLATEAU_VARIANCE_MAX ? 1.0 : Math.max(0, 1 - (compoundLayerVariance - PLATEAU_VARIANCE_MAX) / PLATEAU_VARIANCE_MAX))
  ));

  // Compound-layer thickness (bins with concentration ≥ ECD_THRESHOLD).
  const compoundLayerThicknessBins = concentrations.filter((c) => c >= ECD_THRESHOLD).length;
  const halfN = Math.max(1, Math.floor(n / 2));
  const compoundLayerFraction = compoundLayerThicknessBins / (2 * halfN);
  const compoundLayerMeetsTarget = (
    compoundLayerFraction >= COMPOUND_LAYER_MIN_FRAC &&
    compoundLayerFraction <= COMPOUND_LAYER_MAX_FRAC
  ) ? 1 : 0;
  const compoundLayerExceedsTarget = compoundLayerFraction > COMPOUND_LAYER_MAX_FRAC ? 1 : 0;

  // Compound-layer activity (= outer band mean).
  const compoundLayerActivity = edgeMean;

  // Monotonic gradient quality.
  const monotonicity = gradientMonotonicity(concentrations);

  // Arrhenius diffusivity proxy (Si in γ-Fe).
  const diffusivityProxy = Math.max(0, Math.min(1,
    Math.exp(-Q_OVER_RT_SI_DIFFUSION / Math.max(0.05, drivingForce + 0.05))
  ));

  // Case depth proxy (√(Dt) — deeper than aluminizing, shallower than nitriding).
  const caseDepthProxy = Math.max(0, Math.min(1,
    compoundLayerFraction / Math.max(0.01, COMPOUND_LAYER_IDEAL_FRAC) *
    (FDT_REFERENCE_SILICONIZING / Math.max(0.01, FDT_REFERENCE_SILICONIZING))
  ));

  // Silicon potential proxy (Ksi). Real Ksi is derived from SiCl4/SiCl4
  // activator equilibrium. Here mapped from surface activity and field proximity.
  const ksiProxy = Math.max(0, Math.min(2,
    (siliconizingFieldOk ? 1.0 : 0.3) * surfaceMean * 1.1 +
    siliconizingFieldProximity * 0.15
  ));
  const ksiInWindow = (ksiProxy >= KSI_MIN && ksiProxy <= KSI_MAX) ? 1 : 0;
  const ksiProximity = ksiInWindow
    ? Math.max(0, 1 - Math.abs(ksiProxy - KSI_IDEAL) /
        Math.max(0.01, (KSI_MAX - KSI_MIN) / 2))
    : 0;

  // Risks.
  const underSiliconizeRisk = Math.max(0, Math.min(1,
    (ksiProxy < KSI_MIN ? 0.40 : 0) +
    (surfaceMean < SURFACE_MIN_SI ? 0.35 : 0) +
    (compoundLayerFraction < COMPOUND_LAYER_MIN_FRAC ? 0.25 : 0)
  ));

  const unevenSiliconizingRisk = Math.max(0, Math.min(1,
    (asymmetryIndex > ASYMMETRY_MAX ? 0.50 : asymmetryIndex / Math.max(0.01, ASYMMETRY_MAX) * 0.50) +
    (asymmetryIndex > 0.5 ? 0.30 : 0) +
    (leftMean < 0.2 || rightMean < 0.2 ? 0.20 : 0)
  ));

  const reverseGradientRisk = Math.max(0, Math.min(1,
    (surfaceMean + REVERSE_THRESHOLD < coreMean ? 0.60 : 0) +
    (edgeDominanceFraction < 0.45 ? 0.25 : 0) +
    (surfaceMean < CORE_BASELINE ? 0.15 : 0)
  ));

  const subSiliconizingFieldRisk = subSiliconizingField
    ? Math.min(1, (SILICONIZING_FIELD_MIN - drivingForce) / 0.20 + 0.5) : 0;
  const overSiliconizingFieldRisk = overSiliconizingField
    ? Math.min(1, (drivingForce - SILICONIZING_FIELD_MAX) / 0.12 + 0.5) : 0;

  // Case hardness proxy — HIGH (SILICONIZING_HV_SCALE = 0.80 — between
  // nitriding 1.10 and boronizing 1.30). Real carbide 900-1200 HV,
  // 60-65 HRC on plain C. Lower on low-C/stainless (no carbide).
  const hardnessComposite =
    surfaceMean * 0.25 +
    silicideLayerProxy * 0.25 +
    (silicidePhaseBalance > 0.30 ? 0.15 : silicidePhaseBalance / 0.30 * 0.15) +
    plateauQuality * 0.15 +
    ksiProximity * 0.10 +
    (compoundLayerMeetsTarget ? 0.10 : 0);
  const caseHardnessProxy = Math.max(0, Math.min(1,
    SILICONIZING_HV_SCALE * Math.max(0, Math.min(1, hardnessComposite))
  ));

  // Corrosion resistance proxy — FLAGSHIP property. Works in both modes:
  //   - Plain C carbide: high Si surface + dense silicide layer.
  //   - Low-C/stainless: α-Fe(Si) solid solution (12+ wt% Si = stainless).
  const corrosionResistanceProxy = Math.max(0, Math.min(1,
    surfaceMean * 0.30 +
    (1 - embrittlementRisk) * 0.20 +
    plateauQuality * 0.15 +
    (substrateIsPlainC ? silicideLayerProxy : diffusionZoneProxy) * 0.20 +
    ksiProximity * 0.10 +
    (compoundLayerMeetsTarget ? 0.05 : 0)
  ));

  // Wear resistance proxy — STRONG on plain C silicide layer — real hardness 900-1200 HV at SILICONIZING_HV_SCALE=0.80 (hard silicide),
  // MODERATE on low-C/stainless (no carbide, only solid-solution hardening).
  const wearResistanceProxy = Math.max(0, Math.min(1,
    caseHardnessProxy * (substrateIsPlainC ? 0.50 : 0.30) +
    (substrateIsPlainC ? silicideLayerProxy * 0.25 : diffusionZoneProxy * 0.10) +
    (1 - spallationRisk) * 0.15 +
    plateauQuality * 0.10
  ));

  // Fatigue resistance proxy — carbide-layer compressive stress (plain C)
  // or Fe-Si substrate strengthening (low-C). No quench-derived residual
  // stress (unlike carburizing/carbonitriding).
  const fatigueResistanceProxy = Math.max(0, Math.min(1,
    caseHardnessProxy * 0.30 +
    (substrateIsPlainC ? silicideLayerProxy * 0.25 : diffusionZoneProxy * 0.25) +
    (1 - spallationRisk) * 0.20 +
    (1 - embrittlementRisk) * 0.15 +
    (1 - reverseGradientRisk) * 0.10
  ));

  // Distortion proxy — LOW (no substrate phase transformation, no quench
  // required). DISTORTION_BASELINE=0.09.
  const distortionProxy = Math.max(0, Math.min(1,
    DISTORTION_BASELINE +
    overSiliconizingFieldRisk * 0.25 +
    unevenSiliconizingRisk * 0.20 +
    spallationRisk * 0.15 +
    embrittlementRisk * 0.10 +
    (compoundLayerExceedsTarget ? 0.10 : 0)
  ));

  const caseCoreRatio = coreMean > 1e-6
    ? caseHardnessProxy / Math.max(0.01, coreMean)
    : (caseHardnessProxy > 0 ? 10 : 0);

  // Reserves CV (informational).
  const totalMean = n > 0 ? totalUsd / n : 0;
  const totalVar = n > 1 && totalMean > 0
    ? sorted.reduce((s, b) => s + (b.totalUsd - totalMean) ** 2, 0) / n
    : 0;
  const reserveCV = totalMean > 0 ? Math.sqrt(totalVar) / totalMean : 0;

  // Composite stage progress.
  // For plain C mode, use silicideLayerProxy + silicidePhaseBalance as the
  // product-maturity signal. For low-C mode, use diffusionZoneProxy.
  const productMaturity = substrateIsPlainC
    ? (silicideLayerProxy * 0.65 + silicidePhaseBalance * 0.35)
    : diffusionZoneProxy;

  const stageProgress = Math.max(0, Math.min(1,
    siliconizingFieldOk * 0.12 +
    ksiInWindow * 0.10 +
    (surfaceMean >= SURFACE_MIN_SI ? 0.10 : surfaceMean / SURFACE_MIN_SI * 0.10) +
    productMaturity * 0.15 +
    (compoundLayerMeetsTarget ? 0.10 : 0) +
    plateauQuality * 0.08 +
    monotonicity * 0.07 +
    (1 - spallationRisk) * 0.08 +
    (1 - embrittlementRisk) * 0.08 +
    (1 - asymmetryIndex) * 0.07 +
    (substrateIsPlainC
      ? gradientDropAbruptness * 0.05
      : (1 - gradientDropAbruptness) * 0.05)
  ));

  // Dominant stage.
  let dominantStage = 0;
  if (spallationRisk > SPALLATION_RISK_THRESHOLD ||
      compoundLayerExceedsTarget ||
      embrittlementRisk > EMBRITTLEMENT_RISK_THRESHOLD) {
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
    computeBinSiliconizing(
      b, i, activeBin, sorted,
      concentrations, depths, bands, edgeK,
      surfaceMean, compoundLayerActivity, coreMean,
      asymmetryIndex, monotonicity,
      siliconizingFieldOk, spallationRisk, feSiFractionProxy,
      embrittlementRisk, substrateIsPlainC,
      stageProgress, compoundLayerFraction
    )
  );

  const stageDistribution = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const b of binRecs) {
    stageDistribution[Math.min(7, Math.max(0, b.stageBin))]++;
  }

  // Composite siliconizing index 0-100.
  const stageScore = Math.min(25, stageProgress * 25);
  const structureScore = Math.min(25,
    edgeDominanceFraction * 7 +
    (substrateIsPlainC ? silicideLayerProxy : diffusionZoneProxy) * 7 +
    plateauQuality * 5 +
    (substrateIsPlainC ? gradientDropAbruptness : (1 - gradientDropAbruptness)) * 3 +
    silicidePhaseBalance * 3
  );
  const propertyScore = Math.min(25,
    caseHardnessProxy * 6 +
    corrosionResistanceProxy * 7 +
    wearResistanceProxy * 5 +
    fatigueResistanceProxy * 3 +
    (1 - distortionProxy) * 2 +
    (1 - spallationRisk) * 2
  );
  const processScore = Math.min(25,
    (siliconizingFieldOk ? 5 : 0) +
    siliconizingFieldProximity * 2 +
    (ksiInWindow ? 4 : 0) +
    ksiProximity * 2 +
    (compoundLayerMeetsTarget ? 4 : 0) +
    (embrittlementRisk > EMBRITTLEMENT_RISK_THRESHOLD ? 0 : 3) +
    Math.max(0, 2 - spallationRisk * 2) +
    Math.max(0, 2 - unevenSiliconizingRisk * 2) +
    (1 - underSiliconizeRisk)
  );
  const siliconizingIndex = Math.round(
    Math.min(100, stageScore + structureScore + propertyScore + processScore)
  );

  // Regime selection.
  let siliconizingRegime: string;
  if (priorPeakDrivingForce < SILICONIZING_FIELD_MIN * 0.8) {
    siliconizingRegime = "NO_SILICONIZING_DRIVE";
  } else if (overSiliconizingField) {
    siliconizingRegime = "OVER_SILICONIZING_FIELD";
  } else if (subSiliconizingField) {
    siliconizingRegime = "SUB_SILICONIZING_FIELD";
  } else if (embrittlementRisk > EMBRITTLEMENT_RISK_THRESHOLD) {
    siliconizingRegime = "EMBRITTLEMENT_RISK";
  } else if (spallationRisk > SPALLATION_RISK_THRESHOLD) {
    siliconizingRegime = "OVER_SILICONIZED";
  } else if (compoundLayerExceedsTarget) {
    siliconizingRegime = "OVER_SILICONIZED";
  } else if (reverseGradientRisk > 0.6) {
    siliconizingRegime = "UNEVEN_SILICONIZING";
  } else if (unevenSiliconizingRisk > 0.6) {
    siliconizingRegime = "UNEVEN_SILICONIZING";
  } else if (underSiliconizeRisk > 0.6 && stageProgress < STAGE_4_BOUND) {
    siliconizingRegime = "UNDER_SILICONIZED";
  } else if (
    siliconizingFieldOk &&
    ksiInWindow &&
    surfaceMean >= SURFACE_MIN_SI &&
    edgeDominanceFraction >= EDGE_DOMINANCE_MIN &&
    compoundLayerMeetsTarget &&
    embrittlementRisk <= EMBRITTLEMENT_RISK_THRESHOLD &&
    spallationRisk <= SPALLATION_RISK_THRESHOLD &&
    stageProgress >= STAGE_6_BOUND
  ) {
    siliconizingRegime = "FULLY_SILICONIZED";
  } else if (
    siliconizingFieldOk &&
    substrateIsPlainC &&
    silicideLayerProxy >= 0.5 &&
    stageProgress >= STAGE_4_BOUND
  ) {
    siliconizingRegime = "SILICIDE_DOMINANT";
  } else if (
    siliconizingFieldOk &&
    !substrateIsPlainC &&
    diffusionZoneProxy >= 0.5 &&
    stageProgress >= STAGE_4_BOUND
  ) {
    siliconizingRegime = "DIFFUSION_ZONE_DOMINANT";
  } else if (siliconizingFieldOk && stageProgress >= STAGE_5_BOUND) {
    siliconizingRegime = "FESI_GROWTH";
  } else if (siliconizingFieldOk && stageProgress >= STAGE_4_BOUND) {
    siliconizingRegime = "FE3SI_NUCLEATION";
  } else if (siliconizingFieldOk && stageProgress >= STAGE_3_BOUND) {
    siliconizingRegime = "FE3SI_NUCLEATION";
  } else if (siliconizingFieldOk && surfaceMean >= SURFACE_MIN_SI * 0.7) {
    siliconizingRegime = "SILICON_POTENTIAL_ESTABLISHMENT";
  } else if (siliconizingFieldOk) {
    siliconizingRegime = "TEMPERATURE_RAMP";
  } else {
    siliconizingRegime = "PRE_SILICONIZE";
  }

  // Verdict selection.
  let siliconizingVerdict: string;
  if (priorPeakDrivingForce < SILICONIZING_FIELD_MIN * 0.8) {
    siliconizingVerdict = "NO_SILICONIZING_DRIVE";
  } else if (siliconizingRegime === "FULLY_SILICONIZED") {
    siliconizingVerdict = "SERVICE_READY";
  } else if (siliconizingRegime === "EMBRITTLEMENT_RISK") {
    siliconizingVerdict = "EMBRITTLEMENT_RISK";
  } else if (siliconizingRegime === "OVER_SILICONIZED" && spallationRisk > SPALLATION_RISK_THRESHOLD) {
    siliconizingVerdict = "SPALLATION_RISK";
  } else if (siliconizingRegime === "OVER_SILICONIZED") {
    siliconizingVerdict = "OVER_SILICONIZED";
  } else if (siliconizingRegime === "SILICIDE_DOMINANT") {
    siliconizingVerdict = "SILICIDE_DOMINANT";
  } else if (siliconizingRegime === "DIFFUSION_ZONE_DOMINANT") {
    siliconizingVerdict = "DIFFUSION_ZONE_DOMINANT";
  } else if (siliconizingRegime === "UNDER_SILICONIZED") {
    siliconizingVerdict = "UNDER_SILICONIZED";
  } else if (siliconizingRegime === "UNEVEN_SILICONIZING") {
    siliconizingVerdict = "UNEVEN_SILICONIZING";
  } else if (siliconizingRegime === "SUB_SILICONIZING_FIELD") {
    siliconizingVerdict = "SUB_SILICONIZING_FIELD";
  } else if (siliconizingRegime === "OVER_SILICONIZING_FIELD") {
    siliconizingVerdict = "OVER_SILICONIZING_FIELD";
  } else if (siliconizingRegime === "FESI_GROWTH") {
    siliconizingVerdict = "FESI_GROWTH";
  } else if (siliconizingRegime === "FE3SI_NUCLEATION") {
    siliconizingVerdict = "FE3SI_NUCLEATION";
  } else if (siliconizingRegime === "SILICON_POTENTIAL_ESTABLISHMENT") {
    siliconizingVerdict = "SILICON_POTENTIAL_ESTABLISHMENT";
  } else if (siliconizingRegime === "TEMPERATURE_RAMP") {
    siliconizingVerdict = "TEMPERATURE_RAMP";
  } else if (siliconizingRegime === "PRE_SILICONIZE") {
    siliconizingVerdict = "PRE_SILICONIZE";
  } else {
    siliconizingVerdict = "INTERMEDIATE_SILICONIZING";
  }

  const topBins = [...binRecs]
    .sort((a, b) => b.siliconizingDegree - a.siliconizingDegree)
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
    siliconizingFieldOk,
    siliconizingFieldProximity: r4(siliconizingFieldProximity),
    subSiliconizingField,
    overSiliconizingField,
    ksiProxy: r4(ksiProxy),
    ksiInWindow,
    ksiProximity: r4(ksiProximity),
    surfaceActivity: r4(surfaceMean),
    compoundLayerActivity: r4(compoundLayerActivity),
    compoundLayerVariance: r4(compoundLayerVariance),
    plateauQuality: r4(plateauQuality),
    feSiFractionProxy: r4(feSiFractionProxy),
    fe3SiFractionProxy: r4(fe3SiFractionProxy),
    silicidePhaseBalance: r4(silicidePhaseBalance),
    substrateTypeProxy,
    diffusionZoneProxy: r4(diffusionZoneProxy),
    silicideLayerProxy: r4(silicideLayerProxy),
    embrittlementRisk: r4(embrittlementRisk),
    spallationRisk: r4(spallationRisk),
    compoundLayerThicknessBins,
    compoundLayerFraction: r4(compoundLayerFraction),
    compoundLayerMeetsTarget,
    compoundLayerExceedsTarget,
    coreActivity: r4(coreMean),
    surfaceCoreDelta: r4(surfaceCoreDelta),
    surfaceCoreRatio: r4(surfaceCoreRatio),
    edgeDominanceFraction: r4(edgeDominanceFraction),
    asymmetryIndex: r4(asymmetryIndex),
    toothMorphologyProxy: r4(toothMorphologyProxy),
    gradientDropAbruptness: r4(gradientDropAbruptness),
    alloyFactorProxy: r4(alloyFactorProxy),
    alloyFormerOk,
    underSiliconizeRisk: r4(underSiliconizeRisk),
    unevenSiliconizingRisk: r4(unevenSiliconizingRisk),
    reverseGradientRisk: r4(reverseGradientRisk),
    subSiliconizingFieldRisk: r4(subSiliconizingFieldRisk),
    overSiliconizingFieldRisk: r4(overSiliconizingFieldRisk),
    caseHardnessProxy: r4(caseHardnessProxy),
    corrosionResistanceProxy: r4(corrosionResistanceProxy),
    wearResistanceProxy: r4(wearResistanceProxy),
    fatigueResistanceProxy: r4(fatigueResistanceProxy),
    distortionProxy: r4(distortionProxy),
    caseCoreRatio: r4(Math.min(10, caseCoreRatio)),
    diffusivityProxy: r4(diffusivityProxy),
    reserveCV: r4(reserveCV),
    reserveXFracStdev: r4(reserveXFracStdev),
    stageProgress: r4(stageProgress),
    dominantStage,
    siliconizingIndex,
    siliconizingRegime,
    siliconizingVerdict,
    stageDistribution,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  // Doctor: check constants and environment. Does NOT call network APIs.
  const checks: { name: string; ok: boolean; detail: string }[] = [];

  // Constants sanity.
  checks.push({
    name: "SILICONIZING_FIELD_MIN < SILICONIZING_FIELD_IDEAL < SILICONIZING_FIELD_MAX",
    ok: SILICONIZING_FIELD_MIN < SILICONIZING_FIELD_IDEAL && SILICONIZING_FIELD_IDEAL < SILICONIZING_FIELD_MAX,
    detail: `${SILICONIZING_FIELD_MIN} < ${SILICONIZING_FIELD_IDEAL} < ${SILICONIZING_FIELD_MAX}`,
  });
  checks.push({
    name: "KSI_MIN < KSI_IDEAL < KSI_MAX",
    ok: KSI_MIN < KSI_IDEAL && KSI_IDEAL < KSI_MAX,
    detail: `${KSI_MIN} < ${KSI_IDEAL} < ${KSI_MAX}`,
  });
  checks.push({
    name: "COMPOUND_LAYER_MIN_FRAC < COMPOUND_LAYER_IDEAL_FRAC < COMPOUND_LAYER_MAX_FRAC",
    ok: COMPOUND_LAYER_MIN_FRAC < COMPOUND_LAYER_IDEAL_FRAC && COMPOUND_LAYER_IDEAL_FRAC < COMPOUND_LAYER_MAX_FRAC,
    detail: `${COMPOUND_LAYER_MIN_FRAC} < ${COMPOUND_LAYER_IDEAL_FRAC} < ${COMPOUND_LAYER_MAX_FRAC}`,
  });
  checks.push({
    name: "FESI_FRACTION_IDEAL < FESI_FRACTION_MAX (hard-carbide acceptable up to MAX)",
    ok: FESI_FRACTION_IDEAL < FESI_FRACTION_MAX,
    detail: `${FESI_FRACTION_IDEAL} < ${FESI_FRACTION_MAX}`,
  });
  checks.push({
    name: "SILICONIZING_HV_SCALE < 1.00 (between aluminizing and carburizing; below nitriding)",
    ok: SILICONIZING_HV_SCALE > 0.65 && SILICONIZING_HV_SCALE < 1.00,
    detail: `SILICONIZING_HV_SCALE = ${SILICONIZING_HV_SCALE}`,
  });
  checks.push({
    name: "DISTORTION_BASELINE < 0.15 (low — no substrate transformation)",
    ok: DISTORTION_BASELINE < 0.15,
    detail: `DISTORTION_BASELINE = ${DISTORTION_BASELINE}`,
  });
  checks.push({
    name: "FDT_REFERENCE_SILICONIZING between aluminizing (0.12) and nitriding (0.22)",
    ok: FDT_REFERENCE_SILICONIZING > 0.12 && FDT_REFERENCE_SILICONIZING < 0.22,
    detail: `FDT_REFERENCE_SILICONIZING = ${FDT_REFERENCE_SILICONIZING}`,
  });
  checks.push({
    name: "EMBRITTLEMENT_RISK_THRESHOLD in (0, 1) — unique-to-siliconizing failure mode",
    ok: EMBRITTLEMENT_RISK_THRESHOLD > 0 && EMBRITTLEMENT_RISK_THRESHOLD < 1,
    detail: `EMBRITTLEMENT_RISK_THRESHOLD = ${EMBRITTLEMENT_RISK_THRESHOLD}`,
  });
  // Stage bounds strictly increasing.
  const stageBounds = [STAGE_1_BOUND, STAGE_2_BOUND, STAGE_3_BOUND, STAGE_4_BOUND, STAGE_5_BOUND, STAGE_6_BOUND];
  const stageBoundsOk = stageBounds.every((v, i) => i === 0 || v > stageBounds[i - 1]);
  checks.push({
    name: "stage bounds strictly increasing",
    ok: stageBoundsOk,
    detail: stageBounds.join(" < "),
  });
  // CASE_BAND_FRAC + CORE_BAND_FRAC ≤ 1.
  checks.push({
    name: "CASE_BAND_FRAC + CORE_BAND_FRAC ≤ 1",
    ok: CASE_BAND_FRAC + CORE_BAND_FRAC <= 1,
    detail: `${CASE_BAND_FRAC} + ${CORE_BAND_FRAC} = ${CASE_BAND_FRAC + CORE_BAND_FRAC}`,
  });

  const allOk = checks.every((c) => c.ok);
  console.log(JSON.stringify({
    result: allOk ? "ok" : "fail",
    checks,
    summary: `${checks.filter((c) => c.ok).length}/${checks.length} checks passed`,
  }, null, 2));
  if (!allOk) process.exit(1);
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

  const profiles: SiliconizingProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeSiliconizing(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgSiliconizingIndex: profiles.length > 0 ? r2(avg(profiles.map((p) => p.siliconizingIndex))) : 0,
    avgDrivingForce: profiles.length > 0 ? r4(avg(profiles.map((p) => p.drivingForce))) : 0,
    avgKsiProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.ksiProxy))) : 0,
    avgSurfaceActivity: profiles.length > 0 ? r4(avg(profiles.map((p) => p.surfaceActivity))) : 0,
    avgCompoundLayerActivity: profiles.length > 0 ? r4(avg(profiles.map((p) => p.compoundLayerActivity))) : 0,
    avgCompoundLayerVariance: profiles.length > 0 ? r4(avg(profiles.map((p) => p.compoundLayerVariance))) : 0,
    avgPlateauQuality: profiles.length > 0 ? r4(avg(profiles.map((p) => p.plateauQuality))) : 0,
    avgFeSiFractionProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.feSiFractionProxy))) : 0,
    avgFe3SiFractionProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.fe3SiFractionProxy))) : 0,
    avgSilicidePhaseBalance: profiles.length > 0 ? r4(avg(profiles.map((p) => p.silicidePhaseBalance))) : 0,
    avgEmbrittlementRisk: profiles.length > 0 ? r4(avg(profiles.map((p) => p.embrittlementRisk))) : 0,
    avgSpallationRisk: profiles.length > 0 ? r4(avg(profiles.map((p) => p.spallationRisk))) : 0,
    avgCoreActivity: profiles.length > 0 ? r4(avg(profiles.map((p) => p.coreActivity))) : 0,
    avgSurfaceCoreDelta: profiles.length > 0 ? r4(avg(profiles.map((p) => p.surfaceCoreDelta))) : 0,
    avgEdgeDominanceFraction: profiles.length > 0 ? r4(avg(profiles.map((p) => p.edgeDominanceFraction))) : 0,
    avgAsymmetryIndex: profiles.length > 0 ? r4(avg(profiles.map((p) => p.asymmetryIndex))) : 0,
    avgToothMorphologyProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.toothMorphologyProxy))) : 0,
    avgGradientDropAbruptness: profiles.length > 0 ? r4(avg(profiles.map((p) => p.gradientDropAbruptness))) : 0,
    avgCompoundLayerFraction: profiles.length > 0 ? r4(avg(profiles.map((p) => p.compoundLayerFraction))) : 0,
    avgCaseHardnessProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.caseHardnessProxy))) : 0,
    avgCorrosionResistanceProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.corrosionResistanceProxy))) : 0,
    avgWearResistanceProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.wearResistanceProxy))) : 0,
    avgFatigueResistanceProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.fatigueResistanceProxy))) : 0,
    avgDistortionProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.distortionProxy))) : 0,
    avgDiffusionZoneProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.diffusionZoneProxy))) : 0,
    avgSilicideLayerProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.silicideLayerProxy))) : 0,
    avgStageProgress: profiles.length > 0 ? r4(avg(profiles.map((p) => p.stageProgress))) : 0,
    avgUnderSiliconizeRisk: profiles.length > 0 ? r4(avg(profiles.map((p) => p.underSiliconizeRisk))) : 0,
    avgUnevenSiliconizingRisk: profiles.length > 0 ? r4(avg(profiles.map((p) => p.unevenSiliconizingRisk))) : 0,
    siliconizingFieldOkCount:          profiles.filter((p) => p.siliconizingFieldOk === 1).length,
    subSiliconizingFieldCount:         profiles.filter((p) => p.subSiliconizingField === 1).length,
    overSiliconizingFieldCount:        profiles.filter((p) => p.overSiliconizingField === 1).length,
    ksiInWindowCount:                profiles.filter((p) => p.ksiInWindow === 1).length,
    alloyFormerOkCount:              profiles.filter((p) => p.alloyFormerOk === 1).length,
    compoundLayerMeetsTargetCount:   profiles.filter((p) => p.compoundLayerMeetsTarget === 1).length,
    compoundLayerExceedsTargetCount: profiles.filter((p) => p.compoundLayerExceedsTarget === 1).length,
    plainCSubstrateCount:            profiles.filter((p) => p.substrateTypeProxy === "PLAIN_C").length,
    lowCOrStainlessSubstrateCount:   profiles.filter((p) => p.substrateTypeProxy === "LOW_C_OR_STAINLESS").length,
    preSiliconizeCount:                profiles.filter((p) => p.siliconizingRegime === "PRE_SILICONIZE").length,
    temperatureRampCount:            profiles.filter((p) => p.siliconizingRegime === "TEMPERATURE_RAMP").length,
    siliconPotentialEstablishmentCount: profiles.filter((p) => p.siliconizingRegime === "SILICON_POTENTIAL_ESTABLISHMENT").length,
    fe3SiNucleationCount:           profiles.filter((p) => p.siliconizingRegime === "FE3SI_NUCLEATION").length,
    feSiGrowthCount:                profiles.filter((p) => p.siliconizingRegime === "FESI_GROWTH").length,
    fullySiliconizedCount:             profiles.filter((p) => p.siliconizingRegime === "FULLY_SILICONIZED").length,
    overSiliconizedCount:              profiles.filter((p) => p.siliconizingRegime === "OVER_SILICONIZED").length,
    carbideDominantCount:            profiles.filter((p) => p.siliconizingRegime === "SILICIDE_DOMINANT").length,
    diffusionZoneDominantCount:      profiles.filter((p) => p.siliconizingRegime === "DIFFUSION_ZONE_DOMINANT").length,
    embrittlementRiskCount:        profiles.filter((p) => p.siliconizingRegime === "EMBRITTLEMENT_RISK").length,
    underSiliconizedCount:             profiles.filter((p) => p.siliconizingRegime === "UNDER_SILICONIZED").length,
    unevenSiliconizingCount:           profiles.filter((p) => p.siliconizingRegime === "UNEVEN_SILICONIZING").length,
    subSiliconizingFieldRegimeCount:   profiles.filter((p) => p.siliconizingRegime === "SUB_SILICONIZING_FIELD").length,
    overSiliconizingFieldRegimeCount:  profiles.filter((p) => p.siliconizingRegime === "OVER_SILICONIZING_FIELD").length,
    noDriveCount:                    profiles.filter((p) => p.siliconizingRegime === "NO_SILICONIZING_DRIVE").length,
    serviceReadyVerdictCount:        profiles.filter((p) => p.siliconizingVerdict === "SERVICE_READY").length,
    carbideDominantVerdictCount:     profiles.filter((p) => p.siliconizingVerdict === "SILICIDE_DOMINANT").length,
    diffusionZoneDominantVerdictCount: profiles.filter((p) => p.siliconizingVerdict === "DIFFUSION_ZONE_DOMINANT").length,
    embrittleRiskVerdictCount:          profiles.filter((p) => p.siliconizingVerdict === "EMBRITTLEMENT_RISK").length,
    spallationRiskVerdictCount:      profiles.filter((p) => p.siliconizingVerdict === "SPALLATION_RISK").length,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program
  .name("hodlmm-bin-siliconizing")
  .description("HODLMM bin siliconizing (Si pack-cementation) analyzer — models THERMOCHEMICAL SINGLE-SPECIES (SILICON) SURFACE-DIFFUSION case-hardening at 900-1100 C in gamma-Fe producing either a DUAL-CARBIDE COMPOUND LAYER (FeSi outer + Fe3Si inner on plain-C steel) or an alpha-Fe(Si) SOLID-SOLUTION DIFFUSION ZONE (on low-C or stainless); flags service-ready pools (mixed-silicide layer or solid-solution zone on-target — NO QUENCH REQUIRED, unlike carburizing and carbonitriding) as well as embrittlement-risk (unique-to-siliconizing core weakening), spallation-risk, over-siliconized, under-siliconized, uneven-siliconizing, and sub/over siliconizing-field conditions; SILICONIZING_HV_SCALE=0.80 is between aluminizing 0.65 and carburizing 1.00, HIGHER than aluminizing 0.65 and carburizing 1.00 (900-1200 HV, 60-65 HRC equivalent on plain C silicide layer — real hardness 900-1200 HV at SILICONIZING_HV_SCALE=0.80); flagship property is CORROSION + WEAR combo (distinct from aluminizing pure oxidation and boronizing pure extreme wear)");

program.command("doctor").description("Check constants and environment (no network calls)").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin siliconizing state")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
