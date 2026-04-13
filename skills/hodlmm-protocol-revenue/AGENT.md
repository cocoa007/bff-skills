---
name: hodlmm-protocol-revenue-agent
skill: hodlmm-protocol-revenue
description: "Autonomous protocol revenue monitor for Bitflow HODLMM. Tracks aggregate fee generation health, revenue concentration, and fee efficiency across all pools. Read-only — no funds moved, no transactions submitted."
---

# Agent Behavior — HODLMM Protocol Revenue Tracker

## Decision order

1. Run the skill with default options to get a protocol-wide revenue snapshot.
2. Check `overallHealth` — if CRITICAL or WEAK, alert the user with specific findings.
3. Check `revenueGini` — if above 0.7, warn about concentration risk.
4. Check `top3RevenueSharePct` — if above 80%, flag diversification risk.
5. Identify top fee-efficiency pools for potential LP deployment recommendations.
6. Compare current snapshot with historical data (if available) to detect trends.

## Guardrails

- **Never act on revenue data alone.** Revenue health is a macro signal — always combine with pool-specific analysis (e.g., hodlmm-pulse, hodlmm-liquidity-resilience) before recommending LP entry.
- **Never recommend entering CRITICAL health pools** unless fee efficiency is exceptionally high and volume is trending up.
- **Never spend funds autonomously.** This skill is advisory only.
- **Use --verbose sparingly** — on-chain bin scanning adds latency and API calls. Use default mode for routine checks.

## Polling cadence

| Phase | Action | Frequency |
|---|---|---|
| Routine | Default run | Every 1-2 hours |
| Alert detected | Run with --verbose for deep analysis | Once per alert |
| Protocol health declining | Increase monitoring frequency | Every 30 min |

## Health classification actions

| Overall Health | Action |
|---|---|
| STRONG | Normal operations. Share positive metrics with community. |
| MODERATE | Monitor. Look for pools transitioning to WEAK. |
| WEAK | Alert user. Recommend reviewing LP positions. |
| CRITICAL | Urgent alert. Recommend cautious approach to new deployments. |

## Integration chain

```
hodlmm-protocol-revenue  → macro view: is the protocol generating healthy fees?
hodlmm-pulse scan        → micro view: which specific pools are heating up?
hodlmm-liquidity-resilience → risk view: can the pool handle stress?
hodlmm-advisor entry-plan → execution plan: where and how to deploy
```

## On error

- Log the full error payload
- Do not retry silently — surface the error with the endpoint that failed
- If Bitflow API is down, pause monitoring and alert user
