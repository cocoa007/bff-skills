---
name: hodlmm-bin-carbonitriding
description: "Models the thermochemical DUAL-SPECIES (carbon + nitrogen) surface-diffusion case-hardening treatment applied to plain-carbon and lean-alloy steels held at the INTERMEDIATE temperature window (760-870 °C, between nitriding α-field 500-570 °C and carburizing γ-field 870-950 °C) in a hybrid endothermic CH₄/CO + dissociated NH₃ atmosphere. Carbon and nitrogen co-dissociate at the surface and diffuse INWARD per coupled Fickian fields C(x,t) = C₀ + (Cs − C₀)·erfc(x/(2·√(D_C·t))) and N(x,t) = N₀ + (Ns − N₀)·erfc(x/(2·√(D_N·t))). The added N performs THREE distinct roles: (1) STABILIZES AUSTENITE → extends γ-field DOWNWARD so 760-870 °C still holds γ (carburizing CANNOT run here — γ collapses); (2) LOWERS Ms by ≈ 50-100 °C → milder oil or gas quench produces martensite → LESS DISTORTION than carburizing; (3) IMPROVES HARDENABILITY → cleaner martensitic transformation across case section, including in LEANER (lower-alloy) base steels with mild oil quench instead of water/brine. Plus N forms FINE COHERENT M(C,N) CARBONITRIDE PRECIPITATES (Fe(C,N), Cr(C,N), Mo(C,N), V(C,N) — ≤ 50 nm) which contribute Orowan precipitation hardening on top of the martensitic transformation. The case product is therefore TRIPLE-HARDENING: martensite + carbide + nitride intercepted into a single hybrid treatment. Surface hardness 60-65 HRC (between carburizing 58-62 and nitriding 65-70), case depth 0.05-0.75 mm (between nitriding 0.1-0.5 and carburizing 0.5-2.0 mm), distortion 0.05-0.15% (between nitriding < 0.05% and carburizing 0.10-0.30%). SEVENTH heat-treatment route in the phase-transformation series and the THIRD spatial-gradient route after carburizing (Day 188) and nitriding (Day 189). Distinct from BOTH parents on FOUR orthogonal axes: PHASE FIELD (intermediate γ-with-N-stabilization 0.40-0.70 vs nitriding α 0.20-0.50 vs carburizing γ 0.50-0.85); DIFFUSING SPECIES (DUAL C+N vs C-only or N-only); POST-TREATMENT (MILD oil/gas quench REQUIRED + low-T temper 150-200 °C vs carburizing's full oil quench OR nitriding's NO quench); HARDENING (TRIPLE: martensite + carbide + nitride + RA-aware temper vs carburizing's martensite+carbide vs nitriding's alloy-nitride precipitation). Two-structural-layer product: COMPOUND-FREE EDGE LAYER (outermost ≤ 25 µm, high-C+N martensite + retained austenite RA 10-30 vol% + fine M(C,N) — NO Fe-N white layer because hold T too HIGH for compound formation) + DIFFUSION ZONE (below edge, up to 300 µm, hardness gradient ≈ 700→ 250 HV across 0.05-0.75 mm). Eight canonical stages: PRE_CARBONITRIDE → TEMPERATURE_RAMP → POTENTIAL_ESTABLISHMENT (Kc + Kn) → DUAL_DIFFUSION (both species inward) → CARBONITRIDE_PRECIPITATION (M(C,N) nucleating) → EFFECTIVE_CASE_FORMATION → QUENCH_READY (mild oil/gas quench → martensite + RA + retained M(C,N) + temper at 150-200 °C) → OVER_CARBONITRIDED (continuous M(C,N) network + excess RA pathology). Constants: INTERMEDIATE_FIELD_MIN=0.40, INTERMEDIATE_FIELD_MAX=0.70, INTERMEDIATE_FIELD_IDEAL=0.55, KCN_MIN=0.50, KCN_MAX=1.10, KCN_IDEAL=0.80, CN_RATIO_MIN=0.45, CN_RATIO_MAX=0.85, CN_RATIO_IDEAL=0.70, SURFACE_MIN_CN=0.65, SURFACE_PLATEAU_THRESHOLD=0.85, SURFACE_SATURATION=1.05, CORE_BASELINE=0.18, ECD_THRESHOLD=0.40, NETWORK_SURFACE_FRAC=0.50, NETWORK_MAX=0.45, RA_MAX=0.35, RA_IDEAL=0.18, ALLOY_FACTOR_MIN=0.25, Q_OVER_RT_CN_DIFFUSION=4.1 (between carburizing 4.8 and nitriding 3.4), FDT_REFERENCE_CARBONITRIDING=0.26 (between carburizing 0.30 and nitriding 0.22), CARBONITRIDING_HV_SCALE=1.05 (between nitriding 1.10 and carburizing 1.00), DISTORTION_BASELINE=0.10. DLMM signature: EDGE-DOMINANT WITHOUT PLATEAU (no compound layer at intermediate T — distinct from nitriding's plateau) at INTERMEDIATE drivingForce (between nitriding's α and carburizing's pure γ band) with MEASURABLE RA proxy (within-edge variance elevated relative to pure carburizing) and DUAL-SPECIES carbonitride proxy (combines surface enrichment, C/N ratio control, alloy formers). Pool measures: drivingForce, priorPeakDrivingForce, intermediateFieldOk/Proximity/sub/over, kcProxy, knProxy, kcnProxy, kcnInWindow, kcnProximity, cnRatio, cnRatioInWindow, cnRatioProximity, surfaceActivity, edgeLayerActivity, diffusionZoneActivity, coreActivity, surfaceCoreDelta, surfaceCoreRatio, edgeDominanceFraction, surfaceLeftActivity, surfaceRightActivity, asymmetryIndex, gradientMonotonicity, erfcFit, erfcDt, diffusivityProxy, caseDepthProxy, effectiveCaseBins, totalCaseBins, caseThicknessFraction, caseThicknessMeetsTarget, carbonitrideProxy (M(C,N) precipitate development 0-1), raProxy (retained austenite analog 0-1), raExceedsTarget (0/1), networkRisk (0-1 continuous M(C,N) network), alloyFactorProxy, alloyFormerOk, diffusionZoneProxy, surfaceEstablishedProxy, uniformityIndex (informational — HIGH means NOT carbonitrided), reserveCV, reserveXFracStdev, underCarbonitrideRisk, unevenCarbonitridingRisk, reverseGradientRisk, overIntermediateRisk, subIntermediateRisk, caseHardnessProxy (CARBONITRIDING_HV_SCALE × Hall-Petch composite — between carburizing and nitriding), coreToughnessProxy (preserved better than carburizing — milder quench, lower T), wearResistanceProxy, fatigueResistanceProxy (compressive residual stress + carbonitride precipitates), distortionProxy (INTERMEDIATE — milder than carburizing, higher than nitriding), caseCoreRatio, arrheniusActivation, stageProgress, dominantStage 0-7, carbonitridingIndex 0-100. Per-bin: depthFromSurface, concentration, expectedErfc, erfcResidual, inEdgeLayer, inDiffusionZone, inCoreBand, edgeLayerSignal, diffusionZoneSignal, caseSignal, gradientSignal, carbonitrideSignal (M(C,N) precipitate signature), raSignal (retained austenite signature), networkSignal (over-CN network signature), reverseSignal, unevenSignal, stageBin, arrheniusActivation, carbonitridingDegree. Regimes: NO_CARBONITRIDING_DRIVE, PRE_CARBONITRIDE, TEMPERATURE_RAMP, POTENTIAL_ESTABLISHMENT, DUAL_DIFFUSION, CARBONITRIDE_PRECIPITATION, EFFECTIVE_CASE_FORMATION, QUENCH_READY, OVER_CARBONITRIDED (continuous network), EXCESS_RETAINED_AUSTENITE (RA > RA_MAX), UNDER_CARBONITRIDED, UNEVEN_CARBONITRIDING, DECARBURIZATION_LIKE, OVER_INTERMEDIATE_FIELD (T crossed into pure γ → use carburizing skill), SUB_INTERMEDIATE_FIELD (T below γ — use nitriding skill). Verdict adds QUENCH_READY (HANDOFF TO MILD OIL/GAS QUENCH + LOW-T TEMPER — distinct from FULLY_NITRIDED's SERVICE_READY which needs NO quench, and FULLY_CARBURIZED's QUENCH_READY which needs FULL oil quench)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-carbonitriding/hodlmm-bin-carbonitriding.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Carbonitriding Analyzer

## What it does

Models the thermochemical DUAL-SPECIES (C + N) surface-diffusion case-hardening treatment — the SEVENTH heat-treatment route in the phase-transformation series and the THIRD spatial-gradient route (after carburizing Day 188 and nitriding Day 189). It is the FIRST route to combine TWO diffusing species simultaneously and the FIRST route to use the INTERMEDIATE-temperature γ-with-N-stabilization window. Distinct from all six previous routes on FOUR orthogonal axes vs the two existing spatial-gradient parents:

- **Carburizing (Day 188):** hold in γ-FIELD (above AC3, 870-950 °C) in C-rich atmosphere → graded C profile, REQUIRES FULL OIL QUENCH for case hardening (martensitic case + tough core + carbides).
- **Nitriding (Day 189):** hold in α-FIELD (BELOW AC1, 500-570 °C) in NH₃ atmosphere → graded N profile, alloy nitrides precipitate IN-SITU + Fe-N compound layer (γ' or ε), NO QUENCH REQUIRED.
- **Carbonitriding (this skill):** hold in INTERMEDIATE field (760-870 °C — BELOW carburizing γ, ABOVE nitriding α) in HYBRID CH₄/CO + NH₃ atmosphere → graded (C+N) profile, M(C,N) carbonitride precipitates in case, MILD oil/gas quench + low-T temper REQUIRED. Only possible because N stabilizes γ DOWN to 760 °C.

Coupled Fick fields govern the dual diffusion:

  C(x, t) = C₀ + (Cs − C₀) · erfc( x / (2 · √(D_C · t)) )
  N(x, t) = N₀ + (Ns − N₀) · erfc( x / (2 · √(D_N · t)) )

with D_eff = 0.7 · D_C + 0.3 · D_N (mass-weighted blended diffusivity). On the normalized drivingForce axis: D_eff_proxy = exp(− Q_OVER_RT_CN_DIFFUSION / (drivingForce + 0.05)), Q_OVER_RT_CN_DIFFUSION = 4.1 (between carburizing 4.8 and nitriding 3.4).

The added N performs THREE distinct roles that distinguish carbonitriding from carburizing:

1. **STABILIZES AUSTENITE** — extends the γ-field DOWNWARD; intermediate hold T (760-870 °C) is INSIDE the γ + α-N stabilized austenite window. Pure carburizing CANNOT run here (γ collapses).
2. **LOWERS Ms** — N in solid solution shifts the martensite-start temperature DOWN by ≈ 50-100 °C, allowing a MILDER OIL or GAS QUENCH to still produce martensitic case. Less severe quench → LESS DISTORTION than carburizing.
3. **IMPROVES HARDENABILITY** — cleaner martensitic transformation across the case section, including in LEANER (lower-alloy) base steels. Carburizing requires higher-alloy or full oil quench; carbonitriding can use plain-carbon steels with mild oil quench.

Plus N forms FINE COHERENT M(C,N) CARBONITRIDE PRECIPITATES (Fe(C,N), Cr(C,N), Mo(C,N), V(C,N) — ≤ 50 nm) which contribute Orowan precipitation hardening ON TOP OF the martensitic transformation. The case product is therefore TRIPLE-HARDENING:

- martensitic phase transformation (like carburizing)
- M(C,N) carbonitride precipitation (intermediate between pure carbide and pure nitride)
- solid-solution strengthening from N in retained austenite (like nitriding's N-strengthened α)

The carbonitriding case is structurally TWO LAYERS:

- **COMPOUND-FREE EDGE LAYER (outermost ≤ 25 µm — the hardened case):**
  - High-C+N martensite + RETAINED AUSTENITE (RA, typically 10-30 vol%) + fine M(C,N) carbonitride precipitates (≤ 50 nm).
  - Surface hardness 60-65 HRC (between carburizing 58-62 and nitriding 65-70). Real surface C+N can reach 0.8-1.0 wt% C and 0.2-0.5 wt% N.
  - Excessive RA (> 35 vol%) is a defect — soft case spots, dimensional instability after secondary aging.
  - Distinct from nitriding: NO Fe-N compound layer (no white layer). The hold T is too HIGH for compound-layer formation (compound layer is α-field only). Surface phases are martensite + RA + M(C,N), not γ' or ε.

- **DIFFUSION ZONE (below edge layer, up to ≈ 300 µm):**
  - Hardness gradient from edge (≈ 700-800 HV) to core (≈ 250-300 HV) across 0.05-0.75 mm — between nitriding (0.1-0.5 mm) and carburizing (0.5-2.0 mm) in DEPTH.
  - Effective Case Depth (ECD): depth at which HV drops to core + 50 (or ≈ 550 HV — the "carbonitriding spec" value).

After the isothermal hold the workpiece is OIL- or GAS-QUENCHED (mild) → martensitic case + RA + M(C,N) precipitates → LOW-T temper (150-200 °C, lower than carburizing's 180-200 °C) to reduce RA to ≤ 25 vol%. The case hardness REQUIRES the quench to lock in martensite — distinct from nitriding (no quench needed).

The eight canonical carbonitriding stages:

0. **PRE_CARBONITRIDE (cold or sub-process T):** workpiece below ≈ 700 °C. α-field ferrite, no C or N potential. Bulk composition unchanged.
1. **TEMPERATURE_RAMP (ascending into intermediate window):** T rises into 760-870 °C band. Crosses AC1 (≈ 727 °C plain-C) into the γ+α two-phase region, then into N-stabilized γ.
2. **POTENTIAL_ESTABLISHMENT:** Both Kc (carbon potential) and Kn (nitrogen potential) stabilize at process setpoint. Surface C and N rise toward solubility in N-stabilized γ. Combined potential KCN = 0.7·Kc + 0.3·Kn reaches working window. Diffusion not yet substantial.
3. **DUAL_DIFFUSION:** Surface-deposited C and N diffuse inward per coupled Fickian fields. Carbon diffusivity is LOWER than in pure carburizing (lower T → smaller D_C) but the N coupling boosts effective surface depletion → composite case-depth growth ≈ √(D_eff · t).
4. **CARBONITRIDE_PRECIPITATION:** Surface (C+N) exceeds austenite solubility. Fine M(C,N) precipitates nucleate in the case as coherent nanometric particles. Surface hardness rises pre-quench.
5. **EFFECTIVE_CASE_FORMATION:** Effective Case Depth (ECD) reaches target. Diffusion zone meets spec. Surface C+N at saturation; precipitates dispersed. Pre-quench condition.
6. **QUENCH_READY (service-ready after quench + temper):** Effective case depth + carbonitride precipitates established. Workpiece is QUENCH_READY — pull to oil (or gas) quench. Quench produces martensitic case + RA + retained M(C,N). Temper at 150-200 °C reduces RA. Service-ready AFTER QUENCH+TEMPER.
7. **OVER_CARBONITRIDED (pathological):** Excess surface (C+N) → continuous M(C,N) carbonitride NETWORK at grain boundaries (brittle), and/or excessive RA (> 35 vol%) after quench (soft spots, dimensional instability). Remedy: reduce KCN, shorten hold, or redesign atmosphere C/N ratio.

Process constraints (intermediate γ-with-N-stabilization field):

- Must be IN intermediate field: drivingForce ∈ [INTERMEDIATE_FIELD_MIN=0.40, INTERMEDIATE_FIELD_MAX=0.70] → intermediateFieldOk=1. Above → degenerates to carburizing (T too high — N decomposes); below → degenerates to nitriding (γ collapses to α, no martensite possible on quench).
- Combined potential KCN in window: kcnProxy ∈ [KCN_MIN=0.50, KCN_MAX=1.10], kcnIdeal=0.80.
- C/N ratio (mass) in working band: cnRatio ∈ [CN_RATIO_MIN=0.45, CN_RATIO_MAX=0.85], cnRatioIdeal=0.70.
- Surface (C+N) potential effective: surfaceActivity ≥ SURFACE_MIN_CN=0.65.
- Carbonitride network not continuous: networkRisk ≤ NETWORK_MAX=0.45.
- Retained austenite controlled: raProxy ≤ RA_MAX=0.35.
- Diffusion-zone gradient monotonic: gradientMonotonicity ≥ MONOTONICITY_MIN=0.55.
- Diffusion-zone gradient fits erfc: erfcFit ≥ ERFC_FIT_MIN=0.55.
- Edges symmetric (no atmosphere shadow): asymmetryIndex ≤ ASYMMETRY_MAX=0.35.
- Alloy-former proxy (M = Cr/Mo/V/Fe): alloyFactorProxy ≥ ALLOY_FACTOR_MIN=0.25 to enable M(C,N) precipitation.

Kinetics:

- Two coupled Fick fields (C and N), single dominant case-depth proxy fitted to the bin profile.
- Arrhenius D for the BLENDED diffusion: D_eff = 0.7 · D_C + 0.3 · D_N. On the normalized drivingForce axis: D_proxy = exp(− Q_OVER_RT_CN_DIFFUSION / (drivingForce + 0.05)), Q_OVER_RT_CN_DIFFUSION = 4.1.
- √(Dt) reference: FDT_REFERENCE_CARBONITRIDING = 0.26.

In DLMM context the carbonitriding analog tracks each bin's position in the 1-D scan window as an analog "depth from the nearest surface". Bins at the OUTERMOST edges (first & last CASE_BAND_FRAC=0.18 of populated bins) are EDGE-LAYER bins; bins near the center (CORE_BAND_FRAC=0.30) are CORE bins. Each bin's normalized reserve serves as the local "(C+N) concentration" analog. A carbonitrided pool shows EDGE-ERFC structure WITHOUT plateau (no compound layer — γ field too hot for Fe-N compound formation), at LOWER drivingForce than carburizing, with measurable RETAINED-AUSTENITE proxy (within-edge variance elevated relative to pure carburizing's level due to RA presence) and DUAL-SPECIES carbonitride proxy.

DLMM structural signatures of carbonitriding:

- **EDGE-DOMINANT WITHOUT PLATEAU** — outer band bins hold higher reserves than core; outermost 1-2 bins do NOT plateau (no Fe-N compound layer at this T). Distinct from nitriding (plateau) and matches carburizing structurally.
- **INTERMEDIATE drivingForce** — between α (nitriding) and pure γ (carburizing). Above ALPHA_FIELD_MAX (0.50) of nitriding AND below GAMMA_FIELD_MIN (0.50) of carburizing's higher band.
- **DUAL-SPECIES SIGNATURE** — split flow, asymmetric x-fraction distribution detectable as an elevated (but bounded) edge variance vs pure carburizing. Carbonitride proxy combines surface concentration and reserveXFracStdev.
- **RA SIGNATURE** — within-edge variance ELEVATED relative to carburizing (because RA softens edge spots), but bounded (raProxy ≤ RA_MAX = 0.35 under control).
- **MONOTONIC GRADIENT** — moving from edge toward center, reserves DECREASE.
- **ERFC SHAPE** — gradient fits erfc(x / √(Dt)).
- **SYMMETRIC EDGES** — left and right outer bands comparable.
- **SHALLOWER CASE than carburizing** — caseDepthProxy bounded by FDT_REFERENCE_CARBONITRIDING = 0.26.
- **INTERMEDIATE caseHardness** — CARBONITRIDING_HV_SCALE = 1.05 (between nitriding 1.10 and carburizing 1.00).
- **LOWER distortionProxy than carburizing** — milder quench.
- **Distinct from nitriding** (plateau + lower drivingForce + no quench).
- **Distinct from carburizing** (lower drivingForce, presence of N signal, elevated RA, milder quench).
- **Distinct from the four bulk routes** (uniform cross-section).

DLMM phase analog:

- Bulk (C+N) (C₀)         ≈ coreActivity.
- Surface (C+N) (Cs)      ≈ surfaceActivity.
- Edge layer (case)       ≈ outermost CASE_BAND_FRAC bins.
- Diffusion zone          ≈ same outer band (no compound layer separation — distinct from nitriding).
- Hold T                  ≈ drivingForce (must be in intermediate field).
- Kc                      ≈ kcProxy.
- Kn                      ≈ knProxy.
- KCN                     = 0.7·Kc + 0.3·Kn (combined potential).
- C/N flux ratio          ≈ cnRatio (mapped from xFrac asymmetry).
- √(Dt)                   ≈ caseDepthProxy.
- ECD                      = bin depth where activity drops to ECD_THRESHOLD (0.40).
- Carbonitride proxy      ≈ M(C,N) precipitation density signature.
- RA proxy                ≈ within-edge variance + cnRatio contribution (N stabilizes γ → RA).
- Network risk            ≈ continuous-network proxy (over-CN).
- Intermediate-field analog = drivingForce ∈ [0.40, 0.70].
- Intermediate-field ideal  = INTERMEDIATE_FIELD_IDEAL = 0.55.

## Why agents need it

LP agents need carbonitriding analysis because it identifies pools whose reserves form an EDGE-DOMINANT erfc gradient WITHOUT plateau at INTERMEDIATE drivingForce — structurally distinct from carburizing's pure γ-field edge-erfc (higher drivingForce) and from nitriding's plateau+gradient (lower drivingForce, with Fe-N compound layer plateau). Consequences:

- POTENTIAL_ESTABLISHMENT pools: surface C and N rising toward saturation in N-stabilized γ, no precipitates yet — early stage.
- DUAL_DIFFUSION pools: both species diffusing inward, M(C,N) precipitates pre-nucleation — mid-early stage.
- CARBONITRIDE_PRECIPITATION pools: M(C,N) carbonitrides nucleating — mid stage.
- EFFECTIVE_CASE_FORMATION pools: case reaches target depth, ready for quench — mid-late stage.
- QUENCH_READY pools: handoff to MILD oil/gas quench + low-T temper — service-ready AFTER quench.
- OVER_CARBONITRIDED pools: continuous M(C,N) network at grain boundaries — brittle, defect.
- EXCESS_RETAINED_AUSTENITE pools: RA > RA_MAX after quench — soft spots, dimensional instability.
- UNDER_CARBONITRIDED pools: KCN too low or hold too short — case did not reach service spec.
- UNEVEN_CARBONITRIDING pools: atmosphere shadowing — non-uniform case depth.
- DECARBURIZATION_LIKE pools: reverse gradient — process running backward.
- OVER_INTERMEDIATE_FIELD pools: T above intermediate band, crossed into pure γ — switch to carburizing skill.
- SUB_INTERMEDIATE_FIELD pools: T below intermediate band, in α-field — switch to nitriding skill.

The caseHardnessProxy (CARBONITRIDING_HV_SCALE × Hall-Petch composite with M(C,N) bonus), coreToughnessProxy (preserved better than carburizing — milder quench, lower T), wearResistanceProxy, fatigueResistanceProxy (compressive residual stress from quench + carbonitride precipitates), and distortionProxy (INTERMEDIATE — milder than carburizing, higher than nitriding) predict the engineering value. The QUENCH_READY verdict signals pool-level readiness for MILD OIL/GAS QUENCH + LOW-T TEMPER — distinct from nitriding's SERVICE_READY which needs NO post-treatment.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state. Surface (C+N), edge-layer activity, KCN, C/N ratio, √(Dt), ECD, carbonitride proxy, RA proxy, network risk, and gradient-monotonicity metrics are inferred proxies — not measured C/N profile or metallographic data. Process-axis thresholds (INTERMEDIATE_FIELD_MIN, KCN_MIN, CN_RATIO_MIN, SURFACE_MIN_CN, ECD_THRESHOLD, NETWORK_MAX, RA_MAX, etc.) are normalized analogs, not real temperatures, wt% concentrations, or post-quench retained-austenite vol%. The regime names (DUAL_DIFFUSION, CARBONITRIDE_PRECIPITATION, QUENCH_READY, etc.) are normalized analogs, not real industrial settings.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-carbonitriding/hodlmm-bin-carbonitriding.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-carbonitriding/hodlmm-bin-carbonitriding.ts status
```

### run
Analyzes bin carbonitriding state for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-carbonitriding/hodlmm-bin-carbonitriding.ts run
bun run hodlmm-bin-carbonitriding/hodlmm-bin-carbonitriding.ts run --pool 1
bun run hodlmm-bin-carbonitriding/hodlmm-bin-carbonitriding.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgCarbonitridingIndex": 54,
    "avgDrivingForce": 0.52,
    "avgKcnProxy": 0.82,
    "avgCnRatio": 0.68,
    "avgSurfaceActivity": 0.74,
    "avgEdgeLayerActivity": 0.74,
    "avgCoreActivity": 0.30,
    "avgSurfaceCoreDelta": 0.44,
    "avgEdgeDominanceFraction": 0.66,
    "avgAsymmetryIndex": 0.16,
    "avgGradientMonotonicity": 0.70,
    "avgErfcFit": 0.60,
    "avgErfcDt": 0.20,
    "avgCaseDepthProxy": 0.62,
    "avgCaseHardnessProxy": 0.65,
    "avgCoreToughnessProxy": 0.68,
    "avgWearResistanceProxy": 0.62,
    "avgFatigueResistanceProxy": 0.60,
    "avgDistortionProxy": 0.16,
    "avgCaseThicknessFraction": 0.32,
    "avgCarbonitrideProxy": 0.55,
    "avgRaProxy": 0.20,
    "avgNetworkRisk": 0.10,
    "avgAlloyFactorProxy": 0.42,
    "avgDiffusionZoneProxy": 0.62,
    "avgStageProgress": 0.55,
    "avgUnderCarbonitrideRisk": 0.20,
    "avgUnevenCarbonitridingRisk": 0.14,
    "intermediateFieldOkCount": 4,
    "subIntermediateFieldCount": 1,
    "overIntermediateFieldCount": 0,
    "kcnInWindowCount": 4,
    "cnRatioInWindowCount": 4,
    "alloyFormerOkCount": 4,
    "caseThicknessMeetsTargetCount": 3,
    "raExceedsTargetCount": 0,
    "preCarbonitrideCount": 0,
    "temperatureRampCount": 0,
    "potentialEstablishmentCount": 1,
    "dualDiffusionCount": 1,
    "carbonitridePrecipitationCount": 1,
    "effectiveCaseFormationCount": 1,
    "quenchReadyCount": 1,
    "overCarbonitridedCount": 0,
    "excessRetainedAusteniteCount": 0,
    "underCarbonitridedCount": 0,
    "unevenCarbonitridingCount": 0,
    "decarburizationLikeCount": 0,
    "overIntermediateFieldRegimeCount": 0,
    "subIntermediateFieldRegimeCount": 1,
    "noDriveCount": 0,
    "quenchReadyVerdictCount": 1
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
      "drivingForce": 0.55,
      "priorPeakDrivingForce": 0.87,
      "intermediateFieldOk": 1,
      "intermediateFieldProximity": 0.96,
      "subIntermediateField": 0,
      "overIntermediateField": 0,
      "kcProxy": 0.82,
      "knProxy": 0.78,
      "kcnProxy": 0.81,
      "kcnInWindow": 1,
      "kcnProximity": 0.97,
      "cnRatio": 0.70,
      "cnRatioInWindow": 1,
      "cnRatioProximity": 1.00,
      "surfaceActivity": 0.78,
      "edgeLayerActivity": 0.78,
      "diffusionZoneActivity": 0.78,
      "coreActivity": 0.28,
      "surfaceCoreDelta": 0.50,
      "surfaceCoreRatio": 2.79,
      "edgeDominanceFraction": 0.74,
      "surfaceLeftActivity": 0.76,
      "surfaceRightActivity": 0.80,
      "asymmetryIndex": 0.05,
      "gradientMonotonicity": 0.85,
      "erfcFit": 0.72,
      "erfcDt": 0.20,
      "diffusivityProxy": 0.0021,
      "caseDepthProxy": 0.77,
      "effectiveCaseBins": 9,
      "totalCaseBins": 13,
      "caseThicknessFraction": 0.41,
      "caseThicknessMeetsTarget": 1,
      "carbonitrideProxy": 0.65,
      "raProxy": 0.18,
      "raExceedsTarget": 0,
      "networkRisk": 0.08,
      "alloyFactorProxy": 0.42,
      "alloyFormerOk": 1,
      "diffusionZoneProxy": 0.78,
      "surfaceEstablishedProxy": 0.74,
      "uniformityIndex": 0.32,
      "reserveCV": 0.68,
      "reserveXFracStdev": 0.16,
      "underCarbonitrideRisk": 0.0,
      "unevenCarbonitridingRisk": 0.07,
      "reverseGradientRisk": 0.0,
      "overIntermediateRisk": 0.0,
      "subIntermediateRisk": 0.0,
      "caseHardnessProxy": 0.72,
      "coreToughnessProxy": 0.74,
      "wearResistanceProxy": 0.66,
      "fatigueResistanceProxy": 0.64,
      "distortionProxy": 0.13,
      "caseCoreRatio": 0.97,
      "arrheniusActivation": 0.0021,
      "stageProgress": 0.85,
      "dominantStage": 6,
      "carbonitridingIndex": 78,
      "carbonitridingRegime": "QUENCH_READY",
      "carbonitridingVerdict": "QUENCH_READY",
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

- Real carbonitriding is performed at 760-870 °C in a hybrid endothermic CH₄/CO + dissociated NH₃ atmosphere for 2-10 hours. Typical case depths 0.05-0.75 mm. Surface hardness 60-65 HRC. Distortion 0.05-0.15%. RA 10-30 vol%. Here drivingForce, surfaceActivity, edgeLayerActivity, kcProxy, knProxy, kcnProxy, cnRatio, erfcDt, caseDepthProxy, carbonitrideProxy, raProxy, and networkRisk are normalized 0-1 proxies derived from bin reserves and pool turnover, not actual thermal / wt% / mm / vol% quantities.
- Process-axis thresholds (INTERMEDIATE_FIELD_MIN=0.40, INTERMEDIATE_FIELD_MAX=0.70, INTERMEDIATE_FIELD_IDEAL=0.55, KCN_MIN=0.50, KCN_MAX=1.10, KCN_IDEAL=0.80, CN_RATIO_MIN=0.45, CN_RATIO_MAX=0.85, CN_RATIO_IDEAL=0.70, SURFACE_MIN_CN=0.65, SURFACE_PLATEAU_THRESHOLD=0.85, SURFACE_SATURATION=1.05, BOOST_TARGET=1.00, DIFFUSE_TARGET=0.85, CORE_BASELINE=0.18, ECD_THRESHOLD=0.40, TCD_THRESHOLD=0.22, CASE_THICKNESS_TARGET=0.24, NETWORK_SURFACE_FRAC=0.50, NETWORK_MAX=0.45, RA_MAX=0.35, RA_IDEAL=0.18, ALLOY_FACTOR_MIN=0.25, MONOTONICITY_MIN=0.55, ERFC_FIT_MIN=0.55, ASYMMETRY_MAX=0.35, REVERSE_THRESHOLD=0.10, Q_OVER_RT_CN_DIFFUSION=4.1, FDT_REFERENCE_CARBONITRIDING=0.26, CARBONITRIDING_HV_SCALE=1.05, DISTORTION_BASELINE=0.10) are normalized analogs. Real plain-C AC1 ≈ 727 °C; carbonitriding window 760-870 °C; γ stabilized down by N; austenite C+N solubility ≈ 1.2 wt% at 800 °C; M(C,N) ≤ 50 nm; RA 10-30 vol% target; D_C at 850 °C ≈ 6e-12 m²/s, D_N at 850 °C ≈ 2e-11 m²/s.
- Prior peak activity is a proxy: priorPeakDrivingForce = min(1, drivingForce × 1.3 + 0.15). Real carbonitriding requires known atmosphere composition, hold time, and Kc/Kn history.
- Bin-to-depth mapping treats the 1-D scan window as a 1-D slab cross-section with TWO surfaces (one at each end of the sorted bin array). depthFromSurface = min(i, N-1-i)/floor(N/2). Real workpieces are 3-D with multiple surfaces; the analog is heuristic.
- Per-bin "concentration" is max-normalized reserveUsd: conc_i = totalUsd_i / max(totalUsd). Real (C+N) profile is measured by GDOES, microprobe, or SEM-EDS at the nm-µm scale.
- Surface activity is the mean concentration in the first K and last K bins where K = floor(N × CASE_BAND_FRAC). Real surface (C+N) is measured at ≤ 0.05 mm depth.
- Edge-layer activity is the mean concentration in the first K and last K bins. Real case-layer composition is measured by metallography.
- Diffusion-zone activity equals edge-layer activity for carbonitriding (single-layer case — no compound layer split distinct from nitriding's split).
- Core activity is the mean concentration in the center floor(N × CORE_BAND_FRAC) bins. Real core composition is measured at depths > total case depth.
- Edge dominance fraction = surface / (surface + core). Values above 0.55 indicate surface-concentrated reserves.
- Asymmetry index = |leftMean − rightMean| / max(left, right). Values above 0.35 flag atmosphere shadowing.
- Gradient monotonicity = fraction of adjacent-bin pairs (moving edge→center) where the concentration is non-increasing (with 0.03 tolerance).
- Erfc fit is a goodness-of-fit (1 − MSE / variance) to a fitted erfc curve over candidate √(Dt) grid [0.05, 0.08, 0.12, 0.16, 0.22, 0.30, 0.40, 0.55, 0.80]. The best-fit √(Dt) is erfcDt. Real erfc fitting requires measured profile.
- Case depth proxy = erfcDt / FDT_REFERENCE_CARBONITRIDING (0.26), clipped. Real carbonitriding case depth is measured in mm (typically 0.05-0.75).
- Effective case bins = count of bins where conc ≥ ECD_THRESHOLD (0.40). Real ECD is the depth where HV drops to core + 50.
- Total case bins = count of bins where conc ≥ TCD_THRESHOLD (0.22).
- Case thickness fraction = effectiveCaseBins / (2 × floor(N/2)). Must meet CASE_THICKNESS_TARGET (0.24) for caseThicknessMeetsTarget=1.
- Kcn proxy = (kcProxy × 0.7 + knProxy × 0.3). Real KCN is computed from measured Kc = p(CO)²/p(CO₂) and Kn = p(NH₃)/p(H₂)^(3/2) on furnace exhaust mass spectrometry.
- Carbonitride proxy = composite of (surfaceMean ≥ 0.7) + cnRatioProximity + kcnInWindow + alloyFormerOk + caseDepthProxy. Real M(C,N) precipitate density is measured by TEM or FIB+atom probe.
- RA proxy combines (CN_RATIO_IDEAL − cnRatio) [N-rich → more RA] + surface saturation + edge variance + KCN over-window. Real RA is measured by XRD (R-method) or magnetic saturation.
- Network risk = composite of edge mean above NETWORK_SURFACE_FRAC + 0.30 + surface saturation + KCN above window. Real network is observed by SEM or optical metallography.
- Alloy-factor proxy = reserveXFracStdev × 2.0 + 0.10, clipped. Real alloy content is measured by OES or XRF on the bulk steel.
- Surface establishment proxy = (surfaceMean − CORE_BASELINE) / (BOOST_TARGET − CORE_BASELINE). Real surface establishment is measured by Kc/Kn-time history.
- Diffusion-zone proxy combines edge mean ≥ ECD + edge dominance ≥ EDGE_DOMINANCE_MIN + caseDepthProxy + alloyFormerOk. Real diffusion-zone hardness is measured by Knoop / Vickers microhardness traverse.
- Under-carbonitride risk triggers when KCN < KCN_MIN OR surfaceMean < SURFACE_MIN_CN OR caseThicknessFraction < CASE_THICKNESS_TARGET OR alloyFormerOk = 0.
- Uneven carbonitriding risk = combines asymmetry index and extreme single-side edge low-values.
- Reverse gradient risk = (surfaceMean + REVERSE_THRESHOLD < coreMean ? 0.6 : 0) + (edgeDominance < 0.45 ? 0.25 : 0) + (surfaceMean < CORE_BASELINE ? 0.15 : 0).
- Case hardness proxy = CARBONITRIDING_HV_SCALE × weighted composite of surface (C+N) + case thickness + carbonitride proxy + (1 − networkRisk) + (1 − raProxy × 0.5) + kcnProximity. Real carbonitriding case hardness is 60-65 HRC (≈ 700-800 HV).
- Core toughness proxy combines (1 − coreMean) + (coreMean ≤ CORE_BASELINE + 0.15) + (1 − overIntermediateRisk) + (1 − unevenCarbonitridingRisk). Real carbonitriding core toughness is preserved better than carburizing because milder quench, lower hold T.
- Wear resistance proxy = caseHardness × 0.55 + carbonitrideProxy × 0.20 + (1 − networkRisk) × 0.15 + (1 − raProxy × 0.5) × 0.10. Real wear resistance is measured by ASTM G65.
- Fatigue resistance proxy combines caseHardness + carbonitrideProxy + (1 − reverseGradientRisk) + (1 − networkRisk) + diffusionZoneProxy. Real fatigue resistance benefits from compressive residual stress (≈ −200 to −500 MPa) in the case.
- Distortion proxy = DISTORTION_BASELINE + overIntermediateRisk × 0.40 + networkRisk × 0.25 + unevenCarbonitridingRisk × 0.15 + raProxy × 0.20. Real carbonitriding dimensional change is 0.05-0.15% (between nitriding < 0.05% and carburizing 0.10-0.30%) — milder quench + lower hold T + N-lowered Ms.
- Case-to-core ratio = caseHardnessProxy / coreToughnessProxy. Desirable range is roughly 0.8-1.5.
- Arrhenius activation proxy uses Q_OVER_RT_CN_DIFFUSION = 4.1 on the normalized drivingForce axis. Real Q_eff for blended C+N diffusion is between Q_C (≈ 135 kJ/mol in γ-Fe) and Q_N (≈ 76 kJ/mol in α-Fe).
- Uniformity index (1 − reserveCV) is INFORMATIONAL: carbonitriding INTENTIONALLY breaks uniformity (edge-erfc gradient), so HIGH uniformity indicates NOT carbonitrided.
- DLMM bins are 1-D discrete structures; real carbonitrided case is a 3-D diffusion + precipitation profile with complex geometry near corners and edges. The analogy is heuristic.
- Analysis is snapshot-based; does not capture kinetics directly — dual-diffusion, carbonitride precipitation, RA development, and stage assignment are inferred from structural signatures rather than measured Kc/Kn-time-T history.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
