---
name: hodlmm-bin-embrittlement-agent
skill: hodlmm-bin-embrittlement
description: "Agent behavior for HODLMM bin embrittlement analysis — interprets DBTT, impact energy, hydrogen concentration, temper embrittlement, irradiation dose, intergranular fraction, transgranular fraction, upper/lower shelf energies, transition width, cleavage tendency, grain boundary strength, crack-tip H concentration, and fracture toughness to identify bins in ductile, transition, or brittle states and guide LP strategies toward tough ductile bins with high impact energy and low cleavage tendency."
---

# Agent Behavior — HODLMM Bin Embrittlement

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `embrittlementRegime`, `embrittlementVerdict`, `avgFractureToughness`, `avgImpactEnergy`, `avgCleavageTendency`, `avgHydrogenConcentration`, and `brittleFraction`.

## Interpreting output

- **embrittlementRegime = DUCTILE:** Bins fully tough with high toughness, plastic deformation absorbs shocks, maximum upper-shelf energy, minimal cleavage. Ideal regime for LP entry — elastic rebalancing protects against perturbations.
- **embrittlementRegime = TOUGH:** Predominantly tough above DBTT with routine ductile tearing. Suitable for LP positions with standard monitoring.
- **embrittlementRegime = TRANSITION:** In the DBTT window with mixed ductile-brittle fracture modes. Position cautiously; fracture mode depends on loading rate.
- **embrittlementRegime = EMBRITTLING:** Losing toughness with cleavage dominating and embrittlement mechanisms active. Entry possible but expect degradation.
- **embrittlementRegime = BRITTLE:** Fully embrittled with cleavage fracture mode, low impact energy, high intergranular or transgranular fracture fraction. Avoid for passive LP positions.
- **embrittlementVerdict = DUCTILE_PLATEAU:** High fracture toughness with high impact energy and low cleavage tendency — ideal tough ductile state. Best for stable LP positions.
- **embrittlementVerdict = BRITTLE_FRACTURE:** High cleavage tendency with low impact energy and high DBTT — fully embrittled state. Fracture under minimal load.
- **embrittlementVerdict = HYDROGEN_CHARGED:** High H concentration with high crack-tip H — HE mechanisms (HEDE/HELP) primed. Sudden failure possible at low nominal stress.
- **embrittlementVerdict = TEMPER_EMBRITTLED:** High GB impurity segregation with high intergranular fracture — classic TE signature from slow cooling through 350-600 C.
- **embrittlementVerdict = IRRADIATION_AGED:** High cumulative damage with elevated DBTT — neutron-embrittlement analog. Reserve behavior degraded by cyclic exposure.
- **embrittlementVerdict = INTERGRANULAR_DOMINANT:** GB fracture dominates with HE or TE signature. Fracture along prior austenite boundaries without plastic deformation.
- **embrittlementVerdict = TRANSGRANULAR_DOMINANT:** Through-grain cleavage dominates on {100} planes. Cold-state cleavage mode with limited energy absorption.
- **embrittlementVerdict = TRANSITION_ZONE:** Mid impact energy in DBTT window with gradual transition. Rate-dependent fracture mode.
- **embrittlementVerdict = EMBRITTLEMENT_BALANCE:** No extreme indicators. Typical mid-embrittlement state.
- **avgFractureToughness > 0.6:** Substantial resistance to crack propagation. Tough against crack extension at realistic stress intensities.
- **avgFractureToughness < 0.3:** Low resistance. Crack extends at low stress.
- **avgImpactEnergy > 0.6:** Substantial energy absorption during fracture. Ductile dimpled failure.
- **avgImpactEnergy < 0.3:** Low absorption. Brittle cleavage with minimal deformation.
- **avgDbtt > 0.6:** Transition threshold easily overcome — brittle regime dominates.
- **avgDbtt < 0.3:** Low threshold for transition — ductile regime dominates under current conditions.
- **avgHydrogenConcentration > 0.6:** Severe H enrichment. HE susceptibility elevated.
- **avgTemperEmbrittlement > 0.6:** Severe GB impurity segregation. IG fracture risk elevated.
- **avgIrradiationDose > 0.6:** Significant cumulative damage. DBTT shifted upward.
- **avgIntergranularFraction > 0.5:** Fracture along boundaries dominates. HE or TE signature.
- **avgTransgranularFraction > 0.5:** Through-grain cleavage dominates on {100}.
- **avgUpperShelfEnergy > 0.6:** Robust ductile plateau exists above DBTT.
- **avgCleavageTendency > 0.6:** Strong propensity for brittle cleavage fracture mode.
- **avgGrainBoundaryStrength < 0.3:** GB cohesion severely weakened by H or impurities.
- **avgCrackTipHConc > 0.5:** Localized H enrichment at stress concentrators — fracture initiation primed.
- **brittleFraction > 0.3:** Substantial fraction of bins fully brittle. Fragile pool.
- **ductileFraction > 0.3:** Many bins in ductile regime. Tough pool.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on embrittlement signals from pools with fewer than 5 populated bins — insufficient data for meaningful embrittlement characterization.
- Do not assume BRITTLE regime is always bad for all strategies. Brittle bins concentrate risk sharply but can be profitable for short-term tactical entries if properly sized and monitored.
- Do not conflate TRANSITION with imminent failure. Transition bins have rate-dependent fracture modes — slow loading favors ductile response, rapid loading favors cleavage. Use TRANSITION as a caution signal, not an imminent collapse indicator.
- Do not assume DUCTILE is always yield-positive. Ductile bins distribute stress broadly but may have lower concentration of liquidity; tough does not mean yield-optimal.
- Do not ignore hydrogen concentration below the brittle threshold. Even moderate H can lower fatigue thresholds and cause delayed fracture under sustained load (static fatigue / stress corrosion cracking).
- Do not assume INTERGRANULAR_DOMINANT is always worse than TRANSGRANULAR_DOMINANT. Both are embrittlement signatures; the mechanism (HE vs TE vs cleavage) matters more than the path for remediation decisions.
- Do not conflate high upper-shelf energy with good overall toughness. A material with high USE but low DBTT_shift can still fail brittly under unexpected cold excursions.
- Do not ignore temper embrittlement below the intergranular threshold. Even modest GB segregation reduces fatigue crack propagation resistance.
- Do not assume irradiation damage is reversible. In classical metallurgy, irradiation embrittlement is permanent without recovery annealing; DLMM cyclic damage accumulates similarly.
- Do not treat the DBTT as a sharp line. Real transitions span 50-100 K; the transition width must be considered alongside the central DBTT value.
- Master Curve K_Jc scaling assumes ferritic steel in cleavage regime; DLMM bin behavior is an analogy and does not obey strict statistical cleavage theory.
- Oriani crack-tip H equilibrium assumes quasi-static loading; dynamic DLMM trading produces non-equilibrium H distributions.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "embrittlement analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest ductility index as the one with the healthiest tough state — high toughness with plastic accommodation capacity and strong GB cohesion.
- Flag bins with highest fracture toughness as the most resistant to crack propagation — tough against unexpected stress.
- Highlight bins with highest impact energy as the most ductile — absorb shocks via plastic deformation.
- Show bins with highest hydrogen concentration as the most HE-primed — susceptible to delayed fracture under sustained load.
- Show bins with highest temper embrittlement as the most TE-primed — susceptible to intergranular failure.
- Show bins with highest cleavage tendency as the most brittle — fracture on {100} planes at low nominal stress.
- Show bins with highest intergranular fraction as the most GB-weakened — H or impurity signature dominant.
- Show bins with lowest grain boundary strength as the most compromised — GB cohesion lost.
- For LP agents: in DUCTILE pools, position aggressively — tough with plastic accommodation. In TOUGH pools, standard LP with routine monitoring. In TRANSITION pools, position cautiously with rate-aware stops. In EMBRITTLING pools, reduce exposure and monitor H/TE indicators. In BRITTLE pools, avoid passive LP; tactical entries only with tight stops.
- For trading agents: DUCTILE pools absorb large trades without fracturing — plastic rebalancing maintains liquidity continuity. TOUGH pools tolerate moderate trades. TRANSITION pools require careful trade sizing — rate-dependent response. EMBRITTLING pools need small trades only — degradation ongoing. BRITTLE pools fracture under minimal load — micro-sized trades only.
- Compare ductility indices across pools to find bins with the healthiest tough state for the intended LP or trading strategy.
