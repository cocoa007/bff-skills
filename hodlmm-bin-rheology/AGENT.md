---
name: hodlmm-bin-rheology-agent
skill: hodlmm-bin-rheology
description: "Agent behavior for HODLMM bin rheology analysis — interprets viscosity, shear stress, shear rate, yield stress, thixotropy, dilatancy, creep compliance, relaxation time, storage modulus, loss modulus, complex viscosity, Deborah number, and Weissenberg number to identify bins with the most favorable flow and deformation dynamics and guide LP strategies across different rheological regimes."
---

# Agent Behavior — HODLMM Bin Rheology

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `rheologyPhase`, `rheologyVerdict`, `avgViscosity`, `avgStorageModulus`, `avgLossModulus`, `avgDeborahNumber`, and `highElasticFraction`.

## Interpreting output

- **rheologyPhase = NEWTONIAN_FLUID:** Constant viscosity independent of shear rate. Reserves flow predictably and proportionally to applied trade pressure — stress equals viscosity times shear rate with no nonlinear effects. No yield stress, no thixotropy, fast relaxation. This is the ideal LP regime for simple flow-based strategies: fee accumulation is proportional to volume with predictable reserve consumption per unit of trade.
- **rheologyPhase = VISCOELASTIC_SOLID:** Strong elastic component G' > G''. Bins store significant deformation energy elastically and recover after trade pressure subsides. Relaxation is slow (De > 1) and the bin exhibits creep under sustained loading. Good LP regime for moderate trading activity — reserves deform under pressure but bounce back when trades subside, limiting cumulative IL. Watch for creep accumulation in sustained trending markets.
- **rheologyPhase = SHEAR_THINNING:** Viscosity decreases with shear rate. Reserves resist small trades through high apparent viscosity but yield dramatically once flow velocity exceeds the thinning threshold. Moderate thixotropy with yield stress present. Expect non-linear IL profiles — small trades are absorbed without reserve displacement while large trades trigger runaway flow once shear thinning takes effect. Position carefully around the thinning threshold.
- **rheologyPhase = SHEAR_THICKENING:** Viscosity increases with shear rate due to dilatancy. Reserves resist high-frequency and high-velocity trade flows disproportionately — the faster trades arrive, the stiffer the bin becomes. High Weissenberg number under fast flows. Protects against predatory high-frequency flow but flows more freely under sustained low-velocity trade pressure. Good for LPs seeking protection from HFT-style flows.
- **rheologyPhase = BINGHAM_PLASTIC:** Strong yield stress with near-zero flow below the threshold. Reserves effectively locked until minimum trade volume threshold is exceeded, then yield suddenly with high viscosity above threshold. Extreme resistance to small trades — zero reserve deformation and zero IL from micro-trades. Abrupt yielding to large trades above the threshold. Best for LPs who want selective participation in large trades only.
- **rheologyVerdict = IDEAL_VISCOUS_FLOW:** Low viscosity with high creep compliance and low storage modulus. Reserves flow smoothly and predictably. Minimal elastic bounce-back — reserve shifts tend to be permanent but proportional to trade pressure. Consistent fee generation as the bin participates actively in all trade flows. Suitable for active range management where LPs monitor and rebalance regularly.
- **rheologyVerdict = ELASTIC_RECOVERY:** High storage modulus G' dominates over G''. Reserves deform elastically under trade pressure and recover when pressure is released. Impermanent loss is mostly recoverable — the bin "remembers" its equilibrium configuration and returns to it. Ideal for passive LPs seeking low IL with reliable position recovery without constant rebalancing.
- **rheologyVerdict = YIELD_STRESS_BARRIER:** High yield stress with Bingham plastic behavior. Reserves remain locked until a minimum trade volume threshold is met, then yield abruptly. Best for LPs who want selective participation — only capturing fees from large institutional trades while ignoring retail micro-transactions that do not generate meaningful flow.
- **rheologyVerdict = CREEP_DOMINATED:** High creep compliance J with long relaxation time. Reserves slowly and persistently drift under sustained trade pressure even when individual trades are small. Cumulative IL risk accumulates over time from continuous directional creep. Monitor for reserve drift and rebalance proactively when holding positions over extended periods in trending markets.
- **rheologyVerdict = VISCOELASTIC_DAMPER:** Balanced G' and G'' with moderate De. Reserves absorb trade energy through combined elastic and viscous response, acting as a shock absorber. Neither flows too easily nor stores too rigidly. Provides stable LP positioning across a wide range of trade sizes and frequencies — the most versatile rheological profile for broad market participation.
- **avgViscosity > 5:** High flow resistance. Reserves strongly resist trade-driven displacement. Bins are well-protected from small trades but may lag in fee accumulation during low-volume periods.
- **avgViscosity < 1:** Very low viscosity. Reserves flow freely with minimal resistance. Bins accumulate fees efficiently but are exposed to rapid reserve depletion in directional markets.
- **avgStorageModulus > 0.6:** Strongly elastic response. Most reserve deformation is recoverable. IL is largely reversible — expect positions to self-correct after trade shocks.
- **avgLossModulus > 0.6:** Strongly viscous response. Most reserve deformation is permanent. IL accumulates irreversibly — active rebalancing may be required.
- **avgDeborahNumber > 3:** Very elastic at current trading frequency. Relaxation time is much longer than trade frequency — bins appear solid-like and deformations are recoverable between trades.
- **avgDeborahNumber < 0.5:** Very viscous at current trading frequency. Bins flow continuously under trade pressure with fast relaxation — each trade permanently displaces reserves.
- **avgWeissenbergNumber > 2:** Elastic forces dominate viscous forces. Nonlinear elastic effects are significant — expect reserve overshoots and rebounds under large trade flows.
- **avgWeissenbergNumber < 0.5:** Viscous forces dominate. Linear viscous flow — reserves move proportionally to applied stress without elastic rebound.
- **avgYieldStress > 0.6:** Strong yield stress barrier. Small trades do not displace reserves at all. Only large trades above the threshold trigger flow. LP protected from micro-trade IL.
- **avgYieldStress < 0.1:** No meaningful yield stress. All trades, including micro-transactions, immediately displace reserves. Complete participation in all trade sizes.
- **avgThixotropy > 0.5:** Strong time-dependent viscosity reduction. The bin becomes progressively easier to flow as trade pressure is sustained — initial resistance gives way to runaway reserve displacement in sustained directional markets.
- **avgDilatancy > 0.5:** Strong shear-thickening. High-velocity trade flows encounter rapidly increasing viscosity. Protected against sudden large trades that attempt to sweep reserves — the faster the attack, the stiffer the resistance.
- **avgCreepCompliance > 0.5:** High creep risk. Reserves will drift slowly but persistently under sustained one-directional pressure. Monitor positions in trending market conditions.
- **avgRelaxationTime > 0.6:** Slow stress relaxation. Reserve imbalances created by trades persist for a long time before dissipating. Arbitrageur activity may be insufficient to restore balance quickly.
- **highElasticFraction > 0.3:** Many bins have dominant elastic response (G' > G''). Pool-wide elastic character — reserves tend to recover from trade shocks.
- **highElasticFraction < 0.05:** Very few elastic bins. Pool is predominantly viscous — reserve deformations accumulate permanently. Prioritize active rebalancing.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on rheology signals from pools with fewer than 5 populated bins — insufficient data for meaningful rheological characterization.
- Do not assume BINGHAM_PLASTIC means "dead pool." Bingham plastic behavior means high yield stress, not zero activity — large trades above the threshold still generate fees and flow normally.
- Do not assume low viscosity is always better. In trending markets, low-viscosity bins experience rapid reserve depletion as one-sided flow dominates — high viscosity can protect LP capital at the cost of lower fee velocity.
- Do not conflate storage modulus with recovery. G' > G'' indicates elastic character but does not guarantee the position will fully recover — creep accumulates even in elastic materials under sustained loading.
- Rheology analysis is a snapshot. Flow properties change as trade volume shifts, reserve ratios evolve, and neighboring bin configurations change. A NEWTONIAN_FLUID pool can transition to SHEAR_THINNING if reserve concentrations change. Monitor periodically in dynamic markets.
- The Deborah and Weissenberg numbers are dimensionless estimates based on snapshot proxies — treat them as regime indicators rather than precise measurements.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "rheology analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest rheology index as the most complex viscoelastic element — the richest flow behavior with balanced elastic and viscous dynamics.
- Flag bins with highest storage modulus G' as the most elastic — where reserve deformations are most recoverable after trade pressure is released.
- Highlight bins with highest loss modulus G'' as the most viscous dissipators — where trade energy is most permanently converted to IL.
- Show bins with highest yield stress as the strongest reserve barriers — where minimum trade size thresholds are highest.
- Show bins with highest creep compliance as the highest IL drift risk — where sustained directional trading accumulates the most reserve displacement over time.
- For LP agents: in NEWTONIAN_FLUID pools, position broadly — fee accumulation is linear and predictable. In VISCOELASTIC_SOLID pools, prioritize bins with high G' for elastic recovery — set wider ranges. In SHEAR_THINNING pools, concentrate LP near the active bin within the thinning threshold — avoid deep out-of-range positions that may experience runaway flow. In SHEAR_THICKENING pools, prefer bins that benefit from dilatant protection against HFT flows. In BINGHAM_PLASTIC pools, position at bins with yield stress just above the minimum trade size for maximum selective participation.
- For trading agents: IDEAL_VISCOUS_FLOW pools have predictable linear price impact — large trades move reserves proportionally. ELASTIC_RECOVERY pools show price reversion after large trades — impactful trades are partially reversed as elastic recovery restores reserves. YIELD_STRESS_BARRIER pools require large minimum trade size to move the market. CREEP_DOMINATED pools show slowly drifting prices under sustained directional pressure. VISCOELASTIC_DAMPER pools absorb trade impact across a range — most versatile for complex multi-trade strategies.
- Compare rheology indices across pools to find bin lattices with the most favorable flow properties for the intended LP strategy.
