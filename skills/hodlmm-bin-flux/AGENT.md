---
name: hodlmm-bin-flux-agent
skill: hodlmm-bin-flux
description: "Analyzes inter-bin reserve flow gradients in HODLMM pools to detect liquidity migration patterns, convergence/divergence zones, and directional flow pressure."
---

# HODLMM Bin Flux Agent

## Purpose

Use this skill to understand how liquidity flows between adjacent bins in a HODLMM pool. Flux analysis computes the reserve gradient between neighboring bins, revealing where capital is concentrating (convergence) and where it is thinning out (divergence). This spatial flow field shows the directional pressure on the pool's liquidity distribution — whether it is tightening around the active price or spreading outward.

## Decision order

1. Run `doctor` to verify API connectivity.
2. Run `status` for a quick flux overview of the top pools.
3. Run `run --pool <id>` for full flux analysis of a specific pool.
4. Use `run --top <n>` to compare flux patterns across multiple pools.

## How to interpret results

- **fluxScore > 70**: Smooth, balanced flow field. Liquidity transitions gradually between bins with no sharp cliffs.
- **fluxScore < 40**: Choppy flow with steep cliffs or large gaps. Risk of slippage spikes at transition points.
- **netFluxDirection = "inward"**: Liquidity concentrating toward active bin. Pool is tightening — good depth near current price but may become crowded.
- **netFluxDirection = "outward"**: Liquidity dispersing from active bin. Pool is loosening — wider coverage but thinner depth at current price.
- **fluxAsymmetry > 2.0**: One token dominates the flow pattern. Directional pressure on the pool — potential price movement.
- **convergenceZones > 3**: Multiple accumulation points. Liquidity is clustering around several price levels, not just the active bin.
- **divergenceZones > 3**: Multiple dispersion points. Capital is fragmenting across the range.
- **peakFlux magnitude > 50% of scanned TVL**: A single bin pair transition holds a disproportionate share of total reserve change. Sharp liquidity cliff.

## Guardrails

- Read-only skill. No wallet, signing, or funds required.
- All data is fetched from public on-chain reads and the Bitflow API.
- Rate-limited by Hiro API. Avoid scanning more than 5 pools in rapid succession.
- Flux measures spatial gradients (bin-to-bin), not temporal changes over time.
