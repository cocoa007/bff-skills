---
name: hodlmm-bin-chromatography
description: "Models chromatographic separation dynamics across HODLMM bins — treats the bin range as a chromatographic column where token reserves partition between stationary and mobile phases. Governed by the partition equilibrium K = Cs/Cm where K is the ratio of analyte concentration in the stationary phase to the mobile phase, determining how strongly each reserve component is retained on the column. In DLMM context, token Y reserves act as the stationary phase (retained in the bin, not actively traded) while token X reserves act as the mobile phase (flowing through the column driven by trading volume), and the partition coefficient at each bin reflects the local thermodynamic preference for retention versus elution. Measures partition coefficient (K = Cs/Cm — the fundamental equilibrium constant governing separation, calculated as the ratio of stationary-phase Y reserves to mobile-phase X reserves at each bin, a high K means reserves are strongly retained in the stationary phase with most value locked in Y tokens while a low K means reserves are predominantly in the mobile X phase and flowing freely through the column, the partition coefficient is determined by the intermolecular interactions between the analyte and each phase which in DLMM context maps to the price-driven preference for holding one token over the other at each bin position), retention factor (Rf = 1/(1+K) — the fraction of total analyte in the mobile phase, ranging from 0 to 1, low Rf means the bin strongly retains reserves in the stationary phase with most value locked and immobile, high Rf means reserves are predominantly mobile and flowing through the column with trading activity, the retention factor is the inverse measure of how sticky the bin is where sticky bins with low Rf act as chromatographic traps that accumulate and hold reserves while slippery bins with high Rf let reserves pass through freely), plate height (HETP — Height Equivalent to a Theoretical Plate, measures the separation efficiency per bin step, calculated from the variance of the local reserve distribution normalized by the column length, low plate height means efficient separation where each bin contributes meaningfully to resolving reserve components, high plate height means poor separation efficiency with reserves blurring together across bins, plate height increases with band broadening from eddy diffusion longitudinal diffusion and mass transfer resistance), resolution (Rs — peak separation quality between adjacent reserve clusters, measures how well-separated the reserve concentration at this bin is from neighboring reserve peaks, Rs > 1.5 means baseline resolution with complete separation between peaks, Rs between 0.5 and 1.5 means partial overlap, Rs < 0.5 means severe overlap or coelution where reserve peaks merge into an unresolvable band, high resolution indicates the bin sits at a distinct concentration peak clearly differentiated from its neighbors), peak asymmetry (As — the ratio of trailing to leading half-widths of the local reserve distribution, As = 1 means a perfectly symmetric Gaussian peak, As > 1 means tailing where reserves trail off slowly on one side indicating secondary retention mechanisms or overloading, As < 1 means fronting where the leading edge is broader than the trailing edge indicating anti-Langmuir adsorption isotherms, asymmetric peaks reduce effective resolution and indicate non-ideal chromatographic behavior), capacity factor (k' — column loading ratio measuring how much reserve mass the bin retains relative to its void volume, k' = (tR - t0)/t0 in classical chromatography maps to the ratio of retained to unretained reserves, high capacity factor means the bin is heavily loaded with retained reserves approaching column overload, low capacity factor means the bin is lightly loaded with most capacity unused, optimal capacity factors balance loading efficiency against peak broadening from overload), selectivity (alpha — relative retention between token X and Y phases compared to neighboring bins, alpha = k2'/k1' measures the thermodynamic preference differential between phases, alpha close to 1 means the bin has similar phase preferences to its neighbors with no selective advantage, alpha significantly different from 1 means this bin preferentially retains one phase relative to neighbors creating a selectivity hotspot, high selectivity enables better separation of reserve components but may indicate price discontinuities or LP concentration asymmetries), band broadening (sigma — the standard deviation of the local reserve distribution normalized by total pool reserves, measures how reserves spread from their concentration center due to multiple dispersion mechanisms including eddy diffusion from irregular bin packing longitudinal molecular diffusion from concentration gradients and resistance to mass transfer between phases, high band broadening means reserves are smeared across many bins reducing peak height and resolution, low band broadening means reserves are tightly concentrated in sharp well-defined peaks), tailing factor (Tf — asymmetry of the reserve distribution trailing edge, calculated from peak asymmetry modified by volume activity, Tf > 2 indicates severe tailing where a long tail of reserves extends beyond the main peak possibly from secondary retention sites or irreversible adsorption, Tf near 1 indicates ideal Gaussian peak shape with symmetric leading and trailing edges, high tailing factors degrade chromatographic performance by reducing effective plate count and obscuring minor peaks in the tail), column efficiency (N — number of theoretical plates, the dimensionless measure of total separation power, N = L/H where L is the column length in bins and H is the plate height, higher N means more effective separation stages allowing finer resolution of reserve components, N > 50 indicates excellent separation with the column providing many independent equilibration stages, N < 10 indicates poor separation where the column acts more like a mixing vessel than a separation device), elute strength (Es — mobile phase strength driving elution of retained reserves, combines volume activity with mobile phase fraction, high elute strength means strong solvent power that strips retained reserves from the stationary phase accelerating their migration through the column, low elute strength means weak elution power allowing reserves to remain strongly retained, elute strength varies across the bin range creating a natural gradient elution profile), dead volume (Vd — fraction of bin capacity not participating in separation, the void space within the bin that does not contribute to retention or separation, high dead volume means the bin is mostly empty with reserves occupying only a small fraction of available capacity leading to excessive dilution and band broadening, low dead volume means efficient capacity utilization with reserves well-packed and actively participating in the separation process), peak capacity (nc — maximum number of resolvable reserve clusters in the local region, derived from column efficiency and resolution as nc = 1 + sqrt(N) * Rs / 4, represents the theoretical information content of the chromatographic separation at this bin, high peak capacity means the local region can distinguish many separate reserve features while low peak capacity means features merge into an unresolvable continuum), and separation factor (Sf — composite quality metric combining resolution column efficiency selectivity and band broadening into a single 0-1 score, weights resolution and efficiency equally at 30% each with selectivity and inverse broadening at 20% each, high separation factor indicates the bin achieves clean precise separation of reserve components across all quality dimensions, low separation factor indicates poor separation quality from one or more degraded dimensions). Composite chromatography index (0-100, higher means more chromatographic stress and separation challenge). Classifies pools by phase as OVERLOADED_COLUMN (index >= 80 — column capacity exceeded with reserves far beyond optimal loading, severe band broadening and peak distortion, resolution degraded across all bins, analogous to injecting too much sample onto an analytical column where peaks merge into a broad featureless band and separation quality collapses), GRADIENT_ELUTION (60-80 — significant variation in elute strength across the bin range creating a gradient separation profile, some bins strongly retaining while others are actively eluting, transitional state with mixed retention and release dynamics driving reserves through the column), ISOCRATIC_FLOW (40-60 — moderate uniform elution across bins, reserves flowing through the column at a steady rate with consistent retention and release, the standard operating condition for most stable separations with predictable migration rates), EQUILIBRATED_COLUMN (20-40 — column near equilibrium with reserves well-distributed between phases, low band broadening and symmetric peaks, efficient separation with good resolution, the optimal analytical condition), or VOID_COLUMN (< 20 — column mostly unoccupied with minimal reserves participating in separation, dead volume dominates, no meaningful chromatographic separation occurring, the column is essentially empty and acting as an open tube). Chromatography verdict as BAND_COLLAPSE (severe band broadening with reserves smeared across the entire column losing all peak structure — resolution has degraded below useful levels and individual reserve features cannot be distinguished from the broadened baseline noise), FRONTING_CASCADE (widespread peak fronting with leading edges broader than trailing edges across multiple bins — indicates anti-Langmuir behavior where dilute reserves migrate faster than concentrated reserves creating a characteristic shark-fin peak shape that propagates through the column), TAILING_DRIFT (systematic peak tailing across the column with reserves trailing behind their main peaks — indicates secondary retention mechanisms surface activity or column overloading that creates persistent tails obscuring minor peaks and degrading effective plate count), BASELINE_RESOLUTION (clean separation with well-resolved symmetric peaks across most of the column — reserves are distributed in distinct well-separated concentration peaks with minimal overlap indicating excellent chromatographic performance), or COELUTION_TRAP (poor resolution with multiple reserve components co-eluting at the same retention time — peaks overlap severely making it impossible to distinguish individual reserve features, the column lacks sufficient selectivity or efficiency to separate the reserve mixture into distinct components)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-chromatography/hodlmm-bin-chromatography.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Chromatography Analyzer

## What it does

Models chromatographic separation dynamics across HODLMM bins. In analytical chemistry, chromatography separates mixtures by passing them through a stationary phase where different components partition between the stationary and mobile phases based on their affinity. The partition coefficient K = Cs/Cm governs how strongly each component is retained, the plate height H measures separation efficiency per theoretical stage, and resolution Rs quantifies peak separation quality.

In DLMM pools, the bin range acts as a chromatographic column. Token Y reserves behave as the stationary phase (retained, less mobile) while token X reserves act as the mobile phase (flowing with trading volume). Each bin is a theoretical plate where reserves equilibrate between phases. The partition coefficient at each bin reflects the local balance between retained and mobile reserves, the plate height measures how efficiently each bin separates reserve components, and band broadening tracks how reserves spread from their concentration centers.

## Why agents need it

LP agents need chromatographic analysis because it reveals how effectively the pool separates and distributes reserve components across the bin range. Unlike flow or pressure models that track forces, chromatography identifies the quality of reserve separation — whether reserves form distinct well-resolved peaks or blur into unresolvable bands.

The partition coefficient immediately shows the phase preference at each bin. High K bins strongly retain Y-phase reserves — they are chromatographic traps that accumulate and hold value in the stationary phase. Low K bins let reserves flow freely in the mobile X phase. LP agents can use the partition landscape to identify where reserves are being trapped versus where they are flowing.

Retention factor Rf is the inverse mobility metric. Low Rf bins are sticky — they grab reserves and hold them. High Rf bins are slippery — reserves pass through without being captured. The retention profile across the bin range reveals the column's selectivity: which bins are doing the separation work and which are just dead volume.

Plate height measures separation efficiency per bin step. Low plate height means each bin contributes meaningfully to resolving reserve features — the column is working efficiently. High plate height means reserves blur together across bins — poor separation that wastes column capacity. LP agents should prefer positioning in low-plate-height regions where their reserves will be part of distinct, well-resolved concentration peaks rather than lost in broad featureless bands.

Resolution quantifies peak separation quality. Rs > 1.0 means reserve peaks are well-separated from neighbors — the LP position is distinct and identifiable. Rs < 0.5 means severe overlap with neighboring peaks — the position blurs into the surrounding reserve landscape and loses its individual character.

Peak asymmetry reveals non-ideal behavior. Tailing (As > 1) means reserves drag behind the main peak — possibly from secondary retention or overloading. Fronting (As < 1) means dilute reserves run ahead of concentrated ones. Both reduce effective separation and signal chromatographic stress in the column.

Column efficiency N is the total separation power. High N means the pool provides many independent equilibration stages — fine-grained separation of reserve features. Low N means the pool acts more like a mixing vessel — reserves blend together without meaningful separation.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-chromatography/hodlmm-bin-chromatography.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-chromatography/hodlmm-bin-chromatography.ts status
```

### run
Analyzes bin chromatographic separation dynamics for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-chromatography/hodlmm-bin-chromatography.ts run
bun run hodlmm-bin-chromatography/hodlmm-bin-chromatography.ts run --pool 1
bun run hodlmm-bin-chromatography/hodlmm-bin-chromatography.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgChromatographyIndex": 35,
    "overloadedColumnCount": 0,
    "gradientElutionCount": 1,
    "isocraticFlowCount": 2,
    "equilibratedColumnCount": 1,
    "voidColumnCount": 1,
    "avgPartitionCoefficient": 2.8,
    "avgColumnEfficiency": 42,
    "totalHighRetentionBins": 12,
    "avgChromatographyGini": 0.32
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
      "avgPartitionCoefficient": 2.8,
      "maxPartitionCoefficient": 10.0,
      "avgRetentionFactor": 0.28,
      "minRetentionFactor": 0.09,
      "avgPlateHeight": 1.2,
      "maxPlateHeight": 3.5,
      "avgResolution": 0.85,
      "minResolution": 0.1,
      "avgPeakAsymmetry": 1.15,
      "maxPeakAsymmetry": 2.8,
      "avgCapacityFactor": 3.2,
      "maxCapacityFactor": 8.5,
      "avgSelectivity": 1.3,
      "maxSelectivity": 3.5,
      "avgBandBroadening": 0.25,
      "maxBandBroadening": 0.65,
      "avgTailingFactor": 1.3,
      "maxTailingFactor": 2.5,
      "avgColumnEfficiency": 42,
      "maxColumnEfficiency": 100,
      "avgEluteStrength": 0.4,
      "maxEluteStrength": 0.75,
      "avgDeadVolume": 0.55,
      "maxDeadVolume": 0.95,
      "avgPeakCapacity": 1.8,
      "totalPeakCapacity": 45,
      "avgSeparationFactor": 0.52,
      "minSeparationFactor": 0.15,
      "highRetentionCount": 8,
      "highRetentionFraction": 0.32,
      "wellResolvedCount": 10,
      "wellResolvedFraction": 0.40,
      "chromatographyGini": 0.35,
      "chromatographyIndex": 35,
      "chromatographyPhase": "EQUILIBRATED_COLUMN",
      "chromatographyVerdict": "BASELINE_RESOLUTION",
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

- Partition coefficients use a two-phase model (X = mobile, Y = stationary) that simplifies the real multi-component DLMM reserve system. Real reserves contain multiple token types that interact in complex ways, but the two-phase approximation captures the dominant partitioning behavior.
- Plate height assumes uniform packing along the column. Real DLMM bin ranges have irregular spacing of populated bins with gaps (empty bins) that create discontinuities in the theoretical plate model. The effective plate count may overestimate separation power in sparsely populated regions.
- Resolution calculations use local three-bin neighborhoods. True chromatographic resolution requires baseline-to-baseline peak width measurements across the full elution profile. The local approximation captures relative peak distinctness without global elution curve fitting.
- Column efficiency N = L/H assumes constant plate height across the column. Real DLMM pools have variable efficiency with bins near the active trading zone achieving better separation than distant bins. The reported efficiency is an average that may mask significant spatial variation.
- Peak asymmetry uses a simple left/right ratio. True USP asymmetry factors require fitting the peak to a model function and measuring at 10% peak height. The simplified ratio captures the direction and magnitude of asymmetry without precise pharmacopeial compliance.
- The chromatographic model assumes equilibrium partitioning at each bin. Real DLMM reserves are event-driven (LP actions, trades, arbitrage) and may not reach equilibrium between events. The model provides a time-averaged view of the effective partitioning state.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
