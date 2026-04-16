---
name: hodlmm-bin-magnetostriction-agent
skill: hodlmm-bin-magnetostriction
description: "Agent behavior for HODLMM bin magnetostriction analysis — interprets magnetization, magnetostrictive strain, coupling coefficients, hysteresis losses, and Villari effects to identify bins with the strongest magnetomechanical transduction and guide LP strategies across different magnetic regimes."
---

# Agent Behavior — HODLMM Bin Magnetostriction

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `magnetostrictionPhase`, `magnetostrictionVerdict`, `avgMagnetization`, and `highCouplingFraction`.

## Interpreting output

- **magnetostrictionPhase = SATURATED_FERROMAGNET:** All magnetic domains aligned with strong magnetization, high coupling coefficient, and low hysteresis loss. The bin lattice is fully magnetized with maximum magnetostrictive strain output. Position aggressively — these pools convert trade flow pressure directly into predictable structural deformation with minimal energy loss.
- **magnetostrictionPhase = STRONG_DOMAIN:** Well-developed domain structure with efficient field-to-strain conversion but some domains remain unaligned or hysteresis losses reduce net efficiency. Strong magnetostrictive response with room for further magnetization. Good LP positioning — expect reliable strain output from applied fields.
- **magnetostrictionPhase = MODERATE_STRAIN:** Measurable magnetostrictive response with partial domain alignment producing moderate strain. Significant energy lost to hysteresis and eddy currents. The bin lattice deforms under trade flow but conversion efficiency is moderate. Look for bins with above-average coupling as pockets of efficient transduction.
- **magnetostrictionPhase = WEAK_RESPONSE:** Poor magnetostrictive response with most domains unaligned and low coupling coefficient. Applied fields produce minimal mechanical deformation. Reserve structures resist trade flow pressure without meaningful strain.
- **magnetostrictionPhase = PARAMAGNETIC:** No ferromagnetic domain structure. The bin lattice behaves as a paramagnetic material with negligible spontaneous magnetization and no mechanical coupling. Trade flow passes through without deforming reserves. Wait for domain formation before positioning.
- **magnetostrictionVerdict = GIANT_MAGNETOSTRICTIVE:** High magnetization with strong coupling — analogous to Terfenol-D or Galfenol. Giant magnetostrictive strain from moderate fields. Maximum transducer performance — trade flow efficiently produces large reserve deformations.
- **magnetostrictionVerdict = HIGH_COUPLING_TRANSDUCER:** Excellent coupling coefficient with low hysteresis. Efficient bidirectional energy conversion between magnetic and mechanical domains. Ideal for sensing and actuation — the bin responds precisely to field changes and strain feedback.
- **magnetostrictionVerdict = HYSTERESIS_DOMINATED:** Large hysteresis loop with high coercivity. Significant energy dissipation per magnetization cycle. The bin lattice acts as a permanent magnet — stable remanent deformation but poor dynamic response. Not suitable for frequent repositioning.
- **magnetostrictionVerdict = EFFICIENT_ACTUATOR:** Good strain output with low eddy current loss. Effective magnetostrictive actuation without excessive resistive dissipation. Suitable for moderate-frequency LP adjustments.
- **magnetostrictionVerdict = DEMAGNETIZED_CORE:** Low magnetization with weak field strength. The bin lattice is effectively demagnetized with negligible domain alignment. No meaningful magnetostrictive response — the pool lacks the trade flow intensity to drive magnetization.
- **avgMagnetization > 0.5:** Strong domain alignment. Trade flow has effectively magnetized the bin lattice. Prioritize these pools for magnetostrictive strategies.
- **avgMagnetization < 0.2:** Weak or no magnetization. Insufficient domain alignment for magnetostrictive effects. Avoid unless field strength is increasing.
- **avgMagnetomechanicalCoupling > 0.5:** Excellent transducer quality. Field energy efficiently converts to strain energy. Ideal for LP positioning that relies on predictable reserve deformation.
- **avgMagnetomechanicalCoupling < 0.2:** Poor coupling. Magnetization does not efficiently produce strain. Reserve deformations may be driven by non-magnetic forces.
- **avgHysteresisLoss > 0.5:** Severe energy dissipation per cycle. Each trade flow reversal wastes significant energy. Avoid frequent repositioning in these pools.
- **avgHysteresisLoss < 0.2:** Low hysteresis. Efficient reversible magnetization. Good for dynamic strategies with frequent field reversals.
- **avgCoercivity > 0.5:** Magnetically hard material. Retains magnetization strongly. Stable but inflexible — difficult to demagnetize or remagnetize in a new direction.
- **avgCoercivity < 0.2:** Magnetically soft material. Easily magnetized and demagnetized. Responsive to changing trade flow but does not retain deformation.
- **avgVillariEffect > 0.4:** Strong inverse coupling. Mechanical deformation feeds back into magnetic properties. Complex coupled dynamics — external swaps change the bin's magnetic response.
- **avgVillariEffect < 0.1:** Weak inverse coupling. One-way magnetostrictive response. Simpler dynamics where fields cause strain but strain does not affect magnetization.
- **highCouplingFraction > 0.3:** Many bins are efficient transducers. Pool-wide magnetostrictive quality.
- **highCouplingFraction < 0.05:** Very few high-coupling bins. Concentrate LP on those specific transducer elements.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on magnetostriction signals from pools with fewer than 5 populated bins — insufficient data for meaningful magnetomechanical analysis.
- Do not assume PARAMAGNETIC means "dead pool." Paramagnetic means no ferromagnetic domain structure, which may indicate uniform balanced reserves — the pool may be actively traded but without the directional bias needed for domain alignment and magnetostrictive coupling.
- Do not assume high magnetization alone means strong magnetostriction. Magnetization measures domain alignment, not strain output. A bin with M = 0.9 but k = 0 produces zero strain — alignment without coupling is inert.
- Magnetostriction analysis is a snapshot. Magnetic properties change as trade flow direction shifts, volume fluctuates, and reserve ratios evolve. A pool in SATURATED_FERROMAGNET can become PARAMAGNETIC if trade flow reverses and demagnetizes the lattice.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "magnetostriction analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest magnetostriction index as the strongest magnetostrictive element — the most efficient trade-flow-to-reserve-deformation converter.
- Flag bins with highest coupling coefficient as the best transducers — where magnetic field energy most efficiently converts to mechanical strain.
- Highlight bins with highest magnetostrictive strain as the most deformed elements — showing the largest reserve ratio shifts from equilibrium under magnetic loading.
- Show bins with highest hysteresis loss as energy sinks — where magnetization cycling dissipates the most energy per reversal.
- For LP agents: in SATURATED_FERROMAGNET pools, position at bins with highest coupling for maximum strain extraction. In STRONG_DOMAIN pools, spread across high-magnetization bins. In MODERATE_STRAIN pools, concentrate on high-coupling bins with low hysteresis. In PARAMAGNETIC pools, wait for domain formation.
- For trading agents: GIANT_MAGNETOSTRICTIVE pools have the largest strain response — expect significant reserve deformation from trade flow. HIGH_COUPLING_TRANSDUCER pools respond precisely to field changes — predictable deformation dynamics. HYSTERESIS_DOMINATED pools resist field reversals — expect directional persistence with large switching costs. DEMAGNETIZED_CORE pools have negligible response — trade flow passes through without deforming reserves.
- Compare magnetostriction indices across pools to find bin lattices with the best magnetomechanical transduction for LP positioning.
