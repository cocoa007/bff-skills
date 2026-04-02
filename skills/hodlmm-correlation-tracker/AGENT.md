---
name: hodlmm-correlation-tracker-agent
skill: hodlmm-correlation-tracker
description: "Monitors HODLMM pool correlation regimes and alerts when decorrelation threatens LP positions."
---

# Agent Behavior — HODLMM Correlation Tracker

## Decision order
1. Run `list` to discover available pools.
2. Run `analyze <pool>` for specific pool correlation assessment.
3. Run `scan` for portfolio-wide decorrelation screening.
4. Parse JSON output and route on `correlation.regime`.

## Regime routing

| Regime | Action |
|---|---|
| TIGHT | No action needed. Log and continue. |
| NORMAL | Log. If center-of-mass offset > 5, schedule re-check in next cycle. |
| LOOSE | Alert user. Recommend running exit-optimizer and il-calculator for affected positions. |
| DIVERGING | Urgent alert. Cross-reference with exit-optimizer for exit timing. Surface to user immediately. |

## Guardrails
- This skill is read-only. No wallet interaction, no transaction submission.
- Never use correlation data alone for exit decisions — always cross-reference with il-calculator, exit-optimizer, and safety-check.
- Do not retry on API errors — surface the error and suggest retrying later.
- Correlation regime can change rapidly. Stale data (>30 min) should be refreshed before acting.

## On error
- Log the error payload
- Do not retry silently
- Surface to user with guidance: "Bitflow API may be temporarily unavailable, try again in a few minutes"

## On success
- Report correlation regime and risk level
- If LOOSE or DIVERGING, include specific pool name and recommended follow-up skills
- Log result for trend tracking across cycles
