---
name: hodlmm-pool-comparator
description: "Side-by-side comparison of HODLMM concentrated LP pools — ranks by fee yield, volume efficiency, liquidity concentration, and composite efficiency score to help LPs pick the best pool."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | install-packs | run [--pools <ids>] [--top <n>] [--sort-by <metric>] [--min-tvl <usd>]"
  entry: "hodlmm-pool-comparator/hodlmm-pool-comparator.ts"
  requires: "settings"
  tags: "defi, l2, mainnet-only, read-only"
---

# HODLMM Pool Comparator

Side-by-side comparison of Bitflow HODLMM concentrated liquidity pools. Fetches on-chain bin data and off-chain volume/TVL metrics, then ranks pools by fee yield efficiency, capital turnover, liquidity concentration, and a composite efficiency score. Helps LPs answer: "Which pool should I deploy capital into?"

## What it does

Scans all available HODLMM pools (or a user-specified subset), gathers on-chain bin concentration data and off-chain volume/TVL metrics, and produces a ranked comparison table. Each pool gets scored on:

- **Fee Yield** — annualized fee income as % of TVL (volume * fee_rate / TVL * 365)
- **Volume/TVL Ratio** — capital turnover efficiency (higher = capital works harder)
- **Concentration Score** — how tightly liquidity clusters around the active bin (0-100)
- **Efficiency Rank** — composite score: fee_yield * 40% + volume_tvl * 30% + concentration * 30%

Also identifies: best overall pool, best fee yield, highest volume, most concentrated, and safest entry (highest TVL + volume).

## Why agents need it

Choosing between HODLMM pools is a multi-dimensional problem. High fee yield often comes with low TVL (slippage risk). High volume pools may have poor concentration (fee leakage to distant bins). This skill normalizes these tradeoffs into a single ranking so agents can make informed deployment decisions without manually checking each pool.

Key insight: **the best pool is not the one with the highest APR — it is the one where fee generation, capital efficiency, and concentration alignment produce the most reliable returns after accounting for risk.**

## Safety notes

- **Read-only.** No transactions submitted. No wallet required.
- **Mainnet-only.** DLMM contract is on Stacks mainnet.
- **Estimates only.** Fee yields use 24h volume snapshots — actual yields fluctuate.
- Concentration scores sample bins around the active bin; they do not scan the entire bin range.
- APR figures assume constant volume and TVL — do not treat them as guaranteed returns.
- Low-TVL pools may show inflated APRs — warnings are emitted for TVL < $1,000.
- All data sourced from Hiro API (on-chain) and Bitflow public APIs.

## Commands

### doctor

Checks Hiro API and Bitflow App API connectivity.

```bash
bun run hodlmm-pool-comparator/hodlmm-pool-comparator.ts doctor
```

### install-packs

Placeholder — no external dependencies beyond the bun runtime.

```bash
bun run hodlmm-pool-comparator/hodlmm-pool-comparator.ts install-packs
```

### run

Main command. Compares HODLMM pools and produces a ranked comparison.

```bash
# Compare all HODLMM pools, ranked by efficiency
bun run hodlmm-pool-comparator/hodlmm-pool-comparator.ts run

# Compare specific pools
bun run hodlmm-pool-comparator/hodlmm-pool-comparator.ts run \
  --pools "dlmm_1,dlmm_2,dlmm_3"

# Top 5 by fee yield, minimum $10k TVL
bun run hodlmm-pool-comparator/hodlmm-pool-comparator.ts run \
  --top 5 --sort-by fee-yield --min-tvl 10000
```

**Options:**
| Flag | Required | Default | Description |
|---|---|---|---|
| `--pools <ids>` | No | all | Comma-separated pool IDs or name fragments to compare |
| `--top <n>` | No | 10 | Number of top pools to show |
| `--sort-by <metric>` | No | efficiency | Sort: efficiency, fee-yield, volume, tvl, concentration |
| `--min-tvl <usd>` | No | 0 | Minimum TVL filter in USD |

## Output contract

All outputs are strict JSON to stdout.

**Success (run):**
```json
{
  "status": "success",
  "poolCount": 5,
  "pools": [
    {
      "poolId": "1",
      "poolName": "sBTC-STX-LP",
      "tokenX": "sBTC",
      "tokenY": "STX",
      "binStep": 20,
      "activeBinId": 8388608,
      "tvlUsd": 125000.00,
      "volume24hUsd": 45000.00,
      "feeBps": 30,
      "feeYield24hPct": 0.0108,
      "feeApr": 3.94,
      "volumeTvlRatio": 0.36,
      "activeBinUtilization": 72.5,
      "binCount": 8,
      "concentrationScore": 78,
      "efficiencyRank": 65,
      "warnings": []
    }
  ],
  "bestOverall": "sBTC-STX-LP",
  "bestFeeYield": "WELSH-STX-LP",
  "bestVolume": "sBTC-STX-LP",
  "mostConcentrated": "USDA-STX-LP",
  "safestEntry": "sBTC-STX-LP",
  "methodology": {
    "feeYield": "24h_volume * fee_rate / TVL, annualized",
    "volumeTvlRatio": "24h_volume / TVL — measures capital turnover efficiency",
    "concentrationScore": "0-100 based on liquidity concentration around active bin",
    "efficiencyRank": "Composite: fee_yield_score * 40% + volume_tvl_score * 30% + concentration_score * 30%"
  },
  "timestamp": "2026-04-02T18:00:00.000Z",
  "disclaimer": "..."
}
```

**Error:**
```json
{ "error": "No HODLMM pools found from Bitflow API." }
```

## Output fields reference

| Field | Type | Description |
|---|---|---|
| `poolId` | string | Pool identifier |
| `poolName` | string | Human-readable pool name |
| `tokenX` / `tokenY` | string | Token pair symbols |
| `binStep` | number | Bin width in basis points |
| `activeBinId` | number | Currently active bin |
| `tvlUsd` | number | Total value locked in USD |
| `volume24hUsd` | number | 24-hour trading volume in USD |
| `feeBps` | number | Fee rate in basis points |
| `feeYield24hPct` | number | Daily fee yield as % of TVL |
| `feeApr` | number | Annualized fee yield % |
| `volumeTvlRatio` | number | Capital turnover ratio |
| `activeBinUtilization` | number | % of sampled liquidity near active bin |
| `binCount` | number | Bins with liquidity in sample range |
| `concentrationScore` | number | 0-100, higher = more concentrated |
| `efficiencyRank` | number | Composite efficiency score |
| `bestOverall` | string | Top-ranked pool name |
| `bestFeeYield` | string | Pool with highest fee APR |
| `bestVolume` | string | Pool with highest 24h volume |
| `mostConcentrated` | string | Pool with tightest liquidity concentration |
| `safestEntry` | string | Pool with highest TVL + volume combination |

## Data sources

| Source | Data | Endpoint |
|---|---|---|
| Hiro API (on-chain) | Pool parameters, active bin | `api.hiro.so/v2/contracts/call-read/...dlmm-core-v-1-1/get-pool` |
| Hiro API (on-chain) | Bin liquidity data | `api.hiro.so/v2/contracts/call-read/...dlmm-core-v-1-1/get-bin` |
| Hiro API (on-chain) | Pool reserves | `api.hiro.so/v2/contracts/call-read/...dlmm-core-v-1-1/get-pool-reserves` |
| Bitflow App API | Pool TVL, volume, fee rates, token info | `bff.bitflowapis.finance/api/app/v1/pools` |

## Scoring methodology

**Fee Yield Score (40% weight):**
```
daily_fees = volume_24h * (fee_bps / 10000)
fee_yield_pct = daily_fees / tvl * 100
fee_apr = fee_yield_pct * 365
fee_score = min(100, fee_apr / 2)  // 200% APR = max score
```

**Volume/TVL Score (30% weight):**
```
vol_tvl_ratio = volume_24h / tvl
volume_score = min(100, vol_tvl_ratio * 100)  // 1:1 ratio = max score
```

**Concentration Score (30% weight):**
```
Sample 21 bins around active bin (+-10)
active_share = liquidity in 5 central bins / total sampled liquidity
bin_spread_score = based on how many bins have liquidity (fewer = better)
concentration = active_share * 0.6 + spread_score (max 100)
```

**Composite Efficiency:**
```
efficiency = fee_score * 0.4 + volume_score * 0.3 + concentration * 0.3
```

## Known constraints

- Bin concentration sampling is limited to 21 bins (+-10 around active) — pools with wider distributions may appear more concentrated than they are
- Fee yields are based on 24h volume snapshots — high-volatility days will inflate APR estimates
- Low-TVL pools can show extremely high APRs that are unrealistic at scale
- Does not account for impermanent loss risk (use `hodlmm-il-calculator` for that)
- Does not factor in token price trends (use `hodlmm-correlation-tracker` for correlation risk)
- On-chain bin queries are rate-limited — comparing many pools may be slow
