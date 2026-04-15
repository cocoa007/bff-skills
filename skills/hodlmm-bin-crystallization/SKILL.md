---
name: hodlmm-bin-crystallization
description: "Models crystallization physics across HODLMM bins — treats liquidity distributions as crystal lattices where bins are atomic sites and reserves are binding energies. Measures lattice order (regularity of bin spacing — how closely the inter-bin distances match a periodic lattice, high order means bins are evenly spaced like atoms in a crystal while low order means irregular amorphous spacing), lattice regularity (normalized standard deviation of inter-bin spacings — 1.0 for perfectly uniform spacing, approaching 0 for highly irregular spacing where some bins are clustered while others are widely separated), grain count (number of distinct crystal grains — contiguous clusters of populated bins separated by gaps of 3+ empty bins, each grain is an independent crystalline domain with its own local order), grain size (average number of bins per grain — large grains indicate extensive crystallization while small grains suggest fragmented microcrystalline structure), grain boundaries (transition zones between grains — bins at the edges of crystal domains where the lattice structure breaks down, grain boundaries are weak points where the crystal is most likely to fracture under trade stress), melting point (volume-to-reserve ratio threshold for disrupting crystal structure — how much trading volume relative to bin reserves would be needed to 'melt' the crystallized liquidity, moving it from fixed positions, low melting points mean the crystal is fragile and easily disrupted), crystal defects (irregularities in the lattice — vacancies where expected lattice sites are empty creating gaps in the crystal, interstitials where extra bins are squeezed between normal lattice positions disrupting the regular spacing, and dislocations where bins are displaced from their ideal lattice positions), lattice energy (binding energy holding the crystal together — average of a bin's reserves and its neighbors' reserves normalized to pool maximum, high lattice energy means bins are strongly bound to their neighbors through mutual reserve depth, low energy means weakly held positions that could be disrupted), Debye temperature (thermal vibration amplitude — average reserve variation between neighboring bins normalized to the pool's deepest bin, high Debye temperature means bins fluctuate significantly relative to neighbors like atoms vibrating at high temperature, low means stable uniform reserves), crystal symmetry (reflection symmetry of the reserve distribution — how closely the left half mirrors the right half, 1.0 for perfect mirror symmetry, low values for asymmetric distributions where one side has much more liquidity than the other), solidification rate (inverse of volume-to-TVL ratio — how rapidly the pool is 'freezing' into fixed positions, low trading activity relative to reserves means liquidity is solidifying in place while high activity means constant melting and recrystallization), amorphous fraction (percentage of bins classified as defective — bins that don't fit the regular lattice pattern, high amorphous fraction means the distribution is disordered glass-like rather than crystalline), annealing potential (gap between ideal lattice energy and actual — how much the crystal structure could improve if liquidity were redistributed to reduce defects and improve regularity, high potential means significant room for optimization), polycrystallinity (1 - 1/grainCount — 0 for single crystal, approaching 1 for many small grains, polycrystalline pools have multiple independent liquidity domains that respond differently to trades), slip planes (gaps between grains where the crystal could fracture — the weakest structural boundaries in the bin landscape, a large trade could cause the crystal to 'slip' along these planes separating liquidity domains), dislocation density (defect count per unit bin span — measures the concentration of crystal imperfections, high density means a heavily defective crystal that's prone to restructuring), nucleation potential (tendency for new crystal growth — bins with high reserves and high local order serve as nucleation sites where additional liquidity is likely to crystallize around them), binding strength (composite per-bin stability from lattice energy, local order, and thermal displacement — how firmly each bin's liquidity is locked in its crystal position, high binding means the bin won't easily redistribute), and crystallization Gini (inequality of reserve distribution — 0 means perfectly uniform reserves across all bins while 1 means all reserves concentrated in one bin). Composite crystallization index (0-100). Classifies pools by phase as FROZEN (index >= 80 — liquidity is completely locked in rigid crystal positions like a solid below its melting point, reserves show near-perfect lattice regularity with minimal thermal vibration, highly predictable but resistant to change — trades face maximum resistance from the crystallized structure), SINGLE_CRYSTAL (65-80 — one dominant grain with high lattice order, like a monocrystalline material with consistent properties throughout, liquidity responds uniformly across the crystal but changes propagate slowly through the rigid lattice), POLYCRYSTALLINE (45-65 — multiple crystal grains with different orientations, like a metal with distinct grain boundaries, each grain has internal order but cross-grain behavior is discontinuous — trades may propagate within a grain but be blocked at grain boundaries), SUPERCOOLED (25-45 — approaching crystallization but still partially fluid, like a supercooled liquid that hasn't yet nucleated into solid form, some local order is emerging but the overall structure remains malleable, susceptible to sudden crystallization events), or LIQUID (< 25 — fully fluid with no crystal structure, reserves shift freely in response to trades with no lattice rigidity resisting change, most adaptive but least predictable). Crystal verdict as PERFECT_LATTICE (regularity > 0.85 with zero defects — ideal crystal), MONOCRYSTAL (single grain with regularity > 0.7 — one clean crystal domain), POLYCRYSTAL (multiple grains with regularity > 0.5 — ordered but fragmented), DEFECTIVE (defects > 30% of bins — crystal exists but is riddled with imperfections), or AMORPHOUS (low regularity with many defects — no meaningful crystal structure, distribution is glass-like)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-crystallization/hodlmm-bin-crystallization.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Crystallization Analyzer

## What it does

Models crystallization physics across HODLMM bins. In materials science, crystallization is the process by which atoms arrange themselves into a highly ordered, periodic lattice structure. A perfect crystal has every atom at a precise lattice site with uniform spacing. Real crystals contain defects — vacancies (missing atoms), interstitials (extra atoms between lattice sites), and dislocations (rows of displaced atoms). Crystal properties depend on grain structure: single crystals have uniform properties, polycrystals have multiple domains with different orientations meeting at grain boundaries.

In DLMM pools, the bin landscape forms an analogous crystal structure. Populated bins are lattice sites; their reserves are binding energies. When bins are evenly spaced with similar reserves, the distribution is crystalline — rigid, ordered, and resistant to perturbation. When bins are irregularly distributed with wildly varying reserves, the distribution is amorphous — fluid, disordered, and easily reshaped by trading activity.

## Why agents need it

LP agents need to understand liquidity rigidity across their position range. A FROZEN pool has liquidity locked in crystal positions — reserves are stable and predictable but respond slowly to market changes. A LIQUID pool has freely flowing reserves that adapt quickly but behave unpredictably.

Lattice order reveals structural regularity. High lattice order means the bin spacing follows a periodic pattern — LP agents can predict which bins will be populated and approximately how much liquidity they contain. Low lattice order means the distribution is random, requiring bin-by-bin analysis.

Grain structure identifies independent liquidity domains. A MONOCRYSTAL pool behaves as a single unit — perturbations propagate across the full range. A POLYCRYSTAL pool has isolated grains — trades within one grain barely affect other grains, similar to trading in separate pools.

Grain boundaries are the weakest structural points. When trading pressure increases, the crystal fractures at grain boundaries first — these are where liquidity drainage begins. LP agents positioned at grain boundaries face higher withdrawal risk but may earn higher fees during restructuring events.

Melting point quantifies how much volume disrupts the crystal. A pool with a high melting point can absorb significant trade volume without restructuring. A pool near its melting point may undergo phase transitions — sudden reorganization of reserves across bins — from a single large trade.

Crystal defects reduce lattice strength without fully disrupting the crystal. Vacancies create local liquidity gaps; interstitials create overcrowded regions. LP agents in defective regions face higher uncertainty — the local structure is weakened but hasn't collapsed.

Debye temperature measures thermal noise — how much bins fluctuate relative to neighbors. High Debye temperature means active reserve redistribution. Low Debye temperature means stable, frozen positions where liquidity isn't moving between bins.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-crystallization/hodlmm-bin-crystallization.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-crystallization/hodlmm-bin-crystallization.ts status
```

### run
Analyzes bin crystallization dynamics for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-crystallization/hodlmm-bin-crystallization.ts run
bun run hodlmm-bin-crystallization/hodlmm-bin-crystallization.ts run --pool 1
bun run hodlmm-bin-crystallization/hodlmm-bin-crystallization.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgCrystallizationIndex": 55,
    "frozenCount": 0,
    "singleCrystalCount": 1,
    "polycrystallineCount": 2,
    "supercooledCount": 1,
    "liquidCount": 1,
    "avgLatticeOrder": 0.62,
    "avgGrainCount": 2.4,
    "totalDefects": 8,
    "avgCrystalSymmetry": 0.58,
    "avgCrystallizationGini": 0.42
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
      "latticeOrder": 0.58,
      "avgLatticeSpacing": 2.4,
      "latticeRegularity": 0.72,
      "grainCount": 3,
      "avgGrainSize": 8.3,
      "maxGrainSize": 12,
      "grainBoundaryCount": 4,
      "grainBoundaryFraction": 0.16,
      "avgMeltingPoint": 1.65,
      "minMeltingPoint": 0.12,
      "defectCount": 3,
      "vacancyCount": 2,
      "interstitialCount": 0,
      "dislocationDensity": 0.018,
      "crystalSymmetry": 0.55,
      "avgLatticeEnergy": 0.42,
      "totalLatticeEnergy": 10.5,
      "debyeTemperature": 0.28,
      "amorphousFraction": 0.12,
      "annealingPotential": 0.15,
      "solidificationRate": 0.39,
      "polycrystallinity": 0.67,
      "slipPlaneCount": 2,
      "crystallizationGini": 0.38,
      "crystallizationIndex": 52,
      "crystallizationPhase": "POLYCRYSTALLINE",
      "crystalVerdict": "POLYCRYSTAL",
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

- Lattice spacing is computed from consecutive populated bins only. Empty bins between populated ones are not counted as lattice sites — they are treated as vacancies or gaps between grains. This means the "ideal lattice" is defined by what exists, not by what could exist.
- Grain identification uses a gap threshold of 3+ empty bins. Two populated bins separated by 2 empty bins are considered part of the same grain. This threshold is somewhat arbitrary — in practice, whether a 2-bin gap constitutes a grain boundary depends on the bin step size and trade dynamics.
- Crystal symmetry measures reflection symmetry around the distribution center, not the active bin. A perfectly symmetric distribution offset from the active bin will still score high symmetry. This may not reflect the effective symmetry experienced by trades executing at the active bin.
- Melting point is a static estimate based on current reserves and 24h volume. Actual melting (reserve redistribution) depends on trade size distribution, not average volume. A few large trades can melt a crystal that withstands equivalent volume from many small trades.
- Defect classification uses simple spacing heuristics. A vacancy is declared when inter-bin spacing exceeds 2x the average, but this conflates genuine missing-liquidity vacancies with naturally wider lattice spacings in sparse regions. Similarly, interstitials may just be bins in a denser local cluster.
- Lattice energy averages a bin's reserves with its neighbors. This captures the "binding" concept (mutual reserve depth) but doesn't model the actual energy cost of removing a bin's liquidity (which depends on the pool's invariant and fee structure).
- Debye temperature is computed from static reserve snapshots. True thermal vibration would require time-series data showing how reserves fluctuate over time. This measures spatial variation as a proxy for temporal instability.
- Solidification rate uses volume-to-TVL as a proxy. Low volume relative to TVL suggests liquidity is "frozen" in place, but this could also mean the pool is simply unpopular rather than structurally rigid.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
