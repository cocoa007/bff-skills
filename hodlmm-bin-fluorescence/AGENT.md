---
name: hodlmm-bin-fluorescence-agent
skill: hodlmm-bin-fluorescence
description: "Agent behavior for HODLMM bin fluorescence analysis — interprets quantum yields, emission intensities, Stokes shifts, quenching factors, and Forster radii to identify bins with the highest energy conversion efficiency and guide LP strategies across different fluorescence regimes."
---

# Agent Behavior — HODLMM Bin Fluorescence

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `fluorescencePhase`, `fluorescenceVerdict`, `avgQuantumYield`, and `brightEmitterFraction`.

## Interpreting output

- **fluorescencePhase = LASER_EMISSION:** Stimulated emission regime with population inversion. Fee generation is self-reinforcing — high trade flow creates high fees which attract more LP capital which absorbs more trades. Coherent amplified output. These pools are in a virtuous cycle. Position aggressively but be aware that laser emission can become unstable if the population inversion collapses (mass LP withdrawal breaking the feedback loop).
- **fluorescencePhase = STRONG_FLUORESCENCE:** High quantum yield with efficient spontaneous emission. Most absorbed trade energy converts to fee yield with minimal non-radiative losses. Excellent pools for LP positioning — strong, predictable fee generation. The fluorescence is spontaneous rather than stimulated, meaning it lacks the self-amplifying feedback of laser emission but is more stable.
- **fluorescencePhase = MODERATE_GLOW:** Reasonable emission with significant non-radiative losses. The pool generates fees but wastes a substantial fraction of absorbed trade energy to internal friction. Look for bins with above-average quantum yield — pockets of efficiency within the overall moderate pool.
- **fluorescencePhase = WEAK_PHOSPHORESCENCE:** Dim, delayed emission. High intersystem crossing diverts energy into long-lived triplet states. Fee generation is slow, inefficient, and delayed relative to trade activity. The pool absorbs trades but takes a long time to convert them to fees. May indicate illiquid or low-activity pools.
- **fluorescencePhase = DARK_ABSORPTION:** Absorption without emission. Trade energy is absorbed but dissipated entirely through non-radiative decay — impermanent loss, reserve imbalance, and competition consume all absorbed energy before it can be emitted as fees. Avoid for LP positioning.
- **fluorescenceVerdict = RESONANCE_CASCADE:** Self-amplifying fluorescence cycle. High quantum yield and strong emission create cascading energy conversion. Excellent for LP — the pool is in a highly productive state.
- **fluorescenceVerdict = PHOTON_AVALANCHE:** Volume-driven excitation overwhelming the pool's emission capacity. Strong absorption with intense but potentially unsustainable emission. Monitor for photobleaching — the intensity may degrade if reserves cannot sustain the excitation rate.
- **fluorescenceVerdict = CONCENTRATION_QUENCH:** Too many reserves packed too close. Self-absorption and inner filter effects suppress emission despite adequate excitation. The DLMM equivalent of LP overcrowding — each individual position generates less yield because neighboring positions absorb the emitted photons. Reduce position density or spread to less crowded bins.
- **fluorescenceVerdict = BRIGHT_EMISSION:** Healthy sustainable fluorescence. Good quantum yield with low photobleaching — the pool efficiently converts trade energy to fees without degrading its capacity. Ideal for long-term LP positioning.
- **fluorescenceVerdict = DARK_STATE_TRAP:** Energy trapped in non-productive dark states via intersystem crossing. The pool absorbs trade energy but most of it enters the triplet manifold where it cannot be emitted as fluorescence. Fee generation is suppressed. Investigate what's driving the ISC — usually extreme reserve imbalance or bin concentration gradients that create energy barriers to radiative relaxation.
- **avgQuantumYield > 0.5:** Highly efficient energy conversion. More than half of absorbed trade energy converts to fees. Prioritize these pools.
- **avgQuantumYield < 0.2:** Poor efficiency. Most trade energy wasted. Avoid unless other signals are compelling.
- **avgStokesShift > 3:** Large energy gap between absorption and emission. Significant internal friction. Reserves are suboptimally distributed.
- **avgStokesShift < 1:** Tight energy coupling. Trades quickly become fees with minimal dissipation. Efficient bin configuration.
- **avgQuenchingFactor > 0.5:** Severe fluorescence suppression. Something in the local environment is killing emission — usually concentration effects or competitive quenching.
- **avgPhotobleaching > 0.5:** Significant capacity degradation. The pool's fee-generating ability is being permanently damaged. Consider exiting or repositioning.
- **avgFranckCondonFactor > 0.7:** Excellent vibrational overlap. Smooth electronic transitions allow efficient energy absorption. Good structural match between ground and excited states.
- **avgForsterRadius > 5:** Strong long-range energy transfer. Bins share energy with distant neighbors — fee generation is delocalized. Position matters less because energy redistributes across the bin spectrum.
- **avgIntersystemCrossing > 0.5:** Excessive dark state conversion. Most excited bins fall into non-productive states. Fee generation severely impaired.
- **brightEmitterFraction > 0.4:** Many bins are efficient emitters. Pool-wide fluorescence is strong. Good for broad-range LP strategies.
- **brightEmitterFraction < 0.1:** Very few bright bins. Most of the pool is dark. If positioning, concentrate on the few bright emitters.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on fluorescence signals from pools with fewer than 5 populated bins — insufficient data for meaningful spectroscopic analysis.
- Do not assume DARK_ABSORPTION means "dead pool." Dark absorbers may be transitioning between fluorescence regimes or may have high excitation that hasn't yet generated emission (excited state population building up). Check excitation energy and fluorescence lifetime before concluding.
- Do not assume high quantum yield alone means profitability. Quantum yield measures conversion efficiency, not absolute yield. A bin with 0.9 quantum yield but 0.01 excitation energy generates almost nothing — efficiency of a tiny amount is still tiny.
- Fluorescence analysis is a snapshot. Quantum yields change as LP positions shift, volume fluctuates, and active bins move. A pool in STRONG_FLUORESCENCE can become DARK_ABSORPTION if volume drops or LPs withdraw.
- The photophysical model simplifies multi-factor DLMM dynamics. Real pools experience forces beyond the Jablonski diagram — arbitrage, external liquidity shocks, and protocol upgrades can change fluorescence properties in ways not captured by the spectroscopic analogy.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "fluorescence analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest fluorescence index as the brightest emitter — the most efficient energy converter in the analyzed set.
- Flag bins with highest quantum yield as the most efficient fluorophores — where trade energy most effectively converts to fee yield.
- Highlight bins with highest emission intensity as the strongest emitters — the highest absolute fee output regardless of efficiency.
- Show bins with lowest quantum yield as the darkest absorbers — where trade energy is wasted through non-radiative decay.
- For LP agents: in LASER_EMISSION pools, position near the active bin where stimulated emission is strongest. In STRONG_FLUORESCENCE pools, spread across bins with above-average quantum yield. In MODERATE_GLOW pools, concentrate on the few bright emitter bins. In DARK_ABSORPTION pools, consider exiting or waiting for regime change.
- For trading agents: BRIGHT_EMISSION pools have the most sustainable fee generation — expect stable spreads. PHOTON_AVALANCHE pools have temporarily intense activity — spreads may tighten dramatically but the intensity is fragile. CONCENTRATION_QUENCH pools have overcrowded liquidity — expect tight spreads at concentrated bins but the yield per LP is poor.
- Compare fluorescence indices across pools to find pools with the best energy conversion efficiency for LP positioning.
