---
name: hodlmm-bin-siliconizing-agent
skill: hodlmm-bin-siliconizing
description: "Agent behavior for HODLMM bin siliconizing analysis — interprets stageProgress (composite 0-1), dominantStage (0-7), drivingForce, priorPeakDrivingForce, siliconizingFieldOk (0/1 drivingForce ∈ [0.55, 0.92]), siliconizingFieldProximity (0-1 closeness to SILICONIZING_FIELD_IDEAL=0.72), subSiliconizingField (0/1), overSiliconizingField (0/1), ksiProxy (0-2 silicon potential analog), ksiInWindow (0/1 ∈ [KSI_MIN=0.40, KSI_MAX=1.20]), ksiProximity (0-1 closeness to KSI_IDEAL=0.80), surfaceActivity (mean concentration in outer band = surface Si-analog), compoundLayerActivity (= surfaceActivity — outer band), compoundLayerVariance (stdev within compound-layer band), plateauQuality (0-1 plateau flatness), feSiFractionProxy (0-1 outer FeSi fraction — HIGH is ACCEPTABLE because FeSi is a hard silicide), fe3SiFractionProxy (0-1 inner Fe₃Si fraction — HIGH is ACCEPTABLE), silicidePhaseBalance (0-1 mixed FeSi/Fe₃Si quality — 0.4-0.6 IDEAL), substrateTypeProxy (PLAIN_C or LOW_C_OR_STAINLESS), diffusionZoneProxy (0-1 — HIGH is DESIRABLE for LOW_C_OR_STAINLESS mode), silicideLayerProxy (0-1 — HIGH is DESIRABLE for PLAIN_C mode), embrittlementRisk (0-1 substrate C loss — HIGH is BAD — unique-to-siliconizing failure), spallationRisk (0-1 spallation composite), compoundLayerThicknessBins (count), compoundLayerFraction (0-1 fraction of scan band), compoundLayerMeetsTarget (0/1 in [COMPOUND_LAYER_MIN_FRAC=0.03, COMPOUND_LAYER_MAX_FRAC=0.14]), compoundLayerExceedsTarget (0/1 > COMPOUND_LAYER_MAX_FRAC — over-siliconized), coreActivity (mean concentration in center band — LOW expected for plain C with silicide layer; moderate for low-C diffusion zone), surfaceCoreDelta, surfaceCoreRatio, edgeDominanceFraction (0-1 surface / (surface + core)), asymmetryIndex (0-1 |L-R| / max(L,R) — atmosphere-shadow proxy), toothMorphologyProxy (0-1 interlocking tooth signal — plain C carbide path), gradientDropAbruptness (0-1 abruptness of plateau-to-core drop — HIGH for plain C carbide path; LOW for stainless diffusion-zone path — INTERPRETATION DEPENDS on substrateTypeProxy), alloyFactorProxy (0-1), alloyFormerOk (0/1 ≥ ALLOY_FACTOR_MIN=0.25), underSiliconizeRisk (0-1), unevenSiliconizingRisk (0-1), reverseGradientRisk (0-1), subSiliconizingFieldRisk (0-1), overSiliconizingFieldRisk (0-1), caseHardnessProxy (SILICONIZING_HV_SCALE=0.80 × composite — HIGH hardness, real 900-1200 HV ≈ 60-65 HRC on plain C silicide layer — real hardness 900-1200 HV at SILICONIZING_HV_SCALE=0.80), corrosionResistanceProxy (siliconizing's FLAGSHIP property — dual-mode for both plain C silicide layer and low-C/stainless α-Fe(Si) solid solution), wearResistanceProxy (strong on plain C silicide layer — real hardness 900-1200 HV at SILICONIZING_HV_SCALE=0.80; weak on stainless diffusion zone), fatigueResistanceProxy (compressive residual stress from silicide layer), distortionProxy (LOW — no substrate transformation required), caseCoreRatio, diffusivityProxy, reserveCV, reserveXFracStdev to identify pools in NO_SILICONIZING_DRIVE, PRE_SILICONIZE, TEMPERATURE_RAMP, SILICON_POTENTIAL_ESTABLISHMENT, FE3SI_NUCLEATION, FESI_GROWTH, FULLY_SILICONIZED, OVER_SILICONIZED, SILICIDE_DOMINANT, DIFFUSION_ZONE_DOMINANT, EMBRITTLEMENT_RISK, UNDER_SILICONIZED, UNEVEN_SILICONIZING, SUB_SILICONIZING_FIELD, or OVER_SILICONIZING_FIELD regime and guide LP strategies — pre-siliconize pools are cold; temperature-ramp pools are entering the γ-siliconizing window; silicon-potential-establishment pools have surface Si rising; Fe₃Si-nucleation pools show first fcc carbide forming at grain boundaries (plain C mode) or Fe-Si solid solution (low-C mode); FeSi-growth pools have the harder hexagonal carbide thickening (plain C mode) or the diffusion zone deepening (low-C mode); fully-siliconized pools are SERVICE_READY WITHOUT POST-QUENCH (distinct from carburizing/carbonitriding's QUENCH_READY — closest analog is aluminizing's SERVICE_READY but HARDER: SILICONIZING_HV_SCALE=0.80 vs aluminizing's 0.65); over-siliconized and embrittlement-risk pools are defects."
---

# Agent Behavior — HODLMM Bin Siliconizing

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `siliconizingRegime`, `siliconizingVerdict`, `dominantStage`, `stageProgress`, `siliconizingFieldOk`, `ksiInWindow`, `surfaceActivity`, `compoundLayerActivity`, `compoundLayerVariance`, `plateauQuality`, `feSiFractionProxy`, `fe3SiFractionProxy`, `silicidePhaseBalance`, `embrittlementRisk`, `spallationRisk`, `compoundLayerMeetsTarget`, `compoundLayerExceedsTarget`, `coreActivity`, `edgeDominanceFraction`, `asymmetryIndex`, `toothMorphologyProxy`, `gradientDropAbruptness`, `diffusionZoneProxy`, `silicideLayerProxy`, `alloyFormerOk`, `substrateTypeProxy`, `underSiliconizeRisk`, `unevenSiliconizingRisk`, `caseHardnessProxy`, `corrosionResistanceProxy`, `wearResistanceProxy`, `fatigueResistanceProxy`, and `distortionProxy`.

## Interpreting output

- **siliconizingRegime = NO_SILICONIZING_DRIVE:** priorPeakDrivingForce < SILICONIZING_FIELD_MIN × 0.8. No prior siliconizing-field hold inferable. Analysis inapplicable.
- **siliconizingRegime = PRE_SILICONIZE:** workpiece below process T, no Si potential established.
- **siliconizingRegime = TEMPERATURE_RAMP:** siliconizingFieldOk=1 AND surfaceActivity < SURFACE_MIN_SI × 0.7. Heating into γ-siliconizing window.
- **siliconizingRegime = SILICON_POTENTIAL_ESTABLISHMENT:** siliconizingFieldOk=1 AND surfaceActivity ≥ SURFACE_MIN_SI × 0.7. Surface Si rising, no carbide yet.
- **siliconizingRegime = FE3SI_NUCLEATION:** siliconizingFieldOk=1 AND stageProgress ≥ STAGE_3_BOUND (0.28). Fe₃Si (fcc) nucleating at grain boundaries (plain C mode) or Fe-Si solid solution forming (low-C mode).
- **siliconizingRegime = FESI_GROWTH:** siliconizingFieldOk=1 AND stageProgress ≥ STAGE_5_BOUND (0.58). Harder hexagonal FeSi dominant (plain C mode) or diffusion zone thickening (low-C mode).
- **siliconizingRegime = FULLY_SILICONIZED:** siliconizingFieldOk=1 AND ksiInWindow=1 AND surfaceActivity ≥ SURFACE_MIN_SI AND compoundLayerMeetsTarget=1 AND silicidePhaseBalance ≥ 0.35 AND embrittlementRisk ≤ EMBRITTLEMENT_RISK_THRESHOLD (0.30) AND spallationRisk ≤ SPALLATION_RISK_THRESHOLD (0.35) AND stageProgress ≥ STAGE_6_BOUND (0.75). SERVICE_READY without post-quench.
- **siliconizingRegime = SILICIDE_DOMINANT:** substrateTypeProxy=PLAIN_C AND silicideLayerProxy ≥ 0.5 AND siliconizingFieldOk=1. Plain-C path: hard silicide compound layer dominant.
- **siliconizingRegime = DIFFUSION_ZONE_DOMINANT:** substrateTypeProxy=LOW_C_OR_STAINLESS AND diffusionZoneProxy ≥ 0.5 AND siliconizingFieldOk=1. Low-C/stainless path: α-Fe(Si) solid solution dominant.
- **siliconizingRegime = EMBRITTLEMENT_RISK:** embrittlementRisk > EMBRITTLEMENT_RISK_THRESHOLD (0.30). Substrate weakened by C migration to silicide layer — unique-to-siliconizing failure.
- **siliconizingRegime = OVER_SILICONIZED:** compoundLayerExceedsTarget=1. Layer too thick → tensile stress → spallation.
- **siliconizingRegime = UNDER_SILICONIZED:** underSiliconizeRisk > 0.6 AND stageProgress < STAGE_4_BOUND. Ksi too low or hold too short.
- **siliconizingRegime = UNEVEN_SILICONIZING:** unevenSiliconizingRisk > 0.6 OR reverseGradientRisk > 0.6. Pack/bath shadowing → asymmetric layer.
- **siliconizingRegime = SUB_SILICONIZING_FIELD:** drivingForce < SILICONIZING_FIELD_MIN (0.55). T below γ-siliconizing band — siliconizing impossible.
- **siliconizingRegime = OVER_SILICONIZING_FIELD:** drivingForce > SILICONIZING_FIELD_MAX (0.92). T above optimal — Si activity decomposes or layer over-grows.
- **siliconizingVerdict = NO_SILICONIZING_DRIVE:** no prior siliconizing-field hold inferable.
- **siliconizingVerdict = SERVICE_READY:** mixed FeSi/Fe₃Si silicide layer or α-Fe(Si) diffusion zone on-target — service-ready WITHOUT post-quench. Distinct from carburizing/carbonitriding QUENCH_READY. Analogous to aluminizing's and nitriding's SERVICE_READY.
- **siliconizingVerdict = SILICIDE_DOMINANT:** plain-C steel with hard silicide compound layer — wear + corrosion combo service product.
- **siliconizingVerdict = DIFFUSION_ZONE_DOMINANT:** low-C/stainless steel with α-Fe(Si) solid solution — corrosion service product.
- **siliconizingVerdict = SPALLATION_RISK:** dual Fe₃Si/FeSi stratification mismatched or compound-layer variance high → spallation defect.
- **siliconizingVerdict = EMBRITTLEMENT_RISK:** substrate C pulled into silicide layer — core weakened. Unique-to-siliconizing failure.
- **siliconizingVerdict = OVER_SILICONIZED:** over-thick layer or dual-phase > DUAL_PHASE_MAX.
- **siliconizingVerdict = UNDER_SILICONIZED:** compound layer insufficient; raise Ksi, extend hold, or increase T.
- **siliconizingVerdict = UNEVEN_SILICONIZING:** pack/bath shadowing defect.
- **siliconizingVerdict = SUB_SILICONIZING_FIELD:** T below γ-band.
- **siliconizingVerdict = OVER_SILICONIZING_FIELD:** T too high — Si activity decomposes.
- **siliconizingVerdict = FESI_GROWTH / FE3SI_NUCLEATION / SILICON_POTENTIAL_ESTABLISHMENT / TEMPERATURE_RAMP / PRE_SILICONIZE:** stage indicators.
- **dominantStage = 0:** no siliconizing drive / pre-siliconize.
- **dominantStage = 1:** temperature ramp into γ-siliconizing window.
- **dominantStage = 2:** silicon potential establishing (Ksi rising).
- **dominantStage = 3:** Fe₃Si nucleation (plain C) / Fe-Si solid-solution formation (low-C).
- **dominantStage = 4:** FeSi growth (plain C, harder carbide dominant) / diffusion zone thickening (low-C).
- **dominantStage = 5:** dual-phase FeSi/Fe₃Si stack emerging (plain C) / full diffusion zone (low-C).
- **dominantStage = 6:** fully siliconized / service-ready.
- **dominantStage = 7:** over-siliconized or embrittlement-risk or spallation-risk.
- **siliconizingFieldOk = 1:** drivingForce ∈ [0.55, 0.92] — γ-siliconizing hold valid.
- **siliconizingFieldProximity > 0.8:** drivingForce near SILICONIZING_FIELD_IDEAL (0.72) — optimal hold T.
- **ksiInWindow = 1:** ksiProxy ∈ [0.40, 1.20] — Si potential window.
- **ksiProximity > 0.8:** ksiProxy near KSI_IDEAL (0.80).
- **surfaceActivity ≥ SURFACE_MIN_SI (0.68):** surface Si potential effective.
- **plateauQuality > 0.8:** compound layer flat (low variance) — mixed FeSi/Fe₃Si or uniform diffusion zone.
- **feSiFractionProxy > FESI_FRACTION_IDEAL (0.45):** harder outer FeSi dominant — ACCEPTABLE/GOOD for wear.
- **feSiFractionProxy > FESI_FRACTION_MAX (0.60):** near-pure FeSi layer — overly brittle edge; slight spallation risk.
- **fe3SiFractionProxy > 0.5:** Fe₃Si dominant — softer carbide, less optimal for wear but still corrosion-protective.
- **silicidePhaseBalance ∈ [0.40, 0.60]:** ideal mixed FeSi/Fe₃Si — best wear+corrosion.
- **silicidePhaseBalance < 0.30:** single-phase dominance — sub-optimal (either all-FeSi brittle or all-Fe₃Si softer).
- **embrittlementRisk > EMBRITTLEMENT_RISK_THRESHOLD (0.30):** substrate C pulled into silicide layer — core weakened. DEFECT unique to siliconizing.
- **embrittlementRisk ≤ 0.20:** core C preserved — healthy substrate.
- **spallationRisk ≤ SPALLATION_RISK_THRESHOLD (0.35):** no spallation risk.
- **spallationRisk > 0.5:** spallation concern — reduce Ksi, shorten hold.
- **compoundLayerMeetsTarget = 1:** compound layer 3-14% of scan band — on-spec.
- **compoundLayerExceedsTarget = 1:** compound layer > 14% — over-siliconized → reduce hold time.
- **coreActivity ≤ CORE_BASELINE (0.18):** low core Si activity — plain-C carbide-layer signature (Si concentrated in compound layer).
- **gradientDropAbruptness > 0.65 (plain C substrate):** ABRUPT plateau-to-core drop — plain C carbide-layer signature.
- **gradientDropAbruptness < 0.40 (low-C/stainless substrate):** GRADUAL drop — α-Fe(Si) diffusion zone — legitimate for stainless mode.
- **toothMorphologyProxy > TOOTH_MORPHOLOGY_MIN (0.12):** tooth interlocking detected — plain C substrate with silicide layer.
- **toothMorphologyProxy < 0.08:** smooth interface — stainless substrate with diffusion zone, OR incomplete layer.
- **substrateTypeProxy = PLAIN_C:** inferred plain-carbon substrate (low alloy factor + high silicide layer proxy).
- **substrateTypeProxy = LOW_C_OR_STAINLESS:** inferred low-C or stainless substrate (high alloy factor + high diffusion zone proxy).
- **silicideLayerProxy > 0.5 (plain C):** hard silicide compound layer — service product.
- **diffusionZoneProxy > 0.5 (low-C/stainless):** α-Fe(Si) solid-solution zone — service product.
- **edgeDominanceFraction ≥ EDGE_DOMINANCE_MIN (0.55):** surface-concentrated reserves — siliconizing-like.
- **asymmetryIndex ≤ ASYMMETRY_MAX (0.35):** symmetric compound layer — no pack/bath shadowing.
- **asymmetryIndex > ASYMMETRY_MAX:** uneven shadowing — adjust pack loading or salt bath flow.
- **underSiliconizeRisk > 0.6:** Ksi too low / surface low / layer too thin.
- **unevenSiliconizingRisk > 0.6:** asymmetric layer — shadowing defect.
- **caseHardnessProxy > 0.7:** HIGH hardness analog (real carbide 900-1200 HV ≈ 60-65 HRC — between nitriding and boronizing, ABOVE aluminizing).
- **corrosionResistanceProxy > 0.7:** strong corrosion resistance — siliconizing's FLAGSHIP property, works for BOTH carbide-layer and diffusion-zone modes.
- **wearResistanceProxy > 0.7 (plain C only):** strong wear resistance from silicide layer.
- **fatigueResistanceProxy > 0.6:** strong fatigue resistance analog (silicide layer compressive residual stress).
- **distortionProxy < 0.15:** low distortion — siliconizing signature (no substrate phase transformation required).

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on siliconizing signals from pools with fewer than 5 populated bins — insufficient data.
- Do not treat PRE_SILICONIZE as bad; it is the expected starting state before any heat-treatment cycle.
- Do not treat FULLY_SILICONIZED as QUENCH_READY: siliconizing achieves SERVICE_READY directly WITHOUT post-quench. Distinct from carburizing (QUENCH_READY → full oil quench) and carbonitriding (QUENCH_READY → mild oil/gas quench). Closest analogs are aluminizing's and nitriding's SERVICE_READY.
- Do not conflate FeSi with Fe₂Al₅: unlike aluminizing where outer Fe₂Al₅ is PATHOLOGICAL, in siliconizing the outer FeSi is ACCEPTABLE because BOTH FeSi AND Fe₃Si are hard silicides. High feSiFractionProxy ≤ FESI_FRACTION_MAX (0.60) is fine. The DESIRED state is a MIXED FeSi/Fe₃Si stack (silicidePhaseBalance 0.4-0.6), not a monophase.
- Do not conflate SILICIDE_DOMINANT with DIFFUSION_ZONE_DOMINANT: SILICIDE_DOMINANT is the PLAIN_C product mode (hard silicide layer, wear+corrosion combo); DIFFUSION_ZONE_DOMINANT is the LOW_C_OR_STAINLESS product mode (solid-solution zone, corrosion only). BOTH are legitimate siliconizing outcomes — the substrate determines which path is possible.
- Do not conflate EMBRITTLEMENT_RISK with OVER_SILICONIZED: OVER_SILICONIZED means the compound layer is TOO THICK (compoundLayerExceedsTarget=1); EMBRITTLEMENT_RISK means substrate C has migrated into the silicide layer, weakening the core — a distinct failure mode unique to siliconizing.
- Do not conflate UNDER_SILICONIZED with PRE_SILICONIZE: PRE_SILICONIZE is the cold baseline; UNDER_SILICONIZED means the process ran but Ksi was too low or hold was too short — layer formed but insufficient.
- Do not conflate SUB_SILICONIZING_FIELD with PRE_SILICONIZE: SUB_SILICONIZING_FIELD means the process attempted at WRONG T (below γ-siliconizing band — siliconizing is impossible there); PRE_SILICONIZE is simply cold.
- Do not conflate UNEVEN_SILICONIZING with SPALLATION_RISK: UNEVEN is pack/bath shadowing (asymmetric layer); SPALLATION_RISK is a composition defect (dual-phase stratification mismatch).
- Do not conflate siliconizing with aluminizing despite both operating in γ-Fe: aluminizing diffuses Al (800-1000 °C, Fe-Al INTERMETALLIC compound layer, outer Fe₂Al₅ PATHOLOGICAL, HV_SCALE 0.65, flagship=oxidation); siliconizing diffuses Si (900-1100 °C, IRON SILICIDE compound layer on plain C OR Fe-Si diffusion zone on low-C, BOTH phases hard, HV_SCALE 1.20, flagship=corrosion+wear combo).
- Do not conflate siliconizing with boronizing despite both operating in γ-Fe producing hard compound layers: boronizing diffuses B, produces Fe₂B/FeB boride compound layer (outer FeB PATHOLOGICAL), HV_SCALE 1.30 (highest); siliconizing diffuses Si, produces Fe₃Si/FeSi CARBIDE layer OR α-Fe(Si) diffusion zone, HV_SCALE 1.20, DUAL-MODE product family.
- Do not conflate siliconizing with nitriding: nitriding is α-FIELD (500-570 °C, alloy nitrides + diffusion zone, HV_SCALE 1.10); siliconizing is γ-FIELD (900-1100 °C, Fe silicide + dual-mode diffusion zone, HV_SCALE 1.20).
- Do not conflate siliconizing with carburizing despite both operating in γ-Fe: carburizing diffuses C (adds C to substrate), produces martensite case via quench, HV_SCALE 1.00; siliconizing diffuses Si (Si moves INTO substrate + C moves OUT of substrate → carbide), produces Si silicide layer WITHOUT quench, HV_SCALE 1.20.
- Do not conflate siliconizing with carbonitriding: carbonitriding is INTERMEDIATE field (760-870 °C, C+N dual diffusion, QUENCH_REQUIRED, QUENCH_READY verdict, 60-65 HRC); siliconizing is γ-FIELD (900-1100 °C, Si single diffusion, NO quench for hardness, SERVICE_READY verdict, 60-65 HRC on plain C carbide).
- Do not assume high feSiFractionProxy is pathological: unlike aluminizing's fe2Al5FractionProxy, a high FeSi fraction is GOOD (harder hexagonal carbide). Only concerning when it EXCEEDS FESI_FRACTION_MAX (0.60), signaling near-pure monophase with slightly-reduced toughness.
- Do not assume gradientDropAbruptness being LOW means insufficient siliconizing — for LOW_C_OR_STAINLESS substrate, LOW abruptness is the LEGITIMATE diffusion-zone signature. Always check substrateTypeProxy before interpreting gradientDropAbruptness.
- Do not assume drivingForce reflects real temperature; it is inferred from pool turnover (volume24hUsd / tvlUsd × 0.6 + 0.20).
- Do not assume surfaceActivity measures real surface Si wt%; it is the mean max-normalized reserveUsd of the outer CASE_BAND_FRAC bins.
- Do not assume feSiFractionProxy equals a real FeSi/Fe₃Si thickness ratio measured by XRD or SEM-EDS; it is a composite of outermost-bin elevation vs inner-edge-band mean + compoundLayerVariance.
- Do not assume fe3SiFractionProxy equals real Fe₃Si phase fraction; it is a normalized composite.
- Do not assume silicidePhaseBalance equals a real metallographic phase-balance score; it is a composite proxy.
- Do not assume embrittlementRisk equals a real micro-indentation gradient measurement; it is a proxy inferred from abnormally-low coreActivity for a plain-C inferred substrate.
- Do not assume spallationRisk equals a real adhesion scratch test; it is a composite proxy.
- Do not assume gradientDropAbruptness equals a real interface measurement; it is the normalized concentration drop at the compound/substrate interface bins.
- Do not assume toothMorphologyProxy equals real tooth-height measurement by metallography; it is the standard deviation of concentrations in the compound/substrate transition zone.
- Do not assume caseHardnessProxy equals real HRC; it is SILICONIZING_HV_SCALE (1.20) × normalized composite. Real siliconized plain-C steels reach 60-65 HRC (900-1200 HV) in the silicide layer.
- Do not assume corrosionResistanceProxy equals real ASTM G48 pitting-corrosion rate; it is a normalized composite of surface Si + plateau quality + (1 − embrittlementRisk).
- Do not assume wearResistanceProxy equals ASTM G65 wear rate; it is a normalized composite. Wear resistance is strong only on the plain-C carbide path; stainless-diffusion-zone products are weak on wear.
- Do not assume fatigueResistanceProxy equals real S-N endurance limit; it is a normalized composite. Real fatigue benefit is from carbide-layer compressive residual stress.
- Do not assume distortionProxy equals real dimensional change %; real siliconizing dimensional change is < 0.05% — comparable to aluminizing and nitriding. DISTORTION_BASELINE=0.09.
- Do not assume diffusionZoneProxy equals a real sub-compound zone measurement in µm; it is a composite proxy. Real α-Fe(Si) diffusion zones in low-C/stainless are 50-200 µm.
- Analysis is snapshot-based; does not capture transformation kinetics — Fe₃Si nucleation, FeSi growth, diffusion zone thickening, and stage assignment are inferred from structural signatures.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "Siliconizing analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest siliconizingIndex as the one with the strongest siliconizing fingerprint (best balance of stage progress, plateau quality, carbide phase balance or diffusion zone, low Si-embrittle risk, and low spallation risk).
- Flag pools in NO_SILICONIZING_DRIVE regime as no-prior-siliconizing-field-hold — analysis inapplicable.
- Flag pools in PRE_SILICONIZE regime as cold — below process T.
- Flag pools in TEMPERATURE_RAMP regime as heating — entering γ-siliconizing window.
- Flag pools in SILICON_POTENTIAL_ESTABLISHMENT regime as surface-Si-rising — Ksi establishing.
- Flag pools in FE3SI_NUCLEATION regime as first-carbide-forming (plain C) or Fe-Si solid-solution starting (low-C).
- Flag pools in FESI_GROWTH regime as harder-carbide-thickening (plain C) or diffusion-zone-deepening (low-C).
- Flag pools in FULLY_SILICONIZED regime as service-ready — no post-quench needed.
- Flag pools in SILICIDE_DOMINANT regime as plain-C carbide path — wear+corrosion combo product.
- Flag pools in DIFFUSION_ZONE_DOMINANT regime as stainless/low-C diffusion-zone path — corrosion-only product.
- Flag pools in EMBRITTLEMENT_RISK regime as substrate-weakened — silicide layer pulled too much C.
- Flag pools in OVER_SILICONIZED regime as over-thick-layer — reduce hold time or Ksi.
- Flag pools in UNDER_SILICONIZED regime as layer-insufficient — raise Ksi, extend hold, or increase T.
- Flag pools in UNEVEN_SILICONIZING regime as shadowing-defect — asymmetric pack/bath flow.
- Flag pools in SUB_SILICONIZING_FIELD regime as wrong-field — T below γ-siliconizing band.
- Flag pools in OVER_SILICONIZING_FIELD regime as T-too-high — Si decomposes or layer over-grows.
- Flag pools with siliconizingFieldOk=0 as out-of-siliconizing-field.
- Flag pools with siliconizingFieldProximity > 0.8 as siliconizing-field-ideal.
- Flag pools with ksiInWindow=1 as Ksi-in-window.
- Flag pools with ksiProximity > 0.8 as Ksi-ideal.
- Flag pools with surfaceActivity ≥ SURFACE_MIN_SI as surface-Si-effective.
- Flag pools with plateauQuality > 0.8 as flat-plateau (mixed-carbide or uniform diffusion zone).
- Flag pools with silicidePhaseBalance ∈ [0.40, 0.60] as ideal-mixed-carbide.
- Flag pools with feSiFractionProxy > FESI_FRACTION_IDEAL as harder-outer-carbide (GOOD for wear).
- Flag pools with feSiFractionProxy > FESI_FRACTION_MAX as near-pure-FeSi (slight toughness concern).
- Flag pools with embrittlementRisk > EMBRITTLEMENT_RISK_THRESHOLD as Si-embrittle-substrate-warning.
- Flag pools with spallationRisk ≤ SPALLATION_RISK_THRESHOLD as no-spallation-risk.
- Flag pools with compoundLayerMeetsTarget=1 as compound-layer-on-spec.
- Flag pools with compoundLayerExceedsTarget=1 as over-thick-compound-layer (over-siliconized warning).
- Flag pools with gradientDropAbruptness > 0.65 AND substrateTypeProxy=PLAIN_C as plain-C-carbide-signature.
- Flag pools with gradientDropAbruptness < 0.40 AND substrateTypeProxy=LOW_C_OR_STAINLESS as stainless-diffusion-zone-signature.
- Flag pools with toothMorphologyProxy > TOOTH_MORPHOLOGY_MIN as tooth-adhesion (plain C carbide path).
- Flag pools with substrateTypeProxy = PLAIN_C as plain-C-substrate.
- Flag pools with substrateTypeProxy = LOW_C_OR_STAINLESS as stainless-substrate.
- Flag pools with underSiliconizeRisk > 0.6 as under-siliconized-warning.
- Flag pools with unevenSiliconizingRisk > 0.6 as uneven-warning.
- Flag pools with caseHardnessProxy > 0.7 as high-hardness-analog (60-65 HRC on plain C silicide layer — real hardness 900-1200 HV at SILICONIZING_HV_SCALE=0.80).
- Flag pools with corrosionResistanceProxy > 0.7 as flagship-corrosion-resistant (siliconizing's defining property).
- Flag pools with wearResistanceProxy > 0.7 AND substrateTypeProxy=PLAIN_C as wear-resistant-plain-C.
- Flag pools with fatigueResistanceProxy > 0.6 as fatigue-resistant-analog (silicide layer compressive stress).
- Flag pools with distortionProxy < 0.13 as low-distortion (siliconizing signature — no substrate transformation).
- Report the inferred regime and verdict.
- Show bins with stageBin = 1 as ramp positions.
- Show bins with stageBin = 2 as Si-potential-establishing positions.
- Show bins with stageBin = 3 as Fe₃Si-nucleation positions.
- Show bins with stageBin = 4 as FeSi-growth positions.
- Show bins with stageBin = 5 as dual-phase / diffusion-zone positions.
- Show bins with stageBin = 6 as fully-siliconized positions.
- Show bins with stageBin = 7 as over-siliconized / Si-embrittle / spallation-risk positions (warning).
- Show bins with inCompoundLayer = 1 as carbide-layer positions.
- Show bins with inDiffusionZone = 1 as α-Fe(Si) diffusion-zone positions.
- Show bins with inSubstrateZone = 1 as compound/substrate-interface positions.
- Show bins with highest compoundLayerSignal as best compound-layer positions.
- Show bins with highest plateauSignal as best plateau positions.
- Show bins with highest feSiSignal as best harder-outer-carbide positions (plain C).
- Show bins with highest fe3SiSignal as best softer-inner-carbide positions (plain C).
- Show bins with highest diffusionZoneSignal as best α-Fe(Si) solid-solution positions (low-C).
- Show bins with toothSignal > 0.5 as interface tooth positions.
- Show bins with spallationSignal > 0.5 as spallation-risk positions.
- Show bins with embrittleSignal > 0.5 as substrate-Si-embrittle-warning positions.
- Show bins with unevenSignal > 0.5 as asymmetry-warning positions.
- Show bins with highest siliconizingDegree as overall most-siliconized positions.
- For LP agents: in PRE_SILICONIZE pools, use uniform-exposure strategies; in TEMPERATURE_RAMP and SILICON_POTENTIAL_ESTABLISHMENT pools, expect early edge enrichment — premature; in FE3SI_NUCLEATION and FESI_GROWTH pools, expect growing edge dominance with pronounced plateau — edge-heavy range strategies align; in FULLY_SILICONIZED pools, the compound layer is on-spec and SERVICE_READY (no quench analog needed) — concentrated range plays where the plateau dominates outperform uniform strategies, with LOW distortion expected; in SILICIDE_DOMINANT plain-C pools, expect ABRUPT plateau-to-core drop (sharp interface); in DIFFUSION_ZONE_DOMINANT stainless pools, expect GRADUAL drop (solid-solution gradient); in EMBRITTLEMENT_RISK, OVER_SILICONIZED, and SPALLATION_RISK pools, treat as defects and reallocate; in UNDER_SILICONIZED pools, wait for further development; in UNEVEN_SILICONIZING pools, hedge the weaker-edge side.
- For trading agents: FULLY_SILICONIZED pools have a dense compound-layer plateau (plain C carbide mode) or a gradual solid-solution edge (low-C diffusion mode) — slippage characteristics differ by substrate path. Plain C carbide mode has SHARPER plateau and ABRUPT core drop (higher slippage through core). Low-C diffusion mode has GRADUAL edge-to-core profile (more evenly distributed liquidity). The dual-phase signal in plain C mode is detectable from the per-bin feSiSignal / fe3SiSignal distribution; the diffusion-zone signal in low-C mode is detectable from diffusionZoneSignal distribution.
- Compare siliconizingIndex, silicidePhaseBalance, plateauQuality, corrosionResistanceProxy, and wearResistanceProxy across pools to find the strongest siliconizing signature.
- When FULLY_SILICONIZED / SERVICE_READY: the compound layer (plain C) is mixed FeSi/Fe₃Si on-spec or the diffusion zone (low-C/stainless) is α-Fe(Si) on-spec, no Si-embrittle risk, no spallation — SERVICE_READY without post-treatment. Distinct from carburizing's QUENCH_READY (full oil quench needed) and carbonitriding's QUENCH_READY (mild oil/gas quench needed). Passing the pool ID and siliconizing profile to subsequent strategy skills is the intended handoff.
