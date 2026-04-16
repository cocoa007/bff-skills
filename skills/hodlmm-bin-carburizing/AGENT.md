---
name: hodlmm-bin-carburizing-agent
skill: hodlmm-bin-carburizing
description: "Agent behavior for HODLMM bin carburizing analysis — interprets stageProgress (composite 0-1), dominantStage (0-7), drivingForce, priorPeakDrivingForce, gammaFieldOk (0/1 drivingForce ∈ [0.50, 0.85]), gammaFieldProximity (0-1 closeness to GAMMA_FIELD_IDEAL=0.65), subGammaField (0/1), overGammaField (0/1), surfaceActivity (mean concentration in edge-bands = Cs analog), coreActivity (mean concentration in center-band = C₀ analog), surfaceCoreDelta, surfaceCoreRatio, edgeDominanceFraction (0-1 surface / (surface + core)), surfaceLeftActivity, surfaceRightActivity, asymmetryIndex (0-1 |L-R| / max(L,R) — shadowing proxy), gradientMonotonicity (0-1 fraction of edge→core pairs with non-increasing concentration), erfcFit (0-1 fit quality to erfc curve), erfcDt (inferred √(Dt)), diffusivityProxy (Arrhenius D/D₀), caseDepthProxy (0-1 √(Dt) / FDT_REFERENCE), effectiveCaseBins (count of bins with conc ≥ ECD_THRESHOLD=0.40), totalCaseBins, caseThicknessFraction, caseThicknessMeetsTarget (0/1 ≥ CASE_THICKNESS_TARGET=0.25), boostCompletionProxy, diffuseCompletionProxy, surfaceEstablishedProxy, uniformityIndex (INFORMATIONAL — HIGH means NOT carburized), carbideRisk (0-1 surface near SURFACE_SATURATION=1.05), decarburizationRisk (0-1 edges < core), unevenCarburizationRisk (0-1 asymmetric edges), overGammaRisk, subGammaRisk, caseHardnessProxy (0-1 Hall-Petch-like), coreToughnessProxy (0-1), wearResistanceProxy, impactResistanceProxy, caseCoreRatio to identify pools in NO_CARBURIZING_DRIVE, PRE_CARBURIZE, TEMPERATURE_RAMP, SURFACE_EQUILIBRATION, BOOST_PHASE, DIFFUSE_PHASE, EFFECTIVE_CASE, FULLY_CARBURIZED, OVER_CARBURIZED, UNEVEN_CARBURIZATION, DECARBURIZATION, SUB_GAMMA_FIELD, or OVER_GAMMA_FIELD regime and guide LP strategies — pre-carburize pools are cold; temperature-ramp pools are entering γ; surface-equilibration pools have edges enriching pre-inward-diffusion; boost-phase pools show steep near-surface gradient; diffuse-phase pools show smoothing shoulder; effective-case pools have ECD met; fully-carburized pools have clean erfc, symmetric, no carbide → QUENCH_READY for oil-quench-analog strategies; over-carburized pools have surface carbide network; uneven-carburization pools show shadow asymmetry; decarburization pools run in reverse (edges < core); sub-γ pools need raised T; over-γ pools need lowered T."
---

# Agent Behavior — HODLMM Bin Carburizing

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `carburizingRegime`, `carburizingVerdict`, `dominantStage`, `stageProgress`, `gammaFieldOk`, `surfaceActivity`, `coreActivity`, `edgeDominanceFraction`, `asymmetryIndex`, `gradientMonotonicity`, `erfcFit`, `caseDepthProxy`, `caseThicknessMeetsTarget`, `boostCompletionProxy`, `diffuseCompletionProxy`, `carbideRisk`, `decarburizationRisk`, `unevenCarburizationRisk`, `caseHardnessProxy`, and `coreToughnessProxy`.

## Interpreting output

- **carburizingRegime = NO_CARBURIZING_DRIVE:** priorPeakDrivingForce < GAMMA_FIELD_MIN × 0.8. No prior austenitization inferable. Analysis inapplicable.
- **carburizingRegime = PRE_CARBURIZE:** workpiece below A₁, no γ-field, no diffusion profile.
- **carburizingRegime = TEMPERATURE_RAMP:** gammaFieldOk=1 AND surfaceEstablishedProxy < 0.30. Entering γ-field, surface not yet enriched.
- **carburizingRegime = SURFACE_EQUILIBRATION:** gammaFieldOk=1 AND surfaceEstablishedProxy ≥ 0.30 AND boostCompletionProxy < 0.40. Surface rising toward Cs, inward gradient not yet developed.
- **carburizingRegime = BOOST_PHASE:** gammaFieldOk=1 AND boostCompletionProxy ≥ 0.40 AND edgeDominanceFraction ≥ 0.48. Steep near-surface gradient, high Cs.
- **carburizingRegime = DIFFUSE_PHASE:** gammaFieldOk=1 AND diffuseCompletionProxy ≥ 0.40 AND surfaceActivity ≥ SURFACE_MIN_C. Profile smoothing, surface toward target.
- **carburizingRegime = EFFECTIVE_CASE:** gammaFieldOk=1 AND caseThicknessMeetsTarget=1 AND surfaceActivity ≥ SURFACE_MIN_C. ECD met.
- **carburizingRegime = FULLY_CARBURIZED:** gammaFieldOk=1 AND surfaceActivity ≥ SURFACE_MIN_C AND edgeDominanceFraction ≥ EDGE_DOMINANCE_MIN (0.55) AND gradientMonotonicity ≥ MONOTONICITY_MIN (0.55) AND erfcFit ≥ ERFC_FIT_MIN (0.55) AND asymmetryIndex ≤ ASYMMETRY_MAX (0.35) AND caseThicknessMeetsTarget=1 AND stageProgress ≥ STAGE_6_BOUND (0.82). Clean profile, quench-ready.
- **carburizingRegime = OVER_CARBURIZED:** carbideRisk > 0.7. Surface carbide network formed.
- **carburizingRegime = UNEVEN_CARBURIZATION:** unevenCarburizationRisk > 0.6. Asymmetric L/R edges (shadowing).
- **carburizingRegime = DECARBURIZATION:** decarburizationRisk > 0.6. Reverse gradient (edges < core).
- **carburizingRegime = SUB_GAMMA_FIELD:** drivingForce < GAMMA_FIELD_MIN (0.50). T too low → C diffusion ineffective.
- **carburizingRegime = OVER_GAMMA_FIELD:** drivingForce > GAMMA_FIELD_MAX (0.85). T too high → δ-ferrite dynamics.
- **carburizingVerdict = NO_CARBURIZING_DRIVE:** no prior peak, cannot infer any γ-field hold.
- **carburizingVerdict = QUENCH_READY:** fully carburized, handoff to oil-quench-analog strategies.
- **carburizingVerdict = OVER_CARBURIZED:** treatment defect — carbide network, brittle case.
- **carburizingVerdict = DECARBURIZATION:** treatment running backward — surface C depleted.
- **carburizingVerdict = UNEVEN_CARBURIZATION:** shadow asymmetry, treatment defect.
- **carburizingVerdict = SUB_GAMMA_FIELD:** T too low; raise T or use sub-critical treatment.
- **carburizingVerdict = OVER_GAMMA_FIELD:** T too high; lower T back into γ.
- **carburizingVerdict = EFFECTIVE_CASE:** ECD met, diffuse may continue.
- **carburizingVerdict = DIFFUSE_PHASE:** mid-diffuse, gradient smoothing.
- **carburizingVerdict = BOOST_PHASE:** mid-boost, steep gradient forming.
- **carburizingVerdict = SURFACE_EQUILIBRATION:** edges enriching.
- **carburizingVerdict = TEMPERATURE_RAMP:** heating into γ.
- **carburizingVerdict = PRE_CARBURIZE:** cold.
- **carburizingVerdict = INTERMEDIATE_CARBURIZING:** mixed indicators.
- **dominantStage = 0:** pre-carburize / cold.
- **dominantStage = 1:** temperature ramp.
- **dominantStage = 2:** surface equilibration.
- **dominantStage = 3:** boost phase.
- **dominantStage = 4:** diffuse phase.
- **dominantStage = 5:** effective case reached.
- **dominantStage = 6:** fully carburized (quench-ready).
- **dominantStage = 7:** over-carburized (carbide network).
- **gammaFieldOk = 1:** drivingForce ∈ [0.50, 0.85] — γ-field hold valid.
- **gammaFieldProximity > 0.8:** drivingForce near GAMMA_FIELD_IDEAL (0.65) — optimal hold T.
- **surfaceActivity ≥ SURFACE_MIN_C (0.70):** surface C potential effective.
- **surfaceActivity ≥ SURFACE_SATURATION (1.05):** carbide-network risk — back off Cs.
- **coreActivity ≤ CORE_BASELINE + 0.10:** core remains low-C (as intended).
- **edgeDominanceFraction ≥ EDGE_DOMINANCE_MIN (0.55):** strong surface concentration.
- **asymmetryIndex ≤ ASYMMETRY_MAX (0.35):** edges symmetric — no shadowing.
- **gradientMonotonicity ≥ MONOTONICITY_MIN (0.55):** non-increasing edge→core — valid gradient.
- **erfcFit ≥ ERFC_FIT_MIN (0.55):** profile fits erfc — Fickian signature.
- **caseDepthProxy > 0.6:** inferred √(Dt) substantial — case has grown meaningfully.
- **caseThicknessMeetsTarget = 1:** effective-case bin count exceeds CASE_THICKNESS_TARGET fraction.
- **boostCompletionProxy > 0.7:** boost phase substantially progressed.
- **diffuseCompletionProxy > 0.7:** diffuse phase substantially progressed.
- **carbideRisk > 0.7:** pathology — grain-boundary Fe₃C network at surface.
- **decarburizationRisk > 0.6:** pathology — surface C depleted below core.
- **unevenCarburizationRisk > 0.6:** pathology — asymmetric edges (shadowing).
- **caseHardnessProxy > 0.6:** strong case hardness analog (Hall-Petch-like from surface C + case thickness).
- **coreToughnessProxy > 0.6:** strong core toughness analog (low-C core, clean gradient).
- **wearResistanceProxy > 0.6:** strong wear resistance analog.
- **impactResistanceProxy > 0.6:** strong impact resistance analog.
- **caseCoreRatio in [0.8, 1.5]:** balanced — typical carburized steel.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on carburizing signals from pools with fewer than 5 populated bins — insufficient data for gradient, erfc fit, or stage inference.
- Do not treat PRE_CARBURIZE as bad; it is the expected starting state before any heat-treatment cycle.
- Do not treat FULLY_CARBURIZED as a terminal operating state without considering the downstream OIL QUENCH step — in real carburizing the as-carburized workpiece is NOT yet hardened; the case hardness materializes only after the quench.
- Do not conflate carburizing with normalization/austempering/martempering/patenting: carburizing INTENTIONALLY creates a spatial gradient, while the four bulk routes target uniform cross-sections. A pool can only be "carburizing-like" if it shows the edge-dominance + monotonic erfc-gradient fingerprint.
- Do not conflate OVER_CARBURIZED with FULLY_CARBURIZED: OVER_CARBURIZED means surface exceeded γ-solubility and Fe₃C precipitated as a grain-boundary network, which is BRITTLE — not a successful treatment.
- Do not conflate DECARBURIZATION with PRE_CARBURIZE: PRE_CARBURIZE is the cold baseline state (uniform low C); DECARBURIZATION means the treatment ran BACKWARDS and the surface C was depleted below the core.
- Do not conflate UNEVEN_CARBURIZATION with OVER_CARBURIZED: UNEVEN_CARBURIZATION is a shadowing / gas-flow defect (symmetric case depth failed), while OVER_CARBURIZED is a surface-saturation defect (carbide network).
- Do not conflate SUB_GAMMA_FIELD with PRE_CARBURIZE: SUB_GAMMA_FIELD means the carburizing hold was at the WRONG T (below A₁), while PRE_CARBURIZE is the state before any hold is attempted.
- Do not conflate OVER_GAMMA_FIELD with FULLY_CARBURIZED: OVER_GAMMA_FIELD means T exceeded γ-field ceiling (δ-ferrite risk), regardless of profile quality.
- Do not assume drivingForce reflects real temperature; it is inferred from pool turnover (volume24hUsd / tvlUsd).
- Do not assume surfaceActivity measures real surface C concentration; it is the mean max-normalized reserveUsd of the first K and last K bins (K = floor(N × CASE_BAND_FRAC)).
- Do not assume coreActivity measures real core C concentration; it is the mean max-normalized reserveUsd of the center floor(N × CORE_BAND_FRAC) bins.
- Do not assume edgeDominanceFraction maps to real surface-to-core C ratio; it is surfaceMean / (surfaceMean + coreMean).
- Do not assume asymmetryIndex measures real shadowing; it is |leftMean − rightMean| / max(left, right) across the sorted bin window.
- Do not assume gradientMonotonicity measures real Fickian profile; it is the fraction of adjacent-bin pairs (moving edge→center) where the concentration is non-increasing (with 0.03 tolerance).
- Do not assume erfcFit measures real profile goodness-of-fit; it is (1 − MSE / variance) against a best-search-grid erfc curve.
- Do not assume erfcDt equals real √(Dt); it is the best-fit value over the candidate grid [0.05, 0.10, 0.15, 0.20, 0.30, 0.40, 0.50, 0.70, 1.00] on normalized depth units.
- Do not assume caseDepthProxy equals real case depth in mm; it is erfcDt / FDT_REFERENCE (0.30), clipped.
- Do not assume effectiveCaseBins / totalCaseBins equal real ECD / TCD in mm; they are counts of bins with concentration above normalized thresholds.
- Do not assume boostCompletionProxy / diffuseCompletionProxy match real boost / diffuse progress; they are composite proxies of structural fingerprints.
- Do not assume caseHardnessProxy / coreToughnessProxy / wearResistanceProxy / impactResistanceProxy equal real HRC / MPa / ASTM G65 / Charpy values; they are normalized composite proxies.
- Do not assume caseCoreRatio matches real Case_HRC / Core_HRC; real carburized steels typically have case HRC ≈ 60 and core HRC ≈ 35 (ratio ≈ 1.7), while the proxy is bounded to [0, 10].
- Do not assume uniformityIndex is a carburizing-quality metric; carburizing INTENTIONALLY breaks uniformity, so high uniformityIndex indicates NOT-carburized, not successful carburizing.
- Do not assume GAMMA_FIELD_MIN=0.50, GAMMA_FIELD_MAX=0.85, GAMMA_FIELD_IDEAL=0.65, SURFACE_MIN_C=0.70, SURFACE_SATURATION=1.05, BOOST_TARGET=1.00, DIFFUSE_TARGET=0.85, CORE_BASELINE=0.20, ECD_THRESHOLD=0.40, TCD_THRESHOLD=0.24, CASE_BAND_FRAC=0.18, CORE_BAND_FRAC=0.30, EDGE_DOMINANCE_MIN=0.55, MONOTONICITY_MIN=0.55, ERFC_FIT_MIN=0.55, ASYMMETRY_MAX=0.35, DECARB_THRESHOLD=0.10, CARBIDE_NETWORK_SURFACE_FRAC=0.50, CASE_THICKNESS_TARGET=0.25, Q_OVER_RT_C_DIFFUSION=4.8, FDT_REFERENCE=0.30, ERFC_DEPTH_SCALE=1.6 are real physical quantities; they are normalized proxy values on the drivingForce / reserve axes.
- Analysis is snapshot-based; does not capture transformation kinetics directly — boost completion, diffuse completion, erfc-fit √(Dt), and stage assignment are inferred from structural signatures rather than measured diffusion profiles.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "Carburizing analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest carburizingIndex as the one with the cleanest carburizing fingerprint (best balance of stage progress, gradient quality, property profile, and process avoidances).
- Flag pools in NO_CARBURIZING_DRIVE regime as no-prior-γ-hold — analysis inapplicable.
- Flag pools in PRE_CARBURIZE regime as cold — below A₁, no diffusion.
- Flag pools in TEMPERATURE_RAMP regime as heating — entering γ, surface not yet enriched.
- Flag pools in SURFACE_EQUILIBRATION regime as surface-rising — edges enriching pre-inward-diffusion.
- Flag pools in BOOST_PHASE regime as steep-gradient-forming — mid-transformation, high Cs.
- Flag pools in DIFFUSE_PHASE regime as shoulder-broadening — mid-late transformation.
- Flag pools in EFFECTIVE_CASE regime as ECD-met — process can stop or continue.
- Flag pools in FULLY_CARBURIZED regime as quench-ready — handoff to oil-quench-analog strategies.
- Flag pools in OVER_CARBURIZED regime as carbide-network — treatment defect.
- Flag pools in UNEVEN_CARBURIZATION regime as shadowing-defect — treatment defect.
- Flag pools in DECARBURIZATION regime as reverse-direction — treatment running backward.
- Flag pools in SUB_GAMMA_FIELD regime as T-too-low — raise T or use sub-critical skill.
- Flag pools in OVER_GAMMA_FIELD regime as T-too-high — lower T back into γ.
- Flag pools with gammaFieldOk=0 as out-of-γ-field.
- Flag pools with gammaFieldProximity > 0.8 as γ-ideal.
- Flag pools with surfaceActivity ≥ SURFACE_MIN_C as surface-established.
- Flag pools with surfaceActivity ≥ SURFACE_SATURATION as surface-saturated — carbide warning.
- Flag pools with edgeDominanceFraction ≥ EDGE_DOMINANCE_MIN as edge-dominant — carburizing-like.
- Flag pools with asymmetryIndex ≤ ASYMMETRY_MAX as symmetric.
- Flag pools with asymmetryIndex > ASYMMETRY_MAX as asymmetric — shadowing warning.
- Flag pools with gradientMonotonicity ≥ MONOTONICITY_MIN as monotonic.
- Flag pools with erfcFit ≥ ERFC_FIT_MIN as erfc-fitting.
- Flag pools with caseDepthProxy > 0.6 as deep-case.
- Flag pools with caseThicknessMeetsTarget=1 as ECD-met.
- Flag pools with boostCompletionProxy > 0.7 as boost-complete.
- Flag pools with diffuseCompletionProxy > 0.7 as diffuse-complete.
- Flag pools with carbideRisk > 0.7 as carbide-network-warning.
- Flag pools with decarburizationRisk > 0.6 as decarburization-warning.
- Flag pools with unevenCarburizationRisk > 0.6 as uneven-warning.
- Flag pools with caseHardnessProxy > 0.6 as hard-case-analog.
- Flag pools with coreToughnessProxy > 0.6 as tough-core-analog.
- Flag pools with wearResistanceProxy > 0.6 as wear-resistant-analog.
- Flag pools with impactResistanceProxy > 0.6 as impact-resistant-analog.
- Flag pools with caseCoreRatio in [0.8, 1.5] as balanced-case-core.
- Report the inferred regime and verdict.
- Show bins with stageBin = 1 as ramp positions.
- Show bins with stageBin = 2 as surface-equilibration positions.
- Show bins with stageBin = 3 as boost-phase positions.
- Show bins with stageBin = 4 as diffuse-phase positions.
- Show bins with stageBin = 5 as effective-case positions.
- Show bins with stageBin = 6 as fully-carburized positions.
- Show bins with stageBin = 7 as over-carburized positions (warning).
- Show bins with highest surfaceSignal as best surface-candidate positions.
- Show bins with highest coreSignal as best core-candidate positions.
- Show bins with highest caseSignal as best case-member positions.
- Show bins with highest gradientSignal as best gradient-aligned positions.
- Show bins with carbideSignal > 0.5 as carbide-warning positions.
- Show bins with decarbSignal = 1 as decarburization-warning positions.
- Show bins with unevenSignal > 0.5 as asymmetry-warning positions.
- Show bins with highest carburizationDegree as overall most-carburized positions.
- For LP agents: in PRE_CARBURIZE pools, use uniform-exposure strategies (no diffusion yet); in TEMPERATURE_RAMP and SURFACE_EQUILIBRATION pools, expect early edge enrichment — rebalancing toward edges may be premature; in BOOST_PHASE and DIFFUSE_PHASE pools, expect increasing edge dominance with monotonic gradient — edge-heavy range strategies align; in EFFECTIVE_CASE pools, case depth meets target — stable gradient; in FULLY_CARBURIZED pools, treat as quench-ready and consider oil-quench-analog strategies (concentrated range plays where the edge-heavy profile is about to be "locked in" by a subsequent treatment); in OVER_CARBURIZED pools, treat as defect and reallocate; in UNEVEN_CARBURIZATION pools, consider hedging the weaker-edge side; in DECARBURIZATION pools, the profile has reversed — treat opposite direction signals; in SUB_GAMMA_FIELD / OVER_GAMMA_FIELD pools, the T axis is outside the actionable window — wait or use complementary skills.
- For trading agents: BOOST_PHASE, DIFFUSE_PHASE, and FULLY_CARBURIZED pools have EDGE-DOMINANT reserves with SHALLOW ACTIVE CENTER — slippage through the center is higher than through the edges; route sizing accordingly. UNIFORM / uniformityIndex-high pools are NOT carburizing-like and should be analyzed with the four bulk skills (normalization, austempering, martempering, patenting).
- Compare carburizing indices and gradient quality across pools to find bins and pools with the strongest carburizing signature for the intended LP or trading strategy.
- When FULLY_CARBURIZED (QUENCH_READY verdict), the pool profile is suitable for downstream oil-quench-analog strategies; passing the pool ID and carburizing profile to subsequent case-hardening / quench skills is the intended handoff.
