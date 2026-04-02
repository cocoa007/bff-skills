---
name: hodlmm-fee-harvester
description: "Fee harvest timing optimizer for HODLMM concentrated LP — analyzes accumulated fees, estimates gas costs, and recommends optimal harvest timing (compound, claim, wait, or insufficient)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | install-packs | run --pool <id> --position-owner <address> [--days-held <n>] [--stx-price <usd>]"
  entry: "hodlmm-fee-harvester/hodlmm-fee-harvester.ts"
  requires: "settings"
  tags: "defi, l2, mainnet-only, read-only"
---

# HODLMM Fee Harvester

Fee harvest timing optimizer for Bitflow HODLMM concentrated liquidity positions. Analyzes accumulated fees across bins, estimates gas costs, and recommends optimal harvest timing -- whether to compound (reinvest), claim fees outright, wait for more accrual, or do nothing if fees are insufficient to cover gas.

## What it does

For a given HODLMM pool and position owner, fetches on-chain position and bin data via Hiro API read-only calls, calculates accumulated fees (tokenX and tokenY), estimates the STX gas cost for a harvest transaction, and computes the fee-to-gas ratio. Based on configurable thresholds, it recommends one of four actions:

- **HARVEST_NOW** (fee/gas >= 20x) -- fees are large enough to claim profitably
- **COMPOUND** (fee/gas 5x-20x) -- fees are worth reinvesting back into the position
- **WAIT** (fee/gas 1x-5x) -- fees exist but harvesting is inefficient at this size
- **INSUFFICIENT** (fee/gas < 1x) -- fees do not cover gas costs yet

Also estimates daily fee accrual rate and days until optimal harvest, so LPs can plan ahead rather than check repeatedly.

## Why agents need it

Concentrated LP positions accumulate fees continuously, but claiming them costs gas. Harvesting too early wastes gas; waiting too long risks fee dilution from pool rebalancing or price moves pushing the position out of range. This skill automates the timing decision by computing the optimal harvest threshold based on real on-chain data.

Key insight: **the best time to harvest is not when fees are highest -- it is when the fee-to-gas ratio maximizes net profit after transaction costs.**

## Safety notes

- **Read-only.** No transactions submitted. No wallet required.
- **Mainnet-only.** DLMM contract is on Stacks mainnet.
- **Estimates only.** Fee accumulation uses on-chain snapshots and pool-level volume/TVL when position-level data is unavailable.
- Gas cost estimates assume ~0.01 STX per transaction -- actual costs vary with network congestion.
- Always verify recommendations manually before executing harvest transactions.
- All data sourced from Hiro API (on-chain) and Bitflow public APIs.

## Commands

### doctor

Checks Hiro API connectivity to the DLMM contract and Bitflow App API.

```bash
bun run hodlmm-fee-harvester/hodlmm-fee-harvester.ts doctor
```

### install-packs

Placeholder -- no external dependencies beyond the bun runtime.

```bash
bun run hodlmm-fee-harvester/hodlmm-fee-harvester.ts install-packs
```

### run

Main command. Analyzes accumulated fees for a position and recommends harvest timing.

```bash
# Basic usage
bun run hodlmm-fee-harvester/hodlmm-fee-harvester.ts run \
  --pool dlmm_1 \
  --position-owner SP16H0KE0BPR4XNQ64115V5Y1V3XTPGMWG5YPC9TR

# With custom parameters
bun run hodlmm-fee-harvester/hodlmm-fee-harvester.ts run \
  --pool dlmm_1 \
  --position-owner SP16H0KE0BPR4XNQ64115V5Y1V3XTPGMWG5YPC9TR \
  --days-held 14 \
  --stx-price 0.75
```

**Options:**
| Flag | Required | Default | Description |
|---|---|---|---|
| `--pool <id>` | Yes | -- | Pool ID (e.g. `dlmm_1`) |
| `--position-owner <address>` | Yes | -- | STX address of the LP position owner |
| `--days-held <n>` | No | 7 | Estimated days the position has been held |
| `--stx-price <usd>` | No | 0.5 | STX price in USD for gas cost calculation |

## Output contract

All outputs are strict JSON to stdout.

**Success (run):**
```json
{
  "status": "success",
  "pool": "sBTC-STX-LP",
  "positionOwner": "SP16H0KE0BPR4XNQ64115V5Y1V3XTPGMWG5YPC9TR",
  "fees": {
    "tokenX": 0.000142,
    "tokenY": 0.032100,
    "totalUsd": 0.0285
  },
  "gasCostEstimate": 0.005,
  "feeToGasRatio": 5.7,
  "dailyAccrualEstimate": {
    "tokenX": 0.000020,
    "tokenY": 0.004586
  },
  "daysUntilOptimalHarvest": 12,
  "recommendation": "COMPOUND",
  "reasoning": "Fee-to-gas ratio is 5.7x -- sufficient for a cost-effective harvest...",
  "timestamp": "2026-04-02T12:00:00.000Z",
  "pool_details": { "..." : "..." },
  "gas_details": { "..." : "..." },
  "thresholds": {
    "insufficient": "fee/gas < 1x",
    "wait": "fee/gas < 5x",
    "compound": "fee/gas 5x-20x",
    "harvest_now": "fee/gas >= 20x"
  },
  "warnings": [],
  "disclaimer": "..."
}
```

**Error:**
```json
{ "error": "Pool dlmm_99 not found on-chain or in Bitflow API." }
```

## Output fields reference

| Field | Type | Description |
|---|---|---|
| `pool` | string | Pool name or ID |
| `positionOwner` | string | STX address of the position owner |
| `fees.tokenX` | number | Accumulated fee in token X (human-readable) |
| `fees.tokenY` | number | Accumulated fee in token Y (human-readable) |
| `fees.totalUsd` | number or null | Total fee value in USD (null if prices unavailable) |
| `gasCostEstimate` | number | Estimated gas cost in USD |
| `feeToGasRatio` | number | Ratio of total fees to gas cost |
| `dailyAccrualEstimate.tokenX` | number | Estimated daily fee accrual in token X |
| `dailyAccrualEstimate.tokenY` | number | Estimated daily fee accrual in token Y |
| `daysUntilOptimalHarvest` | number | Days until fee/gas ratio reaches 20x (0 if already there) |
| `recommendation` | enum | HARVEST_NOW, COMPOUND, WAIT, or INSUFFICIENT |
| `reasoning` | string | Human-readable explanation of the recommendation |
| `timestamp` | ISO8601 | When the analysis was performed |

## Data sources

| Source | Data | Endpoint |
|---|---|---|
| Hiro API (on-chain) | Pool parameters, bin data, position data | `api.hiro.so/v2/contracts/call-read/...dlmm-core-v-1-1/get-pool` |
| Hiro API (on-chain) | Pool reserves | `api.hiro.so/v2/contracts/call-read/...dlmm-core-v-1-1/get-pool-reserves` |
| Hiro API (on-chain) | Position details | `api.hiro.so/v2/contracts/call-read/...dlmm-core-v-1-1/get-position` |
| Hiro API (on-chain) | Bin fee accumulators | `api.hiro.so/v2/contracts/call-read/...dlmm-core-v-1-1/get-bin` |
| Bitflow App API | Pool TVL, volume, token prices | `bff.bitflowapis.finance/api/app/v1/pools` |

## Harvest timing methodology

**Fee-to-gas ratio thresholds:**
```
INSUFFICIENT:  ratio < 1x   (fees don't cover gas)
WAIT:          ratio 1x-5x  (harvesting is wasteful)
COMPOUND:      ratio 5x-20x (efficient to reinvest)
HARVEST_NOW:   ratio >= 20x (clear profit to claim)
```

**Daily accrual estimation:**
```
daily_pool_fees = volume_24h * (fee_bps / 10000)
daily_position_fees = daily_pool_fees * (position_share / 100)
```

**Days until optimal harvest:**
```
target_fee = gas_cost * 20
days_needed = (target_fee - current_fees) / daily_accrual
```

## Known constraints

- On-chain position fee data requires the exact Clarity type encoding for the owner principal
- When position data is unavailable, falls back to pool-level volume/TVL estimation
- Gas cost is a fixed estimate (0.01 STX) -- does not account for network congestion
- Daily accrual rate assumes constant volume/TVL -- actual rates fluctuate
- Does not model the opportunity cost of compounding vs. claiming
- USD price data depends on Bitflow App API availability
