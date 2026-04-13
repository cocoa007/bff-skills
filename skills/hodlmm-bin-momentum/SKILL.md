---
name: hodlmm-bin-momentum
description: "HODLMM Bin Momentum Analyzer — Measures the rate and direction of active bin movement by combining reserve gradient analysis with on-chain swap event history. Detects acceleration/deceleration of price movement through bins."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | install-packs | run --pool-id <id> [--json] | scan [--top <n>] [--min-tvl <usd>] [--json]"
  entry: "hodlmm-bin-momentum/hodlmm-bin-momentum.ts"
  requires: ""
  tags: "defi, read-only, mainnet-only, l2, infrastructure"
---

# HODLMM Bin Momentum Analyzer

Measures the rate and direction of active bin movement across Bitflow HODLMM pools.

## What it does

Answers the question **"which way is price moving through the bins, and how fast?"** by analyzing reserve depletion gradients and on-chain swap events. Unlike a static asymmetry snapshot, momentum detects whether price movement is accelerating or decelerating.

Key metrics:
- **Reserve depletion gradient** — how steeply reserves fall off from the active bin
- **Swap event momentum** — directional pressure from recent trades
- **Momentum score** — -100 (strong downward) to +100 (strong upward)
- **Momentum phase** — ACCELERATING, DECELERATING, STEADY, STALLED
- **Exhaustion risk** — how close reserves are to depletion on the leading edge
- **Position timing signal** — ENTER_NOW, WAIT, REPOSITION

## Why agents need it

Knowing *where* liquidity is concentrated is not enough — LPs need to know *which direction* it is being consumed and how fast. Bin momentum helps agents:

1. Detect when price is about to break through a liquidity boundary
2. Time entries to avoid deploying into a fast-moving bin range
3. Identify pools where momentum has stalled (good for range-bound strategies)
4. Warn when exhaustion risk is high on the leading edge

## Safety notes

- **Read-only** — never submits transactions or moves funds
- **No wallet required** — safe to call from any agent without authentication
- **Mainnet-only** — Bitflow HODLMM API is mainnet-only

## Commands

### doctor

Checks API connectivity and dependencies.

```bash
bun run skills/hodlmm-bin-momentum/hodlmm-bin-momentum.ts doctor
```

### install-packs

Install dependencies (none required beyond workspace).

```bash
bun run skills/hodlmm-bin-momentum/hodlmm-bin-momentum.ts install-packs
```

### run

Analyze bin momentum for a specific HODLMM pool.

```bash
bun run skills/hodlmm-bin-momentum/hodlmm-bin-momentum.ts run --pool-id <id>
bun run skills/hodlmm-bin-momentum/hodlmm-bin-momentum.ts run --pool-id <id> --json
```

Options:
- `--pool-id <id>` (required) — pool identifier
- `--json` — Output raw JSON instead of formatted report

### scan

Scan top pools and rank by momentum strength.

```bash
bun run skills/hodlmm-bin-momentum/hodlmm-bin-momentum.ts scan
bun run skills/hodlmm-bin-momentum/hodlmm-bin-momentum.ts scan --top 10 --min-tvl 5000
```

Options:
- `--top <n>` — Number of top pools to display (default: 5)
- `--min-tvl <usd>` — Minimum TVL threshold in USD (default: 1000)
- `--json` — Output raw JSON instead of formatted table

## Data sources

| Source | Data | Endpoint |
|---|---|---|
| Bitflow App API | Pool list with TVL, volume, active bin | `bff.bitflowapis.finance/api/app/v1/pools` |
| Hiro API | On-chain bin reserves and swap events | `api.hiro.so/v2/contracts/call-read/...` |
| Hiro API | Contract events for swap history | `api.hiro.so/extended/v1/contract/.../events` |
