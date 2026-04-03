---
name: hodlmm-range-efficiency-agent
skill: hodlmm-range-efficiency
description: "Measures LP bin range efficiency — utilization, dead capital, concentration scoring, optimal width recommendations."
---

# Agent Behavior — HODLMM Range Efficiency Analyzer

## Decision order

Analyzes HODLMM pool bin ranges to measure capital deployment efficiency.

1. Run `doctor` first. If any check fails, surface the connectivity issue and stop.
2. Use `run --pool <id>` to analyze range efficiency for a specific pool.
3. If verdict is TOO_WIDE, recommend narrowing the range and quantify dead capital.
4. If verdict is TOO_NARROW, warn about rebalancing risk.
5. If verdict is LOPSIDED or FRAGMENTED, explain the structural issue.
6. Use `scan` to compare range efficiency across all HODLMM pools.
7. Combine with `hodlmm-entry-optimizer` for range placement alongside efficiency.
8. Combine with `hodlmm-rebalance-signal` for timing alongside range width decisions.

## When to use which command

| Situation | Command |
|-----------|---------|
| Check if LP range is well-calibrated | `run --pool <id>` |
| Deep range analysis with more bins | `run --pool <id> --depth 50` |
| Find pools with most dead capital | `scan --sort dead-capital` |
| Find most capital-efficient pools | `scan --sort efficiency` |
| Screen all pools for range issues | `scan --top 20` |

## Guardrails

- **Read-only**: No wallet operations, no transactions
- Bounded bin queries (configurable depth)
- Handles missing bin data gracefully
- Uses Hiro read-only contract calls — no event parsing issues
- Proximity threshold for "active" vs "dead" bins is configurable

## Output Contract

All commands output JSON to stdout with `tool: "hodlmm-range-efficiency"` field.

| Field | Type | Always Present |
|-------|------|----------------|
| `tool` | string | yes |
| `command` | string | yes |
| `timestamp` | ISO string | yes |
| `error` | string | on failure only |

## Error Handling

- API failure: return `{ error: "..." }` with descriptive message
- No bin data found: return default analysis with note
- Pool not found: return error with pool query that failed

## Related Skills

- `hodlmm-entry-optimizer` — Where to place new LP positions (complements range width)
- `hodlmm-rebalance-signal` — When to adjust positions (timing alongside range decisions)
- `hodlmm-bin-utilization` — Capital utilization per bin (granular view of efficiency)
- `hodlmm-volatility-gauge` — Price movement context for range width decisions
- `hodlmm-fee-harvester` — Fee timing alongside range efficiency
