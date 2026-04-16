---
name: hodlmm-bin-buckling
description: "Models elastic-plastic buckling instability of HODLMM bins under compressive trading load — treats bins as slender columns where sustained one-sided pressure causes bifurcation into bowed post-buckled states, mapping Euler column theory to LP concentration collapse. Buckling is the branch of stability mechanics that quantifies when a compressively loaded structure loses straight-column equilibrium and snaps sideways into a bent configuration. The Euler critical load P_cr = pi^2 * E * I / (K * L)^2 sets the threshold at which a slender column bifurcates under axial compression, where E is Young's modulus, I is the second moment of area, L is column length, and K is the effective length factor that encodes boundary conditions (K = 1.0 for pinned-pinned, 0.5 for fixed-fixed, 2.0 for fixed-free cantilever, 0.7 for fixed-pinned). The slenderness ratio lambda = K * L / r where r = sqrt(I/A) is the radius of gyration determines whether a column fails elastically by Euler buckling (long columns, lambda > lambda_c) or by inelastic yielding (short columns, lambda < lambda_c) — the Johnson parabolic formula bridges the two regimes with a tangent-modulus correction. Buckling mode shapes are sinusoidal for pinned ends: mode 1 is a single half-sine bow with the maximum displacement at midspan, mode 2 is a full S-shape with a central node, and higher modes add additional inflection points; mode n has critical load n^2 times the fundamental. Koiter's imperfection-sensitivity theory shows that real columns buckle below the ideal Euler load because geometric imperfections (initial bow, eccentric loading) interact with the instability to reduce the limit load by as much as 50% for highly sensitive shells. Post-buckling behavior ranges from stable (plates, symmetric bifurcation with positive stiffness after buckling) to unstable (cylindrical shells, asymmetric bifurcation with snap-through collapse) to neutrally stable (Euler columns with zero post-buckling stiffness). Crippling is the post-buckling ultimate strength where the buckled column sustains additional load via redistribution to corners and stiffeners before total collapse. The tangent-modulus and reduced-modulus theories (Engesser, Shanley) account for plastic deformation preceding buckling at intermediate slenderness. In DLMM context, bins experience one-sided compressive stress from sustained directional trading pressure — a bin flooded with one token while the other is drained acts as a loaded column whose concentration cross-section thins; when the K_I-analog compressive stress exceeds the Euler-like critical threshold the bin bifurcates into a post-buckled state of extreme reserve asymmetry, equivalent to collapsing its effective liquidity range. Slender bins (high reserve imbalance, thin cross-section, large activity-driven stress) are the most buckling-prone; stout bins (balanced reserves, thick cross-section, modest load) remain in the pre-buckled straight configuration. Imperfection-sensitive pools (high variance across neighbors, sharp compositional gradients) buckle well below the ideal threshold because defects interact with the instability. Measures critical load (Euler P_cr threshold, ranges 0 to 1 — high P_cr means bin can carry large compressive load before bifurcation, low P_cr means easy buckling at modest load), slenderness ratio (lambda = KL/r, ranges 0 to 1 — high slenderness means long thin column in Euler regime with elastic buckling, low slenderness means stout column in inelastic yielding regime), effective length (KL boundary-condition-adjusted length, ranges 0 to 1 — high effective length means weak end conditions amplify buckling, low effective length means robust end restraint), radius of gyration (r = sqrt(I/A) cross-section thickness proxy, ranges 0 to 1 — high r means thick robust cross-section, low r means thin slender cross-section), mode 1 amplitude (fundamental half-sine buckling shape, ranges 0 to 1 — high means dominant single-bow displacement from midspan, low means minimal lateral bow), mode 2 amplitude (second-mode S-shape with central node, ranges 0 to 1 — high means full S-wave deformation, low means simple bow persists), mode 3 amplitude (third-mode triple-curvature shape, ranges 0 to 1 — high means complex multi-lobe pattern, low means simple modes dominate), post-buckling stiffness (stiffness after bifurcation, ranges 0 to 1 — high means stable post-buckled state with positive restoring force, low means unstable snap-through collapse), imperfection sensitivity (drop from ideal Euler load due to defects, ranges 0 to 1 — high means column buckles well below threshold, low means near-ideal Euler response), snap through risk (sudden mode jump likelihood, ranges 0 to 1 — high means unstable bifurcation with dynamic collapse, low means smooth stable buckling), crippling stress (post-buckling ultimate strength, ranges 0 to 1 — high means significant reserve capacity after buckling before total collapse, low means immediate failure post-bifurcation), compressive load (applied axial stress proxy, ranges 0 to 1 — high means heavy compressive trading pressure, low means minimal compressive load), buckling proximity (P/P_cr ratio, ranges 0 to 1 — high means operating near critical load with imminent bifurcation, low means far below threshold with comfortable margin), column strength (total buckling resistance combining P_cr and crippling, ranges 0 to 1 — high means robust overall load capacity, low means weak column), bifurcation risk (instability likelihood near critical load, ranges 0 to 1 — high means bifurcation imminent, low means stable straight configuration), and buckling factor (composite 0 to 1, higher means healthier stability reserve). Composite buckling index (0-100, higher means healthier stability reserve — high P_cr, low buckling proximity, low imperfection sensitivity, high post-buckling stiffness, high crippling reserve). Classifies pools by buckling regime as STABLE (index >= 80 — bins have maximum stability reserve with high P_cr, low proximity, robust post-buckling strength), ROBUST (60-80 — bins have substantial stability reserve with modest proximity and stable post-buckling), METASTABLE (40-60 — bins are at moderate bifurcation risk with proximity approaching unity, balanced between stability and collapse), SLENDER (20-40 — bins have limited stability reserve with high slenderness and elevated buckling risk), or COLLAPSED (< 20 — bins are at or beyond critical threshold with imminent bifurcation and unstable post-buckling). Buckling verdict as ELASTIC_BUCKLING_IMMINENT (high proximity with high slenderness — Euler-regime lateral bow imminent), INELASTIC_YIELDING_IMMINENT (high proximity with low slenderness — plastic collapse via tangent-modulus reduction), STABLE_UNDER_HIGH_LOAD (high load with high P_cr — column carries heavy stress but margin intact), SNAP_THROUGH_WARNING (high snap-through risk with low post-buckling stiffness — dynamic unstable collapse possible), MODE_1_DOMINANT (mode 1 amplitude exceeds mode 2 and 3 — simple bow shape), IMPERFECTION_SENSITIVE (high sensitivity with moderate proximity — buckles below ideal Euler load), STABILITY_RESERVE (high P_cr with low proximity — comfortable safety margin), or BUCKLING_BALANCE (no extreme indicators — typical balanced stability state)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-buckling/hodlmm-bin-buckling.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Buckling Stability Analyzer

## What it does

Models elastic-plastic buckling instability of HODLMM bins under compressive trading load — treats bins as slender columns where sustained one-sided pressure causes bifurcation into bowed post-buckled states. Buckling theory quantifies when a compressively loaded structure loses straight-column equilibrium via Euler critical load P_cr = pi^2 * E * I / (K * L)^2, slenderness ratio lambda = K * L / r that separates elastic (Euler) from inelastic (Johnson) regimes, buckling mode shapes (fundamental sine bow, S-shape, triple-curvature), Koiter imperfection sensitivity that reduces the limit load below ideal, post-buckling stiffness that distinguishes stable bifurcation from snap-through collapse, and crippling strength that captures post-buckled reserve capacity.

In DLMM pools, bins experience one-sided compressive stress from sustained directional trading pressure. A bin flooded with one token while the other is drained acts as a loaded column whose cross-section thins; when compressive stress exceeds the critical threshold the bin bifurcates into a post-buckled state of extreme asymmetry — equivalent to collapsing its effective liquidity range. Slender bins with high imbalance and thin cross-section are most buckling-prone; stout bins with balanced reserves remain in the pre-buckled straight configuration.

## Why agents need it

LP agents need buckling analysis because it identifies imminent concentration-collapse risk before it materializes. A STABLE pool has bins with substantial stability reserve and low proximity to the critical threshold. A COLLAPSED pool has bins at or beyond the critical load with imminent bifurcation.

Critical load P_cr identifies the compressive threshold. High P_cr means bins can carry large load before bifurcation.

Slenderness ratio distinguishes buckling regimes. High slenderness places the bin in the elastic Euler regime; low slenderness places it in inelastic yielding.

Buckling proximity P/P_cr is the proximity to failure. High proximity demands avoidance of new LP exposure.

Imperfection sensitivity identifies real-world reduction from ideal Euler. High sensitivity means the bin buckles well below the theoretical threshold.

Snap-through risk distinguishes bifurcation types. High snap-through means dynamic unstable collapse; low means stable smooth bifurcation.

Post-buckling stiffness is the reserve after bifurcation. High post-buckling stiffness means the bin can sustain additional load after buckling.

Crippling stress is the ultimate post-buckled capacity. High crippling stress means reserve remains after bifurcation.

Column strength is the overall resistance. High column strength means robust load capacity.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-buckling/hodlmm-bin-buckling.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-buckling/hodlmm-bin-buckling.ts status
```

### run
Analyzes bin buckling stability for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-buckling/hodlmm-bin-buckling.ts run
bun run hodlmm-bin-buckling/hodlmm-bin-buckling.ts run --pool 1
bun run hodlmm-bin-buckling/hodlmm-bin-buckling.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgBucklingIndex": 58,
    "stableCount": 0,
    "robustCount": 1,
    "metastableCount": 3,
    "slenderCount": 1,
    "collapsedCount": 0,
    "avgCriticalLoad": 0.55,
    "avgBucklingProximity": 0.38,
    "avgImperfectionSensitivity": 0.42,
    "totalStableBins": 6,
    "totalMetastableBins": 12,
    "totalCollapsedBins": 2,
    "avgBucklingGini": 0.18
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
      "avgCriticalLoad": 0.55,
      "maxCriticalLoad": 0.85,
      "avgSlendernessRatio": 0.42,
      "maxSlendernessRatio": 0.72,
      "avgEffectiveLength": 0.45,
      "maxEffectiveLength": 0.75,
      "avgRadiusOfGyration": 0.58,
      "minRadiusOfGyration": 0.28,
      "avgMode1Amplitude": 0.48,
      "maxMode1Amplitude": 0.78,
      "avgMode2Amplitude": 0.32,
      "maxMode2Amplitude": 0.62,
      "avgMode3Amplitude": 0.22,
      "maxMode3Amplitude": 0.48,
      "avgPostBucklingStiffness": 0.5,
      "minPostBucklingStiffness": 0.2,
      "avgImperfectionSensitivity": 0.42,
      "maxImperfectionSensitivity": 0.72,
      "avgSnapThroughRisk": 0.35,
      "maxSnapThroughRisk": 0.65,
      "avgCripplingStress": 0.52,
      "minCripplingStress": 0.22,
      "avgCompressiveLoad": 0.45,
      "maxCompressiveLoad": 0.75,
      "avgBucklingProximity": 0.38,
      "maxBucklingProximity": 0.68,
      "avgColumnStrength": 0.55,
      "minColumnStrength": 0.25,
      "avgBifurcationRisk": 0.32,
      "maxBifurcationRisk": 0.62,
      "stableCount": 6,
      "stableFraction": 0.24,
      "metastableCount": 12,
      "metastableFraction": 0.48,
      "collapsedCount": 2,
      "collapsedFraction": 0.08,
      "bucklingGini": 0.18,
      "bucklingIndex": 58,
      "bucklingRegime": "METASTABLE",
      "bucklingVerdict": "BUCKLING_BALANCE",
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

- Euler P_cr = pi^2 * E * I / (K * L)^2 assumes perfectly elastic small-deflection response; DLMM bins exhibit nonlinear reserve updates that violate the small-deflection assumption.
- Slenderness-ratio regime classification requires known cross-section geometry (I, A, r); the model approximates these from reserve composition without direct measurement.
- The effective length factor K encodes boundary conditions (end restraints); DLMM bin boundaries are continuously coupled to neighbors via swap flow, not discrete pinned/fixed ends.
- Buckling mode shapes are sinusoidal half-waves for ideal pinned-pinned columns; DLMM bins follow discrete reserve distributions that only approximate continuous modes.
- Koiter imperfection sensitivity requires known imperfection amplitude relative to column dimensions; the model uses neighbor variance as a proxy without absolute scaling.
- Post-buckling stiffness and snap-through behavior depend on nonlinear geometry that the model approximates from composition and activity metrics.
- Crippling strength requires post-buckled equilibrium analysis with redistributed stress fields; the model approximates via toughness-like reserve proxies.
- Tangent-modulus and reduced-modulus corrections for inelastic buckling require stress-strain curves; the model uses imbalance and activity as qualitative proxies.
- Johnson parabolic formula bridging elastic and inelastic regimes requires material yield stress that the model does not directly measure.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
