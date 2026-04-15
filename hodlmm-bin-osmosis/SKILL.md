---
name: hodlmm-bin-osmosis
description: "Measures osmotic pressure across HODLMM bins — how concentration differentials between adjacent bins create gradients that drive liquidity rebalancing, computing average osmotic pressure (mean log-ratio of concentration between adjacent bin pairs — measures the thermodynamic driving force for liquidity to flow from high-concentration to low-concentration regions; high pressure means steep concentration cliffs that market makers and arbitrageurs must overcome, low pressure means gentle gradients with smooth transitions), maximum osmotic pressure and bin (the single boundary with the largest concentration differential — the primary bottleneck where liquidity equilibration is most impeded), osmotic gradient (rate of change of osmotic pressure across the bin range — measures how uniform the concentration stress is; low gradient means consistent pressure throughout, high gradient means localized hotspots of extreme imbalance), semipermeability (uniformity of osmotic pressure distribution — high semipermeability means boundaries resist flow equally, like a uniform membrane; low means some boundaries are freely permeable while others are impenetrable walls), tonicity left and right with asymmetry (average concentration on each side of the active bin — identifies directional osmotic bias; high asymmetry means one side is hypertonic relative to the other, creating persistent directional flow pressure that trades in one direction face but not the other), hypertonic zones (boundaries where adjacent bin concentration ratios exceed 1.5x — sharp osmotic cliffs where liquidity flow is strongly driven but execution encounters sudden depth changes), hypotonic zones (boundaries where concentration ratios are inverted — dilute regions adjacent to concentrated ones, creating reverse flow pressure), isotonic zones (boundaries with balanced concentration — equilibrium regions where flow resistance is minimal and trade execution is smooth), osmotic flow direction (net direction of concentration-driven flow — LEFT_TO_RIGHT when left bins are more concentrated, RIGHT_TO_LEFT when right bins dominate, EQUILIBRIUM when balanced), net osmotic flux (mean directional concentration change per bin step — positive means concentration increases with bin ID, negative means it decreases), plasmolysis risk (percentage risk that extreme concentration in isolated bins will cause liquidity withdrawal — analogous to cell dehydration in hypertonic solutions; high-concentration outlier bins may lose liquidity to surrounding dilute bins over time), lysis risk (percentage risk that extremely dilute bins will be overwhelmed by incoming flow — analogous to cell rupture in hypotonic solutions; near-empty bins adjacent to concentrated bins face execution voids), turgor pressure (internal equilibration force from average osmotic pressure — higher turgor means the pool has stronger internal rebalancing incentives driving toward equilibrium), osmotic efficiency (composite 0-100 score of how well the pool distributes concentration — high means uniform distribution with few hypertonic cliffs and balanced tonicity), concentration Gini (inequality coefficient of bin concentrations — 0 means perfectly uniform, 1 means all liquidity in one bin; measures structural concentration inequality independent of absolute TVL), diffusion rate (volume-to-TVL ratio normalized by osmotic pressure — how quickly trading activity equilibrates concentration differentials; high diffusion means active arbitrage and rebalancing, low means imbalances persist), equilibrium distance (log-scaled measure of how far the pool is from uniform concentration — combines pressure and bin count; higher values mean more rebalancing needed to reach equilibrium), and osmotic index (composite 0-100 scoring osmotic health — higher means more balanced, lower pressure, better distributed concentration), classifying pools by osmotic class as ISOTONIC (avg pressure < 0.3 and Gini < 0.2 — near-equilibrium; concentration differences between adjacent bins are small enough that natural trading flow maintains balance), MILDLY_HYPERTONIC (avg pressure 0.3-0.8 — moderate concentration differentials exist but are not severe; some bins are notably more concentrated than neighbors but the gradients are manageable), HYPERTONIC (avg pressure 0.8-1.5 — significant concentration imbalances; clear high-density and low-density regions create meaningful osmotic gradients that affect execution quality directionally), or SEVERELY_HYPERTONIC (avg pressure > 1.5 — extreme concentration differentials; the pool has dramatic cliffs between concentrated and dilute bins, creating severe directional execution asymmetry and persistent rebalancing pressure), and by flow tendency as RAPID_EQUILIBRATING (diffusion rate > 5 — trading volume is actively and quickly dissolving concentration differentials; imbalances are short-lived), EQUILIBRATING (diffusion rate 1-5 — trading activity gradually reduces osmotic pressure; imbalances narrow over hours to days), SLOW_DIFFUSION (diffusion rate 0.2-1 — low trading activity relative to osmotic pressure; concentration imbalances persist for extended periods, creating predictable but slow-moving execution asymmetry), or OSMOTIC_LOCK (diffusion rate < 0.2 — trading volume is insufficient to overcome osmotic pressure; concentration imbalances are effectively permanent structural features of the pool that only large rebalancing events can resolve)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-osmosis/hodlmm-bin-osmosis.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Osmosis Analyzer

## What it does

Measures the osmotic pressure — concentration-driven flow force — across a HODLMM pool's bin distribution. In biology, osmosis is the movement of solvent through a semi-permeable membrane from a region of low solute concentration to high concentration, driven by the thermodynamic imperative to equalize concentration. The osmotic pressure quantifies the force of this drive.

In DLMM pools, each bin is a concentration compartment and each bin boundary is a semi-permeable membrane. When adjacent bins have very different liquidity concentrations, there is "osmotic pressure" for liquidity to flow from the concentrated bin to the dilute one — manifested as arbitrage opportunities, LP rebalancing incentives, and directional execution asymmetry. A pool in osmotic equilibrium (isotonic) has uniform concentration across bins with smooth transitions. A hypertonic pool has steep concentration cliffs that create persistent directional pressure.

The analyzer computes osmotic pressures (log concentration ratios), tonicity profiles (directional concentration bias), zone classifications (hypertonic/hypotonic/isotonic boundaries), plasmolysis and lysis risks (extreme concentration outliers), diffusion rates (how quickly volume equilibrates imbalances), and maps the complete osmotic landscape to identify where concentration-driven flow creates execution asymmetry.

## Why agents need it

Osmotic pressure reveals structural imbalances that simpler metrics miss. Two pools with identical TVL and similar bin counts can have radically different osmotic profiles — one isotonic with gentle gradients (uniform, predictable execution) and another severely hypertonic with concentration cliffs (directional execution traps).

Tonicity asymmetry identifies pools where one side of the active bin is significantly more concentrated than the other. This creates persistent directional pressure: trades moving toward the concentrated side face improving depth while trades moving toward the dilute side encounter worsening execution. Trading agents can exploit this asymmetry; LP agents should recognize it as a rebalancing signal.

The diffusion rate reveals whether imbalances are transient or structural. A rapidly equilibrating pool (high diffusion) corrects its own imbalances through trading activity — osmotic signals are short-lived. An osmotically locked pool (low diffusion) has permanent structural concentration features that only large rebalancing events can resolve — these are reliable predictors of persistent execution asymmetry.

Plasmolysis and lysis risks identify bins at extreme concentration levels. High-concentration outlier bins (plasmolysis) may lose liquidity over time as the osmotic gradient drives outflow. Near-empty bins (lysis) adjacent to concentrated bins represent execution voids where trades encounter sudden depth loss.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-osmosis/hodlmm-bin-osmosis.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-osmosis/hodlmm-bin-osmosis.ts status
```

### run
Analyzes osmotic pressure for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-osmosis/hodlmm-bin-osmosis.ts run
bun run hodlmm-bin-osmosis/hodlmm-bin-osmosis.ts run --pool 1
bun run hodlmm-bin-osmosis/hodlmm-bin-osmosis.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgOsmoticIndex": 58.2,
    "isotonicCount": 1,
    "mildlyHypertonicCount": 2,
    "hypertonicCount": 1,
    "severelyHypertonicCount": 1,
    "rapidEquilibratingCount": 1,
    "equilibratingCount": 2,
    "slowDiffusionCount": 1,
    "osmoticLockCount": 1,
    "avgConcentrationGini": 0.342,
    "avgPlasmolysisRisk": 18.5,
    "totalHypertonicZones": 12
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "activeBin": 8388608,
      "binsAnalyzed": 25,
      "totalUsd": 140000,
      "avgOsmoticPressure": 0.45,
      "maxOsmoticPressure": 2.1,
      "maxOsmoticBin": 8388612,
      "osmoticGradient": 0.32,
      "semipermeability": 0.72,
      "tonicityLeft": 1.2,
      "tonicityRight": 0.8,
      "tonicityAsymmetry": 0.2,
      "hypertonicZones": 3,
      "hypotonicZones": 2,
      "isotonicZones": 19,
      "osmoticFlowDirection": "LEFT_TO_RIGHT",
      "netOsmoticFlux": -0.015,
      "plasmolysisRisk": 12,
      "lysisRisk": 5,
      "turgorPressure": 14,
      "osmoticEfficiency": 72,
      "concentrationGini": 0.28,
      "diffusionRate": 2.4,
      "equilibriumDistance": 2.8,
      "osmoticIndex": 65,
      "osmoticClass": "MILDLY_HYPERTONIC",
      "flowTendency": "EQUILIBRATING",
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

- Osmotic pressure uses log concentration ratios, which amplify small differences near zero. Bins with very low reserves produce artificially high pressure readings. The 0.01 floor on concentration mitigates but doesn't eliminate this.
- Tonicity (average concentration per side) is sensitive to where the active bin falls. If the active bin is near one edge, one side has many more bins than the other, making the tonicity comparison asymmetric.
- Hypertonic/isotonic zone classification uses fixed thresholds (1.5x ratio). These are heuristic and not calibrated to empirical DLMM execution data.
- Semipermeability measures pressure uniformity, not actual membrane resistance. Real bin boundaries have identical mechanics; the metaphor applies to concentration differentials, not physical barriers.
- Diffusion rate assumes trading volume is the primary equilibrating force. In practice, LP additions/removals also change concentration without going through bin boundaries.
- Plasmolysis/lysis risks are structural assessments, not predictions. A bin at plasmolysis risk may persist indefinitely if no rebalancing occurs.
- Concentration Gini treats all bins equally regardless of proximity to the active bin. Edge bins far from the active bin contribute the same as adjacent bins despite having less execution relevance.
- Equilibrium distance is a synthetic metric combining pressure and bin count. It is useful for cross-pool comparison but does not represent a physical distance or time-to-equilibrium.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
