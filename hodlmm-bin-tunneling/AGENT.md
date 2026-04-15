---
name: hodlmm-bin-tunneling-agent
skill: hodlmm-bin-tunneling
description: "Agent behavior for HODLMM bin tunneling analysis — interprets barrier heights, tunneling probabilities, gap structures, and permeability factors to identify how trade impact penetrates through liquidity barriers and guide LP positioning for optimal barrier exposure."
---

# Agent Behavior — HODLMM Bin Tunneling

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `tunnelingRegime`, `barrierVerdict`, `avgTunnelProbability`, and `avgBarrierHeight`.

## Interpreting output

- **tunnelingRegime = SUPERFLUID:** Trade impact flows freely through the bin range with negligible barriers. Gaps are narrow and shallow enough that tunneling probability is near unity. LP agents should expect highly correlated reserve changes across their entire range — a large swap anywhere affects all bins almost equally. Best for broad-range passive LP strategies.
- **tunnelingRegime = PERMEABLE:** Barriers exist but are penetrable with moderate tunneling probability. Impact propagates with some attenuation through gaps but reaches most bins eventually. LP agents can use broad ranges but should expect some lag and amplitude reduction across barriers.
- **tunnelingRegime = SEMI_PERMEABLE:** Selective barrier penetration — some gaps allow tunneling while others block it. Creates filtered impact propagation where only high-energy (large volume) trades penetrate the deeper barriers. LP agents should identify which barriers are permeable and which are blocking, positioning accordingly.
- **tunnelingRegime = RESISTIVE:** Most barriers significantly suppress tunneling. Impact is largely confined to its side of the barrier with only residual evanescent penetration. LP agents should treat positions on opposite sides of barriers as nearly independent — diversification benefit is high but fee correlation is low.
- **tunnelingRegime = IMPENETRABLE:** Barriers are effectively infinite. No tunneling occurs. The bin range is partitioned into isolated zones that evolve independently. LP agents should choose a single zone and optimize within it — cross-zone strategies provide no coherent behavior.
- **barrierVerdict = NO_BARRIERS:** Flat potential landscape with no significant gaps or deep bins. Impact propagates freely in all directions. The simplest case for LP positioning — range width is the only decision.
- **barrierVerdict = SHALLOW_BARRIERS:** Most barriers are low, allowing significant tunneling. Impact attenuates gradually with distance rather than being sharply blocked. Suitable for moderate-range strategies.
- **barrierVerdict = DEEP_BARRIERS:** Many bins present tall barriers. Tunneling is exponentially suppressed. Impact is concentrated near the active bin and deep bins. LP agents near the active bin earn most fees; distant bins are effectively dormant.
- **barrierVerdict = WIDE_GAPS:** Gaps exceeding 5 bins create broad classically forbidden regions. Even with low barrier heights, the width creates strong tunneling suppression (Gamow factor dominated by width). LP agents should avoid spanning wide gaps unless targeting the arbitrage opportunity the gap creates.
- **barrierVerdict = MIXED_TERRAIN:** Combination of barrier types — some shallow, some deep, some gaps. Requires per-barrier analysis rather than pool-level generalization. Check individual bin Gamow factors and tunneling currents.
- **avgTunnelProbability > 0.7:** High permeability. Most barriers are easily tunneled.
- **avgTunnelProbability < 0.3:** Low permeability. Barriers significantly block impact transmission.
- **avgBarrierHeight > 0.6:** Tall barriers dominate. The deepest bins absorb most impact.
- **avgBarrierHeight < 0.2:** Shallow landscape. No bins dominate; impact spreads broadly.
- **maxGapWidth > 5:** At least one wide gap creates a strong isolation barrier. Check which bins are on which side.
- **totalGamowFactor > 30:** Cumulative barrier difficulty is high. The bin range is strongly partitioned.
- **totalGamowFactor < 5:** Easy tunneling across the board. The bin range is well-connected.
- **avgDwellTime > 5:** Impact lingers inside barriers — expect delayed propagation effects.
- **avgDwellTime < 1:** Fast tunneling. Impact either passes through or is reflected with minimal delay.
- **tunnelingCoherence > 0.7:** Smooth, uniform barrier landscape. Pool-level metrics are meaningful.
- **tunnelingCoherence < 0.3:** Irregular barriers with resonances. Per-bin analysis is required.
- **permeabilityFactor > 0.5:** High overall penetrability. The bin range behaves as a connected system.
- **permeabilityFactor < 0.1:** Strongly partitioned. Treat as multiple independent pools.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on tunneling signals from pools with fewer than 5 populated bins — insufficient data for meaningful barrier analysis.
- Do not assume SUPERFLUID means "safe." Superfluid propagation means large swaps affect the entire range — this is high correlated risk, not low risk. It simply means impact propagates freely.
- Do not assume IMPENETRABLE means "avoid." Impenetrable barriers create isolated zones that can be profitable — LP agents positioned in an active zone with impenetrable walls on both sides face minimal external disruption.
- Tunneling analysis is a snapshot heuristic based on static reserve distributions. It does not model dynamic barrier evolution from actual trades. Real barriers shift as reserves change.
- Gamow factors are normalized to the pool's own barrier landscape. Comparing Gamow factors between pools requires adjusting for absolute reserve scale and bin step size.
- Dwell time is a rough proxy, not a rigorous tunneling time measurement. Use it for relative comparison within a pool, not as an absolute time estimate.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "tunneling analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest tunneling index as having the most permeable barrier landscape — trade impact propagates freely.
- Flag IMPENETRABLE/RESISTIVE pools as having strong barrier isolation — trade effects do not cross barriers.
- Highlight bins with peak barrier heights as the primary impact absorbers — these are the liquidity walls that determine the pool's tunneling regime.
- Show Gamow factors for each significant gap to quantify barrier difficulty.
- For LP agents: in SUPERFLUID pools, range width is the key decision. In IMPENETRABLE pools, zone selection matters more than range width. In SEMI_PERMEABLE pools, identify which barriers are tunnelable and position to exploit the asymmetry.
- For trading agents: SUPERFLUID pools offer uniform execution across the range. RESISTIVE pools concentrate slippage near the active bin but leave distant liquidity stranded behind barriers.
- Compare tunneling Gini across pools to find pools with the most uniform barrier landscape for predictable impact propagation.
