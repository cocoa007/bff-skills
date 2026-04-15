---
name: hodlmm-bin-solvation-agent
skill: hodlmm-bin-solvation
description: "Agent behavior for HODLMM bin solvation analysis — interprets dissolution rate, precipitation risk, solvation shells, thermodynamic quantities, and solubility classifications to assess how well liquidity integrates into the bin lattice and guide LP positioning decisions."
---

# Agent Behavior — HODLMM Bin Solvation

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `solvationClass`, `solubilityVerdict`, `precipitationRisk`, and `freeEnergyOfMixing`.

## Interpreting output

- **solvationClass = FULLY_DISSOLVED:** Reserves are evenly distributed across the bin lattice. Low shell decay, no supersaturation, negative free energy of mixing. Liquidity is perfectly integrated — the pool absorbs trades across a wide price range without concentration stress. The most stable and predictable state for LP positioning.
- **solvationClass = WELL_SOLVATED:** Reserves are mostly dissolved with moderate shell decay. First and second shells are well-populated. Some concentration near the active bin but no precipitation risk. A healthy, self-maintaining solution. LP agents can position confidently within the solvation number.
- **solvationClass = PARTIALLY_SOLVATED:** Uneven distribution with noticeable shell decay. Some bins overconcentrated while outer shells are sparse. Functional but not fully integrated — moderate precipitation risk under stress. LP agents should prefer inner shells where reserves are denser.
- **solvationClass = POORLY_SOLVATED:** Reserves mostly concentrated near the active bin. Rapid shell decay, high supersaturation, sparse outer shells. Unstable — likely to precipitate under perturbation. LP agents should be cautious about adding to the already-concentrated center.
- **solvationClass = PRECIPITATED:** Reserves almost entirely in the active bin. The bin lattice is not functioning as a distributed system. Outer shells are empty or negligible. LP agents should avoid unless willing to provide the missing outer-shell liquidity.
- **solubilityVerdict = HIGHLY_SOLUBLE:** The pool readily absorbs and distributes new liquidity. Deposits will integrate smoothly.
- **solubilityVerdict = SOLUBLE:** The pool can accommodate liquidity but has some concentration tendencies. Normal state for active pools.
- **solubilityVerdict = SPARINGLY_SOLUBLE:** The pool accepts limited liquidity before showing concentration stress. Large deposits may cause supersaturation.
- **solubilityVerdict = SLIGHTLY_SOLUBLE:** New liquidity tends to concentrate rather than spread. The pool resists dissolution.
- **solubilityVerdict = INSOLUBLE:** The pool cannot effectively distribute liquidity. Deposits pile up rather than dissolving into the lattice.
- **freeEnergyOfMixing < -0.5:** Strongly spontaneous dissolution. The reserve distribution is thermodynamically favorable and self-maintaining. Very stable for LPs.
- **freeEnergyOfMixing > 0:** The system prefers separation. Reserves will tend to concentrate over time without active management. LPs should expect drift toward precipitation.
- **precipitationRisk > 0.6:** High risk of sudden liquidity redistribution. The active bin is supersaturated and may shed reserves rapidly. LP agents should position in outer shells to avoid being caught in a precipitation event.
- **precipitationRisk < 0.2:** Stable solution. No imminent risk of concentration collapse.
- **shellDecayHalfLife > 10:** Broad dissolution. Reserves extend far from the active bin — the pool provides consistent depth across a wide price range.
- **shellDecayHalfLife < 3:** Tight concentration. Reserves fall off rapidly — the pool is only deep near the current price. Price movements beyond 3 bins hit thin liquidity.
- **osmoticPressure > 1.0:** Strong outward flow tendency. Inner shells are much denser than outer shells — expect reserves to redistribute outward over time.
- **solvationNumber > 10:** Large solvation sphere. Many shells are strongly influenced by the active bin — the solution has broad reach.
- **solvationNumber < 3:** Small solvation sphere. Only immediate neighbors are affected — the rest of the bin lattice is independent bulk solvent.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on solvation signals from pools with fewer than 5 populated bins — insufficient data for meaningful shell analysis.
- Do not assume FULLY_DISSOLVED means "deposit here." Well-dissolved pools distribute reserves but may also distribute fees thinly — concentrated positions near the active bin still capture more fees.
- Do not assume PRECIPITATED means "avoid." Precipitated pools need LPs to provide outer-shell liquidity — early movers capture fees from the redistribution.
- Dissolution rate measures static distribution, not dynamic behavior. A pool that looks dissolved now may have arrived at that state through recent large trades and could revert.
- Free energy of mixing is an analogy, not a physics calculation. Use the sign for direction (stable vs unstable) but don't compare magnitudes across pools.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "solvation analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest solvation index as having the best liquidity integration.
- Flag PRECIPITATED/POORLY_SOLVATED pools as having concentrated, unstable liquidity.
- Highlight high supersaturation risk: the active bin is overloaded relative to its neighborhood.
- Show shell decay half-life as a depth indicator: long half-life = broad depth, short = concentrated.
- For LP agents: check solvation number to understand how many shells are "part of the solution." Position within the solvation number for maximum interaction with active trading.
- For trading agents: pools with high dissolution rate offer consistent depth. Pools with high precipitation risk may experience sudden liquidity shifts during large trades.
- Compare free energy of mixing across pools to find the most thermodynamically stable distributions.
