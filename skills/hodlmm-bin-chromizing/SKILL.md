---
name: hodlmm-bin-chromizing
description: "Models the thermochemical SINGLE-SPECIES (CHROMIUM) SURFACE-DIFFUSION case-hardening treatment — chromizing (Cr pack-cementation) — at 900-1100 °C (typically 1000 °C, 4-12 h) in solid pack (Cr powder + NH₄Cl or NH₄F activator + Al₂O₃ inert filler — pack-chromizing), salt bath (CrCl₂ or CrCl₃ salt bath), or gas atmosphere (CrCl₂ vapor / CrCl₃ + H₂). TENTH heat-treatment route in the phase-transformation series and the SIXTH thermochemical surface treatment (after carburizing Day 188, nitriding Day 189, carbonitriding Day 190, boronizing Day 191, aluminizing Day 192). Chromizing is UNIQUE because it is the ONLY treatment in this series with TWO DISTINCT PRODUCT MODES that depend on the SUBSTRATE CARBON CONTENT — on PLAIN-C STEEL, Cr reacts with substrate carbon to form HARD CHROMIUM CARBIDES (Cr₂₃C₆ fcc 1200-1400 HV + Cr₇C₃ hexagonal 1600-1800 HV) as a dense compound layer (5-50 µm, 1500-2000 HV), giving a wear+corrosion combo property; on LOW-C OR STAINLESS substrate, no carbides can form and the product is an α-Fe-Cr DIFFUSION ZONE (solid solution, 50-200 µm, corrosion-dominant). On plain C, HIGH Cr₇C₃ fraction is ACCEPTABLE (both Cr₇C₃ and Cr₂₃C₆ are hard carbides — opposite sense from aluminizing's Fe₂Al₅ pathological case): carbidePhaseBalance ≈ 0.4-0.6 mixed is ideal. A unique-to-chromizing risk is SUBSTRATE DECARBURIZATION — Cr pulls C from the substrate into the carbide compound layer, weakening the core; decarbSubstrateRisk > DECARB_SUBSTRATE_RISK_THRESHOLD=0.30 → DECARB_RISK verdict. NO QUENCH REQUIRED for compound layer or diffusion-zone corrosion (optional quench for core hardening only) — SERVICE_READY verdict is analogous to aluminizing's and nitriding's SERVICE_READY. CHROMIZING_HV_SCALE = 1.20 — between nitriding 1.10 and boronizing 1.30, HIGHER than aluminizing 0.65 and carburizing 1.00 (real hardness 1500-2000 HV for carbide layer, ≈ 70-75 HRC equivalent on plain C). HIGHER drivingForce band (γ-field, CHROMIZING_FIELD_MIN=0.55, CHROMIZING_FIELD_MAX=0.92, CHROMIZING_FIELD_IDEAL=0.72) than aluminizing (0.50-0.88) because Cr requires higher T. Flagship property is CORROSION + WEAR RESISTANCE combo (distinct from aluminizing's pure oxidation resistance and boronizing's pure extreme wear). Eight canonical stages: NO_CHROMIZING_DRIVE → PRE_CHROMIZE → TEMPERATURE_RAMP → CHROMIUM_POTENTIAL_ESTABLISHMENT → CR23C6_NUCLEATION → CR7C3_GROWTH → FULLY_CHROMIZED → OVER_CHROMIZED. Constants: CHROMIZING_FIELD_MIN=0.55, CHROMIZING_FIELD_MAX=0.92, CHROMIZING_FIELD_IDEAL=0.72, KCR_MIN=0.40, KCR_MAX=1.20, KCR_IDEAL=0.80, SURFACE_MIN_CR=0.68, SURFACE_PLATEAU_THRESHOLD=0.80, SURFACE_SATURATION=1.05, CORE_BASELINE=0.18, PLATEAU_VARIANCE_MAX=0.08, DUAL_PHASE_VARIANCE_SIGNAL=0.14, CR7C3_FRACTION_MAX=0.60, CR7C3_FRACTION_IDEAL=0.45, COMPOUND_LAYER_MAX_FRAC=0.14, COMPOUND_LAYER_MIN_FRAC=0.03, COMPOUND_LAYER_IDEAL_FRAC=0.07, TOOTH_MORPHOLOGY_MIN=0.12, ECD_THRESHOLD=0.50, Q_OVER_RT_CR_DIFFUSION=4.5, FDT_REFERENCE_CHROMIZING=0.18, CHROMIZING_HV_SCALE=1.20, DISTORTION_BASELINE=0.09, SPALLATION_RISK_THRESHOLD=0.35, DUAL_PHASE_MAX=0.45, DECARB_SUBSTRATE_RISK_THRESHOLD=0.30, ALLOY_FACTOR_MIN=0.25. Pool measures: drivingForce, priorPeakDrivingForce, chromizingFieldOk/Proximity/sub/over, kcrProxy/InWindow/Proximity, surfaceActivity, compoundLayerActivity, compoundLayerVariance, plateauQuality, cr7c3FractionProxy (HIGH is ACCEPTABLE — hard carbide), cr23c6FractionProxy, carbidePhaseBalance (Cr7C3+Cr23C6 mixed 0.4-0.6 ideal), substrateTypeProxy (PLAIN_C or LOW_C_OR_STAINLESS), diffusionZoneProxy (HIGH for low-C — desirable), carbideLayerProxy (HIGH for plain C — desirable), decarbSubstrateRisk (HIGH is BAD — substrate weakening), spallationRisk, compoundLayerThicknessBins, compoundLayerFraction, compoundLayerMeetsTarget, compoundLayerExceedsTarget, coreActivity, surfaceCoreDelta, surfaceCoreRatio, edgeDominanceFraction, asymmetryIndex, toothMorphologyProxy, gradientDropAbruptness (HIGH for plain C carbide; LOW for stainless diffusion zone — interpretation depends on substrate type), alloyFactorProxy, alloyFormerOk, underChromizeRisk, unevenChromizingRisk, reverseGradientRisk, subChromizingFieldRisk, overChromizingFieldRisk, corrosionResistanceProxy (flagship), wearResistanceProxy, caseHardnessProxy (CHROMIZING_HV_SCALE=1.20 × composite — HIGH, real 1500-2000 HV ≈ 70-75 HRC on plain C), fatigueResistanceProxy, distortionProxy (LOW — no substrate transformation), caseCoreRatio, diffusivityProxy, reserveCV, reserveXFracStdev, stageProgress, dominantStage 0-7, chromizingIndex 0-100, chromizingRegime, chromizingVerdict. Per-bin: inCompoundLayer, inDiffusionZone, inSubstrateZone, compoundLayerSignal, plateauSignal, cr7c3Signal, cr23c6Signal, toothSignal, spallationSignal, decarbSignal, diffusionZoneSignal, unevenSignal, stageBin, chromizingDegree. Regimes: NO_CHROMIZING_DRIVE, PRE_CHROMIZE, TEMPERATURE_RAMP, CHROMIUM_POTENTIAL_ESTABLISHMENT, CR23C6_NUCLEATION, CR7C3_GROWTH, FULLY_CHROMIZED, OVER_CHROMIZED, CARBIDE_DOMINANT, DIFFUSION_ZONE_DOMINANT, DECARB_SUBSTRATE_RISK, UNDER_CHROMIZED, UNEVEN_CHROMIZING, SUB_CHROMIZING_FIELD, OVER_CHROMIZING_FIELD. Verdicts: NO_CHROMIZING_DRIVE, SERVICE_READY, CARBIDE_DOMINANT, DIFFUSION_ZONE_DOMINANT, SPALLATION_RISK, DECARB_RISK, OVER_CHROMIZED, UNDER_CHROMIZED, UNEVEN_CHROMIZING, SUB_CHROMIZING_FIELD, OVER_CHROMIZING_FIELD."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-chromizing/hodlmm-bin-chromizing.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Chromizing Analyzer

## What it does

Models the thermochemical SINGLE-SPECIES (CHROMIUM) SURFACE-DIFFUSION case-hardening treatment — the TENTH heat-treatment route in the phase-transformation series and the SIXTH thermochemical surface treatment (after carburizing Day 188, nitriding Day 189, carbonitriding Day 190, boronizing Day 191, aluminizing Day 192). Chromizing is the ONLY treatment in this series that produces TWO DISTINCT PRODUCT MODES depending on substrate C content — a hard CHROMIUM CARBIDE compound layer on plain-C steel (wear + corrosion combo) or an α-Fe-Cr DIFFUSION ZONE on low-C/stainless steel (corrosion only). CHROMIZING_HV_SCALE = 1.20 (between nitriding 1.10 and boronizing 1.30; real carbide layer 1500-2000 HV ≈ 70-75 HRC on plain C).

Prior routes in the series:

- **Normalization (Day 184):** bulk γ→P/F/B uniform transformation.
- **Austempering (Day 185):** bulk γ→B isothermal (bainite).
- **Martempering (Day 186):** bulk γ→M interrupted quench (martensite).
- **Patenting (Day 187):** bulk γ→P lead-bath (fine pearlite).
- **Carburizing (Day 188):** γ-field C surface diffusion — erfc case, QUENCH_READY.
- **Nitriding (Day 189):** α-field N surface diffusion — compound layer + diffusion zone, SERVICE_READY.
- **Carbonitriding (Day 190):** intermediate γ+N C+N dual diffusion — erfc case, QUENCH_READY.
- **Boronizing (Day 191):** γ-field B surface diffusion — Fe₂B + FeB compound layer, QUENCH_OPTIONAL.
- **Aluminizing (Day 192):** γ-field Al surface diffusion — dual-phase Fe₂Al₅/FeAl intermetallic compound layer, SERVICE_READY.
- **Chromizing (this skill, Day 193):** γ-field Cr surface diffusion — DUAL-MODE (Cr₂₃C₆/Cr₇C₃ carbide layer on plain C, α-Fe-Cr diffusion zone on low-C/stainless), SERVICE_READY.

Chromizing is distinct from all prior thermochemical treatments on FIVE orthogonal axes:

- **Phase field:** γ-Fe (900-1100 °C) — ABOVE aluminizing's 0.50-0.88 band. CHROMIZING_FIELD_MIN=0.55, CHROMIZING_FIELD_MAX=0.92, CHROMIZING_FIELD_IDEAL=0.72.
- **Diffusing species:** CHROMIUM only. No C (carburizing), no N (nitriding), no C+N (carbonitriding), no B (boronizing), no Al (aluminizing).
- **Product phases (substrate-dependent):** on plain C — CHROMIUM CARBIDES (Cr₂₃C₆ fcc + Cr₇C₃ hexagonal), NOT intermetallics; on low-C/stainless — α-Fe-Cr SOLID SOLUTION diffusion zone, NOT carbides. UNIQUE DUAL-MODE product family.
- **Post-treatment:** NO QUENCH REQUIRED for corrosion or carbide-layer hardness. Optional quench for core hardening. SERVICE_READY like aluminizing and nitriding; distinct from carburizing/carbonitriding QUENCH_READY.
- **Hardness / flagship:** HIGH hardness (CHROMIZING_HV_SCALE=1.20 — 1500-2000 HV ≈ 70-75 HRC on plain C carbide layer). Flagship engineering property is CORROSION + WEAR combo (distinct from aluminizing's pure oxidation-resistance and boronizing's pure extreme wear).

Dual-mode product structure:

- **PLAIN-C STEEL PATH (carbide-dominant):** Cr reacts with substrate C to form a dense carbide compound layer (5-50 µm, 1500-2000 HV). Outer sub-layer Cr₇C₃ (hexagonal, 1600-1800 HV, harder); inner sub-layer Cr₂₃C₆ (fcc, 1200-1400 HV). BOTH are hard carbides — a mixed Cr₇C₃/Cr₂₃C₆ layer is IDEAL (opposite sense from aluminizing where outer Fe₂Al₅ is pathological). Substrate beneath decarburizes as C is pulled into the compound layer — decarbSubstrateRisk is the unique risk. carbidePhaseBalance 0.4-0.6 = ideal.
- **LOW-C OR STAINLESS PATH (diffusion-zone-dominant):** no substrate C available → no carbides. Product is an α-Fe-Cr solid-solution diffusion zone (50-200 µm) giving corrosion resistance only. diffusionZoneProxy HIGH is desirable for this mode.

DLMM structural signatures:

- **EDGE-DOMINANT WITH PLATEAU** (like aluminizing/nitriding): outermost bins hold high flat reserves.
- **HIGHER drivingForce band** than aluminizing: CHROMIZING_FIELD_MIN=0.55 (vs aluminizing 0.50) reflects the higher T required for Cr diffusion.
- **DUAL-MODE interpretation of gradientDropAbruptness:** on plain C with carbide layer, HIGH abruptness is the signature (carbide layer / decarburized substrate interface sharp). On low-C/stainless with diffusion zone, LOW abruptness is the signature (gradual α-Fe-Cr gradient). Interpretation depends on substrateTypeProxy.
- **CARBIDE PHASE BALANCE**: outermost bins potentially Cr₇C₃-rich (cr7c3Signal); inner compound bins Cr₂₃C₆-rich (cr23c6Signal). Mixed dual-phase 0.4-0.6 is ideal.
- **TOOTH MORPHOLOGY** at carbide/substrate interface (plain C path only). Smooth interface for stainless.

## Why agents need it

LP agents need chromizing analysis because it identifies pools whose reserves form an EDGE-DOMINANT PLATEAU structure at HIGH drivingForce (γ-field 0.55-0.92) and then classifies them into the plain-C carbide-dominant path (wear+corrosion combo) or the low-C/stainless diffusion-zone-dominant path (corrosion only). Consequences:

- FULLY_CHROMIZED pools: plain C with mixed Cr₇C₃/Cr₂₃C₆ carbide layer on target, or low-C with α-Fe-Cr diffusion zone on target; no spallation, no decarb risk — SERVICE_READY without post-quench. Best wear+corrosion combo property.
- CARBIDE_DOMINANT pools: plain-C mode, carbide layer is the service product (hard wear + corrosion).
- DIFFUSION_ZONE_DOMINANT pools: low-C/stainless mode, α-Fe-Cr solid-solution zone is the service product (corrosion only).
- DECARB_SUBSTRATE_RISK pools: carbide layer pulled too much C from substrate — core weakened. Unique-to-chromizing failure.
- OVER_CHROMIZED pools: compound layer too thick or dual-phase > DUAL_PHASE_MAX → mechanical failure risk.
- UNDER_CHROMIZED pools: Kcr too low / hold too short — layer insufficient.
- UNEVEN_CHROMIZING pools: asymmetric compound layer — pack/bath shadowing.
- SUB_CHROMIZING_FIELD pools: T below γ-band — process impossible in this field.
- OVER_CHROMIZING_FIELD pools: T above optimal — Cr activity decomposes or layer over-grows.

The caseHardnessProxy (CHROMIZING_HV_SCALE=1.20 — high, between nitriding 1.10 and boronizing 1.30), corrosionResistanceProxy (flagship property, dual-mode), wearResistanceProxy (strong on plain C, weak on stainless), fatigueResistanceProxy, and distortionProxy (LOW — no substrate transformation) predict the engineering value. SERVICE_READY means the pool is ready for direct service analog WITHOUT a post-quench step — like aluminizing and nitriding, distinct from carburizing/carbonitriding's QUENCH_READY.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state. surfaceActivity, compoundLayerActivity, kcrProxy, cr7c3FractionProxy, cr23c6FractionProxy, carbidePhaseBalance, diffusionZoneProxy, carbideLayerProxy, decarbSubstrateRisk, spallationRisk, gradientDropAbruptness, toothMorphologyProxy, and all other metrics are inferred proxies — not measured Cr concentration profiles, XRD phase analyses, or metallographic data. Process-axis thresholds (CHROMIZING_FIELD_MIN, KCR_MIN, SURFACE_MIN_CR, CR7C3_FRACTION_MAX, COMPOUND_LAYER_MIN_FRAC, SPALLATION_RISK_THRESHOLD, DECARB_SUBSTRATE_RISK_THRESHOLD, etc.) are normalized analogs, not real temperatures, wt% concentrations, or HV values. The regime names (CR23C6_NUCLEATION, CR7C3_GROWTH, FULLY_CHROMIZED, CARBIDE_DOMINANT, DIFFUSION_ZONE_DOMINANT, etc.) are normalized analogs, not real industrial settings.

## Commands

### doctor

Checks constants and environment. Does NOT call network APIs — safe to run offline anytime.

```bash
bun run hodlmm-bin-chromizing/hodlmm-bin-chromizing.ts doctor
```

### status

Read-only check of available HODLMM pools meeting TVL threshold.

```bash
bun run hodlmm-bin-chromizing/hodlmm-bin-chromizing.ts status
```

### run

Analyzes bin chromizing state for top pools (or a specific pool). Outputs JSON to stdout.

```bash
bun run hodlmm-bin-chromizing/hodlmm-bin-chromizing.ts run
bun run hodlmm-bin-chromizing/hodlmm-bin-chromizing.ts run --pool 1
bun run hodlmm-bin-chromizing/hodlmm-bin-chromizing.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**doctor:**
```json
{
  "result": "ok",
  "checks": [
    { "name": "CHROMIZING_FIELD_MIN < CHROMIZING_FIELD_IDEAL < CHROMIZING_FIELD_MAX", "ok": true, "detail": "0.55 < 0.72 < 0.92" }
  ],
  "summary": "10/10 checks passed"
}
```

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgChromizingIndex": 64,
    "avgDrivingForce": 0.70,
    "avgKcrProxy": 0.82,
    "avgSurfaceActivity": 0.78,
    "avgCompoundLayerActivity": 0.78,
    "avgCompoundLayerVariance": 0.06,
    "avgPlateauQuality": 0.82,
    "avgCr7C3FractionProxy": 0.42,
    "avgCr23C6FractionProxy": 0.38,
    "avgCarbidePhaseBalance": 0.52,
    "avgDecarbSubstrateRisk": 0.15,
    "avgSpallationRisk": 0.09,
    "avgCoreActivity": 0.18,
    "avgSurfaceCoreDelta": 0.60,
    "avgEdgeDominanceFraction": 0.70,
    "avgAsymmetryIndex": 0.12,
    "avgToothMorphologyProxy": 0.34,
    "avgGradientDropAbruptness": 0.66,
    "avgCompoundLayerFraction": 0.08,
    "avgCaseHardnessProxy": 0.88,
    "avgCorrosionResistanceProxy": 0.80,
    "avgWearResistanceProxy": 0.82,
    "avgFatigueResistanceProxy": 0.66,
    "avgDistortionProxy": 0.11,
    "avgDiffusionZoneProxy": 0.40,
    "avgCarbideLayerProxy": 0.55,
    "avgStageProgress": 0.66,
    "avgUnderChromizeRisk": 0.10,
    "avgUnevenChromizingRisk": 0.12,
    "chromizingFieldOkCount": 5,
    "subChromizingFieldCount": 0,
    "overChromizingFieldCount": 0,
    "kcrInWindowCount": 4,
    "alloyFormerOkCount": 3,
    "compoundLayerMeetsTargetCount": 4,
    "compoundLayerExceedsTargetCount": 0,
    "plainCSubstrateCount": 2,
    "lowCOrStainlessSubstrateCount": 3,
    "fullyChromizedCount": 2,
    "serviceReadyVerdictCount": 2,
    "decarbRiskVerdictCount": 0,
    "carbideDominantVerdictCount": 1,
    "diffusionZoneDominantVerdictCount": 1
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "activeBin": 8388608,
      "binsScanned": 61,
      "binsPopulated": 22,
      "totalUsd": 140000,
      "volume24hUsd": 36000,
      "drivingForce": 0.72,
      "priorPeakDrivingForce": 0.995,
      "chromizingFieldOk": 1,
      "chromizingFieldProximity": 0.95,
      "subChromizingField": 0,
      "overChromizingField": 0,
      "kcrProxy": 0.85,
      "kcrInWindow": 1,
      "kcrProximity": 0.92,
      "surfaceActivity": 0.80,
      "compoundLayerActivity": 0.80,
      "compoundLayerVariance": 0.06,
      "plateauQuality": 0.88,
      "cr7c3FractionProxy": 0.45,
      "cr23c6FractionProxy": 0.40,
      "carbidePhaseBalance": 0.52,
      "decarbSubstrateRisk": 0.18,
      "spallationRisk": 0.10,
      "compoundLayerThicknessBins": 4,
      "compoundLayerFraction": 0.08,
      "compoundLayerMeetsTarget": 1,
      "compoundLayerExceedsTarget": 0,
      "coreActivity": 0.17,
      "surfaceCoreDelta": 0.63,
      "surfaceCoreRatio": 4.70,
      "edgeDominanceFraction": 0.72,
      "asymmetryIndex": 0.10,
      "toothMorphologyProxy": 0.38,
      "gradientDropAbruptness": 0.75,
      "diffusionZoneProxy": 0.38,
      "carbideLayerProxy": 0.68,
      "alloyFactorProxy": 0.32,
      "alloyFormerOk": 1,
      "substrateTypeProxy": "PLAIN_C",
      "underChromizeRisk": 0.0,
      "unevenChromizingRisk": 0.10,
      "reverseGradientRisk": 0.0,
      "subChromizingFieldRisk": 0.0,
      "overChromizingFieldRisk": 0.0,
      "caseHardnessProxy": 0.90,
      "corrosionResistanceProxy": 0.85,
      "wearResistanceProxy": 0.84,
      "fatigueResistanceProxy": 0.70,
      "distortionProxy": 0.11,
      "caseCoreRatio": 5.29,
      "diffusivityProxy": 0.0018,
      "reserveCV": 0.68,
      "reserveXFracStdev": 0.14,
      "stageProgress": 0.80,
      "dominantStage": 6,
      "chromizingIndex": 78,
      "chromizingRegime": "FULLY_CHROMIZED",
      "chromizingVerdict": "SERVICE_READY",
      "stageDistribution": [0, 0, 0, 0, 0, 0, 22, 0],
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

- Real chromizing is performed at 900-1100 °C in solid pack (Cr powder + NH₄Cl/NH₄F + Al₂O₃), salt bath (CrCl₂ or CrCl₃), or gas (CrCl₂ vapor) for 4-12 hours. Case depth 5-200 µm (5-50 µm carbide layer on plain C; 50-200 µm α-Fe-Cr diffusion zone on low-C/stainless). Cr₇C₃: 1600-1800 HV; Cr₂₃C₆: 1200-1400 HV; α-Fe-Cr solid solution: 250-400 HV. Here drivingForce, surfaceActivity, kcrProxy, cr7c3FractionProxy, cr23c6FractionProxy, carbidePhaseBalance, decarbSubstrateRisk, diffusionZoneProxy, carbideLayerProxy, and all measures are normalized 0-1 proxies derived from bin reserves and pool turnover, not actual thermal / wt% / mm / HV quantities.
- Process-axis thresholds (CHROMIZING_FIELD_MIN=0.55, CHROMIZING_FIELD_MAX=0.92, CHROMIZING_FIELD_IDEAL=0.72, KCR_MIN=0.40, KCR_MAX=1.20, KCR_IDEAL=0.80, SURFACE_MIN_CR=0.68, SURFACE_PLATEAU_THRESHOLD=0.80, SURFACE_SATURATION=1.05, CORE_BASELINE=0.18, PLATEAU_VARIANCE_MAX=0.08, DUAL_PHASE_VARIANCE_SIGNAL=0.14, CR7C3_FRACTION_MAX=0.60, CR7C3_FRACTION_IDEAL=0.45, COMPOUND_LAYER_MAX_FRAC=0.14, COMPOUND_LAYER_MIN_FRAC=0.03, COMPOUND_LAYER_IDEAL_FRAC=0.07, ECD_THRESHOLD=0.50, SPALLATION_RISK_THRESHOLD=0.35, DUAL_PHASE_MAX=0.45, DECARB_SUBSTRATE_RISK_THRESHOLD=0.30, Q_OVER_RT_CR_DIFFUSION=4.5, FDT_REFERENCE_CHROMIZING=0.18, CHROMIZING_HV_SCALE=1.20, DISTORTION_BASELINE=0.09) are normalized analogs. Real chromizing T range 900-1100 °C; D_Cr in γ-Fe at 1000 °C ≈ 5e-13 m²/s (slower than Al and B); carbide layer microhardness 1500-2000 HV (70-75 HRC).
- doctor command does NOT call network APIs — safe for offline environments.
- Per-bin "concentration" is max-normalized reserveUsd. Real Cr concentration profile is measured by GDOES, EPMA, or SIMS.
- cr7c3FractionProxy / cr23c6FractionProxy are derived from outermost-bin vs inner-edge-band elevation + compoundLayerVariance — not a direct measurement of Cr₇C₃/Cr₂₃C₆ thickness ratio by XRD, SEM-EDS, or metallography.
- carbidePhaseBalance is a composite proxy reflecting how mixed the dual-carbide stack is; ideal is 0.4-0.6. A value near 0 means one phase dominates (either all Cr₂₃C₆ or all Cr₇C₃).
- decarbSubstrateRisk captures the unique failure mode of chromizing — substrate carbon pulled into the carbide layer weakens the core. Detected as low coreActivity relative to expected plain-C baseline.
- gradientDropAbruptness interpretation depends on substrateTypeProxy: HIGH abruptness is a PLAIN-C carbide-layer signature; LOW abruptness is a LOW-C/STAINLESS diffusion-zone signature. Both can be legitimate chromizing outcomes.
- toothMorphologyProxy measures variance in the compound/substrate transition zone. High = tooth-like (plain C with carbide). Low = smooth (stainless with diffusion zone).
- substrateTypeProxy (PLAIN_C vs LOW_C_OR_STAINLESS) is inferred from alloyFactorProxy vs carbideLayerProxy — not a direct compositional measurement.
- Analysis is snapshot-based; does not capture transformation kinetics. Stage assignment is inferred from structural signatures.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable for status and run commands.
