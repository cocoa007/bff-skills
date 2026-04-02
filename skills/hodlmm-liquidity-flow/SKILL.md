---
name: hodlmm-liquidity-flow
description: Net liquidity flow tracker for HODLMM pools — accumulation/distribution detection, whale movement alerts, pool momentum scoring
author: cocoa007
tags: [hodlmm, liquidity, flow, dlmm, bitflow, defi, lp, whale, momentum]
entry: hodlmm-liquidity-flow.ts
---

# HODLMM Liquidity Flow Tracker

Monitors net liquidity flows across HODLMM pools by analyzing recent contract events. Detects whether pools are in accumulation (net inflows) or distribution (net outflows) phases, flags whale-sized movements, and scores pool momentum to help LPs time entries and exits.

## Commands

### `doctor`
Check API connectivity to Bitflow and Hiro endpoints.

### `install-packs`
No additional dependencies — uses workspace `commander` + native `fetch`.

### `run`
Analyze liquidity flows for a specific pool.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--pool <id>` | `sbtc-stx` | Pool ID (numeric) or token pair name |
| `--blocks <n>` | `144` | Lookback window in blocks (~24h at 1 block/10s avg) |
| `--whale <pct>` | `5` | Whale threshold as % of pool TVL |

**Output (JSON):**
```json
{
  "tool": "hodlmm-liquidity-flow",
  "pool": { "id": 1, "pair": "sBTC-STX", "tvlUsd": 250000 },
  "window": { "blocks": 144, "eventsFound": 12 },
  "flows": {
    "totalAddsUsd": 45000,
    "totalRemovesUsd": 22000,
    "netFlowUsd": 23000,
    "addCount": 8,
    "removeCount": 4
  },
  "phase": "ACCUMULATION",
  "momentumScore": 72,
  "whaleMovements": [
    { "type": "add", "estimatedUsd": 15000, "pctOfTvl": 6.0, "txid": "0x..." }
  ],
  "signal": "BULLISH",
  "reasoning": ["Net inflow of $23k (9.2% of TVL) in last 144 blocks.", "1 whale deposit detected."]
}
```

### `scan`
Scan all HODLMM pools for flow momentum.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--blocks <n>` | `144` | Lookback window in blocks |
| `--top <n>` | `10` | Number of pools to show |

## Phase Classification

| Phase | Condition |
|-------|-----------|
| **ACCUMULATION** | Net flow > +3% of TVL |
| **DISTRIBUTION** | Net flow < -3% of TVL |
| **NEUTRAL** | Net flow within ±3% of TVL |

## Momentum Score (0–100)

Weighted composite of flow signals:

| Signal | Weight | High Score Indicator |
|--------|--------|---------------------|
| Net flow direction | 40% | Strong positive net flow |
| Flow velocity (events/block) | 25% | High activity rate |
| Whale add/remove ratio | 20% | More whale deposits than withdrawals |
| Flow consistency | 15% | Steady inflows, not single spike |

## Signal Interpretation

| Signal | Meaning | LP Action |
|--------|---------|-----------|
| **BULLISH** | Score > 65, net accumulation | Good time to add liquidity |
| **NEUTRAL** | Score 35–65, balanced flows | Hold current position |
| **BEARISH** | Score < 35, net distribution | Consider reducing exposure |

## Data Sources

- **Hiro API**: Contract events for add-liquidity and remove-liquidity calls
- **Bitflow App API**: Pool metadata, TVL, token prices for USD conversion
- Falls back gracefully if Hiro returns limited events

## Known Constraints

- Event window is block-based, not time-based — block times vary
- USD estimates use current token prices, not prices at time of event
- Whale detection is heuristic — based on estimated USD value vs TVL
- High-activity pools may exceed event pagination limits in large windows
