---
name: hodlmm-bin-boronizing-agent
skill: hodlmm-bin-boronizing
description: "Agent behavior for HODLMM bin boronizing analysis — interprets stageProgress (composite 0-1), dominantStage (0-7), drivingForce, priorPeakDrivingForce, boronizingFieldOk (0/1 drivingForce ∈ [0.50, 0.88]), boronizingFieldProximity (0-1 closeness to BORONIZING_FIELD_IDEAL=0.68), subBoronizingField (0/1), overBoronizingField (0/1), kbProxy (0-2 boron potential analog), kbInWindow (0/1 ∈ [KB_MIN=0.40, KB_MAX=1.15]), kbProximity (0-1 closeness to KB_IDEAL=0.75), surfaceActivity (mean concentration in outer band = surface B-analog), compoundLayerActivity (= surfaceActivity — outer band), compoundLayerVariance (stdev within compound-layer band), plateauQuality (0-1 monophase Fe₂B flatness), feBFractionProxy (0-1 FeB outer-layer fraction — HIGH is PATHOLOGICAL), feBDominantRisk (0/1 feBFractionProxy > FEB_FRACTION_MAX=0.30), fe2BDominantProxy (0-1 Fe₂B monophase quality — HIGH is DESIRABLE), spallationRisk (0-1 spallation composite — HIGH is DEFECT), compoundLayerThicknessBins (count), compoundLayerFraction (0-1 fraction of scan band), compoundLayerMeetsTarget (0/1 in [COMPOUND_LAYER_MIN_FRAC=0.04, COMPOUND_LAYER_MAX_FRAC=0.16]), compoundLayerExceedsTarget (0/1 > COMPOUND_LAYER_MAX_FRAC — over-boronized), coreActivity (mean concentration in center band — LOW expected, B doesn't dissolve in α-Fe), surfaceCoreDelta, surfaceCoreRatio, edgeDominanceFraction (0-1 surface / (surface + core)), asymmetryIndex (0-1 |L-R| / max(L,R) — atmosphere-shadow proxy), toothMorphologyProxy (0-1 interlocking tooth signal — plain C steel), gradientDropAbruptness (0-1 abruptness of drop from plateau to core — HIGH = boronizing signature), diffusionZoneProxy (0-1 sub-compound diffusion — alloy steel only), alloyFactorProxy (0-1), alloyFormerOk (0/1 ≥ ALLOY_FACTOR_MIN=0.20), substrateTypeProxy (PLAIN_C or ALLOY_STEEL), underBoronizeRisk (0-1), unevenBoronizingRisk (0-1), reverseGradientRisk (0-1), subBoronizingFieldRisk (0-1), overBoronizingFieldRisk (0-1), caseHardnessProxy (BORONIZING_HV_SCALE=1.30 × composite — EXTREME hardness, HIGHEST in series, real 1500-2000 HV ≈ 70-75 HRC), wearResistanceProxy (boronizing's flagship — 1.4× carburizing), fatigueResistanceProxy (Fe₂B compressive stress benefit), distortionProxy (LOW — no substrate transformation required), caseCoreRatio, diffusivityProxy, reserveCV, reserveXFracStdev to identify pools in NO_BORONIZING_DRIVE, PRE_BORONIZE, TEMPERATURE_RAMP, BORON_POTENTIAL_ESTABLISHMENT, FE2B_NUCLEATION, FE2B_GROWTH, FEB_FORMATION, FULLY_BORONIZED, OVER_BORONIZED, FEB_DOMINANT_SPALLATION_RISK, UNDER_BORONIZED, UNEVEN_BORONIZING, SUB_BORONIZING_FIELD, or OVER_BORONIZING_FIELD regime and guide LP strategies — pre-boronize pools are cold; temperature-ramp pools are entering the γ-boronizing window; boron-potential-establishment pools have surface B rising; Fe₂B-nucleation pools show first Fe₂B forming at grain boundaries; Fe₂B-growth pools have the service-desirable monophase compound layer thickening; FeB-formation pools have FeB appearing at the outer surface (dual-phase emerging); fully-boronized pools are SERVICE_READY WITHOUT POST-QUENCH (distinct from carburizing/carbonitriding's QUENCH_READY — closest analog is nitriding's SERVICE_READY but with HIGHER hardness scale 1.30 vs nitriding's 1.10); over-boronized and FeB-dominant-spallation-risk pools are defects."
---

# Agent Behavior — HODLMM Bin Boronizing

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `boronizingRegime`, `boronizingVerdict`, `dominantStage`, `stageProgress`, `boronizingFieldOk`, `kbInWindow`, `surfaceActivity`, `compoundLayerActivity`, `compoundLayerVariance`, `plateauQuality`, `feBFractionProxy`, `feBDominantRisk`, `fe2BDominantProxy`, `spallationRisk`, `compoundLayerMeetsTarget`, `compoundLayerExceedsTarget`, `coreActivity`, `edgeDominanceFraction`, `asymmetryIndex`, `toothMorphologyProxy`, `gradientDropAbruptness`, `diffusionZoneProxy`, `alloyFormerOk`, `substrateTypeProxy`, `underBoronizeRisk`, `unevenBoronizingRisk`, `caseHardnessProxy`, `wearResistanceProxy`, `fatigueResistanceProxy`, and `distortionProxy`.

## Interpreting output

- **boronizingRegime = NO_BORONIZING_DRIVE:** priorPeakDrivingForce < BORONIZING_FIELD_MIN × 0.8. No prior boronizing-field hold inferable. Analysis inapplicable.
- **boronizingRegime = PRE_BORONIZE:** workpiece below process T, no B potential established.
- **boronizingRegime = TEMPERATURE_RAMP:** boronizingFieldOk=1 AND surfaceActivity < SURFACE_MIN_B × 0.7. Heating into γ-boronizing window.
- **boronizingRegime = BORON_POTENTIAL_ESTABLISHMENT:** boronizingFieldOk=1 AND surfaceActivity ≥ SURFACE_MIN_B × 0.7. Surface B rising, no Fe₂B yet.
- **boronizingRegime = FE2B_NUCLEATION:** boronizingFieldOk=1 AND stageProgress ≥ STAGE_3_BOUND (0.28). Fe₂B nucleating at grain boundaries.
- **boronizingRegime = FE2B_GROWTH:** boronizingFieldOk=1 AND stageProgress ≥ STAGE_5_BOUND (0.58) AND feBDominantRisk=0. Monophase Fe₂B thickening — service-desirable.
- **boronizingRegime = FEB_FORMATION:** boronizingFieldOk=1 AND stageProgress ≥ STAGE_5_BOUND AND feBFractionProxy > FEB_FRACTION_IDEAL (0.15). FeB forming at outer surface — dual-phase emerging.
- **boronizingRegime = FULLY_BORONIZED:** boronizingFieldOk=1 AND kbInWindow=1 AND surfaceActivity ≥ SURFACE_MIN_B AND compoundLayerMeetsTarget=1 AND fe2BDominantProxy ≥ 0.5 AND feBDominantRisk=0 AND spallationRisk ≤ SPALLATION_RISK_THRESHOLD (0.35) AND stageProgress ≥ STAGE_6_BOUND (0.75). SERVICE_READY without post-quench.
- **boronizingRegime = FEB_DOMINANT_SPALLATION_RISK:** spallationRisk > SPALLATION_RISK_THRESHOLD OR feBDominantRisk=1. FeB outer layer dominant → brittle, spallation risk — defect.
- **boronizingRegime = OVER_BORONIZED:** compoundLayerExceedsTarget=1. Layer too thick → tensile stress → spallation.
- **boronizingRegime = UNDER_BORONIZED:** underBoronizeRisk > 0.6 AND stageProgress < STAGE_4_BOUND. Kb too low or hold too short.
- **boronizingRegime = UNEVEN_BORONIZING:** unevenBoronizingRisk > 0.6 OR reverseGradientRisk > 0.6. Pack/bath shadowing → asymmetric layer.
- **boronizingRegime = SUB_BORONIZING_FIELD:** drivingForce < BORONIZING_FIELD_MIN (0.50). T below γ band — boronizing impossible.
- **boronizingRegime = OVER_BORONIZING_FIELD:** drivingForce > BORONIZING_FIELD_MAX (0.88). T above optimal — B activity decomposes or layer over-grows.
- **boronizingVerdict = NO_BORONIZING_DRIVE:** no prior boronizing-field hold inferable.
- **boronizingVerdict = SERVICE_READY:** monophase Fe₂B dominant, compound layer on-target — service-ready WITHOUT post-quench. Distinct from carburizing/carbonitriding QUENCH_READY. Analogous to nitriding's SERVICE_READY but HARDER (BORONIZING_HV_SCALE=1.30 vs nitriding's 1.10).
- **boronizingVerdict = FEB_SPALLATION_RISK:** FeB-dominant outer layer — brittle spallation defect. Reduce B potential or hold time.
- **boronizingVerdict = OVER_BORONIZED:** over-thick layer or dual-phase FeB > DUAL_PHASE_MAX.
- **boronizingVerdict = UNDER_BORONIZED:** compound layer insufficient; raise Kb, extend hold, or increase T.
- **boronizingVerdict = UNEVEN_BORONIZING:** pack/bath shadowing defect.
- **boronizingVerdict = SUB_BORONIZING_FIELD:** T below γ-band.
- **boronizingVerdict = OVER_BORONIZING_FIELD:** T too high — B decomposes.
- **boronizingVerdict = FE2B_GROWTH / FE2B_NUCLEATION / BORON_POTENTIAL_ESTABLISHMENT / TEMPERATURE_RAMP / PRE_BORONIZE:** stage indicators.
- **dominantStage = 0:** no boronizing drive / pre-boronize.
- **dominantStage = 1:** temperature ramp into γ-boronizing window.
- **dominantStage = 2:** boron potential establishing (Kb rising).
- **dominantStage = 3:** Fe₂B nucleation at grain boundaries.
- **dominantStage = 4:** Fe₂B growth (monophase, service-desirable).
- **dominantStage = 5:** FEB formation (dual-phase FeB + Fe₂B emerging).
- **dominantStage = 6:** fully boronized / service-ready.
- **dominantStage = 7:** over-boronized or FeB-dominant spallation risk.
- **boronizingFieldOk = 1:** drivingForce ∈ [0.50, 0.88] — γ-boronizing hold valid.
- **boronizingFieldProximity > 0.8:** drivingForce near BORONIZING_FIELD_IDEAL (0.68) — optimal hold T.
- **kbInWindow = 1:** kbProxy ∈ [0.40, 1.15] — B potential window.
- **kbProximity > 0.8:** kbProxy near KB_IDEAL (0.75).
- **surfaceActivity ≥ SURFACE_MIN_B (0.70):** surface B potential effective.
- **plateauQuality > 0.8:** compound layer flat (low variance) — monophase Fe₂B signature.
- **plateauQuality < 0.5:** compound layer variable — dual-phase FeB + Fe₂B likely.
- **feBFractionProxy ≤ FEB_FRACTION_IDEAL (0.15):** FeB fraction minimal — good.
- **feBFractionProxy > FEB_FRACTION_MAX (0.30):** FeB fraction excessive → SPALLATION_RISK.
- **feBDominantRisk = 1:** FeB > FEB_FRACTION_MAX — brittle outer layer, defect.
- **fe2BDominantProxy > 0.7:** strong monophase Fe₂B quality — service-desirable.
- **spallationRisk ≤ SPALLATION_RISK_THRESHOLD (0.35):** no spallation risk.
- **spallationRisk > 0.5:** spallation concern — reduce Kb, shorten hold.
- **compoundLayerMeetsTarget = 1:** compound layer 4-16% of scan band — on-spec.
- **compoundLayerExceedsTarget = 1:** compound layer > 16% — over-boronized → reduce hold time.
- **coreActivity ≤ CORE_BASELINE (0.15):** low core B activity — boronizing signature (B doesn't dissolve in α-Fe).
- **gradientDropAbruptness > 0.65:** ABRUPT plateau-to-core drop — plain C steel boronizing signature.
- **gradientDropAbruptness < 0.40:** GRADUAL drop — either alloy steel (sub-zone present) or insufficient boronizing.
- **toothMorphologyProxy > TOOTH_MORPHOLOGY_MIN (0.15):** tooth interlocking detected — plain C steel, improves adhesion.
- **toothMorphologyProxy < TOOTH_MORPHOLOGY_SMOOTH (0.08):** smooth interface — alloy steel or incomplete layer.
- **substrateTypeProxy = PLAIN_C:** inferred plain-carbon substrate (tooth morphology, high gradientDropAbruptness, low diffusionZoneProxy).
- **substrateTypeProxy = ALLOY_STEEL:** inferred alloy substrate (smooth interface, moderate diffusionZoneProxy, sub-compound alloy boride zone).
- **edgeDominanceFraction ≥ EDGE_DOMINANCE_MIN (0.55):** surface-concentrated reserves — boronizing-like.
- **asymmetryIndex ≤ ASYMMETRY_MAX (0.35):** symmetric compound layer — no pack/bath shadowing.
- **asymmetryIndex > ASYMMETRY_MAX:** uneven shadowing — adjust pack loading or salt bath flow.
- **underBoronizeRisk > 0.6:** Kb too low / surface low / layer too thin.
- **unevenBoronizingRisk > 0.6:** asymmetric layer — shadowing defect.
- **caseHardnessProxy > 0.7:** extreme hardness analog (real FeB+Fe₂B 70-75 HRC, HIGHEST in series).
- **wearResistanceProxy > 0.7:** strong wear resistance analog — boronizing's flagship property (1.4× carburizing).
- **fatigueResistanceProxy > 0.6:** strong fatigue resistance analog (Fe₂B compressive residual stress).
- **distortionProxy < 0.15:** low distortion — boronizing signature (no substrate phase transformation required).
- **diffusionZoneProxy > 0.5:** sub-compound alloy boride diffusion zone present — alloy steel indicator.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on boronizing signals from pools with fewer than 5 populated bins — insufficient data.
- Do not treat PRE_BORONIZE as bad; it is the expected starting state before any heat-treatment cycle.
- Do not treat FULLY_BORONIZED as QUENCH_READY: boronizing achieves SERVICE_READY directly WITHOUT post-quench (hardness is from boride phases, not martensite). Distinct from carburizing (QUENCH_READY → full oil quench) and carbonitriding (QUENCH_READY → mild oil/gas quench). Closest analog is nitriding's SERVICE_READY, but boronizing's compound layer is harder (BORONIZING_HV_SCALE=1.30 vs nitriding's 1.10).
- Do not conflate FeB with Fe₂B: FeB (outer) is the PATHOLOGICAL phase (brittle, tensile stress, spallation risk); Fe₂B (inner) is the SERVICE-DESIRABLE phase (tougher, compressive stress). A FeB-dominant outer layer (feBFractionProxy > FEB_FRACTION_MAX) is a DEFECT, not a hardness benefit.
- Do not conflate FEB_DOMINANT_SPALLATION_RISK with FULLY_BORONIZED: FULLY_BORONIZED means monophase Fe₂B dominant with compound layer on-target; FEB_DOMINANT_SPALLATION_RISK means FeB > FEB_FRACTION_MAX → brittle defect.
- Do not conflate OVER_BORONIZED with FEB_DOMINANT_SPALLATION_RISK: OVER_BORONIZED means the compound layer is TOO THICK (compoundLayerExceedsTarget=1); FEB_DOMINANT_SPALLATION_RISK means FeB fraction exceeds the safe limit regardless of layer thickness.
- Do not conflate UNDER_BORONIZED with PRE_BORONIZE: PRE_BORONIZE is the cold baseline; UNDER_BORONIZED means the process ran but Kb was too low or hold was too short — layer formed but insufficient.
- Do not conflate SUB_BORONIZING_FIELD with PRE_BORONIZE: SUB_BORONIZING_FIELD means the process attempted at WRONG T (below γ — boronizing is impossible in α-Fe at those temperatures); PRE_BORONIZE is simply cold.
- Do not conflate UNEVEN_BORONIZING with FEB_DOMINANT_SPALLATION_RISK: UNEVEN is pack/bath shadowing (asymmetric layer); FEB_DOMINANT_SPALLATION_RISK is a composition defect (FeB dominance).
- Do not conflate boronizing with nitriding despite both producing compound layers: nitriding is α-FIELD (500-570 °C, Fe-N compound layer = γ' + ε, NO quench, alloy nitrides in diffusion zone, hardness 65-70 HRC), while boronizing is γ-FIELD (800-1000 °C, IRON BORIDE compound layer = Fe₂B + FeB, NO quench needed, NO diffusion zone in plain C, hardness 70-75 HRC HIGHER than nitriding).
- Do not conflate boronizing with carburizing despite both operating in γ-Fe: carburizing diffuses C (not B), produces martensite case (requires quench), and has an erfc diffusion gradient WITHOUT plateau and WITHOUT compound layer; boronizing diffuses B (not C), produces iron boride compound layer (no quench needed), and has an EDGE-DOMINANT PLATEAU like nitriding.
- Do not conflate boronizing with carbonitriding: carbonitriding is INTERMEDIATE field (760-870 °C, C+N dual diffusion, QUENCH_REQUIRED, QUENCH_READY verdict, 60-65 HRC), while boronizing is γ-FIELD (800-1000 °C, B single diffusion, NO quench for hardness, SERVICE_READY verdict, 70-75 HRC HIGHER).
- Do not assume high feBFractionProxy is desirable: high FeB fraction is the PATHOLOGICAL state (brittle, tensile stress, spallation risk). The DESIRABLE state is high fe2BDominantProxy (monophase Fe₂B).
- Do not assume gradientDropAbruptness being LOW is bad: LOW abruptness (ALLOY_STEEL path) means a sub-compound diffusion zone is forming, which is a legitimate product for alloy steels. Only for PLAIN_C steel is HIGH abruptness the boronizing signature.
- Do not assume drivingForce reflects real temperature; it is inferred from pool turnover (volume24hUsd / tvlUsd × 0.6 + 0.20).
- Do not assume surfaceActivity measures real surface B wt%; it is the mean max-normalized reserveUsd of the outer CASE_BAND_FRAC bins.
- Do not assume feBFractionProxy equals a real FeB/Fe₂B thickness ratio measured by XRD or SEM; it is a composite of outermost-bin elevation vs inner-edge-band mean + compoundLayerVariance.
- Do not assume fe2BDominantProxy equals real Fe₂B phase fraction; it is a normalized composite of (1 − feBFractionProxy) + plateau variance quality + compound layer activity.
- Do not assume spallationRisk equals a real FeB spallation test (thermal cycle / adhesion scratch); it is a composite proxy.
- Do not assume gradientDropAbruptness equals a real interface measurement; it is the normalized concentration drop at the compound/substrate interface bins.
- Do not assume toothMorphologyProxy equals real tooth-height measurement by metallography; it is the standard deviation of concentrations in the compound/substrate transition zone.
- Do not assume caseHardnessProxy equals real HRC; it is BORONIZING_HV_SCALE (1.30) × normalized composite. Real boronized steels reach 70-75 HRC (1500-2000 HV).
- Do not assume wearResistanceProxy equals ASTM G65 wear rate; it is a normalized composite of caseHardness + fe2BDominantProxy + (1 − spallationRisk) + plateauQuality.
- Do not assume fatigueResistanceProxy equals real S-N endurance limit; it is a normalized composite. Real fatigue benefit is from Fe₂B compressive residual stress (no martensite transformation distortion, unlike carburizing/carbonitriding).
- Do not assume distortionProxy equals real dimensional change %; real boronizing dimensional change is < 0.05% — comparable to nitriding. DISTORTION_BASELINE=0.08.
- Do not assume diffusionZoneProxy equals a real sub-compound zone measurement in µm; it is a composite proxy. Real sub-compound boride diffusion zones in alloy steels are 10-40 µm.
- Analysis is snapshot-based; does not capture transformation kinetics — Fe₂B nucleation, FeB formation, layer growth, and stage assignment are inferred from structural signatures.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "Boronizing analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest boronizingIndex as the one with the strongest boronizing fingerprint (best balance of stage progress, plateau quality, Fe₂B dominance, compound-layer target, and low spallation risk).
- Flag pools in NO_BORONIZING_DRIVE regime as no-prior-boronizing-field-hold — analysis inapplicable.
- Flag pools in PRE_BORONIZE regime as cold — below process T.
- Flag pools in TEMPERATURE_RAMP regime as heating — entering γ-boronizing window.
- Flag pools in BORON_POTENTIAL_ESTABLISHMENT regime as surface-B-rising — Kb establishing.
- Flag pools in FE2B_NUCLEATION regime as first-boride-forming — Fe₂B nucleating.
- Flag pools in FE2B_GROWTH regime as monophase-thickening — service-desirable stage.
- Flag pools in FEB_FORMATION regime as dual-phase-emerging — FeB beginning at outer surface.
- Flag pools in FULLY_BORONIZED regime as service-ready — no post-quench needed.
- Flag pools in FEB_DOMINANT_SPALLATION_RISK regime as spallation-defect — FeB > FEB_FRACTION_MAX, brittle.
- Flag pools in OVER_BORONIZED regime as over-thick-layer — reduce hold time or Kb.
- Flag pools in UNDER_BORONIZED regime as layer-insufficient — raise Kb, extend hold, or increase T.
- Flag pools in UNEVEN_BORONIZING regime as shadowing-defect — asymmetric pack/bath flow.
- Flag pools in SUB_BORONIZING_FIELD regime as wrong-field — T below γ, boronizing impossible.
- Flag pools in OVER_BORONIZING_FIELD regime as T-too-high — B decomposes or layer over-grows.
- Flag pools with boronizingFieldOk=0 as out-of-boronizing-field.
- Flag pools with boronizingFieldProximity > 0.8 as boronizing-field-ideal.
- Flag pools with kbInWindow=1 as Kb-in-window.
- Flag pools with kbProximity > 0.8 as Kb-ideal.
- Flag pools with surfaceActivity ≥ SURFACE_MIN_B as surface-B-effective.
- Flag pools with plateauQuality > 0.8 as monophase-plateau (Fe₂B dominant).
- Flag pools with feBFractionProxy ≤ FEB_FRACTION_IDEAL as FeB-minimal.
- Flag pools with feBDominantRisk=1 as FeB-dominant (DEFECT — spallation risk).
- Flag pools with fe2BDominantProxy > 0.7 as Fe₂B-dominant (GOOD).
- Flag pools with spallationRisk ≤ SPALLATION_RISK_THRESHOLD as no-spallation-risk.
- Flag pools with compoundLayerMeetsTarget=1 as compound-layer-on-spec.
- Flag pools with compoundLayerExceedsTarget=1 as over-thick-compound-layer (over-boronized warning).
- Flag pools with gradientDropAbruptness > 0.65 as abrupt-core-drop (plain C steel boronizing signature).
- Flag pools with toothMorphologyProxy > TOOTH_MORPHOLOGY_MIN as tooth-adhesion (plain C steel).
- Flag pools with substrateTypeProxy = PLAIN_C as plain-C-substrate.
- Flag pools with substrateTypeProxy = ALLOY_STEEL as alloy-steel-substrate.
- Flag pools with underBoronizeRisk > 0.6 as under-boronized-warning.
- Flag pools with unevenBoronizingRisk > 0.6 as uneven-warning.
- Flag pools with caseHardnessProxy > 0.7 as extreme-hardness-analog (70-75 HRC, highest in series).
- Flag pools with wearResistanceProxy > 0.7 as flagship-wear-resistant (boronizing's defining property).
- Flag pools with fatigueResistanceProxy > 0.6 as fatigue-resistant-analog (Fe₂B compressive stress).
- Flag pools with distortionProxy < 0.12 as low-distortion (boronizing signature — no substrate transformation).
- Report the inferred regime and verdict.
- Show bins with stageBin = 1 as ramp positions.
- Show bins with stageBin = 2 as B-potential-establishing positions.
- Show bins with stageBin = 3 as Fe₂B-nucleation positions.
- Show bins with stageBin = 4 as Fe₂B-growth positions.
- Show bins with stageBin = 5 as FeB-formation positions.
- Show bins with stageBin = 6 as fully-boronized positions.
- Show bins with stageBin = 7 as over-boronized / spallation-risk positions (warning).
- Show bins with inCompoundLayer = 1 as compound-layer positions.
- Show bins with inSubstrateZone = 1 as compound/substrate-interface positions.
- Show bins with highest compoundLayerSignal as best compound-layer positions.
- Show bins with highest plateauSignal as best plateau (Fe₂B monophase) positions.
- Show bins with highest fe2BSignal as best Fe₂B positions.
- Show bins with feBSignal > 0.5 as FeB-rich positions (warning if spallationRisk > threshold).
- Show bins with toothSignal > 0.5 as interface tooth positions.
- Show bins with spallationSignal > 0.5 as spallation-risk positions.
- Show bins with unevenSignal > 0.5 as asymmetry-warning positions.
- Show bins with highest boronizingDegree as overall most-boronized positions.
- For LP agents: in PRE_BORONIZE pools, use uniform-exposure strategies; in TEMPERATURE_RAMP and BORON_POTENTIAL_ESTABLISHMENT pools, expect early edge enrichment — premature; in FE2B_NUCLEATION and FE2B_GROWTH pools, expect growing edge dominance with pronounced plateau — edge-heavy range strategies align; in FULLY_BORONIZED pools, the compound layer is on-spec and SERVICE_READY (no quench analog needed) — concentrated range plays where the plateau dominates outperform uniform strategies, with LOW distortion expected; in FEB_DOMINANT_SPALLATION_RISK and OVER_BORONIZED pools, treat as defects and reallocate; in UNDER_BORONIZED pools, wait for further development; in UNEVEN_BORONIZING pools, hedge the weaker-edge side.
- For trading agents: FULLY_BORONIZED pools have an extremely hard, dense compound-layer plateau with ABRUPT core drop (for plain C steel) — slippage through the core is much higher than through the outermost plateau bins. The plateau structure is similar to nitriding's but at HIGHER drivingForce (γ-field vs α-field) and with a DUAL-PHASE split (FeB outer, Fe₂B inner) detectable from the per-bin feBSignal / fe2BSignal distribution.
- Compare boronizingIndex, fe2BDominantProxy, plateauQuality, and wearResistanceProxy across pools to find the strongest boronizing signature.
- When FULLY_BORONIZED / SERVICE_READY: the compound layer is monophase Fe₂B dominant, on-spec thickness, no FeB spallation risk — SERVICE_READY without post-treatment. Distinct from carburizing's QUENCH_READY (full oil quench needed) and carbonitriding's QUENCH_READY (mild oil/gas quench needed). Passing the pool ID and boronizing profile to subsequent strategy skills is the intended handoff.
