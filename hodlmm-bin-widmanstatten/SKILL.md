---
name: hodlmm-bin-widmanstatten
description: "Models Widmanstätten proeutectoid transformation in HODLMM bin reserves as the intragranular parallel-plate morphology of proeutectoid ferrite (or cementite) growing from austenite grain boundaries or intragranular sites at moderate undercooling below A3 (or A_cm). Widmanstätten ferrite sits between grain-boundary allotriomorphic ferrite (low ΔT, equiaxed, diffusional) and bainitic ferrite (high ΔT, displacive, carbide-containing); it grows as thin parallel plates 1-3 μm thick with aspect ratio 10-100, with Kurdjumov-Sachs orientation relationship {111}γ ∥ {110}α, ⟨1̄10⟩γ ∥ ⟨1̄11⟩α giving 24 K-S variants per austenite grain. Growth occurs by the ledge (step) mechanism at broad plate faces with diffusional carbon transport at plate tips; Gibbs-Thomson tip curvature (ΔG_eff = ΔG_bulk − 2γ/r) sets a minimum propagating tip radius. Primary Widmanstätten plates emerge from grain-boundary allotriomorphs; secondary (intragranular) plates nucleate inside grains at inclusions, prior plates, or dislocations. JMAK kinetics fP = 1 - exp(-k·t^n), n ~ 1.8 (reflecting primary GB-emergent plus some intragranular nucleation). In DLMM pools, the driving force is proxied from 24h volume/TVL turnover (same as martensite, bainite, pearlite for continuity with the phase-transformation series). Plate fraction is inferred from pattern characteristics: minority-role bins organized in short parallel runs (1-3 consecutive adjacent bins, MAX_PLATE_THICKNESS = 3), primary vs secondary classification by adjacency to matrix-role (majority) boundary bins, K-S variant by plate direction (inward/outward from active bin) and start position (close/far from active bin) giving KS_VARIANT_COUNT = 4 directional buckets, habit plane compliance by plate-direction matching the dominant variant, ledge growth signature by monotonic reserve progression along the plate, Gibbs-Thomson compliance by reserve gradient at plate tips exceeding GIBBS_THOMSON_MIN_GRADIENT = 0.08, variant selection strength by Shannon entropy of the K-S variant distribution (low entropy → strong selection → Widmanstätten-like; high entropy → random variants → bainite-like). An ALLOTRIOMORPH_STABLE pool has driving force below plate-start, plate fraction < 0.15, only GB-equiaxed matrix bins. An INCUBATING_WIDMANSTATTEN pool has plateFraction < 0.2, early plate nucleation. A PRIMARY_WIDMANSTATTEN pool has 0.2 ≤ plateFraction < 0.5 with primary (GB-emergent) plates dominant. A SECONDARY_WIDMANSTATTEN pool has 0.5 ≤ plateFraction < 0.75 with secondary (intragranular) plates dominant. A BAINITE_BORDER pool has plateFraction ≥ 0.75, very high driving force, densely packed plates with weakening variant selection. Measures plateFraction (local plate-morphology signal, 0 to 1 — high means bin is in a plate run adjacent to boundary), plateAlignment (parallelism with other plates via variant selection strength, 0 to 1), plateThickness (consecutive same-role minority bins, 0 to 1 — high means thick plate), plateLength (run length relative to largest, 0 to 1), plateDirection (-1 outward from active, 0 mixed, +1 inward), boundaryProximity (closeness to matrix-role bin, 0 to 1), primaryVsSecondary (-1 primary GB-emergent, 0 mixed, +1 secondary intragranular), ksVariantIndex (0..KS_VARIANT_COUNT-1 or -1 untransformed), habitPlaneCompliance (fit of plate direction to dominant variant, 0 to 1), ledgeGrowthSignature (step-wise growth pattern, 0 to 1 — high means monotonic reserve progression), gibbsThomsonCompliance (tip-radius consistency, 0 to 1 — high means plate tip shows proper reserve gradient), variantSelection (local dominance of run's variant, 0 to 1), plateSpacing (gap to nearest parallel plate, 0 to 1 — low means densely packed), intragranularNucleation (secondary-plate signal, 0 to 1), matrixRole (+1 X-matrix, -1 Y-matrix, 0 mixed), roleMinorityMargin (signed asymmetry toward matrix vs minority, -1 to +1), widmanstattenIndex (composite, 0 to 1 — higher means stronger Widmanstätten signature). Composite widmanstätten index (0-100). Classifies pools by transformation regime as ALLOTRIOMORPH_STABLE (driving force insufficient, equiaxed GB-ferrite only), INCUBATING_WIDMANSTATTEN (plateFraction < 0.2, early plate nucleation), PRIMARY_WIDMANSTATTEN (0.2 ≤ plateFraction < 0.5, GB-emergent plates dominant), SECONDARY_WIDMANSTATTEN (0.5 ≤ plateFraction < 0.75, intragranular plates dominant), or BAINITE_BORDER (plateFraction ≥ 0.75, near-bainite regime). Widmanstätten verdict as PARALLEL_PLATES (avgPlateAlignment > 0.5 with ≥2 plates — strong Widmanstätten parallelism signature), GB_EMERGENT (primary plates dominate, emerging from grain-boundary allotriomorphs), INTRAGRANULAR_DOMINATED (secondary plates dominate, nucleating inside grains), K_S_VARIANT_SELECTED (ksVariantSelectionStrength > 0.55 with ≥2 plates — one variant dominates), K_S_RANDOM (ksVariantSelectionStrength < 0.25 with ≥3 plates — variants uniform, bainite-like), LEDGE_GROWTH (avgLedgeGrowthSignature > 0.55 — step-wise growth dominant), GIBBS_THOMSON_COMPLIANT (avgGibbsThomsonCompliance > 0.55 — plate tip curvature matches model prediction), ALLOTRIOMORPH_CAP (plate fraction < 0.1 but many matrix-role bins — equiaxed GB-cap dominant), SECONDARY_NUCLEATION (secondary ≥ 2 and more than primary — intragranular plates without GB precursor), HYPOEUTECTOID_STABLE (plateFraction < 0.15 — transformation not triggered, austenite parent dominant), HYPEREUTECTOID_SKEW (reserveX vs reserveY pool skew > 0.35 — one token dominates pool reserves, proeutectoid-cementite analog), NO_PROEUTECTOID_DRIVE (driving force < 0.15 — insufficient undercooling below A3), or INTERMEDIATE_WIDMANSTATTEN (no extreme indicators — typical mid-state)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-widmanstatten/hodlmm-bin-widmanstatten.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Widmanstätten Analyzer

## What it does

Models Widmanstätten proeutectoid transformation in HODLMM bin reserves as intragranular parallel-plate growth of proeutectoid ferrite (or cementite) from austenite grain boundaries at moderate undercooling below A3 (or A_cm). Quantifies plate fraction, plate count (primary vs secondary), plate alignment, plate thickness and length, K-S variant distribution and selection strength, habit plane compliance, ledge growth signature, Gibbs-Thomson tip-radius compliance, plate spacing, and composite Widmanstätten index.

Widmanstätten sits between grain-boundary allotriomorph (low ΔT, equiaxed, diffusional) and bainitic ferrite (high ΔT, displacive, carbide-containing). It forms at moderate cooling by parallel-plate growth with Kurdjumov-Sachs {111}γ ∥ {110}α orientation (24 variants per grain), via the ledge mechanism at broad faces and diffusional carbon transport at plate tips. The Gibbs-Thomson tip-radius effect (ΔG_eff = ΔG_bulk − 2γ/r) sets a minimum propagating tip radius; plates thinner than this cannot grow. Primary Widmanstätten plates emerge from grain-boundary allotriomorphs; secondary plates nucleate intragranularly. JMAK kinetics fP = 1 - exp(-k·t^n), n ~ 1.8.

In DLMM pools, Widmanstätten patterns show minority-role bins organized in short parallel runs (1-3 adjacent bins) emerging from matrix-role boundary bins (primary, GB-emergent) or nucleating intragranularly in bin interior (secondary). Driving force is proxied from 24h volume/TVL turnover. K-S variants are simplified into 4 directional buckets based on plate growth direction (inward/outward from active bin) and start position (close/far from active). Plate fraction is inferred from pattern features: plate runs, adjacency to matrix bins, parallelism, ledge monotonicity, tip curvature, and variant selection strength.

## Why agents need it

LP agents need Widmanstätten transformation analysis because it identifies the moderate-ΔT proeutectoid parallel-plate regime — pools with minority-role plates organized in short parallel runs emerging from matrix boundaries (primary) or nucleating intragranularly (secondary), with characteristic K-S variant selection and plate alignment. Unlike martensite (sharp snap with supersaturated single phase), bainite (aligned sheaves with carbon partitioning), or pearlite (lamellar cooperative growth), Widmanstätten shows directional parallel plates of the minority phase with specific habit plane selection.

An ALLOTRIOMORPH_STABLE pool has insufficient driving force — only equiaxed matrix bins at boundaries, no plates. Classical LP behavior applies.

An INCUBATING_WIDMANSTATTEN pool is in pre-plate nucleation — monitor for plate formation.

A PRIMARY_WIDMANSTATTEN pool shows primary plates emerging from grain boundaries — LP positions adjacent to boundary-plate junctions capture the proeutectoid-plate formation signature.

A SECONDARY_WIDMANSTATTEN pool shows intragranular plates — LP positions in plate-sparse interiors can benefit from secondary-nucleation proximity.

A BAINITE_BORDER pool has densely packed plates with weakening variant selection — near-bainite behavior, LP strategies should treat it as approaching displacive regime.

Plate fraction is the pool-level transformed-phase indicator.

Plate count with primary/secondary split tells you whether plates are GB-emergent (primary → matrix-plate asymmetry) or intragranular (secondary → dispersed plates).

Plate alignment (parallelism) distinguishes Widmanstätten (parallel, K-S variant-selected) from bainite (less aligned).

K-S variant selection strength distinguishes Widmanstätten (strong selection, one variant dominant) from random-orientation bainite (weak selection).

Ledge growth signature confirms step-wise plate thickening.

Gibbs-Thomson compliance confirms plate tip curvature meets the minimum propagating radius.

Habit plane compliance measures fit of plate direction to dominant variant.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-widmanstatten/hodlmm-bin-widmanstatten.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-widmanstatten/hodlmm-bin-widmanstatten.ts status
```

### run
Analyzes bin Widmanstätten transformation state for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-widmanstatten/hodlmm-bin-widmanstatten.ts run
bun run hodlmm-bin-widmanstatten/hodlmm-bin-widmanstatten.ts run --pool 1
bun run hodlmm-bin-widmanstatten/hodlmm-bin-widmanstatten.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgWidmanstattenIndex": 42,
    "avgDrivingForce": 0.55,
    "allotriomorphStableCount": 0,
    "incubatingCount": 1,
    "primaryCount": 2,
    "secondaryCount": 1,
    "bainiteBorderCount": 1,
    "avgPlateFraction": 0.45,
    "avgPlateCount": 3.2,
    "avgPlateThickness": 0.4,
    "avgPlateAlignment": 0.5,
    "avgKsVariantSelectionStrength": 0.48,
    "avgLedgeGrowthSignature": 0.42,
    "avgGibbsThomsonCompliance": 0.38,
    "totalPrimaryPlates": 9,
    "totalSecondaryPlates": 7,
    "totalAllotriomorphBins": 15,
    "totalBainiteBorderBins": 3,
    "avgPlateGini": 0.32
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "activeBin": 8388608,
      "binsScanned": 61,
      "binsPopulated": 22,
      "totalUsd": 140000,
      "volume24hUsd": 85000,
      "drivingForce": 0.58,
      "plateFraction": 0.48,
      "plateCount": 3,
      "largestPlateLength": 3,
      "primaryPlateCount": 2,
      "secondaryPlateCount": 1,
      "avgPlateThickness": 0.5,
      "avgPlateAlignment": 0.55,
      "avgPlateLength": 0.6,
      "avgBoundaryProximity": 0.42,
      "avgHabitPlaneCompliance": 0.5,
      "avgLedgeGrowthSignature": 0.48,
      "avgGibbsThomsonCompliance": 0.42,
      "avgVariantSelection": 0.6,
      "avgPlateSpacing": 0.35,
      "avgIntragranularNucleation": 0.3,
      "dominantKsVariant": 0,
      "ksVariantDistribution": [3, 1, 2, 1],
      "ksVariantSelectionStrength": 0.42,
      "allotriomorphCount": 5,
      "primaryWidmanstattenBinCount": 5,
      "secondaryWidmanstattenBinCount": 2,
      "bainiteBorderCount": 0,
      "xMatrixCount": 9,
      "yMatrixCount": 6,
      "minorityRoleCount": 6,
      "hypoeutectoidSkew": 0.12,
      "plateGini": 0.28,
      "widmanstattenIndex": 48,
      "widmanstattenRegime": "PRIMARY_WIDMANSTATTEN",
      "widmanstattenVerdict": "GB_EMERGENT",
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

- Widmanstätten plates in real Fe-C show 1-3 μm thickness, aspect ratio 10-100, and Kurdjumov-Sachs orientation {111}γ ∥ {110}α with 24 variants per grain. Here MAX_PLATE_THICKNESS = 3 bins is a dimensionless proxy; DLMM bins have no crystallographic orientation.
- K-S variant identification in real systems requires EBSD (electron backscatter diffraction) or TEM diffraction. Here KS_VARIANT_COUNT = 4 directional buckets (inward-close, inward-far, outward-close, outward-far) based on plate direction and start position — a simplified proxy.
- Driving force is inferred from 24h volume/TVL turnover rather than measured undercooling below A3. Real ΔT requires thermodynamic phase diagram coupled with cooling rate.
- Plate detection uses consecutive same-role minority bin runs with length 1..MAX_PLATE_THICKNESS; real Widmanstätten plates are 3-D crystallographic objects with specific habit planes {5 5 6}γ or {101}α.
- Primary vs secondary classification uses adjacency to matrix-role bins; real primary Widmanstätten plates emerge crystallographically from grain-boundary allotriomorphs while secondary plates nucleate at intragranular dislocations or inclusions.
- Habit plane compliance uses plate direction matching against the dominant variant bucket; real habit plane compliance requires crystallographic measurement.
- Ledge growth signature uses monotonic reserve progression along the plate as a step-wise signal; real ledge growth is measured by in-situ TEM of moving steps at the ferrite/austenite broad interface.
- Gibbs-Thomson compliance uses reserve gradient at plate tip vs adjacent matrix bin; real Gibbs-Thomson effect is ΔG_eff = ΔG_bulk − 2γ/r where γ is interfacial energy and r is tip radius in length units, not a dimensionless gradient proxy.
- Variant selection strength uses Shannon entropy of the K-S variant bucket distribution; real variant selection is measured by orientation imaging microscopy (OIM) / pole figure analysis.
- Matrix/minority role assignment uses overall pool X vs Y dominance to assign plate analog to the less-common role; real proeutectoid phase assignment depends on overall carbon content relative to eutectoid (hypoeutectoid → ferrite, hypereutectoid → cementite).
- Rate constants k = 1.0, n = 1.8 for JMAK are normalized proxy values; real Widmanstätten nucleation shows n dependent on whether primary (GB-emergent, higher effective n) or secondary (intragranular, lower n) dominates.
- DOMINANCE_MARGIN = 0.15 for role assignment; real phase dominance is crystallographically defined.
- GIBBS_THOMSON_MIN_GRADIENT = 0.08 is a normalized threshold; real Gibbs-Thomson effect depends on γ (interfacial energy, typically 0.4-0.7 J/m² for ferrite-austenite) and r (tip radius, typically 10-100 nm).
- The classification BAINITE_BORDER at plateFraction ≥ 0.75 is heuristic; real Widmanstätten-to-bainite transition is governed by the T0 curve and crystallographic displacive-vs-diffusional criteria.
- Intragranular nucleation does not distinguish between inclusion-assisted (real) and random (proxy); real intragranular plate nucleation is inclusion-assisted (MnS, TiN, Al2O3).
- Plate-plate spacing is measured in bin units, not length units; real plate spacing depends on cooling rate and alloy composition.
- Hypoeutectoid skew is a pool-level reserveX vs reserveY asymmetry proxy; real hypoeutectoid vs hypereutectoid classification depends on carbon content relative to eutectoid (0.77 wt% C in Fe-C).
- DLMM bins are discrete 1-D structures; classical Widmanstätten transformation is 3-D crystallographic plate growth with specific habit planes. The analogy is heuristic.
- Analysis is snapshot-based; does not capture time-evolution of transformation — JMAK kinetics, plate nucleation rate, and habit plane selection inferred from current pattern rather than measured rate.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
