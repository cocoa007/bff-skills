---
name: hodlmm-bin-wavelet
description: "Decomposes HODLMM bin reserve distributions into multi-scale frequency components using Haar wavelet transform — performs a complete multi-resolution analysis computing approximation coefficients (the low-frequency trend capturing the broad shape of the reserve distribution across bins) and detail coefficients at each decomposition level (the high-frequency features at progressively coarser scales — level 1 captures bin-to-bin noise, level 2 captures 4-bin patterns, level 3 captures 8-bin structures, and so on, each level doubling the spatial scale), per-level energy (the squared sum of detail coefficients at each scale measuring how much structural variation exists at that resolution — a level with high energy means the reserve distribution has significant features at that spatial frequency), energy fraction (normalized energy distribution across scales showing where the pool's structural complexity concentrates — if level 1 dominates the pool is noisy, if the approximation dominates the pool is smooth with a clean trend), wavelet entropy (normalized Shannon entropy of the energy distribution across scales — 1.0 means energy is uniformly spread across all scales indicating a fractal-like self-similar structure; low values mean energy concentrates at one or few scales indicating a simpler structural organization), dominant scale (the decomposition level with the highest detail energy — identifies the characteristic spatial frequency of the pool's reserve structure; dominant scale 2 means 4-bin patterns dominate while dominant scale 4 means 16-bin patterns dominate), energy concentration (the maximum energy fraction across all scales — high concentration means one scale dominates the structure while low concentration means energy is distributed), spectral flatness (ratio of geometric to arithmetic mean of energy fractions — 1.0 for perfectly flat spectrum indicating broadband structure with equal energy at all scales; 0.0 for energy concentrated at a single scale), spectral centroid (energy-weighted average of scale levels — low centroid means energy concentrates at fine scales (high frequency) indicating a noisy or detailed reserve profile; high centroid means energy at coarse scales indicating broad structural patterns), spectral rolloff (the scale level below which 85% of detail energy is contained — identifies the frequency boundary between significant structure and negligible fine detail), multi-resolution complexity (count of scales with >5% of total energy — how many distinct spatial frequencies carry meaningful structural information), denoise SNR (signal-to-noise ratio in dB comparing the energy of the approximation plus coarse details to the finest detail level — high SNR means the reserve distribution has a clean structure with little bin-level noise; low SNR means noise is prominent), trend strength (fraction of total energy in the approximation coefficients — measures how much of the reserve distribution is explained by the broad trend versus detail variations; high trend strength means the pool has a dominant smooth shape with minor variations), noise ratio (fraction of total energy in the finest detail level — measures the proportion of bin-to-bin noise in the overall signal; high noise ratio indicates a jittery reserve profile with significant per-bin randomness), scale transition sharpness (maximum energy fraction difference between adjacent levels — detects abrupt changes in the energy spectrum indicating a characteristic scale boundary), high/low frequency dominance (fraction of detail energy in the finer versus coarser half of decomposition levels), cross-scale correlation (average absolute Pearson correlation between adjacent decomposition levels — high correlation means features persist across scales indicating self-similar or fractal-like structure; low correlation means each scale is independent), wavelet kurtosis (fourth moment of all detail coefficients — values > 3 indicate heavy-tailed distributions with intermittent large coefficients suggesting sparse localized features in the reserve profile; values < 3 indicate light-tailed uniform variation), wavelet skewness (third moment of detail coefficients — positive skewness means large positive deviations dominate indicating upward spikes in reserves; negative means downward spikes), persistence index (fraction of detail coefficients that maintain sign across adjacent decomposition levels — high persistence means features are stable across scales; low persistence means the structural character changes between scales), and composite wavelet index (0-100 from entropy, complexity, flatness, cross-scale correlation, and kurtosis components), classifying pools by structure class as FLAT (wavelet index < 20 — minimal multi-scale structure, the reserve distribution is nearly constant or has a simple monotonic shape), SMOOTH (20-40 — some structure but concentrated at few scales, a clean reserve profile with gentle variations), STRUCTURED (40-60 — moderate multi-scale complexity with distinct features at several spatial frequencies), MULTISCALE (60-80 — rich structure across many scales indicating complex reserve distribution patterns), or FRACTAL (>= 80 — self-similar structure with energy at all scales indicating maximum structural complexity), and by scale regime as NOISY (high-frequency detail energy > 70% — dominated by fine-scale bin-to-bin variations), TRENDING (low-frequency energy > 70% — dominated by broad structural patterns), BROADBAND (spectral flatness > 0.7 — energy distributed uniformly across all scales), NARROWBAND (energy concentration > 60% — energy concentrated at one dominant scale), or MIXED (no single pattern dominates)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-wavelet/hodlmm-bin-wavelet.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Wavelet Decomposition Analyzer

## What it does

Decomposes HODLMM bin reserve distributions into multi-scale frequency components using a Haar wavelet transform. In signal processing, wavelet decomposition breaks a signal into approximation (low-frequency trend) and detail (high-frequency variation) components at progressively coarser scales. Each decomposition level captures structural features at twice the spatial scale of the previous level.

In DLMM pools, the "signal" is the sequence of USD reserve values across bins. Level 1 detail captures bin-to-bin noise — the finest variation between adjacent bins. Level 2 captures 4-bin patterns — structures spanning small neighborhoods. Level 3 captures 8-bin patterns, and so on. The approximation captures the broadest shape — the macro trend of how liquidity distributes across the entire range.

The analyzer computes per-level energy distribution, wavelet entropy, spectral characteristics (flatness, centroid, rolloff), multi-resolution complexity, denoising metrics (SNR, noise ratio), cross-scale correlation, persistence index, and statistical moments (kurtosis, skewness). Pools are classified by structure class (FLAT through FRACTAL) and scale regime (NOISY through BROADBAND).

## Why agents need it

Wavelet decomposition reveals which spatial scales carry the most structural information in a pool's reserve distribution — something that aggregate metrics like mean, variance, or even gradient analysis completely miss. Two pools with identical TVL and similar reserve variance can have radically different wavelet profiles: one concentrated at fine scales (noisy bin-to-bin jitter with no macro structure) and another concentrated at coarse scales (smooth bins with a strong broad shape).

Wavelet entropy tells agents how structurally complex a pool is across scales. High entropy means every scale carries significant features — the pool has a fractal-like self-similar reserve structure that looks complex at every zoom level. Low entropy means structure concentrates at one or few scales — the pool is simple when viewed at the right resolution.

Spectral flatness distinguishes broadband pools (energy everywhere, complex at all scales) from narrowband pools (energy at one characteristic scale). LP agents can use this to match strategy granularity: a broadband pool needs multi-scale monitoring while a narrowband pool can be managed by watching just the dominant scale.

The denoise SNR separates clean structural signal from noise. A high-SNR pool has a clear reserve shape that trades will follow predictably. A low-SNR pool is dominated by random bin-to-bin variation — trade execution is noisier and less predictable.

Cross-scale correlation identifies self-similar structure. High correlation across scales means features repeat at different zoom levels — what you see at 4-bin scale also appears at 16-bin scale. This persistence suggests structural stability. Low cross-scale correlation means each scale is independent — the pool's character changes depending on which resolution you examine.

Trend strength tells LP agents how much of the reserve distribution is "signal" versus "noise." A high trend-strength pool has a dominant smooth shape that LP strategies can reliably position against. A low trend-strength pool has reserves dominated by multi-scale variations rather than a clean directional trend.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-wavelet/hodlmm-bin-wavelet.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-wavelet/hodlmm-bin-wavelet.ts status
```

### run
Analyzes wavelet decomposition for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-wavelet/hodlmm-bin-wavelet.ts run
bun run hodlmm-bin-wavelet/hodlmm-bin-wavelet.ts run --pool 1
bun run hodlmm-bin-wavelet/hodlmm-bin-wavelet.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgWaveletIndex": 38.4,
    "flatCount": 1,
    "smoothCount": 2,
    "structuredCount": 1,
    "multiscaleCount": 1,
    "fractalCount": 0,
    "avgWaveletEntropy": 0.62,
    "avgSpectralFlatness": 0.45,
    "avgDenoiseSnr": 18.5,
    "avgTrendStrength": 0.72
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "activeBin": 8388608,
      "binsAnalyzed": 25,
      "totalUsd": 140000,
      "decompositionLevels": 4,
      "totalEnergy": 985000000,
      "approximationEnergy": 720000000,
      "detailEnergy": 265000000,
      "approximationFraction": 0.7310,
      "detailFraction": 0.2690,
      "waveletEntropy": 0.68,
      "dominantScale": 2,
      "dominantScaleLevel": 1,
      "energyConcentration": 0.7310,
      "spectralFlatness": 0.42,
      "spectralCentroid": 1.85,
      "spectralRolloff": 2,
      "multiResolutionComplexity": 3,
      "denoiseResidualEnergy": 85000,
      "denoiseSnr": 22.4,
      "trendStrength": 0.7310,
      "noiseRatio": 0.0001,
      "scaleTransitionSharpness": 0.15,
      "highFreqDominance": 0.65,
      "lowFreqDominance": 0.35,
      "crossScaleCorrelation": 0.34,
      "waveletKurtosis": 4.2,
      "waveletSkewness": -0.8,
      "persistenceIndex": 0.55,
      "waveletIndex": 42,
      "structureClass": "STRUCTURED",
      "scaleRegime": "MIXED",
      "levels": [
        {
          "level": 1,
          "scale": 2,
          "energy": 125000,
          "energyFraction": 0.0001,
          "maxCoefficient": 850,
          "minCoefficient": 12,
          "meanCoefficient": -15.3,
          "stdCoefficient": 245.6,
          "coefficientCount": 12,
          "anomalyBins": [8388610]
        }
      ],
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

- Uses Haar wavelet (simplest wavelet family). Haar wavelets are piecewise constant, which is well-suited to binned data but cannot capture smooth curvature as efficiently as Daubechies or Morlet wavelets. The Haar basis matches the discrete bin structure naturally since each bin is a constant-value segment.
- Input signal length may not be a power of 2. The implementation handles odd-length arrays by carrying the unpaired element forward, but this introduces minor edge effects at each decomposition level. The last coefficient at each level may be slightly biased.
- Wavelet entropy is normalized to the number of active scales. Pools with more bins produce more decomposition levels, which changes the entropy normalization base. Compare entropy values only across pools with similar bin counts.
- Spectral centroid and rolloff treat decomposition levels as linearly spaced frequencies. In reality, wavelet scales are logarithmically spaced (each level is 2x the previous). The centroid is computed in level-space, not frequency-space, which compresses high-frequency differences.
- Cross-scale correlation compares coefficients at adjacent levels, but these levels have different lengths (each level has half the coefficients of the previous). The correlation is computed over the shorter length, which may miss boundary effects.
- Denoising uses simple level-1 removal (zeroing the finest detail coefficients). More sophisticated denoising would use soft/hard thresholding with a universal or SURE threshold. The SNR metric is an upper bound on the actual noise removal quality.
- Wavelet kurtosis combines coefficients from all levels into one distribution. This masks per-level distributional differences — a pool with Gaussian level-1 and heavy-tailed level-3 coefficients would show moderate aggregate kurtosis despite having distinct distributional character at different scales.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
