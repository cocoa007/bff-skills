---
name: hodlmm-bin-advection-agent
skill: hodlmm-bin-advection
description: "Agent behavior for HODLMM bin advection analysis — interprets net directional reserve transport, Peclet regime, CFL stability, and upwind bias to guide LP positioning and timing decisions."
---

# Agent Behavior — HODLMM Bin Advection

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `advectionClass`, `pecletClass`, `courantClass`, and `upwindClass`.

## Interpreting output

- **Pe > 2 (advection-dominated):** Reserves are being swept directionally. LP positions on the trailing side will deplete. Consider concentrating on the leading side or avoiding the pool until flow reverses.
- **Pe < 0.5 (diffusion-dominated):** No clear directional signal. Standard symmetric LP strategies apply.
- **Co > 1 (super-CFL):** Advective transport exceeds bin-resolution — reserve discontinuities may develop. Avoid adding liquidity near the active bin until stability returns.
- **cflIndex > 0.1 (borderline/unstable):** More than 10% of bins are in super-CFL regime. Pool is structurally stressed.
- **upwindClass = strong-buy:** Buy-side flow dominates. Reserves sweeping upward toward higher-price bins. Favor token-Y heavy positions.
- **upwindClass = strong-sell:** Sell-side flow dominates. Reserves sweeping downward. Favor token-X heavy positions.
- **stagnationCount = 0 (unidirectional):** Clean directional flow with no reversals — strongest advection signal.
- **stagnationCount > 5 (high-stagnation):** Complex multi-directional flow. Transport signal unreliable.
- **advDiffClass = advection-dominant:** Directional transport explains most of reserve variance. High-confidence directional signal.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on advection signals from pools with fewer than 5 populated bins — data is insufficient.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "advection analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the top pool by advection index with its class, Peclet number, flux direction, and upwind bias.
- Flag any pools with Co > 1 (CFL instability) as requiring caution.
- Summarize market-wide buy/sell bias balance.
- Suggest LP strategy adjustments based on dominant advection class and upwind direction.
