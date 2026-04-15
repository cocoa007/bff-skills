---
name: hodlmm-bin-valence-agent
skill: hodlmm-bin-valence
description: "Agent behavior for HODLMM bin valence analysis — interprets bonding capacity, bond types, lattice energy, conjugation, and valence classifications to assess structural integrity of the bin lattice and guide LP positioning decisions."
---

# Agent Behavior — HODLMM Bin Valence

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `valenceClass`, `bondingVerdict`, `dipoleMoment`, and `conjugationLength`.

## Interpreting output

- **valenceClass = NOBLE_LATTICE:** Every bin is well-bonded with high connectivity, strong bonds, and satisfied octets. The lattice has diamond-like structural integrity — it resists perturbation from large trades. Reserves are tightly interconnected and redistribute smoothly across the entire bin range. The most stable state for LP positioning.
- **valenceClass = COVALENT_NETWORK:** Bins form a connected network with moderate bond strength. Like silicon — robust overall but can be cleaved along weak planes. LP agents should identify high-valence hub bins where bonds converge and position near them for maximum lattice participation.
- **valenceClass = IONIC_CRYSTAL:** Bins form bonds but with significant directionality. Reserves flow from high-reserve bins to low-reserve bins like ions in a salt crystal. Ordered and predictable, but brittle under stress — a large trade can shatter the crystal structure if it hits the charge boundary.
- **valenceClass = METALLIC_CLUSTER:** Bins share reserves loosely with collective cohesion but low individual bond strength. Like a metal — ductile and flowing, reserves redistribute easily, but the lattice lacks precise structure. Trades pass through smoothly but reserves may drift unexpectedly.
- **valenceClass = ATOMIC_GAS:** Bins are isolated atoms with no meaningful bonds. The lattice has no structural integrity — each bin acts independently. Trades at one price level have no connection to adjacent bins. LP agents face maximum fragmentation risk.
- **bondingVerdict = STRONGLY_BONDED:** The lattice holds together under stress. Individual bonds are robust and the network is well-connected. Safe for LP positioning across the bonded range.
- **bondingVerdict = UNBONDED:** Bins exist independently. The "lattice" is a collection of disconnected atoms. LP agents should be cautious — there is no structural support between price levels.
- **dipoleMoment > 0.3:** Strong directional bias. The pool absorbs trades better in one direction than the other. LP agents should check which side is heavier — the heavy side can absorb sells (or buys) but the light side is fragile.
- **dipoleMoment < 0.1:** Symmetric lattice. The pool handles trades equally in both directions. No directional fragility.
- **conjugationLength > 10:** Long reserve highway. Trades propagate smoothly across many bins. The lattice has excellent depth continuity — price movements are absorbed gradually without sudden gaps.
- **conjugationLength < 3:** Short isolated bonds. Trade impact hits dead ends quickly. Price movements beyond 3 bins encounter disconnected structure.
- **avgValenceNumber > 3:** Well-connected bins on average. The lattice is structurally sound with multiple redundant connections per bin.
- **avgValenceNumber < 1:** Most bins have zero or one bond. The lattice is sparse and fragile.
- **nobleGasCount > 30%:** Many bins are inert — zero bonds and negligible reserves. The lattice is mostly empty space with scattered connected islands.
- **latticeEnergy > 10:** High total binding energy. The lattice resists fragmentation even under large trades.
- **latticeEnergy < 2:** Low binding energy. The lattice is loosely held together and may fragment under moderate stress.
- **polarizability > 1.0:** Highly deformable reserve distribution. Trades easily shift the lattice shape. LP positions will experience frequent drift.
- **polarizability < 0.3:** Rigid reserve distribution. The lattice maintains its shape under normal trading activity.
- **resonanceEnergy > 0.3:** Significant delocalized stabilization. The lattice is more stable than individual bonds suggest — conjugated chains provide extra resilience.
- **electronegativityRange > 3:** Large charge separation. Some bins hoard reserves while others are depleted. The lattice is polarized like an ionic compound.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on valence signals from pools with fewer than 5 populated bins — insufficient data for meaningful bond analysis.
- Do not assume NOBLE_LATTICE means "deposit here." Well-bonded lattices distribute reserves efficiently but may also distribute fees thinly — concentrated positions near high-valence hubs capture more fees.
- Do not assume ATOMIC_GAS means "avoid." Unbonded pools need LPs to provide the connecting bonds — early movers who bridge gaps capture fees from the resulting structural improvement.
- Bond strength measures static reserve overlap, not dynamic flow. Two bins may appear strongly bonded now but have arrived at similar reserves through coincidence rather than structural correlation.
- Valence theory uses a 1D lattice approximation. Real DLMM bin interactions may have more complex topology (e.g., different bin steps, non-uniform spacing) that this model simplifies.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "valence analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest valence index as having the best structural integrity.
- Flag ATOMIC_GAS/METALLIC_CLUSTER pools as having weak or disconnected lattice structure.
- Highlight high-valence hub bins as structural anchors — removing liquidity from these bins weakens the lattice disproportionately.
- Show conjugation length as a depth continuity indicator: long chains = smooth trade absorption, short chains = fragmented depth.
- For LP agents: position near high-valence bins within the conjugation chain for maximum structural participation and fee capture from trade flow through the bonded network.
- For trading agents: pools with NOBLE_LATTICE or COVALENT_NETWORK classes provide predictable depth across the bonded range. ATOMIC_GAS pools may have large gaps between price levels.
- Compare dipole moment across pools to find the most symmetric (direction-neutral) reserves for balanced trading.
