---
name: hodlmm-bin-capacitance
description: "Measures liquidity capacitance across HODLMM bin ranges — how much additional liquidity each bin can absorb before saturation, charge/discharge asymmetry, dielectric breakdown thresholds, energy storage density, leakage rates, and composite capacitance scoring."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-capacitance/hodlmm-bin-capacitance.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Capacitance Analyzer

## What it does

Measures liquidity capacitance -- the ability of HODLMM bins to absorb and store additional liquidity. For each pool, computes per-bin capacitance from the ratio of current reserves to estimated saturation limits, maps charge levels showing how full each bin is relative to its neighborhood maximum, detects overcharged bins at risk of overflow during rebalancing events, identifies undercharged bins with high absorption potential for new LP deposits, measures charge/discharge asymmetry revealing whether bins absorb or release liquidity more readily, computes dielectric breakdown thresholds where concentrated inflows would overwhelm bin capacity, estimates leakage rates from reserve decay patterns, and produces a composite capacitance index.

## Why agents need it

Capacitance reveals how much room bins have to absorb new liquidity or trade flow before structural changes occur. A high-capacitance pool has bins with significant headroom -- new deposits distribute evenly and trades absorb smoothly without moving the active bin. A low-capacitance pool is near saturation -- additional inflows concentrate in fewer bins, creating imbalances and forcing active bin shifts. Overcharged bins signal areas where withdrawal pressure may build as LPs seek to rebalance. Undercharged bins represent opportunities for new LP positions with less competition. Charge asymmetry shows whether a pool absorbs buys or sells more gracefully. Dielectric breakdown thresholds tell traders the trade size that would overwhelm local bin capacity. Together, these metrics help agents identify where to deposit liquidity for maximum efficiency, predict pool behavior under large inflows, and avoid pools near capacity limits.

## Commands

### doctor
Validates API connectivity and lists available analyses.

```bash
bun run skills/hodlmm-bin-capacitance/hodlmm-bin-capacitance.ts doctor
```

### run
Full capacitance analysis for selected pools. Reports per-bin charge levels, saturation map, overcharged/undercharged zones, breakdown thresholds, and ASCII capacitance map.

```bash
bun run skills/hodlmm-bin-capacitance/hodlmm-bin-capacitance.ts run --top 3
bun run skills/hodlmm-bin-capacitance/hodlmm-bin-capacitance.ts run --pool 1
```

### status
Quick capacitance summary for the top 5 pools by TVL.

```bash
bun run skills/hodlmm-bin-capacitance/hodlmm-bin-capacitance.ts status
```

## Output contract

All outputs are JSON to stdout.

**Success:**

```json
{
  "result": "capacitance_analysis",
  "data": {
    "pools": [{ "poolId": 1, "pair": "sBTC/STX", "profile": { "capacitanceIndex": 65, "capacitanceClass": "well-charged", "avgChargeLevel": 0.58 } }],
    "summary": { "poolsAnalyzed": 3, "avgCapacitanceIndex": 60 }
  }
}
```

**Error:**

```json
{ "error": "descriptive message" }
```

## Metrics explained

- **chargeLevel**: Per-bin fill ratio (0-1) measuring current reserves relative to local neighborhood maximum. 1.0 = fully charged (at or above neighborhood peak), 0.0 = empty.
- **saturationRatio**: How close the bin is to estimated overflow. Bins above 0.9 are near-saturated and may lose liquidity during rebalancing.
- **absorptionCapacity**: Estimated additional USD value the bin could absorb before reaching neighborhood saturation. Higher = more room for new deposits.
- **overchargedBins**: Bins with charge levels significantly above their neighbors, creating local peaks that attract withdrawal pressure.
- **underchargedBins**: Bins with charge levels significantly below their neighbors, representing opportunities for new LP deposits with less competition.
- **chargeAsymmetryBuy**: Average charge level of bins above the active bin. High = buy-side is well-filled.
- **chargeAsymmetrySell**: Average charge level of bins below the active bin. High = sell-side is well-filled.
- **dielectricBreakdown**: Estimated trade size (USD) that would overwhelm the weakest populated bin in the active range. Trades above this size risk discontinuous price impact.
- **leakageRate**: Rate at which reserve density decreases away from the active bin. High leakage = liquidity is tightly concentrated; low leakage = well-distributed.
- **capacitanceClass**: "supercapacitor" (index > 80), "well-charged" (60-80), "moderate" (40-60), "depleted" (20-40), "flat" (< 20).
- **capacitanceIndex**: Composite score (0-100). HIGHER means more absorption headroom, better distributed charge, and more resilient to large inflows.

## Safety notes

- Read-only skill. No wallet, signing, or funds required.
- All data is fetched from public on-chain contract reads and the Bitflow API.
- Does not execute any transactions or modify any state.
- Rate-limited by Hiro API. Avoid scanning more than 5 pools in rapid succession.
- No private keys or sensitive data are accessed.

## Known constraints

- Scans bins within a fixed radius of the active bin (default +/-30).
- Capacitance is computed from a single snapshot -- temporal dynamics require multiple snapshots over time.
- Saturation estimates use local neighborhood maximums as proxies -- actual bin capacity depends on AMM parameters and bin step size.
- Pools with very few populated bins (<5) will produce unreliable capacitance metrics.
- Dielectric breakdown estimates assume linear absorption -- actual impact depends on AMM math and fee structure.
- Empty bins have zero capacitance by definition, which deflates the index for sparse pools.
