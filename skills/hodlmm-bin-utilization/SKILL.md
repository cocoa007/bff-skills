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

## What it does

Monitors capital utilization efficiency across HODLMM pools by scanning on-chain bin reserves around the active trading bin. Measures what percentage of deployed liquidity is actively earning fees vs sitting idle in out-of-range bins. Calculates effective TVL, detects "dead capital," scores capital efficiency (0–100), and recommends HOLD/TIGHTEN/REBALANCE/URGENT actions.

## Why agents need it

HODLMM concentrated liquidity positions can drift out of range as prices move, leaving capital idle and earning zero fees. Agents need to detect this capital inefficiency to:

- **Optimize LP returns** — know when to tighten or rebalance positions
- **Compare pools** — find which pools have the most efficient capital deployment
- **Avoid dead capital** — alert when a significant portion of TVL is far out of range
- **Complement other skills** — `hodlmm-entry-optimizer` says *where* to deploy, this skill says *how efficiently* capital is currently deployed

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

## Output contract

All commands output JSON to stdout with `tool: "hodlmm-bin-utilization"`.

| Field | Type | Present |
|-------|------|---------|
| `tool` | `"hodlmm-bin-utilization"` | always |
| `command` | `"doctor" \| "run" \| "scan" \| "install-packs"` | always |
| `timestamp` | ISO 8601 string | always |
| `error` | string | on failure only |
| `pool` | object | `run` only |
| `utilization` | object | `run` only |
| `concentration` | object | `run` only |
| `deadCapital` | object | `run` only |
| `signal` | string | `run` only |
| `topPools` | array | `scan` only |
| `summary` | object | `scan` only |

## Safety notes

- **Read-only**: This skill makes no transactions and requires no wallet. All data comes from read-only contract calls and public APIs.
- **Rate limiting**: Bin scanning is bounded by radius (default 10, scans radius*2 bins) with batched concurrent requests (5 at a time) to avoid overwhelming Hiro API.
- **No financial advice**: Efficiency scores and recommendations are informational. They do not constitute investment advice.
- **Stale data**: USD estimates use current token prices. Active bin may shift between scan start and end.

## Known Constraints

- Bin scanning is bounded by radius to avoid excessive API calls
- USD estimates use current token prices
- Active bin may shift between scan start and end
- Pools with very wide bin ranges may exceed scan radius
