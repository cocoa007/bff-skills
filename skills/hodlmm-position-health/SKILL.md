---
name: hodlmm-position-health
description: "Unified health monitor for HODLMM concentrated LP positions — composite score from drift, IL, fees, volatility, and flow signals."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | check | run"
  entry: "hodlmm-position-health/hodlmm-position-health.ts"
  requires: "wallet"
  tags: "defi, read, mainnet-only, hodlmm, health"
---

# HODLMM Position Health

Unified health monitor for HODLMM concentrated LP positions. Combines signals from multiple dimensions into a single composite health score (0-100) and traffic-light status.

## What it does

Answers the question **"is my concentrated LP position healthy?"** by computing a composite score across five independent dimensions:

| Dimension | Weight | Good (high score) |
|-----------|--------|-------------------|
| **Drift** | 25% | Active bin near position center |
| **IL exposure** | 20% | Balanced X/Y reserves |
| **Fee efficiency** | 25% | High volume/TVL ratio |
| **Volatility** | 15% | Low volatility regime |
| **Flow momentum** | 15% | Net inflows (accumulation) |

Each dimension yields a sub-score from 0 to 100. The weighted composite determines an overall status:

| Status | Score | Meaning |
|--------|-------|---------|
| HEALTHY | 75-100 | Position performing well |
| CAUTION | 50-74 | Monitor closely |
| WARNING | 25-49 | Consider rebalancing |
| CRITICAL | 0-24 | Urgent action needed |

## Why agents need it

Other HODLMM skills focus on one dimension at a time: volatility gauge tracks regime, pulse tracks fee velocity, risk tracks IL. An autonomous LP agent needs a **single-pane-of-glass** view that fuses all signals into one actionable score. Position Health is that pane — run it once to know whether to hold, monitor, rebalance, or exit.

Integration chain:
1. `hodlmm-position-health check` — quick composite score
2. If `WARNING` or `CRITICAL`, drill into the weak dimension:
   - Drift high? → rebalance center bin
   - IL spiking? → reduce range or exit
   - Fee efficiency low? → consider migration to hotter pool
   - Volatility high? → widen range
   - Flow negative? → potential liquidity exodus, exit early

## Safety notes

- **Read-only** — never submits transactions or moves funds
- **Mainnet-only** — Bitflow HODLMM API is mainnet-only
- **Snapshot limitations** — scores reflect point-in-time state; trend analysis requires repeated polling
- **Hiro API fallback** — if Hiro returns 400 on read-only calls (known DLMM issue), the skill degrades gracefully using only Bitflow App API data
- No secrets or private keys accessed

## Output contract

All outputs are JSON to stdout.

**Success (check/run):**
```json
{
  "tool": "hodlmm-position-health",
  "command": "run",
  "pool": { "id": 1, "pair": "sBTC-STX", "tvlUsd": 2450000 },
  "health": {
    "compositeScore": 72,
    "status": "CAUTION",
    "dimensions": {
      "drift": { "score": 85, "weight": 0.25, "detail": "Active bin 2 bins from center" },
      "ilExposure": { "score": 60, "weight": 0.20, "detail": "Moderate X-side skew (62%)" },
      "feeEfficiency": { "score": 78, "weight": 0.25, "detail": "Volume/TVL ratio 0.45" },
      "volatility": { "score": 55, "weight": 0.15, "detail": "MODERATE regime" },
      "flowMomentum": { "score": 70, "weight": 0.15, "detail": "Slight net inflow" }
    },
    "weakestDimension": "volatility",
    "recommendations": ["Monitor volatility regime — approaching HIGH threshold"]
  },
  "timestamp": "2026-04-02T12:00:00.000Z"
}
```

**Error:**
```json
{ "tool": "hodlmm-position-health", "error": "descriptive message" }
```

## Commands

### doctor

Checks all data sources for connectivity.

```bash
bun run skills/hodlmm-position-health/hodlmm-position-health.ts doctor
```

### check

Quick health summary — fetches pool data and outputs composite score without deep bin analysis.

```bash
bun run skills/hodlmm-position-health/hodlmm-position-health.ts check --pool sbtc-stx
```

### run

Full analysis — fetches on-chain bin data, computes all five dimensions, outputs detailed health report.

```bash
bun run skills/hodlmm-position-health/hodlmm-position-health.ts run --pool sbtc-stx --center 8388608
```

Options:
- `--pool <id>` — pool ID or token pair name (default: `sbtc-stx`)
- `--center <bin>` — center bin of the position (default: current active bin)
