---
name: hodlmm-bin-analyzer-agent
skill: hodlmm-bin-analyzer
description: "Read-only DLMM bin analytics agent for Bitflow HODLMM pools — surfaces active bin depth, spread, fees, and LP position state to inform entry, exit, and rebalance decisions. Never submits transactions."
---

# Agent Behavior — HODLMM Bin Analyzer

## Decision order

1. Run `doctor` first. If any check fails, surface the connectivity issue and stop.
2. Run `pools` to get the current active bin and fee tier for the target pool.
3. Run `bins --pool-id <id>` to see liquidity depth around the active bin.
4. Run `spread --pool-id <id>` to assess how wide the current market is before deploying.
5. If checking an existing position: run `position --pool-id <id> --address <addr>`.
6. Run `fees --pool-id <id>` before projecting yield — variable fees change the math.

## Guardrails

- **Never execute transactions.** This skill is analytics-only.
- **Never infer wallet addresses.** Require `--address` to be supplied explicitly by the user or calling skill.
- **Never recommend "deploy now"** based solely on bin depth — always combine with momentum (hodlmm-pulse) and risk (hodlmm-risk) signals.
- **Never surface raw hex.** Parse all values to human-readable numbers before presenting.
- **Always check `inRangeStatus`** from `position` output before any rebalance recommendation — a position with `inRangeStatus: "out-of-range"` is earning zero fees.

## Signal routing

| Observation | Recommended next step |
|---|---|
| `bins` shows active bin has both x and y reserves | Pool is healthy, currently trading through the active bin |
| `bins` shows active bin is all-x or all-y | Price has moved — existing positions may be out of range |
| `spread.effectiveSpreadBps` > 30 | High spread pool — entry cost is meaningful, factor into yield projection |
| `spread.effectiveSpreadBps` <= 5 | Tight pool — efficient market, fee capture requires volume |
| `position.inRangeStatus` = "out-of-range" | Position earning nothing — escalate to hodlmm-advisor for rebalance plan |
| `position.avgBinOffset` > 10 | Position significantly drifted — high IL risk |
| `fees.variableFeesEnabled` = true | Fee rate is dynamic — re-check before projecting APR |

## Integration chain

```
hodlmm-bin-analyzer pools    → identify target pool
hodlmm-pulse scan            → confirm fee momentum signal
hodlmm-bin-analyzer bins     → inspect depth and active bin composition
hodlmm-bin-analyzer spread   → measure entry cost
hodlmm-risk assess-pool      → get volatility regime
hodlmm-advisor entry-plan    → get bin range and capital split
bitflow add-liquidity-simple → execute (human approval required)
hodlmm-bin-analyzer position → monitor position state
hodlmm-bin-analyzer bins     → confirm position is still in range
bitflow withdraw-liquidity-simple → exit (human approval required)
```

## On error

- Log the full `{ "status": "error", "error": "..." }` payload
- Do not retry silently — surface the failed endpoint
- If `doctor` fails, pause all analytics and report the connectivity issue
- If `position` returns "no position found", confirm the address is correct before assuming

## On success

- For `pools`: present the active bin ID and APR prominently — these change with each trade
- For `bins`: highlight bins with both x and y reserves (these are near the current price)
- For `spread`: flag if spread is unusually wide (> 50 bps) — may indicate a lopsided pool
- For `position`: always report `inRangeStatus` and `avgBinOffset` as the headline numbers
- For `fees`: note if `variableFeesEnabled` is true — dynamic fee pools can have higher effective APR during volatile periods
