---
name: hodlmm-volume-pulse
description: "Fee generation intensity tracker for Bitflow HODLMM pools — monitors volume:TVL efficiency ratios and signals optimal LP entry/exit timing."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | pulse [--pools <id,...>] [--sort efficiency|volume|tvl|fees|yield] | hotspot [--pool-id <id>]"
  entry: "hodlmm-volume-pulse/hodlmm-volume-pulse.ts"
  requires: "settings"
  tags: "defi, l2, mainnet-only, read-only"
---

# HODLMM Volume Pulse

Fee generation intensity tracker for Bitflow HODLMM concentrated liquidity pools. Monitors volume:TVL efficiency ratios to identify optimal LP entry/exit timing.

## What it does

Scans all Bitflow HODLMM pools and classifies each by fee generation intensity using the volume:TVL efficiency ratio. Pools are labeled HOT, WARM, COOL, or COLD based on how much trading volume flows through relative to locked liquidity. The `hotspot` command provides a deep-dive on any pool with bin-level concentration analysis and LP entry scenarios at different risk levels.

## Why agents need it

The other HODLMM skills answer "which pool?", "is it safe?", "how much will I earn?", and "should I rebalance?". This skill answers the timing question: **is NOW a good time to provide liquidity?** A pool with 50% APR potential is worthless if volume dried up yesterday. Volume Pulse gives agents a real-time signal on fee generation intensity so they can time their LP entries and exits.

## Signal classification

| Signal | Efficiency Ratio | Meaning |
|--------|-----------------|---------|
| HOT | >= 2.0x | Volume > 2x TVL — exceptional fee generation, strong LP entry window |
| WARM | 0.5-2.0x | Healthy activity — reasonable fee opportunity |
| COOL | 0.1-0.5x | Moderate — fees may not compensate IL on volatile pairs |
| COLD | < 0.1x | Low activity — consider waiting for volume to pick up |

## Safety notes

- **Read-only.** No transactions are submitted. No wallet required.
- **Mainnet-only.** Bitflow HODLMM API does not support testnet.
- **Snapshot-based.** Efficiency ratios use 24h volume — a single large trade can skew the signal.
- HOT signals indicate current intensity, not that high volume will persist.
- Always run `hodlmm-safety-check` before committing capital, regardless of signal strength.
- Concentrated LP positions carry IL risk — tighter ranges amplify both fees AND losses.

## Commands

### doctor

Checks Bitflow API connectivity. Safe to run anytime.

```bash
bun run hodlmm-volume-pulse/hodlmm-volume-pulse.ts doctor
```

### pulse

Scans all HODLMM pools and ranks by fee generation intensity.

```bash
# Scan all pools, sorted by efficiency
bun run hodlmm-volume-pulse/hodlmm-volume-pulse.ts pulse

# Sort by raw volume
bun run hodlmm-volume-pulse/hodlmm-volume-pulse.ts pulse --sort volume

# Filter to specific pools
bun run hodlmm-volume-pulse/hodlmm-volume-pulse.ts pulse --pools dlmm_1,dlmm_2
```

### hotspot

Deep-dive on a specific pool (or auto-detect the hottest one).

```bash
# Auto-detect hottest pool
bun run hodlmm-volume-pulse/hodlmm-volume-pulse.ts hotspot

# Analyze a specific pool
bun run hodlmm-volume-pulse/hodlmm-volume-pulse.ts hotspot --pool-id dlmm_1
```

## Output contract

All outputs are strict JSON to stdout.

**Success (pulse):**
```json
{
  "status": "success",
  "summary": {
    "pools_scanned": 5,
    "hot": 1,
    "warm": 2,
    "cool": 1,
    "cold": 1,
    "total_volume_24h_usd": 500000,
    "total_tvl_usd": 300000,
    "ecosystem_efficiency": 1.67
  },
  "pools": [
    {
      "pool_id": "dlmm_1",
      "pool_name": "sBTC-USDCx",
      "efficiency_ratio": 2.45,
      "signal": "HOT",
      "signal_reason": "Volume is 2.5x TVL — exceptional fee generation."
    }
  ]
}
```

**Success (hotspot):**
```json
{
  "status": "success",
  "pool": { "pool_id": "dlmm_1", "pool_name": "sBTC-USDCx" },
  "pulse": { "efficiency_ratio": 2.45, "signal": "HOT" },
  "concentration": { "profile": "concentrated", "gini_coefficient": 0.62 },
  "lp_entry_scenarios": [
    { "label": "aggressive", "projected_annual_yield_pct": 87.6, "risk": "HIGH IL" },
    { "label": "balanced", "projected_annual_yield_pct": 54.8, "risk": "MODERATE IL" }
  ]
}
```

**Error:**
```json
{ "error": "Pool dlmm_99 not found" }
```

## Data sources

| Source | Data | Endpoint |
|---|---|---|
| Bitflow App Pools API | Pool list, TVL, 24h volume, APR, fee tiers | `bff.bitflowapis.finance/api/app/v1/pools` |
| Bitflow Quotes Pools API | Active bin, bin step, fee config | `bff.bitflowapis.finance/api/quotes/v1/pools` |
| Bitflow Bins API | Per-bin reserves, liquidity distribution | `bff.bitflowapis.finance/api/quotes/v1/bins/{poolId}` |

## Efficiency ratio methodology

```
efficiency_ratio = volume_24h / tvl
daily_fee_yield = volume_24h * (fee_bps / 10000) / tvl * 100
annual_fee_yield = daily_fee_yield * 365
```

The efficiency ratio measures how hard locked capital is working. High-efficiency pools generate more fees per dollar of TVL, making them better LP opportunities in the short term. However, high efficiency can also indicate thin liquidity — meaning more IL risk from price impact.

## Workflow integration

This skill fits into the HODLMM LP pipeline as the entry-timing step:

```
0. hodlmm-volume-pulse     →  is NOW a good time? (this skill)
1. hodlmm-yield-projector  →  how much will I earn?
2. hodlmm-safety-check     →  is the pool/token safe?
3. hodlmm-bin-analyzer     →  what does liquidity depth look like?
4. hodlmm-rebalance-signal →  is my position drifting?
5. add-liquidity            →  deploy (requires human approval)
```

## Known constraints

- Volume data is 24h — single-day spikes or lulls will skew signals
- Gini coefficient requires bin-level data; degrades gracefully if bins API unavailable
- No historical volume tracking — each `pulse` call is a point-in-time snapshot
- Pool list limited to live HODLMM (DLMM) pools on mainnet
