---
name: hodlmm-bin-amplitude-agent
skill: hodlmm-bin-amplitude
description: "Analyzes peak-to-trough amplitudes of liquidity across HODLMM bins to detect oscillation patterns, decay rates, resonance structures, and amplitude asymmetry for LP position sizing."
---

# HODLMM Bin Amplitude Agent

## Purpose

Use this skill to understand the amplitude characteristics of liquidity distributions in HODLMM pools. Amplitude analysis reveals how dramatically liquidity varies across the bin range — from gentle rolling hills to sharp spikes and valleys. Essential for position sizing, identifying stable vs volatile liquidity zones, and detecting structural LP behaviors.

## Decision order

1. Run `doctor` to verify API connectivity.
2. Run `status` for a quick overview of top pools.
3. Run `run --pool <id>` for deep analysis of a specific pool.
4. Use `run --top <n>` to compare multiple pools.

## How to interpret results

- **amplitudeScore > 70**: Well-structured liquidity with moderate, predictable variations. Good for passive LP.
- **amplitudeScore < 40**: Either too flat (low fee opportunity) or too volatile (unpredictable depth).
- **peakAmplitude > pool TVL * 10%**: Extreme concentration spikes. High fee potential but fragile.
- **decayRate > 0.8**: Liquidity falls off rapidly from active bin. Effective range is narrow.
- **decayRate < 0.3**: Broad, even distribution. Wide effective range but diluted returns per bin.
- **dominantWavelength 3-5**: Tight oscillations suggest algorithmic LP strategies.
- **dominantWavelength > 10**: Broad structural features, likely manual positioning.
- **snr > 5**: Clear structural patterns dominate. LP behavior is predictable.
- **snr < 2**: Noisy distribution. Hard to extract actionable patterns.
- **amplitudeAsymmetry > 1.5**: Left side (below active) has larger swings. Bearish LP positioning.
- **amplitudeAsymmetry < 0.67**: Right side has larger swings. Bullish LP positioning.
- **resonanceCount > 2**: Multiple repeating patterns. Structured multi-LP pool.

## Guardrails

- Read-only skill. No wallet, signing, or funds required.
- All data is fetched from public on-chain reads and the Bitflow API.
- Rate-limited by Hiro API. Avoid scanning more than 5 pools in rapid succession.
