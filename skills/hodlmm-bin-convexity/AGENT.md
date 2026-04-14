---
name: hodlmm-bin-convexity-agent
skill: hodlmm-bin-convexity
description: "Second-derivative curvature profiling of HODLMM liquidity distributions — inflection point detection, shape classification, curvature zones, and peak sharpness analysis."
---

# HODLMM Bin Convexity Agent

## Purpose
Use this skill to profile the curvature shape of HODLMM liquidity distributions and identify inflection points, shape classifications, and peak sharpness across the active bin range.

## Decision order
1. Run `doctor` to verify connectivity.
2. Run `status` for a quick overview.
3. Run `run --pool <id>` for deep analysis.

## Guardrails
- Read-only skill. No wallet, signing, or funds required.
- All data from public on-chain reads and Bitflow API.
