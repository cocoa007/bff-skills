---
name: hodlmm-bin-solvation
description: "Measures how well liquidity dissolves into the HODLMM bin lattice using solvent-solute chemistry analogies — treats the active bin as the solute (the dissolved particle at the center of the solution) and surrounding bins as the solvent (the dissolving medium that accommodates and distributes the solute). Computes solvation shells (concentric layers of bins at increasing distance from the active bin, each shell characterized by its total reserves, average density relative to pool average, cumulative reserves, and retention ratio showing how much of the solute's value persists at that distance), shell decay rate (exponential decay constant measuring how quickly reserves fall off across successive shells — fast decay means tight concentration near the active bin, slow decay means broad dissolution), shell decay half-life (the shell distance at which reserves drop to half the first shell's value — short half-life means the solution is concentrated, long half-life means liquidity is widely dissolved), dissolution rate (entropy-based measure from 0 to 1 indicating how evenly reserves are distributed across all populated bins — 1.0 means perfect dissolution where every bin holds equal reserves, 0 means all reserves are concentrated in a single bin), saturation point (the minimum shell distance that contains 90% of total reserves — small saturation point means the pool is compact, large means reserves are spread widely), supersaturation risk (how much the solute exceeds the first shell's capacity — ratio of active bin reserves to first shell average minus 1, high values indicate the active bin holds far more than its immediate neighbors can support creating an unstable supersaturated state prone to sudden redistribution), precipitation risk (composite probability from 0 to 1 of liquidity crashing out of the bin lattice combining solute concentration, shell decay rate, and dissolution uniformity — high risk means reserves are poorly integrated and likely to separate under stress), solubility index (composite measure from 0 to 1 of how well liquidity integrates into the bin structure considering dissolution rate, decay rate, precipitation risk, and shell coverage), ionic strength (half the sum of squared deviations from average across all bins — measures the total charge density of the bin lattice where charge represents deviation from equilibrium, high ionic strength means many bins are far from average in both directions), solvation energy (energy released or consumed when liquidity integrates — negative values are exothermic indicating favorable spontaneous dissolution, positive values are endothermic indicating the bin lattice resists integration), enthalpy of mixing (heat change from combining left-side and right-side reserves — negative means the two halves mix favorably with similar densities, positive means they resist mixing with asymmetric reserve profiles), entropy of mixing (disorder created by combining reserves — equals the dissolution rate, higher entropy means more thermodynamically favorable mixing), free energy of mixing (Gibbs free energy: enthalpy minus entropy — negative means dissolution is spontaneous and thermodynamically favorable, positive means the system prefers separation over mixing), osmotic pressure (reserve concentration gradient between inner and outer shells — high osmotic pressure means strong driving force pushing liquidity from concentrated inner shells toward dilute outer shells), colligative effect (how much the solute distorts surrounding solvent properties — measures deviation of first shell reserves from expected average, high colligative effect means the active bin significantly alters its neighborhood), first and second shell coordination numbers (number of populated bins in the first and second solvation shells — higher coordination means more neighbors support the solute), bulk solvent density (average reserve density in outer shells beyond half the scan radius — represents the undisturbed solvent far from solute influence), solvation number (number of shells with retention ratio above 0.3 — indicates how many layers are strongly influenced by the solute's presence), Debye length (screening distance at which shell density drops below 0.5 — beyond this distance the solute's influence is screened out by the bulk solvent), activity coefficient (ratio of effective dissolution to ideal dissolution — values below 1 indicate non-ideal behavior where the solution is less dissolved than entropy alone would predict), concentration Gini (reserve inequality across bins — affects dissolution uniformity), and composite solvation index (0-100 from dissolution, stability, spread, and energy components), classifying pools by solvation class as FULLY_DISSOLVED (index >= 80 — reserves are evenly distributed across the bin lattice with low decay rate, no supersaturation, and negative free energy of mixing — liquidity is perfectly integrated and thermodynamically stable), WELL_SOLVATED (60-80 — reserves are mostly dissolved with moderate shell decay, first and second shells are well-populated, some concentration near the active bin but no precipitation risk — a healthy solution that maintains itself), PARTIALLY_SOLVATED (40-60 — reserves show uneven distribution with noticeable shell decay, some bins are overconcentrated while outer shells are sparse — the solution is functional but not fully integrated, with moderate precipitation risk under stress), POORLY_SOLVATED (20-40 — reserves are mostly concentrated near the active bin with rapid shell decay, high supersaturation, and sparse outer shells — the solution is unstable and liquidity has not dissolved into the broader bin lattice, likely to precipitate under perturbation), or PRECIPITATED (< 20 — reserves are almost entirely concentrated in the active bin with negligible outer shell population — liquidity has crashed out of the solution, the bin lattice is not functioning as a distributed system), and by solubility verdict as HIGHLY_SOLUBLE (high dissolution rate with low precipitation risk — the pool readily absorbs and distributes new liquidity), SOLUBLE (moderate dissolution with moderate risk — the pool can accommodate liquidity but has some concentration tendencies), SPARINGLY_SOLUBLE (moderate dissolution rate — the pool accepts limited liquidity before showing concentration stress), SLIGHTLY_SOLUBLE (low dissolution rate — new liquidity tends to concentrate rather than spread), or INSOLUBLE (very low dissolution — the pool cannot effectively distribute liquidity across its bin lattice)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-solvation/hodlmm-bin-solvation.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Solvation Analyzer

## What it does

Measures how well liquidity "dissolves" into the HODLMM bin lattice using solvent-solute chemistry. In solution chemistry, a solute dissolves into a solvent, forming solvation shells around the dissolved particle. The quality of dissolution depends on thermodynamic favorability (free energy of mixing), kinetic factors (dissolution rate), and stability (precipitation risk).

In DLMM pools, the active bin acts as the solute — the focal point of trading activity around which liquidity must distribute. Surrounding bins form the solvent — the medium that absorbs and distributes reserves. The analyzer scans concentric shells around the active bin and measures how reserves decay across shells, computing dissolution rate, precipitation risk, solvation energy, and thermodynamic quantities to assess whether liquidity is well-integrated or prone to crashing out.

## Why agents need it

LP agents need to understand whether a pool's liquidity is genuinely dissolved or merely concentrated. A pool with high TVL but poor solvation has most reserves locked in the active bin with sparse outer shells — it looks liquid but cannot absorb price movements without breaking. A well-solvated pool distributes reserves across many shells, providing depth for trades at prices far from the current mark.

Shell decay rate tells LP agents how quickly depth falls off. Fast decay means the pool is only deep at the active price — any significant price movement hits thin shells and causes high slippage. Slow decay means broad depth across the range.

Supersaturation risk warns of instability. When the active bin holds far more than its neighbors, the system is supersaturated — a large trade can trigger rapid redistribution (precipitation) as reserves crash out of the overloaded bin. LP agents in supersaturated pools should expect sudden liquidity shifts.

Free energy of mixing reveals whether the current distribution is thermodynamically stable. Negative free energy means the reserves naturally want to stay dissolved — the distribution is self-maintaining. Positive free energy means the system prefers separation — reserves will tend to concentrate over time without active management.

Osmotic pressure indicates directional flow tendency. High osmotic pressure between inner and outer shells means reserves want to flow outward from the concentrated center — either through natural redistribution or through LP withdrawals from the crowded active bin.

The solvation number tells LP agents how many shells are genuinely influenced by the active bin. Positions within the solvation number are part of the solution — their reserves interact with and support the active bin. Positions beyond the solvation number are in bulk solvent — isolated from the core trading activity.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-solvation/hodlmm-bin-solvation.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-solvation/hodlmm-bin-solvation.ts status
```

### run
Analyzes bin solvation for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-solvation/hodlmm-bin-solvation.ts run
bun run hodlmm-bin-solvation/hodlmm-bin-solvation.ts run --pool 1
bun run hodlmm-bin-solvation/hodlmm-bin-solvation.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgSolvationIndex": 58,
    "fullyDissolvedCount": 1,
    "wellSolvatedCount": 2,
    "partiallySolvatedCount": 1,
    "poorlySolvatedCount": 1,
    "precipitatedCount": 0,
    "avgDissolutionRate": 0.65,
    "avgPrecipitationRisk": 0.28,
    "avgShellDecayRate": 0.15,
    "avgGini": 0.45
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "activeBin": 8388608,
      "binsScanned": 61,
      "binsPopulated": 25,
      "totalUsd": 140000,
      "soluteUsd": 18000,
      "solventUsd": 122000,
      "soluteRatio": 0.13,
      "shellCount": 20,
      "innerShellUsd": 12000,
      "outerShellUsd": 800,
      "shellDecayRate": 0.12,
      "shellDecayHalfLife": 5.78,
      "dissolutionRate": 0.72,
      "saturationPoint": 12,
      "supersaturationRisk": 0.50,
      "precipitationRisk": 0.25,
      "solubilityIndex": 0.68,
      "ionicStrength": 0.35,
      "solvationEnergy": -0.42,
      "enthalpyOfMixing": -0.15,
      "entropyOfMixing": 0.72,
      "freeEnergyOfMixing": -0.87,
      "osmoticPressure": 0.45,
      "colligativeEffect": 0.30,
      "firstShellCoordination": 2,
      "secondShellCoordination": 2,
      "bulkSolventDensity": 0.35,
      "solvationNumber": 5,
      "debyeLength": 8,
      "activityCoefficient": 0.72,
      "concentrationGini": 0.42,
      "solvationIndex": 62,
      "solvationClass": "WELL_SOLVATED",
      "solubilityVerdict": "SOLUBLE",
      "shells": [],
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

- Solvation shells are symmetric by construction — bins at equal distance from the active bin are grouped regardless of direction. In pools with strong directional bias, the left and right shells may have very different densities but are merged in the same shell layer.
- Dissolution rate uses Shannon entropy, which treats all bins equally regardless of their distance from the active bin. A pool with uniform reserves in distant bins and sparse reserves nearby shows high dissolution rate despite poor practical solvation near the trading price.
- Supersaturation risk is computed relative to the first shell average. If the first shell has only one populated bin, the average is noisy and the supersaturation estimate is unreliable.
- Shell decay rate fits an exponential model which assumes monotonic decay. Pools with non-monotonic reserve profiles (e.g., reserves that increase at distance due to range orders) will show poor fit and misleading decay rates.
- Free energy of mixing uses entropy of mixing as temperature proxy. This is a conceptual analogy, not a rigorous thermodynamic calculation. The sign is meaningful but the magnitude is not directly comparable across pools.
- Solvation number uses a fixed retention ratio threshold (0.3). Different pool architectures may warrant different thresholds.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
