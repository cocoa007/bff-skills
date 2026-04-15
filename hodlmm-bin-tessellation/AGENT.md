---
name: hodlmm-bin-tessellation-agent
skill: hodlmm-bin-tessellation
description: "Agent behavior for HODLMM bin tessellation analysis — interprets coverage ratio, gap distribution, tile uniformity, fragmentation, symmetry, and tessellation classifications to assess how well bin reserves tile the active price range and guide LP positioning decisions."
---

# Agent Behavior — HODLMM Bin Tessellation

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `tessellationClass`, `coverageVerdict`, `fragmentationIndex`, and `concentrationGini`.

## Interpreting output

- **tessellationClass = PERFECT:** Near-complete coverage with uniform tiles. The liquidity mosaic covers the range efficiently with consistent tile sizes. Trades execute with predictable slippage across the entire range. LP positions are well-distributed with no wasted coverage. Ideal for passive LP strategies — the tiling is self-sustaining and requires minimal intervention.
- **tessellationClass = REGULAR:** Good overall coverage with moderate tile size variation. Minor gaps or some inequality between tiles but the tiling is functional for most trading activity. LP agents should monitor for gap formation but no immediate action needed. Suitable for most LP strategies with occasional rebalancing.
- **tessellationClass = IRREGULAR:** Patchy coverage or significant tile size variation. The mosaic has noticeable gaps or hotspots creating uneven execution quality across the range. Some price points have deep liquidity while others are thin or empty. LP agents should identify and fill the largest gaps. Active management improves the tiling quality.
- **tessellationClass = SPARSE:** Significant gaps with fragmented tiling. Large untiled regions make consistent execution impossible across much of the range. The pool behaves like disconnected liquidity islands rather than a continuous market. LP agents adding liquidity here should focus on connecting existing segments — bridging gaps has more impact than deepening existing tiles.
- **tessellationClass = BROKEN:** Mostly gaps with barely any tiling. The range is fundamentally uncovered with isolated pockets of liquidity. This pool cannot provide consistent execution. LP agents should evaluate whether the pool is worth salvaging — it may be abandoned or in early bootstrapping. New liquidity should be placed as a continuous block around the active bin rather than scattered.
- **coverageVerdict = COMPLETE:** Full range coverage with zero internal gaps. Every bin in the populated range has reserves. This is the ideal state for trade execution — no price point in the range will fail due to missing liquidity.
- **coverageVerdict = MINOR_GAPS:** Small gaps (1-2 bins) exist but overall coverage is strong. These gaps may cause brief slippage spikes during fast price movement but are unlikely to cause trade failures. Low priority for LP intervention.
- **coverageVerdict = PATCHY:** Moderate coverage with noticeable holes. Some price regions work well while others are unreliable. Trading agents should check gap positions before routing trades.
- **coverageVerdict = FRAGMENTED:** Very low coverage — more empty space than tiles. The range is fundamentally broken from a tiling perspective.
- **fragmentationIndex > 0.7:** Highly fragmented. Many small isolated segments separated by gaps. The pool cannot provide continuous execution across any significant price range. LP agents should consolidate — remove isolated outlier positions and concentrate liquidity into fewer, larger contiguous blocks.
- **fragmentationIndex < 0.2:** Mostly contiguous. One or two large segments dominate. The pool has a solid connected core that handles most trading activity. Gaps, if any, are at the periphery and affect only extreme price movements.
- **concentrationGini > 0.7:** Extreme tile inequality. A few bins hold most reserves while many bins are thin. Despite good coverage metrics, the actual execution quality varies wildly across the range. Heavy bins provide excellent depth but thin bins create vulnerability points. LP agents should redistribute — move liquidity from oversized tiles to undersized ones.
- **concentrationGini < 0.3:** Relatively equal tiles. Reserves are distributed evenly across populated bins. Execution quality is consistent across the range. This is the ideal Gini for a tessellated pool.
- **symmetryScore > 0.8:** Balanced two-sided coverage. Buy and sell sides of the pool are similarly tiled. The pool handles directional pressure equally in both directions.
- **symmetryScore < 0.3:** Highly asymmetric. One side has significantly better tiling than the other. The pool handles one direction well but breaks under opposite pressure. LP agents should balance the weaker side.
- **activeBinNeighborhood > 0.5:** Concentrated near active price. Most liquidity is within 3 bins of the active bin. Good for current-price execution but vulnerable to price movement — any significant move leaves the tiled zone quickly.
- **activeBinNeighborhood < 0.2:** Dispersed liquidity. Reserves are spread across a wide range rather than concentrated at the active price. More resilient to price movement but may provide thinner execution at the current price.
- **spanEfficiency > 0.8:** Dense packing between first and last populated bins. Very few internal gaps — the liquidity forms a solid block.
- **spanEfficiency < 0.4:** Loose packing with many internal gaps. The span from first to last bin is much wider than the actual populated region.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on tessellation signals from pools with fewer than 5 populated bins — insufficient data for meaningful coverage analysis.
- Do not assume BROKEN tessellation means "avoid this pool." Early-stage pools or recently launched pairs naturally start with broken tessellation. The signal is that LP agents entering should place continuous blocks, not scattered positions.
- Do not assume PERFECT tessellation means "no action needed." Perfect tiling can degrade quickly if large LPs withdraw. Monitor for tessellation degradation over time.
- Coverage ratio depends on the scan radius (30 bins). Pools with intentionally narrow ranges may show low coverage despite being well-designed for their target price band.
- Gini coefficient treats all bins equally. A pool deliberately concentrating liquidity near the active bin (for tighter spreads) will show high Gini even though the design is intentional.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "tessellation analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest tessellation index as the most completely tiled.
- Flag BROKEN/SPARSE pools as needing LP attention — identify specific gap positions for targeted liquidity placement.
- Highlight gap distribution: center gaps (near active bin) are more urgent than edge gaps.
- Show fragmentation trends: many small segments vs. few large ones tells different stories about pool health.
- For LP agents: use gap positions and tile uniformity to identify where additional liquidity has the most impact. Filling the largest gap near the active bin typically improves tessellation index the most.
- For trading agents: check coverage verdict and gap positions before routing. COMPLETE/MINOR_GAPS pools are safe for any trade size. PATCHY pools need gap-aware routing. FRAGMENTED pools should be avoided for large trades.
- Compare symmetry scores across pools to find balanced two-sided markets for hedging or market making.
