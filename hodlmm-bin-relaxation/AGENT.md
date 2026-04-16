---
name: hodlmm-bin-relaxation-agent
skill: hodlmm-bin-relaxation
description: "Agent behavior for HODLMM bin stress relaxation analysis — interprets stress relaxed, relaxation rate, relaxation time, Deborah number, storage modulus, loss modulus, loss tangent, relaxation modulus, viscosity, KWW exponent, alpha relaxation, beta relaxation, anelastic strain, residual stress, and relaxation spectrum to identify bins with the most effective stress dissipation and guide LP strategies across different viscoelastic regimes."
---

# Agent Behavior — HODLMM Bin Relaxation

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `relaxationRegime`, `relaxationVerdict`, `avgStressRelaxed`, `avgDeborahNumber`, `avgResidualStress`, `avgKwwExponent`, and `rigidFraction`.

## Interpreting output

- **relaxationRegime = FLUID:** Bins operate in the viscous-dominated regime with Deborah number much less than 1 where stress relaxes faster than the observation timescale. Imbalance dissipates rapidly through active arbitrage. The ideal dynamic state where bins continuously return to equilibrium without accumulating persistent stress. Best for dynamic LP strategies with frequent rebalancing.
- **relaxationRegime = VISCOUS:** Bins exhibit strong viscous character with rapid stress decay. Loss modulus dominates over storage modulus. Energy dissipated efficiently through trading activity. Healthy flowing pool with quick imbalance correction. Good for LP with steady rebalancing expected.
- **relaxationRegime = VISCOELASTIC:** Bins show balanced viscoelastic character with comparable storage and loss moduli. Deborah number near 1 where relaxation time matches observation timescale. Mixed elastic storage and viscous dissipation. Typical operating regime for actively traded pools. Stable for most LP strategies.
- **relaxationRegime = TRANSITIONING:** Bins are in transition between elastic and viscous regimes with long relaxation times and incomplete stress decay. Moderate residual stress accumulating. Pool approaching stagnation with degrading relaxation efficiency. Monitor for further drift toward rigid regime.
- **relaxationRegime = RIGID:** Bins operate in the elastic-dominated regime with Deborah number much greater than 1 where stress persists essentially unchanged over the observation timescale. Accumulated imbalance locks in as semi-permanent residual stress. The worst regime characteristic of illiquid pools with no dissipative arbitrage. Avoid for dynamic LP strategies.
- **relaxationVerdict = NO_RELAXATION:** High Deborah number with minimal stress decay. Bins are in the elastic regime where accumulated stress does not dissipate on observation timescale. Optimal only for pools with no imbalance, catastrophic for pools that have accumulated strain because stress is locked in indefinitely.
- **relaxationVerdict = SLOW_RELAXATION:** Long relaxation time with incomplete stress decay. Bins dissipate stress gradually over extended timescales but have not yet reached equilibrium. Transitional state requiring extended observation to complete relaxation.
- **relaxationVerdict = EXPONENTIAL_DECAY:** High KWW exponent near 1 with significant stress relaxed. Bins follow classical single-exponential Debye relaxation indicating homogeneous structural environment. Predictable decay kinetics with well-defined characteristic time.
- **relaxationVerdict = STRETCHED_EXPONENTIAL:** Broad relaxation spectrum with low KWW exponent and active relaxation. Bins exhibit KWW stretched exponential kinetics indicating heterogeneous structural environments with distribution of relaxation times. Characteristic of complex pool microstructures.
- **relaxationVerdict = FULLY_RELAXED:** High stress relaxed with low residual stress. Bins have essentially completed relaxation with stress approaching equilibrium value. Optimal post-relaxation state where imbalance has dissipated.
- **relaxationVerdict = RELAXATION_BALANCE:** Balanced relaxation state with no extreme indicators. Bins operate in typical viscoelastic regime with moderate relaxation progress and no critical kinetic signatures. Default healthy state for pools under varying trading conditions.
- **avgStressRelaxed > 0.7:** Substantial stress decay. Bins have largely returned to equilibrium with minimal retained imbalance.
- **avgStressRelaxed < 0.2:** Minimal stress decay. Bins retain accumulated imbalance with little dissipation.
- **avgRelaxationRate > 0.6:** Rapid stress dissipation. Short characteristic time with active arbitrage.
- **avgRelaxationRate < 0.2:** Slow stress dissipation. Long characteristic time with stagnant liquidity.
- **avgRelaxationTime > 0.6:** Slow relaxation over long timescales. Bins exhibit extended memory of stress history.
- **avgRelaxationTime < 0.2:** Fast relaxation over short timescales. Bins rapidly forget stress history.
- **avgDeborahNumber > 0.7:** Elastic-dominated regime. Stress persists on observation timescale.
- **avgDeborahNumber < 0.3:** Viscous-dominated regime. Stress relaxes within observation window.
- **avgStorageModulus > 0.6:** Strong elastic restoring response. Energy stored reversibly rather than dissipated.
- **avgLossModulus > 0.6:** Strong dissipation via trading arbitrage. Energy converted to realized fees.
- **avgLossTangent > 0.7:** Viscous-dominated dissipative behavior. Typical of active pools with continuous arbitrage.
- **avgLossTangent < 0.3:** Elastic-dominated storage behavior. Typical of illiquid pools storing stress.
- **avgRelaxationModulus > 0.7:** Stress remains largely intact. Little decay has occurred.
- **avgRelaxationModulus < 0.3:** Stress has substantially decayed. Approaching equilibrium modulus.
- **avgKwwExponent > 0.7:** Single Debye exponential. Homogeneous structural environment.
- **avgKwwExponent < 0.4:** Broad relaxation spectrum. Heterogeneous structural environments.
- **avgAlphaRelaxation > 0.5:** Active cooperative segmental motion. Dominant structural relaxation.
- **avgBetaRelaxation > 0.5:** Active localized motion. Small-scale relaxation dominant.
- **avgAnelasticStrain > 0.5:** Significant recoverable time-dependent deformation. Anelasticity is active.
- **avgResidualStress > 0.6:** Significant permanent stress. Never fully decays, locked-in imbalance.
- **avgResidualStress < 0.2:** Stress fully dissipates toward zero equilibrium.
- **avgRelaxationSpectrum > 0.6:** Many coexisting relaxation timescales. Structural heterogeneity.
- **rigidFraction > 0.3:** Widespread elastic behavior across bins. Pool is stagnating with locked-in stress.
- **fluidFraction > 0.5:** Majority of bins in viscous regime. Pool is dynamic with active arbitrage.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on relaxation signals from pools with fewer than 5 populated bins — insufficient data for meaningful viscoelastic characterization.
- Do not assume FLUID means "best pool." FLUID means bins dissipate stress rapidly, but this is only beneficial if the pool has sufficient trading activity to sustain the arbitrage that drives dissipation. A low-TVL FLUID classification may indicate noise, not genuine viscous behavior.
- Do not assume high stress relaxed always means healthy equilibrium. Stress relaxed measures fraction of decay; if residual stress is also high, the bin has relaxed toward a non-zero equilibrium with locked-in permanent imbalance.
- Do not confuse relaxation with creep. Relaxation is stress decay under held strain (reversible anelastic or irreversible viscous flow); creep is strain growth under held stress (often permanent plastic deformation). The phenomena are dual but not equivalent.
- Do not assume high Deborah number is always bad. High Deborah with no imbalance is fine — bins remain stable in elastic regime. High Deborah with significant strain is catastrophic — stress locks in indefinitely.
- Do not conflate loss modulus with loss tangent. Loss modulus E'' is absolute dissipation magnitude; loss tangent tan(delta) = E''/E' is relative dissipation. A pool can have high E'' and still be elastic-dominated if E' is much higher.
- Do not assume KWW exponent directly maps to physical relaxation mechanism. Beta captures spectrum breadth, but the specific relaxation modes (alpha, beta, Johari-Goldstein) require separate temperature-dependent analysis not available in snapshot.
- Relaxation analysis is a snapshot. Viscoelastic state evolves with continued trading — bins in TRANSITIONING can shift toward FLUID under increased activity or toward RIGID under stagnation. Monitor periodically.
- Maxwell model and generalized Maxwell Prony series are linear viscoelasticity approximations; large imbalances may enter nonlinear regime where these simple models break down.
- The Deborah number requires an explicit observation timescale; the model's normalized dimensionless De is a qualitative indicator rather than a quantitative ratio.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "relaxation analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest relaxation index as the most effective at dissipating accumulated stress — the most favorable combination of fast decay, low residual stress, and well-defined exponential kinetics.
- Flag bins with highest stress relaxed as the most dynamically responsive — where accumulated imbalance has largely dissipated through active arbitrage.
- Highlight bins with highest relaxation rate as the fastest dissipators — short characteristic times with rapid stress decay.
- Show bins with lowest residual stress as the cleanest relaxers — stress decays toward zero equilibrium with no locked-in permanent component.
- Show bins with highest Deborah number as the most elastic — stress persists over observation timescale and imbalance accumulates.
- For LP agents: in FLUID pools, position broadly across active bins — stress dissipates rapidly through arbitrage, imbalance is temporary. In VISCOUS pools, focus on bins with highest loss tangent — strong viscous dissipation with predictable kinetics. In VISCOELASTIC pools, prefer bins with balanced storage and loss moduli — mixed regime with both elastic storage and viscous dissipation. In TRANSITIONING pools, reduce exposure to bins with high residual stress — locked-in imbalance degrades LP economics. In RIGID pools, avoid LP exposure — stress persists indefinitely with no dissipative mechanism.
- For trading agents: FLUID pools have rapid stress decay — prices snap back to equilibrium quickly after large trades, imbalance is transient. VISCOUS pools show strong dissipation — trading energy converts efficiently to fees. VISCOELASTIC pools have mixed response — partial elastic rebound and partial dissipation. TRANSITIONING pools have delayed relaxation — imbalance persists longer than expected. RIGID pools lock in imbalance — avoid directional trades that create persistent stress.
- Compare relaxation indices across pools to find bin lattices with the most effective stress dissipation for the intended LP or trading strategy.
