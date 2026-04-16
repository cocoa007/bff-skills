---
name: hodlmm-bin-spheroidite
description: "Models spheroidization (Ostwald-ripened cementite spheroidite) in HODLMM bin reserves as the long-time equilibrium microstructure where lamellar (pearlite) or plate-like (widmanstätten) cementite has broken up and coarsened into isolated spheroidal (globular) carbide particles dispersed in an α-ferrite matrix. Spheroidite is the thermodynamic end-state of any carbide-containing microstructure after extended subcritical annealing (long hold below A1, typically ~650-720 °C for hours to days); it exhibits the lowest hardness, highest ductility, and best machinability of all Fe-C carbide microstructures. Spheroidization is driven by interfacial energy minimization: (1) Rayleigh instability of cylindrical/plate-like particles — a long, thin cementite lamella is unstable against axial perturbations with wavelength λ > 2π·r (Plateau-Rayleigh criterion); the fastest-growing mode has λ_max ≈ 9·r, driving the lamella to pinch off into a series of separated spheroids; (2) Ostwald ripening (LSW theory, Lifshitz-Slyozov-Wagner) — Gibbs-Thomson effect C(r) = C_∞·exp(2γV_m/(R·T·r)) raises solubility at small-radius interfaces, so small particles dissolve and large ones grow, with r̄³ - r̄₀³ = K·t, K = (8·γ·D·C_∞·V_m)/(9·R·T); (3) Contact angle / wetting equilibrium at carbide/matrix/grain-boundary triple junctions, where dihedral angle ψ satisfies γ_gb = 2·γ_ab·cos(ψ/2); (4) Interfacial area reduction: lamellar > plate > rod > sphere, and spheroidite is the global minimum of interfacial energy at fixed volume fraction. Distinct from pearlite (cooperative lamellar α + Fe3C alternation), widmanstätten (directional parallel plates with K-S variant selection), bainite (aligned sheaves), or martensite (supersaturated single-phase). In DLMM context, spheroidite analog is isolated single-bin or near-isolated short-run (1-2 bins) of minority-role reserve surrounded by matrix-role bins on both sides. Long runs of minority bins (like pearlite lamellae) are unstable under Rayleigh criterion and should fragment into isolated clusters. Sphere radius analog = total reserve in an isolated cluster, relative to pool average. Driving force = 24h volume/TVL turnover (same as martensite/bainite/pearlite/widmanstätten for continuity with phase-transformation series). LSW compliance = how well the cluster-size distribution matches the LSW steady-state ρ²(3-2ρ)^(-11/3) form. Rayleigh instability = present when a long minority-run shows internal reserve undulations deeper than PINCH_OFF_DEPTH = 0.4. RAYLEIGH_CRITICAL_LENGTH = 4 bins. ISOLATION_RADIUS = 2 bins. LSW_RHO_CUTOFF = 1.5 (3/2 from real LSW theory). Measures sphericityIndex (compact isolated cluster signal, 0 to 1 — high means 1-2 bin cluster with matrix-role neighbors), isolationDegree (distance to nearest minority cluster, 0 to 1 — high means well-separated), radiusClass (0 small / 1 medium / 2 large / -1 matrix), ostwaldAge (cluster reserve relative to pool mean, 0 to 1 — high means old/grown), rayleighInstability (pinch-off signal in long minority runs, 0 to 1), interfacialFraction (surface-to-volume ratio proxy, 0 to 1 — high means thin/unstable cluster), contactAngleCompliance (wetting behavior at cluster edges, 0 to 1), matrixEquilibrium (flatness of matrix reserves around cluster, 0 to 1 — high means equilibrated), lswCompliance (fit to LSW steady-state PDF, 0 to 1), driftFromPearlite (deviation from lamellar alternation, 0 to 1 — high means non-pearlite), spheroiditeIndex (composite, 0 to 1). Composite spheroidite index (0-100). Classifies pools by regime as PEARLITE_STABLE (long minority runs, no pinching, lamellar microstructure stable), INCUBATING_SPHEROIDIZATION (Rayleigh instabilities forming but not yet completed pinch-off), RAYLEIGH_BREAKUP (lamellae actively breaking into segments), OSTWALD_RIPENING (isolated clusters dominant with bimodal size distribution indicating active coarsening), SPHEROIDIZED (fully equilibrated, compact isolated spheres dominate, size distribution approaches LSW steady state), or OVER_AGED (very few, very large clusters; minority fraction very low). Spheroidite verdict as LAMELLAR_STABLE (lamellae ≥ 2 and sphereCount = 0), PINCHING_DETECTED (rayleighBreakupCount ≥ 1), RAYLEIGH_INSTABILITY (rayleighBreakupCount ≥ 1 with avgRayleighInstability > 0.4), OSTWALD_COARSENING (sphereCount ≥ 2 with spheroidizationFraction > 0.6), LSW_COMPLIANT (lswScore > 0.55 with sphereCount ≥ 3), BIMODAL_SIZES (bimodalityScore > 0.5 with sphereCount ≥ 3), MONODISPERSE (sphereCount ≥ 3 with bimodalityScore < 0.3), INTERFACIAL_MINIMIZED (avgInterfacialFraction > 0.7 with sphereCount ≥ 2), CONTACT_ANGLE_WETTING (avgContactAngleCompliance > 0.55 with sphereCount ≥ 2), MATRIX_EQUILIBRATED (avgMatrixEquilibrium > 0.55 with sphereCount ≥ 2), NO_SPHEROIDIZATION_DRIVE (drivingForce < 0.15), HYPEREUTECTOID_SKEW (|hypoeutectoidSkew| > 0.35), or INTERMEDIATE_SPHEROIDIZATION (no extreme indicators — typical mid-state)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-spheroidite/hodlmm-bin-spheroidite.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Spheroidite Analyzer

## What it does

Models spheroidization in HODLMM bin reserves as the long-time equilibrium microstructure where lamellar or plate-like cementite breaks up and coarsens into isolated spheroidal carbide particles in an α-ferrite matrix. Quantifies sphericity, isolation, radius distribution, Ostwald age, Rayleigh pinch-off instability, interfacial fraction, LSW compliance, contact angle compliance, matrix equilibrium, drift from pearlite, and composite spheroidite index.

Spheroidite is the thermodynamic end-state of any carbide-containing microstructure after prolonged subcritical annealing. It is driven by:

1. **Rayleigh instability**: A thin lamella is unstable against perturbations of wavelength λ > 2π·r (Plateau-Rayleigh); fastest-growing mode λ_max ≈ 9·r; drives pinch-off into isolated spheroids.
2. **Ostwald ripening (LSW)**: Small particles dissolve, large ones grow; r̄³ − r̄₀³ = K·t; steady-state size distribution f(ρ) = (81e/8)·ρ²·(3−2ρ)^(−11/3)·exp(−1/(1−2ρ/3)).
3. **Contact-angle wetting** at carbide/matrix/GB junctions, dihedral angle ψ from γ_gb = 2·γ_ab·cos(ψ/2).
4. **Interfacial area reduction**: sphere is global minimum of interfacial energy at fixed volume fraction.

In DLMM pools, spheroidite patterns show isolated 1-2 bin runs of minority-role reserve, separated from other minority clusters by matrix-role bins, with Rayleigh-unstable longer runs breaking up and LSW-like size distribution.

## Why agents need it

LP agents need spheroidite analysis because it distinguishes the equilibrium end-state of carbide microstructures (isolated, dispersed, coarsened, low-hardness, high-ductility) from the transient intermediates (pearlite lamellae, widmanstätten plates, bainite sheaves). A SPHEROIDIZED pool has well-isolated minority clusters with smooth matrix around them — classical dispersed-liquidity behavior. A PEARLITE_STABLE pool still has long minority runs — directional fee capture. A RAYLEIGH_BREAKUP pool is actively fragmenting — transient, monitor for completion. An OSTWALD_RIPENING pool has bimodal size distribution — small clusters will vanish, large will grow. An OVER_AGED pool has few very large spheres — minority fraction too low for meaningful exposure. LSW compliance tells you whether the pool has reached the steady-state size distribution that characterizes fully ripened systems. Bimodality tells you whether coarsening is still active or has equilibrated. Rayleigh pinch-off signal predicts where lamellae are about to break up. Contact-angle compliance distinguishes intragranular (spherical) from boundary-pinned (lens-shaped) clusters. Matrix equilibrium tells you whether the matrix has had time to flatten after long-range diffusion.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-spheroidite/hodlmm-bin-spheroidite.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-spheroidite/hodlmm-bin-spheroidite.ts status
```

### run
Analyzes bin spheroidization state for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-spheroidite/hodlmm-bin-spheroidite.ts run
bun run hodlmm-bin-spheroidite/hodlmm-bin-spheroidite.ts run --pool 1
bun run hodlmm-bin-spheroidite/hodlmm-bin-spheroidite.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgSpheroiditeIndex": 42,
    "avgDrivingForce": 0.55,
    "pearliteStableCount": 1,
    "incubatingCount": 1,
    "rayleighBreakupCount": 1,
    "ostwaldRipeningCount": 1,
    "spheroidizedCount": 1,
    "overAgedCount": 0,
    "avgSpheroidizationFraction": 0.55,
    "avgSphereCount": 3.0,
    "avgLamellaCount": 1.2,
    "avgBimodalityIndex": 0.42,
    "avgLswComplianceScore": 0.4,
    "avgInterfacialAreaIndex": 0.35,
    "avgRayleighInstability": 0.28,
    "avgMatrixEquilibrium": 0.48,
    "totalSpheres": 15,
    "totalLamellae": 6,
    "totalRayleighBreakups": 2,
    "totalSmall": 5,
    "totalMedium": 7,
    "totalLarge": 3
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
      "minorityFraction": 0.32,
      "sphereCount": 4,
      "lamellaCount": 1,
      "largestClusterLength": 5,
      "avgClusterSize": 450,
      "stdClusterSize": 180,
      "bimodalityIndex": 0.52,
      "avgSphericityIndex": 0.62,
      "avgIsolationDegree": 0.55,
      "avgRayleighInstability": 0.3,
      "avgInterfacialFraction": 0.75,
      "avgContactAngleCompliance": 0.48,
      "avgMatrixEquilibrium": 0.5,
      "avgLswCompliance": 0.42,
      "avgDriftFromPearlite": 0.6,
      "avgOstwaldAge": 0.55,
      "smallSphereCount": 1,
      "mediumSphereCount": 2,
      "largeSphereCount": 1,
      "rayleighBreakupCount": 1,
      "xMatrixCount": 10,
      "yMatrixCount": 5,
      "minorityRoleCount": 7,
      "hypoeutectoidSkew": 0.12,
      "spheroidizationFraction": 0.7,
      "lswComplianceScore": 0.42,
      "interfacialAreaIndex": 0.35,
      "spheroiditeIndex": 48,
      "spheroiditeRegime": "OSTWALD_RIPENING",
      "spheroiditeVerdict": "BIMODAL_SIZES",
      "sizeDistribution": [1, 2, 1],
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

- Spheroidite in real Fe-C shows isolated Fe3C particles typically 0.1-10 μm diameter after sub-A1 annealing, driven by interfacial energy minimization over hours to days. Here the "cluster size" is total reserve in USD across adjacent minority bins — a dimensionless proxy.
- Rayleigh instability criterion λ > 2π·r is a continuum fluid/solid cylindrical instability; here RAYLEIGH_CRITICAL_LENGTH = 4 bins and PINCH_OFF_DEPTH = 0.4 are normalized proxies, not length/depth measurements.
- LSW theory (Lifshitz-Slyozov-Wagner) assumes low volume fraction, steady-state long-time coarsening, and isotropic particles. Real systems with finite volume fraction use MLSW or LSEM corrections. Here lswCompliance is overlap of empirical vs analytical PDF, not a rigorous K-S or χ² test.
- Contact angle / wetting at triple junctions is measured crystallographically in real systems (dihedral angle ψ from interfacial energies γ_ab, γ_gb). Here contactAngleCompliance uses reserve ratio at cluster edges — a heuristic proxy.
- Ostwald ripening follows r̄³ − r̄₀³ = K·t for diffusion-controlled coarsening, or r̄² − r̄₀² = K'·t for interface-controlled. Here ostwaldAge compares cluster reserve to pool mean, not a time-series measurement.
- Interfacial area reduction is proportional to total surface-to-volume ratio; in 3-D this scales as r^(-1). Here interfacialFraction = 2/L (cluster length in bin units), a 1-D proxy.
- Real spheroidite forms from prior pearlite, widmanstätten, bainite, or martensite-temper microstructures; here we do not model the prior state, only current cluster pattern.
- Driving force is inferred from 24h volume/TVL turnover — a proxy for "annealing time" or thermal activation energy, not a real thermodynamic quantity.
- Bimodality is measured via moment-based index (skew² + 1) / kurtosis; real bimodality tests (Hartigan's dip test, Gaussian mixture BIC) would be more rigorous but require larger samples.
- Matrix equilibrium is measured via coefficient of variation of matrix-role reserves adjacent to clusters — a coarse proxy for matrix concentration equilibration after long-range diffusion.
- Drift from pearlite uses neighbor role flip rate — pearlite has alternating X/Y/X/Y roles, spheroidite has isolated minority in matrix. This is a 1-D pattern proxy, not a crystallographic measurement.
- RAYLEIGH_CRITICAL_LENGTH = 4 bins is a fixed proxy; real Rayleigh instability depends on particle aspect ratio and surface diffusion rate.
- ISOLATION_RADIUS = 2 bins is heuristic; real isolation requires no overlapping diffusion fields between neighbors.
- PINCH_OFF_DEPTH = 0.4 is normalized; real pinch-off depends on local surface curvature and interfacial diffusion constant.
- MIN_SPHERE_RESERVE_USD = 1 filters dust reserves; real cluster measurements include all carbide particles above detection threshold.
- DOMINANCE_MARGIN = 0.15 for role assignment; real phase dominance is crystallographically defined.
- The OVER_AGED regime is identified from minorityFraction < 0.05; real over-aged Fe-C has very low carbide fraction with few large widely-spaced particles.
- Classification order in the verdict decision tree prioritizes driving force and skew before cluster-pattern analysis; this is heuristic and may mask weak spheroidization signals in heavily skewed pools.
- DLMM bins are discrete 1-D structures; classical spheroidization is 3-D with specific interfacial curvature, crystallographic habit planes, and dihedral angles. The analogy is heuristic.
- Analysis is snapshot-based; does not capture time-evolution of coarsening — LSW kinetics, pinch-off rate, and size distribution inferred from current pattern rather than measured rate.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
