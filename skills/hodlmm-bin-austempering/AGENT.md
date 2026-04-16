---
name: hodlmm-bin-austempering-agent
skill: hodlmm-bin-austempering
description: "Agent behavior for HODLMM bin austempering analysis — interprets stageProgress (composite 0-1), dominantStage (0-7), drivingForce (≈TQ analog 0-1), priorPeakDrivingForce (austenitizing T analog), tqActivity (same as drivingForce), transitSpeed (0-1 normalized drop rate), pearliteAvoided (0/1), msAvoided (0/1), bsCrossed (0/1), bainiteWindow (0/1 = Ms < TQ < BS), isothermalHoldProxy (0-1), arrheniusActivation, jmaProgress, t0Plateau (incomplete-reaction f_max), sheafCount, subUnitCount, avgSubUnitLen, maxSubUnitLen, avgSheafSpan, maxSheafSpan, sheafDensity (fraction of populated bins in sheaves), acicularityIndex (0-1 sub-unit aspect ratio), upperBainiteFraction, lowerBainiteFraction, carbidePartitionCount, carbideFraction, retainedAusteniteFraction (undecided-role bins), matrixGrainCount, minorityClusterCount, reserveCV, reserveXFracStdev, bainiteTypeDominant (UPPER/LOWER/MIXED/NONE), hardnessProxy, toughnessProxy, distortionProxy, overAustemperingRisk, incompleteReactionRisk to identify pools in NO_AUSTEMPERING_DRIVE, AUSTENITIC_HOLD, TRANSIT_TO_ISOTHERMAL, PEARLITE_SHUNT, MARTENSITIC_SHUNT, ISOTHERMAL_HOLD, BAINITE_NUCLEATION, UPPER_BAINITE_GROWTH, LOWER_BAINITE_GROWTH, FULLY_AUSTEMPERED, OVER_AUSTEMPERED, or INCOMPLETE_REACTION regime and guide LP strategies — austenitic-hold pools are still pre-quench with uniform γ-analog reserves; transit pools are still crossing through the TTT region; pearlite-shunt pools failed to avoid the pearlite nose (handoff to normalization); martensitic-shunt pools dropped below Ms (handoff to martensite); isothermal-hold pools have reached TQ but not yet started bainite transformation; bainite-nucleation pools have early sheaf seeds visible; upper-bainite-growth pools have expanding coarser sheaves with inter-plate cementite gaps; lower-bainite-growth pools have finer sub-units with intra-plate carbide dips; fully-austempered pools are the engineering goal with tough-and-ductile balance; over-austempered pools have coarsened past peak properties; incomplete-reaction pools stalled at the T0 plateau with significant retained γ."
---

# Agent Behavior — HODLMM Bin Austempering

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `austemperingRegime`, `austemperingVerdict`, `dominantStage`, `stageProgress`, `bainiteTypeDominant`, `sheafDensity`, `bainiteWindow`, `pearliteAvoided`, `msAvoided`, `overAustemperingRisk`, and `incompleteReactionRisk`.

## Interpreting output

- **austemperingRegime = NO_AUSTEMPERING_DRIVE:** priorPeakDrivingForce < AC3_ACTIVITY_BASE × 0.6. No prior austenitization can be inferred. Austempering analysis not applicable.
- **austemperingRegime = AUSTENITIC_HOLD:** drivingForce > BS_ACTIVITY (0.45). Pool is still in the γ region (pre-quench analog). No bainite transformation yet.
- **austemperingRegime = TRANSIT_TO_ISOTHERMAL:** transitSpeed > PEARLITE_AVOIDANCE_RATE (0.25) but isothermal hold not yet stable. Pool is still dropping through the TTT window.
- **austemperingRegime = PEARLITE_SHUNT:** pearliteAvoided = 0 AND bsCrossed = 1. Cooling was too slow to clear the pearlite nose — pearlite formed instead. Use the normalization skill for complement.
- **austemperingRegime = MARTENSITIC_SHUNT:** msAvoided = 0. drivingForce dropped below Ms_ACTIVITY (0.12) — martensite formed instead. Use the martensite skill for complement.
- **austemperingRegime = ISOTHERMAL_HOLD:** bainiteWindow = 1 but sheafCount = 0. TQ reached; transformation not yet started.
- **austemperingRegime = BAINITE_NUCLEATION:** bainiteWindow = 1 and sheafCount > 0 but stageProgress < STAGE_4_BOUND. Early sheaf seeds visible.
- **austemperingRegime = UPPER_BAINITE_GROWTH:** bainiteWindow = 1, sheafDensity > 0.3, stageProgress ≥ STAGE_4_BOUND, tqActivity ≥ UPPER_BAINITE_MIN (0.28). Coarser sheaves with inter-plate cementite.
- **austemperingRegime = LOWER_BAINITE_GROWTH:** bainiteWindow = 1, sheafDensity > 0.3, stageProgress ≥ STAGE_4_BOUND, tqActivity < UPPER_BAINITE_MIN. Finer sub-units with intra-plate carbides.
- **austemperingRegime = FULLY_AUSTEMPERED:** bainiteWindow = 1 and stageProgress ≥ STAGE_6_BOUND. Engineering goal: transformation complete.
- **austemperingRegime = OVER_AUSTEMPERED:** overAustemperingRisk > 0.7. Carbide coarsening; property degradation.
- **austemperingRegime = INCOMPLETE_REACTION:** incompleteReactionRisk > 0.6 with some sheaves. Stalled at T0 plateau with high retained γ.
- **austemperingVerdict = NO_AUSTEMPERING_DRIVE:** no prior peak, cannot infer any quench.
- **austemperingVerdict = PEARLITE_SHUNT:** handoff to normalization skill.
- **austemperingVerdict = MARTENSITIC_SHUNT:** handoff to martensite skill.
- **austemperingVerdict = OVER_AUSTEMPERED:** property loss via coarsening.
- **austemperingVerdict = INCOMPLETE_REACTION:** T0 stall.
- **austemperingVerdict = FULLY_AUSTEMPERED:** engineering goal reached.
- **austemperingVerdict = UPPER_BAINITE_GROWTH:** coarser sheaf expansion.
- **austemperingVerdict = LOWER_BAINITE_GROWTH:** finer sub-unit expansion.
- **austemperingVerdict = BAINITE_NUCLEATION:** earliest sheaf seeds.
- **austemperingVerdict = ISOTHERMAL_HOLD:** TQ reached, incubation pending.
- **austemperingVerdict = TRANSIT_TO_ISOTHERMAL:** still dropping.
- **austemperingVerdict = AUSTENITIC_HOLD:** pre-quench.
- **austemperingVerdict = INTERMEDIATE_AUSTEMPERING:** mixed indicators.
- **bainiteTypeDominant = UPPER:** coarser bainite, hardness lower, toughness moderate, more distortion risk.
- **bainiteTypeDominant = LOWER:** finer bainite, hardness higher, toughness highest, minimum distortion.
- **bainiteTypeDominant = MIXED:** balanced upper/lower fractions; tqActivity near UPPER_BAINITE_MIN.
- **bainiteTypeDominant = NONE:** no sheaves or not in bainiteWindow.
- **dominantStage = 0:** austenitic hold — pre-quench.
- **dominantStage = 1:** rapid quench — crossing TTT.
- **dominantStage = 2:** isothermal equilibration — TQ reached.
- **dominantStage = 3:** bainite nucleation.
- **dominantStage = 4:** sheaf growth.
- **dominantStage = 5:** carbide partition (upper between plates / lower within plates).
- **dominantStage = 6:** fully austempered — end state.
- **dominantStage = 7:** over-austempered — pathological coarsening.
- **pearliteAvoided = 1:** quench was fast enough to clear the pearlite nose.
- **msAvoided = 1:** TQ stayed above Ms — no martensite formed.
- **bsCrossed = 1:** TQ dropped below BS — entered bainite window from above.
- **bainiteWindow = 1:** Ms_ACTIVITY ≤ TQ < BS_ACTIVITY — the actionable isothermal band.
- **isothermalHoldProxy > 0.6:** stable hold near mid-window.
- **sheafDensity > 0.4:** majority of populated bins are inside sheaves.
- **acicularityIndex > 0.6:** sub-units are short and numerous (finer, more acicular).
- **upperBainiteFraction > lowerBainiteFraction × 1.3:** upper bainite dominates.
- **lowerBainiteFraction > upperBainiteFraction × 1.3:** lower bainite dominates.
- **carbideFraction > 0.1:** noticeable carbide partition detected.
- **retainedAusteniteFraction > 0.3:** significant residual γ (undecided-role bins).
- **overAustemperingRisk > 0.7:** coarsening past peak properties.
- **incompleteReactionRisk > 0.6:** stalled transformation at T0 plateau.
- **hardnessProxy > 0.7:** high-hardness-analog (lower-bainite regime).
- **toughnessProxy > 0.7:** high-toughness-analog (bainite balanced properties).
- **distortionProxy < 0.3:** low distortion (austempered desirable state).

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on austempering signals from pools with fewer than 5 populated bins — insufficient data for sheaf or stage inference.
- Do not treat AUSTENITIC_HOLD as bad; it is the expected starting state for any subsequent austempering cycle and is structurally homogeneous (predictable uniform-exposure LP strategies apply).
- Do not treat FULLY_AUSTEMPERED as universally desirable for all strategies; the original microstructural memory is erased and phase-dependent strategies lose their substrate.
- Do not conflate PEARLITE_SHUNT with normalization; PEARLITE_SHUNT means the austempering attempt failed (quench too slow) and pearlite formed, while normalization is the intentional air-cool process.
- Do not conflate MARTENSITIC_SHUNT with quenching; MARTENSITIC_SHUNT means the austempering attempt failed (TQ below Ms) and martensite formed, while quenching is the intentional fast cool.
- Do not assume transitSpeed reflects real thermal history; it is inferred from priorPeakDrivingForce − current drivingForce divided by a log-volume timescale.
- Do not assume isothermalHoldProxy measures real time at TQ; it is a snapshot heuristic based on tqBandPosition (distance from mid-window) and bainiteWindow flag.
- Do not assume sheafCount/subUnitCount map to real 3-D sheaves; they are detected as 1-D clusters of ≥ 2 minority runs (each ≤ SUB_UNIT_MAX_LEN=2) within a span ≤ SHEAF_MAX_SPAN=8 consecutive bin positions.
- Do not assume UPPER vs LOWER bainite boundary matches real ~350 °C split; it is a normalized threshold UPPER_BAINITE_MIN = 0.28 on the drivingForce axis.
- Do not assume hardnessProxy, toughnessProxy, or distortionProxy predict real HRC, Charpy, or dimensional outcomes; they are normalized composites.
- Do not assume retainedAusteniteFraction measures real γ; it is a proxy based on undecided-role (balanced xFrac) bins.
- Do not assume t0Plateau matches real T0 incomplete-reaction plateau; it is a composition-scaled proxy with baseline 0.65.
- Do not assume carbidePartitionCount reflects real cementite or ε-carbide; it is inferred from matrix-reserve dips inside sheaf spans (upper-bainite analog) and minority-reserve dips within sub-units at TQ < UPPER_BAINITE_MIN (lower-bainite analog).
- Do not assume acicularityIndex measures real sub-unit aspect ratio; it is sub-units-per-sheaf / avg-sub-unit-length, clipped to 0-1.
- Do not assume bainiteWindow boundaries (Ms_ACTIVITY=0.12, BS_ACTIVITY=0.45, UPPER_BAINITE_MIN=0.28) map to real temperatures; they are normalized analogs on the drivingForce axis.
- PEARLITE_AVOIDANCE_RATE = 0.25, ISOTHERMAL_STABILITY_THRESHOLD = 0.6, SUB_UNIT_MAX_LEN = 2, SHEAF_MAX_SPAN = 8, MIN_SUB_UNITS_PER_SHEAF = 2, SHEAF_WINDOW = 8, JMA_N_EXPONENT = 1.7, ARRHENIUS_Q_OVER_RT = 6.0, T0_INCOMPLETE_BASELINE = 0.65, CEMENTITE_RESERVE_DIP = 0.35, CARBIDE_GAP_MAX_LEN = 2, SUB_UNIT_MERGE_LEN = 4 are normalized proxy values; in real systems these depend on alloy composition, quench temperature, and hold time.
- Analysis is snapshot-based; does not capture transformation kinetics directly — JMA progress, transit speed, isothermal hold, and stage assignment are inferred from structural signatures rather than measured rates.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "Austempering analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest austemperingIndex as the one with the most-advanced staged austempering (best balance of stage progress, structural sheaf density, property profile, and process avoidances).
- Flag pools in NO_AUSTEMPERING_DRIVE regime as no-prior-austenitization — austempering analysis inapplicable.
- Flag pools in AUSTENITIC_HOLD regime as pre-quench — uniform reserves, no transformation yet.
- Flag pools in TRANSIT_TO_ISOTHERMAL regime as still-dropping — monitor for landing in bainite window.
- Flag pools in PEARLITE_SHUNT regime as austempering-failed-pearlite — use normalization skill for complement.
- Flag pools in MARTENSITIC_SHUNT regime as austempering-failed-martensite — use martensite skill for complement.
- Flag pools in ISOTHERMAL_HOLD regime as incubation-pending — transformation has not yet begun.
- Flag pools in BAINITE_NUCLEATION regime as earliest-sheaf — early cluster formation.
- Flag pools in UPPER_BAINITE_GROWTH regime as coarser-expanding — higher TQ, lower hardness, inter-plate cementite.
- Flag pools in LOWER_BAINITE_GROWTH regime as finer-expanding — lower TQ, higher hardness, intra-plate carbide.
- Flag pools in FULLY_AUSTEMPERED regime as engineering-grade — tough, ductile, low distortion.
- Flag pools in OVER_AUSTEMPERED regime as coarsened — property degradation.
- Flag pools in INCOMPLETE_REACTION regime as T0-stalled — residual γ prevents completion.
- Flag pools with pearliteAvoided = 0 as missed-nose — pearlite analog formed.
- Flag pools with msAvoided = 0 as below-Ms — martensite analog formed.
- Flag pools with bainiteWindow = 0 as out-of-window — not actionable for bainite LP strategies.
- Flag pools with sheafDensity > 0.4 as majority-sheaf — most of pool is in bainite clusters.
- Flag pools with acicularityIndex > 0.6 as high-acicular — fine, thin sub-units.
- Flag pools with bainiteTypeDominant = UPPER as coarse-sheaf-dominated.
- Flag pools with bainiteTypeDominant = LOWER as fine-sub-unit-dominated.
- Flag pools with bainiteTypeDominant = MIXED as upper/lower-transition (tqActivity near UPPER_BAINITE_MIN).
- Flag pools with carbideFraction > 0.1 as carbide-partitioned — detectable cementite or intra-plate carbide.
- Flag pools with retainedAusteniteFraction > 0.3 as γ-rich — significant residual austenite.
- Flag pools with overAustemperingRisk > 0.7 as over-held — carbide coarsening.
- Flag pools with incompleteReactionRisk > 0.6 as T0-stalled.
- Flag pools with hardnessProxy > 0.7 as high-hardness-analog — lower-bainite dominance.
- Flag pools with toughnessProxy > 0.7 as high-toughness-analog — balanced bainite properties.
- Flag pools with distortionProxy < 0.3 as low-distortion — austempered advantage.
- Report the inferred regime and verdict.
- Show bins with stageBin = 1 as the transit-candidate positions.
- Show bins with stageBin = 2 as the isothermal-equilibration-candidate positions.
- Show bins with stageBin = 3 as the bainite-nucleation-candidate positions.
- Show bins with stageBin = 4 as the sheaf-growth-member positions.
- Show bins with stageBin = 5 as the carbide-partition-candidate positions.
- Show bins with stageBin = 6 as the fully-austempered-member positions.
- Show bins with stageBin = 7 as the over-austempered-candidate positions.
- Show bins with highest sheafSignal as the best in-sheaf positions.
- Show bins with highest subUnitSignal as the best minority-sub-unit positions.
- Show bins with highest acicularitySignal as the finest sub-unit positions.
- Show bins with highest upperBainiteSignal as the best upper-bainite positions.
- Show bins with highest lowerBainiteSignal as the best lower-bainite positions.
- Show bins with highest carbidePartitionSignal as the best carbide-gap or intra-plate-dip positions.
- Show bins with cementiteGap = 1 as the upper-bainite inter-plate cementite-analog gaps.
- Show bins with highest retainedAusteniteSignal as the residual-γ-analog positions.
- Show bins with sheafId > 0 as members of specific identified sheaves.
- Show bins with highest austemperingDegree as the overall most-austempered positions.
- For LP agents: in AUSTENITIC_HOLD pools, use uniform-exposure strategies (pre-quench γ analog); in TRANSIT_TO_ISOTHERMAL pools, wait for landing; in PEARLITE_SHUNT or MARTENSITIC_SHUNT pools, switch to the relevant complementary skill (normalization or martensite); in ISOTHERMAL_HOLD pools, expect incubation with no cluster yet; in BAINITE_NUCLEATION / UPPER_BAINITE_GROWTH / LOWER_BAINITE_GROWTH pools, expect sheaf-clustered exposure (not regular-lamellar pearlite); in FULLY_AUSTEMPERED pools, use stable-sheaf strategies with high toughness and low distortion; in OVER_AUSTEMPERED pools, reduce allocation; in INCOMPLETE_REACTION pools, expect hybrid γ + bainite exposure.
- For trading agents: FULLY_AUSTEMPERED pools have sheaf-clustered liquidity with gap risk at cementite-analog bins; upper-bainite pools have coarser spacing between clusters; lower-bainite pools have finer, more-distributed clusters; PEARLITE_SHUNT and MARTENSITIC_SHUNT pools should be analyzed with the normalization or martensite skill respectively.
- Compare austempering indices and stage progress across pools to find bins and pools with the strongest austempering signature for the intended LP or trading strategy.
