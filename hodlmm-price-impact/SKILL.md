---
name: hodlmm-price-impact
description: "Trade execution cost simulator for HODLMM pools — slippage estimation, bin walk-through, optimal trade sizing."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | install-packs | run --pool <id> --amount <usd> --direction <buy|sell> | ladder --pool <id> --sizes <list>"
  entry: "hodlmm-price-impact/hodlmm-price-impact.ts"
  requires: ""
  tags: "defi, read-only, mainnet-only, l2, hodlmm, execution"
---

# HODLMM Price Impact Simulator

## What it does

Simulates trade execution through HODLMM concentrated liquidity bins to estimate price impact and slippage before executing. Walks through on-chain bin reserves sequentially (as the AMM would during a real swap), calculating the effective execution price, total slippage cost, bins consumed, and marginal impact. Supports trade laddering to find the optimal trade size before impact becomes excessive.

## Why agents need it

HODLMM pools concentrate liquidity in discrete bins. Large trades can consume multiple bins, causing significant slippage that isn't visible from the spot price alone. Agents need this to:

- **Estimate execution cost** — know the true cost of a swap before submitting
- **Optimize trade sizing** — find the largest trade that stays within acceptable slippage
- **Detect thin liquidity** — identify pools where even small trades cause high impact
- **Compare execution quality** — which pool offers best execution for a given trade size
- **Complement Market Depth** — depth shows available liquidity, this shows execution cost

## Commands

### `doctor`
Check API connectivity to Bitflow and Hiro endpoints.

### `install-packs`
No additional dependencies — uses workspace `commander` + native `fetch`.

### `run`
Simulate a single trade and calculate price impact.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--pool <id>` | `sbtc-stx` | Pool ID (numeric) or token pair name |
| `--amount <usd>` | `1000` | Trade size in USD |
| `--direction <dir>` | `buy` | Trade direction: `buy` (token0→token1) or `sell` (token1→token0) |

**Output (JSON):**
```json
{
  "tool": "hodlmm-price-impact",
  "command": "run",
  "pool": { "id": 1, "pair": "sBTC-STX", "activeBinId": 8388608, "spotPrice": 2500.0 },
  "trade": {
    "inputAmountUsd": 1000,
    "direction": "buy",
    "outputAmountUsd": 995.20,
    "effectivePrice": 2512.0,
    "spotPrice": 2500.0,
    "slippagePct": 0.48,
    "slippageCostUsd": 4.80,
    "binsConsumed": 3,
    "marginalImpactPct": 0.22
  },
  "classification": "LOW_IMPACT",
  "reasoning": ["Trade consumes 3 bins with 0.48% slippage.", "Marginal impact 0.22% — room for larger trades."]
}
```

### `ladder`
Simulate multiple trade sizes to find optimal execution.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--pool <id>` | `sbtc-stx` | Pool ID (numeric) or token pair name |
| `--sizes <list>` | `100,500,1000,5000,10000` | Comma-separated USD amounts |

**Output (JSON):**
```json
{
  "tool": "hodlmm-price-impact",
  "command": "ladder",
  "pool": { "pair": "sBTC-STX" },
  "ladder": [
    { "amountUsd": 100, "slippagePct": 0.01, "binsConsumed": 1, "classification": "NEGLIGIBLE" },
    { "amountUsd": 1000, "slippagePct": 0.48, "binsConsumed": 3, "classification": "LOW_IMPACT" },
    { "amountUsd": 10000, "slippagePct": 3.20, "binsConsumed": 12, "classification": "HIGH_IMPACT" }
  ],
  "optimalSize": { "maxUsdAt1Pct": 2100, "maxUsdAt2Pct": 5800 },
  "summary": "Pool absorbs up to $2,100 with <1% slippage. Impact accelerates beyond $5,000."
}
```

## Impact Classification

| Level | Slippage % | Meaning |
|-------|-----------|---------|
| **NEGLIGIBLE** | < 0.1% | Essentially zero impact |
| **LOW_IMPACT** | 0.1–1.0% | Acceptable for most trades |
| **MODERATE_IMPACT** | 1.0–3.0% | Consider splitting the trade |
| **HIGH_IMPACT** | > 3.0% | Trade is too large for this pool |

## Price Impact Score (0–100)

Lower is better (lower impact = better execution).

| Signal | Weight | Low Score Indicator |
|--------|--------|---------------------|
| Slippage percentage | 50% | Low slippage |
| Bins consumed ratio | 25% | Few bins consumed relative to available |
| Marginal impact curve | 25% | Flat marginal cost (deep liquidity) |

## Data Sources

- **Hiro API**: Read-only contract calls to `get-bin` for reserve data, `get-active-bin-id` for current price
- **Bitflow App API**: Pool metadata, TVL, token decimals, token prices
- On-chain sequential bin walking from active bin

## Output contract

All commands output JSON to stdout with `tool: "hodlmm-price-impact"`.

| Field | Type | Present |
|-------|------|---------|
| `tool` | `"hodlmm-price-impact"` | always |
| `command` | `"doctor" \| "run" \| "ladder" \| "install-packs"` | always |
| `timestamp` | ISO 8601 string | always |
| `error` | string | on failure only |
| `pool` | object | `run`/`ladder` |
| `trade` | object | `run` only |
| `classification` | string | `run` only |
| `ladder` | array | `ladder` only |
| `optimalSize` | object | `ladder` only |

## Safety notes

- **Read-only**: This skill makes no transactions and requires no wallet. All data comes from read-only contract calls and public APIs.
- **Rate limiting**: Bin walking is bounded by available liquidity — stops when trade is filled or max 50 bins. Batched concurrent requests (5 at a time).
- **No financial advice**: Slippage estimates are simulations based on current on-chain state. Actual execution may differ due to concurrent transactions.
- **Stale data**: Bin reserves can change between simulation and execution. Active bin may shift.

## Known Constraints

- Simulation assumes no concurrent trades (on-chain state is a snapshot)
- Does not account for swap fees (separate from price impact)
- Bin step size varies per pool — impact curve shape differs
- Very large trades may exceed scan range (capped at 50 bins)
