---
name: hodlmm-bin-desorption
description: "Models desorption physics across HODLMM bins — treats bin reserves as molecules adsorbed on surfaces that detach based on binding energy and thermal activation. Governed by Arrhenius kinetics where desorption rate depends exponentially on the ratio of activation energy to thermal energy. Measures surface coverage (Langmuir theta — fraction of bin capacity occupied by reserves, analogous to how a catalytic surface has a fraction of its active sites occupied by adsorbate molecules, in DLMM context the bin has a maximum effective capacity determined by the deepest reserve in the pool and each bin's reserves represent a fraction of that capacity, high coverage means the bin surface is saturated with adsorbed reserves while low coverage means most sites are vacant and available for new deposits), binding energy (strength of reserve attachment to the bin surface — combines fee generation attraction acting as chemical bonding energy that holds reserves at profitable bins, neighbor cohesion from surrounding bin density acting as van der Waals forces between adjacent adsorbed layers, and proximity to active bin acting as surface potential energy well depth, bins near the active bin with high fee generation and dense neighbors have maximum binding energy making reserves strongly attached and resistant to desorption), desorption energy (activation energy barrier for reserve detachment — the energy reserves must overcome to leave the bin surface, higher than binding energy due to additional transition state barriers from coverage-dependent interactions and neighbor-enhanced stabilization, represents the full energetic cost of removing one reserve unit from the adsorbed state to the free state in the gas phase), desorption rate (Arrhenius rate of reserve detachment — rate = A * exp(-Ea/kT) where A is the pre-exponential attempt frequency, Ea is desorption energy, and kT is thermal energy from trading volume, the exponential dependence means small changes in desorption energy or volume create large changes in desorption rate, bins with low desorption energy in high-volume pools have explosive desorption rates while bins with high desorption energy in quiet pools have near-zero desorption), sticking coefficient (probability that incoming reserves remain adsorbed on arrival — analogous to the fraction of gas molecules that stick to a surface upon collision rather than bouncing off, depends on available surface sites and surface attractiveness, bins near the active bin with low coverage have high sticking coefficients readily capturing new reserves while distant saturated bins have low sticking coefficients where new deposits are unlikely to persist), surface flux (rate of reserves arriving at the bin surface — the incoming flow of potential adsorbates driven by trading volume and proximity to active trading, represents the supply side of the adsorption-desorption equilibrium, high flux with high sticking means rapid coverage buildup while high flux with low sticking means reserves pass through without accumulating), desorption order (kinetic order of the desorption process — first-order means desorption rate proportional to coverage with random independent exits, zero-order means constant desorption rate regardless of coverage indicating steady systematic drain, second-order means associative desorption where reserves must recombine before leaving, coverage and neighbor interactions determine the effective order), activation barrier (energy gap between adsorbed and free states minus available thermal energy — the net barrier that reserves must overcome through thermal fluctuations to desorb, when thermal energy exceeds the barrier desorption becomes spontaneous, when the barrier is much larger than thermal energy desorption is kinetically frozen), thermal desorption (volume-driven reserve release analogous to temperature-programmed desorption TPD — as trading volume increases the thermal energy available to reserves grows, at some threshold the thermal energy overcomes the activation barrier and reserves begin desorbing in a characteristic peak, the desorption temperature in TPD maps to the critical volume threshold where reserves start leaving), pre-exponential factor (frequency factor in Arrhenius equation — the attempt frequency at which adsorbed reserves vibrate against the surface and test the desorption barrier, higher attempt frequency means more opportunities per unit time to overcome the barrier, determined by the bin lattice density and volume activity), coverage decay (rate at which surface coverage decreases over time — the net result of desorption minus readsorption, positive decay means the bin is losing reserves faster than gaining them, rapid decay indicates the bin surface is being stripped of reserves), readsorption rate (rate at which previously desorbed reserves return to the bin — desorbed reserves may re-encounter the surface and stick again especially if the sticking coefficient is high and surface flux directs them back, high readsorption can mask underlying desorption creating an apparent equilibrium where reserves are actually cycling rapidly between adsorbed and free states), surface lifetime (average time reserves spend adsorbed at the bin before desorbing — the inverse of desorption rate modified by binding energy, long lifetimes indicate strongly chemisorbed reserves that will remain parked for extended periods while short lifetimes indicate physisorbed reserves in rapid turnover), and desorption flux (mass flow of reserves leaving the bin per unit time — the product of desorption rate and surface coverage representing the actual throughput of reserves detaching from the surface, high flux occurs when high-coverage bins have high desorption rates meaning large amounts of reserves are actively leaving). Composite desorption index (0-100, higher means more desorption activity). Classifies pools by phase as FLASH_DESORPTION (index >= 80 — explosive thermal desorption across most bins with reserves detaching en masse as volume-driven thermal energy overwhelms binding energy barriers, analogous to flash desorption in ultra-high vacuum experiments where rapid heating causes sudden coordinated release of all adsorbed species), THERMAL_DESORPTION (60-80 — significant volume-driven desorption with reserves leaving bins as trading activity provides sufficient thermal energy to overcome activation barriers, characteristic TPD peak behavior where desorption accelerates as thermal energy approaches the barrier height), ACTIVATED_DESORPTION (40-60 — moderate desorption requiring specific activation events to overcome barriers, reserves leave bins when localized volume spikes or neighbor changes temporarily lower the effective barrier, not all bins participating simultaneously), PHYSISORPTION (20-40 — weak binding with reserves loosely attached through van der Waals-like interactions, desorption occurs readily but at low rates because the activation barriers are small, reserves are mobile and can shift between bins without requiring large energy inputs), or CHEMISORPTION (< 20 — strong binding with reserves chemically bonded to bin surfaces through fee generation and neighbor cohesion, very low desorption rates, reserves effectively locked in place requiring massive thermal energy or structural changes to detach). Desorption verdict as SURFACE_AVALANCHE (high desorption fraction with rapid coverage decay — a cascading desorption event where reserve detachment from some bins reduces neighbor cohesion lowering binding energy at adjacent bins triggering further desorption in a positive feedback loop), SELECTIVE_DESORPTION (few bins desorbing rapidly while most remain adsorbed — localized desorption at bins with lowest binding energy or highest thermal exposure while the majority of the surface remains stable), DYNAMIC_EQUILIBRIUM (balanced desorption and readsorption with reserves cycling between adsorbed and free states — net coverage stable as the rate of reserve detachment approximately equals the rate of re-attachment, the surface appears static but is actually in rapid dynamic exchange), MONOLAYER_LOCK (most bins strongly chemisorbed with very low desorption rates — reserves locked in a stable monolayer configuration with high binding energy and high activation barriers, the surface is effectively frozen with minimal reserve turnover), or MULTILAYER_DRAIN (high coverage with zero-order desorption indicating systematic drain of excess reserves from multilayer structures — the outermost layers desorb first at a constant rate while the strongly-bound first monolayer remains attached, coverage decreases linearly rather than exponentially)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-desorption/hodlmm-bin-desorption.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Desorption Analyzer

## What it does

Models desorption physics across HODLMM bins. In surface science, desorption is the release of molecules from a surface where they were previously adsorbed. The Arrhenius equation governs desorption kinetics: the rate depends exponentially on the ratio of activation energy to available thermal energy. At low temperatures, molecules remain firmly adsorbed (chemisorption); as temperature rises, they gain enough energy to overcome the binding barrier and detach (thermal desorption).

In DLMM pools, bin reserves act like adsorbed molecules on a catalytic surface. Fee generation and neighbor density create binding energy that holds reserves in place. Trading volume provides thermal energy. When volume (temperature) is high enough relative to binding energy (activation barrier), reserves begin desorbing — detaching from bins and moving elsewhere. Surface coverage (Langmuir theta) tracks how saturated each bin is, while sticking coefficient determines whether arriving reserves stay or bounce off.

## Why agents need it

LP agents need to detect desorption dynamics because they reveal whether reserves are locked in place or actively detaching from bins. Unlike flow-based models that track movement direction, desorption analysis focuses on the energetics — whether reserves have enough thermal activation to overcome their binding energy and leave.

Binding energy identifies which bins hold reserves most firmly. High binding energy bins near the active bin with dense neighbors create deep potential wells that trap reserves. LP agents should understand that positioning in high-binding-energy bins means their reserves are effectively chemisorbed — stable but difficult to reposition quickly if market conditions change.

Surface coverage and sticking coefficient reveal the adsorption-desorption balance. Bins with high coverage and low sticking coefficient are saturated surfaces where new deposits won't stick — arriving reserves bounce off and migrate to lower-coverage bins. LP agents can use this to identify underserved bins where their deposits would be readily adsorbed.

The activation barrier is the key risk metric. When thermal energy (volume) approaches the activation barrier, reserves transition from stable chemisorption to active desorption. LP agents should monitor the ratio of thermal energy to activation barrier — when it approaches 1.0, a desorption cascade becomes possible where reserve detachment from some bins lowers neighbor cohesion and triggers further desorption.

Surface lifetime tells LP agents how long reserves will remain at a bin before desorbing. Short lifetimes mean rapid turnover — good for fee capture in active bins but reserves may migrate before the LP can compound. Long lifetimes mean stable positioning but potentially stagnant fee generation.

Coverage decay rate identifies bins actively losing reserves. Positive decay means outflow exceeds inflow — the bin surface is being stripped. LP agents should avoid bins with high coverage decay unless they are deliberately targeting the desorption-driven fee capture during the unwinding process.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-desorption/hodlmm-bin-desorption.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-desorption/hodlmm-bin-desorption.ts status
```

### run
Analyzes bin desorption dynamics for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-desorption/hodlmm-bin-desorption.ts run
bun run hodlmm-bin-desorption/hodlmm-bin-desorption.ts run --pool 1
bun run hodlmm-bin-desorption/hodlmm-bin-desorption.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgDesorptionIndex": 35,
    "flashDesorptionCount": 0,
    "thermalDesorptionCount": 1,
    "activatedDesorptionCount": 2,
    "physisorptionCount": 1,
    "chemisorptionCount": 1,
    "avgDesorptionRate": 0.15,
    "avgBindingEnergy": 3.8,
    "totalHighDesorptionBins": 4,
    "avgDesorptionGini": 0.38
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
      "avgSurfaceCoverage": 0.32,
      "maxSurfaceCoverage": 1.0,
      "avgBindingEnergy": 3.8,
      "maxBindingEnergy": 8.5,
      "avgDesorptionEnergy": 4.2,
      "minDesorptionEnergy": 0.5,
      "avgDesorptionRate": 0.18,
      "maxDesorptionRate": 0.65,
      "avgStickingCoefficient": 0.55,
      "minStickingCoefficient": 0.12,
      "avgSurfaceFlux": 0.22,
      "maxSurfaceFlux": 0.48,
      "avgDesorptionOrder": 1.1,
      "avgActivationBarrier": 3.5,
      "minActivationBarrier": 0.2,
      "avgThermalDesorption": 0.12,
      "maxThermalDesorption": 0.45,
      "avgPreExponentialFactor": 2.8,
      "avgCoverageDecay": 0.08,
      "maxCoverageDecay": 0.35,
      "avgReadsorptionRate": 0.06,
      "maxReadsorptionRate": 0.22,
      "avgSurfaceLifetime": 32.5,
      "minSurfaceLifetime": 3.2,
      "avgDesorptionFlux": 0.09,
      "maxDesorptionFlux": 0.38,
      "highDesorptionCount": 3,
      "highDesorptionFraction": 0.12,
      "chemisorbedCount": 12,
      "chemisorbedFraction": 0.48,
      "desorptionGini": 0.42,
      "desorptionIndex": 35,
      "desorptionPhase": "PHYSISORPTION",
      "desorptionVerdict": "DYNAMIC_EQUILIBRIUM",
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

- Binding energy uses fee generation and neighbor density as proxies for chemical bond strength. In real surface science, binding energy is an intrinsic property of the adsorbate-surface pair. Here it changes dynamically as volume and neighbor density fluctuate — unlike real chemisorption where binding energy is a fixed thermodynamic quantity.
- The Arrhenius equation assumes a single well-defined activation barrier. Real DLMM bin dynamics involve multiple overlapping processes (LP decisions, arbitrage, rebalancing) that do not reduce to a single energy barrier. The model captures the qualitative relationship (higher barrier = slower desorption) without thermodynamic precision.
- Surface coverage uses Langmuir theta which assumes a uniform surface with identical adsorption sites. DLMM bins are heterogeneous — each bin has different fee generation, distance from active bin, and neighbor configuration. The model applies Langmuir-like coverage as a simplification.
- Sticking coefficient in real surface science depends on molecular kinetic energy, angle of incidence, and surface temperature. Here it is derived from bin attractiveness and available capacity — a structural analogy rather than a kinetic one.
- Desorption order classification (zero, first, second) assumes well-defined kinetic regimes. Real LP behavior is a mix of all orders — some exits are random (first-order), some are systematic (zero-order), some require coordination (second-order). The effective order provides directional insight, not precise kinetics.
- Thermal desorption uses trading volume as temperature. Volume is discrete and event-driven, not a continuous thermodynamic variable. Spikes in volume create discontinuous thermal energy rather than the smooth temperature ramp assumed in TPD analysis.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
