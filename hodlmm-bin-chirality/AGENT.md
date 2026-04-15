---
name: hodlmm-bin-chirality-agent
skill: hodlmm-bin-chirality
description: "Agent behavior for HODLMM bin chirality analysis — interprets enantiomeric excess, handedness, chiral centers, mirror mismatch, and optical rotation to guide LP positioning strategy."
---

# Agent Behavior — HODLMM Bin Chirality

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `chiralityClass`, `handedness`, `enantiomericExcess`, and `racemizationRisk`.

## Interpreting output

- **chiralityClass = RACEMIC:** Balanced, symmetric reserve distribution. Both sides of the active bin have similar mass. Standard symmetric LP strategies work well — fee capture is roughly equal from both trading directions.
- **chiralityClass = SCALEMIC:** Slight asymmetry detected. One side is modestly heavier. Monitor for trend — may be transitioning toward stronger chirality or racemizing.
- **chiralityClass = ENANTIOENRICHED:** Significant one-sided bias. The pool has a clear directional lean. Consider asymmetric LP positioning favoring the dominant side. Check optical rotation for flow direction.
- **chiralityClass = ENANTIOPURE:** Extreme handedness — nearly all liquidity mass on one side. This signals whale activity, imminent rebalancing, or a structural imbalance. High risk for symmetric LP positions. May present opportunity for contrarian positioning if racemization risk is high.
- **handedness = LEFT:** Token X (base asset) dominates the reserve distribution below the active bin. Expect more buy pressure (flow from left to right).
- **handedness = RIGHT:** Token Y (quote asset) dominates above the active bin. Expect more sell pressure (flow from right to left).
- **enantiomericExcess > 60%:** Strong asymmetry. Do not deploy symmetric strategies without accounting for directional bias.
- **chiralCenterCount > 5:** Complex topology — the pool has multiple handedness transitions. Fee distribution will be uneven across range. Consider narrower positions spanning fewer chiral centers.
- **stereochemicalPurity > 80%:** Very consistent handedness. Directional conviction is warranted — the bias is not caused by isolated outlier bins.
- **racemizationRisk > 70:** High probability the distribution will rebalance. Avoid taking directional positions that depend on current chirality persisting.
- **opticalRotation near 0:** Despite possible chirality, the reserve-weighted flow bias is neutral. Net directional pressure is balanced even if distribution is asymmetric.
- **mirrorMismatchMean > 0.5:** The pool looks fundamentally different from each side of the active bin. Symmetric analysis tools may give misleading results.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on chirality signals from pools with fewer than 5 populated bins — data is insufficient.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "chirality analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the most chiral pool with its class, handedness, ee%, and racemization risk.
- Flag any ENANTIOPURE pools as requiring caution for symmetric strategies.
- Highlight pools with high racemization risk as potential rebalancing opportunities.
- Summarize market-wide chirality distribution (how many RACEMIC vs ENANTIOENRICHED vs ENANTIOPURE).
- Suggest LP strategy adjustments based on dominant chirality class and handedness.
