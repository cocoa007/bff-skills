---
name: hodlmm-bin-diffusion
description: "Models how liquidity spreads across HODLMM bins using Fick's laws of diffusion. Computes per-pool concentration gradients measuring rate of reserve density change between adjacent bins, diffusion coefficient estimating effective spreading rate from the reserve distribution variance, Peclet number quantifying the ratio of directional flow to diffusive spreading, penetration depth measuring how far from the active bin reserves have meaningfully diffused on each side, Gaussian profile fitting with R-squared goodness-of-fit testing whether reserves follow a normal diffusion pattern, excess kurtosis measuring whether the distribution is more peaked or flat than Gaussian, diffusion front detection locating sharp concentration boundaries, source and sink identification finding bins that act as persistent liquidity attractors or depleted zones, and composite diffusion scoring."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-diffusion/hodlmm-bin-diffusion.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Diffusion Analyzer

## What it does

Models how liquidity spreads across HODLMM bins using Fick's laws of diffusion as the conceptual framework. For each pool, treats the bin-level reserve distribution as a concentration field and analyzes its spatial spreading characteristics. Computes concentration gradients measuring the rate of reserve density change between adjacent bins (dC/dx), a diffusion coefficient estimating the effective spreading rate from the weighted variance of the reserve distribution, the Peclet number quantifying the ratio of directional (advective) transport to diffusive spreading, penetration depth measuring how far from the active bin reserves have meaningfully diffused on each side with asymmetry detection, Gaussian profile fitting with R-squared goodness-of-fit testing whether the reserve distribution follows a normal diffusion pattern (as a point-source solution to the diffusion equation would produce), excess kurtosis measuring whether the distribution is more peaked (leptokurtic) or flat (platykurtic) than Gaussian, diffusion front detection locating sharp concentration boundaries where dense liquidity abruptly transitions to sparse regions, source and sink identification finding bins that act as persistent liquidity attractors or depleted zones, and a composite diffusion index.

## Why agents need it

Diffusion reveals whether liquidity is spreading naturally or trapped in concentrated pockets. A pool with high diffusion coefficient has reserves distributed broadly -- trades of any size encounter relatively even liquidity depth, reducing slippage variance. Low Peclet number means spreading dominates over directional drift -- the pool's reserves aren't being pushed systematically in one direction by imbalanced trading. High Gaussian fit (R-squared near 1) indicates the distribution matches what you'd expect from natural diffusion from a central source, suggesting organic, equilibrium-seeking liquidity placement. Deviations from Gaussian (high kurtosis) reveal either over-concentration at the active bin (leptokurtic) or unusual flattening suggesting artificial/strategic positioning (platykurtic). Diffusion fronts mark boundaries where concentrated liquidity abruptly ends -- these create slippage cliffs for trades crossing the boundary. Sources indicate bins that consistently attract liquidity (possibly strategic LP positions), while sinks represent persistent depletion zones that may signal structural inefficiency. Penetration asymmetry reveals directional bias in how far liquidity extends on each side of the active bin -- significant asymmetry can indicate directional market pressure or one-sided LP strategies. Together these metrics let agents assess whether a pool's liquidity behaves like a well-mixed solution or a stratified system with barriers to flow.

## Commands

### doctor
Validates API connectivity and lists available analyses.

```bash
bun run skills/hodlmm-bin-diffusion/hodlmm-bin-diffusion.ts doctor
```

### run
Full diffusion analysis for selected pools. Reports concentration gradients, diffusion coefficient, Peclet number, Gaussian fit, penetration depth, and ASCII concentration profile.

```bash
bun run skills/hodlmm-bin-diffusion/hodlmm-bin-diffusion.ts run --top 3
bun run skills/hodlmm-bin-diffusion/hodlmm-bin-diffusion.ts run --pool 1
```

### status
Quick diffusion summary for the top 5 pools by TVL.

```bash
bun run skills/hodlmm-bin-diffusion/hodlmm-bin-diffusion.ts status
```

## Output contract

All outputs are JSON to stdout.

**Success:**

```json
{
  "result": "diffusion_analysis",
  "data": {
    "pools": [{ "poolId": 1, "pair": "sBTC/STX", "diffusionIndex": 55, "diffusionClass": "well-diffused", "pecletNumber": 2.3, "pecletClass": "mixed" }],
    "summary": { "poolsAnalyzed": 3, "avgDiffusionIndex": 48 }
  }
}
```

**Error:**

```json
{ "error": "descriptive message" }
```

## Metrics explained

- **concentrationGradient**: Rate of change in reserve density between adjacent bins (dC/dx). Steep gradients indicate sharp liquidity transitions; flat gradients indicate even spreading.
- **diffusionCoefficient**: Estimated D value from the weighted variance of the reserve distribution around the active bin. Higher D = liquidity spread more broadly. Analogous to Fick's diffusion coefficient.
- **pecletNumber**: Ratio of advective transport (directional center-of-mass shift) to diffusive transport (spreading). Pe < 1 = diffusion-dominated, Pe > 20 = advection-dominated.
- **pecletClass**: "diffusion-dominated" (Pe < 1), "mixed" (1-5), "advection-leaning" (5-20), "advection-dominated" (> 20).
- **penetrationDepth**: How many bins from the active bin have meaningful reserves (> 5% of peak). Measured separately for left and right sides.
- **penetrationAsymmetry**: Normalized difference between left and right penetration depths. 0 = perfectly symmetric, 1 = completely one-sided.
- **gaussianFitR2**: R-squared goodness-of-fit comparing the actual reserve distribution to an ideal Gaussian (normal) profile. 1.0 = perfect Gaussian diffusion; 0 = no resemblance.
- **gaussianFitClass**: "excellent" (R² > 0.9), "good" (0.7-0.9), "moderate" (0.4-0.7), "poor" (0.1-0.4), "none" (< 0.1).
- **gaussianSigma**: Standard deviation of the fitted Gaussian in bin units. Larger sigma = wider effective diffusion spread.
- **kurtosis**: Excess kurtosis of the reserve distribution. Positive = more peaked than Gaussian (leptokurtic), negative = flatter (platykurtic), zero = Gaussian-like (mesokurtic).
- **kurtosisClass**: "leptokurtic-extreme" (> 2), "leptokurtic" (0.5-2), "mesokurtic" (-0.5 to 0.5), "platykurtic" (-2 to -0.5), "platykurtic-extreme" (< -2).
- **diffusionFront**: A bin where reserve density changes sharply -- the boundary of a concentrated liquidity zone. Trades crossing a diffusion front experience sudden slippage changes.
- **source**: A bin with reserves significantly above the mean that exceeds both neighbors -- a persistent liquidity attractor.
- **sink**: A bin with reserves significantly below the mean that sits below both neighbors -- a persistent depletion zone.
- **diffusionClass**: "concentrated" (index < 15), "limited" (15-30), "partial" (30-50), "well-diffused" (50-70), "fully-diffused" (> 70).
- **diffusionIndex**: Composite score (0-100). HIGHER means more uniform liquidity spreading, better Gaussian fit, lower directional bias, and fewer concentration barriers.

## Safety notes

- Read-only skill. No wallet, signing, or funds required.
- All data is fetched from public on-chain contract reads and the Bitflow API.
- Does not execute any transactions or modify any state.
- Rate-limited by Hiro API. Avoid scanning more than 5 pools in rapid succession.
- No private keys or sensitive data are accessed.

## Known constraints

- Scans bins within a fixed radius of the active bin (default +/-30).
- Diffusion coefficient is a spatial snapshot, not a temporal measurement -- it estimates how diffused the current distribution is, not how fast it's changing.
- Gaussian fitting assumes a single-peak distribution; bimodal pools will show poor R-squared even if each peak is individually Gaussian.
- Peclet number estimation requires the center of mass to differ from the active bin; perfectly centered distributions give Pe near 0.
- Source/sink detection uses adjacent-bin comparison; gradual concentration changes may not trigger detection.
- Pools with very few populated bins (<5) will produce unreliable diffusion metrics.
