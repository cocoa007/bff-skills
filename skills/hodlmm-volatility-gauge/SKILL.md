---
name: hodlmm-volatility-gauge
description: "Price volatility analysis for HODLMM concentrated LP pools — regime classification, reserve asymmetry, position sizing."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run"
  entry: "hodlmm-volatility-gauge/hodlmm-volatility-gauge.ts"
  requires: "wallet"
  tags: "defi, read, mainnet-only, hodlmm, volatility"
---

# HODLMM Volatility Gauge

Analyzes price volatility characteristics of HODLMM pools by examining bin-level reserve distributions, concentration patterns, and liquidity asymmetries. Classifies the current volatility regime and provides risk-adjusted position sizing recommendations.

## What it does

Scans bin reserves around the active bin of a HODLMM pool, computing reserve concentration, spread (coefficient of variation), asymmetry between X/Y reserves, empty bin ratio, and volume/TVL intensity. These five signals produce a composite volatility score (0–100) and regime classification (LOW/MODERATE/HIGH/EXTREME), along with position sizing recommendations and liquidity wall detection.

## Why agents need it

An autonomous LP agent must gauge current volatility before deciding range width and position size. This skill transforms raw on-chain bin data into an actionable volatility regime and structured JSON payload that downstream skills (entry optimizer, rebalance signal, IL calculator) can consume directly without additional chain queries.

## Safety notes

- Read-only — this skill never submits transactions or moves funds.
- Mainnet only — pool IDs and contract addresses are mainnet-specific.
- Volatility is *implied* from reserve structure, not historical price data — treat as a snapshot estimate.
- Hiro read-only sender may return 400 for some DLMM calls; the skill falls back gracefully.

## Output contract

```json
{
  "tool": "hodlmm-volatility-gauge",
  "pool": { "id": 1, "pair": "sBTC-STX", "tvlUsd": 500000, "volume24hUsd": 50000 },
  "scan": { "range": 30, "totalBins": 61, "nonEmptyBins": 35 },
  "volatility": {
    "regime": "MODERATE",
    "score": 42,
    "reserveConcentration": 55.2,
    "reserveSpread": 1.34,
    "asymmetryTrend": { "ratio": 0.62, "dominantSide": "X", "skewMagnitude": 0.24 },
    "emptyBinRatio": 42.6,
    "liquidityWalls": [],
    "effectivePriceRange": { "lowerPct": 2.1, "upperPct": 1.8 },
    "positionSizing": {
      "suggestedRangeBins": 15,
      "suggestedRangePct": 1.5,
      "riskLevel": "moderate",
      "reasoning": "..."
    },
    "recommendations": []
  }
}
```

## Commands

### `doctor`
Check API connectivity to Bitflow and Hiro endpoints.

### `run`
Analyze volatility for a specific pool.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--pool <id>` | `sbtc-stx` | Pool ID (numeric) or token pair name |
| `--range <bins>` | `30` | Bins to scan on each side of active bin |

## Scoring Methodology

Volatility score (0–100) is a composite of five signals:

| Signal | Weight | High Vol Indicator |
|--------|--------|--------------------|
| Reserve concentration | 25% | Low concentration (spread thin) |
| Reserve spread (CV) | 20% | High coefficient of variation |
| Reserve asymmetry | 20% | One-sided reserves (directional pressure) |
| Empty bin ratio | 15% | Many gaps in liquidity |
| Volume/TVL ratio | 20% | High trading activity relative to liquidity |

**Regimes:**
- **LOW** (0–24): Stable, tight ranges work well
- **MODERATE** (25–49): Normal conditions, standard ranges
- **HIGH** (50–74): Elevated risk, widen ranges
- **EXTREME** (75–100): Reduce exposure or wait

## Data Sources

- **Bitflow App API**: Pool metadata, TVL, 24h volume, token prices
- **Hiro API / DLMM Contract**: On-chain bin reserves, active bin, bin step
- Falls back gracefully if Hiro read-only sender is blocked (known DLMM issue)
