---
name: hodlmm-bin-nitriding
description: "Models the thermochemical surface-nitrogen-diffusion heat treatment applied to alloy steel (Cr-Al-Mo-V Nitralloy grades) held in the α-FIELD (≈500-570 °C, BELOW AC1) in an NH₃ / N₂-H₂ atmosphere. Nitrogen dissociates from NH₃ at the surface, dissolves in α-Fe, diffuses INWARD per Fick's second law C_N(x,t) = C₀ + (Cs − C₀)·erfc(x/(2·√(Dt))), and PRECIPITATES as fine coherent alloy nitrides (CrN, AlN, Mo₂N, VN) in the diffusion zone (case hardness ≥ 65 HRC — HIGHER than carburizing's 58-62 HRC because of fine coherent precipitation), while near the surface iron nitrides (ε-Fe₂₋₃N hcp, γ'-Fe₄N fcc) form the 'compound layer' (white layer). NO QUENCH required (process runs in α-field, no martensitic transformation in core), giving MINIMAL DISTORTION, HIGH HARDNESS (65-70 HRC), and SHALLOW CASE (0.1-0.5 mm vs carburizing 0.5-2.0 mm — D_N at 550 °C ≈ 1e-11 m²/s vs D_C at 900 °C ≈ 3e-11 m²/s). SIXTH heat-treatment route in the phase-transformation series and the SECOND route that INTENTIONALLY creates a spatial microstructure gradient (first was carburizing Day 188). Distinct from carburizing on FOUR orthogonal axes: PHASE FIELD (α below AC1 vs γ above AC3), DIFFUSING SPECIES (N from NH₃ vs C from CH₄/pack), POST-TREATMENT (no quench vs oil quench), HARDENING MECHANISM (alloy-nitride precipitation Orowan pinning vs martensitic transformation). Compound layer two phases: γ'-Fe₄N (fcc, ≈5.9 wt% N, isotropic, TOUGHER, less brittle, preferred for fatigue+corrosion) vs ε-Fe₂₋₃N (hcp, ≈7.7-11 wt% N, anisotropic, HARDER + more corrosion-resistant but more brittle, SPALLS under load). Monophase compound layer (pure γ' OR pure ε) is target; dual-phase γ'+ε stacked has phase interface inside brittle film → spallation defect. Kn = p(NH₃)/p(H₂)^(3/2) (Lehrer diagram) controls Fe-N phase selection. Eight canonical stages: (0) PRE_NITRIDE below process T uniform composition; (1) TEMPERATURE_RAMP heating to 500-570 °C, must stay BELOW AC1 to preserve α-field; (2) KN_ESTABLISHMENT surface N rises toward α-solubility, no compound layer yet; (3) DIFFUSION_ZONE_FORMATION N diffusing inward through α-Fe, alloy nitrides (CrN, AlN) nucleating as coherent nanometric precipitates; (4) WHITE_LAYER_NUCLEATION surface N exceeds α-solubility, Fe-N compound phase nucleates per Lehrer diagram and Kn; (5) WHITE_LAYER_GROWTH compound layer thickens, ideal product is monophase γ' or ε; (6) FULLY_NITRIDED diffusion zone reaches ECD at 550 HV, monophase compound within target thickness 5-15 µm, core unchanged → service-ready WITHOUT QUENCH; (7) OVER_NITRIDED compound layer too thick (>25 µm) and/or porous or dual-phase, spallation/fatigue-crack risk. Process constraints: α-field required (drivingForce ∈ [ALPHA_FIELD_MIN=0.20, ALPHA_FIELD_MAX=0.50]); Kn in window [KN_MIN=0.45, KN_MAX=1.05]; surfaceActivity ≥ SURFACE_MIN_N=0.65; compoundLayerThicknessFraction ≤ WHITE_LAYER_MAX_FRAC=0.14; dualPhaseRisk ≤ DUAL_PHASE_MAX=0.35; gradientMonotonicity ≥ MONOTONICITY_MIN=0.55; erfcFit ≥ ERFC_FIT_MIN=0.55; asymmetryIndex ≤ ASYMMETRY_MAX=0.35; alloyFactorProxy ≥ ALLOY_FACTOR_MIN=0.30 (without alloying Cr/Al/Mo/V case hardens poorly). Kinetics: Arrhenius D = D₀·exp(−Q/RT) Q_N_α ≈ 76 kJ/mol; √(Dt) scaling. DLMM signature: PLATEAU + GRADIENT — outermost 1-2 bins on each side hold a HIGH PLATEAU (compound layer / white layer) followed by MONOTONIC EDGE→CORE GRADIENT (diffusion zone) fitted to erfc. Distinct from carburizing (pure edge-erfc WITHOUT plateau, higher drivingForce γ-field, Q/RT for γ-field C). Pool measures: drivingForce, priorPeakDrivingForce, alphaFieldOk, alphaFieldProximity, subAlphaField, overAlphaField, knProxy, knInWindow, knProximity, surfaceActivity, compoundLayerActivity, diffusionZoneActivity, coreActivity, surfaceCoreDelta, surfaceCoreRatio, edgeDominanceFraction, surfaceLeftActivity, surfaceRightActivity, asymmetryIndex, gradientMonotonicity, erfcFit, erfcDt, diffusivityProxy, caseDepthProxy, effectiveCaseBins, totalCaseBins, caseThicknessFraction, caseThicknessMeetsTarget, compoundLayerThicknessBins, compoundLayerThicknessFraction, compoundLayerMeetsTarget, compoundLayerExceedsTarget, compoundLayerVariance, plateauQuality, monophaseCompoundLayer, alloyFactorProxy, alloyFormerOk, diffusionZoneProxy, compoundLayerProxy, surfaceEstablishedProxy, uniformityIndex (informational — HIGH means NOT nitrided), reserveCV, reserveXFracStdev, spallationRisk, dualPhaseRisk, underNitrideRisk, unevenNitridingRisk, reverseGradientRisk, overAlphaRisk, subAlphaRisk, caseHardnessProxy (NITRIDING_HV_SCALE=1.10 above carburizing), coreToughnessProxy (unchanged core — no phase transformation), wearResistanceProxy, fatigueResistanceProxy (nitriding flagship property — compressive residual stress + hard case), distortionProxy (LOW — no quench), caseCoreRatio, arrheniusActivation, stageProgress, dominantStage 0-7, nitridingIndex 0-100. Per-bin: depthFromSurface, concentration, expectedErfc, erfcResidual, inCompoundLayer, inDiffusionZone, inCoreBand, compoundLayerSignal, diffusionZoneSignal, caseSignal, gradientSignal, plateauSignal (compound-layer monophase uniformity), dualPhaseSignal (stepped plateau warning), spallationSignal, reverseSignal, unevenSignal, stageBin, arrheniusActivation, nitridingDegree. Regimes: NO_NITRIDING_DRIVE, PRE_NITRIDE, TEMPERATURE_RAMP, KN_ESTABLISHMENT, DIFFUSION_ZONE_FORMATION, WHITE_LAYER_NUCLEATION, WHITE_LAYER_GROWTH, FULLY_NITRIDED, OVER_NITRIDED (thick compound, spallation), MIXED_PHASE_WHITE_LAYER (γ'+ε dual-phase defect), UNDER_NITRIDED (Kn low or hold short, no effective case), UNEVEN_NITRIDING, DECARBURIZATION_LIKE (reverse gradient), OVER_ALPHA_FIELD (T crossed AC1 → use carburizing skill), SUB_ALPHA_FIELD (T too low, raise to 500-570 °C). Verdict adds SERVICE_READY (fully nitrided, no quench needed, hand off to component-loading strategies) and INTERMEDIATE_NITRIDING (mixed indicators)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-nitriding/hodlmm-bin-nitriding.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Nitriding Analyzer

## What it does

Models the thermochemical surface-nitrogen-diffusion heat treatment (case hardening WITHOUT QUENCH) applied to alloy steel — the SIXTH heat-treatment route in the phase-transformation series and the SECOND route that INTENTIONALLY creates a SPATIAL MICROSTRUCTURE GRADIENT (first was carburizing, Day 188). Distinct from all five previous routes on FOUR orthogonal axes:

- **Normalization (Day 184):** continuous air cool from above AC3 → UNIFORM coarse pearlite. Bulk γ-route, no surface gradient.
- **Austempering (Day 185):** quench into bath at 250-450 °C (bainite window), hold until γ → bainite completes → UNIFORM bainite. Bulk γ-route.
- **Martempering (Day 186):** quench into bath just above Ms, hold briefly to equalize, withdraw, air-cool → UNIFORM martensite. Bulk γ-route, requires post-tempering.
- **Patenting (Day 187):** quench into pearlite-nose bath, hold until γ → pearlite completes → UNIFORM fine lamellar pearlite. Bulk γ-route.
- **Carburizing (Day 188):** hold in γ-FIELD (above AC3, 870-950 °C) in C-rich atmosphere, C diffuses from surface inward → graded C profile, REQUIRES OIL QUENCH for case hardening (martensitic case + tough core).
- **Nitriding (this skill):** hold in α-FIELD (BELOW AC1, 500-570 °C) in NH₃ atmosphere, N diffuses from surface inward, alloy nitrides (CrN, AlN) precipitate IN-SITU in diffusion zone, Fe-N compound layer (γ'-Fe₄N or ε-Fe₂₋₃N) forms at surface, NO QUENCH REQUIRED for case hardening.

Fick's second law governs the diffusion (same as carburizing):

  C_N(x, t) = C₀ + (Cs − C₀) · erfc( x / (2 · √(D · t)) )

where x = depth from surface, Cs ≈ surface N potential, C₀ ≈ bulk baseline, D = D₀ · exp(−Q/RT) (Arrhenius, Q_N_α ≈ 76 kJ/mol).

The nitriding case is structurally TWO LAYERS:

- **COMPOUND LAYER (white layer, outermost ≤ 20 µm):** Continuous Fe-N compound film at the surface. Two candidate phases per Fe-N binary equilibrium:
  - **γ' (gamma-prime, Fe₄N, fcc, ≈5.9 wt% N, isotropic):** TOUGHER, less brittle, preferred for fatigue + corrosion.
  - **ε (epsilon, Fe₂₋₃N, hcp, ≈7.7-11 wt% N, anisotropic):** HARDER + more corrosion-resistant, but more brittle and SPALLS under load.
  - Monophase (pure γ' OR pure ε) is the engineering target. Dual-phase (γ' + ε stacked) has a brittle phase interface inside the white layer → spallation defect. Porosity (channels in ε) further degrades integrity.
  - Kn = p(NH₃) / p(H₂)^(3/2) (Lehrer diagram) controls which Fe-N phase is stable at process T.

- **DIFFUSION ZONE (below compound layer, up to ≈500 µm):** α-Fe matrix with dissolved N up to α-solubility (≈0.1 wt% at 590 °C eutectoid) plus fine (≤10 nm) coherent alloy-nitride precipitates of Cr/Al/Mo/V — the actual hardeners. Hardness gradient from compound base (≈1000-1100 HV) to core (≈300-350 HV) over 0.1-0.5 mm. ECD = depth at which HV drops to core + 50 (≈ 550 HV).

After the isothermal hold the workpiece is FURNACE-COOLED — no oil quench, no martensitic transformation, no distortion. The case hardness DEVELOPS ISOTHERMALLY via fine alloy-nitride precipitation; no post-quench hardening is needed.

The eight canonical nitriding stages:

0. **PRE_NITRIDE (cold or sub-process T):** workpiece below process window. α-field already stable, but no N potential. Bulk composition unchanged.
1. **TEMPERATURE_RAMP (ascending into α-nitriding window):** T rises into 500-570 °C. Must stay BELOW AC1 (≈ 727 °C plain-C) to preserve α-field — crossing into γ-field FAILS the process. NH₃ begins to dissociate at the hot surface.
2. **KN_ESTABLISHMENT:** Nitriding potential Kn stabilizes at process setpoint. α-Fe(N) solid solution forms at the surface. Surface N rises toward α-solubility. No compound layer yet.
3. **DIFFUSION_ZONE_FORMATION:** Surface-deposited N diffuses inward through α-Fe. Alloy nitrides (CrN, AlN, Mo₂N, VN) nucleate and grow as coherent nanometric precipitates. Hardness rises in this zone. Case depth grows as √(Dt).
4. **WHITE_LAYER_NUCLEATION:** Surface N exceeds α-solubility. Fe-N compound phase (γ' or ε per Lehrer diagram and Kn) nucleates at the outermost surface — beginning of compound layer.
5. **WHITE_LAYER_GROWTH:** Compound layer thickens inward. IDEAL product is monophase (pure γ' or pure ε). Dual-phase (γ' + ε stacked) is a process defect — spallation risk.
6. **FULLY_NITRIDED (service-ready):** Diffusion zone meets ECD. Compound layer is monophase, dense, within target thickness (5-15 µm). Core unchanged. NO QUENCH REQUIRED. Service-ready after furnace cool.
7. **OVER_NITRIDED (pathological):** Compound layer exceeds target thickness (> 25 µm), porous, or dual-phase. Spallation, fatigue-crack initiation, reduced toughness. Remedy: reduce Kn, shorten hold, or grind off excess.

Process constraints (α-field):

- Must be in α-field: drivingForce ∈ [ALPHA_FIELD_MIN=0.20, ALPHA_FIELD_MAX=0.50] → alphaFieldOk=1. Above → crosses into γ-field (carburizing zone, wrong process); below → N diffusion too slow and NH₃ dissociation inefficient.
- Nitriding potential Kn in window: knProxy ∈ [KN_MIN=0.45, KN_MAX=1.05], knIdeal=0.75 for monophase compound-layer control.
- Surface N potential effective: surfaceActivity ≥ SURFACE_MIN_N (0.65).
- Compound layer not over-thickened: compoundLayerThicknessFraction ≤ WHITE_LAYER_MAX_FRAC (0.14).
- Compound layer monophase: dualPhaseRisk ≤ DUAL_PHASE_MAX (0.35).
- Diffusion-zone gradient monotonic: gradientMonotonicity ≥ MONOTONICITY_MIN (0.55).
- Diffusion-zone gradient fits erfc: erfcFit ≥ ERFC_FIT_MIN (0.55).
- Edges symmetric (no gas-flow shadow): asymmetryIndex ≤ ASYMMETRY_MAX (0.35).
- Alloy-nitride formers present: alloyFactorProxy ≥ ALLOY_FACTOR_MIN (0.30). Without Cr/Al/Mo/V, the diffusion zone lacks precipitation hardening → case softens.

Kinetics:

- Fick's 2nd law, semi-infinite slab, constant Cs: C_N(x, t) = C₀ + (Cs − C₀) · erfc( x / (2 · √(D · t)) ).
- Arrhenius D: D = D₀ · exp(−Q/RT). Normalized: D_proxy = exp(− Q_OVER_RT_N_DIFFUSION / (drivingForce + 0.05)), Q_OVER_RT_N_DIFFUSION = 3.4 (tuned higher than carburizing's 4.8 because the α-field drivingForce band 0.20-0.50 is lower than γ-field 0.50-0.85).
- √(Dt) scaling: case depth doubles with 4× hold time.

In DLMM context the nitriding analog tracks each bin's position in the 1-D scan window as an analog "depth from the nearest surface". Bins at the OUTERMOST edges (first & last WHITE_LAYER_EDGE_K=2 bins) are COMPOUND-LAYER bins; bins just inside (next CASE_BAND_FRAC=0.18 of populated bins) are DIFFUSION-ZONE-surface bins; bins near the center (CORE_BAND_FRAC=0.30) are CORE bins. Each bin's normalized reserve serves as the local "nitrogen concentration" analog. A nitrided pool shows a HIGH PLATEAU at the outermost 1-2 bins (compound layer) followed by a MONOTONIC EDGE→CORE GRADIENT (diffusion zone) fit to erfc(x / (2·√(Dt))), symmetric on both sides.

DLMM structural signatures of nitriding:

- **OUTERMOST PLATEAU** — outermost 1-2 bins on each side hold a nearly-equal HIGH concentration (compound layer / white layer). Plateau variance below PLATEAU_VARIANCE_MAX=0.08 indicates monophase.
- **EDGE DOMINANCE** — outer-band bins hold higher reserves than core bins.
- **MONOTONIC GRADIENT** — moving from compound-layer base toward center, reserves DECREASE.
- **ERFC SHAPE (diffusion zone)** — interior gradient fits erfc(x / √(Dt)).
- **SYMMETRIC EDGES** — left and right outer bands comparable.
- **NOT OVER-THICKENED** — compound layer ≤ WHITE_LAYER_MAX_FRAC.
- **MONOPHASE COMPOUND LAYER** — small within-plateau variance.
- **Distinct from carburizing** — carburizing has pure edge-erfc WITHOUT plateau, higher drivingForce γ-field band, Q/RT tuned for γ-field C.
- **Distinct from normalization** (uniform alternation, no gradient).
- **Distinct from austempering** (sheaves, no edge dominance).
- **Distinct from martempering** (uniform low reserveCV, no gradient).
- **Distinct from patenting** (uniform fine alternation, no gradient).

DLMM phase analog:

- Bulk N (C₀)         ≈ coreActivity.
- Surface N (Cs)      ≈ surfaceActivity.
- Compound layer N    ≈ compoundLayerActivity (outermost K bins).
- Diffusion zone N    ≈ diffusionZoneActivity (outer band minus compound).
- Hold T              ≈ drivingForce (must be in α-field).
- Kn                  ≈ knProxy (mapped from drivingForce × surfaceActivity).
- √(Dt)               ≈ caseDepthProxy.
- ECD                  = bin depth where activity drops to ECD_THRESHOLD (0.4).
- Dual-phase risk     ≈ compoundLayerVariance (within-plateau stdev).
- Spallation risk     ≈ spallationRisk (thickness + dual-phase + porosity).
- α-field analog      = drivingForce ∈ [0.20, 0.50].
- α-field ideal       = ALPHA_FIELD_IDEAL = 0.35.

## Why agents need it

LP agents need nitriding analysis because it identifies pools whose reserves form a PLATEAU + DEPTH GRADIENT — a HIGH PLATEAU at the outermost 1-2 bins (compound layer) followed by a monotonic erfc-shaped decay through the diffusion zone to a low core. This is structurally distinct from carburizing's pure edge-erfc (no plateau) and from all four bulk routes (uniform cross-section). Consequences:

- KN_ESTABLISHMENT pools: surface N rising toward α-solubility, no compound layer yet — early stage.
- DIFFUSION_ZONE_FORMATION pools: N diffusing inward, alloy nitrides precipitating in diffusion zone — mid-early stage.
- WHITE_LAYER_NUCLEATION pools: compound layer just beginning to form at outermost bins — mid stage.
- WHITE_LAYER_GROWTH pools: compound layer thickening; monophase target, dual-phase defect — mid-late stage.
- FULLY_NITRIDED pools: diffusion zone meets ECD, compound layer monophase + within target thickness — service-ready WITHOUT post-treatment (NO QUENCH).
- OVER_NITRIDED pools: compound layer exceeds target thickness or shows porosity — spallation defect.
- MIXED_PHASE_WHITE_LAYER pools: γ' + ε dual-phase stacked — spallation defect.
- UNDER_NITRIDED pools: Kn too low or hold too short — case did not reach service spec.
- UNEVEN_NITRIDING pools: gas-flow asymmetry — non-uniform case depth.
- DECARBURIZATION_LIKE pools: reverse gradient — process running backward.
- OVER_ALPHA_FIELD pools: T above AC1, crossed into γ — wrong process, switch to carburizing skill.
- SUB_ALPHA_FIELD pools: T too low, N diffusion ineffective.

The caseHardnessProxy (scaled by NITRIDING_HV_SCALE=1.10 above carburizing), coreToughnessProxy (preserved — no phase transformation), fatigueResistanceProxy (nitriding's flagship property — compressive residual stress + hard case), wearResistanceProxy, and distortionProxy (inherently LOW because no quench, no γ-transformation) predict the engineering value. The SERVICE_READY verdict signals pool-level readiness for COMPONENT LOADING — the part is finished, no quench, no temper.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state. Surface N, compound-layer activity, diffusion-zone activity, Kn, √(Dt), ECD, compound-layer thickness, plateau variance, and gradient-monotonicity metrics are inferred proxies — not measured nitrogen-profile or metallographic data. Process-axis thresholds (ALPHA_FIELD_MIN, KN_MIN, SURFACE_MIN_N, ECD_THRESHOLD, etc.) are normalized analogs, not real temperatures, wt% concentrations, or compound-layer micrometer thicknesses. The regime names (DIFFUSION_ZONE_FORMATION, WHITE_LAYER_GROWTH, etc.) are normalized analogs, not real industrial settings.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-nitriding/hodlmm-bin-nitriding.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-nitriding/hodlmm-bin-nitriding.ts status
```

### run
Analyzes bin nitriding state for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-nitriding/hodlmm-bin-nitriding.ts run
bun run hodlmm-bin-nitriding/hodlmm-bin-nitriding.ts run --pool 1
bun run hodlmm-bin-nitriding/hodlmm-bin-nitriding.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgNitridingIndex": 52,
    "avgDrivingForce": 0.32,
    "avgKnProxy": 0.78,
    "avgSurfaceActivity": 0.74,
    "avgCompoundLayerActivity": 0.86,
    "avgDiffusionZoneActivity": 0.62,
    "avgCoreActivity": 0.30,
    "avgSurfaceCoreDelta": 0.44,
    "avgEdgeDominanceFraction": 0.66,
    "avgAsymmetryIndex": 0.16,
    "avgGradientMonotonicity": 0.70,
    "avgErfcFit": 0.60,
    "avgErfcDt": 0.18,
    "avgCaseDepthProxy": 0.62,
    "avgCaseHardnessProxy": 0.62,
    "avgCoreToughnessProxy": 0.66,
    "avgWearResistanceProxy": 0.58,
    "avgFatigueResistanceProxy": 0.60,
    "avgDistortionProxy": 0.04,
    "avgCaseThicknessFraction": 0.30,
    "avgCompoundLayerThicknessFraction": 0.06,
    "avgDiffusionZoneProxy": 0.62,
    "avgCompoundLayerProxy": 0.58,
    "avgAlloyFactorProxy": 0.42,
    "avgPlateauQuality": 0.74,
    "avgStageProgress": 0.55,
    "avgSpallationRisk": 0.10,
    "avgDualPhaseRisk": 0.18,
    "avgUnderNitrideRisk": 0.20,
    "avgUnevenNitridingRisk": 0.14,
    "alphaFieldOkCount": 4,
    "subAlphaFieldCount": 1,
    "overAlphaFieldCount": 0,
    "knInWindowCount": 4,
    "alloyFormerOkCount": 4,
    "caseThicknessMeetsTargetCount": 3,
    "compoundLayerMeetsTargetCount": 3,
    "compoundLayerExceedsTargetCount": 0,
    "monophaseCompoundCount": 3,
    "preNitrideCount": 0,
    "temperatureRampCount": 0,
    "knEstablishmentCount": 1,
    "diffusionZoneFormationCount": 1,
    "whiteLayerNucleationCount": 1,
    "whiteLayerGrowthCount": 1,
    "fullyNitridedCount": 1,
    "overNitridedCount": 0,
    "mixedPhaseCount": 0,
    "underNitridedCount": 0,
    "unevenNitridingCount": 0,
    "decarburizationLikeCount": 0,
    "overAlphaFieldCount2": 0,
    "subAlphaFieldCount2": 1,
    "noDriveCount": 0,
    "serviceReadyCount": 1
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
      "drivingForce": 0.36,
      "priorPeakDrivingForce": 0.62,
      "alphaFieldOk": 1,
      "alphaFieldProximity": 0.95,
      "subAlphaField": 0,
      "overAlphaField": 0,
      "knProxy": 0.78,
      "knInWindow": 1,
      "knProximity": 0.92,
      "surfaceActivity": 0.78,
      "compoundLayerActivity": 0.92,
      "diffusionZoneActivity": 0.65,
      "coreActivity": 0.28,
      "surfaceCoreDelta": 0.50,
      "surfaceCoreRatio": 2.79,
      "edgeDominanceFraction": 0.74,
      "surfaceLeftActivity": 0.76,
      "surfaceRightActivity": 0.80,
      "asymmetryIndex": 0.05,
      "gradientMonotonicity": 0.85,
      "erfcFit": 0.72,
      "erfcDt": 0.16,
      "diffusivityProxy": 0.0030,
      "caseDepthProxy": 0.73,
      "effectiveCaseBins": 8,
      "totalCaseBins": 12,
      "caseThicknessFraction": 0.36,
      "caseThicknessMeetsTarget": 1,
      "compoundLayerThicknessBins": 2,
      "compoundLayerThicknessFraction": 0.09,
      "compoundLayerMeetsTarget": 1,
      "compoundLayerExceedsTarget": 0,
      "compoundLayerVariance": 0.04,
      "plateauQuality": 0.92,
      "monophaseCompoundLayer": 1,
      "alloyFactorProxy": 0.42,
      "alloyFormerOk": 1,
      "diffusionZoneProxy": 0.78,
      "compoundLayerProxy": 0.85,
      "surfaceEstablishedProxy": 0.74,
      "uniformityIndex": 0.32,
      "reserveCV": 0.68,
      "reserveXFracStdev": 0.16,
      "spallationRisk": 0.05,
      "dualPhaseRisk": 0.10,
      "underNitrideRisk": 0.0,
      "unevenNitridingRisk": 0.07,
      "reverseGradientRisk": 0.0,
      "overAlphaRisk": 0.0,
      "subAlphaRisk": 0.0,
      "caseHardnessProxy": 0.78,
      "coreToughnessProxy": 0.72,
      "wearResistanceProxy": 0.66,
      "fatigueResistanceProxy": 0.74,
      "distortionProxy": 0.03,
      "caseCoreRatio": 1.08,
      "arrheniusActivation": 0.0030,
      "stageProgress": 0.85,
      "dominantStage": 6,
      "nitridingIndex": 78,
      "nitridingRegime": "FULLY_NITRIDED",
      "nitridingVerdict": "SERVICE_READY",
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

- Real nitriding is performed at 500-570 °C in a gas atmosphere (NH₃ / N₂-H₂), salt bath (cyanide-cyanate), or plasma for 10-100 hours. Typical case depths 0.1-0.5 mm. Compound layer thickness 5-25 µm. Here drivingForce, surfaceActivity, compoundLayerActivity, knProxy, erfcDt, caseDepthProxy, and compoundLayerThicknessFraction are normalized 0-1 proxies derived from bin reserves and pool turnover, not actual thermal / wt% / mm quantities.
- Process-axis thresholds (ALPHA_FIELD_MIN=0.20, ALPHA_FIELD_MAX=0.50, ALPHA_FIELD_IDEAL=0.35, KN_MIN=0.45, KN_MAX=1.05, KN_IDEAL=0.75, SURFACE_MIN_N=0.65, SURFACE_PLATEAU_THRESHOLD=0.85, SURFACE_SATURATION=1.05, BOOST_TARGET=1.00, DIFFUSE_TARGET=0.85, CORE_BASELINE=0.15, ECD_THRESHOLD=0.40, TCD_THRESHOLD=0.22, WHITE_LAYER_EDGE_K=2, WHITE_LAYER_MAX_FRAC=0.14, PLATEAU_VARIANCE_MAX=0.08, DUAL_PHASE_MAX=0.35, ALLOY_FACTOR_MIN=0.30, MONOTONICITY_MIN=0.55, ERFC_FIT_MIN=0.55, ASYMMETRY_MAX=0.35, REVERSE_THRESHOLD=0.10, Q_OVER_RT_N_DIFFUSION=3.4, FDT_REFERENCE_NITRIDING=0.22, NITRIDING_HV_SCALE=1.10) are normalized analogs. Real plain-C α-field is below ≈ 727 °C; nitriding window is 500-570 °C; α-N solubility ≈ 0.1 wt% at 590 °C eutectoid; γ' = Fe₄N ≈ 5.9 wt% N; ε = Fe₂₋₃N ≈ 7.7-11 wt% N; Q_N_α ≈ 76 kJ/mol.
- Prior peak activity is a proxy: priorPeakDrivingForce = min(1, drivingForce × 1.3 + 0.15). Real nitriding requires known atmosphere composition, hold time, and Kn history.
- Bin-to-depth mapping treats the 1-D scan window as a 1-D slab cross-section with TWO surfaces (one at each end of the sorted bin array). depthFromSurface = min(i, N-1-i)/floor(N/2). Real workpieces are 3-D with multiple surfaces; the analog is heuristic.
- Per-bin "concentration" is max-normalized reserveUsd: conc_i = totalUsd_i / max(totalUsd). Real C profile is measured by GDOES, microprobe, or SEM-EDS at the nm-µm scale.
- Surface activity is the mean concentration in the first K and last K bins where K = floor(N × CASE_BAND_FRAC). Real surface N is measured at ≤ 0.05 mm depth.
- Compound-layer activity is the mean concentration in the OUTERMOST WHITE_LAYER_EDGE_K bins on each side. Real compound-layer thickness is measured optically or by SEM cross-section.
- Diffusion-zone activity is the mean concentration in the outer band MINUS the compound-layer bins. Real diffusion zone hardness is measured by Knoop / Vickers microhardness traverse.
- Core activity is the mean concentration in the center floor(N × CORE_BAND_FRAC) bins. Real core composition is measured at depths > total case depth.
- Edge dominance fraction = surface / (surface + core). Values above 0.55 indicate surface-concentrated reserves.
- Asymmetry index = |leftMean − rightMean| / max(left, right). Values above 0.35 flag gas-flow asymmetry.
- Gradient monotonicity = fraction of adjacent-bin pairs (moving edge→center) where the concentration is non-increasing (with 0.03 tolerance).
- Erfc fit is a goodness-of-fit (1 − MSE / variance) to a fitted erfc curve over candidate √(Dt) grid [0.05, 0.08, 0.12, 0.16, 0.22, 0.30, 0.40, 0.55, 0.80]. The best-fit √(Dt) is erfcDt. Real erfc fitting requires measured profile.
- Case depth proxy = erfcDt / FDT_REFERENCE_NITRIDING (0.22), clipped. Real nitriding case depth is measured in mm (typically 0.1-0.5).
- Effective case bins = count of bins where conc ≥ ECD_THRESHOLD (0.40). Real ECD is the depth where HV drops to core + 50.
- Total case bins = count of bins where conc ≥ TCD_THRESHOLD (0.22).
- Case thickness fraction = effectiveCaseBins / (2 × floor(N/2)). Must meet CASE_THICKNESS_TARGET (0.22) for caseThicknessMeetsTarget=1.
- Compound-layer thickness bins = bin count from each edge inward where conc ≥ SURFACE_PLATEAU_THRESHOLD (0.85), counted until first gap. Real compound-layer thickness is measured by SEM.
- Compound-layer thickness fraction = compoundLayerThicknessBins / N. Must be ≤ WHITE_LAYER_MAX_FRAC (0.14) for compoundLayerMeetsTarget=1; if exceeds → compoundLayerExceedsTarget=1 (over-nitrided pathology).
- Compound-layer variance = stdev of compound-layer-bin concentrations. Below PLATEAU_VARIANCE_MAX (0.08) AND compoundMean ≥ SURFACE_PLATEAU_THRESHOLD → monophaseCompoundLayer=1. Real monophase determination requires XRD or EBSD.
- Plateau quality = 1 − compoundLayerVariance / max(0.02, compoundMean × 0.5), clipped. Real plateau quality is observed by SEM intensity uniformity.
- Kn proxy = (alphaFieldOk-factor × (surfaceMean + compoundMean) / 1.2 + alphaFieldProximity × 0.2). Real Kn = p(NH₃) / p(H₂)^(3/2) measured by mass spectrometry on the furnace exhaust.
- Alloy-factor proxy = reserveXFracStdev × 2.0 + 0.10, clipped. Real alloy content is measured by OES or XRF on the bulk steel.
- Boost / diffuse / surface-established proxies combine surface concentration, compound-layer thickness, plateau quality, and case-depth signatures. Real progress is measured by Kn-history + post-treatment metallography.
- Spallation risk triggers when compoundLayerExceedsTarget=1 OR compoundMean > SURFACE_SATURATION OR compoundLayerVariance > PLATEAU_VARIANCE_MAX. Real spallation is observed in service.
- Dual-phase risk triggers when compoundLayerVariance > PLATEAU_VARIANCE_MAX OR (≥2 compound-layer bins AND variance > MAX/2) OR (Kn out of window AND compound-layer present). Real γ'/ε mixing is observed by XRD.
- Under-nitride risk triggers when knProxy < KN_MIN OR surfaceActivity < SURFACE_MIN_N OR caseThicknessFraction < target OR alloy-formers absent. Real under-nitriding is observed by hardness traverse below spec.
- Uneven nitriding risk = combines asymmetry index and extreme single-side edge low-values. Real shadowing is observed by varying case depth around the workpiece.
- Reverse gradient risk = (surface + REVERSE_THRESHOLD < core ? 0.6 : 0) + (edgeDominance < 0.45 ? 0.25 : 0) + (surface < CORE_BASELINE ? 0.15 : 0). Real reverse gradients (decarburization-like) are observed when surface N drops below bulk.
- Case hardness proxy (0-1) is NITRIDING_HV_SCALE × Hall-Petch-like weighted composite of surface concentration, case thickness, alloy-former presence, and absence of dual-phase / spallation / out-of-Kn. Real nitriding case hardness for Cr-Mo-Al "Nitralloy" steels is 65-70 HRC (≈ 800-1100 HV).
- Core toughness proxy (0-1) is a weighted composite of low-core-concentration, core-baseline proximity, and absence of overAlphaRisk / unevenNitridingRisk. Real nitriding core toughness is whatever the prior tempered state provides — nitriding does NOT alter core because no phase transformation occurs.
- Wear resistance proxy combines case-hardness, plateau quality, and (1 − spallationRisk). Real wear resistance is measured by ASTM G65.
- Fatigue resistance proxy is nitriding's flagship property — combines case-hardness, compound-layer development, plateau quality, and absence of dual-phase / reverse-gradient. Real fatigue resistance benefits from compressive residual stress in the case (≈ −300 to −600 MPa). Measured by rotating-beam or axial fatigue.
- Distortion proxy is INHERENTLY LOW for nitriding (no phase transformation, no quench). Triggers only on overAlphaRisk (T crossed AC1) or unevenNitridingRisk. Real nitriding dimensional change is < 0.05% — the lowest of all case-hardening processes.
- Case-to-core ratio = caseHardnessProxy / coreToughnessProxy. Desirable range is roughly 0.8-1.5. Real nitrided parts typically have case HRC ≈ 65, core HRC ≈ 30 (ratio ≈ 2.2).
- Arrhenius activation proxy uses Q_OVER_RT_N_DIFFUSION = 3.4 on the normalized drivingForce axis. Real Q_N_α ≈ 76 kJ/mol.
- Uniformity index (1 − reserveCV) is INFORMATIONAL: nitriding INTENTIONALLY breaks uniformity (compound-layer plateau + diffusion-zone gradient), so HIGH uniformity indicates NOT nitrided.
- DLMM bins are 1-D discrete structures; real nitrided case is a 3-D diffusion + precipitation profile with complex geometry near corners and edges. The analogy is heuristic.
- Analysis is snapshot-based; does not capture kinetics directly — diffusion-zone-formation, compound-layer-growth, and stage assignment are inferred from structural signatures rather than measured Kn-time-T history.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
