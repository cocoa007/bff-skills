---
name: hodlmm-bin-flux
description: "Analyzes inter-bin reserve flow gradients across HODLMM pools — measures reserve differentials between adjacent bins, detects liquidity migration direction, flow velocity, convergence/divergence zones, net flux momentum, and composite flow health scoring."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-flux/hodlmm-bin-flux.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Flux Analyzer

## What it does

Measures the reserve flow gradient between adjacent bins in HODLMM pools. For each pair of neighboring bins, computes the delta in reserves (both X and Y tokens), creating a flow field that reveals where liquidity is migrating. Identifies convergence zones (where flow gathers), divergence zones (where flow disperses), net flux direction, flow velocity magnitude, asymmetry between token flows, and a composite flux health score.

## Why agents need it

Bin flux reveals the directional pressure on liquidity that static snapshots miss. When adjacent bins show large positive deltas moving toward the active bin, LPs are concentrating — competition for swap volume intensifies. When flux flows away from the active bin, it signals potential LP exodus or range expansion. Convergence zones accumulate capital and may become oversaturated. Divergence zones lose capital and may develop gaps. The net flux vector tells LPs whether the pool's liquidity distribution is tightening or loosening, helping them time entries, exits, and rebalances.

## Commands

### doctor
Validates API connectivity and lists available flux analyses.

```bash
bun run skills/hodlmm-bin-flux/hodlmm-bin-flux.ts doctor
```

### run
Full flux analysis for selected pools. Reports per-bin gradients, convergence/divergence zones, net flux, velocity, and ASCII flow map.

```bash
bun run skills/hodlmm-bin-flux/hodlmm-bin-flux.ts run --top 3
bun run skills/hodlmm-bin-flux/hodlmm-bin-flux.ts run --pool 1
```

### status
Quick flux summary for the top 5 pools by TVL.

```bash
bun run skills/hodlmm-bin-flux/hodlmm-bin-flux.ts status
```

## Output contract

All outputs are JSON to stdout.

**Success:**

```json
{
  "result": "flux_analysis",
  "data": {
    "pools": [{ "poolId": 1, "pair": "sBTC/STX", "profile": { "fluxScore": 65, "netFluxDirection": "inward", "avgFluxMagnitude": 0.12 } }],
    "summary": { "poolsAnalyzed": 3, "avgFluxScore": 62 }
  }
}
```

**Error:**

```json
{ "error": "descriptive message" }
```

## Metrics explained

- **avgFluxMagnitude**: Mean absolute reserve delta between adjacent bins (normalized). Higher = more variation between neighbors.
- **medianFluxMagnitude**: Median absolute delta. Robust to outlier bin pairs.
- **peakFlux**: Bin pair with the largest reserve differential — sharpest liquidity cliff.
- **netFluxDirection**: "inward" (flow toward active bin), "outward" (flow away from active), or "neutral".
- **netFluxStrength**: Magnitude of net directional flow (-1.0 to +1.0, positive = inward).
- **convergenceZones**: Contiguous ranges where flux consistently flows inward. Capital accumulating.
- **divergenceZones**: Contiguous ranges where flux consistently flows outward. Capital dispersing.
- **convergenceCount**: Number of convergence zones detected.
- **divergenceCount**: Number of divergence zones detected.
- **fluxAsymmetry**: Ratio of X-token flux to Y-token flux. High asymmetry = one-sided flow pressure.
- **fluxVelocity**: Rate of reserve change across the bin range. Higher = steeper liquidity gradients.
- **fluxGini**: Gini coefficient of flux magnitudes (0 = uniform flow, 1 = concentrated at one edge).
- **leftFluxAvg**: Average flux on the left (sell) side. Negative = outflow.
- **rightFluxAvg**: Average flux on the right (buy) side. Negative = outflow.
- **fluxScore**: Composite health metric (0-100). Higher = smoother, more balanced flow field.

## Known constraints

- Read-only. No wallet or signing required.
- Scans bins within a fixed radius of the active bin (default +/-30).
- Flux is computed from a single snapshot — it measures spatial gradients, not temporal changes.
- Pools with very few populated bins (<5) will have limited flux signal.
- Empty bins create natural flux cliffs that may dominate the analysis.
