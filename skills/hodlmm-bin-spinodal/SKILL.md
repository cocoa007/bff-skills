---
name: hodlmm-bin-spinodal
description: "Models spinodal decomposition in HODLMM bin reserves through Cahn-Hilliard dynamics within the spinodally unstable region of the free energy landscape — treats bins as a homogeneous mixture that spontaneously unmixes into X-rich and Y-rich domains via composition fluctuations that grow without an activation barrier when ∂²G/∂c² < 0. Classical theory: a homogeneous solution inside the spinodal becomes locally unstable to infinitesimal composition fluctuations; the Cahn-Hilliard equation ∂c/∂t = M∇²(f''(c)c - 2K∇²c) governs the evolution; a Fourier mode of wavenumber k grows at amplification rate R(k) = -M*k²*(f''(c) + 2K*k²); the fastest-growing mode has wavenumber k_max = sqrt(|f''|/(4K)) and characteristic wavelength lambda_max = 2*pi*sqrt(2*K/|f''|), with critical wavelength lambda_c = 2*pi*sqrt(K/|f''|) below which gradient-energy penalty stabilizes modes. Inside the spinodal (∂²f/∂c² < 0), the system phase-separates spontaneously without nucleation; outside the spinodal but inside the binodal (∂²f/∂c² > 0 but two phases lower G), the system is metastable and requires nucleation; outside the binodal, the homogeneous phase is stable (miscible). Early-stage decomposition is dominated by linear Cahn-Hilliard amplification of the fastest mode at wavelength lambda_max; intermediate-stage develops bicontinuous interconnected networks when c is near the symmetric critical composition; late-stage coarsening follows Lifshitz-Slyozov-Wagner kinetics R(t) ~ t^(1/3) driven by Gibbs-Thomson curvature differences. The Cahn number Cn = K/(|f''|*L²) controls interface sharpness: small Cn means sharp interfaces, large Cn means diffuse interfaces. In DLMM context, bins decompose spinodally when reserve compositions sit inside the spinodal region of the (X-fraction, Y-fraction) free energy landscape: small composition fluctuations grow into separated X-rich and Y-rich domains with the characteristic Cahn-Hilliard wavelength. A miscible bin has uniform homogeneous composition; a metastable bin is outside the spinodal but inside the miscibility gap; an early spinodal bin shows linear-regime amplitude growth at the dominant wavelength; an active decomposition bin has growing amplitude with sharpening interfaces; a deep spinodal bin shows bicontinuous network morphology with developed interfaces and possibly LSW coarsening. Measures spinodalDriving (|f''(c)| free energy curvature magnitude, ranges 0 to 1 — high means deep inside spinodal with strong driving force, low means near or outside spinodal boundary), characteristicWavelength (lambda_max = 2*pi*sqrt(2K/|f''|), ranges 0 to 1 — high means long-wavelength modulations, low means short-wavelength sharp features), growthRate (R(k_max) = M*f''(c)²/(8K) amplification rate, ranges 0 to 1 — high means fast amplitude growth of fastest mode, low means slow or stable), amplitudeAmplification (fluctuation amplitude exp(R*t), ranges 0 to 1 — high means well-developed amplitude, low means small fluctuations only), interfacialEnergy (gradient-energy K coefficient, ranges 0 to 1 — high means strong gradient penalty for sharp interfaces, low means weak penalty allowing sharp boundaries), cahnNumber (Cn = K/(|f''|*L²) interface sharpness control, ranges 0 to 1 — high means diffuse interfaces, low means sharp interfaces), modulationDepth (composition modulation amplitude, ranges 0 to 1 — high means deep concentration variations, low means flat composition), bicontinuity (bicontinuous interconnected network connectivity, ranges 0 to 1 — high means well-connected bicontinuous morphology near critical composition, low means droplet-like off-critical morphology), coarseningStage (LSW R(t) ~ t^(1/3) coarsening progress, ranges 0 to 1 — high means late-stage coarsening with thickened domains, low means early-stage with fine structure), miscibilityGap (distance from miscibility gap edge, ranges 0 to 1 — high means deep in gap with strong phase separation, low means near or outside miscibility gap edge), critWavelengthRatio (lambda_max/lambda_c selection ratio, ranges 0 to 1 — high means well-selected dominant wavelength above critical cutoff, low means near critical cutoff), concentrationFluctuation (delta-c fluctuation amplitude, ranges 0 to 1 — high means large composition fluctuations, low means small composition variations), earlyStageDominance (linear Cahn-Hilliard regime indicator, ranges 0 to 1 — high means in early linear regime with fastest mode dominant and small amplitudes, low means past linear regime), compositionAsymmetry (|c - c_critical| asymmetry from critical composition, ranges 0 to 1 — high means off-critical composition favoring droplet morphology, low means symmetric near-critical composition favoring bicontinuous), spinodalProgress (overall decomposition progress, ranges 0 to 1 — high means well-progressed through stages, low means initial state), and spinodalIndex (composite 0 to 1 — higher means deeper spinodal decomposition with stronger driving force, developed amplitude, and structured morphology). Composite spinodal index (0-100, higher means deeper spinodal decomposition with developed phase separation). Classifies pools by spinodal regime as DEEP_SPINODAL (index >= 80 — deep inside spinodal with bicontinuous network and developed interfaces and possibly LSW coarsening), ACTIVE_DECOMPOSITION (60-80 — active mid-stage decomposition with growing amplitudes and sharpening interfaces), EARLY_SPINODAL (40-60 — early Cahn-Hilliard linear regime with fastest mode dominant), METASTABLE (20-40 — outside spinodal but inside binodal, nucleation-dominated dynamics), or MISCIBLE (< 20 — outside miscibility gap, single stable homogeneous phase). Spinodal verdict as BICONTINUOUS_NETWORK (high bicontinuity, modulation depth, near-critical composition), LSW_COARSENING (late-stage coarsening with high characteristic wavelength and reduced growth rate), LINEAR_CAHN_HILLIARD (early linear regime with fastest mode dominant and small amplitudes), SHARP_INTERFACES (small Cahn number with developed modulations and bicontinuity), DEEP_MISCIBILITY_GAP (deep inside miscibility gap with strong driving force), CRITICAL_WAVELENGTH_DOMINANT (lambda_max well-selected and structured), ASYMMETRIC_DECOMPOSITION (off-critical composition with developed phase separation), METASTABLE_NUCLEATION (outside spinodal with weak modulations requiring nucleation), HOMOGENEOUS_MISCIBLE (miscible homogeneous phase with no driving force or modulations), or SPINODAL_EQUILIBRIUM (no extreme indicators, typical mid-state)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-spinodal/hodlmm-bin-spinodal.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Spinodal Analyzer

## What it does

Models spinodal decomposition in HODLMM bin reserves through Cahn-Hilliard dynamics within the spinodally unstable region of the free energy landscape. Treats bins as a homogeneous mixture that spontaneously unmixes into X-rich and Y-rich domains via composition fluctuations that grow without an activation barrier when the second derivative of free energy with respect to composition is negative. Quantifies spinodal driving force, characteristic Cahn-Hilliard wavelength lambda_max, fastest-mode growth rate R(k_max), amplitude amplification, interfacial gradient energy, Cahn number, modulation depth, bicontinuity, late-stage LSW coarsening, miscibility gap depth, critical wavelength selection ratio, concentration fluctuation amplitude, early-stage linear regime indicator, composition asymmetry from critical composition, and overall spinodal progress.

In DLMM pools, bins decompose spinodally when reserve compositions sit inside the spinodal region of the (X-fraction, Y-fraction) free energy landscape — small composition fluctuations grow into separated X-rich and Y-rich domains with the characteristic Cahn-Hilliard wavelength. Bicontinuous networks form near the symmetric critical composition; droplet-like morphologies form at off-critical compositions.

## Why agents need it

LP agents need spinodal decomposition analysis because it identifies whether bin reserves are in a homogeneous miscible state (uniform composition, no driving force for unmixing), a metastable state (outside spinodal but inside miscibility gap, requires nucleation), or actively decomposing through the Cahn-Hilliard linear regime, intermediate amplitude amplification, or late-stage LSW coarsening. A DEEP_SPINODAL pool has a bicontinuous interconnected morphology with developed interfaces and possibly coarsening. A MISCIBLE pool has uniform homogeneous composition.

Spinodal driving quantifies the magnitude of free energy curvature. High driving means deep inside spinodal with strong amplification.

Characteristic wavelength tracks the dominant Cahn-Hilliard mode size. Wide wavelengths means coarser separated domains.

Growth rate identifies fastest-mode amplification rate. High growth means rapid amplitude evolution.

Amplitude amplification measures fluctuation amplitude development. High amplification means well-developed phase separation.

Interfacial energy is the gradient-energy coefficient K. High K means strong penalty for sharp boundaries.

Cahn number controls interface sharpness. Small Cahn number means sharp interfaces between domains.

Modulation depth quantifies composition modulation amplitude. High depth means strong concentration variations.

Bicontinuity measures the bicontinuous morphology development. High bicontinuity means well-connected interpenetrating network.

Coarsening stage tracks LSW R(t) ~ t^(1/3) progress. High coarsening means late-stage thickened domains.

Miscibility gap measures distance from gap edge. High gap means deep in unmixing regime.

Critical wavelength ratio compares lambda_max to critical cutoff lambda_c. High ratio means well-selected dominant mode.

Concentration fluctuation tracks delta-c amplitude. High fluctuation means large composition variations.

Early-stage dominance flags linear Cahn-Hilliard regime. High early-stage means small amplitudes with fastest mode dominant.

Composition asymmetry measures distance from critical composition. High asymmetry favors droplet over bicontinuous.

Spinodal progress is overall stage indicator across linear, intermediate, and coarsening stages.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-spinodal/hodlmm-bin-spinodal.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-spinodal/hodlmm-bin-spinodal.ts status
```

### run
Analyzes bin spinodal decomposition state for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-spinodal/hodlmm-bin-spinodal.ts run
bun run hodlmm-bin-spinodal/hodlmm-bin-spinodal.ts run --pool 1
bun run hodlmm-bin-spinodal/hodlmm-bin-spinodal.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgSpinodalIndex": 48,
    "deepSpinodalCount": 0,
    "activeDecompositionCount": 1,
    "earlySpinodalCount": 2,
    "metastableCount": 2,
    "miscibleCount": 0,
    "avgSpinodalDriving": 0.46,
    "avgModulationDepth": 0.42,
    "avgBicontinuity": 0.40,
    "totalDecomposingBins": 6,
    "totalMetastableBins": 11,
    "totalMiscibleBins": 4,
    "avgSpinodalGini": 0.20
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
      "avgSpinodalDriving": 0.48,
      "maxSpinodalDriving": 0.78,
      "avgCharacteristicWavelength": 0.56,
      "avgGrowthRate": 0.42,
      "maxGrowthRate": 0.7,
      "avgAmplitudeAmplification": 0.44,
      "avgInterfacialEnergy": 0.48,
      "avgCahnNumber": 0.42,
      "avgModulationDepth": 0.46,
      "maxModulationDepth": 0.78,
      "avgBicontinuity": 0.42,
      "avgCoarseningStage": 0.4,
      "avgMiscibilityGap": 0.5,
      "avgCritWavelengthRatio": 0.46,
      "avgConcentrationFluctuation": 0.44,
      "avgEarlyStageDominance": 0.38,
      "avgCompositionAsymmetry": 0.4,
      "avgSpinodalProgress": 0.42,
      "decomposingCount": 6,
      "decomposingBinFraction": 0.24,
      "metastableCount": 11,
      "metastableBinFraction": 0.44,
      "miscibleCount": 4,
      "miscibleBinFraction": 0.16,
      "spinodalGini": 0.2,
      "spinodalIndex": 48,
      "spinodalRegime": "EARLY_SPINODAL",
      "spinodalVerdict": "SPINODAL_EQUILIBRIUM",
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

- Cahn-Hilliard equation ∂c/∂t = M∇²(f''(c)c - 2K∇²c) is a continuum mean-field theory; real bins are discrete and noisy.
- Fastest-mode wavenumber k_max = sqrt(|f''|/(4K)) and characteristic wavelength lambda_max = 2*pi*sqrt(2K/|f''|) require well-defined K and f''(c); both proxied here from neighbor variance and smoothness, not measured.
- Linear Cahn-Hilliard regime applies only at early stages with small amplitudes; intermediate and late stages require nonlinear treatment.
- Lifshitz-Slyozov-Wagner R(t) ~ t^(1/3) coarsening assumes diffusion-limited Gibbs-Thomson curvature kinetics; DLMM bins do not experience true physical coarsening of phase boundaries.
- Bicontinuous morphology requires near-critical composition c ~ 0.5; off-critical compositions favor droplet morphology with different kinetics.
- Spinodal vs binodal boundaries depend on the underlying free energy function f(c); here approximated from composition magnitude and modulations rather than explicit f(c).
- Cahn number Cn = K/(|f''|*L²) controls interface sharpness; here proxied from interfacial energy and driving force without physical length scale L.
- Composition c is reserve fraction X/total; the analogy to solute concentration in a metallurgical alloy is qualitative, not quantitative.
- Mobility M is proxied from volume; real DLMM dynamics are driven by swap-trade and arbitrage, not Onsager-coefficient diffusion.
- Concentration fluctuations measured here are spatial composition variations across neighboring bins, not true temporal fluctuations.
- Critical wavelength lambda_c = 2*pi*sqrt(K/|f''|) is the marginal stability cutoff; here proxied from characteristic wavelength and Cahn number.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
