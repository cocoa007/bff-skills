---
name: hodlmm-il-calculator-agent
skill: hodlmm-il-calculator
description: "IL risk assessment for HODLMM concentrated LP positions. Models impermanent loss across price scenarios and compares against fee income to find breakeven thresholds. Read-only — no funds required."
---

# Agent Behavior — HODLMM IL Calculator

## Decision order

1. Run `doctor` first. If Bitflow APIs are unreachable, stop and surface the error.
2. For `assess`: validate pool exists. Present IL scenarios as a table with clear PROFITABLE/LOSS verdicts.
3. For `breakeven`: show how breakeven tolerance improves with longer hold periods. Highlight the crossover point.
4. For `compare`: surface the risk-adjusted ranking. Explain that the best pool balances fee income against IL tolerance.
5. Always surface `disclaimer` and `warnings`.

## Key rules

- **Always pair with yield projector.** This skill shows the risk side; yield projector shows the reward side. Recommend running both before any LP decision.
- **IL is not a loss until you withdraw.** When presenting IL numbers, clarify that IL is "impermanent" — if price returns to entry, IL disappears. But concentrated positions can go fully out-of-range, making recovery less likely.
- **Amplification context.** Always explain what the amplification factor means: "Your 11-bin range experiences ~9.5x the IL of a full-range AMM position for the same price move."
- **Breakeven is the key number.** The most actionable output is the breakeven threshold — "price can move X% before IL exceeds your fee income." Lead with this.
- **Never minimize IL risk.** Concentrated LP positions can lose significant value on price moves. Don't sugarcoat scenarios where `verdict: "LOSS"`.
- **Recommend safety check.** Before any capital deployment, recommend `hodlmm-safety-check` (PR #127) for token/pool security and `hodlmm-rebalance-signal` (PR #146) for drift monitoring.

## Guardrails

- Never proceed past an API error without surfacing it.
- Never describe IL estimates as exact — they are geometric approximations.
- Never recommend specific capital amounts or position sizes.
- Default to `--bin-range active` and `--hold-days 30` when not specified.
- When showing `compare` results, explain the risk-adjusted scoring method.

## On error

- Log full error payload.
- Do not retry silently — surface the error with a suggested next action.
- For API errors: suggest `doctor` to verify connectivity.
- For pool-not-found: list valid pool IDs.

## On success

- Lead with breakeven thresholds: "Your fees cover up to a X% price drop over Y days."
- Present IL scenarios as a ranked list from least to most severe.
- For `compare`: highlight the top pool but note trade-offs (high yield but narrow breakeven = risky).
- For `breakeven`: show how the safe range widens with longer hold periods.
- Always end with the disclaimer.

## Workflow integration

This skill is step 1b in the HODLMM LP deployment pipeline — the risk counterpart to yield projection:

```
0.  hodlmm-volume-pulse     →  is NOW a good time? (entry timing)
1a. hodlmm-yield-projector  →  how much will I earn? (fee income)
1b. hodlmm-il-calculator    →  how much could I lose? (IL risk) ← this skill
2.  hodlmm-safety-check     →  is it safe? (token/pool security)
3.  hodlmm-bin-analyzer     →  bin depth & spread analysis
4.  hodlmm-rebalance-signal →  position drift monitoring
5.  add-liquidity           →  deploy (human approval required)
```

Steps 0-4 are all read-only. Run all before deploying capital.

## Output contract

Always parse and relay these fields:

| Field | Relay as |
|---|---|
| `breakeven.downside.breakeven_price_move_pct` | "Downside breakeven: X% price drop" |
| `breakeven.upside.breakeven_price_move_pct` | "Upside breakeven: X% price rise" |
| `risk_summary.il_amplification` | "IL amplification: Xx vs full-range AMM" |
| `il_scenarios[].verdict` | Show PROFITABLE in green context, LOSS in red context |
| `fee_projection.projected_fee_income_pct` | "Projected fee income: X% over Y days" |
| `warnings` | Surface all warnings verbatim |
| `disclaimer` | Always show — never omit |
