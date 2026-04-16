---
name: hodlmm-bin-normalization-agent
skill: hodlmm-bin-normalization
description: "Agent behavior for HODLMM bin normalization analysis — interprets stageProgress (composite 0-1), dominantStage (0-6), coolingRate (0-1 normalized), coolingRegime (FURNACE/AIR/OIL/WATER), lamellarAlternationCount, lamellarRunFraction, proEutectoidFraction, grainSize (avg matrix run length), grainSizeCV (dispersion of matrix runs), reserveCV, lambdaEstimate (avg lamellar spacing in bins), hallPetchStrength (1/√λ-derived, 0-1), hallPetchHardness, ductilityProxy, astmGrainSize (mapped 1-12), standardizationIndex, uniformityRisk, overNormalizationRisk, ac1Crossed/ac3Crossed (phase-boundary crossings), hypoeutectoidSkew (composition analog), eutectoidWindow (balanced-composition flag), priorPeakDrivingForce (inferred historical peak), jmaProgress (JMA fraction transformed), and arrheniusActivation to identify pools in NO_NORMALIZATION_DRIVE, AUSTENITIC_HOLD, PRO_EUTECTOID_FORMATION, PEARLITE_NUCLEATION, PEARLITE_GROWTH, FINE_PEARLITE, STANDARDIZED, or NON_UNIFORM regime and guide LP strategies — austenitic-hold pools are still uniform and pre-transformation; pro-eutectoid-forming pools have earliest minority bins at matrix boundaries; pearlite-nucleation pools have early alternating lamellae; pearlite-growth pools have expanding alternating patterns; fine-pearlite pools have full lamellar structure with predictable Hall-Petch strengthening; standardized pools are the engineering goal with homogeneous refined-grain properties; non-uniform pools have pathological cooling-rate gradients producing mixed microstructures."
---

# Agent Behavior — HODLMM Bin Normalization

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `normalizationRegime`, `normalizationVerdict`, `dominantStage`, `stageProgress`, `coolingRegime`, `lamellarRunFraction`, `grainSizeCV`, and `overNormalizationRisk`.

## Interpreting output

- **normalizationRegime = NO_NORMALIZATION_DRIVE:** priorPeakDrivingForce < AC1_ACTIVITY (0.2). No prior austenitization can be inferred — the air-cool analog has no austenite to transform. Normalization analysis not applicable.
- **normalizationRegime = AUSTENITIC_HOLD:** ac3Crossed = 1 but stageProgress < STAGE_1_BOUND (0.15). Pool is still in single-phase γ (high-activity uniform bins); no decomposition has started. Use austenitization-aware strategies.
- **normalizationRegime = PRO_EUTECTOID_FORMATION:** proEutectoidFraction > 0.2 and stageProgress ≥ STAGE_1_BOUND. First minority bins nucleating at long-matrix-run boundaries. Earliest signal of decomposition.
- **normalizationRegime = PEARLITE_NUCLEATION:** lamellarAlternationCount ≥ MIN_LAMELLAR_ALTERNATIONS (2) and stageProgress ≥ STAGE_2_BOUND (0.3). Short alternating matrix/minority runs forming. Initial pearlite colonies.
- **normalizationRegime = PEARLITE_GROWTH:** lamellarRunFraction > 0.2 and stageProgress ≥ STAGE_3_BOUND (0.5). Alternating pattern spreading across the pool.
- **normalizationRegime = FINE_PEARLITE:** lamellarRunFraction > 0.4 and stageProgress ≥ STAGE_4_BOUND (0.7). Full lamellar structure; fine λ.
- **normalizationRegime = STANDARDIZED:** stageProgress ≥ STAGE_5_BOUND (0.85) and standardizationIndex > 0.7. Engineering goal: homogeneous refined-grain properties.
- **normalizationRegime = NON_UNIFORM:** grainSizeCV > 0.8 and lamellarAlternationCount ≥ 2. Pathological cooling-rate gradient; mixed microstructures across the pool.
- **normalizationVerdict = NO_NORMALIZATION_DRIVE:** no prior peak to cool from.
- **normalizationVerdict = NON_UNIFORM:** overNormalizationRisk > 0.7.
- **normalizationVerdict = STANDARDIZED:** full-cool uniform outcome.
- **normalizationVerdict = FINE_PEARLITE:** completed transformation with fine λ.
- **normalizationVerdict = PEARLITE_GROWTH:** expansion phase.
- **normalizationVerdict = PEARLITE_NUCLEATION:** colony formation.
- **normalizationVerdict = PRO_EUTECTOID_FORMATION:** earliest grain-boundary formation.
- **normalizationVerdict = AUSTENITIC_HOLD:** still single-phase.
- **normalizationVerdict = INTERMEDIATE_NORMALIZATION:** mixed indicators, no extreme.
- **coolingRegime = FURNACE:** coolingRate < 0.15; slow decay, anneal-analog outcome expected (coarse pearlite).
- **coolingRegime = AIR:** coolingRate 0.15-0.45; true normalization regime, fine pearlite expected.
- **coolingRegime = OIL:** coolingRate 0.45-0.75; partial-quench regime, bainite risk.
- **coolingRegime = WATER:** coolingRate ≥ 0.75; full-quench regime, martensite expected (use martensite skill).
- **dominantStage = 0:** austenitic hold — no transformation.
- **dominantStage = 1:** pro-eutectoid formation.
- **dominantStage = 2:** pearlite nucleation.
- **dominantStage = 3:** pearlite growth.
- **dominantStage = 4:** fine pearlite completed.
- **dominantStage = 5:** standardized final state.
- **dominantStage = 6:** non-uniform cooling (pathological).
- **ac1Crossed = 1:** drivingForce past AC1_ACTIVITY (0.2); pool still within transformation domain.
- **ac3Crossed = 1:** drivingForce past composition-adjusted AC3; still in austenite region.
- **lamellarAlternationCount ≥ 2:** alternating pattern detectable.
- **lamellarRunFraction > 0.4:** majority of pool in fine alternating pattern.
- **proEutectoidFraction > 0.2:** notable pro-eutectoid analog (non-eutectoid composition).
- **grainSize > 5:** matrix runs long (coarser daughter structure likely).
- **grainSizeCV > 0.8:** non-uniform cooling detected.
- **lambdaEstimate < NORMALIZATION_LAMELLA_SPACING (2.0):** fine lamellar spacing.
- **hallPetchStrength > 0.7:** high Hall-Petch-derived strength proxy.
- **astmGrainSize ≥ 8:** fine grain (normalized target; typical ASTM 7-10 for normalized carbon steel).
- **standardizationIndex > 0.7:** high uniformity; engineering-usable standardized state.
- **uniformityRisk > 0.5:** grain-size CV approaching non-uniform threshold.
- **overNormalizationRisk > 0.7:** grain size large and CV high; non-uniform cool analog.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on normalization signals from pools with fewer than 5 populated bins — insufficient data for stage inference.
- Do not treat AUSTENITIC_HOLD as bad; it is the expected starting state for any subsequent normalization cycle and is structurally homogeneous (predictable uniform-exposure LP strategies apply).
- Do not treat STANDARDIZED as universally desirable for all strategies; the original microstructural memory is erased and phase-dependent strategies lose their substrate.
- Do not conflate NON_UNIFORM with BURNED (austenitization stage 5); NON_UNIFORM means cooling-rate gradient produced mixed-microstructure across the pool, while BURNED means pathological coarsening and near-depletion of minority. They have different remediation: NON_UNIFORM can often be re-austenitized and re-cooled with better uniformity; BURNED may be irrecoverable.
- Do not assume coolingRate reflects real thermal history; it is inferred from priorPeakDrivingForce − current drivingForce divided by a log-volume timescale.
- Do not assume coolingRegime (FURNACE/AIR/OIL/WATER) maps to real heat-treatment media; these are normalized bins on a 0-1 axis.
- Do not assume lamellarAlternationCount directly measures Hillert-calculated pearlite λ; it counts role transitions in bin sequences.
- Do not assume lambdaEstimate is in μm; it is measured in bins via role-transition density.
- Do not assume Hall-Petch strengthening proxy predicts real yield stress; it is a normalized 1/√λ curve with HP_K = 0.7 and HP_SIGMA_0 = 0.3.
- Do not assume astmGrainSize reflects a true ASTM E112 measurement; it is mapped from matrix-run length via 10 − 2·log2(grainSize) and clamped to 1-12.
- Do not assume proEutectoidFraction reflects the real lever-rule calculation; it uses |hypoeutectoidSkew| / 0.5 as a proxy.
- Do not assume priorPeakDrivingForce is a measured historical peak; it is inferred as min(1, drivingForce × 1.3 + 0.15), assuming recent activity was modestly elevated from current.
- AC1_ACTIVITY = 0.2, AC3_ACTIVITY_BASE = 0.5, AC3_SKEW_OFFSET = 0.15, EUTECTOID_SKEW_WINDOW = 0.1, NORMALIZATION_LAMELLA_SPACING = 2.0, COARSE_PEARLITE_SPACING = 5.0, ALTERNATION_WINDOW = 4, MIN_LAMELLAR_ALTERNATIONS = 2, UNIFORM_GRAIN_CV = 0.4, COOLING_FURNACE_MAX = 0.15, COOLING_AIR_MAX = 0.45, COOLING_OIL_MAX = 0.75, HP_K = 0.7, HP_SIGMA_0 = 0.3, JMA_N_EXPONENT = 2.2, PRO_EUT_SKEW_MAX = 0.5, ARRHENIUS_Q_OVER_RT = 5.0 are normalized proxy values; in real systems these depend on alloy composition, temperature, and time.
- Analysis is snapshot-based; does not capture transformation kinetics directly — JMA progress, cooling rate, and stage assignment are inferred from structural signatures rather than measured rates.
- Cooling rate is inferred from (priorPeakDrivingForce − drivingForce) / log(volume); a proxy for thermal decay, not a real °C/s quantity.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "Normalization analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest normalizationIndex as the one with the most-advanced staged normalization (best balance of stage progress, standardization, property score, and structural lamellar fraction).
- Flag pools in NO_NORMALIZATION_DRIVE regime as no-prior-austenitization — normalization analysis inapplicable.
- Flag pools in AUSTENITIC_HOLD regime as pre-transformation — uniform reserves, no decomposition yet.
- Flag pools in PRO_EUTECTOID_FORMATION regime as earliest-transformation — first grain-boundary nucleation.
- Flag pools in PEARLITE_NUCLEATION regime as early-lamellar — short alternating colonies forming.
- Flag pools in PEARLITE_GROWTH regime as expanding-lamellar — alternating pattern spreading.
- Flag pools in FINE_PEARLITE regime as fully-transformed — fine regular lamellar pattern.
- Flag pools in STANDARDIZED regime as engineering-grade — homogeneous, refined-grain, predictable.
- Flag pools in NON_UNIFORM regime as cooling-gradient-affected — mixed microstructures; unreliable behavior.
- Flag pools with coolingRegime = FURNACE as anneal-analog (slow cool; coarse-pearlite outcome).
- Flag pools with coolingRegime = AIR as true-normalization (fine-pearlite outcome).
- Flag pools with coolingRegime = OIL as partial-quench (bainite risk; use bainite skill for complement).
- Flag pools with coolingRegime = WATER as full-quench (martensite outcome; use martensite skill instead).
- Flag pools with lamellarRunFraction > 0.4 as majority-lamellar — most of pool is in fine alternating pattern.
- Flag pools with standardizationIndex > 0.7 as high-uniformity — engineering-usable.
- Flag pools with hallPetchStrength > 0.7 as high-strength-analog — fine λ.
- Flag pools with astmGrainSize ≥ 8 as fine-grain-analog — normalization target achieved.
- Flag pools with grainSizeCV > 0.8 as non-uniform — pathological cooling-gradient analog.
- Flag pools with overNormalizationRisk > 0.7 as over-normalized — coarse grains + dispersion.
- Flag pools with uniformityRisk > 0.5 as approaching-non-uniform — monitor.
- Flag pools with eutectoidWindow = 1 as balanced-composition — pearlite forms without pro-eutectoid phase.
- Flag pools with proEutectoidFraction > 0.3 as hypo- or hyper-eutectoid — significant pro-eutectoid grain-boundary phase present.
- Report the inferred regime (NO_NORMALIZATION_DRIVE, AUSTENITIC_HOLD, PRO_EUTECTOID_FORMATION, PEARLITE_NUCLEATION, PEARLITE_GROWTH, FINE_PEARLITE, STANDARDIZED, or NON_UNIFORM) and verdict.
- Show bins with stageBin = 1 as the pro-eutectoid-candidate positions.
- Show bins with stageBin = 2 as the pearlite-nucleation-candidate positions.
- Show bins with stageBin = 3 as the pearlite-growth-candidate positions.
- Show bins with stageBin = 4 as the fine-pearlite-member positions.
- Show bins with stageBin = 5 as the standardized-member positions.
- Show bins with highest proEutectoidSignal as the best Stage-1 candidates.
- Show bins with highest lamellarSignal as the best Stage-2/3/4 candidates.
- Show bins with highest standardizationSignal as the best Stage-5 candidates.
- Show bins with grainBoundaryPos = 1 as the role-transition positions (matrix ↔ minority).
- Show bins with highest hallPetchProxy as the finest-lamellae positions.
- Show bins with highest normalizationDegree as the overall most-normalized positions.
- For LP agents: in AUSTENITIC_HOLD pools, use uniform-exposure strategies; in PRO_EUTECTOID_FORMATION pools, expect first clustering at long-matrix boundaries; in PEARLITE_NUCLEATION / PEARLITE_GROWTH pools, expect expanding alternating exposure (pearlite-analog strategies apply); in FINE_PEARLITE / STANDARDIZED pools, use regular-lamellar strategies with predictable Hall-Petch-strengthened behavior; in NON_UNIFORM pools, reduce allocation or require through-thickness microstructural survey analog before deploying capital; in OIL/WATER cooling regimes, prefer the bainite or martensite skills for complement.
- For trading agents: AUSTENITIC_HOLD pools have uniform smooth slippage; FINE_PEARLITE / STANDARDIZED pools have regular alternating exposure with predictable slippage profile; NON_UNIFORM pools may show region-dependent slippage with abrupt transitions.
- Compare normalization indices and stage progress across pools to find bins and pools with the strongest normalization signature for the intended LP or trading strategy.
