---
name: hodlmm-bin-viscosity
description: "Measures liquidity viscosity across HODLMM bin ranges — resistance to price movement through reserve depth gradients, shear stress detection, flow resistance profiling, directional asymmetry, and composite viscosity scoring."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-viscosity/hodlmm-bin-viscosity.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Viscosity Analyzer

## What it does

Measures liquidity viscosity — the resistance to price movement — across HODLMM bin ranges. For each pool, computes per-bin local viscosity from reserve depth relative to neighbors, maps viscosity gradients to find where resistance changes rapidly, detects shear stress zones where adjacent regions have dramatically different densities, profiles cumulative flow resistance for trades crossing multiple bins, measures directional asymmetry between buy-side and sell-side viscosity, and computes a composite viscosity index.

## Why agents need it

Viscosity determines how a pool behaves during trades. High-viscosity zones absorb large trades with minimal price impact — safe for execution. Low-viscosity zones let price slide through quickly — dangerous for large orders but indicate easy traversal for small ones. Shear stress zones — boundaries where viscosity changes abruptly — are the most critical: they mark the exact points where trade execution quality shifts dramatically. A pool with uniform viscosity gives predictable slippage regardless of direction. A pool with asymmetric viscosity punishes trades in one direction more than the other. Flow resistance curves tell traders exactly how much cumulative "friction" their trade will encounter at each size tier. Together, these metrics help agents optimize execution, identify liquidity fragility points, and compare pool quality beyond simple TVL.

## Commands

### doctor
Validates API connectivity and lists available analyses.

```bash
bun run skills/hodlmm-bin-viscosity/hodlmm-bin-viscosity.ts doctor
```

### run
Full viscosity analysis for selected pools. Reports per-bin viscosity, gradients, shear zones, flow resistance curves, and ASCII viscosity map.

```bash
bun run skills/hodlmm-bin-viscosity/hodlmm-bin-viscosity.ts run --top 3
bun run skills/hodlmm-bin-viscosity/hodlmm-bin-viscosity.ts run --pool 1
```

### status
Quick viscosity summary for the top 5 pools by TVL.

```bash
bun run skills/hodlmm-bin-viscosity/hodlmm-bin-viscosity.ts status
```

## Output contract

All outputs are JSON to stdout.

**Success:**

```json
{
  "result": "viscosity_analysis",
  "data": {
    "pools": [{ "poolId": 1, "pair": "sBTC/STX", "profile": { "viscosityIndex": 72, "viscosityClass": "viscous", "avgViscosity": 0.68 } }],
    "summary": { "poolsAnalyzed": 3, "avgViscosityIndex": 65 }
  }
}
```

**Error:**

```json
{ "error": "descriptive message" }
```

## Metrics explained

- **localViscosity**: Per-bin resistance computed from reserve depth relative to neighboring bins (0-1). High = dense, absorbs trades. Low = thin, trades slide through.
- **viscosityGradient**: Rate of change of viscosity across consecutive bins. Large gradients indicate sudden transitions in liquidity quality.
- **shearStress**: Magnitude of viscosity difference between adjacent zones. High shear marks breakpoints where execution quality changes abruptly.
- **shearZones**: Specific bin ranges where shear stress exceeds threshold — critical boundaries for trade sizing.
- **flowResistance**: Cumulative resistance a trade encounters crossing N bins from the active price. Higher = more friction, better absorption.
- **buyViscosity / sellViscosity**: Average viscosity on each side of the active bin. Asymmetry reveals directional bias.
- **viscosityAsymmetry**: Ratio of buy-to-sell viscosity (-1 to +1). 0 = symmetric, positive = buy-side thicker, negative = sell-side thicker.
- **viscosityClass**: "solid" (index > 80), "viscous" (60-80), "fluid" (40-60), "gaseous" (20-40), "vacuum" (< 20).
- **viscosityIndex**: Composite health metric (0-100). Rewards high average viscosity, low shear stress, symmetric resistance, and smooth gradients.

## Safety notes

- **Read-only.** No transactions are submitted, no wallet or signing required.
- **Mainnet-only.** Bitflow HODLMM API does not support testnet.
- Pools with fewer than 5 populated bins produce unreliable viscosity metrics — flagged in output.
- Flow resistance is theoretical — actual slippage depends on trade routing and AMM math.

## Known constraints

- Read-only. No wallet or signing required.
- Scans bins within a fixed radius of the active bin (default +/-30).
- Viscosity is computed from a single snapshot — temporal dynamics require multiple snapshots over time.
- Local viscosity depends on neighbor context — edge bins at scan boundaries may have skewed values.
- Pools with very few populated bins (<5) will produce unreliable viscosity metrics.
- Flow resistance is theoretical — actual slippage depends on trade routing and AMM math.
