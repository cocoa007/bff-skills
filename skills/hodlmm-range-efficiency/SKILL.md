---
name: hodlmm-range-efficiency
description: "Range efficiency analyzer for HODLMM — measures how effectively LP bin ranges capture trading activity, identifies over/under-provisioned ranges, and recommends optimal bin widths."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | install-packs | run --pool <id> --depth <n> | scan --top <n> --sort <field>"
  entry: "hodlmm-range-efficiency/hodlmm-range-efficiency.ts"
  requires: ""
  tags: "defi, read-only, mainnet-only, l2, hodlmm, range, efficiency, lp-optimization"
---

# HODLMM Range Efficiency Analyzer

## What it does

Measures how efficiently LP bin ranges capture trading activity in HODLMM pools. Analyzes the relationship between populated bin ranges, active bin position, and reserve concentration to determine whether LP capital is deployed effectively or wasted in distant bins.

## Why agents need it

Concentrated liquidity LPs face a constant tradeoff: wider ranges capture more trades but dilute capital, while narrow ranges concentrate fees but require frequent rebalancing. This skill answers:

- **Range utilization** — what fraction of populated bins are actually earning fees?
- **Capital efficiency** — how much TVL sits in bins too far from the active bin to generate revenue?
- **Range fitness** — is the current bin distribution well-matched to observed price movement?
- **Dead capital detection** — identify bins with reserves that haven't participated in recent trading
- **Width recommendation** — suggest optimal range width based on active bin proximity analysis

Other HODLMM skills analyze flow direction, depth, or volatility. This skill focuses on **whether the LP range itself is well-calibrated**.

## Commands

### `doctor`
Check API connectivity to Bitflow and Hiro endpoints.

### `install-packs`
No additional dependencies — uses workspace `commander` + native `fetch`.

### `run`
Analyze range efficiency for a specific pool.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--pool <id>` | `sbtc-stx` | Pool ID (numeric) or token pair name |
| `--depth <n>` | `30` | Number of bins to analyze around active bin |

**Output (JSON):**
```json
{
  "tool": "hodlmm-range-efficiency",
  "pool": { "id": 1, "pair": "sBTC-STX", "tvlUsd": 250000 },
  "activeBin": { "binId": 8388608, "reserveX": 150000000, "reserveY": 2500000000 },
  "rangeAnalysis": {
    "totalPopulatedBins": 20,
    "activeBins": 8,
    "deadBins": 12,
    "rangeUtilizationPct": 40.0,
    "capitalInActiveBins": 180000,
    "capitalInDeadBins": 70000,
    "capitalEfficiencyPct": 72.0,
    "rangeWidth": 20,
    "optimalRangeWidth": 12,
    "rangeVerdict": "TOO_WIDE",
    "deadCapitalUsd": 70000,
    "concentrationScore": 65,
    "reasoning": "40% of populated bins are earning fees. 28% of capital ($70k) sits in dead bins. Narrowing range from 20 to 12 bins would improve capital efficiency."
  }
}
```

### `scan`
Scan all HODLMM pools for range efficiency.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--top <n>` | `10` | Number of pools to show |
| `--sort <field>` | `efficiency` | Sort by: efficiency, dead-capital, utilization |

## Range Verdicts

| Verdict | Meaning |
|---------|---------|
| **OPTIMAL** | Range well-calibrated — high utilization, minimal dead capital |
| **TOO_WIDE** | Excess bins beyond useful range — capital diluted |
| **TOO_NARROW** | Few populated bins — high rebalancing risk |
| **LOPSIDED** | Populated bins clustered on one side of active bin |
| **FRAGMENTED** | Gaps in the bin range — liquidity holes reduce efficiency |

## Concentration Scoring

| Score | Meaning |
|-------|---------|
| 80–100 | **Excellent** — capital tightly concentrated around active trading zone |
| 60–79 | **Good** — reasonable concentration with some slack |
| 40–59 | **Fair** — significant capital in low-activity bins |
| 0–39 | **Poor** — majority of capital earning no fees |

## Methodology

Since Clarity read-only functions provide bin-level reserve data, this skill:

1. **Maps populated bins** — identifies all bins with non-zero reserves in the analysis range
2. **Classifies bin activity** — bins near the active bin are "active" (likely earning fees), distant bins are "dead"
3. **Calculates capital distribution** — measures USD value in active vs dead bins using token prices
4. **Detects range shape** — symmetric, lopsided, or fragmented distributions
5. **Recommends range width** — based on the concentration of reserves relative to active bin position

## Data Sources

- **Hiro API**: Read-only contract calls to DLMM core for bin data
- **Bitflow App API**: Pool metadata, TVL, token prices
- On-chain bin reserve analysis for range efficiency metrics

## Output contract

All commands output JSON to stdout with `tool: "hodlmm-range-efficiency"`.

| Field | Type | Present |
|-------|------|---------|
| `tool` | `"hodlmm-range-efficiency"` | always |
| `command` | `"doctor" \| "run" \| "scan" \| "install-packs"` | always |
| `timestamp` | ISO 8601 string | always |
| `error` | string | on failure only |
| `pool` | object | `run` only |
| `activeBin` | object | `run` only |
| `rangeAnalysis` | object | `run` / `scan` |
| `topPools` | array | `scan` only |

## Safety notes

- **Read-only**: No transactions, no wallet required
- **Rate limiting**: Bounded bin queries, batched requests
- **No financial advice**: Range efficiency metrics are informational — optimal ranges depend on individual risk tolerance
- **Snapshot-based**: Reflects current state, not historical range performance

## Known Constraints

- Cannot observe historical active bin movement from read-only Clarity — infers from current reserve distribution
- "Active" bin proximity is a heuristic (bins within threshold of active bin)
- LP adds/removes can distort range shape (not purely from trading activity)
- New pools with few bins populated may show misleading efficiency scores
