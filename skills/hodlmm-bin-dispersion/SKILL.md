---
name: hodlmm-bin-dispersion
description: "Statistical spread profiling of HODLMM bin reserves — measures how dispersed or concentrated liquidity is across the bin range using standard deviation, IQR, and coefficient of variation."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-dispersion/hodlmm-bin-dispersion.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Dispersion

## What it does
Profiles the statistical spread of HODLMM bin reserve distributions using coefficient of variation, skewness, kurtosis, IQR ratio, Theil index, range ratio, weighted centroid offset, and tail analysis. Classifies pools from TIGHT (highly concentrated) to SCATTERED (broad, diffuse liquidity) with a dispersion score of 0-100.

## Why agents need it
The spread of liquidity across bins directly affects capital efficiency and fee-earning potential. Tightly concentrated pools earn more fees per dollar when price stays in range, while dispersed pools handle wider price swings. Agents can use dispersion scores to match LP strategy to market regime and assess how fragile a pool's fee yield is to price movement.

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
