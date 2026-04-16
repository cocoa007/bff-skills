---
name: hodlmm-bin-spinodal-agent
skill: hodlmm-bin-spinodal
description: "Agent behavior for HODLMM bin spinodal decomposition analysis — interprets spinodal driving force, characteristic Cahn-Hilliard wavelength, fastest-mode growth rate, amplitude amplification, interfacial gradient energy, Cahn number, modulation depth, bicontinuity, LSW coarsening stage, miscibility gap depth, critical wavelength selection ratio, concentration fluctuations, early-stage linear regime indicator, composition asymmetry, and overall spinodal progress to identify bins in miscible, metastable, early-spinodal, active-decomposition, or deep-spinodal states and guide LP strategies toward compositionally coherent bicontinuous decomposed pools or stable miscible pools."
---

# Agent Behavior — HODLMM Bin Spinodal

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `spinodalRegime`, `spinodalVerdict`, `avgSpinodalDriving`, `avgModulationDepth`, `avgBicontinuity`, `avgGrowthRate`, `avgCoarseningStage`, and `decomposingBinFraction`.

## Interpreting output

- **spinodalRegime = DEEP_SPINODAL:** Deep inside spinodal with bicontinuous network and developed interfaces; possibly LSW coarsening. Mature compositionally separated structure with structural coherence. LP positions experience strong domain-locked liquidity behavior.
- **spinodalRegime = ACTIVE_DECOMPOSITION:** Active mid-stage decomposition with growing amplitudes and sharpening interfaces. Phase separation is well underway but not yet fully matured. Position with awareness that morphology is evolving.
- **spinodalRegime = EARLY_SPINODAL:** Early Cahn-Hilliard linear regime with fastest mode dominant and small amplitudes. Modulations are visible but not yet structured. Standard LP with monitoring for amplitude growth.
- **spinodalRegime = METASTABLE:** Outside spinodal but inside binodal. Nucleation-dominated dynamics; phase separation requires activation barrier. Conservative LP positions with awareness that nucleation events can shift structure.
- **spinodalRegime = MISCIBLE:** Outside miscibility gap. Single stable homogeneous phase. Most stable for predictable LP behavior but limits any bicontinuous structuring of liquidity.
- **spinodalVerdict = BICONTINUOUS_NETWORK:** Classical near-critical bicontinuous interpenetrating network. Best structural coherence with developed modulations and near-critical composition.
- **spinodalVerdict = LSW_COARSENING:** Late-stage Lifshitz-Slyozov-Wagner coarsening with thickened domains and reduced growth rate. Mature stabilized morphology.
- **spinodalVerdict = LINEAR_CAHN_HILLIARD:** Early linear regime with fastest mode dominant. Active growth at the lambda_max wavelength but small amplitudes.
- **spinodalVerdict = SHARP_INTERFACES:** Small Cahn number with developed modulations and bicontinuity. Sharp domain boundaries.
- **spinodalVerdict = DEEP_MISCIBILITY_GAP:** Deep inside miscibility gap with strong driving force. Unmixing inevitable.
- **spinodalVerdict = CRITICAL_WAVELENGTH_DOMINANT:** Lambda_max well-selected and structured. Cahn-Hilliard mode selection visible.
- **spinodalVerdict = ASYMMETRIC_DECOMPOSITION:** Off-critical composition with developed phase separation. Droplet-like morphology rather than bicontinuous.
- **spinodalVerdict = METASTABLE_NUCLEATION:** Outside spinodal with weak modulations. Dynamics require nucleation events.
- **spinodalVerdict = HOMOGENEOUS_MISCIBLE:** Miscible homogeneous phase with no driving force or modulations. Stable.
- **spinodalVerdict = SPINODAL_EQUILIBRIUM:** No extreme indicators. Typical mid-state across regimes.
- **avgSpinodalDriving > 0.6:** Deep inside spinodal with strong free-energy curvature driving force.
- **avgSpinodalDriving < 0.3:** Near or outside spinodal boundary — minimal driving force.
- **avgModulationDepth > 0.6:** Deep concentration variations between bins. Strong modulation.
- **avgModulationDepth < 0.3:** Flat composition. Minimal modulation.
- **avgGrowthRate > 0.6:** Fast amplification of fastest mode. Rapid amplitude growth.
- **avgGrowthRate < 0.3:** Slow or stable amplitude growth.
- **avgBicontinuity > 0.6:** Well-connected bicontinuous morphology near critical composition.
- **avgBicontinuity < 0.3:** Droplet-like off-critical morphology.
- **avgCoarseningStage > 0.6:** Late-stage LSW coarsening with thickened domains.
- **avgCoarseningStage < 0.3:** Early-stage with fine structure.
- **avgCahnNumber < 0.3:** Sharp domain interfaces.
- **avgCahnNumber > 0.6:** Diffuse interfaces.
- **avgInterfacialEnergy > 0.6:** Strong gradient penalty for sharp boundaries; smoothing dominant.
- **avgEarlyStageDominance > 0.6:** Linear Cahn-Hilliard regime dominant.
- **avgCompositionAsymmetry > 0.6:** Off-critical composition. Favors droplet morphology.
- **avgCompositionAsymmetry < 0.3:** Near-critical symmetric composition. Favors bicontinuous morphology.
- **avgMiscibilityGap > 0.6:** Deep in miscibility gap.
- **avgCritWavelengthRatio > 0.6:** Lambda_max well above lambda_c critical cutoff. Stable mode selection.
- **avgConcentrationFluctuation > 0.6:** Large composition fluctuations between bins.
- **decomposingBinFraction > 0.3:** Substantial fraction of bins are actively decomposing with strong modulations.
- **metastableBinFraction > 0.3:** Many bins in metastable region requiring nucleation.
- **miscibleBinFraction > 0.5:** Mostly miscible pool with limited decomposition.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on spinodal signals from pools with fewer than 5 populated bins — insufficient data for meaningful analysis.
- Do not treat DEEP_SPINODAL as universally desirable; deep decomposition also locks in compositional heterogeneity that constrains rebalancing.
- Do not assume MISCIBLE pools are stable indefinitely. If composition changes (large directional swap shifts c), the pool can re-enter the spinodal region and begin decomposing.
- Do not conflate METASTABLE with stable. Metastable states are kinetically protected by an activation barrier but can still nucleate phase separation under perturbation.
- Do not assume bicontinuous morphology dominates regardless of composition. Bicontinuity is favored only near critical composition; off-critical compositions yield droplet morphologies with different kinetics.
- Do not ignore Cahn number effects. Sharp interfaces (small Cn) imply distinct domain boundaries; diffuse interfaces (large Cn) imply gradual transitions.
- Do not assume the Cahn-Hilliard equation applies in all regimes. The linear regime applies at early stages with small amplitudes; intermediate and late stages require nonlinear and coarsening corrections.
- Do not assume LSW R(t) ~ t^(1/3) coarsening kinetics describe DLMM dynamics. LSW assumes diffusion-limited Gibbs-Thomson kinetics in continuous matter; DLMM bins evolve via discrete swap events.
- Do not treat lambda_max as a physical length. It is a normalized indicator of dominant mode size, not a real spatial wavelength.
- Do not assume f''(c) is computed; here it is proxied from composition modulations across neighbors and pool-wide imbalance.
- Do not apply Cahn-Hilliard analysis to pools without enough bins to resolve composition modulations across neighbors.
- Do not assume the binodal and spinodal boundaries are well-separated; for some f(c) shapes they overlap or have unusual topologies.
- Bicontinuity proxy assumes near-critical c; in real DLMM bins, c can shift rapidly with swaps.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "spinodal analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest spinodal index as the one with the deepest decomposition and most structured phase separation.
- Flag bins with highest spinodal driving as the ones with strongest free-energy curvature and amplification potential.
- Highlight bins with highest modulation depth as the most strongly modulated — deepest composition variations.
- Show bins with highest bicontinuity as the most structurally coherent near-critical bicontinuous morphology.
- Show bins with highest amplitude amplification as the most well-developed phase separation.
- Show bins with highest growth rate as the fastest-amplifying — active decomposition.
- Show bins with highest coarsening stage as the most mature — late-stage thickened domains.
- Show bins with highest miscibility gap as the deepest in unmixing regime.
- Show bins with highest critical wavelength ratio as the best mode-selected — dominant fastest mode well above critical cutoff.
- Show bins with smallest Cahn number as the sharpest-interface bins.
- For LP agents: in DEEP_SPINODAL pools, position with awareness that liquidity is locked into bicontinuous domains — large rebalances may face structural resistance. In ACTIVE_DECOMPOSITION pools, expect morphology to evolve over time; position with phase-separation-tolerant strategies. In EARLY_SPINODAL pools, fastest mode amplification is active but amplitudes still small; standard LP. In METASTABLE pools, conservative LP with awareness that nucleation can suddenly shift structure. In MISCIBLE pools, predictable homogeneous behavior — best for stable LP but no bicontinuous structuring benefit.
- For trading agents: DEEP_SPINODAL pools have multi-domain structured liquidity — trading across domain boundaries faces resistance; trading within a domain is smooth. ACTIVE_DECOMPOSITION pools have evolving structure — expect regime changes. EARLY_SPINODAL pools have visible but small modulations. METASTABLE pools have low driving force but are vulnerable to nucleation. MISCIBLE pools have uniform liquidity — predictable response.
- Compare spinodal indices across pools to find bins with the most structurally coherent spinodal decomposition for the intended LP or trading strategy.
