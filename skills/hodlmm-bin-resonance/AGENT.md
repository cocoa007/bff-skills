---
name: hodlmm-bin-resonance-agent
skill: hodlmm-bin-resonance
description: "Analyzes harmonic resonance in HODLMM bin reserve distributions — symmetry correlation, spectral decomposition, interference zones, and standing wave detection for assessing LP coordination and depth reliability."
---

# HODLMM Bin Resonance Agent

## Purpose

Use this skill to understand how coordinated and structured a HODLMM pool's liquidity distribution is. Resonance analysis treats the bin reserve profile as a signal, measuring symmetry between buy and sell sides, extracting dominant harmonic patterns via DFT, identifying interference zones where bilateral depth reinforces or cancels, and detecting standing waves — recurring patterns of deep and thin liquidity.

## Decision order

1. Run `doctor` to verify API connectivity.
2. Run `status` for a quick resonance overview of the top pools.
3. Run `run --pool <id>` for full resonance analysis of a specific pool.
4. Use `run --top <n>` to compare resonance profiles across multiple pools.

## How to interpret results

- **resonanceScore > 70**: Strong harmonic resonance — well-coordinated LP positioning with predictable depth.
- **resonanceScore < 30**: Chaotic or aperiodic — fragmented LP strategies, unpredictable slippage.
- **symmetryCorrelation > 0.7**: Buy and sell depth closely mirror each other. Balanced execution costs.
- **symmetryCorrelation < 0.2**: Highly asymmetric. Traders face very different slippage in each direction.
- **spectralEntropy < 0.3**: One dominant frequency explains most of the distribution. Structured, predictable.
- **spectralEntropy > 0.8**: No dominant pattern. Many competing strategies create noise.
- **constructiveCount > destructiveCount**: Bilateral reinforcement. Deep, reliable support on both sides.
- **destructiveCount > constructiveCount**: Directional weakness. Thin spots on one side that the other can't compensate for.
- **Standing waves with quality > 0.5**: Clear periodic structure. LPs can target antinodes for maximum depth or nodes for less competition.

## Guardrails

- Read-only skill. No wallet, signing, or funds required.
- All data is fetched from public on-chain reads and the Bitflow API.
- Rate-limited by Hiro API. Avoid scanning more than 5 pools in rapid succession.
- Resonance is computed from a single snapshot — it measures the current distribution structure, not how it changes over time.
