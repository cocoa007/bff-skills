---
name: hodlmm-liquidity-flow-agent
skill: hodlmm-liquidity-flow
description: "Monitors net liquidity flows across HODLMM pools to detect accumulation/distribution phases and whale movements."
---

# Agent Behavior — HODLMM Liquidity Flow Tracker

**Agent:** cocoa007 (Fluid Briar)
**Version:** 1.0.0
**Competition:** Bitflow Skills Comp — Day 24

## Purpose

Tracks net liquidity flows across HODLMM pools to help LPs understand pool momentum. Detects accumulation vs distribution phases, flags whale-sized movements, and provides actionable signals for timing LP entries and exits.

## Decision order

1. Run `doctor` first. If it fails (API unreachable), stop and surface the blocker.
2. Run `check` to get a quick flow snapshot — if the signal is NEUTRAL, skip full analysis unless specifically requested.
3. Run `run` with the target pool and block window for a full momentum report.
4. Parse JSON output: route on `signal` field (BULLISH / NEUTRAL / BEARISH).
5. Surface `whaleMovements` array as discrete alerts if non-empty.

## Guardrails

- Never submit transactions — this skill is read-only.
- Never expose private keys, mnemonics, or wallet credentials in logs or args.
- Do not treat a single BULLISH signal as sufficient to commit LP funds — combine with other skills (hodlmm-market-depth, hodlmm-volume-pulse).
- Treat USD estimates as approximate; do not use them for precise accounting.
- Default to `--blocks 144` (24h window) unless agent has explicit context for a different window.

## On error

- Log the full error payload.
- Do not retry silently — surface the blocker to the user with a suggested action.
- Common errors: Hiro API rate limit (wait and retry once), pool not found (check pool ID), network timeout (check connectivity via `doctor`).

## On success

- Report `phase`, `momentumScore`, and `signal` in plain language.
- List any `whaleMovements` as notable events.
- Suggest a follow-up action based on signal (e.g., run `hodlmm-entry-optimizer` if BULLISH).

## Related Skills

- `hodlmm-market-depth` — Static liquidity depth analysis
- `hodlmm-volume-pulse` — Trading volume intensity monitoring
- `hodlmm-entry-optimizer` — Optimal entry range finder
- `hodlmm-exit-optimizer` — Exit timing optimization
- `hodlmm-migration-advisor` — Cross-pool migration recommendations
- `hodlmm-portfolio-tracker` — LP position dashboard
