---
name: hodlmm-bin-resonance
description: "Analyzes harmonic symmetry patterns in HODLMM bin reserve distributions — measures phase alignment between buy/sell sides, standing wave detection, spectral decomposition via DFT, constructive/destructive interference zones, and composite resonance scoring."
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

Detects harmonic resonance patterns in HODLMM bin reserve distributions by treating the liquidity profile as a signal and applying spectral analysis. For each pool, measures left-right symmetry correlation (Pearson r), phase coherence of reserve changes across symmetric bins, extracts dominant harmonic frequencies via discrete Fourier transform, identifies constructive and destructive interference zones, detects standing wave patterns with nodes and antinodes, and computes a composite resonance score.

## Why agents need it

Resonance reveals how coordinated LP positioning is across a pool's bin range. High resonance (strong symmetry, clear harmonics) means LPs are creating balanced depth on both sides of the active price — slippage is predictable and symmetric for both buy and sell trades. Low resonance with destructive interference zones means one direction has significantly less support, creating asymmetric execution costs. Standing waves indicate recurring patterns of deep and thin liquidity at regular intervals — important for LPs choosing bin ranges and for traders estimating slippage at different sizes. Spectral entropy distinguishes structured distributions (one or two dominant patterns) from chaotic ones (many competing strategies). Together, these metrics help agents assess whether a pool's liquidity structure is stable and reliable or fragmented and unpredictable.

## Commands

### doctor
Validates API connectivity and lists available analyses.

```bash
bun run skills/hodlmm-bin-resonance/hodlmm-bin-resonance.ts doctor
```

### run
Full resonance analysis for selected pools. Reports symmetry, harmonics, interference zones, standing waves, and ASCII resonance map.

```bash
bun run skills/hodlmm-bin-resonance/hodlmm-bin-resonance.ts run --top 3
bun run skills/hodlmm-bin-resonance/hodlmm-bin-resonance.ts run --pool 1
```

### status
Quick resonance summary for the top 5 pools by TVL.

```bash
bun run skills/hodlmm-bin-resonance/hodlmm-bin-resonance.ts status
```

## Output contract

All outputs are JSON to stdout.

**Success:**

```json
{
  "result": "resonance_analysis",
  "data": {
    "pools": [{ "poolId": 1, "pair": "sBTC/STX", "profile": { "resonanceScore": 65, "resonanceClass": "quasi-harmonic", "symmetryCorrelation": 0.54 } }],
    "summary": { "poolsAnalyzed": 3, "avgResonanceScore": 58 }
  }
}
```

**Error:**

```json
{ "error": "descriptive message" }
```

## Metrics explained

- **symmetryCorrelation**: Pearson correlation between left (sell-side) and right (buy-side) reserve profiles at corresponding distances. +1.0 = perfect mirror, 0 = no relationship, -1.0 = inverse.
- **phaseCoherence**: Fraction of bin pairs where reserve changes move in the same direction. 1.0 = perfectly in phase.
- **dominantHarmonics**: Top frequency components from DFT of the full bin reserve signal. Higher power = more of the distribution explained by that frequency.
- **spectralEntropy**: Evenness of power distribution across frequencies (0-1). Low = one dominant pattern, high = many competing patterns.
- **spectralCentroid**: Power-weighted average frequency. Low = slow/broad patterns dominate, high = fast/tight oscillations dominate.
- **interferenceZones**: Regions where left and right reserves either reinforce (constructive) or cancel (destructive) each other.
- **netInterference**: constructiveCount minus destructiveCount. Positive = generally reinforcing bilateral depth.
- **standingWaves**: Detected periodic patterns with nodes (reserve minima) and antinodes (reserve maxima) at regular intervals.
- **resonanceClass**: "harmonic" (high symmetry + clear harmonics), "quasi-harmonic" (partial patterns), "aperiodic" (no clear periodicity), "chaotic" (high entropy), "silent" (insufficient data).
- **resonanceScore**: Composite health metric (0-100). Rewards symmetry, phase coherence, low entropy, constructive interference, and standing wave quality.

## Known constraints

- Read-only. No wallet or signing required.
- Scans bins within a fixed radius of the active bin (default +/-30).
- Spectral analysis is performed on a single snapshot — temporal dynamics require multiple snapshots over time.
- DFT resolution limited by scan radius. Very low frequency patterns (wavelength > scan range) cannot be detected.
- Pools with very few populated bins (<5) will produce unreliable spectral results.
- Phase coherence measures direction of change, not magnitude — a small and large move in the same direction count equally.
