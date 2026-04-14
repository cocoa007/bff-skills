---
name: hodlmm-bin-cascade
description: "Analyzes how liquidity depletion cascades through HODLMM bins, identifying vulnerability zones where thin neighbor bins amplify price impact."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run | status"
  entry: "hodlmm-bin-cascade/hodlmm-bin-cascade.ts"
  requires: ""
  tags: "defi, read-only, l2"
---

# HODLMM Bin Cascade Risk Analyzer

## What it does
Measures how liquidity depletion in one DLMM bin propagates to neighbors, identifying cascade vulnerability zones. When a large trade drains the active bin, overflow spills into adjacent bins. Thin neighbor bins create "cascade chains" where price moves accelerate through multiple bins rapidly, causing outsized slippage. Scores bid-side and ask-side cascade risk independently and detects asymmetric exposure.

## Why agents need it
Autonomous LP agents need to understand not just static depth but dynamic cascade risk — how far and fast a large trade would move the price. This skill identifies thin-bin sequences that amplify price impact, enabling agents to avoid pools with dangerous cascade profiles or adjust position ranges to avoid vulnerability zones.

## Safety notes
- Read-only: no transactions, no fund movements
- Uses Hiro API for on-chain bin reserve reads
- Uses BFF API for pool discovery
- Safe to run anytime without wallet

## Commands

### doctor
Checks environment, API connectivity, and pool availability.
```bash
bun run hodlmm-bin-cascade/hodlmm-bin-cascade.ts doctor
```

### run
Full cascade risk analysis for top pools or a specific pool.
```bash
bun run hodlmm-bin-cascade/hodlmm-bin-cascade.ts run
bun run hodlmm-bin-cascade/hodlmm-bin-cascade.ts run --pool 1
bun run hodlmm-bin-cascade/hodlmm-bin-cascade.ts run --top 5
```

### status
Quick cascade risk summary for top 5 pools.
```bash
bun run hodlmm-bin-cascade/hodlmm-bin-cascade.ts status
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "cascade_risk_analysis",
  "data": {
    "pools": [...],
    "summary": {
      "poolsAnalyzed": 3,
      "highestRisk": { "pair": "STX/sBTC", "cascadeRiskScore": 42 },
      "avgRiskScore": 31,
      "criticalZonesTotal": 1
    }
  }
}
```

**Error:**
```json
{ "error": "descriptive message" }
```

## Known constraints
- BFF API must be reachable for pool discovery (currently returning 404 — skill handles gracefully)
- Scans ±25 bins from active bin; deep liquidity beyond this range is not captured
- Cascade simulation is static (snapshot-based), not event-driven
- Absorption estimates use current reserve ratios, not order book dynamics
