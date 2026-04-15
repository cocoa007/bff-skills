---
name: hodlmm-bin-advection
description: "Analyzes net directional transport of reserves across HODLMM bin boundaries using fluid dynamics advection theory, computing advective flux (product of local velocity and reserve density), Peclet number (ratio of advective to diffusive transport), Courant number (CFL stability criterion), advective acceleration (rate of change of flux), material derivative (Lagrangian reserve change rate), stagnation points (flux zero-crossings), CFL index (fraction of supercritical bins), upwind bias (buy-side vs sell-side directional dominance), advective-diffusion ratio (decomposition of total transport), and a composite advection index scoring directional transport coherence from 0 to 100."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-advection/hodlmm-bin-advection.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Advection Analyzer

## What it does

Analyzes the net directional transport of reserves across HODLMM bin boundaries using concepts from fluid dynamics advection theory. In fluid mechanics, advection describes how a scalar quantity (heat, concentration, mass) is carried along by the bulk velocity field — as opposed to diffusion, which spreads it isotropically in all directions. Applied to on-chain DLMM liquidity, reserves do not just spread randomly across bins; they get carried directionally by trading flow. The reserve gradient across bins defines a velocity field, and the product of that velocity with the local reserve density is the advective flux — the rate and direction at which liquidity is being transported.

For each pool, the analyzer computes: advective flux measuring the net signed transport of reserves across bin boundaries (positive = buy-side sweep toward higher bins, negative = sell-side sweep toward lower bins); Peclet number quantifying the ratio of advective transport to diffusive transport — high Pe (>2) means bulk flow dominates and reserves are being carried in a coherent direction, low Pe means isotropic spreading governs and no clear directional signal exists; Courant number computing the ratio of advective velocity to bin spacing as the fluid-dynamics CFL stability criterion — when Co>1, reserves are transported faster than one bin per step, creating numerical discontinuities analogous to reserves "teleporting" across bins in a single trade event; advective acceleration measuring the spatial rate of change of advective flux, detecting whether directional transport is intensifying downstream or decaying; material derivative combining the local accumulation rate and advective transport into a Lagrangian perspective — the total rate of reserve change experienced by a fluid parcel moving with the flow field; stagnation points identifying bins where the advective flux crosses zero, marking convergence points (where flow meets and piles up) or divergence points (where flow separates and thins out); advective CFL index computing the fraction of bins where transport velocity exceeds the bin-width threshold, revealing how widespread the instability is across the distribution; upwind bias measuring the asymmetry of advective flux between bins above and below the active bin, revealing whether buy-side or sell-side flow is dominating the directional transport; advective-diffusion ratio decomposing total reserve variance into the fraction attributable to directional advective transport versus isotropic diffusive spreading; and a composite advection index scoring 0-100 combining flux magnitude, Peclet dominance, CFL stability, stagnation count, and directional bias coherence.

## Why agents need it

Advection analysis reveals the directional momentum embedded in a pool's reserve distribution — information invisible to symmetric metrics like TVL or spread. When Pe>2, reserves are being actively swept in one direction by trading flow, meaning LP positions on the trailing side will deplete rapidly while the leading side accumulates. The Courant number and CFL index warn of structural instability: when advective transport exceeds bin-resolution, the reserve field develops discontinuities that can trigger sudden imbalances. Stagnation points identify where flow converges (reserve accumulation, potential congestion) or diverges (reserve thinning, potential gaps). The upwind bias directly answers "is this pool being swept buy-side or sell-side?" — essential for LP entry/exit timing and hedging direction. The material derivative gives the Lagrangian rate of change any LP position will experience as it moves with the flow. Together, these metrics give agents a directional intelligence layer missing from all static reserve analyses.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-advection/hodlmm-bin-advection.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-advection/hodlmm-bin-advection.ts status
```

### run
Fetches bin reserves for top pools (or a specific pool) and computes all advection metrics. Outputs a human-readable table plus JSON to stdout.
```bash
bun run hodlmm-bin-advection/hodlmm-bin-advection.ts run
bun run hodlmm-bin-advection/hodlmm-bin-advection.ts run --pool 1
bun run hodlmm-bin-advection/hodlmm-bin-advection.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgAdvectionIndex": 47.2,
    "advectionDominated": 3,
    "unstableCFL": 1,
    "buySideBiased": 2,
    "sellSideBiased": 1
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "advectionIndex": 72,
      "advectionClass": "ACTIVE-ADVECTION",
      "advectiveFlux": 143.22,
      "fluxDirection": "buy-side",
      "pecletNumber": 4.81,
      "pecletClass": "mixed-advective",
      "courantNumber": 0.34,
      "courantClass": "stable",
      "stagnationCount": 2,
      "upwindBias": 0.38,
      "upwindClass": "mild-buy",
      "advDiffRatio": 0.61,
      "cflIndex": 0.0,
      "tvlUsd": 120000
    }
  ]
}
```

**Error:**
```json
{ "error": "Pool #99 not found" }
```

## Known constraints

- Requires at least 5 populated bins within ±30 of active bin; pools with sparse distributions are skipped.
- Velocity field is derived from the spatial reserve gradient (finite differences) — this is a proxy for trading velocity, not a direct on-chain measurement.
- Peclet and Courant numbers are normalized by mean reserve density; absolute magnitudes vary across pools.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
- Read-only; does not reflect pending mempool transactions.
