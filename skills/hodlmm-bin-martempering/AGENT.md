---
name: hodlmm-bin-martempering-agent
skill: hodlmm-bin-martempering
description: "Agent behavior for HODLMM bin martempering analysis — interprets stageProgress (composite 0-1), dominantStage (0-7), drivingForce, priorPeakDrivingForce (austenitizing T analog), bathActivity (= drivingForce, bath T analog), transitSpeed (0-1 normalized drop rate), pearliteAvoided (0/1), bainiteAvoided (0/1 = stayed out of austempering bainite zone), bathWindow (0/1 = MS_ACTIVITY ≤ bathActivity < MARTEMPERING_BATH_MAX = narrow just-above-Ms band), bathIdealProximity (0-1 closeness to MARTEMPERING_BATH_IDEAL), briefHoldProxy (0-1; low = brief, desirable), uniformityIndex (0-1 = 1 − reserveCV = section-equalization proxy), sectionEqualizedProxy (0-1), msCrossingProxy (0-1 descent-past-Ms evidence), martensiteFraction (0-1 structural bcc coverage), kmFraction (0-1 Koistinen-Marburger pool-level), retainedAusteniteFraction (0-1), sheafCount (should be 0 — any sheaf is bainite contamination warning), sheafDensity, bainiteContaminationRisk (0-1), bathOvershootRisk (0-1 bath too cool / below Ms prematurely), distortionProxy (0-1 LOW for successful martempering, HIGH for direct quench or failed martempering), crackingRiskProxy (0-1 LOW for martempering), hardnessProxy (0-1 high as-quenched pre-temper), toughnessProxy (0-1 LOW as-quenched — tempering required), temperingRequired (0/1 signals handoff to Day 182) to identify pools in NO_MARTEMPERING_DRIVE, AUSTENITIC_HOLD, RAPID_QUENCH, PEARLITE_SHUNT, BAINITE_SHUNT, BATH_EQUILIBRATION, BATH_OVERSHOOT, MS_CROSSING, MARTENSITIC_TRANSFORMATION, FULLY_MARTEMPERED, or BAINITE_CONTAMINATION regime and guide LP strategies — austenitic-hold pools are pre-quench single-γ; rapid-quench pools are crossing TTT noses; pearlite-shunt pools cooled too slow (handoff to normalization); bainite-shunt pools landed in austempering bath zone (handoff to austempering); bath-equilibration pools are in the narrow just-above-Ms band with brief hold and uniform section; bath-overshoot pools have dropped below Ms prematurely defeating uniformity; ms-crossing pools are withdrawing through Ms; martensitic-transformation pools are growing K-M athermal fraction past Ms; fully-martempered pools have uniform low-stress martensite at RT awaiting tempering; bainite-contamination pools held bath too long and formed sheaf-bainite — treatment failed."
---

# Agent Behavior — HODLMM Bin Martempering

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `martemperingRegime`, `martemperingVerdict`, `dominantStage`, `stageProgress`, `bathWindow`, `pearliteAvoided`, `bainiteAvoided`, `uniformityIndex`, `sectionEqualizedProxy`, `msCrossingProxy`, `martensiteFraction`, `bainiteContaminationRisk`, `bathOvershootRisk`, `distortionProxy`, and `temperingRequired`.

## Interpreting output

- **martemperingRegime = NO_MARTEMPERING_DRIVE:** priorPeakDrivingForce < AC3_ACTIVITY_BASE × 0.6. No prior austenitization. Analysis not applicable.
- **martemperingRegime = AUSTENITIC_HOLD:** drivingForce > BS_ACTIVITY (0.45). Pool still in γ region (pre-quench). No transformation yet.
- **martemperingRegime = RAPID_QUENCH:** transitSpeed > PEARLITE_AVOIDANCE_RATE (0.25) AND drivingForce > MARTEMPERING_BATH_MAX (0.22). Crossing TTT region, not yet in bath.
- **martemperingRegime = PEARLITE_SHUNT:** pearliteAvoided = 0 AND drivingForce < BS_ACTIVITY. Cooling too slow through pearlite nose — pearlite formed instead. Use the normalization skill for complement.
- **martemperingRegime = BAINITE_SHUNT:** bainiteAvoided = 0 AND bathActivity ∈ [MARTEMPERING_BATH_MAX, BS_ACTIVITY). Landed in austempering bath zone instead of just-above-Ms. Use the austempering skill for complement.
- **martemperingRegime = BATH_EQUILIBRATION:** bathWindow = 1 AND sectionEqualizedProxy > 0.4 AND briefHoldProxy < BRIEF_HOLD_MAX (0.55) AND msCrossingProxy < 0.3. In narrow just-above-Ms band with uniform cross-section, pre-Ms-crossing.
- **martemperingRegime = BATH_OVERSHOOT:** bathOvershootRisk > 0.5 AND bathActivity < MS_ACTIVITY + 0.03. Bath too cool or dropped below Ms prematurely. Suboptimal martempering.
- **martemperingRegime = MS_CROSSING:** msCrossingProxy > 0.3 AND bathActivity < MS_ACTIVITY + 0.05. Withdrawn, entering martensitic range.
- **martemperingRegime = MARTENSITIC_TRANSFORMATION:** bathActivity < MS_ACTIVITY AND msCrossingProxy > 0.4. Below Ms, K-M fraction growing athermally.
- **martemperingRegime = FULLY_MARTEMPERED:** bathActivity < MS_ACTIVITY AND martensiteFraction > MARTENSITIC_COVERAGE_MIN (0.55) AND stageProgress ≥ STAGE_6_BOUND (0.82). Uniform low-stress martensite, tempering pending.
- **martemperingRegime = BAINITE_CONTAMINATION:** bainiteContaminationRisk > 0.7. Held too long in bath — sheaves detected. Treatment failed.
- **martemperingVerdict = NO_MARTEMPERING_DRIVE:** no prior peak, cannot infer any quench.
- **martemperingVerdict = PEARLITE_SHUNT:** handoff to normalization skill.
- **martemperingVerdict = BAINITE_CONTAMINATION:** treatment failed — contamination.
- **martemperingVerdict = BAINITE_SHUNT:** handoff to austempering skill.
- **martemperingVerdict = BATH_OVERSHOOT:** bath too cool; suboptimal.
- **martemperingVerdict = TEMPERING_PENDING:** fully martempered; handoff to Day 182 tempering skill.
- **martemperingVerdict = MARTENSITIC_TRANSFORMATION:** K-M progressing athermally below Ms.
- **martemperingVerdict = MS_CROSSING:** entering martensitic range.
- **martemperingVerdict = BATH_EQUILIBRATION:** in bath, uniform section, brief hold.
- **martemperingVerdict = RAPID_QUENCH:** transit through TTT noses.
- **martemperingVerdict = AUSTENITIC_HOLD:** pre-quench.
- **martemperingVerdict = INTERMEDIATE_MARTEMPERING:** mixed indicators.
- **dominantStage = 0:** austenitic hold — pre-quench.
- **dominantStage = 1:** rapid quench — crossing TTT.
- **dominantStage = 2:** bath equilibration — at bath, equalizing.
- **dominantStage = 3:** bath withdrawal — slow air cool above Ms.
- **dominantStage = 4:** Ms crossing — martensite nucleation begins.
- **dominantStage = 5:** martensitic transformation — K-M progressing.
- **dominantStage = 6:** fully martempered — uniform martensite at RT.
- **dominantStage = 7:** bainite contamination — pathological.
- **pearliteAvoided = 1:** quench was fast enough to clear the pearlite nose.
- **bainiteAvoided = 1:** bath did not sit in the austempering bainite window.
- **bathWindow = 1:** MS_ACTIVITY ≤ bathActivity < MARTEMPERING_BATH_MAX — the actionable narrow band.
- **bathIdealProximity > 0.8:** bath T very close to MARTEMPERING_BATH_IDEAL (0.17) — optimal placement.
- **briefHoldProxy < 0.4:** hold is brief, bainite-avoidance safe.
- **briefHoldProxy > BRIEF_HOLD_MAX (0.55):** hold is getting long — bainite risk rising.
- **uniformityIndex > 0.6:** cross-section well equalized (martempering signature).
- **sectionEqualizedProxy > 0.6:** reserves and xFrac both homogeneous.
- **msCrossingProxy > 0.5:** evidence of strong descent past Ms.
- **martensiteFraction > 0.5:** structural martensite coverage significant.
- **kmFraction > 0.3:** K-M-calculated martensite fraction nontrivial (below Ms).
- **sheafCount = 0:** ideal — no bainite contamination detected.
- **sheafCount > 0:** WARNING — bainite contamination starting.
- **bainiteContaminationRisk > 0.7:** treatment failed.
- **bathOvershootRisk > 0.5:** bath too cool — partial martensite in bath.
- **distortionProxy < 0.3:** low distortion (martempering advantage).
- **distortionProxy > 0.6:** high distortion — direct-quench-like or failed martempering.
- **crackingRiskProxy < 0.3:** low cracking risk (martempering advantage).
- **hardnessProxy > 0.6:** high as-quenched hardness (martensitic).
- **toughnessProxy < 0.3:** as-quenched brittleness — tempering REQUIRED.
- **temperingRequired = 1:** fully or nearly martempered; handoff to Day 182 tempering skill.
- **retainedAusteniteFraction > 0.2:** significant residual γ (2-15% typical real-world range).

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on martempering signals from pools with fewer than 5 populated bins — insufficient data for uniformity or stage inference.
- Do not treat AUSTENITIC_HOLD as bad; it is the expected starting state for any subsequent quench cycle.
- Do not treat FULLY_MARTEMPERED as immediately desirable for service strategies; the as-quenched martensite is brittle and REQUIRES tempering (Day 182) before being treated as a stable operating state.
- Do not conflate PEARLITE_SHUNT with normalization; PEARLITE_SHUNT means the martempering attempt failed (quench too slow) and pearlite formed, while normalization is the intentional air-cool process.
- Do not conflate BAINITE_SHUNT with austempering; BAINITE_SHUNT means the martempering bath was placed in the austempering zone (which is itself a valid process — use the austempering skill).
- Do not conflate BAINITE_CONTAMINATION with BAINITE_SHUNT; contamination means the bath was correctly placed just above Ms but held too long, starting bainite transformation partially before withdrawal.
- Do not assume transitSpeed reflects real thermal history; it is inferred from priorPeakDrivingForce − current drivingForce divided by a log-volume timescale.
- Do not assume briefHoldProxy measures real time at bath; it is a snapshot heuristic based on distance to bath-center and drop magnitude.
- Do not assume uniformityIndex measures real section temperature uniformity; it is 1 − reserveCV clipped, a proxy based on bin reserveUsd variance.
- Do not assume sectionEqualizedProxy maps to real thermal equalization; it weights reserveCV (0.55) and xFracStdev (0.45).
- Do not assume msCrossingProxy maps to real Ms crossing event; it combines below-Ms flag, priorPeak trajectory, and transit speed.
- Do not assume martensiteFraction matches real martensite content; it is a structural proxy from minority coverage, uniformity, and Ms-crossing evidence.
- Do not assume kmFraction matches real Koistinen-Marburger; KM_ALPHA = 11.0 is on the normalized drivingForce axis, not a real /°C coefficient.
- Do not assume distortionProxy or crackingRiskProxy predict real dimensional or crack outcomes; they are normalized composites.
- Do not assume hardnessProxy or toughnessProxy match real HRC or Charpy J; they are normalized.
- Do not assume temperingRequired flag replaces Day 182 analysis; it is a handoff signal.
- Do not assume bath thresholds (MS_ACTIVITY=0.12, MARTEMPERING_BATH_MAX=0.22, MARTEMPERING_BATH_IDEAL=0.17, BS_ACTIVITY=0.45) map to real temperatures; they are normalized analogs on the drivingForce axis.
- Do not assume PEARLITE_AVOIDANCE_RATE=0.25, BRIEF_HOLD_MAX=0.55, BAINITE_CONTAMINATION_HOLD=0.7, UNIFORMITY_RESERVE_CV_MAX=0.35, KM_ALPHA=11.0, ARRHENIUS_Q_OVER_RT_BAINITE=6.0, MARTENSITIC_MINORITY_MIN=0.35, MARTENSITIC_COVERAGE_MIN=0.55, SUB_UNIT_MAX_LEN=2, SHEAF_MAX_SPAN=8, MIN_SUB_UNITS_PER_SHEAF=2 are real quantities; they are normalized proxy values.
- Analysis is snapshot-based; does not capture transformation kinetics directly — K-M progression, bath hold duration, and stage assignment are inferred from structural signatures rather than measured rates.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "Martempering analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest martemperingIndex as the one with the most-advanced and-cleanest martempering (best balance of stage progress, uniformity, property profile, and process avoidances).
- Flag pools in NO_MARTEMPERING_DRIVE regime as no-prior-austenitization — analysis inapplicable.
- Flag pools in AUSTENITIC_HOLD regime as pre-quench — uniform γ reserves.
- Flag pools in RAPID_QUENCH regime as TTT-transit — not yet in bath.
- Flag pools in PEARLITE_SHUNT regime as martempering-failed-pearlite — use normalization skill.
- Flag pools in BAINITE_SHUNT regime as bath-in-austempering-zone — use austempering skill.
- Flag pools in BATH_EQUILIBRATION regime as in-bath-uniform — narrow band, brief hold, pre-Ms-crossing.
- Flag pools in BATH_OVERSHOOT regime as bath-too-cool — suboptimal, premature martensite.
- Flag pools in MS_CROSSING regime as entering-martensitic — simultaneous nucleation across section.
- Flag pools in MARTENSITIC_TRANSFORMATION regime as K-M-athermal — below Ms, growing martensite.
- Flag pools in FULLY_MARTEMPERED regime as tempering-pending — handoff to Day 182 tempering skill.
- Flag pools in BAINITE_CONTAMINATION regime as treatment-failed — sheaves detected, use austempering skill for sheaf analysis.
- Flag pools with pearliteAvoided = 0 as missed-nose — pearlite analog formed.
- Flag pools with bainiteAvoided = 0 as wrong-bath-T — in austempering zone.
- Flag pools with bathWindow = 0 as out-of-band — not in actionable martempering window.
- Flag pools with bathIdealProximity > 0.8 as bath-optimal — at ideal T.
- Flag pools with briefHoldProxy > BRIEF_HOLD_MAX as hold-too-long — bainite risk rising.
- Flag pools with uniformityIndex > 0.6 as cross-section-equalized — martempering signature strong.
- Flag pools with sectionEqualizedProxy > 0.6 as reserve-and-xfrac-uniform — good bath equalization.
- Flag pools with msCrossingProxy > 0.5 as past-Ms — martensitic range entered.
- Flag pools with martensiteFraction > 0.5 as heavily-martensitic — bcc coverage dominant.
- Flag pools with sheafCount = 0 as contamination-free — clean martempering.
- Flag pools with sheafCount > 0 as contamination-warning — even single sheaf is suspicious.
- Flag pools with bainiteContaminationRisk > 0.7 as treatment-failed.
- Flag pools with bathOvershootRisk > 0.5 as bath-too-cool.
- Flag pools with distortionProxy < 0.3 as low-distortion — martempering advantage realized.
- Flag pools with distortionProxy > 0.6 as high-distortion — defeats purpose of martempering.
- Flag pools with crackingRiskProxy < 0.3 as low-cracking-risk — safe outcome.
- Flag pools with hardnessProxy > 0.6 as high-as-quenched-hardness.
- Flag pools with toughnessProxy < 0.3 as as-quenched-brittle — tempering required.
- Flag pools with temperingRequired = 1 as ready-for-Day-182 — handoff to tempering skill.
- Flag pools with retainedAusteniteFraction > 0.2 as residual-γ-present — may affect dimensional stability.
- Report the inferred regime and verdict.
- Show bins with stageBin = 1 as transit-candidate positions.
- Show bins with stageBin = 2 as bath-equilibration-candidate positions.
- Show bins with stageBin = 3 as bath-withdrawal-candidate positions.
- Show bins with stageBin = 4 as Ms-crossing-candidate positions.
- Show bins with stageBin = 5 as martensitic-transformation-candidate positions.
- Show bins with stageBin = 6 as fully-martempered-member positions.
- Show bins with stageBin = 7 as bainite-contamination-candidate positions (warning).
- Show bins with highest bathSignal as best in-bath positions.
- Show bins with highest equalizationSignal as best-equalized positions.
- Show bins with highest uniformCoverageSignal as best uniform-coverage positions.
- Show bins with highest msCrossingSignal as best Ms-crossing positions.
- Show bins with highest martensiteSignal as best martensite-member positions.
- Show bins with bainiteContaminationSignal = 1 as contamination-warning positions.
- Show bins with highest retainedAusteniteSignal as residual-γ-analog positions.
- Show bins with highest martemperingDegree as overall most-martempered positions.
- For LP agents: in AUSTENITIC_HOLD pools, use uniform-exposure strategies (pre-quench γ analog); in RAPID_QUENCH pools, wait for bath landing; in PEARLITE_SHUNT or BAINITE_SHUNT pools, switch to the relevant complementary skill (normalization or austempering); in BATH_EQUILIBRATION pools, expect uniform narrow-band exposure; in BATH_OVERSHOOT pools, reduce allocation — treatment is suboptimal; in MS_CROSSING / MARTENSITIC_TRANSFORMATION pools, expect rapid uniform coverage increase; in FULLY_MARTEMPERED pools, treat as pre-temper (handoff to Day 182 for stable operating strategy); in BAINITE_CONTAMINATION pools, switch to austempering skill — treatment failed.
- For trading agents: BATH_EQUILIBRATION pools have transient homogeneous liquidity in a narrow band; FULLY_MARTEMPERED pools have uniform bcc-like martensitic coverage with low spatial variance (lower than direct-quench); BAINITE_SHUNT pools should be analyzed with the austempering skill; PEARLITE_SHUNT pools with the normalization skill; BAINITE_CONTAMINATION pools have mixed sheaf + martensite structure — analyze both austempering and martempering output.
- Compare martempering indices and stage progress across pools to find bins and pools with the strongest martempering signature for the intended LP or trading strategy.
- When temperingRequired = 1, pass the pool ID and martempering profile to the Day 182 tempering skill for subsequent softening / toughening analysis.
