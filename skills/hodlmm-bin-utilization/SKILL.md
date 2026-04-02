---
name: hodlmm-bin-utilization
description: "Capital utilization efficiency monitor for HODLMM pools — active vs idle liquidity, effective TVL, dead capital detection."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | install-packs | run --pool <id> --radius <n> | scan --top <n> --sort <field>"
  entry: "hodlmm-bin-utilization/hodlmm-bin-utilization.ts"
  requires: ""
  tags: "defi, read-only, mainnet-only, l2, hodlmm, utilization"
---

# HODLMM Bin Utilization Monitor

Monitors capital utilization efficiency across HODLMM pools by analyzing how much deployed liquidity is actually within the active trading range. Identifies "dead capital" sitting in out-of-range bins, calculates effective TVL (capital that's earning fees), and scores overall capital efficiency to help LPs optimize their deployments.

## Commands

### `doctor`
Check API connectivity to Bitflow and Hiro endpoints.

### `install-packs`
No additional dependencies — uses workspace `commander` + native `fetch`.

### `run`
Analyze bin utilization for a specific pool.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--pool <id>` | `sbtc-stx` | Pool ID (numeric) or token pair name |
| `--radius <n>` | `10` | Number of bins around active bin to consider "in range" |

**Output (JSON):**
```json
{
  "tool": "hodlmm-bin-utilization",
  "pool": { "id": 1, "pair": "sBTC-STX", "tvlUsd": 250000, "activeBinId": 8388608 },
  "utilization": {
    "totalBinsWithLiquidity": 45,
    "activeBins": 21,
    "idleBins": 24,
    "activeLiquidityUsd": 180000,
    "idleLiquidityUsd": 70000,
    "effectiveTvlPct": 72.0,
    "capitalEfficiencyScore": 68
  },
  "concentration": {
    "giniCoefficient": 0.42,
    "top5BinsPct": 38.5,
    "profile": "MODERATE"
  },
  "deadCapital": {
    "totalIdleUsd": 70000,
    "farOutOfRange": 15000,
    "recommendation": "REBALANCE",
    "reasoning": "28% of TVL in idle bins. 6% far out of range (>20 bins from active)."
  },
  "signal": "MODERATE_EFFICIENCY",
  "reasoning": ["72% of TVL is actively earning fees.", "Gini 0.42 — moderate concentration."]
}
```

### `scan`
Scan all HODLMM pools for capital efficiency.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--top <n>` | `10` | Number of pools to show |
| `--sort <field>` | `efficiency` | Sort by: efficiency, idle, tvl |

## Utilization Classification

| Level | Effective TVL % | Meaning |
|-------|----------------|---------|
| **HIGH_EFFICIENCY** | > 80% | Most capital is earning fees |
| **MODERATE_EFFICIENCY** | 50–80% | Significant idle capital |
| **LOW_EFFICIENCY** | < 50% | Most capital is out of range |

## Capital Efficiency Score (0–100)

Weighted composite:

| Signal | Weight | High Score Indicator |
|--------|--------|---------------------|
| Effective TVL ratio | 45% | High % of TVL in active range |
| Concentration profile | 25% | Moderate Gini (0.3–0.5) — balanced |
| Active bin proximity | 20% | Liquidity clustered near active bin |
| Bin count efficiency | 10% | Not overly spread across bins |

## Concentration Profiles

| Profile | Gini | Meaning |
|---------|------|---------|
| **CONCENTRATED** | > 0.6 | Few bins hold most liquidity — high risk |
| **MODERATE** | 0.3–0.6 | Balanced spread — healthy |
| **DISPERSED** | < 0.3 | Liquidity too spread out — low efficiency |

## Rebalance Recommendations

| Signal | Condition | LP Action |
|--------|-----------|-----------|
| **HOLD** | Efficiency > 80%, low idle | Capital is well-deployed |
| **TIGHTEN** | Efficiency 50–80%, dispersed | Concentrate closer to active bin |
| **REBALANCE** | Efficiency < 50% or high idle | Move capital to active range |
| **URGENT** | Far-out-of-range > 20% of TVL | Immediate rebalance needed |

## Data Sources

- **Hiro API**: Read-only contract calls to `get-bin` for reserve data
- **Bitflow App API**: Pool metadata, TVL, active bin ID, token prices
- On-chain bin scanning from active bin outward

## Known Constraints

- Bin scanning is bounded by radius to avoid excessive API calls
- USD estimates use current token prices
- Active bin may shift between scan start and end
- Pools with very wide bin ranges may exceed scan radius
