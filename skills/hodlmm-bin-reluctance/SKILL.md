---
name: hodlmm-bin-reluctance
description: "Measures liquidity reluctance across HODLMM bin ranges — resistance to flux passage through the bin circuit. Computes per-bin reluctance from path length and reserve cross-section, magnetomotive force driving flow, air gap detection where empty bins create high-reluctance barriers, leakage flux fraction bypassing the main range, reluctance network analysis for series/parallel flow paths, reluctance torque showing directional bias, and composite reluctance scoring."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-reluctance/hodlmm-bin-reluctance.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Reluctance Analyzer

## What it does

Measures liquidity reluctance -- the resistance of the HODLMM bin circuit to liquidity flux passage. For each pool, computes per-bin reluctance from the ratio of effective path length to reserve cross-section area (bins with shallow reserves and wide spacing create high reluctance), magnetomotive force (MMF) representing the pressure gradient driving flow across the range, net flux through the circuit based on reserve flow patterns, air gap detection where empty or near-empty bins create high-reluctance barriers that block flux propagation, leakage flux fraction measuring how much flow bypasses the main populated range through peripheral bins, reluctance network topology showing series (sequential) and parallel (branching) flow paths through the bin structure, reluctance torque indicating directional asymmetry in flow resistance (buy-side vs sell-side), and a composite reluctance index.

## Why agents need it

Reluctance captures how easily liquidity can flow through the entire bin range as a circuit, not just individual bin properties. A pool with low reluctance allows trades to propagate smoothly across bins with minimal friction -- good for traders but potentially risky for LPs during directional moves. High reluctance means flow encounters significant resistance, especially at air gaps where empty bins create barriers. Air gaps are critical because they can trap liquidity on one side and create price discontinuities during large trades. The MMF-to-flux ratio reveals overall circuit efficiency -- how much driving pressure is needed to move a given amount of liquidity. Leakage flux shows wasted reserve allocation in peripheral bins that rarely participate in trading. Reluctance torque reveals whether the pool resists buy-side or sell-side pressure more, indicating structural directional bias. Network analysis distinguishes between pools where bins work in series (flow must pass through each sequentially) versus parallel (multiple paths distribute flow), which affects execution quality for large trades.

## Commands

### doctor
Validates API connectivity and lists available analyses.

```bash
bun run skills/hodlmm-bin-reluctance/hodlmm-bin-reluctance.ts doctor
```

### run
Full reluctance analysis for selected pools. Reports per-bin reluctance, MMF, air gaps, leakage flux, network topology, and ASCII reluctance map.

```bash
bun run skills/hodlmm-bin-reluctance/hodlmm-bin-reluctance.ts run --top 3
bun run skills/hodlmm-bin-reluctance/hodlmm-bin-reluctance.ts run --pool 1
```

### status
Quick reluctance summary for the top 5 pools by TVL.

```bash
bun run skills/hodlmm-bin-reluctance/hodlmm-bin-reluctance.ts status
```

## Output contract

All outputs are JSON to stdout.

**Success:**

```json
{
  "result": "reluctance_analysis",
  "data": {
    "pools": [{ "poolId": 1, "pair": "sBTC/STX", "profile": { "reluctanceIndex": 45, "reluctanceClass": "moderate", "avgReluctance": 0.52 } }],
    "summary": { "poolsAnalyzed": 3, "avgReluctanceIndex": 48 }
  }
}
```

**Error:**

```json
{ "error": "descriptive message" }
```

## Metrics explained

- **reluctance**: Per-bin resistance to flux (0-1). Higher = bin resists flow passage more strongly. Computed from path length to reserve cross-section ratio.
- **magnetomotiveForce**: Pressure gradient driving flow across the range (USD). The reserve imbalance that pushes liquidity from concentrated to sparse regions.
- **netFlux**: Actual flow rate through the circuit (USD). Lower flux relative to MMF indicates higher circuit reluctance.
- **airGaps**: Empty or near-empty bins that create high-reluctance barriers. Each gap has a position, width, and reluctance contribution.
- **leakageFluxFraction**: Fraction of reserves in peripheral bins (>70% of range from active) that rarely participate in trading. Higher = more wasted capital.
- **networkTopology**: Whether flow paths are primarily "series" (sequential, each bin must be traversed), "parallel" (branching, multiple paths available), or "mixed".
- **reluctanceTorque**: Directional asymmetry (-1 to +1). Positive = buy-side has higher reluctance. Negative = sell-side has higher reluctance.
- **reluctanceClass**: "superconductor" (index < 20), "low-friction" (20-40), "moderate" (40-60), "high-barrier" (60-80), "blocked" (> 80).
- **reluctanceIndex**: Composite score (0-100). HIGHER means more resistance to flux passage, more air gaps, and lower circuit efficiency.

## Safety notes

- Read-only skill. No wallet, signing, or funds required.
- All data is fetched from public on-chain contract reads and the Bitflow API.
- Does not execute any transactions or modify any state.
- Rate-limited by Hiro API. Avoid scanning more than 5 pools in rapid succession.
- No private keys or sensitive data are accessed.

## Known constraints

- Scans bins within a fixed radius of the active bin (default +/-30).
- Reluctance is computed from a single snapshot -- true reluctance requires observing flow under varying pressure levels.
- Air gap detection uses a threshold approach -- very small reserves may be counted as gaps when they still participate in trading.
- MMF is estimated from reserve gradients, not from actual trade flow data.
- Network topology classification is structural, not validated against observed execution paths.
- Leakage flux uses distance from active bin as proxy -- actual participation depends on trade sizes.
- Pools with very few populated bins (<5) will produce unreliable reluctance metrics.
