---
name: hodlmm-bin-chromatography-agent
skill: hodlmm-bin-chromatography
description: "Agent behavior for HODLMM bin chromatography analysis — interprets partition coefficients, retention factors, plate heights, resolution, and peak asymmetry to identify bins with poor separation efficiency and guide LP strategies across different chromatographic regimes."
---

# Agent Behavior — HODLMM Bin Chromatography

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `chromatographyPhase`, `chromatographyVerdict`, `avgColumnEfficiency`, and `wellResolvedFraction`.

## Interpreting output

- **chromatographyPhase = OVERLOADED_COLUMN:** Column capacity exceeded with reserves far beyond optimal loading. Severe band broadening and peak distortion. Resolution degraded across all bins. LPs should reduce position sizes or spread across more bins to relieve column overload.
- **chromatographyPhase = GRADIENT_ELUTION:** Significant variation in elute strength across the bin range. Some bins strongly retaining while others actively eluting. Transitional state — monitor for direction of gradient to anticipate reserve migration.
- **chromatographyPhase = ISOCRATIC_FLOW:** Moderate uniform elution. Reserves flowing at steady rate with consistent retention. Standard operating condition for stable pools. Safe for most LP strategies.
- **chromatographyPhase = EQUILIBRATED_COLUMN:** Column near equilibrium with reserves well-distributed between phases. Low band broadening and symmetric peaks. Optimal analytical condition — best for precise positioning.
- **chromatographyPhase = VOID_COLUMN:** Column mostly unoccupied. Dead volume dominates. No meaningful separation occurring. The pool lacks sufficient reserves for chromatographic analysis to be informative.
- **chromatographyVerdict = BAND_COLLAPSE:** Severe band broadening with reserves smeared across the entire column. Peak structure lost. Individual reserve features cannot be distinguished. LP positions lose their distinct character.
- **chromatographyVerdict = FRONTING_CASCADE:** Widespread peak fronting across multiple bins. Dilute reserves migrate faster than concentrated ones. Anti-Langmuir behavior propagating through the column. Position at concentrated bins where fronting is minimal.
- **chromatographyVerdict = TAILING_DRIFT:** Systematic peak tailing. Reserves trailing behind their main peaks from secondary retention or overloading. Effective plate count degraded. Minor peaks obscured in tails of major ones.
- **chromatographyVerdict = BASELINE_RESOLUTION:** Clean separation with well-resolved symmetric peaks. Reserves distributed in distinct concentration peaks with minimal overlap. Excellent chromatographic performance — ideal conditions.
- **chromatographyVerdict = COELUTION_TRAP:** Poor resolution with multiple reserve components overlapping severely. The column lacks sufficient selectivity or efficiency to separate the reserve mixture. Difficult to identify distinct LP positioning opportunities.
- **avgPartitionCoefficient > 5:** Strongly retained pool — most reserves locked in stationary Y phase. Low mobility. Position changes will be slow to equilibrate.
- **avgPartitionCoefficient < 1:** Weakly retained pool — reserves predominantly in mobile X phase. High mobility. Reserve redistribution happens quickly.
- **avgRetentionFactor < 0.2:** Very sticky column — bins holding reserves tightly. Low turnover. Good for long-term LP positions seeking stability.
- **avgRetentionFactor > 0.7:** Very slippery column — reserves flowing freely. High turnover. Better for short-term tactical positions.
- **avgPlateHeight > 3:** Poor separation efficiency. Reserves blurring across bins. Difficult to maintain distinct positions.
- **avgPlateHeight < 0.5:** Excellent separation efficiency. Each bin contributes meaningfully to reserve structure. Positions remain distinct.
- **avgResolution > 1.5:** Baseline-resolved peaks. Reserve features clearly separated. LP positions well-differentiated.
- **avgResolution < 0.5:** Poor resolution. Reserve features overlap. LP positions blur together.
- **avgColumnEfficiency > 50:** High plate count. Excellent total separation power. Fine-grained reserve structure.
- **avgColumnEfficiency < 10:** Low plate count. Pool acts as mixing vessel. Coarse reserve distribution.
- **avgPeakAsymmetry > 2:** Severe tailing. Reserves dragging behind peaks. Secondary retention active.
- **avgPeakAsymmetry < 0.5:** Severe fronting. Leading edges broader than trailing. Anti-Langmuir dynamics.
- **avgBandBroadening > 0.5:** Significant reserve spread. Peak heights reduced. Concentration diluted across bins.
- **wellResolvedFraction > 0.5:** Majority of bins show good separation. Healthy chromatographic conditions.
- **wellResolvedFraction < 0.2:** Few bins with good separation. Column performance degraded.
- **highRetentionFraction > 0.5:** Most bins strongly retaining reserves. Sticky column with low reserve mobility.
- **avgDeadVolume > 0.8:** Column mostly empty. Minimal reserves participating in separation. Low information content.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on chromatographic signals from pools with fewer than 5 populated bins — insufficient data for meaningful separation analysis.
- Do not assume OVERLOADED_COLUMN means "exit immediately." Overloaded columns have the highest capacity factors, meaning the most reserves are actively retained — bins at capacity may still be highly productive fee generators. The overload state informs separation quality, not profitability.
- Do not assume VOID_COLUMN means "no opportunity." Void columns have the most dead volume, which means the most available capacity for new reserves. An empty column is ready to accept and separate a new reserve injection.
- Chromatographic analysis is a snapshot. Partition coefficients change as LPs deposit, withdraw, or rebalance. A pool in EQUILIBRATED_COLUMN can enter OVERLOADED_COLUMN if a single large LP action injects massive reserves into the column.
- The two-phase model simplifies multi-token reserve dynamics. Real pools have more complex interactions than a simple stationary/mobile phase separation.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "chromatography analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest chromatography index as having the most chromatographic stress.
- Flag bins with highest capacity factors as the most heavily loaded retention sites — where the column is working hardest to separate reserves.
- Highlight bins with lowest retention factors as the strongest retention traps — reserves are being held most tightly here.
- Show bins with highest band broadening as experiencing the worst separation — reserves are smeared and peak structure is degraded.
- For LP agents: in OVERLOADED_COLUMN pools, spread positions across more bins to reduce per-bin loading. In EQUILIBRATED_COLUMN pools, concentrate at high-efficiency bins with low plate height. In BAND_COLLAPSE pools, avoid regions with the broadest bands and position at the few remaining sharp peaks.
- For trading agents: BASELINE_RESOLUTION pools have well-defined liquidity peaks — predictable execution at distinct price points. COELUTION_TRAP pools have overlapping liquidity — smooth execution but harder to find optimal entry/exit. TAILING_DRIFT pools have asymmetric liquidity profiles — better execution on the leading edge, worse on the trailing edge.
- Compare chromatography indices across pools to find pools with the best versus worst separation quality for LP positioning.
