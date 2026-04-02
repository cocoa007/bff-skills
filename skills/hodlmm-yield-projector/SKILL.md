---
name: hodlmm-yield-projector
description: "Forward-looking HODLMM fee yield estimator — projects expected returns from concentrated LP positions based on historical volume, fee rates, and bin concentration."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | estimate --pool-id <id> [--bin-range <low>-<high>] | compare [--pools <id,...>] | history --pool-id <id>"
  entry: "hodlmm-yield-projector/hodlmm-yield-projector.ts"
  requires: "settings"
  tags: "defi, l2, mainnet-only, read-only"
---

# HODLMM Yield Projector

Forward-looking fee yield estimator for Bitflow HODLMM concentrated liquidity positions.

## What it does

Given a Bitflow HODLMM pool and bin range, fetches recent volume data, fee rates, and bin liquidity distribution, then projects expected daily, weekly, monthly, and annualized fee yield for an LP position. Concentration factor (active bin liquidity vs total pool liquidity) adjusts projections upward for tightly concentrated positions.

Three commands: `estimate` for a single pool/range, `compare` for cross-pool opportunity ranking, and `history` to validate projections against past fee generation data.

## Why agents need it

Before deploying capital to a HODLMM pool, an agent needs to answer: *how much will I earn?* Raw APR numbers from pool UIs don't account for where you place your bins or how concentrated your position is. This skill gives a concrete, forward-looking estimate that accounts for bin concentration, fee tier, and recent volume — enabling data-driven LP placement decisions.

## Safety notes

- **Read-only.** No transactions are submitted. No wallet required.
- **Mainnet-only.** Bitflow HODLMM API does not support testnet.
- **Estimates only.** Projections are based on recent historical volume and are not guarantees. Volume can spike or collapse; IL can eliminate fee income entirely.
- Concentrated positions have **higher IL risk** alongside higher potential yield — narrower ranges earn more fees when in-range but suffer larger losses when out of range.
- Recommend running `hodlmm-safety-check` (PR #127) before committing capital.
- All data sourced from Bitflow public APIs — no external oracles.

## Commands

### doctor

Checks Bitflow API connectivity and verifies pool data is available. Safe to run anytime.

```bash
bun run hodlmm-yield-projector/hodlmm-yield-projector.ts doctor
```

### estimate

Projects fee yield for a specific pool and bin range. Use `--bin-range active` to project based on the current active bin.

```bash
# Project yield for active bin range
bun run hodlmm-yield-projector/hodlmm-yield-projector.ts estimate --pool-id dlmm_1 --bin-range active

# Project yield for a specific bin range
bun run hodlmm-yield-projector/hodlmm-yield-projector.ts estimate --pool-id dlmm_1 --bin-range 500-510

# Default bin range is active if not specified
bun run hodlmm-yield-projector/hodlmm-yield-projector.ts estimate --pool-id dlmm_1
```

### compare

Compares projected yields across multiple pools to find the best opportunity. Defaults to all available HODLMM pools.

```bash
# Compare all pools
bun run hodlmm-yield-projector/hodlmm-yield-projector.ts compare

# Compare specific pools
bun run hodlmm-yield-projector/hodlmm-yield-projector.ts compare --pools dlmm_1,dlmm_2,dlmm_3
```

### history

Shows historical fee generation data for a pool to validate projection accuracy.

```bash
bun run hodlmm-yield-projector/hodlmm-yield-projector.ts history --pool-id dlmm_1
```

## Output contract

All outputs are strict JSON to stdout.

**Success (estimate):**
```json
{
  "status": "success",
  "pool_id": "dlmm_1",
  "pool_name": "sBTC-USDCx-LP",
  "bin_range": { "low": 500, "high": 510, "active_bin": 504 },
  "projections": {
    "daily_fee_yield_pct": 0.048,
    "weekly_fee_yield_pct": 0.337,
    "monthly_fee_yield_pct": 1.461,
    "annualized_fee_yield_pct": 17.72
  },
  "inputs": {
    "volume_24h_usd": 126045,
    "fee_bps": 30,
    "concentration_factor": 0.62,
    "position_tvl_estimate_usd": 5000
  },
  "warnings": [],
  "disclaimer": "Projections based on 24h historical volume. Not a guarantee. IL risk applies."
}
```

**Success (compare):**
```json
{
  "status": "success",
  "ranked": [
    {
      "pool_id": "dlmm_1",
      "pool_name": "sBTC-USDCx-LP",
      "annualized_yield_pct": 17.72,
      "volume_24h_usd": 126045,
      "tvl_usd": 77143,
      "fee_bps": 30,
      "active_bin": 504
    }
  ],
  "recommendation": "dlmm_1 offers the highest projected yield at 17.72% APR (24h basis)."
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

## Yield projection methodology

```
fee_yield_daily = (volume_24h * fee_rate * concentration_factor) / position_size

concentration_factor = active_bin_liquidity / total_pool_liquidity

annualized_yield = fee_yield_daily * 365
```

The concentration factor reflects that concentrated LP positions earn a disproportionate share of fees when in-range. A position covering 10% of total liquidity but placed entirely in the active bin earns fees proportional to its share of active-bin liquidity — not total pool liquidity.

## Known constraints

- Volume data is 24h — single-day spikes or lulls will skew projections
- IL is not modeled; yield projections are fee-only
- Bin reserve data via Bitflow Bins API; no Clarity read-only call required
- Pool list limited to live HODLMM (DLMM) pools on mainnet
