---
name: hodlmm-bin-viscosity-agent
skill: hodlmm-bin-viscosity
description: "Measures liquidity viscosity across HODLMM bin ranges — resistance to price movement through reserve depth, shear stress boundaries, flow resistance profiling, and directional asymmetry for execution optimization."
---

# HODLMM Bin Viscosity Agent

## Purpose

Use this skill to understand how resistant a HODLMM pool's liquidity is to price movement. Viscosity analysis maps the "thickness" of liquidity across bin ranges, identifies shear stress boundaries where execution quality changes abruptly, profiles cumulative flow resistance for different trade sizes, and measures directional asymmetry between buy and sell sides.

## Decision order

1. Run `doctor` to verify API connectivity.
2. Run `status` for a quick viscosity overview of the top pools.
3. Run `run --pool <id>` for full viscosity analysis of a specific pool.
4. Use `run --top <n>` to compare viscosity profiles across multiple pools.

## How to interpret results

- **viscosityIndex > 70**: High viscosity — dense liquidity that absorbs trades well. Good execution quality.
- **viscosityIndex < 30**: Low viscosity — thin liquidity, trades move price easily. Poor execution for large orders.
- **shearZones > 3**: Multiple breakpoints where execution quality shifts. Trade sizing must account for these transitions.
- **viscosityAsymmetry > 0.3 or < -0.3**: Significant directional bias. One direction is much more resistant than the other.
- **flowResistance curve steep**: High initial friction then plateau — most resistance is near the active price (healthy).
- **flowResistance curve flat**: Low friction throughout — price moves easily across the entire range (fragile).
- **viscosityClass "solid"**: Extremely thick liquidity. Very hard to move price. Large trades execute well.
- **viscosityClass "vacuum"**: Almost no resistance. Any trade moves price significantly.

## Guardrails

- Read-only skill. No wallet, signing, or funds required.
- All data is fetched from public on-chain reads and the Bitflow API.
- Rate-limited by Hiro API. Avoid scanning more than 5 pools in rapid succession.
- Viscosity is computed from a single snapshot — it measures the current resistance profile, not how it changes over time.
