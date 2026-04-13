---
name: hodlmm-liquidity-resilience
description: "HODLMM Liquidity Resilience Analyzer — Measures how well a pool absorbs and recovers from large trades and liquidity shocks. Scores pools on shock absorption, recovery depth, asymmetry resilience, and concentration fragility."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | install-packs | run --pool-id <id> [--json] | scan [--top <n>] [--json]"
  entry: "hodlmm-liquidity-resilience/hodlmm-liquidity-resilience.ts"
  requires: ""
  tags: "defi, read-only, mainnet-only, l2, infrastructure"
---

# HODLMM Liquidity Resilience Analyzer

Measures how well a HODLMM pool absorbs and recovers from large trades and liquidity shocks.

## What it does

Answers the question **"how robust is this pool under stress?"** by simulating shock scenarios at various sizes (1%, 5%, 10%, 25%, 50% of TVL) and measuring how the pool's reserves respond.

Key metrics:
- **Shock absorption** — how much a large trade displaces the active bin vs total reserve depletion
- **Recovery depth** — how many bins deep reserves exist to absorb sequential trades
- **Asymmetry resilience** — whether the pool handles buy vs sell pressure equally
- **Concentration fragility** — how dependent the pool is on a few whale bins (HHI and Gini)
- **Resilience score** — composite 0-100 with classification: ANTIFRAGILE / RESILIENT / MODERATE / FRAGILE / BRITTLE

## Why agents need it

High APR means nothing if a single large trade can drain the pool and leave your position worthless. Resilience analysis helps agents:

1. Avoid deploying into fragile pools that look attractive on yield alone
2. Size positions appropriately based on shock absorption capacity
3. Identify pools with deep, well-distributed reserves (safer for larger positions)
4. Detect whale-dependent pools where a single withdrawal could collapse liquidity

## Safety notes

- **Read-only** — never submits transactions or moves funds
- **No wallet required** — safe to call from any agent without authentication
- **Mainnet-only** — Bitflow HODLMM API is mainnet-only

## Commands

### doctor

Checks API connectivity and dependencies.

```bash
bun run skills/hodlmm-liquidity-resilience/hodlmm-liquidity-resilience.ts doctor
```

### install-packs

Install dependencies (none required beyond workspace).

```bash
bun run skills/hodlmm-liquidity-resilience/hodlmm-liquidity-resilience.ts install-packs
```

### run

Analyze liquidity resilience for a specific pool.

```bash
bun run skills/hodlmm-liquidity-resilience/hodlmm-liquidity-resilience.ts run --pool-id <id>
bun run skills/hodlmm-liquidity-resilience/hodlmm-liquidity-resilience.ts run --pool-id <id> --json
```

Options:
- `--pool-id <id>` (required) — pool identifier
- `--json` — Output raw JSON instead of ASCII report

### scan

Rank pools by resilience score (top N).

```bash
bun run skills/hodlmm-liquidity-resilience/hodlmm-liquidity-resilience.ts scan
bun run skills/hodlmm-liquidity-resilience/hodlmm-liquidity-resilience.ts scan --top 20
```

Options:
- `--top <n>` — Number of top pools to analyze and rank (default: 10)
- `--json` — Output raw JSON instead of ASCII table

## Data sources

| Source | Data | Endpoint |
|---|---|---|
| Bitflow App API | Pool list with TVL, volume, active bin | `bff.bitflowapis.finance/api/app/v1/pools` |
| Hiro API | On-chain bin reserves for shock simulation | `api.hiro.so/v2/contracts/call-read/...` |
