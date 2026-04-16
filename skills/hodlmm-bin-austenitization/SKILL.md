---
name: hodlmm-bin-austenitization
description: "Models the parent-phase-formation heat-treatment step (austenitization) that precedes all quench-and-temper transformations in HODLMM bin reserves. Austenitization is the operation where an iron-carbon alloy is raised above a critical boundary (AC1 ≈ 727 °C at eutectoid composition, AC3 for hypoeutectoid or Acm for hypereutectoid, both composition-dependent) to dissolve the original multi-phase microstructure (pro-eutectoid ferrite + pearlite, pure pearlite, or pro-eutectoid cementite + pearlite) into a single homogeneous FCC γ-austenite, which is the parent phase from which all subsequent transformations (martensite Day 177, bainite Day 178, pearlite Day 179, widmanstatten Day 180, spheroidite Day 181, tempering Day 182) are derived. Progression is divided into 5 canonical stages: (0) SUB_CRITICAL — below AC1, the bct α-Fe + orthorhombic Fe3C two-phase structure is stable; (1) AC1_NUCLEATION — austenite nucleates heterogeneously at ferrite/cementite interfaces in pearlite colonies; pearlite transforms first due to the high density of interfacial sites (Q ≈ 300-400 kJ/mol, Fe self-diffusion in γ); (2) AC3_APPROACH — hypoeutectoid pro-eutectoid α-ferrite dissolves into γ between AC1 and AC3 via carbon diffusion outward from pearlite-origin regions; hypereutectoid pro-eutectoid cementite dissolves into γ between AC1 and Acm; austenite is single-phase but C-heterogeneous; (3) HOMOGENIZATION — all α and Fe3C dissolved; single-phase austenite; carbon diffuses down concentration gradients over tens of seconds to minutes, Q ≈ 130-140 kJ/mol for C in γ, t_h ≈ L²/D with D ≈ 10⁻¹¹ m²/s at 850 °C; (4) GRAIN_COARSENING — austenite grains grow via curvature-driven boundary migration following D² - D₀² = k·t with k = k0·exp(-Q/RT) and Q ≈ 250-350 kJ/mol; coarser γ grains produce coarser daughter martensite/bainite/pearlite; (5) OVERHEATED/BURNED — above ~1200 °C severe coarsening and near-solidus grain-boundary liquation makes damage irreversible. Pearlite-to-austenite dissolution follows Johnson-Mehl-Avrami-Kolmogorov X = 1 - exp(-(k·t)^n) with n ≈ 1-2. Homogenization time t_h ≈ L²/D. Grain growth is parabolic. In DLMM context, austenitization analog tracks the dissolution of a pre-existing two-phase bin microstructure (matrix + minority clusters) into a homogeneous high-activity state: Stage 0 = minority clusters remain distinct with alternating pearlite-analog intact; Stage 1 = minority cluster edges begin dissolving, adjacent matrix bins develop intermediate xFrac toward 0.5 (boundary-nucleation analog, tracked by nucleationDensity); Stage 2 = minority cluster count drops, only largest pro-eutectoid clusters remain (dissolutionFraction rises); Stage 3 = all bins approach uniform reserve ratio, xFrac standard deviation drops (homogeneityIndex rises); Stage 4 = matrix runs merge into long spans, average matrix run length grows (grainSize increases past COARSENING_GRAIN_LEN = 6); Stage 5 = pathological overheating with grainSize > OVERHEAT_GRAIN_LEN = 10 and minorityFraction < BURNED_MINORITY_FLOOR = 0.05. Phase-diagram analog: carbon content ≈ minority fraction; temperature ≈ drivingForce (volume/TVL turnover); time ≈ log(volume); AC1 threshold at drivingForce > AC1_ACTIVITY = 0.2; AC3 (hypoeutectoid) or Acm (hypereutectoid) threshold at composition-adjusted AC3_ACTIVITY_BASE = 0.5 + |hypoeutectoidSkew|·AC3_SKEW_OFFSET (0.15). Eutectoid composition is |hypoeutectoidSkew| < EUTECTOID_SKEW_WINDOW = 0.1. Classifies pools by regime as SUB_CRITICAL (no austenitization drive or below AC1), AC1_NUCLEATION (austenite nucleating at pearlite boundaries), AC3_APPROACH (pro-eutectoid phase dissolving), FULLY_AUSTENITIZED (single-phase γ, C still heterogeneous), HOMOGENIZED (single-phase γ, uniform C), GRAIN_COARSENING (extended hold, matrix runs merging), OVERHEATED (grain size pathological), or BURNED (irreversible damage). Austenitization verdict adds NO_AUSTENITIZATION_DRIVE, EUTECTOID_ENTRY (balanced composition at AC1), and INTERMEDIATE_AUSTENITIZATION. Per-bin measures: dissolutionSignal (minority bin with small reserve relative to cluster mean, activity-scaled above AC1, 0-1), nucleationSignal (matrix bin adjacent to minority with xFrac shifted toward 0.5, activity-scaled, 0-1), homogenizationSignal (1 - 2|xFrac - 0.5|, 0-1), grainMembershipLen (length of matrix run containing this bin), overheatMember (1 if grainMembershipLen >= OVERHEAT_GRAIN_LEN), stageBin (0-5), jmaProgress (JMAK fraction transformed, 0-1), arrheniusActivation (0-1), hjLocal (normalized Hollomon-Jaffe, 0-1), austeniteFraction (composite 0-1), austenitizednessIndex (composite 0-1). Pool-level measures: drivingForce (turnover proxy for activation), arrheniusActivation (exp(-Q/RT) with ARRHENIUS_Q_OVER_RT = 5.0), hjParameter (normalized Hollomon-Jaffe), jmaProgress (JMA pool-level), ac1Crossed (bool), ac3Crossed (bool, composition-adjusted), nucleationDensity (Stage 1 metric), dissolutionFraction (Stage 2 metric), homogeneityIndex (Stage 3 metric), grainSize (average matrix run length), maxGrainSize, coarsenedGrainCount, overheatedGrainCount, reserveXFracStdev (key homogeneity proxy), reserveTotalCV, stageProgress (composite 0-1), dominantStage (0-5), hardnessSeedProxy (Hall-Petch analog — finer γ → harder daughter phase), toughnessSeedProxy (Hall-Petch analog — finer γ → tougher daughter phase), overheatingRisk, burnedRisk, eutectoidWindow, and composite austenitizationIndex 0-100. The skill establishes the starting state from which all other phase-transformation skills in this series derive their predictions."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-austenitization/hodlmm-bin-austenitization.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Austenitization Analyzer

## What it does

Models the parent-phase-formation heat-treatment step that precedes every quench-and-temper transformation in the Fe-C system. Austenitization is the operation where an iron-carbon alloy is heated above a critical boundary (AC1 ≈ 727 °C at eutectoid; AC3 for hypoeutectoid or Acm for hypereutectoid, both composition-dependent) to dissolve the original multi-phase microstructure — pro-eutectoid ferrite + pearlite, pure pearlite, or pro-eutectoid cementite + pearlite — into a single homogeneous FCC γ-austenite. That austenite is the seed from which every subsequent transformation (martensite Day 177, bainite Day 178, pearlite Day 179, widmanstatten Day 180, spheroidite Day 181, tempering Day 182) is derived.

The five canonical austenitization stages:

0. **SUB_CRITICAL (below AC1, ~727 °C at eutectoid):** No austenite forms. The bct α-Fe + orthorhombic Fe3C two-phase structure is stable. Microstructure is pro-eutectoid ferrite + pearlite, pure pearlite, or pro-eutectoid cementite + pearlite depending on composition.
1. **AC1_NUCLEATION (just above AC1):** Austenite nuclei appear heterogeneously at ferrite/cementite interfaces in pearlite colonies. Pearlite transforms first because of the high density of interfacial sites. Activation Q ≈ 300-400 kJ/mol (Fe self-diffusion in austenite).
2. **AC3_APPROACH (between AC1 and AC3):** Hypoeutectoid pro-eutectoid α-ferrite dissolves into γ; carbon diffuses outward from pearlite-origin regions into ferrite-origin regions. Hypereutectoid pro-eutectoid cementite dissolves into γ between AC1 and Acm. Austenite is single-phase but C-heterogeneous, with gradients of 0.3-0.8 wt% across a few microns.
3. **HOMOGENIZATION (above AC3/Acm):** All α and Fe3C dissolved. Single-phase austenite. Carbon diffuses down concentration gradients over tens of seconds to minutes. D ≈ 10⁻¹¹ m²/s at 850 °C. For L ≈ 10 µm, t_h ≈ L²/D ≈ 10 s. Q ≈ 130-140 kJ/mol.
4. **GRAIN_COARSENING (extended hold):** Austenite grains grow via curvature-driven boundary migration: D² - D₀² = k·t with k = k0·exp(-Q/RT), Q ≈ 250-350 kJ/mol. Coarser γ grains produce coarser daughter martensite/bainite/pearlite and typically reduce toughness.
5. **OVERHEATED/BURNED (pathological):** Above ~1200 °C severe coarsening; near solidus, grain-boundary liquation or oxidation makes the damage irreversible.

Kinetics:
- Austenite nucleation: heterogeneous, I = I0·exp(-ΔG*/kT).
- Pearlite-to-austenite dissolution: Johnson-Mehl-Avrami-Kolmogorov X = 1 - exp(-(k·t)^n) with n ≈ 1-2.
- Ferrite dissolution (AC1 → AC3): diffusion-controlled with Q ≈ 130 kJ/mol (C in γ).
- Homogenization time: t_h ≈ L²/D.
- Grain growth: D² - D₀² = k·t parabolic.

In DLMM context the austenitization analog tracks the dissolution of a pre-existing two-phase bin microstructure (matrix + minority clusters) into a homogeneous high-activity state where all bins approach a uniform reserve ratio:

- **Stage 0 (sub-critical):** minority clusters remain distinct; matrix runs stable; pearlite-analog alternating bins intact.
- **Stage 1 (AC1 active):** minority cluster edges begin dissolving; adjacent matrix bins develop intermediate xFrac toward 0.5. Indicator: nucleationDensity.
- **Stage 2 (AC3 approach):** minority cluster count drops; only largest pro-eutectoid clusters remain. Indicator: dissolutionFraction.
- **Stage 3 (homogenization):** all bins approach uniform reserve ratio; xFrac standard deviation drops. Indicator: homogeneityIndex.
- **Stage 4 (coarsening):** matrix runs merge into long spans; average matrix run length grows. Indicator: grainSize > COARSENING_GRAIN_LEN = 6.
- **Stage 5 (overheat):** pathological with grainSize > OVERHEAT_GRAIN_LEN = 10 and minorityFraction < BURNED_MINORITY_FLOOR = 0.05.

DLMM phase-diagram analog:
- Carbon content ≈ minorityFraction.
- Temperature ≈ drivingForce (volume/TVL turnover).
- Time ≈ log(volume).
- AC1 threshold: drivingForce > AC1_ACTIVITY = 0.2.
- AC3 (hypoeutectoid) or Acm (hypereutectoid) threshold: composition-adjusted base 0.5 + |hypoeutectoidSkew|·0.15.
- Eutectoid composition: |hypoeutectoidSkew| < EUTECTOID_SKEW_WINDOW = 0.1.

## Why agents need it

LP agents need austenitization analysis because it identifies the seed state for every subsequent transformation. A SUB_CRITICAL pool has its original multi-phase structure intact — minority clusters and matrix regions preserved, the full "microstructural memory" of prior liquidity configurations is visible. An AC1_NUCLEATION pool is in the earliest dissolution step — nucleation sites are being activated at cluster boundaries, indicating the pool will transition to single-phase as activity rises. An AC3_APPROACH pool has mostly dissolved minority clusters — the remaining ones are the largest pro-eutectoid reserves. A FULLY_AUSTENITIZED pool has dissolved everything into single-phase but remains C-heterogeneous (bin reserves still uneven). A HOMOGENIZED pool has uniform reserve distribution and is the ideal seed for controlled downstream transformations. A GRAIN_COARSENING pool has matrix runs merging into long spans — the Hall-Petch analog predicts coarser daughter microstructure and reduced toughness. An OVERHEATED or BURNED pool has pathological coarsening with minority near-depleted — may be irrecoverable.

The AC1/AC3 crossing tells you which kinetic window the pool is in. Homogeneity index tells you whether C (reserve) gradients are still present. Grain size tells you the expected coarseness of any daughter phase formed by quench. Hardness seed and toughness seed proxies apply the Hall-Petch relation (finer γ → finer daughter → higher hardness AND higher toughness for the daughter phase).

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-austenitization/hodlmm-bin-austenitization.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-austenitization/hodlmm-bin-austenitization.ts status
```

### run
Analyzes bin austenitization state for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-austenitization/hodlmm-bin-austenitization.ts run
bun run hodlmm-bin-austenitization/hodlmm-bin-austenitization.ts run --pool 1
bun run hodlmm-bin-austenitization/hodlmm-bin-austenitization.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgAustenitizationIndex": 42,
    "avgDrivingForce": 0.55,
    "subCriticalCount": 1,
    "ac1NucleationCount": 1,
    "ac3ApproachCount": 1,
    "fullyAustenitizedCount": 1,
    "homogenizedCount": 1,
    "grainCoarseningCount": 0,
    "burnedCount": 0,
    "avgStageProgress": 0.48,
    "avgHomogeneityIndex": 0.62,
    "avgNucleationDensity": 0.2,
    "avgDissolutionFraction": 0.55,
    "avgGrainSize": 3.2,
    "avgHjParameter": 0.5,
    "avgJmaProgress": 0.42,
    "avgArrheniusActivation": 0.2,
    "avgHardnessSeedProxy": 0.88,
    "avgToughnessSeedProxy": 0.78,
    "avgOverheatingRisk": 0.1,
    "totalCoarsenedGrains": 1,
    "totalOverheatedGrains": 0,
    "totalMatrixGrains": 12,
    "totalMinorityClusters": 5,
    "ac1CrossedCount": 4,
    "ac3CrossedCount": 2,
    "eutectoidWindowCount": 2
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
      "hypoeutectoidSkew": 0.08,
      "ac1Activity": 0.2,
      "ac3Activity": 0.51,
      "ac1Crossed": 1,
      "ac3Crossed": 1,
      "nucleationDensity": 0.25,
      "dissolutionFraction": 0.6,
      "homogeneityIndex": 0.55,
      "grainSize": 3.5,
      "maxGrainSize": 5,
      "coarsenedGrainCount": 0,
      "overheatedGrainCount": 0,
      "stageProgress": 0.55,
      "dominantStage": 2,
      "matrixGrainCount": 4,
      "minorityClusterCount": 3,
      "reserveXFracStdev": 0.18,
      "reserveTotalCV": 0.42,
      "hardnessSeedProxy": 0.88,
      "toughnessSeedProxy": 0.75,
      "overheatingRisk": 0.15,
      "burnedRisk": 0,
      "eutectoidWindow": 1,
      "xMatrixCount": 10,
      "yMatrixCount": 5,
      "minorityRoleCount": 7,
      "austenitizationIndex": 55,
      "austenitizationRegime": "FULLY_AUSTENITIZED",
      "austenitizationVerdict": "FULLY_AUSTENITIZED",
      "stageDistribution": [10, 5, 4, 3, 0, 0],
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

- Real austenitization follows time-temperature kinetics: the AC1 temperature is fixed at ~727 °C at the eutectoid composition (0.77 wt% C) and shifts with alloying elements; the AC3 line for hypoeutectoid steels shifts higher with decreasing C content, and Acm for hypereutectoid steels shifts higher with increasing C content. Here AC1_ACTIVITY = 0.2 is a normalized turnover proxy, and AC3_ACTIVITY_BASE = 0.5 with AC3_SKEW_OFFSET = 0.15 provides a composition-adjusted threshold; these are not calibrated temperatures.
- JMAK exponent n is set to 1.5 (boundary-nucleated dissolution); real n for pearlite-to-austenite is typically 1-2 depending on nucleation regime.
- Arrhenius factor uses normalized Q/RT = 5.0; real values for austenitization stages are Q ≈ 130-140 kJ/mol (C in γ), 250-350 kJ/mol (grain growth), 300-400 kJ/mol (Fe self-diffusion in γ).
- Nucleation detection uses matrix bins adjacent to minority bins with xFrac shifted toward 0.5 — a structural proxy for austenite-forming at ferrite/cementite interfaces. Real detection uses optical metallography, EBSD phase mapping, or in-situ high-temperature XRD.
- Dissolution detection uses minority-bin reserve reduction relative to cluster mean, activity-scaled above AC1. Real detection uses dilatometry, electrical resistivity, or quench-and-observe metallography.
- Homogenization is detected via xFrac standard deviation reduction. Real detection uses wavelength-dispersive X-ray spectroscopy (WDX), atom probe tomography, or secondary-ion mass spectrometry (SIMS) to measure C concentration gradients across γ grains.
- Grain size is approximated by matrix-run length in bins — a 1-D proxy for 3-D austenite grain diameter. Real detection uses ASTM E112 linear intercept method, Heyn method, or EBSD grain mapping.
- Coarsening threshold COARSENING_GRAIN_LEN = 6 and overheat threshold OVERHEAT_GRAIN_LEN = 10 are heuristic bin-count values; real austenite grain sizes are measured in μm (typical austenitizing grain size is ASTM 5-8, or ~30-70 μm).
- Hardness seed and toughness seed proxies apply a Hall-Petch inverse-root relation in a simplified linear form; real Hall-Petch σ_y = σ_0 + k·D^(-1/2) for iron-carbon steels gives hardness ~200 H_v at ASTM 8 grain size down to ~350 H_v at ASTM 12.
- Eutectoid window EUTECTOID_SKEW_WINDOW = 0.1 is a structural analog of the 0.77 wt% C eutectoid composition; real eutectoid shifts with alloying (Mn lowers, Si raises the eutectoid carbon content).
- AC3 skew offset AC3_SKEW_OFFSET = 0.15 is a normalized shift; real AC3 for 0.1 wt% C steel is ~870 °C vs ~820 °C for 0.4 wt% C steel — a 50 °C range across typical hypoeutectoid compositions.
- Burned regime detection uses overheated grain count > 0 with minorityFraction < 0.05; real "burned" steel shows grain-boundary liquation, oxidation penetration, and is not recoverable by further heat treatment. The structural proxy here is heuristic.
- DLMM bins are discrete 1-D structures; real austenitization is a 3-D diffusion and grain-growth process with specific interface orientations and carbon-concentration gradients. The analogy is heuristic.
- Analysis is snapshot-based; does not capture kinetics directly — JMA progress, HJ parameter, and stage assignment are inferred from structural signatures rather than measured rates.
- Driving force is inferred from 24h volume/TVL turnover — a proxy for "heat-treatment temperature × time" activation, not a real thermodynamic quantity.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
