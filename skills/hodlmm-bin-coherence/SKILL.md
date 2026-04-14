---
name: hodlmm-bin-coherence
description: "Measures reserve coherence between adjacent HODLMM bins — pairwise correlation, coherence zones, fragmentation index, directional asymmetry, coherence decay, and composite scoring."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-coherence/hodlmm-bin-coherence.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Coherence Analyzer

## What it does

Measures how coherently adjacent bins' reserves move together in HODLMM DLMM pools. Treats the bin reserve profile as a signal and computes pairwise Pearson correlations between adjacent bin windows. Extracts: pairwise coherence between every adjacent bin pair, contiguous zones where coherence stays high, a fragmentation index showing what fraction of transitions are low-coherence, directional coherence on each side of the active bin, coherence decay rate from the active bin outward, and a composite coherence score.

## Why agents need it

Bin coherence reveals whether a pool's liquidity is coordinated or fragmented. High coherence means adjacent bins have similar reserve profiles — suggesting algorithmic LPs, scheduled rebalancing, or structured market-making. Low coherence (fragmentation) means each bin behaves independently — a sign of opportunistic, manual, or chaotic LP behavior. Fragmented pools may have hidden depth gaps that cause unexpected slippage. Coherence zones identify where the pool is most stable and predictable. Directional asymmetry reveals whether coordination is stronger on the buy or sell side, hinting at LP directional bias.

## Commands

### doctor
Validates API connectivity and lists available coherence analyses.

```bash
bun run skills/hodlmm-bin-coherence/hodlmm-bin-coherence.ts doctor
```

### run
Full coherence analysis for selected pools. Reports pairwise coherences, zones, fragmentation, directional metrics, decay, score, and ASCII coherence map.

```bash
bun run skills/hodlmm-bin-coherence/hodlmm-bin-coherence.ts run --top 3
bun run skills/hodlmm-bin-coherence/hodlmm-bin-coherence.ts run --pool 1
```

### status
Quick coherence summary for the top 5 pools by TVL.

```bash
bun run skills/hodlmm-bin-coherence/hodlmm-bin-coherence.ts status
```

## Output contract

All outputs are JSON to stdout.

**Success:**

```json
{
  "result": "coherence_analysis",
  "data": {
    "pools": [{ "poolId": 1, "pair": "sBTC/STX", "profile": { "coherenceScore": 72, "avgPairwiseCoherence": 0.65, "fragmentationIndex": 0.12 } }],
    "summary": { "poolsAnalyzed": 3, "avgCoherenceScore": 68 }
  }
}
```

**Error:**

```json
{ "error": "descriptive message" }
```

## Metrics explained

- **avgPairwiseCoherence**: Mean Pearson correlation between adjacent bin sliding windows (-1 to 1). Higher = bins move together.
- **medianPairwiseCoherence**: Median of pairwise coherences. Robust to outlier bins.
- **coherenceZones**: Contiguous bin ranges where coherence >= 0.7. Width = number of bins in zone.
- **zoneCount**: Number of high-coherence zones. More zones = more structured LP distribution.
- **avgZoneWidth**: Average width (bins) of coherence zones. Wider = broader coordinated regions.
- **fragmentationIndex**: Fraction of adjacent bin transitions where coherence < 0.3 (0 = no fragmentation, 1 = fully fragmented).
- **fragmentedTransitions**: Raw count of low-coherence transitions.
- **leftCoherence**: Average pairwise coherence below the active bin (bearish/sell side).
- **rightCoherence**: Average pairwise coherence above the active bin (bullish/buy side).
- **directionalAsymmetry**: leftCoherence / rightCoherence. >1 = left-dominant, <1 = right-dominant, ~1 = balanced.
- **coherenceDecayRate**: How fast coherence magnitude decays with distance from active bin (0-1). Higher = faster decay.
- **coherenceDecayR2**: R² of exponential fit to coherence decay. Higher = more orderly decay behavior.
- **coherenceScore**: Composite health metric (0-100) combining all above metrics.

## Safety notes

- **Read-only.** No transactions are submitted, no wallet or signing required.
- **Mainnet-only.** Bitflow HODLMM API does not support testnet.
- Pools with fewer than 5 populated bins produce unreliable metrics — flagged in output.

## Known constraints

- Read-only. No wallet or signing required.
- Scans bins within a fixed radius of the active bin (default +/-30).
- Pairwise coherence uses a sliding window of 5 bins; short windows may produce noisy results near bin boundaries.
- Coherence decay assumes exponential model — may underfit non-monotonic profiles.
- Pools with very few populated bins (<5) will have limited coherence signal.
