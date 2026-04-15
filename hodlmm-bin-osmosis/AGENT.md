---
name: hodlmm-bin-osmosis-agent
skill: hodlmm-bin-osmosis
description: "Agent behavior for HODLMM bin osmosis analysis — interprets osmotic pressure, tonicity asymmetry, concentration Gini, diffusion rates, and flow tendencies to assess structural concentration balance and guide LP positioning."
---

# Agent Behavior — HODLMM Bin Osmosis

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `osmoticClass`, `flowTendency`, `tonicityAsymmetry`, and `plasmolysisRisk`.

## Interpreting output

- **osmoticClass = ISOTONIC:** Near-equilibrium concentration. Adjacent bins have similar liquidity density with gentle gradients between them. Trades in either direction encounter predictable, symmetric execution. LP positions earn fees uniformly across the range. The pool self-corrects minor imbalances through normal trading flow. Ideal for passive LP strategies and predictable trade execution.
- **osmoticClass = MILDLY_HYPERTONIC:** Moderate concentration differentials. Some bin boundaries have noticeable concentration steps but nothing extreme. Execution quality varies slightly by direction and position in the range. LP positions may earn asymmetrically depending on which side of a concentration step they sit on. Normal for actively traded pools.
- **osmoticClass = HYPERTONIC:** Significant concentration imbalances. Clear high-density and low-density regions create meaningful osmotic gradients. Trades moving from dilute to concentrated regions experience improving depth; the reverse direction encounters worsening execution. LP agents should investigate whether the imbalance represents an opportunity (fill dilute zones for structural improvement) or a warning (whale deposits creating walls).
- **osmoticClass = SEVERELY_HYPERTONIC:** Extreme concentration cliffs. The pool has dramatic differences between adjacent bins — some with substantial liquidity next to near-empty bins. Execution is highly directional and unpredictable for size trades. Plasmolysis risk is likely elevated. Avoid for large orders; examine individual hypertonic boundaries before trading.
- **flowTendency = RAPID_EQUILIBRATING:** Trading volume actively dissolves concentration differentials. Any osmotic imbalance is short-lived — arbitrageurs and natural order flow quickly rebalance the distribution. Osmotic signals are transient; by the time you act on them, conditions may have changed. Best for reactive strategies.
- **flowTendency = EQUILIBRATING:** Gradual rebalancing through trading activity. Concentration imbalances narrow over hours to days. Osmotic signals are actionable if you can hold through the equilibration period. LP positioning in dilute zones will be rewarded as natural flow rebalances toward you.
- **flowTendency = SLOW_DIFFUSION:** Low trading activity relative to osmotic pressure. Concentration imbalances persist for extended periods. Osmotic signals are reliable predictors of persistent execution asymmetry — you can trust that the directional bias will remain for a while. Useful for directional trading strategies.
- **flowTendency = OSMOTIC_LOCK:** Trading volume is insufficient to overcome osmotic pressure. Concentration imbalances are effectively permanent. Only large external events (whale deposits/withdrawals, protocol incentives) can reset the distribution. The osmotic landscape is a fixed feature of the pool — plan around it, don't wait for it to change.
- **tonicityAsymmetry > 0.3:** Strong directional concentration bias. One side of the active bin holds significantly more liquidity per bin than the other. Trades toward the concentrated side improve; trades toward the dilute side degrade. LP agents should fill the dilute side to capture the structural premium.
- **plasmolysisRisk > 40:** Extreme concentration outliers. One or more bins hold disproportionate liquidity. These "whale bins" create osmotic pressure that may drive liquidity outflow over time. If you're LP'd in an adjacent dilute bin, you benefit from flow driven toward your position. If you're in the whale bin, you face dilution risk if the whale exits.
- **lysisRisk > 40:** Near-empty bins at risk of execution voids. Trades crossing these bins encounter sudden depth loss. The osmotic gradient is pushing liquidity toward these bins but volume hasn't filled them yet. Opportunity for LP agents to fill the void and capture the osmotic flow premium.
- **concentrationGini > 0.5:** High inequality in liquidity distribution. A few bins hold most of the liquidity while many bins are relatively empty. The pool's execution quality depends heavily on where in the range the trade occurs. Prefer trades within the concentrated region; avoid crossing into dilute territory.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on osmotic signals from pools with fewer than 5 populated bins — data is insufficient.
- Do not assume SEVERELY_HYPERTONIC means "bad pool" — it means extreme concentration differentials, which may be intentional (protocol-incentivized bins) or structural (peg pools with asymmetric depth).
- Do not treat diffusion rate as stable — it depends on 24h volume which can change rapidly.
- The ISOTONIC/HYPERTONIC classification uses absolute thresholds. Cross-pool comparison is valid, but thresholds are not calibrated to specific execution cost guarantees.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "osmosis analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the most isotonic pool with its class, diffusion rate, and flow tendency.
- Flag any SEVERELY_HYPERTONIC pools as having extreme concentration differentials.
- Highlight pools with high tonicity asymmetry — directional execution bias.
- Show hypertonic zone counts — pools with many hypertonic boundaries have unpredictable execution transitions.
- Report plasmolysis and lysis risks — extreme concentration outliers and voids.
- For LP agents: identify HYPERTONIC pools with SLOW_DIFFUSION as structural positioning opportunities — filling dilute zones captures the osmotic flow premium over extended periods.
- For trading agents: prefer ISOTONIC pools for symmetric execution. In HYPERTONIC pools, prefer the direction that moves from dilute toward concentrated bins for improving depth.
