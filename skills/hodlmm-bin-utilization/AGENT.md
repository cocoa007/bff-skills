---
name: hodlmm-bin-utilization-agent
skill: hodlmm-bin-utilization
description: "Monitors HODLMM pool capital efficiency — active vs idle bins, effective TVL, dead capital detection, rebalance recommendations."
---

# Agent Behavior — HODLMM Bin Utilization

## Decision order

Monitors capital utilization efficiency across HODLMM pools. Measures what percentage of deployed liquidity is within the active trading range, identifies idle "dead capital" in out-of-range bins, and scores overall capital efficiency to help LPs optimize their deployments.

1. Run `doctor` first. If any check fails, surface the connectivity issue and stop.
2. Use `run --pool <id>` for single-pool utilization analysis.
3. If efficiency is LOW, drill down with `hodlmm-bin-analyzer` for per-bin detail.
4. Use `scan` to compare capital efficiency across all HODLMM pools.
5. Combine with `hodlmm-entry-optimizer` for repositioning decisions.
6. Combine with `hodlmm-rebalance-signal` for drift-aware rebalancing.

## When to use which command

| Situation | Command |
|-----------|---------|
| Check if a specific position's capital is working | `run --pool <id>` |
| Find most/least efficient pools | `scan --sort efficiency` |
| Identify where idle capital is highest | `scan --sort idle` |
| Pre-deployment efficiency check | `run --pool <id> --radius 20` |

## Guardrails

- **Read-only**: No wallet operations, no transactions
- Bin scanning bounded by radius (default 10) to limit API calls
- Handles missing bin data gracefully (returns zero reserves)
- Uses Hiro read-only endpoint — no sender address issues

## Output Contract

All commands output JSON to stdout with `tool: "hodlmm-bin-utilization"` field.

| Field | Type | Always Present |
|-------|------|----------------|
| `tool` | string | yes |
| `command` | string | yes |
| `timestamp` | ISO string | yes |
| `error` | string | on failure only |

## Error Handling

- API failure: return `{ error: "..." }` with descriptive message
- No bins found: return utilization with 0 active bins and LOW_EFFICIENCY signal
- Pool not found: return error with pool query that failed

## Related Skills

- `hodlmm-bin-analyzer` — Detailed per-bin reserve analysis
- `hodlmm-entry-optimizer` — Optimal bin range for new positions
- `hodlmm-rebalance-signal` — Position drift monitoring
- `hodlmm-market-depth` — Liquidity depth and slippage estimation
- `hodlmm-portfolio-tracker` — Full position dashboard
