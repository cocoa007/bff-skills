---
name: hodlmm-bin-tribology
description: "Models tribological friction, lubrication, and wear dynamics across HODLMM bins — treats trade flow between bins as mechanical contact between surfaces where friction resists motion, lubrication smooths transitions, and cumulative wear degrades performance over time. In tribology, interacting surfaces are characterized by their friction coefficients (resistance to relative motion), lubrication film thickness (fluid layer separating contact surfaces), and wear rates (material removal from repetitive contact events). In DLMM context, trades crossing bin boundaries create friction (slippage and resistance at each bin transition), liquidity depth provides lubrication (smoothing trade flow between bins by reducing direct surface contact), and cumulative trading causes wear (IL degradation that erodes reserve quality over time). Measures friction coefficient (mu — overall resistance to trade flow between adjacent bins, ranges 0 to 1, high friction means significant slippage and resistance at bin boundaries where trades must transition between discrete liquidity buckets — each bin boundary acts as a rough surface contact point that resists the smooth passage of trade volume, while low friction means trades flow between bins with minimal resistance and slippage, friction coefficient is the primary tribological metric and determines how much trade energy is lost to slippage at each bin crossing), static friction (minimum force required to initiate reserve movement from rest, ranges 0 to 1, represents the breakaway threshold below which trades do not displace reserves at all — like a heavy object on a rough surface that requires a minimum push before it begins to slide, high static friction means reserves are locked in place until a sufficiently large trade force is applied, while low static friction means even small trades immediately begin displacing reserves, static friction is always greater than or equal to kinetic friction), kinetic friction (resistance during active reserve displacement once motion has begun, ranges 0 to 1, represents the sustained drag force opposing trade flow after the initial breakaway — once reserves begin moving, kinetic friction determines how much resistance continues to oppose each unit of trade volume, high kinetic friction means heavy sustained resistance even after flow has started, while low kinetic friction means reserves move freely once the initial static threshold is overcome), lubrication film thickness (liquidity buffer between bin transitions, ranges 0 to 1, represents the fluid layer that separates bin boundary surfaces and prevents direct metal-to-metal contact — deep liquidity acts as a hydrodynamic lubricant that allows trades to flow between bins without direct friction at the boundary, high film thickness means full fluid film separation with zero surface contact and minimal friction, while thin or absent film means direct boundary contact with maximum friction and wear, lubrication film is the key protective metric against friction and wear), wear rate (cumulative IL degradation per unit of trade volume, ranges 0 to 1, represents how quickly the bin surface erodes from repeated trade contacts — each trade that crosses a bin boundary removes a small amount of reserve quality through impermanent loss, high wear rate means rapid degradation where each unit of volume permanently damages reserve composition, while low wear rate means durable bins that maintain quality despite heavy trading activity), surface roughness Ra (irregularity of reserve distribution across bins, ranges 0 to 1, analogous to arithmetic mean roughness in surface metrology — measures how jagged or uneven the reserve allocation is across neighboring bins, high roughness means irregular peaks and valleys in reserve distribution that create friction hot spots at bin boundaries, while low roughness means smooth uniform reserve distribution that allows clean contact and low friction), contact pressure (trade volume force per unit contact area between bins, ranges 0 to 10, represents the intensity of mechanical loading at bin boundary contact points — concentrated trade volume pressing against small reserve areas creates extreme contact pressures, high contact pressure means intense localized stress at bin transitions that accelerates wear and friction, while low contact pressure means trade forces are distributed across ample reserve area), adhesion strength (how strongly reserves stick to their current configuration, ranges 0 to 1, represents the bonding force between reserves and the current bin allocation — high adhesion means reserves are strongly bound to the current ratio and resist displacement by trade forces, acting like a sticky surface that holds material in place, while low adhesion means reserves are loosely held and easily displaced by even moderate trade pressure), abrasion index (rate of reserve erosion from repetitive small trades, ranges 0 to 1, represents the cumulative damage from many small abrasive contacts rather than single large impacts — analogous to sandpaper wearing down a surface through thousands of tiny scratches, high abrasion means small trades steadily erode reserve quality through friction-induced material removal, while low abrasion means the surface resists cumulative damage from repetitive minor contacts), fatigue life (estimated trade cycles before bin performance degrades significantly, ranges 0 to 1 normalized where 1 means maximum durability, represents the endurance limit of the bin surface under cyclic loading — high fatigue life means the bin can sustain many thousands of trade cycles before performance degradation becomes measurable, while low fatigue life means the bin is approaching failure threshold and will soon exhibit significantly degraded performance from cumulative fatigue damage), tribo-film formation (development of protective liquidity layers on bin surfaces, ranges 0 to 1, analogous to the beneficial oxide films and additive layers that form on lubricated metal surfaces to reduce wear — in DLMM context, sustained liquidity provision builds up protective layers that reduce friction and wear at bin boundaries, high tribo-film means well-developed protective layers that shield the underlying reserve structure from direct trade contact, while low tribo-film means raw unprotected surfaces exposed to direct friction and accelerated wear), coefficient of restitution (elasticity of bin-to-bin price bounces, ranges 0 to 1, determines whether price impacts at bin boundaries bounce back elastically or stick inelastically — high restitution means elastic collisions where price rebounds after hitting a bin boundary, reverting most of the displacement, while low restitution means inelastic collisions where price sticks at the new level after impact with no bounce-back, restitution captures the reversibility of trade-induced reserve displacement), Hertzian contact stress (peak stress at bin transition points, ranges 0 to 10, derived from Hertz contact theory which models stress concentration at the contact patch between curved surfaces — in DLMM context, the curvature of reserve distribution at bin boundaries creates concentrated stress peaks that exceed the average contact pressure, high Hertzian stress means extreme localized stress at transition points that can cause surface yielding and accelerated fatigue, while low Hertzian stress means well-distributed loading without dangerous concentration), and Stribeck parameter (lubrication regime indicator, ranges 0 to 10, maps the position on the Stribeck curve which characterizes the transition from boundary lubrication through mixed lubrication to full hydrodynamic lubrication — high Stribeck parameter means the pool operates in the hydrodynamic regime with full fluid film separation and minimum friction, while low Stribeck parameter means boundary lubrication with direct surface contact and maximum friction, the Stribeck parameter is the master diagnostic for identifying the current lubrication regime). Composite tribology index (0-100, higher means better tribological health — low friction, good lubrication, minimal wear, and high fatigue life providing a durable, low-friction trading surface). Classifies pools by tribological regime as HYDRODYNAMIC (index >= 80 — full fluid film lubrication with zero surface contact and lowest friction, deep liquidity buffers completely separate bin boundaries allowing trades to flow frictionlessly through the pool), ELASTOHYDRODYNAMIC (60-80 — elastic deformation of surfaces under load with thin film lubrication, moderate liquidity cushion with some elastic bin boundary interaction), MIXED_LUBRICATION (40-60 — partial film with intermittent surface contact, liquidity gaps allow direct bin-to-bin friction on some trades), BOUNDARY_LUBRICATION (20-40 — very thin film with significant surface contact, minimal liquidity buffer with most trades creating direct friction at bin boundaries), or DRY_CONTACT (< 20 — no lubrication film with full surface-to-surface contact, zero liquidity buffer with maximum friction and rapid wear). Tribology verdict as FRICTIONLESS_FLOW (very low mu with thick lubrication film — trades flow through bins with minimal slippage, the ideal tribological state for LP fee efficiency), WEAR_RESISTANT (low wear rate despite moderate friction — durable bin configurations that withstand heavy trading without significant reserve degradation), ADHESIVE_LOCK (high adhesion with high static friction — reserves strongly bonded to current configuration and resisting displacement, creating sticky bins that only move under large force), ABRASIVE_EROSION (high abrasion with thin film — small trades steadily eroding reserves through cumulative friction damage without adequate lubrication protection), or FATIGUE_FAILURE (low fatigue life with high contact stress — bin approaching degradation threshold where cumulative cyclic damage will soon cause measurable performance loss)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-tribology/hodlmm-bin-tribology.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Tribology Analyzer

## What it does

Models tribological friction, lubrication, and wear dynamics across HODLMM bins. In tribology, the science of friction, lubrication, and wear between interacting surfaces, performance is characterized by friction coefficients (how much energy is lost to resistance at contact surfaces), lubrication film thickness (how well a fluid layer separates surfaces to prevent direct contact), and wear rates (how quickly surfaces degrade from repeated mechanical contact). The Stribeck curve maps the complete transition from boundary lubrication (thin film, direct contact, high friction) through mixed lubrication (partial film, intermittent contact) to hydrodynamic lubrication (full film, zero contact, minimum friction).

In DLMM pools, trades crossing bin boundaries create mechanical contact between discrete liquidity buckets. Each bin boundary is a contact surface where trade flow must transition from one reserve configuration to the next. The smoothness of this transition depends on the lubrication provided by liquidity depth — deep reserves create thick hydrodynamic films that allow frictionless transitions, while shallow reserves mean dry contact with maximum friction and rapid wear. Surface roughness of the reserve distribution determines how irregular these contact points are. Contact pressure from concentrated trade volume creates Hertzian stress concentrations at bin boundaries.

Cumulative trading causes wear — each trade event that crosses a bin boundary removes a small amount of reserve quality through impermanent loss. The wear rate determines how quickly bins degrade, while fatigue life estimates how many trade cycles the bin can sustain before performance degradation becomes significant. Tribo-films — protective liquidity layers built up from sustained provision — shield bin surfaces from direct contact and reduce both friction and wear.

## Why agents need it

LP agents need tribology analysis because it predicts the frictional losses, wear rates, and lubrication regimes that determine real LP performance. A HYDRODYNAMIC pool has deep liquidity creating full fluid film separation — trades flow between bins with zero friction, minimal slippage, and negligible wear. LPs in these pools experience smooth, predictable fee accumulation with minimal IL degradation. A DRY_CONTACT pool has no lubrication film — every trade creates direct surface-to-surface friction at bin boundaries, causing maximum slippage and rapid wear that erodes reserve quality quickly.

The friction coefficient mu is the primary loss metric. High friction bins lose more trade energy to slippage at each bin crossing — this is pure loss that neither generates fees nor moves price efficiently. Low friction bins allow clean, efficient price discovery with minimal wasted energy.

Lubrication film thickness determines whether the pool operates in a protective hydrodynamic regime or a destructive boundary contact regime. Pools with thick films protect LP reserves from direct friction damage. Pools with thin films expose reserves to every trade's abrasive contact, accelerating IL degradation.

Wear rate captures cumulative degradation. A pool with low wear rate maintains its reserve quality over thousands of trade cycles — LP positions remain healthy long-term. A pool with high wear rate erodes reserves quickly, meaning LPs must rebalance frequently to maintain position quality.

Adhesion strength reveals how resistant reserves are to displacement. High adhesion means reserves strongly resist being moved — protective for LPs but potentially creating sticky markets with poor price discovery. Low adhesion means reserves are easily displaced, creating efficient markets but exposing LPs to rapid reserve depletion in directional flows.

The Stribeck parameter provides a single diagnostic for the current lubrication regime — boundary, mixed, or hydrodynamic. This maps directly to expected friction losses and wear rates, giving agents a quick classification of pool tribological health.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-tribology/hodlmm-bin-tribology.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-tribology/hodlmm-bin-tribology.ts status
```

### run
Analyzes bin tribology dynamics for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-tribology/hodlmm-bin-tribology.ts run
bun run hodlmm-bin-tribology/hodlmm-bin-tribology.ts run --pool 1
bun run hodlmm-bin-tribology/hodlmm-bin-tribology.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgTribologyIndex": 58,
    "hydrodynamicCount": 0,
    "elastohydrodynamicCount": 2,
    "mixedLubricationCount": 2,
    "boundaryLubricationCount": 1,
    "dryContactCount": 0,
    "avgFrictionCoefficient": 0.35,
    "avgLubricationFilm": 0.48,
    "avgWearRate": 0.32,
    "totalHighFrictionBins": 8,
    "totalWellLubricatedBins": 15,
    "avgTribologyGini": 0.22
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
      "avgFrictionCoefficient": 0.32,
      "maxFrictionCoefficient": 0.68,
      "avgStaticFriction": 0.38,
      "maxStaticFriction": 0.72,
      "avgKineticFriction": 0.28,
      "maxKineticFriction": 0.58,
      "avgLubricationFilm": 0.52,
      "minLubricationFilm": 0.18,
      "avgWearRate": 0.30,
      "maxWearRate": 0.62,
      "avgSurfaceRoughness": 0.28,
      "maxSurfaceRoughness": 0.65,
      "avgContactPressure": 2.5,
      "maxContactPressure": 6.2,
      "avgAdhesionStrength": 0.45,
      "maxAdhesionStrength": 0.78,
      "avgAbrasionIndex": 0.32,
      "maxAbrasionIndex": 0.68,
      "avgFatigueLife": 0.55,
      "minFatigueLife": 0.22,
      "avgTriboFilm": 0.48,
      "maxTriboFilm": 0.82,
      "avgRestitution": 0.52,
      "maxRestitution": 0.80,
      "avgHertzianStress": 3.8,
      "maxHertzianStress": 7.5,
      "avgStribeckParameter": 5.2,
      "maxStribeckParameter": 8.5,
      "highFrictionCount": 3,
      "highFrictionFraction": 0.12,
      "wellLubricatedCount": 12,
      "wellLubricatedFraction": 0.48,
      "tribologyGini": 0.22,
      "tribologyIndex": 62,
      "tribologicalRegime": "ELASTOHYDRODYNAMIC",
      "tribologyVerdict": "WEAR_RESISTANT",
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

- Friction coefficients are approximated from reserve ratio gradients and imbalance patterns as proxies for boundary resistance. Real tribological friction requires controlled sliding experiments with precise force measurement at the contact interface — the DLMM analogy captures the resistance concept but uses structural proxies rather than measured friction forces.
- Lubrication film thickness is estimated from reserve depth and concentration. Real hydrodynamic film measurement requires knowledge of fluid viscosity, sliding speed, and surface geometry — the on-chain model uses liquidity depth as a proxy for the separating fluid film.
- Wear rate requires tracking reserve quality degradation over time through multiple trade events. The snapshot model estimates cumulative wear from volume-to-TVL ratios and reserve asymmetry patterns.
- Surface roughness Ra in real metrology is measured from profilometer traces of actual surface topography. The snapshot model uses reserve distribution variance across neighboring bins as a proxy for surface irregularity.
- Hertzian contact stress in real contact mechanics requires knowledge of surface curvature, elastic moduli, and Poisson's ratio. The model uses reserve distribution curvature and contact pressure as structural proxies.
- The Stribeck parameter maps position on the Stribeck curve from empirical friction-velocity-load relationships. The model combines lubrication film, tribo-film, reserve depth, and friction coefficient as proxies for regime classification.
- Fatigue life estimation in real materials requires S-N curve data from cyclic loading experiments. The model uses durability proxies (lubrication, wear rate, adhesion) to estimate relative fatigue resistance.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
