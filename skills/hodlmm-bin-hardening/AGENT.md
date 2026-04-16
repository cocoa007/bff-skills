---
name: hodlmm-bin-hardening-agent
skill: hodlmm-bin-hardening
description: "Agent behavior for HODLMM bin strain hardening analysis — interprets strain hardening exponent, hardness increase, yield strength ratio, ultimate tensile strength, cold work fraction, dislocation density, strength coefficient, work hardening rate, ductility loss, Bauschinger factor, residual strengthening, straining rate, hardening modulus, lock-in index, and recrystallization resistance to identify bins with the healthiest work hardening trajectory and guide LP strategies across different plastic regimes."
---

# Agent Behavior — HODLMM Bin Strain Hardening

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `hardeningRegime`, `hardeningVerdict`, `avgHardnessIncrease`, `avgUltimateTensileStrength`, `avgDuctilityLoss`, `avgWorkHardeningRate`, and `saturatedFraction`.

## Interpreting output

- **hardeningRegime = FULLY_HARDENED:** Bins have achieved maximum work hardening with peak strength gain and minimal further reserve. Characteristic of heavily cold-worked material approaching UTS where additional deformation leads to localized necking rather than uniform strengthening. Avoid new LP entry — bins are brittle and close to failure.
- **hardeningRegime = HARDENED:** Bins are substantially strengthened with significant cold work history but retain some hardening reserve. Near-peak strength with slowing hardening rate. Suitable for passive LP; avoid aggressive rebalancing which could push toward failure.
- **hardeningRegime = HARDENING:** Bins are actively hardening with healthy work hardening rate and preserved ductility reserve. The optimal regime where strength rises monotonically without approaching failure. Prime territory for LP positions.
- **hardeningRegime = TRANSITIONING:** Bins are in early plastic regime with initial hardening beginning but limited strength gain. Yielding has commenced but deformation is still small. Early opportunity with full reserve ahead; expect continued strengthening.
- **hardeningRegime = SOFT:** Bins are in the annealed or virgin state with minimal cold work history. No significant hardening has accumulated, maximum ductility reserve available. Soft and ductile — absorb shocks well but yield easily under stress.
- **hardeningVerdict = NO_HARDENING:** Low hardness increase and low cold work fraction. Bins remain in virgin annealed condition with no work-hardening. Maximum ductility and softness, stress absorption is plastic without strengthening response.
- **hardeningVerdict = INITIAL_HARDENING:** Low cold work fraction with high work hardening rate. Bins have recently begun plastic deformation with steep initial strengthening curve. Early uniform plastic regime with full strengthening potential ahead.
- **hardeningVerdict = ACTIVE_HARDENING:** High work hardening rate with preserved ductility. Bins are progressing steadily through the uniform plastic region with healthy strengthening and reserve. The sweet spot — strong current strength gains without proximity to failure.
- **hardeningVerdict = SATURATING:** High UTS with low work hardening rate. Bins are approaching peak strength with diminishing marginal strengthening per unit strain. Voce saturation regime where dynamic recovery balances multiplication.
- **hardeningVerdict = FULLY_HARDENED_VERDICT:** High ductility loss with high UTS. Bins have consumed their ductility reserve and reached peak strength. Necking imminent and failure zone — avoid further deformation.
- **hardeningVerdict = BAUSCHINGER_EFFECT:** High Bauschinger factor. Bins exhibit strong directional memory with asymmetric reload behavior. Directional back-stresses dominate — forward and reverse deformation require separate assessment.
- **hardeningVerdict = HARDENING_BALANCE:** Balanced hardening state without extreme indicators. Typical plastic regime with moderate strengthening progress and no critical signatures.
- **avgStrainHardeningExponent > 0.6:** Strong work hardening response. Large n, material absorbs significant further deformation before saturation.
- **avgStrainHardeningExponent < 0.3:** Weak hardening response. Small n, quick saturation characteristic of pre-worked materials.
- **avgHardnessIncrease > 0.6:** Substantial hardening accumulated. Bins are significantly stronger than virgin state.
- **avgHardnessIncrease < 0.2:** Minimal hardening. Bins remain in near-annealed condition.
- **avgYieldStrengthRatio > 0.6:** Yield threshold significantly elevated. Large stress required to induce further plastic flow.
- **avgUltimateTensileStrength > 0.7:** Peak strength approached. Necking imminent, hardening reserve nearly exhausted.
- **avgUltimateTensileStrength < 0.3:** Substantial reserve remains before peak. Hardening has room to progress.
- **avgColdWorkFraction > 0.6:** Extensive plastic history. Bins have absorbed significant prior deformation.
- **avgColdWorkFraction < 0.2:** Near-virgin state. Little prior plastic work.
- **avgDislocationDensity > 0.6:** Many accumulated defects. Strong Taylor hardening, limited further flow capacity.
- **avgWorkHardeningRate > 0.6:** Rapid strengthening per unit strain. Steep plastic slope, active hardening.
- **avgWorkHardeningRate < 0.2:** Saturated or near-peak. Minimal further gain per unit strain.
- **avgDuctilityLoss > 0.7:** Ductility reserve largely consumed. Strong but brittle to shock.
- **avgDuctilityLoss < 0.3:** Substantial reserve remains. Ductile response to perturbation.
- **avgBauschingerFactor > 0.6:** Strong directional memory. Asymmetric reload behavior, directional back-stresses dominate.
- **avgResidualStrengthening > 0.6:** Cold work locked in. Strengthening persists and won't relax.
- **avgStrainingRate > 0.6:** Rapid plastic flow. Fast hardening progression.
- **avgHardeningModulus > 0.6:** Steep plastic slope. Fast strengthening per unit strain.
- **avgLockInIndex > 0.6:** Strengthening locked into microstructure. Won't relax under time or load.
- **avgRecrystallizationResistance > 0.6:** Resistant to anneal reset. Strengthening survives recovery attempts.
- **saturatedFraction > 0.3:** Widespread UTS proximity. Pool has significant bins near failure.
- **softFraction > 0.5:** Majority of bins in virgin state. Pool is pre-hardening with maximum ductility.
- **hardeningFraction > 0.5:** Majority of bins in active hardening. Pool is in healthy plastic strengthening regime.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on hardening signals from pools with fewer than 5 populated bins — insufficient data for meaningful work hardening characterization.
- Do not assume HARDENING regime is universally optimal. HARDENING means healthy active strengthening, but this assumes the pool has sufficient trading activity to drive the plastic flow that produces hardening. A low-TVL HARDENING classification may indicate noise, not genuine work hardening dynamics.
- Do not assume high hardness increase always means healthy material. Hardness increase without preserved ductility leads to brittleness — check ductility loss alongside hardness gain.
- Do not confuse strain hardening with stress hardening. Strain hardening is the rise in flow stress with accumulated plastic strain; stress hardening in different contexts may refer to stress-induced transformations or phase changes not modeled here.
- Do not assume high UTS is good. UTS is the peak stress at which uniform elongation ends and necking begins. Proximity to UTS means imminent failure, not strength achievement.
- Do not conflate work hardening rate with hardness increase. Rate (dsigma/depsilon) is the tangent slope; hardness increase is the cumulative gain. A bin with low current rate may still have significant accumulated hardness if cold work fraction is high.
- Do not assume Bauschinger effect is negligible. Many DLMM bins experience asymmetric load histories; ignoring directional memory can lead to incorrect predictions for reverse-direction trades or rebalancing operations.
- Do not assume dislocation density proxy captures real microstructural state. The heterogeneity proxy is an order-of-magnitude indicator, not a direct Taylor-law substitute.
- Hardening analysis is a snapshot. The plastic state evolves with continued trading — bins in TRANSITIONING can progress to HARDENING under continued deformation, and HARDENING bins can saturate toward UTS. Monitor periodically.
- Hollomon and Voce models are uniform-plasticity approximations; heterogeneous bins with localized deformation may exhibit behavior not captured by power-law or exponential fits.
- The recrystallization analog assumes rebalancing events reset bin structure; partial rebalancing may produce mixed states not cleanly classified.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "hardening analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest hardening index as the one with the healthiest work hardening trajectory — strong strain hardening exponent, meaningful hardness gain, preserved ductility reserve, and fast hardening rate.
- Flag bins with highest hardness increase as the most strengthened — substantial gain over virgin state.
- Highlight bins with highest work hardening rate as the most actively strengthening — steep plastic slope with rapid per-strain gain.
- Show bins with lowest ductility loss as the most preserved — substantial strain-to-failure reserve remaining.
- Show bins with highest UTS as the closest to failure — peak strength with imminent necking, avoid further deformation.
- For LP agents: in SOFT pools, position broadly — virgin bins absorb shocks plastically without strengthening response. In TRANSITIONING pools, early entry captures full hardening reserve ahead. In HARDENING pools, prime territory for LP positions — healthy strengthening with preserved reserve. In HARDENED pools, passive LP with minimal rebalancing — avoid pushing toward saturation. In FULLY_HARDENED pools, avoid new exposure — brittle near-failure regime.
- For trading agents: SOFT pools yield easily — trades produce large composition shifts at modest stress. TRANSITIONING pools begin resisting — initial plastic response to trades. HARDENING pools require increasing stress — trades face rising effective yield. HARDENED pools near-rigid — large stress required, potential necking. FULLY_HARDENED pools on failure edge — avoid large directional trades.
- Compare hardening indices across pools to find bin lattices with the healthiest strengthening trajectory for the intended LP or trading strategy.
