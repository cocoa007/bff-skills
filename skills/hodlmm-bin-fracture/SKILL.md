---
name: hodlmm-bin-fracture
description: "Models fracture mechanics of HODLMM bins under stress — treats bins as loaded solid-mechanics elements where crack-analog instabilities nucleate at compositional defects, propagate under continued trading pressure, and may lead to catastrophic concentration collapse (rebalancing failures). Fracture mechanics is the branch of solid mechanics that quantifies how cracks initiate, grow, and cause structural failure, providing the theoretical framework for predicting when a loaded material separates into two or more pieces. The Griffith energy criterion sigma_c = sqrt(2 * E * gamma_s / (pi * a)) expresses the critical remote stress for brittle fracture as the balance between strain energy released by crack extension and the surface energy required to create new crack surfaces. Irwin's stress intensity factor K_I = sigma * sqrt(pi * a) * Y captures the singular stress field at the crack tip, where the geometry factor Y ranges from about 1.0 for infinite-body edge cracks to 1.12 for surface cracks. Fracture toughness K_IC is the material property that sets the threshold: when K_I reaches K_IC under mode-I (opening) loading, crack propagation becomes unstable and failure follows. The J-integral generalizes K_I to elastic-plastic conditions where the crack tip develops a plastic zone of size r_p = (1/(6*pi)) * (K_I / sigma_y)^2, and the crack tip opening displacement (CTOD) quantifies plastic blunting at the tip before propagation. The Paris law da/dN = C * (delta K)^m describes sub-critical fatigue crack growth where cracks extend incrementally under cyclic loading before reaching critical size. Fracture modes include mode I (tensile opening, most dangerous in brittle materials), mode II (in-plane shear), and mode III (out-of-plane shear, tearing); real cracks often exhibit mixed-mode loading. Brittle fracture propagates at speeds approaching the Rayleigh wave velocity with minimal plastic deformation, characteristic of low-temperature ceramics and heavily cold-worked metals. Ductile fracture involves extensive plastic deformation with void nucleation, growth, and coalescence at second-phase particles, producing the cup-and-cone morphology. The ductile-to-brittle transition temperature (DBTT) marks the boundary where cleavage replaces microvoid coalescence as the dominant mechanism. Crack arrest occurs when K_I drops below K_Ia at ligaments of tougher material, splitting cracks across branches. R-curves describe rising resistance to propagation from crack-wake toughening mechanisms including bridging, deflection, and transformation toughening. In DLMM context, bins that have accumulated plastic strain and lost ductility reserve develop fracture-analog instabilities where concentration collapses catastrophically into narrow ranges — the LP-position equivalent of unstable crack propagation. Stress concentrations at sharp compositional gradients nucleate micro-cracks (localized imbalance spikes) that grow under continued trading pressure until they coalesce into full rebalancing failures. Bins near K_IC threshold are metastable and can shatter with modest additional stress; bins well below threshold have toughness reserve and can absorb further deformation. Fracture-susceptible pools exhibit narrow critical crack lengths a_c = (K_IC / (Y * sigma))^2 / pi, meaning small disturbances trigger propagation. Measures stress intensity factor (K_I crack-tip singular stress field, ranges 0 to 1 — high K_I means strong stress singularity at defects with proximity to critical value, low K_I means modest stress concentration), fracture toughness (K_IC material resistance to crack propagation, ranges 0 to 1 — high K_IC means bin can absorb large stress intensity before failure, low K_IC means easy crack propagation), critical crack length (a_c = (K_IC/(Y*sigma))^2 / pi, ranges 0 to 1 — low a_c means small defect triggers failure and is dangerous, high a_c means bin tolerates larger defects before instability), Griffith stress (critical remote stress sigma_c from energy balance, ranges 0 to 1 — high Griffith stress means large remote stress required to propagate crack, low Griffith stress means easy propagation), J-integral (elastic-plastic energy release rate, ranges 0 to 1 — high J means significant energy available to drive crack extension, low J means insufficient driving force), crack tip opening displacement (CTOD plastic blunting, ranges 0 to 1 — high CTOD means significant plastic blunting that delays propagation, low CTOD means sharp crack tip approaches cleavage), plastic zone size (r_p size of plastic zone at crack tip, ranges 0 to 1 — high r_p means large plastic zone reduces effective stress, low r_p means small zone with limited shielding), crack growth rate (Paris law da/dN, ranges 0 to 1 — high rate means rapid sub-critical crack extension under cyclic loading, low rate means slow growth with long life), mode 1 intensity (opening-mode K_I component, ranges 0 to 1 — high means dominant tensile loading most dangerous for brittle materials, low means shear-dominated or compression), mode 2 intensity (shear-mode K_II component, ranges 0 to 1 — high means tearing at bin boundary, low means shear-free loading), mixed mode ratio (K_I fraction of total intensity, ranges 0 to 1 — high means predominantly mode I opening, low means predominantly shear), brittleness index (brittle vs ductile character, ranges 0 to 1 — high means cleavage dominant with minimal plastic dissipation, low means ductile with microvoid coalescence), R-curve rising (rising crack growth resistance from wake toughening, ranges 0 to 1 — high means resistance rises with extension through bridging and deflection, low means flat R-curve with no toughening), arrest capability (K_Ia crack arrest threshold, ranges 0 to 1 — high means crack stoppable by ligaments of tougher material, low means no arrest mechanism), and fracture risk (imminent failure likelihood from K_I / K_IC proximity, ranges 0 to 1 — high means crack propagation imminent, low means safe toughness reserve). Composite fracture index (0-100, higher means healthier toughness reserve — high K_IC, low fracture risk, ductile character, rising R-curve). Classifies pools by fracture regime as TOUGH (index >= 80 — bins have maximum toughness reserve with low fracture risk, ductile character, and robust crack-arrest capability), RESILIENT (60-80 — bins have substantial toughness reserve with mostly ductile response, crack propagation resisted but some susceptibility), METASTABLE (40-60 — bins are at moderate fracture risk with K_I approaching K_IC, balanced between toughness and susceptibility), FRAGILE (20-40 — bins have limited toughness reserve with elevated fracture risk, small disturbances can trigger propagation), or CRITICAL (< 20 — bins are at imminent fracture risk, K_I near or exceeding K_IC with catastrophic failure likely). Fracture verdict as BRITTLE_FRACTURE_IMMINENT (high risk with high brittleness — cleavage-type sudden failure likely), DUCTILE_FAILURE_IMMINENT (high risk with low brittleness — plastic collapse via void coalescence), STABLE_AT_HIGH_STRESS (high K_I with high K_IC — bins carry large stress but tough enough to resist), SUBCRITICAL_GROWTH (elevated crack growth rate with moderate risk — Paris regime with sub-critical extension), OPENING_MODE_DOMINANT (high mode 1 with brittleness — dangerous tensile opening configuration), ARREST_CAPABLE (high arrest capability with rising R-curve — cracks can be stopped by toughening mechanisms), TOUGHNESS_RESERVE (high K_IC with low risk — comfortable safety margin), or FRACTURE_BALANCE (no extreme indicators — typical balanced fracture state)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-fracture/hodlmm-bin-fracture.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Fracture Mechanics Analyzer

## What it does

Models fracture mechanics of HODLMM bins — treats bins as loaded solid-mechanics elements where crack-analog instabilities nucleate at compositional defects, propagate under continued trading pressure, and may lead to catastrophic concentration collapse. Fracture mechanics quantifies crack initiation, growth, and structural failure via Griffith energy balance sigma_c = sqrt(2 * E * gamma_s / (pi * a)), Irwin's stress intensity factor K_I = sigma * sqrt(pi * a) * Y, and the toughness threshold K_IC that separates safe and unstable regimes. The J-integral extends K_I to elastic-plastic conditions, CTOD quantifies plastic blunting at the crack tip, and the Paris law da/dN = C * (delta K)^m describes sub-critical fatigue crack growth.

In DLMM pools, stress concentrations at sharp compositional gradients nucleate micro-cracks (localized imbalance spikes) that grow under continued trading pressure until they coalesce into full rebalancing failures. Bins near the K_IC threshold are metastable and can fail with modest additional stress; bins well below threshold have toughness reserve. Brittle bins experience sudden cleavage-type collapse; ductile bins fail via microvoid coalescence with extensive plastic deformation.

## Why agents need it

LP agents need fracture analysis because it identifies catastrophic-failure risk before it materializes. A TOUGH pool has bins comfortably below K_IC with substantial toughness reserve. A CRITICAL pool has bins at imminent failure risk — K_I near or exceeding K_IC with small disturbances triggering propagation.

Stress intensity factor identifies the driving force at defects. High K_I means strong stress singularity approaching the critical threshold.

Fracture toughness K_IC is the material resistance threshold. High K_IC provides safety margin against crack propagation.

Critical crack length is the defect tolerance. Small critical crack length means tiny disturbances trigger failure — bin is dangerously close to instability.

Fracture risk is the overall proximity-to-failure. High fracture risk demands avoidance of new LP exposure.

Brittleness index distinguishes failure modes. High brittleness means cleavage-type sudden failure; low brittleness means ductile cup-and-cone collapse.

Arrest capability is the safety net. High arrest capability means cracks can be stopped before catastrophe via tough ligaments.

R-curve rising indicates toughening. High R-curve means resistance grows with extension, resisting unstable propagation.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-fracture/hodlmm-bin-fracture.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-fracture/hodlmm-bin-fracture.ts status
```

### run
Analyzes bin fracture mechanics for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-fracture/hodlmm-bin-fracture.ts run
bun run hodlmm-bin-fracture/hodlmm-bin-fracture.ts run --pool 1
bun run hodlmm-bin-fracture/hodlmm-bin-fracture.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgFractureIndex": 58,
    "toughCount": 0,
    "resilientCount": 1,
    "metastableCount": 3,
    "fragileCount": 1,
    "criticalCount": 0,
    "avgFractureToughness": 0.55,
    "avgFractureRisk": 0.32,
    "avgBrittlenessIndex": 0.42,
    "totalToughBins": 6,
    "totalMetastableBins": 12,
    "totalCriticalBins": 2,
    "avgFractureGini": 0.18
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
      "avgStressIntensityFactor": 0.38,
      "maxStressIntensityFactor": 0.68,
      "avgFractureToughness": 0.55,
      "maxFractureToughness": 0.85,
      "avgCriticalCrackLength": 0.62,
      "minCriticalCrackLength": 0.32,
      "avgGriffithStress": 0.58,
      "minGriffithStress": 0.28,
      "avgJIntegral": 0.42,
      "maxJIntegral": 0.72,
      "avgCrackTipOpeningDisp": 0.48,
      "maxCrackTipOpeningDisp": 0.78,
      "avgPlasticZoneSize": 0.45,
      "maxPlasticZoneSize": 0.75,
      "avgCrackGrowthRate": 0.35,
      "maxCrackGrowthRate": 0.65,
      "avgMode1Intensity": 0.42,
      "maxMode1Intensity": 0.72,
      "avgMode2Intensity": 0.32,
      "maxMode2Intensity": 0.58,
      "avgMixedModeRatio": 0.58,
      "avgBrittlenessIndex": 0.42,
      "maxBrittlenessIndex": 0.72,
      "avgRCurveRising": 0.52,
      "maxRCurveRising": 0.82,
      "avgArrestCapability": 0.5,
      "maxArrestCapability": 0.8,
      "avgFractureRisk": 0.32,
      "maxFractureRisk": 0.62,
      "toughCount": 6,
      "toughFraction": 0.24,
      "metastableCount": 12,
      "metastableFraction": 0.48,
      "criticalCount": 2,
      "criticalFraction": 0.08,
      "fractureGini": 0.18,
      "fractureIndex": 58,
      "fractureRegime": "METASTABLE",
      "fractureVerdict": "FRACTURE_BALANCE",
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

- Fracture mechanics in real materials requires controlled specimens (compact tension, single-edge notched bend) with pre-cracks of known geometry; the DLMM model uses reserve fractions and imbalance proxies on a single snapshot without direct crack-geometry measurement.
- Irwin's K_I = sigma * sqrt(pi * a) * Y requires small-scale yielding conditions where the plastic zone is small compared to crack length and specimen dimensions; DLMM bins may not satisfy this.
- Fracture toughness K_IC is a temperature- and strain-rate-dependent material property; the model uses structural proxies without explicit temperature or loading-rate normalization.
- The J-integral requires closed-loop path integration around the crack tip with measured stress and displacement fields; the model approximates via proxy energy terms.
- Paris law parameters C and m require cyclic loading data across multiple delta K levels; the model uses activity as a qualitative proxy for cyclic driving force.
- Mode decomposition requires full 3D stress analysis at the crack tip; the model uses imbalance and activity as 1D proxies.
- Brittle-to-ductile transition depends on temperature, strain rate, and triaxiality not modeled here.
- R-curves require stable crack growth experiments; the model approximates via toughness and plastic-zone proxies.
- Crack arrest requires specific microstructural features (tougher phases, crack deflectors); the model approximates from toughness reserve and R-curve terms.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
