---
name: hodlmm-bin-sublimation
description: "Detects direct phase transitions in HODLMM bin liquidity where bins jump between dormant and hyperactive states without passing through intermediate warming phases, computing sublimation rate (fraction of adjacent-bin transitions that skip two or more liquidity phases — in physics sublimation is the direct solid-to-gas transition bypassing liquid, and in DLMM bins this means liquidity jumps from near-zero to peak concentration without gradual buildup), phase distribution (proportion of bins in each of five liquidity phases: dormant/cool/warm/active/hyperactive — computed from quintile thresholds of the bin value distribution), bimodality index (ratio of extreme-phase bins to intermediate-phase bins — high bimodality means the pool has many dormant AND hyperactive bins with few in between, creating a two-phase landscape), sublimation edges (specific adjacent-bin pairs where phase jumps occur, with from/to phases, number of phases skipped, and USD energy delta — the sharpest edges represent the most extreme sublimation events), average phases skipped (mean number of intermediate phases bypassed per sublimation edge — ranges from 2 to 4 where 4 means dormant-to-hyperactive jumps), max phases skipped (largest single phase jump detected — 4 indicates at least one dormant-to-hyperactive or hyperactive-to-dormant transition), transition asymmetry (directional bias of sublimation: +1 means all transitions go upward from dormant toward hyperactive, -1 means all go downward — positive asymmetry suggests liquidity is being injected in bursts, negative suggests sudden withdrawals), sublimation energy (total USD value involved in all phase-skipping transitions — measures the capital magnitude of abrupt liquidity changes), phase gap (fraction of the bin landscape occupied by extreme phases vs intermediate — high gap means the pool lacks gradual liquidity gradients), phase separation (average phase distance between adjacent bins normalized to 0-1 — high separation means the bin landscape oscillates wildly between phases rather than transitioning smoothly), and a composite sublimation index scoring 0-100 combining rate, average skip, bimodality, phase gap, and phase separation, classifying pools as CONTINUOUS (smooth gradual transitions between liquidity levels — predictable depth profile), MIXED (some abrupt transitions but mostly gradual — moderate predictability), SUBLIMATING (frequent phase-skipping transitions with bimodal distribution — abrupt liquidity cliffs create slippage discontinuities), or STRONGLY_SUBLIMATING (dominant sublimation behavior with extreme bimodality — the pool is essentially two disconnected liquidity regimes separated by voids), with transition risk rated NONE/LOW/MODERATE/HIGH based on index, sublimation rate, and maximum phases skipped."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-sublimation/hodlmm-bin-sublimation.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Sublimation Analyzer

## What it does

Detects direct phase transitions in HODLMM bin reserve distributions where liquidity jumps abruptly between extreme states — dormant to hyperactive or vice versa — without passing through intermediate warming phases. In physics, sublimation is the direct transition from solid to gas bypassing the liquid phase entirely (dry ice evaporating without melting, frost disappearing from a window). Applied to DLMM liquidity bins, sublimation analysis asks: does the bin landscape have smooth gradual transitions between liquidity levels, or does it jump discontinuously between near-empty and heavily concentrated states?

The analyzer classifies each bin into one of five liquidity phases (dormant/cool/warm/active/hyperactive) using quintile thresholds derived from the full bin value distribution, then walks the ordered bin sequence detecting adjacent-bin pairs where the phase jumps by two or more levels. Each such "sublimation edge" represents a point where the liquidity landscape changes abruptly — a cliff where traders crossing from one bin to the next experience a sudden change in available depth. The analyzer computes the overall sublimation rate (what fraction of adjacent transitions skip phases), bimodality index (how strongly the distribution separates into just dormant + hyperactive), phase gap, phase separation, and transition asymmetry to build a comprehensive picture of how discontinuous the liquidity landscape is.

## Why agents need it

Smooth, continuous liquidity distributions produce predictable slippage curves — each additional unit of trade size costs incrementally more, and agents can estimate execution cost reliably. Sublimating distributions create cliff effects: a trade that routes through a hyperactive bin gets excellent execution, but the moment it spills into an adjacent dormant bin, slippage explodes. These discontinuities make trade sizing dangerous — the difference between a good fill and a terrible fill may be a few dollars of trade size.

For LP agents, sublimation reveals structural gaps in coverage. A pool with high sublimation index has liquidity concentrated in isolated pockets separated by voids. Placing new liquidity in the void (between a dormant and hyperactive bin) fills a structural gap and captures trades that would otherwise suffer cliff slippage — but the position is exposed because the surrounding bins provide no depth support. Conversely, adding to an existing hyperactive bin reinforces an already-deep pocket but doesn't improve the pool's overall continuity.

Transition asymmetry tells agents whether the pool is experiencing injection sublimation (positive — bursts of liquidity appearing in previously empty bins) or withdrawal sublimation (negative — concentrated positions being removed, creating sudden voids). Injection sublimation is often bullish for LP returns because it signals new capital entering the pool; withdrawal sublimation warns of departing liquidity that may cascade.

The bimodality index is the key structural metric. High bimodality means the pool operates as two disconnected regimes — pockets of deep liquidity separated by deserts of nothing. This is fundamentally different from a pool with low total TVL spread evenly (which has uniform shallow depth everywhere). A bimodal pool has SOME bins with excellent depth and others with none, creating a fragmented execution landscape that rewards precise routing and punishes naive market orders.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-sublimation/hodlmm-bin-sublimation.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-sublimation/hodlmm-bin-sublimation.ts status
```

### run
Fetches bin reserves for top pools (or a specific pool) and computes all sublimation metrics. Outputs a human-readable table plus JSON to stdout.
```bash
bun run hodlmm-bin-sublimation/hodlmm-bin-sublimation.ts run
bun run hodlmm-bin-sublimation/hodlmm-bin-sublimation.ts run --pool 1
bun run hodlmm-bin-sublimation/hodlmm-bin-sublimation.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgSublimationIndex": 42.6,
    "continuousCount": 1,
    "mixedCount": 1,
    "sublimatingCount": 2,
    "stronglySublimatingCount": 1,
    "noneCount": 1,
    "lowCount": 1,
    "moderateCount": 2,
    "highCount": 1,
    "avgSublimationRate": 0.18,
    "avgBimodality": 1.45,
    "avgPhaseGap": 0.42,
    "avgPhaseSeparation": 0.35
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "sublimationIndex": 55,
      "sublimationClass": "SUBLIMATING",
      "transitionRisk": "MODERATE",
      "sublimationRate": 0.22,
      "avgPhasesSkipped": 2.8,
      "maxPhasesSkipped": 4,
      "bimodalityIndex": 1.85,
      "transitionAsymmetry": 0.15,
      "sublimationEnergy": 4500.00,
      "phaseGap": 0.55,
      "phaseSeparation": 0.42,
      "phaseDistribution": {
        "dormant": 0.35,
        "cool": 0.05,
        "warm": 0.08,
        "active": 0.12,
        "hyperactive": 0.40
      },
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
- Phase thresholds are computed from the current bin value distribution — they are relative, not absolute. A "hyperactive" bin in a low-TVL pool may hold less USD than a "dormant" bin in a high-TVL pool.
- Sublimation edges only detect adjacent-bin transitions; non-adjacent phase jumps (across empty bins) are not counted because the intermediate bins have no liquidity data.
- Bimodality index uses a simple extreme-to-intermediate ratio; it does not distinguish between pools where dormant and hyperactive bins are spatially clustered vs interleaved.
- Transition asymmetry is a count-based metric (not energy-weighted); a single large dormant-to-hyperactive jump counts the same as a small one.
- Phase classification uses quintile thresholds, so exactly 20% of bins fall in each phase by construction. The interesting signal is in the spatial arrangement, not the phase proportions of populated bins.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
- Read-only; does not reflect pending mempool transactions.
