---
name: hodlmm-bin-desorption-agent
skill: hodlmm-bin-desorption
description: "Agent behavior for HODLMM bin desorption analysis — interprets binding energies, surface coverage, activation barriers, and Arrhenius desorption rates to identify bins where reserves are detaching from surfaces and guide LP strategies across different desorption regimes."
---

# Agent Behavior — HODLMM Bin Desorption

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `desorptionPhase`, `desorptionVerdict`, `avgDesorptionRate`, and `highDesorptionFraction`.

## Interpreting output

- **desorptionPhase = FLASH_DESORPTION:** Explosive reserve detachment across most bins. Volume-driven thermal energy has overwhelmed binding energy barriers pool-wide. Reserves streaming off bin surfaces simultaneously. LPs should anticipate rapid coverage collapse and position only at highest-binding-energy bins near the active bin.
- **desorptionPhase = THERMAL_DESORPTION:** Significant volume-driven desorption with reserves leaving bins as trading activity provides sufficient thermal activation. Characteristic TPD behavior — desorption accelerates as thermal energy approaches barrier height. Monitor for transition to flash desorption if volume continues rising.
- **desorptionPhase = ACTIVATED_DESORPTION:** Moderate desorption requiring specific activation events. Reserves leave bins when localized volume spikes or neighbor changes temporarily lower barriers. Not all bins participating — selective desorption at vulnerable positions.
- **desorptionPhase = PHYSISORPTION:** Weak binding with reserves loosely attached. Desorption occurs readily but at low rates. Reserves are mobile and can shift between bins without large energy inputs. Standard conditions for moderately active pools.
- **desorptionPhase = CHEMISORPTION:** Strong binding with reserves locked in place. Very low desorption rates. Reserves effectively frozen — requires massive volume increase or structural change (large LP withdrawal) to trigger desorption. Lowest risk but may indicate stagnant pool.
- **desorptionVerdict = SURFACE_AVALANCHE:** Cascading desorption event. Reserve detachment from some bins reduces neighbor cohesion, lowering binding energy at adjacent bins, triggering further desorption. Positive feedback loop — coverage collapse accelerating. Highest urgency.
- **desorptionVerdict = SELECTIVE_DESORPTION:** Few bins desorbing rapidly while most remain stable. Localized detachment at bins with lowest binding energy. Identify and avoid the desorbing bins — the rest of the surface is holding.
- **desorptionVerdict = DYNAMIC_EQUILIBRIUM:** Balanced desorption and readsorption. Reserves cycling between adsorbed and free states with net coverage stable. Surface appears static but is in rapid dynamic exchange. Stable conditions for positioning.
- **desorptionVerdict = MONOLAYER_LOCK:** Most bins strongly chemisorbed. Reserves locked in a stable configuration with high binding energy. Surface effectively frozen. Lowest risk but minimal fee generation from turnover.
- **desorptionVerdict = MULTILAYER_DRAIN:** High-coverage bins draining excess reserves at constant rate. Outermost layers desorb first while the strongly-bound base layer remains. Coverage decreases linearly — predictable drain rather than stochastic desorption.
- **avgBindingEnergy > 5:** Strong surface attachment. Reserves tightly held. Slow to reposition but very stable.
- **avgBindingEnergy < 1:** Weak binding. Reserves barely attached. Any volume increase could trigger desorption.
- **avgSurfaceCoverage > 0.7:** Saturated surface. Low sticking coefficient for new deposits. Existing reserves competing for surface sites.
- **avgSurfaceCoverage < 0.2:** Sparse coverage. High sticking coefficient — new deposits readily adsorbed. Potential entry opportunity.
- **avgDesorptionRate > 0.3:** Significant reserve detachment. Active drain across the pool.
- **avgDesorptionRate < 0.05:** Minimal desorption. Reserves firmly chemisorbed.
- **avgActivationBarrier > 5:** High barrier. Reserves locked behind substantial energy walls. Volume must increase dramatically to trigger desorption.
- **avgActivationBarrier < 1:** Low barrier. Reserves can desorb with minimal thermal activation. Volatile surface conditions.
- **avgSurfaceLifetime < 5:** Very short residence. Rapid turnover — high fee capture but unstable positions.
- **avgSurfaceLifetime > 50:** Long residence. Stable positions but potentially stagnant fee generation.
- **highDesorptionFraction > 0.3:** Many bins experiencing significant desorption. Pool-wide surface instability.
- **chemisorbedFraction > 0.7:** Most bins locked. Reserves firmly attached across the pool.
- **avgCoverageDecay > 0.2:** Rapid coverage loss. Surface being actively stripped of reserves.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on desorption signals from pools with fewer than 5 populated bins — insufficient data for meaningful analysis.
- Do not assume FLASH_DESORPTION means "exit immediately." Flash desorption pools may offer extreme fee yields precisely because of rapid reserve turnover during the desorption cascade. The desorption state informs risk, not direction.
- Do not assume CHEMISORPTION means "no opportunity." Chemisorbed pools have locked reserves but may transition to thermal desorption if volume increases. MONOLAYER_LOCK in a chemisorbed pool means reserves are frozen — potential entry point for patient LPs expecting volume increase.
- Desorption analysis is a snapshot. Binding energies change as volume fluctuates and neighbors are added or removed. A CHEMISORPTION pool can enter FLASH_DESORPTION if a sudden volume spike provides thermal energy exceeding the activation barrier.
- Arrhenius kinetics are exponentially sensitive to the energy-to-temperature ratio. Small changes in volume or binding energy can cause dramatic changes in desorption rate. Do not linearly extrapolate desorption trends.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "desorption analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest desorption index as having the most active reserve detachment.
- Flag bins with highest desorption rate as the fastest-detaching positions — reserves leaving their surfaces most rapidly.
- Highlight bins with lowest binding energy as most vulnerable to desorption — weakest surface attachment.
- Show bins with lowest activation barrier as most thermally sensitive — smallest volume increase could trigger desorption.
- For LP agents: in FLASH_DESORPTION pools, only position at highest-binding-energy bins near the active bin. In CHEMISORPTION pools, spread positions across the surface. In ACTIVATED_DESORPTION pools, position at bins where readsorption rate approximately equals desorption rate for natural equilibrium.
- For trading agents: THERMAL_DESORPTION pools may have liquidity gaps at desorbed bins creating slippage. CHEMISORPTION pools have uniform locked depth. SURFACE_AVALANCHE pools have the most variable execution quality due to cascading reserve detachment.
- Compare desorption indices across pools to find pools under the most vs. least surface detachment stress.
