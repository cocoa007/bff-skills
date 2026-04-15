---
name: hodlmm-bin-precession-agent
skill: hodlmm-bin-precession
description: "Agent behavior for HODLMM bin precession analysis — interprets gyroscopic stability, precession rates, nutation amplitudes, and torque patterns to identify spin-stabilized versus tumbling liquidity zones and guide LP positioning for compositional stability."
---

# Agent Behavior — HODLMM Bin Precession

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `spinRegime`, `patternVerdict`, `avgStabilityMargin`, and `avgPrecessionRate`.

## Interpreting output

- **spinRegime = GYROSCOPICALLY_STABLE:** Bins have high angular momentum and resist compositional perturbation. Wide stability margins mean torque from neighbors cannot overcome the spin. LP positions in these pools maintain predictable token ratios. Ideal for passive LP strategies that want stable exposure.
- **spinRegime = STEADY_PRECESSION:** Bins precess smoothly under moderate torque. Composition drifts predictably over time — agents can anticipate the direction and rate of token ratio changes. Active LPs can adjust positions ahead of the drift. The pool is not locked but is trackable.
- **spinRegime = NUTATING:** Visible wobble overlaid on precession from alternating neighbor torques. Short-term composition is less predictable, but the underlying drift direction may still be identifiable. LP agents need tighter monitoring intervals — the wobble can create temporary exposure spikes.
- **spinRegime = TUMBLING:** Angular momentum is insufficient to maintain gyroscopic stability. Bin compositions change erratically as torque exceeds the restoring force of spin. LP agents face unpredictable token ratio swings. Only suitable for agents with high rebalancing frequency and risk tolerance.
- **spinRegime = TOPPLED:** Bins have effectively fallen over — extreme compositional skew or depletion with no gyroscopic resistance to further perturbation. Token ratios are at or near 0/100 or 100/0. LP agents should treat these bins as depleted; adding capital here risks immediate impermanent loss as the bin has no spin momentum to resist further tilting.
- **patternVerdict = LOCKED:** The pool is spin-stabilized. Composition changes slowly and predictably across the bin range. Broadest safe zone for passive LP.
- **patternVerdict = PRECESSING:** Steady drift is occurring. LP agents should track the drift direction — positions on the leading edge of precession may accumulate favorable token ratios while trailing-edge positions accumulate unfavorable ratios.
- **patternVerdict = WOBBLING:** Nutation is significant. Short-term exposure oscillates even though the long-term drift may be stable. LP agents should either widen their range to absorb the wobble or narrow to a stable sub-range.
- **patternVerdict = UNSTABLE:** Multiple bins are tumbling or near topple. The pool's compositional structure is fragile. LP agents should reduce exposure or limit to the few gyroscopically stable bins near the active price.
- **patternVerdict = CHAOTIC:** No discernible gyroscopic pattern. Bins have independent, uncorrelated spin states. Per-bin analysis is more useful than pool-level assessment.
- **avgAngularMomentum > 0.6:** Strong collective spin. The pool resists compositional change.
- **avgAngularMomentum < 0.2:** Weak spin. Small perturbations cause large compositional shifts.
- **avgStabilityMargin > 0.4:** Comfortable safety buffer. Torque is well below the toppling threshold.
- **avgStabilityMargin < 0.1:** Thin margin. The pool is close to collective tumbling — a single large swap or LP withdrawal could push bins past the tipping point.
- **avgPrecessionRate > 0.3:** Fast precession. Composition changes rapidly. Only suitable for agents that can rebalance frequently.
- **avgPrecessionRate < 0.05:** Near-static composition. The bin structure is effectively frozen — what you see is what you get for the foreseeable future.
- **spinCoherence > 0.7:** Bins share similar compositional tilt — the pool precesses as a unit. Pool-level signals are meaningful.
- **spinCoherence < 0.3:** Bins have independent tilts. Pool-level averages are misleading; analyze bins individually.
- **maxConeAngle > 1.0:** Some bins trace very wide precession cones. Their composition sweeps through a large range, creating dramatic exposure changes per cycle.
- **torqueAlignment > 0.6:** Torque pushes consistently in one direction across the bin range. This indicates systematic compositional pressure — possibly from a large one-sided LP position or persistent directional trading.
- **torqueAlignment < 0.2:** Torque is chaotic with no consistent direction. Compositional changes are random rather than systematic.
- **avgWobbleDecay < 0.5:** Wobble is damping outward from bins — nutation is self-correcting. The pool will naturally return toward steady precession.
- **avgWobbleDecay > 0.8:** Wobble is amplifying as it propagates. Nutation may grow over time, destabilizing currently stable bins at the edges.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on precession signals from pools with fewer than 5 populated bins — insufficient data for meaningful gyroscopic analysis.
- Do not assume GYROSCOPICALLY_STABLE means "deposit here." High current stability may reflect temporary high volume (inflating angular momentum) rather than structural compositional resilience. Check whether volume levels are sustainable.
- Do not assume TOPPLED means "avoid forever." Pools can recover gyroscopic stability when new LPs add balanced reserves that increase angular momentum and reduce skew.
- Gyroscopic stability is a snapshot heuristic, not a physical simulation. It does not account for future swap sequences, LP additions/removals, or oracle price changes that could dramatically alter the torque landscape.
- Stability margin is angular momentum minus torque. Both are normalized 0-1, so the margin has arbitrary scale — use it for relative comparison between bins and pools, not as an absolute safety measure.
- Cone angle uses arctangent which saturates — very high precession-to-momentum ratios all map to similar angles near pi/2. This ceiling effect means the metric loses discriminating power for highly unstable bins.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "precession analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest precession index as having the best gyroscopic stability and spin-locked composition.
- Flag TOPPLED/TUMBLING pools as having weak or absent gyroscopic resistance to compositional change.
- Highlight bins with peak gyroscopic stability as the strongest anchors — these are where LP capital is most protected from compositional perturbation by neighboring activity.
- Show precession rate extremes as indicators of drift speed — high-rate bins are actively sweeping through token ratios and need monitoring.
- For LP agents: target bins with high gyroscopic stability and low precession rate for passive positions. For active strategies, bins with steady precession offer predictable drift that can be front-run.
- For trading agents: pools with GYROSCOPICALLY_STABLE regime have compositionally resilient bins — the liquidity you see is the liquidity you'll get. TUMBLING pools may offer better execution on one side as bins rapidly skew.
- Compare precession Gini across pools to find the most uniformly stable spin distributions for broad-range LP strategies.
