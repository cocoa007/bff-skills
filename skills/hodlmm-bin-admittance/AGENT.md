---
name: hodlmm-bin-admittance-agent
skill: hodlmm-bin-admittance
description: "Autonomous trade flow admittance monitor for Bitflow HODLMM pools. Identifies high-throughput corridors and susceptance traps by decomposing bin admittance into conductance and susceptance. Read-only — no funds moved, no transactions submitted."
---

# Agent Behavior — HODLMM Bin Admittance

## Decision order

1. Run `doctor` first. If any check fails, surface the connectivity issue and stop.
2. Run `status` for a quick cross-pool triage. Identify pools with highest admittance index.
3. For pools of interest, run `run --pool <id>` for full decomposition. Examine corridors and traps.
4. Use high-throughput corridors to recommend optimal execution ranges.
5. Flag susceptance traps so the agent or user avoids placing directional trades in absorptive zones.
6. Combine with `hodlmm-bin-impedance` for a complete flow picture: impedance shows resistance, admittance shows ease.

## Guardrails

- **Never act on admittance data alone.** Admittance measures flow ease, not profitability. Combine with fee, volume, and APR data before recommending entry.
- **Never recommend large trades through restricted or blocked pools.** Even if a corridor exists, the overall pool may not support the trade size.
- **Never compare raw admittance values across pools.** Values are normalized within each pool's reserve range. Use admittance index for cross-pool comparison.
- **Never spend funds autonomously.** This skill is advisory only. All execution requires explicit human confirmation.
- **Use `--top 1` for quick checks** to avoid excessive on-chain reads during rate-limited periods.

## Signal interpretation

| Admittance Class | Action |
|---|---|
| superconductive | TRADE FREELY — deep balanced reserves, minimal friction |
| high-throughput | TRADE CONFIDENTLY — good flow, check corridors for optimal ranges |
| moderate-throughput | TRADE CAUTIOUSLY — route through corridors, avoid traps |
| restricted | SMALL TRADES ONLY — thin reserves, significant friction |
| blocked | AVOID — near-zero flow, extreme slippage |

## Phase angle interpretation

| Phase Angle | Meaning | Action |
|---|---|---|
| 0-15 deg | Purely conductive | Trades flow based on depth — predictable |
| 15-45 deg | Mixed | Some directional bias — check susceptance sign |
| 45-90 deg | Mostly reactive | Directional trades get absorbed — route around |

## Susceptance trap handling

When a susceptance trap is detected:
1. Note the bias direction (buy or sell)
2. If your intended trade matches the bias direction, the trap will absorb part of your trade — expect worse execution
3. If your intended trade opposes the bias direction, the trap actually helps — skewed reserves in your favor
4. Route around traps when possible by using adjacent corridor bins

## Integration chain

```
hodlmm-bin-admittance status  → triage: which pools have best flow?
hodlmm-bin-admittance run     → detail: corridors, traps, phase angles
hodlmm-bin-impedance run      → complement: where is resistance highest?
hodlmm-advisor entry-plan     → plan: bins, strategy, capital split
bitflow add-liquidity-simple  → execute (human approval required)
```

## On error

- Log the full `{ "error": "..." }` payload
- Do not retry silently — surface the error with the endpoint that failed
- If `doctor` reports API failure, pause analysis and alert user
- If a single pool fails during `run`, the result includes the error inline — proceed with other pools
