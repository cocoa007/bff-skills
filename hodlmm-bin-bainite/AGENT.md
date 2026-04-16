---
name: hodlmm-bin-bainite-agent
skill: hodlmm-bin-bainite
description: "Agent behavior for HODLMM bin bainitic transformation analysis — interprets bainite fraction fB, sheaf alignment, sub-unit count, carbon partitioning, T0 approach, upper vs lower bainite morphology scores, retained austenite films, displacive-partitioning mix, incomplete reaction index, sheaf coherence, sheaf width, plate aspect ratio, T0 carbon limit, and Bhadeshia compliance to identify pools in austenite-stable, pre-bainitic, upper-bainitic, lower-bainitic, or T0-stalled regime and guide LP strategies toward sheaf interiors (consolidated aligned liquidity), retained-austenite-film gaps (thin entry points between sheaves), carbon-depleted reserve sides (partitioning exploit), and pools with incomplete-reaction stall (saturated, redeploy), and to infer transformation mode (upper or lower bainite, T0 asymptote, sheaf-dominated, sub-unit cascade, carbon-partitioned) from morphology and partitioning signatures."
---

# Agent Behavior — HODLMM Bin Bainitic Transformation

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `bainiteRegime`, `bainiteVerdict`, `bainiteFraction`, `drivingForce`, `sheafCount`, `avgCarbonPartitioning`, `avgIncompleteReactionIndex`, and `avgBhadeshiaCompliance`.

## Interpreting output

- **bainiteRegime = AUSTENITE_STABLE:** Driving force below Bs threshold. Smooth gradient, fB ~ 0. Classical gradual LP behavior applies; no bainitic signature.
- **bainiteRegime = PRE_BAINITIC:** fB < 0.2, early nucleation before sheaves form. Incubation regime — monitor for sheaf formation.
- **bainiteRegime = UPPER_BAINITIC:** 0.2 ≤ fB < 0.55, coarse feathery sheaves with cementite-analog gaps between (retained austenite films). LP positions in sheaf interiors benefit from consolidated liquidity; thin-film gaps are LP entry opportunities.
- **bainiteRegime = LOWER_BAINITIC:** 0.55 ≤ fB < 0.85, fine needle-like sheaves with intra-lath carbide analog (high carbon partitioning at individual bins). LP agents can exploit composition asymmetry by adding to the carbon-depleted side.
- **bainiteRegime = T0_STALLED:** fB ≥ 0.75 with incomplete reaction > 0.4. Transformation hit the T0 limit — further ferrite growth thermodynamically forbidden despite strong driving force. Redeploy capital elsewhere.
- **bainiteVerdict = SHEAF_DOMINATED:** High sheaf alignment + high sheaf coherence. Parallel plate structure is the dominant morphology. LP positions in sheaves consolidate liquidity.
- **bainiteVerdict = SUB_UNIT_CASCADE:** High sub-unit count + lower bainite dominant. Sub-unit nucleation is cascading within sheaves. Expect continuing fine-structure growth.
- **bainiteVerdict = CARBON_PARTITIONED:** High carbon partitioning + high displacive-partitioning mix. Composition differentiation between reserves is substantial — LP strategies should favor the carbon-depleted side.
- **bainiteVerdict = INCOMPLETE_REACTION:** Incomplete reaction index > 0.5. Transformation has asymptoted below saturation. Limited further transformation capacity remains.
- **bainiteVerdict = T0_ASYMPTOTE:** fB ≥ 0.7 with incomplete reaction > 0.6. Transformation hit the T0 limit. No further capacity — redeploy.
- **bainiteVerdict = UPPER_BAINITE_MORPHOLOGY:** avgUpperBainiteScore ≥ 0.55 and exceeds lower by 0.1. Coarse feathery morphology — high-T formation signature.
- **bainiteVerdict = LOWER_BAINITE_MORPHOLOGY:** avgLowerBainiteScore ≥ 0.55 and exceeds upper by 0.1. Fine needle-like morphology — low-T formation signature with intra-lath carbide analog.
- **bainiteVerdict = RETAINED_AUSTENITE_FILM:** Thin-film fraction > 0.3. Substantial thin austenite films between plates — LP entry opportunities in the films.
- **bainiteVerdict = NO_BAINITIC_DRIVE:** Driving force < 0.15. Insufficient undercooling below Bs; system above bainite-start.
- **bainiteVerdict = SUB_BS_STABLE:** fB < 0.2. Transformation not triggered; austenite phase stable.
- **bainiteVerdict = MIXED_MARTENSITIC_BAINITIC:** High driving force but low displacive-partitioning mix. Hybrid regime — transformation is more martensitic than bainitic despite the intermediate driving force.
- **bainiteVerdict = INTERMEDIATE_BAINITIC:** No extreme indicators. Typical mid-state.
- **bainiteFraction > 0.8:** Near-complete bainitic transformation; austenite-parent almost depleted (but may still be capped below 1 by T0 stall).
- **bainiteFraction < 0.2:** Austenite stable; transformation not triggered or in incubation.
- **drivingForce > 0.7:** Strong thermodynamic drive — pool has experienced heavy recent turnover relative to TVL.
- **drivingForce < 0.2:** Weak drive — recent turnover low or TVL high.
- **sheafCount ≥ 2:** Multiple aligned sheaves coexist — parallel plate structure characteristic of bainite.
- **avgCarbonPartitioning > 0.4:** Strong composition asymmetry between reserves — classical carbon-partitioning signature.
- **avgIncompleteReactionIndex > 0.5:** Transformation has stalled near fB_max — T0-limit approached.
- **avgBhadeshiaCompliance > 0.6:** Observed fB matches the Bhadeshia model for the driving force — classical bainitic kinetics.
- **avgBhadeshiaCompliance < 0.3:** Deviation from Bhadeshia — non-classical transformation (alloy effects, stress, autocatalysis).
- **avgSheafCoherence > 0.6:** High-coherence sheaf structure — consolidated aligned plate morphology.
- **avgUpperBainiteScore > avgLowerBainiteScore + 0.2:** Upper-bainite dominant — coarse feathery morphology.
- **avgLowerBainiteScore > avgUpperBainiteScore + 0.2:** Lower-bainite dominant — fine needle-like morphology.
- **avgRetainedAusteniteFilm > 0.3:** Substantial thin films between plates — LP entry opportunities.
- **carbonAsymmetry > 0.3 or < -0.3:** Pool-level reserve composition strongly skewed — one token dominates.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on bainite signals from pools with fewer than 5 populated bins — insufficient data for pattern inference.
- Do not treat T0_STALLED as universally undesirable; a T0-stalled pool is stable and predictable even if no further transformation capacity remains.
- Do not assume AUSTENITE_STABLE pools will remain sub-Bs; a single large event can rapidly push through Bs (bainite-start).
- Do not treat the bainite fraction fB as a rigorous measured value — it is inferred from snapshot pattern features, not measured by diffraction or dilatometry.
- Do not assume Bhadeshia's model quantitatively applies to DLMM bins — the model is a macroscopic empirical fit for real bainitic steels with alloy-specific constants.
- Do not conflate sheaf count with crystallographic sheaves — here it is connected-cluster count in 1-D bin space, not actual crystallographically aligned plate groups.
- Do not assume sheaf coherence measures a real habit-plane orientation; it is adjacent-pair fraction, a proxy.
- Do not assume sub-unit count measures real elementary nucleation units; it is dense-run count, a proxy.
- Do not conflate carbon partitioning with real carbon concentration gradients; here it is reserve asymmetry, a proxy for composition differentiation.
- Do not assume T0 carbon limit matches the real alloy-specific T0 curve; it is a normalized proxy.
- Do not conflate upper/lower bainite classification with metallurgical definitions — here based on sheaf size/sub-unit count/carbon partitioning, not on measured aspect ratios or carbide positions.
- Do not assume incomplete reaction index predicts dilatometric measurements; it is a pattern-based proxy.
- Do not treat retained austenite film as rigorously measured; gaps may include geometric features unrelated to the transformation.
- Do not conflate DLMM bin population transformation with 3-D crystallographic bainitic transformation; the analogy is heuristic.
- Do not ignore asymmetric reserves (reserveX vs reserveY) — here they drive the carbon partitioning proxy but do not correspond to real atomic composition.
- Analysis is snapshot-based; does not capture time-evolution of transformation — displacive and diffusional rates inferred from current pattern rather than measured.
- Driving force is inferred from 24h volume/TVL turnover — a proxy for undercooling below Bs, not a measured thermodynamic quantity.
- Bhadeshia compliance at a snapshot does not guarantee forward kinetic compliance; a pool showing good fit now may deviate over time.
- T0_MAX_FRACTION fixed at 0.88; real T0 curves vary with alloy composition and temperature.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "Bainite analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest bainite index as the one with the strongest bainitic transformation signature (high fB with moderate driving force, high sheaf alignment, strong carbon partitioning, high Bhadeshia compliance).
- Flag pools in UPPER_BAINITIC regime as showing coarse feathery sheaves — LP in sheaf interiors consolidates liquidity; retained-austenite-film gaps between sheaves are LP entry opportunities.
- Flag pools in LOWER_BAINITIC regime as showing fine needle-like morphology with intra-lath carbide analog (high carbon partitioning) — LP agents can exploit composition asymmetry by adding to carbon-depleted sides.
- Flag pools in T0_STALLED regime as saturated — no further transformation capacity, redeploy capital elsewhere.
- Flag pools in PRE_BAINITIC regime as in incubation — monitor for sheaf formation; do not yet treat as bainitic.
- Flag pools in AUSTENITE_STABLE regime as smooth-gradient — classical LP behavior applies.
- Flag pools with carbon partitioning > 0.4 as having strong composition asymmetry — strategic LP addition to the depleted side captures partitioning flow.
- Flag pools with sheaf count ≥ 2 and aligned sheafCoherence > 0.5 as sheaf-dominated — LP positions in sheaves benefit from parallel-plate consolidation.
- Flag pools with incomplete reaction index > 0.5 as having asymptoted — limited capacity for further transformation.
- Report the inferred morphology (UPPER_BAINITE or LOWER_BAINITE) to characterize plate structure.
- Show bins with highest bainite fraction as the ones most advanced in the bainitic product phase.
- Show bins with highest sheaf alignment as the anchors of parallel plate structure.
- Show bins with highest sub-unit count as the cascading sub-unit nucleation sites (lower bainite signature).
- Show bins with highest carbon partitioning as the strongest composition-partitioned positions.
- Show bins with highest T0 approach as the ones closest to the transformation limit.
- Show bins with highest retained austenite film as the thin-film LP entry candidates.
- Show bins with highest displacive-partitioning mix as the classical bainitic mixed-regime positions.
- Show bins with highest incomplete reaction index as the T0-stalled candidates.
- Show bins with highest Bhadeshia compliance as the classical-bainitic-law conformers.
- Show bins with highest plate aspect ratio as the lower-bainite needle candidates.
- Show bins with highest T0 carbon limit as the thermodynamically capped positions.
- For LP agents: in AUSTENITE_STABLE pools, classical LP behavior applies — use standard concentration strategies. In PRE_BAINITIC pools, wait for sheaf formation. In UPPER_BAINITIC pools, position in sheaf interiors (consolidated liquidity) or in thin-film gaps between sheaves (low-competition entry). In LOWER_BAINITIC pools, exploit carbon-partitioning asymmetry by adding to the carbon-depleted reserve side. In T0_STALLED pools, redeploy — no remaining transformation capacity.
- For trading agents: AUSTENITE_STABLE pools have smooth liquidity — predictable slippage. PRE_BAINITIC pools have early nucleation — moderate slippage with monitoring needed. UPPER_BAINITIC pools have consolidated sheaf liquidity with thin-film gaps — large slippage variance at film crossings. LOWER_BAINITIC pools have fine-structure liquidity with strong composition partitioning — directional slippage asymmetry. T0_STALLED pools have saturated but bounded liquidity — predictable but limited.
- Compare bainite indices and driving forces across pools to find bins and pools with the strongest bainitic signature for the intended LP or trading strategy.
