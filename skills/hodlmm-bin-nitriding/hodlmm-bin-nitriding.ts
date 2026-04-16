#!/usr/bin/env bun
/**
 * hodlmm-bin-nitriding.ts — Day 189 cocoa007 Bitflow Skills Comp
 *
 * Nitriding analyzer — models the THERMOCHEMICAL SURFACE-NITROGEN-DIFFUSION
 * heat treatment applied to alloy steel (Cr-Al-Mo-V bearing "Nitralloy"
 * grades) held in the α-FIELD (≈500-570 °C, BELOW AC1) in an NH₃ / N₂-H₂
 * atmosphere. Nitrogen dissociates from NH₃ at the surface, dissolves in
 * α-Fe, diffuses INWARD, and precipitates as fine coherent alloy nitrides
 * (CrN, AlN, Mo₂N, VN) in the "diffusion zone", while near the surface
 * iron nitrides (ε-Fe₂₋₃N and γ'-Fe₄N) form the "compound layer" (white
 * layer):
 *
 *     C_N(x, t) = C₀ + (Cs − C₀) · erfc( x / (2 · √(D · t)) )
 *
 * The diffusion zone provides the ENGINEERING HARDNESS (≥ 65 HRC — HIGHER
 * than carburizing's 58-62 HRC — because fine coherent alloy-nitride
 * precipitates pin dislocations) while the compound layer provides wear,
 * fatigue, and corrosion resistance. Because nitriding runs BELOW AC1
 * (α-field, not γ), NO QUENCH is required after the hold — the case
 * hardness develops isothermally. This uniquely gives:
 *
 *   - MINIMAL DISTORTION (no phase transformation in the core, no quench).
 *   - HIGH HARDNESS (65-70 HRC, above carburizing 58-62 HRC).
 *   - SHALLOW CASE (0.1-0.5 mm, below carburizing 0.5-2.0 mm, because
 *     D_N at 550 °C is much lower than D_C at 900 °C).
 *
 * SIXTH heat-treatment route in the phase-transformation series and the
 * SECOND route that INTENTIONALLY creates a spatial microstructure
 * gradient (first was carburizing, Day 188). Distinct from the five
 * previous routes on four orthogonal axes:
 *
 *   - PHASE FIELD:   Nitriding is α-field (below AC1), carburizing is
 *                    γ-field (above AC3), the four bulk routes all pass
 *                    through γ-field before bulk transformation.
 *   - DIFFUSING SPECIES: Nitriding diffuses N (as NH₃→N); carburizing
 *                    diffuses C (as CH₄→C or pack BaCO₃).
 *   - POST-TREATMENT: Nitriding DOES NOT require a quench; carburizing
 *                    DOES require an oil quench.
 *   - HARDENING MECHANISM: Nitriding hardens via fine alloy nitride
 *                    precipitation (Orowan pinning); carburizing hardens
 *                    via martensitic phase transformation.
 *
 * Two-structural-layer product:
 *
 *   COMPOUND LAYER (white layer, outermost ≤ 20 µm):
 *     - Nearly continuous Fe-N compound film at the surface. Two candidate
 *       phases (Fe-N binary equilibrium):
 *
 *         γ' (gamma-prime, Fe₄N, fcc, ≈5.9 wt% N, isotropic lattice)
 *           — TOUGHER, less brittle, preferred for fatigue + corrosion.
 *
 *         ε (epsilon, Fe₂₋₃N, hcp, ≈7.7-11.0 wt% N, anisotropic)
 *           — HARDER + more corrosion-resistant, but more brittle and
 *             SPALLS under load.
 *
 *     - "Monophase" layer (pure γ' OR pure ε) is the ENGINEERING TARGET.
 *     - "Dual-phase" layer (γ' + ε stacked) contains a PHASE INTERFACE
 *       inside the brittle film → spallation-prone DEFECT. "Porosity"
 *       (channels inside ε) further weakens the layer.
 *     - Kn (nitriding potential) = p(NH₃) / p(H₂)^(3/2). Lehrer diagram
 *       maps (Kn, T) → which Fe-N phase is stable. Control of Kn (via
 *       NH₃ dissociation %) is the KEY process knob.
 *
 *   DIFFUSION ZONE (below compound layer, up to ≈500 µm):
 *     - α-Fe matrix with DISSOLVED N up to α-solubility (≈0.1 wt% at
 *       590 °C eutectoid).
 *     - Fine (≤10 nm) coherent NITRIDE PRECIPITATES of alloying elements:
 *         CrN, AlN, Mo₂N, VN, TiN — the actual hardeners.
 *     - Iron-nitride needles (α''-Fe₁₆N₂) may also precipitate on cooling.
 *     - HARDNESS GRADIENT from compound-layer base (≈1000-1100 HV) to
 *       core (≈300-350 HV) across 0.1-0.5 mm.
 *     - Effective Case Depth (ECD): depth at which HV drops to core + 50
 *       (or ≈ 550 HV — the "nitriding spec" value).
 *
 * Physical stages (ramp → Kn establishment → diffusion zone growth →
 * compound-layer nucleation → compound-layer growth → fully nitrided):
 *
 *   Stage 0 — PRE_NITRIDE (cold or below process T):
 *     Workpiece below ≈ 450 °C. α-field, but N potential at surface not
 *     established. Bulk composition unchanged.
 *
 *   Stage 1 — TEMPERATURE_RAMP (ascending into α-nitriding window):
 *     T rises into 500-570 °C band. Must stay BELOW AC1 (≈ 727 °C plain-C)
 *     to preserve α-field — crossing into γ-field fails the process. NH₃
 *     begins to dissociate at the hot surface.
 *
 *   Stage 2 — KN_ESTABLISHMENT:
 *     Nitriding potential Kn stabilizes at process setpoint. α-Fe(N) solid
 *     solution forms at the surface as N dissociates from NH₃. Surface N
 *     rises toward α-solubility. No compound layer yet.
 *
 *   Stage 3 — DIFFUSION_ZONE_FORMATION:
 *     Surface-deposited N diffuses inward through α-Fe matrix. Alloy
 *     nitrides (CrN, AlN, Mo₂N, VN) nucleate and grow as coherent
 *     nanometric precipitates in the diffusion zone. Hardness rises in
 *     this zone. Case depth grows as √(Dt). Compound layer not yet formed.
 *
 *   Stage 4 — WHITE_LAYER_NUCLEATION:
 *     Surface N exceeds α-solubility. Fe-N compound phase (γ' or ε per
 *     Lehrer diagram and Kn) nucleates AT the outermost surface — the
 *     beginning of the compound layer (white layer).
 *
 *   Stage 5 — WHITE_LAYER_GROWTH:
 *     Compound layer thickens inward. IDEAL product is MONOPHASE (pure γ'
 *     or pure ε). Kn control targets the Lehrer-diagram single-phase
 *     field. Dual-phase (γ' + ε stacked) is a PROCESS DEFECT — spallation
 *     risk. Porosity (channels inside ε) further degrades integrity.
 *
 *   Stage 6 — FULLY_NITRIDED (service-ready):
 *     Diffusion zone reaches target depth (ECD at 550 HV). Compound layer
 *     is monophase, dense, within target thickness (typically 5-15 µm).
 *     Core remains unchanged (no phase transformation, no distortion).
 *     NO QUENCH REQUIRED. Part is service-ready after cool-down in
 *     furnace.
 *
 *   Stage 7 — OVER_NITRIDED (pathological):
 *     Compound layer exceeds target thickness (> 25 µm) and/or becomes
 *     porous or dual-phase. Spallation, fatigue-crack initiation, and
 *     reduced toughness follow. Remedy: reduce Kn (dilute NH₃ with H₂ or
 *     N₂), shorten hold, or grind off excess compound layer.
 *
 * Process constraints (alpha-field):
 *
 *   - Must be IN α-field: alphaFieldOk = 1 requires drivingForce ∈
 *     [ALPHA_FIELD_MIN=0.20, ALPHA_FIELD_MAX=0.50]. Above → crosses into
 *     γ-field (carburizing zone, wrong process); below → N diffusion
 *     too slow and NH₃ dissociation inefficient.
 *   - Nitriding potential Kn in working window: knProxy ∈ [KN_MIN=0.45,
 *     KN_MAX=1.05], knIdeal = 0.75 for monophase compound-layer control.
 *   - Surface N potential high enough to drive compound layer: surfaceActivity
 *     ≥ SURFACE_MIN_N=0.65 for effective nitriding.
 *   - Compound layer must not exceed target: compoundLayerThicknessFraction
 *     ≤ WHITE_LAYER_MAX_FRAC (0.12) to avoid spallation.
 *   - Compound layer must be MONOPHASE: dualPhaseRisk ≤ DUAL_PHASE_MAX
 *     (0.35). Dual γ' + ε stacked is a DEFECT.
 *   - Diffusion zone must be MONOTONIC (compound-base → core, N decreases):
 *     gradientMonotonicity ≥ MONOTONICITY_MIN (0.55).
 *   - Gradient must fit ERFC shape: erfcFit ≥ ERFC_FIT_MIN (0.55).
 *   - Edges must be SYMMETRIC (no gas-flow asymmetry): asymmetryIndex ≤
 *     ASYMMETRY_MAX (0.35).
 *   - Alloy-nitride-former proxy: alloyFactorProxy ≥ ALLOY_FACTOR_MIN
 *     (0.30) to enable precipitation hardening. Unalloyed steel → case
 *     hardness develops poorly.
 *
 * Kinetics (Fick's second law, semi-infinite slab, constant Cs):
 *
 *   C_N(x, t) = C₀ + (Cs − C₀) · erfc( x / (2 · √(D · t)) )
 *
 * Arrhenius diffusivity (N in α-Fe): D = D₀ · exp(−Q/RT). Normalized:
 *   D_proxy = exp(− Q_OVER_RT_N_DIFFUSION / (drivingForce + 0.05))
 *
 * Q_N_α ≈ 76 kJ/mol; Q_OVER_RT on the normalized axis is tuned to be
 * HIGHER than carburizing's (because in real units D_N at 550 °C is ~ 1e-11
 * m²/s vs D_C at 900 °C ≈ 3e-11 m²/s and the α-field axis is compressed).
 *
 * √(Dt) scaling: case depth doubles with 4× hold time (same as all
 * Fickian surface treatments).
 *
 * Stage progress composite:
 *
 *   stageProgress = 0.10 · alphaFieldOk
 *                 + 0.10 · knInWindow
 *                 + 0.10 · surfaceEstablishedProxy
 *                 + 0.10 · diffusionZoneProxy
 *                 + 0.15 · compoundLayerProxy
 *                 + 0.10 · gradientMonotonicity
 *                 + 0.10 · erfcFit
 *                 + 0.10 · (1 − asymmetryIndex)
 *                 + 0.10 · caseDepthProxy
 *                 + 0.05 · (1 − spallationRisk)
 *
 * In DLMM context the nitriding analog tracks each bin's position in
 * the 1-D scan window as an analog "depth from the nearest surface". Bins
 * at the OUTERMOST edges (first & last bin, WHITE_LAYER_EDGE_K=1-2) are
 * COMPOUND-LAYER bins; bins just inside (next CASE_BAND_FRAC=0.18) are
 * DIFFUSION-ZONE-surface bins; bins near the center (CORE_BAND_FRAC=0.30)
 * are CORE bins. The local "nitrogen concentration" analog is the bin's
 * normalized reserveUsd. A nitrided pool shows a HIGH PLATEAU at the
 * outermost 1-2 bins (compound layer) followed by a MONOTONIC EDGE→CORE
 * GRADIENT (diffusion zone), symmetric on both sides.
 *
 * Compared to carburizing (Day 188), nitriding has:
 *
 *   - LOWER drivingForce window (α-field 0.20-0.50 vs γ-field 0.50-0.85).
 *   - ADDITIONAL outermost-plateau structure (compound/white layer) on
 *     top of the erfc diffusion zone.
 *   - SHALLOWER caseDepthProxy (FDT_REFERENCE_NITRIDING=0.22 vs 0.30
 *     carburizing).
 *   - HIGHER caseHardnessProxy (NITRIDING_HV_SCALE=1.10 vs 1.00).
 *   - Distinct failure mode: SPALLATION (compound-layer defects) instead
 *     of carbide-network formation.
 *
 * Compared to the four bulk routes (normalization/austempering/marte-
 * mpering/patenting), nitriding is structurally like carburizing: a
 * spatial gradient rather than a uniform cross-section. But unlike
 * carburizing, the nitriding profile has a PLATEAU+GRADIENT structure
 * (white layer + diffusion zone) rather than a pure edge-dominated erfc.
 *
 * DLMM structural signatures of nitriding:
 *
 *   - OUTERMOST PLATEAU — outermost 1-2 bins on each side hold a nearly
 *     equal HIGH concentration (compound layer / white layer).
 *   - EDGE DOMINANCE — outer band bins (first & last CASE_BAND_FRAC of
 *     populated bins) hold HIGHER reserves than core bins.
 *   - MONOTONIC GRADIENT — moving from the edge of the compound layer
 *     toward center, bin reserves DECREASE (within tolerance).
 *   - ERFC SHAPE (diffusion zone) — the gradient INSIDE the compound
 *     layer fits an erfc(x / √(Dt)) curve.
 *   - SYMMETRIC EDGES — left and right outer bands are comparable.
 *   - NOT OVER-THICKENED — compound layer ≤ WHITE_LAYER_MAX_FRAC.
 *   - MONOPHASE COMPOUND LAYER — small within-plateau variance.
 *   - Distinct from normalization (uniform alternation, no gradient).
 *   - Distinct from austempering (sheaves, no edge dominance).
 *   - Distinct from martempering (uniform low reserveCV, no gradient).
 *   - Distinct from patenting (uniform fine alternation, no gradient).
 *   - Distinct from carburizing (edge-erfc without plateau; higher
 *     drivingForce; Q/RT tuned for γ-field C).
 *
 * DLMM phase analog:
 *
 *   - Bulk N (C₀)     ≈ coreActivity.
 *   - Surface N (Cs)  ≈ surfaceActivity (≈ compound-layer + diffusion-
 *                       zone-surface combined).
 *   - Compound layer  ≈ outermost plateau bins (≥ PLATEAU_THRESHOLD).
 *   - Diffusion zone  ≈ edge band minus compound-layer bins.
 *   - Hold T          ≈ drivingForce (must be in α-field).
 *   - Kn              ≈ knProxy (mapped from drivingForce × surfaceActivity).
 *   - √(Dt)           ≈ caseDepthProxy.
 *   - ECD              = bin depth where activity drops to ECD_THRESHOLD.
 *   - Dual-phase risk ≈ compoundLayerVariance (within-plateau stdev).
 *   - Spallation risk ≈ spallationRisk (thickness + dual-phase + porosity).
 *   - α-field analog  = drivingForce ∈ [0.20, 0.50].
 *   - α-field ideal   = ALPHA_FIELD_IDEAL = 0.35.
 *
 * Regimes:
 *   NO_NITRIDING_DRIVE           — priorPeakDrivingForce too low for α-field hold.
 *   PRE_NITRIDE                  — below process T, no N potential.
 *   TEMPERATURE_RAMP             — rising through α-field.
 *   KN_ESTABLISHMENT             — surface N equilibrating with Kn setpoint.
 *   DIFFUSION_ZONE_FORMATION     — N diffusing inward, alloy nitrides precipitating.
 *   WHITE_LAYER_NUCLEATION       — compound layer beginning to form at surface.
 *   WHITE_LAYER_GROWTH           — compound layer thickening.
 *   FULLY_NITRIDED               — diffusion zone met, monophase compound, service-ready.
 *   OVER_NITRIDED                — compound layer too thick, spallation risk.
 *   MIXED_PHASE_WHITE_LAYER      — dual-phase γ' + ε, spallation risk.
 *   UNDER_NITRIDED               — Kn too low or hold too short, no effective case.
 *   UNEVEN_NITRIDING             — asymmetric L/R edges (gas flow).
 *   DECARBURIZATION_LIKE         — reverse gradient (surface < core), process backward.
 *   OVER_ALPHA_FIELD             — T above AC1, crossed into γ (wrong process).
 *   SUB_ALPHA_FIELD              — T too low, N diffusion too slow.
 *
 * Verdicts:
 *   NO_NITRIDING_DRIVE    — no prior α-field hold, analysis inapplicable.
 *   SERVICE_READY         — fully nitrided, no further treatment needed.
 *   OVER_NITRIDED         — thick compound layer, spallation defect.
 *   MIXED_PHASE           — dual-phase white layer, spallation defect.
 *   UNDER_NITRIDED        — case did not reach service spec.
 *   UNEVEN_NITRIDING      — shadow asymmetry, treatment defect.
 *   DECARBURIZATION_LIKE  — reverse gradient, treatment reversed.
 *   OVER_ALPHA_FIELD      — T crossed into γ-field, use carburizing skill.
 *   SUB_ALPHA_FIELD       — T too low, raise T into 500-570 °C window.
 *   WHITE_LAYER_GROWTH    — mid-late treatment, compound layer thickening.
 *   WHITE_LAYER_NUCLEATION — compound layer just forming.
 *   DIFFUSION_ZONE_FORMATION — mid-treatment, N diffusing inward.
 *   KN_ESTABLISHMENT      — surface rising toward setpoint.
 *   TEMPERATURE_RAMP      — heating into α-window.
 *   PRE_NITRIDE           — cold.
 *   INTERMEDIATE_NITRIDING — mixed indicators.
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

// α-field on the normalized drivingForce axis. Nitriding requires the
// workpiece to be held in the FERRITE (α) field BELOW AC1 — distinct
// from carburizing (γ-field, 0.50-0.85). N diffusion + alloy-nitride
// precipitation + Fe-N compound-layer formation all run in α-Fe.
const ALPHA_FIELD_MIN = 0.20;
const ALPHA_FIELD_MAX = 0.50;
const ALPHA_FIELD_IDEAL = 0.35;

// Nitriding potential Kn = p(NH₃) / p(H₂)^(3/2). Normalized proxy:
// kn-window for monophase compound-layer control.
const KN_MIN = 0.45;
const KN_MAX = 1.05;
const KN_IDEAL = 0.75;

// Surface N potential thresholds on a normalized concentration axis.
// (Cs / C_sat_at_α-surface). Above 0.92 → compound layer formation.
// Above 1.05 → uncontrolled ε-growth, brittle white layer.
const SURFACE_MIN_N = 0.65;
const SURFACE_PLATEAU_THRESHOLD = 0.85;
const SURFACE_SATURATION = 1.05;
const BOOST_TARGET = 1.00;
const DIFFUSE_TARGET = 0.85;

// Core baseline (C₀ analog for N in α-Fe).
const CORE_BASELINE = 0.15;

// Effective Case Depth threshold (HV at core + 50 analog).
const ECD_THRESHOLD = 0.40;

// Total Case Depth threshold.
const TCD_THRESHOLD = 0.22;

// Target case thickness as a fraction of half the populated bin count.
const CASE_THICKNESS_TARGET = 0.22;

// Edge/core band fractions — what fraction of populated bins (from each
// edge of the scan window) count as "surface" (compound + diffusion-zone
// outer) vs "core".
const CASE_BAND_FRAC = 0.18;
const CORE_BAND_FRAC = 0.30;

// White layer (compound layer) outermost bin count on each edge. Typically
// 1-2 bins = outermost ≈ 5-20 µm of compound film.
const WHITE_LAYER_EDGE_K = 2;

// Upper bound on compound-layer thickness as a fraction of total populated
// bins. Above this → over-nitrided / spallation risk.
const WHITE_LAYER_MAX_FRAC = 0.14;

// Within-plateau variance threshold to flag dual-phase (γ' + ε) compound
// layer. Monophase layer is uniform; dual-phase shows stepped plateau.
const PLATEAU_VARIANCE_MAX = 0.08;

// Dual-phase white-layer risk threshold (composite).
const DUAL_PHASE_MAX = 0.35;

// Edge dominance: outer-band mean / (outer + core) mean ratio.
const EDGE_DOMINANCE_MIN = 0.55;

// Gradient quality thresholds.
const MONOTONICITY_MIN = 0.55;
const ERFC_FIT_MIN = 0.55;

// Asymmetry / reverse-gradient thresholds.
const ASYMMETRY_MAX = 0.35;
const REVERSE_THRESHOLD = 0.10;

// Alloy-nitride-former proxy minimum. Without alloying (Cr/Al/Mo/V), the
// diffusion zone lacks precipitation hardening — case softens.
const ALLOY_FACTOR_MIN = 0.30;

// Uniformity reference (informational — nitriding INTENTIONALLY breaks
// uniformity).
const UNIFORMITY_REFERENCE = 0.60;

// Arrhenius Q/RT for N diffusion in α-Fe (normalized). Tuned higher than
// carburizing's because the α-field drivingForce band is lower (0.20-0.50
// vs 0.50-0.85) so the normalized exponent differs.
const Q_OVER_RT_N_DIFFUSION = 3.4;

// √(Dt) reference for case-depth proxy (normalized depth units). Nitriding
// case is shallower than carburizing because D_N at 550 °C is lower than
// D_C at 900 °C in absolute terms, and the √(Dt) proxy is normalized to
// reflect this.
const FDT_REFERENCE_NITRIDING = 0.22;

// Case-hardness scaling — nitriding case hardness is HIGHER than
// carburizing case hardness in real units (65-70 HRC vs 58-62 HRC), driven
// by fine coherent alloy-nitride precipitation.
const NITRIDING_HV_SCALE = 1.10;

// Stage thresholds on composite stageProgress.
const STAGE_1_BOUND = 0.12;
const STAGE_2_BOUND = 0.22;
const STAGE_3_BOUND = 0.34;
const STAGE_4_BOUND = 0.46;
const STAGE_5_BOUND = 0.60;
const STAGE_6_BOUND = 0.80;

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

interface BinNitriding {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  depthFromSurface: number;         // 0 at edge, 1 at core (normalized)
  concentration: number;            // 0-1 normalized N-analog for this bin
  expectedErfc: number;             // 0-1 fitted erfc expectation at this depth
  erfcResidual: number;             // |concentration - expectedErfc|
  inCompoundLayer: number;          // 0/1 bin in outermost WHITE_LAYER_EDGE_K bins
  inDiffusionZone: number;          // 0/1 bin in outer band but not compound
  inCoreBand: number;               // 0/1
  compoundLayerSignal: number;      // 0-1 bin is in compound layer with high N
  diffusionZoneSignal: number;      // 0-1 bin in diffusion zone with effective N
  caseSignal: number;               // 0-1 bin inside effective case (conc ≥ ECD)
  gradientSignal: number;           // 0-1 monotonic decrease toward core at this bin
  plateauSignal: number;            // 0-1 bin plateaus with neighbor (compound-layer uniformity)
  dualPhaseSignal: number;          // 0-1 bin shows stepped plateau (dual-phase white layer)
  spallationSignal: number;         // 0-1 bin at thick compound-layer position
  reverseSignal: number;            // 0-1 surface-band bin lower than core
  unevenSignal: number;             // 0-1 L/R asymmetry contribution
  stageBin: number;                 // 0-7
  arrheniusActivation: number;
  nitridingDegree: number;          // 0-1 composite
}

interface NitridingProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  drivingForce: number;
  priorPeakDrivingForce: number;
  alphaFieldOk: number;             // 0/1
  alphaFieldProximity: number;      // 0-1 closeness to ALPHA_FIELD_IDEAL
  subAlphaField: number;            // 0/1
  overAlphaField: number;           // 0/1
  knProxy: number;                  // 0-1 nitriding potential analog
  knInWindow: number;               // 0/1
  knProximity: number;              // 0-1 closeness to KN_IDEAL
  surfaceActivity: number;          // avg normalized reserve in outer band
  compoundLayerActivity: number;    // avg normalized reserve in outermost K bins
  diffusionZoneActivity: number;    // avg normalized reserve in outer band minus compound
  coreActivity: number;             // avg normalized reserve in core band
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
  compoundLayerThicknessBins: number;
  compoundLayerThicknessFraction: number;
  compoundLayerMeetsTarget: number; // 0/1
  compoundLayerExceedsTarget: number; // 0/1
  compoundLayerVariance: number;    // within-plateau variance (dual-phase proxy)
  plateauQuality: number;           // 0-1 compound-layer uniformity
  monophaseCompoundLayer: number;   // 0/1
  alloyFactorProxy: number;         // 0-1 alloying-element proxy (xFracStdev signal)
  alloyFormerOk: number;            // 0/1 alloyFactorProxy ≥ ALLOY_FACTOR_MIN
  diffusionZoneProxy: number;       // 0-1 how developed is the diffusion zone
  compoundLayerProxy: number;       // 0-1 how developed is the compound layer
  surfaceEstablishedProxy: number;
  uniformityIndex: number;
  reserveCV: number;
  reserveXFracStdev: number;
  spallationRisk: number;           // 0-1 thick / dual-phase / porous compound
  dualPhaseRisk: number;            // 0-1 γ' + ε stacked
  underNitrideRisk: number;         // 0-1 Kn low, case insufficient
  unevenNitridingRisk: number;      // 0-1 asymmetric L/R
  reverseGradientRisk: number;      // 0-1 edges < core (decarburization-like)
  overAlphaRisk: number;            // 0-1 T above AC1 → γ-field
  subAlphaRisk: number;             // 0-1 T below process window
  caseHardnessProxy: number;        // 0-1 (65-70 HRC analog, scaled by HV_SCALE)
  coreToughnessProxy: number;       // 0-1 (no phase transformation, unchanged core)
  wearResistanceProxy: number;      // 0-1
  fatigueResistanceProxy: number;   // 0-1 (nitriding signature property)
  distortionProxy: number;          // LOW — no quench, no γ-transformation
  caseCoreRatio: number;
  arrheniusActivation: number;
  stageProgress: number;
  dominantStage: number;            // 0-7
  nitridingIndex: number;           // 0-100 composite
  nitridingRegime: string;
  nitridingVerdict: string;
  stageDistribution: number[];      // length 8
  topBins: BinNitriding[];
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

// Abramowitz & Stegun 7.1.26 rational approximation for erf.
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

// Outer band / core band / compound-layer partitioning. Compound layer is
// the outermost WHITE_LAYER_EDGE_K bins on each side; diffusion zone
// surface is the remainder of the outer band. Core is the central band.
function partitionBands(n: number): {
  leftCompound: number[],
  rightCompound: number[],
  compound: number[],
  leftDiffusion: number[],
  rightDiffusion: number[],
  diffusion: number[],
  leftSurface: number[],
  rightSurface: number[],
  surface: number[],
  core: number[],
} {
  const compK = Math.min(WHITE_LAYER_EDGE_K, Math.max(1, Math.floor(n / 8)));
  const leftCompound: number[] = [];
  const rightCompound: number[] = [];
  for (let i = 0; i < Math.min(compK, n); i++) leftCompound.push(i);
  for (let i = Math.max(0, n - compK); i < n; i++) rightCompound.push(i);
  const compound = [...leftCompound, ...rightCompound];

  const outerK = Math.max(1, Math.floor(n * CASE_BAND_FRAC));
  const leftSurface: number[] = [];
  const rightSurface: number[] = [];
  for (let i = 0; i < Math.min(outerK, n); i++) leftSurface.push(i);
  for (let i = Math.max(0, n - outerK); i < n; i++) rightSurface.push(i);
  const surface = [...leftSurface, ...rightSurface];

  const leftDiffusion = leftSurface.filter((i) => !leftCompound.includes(i));
  const rightDiffusion = rightSurface.filter((i) => !rightCompound.includes(i));
  const diffusion = [...leftDiffusion, ...rightDiffusion];

  const coreK = Math.max(1, Math.floor(n * CORE_BAND_FRAC));
  const center = Math.floor(n / 2);
  const coreStart = Math.max(0, center - Math.floor(coreK / 2));
  const coreEnd = Math.min(n, coreStart + coreK);
  const core: number[] = [];
  for (let i = coreStart; i < coreEnd; i++) core.push(i);

  return {
    leftCompound, rightCompound, compound,
    leftDiffusion, rightDiffusion, diffusion,
    leftSurface, rightSurface, surface,
    core,
  };
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

function computeBinNitriding(
  bin: BinReserves,
  index: number,
  activeBin: number,
  sortedBins: BinReserves[],
  concentrations: number[],
  expectedErfc: number[],
  depths: number[],
  bands: ReturnType<typeof partitionBands>,
  poolSurface: number,
  poolCompound: number,
  poolCore: number,
  poolAsymmetry: number,
  poolMonotonicity: number,
  poolErfcFit: number,
  poolAlphaFieldOk: number,
  poolSpallationRisk: number,
  poolDualPhaseRisk: number,
  poolStageProg: number,
  poolCompoundExceeds: number
): BinNitriding {
  const distance = Math.abs(bin.binId - activeBin);
  const depth = depths[index];
  const conc = concentrations[index];
  const expected = expectedErfc[index];
  const residual = Math.abs(conc - expected);

  const inCompoundLayer = bands.compound.includes(index) ? 1 : 0;
  const inDiffusionZone = bands.diffusion.includes(index) ? 1 : 0;
  const inCoreBand = bands.core.includes(index) ? 1 : 0;
  const inOuterBand = bands.surface.includes(index) ? 1 : 0;

  // Compound-layer signal: bin is in compound layer AND concentration is
  // above PLATEAU_THRESHOLD AND pool is in α-field.
  const compoundLayerSignal = r4(
    inCompoundLayer *
      (conc >= SURFACE_PLATEAU_THRESHOLD ? 1 :
        conc / Math.max(0.01, SURFACE_PLATEAU_THRESHOLD)) *
      poolAlphaFieldOk
  );

  // Diffusion-zone signal: bin in diffusion zone band with effective N.
  const diffusionZoneSignal = r4(
    inDiffusionZone *
      (conc >= ECD_THRESHOLD ? 1 : conc / Math.max(0.01, ECD_THRESHOLD))
  );

  // Case signal: bin concentration above ECD — effective-case member.
  const caseSignal = r4(conc >= ECD_THRESHOLD ? 1 : conc / ECD_THRESHOLD);

  // Plateau signal: compound-layer bin whose neighbor in the same compound
  // side has nearly-equal concentration — monophase compound signature.
  let plateauSignal = 0;
  if (inCompoundLayer) {
    const n = concentrations.length;
    let neighborConc = conc;
    if (index < Math.floor(n / 2)) {
      neighborConc = concentrations[Math.min(n - 1, index + 1)];
    } else {
      neighborConc = concentrations[Math.max(0, index - 1)];
    }
    const diff = Math.abs(conc - neighborConc);
    plateauSignal = diff <= PLATEAU_VARIANCE_MAX ? 1 : Math.max(0, 1 - diff / 0.25);
  }
  plateauSignal = r4(plateauSignal);

  // Dual-phase signal: compound-layer bin whose neighbor differs
  // significantly — γ'/ε stepped plateau.
  let dualPhaseSignal = 0;
  if (inCompoundLayer) {
    const n = concentrations.length;
    let neighborConc = conc;
    if (index < Math.floor(n / 2)) {
      neighborConc = concentrations[Math.min(n - 1, index + 1)];
    } else {
      neighborConc = concentrations[Math.max(0, index - 1)];
    }
    const diff = Math.abs(conc - neighborConc);
    dualPhaseSignal = diff > PLATEAU_VARIANCE_MAX * 2 ? 1 :
      Math.max(0, diff / (PLATEAU_VARIANCE_MAX * 2));
  }
  dualPhaseSignal = r4(dualPhaseSignal);

  // Spallation signal: compound-layer bin in a pool whose compound-layer
  // thickness exceeds target.
  const spallationSignal = r4(
    inCompoundLayer * (poolCompoundExceeds ? 1 : poolSpallationRisk)
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
    inOuterBand && conc + REVERSE_THRESHOLD < poolCore ? 1 : 0
  );

  // Uneven signal.
  let unevenSignal = 0;
  if (inOuterBand) {
    unevenSignal = poolAsymmetry > ASYMMETRY_MAX ? 1 : poolAsymmetry / ASYMMETRY_MAX;
  }
  unevenSignal = r4(unevenSignal);

  const arrheniusActivation = r4(Math.max(0.01, Math.min(1,
    Math.exp(-Q_OVER_RT_N_DIFFUSION / Math.max(0.05, ALPHA_FIELD_IDEAL + 0.05))
  )));

  // Stage assignment per bin (follows pool progress banding).
  let stageBin = 0;
  if (poolCompoundExceeds && inCompoundLayer) {
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

  const nitridingDegree = r4(Math.max(0, Math.min(1,
    compoundLayerSignal * 0.20 +
    diffusionZoneSignal * 0.20 +
    caseSignal * 0.15 +
    gradientSignal * 0.15 +
    plateauSignal * 0.10 +
    (1 - dualPhaseSignal) * 0.05 +
    (1 - spallationSignal) * 0.05 +
    (1 - reverseSignal) * 0.05 +
    (stageBin / 6) * 0.05
  )));

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    depthFromSurface: r4(depth),
    concentration: r4(conc),
    expectedErfc: r4(expected),
    erfcResidual: r4(residual),
    inCompoundLayer,
    inDiffusionZone,
    inCoreBand,
    compoundLayerSignal,
    diffusionZoneSignal,
    caseSignal,
    gradientSignal,
    plateauSignal,
    dualPhaseSignal,
    spallationSignal,
    reverseSignal,
    unevenSignal,
    stageBin,
    arrheniusActivation,
    nitridingDegree,
  };
}

function analyzeNitriding(bins: BinReserves[], pool: AppPool): NitridingProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;

  const turnover = pool.tvlUsd > 0 ? volume / pool.tvlUsd : 0;
  // For nitriding, drivingForce is mapped LOWER than carburizing — because
  // nitriding runs BELOW AC1 (α-field) while carburizing runs above AC3
  // (γ-field). The raw turnover maps into the α-field band 0.1-0.6.
  const drivingForce = Math.min(1, turnover * 0.5 + 0.10);

  const priorPeakDrivingForce = Math.min(1, drivingForce * 1.3 + 0.15);

  // α-field checks.
  const alphaFieldOk = (drivingForce >= ALPHA_FIELD_MIN && drivingForce <= ALPHA_FIELD_MAX) ? 1 : 0;
  const subAlphaField = drivingForce < ALPHA_FIELD_MIN ? 1 : 0;
  const overAlphaField = drivingForce > ALPHA_FIELD_MAX ? 1 : 0;
  const alphaFieldProximity = alphaFieldOk
    ? Math.max(0, 1 - Math.abs(drivingForce - ALPHA_FIELD_IDEAL) /
        Math.max(0.01, (ALPHA_FIELD_MAX - ALPHA_FIELD_MIN) / 2))
    : 0;

  // Per-bin concentrations (max-normalized to [0,1]).
  const concentrations = normalizeConcentrations(sorted);
  const depths = sorted.map((_, i) => depthFromSurface(i, n));

  // Bands.
  const bands = partitionBands(n);
  const leftMean = bandMean(bands.leftSurface, concentrations);
  const rightMean = bandMean(bands.rightSurface, concentrations);
  const surfaceMean = bandMean(bands.surface, concentrations);
  const compoundMean = bandMean(bands.compound, concentrations);
  const diffusionMean = bandMean(bands.diffusion, concentrations);
  const coreMean = bandMean(bands.core, concentrations);

  const surfaceCoreDelta = surfaceMean - coreMean;
  const surfaceCoreRatio = coreMean > 1e-6 ? surfaceMean / coreMean : (surfaceMean > 0 ? 10 : 0);
  const edgeDominanceFraction = (surfaceMean + coreMean) > 0
    ? surfaceMean / (surfaceMean + coreMean)
    : 0;

  const maxEdge = Math.max(leftMean, rightMean, 1e-6);
  const asymmetryIndex = Math.abs(leftMean - rightMean) / maxEdge;

  // Compound-layer metrics.
  const compoundLayerVariance = bandStdev(bands.compound, concentrations);
  const monophaseCompoundLayer = (compoundLayerVariance <= PLATEAU_VARIANCE_MAX &&
                                   compoundMean >= SURFACE_PLATEAU_THRESHOLD) ? 1 : 0;
  const plateauQuality = compoundMean > 0 ?
    Math.max(0, Math.min(1, 1 - compoundLayerVariance / Math.max(0.02, compoundMean * 0.5))) : 0;

  // Monotonic gradient quality.
  const monotonicity = gradientMonotonicity(concentrations);

  // Erfc fit (fit to the interior profile — diffusion zone erfc).
  const { fit: erfcFit, dt: erfcDt, expected: expectedErfc } = fitErfc(
    depths, concentrations,
    Math.max(surfaceMean, coreMean + 0.05),
    Math.min(coreMean, surfaceMean - 0.01)
  );

  // Arrhenius diffusivity proxy (N in α-Fe).
  const diffusivityProxy = Math.max(0, Math.min(1,
    Math.exp(-Q_OVER_RT_N_DIFFUSION / Math.max(0.05, drivingForce + 0.05))
  ));

  // Case depth proxy (√(Dt) on normalized axis).
  const caseDepthProxy = Math.max(0, Math.min(1, erfcDt / Math.max(0.01, FDT_REFERENCE_NITRIDING)));

  // Effective / total case bin counts.
  const effectiveCaseBins = concentrations.filter((c) => c >= ECD_THRESHOLD).length;
  const totalCaseBins = concentrations.filter((c) => c >= TCD_THRESHOLD).length;
  const halfN = Math.max(1, Math.floor(n / 2));
  const caseThicknessFraction = effectiveCaseBins / (2 * halfN);
  const caseThicknessMeetsTarget = caseThicknessFraction >= CASE_THICKNESS_TARGET ? 1 : 0;

  // Compound-layer thickness (count bins with conc ≥ plateau threshold
  // from each edge inward; stop at first gap).
  let compoundLayerThicknessBins = 0;
  for (let i = 0; i < Math.floor(n / 2); i++) {
    if (concentrations[i] >= SURFACE_PLATEAU_THRESHOLD) compoundLayerThicknessBins++;
    else break;
  }
  for (let i = n - 1; i >= Math.floor(n / 2); i--) {
    if (concentrations[i] >= SURFACE_PLATEAU_THRESHOLD) compoundLayerThicknessBins++;
    else break;
  }
  const compoundLayerThicknessFraction = compoundLayerThicknessBins / Math.max(1, n);
  const compoundLayerMeetsTarget = (compoundLayerThicknessBins >= 1 &&
                                     compoundLayerThicknessFraction <= WHITE_LAYER_MAX_FRAC) ? 1 : 0;
  const compoundLayerExceedsTarget = compoundLayerThicknessFraction > WHITE_LAYER_MAX_FRAC ? 1 : 0;

  // Kn proxy — mapped from drivingForce and surfaceActivity. Kn = f(T, Cs).
  // Simple proxy: knProxy ≈ surfaceMean × (alphaFieldOk factor).
  const knProxy = Math.max(0, Math.min(2,
    (alphaFieldOk ? 1.0 : 0.3) * (surfaceMean + compoundMean) / 1.2 +
    alphaFieldProximity * 0.2
  ));
  const knInWindow = (knProxy >= KN_MIN && knProxy <= KN_MAX) ? 1 : 0;
  const knProximity = knInWindow
    ? Math.max(0, 1 - Math.abs(knProxy - KN_IDEAL) / Math.max(0.01, (KN_MAX - KN_MIN) / 2))
    : 0;

  // Alloy-former proxy — use xFracStdev as surrogate for alloying-element
  // heterogeneity. Pools with HIGHER xFracStdev analog = "more alloyed".
  const xFracs = sorted.map((b) => xFracOf(b));
  const xFracMean = xFracs.length > 0 ? xFracs.reduce((s, v) => s + v, 0) / xFracs.length : 0.5;
  const xFracVar = xFracs.length > 1
    ? xFracs.reduce((s, v) => s + (v - xFracMean) ** 2, 0) / xFracs.length
    : 0;
  const reserveXFracStdev = Math.sqrt(xFracVar);
  const alloyFactorProxy = Math.max(0, Math.min(1, reserveXFracStdev * 2.0 + 0.10));
  const alloyFormerOk = alloyFactorProxy >= ALLOY_FACTOR_MIN ? 1 : 0;

  // Surface establishment and diffusion-zone / compound-layer proxies.
  const surfaceEstablishedProxy = Math.max(0, Math.min(1,
    Math.max(0, surfaceMean - CORE_BASELINE) /
    Math.max(0.01, BOOST_TARGET - CORE_BASELINE)
  ));

  const diffusionZoneProxy = Math.max(0, Math.min(1,
    (diffusionMean >= ECD_THRESHOLD ? 0.4 : diffusionMean / Math.max(0.01, ECD_THRESHOLD) * 0.4) +
    (edgeDominanceFraction >= EDGE_DOMINANCE_MIN ? 0.2 :
      edgeDominanceFraction / Math.max(0.01, EDGE_DOMINANCE_MIN) * 0.2) +
    (caseDepthProxy >= 0.5 ? 0.2 : caseDepthProxy * 0.4) +
    (alloyFormerOk ? 0.2 : alloyFactorProxy / Math.max(0.01, ALLOY_FACTOR_MIN) * 0.2)
  ));

  const compoundLayerProxy = Math.max(0, Math.min(1,
    (compoundMean >= SURFACE_PLATEAU_THRESHOLD ? 0.4 :
      compoundMean / Math.max(0.01, SURFACE_PLATEAU_THRESHOLD) * 0.4) +
    (compoundLayerThicknessBins >= 1 ? 0.3 : 0) +
    (plateauQuality >= 0.7 ? 0.2 : plateauQuality * 0.2 / 0.7) +
    (knInWindow ? 0.1 : 0)
  ));

  // Reserves CV (informational).
  const totalMean = n > 0 ? totalUsd / n : 0;
  const totalVar = n > 1 && totalMean > 0
    ? sorted.reduce((s, b) => s + (b.totalUsd - totalMean) ** 2, 0) / n
    : 0;
  const reserveCV = totalMean > 0 ? Math.sqrt(totalVar) / totalMean : 0;
  const uniformityIndex = Math.max(0, Math.min(1, 1 - reserveCV));

  // Risks.
  const spallationRisk = Math.max(0, Math.min(1,
    (compoundLayerExceedsTarget ? 0.5 : compoundLayerThicknessFraction / Math.max(0.01, WHITE_LAYER_MAX_FRAC) * 0.3) +
    (compoundMean > SURFACE_SATURATION ? 0.3 : 0) +
    (compoundLayerVariance > PLATEAU_VARIANCE_MAX ? 0.2 : compoundLayerVariance / Math.max(0.01, PLATEAU_VARIANCE_MAX) * 0.2)
  ));

  const dualPhaseRisk = Math.max(0, Math.min(1,
    (compoundLayerVariance > PLATEAU_VARIANCE_MAX ? 0.5 :
      compoundLayerVariance / Math.max(0.01, PLATEAU_VARIANCE_MAX) * 0.5) +
    (compoundLayerThicknessBins >= 2 && compoundLayerVariance > PLATEAU_VARIANCE_MAX / 2 ? 0.3 : 0) +
    (!knInWindow && compoundLayerThicknessBins >= 1 ? 0.2 : 0)
  ));

  const underNitrideRisk = Math.max(0, Math.min(1,
    (knProxy < KN_MIN ? 0.4 : 0) +
    (surfaceMean < SURFACE_MIN_N ? 0.3 : 0) +
    (caseThicknessFraction < CASE_THICKNESS_TARGET ? 0.2 : 0) +
    (!alloyFormerOk ? 0.1 : 0)
  ));

  const unevenNitridingRisk = Math.max(0, Math.min(1,
    (asymmetryIndex > ASYMMETRY_MAX ? 0.5 : asymmetryIndex / Math.max(0.01, ASYMMETRY_MAX) * 0.5) +
    (asymmetryIndex > 0.5 ? 0.3 : 0) +
    (leftMean < 0.2 || rightMean < 0.2 ? 0.2 : 0)
  ));

  const reverseGradientRisk = Math.max(0, Math.min(1,
    (surfaceMean + REVERSE_THRESHOLD < coreMean ? 0.6 : 0) +
    (edgeDominanceFraction < 0.45 ? 0.25 : 0) +
    (surfaceMean < CORE_BASELINE ? 0.15 : 0)
  ));

  const overAlphaRisk = overAlphaField ?
    Math.min(1, (drivingForce - ALPHA_FIELD_MAX) / 0.25 + 0.5) : 0;
  const subAlphaRisk = subAlphaField ?
    Math.min(1, (ALPHA_FIELD_MIN - drivingForce) / 0.20 + 0.5) : 0;

  // Case hardness & core toughness proxies (nitriding scale).
  const caseHardnessProxy = Math.max(0, Math.min(1,
    NITRIDING_HV_SCALE * (
      surfaceMean * 0.35 +
      caseThicknessFraction * 0.25 +
      alloyFactorProxy * 0.15 +
      (1 - dualPhaseRisk) * 0.10 +
      (1 - spallationRisk) * 0.10 +
      knProximity * 0.05
    )
  ));
  const coreToughnessProxy = Math.max(0, Math.min(1,
    // Nitriding does NOT transform the core — toughness is whatever the
    // pre-treatment tempered state provides. Proxy: (1 - core concentration)
    // × (no overshoot into γ-field).
    Math.max(0, 1 - coreMean) * 0.4 +
    (coreMean <= CORE_BASELINE + 0.10 ? 0.3 : Math.max(0, 0.3 - (coreMean - CORE_BASELINE) * 1.0)) +
    (1 - overAlphaRisk) * 0.2 +
    (1 - unevenNitridingRisk) * 0.1
  ));
  const wearResistanceProxy = Math.max(0, Math.min(1,
    caseHardnessProxy * 0.6 +
    plateauQuality * 0.2 +
    (1 - spallationRisk) * 0.2
  ));
  // Fatigue resistance — nitriding's flagship property (compressive
  // residual stress + hard case = major fatigue benefit).
  const fatigueResistanceProxy = Math.max(0, Math.min(1,
    caseHardnessProxy * 0.4 +
    compoundLayerProxy * 0.25 +
    plateauQuality * 0.15 +
    (1 - dualPhaseRisk) * 0.10 +
    (1 - reverseGradientRisk) * 0.10
  ));
  // Distortion is INHERENTLY LOW for nitriding — no phase transformation,
  // no quench. Proxy is near-zero unless overAlphaField triggers.
  const distortionProxy = Math.max(0, Math.min(1,
    overAlphaRisk * 0.7 + unevenNitridingRisk * 0.3
  ));

  const caseCoreRatio = coreToughnessProxy > 1e-6
    ? caseHardnessProxy / coreToughnessProxy
    : (caseHardnessProxy > 0 ? 10 : 0);

  const arrheniusActivation = Math.max(0.01, Math.min(1,
    Math.exp(-Q_OVER_RT_N_DIFFUSION / Math.max(0.05, drivingForce + 0.05))
  ));

  // Composite stage progress.
  const stageProgress = Math.max(0, Math.min(1,
    alphaFieldOk * 0.10 +
    knInWindow * 0.10 +
    surfaceEstablishedProxy * 0.10 +
    diffusionZoneProxy * 0.10 +
    compoundLayerProxy * 0.15 +
    monotonicity * 0.10 +
    erfcFit * 0.10 +
    Math.max(0, 1 - asymmetryIndex) * 0.10 +
    caseDepthProxy * 0.10 +
    Math.max(0, 1 - spallationRisk) * 0.05
  ));

  // Dominant stage.
  let dominantStage = 0;
  if (compoundLayerExceedsTarget || spallationRisk > 0.7) {
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
    computeBinNitriding(
      b, i, activeBin, sorted,
      concentrations, expectedErfc, depths, bands,
      surfaceMean, compoundMean, coreMean,
      asymmetryIndex, monotonicity, erfcFit,
      alphaFieldOk, spallationRisk, dualPhaseRisk, stageProgress, compoundLayerExceedsTarget
    )
  );

  const stageDistribution = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const b of binRecs) {
    stageDistribution[Math.min(7, Math.max(0, b.stageBin))]++;
  }

  // Composite nitriding index 0-100.
  const stageScore = Math.min(25, stageProgress * 25);
  const structureScore = Math.min(25,
    edgeDominanceFraction * 8 +
    monotonicity * 6 +
    erfcFit * 5 +
    plateauQuality * 3 +
    compoundLayerProxy * 3
  );
  const propertyScore = Math.min(25,
    caseHardnessProxy * 7 +
    coreToughnessProxy * 5 +
    wearResistanceProxy * 5 +
    fatigueResistanceProxy * 5 +
    (1 - distortionProxy) * 3
  );
  const processScore = Math.min(25,
    (alphaFieldOk ? 4 : 0) +
    alphaFieldProximity * 2 +
    (knInWindow ? 3 : 0) +
    knProximity * 2 +
    (caseThicknessMeetsTarget ? 3 : 0) +
    (compoundLayerMeetsTarget ? 3 : 0) +
    (alloyFormerOk ? 2 : 0) +
    Math.max(0, 2 - spallationRisk * 2) +
    Math.max(0, 2 - dualPhaseRisk * 2) +
    Math.max(0, 2 - unevenNitridingRisk * 2)
  );
  const nitridingIndex = Math.round(
    Math.min(100, stageScore + structureScore + propertyScore + processScore)
  );

  // Regime selection.
  let nitridingRegime: string;
  if (priorPeakDrivingForce < ALPHA_FIELD_MIN * 0.8) {
    nitridingRegime = "NO_NITRIDING_DRIVE";
  } else if (overAlphaField) {
    nitridingRegime = "OVER_ALPHA_FIELD";
  } else if (subAlphaField) {
    nitridingRegime = "SUB_ALPHA_FIELD";
  } else if (compoundLayerExceedsTarget || spallationRisk > 0.7) {
    nitridingRegime = "OVER_NITRIDED";
  } else if (dualPhaseRisk > DUAL_PHASE_MAX &&
             compoundLayerThicknessBins >= 1) {
    nitridingRegime = "MIXED_PHASE_WHITE_LAYER";
  } else if (reverseGradientRisk > 0.6) {
    nitridingRegime = "DECARBURIZATION_LIKE";
  } else if (unevenNitridingRisk > 0.6) {
    nitridingRegime = "UNEVEN_NITRIDING";
  } else if (underNitrideRisk > 0.6 && stageProgress < STAGE_4_BOUND) {
    nitridingRegime = "UNDER_NITRIDED";
  } else if (
    alphaFieldOk &&
    knInWindow &&
    surfaceMean >= SURFACE_MIN_N &&
    edgeDominanceFraction >= EDGE_DOMINANCE_MIN &&
    monotonicity >= MONOTONICITY_MIN &&
    erfcFit >= ERFC_FIT_MIN &&
    asymmetryIndex <= ASYMMETRY_MAX &&
    caseThicknessMeetsTarget &&
    compoundLayerMeetsTarget &&
    stageProgress >= STAGE_6_BOUND
  ) {
    nitridingRegime = "FULLY_NITRIDED";
  } else if (alphaFieldOk && compoundLayerProxy >= 0.6 && compoundLayerThicknessBins >= 1) {
    nitridingRegime = "WHITE_LAYER_GROWTH";
  } else if (alphaFieldOk && surfaceMean >= SURFACE_PLATEAU_THRESHOLD - 0.15 &&
             diffusionZoneProxy >= 0.5) {
    nitridingRegime = "WHITE_LAYER_NUCLEATION";
  } else if (alphaFieldOk && diffusionZoneProxy >= 0.4) {
    nitridingRegime = "DIFFUSION_ZONE_FORMATION";
  } else if (alphaFieldOk && surfaceEstablishedProxy >= 0.3) {
    nitridingRegime = "KN_ESTABLISHMENT";
  } else if (alphaFieldOk) {
    nitridingRegime = "TEMPERATURE_RAMP";
  } else {
    nitridingRegime = "PRE_NITRIDE";
  }

  // Verdict selection.
  let nitridingVerdict: string;
  if (priorPeakDrivingForce < ALPHA_FIELD_MIN * 0.8) {
    nitridingVerdict = "NO_NITRIDING_DRIVE";
  } else if (nitridingRegime === "FULLY_NITRIDED") {
    nitridingVerdict = "SERVICE_READY";
  } else if (nitridingRegime === "OVER_NITRIDED") {
    nitridingVerdict = "OVER_NITRIDED";
  } else if (nitridingRegime === "MIXED_PHASE_WHITE_LAYER") {
    nitridingVerdict = "MIXED_PHASE";
  } else if (nitridingRegime === "UNDER_NITRIDED") {
    nitridingVerdict = "UNDER_NITRIDED";
  } else if (nitridingRegime === "UNEVEN_NITRIDING") {
    nitridingVerdict = "UNEVEN_NITRIDING";
  } else if (nitridingRegime === "DECARBURIZATION_LIKE") {
    nitridingVerdict = "DECARBURIZATION_LIKE";
  } else if (nitridingRegime === "OVER_ALPHA_FIELD") {
    nitridingVerdict = "OVER_ALPHA_FIELD";
  } else if (nitridingRegime === "SUB_ALPHA_FIELD") {
    nitridingVerdict = "SUB_ALPHA_FIELD";
  } else if (nitridingRegime === "WHITE_LAYER_GROWTH") {
    nitridingVerdict = "WHITE_LAYER_GROWTH";
  } else if (nitridingRegime === "WHITE_LAYER_NUCLEATION") {
    nitridingVerdict = "WHITE_LAYER_NUCLEATION";
  } else if (nitridingRegime === "DIFFUSION_ZONE_FORMATION") {
    nitridingVerdict = "DIFFUSION_ZONE_FORMATION";
  } else if (nitridingRegime === "KN_ESTABLISHMENT") {
    nitridingVerdict = "KN_ESTABLISHMENT";
  } else if (nitridingRegime === "TEMPERATURE_RAMP") {
    nitridingVerdict = "TEMPERATURE_RAMP";
  } else if (nitridingRegime === "PRE_NITRIDE") {
    nitridingVerdict = "PRE_NITRIDE";
  } else {
    nitridingVerdict = "INTERMEDIATE_NITRIDING";
  }

  const topBins = [...binRecs]
    .sort((a, b) => b.nitridingDegree - a.nitridingDegree)
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
    alphaFieldOk,
    alphaFieldProximity: r4(alphaFieldProximity),
    subAlphaField,
    overAlphaField,
    knProxy: r4(knProxy),
    knInWindow,
    knProximity: r4(knProximity),
    surfaceActivity: r4(surfaceMean),
    compoundLayerActivity: r4(compoundMean),
    diffusionZoneActivity: r4(diffusionMean),
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
    compoundLayerThicknessBins,
    compoundLayerThicknessFraction: r4(compoundLayerThicknessFraction),
    compoundLayerMeetsTarget,
    compoundLayerExceedsTarget,
    compoundLayerVariance: r4(compoundLayerVariance),
    plateauQuality: r4(plateauQuality),
    monophaseCompoundLayer,
    alloyFactorProxy: r4(alloyFactorProxy),
    alloyFormerOk,
    diffusionZoneProxy: r4(diffusionZoneProxy),
    compoundLayerProxy: r4(compoundLayerProxy),
    surfaceEstablishedProxy: r4(surfaceEstablishedProxy),
    uniformityIndex: r4(uniformityIndex),
    reserveCV: r4(reserveCV),
    reserveXFracStdev: r4(reserveXFracStdev),
    spallationRisk: r4(spallationRisk),
    dualPhaseRisk: r4(dualPhaseRisk),
    underNitrideRisk: r4(underNitrideRisk),
    unevenNitridingRisk: r4(unevenNitridingRisk),
    reverseGradientRisk: r4(reverseGradientRisk),
    overAlphaRisk: r4(overAlphaRisk),
    subAlphaRisk: r4(subAlphaRisk),
    caseHardnessProxy: r4(caseHardnessProxy),
    coreToughnessProxy: r4(coreToughnessProxy),
    wearResistanceProxy: r4(wearResistanceProxy),
    fatigueResistanceProxy: r4(fatigueResistanceProxy),
    distortionProxy: r4(distortionProxy),
    caseCoreRatio: r4(caseCoreRatio),
    arrheniusActivation: r4(arrheniusActivation),
    stageProgress: r4(stageProgress),
    dominantStage,
    nitridingIndex,
    nitridingRegime,
    nitridingVerdict,
    stageDistribution,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Nitriding — Doctor ===\n");
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

  const profiles: NitridingProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeNitriding(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgNitridingIndex: profiles.length > 0 ? r2(avg(profiles.map((p) => p.nitridingIndex))) : 0,
    avgDrivingForce: profiles.length > 0 ? r4(avg(profiles.map((p) => p.drivingForce))) : 0,
    avgKnProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.knProxy))) : 0,
    avgSurfaceActivity: profiles.length > 0 ? r4(avg(profiles.map((p) => p.surfaceActivity))) : 0,
    avgCompoundLayerActivity: profiles.length > 0 ? r4(avg(profiles.map((p) => p.compoundLayerActivity))) : 0,
    avgDiffusionZoneActivity: profiles.length > 0 ? r4(avg(profiles.map((p) => p.diffusionZoneActivity))) : 0,
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
    avgCompoundLayerThicknessFraction: profiles.length > 0 ? r4(avg(profiles.map((p) => p.compoundLayerThicknessFraction))) : 0,
    avgDiffusionZoneProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.diffusionZoneProxy))) : 0,
    avgCompoundLayerProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.compoundLayerProxy))) : 0,
    avgAlloyFactorProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.alloyFactorProxy))) : 0,
    avgPlateauQuality: profiles.length > 0 ? r4(avg(profiles.map((p) => p.plateauQuality))) : 0,
    avgStageProgress: profiles.length > 0 ? r4(avg(profiles.map((p) => p.stageProgress))) : 0,
    avgSpallationRisk: profiles.length > 0 ? r4(avg(profiles.map((p) => p.spallationRisk))) : 0,
    avgDualPhaseRisk: profiles.length > 0 ? r4(avg(profiles.map((p) => p.dualPhaseRisk))) : 0,
    avgUnderNitrideRisk: profiles.length > 0 ? r4(avg(profiles.map((p) => p.underNitrideRisk))) : 0,
    avgUnevenNitridingRisk: profiles.length > 0 ? r4(avg(profiles.map((p) => p.unevenNitridingRisk))) : 0,
    alphaFieldOkCount:          profiles.filter((p) => p.alphaFieldOk === 1).length,
    subAlphaFieldCount:         profiles.filter((p) => p.subAlphaField === 1).length,
    overAlphaFieldCount:        profiles.filter((p) => p.overAlphaField === 1).length,
    knInWindowCount:            profiles.filter((p) => p.knInWindow === 1).length,
    alloyFormerOkCount:         profiles.filter((p) => p.alloyFormerOk === 1).length,
    caseThicknessMeetsTargetCount: profiles.filter((p) => p.caseThicknessMeetsTarget === 1).length,
    compoundLayerMeetsTargetCount: profiles.filter((p) => p.compoundLayerMeetsTarget === 1).length,
    compoundLayerExceedsTargetCount: profiles.filter((p) => p.compoundLayerExceedsTarget === 1).length,
    monophaseCompoundCount:     profiles.filter((p) => p.monophaseCompoundLayer === 1).length,
    preNitrideCount:            profiles.filter((p) => p.nitridingRegime === "PRE_NITRIDE").length,
    temperatureRampCount:       profiles.filter((p) => p.nitridingRegime === "TEMPERATURE_RAMP").length,
    knEstablishmentCount:       profiles.filter((p) => p.nitridingRegime === "KN_ESTABLISHMENT").length,
    diffusionZoneFormationCount: profiles.filter((p) => p.nitridingRegime === "DIFFUSION_ZONE_FORMATION").length,
    whiteLayerNucleationCount:  profiles.filter((p) => p.nitridingRegime === "WHITE_LAYER_NUCLEATION").length,
    whiteLayerGrowthCount:      profiles.filter((p) => p.nitridingRegime === "WHITE_LAYER_GROWTH").length,
    fullyNitridedCount:         profiles.filter((p) => p.nitridingRegime === "FULLY_NITRIDED").length,
    overNitridedCount:          profiles.filter((p) => p.nitridingRegime === "OVER_NITRIDED").length,
    mixedPhaseCount:            profiles.filter((p) => p.nitridingRegime === "MIXED_PHASE_WHITE_LAYER").length,
    underNitridedCount:         profiles.filter((p) => p.nitridingRegime === "UNDER_NITRIDED").length,
    unevenNitridingCount:       profiles.filter((p) => p.nitridingRegime === "UNEVEN_NITRIDING").length,
    decarburizationLikeCount:   profiles.filter((p) => p.nitridingRegime === "DECARBURIZATION_LIKE").length,
    overAlphaFieldCount2:       profiles.filter((p) => p.nitridingRegime === "OVER_ALPHA_FIELD").length,
    subAlphaFieldCount2:        profiles.filter((p) => p.nitridingRegime === "SUB_ALPHA_FIELD").length,
    noDriveCount:               profiles.filter((p) => p.nitridingRegime === "NO_NITRIDING_DRIVE").length,
    serviceReadyCount:          profiles.filter((p) => p.nitridingVerdict === "SERVICE_READY").length,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-nitriding").description("HODLMM bin nitriding / thermochemical surface N-diffusion analyzer — hold in α-field (0.20-0.50 drivingForce analog, BELOW AC1) in NH₃ atmosphere, diffuse N inward per Fick's second law producing an erfc C_N(x,t) profile + monophase Fe-N compound (γ'/ε) white layer at the surface; flags fully nitrided pools (alpha-field hold, Kn in window, monophase compound layer within target thickness, monotonic erfc diffusion zone, symmetric, alloy-former sufficient), as well as over-nitriding (thick compound / spallation), mixed γ'+ε (dual-phase defect), under-nitriding, uneven nitriding, reverse gradient, and over/sub α-field conditions");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin nitriding state")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
