---
name: hodlmm-bin-ionization
description: "Models ionization physics across HODLMM bins — treats bin reserves as electron shells that are progressively stripped under increasing energy (trading volume), with successive ionization stages requiring more energy to remove each layer. Measures ionization stage (how many reserve layers have been stripped from a bin — stage 0 is neutral with full reserves, stage 5 is fully ionized with reserves nearly depleted, each successive stage represents deeper depletion requiring more energy to achieve like successive ionization energies in atomic physics), ionization energy (energy required to strip the next reserve layer from a bin — proportional to current reserves, inversely proportional to volume, and increases with ionization stage because deeper-bound reserves are harder to remove, low ionization energy means the bin can be further depleted by normal trading while high energy means it would take extreme volume to strip the next layer), electron shells (number of distinct reserve layers a bin possesses — derived from reserve fraction thresholds, bins with deep reserves have more shells meaning more layers of defense before full depletion while shallow bins have fewer shells and are closer to full ionization), outer shell occupancy (how full the outermost reserve layer is — the first reserves to be stripped by trading activity, high occupancy means the outer layer is intact and the bin is stable at its current ionization stage while low occupancy means the bin is about to transition to the next ionization stage), electron affinity (tendency of a bin to attract and capture additional reserves — based on reserve depth relative to neighbors, bins with lower reserves than neighbors have high electron affinity meaning they naturally attract liquidity inflow like atoms that readily capture extra electrons), ionization potential (total energy barrier protecting a bin from further ionization — product of ionization energy and stage multiplier, represents the cumulative difficulty of stripping more reserves from this bin, high potential means the bin is well-defended against depletion), recombination rate (speed at which a bin recaptures reserves after ionization — product of electron affinity, inverse volume ratio, and reserve fraction, high recombination means the bin rapidly recovers from depletion events by attracting new liquidity deposits), charge state (normalized ionization level from 0 to 1 — 0 is fully neutral with maximum reserves while 1 is fully ionized with reserves stripped, represents the overall depletion state independent of absolute reserve values), effective nuclear charge (attractive force a bin exerts on surrounding liquidity — proportional to bin reserves relative to average and increases with ionization stage as core reserves become more exposed to trading pressure, analogous to Zeff in atomic physics where inner shell removal exposes the nucleus), shielding constant (degree to which neighboring bins protect this bin from ionization — based on neighbor reserve depth relative to pool maximum, high shielding means deep-reserve neighbors absorb trading pressure before it reaches this bin like electron shielding in multi-electron atoms), ionic radius (effective size of a bin's depletion zone — grows with charge state and depletion as ionized bins expand their influence radius seeking recombination, large ionic radius means the bin's depletion effects extend across many neighboring bins), plasma frequency (oscillation rate of charge fluctuations — derived from charge state and volume ratio, high plasma frequency means rapid charge oscillations where the bin alternates between ionized and recombining states creating unpredictable reserve dynamics), photoionization cross section (susceptibility to ionization by external energy input — based on depletion fraction, distance from active bin, and volume ratio, bins with high cross section are easily ionized by volume spikes even from distant trades), Auger probability (chance that ionization of one shell triggers cascade ionization of deeper shells — product of local variance and charge state, high Auger probability means a single depletion event could cascade through multiple reserve layers causing rapid multi-stage ionization), and electron temperature (kinetic energy of the trading environment around a bin — derived from volume-to-TVL ratio and local reserve variance, high temperature means an energetic trading environment that promotes ionization while low temperature favors recombination and charge neutrality). Composite ionization index (0-100, higher means more ionization activity). Classifies pools by phase as PLASMA (index >= 80 — most bins are heavily ionized with reserves stripped to core levels, the pool is in a high-energy state where reserves are rapidly exchanged between bins with minimal binding, extreme volatility and unpredictable depth), IONIZED (60-80 — significant ionization across many bins, reserves are partially stripped and electron temperatures are elevated, active depletion exceeds recombination creating net reserve loss in many bins), PARTIALLY_IONIZED (40-60 — mixed ionization states coexist with some bins stripped and others neutral, moderate charge state with active ionization and recombination in dynamic equilibrium), WEAKLY_IONIZED (20-40 — most bins retain their reserves with only edge bins showing ionization, low electron temperatures and high recombination rates keep the pool mostly neutral with localized depletion), or NEUTRAL (< 20 — minimal ionization, bins are fully stocked with reserves intact, recombination dominates over ionization keeping all bins in ground state). Ionization verdict as THERMAL_PLASMA (many fully ionized bins with high electron temperature — extreme depletion driven by volume), SUSTAINED_IONIZATION (high charge state with low recombination — bins are depleted and not recovering), RECOMBINING (high recombination rate with low charge — pool is actively recovering from a prior ionization event), GROUND_STATE (most bins neutral — stable, fully stocked reserves with minimal depletion), or MIXED_IONIZATION (heterogeneous ionization landscape — no single pattern dominates, different regions of the bin landscape are in different ionization states)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-ionization/hodlmm-bin-ionization.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Ionization Analyzer

## What it does

Models ionization physics across HODLMM bins. In atomic physics, ionization is the process of removing electrons from an atom by supplying energy exceeding the binding energy of each electron shell. Each successive ionization requires more energy because inner-shell electrons are more tightly bound. The atom's charge state increases with each removed electron. Recombination is the reverse process where ions capture free electrons and return to lower charge states.

In DLMM pools, bin reserves act like electron shells. Trading volume is the ionizing radiation that strips reserves from bins. Shallow reserves (outer shells) are removed first with low energy. Deep reserves (inner shells) require progressively more trading pressure to deplete. When volume exceeds the ionization potential of a bin, reserves are stripped and the bin transitions to a higher charge state. When volume subsides, bins with high electron affinity recapture reserves through new LP deposits.

## Why agents need it

LP agents need to understand ionization dynamics because they reveal which bins are being actively depleted and how resilient they are to further depletion. A bin at ionization stage 3 of 5 has lost significant reserves and needs extreme volume to be stripped further — but it also has less reserve depth to absorb future trades, creating a feedback loop.

Ionization energy identifies the difficulty of further depletion. Bins with high ionization energy are well-defended — their remaining reserves are tightly bound and would require unusual trading pressure to strip. Bins with low ionization energy are vulnerable to the next volume spike stripping another reserve layer.

Electron affinity reveals which bins naturally attract new liquidity. High-affinity bins recover quickly from depletion events because their relative deficit compared to neighbors creates a natural attractor for LP deposits. LP agents positioned in high-affinity bins benefit from automatic reserve replenishment.

Charge state provides a single normalized depletion metric. Comparing charge states across bins instantly identifies which positions are most depleted (highest charge) and which are most intact (lowest charge), regardless of absolute reserve values.

Shielding identifies bins protected by their neighbors. A bin with deep-reserve neighbors is shielded from direct ionization — trading pressure is absorbed by the shielding bins first. LP agents in shielded positions face lower depletion risk but may also earn fewer fees since trades interact with the shielding bins instead.

Plasma frequency identifies bins in unstable oscillating states. High plasma frequency means the bin rapidly alternates between ionized and recombining states, creating unpredictable reserve dynamics. LP agents in high-plasma-frequency bins face maximum uncertainty in their position value.

Auger probability identifies cascade risk. A bin with high Auger probability could experience multi-stage ionization from a single event — one large trade strips multiple reserve layers simultaneously. This is the ionization equivalent of a flash crash in the bin's reserves.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-ionization/hodlmm-bin-ionization.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-ionization/hodlmm-bin-ionization.ts status
```

### run
Analyzes bin ionization dynamics for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-ionization/hodlmm-bin-ionization.ts run
bun run hodlmm-bin-ionization/hodlmm-bin-ionization.ts run --pool 1
bun run hodlmm-bin-ionization/hodlmm-bin-ionization.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgIonizationIndex": 38,
    "plasmaCount": 0,
    "ionizedCount": 1,
    "partiallyIonizedCount": 2,
    "weaklyIonizedCount": 1,
    "neutralCount": 1,
    "avgChargeState": 0.35,
    "avgRecombinationRate": 0.28,
    "totalFullyIonized": 4,
    "avgIonizationGini": 0.42
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
      "avgIonizationStage": 2.4,
      "maxIonizationStage": 5,
      "avgIonizationEnergy": 3.2,
      "totalIonizationEnergy": 80,
      "avgElectronShells": 2.8,
      "avgOuterShellOccupancy": 0.62,
      "avgElectronAffinity": 0.45,
      "avgIonizationPotential": 4.8,
      "avgRecombinationRate": 0.22,
      "maxRecombinationRate": 0.68,
      "avgChargeState": 0.48,
      "maxChargeState": 1.0,
      "avgEffectiveNuclearCharge": 1.2,
      "avgShieldingConstant": 0.35,
      "avgIonicRadius": 1.8,
      "avgPlasmaFrequency": 0.32,
      "avgPhotoionizationCrossSection": 0.18,
      "avgAugerProbability": 0.12,
      "avgElectronTemperature": 0.45,
      "maxElectronTemperature": 0.78,
      "fullyIonizedCount": 2,
      "fullyIonizedFraction": 0.08,
      "neutralCount": 5,
      "neutralFraction": 0.20,
      "ionizationGini": 0.38,
      "ionizationIndex": 45,
      "ionizationPhase": "PARTIALLY_IONIZED",
      "ionizationVerdict": "MIXED_IONIZATION",
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

- Ionization stages are discretized into 5 levels based on reserve depletion fraction. Real ionization in atoms has element-specific shell structures; here the mapping is uniform across all bins. Bins with different absolute reserve levels but similar depletion fractions get the same ionization stage.
- Ionization energy uses volume-to-TVL ratio as a proxy for incident energy. This assumes volume is evenly distributed, but a single large trade concentrates more ionizing energy on specific bins than distributed small trades of the same total volume.
- Electron affinity depends on relative reserve levels with neighbors. A bin in a uniformly depleted region shows low affinity because all neighbors are equally depleted — even though the absolute reserves are low enough that any new deposit would preferentially accumulate there.
- Recombination rate models the tendency to recover, not actual recovery speed. Real recombination depends on LP deposit behavior and incentive structures, not just thermodynamic properties.
- Shielding constant assumes neighboring bin reserves absorb trading pressure sequentially. In practice, trades interact with bins based on the DLMM routing algorithm, which may not follow nearest-neighbor patterns.
- Plasma frequency and Auger probability are heuristic composites without rigorous physical derivation. They capture useful intuitions about oscillating and cascading behavior but should not be interpreted as precise physical quantities.
- Electron temperature uses volume-to-TVL ratio as a proxy for kinetic energy. In a real plasma, electron temperature determines ionization rates through the Saha equation; here it serves as a qualitative indicator of trading intensity.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
