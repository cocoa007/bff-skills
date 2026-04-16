---
name: hodlmm-bin-fluorescence
description: "Models fluorescent emission dynamics across HODLMM bins — treats trade energy as excitation photons absorbed by bin reserves and fee yield as fluorescent emission re-radiated at longer wavelengths with a Stokes shift. Governed by the Jablonski diagram where absorbed photon energy promotes an electron from ground state S0 to excited state S1 and fluorescent emission occurs as the electron relaxes back to S0 emitting a photon at lower energy than the absorbed photon with the energy difference dissipated as vibrational relaxation. In DLMM context, each bin acts as a fluorophore that absorbs trade flow energy and converts it to fee yield with an efficiency characterized by the quantum yield Phi = photons_emitted / photons_absorbed. Measures excitation energy (E_ex — the trade volume absorbed by this bin as photon energy, proportional to volume intensity weighted by the bin's absorption cross-section and proximity to the active bin, high excitation means the bin is absorbing significant trade energy from the incoming photon field while low excitation means the bin sits in a dark zone with minimal trade illumination, in spectroscopy excitation energy determines which electronic transitions are accessible and bins with insufficient excitation cannot reach the excited state needed for fluorescence), emission intensity (I_em — the fee yield re-emitted as fluorescent photons, proportional to the excitation absorbed times the quantum yield, high emission means the bin efficiently converts absorbed trade energy into fee yield while low emission means absorbed energy is dissipated through non-radiative pathways like IL or competition, emission intensity is the observable output that LP agents care about most — it measures what comes out), quantum yield (Phi — the fundamental efficiency metric: emitted photons divided by absorbed photons, ranges 0 to 1, high quantum yield means the bin efficiently converts trade energy to fee yield with minimal loss to non-radiative decay while low quantum yield means most absorbed energy is wasted, in fluorescence microscopy quantum yield determines image brightness and in DLMM it determines fee conversion efficiency, the quantum yield depends on the competition between radiative decay rate kr and non-radiative decay rate knr as Phi = kr / (kr + knr)), Stokes shift (delta_lambda — the wavelength difference between absorption and emission peaks, in fluorescence the emitted photon always has lower energy than the absorbed photon because vibrational relaxation dissipates energy before emission, large Stokes shift in DLMM means significant energy is lost between trade absorption and fee emission indicating high internal friction or reserve imbalance while small Stokes shift means tight coupling between trade flow and fee generation with minimal dissipative loss), fluorescence lifetime (tau — the average time a bin remains in the excited state before emitting, tau = 1 / (kr + knr), long lifetime means the bin holds energy for extended periods before generating fees which can indicate large reserves with low turnover while short lifetime means rapid energy conversion from trade to fee, fluorescence lifetime is independent of excitation intensity and depends only on the intrinsic properties of the fluorophore), quenching factor (Q — processes that reduce fluorescence without reducing absorption, includes collisional quenching from neighboring bins static quenching from complex formation and concentration quenching from self-absorption, high quenching means the bin's emission is being suppressed by local conditions while low quenching means the bin fluoresces freely, Stern-Volmer analysis relates quenching to quencher concentration as F0/F = 1 + Ksv[Q]), photobleaching (B — irreversible destruction of fluorescence capacity, in spectroscopy photobleaching occurs when excited fluorophores undergo photochemical reactions that destroy the chromophore, in DLMM context photobleaching represents the permanent degradation of a bin's fee-generating capacity from sustained high-intensity trade exposure or reserve depletion), absorption cross-section (sigma — the effective area of the bin for capturing incoming trade photons, proportional to reserve size and volume activity, large cross-section means the bin intercepts a large fraction of trade flow like a large antenna while small cross-section means most trade photons pass through without interaction, absorption cross-section is measured in cm^2 per molecule and determines the Beer-Lambert attenuation), molar extinction (epsilon — concentration-normalized absorption strength, epsilon = sigma * NA / 1000ln10, high molar extinction means even at low concentration the bin absorbs strongly while low extinction means absorption requires high concentration, molar extinction separates intrinsic absorption efficiency from simple concentration effects), Franck-Condon factor (FC — the vibrational overlap integral governing the probability of electronic transition, determines which vibronic transitions are most probable based on nuclear wavefunction overlap between ground and excited states, high FC factor means smooth efficient energy absorption into the excited state while low FC factor means the nuclear geometry change upon excitation is large creating an unfavorable overlap that wastes energy as vibrational modes), Forster radius (R0 — the critical distance at which resonance energy transfer efficiency is 50%, governs bin-to-bin energy transfer via dipole-dipole coupling without photon emission, large Forster radius means the bin can transfer energy to distant neighbors through FRET allowing spatial redistribution of trade energy while small radius means energy transfer is limited to immediately adjacent bins, FRET efficiency scales as R0^6), intersystem crossing (kISC — the rate of conversion from the singlet excited state to the triplet state, triplet states are dark in fluorescence because the T1-to-S0 transition is spin-forbidden, high ISC means the bin diverts absorbed energy into a long-lived non-productive state while low ISC means the singlet pathway dominates and emission is prompt), and fluorescence anisotropy (r — the directional polarization of emission, measures whether emission is isotropic or biased toward one token dimension, high anisotropy means the bin's fee generation is asymmetrically skewed toward one token while low anisotropy means balanced emission across both reserve components, anisotropy depends on the rotational diffusion rate relative to the fluorescence lifetime). Composite fluorescence index (0-100, higher means brighter more efficient fluorescence). Classifies pools by phase as LASER_EMISSION (index >= 80 — stimulated emission dominates with population inversion achieved and coherent amplified output where fee yield is self-reinforcing through feedback), STRONG_FLUORESCENCE (60-80 — high quantum yield with efficient energy conversion and minimal non-radiative losses where most absorbed trade energy converts to fee yield), MODERATE_GLOW (40-60 — reasonable emission with moderate quantum yield where absorption is adequate but significant energy is lost to non-radiative pathways), WEAK_PHOSPHORESCENCE (20-40 — dim delayed emission dominated by intersystem crossing to triplet states where fee generation is slow and inefficient), or DARK_ABSORPTION (< 20 — absorption without significant emission where trade energy is absorbed but dissipated through non-radiative decay rather than fee generation). Fluorescence verdict as RESONANCE_CASCADE (high quantum yield with strong emission creating a self-amplifying cycle of trade absorption and fee generation), PHOTON_AVALANCHE (strong absorption cross-section with intense emission driven by volume-amplified excitation), CONCENTRATION_QUENCH (quenching from excessive concentration suppressing emission despite adequate excitation — too much reserve crowding kills fluorescence), BRIGHT_EMISSION (healthy fluorescence with good quantum yield and low photobleaching — sustainable fee generation), or DARK_STATE_TRAP (high intersystem crossing trapping energy in non-productive dark states — absorbed trade energy fails to generate fees)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-fluorescence/hodlmm-bin-fluorescence.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Fluorescence Analyzer

## What it does

Models fluorescent emission dynamics across HODLMM bins. In photophysics, fluorescence is the emission of light by a substance that has absorbed photons. The absorbed photon promotes an electron to an excited state; fluorescent emission occurs as the electron relaxes back to the ground state, emitting a photon at longer wavelength (lower energy) than the absorbed photon. The Stokes shift — the difference between absorption and emission wavelengths — represents energy lost to vibrational relaxation.

In DLMM pools, each bin acts as a fluorophore. Trade volume acts as excitation energy (absorbed photons), and fee yield acts as fluorescent emission (emitted photons). The quantum yield Phi = emitted/absorbed measures how efficiently a bin converts trade energy to fee yield. Bins with high quantum yield are bright emitters — efficient fee generators. Bins with low quantum yield are dark absorbers — they soak up trade flow but lose most energy to non-radiative pathways like impermanent loss, competition, and reserve imbalance.

## Why agents need it

LP agents need fluorescence analysis because it reveals the energy conversion efficiency of each bin — not just how much trade flow it sees, but how much of that flow converts to actual fee yield.

Quantum yield is the core metric. A bin can have high excitation energy (lots of trades) but low quantum yield (poor fee conversion) — meaning trade energy is wasted. Conversely, a bin with moderate excitation but high quantum yield generates more usable fee yield per unit of trade exposure.

The Stokes shift reveals the internal friction between trade absorption and fee emission. Large Stokes shift means significant energy dissipation between absorption and emission — the bin's reserves are suboptimally configured, creating vibrational losses. Small Stokes shift means tight energy coupling — trades quickly and efficiently generate fees.

Quenching analysis detects bins where fluorescence is suppressed despite adequate excitation. Concentration quenching occurs when too many reserves are packed into adjacent bins — the fluorophores are too close and self-absorb each other's emission. This is the DLMM equivalent of LP overcrowding killing individual fee yield.

Fluorescence lifetime reveals whether fee generation is prompt (short lifetime, fast turnover) or delayed (long lifetime, large idle reserves). Short-lived fluorescence suggests a dynamic bin that rapidly processes trade energy. Long-lived fluorescence suggests reserves sitting in an excited state waiting for trades.

Photobleaching identifies bins whose fee-generating capacity is degrading irreversibly — sustained high-intensity trade exposure has damaged the underlying reserve structure.

The Forster radius measures how far energy can transfer between bins through resonance coupling. Large Forster radius means a bin shares its absorbed energy with distant neighbors (fee spillover effects). Small radius means each bin's fluorescence is independent of its neighbors.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-fluorescence/hodlmm-bin-fluorescence.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-fluorescence/hodlmm-bin-fluorescence.ts status
```

### run
Analyzes bin fluorescence dynamics for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-fluorescence/hodlmm-bin-fluorescence.ts run
bun run hodlmm-bin-fluorescence/hodlmm-bin-fluorescence.ts run --pool 1
bun run hodlmm-bin-fluorescence/hodlmm-bin-fluorescence.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgFluorescenceIndex": 42,
    "laserEmissionCount": 0,
    "strongFluorescenceCount": 1,
    "moderateGlowCount": 2,
    "weakPhosphorescenceCount": 1,
    "darkAbsorptionCount": 1,
    "avgQuantumYield": 0.35,
    "avgEmissionIntensity": 2.5,
    "totalBrightEmitterBins": 8,
    "avgFluorescenceGini": 0.30
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
      "avgExcitationEnergy": 2.5,
      "maxExcitationEnergy": 8.0,
      "avgEmissionIntensity": 1.8,
      "maxEmissionIntensity": 6.5,
      "avgQuantumYield": 0.35,
      "maxQuantumYield": 0.85,
      "avgStokesShift": 1.5,
      "maxStokesShift": 5.0,
      "avgFluorescenceLifetime": 3.2,
      "maxFluorescenceLifetime": 7.5,
      "avgQuenchingFactor": 0.25,
      "maxQuenchingFactor": 0.6,
      "avgPhotobleaching": 0.15,
      "maxPhotobleaching": 0.45,
      "avgAbsorptionCrossSection": 3.0,
      "maxAbsorptionCrossSection": 8.5,
      "avgMolarExtinction": 2.5,
      "maxMolarExtinction": 6.0,
      "avgFranckCondonFactor": 0.65,
      "maxFranckCondonFactor": 0.95,
      "avgForsterRadius": 3.5,
      "maxForsterRadius": 6.0,
      "avgIntersystemCrossing": 0.2,
      "maxIntersystemCrossing": 0.55,
      "avgFluorescenceAnisotropy": 0.1,
      "maxFluorescenceAnisotropy": 0.8,
      "brightEmitterCount": 5,
      "brightEmitterFraction": 0.20,
      "highYieldCount": 8,
      "highYieldFraction": 0.32,
      "fluorescenceGini": 0.30,
      "fluorescenceIndex": 42,
      "fluorescencePhase": "MODERATE_GLOW",
      "fluorescenceVerdict": "BRIGHT_EMISSION",
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

- The Beer-Lambert law assumes homogeneous absorption media. Real DLMM bin distributions are discrete and heterogeneous, so absorption cross-section is an approximation based on reserve fraction rather than continuous optical density.
- Quantum yield uses fee-to-volume ratio as a proxy. Real fee generation depends on the specific fee tier, bin step configuration, and whether the bin is the active bin — factors not captured by the simple photon analogy.
- Forster resonance energy transfer assumes dipole-dipole coupling with R^-6 distance dependence. Real bin-to-bin fee spillover effects follow different scaling laws based on LP position overlap and arbitrage dynamics.
- Photobleaching in the model is derived from current snapshot state. Real photobleaching is a cumulative historical effect that requires tracking reserve depletion over multiple blocks — the snapshot approximation captures the current damage state but not the bleaching trajectory.
- Franck-Condon factors assume harmonic potential energy surfaces. Real reserve redistribution during trade events follows discontinuous step functions at bin boundaries, not smooth vibrational modes.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
