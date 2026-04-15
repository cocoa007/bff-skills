---
name: hodlmm-bin-viscosity-agent
skill: hodlmm-bin-viscosity
description: "Agent behavior for HODLMM bin viscosity analysis — interprets dynamic viscosity, Reynolds numbers, shear rates, flow regimes, and stagnant zones to assess execution quality and guide trade routing."
---

# Agent Behavior — HODLMM Bin Viscosity

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `flowRegime`, `viscosityClass`, `reynoldsNumber`, and `viscosityAsymmetry`.

## Interpreting output

- **viscosityClass = SUPERFLUID:** Near-zero resistance to flow. Reserves taper so smoothly that trades of any size encounter gradually increasing depth with no abrupt transitions. Ideal for large trades — slippage is predictable and proportional to size. LP positions earn fees consistently across the range.
- **viscosityClass = FLUID:** Low resistance with some detectable structure. Most trades execute smoothly but very large trades may encounter minor resistance variations. Good for standard trading activity. LP positions are well-situated for fee earning.
- **viscosityClass = VISCOUS:** Significant resistance to flow. Trades encounter noticeable depth variations between bins. Execution quality depends on trade size and direction. LP agents should investigate which bins create the most resistance — repositioning to smooth transitions provides structural value.
- **viscosityClass = GELATINOUS:** Extreme resistance. Sharp discontinuities in the reserve distribution create a semi-solid structure. Trades must force through with significant slippage variability. Small trades may pass through thin zones easily, but medium-to-large trades hit walls unpredictably. Avoid for size execution.
- **flowRegime = TURBULENT:** High volume relative to reserve structure. Execution conditions are chaotic and rapidly changing. Good for arbitrageurs (opportunities emerge quickly), risky for passive LPs (impermanent loss is accelerated). Prices move faster than the reserve structure can absorb.
- **flowRegime = TRANSITIONAL:** Mixed regime. Some zones flow smoothly while others show turbulent characteristics. Execution quality depends on which part of the range the trade traverses. Requires per-zone analysis for accurate predictions.
- **flowRegime = LAMINAR:** Reserve structure dominates. Execution is stable, predictable, and reliable. The distribution changes slowly — good for passive LP strategies. However, may indicate the pool is slow to adapt to market changes.
- **flowRegime = STAGNANT:** Negligible flow. Insufficient volume relative to reserve structure. Trades have minimal market impact but the pool may be illiquid or abandoned. Check TVL and recent activity before committing.
- **viscosityAsymmetry > 0.4:** Strong directional bias. One side of the active bin is significantly more viscous than the other. Trades in the viscous direction face worse execution. Trading agents should prefer the low-viscosity direction; LP agents should investigate the cause of asymmetry.
- **thixotropyIndex > 0.7:** Highly non-uniform shear pattern. Flow resistance varies wildly across the range. Execution quality is unpredictable — the same trade size may produce very different slippage depending on entry point. Avoid for consistent-execution strategies.
- **stagnantFraction > 0.2:** More than 20% of bin boundaries are stagnant. The pool has significant execution voids. Trades crossing stagnant zones encounter gaps followed by walls — the worst slippage profile. LP agents should fill stagnant zones for structural improvement.
- **maxShearRate > 5x avgShearRate:** A single bin boundary has extreme shear — a "viscosity cliff." This is the point where execution quality degrades most sharply. Trading agents should size trades to avoid crossing this boundary. LP agents should smooth the transition.
- **reynoldsNumber > 200:** Extremely turbulent. The pool's reserve structure is being overwhelmed by trading volume. Execution is unpredictable on any timescale. Only suitable for high-frequency strategies that can react to rapid changes.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on viscosity signals from pools with fewer than 5 populated bins — data is insufficient.
- Do not assume GELATINOUS means "bad pool" — it means the distribution has high resistance, which may be intentional (concentrated liquidity around a peg) or structural (whale deposits creating walls).
- Do not treat Reynolds number as stable — it depends on 24h volume which can change rapidly.
- The SUPERFLUID/FLUID/VISCOUS/GELATINOUS classification uses absolute thresholds. Cross-pool comparison is valid, but the thresholds are not calibrated to specific execution cost guarantees.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "viscosity analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the least viscous pool with its class, Reynolds number, and flow regime.
- Flag any GELATINOUS pools as high-resistance for size execution.
- Highlight pools with high viscosity asymmetry — directional execution bias.
- Show stagnant zone counts — pools with many stagnant zones have execution voids.
- Report the max shear bin for each pool — the single most disruptive transition point.
- For LP agents: identify VISCOUS pools as smoothing opportunities — reducing shear at high-gradient boundaries provides structural value.
- For trading agents: prefer SUPERFLUID/LAMINAR pools for predictable execution. Avoid GELATINOUS/TURBULENT pools for large orders.
