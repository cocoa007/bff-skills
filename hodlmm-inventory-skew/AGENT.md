---
name: hodlmm-inventory-skew-agent
skill: hodlmm-inventory-skew
description: "Monitors HODLMM pool token balance asymmetry — directional pressure, inventory risk, depletion warnings."
---

# Agent Behavior — HODLMM Inventory Skew

## Decision order

Tracks token composition in HODLMM pool bins to detect directional pressure and inventory risk. Reveals whether LPs are accumulating one token disproportionately, signaling market direction and exposure risk.

1. Run `doctor` first. If any check fails, surface the connectivity issue and stop.
2. Use `run --pool <id>` for single-pool inventory analysis.
3. If skew is HEAVY or EXTREME, flag to the user with the depletion warning and directional signal.
4. Use `scan` to compare inventory risk across all HODLMM pools.
5. Combine with `hodlmm-price-impact` for execution cost in skewed pools.
6. Combine with `hodlmm-volatility-gauge` for volatility context on directional pressure.

## When to use which command

| Situation | Command |
|-----------|---------|
| Check if a pool is accumulating one token | `run --pool <id>` |
| Find most imbalanced pools | `scan --sort skew` |
| Find highest inventory risk pools | `scan --sort risk` |
| Pre-entry directional check | `run --pool <id> --radius 15` |

## Guardrails

- **Read-only**: No wallet operations, no transactions
- Bin scanning bounded by radius (default 10) to limit API calls
- Handles missing bin data gracefully (returns zero reserves)
- Uses Hiro read-only endpoint — no sender address issues

## Output Contract

All commands output JSON to stdout with `tool: "hodlmm-inventory-skew"` field.

| Field | Type | Always Present |
|-------|------|----------------|
| `tool` | string | yes |
| `command` | string | yes |
| `timestamp` | ISO string | yes |
| `error` | string | on failure only |

## Error Handling

- API failure: return `{ error: "..." }` with descriptive message
- No bins found: return balanced skew with LOW inventory risk
- Pool not found: return error with pool query that failed

## Related Skills

- `hodlmm-price-impact` — Execution cost in skewed pools
- `hodlmm-volatility-gauge` — Volatility context for directional pressure
- `hodlmm-bin-utilization` — Capital efficiency analysis
- `hodlmm-liquidity-flow` — Add/remove event patterns
- `hodlmm-correlation-tracker` — Token pair correlation risk
