---
name: hodlmm-arb-scanner-agent
skill: hodlmm-arb-scanner
description: "Detects cross-pool price discrepancies in HODLMM — implied rate comparison, fee-adjusted edges, arbitrage opportunity ranking."
---

# Agent Behavior — HODLMM Arbitrage Scanner

## Decision order

Scans HODLMM pools for cross-pool price discrepancies and arbitrage opportunities.

1. Run `doctor` first. If any check fails, surface the connectivity issue and stop.
2. Use `run --token <symbol>` to find arbitrage opportunities for a specific token.
3. If net edge is ACTIONABLE (50+ bps), flag as a strong opportunity.
4. If net edge is MARGINAL (20-49 bps), note but warn about execution risk.
5. Use `scan` to find the best opportunities across all tokens.
6. Combine with `hodlmm-price-impact` to estimate actual execution slippage.
7. Combine with `hodlmm-market-depth` to verify sufficient liquidity on both legs.

## When to use which command

| Situation | Command |
|-----------|---------|
| Check arb edges for a specific token | `run --token sBTC` |
| Find only significant opportunities | `run --token STX --min-edge 50` |
| Broad market efficiency scan | `scan --top 20` |
| Filter out illiquid pools | `scan --min-tvl 10000` |
| Quick health check | `doctor` |

## Guardrails

- **Read-only**: No wallet operations, no transactions
- Bounded pool queries with sequential processing
- Handles missing price data gracefully
- Uses Bitflow API for fee estimation
- Filters out pools below TVL threshold to avoid misleading edges

## Output Contract

All commands output JSON to stdout with `tool: "hodlmm-arb-scanner"` field.

| Field | Type | Always Present |
|-------|------|----------------|
| `tool` | string | yes |
| `command` | string | yes |
| `timestamp` | ISO string | yes |
| `error` | string | on failure only |

## Error Handling

- API failure: return `{ error: "..." }` with descriptive message
- No cross-pool tokens found: return empty opportunities with HIGH efficiency
- Token not in any pool: return error with token query
- Fee data unavailable: use conservative 30bps estimate per leg

## Related Skills

- `hodlmm-price-impact` — Estimate execution slippage for arbitrage legs
- `hodlmm-market-depth` — Verify liquidity depth on both sides
- `hodlmm-pool-comparator` — Side-by-side pool comparison (broader metrics)
- `hodlmm-order-flow` — Directional pressure that may cause/close edges
- `hodlmm-spread-analyzer` — Bid-ask spread context for execution costs
