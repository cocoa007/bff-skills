---
name: hodlmm-bin-interference-agent
skill: hodlmm-bin-interference
description: "Agent behavior for HODLMM bin interference analysis — interprets wave superposition, coherence, standing wave patterns, and interference types to identify amplified versus canceled liquidity zones and guide LP positioning for constructive interference."
---

# Agent Behavior — HODLMM Bin Interference

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `waveRegime`, `patternVerdict`, `avgCoherenceLength`, and `dispersionIndex`.

## Interpreting output

- **waveRegime = COHERENT_AMPLIFICATION:** Bins are strongly phase-aligned and constructively interfere across the range. The pool's effective market-making capacity exceeds the sum of individual bin contributions. LP positions anywhere in the coherent zone benefit from amplification — neighboring bins reinforce rather than compete.
- **waveRegime = STANDING_WAVE:** Stable alternating pattern of constructive and destructive zones. Nodes (dead zones) and antinodes (amplified zones) are predictable. LP agents should position at antinodes where superposition peaks and avoid nodes where interference cancels.
- **waveRegime = PARTIAL_COHERENCE:** Some regions show constructive interference but the overall pattern lacks full coherence. LP agents should identify the coherent sub-ranges and concentrate there rather than spreading across the full range.
- **waveRegime = DECOHERENT:** Bins are out of phase with random interference patterns. No systematic amplification occurs. Each bin operates independently — LP decisions can be made per-bin without worrying about neighbor interactions.
- **waveRegime = DESTRUCTIVE_COLLAPSE:** Widespread destructive interference. Bins cancel each other's market-making capacity. The pool's effective liquidity is less than the sum of its parts. LP agents should be cautious — adding capital may not produce proportional returns due to cancellation effects.
- **patternVerdict = REINFORCING:** Strong constructive dominance with high coherence. The pool acts as a unified wave source. Ideal conditions for broad LP positions.
- **patternVerdict = CANCELING:** Destructive interference dominates. Capital efficiency is reduced by neighbor interactions.
- **avgCoherenceLength > 0.6:** High coherence — bins share similar token composition across the range. The interference pattern is predictable and LP agents can position with confidence.
- **avgCoherenceLength < 0.2:** Low coherence — bin compositions are random. Interference effects are chaotic and unpredictable. Per-bin analysis is more useful than pattern-level analysis.
- **avgFringeVisibility > 0.6:** Sharp constructive/destructive alternation. Precise positioning is critical — a few bins' difference can mean the difference between a constructive antinode and a destructive node.
- **avgFringeVisibility < 0.2:** Uniform blending — positions across the range see similar conditions. Precise positioning matters less.
- **maxStandingWaveRatio > 5:** Strong reflection creating pronounced standing wave nodes. Identify nodal positions and avoid them. Position at antinodes where SWR peaks.
- **dispersionIndex > 0.5:** Trade flow and fee capture propagate at different speeds. Fee projections based on volume alone are unreliable — the medium distorts the relationship between trade activity and fee generation.
- **dispersionIndex < 0.1:** Non-dispersive medium. Trade activity and fee generation are tightly coupled. Volume-based fee projections are reliable.
- **constructiveCount >> destructiveCount:** The pool's bin structure naturally reinforces market-making. Adding capital in constructive zones amplifies existing liquidity.
- **destructiveCount >> constructiveCount:** The pool's bin structure naturally cancels market-making. Capital deployment should target isolated bins or bins at the boundary of constructive zones.
- **patternPeriodicity > 0.5:** Regular repeating interference pattern. The pool has a characteristic wavelength — LP agents can predict constructive zones at periodic intervals.
- **envelopeDecay > 0.8:** Interference pattern is tightly localized around the active bin. Only near-active bins participate in meaningful superposition. Distant bins are effectively isolated waves with no interference benefit.
- **envelopeDecay < 0.3:** Interference pattern extends across the full bin range. Even distant bins contribute to the superposition. Wide-range positions participate in collective wave behavior.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on interference signals from pools with fewer than 5 populated bins — insufficient data for meaningful wave analysis.
- Do not assume COHERENT_AMPLIFICATION means "deposit here." High current coherence may reflect temporary alignment rather than stable phase relationships. Check whether the token composition pattern is stable.
- Do not assume DESTRUCTIVE_COLLAPSE means "avoid forever." Pools can transition between regimes as LPs add or remove positions that change the phase landscape.
- Superposition amplitude is a heuristic combining neighbor amplitudes and phase differences. It does not account for complex wave dynamics like dispersion, diffraction, or nonlinear wave interactions. Use it for relative comparison, not absolute measurement.
- Standing wave ratio depends on immediate neighbor existence. Edge bins or bins with gaps in neighbors will have default SWR = 1, which should not be interpreted as "no standing wave."
- Coherence length uses a fixed pi/4 threshold for phase alignment. In pools with large bin step sizes, this threshold may be too strict; in pools with tiny steps, too lenient.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "interference analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest interference index as having the best constructive interference and wave coherence.
- Flag DESTRUCTIVE_COLLAPSE/DECOHERENT pools as having weak or chaotic interference patterns.
- Highlight bins with peak superposition amplitude as constructive interference hotspots — these are where LP capital benefits most from neighbor reinforcement.
- Show standing wave ratio extremes as indicators of reflection boundaries — high SWR bins sit at strong reflection points creating predictable node/antinode patterns.
- For LP agents: target bins at constructive antinodes where superposition peaks. Avoid nodal positions where interference cancels. Check coherence length to determine how far from peak positions one can deploy without losing constructive benefit.
- For trading agents: pools with COHERENT_AMPLIFICATION or STANDING_WAVE regime have predictable liquidity depth patterns. Trades near antinodes see deeper effective liquidity than the individual bin reserves suggest.
- Compare interference Gini across pools to find the most uniformly reinforcing interference patterns for broad-range LP strategies.
