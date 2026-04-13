---
name: hodlmm-protocol-revenue
description: "HODLMM Protocol Revenue Tracker — Aggregates fee generation across all HODLMM pools to produce protocol-level revenue overview with health classification, concentration metrics (Gini), and fee efficiency leaderboards."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "--top <n> | --json | --verbose"
  entry: "hodlmm-protocol-revenue/hodlmm-protocol-revenue.ts"
  requires: ""
  tags: "defi, read-only, mainnet-only, l2, infrastructure"
---

# HODLMM Protocol Revenue Tracker

Aggregates fee generation across all Bitflow HODLMM pools to produce a protocol-level revenue overview.

## What it does

Answers the question **"how healthy is HODLMM fee generation as a whole?"** by scanning every pool above a TVL threshold, computing daily/weekly/monthly fee estimates, and rolling them up into a protocol-wide dashboard with concentration analysis.

Key metrics:
- **Total protocol fee revenue** (estimated daily/weekly/monthly)
- **Top revenue pools** ranked by fee generation
- **Revenue concentration** (Gini coefficient across pools)
- **Fee-to-TVL efficiency** (which pools generate the most revenue per dollar locked)
- **Revenue health classification** per pool and protocol-wide: STRONG / MODERATE / WEAK / CRITICAL

## Why agents need it

Individual pool metrics miss the forest for the trees. This skill gives agents and LPs a macro view of where HODLMM revenue actually comes from, how concentrated it is, and whether the protocol's fee generation is healthy or declining. Use it to:

1. Identify which pools drive the most revenue
2. Spot revenue concentration risk (over-reliance on few pools)
3. Find high-efficiency pools (best fees per dollar of TVL)
4. Monitor protocol health trends over time

## Safety notes

- **Read-only** — never submits transactions or moves funds
- **No wallet required** — safe to call from any agent without authentication
- **Mainnet-only** — Bitflow HODLMM API is mainnet-only

## Commands

### Default (no subcommand)

Fetches all pools, analyzes revenue, and outputs a formatted dashboard.

```bash
bun run skills/hodlmm-protocol-revenue/hodlmm-protocol-revenue.ts
bun run skills/hodlmm-protocol-revenue/hodlmm-protocol-revenue.ts --top 20
bun run skills/hodlmm-protocol-revenue/hodlmm-protocol-revenue.ts --json
bun run skills/hodlmm-protocol-revenue/hodlmm-protocol-revenue.ts --verbose
```

Options:
- `--top <n>` — Number of top pools to display (default: 10)
- `--json` — Output as JSON instead of formatted text
- `--verbose` — Show detailed on-chain bin analysis per pool

## Output

Text mode produces a dashboard with:
- Protocol overview (TVL, volume, fees, yield, Gini)
- Top N revenue pools table
- Revenue health distribution (STRONG/MODERATE/WEAK/CRITICAL counts)
- Fee efficiency leaderboard
- On-chain bin analysis (when --verbose)
- Actionable insights and warnings

JSON mode outputs structured data for programmatic consumption.

## Data sources

| Source | Data | Endpoint |
|---|---|---|
| Bitflow App API | Pool list with fees, volume, TVL, APR | `bff.bitflowapis.finance/api/app/v1/pools` |
| Hiro API | On-chain bin reserves (verbose mode) | `api.hiro.so/v2/contracts/call-read/...` |
| CoinGecko | STX price for USD conversion | `api.coingecko.com/api/v3/simple/price` |
