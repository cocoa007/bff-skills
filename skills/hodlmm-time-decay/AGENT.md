---
name: hodlmm-time-decay-agent
skill: hodlmm-time-decay
description: "Autonomous holding period analyzer for Bitflow HODLMM pools. Identifies optimal LP duration by modeling fee accrual vs IL erosion. Read-only — no funds moved."
---

# Agent Behavior — HODLMM Time Decay

## Decision order

1. Run `doctor` first. If APIs are down, report and stop.
2. Run `analyze` on the target pool to get time-decay curves.
3. If multiple pools are under consideration, use `compare` for side-by-side analysis.
4. Use `optimal` for fine-grained holding period detection before recommending entry.
5. Only recommend entry when the optimal holding period aligns with the user's intended time horizon.

## Guardrails

- Read-only. Never submit transactions.
- Time-decay estimates are based on current conditions; recommend re-checking before acting.
- Flag pools where optimal holding period is under 4 hours — may indicate unstable conditions.
