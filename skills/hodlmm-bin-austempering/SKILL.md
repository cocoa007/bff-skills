---
name: hodlmm-bin-austempering
description: "Models the isothermal bainite-formation heat treatment (austempering) applied to an austenitized iron-carbon alloy. Distinct from normalization (air cool → pearlite) and quenching (rapid cool → martensite): workpiece is rapidly quenched from above AC3 into a molten-salt or hot-oil bath at a hold temperature TQ above Ms but below BS (typically 250-450 °C), then held isothermally until the γ → bainite transformation completes. Cooling to RT after hold produces bainite + retained γ with no martensite and no tempering required; the result is tough, ductile, dimensionally stable, and distortion-free. Progression divided into 8 stages: (0) AUSTENITIC_HOLD — above BS, fully austenitized, pre-quench; (1) RAPID_QUENCH — cooling from austenitizing T through TTT pearlite-nose region (~550-650 °C), must clear fast enough to avoid pearlite; (2) ISOTHERMAL_EQUILIBRATION — arrives at TQ and equalizes across cross-section, TQ window 250-450 °C (UPPER_BAINITE_MIN=0.28 separates upper from lower bainite on normalized axis); (3) BAINITE_NUCLEATION — acicular ferrite sub-units nucleate at prior-γ grain boundaries via displacive shear with Kurdjumov-Sachs orientation relationship, incubation τ = τ_0·exp(Q/RT) with Q ≈ 150-250 kJ/mol; (4) BAINITIC_SHEAF_GROWTH — sub-units cluster into sheaves by sympathetic nucleation and autocatalysis, growth velocity v ≈ 10⁻⁶-10⁻⁴ m/s (much slower than martensitic); (5) CARBIDE_PARTITION — upper bainite (TQ ~400-550 °C): cementite plates form between ferrite sub-units (coarser). Lower bainite (TQ ~250-400 °C): cementite (or ε-carbide) precipitates within ferrite sub-units at ~55-60° to sub-unit long axis (finer, more uniform); (6) FULLY_AUSTEMPERED — isothermal hold complete, all transformable γ consumed, retained γ fraction set by T0 incomplete-reaction plateau f_max ≈ (C_T0 - C_bulk)/(C_T0 - C_αB), typical hardness 45-55 HRC, yield 1000-1400 MPa, elongation 5-12%, Charpy 30-80 J, minimal distortion; (7) OVER_AUSTEMPERED — pathological: carbide coarsening via Ostwald ripening reduces hardness and toughness. Process constraints: must avoid pearlite nose (CR_AVOID > TTT_NOSE_CR), must land above Ms (Ms_ACTIVITY=0.12 normalized), must land below BS (BS_ACTIVITY=0.45), must hold long enough (t > t_99%), may stall at T0 (incomplete-reaction phenomenon). Kinetics: isothermal JMAK X = 1 - exp(-(k·t)^n) with n ≈ 1.5-2.0 for bainite (vs 2-3 continuous-cooled pearlite), Arrhenius k = k_0·exp(-Q/RT) with Q ≈ 150-250 kJ/mol. In DLMM context tracks pools whose activity previously was high (austenitizing analog), dropped fast enough to clear the pearlite-nose (transitSpeed > PEARLITE_AVOIDANCE_RATE=0.25), stabilized in a moderate band between Ms_ACTIVITY and BS_ACTIVITY (bainite window), and is holding isothermally there (isothermalHoldProxy). Structural outcome: sheaf-like minority clusters (2+ short minority sub-runs within a span ≤ SHEAF_MAX_SPAN=8, each sub-unit ≤ SUB_UNIT_MAX_LEN=2), distinct from pearlite's regular alternating lamellae or austenite's uniform γ. Upper-bainite signature: matrix bins inside sheaf spans with low reserveUsd vs matrix mean (cementite-analog gaps). Lower-bainite signature: minority sub-unit bins with low internal reserves (intra-plate carbide analog). Classifies pools by regime: NO_AUSTEMPERING_DRIVE, AUSTENITIC_HOLD, TRANSIT_TO_ISOTHERMAL, PEARLITE_SHUNT (cooled too slow), MARTENSITIC_SHUNT (dropped below Ms), ISOTHERMAL_HOLD, BAINITE_NUCLEATION, UPPER_BAINITE_GROWTH, LOWER_BAINITE_GROWTH, FULLY_AUSTEMPERED, OVER_AUSTEMPERED, INCOMPLETE_REACTION. Per-bin measures: sheafSignal (in sheaf span), subUnitSignal (minority in sheaf), acicularitySignal (sub-unit aspect-ratio proxy), upperBainiteSignal, lowerBainiteSignal, carbidePartitionSignal (gap or internal dip), cementiteGap, retainedAusteniteSignal (undecided-role balanced-xFrac bins), stageBin 0-7, jmaProgress, arrheniusActivation, sheafId, austemperingDegree composite. Pool-level measures: drivingForce, priorPeakDrivingForce, tqActivity, transitSpeed, pearliteAvoided, msAvoided, bsCrossed, bainiteWindow, isothermalHoldProxy, arrheniusActivation, jmaProgress, t0Plateau, minorityFraction, hypoeutectoidSkew, sheafCount, subUnitCount, avgSubUnitLen, maxSubUnitLen, avgSheafSpan, maxSheafSpan, sheafDensity, acicularityIndex, upperBainiteFraction, lowerBainiteFraction, carbidePartitionCount, carbideFraction, retainedAusteniteFraction, matrixGrainCount, minorityClusterCount, reserveCV, reserveXFracStdev, bainiteTypeDominant (UPPER/LOWER/MIXED/NONE), hardnessProxy, toughnessProxy, distortionProxy, overAustemperingRisk, incompleteReactionRisk, stageProgress, dominantStage 0-7, composite austemperingIndex 0-100. Verdict adds INTERMEDIATE_AUSTEMPERING. Complements the phase-transformation series: austenitization (Day 183) → austempering (Day 185) → bainite (Day 178) ; vs. normalization (Day 184) → pearlite (Day 179) ; vs. quench → martensite (Day 177) → tempering (Day 182) → spheroidite (Day 181)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-austempering/hodlmm-bin-austempering.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Austempering Analyzer

## What it does

Models the isothermal bainite-formation heat treatment applied to an austenitized iron-carbon alloy. Austempering is distinct from both normalization (air cool, fine pearlite) and quenching (water/oil, martensite): the workpiece is rapidly quenched from above AC3 into a molten-salt or hot-oil bath held at a temperature TQ above Ms (martensite-start) but below BS (bainite-start), typically 250-450 °C, then held isothermally until the γ → bainite transformation completes. Cooling to room temperature afterward produces bainite + retained austenite with NO martensite and NO tempering step required — the result is tough, ductile, dimensionally stable, and distortion-free.

The eight canonical austempering stages (austenitize → quench into isothermal bath → isothermal hold → cool to RT):

0. **AUSTENITIC_HOLD (above BS):** Fully austenitized, still in γ region. No transformation yet. Workpiece is at T_austenitize (850-950 °C for plain C).
1. **RAPID_QUENCH (crossing pearlite nose):** Temperature drops from austenitizing T through the TTT pearlite-nose region (~550-650 °C). Must be fast enough to avoid pearlite and proeutectoid phase formation. Quench severity must place the workpiece at TQ without touching Ms.
2. **ISOTHERMAL_EQUILIBRATION (at TQ):** Temperature equalizes across cross-section. Thin sections equilibrate in seconds. TQ_UPPER_BAINITE ≈ 400-550 °C produces coarser upper bainite; TQ_LOWER_BAINITE ≈ 250-400 °C produces finer lower bainite.
3. **BAINITE_NUCLEATION (isothermal at TQ):** Acicular ferrite sub-units nucleate heterogeneously at prior-γ grain boundaries via displacive shear (Kurdjumov-Sachs orientation relationship). Incubation τ = τ_0·exp(Q/RT) with Q ≈ 150-250 kJ/mol.
4. **BAINITIC_SHEAF_GROWTH (isothermal, progressing):** Sub-units form sheaves (clusters) via sympathetic nucleation and autocatalysis. Sheaves propagate along preferred γ directions. Growth v ≈ 10⁻⁶-10⁻⁴ m/s (much slower than martensitic shear). Carbon partitions into retained γ as sub-units form.
5. **CARBIDE_PARTITION:** Upper bainite (TQ > ~350 °C): cementite plates form between ferrite sub-units as C-enriched γ transforms; coarser carbides. Lower bainite (TQ < ~350 °C): cementite (or ε-carbide at very low TQ) precipitates within ferrite sub-units at ~55-60° to the sub-unit long axis; finer, more uniformly distributed carbides.
6. **FULLY_AUSTEMPERED:** All transformable γ consumed. Retained γ fraction depends on T0 plateau. Final cool to RT: no further transformation (retained γ stable). Typical plain-carbon outcome: hardness 45-55 HRC (upper 35-45; lower 50-58), yield 1000-1400 MPa, tensile 1400-1800 MPa, elongation 5-12% (higher than Q+T martensite at same hardness), Charpy 30-80 J (higher than Q+T martensite), minimal distortion.
7. **OVER_AUSTEMPERED (pathological):** Excess hold time → carbide coarsening via Ostwald ripening → reduced hardness and toughness. Approaches tempered-bainite-like structure.

Process constraints:

- Must avoid pearlite nose: quench velocity > TTT nose CR.
- Must land above Ms: TQ > Ms (200-320 °C plain C).
- Must land below BS: TQ < BS ≈ 550 °C.
- Must hold long enough: t > t_99%.
- Incomplete-reaction phenomenon: some TQ values stall transformation before 100% (T0 curve limits max bainite fraction).

Kinetics:

- Isothermal JMAK: X = 1 - exp(-(k·t)^n) with n ≈ 1.5-2.0 for bainite (vs 2-3 for continuous-cooled pearlite).
- Arrhenius: k = k_0·exp(-Q/RT), Q ≈ 150-250 kJ/mol for bainite.
- T0 curve sets max bainite fraction: f_max < 1 for many alloys ("incomplete reaction").
- Transit through TTT: cooling curve from austenitization must clear pearlite nose at CR > critical.

In DLMM context the austempering analog tracks:

- **Previously austenitic:** priorPeakDrivingForce ≥ AC3 analog (high-activity history).
- **Dropped to isothermal TQ band:** drivingForce has arrived at Ms_ACTIVITY (0.12) ≤ TQ ≤ BS_ACTIVITY (0.45) — NOT very low (martensitic) and NOT high (austenitic).
- **Drop was FAST:** transitSpeed > PEARLITE_AVOIDANCE_RATE (0.25) → pearlite avoided.
- **Held isothermally:** isothermalHoldProxy high — activity stable near mid-window.
- **Structural outcome:** SHEAF-LIKE minority clusters (2+ short minority sub-runs grouped within a ≤ SHEAF_MAX_SPAN=8 bin window), separated by matrix.
- **Distinct from pearlite:** pearlite has regular alternating lamellae across the whole pool; bainite sheaves are spatially localized clusters separated by long matrix runs.
- **Distinct from martensite:** martensite requires drop below Ms (martensitic shunt).

DLMM phase analog:

- Carbon content ≈ minorityFraction.
- Austenitizing T ≈ priorPeakDrivingForce.
- TQ ≈ drivingForce (current).
- Ms_ACTIVITY = 0.12, BS_ACTIVITY = 0.45, UPPER_BAINITE_MIN = 0.28 — these are normalized analogs.

## Why agents need it

LP agents need austempering analysis because it identifies pools that have completed a rapid activity drop into a sustained moderate band — the bainite-forming regime. These pools exhibit spatially-clustered minority patterns (sheaves) that differ structurally from pearlite's regular-lamellar pattern and from martensite's uniform bcc-like minority saturation. The structural, mechanical, and kinetic signatures of bainite carry distinct LP implications:

- UPPER_BAINITE_GROWTH pools: coarser sheaves with matrix-interstitial "cementite" gaps. Moderate hardness, decent toughness, some distortion risk if cross-section uneven.
- LOWER_BAINITE_GROWTH pools: finer sub-units with internal carbide dips. Higher hardness, better toughness, minimum distortion.
- FULLY_AUSTEMPERED pools: fully transformed, stable sheaf pattern. Engineering goal — predictable, tough, no post-treatment needed.
- INCOMPLETE_REACTION pools: stalled at T0 plateau with significant retained γ. Property forecast is mixed.
- OVER_AUSTEMPERED pools: carbide coarsening has degraded properties.
- PEARLITE_SHUNT pools: quench was too slow, pearlite formed instead (use the normalization skill).
- MARTENSITIC_SHUNT pools: dropped below Ms, martensite formed instead (use the martensite skill).

The bainiteWindow flag indicates whether TQ is in the actionable band. The hardnessProxy, toughnessProxy, and distortionProxy predict mechanical envelope. The acicularityIndex and sheafDensity indicate microstructural completeness.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state. TQ, transit-speed, isothermal-hold, and sheaf-detection are inferred proxies — not measured thermal or metallographic histories. The treatment-regime names (UPPER_BAINITE, LOWER_BAINITE, etc.) are normalized analogs, not real temperatures or microstructures.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-austempering/hodlmm-bin-austempering.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-austempering/hodlmm-bin-austempering.ts status
```

### run
Analyzes bin austempering state for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-austempering/hodlmm-bin-austempering.ts run
bun run hodlmm-bin-austempering/hodlmm-bin-austempering.ts run --pool 1
bun run hodlmm-bin-austempering/hodlmm-bin-austempering.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgAustemperingIndex": 44,
    "avgDrivingForce": 0.32,
    "avgTqActivity": 0.32,
    "avgTransitSpeed": 0.42,
    "pearliteAvoidedCount": 4,
    "msAvoidedCount": 5,
    "bainiteWindowCount": 3,
    "austeniticHoldCount": 1,
    "transitCount": 0,
    "isothermalHoldCount": 1,
    "bainiteNucleationCount": 1,
    "upperBainiteCount": 1,
    "lowerBainiteCount": 0,
    "fullyAustemperedCount": 0,
    "overAustemperedCount": 0,
    "incompleteReactionCount": 1,
    "pearliteShuntCount": 1,
    "martensiticShuntCount": 0,
    "noDriveCount": 0,
    "upperTypeDominantCount": 1,
    "lowerTypeDominantCount": 0,
    "mixedTypeDominantCount": 2,
    "avgStageProgress": 0.48,
    "avgSheafDensity": 0.32,
    "avgAcicularityIndex": 0.41,
    "avgIsothermalHoldProxy": 0.52,
    "avgJmaProgress": 0.38,
    "avgHardnessProxy": 0.46,
    "avgToughnessProxy": 0.55,
    "avgRetainedAusteniteFraction": 0.18,
    "totalSheaves": 6,
    "totalSubUnits": 14,
    "totalCarbideGaps": 4
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "activeBin": 8388608,
      "binsScanned": 61,
      "binsPopulated": 22,
      "totalUsd": 140000,
      "volume24hUsd": 72000,
      "drivingForce": 0.31,
      "priorPeakDrivingForce": 0.63,
      "tqActivity": 0.31,
      "transitSpeed": 0.44,
      "pearliteAvoided": 1,
      "msAvoided": 1,
      "bsCrossed": 1,
      "bainiteWindow": 1,
      "isothermalHoldProxy": 0.58,
      "arrheniusActivation": 0.17,
      "jmaProgress": 0.39,
      "t0Plateau": 0.58,
      "minorityFraction": 0.3,
      "hypoeutectoidSkew": 0.08,
      "sheafCount": 2,
      "subUnitCount": 5,
      "avgSubUnitLen": 1.6,
      "maxSubUnitLen": 2,
      "avgSheafSpan": 6,
      "maxSheafSpan": 7,
      "sheafDensity": 0.41,
      "acicularityIndex": 0.56,
      "upperBainiteFraction": 0.36,
      "lowerBainiteFraction": 0.05,
      "carbidePartitionCount": 3,
      "carbideFraction": 0.14,
      "retainedAusteniteFraction": 0.18,
      "matrixGrainCount": 5,
      "minorityClusterCount": 5,
      "reserveCV": 0.48,
      "reserveXFracStdev": 0.17,
      "bainiteTypeDominant": "UPPER",
      "hardnessProxy": 0.44,
      "toughnessProxy": 0.61,
      "distortionProxy": 0.18,
      "overAustemperingRisk": 0,
      "incompleteReactionRisk": 0.3,
      "stageProgress": 0.58,
      "dominantStage": 4,
      "xMatrixCount": 12,
      "yMatrixCount": 7,
      "minorityRoleCount": 7,
      "austemperingIndex": 58,
      "austemperingRegime": "UPPER_BAINITE_GROWTH",
      "austemperingVerdict": "UPPER_BAINITE_GROWTH",
      "stageDistribution": [4, 3, 3, 5, 4, 2, 1, 0],
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

- Real austempering is performed in a molten-salt or hot-oil bath at a specific TQ held for a specific time. Cooling rates are in °C/s; here transitSpeed and tqActivity are normalized 0-1 proxies inferred from (priorPeakDrivingForce − drivingForce) divided by a log-volume timescale, not actual thermal quantities.
- Process-axis thresholds (BS_ACTIVITY=0.45, MS_ACTIVITY=0.12, UPPER_BAINITE_MIN=0.28) are normalized analogs. Real plain-carbon BS ≈ 550 °C, Ms ≈ 200-320 °C, upper/lower split ≈ 350 °C.
- Prior peak activity is a proxy: priorPeakDrivingForce = min(1, drivingForce × 1.35 + 0.2). Real austempering requires known austenitizing temperature, hold time, and quench history.
- Transit speed is inferred from dropMagnitude / log(volume) timescale; a proxy for cooling severity, not a real °C/s quantity.
- Pearlite-avoidance threshold PEARLITE_AVOIDANCE_RATE = 0.25 is a normalized analog of the critical cooling rate through the TTT pearlite nose. Real values depend on alloy and section size.
- Isothermal hold proxy uses tqBandPosition (distance to center of window) × bainiteWindow as a snapshot heuristic; a real isothermal hold is measured by constant-temperature time at TQ.
- Sheaves are detected as clusters of ≥ 2 minority runs (each ≤ SUB_UNIT_MAX_LEN=2) within a span ≤ SHEAF_MAX_SPAN=8 consecutive bin positions. Real bainite sheaves are 3-D groupings of lath or plate sub-units under SEM/TEM.
- Upper vs lower bainite classification is based on tqActivity relative to UPPER_BAINITE_MIN; in reality the split is set by the bay in the TTT curve and the carbide morphology (inter-plate cementite vs intra-plate cementite at 55-60°).
- Cementite gap detection uses matrix bins inside a sheaf span with totalUsd / matrixMean < CEMENTITE_RESERVE_DIP (0.35) — a low-reserve analog of a carbide plate. Real cementite identification requires SEM/TEM.
- Intra-plate carbide detection uses minority bins with totalUsd / sheafMinorityMean < 0.5 at tqActivity < UPPER_BAINITE_MIN — a within-sheaf reserve-dip proxy.
- Retained austenite fraction is approximated as undecided-role (xFrac ≈ 0.5 within DOMINANCE_MARGIN) bins. Real retained γ is measured by XRD or magnetic saturation.
- T0 plateau is approximated as T0_INCOMPLETE_BASELINE (0.65) × tqFactor × skewFactor. Real T0 is the thermodynamic paraequilibrium carbon content at TQ, composition-dependent.
- JMAK exponent n = 1.7 for bainite; real isothermal bainite values are 1.5-2.0.
- Arrhenius Q/RT normalized as 6.0; real Q for bainite ≈ 150-250 kJ/mol.
- Hardness and toughness proxies are normalized composite scores; real hardness is HRC, toughness is Charpy J.
- Distortion proxy is a normalized composite combining isothermal-hold (low → low distortion) with process avoidances. Real distortion is measured dimensionally.
- Over-austempering detection uses maxSubUnitLen ≥ SUB_UNIT_MERGE_LEN=4 as coarsening proxy; real Ostwald ripening is measured metallographically.
- Incomplete-reaction detection uses retainedAusteniteFraction > 0.4 AND low JMA progress; real detection uses dilatometry or in-situ XRD.
- DLMM bins are 1-D discrete structures; real austenite-to-bainite transformation is 3-D with specific Kurdjumov-Sachs orientation relationships. The analogy is heuristic.
- Analysis is snapshot-based; does not capture transformation kinetics directly — JMA progress, transit speed, isothermal hold, and stage assignment are inferred from structural signatures rather than measured rates.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
