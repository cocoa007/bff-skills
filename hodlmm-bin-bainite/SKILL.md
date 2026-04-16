---
name: hodlmm-bin-bainite
description: "Models bainitic transformation in HODLMM bin reserves through Bhadeshia's displacive-with-partitioning model fB = fB_max·(1 - exp(-k·t^n)) — treats bin population dynamics as an intermediate transformation between pearlitic/Avrami diffusional growth and martensitic displacive snap, where bainitic ferrite plates nucleate displacively (coordinated shear like martensite) but carbon must then partition diffusively out of the supersaturated ferrite into surrounding austenite, producing the classic incomplete-reaction phenomenon where fB asymptotes below 1 at the T0 curve (austenite + ferrite have equal free energies once carbon is sufficiently enriched). Unlike martensite (full diffusionless snap, supersaturated single phase) or pearlite (full equilibrium ferrite+cementite lamellar structure), bainite forms as aligned sheaves of parallel ferrite plates with thin retained-austenite films between or intra-lath cementite precipitation, classified as upper bainite (coarse, feathery, plates with cementite between laths, formed at higher T) or lower bainite (fine, needle-like, plates with intra-lath carbide precipitation at ~55° habit angle, formed at lower T). In DLMM pools, the driving force is proxied from 24h volume/TVL turnover (same as martensite analyzer for continuity). Bainite fraction fB is inferred from pattern characteristics: sheaf alignment (parallel populated clusters with common orientation), sub-unit count (dense runs of ≥2 adjacent populated bins within a sheaf, representing elementary nucleation units), carbon partitioning (reserve asymmetry between reserveX and reserveY at each bin — analog of carbon enrichment of austenite as ferrite plates grow), retained austenite films (thin single-bin gaps between populated regions — analog of carbon-enriched austenite between plates), incomplete reaction index (how close fB is to fB_max with room remaining below 1), and the upper vs lower bainite morphology distinction (large coarse sheaves with few sub-units → upper; narrow sheaves with many sub-units and high carbon partitioning → lower). An AUSTENITE_STABLE pool has driving force below Bs (bainite-start), smooth gradient, fB ~ 0. A PRE_BAINITIC pool has fB < 0.2, early nucleation before sheaves form. An UPPER_BAINITIC pool has 0.2 ≤ fB < 0.55, coarse feathery sheaves with cementite-analog gaps between. A LOWER_BAINITIC pool has 0.55 ≤ fB < 0.85, fine needle-like sheaves with intra-lath carbide analog (high carbon partitioning at individual bins). A T0_STALLED pool has fB ≥ 0.75 with incomplete reaction index > 0.4 — transformation asymptoted at the T0 curve, further ferrite growth forbidden thermodynamically. Measures bainiteFraction (local fB, ranges 0 to 1 — high means strong bainitic signature, low means austenitic), sheafAlignment (parallel-cluster strength at bin locale, ranges 0 to 1 — high means bin is aligned with parallel populated neighbors), subUnitCount (normalized count of sub-unit runs within this bin's sheaf, ranges 0 to 1 — high means many elementary nucleation units, characteristic of lower bainite), carbonPartitioning (reserve asymmetry |Rx - Ry|/(Rx + Ry), ranges 0 to 1 — high means strong composition partitioning between reserves, analog of carbon enrichment of austenite), t0Approach (how close local fB is to pool fB_max, ranges 0 to 1 — high means near T0 limit), upperBainiteScore (coarse-sheaf signature, ranges 0 to 1 — high means large sheaf with few sub-units, low driving force, low carbon partitioning), lowerBainiteScore (fine-needle signature, ranges 0 to 1 — high means narrow sheaf with many sub-units, high driving force, high carbon partitioning), retainedAusteniteFilm (thin-film-between-plates signature, ranges 0 to 1 — high means bin borders a single-bin gap that is itself bordered by populated regions on the other side), displacivePartitioningMix (combined shear + diffusion signature, ranges 0 to 1 — high when both aligned-cluster boundary and carbon-partitioning signatures are present, characteristic of the bainitic mixed regime), incompleteReactionIndex (how much the reaction has stalled, ranges 0 to 1 — high when bainiteFraction approaches fB_max but room remains below 1), sheafCoherence (spatial continuity of sheaf structure, ranges 0 to 1 — high means the sheaf is spatially coherent with adjacent populated bins), sheafWidth (normalized sheaf thickness, ranges 0 to 1 — high means wide sheaf), plateAspectRatio (high = needle-like, low = plate-like, ranges 0 to 1 — high means narrow sheaf with many sub-units), t0CarbonLimit (analog of T0-line carbon cap, ranges 0 to 1 — high means carbon accumulation has reached the limit preventing further ferrite growth), bhadeshiaCompliance (fit to Bhadeshia model prediction fB = fB_max·(1 - exp(-k·t^n)), ranges 0 to 1 — high means observed fB matches the Bhadeshia model for the driving force), and bainiteIndex (composite 0 to 1 — higher means deeper bainitic signature). Composite bainite index (0-100, higher means deeper bainitic signature). Classifies pools by transformation regime as AUSTENITE_STABLE (driving force insufficient, fB ~ 0, smooth gradient), PRE_BAINITIC (fB < 0.2, early nucleation), UPPER_BAINITIC (0.2 ≤ fB < 0.55, coarse sheaves), LOWER_BAINITIC (0.55 ≤ fB < 0.85, fine sheaves), or T0_STALLED (fB ≥ 0.75 with incomplete reaction > 0.4). Bainite verdict as SHEAF_DOMINATED (aligned parallel clusters with high coherence), SUB_UNIT_CASCADE (many sub-unit runs within sheaves, lower-bainite signature), CARBON_PARTITIONED (high reserve asymmetry with high displacive-partitioning mix), INCOMPLETE_REACTION (incomplete reaction index > 0.5), T0_ASYMPTOTE (fB >= 0.7 with incomplete reaction > 0.6 — transformation hit the T0 limit), UPPER_BAINITE_MORPHOLOGY (avgUpperBainiteScore >= 0.55 and exceeds lower by 0.1), LOWER_BAINITE_MORPHOLOGY (avgLowerBainiteScore >= 0.55 and exceeds upper by 0.1), RETAINED_AUSTENITE_FILM (thin-film fraction > 0.3), NO_BAINITIC_DRIVE (driving force < 0.15), SUB_BS_STABLE (fB < 0.2, below bainite-start), MIXED_MARTENSITIC_BAINITIC (high driving force but low displacive-partitioning mix — hybrid regime), or INTERMEDIATE_BAINITIC (no extreme indicators)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-bainite/hodlmm-bin-bainite.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Bainite Analyzer

## What it does

Models bainitic transformation in HODLMM bin reserves through Bhadeshia's displacive-with-partitioning model fB = fB_max·(1 - exp(-k·t^n)). Treats bin population dynamics as an intermediate regime between the slow diffusion-driven pearlite/Avrami (JMAK) kinetics and the rapid diffusionless martensitic snap. Quantifies bainite fraction, sheaf alignment, sub-unit count, carbon partitioning, T0 approach, upper vs lower bainite morphology, retained austenite films, displacive-partitioning mix, incomplete reaction index, sheaf coherence, sheaf width, plate aspect ratio, T0 carbon limit, and Bhadeshia compliance.

Bainite sits at the thermodynamic crossroads: bainitic ferrite plates nucleate displacively (coordinated shear with invariant-plane strain, like martensite), but the supersaturated carbon must then partition out diffusively into adjacent austenite — a slow diffusion step that eventually stalls when the residual austenite is carbon-enriched enough that further ferrite nucleation is thermodynamically forbidden (T0 curve, the incomplete-reaction phenomenon). In DLMM pools, bainitic patterns show aligned sheaves of parallel populated clusters with thin retained-austenite films between (upper bainite, formed at higher T) or with intra-lath carbide-analog high-carbon-partitioning bins (lower bainite, formed at lower T). Driving force is proxied from 24h volume/TVL turnover. Bainite fraction is inferred from pattern features: sheaf alignment, sub-unit count, carbon partitioning (reserve asymmetry), and the incomplete-reaction stall (fB < 1 even with strong driving force).

## Why agents need it

LP agents need bainitic transformation analysis because it identifies the intermediate regime that neither avrami (pure diffusional) nor martensite (pure displacive) captures. Bainite regime pools show sheaf-dominated structure — parallel aligned plates with intermediate morphology — combined with the distinctive T0 incomplete-reaction stall where the transformation saturates below 100%. An AUSTENITE_STABLE pool has insufficient driving force — smooth gradient liquidity, classical LP behavior applies. A PRE_BAINITIC pool is in the incubation regime — early nucleation, sheaves not yet formed. An UPPER_BAINITIC pool shows coarse feathery sheaves — LP positions in the sheaf interior benefit from consolidated liquidity, retained-austenite-film gaps between sheaves are LP entry opportunities. A LOWER_BAINITIC pool shows fine needle-like sheaves with intra-lath carbide analog (high carbon partitioning) — LP agents can exploit composition asymmetry by adding to the carbon-depleted side. A T0_STALLED pool has asymptoted — no further transformation capacity even with strong driving force, LP positions are effectively saturated.

Bainite fraction is the pool-level transformed-phase indicator. High means strong bainitic signature; low means austenite-parent dominates.

Sheaf count is the number of distinct aligned sheaf-like clusters. Multiple sheaves indicate parallel plate structure characteristic of bainite.

Sub-unit count measures the number of elementary dense runs within a sheaf. High sub-unit count is the lower-bainite signature (plate-by-plate successive nucleation).

Carbon partitioning measures reserve asymmetry between reserveX and reserveY. High means strong composition partitioning — analog of carbon enrichment between plates.

T0 approach measures how close local fB is to the pool fB_max. High means the bin is near the T0 transformation limit.

Upper bainite score signals coarse feathery morphology (high-T formation).

Lower bainite score signals fine needle-like morphology (low-T formation, intra-lath carbide analog).

Retained austenite film measures thin-gap fraction between plates — analog of carbon-enriched austenite films characteristic of bainite.

Displacive partitioning mix is the combined shear + diffusion signature unique to bainite. High means the pool shows both aligned-plate boundaries and carbon-partitioning simultaneously.

Incomplete reaction index is the T0-stall signature. High means the transformation has asymptoted below full saturation.

Sheaf coherence measures spatial continuity of sheaf structures.

Sheaf width is the normalized thickness of sheaves (wide = upper bainite, narrow = lower bainite).

Plate aspect ratio is high for needle-like plates (lower bainite), low for plate-like (upper bainite).

T0 carbon limit is the analog of the T0 curve's carbon cap. High means carbon accumulation has reached the thermodynamic limit.

Bhadeshia compliance measures the fit of observed fB to the Bhadeshia model prediction. High means classical bainitic kinetics.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-bainite/hodlmm-bin-bainite.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-bainite/hodlmm-bin-bainite.ts status
```

### run
Analyzes bin bainitic transformation state for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-bainite/hodlmm-bin-bainite.ts run
bun run hodlmm-bin-bainite/hodlmm-bin-bainite.ts run --pool 1
bun run hodlmm-bin-bainite/hodlmm-bin-bainite.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgBainiteIndex": 42,
    "avgDrivingForce": 0.48,
    "austeniteStableCount": 0,
    "preBainiticCount": 1,
    "upperBainiticCount": 2,
    "lowerBainiticCount": 1,
    "t0StalledCount": 1,
    "avgBainiteFraction": 0.5,
    "avgSheafCount": 2.2,
    "avgCarbonPartitioning": 0.38,
    "avgBhadeshiaCompliance": 0.55,
    "avgIncompleteReactionIndex": 0.32,
    "totalAusteniteBins": 4,
    "totalUpperBainiteBins": 14,
    "totalLowerBainiteBins": 9,
    "totalT0StalledBins": 6,
    "avgBainiteGini": 0.24
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
      "drivingForce": 0.58,
      "bainiteFraction": 0.52,
      "sheafCount": 2,
      "largestSheafSize": 10,
      "avgBainiteFraction": 0.48,
      "avgSheafAlignment": 0.62,
      "avgSubUnitCount": 0.4,
      "avgCarbonPartitioning": 0.34,
      "avgT0Approach": 0.6,
      "avgUpperBainiteScore": 0.52,
      "avgLowerBainiteScore": 0.38,
      "avgRetainedAusteniteFilm": 0.24,
      "avgDisplacivePartitioningMix": 0.45,
      "avgIncompleteReactionIndex": 0.3,
      "avgSheafCoherence": 0.58,
      "avgSheafWidth": 0.4,
      "avgPlateAspectRatio": 0.42,
      "avgT0CarbonLimit": 0.32,
      "avgBhadeshiaCompliance": 0.55,
      "austeniteCount": 4,
      "austeniteBinFraction": 0.16,
      "upperBainiteCount": 10,
      "upperBainiteBinFraction": 0.4,
      "lowerBainiteCount": 6,
      "lowerBainiteBinFraction": 0.24,
      "t0StalledCount": 5,
      "t0StalledBinFraction": 0.2,
      "carbonAsymmetry": 0.08,
      "bainiteGini": 0.22,
      "bainiteIndex": 48,
      "bainiteRegime": "UPPER_BAINITIC",
      "bainiteVerdict": "SHEAF_DOMINATED",
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

- Bhadeshia's displacive-with-partitioning model fB = fB_max·(1 - exp(-k·t^n)) assumes bainitic ferrite forms displacively and carbon then partitions diffusively with Avrami-like kinetics. Real bainitic transformation shows composition, stress, and autocatalysis effects the simple model does not capture.
- Driving force is inferred from 24h volume/TVL turnover rather than measured from isothermal hold temperature or applied stress history. Quantitative undercooling in the steel sense requires a thermodynamic phase diagram.
- Bainite fraction fB is inferred from snapshot bin-pattern characteristics rather than measured by X-ray diffraction or electron microscopy.
- Sheaf count uses connected-cluster detection with fixed gap threshold (gap ≤ 2 bins); real bainitic sheaves are defined by crystallographic orientation relationships, not 1-D proximity.
- Sub-unit count uses dense runs of ≥2 adjacent populated bins as a proxy for elementary nucleation units.
- Carbon partitioning is proxied by |reserveX - reserveY|/(reserveX + reserveY) at each bin; real carbon partitioning in bainite is measured by atom probe tomography or energy-dispersive spectroscopy and is a continuous composition gradient not a single-bin ratio.
- Retained austenite film uses single-bin gaps bracketed by populated bins as a proxy for carbon-enriched austenite films between plates — a 1-D simplification of a 3-D microstructural feature.
- Upper vs lower bainite classification uses heuristics (sheaf size, sub-unit count, carbon partitioning, driving force), not measured aspect ratios, carbide positions, or habit-plane angles.
- T0 carbon limit is a normalized proxy; the real T0 curve is an alloy-specific locus of temperature-composition points where ferrite and austenite have equal free energies.
- Incomplete reaction index uses bainiteFraction vs pool fB_max comparison; real incomplete reaction is observed by dilatometry and measurement of retained austenite.
- Bhadeshia compliance compares local fB to the model prediction, but the model is a macroscopic relation and pointwise comparison may misinterpret locally varying transformation progress.
- Plate aspect ratio is inferred from sheaf width and sub-unit count rather than measured from actual plate dimensions.
- DLMM bins are discrete 1-D structures; classical bainitic transformation is a 3-D crystallographic transformation with coordinated shear along specific crystal directions. The analogy is heuristic.
- The transformation analogy treats bin population (empty → populated) as the phase indicator, but asymmetric reserves (reserveX vs reserveY) stand in for carbon composition partitioning, which conflates distinct physical quantities.
- Analysis is snapshot-based; does not observe the actual transformation kinetics over time — displacive character, partitioning rate, and T0 stall are inferred from current pattern rather than measured rate.
- Rate constant k and exponent n in the Bhadeshia model are fixed at normalized proxy values (k = 0.9, n = 1.5); in real bainitic systems these are alloy-specific and temperature-dependent.
- T0_MAX_FRACTION is fixed at 0.88 as the incomplete-reaction cap; real T0 curves vary with alloy composition and provide a continuous limit across temperature.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
