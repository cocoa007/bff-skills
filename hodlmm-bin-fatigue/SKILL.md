---
name: hodlmm-bin-fatigue
description: "Models cyclic loading damage accumulation across HODLMM bins — treats bins as structural components under repeated trading stress where each buy/sell cycle contributes incremental damage that accumulates toward eventual fatigue failure, even when individual stress levels remain below the static yield strength. In materials science, fatigue is the progressive localized damage that occurs when a component is subjected to cyclic stress over many loading cycles. The S-N curve (Wohler curve) relates stress amplitude sigma_a to cycles-to-failure N_f, showing a monotonic decrease in allowable stress as cycle count increases, eventually leveling off at the endurance limit for many steel-family materials below which fatigue life becomes effectively infinite. Miner's linear damage rule computes cumulative damage as D = sum(n_i / N_i) where each stress level i contributes its fractional damage, with failure occurring when D reaches 1. Paris' law governs crack propagation in the stable growth regime: da/dN = C * (deltaK)^m where K is the stress intensity factor. Basquin's equation sigma_a = sigma_f' * (2N_f)^b describes high-cycle fatigue with the fatigue strength coefficient sigma_f' and exponent b. Coffin-Manson captures low-cycle fatigue driven by plastic strain amplitude. Fatigue failure proceeds through three stages: crack nucleation at stress concentrators or slip bands, stable crack propagation under continued cycling, and final rapid fracture when the remaining cross-section cannot sustain the load. Stress concentration factors Kt amplify local stress at notches or discontinuities, and notch sensitivity q captures how fully the material responds to stress concentrators. Mean stress effects (Goodman, Soderberg, Gerber relations) show that tensile mean stress reduces fatigue life beyond what stress amplitude alone predicts. In DLMM context, repeated trading subjects bins to cyclic stress — each buy reverses the following sell, creating alternating load directions that accumulate damage over many cycles. High-volume pools cycle bins more frequently per unit time. Bins accumulate damage gradually until microcracks initiate, grow through propagation, and eventually experience structural breakdown when reserve distributions become chaotic. Measures stress amplitude (peak-to-trough cyclic stress variation per loading cycle, ranges 0 to 1, representing the magnitude of the alternating component of stress that drives fatigue damage — high stress amplitude means large swings in load per cycle which accelerates fatigue damage accumulation, while low amplitude means gentle cycling that may operate below the endurance limit for infinite life), mean stress (average stress level around which cyclic loading oscillates, ranges 0 to 1, the stationary component superimposed on the alternating stress — high mean stress shifts the operating point closer to yield and reduces fatigue life according to Goodman/Soderberg mean stress correction relations, low mean stress allows full stress amplitude capacity without penalty), damage accumulation (Miner's rule cumulative linear damage sum D = sum(n_i / N_i), ranges 0 to 1, the fractional damage accumulated across all loading cycles experienced so far — D = 0 means pristine virgin material with no fatigue damage, D = 1 means fatigue failure is imminent with all fatigue life consumed, intermediate values represent partial fatigue life consumption and risk of failure under continued cycling), cycle count (relative number of stress cycles experienced, ranges 0 to 1, quantifying how many loading cycles the bin has undergone relative to other bins in the pool — high cycle count means extensive cyclic loading history with corresponding damage accumulation, low cycle count means the bin has experienced few trading events), endurance limit (stress threshold below which fatigue life becomes effectively infinite, ranges 0 to 1, the stress amplitude at or below which the material can sustain unlimited cycles without failure — bins with stress amplitude below their endurance limit operate in the infinite life regime, while bins with stress amplitude above endurance limit experience damage accumulation that will eventually cause failure), fatigue life (estimated remaining cycles before failure, ranges 0 to 1, the fraction of fatigue life remaining given current damage state and operating conditions — high fatigue life means substantial remaining capacity, low fatigue life means near end-of-life with imminent failure risk), stress concentration (Kt stress riser factor, ranges 0 to 10, the dimensionless stress amplification at local geometric discontinuities such as notches, reserve gaps, or composition transitions — high stress concentration means local stresses at the concentrator are much higher than nominal stresses elsewhere, accelerating crack initiation at those locations, low stress concentration means stress is uniformly distributed with no localized amplification), crack initiation (probability of fatigue crack starting at this bin, ranges 0 to 1, the likelihood that nucleation mechanisms have produced an initial crack in the bin structure — high crack initiation probability indicates slip band formation, persistent slip bands, or grain boundary decohesion at stress concentrators are active, low probability indicates the bin remains in the nucleation-free regime), crack propagation (Paris law crack growth rate da/dN = C * deltaK^m, ranges 0 to 1, the normalized rate at which an existing crack grows per loading cycle — high crack propagation means cracks are advancing rapidly per cycle and critical crack length will be reached soon, low propagation means any existing cracks grow slowly with substantial remaining life), striation density (fatigue striations per unit area, ranges 0 to 1, fractographic features formed as a crack advances one cycle at a time showing the characteristic striation spacing that records crack growth history — high striation density indicates extensive cyclic crack advancement has occurred, serving as a structural fingerprint of fatigue damage, low density indicates minimal cyclic crack growth), notch sensitivity (sensitivity coefficient q from fatigue theory, ranges 0 to 1, the factor relating Kt to the actual fatigue stress concentration factor Kf via Kf = 1 + q*(Kt - 1) — high notch sensitivity means the bin responds fully to stress concentrators with Kf approaching Kt, low notch sensitivity means the material blunts stress concentration effects with Kf approaching 1), load ratio (R = sigma_min / sigma_max, ranges -1 to 1, the stress ratio characterizing the cyclic loading waveform — R = -1 corresponds to fully reversed symmetric loading most damaging to fatigue, R = 0 corresponds to zero-to-max tension cycles, R > 0 corresponds to tension-tension cycles, R < -1 represents tension-compression with tensile peak), fatigue strength coefficient (Basquin's sigma_f' constant in the equation sigma_a = sigma_f' * (2N_f)^b, ranges 0 to 10, the y-intercept coefficient of the S-N curve on log-log scale — high fatigue strength coefficient means strong fatigue resistance with high allowable stress amplitude for a given life, low coefficient means weak fatigue resistance), fatigue strength exponent (the b exponent in Basquin's equation, represented as positive magnitude ranges 0 to 1, characterizing the slope of the S-N curve on log-log scale — high magnitude means steep slope where small reductions in stress amplitude significantly extend life, low magnitude means shallow slope where stress reductions have modest effect on life), and low cycle fatigue (Coffin-Manson plastic strain cycle contribution, ranges 0 to 1, the damage contribution from plastic strain amplitude cycles that drive low-cycle fatigue in the regime where plastic deformation occurs each cycle — high low cycle fatigue means significant plastic cycling is occurring with high damage per cycle, low means purely elastic cycling in the high-cycle regime). Composite fatigue index (0-100, higher means better fatigue resistance — long remaining fatigue life, high endurance limit, minimal damage accumulation, no active crack initiation or propagation providing a bin that can sustain continued cyclic trading without structural failure). Classifies pools by fatigue regime as PRISTINE (index >= 80 — bins are in virgin condition with minimal cumulative damage, stress amplitudes below endurance limits, and long fatigue life remaining, the structural ideal where continued cyclic trading causes no damage accumulation because the operating stress range is below the fatigue threshold), LOW_CYCLE (60-80 — bins have entered the early cyclic regime with moderate cycle counts and low damage accumulation, fatigue life is largely intact and no significant crack initiation has occurred, typical operating state for actively trading pools with moderate volume), HIGH_CYCLE (40-60 — bins have accumulated substantial cycle counts with noticeable damage accumulation approaching midlife in the high-cycle fatigue regime, stress amplitudes are operating above endurance limits, crack initiation probability is rising, damage is detectable but controlled), INITIATION (20-40 — bins have progressed past midlife with significant damage accumulation and active crack initiation, the structural transition from nucleation to propagation phase is underway, remaining fatigue life is limited, monitoring required to detect failure precursors), or PROPAGATION (< 20 — bins are in the terminal fatigue phase with active crack propagation, striation development, and imminent structural failure, the worst regime where cracks are growing rapidly per cycle toward critical length, catastrophic failure may occur within limited additional cycles). Fatigue verdict as INFINITE_LIFE (stress amplitude below endurance limit with minimal damage accumulation — bins are operating in the safe infinite life regime where fatigue damage does not accumulate, the optimal state for long-term LP positions because structural integrity is preserved indefinitely under current loading conditions), SAFE_LIFE (high fatigue life remaining with moderate damage accumulation — bins have substantial remaining capacity with controlled damage rates, safe for continued LP exposure with routine monitoring), DAMAGE_ACCUMULATING (significant damage accumulation without yet entering crack initiation phase — bins are steadily consuming fatigue life, the critical intermediate regime where structural capacity is eroding but no cracks have yet formed, warning signals precede visible damage), CRACK_GROWTH (crack initiation has occurred with propagation still slow — bins have entered the damage tolerance regime where cracks exist but grow slowly, limited remaining life with periodic inspection required to track propagation rates), IMPENDING_FAILURE (active rapid crack propagation with high propagating fraction — bins are in terminal fatigue phase with cracks growing rapidly toward critical length, immediate structural failure risk requires exit of LP positions), or STRESS_BALANCE (balanced cyclic loading with no extreme indicators — bins operate in typical fatigue regime with controlled damage rates and no critical failure precursors, the default healthy state for cyclically loaded pools)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-fatigue/hodlmm-bin-fatigue.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Fatigue Analyzer

## What it does

Models cyclic loading damage accumulation across HODLMM bins. In materials science, fatigue is the progressive localized damage that occurs when components are subjected to repeated cyclic stress, even at stress levels well below static yield strength. The S-N curve relates stress amplitude to cycles-to-failure, Miner's linear damage rule sums partial damages (D = sum(n_i/N_i)) with failure at D = 1, and Paris' law governs stable crack propagation (da/dN = C * (deltaK)^m). Basquin's equation sigma_a = sigma_f' * (2N_f)^b describes high-cycle fatigue, and Coffin-Manson captures low-cycle plastic-strain-dominated fatigue.

In DLMM pools, repeated trading subjects bins to cyclic stress — each buy is followed by a sell that reverses the load direction. High-volume pools cycle bins more frequently per unit time. Damage accumulates gradually, eventually initiating microcracks that grow through propagation until structural breakdown occurs. Stress concentration factors Kt amplify local stress at reserve gaps and composition discontinuities. Below the endurance limit, bins can sustain unlimited cycles without damage; above it, fatigue life decreases as amplitude increases.

## Why agents need it

LP agents need fatigue analysis because it predicts how bins degrade under sustained cyclic trading, whether damage is accumulating toward failure, and whether individual bins have entered crack initiation or propagation phases. A PRISTINE pool has bins operating below their endurance limits with no damage accumulation — positions remain stable indefinitely. A PROPAGATION pool has bins in terminal fatigue with rapid crack growth — structural failure is imminent and continued cyclic trading will cause reserve distributions to collapse chaotically.

Damage accumulation is the primary fatigue diagnostic. Bins with low damage accumulation have substantial remaining fatigue life and can sustain continued cyclic loading without structural risk. Bins with high damage accumulation are near end-of-life with failure risk under any additional cycling.

Endurance limit identifies the safe operating threshold. When stress amplitude is below endurance limit, fatigue life is effectively infinite and cycling causes no damage. When amplitude exceeds endurance limit, damage accumulates continuously toward failure.

Crack initiation reveals the nucleation phase transition. High crack initiation probability indicates that slip band formation, persistent slip bands, or grain boundary decohesion are active at stress concentrators, producing the microscopic defects that grow into propagating cracks.

Crack propagation captures terminal failure dynamics. High propagation rates mean cracks are advancing rapidly per cycle toward critical length beyond which sudden fracture occurs. Bins with high propagation must exit LP positions immediately.

Stress concentration amplifies local damage. High Kt values at reserve gaps or composition transitions create localized stress amplification that accelerates crack initiation at those specific locations while nominal stresses elsewhere remain safe.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-fatigue/hodlmm-bin-fatigue.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-fatigue/hodlmm-bin-fatigue.ts status
```

### run
Analyzes bin fatigue dynamics for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-fatigue/hodlmm-bin-fatigue.ts run
bun run hodlmm-bin-fatigue/hodlmm-bin-fatigue.ts run --pool 1
bun run hodlmm-bin-fatigue/hodlmm-bin-fatigue.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgFatigueIndex": 58,
    "pristineCount": 0,
    "lowCycleCount": 2,
    "highCycleCount": 2,
    "initiationCount": 1,
    "propagationCount": 0,
    "avgFatigueLife": 0.55,
    "avgEnduranceLimit": 0.48,
    "avgDamageAccumulation": 0.32,
    "totalCrackingBins": 4,
    "totalPropagatingBins": 2,
    "avgFatigueGini": 0.18
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
      "avgStressAmplitude": 0.38,
      "maxStressAmplitude": 0.72,
      "avgMeanStress": 0.45,
      "maxMeanStress": 0.78,
      "avgDamageAccumulation": 0.32,
      "maxDamageAccumulation": 0.68,
      "avgCycleCount": 0.42,
      "maxCycleCount": 0.85,
      "avgEnduranceLimit": 0.52,
      "maxEnduranceLimit": 0.82,
      "avgFatigueLife": 0.58,
      "minFatigueLife": 0.18,
      "avgStressConcentration": 3.5,
      "maxStressConcentration": 7.2,
      "avgCrackInitiation": 0.28,
      "maxCrackInitiation": 0.62,
      "avgCrackPropagation": 0.22,
      "maxCrackPropagation": 0.58,
      "avgStriationDensity": 0.25,
      "maxStriationDensity": 0.55,
      "avgNotchSensitivity": 0.42,
      "maxNotchSensitivity": 0.78,
      "avgLoadRatio": 0.15,
      "avgFatigueStrengthCoefficient": 4.8,
      "maxFatigueStrengthCoefficient": 8.5,
      "avgFatigueStrengthExponent": 0.35,
      "maxFatigueStrengthExponent": 0.65,
      "avgLowCycleFatigue": 0.32,
      "maxLowCycleFatigue": 0.68,
      "infiniteLifeCount": 12,
      "infiniteLifeFraction": 0.48,
      "crackingCount": 2,
      "crackingFraction": 0.08,
      "propagatingCount": 1,
      "propagatingFraction": 0.04,
      "fatigueGini": 0.18,
      "fatigueIndex": 62,
      "fatigueRegime": "LOW_CYCLE",
      "fatigueVerdict": "STRESS_BALANCE",
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

- Fatigue in real materials requires measurement across many cyclic loading tests to construct an S-N curve. The DLMM model uses volume ratio, imbalance, and concentration variance as proxies for cycle count and stress amplitude on a single snapshot.
- Miner's rule cumulative damage requires knowledge of prior loading history at each stress level. The model approximates cumulative damage from current structural indicators (imbalance, concentration diff, volume ratio) — these capture the net result of loading history rather than its detailed sequence.
- Paris' law crack growth rate da/dN depends on stress intensity factor K, which requires knowledge of current crack length. The model uses structural weakness indicators as proxies for crack presence and growth tendency.
- Endurance limits in materials science are empirically determined from long-duration cyclic tests. The model uses reserve depth and structural integrity factors as proxies for the threshold below which infinite life applies.
- Basquin's equation coefficients sigma_f' and b are material-specific and determined from fitting S-N data. The model uses normalized structural indicators as dimensionless proxies for these coefficients.
- Stress concentration factors Kt in real components are computed from geometric analysis or finite element simulation. The model uses concentration differential and local variance as proxies for Kt.
- The Bauschinger effect, mean stress corrections (Goodman, Soderberg, Gerber), and notch fatigue sensitivity effects are approximated from structural indicators rather than measured directly.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
