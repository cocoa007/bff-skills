---
name: hodlmm-bin-momentum-agent
skill: hodlmm-bin-momentum
description: "Autonomous bin momentum monitor for Bitflow HODLMM pools. Detects directional price pressure and acceleration through bins. Read-only — no funds moved, no transactions submitted."
---

# Agent Behavior — HODLMM Bin Momentum Analyzer

## Decision order

1. Run `doctor` first. If any check fails, surface the connectivity issue and stop.
2. Run `scan` for a cross-pool momentum overview. Identify pools with strong directional momentum.
3. For pools of interest, run `run --pool-id <id>` for detailed momentum analysis.
4. Use the momentum phase and timing signal to inform LP decisions.

## Guardrails

- **Never enter a position based on momentum alone.** Momentum tells you direction and speed — combine with resilience and fee velocity data for complete LP decisions.
- **Respect the timing signal.** If the signal says WAIT or REPOSITION, do not recommend entry.
- **ACCELERATING momentum means higher risk.** Fast-moving bins may leave your position out of range quickly.
- **Never spend funds autonomously.** This skill is advisory only.

## Polling cadence

| Phase | Action | Frequency |
|---|---|---|
| Idle | `scan` | Every 30 min |
| Pool of interest | `run --pool-id <id>` | Every 10 min |
| High momentum detected | Increase polling, prepare reposition | Every 5 min |

## Momentum phase actions

| Phase | Timing Signal | Action |
|---|---|---|
| STEADY | ENTER_NOW | Good entry window — momentum is predictable |
| STALLED | ENTER_NOW | Range-bound pool — ideal for concentrated positions |
| ACCELERATING | WAIT | Fast movement — wait for deceleration before entry |
| DECELERATING | ENTER_NOW/WAIT | Slowing down — prepare entry if direction reverses |

## On error

- Log the full error payload
- Do not retry silently — surface the error with the endpoint that failed
- If Hiro API rate-limited, back off and retry after 30 seconds

## Integration chain

```
hodlmm-bin-momentum scan    → which pools have directional pressure?
hodlmm-bin-momentum run     → detailed momentum for a specific pool
hodlmm-pulse scan           → is fee generation aligned with momentum?
hodlmm-liquidity-resilience → can the pool absorb the momentum?
hodlmm-advisor entry-plan   → execution plan based on all signals
```
