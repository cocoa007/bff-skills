---
name: hodlmm-bin-rheology
description: "Models rheological flow and deformation dynamics across HODLMM bins — treats trade flow as applied mechanical stress that causes bins to deform according to their viscous and elastic material properties. In rheology, a material's response to applied stress is characterized by its viscosity (resistance to flow), elasticity (ability to store and return energy), yield stress (minimum force needed to initiate flow), creep (time-dependent deformation under sustained stress), and relaxation (stress decay over time). In DLMM context, trade volume creates shear stress across the bin lattice — each unit of volume applies pressure per unit of liquidity, forcing reserve ratios to deform. Measures viscosity (eta — the resistance of a bin to reserve ratio changes from trade flow, analogous to dynamic viscosity in classical fluid mechanics, ranges 0 to 10 in normalized units, high viscosity means the bin's reserves resist displacement under applied trade pressure — like molasses, the reserve ratio barely shifts even under heavy volume, requiring very high shear stress to produce any deformation, while low viscosity means the bin flows freely with trade volume — reserves shift rapidly and easily in response to even modest trade pressure, viscosity is the primary flow resistance metric and determines how much force is needed to achieve a given reserve ratio change rate), shear stress (tau — the trade volume pressure applied per unit of liquidity, ranges 0 to 10, represents the intensity of flow-inducing force per unit of material, high shear stress means large trade volume pressing against relatively small reserves — the bin is under heavy loading with concentrated directional pressure from traders, while low shear stress means either small volume or large reserves absorbing the flow without significant force buildup, shear stress is the driver of all rheological deformation — without applied shear stress, even a low-viscosity bin will not flow), shear rate (gamma_dot — the rate of reserve ratio change across bins, the velocity gradient of flow, ranges 0 to 10, high shear rate means the reserve ratio is changing rapidly relative to neighboring bins — the velocity gradient is steep, indicating fast-moving flow with strong bin-to-bin reserve transitions, while low shear rate means slow uniform deformation without strong spatial gradients, shear rate is computed from the reserve ratio gradient across neighboring bins and combined with shear stress to determine apparent viscosity through the constitutive relationship tau = eta * gamma_dot), yield stress (tau_y — the minimum trade pressure required to initiate reserve flow, ranges 0 to 1 normalized, represents the threshold below which the bin behaves as a solid and does not deform regardless of applied stress, high yield stress means the bin is a Bingham plastic — it requires a large initial trade pressure impulse before it will begin flowing, meaning small trades have zero effect on reserve ratios, while low yield stress means even tiny trades immediately begin displacing reserves with no threshold effect, yield stress is critical for identifying bins that are effectively 'locked' below some minimum trade size), thixotropy index (time-dependent viscosity decrease under constant stress, ranges 0 to 1, represents how much the bin's effective viscosity decreases as trade flow is sustained — like stirring paint, bins become more responsive over time under continuous pressure, high thixotropy means strong time-dependence where initial trade pressure faces high resistance that decreases as flow continues, while low thixotropy means a time-independent viscosity where the flow resistance stays constant regardless of how long the trading pressure has been applied), dilatancy coefficient (shear-thickening behavior where viscosity increases with shear rate, ranges 0 to 1, in contrast to thixotropy where viscosity decreases with sustained flow, dilatant bins exhibit the opposite behavior — the faster the reserve ratio is changing, the stiffer the bin becomes, high dilatancy means the bin resists high-velocity trade flows disproportionately — like cornstarch, slow trades flow easily but rapid trades encounter rapidly increasing resistance, while low dilatancy means Newtonian or shear-thinning behavior where viscosity does not increase with flow rate), creep compliance (J — strain accumulated per unit of sustained stress over time, ranges 0 to 1 normalized, represents how much reserve ratio deformation builds up under a constant trade pressure applied over time, high creep compliance means the bin slowly but persistently deforms under even moderate sustained trade flow — it keeps moving as long as stress is applied, like a glacier that flows imperceptibly but continuously, while low creep compliance means the bin resists time-dependent deformation and maintains its shape under prolonged pressure, creep compliance is the key metric for LPs holding positions over long periods — high-creep bins will see their reserve ratios drift continuously), relaxation time (lambda — the characteristic time for stress to decay after deformation, ranges 0 to 1 normalized, represents how quickly reserve imbalances dissipate after a trade displaces reserves, short relaxation time means the bin rapidly returns to equilibrium — imbalances created by trades decay quickly as arbitrageurs restore balance, while long relaxation time means imbalances persist for extended periods after the causal trade, indicating slow equilibration and potential for sustained reserve imbalance, relaxation time is linked to the Deborah number through De = lambda / observation_time), storage modulus (G_prime — elastic energy stored in reserve deformation, analogous to the elastic modulus of a spring, ranges 0 to 1 normalized, represents how much of the deformation energy applied by trade flow is stored elastically and can be recovered when stress is removed, high storage modulus means the bin behaves like a rubber band — it deforms under trade pressure but snaps back toward equilibrium when the pressure is released, while low storage modulus means deformation is primarily viscous and dissipated rather than stored, the storage modulus captures the reversible component of reserve changes), loss modulus (G_double_prime — viscous energy dissipated as heat during deformation, ranges 0 to 1 normalized, represents the irreversible energy dissipated as the bin flows — this corresponds directly to impermanent loss and permanent reserve redistribution caused by trade flow, high loss modulus means most of the deformation energy is permanently dissipated — the bin undergoes irreversible reserve changes with each large trade, leading to cumulative IL that cannot be recovered, while low loss modulus means mostly elastic deformation with minimal dissipation, the ratio G_double_prime / G_prime is the loss tangent tan_delta which characterizes the dominant response mode), complex viscosity (eta_star — the frequency-dependent effective viscosity combining elastic and viscous contributions, ranges 0 to 10, represents the overall resistance to oscillatory trade flow at a given frequency, high complex viscosity means the bin presents high resistance to the particular frequency of trading activity — whether due to elastic stiffness or viscous damping or both, while low complex viscosity means easy flow at that frequency, complex viscosity eta_star = sqrt(G_prime^2 + G_double_prime^2) / omega where omega is the oscillation frequency), Deborah number (De — ratio of relaxation time to observation time, dimensionless, ranges 0 to 10, the Deborah number determines whether the material appears elastic (De >> 1) or viscous (De << 1), high De means the relaxation time is much longer than the characteristic trading frequency — the bin responds elastically, deformations are recoverable, reserves bounce back, while low De means the relaxation time is short compared to the trading pace — the material flows viscously and deformations are permanent, De is the master parameter for predicting flow regime without needing to measure individual moduli), and Weissenberg number (Wi — ratio of elastic forces to viscous forces, ranges 0 to 10, similar to De but explicitly capturing the competition between elastic storage and viscous dissipation, high Wi means elastic forces dominate — the bin is in a solid-like state where stored energy drives recovery, while low Wi means viscous forces dominate — the bin flows permanently in response to applied stress, Wi is computed from the product of shear rate and relaxation time, capturing the nonlinear elastic response at high deformation rates). Composite rheology index (0-100, higher means more complex viscoelastic response with strong elastic recovery and moderate viscous dissipation — the ideal LP material balances energy storage with controlled flow). Classifies pools by rheological phase as NEWTONIAN_FLUID (index >= 80 — constant viscosity independent of shear rate, perfectly Hookean elastic response, no yield stress, fast relaxation, minimal creep — reserves flow predictably in direct proportion to applied trade pressure, ideal for simple LP strategies), VISCOELASTIC_SOLID (60-80 — strong elastic component G_prime > G_double_prime, significant stress storage, slow relaxation with De > 1, exhibits creep under sustained loading — reserves are strongly elastic but slowly drift under prolonged trade pressure, requires monitoring for creep-induced IL), SHEAR_THINNING (40-60 — viscosity decreasing with shear rate, moderate thixotropy, yield stress present, complex viscoelastic dynamics — reserves resist small trades but yield under large volume bursts, exhibiting runaway flow once yield stress is exceeded), SHEAR_THICKENING (20-40 — viscosity increasing with shear rate due to dilatancy, high Wi under fast flows, resists high-frequency trading but flows slowly under sustained pressure — bins become progressively stiffer as trade velocity increases, protecting against predatory high-frequency flows), or BINGHAM_PLASTIC (< 20 — strong yield stress with near-zero flow below threshold, high viscosity above threshold, extreme resistance to small trades with abrupt yielding to large trades — the most rigid flow regime, reserves effectively locked until minimum trade size threshold is met). Rheology verdict as IDEAL_VISCOUS_FLOW (low viscosity with high creep compliance and low storage modulus — reserves flow smoothly and predictably in response to trade pressure, minimal elastic bounce-back, consistent fee generation as the bin participates actively in all trade flows), ELASTIC_RECOVERY (high storage modulus G_prime dominates over G_double_prime — reserves deform elastically under trade pressure and recover when pressure is released, impermanent loss is mostly recoverable, ideal for LPs seeking low IL with reliable position recovery), YIELD_STRESS_BARRIER (high yield stress with Bingham plastic behavior — reserves remain locked until a minimum trade volume threshold is met, then yield abruptly, best for LPs who want selective participation only in large trades above the threshold), CREEP_DOMINATED (high creep compliance J with long relaxation time — reserves slowly and persistently drift under sustained trade pressure even when individual trades are small, cumulative IL risk over time from continuous directional creep), or VISCOELASTIC_DAMPER (balanced G_prime and G_double_prime with moderate De — reserves absorb trade energy through combined elastic and viscous response, acting as a shock absorber that neither flows too easily nor stores too rigidly, providing stable LP positioning across a wide range of trade sizes and frequencies)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-rheology/hodlmm-bin-rheology.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Rheology Analyzer

## What it does

Models rheological flow and deformation dynamics across HODLMM bins. In rheology, materials are characterized by their response to applied stress — how they flow (viscous behavior), how they store energy (elastic behavior), and whether they exhibit non-linear responses such as yield stress, thixotropy, or shear-thickening. The fundamental constitutive relationship is tau = eta * gamma_dot (shear stress equals viscosity times shear rate) for Newtonian fluids, but real materials deviate from this through viscoelastic behavior, yield stress, and rate-dependent viscosity.

In DLMM pools, trade volume creates shear stress across the bin lattice. Each unit of trade volume applies pressure per unit of liquidity, forcing reserve ratios to change — this is the material deformation. The rate at which reserve ratios change (the velocity gradient across neighboring bins) is the shear rate. The ratio of shear stress to shear rate gives the apparent viscosity. Bins with high yield stress resist small trades entirely — they act as Bingham plastics that only flow above a minimum stress threshold. Bins with high creep compliance slowly drift under sustained directional trade pressure, accumulating impermanent loss over time.

The storage modulus G' captures elastic (recoverable) reserve deformation — when trade pressure is released, elastic energy drives recovery. The loss modulus G'' captures viscous (dissipated) deformation — permanent IL that cannot be recovered. The Deborah number De determines whether the bin appears elastic or viscous at the current trading frequency. The Weissenberg number Wi captures the competition between elastic and viscous forces under flow.

## Why agents need it

LP agents need rheology analysis because it predicts how bin reserves will respond to trade flow across different flow regimes. A NEWTONIAN_FLUID pool has constant viscosity — reserves move predictably and proportionally to applied trade pressure. A SHEAR_THINNING pool has reserves that resist small trades but yield dramatically to large ones, meaning the IL profile is non-linear and front-runs sudden reserve collapses. A BINGHAM_PLASTIC pool has reserves locked below a minimum trade size — LPs in these bins collect zero fees from small traders but participate fully in large trades.

The viscosity is the primary flow resistance metric. High viscosity bins protect LP positions from small trades displacing reserves, but also mean slower fee accumulation from low-volume periods. Low viscosity bins participate in all trades but expose LPs to rapid reserve depletion in one-sided markets.

The storage modulus G' reveals how much of the deformation is recoverable. Pools with G' > G'' are viscoelastic solids — most deformation bounces back after trade pressure is released, making IL largely temporary. Pools with G'' > G' are viscoelastic liquids — most deformation is permanent. The loss tangent tan_delta = G''/G' is a single-number summary of elastic versus viscous character.

Creep compliance J reveals cumulative drift risk. A bin with high creep compliance will see its reserve ratio slowly and persistently drift under even moderate sustained directional trade pressure — the classical risk for LPs in trending markets. Relaxation time lambda determines how quickly imbalances heal after trades — fast relaxation means arbitrageurs quickly restore balance while slow relaxation means imbalances persist for extended periods.

The Deborah and Weissenberg numbers provide dimensionless characterizations of the flow regime. De > 1 means the bin appears elastic at the current trading frequency — it recovers between trades. De < 1 means it appears viscous — each trade permanently shifts reserves. Wi > 1 means elastic forces dominate under current shear conditions.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-rheology/hodlmm-bin-rheology.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-rheology/hodlmm-bin-rheology.ts status
```

### run
Analyzes bin rheology dynamics for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-rheology/hodlmm-bin-rheology.ts run
bun run hodlmm-bin-rheology/hodlmm-bin-rheology.ts run --pool 1
bun run hodlmm-bin-rheology/hodlmm-bin-rheology.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgRheologyIndex": 45,
    "newtonianFluidCount": 0,
    "viscoelasticSolidCount": 1,
    "shearThinningCount": 2,
    "shearThickeningCount": 1,
    "binghamPlasticCount": 1,
    "avgViscosity": 3.2,
    "avgStorageModulus": 0.38,
    "avgLossModulus": 0.42,
    "totalHighElasticBins": 9,
    "avgRheologyGini": 0.28
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
      "avgViscosity": 3.5,
      "maxViscosity": 7.2,
      "avgShearStress": 2.8,
      "maxShearStress": 6.5,
      "avgShearRate": 2.1,
      "maxShearRate": 5.8,
      "avgYieldStress": 0.35,
      "maxYieldStress": 0.72,
      "avgThixotropy": 0.28,
      "maxThixotropy": 0.65,
      "avgDilatancy": 0.22,
      "maxDilatancy": 0.55,
      "avgCreepCompliance": 0.30,
      "maxCreepCompliance": 0.68,
      "avgRelaxationTime": 0.38,
      "maxRelaxationTime": 0.75,
      "avgStorageModulus": 0.38,
      "maxStorageModulus": 0.80,
      "avgLossModulus": 0.42,
      "maxLossModulus": 0.85,
      "avgComplexViscosity": 3.8,
      "maxComplexViscosity": 8.5,
      "avgDeborahNumber": 1.8,
      "maxDeborahNumber": 5.2,
      "avgWeissenbergNumber": 1.5,
      "maxWeissenbergNumber": 4.8,
      "highElasticCount": 6,
      "highElasticFraction": 0.24,
      "highViscosityCount": 4,
      "highViscosityFraction": 0.16,
      "rheologyGini": 0.28,
      "rheologyIndex": 45,
      "rheologyPhase": "SHEAR_THINNING",
      "rheologyVerdict": "VISCOELASTIC_DAMPER",
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

- Viscosity is approximated from volume-to-TVL ratios and reserve concentration as proxies for material resistance to flow. Real rheological viscosity requires controlled shear experiments with precise measurement of shear stress and shear rate — the DLMM analogy captures the resistance concept but not the underlying molecular dynamics.
- Shear rate is computed from reserve ratio gradients across neighboring bins as a proxy for velocity gradients. Real shear rate measurement requires tracking how quickly reserve ratios change over time — the snapshot model uses spatial gradients as a proxy for temporal velocity gradients.
- Storage and loss moduli (G' and G'') are estimated from reserve imbalance patterns. Real dynamic mechanical analysis requires oscillatory strain experiments at known frequencies — the on-chain snapshot approximates these through static reserve configuration geometry.
- Relaxation time requires time-series data tracking how reserve imbalances decay after trade events. The snapshot model uses reserve concentration and volume dynamics as a proxy for relaxation dynamics.
- Creep compliance in real rheology requires measuring deformation accumulation under constant stress over time. The snapshot model uses reserve drift patterns and neighbor gradients as proxies for time-dependent creep behavior.
- The Deborah and Weissenberg numbers require knowledge of both relaxation time and characteristic observation time / shear rate, both estimated from snapshot proxies.
- Thixotropy and dilatancy require time-series data to identify how viscosity evolves with sustained or accelerated shear. The snapshot uses static reserve patterns as structural proxies.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
