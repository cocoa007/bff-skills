---
name: hodlmm-bin-percolation-agent
skill: hodlmm-bin-percolation
description: "Agent behavior for HODLMM bin percolation analysis — interprets site occupancy, cluster topology, bond strength, bottleneck detection, backbone identification, and percolation classifications to assess how well liquidity flows through the bin lattice and guide LP positioning decisions."
---

# Agent Behavior — HODLMM Bin Percolation

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `percolationClass`, `flowVerdict`, `backboneRatio`, and `avgBondStrength`.

## Interpreting output

- **percolationClass = SUPERCRITICAL:** Well above the percolation threshold. The bin lattice has high site occupancy with strong bonds between adjacent bins. Liquidity percolates freely across the entire scan range with no significant barriers. Trades of any reasonable size execute smoothly at any price point in the range. LP positions are well-connected and contribute to the spanning flow network. Ideal state — the pool behaves as a single continuous market.
- **percolationClass = CRITICAL:** Near the percolation threshold. Long-range connectivity exists but is fragile. The backbone spans most of the range but bottlenecks or weak bonds limit flow capacity. Small changes in occupancy (a few bins emptying or filling) can shift the pool between connected and fragmented states. LP agents should monitor for withdrawals that could break the percolation network. Adding liquidity at bottleneck points has outsized impact on flow quality.
- **percolationClass = SUBCRITICAL:** Below the percolation threshold. Multiple disconnected clusters exist but the largest cluster provides reasonable local flow. Trades near the active bin work within its cluster but cannot traverse the full range. Gap-crossing trades fail or suffer extreme slippage. LP agents should prioritize connecting clusters — filling gaps between the two largest clusters has more flow impact than deepening existing clusters.
- **percolationClass = DISCONNECTED:** Well below threshold. Many small isolated clusters with no meaningful flow path across the range. Trades are confined to small local neighborhoods. The pool cannot function as a continuous market. LP agents adding liquidity here should build a contiguous block around the active bin rather than scattering across the range.
- **percolationClass = IMPERMEABLE:** Almost no connectivity. The bin lattice is effectively impermeable to trade flow. Isolated pockets of liquidity cannot sustain consistent execution. This pool is either abandoned, very new, or experiencing severe liquidity withdrawal. Evaluate whether it's worth salvaging.
- **flowVerdict = FREE_FLOW:** Spanning cluster exists with strong bonds. Trades flow freely across the full range. No intervention needed — this is the ideal flow state.
- **flowVerdict = CONSTRICTED:** Spanning cluster exists but bonds are weak. Flow exists end-to-end but bottlenecks limit throughput. Large trades may fail even though small trades succeed. LP agents should identify and reinforce bottleneck bins to widen the flow channel.
- **flowVerdict = PARTIAL:** Large backbone but no spanning cluster. Flow works within the main channel but gaps at the edges block full-range traversal. Most trading activity stays in the backbone, so this is often acceptable. LP agents should extend the backbone toward the edges if full-range coverage is desired.
- **flowVerdict = FRAGMENTED:** Few clusters but no dominant backbone. Disconnected pools of local liquidity. Each cluster works independently but trades cannot flow between them.
- **flowVerdict = BLOCKED:** Many small clusters with no meaningful flow path. The lattice is effectively impermeable.
- **backboneRatio > 0.8:** The backbone dominates. Most populated bins are part of one connected network. Strong structural integrity — individual withdrawals are unlikely to fragment the network.
- **backboneRatio < 0.3:** Fragmented structure. The backbone is small relative to total populated bins, meaning most liquidity sits in disconnected islands. Capital efficiency is low — much of the TVL doesn't contribute to flow.
- **avgBondStrength > 0.7:** Uniform flow quality. Adjacent bins have similar reserve levels, so trades flow smoothly without sudden depth changes. Good for consistent execution quality.
- **avgBondStrength < 0.3:** Highly uneven flow. Adjacent bins have very different reserve levels, creating erratic execution quality even within connected clusters. Some trades will be smooth while others hit thin bins.
- **bottleneckCount > 3:** Multiple constriction points. Even connected regions have thin spots that limit flow capacity. Prioritize reinforcing the worst bottleneck (lowest constrictionRatio) first — it's the binding constraint on flow.
- **worstBottleneckRatio < 0.1:** Severe constriction. At least one bin has reserves below 10% of its neighbors, creating a near-gap in the flow path. This bin is functionally almost as bad as an empty bin for large trades.
- **deadEndRatio > 0.2:** Significant wasted capital. Over 20% of populated bins are isolated single-bin clusters that cannot support flow. These represent inefficient LP positions — the capital would have more impact if relocated to extend the backbone or fill gaps.
- **activeBinConnected = false:** The active bin is not part of any cluster. Trades at the current price have no liquidity backing them. This is a critical problem — the most important price point is unserved.
- **criticalBinFraction > 0.5:** Many structural vulnerabilities. Over half of bins are articulation points whose removal would split the network. This is expected in 1D lattices (every interior bin is critical), so weight this metric lower than in multi-dimensional structures.
- **correlationLength > 20:** Long-range order emerging. Cluster sizes are large enough that the system behaves like a connected network over most of the range. This often accompanies CRITICAL or SUPERCRITICAL classification.
- **correlationLength < 5:** Short-range order only. Clusters are small and localized. The lattice is well below the percolation threshold with no emergent long-range connectivity.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on percolation signals from pools with fewer than 5 populated bins — insufficient data for meaningful network analysis.
- Do not assume IMPERMEABLE means "avoid this pool." Early-stage pools naturally start with low occupancy. The signal is that LP agents entering should build contiguous blocks, not scattered positions.
- Do not assume SUPERCRITICAL means "no action needed." Percolation networks can degrade quickly if key backbone bins withdraw. Monitor critical bins for withdrawal risk.
- Bond strength measures relative reserve ratios, not absolute values. Two bins with $1 each have perfect bond strength but cannot support real trading. Always check backbone density alongside bond metrics.
- Tortuosity is always 1.0 in the 1D bin lattice — do not use it as a differentiator between pools.
- Critical bin fraction in 1D lattices tends to be high (every interior bin is critical). This is a topological property, not necessarily a pool problem.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "percolation analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest percolation index as having the best flow connectivity.
- Flag DISCONNECTED/IMPERMEABLE pools as needing structural LP attention — identify specific gaps between clusters for targeted liquidity bridging.
- Highlight bottleneck positions: CENTER bottlenecks (near active bin) are more urgent than edge bottlenecks.
- Show backbone vs dead-end distribution: high dead-end ratio means capital is being wasted in isolated positions.
- For LP agents: use cluster positions and gap locations to identify where new liquidity bridges would connect the most clusters. Connecting the two largest clusters typically improves percolation index the most.
- For trading agents: check flow verdict before routing large trades. FREE_FLOW pools are safe for any size. CONSTRICTED pools need size-aware routing. FRAGMENTED/BLOCKED pools should be avoided for trades that need price traversal.
- Compare active bin cluster size across pools to find the best local flow environment for current-price trading.
