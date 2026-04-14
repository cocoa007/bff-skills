---
name: hodlmm-bin-dispersion-agent
skill: hodlmm-bin-dispersion
description: "Statistical spread profiling of HODLMM bin reserves — measures how dispersed or concentrated liquidity is across the bin range using standard deviation, IQR, and coefficient of variation."
---

# HODLMM Bin Dispersion Agent

## Purpose
Use this skill to quantify how concentrated or dispersed liquidity is across HODLMM bins, classify pool spread profiles, and assess capital efficiency implications for LP positions.

## Decision order
1. Run `doctor` to verify connectivity.
2. Run `status` for a quick overview.
3. Run `run --pool <id>` for deep analysis.

## Guardrails
- Read-only skill. No wallet, signing, or funds required.
- All data from public on-chain reads and Bitflow API.
