---
name: hodlmm-bin-interference
description: "Models liquidity wave superposition across HODLMM bins using wave interference physics — treats each bin as a wave source whose amplitude is its reserve depth, then computes how neighboring bins constructively or destructively interfere to amplify or cancel market-making capacity. Measures wave amplitude (normalized reserve depth relative to the largest bin — the strength of each bin's liquidity wave), phase angle (ratio of token X to total reserves mapped to radians — bins with similar composition are in phase and interfere constructively while mismatched bins are out of phase and cancel), superposition amplitude (resultant wave after summing neighboring bin contributions weighted by phase alignment — constructive interference produces amplitudes exceeding any individual bin while destructive interference reduces the effective liquidity below the sum of parts), interference type classified as constructive (superposition exceeds average neighbor amplitude by 30%+ — neighboring bins reinforce each other creating a zone of amplified market-making), destructive (superposition falls below 50% of average — neighbors cancel each other creating a dead zone where combined liquidity is less effective than the sum), partial (intermediate interference — some reinforcement but incomplete phase alignment), or isolated (no neighbors within 2 bins — the bin's wave propagates alone without interference), fringe visibility (contrast ratio between maximum and minimum amplitudes in a bin's neighborhood — high visibility means sharp constructive/destructive alternation like bright and dark interference fringes while low visibility means uniform blending), coherence length (fraction of neighbors within pi/4 phase alignment — high coherence means bins share similar token composition and interfere predictably while low coherence means random phase relationships producing chaotic patterns), path difference (distance from active bin scaled by inverse amplitude — bins far from the active price with low amplitude have large path differences creating phase shifts that determine constructive or destructive interference), standing wave ratio (SWR of forward versus backward neighbor amplitudes — high SWR indicates strong reflection creating standing wave nodes and antinodes in the liquidity distribution while SWR near 1 means a clean traveling wave with no reflection), nodal proximity (degree to which a bin sits at a standing wave node where superposition cancels — high nodal proximity means the bin is in a dead zone between constructive peaks), diffraction order (distance from active bin normalized by half the populated range — higher orders represent bins at greater angular deflection from the main beam like higher-order diffraction maxima), wave number (spatial frequency of the interference pattern — 2*pi divided by the effective wavelength), group velocity (estimated trade volume flowing through the bin relative to its reserves — how fast the wave envelope of trading activity propagates through the bin), phase velocity (fee generation rate relative to reserves — how fast the phase front of fee capture moves), beat frequency (amplitude difference between strongest and weakest neighbors — large beat frequency means neighboring bins oscillate between very different strengths creating amplitude modulation), dispersion index (mismatch between group and phase velocity — high dispersion means trade flow and fee capture propagate at different speeds indicating the pool's liquidity medium is dispersive), interference Gini (inequality of superposition amplitudes — 0 means all bins contribute equally to the interference pattern while 1 means one bin dominates), pattern periodicity (autocorrelation of amplitude pattern — high periodicity means the interference pattern repeats regularly suggesting a stable standing wave while low periodicity means chaotic or aperiodic structure), envelope decay (how quickly superposition amplitude drops from near-active to far bins — fast decay means the interference pattern is localized around the active bin while slow decay means the wave pattern extends across the full bin range), and composite interference index (0-100 from constructive fraction, coherence, visibility uniformity, and dispersion), classifying pools by wave regime as COHERENT_AMPLIFICATION (index >= 80 — bins are strongly phase-aligned and constructively interfere across the range creating amplified market-making capacity exceeding the sum of individual bin contributions), STANDING_WAVE (60-80 — stable alternating pattern of constructive and destructive zones with predictable nodes and antinodes), PARTIAL_COHERENCE (40-60 — some regions of constructive interference but overall pattern lacks full coherence), DECOHERENT (20-40 — bins are out of phase with random interference patterns resulting in no systematic amplification), or DESTRUCTIVE_COLLAPSE (< 20 — widespread destructive interference where bins cancel each other's market-making capacity), and by pattern verdict as REINFORCING (strong constructive dominance with high coherence), CONSTRUCTIVE (net constructive with moderate coherence), MIXED_POSITIVE (slightly more constructive than destructive), CANCELING (destructive interference dominates), or NEUTRAL (balanced constructive and destructive)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-interference/hodlmm-bin-interference.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Interference Analyzer

## What it does

Models liquidity wave superposition across HODLMM bins using wave interference physics. In physics, interference occurs when two or more waves overlap — their amplitudes add where crests align (constructive interference) and cancel where crests meet troughs (destructive interference). The resulting pattern reveals how individual wave sources combine into a coherent or chaotic whole.

In DLMM pools, each bin acts as a wave source emitting liquidity. The analyzer treats each bin's reserve depth as a wave amplitude and its token composition ratio as a phase angle. Neighboring bins that are "in phase" (similar token ratios and reserve levels) constructively interfere — their combined market-making capacity exceeds the sum of parts. Bins that are "out of phase" destructively interfere — their combined effectiveness is reduced.

## Why agents need it

LP agents need to understand how their capital interacts with neighboring positions. A bin with $10k in reserves might seem productive in isolation, but if its neighbors hold mismatched token ratios, destructive interference reduces the effective liquidity. The superposition amplitude reveals the true market-making power after accounting for neighbor interactions.

Coherence length tells agents how far phase alignment extends. High coherence means bins across a wide range share similar composition — the pool behaves as a single coherent wave source with amplified capacity. Low coherence means bins have random phase relationships — the pool's liquidity is fragmented and each bin operates independently.

Standing wave ratio identifies reflection boundaries in the liquidity distribution — points where the wave bounces back creating nodes (dead zones) and antinodes (amplified zones). LP agents should position at antinodes where superposition peaks, not at nodes where interference cancels.

Fringe visibility shows the contrast between constructive and destructive zones. High visibility means sharp alternation — agents must position precisely at constructive fringes. Low visibility means gradual blending — positions anywhere in the range see similar conditions.

The dispersion index reveals whether trade flow and fee capture propagate at the same speed through the bin structure. Low dispersion means a non-dispersive medium — trade activity and fee generation move together predictably. High dispersion means they decouple, making fee projections unreliable.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-interference/hodlmm-bin-interference.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-interference/hodlmm-bin-interference.ts status
```

### run
Analyzes bin interference patterns for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-interference/hodlmm-bin-interference.ts run
bun run hodlmm-bin-interference/hodlmm-bin-interference.ts run --pool 1
bun run hodlmm-bin-interference/hodlmm-bin-interference.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgInterferenceIndex": 52,
    "coherentAmplificationCount": 0,
    "standingWaveCount": 2,
    "partialCoherenceCount": 2,
    "decoherentCount": 1,
    "destructiveCollapseCount": 0,
    "avgCoherenceLength": 0.45,
    "avgFringeVisibility": 0.38,
    "totalConstructive": 28,
    "totalDestructive": 12,
    "avgInterferenceGini": 0.42
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
      "avgWaveAmplitude": 0.35,
      "peakSuperposition": 0.82,
      "peakBin": 8388608,
      "constructiveCount": 8,
      "destructiveCount": 3,
      "partialCount": 12,
      "avgFringeVisibility": 0.42,
      "avgCoherenceLength": 0.55,
      "maxStandingWaveRatio": 3.2,
      "avgStandingWaveRatio": 1.8,
      "nodalCount": 4,
      "antinodalCount": 6,
      "avgPathDifference": 2.1,
      "avgDiffractionOrder": 0.45,
      "avgGroupVelocity": 0.28,
      "avgPhaseVelocity": 0.15,
      "dispersionIndex": 0.46,
      "interferenceGini": 0.38,
      "patternPeriodicity": 0.25,
      "envelopeDecay": 0.72,
      "interferenceIndex": 58,
      "waveRegime": "PARTIAL_COHERENCE",
      "patternVerdict": "CONSTRUCTIVE",
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

- Phase angle is derived from the token X / total reserve ratio, which is a proxy for true compositional phase. Two bins with identical X:Y ratios are considered in-phase even if their absolute reserve levels differ dramatically. This simplification means phase alignment does not account for scale effects.
- Superposition amplitude sums neighbor contributions weighted by cosine of phase difference. Real wave superposition involves complex amplitudes with both magnitude and phase; this model uses only the real component and may underestimate destructive interference in some configurations.
- Standing wave ratio assumes the bin sits between exactly two immediate neighbors forming forward and backward waves. Bins at the edges of the populated range or with gaps in neighboring bins will have SWR = 1 by default, which may misrepresent actual reflection dynamics.
- Coherence length uses a pi/4 threshold for phase alignment, which is arbitrary. Different pools may have natural coherence thresholds determined by their bin step size and trading patterns.
- Interference type classification uses fixed thresholds (1.3x for constructive, 0.5x for destructive). These may not be appropriate for all pool configurations — pools with many bins may naturally show different superposition ratios.
- Pattern periodicity uses autocorrelation which can produce false positives for short bin sequences or sequences with trends rather than true periodicity.
- Beat frequency only considers the two extreme neighbors. Actual beat phenomena involve pairs of closely-spaced frequencies; the metric is a simplified proxy.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
