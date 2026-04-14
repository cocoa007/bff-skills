---
name: hodlmm-bin-polarity
description: "Analyzes directional bias in HODLMM bin reserves — detects whether liquidity is skewed toward token X or token Y across the bin range."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-polarity/hodlmm-bin-polarity.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Polarity

## What it does
Measures directional bias in HODLMM bin reserve distributions to detect sustained buy or sell pressure across the active range. Computes polarity vectors per zone (inner/mid/outer), pressure gradients from the active bin outward, flip detection where polarity reverses, left vs right wing dominance asymmetry, and a composite polarity score (0-100).

## Why agents need it
Persistent reserve skew toward one token reveals one-sided flow pressure that often precedes price movement. Agents can use polarity analysis to detect early momentum signals, assess LP inventory risk, and decide whether adding liquidity in a skewed pool aligns with their directional thesis.

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
