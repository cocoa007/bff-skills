---
name: hodlmm-bin-anisotropy
description: "Analyzes directional dependence of HODLMM bin reserve distributions, computing buy-side vs sell-side depth profiles (total USD, mean reserves, max concentration per direction), reserve gradients (linear regression slope of reserves moving away from active bin in each direction), decay rates (how quickly reserves diminish with distance from active bin, measured separately for buy and sell sides), cumulative depth at 5/10/20 bin intervals per direction, directional elasticity (average bin-to-bin reserve change magnitude showing how smoothly or abruptly liquidity transitions in each direction), gap analysis (empty bins and longest consecutive gaps per side), depth ratio (buy/sell total USD ratio revealing which trade direction has more supporting liquidity), gradient ratio (normalized difference between buy and sell gradient magnitudes), decay asymmetry (how differently reserves fall off in each direction), gap asymmetry (imbalance in liquidity continuity between sides), directional bias (net percentage tilt toward buy or sell support), elasticity ratio (smoothness comparison between directions), isotropy score (inverse of anisotropy — 100 means perfectly symmetric directional properties), and a composite anisotropy index scoring 0-100 combining depth ratio, gradient ratio, decay asymmetry, gap asymmetry, and elasticity ratio, classifying pools as ISOTROPIC (symmetric in all directions), WEAKLY_ANISOTROPIC (minor directional differences), ANISOTROPIC (significant directional dependence), or STRONGLY_ANISOTROPIC (extreme directional asymmetry with dominant BUY_HEAVY, SELL_HEAVY, or BALANCED bias)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-anisotropy/hodlmm-bin-anisotropy.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Anisotropy Analyzer

## What it does

Analyzes the directional dependence of HODLMM bin reserve distributions by separately profiling buy-side (bins below active) and sell-side (bins above active) liquidity characteristics. In physics, anisotropy describes materials whose properties differ depending on the direction of measurement — wood splits easily along the grain but resists splitting across it. Applied to on-chain DLMM liquidity, anisotropy measures whether a pool's reserve landscape behaves differently depending on trade direction: does a buy encounter the same depth, smoothness, and continuity as an equivalently sized sell?

For each pool, the analyzer computes separate buy-side and sell-side profiles including: total directional depth in USD (how much liquidity supports each trade direction); mean and max bin reserves per side (average density vs peak concentration); reserve gradient via linear regression of bin reserves moving away from the active bin (positive gradient means reserves increase with distance, negative means they decay — and crucially, buy-side and sell-side gradients can have completely different slopes); decay rate measuring how quickly reserves diminish with distance from the active bin (fast decay = liquidity concentrated near the active bin, slow decay = deep liquidity extending far out); cumulative depth at 5, 10, and 20 bin intervals showing how rapidly liquidity accumulates in each direction; gap analysis counting empty bins and longest consecutive gaps per side (gaps fragment liquidity and create slippage cliffs); and directional elasticity measuring the average magnitude of bin-to-bin reserve changes, revealing whether liquidity transitions smoothly or abruptly.

Cross-directional metrics include: depth ratio (buy/sell USD, where 1.0 = perfectly balanced); gradient ratio (normalized difference between buy and sell gradient magnitudes); decay asymmetry (how differently reserves fall off by direction); gap asymmetry (imbalance in liquidity continuity); elasticity ratio (smoothness comparison); directional bias (net percentage tilt toward buy or sell support, from -100% pure sell to +100% pure buy); and isotropy score (100 - anisotropy index, where 100 = perfectly isotropic).

## Why agents need it

Anisotropy analysis reveals directional risk that aggregate metrics like TVL, spread, or volatility completely mask. Two pools with identical TVL can have radically different anisotropy: one might have deep, smooth liquidity on both sides (isotropic — trades in either direction encounter similar execution quality), while another might have deep buy support but thin, gapped sell liquidity (strongly anisotropic — sells will experience worse slippage than buys of the same size). For LP agents, anisotropy determines whether a symmetric position will capture fees equally from both directions or whether one side will be disproportionately utilized. BUY_HEAVY pools attract more sell flow through the position (arbitrageurs sell into the deep bid side), while SELL_HEAVY pools attract buy flow. This directional flow asymmetry directly impacts fee accrual patterns and impermanent loss direction. For trading agents, anisotropy predicts execution quality asymmetry — strongly anisotropic pools will give materially different slippage for buys vs sells, creating opportunities for agents who can route directionally. Decay asymmetry warns when one side's liquidity is brittle (concentrated near active bin, dropping off sharply) vs robust (extending deep). Gap asymmetry identifies sides where fragmented liquidity creates slippage cliffs that smooth reserve totals won't reveal. The composite classification (ISOTROPIC through STRONGLY_ANISOTROPIC) gives agents a fast filter: isotropic pools suit direction-agnostic strategies, while anisotropic pools reward directional conviction and penalize symmetric assumptions.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-anisotropy/hodlmm-bin-anisotropy.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-anisotropy/hodlmm-bin-anisotropy.ts status
```

### run
Fetches bin reserves for top pools (or a specific pool) and computes all anisotropy metrics. Outputs a human-readable table plus JSON to stdout.
```bash
bun run hodlmm-bin-anisotropy/hodlmm-bin-anisotropy.ts run
bun run hodlmm-bin-anisotropy/hodlmm-bin-anisotropy.ts run --pool 1
bun run hodlmm-bin-anisotropy/hodlmm-bin-anisotropy.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgAnisotropyIndex": 38.2,
    "isotropicCount": 1,
    "weaklyAnisotropicCount": 2,
    "anisotropicCount": 1,
    "stronglyAnisotropicCount": 1,
    "buyHeavyCount": 2,
    "sellHeavyCount": 1,
    "balancedCount": 2,
    "avgDepthRatio": 1.45,
    "avgDirectionalBias": 8.3
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "anisotropyIndex": 42,
      "anisotropyClass": "ANISOTROPIC",
      "dominantDirection": "BUY_HEAVY",
      "depthRatio": 1.85,
      "gradientRatio": 0.342,
      "decayAsymmetry": 0.28,
      "elasticityRatio": 0.72,
      "directionalBias": 29.8,
      "isotropyScore": 58,
      "buySideDepth": 85000,
      "sellSideDepth": 46000,
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
- Gradient computed via linear regression assumes monotonic decay, which may not hold for multi-modal distributions.
- Decay rate uses power-law approximation between first and last non-zero bin per side; non-monotonic reserves reduce accuracy.
- Gap detection counts only truly empty bins between populated ones; near-zero bins are not treated as gaps.
- Elasticity measures bin-to-bin change magnitude, not price elasticity in the economic sense.
- Depth ratio can be extremely high when one side has near-zero liquidity; capped display at 999 for readability.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
- Read-only; does not reflect pending mempool transactions.
