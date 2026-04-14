---
name: hodlmm-bin-oscillation
description: "Reserve skew periodicity detector for HODLMM bins — identifies cyclic patterns in how bin reserves oscillate between token X and token Y dominance."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-oscillation/hodlmm-bin-oscillation.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Oscillation

## What it does
Detects periodic and cyclic patterns in HODLMM bin reserve distributions by analyzing how bins alternate between token X and token Y dominance. Measures reserve alternation, amplitude profiling, frequency estimation, phase coherence, and damping analysis to produce a composite oscillation score (0-100) that quantifies cyclicality strength.

## Why agents need it
Oscillating reserve patterns reveal underlying market microstructure: regular arbitrage sweeps, market-maker pulsing, or natural price cycles. Identifying these patterns lets agents distinguish between organic liquidity behavior and structured activity, and informs decisions about when to rebalance or when cyclic patterns may revert.

## Commands
### doctor
Validates API connectivity.
### run
Full analysis for selected pools.
### status
Quick summary for top pools.

## Safety notes

- **Read-only.** No transactions are submitted, no wallet or signing required.
- **Mainnet-only.** Bitflow HODLMM API does not support testnet.
- Pools with fewer than 5 populated bins produce unreliable metrics — flagged in output.

## Known constraints
- Read-only. No wallet required.
- Scans bins within ±30 of the active bin.
