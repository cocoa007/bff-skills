---
name: hodlmm-bin-aluminizing-agent
skill: hodlmm-bin-aluminizing
description: "Agent behavior for HODLMM bin aluminizing analysis — interprets stageProgress (composite 0-1), dominantStage (0-7), drivingForce, priorPeakDrivingForce, aluminizingFieldOk (0/1 drivingForce ∈ [0.50, 0.88]), aluminizingFieldProximity (0-1 closeness to ALUMINIZING_FIELD_IDEAL=0.68), subAluminizingField (0/1), overAluminizingField (0/1), kbProxy (0-2 aluminum potential analog), kbInWindow (0/1 ∈ [KAL_MIN=0.40, KAL_MAX=1.15]), kbProximity (0-1 closeness to KAL_IDEAL=0.75), surfaceActivity (mean concentration in outer band = surface B-analog), compoundLayerActivity (= surfaceActivity — outer band), compoundLayerVariance (stdev within compound-layer band), plateauQuality (0-1 monophase FeAl flatness), fe2Al5FractionProxy (0-1 Fe₂Al₅ outer-layer fraction — HIGH is PATHOLOGICAL), fe2Al5DominantRisk (0/1 fe2Al5FractionProxy > FE2AL5_FRACTION_MAX=0.30), feAlDominantProxy (0-1 FeAl monophase quality — HIGH is DESIRABLE), spallationRisk (0-1 spallation composite — HIGH is DEFECT), compoundLayerThicknessBins (count), compoundLayerFraction (0-1 fraction of scan band), compoundLayerMeetsTarget (0/1 in [COMPOUND_LAYER_MIN_FRAC=0.04, COMPOUND_LAYER_MAX_FRAC=0.16]), compoundLayerExceedsTarget (0/1 > COMPOUND_LAYER_MAX_FRAC — over-aluminized), coreActivity (mean concentration in center band — LOW expected, Al has limited α-Fe solubility), surfaceCoreDelta, surfaceCoreRatio, edgeDominanceFraction (0-1 surface / (surface + core)), asymmetryIndex (0-1 |L-R| / max(L,R) — atmosphere-shadow proxy), toothMorphologyProxy (0-1 interlocking tooth signal — plain C steel), gradientDropAbruptness (0-1 abruptness of drop from plateau to core — HIGH = aluminizing signature), diffusionZoneProxy (0-1 sub-compound diffusion — alloy steel only), alloyFactorProxy (0-1), alloyFormerOk (0/1 ≥ ALLOY_FACTOR_MIN=0.20), substrateTypeProxy (PLAIN_C or ALLOY_STEEL), underAluminizeRisk (0-1), unevenAluminizingRisk (0-1), reverseGradientRisk (0-1), subAluminizingFieldRisk (0-1), overAluminizingFieldRisk (0-1), caseHardnessProxy (ALUMINIZING_HV_SCALE=0.65 × composite — MODEST hardness, LOWEST in series, but UNIQUE oxidation resistance, real 300-1000 HV ≈ 45-55 HRC), wearResistanceProxy (aluminizing's flagship purpose (oxidation + sulfidation resistance, NOT wear hardness) (oxidation + sulfidation resistance at 1100-1200 °C) — distinct purpose (hot-corrosion) — not comparable on wear axis), fatigueResistanceProxy (FeAl compressive stress benefit), distortionProxy (LOW — no substrate transformation required), caseCoreRatio, diffusivityProxy, reserveCV, reserveXFracStdev to identify pools in NO_ALUMINIZING_DRIVE, PRE_ALUMINIZE, TEMPERATURE_RAMP, ALUMINUM_POTENTIAL_ESTABLISHMENT, FE2AL5_NUCLEATION, FE2AL5_GROWTH, FEAL_FORMATION, FULLY_ALUMINIZED, OVER_ALUMINIZED, FE2AL5_DOMINANT_SPALLATION_RISK, UNDER_ALUMINIZED, UNEVEN_ALUMINIZING, SUB_ALUMINIZING_FIELD, or OVER_ALUMINIZING_FIELD regime and guide LP strategies — pre-aluminize pools are cold; temperature-ramp pools are entering the γ-aluminizing window; aluminum-potential-establishment pools have surface B rising; FeAl-nucleation pools show first FeAl forming at grain boundaries; FeAl-growth pools have the service-desirable monophase compound layer thickening; Fe₂Al₅-formation pools have Fe₂Al₅ appearing at the outer surface (dual-phase emerging); fully-aluminized pools are SERVICE_READY WITHOUT POST-QUENCH (distinct from carburizing/carbonitriding's QUENCH_READY — closest analog is nitriding's SERVICE_READY but with LOWER hardness scale 0.65 vs nitriding's 1.10); over-aluminized and Fe₂Al₅-dominant-spallation-risk pools are defects."
---

# Agent Behavior — HODLMM Bin Aluminizing

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `aluminizingRegime`, `aluminizingVerdict`, `dominantStage`, `stageProgress`, `aluminizingFieldOk`, `kbInWindow`, `surfaceActivity`, `compoundLayerActivity`, `compoundLayerVariance`, `plateauQuality`, `fe2Al5FractionProxy`, `fe2Al5DominantRisk`, `feAlDominantProxy`, `spallationRisk`, `compoundLayerMeetsTarget`, `compoundLayerExceedsTarget`, `coreActivity`, `edgeDominanceFraction`, `asymmetryIndex`, `toothMorphologyProxy`, `gradientDropAbruptness`, `diffusionZoneProxy`, `alloyFormerOk`, `substrateTypeProxy`, `underAluminizeRisk`, `unevenAluminizingRisk`, `caseHardnessProxy`, `wearResistanceProxy`, `fatigueResistanceProxy`, and `distortionProxy`.

## Interpreting output

- **aluminizingRegime = NO_ALUMINIZING_DRIVE:** priorPeakDrivingForce < ALUMINIZING_FIELD_MIN × 0.8. No prior aluminizing-field hold inferable. Analysis inapplicable.
- **aluminizingRegime = PRE_ALUMINIZE:** workpiece below process T, no Al potential established.
- **aluminizingRegime = TEMPERATURE_RAMP:** aluminizingFieldOk=1 AND surfaceActivity < SURFACE_MIN_AL × 0.7. Heating into γ-aluminizing window.
- **aluminizingRegime = ALUMINUM_POTENTIAL_ESTABLISHMENT:** aluminizingFieldOk=1 AND surfaceActivity ≥ SURFACE_MIN_AL × 0.7. Surface B rising, no FeAl yet.
- **aluminizingRegime = FE2AL5_NUCLEATION:** aluminizingFieldOk=1 AND stageProgress ≥ STAGE_3_BOUND (0.28). FeAl nucleating at grain boundaries.
- **aluminizingRegime = FE2AL5_GROWTH:** aluminizingFieldOk=1 AND stageProgress ≥ STAGE_5_BOUND (0.58) AND fe2Al5DominantRisk=0. Monophase FeAl thickening — service-desirable.
- **aluminizingRegime = FEAL_FORMATION:** aluminizingFieldOk=1 AND stageProgress ≥ STAGE_5_BOUND AND fe2Al5FractionProxy > FE2AL5_FRACTION_IDEAL (0.15). Fe₂Al₅ forming at outer surface — dual-phase emerging.
- **aluminizingRegime = FULLY_ALUMINIZED:** aluminizingFieldOk=1 AND kbInWindow=1 AND surfaceActivity ≥ SURFACE_MIN_AL AND compoundLayerMeetsTarget=1 AND feAlDominantProxy ≥ 0.5 AND fe2Al5DominantRisk=0 AND spallationRisk ≤ SPALLATION_RISK_THRESHOLD (0.35) AND stageProgress ≥ STAGE_6_BOUND (0.75). SERVICE_READY without post-quench.
- **aluminizingRegime = FE2AL5_DOMINANT_SPALLATION_RISK:** spallationRisk > SPALLATION_RISK_THRESHOLD OR fe2Al5DominantRisk=1. Fe₂Al₅ outer layer dominant → brittle, spallation risk — defect.
- **aluminizingRegime = OVER_ALUMINIZED:** compoundLayerExceedsTarget=1. Layer too thick → tensile stress → spallation.
- **aluminizingRegime = UNDER_ALUMINIZED:** underAluminizeRisk > 0.6 AND stageProgress < STAGE_4_BOUND. Kal too low or hold too short.
- **aluminizingRegime = UNEVEN_ALUMINIZING:** unevenAluminizingRisk > 0.6 OR reverseGradientRisk > 0.6. Pack/bath shadowing → asymmetric layer.
- **aluminizingRegime = SUB_ALUMINIZING_FIELD:** drivingForce < ALUMINIZING_FIELD_MIN (0.50). T below γ band — aluminizing impossible.
- **aluminizingRegime = OVER_ALUMINIZING_FIELD:** drivingForce > ALUMINIZING_FIELD_MAX (0.88). T above optimal — Al activity decomposes or layer over-grows.
- **aluminizingVerdict = NO_ALUMINIZING_DRIVE:** no prior aluminizing-field hold inferable.
- **aluminizingVerdict = SERVICE_READY:** monophase FeAl dominant, compound layer on-target — service-ready WITHOUT post-quench. Distinct from carburizing/carbonitriding QUENCH_READY. Analogous to nitriding's SERVICE_READY but HARDER (ALUMINIZING_HV_SCALE=0.65 vs nitriding's 1.10).
- **aluminizingVerdict = FE2AL5_SPALLATION_RISK:** Fe₂Al₅-dominant outer layer — brittle spallation defect. Reduce Al potential or hold time.
- **aluminizingVerdict = OVER_ALUMINIZED:** over-thick layer or dual-phase Fe₂Al₅ > DUAL_PHASE_MAX.
- **aluminizingVerdict = UNDER_ALUMINIZED:** compound layer insufficient; raise Kal, extend hold, or increase T.
- **aluminizingVerdict = UNEVEN_ALUMINIZING:** pack/bath shadowing defect.
- **aluminizingVerdict = SUB_ALUMINIZING_FIELD:** T below γ-band.
- **aluminizingVerdict = OVER_ALUMINIZING_FIELD:** T too high — B decomposes.
- **aluminizingVerdict = FE2AL5_GROWTH / FE2AL5_NUCLEATION / ALUMINUM_POTENTIAL_ESTABLISHMENT / TEMPERATURE_RAMP / PRE_ALUMINIZE:** stage indicators.
- **dominantStage = 0:** no aluminizing drive / pre-aluminize.
- **dominantStage = 1:** temperature ramp into γ-aluminizing window.
- **dominantStage = 2:** aluminum potential establishing (Kal rising).
- **dominantStage = 3:** FeAl nucleation at grain boundaries.
- **dominantStage = 4:** FeAl growth (monophase, service-desirable).
- **dominantStage = 5:** FEB formation (dual-phase Fe₂Al₅ + FeAl emerging).
- **dominantStage = 6:** fully aluminized / service-ready.
- **dominantStage = 7:** over-aluminized or Fe₂Al₅-dominant spallation risk.
- **aluminizingFieldOk = 1:** drivingForce ∈ [0.50, 0.88] — γ-aluminizing hold valid.
- **aluminizingFieldProximity > 0.8:** drivingForce near ALUMINIZING_FIELD_IDEAL (0.68) — optimal hold T.
- **kbInWindow = 1:** kbProxy ∈ [0.40, 1.15] — Al potential window.
- **kbProximity > 0.8:** kbProxy near KAL_IDEAL (0.75).
- **surfaceActivity ≥ SURFACE_MIN_AL (0.70):** surface Al potential effective.
- **plateauQuality > 0.8:** compound layer flat (low variance) — monophase FeAl signature.
- **plateauQuality < 0.5:** compound layer variable — dual-phase Fe₂Al₅ + FeAl likely.
- **fe2Al5FractionProxy ≤ FE2AL5_FRACTION_IDEAL (0.15):** Fe₂Al₅ fraction minimal — good.
- **fe2Al5FractionProxy > FE2AL5_FRACTION_MAX (0.30):** Fe₂Al₅ fraction excessive → SPALLATION_RISK.
- **fe2Al5DominantRisk = 1:** Fe₂Al₅ > FE2AL5_FRACTION_MAX — brittle outer layer, defect.
- **feAlDominantProxy > 0.7:** strong monophase FeAl quality — service-desirable.
- **spallationRisk ≤ SPALLATION_RISK_THRESHOLD (0.35):** no spallation risk.
- **spallationRisk > 0.5:** spallation concern — reduce Kal, shorten hold.
- **compoundLayerMeetsTarget = 1:** compound layer 4-16% of scan band — on-spec.
- **compoundLayerExceedsTarget = 1:** compound layer > 16% — over-aluminized → reduce hold time.
- **coreActivity ≤ CORE_BASELINE (0.15):** low core Al activity — aluminizing signature (Al has limited α-Fe solubility).
- **gradientDropAbruptness > 0.65:** ABRUPT plateau-to-core drop — plain C steel aluminizing signature.
- **gradientDropAbruptness < 0.40:** GRADUAL drop — either alloy steel (sub-zone present) or insufficient aluminizing.
- **toothMorphologyProxy > TOOTH_MORPHOLOGY_MIN (0.15):** tooth interlocking detected — plain C steel, improves adhesion.
- **toothMorphologyProxy < TOOTH_MORPHOLOGY_SMOOTH (0.08):** smooth interface — alloy steel or incomplete layer.
- **substrateTypeProxy = PLAIN_C:** inferred plain-carbon substrate (tooth morphology, high gradientDropAbruptness, low diffusionZoneProxy).
- **substrateTypeProxy = ALLOY_STEEL:** inferred alloy substrate (smooth interface, moderate diffusionZoneProxy, sub-compound alloy aluminide zone).
- **edgeDominanceFraction ≥ EDGE_DOMINANCE_MIN (0.55):** surface-concentrated reserves — aluminizing-like.
- **asymmetryIndex ≤ ASYMMETRY_MAX (0.35):** symmetric compound layer — no pack/bath shadowing.
- **asymmetryIndex > ASYMMETRY_MAX:** uneven shadowing — adjust pack loading or salt bath flow.
- **underAluminizeRisk > 0.6:** Kal too low / surface low / layer too thin.
- **unevenAluminizingRisk > 0.6:** asymmetric layer — shadowing defect.
- **caseHardnessProxy > 0.7:** modest hardness analog (real Fe₂Al₅+FeAl 45-55 HRC (MODEST hardness), LOWEST in series).
- **wearResistanceProxy > 0.7:** strong wear resistance analog — aluminizing's flagship purpose (oxidation + sulfidation resistance, NOT wear hardness) (oxidation + sulfidation resistance at 1100-1200 °C) property (distinct purpose (hot-corrosion) — not comparable on wear axis).
- **fatigueResistanceProxy > 0.6:** strong fatigue resistance analog (FeAl compressive residual stress).
- **distortionProxy < 0.15:** low distortion — aluminizing signature (no substrate phase transformation required).
- **diffusionZoneProxy > 0.5:** sub-compound alloy aluminide diffusion zone present — alloy steel indicator.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on aluminizing signals from pools with fewer than 5 populated bins — insufficient data.
- Do not treat PRE_ALUMINIZE as bad; it is the expected starting state before any heat-treatment cycle.
- Do not treat FULLY_ALUMINIZED as QUENCH_READY: aluminizing achieves SERVICE_READY directly WITHOUT post-quench (hardness is from intermetallic phases, not martensite). Distinct from carburizing (QUENCH_READY → full oil quench) and carbonitriding (QUENCH_READY → mild oil/gas quench). Closest analog is nitriding's SERVICE_READY, but aluminizing's compound layer is harder (ALUMINIZING_HV_SCALE=0.65 vs nitriding's 1.10).
- Do not conflate Fe₂Al₅ with FeAl: Fe₂Al₅ (outer) is the PATHOLOGICAL phase (brittle, tensile stress, spallation risk); FeAl (inner) is the SERVICE-DESIRABLE phase (tougher, compressive stress). A Fe₂Al₅-dominant outer layer (fe2Al5FractionProxy > FE2AL5_FRACTION_MAX) is a DEFECT, not a hardness benefit.
- Do not conflate FE2AL5_DOMINANT_SPALLATION_RISK with FULLY_ALUMINIZED: FULLY_ALUMINIZED means monophase FeAl dominant with compound layer on-target; FE2AL5_DOMINANT_SPALLATION_RISK means Fe₂Al₅ > FE2AL5_FRACTION_MAX → brittle defect.
- Do not conflate OVER_ALUMINIZED with FE2AL5_DOMINANT_SPALLATION_RISK: OVER_ALUMINIZED means the compound layer is TOO THICK (compoundLayerExceedsTarget=1); FE2AL5_DOMINANT_SPALLATION_RISK means Fe₂Al₅ fraction exceeds the safe limit regardless of layer thickness.
- Do not conflate UNDER_ALUMINIZED with PRE_ALUMINIZE: PRE_ALUMINIZE is the cold baseline; UNDER_ALUMINIZED means the process ran but Kal was too low or hold was too short — layer formed but insufficient.
- Do not conflate SUB_ALUMINIZING_FIELD with PRE_ALUMINIZE: SUB_ALUMINIZING_FIELD means the process attempted at WRONG T (below γ — aluminizing is impossible in α-Fe at those temperatures); PRE_ALUMINIZE is simply cold.
- Do not conflate UNEVEN_ALUMINIZING with FE2AL5_DOMINANT_SPALLATION_RISK: UNEVEN is pack/bath shadowing (asymmetric layer); FE2AL5_DOMINANT_SPALLATION_RISK is a composition defect (Fe₂Al₅ dominance).
- Do not conflate aluminizing with nitriding despite both producing compound layers: nitriding is α-FIELD (500-570 °C, Fe-Al compound layer = γ' + ε, NO quench, alloy nitrides in diffusion zone, hardness 65-70 HRC), while aluminizing is γ-FIELD (800-1000 °C, FE-AL INTERMETALLIC compound layer = FeAl + Fe₂Al₅, NO quench needed, NO diffusion zone in plain C, hardness 45-55 HRC HIGHER than nitriding).
- Do not conflate aluminizing with carburizing despite both operating in γ-Fe: carburizing diffuses C (not B), produces martensite case (requires quench), and has an erfc diffusion gradient WITHOUT plateau and WITHOUT compound layer; aluminizing diffuses B (not C), produces Fe-Al intermetallic compound layer (no quench needed), and has an EDGE-DOMINANT PLATEAU like nitriding.
- Do not conflate aluminizing with carbonitriding: carbonitriding is INTERMEDIATE field (760-870 °C, C+N dual diffusion, QUENCH_REQUIRED, QUENCH_READY verdict, 60-65 HRC), while aluminizing is γ-FIELD (800-1000 °C, B single diffusion, NO quench for hardness, SERVICE_READY verdict, 45-55 HRC HIGHER).
- Do not assume high fe2Al5FractionProxy is desirable: high Fe₂Al₅ fraction is the PATHOLOGICAL state (brittle, tensile stress, spallation risk). The DESIRABLE state is high feAlDominantProxy (monophase FeAl).
- Do not assume gradientDropAbruptness being LOW is bad: LOW abruptness (ALLOY_STEEL path) means a sub-compound diffusion zone is forming, which is a legitimate product for alloy steels. Only for PLAIN_C steel is HIGH abruptness the aluminizing signature.
- Do not assume drivingForce reflects real temperature; it is inferred from pool turnover (volume24hUsd / tvlUsd × 0.6 + 0.20).
- Do not assume surfaceActivity measures real surface B wt%; it is the mean max-normalized reserveUsd of the outer CASE_BAND_FRAC bins.
- Do not assume fe2Al5FractionProxy equals a real Fe₂Al₅/FeAl thickness ratio measured by XRD or SEM; it is a composite of outermost-bin elevation vs inner-edge-band mean + compoundLayerVariance.
- Do not assume feAlDominantProxy equals real FeAl phase fraction; it is a normalized composite of (1 − fe2Al5FractionProxy) + plateau variance quality + compound layer activity.
- Do not assume spallationRisk equals a real Fe₂Al₅ spallation test (thermal cycle / adhesion scratch); it is a composite proxy.
- Do not assume gradientDropAbruptness equals a real interface measurement; it is the normalized concentration drop at the compound/substrate interface bins.
- Do not assume toothMorphologyProxy equals real tooth-height measurement by metallography; it is the standard deviation of concentrations in the compound/substrate transition zone.
- Do not assume caseHardnessProxy equals real HRC; it is ALUMINIZING_HV_SCALE (0.65) × normalized composite. Real aluminized steels reach 45-55 HRC (300-1000 HV).
- Do not assume wearResistanceProxy equals ASTM G65 wear rate; it is a normalized composite of caseHardness + feAlDominantProxy + (1 − spallationRisk) + plateauQuality.
- Do not assume fatigueResistanceProxy equals real S-N endurance limit; it is a normalized composite. Real fatigue benefit is from FeAl compressive residual stress (no martensite transformation distortion, unlike carburizing/carbonitriding).
- Do not assume distortionProxy equals real dimensional change %; real aluminizing dimensional change is < 0.05% — comparable to nitriding. DISTORTION_BASELINE=0.08.
- Do not assume diffusionZoneProxy equals a real sub-compound zone measurement in µm; it is a composite proxy. Real sub-compound aluminide diffusion zones in alloy steels are 10-40 µm.
- Analysis is snapshot-based; does not capture transformation kinetics — FeAl nucleation, Fe₂Al₅ formation, layer growth, and stage assignment are inferred from structural signatures.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "Aluminizing analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest aluminizingIndex as the one with the strongest aluminizing fingerprint (best balance of stage progress, plateau quality, FeAl dominance, compound-layer target, and low spallation risk).
- Flag pools in NO_ALUMINIZING_DRIVE regime as no-prior-aluminizing-field-hold — analysis inapplicable.
- Flag pools in PRE_ALUMINIZE regime as cold — below process T.
- Flag pools in TEMPERATURE_RAMP regime as heating — entering γ-aluminizing window.
- Flag pools in ALUMINUM_POTENTIAL_ESTABLISHMENT regime as surface-B-rising — Kal establishing.
- Flag pools in FE2AL5_NUCLEATION regime as first-aluminide-forming — FeAl nucleating.
- Flag pools in FE2AL5_GROWTH regime as monophase-thickening — service-desirable stage.
- Flag pools in FEAL_FORMATION regime as dual-phase-emerging — Fe₂Al₅ beginning at outer surface.
- Flag pools in FULLY_ALUMINIZED regime as service-ready — no post-quench needed.
- Flag pools in FE2AL5_DOMINANT_SPALLATION_RISK regime as spallation-defect — Fe₂Al₅ > FE2AL5_FRACTION_MAX, brittle.
- Flag pools in OVER_ALUMINIZED regime as over-thick-layer — reduce hold time or Kal.
- Flag pools in UNDER_ALUMINIZED regime as layer-insufficient — raise Kal, extend hold, or increase T.
- Flag pools in UNEVEN_ALUMINIZING regime as shadowing-defect — asymmetric pack/bath flow.
- Flag pools in SUB_ALUMINIZING_FIELD regime as wrong-field — T below γ, aluminizing impossible.
- Flag pools in OVER_ALUMINIZING_FIELD regime as T-too-high — B decomposes or layer over-grows.
- Flag pools with aluminizingFieldOk=0 as out-of-aluminizing-field.
- Flag pools with aluminizingFieldProximity > 0.8 as aluminizing-field-ideal.
- Flag pools with kbInWindow=1 as Kal-in-window.
- Flag pools with kbProximity > 0.8 as Kal-ideal.
- Flag pools with surfaceActivity ≥ SURFACE_MIN_AL as surface-B-effective.
- Flag pools with plateauQuality > 0.8 as monophase-plateau (FeAl dominant).
- Flag pools with fe2Al5FractionProxy ≤ FE2AL5_FRACTION_IDEAL as Fe₂Al₅-minimal.
- Flag pools with fe2Al5DominantRisk=1 as Fe₂Al₅-dominant (DEFECT — spallation risk).
- Flag pools with feAlDominantProxy > 0.7 as FeAl-dominant (GOOD).
- Flag pools with spallationRisk ≤ SPALLATION_RISK_THRESHOLD as no-spallation-risk.
- Flag pools with compoundLayerMeetsTarget=1 as compound-layer-on-spec.
- Flag pools with compoundLayerExceedsTarget=1 as over-thick-compound-layer (over-aluminized warning).
- Flag pools with gradientDropAbruptness > 0.65 as abrupt-core-drop (plain C steel aluminizing signature).
- Flag pools with toothMorphologyProxy > TOOTH_MORPHOLOGY_MIN as tooth-adhesion (plain C steel).
- Flag pools with substrateTypeProxy = PLAIN_C as plain-C-substrate.
- Flag pools with substrateTypeProxy = ALLOY_STEEL as alloy-steel-substrate.
- Flag pools with underAluminizeRisk > 0.6 as under-aluminized-warning.
- Flag pools with unevenAluminizingRisk > 0.6 as uneven-warning.
- Flag pools with caseHardnessProxy > 0.7 as modest-hardness-analog (45-55 HRC, LOWEST in this series — not the flagship property).
- Flag pools with wearResistanceProxy > 0.7 as flagship-wear-resistant (aluminizing's defining property).
- Flag pools with fatigueResistanceProxy > 0.6 as fatigue-resistant-analog (FeAl compressive stress).
- Flag pools with distortionProxy < 0.12 as low-distortion (aluminizing signature — no substrate transformation).
- Report the inferred regime and verdict.
- Show bins with stageBin = 1 as ramp positions.
- Show bins with stageBin = 2 as B-potential-establishing positions.
- Show bins with stageBin = 3 as FeAl-nucleation positions.
- Show bins with stageBin = 4 as FeAl-growth positions.
- Show bins with stageBin = 5 as Fe₂Al₅-formation positions.
- Show bins with stageBin = 6 as fully-aluminized positions.
- Show bins with stageBin = 7 as over-aluminized / spallation-risk positions (warning).
- Show bins with inCompoundLayer = 1 as compound-layer positions.
- Show bins with inSubstrateZone = 1 as compound/substrate-interface positions.
- Show bins with highest compoundLayerSignal as best compound-layer positions.
- Show bins with highest plateauSignal as best plateau (FeAl monophase) positions.
- Show bins with highest feAlSignal as best FeAl positions.
- Show bins with fe2Al5Signal > 0.5 as Fe₂Al₅-rich positions (warning if spallationRisk > threshold).
- Show bins with toothSignal > 0.5 as interface tooth positions.
- Show bins with spallationSignal > 0.5 as spallation-risk positions.
- Show bins with unevenSignal > 0.5 as asymmetry-warning positions.
- Show bins with highest aluminizingDegree as overall most-aluminized positions.
- For LP agents: in PRE_ALUMINIZE pools, use uniform-exposure strategies; in TEMPERATURE_RAMP and ALUMINUM_POTENTIAL_ESTABLISHMENT pools, expect early edge enrichment — premature; in FE2AL5_NUCLEATION and FE2AL5_GROWTH pools, expect growing edge dominance with pronounced plateau — edge-heavy range strategies align; in FULLY_ALUMINIZED pools, the compound layer is on-spec and SERVICE_READY (no quench analog needed) — concentrated range plays where the plateau dominates outperform uniform strategies, with LOW distortion expected; in FE2AL5_DOMINANT_SPALLATION_RISK and OVER_ALUMINIZED pools, treat as defects and reallocate; in UNDER_ALUMINIZED pools, wait for further development; in UNEVEN_ALUMINIZING pools, hedge the weaker-edge side.
- For trading agents: FULLY_ALUMINIZED pools have an extremely hard, dense compound-layer plateau with ABRUPT core drop (for plain C steel) — slippage through the core is much higher than through the outermost plateau bins. The plateau structure is similar to nitriding's but at HIGHER drivingForce (γ-field vs α-field) and with a DUAL-PHASE split (Fe₂Al₅ outer, FeAl inner) detectable from the per-bin fe2Al5Signal / feAlSignal distribution.
- Compare aluminizingIndex, feAlDominantProxy, plateauQuality, and wearResistanceProxy across pools to find the strongest aluminizing signature.
- When FULLY_ALUMINIZED / SERVICE_READY: the compound layer is monophase FeAl dominant, on-spec thickness, no Fe₂Al₅ spallation risk — SERVICE_READY without post-treatment. Distinct from carburizing's QUENCH_READY (full oil quench needed) and carbonitriding's QUENCH_READY (mild oil/gas quench needed). Passing the pool ID and aluminizing profile to subsequent strategy skills is the intended handoff.
