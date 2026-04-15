---
name: hodlmm-bin-inductance
description: "Measures liquidity inductance across HODLMM bin ranges — how strongly bins resist changes in reserve flow rate, back-EMF effects where concentrated bins oppose rapid depletion, mutual inductance between adjacent bins, self-inductance from reserve mass, energy stored in flow fields, and composite inductance scoring."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-inductance/hodlmm-bin-inductance.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Inductance Analyzer

## What it does

Measures liquidity inductance -- the resistance of HODLMM bins to changes in reserve flow rate. For each pool, computes per-bin self-inductance from reserve mass and concentration (heavier bins resist flow changes more), mutual inductance between adjacent bins showing how reserve changes in one bin induce sympathetic changes in neighbors, back-EMF coefficients measuring how bins oppose rapid depletion during large trades, inductive coupling strength between bin pairs, energy stored in the liquidity flow field across the range, resonant frequency estimates where flow oscillations amplify, eddy current losses from circular flow patterns near the active bin, and a composite inductance index.

## Why agents need it

Inductance reveals how a pool responds to dynamic pressure over time rather than just static snapshots. A high-inductance pool resists sudden changes -- large trades deplete bins more slowly because neighboring bins inductively supply reserves, providing a cushioning effect. A low-inductance pool responds instantly to flow changes with minimal damping, making it more volatile but also more capital-efficient for small trades. Back-EMF tells traders how much resistance they will encounter during sustained directional pressure -- useful for timing entries and exits during trends. Mutual inductance between bins shows how correlated their reserve movements are -- tight coupling means the pool acts as a unit, loose coupling means individual bins can be drained independently. Resonant frequency identifies the trade frequency where flow oscillations build rather than dampen -- a risk signal for high-frequency trading patterns. Together these metrics help agents predict pool behavior under dynamic conditions, not just static ones.

## Commands

### doctor
Validates API connectivity and lists available analyses.

```bash
bun run skills/hodlmm-bin-inductance/hodlmm-bin-inductance.ts doctor
```

### run
Full inductance analysis for selected pools. Reports per-bin self-inductance, mutual coupling, back-EMF, flow energy, and ASCII inductance map.

```bash
bun run skills/hodlmm-bin-inductance/hodlmm-bin-inductance.ts run --top 3
bun run skills/hodlmm-bin-inductance/hodlmm-bin-inductance.ts run --pool 1
```

### status
Quick inductance summary for the top 5 pools by TVL.

```bash
bun run skills/hodlmm-bin-inductance/hodlmm-bin-inductance.ts status
```

## Output contract

All outputs are JSON to stdout.

**Success:**

```json
{
  "result": "inductance_analysis",
  "data": {
    "pools": [{ "poolId": 1, "pair": "sBTC/STX", "profile": { "inductanceIndex": 62, "inductanceClass": "high-inertia", "avgSelfInductance": 0.71 } }],
    "summary": { "poolsAnalyzed": 3, "avgInductanceIndex": 58 }
  }
}
```

**Error:**

```json
{ "error": "descriptive message" }
```

## Metrics explained

- **selfInductance**: Per-bin inertia (0-1) based on reserve mass relative to pool total. Higher = bin resists flow changes more strongly.
- **mutualInductance**: Coupling coefficient between adjacent bins (0-1). Higher = reserve changes in one bin induce proportional changes in neighbors.
- **backEmf**: Resistance coefficient to rapid depletion (0-1). Higher = bin opposes sustained directional pressure more strongly.
- **couplingStrength**: Average mutual inductance across all populated bin pairs. Higher = pool acts as a unified body.
- **flowEnergy**: Total energy stored in the liquidity flow field (USD). Represents the inertial reserve available to dampen sudden flow changes.
- **resonantFrequencyBins**: Estimated bin spacing at which flow oscillations would amplify rather than dampen. Smaller = more sensitive to cyclic patterns.
- **eddyLossFraction**: Fraction of reserves trapped in circular flow patterns near the active bin. Higher = more energy dissipated in local circulation.
- **inductanceClass**: "superconductor" (index < 20, zero resistance), "low-inertia" (20-40), "moderate" (40-60), "high-inertia" (60-80), "immovable" (> 80).
- **inductanceIndex**: Composite score (0-100). HIGHER means more resistance to flow changes, stronger damping, and more inductive coupling between bins.

## Safety notes

- Read-only skill. No wallet, signing, or funds required.
- All data is fetched from public on-chain contract reads and the Bitflow API.
- Does not execute any transactions or modify any state.
- Rate-limited by Hiro API. Avoid scanning more than 5 pools in rapid succession.
- No private keys or sensitive data are accessed.

## Known constraints

- Scans bins within a fixed radius of the active bin (default +/-30).
- Inductance is computed from a single snapshot -- true inductive behavior requires observing reserve changes over multiple blocks.
- Mutual inductance is inferred from reserve correlation patterns, not actual flow measurements.
- Self-inductance uses reserve mass as a proxy -- actual inertia depends on LP position sizes and lock durations.
- Pools with very few populated bins (<5) will produce unreliable inductance metrics.
- Back-EMF is estimated from reserve gradient analysis, not from observed depletion events.
- Resonant frequency is a structural estimate, not validated against actual trading patterns.
