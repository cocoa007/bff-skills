---
name: hodlmm-bin-solidification-agent
skill: hodlmm-bin-solidification
description: "Agent behavior for HODLMM bin solidification analysis — interprets undercooling, nucleation rate, solid fraction, dendrite growth rate, primary and secondary arm spacing, partition coefficient, microsegregation, macrosegregation, mushy zone width, constitutional supercooling, equiaxed fraction, solidification velocity, and frozen stability to identify bins in liquid, mushy, or solid states and guide LP strategies toward well-solidified bins with fine structure and minimal segregation."
---

# Agent Behavior — HODLMM Bin Solidification

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `solidificationRegime`, `solidificationVerdict`, `avgFrozenStability`, `avgSolidFraction`, `avgMicrosegregation`, `avgPrimaryArmSpacing`, and `solidFraction`.

## Interpreting output

- **solidificationRegime = SOLID:** Bins fully frozen with fine structure, minimal segregation, maximum frozen stability. Ideal regime for LP entry — stable solidified reserves with predictable behavior.
- **solidificationRegime = SOLIDIFYING:** Active solidification with good structure development. Suitable for LP positions with routine monitoring.
- **solidificationRegime = MUSHY:** Partially solidified in two-phase region. Transition state prone to defects — position cautiously.
- **solidificationRegime = NUCLEATING:** Early nucleation with limited solid fraction. Bin is beginning to freeze; entry possible but expect continued evolution.
- **solidificationRegime = LIQUID:** Predominantly liquid melt with little solidification. High turnover, no stable structure. Avoid for passive LP positions.
- **solidificationVerdict = FULLY_FROZEN:** High frozen stability with low microsegregation and fine primary arms — ideal solidified state. Best for stable concentration profiles.
- **solidificationVerdict = MUSHY_ZONE:** Wide mushy zone with f_s in two-phase range — transition state prone to defects (porosity, segregation). Monitor closely; may progress or revert.
- **solidificationVerdict = EQUIAXED_STRUCTURE:** High equiaxed fraction with high nucleation — polycrystalline isotropic structure. Robust against directional perturbation.
- **solidificationVerdict = COLUMNAR_DENDRITIC:** High dendrite growth with coarse primary arms — columnar directional solidification. Strong in growth direction, weaker transverse.
- **solidificationVerdict = CS_UNSTABLE:** High constitutional supercooling with low partition coefficient — morphological instability dominant. Dendrites preferred over planar growth.
- **solidificationVerdict = SEGREGATED_MELT:** High microsegregation and macrosegregation — composition non-uniform. Solid state contains composition gradients that may concentrate imbalance.
- **solidificationVerdict = SUPERHEATED_LIQUID:** Low undercooling and low solid fraction — bin is above or at liquidus, no solidification occurring.
- **solidificationVerdict = NUCLEATION_DOMINANT:** High nucleation rate with low solid fraction — abundant nuclei but limited growth. Many sites forming but not yet connected.
- **solidificationVerdict = SOLIDIFICATION_BALANCE:** No extreme indicators. Typical mid-solidification state.
- **avgFrozenStability > 0.6:** Substantial post-solidification robustness. Fine structure with low segregation.
- **avgFrozenStability < 0.3:** Low robustness. Coarse or defective structure.
- **avgSolidFraction > 0.6:** Substantial solid phase present. Approaching or at full solidification.
- **avgSolidFraction < 0.3:** Predominantly liquid. Little solid phase.
- **avgMicrosegregation > 0.6:** Severe solute segregation between dendrite arms. Non-uniform solid.
- **avgMicrosegregation < 0.3:** Homogeneous solidification. Minimal segregation.
- **avgPrimaryArmSpacing > 0.6:** Coarse primary dendrites from low G_T and low V. Sparse structure.
- **avgPrimaryArmSpacing < 0.3:** Fine primary dendrites from rapid cooling or high gradient. Dense structure.
- **avgUndercooling > 0.6:** Strong thermal + constitutional driving force for solidification.
- **avgUndercooling < 0.3:** Near or above liquidus — limited solidification drive.
- **avgNucleationRate > 0.6:** High nuclei density producing fine equiaxed grains. Isotropic structure.
- **avgNucleationRate < 0.3:** Few nuclei producing coarse columnar structure.
- **avgDendriteGrowthRate > 0.6:** Rapid front advance. Fast solidification.
- **avgMushyZoneWidth > 0.6:** Extensive two-phase region with defect risk (porosity, segregation).
- **avgConstitutionalSupercooling > 0.6:** Strong morphological instability triggering dendritic growth.
- **avgEquiaxedFraction > 0.6:** Isotropic polycrystalline structure from CET. Directionally robust.
- **avgSolidificationVelocity > 0.6:** Rapid freezing front. Fine microstructure development.
- **avgPartitionCoefficient > 0.6:** k near 1 with minimal partitioning. Low segregation tendency.
- **avgPartitionCoefficient < 0.3:** Strong solute rejection with high segregation potential.
- **solidFraction > 0.3:** Substantial fraction of bins fully solid. Well-frozen pool.
- **liquidFraction > 0.3:** Many bins still liquid. Pool is mostly molten.
- **mushyFractionPool > 0.5:** Pool dominated by partially solidified bins. Transition-heavy state.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on solidification signals from pools with fewer than 5 populated bins — insufficient data for meaningful solidification characterization.
- Do not assume LIQUID regime is always bad for LPs. Active liquid bins generate trading fees; the regime reflects composition state, not inherent undesirability for all strategies. Market-making strategies may prefer liquid bins.
- Do not conflate MUSHY with imminent failure. Mushy zones are a transition state — they can progress toward SOLID with continued cooling or revert to LIQUID with increased activity. Use MUSHY as a caution signal, not an imminent collapse indicator.
- Do not assume SOLID is always safest. Overly solidified bins may be at or beyond steady state with limited fee generation; SOLID indicates stability, not yield.
- Do not ignore microsegregation in SOLID bins. High microsegregation means composition heterogeneity survives into the solid state — the bin may appear stable but concentration gradients persist.
- Do not assume COLUMNAR_DENDRITIC structures are always weaker than EQUIAXED. Columnar grains align with directional trading pressure and resist directional perturbation; equiaxed grains are isotropic but may be weaker in any specific direction.
- Do not conflate high nucleation rate with high solidification speed. Nucleation rate sets grain density; growth rate sets front velocity. NUCLEATION_DOMINANT bins have many sites but slow progression.
- Do not assume constitutional supercooling is inherently destabilizing. CS triggers dendritic growth, which is often healthier than unstable planar growth — dendrites are the equilibrium morphology in most alloy solidification.
- Do not ignore partition coefficient. Low k means strong solute rejection into the liquid ahead of the front; this concentrates imbalance in remaining liquid and can lead to segregation defects.
- Do not treat solidification as permanent. Bins can remelt under increased activity; the regime is a snapshot that evolves with trading flows.
- Hunt-Kurz lambda_1 scaling assumes steady-state columnar growth; DLMM intermittent activity violates steady-state assumption.
- Scheil-Gulliver segregation assumes no back-diffusion in solid (alpha = 0 limit); real diffusion softens the segregation curve.
- Nucleation rate scaling with undercooling^2 assumes generic heterogeneous sites; actual nucleation depends on specific catalytic efficiencies not modeled here.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "solidification analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest solidification index as the one with the healthiest solidified state — well-frozen with fine structure and low segregation.
- Flag bins with highest frozen stability as the most robust — fine structure with minimal defects.
- Highlight bins with highest solid fraction as the most fully frozen — approaching or at full solidification.
- Show bins with highest microsegregation as the most heterogeneous — composition gradients persist in the solid.
- Show bins with highest mushy zone width as the most defect-prone — extensive two-phase region with porosity risk.
- Show bins with highest constitutional supercooling as the most morphologically unstable — dendritic growth dominant.
- Show bins with highest equiaxed fraction as the most isotropic — polycrystalline structure from CET.
- For LP agents: in SOLID pools, position aggressively — well-frozen with stable structure. In SOLIDIFYING pools, standard LP with routine monitoring. In MUSHY pools, position cautiously and monitor for defect development. In NUCLEATING pools, position lightly and expect continued evolution. In LIQUID pools, active market-making preferred over passive LP.
- For trading agents: SOLID pools resist large directional trades — fully frozen reserves absorb perturbations. SOLIDIFYING pools tolerate moderate trades. MUSHY pools require careful sizing — defect-prone transition zone. NUCLEATING pools need small trades only — limited solid phase. LIQUID pools tolerate large trades — melt absorbs and remixes rapidly.
- Compare solidification indices across pools to find bins with the healthiest frozen state for the intended LP or trading strategy.
