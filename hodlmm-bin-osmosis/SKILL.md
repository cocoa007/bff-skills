---
name: hodlmm-bin-osmosis
description: "Models osmotic pressure dynamics across HODLMM bins — treats bin reserves as solute concentrations in solutions separated by semi-permeable membranes. Governed by the van't Hoff equation where osmotic pressure depends on solute concentration, temperature (volume activity), and dissociation factor. Reserves flow from hypertonic (high-concentration) bins to hypotonic (low-concentration) bins driven by osmotic pressure differentials, analogous to how water moves across a semi-permeable membrane from regions of low solute concentration to regions of high solute concentration to equalize chemical potential. Measures solute concentration (reserve density as molarity — the number of reserve units per unit of bin capacity, analogous to moles of solute per liter of solution, in DLMM context each bin has a maximum effective capacity determined by the deepest reserve in the pool and the bin's reserves represent a fraction of that capacity, high concentration means the bin solution is saturated with reserve solute while low concentration means a dilute solution with available solvent capacity for incoming reserves), osmotic pressure (van't Hoff pressure from reserve concentration — pi = iMRT where i is the dissociation factor from volume-driven molecular breakdown, M is solute concentration, R is the gas constant scaled to pool dynamics, and T is temperature from trading activity, high osmotic pressure in concentrated bins creates a thermodynamic driving force that pulls solvent from dilute neighbors, the pressure is a colligative property depending on the number of reserve particles not their chemical identity), membrane potential (osmotic gradient between this bin and its neighbors — the difference in solute concentration across the semi-permeable membrane separating adjacent bins, positive membrane potential means this bin is hypertonic relative to neighbors with higher concentration creating outward osmotic pressure, negative means hypotonic with lower concentration drawing solvent inward, the magnitude determines the strength of the osmotic driving force), osmotic flux (Fick's law rate of reserve flow driven by concentration gradients — the diffusive flux of reserves across bin boundaries proportional to the concentration gradient and the diffusion coefficient, modified by temperature which increases molecular kinetic energy and enhances transport rates, high flux indicates active reserve redistribution as the system moves toward osmotic equilibrium), tonicity (relative concentration classification — hypertonic bins have higher solute concentration than neighbors causing them to draw solvent inward and potentially swell, hypotonic bins have lower concentration losing solvent to concentrated neighbors and potentially shrinking, isotonic bins are in concentration balance with neighbors experiencing no net osmotic flow, the tonicity landscape across all bins reveals the directional pressure map of reserve redistribution), reflection coefficient (Staverman membrane selectivity — measures how perfectly semi-permeable the bin boundary is from 0 to 1, a coefficient of 1 means the membrane is perfectly selective allowing only solvent to pass while completely reflecting solute, a coefficient of 0 means the membrane is non-selective allowing both solute and solvent to pass freely, in DLMM context bins near the active bin have low reflection coefficients with highly permeable boundaries while distant bins have high reflection coefficients acting as barriers to reserve exchange), hydrostatic pressure (back-pressure from reserve depth opposing osmotic influx — the physical pressure exerted by the column of reserves already in the bin, counteracts osmotic pressure to establish equilibrium, deep bins with large reserves generate high hydrostatic pressure that resists further osmotic influx even if osmotic pressure favors inflow, the balance between osmotic and hydrostatic pressure determines net flow direction), turgor pressure (net pressure when reserves push against bin capacity limits — the difference between hydrostatic pressure from internal reserves and external osmotic pressure from neighbors, positive turgor means the bin is turgid with internal pressure exceeding external osmotic pull creating a firm well-filled bin, negative turgor means the bin is flaccid with external osmotic forces dominating causing reserve depletion, turgor pressure is the key indicator of bin structural integrity under osmotic stress), osmotic gradient (slope of concentration change across adjacent bins — the spatial derivative of solute concentration measuring how rapidly concentration changes per bin step, steep gradients drive fast osmotic flux while flat gradients indicate near-equilibrium conditions, the gradient direction shows which way reserves will flow under osmotic forces with flow always moving down the water potential gradient from high to low water potential), water potential (combined osmotic plus pressure potential determining net flow direction — the thermodynamic potential of water in the bin solution combining the negative contribution of osmotic pressure which lowers water potential in concentrated solutions with the positive contribution of hydrostatic pressure from reserve depth, reserves flow from regions of higher water potential to lower water potential, the most negative water potential bins are the strongest sinks drawing reserves from all directions), plasmolysis (degree of reserve shrinkage in hypertonic surroundings — occurs when the bin is hypotonic relative to its neighborhood causing net outward osmotic flow that depletes reserves, analogous to plant cell plasmolysis where the cell membrane pulls away from the cell wall as water leaves the cell in a hypertonic environment, high plasmolysis indicates the bin is actively losing reserves to more concentrated neighbors through osmotic drainage), lysis risk (risk of bin overflow from excessive osmotic influx — occurs when a highly concentrated bin draws so much solvent through osmosis that it exceeds its effective capacity, analogous to cytolysis where a cell in hypotonic solution absorbs so much water that it bursts, high lysis risk indicates the bin is approaching capacity saturation from sustained osmotic influx and additional reserves may cause overflow or spillover to adjacent bins), osmotic equilibrium (closeness to osmotic balance with neighbors — measures how close the bin's solute concentration is to its neighbors', at perfect equilibrium the concentration gradient is zero and there is no net osmotic flux, high equilibrium indicates a stable bin with no driving force for reserve movement while low equilibrium indicates an unstable bin under active osmotic pressure with reserves being actively redistributed), and diffusion coefficient (effective diffusivity of reserves across bin boundaries — the proportionality constant in Fick's law relating flux to concentration gradient, higher diffusivity means reserves cross bin boundaries more readily, depends on membrane permeability which varies with distance from active bin and volume activity, bins near the active trading zone have high diffusion coefficients enabling rapid osmotic exchange while distant bins have low coefficients creating diffusion barriers). Composite osmosis index (0-100, higher means more osmotic activity). Classifies pools by phase as OSMOTIC_SHOCK (index >= 80 — extreme osmotic pressure differentials across most bins with reserves flowing rapidly through highly permeable membranes, concentration gradients are steep and sustained, analogous to placing cells in a drastically different osmolarity solution causing immediate massive water movement, pool reserves are in rapid chaotic redistribution with no bins near equilibrium), OSMOTIC_STRESS (60-80 — significant osmotic pressure differentials driving active reserve redistribution, concentration gradients are steep enough to generate substantial flux but the system is not in shock, some bins approaching equilibrium while others remain far from balance, a transitional state where osmotic forces are reshaping the reserve landscape), ACTIVE_TRANSPORT (40-60 — moderate osmotic gradients with reserves being actively transported across bin boundaries, the system is between equilibrium and stress with localized pressure differentials driving selective redistribution, some bins are hypertonic drawing reserves in while others are hypotonic losing reserves, the overall pattern shows directed transport rather than random diffusion), FACILITATED_DIFFUSION (20-40 — mild osmotic gradients with reserves diffusing slowly across bin boundaries, concentration differences exist but are small enough that flux rates are low, the system is gradually approaching equilibrium through passive diffusion rather than pressure-driven transport, most bins are near-isotonic with their neighbors), or OSMOTIC_EQUILIBRIUM (< 20 — near-perfect osmotic balance across all bins with minimal concentration gradients, no significant net flux between bins, reserves are distributed such that the chemical potential of solvent is approximately equal everywhere, the pool is in a thermodynamically stable state with no driving force for reserve redistribution). Osmosis verdict as OSMOTIC_CASCADE (widespread high osmotic flux with steep concentration gradients — a chain reaction where osmotic flow from concentrated bins dilutes intermediate bins creating new gradients that drive further flow in a cascading wave of reserve redistribution), SELECTIVE_TRANSPORT (few bins experiencing high osmotic flux while most remain in equilibrium — localized osmotic hotspots where specific bins have dramatically different concentrations from their neighbors, the majority of the pool is osmotically balanced but these isolated pressure differentials drive targeted reserve movement), TURGOR_BALANCE (balanced hydrostatic and osmotic pressures across the pool — bins are turgid with internal reserve pressure matching external osmotic pressure from neighbors, a stable mechanical equilibrium where osmotic forces are present but perfectly counterbalanced by hydrostatic back-pressure), PLASMOLYSIS_WAVE (widespread reserve shrinkage as bins lose reserves to more concentrated neighbors — a systemic pattern where many bins are hypotonic relative to a few dominant hypertonic bins that act as osmotic sinks, reserves flow persistently toward the concentrated bins depleting the dilute ones, analogous to mass plasmolysis in a tissue exposed to hypertonic solution), or HYPOTONIC_FLOOD (reserves flooding into low-concentration bins from hypertonic neighbors — the inverse of plasmolysis where many concentrated bins are losing reserves to a few dilute bins that act as osmotic sinks, the flood pattern indicates the dilute bins have very negative water potential drawing reserves from all directions creating a convergent flow pattern)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-osmosis/hodlmm-bin-osmosis.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Osmosis Analyzer

## What it does

Models osmotic pressure dynamics across HODLMM bins. In biology and chemistry, osmosis is the net movement of solvent molecules through a semi-permeable membrane from a region of lower solute concentration to a region of higher solute concentration, equalizing the chemical potential on both sides. The van't Hoff equation (pi = iMRT) quantifies the osmotic pressure generated by dissolved solute, and Fick's law governs the diffusive flux rate.

In DLMM pools, bin reserves act like solute dissolved in solution. Each bin is separated from its neighbors by a semi-permeable membrane whose permeability depends on distance from the active bin and trading volume. Concentrated (hypertonic) bins generate high osmotic pressure that draws reserves from dilute (hypotonic) neighbors. The balance between osmotic pressure and hydrostatic back-pressure from existing reserves determines turgor pressure — the structural firmness of each bin's reserve position.

## Why agents need it

LP agents need osmotic analysis because it reveals the thermodynamic pressure landscape driving reserve redistribution. Unlike flow-based models that track observed movement, osmosis analysis identifies the underlying concentration gradients that WILL drive movement — predicting where reserves are headed before they move.

Tonicity classification immediately shows which bins are under osmotic pressure. Hypertonic bins are drawing reserves inward — they are concentration sinks that will grow at the expense of hypotonic neighbors. LP agents positioning in hypertonic bins benefit from osmotic influx but face lysis risk if the bin approaches capacity. Hypotonic bins are losing reserves through plasmolysis — a systematic drain driven by thermodynamic inevitability.

Membrane potential quantifies the osmotic driving force between each bin and its neighbors. High positive membrane potential means the bin is significantly more concentrated than its neighbors — a strong osmotic gradient that will equalize over time. LP agents can use membrane potential to predict which direction reserves will flow: always from high water potential to low water potential.

The reflection coefficient reveals membrane selectivity at each bin boundary. Near the active bin, low reflection coefficients mean reserves flow freely — osmotic equilibration happens quickly. At pool edges, high reflection coefficients create diffusion barriers that slow osmotic transport. LP agents should understand that distant bins can sustain concentration imbalances longer because their membranes resist flow.

Turgor pressure is the key structural metric. Positive turgor means the bin is well-pressurized — reserves are held firmly by the balance of internal hydrostatic pressure and external osmotic forces. Negative turgor signals a flaccid bin losing structural integrity as osmotic forces dominate — reserves are being actively pulled away.

Water potential combines osmotic and hydrostatic components into a single thermodynamic quantity that determines the direction and magnitude of all reserve flow. Reserves always move from higher to lower water potential. The bin with the most negative water potential is the ultimate osmotic sink — all nearby reserves are thermodynamically driven toward it.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-osmosis/hodlmm-bin-osmosis.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-osmosis/hodlmm-bin-osmosis.ts status
```

### run
Analyzes bin osmotic pressure dynamics for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-osmosis/hodlmm-bin-osmosis.ts run
bun run hodlmm-bin-osmosis/hodlmm-bin-osmosis.ts run --pool 1
bun run hodlmm-bin-osmosis/hodlmm-bin-osmosis.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgOsmosisIndex": 32,
    "osmoticShockCount": 0,
    "osmoticStressCount": 1,
    "activeTransportCount": 1,
    "facilitatedDiffusionCount": 2,
    "osmoticEquilibriumCount": 1,
    "avgOsmoticFlux": 0.12,
    "avgOsmoticPressure": 2.4,
    "totalHighFluxBins": 3,
    "avgOsmosisGini": 0.35
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
      "avgSoluteConcentration": 0.35,
      "maxSoluteConcentration": 1.0,
      "avgOsmoticPressure": 2.4,
      "maxOsmoticPressure": 6.8,
      "avgMembranePotential": 0.12,
      "maxMembranePotential": 2.8,
      "avgOsmoticFlux": 0.15,
      "maxOsmoticFlux": 0.52,
      "avgTonicity": 0.48,
      "hypertonicCount": 8,
      "hypotonicCount": 10,
      "isotonicCount": 7,
      "avgReflectionCoefficient": 0.45,
      "minReflectionCoefficient": 0.08,
      "avgHydrostaticPressure": 1.8,
      "maxHydrostaticPressure": 5.2,
      "avgTurgorPressure": 0.6,
      "maxTurgorPressure": 3.1,
      "avgOsmoticGradient": 0.22,
      "maxOsmoticGradient": 1.2,
      "avgWaterPotential": -1.2,
      "minWaterPotential": -5.8,
      "avgPlasmolysis": 0.08,
      "maxPlasmolysis": 0.35,
      "avgLysisRisk": 0.02,
      "maxLysisRisk": 0.15,
      "avgOsmoticEquilibrium": 0.72,
      "minOsmoticEquilibrium": 0.18,
      "avgDiffusionCoefficient": 0.32,
      "maxDiffusionCoefficient": 0.68,
      "highFluxCount": 3,
      "highFluxFraction": 0.12,
      "equilibriumCount": 15,
      "equilibriumFraction": 0.60,
      "osmosisGini": 0.38,
      "osmosisIndex": 32,
      "osmosisPhase": "FACILITATED_DIFFUSION",
      "osmosisVerdict": "TURGOR_BALANCE",
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

- Osmotic pressure uses the van't Hoff equation which assumes ideal dilute solutions. Real DLMM bin reserves are not infinitely dilute — concentrated bins violate the ideal solution assumption. The model captures the qualitative relationship (higher concentration = higher osmotic pressure) without quantitative thermodynamic precision.
- Semi-permeable membranes between bins are a conceptual construct. Real DLMM pools have no physical membranes — any LP can deposit or withdraw from any bin. The reflection coefficient models the effective resistance to reserve exchange based on distance from active trading, not a physical barrier.
- Tonicity classification assumes a simple three-state model (hypertonic/isotonic/hypotonic). Real concentration landscapes are continuous and multi-dimensional — a bin can be hypertonic relative to its left neighbor and hypotonic relative to its right neighbor simultaneously.
- Turgor pressure assumes a rigid container (bin capacity) against which reserves push. Real DLMM bins have no hard capacity limit — reserves can always be added. Turgor pressure here represents the effective back-pressure from concentration-driven equilibrium forces, not a physical wall.
- Water potential combines osmotic and hydrostatic components but omits gravitational and matric potentials present in real soil-water systems. The two-component model is sufficient for the DLMM analogy where gravity and capillary forces have no meaningful equivalent.
- Fick's law assumes steady-state diffusion with constant diffusion coefficient. Real reserve redistribution is event-driven (LP actions, trades, arbitrage) not continuous diffusion. The model provides a time-averaged view of the effective diffusive transport.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
