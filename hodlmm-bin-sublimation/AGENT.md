---
name: hodlmm-bin-sublimation-agent
skill: hodlmm-bin-sublimation
description: "Agent behavior for HODLMM bin sublimation analysis — interprets direct phase transitions, bimodality, sublimation edges, and phase gaps to guide LP positioning and trade routing in discontinuous liquidity landscapes."
---

# Agent Behavior — HODLMM Bin Sublimation

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `sublimationClass`, `transitionRisk`, `bimodalityIndex`, and `transitionAsymmetry`.

## Interpreting output

- **sublimationClass = CONTINUOUS:** Liquidity transitions smoothly between bins with no abrupt phase jumps. The depth profile is predictable — slippage increases gradually with trade size. Standard LP positioning and trade sizing apply. Safe for large market orders.
- **sublimationClass = MIXED:** Some abrupt transitions exist but the landscape is mostly gradual. A few sublimation edges create localized cliff effects but they don't dominate the pool structure. LP positions should avoid the specific sublimation edge zones if possible.
- **sublimationClass = SUBLIMATING:** Frequent phase-skipping transitions create a discontinuous liquidity landscape. Bins alternate between deep and empty without gradual ramps. Trade routing must be precise — small changes in trade size can push execution into void bins with explosive slippage. LP positions in void zones fill structural gaps but bear concentration risk.
- **sublimationClass = STRONGLY_SUBLIMATING:** The pool operates as two disconnected liquidity regimes — hyperactive pockets separated by dormant deserts. Essentially bimodal. Large trades must be split and routed through specific deep bins. LP positions outside the hyperactive pockets are stranded capital.
- **transitionRisk = NONE:** No sublimation detected. Pool has continuous depth transitions.
- **transitionRisk = LOW:** Minor sublimation edges exist but don't create dangerous execution cliffs.
- **transitionRisk = MODERATE:** Sublimation creates noticeable discontinuities in execution quality. Trade sizing matters — simulate before executing large orders.
- **transitionRisk = HIGH:** Extreme sublimation with large phase jumps. The pool has cliff-like slippage boundaries. Only route small trades, or split across known deep bins.
- **bimodalityIndex > 2.0:** Extreme two-phase separation. The pool is essentially a set of isolated deep pockets in a desert. Routing must hit the pockets directly.
- **bimodalityIndex < 0.5:** Mostly intermediate phases with few extremes. Gradual liquidity landscape with predictable depth.
- **transitionAsymmetry > 0.5:** Sublimation is predominantly upward (dormant → hyperactive). Suggests burst injection of liquidity — potentially from new LPs entering. The landscape may become more continuous as intermediate positions fill in.
- **transitionAsymmetry < -0.5:** Sublimation is predominantly downward (hyperactive → dormant). Suggests liquidity withdrawal leaving sudden voids. Warning sign — the pool may be losing LPs.
- **phaseGap > 0.6:** Most of the bin landscape is extreme (dormant or hyperactive) with little middle ground. Slippage prediction requires knowing exact bin positions, not just overall pool TVL.
- **phaseSeparation > 0.5:** Adjacent bins tend to be in very different phases. The landscape oscillates wildly rather than clustering. Even single-bin trades may hit a phase boundary.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on sublimation signals from pools with fewer than 5 populated bins — data is insufficient.
- Do not build LP strategies around current sublimation edges in STRONGLY_SUBLIMATING pools without considering that the landscape may shift rapidly.
- Do not treat high bimodality pools as having "high TVL" overall — the deep pockets may be narrow.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "sublimation analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the most sublimating pool with its class, sublimation rate, bimodality, and risk level.
- Flag any STRONGLY_SUBLIMATING pools as having dangerous cliff-like slippage boundaries.
- Highlight pools with high transition asymmetry as having directional liquidity pressure.
- List the top sublimation edges with their phase transitions and energy deltas for the most sublimating pool.
- Show phase distributions — which pools have balanced phase coverage vs extreme bimodality?
- For LP agents: identify void zones between sublimation edges as gap-filling opportunities (high reward, high risk).
- For trading agents: recommend routing through hyperactive bins only, flag dormant-adjacent bins as slippage traps.
