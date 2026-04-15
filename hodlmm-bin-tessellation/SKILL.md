---
name: hodlmm-bin-tessellation
description: "Measures how completely and uniformly HODLMM bin reserves tile the active price range — computes coverage ratio (fraction of scanned bins with non-zero reserves measuring how well the liquidity tiles the available range), gap count and gap analysis (number, width, and position of consecutive empty bins within the populated range — gaps represent untiled regions where trades would fail or suffer extreme slippage), gap fraction (proportion of the spanned range that is empty gaps — a direct measure of tiling incompleteness), tile density (average USD value per populated bin — the thickness of each tile in the mosaic), tile uniformity (1 minus the coefficient of variation of reserves across populated bins — measures how equal the tiles are; 1.0 means all tiles are identical, 0.0 means extreme variation between tiles), edge taper (ratio of edge bin reserves to center bin reserves for left and right sides — measures whether liquidity tapers smoothly at the boundaries or drops off abruptly; values near 1.0 mean flat coverage, values near 0 mean reserves concentrate in the center), contiguous segments (number of unbroken runs of populated bins — a pool with one segment has no internal gaps while many segments indicate a fragmented mosaic), longest and shortest segment (the largest and smallest contiguous tile runs — large longest segment means most liquidity is in one connected block), fragmentation index (1 minus the ratio of longest segment to total populated bins — 0.0 means all bins form one contiguous block, 1.0 means every populated bin is isolated), symmetry score (Pearson correlation between left and right reserve halves around the active bin — 1.0 means perfectly symmetric tiling, 0.0 means no correlation between the two sides), perimeter ratio (total absolute reserve differences between adjacent bins plus edge values divided by total USD — measures how jagged the tiling boundary is; low values indicate smooth tiles, high values indicate rugged uneven tiling), compactness index (ratio of ideal perimeter to actual perimeter — how efficiently the reserves are arranged; 1.0 for a perfectly compact block, lower for irregular sprawling distributions), mosaic entropy (Shannon entropy of the normalized reserve distribution — measures disorder in the tiling; maximum when all tiles are equal, minimum when all reserves concentrate in one bin), entropy ratio (mosaic entropy divided by maximum possible entropy — normalized disorder measure; 1.0 means perfectly uniform tiles, 0.0 means all reserves in one bin), concentration Gini (Gini coefficient of reserve distribution — measures inequality; 0.0 means all tiles equal, 1.0 means all reserves in one bin), active bin coverage (fraction of total reserves in the active bin — how much of the tiling concentrates at the current price), active bin neighborhood (fraction of total reserves within 3 bins of the active bin — measures local tiling density around the current price), span efficiency (ratio of populated bins to total span width — measures how efficiently the range between first and last populated bin is utilized), tile variance (variance of reserves across populated bins — raw measure of tile size dispersion), and composite tessellation index (0-100 from coverage, uniformity, contiguity, and entropy components), classifying pools by tessellation class as PERFECT (index >= 80 — near-complete coverage with uniform tiles and minimal gaps, the liquidity mosaic tiles the range efficiently with consistent tile sizes), REGULAR (60-80 — good coverage with moderate uniformity, minor gaps or some tile size variation but the overall tiling is functional), IRREGULAR (40-60 — patchy coverage or significant tile size variation, the mosaic has noticeable gaps or hotspots that create uneven execution quality), SPARSE (20-40 — significant gaps with fragmented tiling, large untiled regions make consistent execution impossible across much of the range), or BROKEN (< 20 — mostly gaps with barely any tiling, the range is fundamentally uncovered with isolated pockets of liquidity), and by coverage verdict as COMPLETE (coverage > 80% with zero gaps), MINOR_GAPS (coverage > 60% with small gaps <= 2 bins), PATCHY (coverage > 40%), SPARSE (coverage > 20%), or FRAGMENTED (coverage <= 20%)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-tessellation/hodlmm-bin-tessellation.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Tessellation Analyzer

## What it does

Measures how completely and uniformly HODLMM bin reserves tile the active price range. In geometry, tessellation is the covering of a surface by tiles without gaps or overlaps. In DLMM pools, the "surface" is the price range around the active bin, and the "tiles" are individual bins with non-zero reserves. A perfectly tessellated pool has continuous coverage with uniform tile sizes — every price point in the range has liquidity backing it, and trades of any size execute with consistent slippage.

The analyzer scans bins around the active bin and measures coverage completeness, gap distribution, tile uniformity, fragmentation, symmetry, compactness, and entropy. It identifies where the tiling breaks down (gap positions), how the tiles are sized relative to each other (Gini coefficient, uniformity), and whether the overall mosaic is efficient (span efficiency, compactness index).

## Why agents need it

LP agents need to know whether their liquidity effectively covers the price range or leaves dangerous gaps. A pool might have high TVL but poor tessellation — all liquidity concentrated in a few bins while most of the range is empty. Trades hitting empty bins fail or suffer extreme slippage, creating a poor user experience despite aggregate liquidity looking healthy.

Coverage ratio and gap analysis tell LP agents exactly where the range is untiled. If gaps cluster near the active bin, even small price movements can push trades into empty territory. If gaps are at the edges, the pool handles normal trading but breaks under large moves.

Tile uniformity and the Gini coefficient reveal whether the coverage is balanced or dominated by a few heavy bins. A pool with high coverage but extreme tile inequality concentrates execution quality at specific price points while starving others. LP agents can use this to identify where additional liquidity would have the most impact — filling gaps and equalizing tiles improves the overall tessellation quality.

Fragmentation index tells LP agents how many separate liquidity islands exist. A highly fragmented pool behaves like multiple isolated pools rather than a continuous market, creating execution discontinuities at each gap boundary.

Symmetry score reveals whether the pool is balanced around the active bin. Asymmetric tessellation means the pool handles buys and sells differently — one direction has deep continuous coverage while the other has gaps or sparse tiling. This is important for market makers who need consistent two-sided execution.

The tessellation index provides a single number (0-100) combining coverage, uniformity, contiguity, and entropy into a quality score for the overall tiling. LP agents can track this over time to detect tessellation degradation (liquidity withdrawal creating gaps) or improvement (new deposits filling gaps).

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-tessellation/hodlmm-bin-tessellation.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-tessellation/hodlmm-bin-tessellation.ts status
```

### run
Analyzes bin tessellation for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-tessellation/hodlmm-bin-tessellation.ts run
bun run hodlmm-bin-tessellation/hodlmm-bin-tessellation.ts run --pool 1
bun run hodlmm-bin-tessellation/hodlmm-bin-tessellation.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgTessellationIndex": 62,
    "perfectCount": 1,
    "regularCount": 2,
    "irregularCount": 1,
    "sparseCount": 1,
    "brokenCount": 0,
    "avgCoverageRatio": 0.55,
    "avgTileUniformity": 0.42,
    "avgFragmentationIndex": 0.35,
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
      "coverageRatio": 0.4098,
      "gapCount": 3,
      "maxGapWidth": 5,
      "avgGapWidth": 3.0,
      "gapFraction": 0.28,
      "tileDensity": 5600,
      "tileUniformity": 0.45,
      "edgeTaperLeft": 0.32,
      "edgeTaperRight": 0.18,
      "edgeTaperAvg": 0.25,
      "contiguousSegments": 4,
      "longestSegment": 12,
      "shortestSegment": 2,
      "fragmentationIndex": 0.52,
      "symmetryScore": 0.68,
      "perimeterRatio": 0.85,
      "compactnessIndex": 0.35,
      "mosaicEntropy": 4.2,
      "maxMosaicEntropy": 4.64,
      "entropyRatio": 0.91,
      "concentrationGini": 0.42,
      "activeBinCoverage": 0.08,
      "activeBinNeighborhood": 0.25,
      "spanEfficiency": 0.62,
      "tileVariance": 3500000,
      "tessellationIndex": 55,
      "tessellationClass": "IRREGULAR",
      "coverageVerdict": "PATCHY",
      "gaps": [
        { "startBin": 8388615, "endBin": 8388619, "width": 5, "position": "RIGHT" }
      ],
      "segments": [
        { "startBin": 8388595, "endBin": 8388606, "length": 12, "totalUsd": 85000, "avgUsd": 7083.33 }
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

- Coverage ratio is relative to the fixed scan radius (30 bins each side). Pools with liquidity beyond this radius will show incomplete coverage even if the extended range is well-tiled. The scan radius represents the practical range for most trading activity.
- Gap detection only identifies gaps between the first and last populated bins. Empty bins beyond the populated range are not counted as gaps — they represent unexplored territory, not missing tiles.
- Tile uniformity uses coefficient of variation, which is undefined when the mean is zero. Pools with near-zero reserves in most bins will show artificially high uniformity despite having negligible liquidity.
- Symmetry score uses Pearson correlation, which measures linear relationship between left and right halves. Two halves with identical shape but different scale (one side has 10x the reserves) will still show high symmetry. This is by design — we measure shape correlation, not magnitude equality.
- The Gini coefficient treats all bins equally regardless of their distance from the active bin. A pool with high Gini might still provide good execution at the active price if the concentration is near the active bin.
- Mosaic entropy is maximized when all tiles are equal, but equal tiles are not always optimal. A well-designed pool might intentionally concentrate liquidity near the active bin (low entropy) to minimize slippage at the most-traded price.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
