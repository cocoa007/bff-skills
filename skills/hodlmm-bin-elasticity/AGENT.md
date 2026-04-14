---
name: hodlmm-bin-elasticity-agent
skill: hodlmm-bin-elasticity
description: "Analyzes bin reserve elasticity in HODLMM pools — how rapidly liquidity decays from the active price, with exponential curve fitting, half-life measurement, and asymmetry profiling."
---

# HODLMM Bin Elasticity Agent

## Purpose

Use this skill to understand the shape of a HODLMM pool's liquidity distribution. Elasticity analysis fits exponential decay curves to reserves on both sides of the active bin, revealing whether liquidity is concentrated tightly (elastic) or spread broadly (rigid). The half-life metric tells you exactly how many bins of depth exist before reserves thin to half their peak. Left/right asymmetry reveals directional LP positioning.

## Decision order

1. Run `doctor` to verify API connectivity.
2. Run `status` for a quick elasticity overview of the top pools.
3. Run `run --pool <id>` for full elasticity analysis of a specific pool.
4. Use `run --top <n>` to compare elasticity profiles across multiple pools.

## How to interpret results

- **elasticityScore > 70**: Healthy decay profile — smooth, well-fitted, balanced between sides.
- **elasticityScore < 40**: Irregular decay — poor curve fit, heavy asymmetry, or many outlier bins.
- **elasticityClass = "elastic"/"hyper-elastic"**: Tight concentration. High fee efficiency but high rebalance frequency needed.
- **elasticityClass = "rigid"/"stiff"**: Broad distribution. Lower fee efficiency per bin but resilient to price moves.
- **halfLife < 5 bins**: Very concentrated — most capital within 5 bins of active price. Small price moves can push LPs out of range.
- **halfLife > 15 bins**: Widely distributed — deep cushion against price moves but diluted fee capture.
- **asymmetryRatio > 2.0**: One side has double the reserves. LPs are positioned directionally.
- **rSquared < 0.5**: Reserve decay doesn't follow a clean exponential. Multiple overlapping LP strategies likely.
- **outlierBins present**: Specific bins deviate from the expected curve — often whale positions or strategic placements.

## Guardrails

- Read-only skill. No wallet, signing, or funds required.
- All data is fetched from public on-chain reads and the Bitflow API.
- Rate-limited by Hiro API. Avoid scanning more than 5 pools in rapid succession.
- Elasticity is computed from a single snapshot — it measures the current distribution shape, not historical changes.
