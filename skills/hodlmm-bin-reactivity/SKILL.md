---
name: hodlmm-bin-reactivity
description: "Measures how intensely and rapidly HODLMM bin reserves respond to market stimuli. Computes per-bin response amplitude measuring the magnitude of reserve change relative to neighboring bins (stimulus-response ratio), activation energy estimating the minimum reserve threshold required before a bin participates in trading, chain reaction potential quantifying whether reserve changes in one bin propagate to adjacent bins through cascading redistribution, catalytic bin detection finding bins that amplify small perturbations into large reserve movements, inhibitor bin detection finding bins that absorb changes without propagating them, reaction order classifying whether response scales linearly or nonlinearly with stimulus size, equilibrium constant measuring the ratio of token-X to token-Y reserve adjustments (forward vs reverse reaction balance), Le Chatelier index scoring how strongly the system counteracts perturbations to restore equilibrium, and composite reactivity scoring."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-reactivity/hodlmm-bin-reactivity.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Reactivity Analyzer

## What it does

Measures how intensely and rapidly HODLMM bin reserves respond to market stimuli, treating each bin as a chemical reaction site where token-X and token-Y reserves undergo exchange reactions. For each pool, analyzes the bin-level reserve distribution to infer reactive behavior from the spatial pattern of reserves. Computes per-bin response amplitude measuring the magnitude of reserve density variation relative to neighbors (how strongly each bin "reacts" to its local environment), activation energy estimating the minimum reserve threshold a bin needs before it meaningfully participates in trading (bins below this threshold are effectively inert), chain reaction potential quantifying whether a reserve perturbation at one bin propagates outward through adjacent bins (measured by spatial autocorrelation of reserve gradients), catalytic bin detection finding bins where small reserves coincide with steep surrounding gradients (amplifiers that convert small inputs into large neighboring changes), inhibitor bin detection finding bins with high reserves but flat surrounding gradients (absorbers that dampen propagation), reaction order classifying whether the reserve distribution's response to distance from the active bin scales linearly, quadratically, or exponentially (first-order, second-order, or zero-order kinetics), equilibrium constant measuring the ratio of token-X to token-Y reserve density at each bin (the Keq of the local exchange reaction), Le Chatelier index scoring how strongly the overall distribution resists perturbation based on reserve uniformity and gradient smoothness, and a composite reactivity index.

## Why agents need it

Reactivity reveals whether a pool's liquidity is dynamically responsive or sluggishly inert. A pool with high reactivity index has bins that actively participate in price discovery — trades encounter responsive liquidity that adjusts across the bin range rather than sitting passively in a few concentrated positions. High chain reaction potential means changes propagate smoothly — a large trade that moves the active bin will find ready liquidity in neighboring bins rather than hitting dry zones. Catalytic bins are leverage points — small strategic additions there can have outsized effects on the pool's effective depth. Inhibitor bins are stability anchors — they absorb volatility but may also create barriers to efficient price movement. The equilibrium constant profile reveals directional bias in the pool's reserve composition — bins heavily skewed toward one token indicate persistent selling pressure for that token. Le Chatelier index measures the pool's self-healing tendency — high scores mean the reserve distribution naturally counteracts perturbations, providing reliable depth even during volatile periods. Together these metrics let agents assess whether a pool behaves like a well-catalyzed reaction (responsive, efficient, self-correcting) or a sluggish equilibrium (concentrated, unresponsive, fragile under stress).

## Commands

### doctor
Validates API connectivity and lists available analyses.

```bash
bun run skills/hodlmm-bin-reactivity/hodlmm-bin-reactivity.ts doctor
```

### run
Full reactivity analysis for selected pools. Reports response amplitude, activation energy, chain reaction potential, catalytic/inhibitor bins, reaction order, equilibrium constants, and ASCII reactivity profile.

```bash
bun run skills/hodlmm-bin-reactivity/hodlmm-bin-reactivity.ts run --top 3
bun run skills/hodlmm-bin-reactivity/hodlmm-bin-reactivity.ts run --pool 1
```

### status
Quick reactivity summary for the top 5 pools by TVL.

```bash
bun run skills/hodlmm-bin-reactivity/hodlmm-bin-reactivity.ts status
```

## Output contract

All outputs are JSON to stdout.

**Success:**

```json
{
  "result": "reactivity_analysis",
  "data": {
    "pools": [{ "poolId": 1, "pair": "sBTC/STX", "reactivityIndex": 62, "reactivityClass": "responsive", "chainReactionPotential": 0.73 }],
    "summary": { "poolsAnalyzed": 3, "avgReactivityIndex": 55 }
  }
}
```

**Error:**

```json
{ "error": "descriptive message" }
```

## Metrics explained

- **responseAmplitude**: Average magnitude of reserve density variation between adjacent bins, normalized by peak reserve. Higher values indicate more reactive (variable) liquidity placement.
- **activationEnergy**: Minimum reserve density (as fraction of peak) at which a bin meaningfully participates in the pool. Bins below this threshold are "inert" — present but too sparse to absorb meaningful trade volume.
- **chainReactionPotential**: Spatial autocorrelation of reserve gradients between adjacent bin pairs. High values (near 1) mean gradient directions are consistent — perturbations propagate smoothly. Low/negative values mean gradients alternate direction — perturbations are dampened.
- **chainReactionClass**: "propagating" (> 0.6), "mixed" (0.2-0.6), "dampened" (-0.2 to 0.2), "absorbing" (< -0.2).
- **catalyticBins**: Bins with below-median reserves but above-median surrounding gradient magnitude — small positions at steep transition zones that amplify perturbations.
- **inhibitorBins**: Bins with above-median reserves but below-median surrounding gradient magnitude — large stable positions that absorb changes.
- **reactionOrder**: How reserve density decays with distance from the active bin. "zero-order" = flat (constant decay), "first-order" = exponential decay, "second-order" = power-law decay. Determined by best R-squared fit.
- **equilibriumConstant**: Per-bin ratio of token-X to token-Y reserve value (Keq). Values > 1 indicate X-heavy composition, < 1 indicates Y-heavy.
- **keqSkew**: Overall directional bias — the median equilibrium constant across all bins. Persistent skew indicates systematic selling pressure for one token.
- **leChatelierIndex**: Composite score (0-100) measuring how strongly the distribution resists perturbation. Based on reserve uniformity, gradient smoothness, and bin participation rate. Higher = more self-correcting.
- **reactivityClass**: "inert" (index < 15), "sluggish" (15-30), "moderate" (30-50), "responsive" (50-70), "hyper-reactive" (> 70).
- **reactivityIndex**: Composite score (0-100). HIGHER means more responsive liquidity, smoother propagation, better equilibrium balance, and stronger self-correction.

## Safety notes

- Read-only skill. No wallet, signing, or funds required.
- All data is fetched from public on-chain contract reads and the Bitflow API.
- Does not execute any transactions or modify any state.
- Rate-limited by Hiro API. Avoid scanning more than 5 pools in rapid succession.
- No private keys or sensitive data are accessed.

## Known constraints

- Scans bins within a fixed radius of the active bin (default +/-30).
- Reactivity is inferred from the spatial snapshot of reserves, not from temporal event data — it measures the structural responsiveness of the current distribution, not historical reaction speed.
- Catalytic/inhibitor classification uses median thresholds — in pools with very few populated bins, the distinction becomes noisy.
- Equilibrium constant is undefined for bins with zero reserves on one side — these are excluded from Keq calculations.
- Chain reaction potential requires at least 5 gradient pairs for meaningful autocorrelation.
- Reaction order fitting assumes monotonic decay from the active bin — bimodal distributions may confuse the fit.
