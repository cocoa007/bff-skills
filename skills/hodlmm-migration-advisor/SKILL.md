---
name: hodlmm-migration-advisor
description: Cross-pool liquidity migration scanner for HODLMM concentrated LP positions — opportunity ranking, cost estimation, break-even analysis
author: cocoa007
tags: [hodlmm, migration, dlmm, bitflow, defi, lp, yield, optimization]
entry: hodlmm-migration-advisor.ts
---

# HODLMM Liquidity Migration Advisor

Scans all HODLMM pools to help LPs decide whether to stay in their current pool or migrate to a better opportunity. Compares fee efficiency, concentration quality, liquidity depth, and TVL across pools, then estimates migration costs and break-even timelines.

## Commands

### `doctor`
Check API connectivity to Bitflow and Hiro endpoints.

### `install-packs`
No additional dependencies — uses workspace `commander` + native `fetch`.

### `run`
Analyze migration opportunities from your current pool.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--pool <id>` | `sbtc-stx` | Current pool ID (numeric) or token pair name |
| `--position <usd>` | `1000` | Position size in USD for cost estimates |
| `--top <n>` | `5` | Number of top alternatives to show |

**Output (JSON):**
```json
{
  "tool": "hodlmm-migration-advisor",
  "currentPool": { "id": 1, "pair": "sBTC-STX", "compositeScore": 62, "estimatedDailyYieldBps": 8.5 },
  "positionUsd": 1000,
  "poolsAnalyzed": 8,
  "rankings": [
    { "rank": 1, "pool": { "pair": "sBTC-STX", "compositeScore": 62 }, "vsCurrentBps": 0 },
    { "rank": 2, "pool": { "pair": "WELSH-STX", "compositeScore": 55 }, "vsCurrentBps": -2.1 }
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

## Cost Estimation

Migration cost includes:
- **Exit slippage**: Based on position size vs current pool TVL
- **Entry slippage**: Based on position size vs target pool TVL
- **Gas**: ~0.5 STX for remove + add liquidity transactions
- **Break-even**: Total cost / daily yield improvement

## Data Sources

- **Bitflow App API**: Pool metadata, TVL, 24h volume, token prices
- **Hiro API / DLMM Contract**: On-chain bin reserves, active bin, bin step
- Falls back gracefully if Hiro read-only sender is blocked (known DLMM issue)

## Known Constraints

- Volume data is 24h trailing — doesn't capture trends or mean-reversion
- On-chain bin sampling uses ±10 bins (not full range) for speed
- Migration cost is estimated, not a live quote — actual slippage may vary
- Single-snapshot analysis — rerun periodically for trend detection
