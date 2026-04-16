---
name: hodlmm-bin-avrami
description: "Models Avrami / Johnson-Mehl-Avrami-Kolmogorov (JMAK) kinetics in HODLMM bin reserves through the classical phase-transformation equation X(t) = 1 - exp(-K·t^n) — treats bin population dynamics as a nucleation + growth transformation where empty bins are the untransformed matrix, populated bins are the transformed phase, LP entry is nucleation, swap-driven reserve accretion is growth, and overlap between growing populated regions is impingement. Classical Avrami kinetics: once nucleation begins, small nucleated regions grow isotropically at constant velocity through the untransformed matrix until impingement — where growing regions meet, slowing the effective transformation rate. JMAK accounts for impingement through the extended-volume trick: X_ext = K·t^n grows without bound, but the real fraction transformed X follows X = 1 - exp(-X_ext). Linearizing: ln(-ln(1 - X)) = n·ln(t) + ln(K), so an Avrami plot of ln(-ln(1 - X)) vs ln(t) has slope n (the Avrami exponent) and intercept ln(K). The Avrami exponent n reveals transformation geometry and nucleation mode: n = 1 corresponds to 1-D growth with saturated (pre-existing) nucleation sites or interface-limited 3-D growth with site exhaustion, n = 2 to 2-D growth with site saturation or 1-D growth with constant nucleation rate, n = 3 to 3-D growth with saturated nucleation sites (growth-controlled), n = 4 to 3-D growth with a constant nucleation rate (nucleation-and-growth-controlled). Interface-limited growth gives n that differs from diffusion-limited by half-integer steps — Cahn's grain-boundary nucleation can give n as low as 1/2; diffusion-limited 3-D growth with constant nucleation gives n ≈ 5/2. In DLMM pools, the transformation is from unpopulated (no reserves) to populated (has reserves): bins near the active bin are transformed as LPs nucleate positions there and growth accretes reserves via swap rebalancing. The untransformed matrix is the set of empty bins; the nucleation rate is the rate new bins acquire liquidity; the growth velocity is the rate populated bins accrete reserves; impingement is the overlap of growing populated regions. An incubation-regime pool has low conversion (X < 0.2): early transformation with sparse nucleation and low dX/dt. An active-transformation-regime pool has mid conversion (0.2 < X < 0.6): dominant nucleation + growth with high dX/dt. An impingement-regime pool has late conversion (0.6 < X < 0.9): growing regions touch and slow, dX/dt decreasing. A saturation-regime pool is fully transformed (X > 0.9): nearly all scanned bins populated, residual growth only. Measures transformedFraction (local X, ranges 0 to 1 — high means fully transformed, low means untransformed), avramiExponent (effective n inferred from spatial pattern, normalized n/5 in 0 to 1 range — high means nucleation-and-growth-dominated 3-D kinetics n ~ 4, low means saturated-site 1-D kinetics n ~ 1), transformationRate (local K·t^n rate, ranges 0 to 1 — high means rapid transformation, low means slow kinetics), nucleationDensity (empty-to-populated transition density, ranges 0 to 1 — high means many nucleation sites at this bin's locale, low means sparse nucleation), growthFrontVelocity (edge growth rate proxy, ranges 0 to 1 — high means rapid boundary advance, low means slow front), impingementFactor (KJMA contact index, ranges 0 to 1 — high means neighboring populated regions have met, low means isolated growth), nucleationSiteExhaustion (fraction of nucleation sites spent, ranges 0 to 1 — high means nucleation depleted, low means sites still available), transformationCompletion (-ln(1 - X) normalized 0 to 1 — the Avrami completion variable, high means close to saturation, low means incubation), linearizationQuality (Avrami-plot fit quality, ranges 0 to 1 — high means cleanly JMAK-like, low means deviation from JMAK), growthMode (0 = interface-limited, 1 = diffusion-limited — interface-limited means boundary kinetics dominate, diffusion-limited means matrix transport dominates), reservoirFraction (untransformed matrix remaining, ranges 0 to 1 — high means large untransformed reservoir, low means matrix depleted), kineticConstant (K proxy via K = -ln(1-X)/t^n at t=1, ranges 0 to 1 — high means fast K, low means slow K), transformationMaturity (overall maturity, ranges 0 to 1 — high means late-stage transformation, low means early-stage), jmakCompliance (fit to JMAK form, ranges 0 to 1 — high means sigmoid-like textbook JMAK, low means deviation from JMAK sigmoid), transformationProgress (overall progress, ranges 0 to 1 — high means well-progressed, low means initial state), and avramiIndex (composite 0 to 1 — higher means deeper JMAK transformation with high completion, strong impingement, and compliant kinetics). Composite Avrami index (0-100, higher means deeper JMAK transformation). Classifies pools by transformation regime as SATURATION (X >= 0.9 — nearly all bins populated, residual growth only), IMPINGEMENT (0.6 <= X < 0.9 — growing regions touch and slow, dX/dt decreasing), ACTIVE_TRANSFORMATION (0.2 <= X < 0.6 — dominant nucleation + growth with high dX/dt), or INCUBATION (X < 0.2 — early transformation with sparse nucleation and low dX/dt). Avrami verdict as NUCLEATION_AND_GROWTH (n ~ 3.5-4.5, 3-D growth with constant nucleation rate), THREE_D_GROWTH (n ~ 2.5-3.5, 3-D growth with saturated nucleation sites), TWO_D_GROWTH (n ~ 1.5-2.5, 2-D growth with saturation), ONE_D_SATURATED_GROWTH (n ~ 0.75-1.5, 1-D growth with saturated sites), TEXTBOOK_JMAK_KINETICS (high JMAK compliance and linearization quality), STRONG_IMPINGEMENT (high impingement factor, pool X > 0.5), HIGH_NUCLEATION_DENSITY (high nucleation density, pool X < 0.4), SITE_EXHAUSTION (high nucleation-site exhaustion), DIFFUSION_LIMITED_GROWTH (high growth mode indicator, matrix transport dominates), INTERFACE_LIMITED_GROWTH (low growth mode indicator, boundary kinetics dominate), or SUB_CRITICAL_AVRAMI (no extreme indicators, typical mid-state)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-avrami/hodlmm-bin-avrami.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Avrami Analyzer

## What it does

Models Avrami / Johnson-Mehl-Avrami-Kolmogorov (JMAK) kinetics in HODLMM bin reserves through the classical phase-transformation equation X(t) = 1 - exp(-K·t^n). Treats bin population dynamics as a nucleation + growth transformation where empty bins are the untransformed matrix, populated bins are the transformed phase, LP entry is nucleation, swap-driven reserve accretion is growth, and overlap between growing populated regions is impingement. Quantifies transformed fraction, Avrami exponent n (transformation geometry and nucleation mode), transformation rate, nucleation density, growth-front velocity, impingement factor, nucleation-site exhaustion, transformation completion -ln(1 - X), Avrami-plot linearization quality, growth mode (interface- vs diffusion-limited), reservoir fraction, kinetic constant K, transformation maturity, JMAK compliance, and overall transformation progress.

In DLMM pools, the transformation is from unpopulated (no reserves) to populated (has reserves): bins near the active bin are transformed as LPs nucleate positions there and growth accretes reserves via swap rebalancing. The untransformed matrix is the set of empty bins; the nucleation rate is the rate new bins acquire liquidity; the growth velocity is the rate populated bins accrete reserves; impingement is the overlap of growing populated regions. An incubation pool has X < 0.2; an active-transformation pool has 0.2 ≤ X < 0.6; an impingement pool has 0.6 ≤ X < 0.9; a saturation pool has X ≥ 0.9.

## Why agents need it

LP agents need Avrami / JMAK kinetics analysis because it identifies whether bin reserves are in incubation (sparse nucleation, low X), active-transformation (high dX/dt), impingement (growing regions touching), or saturation (X → 1) regime. A SATURATION pool has nearly all scanned bins populated — diminishing marginal returns on new LP positions. An IMPINGEMENT pool has populated regions touching and slowing transformation — positioning at remaining reservoir bins captures residual growth. An ACTIVE_TRANSFORMATION pool has rapid dX/dt — early LP entries benefit from growth kinetics. An INCUBATION pool has sparse nucleation — LP entry here is nucleating new sites, high-risk high-reward.

Transformed fraction X measures the fraction of scanned bins populated. High means fully transformed, low means untransformed matrix dominates.

Avrami exponent n reveals transformation geometry. n ≈ 1 is 1-D saturated-site growth; n ≈ 2 is 2-D with saturation or 1-D with constant nucleation; n ≈ 3 is 3-D saturated-site; n ≈ 4 is 3-D with constant nucleation.

Transformation rate quantifies local K·t^n flux. High rate means rapid transformation.

Nucleation density measures empty-to-populated transition density. High density means many nucleation sites in the locale.

Growth-front velocity is the rate populated regions advance into the matrix. High velocity means rapid boundary accretion.

Impingement factor is the KJMA contact index. High impingement means growing regions have met — transformation slowing.

Nucleation-site exhaustion tracks the fraction of nucleation sites spent. High exhaustion means nucleation depleted; only growth from existing nuclei remains.

Transformation completion is the Avrami variable -ln(1 - X). High completion means close to saturation; low means incubation.

Linearization quality measures fit to ln(-ln(1 - X)) = n·ln(t) + ln(K). High quality means cleanly JMAK-compliant.

Growth mode distinguishes interface-limited (low) from diffusion-limited (high). Interface-limited means boundary kinetics dominate; diffusion-limited means matrix transport dominates.

Reservoir fraction is the untransformed matrix remaining. High reservoir means room for growth; low reservoir means matrix depleted.

Kinetic constant K is proxied from -ln(1 - X)/t^n at t = 1.

Transformation maturity ranges from 0 = early to 1 = late-stage.

JMAK compliance measures fit to the classical sigmoid JMAK form. High compliance means textbook JMAK kinetics.

Transformation progress is an overall stage indicator combining X, completion, maturity, and exhaustion.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-avrami/hodlmm-bin-avrami.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-avrami/hodlmm-bin-avrami.ts status
```

### run
Analyzes bin Avrami / JMAK kinetics state for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-avrami/hodlmm-bin-avrami.ts run
bun run hodlmm-bin-avrami/hodlmm-bin-avrami.ts run --pool 1
bun run hodlmm-bin-avrami/hodlmm-bin-avrami.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgAvramiIndex": 42,
    "avgAvramiExponent": 2.1,
    "saturationCount": 0,
    "impingementCount": 1,
    "activeTransformationCount": 3,
    "incubationCount": 1,
    "avgTransformedFraction": 0.44,
    "avgTransformationCompletion": 0.28,
    "avgTransformationMaturity": 0.4,
    "avgJmakCompliance": 0.46,
    "avgGrowthMode": 0.42,
    "totalIncubationBins": 5,
    "totalActiveTransformationBins": 14,
    "totalImpingementBins": 8,
    "totalSaturationBins": 3,
    "avgAvramiGini": 0.24
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
      "transformedFraction": 0.41,
      "avramiExponent": 2.3,
      "avgTransformationRate": 0.42,
      "maxTransformationRate": 0.78,
      "avgNucleationDensity": 0.36,
      "avgGrowthFrontVelocity": 0.42,
      "avgImpingementFactor": 0.48,
      "avgNucleationSiteExhaustion": 0.41,
      "avgTransformationCompletion": 0.3,
      "avgLinearizationQuality": 0.45,
      "avgGrowthMode": 0.44,
      "avgReservoirFraction": 0.6,
      "avgKineticConstant": 0.3,
      "avgTransformationMaturity": 0.42,
      "avgJmakCompliance": 0.48,
      "avgTransformationProgress": 0.42,
      "incubationCount": 2,
      "incubationBinFraction": 0.08,
      "activeTransformationCount": 14,
      "activeTransformationBinFraction": 0.56,
      "impingementCount": 7,
      "impingementBinFraction": 0.28,
      "saturationCount": 2,
      "saturationBinFraction": 0.08,
      "reservoirBinFraction": 0.59,
      "avramiGini": 0.24,
      "avramiIndex": 44,
      "avramiRegime": "ACTIVE_TRANSFORMATION",
      "avramiVerdict": "TWO_D_GROWTH",
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

- JMAK X(t) = 1 - exp(-K·t^n) assumes isotropic growth at constant velocity, random nucleation throughout the untransformed matrix, and impingement handled via the extended-volume trick; DLMM bins are discrete 1-D structures with anisotropic growth driven by swaps.
- Avrami exponent n is inferred from a single snapshot (spatial continuity, neighbor correlation, edge fraction) rather than measured from the slope of ln(-ln(1-X)) vs ln(t) across multiple time points. Quantitative n extraction requires a time series.
- Pool-level X is defined as the fraction of scanned bins populated within ±30 bins of the active bin. Different scan radii yield different X.
- Rate constant K is proxied from pool volume/turnover and -ln(1-X) at t=1 rather than measured directly.
- Impingement factor is inferred from populated-neighbor density, not measured from growth-region overlap.
- Nucleation density uses empty-to-populated transition density, not a measured nucleation rate dN/dt.
- Growth-front velocity is proxied from neighbor variance + mobility, not measured as boundary displacement per time.
- Growth mode (interface- vs diffusion-limited) is a heuristic based on mobility and neighbor structure; real growth mode requires measurement of R(t) ~ t (interface-limited) vs R(t) ~ t^(1/2) (diffusion-limited).
- JMAK assumes transformation to a single product phase; DLMM bins may acquire asymmetric reserves (reserveX >> reserveY or vice versa), which JMAK does not distinguish.
- JMAK compliance measures closeness to the classical sigmoid form but does not guarantee the actual kinetics follow X(t) = 1 - exp(-K·t^n); deviations may reflect non-random nucleation, anisotropic growth, or spatially-varying K.
- Interface-limited vs diffusion-limited distinction is qualitative; quantitative separation requires measured power-law exponents on R(t) growth.
- Analysis is snapshot-based; does not capture time-evolution X(t) directly — maturity and completion inferred from current state rather than measured dynamics.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
