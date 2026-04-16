---
name: hodlmm-bin-pearlite
description: "Models pearlitic transformation in HODLMM bin reserves through the Zener-Hillert lamellar eutectoid model v = k·(ΔT)^2, S = C/ΔT — treats bin population dynamics as the slow diffusional equilibrium counterpart to the bainitic intermediate regime and the martensitic displacive snap. Pearlite forms on slow cooling below A1 (~727 °C) by cooperative nucleation and growth of alternating lamellae of ferrite (α, low carbon) and cementite (Fe3C, high carbon), with carbon partitioning entirely across very short distances at the γ/P interface and both phases at full equilibrium composition. Unlike martensite (diffusionless snap, supersaturated single phase) or bainite (intermediate displacive+diffusional with T0-stalled incomplete reaction), pearlite is the true equilibrium transformation with no supersaturation, and its signature is the lamellar morphology (alternating plates of α and Fe3C), the cooperative growth at the γ/P front (both phases grow simultaneously), and the undercooling-controlled fineness (ZH: fast cooling → fine lamellae, slow cooling → coarse lamellae). Morphology classifications: coarse pearlite (low ΔT, S > 0.4 μm), fine pearlite (moderate ΔT, S ~ 0.1-0.4 μm), sorbite (high ΔT, S < 0.1 μm, very fine), and troostite (extreme ΔT, S < 0.05 μm, near-bainite boundary). Pearlite nucleates in colonies (nodules) at austenite grain boundaries and grows hemispherically outward with site-saturated JMAK kinetics fP = 1 - exp(-k·t^n), n ~ 4. In DLMM pools, the driving force is proxied from 24h volume/TVL turnover (same as martensite and bainite for continuity). Pearlite fraction fP is inferred from pattern characteristics: lamellar alignment (regular reserveX/Y dominance alternation along adjacent bins), interlamellar spacing S (bin-gap distance between successive dominance switches), nodule count (colonies of ≥2 bins with at least one dominance switch), cooperative growth (both-phase presence via min-reserve fraction), Zener-Hillert compliance (fit of observed S to C/ΔT prediction), and the coarse-vs-sorbite morphology distinction (large S + low drive → coarse; small S + high drive → sorbite). An AUSTENITE_STABLE pool has driving force below A1 (bainite-start), smooth gradient, fP ~ 0. An INCUBATING_PEARLITE pool has fP < 0.2, early nucleation before nodules form. A COARSE_PEARLITIC pool has 0.2 ≤ fP < 0.5, thick lamellae (S ~ 3-5 bins) from slow cooling analog. A FINE_PEARLITIC pool has 0.5 ≤ fP < 0.75, moderate lamellar thickness (S ~ 2-3 bins). A SORBITIC pool has fP ≥ 0.75, very fine lamellae (S ~ 1-2 bins) from high driving force. Measures pearliteFraction (local fP, ranges 0 to 1 — high means strong pearlitic signature, low means austenitic), lamellarAlignment (dominance-alternation strength at bin locale, ranges 0 to 1 — high means bin is in an alternating-role sequence), interlamellarSpacing (normalized nearest-switch distance, ranges 0 to 1 — low means fine, high means coarse), dominanceRole (-1 Y-dominant/ferrite analog, 0 mixed/untransformed, +1 X-dominant/cementite analog), noduleMembership (colony membership signal, ranges 0 to 1), cooperativeGrowth (both-phase presence via min-reserve fraction, ranges 0 to 1 — high means true eutectoid cooperative signature), zenerHillertCompliance (fit of local S to C/ΔT prediction, ranges 0 to 1 — high means classical ZH kinetics), sorbiteScore (very-fine morphology, ranges 0 to 1 — high means small S + high drive), coarsePearliteScore (thick-lamellae morphology, ranges 0 to 1 — high means large S + low drive), troostiteScore (extreme-fine morphology beyond sorbite, ranges 0 to 1 — high means tiny S + extreme drive), equilibriumPartitioning (clean-partition signature, ranges 0 to 1 — high means clear dominance with no supersaturation), colonyCoherence (spatial colony continuity, ranges 0 to 1 — high means internally adjacent nodule), lamellarThickness (bin-lamella thickness in consecutive same-role bins, ranges 0 to 1 — high means thick lamella), carbideAnalog (cementite-rich bin signature, ranges 0 to 1 — high means X-dominant with high X fraction), jmakCompliance (fit to JMAK fP = 1 - exp(-k·t^n), ranges 0 to 1 — high means observed fP matches JMAK model for the driving force), and pearliteIndex (composite 0 to 1 — higher means deeper pearlitic signature). Composite pearlite index (0-100, higher means deeper pearlitic signature). Classifies pools by transformation regime as AUSTENITE_STABLE (driving force insufficient, fP ~ 0, smooth gradient), INCUBATING_PEARLITE (fP < 0.2, early nucleation), COARSE_PEARLITIC (0.2 ≤ fP < 0.5, thick lamellae), FINE_PEARLITIC (0.5 ≤ fP < 0.75, moderate lamellae), or SORBITIC (fP ≥ 0.75, very fine lamellae). Pearlite verdict as NODULAR_COLONIES (multiple colonies with high coherence), LAMELLAR_DOMINATED (regular alternation with ≥2 switches), COOPERATIVE_GROWTH (both-phase presence dominant), EQUILIBRIUM_PARTITIONED (clean dominance with low cooperative-growth signature — pure-phase bins dominate), ZENER_HILLERT_COMPLIANT (ZH compliance > 0.55 with ≥2 switches), SORBITE_MORPHOLOGY (avgSorbiteScore ≥ 0.55 and exceeds coarse by 0.1), COARSE_PEARLITE_MORPHOLOGY (avgCoarsePearliteScore ≥ 0.55 and exceeds sorbite by 0.1), TROOSTITE_REGIME (troostite > 0.55 with driving force > 0.7 — extreme-fine near-bainite), SUB_EUTECTOID_STABLE (fP < 0.2, below pearlite-start), HYPEREUTECTOID_SKEW (pool reserveX vs reserveY skew > 0.35), NO_PEARLITIC_DRIVE (driving force < 0.15), or INTERMEDIATE_PEARLITIC (no extreme indicators)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-pearlite/hodlmm-bin-pearlite.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Pearlite Analyzer

## What it does

Models pearlitic transformation in HODLMM bin reserves through the Zener-Hillert lamellar eutectoid model v = k·(ΔT)^2, S = C/ΔT. Treats bin population dynamics as the slow diffusional equilibrium counterpart to the bainitic intermediate regime (displacive+diffusional, T0-stalled) and the martensitic diffusionless snap. Quantifies pearlite fraction, lamellar alignment, interlamellar spacing, nodule count, dominance-switch count, cooperative growth, Zener-Hillert compliance, coarse-vs-sorbite-vs-troostite morphology scores, equilibrium partitioning, colony coherence, lamellar thickness, carbide analog, and JMAK compliance.

Pearlite sits at the slow end of the phase-transformation spectrum: it forms on slow cooling below A1 (~727 °C) by cooperative nucleation and growth of alternating lamellae of ferrite (α, low C) and cementite (Fe3C, high C) with full carbon partitioning across the γ/P interface and both phases at equilibrium composition. In DLMM pools, pearlitic patterns show regular alternation of reserveX-dominant bands (cementite analog, X-heavy) and reserveY-dominant bands (ferrite analog, Y-heavy), grouped in nodular colonies with characteristic interlamellar spacing S that tracks the driving force per Zener-Hillert. Driving force is proxied from 24h volume/TVL turnover. Pearlite fraction is inferred from pattern features: lamellar alignment, interlamellar spacing, nodule count, cooperative growth, and JMAK/Zener-Hillert model compliance.

## Why agents need it

LP agents need pearlitic transformation analysis because it identifies the slow-diffusional equilibrium regime — pools with regular lamellar dominance alternation, well-defined nodular colonies, and characteristic interlamellar spacing that tracks the driving force. Unlike bainite (sheaf-dominated with incomplete-reaction stall) or martensite (sharp snap with retained austenite), pearlite shows clean equilibrium partitioning with no supersaturation and full cooperative growth. An AUSTENITE_STABLE pool has insufficient driving force — smooth gradient liquidity, no alternation, classical LP behavior applies. An INCUBATING_PEARLITE pool is in the pre-nucleation stage — monitor for nodule formation. A COARSE_PEARLITIC pool shows thick lamellae (low ΔT) — LP positions within same-role bins benefit from directional reserve continuity; dominance-switch boundaries are LP asymmetry opportunities. A FINE_PEARLITIC pool shows moderate lamellar thickness — tight switching gives frequent reserve-direction changes for dynamic LP strategies. A SORBITIC pool shows very fine lamellae (high ΔT) — near-bainite boundary, switching is tight (S ~ 1-2 bins), LP positions should favor cooperative-growth bins for fee capture.

Pearlite fraction is the pool-level transformed-phase indicator. High means strong pearlitic signature with regular alternation; low means austenite-parent dominates.

Nodule count is the number of distinct lamellar colonies present. Multiple nodules indicate site-saturated nucleation at multiple boundaries.

Dominance-switch count measures the number of reserveX ↔ reserveY alternations along the populated span. High counts signal fine-lamellar pearlitic structure.

Interlamellar spacing S is the bin-gap distance between successive dominance switches. Low S = fine (sorbite/troostite); high S = coarse.

Cooperative growth measures both-phase presence via min-reserve fraction. High means both reserveX and reserveY are substantially present at this bin — the classical eutectoid cooperative signature.

Zener-Hillert compliance measures the fit of observed S to the C/ΔT prediction. High means classical ZH kinetics apply.

Sorbite score signals very-fine morphology (small S + high drive).

Coarse pearlite score signals thick lamellae (large S + low drive).

Troostite score signals extreme-fine morphology beyond sorbite (tiny S + extreme drive, near-bainite).

Equilibrium partitioning measures clean dominance (not mixed) — pure-phase bins dominate, no supersaturation.

Colony coherence measures spatial continuity of nodules (internally adjacent colonies).

Lamellar thickness is the bin-count of consecutive same-role bins at this position — higher means thicker lamella (coarse).

Carbide analog is the cementite-rich signature (X-dominant with high X fraction).

JMAK compliance measures the fit of observed fP to the 1 - exp(-k·t^n) prediction.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-pearlite/hodlmm-bin-pearlite.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-pearlite/hodlmm-bin-pearlite.ts status
```

### run
Analyzes bin pearlitic transformation state for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-pearlite/hodlmm-bin-pearlite.ts run
bun run hodlmm-bin-pearlite/hodlmm-bin-pearlite.ts run --pool 1
bun run hodlmm-bin-pearlite/hodlmm-bin-pearlite.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgPearliteIndex": 45,
    "avgDrivingForce": 0.52,
    "austeniteStableCount": 0,
    "incubatingCount": 1,
    "coarsePearliticCount": 2,
    "finePearliticCount": 1,
    "sorbiticCount": 1,
    "avgPearliteFraction": 0.48,
    "avgNoduleCount": 1.6,
    "avgDominanceSwitchCount": 3.2,
    "avgInterlamellarSpacing": 0.24,
    "avgJmakCompliance": 0.52,
    "avgZenerHillertCompliance": 0.48,
    "totalAusteniteBins": 4,
    "totalCoarsePearliteBins": 11,
    "totalFinePearliteBins": 7,
    "totalSorbiteBins": 5,
    "avgPearliteGini": 0.26
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
      "pearliteFraction": 0.52,
      "noduleCount": 2,
      "largestNoduleSize": 8,
      "dominanceSwitchCount": 4,
      "avgInterlamellarSpacing": 0.22,
      "avgPearliteFraction": 0.45,
      "avgLamellarAlignment": 0.54,
      "avgNoduleMembership": 0.48,
      "avgCooperativeGrowth": 0.42,
      "avgZenerHillertCompliance": 0.52,
      "avgSorbiteScore": 0.48,
      "avgCoarsePearliteScore": 0.4,
      "avgTroostiteScore": 0.3,
      "avgEquilibriumPartitioning": 0.5,
      "avgColonyCoherence": 0.58,
      "avgLamellarThickness": 0.3,
      "avgCarbideAnalog": 0.25,
      "avgJmakCompliance": 0.5,
      "austeniteCount": 3,
      "austeniteBinFraction": 0.14,
      "coarsePearliteCount": 9,
      "coarsePearliteBinFraction": 0.41,
      "finePearliteCount": 4,
      "finePearliteBinFraction": 0.18,
      "sorbiteCount": 6,
      "sorbiteBinFraction": 0.27,
      "xDominantCount": 9,
      "yDominantCount": 8,
      "mixedCount": 5,
      "hypereutectoidSkew": 0.08,
      "pearliteGini": 0.22,
      "pearliteIndex": 52,
      "pearliteRegime": "FINE_PEARLITIC",
      "pearliteVerdict": "LAMELLAR_DOMINATED",
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

- Zener-Hillert's model v = k·(ΔT)^2 and S = C/ΔT assumes steady-state cooperative growth at a planar γ/P interface with local equilibrium at the triple line. Real pearlitic transformation shows branching, divergent lamellae, and deviation from the ideal Jackson-Hunt-type spacing selection.
- Driving force is inferred from 24h volume/TVL turnover rather than measured from isothermal hold temperature or applied stress history. Quantitative undercooling below A1 in the steel sense requires a thermodynamic phase diagram.
- Pearlite fraction fP is inferred from snapshot bin-pattern characteristics rather than measured by X-ray diffraction, quantitative metallography, or dilatometry.
- Nodule detection uses connected-cluster + dominance-switch heuristic (cluster of ≥2 adjacent populated bins with at least one dominance switch); real pearlitic nodules are defined by common crystallographic orientation within lamellae, not 1-D bin proximity.
- Dominance role classification uses reserveX/Y asymmetry with a fixed 15% margin; real pearlite has well-defined ferrite (~0.02 wt% C) and cementite (6.67 wt% C) compositions that do not correspond to reserve fractions.
- Interlamellar spacing S uses bin-gap distance between successive dominance switches as a proxy. Real S is measured by electron microscopy and has units of length; the DLMM analog is unitless bin-count.
- Zener-Hillert compliance compares local bin-spacing to a normalized C/ΔT prediction. The Zener-Hillert constant C is alloy- and temperature-dependent, not universal.
- Coarse/fine/sorbite/troostite classification uses heuristics (driving force + interlamellar spacing); real classification requires measured lamellar spacing under microscopy.
- Cooperative growth is proxied by min(reserveX, reserveY)/total at each bin; real cooperative growth at the γ/P interface is measured by in-situ electron microscopy of the moving front.
- Equilibrium partitioning uses reserve dominance clarity as a proxy; real equilibrium is measured by atom probe tomography of ferrite and cementite compositions.
- Colony coherence uses internal adjacency as a proxy for crystallographic continuity of lamellae within a nodule.
- Lamellar thickness uses consecutive same-role bin counts as a proxy for individual plate thickness; real plate thickness is a geometric measure independent of colony structure.
- Carbide analog uses X-dominant signature; real cementite is a distinct crystalline phase (orthorhombic Fe3C) not reserveX.
- JMAK exponent n is fixed at 2.0 as a normalized proxy; real pearlite nucleation shows n ~ 4 (3-D growth with site-saturation) or n ~ 3 (continuous nucleation) depending on conditions.
- DLMM bins are discrete 1-D structures; classical pearlitic transformation is a 3-D crystallographic transformation with cooperative γ/α and γ/Fe3C moving interfaces. The analogy is heuristic.
- The transformation analogy treats bin population (empty → populated) as the phase indicator, but dominance of reserveX vs reserveY stands in for composition partitioning between cementite-analog and ferrite-analog phases.
- Analysis is snapshot-based; does not observe the actual transformation kinetics over time — JMAK kinetics, growth velocity, and lamellar spacing selection are inferred from current pattern rather than measured rate.
- Rate constants k, n (JMAK) and C (Zener-Hillert) are fixed at normalized proxy values (k = 1.1, n = 2.0, C = 0.9); in real pearlitic systems these are alloy- and temperature-specific.
- DOMINANCE_MARGIN fixed at 0.15; real phase-dominance boundaries in pearlite are crystallographically defined, not reserve-ratio based.
- Hypereutectoid skew is a pool-level reserveX vs reserveY asymmetry proxy; real hypereutectoid steels have carbon content above eutectoid (0.8 wt%) and show proeutectoid cementite at austenite grain boundaries.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
