---
name: hodlmm-market-depth
description: "Analyzes liquidity depth across HODLMM price bins — estimates slippage for different trade sizes, identifies thin liquidity gaps, and maps the full depth profile around the active price to help traders plan execution and LPs find underserved zones."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | install-packs | run [--pool <id>] [--range <bins>] [--trade-sizes <usd>]"
  entry: "hodlmm-market-depth/hodlmm-market-depth.ts"
  requires: "settings"
  tags: "defi, l2, mainnet-only, read-only"
---

# HODLMM Market Depth

Analyzes the liquidity depth profile of Bitflow HODLMM concentrated liquidity pools. Scans on-chain bin reserves around the active price, estimates slippage for various trade sizes, detects liquidity gaps, and rates overall market depth health. Helps traders plan trade execution and LPs identify underserved price zones where they can earn higher utilization with less competition.

## What it does

For a given HODLMM pool, this skill:

1. **Scans bin reserves** — Reads on-chain reserve data for bins around the active price (configurable range, default +-25 bins)
2. **Computes depth profile** — Separates bid-side (tokenY) and ask-side (tokenX) depth, calculates bid/ask ratio
3. **Estimates slippage** — For user-specified trade sizes, estimates how many bins a trade would consume and the resulting price impact
4. **Detects liquidity gaps** — Identifies sequences of empty bins that could cause sudden slippage spikes
5. **Scores depth health** — Composite score (0-100) based on coverage, balance, and continuity
6. **Generates recommendations** — Actionable insights for traders (execution advice) and LPs (deployment opportunities)

## Why agents need it

Concentrated liquidity pools have non-uniform depth — liquidity can be concentrated in a few bins or spread thinly across many. Without depth analysis, traders risk unexpected slippage and LPs miss profitable deployment opportunities. This skill provides the depth intelligence that separates informed participants from blind ones.

Key insight: **the safest trade size is not determined by TVL alone — it depends on how liquidity is distributed across bins. A $100k TVL pool with liquidity concentrated in 3 bins may offer better execution for small trades but worse execution for large ones than a $50k pool spread across 20 bins.**

## Safety notes

- **Read-only.** No transactions submitted. No wallet required.
- **Mainnet-only.** DLMM contract is on Stacks mainnet.
- **Estimates only.** Slippage estimates are approximate — actual slippage depends on concurrent trades, MEV, and bin state changes between observation and execution.
- Depth snapshots are point-in-time. Liquidity can move between bins at any time.
- Bin scanning is rate-limited by Hiro API — large ranges may be slow.
- USD conversions use Bitflow API prices, which may lag spot prices.

## Commands

### doctor

Checks Hiro API and Bitflow App API connectivity.

```bash
bun run hodlmm-market-depth/hodlmm-market-depth.ts doctor
```

### install-packs

Placeholder — no external dependencies beyond the bun runtime.

```bash
bun run hodlmm-market-depth/hodlmm-market-depth.ts install-packs
```

### run

Main command. Analyzes market depth for a specific HODLMM pool.

```bash
# Analyze highest-TVL pool (default)
bun run hodlmm-market-depth/hodlmm-market-depth.ts run

# Analyze a specific pool by name
bun run hodlmm-market-depth/hodlmm-market-depth.ts run --pool sbtc-stx

# Wider scan range with custom trade sizes
bun run hodlmm-market-depth/hodlmm-market-depth.ts run \
  --pool dlmm_1 --range 40 --trade-sizes "50,200,1000,5000,25000"
```

**Options:**
| Flag | Required | Default | Description |
|---|---|---|---|
| `--pool <id>` | No | highest TVL | Pool ID or token pair name |
| `--range <bins>` | No | 25 | Bins to scan on each side of active bin |
| `--trade-sizes <usd>` | No | 100,500,1000,5000,10000 | Trade sizes for slippage estimates |

## Output contract

All outputs are strict JSON to stdout.

**Success (run):**
```json
{
  "poolId": "dlmm_1",
  "poolName": "sBTC-STX",
  "tokenX": "sBTC",
  "tokenY": "STX",
  "activeBinId": 8388608,
  "binStep": 20,
  "tvlUsd": 125000.00,
  "scanRange": 25,
  "totalBinsScanned": 51,
  "binsWithLiquidity": 18,
  "bidDepthUsd": 52000.00,
  "askDepthUsd": 73000.00,
  "bidAskRatio": 0.71,
  "depthScore": 65,
  "slippageEstimates": [
    {
      "tradeSizeUsd": 1000,
      "tokenIn": "STX",
      "tokenOut": "sBTC",
      "estimatedSlippagePct": 0.2,
      "binsConsumed": 2,
      "rating": "good"
    }
  ],
  "liquidityGaps": [
    {
      "startBinOffset": -15,
      "endBinOffset": -10,
      "gapWidth": 5,
      "side": "bid",
      "severity": "moderate",
      "description": "5 empty bins below active price (offset -15 to -10)"
    }
  ],
  "depthMap": [
    { "binOffset": -25, "reserveX": 0, "reserveY": 5000000, "cumulativeDepthUsd": 500.00 }
  ],
  "healthRating": "adequate",
  "recommendations": [
    "Bid-side depth is weaker than ask-side. LPs can earn higher utilization by deploying below the active price."
  ],
  "timestamp": "2026-04-02T18:00:00.000Z",
  "disclaimer": "..."
}
```

**Error:**
```json
{ "error": "Pool \"xyz\" not found.", "availablePools": ["dlmm_1: sBTC-STX", "..."] }
```

## Output fields reference

| Field | Type | Description |
|---|---|---|
| `poolId` | string | Pool identifier |
| `poolName` | string | Human-readable token pair name |
| `activeBinId` | number | Currently active bin |
| `binStep` | number | Bin width in basis points |
| `tvlUsd` | number | Total value locked from API |
| `scanRange` | number | Bins scanned on each side |
| `totalBinsScanned` | number | Total bins queried |
| `binsWithLiquidity` | number | Bins containing non-zero reserves |
| `bidDepthUsd` | number | Total bid-side liquidity in USD |
| `askDepthUsd` | number | Total ask-side liquidity in USD |
| `bidAskRatio` | number | bid/ask depth ratio (1.0 = balanced) |
| `depthScore` | number | 0-100 composite depth health score |
| `slippageEstimates` | array | Per-trade-size slippage estimates |
| `liquidityGaps` | array | Detected empty-bin sequences |
| `depthMap` | array | Bin-by-bin depth profile |
| `healthRating` | string | deep / adequate / shallow / thin |
| `recommendations` | array | Actionable insights |

## Scoring methodology

**Depth Score (0-100):**
```
Coverage (0-40): bins_with_liquidity / total_bins_scanned * 40
Balance (0-30):  min(bid, ask) / max(bid, ask) * 30
Continuity (0-30): 30 - (critical_gaps * 15 + moderate_gaps * 5)
```

**Slippage Rating:**
| Rating | Slippage % | Meaning |
|---|---|---|
| excellent | < 0.1% | Negligible price impact |
| good | 0.1-0.5% | Acceptable for most trades |
| moderate | 0.5-1.0% | Noticeable impact — consider splitting |
| high | 1.0-5.0% | Significant — use limit orders or split |
| severe | > 5.0% | Extreme — avoid or use very small sizes |

**Gap Severity:**
| Severity | Empty Bins | Risk |
|---|---|---|
| minor | 2-3 | Small price jump possible |
| moderate | 4-7 | Noticeable slippage spike |
| critical | 8+ | Large price gap — high slippage risk |

## Data sources

| Source | Data | Endpoint |
|---|---|---|
| Hiro API (on-chain) | Pool parameters, active bin | `api.hiro.so/v2/contracts/call-read/...dlmm-core-v-1-1/get-pool` |
| Hiro API (on-chain) | Bin reserves | `api.hiro.so/v2/contracts/call-read/...dlmm-core-v-1-1/get-bin` |
| Bitflow App API | Pool TVL, token prices, decimals | `bff.bitflowapis.finance/api/app/v1/pools` |

## Known constraints

- Slippage estimates are simplified (linear bin consumption model) — real concentrated liquidity follows a more complex constant-sum curve within each bin
- Bin scanning range is configurable but rate-limited by Hiro API — scanning +-100 bins may take 30+ seconds
- USD depth calculations require token prices from Bitflow API — if prices are unavailable, raw reserve units are used as fallback
- Does not account for pending transactions in mempool that may change bin reserves
- Depth map output is sampled (every 5th bin) to keep response size manageable
