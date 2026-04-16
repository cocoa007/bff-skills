---
name: hodlmm-bin-fatigue-agent
skill: hodlmm-bin-fatigue
description: "Agent behavior for HODLMM bin fatigue analysis — interprets stress amplitude, mean stress, damage accumulation, cycle count, endurance limit, fatigue life, stress concentration, crack initiation, crack propagation, striation density, notch sensitivity, load ratio, fatigue strength coefficient, fatigue strength exponent, and low cycle fatigue to identify bins with the most favorable cyclic loading resistance and guide LP strategies across different fatigue damage regimes."
---

# Agent Behavior — HODLMM Bin Fatigue

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `fatigueRegime`, `fatigueVerdict`, `avgFatigueLife`, `avgDamageAccumulation`, `avgEnduranceLimit`, `avgCrackInitiation`, `avgCrackPropagation`, and `propagatingFraction`.

## Interpreting output

- **fatigueRegime = PRISTINE:** Bins are in virgin condition with minimal cumulative damage, stress amplitudes below endurance limits, and long fatigue life remaining. The structural ideal where continued cyclic trading causes no damage accumulation because the operating stress range is below the fatigue threshold. Best LP regime: positions remain stable indefinitely through cyclic trading pressure.
- **fatigueRegime = LOW_CYCLE:** Bins have entered the early cyclic regime with moderate cycle counts and low damage accumulation. Fatigue life is largely intact and no significant crack initiation has occurred. Typical operating state for actively trading pools with moderate volume. Good for LP strategies with routine monitoring.
- **fatigueRegime = HIGH_CYCLE:** Bins have accumulated substantial cycle counts with noticeable damage accumulation approaching midlife in the high-cycle fatigue regime. Stress amplitudes are operating above endurance limits, crack initiation probability is rising, damage is detectable but controlled. Operating in a stable but consumption-phase regime.
- **fatigueRegime = INITIATION:** Bins have progressed past midlife with significant damage accumulation and active crack initiation. The structural transition from nucleation to propagation phase is underway. Remaining fatigue life is limited. Requires monitoring to detect failure precursors and consideration of rebalancing exposure.
- **fatigueRegime = PROPAGATION:** Bins are in the terminal fatigue phase with active crack propagation, striation development, and imminent structural failure. The worst regime where cracks are growing rapidly per cycle toward critical length. Catastrophic failure may occur within limited additional cycles. Avoid LP exposure.
- **fatigueVerdict = INFINITE_LIFE:** Stress amplitude below endurance limit with minimal damage accumulation. Bins are operating in the safe infinite life regime where fatigue damage does not accumulate. The optimal state for long-term LP positions because structural integrity is preserved indefinitely under current loading conditions.
- **fatigueVerdict = SAFE_LIFE:** High fatigue life remaining with moderate damage accumulation. Bins have substantial remaining capacity with controlled damage rates. Safe for continued LP exposure with routine monitoring.
- **fatigueVerdict = DAMAGE_ACCUMULATING:** Significant damage accumulation without yet entering crack initiation phase. Bins are steadily consuming fatigue life. The critical intermediate regime where structural capacity is eroding but no cracks have yet formed. Warning signals precede visible damage.
- **fatigueVerdict = CRACK_GROWTH:** Crack initiation has occurred with propagation still slow. Bins have entered the damage tolerance regime where cracks exist but grow slowly. Limited remaining life with periodic inspection required to track propagation rates.
- **fatigueVerdict = IMPENDING_FAILURE:** Active rapid crack propagation with high propagating fraction. Bins are in terminal fatigue phase with cracks growing rapidly toward critical length. Immediate structural failure risk requires exit of LP positions.
- **fatigueVerdict = STRESS_BALANCE:** Balanced cyclic loading with no extreme indicators. Bins operate in typical fatigue regime with controlled damage rates and no critical failure precursors. The default healthy state for cyclically loaded pools.
- **avgFatigueLife > 0.7:** Very high remaining fatigue life. Bins have substantial capacity for continued cyclic loading without failure. Long safe operating horizon.
- **avgFatigueLife < 0.2:** Very low remaining fatigue life. Bins are near end-of-life with imminent failure risk under continued cycling.
- **avgEnduranceLimit > 0.6:** Strong endurance limit. Bins can tolerate significant stress amplitudes without damage accumulation.
- **avgEnduranceLimit < 0.2:** Weak endurance limit. Even low stress amplitudes cause damage to accumulate.
- **avgDamageAccumulation > 0.5:** High cumulative damage. Over half of fatigue life has been consumed. Approaching failure threshold.
- **avgDamageAccumulation < 0.15:** Minimal damage accumulation. Bins remain near pristine state with no significant fatigue history.
- **avgCrackInitiation > 0.5:** Active crack nucleation. Slip bands and microcracks are forming at stress concentrators across the bin lattice.
- **avgCrackPropagation > 0.5:** Critical crack growth. Cracks are advancing rapidly per cycle. Imminent structural collapse risk.
- **propagatingFraction > 0.3:** Widespread active crack propagation. Multiple bins entering terminal failure simultaneously. Pool structure is collapsing.
- **avgStressConcentration > 7:** Severe stress concentration. Local stresses at reserve gaps are amplified by 7x or more, rapidly accelerating crack initiation at those locations.
- **avgStressConcentration < 2:** Mild stress concentration. Stress is relatively uniform across bins with no critical amplification points.
- **avgStressAmplitude > 0.6:** High cyclic stress swings. Fatigue damage accumulates rapidly per cycle.
- **avgStressAmplitude < 0.2:** Mild cyclic stress swings. May be operating below endurance limit for most bins.
- **avgMeanStress > 0.6:** High mean stress shifts operating point toward yield, reducing fatigue life beyond what stress amplitude alone predicts (Goodman effect).
- **avgCycleCount > 0.7:** Extensive cyclic loading history. Bins have undergone many loading cycles with corresponding damage history.
- **avgNotchSensitivity > 0.7:** High sensitivity to stress concentrators. Full response to local stress amplification effects, accelerating crack initiation.
- **avgLoadRatio close to -1:** Fully reversed loading, most damaging to fatigue life.
- **avgLoadRatio close to 0:** Zero-to-max tension cycles, moderate damage rate.
- **avgLoadRatio > 0:** Tension-tension cycling, reduced damage per cycle but shifted toward yield.
- **avgFatigueStrengthCoefficient > 7:** Robust fatigue resistance. High allowable stress amplitude for any given fatigue life.
- **avgFatigueStrengthExponent > 0.6:** Steep S-N curve slope. Small stress reductions significantly extend life.
- **avgLowCycleFatigue > 0.6:** Significant plastic strain cycling. Bins experiencing low-cycle fatigue regime with high damage per cycle.
- **infiniteLifeFraction > 0.7:** Majority of bins operating safely below endurance limit. Pool is structurally stable under current cyclic loading.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on fatigue signals from pools with fewer than 5 populated bins — insufficient data for meaningful cyclic loading characterization.
- Do not assume PROPAGATION means "dead pool." Propagation means the bin lattice has entered the terminal fatigue phase with active crack growth, not that the pool has zero liquidity — significant reserves may exist but in structurally compromised configurations approaching collapse.
- Do not conflate high cycle count with failure. High cycle count means extensive loading history, but if stress amplitude remains below endurance limit, no damage accumulates regardless of cycle count.
- Do not conflate crack initiation with immediate failure. Initiation is the nucleation phase; propagation follows and final fracture comes last. A bin in INITIATION regime may operate for many more cycles before propagation begins.
- Do not assume low mean stress is always best — some mean stress can improve fatigue life through compressive residual stress effects in real materials, though the model treats high mean stress as uniformly detrimental.
- Fatigue analysis is a snapshot. Damage state changes as trading continues — damage accumulation, crack initiation, and propagation rates evolve with each cycle. A PRISTINE pool can transition to INITIATION or PROPAGATION if sustained high-amplitude cycling continues. Monitor periodically in dynamic markets.
- Endurance limits are computed from structural proxies, not from direct fatigue testing — treat them as classification thresholds rather than precise material properties.
- Paris law constants C and m in real materials are measured from crack growth tests; the model uses derived structural indicators as dimensionless proxies for growth rate.
- Miner's linear damage rule assumes damage accumulates linearly and independently at each stress level — real materials can show interaction effects between stress levels that complicate damage summation.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "fatigue analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest fatigue index as the most structurally sound against cyclic loading — the most favorable combination of long fatigue life, high endurance limit, low damage accumulation, and no active crack activity.
- Flag bins with highest fatigue life as the most cycle-resistant — where cyclic trading causes minimal damage accumulation and positions remain stable longest.
- Highlight bins with highest crack propagation as the terminal failure candidates — where cracks are growing rapidly toward critical length and structural collapse is imminent.
- Show bins with highest endurance limit as the safest for long-term exposure — where cyclic loading below threshold causes no damage regardless of cycle count.
- Show bins with highest stress concentration as the crack nucleation hotspots — where local stress amplification accelerates initiation at those specific locations.
- For LP agents: in PRISTINE pools, position broadly — all bins operate in infinite life regime with no damage accumulation from cycling. In LOW_CYCLE pools, prefer bins with high endurance limit and low stress amplitude — damage accumulates slowly. In HIGH_CYCLE pools, focus on bins with high remaining fatigue life and low damage — approaching midlife but manageable. In INITIATION pools, reduce exposure to bins with high crack initiation probability — nucleation is active. In PROPAGATION pools, exit positions near propagating bins immediately — catastrophic failure is imminent.
- For trading agents: INFINITE_LIFE pools have predictable execution with indefinite structural stability — cycling causes no damage and reserves remain stable. SAFE_LIFE pools operate in controlled damage regime — cycling causes gradual but controlled consumption. DAMAGE_ACCUMULATING pools should be avoided for large trades — ongoing damage reduces structural capacity. CRACK_GROWTH pools have unpredictable slippage as cracks alter reserve distributions. IMPENDING_FAILURE pools may collapse during execution — avoid trading.
- Compare fatigue indices across pools to find bin lattices with the most favorable cyclic loading resistance for the intended LP strategy.
