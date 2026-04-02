---
name: hodlmm-il-calculator
description: "Impermanent loss calculator for HODLMM concentrated LP — models IL across price scenarios, compares against fee income, and finds breakeven thresholds."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | assess --pool-id <id> [--bin-range <range>] [--hold-days <n>] | breakeven --pool-id <id> [--hold-days <d1,d2,...>] | compare [--pools <id,...>] [--hold-days <n>]"
  entry: "hodlmm-il-calculator/hodlmm-il-calculator.ts"
  requires: "settings"
  tags: "defi, l2, mainnet-only, read-only"
---

# HODLMM IL Calculator

Impermanent loss calculator for Bitflow HODLMM concentrated liquidity positions. Models IL across price scenarios, compares it against projected fee income, and finds breakeven price move thresholds.

## What it does

For a given HODLMM pool and bin range, calculates impermanent loss at various price move scenarios (±5% to ±50%), then compares IL against projected fee income over a configurable hold period. Outputs net P&L (fees minus IL) and breakeven thresholds — the maximum price move your fees can absorb before you're in the red.

Concentrated liquidity amplifies IL relative to standard AMMs. A position in 11 bins experiences roughly 10x the IL of a full-range position for the same price move. This skill quantifies that amplification so LPs can make informed range decisions.

Four commands: `assess` for detailed IL analysis of a single position, `breakeven` for time-based threshold analysis, `compare` for cross-pool risk-adjusted ranking, and `doctor` for connectivity checks.

## Why agents need it

The yield projector (PR #145) answers "how much will I earn?" but ignores the other side: "how much could I lose?" Without IL modeling, an agent might chase the highest-yielding pool only to discover that a 10% price move wipes out months of fee income. This skill completes the picture by quantifying IL risk alongside fee income, enabling genuinely informed LP decisions.

Key insight: **the best pool isn't the one with the highest yield — it's the one with the best yield-to-IL ratio for your expected hold period.**

## Safety notes

- **Read-only.** No transactions submitted. No wallet required.
- **Mainnet-only.** Bitflow HODLMM API does not support testnet.
- **Estimates only.** IL calculations use simplified geometric models. Actual IL depends on bin distribution, fee reinvestment, rebalancing frequency, and path-dependent price action.
- Concentrated positions have **amplified IL** — narrower ranges earn more fees but lose more on price moves.
- Always run alongside `hodlmm-yield-projector` and `hodlmm-safety-check` before deploying capital.
- All data sourced from Bitflow public APIs.

## Commands

### doctor

Checks Bitflow API connectivity.

```bash
bun run hodlmm-il-calculator/hodlmm-il-calculator.ts doctor
```

### assess

Full IL analysis for a specific pool and bin range. Shows IL at 10 price scenarios (±5% to ±50%), net P&L after fees, and breakeven thresholds.

```bash
# Assess IL for active bin ±5 over 30 days
bun run hodlmm-il-calculator/hodlmm-il-calculator.ts assess --pool-id dlmm_1

# Custom range and hold period
bun run hodlmm-il-calculator/hodlmm-il-calculator.ts assess --pool-id dlmm_1 --bin-range 500-510 --hold-days 14
```

### breakeven

Find breakeven price moves for multiple hold periods. Answers: "how long do I need to hold before my fees can absorb a 10% price move?"

```bash
# Default: 7, 14, 30, 90 day breakeven analysis
bun run hodlmm-il-calculator/hodlmm-il-calculator.ts breakeven --pool-id dlmm_1

# Custom periods
bun run hodlmm-il-calculator/hodlmm-il-calculator.ts breakeven --pool-id dlmm_1 --hold-days 1,3,7,30
```

### compare

Rank pools by risk-adjusted score (fee income weighted by breakeven tolerance). Higher score = better fee/risk ratio.

```bash
# Compare all DLMM pools
bun run hodlmm-il-calculator/hodlmm-il-calculator.ts compare

# Compare specific pools over 14-day horizon
bun run hodlmm-il-calculator/hodlmm-il-calculator.ts compare --pools dlmm_1,dlmm_2 --hold-days 14
```

## Output contract

All outputs are strict JSON to stdout.

**Success (assess):**
```json
{
  "status": "success",
  "pool_id": "dlmm_1",
  "pool_name": "sBTC-USDCx-LP",
  "position": {
    "bin_range": { "low": 500, "high": 510, "active_bin": 504, "bin_count": 11 },
    "bin_step": 10,
    "range_width_pct": 1.1,
    "hold_period_days": 30
  },
  "fee_projection": {
    "volume_24h_usd": 126045,
    "fee_bps": 30,
    "projected_fee_income_pct": 1.46
  },
  "il_scenarios": [
    {
      "price_move_pct": -10,
      "il_pct": -3.21,
      "in_range": true,
      "fee_income_pct": 1.46,
      "net_pnl_pct": -1.75,
      "verdict": "LOSS"
    }
  ],
  "breakeven": {
    "downside": { "breakeven_price_move_pct": -4.2 },
    "upside": { "breakeven_price_move_pct": 4.5 }
  },
  "risk_summary": {
    "il_amplification": 9.5,
    "vs_standard_amm": "IL is ~9.5x a full-range position"
  }
}
```

**Error:**
```json
{ "error": "Pool dlmm_99 not found" }
```

## Data sources

| Source | Data | Endpoint |
|---|---|---|
| Bitflow App Pools API | Pool list, TVL, 24h volume, fee tiers | `bff.bitflowapis.finance/api/app/v1/pools` |
| Bitflow Quotes Pools API | Active bin, bin step, fee config | `bff.bitflowapis.finance/api/quotes/v1/pools` |
| Bitflow Bins API | Per-bin reserves, liquidity distribution | `bff.bitflowapis.finance/api/quotes/v1/bins/{poolId}` |

## IL methodology

**Standard AMM IL:**
```
IL = 2 * sqrt(price_ratio) / (1 + price_ratio) - 1
```

**Concentrated liquidity amplification:**
```
amplification = 1 / (1 - sqrt(priceLow / priceHigh))

where:
  priceLow  = (1 + binStep/10000)^(-binCount/2)
  priceHigh = (1 + binStep/10000)^(binCount/2)
```

**Net P&L:**
```
net_pnl = fee_income - |IL|
```

**Risk-adjusted score (for compare):**
```
score = fee_income_pct * breakeven_range / 100
```

Higher score = pool earns more fees relative to its IL risk.

## Known constraints

- IL model is geometric approximation — actual DLMM IL depends on discrete bin transitions
- Fee income projection based on 24h volume (can vary)
- Does not model fee reinvestment or auto-compounding
- Does not account for gas costs of rebalancing
- Breakeven search uses binary search with ±0.01% precision
