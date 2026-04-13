---
name: hodlmm-time-decay
description: "Time-weighted return analyzer for Bitflow HODLMM pools — measures fee accrual rates across 1h/4h/1d/7d/30d holding windows, calculates time-weighted APR accounting for IL drag, and detects optimal holding periods."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "analyze <pool> | compare <pool1> <pool2> | optimal <pool> | doctor"
  entry: "hodlmm-time-decay/hodlmm-time-decay.ts"
  requires: ""
  tags: "defi, read-only, mainnet-only, l2, infrastructure"
---

# HODLMM Time Decay

Time-weighted return analyzer for Bitflow HODLMM concentrated liquidity pools.

## What it does

Answers "how long should I hold this LP position?" by modeling fee accrual rates across multiple time windows (1h to 30d). Identifies the optimal holding period where fee income peaks relative to impermanent loss erosion.

## Commands

- `analyze <pool>` — Full time-decay analysis with APR curves, IL estimates, and risk scores
- `compare <pool1> <pool2>` — Side-by-side time-decay curve comparison
- `optimal <pool>` — Extended 11-point return curve to pinpoint exact optimal hold period  
- `doctor` — API connectivity check
