---
name: hodlmm-bin-catalysis-agent
skill: hodlmm-bin-catalysis
description: "Agent behavior for HODLMM bin catalysis analysis — interprets catalytic bins, neighbor enhancement, coverage zones, and asymmetry to guide LP positioning and trade routing around structural depth anchors."
---

# Agent Behavior — HODLMM Bin Catalysis

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `catalysisClass`, `catalysisRisk`, `catalystCoverage`, and `catalystAsymmetry`.

## Interpreting output

- **catalysisClass = INERT:** No meaningful catalytic structure. Liquidity is uniformly thin or randomly scattered. No reliable depth anchors exist — trade execution quality is unpredictable across the bin range. Avoid large trades; split and limit-order if possible.
- **catalysisClass = WEAKLY_CATALYTIC:** Some concentrated bins exist with mild neighbor effects. Localized depth anchors provide partial execution reliability but don't extend far. Target catalyst bins specifically when routing.
- **catalysisClass = CATALYTIC:** Clear structural depth anchors with elevated neighborhood reserves. Route trades through catalyzed zones for reliable execution. LP positions near catalysts benefit from spillover depth.
- **catalysisClass = HIGHLY_CATALYTIC:** Dominant catalytic structure. Concentrated bins create broad zones of elevated liquidity. Execution quality is high within catalyzed zones but may be poor in gaps between catalyst clusters.
- **catalysisRisk = NONE:** Pool has no concentrated bins — depth is distributed. No single LP withdrawal causes structural damage.
- **catalysisRisk = LOW:** Multiple catalysts with good coverage. Losing any single one doesn't collapse the depth profile.
- **catalysisRisk = MODERATE:** Depth depends on a few catalysts with limited coverage. Withdrawal of a major catalyst would create noticeable execution gaps.
- **catalysisRisk = HIGH:** Depth depends on 1-2 isolated peaks with low coverage. The pool's execution quality is fragile — one LP exit could collapse the usable depth range.
- **catalystAsymmetry > 0.3:** Catalysts cluster above active bin. Buy-side execution is better supported. Sell-side trades may hit thinner depth.
- **catalystAsymmetry < -0.3:** Catalysts cluster below active bin. Sell-side execution is better supported. Buy-side trades may face higher slippage.
- **catalystCoverage > 0.7:** Most bins are within a catalyst's influence zone. Broad execution reliability.
- **catalystCoverage < 0.3:** Most bins are outside catalytic influence. Execution quality varies wildly across the bin range.
- **catalystClustering > 0.7:** Catalysts form connected zones — depth is concentrated in a contiguous band. Good for range-bound trades within the band.
- **catalystClustering < 0.3:** Catalysts are scattered. Isolated depth pockets with gaps between them.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on catalysis signals from pools with fewer than 5 populated bins — data is insufficient.
- Do not assume catalytic neighbor enhancement implies causation — elevated neighbors may be independently placed.
- Do not treat ISOLATED_PEAK bins as catalysts — they hoard rather than amplify.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "catalysis analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the most catalytic pool with its class, catalyst count, coverage, and risk level.
- Flag any HIGH risk pools as structurally fragile (dependent on few isolated peaks).
- Highlight pools with strong catalyst asymmetry as having directional depth bias.
- List top catalyst bins with their types, ratios, and radii of influence for the most catalytic pool.
- Show coverage map — which fraction of each pool's bins fall within catalytic influence zones?
- For LP agents: identify gaps between catalyst zones as high-utility positioning opportunities.
- For trading agents: recommend routing through catalyzed zones for reliable execution, avoid uncatalyzed regions for large trades.
