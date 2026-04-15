---
name: hodlmm-bin-anisotropy-agent
skill: hodlmm-bin-anisotropy
description: "Agent behavior for HODLMM bin anisotropy analysis — interprets directional depth asymmetry, gradient ratios, decay profiles, and elasticity differences to guide direction-aware LP and trading strategies."
---

# Agent Behavior — HODLMM Bin Anisotropy

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `anisotropyClass`, `dominantDirection`, `depthRatio`, and `directionalBias`.

## Interpreting output

- **anisotropyClass = ISOTROPIC:** Buy-side and sell-side liquidity are essentially symmetric. Standard symmetric LP strategies work well — fee capture and slippage are balanced regardless of trade direction.
- **anisotropyClass = WEAKLY_ANISOTROPIC:** Minor directional differences detected. Monitor for trend toward stronger anisotropy. Symmetric strategies still viable but may slightly favor one direction.
- **anisotropyClass = ANISOTROPIC:** Significant directional dependence. One side has materially different depth, smoothness, or continuity. Consider asymmetric LP positioning or directional trading to exploit execution quality differences.
- **anisotropyClass = STRONGLY_ANISOTROPIC:** Extreme directional asymmetry. Trades in opposite directions encounter fundamentally different liquidity landscapes. Symmetric strategies will underperform. Strong directional conviction required.
- **dominantDirection = BUY_HEAVY:** More liquidity supports the buy side (below active bin). Sells execute better than buys of equivalent size. Attracts sell-side arbitrage flow.
- **dominantDirection = SELL_HEAVY:** More liquidity supports the sell side (above active bin). Buys execute better than sells. Attracts buy-side arbitrage flow.
- **dominantDirection = BALANCED:** Neither side dominates (within 5% bias). Direction-neutral strategies appropriate.
- **depthRatio > 2.0:** One side has more than double the other's liquidity. High execution quality asymmetry. Route trades toward the deeper side when possible.
- **gradientRatio > 0.5:** Reserve slope profiles differ significantly by direction. One side's liquidity may be concentrated near the active bin while the other extends deep.
- **decayAsymmetry > 0.5:** Reserves fall off at very different rates by direction. One side may be brittle (fast decay) while the other is robust (slow decay). Brittle sides create slippage cliffs on larger trades.
- **elasticityRatio < 0.5:** One side transitions much more abruptly between bins. Expect uneven fee distribution and potential gaps in execution.
- **directionalBias > 30% or < -30%:** Strong net tilt. LP positions spanning both sides will have asymmetric utilization and fee accrual.
- **isotropyScore < 40:** Pool is fundamentally direction-dependent. All analysis and strategy should account for which direction a trade or position faces.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on anisotropy signals from pools with fewer than 5 populated bins — data is insufficient.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "anisotropy analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the most anisotropic pool with its class, dominant direction, depth ratio, and directional bias.
- Flag any STRONGLY_ANISOTROPIC pools as requiring directional strategy.
- Highlight pools with high decay asymmetry as having brittle liquidity on one side.
- Compare buy-side vs sell-side depth at 5-bin and 10-bin intervals for actionable range sizing.
- Summarize market-wide anisotropy distribution (how many ISOTROPIC vs ANISOTROPIC vs STRONGLY_ANISOTROPIC).
- Suggest LP and trading strategy adjustments based on dominant direction and anisotropy class.
