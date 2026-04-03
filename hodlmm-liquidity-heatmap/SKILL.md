---
name: hodlmm-liquidity-heatmap
description: "Bin-level liquidity distribution profiler for HODLMM pools — maps reserve concentration across the full bin range, identifies clusters, gaps, walls, and classifies distribution shape."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | install-packs | run --pool <id> | scan --top <n> --min-tvl <usd>"
  entry: "hodlmm-liquidity-heatmap/hodlmm-liquidity-heatmap.ts"
  requires: ""
  tags: "defi, read-only, mainnet-only, l2, hodlmm, liquidity, analytics, heatmap, visualization"
---

# HODLMM Liquidity Heatmap

## What it does

Profiles bin-level liquidity distribution across HODLMM concentrated LP pools. Generates a text-based heatmap of reserve concentration, detects structural features (clusters, gaps, walls), and classifies the overall distribution shape.

## Why agents need it

Knowing *where* liquidity sits across the bin range is fundamental to LP strategy. A pool's aggregate TVL hides critical structure:

- **Heatmap visualization** — instant visual read of liquidity layout across 60+ bins
- **Cluster detection** — find where liquidity concentrates and how wide each cluster spans
- **Gap detection** — identify empty zones where trades would exhaust liquidity
- **Wall detection** — spot bins holding disproportionate reserves that act as support/resistance
- **Distribution profiling** — classify shape as UNIFORM, CONCENTRATED, BIMODAL, SKEWED, or SPARSE
- **Balance analysis** — bid vs ask side liquidity weight around active bin

Other HODLMM skills analyze risk, fees, or flows. This skill maps the **spatial structure** of liquidity.

## Commands

### `doctor`
Check API connectivity to Bitflow and Hiro endpoints.

### `install-packs`
No additional dependencies — uses workspace `commander` + native `fetch`.

### `run`
Full liquidity heatmap and distribution analysis for a specific pool.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--pool <id>` | *(required)* | HODLMM pool ID to analyze |

**Output (JSON):**
```json
{
  "tool": "hodlmm-liquidity-heatmap",
  "command": "run",
  "poolId": 1,
  "pair": "sBTC-STX",
  "heatmap": "·····░░▒▒▓██▓▒▒░░·····",
  "heatmapLegend": "█=WALL(80%+) ▓=HOT(50%+) ▒=WARM(25%+) ░=COOL(5%+) ·=EMPTY",
  "distribution": {
    "shape": "CONCENTRATED",
    "binsWithLiquidity": 12,
    "utilizationPct": 20,
    "effectiveWidth": 8
  },
  "concentration": {
    "top1BinPct": 22,
    "top3BinsPct": 55,
    "top5BinsPct": 75,
    "peakBin": { "binId": 8388610, "usd": 12500, "offset": 2 }
  },
  "balance": {
    "leftPct": 35,
    "rightPct": 45,
    "bias": "BALANCED"
  },
  "clusters": [{ "startBin": 8388605, "endBin": 8388615, "width": 11, "pctOfTotal": 85 }],
  "gaps": [{ "startBin": 8388620, "endBin": 8388625, "width": 6, "position": "ABOVE_ACTIVE" }],
  "walls": [{ "binId": 8388610, "pctOfTotal": 22, "side": "ACTIVE" }]
}
```

### `scan`
Compare liquidity distribution shapes and utilization across all HODLMM pools.

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--top <n>` | `10` | Number of pools to show |
| `--min-tvl <usd>` | `1000` | Minimum pool TVL to consider |

## Distribution Shapes

| Shape | Meaning | LP Implication |
|-------|---------|----------------|
| **UNIFORM** | Even spread across bins | Low capital efficiency, broad coverage |
| **CONCENTRATED** | Tight cluster near active bin | High capital efficiency, range risk |
| **BIMODAL** | Two distinct liquidity peaks | Split strategy or market maker behavior |
| **LEFT_SKEWED** | More liquidity below active bin | Bid-heavy, defensive positioning |
| **RIGHT_SKEWED** | More liquidity above active bin | Ask-heavy, bullish positioning |
| **SPARSE** | Very few bins with liquidity | Thin market, high slippage risk |

## Heatmap Intensity Scale

| Symbol | Level | Threshold | Meaning |
|--------|-------|-----------|---------|
| `█` | WALL | 80%+ of peak | Dominant liquidity concentration |
| `▓` | HOT | 50-80% of peak | Heavy liquidity |
| `▒` | WARM | 25-50% of peak | Moderate liquidity |
| `░` | COOL | 5-25% of peak | Light liquidity |
| `·` | EMPTY | <5% of peak | Negligible or zero |

## Structural Features

### Clusters
Contiguous runs of 2+ bins with liquidity. Each cluster reports:
- Bin range (start → end) and width
- Total USD and percentage of pool TVL
- Peak bin within the cluster

### Gaps
Empty zones between the first and last non-zero bins. Gaps of 2+ bins indicate potential slippage zones. Classified by position relative to active bin (BELOW/ABOVE/AT).

### Walls
Individual bins holding >15% of total scanned liquidity. Act as price support (BID side) or resistance (ASK side). Large walls can absorb significant trade volume.

## Data Sources

- **Bitflow App API**: Pool metadata, TVL, token prices
- **Hiro API**: Read-only contract calls for bin reserves, active bin
- All data is on-chain and point-in-time

## Output contract

All commands output JSON to stdout with `tool: "hodlmm-liquidity-heatmap"`.

| Field | Type | Present |
|-------|------|---------|
| `tool` | `"hodlmm-liquidity-heatmap"` | always |
| `command` | `"doctor" \| "run" \| "scan" \| "install-packs"` | always |
| `timestamp` | ISO 8601 string | always |
| `error` | string | on failure only |
| `heatmap` | string | `run`/`scan` |
| `distribution` | object | `run` only |
| `clusters` | array | `run` only |
| `gaps` | array | `run` only |
| `walls` | array | `run` only |

## Safety notes

- **Read-only**: No transactions, no wallet required
- **Rate limiting**: Sequential contract queries, bounded scan radius
- **Not financial advice**: Distribution profiles are descriptive, not predictive
- **Snapshot-based**: Liquidity layout can change with any LP operation

## Known Constraints

- Heatmap resolution limited by scan radius (default ±30 bins from active)
- Distribution shape classification uses heuristics, not statistical tests
- Wall detection threshold (15%) is fixed — may miss walls in very distributed pools
- Text heatmap is 1D; does not show token-x vs token-y breakdown per bin
