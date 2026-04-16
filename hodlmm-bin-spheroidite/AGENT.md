---
name: hodlmm-bin-spheroidite-agent
skill: hodlmm-bin-spheroidite
description: "Agent behavior for HODLMM bin spheroidite analysis — interprets sphereCount (isolated short-run clusters), lamellaCount (long Rayleigh-unstable runs), sphericityIndex, isolationDegree, radiusClass distribution (small/medium/large), ostwaldAge, rayleighInstability (active pinch-off signal), interfacialFraction (S/V proxy), contactAngleCompliance (wetting at edges), matrixEquilibrium (flatness of surrounding matrix reserves), lswCompliance (fit to LSW steady-state PDF), bimodalityIndex, driftFromPearlite, and spheroidizationFraction to identify pools in pearlite-stable, incubating-spheroidization, Rayleigh-breakup, Ostwald-ripening, spheroidized, or over-aged regime and guide LP strategies toward isolated compact clusters (matrix-wrapped single-bin minority for dispersed fee capture), Rayleigh-pinching long runs (transient — monitor for breakup), bimodal pools (active Ostwald coarsening — small will dissolve, large will grow), LSW-compliant size distributions (fully ripened steady state), and matrix-equilibrated clusters (long-range diffusion complete), and to infer microstructural state (lamellar-stable, pinching-detected, Rayleigh-instability, Ostwald-coarsening, LSW-compliant, bimodal-sizes, monodisperse, interfacial-minimized, contact-angle-wetting, matrix-equilibrated) from cluster sizes, positions, and surrounding matrix."
---

# Agent Behavior — HODLMM Bin Spheroidite

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `spheroiditeRegime`, `spheroiditeVerdict`, `sphereCount`, `lamellaCount`, `rayleighBreakupCount`, `spheroidizationFraction`, `bimodalityIndex`, `lswComplianceScore`, and `avgMatrixEquilibrium`.

## Interpreting output

- **spheroiditeRegime = PEARLITE_STABLE:** ≥2 long lamellar runs with no pinch-off signal. Directional minority distribution stable — treat pool as lamellar (pearlite-like), not yet spheroidizing.
- **spheroiditeRegime = INCUBATING_SPHEROIDIZATION:** Rayleigh instabilities visible but breakup not yet complete. Mixed lamellar + short-run population. Transient; monitor.
- **spheroiditeRegime = RAYLEIGH_BREAKUP:** Active pinch-off; sphereCount ≥ lamellaCount with rayleighBreakupCount ≥ 1. Lamellae fragmenting — transient regime.
- **spheroiditeRegime = OSTWALD_RIPENING:** ≥3 isolated clusters with bimodal size distribution (bimodalityIndex > 0.4). Small clusters dissolving, large growing — active coarsening.
- **spheroiditeRegime = SPHEROIDIZED:** ≥2 isolated clusters with no lamellae. Fully equilibrated microstructure; size distribution approaching LSW steady state.
- **spheroiditeRegime = OVER_AGED:** Minority fraction < 0.05. Very few, very large clusters remain; minority phase near-depleted.
- **spheroiditeVerdict = LAMELLAR_STABLE:** ≥2 lamellae with 0 spheres. Pool is pearlite-like — directional fee capture applies, spheroidization has not started.
- **spheroiditeVerdict = PINCHING_DETECTED:** rayleighBreakupCount ≥ 1. At least one lamella is pinching off — fragment formation imminent.
- **spheroiditeVerdict = RAYLEIGH_INSTABILITY:** rayleighBreakupCount ≥ 1 with avgRayleighInstability > 0.4. Strong pinch-off signal; multiple breakups in progress.
- **spheroiditeVerdict = OSTWALD_COARSENING:** sphereCount ≥ 2 with spheroidizationFraction > 0.6. Isolated clusters dominate; coarsening active.
- **spheroiditeVerdict = LSW_COMPLIANT:** lswComplianceScore > 0.55 with sphereCount ≥ 3. Size distribution matches LSW steady-state — fully ripened.
- **spheroiditeVerdict = BIMODAL_SIZES:** bimodalityIndex > 0.5 with sphereCount ≥ 3. Two cluster-size populations — active coarsening (small will vanish, large will grow).
- **spheroiditeVerdict = MONODISPERSE:** sphereCount ≥ 3 with bimodalityIndex < 0.3. Narrow size distribution — either very early or very late in ripening.
- **spheroiditeVerdict = INTERFACIAL_MINIMIZED:** avgInterfacialFraction > 0.7 with sphereCount ≥ 2. Thin/compact clusters with high surface-to-volume ratio.
- **spheroiditeVerdict = CONTACT_ANGLE_WETTING:** avgContactAngleCompliance > 0.55 with sphereCount ≥ 2. Smooth wetting at cluster edges — intragranular-sphere signature.
- **spheroiditeVerdict = MATRIX_EQUILIBRATED:** avgMatrixEquilibrium > 0.55 with sphereCount ≥ 2. Matrix reserves are flat around clusters — long-range diffusion complete.
- **spheroiditeVerdict = NO_SPHEROIDIZATION_DRIVE:** drivingForce < 0.15. Insufficient turnover/activation; pool is dormant.
- **spheroiditeVerdict = HYPEREUTECTOID_SKEW:** |hypoeutectoidSkew| > 0.35. Pool is X- or Y-heavy; minority phase assignment may be uncertain.
- **spheroiditeVerdict = INTERMEDIATE_SPHEROIDIZATION:** No extreme indicators; typical mid-state.
- **sphereCount ≥ 3:** Multiple isolated clusters — dispersed-minority exposure, LSW-relevant.
- **lamellaCount ≥ 2:** Multiple long runs — lamellar/pearlite-like pattern; spheroidization has not fully consumed the lamellae.
- **rayleighBreakupCount ≥ 1:** At least one lamella pinching off — transient.
- **spheroidizationFraction > 0.7:** Most minority bins are in short isolated runs — well-advanced spheroidization.
- **spheroidizationFraction < 0.3:** Most minority bins are in long runs — pearlite-like.
- **bimodalityIndex > 0.5:** Two populations — small and large; Ostwald ripening active.
- **bimodalityIndex < 0.2:** Narrow size distribution — either very early or very late.
- **lswComplianceScore > 0.55:** Size distribution matches LSW steady-state — fully ripened.
- **lswComplianceScore < 0.25:** Size distribution does not match LSW — either pre-ripening or perturbed.
- **avgMatrixEquilibrium > 0.55:** Matrix reserves are flat around clusters — diffusion complete.
- **avgMatrixEquilibrium < 0.3:** Matrix reserves are variable — transient, matrix not yet equilibrated.
- **avgContactAngleCompliance > 0.55:** Clusters blend smoothly into matrix — intragranular.
- **avgContactAngleCompliance < 0.3:** Sharp cluster/matrix boundary — boundary-pinned lens shape.
- **avgInterfacialFraction > 0.7:** Clusters have high S/V — thin, unstable, Rayleigh-candidate.
- **avgInterfacialFraction < 0.3:** Clusters have low S/V — thick, stable, ripened.
- **avgRayleighInstability > 0.4:** Strong pinch-off signal in long runs.
- **avgOstwaldAge > 0.6:** Clusters have grown larger than pool mean — ripened.
- **avgOstwaldAge < 0.3:** Clusters are mostly small — early ripening or shrinking.
- **driftFromPearlite > 0.6:** Pattern deviates from lamellar alternation — spheroidite-like.
- **driftFromPearlite < 0.2:** Pattern retains lamellar alternation — pearlite-stable.
- **largeSphereCount > smallSphereCount:** Ripening in late stage — large dominant.
- **smallSphereCount > largeSphereCount:** Ripening early or breaking up recent lamellae.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on spheroidite signals from pools with fewer than 5 populated bins — insufficient data for cluster inference.
- Do not treat SPHEROIDIZED as universally desirable; a fully ripened pool has low surface area, which in DLMM terms means clusters have absorbed — check whether the LP strategy wants dispersed (isolated) or concentrated exposure.
- Do not assume PEARLITE_STABLE pools will remain lamellar; a long hold (high driving force or extended activity) can drive pinch-off.
- Do not treat the cluster size as a rigorous measured value — it is a sum of reserves in USD within adjacent minority bins, not a metallographic radius measurement.
- Do not assume LSW compliance implies the system has reached thermodynamic equilibrium; LSW is a non-equilibrium steady-state with power-law growth.
- Do not conflate the 1-D cluster-edge count (2 per cluster) with real 3-D interfacial area (4π·r²).
- Do not assume Rayleigh instability threshold λ > 2π·r maps directly to a 4-bin length cutoff; real Rayleigh depends on diffusion mechanism (surface vs volume) and particle aspect ratio.
- Do not treat the PINCH_OFF_DEPTH = 0.4 threshold as a physical depth measurement; it is a normalized reserve-variation ratio.
- Do not assume contact angle compliance is a dihedral angle measurement; real ψ = 2·acos(γ_gb/(2·γ_ab)) requires interfacial energy data.
- Do not assume bimodality index directly maps to Hartigan's dip test or a Gaussian mixture; it is a moment-based proxy.
- Do not assume matrix equilibrium maps to real solute concentration equilibration; it is a reserve coefficient-of-variation proxy.
- Do not assume OVER_AGED requires full carbide depletion; here it is triggered by minorityFraction < 0.05 which may include transient depletions.
- Do not conflate DLMM bin spheroidization with 3-D cementite coarsening; the analogy is heuristic.
- DOMINANCE_MARGIN = 0.15, RAYLEIGH_CRITICAL_LENGTH = 4, ISOLATION_RADIUS = 2, PINCH_OFF_DEPTH = 0.4, LSW_K = 1.0, LSW_RHO_CUTOFF = 1.5, MIN_SPHERE_RESERVE_USD = 1 are normalized proxy values; in real systems these are alloy-, temperature-, and geometry-specific.
- Analysis is snapshot-based; does not capture time-evolution of coarsening — LSW kinetics, pinch-off rate, and size distribution inferred from current pattern rather than measured rate.
- Driving force is inferred from 24h volume/TVL turnover — a proxy for annealing-time activation, not a measured thermodynamic quantity.
- LSW theory assumes low volume fraction; at high minority fraction (> 0.3) MLSW/LSEM corrections apply. Here lswComplianceScore may be artificially low for high-minority pools.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "Spheroidite analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest spheroiditeIndex as the one with the strongest spheroidite signature (isolated compact clusters with LSW-compliant size distribution, matrix equilibrated, low interfacial area per unit volume).
- Flag pools in SPHEROIDIZED regime as fully equilibrated isolated-cluster microstructures — LP strategies get dispersed-minority exposure with smooth matrix.
- Flag pools in OSTWALD_RIPENING regime as actively coarsening — size distribution is bimodal; small clusters will dissolve into large ones over time.
- Flag pools in RAYLEIGH_BREAKUP regime as transient — lamellae pinching off into segments; monitor for regime shift.
- Flag pools in INCUBATING_SPHEROIDIZATION regime as in pre-breakup state — Rayleigh instabilities forming but not yet complete.
- Flag pools in PEARLITE_STABLE regime as lamellar — directional minority distribution, classic pearlite-style LP behavior applies.
- Flag pools in OVER_AGED regime as minority-depleted — very few, very large clusters remain; minority exposure is limited.
- Flag pools with sphereCount ≥ 3 and lswComplianceScore > 0.55 as LSW-compliant — steady-state Ostwald ripening reached.
- Flag pools with bimodalityIndex > 0.5 as actively bimodal — coarsening in progress.
- Flag pools with avgRayleighInstability > 0.4 and rayleighBreakupCount ≥ 1 as actively fragmenting.
- Flag pools with avgMatrixEquilibrium > 0.55 as matrix-equilibrated — long-range diffusion complete.
- Flag pools with avgContactAngleCompliance > 0.55 as intragranular-wetting — smooth cluster/matrix transitions.
- Flag pools with avgInterfacialFraction > 0.7 as thin-cluster — high S/V, Rayleigh-candidate.
- Report the inferred microstructural state (LAMELLAR_STABLE, PINCHING_DETECTED, RAYLEIGH_INSTABILITY, OSTWALD_COARSENING, LSW_COMPLIANT, BIMODAL_SIZES, MONODISPERSE, INTERFACIAL_MINIMIZED, CONTACT_ANGLE_WETTING, MATRIX_EQUILIBRATED, NO_SPHEROIDIZATION_DRIVE, HYPEREUTECTOID_SKEW, or INTERMEDIATE_SPHEROIDIZATION).
- Show bins with highest sphericityIndex as the isolated-cluster positions.
- Show bins with highest isolationDegree as the most-separated cluster positions.
- Show bins with highest rayleighInstability as the pinch-off candidate positions.
- Show bins with highest ostwaldAge as the large/ripened cluster positions.
- Show bins with highest contactAngleCompliance as the intragranular-wetting positions.
- Show bins with highest matrixEquilibrium as the diffusion-complete positions.
- Show bins with radiusClass = 2 as the large-cluster positions (Ostwald winners).
- Show bins with radiusClass = 0 as the small-cluster positions (Ostwald losers — will dissolve).
- For LP agents: in PEARLITE_STABLE pools, use lamellar (directional) strategies; in INCUBATING_SPHEROIDIZATION pools, wait for pinch-off to complete; in RAYLEIGH_BREAKUP pools, expect fragmentation and position adaptively; in OSTWALD_RIPENING pools, position near large clusters (winners) rather than small (losers); in SPHEROIDIZED pools, use dispersed-minority strategies with smooth matrix; in OVER_AGED pools, minority exposure is limited — reduce allocation.
- For trading agents: PEARLITE_STABLE pools have lamellar slippage profile; RAYLEIGH_BREAKUP pools have transient non-smooth slippage; OSTWALD_RIPENING pools have bimodal slippage at large vs small clusters; SPHEROIDIZED pools have dispersed-cluster slippage (repeated small jumps through matrix); OVER_AGED pools have few large jumps then matrix-only slippage.
- Compare spheroidite indices and driving forces across pools to find bins and pools with the strongest spheroidite signature for the intended LP or trading strategy.
