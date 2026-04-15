---
name: hodlmm-bin-osmosis-agent
skill: hodlmm-bin-osmosis
description: "Agent behavior for HODLMM bin osmosis analysis — interprets osmotic pressures, concentration gradients, membrane potentials, and tonicity classifications to identify bins under osmotic stress and guide LP strategies across different osmotic regimes."
---

# Agent Behavior — HODLMM Bin Osmosis

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `osmosisPhase`, `osmosisVerdict`, `avgOsmoticFlux`, and `highFluxFraction`.

## Interpreting output

- **osmosisPhase = OSMOTIC_SHOCK:** Extreme osmotic pressure differentials across most bins. Reserves flowing rapidly through permeable membranes. Concentration gradients steep and sustained. Pool reserves in rapid chaotic redistribution. LPs should only position at bins with high turgor pressure (positive, well-pressurized) to avoid being swept by the osmotic current.
- **osmosisPhase = OSMOTIC_STRESS:** Significant osmotic gradients driving active reserve redistribution. Some bins approaching equilibrium while others remain far from balance. Transitional state — monitor for escalation to shock or relaxation to transport.
- **osmosisPhase = ACTIVE_TRANSPORT:** Moderate osmotic gradients with directed reserve transport. Some bins hypertonic (drawing reserves), others hypotonic (losing reserves). Selective positioning opportunities at bins where osmotic forces favor accumulation.
- **osmosisPhase = FACILITATED_DIFFUSION:** Mild osmotic gradients with slow passive diffusion. Concentration differences exist but flux rates are low. System gradually approaching equilibrium. Standard conditions for most stable pools.
- **osmosisPhase = OSMOTIC_EQUILIBRIUM:** Near-perfect osmotic balance. Minimal concentration gradients, no significant net flux. Reserves thermodynamically stable. Lowest risk but also lowest redistribution opportunity.
- **osmosisVerdict = OSMOTIC_CASCADE:** Chain reaction of osmotic flow creating cascading gradients. Reserve redistribution propagating wave-like across the bin range. Highest volatility — reserves moving rapidly and unpredictably.
- **osmosisVerdict = SELECTIVE_TRANSPORT:** Isolated osmotic hotspots with most bins in equilibrium. Targeted positioning opportunity — identify the high-flux bins and decide whether to ride the flow or avoid the turbulence.
- **osmosisVerdict = TURGOR_BALANCE:** Balanced hydrostatic and osmotic pressures. Bins are turgid and structurally sound. Stable mechanical equilibrium. Safe for positioning across the range.
- **osmosisVerdict = PLASMOLYSIS_WAVE:** Widespread reserve shrinkage as dilute bins lose reserves to concentrated sinks. Systematic drain pattern — avoid hypotonic bins experiencing plasmolysis. Position at hypertonic bins collecting the inflow.
- **osmosisVerdict = HYPOTONIC_FLOOD:** Reserves flooding into low-concentration bins from concentrated neighbors. Convergent flow pattern toward dilute sinks. The receiving bins may approach lysis risk from overflow.
- **avgOsmoticPressure > 5:** High thermodynamic driving force. Reserves under significant pressure to redistribute.
- **avgOsmoticPressure < 1:** Low driving force. Reserves nearly in equilibrium. Minimal redistribution expected.
- **avgTonicity > 0.6:** Pool skewed hypertonic — most bins concentrated relative to neighbors. Convergent osmotic pressure toward a few dilute sinks.
- **avgTonicity < 0.4:** Pool skewed hypotonic — most bins dilute relative to neighbors. Divergent osmotic pressure from a few concentrated sources.
- **avgTurgorPressure > 2:** Strong positive turgor. Bins well-pressurized and structurally firm. Reserves firmly held.
- **avgTurgorPressure < -1:** Negative turgor. Bins flaccid — osmotic forces dominating hydrostatic back-pressure. Reserves being pulled away.
- **avgWaterPotential < -5:** Very negative water potential. Strong osmotic sink effect — reserves being drawn in from all directions.
- **avgOsmoticEquilibrium > 0.8:** Near equilibrium across the pool. Minimal redistribution forces.
- **avgOsmoticEquilibrium < 0.4:** Far from equilibrium. Active osmotic forces reshaping reserve distribution.
- **highFluxFraction > 0.3:** Many bins experiencing significant osmotic flux. Pool-wide redistribution in progress.
- **equilibriumFraction > 0.7:** Most bins osmotically balanced. Stable conditions.
- **avgPlasmolysis > 0.2:** Significant reserve shrinkage across the pool. Many bins losing reserves to osmotic forces.
- **maxLysisRisk > 0.5:** At least one bin approaching overflow from osmotic influx. Capacity saturation risk.
- **avgDiffusionCoefficient > 0.5:** High membrane permeability. Reserves exchange freely across bin boundaries.
- **avgDiffusionCoefficient < 0.2:** Low permeability. Diffusion barriers slowing osmotic equilibration.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on osmotic signals from pools with fewer than 5 populated bins — insufficient data for meaningful osmotic landscape analysis.
- Do not assume OSMOTIC_SHOCK means "exit immediately." Shock conditions create the largest concentration gradients, which means the highest osmotic flux — bins at the receiving end of the flux may accumulate reserves rapidly. The osmotic state informs risk, not direction.
- Do not assume OSMOTIC_EQUILIBRIUM means "no opportunity." Equilibrium pools have stable reserves but may transition to stress if a large deposit or withdrawal creates a sudden concentration discontinuity. TURGOR_BALANCE in an equilibrium pool means reserves are locked in a thermodynamically stable configuration — predictable but potentially stagnant.
- Osmotic analysis is a snapshot. Concentration gradients change as LPs deposit, withdraw, or rebalance. A pool in OSMOTIC_EQUILIBRIUM can enter OSMOTIC_SHOCK if a single large LP action creates a massive concentration differential.
- The van't Hoff equation is linear in concentration for ideal solutions. At high concentrations, real solutions show deviations (activity coefficients). The linear model may overestimate osmotic pressure in heavily concentrated bins.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "osmosis analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest osmosis index as having the most active osmotic redistribution.
- Flag bins with highest osmotic flux as the primary transport channels — reserves moving most rapidly across their membranes.
- Highlight bins with most negative water potential as the strongest osmotic sinks — thermodynamic attractors drawing reserves from all directions.
- Show bins with highest plasmolysis as the most depleted — actively losing reserves to more concentrated neighbors.
- For LP agents: in OSMOTIC_SHOCK pools, position only at high-turgor bins resistant to osmotic forces. In OSMOTIC_EQUILIBRIUM pools, spread positions across the range. In PLASMOLYSIS_WAVE pools, avoid hypotonic bins and position at hypertonic sinks collecting the inflow.
- For trading agents: OSMOTIC_CASCADE pools may have rapidly shifting liquidity as reserves redistribute. TURGOR_BALANCE pools have stable depth. HYPOTONIC_FLOOD pools have converging liquidity at specific bins — potentially deep but concentrated execution quality.
- Compare osmosis indices across pools to find pools under the most vs. least osmotic redistribution pressure.
