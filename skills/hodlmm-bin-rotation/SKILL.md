---
name: hodlmm-bin-rotation
description: "Analyzes active bin movement patterns over time — rotation speed, directional persistence, reversal frequency, momentum scoring, and mean reversion tendency for HODLMM pools."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run | scan"
  entry: "hodlmm-bin-rotation/hodlmm-bin-rotation.ts"
  requires: ""
  tags: "defi, read-only, l2"
---

# HODLMM Bin Rotation Tracker

## What it does
Tracks how the active bin in a HODLMM pool moves over time by analyzing on-chain swap events. Measures rotation speed (bins moved per block interval), directional persistence (how long price trends last), reversal frequency, momentum scoring (-100 to +100), and mean reversion tendency. Classifies pools into rotation regimes: STABLE, TRENDING, CHOPPY, VOLATILE, or DORMANT.

## Why agents need it
Autonomous LP agents need to understand whether a pool's price action is trending, mean-reverting, or choppy before choosing bin ranges. A trending pool needs asymmetric ranges; a choppy pool needs wider ranges; a stable pool rewards tight concentration. This skill provides the directional intelligence needed to make that decision.

## Safety notes
- Read-only — no transactions, no fund movement
- Uses Hiro API and BFF API for on-chain data
- No wallet or signing required

## Commands

### doctor
Checks BFF and Hiro API availability.
```bash
bun run hodlmm-bin-rotation/hodlmm-bin-rotation.ts doctor
```

### run
Analyze rotation patterns for a specific pool (or highest-volume pool by default).
```bash
bun run hodlmm-bin-rotation/hodlmm-bin-rotation.ts run --pool 1
```

### scan
Scan top 5 HODLMM pools by volume and compare rotation regimes.
```bash
bun run hodlmm-bin-rotation/hodlmm-bin-rotation.ts scan
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "data": {
    "poolId": 1,
    "pair": "STX/sBTC",
    "regime": "TRENDING",
    "momentumScore": 42,
    "momentumDirection": "BULLISH",
    "reversalRate": 0.35,
    "meanReversionIndex": 0.45,
    "rotationSpeed": 0.012,
    "avgBinsPerTransition": 1.8,
    "recommendation": "..."
  }
}
```

**Error:**
```json
{ "error": "descriptive message" }
```

## Known constraints
- BFF API must be reachable for pool discovery
- Hiro API must be reachable for contract events and bin data
- Event history limited to most recent 50 events; longer histories would improve accuracy
- Synthetic transitions generated when real events are unavailable
