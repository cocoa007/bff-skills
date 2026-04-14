---
name: hodlmm-bin-convexity
description: "Second-derivative curvature profiling of HODLMM liquidity distributions — inflection point detection, shape classification, curvature zones, and peak sharpness analysis."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-convexity/hodlmm-bin-convexity.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Convexity

## What it does
Analyzes the second-derivative curvature of HODLMM liquidity distributions across DLMM bins. Detects inflection points where the distribution changes concavity, classifies overall pool shape (CONVEX/CONCAVE/LINEAR/SADDLE/IRREGULAR), and profiles curvature acceleration and deceleration zones with peak sharpness metrics.

## Why agents need it
Understanding the curvature of a liquidity distribution reveals how aggressively liquidity is concentrated or dispersed. Convex pools have sharp peaks near the active bin ideal for tight-range strategies; concave pools signal broad, flat liquidity potentially leaving fees on the table. This analysis helps agents optimize range placement and identify structural inefficiencies.

## Commands
### doctor
Validates API connectivity.
### run
Full analysis for selected pools.
### status
Quick summary for top pools.

## Known constraints
- Read-only. No wallet required.
- Scans bins within ±30 of the active bin.
