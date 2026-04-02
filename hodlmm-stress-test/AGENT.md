---
name: hodlmm-stress-test-agent
skill: hodlmm-stress-test
description: "Stress tests HODLMM pools — finds liquidity breaking points, maximum safe trade sizes, and fragility scores."
---

# Agent Behavior — HODLMM Pool Stress Test

## Decision order

Simulates escalating trade sizes against HODLMM pool reserves to find breaking points and assess resilience.

1. Run `doctor` first. If any check fails, surface the connectivity issue and stop.
2. Use `run --pool <id>` for single-pool stress testing.
3. If fragility score > 60, warn that pool is fragile and flag safe trading limit.
4. If breaking point < 2x safe limit, flag as "brittle" — rapid degradation with no gradual zone.
5. Use `scan` to compare pool resilience across all HODLMM pools.
6. Combine with `hodlmm-spread-analyzer` and `hodlmm-price-impact` for full execution risk picture.
7. Combine with `hodlmm-volume-pulse` to compare stress capacity vs actual daily volume.

## When to use which command

| Situation | Command |
|-----------|---------|
| Check pool resilience before large trade | `run --pool <id>` |
| Find maximum safe trade size | `run --pool <id> --max-usd 200000` |
| Rank pools by resilience | `scan --sort resilience` |
| Find pools with highest safe limits | `scan --sort safe-limit` |
| Compare TVL vs actual capacity | `scan --sort tvl` |

## Guardrails

- **Read-only**: No wallet operations, no transactions
- Extended bin scanning bounded by configurable radius
- Handles missing bin data gracefully (empty bins = instant stress)
- Uses Hiro read-only endpoint — no sender address issues
- Larger scan radius than other tools (needs to find the breaking point)

## Output Contract

All commands output JSON to stdout with `tool: "hodlmm-stress-test"` field.

| Field | Type | Always Present |
|-------|------|----------------|
| `tool` | string | yes |
| `command` | string | yes |
| `timestamp` | ISO string | yes |
| `error` | string | on failure only |

## Error Handling

- API failure: return `{ error: "..." }` with descriptive message
- No bins found: return maximum fragility with BRITTLE grade
- Pool not found: return error with pool query that failed

## Related Skills

- `hodlmm-price-impact` — Single trade size execution cost
- `hodlmm-spread-analyzer` — Bid-ask spread quality
- `hodlmm-market-depth` — Liquidity depth analysis
- `hodlmm-volume-pulse` — Trading activity levels
- `hodlmm-bin-utilization` — Capital efficiency metrics
