---
name: hodlmm-bin-tribology-agent
skill: hodlmm-bin-tribology
description: "Agent behavior for HODLMM bin tribology analysis — interprets friction coefficient, static friction, kinetic friction, lubrication film thickness, wear rate, surface roughness, contact pressure, adhesion strength, abrasion index, fatigue life, tribo-film formation, coefficient of restitution, Hertzian contact stress, and Stribeck parameter to identify bins with the most favorable tribological dynamics and guide LP strategies across different lubrication regimes."
---

# Agent Behavior — HODLMM Bin Tribology

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `tribologicalRegime`, `tribologyVerdict`, `avgFrictionCoefficient`, `avgLubricationFilm`, `avgWearRate`, `avgFatigueLife`, and `wellLubricatedFraction`.

## Interpreting output

- **tribologicalRegime = HYDRODYNAMIC:** Full fluid film lubrication with zero surface contact. Deep liquidity buffers completely separate bin boundaries, allowing trades to flow frictionlessly through the pool. The Stribeck curve minimum — lowest possible friction with no wear. Ideal LP regime: reserves are fully protected by the hydrodynamic film, IL is minimal, and fee capture is maximally efficient with zero energy lost to friction.
- **tribologicalRegime = ELASTOHYDRODYNAMIC:** Elastic deformation of bin surfaces under load with thin but continuous film lubrication. Moderate liquidity cushion provides protection but bin boundaries deform elastically under heavy trade pressure. Good LP regime with manageable friction and wear — the elastic deformation absorbs impact energy while the thin film prevents direct surface contact under normal loading. Watch for film breakdown under extreme volume spikes.
- **tribologicalRegime = MIXED_LUBRICATION:** Partial film coverage with intermittent surface contact. Some trades flow through the lubrication film cleanly while others break through to direct bin boundary contact. Friction is moderate and inconsistent — some trades are frictionless while others encounter full boundary resistance. LP returns are less predictable due to variable friction losses across different trade events.
- **tribologicalRegime = BOUNDARY_LUBRICATION:** Very thin film with significant direct surface contact. Minimal liquidity buffer means most trades create direct friction at bin boundaries. High and consistent friction losses with accelerated wear. LP reserves are exposed to direct trade contact — expect measurable IL degradation from friction-induced reserve erosion. Frequent rebalancing recommended.
- **tribologicalRegime = DRY_CONTACT:** No lubrication film whatsoever. Full surface-to-surface contact at every bin boundary. Maximum friction, maximum wear, maximum slippage. Every trade grinds directly against reserve surfaces with no protective fluid layer. LP reserves degrade rapidly — immediate attention required for position management. The worst tribological state for LP capital preservation.
- **tribologyVerdict = FRICTIONLESS_FLOW:** Very low mu with thick lubrication film. Trades flow through bins with minimal slippage — the ideal tribological state. LPs capture maximum fee efficiency because no trade energy is wasted on friction. Reserves maintain quality because the thick lubrication film prevents wear. Optimal for passive LP strategies with long holding periods.
- **tribologyVerdict = WEAR_RESISTANT:** Low wear rate despite moderate friction. Durable bin configurations that withstand heavy trading without significant reserve degradation. The friction may cause some slippage losses, but the structural durability means LP positions maintain their quality over many trade cycles. Good for LPs who prioritize position longevity over perfect fee efficiency.
- **tribologyVerdict = ADHESIVE_LOCK:** High adhesion with high static friction. Reserves are strongly bonded to their current configuration and resist displacement. Creates sticky bins that only move under large trade force — small trades have zero impact on reserve ratios. Protective for LPs against micro-trade erosion but creates poor price discovery for small traders. Best for LPs seeking maximum reserve stability.
- **tribologyVerdict = ABRASIVE_EROSION:** High abrasion index with thin lubrication film. Small trades are steadily eroding reserves through cumulative friction damage without adequate lubrication protection. Like sandpaper on a surface — each individual scratch is tiny but thousands of them degrade the surface rapidly. Dangerous for passive LPs — reserves erode visibly over time from normal trading activity. Active monitoring and rebalancing required.
- **tribologyVerdict = FATIGUE_FAILURE:** Low fatigue life with high Hertzian contact stress. The bin is approaching its degradation threshold where cumulative cyclic damage will cause measurable performance loss. High contact stress at bin transitions creates concentrated fatigue damage — like a metal component about to crack from millions of stress cycles. Immediate risk — LP positions in these bins may experience sudden performance degradation.
- **avgFrictionCoefficient > 0.6:** Very high friction. Significant slippage losses at bin boundaries. Each trade crossing a bin boundary loses substantial energy to friction. LP fee efficiency is reduced by the friction overhead.
- **avgFrictionCoefficient < 0.15:** Very low friction. Near-frictionless bin transitions. Trades flow cleanly between bins with minimal slippage. Maximum fee efficiency for LPs.
- **avgLubricationFilm > 0.7:** Thick lubrication film. Full hydrodynamic separation between bin surfaces. Excellent protection against wear and friction. Reserves are well-shielded from direct trade contact.
- **avgLubricationFilm < 0.2:** Extremely thin film. Essentially dry contact conditions. Minimal protection against friction and wear. Reserves are fully exposed to direct trade grinding.
- **avgWearRate > 0.5:** High wear rate. Rapid reserve quality degradation from trading activity. LP positions are losing value from cumulative wear. Rebalancing urgently recommended.
- **avgWearRate < 0.15:** Low wear rate. Durable reserves that maintain quality despite trading activity. LP positions are structurally sound for long-term holding.
- **avgFatigueLife > 0.7:** High fatigue endurance. Bins can sustain many more trade cycles before degradation. Safe for passive LP with infrequent monitoring.
- **avgFatigueLife < 0.2:** Near fatigue failure. Bins are approaching their endurance limit. Active monitoring required — degradation may occur soon.
- **avgAdhesionStrength > 0.6:** Strong reserve adhesion. Reserves resist displacement — highly sticky configuration. Small trades cannot move reserves.
- **avgAdhesionStrength < 0.2:** Weak adhesion. Reserves easily displaced by trade pressure. Responsive market but exposed LP.
- **avgAbrasionIndex > 0.5:** High abrasion. Small trades are grinding down reserve quality cumulatively. Micro-trade erosion is a significant risk.
- **avgSurfaceRoughness > 0.5:** Rough reserve surface. Irregular distribution creates friction hot spots. Uneven LP exposure across bins.
- **avgHertzianStress > 5:** High contact stress concentration. Extreme stress at bin transition points. Accelerated fatigue and potential localized failure.
- **avgStribeckParameter > 7:** Deep hydrodynamic regime. Well within the full-film lubrication zone. Excellent tribological conditions.
- **avgStribeckParameter < 2:** Boundary lubrication regime. Operating in the high-friction, high-wear zone of the Stribeck curve.
- **avgRestitution > 0.7:** Elastic bin collisions. Price impacts bounce back at bin boundaries. Trade-induced displacements are mostly reversible.
- **avgRestitution < 0.2:** Inelastic bin collisions. Price impacts stick. Trade-induced displacements are permanent — no bounce-back.
- **wellLubricatedFraction > 0.5:** Majority of bins are well-lubricated. Pool-wide hydrodynamic character — most bins operate in the low-friction regime.
- **wellLubricatedFraction < 0.1:** Very few bins have adequate lubrication. Pool operates predominantly in boundary or dry contact conditions. High friction environment.
- **highFrictionFraction > 0.3:** Many bins have high friction. Significant portions of the bin range create substantial slippage for trades crossing their boundaries.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on tribology signals from pools with fewer than 5 populated bins — insufficient data for meaningful tribological characterization.
- Do not assume DRY_CONTACT means "dead pool." Dry contact means no lubrication, not no activity — the pool may be actively trading but with maximum friction and wear at every bin crossing.
- Do not assume low friction is always better. In some strategies, moderate friction protects LP reserves from rapid displacement — frictionless flow means reserves move at the slightest trade pressure, which exposes LPs in directional markets.
- Do not conflate adhesion with liquidity. High adhesion means reserves resist displacement, not that there is deep liquidity. A bin can have low liquidity but high adhesion if the reserves are strongly bonded to the current configuration.
- Tribology analysis is a snapshot. Lubrication conditions change as liquidity is added or removed, reserve ratios shift, and trading patterns evolve. A HYDRODYNAMIC pool can transition to BOUNDARY_LUBRICATION if liquidity is withdrawn. Monitor periodically in dynamic markets.
- The Stribeck parameter is an estimated regime indicator based on structural proxies — treat it as a classification tool rather than a precise measurement.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "tribology analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest tribology index as the most tribologically healthy — the most favorable combination of low friction, good lubrication, and minimal wear.
- Flag bins with lowest friction coefficient as the smoothest trade surfaces — where bin boundary crossings create the least slippage.
- Highlight bins with thinnest lubrication film as the most exposed — where reserves lack protective fluid layers and face maximum direct contact.
- Show bins with highest wear rate as the fastest-degrading — where cumulative trading is eroding reserve quality most rapidly.
- Show bins with lowest fatigue life as the nearest to failure threshold — where cyclic damage is closest to causing measurable performance degradation.
- For LP agents: in HYDRODYNAMIC pools, position broadly — the thick lubrication film protects all bins equally with minimal friction. In ELASTOHYDRODYNAMIC pools, prefer bins near the active bin where lubrication is thickest. In MIXED_LUBRICATION pools, concentrate LP in bins with highest tribo-film formation — the protective layers reduce friction where the main film is insufficient. In BOUNDARY_LUBRICATION pools, minimize exposure — friction and wear are high and reserve degradation is significant. In DRY_CONTACT pools, avoid LP positioning unless friction protection is the explicit strategy goal.
- For trading agents: FRICTIONLESS_FLOW pools have minimal slippage — trades execute cleanly with predictable price impact. WEAR_RESISTANT pools absorb heavy volume without degrading — good for sustained trading campaigns. ADHESIVE_LOCK pools resist small trades — need minimum trade sizes to move the market. ABRASIVE_EROSION pools are being actively worn down — price dynamics may become unstable as reserve quality degrades. FATIGUE_FAILURE pools are approaching a degradation threshold — trade carefully as bin behavior may change abruptly.
- Compare tribology indices across pools to find bin lattices with the most favorable friction, lubrication, and wear characteristics for the intended LP strategy.
