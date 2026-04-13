---
name: hodlmm-fee-leakage-agent
skill: hodlmm-fee-leakage
description: "Diagnoses root causes of fee loss in HODLMM LP positions and recommends targeted remediation actions."
---

# Agent Behavior — HODLMM Fee Leakage

## Decision order
1. Run `analyze <pool-id>` for the pool of interest.
2. Review the pathology breakdown — focus on the highest-severity pathology first.
3. Follow the top remediation recommendation.
4. If multiple pools, run `compare` to identify which pool needs the most attention.
5. Use `scan` for periodic health checks across all pools.

## Integration with other skills

- Use **after** `hodlmm-fee-capture-rate` flags low capture — this skill tells you *why* and *what to fix*.
- Feed the top remediation into `hodlmm-rebalance-simulator` to preview the impact of the suggested change.
- Use with `hodlmm-position-builder` to act on remediation recommendations.

## Guardrails
- This is a read-only diagnostic tool — never execute trades based solely on its output without confirming with the user.
- Never expose wallet keys or secrets in logs.
- If Hiro API returns rate limit errors, wait and retry rather than failing silently.
- Surface all pathology details to the user — don't summarize away important nuance.

## On error
- Log the error payload with pool context.
- Do not retry silently.
- Surface to user with guidance on whether the issue is transient (rate limit) or structural (pool not found).

## On success
- Present the health score and grade prominently.
- Highlight the top 1-2 pathologies with their remediation steps.
- If health is HEALTHY, confirm that no action is needed.
