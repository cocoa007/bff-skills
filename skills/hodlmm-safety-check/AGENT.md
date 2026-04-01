---
name: hodlmm-safety-check-agent
skill: hodlmm-safety-check
description: "Pre-deployment security gate for HODLMM liquidity. Analyzes token contract source for vulnerabilities before agents commit capital. Read-only — no funds moved, no transactions submitted."
---

# Agent Behavior — HODLMM Safety Check

## Decision order

1. Run `doctor` first. If Hiro API or Bitflow API is unreachable, surface the issue and stop.
2. Before ANY liquidity deployment to a HODLMM pool, run `check --pool-id <id>` on the target pool.
3. If the pool safety verdict is `UNSAFE` (any critical finding), **refuse to proceed with deployment**. Surface the specific findings to the user.
4. If the verdict is `CAUTION` (high/medium findings only), alert the user with findings and require explicit confirmation before proceeding.
5. If the verdict is `SAFE`, proceed to the next step in the deployment pipeline (hodlmm-pulse, hodlmm-advisor).
6. For periodic hygiene, run `scan` weekly to re-check all pools the agent has positions in.

## Guardrails

- **Never skip the safety check before deploying liquidity.** Even if hodlmm-pulse shows a spike and hodlmm-advisor says "deploy now", the safety check must pass first.
- **Never override a CRITICAL finding.** If a token has an unguarded mint or admin centralization, do not deploy — regardless of yield.
- **Never submit transactions.** This skill is read-only. It fetches contract source and analyzes it. No wallet interaction.
- **Never cache safety results beyond 24 hours.** Token contracts can be upgraded or admin keys rotated.
- **Rate-limit Hiro API calls.** Do not scan more than 20 contracts per minute. Use `scan` for batch operations (it handles rate limiting internally).

## Safety verdict mapping

| Verdict | Condition | Agent action |
|---------|-----------|-------------|
| SAFE | No critical or high findings | Proceed to deployment pipeline |
| CAUTION | High or medium findings, no critical | Alert user, require explicit approval |
| UNSAFE | Any critical finding | Block deployment, surface findings |
| UNKNOWN | Contract source unavailable | Treat as CAUTION — do not deploy without user approval |

## Integration with HODLMM workflow

```
1. hodlmm-safety-check check --pool-id <id>   ->  SAFE / CAUTION / UNSAFE
2. hodlmm-pulse scan                           ->  when? (fee momentum)
3. hodlmm-advisor entry-plan --pool-id <id>    ->  where? (bins, strategy)
4. bitflow add-liquidity-simple                ->  deploy (human approval)
```

The safety check is the FIRST gate. If it fails, steps 2-4 do not execute.

## On error

- Log the full `{ "error": "..." }` payload
- If Hiro API returns 404 for a contract, mark that token as `UNKNOWN` risk (source not available)
- If Bitflow API is down, cannot resolve pool tokens — surface error, do not guess contract addresses
- Never retry silently — surface all errors to the user

## On success

- For `check`: present per-token findings sorted by severity, then pool-level verdict
- For `scan`: rank pools by safety score (safest first), highlight any UNSAFE pools
- For `audit`: present all findings for the single contract with severity and line references

## Spend limits

This skill has **zero spend**. It never initiates transactions, never moves funds, never requires wallet access. All operations are read-only API calls to public endpoints.
