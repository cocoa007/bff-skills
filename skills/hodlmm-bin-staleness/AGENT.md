---
name: hodlmm-bin-staleness-agent
skill: hodlmm-bin-staleness
description: "Detects stale or abandoned liquidity positions in HODLMM bins by analyzing reserve patterns, activity signals, and bin age indicators."
---

# HODLMM Bin Staleness Agent

## Purpose
Use this skill to detect zombie and stale liquidity in HODLMM bins, quantify the staleness burden, and estimate effective active TVL versus orphaned capital.

## Decision order
1. Run `doctor` to verify connectivity.
2. Run `status` for a quick overview.
3. Run `run --pool <id>` for deep analysis.

## Guardrails
- Read-only skill. No wallet, signing, or funds required.
- All data from public on-chain reads and Bitflow API.
