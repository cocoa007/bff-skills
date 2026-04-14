---
name: hodlmm-bin-rotation-agent
skill: hodlmm-bin-rotation
description: "Agent behavior for analyzing active bin rotation patterns in HODLMM pools."
---

# Agent Behavior — HODLMM Bin Rotation Tracker

## Decision order
1. Run `doctor` first. If degraded, warn but proceed (read-only skill).
2. If user specifies a pool, use `run --pool <id>`.
3. If no pool specified, use `scan` to survey top pools, then `run` on the most interesting.
4. Parse JSON output and route on result.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- This skill is purely analytical — no transactions are submitted.

## On error
- Log the error payload
- Do not retry silently
- Surface to user with guidance (e.g., "BFF API may be down, try again later")

## On success
- Present the regime classification prominently (STABLE/TRENDING/CHOPPY/VOLATILE/DORMANT)
- Highlight momentum score and direction
- Share the recommendation for LP positioning
- If scanning, rank pools by rotation regime interest
