---
name: hodlmm-bin-saturation
description: "Measures capital saturation levels across HODLMM bins — compares actual reserves to Gaussian-expected distribution, identifies oversaturated and undersaturated zones, Gini inequality, directional bias, saturation gradient, and composite scoring."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-saturation/hodlmm-bin-saturation.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Saturation Analyzer

## What it does

Measures how saturated each bin's capital is relative to its expected share of total pool liquidity. Models expected distribution as a Gaussian centered on the active bin, then computes per-bin saturation ratios (actual/expected). Identifies oversaturated zones where excess capital competes for limited swap volume, undersaturated zones with LP opportunity, saturation Gini coefficient for inequality, directional saturation bias, saturation gradient across the range, and a composite saturation health score.

## Why agents need it

Capital saturation reveals the efficiency of LP capital deployment. Oversaturated bins attract disproportionate capital relative to their position, diluting fee yield per dollar — LPs in those ranges earn less per unit of capital. Undersaturated bins are opportunity gaps where new LPs can earn above-average yield. The Gini coefficient measures overall distribution inequality. Directional bias shows whether capital crowds one side of the price. The gradient reveals systematic tilt in capital allocation. Together these metrics help LPs find where their capital works hardest and avoid crowded ranges.

## Commands

### doctor
Validates API connectivity and lists available saturation analyses.

```bash
bun run skills/hodlmm-bin-saturation/hodlmm-bin-saturation.ts doctor
```

### run
Full saturation analysis for selected pools. Reports per-bin ratios, zones, Gini, gradient, directional metrics, score, and ASCII saturation map.

```bash
bun run skills/hodlmm-bin-saturation/hodlmm-bin-saturation.ts run --top 3
bun run skills/hodlmm-bin-saturation/hodlmm-bin-saturation.ts run --pool 1
```

### status
Quick saturation summary for the top 5 pools by TVL.

```bash
bun run skills/hodlmm-bin-saturation/hodlmm-bin-saturation.ts status
```

## Output contract

All outputs are JSON to stdout.

**Success:**

```json
{
  "result": "saturation_analysis",
  "data": {
    "pools": [{ "poolId": 1, "pair": "sBTC/STX", "profile": { "saturationScore": 72, "avgSaturation": 1.05, "saturationGini": 0.25 } }],
    "summary": { "poolsAnalyzed": 3, "avgSaturationScore": 68 }
  }
}
```

**Error:**

```json
{ "error": "descriptive message" }
```

## Metrics explained

- **avgSaturation**: Mean saturation ratio across populated bins. 1.0 = capital matches expected distribution exactly.
- **medianSaturation**: Median saturation ratio. Robust to outlier bins.
- **peakSaturation**: Bin with highest saturation ratio — most oversaturated position.
- **troughSaturation**: Bin with lowest saturation ratio — most undersaturated position.
- **oversaturatedZones**: Contiguous bin ranges where saturation >= 2.0x expected. Excess capital competing for volume.
- **undersaturatedZones**: Contiguous bin ranges where saturation <= 0.3x expected. LP opportunity gaps.
- **oversaturatedBinCount**: Total bins classified as oversaturated.
- **undersaturatedBinCount**: Total bins classified as undersaturated.
- **oversaturatedCapitalUsd**: Total USD locked in oversaturated bins.
- **undersaturatedCapitalUsd**: Total USD in undersaturated bins.
- **saturationGini**: Gini coefficient of saturation ratios (0 = perfectly uniform, 1 = maximally unequal).
- **saturationStdDev**: Standard deviation of saturation ratios. Higher = more variable distribution.
- **leftAvgSaturation**: Average saturation below the active bin (sell side).
- **rightAvgSaturation**: Average saturation above the active bin (buy side).
- **directionalBias**: leftAvg / rightAvg. >1 = left-heavy, <1 = right-heavy, ~1 = balanced.
- **saturationGradient**: Linear slope of saturation across bin offsets. Positive = increasing left-to-right.
- **gradientR2**: R² of linear fit. Higher = more systematic tilt.
- **saturationScore**: Composite health metric (0-100) combining all above metrics.

## Known constraints

- Read-only. No wallet or signing required.
- Scans bins within a fixed radius of the active bin (default +/-30).
- Expected distribution uses a Gaussian model (sigma = radius/3) — may not match all LP strategies.
- Pools with very few populated bins (<5) will have limited saturation signal.
- Saturation ratios for bins far from active bin where expected value is tiny can produce very high ratios even with minimal capital.
