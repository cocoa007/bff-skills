---
name: hodlmm-fee-harvester-agent
skill: hodlmm-fee-harvester
description: "Fee harvest timing optimizer for HODLMM concentrated LP positions. Analyzes accumulated fees, computes fee-to-gas ratio, and recommends when to harvest, compound, wait, or skip. Read-only -- no funds required."
---

# Agent Behavior -- HODLMM Fee Harvester

## Decision order

1. Run `doctor` first. If Hiro API or Bitflow APIs are unreachable, stop and surface the error.
2. For `run`: validate pool ID and position owner address. Fetch on-chain data first, fall back to pool-level estimation if position data is unavailable.
3. Present the recommendation prominently: HARVEST_NOW, COMPOUND, WAIT, or INSUFFICIENT.
4. Show fee-to-gas ratio and days until optimal harvest as the key actionable numbers.
5. Always surface `warnings` and `disclaimer`.

## Key rules

- **Never execute harvest transactions.** This skill is read-only. It recommends timing -- the human or a separate execution skill handles the actual claim.
- **Lead with the recommendation.** The most actionable output is the recommendation and fee-to-gas ratio. Present these first, then supporting details.
- **Context matters.** A COMPOUND recommendation means "fees are worth reinvesting" -- explain that compounding increases position size and future fee capture. A WAIT recommendation means "come back later" -- provide the estimated days.
- **Cross-reference with other skills.** Before recommending HARVEST_NOW, consider:
  - Is the position still in range? (use `hodlmm-il-calculator`)
  - Is the pool volume trending down? (use `hodlmm-volume-pulse`)
  - Should the position be rebalanced instead? (use `hodlmm-rebalance-signal` if available)
- **Gas cost transparency.** Always show the gas cost assumptions. If the user provides a custom STX price, use it; otherwise default to $0.50.
- **Fee estimation honesty.** When using pool-level estimates (no on-chain position data), clearly state that fees are estimated and may differ from actual accumulated amounts.

## Guardrails

- Never execute or recommend executing a transaction directly.
- Never proceed past an API error without surfacing it.
- Never describe fee estimates as exact when they are derived from pool-level volume/TVL.
- Never recommend harvesting when fee/gas ratio is below 1x.
- Default to `--days-held 7` and `--stx-price 0.5` when not specified.
- When presenting INSUFFICIENT, always include days-until-viable so the user knows when to check back.

## Allowed actions

- Read on-chain data via Hiro API (read-only contract calls)
- Read pool metadata from Bitflow App API
- Calculate fee accumulation estimates
- Present harvest timing recommendations

## Restricted actions

- No transaction submission or signing
- No wallet access
- No fund transfers
- No auto-harvesting or auto-compounding
- No position modification

## On error

- Log full error payload.
- Do not retry silently -- surface the error with a suggested next action.
- For API errors: suggest `doctor` to verify connectivity.
- For pool-not-found: suggest checking available pool IDs via the Bitflow App API.
- For position-not-found: note that the position may not exist or the address encoding may differ; fall back to pool-level estimation.

## On success

- Lead with: "Recommendation: [ACTION] -- [one-line reasoning]"
- Show fee-to-gas ratio: "Fee/gas ratio: X.Xx (threshold: 20x for harvest, 5x for compound)"
- Show accumulated fees: "$X.XX in fees (tokenX: N, tokenY: N)"
- Show time estimate: "Optimal harvest in ~N days" or "Ready to harvest now"
- Show daily accrual: "Accruing ~$X.XX/day in fees"
- Always end with the disclaimer.

## Output schema

Always parse and relay these fields:

| Field | Relay as |
|---|---|
| `recommendation` | "Recommendation: HARVEST_NOW / COMPOUND / WAIT / INSUFFICIENT" |
| `feeToGasRatio` | "Fee-to-gas ratio: Xx" |
| `fees.totalUsd` | "Accumulated fees: $X.XX" |
| `daysUntilOptimalHarvest` | "Optimal harvest in ~N days" or "Ready now" |
| `dailyAccrualEstimate` | "Daily accrual: ~$X.XX/day" |
| `reasoning` | Full reasoning text |
| `warnings` | Surface all warnings verbatim |
| `disclaimer` | Always show -- never omit |

## Workflow integration

This skill is a post-deployment monitoring tool -- it answers "when should I claim my accumulated fees?"

```
0.  hodlmm-volume-pulse        ->  is NOW a good time? (entry timing)
1a. hodlmm-yield-projector     ->  how much will I earn? (fee income)
1b. hodlmm-il-calculator       ->  how much could I lose? (IL risk)
2.  hodlmm-safety-check        ->  is it safe? (token/pool security)
3.  add-liquidity               ->  deploy (human approval required)
4.  hodlmm-portfolio-tracker   ->  monitor positions
5.  hodlmm-fee-harvester       ->  when to claim fees? <- this skill
6.  hodlmm-exit-optimizer      ->  when to exit?
```

Steps 0-2 and 4-6 are all read-only. Only step 3 requires human approval.
