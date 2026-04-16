---
name: hodlmm-bin-widmanstatten-agent
skill: hodlmm-bin-widmanstatten
description: "Agent behavior for HODLMM bin Widmanstätten proeutectoid transformation analysis — interprets plateFraction, plateCount (primary vs secondary), plate alignment, plate thickness and length, K-S variant distribution and selection strength, habit plane compliance, ledge growth signature, Gibbs-Thomson tip-radius compliance, plate spacing, boundary proximity, intragranular nucleation, and matrix-role assignment to identify pools in allotriomorph-stable, incubating-widmanstatten, primary-widmanstatten, secondary-widmanstatten, or bainite-border regime and guide LP strategies toward primary plate boundaries (matrix-plate junctions with directional fee asymmetry), secondary intragranular plates (dispersed fee capture), K-S variant-selected colonies (parallel plate bands for directional exposure), and ledge-growth or Gibbs-Thomson-compliant plate tips (confirmed propagating plates), and to infer transformation mode (parallel plates, GB-emergent, intragranular-dominated, K-S variant-selected, K-S random, ledge growth, Gibbs-Thomson compliant, allotriomorph cap, secondary nucleation) from plate direction, thickness, alignment, and variant signatures."
---

# Agent Behavior — HODLMM Bin Widmanstätten Transformation

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `widmanstattenRegime`, `widmanstattenVerdict`, `plateFraction`, `drivingForce`, `plateCount`, `primaryPlateCount`, `secondaryPlateCount`, `avgPlateAlignment`, `ksVariantSelectionStrength`, `avgLedgeGrowthSignature`, and `avgGibbsThomsonCompliance`.

## Interpreting output

- **widmanstattenRegime = ALLOTRIOMORPH_STABLE:** Driving force insufficient, plateFraction < 0.15. Only equiaxed matrix bins at grain-boundary analog locations. Classical LP behavior applies; no Widmanstätten signature.
- **widmanstattenRegime = INCUBATING_WIDMANSTATTEN:** plateFraction < 0.2, early plate nucleation before full parallel organization. Monitor for plate-run formation.
- **widmanstattenRegime = PRIMARY_WIDMANSTATTEN:** 0.2 ≤ plateFraction < 0.5, primary (GB-emergent) plates dominant. LP positions adjacent to matrix-plate boundaries capture proeutectoid formation signature.
- **widmanstattenRegime = SECONDARY_WIDMANSTATTEN:** 0.5 ≤ plateFraction < 0.75, intragranular plates dominant. LP positions in plate-dense interiors capture dispersed-plate exposure.
- **widmanstattenRegime = BAINITE_BORDER:** plateFraction ≥ 0.75, very high driving force, densely packed plates with weakening variant selection. Approaching displacive-transformation regime — treat LP strategies as near-bainite.
- **widmanstattenVerdict = PARALLEL_PLATES:** avgPlateAlignment > 0.5 with ≥2 plates. Strong Widmanstätten parallelism — LP strategies can exploit directional plate bands.
- **widmanstattenVerdict = GB_EMERGENT:** Primary plates dominate, emerging from matrix grain boundaries. Matrix-plate junctions are fee-asymmetry opportunities.
- **widmanstattenVerdict = INTRAGRANULAR_DOMINATED:** Secondary plates dominate, nucleating inside grains. Dispersed-plate exposure — plate-sparse interior LP positions.
- **widmanstattenVerdict = K_S_VARIANT_SELECTED:** ksVariantSelectionStrength > 0.55 with ≥2 plates. One K-S variant dominates — parallel plate colony, directional LP exposure.
- **widmanstattenVerdict = K_S_RANDOM:** ksVariantSelectionStrength < 0.25 with ≥3 plates. Variants uniform — near-bainite regime, plates are less directionally aligned.
- **widmanstattenVerdict = LEDGE_GROWTH:** avgLedgeGrowthSignature > 0.55 with ≥2 plates. Step-wise growth dominant — confirmed ledge-mechanism thickening.
- **widmanstattenVerdict = GIBBS_THOMSON_COMPLIANT:** avgGibbsThomsonCompliance > 0.55 with ≥2 plates. Plate tips show proper reserve gradient — plates are propagating, not stalled.
- **widmanstattenVerdict = ALLOTRIOMORPH_CAP:** plateFraction < 0.1 but many matrix-role bins. Equiaxed GB-cap dominant, no plates formed.
- **widmanstattenVerdict = SECONDARY_NUCLEATION:** Secondary count ≥ 2 and more than primary. Intragranular plates without GB precursor — inclusion-assisted or dislocation-assisted nucleation analog.
- **widmanstattenVerdict = HYPOEUTECTOID_STABLE:** plateFraction < 0.15. Transformation not triggered; austenite parent dominant.
- **widmanstattenVerdict = HYPEREUTECTOID_SKEW:** ReserveX vs reserveY pool skew > 0.35. Pool is X-dominant (proeutectoid cementite analog) or Y-dominant (proeutectoid ferrite analog) — one phase dominates.
- **widmanstattenVerdict = NO_PROEUTECTOID_DRIVE:** Driving force < 0.15. Insufficient undercooling below A3.
- **widmanstattenVerdict = INTERMEDIATE_WIDMANSTATTEN:** No extreme indicators — typical mid-state.
- **plateFraction > 0.8:** Near-complete plate transformation; austenite-parent almost depleted. Approaching bainite regime.
- **plateFraction < 0.2:** Austenite stable; plate transformation not triggered or in incubation.
- **drivingForce > 0.7:** Strong thermodynamic drive — pool has experienced heavy recent turnover (deep below A3).
- **drivingForce < 0.2:** Weak drive — recent turnover low or TVL high (near A3, minimal undercooling).
- **plateCount ≥ 3:** Multiple plates coexist — parallel plate field.
- **primaryPlateCount > secondaryPlateCount:** Primary GB-emergent regime — plates emerge from matrix grain boundaries.
- **secondaryPlateCount > primaryPlateCount:** Secondary intragranular regime — plates nucleate inside grains.
- **avgPlateThickness > 0.6:** Thick plates (closer to MAX_PLATE_THICKNESS). Allotriomorph-plate hybrid signature.
- **avgPlateThickness < 0.4:** Thin plates (1-bin). Classical Widmanstätten thin-plate signature.
- **avgPlateAlignment > 0.5:** Strong parallelism — Widmanstätten directional signature.
- **ksVariantSelectionStrength > 0.55:** Strong variant selection — one dominant plate orientation.
- **ksVariantSelectionStrength < 0.25:** Random variants — bainite-like or early incubation.
- **avgLedgeGrowthSignature > 0.55:** Step-wise growth dominant — confirmed ledge-mechanism thickening.
- **avgGibbsThomsonCompliance > 0.55:** Plate tips propagating; tip curvature matches Gibbs-Thomson minimum.
- **avgHabitPlaneCompliance > 0.55:** Plate directions align with dominant variant — classic K-S habit plane selection.
- **avgPlateSpacing < 0.3:** Densely packed plates — high driving force or late-stage transformation.
- **avgPlateSpacing > 0.6:** Sparse plates — low driving force or early transformation.
- **avgIntragranularNucleation > 0.5:** Secondary-plate nucleation dominant — intragranular regime.
- **avgBoundaryProximity > 0.5:** Most bins are near matrix boundaries — grain-boundary-dominated morphology.
- **hypoeutectoidSkew > 0.3:** Pool X-heavy — proeutectoid cementite analog (X-plates in Y-matrix, HYPEREUTECTOID direction).
- **hypoeutectoidSkew < -0.3:** Pool Y-heavy — proeutectoid ferrite analog (Y-plates in X-matrix, classical Widmanstätten ferrite direction).

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on Widmanstätten signals from pools with fewer than 5 populated bins — insufficient data for plate-run inference.
- Do not treat BAINITE_BORDER as universally undesirable; a dense-plate pool is fee-rich even if near the bainite boundary.
- Do not assume ALLOTRIOMORPH_STABLE pools will remain sub-plate-start; a single large event can rapidly push through A3 (plate-start).
- Do not treat the plate fraction as a rigorous measured value — it is inferred from snapshot pattern features, not measured by metallography.
- Do not assume K-S orientation relationship {111}γ ∥ {110}α quantitatively applies to DLMM bins; K-S is a crystallographic definition with specific directional conventions.
- Do not conflate the 4-bucket K-S variant proxy with the real 24-variant set; here variants are inward/outward × close/far directional buckets.
- Do not assume plate thickness in bin units corresponds to real plate thickness in length units; real plates are 1-3 μm, here 1-3 bins.
- Do not conflate ledge growth signature with real ledge-mechanism observation; here it is monotonic reserve progression along a plate, a proxy.
- Do not assume Gibbs-Thomson compliance measures real tip radius; here it is a reserve gradient threshold, not a length-scale measurement.
- Do not conflate habit plane compliance with real crystallographic habit plane {5 5 6}γ selection; here it is directional variant matching.
- Do not assume primary vs secondary plate classification matches real crystallographic emergence from austenite grain boundaries; here it is adjacency to matrix-role bins, a proxy.
- Do not treat variant selection strength as a pole figure or OIM measurement; here it is Shannon entropy of the 4-bucket distribution.
- Do not assume matrix vs minority role assignment matches real proeutectoid phase identification (hypoeutectoid → ferrite, hypereutectoid → cementite); here it uses overall pool X vs Y dominance.
- Do not conflate DLMM bin transformation with 3-D crystallographic plate growth; the analogy is heuristic.
- Do not assume JMAK exponent n = 1.8 applies universally; real Widmanstätten nucleation shows n dependent on primary vs secondary regime.
- Rate constants k = 1.0, n = 1.8, DOMINANCE_MARGIN = 0.15, GIBBS_THOMSON_MIN_GRADIENT = 0.08 are normalized proxy values; in real systems these are alloy- and cooling-rate-specific.
- Analysis is snapshot-based; does not capture time-evolution of transformation — JMAK kinetics, plate nucleation rate, and habit plane selection inferred from current pattern rather than measured rate.
- Driving force is inferred from 24h volume/TVL turnover — a proxy for undercooling below A3, not a measured thermodynamic quantity.
- Gibbs-Thomson compliance at a snapshot does not guarantee forward plate propagation; a pool showing good tip gradients now may stall as plates consume local reserves.
- KS_VARIANT_COUNT = 4 (not 24); buckets are simplified directional categories.
- MAX_PLATE_THICKNESS = 3 bins is a fixed proxy; real Widmanstätten plates have variable thickness but are bounded by the austenite grain size.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "Widmanstätten analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest widmanstattenIndex as the one with the strongest Widmanstätten plate signature (high plateFraction with parallel runs, strong variant selection, ledge growth compliance, Gibbs-Thomson tip-gradient compliance).
- Flag pools in PRIMARY_WIDMANSTATTEN regime as showing GB-emergent plates — LP positions adjacent to matrix-plate junctions capture the proeutectoid-formation signature.
- Flag pools in SECONDARY_WIDMANSTATTEN regime as showing intragranular plates — LP positions in plate-dense interiors capture dispersed-plate exposure.
- Flag pools in INCUBATING_WIDMANSTATTEN regime as in pre-plate nucleation — monitor for plate formation; do not yet treat as Widmanstätten.
- Flag pools in ALLOTRIOMORPH_STABLE regime as showing only equiaxed matrix bins — classical LP behavior applies.
- Flag pools in BAINITE_BORDER regime as dense-plate near-bainite — LP strategies should treat as approaching displacive regime.
- Flag pools with plate alignment > 0.5 and plate count ≥ 2 as parallel-plate — directional Widmanstätten structure confirmed.
- Flag pools with ksVariantSelectionStrength > 0.55 as variant-selected — one plate orientation dominates, strong habit plane selection.
- Flag pools with ksVariantSelectionStrength < 0.25 as random-orientation — near-bainite or early incubation.
- Flag pools with primary plate count > secondary as GB-emergent regime.
- Flag pools with secondary plate count > primary as intragranular-dominated.
- Flag pools with avgLedgeGrowthSignature > 0.55 as ledge-growth-compliant — confirmed step-wise plate thickening.
- Flag pools with avgGibbsThomsonCompliance > 0.55 as propagating — plate tips show proper reserve gradient.
- Report the inferred transformation mode (PARALLEL_PLATES, GB_EMERGENT, INTRAGRANULAR_DOMINATED, K_S_VARIANT_SELECTED, K_S_RANDOM, LEDGE_GROWTH, GIBBS_THOMSON_COMPLIANT, ALLOTRIOMORPH_CAP, SECONDARY_NUCLEATION, HYPOEUTECTOID_STABLE, HYPEREUTECTOID_SKEW, NO_PROEUTECTOID_DRIVE, or INTERMEDIATE_WIDMANSTATTEN).
- Show bins with highest plate fraction as the plate-core bins.
- Show bins with highest plate alignment as the parallel-plate anchors.
- Show bins with highest habit plane compliance as the dominant-variant positions.
- Show bins with highest ledge growth signature as the step-thickening positions.
- Show bins with highest Gibbs-Thomson compliance as the propagating tip positions.
- Show bins with highest variant selection as the dominant-variant plate positions.
- Show bins with primaryVsSecondary = -1 as GB-emergent plate positions.
- Show bins with primaryVsSecondary = +1 as intragranular plate positions.
- For LP agents: in ALLOTRIOMORPH_STABLE pools, classical LP behavior applies — use standard concentration strategies. In INCUBATING_WIDMANSTATTEN pools, wait for plate formation. In PRIMARY_WIDMANSTATTEN pools, position at matrix-plate junctions for proeutectoid-formation exposure. In SECONDARY_WIDMANSTATTEN pools, position in plate-dense interiors for dispersed-plate exposure. In BAINITE_BORDER pools, treat as near-bainite and position for displacive-regime exposure.
- For trading agents: ALLOTRIOMORPH_STABLE pools have smooth liquidity — predictable slippage. INCUBATING_WIDMANSTATTEN pools have early plate nucleation — moderate slippage with monitoring needed. PRIMARY_WIDMANSTATTEN pools have GB-emergent plates with directional fee asymmetry — matrix-side vs plate-side slippage differs. SECONDARY_WIDMANSTATTEN pools have intragranular plates with dispersed fee zones — moderate asymmetry. BAINITE_BORDER pools have dense plates with weakening variant selection — near-bainite slippage regime.
- Compare Widmanstätten indices and driving forces across pools to find bins and pools with the strongest Widmanstätten signature for the intended LP or trading strategy.
