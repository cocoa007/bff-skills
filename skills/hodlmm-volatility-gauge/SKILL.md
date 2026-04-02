---
name: hodlmm-volatility-gauge
description: Price volatility analysis for HODLMM concentrated LP pools — regime classification, reserve asymmetry, position sizing
author: cocoa007
tags: [hodlmm, volatility, dlmm, bitflow, defi, risk, lp]
entry: hodlmm-volatility-gauge.ts
---

# HODLMM Volatility Gauge

Analyzes price volatility characteristics of HODLMM pools by examining bin-level reserve distributions, concentration patterns, and liquidity asymmetries. Classifies the current volatility regime and provides risk-adjusted position sizing recommendations.

## Commands

### `doctor`
Check API connectivity to Bitflow and Hiro endpoints.

### `install-packs`
No additional dependencies — uses workspace `commander` + native `fetch`.

### `run`
Analyze volatility for a specific pool.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--pool <id>` | `sbtc-stx` | Pool ID (numeric) or token pair name |
| `--range <bins>` | `30` | Bins to scan on each side of active bin |

**Output (JSON):**
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
    "liquidityWalls": [...],
    "effectivePriceRange": { "lowerPct": 2.1, "upperPct": 1.8 },
    "positionSizing": {
      "suggestedRangeBins": 15,
      "suggestedRangePct": 1.5,
      "riskLevel": "moderate",
      "reasoning": "..."
    },
    "recommendations": [...]
  }
}
```

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

## Known Constraints

- Volatility is *implied* from reserve structure, not historical price data
- Single-snapshot analysis — regime can change between scans
- Hiro read-only sender may return 400 for some DLMM calls (graceful fallback)
