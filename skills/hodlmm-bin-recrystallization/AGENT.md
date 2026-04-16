---
name: hodlmm-bin-recrystallization-agent
skill: hodlmm-bin-recrystallization
description: "Agent behavior for HODLMM bin recrystallization analysis — interprets stored energy, dislocation density, JMAK recrystallized fraction, Avrami exponent, nucleation rate, critical strain, grain size, grain growth rate, recrystallization temperature, Zener drag, texture intensity, Hall-Petch strength, cold-work remnant, subgrain size, and abnormal grain growth to identify bins in deformed, nucleating, or fully recrystallized states and guide LP strategies toward strain-free bins with high Hall-Petch strengthening and stable normal grain growth."
---

# Agent Behavior — HODLMM Bin Recrystallization

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `recrystallizationRegime`, `recrystallizationVerdict`, `avgRecrystallizedFraction`, `avgStoredEnergy`, `avgHallPetchStrength`, `avgAbnormalGrainGrowth`, and `recrystallizedBinFraction`.

## Interpreting output

- **recrystallizationRegime = FULLY_RECRYSTALLIZED:** Bins post-transformation with high recrystallized fraction, low stored energy, strong Hall-Petch grain refinement, and stable normal grain growth. Ideal strain-free state. Best for stable LP positions with minimum risk of sudden reorganization.
- **recrystallizationRegime = PARTIALLY_RECRYSTALLIZED:** Mixed new strain-free grains and old cold-worked matrix. Active transformation underway. Suitable for LP positions with transformation-aware monitoring.
- **recrystallizationRegime = NUCLEATING:** New grains forming but most matrix still deformed. Mid-transformation with active nucleation. Position cautiously as bin properties are actively evolving.
- **recrystallizationRegime = DEFORMED:** Cold-worked state with moderate stored energy and low X. Pre-nucleation or stalled. Entry possible but expect reorganization once T_R overcome.
- **recrystallizationRegime = HEAVILY_DEFORMED:** Max stored energy with no nucleation. Below CSR or far below T_R. Primed for sudden recrystallization event when activity spikes — avoid passive LP positions.
- **recrystallizationVerdict = STRAIN_FREE_LATTICE:** High X with active grain growth and low stored energy — ideal recrystallized state. Best for stable LP positions.
- **recrystallizationVerdict = ACTIVE_NUCLEATION:** High nucleation rate with stored energy still present — mid-transformation. Bin properties rapidly evolving.
- **recrystallizationVerdict = COLD_WORKED:** High stored energy with low recrystallized fraction — cold-worked pre-transformation state. Near-threshold risk.
- **recrystallizationVerdict = RECOVERY_DOMINANT:** High subgrain size with low nucleation — recovery stage reducing stored energy without primary recrystallization. Slow reorganization path.
- **recrystallizationVerdict = GRAIN_GROWTH_STAGE:** High grain size with growth rate after full recrystallization. Coarsening stage with weakening Hall-Petch contribution.
- **recrystallizationVerdict = ABNORMAL_GROWTH:** Runaway coarsening from Zener escape. Unstable coarsening mode — few grains consuming many neighbors.
- **recrystallizationVerdict = ZENER_PINNED:** High Zener drag with low nucleation — stalled by second-phase particle pinning. Transformation locked until particles dissolve or drag falls below driving pressure.
- **recrystallizationVerdict = HALL_PETCH_STRONG:** High Hall-Petch strength with fine grains — post-recrystallization strength-optimized state. Excellent balance of recrystallization with fine-grained strengthening.
- **recrystallizationVerdict = TEXTURE_DEVELOPED:** High texture intensity — biased recrystallization orientation from prior deformation. Anisotropic properties.
- **recrystallizationVerdict = RECRYSTALLIZATION_BALANCE:** No extreme indicators. Typical mid-transformation state.
- **avgRecrystallizedFraction > 0.6:** Substantial transformation complete. Mostly strain-free new grains.
- **avgRecrystallizedFraction < 0.3:** Minimal transformation. Mostly deformed cold-worked state.
- **avgStoredEnergy > 0.6:** Heavy cold work accumulated. Near-recrystallization threshold or past it.
- **avgStoredEnergy < 0.3:** Minimal cold work. Strain-free or heavily recovered.
- **avgNucleationRate > 0.5:** Active nucleation forming new grains. Transformation accelerating.
- **avgNucleationRate < 0.2:** Minimal nucleation. Below CSR or sub-T_R or Zener pinned.
- **avgGrainSize > 0.6:** Coarse grains from extended growth. Weakening Hall-Petch contribution.
- **avgGrainSize < 0.3:** Fine grains from rapid nucleation. Strong Hall-Petch strengthening.
- **avgGrainGrowthRate > 0.5:** Active normal grain growth. Coarsening underway.
- **avgHallPetchStrength > 0.6:** Fine grains with substantial strengthening from grain-size refinement.
- **avgHallPetchStrength < 0.3:** Coarse grains or unrecrystallized matrix with weak grain-size contribution.
- **avgZenerDrag > 0.6:** Strong pinning from concentrated second-phase particles. Transformation stalled.
- **avgAbnormalGrainGrowth > 0.5:** Runaway secondary growth. Instability from Zener escape.
- **avgColdWorkRemnant > 0.6:** Mostly unrecrystallized. Still deformed matrix.
- **avgColdWorkRemnant < 0.3:** Mostly transformed. Little deformed matrix remaining.
- **avgTextureIntensity > 0.6:** Strong preferred orientation. Anisotropic properties.
- **avgSubgrainSize > 0.5:** Developed subgrain substructure from recovery.
- **recrystallizedBinFraction > 0.3:** Substantial fraction of bins fully transformed. Mature pool.
- **deformedBinFraction > 0.3:** Many bins in deformed state. Pre-transformation pool.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on recrystallization signals from pools with fewer than 5 populated bins — insufficient data for meaningful analysis.
- Do not assume FULLY_RECRYSTALLIZED is always yield-positive. Post-recrystallization coarse grains have weaker Hall-Petch strengthening; tough does not mean yield-optimal.
- Do not treat recrystallization as reversible within a single transformation event — stored energy is consumed by nucleation + growth, and reversion requires fresh cold work.
- Do not ignore recovery processes below primary recrystallization threshold — recovery reduces stored energy through dislocation rearrangement without producing new grains, delaying or suppressing primary recrystallization.
- Do not conflate HEAVILY_DEFORMED with imminent failure. Deformed bins can remain stable indefinitely if below T_R; transformation requires crossing the activity threshold.
- Do not assume ACTIVE_NUCLEATION is always bad. Nucleation indicates active resetting toward a cleaner state; controlled recrystallization can improve long-term stability.
- Do not ignore Zener drag when evaluating transformation kinetics — high drag can stall recrystallization indefinitely even with sufficient driving pressure.
- Do not assume ABNORMAL_GROWTH is always catastrophic. Abnormal secondary growth can be beneficial for some LP strategies (fewer, larger effective liquidity regions) but is generally destabilizing.
- Do not treat Avrami exponent n as a constant. Real n values shift during transformation due to site saturation, concurrent recovery, and impingement.
- Do not assume Hall-Petch strengthening extends to nanoscale grain sizes — below ~10-30 nm grain-boundary sliding dominates and Hall-Petch reverses (inverse Hall-Petch).
- Do not ignore critical strain below the nucleation threshold — bins below CSR will not nucleate regardless of activity level; they can only recover or remain deformed.
- Do not conflate texture development with mechanical property loss. Textured recrystallization can be favorable for specific trade directions (anisotropic liquidity).
- JMAK kinetics are empirical fits to idealized geometries; real DLMM bins have complex spatial distributions that deviate from JMAK.
- Arrhenius nucleation rate assumes a single Q_n; real DLMM nucleation has distribution of activation energies from heterogeneous sites.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "recrystallization analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest recrystallization index as the one with the healthiest strain-free state — high X, low stored energy, strong Hall-Petch, and stable normal grain growth.
- Flag bins with highest recrystallized fraction as the most transformed — closest to strain-free equilibrium.
- Highlight bins with highest Hall-Petch strength as the most strength-optimized — fine-grained post-recrystallization state.
- Show bins with highest stored energy as the most deformed — primed for transformation when T_R overcome.
- Show bins with highest nucleation rate as the most actively transforming — new grains forming.
- Show bins with highest abnormal grain growth as the most unstable — runaway coarsening from Zener escape.
- Show bins with highest Zener drag as the most pinned — stalled transformation regardless of driving pressure.
- Show bins with highest cold-work remnant as the most unrecrystallized — still deformed matrix.
- For LP agents: in FULLY_RECRYSTALLIZED pools, position confidently — strain-free with Hall-Petch strengthening. In PARTIALLY_RECRYSTALLIZED pools, standard LP with transformation-aware monitoring. In NUCLEATING pools, position cautiously — bin properties actively evolving. In DEFORMED pools, expect transformation once T_R overcome; position with reorganization-tolerant strategies. In HEAVILY_DEFORMED pools, avoid passive LP; tactical entries with tight stops anticipating sudden recrystallization.
- For trading agents: FULLY_RECRYSTALLIZED pools behave predictably — uniform strain-free grains absorb trades with stable response. PARTIALLY_RECRYSTALLIZED pools have mixed response — new-grain regions absorb differently than cold-worked matrix. NUCLEATING pools have rapidly evolving behavior — expect regime changes. DEFORMED pools can suddenly reorganize when driven above T_R — size trades conservatively. HEAVILY_DEFORMED pools can undergo massive recrystallization events under stress — treat as near-critical state.
- Compare recrystallization indices across pools to find bins with the healthiest strain-free state for the intended LP or trading strategy.
