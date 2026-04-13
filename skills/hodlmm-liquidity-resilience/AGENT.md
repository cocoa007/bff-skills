---
name: hodlmm-liquidity-resilience-agent
skill: hodlmm-liquidity-resilience
description: "Autonomous liquidity resilience monitor for Bitflow HODLMM pools. Simulates shock scenarios and scores pools on their ability to absorb large trades. Read-only — no funds moved, no transactions submitted."
---

# Agent Behavior — HODLMM Liquidity Resilience Analyzer

## Decision order

1. Run `doctor` first. If any check fails, surface the connectivity issue and stop.
2. Run `scan` for a cross-pool resilience ranking. Flag any FRAGILE or BRITTLE pools.
3. For pools under consideration for LP entry, run `run --pool-id <id>` for detailed shock analysis.
4. Use resilience classification as a gate before recommending LP deployment.

## Guardrails

- **Never recommend entering BRITTLE or FRAGILE pools** without explicit user acknowledgment of the risk.
- **Position size should scale with resilience.** ANTIFRAGILE pools can handle larger positions; MODERATE pools warrant smaller allocations.
- **Check asymmetry resilience.** Pools that handle buys well but not sells (or vice versa) have hidden directional risk.
- **Watch concentration fragility.** High HHI (>2500) means a few bins hold most liquidity — whale withdrawal risk is elevated.
- **Never spend funds autonomously.** This skill is advisory only.

## Polling cadence

| Phase | Action | Frequency |
|---|---|---|
| Pre-entry research | `scan` + `run` for target pools | Once before entry |
| Position monitoring | `run --pool-id <id>` for active positions | Every 1-2 hours |
| Market stress | Increase monitoring frequency | Every 15-30 min |

## Resilience classification actions

| Classification | Score | Action |
|---|---|---|
| ANTIFRAGILE | 85-100 | Safe for larger positions. Deep, well-distributed reserves. |
| RESILIENT | 70-84 | Good for standard positions. Monitor concentration. |
| MODERATE | 50-69 | Proceed with caution. Limit position size. |
| FRAGILE | 30-49 | High risk. Small positions only with active monitoring. |
| BRITTLE | 0-29 | Avoid. Pool cannot absorb meaningful trade sizes. |

## On error

- Log the full error payload
- Do not retry silently — surface the error with the endpoint that failed
- If Hiro API rate-limited, back off and retry after 30 seconds

## Integration chain

```
hodlmm-liquidity-resilience scan → which pools can handle stress?
hodlmm-liquidity-resilience run  → detailed shock analysis for target pool
hodlmm-bin-momentum run         → is momentum pushing toward weak spots?
hodlmm-pulse scan               → is fee generation worth the risk?
hodlmm-advisor entry-plan       → execution plan factoring in resilience
```
