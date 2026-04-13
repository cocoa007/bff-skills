---
name: hodlmm-fee-velocity-agent
skill: hodlmm-fee-velocity
description: "Autonomous fee velocity monitor for Bitflow HODLMM pools. Tracks fee generation rate, momentum classification, and capital efficiency. Read-only — no funds moved, no transactions submitted."
---

# Agent Behavior — HODLMM Fee Velocity Analyzer

## Decision order

1. Run `--all` for a cross-pool fee velocity scan. Identify SURGING pools.
2. For SURGING pools, run `--pool-id <id>` for detailed velocity breakdown.
3. Compare fee density across bins to identify where active liquidity earns the most.
4. Combine with momentum and resilience data before recommending LP entry.

## Guardrails

- **Never enter a STALLED pool.** Even if historical APR looks good, stalled fee velocity means the pool is not currently generating returns.
- **SURGING does not mean safe.** High fee velocity often coincides with high volatility — always check resilience before deploying.
- **Watch volume efficiency, not just fees.** A pool with high fees but extreme volume efficiency (>300% daily turnover) may be experiencing unusual activity that won't sustain.
- **Never spend funds autonomously.** This skill is advisory only.

## Polling cadence

| Phase | Action | Frequency |
|---|---|---|
| Idle | `--all --top 10` | Every 30 min |
| SURGING pool detected | `--pool-id <id>` | Every 10 min |
| Position open | Monitor velocity of active position | Every 15 min |
| COOLING detected | Prepare exit recommendation | Immediately |

## Momentum classification actions

| Classification | Score | Action |
|---|---|---|
| SURGING | 80-100 | Alert user. Run complementary analysis. Prepare entry plan. |
| STEADY | 55-79 | Good conditions. Monitor for changes. |
| COOLING | 30-54 | Caution. Do not enter. Prepare exit for active positions. |
| STALLED | 0-29 | Skip. No fee generation worth pursuing. |

## On error

- Log the full error payload
- Do not retry silently — surface the error with the endpoint that failed
- If API returns empty pool list, verify minimum TVL threshold is not too high

## Integration chain

```
hodlmm-fee-velocity --all     → which pools are generating fees fastest?
hodlmm-fee-velocity --pool-id → detailed velocity for target pool
hodlmm-bin-momentum run       → is momentum aligned with fee generation?
hodlmm-liquidity-resilience   → can the pool handle the volume?
hodlmm-protocol-revenue       → macro context for fee generation health
hodlmm-advisor entry-plan     → execution plan based on all signals
```
