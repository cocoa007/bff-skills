---
name: hodlmm-exit-optimizer
description: "Determines optimal exit timing for Bitflow HODLMM concentrated LP positions. Analyzes position drift, fee exhaustion, IL breakeven, and market conditions to produce a 0-10 urgency score with HOLD / MONITOR / EXIT signal. Read-only — no transactions, no wallet required."
metadata:
  author: cocoa007
  author-agent: "Fluid Briar (cocoa007) — SP16H0KE0BPR4XNQ64115V5Y1V3XTPGMWG5YPC9TR | bc1qv8dt3v9kx3l7r9mnz2gj9r9n9k63frn6w6zmrt"
  user-invocable: "true"
  arguments: "doctor | install-packs | run [--pool-id <id>] [--pos-low <bin>] [--pos-high <bin>]"
  entry: "hodlmm-exit-optimizer/hodlmm-exit-optimizer.ts"
  requires: ""
  tags: "defi, read-only, mainnet-only, l2"
---

# HODLMM Exit Optimizer

Determines optimal exit timing for Bitflow HODLMM concentrated LP positions.

## What it does

Fetches live Bitflow HODLMM pool state (active bin, bin step, volume, TVL, fee tier) and analyzes a user-specified position range to produce a composite exit urgency score (0-10). The analysis covers four dimensions:

1. **Drift analysis** — how far the active price has moved from the position center, whether the position is still in range, and what fraction of bins are still earning fees.
2. **Fee exhaustion** — whether the position is still generating meaningful fee income based on volume/TVL ratio and concentration factor.
3. **IL breakeven** — computes concentrated impermanent loss for the position and compares it against projected fee income to determine if fees can recover the IL.
4. **Urgency scoring** — combines drift (35%), IL (35%), and fee exhaustion (30%) penalties into a 0-10 score with HOLD / MONITOR / EXIT signal.

Also provides a re-entry hint suggesting an updated bin range centered on the current active bin.

## Why agents need it

Concentrated LP positions in HODLMM pools have a limited earning range. Once price drifts away, the position stops earning fees while IL accumulates. This skill gives agents a data-driven signal for when to close a position, replacing guesswork with a structured urgency score. Pairs with `hodlmm-bin-guardian` (range monitoring) and `hodlmm-il-calculator` (detailed IL math).

## Safety notes

- **Read-only.** No transactions are submitted.
- **No wallet required.** Position range is specified via `--pos-low` and `--pos-high` flags.
- **Mainnet-only.** Bitflow HODLMM API does not support testnet.
- All price and volume data sourced exclusively from Bitflow public APIs.
- Output includes a disclaimer that recommendations are snapshot-based estimates.

## Commands

### doctor

Checks all data sources: Bitflow App Pools API and Bitflow Quotes Pools API.

```bash
bun run hodlmm-exit-optimizer/hodlmm-exit-optimizer.ts doctor
```

### install-packs

No additional packs required — uses Bitflow public HTTP APIs directly.

```bash
bun run hodlmm-exit-optimizer/hodlmm-exit-optimizer.ts install-packs
```

### run

Analyzes exit timing for a position in the specified pool.

```bash
# Default pool (dlmm_1) with simulated position
bun run hodlmm-exit-optimizer/hodlmm-exit-optimizer.ts run

# Specify pool and position range
bun run hodlmm-exit-optimizer/hodlmm-exit-optimizer.ts run --pool-id dlmm_1 --pos-low 500 --pos-high 510
```

## Live terminal output

### doctor (all sources reachable)

```json
{
  "status": "ok",
  "checks": [
    { "name": "Bitflow App Pools API", "ok": true, "detail": "N pools found" },
    { "name": "Bitflow Quotes Pools API", "ok": true, "detail": "N pools found" }
  ],
  "message": "All data sources reachable. Ready to run."
}
```

### run (position drifting out of range)

```json
{
  "status": "success",
  "action": "MONITOR — exit urgency 4.2/10",
  "data": {
    "exit_score": {
      "score": 4.2,
      "signal": "MONITOR",
      "components": {
        "drift_penalty": 3.5,
        "fee_exhaustion_penalty": 1.0,
        "il_penalty": 2.0,
        "range_utilization_bonus": 0.8
      },
      "reasoning": "mixed signals — review components individually"
    },
    "drift": {
      "drift_bins": 5,
      "drift_pct": 0.5,
      "drift_direction": "above",
      "in_range": true,
      "range_utilization_pct": 80.0,
      "bins_earning_fees": 8,
      "total_position_bins": 10
    },
    "fee_exhaustion": {
      "daily_fee_yield_pct": 0.05,
      "projected_30d_fee_pct": 1.5,
      "volume_to_tvl_ratio": 1.63,
      "fee_status": "generating",
      "fee_rank": "good"
    },
    "il_breakeven": {
      "current_il_pct": -2.1,
      "il_severity": "moderate",
      "days_of_fees_to_recover": 42,
      "fee_vs_il_ratio": 0.71,
      "breakeven_status": "breakeven"
    },
    "reentry_hint": {
      "suggested_range": { "low": 500, "high": 510, "count": 11 },
      "range_width_pct": 1.1,
      "rationale": "Re-center on active bin 505"
    },
    "pool_id": "dlmm_1",
    "pool_name": "sBTC-USDCx-LP"
  },
  "disclaimer": "Exit recommendations are snapshot-based estimates...",
  "error": null
}
```

## Output contract

All outputs are strict JSON to stdout.

| Field | Type | Description |
|---|---|---|
| `status` | `"success" \| "error"` | Overall result |
| `action` | `string` | `HOLD`, `MONITOR`, or `EXIT` with urgency score |
| `data.exit_score.score` | `number` | 0-10 urgency score |
| `data.exit_score.signal` | `"HOLD" \| "MONITOR" \| "EXIT"` | Actionable signal |
| `data.exit_score.components` | `object` | Breakdown: drift_penalty, fee_exhaustion_penalty, il_penalty, range_utilization_bonus |
| `data.exit_score.reasoning` | `string` | Human-readable explanation |
| `data.drift` | `DriftResult` | Drift bins, direction, in-range status, utilization |
| `data.fee_exhaustion` | `FeeExhaustionResult` | Daily yield, 30d projection, volume/TVL ratio, fee status |
| `data.il_breakeven` | `ILBreakevenResult` | Current IL %, severity, days to recover, fee vs IL ratio |
| `data.reentry_hint` | `ReentryHint` | Suggested new range centered on active bin |
| `data.pool_id` | `string` | Pool identifier |
| `data.pool_name` | `string` | Human-readable pool name |
| `disclaimer` | `string` | Standard risk disclaimer |

## Data sources

| Source | Data | Endpoint |
|---|---|---|
| Bitflow App Pools API | TVL, 24h volume, APR, token prices, decimals | `bff.bitflowapis.finance/api/app/v1/pools` |
| Bitflow Quotes Pools API | Active bin, bin step, fee tier | `bff.bitflowapis.finance/api/quotes/v1/pools` |
| Bitflow Bins API | Per-bin reserves and liquidity | `bff.bitflowapis.finance/api/quotes/v1/bins/{poolId}` |
