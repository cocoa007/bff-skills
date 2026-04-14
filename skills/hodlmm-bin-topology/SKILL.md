---
name: hodlmm-bin-topology
description: "Maps topological features (peaks, valleys, plateaus, cliffs, gaps) of HODLMM liquidity distributions. Scans on-chain bin reserves via Hiro API, classifies structural features, computes smoothness/symmetry/ruggedness metrics, and outputs a composite topology score to help LPs understand the shape of liquidity around the active bin."
metadata:
  author: cocoa007
  author-agent: "Fluid Briar (Agent 4) — SP16H0KE0BPR4XNQ64115V5Y1V3XTPGMWG5YPC9TR | bc1qv8dt3v9kx3l7r9mnz2gj9r9n9k63frn6w6zmrt"
  user-invocable: "true"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-topology/hodlmm-bin-topology.ts"
  requires: ""
  tags: "defi, read-only, mainnet-only, l2, analytics"
---

# HODLMM Bin Topology Analyzer

Maps the topological features of on-chain HODLMM liquidity distributions to help LPs understand structural liquidity shape.

## What it does

Scans on-chain bin reserves around the active bin, then classifies each bin transition into topological features: peaks (local maxima), valleys (local minima), plateaus (flat zones), cliffs (sudden jumps), and gaps (empty bins between populated ones). Computes composite metrics — smoothness index, symmetry score, ruggedness, centroid offset — and produces a topology score (0-100) with class labels (SMOOTH/ROLLING/JAGGED/FRAGMENTED/BARREN).

## Why agents need it

The geometric shape of a liquidity distribution directly impacts trade execution quality, slippage patterns, and LP positioning strategy. A smooth, symmetric distribution handles trades gracefully; a jagged, gapped distribution creates slippage spikes and unpredictable fee capture. This skill gives agents a structural read on pool health that complements volume and TVL metrics.

## Safety notes

- **Read-only.** No transactions are submitted.
- **Mainnet-only.** Bitflow HODLMM pools are mainnet.
- All data from public APIs (Hiro + Bitflow).

## Commands

### doctor

Checks all data sources.

```bash
bun run hodlmm-bin-topology/hodlmm-bin-topology.ts doctor
```

### run

Analyze topology for top pools or a specific pool.

```bash
bun run hodlmm-bin-topology/hodlmm-bin-topology.ts run
bun run hodlmm-bin-topology/hodlmm-bin-topology.ts run --pool 1
bun run hodlmm-bin-topology/hodlmm-bin-topology.ts run --top 5
```

### status

Quick topology summary for top 5 pools.

```bash
bun run hodlmm-bin-topology/hodlmm-bin-topology.ts status
```

## Output contract

All outputs are strict JSON to stdout.

| Field | Type | Description |
|---|---|---|
| `result` | `string` | `topology_analysis` or `topology_status` |
| `data.pools[].pair` | `string` | Token pair (e.g., `sBTC/USDC`) |
| `data.pools[].profile.topoScore` | `number` | Composite topology score (0-100) |
| `data.pools[].profile.topoClass` | `string` | SMOOTH / ROLLING / JAGGED / FRAGMENTED / BARREN |
| `data.pools[].profile.peakCount` | `number` | Number of local maxima |
| `data.pools[].profile.valleyCount` | `number` | Number of local minima |
| `data.pools[].profile.plateauCount` | `number` | Number of flat zones |
| `data.pools[].profile.cliffCount` | `number` | Number of abrupt transitions |
| `data.pools[].profile.gapCount` | `number` | Number of empty gaps |
| `data.pools[].profile.smoothnessIndex` | `number` | Distribution smoothness (0-100) |
| `data.pools[].profile.symmetryScore` | `number` | Left-right symmetry (0-100) |
| `data.pools[].profile.ruggedness` | `number` | Direction change frequency (0-100) |
| `data.pools[].profile.centroidOffset` | `number` | Liquidity center offset from active bin |
| `data.pools[].asciiMap` | `string` | ASCII visualization of topology |
| `data.pools[].recommendation` | `string` | Human-readable topology assessment |

## Data sources

| Source | Data | Endpoint |
|---|---|---|
| Bitflow App API | Pool list, TVL, volume, prices | `bff.bitflowapis.finance/api/app/v1/pools` |
| Hiro Stacks API | On-chain bin reserves | `api.hiro.so/v2/contracts/call-read/...` |
