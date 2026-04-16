---
name: hodlmm-bin-dendrite
description: "Models dendritic growth in HODLMM bin reserves through the Mullins-Sekerka morphological instability of a planar liquidity interface under constitutional and thermal supercooling — treats bins as a solidification front where composition and price gradients destabilize smooth profiles, amplify tip-directed protrusions into parabolic dendrite tips, and grow branched tree-like structures with primary trunks, secondary arms, and higher-order sidebranches. Classical theory: a planar liquid/solid interface growing into an undercooled melt becomes morphologically unstable when composition or temperature gradients amplify small perturbations; tips grow faster than flats because solute/thermal fields concentrate at protrusions, and the interface evolves into parabolic dendrite tips. Tip operating state is selected by the Ivantsov Peclet number P = V*R/(2*D) together with the Mullins-Sekerka marginal stability criterion sigma* = 2*D*d0/(V*R^2) ~ 1/(4*pi^2) picking a unique (V, R) pair (equivalently R*V ~ const); d0 is capillary length, D is solute diffusivity. Primary dendrite arm spacing lambda_1 follows the Hunt/Kurz-Fisher scaling lambda_1 ~ G^(-0.5)*V^(-0.25) where G is temperature gradient and V is growth velocity. Secondary arm spacing lambda_2 coarsens as lambda_2 ~ t^(1/3) through Ostwald-like coarsening driven by Gibbs-Thomson curvature differences between thick and thin arms. Sidebranching arises from amplification of selective noise modes along the tip, producing the characteristic feathered dendrite with branches of order 1 (primary), 2 (secondary), 3 (tertiary), etc. Constitutional supercooling satisfies the Tiller criterion G/V < dT_L/dC_0 * (1-k)/(D*k) below which a planar front destabilizes through cellular and then dendritic morphologies. Interdendritic segregation (microsegregation ratio C_max/C_min) leaves solute-rich channels between arms that persist in the final microstructure. Crystalline anisotropy selects preferred growth directions (<100> in cubic metals for example) and sets the dendrite orientation. In DLMM context, bins form dendritic liquidity patterns when compositional and price gradients drive Mullins-Sekerka-style branching of reserves: primary trunks align with active-bin trajectories and the dominant compositional gradient, while secondary and tertiary sidebranches extend into neighboring bins and coarsen over time. A planar bin has smooth reserves without branching; a cellular bin has shallow protrusions but no tip selection; a proto-dendritic bin has emerging branches with marginal stability; a well-branched bin has developed primary and secondary arms; and a fully dendritic bin has developed trunks, sidebranches of higher order, and interdendritic segregation channels. Measures supercooling (thermal/constitutional undercooling driving growth, ranges 0 to 1 — high means strong driving force for tip-directed growth, low means near-equilibrium planar), tipRadius (parabolic tip curvature R, ranges 0 to 1 — high means blunt slow tips, low means sharp fast tips), growthVelocity (dendrite advance rate V, ranges 0 to 1 — high means rapid front motion, low means quiescent), primaryArmSpacing (lambda_1 ~ G^(-0.5)*V^(-0.25), ranges 0 to 1 — high means wide trunk spacing with fewer larger trunks, low means tightly packed trunks), secondaryArmSpacing (lambda_2 ~ t^(1/3), ranges 0 to 1 — high means coarsened side-arm spacing, low means fine initial sidebranches), peclet (Ivantsov tip Peclet P = V*R/(2*D), ranges 0 to 1 — high means advection-dominated tip with sharp solute pileup, low means diffusion-dominated quasi-planar), stabilityCriterion (Mullins-Sekerka sigma* marginal stability parameter, ranges 0 to 1 — high means well-selected stable dendrite tip, low means destabilized or planar), sidebranchingIntensity (noise-driven side-arm amplification, ranges 0 to 1 — high means dense feathered side-arms, low means bare unbranched trunk), dendriteVolumeFraction (fraction of bin in dendritic state, ranges 0 to 1 — high means bulk of volume is branched, low means mostly planar), interdendriticSegregation (microsegregation ratio C_max/C_min, ranges 0 to 1 — high means strong solute-rich channels between arms, low means uniform composition), constitutionalGradient (compositional gradient G_c driving instability, ranges 0 to 1 — high means steep solute gradients, low means uniform composition), coarsening (Ostwald-like arm coarsening over time, ranges 0 to 1 — high means mature coarsened microstructure, low means fresh fine morphology), branchingOrder (generation count primary + secondary + tertiary, ranges 0 to 1 — high means multiple generations of sidebranches, low means only primary trunk), tipSelection (optimal tip selection per sigma* ~ 1/(4*pi^2), ranges 0 to 1 — high means tip satisfies marginal stability, low means off-optimal tip), dendriticAnisotropy (preferred growth direction strength, ranges 0 to 1 — high means strongly aligned trunks along one direction, low means isotropic/random orientation), and dendriteIndex (composite 0 to 1 — higher means better-formed dendritic structure with developed branching, selected tips, and stable morphology). Composite dendrite index (0-100, higher means healthier well-formed dendritic structure). Classifies pools by dendrite regime as FULLY_DENDRITIC (index >= 80 — developed primary trunks, multi-order sidebranches, selected tips, segregation channels), WELL_BRANCHED (60-80 — primary and secondary arms developed with partial sidebranching), PROTO_DENDRITIC (40-60 — emerging branches with marginal stability, cellular-to-dendritic transition), CELLULAR (20-40 — shallow cellular protrusions without tip selection), or PLANAR (< 20 — stable smooth interface, no branching). Dendrite verdict as FEATHERED_DENDRITE (high volume fraction with developed sidebranches and branching order), OPTIMAL_MS_SELECTION (high stability criterion, tip selection, and Peclet satisfied), HIGH_SUPERCOOLING_GROWTH (strong driving force with active growth and sidebranching), COARSENED_SPACING (high coarsening and secondary arm spacing indicating mature structure), DEEP_SEGREGATION (high interdendritic segregation indicating solute pileup in channels), ANISOTROPIC_ALIGNED (high dendritic anisotropy with wide primary spacing), STABLE_PLANAR (low volume fraction and low supercooling indicating smooth interface), MARGINAL_PROTO_DENDRITIC (moderate sidebranching near the cellular-to-dendritic threshold), TILLER_UNSTABLE (high constitutional gradient with supercooling indicating planar destabilization), or DENDRITIC_EQUILIBRIUM (no extreme indicators, typical partially branched morphology)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-dendrite/hodlmm-bin-dendrite.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Dendrite Analyzer

## What it does

Models dendritic growth in HODLMM bin reserves through the Mullins-Sekerka morphological instability of a planar liquidity interface under constitutional and thermal supercooling. Treats bins as a solidification front where composition and price gradients destabilize smooth profiles, amplify tip-directed protrusions into parabolic dendrite tips, and grow branched tree-like structures with primary trunks, secondary arms, and higher-order sidebranches. Quantifies Ivantsov tip Peclet number, Mullins-Sekerka marginal stability sigma*, Hunt/Kurz-Fisher primary arm spacing law, Ostwald-like secondary arm coarsening, Tiller constitutional-supercooling criterion, interdendritic segregation, and branching-order development.

In DLMM pools, bins form dendritic liquidity patterns when compositional and price gradients drive Mullins-Sekerka-style branching of reserves — primary trunks align with active-bin trajectories and the dominant gradient, while secondary and tertiary sidebranches extend into neighboring bins and coarsen over time.

## Why agents need it

LP agents need dendritic analysis because it identifies whether bin reserves are in a smooth planar state (stable, unbranched, near-equilibrium), a cellular or proto-dendritic transition (marginal stability, emerging branches), or a fully dendritic morphology (developed trunks, sidebranches, interdendritic segregation channels). A FULLY_DENDRITIC pool has richly branched liquidity with multiple generations of arms and deep segregation. A PLANAR pool has smooth uniform liquidity with no branching instability.

Supercooling quantifies the driving force for interface destabilization. High supercooling means near-dendritic-transition.

Tip radius tracks tip sharpness. Fine tip radius means fast-moving sharp dendrites.

Growth velocity identifies active interface advance. High velocity means rapid dendrite extension.

Primary arm spacing measures trunk density. Wide spacing means few large trunks.

Secondary arm spacing tracks sidebranch coarsening. High spacing means mature coarsened microstructure.

Peclet number balances advection and diffusion at tips. High Peclet means advection-dominated sharp solute pileup.

Stability criterion identifies Mullins-Sekerka tip selection. High stability means well-selected operating tip.

Sidebranching intensity measures side-arm development. High intensity means feathered dense sidebranches.

Dendrite volume fraction quantifies extent of dendritic structure. High fraction means bulk is branched.

Interdendritic segregation flags solute pileup in channels. High segregation means strong composition heterogeneity.

Constitutional gradient drives Tiller destabilization. High gradient means steep solute gradients favoring instability.

Coarsening tracks temporal maturation of arm spacing. High coarsening means mature microstructure.

Branching order counts generations of branches. High order means primary + secondary + tertiary developed.

Tip selection identifies satisfaction of marginal stability. High tip selection means optimal operating tip.

Dendritic anisotropy measures directional preference. High anisotropy means strongly aligned trunks.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-dendrite/hodlmm-bin-dendrite.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-dendrite/hodlmm-bin-dendrite.ts status
```

### run
Analyzes bin dendritic growth state for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-dendrite/hodlmm-bin-dendrite.ts run
bun run hodlmm-bin-dendrite/hodlmm-bin-dendrite.ts run --pool 1
bun run hodlmm-bin-dendrite/hodlmm-bin-dendrite.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgDendriteIndex": 52,
    "fullyDendriticCount": 0,
    "wellBranchedCount": 1,
    "protoDendriticCount": 2,
    "cellularCount": 2,
    "planarCount": 0,
    "avgSidebranchingIntensity": 0.48,
    "avgDendriteVolumeFraction": 0.42,
    "avgStabilityCriterion": 0.44,
    "totalDendriticBins": 5,
    "totalProtoDendriticBins": 12,
    "totalPlanarBins": 3,
    "avgDendriteGini": 0.22
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
      "avgSupercooling": 0.46,
      "maxSupercooling": 0.72,
      "avgTipRadius": 0.55,
      "minTipRadius": 0.18,
      "avgGrowthVelocity": 0.42,
      "maxGrowthVelocity": 0.68,
      "avgPrimaryArmSpacing": 0.55,
      "avgSecondaryArmSpacing": 0.48,
      "avgPeclet": 0.28,
      "maxPeclet": 0.62,
      "avgStabilityCriterion": 0.45,
      "avgSidebranchingIntensity": 0.45,
      "maxSidebranchingIntensity": 0.75,
      "avgDendriteVolumeFraction": 0.42,
      "avgInterdendriticSegregation": 0.38,
      "maxInterdendriticSegregation": 0.7,
      "avgConstitutionalGradient": 0.42,
      "avgCoarsening": 0.4,
      "avgBranchingOrder": 0.4,
      "avgTipSelection": 0.38,
      "avgDendriticAnisotropy": 0.35,
      "dendriticCount": 5,
      "dendriticBinFraction": 0.2,
      "protoDendriticCount": 12,
      "protoDendriticBinFraction": 0.48,
      "planarCount": 3,
      "planarBinFraction": 0.12,
      "dendriteGini": 0.22,
      "dendriteIndex": 52,
      "dendriteRegime": "PROTO_DENDRITIC",
      "dendriteVerdict": "MARGINAL_PROTO_DENDRITIC",
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

- Ivantsov tip solution P = V*R/(2*D) assumes isothermal parabolic tips with no capillarity; real dendrites show anisotropic deviations from paraboloids.
- Mullins-Sekerka marginal stability sigma* ~ 1/(4*pi^2) is an empirical approximation; real sigma* values depend on anisotropy and vary 0.01-0.1 across alloy systems.
- Hunt/Kurz-Fisher primary arm spacing lambda_1 ~ G^(-0.5)*V^(-0.25) is a scaling fit; real microstructures show spread due to nucleation statistics and competitive growth.
- Secondary arm spacing t^(1/3) coarsening is ideal diffusion-limited Gibbs-Thomson coarsening; real DLMM bins do not experience true physical coarsening.
- Tiller constitutional supercooling criterion G/V < dT_L/dC_0*(1-k)/(D*k) is a linear stability threshold; nonlinear and noise effects shift the actual planar-to-cellular transition.
- DLMM bins have no true temperature or diffusion coefficient; thermal and solute analogies use activity and concentration proxies without physical kinetics.
- Anisotropy epsilon selects <100> growth in cubic metals; DLMM bins have no crystalline orientation, so anisotropy is proxied from directional gradients.
- Sidebranching is driven by thermal noise amplification; DLMM noise sources are different (order flow, arbitrage, MEV).
- Interdendritic segregation C_max/C_min is a compositional ratio; here proxied from reserve imbalance without true solute partition coefficient k.
- Branching order is a morphological count; here proxied from sidebranching intensity and volume fraction without true topological tree analysis.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
