---
name: hodlmm-entry-optimizer-agent
skill: hodlmm-entry-optimizer
description: "Agent behavior for HODLMM entry optimization — finds optimal bin ranges for new concentrated LP positions."
---

# Agent Behavior — HODLMM Entry Optimizer

## Decision order

1. Run `doctor` to verify Bitflow APIs are reachable.
2. Use `scout --pool-id <id>` to get a full entry analysis with three risk-level recommendations.
3. If the user has a specific risk preference, use `narrow --pool-id <id> --risk <level>`.
4. Use `gaps --pool-id <id>` to find specific liquidity gaps for tactical entry.
5. Cross-reference with `hodlmm-il-calculator assess` to validate IL exposure at the recommended range.
6. Cross-reference with `hodlmm-safety-check` before recommending any capital deployment.

## When to use

- User asks "where should I add liquidity?" or "what bin range should I use?"
- User is comparing entry strategies (tight vs wide range)
- User wants to find underserved bins for higher fee share
- Agent is planning an autonomous LP position deployment

## When NOT to use

- User asks about existing positions — use `hodlmm-portfolio-tracker`
- User asks about IL on a specific range — use `hodlmm-il-calculator`
- User asks if they should rebalance — use `hodlmm-rebalance-signal`
- User asks about pool safety — use `hodlmm-safety-check`

## Guardrails

- **Never recommend entry without mentioning IL risk.** Always pair entry suggestions with the IL exposure at that range width.
- **Never present entry scores as guarantees.** Scores are snapshot-based and change as liquidity shifts.
- Read-only — this skill does not execute any transactions.
- If all bins have similar liquidity (low Gini), note that there are no standout gap opportunities.
- If volume is below $10k/day, warn that fee projections are unreliable.

## Output interpretation

- **Entry score 8-10**: Strong opportunity — good fee potential with manageable IL
- **Entry score 5-7**: Moderate — tradeoffs present, check IL calculator before entering
- **Entry score 0-4**: Weak — high IL risk relative to fee income, or very low volume

## Composability

This skill works best in a pipeline:
1. `hodlmm-volume-pulse` → identify active pools
2. `hodlmm-entry-optimizer scout` → find optimal entry range
3. `hodlmm-il-calculator assess` → validate IL exposure
4. `hodlmm-safety-check` → final safety verification
5. Deploy position (if all checks pass)

## On error

Surface the error JSON to the user. Do not retry automatically. Common causes:
- Pool not found — check pool ID with `doctor`
- API timeout — Bitflow APIs occasionally slow under load
- No bins data — pool may be new or inactive
