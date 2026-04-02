---
name: hodlmm-entry-optimizer
description: "HODLMM entry optimizer — finds optimal bin ranges for new concentrated LP positions based on volume distribution, liquidity gaps, and fee/IL tradeoffs."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | scout --pool-id <id> [--budget <usd>] | narrow --pool-id <id> [--risk <low|med|high>] | gaps --pool-id <id>"
  entry: "hodlmm-entry-optimizer/hodlmm-entry-optimizer.ts"
  requires: "settings"
  tags: "defi, l2, mainnet-only, read-only"
---

# HODLMM Entry Optimizer

Finds optimal bin ranges for new Bitflow HODLMM concentrated LP positions. Analyzes liquidity distribution, volume concentration, and fee/IL tradeoffs to recommend where to place liquidity for maximum risk-adjusted yield.

## What it does

For a given HODLMM pool, scans the entire bin landscape and computes:
- **Liquidity gaps**: bins near the active price with less competition (higher fee share per dollar deployed)
- **Volume hotspots**: bins where trading activity concentrates (more fee generation)
- **Range optimization**: recommended bin ranges at three risk levels (tight/medium/wide) with projected yields and IL exposure
- **Entry scores**: composite score combining fee potential, IL risk, and competition density

Four commands: `scout` for a full entry analysis with recommendations, `narrow` for risk-tuned range suggestions, `gaps` for raw liquidity gap data, and `doctor` for connectivity checks.

## Why agents need it

Existing skills tell you about pools you're already in — yield projections, IL exposure, rebalance signals, portfolio health. But none answer the entry question: "I have capital to deploy — where exactly should I place it?" An agent deciding between a tight 5-bin range and a wide 21-bin range needs data on where liquidity is thin (less competition = higher fee share), where volume concentrates (more fees), and what the IL tradeoff looks like at each width. This skill bridges the gap between "which pool?" (compare tools) and "which bins?"

## Safety notes

- **Read-only.** No transactions submitted. No wallet required.
- **Mainnet-only.** Bitflow HODLMM API does not support testnet.
- **Estimates only.** Entry recommendations based on current snapshot. Volume distribution and liquidity change constantly.
- Tighter ranges earn more fees per dollar when in-range but go out-of-range faster. The optimizer quantifies this tradeoff — it doesn't eliminate it.
- Always run alongside `hodlmm-safety-check` and `hodlmm-il-calculator` before deploying capital.
- All data sourced from Bitflow public APIs.

## Commands

### doctor

Checks Bitflow API connectivity.

```bash
bun run hodlmm-entry-optimizer/hodlmm-entry-optimizer.ts doctor
```

### scout

Full entry analysis for a pool. Shows liquidity landscape, volume hotspots, and recommended bin ranges at three risk levels with projected metrics.

```bash
# Scout entry opportunities in dlmm_1
bun run hodlmm-entry-optimizer/hodlmm-entry-optimizer.ts scout --pool-id dlmm_1

# With budget constraint (affects concentration impact estimate)
bun run hodlmm-entry-optimizer/hodlmm-entry-optimizer.ts scout --pool-id dlmm_1 --budget 1000
```

### narrow

Get a single recommended bin range tuned to a risk preference. Low risk = wider range (less IL, lower yield). High risk = tighter range (more IL, higher yield when in-range).

```bash
# Medium risk (default)
bun run hodlmm-entry-optimizer/hodlmm-entry-optimizer.ts narrow --pool-id dlmm_1

# Conservative entry
bun run hodlmm-entry-optimizer/hodlmm-entry-optimizer.ts narrow --pool-id dlmm_1 --risk low

# Aggressive entry
bun run hodlmm-entry-optimizer/hodlmm-entry-optimizer.ts narrow --pool-id dlmm_1 --risk high
```

### gaps

Raw liquidity gap analysis. Shows bins near the active price ranked by liquidity deficit (lowest liquidity = biggest opportunity for fee capture).

```bash
bun run hodlmm-entry-optimizer/hodlmm-entry-optimizer.ts gaps --pool-id dlmm_1
```

## Output contract

All outputs are strict JSON to stdout.

**Success (scout):**
```json
{
  "status": "success",
  "pool_id": "dlmm_1",
  "pool_name": "sBTC-USDCx-LP",
  "active_bin": 504,
  "bin_step": 10,
  "landscape": {
    "total_bins_with_liquidity": 45,
    "bins_analyzed": 30,
    "avg_liquidity_per_bin": 12500.50,
    "liquidity_gini": 0.42
  },
  "recommendations": [
    {
      "label": "tight",
      "bin_range": { "low": 502, "high": 506, "count": 5 },
      "projected_fee_pct_30d": 4.2,
      "il_at_10pct_move": -8.5,
      "net_pnl_30d_10pct": -4.3,
      "competition_density": 0.35,
      "entry_score": 7.2,
      "risk_level": "high"
    }
  ],
  "gaps": [
    { "bin_id": 503, "liquidity": 2100, "vs_avg_pct": -78.2, "opportunity": "HIGH" }
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
| Bitflow App Pools API | Pool list, TVL, 24h volume, fee tiers | `bff.bitflowapis.finance/api/app/v1/pools` |
| Bitflow Quotes Pools API | Active bin, bin step, fee config | `bff.bitflowapis.finance/api/quotes/v1/pools` |
| Bitflow Bins API | Per-bin reserves, liquidity distribution | `bff.bitflowapis.finance/api/quotes/v1/bins/{poolId}` |

## Scoring methodology

**Entry score** (0-10 scale):
```
entry_score = w1 * fee_potential + w2 * gap_opportunity + w3 * il_safety

where:
  fee_potential   = normalized projected fee % (higher = better)
  gap_opportunity = 1 - (range_liquidity / avg_liquidity) (less competition = better)
  il_safety       = breakeven_range / 100 (wider breakeven = safer)

  w1 = 0.4, w2 = 0.35, w3 = 0.25
```

**Competition density**: ratio of your range's liquidity share to total pool liquidity. Lower = less competition for fees in your bins.

**Liquidity Gini coefficient**: measures how unevenly liquidity is distributed across bins. Higher Gini = more concentrated (some bins dominate, leaving gaps in others).

## Known constraints

- Snapshot-based — liquidity and volume change constantly after analysis
- Does not account for upcoming price catalysts or market events
- Fee projection based on 24h volume (short-term bias)
- Budget impact estimate assumes uniform distribution across bins
- Does not model multi-position strategies (e.g., ladder entries)
