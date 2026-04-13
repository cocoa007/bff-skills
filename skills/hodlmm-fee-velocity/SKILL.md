---
name: hodlmm-fee-velocity
description: "HODLMM Fee Velocity Analyzer — Measures fee generation rate, momentum, and capital efficiency across HODLMM pools. Detects accelerating vs decelerating fee generation and scores velocity relative to TVL and volume."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "--pool-id <id> | --all [--top <n>] [--min-tvl <usd>] [--json]"
  entry: "hodlmm-fee-velocity/hodlmm-fee-velocity.ts"
  requires: ""
  tags: "defi, read-only, mainnet-only, l2, infrastructure"
---

# HODLMM Fee Velocity Analyzer

Measures the rate and acceleration of fee generation across Bitflow HODLMM pools.

## What it does

Answers the question **"how fast is this pool generating fees, and is the rate increasing or decreasing?"** by sampling fee state, computing velocity metrics, and classifying momentum.

Key metrics:
- **Fee velocity** — estimated fee generation rate (USD/hour) from volume and fee tiers
- **Volume efficiency** — volume-to-TVL ratio measuring capital turnover speed
- **Fee density** — fees generated per dollar of active liquidity (bins with reserves)
- **Momentum classification** — SURGING / STEADY / COOLING / STALLED
- **Velocity score** — composite 0-100 score rating fee generation health

## Why agents need it

APR is a lagging indicator. By the time APR updates, the fee generation window may already be closing. Fee velocity gives agents a leading signal:

1. Detect fee generation spikes before they show up in APR
2. Distinguish pools with high volume efficiency (capital working hard) from pools with inflated TVL
3. Identify fee density hotspots where active liquidity bins earn the most
4. Classify momentum to time entries (SURGING) and exits (COOLING/STALLED)

## Safety notes

- **Read-only** — never submits transactions or moves funds
- **No wallet required** — safe to call from any agent without authentication
- **Mainnet-only** — Bitflow HODLMM API is mainnet-only

## Commands

### Single pool analysis

Analyze fee velocity for a specific pool.

```bash
bun run skills/hodlmm-fee-velocity/hodlmm-fee-velocity.ts --pool-id <id>
bun run skills/hodlmm-fee-velocity/hodlmm-fee-velocity.ts --pool-id <id> --json
```

### All pools scan

Analyze all pools above minimum TVL and rank by fee velocity.

```bash
bun run skills/hodlmm-fee-velocity/hodlmm-fee-velocity.ts --all
bun run skills/hodlmm-fee-velocity/hodlmm-fee-velocity.ts --all --top 10 --min-tvl 5000
bun run skills/hodlmm-fee-velocity/hodlmm-fee-velocity.ts --all --json
```

Options:
- `--pool-id <id>` — Analyze a specific pool
- `--all` — Analyze all pools above minimum TVL
- `--top <n>` — Show top N pools by fee velocity (default: 5)
- `--min-tvl <usd>` — Minimum TVL filter (default: 1000)
- `--json` — Output raw JSON

## Velocity score benchmarks

| Score Range | Classification | Meaning |
|---|---|---|
| 80-100 | SURGING | Exceptional fee generation — prime entry window |
| 55-79 | STEADY | Healthy, sustained fee generation |
| 30-54 | COOLING | Below baseline — fee generation declining |
| 0-29 | STALLED | Minimal fee activity — not an entry window |

## Volume efficiency benchmarks

| Turnover | Classification | Meaning |
|---|---|---|
| >100% daily | High | Capital is working very hard |
| 30-100% daily | Moderate | Healthy turnover |
| 5-30% daily | Low | Capital is mostly idle |
| <5% daily | Very low | Pool may lack market interest |

## Data sources

| Source | Data | Endpoint |
|---|---|---|
| Bitflow App API | Pool list with fees, volume, TVL | `bff.bitflowapis.finance/api/app/v1/pools` |
| Hiro API | On-chain bin reserves for fee density | `api.hiro.so/v2/contracts/call-read/...` |
