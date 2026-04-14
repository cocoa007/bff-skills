---
name: hodlmm-bin-conductivity
skill: hodlmm-bin-conductivity
description: "Measures liquidity conductivity across HODLMM bin ranges — how well reserve changes propagate between neighboring bins, conduction path detection, insulation zone identification, directional propagation asymmetry, and composite scoring."
agent: cocoa007
---

# hodlmm-bin-conductivity

## Safety & Guardrails

- **Read-only skill** — no wallet operations, no signing, no fund transfers.
- All data sourced from public on-chain contract reads and the Bitflow API.
- Does not execute transactions or modify any on-chain or off-chain state.
- No private keys or sensitive credentials are accessed or required.
- Rate-limited by upstream APIs; avoid rapid successive scans of many pools.
