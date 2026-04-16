---
name: hodlmm-bin-plasticity-agent
skill: hodlmm-bin-plasticity
description: "Agent behavior for HODLMM bin plasticity analysis — interprets yield stress, plastic strain, elastic strain, strain hardening, ultimate strength, necking, flow stress, work hardening exponent, Bauschinger effect, anelasticity, plastic zone, true stress, residual stress, and ductility to identify bins with the most favorable structural integrity and guide LP strategies across different deformation regimes."
---

# Agent Behavior — HODLMM Bin Plasticity

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `deformationRegime`, `plasticityVerdict`, `avgYieldStress`, `avgPlasticStrain`, `avgDuctility`, `avgNecking`, and `neckingFraction`.

## Interpreting output

- **deformationRegime = HIGHLY_ELASTIC:** Bins respond elastically to all trading with full recovery upon unloading. Large yield stress means even significant trades do not cause permanent deformation. The structural ideal where bins behave like high-stiffness springs that store and release strain energy without permanent change. Reserves stay where placed because every perturbation snaps back to equilibrium. Best LP regime: passive positions remain stable through trading pressure with no need for rebalancing.
- **deformationRegime = ELASTIC_PLASTIC:** Bins have entered the mixed elastic-plastic regime with some accumulated permanent strain but retain substantial elastic capacity. Moderate strain hardening provides good stability — the bins have absorbed some trading stress and gained resistance, but still respond elastically to most perturbations. This is the typical operating regime for active pools. Good for LP strategies with moderate monitoring.
- **deformationRegime = WORK_HARDENED:** Bins have undergone significant plastic deformation and gained strength from work hardening. The material has become tougher through prior trading — bins now require more force to deform further than they originally did. Operating well into the plastic regime with reduced elastic recovery. Stable for LP positions because the work-hardened structure resists further change, but reserves have already been substantially redistributed from baseline.
- **deformationRegime = PLASTIC:** Bins are deeply in the plastic regime with substantial permanent deformation and reduced load-bearing capacity. Approaching ultimate strength limits with limited remaining ductility. LP positions experience ongoing reserve drift as bins continue yielding under sustained load. Requires active management because the structural state is not stable.
- **deformationRegime = FAILING:** Bins are at or beyond ultimate strength with active necking and imminent structural failure. Deformation is concentrating in critically weak zones and the bin lattice is approaching collapse. The worst structural state — reserves may suddenly redistribute or vanish from necking zones. Avoid LP exposure to bins near the active range; the entire structure may rapidly reorganize.
- **plasticityVerdict = ELASTIC_RECOVERY:** High elastic strain with low plastic strain and strong yield stress. Bins are operating in the elastic regime with full recovery of all deformation. The safest structural state for LP positions because reserves return to equilibrium after each trade. Optimal for passive strategies.
- **plasticityVerdict = YIELDING:** Plastic strain crossing the yield threshold with elevated flow stress. Bins are actively transitioning from elastic to plastic behavior. The critical regime where small additional stress causes outsized permanent deformation. Watch carefully — LP positions may rapidly accumulate permanent reserve displacement as additional trading pushes bins into plastic flow.
- **plasticityVerdict = WORK_HARDENING:** Significant strain hardening with high work hardening exponent. Bins are gaining strength through plastic deformation, becoming more resistant to further deformation as they absorb trading pressure. A self-strengthening dynamic that improves structural integrity over time — favorable for stable LP exposure because the bin lattice is becoming tougher.
- **plasticityVerdict = PLASTIC_FLOW:** Sustained plastic strain with high flow stress. Bins are continuously deforming under load without elastic recovery. Reserves are being permanently redistributed by ongoing trading pressure. LP positions experience continuous drift as the bin lattice flows plastically toward a new equilibrium configuration.
- **plasticityVerdict = NECKING:** High necking with significant fraction of bins in necking state. Bins are approaching ductile failure with localized thinning. The critical warning state where rapid structural collapse may occur. Reduce LP exposure or shift to bins outside the necking zones — collapse may be sudden and asymmetric.
- **plasticityVerdict = ELASTIC_PLASTIC_BALANCE:** Balanced mix of elastic and plastic behavior with no extreme indicators. Bins operate in the typical mixed regime with some permanent deformation but maintained structural integrity. The default healthy state for active pools.
- **avgYieldStress > 0.7:** Very strong yield resistance. Bins maintain their distribution under significant trading pressure without permanent change. Excellent structural stability.
- **avgYieldStress < 0.2:** Very weak yield resistance. Bins immediately enter plastic deformation under any meaningful load. Reserves displace permanently with each trade.
- **avgPlasticStrain > 0.5:** Significant accumulated permanent deformation. Bins have been substantially altered by historical trading. Cannot return to original distribution without external intervention.
- **avgPlasticStrain < 0.15:** Minimal permanent deformation. Bins remain near baseline configuration. Reserves are largely in their original positions.
- **avgElasticStrain > 0.6:** Strong elastic capacity. Bins can absorb significant perturbations with full recovery. Spring-like response to trading pressure.
- **avgElasticStrain < 0.2:** Weak elastic capacity. Bins have little spring-back capability. Most deformation becomes permanent.
- **avgStrainHardening > 0.6:** Strong work hardening. Bins have gained significant resistance from prior trading. Self-strengthening dynamic.
- **avgUltimateStrength > 0.7:** Robust bins, far from collapse threshold. Wide safety margin before structural failure.
- **avgUltimateStrength < 0.3:** Fragile bins, near breaking point. Limited capacity to absorb additional trading stress.
- **avgNecking > 0.5:** Critical localized thinning. Bins are approaching ductile failure with concentrated weak zones. Imminent structural collapse risk.
- **neckingFraction > 0.3:** Widespread necking across the bin lattice. Multiple bins approaching failure simultaneously. The pool structure is in a critical state.
- **avgFlowStress > 6:** Very high resistance to continued plastic deformation. Bins are difficult to deform further despite being in plastic regime.
- **avgWorkHardeningExponent > 0.6:** Strong strain hardening rate. Each increment of plastic deformation significantly increases yield strength.
- **avgBauschingerEffect > 0.5:** Strong directional bias. Bins respond asymmetrically to bidirectional trading. Predict yielding direction matters.
- **avgAnelasticity > 0.5:** Strong time-dependent recovery. Bins show hysteretic behavior with delayed elastic recovery as reserves slowly redistribute.
- **avgPlasticZone > 0.5:** Large fraction of bins under plastic deformation. Most of the lattice is permanently reshaped.
- **avgResidualStress > 6:** High locked-in stress remaining after unloading. Bins retain internal structural bias even when no trading occurs.
- **avgDuctility > 0.6:** High deformation capacity before fracture. Bins can absorb significant additional plastic strain before failing.
- **avgDuctility < 0.2:** Brittle behavior. Bins will fracture suddenly with minimal warning. Avoid concentrated LP positions.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on plasticity signals from pools with fewer than 5 populated bins — insufficient data for meaningful structural characterization.
- Do not assume FAILING means "dead pool." Failing means the bin lattice is approaching structural collapse, not that the pool has zero liquidity — significant reserves may exist but in critically deformed configurations.
- Do not assume high yield stress is always best. Strong yield stress means bins resist deformation but cannot adapt to changing market conditions through reserve redistribution — too much rigidity can prevent natural rebalancing.
- Do not conflate plastic strain with poor structural health. Plastic strain represents accumulated change, not damage — work-hardened bins with high plastic strain may actually be stronger than virgin elastic bins.
- Do not conflate necking with low TVL. Necking is the structural pattern of localized thinning relative to neighbors — it indicates a structural weak point even in pools with high overall reserves.
- Plasticity analysis is a snapshot. Structural state changes as trading continues — yield stress, strain hardening, and necking patterns evolve with each trade. A HIGHLY_ELASTIC pool can become PLASTIC if sustained directional volume accumulates strain. Monitor periodically in dynamic markets.
- Yield stress is computed from structural proxies, not from direct tensile testing — treat it as a classification indicator rather than a precise material property.
- The work hardening exponent n in real materials is determined from log-log plots of true stress vs true strain; the model uses derived strain hardening level as a proxy.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "plasticity analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest plasticity index as the most structurally healthy — the most favorable combination of yield strength, ductility, low necking, and low residual stress.
- Flag bins with highest yield stress as the most stress-resistant — where reserves are most stable under trading pressure.
- Highlight bins with highest necking as the structural weak points — where localized thinning may precede sudden collapse.
- Show bins with highest strain hardening as the toughest — where work hardening has built up significant resistance to further deformation.
- Show bins with highest residual stress as the most internally biased — where structural asymmetry may produce unexpected reserve redistribution under future loading.
- For LP agents: in HIGHLY_ELASTIC pools, position broadly — every bin recovers fully from trading pressure with no permanent displacement. In ELASTIC_PLASTIC pools, prefer bins with high yield stress and low plastic strain. In WORK_HARDENED pools, the structure is stable but already deformed — position in the work-hardened core where strain hardening provides resistance. In PLASTIC pools, expect ongoing reserve drift and avoid passive long-term positions. In FAILING pools, exit positions near necking zones immediately — structural collapse is imminent.
- For trading agents: ELASTIC_RECOVERY pools have predictable execution with reserves returning to equilibrium after each trade. YIELDING pools may produce outsized slippage on the next trade as bins cross the elastic-plastic threshold. WORK_HARDENING pools have stable execution because the bin lattice is gaining strength. PLASTIC_FLOW pools have continuously shifting reserves — execution prices drift between snapshots. NECKING pools have localized thin zones where large trades may produce extreme slippage or reserve collapse.
- Compare plasticity indices across pools to find bin lattices with the most favorable structural integrity for the intended LP strategy.
