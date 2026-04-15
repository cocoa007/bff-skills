---
name: hodlmm-bin-chirality
description: "Analyzes stereochemistry-inspired chirality of HODLMM bin reserve distributions, computing enantiomeric excess (asymmetry between liquidity mass on left vs right of active bin), local handedness per bin (ratio of token-X to token-Y reserve dominance normalized to [-1,1]), chiral centers (bins where handedness flips sign indicating dominant-token transitions), mirror pair mismatch (reserve differences between equidistant bins on opposite sides of active bin revealing structural asymmetry), stereochemical purity (consistency of handedness direction across bins from 0% racemic to 100% enantiopure), optical rotation (weighted directional bias measuring net flow tendency as dextrorotatory or levorotatory), racemization risk (likelihood of distribution becoming symmetric based on chiral center proximity, volume turnover, and current ee), and a composite chirality index scoring 0-100 combining enantiomeric excess, mirror mismatch, chiral center density, and stereochemical purity, classifying pools as RACEMIC (balanced symmetric distribution), SCALEMIC (slight asymmetry), ENANTIOENRICHED (significant one-sided bias), or ENANTIOPURE (extreme handedness)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-chirality/hodlmm-bin-chirality.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Chirality Analyzer

## What it does

Analyzes the stereochemical chirality of HODLMM bin reserve distributions by treating the active bin as a mirror plane and measuring how asymmetric the liquidity landscape is on each side. In stereochemistry, chirality describes molecules that are not superimposable on their mirror images — like left and right hands. Applied to on-chain DLMM liquidity, chirality measures whether the reserve distribution has a "handedness": is it heavier on the left (lower bins, token X dominant) or right (upper bins, token Y dominant)?

For each pool, the analyzer computes: enantiomeric excess (ee) as the percentage imbalance between total USD liquidity below vs above the active bin — 0% means perfectly racemic (symmetric) while 100% means all liquidity is on one side; local handedness per bin computed as (reserveX_usd - reserveY_usd) / total_usd, normalized to [-1, 1] where positive values indicate left-handed (token X dominant) bins and negative values indicate right-handed (token Y dominant) bins; chiral centers identifying bins where local handedness flips sign, marking transitions between token-X-dominant and token-Y-dominant regions analogous to stereocenters in organic chemistry where substituent arrangement creates asymmetry; mirror pair analysis comparing reserves in equidistant bins on opposite sides of the active bin to quantify structural asymmetry — high mismatch means the pool looks fundamentally different from each direction; stereochemical purity measuring how consistently bins share the same handedness direction from 0% (equal mix of left and right, fully racemic) to 100% (all bins one-handed, fully enantiopure); optical rotation as the reserve-weighted directional bias classified as dextrorotatory (net right rotation, token Y flow tendency) or levorotatory (net left rotation, token X flow tendency); racemization risk estimating likelihood of the distribution becoming symmetric based on chiral center proximity to active bin, volume-to-TVL turnover ratio, and current ee; and a composite chirality index scoring 0-100 combining ee, mirror mismatch, chiral center density, and stereochemical purity.

## Why agents need it

Chirality analysis reveals directional bias in liquidity deployment that symmetric metrics like TVL or standard deviation completely miss. A pool can have identical TVL and volatility but fundamentally different chirality — one could be racemic (balanced, predictable two-way flow) while another is enantiopure (one-sided, creating persistent directional pressure). For LP positioning, racemic pools offer balanced fee capture from both directions, while chiral pools concentrate fee-generating flow on one side, creating opportunities for asymmetric positioning. Chiral centers identify specific bins where trading dynamics shift, useful for setting range boundaries. Mirror mismatch reveals whether a pool's apparent symmetry is genuine or superficial — high mismatch pools will punish symmetric LP strategies. Racemization risk warns when a currently asymmetric pool is likely to rebalance, potentially stranding directional positions. The chirality class gives agents a quick screen: RACEMIC pools suit standard symmetric strategies, ENANTIOENRICHED pools reward directional conviction, and ENANTIOPURE pools signal extreme one-sided conditions that may indicate whale activity or imminent rebalancing.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-chirality/hodlmm-bin-chirality.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-chirality/hodlmm-bin-chirality.ts status
```

### run
Fetches bin reserves for top pools (or a specific pool) and computes all chirality metrics. Outputs a human-readable table plus JSON to stdout.
```bash
bun run hodlmm-bin-chirality/hodlmm-bin-chirality.ts run
bun run hodlmm-bin-chirality/hodlmm-bin-chirality.ts run --pool 1
bun run hodlmm-bin-chirality/hodlmm-bin-chirality.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgChiralityIndex": 42.3,
    "racemicCount": 1,
    "scalemicCount": 2,
    "enantioenrichedCount": 1,
    "enantiopureCount": 1,
    "leftCount": 2,
    "rightCount": 2,
    "racemicHandCount": 1,
    "avgEnantiomericExcess": 35.6,
    "totalChiralCenters": 12
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "chiralityIndex": 55,
      "chiralityClass": "ENANTIOENRICHED",
      "handedness": "LEFT",
      "enantiomericExcess": 42.3,
      "mirrorMismatchMean": 0.38,
      "chiralCenterCount": 3,
      "stereochemicalPurity": 72.5,
      "opticalRotation": 28.4,
      "rotationDirection": "dextrorotatory",
      "racemizationRisk": 45,
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

- Requires at least 5 populated bins within +/-30 of active bin; pools with sparse distributions are skipped.
- Enantiomeric excess treats the active bin as the exact center of symmetry; slight bin-step offsets are ignored.
- Chiral center detection uses a 0.05 handedness threshold to filter noise from near-zero reserve bins.
- Mirror pairs only form when both equidistant bins have non-zero reserves; missing bins reduce pair count.
- Racemization risk is heuristic — actual racemization depends on market conditions not captured by static reserve snapshots.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
- Read-only; does not reflect pending mempool transactions.
