---
name: hodlmm-bin-permeability
description: "Measures liquidity permeability across HODLMM bin ranges — trade transmission coefficients, absorption zones, leakage detection, directional permeability asymmetry, and composite scoring."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-permeability/hodlmm-bin-permeability.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Permeability Analyzer

## What it does

Measures liquidity permeability -- how easily trades flow through HODLMM bin ranges without being absorbed. For each pool, computes per-bin transmission coefficients from reserve depth relative to neighbors, maps permeability gradients to find boundaries between permeable and impermeable zones, detects absorption zones where dense liquidity catches trade volume, identifies leakage zones where thin liquidity lets trades pass through, computes directional transmission curves showing cumulative absorption over N bins, measures buy-side vs sell-side permeability asymmetry, and produces a composite permeability index.

## Why agents need it

Permeability is the inverse of viscosity -- where viscosity measures resistance, permeability measures transmission. A highly permeable pool lets trades slide through bin ranges without meaningful price absorption, causing excessive slippage. A low-permeability pool captures trade volume efficiently within its bin structure. Leakage zones reveal where liquidity is too thin to stop trades, creating execution blind spots. Absorption zones show where dense liquidity reliably catches volume. The transmission curve tells traders exactly how much of their trade will be "used up" after crossing N bins. Directional permeability asymmetry reveals whether buy-side or sell-side is leakier. Together, these metrics help agents identify fragile liquidity structures, avoid pools where trades leak through, and find pools that efficiently absorb volume at the best prices.

## Commands

### doctor
Validates API connectivity and lists available analyses.

```bash
bun run skills/hodlmm-bin-permeability/hodlmm-bin-permeability.ts doctor
```

### run
Full permeability analysis for selected pools. Reports per-bin permeability, gradients, transmission curves, absorption/leakage zones, and ASCII permeability map.

```bash
bun run skills/hodlmm-bin-permeability/hodlmm-bin-permeability.ts run --top 3
bun run skills/hodlmm-bin-permeability/hodlmm-bin-permeability.ts run --pool 1
```

### status
Quick permeability summary for the top 5 pools by TVL.

```bash
bun run skills/hodlmm-bin-permeability/hodlmm-bin-permeability.ts status
```

## Output contract

All outputs are JSON to stdout.

**Success:**

```json
{
  "result": "permeability_analysis",
  "data": {
    "pools": [{ "poolId": 1, "pair": "sBTC/STX", "profile": { "permeabilityIndex": 28, "permeabilityClass": "resistant", "avgPermeability": 0.31 } }],
    "summary": { "poolsAnalyzed": 3, "avgPermeabilityIndex": 35 }
  }
}
```

**Error:**

```json
{ "error": "descriptive message" }
```

## Metrics explained

- **localPermeability**: Per-bin transmission coefficient (0-1) based on inverse of reserve depth relative to neighbors. High = easy pass-through. Low = trade absorbed.
- **permeabilityGradient**: Rate of change of permeability across consecutive bins. Rapid changes mark boundaries between liquid and illiquid zones.
- **transmissionCurve**: Cumulative fraction of a trade that would pass through N bins without being absorbed. Starts at 1.0, decreases as bins absorb. Steep drop = good absorption; flat = leaky.
- **absorptionZones**: Contiguous bin ranges with low permeability that absorb most trade volume. Includes absorption efficiency metric (higher = better at catching trades).
- **leakageZones**: Contiguous bin ranges with high permeability where trades leak through without price impact. Includes leakage risk metric.
- **directionalPermeability**: Buy-side vs sell-side average permeability. Reveals which direction is leakier.
- **permeabilityAsymmetry**: Ratio measuring directional bias (-1 to +1). 0 = symmetric, positive = buy-side more permeable, negative = sell-side more permeable.
- **permeabilityClass**: "impermeable" (index < 20), "resistant" (20-40), "semi-permeable" (40-60), "permeable" (60-80), "porous" (> 80).
- **permeabilityIndex**: Composite score (0-100). For trade execution, LOWER is better (means liquidity absorbs trades). High index = risky, trades slide through without absorption.

## Safety notes

- Read-only skill. No wallet, signing, or funds required.
- All data is fetched from public on-chain contract reads and the Bitflow API.
- Does not execute any transactions or modify any state.
- Rate-limited by Hiro API. Avoid scanning more than 5 pools in rapid succession.
- No private keys or sensitive data are accessed.

## Known constraints

- Scans bins within a fixed radius of the active bin (default +/-30).
- Permeability is computed from a single snapshot -- temporal dynamics require multiple snapshots over time.
- Local permeability depends on neighbor context -- edge bins at scan boundaries may have skewed values.
- Pools with very few populated bins (<5) will produce unreliable permeability metrics.
- Transmission curves model idealized absorption -- actual slippage depends on trade routing, AMM math, and bin step size.
- Empty bins are treated as fully permeable, which inflates the index for sparse pools.
