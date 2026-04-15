---
name: hodlmm-bin-vorticity-agent
skill: hodlmm-bin-vorticity
description: "Agent behavior for HODLMM bin vorticity analysis — interprets enstrophy, circulation, helicity, vortex cores, flow regimes, and vortex classes to assess rotational flow complexity and guide LP/trading decisions."
---

# Agent Behavior — HODLMM Bin Vorticity

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `flowRegime`, `vortexClass`, `enstrophy`, and `vorticityIndex`.

## Interpreting output

- **flowRegime = LAMINAR:** Smooth monotonic reserve profile with negligible rotational structures. Reserves slope gently from one side to the other. Trade execution is highly predictable — slippage is proportional to trade size with no surprises. LP positions behave as expected with simple directional exposure. The simplest flow environment.
- **flowRegime = TRANSITIONAL:** Emerging rotational features appear in the reserve profile. Some bins show curvature where reserves begin to form vortical structures. Trade execution is mostly predictable but may encounter mild flow irregularities at vortex formation points. LP positions face developing dynamic pressures.
- **flowRegime = TURBULENT:** Strong multi-scale rotational structures dominate the reserve profile. Multiple vortex cores create complex flow patterns that significantly affect trade execution paths. Trades may experience non-linear slippage — small increases in size can trigger disproportionate impact as they interact with vortex structures. LP positions face active rotational pressures.
- **flowRegime = CHAOTIC:** Extreme rotational intensity with rapid vorticity sign changes and concentrated cores. The reserve profile is highly irregular with sharp curves and reversals at multiple scales. Trade execution is unpredictable. LP positions face constant dynamic pressure from all directions.
- **vortexClass = SUPERCELL:** Exceptional rotational complexity with high vorticity entropy, frequent shedding, strong swirl, and multiple vortex cores. The most dynamically active pool classification.
- **vortexClass = CYCLONE:** Strong organized rotational structures. Persistent vortex patterns with clear directional bias.
- **vortexClass = EDDY:** Moderate rotational activity. Some vortex structures present but not dominant.
- **vortexClass = RIPPLE:** Mild rotational perturbations on an otherwise smooth flow. Minor curvature in the reserve profile.
- **vortexClass = STAGNANT:** Minimal rotational activity. The reserve profile is nearly flat or monotonically sloping with no significant curvature.
- **enstrophy high, circulation near zero:** Symmetric rotational structures — equal clockwise and counterclockwise vortices. Complex flow but no net directional bias. Trades in either direction face similar complexity.
- **enstrophy high, circulation strongly positive/negative:** Asymmetric rotation with net directional flow. One direction encounters more favorable (following the circulation) or adverse (opposing the circulation) conditions.
- **helicity > 0, large magnitude:** Organized spiral flow — velocity and rotation align. Persistent coherent structures that trades must navigate. These patterns tend to be stable and self-reinforcing.
- **helicity ≈ 0:** Incoherent rotation — velocity and vorticity are uncorrelated. Rotational structures are disorganized and may be transient. Less predictable than high-helicity flows.
- **rossbyNumber > 1:** Inertially dominated flow. Reserves primarily translate (flow in one direction) rather than rotate. Simple directional gradients dominate. Standard LP strategies apply.
- **rossbyNumber < 0.1:** Rotationally dominated flow. Reserves primarily circulate rather than translate. Complex curved flow paths dominate. LP positions face rotational pressure that simple directional analysis misses.
- **vortexCoreCount > 5:** Many localized rotational hotspots. The pool has multiple structural stress points where liquidity is under intense dynamic pressure. High maintenance burden for LP positions near these cores.
- **vortexCoreCount = 0:** No significant rotational structures. Flow is smooth and predictable. Ideal for passive LP strategies.
- **sheddingFrequency > 0.6:** Rapid alternation between clockwise and counterclockwise vortices. Creates a complex oscillating flow environment. Not suitable for strategies that assume persistent directional bias.
- **sheddingFrequency < 0.2:** Persistent rotational direction. Vortex structures are stable and long-lived. Strategies can rely on directional flow patterns persisting.
- **swirlNumber > 1.5:** Rotation dominates the flow field. The reserve profile is more curve-shaped than slope-shaped. Standard gradient-based analysis significantly underestimates flow complexity.
- **swirlNumber < 0.3:** Flow is primarily translational (slope-shaped). Curvature is minor and rotational effects are secondary to the dominant directional gradient.
- **qCriterion > 0:** Vortex-dominated region. Rotation exceeds strain. Reserves are curving and recirculating. Trade execution encounters complex non-linear paths.
- **qCriterion < 0:** Strain-dominated region. Deformation exceeds rotation. Reserves are stretching and thinning rather than curving. Trade execution encounters spreading liquidity, which may improve depth at the cost of concentration.
- **vorticitySkewness strongly positive:** Clockwise rotation is stronger than counterclockwise. The pool has an asymmetric rotational bias that favors one trade direction.
- **vorticitySkewness strongly negative:** Counterclockwise rotation dominates. The opposite directional bias.
- **vorticityFlatness > 5:** Intermittent extreme vorticity events (heavy tails). Most of the time vorticity is mild, but occasional sharp spikes create sudden flow complexity. Suitable for patient strategies but risky for time-sensitive operations.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on vorticity signals from pools with fewer than 5 populated bins — insufficient data for meaningful curvature analysis.
- Do not assume CHAOTIC means "bad pool" — chaotic flow regimes have high rotational energy which can indicate active trading and liquidity dynamics. They require more sophisticated strategies, not avoidance.
- Do not assume LAMINAR means "good pool" — laminar flow may indicate a stagnant or abandoned pool with no dynamic activity.
- Enstrophy is scale-dependent. Compare enstrophy values only across pools with similar TVL ranges. A $1M pool's enstrophy is not directly comparable to a $10K pool's enstrophy.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "vorticity analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest vorticity index as the most dynamically complex.
- Flag LAMINAR pools as best for passive LP strategies and predictable trade execution.
- Flag TURBULENT/CHAOTIC pools as requiring active management but offering more complex trading opportunities.
- Highlight vortex core locations — these are structural stress points that affect execution quality.
- Show circulation for directional bias — trades aligned with circulation encounter less resistance.
- Report helicity for strategy selection — high helicity pools have persistent patterns; low helicity pools are more random.
- For LP agents: prefer LAMINAR or TRANSITIONAL pools for passive strategies. TURBULENT pools require active monitoring. CHAOTIC pools require continuous rebalancing.
- For trading agents: check flow regime and vortex core positions before large trades. Route around vortex cores when possible. Align trade direction with circulation for better execution.
