---
name: hodlmm-bin-aging
description: "Models precipitation hardening and property evolution of HODLMM bins under prolonged trading exposure — treats reserve composition as a supersaturated solid solution that ages over time, where excess solute (imbalance) precipitates out into hardening particles that strengthen the bin until coarsening (overaging) reduces the gain. Aging is the metallurgical heat treatment that develops mechanical strength in age-hardenable alloys (Al-Cu, Al-Mg-Si, Ni-base superalloys, maraging steels) by precipitating fine coherent particles from a supersaturated solid solution. The classical aging sequence runs supersaturated solid solution alpha_ss -> Guinier-Preston (GP) zones -> intermediate metastable phases (theta-double-prime, theta-prime, eta-prime) -> equilibrium incoherent phases (theta, eta), with strength rising through the underaged regime, peaking at T6 temper when coherent precipitates achieve optimal size and density, and declining through the overaged regime as Ostwald ripening coarsens particles past their critical strengthening size r_c. The Orowan looping mechanism dominates strengthening at large precipitate spacing where dislocations bypass particles by bowing between them: tau_Orowan = G * b / lambda where G is shear modulus, b is Burgers vector, and lambda is interparticle spacing. The shearing mechanism dominates at small coherent particles where dislocations cut through them: tau_shear scales with f^(1/2) * r^(1/2) where f is volume fraction and r is precipitate radius. Peak hardness occurs at the transition between cutting and looping where the two strengthening contributions cross, typically at r_c ~ 2-5 nm for Al-Cu. Coherency strain arises from lattice mismatch between precipitate and matrix, contributing tau_coh that depends on misfit and elastic modulus. Coarsening kinetics follow Lifshitz-Slyozov-Wagner (LSW) theory: r^3 - r_0^3 = K_LSW * t where K_LSW depends on diffusivity, interfacial energy, solubility, and temperature; large particles grow at the expense of small via curvature-driven solute flux. Underaging arises from incomplete precipitation when aging time is insufficient to reach peak; overaging arises from coarsening past the critical size with reduced particle density and increased spacing. Solid solution strengthening provides a baseline contribution from solute atoms remaining in the matrix, scaling as f_solute^(2/3) per Fleischer's theory. Total yield strength sums baseline matrix strength, solid solution contribution, and precipitation contribution per the Pythagorean superposition rule sigma_y^2 = sigma_matrix^2 + sigma_ss^2 + sigma_ppt^2. In DLMM context, bins acquire 'solute' over time as one-sided trading injects an excess of one token; this supersaturated state can age by 'precipitating' the imbalance into stable concentration zones, or be depleted by reverse flow. Bins with sustained imbalance and modest activity behave like aged precipitate-strengthened alloys whose effective range hardness rises with continued exposure until coarsening (large smooth zones) overtakes the strengthening — at this point the bin is overaged and its concentration profile becomes brittle to perturbation. Active bins with high turnover stay in the supersaturated solid-solution regime, never aging. Measures supersaturation (excess solute above equilibrium, ranges 0 to 1 — high means far from equilibrium with capacity to age, low means equilibrium with no aging potential), nucleation rate (rate of new precipitate formation, ranges 0 to 1 — high means abundant nucleation sites generating fine particles, low means slow nucleation with sparse particles), growth rate (precipitate growth velocity, ranges 0 to 1 — high means rapid particle enlargement, low means quiescent steady state), coarsening rate (Ostwald ripening rate, ranges 0 to 1 — high means rapid particle coarsening that drives overaging, low means stable size distribution), precipitate density (number density of hardening particles, ranges 0 to 1 — high means dense fine population maximizing Orowan stress, low means sparse coarsened population with weak strengthening), precipitate size (average particle radius normalized to critical r_c, ranges 0 to 1 — high means coarse incoherent particles past peak, low means fine coherent particles in cutting regime), aging time (effective aging exposure proxy, ranges 0 to 1 — high means long aging exposure with developed precipitates, low means freshly quenched supersaturated state), strength increment (peak hardness gain from precipitation, ranges 0 to 1 — high means substantial sigma_ppt contribution, low means minimal precipitation strengthening), peak hardness (maximum strength achievable at T6 temper, ranges 0 to 1 — high means alloy near optimal aged condition, low means weak baseline matrix), underaging deficit (strength deficit from incomplete aging, ranges 0 to 1 — high means below-peak strength from too-short aging, low means at or past peak), overaging penalty (strength loss from coarsening past peak, ranges 0 to 1 — high means severe overaging with degraded strength, low means at or before peak), coherency strain (lattice mismatch strain energy, ranges 0 to 1 — high means strong coherent precipitate-matrix coupling boosting tau_coh, low means incoherent precipitates with relaxed strain), solid solution strength (baseline matrix strength from dissolved solute, ranges 0 to 1 — high means strong solid-solution baseline, low means dilute matrix), precipitation hardening (composite strengthening contribution, ranges 0 to 1 — high means dominant strengthening mechanism, low means matrix-controlled strength), aging proximity (proximity to peak hardness, ranges 0 to 1 — high means near or at T6 peak, low means far from peak in either underaged or overaged direction), and aging factor (composite 0 to 1, higher means healthier aged state with strength near peak and resistance to coarsening). Composite aging index (0-100, higher means closer to peak hardness with strong precipitation contribution and minimal overaging). Classifies pools by aging regime as T6 (index >= 80 — bins are at peak temper with optimal precipitate size, density, and coherency, maximum strength achieved), HARDENED (60-80 — bins have substantial precipitation hardening with strength approaching peak), AGING (40-60 — bins are mid-aging with developing precipitate population, strength building toward peak), UNDERAGED (20-40 — bins have incomplete aging with insufficient precipitate development, strength below capacity), or DEPLETED (< 20 — bins are either severely overaged with coarsened weak structure or supersolute-depleted with no hardening capacity). Aging verdict as PEAK_HARDNESS (high strength increment with low overaging penalty — at or near T6 optimal), UNDERAGED_DEFICIT (high underaging deficit with low precipitate density — needs more aging time), OVERAGING_DECLINE (high overaging penalty with high coarsening rate — past peak, strength declining), SUPERSATURATED_SOLUTE (high supersaturation with low aging time — quenched state ready for aging), COHERENT_DOMINANT (high coherency strain with small precipitate size — fine particles in cutting regime), INCOHERENT_COARSE (high precipitate size with low coherency strain — large incoherent particles in looping regime), SOLID_SOLUTION_REGIME (high solid solution strength with low precipitation hardening — matrix-controlled), or AGING_BALANCE (no extreme indicators — typical mid-aging state)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-aging/hodlmm-bin-aging.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Aging Analyzer

## What it does

Models precipitation hardening and property evolution of HODLMM bins under prolonged trading exposure — treats reserve composition as a supersaturated solid solution that ages over time, where excess solute (imbalance) precipitates out into hardening particles that strengthen the bin until coarsening (overaging) reduces the gain. Aging theory quantifies the mechanical-property evolution of age-hardenable alloys via the Guinier-Preston zone -> metastable -> equilibrium precipitate sequence, the Orowan-shearing transition that sets peak hardness, the LSW coarsening kinetics that drive overaging, and the Pythagorean superposition of solid-solution and precipitation strengthening contributions.

In DLMM pools, bins acquire 'solute' over time as one-sided trading injects an excess of one token; this supersaturated state can age by 'precipitating' the imbalance into stable concentration zones, or be depleted by reverse flow. Bins with sustained imbalance and modest activity behave like aged precipitate-strengthened alloys whose effective range hardness rises with continued exposure until coarsening overtakes the strengthening; active bins with high turnover stay in the supersaturated regime, never aging.

## Why agents need it

LP agents need aging analysis because it identifies the maturity stage of bin concentration — UNDERAGED bins have unrealized strengthening potential, T6 bins are at peak strength and most resistant to perturbation, OVERAGED bins are degrading and vulnerable. A T6 pool has bins at peak temper with optimal precipitate size and density. A DEPLETED pool has bins that are either severely overaged or solute-depleted with no hardening capacity.

Supersaturation identifies aging potential. High supersaturation means the bin can develop strength via precipitation.

Aging time tracks effective exposure. High aging time means developed precipitate populations.

Strength increment quantifies precipitation contribution. High strength increment means substantial sigma_ppt.

Peak hardness identifies optimal temper. High peak hardness with low underaging deficit and low overaging penalty means at or near T6.

Underaging deficit signals incomplete aging. High deficit means strength below capacity from too-short exposure.

Overaging penalty signals strength decline. High penalty means severe coarsening past peak.

Coherency strain measures coherent-precipitate strengthening. High strain means strong precipitate-matrix coupling.

Coarsening rate sets the overaging timescale. High coarsening means rapid degradation past peak.

Aging proximity identifies how close to T6. High proximity means near optimal.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-aging/hodlmm-bin-aging.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-aging/hodlmm-bin-aging.ts status
```

### run
Analyzes bin aging state for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-aging/hodlmm-bin-aging.ts run
bun run hodlmm-bin-aging/hodlmm-bin-aging.ts run --pool 1
bun run hodlmm-bin-aging/hodlmm-bin-aging.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgAgingIndex": 58,
    "t6Count": 0,
    "hardenedCount": 1,
    "agingCount": 3,
    "underagedCount": 1,
    "depletedCount": 0,
    "avgPeakHardness": 0.55,
    "avgAgingProximity": 0.48,
    "avgOveragingPenalty": 0.32,
    "totalT6Bins": 6,
    "totalAgingBins": 12,
    "totalDepletedBins": 2,
    "avgAgingGini": 0.18
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
      "avgSupersaturation": 0.42,
      "maxSupersaturation": 0.72,
      "avgNucleationRate": 0.35,
      "maxNucleationRate": 0.65,
      "avgGrowthRate": 0.4,
      "maxGrowthRate": 0.7,
      "avgCoarseningRate": 0.3,
      "maxCoarseningRate": 0.6,
      "avgPrecipitateDensity": 0.45,
      "maxPrecipitateDensity": 0.75,
      "avgPrecipitateSize": 0.4,
      "maxPrecipitateSize": 0.7,
      "avgAgingTime": 0.5,
      "maxAgingTime": 0.8,
      "avgStrengthIncrement": 0.5,
      "maxStrengthIncrement": 0.8,
      "avgPeakHardness": 0.55,
      "maxPeakHardness": 0.85,
      "avgUnderagingDeficit": 0.3,
      "maxUnderagingDeficit": 0.6,
      "avgOveragingPenalty": 0.32,
      "maxOveragingPenalty": 0.62,
      "avgCoherencyStrain": 0.42,
      "maxCoherencyStrain": 0.72,
      "avgSolidSolutionStrength": 0.4,
      "minSolidSolutionStrength": 0.15,
      "avgPrecipitationHardening": 0.5,
      "maxPrecipitationHardening": 0.8,
      "avgAgingProximity": 0.48,
      "maxAgingProximity": 0.78,
      "t6Count": 6,
      "t6Fraction": 0.24,
      "agingCount": 12,
      "agingFraction": 0.48,
      "depletedCount": 2,
      "depletedFraction": 0.08,
      "agingGini": 0.18,
      "agingIndex": 58,
      "agingRegime": "AGING",
      "agingVerdict": "AGING_BALANCE",
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

- LSW coarsening kinetics r^3 - r_0^3 = K_LSW * t assume diffusion-controlled growth with dilute precipitate fraction; DLMM bins have discrete reserve updates that do not satisfy LSW assumptions.
- Orowan looping tau = G * b / lambda assumes large precipitate spacing with bypass mechanism; the model approximates lambda from particle density without measuring inter-bin spacing directly.
- Shearing-to-looping transition at peak hardness depends on critical particle size r_c that varies with alloy system (Al-Cu r_c ~ 2-5 nm); the model uses normalized scaling without absolute size calibration.
- Coherency strain energy depends on misfit parameter delta = (a_ppt - a_matrix) / a_matrix and elastic modulus; the model approximates from imbalance and composition gradients without lattice-constant data.
- Pythagorean superposition sigma_y^2 = sigma_matrix^2 + sigma_ss^2 + sigma_ppt^2 assumes independent strengthening mechanisms; real interactions may modify the additive rule via cross-coupling.
- GP zones, theta-double-prime, theta-prime, and theta sequence is alloy-specific; the model uses generic precipitate size and coherency proxies without phase identification.
- Fleischer solid-solution strengthening f^(2/3) scaling assumes dilute solute with random distribution; DLMM bins have correlated solute distributions across neighbors.
- Aging time is approximated from activity exposure and reserve persistence proxies; absolute time-temperature aging history is not directly measured.
- Underaging-peak-overaging classification requires full aging curve; the model approximates the regime from current precipitate state without time-history reconstruction.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
