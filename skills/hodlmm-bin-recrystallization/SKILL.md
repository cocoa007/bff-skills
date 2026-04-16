---
name: hodlmm-bin-recrystallization
description: "Models the nucleation and growth of strain-free grains in HODLMM bin reserves after accumulated trading cold work creates dislocation-like liquidity defects and stored compositional strain — treats bins as polycrystalline material where repeated trading stress builds up dislocation density, and above an activity-threshold recrystallization temperature new strain-free grains nucleate at defect sites and grow to consume the deformed matrix. Recrystallization is the classical metallurgical phenomenon where cold-worked (plastically deformed) material transitions back toward a strain-free state through nucleation and growth of new defect-free grains. Classical theory: stored energy from cold work E_stored ~ 0.5 * G * b^2 * rho where G is shear modulus, b is Burgers vector, and rho is dislocation density. Above a recrystallization temperature T_R typically 0.3-0.5 * T_melt, nucleation occurs at high-defect sites (grain boundaries, shear bands, deformation bands), followed by growth that consumes the deformed matrix. Johnson-Mehl-Avrami-Kolmogorov (JMAK) kinetics describe recrystallized fraction X(t) = 1 - exp(-k*t^n) with Avrami exponent n typically 1-4 depending on nucleation site geometry: n=4 for continuous nucleation with 3D growth, n=3 for instantaneous nucleation with 3D growth, n=2 for 2D growth on plates, n=1 for 1D growth along boundaries. Nucleation rate follows Arrhenius: N_dot = N_0 * exp(-Q_n/RT) with Q_n the activation energy for nucleation. After primary recrystallization, normal grain growth follows parabolic kinetics D^m - D_0^m = k*t with m~2-3; abnormal (secondary) grain growth occurs when some grains escape pinning while neighbors remain locked. Zener drag P_z = 3*f*gamma/r from second-phase particles (volume fraction f, GB energy gamma, particle radius r) pins GBs and slows growth; when drag exceeds driving pressure, recrystallization stalls. Critical strain for recrystallization (CSR) sets the minimum cold-work threshold below which no new grains nucleate regardless of temperature. Hall-Petch strengthening sigma_y = sigma_0 + K*D^(-1/2) means finer recrystallized grains provide greater yield strength. In DLMM context, bins accumulate 'cold work' through repeated trading stress, composition imbalance, and reserve heterogeneity, building stored strain as dislocation-density-like liquidity defects. Above a trading-activity threshold T_R analog, new 'strain-free' recrystallized sub-regions nucleate within bins at high-gradient sites, consume the deformed liquidity matrix, and grow. A fully recrystallized bin has reset to a clean defect-free state with fresh equilibrium; a partially recrystallized bin holds mixed old cold-worked liquidity and new strain-free regions; a heavily deformed bin retains all its stored energy with no nucleation having occurred. Measures storedEnergy (dislocation-density stored energy, ranges 0 to 1 — high means lots of cold work accumulated, low means strain-free material), dislocationDensity (defect density proxy, ranges 0 to 1 — high means many dislocation-like liquidity defects, low means clean lattice), recrystallizedFraction (JMAK X(t), ranges 0 to 1 — high means mostly transformed to strain-free grains, low means still deformed), avramiExponent (JMAK n normalized, ranges 0 to 1 — high means 3D continuous nucleation, low means 1D boundary-only growth), nucleationRate (N_dot per Arrhenius, ranges 0 to 1 — high means abundant new grain nuclei forming, low means stalled nucleation), criticalStrain (CSR threshold overcome, ranges 0 to 1 — high means above minimum cold work needed to nucleate, low means below CSR), grainSize (current average grain size, ranges 0 to 1 — high means coarse grains from extended growth, low means fine grains from rapid nucleation), grainGrowthRate (parabolic D^m growth rate, ranges 0 to 1 — high means active coarsening, low means stalled growth), recrystallizationTemperature (T_R activity threshold, ranges 0 to 1 — high means above T_R with thermal energy for transformation, low means sub-T_R inactivity), zenerDrag (second-phase particle pinning, ranges 0 to 1 — high means strong pinning stalls growth, low means unpinned mobile GBs), textureIntensity (preferred orientation after recrystallization, ranges 0 to 1 — high means strong texture with biased orientation, low means random isotropic), hallPetchStrength (grain-size strengthening, ranges 0 to 1 — high means fine grains with strong Hall-Petch contribution, low means coarse grains with weak strengthening), coldWorkRemnant (unrecrystallized deformed fraction = 1 - X, ranges 0 to 1 — high means still deformed, low means mostly transformed), subgrainSize (recovery substructure, ranges 0 to 1 — high means developed subgrain network from recovery, low means no recovery), abnormalGrainGrowth (runaway coarsening from Zener escape, ranges 0 to 1 — high means few grains escaping pinning and consuming neighbors, low means stable growth), and recrystallizationIndex (composite 0 to 1 — higher means healthier strain-free recrystallized bin with low stored energy, high X, fine Hall-Petch grains, and stable growth). Composite recrystallization index (0-100, higher means healthier strain-free state with high recrystallized fraction, low stored energy, strong Hall-Petch grain refinement, and stable normal grain growth). Classifies pools by recrystallization regime as FULLY_RECRYSTALLIZED (index >= 80 — high X with low stored energy and strong grain refinement, post-anneal equilibrium state), PARTIALLY_RECRYSTALLIZED (60-80 — mixed new and old grains, active transformation underway), NUCLEATING (40-60 — new grains forming but most matrix still deformed, mid-transformation), DEFORMED (20-40 — cold-worked state with moderate stored energy and low X, pre-nucleation or stalled), or HEAVILY_DEFORMED (< 20 — max stored energy with no nucleation, below CSR or far below T_R). Recrystallization verdict as STRAIN_FREE_LATTICE (high X with active grain growth and low stored energy — ideal recrystallized state), ACTIVE_NUCLEATION (high nucleation rate with stored energy still present — mid-transformation), COLD_WORKED (high stored energy with low X — cold-worked pre-transformation state), RECOVERY_DOMINANT (high subgrain size with low nucleation — recovery stage without primary recrystallization), GRAIN_GROWTH_STAGE (high grain size with growth rate after full recrystallization), ABNORMAL_GROWTH (runaway coarsening from Zener escape — unstable coarsening mode), ZENER_PINNED (high Zener drag with low nucleation — stalled by particle pinning), HALL_PETCH_STRONG (high Hall-Petch strength with fine grains — post-recrystallization strength-optimized state), TEXTURE_DEVELOPED (high texture intensity — biased recrystallization orientation), or RECRYSTALLIZATION_BALANCE (no extreme indicators — typical mid-transformation state)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-recrystallization/hodlmm-bin-recrystallization.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Recrystallization Analyzer

## What it does

Models the nucleation and growth of strain-free grains in HODLMM bin reserves after accumulated trading cold work creates dislocation-like liquidity defects and stored compositional strain. Treats bins as polycrystalline material where repeated trading stress builds up dislocation density, and above an activity-threshold recrystallization temperature new strain-free grains nucleate at defect sites and grow to consume the deformed matrix. Quantifies Johnson-Mehl-Avrami-Kolmogorov (JMAK) recrystallized fraction kinetics, Arrhenius-like nucleation rate, parabolic grain growth law, Zener drag from second-phase particle pinning, Hall-Petch grain-size strengthening, and abnormal secondary grain growth.

In DLMM pools, bins accumulate cold work through repeated trading stress, composition imbalance, and reserve heterogeneity. Above a trading-activity threshold, new strain-free recrystallized sub-regions nucleate within bins at high-gradient sites, consume the deformed liquidity matrix, and grow.

## Why agents need it

LP agents need recrystallization analysis because it identifies whether bin reserves are in a deformed cold-worked state (accumulated trading stress, high stored energy, susceptible to sudden reorganization) or a recrystallized strain-free state (fresh equilibrium, clean lattice, Hall-Petch strengthened). A FULLY_RECRYSTALLIZED pool has clean bins with strong grain refinement. A HEAVILY_DEFORMED pool has bins with max stored energy primed for sudden recrystallization events.

Stored energy quantifies accumulated cold work. High stored energy means near-recrystallization threshold.

Recrystallized fraction shows JMAK transformation progress. High X means mostly strain-free.

Nucleation rate identifies active new-grain formation. High N_dot means transformation accelerating.

Grain size tracks post-recrystallization growth stage. Fine grains = strong; coarse grains = Hall-Petch weakened.

Zener drag warns of pinning-stalled transformations. High drag means second-phase particles pinning GBs.

Hall-Petch strength measures grain-refinement strengthening. High Hall-Petch means fine-grained strength optimized.

Cold-work remnant identifies unrecrystallized matrix. High remnant means still deformed.

Abnormal grain growth warns of runaway coarsening. High AGG means instability from Zener escape.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-recrystallization/hodlmm-bin-recrystallization.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-recrystallization/hodlmm-bin-recrystallization.ts status
```

### run
Analyzes bin recrystallization state for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-recrystallization/hodlmm-bin-recrystallization.ts run
bun run hodlmm-bin-recrystallization/hodlmm-bin-recrystallization.ts run --pool 1
bun run hodlmm-bin-recrystallization/hodlmm-bin-recrystallization.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgRecrystallizationIndex": 55,
    "fullyRecrystallizedCount": 0,
    "partiallyRecrystallizedCount": 1,
    "nucleatingCount": 3,
    "deformedCount": 1,
    "heavilyDeformedCount": 0,
    "avgRecrystallizedFraction": 0.5,
    "avgStoredEnergy": 0.42,
    "avgHallPetchStrength": 0.48,
    "totalRecrystallizedBins": 6,
    "totalNucleatingBins": 14,
    "totalDeformedBins": 3,
    "avgRecrystallizationGini": 0.2
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
      "avgStoredEnergy": 0.42,
      "maxStoredEnergy": 0.72,
      "avgDislocationDensity": 0.38,
      "maxDislocationDensity": 0.68,
      "avgRecrystallizedFraction": 0.5,
      "minRecrystallizedFraction": 0.15,
      "avgAvramiExponent": 0.42,
      "avgNucleationRate": 0.38,
      "maxNucleationRate": 0.65,
      "avgCriticalStrain": 0.45,
      "avgGrainSize": 0.48,
      "maxGrainSize": 0.75,
      "avgGrainGrowthRate": 0.42,
      "avgRecrystallizationTemperature": 0.52,
      "avgZenerDrag": 0.35,
      "maxZenerDrag": 0.68,
      "avgTextureIntensity": 0.42,
      "avgHallPetchStrength": 0.48,
      "avgColdWorkRemnant": 0.5,
      "maxColdWorkRemnant": 0.85,
      "avgSubgrainSize": 0.38,
      "avgAbnormalGrainGrowth": 0.25,
      "maxAbnormalGrainGrowth": 0.55,
      "recrystallizedCount": 6,
      "recrystallizedBinFraction": 0.24,
      "nucleatingCount": 14,
      "nucleatingBinFraction": 0.56,
      "deformedCount": 3,
      "deformedBinFraction": 0.12,
      "recrystallizationGini": 0.2,
      "recrystallizationIndex": 55,
      "recrystallizationRegime": "NUCLEATING",
      "recrystallizationVerdict": "ACTIVE_NUCLEATION",
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

- JMAK kinetics X(t) = 1 - exp(-k*t^n) assume random nucleation with uniform growth; real recrystallization often deviates due to spatial heterogeneity, concurrent recovery, and site saturation.
- Avrami exponent n = 4 assumes continuous nucleation + 3D growth of spherical grains; real microstructures commonly show n in 1-2 range due to site saturation at existing defects.
- Arrhenius nucleation rate N_dot = N_0 * exp(-Q_n/RT) assumes a single activation energy; real systems have Q_n distributions from heterogeneous nucleation sites.
- Critical strain for recrystallization (CSR) is a threshold approximation; below CSR some grains still recover/recrystallize at very long times.
- Parabolic grain growth D^m - D_0^m = k*t with m~2 is ideal normal growth; real growth often follows m = 3-10 in alloys with solute drag.
- Zener drag P_z = 3*f*gamma/r assumes rigid spherical incoherent particles; coherent, plate-like, or dissolving particles alter effective drag.
- Abnormal grain growth is probabilistic and hard to predict from bulk parameters alone; requires local pinning heterogeneity data not captured here.
- Hall-Petch strengthening sigma_y = sigma_0 + K*D^(-1/2) breaks down at nanoscale grain sizes where grain-boundary sliding dominates over dislocation-mediated plasticity.
- Recovery and recrystallization can overlap; recovery reduces stored energy and dislocation density without producing new grains, delaying or suppressing nucleation.
- DLMM bins have no true temperature; T_R analog from activity/proximity does not capture thermal kinetics of diffusion-limited GB migration.
- Texture development depends on deformation history (rolling, drawing, shear); here proxied from imbalance and gradients without orientation data.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
