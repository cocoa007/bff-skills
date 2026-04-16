---
name: hodlmm-bin-pearlite-agent
skill: hodlmm-bin-pearlite
description: "Agent behavior for HODLMM bin pearlitic transformation analysis — interprets pearlite fraction fP, lamellar alignment, interlamellar spacing S, nodule count, dominance-switch count, cooperative growth, Zener-Hillert compliance, sorbite/coarse/troostite morphology scores, equilibrium partitioning, colony coherence, lamellar thickness, carbide analog, and JMAK compliance to identify pools in austenite-stable, incubating-pearlite, coarse-pearlitic, fine-pearlitic, or sorbitic regime and guide LP strategies toward same-role lamellar bands (directional reserve continuity), dominance-switch boundaries (LP asymmetry opportunities), cooperative-growth bins (fee capture in both-phase zones), and nodular colony interiors (consolidated pearlitic liquidity), and to infer transformation mode (coarse or sorbite, troostite, lamellar-dominated, cooperative-growth, nodular-colonies, Zener-Hillert-compliant) from morphology and spacing signatures."
---

# Agent Behavior — HODLMM Bin Pearlitic Transformation

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `pearliteRegime`, `pearliteVerdict`, `pearliteFraction`, `drivingForce`, `noduleCount`, `dominanceSwitchCount`, `avgInterlamellarSpacing`, `avgCooperativeGrowth`, `avgZenerHillertCompliance`, and `avgJmakCompliance`.

## Interpreting output

- **pearliteRegime = AUSTENITE_STABLE:** Driving force below A1 threshold. Smooth gradient, fP ~ 0, no lamellar alternation. Classical gradual LP behavior applies; no pearlitic signature.
- **pearliteRegime = INCUBATING_PEARLITE:** fP < 0.2, early nucleation before nodules form. Incubation regime — monitor for nodule formation and dominance switches.
- **pearliteRegime = COARSE_PEARLITIC:** 0.2 ≤ fP < 0.5, thick lamellae from low-ΔT (slow-cooling analog). LP positions within same-role bands have directional reserve continuity; dominance-switch boundaries are LP asymmetry opportunities.
- **pearliteRegime = FINE_PEARLITIC:** 0.5 ≤ fP < 0.75, moderate lamellar thickness. Tight switching gives frequent reserve-direction changes — dynamic LP strategies can exploit alternation.
- **pearliteRegime = SORBITIC:** fP ≥ 0.75, very fine lamellae from high ΔT. Near-bainite boundary — LP positions should favor cooperative-growth bins for fee capture.
- **pearliteVerdict = NODULAR_COLONIES:** ≥2 nodules with high colony coherence. Multiple lamellar colonies coexist — LP in colony interiors captures consolidated pearlitic liquidity.
- **pearliteVerdict = LAMELLAR_DOMINATED:** High lamellar alignment + ≥2 dominance switches. Regular alternation is the dominant morphology. LP strategies can alternate between X-dominant and Y-dominant bands.
- **pearliteVerdict = COOPERATIVE_GROWTH:** High cooperativeGrowth + ≥2 switches. Both-phase presence is substantial — fee capture is maximized at bins with both reserveX and reserveY.
- **pearliteVerdict = EQUILIBRIUM_PARTITIONED:** Clean dominance with low cooperative-growth. Pure-phase bins dominate — directional LP strategies outperform balanced ones.
- **pearliteVerdict = ZENER_HILLERT_COMPLIANT:** ZH compliance > 0.55 with ≥2 switches. Observed spacing tracks C/ΔT — classical pearlitic kinetics. Spacing predictions are reliable.
- **pearliteVerdict = SORBITE_MORPHOLOGY:** avgSorbiteScore ≥ 0.55 and exceeds coarse by 0.1. Very fine lamellae from high driving force.
- **pearliteVerdict = COARSE_PEARLITE_MORPHOLOGY:** avgCoarsePearliteScore ≥ 0.55 and exceeds sorbite by 0.1. Thick lamellae from low driving force.
- **pearliteVerdict = TROOSTITE_REGIME:** troostite > 0.55 with driving force > 0.7. Extreme-fine near-bainite regime — lamellar structure is nearly discontinuous.
- **pearliteVerdict = SUB_EUTECTOID_STABLE:** fP < 0.2. Transformation not triggered; austenite phase stable.
- **pearliteVerdict = HYPEREUTECTOID_SKEW:** Pool reserveX vs reserveY skew > 0.35. Proeutectoid-cementite analog — one token dominates pool reserves.
- **pearliteVerdict = NO_PEARLITIC_DRIVE:** Driving force < 0.15. Insufficient undercooling below A1.
- **pearliteVerdict = INTERMEDIATE_PEARLITIC:** No extreme indicators. Typical mid-state.
- **pearliteFraction > 0.8:** Near-complete pearlitic transformation; austenite-parent almost depleted.
- **pearliteFraction < 0.2:** Austenite stable; transformation not triggered or in incubation.
- **drivingForce > 0.7:** Strong thermodynamic drive — pool has experienced heavy recent turnover relative to TVL (deep below A1).
- **drivingForce < 0.2:** Weak drive — recent turnover low or TVL high (near A1, minimal undercooling).
- **noduleCount ≥ 2:** Multiple lamellar colonies coexist — site-saturated nucleation analog.
- **dominanceSwitchCount ≥ 3:** Multiple alternations along the populated span — regular lamellar structure.
- **avgInterlamellarSpacing < 0.2:** Very fine lamellae — sorbite/troostite regime.
- **avgInterlamellarSpacing > 0.5:** Coarse lamellae — low-driving-force regime.
- **avgCooperativeGrowth > 0.5:** Both-phase presence dominant — classical eutectoid cooperative signature.
- **avgZenerHillertCompliance > 0.6:** Observed S matches C/ΔT prediction for the driving force — classical pearlitic kinetics.
- **avgZenerHillertCompliance < 0.3:** Deviation from Zener-Hillert — non-classical transformation (branching, divergent lamellae, alloy effects).
- **avgJmakCompliance > 0.6:** Observed fP matches 1 - exp(-k·t^n) for the driving force.
- **avgColonyCoherence > 0.6:** High-coherence colony structure — internally adjacent nodules.
- **avgSorbiteScore > avgCoarsePearliteScore + 0.2:** Sorbite dominant — very fine morphology.
- **avgCoarsePearliteScore > avgSorbiteScore + 0.2:** Coarse pearlite dominant — thick-lamellae morphology.
- **hypereutectoidSkew > 0.3 or < -0.3:** Pool-level reserve composition strongly skewed — one token dominates.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on pearlite signals from pools with fewer than 5 populated bins — insufficient data for pattern inference.
- Do not treat SORBITIC as universally undesirable; a sorbitic pool is fine-lamellar and fee-rich even if near the bainite boundary.
- Do not assume AUSTENITE_STABLE pools will remain sub-A1; a single large event can rapidly push through A1 (pearlite-start).
- Do not treat the pearlite fraction fP as a rigorous measured value — it is inferred from snapshot pattern features, not measured by diffraction or metallography.
- Do not assume Zener-Hillert's model quantitatively applies to DLMM bins — the model is a macroscopic empirical fit for real pearlitic steels with alloy-specific constants.
- Do not conflate nodule count with crystallographic colonies — here it is connected-cluster count + dominance-switch heuristic in 1-D bin space, not actual crystallographically aligned lamellar groups.
- Do not assume colony coherence measures a real orientation relationship; it is adjacent-pair fraction, a proxy.
- Do not assume interlamellar spacing S is measured in length units; it is bin-gap distance between dominance switches, a dimensionless proxy.
- Do not conflate cooperative growth with real γ/α and γ/Fe3C interface dynamics; here it is min(reserveX, reserveY)/total, a snapshot proxy.
- Do not assume equilibrium partitioning matches real ferrite (~0.02 wt% C) and cementite (6.67 wt% C) compositions; here it is reserve dominance clarity, a proxy.
- Do not conflate coarse/fine/sorbite/troostite classification with metallurgical definitions — here based on driving force + bin-spacing heuristics, not measured lamellar spacing.
- Do not assume JMAK exponent n = 2 applies universally; real pearlite nucleation shows n ~ 3-4 depending on continuous-vs-site-saturated nucleation.
- Do not treat carbide analog as rigorously measured; it is X-dominant signature, not a cementite phase.
- Do not conflate DLMM bin population transformation with 3-D crystallographic pearlitic transformation; the analogy is heuristic.
- Do not ignore asymmetric reserves (reserveX vs reserveY) — here they drive the dominance role and cooperative growth proxies but do not correspond to real atomic composition.
- Analysis is snapshot-based; does not capture time-evolution of transformation — JMAK kinetics, growth velocity, and lamellar selection inferred from current pattern rather than measured.
- Driving force is inferred from 24h volume/TVL turnover — a proxy for undercooling below A1, not a measured thermodynamic quantity.
- Zener-Hillert compliance at a snapshot does not guarantee forward kinetic compliance; a pool showing good fit now may deviate over time.
- DOMINANCE_MARGIN fixed at 0.15; real phase-dominance boundaries in pearlite are crystallographically defined, not reserve-ratio based.
- ZENER_HILLERT_C fixed at 0.9 as a normalized proxy; real C is alloy-specific.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "Pearlite analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest pearlite index as the one with the strongest pearlitic transformation signature (high fP with regular alternation, high nodule count, strong Zener-Hillert compliance, high JMAK compliance).
- Flag pools in COARSE_PEARLITIC regime as showing thick lamellae — LP in same-role bands captures directional reserve continuity; dominance-switch boundaries are LP asymmetry opportunities.
- Flag pools in FINE_PEARLITIC regime as showing moderate lamellar thickness — tight switching gives frequent reserve-direction changes for dynamic LP strategies.
- Flag pools in SORBITIC regime as showing very fine lamellae — near-bainite boundary, LP positions should favor cooperative-growth bins.
- Flag pools in INCUBATING_PEARLITE regime as in nucleation — monitor for nodule formation; do not yet treat as pearlitic.
- Flag pools in AUSTENITE_STABLE regime as smooth-gradient — classical LP behavior applies.
- Flag pools with nodule count ≥ 2 and colony coherence > 0.5 as nodular — LP positions in colony interiors consolidate pearlitic liquidity.
- Flag pools with dominance-switch count ≥ 3 and lamellar alignment > 0.5 as lamellar-dominated — LP strategies can alternate between X-dominant and Y-dominant bands.
- Flag pools with cooperative growth > 0.5 as having strong both-phase presence — fee capture maximized at cooperative bins.
- Flag pools with Zener-Hillert compliance > 0.55 as showing classical ZH kinetics — spacing predictions are reliable.
- Report the inferred morphology (COARSE, FINE, SORBITE, or TROOSTITE) to characterize lamellar fineness.
- Show bins with highest pearlite fraction as the ones most advanced in the pearlitic product phase.
- Show bins with highest lamellar alignment as the anchors of alternating-role structure.
- Show bins with highest nodule membership as the lamellar colony members.
- Show bins with highest cooperative growth as the both-phase bins (eutectoid cooperative signature).
- Show bins with highest Zener-Hillert compliance as the classical-kinetics conformers.
- Show bins with highest sorbite score as the very-fine-lamellae positions.
- Show bins with highest coarse-pearlite score as the thick-lamellae positions.
- Show bins with highest troostite score as the extreme-fine (near-bainite) positions.
- Show bins with highest equilibrium partitioning as the clean-phase pure-dominance positions.
- Show bins with highest colony coherence as the spatially continuous colony members.
- Show bins with highest lamellar thickness as the thick same-role plate positions.
- Show bins with highest carbide analog as the cementite-rich (X-heavy) positions.
- Show bins with highest JMAK compliance as the classical-nucleation conformers.
- For LP agents: in AUSTENITE_STABLE pools, classical LP behavior applies — use standard concentration strategies. In INCUBATING_PEARLITE pools, wait for nodule formation. In COARSE_PEARLITIC pools, position in same-role bands (directional continuity) or at dominance-switch boundaries (asymmetry exploit). In FINE_PEARLITIC pools, use dynamic rebalancing across tight switches. In SORBITIC pools, favor cooperative-growth bins for both-phase fee capture.
- For trading agents: AUSTENITE_STABLE pools have smooth liquidity — predictable slippage. INCUBATING_PEARLITE pools have early nucleation — moderate slippage with monitoring needed. COARSE_PEARLITIC pools have thick same-role bands with infrequent dominance switches — directional slippage asymmetry. FINE_PEARLITIC pools have moderate alternation — balanced slippage with switching cost. SORBITIC pools have very fine alternation — minimal slippage asymmetry but tight execution windows.
- Compare pearlite indices and driving forces across pools to find bins and pools with the strongest pearlitic signature for the intended LP or trading strategy.
