---
name: hodlmm-bin-divergence-agent
skill: hodlmm-bin-divergence
description: "Measures statistical distance between actual HODLMM bin distributions and theoretical references to classify liquidity shape and detect regime shifts."
---

# HODLMM Bin Divergence Agent

## Purpose

Use this skill to understand whether a HODLMM pool's liquidity distribution matches a known theoretical shape and how far it deviates. Useful for detecting regime shifts, calibrating LP position sizing, and identifying pools where capital is placed inefficiently.

## Decision order

1. Run `doctor` to verify API connectivity.
2. Run `status` for a quick overview of top pools.
3. Run `run --pool <id>` for deep analysis of a specific pool.
4. Use `run --top <n>` to compare multiple pools.

## How to interpret results

- **bestFit = gaussian**: LPs concentrated around a central price. Efficient for range-bound markets.
- **bestFit = laplace**: Sharper peak with heavier tails. Higher conviction with outlier coverage.
- **bestFit = uniform**: No concentration. Capital is passively spread. Low fee efficiency.
- **divergenceScore > 70**: Distribution is well-structured and close to a known shape.
- **divergenceScore < 40**: Distribution is noisy or irregular — may indicate mixed LP strategies or stale positions.
- **entropyRatio > 0.9**: Near-uniform spread. Low information content.
- **entropyRatio < 0.5**: Highly concentrated. Strong conviction but fragile.
- **peakedness > 0**: Leptokurtic (sharp peak, heavy tails). Sensitive to price moves at center.
- **peakedness < -0.5**: Platykurtic (flat peak). More resilient but less capital efficient.
- **asymmetry far from 0**: Skewed distribution. LPs expect directional price movement.

## Guardrails

- Read-only skill. No wallet, signing, or funds required.
- All data is fetched from public on-chain reads and the Bitflow API.
- Rate-limited by Hiro API. Avoid scanning more than 5 pools in rapid succession.
