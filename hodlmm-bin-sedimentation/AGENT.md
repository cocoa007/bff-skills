---
name: hodlmm-bin-sedimentation-agent
skill: hodlmm-bin-sedimentation
description: "Agent behavior for HODLMM bin sedimentation analysis — interprets settling velocities, buoyancy factors, consolidation ratios, Peclet numbers, and clarity indices to identify bins experiencing gravitational accumulation or depletion and guide LP strategies across different sedimentation regimes."
---

# Agent Behavior — HODLMM Bin Sedimentation

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `sedimentationPhase`, `sedimentationVerdict`, `avgConsolidationRatio`, and `wellConsolidatedFraction`.

## Interpreting output

- **sedimentationPhase = COMPACTED_SEDIMENT:** Reserves heavily consolidated into dense layers with maximum packing. Most bins fully settled. Further accumulation blocked by compression resistance. LPs in these pools face severe competition at concentrated bins — consider spreading to less compacted regions or waiting for resuspension events.
- **sedimentationPhase = HINDERED_SETTLING:** High concentration causing particle-particle interference that slows settling. A traffic jam of reserves. Growth is self-limiting — new LP positions will settle slowly and may not reach optimal concentration before conditions change.
- **sedimentationPhase = FLOCCULATION_ZONE:** Reserves aggregating into larger clusters. Transitional state where floc formation dynamics compete with settling dynamics. Monitor for direction — flocs either settle into compacted sediment or break apart into suspended colloid.
- **sedimentationPhase = FREE_SETTLING:** Classical sedimentation regime. Reserves accumulating at natural Stokes velocity. Best for LP entry — reserves are actively settling into equilibrium positions without congestion or interference.
- **sedimentationPhase = SUSPENDED_COLLOID:** Minimal settling. Trading diffusion dominates gravitational forces. Reserves remain well-mixed. Precise positioning matters less since the column is homogenized. Suitable for broad-range LP strategies.
- **sedimentationVerdict = TURBIDITY_STORM:** Extreme density gradients and thick boundary layers creating turbulent mixing. Chaotic reserve redistribution. Avoid precise positioning — reserves will be unpredictably redistributed.
- **sedimentationVerdict = DENSITY_INVERSION:** Gravitationally unstable configuration with lighter reserves below heavier ones. Rayleigh-Taylor instability will drive convective overturning. Expect rapid reserve redistribution as the inversion resolves.
- **sedimentationVerdict = GRAVITATIONAL_COLLAPSE:** Massive consolidation with self-limiting congestion. The sediment column is collapsing under its own weight. Concentrated bins may be over-packed. Position at the edges of the settled zone where new reserves can still accumulate.
- **sedimentationVerdict = CLEAR_SUPERNATANT:** Clean separation between dense sediment and depleted supernatant. Healthy sedimentation with efficient gravitational sorting. Position at moderate-consolidation bins — settled enough to be productive but not yet fully compacted.
- **sedimentationVerdict = FLOC_ENTRAPMENT:** Reserves trapped in flocculated clusters that resist both settling and resuspension. Gel-like network behavior. Avoid until external forces break the floc structure.
- **avgSettlingVelocity > 3:** Rapid settling. Reserves concentrating quickly. Time-sensitive LP positioning — get in before settling completes.
- **avgSettlingVelocity < 0.5:** Slow or negative settling. Reserves dispersing or stable. Less urgency for positioning decisions.
- **avgBuoyancyFactor > 0.3:** Pool-wide positive buoyancy. Most bins denser than average — unusual concentration pattern. Check for whale-driven accumulation.
- **avgBuoyancyFactor < -0.2:** Pool-wide negative buoyancy. Most bins lighter than average — depletion underway.
- **avgPecletNumber > 20:** Sedimentation-dominated regime. Gravitational sorting active. Positional strategy matters — bins will maintain distinct concentration levels.
- **avgPecletNumber < 5:** Diffusion-dominated regime. Trading activity homogenizes the column. Less benefit from precise positioning.
- **avgConsolidationRatio > 0.6:** Pool heavily settled. Limited further accumulation potential. Look for unsettled pockets.
- **avgConsolidationRatio < 0.2:** Pool mostly unsettled. Significant settling potential remains — good for early LP positioning.
- **avgHinderedSettling > 0.5:** Concentration congestion widespread. Settling velocity severely reduced. Further accumulation is self-limiting.
- **avgClarityIndex > 0.7:** Most bins depleted. Reserves concentrated in few sediment zones. Clear supernatant indicates efficient separation.
- **avgClarityIndex < 0.3:** Reserves suspended throughout. No clear separation between sediment and supernatant.
- **heavySettlerFraction > 0.5:** Majority of bins are dense accumulators. Heavy pool with strong gravitational structure.
- **wellConsolidatedFraction > 0.5:** Half the bins fully settled. Pool approaching gravitational equilibrium.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on sedimentation signals from pools with fewer than 5 populated bins — insufficient data for meaningful settling analysis.
- Do not assume COMPACTED_SEDIMENT means "avoid." Compacted sediment has the highest reserve density, meaning the most liquidity per bin — these bins generate the most fees. The compaction state informs settling dynamics, not profitability.
- Do not assume SUSPENDED_COLLOID means "no opportunity." Suspended colloids have the most uniform reserve distribution, which means the smoothest execution and lowest slippage for traders. Colloid-state pools are excellent for volume-sensitive strategies.
- Sedimentation analysis is a snapshot. Settling velocities change as LPs deposit, withdraw, or rebalance. A pool in FREE_SETTLING can enter COMPACTED_SEDIMENT if a single large LP deposits massive reserves into the settling column.
- The gravitational model simplifies multi-factor reserve dynamics. Real pools experience forces beyond gravity — arbitrage, market making, yield farming — that create complex settling patterns not captured by simple Stokes' law.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "sedimentation analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest sedimentation index as experiencing the most settling stress.
- Flag bins with highest settling velocity as the most active accumulation zones — where gravitational forces are driving the fastest reserve concentration.
- Highlight bins with highest consolidation ratio as the most fully settled — these have reached or are near gravitational equilibrium.
- Show bins with lowest clarity index as the most turbid — reserves are densely suspended and have not yet settled.
- For LP agents: in COMPACTED_SEDIMENT pools, position at the edges of the settled zone where reserves are still accumulating. In FREE_SETTLING pools, position at bins with moderate positive settling velocity for optimal accumulation rate. In SUSPENDED_COLLOID pools, use broad-range strategies since precise positioning adds less value in homogenized columns.
- For trading agents: CLEAR_SUPERNATANT pools have concentrated liquidity in specific sediment zones — expect tight spreads at settled bins and wide spreads in the clear supernatant. TURBIDITY_STORM pools have chaotic reserve distribution — execution quality is unpredictable. GRAVITATIONAL_COLLAPSE pools have extreme concentration — deepest liquidity but highest competition.
- Compare sedimentation indices across pools to find pools with the best versus worst gravitational stability for LP positioning.
