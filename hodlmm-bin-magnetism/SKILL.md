---
name: hodlmm-bin-magnetism
description: "Measures how bins attract or repel liquidity in the HODLMM bin lattice — computes magnetic field strength per bin (reserve mass relative to pool average measuring local liquidity gravity), pole detection (bins with field strength above 1.5x average classified as NORTH/attractive poles and below 0.5x as SOUTH/repulsive poles — high-reserve bins pull liquidity toward them while depleted bins push it away), pole influence radius (how far each pole's field effect extends into neighboring bins before decaying to neutral), field interactions (Coulomb-style force calculations between pole pairs — same-polarity poles repel while opposite-polarity poles attract, strength decays with inverse-square of bin separation), dipole moment (directional asymmetry of reserve mass relative to the active bin — positive means more mass to the right, negative to the left, zero means symmetric distribution), total magnetization (net field polarity across all poles — positive means more attractive mass than repulsive, negative means the pool is in net repulsion mode), remanence (residual field strength after removing the active bin's influence — measures how much magnetic structure exists independently of the current price point), susceptibility (how responsive the field is to reserve changes — high susceptibility means small deposits or withdrawals create large field distortions, indicating an unstable magnetic landscape), coercivity (the reserve threshold needed to flip a bin's polarity from attractive to repulsive or vice versa — high coercivity means the field structure is rigid and resistant to change), hysteresis area (product of coercivity and remanence — measures path-dependent behavior where the pool's response to liquidity additions differs from its response to removals), attraction zones (bins with field strength above 1.2x average that pull liquidity toward them), repulsion zones (bins below 0.8x average that push liquidity away), neutral zones (bins near average that neither attract nor repel), field gradient max and average (rate of field strength change between adjacent bins — high gradients indicate sharp transitions between attractive and repulsive zones creating unstable boundaries), Curie distance (distance from active bin where field strength drops below 0.5 — the thermal demagnetization point beyond which the pool's magnetic structure breaks down), domain count (number of contiguous regions with consistent polarity — fewer larger domains indicate more organized magnetic structure), average domain size (bins per domain — larger domains mean more coherent field behavior), domain alignment (fraction of bins aligned with the dominant polarity — high alignment means the pool has a clear directional field), active bin field strength and polarity (the magnetic state at the current price — determines whether trades at the active price are attracted to or repelled from the surrounding bin structure), concentration Gini (reserve inequality — affects field uniformity), and composite magnetism index (0-100 from uniformity, strength, alignment, and Curie distance components), classifying pools by magnetism class as FERROMAGNETIC (index >= 80 — strong coherent field with high uniformity and large domains, bins work together creating a powerful attractive force that self-reinforces liquidity concentration), PARAMAGNETIC (60-80 — moderate field with partial alignment, liquidity is attracted toward poles but the field is not strong enough to prevent drift or fragmentation under stress), DIAMAGNETIC (40-60 — weak opposing field where bins partially resist external liquidity changes, the pool has some magnetic structure but it dampens rather than amplifies reserve movements), ANTIFERROMAGNETIC (20-40 — alternating polarity where adjacent bins have opposing field directions, creating local cancellation, the pool has no net magnetic force and liquidity moves without coherent attraction or repulsion), or DEMAGNETIZED (< 20 — no meaningful field structure, reserve distribution is random with no coherent poles, domains, or field gradients), and by field verdict as STRONG_FIELD (high uniformity with extended Curie distance — the pool generates a powerful coherent attraction), MODERATE_FIELD (decent uniformity with moderate reach — functional magnetic structure), WEAK_FIELD (poles exist but Curie distance is short — field decays quickly from the active price), SCATTERED_POLES (poles exist but field is disorganized — no coherent attraction pattern), or NO_FIELD (no significant poles — the pool has no magnetic structure to attract or repel liquidity)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-magnetism/hodlmm-bin-magnetism.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Magnetism Analyzer

## What it does

Measures how bins attract or repel liquidity in the HODLMM bin lattice using a magnetic field analogy. In magnetism, materials with aligned domains create strong coherent fields that attract ferromagnetic objects. In DLMM pools, bins with high reserves act as "north poles" that attract further liquidity deposits (LPs prefer bins with proven activity), while depleted bins act as "south poles" that repel new deposits (LPs avoid empty bins with no fee generation history).

The analyzer scans bins around the active bin and computes field strength, pole detection, dipole moment, domain structure, susceptibility, coercivity, and Curie distance. It reveals whether the pool's reserve distribution creates a coherent attractive force or a scattered repulsive landscape.

## Why agents need it

LP agents need to understand the magnetic landscape before depositing. A pool with strong ferromagnetic structure (high uniformity, large aligned domains, extended Curie distance) will naturally attract and retain liquidity — deposits reinforce the field, creating a positive feedback loop. A demagnetized pool with scattered poles offers no coherent attraction, meaning deposits don't benefit from or contribute to collective field strength.

Dipole moment reveals directional bias — a strong positive dipole means reserve mass is concentrated to the right of the active bin, suggesting the pool expects price to move in that direction. LP agents can align their positions with the dipole or deliberately counter it for contrarian strategies.

Susceptibility indicates stability. High-susceptibility pools respond dramatically to small reserve changes — a single large withdrawal can flip multiple poles and restructure the entire field. LP agents in high-susceptibility pools should expect volatile magnetic landscapes and position defensively. Low-susceptibility pools maintain their field structure under perturbation, offering more predictable behavior.

Coercivity measures how resistant the magnetic structure is to change. High-coercivity pools have entrenched patterns — the gap between north and south pole strengths is large, requiring substantial new capital to shift the field. LP agents should respect high-coercivity fields rather than trying to oppose them. Low-coercivity pools are magnetically soft, easily reshaped by new deposits.

The Curie distance tells LP agents how far from the active bin the pool's magnetic influence extends. Beyond the Curie distance, bins behave independently with no coherent field. Positions beyond Curie distance are magnetically isolated — they don't benefit from the pool's attractive structure and won't attract further deposits nearby.

Domain alignment reveals whether the pool has a coherent field direction. High alignment means most bins agree on polarity — the pool acts as a single magnet. Low alignment means domains cancel each other, producing weak net magnetization despite having strong individual poles.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-magnetism/hodlmm-bin-magnetism.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-magnetism/hodlmm-bin-magnetism.ts status
```

### run
Analyzes bin magnetism for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-magnetism/hodlmm-bin-magnetism.ts run
bun run hodlmm-bin-magnetism/hodlmm-bin-magnetism.ts run --pool 1
bun run hodlmm-bin-magnetism/hodlmm-bin-magnetism.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgMagnetismIndex": 55,
    "ferromagneticCount": 1,
    "paramagneticCount": 2,
    "diamagneticCount": 1,
    "antiferromagneticCount": 1,
    "demagnetizedCount": 0,
    "avgFieldUniformity": 0.62,
    "avgSusceptibility": 0.45,
    "avgCurieDistance": 12,
    "avgGini": 0.48
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "activeBin": 8388608,
      "binsScanned": 61,
      "binsPopulated": 25,
      "totalUsd": 140000,
      "poleCount": 8,
      "northPoles": 3,
      "southPoles": 5,
      "strongestPoleStrength": 3.2,
      "weakestPoleStrength": 0.15,
      "avgFieldStrength": 1.0,
      "fieldUniformity": 0.58,
      "dipoleMoment": 0.12,
      "totalMagnetization": 0.45,
      "remanence": 0.38,
      "susceptibility": 0.52,
      "coercivity": 2.1,
      "hysteresisArea": 0.80,
      "attractionZones": 8,
      "repulsionZones": 10,
      "neutralZones": 7,
      "avgAttractionStrength": 2.1,
      "avgRepulsionStrength": 0.35,
      "fieldGradientMax": 1.8,
      "fieldGradientAvg": 0.42,
      "curieDistance": 14,
      "domainCount": 6,
      "avgDomainSize": 4.17,
      "domainAlignment": 0.60,
      "activeBinFieldStrength": 1.85,
      "activeBinPolarity": "STRONG_NORTH",
      "concentrationGini": 0.42,
      "magnetismIndex": 52,
      "magnetismClass": "DIAMAGNETIC",
      "fieldVerdict": "MODERATE_FIELD",
      "poles": [],
      "interactions": [],
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

- Field strength is relative to pool average reserves, not absolute. A pool with uniformly low reserves ($1/bin) shows perfect field uniformity but cannot support real trading. Always check total TVL alongside magnetism metrics.
- Pole detection uses fixed thresholds (1.5x for north, 0.5x for south). Pools with naturally tapered reserve profiles may show poles at the edges that are by design, not anomalies.
- Magnetic interaction strength uses inverse-square distance law adapted from Coulomb's law. In real bin lattices, the interaction is not physical force but behavioral correlation — LPs tend to deposit near existing large bins. The analogy is useful but imperfect.
- Dipole moment is computed relative to the active bin. If the active bin is at the edge of the populated range, the dipole moment will be strongly directional even if the reserve distribution is symmetric around its own center of mass.
- Susceptibility measures instantaneous field variance, not temporal response to perturbation. A true susceptibility measurement would require comparing snapshots across time. This is a static proxy.
- Curie distance is measured as the first distance where both left and right neighbors drop below 0.5x average. In asymmetric pools, one direction may remain strong while the other decays quickly. The Curie distance reports the shorter decay.
- Domain detection uses a simple above/below average threshold. Bins near 1.0x average may flip domains frequently under small reserve changes, creating noise in domain count.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
