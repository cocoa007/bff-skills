---
name: hodlmm-bin-conductivity
description: "Measures liquidity conductivity across HODLMM bin ranges — how well reserve changes propagate between neighboring bins, conduction path detection, insulation zone identification, directional propagation asymmetry, and composite scoring."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-conductivity/hodlmm-bin-conductivity.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Conductivity Analyzer

## What it does

Measures liquidity conductivity -- how well reserve changes propagate across HODLMM bin ranges. For each pool, computes per-bin conductivity coefficients from reserve correlation with neighbors, maps conductivity gradients to find boundaries between coupled and isolated regions, detects conduction paths where dense interconnected liquidity transfers changes efficiently, identifies insulation zones where thin or fragmented liquidity blocks propagation, computes directional propagation depth showing how many bins a change reaches before dampening, measures buy-side vs sell-side conductivity asymmetry, and produces a composite conductivity index.

## Why agents need it

Conductivity reveals how structurally connected a pool's liquidity is. A high-conductivity pool has well-coupled bins where a reserve change in one bin influences its neighbors, creating smooth, predictable price curves. A low-conductivity pool has isolated bins that behave independently, causing abrupt price jumps and unpredictable execution. Conduction paths show connected liquidity corridors where trades execute smoothly. Insulation zones mark structural breaks where liquidity coupling fails, creating execution cliffs. Propagation depth tells traders how far a price impact will ripple through the bin range. Directional conductivity asymmetry reveals whether buy-side or sell-side liquidity is better connected. Together, these metrics help agents evaluate pool structural quality, avoid pools with fragmented liquidity, and find pools where trades execute with smooth, continuous price impact.

## Commands

### doctor
Validates API connectivity and lists available analyses.

```bash
bun run skills/hodlmm-bin-conductivity/hodlmm-bin-conductivity.ts doctor
```

### run
Full conductivity analysis for selected pools. Reports per-bin conductivity, gradients, conduction paths, insulation zones, propagation depth, and ASCII conductivity map.

```bash
bun run skills/hodlmm-bin-conductivity/hodlmm-bin-conductivity.ts run --top 3
bun run skills/hodlmm-bin-conductivity/hodlmm-bin-conductivity.ts run --pool 1
```

### status
Quick conductivity summary for the top 5 pools by TVL.

```bash
bun run skills/hodlmm-bin-conductivity/hodlmm-bin-conductivity.ts status
```

## Output contract

All outputs are JSON to stdout.

**Success:**

```json
{
  "result": "conductivity_analysis",
  "data": {
    "pools": [{ "poolId": 1, "pair": "sBTC/STX", "profile": { "conductivityIndex": 72, "conductivityClass": "conductive", "avgConductivity": 0.68 } }],
    "summary": { "poolsAnalyzed": 3, "avgConductivityIndex": 65 }
  }
}
```

**Error:**

```json
{ "error": "descriptive message" }
```

## Metrics explained

- **localConductivity**: Per-bin coupling coefficient (0-1) based on reserve correlation with immediate neighbors. High = well-coupled, changes propagate. Low = isolated bin.
- **conductivityGradient**: Rate of change of conductivity across consecutive bins. Rapid changes mark structural boundaries between coupled and isolated regions.
- **propagationDepthBuy**: Number of bins above the active bin that a change would reach before dampening below threshold. Deeper = better connected upward.
- **propagationDepthSell**: Number of bins below the active bin that a change would reach before dampening. Deeper = better connected downward.
- **conductionPaths**: Contiguous bin ranges with high conductivity where liquidity is well-coupled. Includes coupling strength metric (higher = better propagation).
- **insulationZones**: Contiguous bin ranges with low conductivity where liquidity propagation is blocked. Includes isolation severity metric.
- **directionalConductivity**: Buy-side vs sell-side average conductivity. Reveals which direction has better-connected liquidity.
- **conductivityAsymmetry**: Ratio measuring directional bias (-1 to +1). 0 = symmetric, positive = buy-side better connected, negative = sell-side better connected.
- **conductivityClass**: "superconductor" (index > 80), "conductive" (60-80), "semi-conductive" (40-60), "resistive" (20-40), "insulator" (< 20).
- **conductivityIndex**: Composite score (0-100). For trade execution, HIGHER is better (means liquidity is well-connected and changes propagate smoothly).

## Safety notes

- Read-only skill. No wallet, signing, or funds required.
- All data is fetched from public on-chain contract reads and the Bitflow API.
- Does not execute any transactions or modify any state.
- Rate-limited by Hiro API. Avoid scanning more than 5 pools in rapid succession.
- No private keys or sensitive data are accessed.

## Known constraints

- Scans bins within a fixed radius of the active bin (default +/-30).
- Conductivity is computed from a single snapshot -- temporal dynamics require multiple snapshots over time.
- Local conductivity depends on neighbor context -- edge bins at scan boundaries may have skewed values.
- Pools with very few populated bins (<5) will produce unreliable conductivity metrics.
- Propagation depth models idealized wave propagation -- actual price impact depends on trade size, AMM math, and bin step size.
- Empty bins act as perfect insulators, which deflates the index for sparse pools.
