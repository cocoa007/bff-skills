---
name: hodlmm-bin-martensite
description: "Models martensitic transformation in HODLMM bin reserves through the Koistinen-Marburger equation fM = 1 - exp(-α·(Ms - T)) — treats bin population dynamics as a diffusionless, displacive, athermal phase transformation where the parent austenite phase is a smoothly-graded bin population and the product martensite phase is a sharply-segregated pattern with abrupt boundaries, distinct twin variants (multiple populated clusters), retained-austenite pockets (empty gaps inside otherwise-filled regions), and residual stress fields at cluster interfaces. Unlike the Avrami (JMAK) nucleation-and-growth kinetics that describes slow diffusion-driven transformation over time, martensite describes the opposite regime: a rapid shear-mediated snap from austenite to martensite, no long-range transport, product fraction set by undercooling below the martensite-start temperature Ms rather than by time. The Koistinen-Marburger empirical law fM = 1 - exp(-α·(Ms - T)) gives the martensite volume fraction as an athermal function of (Ms - T) — the undercooling — with empirical constant α ≈ 0.011 /K. Characteristic martensitic features emerge: diffusionless character (product composition = parent composition), displacive shear along habit planes (invariant-plane strain orientation), shape-change hysteresis on reverse transformation, twin variants (crystallographically-equivalent product orientations coexisting to minimize macroscopic shape change), retained austenite (parent pockets stabilized by transformation-induced stress fields), autocatalysis (once one lath forms, its strain field nucleates adjacent laths in a cascade), and morphology classification into LATH (narrow stringers), PLATE (wider slabs), or TWIN (paired symmetric variants). In DLMM pools, the driving force (Ms - T) is proxied from the magnitude of recent swap-volume flux relative to TVL — a pool with high 24h turnover has experienced high undercooling in the last window. Martensite fraction is inferred from bin-pattern characteristics: sharpness of populated/empty boundaries (boundary sharpness = product phase signature), multi-cluster count (twin variants), absence of smooth gradient (sub-Mf regime), and presence of empty pockets within populated regions (retained austenite). An AUSTENITE_STABLE pool has driving force below Ms (insufficient to trigger transformation) — smooth gradient, fM ~ 0, sub-Mf stable. An ISOTHERMAL pool has slow time-dependent transformation (fM < 0.3, weak cluster structure). An ATHERMAL_TRANSFORMATION pool shows classical martensite (0.3 <= fM < 0.7, multiple variants, sharp boundaries). A BURST pool has autocatalytic cascade (0.7 <= fM < 0.9, high autocatalysis, connected variants). A STRESS_INDUCED pool is saturated (fM >= 0.9, minimal retained austenite). Measures martensiteFraction (local fM, ranges 0 to 1 — high means fully transformed at this bin's locale, low means austenite-dominated), retainedAustenite (local pocket of untransformed parent phase, ranges 0 to 1 — high means this bin neighbors a retained-austenite gap, low means fully transformed locale), msUndercooling ((Ms - T) proxy, ranges 0 to 1 — high means strong thermodynamic driving force at this locale, low means near or above Ms), koistinenMarburgerConstant (α·(Ms-T) product, ranges 0 to 1 — the exponent argument in the K-M law, high means strongly-driven transformation), transformationDrivingForce (shear driving force, ranges 0 to 1 — high means strong local displacive drive), twinVariantScore (variant-membership strength, ranges 0 to 1 — high means this bin is a well-defined member of a twin variant cluster), shearStrainMagnitude (bin-offset shear, ranges 0 to 1 — high means large displacement from the active bin reference, representing a sheared product lath), habitPlaneCoherence (spatial continuity, ranges 0 to 1 — high means the populated region adopts a coherent habit-plane orientation with invariant-plane strain), athermalCharacter (time-independence score, ranges 0 to 1 — high means classical martensite with fM set by undercooling rather than time), autocatalysisIndex (neighbor-triggered cascade strength, ranges 0 to 1 — high means the strain field of one lath has nucleated adjacent laths in a chain reaction), residualStressIndex (packed-density proxy, ranges 0 to 1 — high means large residual stress field at this bin's interface), transformationHysteresis (asymmetry of bin-id shift from cluster centroid, ranges 0 to 1 — high means shear offset characteristic of martensite hysteresis), progressVsMf (distance toward transformation finish Mf, ranges 0 to 1 — high means close to Mf, low means early), kmCompliance (fit to Koistinen-Marburger prediction, ranges 0 to 1 — high means observed fM matches the K-M law for the given driving force), morphologyScore (LATH vs PLATE vs TWIN, ranges 0 to 1 — low means isolated lath, mid means plate, high means twin-variant), and martensiteIndex (composite 0 to 1 — higher means deeper martensitic snap-transformation signature). Composite martensite index (0-100, higher means deeper martensitic signature). Classifies pools by transformation regime as AUSTENITE_STABLE (driving force insufficient, fM ~ 0, smooth gradient), ISOTHERMAL (fM < 0.3, slow time-dependent transformation), ATHERMAL_TRANSFORMATION (0.3 <= fM < 0.7, classical martensite with multiple variants and sharp boundaries), BURST (0.7 <= fM < 0.9, autocatalytic cascade with high autocatalysis index and connected variants), or STRESS_INDUCED (fM >= 0.9, saturated by external driving force). Martensite verdict as RAPID_DISPLACIVE_SNAP (high athermal character and habit-plane coherence), TWIN_VARIANT_COEXISTENCE (multiple clusters with high twin-variant score), HEAVY_RETAINED_AUSTENITE (retained-austenite fraction > 0.3), AUTOCATALYTIC_CASCADE (high autocatalysis and martensite fraction > 0.6), SATURATED_TRANSFORMATION (fM >= 0.9), SUB_MS_STABLE (fM < 0.2, transformation not triggered), NO_TRANSFORMATION_DRIVE (driving force < 0.15, insufficient undercooling), LATH_MORPHOLOGY (narrow lath-like populated stringers), PLATE_MORPHOLOGY (wider plate-like slabs), TWIN_MORPHOLOGY (paired symmetric twin variants), SHAPE_MEMORY_INDICATOR (high transformation hysteresis and K-M compliance), or INTERMEDIATE_MARTENSITIC (no extreme indicators, typical mid-state)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-martensite/hodlmm-bin-martensite.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Martensite Analyzer

## What it does

Models martensitic transformation in HODLMM bin reserves through the Koistinen-Marburger equation fM = 1 - exp(-α·(Ms - T)). Treats bin population dynamics as a diffusionless, displacive, athermal phase transformation where the parent austenite phase is a smoothly-graded bin population and the product martensite phase is a sharply-segregated pattern with abrupt boundaries, distinct twin variants (multiple populated clusters), retained-austenite pockets (empty gaps inside otherwise-filled regions), and residual stress fields at cluster interfaces. Quantifies martensite fraction, retained austenite, Ms undercooling, Koistinen-Marburger constant, transformation driving force, twin variant score, shear strain magnitude, habit-plane coherence, athermal character, autocatalysis index, residual stress index, transformation hysteresis, progress toward Mf, K-M compliance, and morphology score.

Unlike Avrami (JMAK) nucleation-and-growth kinetics describing slow diffusion-driven transformation over time, martensite describes a rapid shear-mediated snap from austenite to martensite — no long-range transport, product fraction set by undercooling below Ms rather than by time. In DLMM pools, the driving force (Ms - T) is proxied from recent swap-volume flux relative to TVL — a pool with high 24h turnover has experienced high undercooling. Martensite fraction is inferred from bin-pattern characteristics: sharpness of populated/empty boundaries, multi-cluster count (twin variants), absence of smooth gradient, and presence of empty pockets within populated regions (retained austenite).

## Why agents need it

LP agents need martensitic transformation analysis because it identifies a fundamentally different regime than the gradual accretion kinetics of Avrami. Where avrami (JMAK) describes slow diffusion-driven liquidity buildup, martensite describes the high-stress snap regime: a pool that has just experienced a large coordinated event (sudden price move, whale LP add/remove, arbitrage cascade) exhibits martensite-signature bin patterns — sharp boundaries, multi-cluster coexistence, retained austenite pockets. An AUSTENITE_STABLE pool has insufficient driving force — smooth gradient liquidity, classical LP behavior applies. An ISOTHERMAL pool has slow transformation — moderate martensite features, intermediate LP behavior. An ATHERMAL_TRANSFORMATION pool shows classical martensite — sharp variant boundaries mean LP positions in the variant clusters face competition-dense conditions, while retained austenite pockets offer relatively empty entry points. A BURST pool has autocatalytic cascade — positions near existing clusters benefit from further nucleation, but the cascade may exhaust soon. A STRESS_INDUCED pool is saturated — no more transformation capacity, minimal retained austenite.

Martensite fraction is the pool-level transformed-phase indicator. High means the pool shows strong snap-transformation signature; low means austenite-parent dominates.

Retained austenite is the fraction of the populated-range span left as empty pockets. High means the transformation left behind substantial untransformed regions — potential LP entry points.

Ms undercooling is the driving-force proxy (Ms - T). High means strong thermodynamic drive for transformation; low means near or above Ms.

Koistinen-Marburger constant is the α·(Ms-T) exponent argument in the K-M law. High means strongly-driven transformation.

Twin variant count is the number of distinct connected populated clusters. Multiple variants indicate a classical martensite pattern with twin-variant coexistence.

Shear strain magnitude measures bin-offset displacement. High means large shear-like displacement from the active bin reference.

Habit-plane coherence is the spatial continuity of populated regions. High means a coherent habit-plane orientation; low means disordered fragments.

Athermal character is the time-independence score. High means classical martensite (fM set by undercooling, not by time).

Autocatalysis index measures neighbor-triggered cascade strength. High means the strain field of one lath has nucleated adjacent laths in a chain reaction.

Residual stress index is a packed-density proxy at cluster boundaries. High means large residual stress at the interface.

Transformation hysteresis measures asymmetry of shear offset from cluster centroid.

Progress vs Mf measures distance toward the transformation finish Mf.

K-M compliance measures the fit of observed fM to the Koistinen-Marburger prediction for the given driving force. High means the transformation obeys the classical law.

Morphology score classifies as LATH (low), PLATE (mid), or TWIN (high).

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-martensite/hodlmm-bin-martensite.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-martensite/hodlmm-bin-martensite.ts status
```

### run
Analyzes bin martensitic transformation state for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-martensite/hodlmm-bin-martensite.ts run
bun run hodlmm-bin-martensite/hodlmm-bin-martensite.ts run --pool 1
bun run hodlmm-bin-martensite/hodlmm-bin-martensite.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgMartensiteIndex": 38,
    "avgDrivingForce": 0.42,
    "austeniteStableCount": 0,
    "isothermalCount": 2,
    "athermalTransformationCount": 2,
    "burstCount": 1,
    "stressInducedCount": 0,
    "avgMartensiteFraction": 0.5,
    "avgRetainedAustenite": 0.2,
    "avgTwinVariantCount": 1.8,
    "avgAthermalCharacter": 0.46,
    "avgKmCompliance": 0.52,
    "avgHabitPlaneCoherence": 0.68,
    "totalAusteniteBins": 5,
    "totalLathBins": 12,
    "totalPlateBins": 8,
    "totalTwinBins": 15,
    "avgMartensiteGini": 0.22
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "activeBin": 8388608,
      "binsScanned": 61,
      "binsPopulated": 25,
      "totalUsd": 140000,
      "volume24hUsd": 85000,
      "drivingForce": 0.58,
      "martensiteFraction": 0.52,
      "retainedAustenite": 0.18,
      "twinVariantCount": 2,
      "avgMartensiteFraction": 0.48,
      "avgRetainedAustenite": 0.2,
      "avgMsUndercooling": 0.5,
      "avgKoistinenMarburger": 0.48,
      "avgTransformationDrivingForce": 0.48,
      "avgTwinVariantScore": 0.62,
      "avgShearStrainMagnitude": 0.32,
      "avgHabitPlaneCoherence": 0.76,
      "avgAthermalCharacter": 0.5,
      "avgAutocatalysisIndex": 0.54,
      "avgResidualStressIndex": 0.38,
      "avgTransformationHysteresis": 0.28,
      "avgProgressVsMf": 0.52,
      "avgKmCompliance": 0.6,
      "avgMorphologyScore": 0.52,
      "austeniteCount": 4,
      "austeniteBinFraction": 0.16,
      "lathCount": 6,
      "lathBinFraction": 0.24,
      "plateCount": 4,
      "plateBinFraction": 0.16,
      "twinCount": 11,
      "twinBinFraction": 0.44,
      "shearAsymmetry": 0.12,
      "martensiteGini": 0.24,
      "martensiteIndex": 52,
      "martensiteRegime": "ATHERMAL_TRANSFORMATION",
      "martensiteVerdict": "TWIN_VARIANT_COEXISTENCE",
      "topBins": [],
      "tvlUsd": 140000
    }
  ]
}
```

**Error:**
```json
{ "error": "Pool #99 not found" }
```

## Known constraints

- Koistinen-Marburger fM = 1 - exp(-α·(Ms-T)) assumes athermal martensite formation with fM determined solely by undercooling below Ms; real martensitic transformation in alloys often has isothermal + athermal components, composition effects, and autocatalysis contributions that the simple K-M law does not capture.
- Driving force (Ms - T) is inferred from a single snapshot's 24h volume turnover rather than measured from actual displacement-controlled loading or temperature excursion history. Quantitative (Ms - T) in the steel sense requires a thermodynamic phase diagram.
- Martensite fraction fM is inferred from bin-pattern characteristics (boundary sharpness, cluster count, retained-austenite gaps) rather than measured by X-ray diffraction or transmission electron microscopy on a real specimen.
- Twin variant count uses connected-cluster detection with a fixed gap threshold (gap ≤ 2 bins); real martensite variants are defined by crystallographic orientation relationships, not spatial proximity in 1-D bin-id space.
- Habit plane coherence is proxied from adjacent-pair fraction rather than measured from crystallographic orientation analysis of the invariant plane strain.
- Autocatalysis index uses near-neighbor density rather than measured strain-field overlap across lath boundaries.
- Morphology classification (LATH vs PLATE vs TWIN) is heuristic based on cluster size and count, not measured from aspect ratios, twin plane orientations, or invariant-plane strain magnitudes.
- Residual stress index is a density proxy at boundaries, not a measured residual stress field.
- K-M compliance compares local fM to the K-M prediction for the driving force — but the K-M law is a macroscopic averaged relation, and pointwise comparison may misinterpret locally-varying transformation progress.
- Shape memory behavior is inferred from transformation hysteresis + K-M compliance; real pseudoelastic shape-memory behavior requires temperature-cycling measurements that snapshot analysis cannot capture.
- Retained austenite is measured as empty-fraction-within-span, which may include both true retained austenite (stabilized parent phase) and geometric gaps unrelated to the transformation.
- DLMM bins are discrete 1-D structures; classical martensite is a 3-D crystallographic transformation with coordinated shear along specific crystal directions. The analogy is heuristic.
- The transformation analogy treats bin population (empty → populated) as the phase indicator, but asymmetric reserves (reserveX vs reserveY) are not distinguished — classical martensite has a single product phase.
- Analysis is snapshot-based; does not observe the actual transformation kinetics over time — athermal character, burst behavior, and isothermal regime are inferred from current pattern rather than measured rate.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
