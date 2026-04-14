---
name: hodlmm-bin-gradient
description: "Analyzes the rate of change (gradient) of liquidity across HODLMM bin ranges — first/second derivatives, cliff detection, plateau zones, inflection points, and gradient symmetry around the active bin."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-gradient/hodlmm-bin-gradient.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Gradient Analyzer

## What it does

Computes the liquidity gradient — the rate at which reserves change across the bin range — for HODLMM DLMM pools. Calculates first derivatives (slope), second derivatives (curvature), detects cliff zones (sudden drops), plateau zones (stable regions), and inflection points (curvature sign changes). Measures gradient symmetry around the active bin and overall smoothness.

## Why agents need it

The gradient tells you how liquidity transitions across bins. Smooth gradients mean predictable execution for large trades. Cliffs mean sudden slippage walls. Plateaus mean stable zones where trades can execute at consistent depth. Inflection points mark structural boundaries in the liquidity landscape. Agents can use gradient data to find optimal entry bins (near plateau edges), avoid cliff zones, and assess whether a pool can absorb directional flow without abrupt cost increases.

## Commands

### doctor
Validates API connectivity and lists available gradient analyses.

```bash
bun run skills/hodlmm-bin-gradient/hodlmm-bin-gradient.ts doctor
```

### run
Full gradient analysis for selected pools. Reports derivatives, cliffs, plateaus, inflection points, symmetry, smoothness, and an ASCII gradient map.

```bash
bun run skills/hodlmm-bin-gradient/hodlmm-bin-gradient.ts run --top 3
bun run skills/hodlmm-bin-gradient/hodlmm-bin-gradient.ts run --pool 1
```

### status
Quick gradient summary for the top 5 pools by TVL.

```bash
bun run skills/hodlmm-bin-gradient/hodlmm-bin-gradient.ts status
```

## Output contract

All outputs are JSON to stdout.

**Success:**

```json
{
  "result": "gradient_analysis",
  "data": {
    "pools": [{ "poolId": 1, "pair": "sBTC/STX", "profile": { "gradientScore": 72, "steepnessScore": 45, "smoothness": 0.82 } }],
    "summary": { "poolsAnalyzed": 3, "avgGradientScore": 68 }
  }
}
```

**Error:**

```json
{ "error": "descriptive message" }
```

## Metrics explained

- **First derivative**: Rate of change of liquidity between adjacent bins. Positive = increasing, negative = decreasing.
- **Second derivative**: Acceleration/curvature of the liquidity curve. Positive = concave up, negative = concave down.
- **Cliff zones**: Regions where liquidity drops (or rises) by >15% of the max value in a single bin step. Indicates slippage walls.
- **Plateau zones**: Regions of 3+ bins where the coefficient of variation stays below 25%. Indicates stable, predictable liquidity.
- **Inflection points**: Bins where the second derivative changes sign — transitions between concave and convex curvature.
- **Gradient symmetry**: How evenly liquidity builds/decays on both sides of the active bin (0 = asymmetric, 1 = perfectly symmetric).
- **Smoothness**: Inverse of normalized roughness from second derivatives (0 = jagged, 1 = perfectly smooth).
- **Steepness score**: Composite of average and maximum normalized gradient magnitudes (0 = flat, 100 = extremely steep).
- **Gradient score**: Overall health combining smoothness, symmetry, cliff count, and plateau presence (0-100).

## Safety notes

- **Read-only.** No transactions are submitted, no wallet or signing required.
- **Mainnet-only.** Bitflow HODLMM API does not support testnet.
- Pools with fewer than 5 populated bins produce unreliable metrics — flagged in output.

## Known constraints

- Read-only. No wallet or signing required.
- Scans bins within a fixed radius of the active bin (default +/-30).
- Cliff threshold is fixed at 15% of max bin value. Plateau CV threshold is 25%.
- Gradient is computed via central differences (forward/backward at boundaries).
