---
name: hodlmm-bin-patenting-agent
skill: hodlmm-bin-patenting
description: "Agent behavior for HODLMM bin patenting analysis — interprets stageProgress (composite 0-1), dominantStage (0-7), drivingForce, priorPeakDrivingForce (austenitizing T analog), bathActivity (bath T analog at pearlite nose), transitSpeed (0-1 normalized drop rate), aboveBs (0/1 bath above BS = bainite suppressed), belowAc3 (0/1 bath below AC3 = γ unstable), bathWindow (0/1 bathActivity ∈ [PATENTING_BATH_MIN=0.45, PATENTING_BATH_MAX=0.58]), bathIdealProximity (0-1 closeness to PATENTING_BATH_IDEAL=0.50), noseProximity, holdCompletionProxy (0-1 HIGH = long hold approaching JMAK completion — opposite polarity from martempering), uniformityIndex (0-1), sectionEqualizedProxy (0-1), alternationFraction (0-1 sign-change fraction between adjacent populated bins = lamellar analog), avgRunLen (lower = finer lamellae), maxRunLen, lamellarFineness (0-1 composite: alternation + inverse run length), pearliteFraction (0-1 structural composite of JMAK + lamellar signature), jmakProgress (0-1 Avrami n=3), retainedAusteniteFraction (0-1 residual γ), coarsePearliteRisk (0-1), bainiteContaminationRisk (0-1), martensiticOvershootRisk (0-1), sheafCount (should be 0 — any sheaf is bainite contamination warning), sheafDensity, tensileStrengthProxy (0-1 HIGH for fine pearlite via Hall-Petch-like), drawabilityProxy (0-1 HIGH for fine uniform pearlite), eutectoidProximity (0-1 closeness of minorityFraction to 0.5) to identify pools in NO_PATENTING_DRIVE, AUSTENITIC_HOLD, RAPID_QUENCH, BATH_EQUILIBRATION, PEARLITE_NUCLEATION, LAMELLAR_GROWTH, FULLY_PATENTED, COARSE_PEARLITE_SHUNT, BATH_OVERSHOOT_BAINITE, BATH_UNDERSHOOT_AUSTENITE, MARTENSITIC_OVERSHOOT, or BAINITE_CONTAMINATION regime and guide LP strategies — austenitic-hold pools are pre-quench single-γ; rapid-quench pools are crossing AC3→bath; bath-equilibration pools are at pearlite nose pre-transformation; pearlite-nucleation pools are in early lamellar formation; lamellar-growth pools have colonies growing with fine spacing; fully-patented pools have uniform fine lamellar pearlite ready for drawing analog strategies; coarse-pearlite-shunt pools need normalization skill; bath-overshoot-bainite pools drifted below BS — use austempering skill; bath-undershoot-austenite pools still γ — wait or requench; martensitic-overshoot pools went past Ms — use martempering skill; bainite-contamination pools show sheaves — treatment failed."
---

# Agent Behavior — HODLMM Bin Patenting

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `patentingRegime`, `patentingVerdict`, `dominantStage`, `stageProgress`, `bathWindow`, `aboveBs`, `belowAc3`, `alternationFraction`, `avgRunLen`, `lamellarFineness`, `pearliteFraction`, `jmakProgress`, `holdCompletionProxy`, `coarsePearliteRisk`, `bainiteContaminationRisk`, `martensiticOvershootRisk`, `tensileStrengthProxy`, and `drawabilityProxy`.

## Interpreting output

- **patentingRegime = NO_PATENTING_DRIVE:** priorPeakDrivingForce < AC3_ACTIVITY_BASE × 0.8. No prior austenitization inferable. Analysis not applicable.
- **patentingRegime = AUSTENITIC_HOLD:** drivingForce > AC3_ACTIVITY_BASE + 0.05 (above AC3). Still in γ region (pre-quench). No transformation yet.
- **patentingRegime = RAPID_QUENCH:** transitSpeed > TRANSIT_AVOIDANCE_RATE (0.2) AND drivingForce > PATENTING_BATH_MAX (0.58) AND drivingForce ≤ AC3_ACTIVITY_BASE + 0.1. Transit from AC3 toward bath, pearlite avoidance required in the drop.
- **patentingRegime = BATH_EQUILIBRATION:** bathWindow = 1 AND jmakProgress = 0 (or very low). At pearlite nose, pre-transformation.
- **patentingRegime = PEARLITE_NUCLEATION:** bathWindow = 1 AND 0 < jmakProgress < 0.4. Early lamellar nucleation at γ boundaries.
- **patentingRegime = LAMELLAR_GROWTH:** bathWindow = 1 AND jmakProgress ≥ 0.4 AND structuralLamellar ≥ 0.4. Colonies growing with fine spacing.
- **patentingRegime = FULLY_PATENTED:** bathWindow = 1 AND pearliteFraction ≥ 0.85 AND stageProgress ≥ STAGE_6_BOUND (0.82). Fine lamellar pearlite, drawing-ready.
- **patentingRegime = COARSE_PEARLITE_SHUNT:** bathWindow = 1 AND bathActivity ≥ COARSE_PEARLITE_THRESHOLD (0.55) AND lamellarFineness < 0.4. Bath near AC3 edge — pearlite forms coarser. Use normalization skill.
- **patentingRegime = BATH_OVERSHOOT_BAINITE:** bathActivity < PATENTING_BATH_MIN (0.45) AND bathActivity ≥ MS_ACTIVITY. Bath drifted below BS → bainite zone. Use austempering skill.
- **patentingRegime = BATH_UNDERSHOOT_AUSTENITE:** drivingForce > AC3_ACTIVITY_BASE + 0.05. Bath too hot → γ still stable, no transformation. Wait or requench.
- **patentingRegime = MARTENSITIC_OVERSHOOT:** bathActivity < MS_ACTIVITY AND martensiticOvershootRisk > 0.4. Quench passed through Ms — martensite instead of pearlite. Use martempering skill.
- **patentingRegime = BAINITE_CONTAMINATION:** bainiteContaminationRisk > 0.7. Sheaves detected — treatment failed.
- **patentingVerdict = NO_PATENTING_DRIVE:** no prior peak, cannot infer any quench.
- **patentingVerdict = DRAWING_READY:** fully patented, handoff to cold-drawing-analog strategies.
- **patentingVerdict = BAINITE_CONTAMINATION:** treatment failed — bainite contamination.
- **patentingVerdict = MARTENSITIC_OVERSHOOT:** quench overshot, use martempering skill.
- **patentingVerdict = BATH_OVERSHOOT_BAINITE:** bath below BS — use austempering skill.
- **patentingVerdict = BATH_UNDERSHOOT_AUSTENITE:** bath above AC3 — no transformation.
- **patentingVerdict = COARSE_PEARLITE_SHUNT:** spacing too coarse — use normalization skill.
- **patentingVerdict = LAMELLAR_GROWTH:** colonies growing; mid-transformation.
- **patentingVerdict = PEARLITE_NUCLEATION:** early nucleation at γ boundaries.
- **patentingVerdict = BATH_EQUILIBRATION:** at nose, pre-transformation.
- **patentingVerdict = RAPID_QUENCH:** transit through AC3 → bath.
- **patentingVerdict = AUSTENITIC_HOLD:** pre-quench.
- **patentingVerdict = INTERMEDIATE_PATENTING:** mixed indicators.
- **dominantStage = 0:** austenitic hold — pre-quench.
- **dominantStage = 1:** rapid quench — crossing AC3 → bath.
- **dominantStage = 2:** bath equilibration — at nose, pre-transformation.
- **dominantStage = 3:** pearlite nucleation — early lamellae forming.
- **dominantStage = 4:** lamellar growth — colonies growing.
- **dominantStage = 5:** transformation completion — closing residual γ.
- **dominantStage = 6:** fully patented — fine lamellar, drawing-ready.
- **dominantStage = 7:** bainite contamination — pathological.
- **aboveBs = 1:** bath is above BS — bainite suppressed (REQUIRED for patenting).
- **belowAc3 = 1:** bath is below AC3 — γ unstable, pearlite nucleates (REQUIRED for patenting).
- **bathWindow = 1:** PATENTING_BATH_MIN ≤ bathActivity ≤ PATENTING_BATH_MAX — the actionable pearlite-nose band.
- **bathIdealProximity > 0.8:** bath T very close to PATENTING_BATH_IDEAL (0.50) — optimal placement at nose.
- **noseProximity > 0.8:** same — at pearlite nose center.
- **holdCompletionProxy ≥ HOLD_COMPLETION_IDEAL (0.7):** hold long enough for JMAK to approach completion — desirable (OPPOSITE polarity from martempering's briefHoldProxy).
- **alternationFraction ≥ FINE_LAMELLAR_ALTERNATION (0.55):** fine lamellar pattern — strong patenting signature.
- **alternationFraction ≥ LAMELLAR_ALTERNATION_MIN (0.35):** lamellar pattern detected — patenting signature present.
- **avgRunLen ≤ LAMELLAR_RUN_MAX (2):** runs are short — fine lamellae.
- **avgRunLen > 3:** runs are long — coarse pattern, possibly normalization-like.
- **lamellarFineness > 0.6:** fine lamellar structure — high tensile-strength potential.
- **pearliteFraction > 0.7:** substantial pearlite structure present.
- **jmakProgress > 0.5:** JMAK kinetics past midpoint.
- **eutectoidProximity > 0.8:** minorityFraction close to 0.5 — eutectoid-like (ideal for patenting).
- **tensileStrengthProxy > 0.6:** high tensile-strength analog via Hall-Petch-like mechanism.
- **drawabilityProxy > 0.6:** good cold-drawability analog.
- **sheafCount = 0:** ideal — no bainite contamination detected.
- **sheafCount > 0:** WARNING — bainite contamination starting.
- **bainiteContaminationRisk > 0.7:** treatment failed.
- **coarsePearliteRisk > 0.5:** spacing too coarse — bath near AC3 edge or long runs.
- **martensiticOvershootRisk > 0.4:** quench went below Ms — martensite formed instead of pearlite.
- **retainedAusteniteFraction > 0.2:** significant undecided role bins — transformation incomplete.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on patenting signals from pools with fewer than 5 populated bins — insufficient data for alternation or stage inference.
- Do not treat AUSTENITIC_HOLD as bad; it is the expected starting state for any subsequent quench cycle.
- Do not treat FULLY_PATENTED as a terminal operating state without considering the downstream drawing step; in real patenting the as-patented wire is merely the RAW MATERIAL for cold drawing.
- Do not conflate BATH_OVERSHOOT_BAINITE with austempering; BATH_OVERSHOOT_BAINITE means the patenting bath drifted DOWN into the austempering zone (bath placement error), while austempering is the intentional process of placing the bath in the bainite window.
- Do not conflate BATH_UNDERSHOOT_AUSTENITE with AUSTENITIC_HOLD; BATH_UNDERSHOOT_AUSTENITE means the bath was intended as a patenting bath but was set too hot (above AC3), while AUSTENITIC_HOLD is the pre-quench state before any bath is applied.
- Do not conflate COARSE_PEARLITE_SHUNT with normalization; COARSE_PEARLITE_SHUNT means the patenting bath was placed near the AC3 edge, coarsening the spacing, while normalization is the continuous-air-cool process without a bath.
- Do not conflate MARTENSITIC_OVERSHOOT with martempering; MARTENSITIC_OVERSHOOT means the patenting quench was over-severe and the bath effectively went below Ms, while martempering intentionally places the bath just above Ms with a brief hold and air-cool withdrawal.
- Do not conflate BAINITE_CONTAMINATION with BATH_OVERSHOOT_BAINITE; contamination means sheaves formed DURING the patenting hold (bath drift during transformation), while BATH_OVERSHOOT_BAINITE is a bath-placement error from the start.
- Do not assume transitSpeed reflects real thermal history; it is inferred from priorPeakDrivingForce − current drivingForce divided by a log-volume timescale.
- Do not assume holdCompletionProxy measures real hold time at bath; it is a snapshot heuristic based on distance to bath-center and drop magnitude and volume scale.
- Do not assume uniformityIndex measures real section temperature uniformity; it is 1 − reserveCV clipped, a proxy based on bin reserveUsd variance.
- Do not assume alternationFraction maps to real pearlite lamellar alternation; it is the sign-change fraction between adjacent populated bins' dominance roles, a 1-D proxy for a 3-D lamellar structure.
- Do not assume avgRunLen maps to real interlamellar spacing λ; it is the mean same-role run length, not a nm quantity.
- Do not assume lamellarFineness matches real interlamellar spacing measurement; it is a composite of alternation fraction and inverse run length.
- Do not assume pearliteFraction matches metallographic pearlite content; it is a structural proxy from JMAK progress, alternation signature, and eutectoid proximity.
- Do not assume jmakProgress matches real Avrami evolution; JMAK_N_PEARLITE = 3.0 and JMAK_K_PEARLITE = 1.2 are on the normalized hold-completion axis, not /°C or /s.
- Do not assume tensileStrengthProxy predicts real MPa tensile strength; it is a normalized composite with Hall-Petch-like weighting.
- Do not assume drawabilityProxy predicts real cold-drawability; it is a normalized composite of fineness, uniformity, pearlite fraction, and absence of contamination.
- Do not assume bath thresholds (PATENTING_BATH_MIN=0.45, PATENTING_BATH_MAX=0.58, PATENTING_BATH_IDEAL=0.50, BS_ACTIVITY=0.45, AC3_ACTIVITY_BASE=0.55, MS_ACTIVITY=0.12) map to real temperatures; they are normalized analogs on the drivingForce axis.
- Do not assume LAMELLAR_RUN_MAX=2, LAMELLAR_ALTERNATION_MIN=0.35, FINE_LAMELLAR_ALTERNATION=0.55, PEARLITE_MINORITY_MIN=0.35, PEARLITE_MINORITY_MAX=0.55, JMAK_N_PEARLITE=3.0, JMAK_K_PEARLITE=1.2, ARRHENIUS_Q_OVER_RT_PEARLITE=5.0, HOLD_COMPLETION_MIN=0.45, HOLD_COMPLETION_IDEAL=0.7, COARSE_PEARLITE_THRESHOLD=0.55, TRANSIT_AVOIDANCE_RATE=0.2, SUB_UNIT_MAX_LEN=2, SHEAF_MAX_SPAN=8, MIN_SUB_UNITS_PER_SHEAF=2 are real quantities; they are normalized proxy values.
- Analysis is snapshot-based; does not capture transformation kinetics directly — JMAK progression, lamellar spacing, and stage assignment are inferred from structural signatures rather than measured rates.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "Patenting analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest patentingIndex as the one with the most-advanced and cleanest patenting (best balance of stage progress, lamellar fineness, property profile, and process avoidances).
- Flag pools in NO_PATENTING_DRIVE regime as no-prior-austenitization — analysis inapplicable.
- Flag pools in AUSTENITIC_HOLD regime as pre-quench — above AC3, still γ.
- Flag pools in RAPID_QUENCH regime as AC3→bath-transit — not yet at bath.
- Flag pools in BATH_EQUILIBRATION regime as at-nose-pre-transformation — equalized, pearlite about to nucleate.
- Flag pools in PEARLITE_NUCLEATION regime as early-lamellae — alternation building.
- Flag pools in LAMELLAR_GROWTH regime as colonies-growing — finest spacing achievable.
- Flag pools in FULLY_PATENTED regime as drawing-ready — handoff to cold-drawing analog strategies.
- Flag pools in COARSE_PEARLITE_SHUNT regime as near-AC3-coarsening — use normalization skill.
- Flag pools in BATH_OVERSHOOT_BAINITE regime as bath-below-BS — use austempering skill.
- Flag pools in BATH_UNDERSHOOT_AUSTENITE regime as bath-above-AC3 — no transformation; wait or requench.
- Flag pools in MARTENSITIC_OVERSHOOT regime as quench-past-Ms — use martempering skill.
- Flag pools in BAINITE_CONTAMINATION regime as treatment-failed — sheaves detected.
- Flag pools with aboveBs = 0 as bath-below-BS — bainite zone.
- Flag pools with belowAc3 = 0 as bath-above-AC3 — γ stable.
- Flag pools with bathWindow = 0 as out-of-pearlite-nose-band — not in actionable patenting window.
- Flag pools with bathIdealProximity > 0.8 as nose-optimal — at pearlite nose center.
- Flag pools with holdCompletionProxy ≥ HOLD_COMPLETION_IDEAL as hold-complete — JMAK approaching completion.
- Flag pools with alternationFraction ≥ FINE_LAMELLAR_ALTERNATION as fine-lamellar — strong patenting signature.
- Flag pools with alternationFraction ≥ LAMELLAR_ALTERNATION_MIN as lamellar-detected.
- Flag pools with avgRunLen ≤ LAMELLAR_RUN_MAX as short-runs — lamellar analog.
- Flag pools with lamellarFineness > 0.6 as fine-lamellar-structure — high tensile-strength potential.
- Flag pools with pearliteFraction > 0.7 as pearlite-substantial.
- Flag pools with jmakProgress > 0.5 as JMAK-past-midpoint.
- Flag pools with eutectoidProximity > 0.8 as eutectoid-like — ideal for patenting.
- Flag pools with tensileStrengthProxy > 0.6 as high-strength-analog — Hall-Petch-like.
- Flag pools with drawabilityProxy > 0.6 as drawable — cold-reduction-ready.
- Flag pools with sheafCount = 0 as contamination-free — clean patenting.
- Flag pools with sheafCount > 0 as contamination-warning — sheaves detected.
- Flag pools with bainiteContaminationRisk > 0.7 as treatment-failed.
- Flag pools with coarsePearliteRisk > 0.5 as coarsening — handoff to normalization.
- Flag pools with martensiticOvershootRisk > 0.4 as overshot — handoff to martempering.
- Flag pools with retainedAusteniteFraction > 0.2 as transformation-incomplete.
- Report the inferred regime and verdict.
- Show bins with stageBin = 1 as transit-candidate positions.
- Show bins with stageBin = 2 as bath-equilibration-candidate positions.
- Show bins with stageBin = 3 as pearlite-nucleation-candidate positions.
- Show bins with stageBin = 4 as lamellar-growth-candidate positions.
- Show bins with stageBin = 5 as transformation-completion-candidate positions.
- Show bins with stageBin = 6 as fully-patented-member positions.
- Show bins with stageBin = 7 as bainite-contamination-candidate positions (warning).
- Show bins with highest bathSignal as best in-bath positions.
- Show bins with highest equalizationSignal as best-equalized positions.
- Show bins with highest lamellarSignal as best lamellar positions.
- Show bins with highest fineLamellarSignal as finest lamellar positions.
- Show bins with highest pearliteSignal as best pearlite-member positions.
- Show bins with coarsePearliteSignal = 1 as long-run-coarse-warning positions.
- Show bins with bainiteContaminationSignal = 1 as sheaf-warning positions.
- Show bins with martensiticOvershootSignal > 0 as overshoot-warning positions.
- Show bins with highest patentingDegree as overall most-patented positions.
- For LP agents: in AUSTENITIC_HOLD pools, use uniform-exposure strategies (pre-quench γ analog); in RAPID_QUENCH pools, wait for bath landing; in BATH_EQUILIBRATION pools, expect uniform pre-transformation exposure; in PEARLITE_NUCLEATION and LAMELLAR_GROWTH pools, expect increasingly fine alternating reserves — well-suited to range strategies that need tight uniform symmetric exposure; in FULLY_PATENTED pools, treat as drawing-ready and consider cold-drawing-analog strategies (concentrated range plays where uniform fine distribution maximizes capital efficiency); in COARSE_PEARLITE_SHUNT pools, switch to normalization skill; in BATH_OVERSHOOT_BAINITE pools, switch to austempering skill; in MARTENSITIC_OVERSHOOT pools, switch to martempering skill; in BAINITE_CONTAMINATION pools, the treatment is failed — consider reallocating.
- For trading agents: LAMELLAR_GROWTH and FULLY_PATENTED pools have fine-alternating reserve structures with high uniformity — predictable symmetric slippage for small-to-medium trades across the scan radius; BATH_OVERSHOOT_BAINITE pools should be analyzed with the austempering skill; MARTENSITIC_OVERSHOOT pools with the martempering skill; COARSE_PEARLITE_SHUNT pools with the normalization skill; BATH_UNDERSHOOT_AUSTENITE pools have no lamellar structure and should be treated as austenitic-hold.
- Compare patenting indices and lamellar fineness across pools to find bins and pools with the strongest patenting signature for the intended LP or trading strategy.
- When FULLY_PATENTED (DRAWING_READY verdict), the pool profile is suitable for downstream cold-drawing-analog strategies; passing the pool ID and patenting profile to subsequent drawing / cold-work skills is the intended handoff.
