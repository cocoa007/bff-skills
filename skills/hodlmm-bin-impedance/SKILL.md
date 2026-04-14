---
name: hodlmm-bin-impedance
description: "Measures trade flow impedance across HODLMM bin ranges — how much resistance each bin offers to trade execution, combining resistive (reserve depth) and reactive (directional response) components, impedance matching analysis, reflection coefficient detection, and composite scoring."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-impedance/hodlmm-bin-impedance.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Impedance Analyzer

## What it does

Measures trade flow impedance -- how much resistance each bin offers to trade execution across HODLMM bin ranges. For each pool, computes per-bin impedance from reserve depth and neighboring structure, decomposes impedance into resistive (inverse of reserve depth) and reactive (directional pressure response) components, detects impedance mismatches where adjacent bins have sharply different resistance creating reflection points, computes reflection coefficients at bin boundaries, identifies impedance-matched corridors where trades flow smoothly, maps standing-wave patterns where reflected trade energy creates price oscillation risk, measures characteristic impedance of the pool (baseline resistance), and produces a composite impedance index.

## Why agents need it

Impedance reveals how hard it is for trades to flow through each part of a pool's bin range. A low-impedance pool lets trades execute with minimal friction — reserves are deep, bins are well-matched, and price impact is gradual. A high-impedance pool resists trade flow — thin reserves, mismatched bins, and abrupt price jumps. Impedance mismatches at bin boundaries create reflection points where trade energy bounces back, causing price oscillations and unpredictable execution. Reflection coefficients quantify how much of a trade's impact gets reflected vs transmitted at each bin boundary. Impedance-matched corridors are the sweet spots where trades flow without reflection — smooth, predictable execution. Standing-wave patterns reveal where reflected energy accumulates, creating price instability zones. Characteristic impedance gives a baseline measure of the pool's natural resistance. Together, these metrics help agents identify pools with smooth trade flow, avoid high-impedance zones that resist execution, and find impedance-matched corridors for optimal trade routing.

## Commands

### doctor
Validates API connectivity and lists available analyses.

```bash
bun run skills/hodlmm-bin-impedance/hodlmm-bin-impedance.ts doctor
```

### run
Full impedance analysis for selected pools. Reports per-bin impedance, resistive/reactive decomposition, reflection coefficients, matched corridors, standing-wave patterns, and ASCII impedance map.

```bash
bun run skills/hodlmm-bin-impedance/hodlmm-bin-impedance.ts run --top 3
bun run skills/hodlmm-bin-impedance/hodlmm-bin-impedance.ts run --pool 1
```

### status
Quick impedance summary for the top 5 pools by TVL.

```bash
bun run skills/hodlmm-bin-impedance/hodlmm-bin-impedance.ts status
```

## Output contract

All outputs are JSON to stdout.

**Success:**

```json
{
  "result": "impedance_analysis",
  "data": {
    "pools": [{ "poolId": 1, "pair": "sBTC/STX", "profile": { "impedanceIndex": 35, "impedanceClass": "low-impedance", "characteristicImpedance": 0.28 } }],
    "summary": { "poolsAnalyzed": 3, "avgImpedanceIndex": 40 }
  }
}
```

**Error:**

```json
{ "error": "descriptive message" }
```

## Metrics explained

- **localImpedance**: Per-bin impedance (0-1) combining resistive and reactive components. Higher = more resistance to trade flow. Lower = smoother execution.
- **resistiveComponent**: Resistance from insufficient reserve depth. Thin bins have high resistance. Inversely proportional to reserve density.
- **reactiveComponent**: Resistance from directional pressure asymmetry. Bins with highly skewed reserves respond differently to buy vs sell flow, creating reactive impedance.
- **reflectionCoefficient**: At each bin boundary, measures how much trade impact is reflected vs transmitted (0 = perfect match, 1 = total reflection). High values indicate impedance mismatches.
- **matchedCorridors**: Contiguous bin ranges where impedance is consistent and reflection coefficients are low. Trades flow smoothly through these corridors.
- **standingWaveZones**: Regions where reflected trade energy accumulates, creating price oscillation risk. Characterized by alternating high/low impedance patterns.
- **characteristicImpedance**: Pool-wide baseline impedance — the natural resistance level. Lower is better for trade execution.
- **impedanceBandwidth**: Range of frequencies (trade sizes) the pool can handle without significant impedance increase. Wider = more versatile.
- **impedanceClass**: "transparent" (index < 20), "low-impedance" (20-40), "moderate-impedance" (40-60), "high-impedance" (60-80), "opaque" (> 80).
- **impedanceIndex**: Composite score (0-100). For trade execution, LOWER is better (means less resistance to trade flow).

## Safety notes

- Read-only skill. No wallet, signing, or funds required.
- All data is fetched from public on-chain contract reads and the Bitflow API.
- Does not execute any transactions or modify any state.
- Rate-limited by Hiro API. Avoid scanning more than 5 pools in rapid succession.
- No private keys or sensitive data are accessed.

## Known constraints

- Scans bins within a fixed radius of the active bin (default +/-30).
- Impedance is computed from a single snapshot -- temporal dynamics require multiple snapshots over time.
- Reactive component uses reserve ratio asymmetry as a proxy for directional response -- actual reactive impedance depends on trade flow dynamics.
- Reflection coefficients are idealized -- real AMM mechanics add nonlinear effects not captured by simple impedance matching.
- Standing-wave detection uses spatial pattern matching -- true standing waves require temporal observation.
- Pools with very few populated bins (<5) will produce unreliable impedance metrics.
- Empty bins are treated as infinite impedance (total reflection at boundaries).
