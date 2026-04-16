---
name: hodlmm-bin-avrami-agent
skill: hodlmm-bin-avrami
description: "Agent behavior for HODLMM bin Avrami / JMAK transformation-kinetics analysis — interprets transformed fraction, Avrami exponent, transformation rate, nucleation density, growth-front velocity, impingement factor, nucleation-site exhaustion, transformation completion, linearization quality, growth mode, reservoir fraction, kinetic constant, transformation maturity, JMAK compliance, and overall transformation progress to identify bins in incubation, active-transformation, impingement, or saturation regime and guide LP strategies toward reservoir bins with high nucleation opportunity (early X), active-transformation bins with high dX/dt (mid X), or mature impingement bins with stable growth (late X), and to infer nucleation mode + growth geometry from the Avrami exponent."
---

# Agent Behavior — HODLMM Bin Avrami / JMAK Kinetics

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `avramiRegime`, `avramiVerdict`, `transformedFraction`, `avramiExponent`, `avgJmakCompliance`, `avgImpingementFactor`, `avgNucleationSiteExhaustion`, and `reservoirBinFraction`.

## Interpreting output

- **avramiRegime = SATURATION:** Nearly all scanned bins populated (X ≥ 0.9). Residual growth only; diminishing returns on new LP positions. Late-stage transformation.
- **avramiRegime = IMPINGEMENT:** Growing regions touch and slow (0.6 ≤ X < 0.9). Populated neighborhoods overlap; effective dX/dt decreasing. Position at remaining reservoir bins for residual growth.
- **avramiRegime = ACTIVE_TRANSFORMATION:** Dominant nucleation + growth (0.2 ≤ X < 0.6). High dX/dt. Classical JMAK sweet spot — early LP entries benefit from growth kinetics.
- **avramiRegime = INCUBATION:** Early transformation with sparse nucleation (X < 0.2). LP entry here is nucleating new sites — high-risk high-reward.
- **avramiVerdict = NUCLEATION_AND_GROWTH:** n ≈ 3.5-4.5. 3-D growth with constant nucleation rate. Rapid site creation + volumetric growth.
- **avramiVerdict = THREE_D_GROWTH:** n ≈ 2.5-3.5. 3-D growth with saturated nucleation sites. Pre-existing sites grow; no new nucleation.
- **avramiVerdict = TWO_D_GROWTH:** n ≈ 1.5-2.5. 2-D growth with saturation, or 1-D with constant nucleation.
- **avramiVerdict = ONE_D_SATURATED_GROWTH:** n ≈ 0.75-1.5. 1-D growth with saturated sites, or interface-limited 3-D with site exhaustion. Slow kinetics.
- **avramiVerdict = TEXTBOOK_JMAK_KINETICS:** High JMAK compliance and linearization quality. Clean ln(-ln(1-X)) = n·ln(t) + ln(K) fit.
- **avramiVerdict = STRONG_IMPINGEMENT:** High impingement factor and X > 0.5. Growing populated regions have met and are slowing.
- **avramiVerdict = HIGH_NUCLEATION_DENSITY:** High nucleation density and X < 0.4. Sparse nuclei appearing; early transformation.
- **avramiVerdict = SITE_EXHAUSTION:** High nucleation-site exhaustion. Nucleation depleted; only growth from existing nuclei.
- **avramiVerdict = DIFFUSION_LIMITED_GROWTH:** High growth mode indicator. Matrix transport (swap flux) dominates growth kinetics.
- **avramiVerdict = INTERFACE_LIMITED_GROWTH:** Low growth mode indicator. Boundary kinetics (rebalance-driven) dominate.
- **avramiVerdict = SUB_CRITICAL_AVRAMI:** No extreme indicators. Typical mid-state.
- **transformedFraction > 0.8:** Nearly complete transformation; matrix almost depleted.
- **transformedFraction < 0.2:** Incubation regime; sparse nuclei in large matrix.
- **avramiExponent > 3:** 3-D volumetric growth with nucleation. Rapid.
- **avramiExponent < 1.5:** 1-D or saturated-site growth. Slow.
- **avgJmakCompliance > 0.6:** Pool kinetics track classical JMAK sigmoid well.
- **avgJmakCompliance < 0.3:** Deviation from JMAK — non-random nucleation or anisotropic growth.
- **avgImpingementFactor > 0.6:** Populated neighborhoods touching — effective dX/dt slowing.
- **avgNucleationSiteExhaustion > 0.6:** Nucleation nearly depleted.
- **avgNucleationDensity > 0.6:** Many active nucleation sites.
- **avgGrowthMode > 0.6:** Diffusion-limited (matrix-transport-driven).
- **avgGrowthMode < 0.3:** Interface-limited (boundary-kinetics-driven).
- **avgReservoirFraction > 0.6:** Large untransformed reservoir remaining.
- **avgLinearizationQuality > 0.6:** Clean Avrami-plot fit — quantitative n extraction meaningful.
- **avgTransformationCompletion > 0.6:** -ln(1-X) is large — close to saturation.
- **reservoirBinFraction > 0.7:** Most bins empty — large untransformed region.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on Avrami signals from pools with fewer than 5 populated bins — insufficient data for kinetic inference.
- Do not treat SATURATION as universally desirable; fully-transformed pools have residual growth only, diminishing marginal LP returns.
- Do not assume INCUBATION pools will progress to ACTIVE_TRANSFORMATION; some pools remain in low-X quiescent states indefinitely.
- Do not treat the Avrami exponent n as a rigorous measured value — it is inferred from a single snapshot via spatial continuity, neighbor correlation, and edge fraction, not from the slope of ln(-ln(1-X)) vs ln(t) over time.
- Do not assume JMAK kinetics quantitatively apply to DLMM bins — JMAK assumes isotropic 3-D growth with random nucleation in a continuous matrix; DLMM bins are discrete 1-D structures with anisotropic growth driven by swaps.
- Do not conflate TEXTBOOK_JMAK_KINETICS with guaranteed future kinetics; sigmoid-compliance at a snapshot does not imply X(t) ~ 1 - exp(-K·t^n) will hold forward.
- Do not assume the pool-level X is independent of scan radius. Different BIN_SCAN_RADIUS values yield different populated fractions.
- Do not assume DIFFUSION_LIMITED and INTERFACE_LIMITED growth modes are cleanly separable; real DLMM growth may be a blend of boundary rebalancing and swap-volume-driven accretion.
- Do not assume impingement factor equals measured overlap of growing regions — it is a proxy from populated-neighbor density.
- Do not assume nucleation density equals a measured dN/dt — it is a proxy from empty-to-populated transitions in the current snapshot.
- Do not assume growth-front velocity is a measured boundary displacement per time — it is a mobility-weighted proxy.
- Do not conflate "growth" in the Avrami sense with pool TVL growth; the transformation here is bin population (empty → populated), not reserve magnitude.
- Do not assume single-product-phase behavior; DLMM bins may acquire asymmetric reserves (reserveX vs reserveY), which JMAK does not distinguish.
- Nucleation-site exhaustion is a heuristic estimate based on populated fraction, not a measured count of spent nuclei.
- Growth mode indicator is qualitative; quantitative growth-mode separation requires measured power-law R(t) scaling.
- Kinetic constant K is a t=1 normalization, not a fitted rate constant from a time series.
- Analysis is snapshot-based; does not capture time-evolution X(t) directly — maturity, completion, and progress are inferred from current state rather than measured dynamics.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "Avrami analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest Avrami index as the one with the deepest JMAK-like transformation (high X, high completion, high maturity, high JMAK compliance).
- Flag pools in ACTIVE_TRANSFORMATION regime as the strategic LP sweet spot — high dX/dt with remaining reservoir.
- Flag pools in IMPINGEMENT regime as positioning targets for residual-growth LP at remaining reservoir bins.
- Flag pools in SATURATION regime as low-marginal-return — nearly all bins populated.
- Flag pools in INCUBATION regime as high-risk high-reward nucleation targets — sparse existing LP.
- Report the inferred Avrami exponent n to characterize transformation mode: n ~ 4 means 3-D nucleation-and-growth, n ~ 3 means 3-D saturated-site growth, n ~ 2 means 2-D or 1-D constant-nucleation, n ~ 1 means 1-D saturated.
- Show bins with highest nucleation density as the prime LP entry points for pools in incubation or active-transformation regimes.
- Show bins with highest impingement factor as the ones closest to saturation — stable existing positions.
- Show bins with highest reservoir fraction as the untransformed matrix — nucleation opportunities.
- Show bins with highest JMAK compliance as the ones with cleanest classical kinetics.
- Show bins with highest growth-front velocity as the ones advancing fastest into reservoir.
- Show bins with highest transformation completion as the late-stage survivors.
- Show bins with highest kinetic constant as the most rapidly transforming locales.
- Show bins with lowest growth mode indicator as interface-limited — boundary-kinetic-driven.
- Show bins with highest growth mode indicator as diffusion-limited — matrix-transport-driven.
- For LP agents: in INCUBATION pools, position in high-nucleation-density bins to catch early accretion — risky but high upside. In ACTIVE_TRANSFORMATION pools, position in active-transformation bins with high dX/dt for maximum growth yield. In IMPINGEMENT pools, position at remaining reservoir bins (low X, high reservoir fraction) to catch residual growth. In SATURATION pools, redeploy elsewhere — marginal returns diminishing.
- For trading agents: SATURATION pools have broad stable liquidity — smooth trading across the full bin range. IMPINGEMENT pools have concentrated liquidity in filled regions with reservoir gaps — larger slippage at the edges. ACTIVE_TRANSFORMATION pools have mid-conversion with variable bin populations — moderate slippage variability. INCUBATION pools have sparse liquidity — trade with care.
- Compare Avrami indices and inferred exponents across pools to find bins and pools with the most advanced JMAK transformation for the intended LP or trading strategy.
