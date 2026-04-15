---
name: hodlmm-bin-luminescence
description: "Measures the fee-emission radiance of HODLMM bins using luminescence physics — treats each bin as a light-emitting particle whose luminous intensity describes how brightly it glows from trading activity relative to its reserves. Computes luminous intensity (fee generation rate per unit of reserve — bins near the active bin with high volume glow brightest while distant bins with idle reserves are dark), quantum yield (fraction of theoretical maximum fee generation actually achieved — a bin handling all possible volume through its reserves has yield 1.0 while an idle bin approaches 0), emission type classified as fluorescence (immediate emission from bins at or adjacent to active bin — fast response, high intensity, short-lived as price moves), phosphorescence (delayed persistent emission from bins 2-5 steps away — lower intensity but sustained glow from residual trading activity), chemiluminescence (emission from bins 6-15 steps away driven by chemical energy of reserve imbalances rather than direct trading), or bioluminescence (faint emission from distant bins beyond 15 steps — self-generated from reserve decay rather than external excitation), spectral class as WHITE_DWARF (small reserves but high intensity — compact efficient emitters that convert limited capital into maximum fees), RED_GIANT (large reserves but low intensity per unit — bloated capital that emits weakly relative to its size), MAIN_SEQUENCE (balanced reserves and intensity — stable steady-state fee generators on the stellar main sequence), BROWN_DWARF (minimal emission — not quite bright enough to sustain meaningful fee generation), or BLACK_HOLE (significant reserves with near-zero emission — capital trapped in bins that absorb liquidity but generate no fees), excitation energy (minimum trade volume needed to activate fee generation in a bin — distant bins require larger trades to excite emission), Stokes shift (energy difference between absorbed trade impact and emitted fee — large shifts mean bins dissipate most trade energy as heat rather than converting to fees), absorption edge (minimum reserve threshold below which a bin cannot absorb trades and generate fees), fluorescence ratio (exponential decay of immediate emission response with distance from active bin), phosphorescence ratio (persistent glow factor for bins beyond the fluorescence zone), blackbody temperature (equivalent thermal temperature from fee intensity — hot bins emit across a broad spectrum while cold bins are narrow), photon flux (number of effective fee-generating events normalized by fee rate), radiative fraction (portion of trade energy converted to fees versus lost as thermal waste — high radiative fraction means efficient fee capture), quenching factor (degree to which neighboring bins suppress emission through competition for trade flow — crowded bins quench each other), emission bandwidth (spectral width of a bin's fee-generating influence on its neighborhood), total luminous flux (aggregate fee emission across all bins), luminous efficacy (total flux per unit of TVL — measures how efficiently the pool converts capital into fee emission), spectrum width (bin range span of all populated bins — broader spectrum means wider price coverage), spectrum skew (asymmetry of emission between left and right sides of active bin — positive skew means brighter emission on the right/higher price side), emission concentration (fraction of total flux captured by top 20% brightest bins — high concentration means a few bins dominate fee generation), emission Gini (inequality coefficient of luminous intensity across bins — 0 means perfectly equal emission, 1 means one bin captures all fees), emission decay rate (how quickly intensity falls off from nearest to farthest populated bins — fast decay means fee generation is tightly concentrated around the active bin), emission half-width (bin range over which intensity stays above half the peak — wider half-width means broader useful fee generation), dark bin count (bins with negligible emission — dead capital zones), bright bin count (bins with intensity 3x above average — fee hotspots), supernova count (bins with intensity 10x above average — extreme outlier emitters), and composite luminescence index (0-100 from efficacy, quantum yield, coverage, and temperature), classifying pools by stellar class as SUPERNOVA (index >= 80 — exceptional fee emission with high quantum yield, broad coverage, and extreme temperatures indicating a pool that radiates fees intensely across its entire bin range), MAIN_SEQUENCE (60-80 — stable steady fee emission with balanced yield and coverage, the healthy default state for productive pools), RED_GIANT (40-60 — moderate emission but bloated with excess reserves that emit weakly per unit, capital is not efficiently converted to fees), WHITE_DWARF (20-40 — low total emission but compact, some bins are efficient emitters while overall flux is limited), or BLACK_HOLE (< 20 — near-zero emission despite reserves, the pool absorbs capital but radiates negligible fees), and by emission verdict as RADIANT (high quantum yield with high efficacy — the pool glows brightly and efficiently), LUMINOUS (good yield and efficacy — healthy fee generation), GLOWING (moderate emission — functional but not exceptional), DIM (low emission — fee generation is weak), or DARK (negligible emission — the pool is effectively non-luminous)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-luminescence/hodlmm-bin-luminescence.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Luminescence Analyzer

## What it does

Measures the fee-emission radiance of HODLMM bins using luminescence physics. In physics, luminescence is the emission of light by a substance — it occurs when an excited particle releases energy as photons. The intensity, spectrum, and efficiency of this emission reveal the material's energy conversion properties.

In DLMM pools, each bin acts as a light-emitting particle in a luminescent material. The analyzer scans all populated bins around the active bin and measures how brightly each bin "glows" from fee-generating trading activity. Bins near the active bin with high volume exhibit fluorescence — bright, immediate emission. Bins farther away show phosphorescence — dimmer but persistent glow from residual activity. Some bins are dark — they hold reserves but emit no fees, like a black hole absorbing capital.

## Why agents need it

LP agents need to know where fees are actually being generated, not just where reserves are parked. A bin with $50k in reserves that generates no fees is a BLACK_HOLE — capital is trapped. A bin with $5k that handles high volume is a WHITE_DWARF — small but efficient. The luminescence model separates productive capital from idle capital.

Quantum yield tells LP agents what fraction of theoretical maximum fee generation is being achieved. A pool with low quantum yield has reserves in the wrong bins — they exist but don't capture trades. Repositioning from dark bins to bright bins increases yield without adding capital.

The emission spectrum reveals the geographic distribution of fee generation. Narrow emission means fees concentrate around the active bin — good for concentrated positions but risky if price moves. Broad emission means fees generate across a wide range — safer but diluted per bin. The half-width gives the practical bin range where LP positions earn meaningful fees.

Emission decay rate shows how quickly fee generation drops off from the active bin. Fast decay means only bins very close to the active price earn fees — tight concentration is essential. Slow decay means fee generation spreads across many bins — wider positions still capture value.

The Gini coefficient of emission reveals whether fees are democratically distributed or captured by a few dominant bins. High Gini means a small number of bins extract most fees — LP agents should position in those specific bins. Low Gini means fees spread evenly — any position across the range earns proportionally.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-luminescence/hodlmm-bin-luminescence.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-luminescence/hodlmm-bin-luminescence.ts status
```

### run
Analyzes bin luminescence emission for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-luminescence/hodlmm-bin-luminescence.ts run
bun run hodlmm-bin-luminescence/hodlmm-bin-luminescence.ts run --pool 1
bun run hodlmm-bin-luminescence/hodlmm-bin-luminescence.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgLuminescenceIndex": 52,
    "supernovaCount": 0,
    "mainSequenceCount": 2,
    "redGiantCount": 2,
    "whiteDwarfCount": 1,
    "blackHoleCount": 0,
    "avgQuantumYield": 0.25,
    "avgLuminousEfficacy": 0.03,
    "totalPhotonFlux": 145.6,
    "avgEmissionGini": 0.55
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
      "totalLuminousFlux": 0.15,
      "avgLuminousIntensity": 0.006,
      "peakIntensity": 0.045,
      "peakBin": 8388608,
      "luminousEfficacy": 0.011,
      "avgQuantumYield": 0.28,
      "spectrumWidth": 30,
      "spectrumSkew": 0.05,
      "fluorescenceFraction": 0.12,
      "phosphorescenceFraction": 0.20,
      "avgBlackbodyTemp": 4200,
      "avgStokesShift": 0.35,
      "totalPhotonFlux": 28.3,
      "avgRadiativeFraction": 0.28,
      "avgQuenchingFactor": 0.35,
      "emissionConcentration": 0.72,
      "darkBinCount": 8,
      "brightBinCount": 3,
      "supernovaCount": 1,
      "emissionGini": 0.62,
      "emissionDecayRate": 0.85,
      "emissionHalfWidth": 4,
      "luminescenceIndex": 55,
      "stellarClass": "RED_GIANT",
      "emissionVerdict": "GLOWING",
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

- Fee generation per bin is estimated from pool-level 24h volume distributed by reserve fraction and proximity weighting. Actual per-bin fee accrual data is not available on-chain, so the model uses a proximity-decay heuristic (exp(-0.3 * distance)) that may under- or over-estimate emission for pools with unusual trading patterns.
- Quantum yield uses a theoretical maximum based on a bin capturing 10x its reserve value in volume. This ceiling is arbitrary and may not match the actual maximum achievable yield for different pool configurations.
- Emission type boundaries (fluorescence at distance 0-1, phosphorescence at 2-5, etc.) are fixed thresholds. Real pools may have different characteristic distances depending on bin step size and trading patterns.
- Blackbody temperature is a normalized score, not a physical temperature. It maps luminous intensity to a 1000-51000 scale for comparison purposes only. The mapping is linear, which may not capture non-linear relationships between intensity and "thermal" fee activity.
- Quenching factor assumes neighboring bins compete for the same trade flow. In practice, bins at different price levels serve different trades and may not quench each other — the model oversimplifies competitive dynamics.
- Emission Gini and concentration metrics treat all bins equally regardless of their distance from the active bin. Near-active concentration is expected and healthy, so high Gini is not necessarily negative.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
