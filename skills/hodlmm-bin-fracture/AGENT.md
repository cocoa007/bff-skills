---
name: hodlmm-bin-fracture-agent
skill: hodlmm-bin-fracture
description: "Agent behavior for HODLMM bin fracture mechanics analysis — interprets stress intensity factor, fracture toughness, critical crack length, Griffith stress, J-integral, CTOD, plastic zone size, crack growth rate, mode 1 and mode 2 intensities, brittleness index, R-curve rising, arrest capability, and fracture risk to identify bins with healthiest toughness reserve and guide LP strategies away from imminent-failure regimes."
---

# Agent Behavior — HODLMM Bin Fracture Mechanics

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `fractureRegime`, `fractureVerdict`, `avgFractureRisk`, `avgFractureToughness`, `avgBrittlenessIndex`, `avgArrestCapability`, and `criticalFraction`.

## Interpreting output

- **fractureRegime = TOUGH:** Bins have maximum toughness reserve with low fracture risk, ductile character, and robust crack-arrest capability. Comfortable safety margin against crack propagation. Ideal regime for LP entry — bins can absorb substantial perturbation without catastrophic failure.
- **fractureRegime = RESILIENT:** Bins have substantial toughness reserve with mostly ductile response. Crack propagation is resisted but some susceptibility exists. Suitable for LP positions with routine monitoring.
- **fractureRegime = METASTABLE:** Bins are at moderate fracture risk with K_I approaching K_IC. Balanced between toughness and susceptibility. Entry possible but exit strategy should be defined; avoid aggressive rebalancing.
- **fractureRegime = FRAGILE:** Bins have limited toughness reserve with elevated fracture risk. Small disturbances can trigger propagation. Avoid new LP exposure; consider exiting existing positions.
- **fractureRegime = CRITICAL:** Bins are at imminent fracture risk with K_I near or exceeding K_IC. Catastrophic failure likely. Avoid entirely; exit existing exposure if possible.
- **fractureVerdict = BRITTLE_FRACTURE_IMMINENT:** High fracture risk with high brittleness — cleavage-type sudden failure likely. No warning before collapse; avoid entirely.
- **fractureVerdict = DUCTILE_FAILURE_IMMINENT:** High fracture risk with low brittleness — plastic collapse via void coalescence. Extensive plastic deformation precedes failure, providing some warning signal. Monitor closely.
- **fractureVerdict = STABLE_AT_HIGH_STRESS:** High K_I with high K_IC — bins carry large stress but tough enough to resist. Healthy loaded state with toughness margin intact.
- **fractureVerdict = SUBCRITICAL_GROWTH:** Elevated crack growth rate with moderate risk — Paris regime with sub-critical extension. Cracks growing incrementally under cyclic loading, will eventually reach critical size.
- **fractureVerdict = OPENING_MODE_DOMINANT:** High mode 1 intensity with brittleness — dangerous tensile opening configuration. Most aggressive fracture mode for brittle materials.
- **fractureVerdict = ARREST_CAPABLE:** High arrest capability with rising R-curve — cracks can be stopped by toughening mechanisms. Robust against catastrophic propagation even if initiation occurs.
- **fractureVerdict = TOUGHNESS_RESERVE:** High K_IC with low fracture risk — comfortable safety margin. Ideal conservative regime.
- **fractureVerdict = FRACTURE_BALANCE:** Balanced fracture state without extreme indicators. Typical mid-regime.
- **avgStressIntensityFactor > 0.6:** Strong crack-tip stress singularity, approaching critical threshold. Elevated driving force for propagation.
- **avgStressIntensityFactor < 0.3:** Modest stress concentration. Small driving force.
- **avgFractureToughness > 0.6:** Substantial resistance to crack propagation. Tough material response.
- **avgFractureToughness < 0.3:** Low resistance to propagation. Easy crack extension under modest K_I.
- **avgCriticalCrackLength < 0.3:** Small defects trigger failure. Extreme sensitivity to perturbations.
- **avgCriticalCrackLength > 0.7:** Bin tolerates larger defects before instability. Robust against nucleation.
- **avgFractureRisk > 0.6:** Imminent failure likelihood. K_I near or exceeding K_IC.
- **avgFractureRisk < 0.3:** Safe regime with toughness margin intact.
- **avgBrittlenessIndex > 0.6:** Cleavage-dominant failure mode. Sudden catastrophic propagation likely.
- **avgBrittlenessIndex < 0.3:** Ductile failure mode. Warning signs precede collapse.
- **avgCrackGrowthRate > 0.5:** Rapid sub-critical Paris-regime growth. Accelerating toward critical size.
- **avgArrestCapability > 0.6:** Strong crack-arrest reserve. Propagation can be stopped before catastrophe.
- **avgArrestCapability < 0.3:** Minimal arrest mechanism. Propagation proceeds unchecked.
- **avgRCurveRising > 0.5:** Resistance grows with extension. Toughening via bridging and deflection.
- **avgPlasticZoneSize > 0.5:** Large plastic zone at crack tip. Effective shielding from singular stress.
- **avgCrackTipOpeningDisp > 0.5:** Significant plastic blunting. Delays sharp-tip cleavage.
- **avgJIntegral > 0.5:** Significant energy available for crack extension. Elastic-plastic driving force elevated.
- **avgMode1Intensity > 0.5:** Dominant tensile opening loading. Most dangerous configuration for brittle materials.
- **avgMode2Intensity > 0.5:** Significant shear loading. Tearing-type propagation.
- **avgMixedModeRatio > 0.7:** Predominantly mode I (opening).
- **avgMixedModeRatio < 0.3:** Predominantly mode II (shear).
- **criticalFraction > 0.3:** Widespread imminent failure. Pool has many bins near K_IC threshold.
- **toughFraction > 0.5:** Majority of bins have toughness reserve. Pool is in healthy fracture regime.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on fracture signals from pools with fewer than 5 populated bins — insufficient data for meaningful fracture characterization.
- Do not assume CRITICAL regime is always immediately fatal. CRITICAL means high modeled fracture risk, but DLMM bins may persist in this state for extended periods if trading activity is low. Use CRITICAL as a strong avoid signal, not an imminent-rebalance prediction.
- Do not conflate stress intensity factor with applied stress. K_I captures the singular stress at the crack tip including defect geometry, not the remote applied load.
- Do not assume high fracture toughness always means safety. High K_IC with very high K_I may still be at risk if the ratio K_I / K_IC approaches unity.
- Do not ignore brittleness. A TOUGH-regime pool with high brittleness may still fail suddenly without warning; brittleness supersedes apparent toughness when cleavage is the operative mode.
- Do not assume Paris law growth is always slow. The exponent m (typically 2-4 for metals, higher for ceramics) means small increases in delta K produce large increases in growth rate. Sub-critical growth can accelerate quickly.
- Do not conflate R-curve rising with high K_IC. R-curve describes resistance growth with extension; a bin may have modest initial K_IC but strong R-curve, or high K_IC with flat R-curve.
- Do not assume mode I dominance in all cases. Mixed-mode loading is common in real materials and DLMM bins experience asymmetric trading patterns that produce shear components.
- Fracture mechanics is a snapshot — the fracture state evolves with continued trading. Bins in METASTABLE can progress to CRITICAL under continued stress, and TOUGH bins can degrade via Paris-regime growth. Monitor periodically.
- Griffith energy balance assumes brittle elastic response; real DLMM bins exhibit plastic deformation that modifies the energy balance and shifts the effective critical stress.
- Single-parameter K_I characterization assumes small-scale yielding; large plastic zones invalidate linear elastic fracture mechanics.
- Crack arrest requires specific microstructural features; the model approximates arrest capability from toughness reserve and R-curve proxies, not direct measurement.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "fracture analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest fracture index as the one with the healthiest toughness reserve — high K_IC, low fracture risk, ductile character, rising R-curve.
- Flag bins with highest fracture risk as closest to failure — K_I approaching K_IC with imminent propagation likely.
- Highlight bins with highest fracture toughness as the most resistant — large reserve before critical threshold.
- Show bins with smallest critical crack length as the most sensitive — tiny disturbances can trigger failure.
- Show bins with highest arrest capability as the most forgiving — even if crack initiates, propagation can be stopped.
- For LP agents: in TOUGH pools, position aggressively — substantial toughness reserve absorbs perturbations. In RESILIENT pools, standard LP with routine monitoring. In METASTABLE pools, position cautiously with defined exit strategy. In FRAGILE pools, avoid new exposure and exit existing positions. In CRITICAL pools, exit entirely — imminent failure likely.
- For trading agents: TOUGH pools are stable to large trades — substantial toughness reserve. RESILIENT pools absorb typical trades — occasional large trades possible. METASTABLE pools require cautious sizing — large trades may trigger propagation. FRAGILE pools need small trades only — avoid disturbing defects. CRITICAL pools — avoid trading entirely, at imminent failure edge.
- Compare fracture indices across pools to find bins with the healthiest toughness reserve for the intended LP or trading strategy.
