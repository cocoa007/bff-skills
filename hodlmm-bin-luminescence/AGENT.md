---
name: hodlmm-bin-luminescence-agent
skill: hodlmm-bin-luminescence
description: "Agent behavior for HODLMM bin luminescence analysis — interprets fee-emission radiance, quantum yield, spectral classifications, and emission patterns to identify productive versus idle capital and guide LP positioning for maximum fee capture."
---

# Agent Behavior — HODLMM Bin Luminescence

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `stellarClass`, `emissionVerdict`, `emissionGini`, and `emissionDecayRate`.

## Interpreting output

- **stellarClass = SUPERNOVA:** Exceptional fee emission — high quantum yield, broad coverage, and extreme temperatures. The pool radiates fees intensely across its bin range. LP positions anywhere in the populated range capture meaningful fees. Prime target for capital deployment.
- **stellarClass = MAIN_SEQUENCE:** Stable steady fee emission with balanced yield and coverage. The healthy default state. LP agents can position with confidence that fee generation is predictable and sustainable.
- **stellarClass = RED_GIANT:** Moderate total emission but bloated. The pool has more reserves than its fee generation justifies. Capital efficiency is low — each dollar of TVL earns fewer fees than it should. LP agents should check whether the pool's volume warrants their capital allocation.
- **stellarClass = WHITE_DWARF:** Low total flux but compact. Some bins are efficient emitters — the pool has pockets of high-intensity fee generation amid overall darkness. LP agents should target the bright bins specifically rather than deploying across the range.
- **stellarClass = BLACK_HOLE:** Near-zero emission despite reserves. The pool absorbs capital but radiates negligible fees. LP agents should not deploy capital here without strong conviction that volume will increase.
- **emissionVerdict = RADIANT:** High quantum yield with high efficacy. The pool converts capital to fees efficiently. Both total output and per-unit output are strong.
- **emissionVerdict = DARK:** Negligible emission. The pool is not generating meaningful fees. Capital deployed here is idle.
- **emissionGini > 0.7:** Fee generation is highly concentrated in a few bins. LP agents must position precisely in the bright bins to capture fees. Wide-range positions will mostly sit in dark bins earning nothing.
- **emissionGini < 0.3:** Fee generation is well-distributed across bins. Wide-range positions capture proportional fees. Less precision required in positioning.
- **emissionDecayRate > 0.8:** Fee generation drops off rapidly from the active bin. Only bins very close to the current price generate meaningful fees. Tight concentrated positions are essential — anything beyond a few bins is dark capital.
- **emissionDecayRate < 0.3:** Fee generation persists across a wide range. Distant bins still glow with meaningful emission. Wider positions are viable without significant fee dilution.
- **spectrumSkew > 0.3:** Fee emission is brighter on the higher-price side. The pool absorbs more buying pressure. LP agents should bias positions toward higher bins for fee capture.
- **spectrumSkew < -0.3:** Fee emission is brighter on the lower-price side. The pool absorbs more selling pressure. Bias positions toward lower bins.
- **avgQuantumYield > 0.5:** The pool is achieving over half its theoretical maximum fee generation. Capital is well-positioned relative to trade flow.
- **avgQuantumYield < 0.1:** The pool achieves less than 10% of its theoretical maximum. Most reserves are in the wrong bins — repositioning could dramatically increase yield.
- **darkBinCount > 50%:** More than half of populated bins are dark. The pool has significant idle capital. LP agents should identify the bright zone and concentrate there.
- **supernovaCount > 0:** Outlier bins with 10x average intensity. These are fee hotspots — often the active bin or bins immediately adjacent. LP agents should check whether these bins have room for additional deposits.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on luminescence signals from pools with fewer than 5 populated bins — insufficient data for meaningful emission analysis.
- Do not assume SUPERNOVA means "deposit here." High current emission may reflect a temporary volume spike rather than sustainable fee generation. Check whether volume is trending up or is an anomaly.
- Do not assume BLACK_HOLE means "avoid forever." Pools can transition from dark to luminous when new trading activity begins. The classification reflects current state, not permanent character.
- Quantum yield is estimated from heuristic volume distribution, not actual per-bin fee data. Use it for relative comparison between pools, not as an absolute efficiency metric.
- Emission decay rate depends on which bins are populated, not just fee distribution. A pool with only near-active bins populated will show low decay rate by construction.
- Blackbody temperature is a normalized comparison metric, not a physical measurement. Do not interpret temperature values literally.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "luminescence analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest luminescence index as having the best fee emission efficiency.
- Flag BLACK_HOLE/WHITE_DWARF pools as having weak or concentrated emission.
- Highlight bins with peak intensity as fee hotspots — these are where LP capital is most productive.
- Show emission half-width as the practical fee-generating range: bins within this width of peak earn meaningful fees, bins outside are dark.
- For LP agents: target bins within the emission half-width near peak intensity. Check emission decay rate — if fast, concentrate tightly; if slow, spread wider.
- For trading agents: pools with SUPERNOVA or MAIN_SEQUENCE stellar class have efficient fee conversion, meaning they process trades smoothly with consistent fee extraction.
- Compare emission Gini across pools to find the most democratically distributed fee generation for broad-range LP strategies.
