---
name: hodlmm-bin-magnetism-agent
skill: hodlmm-bin-magnetism
description: "Agent behavior for HODLMM bin magnetism analysis — interprets field strength, pole detection, dipole moment, susceptibility, domain structure, and magnetism classifications to assess how the bin lattice attracts or repels liquidity and guide LP positioning decisions."
---

# Agent Behavior — HODLMM Bin Magnetism

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `magnetismClass`, `fieldVerdict`, `dipoleMoment`, and `susceptibility`.

## Interpreting output

- **magnetismClass = FERROMAGNETIC:** Strong coherent magnetic field. Bins work together — high-reserve bins attract further deposits, creating a self-reinforcing loop. The pool has large aligned domains with uniform field strength extending well past the Curie distance. LP positions benefit from collective field strength. New deposits near existing poles will be attracted and retained. This is the most stable magnetic state — resistant to perturbation and easy to predict.
- **magnetismClass = PARAMAGNETIC:** Moderate field with partial alignment. Liquidity is attracted toward poles but the field is not self-reinforcing. Without continued deposits, the field will gradually weaken. LP agents benefit from positioning near existing north poles but should not expect the field to amplify their contribution. Susceptibility is moderate — the landscape can shift under large deposits or withdrawals.
- **magnetismClass = DIAMAGNETIC:** Weak opposing field. The pool has some magnetic structure but it dampens rather than amplifies reserve movements. Deposits are neither strongly attracted nor repelled — the field is passively resistant. LP agents can position freely without worrying about magnetic effects but also won't benefit from collective attraction. Often seen in mature pools with moderate, spread-out liquidity.
- **magnetismClass = ANTIFERROMAGNETIC:** Alternating polarity across the bin lattice. Adjacent bins have opposing field directions, creating local cancellation. The pool has no net attractive force despite having strong individual poles. LP agents should expect their position's local neighborhood to matter more than pool-wide metrics — each domain behaves independently.
- **magnetismClass = DEMAGNETIZED:** No meaningful field structure. Reserve distribution is random with no coherent poles, domains, or gradients. The pool neither attracts nor repels — liquidity placement is entirely up to the LP with no magnetic guidance. Often seen in new pools or pools that recently experienced major liquidity reshuffling.
- **fieldVerdict = STRONG_FIELD:** Coherent field with extended reach. LP positions anywhere in the scan range feel the pool's magnetic attraction. Deposits near north poles are strongly retained. Trading agents can expect consistent depth across the field.
- **fieldVerdict = MODERATE_FIELD:** Functional field with limited reach. LP positions near the active bin benefit from magnetic attraction but edge positions may be beyond the Curie distance and behave independently.
- **fieldVerdict = WEAK_FIELD:** Poles exist but field decays quickly. Only positions very close to the active bin experience meaningful attraction. Edge positions are magnetically isolated.
- **fieldVerdict = SCATTERED_POLES:** Poles exist but field is disorganized. No coherent direction — each pole creates a local field pocket without contributing to a unified pool-wide pattern.
- **fieldVerdict = NO_FIELD:** No significant magnetic structure. The pool is magnetically inert.
- **dipoleMoment > 0.3:** Strong rightward bias. Reserve mass is concentrated above the active bin, suggesting the market or LPs expect upward price movement. LP agents can align with this expectation or position contrarian to capture fee generation if price returns.
- **dipoleMoment < -0.3:** Strong leftward bias. Reserve mass is below the active bin. Similar interpretation in the opposite direction.
- **|dipoleMoment| < 0.05:** Symmetric field. Reserve mass is balanced around the active bin. No directional signal from the magnetic landscape.
- **susceptibility > 1.0:** Highly responsive field. Small reserve changes create large field distortions. The magnetic landscape is unstable — positions may experience rapid polarity shifts. LP agents should expect volatile conditions and avoid thin positions that could be overwhelmed by field fluctuations.
- **susceptibility < 0.2:** Rigid field. The magnetic landscape barely responds to individual deposits or withdrawals. LP agents can rely on the current field structure persisting. But also means their deposit has minimal influence on the overall field.
- **coercivity > 2.0:** Hard magnetic structure. The gap between north and south poles is large, requiring substantial capital to flip polarities. LP agents should work with the existing field rather than trying to reshape it.
- **coercivity < 0.5:** Soft magnetic structure. Polarities are easily flipped. The field is malleable — even moderate deposits can reshape the magnetic landscape. LP agents have more influence on pool structure.
- **curieDistance > 20:** Extended field reach. The pool's magnetic influence covers most of the scan range. Positions far from the active bin still benefit from the pool's attractive structure.
- **curieDistance < 5:** Short field reach. Magnetic influence is confined to the immediate neighborhood of the active bin. Edge positions are in a different magnetic environment than center positions.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on magnetism signals from pools with fewer than 5 populated bins — insufficient data for meaningful field analysis.
- Do not assume FERROMAGNETIC means "deposit here." Strong fields attract liquidity but also concentrate it — high field strength near existing north poles means competition for fees. Evaluate alongside fee generation data.
- Do not assume DEMAGNETIZED means "avoid." New pools start demagnetized and early depositors shape the field. The signal is that no existing magnetic guidance exists, not that the pool is bad.
- Field strength is relative to pool average. Two bins with $1 each show neutral field strength but cannot support real trading. Always check TVL alongside field metrics.
- Dipole moment indicates directional bias of existing reserve mass, not price prediction. LPs positioned their reserves based on their expectations, but they may be wrong.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "magnetism analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest magnetism index as having the strongest coherent field.
- Flag DEMAGNETIZED/ANTIFERROMAGNETIC pools as having no coherent attraction — LP positioning is unconstrained but also unguided.
- Highlight strong dipole moments: they indicate directional market consensus among existing LPs.
- Show susceptibility as stability indicator: high-susceptibility pools are magnetically volatile.
- For LP agents: position near existing north poles to benefit from collective attraction, but check fee competition. Position in neutral zones to establish new poles without fighting existing field structure.
- For trading agents: STRONG_FIELD pools offer consistent depth. SCATTERED_POLES pools may have pockets of deep and shallow liquidity — route trades carefully.
- Compare Curie distances across pools to find the broadest magnetic reach — wider Curie distance means more consistent execution quality across the price range.
