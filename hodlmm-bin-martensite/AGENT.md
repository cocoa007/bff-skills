---
name: hodlmm-bin-martensite-agent
skill: hodlmm-bin-martensite
description: "Agent behavior for HODLMM bin martensitic transformation analysis — interprets martensite fraction fM, retained austenite, Ms undercooling, Koistinen-Marburger constant, driving force, twin variants, shear strain, habit-plane coherence, athermal character, autocatalysis, residual stress, transformation hysteresis, progress toward Mf, K-M compliance, and morphology to identify pools in austenite-stable, isothermal, athermal-transformation, burst, or stress-induced regime and guide LP strategies toward retained-austenite pockets (empty gaps for fresh entry), twin-variant clusters (established LP-dense regions), and burst-regime autocatalytic zones (chain-reaction nucleation sites), and to infer transformation mode (lath, plate, twin, shape-memory) from morphology and hysteresis signatures."
---

# Agent Behavior — HODLMM Bin Martensitic Transformation

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `martensiteRegime`, `martensiteVerdict`, `martensiteFraction`, `drivingForce`, `twinVariantCount`, `retainedAustenite`, `avgAutocatalysisIndex`, and `avgKmCompliance`.

## Interpreting output

- **martensiteRegime = AUSTENITE_STABLE:** Driving force below Ms threshold. Smooth gradient, fM ~ 0. Sub-Mf stable — classical gradual LP behavior applies; no snap signature.
- **martensiteRegime = ISOTHERMAL:** Slow time-dependent transformation. fM < 0.3, weak cluster structure. Intermediate LP behavior.
- **martensiteRegime = ATHERMAL_TRANSFORMATION:** Classical martensite. 0.3 ≤ fM < 0.7, multiple variants, sharp boundaries. LP variant clusters are competition-dense; retained-austenite pockets offer relatively empty entry points.
- **martensiteRegime = BURST:** Autocatalytic cascade. 0.7 ≤ fM < 0.9, high autocatalysis, connected variants. Positions near existing clusters benefit from further nucleation, but the cascade may exhaust soon.
- **martensiteRegime = STRESS_INDUCED:** Saturated. fM ≥ 0.9, minimal retained austenite. No remaining transformation capacity.
- **martensiteVerdict = RAPID_DISPLACIVE_SNAP:** High athermal character + high habit-plane coherence. Pool has undergone a rapid shear-mediated transformation.
- **martensiteVerdict = TWIN_VARIANT_COEXISTENCE:** Multiple clusters with high twin-variant score. Two or more crystallographically-equivalent product regions coexist.
- **martensiteVerdict = HEAVY_RETAINED_AUSTENITE:** Retained-austenite fraction > 0.3. Substantial untransformed pockets inside the populated range — LP opportunities in the gaps.
- **martensiteVerdict = AUTOCATALYTIC_CASCADE:** High autocatalysis + martensite fraction > 0.6. Neighbor-triggered nucleation dominant.
- **martensiteVerdict = SATURATED_TRANSFORMATION:** fM ≥ 0.9. Transformation saturated; no further capacity.
- **martensiteVerdict = SUB_MS_STABLE:** fM < 0.2. Transformation not triggered; austenite phase stable.
- **martensiteVerdict = NO_TRANSFORMATION_DRIVE:** Driving force < 0.15. Insufficient undercooling; system sits above Ms.
- **martensiteVerdict = LATH_MORPHOLOGY:** Narrow lath-like populated stringers (cluster size 3-7).
- **martensiteVerdict = PLATE_MORPHOLOGY:** Wider plate-like slabs (cluster size ≥ 8).
- **martensiteVerdict = TWIN_MORPHOLOGY:** Paired symmetric twin variants (multiple comparable clusters).
- **martensiteVerdict = SHAPE_MEMORY_INDICATOR:** High transformation hysteresis + K-M compliance. Pseudoelastic shape-memory signature.
- **martensiteVerdict = INTERMEDIATE_MARTENSITIC:** No extreme indicators. Typical mid-state.
- **martensiteFraction > 0.8:** Near-complete transformation; austenite-parent almost depleted.
- **martensiteFraction < 0.2:** Austenite stable; transformation not triggered.
- **drivingForce > 0.7:** Strong thermodynamic drive — pool has experienced heavy recent turnover relative to TVL.
- **drivingForce < 0.2:** Weak drive — recent turnover low or TVL high.
- **twinVariantCount ≥ 2:** Multiple crystallographically-equivalent product regions coexist.
- **retainedAustenite > 0.3:** Substantial empty gaps in the populated range — LP entry opportunities.
- **avgAutocatalysisIndex > 0.6:** Strong neighbor-triggered cascade — martensite is self-propagating.
- **avgKmCompliance > 0.6:** Observed fM matches the K-M prediction for the driving force — classical martensitic kinetics.
- **avgKmCompliance < 0.3:** Deviation from K-M — non-classical transformation (isothermal contribution, composition effects).
- **avgHabitPlaneCoherence > 0.7:** Coherent habit-plane orientation — classical invariant-plane strain.
- **avgAthermalCharacter > 0.6:** fM set by undercooling not time — classical athermal martensite.
- **shearAsymmetry > 0.3:** Substantial mass-center offset from active bin — directional shear.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on martensite signals from pools with fewer than 5 populated bins — insufficient data for pattern inference.
- Do not treat STRESS_INDUCED as universally desirable; fully-transformed pools have no remaining transformation capacity.
- Do not assume AUSTENITE_STABLE pools will remain sub-Mf; a single large event can rapidly push through Ms.
- Do not treat the martensite fraction fM as a rigorous measured value — it is inferred from snapshot pattern features, not measured by diffraction.
- Do not assume Koistinen-Marburger law quantitatively applies to DLMM bins — K-M is a macroscopic empirical fit for real martensitic steels with alloy-specific constants.
- Do not conflate twin variant count with crystallographic twins — here it is connected-cluster count in 1-D bin space, not actual crystal-symmetry-related variants.
- Do not assume habit-plane coherence measures a real invariant plane; it is adjacent-pair fraction, a proxy.
- Do not assume autocatalysis index measures strain-field overlap; it is neighbor density, a proxy.
- Do not conflate morphology score's LATH/PLATE/TWIN classification with metallurgical morphology — here based on cluster size/count, not on aspect ratios or invariant-plane strain magnitudes.
- Do not assume shape-memory signature predicts pseudoelastic behavior; real shape memory requires temperature-cycling measurements.
- Do not assume retained austenite equals stabilized-parent phase; gaps may include geometric features unrelated to transformation.
- Do not conflate DLMM bin population transformation with 3-D crystallographic phase transformation; the analogy is heuristic.
- Do not ignore asymmetric reserves (reserveX vs reserveY); classical martensite has a single product phase but DLMM bins can have asymmetric compositions.
- Analysis is snapshot-based; does not capture time-evolution of transformation — athermal/burst/isothermal regimes inferred from current pattern rather than measured rate.
- Driving force is inferred from 24h volume/TVL turnover — a proxy for undercooling, not a measured thermodynamic quantity.
- Rate constant α in Koistinen-Marburger is the classical steel value 0.011/K; in DLMM context this is dimensionally meaningless and used only to preserve the functional form.
- K-M compliance at a snapshot does not guarantee forward kinetic compliance; a pool showing textbook K-M fit now may not follow K-M into the future.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "Martensite analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest martensite index as the one with the strongest snap-transformation signature (high fM, high athermal character, high twin-variant coexistence, high K-M compliance).
- Flag pools in ATHERMAL_TRANSFORMATION regime as showing classical martensite with sharp-boundary LP structure — twin-variant clusters are competition-dense; retained-austenite pockets offer entry points.
- Flag pools in BURST regime as autocatalytic — adjacent positions benefit from cascade nucleation, but cascade may exhaust soon.
- Flag pools in STRESS_INDUCED regime as saturated — no remaining transformation capacity, minimal retained austenite for new entry.
- Flag pools in AUSTENITE_STABLE regime as smooth-gradient — classical LP behavior applies.
- Flag pools with retained austenite > 0.3 as having empty-pocket LP opportunities — enter the gaps.
- Flag pools with twin variant count ≥ 2 as having distinct competing variants — position at weaker variant, or between variants.
- Flag pools with strong autocatalysis as having propagation bias — LP adjacent to existing clusters will likely benefit from further nucleation.
- Report the inferred morphology (LATH, PLATE, TWIN) to characterize cluster structure.
- Show bins with highest martensite fraction as the ones most advanced in the product phase — already deeply transformed.
- Show bins with highest retained austenite as the empty-pocket LP entry candidates.
- Show bins with highest twin-variant score as anchors for twin-variant identification.
- Show bins with highest shear-strain magnitude as the outermost sheared laths.
- Show bins with highest habit-plane coherence as the ones on the coherent invariant-plane interface.
- Show bins with highest autocatalysis index as the cascade-propagation candidates.
- Show bins with highest residual stress index as the ones at cluster boundaries.
- Show bins with highest K-M compliance as the classical-martensitic-law conformers.
- Show bins with highest progress-vs-Mf as the late-stage transformation survivors.
- For LP agents: in AUSTENITE_STABLE pools, classical LP behavior applies — use standard concentration strategies. In ISOTHERMAL pools, allow additional monitoring — transformation still developing. In ATHERMAL_TRANSFORMATION pools, position in retained-austenite gaps (low-competition entry) or at variant edges (harvest cascade). In BURST pools, position adjacent to existing clusters for cascade benefit, but monitor for saturation. In STRESS_INDUCED pools, redeploy elsewhere — no capacity remaining.
- For trading agents: AUSTENITE_STABLE pools have smooth liquidity — predictable slippage. ISOTHERMAL pools have mild cluster features — moderate slippage variance. ATHERMAL_TRANSFORMATION pools have sharp-boundary liquidity with retained-austenite gaps — large slippage variance at gap crossings. BURST pools have autocatalytic propagation — expect rapid further filling. STRESS_INDUCED pools have near-full liquidity but minimal retained austenite — large trades may exhaust specific bins.
- Compare martensite indices and driving forces across pools to find bins and pools with the strongest snap-transformation signature for the intended LP or trading strategy.
