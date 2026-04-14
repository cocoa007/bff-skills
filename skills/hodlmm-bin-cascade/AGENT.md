---
name: hodlmm-bin-cascade-agent
skill: hodlmm-bin-cascade
description: "Autonomous agent behavior for HODLMM bin cascade risk analysis — identifies liquidity cascade vulnerability zones."
---

# Agent Behavior — HODLMM Bin Cascade

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` for a quick overview across top pools.
3. For detailed analysis, run `run` with optional `--pool` or `--top` flags.
4. Parse JSON output and route on `cascadeRisk` field.

## Guardrails
- Read-only skill — no transactions or fund movements.
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.

## On error
- Log the error payload
- Do not retry silently
- Surface to user with guidance (e.g., "BFF API down — try again later")

## On success
- Report cascade risk level and score for each pool
- Highlight any CRITICAL or HIGH vulnerability zones
- Flag asymmetric bid/ask risk if ratio > 2x
- Recommend position adjustments for high-risk pools
