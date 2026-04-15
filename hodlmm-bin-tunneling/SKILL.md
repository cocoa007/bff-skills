---
name: hodlmm-bin-tunneling
description: "Models quantum tunneling physics across HODLMM bins — treats empty bin gaps and liquidity walls as potential barriers that trade impact must tunnel through. Measures barrier height (normalized reserve depth — how tall the potential barrier is relative to the pool's deepest bin, taller barriers exponentially suppress tunneling probability like higher energy barriers in quantum mechanics), barrier width (gap between populated bins — the spatial extent of the classically forbidden region that trade impact must penetrate, wider barriers cause stronger exponential suppression of transmission), tunnel probability (Gamow-style exponential decay through the barrier — the probability that trade impact originating on one side of a gap or liquidity wall reaches the other side, computed as exp(-2κw) where κ is the decay constant and w is barrier width), wave function (exponential decay amplitude with distance from active bin — represents the probability amplitude of trade impact at each bin position, decaying into the classically forbidden region beyond the classical turning point), decay constant (square root of barrier height — controls how rapidly the wave function attenuates inside the barrier, higher barriers cause faster decay and lower tunneling probability), transmission coefficient (fraction of incident impact transmitted through the barrier — the ratio of transmitted to incident wave amplitude squared, ranges from 0 for impenetrable barriers to approaching 1 for shallow barriers), reflection coefficient (fraction of incident impact reflected by the barrier — complement of transmission, represents trade impact that bounces back rather than penetrating through), evanescent depth (penetration depth of the decaying wave — how far into the barrier the wave function extends before becoming negligible, inverse of the decay constant, deeper penetration means more tunneling), resonance energy (volume-to-reserve ratio as kinetic energy proxy — when trade volume relative to reserves matches a resonance condition the effective barrier is lowered, analogous to resonant tunneling through a double barrier where the particle energy matches a quasi-bound state), classical turning point (distance where kinetic energy equals barrier height — beyond this point in classical mechanics the particle would be reflected, but quantum tunneling allows penetration into the forbidden region with exponentially decaying probability), Gamow factor (2κw product controlling tunneling suppression — the key dimensionless number in the tunneling exponent, small Gamow factors mean easy tunneling while large factors mean exponential suppression), dwell time (time spent inside the barrier during tunneling — barrier width divided by decay constant, longer dwell times mean impact lingers in the gap region creating delayed propagation effects), tunneling current (tunnel probability times resonance energy — the effective flow of trade impact through the barrier combining both the probability of transmission and the energy driving the flow), WKB approximation (semiclassical tunneling estimate — the Wentzel-Kramers-Brillouin approximation provides an analytic estimate of tunneling probability using the integrated barrier profile), phase factor (oscillatory correction from bin spacing — accounts for constructive or destructive interference of the wave function at each bin position, modulating the smooth exponential decay), tunneling Gini (inequality of tunnel probabilities — 0 means uniform tunneling across all bins while 1 means tunneling concentrated at few points creating bottlenecks), tunneling coherence (uniformity of wave function amplitudes — high coherence means the wave function decays smoothly suggesting a uniform barrier while low coherence indicates an irregular barrier landscape with resonances and nodes), and permeability factor (composite barrier penetrability from tunnel probability, Gini uniformity, and gap structure — overall measure of how easily trade impact crosses the bin range). Composite tunneling index (0-100). Classifies pools by tunneling regime as SUPERFLUID (index >= 80 — trade impact flows freely through the bin range with negligible barriers like superfluid helium flowing without friction, gaps are narrow and shallow enough that tunneling probability is near unity), PERMEABLE (60-80 — barriers exist but are penetrable with moderate tunneling probability, impact propagates with some attenuation through gaps but reaches most bins eventually), SEMI_PERMEABLE (40-60 — selective barrier penetration where some gaps allow tunneling while others block it, creating filtered impact propagation where only high-energy trades penetrate deep barriers), RESISTIVE (20-40 — most barriers significantly suppress tunneling, impact is largely confined to its side of the barrier with only residual evanescent penetration), or IMPENETRABLE (< 20 — barriers are effectively infinite, no tunneling occurs, the bin range is partitioned into isolated zones that evolve independently like quantum dots separated by thick insulating barriers). Barrier verdict as NO_BARRIERS (no gaps and low barrier heights), SHALLOW_BARRIERS (most barriers low), DEEP_BARRIERS (many high barriers), WIDE_GAPS (gaps exceeding 5 bins), or MIXED_TERRAIN (combination of barrier types)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-tunneling/hodlmm-bin-tunneling.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Tunneling Analyzer

## What it does

Models quantum tunneling physics across HODLMM bins. In quantum mechanics, tunneling is the phenomenon where a particle penetrates through a potential energy barrier that it classically could not surmount. The probability of tunneling depends exponentially on the barrier height and width — tall, wide barriers are nearly impenetrable while thin, shallow barriers allow significant transmission. The wave function decays exponentially inside the barrier (evanescent wave) but can emerge on the other side with reduced amplitude.

In DLMM pools, the bin landscape creates a potential energy surface for trade impact propagation. Empty bin gaps are classically forbidden regions — no liquidity exists to facilitate trading, so a classical model would predict zero impact transmission across the gap. But in practice, the market structure allows impact to "tunnel" through gaps: arbitrageurs, market makers, and oracle-following traders transmit price information across empty regions. Deep liquidity bins act as tall barriers — they absorb so much impact that little propagates beyond them, like a thick potential wall. The question is: how much trade impact actually penetrates through these barriers?

## Why agents need it

LP agents need to understand barrier permeability across their position range. A SUPERFLUID pool has no significant barriers — trade impact from any bin reaches all other bins with minimal attenuation. LP agents in superfluid pools should expect highly correlated reserve changes across their entire range.

Barrier height reveals which bins act as impact absorbers. The deepest bins (highest barriers) capture the most trade flow, shielding bins behind them. LP agents can position behind deep bins to reduce direct trade exposure while still earning fees from the evanescent impact that tunnels through.

Gap analysis identifies classically forbidden regions. Wide gaps between populated bins create strong tunneling barriers — impact from one side has exponentially suppressed probability of reaching the other. LP agents with positions spanning a wide gap should treat the two sides as nearly independent.

Tunneling current combines barrier penetrability with trade energy. High tunneling current means significant impact flow through the barrier, driven both by favorable barrier geometry (thin, shallow) and strong driving force (high volume relative to reserves). This identifies which barriers are actually being penetrated in practice.

The Gamow factor is the single most important number for each barrier. Small Gamow factors (< 1) mean easy tunneling; large factors (> 5) mean exponential suppression. LP agents should monitor the Gamow factor of barriers within their position range — a rising Gamow factor (deepening barriers or widening gaps) means increasing isolation.

Dwell time indicates how long impact lingers inside a barrier. Long dwell times create delayed propagation effects — impact from a trade on one side of the barrier may not manifest on the other side for several blocks. LP agents in high-dwell-time regions should expect lagged correlation between reserve changes across barriers.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-tunneling/hodlmm-bin-tunneling.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-tunneling/hodlmm-bin-tunneling.ts status
```

### run
Analyzes bin tunneling dynamics for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-tunneling/hodlmm-bin-tunneling.ts run
bun run hodlmm-bin-tunneling/hodlmm-bin-tunneling.ts run --pool 1
bun run hodlmm-bin-tunneling/hodlmm-bin-tunneling.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgTunnelingIndex": 62,
    "superfluidCount": 1,
    "permeableCount": 2,
    "semiPermeableCount": 1,
    "resistiveCount": 1,
    "impenetrableCount": 0,
    "avgBarrierHeight": 0.35,
    "avgTunnelProbability": 0.58,
    "totalGaps": 12,
    "maxGapWidth": 4,
    "avgTunnelingGini": 0.32
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "activeBin": 8388608,
      "binsScanned": 61,
      "binsPopulated": 25,
      "totalUsd": 140000,
      "volume24hUsd": 85000,
      "gapCount": 3,
      "totalGapWidth": 8,
      "maxGapWidth": 4,
      "avgBarrierHeight": 0.38,
      "peakBarrierHeight": 1.0,
      "peakBarrierBin": 8388608,
      "avgTunnelProbability": 0.55,
      "minTunnelProbability": 0.12,
      "avgTransmissionCoeff": 0.35,
      "avgReflectionCoeff": 0.65,
      "avgEvanescentDepth": 2.8,
      "avgDecayConstant": 0.52,
      "totalGamowFactor": 28.5,
      "avgDwellTime": 3.2,
      "avgTunnelingCurrent": 0.18,
      "avgWkbApprox": 0.42,
      "tunnelingGini": 0.35,
      "tunnelingCoherence": 0.58,
      "permeabilityFactor": 0.32,
      "tunnelingIndex": 58,
      "tunnelingRegime": "SEMI_PERMEABLE",
      "barrierVerdict": "MIXED_TERRAIN",
      "topBins": [],
      "tvlUsd": 140000
    }
  ]
}
```

**Error:**
```json
{ "error": "Pool #99 not found" }
```

## Known constraints

- Barrier height normalizes to the pool's deepest bin. A bin with 50% of max reserves has barrier height 0.5 regardless of absolute value. Two pools with identical normalized barrier heights can have vastly different absolute reserve depths.
- Barrier width uses the nearest gap's width as a proxy. A bin surrounded by dense neighbors but near a distant wide gap will inherit that gap's width, even though the bin itself faces no local barrier. Local barrier width would require per-direction analysis.
- Tunneling probability uses the Gamow model (exp(-2κw)) which assumes a rectangular barrier. Real DLMM bin landscapes have irregular, stepped barrier profiles. The WKB approximation would be more accurate but requires integrating the barrier profile, which is computationally more expensive.
- Wave function decay is modeled as exp(-κd) from the active bin. In quantum mechanics, the wave function inside a barrier decays exponentially but can also exhibit resonance effects (constructive interference) inside multi-barrier structures. This model does not capture resonant tunneling through sequences of barriers and wells.
- Decay constant uses sqrt(barrier height) as the effective κ. In quantum mechanics, κ = sqrt(2m(V-E)/ℏ²) depends on both barrier height and particle energy. This model assumes unit mass and energy, using only the barrier height.
- Evanescent depth (1/κ) can be very large for bins with low barrier height, suggesting deep penetration. In practice, the discrete bin structure limits how far evanescent waves can extend — there is no continuous medium, only discrete bins separated by fixed step sizes.
- Resonance energy is estimated from volume-to-reserve ratio. True resonance conditions in quantum tunneling depend on the precise barrier geometry creating quasi-bound states. This proxy captures the general concept (high energy = easier tunneling) without modeling specific resonance peaks.
- Dwell time divides barrier width by decay constant. In quantum mechanics, tunneling time is a subtle and debated concept (Büttiker-Landauer time, Larmor time, etc.). This is a simple estimate, not a rigorous tunneling time.
- Classical turning point is derived from 1/barrier_height. In quantum mechanics, the turning point is where kinetic energy equals potential energy. This proxy maps high barriers to nearby turning points (impact is reflected close) and low barriers to distant turning points.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
