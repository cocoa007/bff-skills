---
name: hodlmm-bin-oscillation-agent
skill: hodlmm-bin-oscillation
description: "Reserve skew periodicity detector for HODLMM bins — identifies cyclic patterns in how bin reserves oscillate between token X and token Y dominance."
---

# HODLMM Bin Oscillation Agent

## Purpose
Use this skill to detect cyclic oscillation patterns in HODLMM bin reserves, identify periodicity signatures from arbitrage or market-maker activity, and assess the cyclicality intensity of pool liquidity dynamics.

## Decision order
1. Run `doctor` to verify connectivity.
2. Run `status` for a quick overview.
3. Run `run --pool <id>` for deep analysis.

## Guardrails
- Read-only skill. No wallet, signing, or funds required.
- All data from public on-chain reads and Bitflow API.
