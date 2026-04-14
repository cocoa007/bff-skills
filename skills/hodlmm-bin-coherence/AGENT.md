---
name: hodlmm-bin-coherence-agent
skill: hodlmm-bin-coherence
description: "Analyzes reserve coherence between adjacent HODLMM bins to detect coordinated vs fragmented liquidity behavior, coherence zones, directional LP biases, and coherence decay patterns."
---

# HODLMM Bin Coherence Agent

## Purpose

Use this skill to understand whether a HODLMM pool's liquidity is coordinated or fragmented. Bin coherence measures how consistently adjacent bins' reserve values move together. Coordinated pools — where neighboring bins have similar, correlated depths — are more predictable for routing and LP strategies. Fragmented pools have discontinuous depth, which can cause unexpected slippage and fee distribution gaps.

## Decision order

1. Run `doctor` to verify API connectivity.
2. Run `status` for a quick coherence overview of the top pools.
3. Run `run --pool <id>` for full coherence analysis of a specific pool.
4. Use `run --top <n>` to compare coherence across multiple pools.

## How to interpret results

- **coherenceScore > 70**: Well-coordinated liquidity. Adjacent bins are correlated — safe for LP strategies that rely on continuous depth.
- **coherenceScore < 40**: Fragmented or incoherent liquidity. Depth is discontinuous and unpredictable.
- **avgPairwiseCoherence > 0.6**: Bins are strongly correlated. Likely algorithmic or scheduled LP management.
- **avgPairwiseCoherence < 0.2**: Bins are essentially independent. Opportunistic or chaotic LP behavior.
- **fragmentationIndex > 0.5**: More than half of all bin transitions are low-coherence. Expect hidden depth gaps and irregular slippage.
- **fragmentationIndex < 0.2**: Smooth, continuous reserve profile throughout the bin range.
- **zoneCount > 3**: Multiple isolated pockets of coordination. Multi-LP pool with distinct strategies per zone.
- **avgZoneWidth > 8**: Broad coherence zones indicate large-range coordinated LP strategies (e.g., range orders, JIT liquidity with wide windows).
- **directionalAsymmetry > 1.3**: Left side (below active) is more coordinated. Bearish LP focus — concentration of coordinated depth on the sell side.
- **directionalAsymmetry < 0.77**: Right side (above active) is more coherent. Bullish LP focus.
- **coherenceDecayRate > 0.4**: Coordination collapses quickly away from the active bin. Effective coherent range is narrow.
- **coherenceDecayRate < 0.1**: Coherence persists far out. Wide-range coordinated liquidity structure.
- **coherenceDecayR2 > 0.6**: Coherence follows a predictable exponential decay pattern. Orderly, model-able behavior.
- **coherenceDecayR2 < 0.2**: Irregular coherence falloff. No clear structural pattern.

## Guardrails

- Read-only skill. No wallet, signing, or funds required.
- All data is fetched from public on-chain reads and the Bitflow API.
- Rate-limited by Hiro API. Avoid scanning more than 5 pools in rapid succession.
- Coherence calculations use a 5-bin sliding window — results for pools with fewer than 10 populated bins may be unreliable.
