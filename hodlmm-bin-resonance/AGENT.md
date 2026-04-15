---
name: hodlmm-bin-resonance-agent
skill: hodlmm-bin-resonance
description: "Agent behavior for HODLMM bin resonance analysis — interprets periodic patterns, harmonic alignment, amplification risk, and phase coherence to guide frequency-aware LP and trading strategies."
---

# Agent Behavior — HODLMM Bin Resonance

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `resonanceClass`, `resonanceRisk`, `dominantPeriod`, and `resonanceAmplification`.

## Interpreting output

- **resonanceClass = APERIODIC:** No detectable periodic structure in bin reserves. Liquidity is distributed chaotically or smoothly without repeating patterns. Standard analytics (depth, spread, concentration) apply without periodic adjustments. Slippage estimation is straightforward.
- **resonanceClass = WEAKLY_PERIODIC:** Faint repeating patterns detected but not dominant. The periodic signal exists but is close to the noise floor. Monitor for strengthening — if new LP deposits follow the pattern, it may intensify. Current positions are not significantly affected.
- **resonanceClass = RESONANT:** Clear periodic structure with detectable harmonic alignment. Reserves repeat at regular intervals, creating predictable thick/thin alternation. LP positions spanning resonant peaks capture more fees; positions in troughs see lower utilization. Trading agents should route through thick bins for lower slippage.
- **resonanceClass = STRONGLY_RESONANT:** Dominant periodic pattern with high amplification and harmonic reinforcement. Extreme concentration at periodic peaks with sparse liquidity between them. High exploitation risk — sophisticated traders can predict exactly where liquidity thins. LP positions must be aligned with the resonant structure or they underperform.
- **resonanceRisk = NONE:** No periodic concentration risk. Safe for direction-agnostic strategies.
- **resonanceRisk = LOW:** Minor periodic patterns that don't significantly affect execution quality. Standard position sizing is adequate.
- **resonanceRisk = MODERATE:** Periodic structure meaningfully affects slippage profiles. Adjust position ranges to align with resonant peaks. Consider periodic slippage in trade sizing.
- **resonanceRisk = HIGH:** Strong harmonic amplification creates dangerous concentration. Trades pushing through periodic troughs encounter cliff-like slippage. LP positions in troughs earn minimal fees. Requires explicit frequency-aware strategy.
- **dominantPeriod:** The bin interval at which reserves repeat most strongly. Period 2 = alternating thick/thin. Period 3 = every 3rd bin is thick. Higher periods mean wider spacing between concentration peaks.
- **harmonicAlignmentScore > 0.5:** Multiple detected periodicities are harmonically related (integer multiples of each other). This creates constructive/destructive interference patterns — some bins get reinforced liquidity from multiple harmonics, others fall into harmonic nulls.
- **resonanceAmplification > 1.5:** Reserves at periodic peak positions are 50%+ higher than the average. Significant concentration effect. > 2.0 indicates extreme periodic concentration.
- **phaseCoherence > 0.7:** The periodic pattern repeats consistently across multiple cycles. High confidence that the pattern is structural, not transient. Strategies can rely on it persisting.
- **phaseCoherence < 0.3:** The periodic pattern is breaking down or drifting. Do not build strategies around it — the pattern may disappear entirely.
- **signalToNoise > 5:** Very clear periodic signal well above random noise. High confidence in detected periodicity.
- **signalToNoise < 2:** Periodic signal is barely above noise. Detected patterns may be artifacts rather than real structure.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on resonance signals from pools with fewer than 5 populated bins — data is insufficient.
- Do not build strategies around patterns with phase coherence < 0.3 — they are likely transient.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "resonance analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the most resonant pool with its class, dominant period, amplification, and risk level.
- Flag any STRONGLY_RESONANT pools as requiring frequency-aware positioning.
- Highlight pools with high harmonic alignment as having constructive/destructive interference patterns.
- List detected harmonics with their periods and quality factors for the most resonant pool.
- Compare resonance characteristics across pools — which are periodic vs chaotic?
- Suggest LP range adjustments: align position boundaries with resonant peaks, avoid placing liquidity in periodic troughs.
- For trading agents: recommend routing through thick (resonant peak) bins and flag thin (trough) bins as high-slippage zones.
