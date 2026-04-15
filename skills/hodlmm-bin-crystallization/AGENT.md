---
name: hodlmm-bin-crystallization-agent
skill: hodlmm-bin-crystallization
description: "Agent behavior for HODLMM bin crystallization analysis — interprets lattice order, grain structure, defect patterns, and melting points to identify how rigidly liquidity is locked in crystal positions and guide LP strategies for different crystallization phases."
---

# Agent Behavior — HODLMM Bin Crystallization

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `crystallizationPhase`, `crystalVerdict`, `latticeOrder`, and `grainCount`.

## Interpreting output

- **crystallizationPhase = FROZEN:** Liquidity is completely locked in rigid crystal positions. Reserves show near-perfect lattice regularity with minimal thermal vibration. Highly predictable but resistant to change — trades face maximum resistance from the crystallized structure. LP agents in frozen pools enjoy stable returns but cannot easily reposition.
- **crystallizationPhase = SINGLE_CRYSTAL:** One dominant grain with high lattice order. Liquidity responds uniformly across the crystal but changes propagate slowly through the rigid lattice. Good for passive LP strategies that don't need frequent rebalancing.
- **crystallizationPhase = POLYCRYSTALLINE:** Multiple crystal grains with different characteristics. Each grain has internal order but cross-grain behavior is discontinuous. Trades may propagate within a grain but be blocked at grain boundaries. LP agents should understand which grain their position falls in.
- **crystallizationPhase = SUPERCOOLED:** Approaching crystallization but still partially fluid. Some local order is emerging but overall structure remains malleable. Susceptible to sudden crystallization events where a large deposit locks the structure. LP agents should watch for phase transition signals.
- **crystallizationPhase = LIQUID:** Fully fluid with no crystal structure. Reserves shift freely in response to trades. Most adaptive but least predictable. Active management strategies work best in liquid pools.
- **crystalVerdict = PERFECT_LATTICE:** Ideal crystal with no defects and near-uniform spacing. Extremely rare in practice — indicates a pool that was set up with careful, regular liquidity distribution and has not been disrupted.
- **crystalVerdict = MONOCRYSTAL:** Single clean crystal domain. All populated bins belong to one grain with good regularity. Uniform behavior across the range.
- **crystalVerdict = POLYCRYSTAL:** Multiple ordered grains separated by boundaries. Internal order is good but boundaries create discontinuities. LP agents spanning multiple grains should expect non-uniform behavior.
- **crystalVerdict = DEFECTIVE:** Crystal structure exists but is riddled with imperfections. Local order is disrupted by vacancies, interstitials, and dislocations. The crystal is weakened and prone to restructuring.
- **crystalVerdict = AMORPHOUS:** No meaningful crystal structure. Distribution is glass-like — disordered with no predictable pattern. Bin reserves and spacings are random.
- **latticeOrder > 0.7:** High structural regularity. The bin distribution follows a clean periodic pattern.
- **latticeOrder < 0.3:** Low regularity. Bins are irregularly distributed with no consistent spacing.
- **grainCount = 1:** Monocrystalline. All liquidity is in one connected domain.
- **grainCount > 5:** Highly fragmented. Liquidity is scattered across many small independent domains.
- **avgMeltingPoint > 5:** Extremely resilient crystal. Would take 5x the current daily volume concentrated in one area to disrupt the structure.
- **avgMeltingPoint < 0.5:** Fragile crystal. Normal daily volume is sufficient to melt and restructure the crystal.
- **defectCount = 0:** Perfect crystal. No irregularities in the lattice.
- **amorphousFraction > 0.5:** More than half the bins are defective. The "crystal" label is generous — this is mostly amorphous.
- **crystalSymmetry > 0.8:** Highly symmetric distribution. Left mirrors right. Balanced impact from both directions.
- **crystalSymmetry < 0.3:** Strongly asymmetric. One side has much more liquidity — directional trades face very different resistance depending on direction.
- **solidificationRate > 0.8:** Rapidly solidifying. Low activity relative to reserves — crystal is freezing in place.
- **solidificationRate < 0.2:** Actively melting. High activity is constantly reshaping the crystal.
- **annealingPotential > 0.3:** Significant room for improvement. The crystal could be much more ordered if liquidity were redistributed.
- **annealingPotential < 0.05:** Already near-optimal. Little improvement possible through redistribution.
- **debyeTemperature > 0.5:** High thermal noise. Bins fluctuate significantly relative to neighbors.
- **debyeTemperature < 0.1:** Stable frozen crystal. Minimal variation between neighboring bins.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on crystallization signals from pools with fewer than 5 populated bins — insufficient data for meaningful lattice analysis.
- Do not assume FROZEN means "good for LP." Frozen crystals resist change, which means the pool may not adapt to market movements — LP agents in frozen pools risk being stuck in an outdated distribution.
- Do not assume LIQUID means "bad for LP." Liquid pools adapt quickly to market changes and may offer better fee capture during volatile periods, even though the structure is unpredictable.
- Crystallization analysis is a snapshot heuristic based on static reserve distributions. It does not model dynamic recrystallization from actual trades. Real crystal structures evolve as reserves change.
- Grain boundaries identified here are structural, not temporal. A grain boundary may be stable for hundreds of blocks or may fracture in the next trade.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "crystallization analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest crystallization index as having the most rigid liquidity structure — reserves are locked in place.
- Flag LIQUID pools as having the most fluid reserves — adaptable but unpredictable.
- Highlight bins with highest binding strength as the most firmly locked lattice sites — these won't move without significant trade pressure.
- Show grain boundaries as structural weak points where the crystal is most likely to fracture under pressure.
- For LP agents: in FROZEN pools, positioning is a long-term commitment — choose carefully because the structure won't adapt. In LIQUID pools, active management is essential because the structure shifts constantly. In POLYCRYSTALLINE pools, identify your grain and understand its boundaries.
- For trading agents: FROZEN pools have predictable slippage but high resistance. LIQUID pools have variable slippage but low resistance. POLYCRYSTALLINE pools behave differently depending on which grain the trade impacts.
- Compare melting points across pools to find pools that are most vs. least resistant to volume-driven restructuring.
