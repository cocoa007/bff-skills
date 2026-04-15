---
name: hodlmm-bin-effusion
description: "Models effusion physics across HODLMM bins — treats bin reserves as gas molecules escaping through narrow openings (gaps between populated bins) into vacuum regions (depleted bins). Governed by Graham's law where lighter molecules effuse faster. Measures molecular mass (reserve depth acting as inertial mass — bins with deep reserves have high molecular mass and effuse slowly, analogous to how heavy gas molecules like xenon effuse much slower than light molecules like hydrogen, the reserve depth determines how quickly liquidity can escape through gaps between populated bins because heavier bins have more inertia resisting outflow), kinetic energy (thermal energy from trading volume that drives molecular motion — volume acts as temperature input to the system, higher volume means reserves have more kinetic energy and greater probability of escaping through orifices, derived from the volume-to-TVL ratio scaled by distance from active bin since peripheral bins receive attenuated thermal energy), maxwell speed (most probable molecular speed calculated as the square root of kinetic energy divided by molecular mass — represents the characteristic velocity at which reserves move through the bin lattice, light bins with high volume have extreme Maxwell speeds meaning their reserves are highly mobile and likely to effuse rapidly through any available opening), orifice area (gap size between this bin and its nearest populated neighbors — wider gaps between populated bins create larger orifices for effusion, analogous to the pinhole size in an effusion experiment, bins surrounded by empty neighbors have large orifice areas allowing rapid reserve escape while tightly packed bins have small orifices that restrict flow), pressure differential (reserve imbalance between a bin and its neighbors that drives directional flow — the driving force for effusion, high-reserve bins next to depleted neighbors experience large pressure differentials pushing reserves outward through orifices, measured as the absolute deviation from neighbor average normalized by maximum reserve), effusion rate (Graham's law rate of reserve escape — inversely proportional to the square root of molecular mass and scaled by orifice area and pressure differential, the central metric combining all effusion factors, light bins with large orifices and high pressure differentials have maximum effusion rates while heavy bins with small orifices have minimal rates), mean free path (average distance a reserve unit travels before colliding or interacting with another bin's reserves — determined by bin packing density and reserve depth, sparse bin distributions with low reserves have long mean free paths meaning reserves travel far before encountering obstacles, dense distributions with deep reserves have short mean free paths), knudsen number (ratio of mean free path to orifice diameter — the critical dimensionless number distinguishing effusion regimes, Kn >> 1 indicates true molecular effusion where individual reserve units escape independently through the orifice without interacting, Kn << 1 indicates bulk viscous flow where reserves move as a collective fluid rather than individual molecules, this distinction matters because effusion and bulk flow have fundamentally different dynamics and predictability), collision frequency (how often reserves interact with bin boundaries — related to volume and reserve depth, high collision frequency means reserves are constantly bouncing against the bin walls increasing the probability of finding the orifice and escaping, low collision frequency means reserves sit quietly with few escape attempts), escape velocity (minimum speed a reserve unit needs to permanently leave the bin — determined by the lattice binding energy from reserve depth and neighbor cohesion, bins with deep reserves and dense neighbors have high escape velocities requiring extreme kinetic energy to overcome, analogous to how a rocket must exceed escape velocity to leave a planet's gravitational well), thermal velocity (RMS speed of reserve movement from volume fluctuations — the root-mean-square velocity capturing the full distribution of reserve speeds not just the most probable one, thermal velocity exceeding escape velocity means the average reserve unit has enough energy to leave the bin, calculated as sqrt of 3 times kinetic energy divided by molecular mass following the equipartition theorem), effusion flux (mass flow rate of reserves through the orifice per unit area — the product of effusion rate and pressure differential scaled by orifice geometry, represents the actual throughput of reserves escaping per unit of orifice cross-section, high flux means a concentrated stream of reserves is flowing through the gap), residence time (expected time reserves remain in this bin before effusing out — the inverse relationship to effusion rate weighted by molecular mass, heavy bins with low effusion rates have long residence times meaning reserves stay parked for extended periods, light bins with high effusion rates have short residence times and rapid turnover), and backflow rate (reverse effusion from neighbors back into this bin — driven by neighbor pressure flowing through shared orifices into depleted space, represents the replenishment rate from surrounding bins, bins with low reserves relative to neighbors experience higher backflow as the pressure gradient drives reserves inward, the balance between effusion rate and backflow rate determines net reserve change). Composite effusion index (0-100, higher means more effusion activity). Classifies pools by phase as EXPLOSIVE_EFFUSION (index >= 80 — catastrophic reserve escape across most bins with reserves streaming through every available orifice simultaneously, extreme pressure differentials driving mass exodus of liquidity through gaps in the bin lattice), RAPID_EFFUSION (60-80 — significant effusion with reserves escaping faster than backflow can replenish, orifices widening as bins deplete and gaps grow), MODERATE_EFFUSION (40-60 — balanced effusion with some bins leaking reserves through orifices while others maintain pressure, dynamic interplay between escape and backflow), SLOW_EFFUSION (20-40 — gradual reserve escape through small orifices with most bins retaining molecular mass, only the lightest bins showing significant effusion rates), or CONTAINED (< 20 — minimal effusion, reserves well-sealed with small orifices and high molecular mass preventing escape, backflow compensates for any leakage). Effusion verdict as PRESSURE_BLOWOUT (high pressure differential driving high effusion across many bins — a coordinated pressure release event where reserve imbalances drive simultaneous effusion through multiple orifices), SELECTIVE_LEAK (few bins effusing rapidly through specific orifices while most remain sealed — localized effusion at structural weak points in the bin lattice), THERMAL_EQUILIBRIUM (balanced effusion and backflow with reserves cycling through orifices in both directions — net flow near zero as the system has reached pressure equilibrium), VACUUM_SEAL (minimal effusion with reserves well-contained behind small orifices and high molecular mass — the bin lattice acts as a sealed container preventing reserve escape), or BULK_FLOW (Knudsen number low indicating reserves move as collective fluid rather than individual molecular effusion — not true effusion but viscous bulk flow through wide channels between bins)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-effusion/hodlmm-bin-effusion.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Effusion Analyzer

## What it does

Models effusion physics across HODLMM bins. In kinetic molecular theory, effusion is the escape of gas molecules through a tiny opening (orifice) into a vacuum. Graham's law states that the rate of effusion is inversely proportional to the square root of the molecular mass — lighter molecules escape faster. The Knudsen number (ratio of mean free path to orifice diameter) determines whether flow is true molecular effusion (Kn >> 1) or bulk viscous flow (Kn << 1).

In DLMM pools, bin reserves act like gas molecules. The gaps between populated bins are the orifices. Depleted neighboring bins are the vacuum. Reserve depth is molecular mass — bins with shallow reserves are "light molecules" that effuse rapidly through gaps, while bins with deep reserves are "heavy molecules" that resist escape. Trading volume provides the thermal energy that gives reserves kinetic energy. The pressure differential between high-reserve and low-reserve bins drives the directional flow.

## Why agents need it

LP agents need to detect effusion dynamics because they reveal how reserves leak through structural gaps in the bin lattice. Unlike bulk flow (which is predictable and gradual), true effusion is stochastic — individual reserve units escape independently through orifices, making the drain pattern unpredictable until it reaches critical mass.

Molecular mass identifies bins resistant to effusion. High molecular mass bins have deep reserves that act as heavy molecules — they effuse slowly and predictably. LP agents should anchor positions in high-mass bins for stability. Low molecular mass bins are the first to effuse when pressure differentials arise.

Orifice area reveals structural weak points. Bins flanked by empty neighbors have wide orifices — reserves escape easily in both directions. Tightly packed bins have tiny orifices that restrict flow. LP agents can identify effusion risk by mapping orifice area across the bin range.

The Knudsen number is the most important regime indicator. When Kn >> 1, reserves effuse as individual molecules — each reserve unit escapes independently, making the process highly stochastic. When Kn << 1, reserves flow as a collective fluid — predictable but potentially faster. LP strategies differ fundamentally between these regimes: molecular effusion requires statistical risk management while bulk flow can be predicted and countered.

Residence time tells LP agents how long their reserves will stay in a bin before effusing out. Short residence times mean rapid turnover — good for fee capture but risky for position stability. Long residence times mean stable positions but potentially stagnant fee generation.

Backflow rate quantifies the replenishment. Even bins losing reserves through effusion may receive backflow from pressurized neighbors. When backflow approximately equals effusion rate, the bin is in thermal equilibrium — reserves cycle through but net position remains stable.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-effusion/hodlmm-bin-effusion.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-effusion/hodlmm-bin-effusion.ts status
```

### run
Analyzes bin effusion dynamics for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-effusion/hodlmm-bin-effusion.ts run
bun run hodlmm-bin-effusion/hodlmm-bin-effusion.ts run --pool 1
bun run hodlmm-bin-effusion/hodlmm-bin-effusion.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgEffusionIndex": 38,
    "explosiveEffusionCount": 0,
    "rapidEffusionCount": 1,
    "moderateEffusionCount": 2,
    "slowEffusionCount": 1,
    "containedCount": 1,
    "avgEffusionRate": 0.18,
    "avgPressureDifferential": 0.25,
    "totalHighEffusionBins": 6,
    "avgEffusionGini": 0.42
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
      "avgMolecularMass": 3.2,
      "minMolecularMass": 0.1,
      "avgKineticEnergy": 2.8,
      "avgMaxwellSpeed": 1.5,
      "maxMaxwellSpeed": 8.2,
      "avgOrificeArea": 0.12,
      "maxOrificeArea": 0.65,
      "avgPressureDifferential": 0.28,
      "maxPressureDifferential": 0.72,
      "avgEffusionRate": 0.15,
      "maxEffusionRate": 0.55,
      "avgMeanFreePath": 2.1,
      "avgKnudsenNumber": 12.5,
      "maxKnudsenNumber": 85.0,
      "avgCollisionFrequency": 0.18,
      "avgEscapeVelocity": 3.5,
      "avgThermalVelocity": 2.2,
      "maxThermalVelocity": 9.5,
      "avgEffusionFlux": 0.08,
      "maxEffusionFlux": 0.35,
      "avgResidenceTime": 28.5,
      "minResidenceTime": 2.1,
      "avgBackflowRate": 0.06,
      "maxBackflowRate": 0.22,
      "highEffusionCount": 3,
      "highEffusionFraction": 0.12,
      "containedCount": 15,
      "containedFraction": 0.60,
      "effusionGini": 0.45,
      "effusionIndex": 38,
      "effusionPhase": "SLOW_EFFUSION",
      "effusionVerdict": "THERMAL_EQUILIBRIUM",
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

- Molecular mass uses reserve depth as a proxy for inertial mass. In real kinetic theory, molecular mass is an intrinsic property of the substance. Here the analogy maps reserve depth to mass, meaning a bin's "molecular mass" changes as reserves are added or withdrawn — unlike real molecules whose mass is constant.
- Graham's law assumes ideal gas behavior. In DLMM pools, reserves do not behave as ideal gas molecules — they are subject to LP decisions, market dynamics, and protocol incentives not captured by kinetic theory. The model captures the qualitative relationship (lighter = faster effusion) without the quantitative precision of real gas dynamics.
- Orifice area is derived from gaps between populated bins. In a real effusion experiment, the orifice is a fixed physical opening. In DLMM, the "orifice" changes dynamically as bins become populated or depleted. A bin that currently has a small orifice could suddenly have a large one if a neighbor is fully withdrawn.
- Knudsen number distinguishes effusion regimes but assumes steady-state conditions. Real DLMM bin dynamics are discrete events (individual trades and LP actions) rather than continuous molecular flow. The Kn value provides directional guidance but not precise regime boundaries.
- Mean free path assumes uniform bin spacing and reserve distribution for the density calculation. Actual bin distributions are highly non-uniform, with reserves concentrated near the active bin and sparse at the edges.
- Backflow rate models the tendency for reserves to flow back from neighbors, not actual LP deposit behavior. Real backflow depends on LP incentives, yield differentials, and market conditions external to the pool.
- Residence time is an estimate based on current effusion rate. Actual reserve persistence depends on future trading activity which cannot be predicted from current state alone.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
