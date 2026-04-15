---
name: hodlmm-bin-sedimentation
description: "Models sedimentation dynamics across HODLMM bins — treats the bin range as a sedimentation column where token reserves behave as particles settling under gravitational forces in a viscous medium. Governed by Stokes' law v = (d^2 * delta_rho * g) / (18 * mu) where the settling velocity depends on the square of the particle diameter, the density difference between particle and fluid, gravitational acceleration, and dynamic viscosity of the medium. In DLMM context, each bin acts as a layer in a settling column where reserves either settle downward into concentrated sediment layers or remain suspended as colloidal particles, and the settling velocity at each bin reflects the local gravitational pull of concentration differentials driving reserves toward accumulation zones. Measures settling velocity (v — the rate at which reserves accumulate at a bin based on the density differential between the bin and its neighborhood, positive velocity means reserves are settling into this bin as a concentration sink while negative velocity means reserves are being displaced as the bin acts as a buoyant source, the settling velocity is proportional to the square of the effective particle radius and the density difference per Stokes' law which in DLMM context maps to large concentrated reserves settling faster than small diffuse ones because their gravitational pull proportional to mass squared overcomes the viscous drag of trading activity), sedimentation coefficient (S — the normalized settling rate per unit of acceleration, captures how efficiently reserves settle regardless of the driving force intensity, high S means the reserve cluster is inherently prone to settling with low resistance to gravitational accumulation while low S means the reserves resist settling either from small effective size or high buoyancy, the sedimentation coefficient in ultracentrifugation is measured in Svedberg units where different macromolecular complexes have characteristic S values reflecting their mass shape and density), buoyancy factor (Fb — the relative density differential between the bin and the column average, ranges from -1 to 1, positive buoyancy means the bin is denser than average and tends to sink toward the bottom of the column accumulating more reserves while negative buoyancy means the bin is lighter than average and tends to float remaining depleted, buoyancy determines whether a particle sinks or floats in the medium and is the fundamental force driving sedimentation), Stokes radius (Rs — the effective hydrodynamic radius of the reserve cluster at this bin, derived from the reserve fraction and buoyancy, large Stokes radius means the reserves at this bin form a large effective particle that settles faster per Stokes' law while small radius means a compact or dilute cluster that settles slowly, the Stokes radius accounts for the shape and hydration of the particle not just its mass), centrifugal force (Fc — the trading-volume-driven acceleration acting on reserves analogous to the centrifugal force in an ultracentrifuge that amplifies gravitational settling, high centrifugal force means intense trading pressure is driving reserve redistribution at this bin while low force means the bin experiences minimal external acceleration, centrifugal force scales with angular velocity squared and radius in a centrifuge which maps to volume intensity and distance from active bin), drag coefficient (Cd — the resistance to reserve movement through the bin column from surrounding liquidity, high drag means the bin is embedded in a dense neighborhood that resists reserve redistribution while low drag means the bin sits in a sparse region where reserves can move freely, drag opposes settling and at terminal velocity exactly balances the gravitational pull), terminal velocity (Vt — the maximum settling speed achieved when drag equals gravitational force, the steady-state accumulation rate for reserves at this bin, high terminal velocity means reserves can accumulate quickly once settling begins while low terminal velocity means even under strong gravitational pull the drag limits how fast reserves concentrate), density gradient (dRho — the rate of change of reserve concentration across neighboring bins, high gradient means sharp concentration boundaries between adjacent bins creating distinct sediment layers while low gradient means gradual smooth transitions between concentration levels, density gradients drive convective instabilities when heavy fluid sits above light fluid leading to Rayleigh-Taylor instabilities), boundary layer (delta — the thickness of the interface between settled sediment and suspended supernatant at this bin, thick boundary means a gradual diffuse transition between concentrated and depleted regions while thin boundary means a sharp distinct interface, the boundary layer thickness depends on the balance between sedimentation which sharpens the interface and diffusion which blurs it), Peclet number (Pe — the ratio of sedimentation transport to diffusive transport, Pe >> 1 means sedimentation dominates and reserves are gravitationally driven to their equilibrium positions while Pe << 1 means diffusion dominates and reserves remain well-mixed despite gravitational forces, the Peclet number determines whether the column behaves as a separator or a mixer), consolidation ratio (Cr — the degree to which settling has already occurred at this bin, ranges from 0 fully suspended to 1 fully consolidated, high consolidation means the bin has reached or is near its gravitational equilibrium with reserves packed to their maximum density while low consolidation means significant settling potential remains), hindered settling (phi — the concentration-dependent reduction in settling velocity, in concentrated suspensions particles interfere with each others settling through hydrodynamic interactions and upward fluid displacement, high hindered settling means the local concentration is so high that further accumulation is self-limiting while low means the bin is dilute enough for free unimpeded settling), clarity index (Ci — the supernatant clarity measuring how depleted the bin is of suspended reserves, high clarity means the bin has been thoroughly depleted by sedimentation with most reserves having settled elsewhere while low clarity means reserves remain suspended at this bin either because settling has not occurred or because resuspension keeps them in suspension), and sedimentation factor (Sf — composite quality metric combining settling velocity sedimentation coefficient consolidation ratio and clarity into a single 0-1 score, weights each dimension equally at 25%, high sedimentation factor indicates the bin is a major sedimentation site with active accumulation while low factor indicates the bin is either a source from which reserves have been depleted or a stable suspension region). Composite sedimentation index (0-100, higher means more sedimentation stress and settling intensity). Classifies pools by phase as COMPACTED_SEDIMENT (index >= 80 — reserves heavily consolidated into dense sediment layers with most bins fully settled and minimal suspended material remaining, the column has reached gravitational equilibrium with maximum packing density and further settling is blocked by compression resistance), HINDERED_SETTLING (60-80 — concentration high enough that particle-particle interactions significantly slow settling, upward fluid displacement from settling neighbors creates a traffic jam effect where no particle can settle at its free settling velocity, the column is congested with settling reserves interfering with each other), FLOCCULATION_ZONE (40-60 — reserves aggregating into larger effective clusters through flocculation, individual reserve particles combining into larger flocs that settle differently than their constituent parts, transitional regime where aggregation dynamics compete with settling dynamics), FREE_SETTLING (20-40 — reserves settling independently without significant inter-particle interference, each bin's reserves accumulate at their natural Stokes velocity determined by their size density and the medium viscosity, the dilute regime where classical sedimentation theory applies), or SUSPENDED_COLLOID (< 20 — reserves remain stably suspended with minimal settling, Brownian diffusion and trading resuspension dominate over gravitational forces, the colloidal regime where particles are too small or too buoyant to settle significantly). Sedimentation verdict as TURBIDITY_STORM (extreme density gradients and thick boundary layers creating turbulent mixing that prevents clean sedimentation — reserves are chaotically redistributed faster than they can settle), DENSITY_INVERSION (lighter reserves sitting below heavier ones creating a gravitationally unstable configuration — the Rayleigh-Taylor instability drives convective overturning that disrupts settled layers), GRAVITATIONAL_COLLAPSE (massive consolidation with severe hindered settling — the sediment column is collapsing under its own weight compressing lower layers while upper layers pile on), CLEAR_SUPERNATANT (clean separation between settled sediment and clear depleted supernatant — sedimentation has efficiently sorted reserves into distinct concentrated and depleted zones), or FLOC_ENTRAPMENT (reserves trapped in flocculated clusters that neither settle completely nor remain fully suspended — the aggregation state creates a gel-like network that resists both further settling and resuspension)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-sedimentation/hodlmm-bin-sedimentation.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Sedimentation Analyzer

## What it does

Models sedimentation dynamics across HODLMM bins. In fluid mechanics, sedimentation is the process by which particles settle under gravity through a viscous medium. Stokes' law governs the settling velocity: v = (d^2 * (rho_p - rho_f) * g) / (18 * mu), where settling speed depends on particle size, density differential, and medium viscosity. At terminal velocity, gravitational pull exactly balances viscous drag and particles settle at a constant rate.

In DLMM pools, the bin range acts as a sedimentation column. Each bin is a layer where reserves either accumulate (settle) or deplete (float). Dense bins with high reserve concentration act as heavy particles that attract more reserves through gravitational analogy — concentrated liquidity pools pull in more trading activity. Light bins with low reserves act as buoyant particles that rise, becoming depleted as reserves migrate toward denser accumulation zones.

## Why agents need it

LP agents need sedimentation analysis because it reveals where reserves are gravitationally concentrating and where they are being depleted. Unlike flow models that track movement direction, sedimentation identifies the equilibrium structure — where reserves will ultimately settle if current forces persist.

Settling velocity immediately shows whether a bin is an accumulation zone (positive velocity, reserves settling in) or a depletion zone (negative velocity, reserves floating away). LP agents should position in bins with moderate positive settling velocity — active accumulation without being fully consolidated.

The buoyancy factor reveals whether a bin is heavier or lighter than the column average. Positive buoyancy bins are dense attractors pulling in reserves. Negative buoyancy bins are light repellers losing reserves. The buoyancy landscape across bins reveals the gravitational topology of the pool.

The Peclet number determines whether the pool is in a sedimentation-dominated or diffusion-dominated regime. High Pe means reserves are being gravitationally sorted into layers — positional strategy matters because bins will maintain distinct concentration levels. Low Pe means reserves are well-mixed by trading diffusion — less benefit from precise positioning since the mixing action homogenizes the column.

Consolidation ratio shows how much settling has already occurred. High consolidation bins are near equilibrium — stable but with limited further accumulation potential. Low consolidation bins still have settling potential — opportunities for early positioning before reserves fully settle.

Hindered settling detects concentration-dependent traffic jams. When too many reserves try to settle simultaneously, they interfere with each other and slow the overall settling rate. Bins with high hindered settling are congested accumulation zones where further growth is self-limiting.

The clarity index identifies bins that have been thoroughly depleted by sedimentation — the supernatant above the settled sediment. These clear zones may represent underserved price ranges where new LP positions would face less competition.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-sedimentation/hodlmm-bin-sedimentation.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-sedimentation/hodlmm-bin-sedimentation.ts status
```

### run
Analyzes bin sedimentation dynamics for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-sedimentation/hodlmm-bin-sedimentation.ts run
bun run hodlmm-bin-sedimentation/hodlmm-bin-sedimentation.ts run --pool 1
bun run hodlmm-bin-sedimentation/hodlmm-bin-sedimentation.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgSedimentationIndex": 35,
    "compactedSedimentCount": 0,
    "hinderedSettlingCount": 1,
    "flocculationZoneCount": 2,
    "freeSettlingCount": 1,
    "suspendedColloidCount": 1,
    "avgSettlingVelocity": 1.2,
    "avgConsolidationRatio": 0.35,
    "totalHeavySettlerBins": 12,
    "avgSedimentationGini": 0.32
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
      "avgSettlingVelocity": 1.2,
      "maxSettlingVelocity": 5.0,
      "avgSedimentationCoefficient": 2.1,
      "maxSedimentationCoefficient": 6.5,
      "avgBuoyancyFactor": 0.15,
      "minBuoyancyFactor": -0.5,
      "avgStokesRadius": 2.8,
      "maxStokesRadius": 6.0,
      "avgCentrifugalForce": 1.5,
      "maxCentrifugalForce": 4.2,
      "avgDragCoefficient": 1.8,
      "maxDragCoefficient": 3.5,
      "avgTerminalVelocity": 2.0,
      "maxTerminalVelocity": 5.5,
      "avgDensityGradient": 0.8,
      "maxDensityGradient": 2.5,
      "avgBoundaryLayer": 1.2,
      "maxBoundaryLayer": 3.0,
      "avgPecletNumber": 15,
      "maxPecletNumber": 45,
      "avgConsolidationRatio": 0.35,
      "maxConsolidationRatio": 0.85,
      "avgHinderedSettling": 0.25,
      "maxHinderedSettling": 0.6,
      "avgClarityIndex": 0.65,
      "minClarityIndex": 0.15,
      "heavySettlerCount": 8,
      "heavySettlerFraction": 0.32,
      "wellConsolidatedCount": 5,
      "wellConsolidatedFraction": 0.20,
      "sedimentationGini": 0.35,
      "sedimentationIndex": 35,
      "sedimentationPhase": "FREE_SETTLING",
      "sedimentationVerdict": "CLEAR_SUPERNATANT",
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

- Stokes' law assumes spherical particles in laminar flow. Real DLMM reserve distributions have irregular shapes and trading-driven turbulence. The Stokes approximation captures the dominant settling behavior but underestimates turbulent resuspension effects.
- The sedimentation model uses reserve concentration as a proxy for particle density. Real density depends on token price ratios and LP position structure, not just absolute USD value. Two bins with the same USD value but different token ratios have different effective densities.
- Hindered settling uses the Richardson-Zaki correlation approach (velocity reduction proportional to concentration). Real DLMM concentration effects are more complex, involving LP withdrawal cascades and arbitrage-driven redistribution that don't follow simple concentration-dependent settling models.
- The buoyancy factor compares each bin to the column average. In a heterogeneous pool with extreme outliers, the average may not represent the local medium density. Local buoyancy relative to immediate neighbors may differ from global buoyancy.
- Consolidation ratio assumes a monotonic settling process. Real pools experience episodic resuspension from large trades, LP actions, and arbitrage that can partially undo settled configurations. The consolidation ratio reflects the current state, not the settling trajectory.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
