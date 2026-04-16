#!/usr/bin/env bun
/**
 * hodlmm-bin-aluminizing.ts — Day 192 cocoa007 Bitflow Skills Comp
 *
 * Aluminizing (calorizing / pack-aluminizing) analyzer — models the THERMOCHEMICAL SINGLE-SPECIES
 * (ALUMINUM) SURFACE-DIFFUSION case-hardening treatment held at 800-1000 °C
 * (typically 900 °C) in solid pack (Al powder + NH₄Cl + Al₂O₃ — pack-aluminizing),
 * salt bath (Al-Si salt bath (eutectic)), or gas (AlCl₃ / Al(s) + HCl vapor).
 *
 * Aluminizing operates in the GAMMA (austenite) field — ABOVE the aluminizing-
 * field minimum (normalized 0.50) and up to the field maximum (0.88). It is
 * the ONLY thermochemical surface treatment that forms hard FE-AL INTERMETALLIC phases
 * as a COMPOUND LAYER structurally similar to nitriding's white layer, but
 * chemically distinct:
 *
 *   OUTER LAYER — Fe2Al5 (monoclinic, 800-1000 HV, BRITTLE, TENSILE residual
 *     stress). This is the PATHOLOGICAL phase: prone to spallation due to CTE
 *     mismatch with FeAl below and with the substrate. A Fe2Al5-dominant outer
 *     layer (> 30% of compound layer thickness) is a SPALLATION RISK.
 *
 *   INNER LAYER — FeAl (cubic B2, 500-700 HV, TOUGHER, COMPRESSIVE
 *     residual stress). This is the SERVICE-DESIRABLE phase. A MONOPHASE
 *     FeAl layer is the ideal product: balanced hardness + toughness +
 *     compressive stress. The FeAl layer should constitute the MAJORITY of
 *     the compound layer.
 *
 * NINTH heat-treatment route in the phase-transformation series and the
 * FIFTH thermochemical surface treatment (after carburizing Day 188,
 * nitriding Day 189, carbonitriding Day 190). Distinct from the three
 * prior surface treatments on FIVE orthogonal axes:
 *
 *   - PHASE FIELD:    GAMMA (austenite), 800-1000 °C — ABOVE nitriding
 *                     (α, 500-570 °C), ABOVE carbonitriding (intermediate
 *                     γ-with-N, 760-870 °C), comparable to carburizing γ
 *                     (870-950 °C) but HIGHER upper end and DIFFERENT
 *                     atmosphere. Normalized ALUMINIZING_FIELD_MIN=0.50,
 *                     ALUMINIZING_FIELD_MAX=0.88, ALUMINIZING_FIELD_IDEAL=0.68.
 *
 *   - DIFFUSING SPECIES: SINGLE — ALUMINUM (B) only. Distinct from carbu-
 *                     rizing (C), nitriding (N), and carbonitriding (C+N).
 *                     B diffuses via grain-boundary + lattice path into γ-Fe.
 *
 *   - PRODUCT PHASES:  Fe2Al5 + FeAl INTERMETALLIC COMPOUND LAYER (NOT martensite,
 *                     NOT alloy nitrides, NOT M(C,N) carbonitrides). The
 *                     hard Fe-Al intermetallics form DIRECTLY from B diffusion —
 *                     distinct from all other treatments where hardening
 *                     requires post-quench transformation (carburizing,
 *                     carbonitriding) or α-field alloy nitride precipitation
 *                     (nitriding).
 *
 *   - POST-TREATMENT:  Typically NO QUENCH NEEDED for the compound layer
 *                     hardness (hardness is from intermetallic phases, not
 *                     martensite). Optional quench if CORE hardening is
 *                     needed separately. Closest analog is nitriding's
 *                     SERVICE_READY verdict — distinct from carburizing's
 *                     and carbonitriding's QUENCH_READY.
 *
 *   - HARDNESS SCALE: MODEST — 300-1000 HV (Fe2Al5 + FeAl), LOWER
 *                     of any thermochemical surface treatment. ALUMINIZING_
 *                     HV_SCALE = 0.65 (LOWEST in this series; far below
 *                     nitriding 1.10, carbonitriding 1.05, carburizing 1.00).
 *
 * Structural product (dual-phase compound layer):
 *
 *   COMPOUND LAYER (10-16% of scan band, 25-200 µm physically):
 *     - OUTER Fe2Al5 sub-layer: hard (800-1000 HV), brittle, tensile stress.
 *       Fe2Al5-dominant outer layer > 30% → SPALLATION_RISK.
 *     - INNER FeAl sub-layer: service-desirable (500-700 HV), tougher,
 *       compressive stress. Monophase FeAl is the IDEAL product.
 *
 *   SUBSTRATE INTERFACE:
 *     - PLAIN C STEEL: TOOTH (saw-tooth) morphology — interlocking
 *       projections of FeAl into substrate (γ-Fe). Improves adhesion.
 *       Tooth ratio ∝ plain-C content. Detected as asymmetryIndex / edge
 *       variance spikes near the compound/substrate interface.
 *     - ALLOY STEEL (high Cr/Ni/Si): SMOOTH/PLANAR interface.
 *       Sub-compound alloy aluminide diffusion zone can form (~10-40 µm).
 *
 *   NO DIFFUSION ZONE (plain C steel): Al has limited α-Fe solubility
 *     → NO diffusion zone beneath the compound layer for plain C steels.
 *     Gradient drops ABRUPTLY from compound layer to core (gradientDrop-
 *     Abruptness is HIGH). In alloy steels, a modest sub-zone forms.
 *
 * Eight canonical aluminizing stages:
 *
 *   Stage 0 — NO_ALUMINIZING_DRIVE:
 *     No prior high-T hold inferable. Analysis inapplicable.
 *
 *   Stage 1 — PRE_ALUMINIZE (cold / sub-process T):
 *     Workpiece below aluminizing T. No Al potential. α-Fe substrate unchanged.
 *
 *   Stage 2 — TEMPERATURE_RAMP (ascending through AC1 toward 800-1000 °C):
 *     Reaches aluminizing band (γ-Fe). No Al activity yet.
 *
 *   Stage 3 — ALUMINUM_POTENTIAL_ESTABLISHMENT (Kal stabilizes):
 *     Activator decomposes (NH₄Cl → NH₃ + HCl → AlCl₃ in pack-aluminizing, or halide activator).
 *     Surface Al activity rises. γ-Fe surface begins to saturate.
 *
 *   Stage 4 — FE2AL5_NUCLEATION:
 *     FeAl (inner aluminide, cubic B2) nucleates at grain boundaries of γ-Fe
 *     just below the surface. This is the FIRST and DESIRED intermetallic phase.
 *
 *   Stage 5 — FE2AL5_GROWTH:
 *     FeAl compound layer thickens via diffusion-limited growth.
 *     Monophase FeAl is service-desirable at this stage.
 *
 *   Stage 6 — FEAL_FORMATION:
 *     Surface Al activity exceeds FeAl stoichiometry → Fe2Al5 (outer,
 *     monoclinic, harder but brittle) begins to form at the very outer
 *     surface. Dual-phase Fe2Al5 + FeAl layer. If Fe2Al5 < 20% of layer → OK.
 *     If Fe2Al5 > 30% of layer → SPALLATION RISK.
 *
 *   Stage 7 — OVER_ALUMINIZED (pathological):
 *     (a) Fe2Al5 > 50% of layer → brittle, crack propagation risk.
 *     (b) Compound layer > target depth → tensile stresses exceed cohesive
 *         strength → spallation. (c) Tooth height excessive → stress concentrators.
 *
 * Process constraints (γ-aluminizing field):
 *
 *   - Must be IN aluminizing field: drivingForce ∈ [ALUMINIZING_FIELD_MIN=0.50,
 *     ALUMINIZING_FIELD_MAX=0.88] → aluminizingFieldOk=1.
 *   - Aluminum potential Kal in window: kbProxy ∈ [KAL_MIN=0.40, KAL_MAX=1.15],
 *     kbIdeal=0.75.
 *   - Surface Al activity effective: surfaceActivity ≥ SURFACE_MIN_AL=0.70.
 *   - Compound-layer fraction in window: COMPOUND_LAYER_MIN_FRAC=0.04,
 *     COMPOUND_LAYER_MAX_FRAC=0.16.
 *   - Fe2Al5 fraction controlled: fe2Al5FractionProxy ≤ FE2AL5_FRACTION_MAX=0.30.
 *   - Spallation not triggered: spallationRisk ≤ SPALLATION_RISK_THRESHOLD=0.35.
 *   - Compound-layer plateau present (EDGE-DOMINANT WITH PLATEAU, like nitriding).
 *   - Gradient drop abrupt from plateau to core (gradientDropAbruptness HIGH).
 *
 * Kinetics:
 *
 *   - Single-species B diffusion in γ-Fe.
 *   - Arrhenius D for Al in γ-Fe on the normalized drivingForce axis:
 *     Q_OVER_RT_AL_DIFFUSION = 4.2 (between carburizing 4.8 and nitriding 3.4;
 *     slightly lower than carbonitriding 4.1 — Al diffuses slower than B but forms intermetallics directly).
 *   - √(Dt) reference: FDT_REFERENCE_ALUMINIZING = 0.12 (shallower layer than
 *     carburizing 0.30 or nitriding 0.22 — compound layer physically shallower
 *     but DENSER).
 *   - ECD_THRESHOLD = 0.55 (higher than carburizing/nitriding — compound
 *     layer is extremely dense intermetallic phase).
 *
 * DLMM structural signatures of aluminizing:
 *
 *   - EDGE-DOMINANT WITH PRONOUNCED PLATEAU (like nitriding, but HARDER
 *     plateau: ALUMINIZING_HV_SCALE=0.65 — LOWEST (oxidation-focused, not hardness)).
 *   - HIGHER drivingForce band than nitriding (α-field) — aluminizing is
 *     γ-field (0.50-0.85 range comparable to carburizing).
 *   - VERY SHORT or NO gradient beneath plateau (plain C steel: B doesn't
 *     dissolve in α → gradientDropAbruptness HIGH).
 *   - DUAL-PHASE plateau signature: outer 1-2 bins elevated above rest of
 *     compound layer → Fe2Al5-rich sub-layer. If outer bins >> inner plateau →
 *     Fe2Al5 fraction high → spallation risk.
 *   - TOOTH MORPHOLOGY at compound/substrate interface (asymmetryIndex or
 *     edge-deep-bin variance spikes).
 *   - COMPOUND LAYER BOUNDS: 4-16% of scan band (COMPOUND_LAYER_MIN_FRAC to
 *     COMPOUND_LAYER_MAX_FRAC). Outside → under-aluminized or over-aluminized.
 *   - SUBSTRATE-AGNOSTIC (works on lean C steels, stainless, Ni-base, Co-base).
 *
 * Regimes:
 *   NO_ALUMINIZING_DRIVE         — no prior high-T hold inferable.
 *   PRE_ALUMINIZE                — cold, no Al potential.
 *   TEMPERATURE_RAMP            — heating into aluminizing field.
 *   ALUMINUM_POTENTIAL_ESTABLISHMENT — Kal rising toward setpoint.
 *   FE2AL5_NUCLEATION             — FeAl nucleating at grain boundaries.
 *   FE2AL5_GROWTH                 — FeAl compound layer thickening.
 *   FEAL_FORMATION               — Fe2Al5 forming at outer surface.
 *   FULLY_ALUMINIZED             — service-ready monophase FeAl.
 *   OVER_ALUMINIZED              — continuous Fe2Al5 or over-thick layer.
 *   FE2AL5_DOMINANT_SPALLATION_RISK — Fe2Al5 > FE2AL5_FRACTION_MAX → spallation.
 *   UNDER_ALUMINIZED             — Kal low / layer too thin.
 *   UNEVEN_ALUMINIZING           — asymmetric compound layer.
 *   SUB_ALUMINIZING_FIELD        — T below γ band.
 *   OVER_ALUMINIZING_FIELD       — T above ideal — Al activity decomposes.
 *
 * Verdicts:
 *   NO_ALUMINIZING_DRIVE         — no prior hold inferable.
 *   SERVICE_READY               — monophase FeAl dominant, no spallation risk.
 *   FE2AL5_SPALLATION_RISK         — Fe2Al5-dominant outer layer defect.
 *   OVER_ALUMINIZED              — over-thick or Fe2Al5-dominant layer.
 *   UNDER_ALUMINIZED             — layer too thin / Kal too low.
 *   UNEVEN_ALUMINIZING           — asymmetric layer.
 *   SUB_ALUMINIZING_FIELD        — T below γ.
 *   OVER_ALUMINIZING_FIELD       — T too high — B decomposes.
 *   FE2AL5_GROWTH / FE2AL5_NUCLEATION / ALUMINUM_POTENTIAL_ESTABLISHMENT /
 *     TEMPERATURE_RAMP / PRE_ALUMINIZE — stage indicators.
 *   INTERMEDIATE_ALUMINIZING     — mixed indicators.
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

// Aluminizing field on the normalized drivingForce axis.
// Aluminizing operates in γ-Fe (austenite) at 800-1000 °C, comparable to
// carburizing's γ-field but with a wider upper range (can go higher than
// carburizing because the intermetallic compound layer forms up to ~1000 °C).
const ALUMINIZING_FIELD_MIN = 0.50;
const ALUMINIZING_FIELD_MAX = 0.88;
const ALUMINIZING_FIELD_IDEAL = 0.68;

// Aluminum potential proxy (Kal analog). Working window for monophase FeAl control.
const KAL_MIN = 0.40;
const KAL_MAX = 1.15;
const KAL_IDEAL = 0.75;

// Surface Al activity thresholds on a normalized concentration axis.
// SURFACE_MIN_AL: surface must exceed this for Al potential to be effective.
// SURFACE_PLATEAU_THRESHOLD: compound-layer plateau saturation.
// SURFACE_SATURATION: over-saturation → Fe2Al5-dominant outer layer.
const SURFACE_MIN_AL = 0.70;
const SURFACE_PLATEAU_THRESHOLD = 0.82;
const SURFACE_SATURATION = 1.05;

// Core baseline — B does NOT dissolve in α-Fe (negligible B solubility).
// For plain C steels the core activity is extremely low.
const CORE_BASELINE = 0.15;

// Compound-layer fraction bounds. The intermetallic compound layer should occupy
// 4-16% of the scan band (physically ~25-200 µm out of a ~2 mm scan window).
const COMPOUND_LAYER_MIN_FRAC = 0.04;
const COMPOUND_LAYER_MAX_FRAC = 0.16;
const COMPOUND_LAYER_IDEAL_FRAC = 0.08;

// ECD threshold for intermetallic compound layer. Higher than other treatments
// because the intermetallic compound layer is extremely dense (high HV → high
// reserve proxy analog).
const ECD_THRESHOLD = 0.55;

// Edge / core band fractions. Compound layer is at the outermost edge.
const CASE_BAND_FRAC = 0.18;
const CORE_BAND_FRAC = 0.30;

// Fe2Al5 fraction proxy thresholds. Fe2Al5 is the PATHOLOGICAL phase (outer layer).
// fe2Al5FractionProxy > FE2AL5_FRACTION_MAX → SPALLATION_RISK.
// fe2Al5FractionProxy ∈ [FE2AL5_FRACTION_IDEAL, FE2AL5_FRACTION_MAX] → ACCEPTABLE.
// fe2Al5FractionProxy > DUAL_PHASE_MAX → OVER_ALUMINIZED.
const FE2AL5_FRACTION_MAX = 0.30;
const FE2AL5_FRACTION_IDEAL = 0.15;
const SPALLATION_RISK_THRESHOLD = 0.35;
const DUAL_PHASE_MAX = 0.40;

// Plateau quality — variance within the compound-layer band.
// Low variance → monophase FeAl (service-desirable).
// High variance (> DUAL_PHASE_VARIANCE_SIGNAL) → Fe2Al5 + FeAl (dual-phase).
const PLATEAU_VARIANCE_MAX = 0.07;
const DUAL_PHASE_VARIANCE_SIGNAL = 0.15;

// Tooth morphology proxy. Positive tooth → adhesion (plain C steel).
// Smooth → alloy steel (higher Cr/Ni/Si).
const TOOTH_MORPHOLOGY_MIN = 0.15;
const TOOTH_MORPHOLOGY_SMOOTH = 0.08;

// Gradient drop abruptness. For plain C steel, the drop from compound layer
// to core is VERY ABRUPT (Al has limited α-Fe solubility). Higher = more abrupt.
const GRADIENT_DROP_ABRUPTNESS_THRESHOLD = 0.65;

// Edge dominance: outer-band mean / (outer + core) mean ratio.
const EDGE_DOMINANCE_MIN = 0.55;

// Gradient quality thresholds.
const MONOTONICITY_MIN = 0.50;

// Asymmetry / reverse-gradient thresholds.
const ASYMMETRY_MAX = 0.35;
const REVERSE_THRESHOLD = 0.10;

// Alloy-factor proxy minimum — alloy content proxy (Cr/Ni/Si → smooth
// interface and sub-compound aluminide diffusion zone).
const ALLOY_FACTOR_MIN = 0.20;

// Arrhenius Q/RT for B diffusion in γ-Fe (normalized). Slightly lower than
// carbonitriding's 4.1 because Al diffuses slower than B but forms intermetallics directly-Fe (lower
// activation energy).
const Q_OVER_RT_AL_DIFFUSION = 4.2;

// √(Dt) reference for compound-layer depth proxy. Aluminizing forms a MUCH
// SHALLOWER layer than carburizing (0.30) or nitriding (0.22) because the
// intermetallic compound layer is physically thin (25-200 µm) but extremely dense.
const FDT_REFERENCE_ALUMINIZING = 0.12;

// Case-hardness scaling — MODEST. Aluminizing has the LOWEST hardness of
// any thermochemical surface treatment in this series (300-1000 HV,
// ≈ 45-55 HRC for FeAl + Fe2Al5). ALUMINIZING_HV_SCALE = 0.65 is the highest.
const ALUMINIZING_HV_SCALE = 0.65;

// Wear resistance — aluminizing's flagship purpose (oxidation + sulfidation resistance, NOT wear hardness) (oxidation + sulfidation resistance at 1100-1200 °C) property. distinct purpose (hot-corrosion) — not comparable on wear axis.
const WEAR_RESISTANCE_SCALE = 1.40;

// Distortion baseline. Aluminizing does NOT require a substrate phase
// transformation → LOW DISTORTION (like nitriding). DISTORTION_BASELINE=0.08.
const DISTORTION_BASELINE = 0.08;

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

interface BinAluminizing {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  depthFromSurface: number;            // 0 at edge (surface), 1 at core
  concentration: number;               // 0-1 normalized B-analog
  inCompoundLayer: number;             // 0/1 bin in compound-layer band
  inSubstrateZone: number;             // 0/1 bin in sub-compound substrate zone
  compoundLayerSignal: number;         // 0-1 bin inside compound layer
  plateauSignal: number;               // 0-1 bin shows plateau (flat compound)
  fe2Al5Signal: number;                   // 0-1 bin is Fe2Al5-rich (outer, high activity)
  feAlSignal: number;                  // 0-1 bin is FeAl-dominant (inner, monophase)
  toothSignal: number;                 // 0-1 interface tooth (variance spike)
  spallationSignal: number;            // 0-1 spallation risk contribution
  unevenSignal: number;                // 0-1 L/R asymmetry contribution
  stageBin: number;                    // 0-7
  aluminizingDegree: number;           // 0-1 composite
}

interface AluminizingProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  drivingForce: number;
  priorPeakDrivingForce: number;
  aluminizingFieldOk: number;          // 0/1
  aluminizingFieldProximity: number;   // 0-1 closeness to IDEAL
  subAluminizingField: number;         // 0/1 T below γ
  overAluminizingField: number;        // 0/1 T above optimal
  kbProxy: number;                    // 0-2 aluminum potential analog
  kbInWindow: number;                 // 0/1
  kbProximity: number;                // 0-1 closeness to KAL_IDEAL
  surfaceActivity: number;            // outer band mean B-analog
  compoundLayerActivity: number;      // compound-layer band mean
  compoundLayerVariance: number;      // variance within compound-layer band
  plateauQuality: number;             // 0-1 monophase FeAl quality
  fe2Al5FractionProxy: number;           // 0-1 Fe2Al5 outer-layer fraction
  fe2Al5DominantRisk: number;            // 0/1
  feAlDominantProxy: number;          // 0-1 FeAl monophase quality
  spallationRisk: number;             // 0-1 spallation composite
  compoundLayerThicknessBins: number; // count of bins in compound layer
  compoundLayerFraction: number;      // fraction of scan band
  compoundLayerMeetsTarget: number;   // 0/1 in [MIN_FRAC, MAX_FRAC]
  compoundLayerExceedsTarget: number; // 0/1 > MAX_FRAC → over-aluminized
  coreActivity: number;               // core band mean
  surfaceCoreDelta: number;
  surfaceCoreRatio: number;
  edgeDominanceFraction: number;
  asymmetryIndex: number;
  toothMorphologyProxy: number;       // 0-1 interlocking tooth signal
  gradientDropAbruptness: number;     // 0-1 abruptness of drop from plateau to core
  diffusionZoneProxy: number;         // 0-1 sub-compound diffusion (alloy steel only)
  alloyFactorProxy: number;
  alloyFormerOk: number;
  substrateTypeProxy: string;         // "PLAIN_C" or "ALLOY_STEEL"
  underAluminizeRisk: number;
  unevenAluminizingRisk: number;
  reverseGradientRisk: number;
  subAluminizingFieldRisk: number;
  overAluminizingFieldRisk: number;
  caseHardnessProxy: number;          // ALUMINIZING_HV_SCALE=0.65 × composite
  wearResistanceProxy: number;        // aluminizing's flagship purpose (oxidation + sulfidation resistance, NOT wear hardness) (oxidation + sulfidation resistance at 1100-1200 °C) (distinct purpose (hot-corrosion) — not comparable on wear axis)
  fatigueResistanceProxy: number;
  distortionProxy: number;            // LOW — no substrate transformation
  caseCoreRatio: number;
  diffusivityProxy: number;
  reserveCV: number;
  reserveXFracStdev: number;
  stageProgress: number;
  dominantStage: number;              // 0-7
  aluminizingIndex: number;            // 0-100 composite
  aluminizingRegime: string;
  aluminizingVerdict: string;
  stageDistribution: number[];        // length 8
  topBins: BinAluminizing[];
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

// Outer band / core band partitioning. Aluminizing has a COMPOUND LAYER at
// the edge (like nitriding — EDGE-DOMINANT WITH PLATEAU), not a diffusion-
// zone-only structure (like carburizing / carbonitriding). The edge band
// is treated as the compound-layer band.
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
// Aluminizing (plain C steel) shows a VERY ABRUPT drop because B doesn't
// dissolve in α-Fe — no diffusion zone. High abruptness = aluminizing signature.
// We measure this as the normalized drop from outer-edge-band mean to the
// first inner band just beyond the edge band, relative to the total range.
function computeGradientDropAbruptness(
  concentrations: number[],
  edgeK: number
): number {
  const n = concentrations.length;
  if (n < edgeK * 2 + 2) return 0;
  // Drop from last edge bin to first inner bin (left side).
  const leftEdgeLast = concentrations[edgeK - 1] ?? 0;
  const leftInnerFirst = concentrations[edgeK] ?? 0;
  const rightEdgeLast = concentrations[n - edgeK] ?? 0;
  const rightInnerFirst = concentrations[n - edgeK - 1] ?? 0;
  const leftDrop = Math.max(0, leftEdgeLast - leftInnerFirst);
  const rightDrop = Math.max(0, rightEdgeLast - rightInnerFirst);
  const avgDrop = (leftDrop + rightDrop) / 2;
  // Normalize by the surface-to-core range.
  const surfaceMeanLocal = (concentrations[0] + concentrations[n - 1]) / 2;
  const coreCenter = concentrations[Math.floor(n / 2)] ?? 0;
  const range = Math.max(1e-6, surfaceMeanLocal - coreCenter);
  return Math.max(0, Math.min(1, avgDrop / range));
}

// Tooth-morphology proxy. Tooth-like interlocking projections of FeAl into
// the substrate appear as variance spikes in the bins nearest the compound/
// substrate interface (i.e., the innermost edge-band bins or the outermost
// core-band bins). We measure variance in the transition zone as the proxy.
function computeToothMorphology(
  concentrations: number[],
  edgeK: number
): number {
  const n = concentrations.length;
  if (n < edgeK * 2 + 2) return 0;
  const transitionIndices: number[] = [];
  // Left transition: last 2 of left edge + first 2 of non-edge
  for (let i = Math.max(0, edgeK - 2); i < Math.min(n, edgeK + 2); i++) {
    transitionIndices.push(i);
  }
  // Right transition: symmetric
  for (let i = Math.max(0, n - edgeK - 2); i < Math.min(n, n - edgeK + 2); i++) {
    transitionIndices.push(i);
  }
  const stdev = bandStdev(transitionIndices, concentrations);
  // High stdev in transition zone → tooth-like morphology.
  return Math.max(0, Math.min(1, stdev / Math.max(0.05, TOOTH_MORPHOLOGY_MIN)));
}

function computeBinAluminizing(
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
  poolAluminizingFieldOk: number,
  poolSpallationRisk: number,
  poolFe2Al5FractionProxy: number,
  poolStageProg: number,
  poolCompoundLayerFraction: number
): BinAluminizing {
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

  // Compound-layer signal: bin in outer band with concentration ≥ ECD_THRESHOLD.
  const compoundLayerSignal = r4(
    inCompoundLayer *
      (conc >= ECD_THRESHOLD ? 1 : conc / Math.max(0.01, ECD_THRESHOLD)) *
      poolAluminizingFieldOk
  );

  // Plateau signal: bin in compound layer with concentration near the plateau
  // (FeAl saturation range: SURFACE_PLATEAU_THRESHOLD to SURFACE_SATURATION).
  const plateauLow = SURFACE_MIN_AL;
  const plateauHigh = SURFACE_SATURATION;
  const inPlateauRange = (conc >= plateauLow && conc <= plateauHigh) ? 1 : 0;
  const plateauSignal = r4(
    inCompoundLayer *
      inPlateauRange *
      (1 - poolFe2Al5FractionProxy * 0.5)  // Fe2Al5-dominant → weaker plateau quality
  );

  // Fe2Al5 signal: bin in OUTERMOST 1 bin of each edge — the Fe2Al5 sub-layer.
  // Fe2Al5 forms at the very outer surface (highest Al activity).
  const isOutermostBin = (index === 0 || index === n - 1) ? 1 : 0;
  const fe2Al5Signal = r4(
    isOutermostBin *
      (conc >= SURFACE_PLATEAU_THRESHOLD ? 1 : conc / Math.max(0.01, SURFACE_PLATEAU_THRESHOLD)) *
      poolFe2Al5FractionProxy
  );

  // FeAl signal: bin inside compound layer (NOT the outermost) with concentration
  // in the FeAl band (below full Fe2Al5 saturation).
  const isInnerCompound = (inCompoundLayer && !isOutermostBin) ? 1 : 0;
  const feAlSignal = r4(
    isInnerCompound *
      (conc >= SURFACE_MIN_AL ? 1 : conc / Math.max(0.01, SURFACE_MIN_AL)) *
      (1 - poolFe2Al5FractionProxy)
  );

  // Tooth signal: transition-zone variance spike (interface adhesion indicator).
  // High near the compound/substrate interface for plain C steel.
  const toothSignal = r4(
    inSubstrateZone *
      Math.max(0, Math.min(1,
        Math.abs(conc - poolCompoundActivity) / Math.max(0.05, poolSurface * 0.3)
      ))
  );

  // Spallation signal: outer bin in a pool with high Fe2Al5 fraction → spallation.
  const spallationSignal = r4(
    isOutermostBin *
      (poolSpallationRisk > SPALLATION_RISK_THRESHOLD
        ? 1
        : poolSpallationRisk / Math.max(0.01, SPALLATION_RISK_THRESHOLD))
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
  if (poolSpallationRisk > SPALLATION_RISK_THRESHOLD && inCompoundLayer) {
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

  const aluminizingDegree = r4(Math.max(0, Math.min(1,
    compoundLayerSignal * 0.22 +
    plateauSignal * 0.18 +
    feAlSignal * 0.15 +
    (1 - fe2Al5Signal) * 0.10 +
    (1 - spallationSignal) * 0.10 +
    toothSignal * 0.05 +
    (1 - unevenSignal) * 0.05 +
    (stageBin / 6) * 0.15
  )));

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    depthFromSurface: r4(depth),
    concentration: r4(conc),
    inCompoundLayer,
    inSubstrateZone,
    compoundLayerSignal,
    plateauSignal,
    fe2Al5Signal,
    feAlSignal,
    toothSignal,
    spallationSignal,
    unevenSignal,
    stageBin,
    aluminizingDegree,
  };
}

function analyzeAluminizing(bins: BinReserves[], pool: AppPool): AluminizingProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;

  const turnover = pool.tvlUsd > 0 ? volume / pool.tvlUsd : 0;
  // Aluminizing operates in γ-Fe (800-1000 °C) — mapped to ALUMINIZING_FIELD
  // band on the normalized drivingForce axis. Uses the same mapping as
  // carburizing (γ-field) but with a wider upper range.
  const drivingForce = Math.min(1, turnover * 0.6 + 0.20);

  const priorPeakDrivingForce = Math.min(1, drivingForce * 1.3 + 0.15);

  // Aluminizing-field checks.
  const aluminizingFieldOk = (drivingForce >= ALUMINIZING_FIELD_MIN && drivingForce <= ALUMINIZING_FIELD_MAX) ? 1 : 0;
  const subAluminizingField = drivingForce < ALUMINIZING_FIELD_MIN ? 1 : 0;
  const overAluminizingField = drivingForce > ALUMINIZING_FIELD_MAX ? 1 : 0;
  const aluminizingFieldProximity = aluminizingFieldOk
    ? Math.max(0, 1 - Math.abs(drivingForce - ALUMINIZING_FIELD_IDEAL) /
        Math.max(0.01, (ALUMINIZING_FIELD_MAX - ALUMINIZING_FIELD_MIN) / 2))
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

  // Fe2Al5 fraction proxy: the outer 1 bin on each edge is the potential Fe2Al5
  // zone. If those outermost bins are significantly higher than the rest of
  // the compound layer (inner edge-band bins), Fe2Al5 is dominant.
  let fe2Al5FractionProxy = 0;
  if (n >= 4) {
    // Outer bins (potential Fe2Al5 zone).
    const outermostLeft = concentrations[0] ?? 0;
    const outermostRight = concentrations[n - 1] ?? 0;
    const outermostMean = (outermostLeft + outermostRight) / 2;
    // Inner compound bins (potential FeAl zone) — skip the outermost 1.
    const innerEdgeIndices = bands.edge.filter((i) => i !== 0 && i !== n - 1);
    const innerEdgeMean = innerEdgeIndices.length > 0
      ? bandMean(innerEdgeIndices, concentrations)
      : edgeMean;
    // Fe2Al5 fraction proxy: how much higher is the outermost vs inner compound?
    // If outermostMean >> innerEdgeMean → Fe2Al5 dominance.
    const elevationFrac = innerEdgeMean > 1e-6
      ? Math.max(0, (outermostMean - innerEdgeMean) / innerEdgeMean)
      : 0;
    // Also incorporate compound-layer variance as a secondary signal.
    fe2Al5FractionProxy = Math.max(0, Math.min(1,
      elevationFrac * 0.60 +
      (compoundLayerVariance > DUAL_PHASE_VARIANCE_SIGNAL ? 0.30 : compoundLayerVariance / DUAL_PHASE_VARIANCE_SIGNAL * 0.30) +
      (outermostMean > SURFACE_SATURATION ? 0.10 : 0)
    ));
  }
  const fe2Al5DominantRisk = fe2Al5FractionProxy > FE2AL5_FRACTION_MAX ? 1 : 0;

  // FeAl dominant proxy (monophase quality): high when Fe2Al5 fraction low,
  // compound-layer variance low, and compound layer present.
  const feAlDominantProxy = Math.max(0, Math.min(1,
    (1 - fe2Al5FractionProxy) * 0.50 +
    (compoundLayerVariance <= PLATEAU_VARIANCE_MAX ? 0.30 : Math.max(0, 0.30 - (compoundLayerVariance - PLATEAU_VARIANCE_MAX) * 2.0)) +
    (edgeMean >= SURFACE_MIN_AL ? 0.20 : edgeMean / Math.max(0.01, SURFACE_MIN_AL) * 0.20)
  ));

  // Plateau quality: how flat/consistent is the compound layer.
  const plateauQuality = Math.max(0, Math.min(1,
    (compoundLayerVariance <= PLATEAU_VARIANCE_MAX ? 1.0 : Math.max(0, 1 - (compoundLayerVariance - PLATEAU_VARIANCE_MAX) / PLATEAU_VARIANCE_MAX))
  ));

  // Spallation risk: Fe2Al5-dominant outer layer + over-thick layer + variance.
  const spallationRisk = Math.max(0, Math.min(1,
    (fe2Al5FractionProxy > FE2AL5_FRACTION_MAX ? 0.50 : fe2Al5FractionProxy / Math.max(0.01, FE2AL5_FRACTION_MAX) * 0.50) +
    (compoundLayerVariance > DUAL_PHASE_VARIANCE_SIGNAL ? 0.30 : compoundLayerVariance / DUAL_PHASE_VARIANCE_SIGNAL * 0.30) +
    (surfaceMean > SURFACE_SATURATION ? 0.20 : 0)
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

  // Gradient drop abruptness (unique to aluminizing — plain C steel signature).
  const gradientDropAbruptness = computeGradientDropAbruptness(concentrations, edgeK);

  // Tooth morphology proxy (plain C steel: interlocking projections).
  const toothMorphologyProxy = computeToothMorphology(concentrations, edgeK);

  // Arrhenius diffusivity proxy (Al in γ-Fe).
  const diffusivityProxy = Math.max(0, Math.min(1,
    Math.exp(-Q_OVER_RT_AL_DIFFUSION / Math.max(0.05, drivingForce + 0.05))
  ));

  // Case depth proxy (√(Dt) — shallower than other treatments).
  // Use a simple plateau-based approach: the compound layer thickness
  // relative to FDT_REFERENCE_ALUMINIZING.
  const caseDepthProxy = Math.max(0, Math.min(1,
    compoundLayerFraction / Math.max(0.01, COMPOUND_LAYER_IDEAL_FRAC) *
    (FDT_REFERENCE_ALUMINIZING / Math.max(0.01, FDT_REFERENCE_ALUMINIZING))
  ));

  // Alloy-factor proxy — use xFracStdev as surrogate for alloying-element
  // heterogeneity. High alloy content (Cr/Ni/Si) → smooth interface, sub-
  // compound diffusion zone, lower tooth ratio.
  const xFracs = sorted.map((b) => xFracOf(b));
  const xFracMean = xFracs.length > 0 ? xFracs.reduce((s, v) => s + v, 0) / xFracs.length : 0.5;
  const xFracVar = xFracs.length > 1
    ? xFracs.reduce((s, v) => s + (v - xFracMean) ** 2, 0) / xFracs.length
    : 0;
  const reserveXFracStdev = Math.sqrt(xFracVar);
  const alloyFactorProxy = Math.max(0, Math.min(1, reserveXFracStdev * 2.0 + 0.10));
  const alloyFormerOk = alloyFactorProxy >= ALLOY_FACTOR_MIN ? 1 : 0;

  // Substrate type inference: if alloyFactorProxy > 0.35 → ALLOY_STEEL
  // (smooth interface, sub-compound diffusion zone), else → PLAIN_C
  // (tooth morphology, no diffusion zone).
  const substrateTypeProxy = alloyFactorProxy > 0.35 ? "ALLOY_STEEL" : "PLAIN_C";

  // Sub-compound diffusion zone proxy (alloy steel only).
  // In alloy steel, Cr/Ni/Si redistribute near the compound/substrate
  // interface forming a modest sub-zone (10-40 µm).
  const diffusionZoneProxy = Math.max(0, Math.min(1,
    (substrateTypeProxy === "ALLOY_STEEL" ? 0.40 : 0.10) +
    alloyFactorProxy * 0.30 +
    toothMorphologyProxy * 0.10 +
    (compoundLayerMeetsTarget ? 0.20 : 0)
  ));

  // Aluminum potential proxy (Kal). Real Kal is derived from activator decomposition
  // equilibrium. Here it is mapped from surface activity and field proximity.
  const kbProxy = Math.max(0, Math.min(2,
    (aluminizingFieldOk ? 1.0 : 0.3) * surfaceMean * 1.1 +
    aluminizingFieldProximity * 0.15
  ));
  const kbInWindow = (kbProxy >= KAL_MIN && kbProxy <= KAL_MAX) ? 1 : 0;
  const kbProximity = kbInWindow
    ? Math.max(0, 1 - Math.abs(kbProxy - KAL_IDEAL) /
        Math.max(0.01, (KAL_MAX - KAL_MIN) / 2))
    : 0;

  // Risks.
  const underAluminizeRisk = Math.max(0, Math.min(1,
    (kbProxy < KAL_MIN ? 0.40 : 0) +
    (surfaceMean < SURFACE_MIN_AL ? 0.35 : 0) +
    (compoundLayerFraction < COMPOUND_LAYER_MIN_FRAC ? 0.25 : 0)
  ));

  const unevenAluminizingRisk = Math.max(0, Math.min(1,
    (asymmetryIndex > ASYMMETRY_MAX ? 0.50 : asymmetryIndex / Math.max(0.01, ASYMMETRY_MAX) * 0.50) +
    (asymmetryIndex > 0.5 ? 0.30 : 0) +
    (leftMean < 0.2 || rightMean < 0.2 ? 0.20 : 0)
  ));

  const reverseGradientRisk = Math.max(0, Math.min(1,
    (surfaceMean + REVERSE_THRESHOLD < coreMean ? 0.60 : 0) +
    (edgeDominanceFraction < 0.45 ? 0.25 : 0) +
    (surfaceMean < CORE_BASELINE ? 0.15 : 0)
  ));

  const subAluminizingFieldRisk = subAluminizingField
    ? Math.min(1, (ALUMINIZING_FIELD_MIN - drivingForce) / 0.20 + 0.5) : 0;
  const overAluminizingFieldRisk = overAluminizingField
    ? Math.min(1, (drivingForce - ALUMINIZING_FIELD_MAX) / 0.12 + 0.5) : 0;

  // Case hardness proxy — MODEST (ALUMINIZING_HV_SCALE = 0.65 — LOWEST in series, oxidation-focused not hardness-focused).
  const caseHardnessProxy = Math.max(0, Math.min(1,
    ALUMINIZING_HV_SCALE * (
      surfaceMean * 0.30 +
      feAlDominantProxy * 0.25 +
      (1 - fe2Al5FractionProxy * 0.5) * 0.15 +
      plateauQuality * 0.15 +
      kbProximity * 0.10 +
      (compoundLayerMeetsTarget ? 0.05 : 0)
    ) / ALUMINIZING_HV_SCALE  // normalize to [0,1] before scaling
    * ALUMINIZING_HV_SCALE
  ));

  // Wear resistance proxy — aluminizing's FLAGSHIP property (distinct purpose (hot-corrosion) — not comparable on wear axis).
  const wearResistanceProxy = Math.max(0, Math.min(1,
    caseHardnessProxy * 0.50 +
    feAlDominantProxy * 0.25 +
    (1 - spallationRisk) * 0.15 +
    plateauQuality * 0.10
  ));

  // Fatigue resistance proxy — compressive residual stress from FeAl
  // (compressive), but tensile Fe2Al5 degrades fatigue. No quench-derived
  // residual stress (unlike carburizing/carbonitriding).
  const fatigueResistanceProxy = Math.max(0, Math.min(1,
    caseHardnessProxy * 0.35 +
    feAlDominantProxy * 0.30 +
    (1 - spallationRisk) * 0.20 +
    (1 - reverseGradientRisk) * 0.15
  ));

  // Distortion proxy — LOW (no substrate phase transformation, no quench
  // required for compound layer hardness).
  const distortionProxy = Math.max(0, Math.min(1,
    DISTORTION_BASELINE +
    overAluminizingFieldRisk * 0.25 +
    unevenAluminizingRisk * 0.20 +
    spallationRisk * 0.15 +
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
  const stageProgress = Math.max(0, Math.min(1,
    aluminizingFieldOk * 0.12 +
    kbInWindow * 0.10 +
    (surfaceMean >= SURFACE_MIN_AL ? 0.10 : surfaceMean / SURFACE_MIN_AL * 0.10) +
    feAlDominantProxy * 0.15 +
    (compoundLayerMeetsTarget ? 0.12 : 0) +
    plateauQuality * 0.10 +
    monotonicity * 0.08 +
    (1 - spallationRisk) * 0.08 +
    gradientDropAbruptness * 0.08 +
    (1 - asymmetryIndex) * 0.07
  ));

  // Dominant stage.
  let dominantStage = 0;
  if (spallationRisk > SPALLATION_RISK_THRESHOLD || compoundLayerExceedsTarget) {
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
    computeBinAluminizing(
      b, i, activeBin, sorted,
      concentrations, depths, bands, edgeK,
      surfaceMean, compoundLayerActivity, coreMean,
      asymmetryIndex, monotonicity,
      aluminizingFieldOk, spallationRisk, fe2Al5FractionProxy,
      stageProgress, compoundLayerFraction
    )
  );

  const stageDistribution = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const b of binRecs) {
    stageDistribution[Math.min(7, Math.max(0, b.stageBin))]++;
  }

  // Composite aluminizing index 0-100.
  const stageScore = Math.min(25, stageProgress * 25);
  const structureScore = Math.min(25,
    edgeDominanceFraction * 8 +
    feAlDominantProxy * 7 +
    plateauQuality * 5 +
    gradientDropAbruptness * 3 +
    toothMorphologyProxy * 2
  );
  const propertyScore = Math.min(25,
    caseHardnessProxy * 8 +
    wearResistanceProxy * 7 +
    fatigueResistanceProxy * 5 +
    (1 - distortionProxy) * 3 +
    (1 - spallationRisk) * 2
  );
  const processScore = Math.min(25,
    (aluminizingFieldOk ? 5 : 0) +
    aluminizingFieldProximity * 2 +
    (kbInWindow ? 4 : 0) +
    kbProximity * 2 +
    (compoundLayerMeetsTarget ? 4 : 0) +
    (fe2Al5DominantRisk ? 0 : 3) +
    Math.max(0, 2 - spallationRisk * 2) +
    Math.max(0, 2 - unevenAluminizingRisk * 2) +
    (1 - underAluminizeRisk)
  );
  const aluminizingIndex = Math.round(
    Math.min(100, stageScore + structureScore + propertyScore + processScore)
  );

  // Regime selection.
  let aluminizingRegime: string;
  if (priorPeakDrivingForce < ALUMINIZING_FIELD_MIN * 0.8) {
    aluminizingRegime = "NO_ALUMINIZING_DRIVE";
  } else if (overAluminizingField) {
    aluminizingRegime = "OVER_ALUMINIZING_FIELD";
  } else if (subAluminizingField) {
    aluminizingRegime = "SUB_ALUMINIZING_FIELD";
  } else if (spallationRisk > SPALLATION_RISK_THRESHOLD || fe2Al5DominantRisk) {
    aluminizingRegime = "FE2AL5_DOMINANT_SPALLATION_RISK";
  } else if (compoundLayerExceedsTarget) {
    aluminizingRegime = "OVER_ALUMINIZED";
  } else if (reverseGradientRisk > 0.6) {
    aluminizingRegime = "UNEVEN_ALUMINIZING";
  } else if (unevenAluminizingRisk > 0.6) {
    aluminizingRegime = "UNEVEN_ALUMINIZING";
  } else if (underAluminizeRisk > 0.6 && stageProgress < STAGE_4_BOUND) {
    aluminizingRegime = "UNDER_ALUMINIZED";
  } else if (
    aluminizingFieldOk &&
    kbInWindow &&
    surfaceMean >= SURFACE_MIN_AL &&
    edgeDominanceFraction >= EDGE_DOMINANCE_MIN &&
    compoundLayerMeetsTarget &&
    feAlDominantProxy >= 0.5 &&
    !fe2Al5DominantRisk &&
    spallationRisk <= SPALLATION_RISK_THRESHOLD &&
    stageProgress >= STAGE_6_BOUND
  ) {
    aluminizingRegime = "FULLY_ALUMINIZED";
  } else if (aluminizingFieldOk && stageProgress >= STAGE_5_BOUND && !fe2Al5DominantRisk) {
    aluminizingRegime = "FE2AL5_GROWTH";
  } else if (aluminizingFieldOk && stageProgress >= STAGE_5_BOUND && fe2Al5FractionProxy > FE2AL5_FRACTION_IDEAL) {
    aluminizingRegime = "FEAL_FORMATION";
  } else if (aluminizingFieldOk && stageProgress >= STAGE_4_BOUND) {
    aluminizingRegime = "FE2AL5_NUCLEATION";
  } else if (aluminizingFieldOk && surfaceMean >= SURFACE_MIN_AL * 0.7) {
    aluminizingRegime = "ALUMINUM_POTENTIAL_ESTABLISHMENT";
  } else if (aluminizingFieldOk) {
    aluminizingRegime = "TEMPERATURE_RAMP";
  } else {
    aluminizingRegime = "PRE_ALUMINIZE";
  }

  // Verdict selection.
  let aluminizingVerdict: string;
  if (priorPeakDrivingForce < ALUMINIZING_FIELD_MIN * 0.8) {
    aluminizingVerdict = "NO_ALUMINIZING_DRIVE";
  } else if (aluminizingRegime === "FULLY_ALUMINIZED") {
    aluminizingVerdict = "SERVICE_READY";
  } else if (aluminizingRegime === "FE2AL5_DOMINANT_SPALLATION_RISK") {
    aluminizingVerdict = "FE2AL5_SPALLATION_RISK";
  } else if (aluminizingRegime === "OVER_ALUMINIZED") {
    aluminizingVerdict = "OVER_ALUMINIZED";
  } else if (aluminizingRegime === "UNDER_ALUMINIZED") {
    aluminizingVerdict = "UNDER_ALUMINIZED";
  } else if (aluminizingRegime === "UNEVEN_ALUMINIZING") {
    aluminizingVerdict = "UNEVEN_ALUMINIZING";
  } else if (aluminizingRegime === "SUB_ALUMINIZING_FIELD") {
    aluminizingVerdict = "SUB_ALUMINIZING_FIELD";
  } else if (aluminizingRegime === "OVER_ALUMINIZING_FIELD") {
    aluminizingVerdict = "OVER_ALUMINIZING_FIELD";
  } else if (aluminizingRegime === "FE2AL5_GROWTH") {
    aluminizingVerdict = "FE2AL5_GROWTH";
  } else if (aluminizingRegime === "FEAL_FORMATION") {
    aluminizingVerdict = "FEAL_FORMATION";
  } else if (aluminizingRegime === "FE2AL5_NUCLEATION") {
    aluminizingVerdict = "FE2AL5_NUCLEATION";
  } else if (aluminizingRegime === "ALUMINUM_POTENTIAL_ESTABLISHMENT") {
    aluminizingVerdict = "ALUMINUM_POTENTIAL_ESTABLISHMENT";
  } else if (aluminizingRegime === "TEMPERATURE_RAMP") {
    aluminizingVerdict = "TEMPERATURE_RAMP";
  } else if (aluminizingRegime === "PRE_ALUMINIZE") {
    aluminizingVerdict = "PRE_ALUMINIZE";
  } else {
    aluminizingVerdict = "INTERMEDIATE_ALUMINIZING";
  }

  const topBins = [...binRecs]
    .sort((a, b) => b.aluminizingDegree - a.aluminizingDegree)
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
    aluminizingFieldOk,
    aluminizingFieldProximity: r4(aluminizingFieldProximity),
    subAluminizingField,
    overAluminizingField,
    kbProxy: r4(kbProxy),
    kbInWindow,
    kbProximity: r4(kbProximity),
    surfaceActivity: r4(surfaceMean),
    compoundLayerActivity: r4(compoundLayerActivity),
    compoundLayerVariance: r4(compoundLayerVariance),
    plateauQuality: r4(plateauQuality),
    fe2Al5FractionProxy: r4(fe2Al5FractionProxy),
    fe2Al5DominantRisk,
    feAlDominantProxy: r4(feAlDominantProxy),
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
    diffusionZoneProxy: r4(diffusionZoneProxy),
    alloyFactorProxy: r4(alloyFactorProxy),
    alloyFormerOk,
    substrateTypeProxy,
    underAluminizeRisk: r4(underAluminizeRisk),
    unevenAluminizingRisk: r4(unevenAluminizingRisk),
    reverseGradientRisk: r4(reverseGradientRisk),
    subAluminizingFieldRisk: r4(subAluminizingFieldRisk),
    overAluminizingFieldRisk: r4(overAluminizingFieldRisk),
    caseHardnessProxy: r4(caseHardnessProxy),
    wearResistanceProxy: r4(wearResistanceProxy),
    fatigueResistanceProxy: r4(fatigueResistanceProxy),
    distortionProxy: r4(distortionProxy),
    caseCoreRatio: r4(Math.min(10, caseCoreRatio)),
    diffusivityProxy: r4(diffusivityProxy),
    reserveCV: r4(reserveCV),
    reserveXFracStdev: r4(reserveXFracStdev),
    stageProgress: r4(stageProgress),
    dominantStage,
    aluminizingIndex,
    aluminizingRegime,
    aluminizingVerdict,
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
    name: "ALUMINIZING_FIELD_MIN < ALUMINIZING_FIELD_IDEAL < ALUMINIZING_FIELD_MAX",
    ok: ALUMINIZING_FIELD_MIN < ALUMINIZING_FIELD_IDEAL && ALUMINIZING_FIELD_IDEAL < ALUMINIZING_FIELD_MAX,
    detail: `${ALUMINIZING_FIELD_MIN} < ${ALUMINIZING_FIELD_IDEAL} < ${ALUMINIZING_FIELD_MAX}`,
  });
  checks.push({
    name: "KAL_MIN < KAL_IDEAL < KAL_MAX",
    ok: KAL_MIN < KAL_IDEAL && KAL_IDEAL < KAL_MAX,
    detail: `${KAL_MIN} < ${KAL_IDEAL} < ${KAL_MAX}`,
  });
  checks.push({
    name: "COMPOUND_LAYER_MIN_FRAC < COMPOUND_LAYER_IDEAL_FRAC < COMPOUND_LAYER_MAX_FRAC",
    ok: COMPOUND_LAYER_MIN_FRAC < COMPOUND_LAYER_IDEAL_FRAC && COMPOUND_LAYER_IDEAL_FRAC < COMPOUND_LAYER_MAX_FRAC,
    detail: `${COMPOUND_LAYER_MIN_FRAC} < ${COMPOUND_LAYER_IDEAL_FRAC} < ${COMPOUND_LAYER_MAX_FRAC}`,
  });
  checks.push({
    name: "FE2AL5_FRACTION_IDEAL < FE2AL5_FRACTION_MAX < DUAL_PHASE_MAX",
    ok: FE2AL5_FRACTION_IDEAL < FE2AL5_FRACTION_MAX && FE2AL5_FRACTION_MAX < DUAL_PHASE_MAX,
    detail: `${FE2AL5_FRACTION_IDEAL} < ${FE2AL5_FRACTION_MAX} < ${DUAL_PHASE_MAX}`,
  });
  checks.push({
    name: "ALUMINIZING_HV_SCALE < 1.00 (lowest in series — oxidation-focused, not hardness-focused)",
    ok: ALUMINIZING_HV_SCALE < 1.00,
    detail: `ALUMINIZING_HV_SCALE = ${ALUMINIZING_HV_SCALE}`,
  });
  checks.push({
    name: "DISTORTION_BASELINE < 0.12 (low — no substrate transformation)",
    ok: DISTORTION_BASELINE < 0.12,
    detail: `DISTORTION_BASELINE = ${DISTORTION_BASELINE}`,
  });
  checks.push({
    name: "FDT_REFERENCE_ALUMINIZING < 0.22 (shallower than nitriding)",
    ok: FDT_REFERENCE_ALUMINIZING < 0.22,
    detail: `FDT_REFERENCE_ALUMINIZING = ${FDT_REFERENCE_ALUMINIZING}`,
  });
  checks.push({
    name: "ECD_THRESHOLD = 0.55 (high — dense intermetallic phase)",
    ok: ECD_THRESHOLD === 0.55,
    detail: `ECD_THRESHOLD = ${ECD_THRESHOLD}`,
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

  const profiles: AluminizingProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeAluminizing(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgAluminizingIndex: profiles.length > 0 ? r2(avg(profiles.map((p) => p.aluminizingIndex))) : 0,
    avgDrivingForce: profiles.length > 0 ? r4(avg(profiles.map((p) => p.drivingForce))) : 0,
    avgKalProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.kbProxy))) : 0,
    avgSurfaceActivity: profiles.length > 0 ? r4(avg(profiles.map((p) => p.surfaceActivity))) : 0,
    avgCompoundLayerActivity: profiles.length > 0 ? r4(avg(profiles.map((p) => p.compoundLayerActivity))) : 0,
    avgCompoundLayerVariance: profiles.length > 0 ? r4(avg(profiles.map((p) => p.compoundLayerVariance))) : 0,
    avgPlateauQuality: profiles.length > 0 ? r4(avg(profiles.map((p) => p.plateauQuality))) : 0,
    avgFe2Al5FractionProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.fe2Al5FractionProxy))) : 0,
    avgFeAlDominantProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.feAlDominantProxy))) : 0,
    avgSpallationRisk: profiles.length > 0 ? r4(avg(profiles.map((p) => p.spallationRisk))) : 0,
    avgCoreActivity: profiles.length > 0 ? r4(avg(profiles.map((p) => p.coreActivity))) : 0,
    avgSurfaceCoreDelta: profiles.length > 0 ? r4(avg(profiles.map((p) => p.surfaceCoreDelta))) : 0,
    avgEdgeDominanceFraction: profiles.length > 0 ? r4(avg(profiles.map((p) => p.edgeDominanceFraction))) : 0,
    avgAsymmetryIndex: profiles.length > 0 ? r4(avg(profiles.map((p) => p.asymmetryIndex))) : 0,
    avgToothMorphologyProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.toothMorphologyProxy))) : 0,
    avgGradientDropAbruptness: profiles.length > 0 ? r4(avg(profiles.map((p) => p.gradientDropAbruptness))) : 0,
    avgCompoundLayerFraction: profiles.length > 0 ? r4(avg(profiles.map((p) => p.compoundLayerFraction))) : 0,
    avgCaseHardnessProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.caseHardnessProxy))) : 0,
    avgWearResistanceProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.wearResistanceProxy))) : 0,
    avgFatigueResistanceProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.fatigueResistanceProxy))) : 0,
    avgDistortionProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.distortionProxy))) : 0,
    avgDiffusionZoneProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.diffusionZoneProxy))) : 0,
    avgStageProgress: profiles.length > 0 ? r4(avg(profiles.map((p) => p.stageProgress))) : 0,
    avgUnderAluminizeRisk: profiles.length > 0 ? r4(avg(profiles.map((p) => p.underAluminizeRisk))) : 0,
    avgUnevenAluminizingRisk: profiles.length > 0 ? r4(avg(profiles.map((p) => p.unevenAluminizingRisk))) : 0,
    aluminizingFieldOkCount:        profiles.filter((p) => p.aluminizingFieldOk === 1).length,
    subAluminizingFieldCount:       profiles.filter((p) => p.subAluminizingField === 1).length,
    overAluminizingFieldCount:      profiles.filter((p) => p.overAluminizingField === 1).length,
    kbInWindowCount:               profiles.filter((p) => p.kbInWindow === 1).length,
    alloyFormerOkCount:            profiles.filter((p) => p.alloyFormerOk === 1).length,
    compoundLayerMeetsTargetCount: profiles.filter((p) => p.compoundLayerMeetsTarget === 1).length,
    compoundLayerExceedsTargetCount: profiles.filter((p) => p.compoundLayerExceedsTarget === 1).length,
    fe2Al5DominantRiskCount:          profiles.filter((p) => p.fe2Al5DominantRisk === 1).length,
    plainCSubstrateCount:          profiles.filter((p) => p.substrateTypeProxy === "PLAIN_C").length,
    alloySteelSubstrateCount:      profiles.filter((p) => p.substrateTypeProxy === "ALLOY_STEEL").length,
    preAluminizeCount:              profiles.filter((p) => p.aluminizingRegime === "PRE_ALUMINIZE").length,
    temperatureRampCount:          profiles.filter((p) => p.aluminizingRegime === "TEMPERATURE_RAMP").length,
    aluminumPotentialEstablishmentCount: profiles.filter((p) => p.aluminizingRegime === "ALUMINUM_POTENTIAL_ESTABLISHMENT").length,
    fe2Al5NucleationCount:           profiles.filter((p) => p.aluminizingRegime === "FE2AL5_NUCLEATION").length,
    fe2Al5GrowthCount:               profiles.filter((p) => p.aluminizingRegime === "FE2AL5_GROWTH").length,
    febFormationCount:             profiles.filter((p) => p.aluminizingRegime === "FEAL_FORMATION").length,
    fullyAluminizedCount:           profiles.filter((p) => p.aluminizingRegime === "FULLY_ALUMINIZED").length,
    overAluminizedCount:            profiles.filter((p) => p.aluminizingRegime === "OVER_ALUMINIZED").length,
    febDominantSpallationRiskCount: profiles.filter((p) => p.aluminizingRegime === "FE2AL5_DOMINANT_SPALLATION_RISK").length,
    underAluminizedCount:           profiles.filter((p) => p.aluminizingRegime === "UNDER_ALUMINIZED").length,
    unevenAluminizingCount:         profiles.filter((p) => p.aluminizingRegime === "UNEVEN_ALUMINIZING").length,
    subAluminizingFieldRegimeCount: profiles.filter((p) => p.aluminizingRegime === "SUB_ALUMINIZING_FIELD").length,
    overAluminizingFieldRegimeCount: profiles.filter((p) => p.aluminizingRegime === "OVER_ALUMINIZING_FIELD").length,
    noDriveCount:                  profiles.filter((p) => p.aluminizingRegime === "NO_ALUMINIZING_DRIVE").length,
    serviceReadyVerdictCount:      profiles.filter((p) => p.aluminizingVerdict === "SERVICE_READY").length,
    febSpallationRiskVerdictCount: profiles.filter((p) => p.aluminizingVerdict === "FE2AL5_SPALLATION_RISK").length,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program
  .name("hodlmm-bin-aluminizing")
  .description("HODLMM bin aluminizing (calorizing / pack-aluminizing) analyzer — models THERMOCHEMICAL SINGLE-SPECIES (ALUMINUM) SURFACE-DIFFUSION case-hardening at 800-1000 °C in γ-Fe producing a DUAL-PHASE FE-AL INTERMETALLIC COMPOUND LAYER (Fe2Al5 outer + FeAl inner); flags service-ready pools (monophase FeAl dominant, compound layer on-target, no Fe2Al5 spallation risk — NO QUENCH REQUIRED for compound layer hardness, unlike carburizing and carbonitriding), as well as Fe2Al5-spallation-risk (Fe2Al5-dominant outer layer), over-aluminized (layer too thick or Fe2Al5 > DUAL_PHASE_MAX), under-aluminized (Kal too low), uneven aluminizing, and sub/over aluminizing-field conditions; ALUMINIZING_HV_SCALE=0.65 is the LOWEST of any thermochemical treatment in this series (purpose is oxidation resistance, not hardness) (300-1000 HV, 45-55 HRC equivalent)");

program.command("doctor").description("Check constants and environment (no network calls)").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin aluminizing state")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
