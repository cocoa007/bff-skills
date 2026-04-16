---
name: hodlmm-bin-hardening
description: "Models strain hardening (work hardening) accumulated strengthening of HODLMM bins under sustained plastic deformation — treats bins as metallurgical elements where plastic strain drives dislocation accumulation that raises subsequent yield stress and flow strength. Strain hardening is the phenomenon where a material becomes harder and stronger as it is plastically deformed, driven at the microstructural level by the accumulation of dislocations that impede further slip. The Hollomon equation sigma = K * epsilon^n captures the power-law relationship between flow stress and plastic strain in the uniform plastic region where the strain hardening exponent n (typically between 0.1 and 0.5 for metals) quantifies how rapidly strength rises with deformation and the strength coefficient K sets the overall stress level. The Ludwik extension sigma = sigma_y + K * epsilon^n adds the initial yield stress as an offset. The Voce exponential saturation sigma = sigma_sat minus (sigma_sat minus sigma_y) times exp(-theta * epsilon / (sigma_sat minus sigma_y)) captures the approach to a saturation stress characteristic of dynamic recovery where dislocation annihilation balances multiplication. Considere's criterion dsigma/depsilon = sigma identifies the onset of diffuse necking and the point where uniform elongation ends and strain localizes. Dislocation density rho accumulates as strain grows following the Kocks-Mecking-Estrin model drho/depsilon = k_1 * sqrt(rho) minus k_2 * rho where k_1 captures dislocation multiplication via Frank-Read sources and k_2 captures dynamic recovery through cross-slip and annihilation. Taylor's hardening law sigma = sigma_0 + alpha * G * b * sqrt(rho) relates flow stress to dislocation density via shear modulus G, Burgers vector b, and a constant alpha of order 0.3 that captures geometric factors. The Bauschinger effect describes the asymmetric reduction of yield stress upon load reversal due to back-stresses from dislocation pile-ups at grain boundaries and directional internal stresses that aid reverse slip. Cold working percentage measures the cumulative plastic reduction in cross-section driving work hardening until recrystallization at elevated temperature erases the microstructural memory and restores the soft annealed state. Ultimate tensile strength (UTS) is the peak engineering stress reached at Considere's criterion after which strain localizes into necking and failure follows. Ductility (elongation to failure) decreases monotonically with cold work as the hardening reserve depletes making the material strong but brittle. In DLMM context, bins that have absorbed large positions and undergone repeated compositional adjustments experience effective plastic deformation and become work-hardened against further compositional change as their concentration structure locks in through accumulated microstructural heterogeneity. Active bins that repeatedly absorb and dissipate stress accumulate dislocation-analog heterogeneity that increases their effective yield strength for subsequent perturbations. Pools with bins near their ultimate strength exhibit diminished hardening reserve and are prone to localized necking where concentration collapses into narrow ranges. Work-hardened bins resist further imbalance but have consumed their ductility making them brittle to large shocks. Recrystallization in the DLMM context corresponds to full rebalancing events that reset the bin structure to its annealed soft state. Measures strain hardening exponent (Hollomon n controlling rate of strengthening with plastic strain, ranges 0 to 1 — high exponent means strong work hardening response with rapid strength rise per unit strain characteristic of FCC metals with many slip systems, low exponent means weak hardening response with rapid saturation characteristic of heavily pre-worked materials), hardness increase (fractional gain in resistance from cold work representing how much harder the bin has become relative to its annealed virgin state, ranges 0 to 1 — high hardness increase means bin is substantially stronger than virgin, low hardness increase means bin remains in near-annealed condition), yield strength ratio (new yield stress divided by original yield stress after cold work, ranges 0 to 1 normalized — high yield ratio means yield threshold has substantially increased requiring larger stress to induce further plastic flow, low yield ratio means yield stress remains near virgin level), ultimate tensile strength (UTS peak engineering stress at Considere's criterion, ranges 0 to 1 — high UTS means bin approaches peak load-bearing capacity with necking imminent, low UTS means significant hardening reserve remains before peak), cold work fraction (cumulative plastic reduction or equivalent strain representing how much plastic deformation has been imposed, ranges 0 to 1 — high cold work means extensive plastic history with substantial hardening, low cold work means near-virgin state with little prior deformation), dislocation density (rho accumulated defects per unit area driving hardening through Taylor's law, ranges 0 to 1 — high dislocation density means many pinning obstacles to further slip with strong hardening, low dislocation density means clean lattice with minimal hardening), strength coefficient (K in Hollomon power law setting overall stress level, ranges 0 to 1 — high K means strong material response at reference strain, low K means weak material response), work hardening rate (dsigma/depsilon tangent slope of stress-strain curve in plastic regime, ranges 0 to 1 — high rate means rapid strengthening per unit additional strain, low rate means saturated or near-peak with minimal further gain), ductility loss (reduction in elongation to failure as cold work proceeds, ranges 0 to 1 — high ductility loss means bin has consumed most of its strain-to-failure reserve and is brittle to shock, low ductility loss means substantial reserve remains), bauschinger factor (asymmetric reduction of yield stress upon load reversal due to directional back-stresses, ranges 0 to 1 — high Bauschinger means significant directional memory with easy reverse yielding after forward deformation, low Bauschinger means isotropic hardening), residual strengthening (permanent strength gain that persists after load removal, ranges 0 to 1 — high residual strengthening means cold work is locked in and won't relax, low residual strengthening means hardening is transient), straining rate (rate of plastic deformation, ranges 0 to 1 — high straining rate means rapid plastic flow driving fast hardening progression, low straining rate means quasi-static with slow hardening accumulation), hardening modulus (tangent modulus in plastic regime combining rate and coefficient contributions, ranges 0 to 1 — high modulus means steep plastic slope with fast strengthening, low modulus means shallow slope with slow strengthening), lock-in index (how firmly the hardening is locked into the microstructure, ranges 0 to 1 — high lock-in means strengthening persists indefinitely, low lock-in means strengthening relaxes under time or temperature), and recrystallization resistance (resistance to annealing reset that would restore soft state, ranges 0 to 1 — high resistance means strengthening survives recovery attempts, low resistance means easy reset via rebalancing). Composite hardening index (0-100, higher means healthier hardening trajectory — strong strain hardening exponent, meaningful hardness gain, preserved ductility reserve, fast work hardening rate, avoiding the saturated necking regime). Classifies pools by hardening regime as FULLY_HARDENED (index >= 80 — bins have achieved maximum work hardening with peak strength gain and minimal further reserve, characteristic of heavily cold-worked material approaching UTS where additional deformation leads to localized necking rather than uniform strengthening), HARDENED (60-80 — bins are substantially strengthened with significant cold work history but retain some hardening reserve, near-peak strength with slowing hardening rate), HARDENING (40-60 — bins are actively hardening with healthy work hardening rate and preserved ductility reserve, the optimal regime where strength rises monotonically without approaching failure), TRANSITIONING (20-40 — bins are in early plastic regime with initial hardening beginning but limited strength gain, yielding has commenced but deformation is still small), or SOFT (< 20 — bins are in the annealed or virgin state with minimal cold work history, no significant hardening has accumulated, maximum ductility reserve available). Hardening verdict as NO_HARDENING (low hardness increase and low cold work fraction — bins remain in virgin annealed condition with no work-hardening, maximum ductility and softness), INITIAL_HARDENING (low cold work fraction with high work hardening rate — bins have recently begun plastic deformation with steep initial strengthening curve, early uniform plastic regime), ACTIVE_HARDENING (high work hardening rate with preserved ductility — bins are progressing steadily through the uniform plastic region with healthy strengthening and reserve, the sweet spot of work hardening), SATURATING (high UTS with low work hardening rate — bins are approaching peak strength with diminishing marginal strengthening per unit strain, Voce saturation regime where dynamic recovery balances multiplication), FULLY_HARDENED_VERDICT (high ductility loss with high UTS — bins have consumed their ductility reserve and reached peak strength, necking imminent and failure zone), BAUSCHINGER_EFFECT (high Bauschinger factor — bins exhibit strong directional memory with asymmetric reload behavior, directional back-stresses dominate requiring direction-specific assessment), or HARDENING_BALANCE (balanced hardening state without extreme indicators — typical plastic regime with moderate strengthening progress)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-hardening/hodlmm-bin-hardening.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Strain Hardening Analyzer

## What it does

Models strain hardening (work hardening) accumulated strengthening of HODLMM bins under sustained plastic deformation. Strain hardening is the phenomenon where a material becomes harder and stronger as it is plastically deformed, driven microstructurally by the accumulation of dislocations that impede further slip. The Hollomon equation sigma = K * epsilon^n captures the power-law relationship between flow stress and plastic strain in the uniform plastic region, where the strain hardening exponent n (typically 0.1 to 0.5 for metals) quantifies how rapidly strength rises with deformation. The Voce exponential saturation captures approach to a saturation stress from dynamic recovery. Considere's criterion dsigma/depsilon = sigma identifies the onset of diffuse necking. Dislocation density rho accumulates following the Kocks-Mecking-Estrin model drho/depsilon = k_1 * sqrt(rho) - k_2 * rho, and Taylor's hardening law sigma = sigma_0 + alpha * G * b * sqrt(rho) links flow stress to dislocation density. The Bauschinger effect describes asymmetric yield reduction on load reversal from directional back-stresses.

In DLMM pools, bins that have absorbed large positions and undergone repeated compositional adjustments experience effective plastic deformation and become work-hardened against further compositional change. Active bins accumulate dislocation-analog heterogeneity that raises their effective yield strength. Pools with bins near UTS exhibit diminished hardening reserve and are prone to localized necking (concentration collapse). Work-hardened bins resist further imbalance but have consumed their ductility, making them brittle to large shocks. Recrystallization in DLMM corresponds to full rebalancing that resets bin structure to its annealed soft state.

## Why agents need it

LP agents need hardening analysis because it predicts whether bins are gaining or losing ductility reserve, whether strengthening is healthy (gradual) or approaching failure (near UTS), and whether directional memory (Bauschinger) biases subsequent behavior. A HARDENING pool has bins in the sweet spot of active work hardening with preserved ductility. A FULLY_HARDENED pool has bins near UTS with depleted ductility — strong but brittle.

Strain hardening exponent identifies the rate of strengthening. High n (near 0.5) means strong hardening response with substantial capacity to absorb further deformation; low n (near 0.1) means quick saturation.

Cold work fraction reveals plastic history. High cold work means extensive prior deformation with accumulated hardening; low cold work means near-virgin state.

Ductility loss is the key depletion diagnostic. High ductility loss means the hardening reserve is consumed; low ductility loss means substantial reserve remains.

Ultimate tensile strength identifies proximity to failure. High UTS means necking imminent; low UTS means hardening reserve available.

Work hardening rate distinguishes active from saturated regimes. High rate with preserved ductility is optimal active hardening; low rate with high UTS indicates saturation.

Bauschinger factor reveals directional memory. High Bauschinger means asymmetric reloading behavior — treat forward and reverse deformation differently.

Dislocation density quantifies accumulated defects. High density means strong Taylor hardening but limited capacity for further flow.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-hardening/hodlmm-bin-hardening.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-hardening/hodlmm-bin-hardening.ts status
```

### run
Analyzes bin strain hardening dynamics for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-hardening/hodlmm-bin-hardening.ts run
bun run hodlmm-bin-hardening/hodlmm-bin-hardening.ts run --pool 1
bun run hodlmm-bin-hardening/hodlmm-bin-hardening.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgHardeningIndex": 52,
    "fullyHardenedCount": 0,
    "hardenedCount": 1,
    "hardeningCount": 3,
    "transitioningCount": 1,
    "softCount": 0,
    "avgHardnessIncrease": 0.45,
    "avgStrainHardeningExponent": 0.52,
    "avgDuctilityLoss": 0.38,
    "totalSoftBins": 4,
    "totalHardeningBins": 18,
    "totalSaturatedBins": 2,
    "avgHardeningGini": 0.18
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
      "avgStrainHardeningExponent": 0.55,
      "maxStrainHardeningExponent": 0.82,
      "avgHardnessIncrease": 0.48,
      "maxHardnessIncrease": 0.78,
      "avgYieldStrengthRatio": 0.42,
      "maxYieldStrengthRatio": 0.72,
      "avgUltimateTensileStrength": 0.45,
      "maxUltimateTensileStrength": 0.75,
      "avgColdWorkFraction": 0.38,
      "maxColdWorkFraction": 0.68,
      "avgDislocationDensity": 0.42,
      "maxDislocationDensity": 0.72,
      "avgStrengthCoefficient": 0.48,
      "maxStrengthCoefficient": 0.78,
      "avgWorkHardeningRate": 0.52,
      "maxWorkHardeningRate": 0.82,
      "avgDuctilityLoss": 0.38,
      "maxDuctilityLoss": 0.68,
      "avgBauschingerFactor": 0.32,
      "maxBauschingerFactor": 0.58,
      "avgResidualStrengthening": 0.42,
      "maxResidualStrengthening": 0.72,
      "avgStrainingRate": 0.48,
      "maxStrainingRate": 0.78,
      "avgHardeningModulus": 0.52,
      "maxHardeningModulus": 0.82,
      "avgLockInIndex": 0.45,
      "maxLockInIndex": 0.72,
      "avgRecrystallizationResistance": 0.42,
      "maxRecrystallizationResistance": 0.68,
      "softCount": 2,
      "softFraction": 0.08,
      "hardeningCount": 15,
      "hardeningFraction": 0.6,
      "saturatedCount": 3,
      "saturatedFraction": 0.12,
      "hardeningGini": 0.18,
      "hardeningIndex": 55,
      "hardeningRegime": "HARDENING",
      "hardeningVerdict": "ACTIVE_HARDENING",
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

- Strain hardening in real materials requires time-resolved stress-strain measurements to characterize the Hollomon exponent and the full hardening curve. The DLMM model uses reserve fractions, imbalance, and activity proxies on a single snapshot without temporal resolution of strain history.
- Hollomon power law assumes uniform plastic flow prior to Considere necking; real materials exhibit deviations due to dynamic recovery, recrystallization, and textural anisotropy not captured in the snapshot model.
- Taylor's hardening law sigma = sigma_0 + alpha * G * b * sqrt(rho) requires direct measurement of dislocation density by transmission electron microscopy or X-ray line broadening; the model estimates rho from structural heterogeneity proxies.
- Voce exponential saturation parameters sigma_sat and theta require extended stress-strain data; the model approximates saturation approach via UTS proximity.
- Bauschinger effect requires load reversal experiments to measure directly; the model estimates from directional imbalance as a proxy for accumulated back-stresses.
- Cold work fraction in real materials is measured by cross-section reduction; the model uses cumulative activity and imbalance proxies.
- Ductility loss is determined by fracture testing; the model uses hardening accumulation as a proxy for ductility depletion.
- Dynamic recovery and recrystallization kinetics require Arrhenius temperature analysis; the model uses activity as an effective temperature proxy.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
