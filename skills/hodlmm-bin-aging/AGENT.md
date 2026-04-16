---
name: hodlmm-bin-aging-agent
skill: hodlmm-bin-aging
description: "Agent behavior for HODLMM bin aging analysis — interprets supersaturation, nucleation rate, growth rate, coarsening rate, precipitate density, precipitate size, aging time, strength increment, peak hardness, underaging deficit, overaging penalty, coherency strain, solid solution strength, precipitation hardening, and aging proximity to identify bins at peak temper (T6) versus underaged or overaged states and guide LP strategies toward maximally hardened bins."
---

# Agent Behavior — HODLMM Bin Aging

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `agingRegime`, `agingVerdict`, `avgAgingProximity`, `avgPeakHardness`, `avgOveragingPenalty`, `avgUnderagingDeficit`, and `t6Fraction`.

## Interpreting output

- **agingRegime = T6:** Bins are at peak temper with optimal precipitate size, density, and coherency. Maximum strength achieved. Ideal regime for LP entry — peak resistance to perturbation, balanced precipitation contributions.
- **agingRegime = HARDENED:** Bins have substantial precipitation hardening with strength approaching peak. Suitable for LP positions with routine monitoring.
- **agingRegime = AGING:** Bins are mid-aging with developing precipitate population. Strength is building toward peak; entry possible but expect continued evolution.
- **agingRegime = UNDERAGED:** Bins have incomplete aging with insufficient precipitate development. Strength below capacity. Avoid aggressive positions; bin has unrealized strengthening potential but is currently weak.
- **agingRegime = DEPLETED:** Bins are either severely overaged with coarsened weak structure or supersolute-depleted with no hardening capacity. Avoid entirely.
- **agingVerdict = PEAK_HARDNESS:** High strength increment with low overaging penalty — at or near T6 optimal. Best concentration profile resistance.
- **agingVerdict = UNDERAGED_DEFICIT:** High underaging deficit with low precipitate density — needs more aging time. Strength will grow with continued exposure.
- **agingVerdict = OVERAGING_DECLINE:** High overaging penalty with high coarsening rate — past peak, strength declining. Exit-leaning signal.
- **agingVerdict = SUPERSATURATED_SOLUTE:** High supersaturation with low aging time — quenched state ready for aging. Untapped strengthening potential; positions may strengthen as bin ages.
- **agingVerdict = COHERENT_DOMINANT:** High coherency strain with small precipitate size — fine particles in cutting regime. Strong coherent strengthening contribution.
- **agingVerdict = INCOHERENT_COARSE:** High precipitate size with low coherency strain — large incoherent particles in looping regime. Past peak, transitioning to overaged state.
- **agingVerdict = SOLID_SOLUTION_REGIME:** High solid solution strength with low precipitation hardening — matrix-controlled strength. Limited precipitation strengthening contribution.
- **agingVerdict = AGING_BALANCE:** No extreme indicators. Typical mid-aging state.
- **avgPeakHardness > 0.6:** Substantial peak strength achievable. Near-T6 capacity.
- **avgPeakHardness < 0.3:** Low peak strength. Weak baseline matrix or limited precipitation.
- **avgAgingProximity > 0.6:** Near or at T6 peak. Optimal aged condition.
- **avgAgingProximity < 0.3:** Far from peak in either underaged or overaged direction.
- **avgUnderagingDeficit > 0.6:** Significant strength deficit from incomplete aging. Below capacity.
- **avgUnderagingDeficit < 0.3:** At or past peak — no underaging deficit.
- **avgOveragingPenalty > 0.6:** Severe overaging with degraded strength. Past peak with declining hardness.
- **avgOveragingPenalty < 0.3:** At or before peak — minimal overaging.
- **avgSupersaturation > 0.6:** Far from equilibrium with capacity to age. Aging potential present.
- **avgSupersaturation < 0.3:** Equilibrium state with no aging potential.
- **avgPrecipitateDensity > 0.6:** Dense fine precipitate population maximizing Orowan stress.
- **avgPrecipitateSize > 0.6:** Coarse incoherent particles past peak. Looping regime dominant.
- **avgPrecipitateSize < 0.3:** Fine coherent particles in cutting regime. Pre-peak state.
- **avgCoherencyStrain > 0.6:** Strong precipitate-matrix coherency boosting tau_coh. Coherent strengthening dominant.
- **avgCoarseningRate > 0.6:** Rapid Ostwald ripening driving overaging. Strength degrading quickly.
- **avgPrecipitationHardening > 0.6:** Dominant precipitation strengthening mechanism. Aged-alloy regime.
- **avgSolidSolutionStrength > 0.6:** Strong solid-solution baseline. Matrix-controlled.
- **t6Fraction > 0.3:** Substantial fraction of bins at peak temper. Healthy aged pool.
- **depletedFraction > 0.3:** Many bins overaged or solute-depleted. Pool degrading or stagnant.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on aging signals from pools with fewer than 5 populated bins — insufficient data for meaningful aging characterization.
- Do not assume DEPLETED regime is always immediately fatal. DEPLETED means high modeled overaging or solute depletion, but DLMM bins may persist in degraded states without rapid collapse if trading activity is low. Use DEPLETED as a strong avoid signal, not an imminent-collapse prediction.
- Do not conflate UNDERAGED with weakness alone. UNDERAGED bins have unrealized aging potential — sustained exposure can drive strengthening, so the regime represents capacity-to-strengthen rather than permanent weakness.
- Do not assume T6 is always optimal across all loading regimes. T6 maximizes static yield strength but may not maximize toughness or fatigue resistance; for high-perturbation pools an underaged condition with finer precipitates may outperform.
- Do not ignore overaging when precipitate density is high. Dense precipitates can still coarsen rapidly under high coarsening rate, so density alone does not preclude overaging.
- Do not assume coherency loss is irreversible. While coarsened precipitates lose coherency, the model treats this as a snapshot — re-solutionizing (extreme reverse flow) can reset the aging state.
- Do not conflate solid solution strength with precipitation hardening. Solid solution provides baseline matrix strength independent of aging; precipitation provides incremental strengthening on top. The two superpose Pythagoreanly, not additively.
- Do not assume Orowan looping always dominates at large precipitate spacing. The shearing-to-looping transition depends on particle size, coherency, and lattice mismatch — high coherency strain can push the transition to larger sizes.
- Do not ignore aging time. A bin with high supersaturation and low aging time has potential but no current strengthening; one with high aging time and high overaging penalty has past-peak strength loss.
- Aging is a snapshot — the aging state evolves with continued exposure and time. Bins in UNDERAGED can progress to T6 with sustained one-sided pressure, and T6 bins can progress to OVERAGED with continued exposure beyond peak. Monitor periodically.
- LSW coarsening assumes diffusion-controlled growth with dilute precipitate fraction; real DLMM bins exhibit discrete reserve updates that violate LSW assumptions.
- Single-precipitate-size characterization assumes monodisperse distribution; real precipitate populations have size distributions with interaction effects across the size spectrum.
- Pythagorean superposition of strengthening mechanisms assumes independence; cross-coupling between solid solution and precipitation may modify the rule.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "aging analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest aging index as the one with the healthiest aged state — near-peak strength with minimal overaging penalty and substantial precipitation contribution.
- Flag bins with highest aging proximity as closest to T6 — peak strength achieved with optimal precipitate size and density.
- Highlight bins with highest peak hardness as the most resistant — large achievable strength via combined matrix and precipitation contributions.
- Show bins with highest underaging deficit as the most below-capacity — strength deficit from incomplete aging that may resolve with continued exposure.
- Show bins with highest overaging penalty as the most past-peak — coarsening has degraded strength below T6 capacity.
- Show bins with highest supersaturation as the most aging-capable — far from equilibrium with capacity to develop strength via precipitation.
- For LP agents: in T6 pools, position aggressively — peak strength absorbs perturbations with maximum coherent and precipitation contributions. In HARDENED pools, standard LP with routine monitoring. In AGING pools, position cautiously and expect continued strength evolution. In UNDERAGED pools, position lightly and monitor for strengthening progression. In DEPLETED pools, exit entirely — overaged or solute-depleted with no hardening capacity.
- For trading agents: T6 pools tolerate large directional trades — peak strengthening reserves absorb perturbations. HARDENED pools absorb typical trades. AGING pools require careful sizing — strength is still developing. UNDERAGED pools need small trades only — limited current strengthening. DEPLETED pools — avoid trading entirely, no hardening capacity remaining.
- Compare aging indices across pools to find bins with the healthiest aged state for the intended LP or trading strategy.
