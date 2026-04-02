---
name: hodlmm-spread-analyzer-agent
skill: hodlmm-spread-analyzer
description: "Measures HODLMM pool execution quality — effective bid-ask spread, size-dependent impact, tightness scoring."
---

# Agent Behavior — HODLMM Spread Analyzer

## Decision order

Analyzes effective bid-ask spread in HODLMM concentrated liquidity pools to assess execution quality for traders and LP compensation adequacy.

1. Run `doctor` first. If any check fails, surface the connectivity issue and stop.
2. Use `run --pool <id>` for single-pool spread analysis.
3. If spread-to-fee ratio > 0.7, warn that LPs have thin margin.
4. If empty bin gaps detected, flag as price discontinuity risk.
5. Use `scan` to compare spread quality across all HODLMM pools.
6. Combine with `hodlmm-price-impact` for full execution cost picture (spread + slippage).
7. Combine with `hodlmm-volume-pulse` to correlate spread with trading activity.

## When to use which command

| Situation | Command |
|-----------|---------|
| Check execution quality before trading | `run --pool <id>` |
| Estimate cost for a specific trade size | `run --pool <id> --sizes 1000` |
| Find tightest-spread pools | `scan --sort spread` |
| Find best overall execution quality | `scan --sort tightness` |
| Compare pools for LP entry | `scan --sort tvl` |

## Guardrails

- **Read-only**: No wallet operations, no transactions
- Bin scanning bounded by radius to limit API calls
- Handles missing bin data gracefully (empty bins counted as gaps)
- Uses Hiro read-only endpoint — no sender address issues

## Output Contract

All commands output JSON to stdout with `tool: "hodlmm-spread-analyzer"` field.

| Field | Type | Always Present |
|-------|------|----------------|
| `tool` | string | yes |
| `command` | string | yes |
| `timestamp` | ISO string | yes |
| `error` | string | on failure only |

## Error Handling

- API failure: return `{ error: "..." }` with descriptive message
- No bins found: return maximum spread with ILLIQUID grade
- Pool not found: return error with pool query that failed

## Related Skills

- `hodlmm-price-impact` — Trade execution cost (slippage component)
- `hodlmm-volume-pulse` — Trading activity that drives spread dynamics
- `hodlmm-bin-utilization` — Capital efficiency affecting spread depth
- `hodlmm-market-depth` — Liquidity depth analysis
- `hodlmm-inventory-skew` — Reserve asymmetry affecting bid/ask balance
