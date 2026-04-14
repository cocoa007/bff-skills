---
name: hodlmm-bin-divergence
description: "Measures statistical distance between actual HODLMM bin reserve distributions and theoretical references (uniform, Gaussian, Laplace) using KL-divergence, Jensen-Shannon, Wasserstein, Bhattacharyya, total variation, and Hellinger metrics."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-divergence/hodlmm-bin-divergence.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Divergence Analyzer

## What it does

Computes statistical distance metrics between the actual on-chain bin reserve distribution of HODLMM DLMM pools and three theoretical reference distributions (uniform, Gaussian, Laplace). Reports which theoretical shape best fits the actual liquidity curve and quantifies the divergence using six complementary distance metrics.

## Why agents need it

Knowing the shape of liquidity tells you what the market expects. A Gaussian fit means LPs agree on a price center. A Laplace fit means conviction is sharper with heavier tails. A uniform fit means no consensus — capital is parked passively. Agents can use this to calibrate position sizing, detect regime shifts when the best-fit distribution changes, and identify pools where LP behavior has diverged from efficient placement.

## Commands

### doctor
Validates API connectivity and lists available metrics and reference distributions.

```bash
bun run skills/hodlmm-bin-divergence/hodlmm-bin-divergence.ts doctor
```

### run
Full divergence analysis for selected pools. Reports all six distance metrics against each reference distribution, entropy analysis, tail weight, peakedness, asymmetry, and an ASCII distribution map comparing actual vs best-fit.

```bash
bun run skills/hodlmm-bin-divergence/hodlmm-bin-divergence.ts run --top 3
bun run skills/hodlmm-bin-divergence/hodlmm-bin-divergence.ts run --pool 1
```

### status
Quick divergence summary for the top 5 pools by TVL.

```bash
bun run skills/hodlmm-bin-divergence/hodlmm-bin-divergence.ts status
```

## Output contract

All outputs are JSON to stdout.

**Success:**

```json
{
  "result": "divergence_analysis",
  "data": {
    "pools": [{ "poolId": 1, "pair": "sBTC/STX", "profile": { "bestFit": "gaussian", "bestFitScore": 78, "divergenceScore": 72 } }],
    "summary": { "poolsAnalyzed": 3, "avgDivergenceScore": 68 }
  }
}
```

**Error:**

```json
{ "error": "descriptive message" }
```

## Metrics explained

- **KL divergence**: Asymmetric information loss when approximating actual distribution with reference.
- **Jensen-Shannon distance**: Symmetric, bounded version of KL. Square root of JS divergence.
- **Wasserstein distance**: Earth-mover's distance — minimum cost to reshape one distribution into the other.
- **Bhattacharyya coefficient**: Overlap measure (1 = identical, 0 = disjoint).
- **Total variation distance**: Maximum pointwise difference between distributions (0 to 1).
- **Hellinger distance**: Geometric mean-based divergence, bounded [0, 1].

## Known constraints

- Read-only. No wallet or signing required.
- Scans bins within a fixed radius of the active bin (default ±30).
- Reference distributions use default shape parameters tuned to the scan window. Custom sigma/scale not yet exposed.
- Entropy ratio assumes populated bins only for max entropy calculation.
