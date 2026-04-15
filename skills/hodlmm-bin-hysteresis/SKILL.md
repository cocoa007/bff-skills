---
name: hodlmm-bin-hysteresis
description: "Measures directional memory in HODLMM bin liquidity response — hysteresis loop analysis revealing how reserves react differently to price moving up vs down. Computes per-bin hysteresis loops from forward/reverse reserve response asymmetry, coercivity measuring resistance to reserve composition reversal, remanence showing residual concentration after price moves away, Barkhausen noise from discrete reserve jumps between bins, saturation asymmetry for directional imbalance, energy loss from cumulative loop area, and composite hysteresis scoring."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-hysteresis/hodlmm-bin-hysteresis.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Hysteresis Analyzer

## What it does

Measures directional memory in HODLMM bin liquidity response -- hysteresis loop analysis revealing path-dependent reserve behavior. For each pool, computes per-bin hysteresis loops by comparing forward (lower-to-higher bin) and reverse (higher-to-lower bin) reserve response magnitudes, coercivity measuring how strongly each bin's reserve composition resists reversal (the force needed to flip the X/Y ratio), remanence quantifying residual reserve concentration that persists in bins after the active price moves away, Barkhausen noise detecting discrete discontinuous jumps in reserve levels between adjacent bins (analogous to magnetic domain wall jumps), saturation asymmetry measuring whether the pool reaches reserve saturation differently on the buy vs sell side, energy loss from cumulative hysteresis loop area representing value dissipated through path-dependent friction, and a composite hysteresis index.

## Why agents need it

Hysteresis captures the fundamental insight that HODLMM pools don't respond symmetrically to price movements -- reserves that accumulated during an uptrend don't distribute the same way during a downtrend. This directional memory means that a pool's current state depends on its price history, not just the current price. High coercivity bins resist changing their reserve composition, creating sticky liquidity that may not rebalance efficiently after directional moves. Remanence reveals capital that remains concentrated in bins far from the active price -- remnant positions from prior price regimes that may be earning no fees. Barkhausen noise identifies pools where reserve distribution changes in discrete jumps rather than smooth gradients, indicating potential slippage cliffs during rapid price movement. Saturation asymmetry reveals structural directional bias -- pools that resist buy-side pressure differently from sell-side. Energy loss quantifies the total cost of hysteresis friction: higher loop areas mean more value is lost to path-dependent inefficiency. Pools with low hysteresis behave predictably regardless of price direction; pools with high hysteresis require directional-aware LP strategies.

## Commands

### doctor
Validates API connectivity and lists available analyses.

```bash
bun run skills/hodlmm-bin-hysteresis/hodlmm-bin-hysteresis.ts doctor
```

### run
Full hysteresis analysis for selected pools. Reports per-bin loops, coercivity, remanence, Barkhausen events, and ASCII loop map.

```bash
bun run skills/hodlmm-bin-hysteresis/hodlmm-bin-hysteresis.ts run --top 3
bun run skills/hodlmm-bin-hysteresis/hodlmm-bin-hysteresis.ts run --pool 1
```

### status
Quick hysteresis summary for the top 5 pools by TVL.

```bash
bun run skills/hodlmm-bin-hysteresis/hodlmm-bin-hysteresis.ts status
```

## Output contract

All outputs are JSON to stdout.

**Success:**

```json
{
  "result": "hysteresis_analysis",
  "data": {
    "pools": [{ "poolId": 1, "pair": "sBTC/STX", "profile": { "hysteresisIndex": 35, "hysteresisClass": "moderate", "avgLoopArea": 0.0023 } }],
    "summary": { "poolsAnalyzed": 3, "avgHysteresisIndex": 38 }
  }
}
```

**Error:**

```json
{ "error": "descriptive message" }
```

## Metrics explained

- **hysteresisLoop**: Per-bin comparison of forward vs reverse reserve response. Width measures directional asymmetry; area measures path-dependent friction.
- **coercivity**: Resistance of a bin's reserve composition (X/Y ratio) to reversal (0-1). Higher coercivity means the bin's liquidity is sticky and resists rebalancing.
- **remanence**: Residual reserve concentration that persists in a bin after the active price moves away (0-1). High remanence = capital trapped in historical price positions.
- **barkhausenNoise**: Discrete jumps in reserve levels between adjacent bins. Count and intensity measure how discontinuous the reserve distribution is.
- **saturationAsymmetry**: Whether reserves saturate differently above vs below the active bin (-1 to +1). Positive = more reserves above active bin.
- **energyLoss**: Cumulative hysteresis loop area across all bins. Higher = more value dissipated through path-dependent friction.
- **directionalBias**: Net asymmetry in forward vs reverse response (-1 to +1). Positive = stronger response to upward price movement.
- **hysteresisClass**: "reversible" (index < 15), "soft" (15-30), "moderate" (30-50), "hard" (50-70), "permanent" (> 70).
- **hysteresisIndex**: Composite score (0-100). HIGHER means more directional memory, more path-dependent behavior, and less predictable reserve response.

## Safety notes

- Read-only skill. No wallet, signing, or funds required.
- All data is fetched from public on-chain contract reads and the Bitflow API.
- Does not execute any transactions or modify any state.
- Rate-limited by Hiro API. Avoid scanning more than 5 pools in rapid succession.
- No private keys or sensitive data are accessed.

## Known constraints

- Scans bins within a fixed radius of the active bin (default +/-30).
- True hysteresis requires observing reserve response over time under varying price; this snapshot approach infers directional behavior from spatial reserve gradients.
- Coercivity is computed from current reserve composition, not from observed resistance to change.
- Barkhausen detection uses adjacent-bin comparison -- actual domain wall jumps may span multiple bins.
- Remanence uses distance from active bin as proxy for historical price departure.
- Pools with very few populated bins (<5) will produce unreliable hysteresis metrics.
