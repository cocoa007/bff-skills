---
name: hodlmm-bin-viscosity
description: "Measures the viscosity of liquidity flow across HODLMM bins — how resistant the reserve distribution is to smooth trade execution, computing dynamic viscosity (ratio of average shear stress to average shear rate across bin boundaries — measures the pool's intrinsic resistance to flow; high viscosity means reserves change abruptly between adjacent bins creating execution friction, low viscosity means smooth gradients that trades traverse easily), kinematic viscosity (dynamic viscosity normalized by average bin density — isolates flow resistance from absolute TVL; a $10M pool and a $100k pool with identical reserve shapes have the same kinematic viscosity despite different dynamic viscosity), average and maximum shear rate (rate of reserve change per bin step — the derivative of the reserve curve; high shear rates indicate sharp transitions where trade execution crosses from deep to thin liquidity or vice versa; the maximum shear bin is the single most disruptive transition point), average shear stress (shear rate weighted by local density — measures the force a trade encounters when crossing bin boundaries; stress concentrates where high shear rate meets high density, creating walls that trades must push through), Reynolds number (ratio of inertial forces from trading volume to viscous forces from reserve gradients — dimensionless flow regime indicator; high Re means trading volume dominates the reserve structure producing turbulent, rapidly-changing execution; low Re means the reserve structure dominates producing stable laminar flow), viscosity gradient (average change in local viscosity between adjacent bin pairs — measures how uniform the flow resistance is; low gradient means consistent execution quality across the range, high gradient means unpredictable zones where resistance suddenly changes), left and right viscosity with asymmetry score (separate viscosity measurements for bins below vs above the active bin — asymmetry indicates directional bias in execution quality; high asymmetry means buys and sells face very different resistance profiles), yield stress (10th percentile bin reserve — the minimum liquidity depth a trade encounters; trades smaller than this amount pass through all bins without encountering thin zones), thixotropy index (coefficient of variation of shear rates — measures how non-uniform the flow resistance pattern is; thixotropic pools have highly variable shear creating unpredictable execution, Newtonian pools have uniform shear creating consistent execution), stagnant zones and fraction (bin pairs where both the reserve difference and absolute reserve are very low — dead regions where liquidity has effectively ceased flowing; stagnant zones create execution voids that trades must bridge), flow resistance index (composite 0-100 combining viscosity, gradient, stagnation, asymmetry, and thixotropy — higher means more resistant to smooth execution), and viscosity index (inverse composite 0-100 scoring flow quality — higher means smoother, more predictable execution), classifying pools by flow regime as TURBULENT (Reynolds > 100 — high volume relative to reserve gradients produces chaotic, rapidly-changing execution conditions; prices and depths shift faster than the reserve structure can dampen), TRANSITIONAL (Reynolds 10-100 — mixed regime where some zones flow smoothly while others show turbulent characteristics; execution quality is position-dependent), LAMINAR (Reynolds 0.5-10 — reserve structure dominates, producing smooth, predictable flow; execution quality is stable and reliable but may be slow to adapt to market changes), or STAGNANT (Reynolds < 0.5 — negligible flow; the pool has insufficient volume relative to its reserve structure, trades have minimal market impact but also minimal information content), and by viscosity class as SUPERFLUID (dynamic viscosity < 0.5 and gradient < 0.3 — near-zero resistance to flow; reserves taper so smoothly that trades of any size encounter gradually increasing depth with no abrupt transitions), FLUID (dynamic viscosity < 1.0 — low resistance with some detectable structure; most trades execute smoothly but very large trades may encounter minor resistance variations), VISCOUS (dynamic viscosity 1.0-2.0 — significant resistance to flow; trades encounter noticeable depth variations between bins, execution quality depends on trade size and direction), or GELATINOUS (dynamic viscosity > 2.0 — extreme resistance; the reserve distribution has sharp discontinuities, deep pools adjacent to thin bins, creating a semi-solid structure that trades must force through with significant slippage variability)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-viscosity/hodlmm-bin-viscosity.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Viscosity Analyzer

## What it does

Measures the viscosity — resistance to smooth flow — of liquidity across a HODLMM pool's bin distribution. In fluid dynamics, viscosity quantifies a fluid's internal friction: how much force is needed to move one layer of fluid past another. Water has low viscosity (flows easily); honey has high viscosity (resists flow); a gel has extreme viscosity with a yield stress that must be overcome before flow begins at all.

In DLMM pools, the "fluid" is the reserve distribution across bins. Each bin boundary is a layer interface. When a trade crosses from one bin to the next, it encounters the reserve differential between them — the "shear" in the liquidity structure. A pool where reserves taper smoothly has low viscosity: trades flow through gradually increasing depth with predictable slippage. A pool with sharp discontinuities — deep bins adjacent to thin bins — has high viscosity: trades encounter sudden resistance changes, making execution quality unpredictable.

The analyzer computes shear rates (reserve gradients), shear stresses (density-weighted gradients), dynamic and kinematic viscosity, Reynolds numbers (volume-to-structure ratio), and maps the spatial distribution of flow resistance to identify stagnant zones, asymmetric viscosity, and thixotropic (non-uniform) shear patterns.

## Why agents need it

Viscosity directly predicts execution quality in ways that TVL alone cannot. Two pools with identical TVL can have radically different viscosity — one with smooth tapering (superfluid) and another with random spikes and gaps (gelatinous). A trading agent that only checks TVL will miss this distinction entirely.

The Reynolds number reveals whether trading volume is reshaping the reserve structure (turbulent) or whether the reserve structure is stable and dictates execution (laminar). Turbulent pools are actively evolving — execution quality changes rapidly. Laminar pools are predictable — execution quality is stable but the distribution may be stale.

Viscosity asymmetry identifies directional bias: a pool that's superfluid for buys but viscous for sells has hidden execution risk for one direction. The thixotropy index distinguishes between pools with consistent resistance (Newtonian, predictable) and pools with wildly varying resistance (thixotropic, unpredictable).

Stagnant zones are execution voids — regions where liquidity has effectively ceased. Trades that cross a stagnant zone encounter a gap followed by a wall, producing the worst slippage profile. The yield stress metric tells agents the minimum trade size that can be executed without hitting any thin zones.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-viscosity/hodlmm-bin-viscosity.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-viscosity/hodlmm-bin-viscosity.ts status
```

### run
Analyzes viscosity for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-viscosity/hodlmm-bin-viscosity.ts run
bun run hodlmm-bin-viscosity/hodlmm-bin-viscosity.ts run --pool 1
bun run hodlmm-bin-viscosity/hodlmm-bin-viscosity.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgViscosityIndex": 62.4,
    "superfluidCount": 1,
    "fluidCount": 2,
    "viscousCount": 1,
    "gelatinousCount": 1,
    "turbulentCount": 2,
    "transitionalCount": 1,
    "laminarCount": 1,
    "stagnantCount": 1,
    "avgDynamicViscosity": 1.12,
    "avgReynoldsNumber": 45.3,
    "avgViscosityAsymmetry": 0.23,
    "totalStagnantZones": 4
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "activeBin": 8388608,
      "binsAnalyzed": 25,
      "totalUsd": 140000,
      "dynamicViscosity": 0.85,
      "kinematicViscosity": 0.152,
      "avgShearRate": 2100.5,
      "maxShearRate": 12500.0,
      "maxShearBin": 8388612,
      "avgShearStress": 1785.4,
      "reynoldsNumber": 32.1,
      "viscosityGradient": 0.45,
      "leftViscosity": 0.72,
      "rightViscosity": 0.95,
      "viscosityAsymmetry": 0.138,
      "yieldStressUsd": 850.0,
      "thixotropyIndex": 0.62,
      "stagnantZones": 1,
      "stagnantFraction": 0.042,
      "flowResistanceIndex": 28,
      "viscosityIndex": 68,
      "flowRegime": "TRANSITIONAL",
      "viscosityClass": "FLUID",
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

- Dynamic viscosity is a ratio of averages, not an average of ratios. Local viscosity at individual bin boundaries may differ significantly from the pool-level metric.
- Reynolds number uses 24h volume as the inertial force proxy. Low-volume periods produce artificially low Re even if the pool is structurally active. Conversely, a volume spike produces high Re that may not reflect ongoing conditions.
- Shear rate treats missing bins between populated bins as a single large step. A gap of 5 empty bins between two populated bins produces a lower shear rate than a direct adjacency with the same reserve differential, which may understate the execution impact of gaps.
- Thixotropy index measures spatial variation in shear rates, not temporal variation. True thixotropy (time-dependent viscosity) would require historical data.
- Yield stress uses the 10th percentile bin reserve, which is a proxy for minimum traversable depth, not a true yield stress from rheology.
- Stagnant zone detection uses fixed thresholds (5% of average delta, 30% of average reserve). These may misclassify bins in pools with extreme reserve distributions.
- Viscosity asymmetry depends on where the active bin falls within the populated range. If the active bin is near one edge, the side with fewer bins may show artificially different viscosity.
- Flow regime thresholds (Re = 0.5, 10, 100) are heuristic and not calibrated to empirical DLMM execution data.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
