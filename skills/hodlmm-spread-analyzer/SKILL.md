---
name: hodlmm-spread-analyzer
description: "Bid-ask spread analyzer for HODLMM pools — effective spread measurement, spread cost per trade size, tightness scoring."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | install-packs | run --pool <id> --sizes <csv> | scan --top <n> --sort <field>"
  entry: "hodlmm-spread-analyzer/hodlmm-spread-analyzer.ts"
  requires: ""
  tags: "defi, read-only, mainnet-only, l2, hodlmm, spread, trading"
---

# HODLMM Spread Analyzer

## What it does

Measures the effective bid-ask spread in HODLMM concentrated liquidity pools by analyzing reserve distribution around the active trading bin. Calculates spread cost for different trade sizes, compares spread to pool fees, and scores overall spread tightness — helping traders and LPs understand execution quality.

## Why agents need it

In concentrated liquidity AMMs, the "spread" isn't a single number like on an order book exchange. It emerges from how reserves are distributed across bins near the active price. This skill reveals:

- **Effective spread** — the real cost of a round-trip trade beyond fees, derived from bin reserve asymmetry
- **Size-dependent spread** — how spread widens as trade size increases (market impact)
- **Spread vs fee ratio** — whether the pool's fee tier adequately compensates LPs for the spread risk
- **Tightness scoring** — a 0-100 score for how efficiently the pool converts liquidity into tight quotes
- **Gap detection** — empty bins near the active price that create sudden price jumps

Other HODLMM skills track volume, fees, utilization, and skew. This skill measures the *execution quality* — what traders actually pay to trade through the pool, and whether LPs are being adequately compensated.

## Commands

### `doctor`
Check API connectivity to Bitflow and Hiro endpoints.

### `install-packs`
No additional dependencies — uses workspace `commander` + native `fetch`.

### `run`
Analyze spread for a specific pool.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--pool <id>` | `sbtc-stx` | Pool ID (numeric) or token pair name |
| `--sizes <csv>` | `100,500,1000,5000` | Trade sizes in USD to analyze spread impact |

**Output (JSON):**
```json
{
  "tool": "hodlmm-spread-analyzer",
  "pool": { "id": 1, "pair": "sBTC-STX", "tvlUsd": 250000, "activeBinId": 8388608, "feeRateBps": 30 },
  "spread": {
    "effectiveSpreadBps": 12.5,
    "bidReservesUsd": 120000,
    "askReservesUsd": 130000,
    "midPriceBinId": 8388608,
    "tightestBidBin": 8388607,
    "tightestAskBin": 8388609
  },
  "sizeImpact": [
    { "tradeSizeUsd": 100, "spreadBps": 8.2, "spreadCostUsd": 0.08, "binsConsumed": 1 },
    { "tradeSizeUsd": 1000, "spreadBps": 15.4, "spreadCostUsd": 0.15, "binsConsumed": 2 },
    { "tradeSizeUsd": 5000, "spreadBps": 42.1, "spreadCostUsd": 2.10, "binsConsumed": 5 }
  ],
  "quality": {
    "tightnessScore": 72,
    "grade": "GOOD",
    "spreadToFeeRatio": 0.42,
    "emptyBinGaps": 0,
    "depthBalance": 0.92,
    "reasoning": "Tight spread relative to fee tier. Well-balanced bid/ask depth."
  },
  "gaps": [],
  "reasoning": ["Effective spread 12.5 bps on 42% of 30 bps fee.", "No empty bin gaps near active price."]
}
```

### `scan`
Scan all HODLMM pools for spread quality.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--top <n>` | `10` | Number of pools to show |
| `--sort <field>` | `spread` | Sort by: spread, tightness, tvl |

## Tightness Scoring (0–100)

Composite score based on:
- Effective spread relative to fee tier (lower = tighter)
- Bid/ask depth balance (closer to 1:1 = better)
- Empty bin gaps (fewer = better)
- Depth concentration near active bin (more = better)

| Grade | Score | Meaning |
|-------|-------|---------|
| **EXCELLENT** | 80–100 | Very tight spread, deep balanced liquidity |
| **GOOD** | 60–79 | Competitive spread, adequate depth |
| **FAIR** | 40–59 | Moderate spread widening, some gaps possible |
| **POOR** | 20–39 | Wide spread, thin or imbalanced liquidity |
| **ILLIQUID** | 0–19 | Very wide spread, significant gaps, avoid large trades |

## Spread vs Fee Analysis

| Ratio | Interpretation |
|-------|---------------|
| < 0.3 | LPs well-compensated — fees exceed spread cost |
| 0.3–0.7 | Fair balance between execution cost and LP compensation |
| 0.7–1.0 | Spread approaching fee level — thin LP margin |
| > 1.0 | Spread exceeds fee — LPs losing money on spread alone |

## Data Sources

- **Hiro API**: Read-only contract calls to `get-bin` for reserve data
- **Bitflow App API**: Pool metadata, TVL, active bin ID, token prices, fee rates
- On-chain bin scanning from active bin outward

## Output contract

All commands output JSON to stdout with `tool: "hodlmm-spread-analyzer"`.

| Field | Type | Present |
|-------|------|---------|
| `tool` | `"hodlmm-spread-analyzer"` | always |
| `command` | `"doctor" \| "run" \| "scan" \| "install-packs"` | always |
| `timestamp` | ISO 8601 string | always |
| `error` | string | on failure only |
| `pool` | object | `run` only |
| `spread` | object | `run` only |
| `sizeImpact` | array | `run` only |
| `quality` | object | `run` only |
| `gaps` | array | `run` only |
| `topPools` | array | `scan` only |
| `summary` | object | `scan` only |

## Safety notes

- **Read-only**: No transactions, no wallet required
- **Rate limiting**: Bin scanning bounded by radius with batched requests (5 concurrent)
- **No financial advice**: Spread analysis is informational — does not constitute trading signals
- **Stale data**: Active bin may shift during scan, affecting spread measurement

## Known Constraints

- Spread is estimated from bin reserve distribution, not actual order matching
- Does not account for MEV or frontrunning
- Fee rates are fetched from pool metadata, not verified on-chain
- Very low TVL pools will show noisy spread measurements
