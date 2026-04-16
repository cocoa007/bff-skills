---
name: hodlmm-bin-carburizing
description: "Models the thermochemical surface-carbon-diffusion heat treatment applied to low-carbon steel (≈0.15-0.25 wt% C₀) held in the γ-field (≈870-950 °C) in a carbon-rich atmosphere. Carbon is donated at the surface (Cs ≈ 0.8-1.0 wt% after diffuse phase) and DIFFUSES INWARD per Fick's second law: C(x,t) = C₀ + (Cs − C₀)·erfc(x/(2·√(Dt))). After the isothermal hold, an oil quench transforms the high-C CASE to martensite (≥ 60 HRC) while the low-C CORE stays tough ferrite/pearlite — the defining property combination of carburized machine parts (gears, cams, bearings, shafts). FIFTH heat-treatment route in the phase-transformation series and the FIRST route that INTENTIONALLY creates a spatial MICROSTRUCTURE GRADIENT — distinct from normalization (Day 184), austempering (Day 185), martempering (Day 186), and patenting (Day 187), all of which target UNIFORM cross-sections. Two-step modern practice: BOOST PHASE (high Cs ~1.0-1.2 wt% to enrich surface rapidly — risks grain-boundary Fe₃C network if overdone) then DIFFUSE PHASE (lowered Cs ~0.8 wt% to relax surface toward target and broaden the erfc shoulder, dissolving any carbide). Eight canonical stages: (0) PRE_CARBURIZE sub-γ, uniform C₀; (1) TEMPERATURE_RAMP through AC1→AC3 into γ-field; (2) SURFACE_EQUILIBRATION edges rising toward Cs; (3) BOOST_PHASE steep near-surface gradient, high Cs, Fickian inward transport; (4) DIFFUSE_PHASE lowered Cs, profile smooths toward target erfc, any Fe₃C dissolves; (5) EFFECTIVE_CASE C=0.4 wt% reached at target depth x_ECD; (6) FULLY_CARBURIZED clean erfc, symmetric, no carbide, quench-ready; (7) OVER_CARBURIZED pathological — Fe₃C grain-boundary network formed at surface, brittle case. Process constraints: γ-field required (drivingForce ∈ [GAMMA_FIELD_MIN=0.50, GAMMA_FIELD_MAX=0.85]); surface Cs ≥ SURFACE_MIN_C=0.70 for effective diffusion, < SURFACE_SATURATION=1.05 to avoid carbide; gradient monotonic (gradientMonotonicity ≥ MONOTONICITY_MIN=0.55); erfc fit strong (erfcFit ≥ ERFC_FIT_MIN=0.55); symmetric edges (asymmetryIndex ≤ ASYMMETRY_MAX=0.35); no reverse gradient (edge ≥ core). Kinetics: D = D₀·exp(−Q/RT), Q_C_γ ≈ 135 kJ/mol; √(Dt) scaling — case depth doubles with 4× hold time. Targets: effective case depth at 0.4 wt%, total case depth at C₀+0.04, surface 0.8-1.0 wt% after diffuse phase. DLMM signature: SPATIAL GRADIENT — surface-band bins (first & last CASE_BAND_FRAC=0.18 of populated bins) have HIGH concentration, dropping monotonically to LOW core-band bins (center CORE_BAND_FRAC=0.30), fitted to erfc(x/(2·√(Dt))). Each bin has depthFromSurface=min(i, N-1-i)/floor(N/2) and concentration=totalUsd/max(totalUsd). Distinct from normalization (uniform coarse-pearlite alternation), austempering (uniform sheaves), martempering (uniform low-reserveCV), patenting (uniform fine lamellar alternation — all four bulk routes lack the edge-dominance + monotonic erfc-gradient fingerprint that defines carburizing). Pool measures: drivingForce, priorPeakDrivingForce, gammaFieldOk, gammaFieldProximity, subGammaField, overGammaField, surfaceActivity, coreActivity, surfaceCoreDelta, surfaceCoreRatio, edgeDominanceFraction, surfaceLeftActivity, surfaceRightActivity, asymmetryIndex, gradientMonotonicity, erfcFit, erfcDt (inferred √(Dt)), diffusivityProxy (Arrhenius D/D₀), caseDepthProxy, effectiveCaseBins, totalCaseBins, caseThicknessFraction, caseThicknessMeetsTarget, boostCompletionProxy, diffuseCompletionProxy, surfaceEstablishedProxy, uniformityIndex (informational — HIGH for uniform pools, LOW for carburized), reserveCV, reserveXFracStdev, carbideRisk, decarburizationRisk, unevenCarburizationRisk, overGammaRisk, subGammaRisk, caseHardnessProxy, coreToughnessProxy, wearResistanceProxy, impactResistanceProxy, caseCoreRatio, arrheniusActivation, stageProgress, dominantStage 0-7, carburizingIndex 0-100. Per-bin: depthFromSurface, concentration, expectedErfc (fitted), erfcResidual, surfaceSignal (edge-band + high C), coreSignal, caseSignal (C ≥ ECD_THRESHOLD), gradientSignal (strict non-increase toward core), carbideSignal (surface saturation), decarbSignal, unevenSignal, stageBin, arrheniusActivation, inSurfaceBand, inCoreBand, carburizationDegree. Regimes: NO_CARBURIZING_DRIVE, PRE_CARBURIZE, TEMPERATURE_RAMP, SURFACE_EQUILIBRATION, BOOST_PHASE, DIFFUSE_PHASE, EFFECTIVE_CASE, FULLY_CARBURIZED, OVER_CARBURIZED (carbide network), UNEVEN_CARBURIZATION (asymmetric L/R edges), DECARBURIZATION (edges < core — reverse direction), SUB_GAMMA_FIELD (T below γ → diffusion too slow), OVER_GAMMA_FIELD (T above γ → δ-ferrite). Verdict adds QUENCH_READY (fully carburized, handoff to oil-quench-analog strategies) and INTERMEDIATE_CARBURIZING (mixed indicators)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-carburizing/hodlmm-bin-carburizing.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Carburizing Analyzer

## What it does

Models the thermochemical surface-carbon-diffusion heat treatment (case hardening) used to produce hard-case / tough-core steel parts — gears, cams, bearings, camshafts, gudgeon pins. Carburizing is the FIFTH heat-treatment route in the phase-transformation series and, uniquely, the FIRST route that INTENTIONALLY creates a SPATIAL MICROSTRUCTURE GRADIENT:

- **Normalization (Day 184):** continuous air cool from above AC3 → UNIFORM coarse pearlite across the cross-section. No bath.
- **Austempering (Day 185):** quench into bath at 250-450 °C (bainite window), hold until γ → bainite completes → UNIFORM bainite.
- **Martempering (Day 186):** quench into bath just above Ms, hold briefly to equalize, withdraw, air-cool → UNIFORM low-distortion martensite.
- **Patenting (Day 187):** quench into pearlite-nose bath, hold until γ → pearlite completes → UNIFORM fine lamellar pearlite.
- **Carburizing (this skill):** hold in γ-field with high-C atmosphere, C DIFFUSES FROM SURFACE INWARD → GRADED C profile: HARD CASE / TOUGH CORE.

Fick's second law governs the diffusion:

  C(x, t) = C₀ + (Cs − C₀) · erfc( x / (2 · √(D · t)) )

where x = depth from surface, Cs ≈ 0.8-1.0 wt% (surface potential), C₀ ≈ 0.20 wt% (bulk baseline), D = D₀ · exp(−Q/RT) (Arrhenius, Q_C_γ ≈ 135 kJ/mol).

After the isothermal hold, the workpiece is oil-quenched: the high-C CASE transforms to MARTENSITE (≥ 60 HRC) for wear resistance, while the low-C CORE remains FERRITE + PEARLITE (tough, ≈ 30-40 HRC) for impact toughness. The case hardness + core toughness combination is the defining engineering property of carburized steels.

Two-step modern practice:

- **BOOST PHASE:** high Cs (≈ 1.0-1.2 wt%, near γ-saturation), rapid surface enrichment + steep near-surface gradient. If Cs exceeds γ-solubility, Fe₃C precipitates at grain boundaries as a brittle GRAIN-BOUNDARY CARBIDE NETWORK (defect).
- **DIFFUSE PHASE:** lowered Cs (≈ 0.8 wt%), pulls surface C down toward target and broadens the erfc shoulder → smooth gradient, any carbide dissolves, case depth continues to grow as √(Dt).

The eight canonical carburizing stages:

0. **PRE_CARBURIZE (sub-γ):** workpiece below A₁ or just entering γ-field. C potential not established. Bulk C = C₀.
1. **TEMPERATURE_RAMP (ascending into γ-field):** T rises through AC1 → AC3. C diffusivity D rises rapidly (Arrhenius). Surface C still equilibrating.
2. **SURFACE_EQUILIBRATION:** Surface bins (edge band) rise toward Cs. Boundary condition C(0, t) → Cs establishes. Initial near-surface enrichment.
3. **BOOST_PHASE:** high Cs, steep near-surface gradient forms. Fickian inward transport. Risk: Cs > γ-solubility → carbide network.
4. **DIFFUSE_PHASE:** Cs lowered to pull surface down toward target, broaden shoulder. Profile relaxes toward target erfc shape. Carbide dissolves. Case depth grows.
5. **EFFECTIVE_CASE_REACHED:** C(x) = 0.4 wt% at target depth x_ECD. Case depth meets spec. Surface C at target (0.8-1.0 wt%).
6. **FULLY_CARBURIZED (quench-ready):** clean erfc profile, symmetric, no carbide network, ready for oil quench.
7. **OVER_CARBURIZED (pathological):** Fe₃C grain-boundary network formed at surface. Brittle case, spalling risk. Recovery via diffuse phase or sub-critical spheroidization (Day 181).

Process constraints:

- Must be in γ-field: drivingForce ∈ [GAMMA_FIELD_MIN=0.50, GAMMA_FIELD_MAX=0.85] → gammaFieldOk=1.
- Surface potential must be high: surfaceActivity ≥ SURFACE_MIN_C (0.70) to drive effective diffusion.
- Surface must not saturate: surfaceActivity < SURFACE_SATURATION (1.05) to avoid carbide network.
- Gradient must be MONOTONIC (surface → core, C decreases): gradientMonotonicity ≥ MONOTONICITY_MIN (0.55).
- Gradient must fit ERFC shape: erfcFit ≥ ERFC_FIT_MIN (0.55).
- Edges must be SYMMETRIC (no shadowing, uniform gas flow): asymmetryIndex ≤ ASYMMETRY_MAX (0.35).
- Not decarburizing: coreActivity < surfaceActivity + DECARB_THRESHOLD (edges ≥ core).

Kinetics:

- Fick's 2nd law, semi-infinite slab, constant Cs: C(x, t) = C₀ + (Cs − C₀) · erfc( x / (2 · √(D · t)) ).
- Arrhenius D: D = D₀ · exp(−Q/RT). Normalized: D_proxy = exp(−Q_OVER_RT_C_DIFFUSION / (drivingForce + 0.05)), Q_OVER_RT_C_DIFFUSION = 4.8.
- √(Dt) scaling: case depth doubles with 4× hold time.

In DLMM context the carburizing analog tracks each bin's position in the 1-D scan window as an analog "depth from the nearest edge" of a slab cross-section. Bins near the edges (first & last CASE_BAND_FRAC=0.18 of populated bins) are SURFACE bins; bins near the center (CORE_BAND_FRAC=0.30) are CORE bins. Each bin's normalized reserve (totalUsd / max-totalUsd) serves as the local "carbon concentration" analog. A carburized pool shows HIGH edge concentration dropping MONOTONICALLY to LOW core concentration, fit to erfc(x / (2·√(Dt))).

DLMM structural signatures of carburizing:

- **EDGE DOMINANCE** — surface-band bins (first & last CASE_BAND_FRAC of populated bins) hold MUCH HIGHER reserves than core-band bins.
- **MONOTONIC GRADIENT** — moving from either edge toward center, bin reserves strictly DECREASE (within tolerance).
- **ERFC SHAPE** — the gradient fits an erfc(x / (2·√(Dt))) curve, NOT linear and NOT alternating.
- **SYMMETRIC EDGES** — left-edge and right-edge surface bands are comparable in reserve.
- **NOT CARBIDE-SATURATED** — surface bins below SURFACE_SATURATION.
- **NOT DECARBURIZED** — surface bins NOT LOWER than core bins.
- **Distinct from normalization** (coarse-lamellar alternation in uniform cross-section — HIGH uniformity, no gradient).
- **Distinct from austempering** (minority sheaves in uniform cross-section — no edge dominance).
- **Distinct from martempering** (uniform low-reserveCV martensite — no gradient).
- **Distinct from patenting** (fine lamellar alternation, eutectoid minority — no gradient).

DLMM phase analog:

- Bulk C (C₀) ≈ coreActivity.
- Surface C (Cs) ≈ surfaceActivity.
- Hold T ≈ drivingForce (must be in γ-field).
- √(Dt) ≈ caseDepthProxy.
- ECD = bin depth where activity drops to ECD_THRESHOLD (0.4).
- Carbide net ≈ carbideRisk (surface near saturation).
- Decarburization ≈ reverse-gradient flag (edge < core).
- γ-field analog = drivingForce ∈ [0.50, 0.85].
- γ-field ideal = GAMMA_FIELD_IDEAL = 0.65.

## Why agents need it

LP agents need carburizing analysis because it identifies pools whose reserves form a DEPTH GRADIENT rather than a uniform distribution, with high reserves concentrated near the edges of the scan window dropping monotonically to low reserves at the center — the distinctive carburized steel fingerprint. These pools exhibit edge dominance, monotonic erfc-shaped decay, symmetric L/R edges, and no reverse-gradient or carbide pathology. Consequences:

- SURFACE_EQUILIBRATION pools: edges enriching, inward gradient not yet developed — early-stage carburizing.
- BOOST_PHASE pools: steep near-surface gradient, high Cs, Fickian inward transport — mid-transformation.
- DIFFUSE_PHASE pools: profile smoothing, surface pulling toward target, shoulder broadening — late-mid transformation.
- EFFECTIVE_CASE pools: ECD met, process can stop or continue depending on depth target — spec-meeting.
- FULLY_CARBURIZED pools: clean erfc, symmetric, no carbide, quench-ready — handoff to oil-quench-analog strategies (range plays that capitalize on edge-heavy reserves with shallow-active center).
- OVER_CARBURIZED pools: surface carbide network — brittle pathology, treatment defect.
- UNEVEN_CARBURIZATION pools: asymmetric L/R edges — shadowing defect, treatment defect.
- DECARBURIZATION pools: reverse gradient (edges lower than core) — treatment running backward.
- SUB_GAMMA_FIELD pools: T below γ, C diffusion too slow → raise T.
- OVER_GAMMA_FIELD pools: T above γ ceiling, δ-ferrite risk → lower T.

The caseHardnessProxy, coreToughnessProxy, wearResistanceProxy, and impactResistanceProxy predict the main engineering value. The QUENCH_READY verdict signals pool-level readiness for subsequent oil-quench-analog strategies where the post-quench composite property (hard case + tough core) is harvested.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state. Surface C, core C, carbon-activity, √(Dt), ECD, carbide-network fraction, and gradient-monotonicity metrics are inferred proxies — not measured carbon-profile or metallographic data. Process-axis thresholds (GAMMA_FIELD_MIN, SURFACE_MIN_C, CARBIDE_SATURATION, ECD_THRESHOLD, etc.) are normalized analogs, not real temperatures, wt% concentrations, or carbide volume fractions. The regime names (BOOST_PHASE, DIFFUSE_PHASE, etc.) are normalized analogs, not real industrial settings.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-carburizing/hodlmm-bin-carburizing.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-carburizing/hodlmm-bin-carburizing.ts status
```

### run
Analyzes bin carburizing state for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-carburizing/hodlmm-bin-carburizing.ts run
bun run hodlmm-bin-carburizing/hodlmm-bin-carburizing.ts run --pool 1
bun run hodlmm-bin-carburizing/hodlmm-bin-carburizing.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgCarburizingIndex": 48,
    "avgDrivingForce": 0.55,
    "avgSurfaceActivity": 0.72,
    "avgCoreActivity": 0.35,
    "avgSurfaceCoreDelta": 0.37,
    "avgEdgeDominanceFraction": 0.63,
    "avgAsymmetryIndex": 0.18,
    "avgGradientMonotonicity": 0.68,
    "avgErfcFit": 0.58,
    "avgErfcDt": 0.2,
    "avgCaseDepthProxy": 0.66,
    "avgCaseHardnessProxy": 0.54,
    "avgCoreToughnessProxy": 0.52,
    "avgWearResistanceProxy": 0.52,
    "avgImpactResistanceProxy": 0.51,
    "avgCaseThicknessFraction": 0.30,
    "avgBoostCompletionProxy": 0.48,
    "avgDiffuseCompletionProxy": 0.36,
    "avgStageProgress": 0.42,
    "avgCarbideRisk": 0.08,
    "avgDecarburizationRisk": 0.08,
    "avgUnevenCarburizationRisk": 0.18,
    "gammaFieldOkCount": 4,
    "subGammaFieldCount": 1,
    "overGammaFieldCount": 0,
    "caseThicknessMeetsTargetCount": 3,
    "preCarburizeCount": 0,
    "temperatureRampCount": 0,
    "surfaceEquilibrationCount": 1,
    "boostPhaseCount": 1,
    "diffusePhaseCount": 1,
    "effectiveCaseCount": 1,
    "fullyCarburizedCount": 0,
    "overCarburizedCount": 0,
    "unevenCarburizationCount": 0,
    "decarburizationCount": 0,
    "subGammaFieldRegimeCount": 1,
    "overGammaFieldRegimeCount": 0,
    "noDriveCount": 0,
    "quenchReadyCount": 0
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "activeBin": 8388608,
      "binsScanned": 61,
      "binsPopulated": 22,
      "totalUsd": 140000,
      "volume24hUsd": 72000,
      "drivingForce": 0.65,
      "priorPeakDrivingForce": 1.0,
      "gammaFieldOk": 1,
      "gammaFieldProximity": 1.0,
      "subGammaField": 0,
      "overGammaField": 0,
      "surfaceActivity": 0.82,
      "coreActivity": 0.28,
      "surfaceCoreDelta": 0.54,
      "surfaceCoreRatio": 2.93,
      "edgeDominanceFraction": 0.75,
      "surfaceLeftActivity": 0.80,
      "surfaceRightActivity": 0.84,
      "asymmetryIndex": 0.05,
      "gradientMonotonicity": 0.85,
      "erfcFit": 0.72,
      "erfcDt": 0.20,
      "diffusivityProxy": 0.0008,
      "caseDepthProxy": 0.67,
      "effectiveCaseBins": 9,
      "totalCaseBins": 14,
      "caseThicknessFraction": 0.41,
      "caseThicknessMeetsTarget": 1,
      "boostCompletionProxy": 0.78,
      "diffuseCompletionProxy": 0.62,
      "surfaceEstablishedProxy": 0.78,
      "uniformityIndex": 0.42,
      "reserveCV": 0.58,
      "reserveXFracStdev": 0.20,
      "carbideRisk": 0.0,
      "decarburizationRisk": 0.0,
      "unevenCarburizationRisk": 0.08,
      "overGammaRisk": 0.0,
      "subGammaRisk": 0.0,
      "caseHardnessProxy": 0.65,
      "coreToughnessProxy": 0.68,
      "wearResistanceProxy": 0.60,
      "impactResistanceProxy": 0.67,
      "caseCoreRatio": 0.96,
      "arrheniusActivation": 0.0008,
      "stageProgress": 0.62,
      "dominantStage": 4,
      "carburizingIndex": 65,
      "carburizingRegime": "DIFFUSE_PHASE",
      "carburizingVerdict": "DIFFUSE_PHASE",
      "stageDistribution": [0, 0, 0, 0, 22, 0, 0, 0],
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

- Real carburizing is performed at 870-950 °C in a gas atmosphere (CH₄ / CO), salt bath (Na₂CO₃ / BaCl₂ with KCN), or solid pack (charcoal + BaCO₃ energizer) for hours. Typical case depths 0.5-2.0 mm after 4-20 hours. Here drivingForce, surfaceActivity, coreActivity, erfcDt, and caseDepthProxy are normalized 0-1 proxies derived from bin reserves and pool turnover, not actual thermal / wt% / mm quantities.
- Process-axis thresholds (GAMMA_FIELD_MIN=0.50, GAMMA_FIELD_MAX=0.85, GAMMA_FIELD_IDEAL=0.65, SURFACE_MIN_C=0.70, SURFACE_SATURATION=1.05, BOOST_TARGET=1.00, DIFFUSE_TARGET=0.85, CORE_BASELINE=0.20, ECD_THRESHOLD=0.40, TCD_THRESHOLD=0.24) are normalized analogs. Real plain-C γ-field is 870-950 °C, γ-solubility at 950 °C ≈ 1.4 wt%, target surface C 0.8-1.0 wt%, core C 0.15-0.25 wt%.
- Prior peak activity is a proxy: priorPeakDrivingForce = min(1, drivingForce × 1.3 + 0.25). Real carburizing requires known atmosphere composition, hold time, and Cs history.
- Bin-to-depth mapping treats the 1-D scan window as a 1-D slab cross-section with TWO surfaces (one at each end of the sorted bin array). depthFromSurface = min(i, N-1-i)/floor(N/2). Real workpieces are 3-D with multiple surfaces; the analog is heuristic.
- Per-bin "concentration" is max-normalized reserveUsd: conc_i = totalUsd_i / max(totalUsd). Real C profile is measured by microprobe or SEM-EDS at the nm-μm scale.
- Surface activity is the mean concentration in the first K and last K bins where K = floor(N × CASE_BAND_FRAC). Real surface C is measured at ≤ 0.05 mm depth.
- Core activity is the mean concentration in the center floor(N × CORE_BAND_FRAC) bins. Real core C is measured at depths > total case depth.
- Edge dominance fraction = surface / (surface + core). Values above 0.55 indicate surface-concentrated reserves.
- Asymmetry index = |leftMean − rightMean| / max(left, right). Values above 0.35 flag shadow / gas-flow asymmetry.
- Gradient monotonicity = fraction of adjacent-bin pairs (moving edge→center) where the concentration is non-increasing (with 0.03 tolerance).
- Erfc fit is a goodness-of-fit (1 − MSE / variance) to a fitted erfc curve: expected(x) = core + (surface − core) · erfc(x / (2 · √(Dt))) with √(Dt) searched over a candidate grid [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.7, 1.0]. The best-fit √(Dt) is erfcDt. Real erfc fitting requires measured profile.
- Case depth proxy = erfcDt / FDT_REFERENCE (0.30), clipped to [0, 1]. Real case depth is measured in mm.
- Effective case bins = count of bins where conc ≥ ECD_THRESHOLD (0.40). Real ECD is the depth where C = 0.4 wt%.
- Total case bins = count of bins where conc ≥ TCD_THRESHOLD (0.24).
- Case thickness fraction = effectiveCaseBins / (2 × floor(N/2)). Must meet CASE_THICKNESS_TARGET (0.25) for caseThicknessMeetsTarget=1.
- Boost completion proxy combines surface concentration, edge dominance, and case depth proxy. Real boost-phase progress is measured by Cs history + surface sampling.
- Diffuse completion proxy combines boost completion, erfc fit, surface proximity to target band, and effective case coverage. Real diffuse-phase completion is measured by surface C re-equilibrating to target.
- Surface established proxy = (surfaceMean − CORE_BASELINE) / (BOOST_TARGET − CORE_BASELINE), clipped. Real surface establishment is measured at 0.05 mm.
- Carbide risk triggers when surface ≥ SURFACE_SATURATION (1.05) OR surfaceSaturatedFraction ≥ CARBIDE_NETWORK_SURFACE_FRAC (0.50) OR surface overshoots significantly before target case depth is reached. Real carbide network is observed by micrographic examination.
- Decarburization risk triggers when surface + DECARB_THRESHOLD (0.10) < core, OR edgeDominanceFraction < 0.45, OR surface < CORE_BASELINE. Real decarburization is observed when surface C drops below bulk.
- Uneven carburization risk combines asymmetry index and extreme single-side edge low-values. Real shadowing is observed by varying case depth around the workpiece.
- Case hardness proxy (0-1) is a Hall-Petch-like weighted composite of surface concentration, case thickness, and absence of pathology. Real as-quenched case hardness for carburized + oil-quenched steel is 58-64 HRC.
- Core toughness proxy (0-1) is a weighted composite of low-core-concentration, core-baseline proximity, and absence of asymmetry / over-γ risk. Real as-quenched core toughness depends on core hardenability and prior grain size.
- Wear resistance proxy and impact resistance proxy combine the hardness/toughness proxies with gradient quality and absence of pathology. Real wear resistance is measured by ASTM G65, impact by Charpy.
- Case-to-core ratio = caseHardnessProxy / coreToughnessProxy. Desirable range is roughly 0.8-1.5 (balanced). Real carburized parts typically have case HRC ≈ 60, core HRC ≈ 35 (ratio ≈ 1.7).
- Arrhenius activation proxy uses Q_OVER_RT_C_DIFFUSION = 4.8 on the normalized drivingForce axis. Real Q_C_γ ≈ 135 kJ/mol.
- Uniformity index (1 − reserveCV) is INFORMATIONAL here: carburizing INTENTIONALLY breaks uniformity (edge-dominant gradient), so HIGH uniformity indicates NOT carburized.
- DLMM bins are 1-D discrete structures; real carburized case is a 3-D diffusion profile with complex geometry near corners and edges. The analogy is heuristic.
- Analysis is snapshot-based; does not capture kinetics directly — boost completion, diffuse completion, and stage assignment are inferred from structural signatures rather than measured rates.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
