---
name: hodlmm-yield-projector-agent
skill: hodlmm-yield-projector
description: "Pre-deployment yield estimator for Bitflow HODLMM concentrated liquidity. Runs doctor first, then projects fee yield based on historical volume and bin concentration. Read-only — no funds required."
---

# Agent Behavior — HODLMM Yield Projector

## Decision order

1. Run `doctor` first. If Bitflow APIs are unreachable, stop and surface the error with suggested retry time.
2. For `estimate`: validate pool exists before projecting. If pool_id not found, list available pools and ask user to confirm.
3. For `compare`: if no `--pools` flag, fetch all available HODLMM pools and compare them all.
4. For `history`: validate pool exists, then show historical data to help user calibrate projections.
5. Parse JSON output and surface the `disclaimer` field whenever projections are shown.

## Key rules

- **Always show the disclaimer.** Yield projections are estimates, not guarantees. Surface `disclaimer` and `warnings` fields to the user every time.
- **Warn about IL.** Concentrated LP positions carry significant impermanent loss risk. When presenting yield estimates, remind users that IL can exceed fee income — especially for volatile pairs.
- **Verify pool exists first.** Before running any projection, confirm the pool_id is in the pool list. If not found, list available pools.
- **Before committing capital**: recommend user also runs `hodlmm-safety-check` (PR #127) for a security scan and `hodlmm-bin-analyzer` for bin depth analysis. This skill answers "how much will I earn?" — the others answer "is it safe?" and "where exactly should I place my bins?"
- **Low volume warning**: if `volume_24h_usd < 10000`, add a prominent warning that projections are unreliable at low volume levels.
- **Concentration note**: explain to users that tighter bin ranges earn more fees when in-range but go out-of-range faster. A 1-bin range maximizes fees but requires frequent rebalancing.

## Guardrails

- Never proceed past an API error without surfacing it clearly.
- Never describe yield projections as "guaranteed" or "expected returns" — always "estimated" or "projected."
- Never recommend specific capital amounts — that requires human judgment on risk tolerance.
- Default to `--bin-range active` when no bin range is specified — this is the most common use case.
- When showing `compare` results, rank by annualized yield but also highlight volume stability (pools with consistent 7d vs 24h volume are more reliable).

## On error

- Log the full error payload
- Do not retry silently — surface the error with a suggested next action
- For API errors: suggest running `doctor` to verify connectivity
- For pool-not-found: list valid pool IDs from the most recent doctor output

## On success

- Surface `projections` object with clear labels: "Projected daily yield: X%", "Projected APR: X%"
- Always follow with: "Note: based on 24h volume of $X. Actual returns depend on sustained volume and whether your position stays in range."
- For `compare`: highlight the top pool but note any trade-offs (e.g., higher yield but lower TVL, higher IL risk on volatile pairs)
- For `history`: help user interpret whether projected vs historical yields are consistent

## Workflow integration

This skill is step 1 in the HODLMM LP deployment pipeline:

```
1. hodlmm-yield-projector  →  how much will I earn? (this skill)
2. hodlmm-safety-check     →  is the pool/token safe? (PR #127)
3. hodlmm-bin-analyzer     →  what bin depth and spread look like?
4. hodlmm-bin-guardian     →  is my position staying in range?
5. add-liquidity           →  deploy (requires human approval)
```

Run steps 1-4 before any capital deployment. They are all read-only.

## Output contract

Always parse and relay these fields:

| Field | Relay as |
|---|---|
| `projections.annualized_fee_yield_pct` | "Projected APR (fee only): X%" |
| `projections.daily_fee_yield_pct` | "Daily: X%" |
| `inputs.concentration_factor` | "Concentration factor: X (higher = more fees earned per $ deployed when in range)" |
| `inputs.volume_24h_usd` | "Based on 24h volume: $X" |
| `warnings` | Surface all warnings verbatim |
| `disclaimer` | Always show — never omit |
