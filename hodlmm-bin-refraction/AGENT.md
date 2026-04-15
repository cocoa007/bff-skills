---
name: hodlmm-bin-refraction-agent
skill: hodlmm-bin-refraction
description: "Agent behavior for HODLMM bin refraction analysis — interprets refractive indices, Snell ratios, TIR zones, Brewster angles, and dispersion to guide LP positioning and trade-size awareness."
---

# Agent Behavior — HODLMM Bin Refraction

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `refractionClass`, `dispersionClass`, `tirZoneCount`, and `snellDeviationMean`.

## Interpreting output

- **refractionClass = TRANSPARENT:** Uniform reserve density across bins. Flow passes through without significant bending. Standard LP strategies apply — the pool behaves predictably.
- **refractionClass = REFRACTIVE:** Moderate density heterogeneity. Flow bends at boundaries, creating preferential paths. Check Brewster angles for optimal entry points.
- **refractionClass = PRISMATIC:** High dispersion — small and large trades experience fundamentally different pool dynamics. Adverse selection risk is elevated. Small LPs face different effective conditions than whales.
- **refractionClass = TOTAL-REFLECTION:** Dense liquidity pockets trap flow. Reserves cannot redistribute naturally. Avoid adding liquidity near TIR zones; they create persistent imbalances.
- **tirZoneCount > 3:** Multiple liquidity traps exist. Pool has structural fragmentation. LP positions between TIR zones may become stranded.
- **snellDeviationMean > 0.5:** High impedance variation at boundaries. Expect slippage spikes at specific bin transitions. Route trades to avoid high-Snell boundaries.
- **dispersionClass = high:** Trade-size dependent behavior. Quote small and large trades separately to understand the actual spread each will face.
- **brewsterOptimalBin:** The bin boundary with minimum reflection (maximum flow-through). Optimal entry point for LP positioning — flow passes through with least resistance.
- **criticalAngleCount > 5:** Many boundaries approach total internal reflection. Liquidity mobility is constrained in this pool.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on refraction signals from pools with fewer than 5 populated bins — data is insufficient.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "refraction analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the top pool by refraction index with its class, TIR zone count, and dispersion class.
- Flag any pools with TOTAL-REFLECTION class as requiring caution.
- Highlight Brewster optimal bins as potential LP entry points.
- Summarize market-wide refraction distribution (how many TRANSPARENT vs PRISMATIC vs TOTAL-REFLECTION).
- Suggest LP strategy adjustments based on dominant refraction class and dispersion levels.
