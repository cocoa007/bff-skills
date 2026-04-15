---
name: hodlmm-bin-turbulence
description: "Analyzes turbulent fluctuations in HODLMM bin liquidity distributions — models chaotic reserve variations using fluid dynamics turbulence theory, computing Reynolds number analog (volume-to-depth ratio measuring the ratio of inertial forces to viscous forces in liquidity flow — high Reynolds means trading activity overwhelms the pool's natural damping, producing chaotic reserve distributions; low Reynolds means smooth, predictable liquidity profiles), turbulence intensity (RMS of detrended reserve fluctuations normalized by mean reserve — the fundamental measure of how much reserves deviate from the smooth trend; 0.1 means 10% variation, 0.5 means reserves swing wildly around their expected values), eddy count and scale (local extrema in the detrended reserve profile — each peak or trough represents a circulation pattern where liquidity bunches up or thins out relative to neighbors; more eddies mean more complex structure, larger eddies mean broader disruption zones), maximum eddy amplitude and bin (the single largest fluctuation from trend — the primary turbulence hotspot where reserves deviate most from what a smooth distribution would predict), turbulent kinetic energy (half the variance of detrended fluctuations — the total energy stored in the chaotic component of the reserve distribution; higher TKE means more potential for sudden reserve redistribution), dissipation rate (mean squared second derivative of fluctuations — how rapidly turbulent energy cascades from large-scale to small-scale variations; high dissipation means energy is being actively destroyed at fine scales, indicating sharp local transitions), integral scale (autocorrelation length — the characteristic size of the largest eddies in bin units; a pool with integral scale 5 has turbulent structures spanning roughly 5 bins, meaning reserve perturbations correlate across that range before decorrelating), Kolmogorov scale (smallest scale of turbulent fluctuations — below this scale, viscous damping smooths out all variations; the ratio of integral to Kolmogorov scale indicates the range of turbulent scales present), eddy viscosity (turbulent transport coefficient — effective mixing rate due to chaotic fluctuations; high eddy viscosity means turbulence is actively redistributing reserves between bins, low means fluctuations are frozen in place), anisotropy (directional bias — RMS fluctuation asymmetry between left and right sides of the active bin; high anisotropy means turbulence is concentrated on one side, creating directional execution unpredictability), intermittency (kurtosis-based burstiness — how much turbulent energy is concentrated in rare extreme events vs uniformly distributed; high intermittency means occasional violent reserve spikes amid relative calm, low means steady moderate fluctuations), turbulent flux (net directional transport due to fluctuations — whether chaotic variations systematically push reserves in one direction; nonzero flux indicates turbulence-driven drift), Taylor microscale (intermediate length scale between integral and Kolmogorov — the scale at which viscous dissipation begins to dominate over inertial transfer; characterizes the transition zone between large organized eddies and fine dissipative structures), energy spectral slope (log-log slope of the power spectrum of fluctuations — Kolmogorov theory predicts -5/3 for fully developed turbulence; steeper slopes indicate stronger dissipation, shallower slopes indicate energy injection at small scales), reserve kurtosis (fourth moment — excess kurtosis above 3 indicates heavy tails with extreme reserve outliers; below 3 indicates a more uniform distribution than Gaussian), laminar and turbulent fractions (percentage of bins in smooth vs chaotic states — bins with fluctuations below 0.5 RMS are classified as locally laminar, above as locally turbulent), turbulence index (composite 0-100 score combining intensity, eddies, Reynolds, intermittency, and anisotropy — higher means more chaotic and unpredictable liquidity distribution), classifying pools by flow regime as LAMINAR (intensity < 0.1 and few eddies — smooth, predictable reserve distribution with gentle gradients; trades encounter consistent depth at every bin and LP positions behave as expected), TRANSITIONAL (moderate intensity with scattered eddies — partially organized flow with intermittent turbulent bursts; most bins are smooth but some regions have unexpected reserve concentrations or voids), TURBULENT (high intensity with many eddies — chaotic reserve distribution with significant deviations from any smooth trend; execution quality varies unpredictably by position in the range), or CHAOTIC (extreme intensity — fully disordered reserves with no discernible pattern; bin-to-bin reserve changes are essentially random, making execution quality for any given trade unpredictable), and by stability class from F_VERY_STABLE through A_VERY_UNSTABLE using Pasquill atmospheric stability categories."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-turbulence/hodlmm-bin-turbulence.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Turbulence Analyzer

## What it does

Analyzes the turbulent structure of liquidity distributions across HODLMM bins using concepts from fluid dynamics turbulence theory. In fluid mechanics, turbulence is the chaotic, irregular motion of fluid characterized by eddies, vortices, and unpredictable velocity fluctuations at multiple scales. The Reynolds number determines whether flow is laminar (smooth, predictable) or turbulent (chaotic, unpredictable), based on the ratio of inertial forces to viscous forces.

In DLMM pools, each bin holds a certain amount of liquidity. A "laminar" pool has a smooth, predictable reserve distribution — each bin's reserves follow logically from its neighbors. A "turbulent" pool has chaotic reserve distributions where adjacent bins can have wildly different reserves with no discernible pattern. The analyzer detrends the reserve distribution (removes the linear gradient), then analyzes the residual fluctuations for turbulent characteristics: eddies (local circulation patterns), energy spectra (how turbulent energy is distributed across scales), intermittency (burstiness), and Reynolds number (ratio of trading activity to liquidity damping).

The tool computes the full turbulence characterization: intensity, kinetic energy, dissipation rate, integral and Kolmogorov scales, eddy viscosity, anisotropy, intermittency, spectral slope, and Taylor microscale. Pools are classified by flow regime (LAMINAR/TRANSITIONAL/TURBULENT/CHAOTIC) and atmospheric stability class (F through A).

## Why agents need it

Turbulence reveals execution unpredictability that smoother metrics miss. Two pools with identical TVL and similar average depth can have radically different turbulence profiles — one laminar with smooth, predictable reserves (consistent execution quality) and another turbulent with chaotic bin-to-bin variations (unpredictable execution).

The Reynolds number analog tells agents whether a pool's trading activity is overwhelming its natural damping capacity. High Reynolds pools have too much volume relative to their depth structure, producing chaotic reserve reshuffling. Low Reynolds pools maintain smooth, predictable distributions that trading activity can't disrupt.

Eddy detection identifies specific turbulent structures — clusters of bins where reserves circulate in patterns that deviate from the smooth trend. Large eddies spanning many bins indicate broad disruption zones where trades may encounter unexpected depth changes. Small, intense eddies indicate localized hotspots of reserve instability.

Intermittency is critical for risk assessment. A pool with high average turbulence but low intermittency has steady, moderate reserve fluctuations — unpredictable but consistently so. A pool with moderate average turbulence but high intermittency has occasional violent reserve spikes — mostly calm but capable of sudden extreme execution quality changes. The spectral slope reveals whether turbulent energy follows the Kolmogorov -5/3 cascade (mature, fully developed turbulence) or deviates (energy injection at specific scales, indicating non-equilibrium dynamics).

Anisotropy tells trading agents whether turbulence is directionally biased. If one side of the active bin is significantly more turbulent than the other, trades in that direction face more execution uncertainty. LP agents should prefer the laminar side for more predictable fee accrual.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-turbulence/hodlmm-bin-turbulence.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-turbulence/hodlmm-bin-turbulence.ts status
```

### run
Analyzes turbulence for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-turbulence/hodlmm-bin-turbulence.ts run
bun run hodlmm-bin-turbulence/hodlmm-bin-turbulence.ts run --pool 1
bun run hodlmm-bin-turbulence/hodlmm-bin-turbulence.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgTurbulenceIndex": 42.3,
    "laminarCount": 1,
    "transitionalCount": 2,
    "turbulentCount": 1,
    "chaoticCount": 1,
    "avgReynoldsNumber": 15.8,
    "avgTurbulenceIntensity": 0.35,
    "totalEddies": 28,
    "avgIntermittency": 55,
    "avgAnisotropy": 0.18,
    "avgEnergySpectralSlope": -1.45
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "activeBin": 8388608,
      "binsAnalyzed": 25,
      "totalUsd": 140000,
      "reynoldsNumber": 12.5,
      "turbulenceIntensity": 0.28,
      "eddyCount": 5,
      "avgEddyScale": 2.0,
      "maxEddyAmplitude": 3500,
      "maxEddyBin": 8388612,
      "turbulentKineticEnergy": 245000,
      "dissipationRate": 18000,
      "integralScale": 4,
      "kolmogorovScale": 1.2,
      "eddyViscosity": 1825,
      "anisotropy": 0.15,
      "intermittency": 52,
      "turbulentFlux": -120,
      "taylorMicroscale": 3.69,
      "energySpectralSlope": -1.55,
      "reserveKurtosis": 3.8,
      "laminarFraction": 0.52,
      "turbulentFraction": 0.48,
      "turbulenceIndex": 45,
      "flowRegime": "TRANSITIONAL",
      "stabilityClass": "D_NEUTRAL",
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

- Turbulence analysis uses a single spatial snapshot, not temporal evolution. True turbulence requires time-series data; this analyzer uses spatial variation as a proxy, which captures the structure of chaotic distributions but cannot measure actual flow dynamics.
- The Reynolds number analog maps volume-to-depth ratio, not actual inertial/viscous force ratio. It correlates with turbulence likelihood but the absolute values are not comparable to fluid dynamics Reynolds numbers.
- Detrending uses a linear fit. If the underlying reserve distribution has nonlinear structure (e.g., exponential decay from the active bin), the detrended fluctuations include real structural features misclassified as turbulence.
- Eddy detection uses simple peak/trough finding. Complex multi-scale eddies may be counted as multiple small eddies rather than one large structured perturbation.
- The power spectrum uses a basic DFT on a short series (typically 10-30 populated bins). Spectral estimates are noisy and the spectral slope should be interpreted as approximate.
- Kolmogorov and Taylor microscales assume homogeneous isotropic turbulence. Real bin distributions are neither homogeneous nor isotropic, so these scales are analogies, not exact measurements.
- Intermittency uses kurtosis which is sensitive to outliers. A single extreme bin can dominate the intermittency score.
- Stability classes use Pasquill categories as a naming convention. The thresholds are calibrated to the turbulence index, not to atmospheric stability theory.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
