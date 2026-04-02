---
name: hodlmm-volume-pulse-agent
skill: hodlmm-volume-pulse
description: "Fee generation intensity monitor for Bitflow HODLMM pools. Scans volume:TVL efficiency, classifies pools as HOT/WARM/COOL/COLD, and provides LP entry timing signals with concentration analysis."
---

# Agent Behavior — HODLMM Volume Pulse

## Decision order

1. Run `doctor` first. If Bitflow APIs are unreachable, stop and surface the error.
2. For `pulse`: fetch all DLMM pools, compute efficiency ratios, and rank. Default sort is by efficiency.
3. For `hotspot`: identify target pool (explicit or auto-detect highest efficiency with TVL > $100), then fetch bins for concentration analysis and build LP entry scenarios.
4. Always surface the `disclaimer` — efficiency ratios are snapshots, not predictions.

## Key rules

- **Always show the signal classification.** HOT/WARM/COOL/COLD is the primary output agents will act on.
- **Context matters.** A HOT signal on a $500 TVL pool is less actionable than a WARM signal on a $500k pool. Surface TVL alongside efficiency.
- **Volume is not permanent.** Remind users that today's HOT pool could be tomorrow's COLD pool. Efficiency ratios are based on 24h volume only.
- **Pair with safety check.** Before any capital deployment based on volume pulse signals, recommend running `hodlmm-safety-check` to verify token/pool security.
- **Concentration analysis.** When presenting `hotspot` results, explain what the Gini coefficient means: higher = liquidity concentrated in fewer bins = harder to compete for fees near active bin.

## Guardrails

- Never describe HOT signals as "guaranteed" opportunities — they indicate current intensity, not future persistence.
- Never recommend specific capital amounts or bin ranges based solely on pulse data — that requires yield projector and safety check output.
- If all pools are COLD, say so clearly. "No good LP opportunities right now" is valid advice.
- Do not retry on API error — surface the error and suggest `doctor`.

## On success

- For `pulse`: lead with the summary (X HOT, Y WARM), then highlight the top opportunity if one exists.
- For `hotspot`: lead with the signal, show concentration profile, then present LP entry scenarios with risk labels.
- Always end with: "Based on 24h volume snapshot. Run hodlmm-safety-check before deploying capital."

## On error

- Log full error payload
- Suggest running `doctor` to verify API connectivity
- For pool-not-found: list available pool IDs

## Workflow integration

This skill is step 0 in the HODLMM LP pipeline — the entry-timing check:

```
0. hodlmm-volume-pulse     →  is NOW a good time? (this skill)
1. hodlmm-yield-projector  →  how much will I earn?
2. hodlmm-safety-check     →  is the pool safe?
3. hodlmm-bin-analyzer     →  liquidity depth analysis
4. hodlmm-rebalance-signal →  position drift monitoring
5. add-liquidity            →  deploy (human approval)
```
