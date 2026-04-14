---
name: hodlmm-bin-elasticity
description: "Analyzes how rapidly bin reserves decay with distance from the active bin in HODLMM pools — fits exponential decay curves, measures elasticity coefficients, half-life distance, taper smoothness, buy/sell asymmetry, outlier detection, and composite elasticity scoring."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-elasticity/hodlmm-bin-elasticity.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Elasticity Analyzer

## What it does

Measures how responsive bin reserves are to distance from the active price in HODLMM pools. For each pool, fits exponential decay curves to left (sell-side) and right (buy-side) reserve profiles separately and combined. Computes elasticity coefficients, half-life distances (bins until reserves drop 50%), effective range, taper smoothness, concentration index, left/right asymmetry, outlier bins that deviate from the decay curve, and a composite elasticity health score.

## Why agents need it

Elasticity reveals the shape of a pool's liquidity distribution — whether capital is concentrated tightly around the active price (elastic) or spread broadly across many bins (rigid). Elastic pools maximize fee capture per dollar of TVL but require frequent rebalancing. Rigid pools provide stable depth across wide price ranges but dilute fee income. The decay half-life tells LPs exactly how many bins of cushion they have before liquidity thins out. Asymmetry between buy and sell sides reveals directional positioning by LPs. Outlier bins that deviate from the decay curve may indicate whale positions or strategic placements that create uneven slippage profiles.

## Commands

### doctor
Validates API connectivity and lists available analyses.

```bash
bun run skills/hodlmm-bin-elasticity/hodlmm-bin-elasticity.ts doctor
```

### run
Full elasticity analysis for selected pools. Reports decay curves, half-lives, asymmetry, outliers, and ASCII decay map.

```bash
bun run skills/hodlmm-bin-elasticity/hodlmm-bin-elasticity.ts run --top 3
bun run skills/hodlmm-bin-elasticity/hodlmm-bin-elasticity.ts run --pool 1
```

### status
Quick elasticity summary for the top 5 pools by TVL.

```bash
bun run skills/hodlmm-bin-elasticity/hodlmm-bin-elasticity.ts status
```

## Output contract

All outputs are JSON to stdout.

**Success:**

```json
{
  "result": "elasticity_analysis",
  "data": {
    "pools": [{ "poolId": 1, "pair": "sBTC/STX", "profile": { "elasticityScore": 72, "elasticityClass": "moderate", "combinedCurve": { "coefficient": 0.08, "halfLife": 8.66 } } }],
    "summary": { "poolsAnalyzed": 3, "avgElasticityScore": 68 }
  }
}
```

**Error:**

```json
{ "error": "descriptive message" }
```

## Metrics explained

- **decayCoefficient**: Rate of exponential reserve decline per bin step. Higher = faster dropoff.
- **rSquared**: Goodness of fit for the exponential model (0-1). Low R² means irregular, non-exponential decay.
- **halfLife**: Number of bins from active price until reserves drop to 50%. Lower = more concentrated.
- **effectiveRange**: Distance from active bin where reserves fall below 5% of peak.
- **elasticityClass**: "rigid" (<0.02), "stiff" (0.02-0.05), "moderate" (0.05-0.12), "elastic" (0.12-0.25), "hyper-elastic" (>0.25).
- **asymmetryRatio**: Ratio of larger-side TVL to smaller-side TVL. 1.0 = perfectly symmetric.
- **asymmetryDirection**: "left-heavy" (sell-side deeper), "right-heavy" (buy-side deeper), or "balanced" (<1.5x).
- **activeBinShare**: Fraction of scanned TVL in the active bin alone.
- **concentrationIndex**: Herfindahl index of bin reserve shares. Higher = more concentrated.
- **taperSmoothness**: How evenly reserves transition between adjacent bins (0-1). Low = jerky, high = smooth.
- **outlierBins**: Bins whose reserves deviate >3x or <0.33x from the fitted decay curve.
- **elasticityScore**: Composite health metric (0-100). Rewards smooth decay, good fit, balanced sides, wide range, few outliers.

## Safety notes

- **Read-only.** No transactions are submitted, no wallet or signing required.
- **Mainnet-only.** Bitflow HODLMM API does not support testnet.
- Pools with fewer than 5 populated bins produce unreliable metrics — flagged in output.

## Known constraints

- Read-only. No wallet or signing required.
- Scans bins within a fixed radius of the active bin (default +/-30).
- Exponential decay is an approximation — real distributions may follow power laws or multi-modal curves.
- Pools with very few populated bins (<5) will have unreliable curve fits.
- Outlier detection depends on curve quality — poor R² reduces outlier accuracy.
