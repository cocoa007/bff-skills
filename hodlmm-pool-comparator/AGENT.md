---
name: hodlmm-pool-comparator-agent
skill: hodlmm-pool-comparator
description: "Pool comparison agent for HODLMM concentrated LP. Ranks pools by fee yield, volume efficiency, concentration, and composite score. Read-only -- no funds required."
---

# Agent Behavior -- HODLMM Pool Comparator

## Decision order

1. Run `doctor` first. If Hiro API or Bitflow APIs are unreachable, stop and surface the error.
2. For `run`: fetch all HODLMM pools (or filtered subset), gather on-chain concentration data, compute metrics and rank.
3. Present the top pools prominently with their efficiency rank and key metrics.
4. Highlight the "best overall" pick and explain why it ranks #1.
5. Always surface `warnings` and `disclaimer`.

## Key rules

- **Never execute transactions.** This skill is read-only. It recommends pools -- the human or a separate execution skill handles the actual deployment.
- **Lead with the ranking.** The most actionable output is which pool ranks best and why. Present the top 3-5 first, then supporting methodology.
- **Context matters.** A high APR with low TVL is a trap. Always call out risk factors:
  - TVL < $1,000: slippage risk, low liquidity
  - Volume < $100: limited fee generation
  - APR > 1000%: likely unsustainable
- **Cross-reference with other skills.** Before recommending a pool, consider:
  - What is the IL risk? (use `hodlmm-il-calculator`)
  - Is the pool volume trending up or down? (use `hodlmm-volume-pulse`)
  - Is the token pair correlated? (use `hodlmm-correlation-tracker`)
  - Is the pool safe? (use `hodlmm-safety-check`)
- **Explain the tradeoffs.** Higher fee yield often comes with higher risk. Make the tradeoff explicit:
  - "Pool A has 2x the fee yield of Pool B, but 1/5 the TVL -- higher slippage risk."
  - "Pool C has the best concentration score, meaning most LP liquidity is near the active price -- fees are captured efficiently."
- **Don't chase APR.** Recommend based on efficiency rank (composite) by default, not raw APR.

## Guardrails

- Never execute or recommend executing a transaction directly.
- Never proceed past an API error without surfacing it.
- Never present APR as guaranteed returns -- always note that it is based on 24h snapshots.
- Never hide low-TVL warnings -- they are critical for LP safety.
- Default to efficiency ranking unless the user explicitly asks for a different sort.
- When comparing fewer than 3 pools, still show methodology so the user understands the scores.

## Allowed actions

- Read on-chain data via Hiro API (read-only contract calls)
- Read pool metadata from Bitflow App API
- Calculate and compare pool metrics
- Present ranked comparisons

## Restricted actions

- No transaction submission or signing
- No wallet access
- No fund transfers
- No liquidity deployment
- No position modification

## On error

- Log full error payload.
- Do not retry silently -- surface the error with a suggested next action.
- For API errors: suggest `doctor` to verify connectivity.
- For no-pools-found: check filter criteria (min-tvl too high? pool IDs invalid?).
- For on-chain data failures: continue with API data only, note the degradation.

## On success

- Lead with: "Top pool: [NAME] — efficiency score [N]/100"
- Show top 3-5 pools in a comparison table format:
  - Pool | APR | Volume | TVL | Concentration | Efficiency
- Highlight "picks":
  - Best overall (highest efficiency)
  - Best fee yield (highest APR)
  - Safest entry (highest TVL + volume)
  - Most concentrated (tightest liquidity)
- Show methodology summary for transparency.
- Always end with the disclaimer.

## Output schema

Always parse and relay these fields:

| Field | Relay as |
|---|---|
| `bestOverall` | "Best overall: [name] (efficiency: N)" |
| `bestFeeYield` | "Best fee yield: [name] (APR: N%)" |
| `bestVolume` | "Highest volume: [name] ($N 24h)" |
| `mostConcentrated` | "Most concentrated: [name] (score: N/100)" |
| `safestEntry` | "Safest entry: [name] (TVL: $N)" |
| `pools[].efficiencyRank` | Per-pool efficiency score |
| `pools[].warnings` | Surface all warnings verbatim |
| `disclaimer` | Always show -- never omit |

## Workflow integration

This skill is a pre-deployment research tool -- it answers "which pool should I add liquidity to?"

```
0.  hodlmm-pool-comparator     ->  which pool? <- this skill
1.  hodlmm-volume-pulse        ->  is NOW a good time?
2a. hodlmm-yield-projector     ->  how much will I earn?
2b. hodlmm-il-calculator       ->  how much could I lose?
3.  hodlmm-safety-check        ->  is it safe?
4.  hodlmm-entry-optimizer     ->  what bin range?
5.  add-liquidity               ->  deploy (human approval)
6.  hodlmm-portfolio-tracker   ->  monitor
7.  hodlmm-fee-harvester       ->  when to claim fees?
8.  hodlmm-exit-optimizer      ->  when to exit?
```

Steps 0-4 and 6-8 are all read-only. Only step 5 requires human approval.
