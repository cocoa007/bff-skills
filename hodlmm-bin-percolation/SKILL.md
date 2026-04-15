---
name: hodlmm-bin-percolation
description: "Measures how effectively liquidity percolates through the HODLMM bin lattice — computes site occupancy (fraction of scanned bins with non-zero reserves measuring lattice density), cluster count (number of disconnected liquidity islands separated by empty bins), largest cluster size and ratio (the biggest contiguous block of populated bins and its fraction of all populated bins — the backbone of the percolation network), spanning cluster detection (whether any single cluster connects across the entire scan range indicating full percolation), percolation probability (fraction of adjacent bin pairs that are both populated — the bond probability in percolation theory), backbone length and ratio (size of the largest connected path and its fraction of total populated bins — the main flow channel), backbone density (average USD per bin in the backbone — the throughput capacity of the main flow channel), dead end count and ratio (isolated single-bin clusters with no neighbors — sites that contribute to occupancy but not to flow), bottleneck detection (bins within contiguous runs where reserves drop below 30% of neighbor average — constriction points that limit flow even in connected regions), worst bottleneck ratio (the most severe constriction — lowest ratio of bin reserves to neighbor average), average and minimum bond strength (reserve ratio between adjacent populated bins measuring flow continuity — 1.0 means equal reserves at the boundary, 0.0 means one side is empty), bond variance (dispersion of bond strengths across the lattice — high variance means inconsistent flow quality), tortuosity (ratio of percolation path length to straight-line distance — how efficiently the flow path covers the range; 1.0 for a perfectly straight path), flow conductance (composite measure combining occupancy, bond strength, backbone ratio, and bottleneck-free fraction into a single flow quality metric 0-1), critical bin count and fraction (bins whose removal would split their cluster — structural vulnerabilities in the percolation network), active bin connectivity (whether the active bin is part of a cluster and how large that cluster is — determines if trades at the current price can flow into surrounding bins), percolation length (longest connected path through the bin network — the maximum distance a trade can traverse without hitting a gap), correlation length (average cluster size weighted by size — in percolation theory this diverges at the critical threshold, indicating long-range connectivity emerging), concentration Gini (inequality of reserve distribution across populated bins — affects flow uniformity even in connected regions), and composite percolation index (0-100 from occupancy, connectivity, bond strength, and conductance components), classifying pools by percolation class as SUPERCRITICAL (index >= 80 — well above the percolation threshold with strong bonds and continuous flow paths, liquidity percolates freely across the entire range with no significant barriers), CRITICAL (60-80 — near the percolation threshold where long-range connectivity exists but is fragile, the backbone spans most of the range but bottlenecks or weak bonds limit flow capacity), SUBCRITICAL (40-60 — below the percolation threshold with partial connectivity, multiple disconnected clusters exist but the largest cluster provides reasonable local flow, trades near the active bin work but cannot traverse the full range), DISCONNECTED (20-40 — well below threshold with many small isolated clusters, no meaningful flow path exists across the range, trades are confined to small local neighborhoods), or IMPERMEABLE (< 20 — almost no connectivity, the bin lattice is effectively impermeable to trade flow with isolated pockets of liquidity that cannot sustain consistent execution), and by flow verdict as FREE_FLOW (spanning cluster with strong bonds — trades flow freely), CONSTRICTED (spanning cluster but weak bonds — flow exists but bottlenecks limit throughput), PARTIAL (large backbone but no spanning cluster — flow works in the main channel but gaps block full-range traversal), FRAGMENTED (few clusters but no dominant backbone — disconnected pools of local liquidity), or BLOCKED (many small clusters — no meaningful flow path exists)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-percolation/hodlmm-bin-percolation.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Percolation Analyzer

## What it does

Measures how effectively liquidity percolates through the HODLMM bin lattice. In percolation theory, a lattice transitions from disconnected clusters to a spanning network at a critical occupation threshold. In DLMM pools, the "lattice" is the array of bins around the active price, and "occupied sites" are bins with non-zero reserves. A pool above the percolation threshold has continuous liquidity flow — trades can traverse the price range without hitting empty bins. Below threshold, the pool fragments into disconnected islands.

The analyzer scans bins around the active bin and measures site occupancy, cluster topology, bond strengths between adjacent bins, bottleneck detection, backbone identification, and flow conductance. It identifies where percolation breaks down (gaps and bottlenecks), how strong the flow connections are (bond strength uniformity), and whether the lattice supports spanning flow (percolation probability, spanning cluster detection).

## Why agents need it

LP agents need to understand whether their pool supports continuous trade flow or fragments into disconnected liquidity islands. A pool might have decent TVL but poor percolation — reserves concentrated in a few clusters with gaps that block trade traversal. The percolation perspective reveals structural connectivity that aggregate metrics miss.

Site occupancy and percolation probability tell LP agents whether the lattice is above or below the critical threshold. Below threshold, adding liquidity to isolated bins has minimal impact on flow — it creates new islands rather than extending the network. LP agents should focus on connecting existing clusters by filling the gaps between them.

Bond strength reveals flow quality within connected regions. Even a spanning cluster can have bottlenecks — bins with reserves far below their neighbors that constrict flow like narrow passages. LP agents can use bottleneck detection to identify where additional liquidity would have the most impact on flow conductance.

The backbone (largest cluster) represents the primary flow channel. Its ratio to total populated bins indicates whether the pool is dominated by one connected network (backbone ratio near 1.0) or fragmented into many small pieces (low backbone ratio). LP agents joining a pool want a large backbone that includes the active bin.

Dead ends (single isolated bins) contribute to TVL but not to flow. A pool with many dead ends has inefficient capital deployment — reserves sit in isolated pockets that cannot support continuous trading. LP agents should identify whether their positions are part of the backbone or stranded as dead ends.

Critical bins are structural vulnerabilities — their removal would split the percolation network. LP agents watching pool health should monitor critical bins for withdrawal, which could fragment the flow path.

The percolation index provides a single number (0-100) combining occupancy, connectivity, bond strength, and conductance into a structural quality score. LP agents can track this over time to detect percolation degradation (withdrawals creating gaps) or improvement (deposits connecting clusters).

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-percolation/hodlmm-bin-percolation.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-percolation/hodlmm-bin-percolation.ts status
```

### run
Analyzes bin percolation for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-percolation/hodlmm-bin-percolation.ts run
bun run hodlmm-bin-percolation/hodlmm-bin-percolation.ts run --pool 1
bun run hodlmm-bin-percolation/hodlmm-bin-percolation.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgPercolationIndex": 58,
    "supercriticalCount": 1,
    "criticalCount": 2,
    "subcriticalCount": 1,
    "disconnectedCount": 1,
    "impermeableCount": 0,
    "avgSiteOccupancy": 0.45,
    "avgBondStrength": 0.62,
    "avgFlowConductance": 0.51,
    "avgGini": 0.48
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "activeBin": 8388608,
      "binsScanned": 61,
      "binsPopulated": 25,
      "totalUsd": 140000,
      "siteOccupancy": 0.4098,
      "clusterCount": 4,
      "largestClusterSize": 12,
      "largestClusterRatio": 0.48,
      "spanningCluster": false,
      "percolationProbability": 0.35,
      "backboneLength": 12,
      "backboneRatio": 0.48,
      "backboneDensity": 7083.33,
      "deadEndCount": 2,
      "deadEndRatio": 0.08,
      "bottleneckCount": 1,
      "worstBottleneckRatio": 0.15,
      "avgBondStrength": 0.58,
      "minBondStrength": 0.12,
      "bondVariance": 0.05,
      "tortuosity": 1.0,
      "flowConductance": 0.42,
      "criticalBinCount": 10,
      "criticalBinFraction": 0.40,
      "activeBinConnected": true,
      "activeBinClusterSize": 12,
      "percolationLength": 12,
      "correlationLength": 8.5,
      "concentrationGini": 0.42,
      "percolationIndex": 48,
      "percolationClass": "SUBCRITICAL",
      "flowVerdict": "PARTIAL",
      "clusters": [
        { "startBin": 8388595, "endBin": 8388606, "length": 12, "totalUsd": 85000, "avgUsd": 7083.33, "minUsd": 1200, "containsActiveBin": true }
      ],
      "bottlenecks": [
        { "binId": 8388601, "reserveUsd": 1200, "leftNeighborUsd": 8500, "rightNeighborUsd": 9200, "constrictionRatio": 0.1356, "position": "CENTER" }
      ],
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

- Site occupancy is relative to the fixed scan radius (30 bins each side). Pools with liquidity beyond this radius will show lower occupancy even if the extended lattice is well-populated. The scan radius represents the practical range for most trading activity.
- Cluster detection uses strict adjacency (gap of 1+ bins creates a new cluster). Bins separated by a single empty bin are in different clusters even though trades might bridge the gap with acceptable slippage depending on trade size.
- Bond strength measures reserve ratio between adjacent bins but does not account for absolute size. Two bins with $1 each have bond strength 1.0 (perfect) but cannot support meaningful trade volume. Always consider backbone density alongside bond metrics.
- Bottleneck detection uses a 30% threshold relative to neighbor average. This threshold is fixed — some pools may have intentionally tapered profiles where gradual reserve reduction is by design, not a bottleneck.
- Critical bin detection in a linear lattice (1D bin array) means every interior bin in a contiguous cluster is critical. This is a property of the 1D topology, not necessarily a vulnerability. In higher-dimensional lattices, only articulation points would be critical.
- Tortuosity in a 1D bin array is always 1.0 since the path cannot deviate from the straight line. This metric is included for completeness and would be more informative in multi-dimensional liquidity structures.
- Percolation theory concepts (critical threshold, correlation length, universality) are adapted from infinite lattice theory to a finite 61-bin window. Finite-size effects mean the sharp phase transition of infinite lattices becomes a smooth crossover.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
