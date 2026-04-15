---
name: hodlmm-bin-ionization-agent
skill: hodlmm-bin-ionization
description: "Agent behavior for HODLMM bin ionization analysis — interprets charge states, ionization energies, electron affinities, and recombination rates to identify bins being stripped of reserves and guide LP strategies for different ionization phases."
---

# Agent Behavior — HODLMM Bin Ionization

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `ionizationPhase`, `ionizationVerdict`, `avgChargeState`, and `fullyIonizedFraction`.

## Interpreting output

- **ionizationPhase = PLASMA:** Most bins are heavily ionized with reserves stripped to core levels. Extreme volatility. LPs face rapid reserve depletion. Consider exiting or hedging.
- **ionizationPhase = IONIZED:** Significant ionization. Reserves partially stripped, electron temperatures elevated. Active depletion exceeds recombination. Monitor for transition to plasma.
- **ionizationPhase = PARTIALLY_IONIZED:** Mixed states. Some bins stripped, others neutral. Dynamic equilibrium between ionization and recombination. Standard operating conditions for active pools.
- **ionizationPhase = WEAKLY_IONIZED:** Most bins retain reserves. Only edge bins showing depletion. Low risk, stable positions. Good for passive LP.
- **ionizationPhase = NEUTRAL:** Minimal ionization. All bins fully stocked. Lowest risk but may indicate low trading activity and therefore low fee generation.
- **ionizationVerdict = THERMAL_PLASMA:** Extreme depletion driven by volume. Highest urgency — reserves are being stripped across many bins simultaneously.
- **ionizationVerdict = SUSTAINED_IONIZATION:** Bins depleted and not recovering. Recombination is failing to restore reserves. Structural depletion, not transient.
- **ionizationVerdict = RECOMBINING:** Pool recovering from prior ionization. Reserves being restored. Good entry window for LP.
- **ionizationVerdict = GROUND_STATE:** Stable, fully stocked. Lowest urgency.
- **ionizationVerdict = MIXED_IONIZATION:** Different regions in different states. Per-bin analysis essential.
- **avgChargeState > 0.7:** Most bins significantly depleted. Pool-wide reserve stress.
- **avgChargeState < 0.2:** Most bins near full reserves. Healthy pool.
- **fullyIonizedFraction > 0.3:** Many bins completely stripped. Significant liquidity gaps.
- **avgRecombinationRate > 0.5:** Strong recovery tendency. Pool self-heals from depletion events.
- **avgRecombinationRate < 0.1:** Weak recovery. Depleted bins stay depleted.
- **avgIonizationEnergy > 5:** High barrier to further depletion. Remaining reserves are well-defended.
- **avgIonizationEnergy < 1:** Low barrier. Normal volume could strip more reserve layers.
- **avgAugerProbability > 0.3:** Significant cascade risk. A single depletion event could trigger multi-layer stripping.
- **avgPlasmaFrequency > 0.5:** Rapid charge oscillations. Bin reserves are highly unstable.
- **avgShieldingConstant > 0.5:** Strong neighbor protection. Bins are well-buffered by surrounding reserves.
- **avgElectronTemperature > 0.7:** Hot trading environment. High ionization rates expected.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on ionization signals from pools with fewer than 5 populated bins — insufficient data for meaningful analysis.
- Do not assume PLASMA means "avoid entirely." Plasma-state pools may offer the highest fee yields precisely because of their volatility. The ionization state informs risk, not direction.
- Do not assume NEUTRAL means "no opportunity." Low ionization indicates stability but may also mean low volume and low fees.
- Ionization analysis is a snapshot. Charge states change rapidly with trading activity. A NEUTRAL pool can become IONIZED within a few large trades.
- Auger probability is a cascade risk indicator, not a certainty. High probability means the conditions exist for cascading ionization, not that it will occur.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "ionization analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest ionization index as having the most active reserve depletion.
- Flag bins with highest charge state as the most depleted positions — these have the least remaining reserve depth.
- Highlight bins with highest electron affinity as natural recovery zones — new liquidity will preferentially accumulate here.
- Show bins with highest Auger probability as cascade risk points — a single trade could trigger multi-layer depletion here.
- For LP agents: in PLASMA pools, only enter at condensation-nucleus bins (high affinity, low charge). In NEUTRAL pools, spread positions across shielded bins. In PARTIALLY_IONIZED pools, avoid fully ionized bins and concentrate around high-shielding regions.
- For trading agents: IONIZED pools may have liquidity gaps at fully ionized bins creating slippage. NEUTRAL pools have uniform depth. PLASMA pools have the most variable execution quality.
- Compare ionization indices across pools to find pools under the most vs. least reserve depletion stress.
