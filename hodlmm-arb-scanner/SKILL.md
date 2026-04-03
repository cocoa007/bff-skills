---
name: hodlmm-arb-scanner
description: "Cross-pool arbitrage scanner for HODLMM — detects price discrepancies between pools sharing tokens, estimates profit after fees, ranks opportunities by edge size."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | install-packs | run --token <symbol> --min-edge <bps> | scan --top <n> --min-tvl <usd>"
  entry: "hodlmm-arb-scanner/hodlmm-arb-scanner.ts"
  requires: ""
  tags: "defi, read-only, mainnet-only, l2, hodlmm, arbitrage, pricing, trading"
---

# HODLMM Arbitrage Scanner

## What it does

Scans HODLMM pools to find price discrepancies for the same token across different trading pairs. Computes implied cross-rates, estimates arbitrage profit after swap fees, and ranks opportunities by edge size in basis points.

## Why agents need it

Price discrepancies between AMM pools create risk-free profit opportunities and indicate market inefficiency:

- **Cross-rate mismatches** — pool A prices token-x at $X via STX, pool B implies a different price via sBTC routing
- **Fee-adjusted edges** — raw price difference minus swap fees on both legs = net arbitrage profit
- **Staleness detection** — large edges often signal stale pools with low activity
- **Routing intelligence** — find cheaper paths for large swaps by comparing implied rates
- **Market health** — persistent edges indicate fragmented or thin liquidity

Other HODLMM skills analyze individual pools. This skill compares **across** pools.

## Commands

### `doctor`
Check API connectivity to Bitflow and Hiro endpoints.

### `install-packs`
No additional dependencies — uses workspace `commander` + native `fetch`.

### `run`
Scan arbitrage opportunities for a specific token.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--token <symbol>` | `sBTC` | Token to find cross-pool price discrepancies for |
| `--min-edge <bps>` | `10` | Minimum edge in basis points to report |

**Output (JSON):**
```json
{
  "tool": "hodlmm-arb-scanner",
  "command": "run",
  "token": "sBTC",
  "poolCount": 3,
  "opportunities": [
    {
      "buyPool": { "id": 1, "pair": "sBTC-STX", "impliedPrice": 4250.00 },
      "sellPool": { "id": 5, "pair": "sBTC-USDA", "impliedPrice": 4280.00 },
      "rawEdgeBps": 70,
      "estimatedFeeBps": 30,
      "netEdgeBps": 40,
      "profitPerUnit": 30.00,
      "verdict": "ACTIONABLE",
      "reasoning": "sBTC is 70bps cheaper on pool 1 vs pool 5. After 15bps fee each leg, net edge is 40bps."
    }
  ],
  "summary": {
    "totalOpportunities": 2,
    "bestNetEdgeBps": 40,
    "avgNetEdgeBps": 25,
    "marketEfficiency": "MODERATE"
  }
}
```

### `scan`
Scan all tokens for cross-pool arbitrage opportunities.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--top <n>` | `10` | Number of opportunities to show |
| `--min-tvl <usd>` | `1000` | Minimum pool TVL to consider |

## Edge Classification

| Net Edge (bps) | Verdict | Meaning |
|-----------------|---------|---------|
| 50+ | **ACTIONABLE** | Likely profitable after fees and slippage |
| 20-49 | **MARGINAL** | Edge exists but may not survive execution costs |
| 10-19 | **NOISE** | Within normal market-making spread |
| <10 | *filtered* | Not reported |

## Market Efficiency Rating

| Rating | Meaning |
|--------|---------|
| **HIGH** | No actionable edges — pools are well-arbitraged |
| **MODERATE** | Some marginal edges — normal for lower-volume pairs |
| **LOW** | Multiple actionable edges — fragmented liquidity or stale pools |
| **FRAGMENTED** | Persistent large edges — pools may be abandoned or have very thin liquidity |

## Methodology

1. Group all HODLMM pools by shared tokens
2. For each token appearing in 2+ pools, compute implied USD price from each pool
3. Compare prices pairwise — the difference is the raw arbitrage edge
4. Subtract estimated swap fees on both legs (buy from cheap pool, sell to expensive pool)
5. Rank by net edge and filter by minimum threshold

## Data Sources

- **Bitflow App API**: Pool metadata, TVL, token prices, fee tiers
- **Hiro API**: Read-only contract calls for active bin and reserve data
- On-chain bin reserves for accurate implied pricing

## Output contract

All commands output JSON to stdout with `tool: "hodlmm-arb-scanner"`.

| Field | Type | Present |
|-------|------|---------|
| `tool` | `"hodlmm-arb-scanner"` | always |
| `command` | `"doctor" \| "run" \| "scan" \| "install-packs"` | always |
| `timestamp` | ISO 8601 string | always |
| `error` | string | on failure only |
| `token` | string | `run` only |
| `opportunities` | array | `run` / `scan` |
| `summary` | object | `run` / `scan` |

## Safety notes

- **Read-only**: No transactions, no wallet required
- **Rate limiting**: Sequential pool queries, bounded batch sizes
- **No financial advice**: Arbitrage opportunities are informational — execution risk is real
- **Snapshot-based**: Prices may change between detection and execution

## Known Constraints

- Cannot estimate actual slippage without simulating full swap path
- Fee estimates use pool-level metadata, not bin-specific fee tiers
- Cross-chain arbitrage (STX/BTC) not covered — only on-chain HODLMM pools
- Low-TVL pools may show large edges that aren't practically executable
