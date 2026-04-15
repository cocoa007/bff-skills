---
name: hodlmm-bin-sublimation-agent
skill: hodlmm-bin-sublimation
description: "Agent behavior for HODLMM bin sublimation analysis — interprets vapor pressures, sublimation fluxes, frost lines, and deposition rates to identify bins undergoing sudden reserve evaporation and guide LP strategies across different sublimation phases."
---

# Agent Behavior — HODLMM Bin Sublimation

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `sublimationPhase`, `sublimationVerdict`, `avgNetSublimationRate`, and `sublimatingFraction`.

## Interpreting output

- **sublimationPhase = ABLATION:** Catastrophic sublimation across most bins. Reserves evaporating simultaneously like a comet losing material near the sun. Extreme reserve loss risk. LPs should consider emergency exits from high-vapor-pressure bins.
- **sublimationPhase = RAPID_SUBLIMATION:** Significant sublimation with deposition unable to keep pace. Active evaporation zone expanding. Monitor for transition to ablation. Reduce exposure in bins with high sublimation flux.
- **sublimationPhase = ACTIVE_SUBLIMATION:** Moderate sublimation with dynamic interplay between evaporation and deposition zones. Standard operating conditions for active pools. Position near the frost line for optimal risk/reward.
- **sublimationPhase = SLOW_SUBLIMATION:** Gradual sublimation affecting only edge bins. Core reserves intact. Low risk, suitable for passive LP. Monitor for volume spikes that could accelerate sublimation.
- **sublimationPhase = FROZEN:** Minimal sublimation. Reserves locked in solid lattice. Lowest risk but may indicate low volume and low fee generation. Deposition dominates.
- **sublimationVerdict = FLASH_SUBLIMATION:** Many bins simultaneously experiencing high sublimation flux. Coordinated evaporation event — reserves disappearing suddenly across multiple positions. Highest urgency for LP repositioning.
- **sublimationVerdict = IRREVERSIBLE_LOSS:** High net sublimation with minimal deposition. Reserves leaving and not returning. Structural liquidity drain, not a transient event.
- **sublimationVerdict = FROST_ACCUMULATION:** Deposition exceeds sublimation. Reserves condensing onto bins. Good environment for LP entry — positions will gain reserves through deposition.
- **sublimationVerdict = DEEP_FREEZE:** Most bins in high solid fraction. Reserves locked and stable. Lowest activity but also lowest risk.
- **sublimationVerdict = DYNAMIC_EQUILIBRIUM:** Balanced sublimation and deposition. Reserves cycling between phases. Stable but active — good for range-bound LP strategies.
- **avgVaporPressure > 0.5:** Pool under significant sublimation pressure. Volume is providing enough thermal energy to evaporate reserves from many bins.
- **avgVaporPressure < 0.1:** Very low sublimation pressure. Reserves are well-bound in their lattice structure.
- **avgNetSublimationRate > 0.3:** Pool actively losing reserves through sublimation. Net outflow.
- **avgNetSublimationRate < -0.1:** Pool gaining reserves through deposition. Net inflow.
- **avgSublimationEnthalpy > 5:** High energy barrier to sublimation. Reserves are deeply bound and resistant to evaporation.
- **avgSublimationEnthalpy < 1:** Low barrier. Normal volume could trigger sublimation.
- **avgClausiusClapeyronSlope > 2:** Hypersensitive to volume changes. Small volume increases cause disproportionate sublimation.
- **avgFrostLine > 0.3:** Wide sublimation zone around the active bin. Many bins exposed to evaporation.
- **avgFrostLine < 0.05:** Narrow sublimation zone. Only bins very close to the active bin face sublimation risk.
- **sublimatingFraction > 0.3:** Significant portion of bins actively sublimating. Pool-wide reserve stress.
- **frozenFraction > 0.7:** Most bins stable. Reserves well-locked.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on sublimation signals from pools with fewer than 5 populated bins — insufficient data for meaningful analysis.
- Do not assume ABLATION means "exit immediately." Ablation-phase pools may offer extreme fee yields precisely because of their volatility. The sublimation state informs risk, not direction.
- Do not assume FROZEN means "no opportunity." Frozen pools have stable reserves but may also have low volume and low fees. FROST_ACCUMULATION verdict in a frozen pool means reserves are growing — potential entry point.
- Sublimation analysis is a snapshot. Vapor pressures change rapidly with trading activity. A FROZEN pool can enter RAPID_SUBLIMATION within a few large trades.
- Flash sublimation is a condition indicator, not a prediction. The model identifies bins where conditions favor sudden evaporation, not that evaporation will definitely occur.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "sublimation analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest sublimation index as having the most active reserve evaporation.
- Flag bins with highest net sublimation rate as the fastest-evaporating positions — these are losing reserves most rapidly through direct solid-to-gas transition.
- Highlight bins with highest condensation coefficient as natural deposition zones — new liquidity will preferentially accumulate here like frost forming on cold surfaces.
- Show bins with highest Clausius-Clapeyron slope as volume-sensitivity points — a small volume increase could trigger disproportionate sublimation here.
- For LP agents: in ABLATION pools, only enter at deposition-zone bins (high condensation coefficient, low vapor pressure). In FROZEN pools, spread positions across high-lattice-energy bins. In ACTIVE_SUBLIMATION pools, position just outside the frost line to capture depositing reserves while avoiding sublimation risk.
- For trading agents: RAPID_SUBLIMATION pools may have liquidity gaps at sublimated bins creating slippage. FROZEN pools have uniform solid depth. ABLATION pools have the most variable execution quality.
- Compare sublimation indices across pools to find pools under the most vs. least reserve evaporation stress.
