---
name: hodlmm-bin-catalysis
description: "Identifies catalytic bins in HODLMM pools — bins whose concentrated liquidity amplifies depth in neighboring bins, computing catalytic ratio (bin USD value divided by pool average — how much more concentrated this bin is than typical), neighbor enhancement (average neighbor USD value divided by pool average — whether nearby bins also have elevated reserves suggesting the catalyst 'lifts' its surroundings), radius of influence (how many bins outward from the catalyst still show above-average reserves — a catalyst with radius 3 means bins up to 3 positions away remain elevated), catalyst type classification (STRONG_CATALYST: high self-concentration AND high neighbor enhancement — this bin both concentrates liquidity and amplifies neighbors; MODERATE_CATALYST: moderate self-concentration with meaningful neighbor lift; WEAK_CATALYST: neighbors enhanced but the bin itself isn't extremely concentrated; ISOLATED_PEAK: very high concentration but neighbors are depleted — this bin hoards rather than catalyzes; NON_CATALYTIC: neither concentrated nor enhancing), catalyst density (fraction of bins that qualify as catalysts — measures how distributed catalytic effects are across the pool), catalyst coverage (fraction of all bins that fall within some catalyst's radius of influence — high coverage means most of the pool benefits from catalytic liquidity amplification), catalyst asymmetry (directional bias of catalysts relative to active bin — positive means catalysts cluster above active bin, negative means below, indicating directional liquidity anchoring), catalyst clustering (fraction of adjacent catalyst pairs that are within 2 bins of each other — high clustering means catalysts form connected zones rather than isolated points), neighbor enhancement average (mean enhancement across all catalysts — measures the pool's overall catalytic lifting effect), and a composite catalysis index scoring 0-100 combining density, enhancement, coverage, and catalytic ratio, classifying pools as INERT (no meaningful catalytic structure — liquidity is either uniformly distributed or randomly scattered without local amplification), WEAKLY_CATALYTIC (some bins show elevated concentration with mild neighbor effects — localized depth anchors exist but don't dominate), CATALYTIC (clear catalytic bins that elevate their neighborhoods — the pool has structural depth anchors creating reliable execution zones), or HIGHLY_CATALYTIC (dominant catalytic structure where concentrated bins create broad zones of elevated liquidity — strong depth clustering around catalyst points), with catalysis risk rated NONE/LOW/MODERATE/HIGH based on whether depth depends on a few isolated peaks (fragile) or distributed catalysts (robust)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-catalysis/hodlmm-bin-catalysis.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Catalysis Analyzer

## What it does

Identifies bins in HODLMM pools that act as catalysts — concentrated liquidity anchors that amplify depth in their surrounding neighborhood. In chemistry, a catalyst accelerates a reaction without being consumed; in DLMM pools, a catalytic bin concentrates enough liquidity to create a "zone of influence" where neighboring bins also maintain elevated reserves, either because LPs cluster around the same price level or because the concentrated bin absorbs trades that would otherwise deplete adjacent bins.

The analyzer scans each bin above a concentration threshold, measures its neighbors' reserve levels, and classifies whether the bin genuinely catalyzes elevated depth in its neighborhood or merely hoards liquidity as an isolated peak. It then computes pool-wide catalysis metrics: how many catalysts exist, what fraction of the pool they cover, whether they cluster together or scatter, and whether catalytic effects tilt toward one side of the active bin.

## Why agents need it

Catalytic bins are the structural backbone of a pool's execution quality. A pool with distributed catalysts has multiple depth anchors — removing any single one doesn't collapse the depth profile. A pool where all depth depends on a single isolated peak is fragile: if that LP withdraws, the entire zone loses execution quality.

For trading agents, catalytic bins indicate reliable execution zones. Routing through a catalyzed region means the surrounding bins provide spillover depth — even if the trade size exceeds the catalyst bin's reserves, neighbors absorb the overflow with reasonable slippage. Routing through an uncatalyzed region means each bin is on its own.

For LP agents, catalysis reveals where to position for maximum utility. Placing liquidity in an uncatalyzed gap between two catalyst zones fills a structural void — the new position benefits from both catalysts' spillover effects and captures trades that would otherwise suffer poor execution in the gap. Conversely, adding to an existing catalyst's neighborhood is safe but offers diminishing marginal improvement.

Catalyst asymmetry tells agents whether the pool's depth structure favors one side of the active bin. Positive asymmetry (catalysts above active bin) means buy-side execution is better supported than sell-side. Negative asymmetry means sells execute better. This informs directional bias in routing strategies.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-catalysis/hodlmm-bin-catalysis.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-catalysis/hodlmm-bin-catalysis.ts status
```

### run
Fetches bin reserves for top pools (or a specific pool) and computes all catalysis metrics. Outputs a human-readable table plus JSON to stdout.
```bash
bun run hodlmm-bin-catalysis/hodlmm-bin-catalysis.ts run
bun run hodlmm-bin-catalysis/hodlmm-bin-catalysis.ts run --pool 1
bun run hodlmm-bin-catalysis/hodlmm-bin-catalysis.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgCatalysisIndex": 45.2,
    "highCatalyticCount": 1,
    "catalyticCount": 2,
    "weaklyCatalyticCount": 1,
    "inertCount": 1,
    "noneCount": 1,
    "lowCount": 2,
    "moderateCount": 1,
    "highCount": 1,
    "avgCatalystDensity": 0.15,
    "avgCatalystCoverage": 0.45,
    "avgNeighborEnhancement": 1.35
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "catalysisIndex": 62,
      "catalysisClass": "CATALYTIC",
      "catalysisRisk": "LOW",
      "catalystCount": 4,
      "catalystDensity": 0.18,
      "avgCatalyticRatio": 2.8,
      "maxCatalyticRatio": 4.5,
      "neighborEnhancementAvg": 1.5,
      "catalystCoverage": 0.55,
      "catalystAsymmetry": 0.2,
      "catalystClustering": 0.5,
      "catalystBins": [
        {
          "binId": 8388610,
          "selfUsd": 12000,
          "neighborAvgUsd": 6500,
          "poolAvgUsd": 4300,
          "catalyticRatio": 2.79,
          "neighborEnhancement": 1.51,
          "radiusOfInfluence": 2,
          "catalystType": "MODERATE_CATALYST"
        }
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

- Requires at least 5 populated bins within +/-30 of active bin; pools with sparse distributions are skipped.
- Catalyst threshold is 1.5x pool average bin value — relative, not absolute. A "catalyst" in a low-TVL pool may hold less USD than a normal bin in a high-TVL pool.
- Neighbor enhancement measures static reserve levels, not trading activity. High neighbor reserves may be independent of the catalyst rather than caused by it.
- Radius of influence uses a simple threshold (0.8x pool average) — it doesn't model the decay curve of catalytic effects.
- Catalyst clustering uses a simple adjacency count, not spatial statistics like Moran's I.
- Only scans +/-30 bins from active bin. Catalysts outside this range are invisible.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
- Read-only; does not reflect pending mempool transactions.
