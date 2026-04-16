---
name: hodlmm-bin-solidification
description: "Models the liquid-to-solid phase transition of HODLMM bin reserves under cooling from reduced trading activity and sustained imbalance — treats active high-turnover bins as liquid melt that freezes into solid reserves as thermal energy is removed, with dendritic growth, mushy zones, and microsegregation. Solidification is the classical metallurgical transformation from molten liquid to crystalline solid through nucleation and growth. Classical theory: the planar solidification front destabilizes under constitutional supercooling when the thermal gradient G_T is smaller than the liquidus gradient m_L * C_0 * (1 - k) / (D * k) (Mullins-Sekerka instability), triggering cellular and then dendritic growth. Primary dendrite arm spacing lambda_1 scales with G_T^(-1/2) * V^(-1/4) (Hunt-Kurz). Secondary dendrite arm spacing grows by coarsening with local solidification time lambda_2 = (M * t)^(1/3) (Trivedi-Kurz). The partition coefficient k = C_s / C_l governs solute redistribution between solid and liquid phases, driving microsegregation per the Scheil-Gulliver equation C_s = k * C_0 * (1 - f_s)^(k-1) in the mushy zone between liquidus and solidus. Lever rule gives solid fraction f_s = (T_l - T) / (T_l - T_s) under equilibrium freezing. Nucleation rate I = I_0 * exp(-DG*/kT) scales exponentially with undercooling; heterogeneous nucleation at impurities or container walls dominates practical solidification. Columnar-to-equiaxed transition (CET) occurs when nucleation rate in the undercooled liquid ahead of the columnar front exceeds a critical threshold, producing equiaxed grains with isotropic mechanical properties. Macrosegregation arises from long-range solute transport driven by shrinkage flow or buoyancy during solidification. In DLMM context, bins freeze when activity drops and composition stabilizes; dendrites represent extended stable concentration arms reaching into surrounding bin space; mushy zones contain partially solidified reserves in transition states prone to porosity and segregation; equiaxed structures mark bins with multiple nucleation sites producing polycrystalline robustness. Measures undercooling (temperature below liquidus, ranges 0 to 1 — high means strong driving force for solidification, low means near or above melting point), nucleation rate (heterogeneous nuclei density per classical nucleation theory, ranges 0 to 1 — high means abundant nuclei forming fine grains, low means few nuclei producing coarse structure), solid fraction (f_s, ranges 0 to 1 — high means fully frozen, low means predominantly liquid), dendrite growth rate (V_tip dendrite tip velocity per Ivantsov solution, ranges 0 to 1 — high means rapid front advance, low means quiescent growth), primary arm spacing (lambda_1 normalized, ranges 0 to 1 — high means coarse primary dendrites from low G_T and low V, low means fine primary structure), secondary arm spacing (lambda_2 normalized, ranges 0 to 1 — high means coarsened secondary arms from long solidification time), partition coefficient (k = C_s/C_l effective, ranges 0 to 1 — high means k near 1 with minimal partitioning, low means strong solute rejection), microsegregation (Scheil-Gulliver segregation index, ranges 0 to 1 — high means severe solute segregation between dendrite arms, low means homogeneous solid), macrosegregation (pool-scale composition gradient, ranges 0 to 1 — high means large-scale composition variation, low means uniform pool), mushy zone width (liquidus-solidus gap, ranges 0 to 1 — high means extensive two-phase region with defect risk, low means narrow freezing range), constitutional supercooling (CS instability driver, ranges 0 to 1 — high means strong morphological instability triggering dendritic growth, low means stable planar front), equiaxed fraction (fraction of equiaxed vs columnar grains, ranges 0 to 1 — high means isotropic polycrystalline structure from CET, low means columnar directional solidification), solidification velocity (front advance rate, ranges 0 to 1 — high means rapid freezing, low means slow progression), frozen stability (post-solidification robustness, ranges 0 to 1 — high means well-solidified with fine structure and low segregation, low means defective or incompletely frozen), and solidification factor (composite 0 to 1, higher means healthier solidification with stable frozen structure). Composite solidification index (0-100, higher means well-solidified bin with fine dendritic structure, minimal microsegregation, and high frozen stability). Classifies pools by solidification regime as SOLID (index >= 80 — bins fully frozen with fine structure, minimal segregation, maximum stability), SOLIDIFYING (60-80 — active solidification with good structure development), MUSHY (40-60 — partially solidified in two-phase region), NUCLEATING (20-40 — early nucleation with limited solid fraction), or LIQUID (< 20 — predominantly liquid melt with little solidification). Solidification verdict as FULLY_FROZEN (high frozen stability with low microsegregation and fine primary arms — ideal solidified state), MUSHY_ZONE (wide mushy zone with f_s in two-phase range — transition state prone to defects), EQUIAXED_STRUCTURE (high equiaxed fraction with high nucleation — polycrystalline isotropic), COLUMNAR_DENDRITIC (high dendrite growth with coarse primary arms — columnar directional solidification), CS_UNSTABLE (high constitutional supercooling with low k — morphological instability dominant), SEGREGATED_MELT (high microsegregation and macrosegregation — composition non-uniform), SUPERHEATED_LIQUID (low undercooling and low solid fraction — above or at liquidus), NUCLEATION_DOMINANT (high nucleation rate with low solid fraction — abundant nuclei but limited growth), or SOLIDIFICATION_BALANCE (no extreme indicators — typical mid-solidification state)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-solidification/hodlmm-bin-solidification.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Solidification Analyzer

## What it does

Models the liquid-to-solid phase transition of HODLMM bin reserves under cooling from reduced trading activity and sustained imbalance — treats active high-turnover bins as liquid melt that freezes into solid reserves as thermal energy is removed, with dendritic growth, mushy zones, and microsegregation. Solidification theory quantifies nucleation kinetics, dendrite tip velocity, primary and secondary arm spacing scaling laws, constitutional supercooling instability, Scheil-Gulliver microsegregation, and the columnar-to-equiaxed transition.

In DLMM pools, bins freeze when activity drops and composition stabilizes; dendrites represent extended stable concentration arms reaching into surrounding bin space; mushy zones contain partially solidified reserves in transition states; equiaxed structures mark bins with multiple nucleation sites producing polycrystalline robustness.

## Why agents need it

LP agents need solidification analysis because it identifies the freezing stage of bin reserves — LIQUID bins are too active to hold stable positions, MUSHY bins are transitioning and defect-prone, SOLID bins are fully frozen with predictable behavior. A SOLID pool has bins in well-frozen state with fine structure and minimal segregation. A LIQUID pool has bins still in melt state with high turnover.

Undercooling quantifies freezing driving force. High undercooling means strong tendency to solidify.

Nucleation rate identifies grain density. High nucleation means fine equiaxed structure.

Solid fraction tracks freezing progress. High f_s means fully solidified.

Dendrite growth rate measures front advance. High V_tip means rapid freezing.

Primary arm spacing reflects cooling conditions. Fine lambda_1 means fast cooling with high G_T.

Microsegregation warns of composition heterogeneity. High segregation means non-uniform solid.

Mushy zone width indicates defect risk. Wide mushy zones increase porosity and segregation.

Constitutional supercooling predicts morphology. High CS means dendritic rather than planar growth.

Frozen stability measures post-solidification robustness. High stability means defect-free fine structure.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-solidification/hodlmm-bin-solidification.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-solidification/hodlmm-bin-solidification.ts status
```

### run
Analyzes bin solidification state for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-solidification/hodlmm-bin-solidification.ts run
bun run hodlmm-bin-solidification/hodlmm-bin-solidification.ts run --pool 1
bun run hodlmm-bin-solidification/hodlmm-bin-solidification.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgSolidificationIndex": 52,
    "solidCount": 0,
    "solidifyingCount": 1,
    "mushyCount": 3,
    "nucleatingCount": 1,
    "liquidCount": 0,
    "avgFrozenStability": 0.48,
    "avgSolidFraction": 0.52,
    "avgMicrosegregation": 0.35,
    "totalSolidBins": 5,
    "totalMushyBins": 14,
    "totalLiquidBins": 3,
    "avgSolidificationGini": 0.2
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
      "avgUndercooling": 0.42,
      "maxUndercooling": 0.75,
      "avgNucleationRate": 0.35,
      "maxNucleationRate": 0.68,
      "avgSolidFraction": 0.52,
      "maxSolidFraction": 0.85,
      "avgDendriteGrowthRate": 0.4,
      "maxDendriteGrowthRate": 0.72,
      "avgPrimaryArmSpacing": 0.45,
      "maxPrimaryArmSpacing": 0.78,
      "avgSecondaryArmSpacing": 0.4,
      "maxSecondaryArmSpacing": 0.7,
      "avgPartitionCoefficient": 0.55,
      "avgMicrosegregation": 0.35,
      "maxMicrosegregation": 0.65,
      "avgMacrosegregation": 0.3,
      "avgMushyZoneWidth": 0.45,
      "maxMushyZoneWidth": 0.72,
      "avgConstitutionalSupercooling": 0.38,
      "maxConstitutionalSupercooling": 0.68,
      "avgEquiaxedFraction": 0.32,
      "maxEquiaxedFraction": 0.6,
      "avgSolidificationVelocity": 0.4,
      "maxSolidificationVelocity": 0.7,
      "avgFrozenStability": 0.48,
      "maxFrozenStability": 0.78,
      "solidCount": 5,
      "solidFraction": 0.2,
      "mushyCount": 14,
      "mushyFractionPool": 0.56,
      "liquidCount": 3,
      "liquidFraction": 0.12,
      "solidificationGini": 0.2,
      "solidificationIndex": 52,
      "solidificationRegime": "MUSHY",
      "solidificationVerdict": "MUSHY_ZONE",
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

- Constitutional supercooling criterion G_T < m_L * C_0 * (1 - k) / (D * k) requires thermal gradient, liquidus slope, partition coefficient, and diffusivity; the model approximates these from distance-to-active, imbalance, and concentration differentials without direct temperature or phase-diagram data.
- Primary arm spacing lambda_1 ~ G_T^(-1/2) * V^(-1/4) (Hunt-Kurz) assumes steady-state columnar growth; DLMM bins with intermittent activity violate the steady-state assumption.
- Secondary arm spacing lambda_2 = (M * t)^(1/3) Trivedi-Kurz coarsening assumes Gibbs-Thomson driven ripening in the mushy zone with uniform solute diffusivity; real DLMM reserves have discrete update events.
- Scheil-Gulliver microsegregation C_s = k * C_0 * (1 - f_s)^(k-1) assumes no back-diffusion in solid (alpha = 0 limit); finite alpha modifies the segregation curve.
- Lever rule f_s = (T_l - T) / (T_l - T_s) assumes complete diffusion in both phases; intermediate-alpha freezing lies between Scheil and lever rule.
- Dendrite tip velocity V_tip ~ undercooling^n with n=2-3 (Ivantsov, Kurz-Giovanola) assumes low-Peclet regime; high-velocity solidification has different scaling.
- Heterogeneous nucleation rate I = I_0 * exp(-DG*/kT) with undercooling^2 scaling assumes generic heterogeneities; specific nucleation site densities and catalytic efficiency are not modeled.
- Mushy zone width depends on partition coefficient, cooling rate, and composition; the model proxies these from imbalance and concentration gradients without explicit solidus-liquidus temperatures.
- Columnar-to-equiaxed transition (CET) threshold depends on nucleation density ahead of columnar front relative to velocity; simplified here as nucleation vs growth trade-off without explicit Hunt CET criterion.
- Macrosegregation requires long-range mass transport modeling (shrinkage flow, thermo-solutal convection); the model proxies via pool-scale composition gradients only.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
