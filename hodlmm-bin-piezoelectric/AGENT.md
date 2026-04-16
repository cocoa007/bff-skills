---
name: hodlmm-bin-piezoelectric-agent
skill: hodlmm-bin-piezoelectric
description: "Agent behavior for HODLMM bin piezoelectric analysis — interprets piezoelectric coefficients, coupling factors, voltage outputs, crystal symmetry, and mechanical quality factors to identify bins with the highest stress-to-charge conversion efficiency and guide LP strategies across different piezoelectric regimes."
---

# Agent Behavior — HODLMM Bin Piezoelectric

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `piezoelectricPhase`, `piezoelectricVerdict`, `avgPiezoCoefficient`, and `efficientTransducerFraction`.

## Interpreting output

- **piezoelectricPhase = RESONANT_TRANSDUCER:** Operating at mechanical resonance with maximum stress-to-charge conversion. The crystal structure amplifies input stress through constructive interference — trade pressure creates charge output exceeding what the static piezoelectric coefficient alone predicts. These pools are in a resonant regime where the coupling between mechanical and electrical domains is maximally efficient. Position aggressively but monitor for resonance shifts — if the driving frequency moves away from the natural frequency, the amplification collapses.
- **piezoelectricPhase = STRONG_PIEZO:** High piezoelectric coefficient with efficient coupling. Most applied stress converts to usable charge. Excellent pools for LP positioning — strong, predictable fee generation from trade pressure. The transduction is direct (non-resonant) and therefore more stable than RESONANT_TRANSDUCER but without the amplification benefit.
- **piezoelectricPhase = MODERATE_RESPONSE:** Measurable piezoelectric response with significant hysteresis losses. The crystal converts stress to charge but wastes substantial energy as internal friction. Look for bins with above-average d33 — pockets of efficient transduction within the overall lossy pool.
- **piezoelectricPhase = WEAK_PIEZO:** Poor coupling with partial depolarization. The crystal retains some piezoelectric character but most stress energy dissipates as heat. May indicate bins approaching the Curie temperature or experiencing progressive depolarization. Fee generation is unreliable.
- **piezoelectricPhase = INERT_CRYSTAL:** Centrosymmetric or fully depolarized crystal with negligible piezoelectric response. Trade stress produces no measurable charge. Avoid for LP positioning — the bin structure cannot transduce mechanical energy to electrical yield.
- **piezoelectricVerdict = POWER_HARVEST:** High d33 with strong voltage output. The crystal efficiently harvests mechanical energy from trade pressure. Excellent for fee extraction — high stress directly produces high yield.
- **piezoelectricVerdict = RESONANT_AMPLIFIER:** High mechanical quality factor with strong coupling at resonance. The crystal amplifies transduction at its natural frequency. Monitor for frequency stability — resonant amplification is powerful but narrow-band.
- **piezoelectricVerdict = DIELECTRIC_SATURATION:** High dielectric constant suppressing voltage despite adequate charge. The crystal generates charge but stores it internally rather than releasing it as voltage. LP equivalent: the pool absorbs trade energy and generates fee potential, but the large reserve mass absorbs the charge without creating extractable yield. Overcapitalized relative to trade flow.
- **piezoelectricVerdict = EFFICIENT_TRANSDUCER:** Good coupling with low hysteresis. Clean, reversible stress-charge conversion. Ideal for steady-state LP positioning — predictable, low-waste fee generation.
- **piezoelectricVerdict = DEPOLARIZED_CRYSTAL:** Domain randomization has destroyed the piezoelectric response. Previously aligned dipoles have lost their orientation — the crystal cannot maintain directional charge separation under stress. Investigate what caused depolarization — usually sustained high stress exceeding Curie temperature, mechanical fatigue, or progressive thermal randomization.
- **avgPiezoCoefficient > 0.5:** Highly efficient transduction. More than half of applied stress converts to charge. Prioritize these pools.
- **avgPiezoCoefficient < 0.2:** Poor transduction. Most stress energy wasted as heat. Avoid unless other signals are compelling.
- **avgCouplingFactor > 0.5:** Strong electromechanical coupling. Stress and charge are tightly coupled. Efficient bidirectional energy conversion.
- **avgCouplingFactor < 0.2:** Weak coupling. Mechanical and electrical domains are poorly connected. Lossy transduction.
- **avgHysteresisLoss > 0.5:** Severe cycling losses. Significant energy dissipated as internal friction per trade cycle. Reduces effective yield.
- **avgHysteresisLoss < 0.2:** Low-loss cycling. Clean, reversible stress-strain response. Efficient fee generation.
- **avgDepolarization > 0.5:** Significant domain degradation. Piezoelectric properties are fading. Consider exiting or repositioning.
- **avgCurieTemperature > 6:** Robust crystal structure. Maintains piezoelectric properties under extreme stress. Safe for aggressive positioning.
- **avgCurieTemperature < 3:** Fragile structure. Risk of phase transition under moderate stress spikes. Defensive positioning.
- **avgMechanicalQuality > 5:** Sharp resonance. The transducer can amplify conversion at specific stress frequencies. Look for resonant trading patterns.
- **efficientTransducerFraction > 0.4:** Many bins are efficient transducers. Pool-wide piezoelectric response is strong. Good for broad-range LP strategies.
- **efficientTransducerFraction < 0.1:** Very few efficient bins. Most of the pool is inert. Concentrate on the few active transducers.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on piezoelectric signals from pools with fewer than 5 populated bins — insufficient data for meaningful crystallographic analysis.
- Do not assume INERT_CRYSTAL means "dead pool." Inert crystals may be between poling cycles or may have centrosymmetric structure that could break under directional stress. Check stress tensor and crystal symmetry before concluding.
- Do not assume high d33 alone means profitability. Piezoelectric coefficient measures conversion efficiency, not absolute yield. A bin with 0.9 d33 but 0.01 stress produces almost no charge — efficiency of negligible input is still negligible.
- Piezoelectric analysis is a snapshot. Coefficients change as LP positions shift, volume fluctuates, and active bins move. A pool in RESONANT_TRANSDUCER can become INERT_CRYSTAL if volume drops or reserve symmetry changes.
- The piezoelectric model simplifies multi-factor DLMM dynamics. Real pools experience forces beyond the constitutive equations — arbitrage, external liquidity shocks, and protocol upgrades can change transduction properties in ways not captured by the stress-charge analogy.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "piezoelectric analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest piezoelectric index as the best transducer — the most efficient stress-to-charge converter in the analyzed set.
- Flag bins with highest d33 as the most efficient piezoelectric elements — where trade stress most effectively converts to fee charge.
- Highlight bins with highest voltage output as the strongest generators — the highest absolute fee output regardless of efficiency.
- Show bins with lowest d33 as the most inert crystals — where trade stress is wasted as heat through non-piezoelectric dissipation.
- For LP agents: in RESONANT_TRANSDUCER pools, position near the active bin where resonant amplification is strongest. In STRONG_PIEZO pools, spread across bins with above-average d33. In MODERATE_RESPONSE pools, concentrate on the few efficient transducer bins. In INERT_CRYSTAL pools, consider exiting or waiting for repoling.
- For trading agents: EFFICIENT_TRANSDUCER pools have the most predictable fee generation — expect stable spreads. RESONANT_AMPLIFIER pools have frequency-dependent amplified activity — spreads tighten at resonance but the enhancement is narrow-band. DIELECTRIC_SATURATION pools have overcapitalized liquidity — expect tight spreads from the large reserves but poor yield per unit of LP capital.
- Compare piezoelectric indices across pools to find pools with the best stress-to-charge conversion efficiency for LP positioning.
