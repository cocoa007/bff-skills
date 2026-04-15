---
name: hodlmm-bin-nucleation
description: "Detects nucleation sites in HODLMM pools — seed bins where liquidity clusters spontaneously form, computing local contrast (how sharply a seed bin stands out from its immediate neighbors — the ratio of the seed's USD value to the average of its adjacent bins, measuring the sharpness of the concentration spike), growth gradient (the rate at which surrounding bin reserves decay moving away from the seed — measured separately for left and right directions as the average reserve-to-seed ratio weighted by distance, indicating whether the seed attracts liquidity in its neighborhood or stands alone), growth symmetry (ratio of the weaker growth gradient to the stronger one — 1.0 means perfectly symmetric growth in both directions, 0.0 means one-sided growth suggesting directional liquidity pressure), cluster size (number of contiguous bins around a seed that maintain reserves above 50% of pool average — the physical extent of the nucleated structure), cluster USD (total dollar value within the cluster — measures the economic weight of the nucleated structure), maturity classification (EMBRYONIC: isolated seed with no surrounding growth — a concentration spike that hasn't attracted neighbors yet; NASCENT: small cluster forming with 2-3 bins above threshold — early-stage nucleation with detectable but fragile structure; GROWING: medium cluster of 4-6 bins with moderate growth gradients — active crystallization with increasing structural stability; MATURE: large cluster of 7+ bins with strong gradients — fully formed nucleation site that dominates local liquidity topology), critical mass detection (whether a seed exceeds 3x pool average AND has at least 3 cluster bins — seeds with critical mass are self-sustaining and likely to attract further LP positioning), seed density (fraction of analyzed bins that qualify as nucleation seeds — measures how distributed nucleation is across the price range), nucleation barrier (the USD threshold a bin must exceed to qualify as a potential seed — set at 1.8x pool average bin value, analogous to the activation energy required for phase transition), cluster coverage (fraction of all analyzed bins that fall within some seed's cluster — high coverage means most of the pool's price range has nucleated structure), nucleation asymmetry (directional bias of seeds relative to active bin — positive means seeds cluster above active bin suggesting buy-side nucleation dominance, negative means sell-side dominance), and a composite nucleation index scoring 0-100 combining seed density, local contrast, growth gradients, cluster coverage, and maturity ratios, classifying pools as SUPERCOOLED (no nucleation sites detected — liquidity is uniformly distributed or randomly scattered like a supercooled liquid that hasn't begun phase transition, making cluster formation unpredictable), SEEDED (initial nucleation sites detected but clusters are embryonic or nascent — seeds exist but haven't attracted significant surrounding growth, representing early-stage structure formation), CRYSTALLIZING (active nucleation with growing clusters — seeds are attracting neighboring liquidity and building structural depth, but the process is incomplete with gaps between crystallized zones), or FULLY_NUCLEATED (mature clusters formed around multiple seeds — the pool has undergone complete phase transition with well-established liquidity structures providing predictable depth topology), with nucleation risk rated NONE/LOW/MODERATE/HIGH based on seed count and cluster coverage fragility."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-nucleation/hodlmm-bin-nucleation.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Nucleation Site Detector

## What it does

Identifies nucleation sites in HODLMM pools — seed bins where liquidity clusters spontaneously form. In physics, nucleation is the initial process of phase formation: a seed crystal appears in a supercooled liquid, and surrounding molecules organize around it, growing a larger crystalline structure. In DLMM pools, a nucleation site is a bin with enough concentrated liquidity to attract further LP positioning in its neighborhood, creating a self-reinforcing cluster of depth.

The analyzer scans each bin for seed characteristics: local concentration spikes that stand out from immediate neighbors, growth gradients showing whether surrounding bins decay smoothly outward (indicating attraction) or drop sharply (indicating isolation), and cluster extent measuring how many contiguous bins maintain elevated reserves around the seed. It then classifies each seed's maturity — from embryonic (isolated spike) through nascent and growing to mature (large, gradient-rich cluster) — and computes pool-wide nucleation metrics.

## Why agents need it

Nucleation patterns reveal the structural lifecycle of a pool's liquidity topology. A SUPERCOOLED pool has no nucleation — liquidity is uniformly thin, and any perturbation (large trade, LP withdrawal) affects the entire range equally. There's no structural backbone to absorb shocks.

A SEEDED pool shows early-stage structure formation. Seeds exist but haven't grown into protective clusters yet. This is a transition state — the pool is about to develop depth structure but it's not there yet. LP agents should monitor seeds: adding liquidity near a nascent seed can accelerate its growth into a mature cluster, while positioning far from any seed means building in a structural void.

A CRYSTALLIZING pool has active cluster growth. Seeds are attracting neighboring liquidity, building zones of reliable execution depth. Trading agents benefit from routing through crystallized zones. LP agents can identify the growth frontier — the edges of expanding clusters where new positions provide the most structural reinforcement.

A FULLY_NUCLEATED pool has completed its phase transition. Mature clusters dominate, providing predictable depth topology. Execution quality is stable within cluster zones. The risk shifts from structural absence to cluster fragility: if a seed LP withdraws from a critical cluster, the whole structure may degrade.

Growth symmetry reveals directional bias. A seed with strong leftward gradient but weak rightward gradient is nucleating sell-side depth but not buy-side. Nucleation asymmetry across the whole pool tells agents which side of the order book has stronger structural support.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-nucleation/hodlmm-bin-nucleation.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-nucleation/hodlmm-bin-nucleation.ts status
```

### run
Fetches bin reserves for top pools (or a specific pool) and detects nucleation sites. Outputs a human-readable table plus JSON to stdout.
```bash
bun run hodlmm-bin-nucleation/hodlmm-bin-nucleation.ts run
bun run hodlmm-bin-nucleation/hodlmm-bin-nucleation.ts run --pool 1
bun run hodlmm-bin-nucleation/hodlmm-bin-nucleation.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgNucleationIndex": 48.3,
    "fullyNucleatedCount": 1,
    "crystallizingCount": 2,
    "seededCount": 1,
    "supercooledCount": 1,
    "noneCount": 1,
    "lowCount": 2,
    "moderateCount": 1,
    "highCount": 1,
    "avgSeedDensity": 0.12,
    "avgClusterCoverage": 0.42,
    "totalMatureSeeds": 3,
    "totalNascentSeeds": 5
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "activeBin": 8388608,
      "binsAnalyzed": 25,
      "seeds": [
        {
          "binId": 8388610,
          "seedUsd": 15000,
          "localContrast": 3.2,
          "growthGradientLeft": 0.35,
          "growthGradientRight": 0.28,
          "growthSymmetry": 0.80,
          "clusterSize": 5,
          "clusterUsd": 42000,
          "maturity": "GROWING",
          "criticalMass": true
        }
      ],
      "seedCount": 3,
      "seedDensity": 0.12,
      "avgLocalContrast": 2.8,
      "maxLocalContrast": 3.2,
      "avgGrowthGradient": 0.25,
      "nucleationBarrier": 7740,
      "clusterCoverage": 0.48,
      "matureSeeds": 1,
      "nascentSeeds": 1,
      "nucleationAsymmetry": 0.33,
      "nucleationIndex": 55,
      "nucleationClass": "CRYSTALLIZING",
      "nucleationRisk": "LOW",
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
- Seed detection requires bins to be local maxima above 1.8x pool average — this is relative, not absolute. A "seed" in a low-TVL pool may hold less USD than a normal bin in a high-TVL pool.
- Growth gradients require contiguous bin population. Gaps in the bin sequence truncate gradient measurement, potentially underestimating cluster extent.
- Maturity classification uses fixed thresholds for cluster size and gradient strength. These don't adapt to pool-specific characteristics.
- Growth symmetry is undefined (reported as 0) when both gradients are zero.
- Cluster coverage uses a simple contiguous-bin model centered on seeds. Overlapping clusters are not double-counted but the boundary between clusters is arbitrary.
- Only scans +/-30 bins from active bin. Nucleation sites outside this range are invisible.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
- Read-only; does not reflect pending mempool transactions.
