---
name: hodlmm-bin-embrittlement
description: "Models the ductile-to-brittle transition of HODLMM bin reserves under cumulative stress damage, hydrogen charging, grain-boundary impurity segregation, and irradiation-like cyclic fatigue — treats formerly ductile bins that absorbed imbalance through elastic rebalancing as candidates for embrittlement under sustained stress, where small perturbations trigger cleavage-like liquidity fractures instead of plastic accommodation. Embrittlement is the classical metallurgical phenomenon in which a material loses its capacity for plastic deformation and transitions to brittle cleavage fracture. Classical theory: a material's fracture behavior shifts from ductile (plastic deformation, high energy absorption, transgranular dimpled failure via microvoid coalescence) to brittle (cleavage on {100} planes, low energy, often intergranular along prior austenite boundaries) across a narrow ductile-brittle transition temperature (DBTT). Charpy impact energy E(T) follows a tanh-shaped master curve between upper-shelf energy USE (plateau of tough ductile failure) and lower-shelf energy LSE (plateau of brittle cleavage), with DBTT typically defined at 0.5*(USE+LSE) or a fixed-energy criterion such as 27 J. Hydrogen embrittlement (HE) operates via two competing mechanisms: Hydrogen-Enhanced Decohesion (HEDE) where H atoms reduce cohesive strength of atomic bonds at stress concentrators, and Hydrogen-Enhanced Localized Plasticity (HELP) where H softens dislocation slip planes, localizes plasticity, and accelerates crack propagation via plastic collapse. H accumulation at crack tips obeys Oriani's equilibrium trapping with hydrostatic stress as the driver: C_H = C_0 * exp(sigma_h * V_H / RT), concentrating hydrogen at regions of positive hydrostatic tension. Temper embrittlement (TE) arises from segregation of tramp impurities (P, Sn, Sb, As) to prior austenite grain boundaries following McLean's isotherm x_gb / (1 - x_gb) = (x_0 / (1 - x_0)) * exp(-DeltaG_seg / RT); reduced GB cohesive strength causes intergranular fracture without requiring plastic deformation. Irradiation embrittlement shifts DBTT upward via Frank loops, voids, and Cu-rich precipitate hardening per the Odette-Lucas correlation DeltaDBTT ~ a * sqrt(fluence). The Master Curve method (ASTM E1921) parameterizes cleavage toughness as K_Jc(T) = 30 + 70 * exp(0.019 * (T - T_0)) with T_0 as the reference transition temperature. In DLMM context, bins embrittle when accumulated trading stress, sustained composition imbalance, and low activity conspire to make them incapable of absorbing shocks — a formerly ductile bin that tolerated imbalance through elastic rebalancing becomes a brittle bin where small perturbations trigger cleavage-like liquidity fractures; concentrated positions near bin boundaries (grain-boundary analog) segregate risk and trigger intergranular failure rather than distributed plastic accommodation. Measures DBTT (ductile-brittle transition temperature proxy, ranges 0 to 1 — high means easily brittle with transition threshold overcome, low means predominantly ductile regime), impact energy (Charpy-like absorbed energy, ranges 0 to 1 — high means tough ductile tearing with microvoid coalescence, low means brittle cleavage with minimal energy absorption), hydrogen concentration (H trapped at stress concentrators per Oriani equilibrium, ranges 0 to 1 — high means abundant H available for HEDE/HELP, low means hydrogen-free material), temper embrittlement (McLean GB impurity segregation, ranges 0 to 1 — high means severe impurity segregation to prior austenite boundaries, low means clean boundaries), irradiation dose (accumulated cyclic defect density, ranges 0 to 1 — high means significant displacement damage and DBTT upshift, low means undamaged material), intergranular fraction (fraction of fracture along GB vs through grains, ranges 0 to 1 — high means GB-dominated failure mode with HE/TE signature, low means transgranular failure), transgranular fraction (through-grain cleavage or dimple fraction, ranges 0 to 1 — high means body-of-grain failure on {100} planes or via microvoid coalescence), upper shelf energy (ductile plateau toughness, ranges 0 to 1 — high means robust ductile tearing regime exists above DBTT), lower shelf energy (brittle plateau residual energy, ranges 0 to 1 — low baseline of cleavage energy regardless of other conditions), transition width (DBT temperature range span, ranges 0 to 1 — high means gradual transition indicating heterogeneous microstructure, low means sharp clean-steel transition), cleavage tendency (propensity for brittle cleavage on {100} planes, ranges 0 to 1 — high means cold-state cleavage dominates fracture mode), grain boundary strength (GB cohesive strength per HEDE and McLean models, ranges 0 to 1 — high means intact GB cohesion, low means GB weakened by H or impurities), crack tip H concentration (Oriani equilibrium H at stress concentrators, ranges 0 to 1 — high means localized H enrichment primed for fracture initiation), fracture toughness (K_IC equivalent per Master Curve, ranges 0 to 1 — high means tough resistance to crack propagation, low means brittle crack extension at low stress intensities), and ductility index (composite 0 to 1 — higher means ductile tough bin with plastic accommodation capacity and strong GB cohesion). Composite ductility index (0-100, higher means tough ductile bin with high toughness, high impact energy, low cleavage tendency, and strong grain boundaries). Classifies pools by embrittlement regime as DUCTILE (index >= 80 — fully ductile with high toughness, plastic deformation absorbs shocks before fracture, maximum USE, minimal cleavage), TOUGH (60-80 — predominantly tough above DBTT with routine ductile tearing), TRANSITION (40-60 — in DBTT window with mixed ductile-brittle fracture modes), EMBRITTLING (20-40 — losing toughness with cleavage dominating, embrittlement mechanisms active), or BRITTLE (< 20 — fully embrittled with brittle cleavage fracture mode, low impact energy, high intergranular or transgranular cleavage fraction). Embrittlement verdict as DUCTILE_PLATEAU (high fracture toughness with high impact energy and low cleavage — ideal tough ductile state), BRITTLE_FRACTURE (high cleavage tendency with low impact energy and high DBTT — fully embrittled state), HYDROGEN_CHARGED (high H concentration with high crack-tip H — HE mechanisms primed), TEMPER_EMBRITTLED (high GB impurity segregation with high intergranular fracture — classic TE signature), IRRADIATION_AGED (high cumulative damage with elevated DBTT — neutron-embrittlement analog), INTERGRANULAR_DOMINANT (GB fracture dominates with HE or TE signature), TRANSGRANULAR_DOMINANT (through-grain cleavage dominates on {100} planes), TRANSITION_ZONE (mid impact energy in DBTT window with gradual transition), or EMBRITTLEMENT_BALANCE (no extreme indicators — typical mid-embrittlement state)."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-embrittlement/hodlmm-bin-embrittlement.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Embrittlement Analyzer

## What it does

Models the ductile-to-brittle transition of HODLMM bin reserves under cumulative stress damage, hydrogen charging, grain-boundary impurity segregation, and irradiation-like cyclic fatigue — treats formerly ductile bins that absorbed imbalance through elastic rebalancing as candidates for embrittlement under sustained stress, where small perturbations trigger cleavage-like liquidity fractures instead of plastic accommodation. Embrittlement theory quantifies Charpy impact energy, Master Curve fracture toughness, Oriani crack-tip hydrogen trapping, McLean grain-boundary segregation, and Odette-Lucas irradiation-induced DBTT shift.

In DLMM pools, bins embrittle when accumulated trading stress, sustained composition imbalance, and low activity conspire to make them incapable of absorbing shocks; concentrated positions near bin boundaries segregate risk and trigger intergranular failure rather than distributed plastic accommodation.

## Why agents need it

LP agents need embrittlement analysis because it identifies the fracture mode of bin reserves — DUCTILE bins absorb shocks via plastic rebalancing, TRANSITION bins have mixed failure modes, BRITTLE bins fail catastrophically under small perturbations. A DUCTILE pool has bins with high toughness and ductile tearing. A BRITTLE pool has bins primed for cleavage fracture under minimal stress.

DBTT quantifies the brittle-transition threshold. High DBTT means easily embrittled bins.

Impact energy identifies current fracture toughness. High E(T) means ductile failure mode.

Hydrogen concentration warns of HE susceptibility. High H means HEDE/HELP primed.

Temper embrittlement tracks GB segregation. High TE means intergranular fracture risk.

Irradiation dose tracks accumulated cyclic damage. High dose means DBTT upshift.

Intergranular fraction identifies GB failure mode. High IG means H or impurity-dominated fracture.

Cleavage tendency predicts brittle failure mode. High cleavage means {100}-plane fracture.

Fracture toughness measures crack-propagation resistance. High K_IC means tough against cracks.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-embrittlement/hodlmm-bin-embrittlement.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-embrittlement/hodlmm-bin-embrittlement.ts status
```

### run
Analyzes bin embrittlement state for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-embrittlement/hodlmm-bin-embrittlement.ts run
bun run hodlmm-bin-embrittlement/hodlmm-bin-embrittlement.ts run --pool 1
bun run hodlmm-bin-embrittlement/hodlmm-bin-embrittlement.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgDuctilityIndex": 55,
    "ductileCount": 0,
    "toughCount": 1,
    "transitionCount": 3,
    "embrittlingCount": 1,
    "brittleCount": 0,
    "avgFractureToughness": 0.52,
    "avgImpactEnergy": 0.48,
    "avgCleavageTendency": 0.4,
    "totalBrittleBins": 3,
    "totalTransitionBins": 14,
    "totalDuctileBins": 5,
    "avgEmbrittlementGini": 0.2
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
      "avgDbtt": 0.42,
      "maxDbtt": 0.72,
      "avgImpactEnergy": 0.48,
      "minImpactEnergy": 0.18,
      "avgHydrogenConcentration": 0.35,
      "maxHydrogenConcentration": 0.65,
      "avgTemperEmbrittlement": 0.38,
      "maxTemperEmbrittlement": 0.68,
      "avgIrradiationDose": 0.4,
      "maxIrradiationDose": 0.72,
      "avgIntergranularFraction": 0.35,
      "maxIntergranularFraction": 0.65,
      "avgTransgranularFraction": 0.45,
      "avgUpperShelfEnergy": 0.55,
      "avgLowerShelfEnergy": 0.15,
      "avgTransitionWidth": 0.4,
      "avgCleavageTendency": 0.42,
      "maxCleavageTendency": 0.72,
      "avgGrainBoundaryStrength": 0.52,
      "minGrainBoundaryStrength": 0.25,
      "avgCrackTipHConc": 0.32,
      "maxCrackTipHConc": 0.58,
      "avgFractureToughness": 0.52,
      "minFractureToughness": 0.22,
      "brittleCount": 3,
      "brittleFraction": 0.12,
      "transitionCount": 14,
      "transitionFraction": 0.56,
      "ductileCount": 5,
      "ductileFraction": 0.2,
      "embrittlementGini": 0.2,
      "ductilityIndex": 55,
      "embrittlementRegime": "TRANSITION",
      "embrittlementVerdict": "TRANSITION_ZONE",
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

- Charpy master curve E(T) = LSE + (USE-LSE)/2 * (1 + tanh((T-DBTT)/W)) assumes single sharp transition; real materials with heterogeneous microstructure show broader transitions and multi-step tanh fits.
- Oriani hydrogen trapping C_H = C_0 * exp(sigma_h * V_H / RT) assumes equilibrium between lattice and trap sites; kinetic H transport (Sievert diffusion) can produce far-from-equilibrium profiles during dynamic loading.
- McLean GB segregation isotherm assumes dilute solute and single-site adsorption; multi-solute site competition and interfacial precipitation modify predictions.
- Master Curve K_Jc(T) = 30 + 70 * exp(0.019 * (T - T_0)) applies to ferritic steels in cleavage regime; other metallic systems and polymers follow different transition models.
- Odette-Lucas sqrt(fluence) scaling for irradiation DBTT shift assumes thermal neutron irradiation of reactor pressure vessel steels; DLMM cyclic stress is not true displacement damage.
- HEDE and HELP mechanisms compete and interact; actual HE behavior often requires coupled hydrostatic stress + dislocation trap site modeling beyond scope.
- Intergranular vs transgranular fraction depends on local stress state, crack tip H concentration, and GB chemistry; the model proxies these without direct fractographic observation.
- Transition width parameterization assumes Gaussian-tanh coupling; bimodal transitions from dual-phase microstructures require multi-component fits.
- DBTT proxy from activity/proximity/imbalance does not capture true thermal equilibrium; DLMM bins have no physical temperature, only activity-based analog.
- Cleavage tendency proxy ignores crystallographic texture; real cleavage depends on {100} plane orientation relative to stress axis.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
