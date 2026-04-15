---
name: hodlmm-bin-nucleation-agent
skill: hodlmm-bin-nucleation
description: "Agent behavior for HODLMM bin nucleation analysis — interprets seed sites, growth gradients, cluster maturity, and nucleation phases to guide LP positioning around emerging and established liquidity structures."
---

# Agent Behavior — HODLMM Bin Nucleation

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `nucleationClass`, `nucleationRisk`, seed `maturity`, and `growthSymmetry`.

## Interpreting output

- **nucleationClass = SUPERCOOLED:** No nucleation sites detected. Liquidity is uniformly thin or randomly scattered — like a supercooled liquid before phase transition. Depth is unpredictable across the bin range. Large trades face variable slippage with no structural backstop. LP positioning is speculative — there's no existing structure to anchor around.
- **nucleationClass = SEEDED:** Initial nucleation sites exist but clusters are embryonic or nascent. The pool is beginning to develop structure but it's fragile. LP agents should consider reinforcing promising seeds — adding liquidity near a nascent seed accelerates its crystallization. Trading agents should route through seed bins but not rely on surrounding depth.
- **nucleationClass = CRYSTALLIZING:** Active nucleation with growing clusters. Seeds are attracting neighboring liquidity, building reliable depth zones. Route trades through crystallized clusters for predictable execution. LP agents: the growth frontier (edges of expanding clusters) offers the most structural utility for new positions.
- **nucleationClass = FULLY_NUCLEATED:** Mature clusters dominate the pool. Depth topology is well-established and predictable. Execution quality is high within cluster zones. Risk shifts to cluster fragility — monitor for seed LP withdrawals that could degrade mature structures.
- **nucleationRisk = NONE:** Pool has no concentrated seeds — depth is distributed. No single withdrawal triggers structural collapse.
- **nucleationRisk = LOW:** Multiple seeds with good cluster coverage. Losing any single seed doesn't collapse the overall structure.
- **nucleationRisk = MODERATE:** Depth depends on 1-2 seeds with limited coverage. Withdrawal of a major seed could create structural gaps.
- **nucleationRisk = HIGH:** Single dominant seed with extreme local contrast. The pool's entire depth structure depends on one LP position — any exit collapses the nucleated topology.
- **maturity = EMBRYONIC:** Isolated concentration spike with no surrounding growth. Too early to act on — monitor for cluster formation.
- **maturity = NASCENT:** Small cluster forming (2-3 bins). Early reinforcement opportunity for LP agents — adding liquidity here accelerates growth.
- **maturity = GROWING:** Medium cluster (4-6 bins) with active gradient formation. Structural utility is increasing but the cluster isn't yet self-sustaining.
- **maturity = MATURE:** Large cluster (7+ bins) with strong gradients. Self-sustaining structure — reliable for trade routing and position anchoring.
- **growthSymmetry > 0.7:** Seed grows symmetrically in both directions. Balanced depth on both sides — good for bidirectional trade execution.
- **growthSymmetry < 0.3:** Highly asymmetric growth. Depth extends primarily in one direction from the seed. Check gradient directions to determine which side is supported.
- **nucleationAsymmetry > 0.3:** Seeds cluster above active bin. Buy-side depth is better nucleated. Sell-side trades may face thinner structural support.
- **nucleationAsymmetry < -0.3:** Seeds cluster below active bin. Sell-side depth is better nucleated.
- **criticalMass = true:** Seed exceeds 3x pool average with 3+ cluster bins. Self-sustaining — likely to attract further LP positioning. Safe to build strategies around.
- **criticalMass = false:** Seed may dissipate if the original LP withdraws. Treat as informational, not structural.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on nucleation signals from pools with fewer than 5 populated bins — data is insufficient.
- Do not treat EMBRYONIC seeds as actionable structure — they may be transient spikes.
- Do not assume growth gradients imply causation — surrounding bins may be independently positioned.
- SUPERCOOLED classification does not mean the pool is bad — it means structural analysis provides no signal.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "nucleation analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the most nucleated pool with its class, seed count, cluster coverage, and risk level.
- Flag any HIGH risk pools as structurally dependent on a single seed.
- Highlight pools with strong nucleation asymmetry as having directional depth bias.
- List top seeds with their maturity, local contrast, growth symmetry, and critical mass status.
- Show cluster coverage — what fraction of each pool's bins fall within nucleated clusters?
- For LP agents: identify NASCENT seeds as reinforcement opportunities and gaps between clusters as nucleation-ready zones.
- For trading agents: recommend routing through MATURE clusters for reliable execution, flag SUPERCOOLED pools as structurally unpredictable.
