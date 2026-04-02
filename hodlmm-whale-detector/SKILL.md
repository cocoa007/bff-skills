---
name: hodlmm-whale-detector
description: "Whale activity detector for HODLMM — scans contract events for large LP operations, identifies dominant addresses, tracks concentration risk."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | install-packs | run --pool <id> --min-usd <n> --limit <n> | scan --top <n> --sort <field>"
  entry: "hodlmm-whale-detector/hodlmm-whale-detector.ts"
  requires: ""
  tags: "defi, read-only, mainnet-only, l2, hodlmm, whale, risk, events"
---

# HODLMM Whale Detector

## What it does

Scans on-chain contract events for large LP operations (deposits and withdrawals), identifies whale addresses, and measures LP concentration risk. Detects when a single address dominates a pool's liquidity.

## Why agents need it

Knowing who controls a pool's liquidity is critical for risk management:

- **Rug risk** — if one whale holds 80% of liquidity, they can pull it and crash the pool
- **Concentration risk** — a pool that looks healthy by TVL may be fragile if one LP dominates
- **Whale watching** — large deposits signal confidence, large withdrawals signal exit
- **Smart money tracking** — follow what experienced LPs are doing
- **Entry timing** — avoid entering a pool right before a whale exit

Other HODLMM skills analyze reserve distributions and pricing. This skill answers: **who controls the liquidity?**

## Commands

### `doctor`
Check API connectivity to Bitflow and Hiro endpoints.

### `install-packs`
No additional dependencies — uses workspace `commander` + native `fetch`.

### `run`
Detect whale activity for a specific pool.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--pool <id>` | `sbtc-stx` | Pool ID (numeric) or token pair name |
| `--min-usd <n>` | `1000` | Minimum operation size to flag as notable |
| `--limit <n>` | `50` | Maximum number of events to scan |

**Output (JSON):**
```json
{
  "tool": "hodlmm-whale-detector",
  "pool": { "id": 1, "pair": "sBTC-STX", "tvlUsd": 250000 },
  "whaleActivity": [
    {
      "address": "SP...",
      "type": "deposit",
      "estimatedUsd": 15000,
      "poolSharePct": 6.0,
      "txid": "0x...",
      "blockHeight": 940000,
      "timestamp": "2026-04-01T12:00:00Z"
    }
  ],
  "concentration": {
    "topAddress": "SP...",
    "topAddressSharePct": 45,
    "top3SharePct": 72,
    "top5SharePct": 85,
    "uniqueLPs": 24,
    "hhi": 2450,
    "grade": "CONCENTRATED",
    "reasoning": "Top LP controls 45% of liquidity. HHI 2450 indicates high concentration risk."
  },
  "netFlow": {
    "depositsUsd": 25000,
    "withdrawalsUsd": 8000,
    "netUsd": 17000,
    "sentiment": "ACCUMULATION"
  }
}
```

### `scan`
Scan all HODLMM pools for whale concentration risk.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--top <n>` | `10` | Number of pools to show |
| `--sort <field>` | `concentration` | Sort by: concentration, whale-count, tvl |

## Concentration Scoring (HHI)

Uses the Herfindahl-Hirschman Index (HHI) — sum of squared market shares:

| Grade | HHI | Meaning |
|-------|-----|---------|
| **DISTRIBUTED** | 0–1000 | Many LPs, no dominance — healthy |
| **MODERATE** | 1001–2500 | Some concentration but manageable |
| **CONCENTRATED** | 2501–5000 | High concentration risk — a few LPs dominate |
| **MONOPOLISTIC** | 5001–10000 | One or two LPs control most liquidity |

## Whale Flow Sentiment

| Sentiment | Meaning |
|-----------|---------|
| **ACCUMULATION** | Net deposits > 2x net withdrawals — whales building positions |
| **NEUTRAL** | Roughly balanced inflows and outflows |
| **DISTRIBUTION** | Net withdrawals > 2x net deposits — whales exiting |
| **EXODUS** | Large sustained withdrawals — potential rug risk |

## Data Sources

- **Hiro API**: Contract events for LP operations (add/remove liquidity)
- **Bitflow App API**: Pool metadata, TVL, token prices
- On-chain event parsing for sender addresses and amounts

## Output contract

All commands output JSON to stdout with `tool: "hodlmm-whale-detector"`.

| Field | Type | Present |
|-------|------|---------|
| `tool` | `"hodlmm-whale-detector"` | always |
| `command` | `"doctor" \| "run" \| "scan" \| "install-packs"` | always |
| `timestamp` | ISO 8601 string | always |
| `error` | string | on failure only |
| `pool` | object | `run` only |
| `whaleActivity` | array | `run` only |
| `concentration` | object | `run` / `scan` |
| `netFlow` | object | `run` only |
| `topPools` | array | `scan` only |

## Safety notes

- **Read-only**: No transactions, no wallet required
- **Rate limiting**: Bounded event queries, batched requests
- **No financial advice**: Concentration data is informational — whale exits can happen anytime
- **Privacy**: Uses public on-chain data only — all addresses are public by design

## Known Constraints

- Event history limited by Hiro API pagination (max ~200 recent events per query)
- Cannot determine total LP position size from events alone — estimates based on observed activity
- Historical events may not reflect current LP positions (addresses may have exited since)
- New pools have limited event history for analysis
