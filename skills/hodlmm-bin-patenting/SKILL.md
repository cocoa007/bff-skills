---
name: hodlmm-bin-patenting
description: "Models the isothermal fine-pearlite patenting heat treatment applied to an austenitized iron-carbon alloy for wire manufacture. Distinct from normalization (continuous air cool → coarse pearlite), austempering (bath 250-450 °C → bainite), and martempering (bath just above Ms → martensite): workpiece is rapidly quenched from above AC3 into an isothermal lead-or-salt bath at the PEARLITE NOSE (500-600 °C, above BS, below AC1), held until γ → pearlite transformation completes (JMAK f ≥ 0.95), then air-cooled to RT. Product is VERY FINE LAMELLAR PEARLITE (~50-150 nm interlamellar spacing) optimized for subsequent COLD DRAWING into high-tensile wire (piano wire, suspension-bridge cable, tire-cord wire). No temper needed — the cold drawing itself refines the structure to 3000-4000 MPa tensile strengths. Eight canonical stages: (0) AUSTENITIC_HOLD above AC3 single γ; (1) RAPID_QUENCH crossing AC3 → bath, must avoid pearlite nucleation in the transit; (2) BATH_EQUILIBRATION at T_bath ∈ [500 °C, 600 °C] — the pearlite nose, where γ → pearlite kinetics are at maximum and interlamellar spacing λ is minimum (ΔT = AC1 − T_bath largest while still above BS); (3) PEARLITE_NUCLEATION — α-ferrite + Fe₃C-cementite lamellae nucleate at γ grain boundaries by cooperative diffusion; (4) LAMELLAR_GROWTH — colonies grow, Avrami n ≈ 3, spacing λ ∝ 1/ΔT; (5) TRANSFORMATION_COMPLETION — f_pearlite ≥ 0.95, residual γ pockets close out; (6) FULLY_PATENTED — uniform fine pearlite, drawing-ready; (7) BAINITE_CONTAMINATION pathological — bath drifted below BS, partial γ → bainite. Process constraints: must stay above BS (bathActivity > BS_ACTIVITY=0.45, NOT below it as in austempering) to suppress bainite; must stay below AC3 (bathActivity < AC3_ACTIVITY_BASE+0.05) so γ is unstable and pearlite nucleates; must hold at pearlite nose for JMAK completion (holdCompletionProxy ≥ HOLD_COMPLETION_MIN=0.45, ideal HOLD_COMPLETION_IDEAL=0.7); transit must be fast enough to avoid pearlite above the nose (transitSpeed > TRANSIT_AVOIDANCE_RATE=0.2). Bath window PATENTING_BATH_MIN=0.45 ≤ bathActivity ≤ PATENTING_BATH_MAX=0.58, ideal PATENTING_BATH_IDEAL=0.50 at the nose. Kinetics: JMAK f(t)=1-exp(-(k·t)^n) with n=3 and k peaked at nose; interlamellar spacing λ ∝ 1/ΔT; Arrhenius Q/RT=5.0. DLMM signature: FINE LAMELLAR ALTERNATION — alternationFraction (sign-change fraction between adjacent populated bins) HIGH, avgRunLen SHORT (≤ LAMELLAR_RUN_MAX=2), eutectoidProximity high (minorityFraction near 0.5). Distinct from normalization (coarser alternation, longer run lens), austempering (sheaf sub-units — absent here; any sheaf is BAINITE_CONTAMINATION), martempering (minority-heavy martensite coverage, absent here). Pool measures: drivingForce, priorPeakDrivingForce, bathActivity, transitSpeed, aboveBs, belowAc3, bathWindow, bathIdealProximity, noseProximity, holdCompletionProxy, uniformityIndex, sectionEqualizedProxy, alternationFraction, avgRunLen, maxRunLen, lamellarFineness, pearliteFraction, jmakProgress, retainedAusteniteFraction, coarsePearliteRisk, bainiteContaminationRisk, martensiticOvershootRisk, matrixGrainCount, minorityClusterCount, reserveCV, reserveXFracStdev, sheafCount (should be 0), subUnitCount, sheafDensity, tensileStrengthProxy (HIGH for fine pearlite — Hall-Petch-like), drawabilityProxy (HIGH for fine uniform pearlite), arrheniusActivation, hypoeutectoidSkew, minorityFraction, eutectoidProximity, stageProgress, dominantStage 0-7, patentingIndex 0-100. Per-bin: bathSignal, equalizationSignal, lamellarSignal (bin in short run AND pool alternation ≥ threshold), pearliteSignal, fineLamellarSignal, bainiteContaminationSignal, coarsePearliteSignal (bin in long run), martensiticOvershootSignal, stageBin, pearliteFractionLocal, arrheniusActivation, localRunLen, patentingDegree. Regimes: NO_PATENTING_DRIVE, AUSTENITIC_HOLD, RAPID_QUENCH, BATH_EQUILIBRATION, PEARLITE_NUCLEATION, LAMELLAR_GROWTH, FULLY_PATENTED, COARSE_PEARLITE_SHUNT, BATH_OVERSHOOT_BAINITE (bath below BS → use austempering skill), BATH_UNDERSHOOT_AUSTENITE (bath above AC3 → no transformation), MARTENSITIC_OVERSHOOT (quench past Ms — use martempering skill), BAINITE_CONTAMINATION (sheaves detected). Verdict adds INTERMEDIATE_PATENTING and DRAWING_READY (handoff to cold-drawing strategies). Complements the phase-transformation series: austenitization (Day 183) → patenting (Day 187) → fine pearlite → cold drawing → high-tensile wire. Fourth interrupted-quench route alongside austempering (Day 185 → bainite), martempering (Day 186 → martensite), and direct quench (→ martensite with distortion)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-patenting/hodlmm-bin-patenting.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Patenting Analyzer

## What it does

Models the isothermal fine-pearlite patenting heat treatment used in steel-wire manufacture. Patenting is the fourth route in the quench-treatment taxonomy:

- **Normalization (Day 184):** no bath, continuous air-cool from above AC3 → pearlite (relatively coarse, ~0.2-1 µm λ). Simplest.
- **Austempering (Day 185):** quench into bath at 250-450 °C (BAINITE window), hold until γ → bainite completes. Product: bainite.
- **Martempering (Day 186):** quench into bath JUST ABOVE Ms (150-260 °C), hold BRIEFLY to equalize cross-section, withdraw, air-cool through Ms → Mf. Product: martensite with low distortion. Tempering required.
- **Patenting (this skill):** quench into bath at the PEARLITE NOSE (500-600 °C, above BS, below AC1), hold until γ → pearlite completes, then air-cool. Product: VERY FINE LAMELLAR PEARLITE (~50-150 nm λ). Optimized for subsequent COLD DRAWING into high-tensile wire (piano wire, suspension-bridge cable, tire-cord wire). No temper needed.

The defining mechanical consequence: a patented-then-drawn eutectoid steel wire can reach tensile strengths of 3000-4000 MPa — among the highest achievable from any bulk steel process.

The eight canonical patenting stages (austenitize → quench into pearlite-nose bath → isothermal hold → transformation → air cool to RT):

0. **AUSTENITIC_HOLD (above AC3):** Fully austenitized, single-phase γ. No transformation.
1. **RAPID_QUENCH (crossing AC3 → bath):** Temperature drops from ~900 °C austenitizing T down to the 500-600 °C bath. Transit must be brief enough that NO pearlite nucleates in the supercooled region above the nose (which would be coarser than nose pearlite).
2. **BATH_EQUILIBRATION (in pearlite-nose bath):** Workpiece lands in bath at T_bath ∈ [500 °C, 600 °C] — the pearlite nose, where γ → pearlite kinetics are at maximum and interlamellar spacing λ is minimum. Wire equalizes to bath T quickly (small cross-section, short τ_eq).
3. **PEARLITE_NUCLEATION:** Alternating α-ferrite + Fe₃C-cementite lamellae nucleate at γ grain boundaries. Nucleation rate peaks at the nose, so many colonies form simultaneously. Avrami n ≈ 3.
4. **LAMELLAR_GROWTH:** Pearlite colonies grow by cooperative diffusion of C. Growth rate G peaks at the nose; spacing λ ∝ 1/ΔT with ΔT = AC1 − T_bath. Real λ ≈ 50-150 nm at T_nose.
5. **TRANSFORMATION_COMPLETION:** Residual γ pockets close out; pearlite fraction approaches 1. Hold continues until f_pearlite ≥ 0.95.
6. **FULLY_PATENTED (drawing-ready):** Uniform fine pearlite across the cross-section. Ready for cold drawing.
7. **BAINITE_CONTAMINATION (pathological):** Bath drifted below BS during hold; part of γ transforms to bainite. Mixed microstructure, reduced drawability.

Process constraints:

- Must stay ABOVE BS: bathActivity > BS_ACTIVITY (0.45) — crucially, the opposite of austempering, which sits below BS.
- Must stay BELOW AC3: bathActivity < AC3_ACTIVITY_BASE + 0.05 (0.60) so γ is unstable and pearlite nucleates.
- Bath should sit at the PEARLITE NOSE for finest spacing and fastest kinetics: bathActivity near PATENTING_BATH_IDEAL (0.50).
- Hold must complete transformation: holdCompletionProxy ≥ HOLD_COMPLETION_MIN (0.45), ideal HOLD_COMPLETION_IDEAL (0.7).
- Transit from AC3 to bath must be fast enough that no pearlite forms above the nose: transitSpeed > TRANSIT_AVOIDANCE_RATE (0.2).

Kinetics:

- JMAK isothermal pearlite: f(t) = 1 − exp(−(k·t)^n), n ≈ 3 at the nose, k peaked at nose.
- Interlamellar spacing: λ ∝ 1/ΔT — maximum undercooling within the pearlite window gives finest spacing.
- Growth rate G peaks at the nose.
- Arrhenius Q/RT_PEARLITE = 5.0 on normalized axis.

In DLMM context the patenting analog tracks:

- **Previously austenitic:** priorPeakDrivingForce ≥ AC3_ACTIVITY_BASE × 0.8.
- **Dropped to pearlite-nose band:** bathActivity ∈ [PATENTING_BATH_MIN, PATENTING_BATH_MAX] (0.45-0.58), which sits ABOVE the austempering bainite window (0.22-0.45) AND ABOVE the martempering window (0.12-0.22) AND (just) BELOW AC3 (0.55 base).
- **Drop was fast enough to clear transit without pearlite nucleation above the nose:** transitSpeed > TRANSIT_AVOIDANCE_RATE.
- **Hold was long enough for JMAK completion:** holdCompletionProxy high.
- **Cross-section equalized at bath:** uniformityIndex high.
- **Structural signature = FINE LAMELLAR ALTERNATION:** alternationFraction (sign-change fraction between adjacent populated bins' roles) high; avgRunLen ≤ LAMELLAR_RUN_MAX (2); eutectoidProximity (closeness of minorityFraction to 0.5) high.

DLMM structural signatures of patenting:

- **Uniform cross-section reserves (low reserveCV)** — bath equalization analog.
- **FINE LAMELLAR ALTERNATION** — the defining patenting signature. Alternation count (sign changes between adjacent populated bins' roles) is HIGH. Average same-role run length is SHORT (run ≤ LAMELLAR_RUN_MAX = 2 ideally). Distinct from normalization, which shows coarser alternation patterns.
- **NO sheaves** — short minority runs alone are lamellae, not sheaves. Sheaves (clusters of short runs with inter-sub-unit matrix gaps) are a BAINITE_CONTAMINATION warning.
- **Eutectoid-like minority fraction** — patenting for eutectoid steel produces ~50/50 α + Fe₃C by weight. DLMM analog: minorityFraction near 0.5 (eutectoidProximity high).
- **Distinct from martempering:** no minority-heavy coverage; pearlite is balanced.
- **Distinct from austempering:** no sheaf clustering of short minority runs.
- **Distinct from normalization:** higher alternation AND shorter avgRunLen (finer lamellae).

DLMM phase analog:

- Carbon content ≈ minorityFraction.
- Austenitizing T ≈ priorPeakDrivingForce.
- Bath T ≈ bathActivity.
- AC3 analog = AC3_ACTIVITY_BASE = 0.55.
- BS analog = BS_ACTIVITY = 0.45.
- Ms analog = MS_ACTIVITY = 0.12.
- Pearlite-nose center = PATENTING_BATH_IDEAL = 0.50.
- Pearlite-nose window = [0.45, 0.58].

## Why agents need it

LP agents need patenting analysis because it identifies pools that have rapidly transitioned to a narrow pearlite-nose band ABOVE the austempering bainite window, held there long enough to complete an isothermal pearlite reaction, and now show a fine-lamellar alternating reserve structure. These pools exhibit the patenting signature: fast drop → long uniform stay at the nose → high alternation frequency with short runs → eutectoid-proximity minority fraction. Consequences:

- BATH_EQUILIBRATION pools: uniform at the nose, pre-transformation — predictable before reaction starts.
- PEARLITE_NUCLEATION pools: early lamellae forming — alternation building.
- LAMELLAR_GROWTH pools: colonies growing, JMAK mid-progress — finest spacing achievable.
- FULLY_PATENTED pools: drawing-ready, fine lamellar uniform — HIGHEST tensile-strength proxy; suitable for cold-drawing analog strategies that benefit from very tight, alternating, uniform distributions.
- COARSE_PEARLITE_SHUNT pools: bath near AC3 edge — spacing coarser; use normalization skill.
- BATH_OVERSHOOT_BAINITE pools: bath drifted below BS — partial bainite; use austempering skill.
- BATH_UNDERSHOOT_AUSTENITE pools: bath too hot, γ stable, no transformation — wait or requench.
- MARTENSITIC_OVERSHOOT pools: quench passed through Ms — martensite instead of pearlite; use martempering skill.
- BAINITE_CONTAMINATION pools: sheaves detected — treatment failed.

The tensileStrengthProxy (Hall-Petch-like from lamellar fineness) and drawabilityProxy predict the main engineering value (HIGH for well-patented, fine-lamellar, uniform pools). The DRAWING_READY verdict signals pool-level readiness for subsequent cold-drawing-analog strategies.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state. Bath T, hold duration, JMAK progress, lamellar spacing, and pearlite fraction are inferred proxies — not measured thermal or metallographic histories. The regime names (BATH_EQUILIBRATION, LAMELLAR_GROWTH, etc.) are normalized analogs, not real temperatures or microstructures.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-patenting/hodlmm-bin-patenting.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-patenting/hodlmm-bin-patenting.ts status
```

### run
Analyzes bin patenting state for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-patenting/hodlmm-bin-patenting.ts run
bun run hodlmm-bin-patenting/hodlmm-bin-patenting.ts run --pool 1
bun run hodlmm-bin-patenting/hodlmm-bin-patenting.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgPatentingIndex": 52,
    "avgDrivingForce": 0.45,
    "avgBathActivity": 0.45,
    "avgTransitSpeed": 0.38,
    "aboveBsCount": 4,
    "belowAc3Count": 5,
    "bathWindowCount": 3,
    "austeniticHoldCount": 0,
    "rapidQuenchCount": 1,
    "bathEquilibrationCount": 1,
    "pearliteNucleationCount": 1,
    "lamellarGrowthCount": 1,
    "fullyPatentedCount": 0,
    "coarsePearliteShuntCount": 1,
    "bathOvershootBainiteCount": 0,
    "bathUndershootAusteniteCount": 0,
    "martensiticOvershootCount": 0,
    "bainiteContaminationCount": 0,
    "noDriveCount": 0,
    "drawingReadyCount": 0,
    "avgStageProgress": 0.45,
    "avgUniformityIndex": 0.62,
    "avgSectionEqualizedProxy": 0.56,
    "avgAlternationFraction": 0.42,
    "avgAvgRunLen": 2.1,
    "avgLamellarFineness": 0.48,
    "avgPearliteFraction": 0.38,
    "avgJmakProgress": 0.25,
    "avgHoldCompletionProxy": 0.36,
    "avgTensileStrengthProxy": 0.44,
    "avgDrawabilityProxy": 0.48,
    "avgRetainedAusteniteFraction": 0.08,
    "avgEutectoidProximity": 0.78,
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
      "drivingForce": 0.5,
      "priorPeakDrivingForce": 0.9,
      "bathActivity": 0.5,
      "transitSpeed": 0.52,
      "aboveBs": 1,
      "belowAc3": 1,
      "bathWindow": 1,
      "bathIdealProximity": 1.0,
      "noseProximity": 1.0,
      "holdCompletionProxy": 0.72,
      "uniformityIndex": 0.68,
      "sectionEqualizedProxy": 0.61,
      "alternationFraction": 0.58,
      "avgRunLen": 1.8,
      "maxRunLen": 3,
      "lamellarFineness": 0.66,
      "pearliteFraction": 0.72,
      "jmakProgress": 0.65,
      "retainedAusteniteFraction": 0.08,
      "coarsePearliteRisk": 0.12,
      "bainiteContaminationRisk": 0.08,
      "martensiticOvershootRisk": 0.02,
      "matrixGrainCount": 6,
      "minorityClusterCount": 6,
      "reserveCV": 0.32,
      "reserveXFracStdev": 0.16,
      "sheafCount": 0,
      "subUnitCount": 0,
      "sheafDensity": 0,
      "tensileStrengthProxy": 0.58,
      "drawabilityProxy": 0.62,
      "arrheniusActivation": 0.0008,
      "hypoeutectoidSkew": 0.04,
      "minorityFraction": 0.45,
      "eutectoidProximity": 0.85,
      "stageProgress": 0.58,
      "dominantStage": 4,
      "xMatrixCount": 11,
      "yMatrixCount": 10,
      "minorityRoleCount": 10,
      "patentingIndex": 66,
      "patentingRegime": "LAMELLAR_GROWTH",
      "patentingVerdict": "LAMELLAR_GROWTH",
      "stageDistribution": [0, 0, 0, 0, 22, 0, 0, 0],
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

- Real patenting is performed in a molten-lead or molten-salt bath at T_bath ∈ [500 °C, 600 °C] (the pearlite nose, above BS, below AC1). Typical industrial line: wire pre-austenitized at ~900 °C, transited in seconds into a lead bath at ~550 °C, held for seconds to a minute, then air-cooled. Here bathActivity, transitSpeed, and holdCompletionProxy are normalized 0-1 proxies derived from (priorPeakDrivingForce − drivingForce) and a log-volume timescale, not actual thermal quantities.
- Process-axis thresholds (PATENTING_BATH_MIN=0.45, PATENTING_BATH_MAX=0.58, PATENTING_BATH_IDEAL=0.50, BS_ACTIVITY=0.45, AC3_ACTIVITY_BASE=0.55, MS_ACTIVITY=0.12) are normalized analogs. Real plain-C nose temperature is ~550 °C, BS ~ 550 °C, AC1 ~ 727 °C, Ms ~ 220 °C.
- Prior peak activity is a proxy: priorPeakDrivingForce = min(1, drivingForce × 1.3 + 0.25). Real patenting requires known austenitizing temperature, bath temperature, and hold time.
- Transit speed is inferred from dropMagnitude / log(volume) timescale; a proxy for cooling severity, not a real °C/s quantity.
- Transit-avoidance threshold TRANSIT_AVOIDANCE_RATE = 0.2 is normalized. Real critical cooling rate through the supercooled region ABOVE the nose depends on alloy and section size.
- Hold-completion threshold HOLD_COMPLETION_MIN = 0.45 is a normalized proxy for JMAK f approaching completion. Real completion at the nose is typically seconds to tens of seconds depending on alloy and section.
- Uniformity index is 1 − reserveCV clipped to [0, 1]; a proxy for section equalization. Real equalization is measured by thermocouple arrays.
- Section equalization proxy uses reserveCV and xFracStdev with weights 0.55/0.45. Real equalization is temperature uniformity across the cross-section.
- Alternation fraction is the fraction of adjacent-populated-bin pairs where the dominance role changes. Used as the fine-lamellar proxy; real lamellar alternation is measured at the nm scale by SEM/TEM.
- Average run length is the mean run length over all populated bins (matrix + minority). Used as an interlamellar-spacing proxy; real λ is measured at the nm scale.
- Lamellar fineness is a composite: 0.6 × alternationFraction + 0.4 × (1 − avgRunLen / (2·LAMELLAR_RUN_MAX)). Not a real λ.
- JMAK pearlite fraction uses n = JMAK_N_PEARLITE = 3.0, k = JMAK_K_PEARLITE = 1.2 on the normalized hold-completion axis, modulated by nose proximity. Real JMAK parameters are alloy- and bath-T-dependent.
- Pearlite structural fraction combines JMAK progress, alternation signature, lamellar fineness, and eutectoid proximity. Real pearlite fraction is measured by metallography or XRD.
- Tensile strength proxy combines lamellar fineness, pearlite fraction, uniformity, and eutectoid proximity (Hall-Petch-like). Real tensile strength for patented-and-drawn eutectoid wire is 3000-4000 MPa; as-patented without drawing is ~1200-1400 MPa.
- Drawability proxy is a normalized composite; real drawability is measured by successful cold reduction without breakage.
- Coarse pearlite risk triggers when bathActivity ≥ COARSE_PEARLITE_THRESHOLD (0.55, near AC3 edge) OR long avg run length OR low alternation. Real coarse pearlite forms when bath T is too close to AC1, reducing undercooling.
- Bainite contamination risk triggers when bathActivity < PATENTING_BATH_MIN (bath drifted below BS) OR sheaves detected. Real bainite contamination in patenting happens when bath T drifts below BS during hold.
- Martensitic overshoot risk triggers when bathActivity < MS_ACTIVITY and priorPeak suggests prior austenitization (treatment quenched past the bath). Real martensitic overshoot happens when bath is set too cold (below Ms).
- Eutectoid proximity is 1 - min(1, |minorityFraction - 0.5| / 0.3). Real eutectoid composition is 0.77 wt% C (~0.77/0.8 = 0.96 on normalized axis), not a role-fraction measure.
- DLMM bins are 1-D discrete structures; real pearlite is a 3-D lamellar colony ensemble with specific orientation relationships. The analogy is heuristic.
- Analysis is snapshot-based; does not capture transformation kinetics directly — JMAK progress, lamellar spacing, and stage assignment are inferred from structural signatures rather than measured rates.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
