---
name: hodlmm-bin-capacitance-agent
skill: hodlmm-bin-capacitance
description: "Agent behavior for HODLMM bin capacitance analysis — interprets charge level, dielectric strength, impedance, RC time constant, polarization, quality factor, and circuit classes to assess liquidity absorption capacity and guide LP/trading decisions."
---

# Agent Behavior — HODLMM Bin Capacitance

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `saturationState`, `circuitClass`, `chargeLevel`, and `qualityFactor`.

## Interpreting output

- **saturationState = DEPLETED:** Almost no reserves relative to capacity. Every bin is nearly empty. Even small deposits have outsized impact on pool depth. Extremely thin liquidity — trades of any size will move the price significantly. LP opportunity: high fee share per dollar deposited, but high IL risk from price sensitivity.
- **saturationState = UNDERCHARGED:** Significant unused capacity. Reserves are present but light. Good LP entry point — the pool can absorb substantially more liquidity and each deposit meaningfully improves depth. Trade execution is adequate for small sizes but may degrade for larger orders.
- **saturationState = BALANCED:** Healthy operating point. Reserves are at a comfortable middle ground with room to absorb more or handle withdrawals without stress. Optimal for trading with adequate depth. LPs face standard competition for fee share without overcrowding.
- **saturationState = WELL_CHARGED:** Substantially filled with strong reserves. Limited but adequate room for additional deposits. Execution depth is good for most trade sizes. LP competition is moderate — new deposits add marginal depth improvement.
- **saturationState = SATURATED:** Near maximum capacity. Most bins are heavily loaded. New LP deposits have diminishing returns — the pool already has deep liquidity and additional deposits barely improve execution. Fee share is highly competitive. Best for trading (deep execution), less attractive for new LP entry.
- **circuitClass = SUPERCAPACITOR:** Exceptional absorption capacity with high structural health. Even distribution, low losses, strong dielectric. Can handle large liquidity inflows and outflows without structural degradation.
- **circuitClass = HIGH_CAPACITY:** Strong absorption capacity. Well-distributed reserves with moderate losses. Handles most scenarios well.
- **circuitClass = STANDARD:** Average absorption capacity. Typical pool with room for improvement in distribution or efficiency.
- **circuitClass = LOW_CAPACITY:** Limited absorption capacity. Concentrated reserves, high losses, or weak dielectric. Vulnerable to stress from large trades or sudden LP withdrawals.
- **circuitClass = DEPLETED_CELL:** Minimal functional capacity. The pool's capacitive structure is severely degraded — extreme concentration, high losses, or near-empty reserves. Use with extreme caution.
- **dielectricStrength > 0.7:** Highly uniform reserve distribution. Consistent depth at every price point. Large trades encounter predictable, even resistance throughout the range. Ideal for institutional-size orders.
- **dielectricStrength < 0.3:** Extremely uneven reserves. Thin spots exist where trades can punch through with minimal resistance, causing severe slippage. Check maxCapacitanceBin for where reserves concentrate and minCapacitanceBin for the weak point.
- **rcTimeConstant > 50:** Slow charge/discharge. Liquidity imbalances persist for extended periods after large trades or LP changes. The pool takes time to find equilibrium. Not suitable for strategies that depend on rapid self-correction.
- **rcTimeConstant < 5:** Rapid equilibration. The pool quickly redistributes after perturbation. Suitable for strategies that exploit temporary imbalances — they close quickly, so timing is critical.
- **polarization > 0.3:** Strong sell-side bias — significantly more reserves above the active bin. Buys execute better than sells. Sell pressure would encounter deeper liquidity; buy pressure would deplete reserves faster.
- **polarization < -0.3:** Strong buy-side bias — more reserves below the active bin. Sells execute better. The pool provides a deeper cushion for downward price movement.
- **qualityFactor > 5:** Low-loss pool. Efficiently stores and releases liquidity. Ideal for passive LP strategies with predictable, steady returns.
- **qualityFactor < 1:** High-loss pool. Energy dissipates rapidly through hysteresis, leakage, and structural inefficiency. Only suitable for short-term positions or active management strategies.
- **seriesCapacitance << parallelCapacitance:** Severe bottleneck exists. One or more bins have extremely low capacitance, creating a choke point. Trades passing through that bin range will encounter disproportionate resistance.
- **breakdownRisk > 70:** High probability of structural failure under stress. Reserves are extremely concentrated — a large trade in the thin region could effectively drain the pool. Monitor closely.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on capacitance signals from pools with fewer than 5 populated bins — data is insufficient for meaningful analysis.
- Do not assume SATURATED means "bad for trading" — saturated pools have the deepest execution. It means new LP deposits have diminishing returns.
- Do not assume DEPLETED means "bad pool" — it may be a new or recovering pool. DEPLETED means high impact per deposit, not necessarily high risk.
- Series capacitance is dominated by the weakest bin. A single outlier can make the series metric appear worse than the pool's overall health warrants. Cross-reference with parallel capacitance and entropy.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "capacitance analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest capacitance index as the best absorption candidate.
- Flag any DEPLETED pools as LP opportunities with high fee-share-per-dollar.
- Flag any SATURATED pools as best for trading execution but poor for new LP entry.
- Highlight pools with low dielectric strength — structural weak points exist.
- Show polarization for pools with directional bias — execution quality differs by direction.
- Report quality factor for LP decision-making — high-Q pools are better for passive strategies.
- For LP agents: prefer UNDERCHARGED or BALANCED pools with high dielectric strength and quality factor. Avoid SATURATED pools unless fee rates justify the competition.
- For trading agents: prefer WELL_CHARGED or SATURATED pools for deep execution. Check polarization to choose favorable trade direction. Avoid DEPLETED pools for large orders.
