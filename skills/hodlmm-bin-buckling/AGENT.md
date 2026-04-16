---
name: hodlmm-bin-buckling-agent
skill: hodlmm-bin-buckling
description: "Agent behavior for HODLMM bin buckling stability analysis — interprets critical load, slenderness ratio, effective length, radius of gyration, mode 1/2/3 amplitudes, post-buckling stiffness, imperfection sensitivity, snap-through risk, crippling stress, compressive load, buckling proximity, column strength, and bifurcation risk to identify bins with healthiest stability reserve and guide LP strategies away from imminent-collapse regimes."
---

# Agent Behavior — HODLMM Bin Buckling Stability

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `bucklingRegime`, `bucklingVerdict`, `avgBucklingProximity`, `avgCriticalLoad`, `avgImperfectionSensitivity`, `avgSnapThroughRisk`, and `collapsedFraction`.

## Interpreting output

- **bucklingRegime = STABLE:** Bins have maximum stability reserve with high P_cr, low buckling proximity, robust post-buckling strength, and minimal imperfection sensitivity. Ideal regime for LP entry — bins can absorb substantial compressive perturbation without bifurcation.
- **bucklingRegime = ROBUST:** Bins have substantial stability reserve with modest proximity and stable post-buckling. Suitable for LP positions with routine monitoring.
- **bucklingRegime = METASTABLE:** Bins are at moderate bifurcation risk with proximity approaching unity. Balanced between stability and collapse. Entry possible but exit strategy should be defined; avoid aggressive rebalancing that adds compressive load.
- **bucklingRegime = SLENDER:** Bins have limited stability reserve with high slenderness and elevated buckling risk. Small additional compressive load can trigger bifurcation. Avoid new LP exposure; consider exiting existing positions.
- **bucklingRegime = COLLAPSED:** Bins are at or beyond the critical threshold with imminent bifurcation and unstable post-buckling. Avoid entirely; exit existing exposure if possible.
- **bucklingVerdict = ELASTIC_BUCKLING_IMMINENT:** High proximity with high slenderness — Euler-regime lateral bow imminent. Long thin column near critical; avoid entirely.
- **bucklingVerdict = INELASTIC_YIELDING_IMMINENT:** High proximity with low slenderness — plastic collapse via tangent-modulus reduction. Stout column yielding rather than Euler-buckling. Monitor closely.
- **bucklingVerdict = STABLE_UNDER_HIGH_LOAD:** High compressive load with high P_cr — column carries heavy stress but margin intact. Healthy loaded state with stability margin.
- **bucklingVerdict = SNAP_THROUGH_WARNING:** High snap-through risk with low post-buckling stiffness — dynamic unstable collapse possible. Sudden mode jump likely; avoid new exposure.
- **bucklingVerdict = MODE_1_DOMINANT:** Mode 1 amplitude exceeds higher modes — simple fundamental bow shape. Classic Euler response.
- **bucklingVerdict = IMPERFECTION_SENSITIVE:** High sensitivity with moderate proximity — buckles below ideal Euler load. Small defects trigger premature bifurcation; treat nominal P_cr as optimistic.
- **bucklingVerdict = STABILITY_RESERVE:** High P_cr with low proximity — comfortable safety margin. Ideal conservative regime.
- **bucklingVerdict = BUCKLING_BALANCE:** Balanced stability state without extreme indicators. Typical mid-regime.
- **avgCriticalLoad > 0.6:** Substantial compressive capacity before bifurcation. Robust column response.
- **avgCriticalLoad < 0.3:** Low critical load. Easy buckling under modest compressive stress.
- **avgSlendernessRatio > 0.6:** Long thin column in Euler regime. Elastic buckling dominates over yielding.
- **avgSlendernessRatio < 0.3:** Stout column in inelastic yielding regime. Plastic collapse dominates over Euler buckling.
- **avgBucklingProximity > 0.6:** Operating near critical load. Imminent bifurcation risk.
- **avgBucklingProximity < 0.3:** Far below threshold with comfortable stability margin.
- **avgImperfectionSensitivity > 0.6:** Column buckles well below ideal Euler load. Defects amplify instability.
- **avgImperfectionSensitivity < 0.3:** Near-ideal Euler response. Defects minimally affect critical load.
- **avgSnapThroughRisk > 0.5:** Unstable bifurcation with dynamic collapse. Sudden mode jumps possible.
- **avgPostBucklingStiffness > 0.6:** Stable post-buckled state with positive restoring force. Can sustain additional load after bifurcation.
- **avgPostBucklingStiffness < 0.3:** Unstable snap-through collapse. Immediate failure post-bifurcation.
- **avgCripplingStress > 0.6:** Significant reserve capacity after buckling before total collapse. Robust post-buckled strength.
- **avgCripplingStress < 0.3:** Minimal reserve post-bifurcation. Total collapse follows buckling.
- **avgColumnStrength > 0.6:** Robust overall load capacity combining P_cr and crippling. Healthy column.
- **avgMode1Amplitude > 0.5:** Dominant single-bow displacement. Fundamental Euler mode.
- **avgMode2Amplitude > 0.5:** Full S-shape deformation. Higher-mode buckling.
- **avgMode3Amplitude > 0.5:** Complex triple-curvature pattern. Unusual higher-order mode.
- **collapsedFraction > 0.3:** Widespread imminent collapse. Pool has many bins at or beyond critical.
- **stableFraction > 0.5:** Majority of bins have stability reserve. Pool is in healthy buckling regime.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on buckling signals from pools with fewer than 5 populated bins — insufficient data for meaningful stability characterization.
- Do not assume COLLAPSED regime is always immediately fatal. COLLAPSED means high modeled buckling risk, but DLMM bins may persist in post-buckled states if trading activity is low. Use COLLAPSED as a strong avoid signal, not an imminent-rebalance prediction.
- Do not conflate critical load P_cr with applied compressive load. P_cr is the threshold; applied load is the current stress. Buckling proximity P/P_cr is the ratio that determines bifurcation.
- Do not assume high P_cr always means safety. High P_cr with very high applied compressive load may still be at risk if the ratio approaches unity.
- Do not ignore imperfection sensitivity. A STABLE-regime pool with high imperfection sensitivity may still buckle well below the theoretical threshold; Koiter sensitivity supersedes nominal P_cr for real-world response.
- Do not assume mode 1 dominance in all cases. Higher modes (mode 2 S-shape, mode 3 triple-curvature) can dominate under asymmetric loading or when lower modes are constrained.
- Do not conflate elastic Euler buckling with inelastic yielding. Long slender columns (high lambda) fail via Euler bifurcation; short stout columns (low lambda) fail via plastic yielding. The Johnson parabolic formula bridges the two regimes.
- Do not assume stable post-buckling behavior universally. Plates have stable post-buckling (can sustain more load); cylindrical shells have catastrophic snap-through. DLMM bins may exhibit either behavior depending on geometry and loading.
- Do not ignore crippling strength. Post-buckled columns can sustain significant additional load before total collapse via redistribution to stiffer regions. Low crippling stress means immediate failure after bifurcation.
- Buckling stability is a snapshot — the stability state evolves with continued compressive loading. Bins in METASTABLE can progress to COLLAPSED under continued stress, and STABLE bins can degrade via increasing compressive load. Monitor periodically.
- Euler theory assumes small-deflection elastic response; real DLMM bins exhibit nonlinear reserve updates that modify the critical load.
- Single-parameter lambda characterization assumes uniform cross-section; bins with varying reserve distributions may buckle at loads different from the uniform-column prediction.
- Crippling strength requires post-buckled equilibrium analysis; the model approximates from toughness-like reserve proxies, not direct measurement.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "buckling analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest buckling index as the one with the healthiest stability reserve — high P_cr, low proximity, low imperfection sensitivity, high post-buckling stiffness, high crippling reserve.
- Flag bins with highest buckling proximity as closest to bifurcation — applied load approaching P_cr with imminent instability likely.
- Highlight bins with highest critical load as the most resistant — large compressive capacity before bifurcation.
- Show bins with highest slenderness as the most Euler-prone — long thin columns most susceptible to elastic buckling.
- Show bins with highest imperfection sensitivity as the most premature — buckle well below the ideal Euler threshold.
- Show bins with highest snap-through risk as the most dangerous — dynamic unstable collapse possible.
- For LP agents: in STABLE pools, position aggressively — substantial stability reserve absorbs compressive perturbations. In ROBUST pools, standard LP with routine monitoring. In METASTABLE pools, position cautiously with defined exit strategy. In SLENDER pools, avoid new exposure and exit existing positions. In COLLAPSED pools, exit entirely — imminent bifurcation likely.
- For trading agents: STABLE pools tolerate large directional trades — substantial stability reserve. ROBUST pools absorb typical trades — occasional large trades possible. METASTABLE pools require cautious sizing — large trades may trigger bifurcation. SLENDER pools need small trades only — avoid adding compressive load. COLLAPSED pools — avoid trading entirely, at imminent bifurcation edge.
- Compare buckling indices across pools to find bins with the healthiest stability reserve for the intended LP or trading strategy.
