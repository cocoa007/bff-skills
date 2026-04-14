---
name: hodlmm-bin-saturation-agent
skill: hodlmm-bin-saturation
description: "Analyzes capital saturation levels across HODLMM bins to find oversaturated zones (crowded, diluted yield) and undersaturated gaps (LP opportunities), with Gini inequality, directional bias, and gradient analysis."
---

# HODLMM Bin Saturation Agent

## Purpose

Use this skill to understand whether capital in a HODLMM pool is efficiently distributed or crowded into specific ranges. Saturation compares each bin's actual capital to what a Gaussian model centered on the active bin would predict. Oversaturated bins have more capital than expected — LPs there compete for the same swap volume, diluting fee yield. Undersaturated bins have less capital than expected — new LPs can earn above-average returns by filling those gaps.

## Decision order

1. Run `doctor` to verify API connectivity.
2. Run `status` for a quick saturation overview of the top pools.
3. Run `run --pool <id>` for full saturation analysis of a specific pool.
4. Use `run --top <n>` to compare saturation across multiple pools.

## How to interpret results

- **saturationScore > 70**: Well-distributed capital. Most bins carry appropriate share of liquidity relative to distance from active price.
- **saturationScore < 40**: Capital is poorly distributed. Significant crowding or gaps in the bin range.
- **avgSaturation ~1.0**: Capital matches the expected Gaussian distribution. Healthy equilibrium.
- **avgSaturation > 1.5**: Capital concentrated above expectations — likely crowded popular ranges.
- **saturationGini > 0.5**: High inequality — a few bins hold disproportionate capital. Fee yield varies dramatically by position.
- **saturationGini < 0.2**: Uniform distribution. Consistent fee yield across positions.
- **oversaturatedBinCount > 20%**: More than a fifth of bins are crowded. New LPs should avoid these ranges.
- **undersaturatedBinCount > 20%**: Many bins are underfilled. Opportunity for new LPs to capture above-average yield.
- **directionalBias > 1.3**: Capital crowds the left (bearish) side. Sell-side depth is deeper than expected.
- **directionalBias < 0.77**: Capital crowds the right (bullish) side. Buy-side depth is deeper.
- **saturationGradient > +0.03**: Saturation systematically increases left-to-right — capital tilts toward higher bins.
- **saturationGradient < -0.03**: Saturation decreases left-to-right — capital tilts toward lower bins.

## Guardrails

- Read-only skill. No wallet, signing, or funds required.
- All data is fetched from public on-chain reads and the Bitflow API.
- Rate-limited by Hiro API. Avoid scanning more than 5 pools in rapid succession.
- Gaussian expected model assumes most capital belongs near the active bin — edge bins naturally show extreme ratios.
