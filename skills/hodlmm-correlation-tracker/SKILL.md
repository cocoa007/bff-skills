---
name: hodlmm-correlation-tracker
description: "Monitors token pair price correlation in Bitflow HODLMM pools, detecting decorrelation events that amplify impermanent loss risk for concentrated LP positions."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "analyze <pool> | list | scan"
  entry: "hodlmm-correlation-tracker/hodlmm-correlation-tracker.ts"
  requires: ""
  tags: "defi, read-only, l2"
---

# HODLMM Correlation Tracker

## What it does
Monitors token pair price correlation in Bitflow HODLMM concentrated LP pools. Analyzes reserve asymmetry, liquidity concentration profiles, and price spread to classify correlation regimes (TIGHT/NORMAL/LOOSE/DIVERGING) and estimate impermanent loss exposure from decorrelation events.

## Why agents need it
Concentrated LP positions are highly sensitive to price correlation between paired tokens. When correlation breaks down, IL accelerates faster than in standard AMM pools. This skill gives agents early warning of decorrelation events so they can rebalance or exit positions before IL erodes fee income. Complements exit-optimizer (timing) and entry-optimizer (positioning) with the missing correlation dimension.

## Safety notes
- Read-only. No wallet required. No transactions submitted.
- All data from Bitflow public APIs (no authentication needed).
- No funds at risk. Safe to run at any frequency.

## Commands

### list
Lists available HODLMM pools with TVL, volume, and bin step info.
```bash
bun run hodlmm-correlation-tracker/hodlmm-correlation-tracker.ts list
```

### analyze
Deep correlation analysis for a specific pool. Returns regime classification, reserve asymmetry, concentration profile, price spread, IL estimate, and action recommendation.
```bash
bun run hodlmm-correlation-tracker/hodlmm-correlation-tracker.ts analyze dlmm_3
```

### scan
Scans top pools by TVL for decorrelation risk. Optionally filter by minimum risk level.
```bash
bun run hodlmm-correlation-tracker/hodlmm-correlation-tracker.ts scan --top 10 --threshold 5
```

## Output contract

All outputs are JSON to stdout.

**Success (analyze):**
```json
{
  "pool": { "id": "...", "name": "...", "activeBin": 227, "binStep": 10 },
  "correlation": { "regime": "NORMAL", "score": 0.65, "riskLevel": 3, "riskLabel": "MODERATE" },
  "reserveAsymmetry": { "asymmetryScore": 0.3, "xDominantBins": 5, "yDominantBins": 3, "balancedBins": 12 },
  "concentrationProfile": { "concentrationScore": 0.7, "centerOfMassOffset": 2.5 },
  "priceSpread": { "effectiveSpreadBps": 150, "spreadRegime": "NORMAL" },
  "ilEstimate": { "currentIL": "-1.2%", "priceRangeRatio": 1.015 },
  "recommendation": { "action": "HOLD", "reasoning": "...", "urgency": 2 }
}
```

**Error:**
```json
{ "error": "Pool not found: xyz", "hint": "Use 'list' to see available pools" }
```

## Known constraints
- Requires internet access to reach Bitflow APIs
- Token symbols may show as "?" if app API doesn't expose token metadata for all pools
- Correlation is inferred from bin-level snapshot data, not historical price series
- DLMM pools with wide bin ranges will naturally show higher spread values
