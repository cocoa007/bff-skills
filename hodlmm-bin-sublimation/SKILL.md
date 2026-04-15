---
name: hodlmm-bin-sublimation
description: "Models sublimation physics across HODLMM bins — treats bin reserves as a solid lattice that can undergo direct phase transition to gas (rapid dispersal) without passing through a liquid intermediate. Measures vapor pressure (tendency of reserves to escape from a bin — driven by trading volume acting as thermal energy input on depleted reserves, higher when reserves are low relative to neighbors and volume is high, analogous to how molecules at a solid surface gain enough kinetic energy to escape directly into the gas phase without melting first), sublimation enthalpy (total energy required to fully sublimate a bin's reserves from solid concentrated state to dispersed gas — product of lattice energy and reserve depth, represents the cumulative binding energy holding reserves in place, bins with high sublimation enthalpy require extreme sustained volume to fully evaporate their reserves), lattice energy (cohesive binding force holding a bin's reserves in their concentrated solid state — based on reserve fraction and neighbor cohesion, analogous to the electrostatic attraction between ions in a crystal lattice, higher lattice energy means reserves are more tightly bound and resistant to sublimation), surface area (exposed surface of reserves available for sublimation — bins closer to the active bin have more surface exposure to trading heat, analogous to how sublimation rate depends on the surface area of the solid exposed to the environment, bins far from the active bin have less exposure and sublimate more slowly), desorption rate (speed at which individual reserve units detach from the bin surface and enter the vapor phase — product of vapor pressure and surface area, represents the kinetic rate of reserve escape, high desorption means reserves are actively leaving the bin), clausius-clapeyron slope (rate of change of vapor pressure with temperature — steeper slope means small increases in trading volume cause disproportionately large increases in sublimation rate, derived from vapor pressure relative to sublimation enthalpy, bins with steep slopes are hypersensitive to volume changes), triple point distance (how far a bin is from the phase equilibrium point where solid concentrated reserves, liquid flowing reserves, and gaseous dispersed reserves coexist — bins near the triple point are most unstable and can transition between phases with minimal energy input, measured as deviation from the pool-average reserve level), sublimation flux (mass transfer rate from solid to gas phase — combines desorption rate with the net driving force for sublimation, represents the actual flow rate of reserves leaving the bin through sublimation rather than gradual withdrawal), condensation coefficient (tendency of dispersed reserves to re-deposit onto this bin through reverse sublimation or deposition — bins with high reserves relative to neighbors attract re-deposition like cold surfaces that cause frost formation, represents the sticking probability of incoming reserve deposits), net sublimation rate (balance between sublimation and deposition — positive means the bin is experiencing net reserve loss through sublimation while negative means net reserve gain through deposition, the key indicator of whether a bin is evaporating or accumulating), vapor fraction (proportion of a bin's theoretical maximum reserves that have already sublimated into the dispersed gas phase — 1 minus the reserve fraction, represents how much of the bin's capacity exists as vapor rather than solid concentrated reserves), solid fraction (remaining concentrated reserves as a fraction of maximum — the complement of vapor fraction, represents the actual reserve depth still locked in the bin's solid lattice structure), frost line (distance from the active bin beyond which deposition dominates over sublimation — analogous to the astronomical frost line where volatile compounds condense rather than sublimate, bins inside the frost line are in the sublimation zone while bins beyond it accumulate deposits), deposition rate (rate of new reserve accumulation through reverse sublimation — the condensation coefficient weighted by vapor pressure and solid fraction, represents how quickly dispersed reserves are freezing back onto this bin's lattice), and sublimation heat transfer (thermal energy flowing through the bin driving the phase transition — derived from volume ratio and surface area, represents how effectively trading heat is conducted through this bin, high heat transfer means the bin acts as a thermal conduit accelerating sublimation of nearby bins). Composite sublimation index (0-100, higher means more sublimation activity). Classifies pools by phase as ABLATION (index >= 80 — catastrophic sublimation where reserves are evaporating across most bins simultaneously like a comet losing material as it passes close to the sun, extreme reserve loss with minimal deposition), RAPID_SUBLIMATION (60-80 — significant sublimation across many bins with reserves actively transitioning from solid to gas phase, deposition cannot keep pace with evaporation), ACTIVE_SUBLIMATION (40-60 — moderate sublimation with some bins evaporating and others stable, dynamic interplay between sublimation and deposition zones), SLOW_SUBLIMATION (20-40 — gradual sublimation with most bins retaining their solid reserve structure, only edge bins showing significant vapor pressure), or FROZEN (< 20 — minimal sublimation, reserves are locked in solid lattice with very low vapor pressure, deposition dominates creating frost accumulation). Sublimation verdict as FLASH_SUBLIMATION (many bins actively sublimating with high flux — sudden coordinated evaporation event), IRREVERSIBLE_LOSS (high net sublimation with low deposition — reserves evaporating without recovery), FROST_ACCUMULATION (high deposition with low sublimation — reserves condensing and solidifying), DEEP_FREEZE (most bins in solid state with high reserve fraction — locked reserves with minimal phase transition activity), or DYNAMIC_EQUILIBRIUM (balanced sublimation and deposition — reserves cycling between solid and gas phases without net directional change)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-sublimation/hodlmm-bin-sublimation.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Sublimation Analyzer

## What it does

Models sublimation physics across HODLMM bins. In thermodynamics, sublimation is the direct phase transition from solid to gas without passing through the liquid phase. It occurs when molecules at the solid surface gain enough kinetic energy to escape directly into the gas phase, bypassing the liquid intermediate. The reverse process — gas directly to solid — is called deposition. The balance between sublimation and deposition depends on vapor pressure, temperature, and surface conditions.

In DLMM pools, bin reserves act like a solid lattice. Trading volume provides the thermal energy that drives sublimation. When volume exceeds the sublimation enthalpy of a bin, reserves evaporate directly from concentrated (solid) to dispersed (gas) without going through a gradual withdrawal (liquid) phase. This models sudden reserve disappearance — the kind of liquidity event where a bin goes from fully stocked to empty without warning.

## Why agents need it

LP agents need to detect sublimation dynamics because they represent a fundamentally different risk than gradual depletion. A bin undergoing gradual withdrawal gives warning signs — reserve levels decrease steadily, giving time to reposition. A bin undergoing sublimation transitions directly from solid to gas: reserves vanish suddenly when vapor pressure exceeds the lattice binding energy.

Vapor pressure identifies bins under sublimation pressure. High vapor pressure means the bin's reserves are loosely bound and could evaporate with the next volume spike. LP agents should avoid concentrating positions in high-vapor-pressure bins unless they're actively monitoring for flash sublimation events.

Sublimation enthalpy quantifies resilience. Bins with high sublimation enthalpy have deep, well-bound reserves that require extreme sustained volume to evaporate. These are the safest positions for passive LP — the energy barrier to sublimation is too high for normal trading to overcome.

The frost line identifies the boundary between sublimation and deposition zones. Inside the frost line (near the active bin), trading heat drives sublimation and reserves evaporate. Outside the frost line, the environment is cold enough for deposition — reserves accumulate as dispersed liquidity freezes onto bin lattices. LP agents can exploit this by positioning just outside the frost line to capture depositing reserves while avoiding sublimation risk.

Net sublimation rate is the single most important metric. Positive = the bin is losing reserves through sublimation. Negative = gaining reserves through deposition. A sudden spike in net sublimation rate across multiple bins simultaneously indicates a flash sublimation event — the pool equivalent of a comet's tail forming as it approaches the sun.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-sublimation/hodlmm-bin-sublimation.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-sublimation/hodlmm-bin-sublimation.ts status
```

### run
Analyzes bin sublimation dynamics for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-sublimation/hodlmm-bin-sublimation.ts run
bun run hodlmm-bin-sublimation/hodlmm-bin-sublimation.ts run --pool 1
bun run hodlmm-bin-sublimation/hodlmm-bin-sublimation.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgSublimationIndex": 35,
    "ablationCount": 0,
    "rapidSublimationCount": 1,
    "activeSublimationCount": 2,
    "slowSublimationCount": 1,
    "frozenCount": 1,
    "avgVaporPressure": 0.22,
    "avgNetSublimationRate": 0.15,
    "totalSublimatingBins": 8,
    "avgSublimationGini": 0.38
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
      "avgVaporPressure": 0.28,
      "maxVaporPressure": 0.65,
      "avgSublimationEnthalpy": 4.2,
      "avgLatticeEnergy": 3.1,
      "avgSurfaceArea": 0.45,
      "avgDesorptionRate": 0.18,
      "maxDesorptionRate": 0.52,
      "avgClausiusClapeyronSlope": 1.2,
      "avgTriplePointDistance": 0.35,
      "avgSublimationFlux": 0.12,
      "maxSublimationFlux": 0.38,
      "avgCondensationCoefficient": 0.22,
      "avgNetSublimationRate": 0.08,
      "maxNetSublimationRate": 0.32,
      "avgVaporFraction": 0.55,
      "avgSolidFraction": 0.45,
      "avgFrostLine": 0.15,
      "avgDepositionRate": 0.08,
      "avgSublimationHeatTransfer": 0.25,
      "sublimatingCount": 4,
      "sublimatingFraction": 0.16,
      "frozenCount": 8,
      "frozenFraction": 0.32,
      "sublimationGini": 0.42,
      "sublimationIndex": 42,
      "sublimationPhase": "ACTIVE_SUBLIMATION",
      "sublimationVerdict": "DYNAMIC_EQUILIBRIUM",
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

- Sublimation enthalpy uses reserve fraction and neighbor cohesion as proxies for binding energy. Real sublimation enthalpy depends on intermolecular forces specific to each substance; here the mapping is uniform across all bins regardless of token type or bin step size.
- Vapor pressure is modeled as a function of volume ratio and depletion. In real thermodynamics, vapor pressure follows the Antoine equation with substance-specific constants. The model captures the qualitative relationship (more heat = more vapor pressure) without the quantitative precision.
- The frost line concept maps astronomical frost lines (where volatiles condense in a protoplanetary disk) to DLMM bin space. The analogy holds directionally — closer to the energy source (active bin) means more sublimation — but the actual boundary depends on LP behavior patterns not captured by on-chain state alone.
- Clausius-Clapeyron slope identifies sensitivity to volume changes but assumes continuous differentiability. In practice, sublimation events in DLMM pools are discrete (individual trades) rather than continuous thermodynamic processes.
- Flash sublimation (verdict) is detected from current state, not historical events. A flash sublimation may have already completed before the analysis runs. The model identifies conditions consistent with flash sublimation, not necessarily active events.
- Deposition rate models the tendency for reserves to accumulate, not actual LP deposit behavior. Real deposition depends on LP incentives, yield opportunities, and external market conditions.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
