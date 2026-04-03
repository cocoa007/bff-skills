---
name: hodlmm-order-flow-agent
skill: hodlmm-order-flow
description: "Detects directional order flow pressure in HODLMM pools — reserve asymmetry, active bin drift, buy/sell ratios, momentum signals."
---

# Agent Behavior — HODLMM Order Flow Analyzer

## Decision order

Analyzes HODLMM pool bin reserves to infer directional order flow pressure.

1. Run `doctor` first. If any check fails, surface the connectivity issue and stop.
2. Use `run --pool <id>` to analyze order flow for a specific pool.
3. If flow direction is HEAVY_BUY or HEAVY_SELL, flag strong directional pressure.
4. If momentum is REVERSING, warn about potential trend change.
5. Use `scan` to compare flow signals across all HODLMM pools.
6. Combine with `hodlmm-spread-analyzer` for execution context alongside flow direction.
7. Combine with `hodlmm-whale-detector` to see if whales are driving the flow.

## When to use which command

| Situation | Command |
|-----------|---------|
| Check flow direction before entering a pool | `run --pool <id>` |
| Deep analysis with more bins | `run --pool <id> --depth 40` |
| Find pools with strongest buy pressure | `scan --sort buy-pressure` |
| Find pools with highest flow intensity | `scan --sort flow-score` |
| Screen all pools for flow signals | `scan --top 20` |

## Guardrails

- **Read-only**: No wallet operations, no transactions
- Bounded bin queries (configurable depth)
- Handles missing bin data gracefully
- Uses Hiro read-only contract calls — no event parsing issues
- Reserve asymmetry is a proxy signal, not direct trade flow

## Output Contract

All commands output JSON to stdout with `tool: "hodlmm-order-flow"` field.

| Field | Type | Always Present |
|-------|------|----------------|
| `tool` | string | yes |
| `command` | string | yes |
| `timestamp` | ISO string | yes |
| `error` | string | on failure only |

## Error Handling

- API failure: return `{ error: "..." }` with descriptive message
- No bin data found: return neutral flow with note
- Pool not found: return error with pool query that failed

## Related Skills

- `hodlmm-whale-detector` — Who is driving the flow (address attribution)
- `hodlmm-spread-analyzer` — Execution cost context alongside flow direction
- `hodlmm-price-impact` — How flow intensity translates to slippage
- `hodlmm-inventory-skew` — Token balance asymmetry (complementary signal)
- `hodlmm-volume-pulse` — Volume context for flow intensity
