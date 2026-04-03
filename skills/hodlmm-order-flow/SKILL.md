---
name: hodlmm-order-flow
description: "Order flow analyzer for HODLMM — detects directional pressure, buy/sell ratios, reserve asymmetry, and flow momentum using bin reserve proxy signals."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | install-packs | run --pool <id> --depth <n> | scan --top <n> --sort <field>"
  entry: "hodlmm-order-flow/hodlmm-order-flow.ts"
  requires: ""
  tags: "defi, read-only, mainnet-only, l2, hodlmm, order-flow, momentum, trading"
---

# HODLMM Order Flow Analyzer

## What it does

Analyzes HODLMM pool bin reserves and active bin positions to detect directional order flow pressure. Since Clarity read-only functions cannot replay historical swap events, this skill uses bin reserve distributions and active bin drift as proxy signals for cumulative order flow.

## Why agents need it

Understanding order flow direction is critical for trading and LP decisions:

- **Directional pressure** — is the market net buying or selling token-x?
- **Reserve asymmetry** — bins skewed toward one token indicate cumulative flow direction
- **Active bin drift** — the active bin's position relative to the bin range center shows directional momentum
- **Flow intensity** — HEAVY_BUY / BUY / NEUTRAL / SELL / HEAVY_SELL scoring for quick decisions
- **Momentum shifts** — detect when flow is reversing before price catches up

Other HODLMM skills analyze liquidity depth, concentration, or pricing. This skill answers: **which direction is the flow going?**

## Commands

### `doctor`
Check API connectivity to Bitflow and Hiro endpoints.

### `install-packs`
No additional dependencies — uses workspace `commander` + native `fetch`.

### `run`
Analyze order flow for a specific pool.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--pool <id>` | `sbtc-stx` | Pool ID (numeric) or token pair name |
| `--depth <n>` | `20` | Number of bins to analyze around active bin |

**Output (JSON):**
```json
{
  "tool": "hodlmm-order-flow",
  "pool": { "id": 1, "pair": "sBTC-STX", "tvlUsd": 250000 },
  "activeBin": {
    "binId": 8388608,
    "reserveX": 150000000,
    "reserveY": 2500000000,
    "xDominancePct": 37.5
  },
  "flowAnalysis": {
    "reserveAsymmetry": -0.25,
    "activeBinDrift": 0.15,
    "buyPressurePct": 62.5,
    "sellPressurePct": 37.5,
    "flowScore": 35,
    "flowDirection": "BUY",
    "momentum": "ACCELERATING",
    "reasoning": "Reserve asymmetry shows net buying pressure. Active bin drifted above center, consistent with demand for token-x."
  },
  "binDistribution": {
    "binsAnalyzed": 20,
    "binsWithReserves": 15,
    "avgXReserve": 100000000,
    "avgYReserve": 2000000000,
    "xHeavyBins": 8,
    "yHeavyBins": 5,
    "balancedBins": 2
  }
}
```

### `scan`
Scan all HODLMM pools for order flow signals.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--top <n>` | `10` | Number of pools to show |
| `--sort <field>` | `flow-score` | Sort by: flow-score, buy-pressure, asymmetry |

## Flow Scoring

| Score Range | Direction | Meaning |
|-------------|-----------|---------|
| 60 to 100 | **HEAVY_BUY** | Strong net buying pressure — reserves heavily skewed toward token-y depletion |
| 20 to 59 | **BUY** | Moderate buying pressure — asymmetry favors token-x demand |
| -19 to 19 | **NEUTRAL** | Balanced flow — no clear directional bias |
| -59 to -20 | **SELL** | Moderate selling pressure — reserves skewed toward token-x accumulation |
| -100 to -60 | **HEAVY_SELL** | Strong net selling pressure — heavy token-x dumping |

## Momentum Classification

| Momentum | Meaning |
|----------|---------|
| **ACCELERATING** | Flow score magnitude increasing — trend strengthening |
| **STEADY** | Flow score stable — consistent directional pressure |
| **DECELERATING** | Flow score magnitude decreasing — trend weakening |
| **REVERSING** | Active bin drift opposes reserve asymmetry — possible reversal |

## Proxy Methodology

Since Clarity read-only functions cannot replay historical events, this skill infers order flow from:

1. **Bin reserve asymmetry** — if bins above the active bin are depleted of token-y, buyers have been sweeping asks
2. **Active bin position** — drift from the center of the populated bin range indicates cumulative price pressure
3. **Reserve concentration** — bins with lopsided reserves reveal where flow has been most active
4. **X/Y dominance ratio** — the balance of token-x vs token-y across all analyzed bins

## Data Sources

- **Hiro API**: Read-only contract calls to DLMM core for bin data
- **Bitflow App API**: Pool metadata, TVL, token prices
- On-chain bin reserve analysis for flow inference

## Output contract

All commands output JSON to stdout with `tool: "hodlmm-order-flow"`.

| Field | Type | Present |
|-------|------|---------|
| `tool` | `"hodlmm-order-flow"` | always |
| `command` | `"doctor" \| "run" \| "scan" \| "install-packs"` | always |
| `timestamp` | ISO 8601 string | always |
| `error` | string | on failure only |
| `pool` | object | `run` only |
| `activeBin` | object | `run` only |
| `flowAnalysis` | object | `run` / `scan` |
| `binDistribution` | object | `run` only |
| `topPools` | array | `scan` only |

## Safety notes

- **Read-only**: No transactions, no wallet required
- **Rate limiting**: Bounded bin queries, batched requests
- **No financial advice**: Flow signals are informational — markets can reverse at any time
- **Proxy signals**: These are inferred from static snapshots, not actual trade-by-trade flow

## Known Constraints

- Cannot observe individual swap events from read-only Clarity — uses bin reserve proxy
- Snapshot-based: reflects cumulative flow, not real-time tick-by-tick data
- LP adds/removes can distort reserve signals (not purely from swaps)
- New pools with few bins populated may show noise rather than signal
