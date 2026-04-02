---
name: hodlmm-stress-test
description: "Pool stress tester for HODLMM — simulates escalating trade sizes to find liquidity breaking points, exhaustion thresholds, and fragility scores."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | install-packs | run --pool <id> --max-usd <n> --steps <n> | scan --top <n> --sort <field>"
  entry: "hodlmm-stress-test/hodlmm-stress-test.ts"
  requires: ""
  tags: "defi, read-only, mainnet-only, l2, hodlmm, stress-test, risk"
---

# HODLMM Pool Stress Test

## What it does

Simulates progressively larger trades against HODLMM pool reserves to find the breaking point — where slippage becomes extreme, liquidity exhausts, or bins empty out. Produces a fragility score and identifies the maximum safe trade size for each pool.

## Why agents need it

Price impact tools tell you what a *specific* trade costs. Stress testing answers a different question: **how much punishment can this pool take?** This matters when:

- **Risk assessment** — how resilient is the pool to a whale dump or panic exit?
- **LP confidence** — will the pool maintain orderly pricing under stress?
- **Trade planning** — what's the absolute maximum size before catastrophic slippage?
- **Pool comparison** — which pools can absorb the most volume without breaking?
- **Black swan preparation** — what happens if there's a 10x normal volume day?

Other HODLMM skills measure current state. This skill measures *capacity under pressure*.

## Commands

### `doctor`
Check API connectivity to Bitflow and Hiro endpoints.

### `install-packs`
No additional dependencies — uses workspace `commander` + native `fetch`.

### `run`
Stress test a specific pool with escalating trade sizes.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--pool <id>` | `sbtc-stx` | Pool ID (numeric) or token pair name |
| `--max-usd <n>` | `100000` | Maximum trade size to simulate (USD) |
| `--steps <n>` | `20` | Number of escalation steps |

**Output (JSON):**
```json
{
  "tool": "hodlmm-stress-test",
  "pool": { "id": 1, "pair": "sBTC-STX", "tvlUsd": 250000, "activeBinId": 8388608 },
  "stressProfile": [
    { "tradeSizeUsd": 500, "slippageBps": 5, "binsConsumed": 1, "reserveDepletionPct": 0.2, "verdict": "SAFE" },
    { "tradeSizeUsd": 5000, "slippageBps": 45, "binsConsumed": 4, "reserveDepletionPct": 3.1, "verdict": "SAFE" },
    { "tradeSizeUsd": 50000, "slippageBps": 320, "binsConsumed": 12, "reserveDepletionPct": 42, "verdict": "DANGER" },
    { "tradeSizeUsd": 100000, "slippageBps": 950, "binsConsumed": 15, "reserveDepletionPct": 95, "verdict": "BREAKING" }
  ],
  "thresholds": {
    "safeLimitUsd": 12000,
    "dangerLimitUsd": 35000,
    "breakingPointUsd": 85000,
    "totalAbsorbableUsd": 95000
  },
  "fragility": {
    "score": 35,
    "grade": "MODERATE",
    "reasoning": "Pool can absorb ~$12k safely but deteriorates rapidly above $35k. Breaking point at $85k."
  },
  "reasoning": ["Safe trading up to $12,000 (slippage < 50 bps).", "Liquidity wall at bin 8388612 provides buffer."]
}
```

### `scan`
Stress test all HODLMM pools and rank by resilience.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--top <n>` | `10` | Number of pools to show |
| `--sort <field>` | `resilience` | Sort by: resilience, safe-limit, tvl |

## Fragility Scoring (0–100)

Higher score = more fragile (worse). Based on:
- Safe limit relative to TVL (lower ratio = more fragile)
- Steepness of slippage curve (steeper = more fragile)
- Reserve concentration (highly concentrated = more fragile under directional pressure)
- Gap between safe limit and breaking point (narrow gap = brittle)

| Grade | Score | Meaning |
|-------|-------|---------|
| **RESILIENT** | 0–20 | Deep, distributed liquidity — absorbs large trades |
| **STURDY** | 21–40 | Good capacity with gradual degradation |
| **MODERATE** | 41–60 | Adequate for normal volume, risky for whales |
| **FRAGILE** | 61–80 | Thin liquidity, rapid slippage escalation |
| **BRITTLE** | 81–100 | Very low capacity, breaks under moderate stress |

## Verdict Thresholds

| Verdict | Slippage | Meaning |
|---------|----------|---------|
| **SAFE** | < 50 bps | Normal execution, acceptable cost |
| **CAUTION** | 50–200 bps | Elevated cost, consider splitting trade |
| **DANGER** | 200–500 bps | High slippage, significant value leakage |
| **BREAKING** | > 500 bps | Pool structurally unable to handle this size |

## Data Sources

- **Hiro API**: Read-only contract calls to `get-bin` for reserve data
- **Bitflow App API**: Pool metadata, TVL, active bin ID, token prices
- On-chain bin scanning with extended radius for stress testing

## Output contract

All commands output JSON to stdout with `tool: "hodlmm-stress-test"`.

| Field | Type | Present |
|-------|------|---------|
| `tool` | `"hodlmm-stress-test"` | always |
| `command` | `"doctor" \| "run" \| "scan" \| "install-packs"` | always |
| `timestamp` | ISO 8601 string | always |
| `error` | string | on failure only |
| `pool` | object | `run` only |
| `stressProfile` | array | `run` only |
| `thresholds` | object | `run` only |
| `fragility` | object | `run` / `scan` |
| `topPools` | array | `scan` only |
| `summary` | object | `scan` only |

## Safety notes

- **Read-only**: No transactions, no wallet required
- **Rate limiting**: Extended bin scanning bounded by configurable radius, batched requests (5 concurrent)
- **No financial advice**: Stress test results are informational — pool conditions change continuously
- **Stale data**: Reserves may shift during scan, especially for active pools

## Known Constraints

- Simulates one-sided pressure only (buy OR sell), not simultaneous
- Does not model arbitrageur rebalancing that would occur during real stress
- Fee accrual during trade not modeled (conservative estimate)
- Very low TVL pools will show artificially low breaking points
