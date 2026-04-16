---
name: hodlmm-bin-ostwald-agent
skill: hodlmm-bin-ostwald
description: "Agent behavior for HODLMM bin Ostwald ripening and LSW coarsening analysis — interprets Gibbs-Thomson capillary pressure, critical radius position, ripening rate, size disparity, monodispersity deviation, LSW alignment, survivor likelihood, volume fraction conservation, coarsening maturity, number density decay, matrix diffusivity, chemical potential gradient, interparticle spacing, ripening supersaturation, and overall ripening progress to identify bins in quiescent, pre-ripening, active-ripening, steady-LSW, or advanced-coarsening states and guide LP strategies toward survivor bins (large, above-R_c) and away from shrinking bins (small, below-R_c)."
---

# Agent Behavior — HODLMM Bin Ostwald Ripening

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `ostwaldRegime`, `ostwaldVerdict`, `avgSizeDisparity`, `avgLswAlignment`, `avgCoarseningMaturity`, `avgRipeningRate`, `growingBinFraction`, and `shrinkingBinFraction`.

## Interpreting output

- **ostwaldRegime = ADVANCED_COARSENING:** Late-stage LSW with strong size disparity and few dominant survivors absorbing remaining reserves. Population thinned; large bins dominate. Position in survivor bins; avoid small bins that will continue to dissolve.
- **ostwaldRegime = STEADY_LSW:** Self-similar LSW distribution with <R>³ ∝ t coarsening. Predictable cube-root mean growth kinetics. Standard LP with awareness of monotonic coarsening.
- **ostwaldRegime = ACTIVE_RIPENING:** Established shrinking-vs-growing separation with visible critical radius R_c. Clear distinction between growing and shrinking populations. Position above R_c for growth.
- **ostwaldRegime = PRE_RIPENING:** Small disparities building from quiescent state. Ripening onset. Monitor for transition to active.
- **ostwaldRegime = QUIESCENT:** Uniform monodisperse distribution with no ripening driving force. Stable population — best for predictable LP but no coarsening signal.
- **ostwaldVerdict = LSW_STEADY_STATE:** High LSW alignment, coarsening maturity, monodispersity deviation. Textbook self-similar LSW — <R>³ ∝ t predictable.
- **ostwaldVerdict = ACCELERATED_COARSENING:** High ripening rate and chemical potential gradient. Fast evolution — expect rapid redistribution.
- **ostwaldVerdict = STRONG_CAPILLARY_PRESSURE:** High Gibbs-Thomson pressure and ripening supersaturation. Deep ripening driving force.
- **ostwaldVerdict = MONODISPERSE_STABLE:** Low disparity and low monodispersity deviation. Uniform population. Stable but no coarsening dynamics.
- **ostwaldVerdict = SHRINKING_POPULATION:** Majority of bins below critical radius — dissolving. Most bins are shrinking; position only in above-R_c survivors.
- **ostwaldVerdict = GROWING_POPULATION:** Substantial fraction above critical radius with high survivor likelihood. Above-R_c bins dominate.
- **ostwaldVerdict = CRITICAL_RADIUS_TRANSITION:** Many bins near R_c in transition. Ambiguous — could go either way.
- **ostwaldVerdict = EARLY_RIPENING:** Low maturity and rate. Initial stages. Awaiting clear critical-radius emergence.
- **ostwaldVerdict = NUMBER_DENSITY_DECAY:** High size disparity with decayed population count. Strong late-stage signature.
- **ostwaldVerdict = RIPENING_EQUILIBRIUM:** No extreme indicators. Typical mid-state.
- **avgSizeDisparity > 0.6:** Broad polydisperse distribution with large deviations from mean.
- **avgSizeDisparity < 0.3:** Tight near-monodisperse distribution.
- **avgMonodispersityDeviation > 0.6:** Broad distribution — LSW-like polydisperse.
- **avgMonodispersityDeviation < 0.3:** Near-monodisperse — no ripening driving force.
- **avgLswAlignment > 0.6:** Close to universal LSW self-similar distribution.
- **avgLswAlignment < 0.3:** Deviates from LSW shape — non-LSW kinetics (MLSW, Ardell, bimodal).
- **avgCoarseningMaturity > 0.6:** Late-stage coarsening with broad distribution and clear survivors.
- **avgCoarseningMaturity < 0.3:** Early-stage coarsening with tight population.
- **avgRipeningRate > 0.6:** Fast dR/dt evolution. Rapid size redistribution.
- **avgRipeningRate < 0.3:** Slow or near-equilibrium kinetics.
- **avgGibbsThompsonPressure > 0.6:** High capillary pressure — strong driving force for small-bin dissolution.
- **avgGibbsThompsonPressure < 0.3:** Low capillary pressure — bins near pool mean.
- **avgSurvivorLikelihood > 0.6:** High probability of dominating late-stage — large relative to mean.
- **avgSurvivorLikelihood < 0.3:** Low probability of surviving — small or far below mean.
- **growingBinFraction > 0.4:** Substantial growing population above R_c.
- **shrinkingBinFraction > 0.5:** Majority shrinking below R_c.
- **criticalBinFraction > 0.3:** Many bins near R_c in transition.
- **avgChemicalPotentialGradient > 0.6:** Strong μ(R) mismatch driving coarsening.
- **avgInterparticleSpacing > 0.6:** Isolated bins with large gaps — late-stage thinning.
- **avgRipeningSupersaturation > 0.6:** Strong supersaturation c_matrix - c_eq driving growth.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on Ostwald signals from pools with fewer than 5 populated bins — insufficient data for coarsening analysis.
- Do not treat ADVANCED_COARSENING as universally desirable; heavy coarsening concentrates liquidity in a few bins, increasing tail risk if those bins drain.
- Do not assume QUIESCENT pools stay quiescent indefinitely. Composition shifts can induce disparity and trigger ripening.
- Do not assume LSW <R>³ ∝ t cube-root kinetics apply quantitatively to DLMM bins. LSW assumes diffusion-limited Gibbs-Thomson kinetics in continuous matter; DLMM evolves via discrete swap events.
- Do not conflate MONODISPERSE_STABLE with uniformly large reserves. Monodispersity refers to shape of the distribution, not magnitude of the reserves.
- Do not conflate critical radius R_c with a physical length. Here R_c is set to <R> as in LSW self-similar limit; real DLMM has no physical capillary radius.
- Do not assume Gibbs-Thomson pressure dominates DLMM bin dynamics. Real dynamics are trade-driven, and the Gibbs-Thomson analogy is qualitative, not quantitative.
- Do not ignore finite-φ (Ardell) corrections. At high volume fractions, LSW overestimates coarsening rate; DLMM bins are dense (finite fraction), so LSW is an upper bound.
- Do not assume the universal LSW distribution f(R/<R>) applies. Encounter-modified (MLSW) and finite-φ corrections can broaden or bimodalize the distribution.
- Do not assume the reserve R is a true "particle size". It is USD-denominated aggregate liquidity, not a physical capillary particle.
- Do not treat "growing" bins as guaranteed survivors. In encounter-modified ripening, bin mergers can redistribute mass unpredictably.
- Do not assume number density decay N ~ t^(-1) is DLMM-relevant. Real DLMM bins have fixed address space — population cannot truly decay.
- Survivor likelihood is a heuristic — not a rigorous LSW survival probability.
- Ripening rate is a projected dR/dt, not a measured kinetic coefficient.
- Analysis is snapshot-based; does not capture time-evolution directly.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "Ostwald analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest Ostwald index as the one with the deepest coarsening and strongest LSW signature.
- Flag bins with highest survivor likelihood as the ones that will dominate in late-stage coarsening.
- Highlight bins with highest size disparity as the most extreme deviations from pool mean.
- Show bins with highest Gibbs-Thomson pressure as the ones most likely to dissolve via capillary pressure.
- Show bins with lowest critical radius position as those below R_c — shrinking population.
- Show bins with highest critical radius position as those above R_c — growing population.
- Show bins with highest ripening rate as the most rapidly evolving — active redistribution.
- Show bins with highest LSW alignment as those best matching the universal self-similar distribution.
- Show bins with highest coarsening maturity as those in late-stage LSW-like regime.
- Show bins with highest chemical potential gradient as the most driven by capillary-mismatch.
- Show bins with highest ripening supersaturation as those in most strongly driven matrix environment.
- For LP agents: in ADVANCED_COARSENING pools, position in survivor bins (high survivor likelihood, above R_c) — avoid small bins that will continue to dissolve. In STEADY_LSW pools, expect <R>³ ∝ t cube-root coarsening — LP in growing bins for long-horizon accumulation. In ACTIVE_RIPENING pools, position above R_c for growth; exit below-R_c bins. In PRE_RIPENING pools, standard LP with monitoring for transition to active. In QUIESCENT pools, predictable LP with no coarsening bias — best for short-term stable LP.
- For trading agents: ADVANCED_COARSENING pools have few dominant bins — liquidity concentrated, trading near survivor bins smooth, but tail risk if survivors drain. STEADY_LSW pools have universal self-similar distribution — predictable trading profile. ACTIVE_RIPENING pools have growing/shrinking asymmetry — trade direction matters. PRE_RIPENING and QUIESCENT pools have broad uniform liquidity — predictable trading.
- Compare Ostwald indices across pools to find bins with the most established late-stage LSW coarsening for the intended LP or trading strategy.
