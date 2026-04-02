---
name: hodlmm-rebalance-signal
description: "Read-only concentrated LP position drift monitor for Bitflow HODLMM pools. Analyzes how far the active bin has moved relative to a user's position range and signals HOLD, MONITOR, or REBALANCE based on drift, in-range ratio, and fee opportunity cost."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | check --pool-id <id> --position-low <bin> --position-high <bin> | scan [--pools <id,...>]"
  entry: "hodlmm-rebalance-signal/hodlmm-rebalance-signal.ts"
  requires: "settings"
  tags: "defi, l2, mainnet-only, read-only"
---

# HODLMM Rebalance Signal

Concentrated LP position drift monitor for Bitflow HODLMM pools. Tracks how far the active bin has drifted relative to a user's position range and emits a three-level signal: **HOLD**, **MONITOR**, or **REBALANCE**.

## What it does

Given a HODLMM pool ID and a position bin range (low-high), this skill:

1. Fetches the current active bin from the Bitflow Quotes API
2. Computes drift: how many bins the active bin has moved from the center of the position
3. Computes in-range ratio: what percentage of the position's bins are still in range
4. Estimates fee opportunity cost: daily fees being missed while out of range
5. Emits a signal with reasoning so the calling agent can decide whether to act

Three signal levels:

| Signal | Condition |
|---|---|
| **HOLD** | Active bin is within the position range and not near either edge — earning fees normally |
| **MONITOR** | Active bin is within 2 bins of the range boundary — drift risk rising, keep watching |
| **REBALANCE** | Active bin is outside the position range — position earning zero fees, action warranted |

The `scan` command checks all pools against a hypothetical centered position to surface which pools currently have high drift risk even before the user enters.

## Why agents need it

HODLMM positions are not passive. Once the active bin drifts outside the position range, the LP earns zero fees — indefinitely, until rebalanced. Without active monitoring, an LP can lose days or weeks of fee income while thinking their position is "working."

This skill is the fourth step in the HODLMM LP pipeline:

```
hodlmm-safety-check    → entry gate: is this pool safe?
hodlmm-bin-analyzer    → entry data: where is the active bin, what is depth?
hodlmm-yield-projector → entry projection: how much will I earn?
hodlmm-rebalance-signal → position monitor: am I still in range?
```

## Safety notes

- **Read-only.** No transactions submitted. No wallet required.
- **Mainnet-only.** Bitflow HODLMM APIs are mainnet-only.
- **Informational only.** Signal output is for agent decision-making. Not financial advice. Rebalancing has gas costs and IL implications that agents must weigh independently.
- All data sourced from Bitflow public APIs.

## Commands

### doctor

Checks Bitflow API connectivity. Run first to confirm the skill is operational.

```bash
bun run skills/hodlmm-rebalance-signal/hodlmm-rebalance-signal.ts doctor
```

### check

Analyze a specific LP position and get a rebalance signal.

```bash
# Check a position in pool dlmm_1, covering bins 500 to 510
bun run skills/hodlmm-rebalance-signal/hodlmm-rebalance-signal.ts check --pool-id dlmm_1 --position-low 500 --position-high 510

# Check a tight single-bin position
bun run skills/hodlmm-rebalance-signal/hodlmm-rebalance-signal.ts check --pool-id dlmm_1 --position-low 504 --position-high 504
```

Options:
- `--pool-id` (required) — pool identifier, e.g. `dlmm_1`
- `--position-low` (required) — lowest bin ID of the LP position (integer)
- `--position-high` (required) — highest bin ID of the LP position (integer)

### scan

Scan all HODLMM pools and report drift exposure. Useful as a daily health check.

```bash
# Scan all pools
bun run skills/hodlmm-rebalance-signal/hodlmm-rebalance-signal.ts scan

# Scan specific pools
bun run skills/hodlmm-rebalance-signal/hodlmm-rebalance-signal.ts scan --pools dlmm_1,dlmm_2,dlmm_3
```

Options:
- `--pools` (optional) — comma-separated pool IDs to scan (default: all DLMM pools)

## Output contract

All outputs are strict JSON to stdout.

**Success (check):**
```json
{
  "status": "success",
  "network": "mainnet",
  "timestamp": "2026-04-02T10:00:00.000Z",
  "poolId": "dlmm_1",
  "pair": "sBTC/USDCx",
  "activeBinId": 514,
  "position": { "low": 500, "high": 510, "center": 505, "width": 11 },
  "drift": {
    "binsFromCenter": 9,
    "binsFromNearestEdge": 4,
    "direction": "above",
    "inRangeBins": 0,
    "totalPositionBins": 11,
    "inRangeRatioPct": 0
  },
  "signal": "REBALANCE",
  "signalReason": "Active bin 514 is 4 bins above the position range (500-510). Position is earning zero fees.",
  "feeOpportunityCost": {
    "estimatedDailyFeeUsd": 1.24,
    "missedFeesDailyUsd": 1.24,
    "note": "Estimated based on pool 24h volume and fee rate. Not a guarantee."
  },
  "disclaimer": "Informational only. Not financial advice. Rebalancing incurs transaction costs and IL risk."
}
```

**Success (scan):**
```json
{
  "status": "success",
  "network": "mainnet",
  "timestamp": "2026-04-02T10:00:00.000Z",
  "poolCount": 3,
  "pools": [
    {
      "poolId": "dlmm_1",
      "pair": "sBTC/USDCx",
      "activeBinId": 514,
      "binStep": 10,
      "tvlUsd": 77143,
      "apr24h": 18.4,
      "note": "Active bin data available. Use check with your position range for a precise signal."
    }
  ]
}
```

**Error:**
```json
{ "status": "error", "error": "Pool dlmm_99 not found in quotes API" }
```

## Data sources

| Source | Endpoint | Data |
|---|---|---|
| Bitflow App API | `bff.bitflowapis.finance/api/app/v1/pools` | Pool list, TVL, APR, volume |
| Bitflow Quotes API (pools) | `bff.bitflowapis.finance/api/quotes/v1/pools` | Active bin, bin step, fee config |
| Bitflow Quotes API (bins) | `bff.bitflowapis.finance/api/quotes/v1/bins/{poolId}` | Per-bin reserves and prices |

## Signal logic

```
positionCenter = (positionLow + positionHigh) / 2
drift = activeBin - positionCenter
inRangeBins = count of position bins where binId == activeBin (or within range)
inRangeRatio = inRangeBins / totalPositionBins

if activeBin < positionLow OR activeBin > positionHigh:
  signal = REBALANCE
elif |activeBin - positionLow| <= 2 OR |activeBin - positionHigh| <= 2:
  signal = MONITOR
else:
  signal = HOLD
```

The fee opportunity cost estimate:
```
dailyFeeRevenue = volume24h * feeRateBps / 10000
missedFees = dailyFeeRevenue * (1 - inRangeRatio)
```

## Known constraints

- Fee opportunity cost uses 24h volume — single-day spikes skew estimates
- IL is not modeled; this skill is fee-focus only
- `scan` reports pool-level drift data; for position-level signal, use `check` with your actual bin range
- Mainnet-only; no testnet equivalent
