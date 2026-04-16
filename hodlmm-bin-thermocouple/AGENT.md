---
name: hodlmm-bin-thermocouple-agent
skill: hodlmm-bin-thermocouple
description: "Agent behavior for HODLMM bin thermocouple analysis — interprets Seebeck coefficients, figures of merit (ZT), thermal gradients, EMF outputs, and Carnot efficiencies to identify bins with the highest thermoelectric conversion efficiency and guide LP strategies across different thermal regimes."
---

# Agent Behavior — HODLMM Bin Thermocouple

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `thermocouplePhase`, `thermocoupleVerdict`, `avgSeebeckCoefficient`, and `highZTFraction`.

## Interpreting output

- **thermocouplePhase = OPTIMAL_THERMOELECTRIC:** High ZT material with strong Seebeck coefficient, good electrical conductivity, and low thermal conductivity. The junction maintains large temperature gradients while efficiently converting them to EMF. Position aggressively — these pools extract maximum fee yield from activity gradients with minimal parasitic losses.
- **thermocouplePhase = STRONG_SEEBECK:** High Seebeck coefficient with efficient EMF generation but suboptimal ZT due to elevated thermal conductivity or contact losses. Good thermoelectric response but some gradient is lost to parasitic heat flow. Still attractive for LP positioning but expect some efficiency degradation.
- **thermocouplePhase = MODERATE_GRADIENT:** Measurable thermoelectric response with adequate Seebeck but thermal conductivity partially shorts the gradient. The junction converts activity differentials to fee yield but substantial thermal energy flows parasitically through the junction. Look for bins with above-average ZT as pockets of efficient conversion.
- **thermocouplePhase = WEAK_JUNCTION:** Poor thermoelectric response with low Seebeck or high parasitic losses. Most thermal energy passes through the junction without generating EMF. Fee generation is unreliable and poorly correlated with activity gradients.
- **thermocouplePhase = THERMAL_EQUILIBRIUM:** No significant temperature gradient across junctions. All bins are at similar activity levels producing negligible thermoelectric EMF. Without gradient there is no driving force — the pool is isothermal and thermoelectric extraction is impossible.
- **thermocoupleVerdict = POWER_GENERATOR:** High Seebeck with strong EMF output. The junction efficiently converts thermal gradients to extractable electrical power. Excellent for fee extraction — activity differentials directly produce yield.
- **thermocoupleVerdict = HIGH_ZT_CONVERTER:** Exceptional figure of merit with near-Carnot efficiency. Optimal combination of thermoelectric properties. The best possible thermoelectric material — position for maximum conversion efficiency.
- **thermocoupleVerdict = THERMAL_SHORT_CIRCUIT:** High thermal conductivity destroying gradients despite adequate Seebeck. Heat flows through the junction equilibrating temperatures before Seebeck conversion extracts useful EMF. The pool is thermally well-connected — reserves flow freely, preventing the activity gradients needed for thermoelectric generation.
- **thermocoupleVerdict = EFFICIENT_JUNCTION:** Good Seebeck with low Joule heating. Clean, low-loss thermoelectric conversion. Ideal for steady-state LP positioning — predictable, efficient fee generation from maintained gradients.
- **thermocoupleVerdict = DEGRADED_CONTACT:** High contact resistance with poor Seebeck. Interface quality has degraded, introducing parasitic losses at bin boundaries. The junction material may have adequate bulk thermoelectric properties but the interfaces prevent efficient coupling.
- **avgSeebeckCoefficient > 0.5:** Strong thermoelectric response. Activity gradients efficiently generate EMF. Prioritize these pools.
- **avgSeebeckCoefficient < 0.2:** Poor thermoelectric response. Gradients produce negligible EMF. Avoid unless other signals are compelling.
- **avgFigureOfMerit > 2:** Excellent ZT. High-performance thermoelectric material suitable for efficient power generation.
- **avgFigureOfMerit < 0.5:** Poor ZT. Thermoelectric conversion is inefficient — most thermal energy is lost.
- **avgThermalConductivity > 5:** High parasitic heat flow. Temperature gradients equalize rapidly, reducing Seebeck driving force.
- **avgThermalConductivity < 2:** Low thermal conductivity. Gradients are maintained, sustaining thermoelectric generation.
- **avgCarnotEfficiency > 0.4:** Large temperature differentials. High theoretical conversion limit.
- **avgCarnotEfficiency < 0.15:** Small gradients. Conversion is thermodynamically limited regardless of material quality.
- **avgJouleHeating > 0.5:** Severe resistive losses. Generated EMF is dissipated internally before reaching the external circuit.
- **avgJouleHeating < 0.2:** Low resistive losses. Efficient current extraction from generated EMF.
- **highZTFraction > 0.3:** Many bins are high-performance thermoelectric elements. Pool-wide efficient conversion.
- **highZTFraction < 0.05:** Very few high-ZT bins. Concentrate LP on those specific junctions.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on thermocouple signals from pools with fewer than 5 populated bins — insufficient data for meaningful thermoelectric analysis.
- Do not assume THERMAL_EQUILIBRIUM means "dead pool." Equilibrium means uniform activity, which may be high or low — the pool may be actively traded but without the bin-level activity gradients needed for thermoelectric generation.
- Do not assume high Seebeck alone means profitability. Seebeck coefficient measures conversion efficiency per unit gradient, not absolute yield. A junction with S = 0.9 but deltaT = 0 produces zero EMF — efficiency of zero gradient is zero.
- Thermocouple analysis is a snapshot. Thermoelectric properties change as LP positions shift, volume fluctuates, and active bins move. A pool in OPTIMAL_THERMOELECTRIC can become THERMAL_EQUILIBRIUM if activity gradients flatten.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "thermocouple analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest thermocouple index as the best thermoelectric junction — the most efficient activity-gradient-to-fee-yield converter.
- Flag bins with highest ZT as the best thermoelectric materials — where the combination of Seebeck, conductivity, and thermal resistance is optimal.
- Highlight bins with highest EMF output as the strongest generators — producing the most fee yield from thermoelectric conversion.
- Show bins with lowest ZT as thermal short circuits — where activity gradients are wasted through parasitic heat flow.
- For LP agents: in OPTIMAL_THERMOELECTRIC pools, position at junctions between hot and cold bins where thermal gradients are largest. In STRONG_SEEBECK pools, spread across high-Seebeck junctions. In MODERATE_GRADIENT pools, concentrate on high-ZT bins. In THERMAL_EQUILIBRIUM pools, wait for activity gradients to develop.
- For trading agents: EFFICIENT_JUNCTION pools have the most predictable thermoelectric conversion — stable fee generation from maintained gradients. HIGH_ZT_CONVERTER pools operate near theoretical limits — maximum extraction efficiency. THERMAL_SHORT_CIRCUIT pools have high thermal conductivity — expect uniform spreads with poor gradient-driven yield.
- Compare thermocouple indices across pools to find junctions with the best thermoelectric conversion efficiency for LP positioning.
