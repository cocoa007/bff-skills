---
name: hodlmm-bin-torque
description: "Analyzes rotational forces acting on HODLMM bin reserve distributions around the active bin pivot point. Computes net torque measuring the rotational imbalance between reserves above and below the active bin (clockwise vs counter-clockwise forces), torque magnitude quantifying the total rotational energy stored in the distribution, moment of inertia measuring how spread out reserves are from the pivot (resistance to rotational change), angular momentum combining rotational velocity with inertial mass to indicate directional commitment, rotational equilibrium scoring how balanced the clockwise and counter-clockwise torques are, lever arm asymmetry detecting whether reserves extend further on one side creating unequal mechanical advantage, torque density comparing the average reserve per bin on each side of the pivot, precession angle measuring the compositional tilt between token-X and token-Y torque contributions, gyroscopic stability scoring the distribution's resistance to rotational perturbation combining inertia equilibrium and symmetry, and pivot stress measuring the force concentration at the active bin relative to its reserves."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-torque/hodlmm-bin-torque.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Torque Analyzer

## What it does

Analyzes rotational forces acting on HODLMM bin reserve distributions around the active bin pivot point. Treats the active bin as a fulcrum and each surrounding bin as a mass at a distance, computing classical torque mechanics applied to on-chain liquidity. For each pool, computes net torque measuring the rotational imbalance between reserves positioned above versus below the active bin (the difference between clockwise and counter-clockwise force moments), torque magnitude quantifying the total rotational energy in the distribution (sum of all force-arm products regardless of direction), moment of inertia measuring how spread out reserves are from the pivot point (higher values indicate reserves concentrated far from the active bin, creating greater resistance to rotational change), angular momentum combining the distribution's rotational velocity with its inertial mass to indicate directional commitment of the reserve composition, rotational equilibrium scoring how balanced the opposing torques are (a perfectly balanced distribution scores 100), lever arm asymmetry detecting whether reserves extend further on one side of the pivot creating unequal mechanical advantage (longer lever arms amplify smaller forces), torque density per side comparing the average reserve value per bin on each side of the pivot, precession angle measuring the compositional tilt between token-X dominated and token-Y dominated torque contributions (analogous to gyroscopic precession where an external force causes the rotation axis to shift), gyroscopic stability scoring the distribution's overall resistance to rotational perturbation by combining inertia, equilibrium, and symmetry into a composite stability measure, and pivot stress measuring the force concentration at the active bin relative to its own reserves (high stress means surrounding bins exert strong rotational forces on a weakly-provisioned pivot).

## Why agents need it

Torque analysis reveals the mechanical stability of a pool's liquidity distribution by treating it as a rigid body rotating around the active bin. High torque imbalance indicates that the reserve distribution is asymmetrically weighted — one side of the price range has significantly more liquidity mass at greater distance, creating rotational pressure that could cause rapid price movement if the balance shifts. The moment of inertia measures how resistant the distribution is to rebalancing — pools with high inertia have reserves spread far from the active bin and will be slow to adapt to price changes, while low-inertia pools have concentrated liquidity that can rapidly shift. Gyroscopic stability combines equilibrium, inertia, and symmetry into a single measure of the distribution's resistance to perturbation — gyroscopic pools maintain their rotational state even under moderate external forces, while tumbling pools are easily disrupted. Pivot stress reveals whether the active bin itself is adequately provisioned to handle the forces exerted by surrounding reserves — high pivot stress means the fulcrum is weak relative to the loads it supports, creating vulnerability to sudden liquidity removal. The precession angle identifies compositional drift — when X and Y token torques diverge, the distribution is precessing away from its current orientation, potentially indicating sustained directional pressure. Together these metrics let agents assess whether a pool's liquidity geometry is mechanically stable, identify which direction the distribution is "tilting," and detect structural vulnerabilities before they manifest as adverse execution conditions.

## Commands

### doctor
Validates API connectivity and lists available analyses.

```bash
bun run skills/hodlmm-bin-torque/hodlmm-bin-torque.ts doctor
```

### run
Full torque analysis for selected pools. Reports net torque, moment of inertia, angular momentum, gyroscopic stability, pivot stress, and ASCII torque distribution maps.

```bash
bun run skills/hodlmm-bin-torque/hodlmm-bin-torque.ts run --top 3
bun run skills/hodlmm-bin-torque/hodlmm-bin-torque.ts run --pool 1
```

### status
Quick torque summary for the top 5 pools by TVL.

```bash
bun run skills/hodlmm-bin-torque/hodlmm-bin-torque.ts status
```

## Output contract

All outputs are JSON to stdout.

**Success:**

```json
{
  "result": "torque_analysis",
  "data": {
    "pools": [{ "poolId": 1, "pair": "sBTC/STX", "torqueIndex": 65, "torqueClass": "balanced", "gyroscopicStability": 72 }],
    "summary": { "poolsAnalyzed": 3, "avgTorqueIndex": 58 }
  }
}
```

**Error:**

```json
{ "error": "descriptive message" }
```

## Metrics explained

- **netTorque**: Difference between counter-clockwise and clockwise torque. Positive = reserves concentrated above the active bin exert more rotational force. Negative = reserves below dominate.
- **torqueMagnitude**: Total rotational force regardless of direction. High magnitude means reserves are both large and positioned far from the pivot — large rotational energy is stored in the distribution.
- **clockwiseTorque / counterClockwiseTorque**: Separate torque contributions from bins below and above the active bin respectively.
- **momentOfInertia**: Mass-weighted sum of squared distances from the pivot, normalized by total reserves. Higher values = reserves spread far from active bin = harder to rebalance.
- **inertiaClass**: "compact" (< 10), "moderate" (10-50), "spread" (50-200), "dispersed" (> 200).
- **angularMomentum**: Product of moment of inertia and angular velocity. Measures directional commitment — high angular momentum means the distribution has strong rotational inertia in a specific direction.
- **angularVelocity**: Rate of compositional rotation derived from X-Y reserve asymmetry weighted by position. Positive = distribution rotating toward X dominance.
- **rotationalEquilibrium**: Score (0-100) measuring how balanced opposing torques are. 100 = perfectly balanced. Below 50 = significant tilt.
- **equilibriumClass**: "perfect" (≥ 90), "stable" (70-89), "tilted" (50-69), "unbalanced" (30-49), "extreme-tilt" (< 30).
- **leverArmAsymmetry**: Difference in mass-weighted average distance from pivot between left and right sides, normalized. Higher = one side has longer effective lever arm.
- **leverArmDirection**: "symmetric" (< 0.1), "left-extended", or "right-extended".
- **torqueDensityLeft / torqueDensityRight**: Average USD reserve per bin on each side of the pivot. Shows concentration differences.
- **precessionAngle**: Angle (degrees) between X-token and Y-token torque vectors. Near 0° = X-dominated rotation, near 90° = Y-dominated, between = compositional drift.
- **precessionClass**: "aligned-X", "aligned-Y", "precessing-X", "precessing-Y".
- **gyroscopicStability**: Composite score (0-100) combining inertia, equilibrium, and symmetry. Higher = more resistant to rotational perturbation.
- **stabilityClass**: "gyroscopic" (≥ 80), "stable" (60-79), "wobbly" (40-59), "unstable" (20-39), "tumbling" (< 20).
- **pivotStress**: Force concentration at the active bin (0-100). High stress = surrounding bins exert strong forces on a weakly-provisioned pivot.
- **pivotStressClass**: "minimal" (< 20), "low" (20-39), "moderate" (40-59), "high" (60-79), "critical" (≥ 80).
- **torqueIndex**: Composite score (0-100). HIGHER means better rotational balance, stronger gyroscopic stability, lower pivot stress, adequate inertia, and symmetric lever arms.
- **torqueClass**: "tumbling" (< 15), "wobbly" (15-29), "tilted" (30-49), "balanced" (50-69), "gyroscopic" (≥ 70).

## Safety notes

- Read-only skill. No wallet, signing, or funds required.
- All data is fetched from public on-chain contract reads and the Bitflow API.
- Does not execute any transactions or modify any state.
- Rate-limited by Hiro API. Avoid scanning more than 5 pools in rapid succession.
- No private keys or sensitive data are accessed.

## Known constraints

- Scans bins within a fixed radius of the active bin (default +/-30).
- Torque is computed from a single-point snapshot of reserves — it represents the current mechanical balance, not temporal evolution.
- Moment of inertia uses bin index distance as the "radius," which is a discrete approximation — actual price distance between bins varies by pool parameters.
- Precession angle assumes X and Y token torques are orthogonal components, which is a simplification of the actual reserve dynamics.
- Pivot stress can be misleading for pools where the active bin naturally holds minimal reserves (e.g., pools with wide bin spacing).
- Gyroscopic stability assumes that higher inertia is stabilizing, which is true for rotational mechanics but may not always apply to liquidity dynamics.
