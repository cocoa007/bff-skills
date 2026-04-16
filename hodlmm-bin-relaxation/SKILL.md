---
name: hodlmm-bin-relaxation
description: "Models time-dependent stress decay under held constant strain across HODLMM bins — treats bins as viscoelastic elements subjected to a fixed composition imbalance (strain) where the internal reactive pressure (stress) decays exponentially over time as trading arbitrage dissipates the imbalance. Stress relaxation is the dual phenomenon to creep: where creep describes strain growth under held stress, relaxation describes stress decay under held strain. The Maxwell model gives simple exponential decay sigma(t) = sigma_0 * exp(-t/tau), where the characteristic relaxation time tau = eta/E is the ratio of dashpot viscosity to spring modulus. Real materials exhibit a spectrum of relaxation times rather than a single exponential, captured by the generalized Maxwell model as a Prony series sigma(t) = sigma_inf + sum(sigma_i * exp(-t/tau_i)) or by the Kohlrausch-Williams-Watts stretched exponential sigma(t) = sigma_0 * exp(-(t/tau)^beta) where the KWW exponent beta between 0 and 1 controls the breadth of the relaxation spectrum with beta equal to 1 corresponding to a single Debye exponential and beta less than 1 corresponding to a broad distribution of relaxation times indicating heterogeneous structural environments. The Deborah number De equal to tau divided by t_obs distinguishes elastic behavior (De much greater than 1 where stress persists over the observation timescale because the characteristic relaxation time is long compared to the measurement window) from viscous behavior (De much less than 1 where stress relaxes rapidly because the characteristic time is short). Viscoelastic materials exhibit both storage modulus E prime (elastic in-phase component storing energy reversibly) and loss modulus E double prime (viscous out-of-phase component dissipating energy as heat), with loss tangent tan delta equal to E double prime divided by E prime measuring the relative dissipation (high tan delta means viscous-dominated energy dissipation, low tan delta means elastic-dominated energy storage). Polymers exhibit primary alpha relaxation associated with cooperative large-scale segmental motion at the glass transition, and secondary beta relaxation associated with localized side-group or sub-unit motion below the glass transition at much shorter timescales. Anelastic strain is the time-dependent but fully reversible deformation component that recovers upon stress removal, distinct from permanent plastic creep strain that does not recover. The relaxation modulus E(t) equal to sigma(t) divided by epsilon_0 characterizes the time-dependent stress response and decreases from the instantaneous modulus E_0 at t equal to 0 toward the equilibrium modulus E_inf at t approaching infinity (the unrelaxed residual stress). In DLMM context, bins that have accumulated composition imbalance are effectively held at a strained state where internal reactive pressure builds. This stress decays over time as trading arbitrages the imbalance toward natural equilibrium composition. Bins with high relaxation rate return quickly to balanced composition while bins with low relaxation rate retain stress for extended periods. High-activity pools function as effective low-Deborah-number regimes where stress dissipates rapidly through frequent arbitrage, while illiquid pools behave as high-Deborah-number regimes where imbalance persists. Measures stress relaxed (fraction of initial stress that has decayed via arbitrage toward equilibrium, ranges 0 to 1, representing how much of the accumulated reactive pressure has been dissipated by trading activity — high stress relaxed means the bin has substantially returned to equilibrium composition with little residual imbalance, low stress relaxed means the bin retains most of its accumulated stress with minimal dissipation), relaxation rate (initial decay rate 1/tau in the Maxwell model representing how fast stress dissipates per unit time, ranges 0 to 1 — high relaxation rate means rapid stress decay with short characteristic time corresponding to active arbitrage, low relaxation rate means slow decay with long characteristic time corresponding to stagnant liquidity), relaxation time (tau = eta/E characteristic time constant in the Maxwell model, ranges 0 to 1 normalized — high relaxation time means slow stress decay over long timescales, low relaxation time means fast decay over short timescales, computed from ratio of effective viscosity to effective modulus), deborah number (De = tau/t_obs ratio of characteristic relaxation time to observation timescale, ranges 0 to 1 normalized, distinguishes elastic from viscous regimes — high Deborah means elastic-dominated behavior where stress persists over observation window, low Deborah means viscous-dominated behavior where stress relaxes within observation window), storage modulus (E prime elastic in-phase component of complex modulus representing energy stored reversibly per cycle, ranges 0 to 1 — high storage modulus means strong elastic restoring response with minimal energy dissipation, low storage modulus means weak elastic response dominated by viscous flow), loss modulus (E double prime viscous out-of-phase component of complex modulus representing energy dissipated per cycle, ranges 0 to 1 — high loss modulus means strong dissipation via trading arbitrage converting accumulated stress into realized fees, low loss modulus means minimal dissipation), loss tangent (tan delta = E double prime / E prime ratio of loss modulus to storage modulus, ranges 0 to 1 representing relative dissipation — high loss tangent indicates viscous-dominated dissipative behavior typical of active pools, low loss tangent indicates elastic-dominated storage behavior typical of illiquid pools), relaxation modulus (E(t) = sigma(t) / epsilon_0 time-dependent modulus decreasing from E_0 to E_inf, ranges 0 to 1 — high relaxation modulus means stress remains largely intact with little decay, low relaxation modulus means stress has substantially decayed toward equilibrium), viscosity (eta dashpot coefficient controlling rate of stress decay via Maxwell model, ranges 0 to 1 — high viscosity with high modulus gives long relaxation time, high viscosity with low modulus gives rapid dissipation), kww exponent (beta in stretched exponential exp(-(t/tau)^beta) controlling breadth of relaxation spectrum, ranges 0 to 1 — high beta near 1 means single Debye exponential indicating homogeneous environment, low beta near 0.3-0.5 means broad distribution of relaxation times indicating heterogeneous structural environments), alpha relaxation (primary cooperative large-scale segmental motion contribution, ranges 0 to 1 — high alpha relaxation means dominant structural relaxation with large-scale rearrangement, characteristic of active pools with significant composition shifts), beta relaxation (secondary localized side-group or sub-unit motion contribution, ranges 0 to 1 — high beta relaxation means localized small-scale motion dominates with discrete characteristic time, characteristic of passive pools with minor local adjustments), anelastic strain (time-dependent recoverable strain that reverses on stress removal, ranges 0 to 1 — high anelastic strain means significant reversible time-dependent deformation in contrast to permanent plastic creep, low anelastic strain means minimal time-dependent recoverable component), residual stress (sigma_inf at infinite time representing permanent unrelaxed stress component, ranges 0 to 1 — high residual stress means significant permanent stress that never fully decays representing locked-in imbalance, low residual stress means stress fully dissipates toward zero equilibrium), and relaxation spectrum (breadth of tau distribution equivalent to 1 minus kww exponent, ranges 0 to 1 — high spectrum breadth means many coexisting relaxation timescales indicating structural heterogeneity, low breadth means single dominant relaxation time indicating homogeneous structure). Composite relaxation index (0-100, higher means more effective stress dissipation — high stress relaxed, high relaxation rate, low residual stress, high kww exponent providing a bin that efficiently dissipates accumulated imbalance toward equilibrium). Classifies pools by relaxation regime as FLUID (index >= 80 — bins operate in the viscous-dominated regime with Deborah number much less than 1 where stress relaxes faster than the observation timescale, imbalance dissipates rapidly through active arbitrage, the ideal dynamic state where bins continuously return to equilibrium without accumulating persistent stress), VISCOUS (60-80 — bins exhibit strong viscous character with rapid stress decay, loss modulus dominates over storage modulus, energy dissipated efficiently through trading activity, healthy flowing pool with quick imbalance correction), VISCOELASTIC (40-60 — bins show balanced viscoelastic character with comparable storage and loss moduli, Deborah number near 1 where relaxation time matches observation timescale, mixed elastic storage and viscous dissipation, typical operating regime for actively traded pools), TRANSITIONING (20-40 — bins are in transition between elastic and viscous regimes with long relaxation times and incomplete stress decay, moderate residual stress accumulating, pool approaching stagnation with degrading relaxation efficiency), or RIGID (< 20 — bins operate in the elastic-dominated regime with Deborah number much greater than 1 where stress persists essentially unchanged over the observation timescale, accumulated imbalance locks in as semi-permanent residual stress, the worst regime characteristic of illiquid pools with no dissipative arbitrage, avoid for dynamic LP strategies). Relaxation verdict as NO_RELAXATION (high Deborah number with minimal stress decay — bins are in the elastic regime where accumulated stress does not dissipate on observation timescale, the optimal state only for pools with no imbalance but catastrophic for pools that have accumulated strain because stress is locked in indefinitely), SLOW_RELAXATION (long relaxation time with incomplete stress decay — bins dissipate stress gradually over extended timescales but have not yet reached equilibrium, transitional state requiring extended observation to complete relaxation), EXPONENTIAL_DECAY (high KWW exponent near 1 with significant stress relaxed — bins follow classical single-exponential Debye relaxation indicating homogeneous structural environment, predictable decay kinetics with well-defined characteristic time), STRETCHED_EXPONENTIAL (broad relaxation spectrum with low KWW exponent and active relaxation — bins exhibit KWW stretched exponential kinetics indicating heterogeneous structural environments with distribution of relaxation times, characteristic of complex pool microstructures), FULLY_RELAXED (high stress relaxed with low residual stress — bins have essentially completed relaxation with stress approaching equilibrium value, optimal post-relaxation state where imbalance has dissipated), or RELAXATION_BALANCE (balanced relaxation state with no extreme indicators — bins operate in typical viscoelastic regime with moderate relaxation progress and no critical kinetic signatures, the default healthy state for pools under varying trading conditions)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-relaxation/hodlmm-bin-relaxation.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Relaxation Analyzer

## What it does

Models time-dependent stress decay under held constant strain across HODLMM bins. Stress relaxation is the dual phenomenon to creep: where creep describes strain growth under held stress, relaxation describes stress decay under held strain. The Maxwell model gives exponential decay sigma(t) = sigma_0 * exp(-t/tau), where the characteristic relaxation time tau = eta/E is the ratio of dashpot viscosity to spring modulus. Real materials exhibit a spectrum of relaxation times, captured by the Kohlrausch-Williams-Watts stretched exponential sigma(t) = sigma_0 * exp(-(t/tau)^beta) where KWW exponent beta between 0 and 1 controls breadth (beta = 1 is single Debye, beta < 1 is broad). The Deborah number De = tau/t_obs distinguishes elastic (De >> 1) from viscous (De << 1) behavior on the observation timescale. Viscoelastic materials exhibit storage modulus E' (elastic in-phase) and loss modulus E'' (viscous out-of-phase), with loss tangent tan(delta) = E''/E' measuring relative dissipation.

In DLMM pools, bins that have accumulated composition imbalance are held at a "strained" state where internal reactive pressure builds. This stress decays as trading arbitrages the imbalance toward equilibrium. High-activity pools behave as low-Deborah regimes where stress dissipates rapidly through frequent arbitrage; illiquid pools behave as high-Deborah regimes where imbalance persists. Anelastic strain is the recoverable time-dependent component that reverses on stress removal, distinct from permanent plastic creep strain.

## Why agents need it

LP agents need relaxation analysis because it predicts how quickly accumulated imbalance dissipates, whether stress decay is fast (viscous) or slow (elastic), and whether residual stress locks in permanently. A FLUID pool has bins with rapid stress dissipation — imbalance returns to equilibrium quickly through active arbitrage. A RIGID pool has bins locked in elastic regime — imbalance persists indefinitely because dissipative mechanisms are absent.

Stress relaxed is the primary progress diagnostic. Bins with high stress relaxed have substantially returned to equilibrium; bins with low stress relaxed retain accumulated imbalance.

Relaxation time identifies characteristic decay kinetics. Short relaxation time means rapid dissipation; long relaxation time means slow dissipation over extended windows.

Deborah number distinguishes kinetic regimes. High Deborah (> 0.7) means elastic-dominated with stress persisting; low Deborah (< 0.3) means viscous-dominated with rapid relaxation.

Residual stress reveals permanent locked-in imbalance. High residual stress means significant permanent component that never fully decays; low residual stress means stress approaches zero at long times.

KWW exponent identifies structural homogeneity. High beta (near 1) means single exponential Debye relaxation in homogeneous environment; low beta (< 0.5) means stretched exponential with broad spectrum indicating heterogeneity.

Loss tangent reveals the balance of storage versus dissipation. High tan(delta) is viscous-dominated (active dissipation); low tan(delta) is elastic-dominated (storage without dissipation).

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-relaxation/hodlmm-bin-relaxation.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-relaxation/hodlmm-bin-relaxation.ts status
```

### run
Analyzes bin stress relaxation dynamics for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-relaxation/hodlmm-bin-relaxation.ts run
bun run hodlmm-bin-relaxation/hodlmm-bin-relaxation.ts run --pool 1
bun run hodlmm-bin-relaxation/hodlmm-bin-relaxation.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgRelaxationIndex": 58,
    "fluidCount": 0,
    "viscousCount": 2,
    "viscoelasticCount": 2,
    "transitioningCount": 1,
    "rigidCount": 0,
    "avgStressRelaxed": 0.52,
    "avgRelaxationRate": 0.45,
    "avgResidualStress": 0.28,
    "totalRigidBins": 2,
    "totalRelaxingBins": 12,
    "totalFluidBins": 3,
    "avgRelaxationGini": 0.18
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
      "avgStressRelaxed": 0.55,
      "maxStressRelaxed": 0.82,
      "avgRelaxationRate": 0.48,
      "maxRelaxationRate": 0.78,
      "avgRelaxationTime": 0.42,
      "maxRelaxationTime": 0.72,
      "avgDeborahNumber": 0.38,
      "maxDeborahNumber": 0.68,
      "avgStorageModulus": 0.45,
      "maxStorageModulus": 0.78,
      "avgLossModulus": 0.52,
      "maxLossModulus": 0.82,
      "avgLossTangent": 0.55,
      "maxLossTangent": 0.88,
      "avgRelaxationModulus": 0.42,
      "maxRelaxationModulus": 0.72,
      "avgViscosity": 0.48,
      "maxViscosity": 0.75,
      "avgKwwExponent": 0.68,
      "minKwwExponent": 0.32,
      "avgAlphaRelaxation": 0.52,
      "maxAlphaRelaxation": 0.78,
      "avgBetaRelaxation": 0.42,
      "maxBetaRelaxation": 0.68,
      "avgAnelasticStrain": 0.45,
      "maxAnelasticStrain": 0.72,
      "avgResidualStress": 0.28,
      "maxResidualStress": 0.58,
      "avgRelaxationSpectrum": 0.32,
      "maxRelaxationSpectrum": 0.65,
      "rigidCount": 2,
      "rigidFraction": 0.08,
      "relaxingCount": 15,
      "relaxingFraction": 0.6,
      "fluidCount": 5,
      "fluidFraction": 0.2,
      "relaxationGini": 0.18,
      "relaxationIndex": 62,
      "relaxationRegime": "VISCOUS",
      "relaxationVerdict": "EXPONENTIAL_DECAY",
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

- Stress relaxation in real materials requires time-resolved measurements of stress response under held strain to characterize the relaxation spectrum. The DLMM model uses volume ratio, imbalance, and concentration variance as proxies for the current state of relaxation on a single snapshot without temporal resolution.
- Maxwell model exponential decay assumes a single characteristic relaxation time; real pools have a distribution of relaxation times captured by Prony series or stretched exponential fits, which the model approximates through the KWW exponent proxy.
- The Deborah number comparison requires an explicit observation timescale; the model uses a normalized dimensionless De from activity and structural indicators.
- Storage and loss moduli are measured via dynamic mechanical analysis at varying frequencies; the model estimates them from activity level and structural heterogeneity.
- KWW exponent beta in real materials is determined from multi-decade logarithmic fits to relaxation curves; the model estimates beta from structural homogeneity proxies.
- Alpha and beta relaxations are identified in real materials by their distinct activation energies and temperature dependences measured across wide frequency ranges; the model separates them by activity level only.
- Anelastic strain in real materials is measured from strain recovery curves after stress removal; the model estimates from stress decay and activity indicators.
- Residual stress at infinite time requires long-duration relaxation tests to measure directly; the model uses imbalance and elastic storage proxies.
- Relaxation spectrum breadth in real materials is obtained by inverse Laplace transformation or regularized fitting of multi-exponential decays; the model uses a structural heterogeneity proxy.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
