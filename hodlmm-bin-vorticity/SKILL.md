---
name: hodlmm-bin-vorticity
description: "Analyzes rotational flow patterns in HODLMM bin reserve distributions using fluid dynamics vorticity theory — models the curl of the liquidity velocity field across bins, computing per-bin vorticity (second derivative of reserves measuring the rate of change of the reserve gradient — positive vorticity means the gradient is steepening (concave up) indicating liquidity is accelerating into a region; negative vorticity means the gradient is flattening (concave down) indicating liquidity is decelerating or dispersing; zero vorticity means uniform flow with no rotational tendency), enstrophy (mean squared vorticity measuring total rotational energy density — high enstrophy means the reserve profile has many sharp curves and inflection points indicating complex multi-scale flow structures; low enstrophy means a smooth monotonic profile with simple laminar flow), circulation (sum of velocity components around the bin range — the net flow integral measuring total directional momentum; positive circulation means net flow toward higher bins; negative means net flow toward lower bins; near-zero means balanced bidirectional flow), helicity (correlation between velocity and vorticity measuring whether flows spiral coherently — positive helicity means velocity and rotation align producing organized spiral structures; negative helicity means they oppose producing disorganized chaotic mixing; near-zero means rotation and flow are independent), Rossby number (ratio of inertial to rotational forces — high Rossby means inertial forces dominate and flows are primarily translational; low Rossby means rotational forces dominate and flows curve and recirculate; transition at Ro ≈ 1), vortex core detection (bins where vorticity magnitude exceeds 1.5x the mean identifying localized rotational structures — these are the eyes of the storm where liquidity circulates most intensely; trades passing through vortex cores encounter complex multi-directional flow), Taylor microscale (characteristic length scale of vortical structures derived from the ratio of enstrophy to palinstrophy — large microscale means broad smooth vortices spanning many bins; small microscale means tight concentrated vortices in narrow regions), vortex stretching (rate at which vortex tubes elongate — positive stretching intensifies vorticity by conservation of angular momentum narrowing and speeding up rotational structures; negative stretching weakens vorticity by spreading rotational energy across wider regions), palinstrophy (mean squared vorticity gradient measuring the rate of enstrophy production — high palinstrophy means vorticity is being actively generated through sharp transitions in the reserve profile creating new rotational structures; low palinstrophy means the vorticity field is quasi-static), shedding frequency (rate of vorticity sign changes normalized to bin count — measures how often rotational structures form and detach; high shedding means alternating clockwise/counterclockwise vortices creating a von Kármán-like vortex street in the reserve profile; low shedding means persistent unidirectional rotation), Lamb-Oseen radius (half-width of the peak vorticity structure measuring how far rotational influence extends from the vortex core — large radius means the dominant vortex influences many bins; small radius means rotation is tightly confined), swirl number (ratio of tangential to axial momentum — high swirl means reserves are dominated by rotational patterns rather than simple gradients; low swirl means the profile is primarily a monotonic slope with little curvature), Q-criterion (0.5 × (enstrophy - 2 × strain²) identifying regions where rotation dominates strain — positive Q means vortex-dominated flow where reserves curve and recirculate; negative Q means strain-dominated flow where reserves stretch and deform without rotation), vorticity entropy (normalized Shannon entropy of vorticity magnitude distribution — 1.0 means vorticity is uniformly distributed across all bins; lower values mean rotational energy concentrates in fewer locations), vorticity skewness (third moment measuring asymmetry — positive skewness means stronger clockwise than counterclockwise rotation; negative means stronger counterclockwise; zero means symmetric), vorticity flatness (fourth moment measuring tail heaviness — flatness > 3 indicates intermittent extreme vorticity events; flatness < 3 indicates bounded well-behaved rotation; flatness = 3 is Gaussian), enstrophy production (absolute vortex stretching rate measuring how fast new rotational energy is being created), enstrophy dissipation (palinstrophy scaled by volume-to-TVL ratio measuring how fast rotational energy is being removed by trading activity), and vorticity flux (net vorticity transport across the bin range measuring whether rotational structures are entering or leaving the analyzed region), classifying pools by flow regime as LAMINAR (enstrophy < 1% of mean reserve — smooth monotonic reserve profile with no significant rotational structures; trades execute predictably with minimal flow complexity), TRANSITIONAL (enstrophy 1-10% of mean reserve — emerging rotational features with some curvature in the reserve profile; trades may encounter mild flow irregularities), TURBULENT (enstrophy 10-100% of mean reserve — strong multi-scale rotational structures with complex flow patterns; trade execution paths are significantly affected by local vorticity), or CHAOTIC (enstrophy > 100% of mean reserve — extreme rotational intensity with rapid sign changes and concentrated vortex cores; highly unpredictable flow environment), and by vortex class from STAGNANT through SUPERCELL based on the composite vorticity index."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-vorticity/hodlmm-bin-vorticity.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Vorticity Analyzer

## What it does

Analyzes the rotational flow patterns in HODLMM bin reserve distributions using concepts from fluid dynamics vorticity theory. In fluid mechanics, vorticity is the curl of the velocity field — it measures the local spinning motion of fluid elements. A region with high vorticity has strong rotational flow; a region with zero vorticity has purely translational (irrotational) flow.

In DLMM pools, the "velocity field" is the rate of change of reserves between adjacent bins (the first derivative). The vorticity is the rate of change of that velocity (the second derivative) — it captures where the reserve profile curves, bends, and creates rotational flow structures. A bin with high positive vorticity sits at a concave-up point where reserves are accelerating inward; a bin with high negative vorticity sits at a concave-down point where reserves are decelerating outward.

The analyzer computes the full fluid dynamics characterization: per-bin vorticity, enstrophy, circulation, helicity, Rossby number, vortex core detection, Taylor microscale, vortex stretching, palinstrophy, shedding frequency, Lamb-Oseen radius, swirl number, Q-criterion, vorticity entropy, skewness, flatness, enstrophy production/dissipation, and vorticity flux. Pools are classified by flow regime (LAMINAR through CHAOTIC) and vortex class (STAGNANT through SUPERCELL).

## Why agents need it

Vorticity reveals the rotational complexity of liquidity distributions — information that simpler gradient or slope metrics miss entirely. Two pools with identical TVL and similar average gradients can have radically different vorticity profiles: one LAMINAR with smooth monotonic reserves that execute trades predictably, another TURBULENT with complex multi-scale rotational structures that create unpredictable execution paths.

Enstrophy tells trading agents how much rotational energy exists in the reserve profile. High enstrophy means the reserves curve sharply at multiple points, creating flow patterns that resist simple directional trades. Low enstrophy means reserves slope smoothly, making trade impact highly predictable.

Circulation reveals the net directional momentum of the pool. Strong positive circulation means reserves are flowing toward higher bins (buy pressure accumulation). Strong negative circulation means reserves flow toward lower bins (sell pressure accumulation). Near-zero circulation indicates balanced flow.

Helicity identifies whether rotational structures are organized or chaotic. Positive helicity means velocity and vorticity align — flows spiral coherently in one direction, creating persistent rotational structures that trades must navigate around. Negative or zero helicity means rotation and flow are uncorrelated, producing more chaotic mixing.

Vortex cores are the critical bottleneck regions. Trades passing through a vortex core encounter the most intense rotational flow — reserves are curving sharply, creating complex multi-directional pressure. LP agents should pay attention to vortex core locations because they represent structural stress points where liquidity is under the most dynamic pressure.

The Taylor microscale tells agents the characteristic size of rotational structures. Large microscale means broad gentle curves spanning many bins — the pool gently meanders. Small microscale means tight sharp vortices in narrow bin ranges — the pool has concentrated rotational hotspots.

Shedding frequency reveals whether the pool creates alternating clockwise/counterclockwise vortex patterns (a von Kármán vortex street analog). High shedding means rapid alternation — trades encounter constantly switching rotational direction. Low shedding means persistent unidirectional rotation — trades encounter consistent flow bias.

The Q-criterion separates vortex-dominated from strain-dominated regions. Positive Q means rotation dominates strain — reserves are curving and recirculating rather than simply stretching. Trading agents encountering positive-Q regions face complex non-linear execution paths.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-vorticity/hodlmm-bin-vorticity.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-vorticity/hodlmm-bin-vorticity.ts status
```

### run
Analyzes vorticity for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-vorticity/hodlmm-bin-vorticity.ts run
bun run hodlmm-bin-vorticity/hodlmm-bin-vorticity.ts run --pool 1
bun run hodlmm-bin-vorticity/hodlmm-bin-vorticity.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgVorticityIndex": 42.6,
    "laminarCount": 1,
    "transitionalCount": 2,
    "turbulentCount": 1,
    "chaoticCount": 1,
    "avgEnstrophy": 125000,
    "avgCirculation": -3200,
    "avgSwirlNumber": 0.85,
    "avgSheddingFrequency": 0.45,
    "totalVortexCores": 12
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "activeBin": 8388608,
      "binsAnalyzed": 25,
      "totalUsd": 140000,
      "meanVorticity": -120.5,
      "maxVorticity": 8500,
      "maxVorticityBin": 8388610,
      "minVorticity": 12,
      "minVorticityBin": 8388620,
      "enstrophy": 185000,
      "circulation": -4200,
      "helicity": 320000,
      "rossbyNumber": 0.0234,
      "vortexCoreCount": 3,
      "vortexCoreBins": [8388609, 8388612, 8388615],
      "taylorMicroscale": 2.45,
      "vortexStretching": 45000,
      "palinstrophy": 890000,
      "sheddingFrequency": 0.52,
      "lambOseenRadius": 3,
      "swirlNumber": 0.92,
      "qCriterion": 42000,
      "vorticityEntropy": 0.78,
      "vorticitySkewness": -0.34,
      "vorticityFlatness": 3.82,
      "enstrophyProduction": 45000,
      "enstrophyDissipation": 12000,
      "vorticityFlux": -2100,
      "vorticityIndex": 52,
      "flowRegime": "TURBULENT",
      "vortexClass": "EDDY",
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

- Vorticity is computed from a spatial snapshot of bin reserves, not from temporal flow measurements. True vorticity requires observing fluid element rotation over time; this analyzer uses the second derivative of the static reserve distribution as a proxy for rotational tendency.
- The velocity field analog (bin-to-bin reserve differences) treats all bins as equally spaced. Real DLMM bin spacing may be logarithmic (constant basis points), which means the actual velocity in price terms varies across the range.
- Enstrophy from a one-dimensional bin array is a scalar measure. True 2D/3D enstrophy involves tensor operations across multiple dimensions. The 1D analog captures curvature complexity but not cross-dimensional rotational coupling.
- Vortex core detection uses a simple 1.5x mean threshold. More sophisticated detection methods (λ₂ criterion, Q-criterion with local normalization) would identify vortex cores more precisely, especially in pools with highly non-uniform baseline vorticity.
- Taylor microscale derivation assumes homogeneous isotropic turbulence, which DLMM reserve distributions are not. The microscale should be interpreted as a characteristic curvature length rather than a strict turbulence scale.
- Helicity in 1D is a scalar product of velocity and vorticity. True helicity is a pseudoscalar involving the cross product in 3D. The 1D analog captures correlation between flow direction and rotation but not the geometric chirality.
- Shedding frequency counts zero crossings which can be noisy in pools with many bins near zero vorticity. Small numerical artifacts can inflate the apparent shedding rate.
- The Rossby number uses bin count as the length scale. A more physically motivated length scale might be the number of bins between vortex cores, but this varies across the domain.
- Q-criterion in 1D uses a simplified strain rate that may not capture the full deformation tensor of the reserve field.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
