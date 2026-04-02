---
name: hodlmm-exit-optimizer
skill: hodlmm-exit-optimizer
description: "Optimal exit timing analyzer for Bitflow HODLMM concentrated LP positions. Combines drift analysis, fee exhaustion detection, IL breakeven math, and urgency scoring (0-10) to recommend HOLD, MONITOR, or EXIT. Read-only — no transactions, no wallet required."
---

# HODLMM Exit Optimizer — Agent Safety Rules

## Decision order
- Compute drift from position center to active bin
- Check fee generation status (generating / declining / exhausted)
- Calculate concentrated IL and compare against projected fee income
- Produce composite urgency score: 0-10 (weights: drift 35%, IL 35%, fees 30%)
- Signal: HOLD (0-2.9), MONITOR (3-5.9), EXIT (6-10)

## Guardrails
This skill is **read-only** and does NOT execute any transactions. The following rules apply to how agents should interpret and act on its output:

1. **EXIT signal does NOT mean auto-sell** — it means the position should be reviewed for closure. Actual withdrawal requires explicit human approval or a separate skill with spending permissions.
2. **MONITOR signal** — re-run periodically (every 1-4 hours) to track whether conditions improve or worsen.
3. **HOLD signal** — position is healthy. No action needed. Re-check on normal schedule.
4. **Never act on a single snapshot** — run at least 2-3 checks over different blocks before deciding to exit.
5. **Cross-reference with other skills** — use `hodlmm-bin-guardian` for live range status and `hodlmm-il-calculator` for detailed IL math before executing any exit.

## Autonomous Actions Allowed
- Fetch public API data (Bitflow App, Bitflow Quotes, Bitflow Bins) — always allowed
- Compute and output JSON analysis — always allowed
- Log or store results for trend tracking — always allowed

## Actions Requiring Human Approval
- Withdrawing liquidity from any HODLMM position
- Adding liquidity to any HODLMM position
- Any transaction spending STX, sBTC, or other tokens
- Acting on an EXIT signal without cross-referencing other skills

## Output Contract
Always return strict JSON:
```json
{
  "status": "success | error",
  "action": "HOLD | MONITOR | EXIT — exit urgency <score>/10",
  "data": {
    "exit_score": {
      "score": "number (0-10)",
      "signal": "HOLD | MONITOR | EXIT",
      "components": {
        "drift_penalty": "number",
        "fee_exhaustion_penalty": "number",
        "il_penalty": "number",
        "range_utilization_bonus": "number"
      },
      "reasoning": "string"
    },
    "drift": {
      "drift_bins": "number",
      "drift_pct": "number",
      "drift_direction": "above | below | centered",
      "in_range": "boolean",
      "range_utilization_pct": "number",
      "bins_earning_fees": "number",
      "total_position_bins": "number"
    },
    "fee_exhaustion": {
      "daily_fee_yield_pct": "number",
      "projected_30d_fee_pct": "number",
      "volume_to_tvl_ratio": "number",
      "fee_status": "generating | declining | exhausted",
      "fee_rank": "string"
    },
    "il_breakeven": {
      "current_il_pct": "number",
      "il_severity": "negligible | moderate | significant | severe",
      "days_of_fees_to_recover": "number | null",
      "fee_vs_il_ratio": "number",
      "breakeven_status": "fees_ahead | breakeven | il_ahead | deep_loss"
    },
    "reentry_hint": {
      "suggested_range": "{ low, high, count }",
      "range_width_pct": "number",
      "rationale": "string"
    },
    "pool_id": "string",
    "pool_name": "string"
  },
  "disclaimer": "string",
  "error": "null | { code, message, next }"
}
```
