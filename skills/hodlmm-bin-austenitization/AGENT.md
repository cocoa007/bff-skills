---
name: hodlmm-bin-austenitization-agent
skill: hodlmm-bin-austenitization
description: "Agent behavior for HODLMM bin austenitization analysis — interprets stageProgress (composite 0-1), dominantStage (0-5), nucleationDensity (Stage 1 austenite-at-boundary signal), dissolutionFraction (Stage 2 pro-eutectoid-phase dissolution), homogeneityIndex (Stage 3 reserve-uniformity), grainSize (Stage 4 matrix-run-length coarsening), coarsenedGrainCount, overheatedGrainCount, burnedRisk (Stage 5 pathological), ac1Crossed/ac3Crossed (phase-boundary crossings), hypoeutectoidSkew (composition analog for C content), eutectoidWindow (balanced-composition flag), reserveXFracStdev (key homogeneity proxy), reserveTotalCV, hjParameter (normalized Hollomon-Jaffe), jmaProgress (JMAK fraction transformed), arrheniusActivation, hardnessSeedProxy (Hall-Petch — finer γ seeds finer, harder daughter phase), toughnessSeedProxy (Hall-Petch — finer γ seeds tougher daughter phase), and overheatingRisk to identify pools in SUB_CRITICAL, AC1_NUCLEATION, AC3_APPROACH, FULLY_AUSTENITIZED, HOMOGENIZED, GRAIN_COARSENING, OVERHEATED, or BURNED regime and guide LP strategies — sub-critical pools preserve original microstructural memory (good for any phase-dependent strategy); nucleation/approach pools are dissolving their two-phase structure; homogenized pools are ideal seeds for controlled downstream transformations (martensite, bainite, pearlite, widmanstatten, spheroidite, tempering); coarsened/overheated pools have Hall-Petch-degraded daughter phases with reduced toughness; burned pools may be irrecoverable."
---

# Agent Behavior — HODLMM Bin Austenitization

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `austenitizationRegime`, `austenitizationVerdict`, `dominantStage`, `stageProgress`, `ac1Crossed`, `ac3Crossed`, `homogeneityIndex`, `grainSize`, and `overheatingRisk`.

## Interpreting output

- **austenitizationRegime = SUB_CRITICAL:** drivingForce < AC1_ACTIVITY or stageProgress < STAGE_1_BOUND. Original multi-phase microstructure intact — pro-eutectoid + pearlite-analog alternating bins preserved. Good seed for phase-dependent strategies that rely on existing structure.
- **austenitizationRegime = AC1_NUCLEATION:** ac1Crossed = 1 but stageProgress < STAGE_2_BOUND. Austenite nucleating at pearlite boundaries — the earliest dissolution signal. Minority cluster edges beginning to erode; matrix bins adjacent to minority developing intermediate xFrac.
- **austenitizationRegime = AC3_APPROACH:** ac1Crossed = 1, stageProgress ≥ STAGE_2_BOUND but ac3Crossed = 0. Pro-eutectoid minority clusters (hypoeutectoid) or pro-eutectoid clusters (hypereutectoid) actively dissolving. Minority cluster count dropping.
- **austenitizationRegime = FULLY_AUSTENITIZED:** ac3Crossed = 1, homogeneityIndex ≤ 0.7. Single-phase γ but C-heterogeneous — all minority clusters dissolved but bin reserves still uneven.
- **austenitizationRegime = HOMOGENIZED:** stageProgress ≥ STAGE_3_BOUND, homogeneityIndex > 0.7. Uniform reserve distribution — ideal seed for controlled downstream transformations.
- **austenitizationRegime = GRAIN_COARSENING:** coarsenedGrainCount > 0, stageProgress ≥ STAGE_4_BOUND. Matrix runs merging into long spans; Hall-Petch degradation of any daughter phase expected.
- **austenitizationRegime = OVERHEATED:** overheatedGrainCount > 0 and overheatingRisk > 0.7. Pathological grain coarsening.
- **austenitizationRegime = BURNED:** overheatedGrainCount > 0 and minorityFraction < BURNED_MINORITY_FLOOR (0.05). Potentially irrecoverable.
- **austenitizationVerdict = NO_AUSTENITIZATION_DRIVE:** drivingForce < 0.15. Insufficient turnover to drive transformation.
- **austenitizationVerdict = BURNED:** pathological combination of extreme grain coarsening and minority depletion.
- **austenitizationVerdict = OVERHEATED:** grain size pathological but minority not yet depleted.
- **austenitizationVerdict = GRAIN_COARSENING:** matrix runs beyond COARSENING_GRAIN_LEN (6).
- **austenitizationVerdict = HOMOGENIZED:** homogeneityIndex > 0.7 in Stage 3+.
- **austenitizationVerdict = FULLY_AUSTENITIZED:** AC3 crossed but C-heterogeneous.
- **austenitizationVerdict = AC3_APPROACH:** AC1 crossed, dissolution underway.
- **austenitizationVerdict = AC1_NUCLEATION:** nucleation signal elevated.
- **austenitizationVerdict = EUTECTOID_ENTRY:** balanced composition at AC1 crossing.
- **austenitizationVerdict = SUB_CRITICAL:** below AC1.
- **austenitizationVerdict = INTERMEDIATE_AUSTENITIZATION:** mixed indicators.
- **dominantStage = 0:** Sub-critical, no austenitization.
- **dominantStage = 1:** AC1 nucleation stage.
- **dominantStage = 2:** AC3 approach stage.
- **dominantStage = 3:** Homogenization stage.
- **dominantStage = 4:** Grain coarsening stage.
- **dominantStage = 5:** Overheated/burned stage.
- **ac1Crossed = 1:** Pool activity past AC1 threshold (0.2); transformation active.
- **ac3Crossed = 1:** Pool activity past AC3 (composition-adjusted) threshold; full single-phase.
- **nucleationDensity > 0.25:** Many matrix bins adjacent to minority with xFrac toward 0.5 — strong Stage 1 signal.
- **dissolutionFraction > 0.6:** Minority cluster count has dropped significantly — Stage 2 active.
- **homogeneityIndex > 0.7:** xFrac standard deviation low — reserves uniform, Stage 3 complete.
- **homogeneityIndex < 0.3:** xFrac standard deviation high — reserves still heterogeneous.
- **grainSize > COARSENING_GRAIN_LEN (6):** Average matrix run length past coarsening threshold.
- **grainSize > OVERHEAT_GRAIN_LEN (10):** Pathological coarsening.
- **eutectoidWindow = 1:** |hypoeutectoidSkew| < 0.1 — composition balanced (eutectoid-analog).
- **hardnessSeedProxy < 0.5:** Coarse γ expected to seed coarse daughter phase — reduced hardness.
- **toughnessSeedProxy < 0.3:** Coarse γ expected to seed tough-poor daughter phase.
- **overheatingRisk > 0.7:** Grain coarsening extreme with low minority.
- **burnedRisk ≥ 1:** Pathological combination present.
- **hjParameter > 0.7:** Hollomon-Jaffe high — advanced time-temperature equivalence.
- **jmaProgress > 0.7:** JMAK fraction transformed > 70% — late kinetic stage.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on austenitization signals from pools with fewer than 5 populated bins — insufficient data for stage inference.
- Do not treat SUB_CRITICAL as universally undesirable; it preserves the original microstructural memory and is valuable for strategies that depend on pre-existing structure.
- Do not treat HOMOGENIZED as universally desirable; it erases the microstructural memory and any phase-dependent strategy will see a "clean slate" without the prior minority cluster geometry.
- Do not treat GRAIN_COARSENING as permanent damage — it is reversible by re-cooling below AC1 and re-austenitizing with shorter hold time (grain refinement). OVERHEATED may still be recoverable by grain-refining treatments. BURNED is conventionally considered irrecoverable.
- Do not assume Hall-Petch applies to daughter phase hardness; in DLMM the "daughter phase" is not actually formed by quench — this is a seed-state proxy only.
- Do not assume the austenitization is "complete" at ac3Crossed = 1 — true completion requires homogenization (diffusion equilibration) which takes additional time beyond AC3 crossing.
- Do not assume eutectoidWindow = 1 means the pool is actually at the 0.77 wt% C eutectoid; it is a normalized skew proxy.
- Do not assume AC1/AC3 thresholds are calibrated temperatures; AC1_ACTIVITY = 0.2 and AC3_ACTIVITY_BASE = 0.5 are normalized turnover values.
- Do not assume nucleation detection is real austenite nucleation; it uses matrix-minority adjacency with xFrac shifted toward 0.5 as a structural surrogate.
- Do not assume dissolution detection measures real phase transformation rate; it uses minority-bin reserve relative to cluster mean.
- Do not assume homogeneity index measures real C gradients; it uses xFrac standard deviation.
- Do not assume grainSize is a real microstructural grain diameter; it is a 1-D bin-count proxy.
- Do not assume the hardnessSeed/toughnessSeed proxies predict real daughter-phase properties; they are Hall-Petch analog curves calibrated to normalized grain length.
- AC1_ACTIVITY = 0.2, AC3_ACTIVITY_BASE = 0.5, AC3_SKEW_OFFSET = 0.15, EUTECTOID_SKEW_WINDOW = 0.1, COARSENING_GRAIN_LEN = 6, OVERHEAT_GRAIN_LEN = 10, BURNED_MINORITY_FLOOR = 0.05, HOMOGENIZATION_CV_THRESHOLD = 0.12, JMA_N_EXPONENT = 1.5, ARRHENIUS_Q_OVER_RT = 5.0, NUCLEATION_DEVIATION_MAX = 0.3, HJ_CONSTANT = 20.0 are normalized proxy values; in real systems these are alloy-, temperature-, and time-specific.
- Analysis is snapshot-based; does not capture transformation kinetics directly — JMA progress, Arrhenius activation, HJ parameter, and stage assignment are inferred from structural signatures rather than measured rates.
- Driving force is inferred from 24h volume/TVL turnover — a proxy for "heat-treatment temperature × time" activation, not a real thermodynamic quantity.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "Austenitization analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest austenitizationIndex as the one with the most-advanced staged austenitization (best balance of stage progress, homogeneity, kinetic completion, and structural dissolution).
- Flag pools in SUB_CRITICAL regime as preserved-microstructure — original clusters and matrix intact, phase-dependent strategies remain applicable.
- Flag pools in AC1_NUCLEATION regime as earliest-dissolution — nucleation sites active, minority cluster edges eroding.
- Flag pools in AC3_APPROACH regime as dissolving — pro-eutectoid minority clusters actively transforming.
- Flag pools in FULLY_AUSTENITIZED regime as single-phase-but-heterogeneous — all minority dissolved but C-heterogeneous.
- Flag pools in HOMOGENIZED regime as ideal-seed — uniform reserves, best for controlled downstream transformations.
- Flag pools in GRAIN_COARSENING regime as Hall-Petch-degraded — coarse matrix runs predict coarse daughter phase.
- Flag pools in OVERHEATED regime as pathological-coarsening — may still be recoverable by grain-refining retreatment.
- Flag pools in BURNED regime as potentially-irrecoverable — extreme coarsening with minority near-depleted.
- Flag pools with ac1Crossed = 1 and ac3Crossed = 0 as in-transition — between AC1 and AC3 boundaries, dissolution partially complete.
- Flag pools with ac3Crossed = 1 and homogeneityIndex < 0.7 as needs-homogenization — single-phase γ but C-heterogeneous.
- Flag pools with eutectoidWindow = 1 as balanced-composition — minority and matrix roles near 50-50.
- Flag pools with hardnessSeedProxy < 0.5 as coarse-seed — daughter phase will inherit coarse features.
- Flag pools with toughnessSeedProxy < 0.3 as toughness-poor-seed — daughter phase will have reduced toughness.
- Flag pools with hjParameter > 0.7 and jmaProgress > 0.7 as fully kinetically advanced — late austenitization.
- Flag pools with hjParameter < 0.3 and jmaProgress < 0.3 as early-austenitization — most transformation still ahead.
- Report the inferred regime (SUB_CRITICAL, AC1_NUCLEATION, AC3_APPROACH, FULLY_AUSTENITIZED, HOMOGENIZED, GRAIN_COARSENING, OVERHEATED, or BURNED) and verdict.
- Show bins with stageBin = 1 as the austenite-nucleation-candidate positions.
- Show bins with stageBin = 2 as the pro-eutectoid-dissolution-candidate positions.
- Show bins with stageBin = 3 as the homogenization-candidate positions.
- Show bins with stageBin = 4 as the coarsening-member positions.
- Show bins with stageBin = 5 as the overheat-member positions.
- Show bins with highest nucleationSignal as the best Stage-1 candidates.
- Show bins with highest dissolutionSignal as the best Stage-2 candidates.
- Show bins with highest homogenizationSignal as the best Stage-3 candidates.
- Show bins with highest grainMembershipLen as the largest-grain positions.
- Show bins with highest hjLocal as the most-advanced-austenitization positions.
- Show bins with highest austeniteFraction as the most-γ-transformed positions.
- Show bins with highest austenitizednessIndex as the overall most-austenitized positions.
- For LP agents: in SUB_CRITICAL pools, use phase-dependent strategies (pearlite/bainite/spheroidite-analogs); in AC1_NUCLEATION/AC3_APPROACH pools, transition-aware strategies (expect cluster dissolution); in FULLY_AUSTENITIZED/HOMOGENIZED pools, uniform-exposure strategies; in GRAIN_COARSENING/OVERHEATED pools, Hall-Petch-aware strategies (expect coarse daughter features); in BURNED pools, reduce allocation or exit.
- For trading agents: SUB_CRITICAL pools have discrete-phase slippage profile (sharp transitions at phase boundaries); HOMOGENIZED pools have smooth continuous slippage; OVERHEATED/BURNED pools may show unpredictable slippage due to extreme matrix coarsening.
- Compare austenitization indices and stage progress across pools to find bins and pools with the strongest austenitization signature for the intended LP or trading strategy.
