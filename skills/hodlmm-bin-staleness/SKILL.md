---
name: hodlmm-bin-staleness
description: "Detects stale or abandoned liquidity positions in HODLMM bins by analyzing reserve patterns, activity signals, and bin age indicators."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-staleness/hodlmm-bin-staleness.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Staleness

## What it does
Identifies stale and zombie liquidity bins in HODLMM pools by analyzing reserve patterns that indicate abandoned or unmanaged positions. Measures distance decay from the active bin, single-sided reserve ratios, isolation scores, and estimates the USD value of zombie capital locked in likely-stale bins vs effective active TVL.

## Why agents need it
Stale liquidity inflates reported TVL while contributing no fee-earning capacity. Knowing the staleness burden of a pool helps agents assess true effective liquidity depth and avoid pools where most capital is orphaned far from the active price range, reducing fee yield projections accordingly.

## Commands
### doctor
Validates API connectivity.
### run
Full analysis for selected pools.
### status
Quick summary for top pools.

## Known constraints
- Read-only. No wallet required.
- Scans bins within ±30 of the active bin.
