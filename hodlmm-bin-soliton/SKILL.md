---
name: hodlmm-bin-soliton
description: "Detects stable, self-reinforcing liquidity peaks (solitons) in HODLMM bin reserve distributions using sech-squared shape fitting and peak isolation analysis, computing soliton count (number of distinct self-contained liquidity peaks rising above the diffuse background), soliton amplitude (peak USD value above the background level for each detected structure), soliton width (full-width at half-maximum in bins — narrow solitons are highly concentrated, wide ones are more diffuse), shape fidelity (goodness-of-fit to the ideal sech-squared soliton profile where 1.0 = perfect hyperbolic secant squared shape and 0 = no resemblance — soliton waves in physics maintain this characteristic shape because nonlinear self-focusing exactly balances dispersive spreading), soliton energy (total USD value contained within each soliton above background, measuring how much capital the self-reinforcing structure holds), isolation distance (minimum bin gap to the nearest neighboring soliton — well-separated solitons are stable, closely spaced ones may interact), peak-to-background ratio (soliton peak value divided by the diffuse background level — high ratios indicate strongly self-reinforcing structures that dominate their local region), collision proximity (normalized measure of how close the nearest soliton pair is relative to their combined widths — when solitons overlap they can merge, scatter, or annihilate, disrupting the liquidity landscape), soliton energy fraction (proportion of total above-background energy contained in detected solitons vs diffusely spread — high fractions mean liquidity is organized into discrete packets rather than spread evenly), peak confinement (fraction of above-background energy held by the top 20% of bins — measures how tightly liquidity concentrates into peak structures), soliton density (number of solitons per bin in the scan range — high density means many competing structures), and a composite soliton index scoring 0-100 combining count, fidelity, amplitude, energy fraction, confinement, and collision penalty, classifying pools as DIFFUSE (no coherent peak structures — liquidity spread evenly or chaotically), WEAK_PEAKS (identifiable peaks but poor soliton shape — likely transient concentrations), SOLITONIC (clear self-reinforcing peaks with good shape fidelity — stable liquidity structures that resist dispersal), or STRONGLY_SOLITONIC (dominant soliton structures holding most of the pool energy with high shape fidelity), with stability risk rated NONE/LOW/MODERATE/HIGH based on index, collision proximity, and shape fidelity."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-soliton/hodlmm-bin-soliton.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Soliton Analyzer

## What it does

Detects stable, self-reinforcing liquidity peaks in HODLMM bin reserve distributions by fitting each candidate peak against the sech-squared (hyperbolic secant squared) soliton profile. In physics, solitons are nonlinear wave packets that maintain their shape as they propagate because self-focusing effects exactly balance dispersive spreading — a tidal bore traveling unchanged up a river, or a light pulse maintaining its shape in an optical fiber. Applied to DLMM liquidity bins, soliton analysis asks: are there discrete, self-contained liquidity concentrations that hold their structure, and how stable, isolated, and dominant are these structures?

The analyzer constructs a full reserve spectrum by mapping each bin's total USD value across the scan range (filling gaps with zero), estimates the diffuse background level from the lower 40th percentile of bin values, and identifies candidate peaks that rise significantly above background. For each candidate peak, it fits a sech-squared profile — the characteristic shape of a fundamental soliton — by computing the full-width at half-maximum (FWHM), deriving the width parameter sigma from the sech2 relationship (FWHM = 2.634 * sigma), and measuring the residual error between the actual bin values and the predicted soliton shape. The goodness-of-fit (shape fidelity) tells agents whether each peak is a genuine soliton-like structure (high fidelity) or just a random concentration (low fidelity).

Beyond individual peak characterization, the analyzer computes cross-soliton metrics: isolation distance (how far apart neighboring solitons are in bin space — well-separated solitons don't interact and remain stable); collision proximity (normalized overlap measure — when solitons get too close relative to their widths, they enter the interaction zone where merging, scattering, or destructive interference can occur); energy fraction (what proportion of total above-background liquidity is organized into discrete soliton structures vs spread diffusely); and peak confinement (how tightly the top 20% of bins concentrate the total above-background energy).

## Why agents need it

Solitonic liquidity structures create stable, predictable concentrations that fundamentally differ from random peaks or periodic patterns. A pool with high soliton index has its liquidity organized into discrete, self-reinforcing packets — each packet holds its shape because the concentrated deposits at the peak create an energy minimum (in the liquidity landscape sense) that resists dispersal. Trading agents routing through solitonic pools can predict exactly where deep liquidity sits: each soliton's peak bin offers the best execution, while the gaps between solitons are thin and high-slippage. LP agents can use soliton analysis to decide positioning strategy: placing liquidity at a soliton peak adds to a self-reinforcing structure (the soliton gets stronger), while placing it in the gap between solitons creates a new, potentially unstable structure.

Collision proximity is the key risk metric. When two solitons approach each other (collision proximity > 0.7), their interaction becomes unpredictable — in physics, soliton collisions can be elastic (they pass through each other unchanged), partially inelastic (they exchange energy), or totally inelastic (they merge into one). In liquidity terms, closely spaced peaks may merge into a single broader concentration (reducing the sharp peak advantage), or one may drain toward the other (creating sudden liquidity gaps). High collision proximity combined with a large soliton index signals an unstable but temporarily deep pool — good for large trades right now, dangerous for long-term LP positions.

Shape fidelity distinguishes structural solitons from transient spikes. A peak with high fidelity (> 0.6) closely matches the sech-squared profile, suggesting it was built by deliberate, concentrated provisioning that creates a self-reinforcing structure. Low-fidelity peaks (< 0.3) are irregular concentrations — likely the result of random deposits or partial withdrawals — that can dissipate unpredictably. The soliton class (DIFFUSE through STRONGLY_SOLITONIC) gives agents a quick filter: DIFFUSE pools have no discrete structure and behave like uniform liquidity; STRONGLY_SOLITONIC pools are dominated by a few deep, sharp, stable peaks with predictable slippage profiles.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-soliton/hodlmm-bin-soliton.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-soliton/hodlmm-bin-soliton.ts status
```

### run
Fetches bin reserves for top pools (or a specific pool) and computes all soliton metrics. Outputs a human-readable table plus JSON to stdout.
```bash
bun run hodlmm-bin-soliton/hodlmm-bin-soliton.ts run
bun run hodlmm-bin-soliton/hodlmm-bin-soliton.ts run --pool 1
bun run hodlmm-bin-soliton/hodlmm-bin-soliton.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgSolitonIndex": 38.2,
    "diffuseCount": 1,
    "weakPeaksCount": 2,
    "solitonicCount": 1,
    "stronglySolitonicCount": 1,
    "noneCount": 1,
    "lowCount": 2,
    "moderateCount": 1,
    "highCount": 1,
    "avgSolitonCount": 3.4,
    "avgShapeFidelity": 0.52,
    "avgEnergyFraction": 0.64,
    "avgCollisionProximity": 0.25
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "solitonIndex": 55,
      "solitonClass": "SOLITONIC",
      "stabilityRisk": "MODERATE",
      "solitonCount": 4,
      "avgShapeFidelity": 0.58,
      "avgAmplitude": 1250.50,
      "avgWidth": 3.2,
      "solitonEnergyFraction": 0.72,
      "collisionProximity": 0.35,
      "peakConfinement": 0.81,
      "minIsolationDistance": 4,
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
- Sech-squared fitting assumes each peak is independent; overlapping solitons may yield reduced fidelity scores even if the combined structure is stable.
- Background level estimated from lower 40th percentile of bin values; pools with very few empty bins may overestimate the background.
- Shape fidelity uses R-squared against the sech2 model; peaks with asymmetric shapes (steeper on one side) will show reduced fidelity even if structurally stable.
- FWHM-based width measurement requires the peak to drop below half-maximum within the scan range; solitons wider than the scan radius are truncated.
- Collision proximity is a static snapshot; it does not predict whether solitons are moving toward or away from each other.
- Peak detection requires a bin to be strictly greater than both neighbors; flat-topped peaks (equal adjacent bins) are not detected.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
- Read-only; does not reflect pending mempool transactions.
