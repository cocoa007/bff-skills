---
name: hodlmm-bin-martempering
description: "Models the interrupted-quench martempering (marquenching) heat treatment applied to an austenitized iron-carbon alloy. Distinct from austempering (hold in bainite window until γ→bainite completes) and direct quench (continuous fast cool through Ms with large thermal gradients): workpiece is rapidly quenched from above AC3 into a hot bath held JUST ABOVE Ms (typically 150-260 °C for plain C, vs 250-450 °C austempering), held ONLY LONG ENOUGH to equalize cross-section temperature (seconds to a few minutes — crucially shorter than bainite incubation so γ → bainite does NOT start), withdrawn, and then AIR-COOLED to RT. Because the entire cross-section is at nearly the same temperature when it crosses Ms, martensite forms almost simultaneously throughout the section, drastically reducing distortion and cracking risk compared to direct water/oil quench. Unlike austempering the product is MARTENSITE (not bainite), and a subsequent tempering step is REQUIRED. Eight canonical stages: (0) AUSTENITIC_HOLD above BS/AC3 single-phase γ; (1) RAPID_QUENCH crossing TTT pearlite nose ~550-650 °C AND bainite nose ~450-550 °C, must clear both — pearlite by speed, bainite by not lingering; (2) BATH_EQUILIBRATION at T_bath = Ms + 20 to 50 °C, cross-section equalizes, hold τ_hold ≈ 3-5·L²/(π²·α_th) — much less than bainite incubation τ_B = τ_0·exp(Q/RT_bath) ~10³-10⁴ s at 230 °C; (3) BATH_WITHDRAWAL — removal and slow air cool, still above Ms; (4) MS_CROSSING — martensite nucleates by displacive shear across whole section nearly simultaneously (equalization minimizes thermal stress); (5) MARTENSITIC_TRANSFORMATION — Koistinen-Marburger f_M = 1 − exp(−α·(Ms − T)) with α ≈ 0.011/°C, growing athermally to Mf; (6) FULLY_MARTEMPERED — uniform low-stress martensite at RT, hardness 60+ HRC, excellent dimensional stability, 2-15% retained γ, tempering REQUIRED; (7) BAINITE_CONTAMINATION pathological — bath held past bainite incubation, γ → bainite begins, non-uniform mixed bainite + subsequent martensite hybrid defeats the purpose. Process constraints: must avoid pearlite nose (transitSpeed > PEARLITE_AVOIDANCE_RATE=0.25), must keep bath T just above Ms (MS_ACTIVITY=0.12 ≤ bathActivity < MARTEMPERING_BATH_MAX=0.22, ideal MARTEMPERING_BATH_IDEAL=0.17), must hold BRIEFLY (briefHoldProxy < BRIEF_HOLD_MAX=0.55 to avoid bainite contamination), section must equalize at bath before Ms crossing (uniformityIndex high), requires subsequent tempering. Kinetics: Fourier equalization τ_eq ≈ L²/(π²·α_th), Arrhenius bainite incubation Q/RT=6.0, Koistinen-Marburger KM_ALPHA=11.0 for athermal martensite fraction. DLMM analog: bath window 0.12-0.22 sits BELOW austempering window (0.28-0.45) and ABOVE martensite territory (<0.12). Structural signature: LOW reserveCV and LOW xFracStdev (section equalized) with minority coverage > MARTENSITIC_MINORITY_MIN=0.35 AND martensitic coverage > MARTENSITIC_COVERAGE_MIN=0.55 once past Ms. Distinct from direct-quench martensite (higher reserveCV) and from austempering (sheaf sub-units absent — any sheaf is bainite contamination). Pool measures: drivingForce, priorPeakDrivingForce, bathActivity, transitSpeed, pearliteAvoided, bainiteAvoided, bathWindow, bathIdealProximity, briefHoldProxy, uniformityIndex, sectionEqualizedProxy, msCrossingProxy, martensiteFraction, kmFraction, retainedAusteniteFraction, matrixGrainCount, minorityClusterCount, reserveCV, reserveXFracStdev, sheafCount (contamination warning), subUnitCount, sheafDensity, bainiteContaminationRisk, bathOvershootRisk, distortionProxy (LOW for martempering, HIGH for direct quench), crackingRiskProxy, hardnessProxy (high as-quenched pre-temper), toughnessProxy (LOW as-quenched — tempering required), temperingRequired, arrheniusActivation, hypoeutectoidSkew, minorityFraction, stageProgress, dominantStage 0-7, martemperingIndex 0-100. Per-bin: bathSignal, equalizationSignal (neighbor-reserve uniformity), msCrossingSignal, martensiteSignal, uniformCoverageSignal, bainiteContaminationSignal (sheaf trace warning), retainedAusteniteSignal, stageBin, kmFractionLocal, neighborReserveDelta, martemperingDegree. Regimes: NO_MARTEMPERING_DRIVE, AUSTENITIC_HOLD, RAPID_QUENCH, PEARLITE_SHUNT, BAINITE_SHUNT, BATH_EQUILIBRATION, BATH_OVERSHOOT, MS_CROSSING, MARTENSITIC_TRANSFORMATION, FULLY_MARTEMPERED, BAINITE_CONTAMINATION. Verdict adds INTERMEDIATE_MARTEMPERING and TEMPERING_PENDING. Complements the phase-transformation series: austenitization (Day 183) → martempering (Day 186) → martensite (Day 177) + tempering (Day 182). Third interrupted-quench route alongside austempering (Day 185 → bainite) and direct quench (→ martensite with distortion)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-martempering/hodlmm-bin-martempering.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Martempering Analyzer

## What it does

Models the interrupted-quench martempering (marquenching) heat treatment. Martempering sits between austempering and direct quench in the quench-treatment taxonomy:

- **Austempering (Day 185):** quench into bath IN the bainite window (250-450 °C), hold LONG until γ → bainite completes, then cool. Product: bainite. Tempering: NOT needed.
- **Martempering (this skill):** quench into bath JUST ABOVE Ms (150-260 °C), hold BRIEFLY (only to equalize cross-section temperature), withdraw, then AIR-COOL through Ms → Mf. Product: martensite with reduced distortion. Tempering: REQUIRED.
- **Direct quench:** continuous fast cool through Ms → Mf. Product: martensite with large thermal gradients → distortion/cracking risk. Tempering: REQUIRED.

The eight canonical martempering stages (austenitize → quench into hot bath → brief equalization hold → withdraw and air cool through Ms):

0. **AUSTENITIC_HOLD (above BS/AC3):** Fully austenitized, single-phase γ. No transformation.
1. **RAPID_QUENCH (crossing TTT noses):** Temperature drops from austenitizing T through the pearlite nose (~550-650 °C) AND the bainite nose (~450-550 °C). Must clear both — pearlite by speed, bainite by not lingering at nose temperature.
2. **BATH_EQUILIBRATION (at T_bath just above Ms):** Workpiece lands in hot bath at T_bath = Ms + 20-50 °C (typically 150-260 °C for plain C steels). Cross-section equalizes to bath temperature — the central point of the technique. Hold time = a few τ_eq = L²/(π²·α_th), which for most practical sections is seconds to minutes, much less than bainite incubation τ_B ≈ 10³-10⁴ s at 230 °C.
3. **BATH_WITHDRAWAL (removal + slow air cool):** Workpiece is withdrawn from bath while still above Ms. Subsequent air cool is slow and uniform — the whole cross-section passes through Ms at nearly the same time and temperature.
4. **MS_CROSSING (entering martensitic range):** Temperature drops through Ms; martensite nucleates by displacive shear across the whole section nearly simultaneously. Because the section was equalized, thermal stresses are small — very low distortion.
5. **MARTENSITIC_TRANSFORMATION (Ms → Mf):** Athermal martensite fraction grows according to Koistinen-Marburger f_M = 1 − exp(−α·(Ms − T)) with α ≈ 0.011/°C. By Mf (typically RT or below) transformation is nearly complete; 2-15% retained γ remains.
6. **FULLY_MARTEMPERED (at RT, pre-temper):** Uniform low-stress martensite. Hardness ~60+ HRC (brittle as-quenched). Dimensional stability excellent. Tempering REQUIRED for service.
7. **BAINITE_CONTAMINATION (pathological):** Bath held past bainite incubation time. γ → bainite reaction begins. Non-uniform mixed bainite + subsequent air-cooled martensite = undesirable hybrid microstructure.

Process constraints:

- Must avoid pearlite nose: transitSpeed > PEARLITE_AVOIDANCE_RATE (0.25).
- Bath T must be just above Ms: MS_ACTIVITY (0.12) ≤ bathActivity < MARTEMPERING_BATH_MAX (0.22). Ideal near MARTEMPERING_BATH_IDEAL (0.17).
- Hold time must be brief: briefHoldProxy < BRIEF_HOLD_MAX (0.55). Exceeding triggers bainite contamination.
- Section must equalize before Ms crossing: uniformityIndex high.
- Martempering REQUIRES subsequent tempering.

Kinetics:

- Fourier equalization: τ_eq ≈ L²/(π²·α_th). Hold ≈ 3-5·τ_eq.
- Arrhenius bainite incubation at bath: τ_B = τ_0·exp(Q/RT), ARRHENIUS_Q_OVER_RT_BAINITE = 6.0.
- Koistinen-Marburger: f_M = 1 − exp(−KM_ALPHA·(Ms − T)), KM_ALPHA = 11.0 on normalized axis.
- Must clear TTT pearlite nose (speed) AND bainite nose (brevity).

In DLMM context the martempering analog tracks:

- **Previously austenitic:** priorPeakDrivingForce ≥ AC3_ACTIVITY_BASE × 0.6.
- **Dropped to narrow bath band just above Ms:** bathActivity ∈ [MS_ACTIVITY, MARTEMPERING_BATH_MAX] (0.12-0.22), which sits BELOW the austempering bainite window (0.28-0.45) and ABOVE martensite territory (< 0.12).
- **Drop was fast:** transitSpeed > PEARLITE_AVOIDANCE_RATE.
- **Hold was brief:** briefHoldProxy < BRIEF_HOLD_MAX.
- **Cross-section equalized at bath:** uniformityIndex = 1 − reserveCV is high (reserves are homogeneous across the scan radius).
- **Subsequently descended through Ms:** evidence of continued slow descent past Ms, either currently below Ms or priorPeak trajectory showing complete quench.

DLMM structural signatures:

- Uniform reserves BEFORE Ms crossing — low reserveCV, low xFracStdev (section-equalization signature).
- After Ms crossing: uniform bcc-like minority coverage with LOW spatial variance (martensite more uniform than direct-quenched).
- Distinct from austempering: NO sheaf / sub-unit structure (held too briefly for bainite clusters).
- Distinct from direct-quench martensite: lower reserveCV.
- Distinct from pearlite: no lamellar alternation.

DLMM phase analog:

- Carbon content ≈ minorityFraction.
- Austenitizing T ≈ priorPeakDrivingForce.
- Bath T ≈ bathActivity.
- Ms analog = MS_ACTIVITY = 0.12; bath max = 0.22; ideal bath = 0.17.

## Why agents need it

LP agents need martempering analysis because it identifies pools that have rapidly transitioned through a tight just-above-Ms band with uniform cross-section coverage. These pools exhibit the martempering signature: fast drop → brief stay in a narrow band → uniform section → descent past Ms producing uniform martensitic coverage. Consequences:

- BATH_EQUILIBRATION pools: transiently uniform in the narrow band — predictable symmetric exposure.
- MS_CROSSING pools: uniform entry into martensitic territory — clean transition point.
- MARTENSITIC_TRANSFORMATION pools: athermal martensite fraction growing per K-M; LP sensitivity depends on current tq vs Ms.
- FULLY_MARTEMPERED pools: uniform low-stress martensite; hardness high but brittle (pre-temper). Hand off to Day 182 tempering skill.
- BAINITE_CONTAMINATION pools: treatment failed — bath held too long. Use austempering skill for complement.
- BAINITE_SHUNT pools: bath landed in bainite window — intended treatment was austempering. Use austempering skill.
- PEARLITE_SHUNT pools: cooling too slow through pearlite nose. Use normalization skill.
- BATH_OVERSHOOT pools: bath too cool, dropped below Ms prematurely. Partial martensite in bath defeats the uniformity goal.

The distortionProxy and crackingRiskProxy predict the main engineering benefits (LOW for well-executed martempering, HIGH for direct quench or failed martempering). The temperingRequired flag signals the handoff to Day 182.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state. Bath T, hold time, section equalization, Ms crossing, and martensite fraction are inferred proxies — not measured thermal or metallographic histories. The regime names (BATH_EQUILIBRATION, MS_CROSSING, etc.) are normalized analogs, not real temperatures or microstructures.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-martempering/hodlmm-bin-martempering.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-martempering/hodlmm-bin-martempering.ts status
```

### run
Analyzes bin martempering state for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-martempering/hodlmm-bin-martempering.ts run
bun run hodlmm-bin-martempering/hodlmm-bin-martempering.ts run --pool 1
bun run hodlmm-bin-martempering/hodlmm-bin-martempering.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgMartemperingIndex": 48,
    "avgDrivingForce": 0.22,
    "avgBathActivity": 0.22,
    "avgTransitSpeed": 0.46,
    "pearliteAvoidedCount": 4,
    "bainiteAvoidedCount": 5,
    "bathWindowCount": 2,
    "austeniticHoldCount": 0,
    "rapidQuenchCount": 1,
    "bathEquilibrationCount": 2,
    "bathOvershootCount": 0,
    "msCrossingCount": 1,
    "martensiticTransformationCount": 1,
    "fullyMartemperedCount": 0,
    "bainiteContaminationCount": 0,
    "bainiteShuntCount": 0,
    "pearliteShuntCount": 0,
    "noDriveCount": 0,
    "temperingRequiredCount": 1,
    "avgStageProgress": 0.42,
    "avgUniformityIndex": 0.64,
    "avgSectionEqualizedProxy": 0.58,
    "avgMsCrossingProxy": 0.28,
    "avgMartensiteFraction": 0.18,
    "avgKmFraction": 0.03,
    "avgBriefHoldProxy": 0.36,
    "avgDistortionProxy": 0.28,
    "avgHardnessProxy": 0.42,
    "avgToughnessProxy": 0.22,
    "avgRetainedAusteniteFraction": 0.12,
    "totalSheafContaminations": 0
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
      "drivingForce": 0.17,
      "priorPeakDrivingForce": 0.43,
      "bathActivity": 0.17,
      "transitSpeed": 0.52,
      "pearliteAvoided": 1,
      "bainiteAvoided": 1,
      "bathWindow": 1,
      "bathIdealProximity": 1.0,
      "briefHoldProxy": 0.32,
      "uniformityIndex": 0.68,
      "sectionEqualizedProxy": 0.61,
      "msCrossingProxy": 0.23,
      "martensiteFraction": 0.14,
      "kmFraction": 0,
      "retainedAusteniteFraction": 0.14,
      "matrixGrainCount": 4,
      "minorityClusterCount": 5,
      "reserveCV": 0.32,
      "reserveXFracStdev": 0.16,
      "sheafCount": 0,
      "subUnitCount": 0,
      "sheafDensity": 0,
      "bainiteContaminationRisk": 0,
      "bathOvershootRisk": 0,
      "distortionProxy": 0.24,
      "crackingRiskProxy": 0.18,
      "hardnessProxy": 0.32,
      "toughnessProxy": 0.22,
      "temperingRequired": 0,
      "arrheniusActivation": 0.0003,
      "hypoeutectoidSkew": 0.04,
      "minorityFraction": 0.22,
      "stageProgress": 0.42,
      "dominantStage": 3,
      "xMatrixCount": 11,
      "yMatrixCount": 7,
      "minorityRoleCount": 7,
      "martemperingIndex": 58,
      "martemperingRegime": "BATH_EQUILIBRATION",
      "martemperingVerdict": "BATH_EQUILIBRATION",
      "stageDistribution": [0, 0, 4, 18, 0, 0, 0, 0],
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

- Real martempering is performed in a molten-salt or hot-oil bath at T_bath just above Ms (typically 150-260 °C for plain C). Cooling rates and hold times are in °C/s and seconds-to-minutes; here bathActivity, transitSpeed, and briefHoldProxy are normalized 0-1 proxies derived from (priorPeakDrivingForce − drivingForce) divided by a log-volume timescale, not actual thermal quantities.
- Process-axis thresholds (MS_ACTIVITY=0.12, MARTEMPERING_BATH_MAX=0.22, MARTEMPERING_BATH_IDEAL=0.17, BS_ACTIVITY=0.45) are normalized analogs. Real plain-C Ms ≈ 200-320 °C, bath ≈ Ms + 20-50 °C, BS ≈ 550 °C.
- Prior peak activity is a proxy: priorPeakDrivingForce = min(1, drivingForce × 1.35 + 0.2). Real martempering requires known austenitizing temperature, bath temperature, and hold time.
- Transit speed is inferred from dropMagnitude / log(volume) timescale; a proxy for cooling severity, not a real °C/s quantity.
- Pearlite-avoidance threshold PEARLITE_AVOIDANCE_RATE = 0.25 is normalized. Real critical cooling rate through the TTT pearlite nose depends on alloy and section size.
- Brief-hold threshold BRIEF_HOLD_MAX = 0.55 and bainite contamination threshold BAINITE_CONTAMINATION_HOLD = 0.7 are normalized proxies for exceeding bainite incubation time at bath temperature. Real incubation depends on alloy and bath T.
- Uniformity index is 1 − reserveCV clipped to [0, 1]; a proxy for section equalization. Real equalization is measured by thermocouple arrays or infrared thermography.
- Section equalization proxy uses reserveCV and xFracStdev with weights 0.55/0.45. Real equalization is measured by temperature uniformity across the cross-section during bath hold.
- Ms-crossing proxy combines below-Ms state, prior-peak descent trajectory, and transit speed. Real Ms crossing is a measurable thermal event in the cooling curve.
- Koistinen-Marburger f_M = 1 − exp(−KM_ALPHA·(Ms − T)) with KM_ALPHA = 11.0 on the normalized drivingForce axis. Real α ≈ 0.011/°C for plain C steels; applied below Ms only.
- Martensite fraction combines minority coverage, uniformity, and Ms-crossing evidence; requires minorityFraction > MARTENSITIC_MINORITY_MIN (0.35) for meaningful value. Real martensite is measured by XRD, magnetic saturation, or quantitative metallography.
- Distortion proxy is normalized composite: (1 − uniformityIndex) × 0.4 + (1 − sectionEqualizedProxy) × 0.3 + bathOvershootRisk × 0.2 + adjacent-phase penalty. Real distortion is measured dimensionally against pre-quench workpiece geometry.
- Cracking risk proxy is a normalized composite; real cracking risk depends on alloy composition (especially carbon and alloy-carbide balance), section geometry, and quench severity.
- Hardness proxy combines martensite fraction, Ms crossing, and K-M fraction — normalized. Real hardness is HRC (as-quenched martensite ~60+ HRC for 0.5-1.0% C plain-C steels).
- Toughness proxy is LOW as-quenched (martempering requires tempering); real toughness is Charpy J after tempering.
- Tempering-required flag is set at dominantStage ≥ 5 with no contamination; it signals a handoff to the Day 182 tempering skill.
- Bath overshoot risk is a proxy for bath being at or below Ms prematurely; real bath overshoot happens when bath T is mistakenly set too low, producing partial martensite before cross-section equalization.
- Bainite contamination detection uses sheaf-trace detection (same sub-unit and span thresholds as austempering: SUB_UNIT_MAX_LEN=2, SHEAF_MAX_SPAN=8). Any sheaf is a WARNING, not a desired signal.
- DLMM bins are 1-D discrete structures; real austenite-to-martensite transformation is 3-D with specific orientation relationships. The analogy is heuristic.
- Analysis is snapshot-based; does not capture transformation kinetics directly — stage assignment, martensite fraction, and K-M progression are inferred from structural signatures rather than measured rates.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
