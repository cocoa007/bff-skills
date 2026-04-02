---
name: hodlmm-position-health-agent
skill: hodlmm-position-health
description: "Monitors HODLMM LP position health with composite scoring across drift, IL, fees, volatility, and flow dimensions."
---

# Agent Behavior — HODLMM Position Health

## Decision order

1. Run `doctor` first. If any check fails, surface the connectivity issue and stop.
2. Run `check` for a quick composite score. If status is `HEALTHY`, no further action needed.
3. If status is `CAUTION`, increase polling frequency and watch for deterioration.
4. If status is `WARNING`, identify the weakest dimension and recommend corrective action.
5. If status is `CRITICAL`, alert user immediately with specific action steps.

## Guardrails

- **Never act on a single snapshot.** Confirm status by running `check` at least twice across a 5-minute window before recommending action.
- **Never recommend exit on CAUTION alone.** CAUTION means monitor, not panic.
- **Never skip dimension analysis.** The weakest dimension drives the recommendation — always surface it.
- **Never spend funds autonomously.** This skill is advisory only. All execution requires explicit human confirmation.
- **Graceful degradation.** If Hiro API fails, `check` mode still works using Bitflow App API data only — clearly note reduced accuracy.

## Polling cadence

| Health Status | Action | Frequency |
|---|---|---|
| HEALTHY | `check --pool <id>` | Every 30 min |
| CAUTION | `check --pool <id>` | Every 10 min |
| WARNING | `run --pool <id>` (full analysis) | Every 5 min |
| CRITICAL | Alert user + `run --pool <id>` | Immediate |

## Status to action mapping

| Status | Weakest Dimension | Action |
|---|---|---|
| HEALTHY | any | No action. Continue idle polling. |
| CAUTION | drift | Monitor — bin may return to center naturally. |
| CAUTION | ilExposure | Monitor — check if asymmetry is increasing. |
| CAUTION | feeEfficiency | Check if volume is trending down via hodlmm-pulse. |
| CAUTION | volatility | Check regime via hodlmm-volatility-gauge. |
| CAUTION | flowMomentum | Monitor — single-period outflow may reverse. |
| WARNING | drift | **Recommend rebalancing** — position drifting out of range. |
| WARNING | ilExposure | **Recommend range adjustment** — IL accumulating. |
| WARNING | feeEfficiency | **Recommend migration** — pool not generating sufficient fees. |
| WARNING | volatility | **Recommend widening range** or reducing exposure. |
| WARNING | flowMomentum | **Recommend exit evaluation** — sustained outflows. |
| CRITICAL | any | **Alert user immediately.** Recommend exit or emergency rebalance. |

## On error

- Log the full `{ "error": "..." }` payload
- Do not retry silently — surface the error with the endpoint that failed
- If `doctor` reports API failure, pause all polling and alert user
- If on-chain data unavailable, fall back to `check` mode and note reduced accuracy

## On success

- For `check`: present composite score, status, and weakest dimension
- For `run`: present full dimension breakdown with specific recommendations
- Always compare to previous score if available — flag score changes > 10 points

## Integration chain

```
hodlmm-position-health check    --> quick triage: is position OK?
hodlmm-position-health run      --> deep analysis: which dimension is weak?
hodlmm-volatility-gauge run     --> drill into volatility dimension
hodlmm-pulse scan               --> drill into fee/volume dimension
hodlmm-risk run                 --> drill into IL dimension
bitflow withdraw-liquidity-simple --> exit (human approval required)
bitflow add-liquidity-simple     --> rebalance (human approval required)
```
