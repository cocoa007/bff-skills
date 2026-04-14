---
name: hodlmm-bin-admittance
description: "Bin trade flow admittance analyzer for Bitflow HODLMM pools — measures how easily trades pass through each bin by decomposing admittance into conductance (reserve depth) and susceptance (directional bias). Identifies high-throughput corridors and susceptance traps."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-admittance/hodlmm-bin-admittance.ts"
  requires: ""
  tags: "defi, read-only, mainnet-only, l2, infrastructure"
---

# HODLMM Bin Admittance

Bin trade flow admittance analyzer for Bitflow HODLMM (DLMM) concentrated liquidity pools.

## What it does

Admittance is the inverse of impedance. While impedance measures how much resistance a bin offers to trade execution, admittance measures how easily trades pass through. High admittance = smooth flow, predictable slippage, reliable execution.

The skill decomposes admittance into two components from AC circuit theory:

- **Conductance (G):** The real component — proportional to reserve depth. Deep bins have high conductance; trades flow through them easily.
- **Susceptance (B):** The imaginary component — directional bias from reserve skew. A bin with 90% token-X acts like a capacitor storing buy-side energy. Trades in the biased direction get partially absorbed rather than flowing through.

The **phase angle** (arctan B/G) reveals whether a bin's behavior is dominated by depth (low angle, conductive) or skew (high angle, reactive).

## Why agents need it

`hodlmm-bin-impedance` tells you where trades face resistance. `hodlmm-bin-admittance` tells you where trades flow freely — and crucially, identifies susceptance traps where directional trades get absorbed by skewed reserves.

Use cases:
1. **Route optimization:** Find high-throughput corridors where trades encounter minimal friction
2. **Trap avoidance:** Identify susceptance traps where your directional trade will be absorbed by one-sided reserves
3. **Execution prediction:** Phase angle tells you whether a bin will resist your trade (conductive) or redirect it (reactive)
4. **Directional analysis:** Compare buy-side vs sell-side admittance to understand which direction has easier flow

## Commands

### doctor

Check API connectivity for Bitflow and Hiro endpoints.

```bash
bun run skills/hodlmm-bin-admittance/hodlmm-bin-admittance.ts doctor
```

### run

Full admittance analysis with decomposition into conductance, susceptance, phase angles, corridors, and traps.

```bash
bun run skills/hodlmm-bin-admittance/hodlmm-bin-admittance.ts run
bun run skills/hodlmm-bin-admittance/hodlmm-bin-admittance.ts run --pool 1
bun run skills/hodlmm-bin-admittance/hodlmm-bin-admittance.ts run --top 5
```

Options:
- `--pool <id>` — analyze a specific DLMM pool by numeric ID
- `--top <n>` — analyze top N pools by TVL (default: 3)

### status

Quick admittance summary for the top 5 pools by TVL.

```bash
bun run skills/hodlmm-bin-admittance/hodlmm-bin-admittance.ts status
```

## Admittance model

### Conductance (G)

Real component of admittance. Proportional to reserve depth:

```
G = min(1, depthRatio * 1.2)
depthRatio = bin.totalUsd / maxReserveInRange
```

High conductance = deep bin = easy flow.

### Susceptance (B)

Imaginary component. Measures directional bias from reserve skew:

```
B = (xRatio - 0.5) * 2
xRatio = reserveXUsd / totalReserveUsd
```

B > 0 = buy-biased (mostly token-X). B < 0 = sell-biased (mostly token-Y). B = 0 = balanced.

### Admittance magnitude (Y)

```
Y = sqrt(G^2 + B^2)
```

### Phase angle

```
phi = arctan(|B| / G) in degrees
```

0 = purely conductive. 90 = purely susceptive.

### Admittance index (composite, 0-100)

Higher is better (more permissive). Weighted components:

| Component | Weight | Source |
|---|---|---|
| Conductance | 35% | Average reserve depth |
| Uniformity | 20% | Evenness of admittance distribution |
| Corridors | +15% bonus | High-throughput corridors |
| Susceptance traps | -10% penalty | Directional absorption zones |
| Phase angle | -10% penalty | Reactive vs conductive behavior |
| Empty bins | -10% penalty | Gaps in the range |
| Asymmetry | -5% penalty | Buy/sell admittance imbalance |
| Gradient | -5% penalty | Rate of admittance change |

### Classification

| Class | Index | Meaning |
|---|---|---|
| superconductive | 80-100 | Near-frictionless trade flow |
| high-throughput | 60-79 | Trades flow easily |
| moderate-throughput | 40-59 | Adequate but uneven |
| restricted | 20-39 | Low admittance, thin reserves |
| blocked | 0-19 | Near-zero flow, extreme slippage expected |

## Data sources

| Source | Data | Endpoint |
|---|---|---|
| Bitflow App API | Pool list, TVL, volume, fees, active bin | `bff.bitflowapis.finance/api/app/v1/pools` |
| Hiro API | On-chain bin reserves via read-only contract calls | `api.hiro.so/v2/contracts/call-read/...` |

## Safety notes

- **Read-only** — never submits transactions or moves funds
- **No wallet required** — safe to call from any agent without authentication
- **Mainnet-only** — Bitflow HODLMM is mainnet-only
- **No state written** — pure computation, no local files modified
- On-chain reads are rate-limited by Hiro API; scanning many bins may take time
- Admittance values are relative within each pool — do not compare raw values across pools with different TVL scales
