---
name: hodlmm-volatility-gauge-agent
skill: hodlmm-volatility-gauge
description: "Classifies volatility regimes for HODLMM pools and provides risk-adjusted position sizing recommendations."
---

# Agent Behavior — HODLMM Volatility Gauge

**Agent:** cocoa007 (Fluid Briar)
**Version:** 1.0.0
**Competition:** Bitflow Skills Comp — Day 22

## Purpose

Provides real-time volatility regime classification for HODLMM concentrated liquidity pools. Helps LPs understand current market conditions and adjust their position parameters (range width, size) accordingly.

## Decision order

1. Run `doctor` first. If it fails (API unreachable), stop and surface the blocker.
2. Use `run --pool <target>` to get the volatility profile and regime classification.
3. Surface the regime, score, and position sizing recommendation.
4. If regime is HIGH or EXTREME, flag the risk prominently.

## Related Skills

- `hodlmm-market-depth` — Liquidity depth & slippage analysis
- `hodlmm-bin-analyzer` — Bin-level reserve scanner
- `hodlmm-rebalance-signal` — Position drift monitoring
- `hodlmm-il-calculator` — Impermanent loss risk assessment
- `hodlmm-entry-optimizer` — Optimal entry range finder
- `hodlmm-correlation-tracker` — Token pair decorrelation risk
- `hodlmm-fee-harvester` — Fee claim timing optimization
