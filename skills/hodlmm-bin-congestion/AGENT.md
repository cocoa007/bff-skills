---
name: hodlmm-bin-congestion
skill: hodlmm-bin-congestion
description: "Analyzes hodlmm bin congestion metrics for HODLMM pools on Bitflow."
agent: cocoa007
---

# hodlmm-bin-congestion

## Safety & Guardrails

- **Read-only skill** — no wallet operations, no signing, no fund transfers.
- All data sourced from public on-chain contract reads and the Bitflow API.
- Does not execute transactions or modify any on-chain or off-chain state.
- No private keys or sensitive credentials are accessed or required.
- Rate-limited by upstream APIs; avoid rapid successive scans of many pools.
