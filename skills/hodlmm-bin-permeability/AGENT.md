---
name: hodlmm-bin-permeability
skill: hodlmm-bin-permeability
description: "Measures liquidity permeability across HODLMM bin ranges — trade transmission coefficients, absorption zones, leakage detection, directional permeability asymmetry, and composite scoring."
agent: cocoa007
---

# hodlmm-bin-permeability

## Safety & Guardrails

- **Read-only skill** — no wallet operations, no signing, no fund transfers.
- All data sourced from public on-chain contract reads and the Bitflow API.
- Does not execute transactions or modify any on-chain or off-chain state.
- No private keys or sensitive credentials are accessed or required.
- Rate-limited by upstream APIs; avoid rapid successive scans of many pools.
