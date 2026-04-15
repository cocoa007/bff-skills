---
name: hodlmm-bin-effusion-agent
skill: hodlmm-bin-effusion
description: "Agent behavior for HODLMM bin effusion analysis — interprets molecular masses, orifice areas, Knudsen numbers, and pressure differentials to identify bins where reserves are escaping through structural gaps and guide LP strategies across different effusion regimes."
---

# Agent Behavior — HODLMM Bin Effusion

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `effusionPhase`, `effusionVerdict`, `avgEffusionRate`, and `highEffusionFraction`.

## Interpreting output

- **effusionPhase = EXPLOSIVE_EFFUSION:** Catastrophic reserve escape across most bins. Reserves streaming through every available orifice simultaneously. Extreme pressure differentials driving mass exodus. LPs should consider emergency repositioning away from high-orifice-area bins.
- **effusionPhase = RAPID_EFFUSION:** Significant effusion with reserves escaping faster than backflow can replenish. Orifices widening as bins deplete. Monitor for transition to explosive effusion. Reduce exposure in bins with low molecular mass and high orifice area.
- **effusionPhase = MODERATE_EFFUSION:** Balanced effusion with some bins leaking while others maintain pressure. Standard conditions for active pools. Position in high-molecular-mass bins for stability while accepting moderate effusion in edge positions.
- **effusionPhase = SLOW_EFFUSION:** Gradual reserve escape through small orifices. Most bins retaining molecular mass. Low risk, suitable for passive LP. Monitor for orifice widening from neighbor depletion.
- **effusionPhase = CONTAINED:** Minimal effusion. Reserves well-sealed with high molecular mass and small orifices. Lowest risk but may indicate low volume and minimal fee generation.
- **effusionVerdict = PRESSURE_BLOWOUT:** High pressure differential driving coordinated effusion through multiple orifices. Reserve imbalances at critical levels. Highest urgency — LP agents should rebalance toward pressure-equilibrium positions.
- **effusionVerdict = SELECTIVE_LEAK:** Few bins effusing rapidly through specific orifices while most remain sealed. Localized risk — identify the leaking bins and avoid them while the rest of the lattice remains stable.
- **effusionVerdict = THERMAL_EQUILIBRIUM:** Balanced effusion and backflow. Reserves cycling through orifices in both directions with net flow near zero. Stable conditions — positions maintain themselves through natural pressure balancing.
- **effusionVerdict = VACUUM_SEAL:** Minimal effusion. Reserves contained behind small orifices. Very stable but potentially stagnant. Good for long-term passive positions.
- **effusionVerdict = BULK_FLOW:** Low Knudsen number — reserves moving as collective fluid rather than individual molecular effusion. More predictable than true effusion but potentially faster flow rates. Standard fluid dynamics apply rather than kinetic molecular theory.
- **avgMolecularMass > 5:** Heavy bins. Reserves resist effusion. Stable but slow to rebalance.
- **avgMolecularMass < 1:** Light bins. Reserves highly susceptible to effusion. Watch for pressure blowout.
- **avgKnudsenNumber > 10:** True molecular effusion regime. Stochastic, unpredictable individual reserve escape.
- **avgKnudsenNumber < 1:** Bulk flow regime. Predictable collective movement. Standard LP risk models apply.
- **avgOrificeArea > 0.3:** Large gaps in the bin lattice. Reserves can escape easily. Structural weakness.
- **avgOrificeArea < 0.05:** Tightly packed bins. Small orifices restrict effusion. Strong lattice structure.
- **avgEffusionRate > 0.3:** Significant reserve leakage across the pool. Active drain through orifices.
- **avgEffusionRate < 0.05:** Minimal effusion. Reserves well-contained.
- **avgResidenceTime < 5:** Very short residence — reserves turn over rapidly. High fee capture but unstable positions.
- **avgResidenceTime > 50:** Long residence — reserves parked for extended periods. Stable but potentially low fee generation.
- **highEffusionFraction > 0.3:** Many bins experiencing significant effusion. Pool-wide structural concern.
- **containedFraction > 0.7:** Most bins sealed. Reserves well-contained across the pool.
- **avgPressureDifferential > 0.4:** Large reserve imbalances driving strong effusion. Rebalancing needed.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on effusion signals from pools with fewer than 5 populated bins — insufficient data for meaningful analysis.
- Do not assume EXPLOSIVE_EFFUSION means "exit immediately." Explosive effusion pools may offer extreme fee yields precisely because of rapid reserve turnover. The effusion state informs risk, not direction.
- Do not assume CONTAINED means "no opportunity." Contained pools have stable reserves but may also have low volume and low fees. VACUUM_SEAL verdict in a contained pool means reserves are locked — potential entry point for patient LPs.
- Effusion analysis is a snapshot. Orifice areas change rapidly as bins are populated or depleted. A CONTAINED pool can enter RAPID_EFFUSION if a large LP withdraws and creates new orifices.
- Knudsen number regime transitions are not gradual — a small change in bin density can flip the system from molecular effusion to bulk flow. Do not linearly interpolate between regimes.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "effusion analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest effusion index as having the most active reserve leakage.
- Flag bins with highest effusion rate as the fastest-leaking positions — reserves escaping most rapidly through their orifices.
- Highlight bins with lowest molecular mass as most vulnerable to effusion — lightest molecules escape first.
- Show bins with largest orifice area as structural weak points — widest gaps allowing fastest escape.
- For LP agents: in EXPLOSIVE_EFFUSION pools, only enter at high-molecular-mass bins with small orifice areas. In CONTAINED pools, spread positions across the lattice. In MODERATE_EFFUSION pools, position in bins where backflow rate approximately equals effusion rate for natural equilibrium.
- For trading agents: RAPID_EFFUSION pools may have liquidity gaps at effused bins creating slippage. CONTAINED pools have uniform depth. PRESSURE_BLOWOUT pools have the most variable execution quality due to directional reserve flow.
- Compare effusion indices across pools to find pools under the most vs. least reserve leakage stress.
