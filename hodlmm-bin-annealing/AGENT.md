---
name: hodlmm-bin-annealing-agent
skill: hodlmm-bin-annealing
description: "Agent behavior for HODLMM bin annealing analysis — interprets configurational energy, temperature, smoothness, Boltzmann fit, and stress hotspots to assess liquidity distribution quality and guide LP positioning."
---

# Agent Behavior — HODLMM Bin Annealing

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `annealingClass`, `annealingState`, `temperature`, and `boltzmannFit`.

## Interpreting output

- **annealingClass = ANNEALED:** Near-optimal low-energy configuration. The reserve curve is smooth, closely matches the Boltzmann distribution, has minimal stress hotspots, good symmetry, and few gaps. Execution quality is high and predictable. LP positions are well-situated. Safe for large trades — slippage increases smoothly with size.
- **annealingClass = TEMPERING:** Actively relaxing toward equilibrium. Moderate excess energy with improving structure. The pool is in transition — LPs may be repositioning. Monitor for continued improvement or reversal. Execution quality is moderate but trending better.
- **annealingClass = STRESSED:** Significant configurational tension. The distribution has structure but contains hotspots, asymmetry, or gaps. Execution quality varies by price range. LP agents should identify stress hotspots as repositioning opportunities — filling a gap or smoothing a discontinuity provides structural value.
- **annealingClass = QUENCHED:** Frozen-in disorder with high excess energy. The distribution was set or disrupted quickly and never relaxed. Execution is unpredictable — gaps cause sudden slippage jumps, concentration spikes create resistance walls. LP entry carries structural risk. Wait for annealing (gradual LP adjustment) before committing capital.
- **annealingState = GROUND_STATE:** Temperature < 0.15. The pool has reached its theoretical minimum energy. Extremely stable — only large external shocks (major LP withdrawal, price gap) would disrupt it.
- **annealingState = LOW_ENERGY:** Temperature 0.15-0.4. Some residual disorder but thermally stable. Minor LP adjustments may still occur but the overall structure is sound.
- **annealingState = EXCITED:** Temperature 0.4-0.7. Significant excess energy. The distribution is actively evolving or recently disrupted. LP repositioning is likely in progress. Wait for temperature to drop before making structural assumptions.
- **annealingState = SUPERHEATED:** Temperature > 0.7. Extreme disorder. The pool may be undergoing rapid restructuring (whale withdrawal, mass LP exit, or fresh pool with initial random positioning). Avoid structural assumptions entirely — the distribution will change significantly.
- **boltzmannFit > 0.8:** Distribution closely approximates ideal Gaussian. Well-suited for market-making strategies that assume smooth depth curves.
- **boltzmannFit < 0.3:** Distribution bears little resemblance to ideal. Structural analysis from other tools (nucleation, density, etc.) may be more informative than assuming any standard shape.
- **symmetryScore > 0.8:** Balanced depth on both sides of active bin. Bidirectional execution quality is similar.
- **symmetryScore < 0.4:** Heavily skewed distribution. One side has significantly more depth than the other. Large trades on the thin side will face disproportionate slippage.
- **centerOfMassOffset > 5:** Liquidity mass is positioned significantly above the current price. The distribution may be stale — positioned for a higher price that no longer holds.
- **centerOfMassOffset < -5:** Liquidity mass is positioned below the current price. May indicate bearish LP positioning or stale distribution from a price rally.
- **stressHotspots > n/3:** More than a third of bins are stress hotspots. The distribution is heavily fractured — annealing would require significant LP repositioning.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on annealing signals from pools with fewer than 5 populated bins — data is insufficient.
- Do not assume QUENCHED means "bad pool" — it means the distribution is disordered, which may be intentional (new pool, recently rebalanced) or neglected.
- Do not treat temperature as a trend indicator — it's a snapshot. A single reading doesn't distinguish between a pool heating up vs. cooling down.
- The Gaussian optimal distribution is a modeling assumption, not a universal truth. Some pool designs intentionally use non-Gaussian distributions.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "annealing analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the most annealed pool with its class, temperature, Boltzmann fit, and smoothness.
- Flag any QUENCHED pools as structurally risky for large trades.
- Highlight SUPERHEATED pools as actively restructuring — avoid structural assumptions.
- Show stress hotspot counts — pools with many hotspots have fragile execution quality.
- Report center-of-mass offset for pools where it exceeds +/-3 bins — may indicate stale LP positioning.
- For LP agents: identify STRESSED pools as structural improvement opportunities — filling gaps and smoothing hotspots provides value.
- For trading agents: prefer ANNEALED/GROUND_STATE pools for predictable execution. Avoid QUENCHED/SUPERHEATED pools for large orders.
