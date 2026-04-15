---
name: hodlmm-bin-resonance
description: "Detects natural oscillation frequencies in HODLMM bin reserve patterns using discrete Fourier transform analysis. Computes per-pool spectral decomposition identifying dominant resonant modes in liquidity distribution, Q-factor measuring sharpness of spectral peaks indicating how narrowly concentrated reserve oscillation energy is, damping ratio quantifying how quickly reserve pattern oscillations decay away from the active bin, standing wave node and antinode detection locating bins where reserve amplitude crosses zero or reaches local maxima, spectral entropy measuring how uniformly distributed oscillation energy is across frequencies, spectral concentration showing what fraction of total pattern energy is captured by a few dominant modes, peak amplification ratio, half-power bandwidth, and composite resonance scoring."
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

Detects natural oscillation frequencies in HODLMM bin reserve patterns using discrete Fourier transform analysis. For each pool, performs spectral decomposition of the bin-level reserve distribution to identify dominant resonant modes -- periodic patterns in how liquidity concentrates and depletes across bin space. Computes Q-factor measuring sharpness of spectral peaks (how narrowly concentrated oscillation energy is at specific frequencies), damping ratio quantifying how quickly reserve pattern oscillations decay away from the active bin, standing wave node detection locating bins where reserve amplitude crosses zero (nodes) or reaches local maxima (antinodes), spectral entropy measuring how uniformly distributed oscillation energy is across all frequency components, spectral concentration showing what fraction of total pattern energy is captured by the few dominant modes, peak amplification ratio comparing fundamental mode amplitude to raw signal range, half-power bandwidth counting how many modes carry significant energy, and a composite resonance index.

## Why agents need it

Resonance reveals hidden periodic structure in liquidity distribution that isn't visible from aggregate metrics. A pool with strong resonance at a specific wavelength has liquidity that concentrates in a repeating spatial pattern -- bins of high reserves alternating with bins of low reserves at regular intervals. This pattern affects trade execution: swaps that span multiple wavelengths encounter alternating zones of deep and thin liquidity, creating uneven slippage profiles. High Q-factor means the resonance is sharp -- most pattern energy is concentrated in a narrow frequency band, making the pool's behavior highly predictable at that scale but vulnerable to trades that match the resonant wavelength. Low damping means oscillation patterns persist far from the active bin, so even distant bins maintain the same periodic structure. Standing wave nodes identify specific bins where reserves are naturally minimal -- these are structural liquidity gaps, not random, and they'll persist because the underlying pattern regenerates them. Spectral concentration tells you whether the pool's liquidity follows a simple pattern (dominated by 1-2 modes) or is complex (energy spread across many frequencies). Flat-spectrum pools behave uniformly; resonant pools have exploitable spatial structure that changes trade cost depending on direction and size.

## Commands

### doctor
Validates API connectivity and lists available analyses.

```bash
bun run skills/hodlmm-bin-resonance/hodlmm-bin-resonance.ts doctor
```

### run
Full resonance analysis for selected pools. Reports spectral decomposition, Q-factor, damping, standing wave features, and ASCII amplitude envelope.

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
    "pools": [{ "poolId": 1, "pair": "sBTC/STX", "resonanceIndex": 42, "resonanceClass": "moderate", "qFactor": 8.3, "dampingClass": "underdamped-light" }],
    "summary": { "poolsAnalyzed": 3, "avgResonanceIndex": 38 }
  }
}
```

**Error:**

```json
{ "error": "descriptive message" }
```

## Metrics explained

- **resonantMode**: A periodic component in the bin reserve pattern. Each mode has a wavelength (bins per cycle), frequency, amplitude, phase, and power fraction.
- **fundamentalWavelength**: The wavelength of the strongest periodic pattern in bins. Shorter wavelengths = more rapid oscillation between high and low reserve bins.
- **qFactor**: Quality factor measuring how sharply peaked the spectral response is. High Q = energy concentrated in narrow frequency band = predictable periodic structure. Low Q = broad response = no dominant pattern.
- **qClass**: "overdamped" (Q < 1), "low-Q" (1-5), "moderate-Q" (5-15), "high-Q" (15-30), "ultra-high-Q" (> 30).
- **dampingRatio**: How quickly reserve oscillation patterns decay (ζ = 1/2Q). Lower = oscillations persist farther from active bin.
- **dampingClass**: "overdamped" (ζ > 1), "underdamped-heavy" (0.7-1), "underdamped-moderate" (0.3-0.7), "underdamped-light" (0.05-0.3), "undamped" (< 0.05).
- **standingWaveNode**: A bin where reserve deviation from mean crosses zero -- structural minimum in the periodic pattern.
- **standingWaveAntinode**: A bin where reserve deviation reaches a local maximum -- structural peak in the periodic pattern.
- **spectralEntropy**: Information entropy of the power spectrum. Higher = energy more uniformly distributed across frequencies. Lower = concentrated in fewer modes.
- **spectralConcentration**: 1 - normalized entropy. Higher = more energy captured by a few dominant modes = stronger periodic structure.
- **peakAmplification**: Ratio of fundamental mode amplitude to raw signal range. Higher = the periodic component dominates over noise.
- **bandwidthBins**: Number of spectral modes with power above half the peak power. Narrower bandwidth = sharper resonance.
- **resonanceClass**: "flat" (index < 15), "weak" (15-30), "moderate" (30-50), "strong" (50-70), "sharp" (> 70).
- **resonanceIndex**: Composite score (0-100). HIGHER means stronger periodic structure in reserves, sharper spectral peaks, and more predictable oscillation patterns.

## Safety notes

- Read-only skill. No wallet, signing, or funds required.
- All data is fetched from public on-chain contract reads and the Bitflow API.
- Does not execute any transactions or modify any state.
- Rate-limited by Hiro API. Avoid scanning more than 5 pools in rapid succession.
- No private keys or sensitive data are accessed.

## Known constraints

- Scans bins within a fixed radius of the active bin (default +/-30).
- DFT resolution is limited by the number of populated bins -- sparse bins reduce spectral accuracy.
- Standing wave detection uses adjacent-bin comparison; true nodes may span fractional bin positions.
- Q-factor estimation assumes a single dominant peak; multi-modal spectra may give misleading Q values.
- Spectral analysis captures spatial patterns at one point in time; temporal evolution requires repeated snapshots.
- Pools with very few populated bins (<5) will produce unreliable resonance metrics.
