---
name: hodlmm-bin-analyzer
description: "Read-only on-chain analytics tool that queries Bitflow HODLMM (DLMM) pool contracts to provide bin-level liquidity depth, bid-ask spread, fee configuration, and per-user position breakdown for all 8 DLMM pools on Stacks mainnet."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | pools | bins --pool-id <id> | spread --pool-id <id> | position --pool-id <id> --address <addr> | fees --pool-id <id>"
  entry: "hodlmm-bin-analyzer/hodlmm-bin-analyzer.ts"
  requires: ""
  tags: "defi, read-only, mainnet-only, l2, infrastructure"
---

# HODLMM Bin Analyzer

On-chain analytics for Bitflow HODLMM (DLMM) concentrated liquidity pools. Reads bin-level state directly from Bitflow's APIs to surface liquidity depth, price spread, fee structure, and LP positions.

## What it does

Provides five read-only analytics commands that answer questions LP agents need before entering or managing a DLMM position:

1. **`pools`** — List all 8 HODLMM pools with active bin ID, bin step, token pair, TVL, and APR
2. **`bins`** — Show the active bin and surrounding bins (±10) with per-bin x/y reserves, liquidity shares, and price
3. **`spread`** — Calculate the effective bid-ask spread from bin step and the price at the active bin
4. **`position`** — Show a wallet address's bins, per-bin balances, and distance from the active bin
5. **`fees`** — Display the full fee configuration: base fee, variable fee state, protocol vs provider split (x and y sides)

## Why agents need it

`hodlmm-pulse` tells an agent *when* to deploy; `hodlmm-risk` and `hodlmm-advisor` tell it *whether* and *where*. **`hodlmm-bin-analyzer`** gives the raw bin-level data those skills need as a foundation — and lets agents directly inspect their own open positions without guessing at on-chain state.

Use it to:
- Confirm the active bin before placing liquidity
- Measure how wide or tight the market is at the current price (effective spread)
- Understand the fee structure before projecting yield
- Check if a position has drifted out of the earning range

## Safety notes

- **Read-only** — never submits transactions, never moves funds
- **No wallet required** — safe to call from any agent without credentials
- **Mainnet-only** — Bitflow HODLMM APIs are mainnet-only
- Prices returned are raw Bitflow scale values (divide by 1e8 for human-readable USD)
- Reserve values are in token native units (use decimals from `pools` to convert)

## Commands

### doctor

Verify all data sources are reachable before use.

```bash
bun run skills/hodlmm-bin-analyzer/hodlmm-bin-analyzer.ts doctor
```

### pools

List all HODLMM DLMM pools with key metrics.

```bash
bun run skills/hodlmm-bin-analyzer/hodlmm-bin-analyzer.ts pools
```

Output includes: poolId, pair, contract address, active bin, bin step, TVL (USD), APR (24h and full), fee tier.

### bins

Show the active bin and ±10 neighboring bins for a pool.

```bash
bun run skills/hodlmm-bin-analyzer/hodlmm-bin-analyzer.ts bins --pool-id dlmm_1
bun run skills/hodlmm-bin-analyzer/hodlmm-bin-analyzer.ts bins --pool-id dlmm_3 --window 5
```

Options:
- `--pool-id` (required) — pool identifier, e.g. `dlmm_1`
- `--window <n>` — bins on each side of active bin to show (default: 10)

Output per bin: bin_id, price (USD), reserve_x, reserve_y, liquidity shares, offset from active bin.

### spread

Calculate effective bid-ask spread at the current active bin.

```bash
bun run skills/hodlmm-bin-analyzer/hodlmm-bin-analyzer.ts spread --pool-id dlmm_1
```

Options:
- `--pool-id` (required) — pool identifier

Output: activeBinPrice (USD), binStep (bps), effectiveSpreadBps, effectiveSpreadPct, lastBidPrice, firstAskPrice, marketNote.

### position

Show a wallet's LP bins in a pool and distance from the active bin.

```bash
bun run skills/hodlmm-bin-analyzer/hodlmm-bin-analyzer.ts position --pool-id dlmm_1 --address SP3ESW1QCNQPVXJDGQWT7E45RDCH38QBK9HEJSX4X
```

Options:
- `--pool-id` (required) — pool identifier
- `--address` (required) — Stacks principal to inspect

Output: binCount, activeBinId, binDetails (per bin: id, price, reserves, offset from active), nearestBinOffset, avgBinOffset, inRangeStatus.

### fees

Show full fee configuration for a pool.

```bash
bun run skills/hodlmm-bin-analyzer/hodlmm-bin-analyzer.ts fees --pool-id dlmm_1
```

Output: baseFee (bps), variableFee, protocolFee (x and y), providerFee (x and y), totalFeeBps (x and y), feeAddress, variableFeesEnabled.

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{ "status": "success", "network": "mainnet", "timestamp": "...", "data": { ... } }
```

**Error:**
```json
{ "status": "error", "error": "descriptive message" }
```

## Data sources

| Source | Endpoint | Data |
|---|---|---|
| Bitflow App API | `bff.bitflowapis.finance/api/app/v1/pools` | Pool metadata, TVL, APR, fees |
| Bitflow Quotes API (pools) | `bff.bitflowapis.finance/api/quotes/v1/pools` | Active bin, bin step, fee config |
| Bitflow Quotes API (bins) | `bff.bitflowapis.finance/api/quotes/v1/bins/{poolId}` | Per-bin reserves, price, liquidity |
| Bitflow App API (positions) | `bff.bitflowapis.finance/api/app/v1/users/{addr}/positions/{poolId}/bins` | User LP position bins |

## Known constraints

- Mainnet-only — no testnet equivalent
- `position` command returns an error if the address has no liquidity in the pool
- Bin prices are in Bitflow's internal scale (divide by 1e8 for approximate USD/BTC depending on pair)
- Variable fee values may show 0 if the pool's variable fees manager has not been activated
- The `bins` window is limited to ±10 around the active bin by default to keep output manageable; use `--window` to adjust
