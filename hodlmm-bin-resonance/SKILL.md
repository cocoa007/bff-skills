---
name: hodlmm-bin-resonance
description: "Detects periodic patterns and harmonic synchronization in HODLMM bin reserve distributions using autocorrelation-based frequency analysis, computing dominant period (strongest repeating interval in the reserve signal), autocorrelation strength at each lag (measuring how well reserves at one bin predict reserves N bins away), spectral power distribution (energy concentrated in periodic vs aperiodic components), spectral entropy (normalized disorder measure where 0 = pure periodicity and 1 = white noise), spectral concentration (fraction of total spectral power held by top-3 harmonics, revealing whether periodicity is focused or diffuse), harmonic peaks with quality factor (sharpness of each detected periodic peak — high Q means narrow/precise resonance, low Q means broad/fuzzy periodicity), harmonic alignment score (whether detected peaks fall at integer multiples of the dominant period, indicating true harmonic series vs coincidental peaks), resonance amplification (ratio of reserve values at periodic peak positions to overall mean, measuring how much the periodic pattern concentrates liquidity at specific bins), phase coherence (consistency of the periodic pattern across successive cycles — high coherence means the pattern repeats reliably, low means it drifts or breaks down), noise floor (median autocorrelation magnitude across all lags, establishing the baseline random correlation level), signal-to-noise ratio (dominant peak autocorrelation divided by noise floor, measuring how confidently the periodic signal rises above random variation), and a composite resonance index scoring 0-100 combining autocorrelation strength, spectral concentration, harmonic alignment, phase coherence, and signal-to-noise ratio, classifying pools as APERIODIC (no detectable periodic structure), WEAKLY_PERIODIC (faint repeating patterns), RESONANT (clear periodic structure with harmonic alignment), or STRONGLY_RESONANT (dominant periodic pattern with high amplification), with resonance risk rated NONE/LOW/MODERATE/HIGH based on index and amplification factor."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-resonance/hodlmm-bin-resonance.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Resonance Analyzer

## What it does

Detects periodic patterns and harmonic synchronization in HODLMM bin reserve distributions by applying autocorrelation-based spectral analysis to the on-chain reserve signal. In physics, resonance occurs when a system is driven at or near its natural frequency, causing oscillation amplitudes to grow dramatically — a bridge swaying in wind, a wine glass shattering at the right pitch. Applied to DLMM liquidity bins, resonance analysis asks: do reserves exhibit repeating patterns at regular bin intervals, and if so, do those patterns synchronize (align harmonically) in ways that concentrate liquidity at predictable positions?

The analyzer constructs a full reserve spectrum by mapping each bin's total USD value across the scan range (filling gaps with zero), normalizes the signal, and computes the autocorrelation function (ACF) across all lags from 1 to half the spectrum length. The ACF reveals how well the reserve value at any bin predicts the value N bins away — high autocorrelation at lag N means reserves repeat with period N. Local peaks in the ACF are detected and characterized by their period (lag), autocorrelation strength, spectral power (squared autocorrelation, proportional to energy at that frequency), and quality factor Q (peak height relative to neighboring values — sharp peaks have high Q indicating precise periodicity, broad peaks have low Q indicating fuzzy or approximate repetition).

Beyond individual harmonics, the analyzer computes cross-harmonic metrics: spectral entropy (how evenly distributed spectral power is — low entropy means power concentrated in few frequencies, i.e., strong periodicity); spectral concentration (fraction of total power in the top 3 harmonics); harmonic alignment score (whether detected peaks fall at integer multiples of the dominant period, which would indicate a true harmonic series like the overtones of a vibrating string); resonance amplification (how much higher reserves are at periodic peak positions compared to the overall mean — amplification > 1 means the periodic pattern concentrates extra liquidity at those bins); and phase coherence (whether the periodic pattern repeats consistently across cycles or drifts and breaks down).

## Why agents need it

Periodic reserve patterns create predictable liquidity landscapes that sophisticated agents can exploit or must defend against. A pool with strong bin resonance at period 3 concentrates liquidity every 3rd bin, creating a repeating pattern of thick-thin-thin liquidity that causes predictable slippage variations. Trading agents can time entries to route through the thick bins; LP agents can identify whether their position spans resonant peaks (high fee capture) or troughs (low utilization).

Harmonic alignment amplifies these effects: when multiple periodic patterns synchronize (e.g., period-3 and period-6 harmonics align), certain bins receive reinforced liquidity from multiple patterns while others fall into harmonic nulls — analogous to constructive and destructive interference in wave physics. High harmonic alignment with high amplification creates extreme concentration risk: most liquidity sits at a few predictable bins while the spaces between are thin. This makes the pool vulnerable to targeted draining of the sparse bins and creates cliff-like slippage when trades push through the periodic gaps.

Phase coherence tells agents whether detected patterns are stable (exploitable/dangerous) or transient (noise). A strongly resonant pool with high phase coherence has a structural periodicity — likely from how liquidity was provisioned (e.g., an LP adding equal amounts every N bins). Low phase coherence means the pattern is breaking down and should not be relied upon. The resonance risk classification (NONE through HIGH) gives agents a fast filter: APERIODIC pools have evenly distributed or chaotic reserves where standard analytics apply; STRONGLY_RESONANT pools require awareness of the periodic structure for accurate slippage estimation, position sizing, and fee projection.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-resonance/hodlmm-bin-resonance.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-resonance/hodlmm-bin-resonance.ts status
```

### run
Fetches bin reserves for top pools (or a specific pool) and computes all resonance metrics. Outputs a human-readable table plus JSON to stdout.
```bash
bun run hodlmm-bin-resonance/hodlmm-bin-resonance.ts run
bun run hodlmm-bin-resonance/hodlmm-bin-resonance.ts run --pool 1
bun run hodlmm-bin-resonance/hodlmm-bin-resonance.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgResonanceIndex": 28.4,
    "aperiodicCount": 2,
    "weaklyPeriodicCount": 1,
    "resonantCount": 1,
    "stronglyResonantCount": 1,
    "noneCount": 2,
    "lowCount": 1,
    "moderateCount": 1,
    "highCount": 1,
    "avgDominantPeriod": 4.2,
    "avgAmplification": 1.35,
    "avgSignalToNoise": 3.8
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "resonanceIndex": 52,
      "resonanceClass": "RESONANT",
      "resonanceRisk": "MODERATE",
      "dominantPeriod": 3,
      "dominantAutocorrelation": 0.6234,
      "spectralConcentration": 0.7821,
      "harmonicCount": 3,
      "peakQualityFactor": 4.2,
      "harmonicAlignmentScore": 0.5612,
      "resonanceAmplification": 1.45,
      "phaseCoherence": 0.72,
      "signalToNoise": 5.2,
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

- Requires at least 5 populated bins within +/-30 of active bin; pools with sparse distributions are skipped.
- Autocorrelation computed up to lag = min(spectrum_length/2, 20); longer periodicities beyond this range are not detectable.
- Harmonic peak detection uses a threshold of 0.1 autocorrelation; very weak periodic signals below this are treated as noise.
- Quality factor is capped at 20 to prevent extreme values from isolated sharp peaks.
- Phase coherence uses coefficient of variation as a proxy; non-stationary periodic patterns may show misleadingly low coherence.
- Spectral analysis assumes the bin reserve signal is stationary across the scan window; real distributions may have non-stationary trends that inflate autocorrelation at long lags.
- Resonance amplification measures average reserve at periodic positions vs overall mean; single-bin outliers can inflate this metric.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
- Read-only; does not reflect pending mempool transactions.
