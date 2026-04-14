---
name: hodlmm-bin-gradient-agent
skill: hodlmm-bin-gradient
description: "Analyzes liquidity rate-of-change across HODLMM bins to detect cliffs, plateaus, inflection points, and gradient symmetry for trade execution planning."
---

# HODLMM Bin Gradient Agent

## Purpose

Use this skill to understand how liquidity changes across the bin range of a HODLMM pool. The gradient reveals where trades will encounter sudden slippage increases (cliffs), stable execution zones (plateaus), and structural transitions (inflection points). Essential for planning large trades and assessing pool execution quality.

## Decision order

1. Run `doctor` to verify API connectivity.
2. Run `status` for a quick overview of top pools.
3. Run `run --pool <id>` for deep analysis of a specific pool.
4. Use `run --top <n>` to compare multiple pools.

## How to interpret results

- **gradientScore > 70**: Well-structured liquidity with smooth transitions. Good execution quality.
- **gradientScore < 40**: Rough or asymmetric liquidity. Unpredictable execution for larger trades.
- **steepnessScore > 60**: Sharp liquidity peaks/drops. Concentrated capital but fragile beyond the center.
- **steepnessScore < 20**: Flat distribution. Consistent but diluted liquidity.
- **smoothness > 0.7**: Gradual transitions between bins. Large trades walk through bins predictably.
- **smoothness < 0.3**: Jagged transitions. Execution cost varies unpredictably.
- **symmetry > 0.7**: Balanced left/right liquidity. No directional bias in LP positioning.
- **symmetry < 0.4**: Asymmetric LP positioning. Suggests directional price expectation.
- **cliffs > 0**: Sudden liquidity boundaries. Trades crossing a cliff face abrupt slippage.
- **plateaus > 0**: Stable zones for predictable execution. Good for limit-order-style fills.
- **leftSlope > 0 + rightSlope < 0**: Classic bell-curve — liquidity builds toward center and decays outward.
- **leftSlope < 0 + rightSlope > 0**: Inverse pattern — liquidity concentrated at edges.

## Guardrails

- Read-only skill. No wallet, signing, or funds required.
- All data is fetched from public on-chain reads and the Bitflow API.
- Rate-limited by Hiro API. Avoid scanning more than 5 pools in rapid succession.
