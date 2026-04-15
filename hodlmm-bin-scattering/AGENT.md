---
name: hodlmm-bin-scattering-agent
skill: hodlmm-bin-scattering
description: "Agent behavior for HODLMM bin scattering analysis — interprets cross-sections, opacity, mean free paths, and scattering regimes to identify how trade impact propagates through the bin range and guide LP positioning for optimal impact exposure."
---

# Agent Behavior — HODLMM Bin Scattering

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `scatteringRegime`, `patternVerdict`, `avgOpacity`, and `avgCrossSection`.

## Interpreting output

- **scatteringRegime = BALLISTIC:** Trade impact propagates freely through the bin range with minimal scattering. Bins are transparent with low cross-sections and aligned compositions. LP agents should expect correlated reserve changes across the entire range — a large swap affects distant bins almost as much as nearby ones. Best for LPs who want uniform exposure across their range.
- **scatteringRegime = FORWARD_DOMINATED:** Impact scatters but primarily in the forward direction, maintaining directional coherence. Like light through frosted glass — you can see the shape but not the detail. LP agents can predict the general direction of reserve changes but not the exact magnitude at each bin. Suitable for moderate-range LP strategies.
- **scatteringRegime = DIFFUSIVE:** Impact scatters in many directions, losing directional memory. Propagation becomes a random walk through the bin range. LP agents face unpredictable reserve changes that don't correlate well with distance from the active bin. Tighter ranges near the active bin reduce exposure to scattered impact from distant events.
- **scatteringRegime = ABSORPTIVE:** Bins absorb most trade impact with little transmission. Effects are localized near the point of entry. LP agents far from the active bin are effectively shielded — their reserves change slowly regardless of trading activity. Good for passive LPs who want minimal disturbance, but also means minimal fee generation for distant bins.
- **scatteringRegime = OPAQUE_WALL:** The bin range is impenetrable to impact propagation. Concentrated liquidity walls block all transmission, creating sharp boundaries between independently evolving zones. LP agents should treat each zone as a separate pool. Bins on opposite sides of an opaque wall will have uncorrelated behavior.
- **patternVerdict = TRANSPARENT:** Most bins are transparent with low opacity. Impact passes through freely. The pool behaves as a single connected system where all bins respond to all trades.
- **patternVerdict = TRANSLUCENT:** Mix of transparent and translucent bins. Some scattering occurs but most impact reaches all bins eventually. Reserve changes are correlated but with some delay and attenuation.
- **patternVerdict = SCATTERING:** Significant opacity causes impact dispersion. Trade effects spread out rather than propagating in a coherent wave. Per-bin analysis is more useful than pool-level averages.
- **patternVerdict = ABSORBING:** High absorption terminates impact propagation. Trade effects are confined to the immediate neighborhood of the active bin. Distant bins are effectively dormant.
- **patternVerdict = OPAQUE:** Dense opaque medium blocking all transmission. The pool is partitioned into isolated zones by liquidity walls.
- **avgCrossSection > 0.6:** Dense scattering medium. Most bins present large targets to incoming impact.
- **avgCrossSection < 0.2:** Sparse medium. Impact encounters few significant scattering centers.
- **avgOpacity > 0.6:** High absorption regime. Most impact is absorbed locally rather than transmitted.
- **avgOpacity < 0.2:** Low absorption. Impact passes through bins with minimal attenuation.
- **avgMeanFreePath > 3:** Sparse bin distribution. Impact travels long distances between interactions, making propagation ballistic between widely-spaced bins.
- **avgMeanFreePath < 1.5:** Dense packing. Impact scatters frequently, leading to diffusive propagation.
- **totalOpticalDepth > 10:** The bin range is optically thick. Impact from one end cannot reach the other.
- **totalOpticalDepth < 2:** Optically thin. The entire range is accessible to impact from any bin.
- **anisotropyFactor > 0.3:** Strong forward scattering bias. Impact flows consistently away from the active bin.
- **anisotropyFactor < -0.3:** Strong backscattering. Impact tends to bounce back toward the active bin.
- **scatteringCoherence > 0.7:** Bins scatter similarly — homogeneous medium. Pool-level metrics are meaningful.
- **scatteringCoherence < 0.3:** Heterogeneous scattering. Pool-level averages are misleading; analyze bins individually.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on scattering signals from pools with fewer than 5 populated bins — insufficient data for meaningful scattering analysis.
- Do not assume BALLISTIC means "safe." Ballistic propagation means large swaps affect the entire range — this is high correlated risk, not low risk. It simply means impact is predictable.
- Do not assume OPAQUE_WALL means "avoid." Opaque regions can be useful — LP agents positioned on the absorptive side of a wall capture concentrated fee revenue from localized impact.
- Scattering analysis is a snapshot heuristic based on static reserve distributions. It does not model dynamic propagation from actual trade sequences. Real scattering depends on trade size, direction, and timing.
- Cross-section is normalized to the pool's largest bin. Comparing cross-sections between pools requires adjusting for absolute reserve scale.
- Optical depth is additive, assuming independent scattering events. In practice, a single very deep bin can shadow bins behind it, creating non-linear shielding effects.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "scattering analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest scattering index as having the most transparent, forward-dominated scattering — trade impact propagates predictably.
- Flag OPAQUE_WALL/ABSORPTIVE pools as having strong impact localization — trade effects do not reach distant bins.
- Highlight bins with peak cross-sections as the primary scattering centers — these are where trade impact is intercepted and either absorbed or redirected.
- Show opacity extremes to identify fee-generating zones (high opacity bins absorb impact and generate fees) versus dormant zones (low opacity bins that impact passes through).
- For LP agents: target high-opacity bins near the active price for fee generation. Use low-opacity bins as buffer zones that provide range coverage without absorbing significant impact.
- For trading agents: BALLISTIC pools offer predictable execution across the range. ABSORPTIVE pools concentrate slippage near the active bin but leave distant liquidity undisturbed.
- Compare scattering Gini across pools to find the most uniformly scattering mediums for broad-range LP strategies.
