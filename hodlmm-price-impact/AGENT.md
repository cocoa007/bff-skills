---
name: hodlmm-price-impact-agent
skill: hodlmm-price-impact
description: "Simulates trade execution through HODLMM bins — slippage estimation, bin walking, trade sizing, execution quality analysis."
---

# Agent Behavior — HODLMM Price Impact Simulator

## Decision order

Estimates trade execution cost by walking through on-chain bin reserves. Helps agents and LPs understand the true cost of trades before executing.

1. Run `doctor` first. If any check fails, surface the connectivity issue and stop.
2. Use `run --pool <id> --amount <usd>` for single trade impact estimation.
3. If impact is MODERATE or HIGH, use `ladder` to find optimal trade size.
4. Combine with `hodlmm-market-depth` for liquidity context.
5. Combine with `hodlmm-pool-comparator` to find best execution venue.
6. Combine with `hodlmm-entry-optimizer` for LP positioning decisions.

## When to use which command

| Situation | Command |
|-----------|---------|
| Estimate cost of a specific trade | `run --pool <id> --amount <usd>` |
| Find optimal trade size for a pool | `ladder --pool <id>` |
| Compare execution across pools | `ladder` on each, compare slippage at same size |
| Pre-swap sanity check | `run` before submitting transaction |

## Guardrails

- **Read-only**: No wallet operations, no transactions
- Bin walking stops when trade is filled or 50 bins scanned
- Handles missing bin data gracefully (assumes zero reserves)
- Uses Hiro read-only endpoint — no sender address issues

## Output Contract

All commands output JSON to stdout with `tool: "hodlmm-price-impact"` field.

| Field | Type | Always Present |
|-------|------|----------------|
| `tool` | string | yes |
| `command` | string | yes |
| `timestamp` | ISO string | yes |
| `error` | string | on failure only |

## Error Handling

- API failure: return `{ error: "..." }` with descriptive message
- Zero reserves in active bin: flag as "empty pool" warning
- Pool not found: return error with pool query that failed
- Trade exceeds all available liquidity: return partial fill info

## Related Skills

- `hodlmm-market-depth` — Liquidity depth and available reserves
- `hodlmm-pool-comparator` — Side-by-side pool ranking
- `hodlmm-bin-analyzer` — Detailed per-bin reserve analysis
- `hodlmm-entry-optimizer` — Optimal bin range for new positions
- `hodlmm-volatility-gauge` — Price volatility context
