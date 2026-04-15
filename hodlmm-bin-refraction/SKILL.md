---
name: hodlmm-bin-refraction
description: "Analyzes optical refraction analogies in HODLMM bin reserve distributions, computing refractive index per bin (ratio of local reserve density to mean density), Snell ratio at each bin boundary (ratio of adjacent refractive indices revealing flow impedance changes), critical angle (threshold beyond which total internal reflection traps liquidity in dense regions), total internal reflection (TIR) zones (bins where density gradient is so steep flow cannot escape), Brewster angle (angle of zero reflection identifying optimal entry points with minimum resistance), dispersion (how refraction varies across different trade-size wavelengths), and a composite refraction index scoring 0-100 combining TIR zone fraction, mean Snell ratio deviation, dispersion magnitude, and critical angle density, classifying pools as TRANSPARENT (uniform density, low refraction), REFRACTIVE (moderate bending of flow at boundaries), PRISMATIC (high dispersion across trade sizes), or TOTAL-REFLECTION (trapped liquidity in dense pockets)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-refraction/hodlmm-bin-refraction.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Refraction Analyzer

## What it does

Analyzes the optical refraction properties of HODLMM bin reserve distributions by treating each bin as a medium with a refractive index proportional to its reserve density. In optics, when light crosses from one medium to another with a different refractive index, it bends according to Snell's law. Applied to on-chain DLMM liquidity, when trading flow crosses bin boundaries with different reserve densities, the effective "direction" of liquidity deployment changes. Dense bins act like optically dense media — they slow flow, absorb more trade impact, and bend the effective path of liquidity transport. Sparse bins let flow pass through quickly with minimal deflection.

For each pool, the analyzer computes: refractive index per bin as the ratio of local reserve density to mean density across the scanned range — bins with n>1 are denser than average (flow slows), bins with n<1 are sparser (flow accelerates); Snell ratio at each bin boundary computed as n1/n2 for adjacent bins, where values >1 indicate flow entering a denser medium (deceleration) and values <1 indicate flow entering a sparser medium (acceleration); critical angle at each boundary computed as arcsin(n2/n1) when n2<n1, representing the threshold beyond which total internal reflection occurs and liquidity cannot escape the denser region; TIR (total internal reflection) zones identifying bins where the density gradient is so steep that flow arriving at any reasonable angle gets reflected back, trapping liquidity in dense pockets; Brewster angle computed as arctan(n2/n1) at each boundary, identifying the angle of zero reflection where flow passes through with minimum resistance — these are optimal entry points for LP positioning; dispersion measuring how the effective refraction varies across different trade-size "wavelengths" — small trades (high frequency) refract more strongly at boundaries while large trades (low frequency) bulldoze through with less deflection; and a composite refraction index scoring 0-100 combining TIR zone fraction, mean Snell ratio deviation from unity, dispersion magnitude, and critical angle density.

## Why agents need it

Refraction analysis reveals how heterogeneous a pool's reserve landscape is from the perspective of trading flow traversal — information that static TVL or even gradient metrics miss entirely. When a pool has high TIR zone density, liquidity is trapped in dense pockets and cannot redistribute to where it is needed, creating persistent imbalances that degrade LP returns. High Snell ratio deviation at boundaries means trading flow experiences abrupt impedance changes, causing slippage spikes at specific bin transitions. Brewster angles identify the optimal points where flow encounters minimal resistance — ideal for LP entry positioning. Dispersion analysis warns when small and large trades will experience fundamentally different pool dynamics, creating adverse selection risk. The composite refraction index gives agents a single number to screen pools: TRANSPARENT pools have uniform density and predictable behavior, PRISMATIC pools separate trade sizes like a prism, and TOTAL-REFLECTION pools contain liquidity traps that should be avoided.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-refraction/hodlmm-bin-refraction.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-refraction/hodlmm-bin-refraction.ts status
```

### run
Fetches bin reserves for top pools (or a specific pool) and computes all refraction metrics. Outputs a human-readable table plus JSON to stdout.
```bash
bun run hodlmm-bin-refraction/hodlmm-bin-refraction.ts run
bun run hodlmm-bin-refraction/hodlmm-bin-refraction.ts run --pool 1
bun run hodlmm-bin-refraction/hodlmm-bin-refraction.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgRefractionIndex": 38.5,
    "transparentCount": 2,
    "refractiveCount": 1,
    "prismaticCount": 1,
    "totalReflectionCount": 1,
    "tirZoneTotal": 4
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "refractionIndex": 62,
      "refractionClass": "REFRACTIVE",
      "meanRefractiveIndex": 1.34,
      "maxRefractiveIndex": 3.87,
      "snellDeviationMean": 0.42,
      "criticalAngleCount": 6,
      "tirZoneCount": 2,
      "brewsterOptimalBin": 8388610,
      "dispersion": 0.31,
      "dispersionClass": "moderate",
      "tvlUsd": 120000
    }
  ]
}
```

**Error:**
```json
{ "error": "Pool #99 not found" }
```

## Known constraints

- Requires at least 5 populated bins within +/-30 of active bin; pools with sparse distributions are skipped.
- Refractive index is normalized to mean density; absolute values vary across pools.
- TIR detection assumes isotropic flow arrival angles; real trading flow has directional bias.
- Dispersion is modeled across 3 synthetic wavelengths (small/medium/large trade sizes) — not continuous.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
- Read-only; does not reflect pending mempool transactions.
