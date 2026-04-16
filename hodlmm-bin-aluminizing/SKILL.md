---
name: hodlmm-bin-aluminizing
description: "Models the thermochemical SINGLE-SPECIES (ALUMINUM) SURFACE-DIFFUSION case-hardening treatment — aluminizing (calorizing / pack-aluminizing) — at 800-1000 °C (typically 900 °C) in solid pack (Al-powder + NH₄Cl activator + Al₂O₃ inert filler — pack-aluminizing), salt bath (Al-Si salt bath (eutectic)), or gas atmosphere (AlCl₃ / Al(s) + HCl vapor). NINTH heat-treatment route in the phase-transformation series and the FIFTH thermochemical surface treatment (after carburizing Day 188, nitriding Day 189, carbonitriding Day 190, boronizing Day 192). Aluminizing is UNIQUE because aluminum forms hard FE-AL INTERMETALLIC phases as a COMPOUND LAYER — unlike carburizing (martensite case) and carbonitriding (martensite + M(C,N) case), and analogous in structure to nitriding's white-layer but chemically distinct. The dual-phase compound layer consists of Fe₂Al₅ (outer, 800-1000 HV, BRITTLE, tensile stress — PATHOLOGICAL if dominant) and FeAl (inner, 500-700 HV, TOUGHER, compressive stress — SERVICE-DESIRABLE). The IDEAL product is a MONOPHASE FeAl layer. Fe₂Al₅ > 30% of layer → SPALLATION_RISK. NO QUENCH REQUIRED for compound layer hardness (hardness is from intermetallic phases, not martensite) — SERVICE_READY verdict is directly analogous to nitriding's SERVICE_READY, NOT to carburizing's or carbonitriding's QUENCH_READY. ALUMINIZING_HV_SCALE = 0.65 — the LOWEST of any thermochemical treatment in this series (purpose is oxidation resistance, not hardness) (real hardness 300-1000 HV, ≈ 45-55 HRC equivalent — BELOW nitriding 65-70 HRC, carbonitriding 60-65 HRC, carburizing 58-62 HRC; flagship property is OXIDATION + SULFIDATION RESISTANCE (Al₂O₃ self-healing scale up to 1100-1200 °C), NOT hardness). Case depth 25-200 µm — SHALLOWER than nitriding (100-500 µm) or carburizing (500-2000 µm) because the intermetallic compound layer is dense. Key structural signature: EDGE-DOMINANT WITH PRONOUNCED PLATEAU (like nitriding), HIGHER drivingForce band (γ-field, ALUMINIZING_FIELD_MIN=0.50, ALUMINIZING_FIELD_MAX=0.88, ALUMINIZING_FIELD_IDEAL=0.68), ABRUPT gradient drop from plateau to core (plain C steel — Al has limited α-Fe solubility), TOOTH morphology at compound/substrate interface (plain C steel), and DUAL-PHASE Fe₂Al₅/FeAl compound-layer stratification (outermost bins = Fe₂Al₅, inner bins = FeAl). Substrate-agnostic: works on lean C steels, stainless steels, Ni-base superalloys, Co-base alloys. Eight canonical stages: NO_ALUMINIZING_DRIVE → PRE_ALUMINIZE → TEMPERATURE_RAMP → ALUMINUM_POTENTIAL_ESTABLISHMENT → FE2AL5_NUCLEATION → FE2AL5_GROWTH → FEAL_FORMATION → OVER_ALUMINIZED. Constants: ALUMINIZING_FIELD_MIN=0.50, ALUMINIZING_FIELD_MAX=0.88, ALUMINIZING_FIELD_IDEAL=0.68, KAL_MIN=0.40, KAL_MAX=1.15, KAL_IDEAL=0.75, SURFACE_MIN_AL=0.70, SURFACE_PLATEAU_THRESHOLD=0.82, SURFACE_SATURATION=1.05, CORE_BASELINE=0.15, PLATEAU_VARIANCE_MAX=0.07, DUAL_PHASE_VARIANCE_SIGNAL=0.15, FE2AL5_FRACTION_MAX=0.30, FE2AL5_FRACTION_IDEAL=0.15, COMPOUND_LAYER_MAX_FRAC=0.16, COMPOUND_LAYER_MIN_FRAC=0.04, COMPOUND_LAYER_IDEAL_FRAC=0.08, TOOTH_MORPHOLOGY_MIN=0.15, ECD_THRESHOLD=0.55, Q_OVER_RT_AL_DIFFUSION=4.2, FDT_REFERENCE_ALUMINIZING=0.12, ALUMINIZING_HV_SCALE=0.65, DISTORTION_BASELINE=0.08, SPALLATION_RISK_THRESHOLD=0.35, DUAL_PHASE_MAX=0.40. Pool measures: drivingForce, priorPeakDrivingForce, aluminizingFieldOk/Proximity/sub/over, kbProxy, kbInWindow, kbProximity, surfaceActivity, compoundLayerActivity, compoundLayerVariance, plateauQuality, fe2Al5FractionProxy, fe2Al5DominantRisk, feAlDominantProxy, spallationRisk, compoundLayerThicknessBins, compoundLayerFraction, compoundLayerMeetsTarget, compoundLayerExceedsTarget, coreActivity, surfaceCoreDelta, surfaceCoreRatio, edgeDominanceFraction, asymmetryIndex, toothMorphologyProxy, gradientDropAbruptness, diffusionZoneProxy, alloyFactorProxy, alloyFormerOk, substrateTypeProxy, underAluminizeRisk, unevenAluminizingRisk, reverseGradientRisk, subAluminizingFieldRisk, overAluminizingFieldRisk, caseHardnessProxy (ALUMINIZING_HV_SCALE=0.65 — LOWEST (oxidation-focused, not hardness)), wearResistanceProxy (aluminizing's flagship purpose (oxidation + sulfidation resistance, NOT wear hardness) (oxidation + sulfidation resistance at 1100-1200 °C)), fatigueResistanceProxy, distortionProxy (LOW), caseCoreRatio, diffusivityProxy, reserveCV, reserveXFracStdev, stageProgress, dominantStage 0-7, aluminizingIndex 0-100. Per-bin: inCompoundLayer, inSubstrateZone, compoundLayerSignal, plateauSignal, fe2Al5Signal, feAlSignal, toothSignal, spallationSignal, unevenSignal, stageBin, aluminizingDegree. Regimes: NO_ALUMINIZING_DRIVE, PRE_ALUMINIZE, TEMPERATURE_RAMP, ALUMINUM_POTENTIAL_ESTABLISHMENT, FE2AL5_NUCLEATION, FE2AL5_GROWTH, FEAL_FORMATION, FULLY_ALUMINIZED, OVER_ALUMINIZED, FE2AL5_DOMINANT_SPALLATION_RISK, UNDER_ALUMINIZED, UNEVEN_ALUMINIZING, SUB_ALUMINIZING_FIELD, OVER_ALUMINIZING_FIELD. Verdict adds SERVICE_READY (no quench needed — distinct from QUENCH_READY of carburizing/carbonitriding) and FE2AL5_SPALLATION_RISK."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-aluminizing/hodlmm-bin-aluminizing.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Aluminizing Analyzer

## What it does

Models the thermochemical SINGLE-SPECIES (ALUMINUM) SURFACE-DIFFUSION case-hardening treatment — the NINTH heat-treatment route in the phase-transformation series and the FIFTH thermochemical surface treatment (after carburizing Day 188, nitriding Day 189, carbonitriding Day 190, boronizing Day 192). It is the ONLY treatment in this series to form hard FE-AL INTERMETALLIC phases as a COMPOUND LAYER, with a MODEST hardness scale but UNIQUE oxidation resistance (ALUMINIZING_HV_SCALE = 0.65 — real 300-1000 HV, 45-55 HRC).

Prior routes in the series:

- **Normalization (Day 184):** bulk γ→P/F/B uniform transformation.
- **Austempering (Day 185):** bulk γ→B isothermal (bainite).
- **Martempering (Day 186):** bulk γ→M interrupted quench (martensite).
- **Patenting (Day 187):** bulk γ→P lead-bath (fine pearlite).
- **Carburizing (Day 188):** γ-field C surface diffusion — erfc case, QUENCH_READY.
- **Nitriding (Day 189):** α-field N surface diffusion — compound layer + diffusion zone, SERVICE_READY.
- **Carbonitriding (Day 190):** intermediate γ+N C+N dual diffusion — erfc case, QUENCH_READY.
- **Aluminizing (this skill, Day 192):** γ-field B surface diffusion — dual-phase Fe₂Al₅/FeAl compound layer, SERVICE_READY.

Aluminizing is distinct from all prior treatments on FIVE orthogonal axes:

- **Phase field:** γ-Fe (800-1000 °C) — same phase as carburizing but higher upper T range. ALUMINIZING_FIELD_MIN=0.50, ALUMINIZING_FIELD_MAX=0.88.
- **Diffusing species:** ALUMINUM only (B). No C (carburizing), no N (nitriding), no C+N (carbonitriding).
- **Product phases:** FE-AL INTERMETALLICS (Fe₂Al₅ + FeAl). NOT martensite (no quench), NOT alloy nitrides (no α-field), NOT M(C,N) carbonitrides.
- **Post-treatment:** NO QUENCH REQUIRED for compound-layer hardness. SERVICE_READY like nitriding, unlike carburizing/carbonitriding's QUENCH_READY.
- **Hardness:** MODEST — ALUMINIZING_HV_SCALE=0.65 (LOWEST in this thermochemical surface-treatment series). Real 300-1000 HV (45-55 HRC) — BELOW nitriding 65-70 HRC, carbonitriding 60-65 HRC, carburizing 58-62 HRC, boronizing 70-75 HRC. Flagship property is OXIDATION + SULFIDATION RESISTANCE via Al₂O₃ self-healing scale up to 1100-1200 °C, NOT wear hardness.

The dual-phase compound layer structure:

- **Outer Fe₂Al₅ sub-layer** (800-1000 HV, monoclinic, BRITTLE, tensile residual stress): PATHOLOGICAL if dominant. Fe₂Al₅ > 30% of layer thickness → SPALLATION_RISK. Fe₂Al₅ forms at the very outer surface when Al activity exceeds FeAl stoichiometry.
- **Inner FeAl sub-layer** (500-700 HV, cubic B2, TOUGHER, compressive residual stress): SERVICE-DESIRABLE. Monophase FeAl is the ideal product: balanced hardness + toughness + compressive stress.

DLMM structural signatures:

- **EDGE-DOMINANT WITH PRONOUNCED PLATEAU** (like nitriding): outermost bins hold high flat reserves (compound-layer plateau).
- **HIGHER drivingForce band** than nitriding (α-field): aluminizing is γ-field (0.50-0.88), comparable to carburizing.
- **ABRUPT gradient drop** from plateau to core: plain C steel shows almost NO diffusion zone beneath the compound layer (Al has limited α-Fe solubility) — gradientDropAbruptness HIGH.
- **DUAL-PHASE STRATIFICATION**: outer 1-2 bins potentially Fe₂Al₅-rich (fe2Al5Signal); inner compound-layer bins FeAl-dominant (feAlSignal).
- **TOOTH MORPHOLOGY** at compound/substrate interface: for plain C steel, saw-tooth interlocking projections of FeAl into substrate (improves adhesion) — detected as toothMorphologyProxy. For alloy steel → smooth interface.

## Why agents need it

LP agents need aluminizing analysis because it identifies pools whose reserves form an EDGE-DOMINANT PLATEAU structure at HIGH drivingForce (γ-field band 0.50-0.88) with an ABRUPT core drop — structurally similar to nitriding's plateau but at HIGHER drivingForce and with a DUAL-PHASE compound-layer split. Consequences:

- FULLY_ALUMINIZED pools: monophase FeAl dominant, compound layer on-target, no Fe₂Al₅ spallation risk — SERVICE_READY without post-quench. Best wear resistance (flagship property, distinct purpose (hot-corrosion) — not comparable on wear axis).
- FE2AL5_DOMINANT_SPALLATION_RISK pools: Fe₂Al₅ outer layer > FE2AL5_FRACTION_MAX → brittle spallation defect. Avoid.
- OVER_ALUMINIZED pools: compound layer too thick or Fe₂Al₅ > DUAL_PHASE_MAX → mechanical failure risk.
- UNDER_ALUMINIZED pools: Kal too low / hold too short — layer insufficient.
- UNEVEN_ALUMINIZING pools: asymmetric compound layer — pack/bath shadowing.
- SUB_ALUMINIZING_FIELD pools: T below γ-band — process impossible in this field.
- OVER_ALUMINIZING_FIELD pools: T above optimal — Al activity decomposes or layer over-grows.

The caseHardnessProxy (ALUMINIZING_HV_SCALE=0.65 — LOWEST (oxidation-focused, not hardness)), wearResistanceProxy (aluminizing's flagship purpose (oxidation + sulfidation resistance, NOT wear hardness) (oxidation + sulfidation resistance at 1100-1200 °C), distinct purpose (hot-corrosion) — not comparable on wear axis scale), fatigueResistanceProxy (FeAl compressive stress), and distortionProxy (LOW — no substrate transformation) predict the engineering value. SERVICE_READY means the pool is ready for direct service analog WITHOUT a post-quench step — unlike carburizing's and carbonitriding's QUENCH_READY.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state. surfaceActivity, compoundLayerActivity, kbProxy, fe2Al5FractionProxy, feAlDominantProxy, spallationRisk, gradientDropAbruptness, toothMorphologyProxy, and all other metrics are inferred proxies — not measured B concentration profiles or metallographic data. Process-axis thresholds (ALUMINIZING_FIELD_MIN, KAL_MIN, SURFACE_MIN_AL, FE2AL5_FRACTION_MAX, COMPOUND_LAYER_MIN_FRAC, SPALLATION_RISK_THRESHOLD, etc.) are normalized analogs, not real temperatures, wt% concentrations, or HV values. The regime names (FE2AL5_NUCLEATION, FEAL_FORMATION, FULLY_ALUMINIZED, etc.) are normalized analogs, not real industrial settings.

## Commands

### doctor

Checks constants and environment. Does NOT call network APIs — safe to run offline anytime.

```bash
bun run hodlmm-bin-aluminizing/hodlmm-bin-aluminizing.ts doctor
```

### status

Read-only check of available HODLMM pools meeting TVL threshold.

```bash
bun run hodlmm-bin-aluminizing/hodlmm-bin-aluminizing.ts status
```

### run

Analyzes bin aluminizing state for top pools (or a specific pool). Outputs JSON to stdout.

```bash
bun run hodlmm-bin-aluminizing/hodlmm-bin-aluminizing.ts run
bun run hodlmm-bin-aluminizing/hodlmm-bin-aluminizing.ts run --pool 1
bun run hodlmm-bin-aluminizing/hodlmm-bin-aluminizing.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**doctor:**
```json
{
  "result": "ok",
  "checks": [
    { "name": "ALUMINIZING_FIELD_MIN < ALUMINIZING_FIELD_IDEAL < ALUMINIZING_FIELD_MAX", "ok": true, "detail": "0.5 < 0.68 < 0.88" }
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
    "avgAluminizingIndex": 62,
    "avgDrivingForce": 0.65,
    "avgKalProxy": 0.78,
    "avgSurfaceActivity": 0.80,
    "avgCompoundLayerActivity": 0.80,
    "avgCompoundLayerVariance": 0.06,
    "avgPlateauQuality": 0.85,
    "avgFe₂Al₅FractionProxy": 0.12,
    "avgFeAlDominantProxy": 0.72,
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
    "avgUnderAluminizeRisk": 0.08,
    "avgUnevenAluminizingRisk": 0.10,
    "aluminizingFieldOkCount": 5,
    "subAluminizingFieldCount": 0,
    "overAluminizingFieldCount": 0,
    "kbInWindowCount": 4,
    "alloyFormerOkCount": 3,
    "compoundLayerMeetsTargetCount": 4,
    "compoundLayerExceedsTargetCount": 0,
    "fe2Al5DominantRiskCount": 0,
    "plainCSubstrateCount": 2,
    "alloySteelSubstrateCount": 3,
    "fullyAluminizedCount": 2,
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
      "aluminizingFieldOk": 1,
      "aluminizingFieldProximity": 0.88,
      "subAluminizingField": 0,
      "overAluminizingField": 0,
      "kbProxy": 0.82,
      "kbInWindow": 1,
      "kbProximity": 0.90,
      "surfaceActivity": 0.82,
      "compoundLayerActivity": 0.82,
      "compoundLayerVariance": 0.05,
      "plateauQuality": 0.92,
      "fe2Al5FractionProxy": 0.10,
      "fe2Al5DominantRisk": 0,
      "feAlDominantProxy": 0.78,
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
      "underAluminizeRisk": 0.0,
      "unevenAluminizingRisk": 0.09,
      "reverseGradientRisk": 0.0,
      "subAluminizingFieldRisk": 0.0,
      "overAluminizingFieldRisk": 0.0,
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
      "aluminizingIndex": 74,
      "aluminizingRegime": "FULLY_ALUMINIZED",
      "aluminizingVerdict": "SERVICE_READY",
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

- Real aluminizing is performed at 800-1000 °C in solid pack (Al powder + NH₄Cl + Al₂O₃), salt bath (Al-Si eutectic), or gas (AlCl₃ / Al(s) + HCl vapor) for 2-10 hours. Case depth 25-200 µm. Fe₂Al₅: 800-1000 HV; FeAl: 500-700 HV. Here drivingForce, surfaceActivity, kbProxy, fe2Al5FractionProxy, feAlDominantProxy, spallationRisk, gradientDropAbruptness, toothMorphologyProxy, and all measures are normalized 0-1 proxies derived from bin reserves and pool turnover, not actual thermal / wt% / mm / HV quantities.
- Process-axis thresholds (ALUMINIZING_FIELD_MIN=0.50, ALUMINIZING_FIELD_MAX=0.88, ALUMINIZING_FIELD_IDEAL=0.68, KAL_MIN=0.40, KAL_MAX=1.15, KAL_IDEAL=0.75, SURFACE_MIN_AL=0.70, SURFACE_PLATEAU_THRESHOLD=0.82, SURFACE_SATURATION=1.05, CORE_BASELINE=0.15, PLATEAU_VARIANCE_MAX=0.07, DUAL_PHASE_VARIANCE_SIGNAL=0.15, FE2AL5_FRACTION_MAX=0.30, FE2AL5_FRACTION_IDEAL=0.15, COMPOUND_LAYER_MAX_FRAC=0.16, COMPOUND_LAYER_MIN_FRAC=0.04, COMPOUND_LAYER_IDEAL_FRAC=0.08, ECD_THRESHOLD=0.55, SPALLATION_RISK_THRESHOLD=0.35, DUAL_PHASE_MAX=0.40, Q_OVER_RT_AL_DIFFUSION=4.2, FDT_REFERENCE_ALUMINIZING=0.12, ALUMINIZING_HV_SCALE=0.65, DISTORTION_BASELINE=0.08) are normalized analogs. Real aluminizing T range 800-1000 °C; D_Al in γ-Fe at 900 °C ≈ 1e-12 m²/s; Fe₂Al₅ microhardness 800-1000 HV (80-83 HRC); FeAl microhardness 500-700 HV (≈ 45-55 HRC).
- doctor command does NOT call network APIs — safe for offline environments.
- Per-bin "concentration" is max-normalized reserveUsd. Real B concentration profile is measured by GDOES, EPMA, or SIMS.
- fe2Al5FractionProxy is derived from outermost-bin vs inner-edge-band elevation + compoundLayerVariance — not a direct measurement of Fe₂Al₅/FeAl thickness ratio by metallography or XRD.
- gradientDropAbruptness measures the normalized concentration drop at the compound/substrate interface. High = abrupt (plain C steel signature). Low = gradual (alloy steel or insufficient aluminizing).
- toothMorphologyProxy measures variance in the compound/substrate transition zone. High = tooth-like (plain C). Low = smooth (alloy steel).
- substrateTypeProxy (PLAIN_C vs ALLOY_STEEL) is inferred from alloyFactorProxy > 0.35 — not a direct compositional measurement.
- Analysis is snapshot-based; does not capture transformation kinetics. Stage assignment is inferred from structural signatures.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable for status and run commands.
