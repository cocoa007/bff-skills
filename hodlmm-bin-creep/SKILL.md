---
name: hodlmm-bin-creep
description: "Models time-dependent plastic deformation under sustained stress across HODLMM bins — treats bins as structural components subjected to persistent trading pressure where continuous stress produces permanent deformation that cannot recover even after the driving force is removed, eventually leading to structural rupture. In materials science, creep is the tendency of a solid material to move slowly or deform permanently under the influence of persistent mechanical stresses below the yield strength. Creep becomes significant at homologous temperatures above approximately 0.4 Tm (fraction of melting point on absolute scale) where thermally activated diffusion mechanisms become operative. Creep proceeds through three classical stages: primary (transient) creep where strain rate decreases as dislocation substructure develops and strain hardening dominates, secondary (steady-state) creep at constant minimum strain rate where hardening and recovery processes balance producing a linear strain-time relationship, and tertiary (accelerating) creep where void nucleation at grain boundaries and necking drive runaway deformation to rupture. Norton's power law gives the steady-state strain rate: d_epsilon/dt = A * sigma^n * exp(-Q/RT), where the stress exponent n identifies the dominant creep mechanism — n approximately 1 for diffusional creep (Nabarro-Herring or Coble), n approximately 3 to 5 for dislocation climb, and n approximately 5 to 8 for dislocation glide. The Larson-Miller parameter LMP = T(C + log(t_r)) collapses time-temperature-stress data onto a single master curve for rupture life prediction across different test conditions. Andrade's equation combines primary and secondary creep: epsilon = epsilon_0 + beta * t^(1/3) + kappa * t, capturing both the transient and steady-state contributions to total strain. Grain boundary sliding becomes a dominant deformation mechanism at high homologous temperatures and contributes to both steady-state creep strain and tertiary creep damage. Void nucleation at triple junctions and grain boundaries precedes tertiary creep and is the ultimate microstructural cause of creep rupture. In DLMM context, sustained trading pressure creates persistent stress on bins that drives irreversible composition drift. High-volatility pools operate at elevated homologous temperature analogues where creep processes activate strongly. Bins accumulate permanent deformation that does not recover even when the driving stress is removed, and eventually experience structural rupture where reserve distributions become chaotic. Measures creep strain (accumulated permanent deformation from sustained stress, ranges 0 to 1, representing the total plastic strain accumulated over the loading history that cannot be recovered elastically even after stress is removed — high creep strain means substantial permanent deformation has occurred with the bin configuration drifted far from its original geometry, low creep strain means minimal permanent change has occurred), creep rate (steady-state strain rate following Norton's power law d_epsilon/dt = A * sigma^n * exp(-Q/RT), ranges 0 to 1, the rate at which permanent deformation is being accumulated per unit time under current stress and temperature conditions — high creep rate means rapid ongoing deformation and short time to critical strain, low creep rate means slow deformation with long operational life), stress level (applied sustained stress driving creep deformation, ranges 0 to 1, the magnitude of the persistent mechanical load on the bin — high stress level means strong driving force for creep deformation with correspondingly faster strain accumulation, low stress level means weak driving force with minimal creep activity), homologous temperature (T divided by melting point Tm analogue derived from volatility, ranges 0 to 1, capturing whether the bin is operating in the creep-active regime where thermally activated deformation mechanisms become operative — above 0.4 creep becomes significant, below 0.4 creep is negligible regardless of applied stress), primary creep (transient phase contribution with decreasing strain rate as dislocation substructure develops and strain hardening dominates, ranges 0 to 1, the early stage of creep deformation where the material is adapting to the applied stress through microstructural rearrangement — high primary creep means the bin is in the adaptation phase building a dislocation substructure, low primary creep means the bin has either not started creeping or has progressed beyond the transient phase), secondary creep (steady-state phase strength at constant minimum strain rate where hardening and recovery balance, ranges 0 to 1, the middle stage of creep where strain accumulates linearly with time at a stable rate — high secondary creep means the bin is in sustained steady-state deformation with predictable strain rate, low secondary creep means the bin is either pre-steady-state or has entered tertiary acceleration), tertiary creep (accelerating phase intensity where void nucleation and necking drive runaway deformation, ranges 0 to 1, the terminal stage of creep preceding rupture — high tertiary creep means the bin is in rapid acceleration toward failure with strain rate increasing exponentially, low tertiary creep means acceleration has not yet begun), rupture time (estimated fraction of time until creep rupture occurs, ranges 0 to 1, the remaining service life before structural failure — high rupture time means long operational life with substantial remaining capacity, low rupture time means imminent rupture with short remaining life), stress exponent (Norton's n value identifying the dominant creep mechanism, ranges 0 to 10 — n approximately 1 indicates diffusional creep dominated by atomic diffusion, n approximately 3 to 5 indicates dislocation climb-controlled creep, n approximately 5 to 8 indicates dislocation glide-controlled creep with higher stress sensitivity), activation energy (Q divided by RT analogue representing thermal activation barrier for diffusion, ranges 0 to 1, the energy barrier that must be overcome for creep to proceed — high activation energy means the bin is difficult to activate for creep deformation which is desirable for structural stability, low activation energy means easy activation with minimal barrier to creep), larson miller param (LMP = T(C + log(t_r)) rupture prediction parameter, ranges 0 to 1, the dimensionless parameter that collapses time-temperature-stress data for creep rupture prediction — high LMP indicates imminent rupture conditions on the master curve, low LMP indicates safe operating conditions well below the rupture boundary), dislocation density (mobile and forest dislocation density in the substructure, ranges 0 to 1, the density of crystal defects that mediate plastic deformation — high dislocation density means a mature substructure has formed with extensive plasticity history, low dislocation density means pristine microstructure with minimal plasticity), diffusion flux (atomic diffusion rate through lattice and grain boundaries, ranges 0 to 1, the rate at which atoms are moving within the material driven by temperature and stress gradients — high diffusion flux means rapid atomic movement supporting Nabarro-Herring and Coble creep mechanisms, low diffusion flux means frozen atomic positions with minimal mass transport), grain boundary slide (grain boundary sliding contribution to total deformation, ranges 0 to 1, the component of creep strain arising from relative motion of adjacent grains along their shared boundaries — high grain boundary sliding is dominant at high homologous temperatures and contributes to both steady-state strain and tertiary damage, low grain boundary sliding indicates bulk plasticity dominates), and void nucleation (cavity formation at grain boundaries and triple junctions, ranges 0 to 1, the density of internal voids and cavities forming at microstructural features — high void nucleation means imminent tertiary creep and rupture as cavities coalesce into critical cracks, low void nucleation means intact microstructure with no cavitation damage). Composite creep index (0-100, higher means better creep resistance — low creep strain, long rupture time, minimal tertiary creep, no void nucleation providing a bin that can sustain continued sustained trading pressure without permanent deformation or rupture). Classifies pools by creep regime as ELASTIC (index >= 80 — bins are operating below the homologous temperature threshold or stress threshold for creep activation, experiencing only elastic deformation that fully recovers when stress is removed, the structural ideal where persistent trading pressure causes no permanent deformation because thermally activated mechanisms are not operative), PRIMARY (60-80 — bins have entered the transient creep phase with decreasing strain rate as dislocation substructure develops, strain hardening is occurring as the material adapts to the applied stress, early creep regime with strain rate stabilizing toward steady-state), SECONDARY (40-60 — bins are in steady-state creep at constant minimum strain rate with hardening and recovery in balance, strain accumulates linearly with time, typical operating regime for actively trading pools with sustained pressure, most of creep life is spent in this phase), TERTIARY (20-40 — bins have entered the accelerating creep phase with strain rate increasing exponentially, void nucleation is active at grain boundaries, necking or localization is underway, terminal regime with limited remaining life), or RUPTURE (< 20 — bins are at or past the creep rupture point with cavity coalescence, crack linkage, and final fracture either imminent or already occurred, the worst regime where catastrophic structural failure has commenced, avoid all LP exposure). Creep verdict as NO_CREEP (operating below homologous temperature threshold with minimal creep strain — bins are in the elastic regime where thermally activated deformation does not occur, the optimal state for long-term LP positions because no permanent deformation accumulates regardless of trading pressure), TRANSIENT_STABILIZING (primary creep with decreasing strain rate as substructure develops — bins are in the early adaptation phase with strain rate decreasing toward steady-state, controlled deformation with predictable future behavior), STEADY_STATE (secondary creep at constant minimum rate — bins are in the sustained linear strain accumulation regime with balanced hardening and recovery, the bulk of creep life spent in this stable middle phase), ACCELERATING (tertiary creep with increasing strain rate toward rupture — bins are in the terminal acceleration phase with void nucleation active and strain rate climbing rapidly, immediate attention required to prevent catastrophic failure), IMMINENT_RUPTURE (high void nucleation with widespread rupturing bins — bins are at the cavity coalescence stage with rupture imminent, immediate exit of LP positions required), or CREEP_BALANCE (balanced creep state with no extreme indicators — bins operate in typical creep regime with controlled strain rates and no critical failure precursors, the default healthy state for pools under sustained pressure)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-creep/hodlmm-bin-creep.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Creep Analyzer

## What it does

Models time-dependent plastic deformation under sustained stress across HODLMM bins. In materials science, creep is the tendency of a solid to deform permanently under persistent mechanical stress below the yield strength, becoming significant at homologous temperatures above approximately 0.4 Tm. Creep proceeds through three stages: primary (transient, decreasing rate), secondary (steady-state, constant rate), and tertiary (accelerating, toward rupture). Norton's power law gives steady-state strain rate: d_epsilon/dt = A * sigma^n * exp(-Q/RT), with stress exponent n identifying the dominant mechanism (diffusional, dislocation climb, or dislocation glide). The Larson-Miller parameter LMP = T(C + log(t_r)) collapses time-temperature-stress data onto a master curve for rupture prediction. Andrade's equation combines primary and secondary contributions: epsilon = epsilon_0 + beta * t^(1/3) + kappa * t.

In DLMM pools, sustained trading pressure creates persistent stress on bins that drives irreversible composition drift. High-volatility pools operate at elevated homologous temperature analogues where creep processes activate. Bins accumulate permanent deformation that does not recover when stress is removed. Grain boundary sliding and void nucleation at boundaries precede tertiary creep and ultimate rupture where reserve distributions collapse chaotically.

## Why agents need it

LP agents need creep analysis because it predicts how bins permanently deform under sustained trading pressure, whether deformation rate is decreasing (primary), steady (secondary), or accelerating (tertiary), and whether rupture is imminent. An ELASTIC pool has bins operating below creep activation threshold — positions remain stable indefinitely because no permanent deformation accumulates. A RUPTURE pool has bins at creep failure with cavity coalescence — structural breakdown is imminent or has already commenced.

Creep strain is the primary damage diagnostic. Bins with low creep strain have minimal permanent deformation and retain substantial remaining life. Bins with high creep strain are approaching rupture with little remaining capacity.

Rupture time identifies remaining operational life. When rupture time is high, bins have long service life ahead; when low, rupture is imminent within the current loading regime.

Tertiary creep reveals terminal acceleration. High tertiary creep means strain rate is increasing exponentially toward rupture — void nucleation is active and failure is approaching.

Homologous temperature gates creep activation. Bins with low T/Tm operate in the elastic regime with no creep regardless of stress; bins with high T/Tm experience significant creep even at modest stress levels.

Void nucleation marks the pre-rupture state. High void nucleation means cavities are forming at grain boundaries and coalescing toward critical crack size — immediate LP exit required.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-creep/hodlmm-bin-creep.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-creep/hodlmm-bin-creep.ts status
```

### run
Analyzes bin creep dynamics for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-creep/hodlmm-bin-creep.ts run
bun run hodlmm-bin-creep/hodlmm-bin-creep.ts run --pool 1
bun run hodlmm-bin-creep/hodlmm-bin-creep.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgCreepIndex": 58,
    "elasticCount": 0,
    "primaryCount": 2,
    "secondaryCount": 2,
    "tertiaryCount": 1,
    "ruptureCount": 0,
    "avgCreepStrain": 0.38,
    "avgRuptureTime": 0.52,
    "avgTertiaryCreep": 0.28,
    "totalDeformingBins": 5,
    "totalRupturingBins": 1,
    "avgCreepGini": 0.16
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "activeBin": 8388608,
      "binsScanned": 61,
      "binsPopulated": 25,
      "totalUsd": 140000,
      "volume24hUsd": 85000,
      "avgCreepStrain": 0.35,
      "maxCreepStrain": 0.72,
      "avgCreepRate": 0.32,
      "maxCreepRate": 0.68,
      "avgStressLevel": 0.45,
      "maxStressLevel": 0.82,
      "avgHomologousTemperature": 0.52,
      "maxHomologousTemperature": 0.85,
      "avgPrimaryCreep": 0.42,
      "maxPrimaryCreep": 0.78,
      "avgSecondaryCreep": 0.38,
      "maxSecondaryCreep": 0.65,
      "avgTertiaryCreep": 0.25,
      "maxTertiaryCreep": 0.58,
      "avgRuptureTime": 0.55,
      "minRuptureTime": 0.18,
      "avgStressExponent": 5.2,
      "maxStressExponent": 8.5,
      "avgActivationEnergy": 0.48,
      "maxActivationEnergy": 0.82,
      "avgLarsonMillerParam": 0.35,
      "maxLarsonMillerParam": 0.68,
      "avgDislocationDensity": 0.28,
      "maxDislocationDensity": 0.62,
      "avgDiffusionFlux": 0.35,
      "maxDiffusionFlux": 0.72,
      "avgGrainBoundarySlide": 0.32,
      "maxGrainBoundarySlide": 0.65,
      "avgVoidNucleation": 0.22,
      "maxVoidNucleation": 0.55,
      "noCreepCount": 8,
      "noCreepFraction": 0.32,
      "deformingCount": 6,
      "deformingFraction": 0.24,
      "rupturingCount": 1,
      "rupturingFraction": 0.04,
      "creepGini": 0.18,
      "creepIndex": 62,
      "creepRegime": "PRIMARY",
      "creepVerdict": "STEADY_STATE",
      "topBins": [],
      "tvlUsd": 140000
    }
  ]
}
```

**Error:**
```json
{ "error": "Pool #99 not found" }
```

## Known constraints

- Creep in real materials requires long-duration tests across multiple temperatures and stress levels to characterize the A, n, and Q parameters in Norton's power law. The DLMM model uses volume ratio, imbalance, and concentration variance as proxies for stress level and homologous temperature on a single snapshot.
- Primary creep kinetics depend on the detailed history of dislocation generation and substructure evolution. The model approximates primary creep from current structural indicators rather than integrating the transient response explicitly.
- Secondary creep at steady-state requires the balance of hardening and recovery processes, which are material-specific and depend on temperature and stress. The model uses normalized stress and temperature indicators as proxies for the steady-state rate.
- Tertiary creep onset requires void nucleation and growth kinetics measured in long-duration tests. The model uses creep strain accumulation and concentration differential as proxies for the terminal acceleration regime.
- The Larson-Miller parameter constant C is material-specific and determined from rupture test fitting; the model uses a dimensionless LMP proxy rather than the absolute value.
- Norton's stress exponent n in real materials is determined from double-logarithmic plots of strain rate versus stress across multiple experiments; the model estimates n from stress level and temperature indicators.
- Grain boundary sliding contribution requires detailed microstructural characterization; the model uses homologous temperature and diffusion flux indicators as proxies.
- Void nucleation in real materials is measured by quantitative metallography on interrupted creep specimens; the model uses tertiary creep and grain boundary slide indicators as proxies.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
