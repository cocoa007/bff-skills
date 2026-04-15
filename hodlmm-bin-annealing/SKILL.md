---
name: hodlmm-bin-annealing
description: "Measures how well a HODLMM pool's liquidity distribution has annealed into an optimal configuration vs. remaining in a stressed or quenched state, computing configurational energy (RMS deviation of actual bin reserves from the pool average — measures total disorder in the distribution; high energy means reserves are wildly uneven, low energy means reserves are uniformly distributed), optimal energy (RMS deviation of an ideal Gaussian distribution centered on the active bin — the reference minimum-energy state that maximizes depth around the trading price while tapering smoothly outward), excess energy (fraction of configurational energy above the optimal baseline — the gap between actual disorder and irreducible disorder; 0 means the pool has reached its theoretical optimum, 1 means all disorder is excess), temperature (composite measure of how far from equilibrium the pool sits — combines excess energy, surface roughness, and gap fraction; pools with high temperature are actively being reconfigured or have been left in a disordered state after rapid changes), roughness (average absolute difference between adjacent bins normalized by pool average — measures how jagged the reserve curve is; smooth distributions have low roughness, distributions with sharp spikes and drops have high roughness), smoothness (1 minus roughness — the fraction of theoretical maximum smoothness achieved; ANNEALED pools typically score 0.8+), peak-to-valley ratio (ratio of largest bin to smallest bin — extreme ratios indicate concentration rather than distribution; well-annealed pools have ratios under 10, quenched pools may exceed 100), stress hotspots (bins where the average of left and right reserve differences exceeds 1.5x pool average — localized points of high configurational stress where the distribution has sharp discontinuities), gap count and fraction (empty bins within the populated range — gaps are lattice defects in the liquidity structure; annealed distributions minimize gaps, quenched distributions may have many), symmetry score (balance of total reserves on each side of the active bin — 1.0 means perfectly symmetric depth, 0.0 means all liquidity is on one side; asymmetry indicates directional bias in LP positioning), center of mass offset (the USD-weighted average bin position minus the active bin — positive means liquidity mass sits above the trading price, negative means below; large offsets suggest the distribution hasn't relaxed to center on the current price), Boltzmann fit (overlap between actual and optimal Gaussian distribution — measures how closely the pool approximates thermal equilibrium; 1.0 means perfect Boltzmann distribution, 0.0 means no resemblance), and a composite annealing index scoring 0-100 combining smoothness, Boltzmann fit, symmetry, gap penalty, stress penalty, and energy efficiency, classifying pools as QUENCHED (rapidly cooled with frozen-in disorder — the distribution was set or disrupted quickly and never relaxed, leaving high excess energy, rough surfaces, and stress hotspots; like metal quenched in cold water, the structure retains whatever configuration it had at high temperature), STRESSED (significant configurational tension — the distribution has some structure but contains hotspots, asymmetry, or gaps that prevent relaxation to equilibrium; like a material under load that hasn't yet yielded or crept to a lower-energy state), TEMPERING (actively relaxing toward equilibrium — moderate excess energy with improving smoothness and fit; the pool is in transition between disorder and order, analogous to a tempering process where controlled reheating allows stress relief without full re-melting), or ANNEALED (near-optimal low-energy configuration — smooth reserve curve closely matching the Boltzmann distribution, minimal stress hotspots, good symmetry, few gaps; the pool has reached or nearly reached its ground state through gradual LP adjustment), with energy state rated GROUND_STATE (temperature < 0.15 — minimal excess energy, distribution is at or near its theoretical minimum), LOW_ENERGY (temperature 0.15-0.4 — some residual disorder but the pool is thermally stable), EXCITED (temperature 0.4-0.7 — significant excess energy, distribution is actively evolving or recently disrupted), or SUPERHEATED (temperature > 0.7 — extreme disorder, the pool's distribution is far from any stable configuration and may be undergoing rapid restructuring)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-annealing/hodlmm-bin-annealing.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Annealing State Analyzer

## What it does

Measures how well a HODLMM pool's liquidity distribution has "annealed" into an optimal, low-energy configuration. In metallurgy and materials science, annealing is the process of heating a material and then slowly cooling it, allowing atoms to migrate to lower-energy positions and relieve internal stresses. The result is a more ordered, less brittle structure. Quenching — rapid cooling — freezes the material in a high-energy, disordered state with residual stress.

In DLMM pools, the "material" is the liquidity distribution across bins. An annealed pool has reserves that taper smoothly outward from the active bin, following a Boltzmann-like distribution — concentrated where trading happens, gradually thinning toward the edges. A quenched pool has reserves frozen in a disordered pattern: random spikes, gaps, asymmetries, and stress hotspots where adjacent bins have wildly different reserves.

The analyzer computes the pool's configurational energy (how far the distribution deviates from uniform), compares it to the minimum achievable energy (a Gaussian centered on the active bin), and measures the excess — the energy that could be released if LPs repositioned optimally. It then maps surface roughness, gap defects, symmetry, and Boltzmann distribution fit to produce a composite annealing index.

## Why agents need it

A pool's annealing state reveals the structural quality of its liquidity, not just the quantity. Two pools with identical TVL can have vastly different execution quality depending on how that TVL is distributed.

ANNEALED pools provide predictable, smooth execution. Trades of increasing size encounter gradually increasing slippage with no sudden jumps. LP positions earn fees proportional to their proximity to the active bin. The distribution is self-consistent — it reflects an equilibrium where LPs have collectively settled into optimal positions.

QUENCHED pools are structurally brittle. The distribution has sharp discontinuities, gaps, and concentration spikes. A moderate-sized trade may encounter unexpectedly thin depth in a gap, then hit a wall of liquidity in the next bin. Fee distribution is uneven — some bins earn disproportionately while nearby bins earn nothing. LP entry is risky because the structural context is unpredictable.

STRESSED and TEMPERING pools are in transition. They may be evolving toward a better configuration (LPs actively repositioning) or degrading from a previously annealed state (major LP withdrawal disrupting the smooth curve). The temperature metric distinguishes between pools that are cooling toward equilibrium vs. pools that are heating up from disruption.

The center-of-mass offset reveals whether the distribution has relaxed to center on the current price. A large offset means the bulk of liquidity was positioned for a different price level and hasn't been rebalanced — like a material whose internal stress field doesn't match its current loading conditions.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-annealing/hodlmm-bin-annealing.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-annealing/hodlmm-bin-annealing.ts status
```

### run
Analyzes annealing state for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-annealing/hodlmm-bin-annealing.ts run
bun run hodlmm-bin-annealing/hodlmm-bin-annealing.ts run --pool 1
bun run hodlmm-bin-annealing/hodlmm-bin-annealing.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgAnnealingIndex": 52.4,
    "annealedCount": 1,
    "temperingCount": 2,
    "stressedCount": 1,
    "quenchedCount": 1,
    "groundStateCount": 1,
    "lowEnergyCount": 2,
    "excitedCount": 1,
    "superheatedCount": 1,
    "avgSmoothness": 0.72,
    "avgBoltzmannFit": 0.61,
    "avgSymmetry": 0.68,
    "totalStressHotspots": 8
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "activeBin": 8388608,
      "binsAnalyzed": 25,
      "totalUsd": 140000,
      "configEnergy": 12500,
      "optimalEnergy": 8200,
      "excessEnergy": 0.344,
      "temperature": 0.42,
      "roughness": 0.35,
      "smoothness": 0.65,
      "peakToValleyRatio": 8.5,
      "stressHotspots": 3,
      "gapCount": 2,
      "gapFraction": 0.074,
      "symmetryScore": 0.78,
      "centerOfMass": 8388610.5,
      "centerOfMassOffset": 2.5,
      "boltzmannFit": 0.62,
      "annealingIndex": 58,
      "annealingClass": "TEMPERING",
      "annealingState": "EXCITED",
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

- Optimal distribution assumes Gaussian centered on active bin with sigma = bins/4. This is a modeling choice — real optimal distributions depend on expected volatility and fee tier, which are not factored in.
- Roughness is normalized by pool average, not by local density. A rough distribution in a low-TVL region contributes equally to one in a high-TVL region.
- Gap detection counts empty bins within the populated range. Bins outside the scan radius (+/-30 from active bin) are invisible.
- Symmetry score doesn't account for natural asymmetry in token pairs with different price dynamics.
- Center-of-mass offset is measured in bin units, not price units. The economic significance depends on the bin step size.
- Boltzmann fit uses a simple overlap metric, not a proper KL divergence or chi-squared test.
- Temperature is a composite heuristic, not a thermodynamic temperature. It combines excess energy, roughness, and gaps into a single scalar.
- Stress hotspot threshold (1.5x pool average) is fixed and doesn't adapt to pool-specific characteristics.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
