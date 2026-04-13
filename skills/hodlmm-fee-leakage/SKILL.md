---
name: hodlmm-fee-leakage
description: "Fee leakage pathology analyzer for HODLMM pools — diagnoses root causes of fee loss (range drift, concentration gaps, asymmetric depletion, dead capital, fee-zone sparsity) with severity scoring and targeted remediation."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "analyze <pool-id> | scan | compare <pool-ids...>"
  entry: "hodlmm-fee-leakage/hodlmm-fee-leakage.ts"
  requires: ""
  tags: "defi, read-only, mainnet-only, l2"
---

# HODLMM Fee Leakage Pathology Analyzer

## What it does

Diagnoses *why* a concentrated liquidity position is losing fees, not just *how much*. Classifies fee leakage into five distinct pathologies — range drift, concentration gaps, asymmetric depletion, dead capital zones, and fee-zone sparsity — each with severity scoring (0-100), USD impact estimates, and targeted remediation advice.

Where fee-capture-rate tells you "you're capturing 60% of fees", fee-leakage tells you "you're losing 40% because: 15% range drift (your liquidity center is 4 bins from active), 12% dead capital ($2,400 stranded >12 bins away), 8% asymmetric depletion (right side depleted by sell pressure), 5% concentration gap (active bins under-capitalized)."

## Why agents need it

Autonomous LP managers need diagnostic intelligence, not just monitoring. When fee capture drops, an agent needs to know *which specific action* will recover the most fees: rebalance the range? Add to the active bin? Remove dead capital? This skill provides the pathology breakdown that maps directly to corrective actions, enabling agents to prioritize the highest-impact remediation.

## Safety notes

- **Read-only** — never submits transactions or moves funds
- **No wallet required** — safe to call without authentication
- **Mainnet-only** — Bitflow HODLMM pools are mainnet-only
- On-chain reads via Hiro API (get-bin, get-active-bin-id) — rate limits apply

## Commands

### analyze

Full pathology report for a single pool. Scans bins around the active bin, classifies leakage sources, and provides severity-ranked recommendations.

```bash
bun run skills/hodlmm-fee-leakage/hodlmm-fee-leakage.ts analyze 1
bun run skills/hodlmm-fee-leakage/hodlmm-fee-leakage.ts analyze 3 --json
```

### scan

Scan all HODLMM pools and rank by leakage severity. Shows the worst-performing pools first.

```bash
bun run skills/hodlmm-fee-leakage/hodlmm-fee-leakage.ts scan
bun run skills/hodlmm-fee-leakage/hodlmm-fee-leakage.ts scan --top 5 --json
```

### compare

Side-by-side pathology comparison between pools.

```bash
bun run skills/hodlmm-fee-leakage/hodlmm-fee-leakage.ts compare 1 3 6
```

## Pathology model

| Pathology | What it detects | Severity driver |
|---|---|---|
| **Range Drift** | Liquidity center of mass has moved away from active bin | Distance of weighted center from active bin |
| **Concentration Gap** | Fee zone (active bin +/- 1) is under-capitalized relative to expectations | Ratio of actual vs expected fee-zone liquidity |
| **Asymmetric Depletion** | One side of the distribution is significantly depleted | Left/right liquidity imbalance ratio |
| **Dead Capital** | Liquidity stranded >12 bins from active bin with near-zero chance of earning | % of total liquidity in dead zone |
| **Fee-Zone Sparsity** | Empty bins within the fee-earning zone | Fill rate of fee-zone bins |

### Health scoring

Composite health score = 100 - total leakage rate. Graded as:

| Grade | Score | Meaning |
|---|---|---|
| HEALTHY | 85-100 | Minimal leakage, well-positioned |
| MINOR | 70-84 | Small inefficiencies, low priority |
| MODERATE | 50-69 | Meaningful fee loss, should address |
| SEVERE | 25-49 | Significant capital inefficiency |
| CRITICAL | 0-24 | Most liquidity is idle, urgent rebalance needed |

## Output contract

All outputs are JSON to stdout when `--json` flag is used.

**Success:**
```json
{
  "poolId": 1,
  "pair": "sBTC/USDCx",
  "healthScore": 72.5,
  "healthGrade": "MINOR",
  "totalLeakageRate": 27.5,
  "totalLeakageDailyUsd": 4.12,
  "pathologies": [
    { "name": "Range Drift", "severity": 45, "leakagePct": 15, "leakageUsd": 1.65 }
  ],
  "topRemediation": "Rebalance position to center liquidity around bin #8388612."
}
```

**Error:**
```json
{ "error": "Pool #99 not found or below $1,000 TVL minimum" }
```

## Data sources

| Source | Data | Endpoint |
|---|---|---|
| Bitflow App API | Pool list with TVL, volume, fees, token prices | `bff.bitflowapis.finance/api/app/v1/pools` |
| Hiro Stacks API | On-chain bin reserves, active bin ID | `api.hiro.so/v2/contracts/call-read/...` |

## Known constraints

- Bin scan radius is 20 bins from active — liquidity beyond this range is not captured
- On-chain bin reads are sequential (1 per bin) — full scan of 41 bins takes ~10-20s per pool
- Hiro API rate limits may throttle scans of multiple pools
- Fee estimates are based on 24h volume, which can be volatile
- Pathology severity scores are heuristic-based, not ML-trained
