---
name: hodlmm-bin-amplitude
description: "Measures the amplitude (peak-to-trough magnitude) of liquidity distributions across HODLMM bin ranges — wave height analysis, amplitude decay from active bin, resonance detection, amplitude asymmetry, and dominant frequency estimation."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-amplitude/hodlmm-bin-amplitude.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Amplitude Analyzer

## What it does

Analyzes the amplitude characteristics of liquidity distributions across HODLMM DLMM pools. Treats the reserve profile as a waveform and extracts: peak-to-trough amplitudes within local oscillation cycles, amplitude decay rate from the active bin outward, resonance patterns (repeating amplitude structures), dominant wavelength estimation, amplitude asymmetry between buy/sell sides, and signal-to-noise ratio of the liquidity profile.

## Why agents need it

Amplitude tells you how volatile the liquidity landscape is across the bin range. High-amplitude pools have dramatic peaks and valleys — great for sniping cheap bins but risky for passive LPs. Low-amplitude pools offer consistent depth but may lack fee-generating hotspots. The decay rate reveals how quickly liquidity drops off from the center — fast decay means narrow effective ranges. Resonance patterns reveal structural LP positioning strategies (e.g., periodic rebalancing creating wave-like patterns). Agents can use amplitude data to size positions appropriately, predict where liquidity gaps will form, and identify pools with stable vs volatile depth profiles.

## Commands

### doctor
Validates API connectivity and lists available amplitude analyses.

```bash
bun run skills/hodlmm-bin-amplitude/hodlmm-bin-amplitude.ts doctor
```

### run
Full amplitude analysis for selected pools. Reports wave metrics, decay rates, resonance, asymmetry, and an ASCII amplitude map.

```bash
bun run skills/hodlmm-bin-amplitude/hodlmm-bin-amplitude.ts run --top 3
bun run skills/hodlmm-bin-amplitude/hodlmm-bin-amplitude.ts run --pool 1
```

### status
Quick amplitude summary for the top 5 pools by TVL.

```bash
bun run skills/hodlmm-bin-amplitude/hodlmm-bin-amplitude.ts status
```

## Output contract

All outputs are JSON to stdout.

**Success:**

```json
{
  "result": "amplitude_analysis",
  "data": {
    "pools": [{ "poolId": 1, "pair": "sBTC/STX", "profile": { "amplitudeScore": 65, "peakAmplitude": 1250.50, "decayRate": 0.85 } }],
    "summary": { "poolsAnalyzed": 3, "avgAmplitudeScore": 62 }
  }
}
```

**Error:**

```json
{ "error": "descriptive message" }
```

## Metrics explained

- **Peak amplitude**: Largest single peak-to-trough difference in the bin range (USD). Higher = more dramatic liquidity variation.
- **Average amplitude**: Mean of all detected oscillation amplitudes. Measures overall profile roughness.
- **Amplitude decay rate**: Exponential decay coefficient of peak values from the active bin outward (0-1). Higher = faster falloff.
- **Dominant wavelength**: Most common distance (in bins) between successive peaks. Reveals LP positioning periodicity.
- **Resonance count**: Number of detected repeating amplitude patterns. Multiple resonances suggest structured LP strategies.
- **Amplitude asymmetry**: Ratio of left-side to right-side average amplitudes (0 = right-dominant, 1 = symmetric, 2 = left-dominant).
- **Signal-to-noise ratio (SNR)**: Ratio of meaningful amplitude variations to random noise floor. Higher = more structured liquidity.
- **Amplitude score**: Composite health metric (0-100) combining decay rate, SNR, symmetry, and resonance stability.

## Safety notes

- **Read-only.** No transactions are submitted, no wallet or signing required.
- **Mainnet-only.** Bitflow HODLMM API does not support testnet.
- Pools with fewer than 5 populated bins produce unreliable metrics — flagged in output.

## Known constraints

- Read-only. No wallet or signing required.
- Scans bins within a fixed radius of the active bin (default +/-30).
- Resonance detection uses autocorrelation with minimum 3-bin wavelength.
- Amplitude decay assumes exponential model — may underfit non-monotonic profiles.
