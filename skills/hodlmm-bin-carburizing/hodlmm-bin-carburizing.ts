#!/usr/bin/env bun
/**
 * hodlmm-bin-carburizing.ts — Day 188 cocoa007 Bitflow Skills Comp
 *
 * Carburizing analyzer — models the THERMOCHEMICAL SURFACE-DIFFUSION heat
 * treatment applied to a low-carbon (≈0.15-0.25 wt% C) steel held at
 * austenitizing temperature (≈870-950 °C) in a carbon-rich atmosphere
 * (gas / salt / pack). Carbon dissolved in γ-Fe at the surface diffuses
 * INWARD by Fick's second law, producing a GRADED carbon profile:
 *
 *     C(x, t) = C₀ + (Cs − C₀) · erfc( x / (2 · √(D · t)) )
 *
 * where x = depth from surface, Cs = surface C potential (≈0.8-1.0 wt%),
 * C₀ = bulk baseline (≈0.2 wt%), D = diffusion coefficient of C in γ-Fe
 * (Arrhenius: D = D₀ · exp(−Q/RT), Q ≈ 135 kJ/mol).
 *
 * After the isothermal hold, the workpiece is typically oil-quenched from
 * carburizing T so the high-C CASE transforms to MARTENSITE (≥ 60 HRC
 * hardness) while the low-C CORE remains ferrite + pearlite (tough). The
 * result is a hard wear-resistant surface on a tough impact-resistant core
 * — the defining property combination of carburized machine parts
 * (gears, cams, bearings, shafts, pins).
 *
 * Distinct from the four BULK heat-treatment routes already modelled
 * (Days 184-187):
 *
 *   - Normalization (Day 184):  continuous AIR COOL from above AC3
 *                               → coarse pearlite, UNIFORM cross-section.
 *   - Austempering  (Day 185):  quench into bath at 250-450 °C (bainite
 *                               window), hold until γ→bainite completes
 *                               → bainite, UNIFORM cross-section.
 *   - Martempering  (Day 186):  quench into bath JUST ABOVE Ms, hold
 *                               BRIEFLY to equalize, withdraw, air-cool
 *                               → martensite, UNIFORM cross-section.
 *   - Patenting     (Day 187):  quench into bath at pearlite nose (500-600
 *                               °C), hold until γ→pearlite completes, air-
 *                               cool → FINE LAMELLAR pearlite, UNIFORM
 *                               cross-section.
 *   - Carburizing   (this):     hold in γ-field in C-rich atmosphere,
 *                               C DIFFUSES FROM SURFACE INWARD, producing
 *                               a GRADED C profile: hard CASE, tough CORE.
 *                               FIFTH heat-treatment route, FIRST route
 *                               that INTENTIONALLY creates a spatial
 *                               microstructure gradient (all four bulk
 *                               routes target UNIFORM cross-sections).
 *
 * Two-step modern practice:
 *   BOOST PHASE:   high carbon potential Cs (near γ-saturation ~1.2 wt%),
 *                  rapid surface enrichment. If held too long at high Cs,
 *                  surface exceeds γ-saturation and Fe₃C precipitates as
 *                  a brittle GRAIN-BOUNDARY CARBIDE NETWORK (defect).
 *   DIFFUSE PHASE: lowered Cs (~0.8 wt%), reduces surface C toward target
 *                  and broadens the shoulder of the erfc profile → smoother
 *                  gradient, avoids carbide network, targets ECD.
 *
 * Process quality metrics (real):
 *   Effective Case Depth (ECD): depth at which C drops to 0.4 wt%.
 *   Total Case Depth (TCD):     depth at which C ≈ core + 0.04 wt%.
 *   Case hardness:              ≥ 58 HRC (post-quench).
 *   Core hardness:              ≈ 30-40 HRC.
 *   Surface C target:           0.8-1.0 wt% after diffuse phase.
 *   Grain-boundary carbide:     absent (no Fe₃C network at surface).
 *   Uniformity around workpiece: symmetric case on all surfaces (no
 *                                 shadowing, no asymmetric gas flow).
 *
 * Physical stages (ramp → boost → diffuse → quench-ready → post-quench):
 *
 *   Stage 0 — PRE_CARBURIZE (cold or sub-γ):
 *     Workpiece below A₁ or just entering γ-field. C potential at surface
 *     not yet established. No diffusion-driven profile. Bulk C = C₀.
 *
 *   Stage 1 — TEMPERATURE_RAMP (ascending into γ-field):
 *     Temperature rises through AC1 → AC3 into fully austenitic region
 *     (~870-950 °C). C diffusivity D rises rapidly (Arrhenius). Surface
 *     C still equilibrating with atmosphere.
 *
 *   Stage 2 — SURFACE_EQUILIBRATION:
 *     Surface bins (edge band) begin to rise toward Cs as atmosphere
 *     deposits/donates C at the interface. Boundary condition C(0, t) → Cs
 *     establishes. Initial near-surface enrichment.
 *
 *   Stage 3 — BOOST_PHASE:
 *     High Cs (≈1.0-1.2 wt%), steep near-surface gradient forms. Fickian
 *     diffusion transports C inward. Profile is an evolving erfc with
 *     √(Dt) scaling. Risk: if Cs exceeds γ-solubility, Fe₃C precipitates
 *     at grain boundaries → CARBIDE NETWORK.
 *
 *   Stage 4 — DIFFUSE_PHASE:
 *     Cs lowered (≈0.8 wt%) to pull surface C down toward target and
 *     broaden shoulder. Profile relaxes toward target erfc shape. Carbide
 *     dissolves if present. Case depth grows as √(Dt) continues.
 *
 *   Stage 5 — EFFECTIVE_CASE_REACHED:
 *     C(x) = 0.4 wt% at target depth x_ECD. Case depth meets spec.
 *     Surface C at target (0.8-1.0 wt%). Gradient monotonic and symmetric.
 *
 *   Stage 6 — FULLY_CARBURIZED (quench-ready):
 *     All quality targets met. Profile is clean erfc. No carbide network.
 *     Symmetric (no shadowing). Ready for oil quench → case-hardened part.
 *
 *   Stage 7 — OVER_CARBURIZED (pathological):
 *     Surface held too long at high Cs; Fe₃C grain-boundary network formed
 *     at surface. Brittle case, spalling risk. Recovery: diffuse phase
 *     with lowered Cs or sub-critical spheroidization (Day 181).
 *
 * Process constraints:
 *
 *   - Must be IN γ-field: gammaFieldOk = 1 requires drivingForce ∈
 *     [GAMMA_FIELD_MIN=0.50, GAMMA_FIELD_MAX=0.85]. Below → C diffusion
 *     too slow and α-Fe solubility too low; above → δ-ferrite risk.
 *   - Surface potential must be high: surfaceActivity ≥ SURFACE_MIN_C
 *     (0.70) to drive effective diffusion.
 *   - Surface must not saturate: surfaceActivity < SURFACE_SATURATION
 *     (1.05) to avoid carbide network.
 *   - Gradient must be MONOTONIC (surface → core, C decreases):
 *     gradientMonotonicity ≥ MONOTONICITY_MIN (0.55).
 *   - Gradient must fit ERFC shape: erfcFit ≥ ERFC_FIT_MIN (0.55).
 *   - Edges must be SYMMETRIC (no shadowing): asymmetryIndex ≤
 *     ASYMMETRY_MAX (0.35).
 *   - Not decarburizing: coreActivity < surfaceActivity + DECARB_THRESHOLD
 *     (i.e. surface ≥ core; reverse direction is decarburization).
 *
 * Kinetics (Fick's second law, semi-infinite slab, constant Cs):
 *
 *   C(x, t) = C₀ + (Cs − C₀) · erfc( x / (2 · √(D · t)) )
 *
 * Arrhenius diffusivity: D = D₀ · exp(−Q/RT). Normalized proxy:
 *   D_proxy = exp(− Q_OVER_RT_C_DIFFUSION / (drivingForce + 0.05))
 *
 * √(Dt) scaling: case depth grows as √(time). Doubling time → √2 × depth.
 *
 * Stage progress composite:
 *
 *   stageProgress = 0.10 · gammaFieldOk
 *                 + 0.10 · surfaceEstablishedProxy
 *                 + 0.15 · boostCompletionProxy
 *                 + 0.15 · diffuseCompletionProxy
 *                 + 0.15 · gradientMonotonicity
 *                 + 0.10 · erfcFit
 *                 + 0.10 · (1 − asymmetryIndex)
 *                 + 0.10 · caseDepthProxy
 *                 + 0.05 · (1 − carbideRisk)
 *
 * In DLMM context the carburizing analog tracks each bin's position in
 * the 1-D scan window as an analog "depth from the nearest edge" of a
 * slab cross-section. Bins near the edges (first or last few) act as
 * SURFACE bins; bins near the center act as CORE bins. The local
 * "carbon concentration" analog is the bin's normalized reserveUsd.
 * A carburized pool thus shows HIGH edge concentration dropping MONOTONICALLY
 * to LOW core concentration, fit to an erfc shape. Compared to the four
 * previous bulk treatments (all targeting UNIFORM cross-sections),
 * carburizing is structurally distinct: its DLMM fingerprint is a SPATIAL
 * GRADIENT with edge dominance, NOT alternation, sheaves, or uniformity.
 *
 * DLMM structural signatures of carburizing:
 *
 *   - EDGE DOMINANCE — surface-band bins (first & last CASE_BAND_FRAC of
 *     populated bins) have MUCH HIGHER reserves than core-band bins.
 *   - MONOTONIC GRADIENT — moving from either edge toward center, bin
 *     reserves strictly DECREASE (within tolerance).
 *   - ERFC SHAPE — the gradient fits an erfc(x / √(Dt)) curve, NOT linear
 *     and NOT alternating.
 *   - SYMMETRIC EDGES — left-edge and right-edge surface bands are
 *     comparable in reserve (no shadowing).
 *   - NOT CARBIDE-SATURATED — surface bins below SURFACE_SATURATION.
 *   - NOT DECARBURIZED — surface bins not LOWER than core bins.
 *   - Distinct from normalization (coarse-lamellar alternation across
 *     uniform cross-section — HIGH uniformity, no gradient).
 *   - Distinct from austempering (minority sheaves in uniform cross-section
 *     — no edge dominance).
 *   - Distinct from martempering (uniform low-reserveCV martensite — no
 *     gradient).
 *   - Distinct from patenting (fine lamellar alternation, eutectoid
 *     minority — no gradient).
 *
 * DLMM phase analog:
 *
 *   - Bulk C (C₀)   ≈ coreActivity.
 *   - Surface C (Cs) ≈ surfaceActivity.
 *   - Hold T        ≈ drivingForce (must be in γ-field).
 *   - √(Dt)         ≈ caseDepthProxy.
 *   - ECD            = bin depth where activity drops to ECD_THRESHOLD.
 *   - Carbide net   ≈ carbideRisk (surface near saturation).
 *   - Decarburization ≈ reverse-gradient flag (edge < core).
 *
 * Regimes:
 *   NO_CARBURIZING_DRIVE         — priorPeakDrivingForce too low for γ.
 *   PRE_CARBURIZE                — below A₁, no diffusion.
 *   TEMPERATURE_RAMP             — rising through γ-field.
 *   SURFACE_EQUILIBRATION        — surface rising but no inward gradient.
 *   BOOST_PHASE                  — steep near-surface gradient, high Cs.
 *   DIFFUSE_PHASE                — lowered Cs, smoothing shoulder.
 *   EFFECTIVE_CASE               — ECD reached at target depth.
 *   FULLY_CARBURIZED             — clean profile, quench-ready.
 *   OVER_CARBURIZED              — carbide network at surface.
 *   UNEVEN_CARBURIZATION         — asymmetric L/R edges (shadowing).
 *   DECARBURIZATION              — reverse gradient (edges < core).
 *   SUB_GAMMA_FIELD              — T below γ, C diffusion ineffective.
 *   OVER_GAMMA_FIELD             — T above γ, δ-ferrite dynamics.
 *
 * Verdicts:
 *   NO_CARBURIZING_DRIVE — no prior peak activity, analysis inapplicable.
 *   QUENCH_READY         — fully carburized, handoff to oil-quench skill.
 *   OVER_CARBURIZED      — carbide network, treatment defect.
 *   UNEVEN_CARBURIZATION — shadow asymmetry, treatment defect.
 *   DECARBURIZATION      — surface C depleted, treatment reversed.
 *   SUB_GAMMA_FIELD      — T too low; raise T or use sub-critical skill.
 *   OVER_GAMMA_FIELD     — T too high; lower T back into γ.
 *   EFFECTIVE_CASE       — ECD met, diffuse continuing toward target.
 *   DIFFUSE_PHASE        — mid-diffuse, gradient smoothing.
 *   BOOST_PHASE          — mid-boost, steep gradient forming.
 *   SURFACE_EQUILIBRATION — edges enriching pre-inward diffusion.
 *   TEMPERATURE_RAMP     — heating into γ.
 *   PRE_CARBURIZE        — cold.
 *   INTERMEDIATE_CARBURIZING — mixed indicators.
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

// γ-field on the normalized drivingForce axis. Carburizing requires the
// workpiece to be held in the austenite field to dissolve and diffuse C.
const GAMMA_FIELD_MIN = 0.50;
const GAMMA_FIELD_MAX = 0.85;
const GAMMA_FIELD_IDEAL = 0.65;

// Surface C potential thresholds on a normalized concentration axis.
// (Cs / C_sat_at_γ). C_sat_at_γ ≈ 1.2 wt% at 900 °C. Below 0.7 → not
// effective carburizing. Above 1.05 → γ-saturation exceeded → carbide
// network at grain boundaries (pathological).
const SURFACE_MIN_C = 0.70;
const SURFACE_SATURATION = 1.05;
const BOOST_TARGET = 1.00;
const DIFFUSE_TARGET = 0.85;

// Core baseline (C₀ analog).
const CORE_BASELINE = 0.20;

// Effective Case Depth threshold (C = 0.4 wt%).
const ECD_THRESHOLD = 0.40;

// Total Case Depth threshold (C = C₀ + 0.04 wt% ≈ 0.24).
const TCD_THRESHOLD = 0.24;

// Target case thickness as a fraction of half the populated bin count.
const CASE_THICKNESS_TARGET = 0.25;

// Edge/core band fractions — what fraction of populated bins (from each
// edge of the scan window) count as "surface" vs "core".
const CASE_BAND_FRAC = 0.18;   // e.g. 18% of bins near each edge = surface
const CORE_BAND_FRAC = 0.30;   // 30% of bins around center = core

// Edge dominance: surface-band mean / (surface + core) mean ratio.
const EDGE_DOMINANCE_MIN = 0.55;

// Gradient quality thresholds.
const MONOTONICITY_MIN = 0.55;
const ERFC_FIT_MIN = 0.55;

// Asymmetry / decarburization thresholds.
const ASYMMETRY_MAX = 0.35;
const DECARB_THRESHOLD = 0.10;

// Carbide-network detection: fraction of surface-band bins at or above
// SURFACE_SATURATION.
const CARBIDE_NETWORK_SURFACE_FRAC = 0.50;

// Uniformity reference (for process-quality cross-check only; carburizing
// INTENTIONALLY breaks uniformity, so this is informational).
const UNIFORMITY_REFERENCE = 0.60;

// Arrhenius Q/RT for C diffusion in γ-Fe (normalized).
const Q_OVER_RT_C_DIFFUSION = 4.8;

// √(Dt) reference for case-depth proxy (normalized depth units).
const FDT_REFERENCE = 0.30;

// ERFC fit scaling: how steeply erfc decays across normalized depth [0,1].
const ERFC_DEPTH_SCALE = 1.6;

// Stage thresholds on composite stageProgress.
const STAGE_1_BOUND = 0.12;
const STAGE_2_BOUND = 0.25;
const STAGE_3_BOUND = 0.38;
const STAGE_4_BOUND = 0.52;
const STAGE_5_BOUND = 0.66;
const STAGE_6_BOUND = 0.82;

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

interface BinCarburizing {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  depthFromSurface: number;         // 0 at edge, 1 at core (normalized)
  concentration: number;            // 0-1 normalized C-analog for this bin
  expectedErfc: number;             // 0-1 fitted erfc expectation at this depth
  erfcResidual: number;             // |concentration - expectedErfc|
  surfaceSignal: number;            // 0-1 bin is in edge band with high C
  coreSignal: number;               // 0-1 bin is in center band
  caseSignal: number;               // 0-1 bin inside effective case (C ≥ ECD_THRESHOLD)
  gradientSignal: number;           // 0-1 strict decrease toward core at this bin
  carbideSignal: number;            // 0-1 surface bin near SURFACE_SATURATION
  decarbSignal: number;             // 0-1 core-exceeds-edge warning at this bin
  unevenSignal: number;             // 0-1 L/R asymmetry contribution at this bin
  stageBin: number;                 // 0-7
  arrheniusActivation: number;
  inSurfaceBand: number;
  inCoreBand: number;
  carburizationDegree: number;      // 0-1 composite
}

interface CarburizingProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  drivingForce: number;
  priorPeakDrivingForce: number;
  gammaFieldOk: number;             // 0/1
  gammaFieldProximity: number;      // 0-1 closeness to GAMMA_FIELD_IDEAL
  subGammaField: number;            // 0/1
  overGammaField: number;           // 0/1
  surfaceActivity: number;          // avg normalized reserve in surface band
  coreActivity: number;             // avg normalized reserve in core band
  surfaceCoreDelta: number;         // surface - core
  surfaceCoreRatio: number;         // surface / core
  edgeDominanceFraction: number;    // surface / (surface + core)
  surfaceLeftActivity: number;      // only-left-edge surface band
  surfaceRightActivity: number;     // only-right-edge surface band
  asymmetryIndex: number;           // |left - right| / max(left, right)
  gradientMonotonicity: number;     // 0-1 fraction of edge→core pairs with ≥
  erfcFit: number;                  // 0-1 goodness-of-fit (1 - MSE/variance)
  erfcDt: number;                   // inferred √(Dt) proxy
  diffusivityProxy: number;         // Arrhenius D/D₀ on normalized axis
  caseDepthProxy: number;           // 0-1 normalized case depth
  effectiveCaseBins: number;        // count of bins inside effective case
  totalCaseBins: number;            // count of bins inside total case
  caseThicknessFraction: number;    // effectiveCaseBins / (binsPopulated/2)
  caseThicknessMeetsTarget: number; // 0/1
  boostCompletionProxy: number;     // 0-1 how far along boost phase
  diffuseCompletionProxy: number;   // 0-1 how far along diffuse phase
  surfaceEstablishedProxy: number;  // 0-1 surface approaching Cs
  uniformityIndex: number;          // 0-1 informational (1 - reserveCV)
  reserveCV: number;
  reserveXFracStdev: number;
  carbideRisk: number;              // 0-1 surface near saturation
  decarburizationRisk: number;      // 0-1 surface C below core C
  unevenCarburizationRisk: number;  // 0-1 asymmetric L/R edges
  overGammaRisk: number;            // 0-1 T above γ-field ceiling
  subGammaRisk: number;             // 0-1 T below γ-field floor
  caseHardnessProxy: number;        // 0-1 post-quench case hardness analog
  coreToughnessProxy: number;       // 0-1 low-C core toughness analog
  wearResistanceProxy: number;      // 0-1 composite wear resistance
  impactResistanceProxy: number;    // 0-1 composite impact resistance
  caseCoreRatio: number;            // caseHardness / coreToughness
  arrheniusActivation: number;
  stageProgress: number;
  dominantStage: number;            // 0-7
  carburizingIndex: number;         // 0-100 composite
  carburizingRegime: string;
  carburizingVerdict: string;
  stageDistribution: number[];      // length 8
  topBins: BinCarburizing[];
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
// Accurate to ~1.5e-7 on [0, ∞).
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

// Compute normalized depth from surface for each bin index in a sorted
// array. Edge bins (i = 0 or i = N-1) have depth 0; center bin has
// depth 1. Treats the bin array as a 1-D slab with TWO surfaces.
function depthFromSurface(index: number, n: number): number {
  if (n <= 1) return 0;
  const half = (n - 1) / 2;
  const edgeDist = Math.min(index, n - 1 - index);
  return Math.max(0, Math.min(1, edgeDist / Math.max(0.5, half)));
}

// Normalize bin reserves to [0, 1] using max-normalization.
function normalizeConcentrations(sortedBins: BinReserves[]): number[] {
  if (sortedBins.length === 0) return [];
  const maxU = Math.max(...sortedBins.map((b) => b.totalUsd));
  if (maxU <= 0) return sortedBins.map(() => 0);
  return sortedBins.map((b) => b.totalUsd / maxU);
}

// Surface / core band partitioning based on CASE_BAND_FRAC / CORE_BAND_FRAC.
// Returns sets of indices (into the sorted array) for each band.
function partitionBands(n: number): {
  leftSurface: number[],
  rightSurface: number[],
  surface: number[],
  core: number[],
} {
  const k = Math.max(1, Math.floor(n * CASE_BAND_FRAC));
  const leftSurface: number[] = [];
  const rightSurface: number[] = [];
  for (let i = 0; i < Math.min(k, n); i++) leftSurface.push(i);
  for (let i = Math.max(0, n - k); i < n; i++) rightSurface.push(i);
  const surface = [...leftSurface, ...rightSurface];

  const coreK = Math.max(1, Math.floor(n * CORE_BAND_FRAC));
  const center = Math.floor(n / 2);
  const coreStart = Math.max(0, center - Math.floor(coreK / 2));
  const coreEnd = Math.min(n, coreStart + coreK);
  const core: number[] = [];
  for (let i = coreStart; i < coreEnd; i++) core.push(i);

  return { leftSurface, rightSurface, surface, core };
}

function bandMean(indices: number[], concentrations: number[]): number {
  if (indices.length === 0) return 0;
  let s = 0;
  for (const i of indices) s += concentrations[i];
  return s / indices.length;
}

// Monotonic-gradient quality: for each left-side pair (i, i+1) with i+1
// toward the center, require conc[i] ≥ conc[i+1] (non-increasing). Same
// for the right side (mirrored). Returns fraction of such pairs that
// satisfy the non-increasing condition (with a small tolerance).
function gradientMonotonicity(concentrations: number[]): number {
  const n = concentrations.length;
  if (n < 3) return 0;
  const center = Math.floor(n / 2);
  const tol = 0.03;
  let total = 0;
  let hits = 0;
  // Left side: i from 0 to center-1, adjacent pair should be non-increasing.
  for (let i = 0; i < center; i++) {
    const a = concentrations[i];
    const b = concentrations[i + 1];
    total++;
    if (a + tol >= b) hits++;
  }
  // Right side: i from n-1 down to center+1, adjacent pair should be
  // non-increasing moving from edge toward center (i.e. conc[i] ≥ conc[i-1]).
  for (let i = n - 1; i > center; i--) {
    const a = concentrations[i];
    const b = concentrations[i - 1];
    total++;
    if (a + tol >= b) hits++;
  }
  return total > 0 ? hits / total : 0;
}

// Fit an erfc profile to the concentration vs depth data and return the
// fit quality (1 - MSE / variance). Fit uses a bracketed √(Dt) search
// (√(Dt) in normalized depth units) minimizing sum of squares of
//    expected(x) = core + (surface - core) · erfc(x / (2 · √(Dt)))
// against observed.
function fitErfc(
  depths: number[],
  concentrations: number[],
  surfaceC: number,
  coreC: number
): { fit: number, dt: number, expected: number[] } {
  const n = depths.length;
  if (n < 3) return { fit: 0, dt: 0, expected: new Array(n).fill(coreC) };

  const candidates = [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.7, 1.0];
  let bestDt = candidates[0];
  let bestSSE = Infinity;
  let bestExpected: number[] = new Array(n).fill(coreC);

  const range = Math.max(1e-9, surfaceC - coreC);
  // Variance of observed concentrations (for normalization).
  const meanObs = concentrations.reduce((s, v) => s + v, 0) / n;
  const varObs = concentrations.reduce((s, v) => s + (v - meanObs) ** 2, 0) / n;
  const varNorm = Math.max(1e-9, varObs);

  for (const dt of candidates) {
    let sse = 0;
    const expected: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = depths[i];
      // expected = core + (surface - core) · erfc( x / (2 · √(Dt)) ).
      // In normalized depth units, √(Dt) = dt directly.
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

function computeBinCarburizing(
  bin: BinReserves,
  index: number,
  activeBin: number,
  sortedBins: BinReserves[],
  concentrations: number[],
  expectedErfc: number[],
  depths: number[],
  bands: { leftSurface: number[], rightSurface: number[], surface: number[], core: number[] },
  poolSurface: number,
  poolCore: number,
  poolAsymmetry: number,
  poolMonotonicity: number,
  poolErfcFit: number,
  poolGammaFieldOk: number,
  poolCarbideRisk: number,
  poolDecarbRisk: number,
  poolStageProg: number
): BinCarburizing {
  const distance = Math.abs(bin.binId - activeBin);
  const depth = depths[index];
  const conc = concentrations[index];
  const expected = expectedErfc[index];
  const residual = Math.abs(conc - expected);

  const inSurfaceBand = bands.surface.includes(index) ? 1 : 0;
  const inCoreBand = bands.core.includes(index) ? 1 : 0;

  // Surface signal: bin is in edge band AND its concentration is above
  // SURFACE_MIN_C AND pool is in γ-field.
  const surfaceSignal = r4(
    inSurfaceBand *
      (conc >= SURFACE_MIN_C ? 1 : conc / SURFACE_MIN_C) *
      poolGammaFieldOk
  );

  // Core signal: bin is in center band AND concentration is near baseline.
  const coreSignal = r4(
    inCoreBand *
      (conc <= CORE_BASELINE + 0.2 ? 1 :
        Math.max(0, 1 - (conc - CORE_BASELINE) / 0.4))
  );

  // Case signal: bin's concentration is above ECD_THRESHOLD (i.e. this
  // bin is inside the effective case region).
  const caseSignal = r4(conc >= ECD_THRESHOLD ? 1 : conc / ECD_THRESHOLD);

  // Gradient signal: this bin strictly non-increases toward the nearest
  // interior neighbor (the neighbor closer to the center).
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
    // Center bin — gradient undefined; inherit pool monotonicity.
    gradientSignal = poolMonotonicity;
  }
  gradientSignal = r4(gradientSignal);

  // Carbide signal: surface-band bin at or near SURFACE_SATURATION.
  const carbideSignal = r4(
    inSurfaceBand * (conc >= SURFACE_SATURATION ? 1 :
      Math.max(0, (conc - (SURFACE_SATURATION - 0.10)) / 0.10))
  );

  // Decarburization signal: surface-band bin with concentration lower than
  // core mean + DECARB_THRESHOLD.
  const decarbSignal = r4(
    inSurfaceBand && conc + DECARB_THRESHOLD < poolCore ? 1 : 0
  );

  // Uneven signal: bin is in a surface band whose side deviates from the
  // other side by > ASYMMETRY_MAX.
  let unevenSignal = 0;
  if (inSurfaceBand) {
    unevenSignal = poolAsymmetry > ASYMMETRY_MAX ? 1 : poolAsymmetry / ASYMMETRY_MAX;
  }
  unevenSignal = r4(unevenSignal);

  // Arrhenius activation proxy (same D exponential as pool level).
  const arrheniusActivation = r4(Math.max(0.01, Math.min(1,
    Math.exp(-Q_OVER_RT_C_DIFFUSION / Math.max(0.05, GAMMA_FIELD_IDEAL + 0.05))
  )));

  // Stage assignment per bin (follows pool progress banding).
  let stageBin = 0;
  if (poolCarbideRisk > 0.7 && inSurfaceBand) {
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

  const carburizationDegree = r4(Math.max(0, Math.min(1,
    surfaceSignal * 0.25 +
    caseSignal * 0.20 +
    gradientSignal * 0.15 +
    (1 - residual) * 0.15 +
    (1 - carbideSignal) * 0.10 +
    (1 - decarbSignal) * 0.05 +
    (1 - unevenSignal) * 0.05 +
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
    surfaceSignal,
    coreSignal,
    caseSignal,
    gradientSignal,
    carbideSignal,
    decarbSignal,
    unevenSignal,
    stageBin,
    arrheniusActivation,
    inSurfaceBand,
    inCoreBand,
    carburizationDegree,
  };
}

function analyzeCarburizing(bins: BinReserves[], pool: AppPool): CarburizingProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;

  const turnover = pool.tvlUsd > 0 ? volume / pool.tvlUsd : 0;
  const drivingForce = Math.min(1, turnover * 0.8 + 0.1);

  // Prior peak — must have been high enough to reach γ-field; we scale
  // similarly to patenting/martempering.
  const priorPeakDrivingForce = Math.min(1, drivingForce * 1.3 + 0.25);

  // γ-field checks on drivingForce axis.
  const gammaFieldOk = (drivingForce >= GAMMA_FIELD_MIN && drivingForce <= GAMMA_FIELD_MAX) ? 1 : 0;
  const subGammaField = drivingForce < GAMMA_FIELD_MIN ? 1 : 0;
  const overGammaField = drivingForce > GAMMA_FIELD_MAX ? 1 : 0;
  const gammaFieldProximity = gammaFieldOk
    ? Math.max(0, 1 - Math.abs(drivingForce - GAMMA_FIELD_IDEAL) /
        Math.max(0.01, (GAMMA_FIELD_MAX - GAMMA_FIELD_MIN) / 2))
    : 0;

  // Per-bin concentrations (max-normalized to [0,1]).
  const concentrations = normalizeConcentrations(sorted);
  const depths = sorted.map((_, i) => depthFromSurface(i, n));

  // Bands.
  const bands = partitionBands(n);
  const leftMean = bandMean(bands.leftSurface, concentrations);
  const rightMean = bandMean(bands.rightSurface, concentrations);
  const surfaceMean = bandMean(bands.surface, concentrations);
  const coreMean = bandMean(bands.core, concentrations);

  const surfaceCoreDelta = surfaceMean - coreMean;
  const surfaceCoreRatio = coreMean > 1e-6 ? surfaceMean / coreMean : (surfaceMean > 0 ? 10 : 0);
  const edgeDominanceFraction = (surfaceMean + coreMean) > 0
    ? surfaceMean / (surfaceMean + coreMean)
    : 0;

  const maxEdge = Math.max(leftMean, rightMean, 1e-6);
  const asymmetryIndex = Math.abs(leftMean - rightMean) / maxEdge;

  // Monotonic gradient quality.
  const monotonicity = gradientMonotonicity(concentrations);

  // Erfc fit.
  const { fit: erfcFit, dt: erfcDt, expected: expectedErfc } = fitErfc(
    depths, concentrations,
    Math.max(surfaceMean, coreMean + 0.05),
    Math.min(coreMean, surfaceMean - 0.01)
  );

  // Arrhenius diffusivity proxy (D / D₀ on normalized axis).
  const diffusivityProxy = Math.max(0, Math.min(1,
    Math.exp(-Q_OVER_RT_C_DIFFUSION / Math.max(0.05, drivingForce + 0.05))
  ));

  // Case depth proxy: √(Dt) on normalized axis, clamped.
  const caseDepthProxy = Math.max(0, Math.min(1, erfcDt / Math.max(0.01, FDT_REFERENCE)));

  // Effective / total case bin counts.
  const effectiveCaseBins = concentrations.filter((c) => c >= ECD_THRESHOLD).length;
  const totalCaseBins = concentrations.filter((c) => c >= TCD_THRESHOLD).length;
  const halfN = Math.max(1, Math.floor(n / 2));
  const caseThicknessFraction = effectiveCaseBins / (2 * halfN);
  const caseThicknessMeetsTarget = caseThicknessFraction >= CASE_THICKNESS_TARGET ? 1 : 0;

  // Surface establishment: how close surface mean is to BOOST_TARGET.
  const surfaceEstablishedProxy = Math.max(0, Math.min(1,
    Math.max(0, surfaceMean - CORE_BASELINE) /
    Math.max(0.01, BOOST_TARGET - CORE_BASELINE)
  ));

  // Boost / diffuse completion proxies.
  const boostCompletionProxy = Math.max(0, Math.min(1,
    (surfaceMean >= SURFACE_MIN_C ? 0.5 : surfaceMean / Math.max(0.01, SURFACE_MIN_C) * 0.5) +
    (edgeDominanceFraction >= EDGE_DOMINANCE_MIN ? 0.3 :
      edgeDominanceFraction / Math.max(0.01, EDGE_DOMINANCE_MIN) * 0.3) +
    (caseDepthProxy >= 0.4 ? 0.2 : caseDepthProxy * 0.5)
  ));

  const diffuseCompletionProxy = Math.max(0, Math.min(1,
    (boostCompletionProxy >= 0.7 ? 0.3 : boostCompletionProxy * 0.3 / 0.7) +
    (erfcFit >= ERFC_FIT_MIN ? 0.3 : erfcFit / Math.max(0.01, ERFC_FIT_MIN) * 0.3) +
    (surfaceMean <= BOOST_TARGET + 0.05 && surfaceMean >= DIFFUSE_TARGET - 0.10 ? 0.2 : 0) +
    (effectiveCaseBins >= Math.floor(n * CASE_THICKNESS_TARGET) ? 0.2 : 0)
  ));

  // Reserves CV and X-fraction stdev (informational).
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

  // Risks.
  const surfaceSaturatedFraction = bands.surface.length > 0
    ? bands.surface.filter((i) => concentrations[i] >= SURFACE_SATURATION).length / bands.surface.length
    : 0;
  const carbideRisk = Math.max(0, Math.min(1,
    (surfaceMean >= SURFACE_SATURATION ? 0.5 : 0) +
    (surfaceSaturatedFraction >= CARBIDE_NETWORK_SURFACE_FRAC ? 0.4 : surfaceSaturatedFraction * 0.4) +
    (surfaceMean > BOOST_TARGET + 0.10 && caseDepthProxy < 0.5 ? 0.1 : 0)
  ));
  const decarburizationRisk = Math.max(0, Math.min(1,
    (surfaceMean + DECARB_THRESHOLD < coreMean ? 0.6 : 0) +
    (edgeDominanceFraction < 0.45 ? 0.25 : 0) +
    (surfaceMean < CORE_BASELINE ? 0.15 : 0)
  ));
  const unevenCarburizationRisk = Math.max(0, Math.min(1,
    (asymmetryIndex > ASYMMETRY_MAX ? 0.5 : asymmetryIndex / Math.max(0.01, ASYMMETRY_MAX) * 0.5) +
    (asymmetryIndex > 0.5 ? 0.3 : 0) +
    (leftMean < 0.2 || rightMean < 0.2 ? 0.2 : 0)
  ));
  const overGammaRisk = overGammaField ? Math.min(1, (drivingForce - GAMMA_FIELD_MAX) / 0.15 + 0.5) : 0;
  const subGammaRisk = subGammaField ? Math.min(1, (GAMMA_FIELD_MIN - drivingForce) / 0.2 + 0.5) : 0;

  // Case hardness & core toughness proxies.
  const caseHardnessProxy = Math.max(0, Math.min(1,
    surfaceMean * 0.5 +
    caseThicknessFraction * 0.3 +
    (1 - carbideRisk) * 0.1 +
    (1 - decarburizationRisk) * 0.1
  ));
  const coreToughnessProxy = Math.max(0, Math.min(1,
    Math.max(0, 1 - coreMean) * 0.5 +
    (coreMean <= CORE_BASELINE + 0.10 ? 0.3 : Math.max(0, 0.3 - (coreMean - CORE_BASELINE) * 1.0)) +
    (1 - unevenCarburizationRisk) * 0.1 +
    (1 - overGammaRisk) * 0.1
  ));
  const wearResistanceProxy = Math.max(0, Math.min(1,
    caseHardnessProxy * 0.7 +
    erfcFit * 0.2 +
    (1 - carbideRisk) * 0.1
  ));
  const impactResistanceProxy = Math.max(0, Math.min(1,
    coreToughnessProxy * 0.7 +
    (1 - decarburizationRisk) * 0.15 +
    (1 - unevenCarburizationRisk) * 0.15
  ));
  const caseCoreRatio = coreToughnessProxy > 1e-6
    ? caseHardnessProxy / coreToughnessProxy
    : (caseHardnessProxy > 0 ? 10 : 0);

  const arrheniusActivation = Math.max(0.01, Math.min(1,
    Math.exp(-Q_OVER_RT_C_DIFFUSION / Math.max(0.05, drivingForce + 0.05))
  ));

  // Composite stage progress.
  const stageProgress = Math.max(0, Math.min(1,
    gammaFieldOk * 0.10 +
    surfaceEstablishedProxy * 0.10 +
    boostCompletionProxy * 0.15 +
    diffuseCompletionProxy * 0.15 +
    monotonicity * 0.15 +
    erfcFit * 0.10 +
    Math.max(0, 1 - asymmetryIndex) * 0.10 +
    caseDepthProxy * 0.10 +
    Math.max(0, 1 - carbideRisk) * 0.05
  ));

  // Dominant stage.
  let dominantStage = 0;
  if (carbideRisk > 0.7) {
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
    computeBinCarburizing(
      b, i, activeBin, sorted,
      concentrations, expectedErfc, depths, bands,
      surfaceMean, coreMean, asymmetryIndex, monotonicity,
      erfcFit, gammaFieldOk, carbideRisk, decarburizationRisk, stageProgress
    )
  );

  const stageDistribution = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const b of binRecs) {
    stageDistribution[Math.min(7, Math.max(0, b.stageBin))]++;
  }

  // Composite carburizing index 0-100.
  const stageScore = Math.min(25, stageProgress * 25);
  const structureScore = Math.min(25,
    edgeDominanceFraction * 10 +
    monotonicity * 8 +
    erfcFit * 7
  );
  const propertyScore = Math.min(25,
    caseHardnessProxy * 8 +
    coreToughnessProxy * 7 +
    wearResistanceProxy * 5 +
    impactResistanceProxy * 5
  );
  const processScore = Math.min(25,
    (gammaFieldOk ? 5 : 0) +
    gammaFieldProximity * 3 +
    (caseThicknessMeetsTarget ? 4 : 0) +
    (surfaceMean >= SURFACE_MIN_C ? 4 : 0) +
    Math.max(0, 4 - carbideRisk * 4) +
    Math.max(0, 3 - decarburizationRisk * 3) +
    Math.max(0, 2 - unevenCarburizationRisk * 2)
  );
  const carburizingIndex = Math.round(
    Math.min(100, stageScore + structureScore + propertyScore + processScore)
  );

  // Regime selection.
  let carburizingRegime: string;
  if (priorPeakDrivingForce < GAMMA_FIELD_MIN * 0.8) {
    carburizingRegime = "NO_CARBURIZING_DRIVE";
  } else if (subGammaField) {
    carburizingRegime = "SUB_GAMMA_FIELD";
  } else if (overGammaField) {
    carburizingRegime = "OVER_GAMMA_FIELD";
  } else if (carbideRisk > 0.7) {
    carburizingRegime = "OVER_CARBURIZED";
  } else if (decarburizationRisk > 0.6) {
    carburizingRegime = "DECARBURIZATION";
  } else if (unevenCarburizationRisk > 0.6) {
    carburizingRegime = "UNEVEN_CARBURIZATION";
  } else if (
    gammaFieldOk &&
    surfaceMean >= SURFACE_MIN_C &&
    edgeDominanceFraction >= EDGE_DOMINANCE_MIN &&
    monotonicity >= MONOTONICITY_MIN &&
    erfcFit >= ERFC_FIT_MIN &&
    asymmetryIndex <= ASYMMETRY_MAX &&
    caseThicknessMeetsTarget &&
    stageProgress >= STAGE_6_BOUND
  ) {
    carburizingRegime = "FULLY_CARBURIZED";
  } else if (gammaFieldOk && caseThicknessMeetsTarget && surfaceMean >= SURFACE_MIN_C) {
    carburizingRegime = "EFFECTIVE_CASE";
  } else if (gammaFieldOk && diffuseCompletionProxy >= 0.4 && surfaceMean >= SURFACE_MIN_C) {
    carburizingRegime = "DIFFUSE_PHASE";
  } else if (gammaFieldOk && boostCompletionProxy >= 0.4 && edgeDominanceFraction >= 0.48) {
    carburizingRegime = "BOOST_PHASE";
  } else if (gammaFieldOk && surfaceEstablishedProxy >= 0.3) {
    carburizingRegime = "SURFACE_EQUILIBRATION";
  } else if (gammaFieldOk) {
    carburizingRegime = "TEMPERATURE_RAMP";
  } else {
    carburizingRegime = "PRE_CARBURIZE";
  }

  // Verdict selection.
  let carburizingVerdict: string;
  if (priorPeakDrivingForce < GAMMA_FIELD_MIN * 0.8) {
    carburizingVerdict = "NO_CARBURIZING_DRIVE";
  } else if (carburizingRegime === "FULLY_CARBURIZED") {
    carburizingVerdict = "QUENCH_READY";
  } else if (carburizingRegime === "OVER_CARBURIZED") {
    carburizingVerdict = "OVER_CARBURIZED";
  } else if (carburizingRegime === "DECARBURIZATION") {
    carburizingVerdict = "DECARBURIZATION";
  } else if (carburizingRegime === "UNEVEN_CARBURIZATION") {
    carburizingVerdict = "UNEVEN_CARBURIZATION";
  } else if (carburizingRegime === "SUB_GAMMA_FIELD") {
    carburizingVerdict = "SUB_GAMMA_FIELD";
  } else if (carburizingRegime === "OVER_GAMMA_FIELD") {
    carburizingVerdict = "OVER_GAMMA_FIELD";
  } else if (carburizingRegime === "EFFECTIVE_CASE") {
    carburizingVerdict = "EFFECTIVE_CASE";
  } else if (carburizingRegime === "DIFFUSE_PHASE") {
    carburizingVerdict = "DIFFUSE_PHASE";
  } else if (carburizingRegime === "BOOST_PHASE") {
    carburizingVerdict = "BOOST_PHASE";
  } else if (carburizingRegime === "SURFACE_EQUILIBRATION") {
    carburizingVerdict = "SURFACE_EQUILIBRATION";
  } else if (carburizingRegime === "TEMPERATURE_RAMP") {
    carburizingVerdict = "TEMPERATURE_RAMP";
  } else if (carburizingRegime === "PRE_CARBURIZE") {
    carburizingVerdict = "PRE_CARBURIZE";
  } else {
    carburizingVerdict = "INTERMEDIATE_CARBURIZING";
  }

  const topBins = [...binRecs]
    .sort((a, b) => b.carburizationDegree - a.carburizationDegree)
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
    gammaFieldOk,
    gammaFieldProximity: r4(gammaFieldProximity),
    subGammaField,
    overGammaField,
    surfaceActivity: r4(surfaceMean),
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
    boostCompletionProxy: r4(boostCompletionProxy),
    diffuseCompletionProxy: r4(diffuseCompletionProxy),
    surfaceEstablishedProxy: r4(surfaceEstablishedProxy),
    uniformityIndex: r4(uniformityIndex),
    reserveCV: r4(reserveCV),
    reserveXFracStdev: r4(reserveXFracStdev),
    carbideRisk: r4(carbideRisk),
    decarburizationRisk: r4(decarburizationRisk),
    unevenCarburizationRisk: r4(unevenCarburizationRisk),
    overGammaRisk: r4(overGammaRisk),
    subGammaRisk: r4(subGammaRisk),
    caseHardnessProxy: r4(caseHardnessProxy),
    coreToughnessProxy: r4(coreToughnessProxy),
    wearResistanceProxy: r4(wearResistanceProxy),
    impactResistanceProxy: r4(impactResistanceProxy),
    caseCoreRatio: r4(caseCoreRatio),
    arrheniusActivation: r4(arrheniusActivation),
    stageProgress: r4(stageProgress),
    dominantStage,
    carburizingIndex,
    carburizingRegime,
    carburizingVerdict,
    stageDistribution,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Carburizing — Doctor ===\n");
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

  const profiles: CarburizingProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeCarburizing(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgCarburizingIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.carburizingIndex)))
      : 0,
    avgDrivingForce: profiles.length > 0 ? r4(avg(profiles.map((p) => p.drivingForce))) : 0,
    avgSurfaceActivity: profiles.length > 0 ? r4(avg(profiles.map((p) => p.surfaceActivity))) : 0,
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
    avgImpactResistanceProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.impactResistanceProxy))) : 0,
    avgCaseThicknessFraction: profiles.length > 0 ? r4(avg(profiles.map((p) => p.caseThicknessFraction))) : 0,
    avgBoostCompletionProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.boostCompletionProxy))) : 0,
    avgDiffuseCompletionProxy: profiles.length > 0 ? r4(avg(profiles.map((p) => p.diffuseCompletionProxy))) : 0,
    avgStageProgress: profiles.length > 0 ? r4(avg(profiles.map((p) => p.stageProgress))) : 0,
    avgCarbideRisk: profiles.length > 0 ? r4(avg(profiles.map((p) => p.carbideRisk))) : 0,
    avgDecarburizationRisk: profiles.length > 0 ? r4(avg(profiles.map((p) => p.decarburizationRisk))) : 0,
    avgUnevenCarburizationRisk: profiles.length > 0 ? r4(avg(profiles.map((p) => p.unevenCarburizationRisk))) : 0,
    gammaFieldOkCount:          profiles.filter((p) => p.gammaFieldOk === 1).length,
    subGammaFieldCount:         profiles.filter((p) => p.subGammaField === 1).length,
    overGammaFieldCount:        profiles.filter((p) => p.overGammaField === 1).length,
    caseThicknessMeetsTargetCount: profiles.filter((p) => p.caseThicknessMeetsTarget === 1).length,
    preCarburizeCount:          profiles.filter((p) => p.carburizingRegime === "PRE_CARBURIZE").length,
    temperatureRampCount:       profiles.filter((p) => p.carburizingRegime === "TEMPERATURE_RAMP").length,
    surfaceEquilibrationCount:  profiles.filter((p) => p.carburizingRegime === "SURFACE_EQUILIBRATION").length,
    boostPhaseCount:            profiles.filter((p) => p.carburizingRegime === "BOOST_PHASE").length,
    diffusePhaseCount:          profiles.filter((p) => p.carburizingRegime === "DIFFUSE_PHASE").length,
    effectiveCaseCount:         profiles.filter((p) => p.carburizingRegime === "EFFECTIVE_CASE").length,
    fullyCarburizedCount:       profiles.filter((p) => p.carburizingRegime === "FULLY_CARBURIZED").length,
    overCarburizedCount:        profiles.filter((p) => p.carburizingRegime === "OVER_CARBURIZED").length,
    unevenCarburizationCount:   profiles.filter((p) => p.carburizingRegime === "UNEVEN_CARBURIZATION").length,
    decarburizationCount:       profiles.filter((p) => p.carburizingRegime === "DECARBURIZATION").length,
    subGammaFieldRegimeCount:   profiles.filter((p) => p.carburizingRegime === "SUB_GAMMA_FIELD").length,
    overGammaFieldRegimeCount:  profiles.filter((p) => p.carburizingRegime === "OVER_GAMMA_FIELD").length,
    noDriveCount:               profiles.filter((p) => p.carburizingRegime === "NO_CARBURIZING_DRIVE").length,
    quenchReadyCount:           profiles.filter((p) => p.carburizingVerdict === "QUENCH_READY").length,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-carburizing").description("HODLMM bin carburizing / thermochemical surface C-diffusion analyzer — hold in γ-field (0.50-0.85 drivingForce analog) with high surface C potential, diffuse C inward per Fick's second law producing an erfc C(x,t) profile; flags fully carburized pools (edge dominance, monotonic erfc gradient, symmetric, within ECD target), as well as over-carburizing (carbide network), decarburization (reverse gradient), uneven carburization (asymmetric edges), and sub/over γ-field conditions");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin carburizing state")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
