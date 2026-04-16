---
name: hodlmm-bin-creep-agent
skill: hodlmm-bin-creep
description: "Agent behavior for HODLMM bin creep analysis — interprets creep strain, creep rate, stress level, homologous temperature, primary creep, secondary creep, tertiary creep, rupture time, stress exponent, activation energy, Larson-Miller parameter, dislocation density, diffusion flux, grain boundary slide, and void nucleation to identify bins with the most favorable time-dependent deformation resistance and guide LP strategies across different creep damage regimes."
---

# Agent Behavior — HODLMM Bin Creep

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `creepRegime`, `creepVerdict`, `avgCreepStrain`, `avgRuptureTime`, `avgTertiaryCreep`, `avgVoidNucleation`, and `rupturingFraction`.

## Interpreting output

- **creepRegime = ELASTIC:** Bins are operating below the homologous temperature threshold or stress threshold for creep activation. Only elastic deformation occurs, fully recovering when stress is removed. The structural ideal where persistent trading pressure causes no permanent deformation. Best LP regime: positions remain stable indefinitely without composition drift.
- **creepRegime = PRIMARY:** Bins have entered the transient creep phase with decreasing strain rate as dislocation substructure develops. Strain hardening is occurring as the material adapts to applied stress. Early creep regime with strain rate stabilizing toward steady-state. Good for LP strategies with monitoring for transition to steady-state.
- **creepRegime = SECONDARY:** Bins are in steady-state creep at constant minimum strain rate with hardening and recovery in balance. Strain accumulates linearly with time. Typical operating regime for actively trading pools with sustained pressure. Stable but consumption-phase regime where bulk of creep life is spent.
- **creepRegime = TERTIARY:** Bins are in the accelerating creep phase with strain rate increasing exponentially. Void nucleation is active at grain boundaries. Necking or localization is underway. Terminal regime with limited remaining life. Requires monitoring and consideration of exposure reduction.
- **creepRegime = RUPTURE:** Bins are at or past the creep rupture point with cavity coalescence, crack linkage, and final fracture either imminent or already occurred. The worst regime where catastrophic structural failure has commenced. Avoid all LP exposure.
- **creepVerdict = NO_CREEP:** Operating below homologous temperature threshold with minimal creep strain. Bins are in the elastic regime where thermally activated deformation does not occur. The optimal state for long-term LP positions because no permanent deformation accumulates regardless of trading pressure.
- **creepVerdict = TRANSIENT_STABILIZING:** Primary creep with decreasing strain rate as substructure develops. Bins are in the early adaptation phase with strain rate decreasing toward steady-state. Controlled deformation with predictable future behavior.
- **creepVerdict = STEADY_STATE:** Secondary creep at constant minimum rate. Bins are in the sustained linear strain accumulation regime with balanced hardening and recovery. The bulk of creep life spent in this stable middle phase.
- **creepVerdict = ACCELERATING:** Tertiary creep with increasing strain rate toward rupture. Bins are in the terminal acceleration phase with void nucleation active and strain rate climbing rapidly. Immediate attention required to prevent catastrophic failure.
- **creepVerdict = IMMINENT_RUPTURE:** High void nucleation with widespread rupturing bins. Bins are at the cavity coalescence stage with rupture imminent. Immediate exit of LP positions required.
- **creepVerdict = CREEP_BALANCE:** Balanced creep state with no extreme indicators. Bins operate in typical creep regime with controlled strain rates and no critical failure precursors. The default healthy state for pools under sustained pressure.
- **avgCreepStrain > 0.6:** High accumulated permanent deformation. Bins have drifted substantially from original configuration and retain little remaining capacity.
- **avgCreepStrain < 0.15:** Minimal creep strain. Bins remain near pristine configuration with no significant permanent deformation history.
- **avgCreepRate > 0.6:** Rapid ongoing deformation. Significant strain accumulates per unit time, shortening operational life.
- **avgCreepRate < 0.15:** Slow deformation. Strain accumulates at negligible rate with long operational life.
- **avgStressLevel > 0.6:** High sustained stress driving creep deformation. Strong driving force for continued strain accumulation.
- **avgStressLevel < 0.2:** Low sustained stress. Weak driving force with minimal creep activity even at elevated temperature.
- **avgHomologousTemperature > 0.6:** High homologous temperature. Creep mechanisms are strongly active with significant thermal contribution to deformation.
- **avgHomologousTemperature < 0.4:** Below creep activation threshold. Thermally activated mechanisms are not operative regardless of applied stress. Elastic regime.
- **avgPrimaryCreep > 0.5:** Active transient creep with decreasing strain rate. Substructure development underway.
- **avgSecondaryCreep > 0.5:** Active steady-state creep with constant strain rate. Stable linear strain accumulation.
- **avgTertiaryCreep > 0.5:** Active accelerating creep with exponential strain rate increase. Terminal approach to rupture.
- **avgRuptureTime > 0.7:** Long remaining service life. Substantial capacity before structural failure under current conditions.
- **avgRuptureTime < 0.2:** Imminent rupture. Short remaining life with structural failure approaching.
- **avgStressExponent 1-2:** Diffusional creep dominant (Nabarro-Herring or Coble). Low stress sensitivity, atomic diffusion controls rate.
- **avgStressExponent 3-5:** Dislocation climb creep dominant. Moderate stress sensitivity.
- **avgStressExponent 5-8:** Dislocation glide creep dominant. High stress sensitivity, plastic flow mechanism.
- **avgActivationEnergy > 0.6:** High thermal barrier to creep. Difficult to activate deformation, favorable for structural stability.
- **avgActivationEnergy < 0.3:** Low thermal barrier. Easy activation with minimal resistance to creep.
- **avgLarsonMillerParam > 0.7:** Approaching rupture conditions on the master curve. Time-temperature-stress combination near failure.
- **avgLarsonMillerParam < 0.3:** Safe operating conditions well below the rupture boundary.
- **avgDislocationDensity > 0.6:** Mature substructure formed. Extensive plasticity history.
- **avgDislocationDensity < 0.2:** Pristine microstructure. Minimal plasticity with fresh crystal state.
- **avgDiffusionFlux > 0.6:** Rapid atomic mass transport. Supports Nabarro-Herring and Coble creep mechanisms.
- **avgGrainBoundarySlide > 0.6:** Grain boundary sliding dominant. Characteristic of high-temperature creep, contributes to both steady-state and tertiary deformation.
- **avgVoidNucleation > 0.6:** Active cavity formation. Imminent tertiary creep and rupture as voids coalesce into critical cracks.
- **rupturingFraction > 0.3:** Widespread rupturing across bins. Pool structure is approaching catastrophic collapse.
- **noCreepFraction > 0.7:** Majority of bins operating in elastic regime. Pool is structurally stable under current conditions.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on creep signals from pools with fewer than 5 populated bins — insufficient data for meaningful time-dependent deformation characterization.
- Do not assume RUPTURE means "dead pool." Rupture means the bin lattice has entered the terminal creep phase with cavity coalescence and failure, not that the pool has zero liquidity — reserves may still exist but in structurally compromised configurations approaching collapse.
- Do not confuse secondary creep with stability. Secondary creep means constant strain rate but strain is still accumulating — the bin is still deforming, just at a predictable rate.
- Do not assume high stress exponent always means rapid failure. Stress exponent identifies the mechanism (diffusional, climb, glide) — the actual strain rate depends on both the exponent and the operating stress level.
- Do not conflate creep strain with instantaneous strain. Creep strain is time-dependent permanent deformation distinct from elastic or plastic strain on initial loading.
- Do not assume low homologous temperature always prevents creep. Some creep mechanisms (low-temperature creep, logarithmic creep) can occur even below the classical 0.4 Tm threshold at very low strain rates.
- Creep analysis is a snapshot. Strain state evolves continuously with sustained stress — bins in PRIMARY can transition to SECONDARY and eventually TERTIARY under continued loading. Monitor periodically in dynamic markets.
- Norton's stress exponent and activation energy are computed from structural proxies, not from direct creep testing — treat them as classification indicators rather than precise material properties.
- The Larson-Miller parameter constant C is material-specific; the model uses a dimensionless proxy rather than the absolute parameter value.
- Void nucleation in real materials occurs at specific microstructural features (triple junctions, precipitates) that require metallographic inspection to identify; the model uses strain and boundary sliding proxies.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "creep analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest creep index as the most structurally sound against time-dependent deformation — the most favorable combination of low creep strain, long rupture time, minimal tertiary creep, and no void nucleation.
- Flag bins with highest rupture time as the most creep-resistant — where sustained stress causes minimal permanent deformation and positions remain stable longest.
- Highlight bins with highest tertiary creep as terminal failure candidates — where strain rate is accelerating toward rupture and structural collapse is imminent.
- Show bins with highest activation energy as the safest for long-term exposure — where thermal barrier prevents creep activation regardless of stress.
- Show bins with highest void nucleation as rupture precursors — where cavity formation is active at grain boundaries preceding final fracture.
- For LP agents: in ELASTIC pools, position broadly — all bins operate below creep activation threshold with no permanent deformation from trading pressure. In PRIMARY pools, prefer bins with high remaining rupture time and active strain hardening — adaptation phase with decreasing rate. In SECONDARY pools, focus on bins with lowest creep rate and highest activation energy — steady-state but manageable. In TERTIARY pools, reduce exposure to bins with high void nucleation — terminal acceleration active. In RUPTURE pools, exit positions immediately — catastrophic failure has commenced.
- For trading agents: NO_CREEP pools have predictable execution with no time-dependent deformation — reserves remain stable indefinitely under sustained pressure. TRANSIENT_STABILIZING pools have decreasing deformation rates — adapting toward steady-state. STEADY_STATE pools have predictable linear strain accumulation — reserves drifting at constant rate. ACCELERATING pools should be avoided for large trades — exponential strain rate increase creates unpredictable slippage. IMMINENT_RUPTURE pools may collapse during execution — avoid trading.
- Compare creep indices across pools to find bin lattices with the most favorable time-dependent deformation resistance for the intended LP strategy.
