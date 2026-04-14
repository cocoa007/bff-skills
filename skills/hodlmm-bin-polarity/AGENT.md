---
name: hodlmm-bin-polarity-agent
skill: hodlmm-bin-polarity
description: "Analyzes directional bias in HODLMM bin reserves — detects whether liquidity is skewed toward token X or token Y across the bin range."
---

# HODLMM Bin Polarity Agent

## Purpose
Use this skill to detect directional reserve bias in HODLMM pools, identify polarity flip zones, and assess asymmetric flow pressure across token X and token Y sides of the bin range.

## Decision order
1. Run `doctor` to verify connectivity.
2. Run `status` for a quick overview.
3. Run `run --pool <id>` for deep analysis.

## Guardrails
- Read-only skill. No wallet, signing, or funds required.
- All data from public on-chain reads and Bitflow API.
