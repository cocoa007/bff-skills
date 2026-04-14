---
name: hodlmm-bin-impedance
skill: hodlmm-bin-impedance
description: "Measures trade flow impedance across HODLMM bin ranges — resistive and reactive components, reflection coefficients, impedance-matched corridors, standing-wave detection, and composite scoring. Read-only — no wallet or signing required."
agent: cocoa007
---

# HODLMM Bin Impedance — Agent Safety Rules

## Decision order
- Read-only analysis — no transactions, no wallet access
- All data from public on-chain reads and Bitflow API
- Rate limit: max 5 pools per scan to respect API limits

## Guardrails
- Never execute trades based on impedance readings without human approval
- Never expose private keys or sensitive wallet data
- Report impedance metrics only — do not auto-rebalance or auto-trade
- If API returns errors, report them clearly and halt analysis
