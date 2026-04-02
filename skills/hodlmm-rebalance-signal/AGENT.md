---
name: hodlmm-rebalance-signal-agent
skill: hodlmm-rebalance-signal
description: "Concentrated LP position drift monitor for Bitflow HODLMM pools — tracks active bin drift relative to a position range and signals HOLD, MONITOR, or REBALANCE. Read-only. Never submits transactions."
---

# Agent Behavior — HODLMM Rebalance Signal

## Decision order

1. Run `doctor` first. If any check fails, surface the connectivity issue and stop.
2. Run `check --pool-id <id> --position-low <bin> --position-high <bin>` with the LP's actual position range.
3. Act on the signal:
   - **HOLD** — no action required. Log the signal and check again at next scheduled interval.
   - **MONITOR** — drift is increasing but position still earning. Increase monitoring frequency. Prepare rebalance parameters but do not execute.
   - **REBALANCE** — position is out of range and earning zero fees. Escalate to a write-capable skill or human approval for execution.
4. Run `scan` for a daily overview of all pools before selecting a new entry pool.

## Guardrails

- **Never execute transactions.** This skill is analytics-only. Rebalancing must go through a separate write skill with explicit human approval.
- **Never assume the position range.** Always require `--position-low` and `--position-high` from the user or calling context. Do not guess or interpolate from historical data.
- **Never ignore REBALANCE signals.** Log them, escalate them, and record the timestamp. A REBALANCE signal that is ignored for more than 24h represents meaningful missed fee income.
- **Never act on `scan` output alone.** The scan command shows pool-level drift context. Always run `check` with the actual position range before deciding to rebalance.
- **Always surface fee opportunity cost.** The `missedFeesDailyUsd` field should be included in any escalation message to help humans understand the urgency.

## Signal handling

| Signal | Agent Action |
|---|---|
| HOLD | Log signal. Schedule next check in 4-8 hours. No escalation. |
| MONITOR | Log signal with drift metrics. Schedule next check in 1-2 hours. Prepare rebalance params for fast execution if signal escalates. |
| REBALANCE | Log signal with full context. Immediately escalate to human or write-capable agent. Include `missedFeesDailyUsd` in message. Do not wait for next scheduled cycle. |

## Integration chain (HODLMM LP pipeline)

```
hodlmm-safety-check           → gate: is this pool safe to enter?
hodlmm-bin-analyzer bins      → inspect active bin depth and composition
hodlmm-yield-projector estimate → project fee yield for target range
hodlmm-rebalance-signal check → monitor: is the position still earning?
[human approval]               → rebalance: withdraw + redeposit at new range
hodlmm-rebalance-signal check → confirm: is the new position in range?
```

## On error

- Log the full `{ "status": "error", "error": "..." }` payload.
- Do not retry silently — surface the failed endpoint.
- If `doctor` fails, pause all monitoring and report the connectivity issue.
- If pool is not found, confirm pool ID is valid via `hodlmm-bin-analyzer pools`.

## On HOLD signal

- Report the current `drift.binsFromCenter` — even a held position can be trending toward the boundary.
- If `drift.binsFromCenter` increased since last check, note the trend even though signal is still HOLD.

## On MONITOR signal

- Always report `drift.binsFromNearestEdge` — how many bins until the position goes out of range.
- Calculate time-to-rebalance estimate if you have historical drift rate data.
- Set a reminder to check again in 1-2 hours or at the next Stacks block interval.

## On REBALANCE signal

- Report `signal`, `signalReason`, `feeOpportunityCost.missedFeesDailyUsd`, and `timestamp` in the escalation message.
- Do not delay. Every block that passes while the position is out of range is lost fee revenue.
- Suggested rebalance target: center a new position range on the current active bin with the same width as the original position.

## Disclaimer

This skill is informational only. Rebalancing has transaction costs, IL risk, and market timing risk. All signals are for decision-support — final rebalance decisions require human or operator approval.
