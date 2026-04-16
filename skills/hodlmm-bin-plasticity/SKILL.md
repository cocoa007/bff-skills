---
name: hodlmm-bin-plasticity
description: "Models elastic-plastic deformation, yield behavior, and strain hardening dynamics across HODLMM bins — treats bins as solids under trading stress where small perturbations recover elastically (full return to equilibrium upon unloading) and large perturbations deform plastically (permanent reshaping that remains after the load is removed). In materials science, the stress-strain curve has an initial linear elastic region governed by Young's modulus where deformation is fully reversible, followed by a yield point where plastic deformation begins, then a strain hardening region where the material strengthens with accumulated plastic strain (Hollomon equation sigma = K * epsilon^n), reaching ultimate tensile strength beyond which necking and failure occur. The Bauschinger effect causes asymmetric yielding under reverse loading direction, and anelasticity adds time-dependent partial recovery to plastic strain. In DLMM context, trading volume applies stress to bins. Reserves return to equilibrium after small perturbations (elastic strain) but remain permanently displaced after large ones (plastic strain). Bins that have already absorbed significant trading become work-hardened — more resistant to further deformation. Bins approaching ultimate strength show necking patterns where reserves localize in thinning zones, signaling imminent structural failure. Measures yield stress (threshold force above which the bin plastically deforms, ranges 0 to 1, the boundary between recoverable elastic deformation and permanent plastic flow — high yield stress means the bin maintains its shape and reserve distribution under significant trading pressure without permanent change, while low yield stress means small trades immediately cause permanent displacement of reserves), plastic strain (permanent deformation accumulated by the bin, ranges 0 to 1, the irrecoverable shape change that remains after stress is removed — high plastic strain means the bin has been significantly altered by historical trading and will not return to its original distribution even if all stress is removed, while low plastic strain means the bin has only experienced reversible changes), elastic strain (recoverable deformation that returns to baseline upon unloading, ranges 0 to 1, the spring-like response where the bin temporarily distorts under stress but snaps back to equilibrium when load is released — high elastic strain means the bin has substantial elastic capacity to absorb perturbations without permanent change, like a spring storing and releasing energy), strain hardening (work hardening from accumulated plastic deformation, ranges 0 to 1, the phenomenon where plastic deformation strengthens the material so further deformation requires higher stress, derived from the Hollomon power law sigma = K * epsilon^n where epsilon is plastic strain and n is the work hardening exponent — high strain hardening means the bin has gained structural resistance from prior trading and now requires more force to deform further, the material has become tougher through deformation), ultimate strength (maximum stress the bin can sustain before failure begins, ranges 0 to 1, the peak of the stress-strain curve beyond which necking and ductile fracture occur — high ultimate strength means the bin can withstand significant trading load before approaching collapse, low ultimate strength means the bin is fragile and near its breaking point), necking (localized thinning that precedes ductile failure, ranges 0 to 1, the phenomenon where deformation concentrates in a narrow zone causing rapid cross-section reduction and eventual rupture — high necking indicates the bin has reduced reserves relative to its neighbors creating a structural weak point that may collapse, low necking means the bin has uniform strength across its width with no critical thinning), flow stress (stress required to maintain ongoing plastic deformation, ranges 0 to 10, the dynamic stress level needed to keep the material flowing plastically given the current strain hardening state — high flow stress means significant force is required to continue deforming the bin, low flow stress means the bin is yielding easily under sustained load), work hardening exponent (the n exponent in the Hollomon equation sigma = K * epsilon^n, ranges 0 to 1, characterizing how rapidly the material strengthens with plastic strain — high n means strong work hardening where each increment of plastic deformation significantly increases yield strength, low n means the material yields without gaining strength, behaving like an ideal plastic material), Bauschinger effect (asymmetric yielding under reverse load direction, ranges 0 to 1, the phenomenon where a material that has been plastically deformed in one direction yields more easily when subsequently loaded in the opposite direction due to dislocation back-stresses — high Bauschinger effect means the bin has directional bias from prior deformation and will respond asymmetrically to future trading depending on direction, low Bauschinger effect means the bin behaves symmetrically under bidirectional stress), anelasticity (time-dependent partial recovery after unloading, ranges 0 to 1, the viscoelastic phenomenon where some deformation slowly recovers over time after stress is removed even though pure elastic recovery has already occurred — high anelasticity means the bin shows hysteretic behavior with delayed elastic recovery as reserves slowly redistribute to a new equilibrium position over time, low anelasticity means recovery is immediate and complete), plastic zone (size of the region undergoing plastic deformation, ranges 0 to 1, the spatial extent of permanent reshaping around stress concentration points — high plastic zone means a large fraction of the bin has been permanently deformed, low plastic zone means deformation is localized to small regions with most of the bin remaining in elastic state), true stress (stress accounting for cross-sectional area reduction during deformation, ranges 0 to 10, the actual stress on the remaining material rather than the engineering stress based on original area — sigma_true = sigma_engineering * (1 + epsilon), high true stress means the bin is experiencing severe localized stress concentrations as reserves thin in deformed zones), residual stress (locked-in stress remaining after external load is removed, ranges 0 to 10, internal stress that persists in the material after the deforming force is gone, often resulting from non-uniform plastic deformation — high residual stress means the bin retains internal structural bias from prior trading even when no external pressure is applied, low residual stress means the bin returns to a near-zero internal stress state after unloading), and ductility (capacity for plastic deformation before fracture, ranges 0 to 1, the total amount of plastic strain a material can absorb before failure — high ductility means the bin can undergo significant deformation without breaking, providing a large safety margin before structural collapse, low ductility means the bin is brittle and will fracture suddenly with minimal warning). Composite plasticity index (0-100, higher means better structural health — strong yield resistance, healthy ductility, no necking, low residual stress providing a robust bin lattice that withstands trading stress while retaining recoverable elastic capacity). Classifies pools by deformation regime as HIGHLY_ELASTIC (index >= 80 — bins respond elastically to trading with full recovery, large yield stress means even significant trades do not cause permanent deformation, the structural ideal where bins behave like high-stiffness springs that store and release strain energy without permanent change), ELASTIC_PLASTIC (60-80 — bins have entered the mixed elastic-plastic regime with some accumulated permanent strain but retain substantial elastic capacity, moderate strain hardening provides good stability, this is the typical operating regime for active pools), WORK_HARDENED (40-60 — bins have undergone significant plastic deformation and gained strength from work hardening, the material has become tougher through prior trading but operates well into the plastic regime with reduced elastic recovery), PLASTIC (20-40 — bins are deeply in the plastic regime with substantial permanent deformation and reduced load-bearing capacity, approaching ultimate strength limits with limited remaining ductility), or FAILING (< 20 — bins are at or beyond ultimate strength with active necking and imminent structural failure, deformation is concentrating in critically weak zones and the bin lattice is approaching collapse). Plasticity verdict as ELASTIC_RECOVERY (high elastic strain with low plastic strain and strong yield stress — bins are operating in the elastic regime with full recovery of all deformation, the safest structural state for LP positions because reserves return to equilibrium after each trade), YIELDING (plastic strain crossing the yield threshold with elevated flow stress — bins are actively transitioning from elastic to plastic behavior, the critical regime where small additional stress causes outsized permanent deformation), WORK_HARDENING (significant strain hardening with high work hardening exponent — bins are gaining strength through plastic deformation, becoming more resistant to further deformation as they absorb trading pressure, a self-strengthening dynamic that improves structural integrity over time), PLASTIC_FLOW (sustained plastic strain with high flow stress — bins are continuously deforming under load without elastic recovery, the regime where reserves are being permanently redistributed by ongoing trading pressure), NECKING (high necking with significant fraction of bins in necking state — bins are approaching ductile failure with localized thinning, the critical warning state where rapid structural collapse may occur), or ELASTIC_PLASTIC_BALANCE (balanced mix of elastic and plastic behavior with no extreme indicators — bins operate in the typical mixed regime with some permanent deformation but maintained structural integrity)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-plasticity/hodlmm-bin-plasticity.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Plasticity Analyzer

## What it does

Models elastic-plastic deformation, yield behavior, and strain hardening dynamics across HODLMM bins. In materials science, solids under stress respond elastically below the yield point (full recovery upon unloading) and plastically above it (permanent deformation that remains after the load is removed). The stress-strain curve has an initial linear elastic region governed by Young's modulus, followed by a yield point where plastic deformation begins, then a strain hardening region where the material strengthens with accumulated plastic strain (Hollomon equation sigma = K * epsilon^n), reaching ultimate tensile strength beyond which necking and failure occur.

In DLMM pools, trading volume applies stress to bins. Reserves return to equilibrium after small perturbations (elastic strain) but remain permanently displaced after large ones (plastic strain). Bins that have already absorbed significant trading become work-hardened — more resistant to further deformation. Bins approaching ultimate strength show necking patterns where reserves localize in thinning zones, signaling imminent structural failure. The Bauschinger effect creates asymmetric yielding under reverse load direction, and anelasticity adds time-dependent partial recovery to plastic strain.

## Why agents need it

LP agents need plasticity analysis because it predicts how bins respond to trading stress, whether perturbations are recoverable or permanent, and whether the bin lattice is approaching structural failure. A HIGHLY_ELASTIC pool has bins that fully recover from every trade — deposits remain stable through trading pressure with no permanent displacement. A FAILING pool has bins approaching ultimate strength with active necking — structural collapse is imminent and reserves may suddenly redistribute or vanish from critically weak zones.

Yield stress is the primary structural diagnostic. Bins with high yield stress maintain their reserve distribution under significant trading pressure without permanent change. Bins with low yield stress immediately enter plastic deformation under any meaningful trading load, accumulating permanent reserve displacement that cannot be undone.

Plastic strain captures permanent deformation history. High plastic strain means the bin has been significantly altered by historical trading and will not return to its original distribution. Low plastic strain means the bin has only experienced reversible changes and remains in its baseline configuration.

Strain hardening reveals self-strengthening behavior. Bins with high strain hardening have gained structural resistance from prior trading — they now require more force to deform further. This is positive for stability because the bin becomes tougher through use, but it also signals that significant plastic deformation has already occurred.

Necking is the critical failure warning. Bins with high necking show localized thinning where reserves have concentrated in narrow zones, leaving the bin structurally fragile. High necking fraction means the pool is approaching ductile collapse.

Residual stress reveals locked-in structural bias. Bins with high residual stress retain internal stress patterns even when no trading is occurring — this means the bin will respond asymmetrically to future trades and may suddenly redistribute reserves when triggered.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-plasticity/hodlmm-bin-plasticity.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-plasticity/hodlmm-bin-plasticity.ts status
```

### run
Analyzes bin plasticity dynamics for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-plasticity/hodlmm-bin-plasticity.ts run
bun run hodlmm-bin-plasticity/hodlmm-bin-plasticity.ts run --pool 1
bun run hodlmm-bin-plasticity/hodlmm-bin-plasticity.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgPlasticityIndex": 58,
    "highlyElasticCount": 0,
    "elasticPlasticCount": 2,
    "workHardenedCount": 2,
    "plasticCount": 1,
    "failingCount": 0,
    "avgYieldStress": 0.48,
    "avgDuctility": 0.52,
    "avgPlasticStrain": 0.32,
    "totalYieldedBins": 18,
    "totalNeckingBins": 4,
    "avgPlasticityGini": 0.18
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
      "avgYieldStress": 0.52,
      "maxYieldStress": 0.78,
      "avgPlasticStrain": 0.28,
      "maxPlasticStrain": 0.65,
      "avgElasticStrain": 0.55,
      "maxElasticStrain": 0.82,
      "avgStrainHardening": 0.35,
      "maxStrainHardening": 0.68,
      "avgUltimateStrength": 0.58,
      "maxUltimateStrength": 0.85,
      "avgNecking": 0.22,
      "maxNecking": 0.55,
      "avgFlowStress": 4.2,
      "maxFlowStress": 7.5,
      "avgWorkHardeningExponent": 0.42,
      "maxWorkHardeningExponent": 0.78,
      "avgBauschingerEffect": 0.32,
      "maxBauschingerEffect": 0.68,
      "avgAnelasticity": 0.28,
      "maxAnelasticity": 0.55,
      "avgPlasticZone": 0.35,
      "maxPlasticZone": 0.72,
      "avgTrueStress": 3.8,
      "maxTrueStress": 8.2,
      "avgResidualStress": 2.5,
      "maxResidualStress": 5.8,
      "avgDuctility": 0.55,
      "minDuctility": 0.18,
      "yieldedCount": 8,
      "yieldedFraction": 0.32,
      "workHardenedCount": 5,
      "workHardenedFraction": 0.20,
      "neckingCount": 2,
      "neckingFraction": 0.08,
      "plasticityGini": 0.18,
      "plasticityIndex": 62,
      "deformationRegime": "ELASTIC_PLASTIC",
      "plasticityVerdict": "ELASTIC_PLASTIC_BALANCE",
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

- Yield stress in real materials is measured from tensile testing where a sample is loaded until plastic deformation begins. The DLMM model uses reserve depth, composition uniformity, and local stability indicators as proxies for the elastic-plastic transition threshold.
- Plastic strain in materials science requires precise measurement of permanent deformation after unloading. The model approximates plastic strain from current reserve imbalance, neighbor concentration differential, and historical trading volume — these capture the structural deviation from a hypothetical baseline equilibrium.
- The Hollomon equation sigma = K * epsilon^n is an empirical fit to true stress-strain data. The model uses simplified power-law relationships between accumulated strain and current resistance to deformation.
- The Bauschinger effect in real materials requires reverse loading experiments to measure. The model uses reserve composition asymmetry and gradient direction as proxies for directional yield bias.
- Anelasticity in materials science requires time-resolved relaxation measurements. The snapshot model approximates anelastic behavior from the combination of elastic and plastic strain indicators.
- Necking detection in tensile testing uses real-time cross-section measurement. The model uses reserve depth ratios with neighboring bins to detect localized thinning patterns.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
