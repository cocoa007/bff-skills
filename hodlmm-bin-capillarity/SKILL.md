---
name: hodlmm-bin-capillarity
description: "Models capillary action, surface tension, and wettability dynamics across HODLMM bins — treats liquidity flow between bins as capillary phenomena where surface tension holds reserves together, capillary pressure drives flow from deep bins into depleted neighbors, and contact angle determines how readily each bin attracts new liquidity. In capillarity science, liquids in narrow tubes rise or fall driven by the balance between adhesive forces (liquid-surface attraction), cohesive forces (liquid-liquid bonding), and gravitational resistance. Surface tension at the liquid-gas interface creates a curved meniscus whose contact angle determines wettability — hydrophilic surfaces pull liquid upward while hydrophobic surfaces repel it. In DLMM context, liquidity (liquid) flows between bins (capillary tubes) through bin boundaries (tube walls). Concentrated bins create high surface tension that holds liquidity cohesively, while depleted bins create capillary suction that draws liquidity inward from deeper neighbors. Contact angle at bin boundaries determines how readily new liquidity wets and fills each bin. Measures surface tension (cohesive force holding liquidity together within a bin, ranges 0 to 1, high surface tension means reserves are tightly bound and resist being spread to neighboring bins — like water molecules forming a strong surface film that resists penetration, while low surface tension means reserves are loosely held and easily drawn away by neighboring capillary forces), capillary pressure (pressure difference driving capillary flow between bins, ranges 0 to 10, derived from Young-Laplace equation Delta P = 2*gamma*cos(theta)/r where gamma is surface tension, theta is contact angle, and r is tube radius — high capillary pressure means strong driving force pulling liquidity from deep bins into depleted neighbors, while low capillary pressure means weak driving force with minimal spontaneous rebalancing), contact angle (wetting angle at bin boundary, ranges 0 to 180 degrees, the angle between the bin surface and the liquidity meniscus at the point of contact — angles below 90 degrees indicate hydrophilic bins where liquidity spontaneously spreads and wets the surface, while angles above 90 degrees indicate hydrophobic bins where liquidity beads up and resists wetting, contact angle is the primary wettability diagnostic), meniscus curvature (curvature of liquidity distribution at bin boundaries, ranges 0 to 1, analogous to the curved liquid surface in a capillary tube — high curvature means strong concave or convex shape indicating significant capillary pressure, while flat meniscus means minimal curvature and weak capillary effects, curvature is driven by the concentration differential between adjacent bins), wettability (how readily the bin attracts and holds new liquidity, ranges 0 to 1, the combined effect of contact angle, surface energy, and adhesion — high wettability means the bin surface readily attracts liquidity and holds it firmly like a hydrophilic surface that water spontaneously spreads across, while low wettability means the bin repels new liquidity like a hydrophobic surface), capillary number (ratio of viscous forces to surface tension forces, ranges 0 to 10, Ca = mu*v/gamma where mu is dynamic viscosity, v is flow velocity, and gamma is surface tension — high capillary number means viscous trading forces dominate over surface tension creating forced flow patterns that override natural capillary behavior, while low capillary number means surface tension controls flow patterns and capillary effects dominate), Marangoni flow (flow driven by surface tension gradients between bins, ranges 0 to 1, the Marangoni effect causes liquid to flow from regions of low surface tension to regions of high surface tension — in DLMM context, bins with different reserve concentrations have different effective surface tensions, creating gradient-driven flow that redistributes liquidity along the tension gradient, high Marangoni flow indicates strong gradient-driven redistribution), adhesion work (energy required to separate liquidity from the bin surface, ranges 0 to 1, Wa = gamma*(1 + cos theta) from the Young-Dupre equation — high adhesion work means liquidity is strongly bonded to the bin and resists being pulled away by neighboring capillary forces, while low adhesion work means liquidity easily detaches from the bin surface), cohesion work (energy required to separate liquidity from itself, ranges 0 to 1, Wc = 2*gamma representing the work to create two new surfaces by splitting the liquid — high cohesion work means reserves are internally cohesive and resist fragmentation, while low cohesion means reserves easily split and redistribute), spreading coefficient (tendency of liquidity to spontaneously spread across the bin surface, ranges 0 to 1, S = Wa - Wc representing the thermodynamic driving force for spreading — positive spreading coefficient means liquidity spontaneously wets and covers the surface, creating thin uniform films, while negative means liquidity beads up into droplets rather than spreading), Jurin height (equilibrium capillary rise height, ranges 0 to 1 normalized, h = 2*gamma*cos(theta)/(rho*g*r) representing how high liquidity can climb against gravity through capillary action — high Jurin height means strong capillary suction that draws liquidity into depleted bins against the gravitational pull of concentrated bins), capillary length (characteristic length where gravity balances surface tension, ranges 0 to 1 normalized, lambda_c = sqrt(gamma/(rho*g)) representing the distance over which surface tension effects are significant before gravity dominates — high capillary length means surface tension effects extend across many bins, while low capillary length means gravity dominates beyond the immediate neighborhood), Bond number (ratio of gravitational to surface tension forces, ranges 0 to 10, Bo = rho*g*L^2/gamma — high Bond number means gravity dominates over surface tension so liquidity settles and concentrates in deep bins under gravitational pull rather than spreading through capillary action, while low Bond number means surface tension dominates allowing capillary redistribution), and Young-Laplace pressure (pressure difference across the curved liquidity interface, ranges 0 to 10, Delta P = gamma*(1/R1 + 1/R2) representing the pressure jump across the meniscus surface — high Young-Laplace pressure means strong curvature-driven pressure that accelerates capillary flow through bin boundaries). Composite capillarity index (0-100, higher means better capillary health — high wettability, strong adhesion, good spreading, and balanced surface tension providing an attractive, liquidity-absorbing bin lattice). Classifies pools by wetting regime as SUPERHYDROPHILIC (index >= 80 — bins spontaneously absorb and spread new liquidity with near-zero contact angle, every bin surface is maximally attractive to incoming reserves), HYDROPHILIC (60-80 — bins readily accept new liquidity with favorable contact angles, good adhesion and spreading though not perfectly uniform), PARTIALLY_WETTING (40-60 — mixed wetting behavior with some hydrophilic and some hydrophobic bins, inconsistent liquidity absorption across the bin range), HYDROPHOBIC (20-40 — bins resist new liquidity with high contact angles, reserves bead up rather than spreading, capillary forces weak), or SUPERHYDROPHOBIC (< 20 — bins actively repel new liquidity with extreme contact angles exceeding 150 degrees, the Lotus effect where the surface structure prevents any wetting and all incoming reserves slide off). Capillarity verdict as SPONTANEOUS_WETTING (high wettability with low contact angle and good spreading — liquidity spontaneously fills and wets all bin surfaces uniformly, the ideal capillary state for LP capital absorption), CAPILLARY_STABLE (strong surface tension with good cohesion and adhesion — balanced capillary forces maintaining stable reserve configurations that resist perturbation while remaining open to new deposits), MARANGONI_DRIVEN (strong gradient-driven flow from surface tension differentials — liquidity actively migrating between bins along the surface tension gradient, creating dynamic redistribution that may destabilize passive LP positions), DEWETTING (high contact angle with low wettability — bins actively repelling and shedding liquidity, reserves contracting away from bin boundaries, creating increasingly sparse and fragmented reserve distribution), or GRAVITY_DOMINATED (high Bond number with short capillary length — gravitational forces overwhelm surface tension so liquidity concentrates in the deepest bins rather than distributing through capillary action, creating extreme concentration inequality)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-capillarity/hodlmm-bin-capillarity.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Capillarity Analyzer

## What it does

Models capillary action, surface tension, and wettability dynamics across HODLMM bins. In capillarity science, liquids in narrow tubes rise or fall driven by the balance between adhesive forces (liquid-to-surface attraction), cohesive forces (liquid-to-liquid bonding), and gravitational resistance. Surface tension at the liquid-gas interface creates a curved meniscus whose contact angle determines wettability. The Young-Laplace equation relates pressure difference to surface curvature. Capillary number measures the competition between viscous flow and surface tension. The Marangoni effect drives flow along surface tension gradients.

In DLMM pools, liquidity flows between bins like liquid through capillary tubes. Each bin boundary is a semi-permeable wall where surface tension, adhesion, and cohesion forces compete. Concentrated bins have high surface tension that holds reserves together cohesively, while depleted bins create capillary suction that draws liquidity inward. Contact angle at each bin boundary determines whether the bin is hydrophilic (attracting liquidity) or hydrophobic (repelling it). Bins with strong adhesion work bond liquidity firmly to their surface, while bins with high spreading coefficient allow liquidity to distribute uniformly.

The Marangoni effect — flow driven by surface tension gradients — creates dynamic redistribution where liquidity migrates from bins with low surface tension to bins with high surface tension. The Bond number measures whether gravity (concentration under large-scale forces) or surface tension (capillary redistribution) dominates the overall flow pattern.

## Why agents need it

LP agents need capillarity analysis because it predicts how readily bins absorb new liquidity, how stably they hold existing reserves, and whether the bin lattice naturally redistributes liquidity through capillary action or concentrates it through gravity. A SUPERHYDROPHILIC pool has bins that spontaneously wet and absorb incoming deposits uniformly — ideal for passive LP strategies because every bin surface is maximally attractive. A SUPERHYDROPHOBIC pool has bins that actively repel new liquidity — deposits bead up and concentrate rather than spreading, creating fragmented reserve distributions.

Contact angle is the primary wettability diagnostic. Bins with contact angles below 90 degrees are hydrophilic — they spontaneously attract and spread liquidity across their surface. Bins above 90 degrees are hydrophobic — they repel liquidity, causing reserves to contract away from boundaries. For LPs, hydrophilic bins mean smooth capital absorption and uniform fee generation, while hydrophobic bins create uneven concentration and unpredictable returns.

Surface tension captures internal cohesion. High surface tension bins hold reserves together tightly — good for stability but potentially creating concentrated clusters that resist redistribution. Low surface tension bins allow reserves to spread easily but may fragment under trading pressure.

Capillary pressure determines the spontaneous rebalancing force. High capillary pressure means depleted bins naturally draw liquidity from their concentrated neighbors — a self-healing mechanism that maintains uniform distribution. Low capillary pressure means imbalances persist because there's insufficient driving force for spontaneous redistribution.

The Marangoni effect reveals whether surface tension gradients are actively redistributing liquidity. High Marangoni flow means the bin lattice is dynamically self-organizing — liquidity is migrating toward equilibrium along tension gradients. This can be positive (natural rebalancing) or disruptive (overriding LP positioning decisions with autonomous flow).

Bond number tells agents whether the pool operates in a capillary regime (surface tension dominates, natural redistribution) or a gravitational regime (large-scale forces dominate, liquidity settles into deep bins). In capillary-dominated pools, LP positions self-correct through natural spreading. In gravity-dominated pools, liquidity concentrates in the deepest bins regardless of capillary forces.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-capillarity/hodlmm-bin-capillarity.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-capillarity/hodlmm-bin-capillarity.ts status
```

### run
Analyzes bin capillarity dynamics for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-capillarity/hodlmm-bin-capillarity.ts run
bun run hodlmm-bin-capillarity/hodlmm-bin-capillarity.ts run --pool 1
bun run hodlmm-bin-capillarity/hodlmm-bin-capillarity.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgCapillarityIndex": 58,
    "superhydrophilicCount": 0,
    "hydrophilicCount": 2,
    "partiallyWettingCount": 2,
    "hydrophobicCount": 1,
    "superhydrophobicCount": 0,
    "avgSurfaceTension": 0.48,
    "avgWettability": 0.42,
    "avgAdhesionWork": 0.45,
    "totalHydrophilicBins": 18,
    "totalHighWettabilityBins": 14,
    "avgCapillarityGini": 0.18
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
      "avgSurfaceTension": 0.52,
      "maxSurfaceTension": 0.78,
      "avgCapillaryPressure": 3.2,
      "maxCapillaryPressure": 6.8,
      "avgContactAngle": 72,
      "maxContactAngle": 125,
      "avgMeniscusCurvature": 0.28,
      "maxMeniscusCurvature": 0.65,
      "avgWettability": 0.45,
      "minWettability": 0.12,
      "avgCapillaryNumber": 2.1,
      "maxCapillaryNumber": 5.8,
      "avgMarangoniFlow": 0.32,
      "maxMarangoniFlow": 0.68,
      "avgAdhesionWork": 0.48,
      "maxAdhesionWork": 0.75,
      "avgCohesionWork": 0.52,
      "maxCohesionWork": 0.78,
      "avgSpreadingCoefficient": 0.38,
      "maxSpreadingCoefficient": 0.72,
      "avgJurinHeight": 0.35,
      "maxJurinHeight": 0.68,
      "avgCapillaryLength": 0.48,
      "maxCapillaryLength": 0.72,
      "avgBondNumber": 3.2,
      "maxBondNumber": 7.5,
      "avgYoungLaplace": 2.8,
      "maxYoungLaplace": 6.2,
      "hydrophilicCount": 15,
      "hydrophilicFraction": 0.60,
      "highWettabilityCount": 10,
      "highWettabilityFraction": 0.40,
      "capillarityGini": 0.18,
      "capillarityIndex": 62,
      "wettingRegime": "HYDROPHILIC",
      "capillarityVerdict": "CAPILLARY_STABLE",
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

- Surface tension is approximated from reserve concentration and internal cohesion patterns. Real surface tension measurement requires force tensiometry or pendant drop analysis at the liquid-gas interface — the DLMM model uses reserve depth and composition uniformity as proxies for cohesive binding energy.
- Contact angle in real wettability science is measured optically from sessile drop profiles on controlled surfaces. The snapshot model uses reserve distribution patterns and bin attractiveness indicators as proxies for the equilibrium contact angle at bin boundaries.
- Capillary pressure from the Young-Laplace equation requires precise knowledge of surface tension, contact angle, and tube geometry. The model combines structural proxies (meniscus curvature, concentration differentials) to estimate the effective capillary driving force.
- The Marangoni effect in real fluid mechanics requires measuring surface tension at multiple points and tracking the resulting flow field. The model uses concentration gradients and reserve distribution variance as proxies for surface tension gradients that drive Marangoni flow.
- Bond number in real capillarity requires knowledge of fluid density, gravitational acceleration, characteristic length, and surface tension. The model uses trading pressure as a proxy for gravitational force and reserve concentration for surface tension.
- Jurin height and capillary length are normalized to 0-1 ranges rather than expressed in physical units, since the DLMM bin lattice has no direct physical length scale.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
