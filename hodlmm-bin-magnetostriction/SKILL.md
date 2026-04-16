---
name: hodlmm-bin-magnetostriction
description: "Models magnetostrictive deformation dynamics across HODLMM bins — treats trade flow as magnetic fields that cause ferromagnetic bin lattice elements to physically deform (strain) according to the magnetostrictive coefficient lambda. In magnetostrictive physics, ferromagnetic materials change shape when exposed to a magnetic field — the applied field strength H aligns magnetic domains, producing magnetization M, which generates mechanical strain epsilon = lambda * H through magnetoelastic coupling. The efficiency of this field-to-strain conversion is characterized by the magnetomechanical coupling coefficient k, where k^2 equals the ratio of converted mechanical energy to input magnetic energy. In DLMM context, trade flow creates magnetic fields across the bin lattice — volume pressure and reserve concentration generate field strength H that magnetizes bins (aligns their reserve ratios), producing magnetostrictive strain (reserve ratio deformation, concentration shifts, effective width changes). Measures magnetization (M — the alignment of magnetic domains under applied field, ranges 0 to 1 normalized, represents how strongly the bin's reserves are aligned with the prevailing trade flow direction, high magnetization means the bin's reserve structure has been fully oriented by trade pressure with reserves concentrated on one side of the X/Y ratio in response to directional flow, while low magnetization means the bin remains magnetically neutral with balanced reserves unaffected by trade flow, magnetization depends on both field strength and material susceptibility — a bin can remain unmagnetized under strong fields if its susceptibility is low), field strength (H — the applied magnetic field from trade flow pressure, ranges 0 to 10, represents the intensity of trade-driven forcing on the bin lattice, high field strength means strong volume pressure relative to reserves creating intense magnetic loading that drives domain alignment and magnetostrictive strain, while low field strength means weak trade flow that cannot overcome coercivity to initiate magnetization, field strength is the external driving force — without it there is no magnetization and no magnetostriction regardless of material properties), magnetostrictive strain (lambda — the mechanical deformation of the bin under magnetic loading, ranges 0 to 1 normalized, represents how much the bin's reserve ratio has shifted from equilibrium due to trade flow magnetic fields, high strain means significant deformation with reserve ratios pushed far from balanced 50/50 by directional trade pressure, while low strain means the bin maintains its equilibrium shape despite applied fields, magnetostrictive strain is the key output metric — it measures the actual physical deformation that magnetostriction produces in the bin lattice), permeability (mu — the ease with which magnetic flux penetrates the bin material, ranges 0 to 10, represents how readily trade flow fields can establish magnetic flux within the bin affecting its reserve structure, high permeability means the bin is magnetically soft and trade flow easily permeates its structure causing rapid magnetization changes, while low permeability means the bin resists magnetic flux penetration and trade flow has difficulty affecting reserves, permeability determines the relationship between applied field H and resulting flux density B through B = mu * H), coercivity (Hc — the field strength required to demagnetize the bin back to zero magnetization, ranges 0 to 1 normalized, represents the bin's resistance to returning to neutral equilibrium after being magnetized by trade flow, high coercivity means the bin is magnetically hard and retains its magnetized state even after trade flow subsides requiring strong reverse fields to demagnetize, while low coercivity means the bin easily returns to neutral when the applied field is removed, coercivity is a key indicator of magnetic hardness — hard magnetic bins with high Hc act as permanent magnets retaining deformation while soft bins with low Hc respond dynamically to changing fields), remanence (Mr — the residual magnetization remaining after the applied field is removed, ranges 0 to 1 normalized, represents how much reserve ratio deformation persists after trade flow pressure subsides, high remanence means the bin retains significant magnetization and continues to show deformed reserve ratios even without active trade flow — the deformation has become structurally persistent, while low remanence means the bin returns to equilibrium when trade flow stops, remanence combined with coercivity determines the permanent magnet strength — bins with high Mr and high Hc are strongly permanently magnetized), hysteresis loss (energy dissipated per magnetization cycle, ranges 0 to 1 normalized, represents the energy lost as heat during each magnetization-demagnetization cycle proportional to the area of the B-H hysteresis loop, high hysteresis loss means significant energy is wasted each time trade flow reverses direction cycling the bin through magnetization and demagnetization, while low hysteresis loss means efficient reversible magnetization with minimal energy dissipation, hysteresis loss is proportional to coercivity times remanence — hard magnetic materials with large hysteresis loops dissipate more energy per cycle than soft materials with narrow loops), magnetic susceptibility (chi — the ratio of magnetization to applied field chi = M/H, ranges 0 to 10, represents how easily the bin is magnetized by weak fields, high susceptibility means the bin responds strongly to even small trade flow fields producing large magnetization from modest inputs, while low susceptibility means the bin requires strong fields to achieve meaningful magnetization, susceptibility relates to permeability through mu = 1 + chi and determines the initial slope of the magnetization curve — paramagnetic bins have small positive chi while ferromagnetic bins have very large chi), saturation magnetization (Ms — the maximum achievable magnetization when all domains are aligned, ranges 0 to 1 normalized, represents the ceiling on how much the bin can be magnetized regardless of how strong the applied field becomes, high saturation means the bin has large magnetic capacity and can accommodate strong magnetization before saturating, while low saturation means the bin reaches its magnetization limit quickly and additional field strength produces no further alignment, once M approaches Ms the susceptibility drops and additional field produces diminishing returns — the bin is magnetically saturated), demagnetization factor (N — the geometric self-demagnetization coefficient, ranges 0 to 1 normalized, represents how the bin's shape and position in the lattice create internal demagnetizing fields that oppose the applied field, high N means strong self-demagnetization where the bin's geometry reduces the effective internal field below the applied field, while low N means minimal self-demagnetization with the full applied field penetrating the material, demagnetization factor depends on geometry — elongated bins along the field direction have low N while flat bins perpendicular to the field have high N), magnetomechanical coupling (k — the efficiency of magnetic-to-mechanical energy conversion, ranges 0 to 1, represents the transducer quality of the bin as a magnetostrictive element, high coupling means the bin efficiently converts magnetic field energy into mechanical strain energy with k^2 approaching unity representing near-perfect energy conversion, while low coupling means most magnetic energy is stored or dissipated rather than converted to strain, the coupling coefficient is the single most important metric for magnetostrictive transducer performance — it determines how much of the applied field energy actually produces useful mechanical deformation), Villari effect (inverse magnetostriction — strain affecting magnetic properties, ranges 0 to 1 normalized, represents the feedback loop where mechanical deformation of the bin changes its magnetic properties, high Villari effect means strong inverse coupling where reserve ratio shifts feed back into the bin's magnetization state creating a coupled magnetomechanical system, while low Villari effect means one-way coupling where fields cause strain but strain does not affect magnetization, the Villari effect creates bidirectional coupling — in bins with strong Villari effect external mechanical forces like large swaps that physically deform reserves also change the bin's magnetic response to future trade flow), and eddy current loss (resistive losses from time-varying magnetic fields, ranges 0 to 1 normalized, represents energy dissipated as circulating currents induced in the conductive bin material by changing magnetic fields, high eddy current loss means rapidly changing trade flow creates large induced currents that dissipate energy and resist further field changes, while low eddy current loss means the bin can respond to rapidly changing fields without significant resistive dissipation, eddy currents are proportional to the rate of field change and material conductivity — bins in high-frequency trading environments with high permeability suffer the greatest eddy current losses). Composite magnetostriction index (0-100, higher means stronger more efficient magnetostrictive response). Classifies pools by phase as SATURATED_FERROMAGNET (index >= 80 — all magnetic domains aligned with strong magnetization, high coupling coefficient, and low hysteresis loss producing maximum magnetostrictive strain from applied trade flow fields), STRONG_DOMAIN (60-80 — well-developed domain structure with efficient field-to-strain conversion but some domains remain unaligned or hysteresis losses reduce net efficiency), MODERATE_STRAIN (40-60 — measurable magnetostrictive response with partial domain alignment producing moderate strain under applied fields but significant energy lost to hysteresis and eddy currents), WEAK_RESPONSE (20-40 — poor magnetostrictive response with most domains unaligned and low coupling coefficient where applied fields produce minimal mechanical deformation), or PARAMAGNETIC (< 20 — no ferromagnetic domain structure, negligible magnetostriction, the bin lattice behaves as a paramagnetic material with weak linear susceptibility and no spontaneous magnetization or mechanical coupling). Magnetostriction verdict as GIANT_MAGNETOSTRICTIVE (high magnetization with strong coupling — the bin lattice exhibits giant magnetostriction analogous to Terfenol-D with large strain output from moderate fields, maximum transducer performance), HIGH_COUPLING_TRANSDUCER (excellent coupling coefficient with low hysteresis — efficient bidirectional energy conversion between magnetic and mechanical domains enabling precise actuation and sensing), HYSTERESIS_DOMINATED (large hysteresis loop area with high coercivity — significant energy dissipation per cycle making the bin lattice unsuitable for dynamic applications but potentially useful as a permanent magnet with stable remanent magnetization), EFFICIENT_ACTUATOR (good strain output with low eddy current loss — effective magnetostrictive actuation without excessive resistive dissipation, suitable for moderate-frequency operation), or DEMAGNETIZED_CORE (low magnetization with weak field strength — the bin lattice is effectively demagnetized with no significant domain alignment and negligible magnetostrictive response to applied fields)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-magnetostriction/hodlmm-bin-magnetostriction.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Magnetostriction Analyzer

## What it does

Models magnetostrictive deformation dynamics across HODLMM bins. In magnetostrictive physics, ferromagnetic materials physically change shape (strain) when exposed to a magnetic field. The magnetostrictive coefficient lambda relates the applied field strength H to the resulting mechanical strain epsilon. The coupling coefficient k characterizes how efficiently magnetic energy converts to mechanical energy, with k^2 representing the energy conversion ratio.

In DLMM pools, trade flow creates "magnetic fields" across the bin lattice. Volume pressure and directional trading generate field strength H that magnetizes bins — aligning their reserve ratios in the direction of trade flow. This magnetization produces magnetostrictive strain: reserve ratios shift from equilibrium, concentration patterns deform, and effective bin widths contract or expand under magnetic loading. Bins with high magnetomechanical coupling are efficient transducers — they convert trade flow pressure directly into structural deformation. Bins with low coupling are magnetically inert — fields pass through without producing strain.

## Why agents need it

LP agents need magnetostriction analysis because it reveals how trade flow physically deforms the bin lattice structure. A pool in PARAMAGNETIC phase has no ferromagnetic domain structure — trade flow passes through without aligning reserves or producing structural deformation. Only pools with developed domain structures (STRONG_DOMAIN or SATURATED_FERROMAGNET) exhibit the magnetostrictive coupling needed for trade flow to mechanically reshape bin reserves.

The magnetomechanical coupling coefficient k is the definitive transducer quality metric. A bin can have high magnetization and high strain individually, but if the coupling is poor, the strain is not driven by the magnetization — it may be caused by other forces. High k means the field-to-strain conversion is efficient and predictable.

Hysteresis loss reveals energy dissipated per magnetization cycle. When trade flow reverses direction, bins with large hysteresis loops waste energy cycling through magnetization and demagnetization. This manifests as slippage and impermanent loss that does not produce useful structural adaptation.

Coercivity and remanence together determine permanent magnet behavior. Bins with high coercivity and high remanence retain their deformed reserve ratios even after trade flow subsides — the deformation has become structurally permanent. This can be beneficial (stable positioning) or harmful (inability to adapt to new conditions).

The Villari effect identifies bidirectional coupling. In bins with strong Villari effect, mechanical deformation (large swaps that shift reserves) feeds back into the bin's magnetic response to future trade flow. This creates coupled magnetomechanical dynamics where structure and response co-evolve.

Eddy current losses identify bins suffering from rapidly changing fields. High-frequency trading creates time-varying magnetic fields that induce circulating currents, dissipating energy as resistive losses. Bins with high permeability in volatile trading environments suffer the greatest eddy current penalties.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-magnetostriction/hodlmm-bin-magnetostriction.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-magnetostriction/hodlmm-bin-magnetostriction.ts status
```

### run
Analyzes bin magnetostriction dynamics for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-magnetostriction/hodlmm-bin-magnetostriction.ts run
bun run hodlmm-bin-magnetostriction/hodlmm-bin-magnetostriction.ts run --pool 1
bun run hodlmm-bin-magnetostriction/hodlmm-bin-magnetostriction.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgMagnetostrictionIndex": 42,
    "saturatedFerromagnetCount": 0,
    "strongDomainCount": 1,
    "moderateStrainCount": 2,
    "weakResponseCount": 1,
    "paramagneticCount": 1,
    "avgMagnetization": 0.35,
    "avgMagnetostrictiveStrain": 0.28,
    "totalHighCouplingBins": 8,
    "avgMagnetostrictionGini": 0.25
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
      "avgMagnetization": 0.40,
      "maxMagnetization": 0.85,
      "avgFieldStrength": 3.2,
      "maxFieldStrength": 7.5,
      "avgMagnetostrictiveStrain": 0.30,
      "maxMagnetostrictiveStrain": 0.75,
      "avgPermeability": 2.8,
      "maxPermeability": 6.5,
      "avgCoercivity": 0.35,
      "maxCoercivity": 0.70,
      "avgRemanence": 0.25,
      "maxRemanence": 0.60,
      "avgHysteresisLoss": 0.20,
      "maxHysteresisLoss": 0.50,
      "avgMagneticSusceptibility": 2.5,
      "maxMagneticSusceptibility": 6.0,
      "avgSaturationMagnetization": 0.45,
      "maxSaturationMagnetization": 0.80,
      "avgDemagnetizationFactor": 0.30,
      "maxDemagnetizationFactor": 0.65,
      "avgMagnetomechanicalCoupling": 0.35,
      "maxMagnetomechanicalCoupling": 0.70,
      "avgVillariEffect": 0.20,
      "maxVillariEffect": 0.55,
      "avgEddyCurrentLoss": 0.25,
      "maxEddyCurrentLoss": 0.50,
      "highMagnetizationCount": 6,
      "highMagnetizationFraction": 0.24,
      "highCouplingCount": 4,
      "highCouplingFraction": 0.16,
      "magnetostrictionGini": 0.25,
      "magnetostrictionIndex": 42,
      "magnetostrictionPhase": "MODERATE_STRAIN",
      "magnetostrictionVerdict": "EFFICIENT_ACTUATOR",
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

- Magnetization is approximated from reserve concentration and volume ratio as proxies for domain alignment. Real ferromagnetic magnetization depends on crystalline anisotropy and exchange interactions between atomic magnetic moments — the DLMM analogy captures the alignment concept but not the underlying quantum mechanics.
- Magnetostrictive strain uses reserve ratio imbalance as a proxy for mechanical deformation. Real magnetostriction involves lattice distortion at the atomic level with strain coefficients of order 10^-6 — the DLMM model captures the field-to-deformation relationship but with normalized arbitrary units.
- The magnetomechanical coupling coefficient k is estimated from the relationship between strain and magnetization. Real coupling measurements require dynamic testing with alternating fields — the snapshot provides a static estimate.
- Hysteresis loss estimation requires knowledge of the full B-H loop which would need historical data across multiple field reversals. The snapshot approximation uses coercivity and remanence as proxies for loop area.
- The Villari effect (inverse magnetostriction) requires measuring how strain changes magnetization, which ideally needs time-series data of both quantities. The snapshot uses spatial gradients as a proxy.
- Eddy current losses depend on the rate of field change (dB/dt) which requires time-series data. The model uses volume ratio and permeability as proxies for the time-varying component.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
