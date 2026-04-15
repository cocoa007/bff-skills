---
name: hodlmm-bin-turbulence-agent
skill: hodlmm-bin-turbulence
description: "Agent behavior for HODLMM bin turbulence analysis — interprets Reynolds number, turbulence intensity, eddy structure, intermittency, spectral slope, anisotropy, and stability classes to assess liquidity distribution chaos and guide LP/trading decisions."
---

# Agent Behavior — HODLMM Bin Turbulence

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `flowRegime`, `stabilityClass`, `turbulenceIntensity`, and `intermittency`.

## Interpreting output

- **flowRegime = LAMINAR:** Smooth, predictable reserve distribution. Adjacent bins have logically connected reserves with gentle gradients. Execution quality is consistent regardless of where in the range a trade lands. LP positions accrue fees predictably. Ideal for passive strategies and large orders requiring reliable depth. The pool self-organizes into a clean distribution.
- **flowRegime = TRANSITIONAL:** Partially organized with intermittent turbulent bursts. Most of the range follows a smooth reserve trend, but some regions have unexpected concentrations or voids — localized eddies disrupting an otherwise orderly flow. Small trades execute well everywhere; larger trades may encounter pockets of unexpected depth change. LP agents should check which bins fall in turbulent vs laminar zones.
- **flowRegime = TURBULENT:** Chaotic reserve distribution with significant deviations from any smooth trend. Bin-to-bin reserve changes are large and not predictable from neighboring bins. Execution quality varies unpredictably depending on exactly which bins a trade crosses. Multiple eddies create a complex landscape of depth variations. Requires careful position analysis; avoid market orders spanning many bins.
- **flowRegime = CHAOTIC:** Fully disordered reserves with no discernible spatial pattern. Reserve levels appear random from bin to bin. Execution quality is essentially unpredictable for any trade. The pool has no organized structure — every bin is independent. Only suitable for small, localized trades within a single bin or very few bins.
- **stabilityClass = F_VERY_STABLE / E_STABLE:** Pool structure is firmly established and resistant to disruption. Reserve distributions are smooth and self-correcting. Trading activity reinforces rather than disrupts the existing pattern. Excellent for predictable execution and passive LP.
- **stabilityClass = D_NEUTRAL:** Balanced state — the pool neither actively organizes nor actively disrupts its structure. Small perturbations persist but don't amplify. Standard operating conditions for most pools.
- **stabilityClass = C_SLIGHTLY_UNSTABLE / B_UNSTABLE:** The pool amplifies perturbations. Small reserve changes in one bin cascade to neighbors, creating growing turbulent structures. Active management recommended. Monitor for regime transitions.
- **stabilityClass = A_VERY_UNSTABLE:** Strong convective instability. Reserve distributions are actively reorganizing. Large eddies form and dissipate rapidly. Not suitable for passive strategies. Only engage with real-time monitoring.
- **turbulenceIntensity > 0.5:** More than half the mean reserve as fluctuation amplitude. This means bin reserves swing between 50% and 150% of their expected value. Execution quality for any given trade depends heavily on exactly which bin it lands in — a coin flip between good and bad depth.
- **reynoldsNumber > 50:** Trading volume is overwhelming the pool's natural damping. The pool cannot maintain a smooth distribution under current activity levels. Expect continued or increasing turbulence until volume decreases or TVL increases.
- **eddyCount > n/2:** More eddies than half the bins analyzed. The entire range is structured as alternating peaks and troughs. No smooth regions exist. Every trade crosses at least one eddy boundary.
- **intermittency > 70:** Turbulent energy concentrated in rare extreme events. Most bins are relatively calm, but a few have dramatic reserve deviations. The pool appears stable on average but has hidden pockets of extreme depth variation. Check maxEddyBin for the primary turbulence hotspot.
- **anisotropy > 0.3:** Strong directional turbulence bias. One side of the active bin is significantly more turbulent than the other. Trades in the turbulent direction face more execution uncertainty; the laminar side provides more predictable depth. LP agents should concentrate positions on the laminar side for more predictable fee accrual.
- **energySpectralSlope near -5/3 (-1.67):** Classic Kolmogorov turbulence — energy cascades smoothly from large to small scales. The turbulence is "mature" and in statistical equilibrium. Steeper slopes (< -2) indicate strong dissipation — turbulence is dying. Shallower slopes (> -1) indicate energy injection at small scales — turbulence is being actively generated by fine-grained activity.
- **integralScale > n/3:** Large-scale turbulent structures spanning a third of the analyzed range. These are not localized perturbations but broad disruption patterns affecting execution quality across wide swaths of the range.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on turbulence signals from pools with fewer than 5 populated bins — data is insufficient for meaningful spectral analysis.
- Do not assume CHAOTIC means "bad pool" — it means unpredictable execution. Some LPs specifically seek turbulent pools for higher fee generation from frequent rebalancing activity.
- Do not treat the Reynolds number as an absolute threshold — it is an analog, not the actual fluid dynamics quantity. Use it for relative pool comparison, not absolute classification.
- The spectral slope is estimated from a short series and has wide confidence intervals. Treat it as approximate.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "turbulence analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the most laminar pool with its flow regime, turbulence index, and stability class.
- Flag any CHAOTIC pools as having fully disordered reserve distributions.
- Highlight pools with high intermittency — hidden extreme fluctuation pockets.
- Show anisotropy for pools with directional turbulence bias — execution uncertainty is directionally asymmetric.
- Report eddy counts and integral scales — how many turbulent structures exist and how large they are.
- For LP agents: prefer LAMINAR and STABLE pools for predictable fee accrual. In TURBULENT pools, position on the laminar side (lower anisotropy side) for reduced execution uncertainty.
- For trading agents: prefer LAMINAR pools for consistent execution. In TURBULENT pools, check maxEddyBin to avoid the primary turbulence hotspot. Use the laminar fraction to gauge what percentage of the range offers predictable depth.
