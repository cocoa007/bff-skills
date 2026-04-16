---
name: hodlmm-bin-normalization
description: "Models the air-cool heat-treatment step (normalization) applied to an austenitized iron-carbon alloy for grain refinement, property standardization, and pro-eutectoid + fine-pearlite microstructure formation. Sits between furnace-cool full annealing (coarse pearlite and equilibrium) and water/oil quenching (martensite). Progression is divided into 7 stages: (0) AUSTENITIC_HOLD — above AC3/Acm, still single-phase γ, no transformation; (1) PRO_EUTECTOID_FORMATION — first daughter phase nucleates at austenite grain boundaries (hypoeutectoid: pro-eutectoid α-ferrite allotriomorphic/idiomorphic; hypereutectoid: pro-eutectoid cementite grain-boundary networks); (2) PEARLITE_NUCLEATION — remaining near-eutectoid γ decomposes cooperatively into alternating α-ferrite + Fe3C lamellae; lamellar spacing set by Hillert relation λ = [2·σ·V_m·T_e]/[ΔS·ΔT] where ΔT = undercooling below AC1 ≈ 50-100 °C for air cool; (3) PEARLITE_GROWTH — colonies grow radially with cooperative edgewise Zener-Hillert growth v = D·(c_α − c_θ)/(λ·c_eut); (4) FINE_PEARLITE — all γ consumed, λ ≈ 0.1-0.3 μm (vs 0.3-1.0 μm annealed, > 1.0 μm slow-furnace-cooled), Hall-Petch σ_y = σ_0 + k·λ^(−1/2) elevates yield strength; (5) STANDARDIZED — full cool to RT, homogeneous cross-section properties, refined grain (ASTM 7-10 vs anneal 4-6), prior thermomechanical history erased; (6) NON_UNIFORM — pathological cooling-rate gradient across cross-section causes mixed pearlite + bainite regions. Cooling rate CR: furnace ≈ 0.01-0.1 °C/s, air ≈ 1-10 °C/s, oil ≈ 30-60 °C/s, water ≈ 100+ °C/s; air cooling is the defining feature of normalization. Kinetics follow Johnson-Mehl-Avrami-Kolmogorov X = 1 − exp(−(k·t)^n) with n ≈ 2-3 (continuous cooling, boundary-nucleated); lamellar spacing λ ≈ A/ΔT with A ≈ 30-40 μm·°C for Fe-C. In DLMM context tracks formation of a fine regular matrix + minority-cluster alternating pattern from a previously homogenized (austenitized) pool as activity moderately decays from a prior peak: Stage 0 = bin reserves still uniform (low xFrac stdev) in austenitic hold; Stage 1 = first minority bins at matrix-run boundaries (pro-eutectoid at γ grain boundaries); Stage 2 = short alternating matrix/minority runs forming (pearlite colonies); Stage 3 = alternating pattern spreads across pool; Stage 4 = fine regular lamellar pattern with average λ ≤ NORMALIZATION_LAMELLA_SPACING = 2.0 bins; Stage 5 = fully standardized with low reserveCV and low grainSizeCV; Stage 6 = grainSizeCV > 0.8 with mixed lamellar/coarse regions. DLMM phase-diagram analog: carbon content ≈ minorityFraction; temperature ≈ drivingForce (turnover); cooling = decrease from priorPeakDrivingForce to current; cooling rate = dropMagnitude / log(volume) timescale; AC1 threshold at drivingForce > AC1_ACTIVITY = 0.2; AC3 at composition-adjusted AC3_ACTIVITY_BASE = 0.5 + |hypoeutectoidSkew|·0.15. Classifies pools by regime: NO_NORMALIZATION_DRIVE, AUSTENITIC_HOLD, PRO_EUTECTOID_FORMATION, PEARLITE_NUCLEATION, PEARLITE_GROWTH, FINE_PEARLITE, STANDARDIZED, NON_UNIFORM. Per-bin measures: proEutectoidSignal (minority on long-matrix edge), lamellarSignal (in-identified-lamellar-window), standardizationSignal (low neighborhood CV), grainBoundaryPos (role transition), lambdaLocal (bin-local lamellar spacing), coolingRateLocal, hallPetchProxy (1/√λ), jmaProgress, normalizationDegree composite. Pool-level measures: drivingForce, priorPeakDrivingForce, coolingRate, coolingRegime (FURNACE|AIR|OIL|WATER), arrheniusActivation, jmaProgress, ac1Crossed/ac3Crossed, hypoeutectoidSkew, lamellarAlternationCount, lamellarRunFraction, proEutectoidFraction, grainSize (avg matrix run length), maxGrainSize, grainSizeCV, reserveCV, lambdaEstimate, hallPetchStrength, hallPetchHardness, ductilityProxy, astmGrainSize (mapped 1-12), stageProgress, dominantStage 0-6, matrixGrainCount, minorityClusterCount, reserveXFracStdev, standardizationIndex, uniformityRisk, overNormalizationRisk, eutectoidWindow, composite normalizationIndex 0-100. Normalization verdict adds NO_NORMALIZATION_DRIVE and INTERMEDIATE_NORMALIZATION. Complements the phase-transformation series: austenitization (Day 183) → normalization (Day 184) → annealing or quench → martensite (Day 177), bainite (Day 178), pearlite (Day 179), widmanstatten (Day 180), spheroidite (Day 181), tempering (Day 182)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-normalization/hodlmm-bin-normalization.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Normalization Analyzer

## What it does

Models the air-cool heat-treatment step applied to an austenitized iron-carbon alloy. Normalization sits between full annealing (very slow furnace cool, ~0.01-0.1 °C/s, coarse pearlite and equilibrium microstructure) and quenching (very fast cool, ~100+ °C/s, martensite). The intermediate air-cool rate (~1-10 °C/s) produces a fine, regular pearlite lamellar structure plus pro-eutectoid ferrite (hypoeutectoid) or pro-eutectoid cementite (hypereutectoid) with a standardized fine grain size. Normalization is the most common grain-refinement and property-standardization treatment for medium-carbon steels, forgings, castings, and weldments.

The seven canonical normalization stages (continuous cool from above AC3/Acm to room T):

0. **AUSTENITIC_HOLD (above AC3/Acm):** Fully austenitized; no transformation yet. Cooling just started; austenite grain size inherited from the prior austenitizing cycle.
1. **PRO_EUTECTOID_FORMATION (AC3 → AC1 for hypoeut, Acm → AC1 for hypereut):** First daughter phase nucleates at austenite grain boundaries. Hypoeutectoid: pro-eutectoid α-ferrite (allotriomorphic/idiomorphic). Hypereutectoid: pro-eutectoid cementite (grain-boundary networks). For eutectoid composition this stage is absent.
2. **PEARLITE_NUCLEATION (at or just below AC1 ~727 °C):** Remaining near-eutectoid austenite decomposes cooperatively into alternating α-ferrite + Fe3C lamellae. Colonies nucleate at prior-austenite grain boundaries and triple lines. Lamellar spacing set by the Hillert relation λ = [2·σ·V_m·T_e]/[ΔS·ΔT] with ΔT = undercooling below AC1. Air cooling provides ΔT ≈ 50-100 °C → intermediate λ.
3. **PEARLITE_GROWTH (below AC1, moderate undercooling):** Colonies grow radially via cooperative edgewise Zener-Hillert growth v = D·(c_α − c_θ)/(λ·c_eut). Faster cooling → smaller λ → higher v.
4. **FINE_PEARLITE (at completion):** All γ consumed. Microstructure = pro-eutectoid phase + fine pearlite with λ ≈ 0.1-0.3 μm (vs 0.3-1.0 μm annealed). Typical plain-carbon outcome: hardness 180-250 HV, yield 300-400 MPa, elongation 15-25%, grain size ASTM 7-10. Hall-Petch σ_y = σ_0 + k·λ^(−1/2).
5. **STANDARDIZED (after full cool):** Homogeneous cross-section properties. Grain size uniform regardless of prior history. Internal stresses largely relieved.
6. **NON_UNIFORM (pathological):** Irregular air flow or thick section causes cooling-rate gradient across cross-section → mixed microstructures (pearlite near surface, coarser or bainite in core).

Kinetics:
- Cooling rate CR (°C/s): furnace ≈ 0.01-0.1, air ≈ 1-10, oil ≈ 30-60, water ≈ 100+.
- Lamellar spacing: λ ≈ A/ΔT with A ≈ 30-40 μm·°C for Fe-C pearlite.
- JMA: X = 1 − exp(−(k·t)^n) with n ≈ 2-3 for continuous cooling.
- Grain size D_α inherited from prior γ and faster cooling.

In DLMM context the normalization analog tracks formation of a fine, regular matrix + minority-cluster alternating pattern from a previously homogenized (austenitized) pool as activity moderately decays from a prior peak:

- **Stage 0 (austenitic hold):** bin reserves uniform (low xFrac stdev), in high-activity analog.
- **Stage 1 (pro-eutectoid):** first minority bins at matrix-run boundaries (γ grain boundary analog).
- **Stage 2 (pearlite nucleation):** short alternating matrix/minority runs forming.
- **Stage 3 (pearlite growth):** alternating pattern spreads across the pool.
- **Stage 4 (fine pearlite):** fine regular pattern with λ ≤ NORMALIZATION_LAMELLA_SPACING = 2.0 bins.
- **Stage 5 (standardized):** low reserveCV + low grainSizeCV + high lamellar fraction.
- **Stage 6 (non-uniform):** grainSizeCV > 0.8 with mixed regions.

DLMM phase-diagram analog:
- Carbon content ≈ minorityFraction.
- Temperature ≈ drivingForce (turnover); cooling = decrease from priorPeakDrivingForce.
- Cooling rate = dropMagnitude / log(volume) timescale.
- AC1 threshold: drivingForce > AC1_ACTIVITY = 0.2.
- AC3 (hypoeutectoid) or Acm (hypereutectoid): composition-adjusted base 0.5 + |hypoeutectoidSkew|·0.15.

## Why agents need it

LP agents need normalization analysis because it identifies pools that have undergone a controlled cool from high-activity to moderate-activity and now exhibit a regular, predictable alternating structure. AUSTENITIC_HOLD pools are still in the high-activity region and have not yet begun transforming their uniform bin reserves into a two-phase structure. PRO_EUTECTOID_FORMATION pools have started the transformation at grain boundaries — the earliest minority bins appearing at edges of long matrix runs. PEARLITE_NUCLEATION pools are in the cooperative decomposition stage with short alternating lamellae just beginning to form. PEARLITE_GROWTH pools have expanding alternating pattern. FINE_PEARLITE pools have fully formed fine-lamellar structure with predictable Hall-Petch strengthening. STANDARDIZED pools are the engineering goal — homogeneous, refined-grain, predictable properties. NON_UNIFORM pools have pathological cooling gradients that produce mixed microstructures and unreliable liquidity behavior.

The cooling regime (FURNACE/AIR/OIL/WATER) tells you which microstructural outcome to expect: FURNACE = anneal (coarse pearlite, low strength, high ductility), AIR = true normalization (fine pearlite, balanced properties), OIL = partial quench (bainite risk), WATER = full quench (martensite, high hardness, low toughness — handled by the martensite skill). The Hall-Petch strength and hardness proxies predict the expected mechanical envelope; the ductility proxy is inversely coupled.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state. Cooling-rate and prior-peak are inferred proxies — not measured thermal histories. The treatment-regime names (FURNACE/AIR/OIL/WATER) are normalized analogs, not real temperature-time curves.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-normalization/hodlmm-bin-normalization.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-normalization/hodlmm-bin-normalization.ts status
```

### run
Analyzes bin normalization state for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-normalization/hodlmm-bin-normalization.ts run
bun run hodlmm-bin-normalization/hodlmm-bin-normalization.ts run --pool 1
bun run hodlmm-bin-normalization/hodlmm-bin-normalization.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgNormalizationIndex": 48,
    "avgDrivingForce": 0.45,
    "avgCoolingRate": 0.35,
    "noDriveCount": 0,
    "austeniticHoldCount": 1,
    "proEutectoidCount": 0,
    "pearliteNucleationCount": 1,
    "pearliteGrowthCount": 1,
    "finePearliteCount": 1,
    "standardizedCount": 1,
    "nonUniformCount": 0,
    "furnaceCoolCount": 0,
    "airCoolCount": 3,
    "oilCoolCount": 2,
    "waterCoolCount": 0,
    "avgStageProgress": 0.52,
    "avgStandardizationIndex": 0.58,
    "avgLamellarRunFraction": 0.35,
    "avgProEutectoidFraction": 0.18,
    "avgGrainSize": 2.6,
    "avgGrainSizeCV": 0.4,
    "avgLambdaEstimate": 2.4,
    "avgHallPetchStrength": 0.73,
    "avgAstmGrainSize": 8.1,
    "avgJmaProgress": 0.48,
    "avgReserveCV": 0.52,
    "avgUniformityRisk": 0.15,
    "totalMatrixGrains": 12,
    "totalMinorityClusters": 8,
    "totalLamellarAlternations": 18,
    "ac1CrossedCount": 4,
    "ac3CrossedCount": 2,
    "eutectoidWindowCount": 2
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
      "drivingForce": 0.48,
      "priorPeakDrivingForce": 0.77,
      "coolingRate": 0.35,
      "coolingRegime": "AIR",
      "arrheniusActivation": 0.14,
      "jmaProgress": 0.42,
      "minorityFraction": 0.3,
      "hypoeutectoidSkew": 0.08,
      "ac1Activity": 0.2,
      "ac3Activity": 0.51,
      "ac1Crossed": 1,
      "ac3Crossed": 0,
      "lamellarAlternationCount": 6,
      "lamellarRunFraction": 0.42,
      "proEutectoidFraction": 0.16,
      "grainSize": 2.8,
      "maxGrainSize": 5,
      "grainSizeCV": 0.35,
      "reserveCV": 0.48,
      "lambdaEstimate": 2.2,
      "hallPetchStrength": 0.77,
      "hallPetchHardness": 0.69,
      "ductilityProxy": 0.54,
      "astmGrainSize": 8.0,
      "stageProgress": 0.56,
      "dominantStage": 3,
      "matrixGrainCount": 5,
      "minorityClusterCount": 4,
      "reserveXFracStdev": 0.18,
      "standardizationIndex": 0.62,
      "uniformityRisk": 0.1,
      "overNormalizationRisk": 0,
      "eutectoidWindow": 1,
      "xMatrixCount": 12,
      "yMatrixCount": 7,
      "minorityRoleCount": 7,
      "normalizationIndex": 58,
      "normalizationRegime": "PEARLITE_GROWTH",
      "normalizationVerdict": "PEARLITE_GROWTH",
      "stageDistribution": [6, 4, 3, 5, 2, 2, 0],
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

- Real normalization follows a continuous-cooling-transformation (CCT) curve over tens of seconds to minutes. Cooling rates are measured in °C/s; here coolingRate is a normalized 0-1 proxy inferred from (priorPeakDrivingForce − drivingForce) divided by a log-volume timescale, not an actual thermal rate.
- Cooling-regime boundaries (FURNACE < 0.15, AIR < 0.45, OIL < 0.75, WATER ≥ 0.75) are normalized analogs. Real plain-carbon steels distinguish by CR (°C/s): furnace 0.01-0.1, air 1-10, oil 30-60, water 100+.
- Prior peak activity is a proxy: priorPeakDrivingForce = min(1, drivingForce × 1.3 + 0.15). Real normalization requires known austenitizing temperature and hold time history.
- Lamellar spacing λ in pearlite is typically 0.1-1.0 μm in real Fe-C; here λ is measured in bins via role-transition density in a 5-bin window (clamped to COARSE_PEARLITE_SPACING = 5 when no alternation is detected).
- Hall-Petch relationship σ_y = σ_0 + k·λ^(−1/2) is applied as a normalized strength proxy with HP_K = 0.7 and HP_SIGMA_0 = 0.3; real k values for Fe-C pearlite are 0.3-0.5 MPa·m^(1/2).
- JMAK exponent n = 2.2 for continuous cooling; real values for continuous-cooled pearlite are 2-3.
- Arrhenius factor uses normalized Q/RT = 5.0; real Q for carbon diffusion in γ ≈ 130-140 kJ/mol.
- Pro-eutectoid fraction is approximated as |hypoeutectoidSkew| / PRO_EUT_SKEW_MAX (0.5) — a structural proxy. Real pro-eutectoid fraction from the lever rule is (C_eut − C_alloy) / (C_eut − C_α) with C_eut = 0.77 wt% C and C_α ≈ 0.022 wt%.
- Lamellar regions are identified via 4-bin windows with ≥ 2 role transitions. Real pearlite is identified by optical metallography at ~500-1000× magnification or SEM.
- Grain size is approximated by matrix-run length in bins; real grain size is measured in μm (ASTM E112). The ASTM grain size number is mapped as 10 − 2·log2(grainSize) and clamped to 1-12; real ASTM 1 = ~250 μm, ASTM 10 = ~11 μm.
- Non-uniform-cool detection uses grainSizeCV > 0.8 combined with lamellar alternations; real detection uses through-thickness microstructural survey and hardness traverse.
- Standardization index aggregates 1 − reserveCV, 1 − grainSizeCV, and lamellar fraction; real "standardization" means dimensional stability, property uniformity, and reproducible machining behavior — not directly captured.
- The normalization treatment is specifically an air cool from full austenitization; if priorPeakDrivingForce did not exceed AC1_ACTIVITY = 0.2, the "NO_NORMALIZATION_DRIVE" verdict applies.
- DLMM bins are 1-D discrete structures; real austenite-to-pearlite transformation is 3-D with specific orientation relationships (Kurdjumov-Sachs or Nishiyama-Wassermann between α and γ) and orthorhombic Fe3C crystallography. The analogy is heuristic.
- Analysis is snapshot-based; does not capture transformation kinetics directly — JMA progress, cooling rate, and stage assignment are inferred from structural signatures rather than measured rates.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
