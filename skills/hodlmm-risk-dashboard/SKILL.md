---
name: hodlmm-risk-dashboard
description: "Multi-factor risk aggregation dashboard for HODLMM pools — combines IL exposure, concentration risk, volatility regime, inventory skew, whale dominance, and liquidity depth into a composite risk score with drill-down analysis."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | install-packs | run --pool <id> | scan --top <n> --min-tvl <usd>"
  entry: "hodlmm-risk-dashboard/hodlmm-risk-dashboard.ts"
  requires: ""
  tags: "defi, read-only, mainnet-only, l2, hodlmm, risk, analytics, dashboard"
---

# HODLMM Risk Dashboard

## What it does

Aggregates six risk dimensions for HODLMM pools into a single composite risk score (0-100) with traffic-light classification. Each dimension is individually scored and weighted to produce an overall risk assessment with drill-down detail.

## Why agents need it

Individual risk metrics in isolation miss the full picture. A pool may look safe on IL but be dangerously concentrated, or have healthy depth but extreme whale dominance:

- **Composite scoring** — single 0-100 risk score aggregating all dimensions
- **Factor decomposition** — see exactly which risk factors are elevated
- **Regime awareness** — different factor weights for different market conditions
- **Cross-pool ranking** — compare risk profiles across all HODLMM pools
- **Alert thresholds** — flag pools where composite risk exceeds safe levels
- **LP decision support** — enter, stay, or exit based on holistic risk

Other HODLMM skills analyze one dimension each. This skill is the **unified risk view**.

## Commands

### `doctor`
Check API connectivity to Bitflow and Hiro endpoints.

### `install-packs`
No additional dependencies — uses workspace `commander` + native `fetch`.

### `run`
Compute full risk dashboard for a specific pool.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--pool <id>` | *(required)* | HODLMM pool ID to analyze |

**Output (JSON):**
```json
{
  "tool": "hodlmm-risk-dashboard",
  "command": "run",
  "poolId": 1,
  "pair": "sBTC-STX",
  "compositeRisk": 42,
  "riskLevel": "MODERATE",
  "factors": {
    "impermanentLoss": { "score": 35, "weight": 0.25, "detail": "Reserve ratio 58:42, IL ~1.2%" },
    "concentration": { "score": 55, "weight": 0.20, "detail": "Gini 0.72, top 3 bins hold 68% TVL" },
    "volatility": { "score": 40, "weight": 0.15, "detail": "Bin spread 8, regime MODERATE" },
    "inventorySkew": { "score": 30, "weight": 0.15, "detail": "Token ratio 55:45, mild buy pressure" },
    "whaleDominance": { "score": 50, "weight": 0.15, "detail": "HHI 0.18, top holder 23% of liquidity" },
    "liquidityDepth": { "score": 25, "weight": 0.10, "detail": "1% slippage at $5200, depth GOOD" }
  },
  "alerts": [
    "Concentration risk elevated — consider diversifying across more bin ranges"
  ],
  "recommendation": "HOLD — moderate risk, no immediate action needed"
}
```

### `scan`
Rank all HODLMM pools by composite risk score.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--top <n>` | `10` | Number of pools to show |
| `--min-tvl <usd>` | `1000` | Minimum pool TVL to consider |

## Risk Factors

### 1. Impermanent Loss (weight: 25%)
Reserve ratio asymmetry as proxy for unrealized IL exposure.

| Score Range | Meaning |
|-------------|---------|
| 0-20 | Balanced reserves, minimal IL |
| 21-50 | Moderate asymmetry |
| 51-80 | Significant IL exposure |
| 81-100 | Severe — one side nearly depleted |

### 2. Concentration Risk (weight: 20%)
Gini coefficient of bin-level reserve distribution.

| Score Range | Meaning |
|-------------|---------|
| 0-30 | Well-distributed liquidity |
| 31-60 | Moderately concentrated |
| 61-80 | Highly concentrated in few bins |
| 81-100 | Extreme — nearly all liquidity in 1-2 bins |

### 3. Volatility (weight: 15%)
Bin spread across active range as proxy for price volatility.

| Score Range | Meaning |
|-------------|---------|
| 0-25 | Low volatility, stable range |
| 26-50 | Normal market conditions |
| 51-75 | Elevated volatility |
| 76-100 | Extreme — wide bin spread, frequent rebalancing needed |

### 4. Inventory Skew (weight: 15%)
Directional pressure from token balance asymmetry.

| Score Range | Meaning |
|-------------|---------|
| 0-25 | Balanced — no directional pressure |
| 26-50 | Mild skew — one token accumulating |
| 51-75 | Significant — may indicate persistent sell pressure |
| 76-100 | Extreme — pool heavily one-sided |

### 5. Whale Dominance (weight: 15%)
HHI-based concentration of liquidity providers.

| Score Range | Meaning |
|-------------|---------|
| 0-25 | Well-distributed LP base |
| 26-50 | Some concentration |
| 51-75 | Whale-dominated — single exit could move market |
| 76-100 | Extreme — one address controls majority |

### 6. Liquidity Depth (weight: 10%)
Slippage estimation for standard trade sizes.

| Score Range | Meaning |
|-------------|---------|
| 0-25 | Deep liquidity, low slippage |
| 26-50 | Adequate for most trades |
| 51-75 | Thin — large trades will move price |
| 76-100 | Very thin — fragile pool |

## Composite Risk Classification

| Score | Level | Color | Meaning |
|-------|-------|-------|---------|
| 0-25 | **LOW** | Green | Safe for most LP strategies |
| 26-50 | **MODERATE** | Yellow | Acceptable with monitoring |
| 51-75 | **HIGH** | Orange | Elevated risk, consider reducing exposure |
| 76-100 | **CRITICAL** | Red | Immediate risk — exit or rebalance |

## Recommendation Logic

| Composite Score | Trend | Recommendation |
|-----------------|-------|----------------|
| 0-25 | Any | ENTER/HOLD — low risk |
| 26-50 | Stable/improving | HOLD — monitor risk factors |
| 26-50 | Deteriorating | REDUCE — proactive de-risk |
| 51-75 | Any | REDUCE — elevated risk |
| 76-100 | Any | EXIT — critical risk level |

## Data Sources

- **Bitflow App API**: Pool metadata, TVL, token prices, fee tiers
- **Hiro API**: Read-only contract calls for bin reserves, active bin, pair parameters
- On-chain data for all six risk dimensions

## Output contract

All commands output JSON to stdout with `tool: "hodlmm-risk-dashboard"`.

| Field | Type | Present |
|-------|------|---------|
| `tool` | `"hodlmm-risk-dashboard"` | always |
| `command` | `"doctor" \| "run" \| "scan" \| "install-packs"` | always |
| `timestamp` | ISO 8601 string | always |
| `error` | string | on failure only |
| `compositeRisk` | number (0-100) | `run` only |
| `riskLevel` | string | `run` only |
| `factors` | object | `run` only |
| `pools` | array | `scan` only |

## Safety notes

- **Read-only**: No transactions, no wallet required
- **Rate limiting**: Sequential contract queries, bounded batch sizes
- **Not financial advice**: Risk scores are heuristic — real risk may differ
- **Snapshot-based**: Risk profile is point-in-time, not predictive
- **Weight sensitivity**: Small weight changes can shift composite score — weights are calibrated for general-purpose use

## Known Constraints

- Whale dominance requires event scanning, which may be slow for high-activity pools
- Volatility proxy uses bin spread, not time-series price data
- IL calculation assumes no fee reinvestment
- Depth estimation uses linear bin walk, not full swap simulation
