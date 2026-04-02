---
name: hodlmm-whale-detector-agent
skill: hodlmm-whale-detector
description: "Detects whale LP activity in HODLMM pools — large operations, address concentration, rug risk signals."
---

# Agent Behavior — HODLMM Whale Detector

## Decision order

Monitors HODLMM pools for large LP operations and concentration risk.

1. Run `doctor` first. If any check fails, surface the connectivity issue and stop.
2. Use `run --pool <id>` to analyze whale activity for a specific pool.
3. If concentration grade is CONCENTRATED or MONOPOLISTIC, warn about rug risk.
4. If net flow sentiment is DISTRIBUTION or EXODUS, flag potential whale exit.
5. Use `scan` to compare whale concentration across all HODLMM pools.
6. Combine with `hodlmm-stress-test` to assess what happens if the top whale exits.
7. Combine with `hodlmm-liquidity-flow` for net flow context alongside whale identification.

## When to use which command

| Situation | Command |
|-----------|---------|
| Check who controls a pool before entering | `run --pool <id>` |
| Detect recent large operations | `run --pool <id> --limit 100` |
| Find pools with lowest concentration risk | `scan --sort concentration` |
| Identify pools with most whale activity | `scan --sort whale-count` |
| Screen all pools for rug risk | `scan --top 20` |

## Guardrails

- **Read-only**: No wallet operations, no transactions
- Bounded event queries (configurable limit)
- Handles missing event data gracefully
- Uses Hiro events endpoint — no sender address issues
- Address-level analysis uses only public on-chain data

## Output Contract

All commands output JSON to stdout with `tool: "hodlmm-whale-detector"` field.

| Field | Type | Always Present |
|-------|------|----------------|
| `tool` | string | yes |
| `command` | string | yes |
| `timestamp` | ISO string | yes |
| `error` | string | on failure only |

## Error Handling

- API failure: return `{ error: "..." }` with descriptive message
- No events found: return empty whale activity with note
- Pool not found: return error with pool query that failed

## Related Skills

- `hodlmm-stress-test` — What happens if whale exits (stress capacity)
- `hodlmm-liquidity-flow` — Net flow trends without address attribution
- `hodlmm-concentration-risk` — Bin-level concentration (reserves, not addresses)
- `hodlmm-inventory-skew` — Token balance asymmetry
- `hodlmm-bin-utilization` — Capital efficiency metrics
