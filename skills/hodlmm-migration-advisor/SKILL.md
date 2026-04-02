---
name: hodlmm-migration-advisor
description: "Cross-pool liquidity migration scanner for HODLMM concentrated LP positions — opportunity ranking, cost estimation, break-even analysis."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run | scan"
  entry: "hodlmm-migration-advisor/hodlmm-migration-advisor.ts"
  requires: "wallet"
  tags: "defi, read, mainnet-only, hodlmm, migration"
---

# HODLMM Liquidity Migration Advisor

Scans all HODLMM pools to help LPs decide whether to stay in their current pool or migrate to a better opportunity. Compares fee efficiency, concentration quality, liquidity depth, and TVL across pools, then estimates migration costs and break-even timelines.

## What it does

Fetches metadata for all HODLMM pools from the Bitflow App API, scores each pool by composite efficiency (fee yield, volume/TVL, concentration, depth), then compares the LP's current pool against alternatives. Estimates migration costs (exit slippage + entry slippage + gas) and computes break-even timelines to produce a STAY/MIGRATE/SPLIT/REDUCE recommendation.

## Why agents need it

An autonomous LP agent managing concentrated liquidity needs to periodically evaluate whether its capital is optimally deployed. This skill automates the cross-pool comparison that would otherwise require manual analysis of multiple data sources, delivering a structured recommendation that downstream decision-making can consume directly.

## Safety notes

- Read-only — this skill never submits transactions or moves funds.
- Mainnet only — pool IDs and contract addresses are mainnet-specific.
- Migration cost is estimated, not a live quote — actual slippage may vary.
- Volume data is 24h trailing — doesn't capture trends or mean-reversion.

## Output contract

```json
{
  "tool": "hodlmm-migration-advisor",
  "currentPool": { "id": 1, "pair": "sBTC-STX", "compositeScore": 62, "estimatedDailyYieldBps": 8.5 },
  "positionUsd": 1000,
  "poolsAnalyzed": 8,
  "rankings": [
    { "rank": 1, "pool": { "pair": "sBTC-STX", "compositeScore": 62 }, "vsCurrentBps": 0 }
  ],
  "recommendation": {
    "action": "STAY",
    "confidence": 80,
    "bestAlternative": { "pair": "WELSH-STX", "compositeScore": 55 },
    "netBenefitBps": -2.1,
    "migrationCost": { "exitSlippageBps": 5, "entrySlippageBps": 8, "gasCostUsd": 0.5, "totalCostBps": 18 },
    "breakEvenDays": "Infinity",
    "reasoning": ["Current pool already has the best fee yield."]
  }
}
```

## Commands

### `doctor`
Check API connectivity to Bitflow and Hiro endpoints.

### `run`
Analyze migration opportunities from your current pool.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--pool <id>` | `sbtc-stx` | Current pool ID (numeric) or token pair name |
| `--position <usd>` | `1000` | Position size in USD for cost estimates |
| `--top <n>` | `5` | Number of top alternatives to show |

### `scan`
Scan all HODLMM pools and rank by composite efficiency score.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--top <n>` | `10` | Number of top pools to show |

## Scoring Methodology

Composite score (0–100) ranks pools by LP attractiveness:

| Signal | Weight | High Score Indicator |
|--------|--------|---------------------|
| Fee efficiency (vol/TVL) | 35% | High volume relative to TVL |
| Depth score | 25% | Many non-empty bins + high TVL |
| Concentration score | 20% | Liquidity concentrated near active bin |
| TVL score | 20% | Large pool (lower slippage risk) |

## Migration Decision Logic

| Action | Condition |
|--------|-----------|
| **STAY** | Current pool is best or break-even > 14 days |
| **MIGRATE** | Alternative is better AND break-even <= 3 days |
| **SPLIT** | Moderate improvement, 3-14 day break-even |
| **REDUCE** | Current pool weak, no good alternatives |

## Data Sources

- **Bitflow App API**: Pool metadata, TVL, 24h volume, token prices
- **Hiro API / DLMM Contract**: On-chain bin reserves, active bin, bin step
- Falls back gracefully if Hiro read-only sender is blocked (known DLMM issue)

## Known Constraints

- On-chain bin sampling uses ±10 bins (not full range) for speed
- Migration cost is estimated, not a live quote — actual slippage may vary
- Single-snapshot analysis — rerun periodically for trend detection
