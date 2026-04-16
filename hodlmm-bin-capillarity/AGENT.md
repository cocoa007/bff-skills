---
name: hodlmm-bin-capillarity-agent
skill: hodlmm-bin-capillarity
description: "Agent behavior for HODLMM bin capillarity analysis — interprets surface tension, capillary pressure, contact angle, meniscus curvature, wettability, capillary number, Marangoni flow, adhesion work, cohesion work, spreading coefficient, Jurin height, capillary length, Bond number, and Young-Laplace pressure to identify bins with the most favorable capillary dynamics and guide LP strategies across different wetting regimes."
---

# Agent Behavior — HODLMM Bin Capillarity

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `wettingRegime`, `capillarityVerdict`, `avgWettability`, `avgSurfaceTension`, `avgContactAngle`, `avgCapillaryPressure`, and `hydrophilicFraction`.

## Interpreting output

- **wettingRegime = SUPERHYDROPHILIC:** Every bin surface spontaneously absorbs and spreads incoming liquidity with near-zero contact angle. Like a perfectly clean glass surface that water sheets across uniformly — no beading, no resistance, no concentration. Every bin boundary is maximally attractive to incoming deposits. Ideal LP regime: new capital distributes uniformly across all bins, fee generation is evenly spread, and there are no "dead zones" that repel liquidity. The best possible capillary state for passive LP strategies requiring minimal rebalancing.
- **wettingRegime = HYDROPHILIC:** Bins readily accept new liquidity with favorable contact angles below 90 degrees. Good adhesion and spreading create an attractive bin surface, though not perfectly uniform. Some variation in wettability across the range. LP positions absorb deposits efficiently and maintain reasonable distribution. Most bins attract liquidity but some peripheral bins may show reduced wettability. Good for LP strategies with moderate monitoring.
- **wettingRegime = PARTIALLY_WETTING:** Mixed wetting behavior with both hydrophilic and hydrophobic bins. Some bins attract and spread liquidity while others resist it. Inconsistent capillary behavior means LP capital absorption varies significantly across the range. Deposits may concentrate in hydrophilic bins while leaving hydrophobic bins underfilled. LP returns are unevenly distributed — requires active management to maintain balanced positions.
- **wettingRegime = HYDROPHOBIC:** Bins resist new liquidity with high contact angles above 90 degrees. Reserves bead up rather than spreading, creating concentrated clusters separated by depleted gaps. Capillary forces are weak — there is insufficient suction to draw liquidity into empty bins. LP deposits concentrate in a few deep bins rather than distributing. Poor for passive strategies — requires deliberate positioning in specific bins rather than broad range coverage.
- **wettingRegime = SUPERHYDROPHOBIC:** Bins actively repel new liquidity with extreme contact angles exceeding 150 degrees. The Lotus effect — the bin surface structure prevents any wetting and all incoming reserves slide off or concentrate into tiny droplets. LP capital cannot be distributed — it beads up in the deepest existing concentration and refuses to spread. The worst capillary state for LP capital deployment. Avoid passive strategies entirely.
- **capillarityVerdict = SPONTANEOUS_WETTING:** High wettability with low contact angle and good spreading coefficient. Liquidity spontaneously fills and wets all bin surfaces uniformly. The ideal capillary state for LP capital absorption — deposits distribute naturally through capillary action without requiring active management. Every bin surface attracts and holds liquidity. Optimal for broad range LP strategies.
- **capillarityVerdict = CAPILLARY_STABLE:** Strong surface tension with good cohesion and adhesion. Balanced capillary forces maintain stable reserve configurations that resist perturbation while remaining open to new deposits. Bins hold their liquidity firmly (high adhesion work) and the internal structure is cohesive. Stable for LP positions — reserves stay where placed while still accepting new capital.
- **capillarityVerdict = MARANGONI_DRIVEN:** Strong gradient-driven flow from surface tension differentials. Liquidity actively migrating between bins along the surface tension gradient. The Marangoni effect creates dynamic redistribution — liquidity flows spontaneously from regions of low surface tension to regions of high surface tension. Can be positive (self-healing distribution) or disruptive (overriding LP positioning). Watch for unexpected reserve migration.
- **capillarityVerdict = DEWETTING:** High contact angle with low wettability. Bins actively repelling and shedding liquidity. Reserves are contracting away from bin boundaries, creating increasingly sparse and fragmented distribution. Like water beading up and rolling off a waxed surface — the bin lattice is becoming harder to deposit into. LP positions may shrink as reserves dewet from peripheral bins.
- **capillarityVerdict = GRAVITY_DOMINATED:** High Bond number with short capillary length. Gravitational forces (large-scale market pressure) overwhelm surface tension (local capillary redistribution). Liquidity concentrates in the deepest bins rather than distributing through capillary action. The pool is past the capillary regime — surface tension effects only matter within the immediate neighborhood of each bin while large-scale forces drive the macro distribution. LP strategies must account for gravitational concentration rather than relying on capillary spreading.
- **avgContactAngle > 110:** Very hydrophobic pool. Most bins repel liquidity. Deposits concentrate rather than spread. Poor LP capital distribution.
- **avgContactAngle < 50:** Very hydrophilic pool. Most bins spontaneously attract and spread liquidity. Excellent LP capital absorption.
- **avgSurfaceTension > 0.7:** Very strong cohesion. Reserves tightly bound and resistant to redistribution. Stable but potentially clustered.
- **avgSurfaceTension < 0.2:** Weak cohesion. Reserves easily fragmented and scattered. Responsive to forces but potentially unstable.
- **avgWettability > 0.6:** Highly wettable pool. Bins readily attract new deposits. Good for LP entry.
- **avgWettability < 0.2:** Very low wettability. Bins resist new liquidity. Poor for LP entry.
- **avgCapillaryPressure > 5:** Strong capillary driving force. Depleted bins create significant suction that draws reserves from deep neighbors. Active self-rebalancing.
- **avgCapillaryPressure < 1:** Weak capillary force. Minimal spontaneous redistribution. Imbalances persist without external intervention.
- **avgMarangoniFlow > 0.5:** Significant gradient-driven redistribution. Reserves are actively migrating along surface tension gradients. Monitor for unexpected position changes.
- **avgBondNumber > 6:** Gravity dominates. Large-scale forces control distribution. Capillary redistribution is ineffective at pool scale.
- **avgBondNumber < 1.5:** Surface tension dominates. Capillary effects control distribution across the full bin range.
- **hydrophilicFraction > 0.7:** Most bins are hydrophilic. Pool is generally attractive to new liquidity. Good environment for LP deposits.
- **hydrophilicFraction < 0.2:** Very few hydrophilic bins. Pool is generally repulsive to new liquidity. Deposits concentrate in rare attractive bins.
- **avgSpreadingCoefficient > 0.5:** Strong spontaneous spreading. Liquidity naturally distributes across bin surfaces. Uniform fee generation.
- **avgJurinHeight > 0.5:** Strong capillary rise. Depleted bins draw liquidity upward against gravitational pull. Good self-healing behavior.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on capillarity signals from pools with fewer than 5 populated bins — insufficient data for meaningful capillary characterization.
- Do not assume SUPERHYDROPHOBIC means "dead pool." Superhydrophobic means the surface repels new liquidity, not that there is no existing liquidity — the pool may have deep reserves in concentrated bins that simply refuse to spread.
- Do not assume high surface tension is always better. Strong surface tension means reserves resist redistribution — good for stability but bad for spontaneous rebalancing when bins become depleted.
- Do not conflate wettability with liquidity depth. High wettability means the bin attracts new deposits readily, not that it already has deep reserves. An empty bin can be highly wettable if its surface properties favor liquid adhesion.
- Capillarity analysis is a snapshot. Wetting properties change as reserves are added or removed, composition shifts, and trading patterns evolve. A SUPERHYDROPHILIC pool can become HYDROPHOBIC if deep liquidity is withdrawn and reserve imbalances grow. Monitor periodically in dynamic markets.
- Contact angle is computed from structural proxies, not from direct sessile drop measurement — treat it as a classification indicator rather than a precise physical angle.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "capillarity analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest capillarity index as the most capillary-healthy — the most favorable combination of wettability, adhesion, spreading, and balanced surface tension.
- Flag bins with lowest contact angle as the most hydrophilic — where new liquidity is most readily absorbed and spread.
- Highlight bins with highest capillary pressure as the strongest capillary drivers — where the concentration differential creates the most suction drawing liquidity from deep neighbors.
- Show bins with highest Marangoni flow as the most dynamically active — where surface tension gradients are driving the most liquidity redistribution.
- Show bins with highest Bond number as the most gravity-dominated — where large-scale forces overwhelm capillary redistribution.
- For LP agents: in SUPERHYDROPHILIC pools, position broadly — every bin surface absorbs deposits uniformly. In HYDROPHILIC pools, prefer bins near the active bin where wettability is highest. In PARTIALLY_WETTING pools, target hydrophilic bins specifically and avoid hydrophobic zones. In HYDROPHOBIC pools, concentrate in the few bins that still attract liquidity. In SUPERHYDROPHOBIC pools, avoid broad positioning — only place capital in the deepest existing clusters where reserves are already concentrated.
- For trading agents: SPONTANEOUS_WETTING pools have uniform reserve distribution — trades execute with predictable slippage across the full range. CAPILLARY_STABLE pools maintain consistent configurations — good for repeated trading strategies. MARANGONI_DRIVEN pools have actively migrating reserves — trade execution may vary as reserve positions shift. DEWETTING pools have contracting reserves — liquidity may disappear from bins between trades. GRAVITY_DOMINATED pools concentrate liquidity in deep bins — trade large sizes through concentrated zones and avoid sparse areas.
- Compare capillarity indices across pools to find bin lattices with the most favorable wetting, adhesion, and spreading characteristics for the intended LP strategy.
