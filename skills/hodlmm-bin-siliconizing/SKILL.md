---
name: hodlmm-bin-siliconizing
description: "Models the thermochemical SINGLE-SPECIES (SILICON) SURFACE-DIFFUSION case-hardening treatment — siliconizing (Si pack-cementation) — at 900-1100 °C (typically 1000 °C, 4-12 h) in solid pack (Si powder + NH₄Cl or NH₄F activator + Al₂O₃ inert filler — pack-siliconizing), salt bath (SiCl₄ or SiCl₄ salt bath), or gas atmosphere (SiCl₄ vapor / SiCl₄ + H₂). TENTH heat-treatment route in the phase-transformation series and the SIXTH thermochemical surface treatment (after carburizing Day 188, nitriding Day 189, carbonitriding Day 190, boronizing Day 191, aluminizing Day 192). Siliconizing is UNIQUE because it is the ONLY treatment in this series with TWO DISTINCT PRODUCT MODES that depend on the SUBSTRATE CARBON CONTENT — on PLAIN-C STEEL, Si reacts with substrate carbon to form HARD IRON SILICIDES (Fe₃Si fcc 1200-1400 HV + FeSi hexagonal 1600-1800 HV) as a dense compound layer (5-50 µm, 900-1200 HV), giving a wear+corrosion combo property; on LOW-C OR STAINLESS substrate, no carbides can form and the product is an α-Fe(Si) DIFFUSION ZONE (solid solution, 50-200 µm, corrosion-dominant). On plain C, HIGH FeSi fraction is ACCEPTABLE (both FeSi and Fe₃Si are hard silicides — opposite sense from aluminizing's Fe₂Al₅ pathological case): silicidePhaseBalance ≈ 0.4-0.6 mixed is ideal. A unique-to-siliconizing risk is SUBSTRATE SI-EMBRITTLATION — Si pulls C from the substrate into the carbide compound layer, weakening the core; embrittlementRisk > EMBRITTLEMENT_RISK_THRESHOLD=0.30 → EMBRITTLEMENT_RISK verdict. NO QUENCH REQUIRED for compound layer or diffusion-zone corrosion (optional quench for core hardening only) — SERVICE_READY verdict is analogous to aluminizing's and nitriding's SERVICE_READY. SILICONIZING_HV_SCALE = 0.80 — between aluminizing 0.65 and carburizing 1.00, HIGHER than aluminizing 0.65 and carburizing 1.00 (real hardness 900-1200 HV for silicide layer, ≈ 60-65 HRC equivalent on plain C). HIGHER drivingForce band (γ-field, SILICONIZING_FIELD_MIN=0.55, SILICONIZING_FIELD_MAX=0.92, SILICONIZING_FIELD_IDEAL=0.72) than aluminizing (0.50-0.88) because Si requires higher T. Flagship property is CORROSION + WEAR RESISTANCE combo (distinct from aluminizing's pure oxidation resistance and boronizing's pure extreme wear). Eight canonical stages: NO_SILICONIZING_DRIVE → PRE_SILICONIZE → TEMPERATURE_RAMP → SILICON_POTENTIAL_ESTABLISHMENT → FE3SI_NUCLEATION → FESI_GROWTH → FULLY_SILICONIZED → OVER_SILICONIZED. Constants: SILICONIZING_FIELD_MIN=0.55, SILICONIZING_FIELD_MAX=0.92, SILICONIZING_FIELD_IDEAL=0.72, KSI_MIN=0.40, KSI_MAX=1.20, KSI_IDEAL=0.80, SURFACE_MIN_SI=0.68, SURFACE_PLATEAU_THRESHOLD=0.80, SURFACE_SATURATION=1.05, CORE_BASELINE=0.18, PLATEAU_VARIANCE_MAX=0.08, DUAL_PHASE_VARIANCE_SIGNAL=0.14, FESI_FRACTION_MAX=0.60, FESI_FRACTION_IDEAL=0.45, COMPOUND_LAYER_MAX_FRAC=0.14, COMPOUND_LAYER_MIN_FRAC=0.03, COMPOUND_LAYER_IDEAL_FRAC=0.07, TOOTH_MORPHOLOGY_MIN=0.12, ECD_THRESHOLD=0.50, Q_OVER_RT_SI_DIFFUSION=4.5, FDT_REFERENCE_SILICONIZING=0.18, SILICONIZING_HV_SCALE=0.80, DISTORTION_BASELINE=0.09, SPALLATION_RISK_THRESHOLD=0.35, DUAL_PHASE_MAX=0.45, EMBRITTLEMENT_RISK_THRESHOLD=0.30, ALLOY_FACTOR_MIN=0.25. Pool measures: drivingForce, priorPeakDrivingForce, siliconizingFieldOk/Proximity/sub/over, ksiProxy/InWindow/Proximity, surfaceActivity, compoundLayerActivity, compoundLayerVariance, plateauQuality, feSiFractionProxy (HIGH is ACCEPTABLE — hard silicide), fe3SiFractionProxy, silicidePhaseBalance (FeSi+Fe3Si mixed 0.4-0.6 ideal), substrateTypeProxy (PLAIN_C or LOW_C_OR_STAINLESS), diffusionZoneProxy (HIGH for low-C — desirable), silicideLayerProxy (HIGH for plain C — desirable), embrittlementRisk (HIGH is BAD — substrate weakening), spallationRisk, compoundLayerThicknessBins, compoundLayerFraction, compoundLayerMeetsTarget, compoundLayerExceedsTarget, coreActivity, surfaceCoreDelta, surfaceCoreRatio, edgeDominanceFraction, asymmetryIndex, toothMorphologyProxy, gradientDropAbruptness (HIGH for plain C carbide; LOW for stainless diffusion zone — interpretation depends on substrate type), alloyFactorProxy, alloyFormerOk, underSiliconizeRisk, unevenSiliconizingRisk, reverseGradientRisk, subSiliconizingFieldRisk, overSiliconizingFieldRisk, corrosionResistanceProxy (flagship), wearResistanceProxy, caseHardnessProxy (SILICONIZING_HV_SCALE=0.80 × composite — HIGH, real 900-1200 HV ≈ 60-65 HRC on plain C), fatigueResistanceProxy, distortionProxy (LOW — no substrate transformation), caseCoreRatio, diffusivityProxy, reserveCV, reserveXFracStdev, stageProgress, dominantStage 0-7, siliconizingIndex 0-100, siliconizingRegime, siliconizingVerdict. Per-bin: inCompoundLayer, inDiffusionZone, inSubstrateZone, compoundLayerSignal, plateauSignal, feSiSignal, fe3SiSignal, toothSignal, spallationSignal, embrittleSignal, diffusionZoneSignal, unevenSignal, stageBin, siliconizingDegree. Regimes: NO_SILICONIZING_DRIVE, PRE_SILICONIZE, TEMPERATURE_RAMP, SILICON_POTENTIAL_ESTABLISHMENT, FE3SI_NUCLEATION, FESI_GROWTH, FULLY_SILICONIZED, OVER_SILICONIZED, SILICIDE_DOMINANT, DIFFUSION_ZONE_DOMINANT, EMBRITTLEMENT_RISK, UNDER_SILICONIZED, UNEVEN_SILICONIZING, SUB_SILICONIZING_FIELD, OVER_SILICONIZING_FIELD. Verdicts: NO_SILICONIZING_DRIVE, SERVICE_READY, SILICIDE_DOMINANT, DIFFUSION_ZONE_DOMINANT, SPALLATION_RISK, EMBRITTLEMENT_RISK, OVER_SILICONIZED, UNDER_SILICONIZED, UNEVEN_SILICONIZING, SUB_SILICONIZING_FIELD, OVER_SILICONIZING_FIELD."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-siliconizing/hodlmm-bin-siliconizing.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Siliconizing Analyzer

## What it does

Models the thermochemical SINGLE-SPECIES (SILICON) SURFACE-DIFFUSION case-hardening treatment — the TENTH heat-treatment route in the phase-transformation series and the SIXTH thermochemical surface treatment (after carburizing Day 188, nitriding Day 189, carbonitriding Day 190, boronizing Day 191, aluminizing Day 192). Siliconizing is the ONLY treatment in this series that produces TWO DISTINCT PRODUCT MODES depending on substrate C content — a hard IRON SILICIDE compound layer on plain-C steel (wear + corrosion combo) or an α-Fe(Si) DIFFUSION ZONE on low-C/stainless steel (corrosion only). SILICONIZING_HV_SCALE = 0.80 (between aluminizing 0.65 and carburizing 1.00; real silicide layer 900-1200 HV ≈ 60-65 HRC on plain C).

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
- **Siliconizing (this skill, Day 194):** γ-field Si surface diffusion — DUAL-MODE (Fe₃Si/FeSi silicide layer on plain C, α-Fe(Si) diffusion zone on low-C/stainless), SERVICE_READY.

Siliconizing is distinct from all prior thermochemical treatments on FIVE orthogonal axes:

- **Phase field:** γ-Fe (900-1100 °C) — ABOVE aluminizing's 0.50-0.88 band. SILICONIZING_FIELD_MIN=0.55, SILICONIZING_FIELD_MAX=0.92, SILICONIZING_FIELD_IDEAL=0.72.
- **Diffusing species:** SILICON only. No C (carburizing), no N (nitriding), no C+N (carbonitriding), no B (boronizing), no Al (aluminizing).
- **Product phases (substrate-dependent):** on plain C — IRON SILICIDES (Fe₃Si fcc + FeSi hexagonal), NOT intermetallics; on low-C/stainless — α-Fe(Si) SOLID SOLUTION diffusion zone, NOT carbides. UNIQUE DUAL-MODE product family.
- **Post-treatment:** NO QUENCH REQUIRED for corrosion or carbide-layer hardness. Optional quench for core hardening. SERVICE_READY like aluminizing and nitriding; distinct from carburizing/carbonitriding QUENCH_READY.
- **Hardness / flagship:** HIGH hardness (SILICONIZING_HV_SCALE=0.80 — 900-1200 HV ≈ 60-65 HRC on plain C silicide layer — real hardness 900-1200 HV at SILICONIZING_HV_SCALE=0.80). Flagship engineering property is CORROSION + WEAR combo (distinct from aluminizing's pure oxidation-resistance and boronizing's pure extreme wear).

Dual-mode product structure:

- **PLAIN-C STEEL PATH (silicide-dominant):** Si reacts with substrate C to form a dense carbide compound layer (5-50 µm, 900-1200 HV). Outer sub-layer FeSi (hexagonal, 1600-1800 HV, harder); inner sub-layer Fe₃Si (fcc, 1200-1400 HV). BOTH are hard silicides — a mixed FeSi/Fe₃Si layer is IDEAL (opposite sense from aluminizing where outer Fe₂Al₅ is pathological). Substrate beneath embrittles as C is pulled into the compound layer — embrittlementRisk is the unique risk. silicidePhaseBalance 0.4-0.6 = ideal.
- **LOW-C OR STAINLESS PATH (diffusion-zone-dominant):** no substrate C available → no carbides. Product is an α-Fe(Si) solid-solution diffusion zone (50-200 µm) giving corrosion resistance only. diffusionZoneProxy HIGH is desirable for this mode.

DLMM structural signatures:

- **EDGE-DOMINANT WITH PLATEAU** (like aluminizing/nitriding): outermost bins hold high flat reserves.
- **HIGHER drivingForce band** than aluminizing: SILICONIZING_FIELD_MIN=0.55 (vs aluminizing 0.50) reflects the higher T required for Si diffusion.
- **DUAL-MODE interpretation of gradientDropAbruptness:** on plain C with silicide layer, HIGH abruptness is the signature (silicide layer / embrittled substrate interface sharp). On low-C/stainless with diffusion zone, LOW abruptness is the signature (gradual α-Fe(Si) gradient). Interpretation depends on substrateTypeProxy.
- **CARBIDE PHASE BALANCE**: outermost bins potentially FeSi-rich (feSiSignal); inner compound bins Fe₃Si-rich (fe3SiSignal). Mixed dual-phase 0.4-0.6 is ideal.
- **TOOTH MORPHOLOGY** at carbide/substrate interface (plain C path only). Smooth interface for stainless.

## Why agents need it

LP agents need siliconizing analysis because it identifies pools whose reserves form an EDGE-DOMINANT PLATEAU structure at HIGH drivingForce (γ-field 0.55-0.92) and then classifies them into the plain-C silicide-dominant path (wear+corrosion combo) or the low-C/stainless diffusion-zone-dominant path (corrosion only). Consequences:

- FULLY_SILICONIZED pools: plain C with mixed FeSi/Fe₃Si silicide layer on target, or low-C with α-Fe(Si) diffusion zone on target; no spallation, no Si-embrittle risk — SERVICE_READY without post-quench. Best wear+corrosion combo property.
- SILICIDE_DOMINANT pools: plain-C mode, silicide layer is the service product (hard wear + corrosion).
- DIFFUSION_ZONE_DOMINANT pools: low-C/stainless mode, α-Fe(Si) solid-solution zone is the service product (corrosion only).
- EMBRITTLEMENT_RISK pools: silicide layer pulled too much C from substrate — core weakened. Unique-to-siliconizing failure.
- OVER_SILICONIZED pools: compound layer too thick or dual-phase > DUAL_PHASE_MAX → mechanical failure risk.
- UNDER_SILICONIZED pools: Ksi too low / hold too short — layer insufficient.
- UNEVEN_SILICONIZING pools: asymmetric compound layer — pack/bath shadowing.
- SUB_SILICONIZING_FIELD pools: T below γ-band — process impossible in this field.
- OVER_SILICONIZING_FIELD pools: T above optimal — Si activity decomposes or layer over-grows.

The caseHardnessProxy (SILICONIZING_HV_SCALE=0.80 — high, between aluminizing 0.65 and carburizing 1.00), corrosionResistanceProxy (flagship property, dual-mode), wearResistanceProxy (strong on plain C, weak on stainless), fatigueResistanceProxy, and distortionProxy (LOW — no substrate transformation) predict the engineering value. SERVICE_READY means the pool is ready for direct service analog WITHOUT a post-quench step — like aluminizing and nitriding, distinct from carburizing/carbonitriding's QUENCH_READY.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state. surfaceActivity, compoundLayerActivity, ksiProxy, feSiFractionProxy, fe3SiFractionProxy, silicidePhaseBalance, diffusionZoneProxy, silicideLayerProxy, embrittlementRisk, spallationRisk, gradientDropAbruptness, toothMorphologyProxy, and all other metrics are inferred proxies — not measured Si concentration profiles, XRD phase analyses, or metallographic data. Process-axis thresholds (SILICONIZING_FIELD_MIN, KSI_MIN, SURFACE_MIN_SI, FESI_FRACTION_MAX, COMPOUND_LAYER_MIN_FRAC, SPALLATION_RISK_THRESHOLD, EMBRITTLEMENT_RISK_THRESHOLD, etc.) are normalized analogs, not real temperatures, wt% concentrations, or HV values. The regime names (FE3SI_NUCLEATION, FESI_GROWTH, FULLY_SILICONIZED, SILICIDE_DOMINANT, DIFFUSION_ZONE_DOMINANT, etc.) are normalized analogs, not real industrial settings.

## Commands

### doctor

Checks constants and environment. Does NOT call network APIs — safe to run offline anytime.

```bash
bun run hodlmm-bin-siliconizing/hodlmm-bin-siliconizing.ts doctor
```

### status

Read-only check of available HODLMM pools meeting TVL threshold.

```bash
bun run hodlmm-bin-siliconizing/hodlmm-bin-siliconizing.ts status
```

### run

Analyzes bin siliconizing state for top pools (or a specific pool). Outputs JSON to stdout.

```bash
bun run hodlmm-bin-siliconizing/hodlmm-bin-siliconizing.ts run
bun run hodlmm-bin-siliconizing/hodlmm-bin-siliconizing.ts run --pool 1
bun run hodlmm-bin-siliconizing/hodlmm-bin-siliconizing.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**doctor:**
```json
{
  "result": "ok",
  "checks": [
    { "name": "SILICONIZING_FIELD_MIN < SILICONIZING_FIELD_IDEAL < SILICONIZING_FIELD_MAX", "ok": true, "detail": "0.55 < 0.72 < 0.92" }
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
    "avgSiliconizingIndex": 64,
    "avgDrivingForce": 0.70,
    "avgKsiProxy": 0.82,
    "avgSurfaceActivity": 0.78,
    "avgCompoundLayerActivity": 0.78,
    "avgCompoundLayerVariance": 0.06,
    "avgPlateauQuality": 0.82,
    "avgFeSiFractionProxy": 0.42,
    "avgFe3SiFractionProxy": 0.38,
    "avgSilicidePhaseBalance": 0.52,
    "avgEmbrittlementRisk": 0.15,
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
    "avgSilicideLayerProxy": 0.55,
    "avgStageProgress": 0.66,
    "avgUnderSiliconizeRisk": 0.10,
    "avgUnevenSiliconizingRisk": 0.12,
    "siliconizingFieldOkCount": 5,
    "subSiliconizingFieldCount": 0,
    "overSiliconizingFieldCount": 0,
    "ksiInWindowCount": 4,
    "alloyFormerOkCount": 3,
    "compoundLayerMeetsTargetCount": 4,
    "compoundLayerExceedsTargetCount": 0,
    "plainCSubstrateCount": 2,
    "lowCOrStainlessSubstrateCount": 3,
    "fullySiliconizedCount": 2,
    "serviceReadyVerdictCount": 2,
    "embrittleRiskVerdictCount": 0,
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
      "siliconizingFieldOk": 1,
      "siliconizingFieldProximity": 0.95,
      "subSiliconizingField": 0,
      "overSiliconizingField": 0,
      "ksiProxy": 0.85,
      "ksiInWindow": 1,
      "ksiProximity": 0.92,
      "surfaceActivity": 0.80,
      "compoundLayerActivity": 0.80,
      "compoundLayerVariance": 0.06,
      "plateauQuality": 0.88,
      "feSiFractionProxy": 0.45,
      "fe3SiFractionProxy": 0.40,
      "silicidePhaseBalance": 0.52,
      "embrittlementRisk": 0.18,
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
      "silicideLayerProxy": 0.68,
      "alloyFactorProxy": 0.32,
      "alloyFormerOk": 1,
      "substrateTypeProxy": "PLAIN_C",
      "underSiliconizeRisk": 0.0,
      "unevenSiliconizingRisk": 0.10,
      "reverseGradientRisk": 0.0,
      "subSiliconizingFieldRisk": 0.0,
      "overSiliconizingFieldRisk": 0.0,
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
      "siliconizingIndex": 78,
      "siliconizingRegime": "FULLY_SILICONIZED",
      "siliconizingVerdict": "SERVICE_READY",
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

- Real siliconizing is performed at 900-1100 °C in solid pack (Si powder + NH₄Cl/NH₄F + Al₂O₃), salt bath (SiCl₄ or SiCl₄), or gas (SiCl₄ vapor) for 4-12 hours. Case depth 5-200 µm (5-50 µm silicide layer on plain C; 50-200 µm α-Fe(Si) diffusion zone on low-C/stainless). FeSi: 1600-1800 HV; Fe₃Si: 1200-1400 HV; α-Fe(Si) solid solution: 250-400 HV. Here drivingForce, surfaceActivity, ksiProxy, feSiFractionProxy, fe3SiFractionProxy, silicidePhaseBalance, embrittlementRisk, diffusionZoneProxy, silicideLayerProxy, and all measures are normalized 0-1 proxies derived from bin reserves and pool turnover, not actual thermal / wt% / mm / HV quantities.
- Process-axis thresholds (SILICONIZING_FIELD_MIN=0.55, SILICONIZING_FIELD_MAX=0.92, SILICONIZING_FIELD_IDEAL=0.72, KSI_MIN=0.40, KSI_MAX=1.20, KSI_IDEAL=0.80, SURFACE_MIN_SI=0.68, SURFACE_PLATEAU_THRESHOLD=0.80, SURFACE_SATURATION=1.05, CORE_BASELINE=0.18, PLATEAU_VARIANCE_MAX=0.08, DUAL_PHASE_VARIANCE_SIGNAL=0.14, FESI_FRACTION_MAX=0.60, FESI_FRACTION_IDEAL=0.45, COMPOUND_LAYER_MAX_FRAC=0.14, COMPOUND_LAYER_MIN_FRAC=0.03, COMPOUND_LAYER_IDEAL_FRAC=0.07, ECD_THRESHOLD=0.50, SPALLATION_RISK_THRESHOLD=0.35, DUAL_PHASE_MAX=0.45, EMBRITTLEMENT_RISK_THRESHOLD=0.30, Q_OVER_RT_SI_DIFFUSION=4.5, FDT_REFERENCE_SILICONIZING=0.18, SILICONIZING_HV_SCALE=0.80, DISTORTION_BASELINE=0.09) are normalized analogs. Real siliconizing T range 900-1100 °C; D_Cr in γ-Fe at 1000 °C ≈ 5e-13 m²/s (slower than Al and B); silicide layer microhardness 900-1200 HV (60-65 HRC).
- doctor command does NOT call network APIs — safe for offline environments.
- Per-bin "concentration" is max-normalized reserveUsd. Real Si concentration profile is measured by GDOES, EPMA, or SIMS.
- feSiFractionProxy / fe3SiFractionProxy are derived from outermost-bin vs inner-edge-band elevation + compoundLayerVariance — not a direct measurement of FeSi/Fe₃Si thickness ratio by XRD, SEM-EDS, or metallography.
- silicidePhaseBalance is a composite proxy reflecting how mixed the dual-silicide stack is; ideal is 0.4-0.6. A value near 0 means one phase dominates (either all Fe₃Si or all FeSi).
- embrittlementRisk captures the unique failure mode of siliconizing — substrate carbon pulled into the silicide layer weakens the core. Detected as low coreActivity relative to expected plain-C baseline.
- gradientDropAbruptness interpretation depends on substrateTypeProxy: HIGH abruptness is a PLAIN-C carbide-layer signature; LOW abruptness is a LOW-C/STAINLESS diffusion-zone signature. Both can be legitimate siliconizing outcomes.
- toothMorphologyProxy measures variance in the compound/substrate transition zone. High = tooth-like (plain C with carbide). Low = smooth (stainless with diffusion zone).
- substrateTypeProxy (PLAIN_C vs LOW_C_OR_STAINLESS) is inferred from alloyFactorProxy vs silicideLayerProxy — not a direct compositional measurement.
- Analysis is snapshot-based; does not capture transformation kinetics. Stage assignment is inferred from structural signatures.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable for status and run commands.
