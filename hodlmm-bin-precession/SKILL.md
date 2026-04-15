---
name: hodlmm-bin-precession
description: "Models gyroscopic precession physics across HODLMM bins — treats each bin as a spinning body whose angular momentum (reserve depth weighted by volume activity) resists compositional perturbation from neighboring bins. External torque from neighbor composition mismatches causes steady precession (predictable drift in token ratio) and nutation (wobble overlaid on the drift). Measures angular momentum (normalized reserve depth scaled by volume activity factor — the spin that keeps the bin compositionally stable, like a gyroscope resisting external torque), precession rate (ratio of torque to angular momentum — how fast the bin's composition drifts around equilibrium under neighbor pressure, high angular momentum bins precess slowly while low-momentum bins precess rapidly), nutation amplitude (range of neighbor composition ratios — the wobble superimposed on the steady precession, caused by alternating torques from neighbors with different token ratios), torque magnitude (absolute difference between the bin's token X ratio and the average neighbor ratio — the external force trying to tip the bin's composition toward the local neighborhood mean), gyroscopic stability (angular momentum attenuated by precession rate and nutation — the bin's effective resistance to compositional change after accounting for destabilizing forces), euler angle (token X ratio mapped to radians — the orientation of the bin's reserve vector in composition space), moment of inertia (how balanced the reserves are — bins near 50/50 token split have maximum moment of inertia and resist angular acceleration while skewed bins have low inertia and spin up or slow down easily), precession period (estimated time for one full compositional cycle — 2*pi divided by precession rate), nutation frequency (wobble oscillation rate proportional to nutation amplitude), wobble decay (ratio of outer to inner neighbor torque — values below 1 indicate wobble is damping as it propagates outward while values above 1 indicate amplifying wobble), spin axis tilt (how far from balanced the bin's composition is — 0 means perfectly balanced 50/50 while 1 means fully tilted to one token), larmor frequency (neighbor field strength weighted by spin alignment — how strongly the local liquidity field drives precession, analogous to charged particle precession in a magnetic field), cone angle (arctangent of precession rate over angular momentum — the opening angle of the precession cone, wider cones mean more dramatic compositional sweeps), geometric phase (Berry phase accumulated over one precession cycle — 2*pi times 1 minus cosine of cone angle, representing the holonomy of the compositional trajectory), stability margin (angular momentum minus torque magnitude clamped to 0-1 — the safety buffer before torque overcomes spin and the bin topples), precession Gini (inequality of gyroscopic stability across bins — 0 means all bins equally stable while 1 means stability concentrated in few bins), spin coherence (uniformity of spin axis tilts — high coherence means all bins tilt similarly suggesting a collective precession pattern), torque alignment (fraction of consecutive bin pairs where composition gradient direction is consistent — high alignment means torque pushes systematically in one direction while low alignment means chaotic torque landscape), and composite precession index (0-100 from stable bin fraction, stability margin, spin coherence, and low precession rate), classifying pools by spin regime as GYROSCOPICALLY_STABLE (index >= 80 — bins have high angular momentum resisting perturbation with wide stability margins and coherent spin axes), STEADY_PRECESSION (60-80 — bins precess smoothly and predictably under moderate torque with trackable compositional drift), NUTATING (40-60 — visible wobble overlaid on precession from alternating neighbor torques making short-term composition less predictable), TUMBLING (20-40 — angular momentum insufficient to maintain gyroscopic stability resulting in erratic compositional changes), or TOPPLED (< 20 — bins have fallen over with extreme skew or depletion and no gyroscopic resistance to further perturbation), and by pattern verdict as LOCKED (spin-stabilized with slow predictable composition changes), PRECESSING (steady trackable drift), WOBBLING (nutation overlaid reducing predictability), UNSTABLE (frequent tumbling or near-topple states), or CHAOTIC (no discernible gyroscopic behavior pattern)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-precession/hodlmm-bin-precession.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Precession Analyzer

## What it does

Models gyroscopic precession physics across HODLMM bins. In physics, a spinning gyroscope resists changes to its orientation — the faster it spins (higher angular momentum), the more force (torque) is needed to tip it. When torque is applied, the gyroscope doesn't fall over; instead it precesses — its axis traces a cone around the vertical, drifting steadily rather than collapsing. If the torque fluctuates, the gyroscope also nutates — a wobble superimposed on the smooth precession.

In DLMM pools, each bin acts as a spinning body. Its angular momentum comes from reserve depth weighted by trading volume — bins with deep reserves and active trading have strong spin resisting compositional change. Neighbor bins with different token ratios exert torque, trying to tip the bin's composition toward the local mean. High-momentum bins precess slowly (stable composition with gradual drift) while low-momentum bins tumble (erratic composition changes).

## Why agents need it

LP agents need to understand whether a bin's token composition will remain stable or shift unpredictably. A bin showing 60/40 token split might be gyroscopically stable (high angular momentum, low torque — it will stay near 60/40) or it might be tumbling (low momentum, high torque — it could swing to 80/20 or 40/60 rapidly).

Angular momentum tells agents which bins are spinning fast enough to resist perturbation. High-momentum bins near the active price are the strongest anchors — they maintain their composition despite trading pressure, providing reliable liquidity.

Precession rate reveals how fast composition drifts. Low precession bins are ideal for set-and-forget positions. High precession bins require active monitoring as their token ratio sweeps through a wide range over time.

Nutation amplitude shows short-term unpredictability. Even a slowly precessing bin may wobble significantly if neighbors alternate between very different compositions. LP agents who need predictable short-term exposure should prefer bins with low nutation.

Stability margin is the safety buffer before toppling. Bins where angular momentum barely exceeds torque are one liquidity removal away from losing gyroscopic stability entirely. LP agents should monitor bins with thin margins.

Spin coherence across the pool reveals whether bins share a collective precession pattern (coordinated drift) or have independent, chaotic spin states. Coherent pools are more predictable for range-based LP strategies.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-precession/hodlmm-bin-precession.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-precession/hodlmm-bin-precession.ts status
```

### run
Analyzes bin precession dynamics for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-precession/hodlmm-bin-precession.ts run
bun run hodlmm-bin-precession/hodlmm-bin-precession.ts run --pool 1
bun run hodlmm-bin-precession/hodlmm-bin-precession.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgPrecessionIndex": 55,
    "gyroscopicallyStableCount": 1,
    "steadyPrecessionCount": 2,
    "nutatingPoolCount": 1,
    "tumblingPoolCount": 1,
    "toppledPoolCount": 0,
    "avgAngularMomentum": 0.42,
    "avgStabilityMargin": 0.35,
    "totalStableBins": 18,
    "totalToppledBins": 4,
    "avgPrecessionGini": 0.38
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
      "avgAngularMomentum": 0.48,
      "peakGyroscopicStability": 0.72,
      "peakBin": 8388608,
      "stableCount": 8,
      "precessingCount": 6,
      "nutatingCount": 5,
      "tumblingCount": 4,
      "toppledCount": 2,
      "avgPrecessionRate": 0.15,
      "avgNutationAmplitude": 0.12,
      "avgTorqueMagnitude": 0.08,
      "maxConeAngle": 0.31,
      "avgConeAngle": 0.18,
      "avgSpinAxisTilt": 0.35,
      "avgLarmorFrequency": 0.28,
      "avgMomentOfInertia": 0.65,
      "avgWobbleDecay": 0.55,
      "avgGeometricPhase": 0.20,
      "avgStabilityMargin": 0.40,
      "precessionGini": 0.35,
      "spinCoherence": 0.62,
      "torqueAlignment": 0.45,
      "precessionIndex": 62,
      "spinRegime": "STEADY_PRECESSION",
      "patternVerdict": "PRECESSING",
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

- Angular momentum uses reserve depth relative to the largest bin as a proxy for spin speed. A bin with 50% of max reserves has 50% spin speed regardless of absolute value — a $100 bin in a $200 pool has the same normalized spin as a $50k bin in a $100k pool.
- Torque is derived from the difference between a bin's token ratio and its neighbors' average. This is a snapshot measurement — actual torque in a DLMM changes continuously as swaps shift reserves. The analyzer cannot detect transient torque spikes between observations.
- Precession rate divides torque by angular momentum. When angular momentum is very small (near-empty bins), even tiny torque produces extreme precession rates. The stability margin metric helps identify these fragile cases.
- Nutation amplitude measures the range of neighbor compositions, not actual time-series oscillation. True nutation would require multiple observations over time. The metric is a proxy for the potential wobble given the current neighbor landscape.
- Wobble decay compares inner vs outer neighbor torque. This assumes torque propagates radially from the bin. In practice, torque sources are the result of trading patterns that may not follow this spatial model.
- Moment of inertia assumes perfectly balanced (50/50) bins have maximum inertia. In reality, the relationship between token composition and resistance to change depends on the pool's price curve and bin step size.
- Gyroscopic stability is a composite metric (momentum * (1 - precession) * (1 - nutation)). The multiplicative form means any single extreme factor can collapse stability, which may overstate risk for bins that are strong on two factors but weak on one.
- Geometric phase (Berry phase) is a topological invariant in quantum mechanics but here is used as a heuristic for how much compositional displacement accumulates per precession cycle. The analogy is illustrative, not physically rigorous.
- Spin coherence measures variance of spin axis tilts. Bins can have high coherence simply because they all have extreme skew in the same direction — this indicates correlation, not necessarily stability.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
