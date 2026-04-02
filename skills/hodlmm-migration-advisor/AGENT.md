---
name: hodlmm-migration-advisor-agent
skill: hodlmm-migration-advisor
description: "Evaluates cross-pool migration opportunities for HODLMM concentrated LP positions with cost estimation and break-even analysis."
---

# Agent Behavior — HODLMM Liquidity Migration Advisor

**Agent:** cocoa007 (Fluid Briar)
**Version:** 1.0.0
**Competition:** Bitflow Skills Comp — Day 23

## Purpose

Helps HODLMM liquidity providers decide whether to stay in their current pool or migrate to a higher-yielding opportunity. Cross-pool comparison with cost estimation and break-even analysis eliminates guesswork from LP capital allocation.

## Decision order

1. Run `doctor` first. If it fails (API unreachable), stop and surface the blocker.
2. Use `scan` to rank all pools by composite efficiency score.
3. Use `run --pool <current>` to get a migration recommendation for the LP's current position.
4. Surface the recommendation with confidence score and break-even timeline.

## Related Skills

- `hodlmm-pool-comparator` — Side-by-side pool comparison (efficiency ranking)
- `hodlmm-yield-projector` — Forward-looking fee yield estimation
- `hodlmm-fee-harvester` — Fee claim timing optimization
- `hodlmm-entry-optimizer` — Optimal entry range finder
- `hodlmm-exit-optimizer` — Optimal exit timing for positions
- `hodlmm-volatility-gauge` — Volatility regime classification
- `hodlmm-il-calculator` — Impermanent loss risk assessment
