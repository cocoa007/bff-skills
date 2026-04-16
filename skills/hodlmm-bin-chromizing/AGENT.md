---
name: hodlmm-bin-chromizing-agent
skill: hodlmm-bin-chromizing
description: "Agent behavior for HODLMM bin chromizing analysis — interprets stageProgress (composite 0-1), dominantStage (0-7), drivingForce, priorPeakDrivingForce, chromizingFieldOk (0/1 drivingForce ∈ [0.55, 0.92]), chromizingFieldProximity (0-1 closeness to CHROMIZING_FIELD_IDEAL=0.72), subChromizingField (0/1), overChromizingField (0/1), kcrProxy (0-2 chromium potential analog), kcrInWindow (0/1 ∈ [KCR_MIN=0.40, KCR_MAX=1.20]), kcrProximity (0-1 closeness to KCR_IDEAL=0.80), surfaceActivity (mean concentration in outer band = surface Cr-analog), compoundLayerActivity (= surfaceActivity — outer band), compoundLayerVariance (stdev within compound-layer band), plateauQuality (0-1 plateau flatness), cr7c3FractionProxy (0-1 outer Cr₇C₃ fraction — HIGH is ACCEPTABLE because Cr₇C₃ is a hard carbide), cr23c6FractionProxy (0-1 inner Cr₂₃C₆ fraction — HIGH is ACCEPTABLE), carbidePhaseBalance (0-1 mixed Cr₇C₃/Cr₂₃C₆ quality — 0.4-0.6 IDEAL), substrateTypeProxy (PLAIN_C or LOW_C_OR_STAINLESS), diffusionZoneProxy (0-1 — HIGH is DESIRABLE for LOW_C_OR_STAINLESS mode), carbideLayerProxy (0-1 — HIGH is DESIRABLE for PLAIN_C mode), decarbSubstrateRisk (0-1 substrate C loss — HIGH is BAD — unique-to-chromizing failure), spallationRisk (0-1 spallation composite), compoundLayerThicknessBins (count), compoundLayerFraction (0-1 fraction of scan band), compoundLayerMeetsTarget (0/1 in [COMPOUND_LAYER_MIN_FRAC=0.03, COMPOUND_LAYER_MAX_FRAC=0.14]), compoundLayerExceedsTarget (0/1 > COMPOUND_LAYER_MAX_FRAC — over-chromized), coreActivity (mean concentration in center band — LOW expected for plain C with carbide layer; moderate for low-C diffusion zone), surfaceCoreDelta, surfaceCoreRatio, edgeDominanceFraction (0-1 surface / (surface + core)), asymmetryIndex (0-1 |L-R| / max(L,R) — atmosphere-shadow proxy), toothMorphologyProxy (0-1 interlocking tooth signal — plain C carbide path), gradientDropAbruptness (0-1 abruptness of plateau-to-core drop — HIGH for plain C carbide path; LOW for stainless diffusion-zone path — INTERPRETATION DEPENDS on substrateTypeProxy), alloyFactorProxy (0-1), alloyFormerOk (0/1 ≥ ALLOY_FACTOR_MIN=0.25), underChromizeRisk (0-1), unevenChromizingRisk (0-1), reverseGradientRisk (0-1), subChromizingFieldRisk (0-1), overChromizingFieldRisk (0-1), caseHardnessProxy (CHROMIZING_HV_SCALE=1.20 × composite — HIGH hardness, real 1500-2000 HV ≈ 70-75 HRC on plain C carbide layer), corrosionResistanceProxy (chromizing's FLAGSHIP property — dual-mode for both plain C carbide layer and low-C/stainless α-Fe-Cr solid solution), wearResistanceProxy (strong on plain C carbide layer; weak on stainless diffusion zone), fatigueResistanceProxy (compressive residual stress from carbide layer), distortionProxy (LOW — no substrate transformation required), caseCoreRatio, diffusivityProxy, reserveCV, reserveXFracStdev to identify pools in NO_CHROMIZING_DRIVE, PRE_CHROMIZE, TEMPERATURE_RAMP, CHROMIUM_POTENTIAL_ESTABLISHMENT, CR23C6_NUCLEATION, CR7C3_GROWTH, FULLY_CHROMIZED, OVER_CHROMIZED, CARBIDE_DOMINANT, DIFFUSION_ZONE_DOMINANT, DECARB_SUBSTRATE_RISK, UNDER_CHROMIZED, UNEVEN_CHROMIZING, SUB_CHROMIZING_FIELD, or OVER_CHROMIZING_FIELD regime and guide LP strategies — pre-chromize pools are cold; temperature-ramp pools are entering the γ-chromizing window; chromium-potential-establishment pools have surface Cr rising; Cr₂₃C₆-nucleation pools show first fcc carbide forming at grain boundaries (plain C mode) or Fe-Cr solid solution (low-C mode); Cr₇C₃-growth pools have the harder hexagonal carbide thickening (plain C mode) or the diffusion zone deepening (low-C mode); fully-chromized pools are SERVICE_READY WITHOUT POST-QUENCH (distinct from carburizing/carbonitriding's QUENCH_READY — closest analog is aluminizing's SERVICE_READY but HARDER: CHROMIZING_HV_SCALE=1.20 vs aluminizing's 0.65); over-chromized and decarb-substrate-risk pools are defects."
---

# Agent Behavior — HODLMM Bin Chromizing

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `chromizingRegime`, `chromizingVerdict`, `dominantStage`, `stageProgress`, `chromizingFieldOk`, `kcrInWindow`, `surfaceActivity`, `compoundLayerActivity`, `compoundLayerVariance`, `plateauQuality`, `cr7c3FractionProxy`, `cr23c6FractionProxy`, `carbidePhaseBalance`, `decarbSubstrateRisk`, `spallationRisk`, `compoundLayerMeetsTarget`, `compoundLayerExceedsTarget`, `coreActivity`, `edgeDominanceFraction`, `asymmetryIndex`, `toothMorphologyProxy`, `gradientDropAbruptness`, `diffusionZoneProxy`, `carbideLayerProxy`, `alloyFormerOk`, `substrateTypeProxy`, `underChromizeRisk`, `unevenChromizingRisk`, `caseHardnessProxy`, `corrosionResistanceProxy`, `wearResistanceProxy`, `fatigueResistanceProxy`, and `distortionProxy`.

## Interpreting output

- **chromizingRegime = NO_CHROMIZING_DRIVE:** priorPeakDrivingForce < CHROMIZING_FIELD_MIN × 0.8. No prior chromizing-field hold inferable. Analysis inapplicable.
- **chromizingRegime = PRE_CHROMIZE:** workpiece below process T, no Cr potential established.
- **chromizingRegime = TEMPERATURE_RAMP:** chromizingFieldOk=1 AND surfaceActivity < SURFACE_MIN_CR × 0.7. Heating into γ-chromizing window.
- **chromizingRegime = CHROMIUM_POTENTIAL_ESTABLISHMENT:** chromizingFieldOk=1 AND surfaceActivity ≥ SURFACE_MIN_CR × 0.7. Surface Cr rising, no carbide yet.
- **chromizingRegime = CR23C6_NUCLEATION:** chromizingFieldOk=1 AND stageProgress ≥ STAGE_3_BOUND (0.28). Cr₂₃C₆ (fcc) nucleating at grain boundaries (plain C mode) or Fe-Cr solid solution forming (low-C mode).
- **chromizingRegime = CR7C3_GROWTH:** chromizingFieldOk=1 AND stageProgress ≥ STAGE_5_BOUND (0.58). Harder hexagonal Cr₇C₃ dominant (plain C mode) or diffusion zone thickening (low-C mode).
- **chromizingRegime = FULLY_CHROMIZED:** chromizingFieldOk=1 AND kcrInWindow=1 AND surfaceActivity ≥ SURFACE_MIN_CR AND compoundLayerMeetsTarget=1 AND carbidePhaseBalance ≥ 0.35 AND decarbSubstrateRisk ≤ DECARB_SUBSTRATE_RISK_THRESHOLD (0.30) AND spallationRisk ≤ SPALLATION_RISK_THRESHOLD (0.35) AND stageProgress ≥ STAGE_6_BOUND (0.75). SERVICE_READY without post-quench.
- **chromizingRegime = CARBIDE_DOMINANT:** substrateTypeProxy=PLAIN_C AND carbideLayerProxy ≥ 0.5 AND chromizingFieldOk=1. Plain-C path: hard carbide compound layer dominant.
- **chromizingRegime = DIFFUSION_ZONE_DOMINANT:** substrateTypeProxy=LOW_C_OR_STAINLESS AND diffusionZoneProxy ≥ 0.5 AND chromizingFieldOk=1. Low-C/stainless path: α-Fe-Cr solid solution dominant.
- **chromizingRegime = DECARB_SUBSTRATE_RISK:** decarbSubstrateRisk > DECARB_SUBSTRATE_RISK_THRESHOLD (0.30). Substrate weakened by C migration to carbide layer — unique-to-chromizing failure.
- **chromizingRegime = OVER_CHROMIZED:** compoundLayerExceedsTarget=1. Layer too thick → tensile stress → spallation.
- **chromizingRegime = UNDER_CHROMIZED:** underChromizeRisk > 0.6 AND stageProgress < STAGE_4_BOUND. Kcr too low or hold too short.
- **chromizingRegime = UNEVEN_CHROMIZING:** unevenChromizingRisk > 0.6 OR reverseGradientRisk > 0.6. Pack/bath shadowing → asymmetric layer.
- **chromizingRegime = SUB_CHROMIZING_FIELD:** drivingForce < CHROMIZING_FIELD_MIN (0.55). T below γ-chromizing band — chromizing impossible.
- **chromizingRegime = OVER_CHROMIZING_FIELD:** drivingForce > CHROMIZING_FIELD_MAX (0.92). T above optimal — Cr activity decomposes or layer over-grows.
- **chromizingVerdict = NO_CHROMIZING_DRIVE:** no prior chromizing-field hold inferable.
- **chromizingVerdict = SERVICE_READY:** mixed Cr₇C₃/Cr₂₃C₆ carbide layer or α-Fe-Cr diffusion zone on-target — service-ready WITHOUT post-quench. Distinct from carburizing/carbonitriding QUENCH_READY. Analogous to aluminizing's and nitriding's SERVICE_READY.
- **chromizingVerdict = CARBIDE_DOMINANT:** plain-C steel with hard carbide compound layer — wear + corrosion combo service product.
- **chromizingVerdict = DIFFUSION_ZONE_DOMINANT:** low-C/stainless steel with α-Fe-Cr solid solution — corrosion service product.
- **chromizingVerdict = SPALLATION_RISK:** dual Cr₂₃C₆/Cr₇C₃ stratification mismatched or compound-layer variance high → spallation defect.
- **chromizingVerdict = DECARB_RISK:** substrate C pulled into carbide layer — core weakened. Unique-to-chromizing failure.
- **chromizingVerdict = OVER_CHROMIZED:** over-thick layer or dual-phase > DUAL_PHASE_MAX.
- **chromizingVerdict = UNDER_CHROMIZED:** compound layer insufficient; raise Kcr, extend hold, or increase T.
- **chromizingVerdict = UNEVEN_CHROMIZING:** pack/bath shadowing defect.
- **chromizingVerdict = SUB_CHROMIZING_FIELD:** T below γ-band.
- **chromizingVerdict = OVER_CHROMIZING_FIELD:** T too high — Cr activity decomposes.
- **chromizingVerdict = CR7C3_GROWTH / CR23C6_NUCLEATION / CHROMIUM_POTENTIAL_ESTABLISHMENT / TEMPERATURE_RAMP / PRE_CHROMIZE:** stage indicators.
- **dominantStage = 0:** no chromizing drive / pre-chromize.
- **dominantStage = 1:** temperature ramp into γ-chromizing window.
- **dominantStage = 2:** chromium potential establishing (Kcr rising).
- **dominantStage = 3:** Cr₂₃C₆ nucleation (plain C) / Fe-Cr solid-solution formation (low-C).
- **dominantStage = 4:** Cr₇C₃ growth (plain C, harder carbide dominant) / diffusion zone thickening (low-C).
- **dominantStage = 5:** dual-phase Cr₇C₃/Cr₂₃C₆ stack emerging (plain C) / full diffusion zone (low-C).
- **dominantStage = 6:** fully chromized / service-ready.
- **dominantStage = 7:** over-chromized or decarb-substrate-risk or spallation-risk.
- **chromizingFieldOk = 1:** drivingForce ∈ [0.55, 0.92] — γ-chromizing hold valid.
- **chromizingFieldProximity > 0.8:** drivingForce near CHROMIZING_FIELD_IDEAL (0.72) — optimal hold T.
- **kcrInWindow = 1:** kcrProxy ∈ [0.40, 1.20] — Cr potential window.
- **kcrProximity > 0.8:** kcrProxy near KCR_IDEAL (0.80).
- **surfaceActivity ≥ SURFACE_MIN_CR (0.68):** surface Cr potential effective.
- **plateauQuality > 0.8:** compound layer flat (low variance) — mixed Cr₇C₃/Cr₂₃C₆ or uniform diffusion zone.
- **cr7c3FractionProxy > CR7C3_FRACTION_IDEAL (0.45):** harder outer Cr₇C₃ dominant — ACCEPTABLE/GOOD for wear.
- **cr7c3FractionProxy > CR7C3_FRACTION_MAX (0.60):** near-pure Cr₇C₃ layer — overly brittle edge; slight spallation risk.
- **cr23c6FractionProxy > 0.5:** Cr₂₃C₆ dominant — softer carbide, less optimal for wear but still corrosion-protective.
- **carbidePhaseBalance ∈ [0.40, 0.60]:** ideal mixed Cr₇C₃/Cr₂₃C₆ — best wear+corrosion.
- **carbidePhaseBalance < 0.30:** single-phase dominance — sub-optimal (either all-Cr₇C₃ brittle or all-Cr₂₃C₆ softer).
- **decarbSubstrateRisk > DECARB_SUBSTRATE_RISK_THRESHOLD (0.30):** substrate C pulled into carbide layer — core weakened. DEFECT unique to chromizing.
- **decarbSubstrateRisk ≤ 0.20:** core C preserved — healthy substrate.
- **spallationRisk ≤ SPALLATION_RISK_THRESHOLD (0.35):** no spallation risk.
- **spallationRisk > 0.5:** spallation concern — reduce Kcr, shorten hold.
- **compoundLayerMeetsTarget = 1:** compound layer 3-14% of scan band — on-spec.
- **compoundLayerExceedsTarget = 1:** compound layer > 14% — over-chromized → reduce hold time.
- **coreActivity ≤ CORE_BASELINE (0.18):** low core Cr activity — plain-C carbide-layer signature (Cr concentrated in compound layer).
- **gradientDropAbruptness > 0.65 (plain C substrate):** ABRUPT plateau-to-core drop — plain C carbide-layer signature.
- **gradientDropAbruptness < 0.40 (low-C/stainless substrate):** GRADUAL drop — α-Fe-Cr diffusion zone — legitimate for stainless mode.
- **toothMorphologyProxy > TOOTH_MORPHOLOGY_MIN (0.12):** tooth interlocking detected — plain C substrate with carbide layer.
- **toothMorphologyProxy < 0.08:** smooth interface — stainless substrate with diffusion zone, OR incomplete layer.
- **substrateTypeProxy = PLAIN_C:** inferred plain-carbon substrate (low alloy factor + high carbide layer proxy).
- **substrateTypeProxy = LOW_C_OR_STAINLESS:** inferred low-C or stainless substrate (high alloy factor + high diffusion zone proxy).
- **carbideLayerProxy > 0.5 (plain C):** hard carbide compound layer — service product.
- **diffusionZoneProxy > 0.5 (low-C/stainless):** α-Fe-Cr solid-solution zone — service product.
- **edgeDominanceFraction ≥ EDGE_DOMINANCE_MIN (0.55):** surface-concentrated reserves — chromizing-like.
- **asymmetryIndex ≤ ASYMMETRY_MAX (0.35):** symmetric compound layer — no pack/bath shadowing.
- **asymmetryIndex > ASYMMETRY_MAX:** uneven shadowing — adjust pack loading or salt bath flow.
- **underChromizeRisk > 0.6:** Kcr too low / surface low / layer too thin.
- **unevenChromizingRisk > 0.6:** asymmetric layer — shadowing defect.
- **caseHardnessProxy > 0.7:** HIGH hardness analog (real carbide 1500-2000 HV ≈ 70-75 HRC — between nitriding and boronizing, ABOVE aluminizing).
- **corrosionResistanceProxy > 0.7:** strong corrosion resistance — chromizing's FLAGSHIP property, works for BOTH carbide-layer and diffusion-zone modes.
- **wearResistanceProxy > 0.7 (plain C only):** strong wear resistance from carbide layer.
- **fatigueResistanceProxy > 0.6:** strong fatigue resistance analog (carbide layer compressive residual stress).
- **distortionProxy < 0.15:** low distortion — chromizing signature (no substrate phase transformation required).

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on chromizing signals from pools with fewer than 5 populated bins — insufficient data.
- Do not treat PRE_CHROMIZE as bad; it is the expected starting state before any heat-treatment cycle.
- Do not treat FULLY_CHROMIZED as QUENCH_READY: chromizing achieves SERVICE_READY directly WITHOUT post-quench. Distinct from carburizing (QUENCH_READY → full oil quench) and carbonitriding (QUENCH_READY → mild oil/gas quench). Closest analogs are aluminizing's and nitriding's SERVICE_READY.
- Do not conflate Cr₇C₃ with Fe₂Al₅: unlike aluminizing where outer Fe₂Al₅ is PATHOLOGICAL, in chromizing the outer Cr₇C₃ is ACCEPTABLE because BOTH Cr₇C₃ AND Cr₂₃C₆ are hard carbides. High cr7c3FractionProxy ≤ CR7C3_FRACTION_MAX (0.60) is fine. The DESIRED state is a MIXED Cr₇C₃/Cr₂₃C₆ stack (carbidePhaseBalance 0.4-0.6), not a monophase.
- Do not conflate CARBIDE_DOMINANT with DIFFUSION_ZONE_DOMINANT: CARBIDE_DOMINANT is the PLAIN_C product mode (hard carbide layer, wear+corrosion combo); DIFFUSION_ZONE_DOMINANT is the LOW_C_OR_STAINLESS product mode (solid-solution zone, corrosion only). BOTH are legitimate chromizing outcomes — the substrate determines which path is possible.
- Do not conflate DECARB_SUBSTRATE_RISK with OVER_CHROMIZED: OVER_CHROMIZED means the compound layer is TOO THICK (compoundLayerExceedsTarget=1); DECARB_SUBSTRATE_RISK means substrate C has migrated into the carbide layer, weakening the core — a distinct failure mode unique to chromizing.
- Do not conflate UNDER_CHROMIZED with PRE_CHROMIZE: PRE_CHROMIZE is the cold baseline; UNDER_CHROMIZED means the process ran but Kcr was too low or hold was too short — layer formed but insufficient.
- Do not conflate SUB_CHROMIZING_FIELD with PRE_CHROMIZE: SUB_CHROMIZING_FIELD means the process attempted at WRONG T (below γ-chromizing band — chromizing is impossible there); PRE_CHROMIZE is simply cold.
- Do not conflate UNEVEN_CHROMIZING with SPALLATION_RISK: UNEVEN is pack/bath shadowing (asymmetric layer); SPALLATION_RISK is a composition defect (dual-phase stratification mismatch).
- Do not conflate chromizing with aluminizing despite both operating in γ-Fe: aluminizing diffuses Al (800-1000 °C, Fe-Al INTERMETALLIC compound layer, outer Fe₂Al₅ PATHOLOGICAL, HV_SCALE 0.65, flagship=oxidation); chromizing diffuses Cr (900-1100 °C, CHROMIUM CARBIDE compound layer on plain C OR Fe-Cr diffusion zone on low-C, BOTH phases hard, HV_SCALE 1.20, flagship=corrosion+wear combo).
- Do not conflate chromizing with boronizing despite both operating in γ-Fe producing hard compound layers: boronizing diffuses B, produces Fe₂B/FeB boride compound layer (outer FeB PATHOLOGICAL), HV_SCALE 1.30 (highest); chromizing diffuses Cr, produces Cr₂₃C₆/Cr₇C₃ CARBIDE layer OR α-Fe-Cr diffusion zone, HV_SCALE 1.20, DUAL-MODE product family.
- Do not conflate chromizing with nitriding: nitriding is α-FIELD (500-570 °C, alloy nitrides + diffusion zone, HV_SCALE 1.10); chromizing is γ-FIELD (900-1100 °C, Cr carbide + dual-mode diffusion zone, HV_SCALE 1.20).
- Do not conflate chromizing with carburizing despite both operating in γ-Fe: carburizing diffuses C (adds C to substrate), produces martensite case via quench, HV_SCALE 1.00; chromizing diffuses Cr (Cr moves INTO substrate + C moves OUT of substrate → carbide), produces Cr carbide layer WITHOUT quench, HV_SCALE 1.20.
- Do not conflate chromizing with carbonitriding: carbonitriding is INTERMEDIATE field (760-870 °C, C+N dual diffusion, QUENCH_REQUIRED, QUENCH_READY verdict, 60-65 HRC); chromizing is γ-FIELD (900-1100 °C, Cr single diffusion, NO quench for hardness, SERVICE_READY verdict, 70-75 HRC on plain C carbide).
- Do not assume high cr7c3FractionProxy is pathological: unlike aluminizing's fe2Al5FractionProxy, a high Cr₇C₃ fraction is GOOD (harder hexagonal carbide). Only concerning when it EXCEEDS CR7C3_FRACTION_MAX (0.60), signaling near-pure monophase with slightly-reduced toughness.
- Do not assume gradientDropAbruptness being LOW means insufficient chromizing — for LOW_C_OR_STAINLESS substrate, LOW abruptness is the LEGITIMATE diffusion-zone signature. Always check substrateTypeProxy before interpreting gradientDropAbruptness.
- Do not assume drivingForce reflects real temperature; it is inferred from pool turnover (volume24hUsd / tvlUsd × 0.6 + 0.20).
- Do not assume surfaceActivity measures real surface Cr wt%; it is the mean max-normalized reserveUsd of the outer CASE_BAND_FRAC bins.
- Do not assume cr7c3FractionProxy equals a real Cr₇C₃/Cr₂₃C₆ thickness ratio measured by XRD or SEM-EDS; it is a composite of outermost-bin elevation vs inner-edge-band mean + compoundLayerVariance.
- Do not assume cr23c6FractionProxy equals real Cr₂₃C₆ phase fraction; it is a normalized composite.
- Do not assume carbidePhaseBalance equals a real metallographic phase-balance score; it is a composite proxy.
- Do not assume decarbSubstrateRisk equals a real micro-indentation gradient measurement; it is a proxy inferred from abnormally-low coreActivity for a plain-C inferred substrate.
- Do not assume spallationRisk equals a real adhesion scratch test; it is a composite proxy.
- Do not assume gradientDropAbruptness equals a real interface measurement; it is the normalized concentration drop at the compound/substrate interface bins.
- Do not assume toothMorphologyProxy equals real tooth-height measurement by metallography; it is the standard deviation of concentrations in the compound/substrate transition zone.
- Do not assume caseHardnessProxy equals real HRC; it is CHROMIZING_HV_SCALE (1.20) × normalized composite. Real chromized plain-C steels reach 70-75 HRC (1500-2000 HV) in the carbide layer.
- Do not assume corrosionResistanceProxy equals real ASTM G48 pitting-corrosion rate; it is a normalized composite of surface Cr + plateau quality + (1 − decarbSubstrateRisk).
- Do not assume wearResistanceProxy equals ASTM G65 wear rate; it is a normalized composite. Wear resistance is strong only on the plain-C carbide path; stainless-diffusion-zone products are weak on wear.
- Do not assume fatigueResistanceProxy equals real S-N endurance limit; it is a normalized composite. Real fatigue benefit is from carbide-layer compressive residual stress.
- Do not assume distortionProxy equals real dimensional change %; real chromizing dimensional change is < 0.05% — comparable to aluminizing and nitriding. DISTORTION_BASELINE=0.09.
- Do not assume diffusionZoneProxy equals a real sub-compound zone measurement in µm; it is a composite proxy. Real α-Fe-Cr diffusion zones in low-C/stainless are 50-200 µm.
- Analysis is snapshot-based; does not capture transformation kinetics — Cr₂₃C₆ nucleation, Cr₇C₃ growth, diffusion zone thickening, and stage assignment are inferred from structural signatures.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "Chromizing analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest chromizingIndex as the one with the strongest chromizing fingerprint (best balance of stage progress, plateau quality, carbide phase balance or diffusion zone, low decarb risk, and low spallation risk).
- Flag pools in NO_CHROMIZING_DRIVE regime as no-prior-chromizing-field-hold — analysis inapplicable.
- Flag pools in PRE_CHROMIZE regime as cold — below process T.
- Flag pools in TEMPERATURE_RAMP regime as heating — entering γ-chromizing window.
- Flag pools in CHROMIUM_POTENTIAL_ESTABLISHMENT regime as surface-Cr-rising — Kcr establishing.
- Flag pools in CR23C6_NUCLEATION regime as first-carbide-forming (plain C) or Fe-Cr solid-solution starting (low-C).
- Flag pools in CR7C3_GROWTH regime as harder-carbide-thickening (plain C) or diffusion-zone-deepening (low-C).
- Flag pools in FULLY_CHROMIZED regime as service-ready — no post-quench needed.
- Flag pools in CARBIDE_DOMINANT regime as plain-C carbide path — wear+corrosion combo product.
- Flag pools in DIFFUSION_ZONE_DOMINANT regime as stainless/low-C diffusion-zone path — corrosion-only product.
- Flag pools in DECARB_SUBSTRATE_RISK regime as substrate-weakened — carbide layer pulled too much C.
- Flag pools in OVER_CHROMIZED regime as over-thick-layer — reduce hold time or Kcr.
- Flag pools in UNDER_CHROMIZED regime as layer-insufficient — raise Kcr, extend hold, or increase T.
- Flag pools in UNEVEN_CHROMIZING regime as shadowing-defect — asymmetric pack/bath flow.
- Flag pools in SUB_CHROMIZING_FIELD regime as wrong-field — T below γ-chromizing band.
- Flag pools in OVER_CHROMIZING_FIELD regime as T-too-high — Cr decomposes or layer over-grows.
- Flag pools with chromizingFieldOk=0 as out-of-chromizing-field.
- Flag pools with chromizingFieldProximity > 0.8 as chromizing-field-ideal.
- Flag pools with kcrInWindow=1 as Kcr-in-window.
- Flag pools with kcrProximity > 0.8 as Kcr-ideal.
- Flag pools with surfaceActivity ≥ SURFACE_MIN_CR as surface-Cr-effective.
- Flag pools with plateauQuality > 0.8 as flat-plateau (mixed-carbide or uniform diffusion zone).
- Flag pools with carbidePhaseBalance ∈ [0.40, 0.60] as ideal-mixed-carbide.
- Flag pools with cr7c3FractionProxy > CR7C3_FRACTION_IDEAL as harder-outer-carbide (GOOD for wear).
- Flag pools with cr7c3FractionProxy > CR7C3_FRACTION_MAX as near-pure-Cr7C3 (slight toughness concern).
- Flag pools with decarbSubstrateRisk > DECARB_SUBSTRATE_RISK_THRESHOLD as decarb-substrate-warning.
- Flag pools with spallationRisk ≤ SPALLATION_RISK_THRESHOLD as no-spallation-risk.
- Flag pools with compoundLayerMeetsTarget=1 as compound-layer-on-spec.
- Flag pools with compoundLayerExceedsTarget=1 as over-thick-compound-layer (over-chromized warning).
- Flag pools with gradientDropAbruptness > 0.65 AND substrateTypeProxy=PLAIN_C as plain-C-carbide-signature.
- Flag pools with gradientDropAbruptness < 0.40 AND substrateTypeProxy=LOW_C_OR_STAINLESS as stainless-diffusion-zone-signature.
- Flag pools with toothMorphologyProxy > TOOTH_MORPHOLOGY_MIN as tooth-adhesion (plain C carbide path).
- Flag pools with substrateTypeProxy = PLAIN_C as plain-C-substrate.
- Flag pools with substrateTypeProxy = LOW_C_OR_STAINLESS as stainless-substrate.
- Flag pools with underChromizeRisk > 0.6 as under-chromized-warning.
- Flag pools with unevenChromizingRisk > 0.6 as uneven-warning.
- Flag pools with caseHardnessProxy > 0.7 as high-hardness-analog (70-75 HRC on plain C carbide layer).
- Flag pools with corrosionResistanceProxy > 0.7 as flagship-corrosion-resistant (chromizing's defining property).
- Flag pools with wearResistanceProxy > 0.7 AND substrateTypeProxy=PLAIN_C as wear-resistant-plain-C.
- Flag pools with fatigueResistanceProxy > 0.6 as fatigue-resistant-analog (carbide layer compressive stress).
- Flag pools with distortionProxy < 0.13 as low-distortion (chromizing signature — no substrate transformation).
- Report the inferred regime and verdict.
- Show bins with stageBin = 1 as ramp positions.
- Show bins with stageBin = 2 as Cr-potential-establishing positions.
- Show bins with stageBin = 3 as Cr₂₃C₆-nucleation positions.
- Show bins with stageBin = 4 as Cr₇C₃-growth positions.
- Show bins with stageBin = 5 as dual-phase / diffusion-zone positions.
- Show bins with stageBin = 6 as fully-chromized positions.
- Show bins with stageBin = 7 as over-chromized / decarb / spallation-risk positions (warning).
- Show bins with inCompoundLayer = 1 as carbide-layer positions.
- Show bins with inDiffusionZone = 1 as α-Fe-Cr diffusion-zone positions.
- Show bins with inSubstrateZone = 1 as compound/substrate-interface positions.
- Show bins with highest compoundLayerSignal as best compound-layer positions.
- Show bins with highest plateauSignal as best plateau positions.
- Show bins with highest cr7c3Signal as best harder-outer-carbide positions (plain C).
- Show bins with highest cr23c6Signal as best softer-inner-carbide positions (plain C).
- Show bins with highest diffusionZoneSignal as best α-Fe-Cr solid-solution positions (low-C).
- Show bins with toothSignal > 0.5 as interface tooth positions.
- Show bins with spallationSignal > 0.5 as spallation-risk positions.
- Show bins with decarbSignal > 0.5 as substrate-decarb-warning positions.
- Show bins with unevenSignal > 0.5 as asymmetry-warning positions.
- Show bins with highest chromizingDegree as overall most-chromized positions.
- For LP agents: in PRE_CHROMIZE pools, use uniform-exposure strategies; in TEMPERATURE_RAMP and CHROMIUM_POTENTIAL_ESTABLISHMENT pools, expect early edge enrichment — premature; in CR23C6_NUCLEATION and CR7C3_GROWTH pools, expect growing edge dominance with pronounced plateau — edge-heavy range strategies align; in FULLY_CHROMIZED pools, the compound layer is on-spec and SERVICE_READY (no quench analog needed) — concentrated range plays where the plateau dominates outperform uniform strategies, with LOW distortion expected; in CARBIDE_DOMINANT plain-C pools, expect ABRUPT plateau-to-core drop (sharp interface); in DIFFUSION_ZONE_DOMINANT stainless pools, expect GRADUAL drop (solid-solution gradient); in DECARB_SUBSTRATE_RISK, OVER_CHROMIZED, and SPALLATION_RISK pools, treat as defects and reallocate; in UNDER_CHROMIZED pools, wait for further development; in UNEVEN_CHROMIZING pools, hedge the weaker-edge side.
- For trading agents: FULLY_CHROMIZED pools have a dense compound-layer plateau (plain C carbide mode) or a gradual solid-solution edge (low-C diffusion mode) — slippage characteristics differ by substrate path. Plain C carbide mode has SHARPER plateau and ABRUPT core drop (higher slippage through core). Low-C diffusion mode has GRADUAL edge-to-core profile (more evenly distributed liquidity). The dual-phase signal in plain C mode is detectable from the per-bin cr7c3Signal / cr23c6Signal distribution; the diffusion-zone signal in low-C mode is detectable from diffusionZoneSignal distribution.
- Compare chromizingIndex, carbidePhaseBalance, plateauQuality, corrosionResistanceProxy, and wearResistanceProxy across pools to find the strongest chromizing signature.
- When FULLY_CHROMIZED / SERVICE_READY: the compound layer (plain C) is mixed Cr₇C₃/Cr₂₃C₆ on-spec or the diffusion zone (low-C/stainless) is α-Fe-Cr on-spec, no decarb risk, no spallation — SERVICE_READY without post-treatment. Distinct from carburizing's QUENCH_READY (full oil quench needed) and carbonitriding's QUENCH_READY (mild oil/gas quench needed). Passing the pool ID and chromizing profile to subsequent strategy skills is the intended handoff.
