---
name: hodlmm-inventory-skew
description: "Token balance asymmetry monitor for HODLMM pools — directional pressure detection, inventory risk scoring, depletion warnings."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | install-packs | run --pool <id> --radius <n> | scan --top <n> --sort <field>"
  entry: "hodlmm-inventory-skew/hodlmm-inventory-skew.ts"
  requires: ""
  tags: "defi, read-only, mainnet-only, l2, hodlmm, inventory"
---

# HODLMM Inventory Skew Monitor

## What it does

Measures token balance asymmetry across HODLMM pool bins to detect directional pressure and inventory risk. Scans on-chain bin reserves around the active trading bin, calculates the ratio of token X to token Y in USD terms, identifies which side of the order book is heavier, and scores inventory risk for LPs.

## Why agents need it

In concentrated liquidity pools, price movement causes LPs to accumulate the depreciating token and lose the appreciating one. This creates inventory skew — a measurable signal of:

- **Directional pressure** — which way the market has been trading through the pool
- **Inventory risk** — how much one-sided exposure LPs currently hold
- **Depletion warnings** — when one token is nearly exhausted, the pool may fail to fill orders
- **Entry timing** — entering when skew is extreme means taking on maximum directional risk

Other HODLMM skills track volume, fees, and bin utilization. This skill tracks the *composition* of what's in those bins — the token mix that determines LP P&L.

## Commands

### `doctor`
Check API connectivity to Bitflow and Hiro endpoints.

### `install-packs`
No additional dependencies — uses workspace `commander` + native `fetch`.

### `run`
Analyze inventory skew for a specific pool.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--pool <id>` | `sbtc-stx` | Pool ID (numeric) or token pair name |
| `--radius <n>` | `10` | Number of bins around active bin to scan |

**Output (JSON):**
```json
{
  "tool": "hodlmm-inventory-skew",
  "pool": { "id": 1, "pair": "sBTC-STX", "tvlUsd": 250000, "activeBinId": 8388608 },
  "skew": {
    "overallSkewRatio": 0.72,
    "direction": "TOKEN_X_HEAVY",
    "severity": "MODERATE",
    "tokenXPct": 72.0,
    "tokenYPct": 28.0,
    "tokenXUsd": 180000,
    "tokenYUsd": 70000
  },
  "pressure": {
    "signal": "BUY_Y",
    "leftSkew": 0.45,
    "rightSkew": 0.68,
    "asymmetry": 0.23,
    "reasoning": "Moderate token X accumulation above active bin."
  },
  "inventoryRisk": {
    "riskScore": 44,
    "level": "MODERATE",
    "singleTokenExposure": 72.0,
    "depletionWarning": false,
    "reasoning": "Pool shows moderate sBTC tilt (72%). Normal for directional markets."
  },
  "zones": [
    { "zone": "inner", "bins": 21, "skewRatio": 0.65, "dominantToken": "sBTC", "totalUsd": 200000 },
    { "zone": "left_outer", "bins": 8, "skewRatio": 0.35, "dominantToken": "STX", "totalUsd": 30000 },
    { "zone": "right_outer", "bins": 6, "skewRatio": 0.85, "dominantToken": "sBTC", "totalUsd": 20000 }
  ],
  "reasoning": ["Pool is 72% sBTC / 28% STX (MODERATE skew).", "Directional pressure: BUY_Y."]
}
```

### `scan`
Scan all HODLMM pools for inventory skew.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--top <n>` | `10` | Number of pools to show |
| `--sort <field>` | `skew` | Sort by: skew, risk, tvl |

## Skew Classification

| Severity | Dominant Token % | Meaning |
|----------|-----------------|---------|
| **EXTREME** | > 90% | Nearly single-token pool — maximum directional risk |
| **HEAVY** | 75–90% | Significant imbalance — strong directional pressure |
| **MODERATE** | 60–75% | Notable tilt — directional market in progress |
| **BALANCED** | < 60% | Near 50/50 — minimal inventory risk |

## Directional Pressure Signals

| Signal | Asymmetry | Meaning |
|--------|-----------|---------|
| **STRONG_BUY_X** | < -0.30 | Heavy Y reserves below active — strong X buy pressure |
| **BUY_X** | -0.30 to -0.15 | Moderate Y below active — some X buy pressure |
| **NEUTRAL** | -0.15 to +0.15 | Symmetric reserve distribution |
| **BUY_Y** | +0.15 to +0.30 | Moderate X above active — some Y buy pressure |
| **STRONG_BUY_Y** | > +0.30 | Heavy X reserves above active — strong Y buy pressure |

## Inventory Risk Scoring (0–100)

Simple imbalance measure: `|skewRatio - 0.5| * 200`

| Level | Score | Meaning |
|-------|-------|---------|
| **LOW** | 0–19 | Near-balanced, minimal risk |
| **MODERATE** | 20–49 | Notable tilt, normal for trending markets |
| **HIGH** | 50–79 | Significant single-token exposure |
| **CRITICAL** | 80–100 | Severe imbalance, near-depletion risk |

## Zone Analysis

Bins are grouped into three zones relative to the active bin:

| Zone | Description |
|------|-------------|
| **inner** | Within radius of active bin — earning fees |
| **left_outer** | Below active minus radius — buy-side reserves |
| **right_outer** | Above active plus radius — sell-side reserves |

Comparing skew across zones reveals where directional pressure is concentrated.

## Data Sources

- **Hiro API**: Read-only contract calls to `get-bin` for reserve data
- **Bitflow App API**: Pool metadata, TVL, active bin ID, token prices
- On-chain bin scanning from active bin outward

## Output contract

All commands output JSON to stdout with `tool: "hodlmm-inventory-skew"`.

| Field | Type | Present |
|-------|------|---------|
| `tool` | `"hodlmm-inventory-skew"` | always |
| `command` | `"doctor" \| "run" \| "scan" \| "install-packs"` | always |
| `timestamp` | ISO 8601 string | always |
| `error` | string | on failure only |
| `pool` | object | `run` only |
| `skew` | object | `run` only |
| `pressure` | object | `run` only |
| `inventoryRisk` | object | `run` only |
| `zones` | array | `run` only |
| `topPools` | array | `scan` only |
| `summary` | object | `scan` only |

## Safety notes

- **Read-only**: No transactions, no wallet required
- **Rate limiting**: Bin scanning bounded by radius with batched requests (5 concurrent)
- **No financial advice**: Skew analysis is informational — does not constitute trading signals
- **Stale data**: USD estimates use current token prices. Active bin may shift during scan

## Known Constraints

- Skew is measured in USD terms using current spot prices
- Does not track individual LP positions — only aggregate bin reserves
- Historical skew trends require running the skill multiple times over time
- Pools with very low TVL may show noisy skew readings
