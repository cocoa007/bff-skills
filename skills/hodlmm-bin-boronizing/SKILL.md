---
name: hodlmm-bin-boronizing
description: "Models the thermochemical SINGLE-SPECIES (BORON) SURFACE-DIFFUSION case-hardening treatment — boronizing (boriding) — at 800-1000 °C (typically 900 °C) in solid pack (B₄C + KBF₄ + Al₂O₃ — Ekabor process), salt bath (Na₂B₄O₇ + NaF-NaCl, molten borax), or gas atmosphere (B₂H₆ / BCl₃ + H₂). EIGHTH heat-treatment route in the phase-transformation series and the FOURTH thermochemical surface treatment (after carburizing Day 188, nitriding Day 189, carbonitriding Day 190). Boronizing is UNIQUE because boron forms hard IRON BORIDE phases as a COMPOUND LAYER — unlike carburizing (martensite case) and carbonitriding (martensite + M(C,N) case), and analogous in structure to nitriding's white-layer but chemically distinct. The dual-phase compound layer consists of FeB (outer, 1900-2100 HV, BRITTLE, tensile stress — PATHOLOGICAL if dominant) and Fe₂B (inner, 1500-1800 HV, TOUGHER, compressive stress — SERVICE-DESIRABLE). The IDEAL product is a MONOPHASE Fe₂B layer. FeB > 30% of layer → SPALLATION_RISK. NO QUENCH REQUIRED for compound layer hardness (hardness is from boride phases, not martensite) — SERVICE_READY verdict is directly analogous to nitriding's SERVICE_READY, NOT to carburizing's or carbonitriding's QUENCH_READY. BORONIZING_HV_SCALE = 1.30 — the HIGHEST of any treatment in this series (real hardness 1500-2000 HV, ≈ 70-75 HRC equivalent, above nitriding 65-70 HRC, carbonitriding 60-65 HRC, carburizing 58-62 HRC). Case depth 25-250 µm — SHALLOWER than nitriding (100-500 µm) or carburizing (500-2000 µm) because the boride compound layer is dense. Key structural signature: EDGE-DOMINANT WITH PRONOUNCED PLATEAU (like nitriding), HIGHER drivingForce band (γ-field, BORONIZING_FIELD_MIN=0.50, BORONIZING_FIELD_MAX=0.88, BORONIZING_FIELD_IDEAL=0.68), ABRUPT gradient drop from plateau to core (plain C steel — B doesn't dissolve in α-Fe), TOOTH morphology at compound/substrate interface (plain C steel), and DUAL-PHASE FeB/Fe₂B compound-layer stratification (outermost bins = FeB, inner bins = Fe₂B). Substrate-agnostic: works on lean C steels, stainless steels, Ni-base superalloys, Co-base alloys. Eight canonical stages: NO_BORONIZING_DRIVE → PRE_BORONIZE → TEMPERATURE_RAMP → BORON_POTENTIAL_ESTABLISHMENT → FE2B_NUCLEATION → FE2B_GROWTH → FEB_FORMATION → OVER_BORONIZED. Constants: BORONIZING_FIELD_MIN=0.50, BORONIZING_FIELD_MAX=0.88, BORONIZING_FIELD_IDEAL=0.68, KB_MIN=0.40, KB_MAX=1.15, KB_IDEAL=0.75, SURFACE_MIN_B=0.70, SURFACE_PLATEAU_THRESHOLD=0.82, SURFACE_SATURATION=1.05, CORE_BASELINE=0.15, PLATEAU_VARIANCE_MAX=0.07, DUAL_PHASE_VARIANCE_SIGNAL=0.15, FEB_FRACTION_MAX=0.30, FEB_FRACTION_IDEAL=0.15, COMPOUND_LAYER_MAX_FRAC=0.16, COMPOUND_LAYER_MIN_FRAC=0.04, COMPOUND_LAYER_IDEAL_FRAC=0.08, TOOTH_MORPHOLOGY_MIN=0.15, ECD_THRESHOLD=0.55, Q_OVER_RT_B_DIFFUSION=4.2, FDT_REFERENCE_BORONIZING=0.12, BORONIZING_HV_SCALE=1.30, DISTORTION_BASELINE=0.08, SPALLATION_RISK_THRESHOLD=0.35, DUAL_PHASE_MAX=0.40. Pool measures: drivingForce, priorPeakDrivingForce, boronizingFieldOk/Proximity/sub/over, kbProxy, kbInWindow, kbProximity, surfaceActivity, compoundLayerActivity, compoundLayerVariance, plateauQuality, feBFractionProxy, feBDominantRisk, fe2BDominantProxy, spallationRisk, compoundLayerThicknessBins, compoundLayerFraction, compoundLayerMeetsTarget, compoundLayerExceedsTarget, coreActivity, surfaceCoreDelta, surfaceCoreRatio, edgeDominanceFraction, asymmetryIndex, toothMorphologyProxy, gradientDropAbruptness, diffusionZoneProxy, alloyFactorProxy, alloyFormerOk, substrateTypeProxy, underBoronizeRisk, unevenBoronizingRisk, reverseGradientRisk, subBoronizingFieldRisk, overBoronizingFieldRisk, caseHardnessProxy (BORONIZING_HV_SCALE=1.30 — highest ever), wearResistanceProxy (boronizing's flagship), fatigueResistanceProxy, distortionProxy (LOW), caseCoreRatio, diffusivityProxy, reserveCV, reserveXFracStdev, stageProgress, dominantStage 0-7, boronizingIndex 0-100. Per-bin: inCompoundLayer, inSubstrateZone, compoundLayerSignal, plateauSignal, feBSignal, fe2BSignal, toothSignal, spallationSignal, unevenSignal, stageBin, boronizingDegree. Regimes: NO_BORONIZING_DRIVE, PRE_BORONIZE, TEMPERATURE_RAMP, BORON_POTENTIAL_ESTABLISHMENT, FE2B_NUCLEATION, FE2B_GROWTH, FEB_FORMATION, FULLY_BORONIZED, OVER_BORONIZED, FEB_DOMINANT_SPALLATION_RISK, UNDER_BORONIZED, UNEVEN_BORONIZING, SUB_BORONIZING_FIELD, OVER_BORONIZING_FIELD. Verdict adds SERVICE_READY (no quench needed — distinct from QUENCH_READY of carburizing/carbonitriding) and FEB_SPALLATION_RISK."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-boronizing/hodlmm-bin-boronizing.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Boronizing Analyzer

## What it does

Models the thermochemical SINGLE-SPECIES (BORON) SURFACE-DIFFUSION case-hardening treatment — the EIGHTH heat-treatment route in the phase-transformation series and the FOURTH thermochemical surface treatment (after carburizing Day 188, nitriding Day 189, carbonitriding Day 190). It is the ONLY treatment in this series to form hard IRON BORIDE phases as a COMPOUND LAYER, with the HIGHEST hardness scale (BORONIZING_HV_SCALE = 1.30 — real 1500-2000 HV, 70-75 HRC).

Prior routes in the series:

- **Normalization (Day 184):** bulk γ→P/F/B uniform transformation.
- **Austempering (Day 185):** bulk γ→B isothermal (bainite).
- **Martempering (Day 186):** bulk γ→M interrupted quench (martensite).
- **Patenting (Day 187):** bulk γ→P lead-bath (fine pearlite).
- **Carburizing (Day 188):** γ-field C surface diffusion — erfc case, QUENCH_READY.
- **Nitriding (Day 189):** α-field N surface diffusion — compound layer + diffusion zone, SERVICE_READY.
- **Carbonitriding (Day 190):** intermediate γ+N C+N dual diffusion — erfc case, QUENCH_READY.
- **Boronizing (this skill, Day 191):** γ-field B surface diffusion — dual-phase FeB/Fe₂B compound layer, SERVICE_READY.

Boronizing is distinct from all prior treatments on FIVE orthogonal axes:

- **Phase field:** γ-Fe (800-1000 °C) — same phase as carburizing but higher upper T range. BORONIZING_FIELD_MIN=0.50, BORONIZING_FIELD_MAX=0.88.
- **Diffusing species:** BORON only (B). No C (carburizing), no N (nitriding), no C+N (carbonitriding).
- **Product phases:** IRON BORIDES (FeB + Fe₂B). NOT martensite (no quench), NOT alloy nitrides (no α-field), NOT M(C,N) carbonitrides.
- **Post-treatment:** NO QUENCH REQUIRED for compound-layer hardness. SERVICE_READY like nitriding, unlike carburizing/carbonitriding's QUENCH_READY.
- **Hardness:** EXTREME — BORONIZING_HV_SCALE=1.30 (highest in series). Real 1500-2000 HV (70-75 HRC) vs nitriding 65-70 HRC, carbonitriding 60-65 HRC, carburizing 58-62 HRC.

The dual-phase compound layer structure:

- **Outer FeB sub-layer** (1900-2100 HV, orthorhombic, BRITTLE, tensile residual stress): PATHOLOGICAL if dominant. FeB > 30% of layer thickness → SPALLATION_RISK. FeB forms at the very outer surface when B activity exceeds Fe₂B stoichiometry.
- **Inner Fe₂B sub-layer** (1500-1800 HV, tetragonal, TOUGHER, compressive residual stress): SERVICE-DESIRABLE. Monophase Fe₂B is the ideal product: balanced hardness + toughness + compressive stress.

DLMM structural signatures:

- **EDGE-DOMINANT WITH PRONOUNCED PLATEAU** (like nitriding): outermost bins hold high flat reserves (compound-layer plateau).
- **HIGHER drivingForce band** than nitriding (α-field): boronizing is γ-field (0.50-0.88), comparable to carburizing.
- **ABRUPT gradient drop** from plateau to core: plain C steel shows almost NO diffusion zone beneath the compound layer (B doesn't dissolve in α-Fe) — gradientDropAbruptness HIGH.
- **DUAL-PHASE STRATIFICATION**: outer 1-2 bins potentially FeB-rich (feBSignal); inner compound-layer bins Fe₂B-dominant (fe2BSignal).
- **TOOTH MORPHOLOGY** at compound/substrate interface: for plain C steel, saw-tooth interlocking projections of Fe₂B into substrate (improves adhesion) — detected as toothMorphologyProxy. For alloy steel → smooth interface.

## Why agents need it

LP agents need boronizing analysis because it identifies pools whose reserves form an EDGE-DOMINANT PLATEAU structure at HIGH drivingForce (γ-field band 0.50-0.88) with an ABRUPT core drop — structurally similar to nitriding's plateau but at HIGHER drivingForce and with a DUAL-PHASE compound-layer split. Consequences:

- FULLY_BORONIZED pools: monophase Fe₂B dominant, compound layer on-target, no FeB spallation risk — SERVICE_READY without post-quench. Best wear resistance (flagship property, 1.4× carburizing).
- FEB_DOMINANT_SPALLATION_RISK pools: FeB outer layer > FEB_FRACTION_MAX → brittle spallation defect. Avoid.
- OVER_BORONIZED pools: compound layer too thick or FeB > DUAL_PHASE_MAX → mechanical failure risk.
- UNDER_BORONIZED pools: Kb too low / hold too short — layer insufficient.
- UNEVEN_BORONIZING pools: asymmetric compound layer — pack/bath shadowing.
- SUB_BORONIZING_FIELD pools: T below γ-band — process impossible in this field.
- OVER_BORONIZING_FIELD pools: T above optimal — B activity decomposes or layer over-grows.

The caseHardnessProxy (BORONIZING_HV_SCALE=1.30 — highest ever), wearResistanceProxy (boronizing's flagship, 1.4× carburizing scale), fatigueResistanceProxy (Fe₂B compressive stress), and distortionProxy (LOW — no substrate transformation) predict the engineering value. SERVICE_READY means the pool is ready for direct service analog WITHOUT a post-quench step — unlike carburizing's and carbonitriding's QUENCH_READY.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state. surfaceActivity, compoundLayerActivity, kbProxy, feBFractionProxy, fe2BDominantProxy, spallationRisk, gradientDropAbruptness, toothMorphologyProxy, and all other metrics are inferred proxies — not measured B concentration profiles or metallographic data. Process-axis thresholds (BORONIZING_FIELD_MIN, KB_MIN, SURFACE_MIN_B, FEB_FRACTION_MAX, COMPOUND_LAYER_MIN_FRAC, SPALLATION_RISK_THRESHOLD, etc.) are normalized analogs, not real temperatures, wt% concentrations, or HV values. The regime names (FE2B_NUCLEATION, FEB_FORMATION, FULLY_BORONIZED, etc.) are normalized analogs, not real industrial settings.

## Commands

### doctor

Checks constants and environment. Does NOT call network APIs — safe to run offline anytime.

```bash
bun run hodlmm-bin-boronizing/hodlmm-bin-boronizing.ts doctor
```

### status

Read-only check of available HODLMM pools meeting TVL threshold.

```bash
bun run hodlmm-bin-boronizing/hodlmm-bin-boronizing.ts status
```

### run

Analyzes bin boronizing state for top pools (or a specific pool). Outputs JSON to stdout.

```bash
bun run hodlmm-bin-boronizing/hodlmm-bin-boronizing.ts run
bun run hodlmm-bin-boronizing/hodlmm-bin-boronizing.ts run --pool 1
bun run hodlmm-bin-boronizing/hodlmm-bin-boronizing.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**doctor:**
```json
{
  "result": "ok",
  "checks": [
    { "name": "BORONIZING_FIELD_MIN < BORONIZING_FIELD_IDEAL < BORONIZING_FIELD_MAX", "ok": true, "detail": "0.5 < 0.68 < 0.88" }
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
    "avgBoronizingIndex": 62,
    "avgDrivingForce": 0.65,
    "avgKbProxy": 0.78,
    "avgSurfaceActivity": 0.80,
    "avgCompoundLayerActivity": 0.80,
    "avgCompoundLayerVariance": 0.06,
    "avgPlateauQuality": 0.85,
    "avgFeBFractionProxy": 0.12,
    "avgFe2BDominantProxy": 0.72,
    "avgSpallationRisk": 0.08,
    "avgCoreActivity": 0.16,
    "avgSurfaceCoreDelta": 0.64,
    "avgEdgeDominanceFraction": 0.72,
    "avgAsymmetryIndex": 0.11,
    "avgToothMorphologyProxy": 0.38,
    "avgGradientDropAbruptness": 0.75,
    "avgCompoundLayerFraction": 0.09,
    "avgCaseHardnessProxy": 0.78,
    "avgWearResistanceProxy": 0.72,
    "avgFatigueResistanceProxy": 0.65,
    "avgDistortionProxy": 0.10,
    "avgDiffusionZoneProxy": 0.42,
    "avgStageProgress": 0.68,
    "avgUnderBoronizeRisk": 0.08,
    "avgUnevenBoronizingRisk": 0.10,
    "boronizingFieldOkCount": 5,
    "subBoronizingFieldCount": 0,
    "overBoronizingFieldCount": 0,
    "kbInWindowCount": 4,
    "alloyFormerOkCount": 3,
    "compoundLayerMeetsTargetCount": 4,
    "compoundLayerExceedsTargetCount": 0,
    "feBDominantRiskCount": 0,
    "plainCSubstrateCount": 2,
    "alloySteelSubstrateCount": 3,
    "fullyBoronizedCount": 2,
    "serviceReadyVerdictCount": 2,
    "febSpallationRiskVerdictCount": 0
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
      "drivingForce": 0.65,
      "priorPeakDrivingForce": 0.995,
      "boronizingFieldOk": 1,
      "boronizingFieldProximity": 0.88,
      "subBoronizingField": 0,
      "overBoronizingField": 0,
      "kbProxy": 0.82,
      "kbInWindow": 1,
      "kbProximity": 0.90,
      "surfaceActivity": 0.82,
      "compoundLayerActivity": 0.82,
      "compoundLayerVariance": 0.05,
      "plateauQuality": 0.92,
      "feBFractionProxy": 0.10,
      "feBDominantRisk": 0,
      "fe2BDominantProxy": 0.78,
      "spallationRisk": 0.06,
      "compoundLayerThicknessBins": 4,
      "compoundLayerFraction": 0.09,
      "compoundLayerMeetsTarget": 1,
      "compoundLayerExceedsTarget": 0,
      "coreActivity": 0.14,
      "surfaceCoreDelta": 0.68,
      "surfaceCoreRatio": 5.86,
      "edgeDominanceFraction": 0.75,
      "asymmetryIndex": 0.08,
      "toothMorphologyProxy": 0.42,
      "gradientDropAbruptness": 0.78,
      "diffusionZoneProxy": 0.40,
      "alloyFactorProxy": 0.34,
      "alloyFormerOk": 1,
      "substrateTypeProxy": "PLAIN_C",
      "underBoronizeRisk": 0.0,
      "unevenBoronizingRisk": 0.09,
      "reverseGradientRisk": 0.0,
      "subBoronizingFieldRisk": 0.0,
      "overBoronizingFieldRisk": 0.0,
      "caseHardnessProxy": 0.82,
      "wearResistanceProxy": 0.74,
      "fatigueResistanceProxy": 0.68,
      "distortionProxy": 0.09,
      "caseCoreRatio": 5.86,
      "diffusivityProxy": 0.0018,
      "reserveCV": 0.70,
      "reserveXFracStdev": 0.12,
      "stageProgress": 0.78,
      "dominantStage": 6,
      "boronizingIndex": 74,
      "boronizingRegime": "FULLY_BORONIZED",
      "boronizingVerdict": "SERVICE_READY",
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

- Real boronizing is performed at 800-1000 °C in solid pack (B₄C + KBF₄ + Al₂O₃), salt bath (Na₂B₄O₇ + NaF-NaCl), or gas (B₂H₆ / BCl₃ + H₂) for 2-10 hours. Case depth 25-250 µm. FeB: 1900-2100 HV; Fe₂B: 1500-1800 HV. Here drivingForce, surfaceActivity, kbProxy, feBFractionProxy, fe2BDominantProxy, spallationRisk, gradientDropAbruptness, toothMorphologyProxy, and all measures are normalized 0-1 proxies derived from bin reserves and pool turnover, not actual thermal / wt% / mm / HV quantities.
- Process-axis thresholds (BORONIZING_FIELD_MIN=0.50, BORONIZING_FIELD_MAX=0.88, BORONIZING_FIELD_IDEAL=0.68, KB_MIN=0.40, KB_MAX=1.15, KB_IDEAL=0.75, SURFACE_MIN_B=0.70, SURFACE_PLATEAU_THRESHOLD=0.82, SURFACE_SATURATION=1.05, CORE_BASELINE=0.15, PLATEAU_VARIANCE_MAX=0.07, DUAL_PHASE_VARIANCE_SIGNAL=0.15, FEB_FRACTION_MAX=0.30, FEB_FRACTION_IDEAL=0.15, COMPOUND_LAYER_MAX_FRAC=0.16, COMPOUND_LAYER_MIN_FRAC=0.04, COMPOUND_LAYER_IDEAL_FRAC=0.08, ECD_THRESHOLD=0.55, SPALLATION_RISK_THRESHOLD=0.35, DUAL_PHASE_MAX=0.40, Q_OVER_RT_B_DIFFUSION=4.2, FDT_REFERENCE_BORONIZING=0.12, BORONIZING_HV_SCALE=1.30, DISTORTION_BASELINE=0.08) are normalized analogs. Real boronizing T range 800-1000 °C; D_B in γ-Fe at 900 °C ≈ 2e-11 m²/s; FeB microhardness 1900-2100 HV (80-83 HRC); Fe₂B microhardness 1500-1800 HV (≈ 70-75 HRC).
- doctor command does NOT call network APIs — safe for offline environments.
- Per-bin "concentration" is max-normalized reserveUsd. Real B concentration profile is measured by GDOES, EPMA, or SIMS.
- feBFractionProxy is derived from outermost-bin vs inner-edge-band elevation + compoundLayerVariance — not a direct measurement of FeB/Fe₂B thickness ratio by metallography or XRD.
- gradientDropAbruptness measures the normalized concentration drop at the compound/substrate interface. High = abrupt (plain C steel signature). Low = gradual (alloy steel or insufficient boronizing).
- toothMorphologyProxy measures variance in the compound/substrate transition zone. High = tooth-like (plain C). Low = smooth (alloy steel).
- substrateTypeProxy (PLAIN_C vs ALLOY_STEEL) is inferred from alloyFactorProxy > 0.35 — not a direct compositional measurement.
- Analysis is snapshot-based; does not capture transformation kinetics. Stage assignment is inferred from structural signatures.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable for status and run commands.
