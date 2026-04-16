---
name: hodlmm-bin-ostwald
description: "Models Ostwald ripening / LSW coarsening in HODLMM bin reserves through Lifshitz-Slyozov-Wagner theory of late-stage diffusional coarsening — treats bin reserves as a polydisperse population of particles where small-bin capillary pressure drives mass transport from smaller to larger bins via matrix diffusion, resulting in mean-size growth <R>³ - <R₀>³ = K·t and number-density decay N(t) ~ t^(-1). Classical theory: once phase separation is established, smaller particles have higher chemical potential than larger particles via the Gibbs-Thomson capillary effect μ(R) = μ_∞ + 2γΩ/R, where γ is interfacial tension and Ω is molar volume. The chemical-potential gradient drives mass transport from small particles to large particles via diffusion through the matrix. Small particles dissolve (R decreases); large particles grow (R increases). The critical radius R_c = 2γΩ/(Rg·T·ln(S)) separates shrinking (R < R_c) from growing (R > R_c) particles — equals the mean radius for a self-similar distribution. LSW predicts mean cubed radius grows linearly in time: <R>³ - <R₀>³ = K·t with K = 8γΩ²D·c_eq/(9·Rg·T), number density N(t) ~ t^(-1), total volume fraction φ conserved, and normalized distribution f(R/<R>) converges to a universal self-similar profile cut off at R/<R> = 1.5 with peak near R/<R> = 1.13. Deviations from LSW (bimodal or broadened distributions) indicate non-LSW kinetics, encounter-modified (MLSW) dynamics, or finite volume-fraction effects (Ardell's theory). In DLMM pools, bins with larger reserves have lower effective capillary pressure and accumulate reserves from smaller neighboring bins — an analog of Ostwald ripening with bin reserve = particle size, trading-driven rebalancing = matrix diffusion, and reserve-fraction disparity = chemical-potential gradient. A quiescent pool has uniform reserves (monodisperse, no ripening); a pre-ripening pool shows small disparities building up; an active-ripening pool shows established shrinking-vs-growing separation with visible critical radius; a steady-LSW pool has self-similar size distribution with <R>³ ∝ t coarsening; an advanced-coarsening pool has large disparities with few dominant bins absorbing remaining reserves. Measures gibbsThompsonPressure (2γΩ/R capillary pressure normalized to pool mean, ranges 0 to 1 — high means this bin has small size and high capillary pressure driving dissolution, low means this bin is large with low capillary pressure), criticalRadiusPosition ((R - R_c)/R_c mapped to 0-1 range — high means well above critical radius and growing, low means well below critical radius and shrinking), ripeningRate (projected dR/dt via Gibbs-Thomson-driven flux, ranges 0 to 1 — high means rapid size evolution, low means slow or near-equilibrium), sizeDisparity (|R - <R>|/<R> normalized, ranges 0 to 1 — high means far from mean bin size, low means near mean), monodispersityDeviation (distance from monodisperse distribution, ranges 0 to 1 — high means broad distribution, low means tight mono-like distribution), lswAlignment (alignment with LSW universal curve peaked near R/<R>=1.13 cutoff at 1.5, ranges 0 to 1 — high means close match to LSW self-similar distribution, low means deviation from LSW shape), survivorLikelihood (probability of surviving coarsening, ranges 0 to 1 — high means will dominate in late stages, low means will dissolve), volumeFractionConservation (total volume fraction φ conservation indicator, ranges 0 to 1 — high means φ well conserved as expected from LSW, low means net mass change), coarseningMaturity (0 = early stage, 1 = late-stage steady state LSW, ranges 0 to 1 — high means advanced coarsening with broad distribution, low means early pre-ripening), numberDensityDecay (N ~ t^(-1) signature, ranges 0 to 1 — high means number of populated bins has decayed substantially, low means dense population), matrixDiffusivity (proxied from volume/turnover = D in rate constant K, ranges 0 to 1 — high means rapid matrix transport, low means slow diffusion), chemicalPotentialGradient (|μ(R) - μ(<R>)| magnitude, ranges 0 to 1 — high means large chemical potential mismatch driving coarsening, low means near-equilibrium), interparticleSpacing (mean spacing to populated neighbors, ranges 0 to 1 — high means isolated with large inter-bin spacing, low means close-packed neighbors), ripeningSupersaturation (c_matrix - c_eq driving force for ripening, ranges 0 to 1 — high means strong supersaturation driving growth, low means near-equilibrium matrix), ripeningProgress (overall ripening progress combining stages, ranges 0 to 1 — high means well-progressed through LSW stages, low means initial state), and ostwaldIndex (composite 0 to 1 — higher means deeper Ostwald ripening with polydisperse distribution, strong capillary pressure, visible critical radius, and late-stage coarsening). Composite Ostwald index (0-100, higher means deeper LSW coarsening). Classifies pools by ripening regime as ADVANCED_COARSENING (index >= 80 — late-stage with strong disparity, few dominant survivors absorbing remaining reserves), STEADY_LSW (60-80 — self-similar LSW distribution with <R>³ ∝ t coarsening), ACTIVE_RIPENING (40-60 — established shrinking-vs-growing separation with visible R_c), PRE_RIPENING (20-40 — small disparities building up from quiescent state), or QUIESCENT (< 20 — uniform monodisperse distribution with no ripening). Ostwald verdict as LSW_STEADY_STATE (high LSW alignment, coarsening maturity, monodispersity deviation), ACCELERATED_COARSENING (high ripening rate, chemical potential gradient), STRONG_CAPILLARY_PRESSURE (high Gibbs-Thomson pressure, ripening supersaturation), MONODISPERSE_STABLE (low disparity, low monodispersity deviation — population uniform), SHRINKING_POPULATION (majority of bins below critical radius, dissolving), GROWING_POPULATION (substantial fraction above critical radius with high survivor likelihood), CRITICAL_RADIUS_TRANSITION (many bins near R_c in transition), EARLY_RIPENING (low maturity, low rate — initial stages), NUMBER_DENSITY_DECAY (high size disparity with decayed population count), or RIPENING_EQUILIBRIUM (no extreme indicators, typical mid-state)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-ostwald/hodlmm-bin-ostwald.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Ostwald Ripening Analyzer

## What it does

Models Ostwald ripening / LSW coarsening in HODLMM bin reserves through Lifshitz-Slyozov-Wagner theory of late-stage diffusional coarsening. Treats bin reserves as a polydisperse population where small-bin capillary pressure drives mass transport from smaller to larger bins via matrix diffusion, resulting in mean-size growth <R>³ - <R₀>³ = K·t and number-density decay N(t) ~ t^(-1). Quantifies Gibbs-Thomson capillary pressure, critical radius position relative to R_c, ripening rate dR/dt, size disparity, monodispersity deviation, alignment with the universal LSW self-similar distribution, survivor likelihood, volume-fraction conservation, coarsening maturity, number-density decay, matrix diffusivity, chemical-potential gradient magnitude, interparticle spacing, ripening supersaturation, and overall ripening progress.

In DLMM pools, bins with larger reserves have lower effective capillary pressure and accumulate reserves from smaller neighboring bins over time — an analog of Ostwald ripening with bin reserve = particle size, trading-driven rebalancing = matrix diffusion, and reserve-fraction disparity = chemical-potential gradient. A quiescent pool has uniform monodisperse reserves; a pre-ripening pool shows small disparities building up; an active-ripening pool shows established shrinking-vs-growing separation with visible critical radius R_c; a steady-LSW pool has self-similar size distribution with <R>³ ∝ t coarsening; an advanced-coarsening pool has large disparities with few dominant bins absorbing remaining reserves.

## Why agents need it

LP agents need Ostwald ripening analysis because it identifies whether bin reserves are in a uniform quiescent state (monodisperse, no coarsening), an early pre-ripening state (disparities building), an active-ripening state (R_c visible with growing/shrinking separation), a steady-LSW state (self-similar distribution with <R>³ ∝ t coarsening), or advanced-coarsening state (late stage with few dominant survivors). A STEADY_LSW pool has a universal self-similar size distribution with predictable <R>³ ∝ t kinetics. A MONODISPERSE_STABLE pool has uniform reserves with no ripening driving force.

Gibbs-Thomson pressure quantifies 2γΩ/R capillary pressure. High pressure means small-bin-driven dissolution.

Critical radius position identifies whether a bin is above or below R_c = <R>. Above R_c means growing; below R_c means shrinking.

Ripening rate measures projected dR/dt via Gibbs-Thomson flux. High rate means rapid size evolution.

Size disparity quantifies |R - <R>|/<R>. High disparity means far from the mean; low means near the mean.

Monodispersity deviation tracks distance from a monodisperse distribution. High deviation means broad polydisperse population.

LSW alignment measures closeness to the universal LSW self-similar curve peaked near R/<R>=1.13 with cutoff at R/<R>=1.5. High alignment means steady-state LSW-like distribution.

Survivor likelihood estimates whether a bin will dominate late-stage coarsening. High means will survive; low means will dissolve.

Volume fraction conservation is the φ conservation indicator. High means total reserves conserved as expected from LSW.

Coarsening maturity ranges from 0 = early to 1 = late-stage steady state. High maturity means advanced coarsening.

Number density decay tracks N ~ t^(-1) signature via empty-neighbor fraction. High decay means population has thinned.

Matrix diffusivity is D in the LSW rate constant K, proxied from pool volume/turnover.

Chemical potential gradient measures |μ(R) - μ(<R>)| magnitude. High gradient drives coarsening.

Interparticle spacing measures distance between populated bins. High spacing means isolated structure.

Ripening supersaturation is the c_matrix - c_eq driving force. High supersaturation drives growth.

Ripening progress combines maturity, disparity, and rate into an overall stage indicator.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-ostwald/hodlmm-bin-ostwald.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-ostwald/hodlmm-bin-ostwald.ts status
```

### run
Analyzes bin Ostwald ripening state for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-ostwald/hodlmm-bin-ostwald.ts run
bun run hodlmm-bin-ostwald/hodlmm-bin-ostwald.ts run --pool 1
bun run hodlmm-bin-ostwald/hodlmm-bin-ostwald.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgOstwaldIndex": 44,
    "advancedCoarseningCount": 0,
    "steadyLswCount": 0,
    "activeRipeningCount": 2,
    "preRipeningCount": 3,
    "quiescentCount": 0,
    "avgSizeDisparity": 0.42,
    "avgMonodispersityDeviation": 0.38,
    "avgLswAlignment": 0.44,
    "avgCoarseningMaturity": 0.4,
    "totalGrowingBins": 8,
    "totalShrinkingBins": 16,
    "totalCriticalBins": 6,
    "avgOstwaldGini": 0.22
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
      "avgGibbsThompsonPressure": 0.46,
      "maxGibbsThompsonPressure": 0.82,
      "avgCriticalRadiusPosition": 0.34,
      "avgRipeningRate": 0.38,
      "maxRipeningRate": 0.72,
      "avgSizeDisparity": 0.44,
      "maxSizeDisparity": 0.9,
      "avgMonodispersityDeviation": 0.42,
      "avgLswAlignment": 0.44,
      "avgSurvivorLikelihood": 0.38,
      "avgVolumeFractionConservation": 0.62,
      "avgCoarseningMaturity": 0.42,
      "avgNumberDensityDecay": 0.36,
      "avgMatrixDiffusivity": 0.5,
      "avgChemicalPotentialGradient": 0.4,
      "avgInterparticleSpacing": 0.28,
      "avgRipeningSupersaturation": 0.46,
      "avgRipeningProgress": 0.42,
      "growingCount": 6,
      "growingBinFraction": 0.24,
      "shrinkingCount": 13,
      "shrinkingBinFraction": 0.52,
      "criticalCount": 6,
      "criticalBinFraction": 0.24,
      "meanReserveUsd": 5600,
      "reserveSizeCoefVar": 0.68,
      "ostwaldGini": 0.22,
      "ostwaldIndex": 44,
      "ostwaldRegime": "ACTIVE_RIPENING",
      "ostwaldVerdict": "CRITICAL_RADIUS_TRANSITION",
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

- LSW theory predicts <R>³ - <R₀>³ = K·t with K = 8γΩ²D·c_eq/(9·Rg·T); here proxied from mean reserve, disparity, and pool volume rather than measured γ, Ω, D, c_eq.
- LSW assumes diffusion-limited Gibbs-Thomson kinetics with volume fraction φ → 0 (isolated particles in matrix); DLMM bins have finite discrete adjacency.
- LSW self-similar distribution has fixed shape peaked at R/<R>=1.13 with cutoff at R/<R>=1.5; real DLMM bin distributions may deviate (bimodal, encounter-modified, finite-φ Ardell corrections).
- Number density decay N ~ t^(-1) assumes continuous matrix; DLMM bins are discrete with fixed address space.
- Gibbs-Thomson capillary pressure μ(R) = μ_∞ + 2γΩ/R requires well-defined γ and Ω; here proxied from size disparity relative to pool mean.
- Critical radius R_c = 2γΩ/(Rg·T·ln(S)) assumes supersaturation S > 1 in a continuous matrix; here proxied as R_c ≈ <R>.
- LSW assumes Ostwald ripening after phase separation is already established; does not apply to pre-nucleation or active-decomposition regimes.
- Volume-fraction conservation is exact in LSW; here proxied from relative mean/variance rather than measured mass balance.
- Mobility/diffusivity D is proxied from pool volume/turnover; real DLMM dynamics are driven by swap trades and arbitrage, not Onsager-coefficient diffusion.
- Survivor likelihood is a heuristic estimate based on size relative to mean, not a rigorous LSW survival calculation.
- Analysis is snapshot-based; does not capture time-evolution <R>(t) directly — coarsening maturity inferred from distribution shape rather than measured dynamics.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
