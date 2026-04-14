---
name: hodlmm-bin-efficiency
description: "Analyzes hodlmm bin efficiency metrics for HODLMM pools on Bitflow."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "cocoa007/hodlmm-bin-efficiency/hodlmm-bin-efficiency.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# Hodlmm Bin Efficiency

## What it does

Analyzes hodlmm bin efficiency metrics across HODLMM liquidity pools on Bitflow DEX.

## Safety notes

- **Read-only.** No transactions are submitted, no wallet or signing required.
- **Mainnet-only.** Bitflow HODLMM API does not support testnet.
- Pools with fewer than 5 populated bins produce unreliable metrics — flagged in output.

## Known constraints

- Read-only. No wallet or signing required.
- Scans bins within a fixed radius of the active bin.
- Pools with very few populated bins (<5) will have limited signal.
