---
name: hodlmm-bin-scattering
description: "Models particle scattering physics across HODLMM bins — treats each bin as a scattering center whose cross-section (reserve depth relative to the largest bin) determines how trade impact disperses across the bin range. Measures cross-section (normalized reserve depth — how large a target the bin presents to incoming trade volume, larger bins intercept more impact like larger particles scatter more photons), mean free path (average bin spacing — the typical distance trade impact travels before encountering the next populated bin, sparse ranges have long mean free paths allowing impact to propagate unchecked), scattering angle (composition mismatch with neighbors mapped to radians — how sharply impact deflects when hitting a bin whose token ratio differs from its surroundings, like a photon deflecting off a refractive boundary), opacity (cross-section weighted by volume absorption — how much trade impact a bin absorbs versus transmits, high-opacity bins act as liquidity sinks that terminate impact propagation), albedo (fraction of impact reflected rather than absorbed — bins with low volume relative to reserves reflect most impact to neighbors while active bins absorb it, analogous to surface reflectivity), attenuation (exponential decay of impact with distance from active bin weighted by cross-section — how quickly trade effects fade as they propagate through the bin range), forward scattering ratio (fraction of neighbor reserves ahead versus behind — directional bias of impact propagation, forward-dominated scattering means impact flows consistently in one direction while isotropic scattering disperses equally), backscatter fraction (complement of forward ratio — impact reflected backward toward the active bin), phase function (angular distribution of scattered impact using Henyey-Greenstein-like model — peaks at forward scattering for bins aligned with neighbors), extinction coefficient (cross-section amplified by composition mismatch — total rate of impact removal from the incident direction through both absorption and scattering), absorption coefficient (extinction weighted by volume absorption — rate at which trade impact is converted to fee revenue or liquidity changes), optical depth (extinction times mean free path — cumulative opacity along the path through the bin range, high optical depth means impact cannot penetrate through), impact parameter (inverse distance from active bin — bins closer to the active price intercept impact more directly), differential cross-section (cross-section times phase function times impact parameter — directional scattering efficiency at a specific angle and distance), total cross-section (cross-section amplified by composition mismatch — aggregate scattering target area), scattering Gini (inequality of opacity across bins — 0 means uniform scattering medium while 1 means opacity concentrated in few bins creating bright spots and shadows), scattering coherence (uniformity of scattering angles — high coherence means bins scatter similarly suggesting a homogeneous medium while low coherence means heterogeneous scattering), anisotropy factor (directional bias of scattering from -1 pure backscatter through 0 isotropic to +1 pure forward scatter), and composite scattering index (0-100 from transparency, coherence, low extinction, and forward scattering), classifying pools by scattering regime as BALLISTIC (index >= 80 — impact propagates freely through the bin range with minimal scattering like photons through clear glass, bins are transparent with low cross-sections and aligned compositions), FORWARD_DOMINATED (60-80 — impact scatters but primarily in the forward direction maintaining directional coherence, like light through frosted glass), DIFFUSIVE (40-60 — impact scatters in many directions losing directional memory, propagating as a random walk through the bin range like light in fog), ABSORPTIVE (20-40 — bins absorb most impact with little transmission, like light hitting dark material, trade effects are localized near the point of entry), or OPAQUE_WALL (< 20 — the bin range is impenetrable to impact propagation, concentrated liquidity walls block all transmission creating sharp boundaries), and by pattern verdict as TRANSPARENT (mostly transparent bins with low opacity), TRANSLUCENT (mix of transparent and translucent bins), SCATTERING (significant opacity causing impact dispersion), ABSORBING (high absorption terminating impact propagation), or OPAQUE (dense opaque medium blocking all transmission)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-scattering/hodlmm-bin-scattering.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Scattering Analyzer

## What it does

Models particle scattering physics across HODLMM bins. In physics, scattering describes how particles (photons, neutrons, electrons) change direction when they interact with matter. The scattering cross-section determines how likely an interaction is — larger targets scatter more particles. The mean free path is the average distance between scattering events. Opacity measures how much of the incident beam is absorbed versus transmitted. Together these determine whether a medium is transparent (ballistic propagation), translucent (forward scattering), diffusive (random walk), or opaque (full absorption).

In DLMM pools, each bin acts as a scattering center for trade impact. When a swap hits a bin, part of the impact is absorbed (converted to fee revenue and reserve changes) and part is scattered to neighboring bins (price displacement that propagates through the range). Deep bins have large cross-sections — they intercept more impact. Bins with compositions mismatched from their neighbors scatter impact at wider angles, deflecting it from the original direction. The mean free path between populated bins determines how far impact travels between interactions.

## Why agents need it

LP agents need to understand how trade impact propagates through their position range. A bin in a BALLISTIC regime transmits impact freely — a large swap at the active bin will affect distant bins with little attenuation. LP agents in ballistic pools should expect correlated reserve changes across their entire range.

Cross-section reveals which bins are the primary scattering centers. High cross-section bins near the active price absorb the brunt of trade impact, shielding bins behind them. LP agents can use these as impact shields — positioning liquidity behind a deep bin reduces exposure to direct trade effects.

Opacity distinguishes between bins that absorb impact (converting it to fees and reserve changes) versus bins that transmit it. High-opacity bins are fee generators — they capture trade flow. Low-opacity bins let impact pass through, contributing less to fee generation but also experiencing less reserve disruption.

Mean free path indicates how concentrated or dispersed the scattering medium is. Short mean free paths mean dense packing where impact is scattered repeatedly over short distances (diffusive regime). Long mean free paths mean sparse bins where impact propagates long distances between interactions.

Forward scattering ratio reveals directional bias. Forward-dominated scattering means impact flows consistently away from the active bin, creating a predictable wavefront. Isotropic or backscatter-dominated patterns mean impact bounces unpredictably, making reserve changes harder to anticipate.

Optical depth is the cumulative opacity along the entire path. High optical depth means the bin range is effectively opaque — impact from one side cannot reach the other. This creates isolated zones where bins on opposite sides of the range evolve independently.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-scattering/hodlmm-bin-scattering.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-scattering/hodlmm-bin-scattering.ts status
```

### run
Analyzes bin scattering dynamics for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-scattering/hodlmm-bin-scattering.ts run
bun run hodlmm-bin-scattering/hodlmm-bin-scattering.ts run --pool 1
bun run hodlmm-bin-scattering/hodlmm-bin-scattering.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgScatteringIndex": 55,
    "ballisticCount": 1,
    "forwardDominatedCount": 2,
    "diffusiveCount": 1,
    "absorptiveCount": 1,
    "opaqueWallCount": 0,
    "avgCrossSection": 0.42,
    "avgOpacity": 0.35,
    "totalTransparentBins": 18,
    "totalOpaqueBins": 4,
    "avgScatteringGini": 0.38
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
      "avgCrossSection": 0.48,
      "peakCrossSection": 1.0,
      "peakBin": 8388608,
      "transparentCount": 8,
      "translucentCount": 6,
      "opaqueCount": 5,
      "absorbingCount": 4,
      "opaqueWallCount": 2,
      "avgMeanFreePath": 1.5,
      "avgScatteringAngle": 0.15,
      "avgOpacity": 0.38,
      "avgAlbedo": 0.62,
      "avgAttenuation": 0.45,
      "avgForwardScatteringRatio": 0.55,
      "avgBackscatterFraction": 0.45,
      "avgExtinctionCoeff": 0.52,
      "avgAbsorptionCoeff": 0.20,
      "avgOpticalDepth": 0.78,
      "totalOpticalDepth": 19.5,
      "scatteringGini": 0.35,
      "scatteringCoherence": 0.62,
      "anisotropyFactor": 0.10,
      "scatteringIndex": 58,
      "scatteringRegime": "DIFFUSIVE",
      "patternVerdict": "SCATTERING",
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

- Cross-section normalizes to the largest bin in the pool. A bin with 50% of max reserves has a cross-section of 0.5 regardless of absolute value. Two pools with identical normalized cross-sections can have vastly different absolute reserve depths.
- Mean free path uses the average gap between populated bins, not the gap local to each bin. A bin surrounded by dense neighbors and a bin in a sparse region get the same mean free path. Local mean free path would require per-bin calculation that is more computationally expensive.
- Scattering angle is derived from the composition mismatch between a bin and its neighbors, not from actual trade flow data. True scattering angles would require observing how individual trades propagate, which is not available from static reserve snapshots.
- Opacity combines cross-section with estimated volume absorption. Volume estimation uses a proximity-weighted fraction of 24h pool volume, which is a rough proxy. Actual per-bin volume data would require event log analysis.
- Albedo assumes bins with low volume relative to reserves reflect impact. In practice, reflection in DLMM pools is not literal — it means the bin's reserves are large enough that trades cause minimal proportional change, effectively bouncing the impact forward.
- Attenuation uses an exponential decay model. Real impact propagation in DLMM pools depends on the specific bin step size and the price curve, which may not follow exponential decay.
- Forward scattering ratio counts reserves ahead versus behind the bin in the sorted order. This is a spatial proxy for directional scattering — actual trade impact direction depends on whether the trade is a buy or sell.
- Optical depth sums extinction along the path, assuming each bin contributes independently. In practice, a very deep bin may shield bins behind it, creating non-linear effects that additive optical depth cannot capture.
- Phase function uses a cosine model which assumes smooth scattering. Real DLMM bin interactions are discrete — impact either stays in the bin or moves to the next, with no continuous angular distribution.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
