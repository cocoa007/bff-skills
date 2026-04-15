---
name: hodlmm-bin-valence
description: "Measures the bonding capacity of HODLMM bins using chemical valence theory — treats each bin as an atom whose valence number describes how many meaningful connections it forms with neighbors through shared liquidity. Computes valence number (count of neighbors with significant reserve overlap forming real bonds — bins with high valence are well-connected hubs that stabilize the lattice), effective valence (strength-weighted sum of all bonds — captures both count and quality of connections), bond strength (reserve overlap between adjacent bins scaled by distance — strong bonds form between bins with similar reserves at close range), bond type classification as covalent (moderate strength, low directionality — both bins contribute roughly equal reserves creating a shared electron cloud of liquidity), ionic (high directionality — one bin dominates the pair creating a charge separation with reserves flowing from electron donor to acceptor), metallic (high strength, low directionality — a sea of delocalized reserves shared freely among tightly packed bins), or van der Waals (weak interaction — bins are near each other but share little reserve overlap, held together only by proximity), bond order as single (moderate overlap — one shared connection sufficient for basic lattice integrity), double (strong overlap — two effective bonds indicating tightly coupled bins that move together), triple (very strong overlap — maximum coupling, the bins are nearly identical in reserve profile), or aromatic (intermediate order — delocalized bonding spread across a conjugated chain of bins), electronegativity (ratio of bin reserves to pool average — high electronegativity means the bin attracts and holds reserves from neighbors like a fluorine atom pulling electron density), ionization energy (energy required to remove a bin from the lattice — bins with high reserves and many bonds are hard to remove), electron affinity (how much a bin benefits from gaining reserves from neighbors — negative values mean the bin already has excess reserves), covalent radius (effective bonding reach of a bin — how far its influence extends through the lattice), hybridization as sp3 (tetrahedral — four single bonds to neighbors providing broad 3D connectivity), sp2 (trigonal planar — three bonds with some double character providing strength in a plane), sp (linear — two strong bonds providing a direct conduit), or unhybridized (isolated atom — no significant bonding geometry), octet satisfaction (whether a bin achieves its ideal bonding configuration of 4 connections — undersaturated bins have room for more LP deposits, oversaturated bins are fully bonded), formal charge (deviation of bin reserves from expected average — positive charge means excess reserves acting as cation, negative means deficit acting as anion), noble gas detection (bins with zero bonds and negligible reserves — inert particles that don't participate in the lattice), network connectivity (fraction of all possible bin-bin connections that are actually bonded — measures how interconnected the lattice is as a whole), bond density (average bonds per bin — higher density means each bin is well-integrated), lattice energy (total energy binding the lattice together — high lattice energy means the pool resists fragmentation under stress), bond dissociation energy (average energy to break one bond — high values mean individual connections are robust), electronegativity range (spread between most and least electronegative bins — wide range indicates strong charge separation like an ionic compound), polarizability (how easily the reserve distribution deforms under external force — high polarizability means reserves shift easily in response to trades), dipole moment (asymmetry between left-side and right-side total reserves — high dipole means the lattice has a permanent directional bias), resonance energy (stabilization from delocalized bonding across conjugated chains — higher resonance means the lattice has extra stability beyond what individual bonds provide), conjugation length (longest chain of consecutively bonded bins — long conjugation provides a highway for reserve flow), aromatic ring count (number of 6-bin aromatic units — aromatic structures are exceptionally stable), and composite valence index (0-100 from connectivity, strength, octet satisfaction, and stability), classifying pools by valence class as NOBLE_LATTICE (index >= 80 — every bin is well-bonded with high connectivity, strong bonds, and satisfied octets forming a diamond-like lattice that resists all perturbation), COVALENT_NETWORK (60-80 — bins form a connected network with moderate bond strength and good octet satisfaction, like a silicon crystal — robust but can be cleaved along weak planes), IONIC_CRYSTAL (40-60 — bins form bonds but with significant charge separation and directionality, reserves flow from high-reserve to low-reserve bins like ions in a salt crystal — ordered but brittle under stress), METALLIC_CLUSTER (20-40 — bins share reserves loosely with low individual bond strength but some collective cohesion, like a metal where electron density is delocalized — ductile but lacks structural precision), or ATOMIC_GAS (< 20 — bins are largely unbonded isolated atoms with negligible interactions, like a noble gas — the lattice has no structural integrity and reserves are disconnected), and by bonding verdict as STRONGLY_BONDED (high average bond strength with broad network connectivity — the lattice holds together under stress), WELL_BONDED (good bond strength with adequate connectivity — normal healthy state), MODERATELY_BONDED (moderate bonds — functional but some weak links), WEAKLY_BONDED (low bond strength — the lattice is fragile and may fragment), or UNBONDED (negligible bonding — bins exist independently with no meaningful lattice structure)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-valence/hodlmm-bin-valence.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Valence Analyzer

## What it does

Measures the bonding capacity of HODLMM bins using chemical valence theory. In chemistry, valence describes an atom's ability to form bonds with other atoms — it determines how many connections an atom can make and what types of bonds it forms. The valence of an element dictates the structure and stability of the resulting compound.

In DLMM pools, each bin acts as an atom in a liquidity lattice. The analyzer scans all populated bins around the active bin and measures how each bin bonds with its neighbors through shared reserves. Bins with similar reserve levels at close range form strong covalent bonds; bins with large reserve asymmetry form ionic bonds where reserves flow directionally; tightly packed bins with high overlap form metallic bonds with delocalized reserves.

## Why agents need it

LP agents need to understand the structural integrity of the bin lattice. A pool may have high TVL, but if bins are isolated atoms with no bonds, the lattice has no structural cohesion — a single large trade can displace reserves without the lattice absorbing the impact. A well-bonded lattice distributes trade impact across connected bins.

Valence number tells LP agents which bins are structural hubs. High-valence bins are connected to many neighbors and anchor the lattice — removing liquidity from these bins weakens the entire structure. Low-valence bins are peripheral and can be added to or removed from without systemic impact.

Bond type reveals the character of the lattice. Covalent networks are strong and directional — reserves stay put. Metallic clusters share reserves freely — good for liquidity but reserves can flow away quickly. Ionic crystals have ordered structure but can shatter under stress if the charge separation collapses.

The conjugation length shows whether there are reserve highways — long chains of bonded bins that transmit trading impact smoothly. Short conjugation means trades hit dead ends; long conjugation means the lattice can absorb sequential trades across a wide price range.

Dipole moment reveals directional bias. A lattice with zero dipole has symmetric reserves — it handles buys and sells equally. A high dipole means one side is much heavier — the pool will absorb large trades in one direction but become fragile in the other.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-valence/hodlmm-bin-valence.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-valence/hodlmm-bin-valence.ts status
```

### run
Analyzes bin valence bonding for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-valence/hodlmm-bin-valence.ts run
bun run hodlmm-bin-valence/hodlmm-bin-valence.ts run --pool 1
bun run hodlmm-bin-valence/hodlmm-bin-valence.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgValenceIndex": 55,
    "nobleLatticeCount": 0,
    "covalentNetworkCount": 2,
    "ionicCrystalCount": 2,
    "metallicClusterCount": 1,
    "atomicGasCount": 0,
    "avgBondStrength": 0.42,
    "avgNetworkConnectivity": 0.04,
    "totalBonds": 85,
    "avgGini": 0.45
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "activeBin": 8388608,
      "binsScanned": 61,
      "binsPopulated": 25,
      "totalUsd": 140000,
      "totalBonds": 22,
      "avgValenceNumber": 2.4,
      "maxValenceNumber": 5,
      "avgBondStrength": 0.45,
      "avgElectronegativity": 1.0,
      "avgIonizationEnergy": 1.24,
      "avgCovalentRadius": 1.5,
      "covalentBondCount": 14,
      "ionicBondCount": 4,
      "metallicBondCount": 2,
      "vanDerWaalsBondCount": 2,
      "networkConnectivity": 0.07,
      "bondDensity": 0.88,
      "avgOctetSatisfaction": 0.60,
      "nobleGasCount": 3,
      "avgFormalCharge": 0.0,
      "formalChargeSpread": 2.5,
      "bondOrderDistribution": { "single": 10, "double": 5, "triple": 1, "aromatic": 6 },
      "hybridizationDistribution": { "sp": 2, "sp2": 8, "sp3": 12, "unhybridized": 3 },
      "latticeEnergy": 8.5,
      "bondDissociationEnergy": 0.56,
      "electronegativityRange": 3.2,
      "polarizability": 0.65,
      "dipoleMoment": 0.12,
      "resonanceEnergy": 0.35,
      "conjugationLength": 8,
      "aromaticRingCount": 1,
      "valenceIndex": 58,
      "valenceClass": "IONIC_CRYSTAL",
      "bondingVerdict": "WELL_BONDED",
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

- Bond detection uses a fixed radius of 3 bins. Bins separated by more than 3 positions cannot form direct bonds regardless of their reserve similarity. This means long-range reserve correlations (e.g., from range orders placed symmetrically around the active bin) are invisible to the valence model.
- Bond strength decays with distance (1/d factor). A bin 3 steps away needs 3x the reserve overlap to match a bond at distance 1. This biases the model toward local structure and may undervalue well-spaced but correlated bin configurations.
- The octet rule uses a fixed ideal valence of 4. Different pool architectures may have different natural coordination numbers. A pool with narrow bin spacing might naturally support valence 6, making the octet metric misleading.
- Hybridization classification uses bond order averages, which can be noisy with few bonds. A bin with one triple bond and one weak bond shows sp2 hybridization, which may not reflect its actual geometry in the lattice.
- Aromatic ring detection simply divides conjugation length by 6. True aromaticity requires cyclic conjugation (Huckel's rule), which cannot be detected in a 1D bin lattice. The metric is an approximation of delocalized stability.
- Dipole moment treats the lattice as 1D (left vs right of active bin). Actual reserve distribution may have more complex directional character that this simple scalar cannot capture.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
