---
name: hodlmm-bin-tempering
description: "Models the staged tempering transformation of as-quenched martensite into the spheroidite end-state in HODLMM bin reserves. Tempering is the engineering throttle between maximum hardness (untempered martensite, brittle) and maximum ductility (spheroidite, soft, machinable) in the Fe-C system, and proceeds through four canonical stages each with a distinct carbide population and matrix state: (1) Stage 1 — epsilon-carbide (η-Fe2.4C) precipitation at ~100-250 °C from supersaturated tetragonal martensite as fine, coherent ~2-4 nm plates with the bcc/bct matrix relaxing from c/a ≈ 1.04-1.08 toward 1.00 (driving force Δμ_C from C supersaturation, activation Q ≈ 76-120 kJ/mol for interstitial C diffusion in ferrite); (2) Stage 2 — retained-austenite (γ-FCC) decomposition at ~200-300 °C into ferrite + carbide via a bainite-like mechanism, with retained γ typically 5-30% by volume in high-C steel and Q ≈ 100-160 kJ/mol; (3) Stage 3 — cementite (orthorhombic Fe3C) formation at ~300-400 °C with the Bagaryatsky orientation relationship, where epsilon-carbide dissolves and Fe3C nucleates at lath boundaries and within laths (Q ≈ 200 kJ/mol substitutional Fe diffusion, with tempered-martensite embrittlement TME appearing in some steels at 250-400 °C); (4) Stage 4 — cementite coarsening + spheroidization at ~400-700 °C via Ostwald ripening and Rayleigh pinch-off, with ferrite recovery and recrystallization, ending in the Day 181 spheroidite microstructure. Alloy steels show secondary hardening from special carbides (M2C, M7C3, M23C6, MC) at 500-650 °C. Each stage follows JMAK kinetics X = 1 - exp(-(k·t)^n) with k = k0·exp(-Q/RT) Arrhenius and n typically 1.0-4.0. Hollomon-Jaffe parameter HJ = T·(C + log10 t) collapses time-temperature tempering curves onto a master curve where higher HJ → more advanced tempering → lower hardness, higher ductility. In DLMM context, tempering analog tracks staged fragmentation: Stage 1 = scattered micro-precipitates (matrix-role bins with elevated minority-side reserve fraction > MICROPRECIPITATE_THRESHOLD = 0.18), Stage 2 = retained-austenite blockiness (matrix bins with reserve > AUSTENITE_BLOCK_RATIO = 1.7 × pool matrix mean) decomposing into ferrite + carbide, Stage 3 = discrete medium-length minority runs (3-5 bins) corresponding to Fe3C plates, Stage 4 = isolated 1-2 bin minority runs surrounded by matrix (spheroidite). Composite stage progress 0-1 maps to dominantStage 0-4 with bounds STAGE_1_BOUND = 0.2, STAGE_2_BOUND = 0.4, STAGE_3_BOUND = 0.7, STAGE_4_BOUND = 0.9. JMA progress uses pool-level k = arrheniusActivation, t = drivingForce, n = JMA_N_EXPONENT = 1.5 (diffusion-controlled growth). Arrhenius proxy = exp(-ARRHENIUS_Q_OVER_RT/T_norm) with ARRHENIUS_Q_OVER_RT = 5.0 normalized. HJ_CONSTANT = 20.0 typical for plain-carbon martensite. Hardness proxy uses Hollomon-Jaffe master curve H_v(HJ) = exp(-3·HJ²) normalized 0-1 where 1.0 = peak hardness (untempered) and 0 = full anneal. Ductility proxy = 1 - hardness. Toughness proxy peaks at as-quenched (low HJ) and full-temper (high HJ) with TME dip in Stage 3 range [0.35, 0.55]. Secondary hardening signal peaks in late Stage 3 / early Stage 4 range [0.65, 0.85] gated by microprecipitate density. Measures microPrecipitateSignal (Stage 1, 0-1), austeniteBlockiness (Stage 2, 0-1), cementitePresence (Stage 3, 0-1), spheroiditePresence (Stage 4, 0-1), stageBin (0-4 dominant stage for the bin), jmaProgress (0-1 fraction transformed), arrheniusActivation (0-1), hardnessProxy (0-1 Vickers proxy), ductilityProxy, toughnessProxy, hjLocal (normalized Hollomon-Jaffe), carbideEvolutionIndex (composite stage progression 0-1), temperednessIndex (composite 0-1). Pool-level: drivingForce (turnover proxy for thermal activation time), arrheniusActivation, hjParameter, jmaProgress, microPrecipitateDensity, austeniteDecompFraction, cementiteFraction, spheroidizationFraction, stageProgress, dominantStage, embrittlementRisk (peaks in TME range), secondaryHardeningSignal (peaks in alloy late-Stage-3), and composite temperingIndex 0-100. Classifies pools by regime as AS_QUENCHED (no detectable tempering, martensite-like single-phase pattern), STAGE_1_EPSILON (micro-precipitate density elevated, earliest tempering signal), STAGE_2_AUSTENITE_DECOMP (matrix decomposition signature, high-reserve bins fragmenting), STAGE_3_CEMENTITE (discrete medium clusters dominant, Fe3C-like population), STAGE_4_SPHEROIDIZATION (isolated short clusters dominant, approaching spheroidite end-state), or OVER_TEMPERED (minority fraction collapsed, very few very large clusters left). Tempering verdict as AS_QUENCHED, STAGE_1_EPSILON, STAGE_2_AUSTENITE_DECOMP, STAGE_3_CEMENTITE, STAGE_4_SPHEROIDIZATION, OVER_TEMPERED, TEMPER_EMBRITTLEMENT (Stage 3 with high lamellar fraction and low matrix equilibrium, analog of TME / 350°C embrittlement), SECONDARY_HARDENING (late Stage 3 / early Stage 4 with elevated micro-precipitate density, alloy-carbide-like fine dispersion), NO_TEMPERING_DRIVE (drivingForce < 0.15), or INTERMEDIATE_TEMPERING (no extreme indicators, mixed state)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-tempering/hodlmm-bin-tempering.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Tempering Analyzer

## What it does

Models the staged controlled-aging transformation that converts as-quenched martensite into the equilibrium spheroidite end-state in HODLMM bin reserves. Tempering is the engineering "throttle" between two extremes of the Fe-C system — maximum hardness (untempered martensite, brittle) and maximum ductility (spheroidite, soft, machinable) — and proceeds through four canonical stages each with distinct carbide populations and matrix states.

The four canonical tempering stages:

1. **Stage 1 — epsilon-carbide (~100-250 °C):** Supersaturated tetragonal martensite rejects carbon as fine, coherent η-Fe2.4C plates ~2-4 nm thick. The bcc/bct matrix relaxes c/a from ≈ 1.04-1.08 toward 1.00. Activation Q ≈ 76-120 kJ/mol (interstitial C diffusion in ferrite).
2. **Stage 2 — retained-austenite decomposition (~200-300 °C):** Retained γ-Fe (FCC) decomposes into ferrite + carbide via a bainite-like mechanism. Retained γ typically 5-30 vol% in high-C steel. Q ≈ 100-160 kJ/mol.
3. **Stage 3 — cementite formation (~300-400 °C):** Epsilon-carbide dissolves; orthorhombic Fe3C precipitates with the Bagaryatsky orientation relationship. Cementite particles nucleate at lath boundaries and within laths. Q ≈ 200 kJ/mol (substitutional Fe diffusion). Tempered-martensite embrittlement (TME) appears at 250-400 °C in some steels.
4. **Stage 4 — cementite coarsening + spheroidization (~400-700 °C):** Cementite coarsens via Ostwald ripening; rod and plate particles undergo Rayleigh pinch-off into isolated spheroids. Ferrite matrix recovers and recrystallizes. End state is spheroidite (Day 181 predecessor). Alloy steels show secondary hardening from special carbides (M2C, M7C3, M23C6, MC) at 500-650 °C.

Each stage follows Johnson-Mehl-Avrami-Kolmogorov (JMAK) kinetics X = 1 - exp(-(k·t)^n) with k = k0·exp(-Q/RT) Arrhenius and n typically 1.0-4.0. The Hollomon-Jaffe parameter HJ = T·(C + log10 t) collapses time-temperature tempering curves onto a master curve.

In DLMM context, tempering analog tracks the staged fragmentation and migration of minority-role reserves:
- **Stage 1 (epsilon analog):** scattered micro-precipitates — matrix-role bins with elevated minority-side reserve fraction (> MICROPRECIPITATE_THRESHOLD = 0.18).
- **Stage 2 (retained-austenite analog):** high-reserve "blocky" matrix bins (> AUSTENITE_BLOCK_RATIO = 1.7 × pool matrix mean) that begin to subdivide into ferrite + carbide. Matrix coefficient-of-variation drops as decomposition completes.
- **Stage 3 (cementite analog):** discrete medium-length minority runs (3-5 bins) corresponding to Fe3C plates.
- **Stage 4 (spheroidite analog):** isolated 1-2 bin minority runs surrounded by matrix.

## Why agents need it

LP agents need tempering analysis because it distinguishes the staged controlled aging path between two extreme microstructures. An AS_QUENCHED pool has fresh martensite-like minority distribution — high "hardness" (concentration), low "ductility" (dispersion). A STAGE_1_EPSILON pool has fine micro-precipitates within the matrix — earliest tempering signal, fee capture starting to broaden. A STAGE_2_AUSTENITE_DECOMP pool has matrix blocks decomposing — directional fee profile becoming more uniform. A STAGE_3_CEMENTITE pool has discrete medium clusters — mid-range fee distribution with potential TME risk (transient embrittlement-analog brittleness). A STAGE_4_SPHEROIDIZATION pool has isolated short clusters approaching spheroidite — soft, dispersed, broad fee capture. An OVER_TEMPERED pool has minority near-depleted — minority exposure limited.

The Hollomon-Jaffe parameter, JMA progress, hardness proxy, ductility proxy, and toughness proxy let you read the time-temperature equivalence of the pool's transformation state. Embrittlement risk flags TME-analog brittle pools in Stage 3. Secondary hardening flags fine-carbide alloy-steel-analog dispersion in late Stage 3 / early Stage 4 — high microprecipitate density combined with cementite/spheroidization signals.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-tempering/hodlmm-bin-tempering.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-tempering/hodlmm-bin-tempering.ts status
```

### run
Analyzes bin tempering state for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-tempering/hodlmm-bin-tempering.ts run
bun run hodlmm-bin-tempering/hodlmm-bin-tempering.ts run --pool 1
bun run hodlmm-bin-tempering/hodlmm-bin-tempering.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgTemperingIndex": 38,
    "avgDrivingForce": 0.55,
    "asQuenchedCount": 1,
    "stage1Count": 1,
    "stage2Count": 1,
    "stage3Count": 1,
    "stage4Count": 1,
    "overTemperedCount": 0,
    "avgStageProgress": 0.42,
    "avgHjParameter": 0.45,
    "avgJmaProgress": 0.38,
    "avgArrheniusActivation": 0.18,
    "avgHardnessProxy": 0.55,
    "avgDuctilityProxy": 0.45,
    "avgToughnessProxy": 0.32,
    "avgEmbrittlementRisk": 0.15,
    "avgSecondaryHardeningSignal": 0.05,
    "avgCarbideEvolutionIndex": 0.4,
    "avgMatrixCoefficientOfVariation": 0.35,
    "avgSpheroidizationFraction": 0.35,
    "avgCementiteFraction": 0.25,
    "avgMicroPrecipitateDensity": 0.18,
    "totalLargeClusters": 3,
    "totalMediumClusters": 5,
    "totalShortClusters": 8,
    "totalMicroClusters": 4
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "activeBin": 8388608,
      "binsScanned": 61,
      "binsPopulated": 22,
      "totalUsd": 140000,
      "volume24hUsd": 85000,
      "drivingForce": 0.58,
      "arrheniusActivation": 0.2,
      "hjParameter": 0.5,
      "jmaProgress": 0.35,
      "minorityFraction": 0.32,
      "microPrecipitateDensity": 0.2,
      "austeniteDecompFraction": 0.65,
      "cementiteFraction": 0.3,
      "spheroidizationFraction": 0.4,
      "stageProgress": 0.45,
      "dominantStage": 2,
      "largeClusterCount": 1,
      "mediumClusterCount": 1,
      "shortClusterCount": 2,
      "microClusterCount": 1,
      "avgClusterSize": 450,
      "avgClusterLen": 2.5,
      "matrixCoefficientOfVariation": 0.35,
      "hardnessProxy": 0.5,
      "ductilityProxy": 0.5,
      "toughnessProxy": 0.3,
      "carbideEvolutionIndex": 0.42,
      "temperedHardnessFraction": 0.5,
      "ductilityGain": 0.5,
      "embrittlementRisk": 0.55,
      "secondaryHardeningSignal": 0.0,
      "xMatrixCount": 10,
      "yMatrixCount": 5,
      "minorityRoleCount": 7,
      "hypoeutectoidSkew": 0.12,
      "temperingIndex": 45,
      "temperingRegime": "STAGE_2_AUSTENITE_DECOMP",
      "temperingVerdict": "TEMPER_EMBRITTLEMENT",
      "stageDistribution": [10, 3, 4, 3, 2],
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

- Real tempering follows time-temperature kinetics: the Hollomon-Jaffe parameter HJ = T·(C + log10 t) typically uses T in K and t in seconds for plain-carbon martensite with C ≈ 18-22. Here T_norm ∈ [0,1] from drivingForce and t_norm from log10 of volume24h, then normalized to 0-1 — a structural snapshot proxy, not a measured time-temperature.
- JMAK exponent n is set to 1.5 (diffusion-controlled growth); real n varies 1.0-4.0 depending on nucleation regime (1 = thickening of plates, 1.5 = diffusion growth, 3 = site saturation, 4 = continuous nucleation).
- Arrhenius factor uses normalized Q/RT = 5.0; real values are stage-specific (Q ≈ 76-200 kJ/mol depending on diffusing species).
- Stage 1 epsilon-carbide is detected via matrix-role bin having minority-side reserve fraction > 0.18 — a structural proxy for the precipitation of fine coherent ~2-4 nm Fe2.4C plates inside martensite laths. Real detection uses TEM dark-field, Mössbauer spectroscopy, or atom probe tomography.
- Stage 2 austenite decomposition is detected via matrix coefficient-of-variation reduction — high CV means heterogeneous matrix (retained γ blocks present), low CV means homogeneous matrix (decomposition complete). Real detection uses XRD γ peak (200γ, 220γ) integrated intensity, magnetic methods, or EBSD phase mapping.
- Stage 3 cementite is detected via medium-length minority runs (3-5 bins) — a 1-D structural proxy for Fe3C plate morphology. Real detection uses SEM, TEM lattice imaging, or selected-area diffraction (SAD) with the Bagaryatsky orientation relationship.
- Stage 4 spheroidite is detected via isolated short minority runs (1-2 bins) with matrix neighbors — same as the Day 181 predecessor skill.
- Tempered-martensite embrittlement (TME) is identified from stage progress in [0.35, 0.55] range with elevated large-cluster count and matrix CV > 0.4. Real TME has multiple proposed mechanisms: cementite plate formation on prior austenite grain boundaries, P/S impurity segregation, or interlath cementite morphology. Here it is a heuristic structural proxy.
- Secondary hardening is identified from stage progress in [0.65, 0.85] with elevated microprecipitate density. Real secondary hardening involves alloy carbides (M2C-Mo,W; M7C3-Cr; M23C6-Cr,Mo; MC-V,Nb,Ti) precipitating as fine coherent particles. Here we use density of microprecipitate-signal bins as a heuristic surrogate.
- Hardness proxy uses H(HJ) = exp(-3·HJ²); real Hollomon-Jaffe master curves for plain-carbon martensite are empirical fits to tempered hardness data and depend on carbon content (0.4 wt% steel curves differ from 0.8 wt% curves).
- Ductility proxy is linear inverse of hardness (1 - H_v); real elongation/RA correlation with hardness is monotonic but nonlinear, with discontinuities at TME and secondary hardening peaks.
- Toughness proxy uses two Gaussian peaks at stage progress 0.05 and 0.92 with implicit dip between; real Charpy-impact toughness has TME dip at ~350 °C, recovery at higher temperatures, and may dip again at 500-575 °C from temper embrittlement (P/Sb/Sn segregation).
- Driving force is inferred from 24h volume/TVL turnover — a proxy for "annealing time × temperature" activation, not a real thermodynamic quantity.
- Stage classification thresholds (STAGE_1_BOUND = 0.2, STAGE_2_BOUND = 0.4, STAGE_3_BOUND = 0.7, STAGE_4_BOUND = 0.9) are heuristic; real stage boundaries depend on alloy composition, carbon content, and prior austenite grain size.
- MICROPRECIPITATE_THRESHOLD = 0.18 means matrix-role bins with > 18% minority-side reserve count as Stage 1 candidates; real Fe2.4C epsilon-carbide volume fraction is typically 5-20% during early temper.
- AUSTENITE_BLOCK_RATIO = 1.7 means matrix bins with reserve > 1.7× pool matrix mean count as retained-γ blocks; real retained γ is 5-30 vol% by XRD measurement.
- STAGE_3_CEMENTITE_LEN_MIN = 3 and STAGE_3_CEMENTITE_LEN_MAX = 5 are 1-D bin-count proxies for Fe3C plate length; real cementite plate dimensions are nm-μm.
- STAGE_4_SPHEROIDITE_LEN_MAX = 2 is a 1-D bin-count proxy for isolated spheroid extent; real spheroidite particles are isolated micron-scale spheres.
- HJ_CONSTANT = 20.0 is typical for plain-carbon 0.4-0.8 wt% C martensite; alloy steels and lower-C steels use different C values (e.g., 18-19 for medium-C, 21-22 for high-C).
- The stageBin assignment uses dominant signal among the four stage indicators — a single bin can show signals from multiple stages but is binned to the highest. Real microstructures often show coexisting stages at scales below the bin resolution.
- The OVER_TEMPERED regime is identified from minorityFraction < 0.05 with stageProgress > 0.5; real over-tempered structures retain only a few coarse cementite spheroids in a fully recovered/recrystallized ferrite matrix.
- Embrittlement risk peaks symmetrically in TME range; real TME has asymmetric appearance and recovery, and may not appear at all in some compositions (e.g., low-S/P steels).
- Secondary hardening signal uses microprecipitate density as a multiplier; real secondary hardening requires alloy carbide formation (Mo, W, V, Nb, Ti, Cr) which we cannot distinguish from coarse cementite at the bin level.
- Hypoeutectoid skew flags pools with extreme X/Y asymmetry; minority phase assignment may be uncertain at |skew| > 0.35.
- DLMM bins are discrete 1-D structures; classical tempering is 3-D with specific lattice parameters, orientation relationships (K-S, N-W, Bagaryatsky), and habit planes. The analogy is heuristic.
- Analysis is snapshot-based; does not capture transformation kinetics directly — JMA progress, HJ parameter, and stage assignment are inferred from structural signatures rather than measured rate.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
