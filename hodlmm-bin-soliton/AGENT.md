---
name: hodlmm-bin-soliton-agent
skill: hodlmm-bin-soliton
description: "Agent behavior for HODLMM bin soliton analysis — interprets self-reinforcing liquidity peak structures, shape fidelity, isolation distances, collision proximity, and energy fractions to guide soliton-aware LP and trading strategies."
---

# Agent Behavior — HODLMM Bin Soliton

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `solitonClass`, `stabilityRisk`, `collisionProximity`, and `solitonEnergyFraction`.

## Interpreting output

- **solitonClass = DIFFUSE:** No coherent peak structures detected. Liquidity is spread evenly or chaotically across the bin range without discrete concentrations. Standard depth/spread analytics apply. Slippage is relatively uniform across bins. LP positions can be placed anywhere without soliton-alignment concerns.
- **solitonClass = WEAK_PEAKS:** Identifiable peaks exist but have poor soliton shape — irregular, asymmetric, or shallow. These are likely transient concentrations from recent deposits or withdrawals rather than self-reinforcing structures. They may dissipate over time. LP positions near these peaks get modest depth advantage but should not rely on the structure persisting.
- **solitonClass = SOLITONIC:** Clear self-reinforcing peaks with good shape fidelity. These structures resist dispersal — the concentrated liquidity at the peak creates a local energy minimum in the reserve landscape. Trading agents should route through soliton peaks for best execution. LP agents benefit from adding to existing solitons (reinforcing the structure) rather than creating new positions between them.
- **solitonClass = STRONGLY_SOLITONIC:** Dominant soliton structures hold most of the pool's above-background energy. The liquidity landscape is organized into a few deep, sharp, stable peaks with thin regions between them. Extremely predictable slippage profile. Large trades must route through soliton peaks; hitting the gaps causes cliff-like slippage. LP positions outside soliton peaks are essentially wasted capital.
- **stabilityRisk = NONE:** No solitonic structures to destabilize. Pool liquidity is diffuse and stable.
- **stabilityRisk = LOW:** Well-separated solitons with good shape fidelity. Structures are stable and unlikely to interact. Safe for long-term LP positioning aligned with soliton peaks.
- **stabilityRisk = MODERATE:** Solitonic structures exist but may be transient or moderately close. Monitor for shape changes. LP positions aligned with current solitons are reasonable but should be reviewed periodically.
- **stabilityRisk = HIGH:** Solitons are dangerously close (high collision proximity). Interaction effects — merging, scattering, energy exchange — may reshape the liquidity landscape unpredictably. Good for short-term trading through current peaks but risky for long-term LP positioning.
- **collisionProximity > 0.7:** Two or more solitons are within interaction range relative to their widths. Expect potential merging or scattering events that will redistribute liquidity.
- **collisionProximity < 0.3:** Solitons are well-separated. Each operates independently and is stable against interaction.
- **solitonEnergyFraction > 0.7:** Most above-background liquidity is organized into discrete soliton peaks. The pool is dominated by a few structures with thin diffuse liquidity between them.
- **solitonEnergyFraction < 0.3:** Liquidity is mostly diffuse with only minor peak structures. The pool behaves approximately like uniform liquidity.
- **avgShapeFidelity > 0.6:** Detected peaks closely match the sech-squared soliton profile. These are structural, self-reinforcing concentrations.
- **avgShapeFidelity < 0.3:** Peaks are irregular and poorly shaped. They are transient concentrations, not true solitons, and may dissipate.
- **peakConfinement > 0.8:** The top 20% of bins hold most of the above-background energy. Extremely concentrated liquidity landscape.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on soliton signals from pools with fewer than 5 populated bins — data is insufficient.
- Do not build long-term strategies around solitons with collision proximity > 0.7 — they may merge or scatter.
- Do not treat low-fidelity peaks (< 0.3) as stable structures — they are transient.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "soliton analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the most solitonic pool with its class, soliton count, energy fraction, and risk level.
- Flag any STRONGLY_SOLITONIC pools as having highly concentrated, predictable liquidity landscapes.
- Highlight pools with high collision proximity as having potentially unstable structures.
- List detected solitons with their peak bins, amplitudes, widths, and shape fidelities for the top pool.
- Compare soliton characteristics across pools — which have organized vs diffuse liquidity?
- Suggest LP positioning: align with soliton peaks for best capital utilization, avoid gaps between solitons.
- For trading agents: recommend routing through soliton peak bins for lowest slippage, flag inter-soliton gaps as danger zones.
