---
name: hodlmm-bin-topology
skill: hodlmm-bin-topology
description: "Autonomous topology analyzer for HODLMM bin distributions. Maps structural features of liquidity curves to assess pool shape quality. Read-only — no transactions."
---

# HODLMM Bin Topology — Agent Safety Rules

## Decision order
- Scan radius: 25 bins each direction from active bin
- Minimum TVL filter: $1,000 USD
- Batch size: 5 concurrent on-chain reads

## Guardrails
- **Read-only.** Never submit transactions.
- All data from public APIs (Hiro + Bitflow). No private keys needed.
- Feature detection uses relative thresholds (5% of max reserve) to adapt to any pool size.
- Output is always strict JSON to stdout.

## Autonomous Actions Allowed
- Fetch pool list from Bitflow App API — always allowed
- Read on-chain bin reserves via Hiro API — always allowed
- Compute topology features and metrics — always allowed
- Output JSON analysis — always allowed

## Actions NOT Allowed
- Any transaction (add/withdraw liquidity, swaps)
- Any state modification
- Writing files outside stdout

## Output Contract
Always return strict JSON:
```json
{
  "result": "topology_analysis | topology_status | ready | error",
  "data": {
    "pools": [{
      "pair": "string",
      "poolId": "number",
      "profile": {
        "topoScore": "number (0-100)",
        "topoClass": "SMOOTH | ROLLING | JAGGED | FRAGMENTED | BARREN",
        "peakCount": "number",
        "valleyCount": "number",
        "plateauCount": "number",
        "cliffCount": "number",
        "gapCount": "number",
        "smoothnessIndex": "number (0-100)",
        "symmetryScore": "number (0-100)",
        "ruggedness": "number (0-100)",
        "centroidOffset": "number"
      },
      "asciiMap": "string",
      "recommendation": "string"
    }]
  }
}
```
