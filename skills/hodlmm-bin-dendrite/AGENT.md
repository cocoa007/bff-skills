---
name: hodlmm-bin-dendrite-agent
skill: hodlmm-bin-dendrite
description: "Agent behavior for HODLMM bin dendritic growth analysis — interprets supercooling, tip radius, growth velocity, primary and secondary arm spacings, Ivantsov Peclet, Mullins-Sekerka stability criterion, sidebranching intensity, dendrite volume fraction, interdendritic segregation, constitutional gradient, coarsening, branching order, tip selection, and dendritic anisotropy to identify bins in planar, cellular, proto-dendritic, well-branched, or fully-dendritic morphologies and guide LP strategies toward structurally coherent dendritic pools with selected stable tips and balanced branching."
---

# Agent Behavior — HODLMM Bin Dendrite

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `dendriteRegime`, `dendriteVerdict`, `avgDendriteVolumeFraction`, `avgSidebranchingIntensity`, `avgStabilityCriterion`, `avgInterdendriticSegregation`, and `dendriticBinFraction`.

## Interpreting output

- **dendriteRegime = FULLY_DENDRITIC:** Developed primary trunks with multi-order sidebranches, selected tips, and segregation channels. Mature structurally coherent branching with stable operating state. Best for LP positions that benefit from structured multi-scale liquidity distribution.
- **dendriteRegime = WELL_BRANCHED:** Primary and secondary arms developed with partial sidebranching. Active but not fully mature dendritic structure. Suitable for LP positions tracking development toward full morphology.
- **dendriteRegime = PROTO_DENDRITIC:** Emerging branches with marginal Mullins-Sekerka stability, cellular-to-dendritic transition underway. Mid-morphology state. Position cautiously as branching is actively evolving.
- **dendriteRegime = CELLULAR:** Shallow cellular protrusions without tip selection. Subcritical instability with some morphological activity but not yet branched. Entry possible but expect structural evolution.
- **dendriteRegime = PLANAR:** Stable smooth interface with no branching. Near-equilibrium. Safest for conservative LP positions but limits liquidity spread into adjacent bins.
- **dendriteVerdict = FEATHERED_DENDRITE:** Classical fully developed dendrite with primary trunk, secondary arms, and tertiary sidebranches. Best structural coherence.
- **dendriteVerdict = OPTIMAL_MS_SELECTION:** Mullins-Sekerka stability criterion satisfied with good tip selection — stable well-chosen operating state. Healthy dendrite physics.
- **dendriteVerdict = HIGH_SUPERCOOLING_GROWTH:** Strong driving force with fast growth and active sidebranching. Aggressive morphology development.
- **dendriteVerdict = COARSENED_SPACING:** Mature secondary arm spacing from prolonged coarsening. Stabilized microstructure with reduced surface area.
- **dendriteVerdict = DEEP_SEGREGATION:** Strong interdendritic segregation with solute-rich channels. Compositional heterogeneity locked in between arms.
- **dendriteVerdict = ANISOTROPIC_ALIGNED:** Strongly aligned trunks along a preferred growth direction with wide primary spacing. Directional liquidity flow.
- **dendriteVerdict = STABLE_PLANAR:** Low volume fraction and low supercooling — smooth interface with no morphological instability.
- **dendriteVerdict = MARGINAL_PROTO_DENDRITIC:** Moderate sidebranching near the cellular-to-dendritic threshold. Unstable mid-transition.
- **dendriteVerdict = TILLER_UNSTABLE:** High constitutional gradient with supercooling — planar front destabilizing, branching imminent.
- **dendriteVerdict = DENDRITIC_EQUILIBRIUM:** No extreme indicators. Typical partially branched morphology.
- **avgDendriteVolumeFraction > 0.6:** Bulk of bin volume is dendritic. Well-developed morphology.
- **avgDendriteVolumeFraction < 0.2:** Mostly planar. Minimal branching.
- **avgSidebranchingIntensity > 0.6:** Dense feathered sidebranches. Strong branching amplification.
- **avgSidebranchingIntensity < 0.3:** Bare unbranched trunks. No secondary arms yet.
- **avgStabilityCriterion > 0.6:** Mullins-Sekerka stability well satisfied. Selected stable tip.
- **avgStabilityCriterion < 0.3:** Off-optimal tip or destabilized interface. Tip operating state poorly selected.
- **avgSupercooling > 0.6:** Strong thermal/constitutional driving force. Near-dendritic-transition.
- **avgSupercooling < 0.3:** Near-equilibrium planar.
- **avgPeclet > 0.6:** Advection-dominated tip with sharp solute pileup. Fast sharp dendrites.
- **avgPeclet < 0.3:** Diffusion-dominated quasi-planar regime.
- **avgPrimaryArmSpacing > 0.6:** Wide trunk spacing with fewer larger trunks. Low gradient or low velocity conditions.
- **avgSecondaryArmSpacing > 0.6:** Coarsened mature side-arm spacing. Structure has spent time maturing.
- **avgInterdendriticSegregation > 0.6:** Deep solute-rich channels between arms. Strong compositional locking.
- **avgBranchingOrder > 0.6:** Multiple generations (primary + secondary + tertiary). Rich morphology.
- **avgTipSelection > 0.6:** Optimal tip selection per sigma* criterion. Physically well-operating dendrite.
- **avgDendriticAnisotropy > 0.6:** Strongly aligned trunks along preferred growth direction.
- **avgCoarsening > 0.6:** Mature coarsened microstructure. Long-duration morphology.
- **avgConstitutionalGradient > 0.6:** Steep compositional gradients. Favor instability.
- **dendriticBinFraction > 0.3:** Substantial fraction of bins fully dendritic.
- **protoDendriticBinFraction > 0.3:** Many bins in cellular-to-dendritic transition.
- **planarBinFraction > 0.5:** Mostly planar pool with limited branching.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on dendritic signals from pools with fewer than 5 populated bins — insufficient data for meaningful analysis.
- Do not treat FULLY_DENDRITIC as universally desirable; rich branching also means strong interdendritic segregation and compositional heterogeneity.
- Do not assume PLANAR is stable indefinitely. A planar interface below Tiller threshold will destabilize once gradient exceeds threshold; monitor constitutional gradients.
- Do not conflate high sidebranching with yield optimality. Sidebranches increase surface area and capture but also fragment liquidity into thin regions.
- Do not ignore Ostwald coarsening effects. Long-lived dendritic structures thicken their secondary arms and fewer arms persist over time.
- Do not assume Mullins-Sekerka sigma* is exactly 1/(4*pi^2); empirical values span 0.01-0.1 depending on anisotropy and alloy.
- Do not treat primary and secondary arm spacings as independent; secondaries scale with trunk spacing and coarsening history.
- Do not assume the Ivantsov parabolic tip applies perfectly; real tips show orientation-dependent deviations.
- Do not ignore noise sources. Sidebranching is noise-amplified; DLMM noise is order flow, arbitrage, and MEV, not thermal fluctuations.
- Do not conflate constitutional supercooling with thermal supercooling. Both destabilize planar fronts but via different gradient fields.
- Do not assume dendritic anisotropy is fixed; preferred orientation depends on deformation history, and DLMM "crystallinity" is an analogy, not a physical direction.
- Do not assume branching order is unbounded; hierarchical dendrites saturate at a few generations due to diffusion-field overlap.
- Do not apply the Tiller criterion G/V < dT_L/dC_0*(1-k)/(D*k) with guessed partition coefficient k; uncertain k leads to uncertain threshold.
- Interdendritic segregation measured here is a reserve imbalance proxy; real microsegregation requires partition coefficient data.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "dendrite analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest dendrite index as the one with the most structurally coherent branched liquidity morphology.
- Flag bins with highest dendrite volume fraction as the most bulk-branched — strongest dendritic development.
- Highlight bins with highest sidebranching intensity as the most richly feathered — dense secondary and higher branches.
- Show bins with highest stability criterion as the most Mullins-Sekerka-selected — operating at optimal sigma*.
- Show bins with highest supercooling as the most aggressively growing — strong driving force.
- Show bins with highest interdendritic segregation as the most compositionally heterogeneous — solute-rich channels between arms.
- Show bins with highest branching order as the most hierarchically developed — primary, secondary, tertiary arms.
- Show bins with highest tip selection as the most physically well-operating — selected tip per sigma*.
- Show bins with lowest tip radius as the sharpest fastest-moving dendrite tips.
- For LP agents: in FULLY_DENDRITIC pools, position with awareness of interdendritic segregation — solute-rich channels may shift pricing. In WELL_BRANCHED pools, standard LP with branching-aware monitoring. In PROTO_DENDRITIC pools, expect morphology evolution; position with transition-tolerant strategies. In CELLULAR pools, entry possible but expect branching development. In PLANAR pools, smooth stable liquidity but limited spread; monitor for constitutional-gradient-driven destabilization.
- For trading agents: FULLY_DENDRITIC pools have multi-scale liquidity with structured primary and secondary flow paths; trade along primary trunks for minimal slippage. WELL_BRANCHED pools have primary paths with emerging side channels. PROTO_DENDRITIC pools are in transition — expect regime changes. CELLULAR pools have shallow protrusions without true trunks. PLANAR pools have smooth uniform liquidity — predictable response.
- Compare dendrite indices across pools to find bins with the healthiest branching morphology for the intended LP or trading strategy.
