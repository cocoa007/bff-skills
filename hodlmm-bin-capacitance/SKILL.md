---
name: hodlmm-bin-capacitance
description: "Analyzes liquidity absorption capacity across HODLMM bins using electrical capacitance analogies — models each bin's ability to absorb additional liquidity before saturation, computing per-bin capacitance (reserve-to-distance ratio measuring how much charge each bin holds relative to its voltage distance from the active bin — high capacitance bins near the active bin hold large reserves efficiently; distant bins with high reserves indicate unusual charge accumulation), charge level (ratio of actual total reserves to theoretical maximum if every bin matched the peak bin — measures how close the pool is to full capacity; 0.3 means only 30% utilized, 0.9 means nearly saturated with little room for new deposits), dielectric strength (uniformity of reserve distribution as resistance to breakdown — derived from inverse coefficient of variation; high dielectric means reserves are evenly spread providing consistent depth everywhere; low dielectric means concentrated reserves creating weak spots vulnerable to large trades), RC time constant (product of resistance and capacitance — how quickly the pool absorbs or releases liquidity; high RC means slow charge/discharge cycles where new deposits take time to distribute; low RC means rapid equilibration where liquidity redistributes quickly after deposits or withdrawals), impedance (total opposition to liquidity flow combining resistive and reactive components — resistive component from TVL/volume ratio measuring steady-state flow resistance; reactive component from bin-to-bin reserve changes measuring dynamic flow opposition; high impedance pools resist liquidity movement), reactance (average absolute bin-to-bin reserve difference — the dynamic component of impedance measuring how much reserves change between adjacent bins; high reactance means jagged reserve profiles that oppose smooth liquidity flow), resonant frequency (natural oscillation frequency of the liquidity distribution — derived from inductance-capacitance product; represents the characteristic timescale at which reserves naturally oscillate between bins; pools near resonance may amplify small perturbations), energy stored (0.5 * C * V² analog — total energy stored in the capacitive structure of the reserve distribution; represents the work that was done to build up the current charge distribution from empty), max energy capacity (theoretical maximum energy if all bins were at peak reserve — the upper bound on how much energy the pool's capacitive structure can hold), charge distribution entropy (normalized Shannon entropy of reserve distribution — measures how evenly charge is distributed across bins; 1.0 means perfectly uniform distribution; lower values mean charge is concentrated in fewer bins), leakage current (volume-to-TVL ratio — rate at which the pool's stored charge is being drained by trading activity; high leakage means trading volume is large relative to reserves, rapidly cycling the charge), breakdown risk (Gini coefficient of reserves scaled to 0-100 — probability of dielectric failure from extreme concentration; high Gini means most reserves are in a few bins creating structural weakness), parallel capacitance (sum of all bin capacitances — total absorption capacity when all bins can charge independently; represents the pool's gross ability to absorb new liquidity across all bins simultaneously), series capacitance (reciprocal of sum of reciprocal capacitances — bottleneck capacity determined by the weakest bin; much lower than parallel capacitance when bins have uneven capacitance; a pool is only as strong as its weakest bin for series operations), capacitive gradient (average rate of change of capacitance across bins — positive gradient means capacitance increases toward higher bins; negative means it decreases; large absolute gradient indicates asymmetric absorption capacity), polarization (directional charge bias — normalized difference between right-side and left-side reserves relative to active bin; positive means more charge accumulated above the active bin; negative means more below; indicates directional pressure on the price), hysteresis loss (reserve curve asymmetry — total absolute difference between mirrored bin pairs normalized by TVL; high hysteresis means the charge/discharge path is different in each direction, wasting energy; low means symmetric, efficient charge cycling), quality factor (inverse of total loss factor combining hysteresis, leakage, and variation — higher Q means less energy dissipation per charge/discharge cycle; a high-Q pool efficiently stores and releases liquidity without losing value to structural inefficiency), capacitance index (composite 0-100 score combining entropy, dielectric strength, charge headroom, quality factor, and series/parallel ratio — higher means more absorption capacity and structural health), classifying pools by saturation state as DEPLETED (charge level < 0.2 — the pool has almost no reserves relative to its capacity; bins are nearly empty with vast room for new deposits; extremely thin liquidity makes any trade high-impact), UNDERCHARGED (charge level 0.2-0.4 — pool has significant unused capacity; reserves are light but present; good opportunity for LPs to deposit into a pool that can absorb much more), BALANCED (charge level 0.4-0.6 — pool is at a healthy operating point with room to absorb more or release without stress; optimal for trading with adequate depth and room for growth), WELL_CHARGED (charge level 0.6-0.8 — pool is substantially filled with strong reserves; limited but adequate room for additional deposits; good execution depth for trades of most sizes), or SATURATED (charge level > 0.8 — pool is near maximum capacity; most bins are heavily loaded; new deposits have diminishing marginal impact; reserves are deep but the pool has little absorption headroom), and by circuit class from DEPLETED_CELL through SUPERCAPACITOR based on the composite capacitance index."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-capacitance/hodlmm-bin-capacitance.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Capacitance Analyzer

## What it does

Analyzes the liquidity absorption capacity of HODLMM bin distributions using concepts from electrical circuit theory. In electronics, capacitance measures a component's ability to store electrical charge — the ratio of charge stored (Q) to voltage applied (V). A capacitor with high capacitance can absorb large amounts of charge before reaching its voltage limit; one with low capacitance saturates quickly.

In DLMM pools, each bin holds a certain amount of liquidity (charge) at a certain price distance from the active bin (voltage). A bin with high capacitance holds large reserves relative to its distance from the active price — it efficiently absorbs liquidity. A bin with low capacitance is either far from the active price with little reserves (high voltage, low charge) or contributes minimally to the pool's absorption capacity.

The analyzer computes the full electrical characterization: per-bin capacitance, charge level, dielectric strength, RC time constant, impedance, reactance, resonant frequency, energy storage, entropy, leakage, breakdown risk, parallel/series capacitance, polarization, hysteresis, and quality factor. Pools are classified by saturation state (DEPLETED through SATURATED) and circuit class (DEPLETED_CELL through SUPERCAPACITOR).

## Why agents need it

Capacitance reveals how much additional liquidity a pool can absorb before structural changes occur — information that simpler TVL metrics miss entirely. Two pools with identical TVL can have radically different capacitance profiles: one BALANCED with room to absorb large deposits evenly across bins, another SATURATED where new liquidity has nowhere efficient to go.

The charge level tells LP agents whether depositing into a pool will have meaningful impact. In a DEPLETED pool, even small deposits significantly improve depth. In a SATURATED pool, deposits add marginal depth improvements but face higher competition for fee share.

Dielectric strength identifies pools vulnerable to breakdown under trading stress. A pool with low dielectric strength has its reserves concentrated in a few bins — a large trade can punch through the thin spots, causing extreme slippage. High dielectric strength means reserves are evenly distributed, providing consistent depth at every price point.

The RC time constant reveals how quickly a pool equilibrates after perturbation. Low RC pools rapidly redistribute liquidity after deposits or large trades — they self-heal quickly. High RC pools retain imbalances for extended periods, meaning a liquidity shock persists and affects subsequent trades.

Series capacitance exposes the bottleneck — the weakest point in the pool's absorption chain. Even if parallel capacitance is high (total bins can absorb a lot), a low series capacitance means there's a bin acting as a choke point that limits the pool's ability to handle sequential operations through that price range.

Polarization tells trading agents which direction has more liquidity buffering. A positively polarized pool has more reserves above the active bin (sell-side depth), providing better execution for buys. A negatively polarized pool has more reserves below (buy-side depth), providing better execution for sells.

The quality factor combines all loss mechanisms into a single efficiency metric. High-Q pools efficiently store and release liquidity without losing value to structural inefficiency — ideal for LPs who want predictable returns. Low-Q pools dissipate energy through hysteresis, leakage, and uneven distribution — suitable only for short-term positions where timing matters more than efficiency.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.

## Commands

### doctor
Checks environment, dependencies, and API connectivity. Safe to run anytime.
```bash
bun run hodlmm-bin-capacitance/hodlmm-bin-capacitance.ts doctor
```

### status
Read-only check of available HODLMM pools meeting TVL threshold.
```bash
bun run hodlmm-bin-capacitance/hodlmm-bin-capacitance.ts status
```

### run
Analyzes capacitance for top pools (or a specific pool). Outputs JSON to stdout.
```bash
bun run hodlmm-bin-capacitance/hodlmm-bin-capacitance.ts run
bun run hodlmm-bin-capacitance/hodlmm-bin-capacitance.ts run --pool 1
bun run hodlmm-bin-capacitance/hodlmm-bin-capacitance.ts run --top 10
```

## Output contract

All outputs are JSON to stdout.

**Success:**
```json
{
  "result": "success",
  "summary": {
    "poolsAnalyzed": 5,
    "avgCapacitanceIndex": 48.2,
    "depletedCount": 0,
    "underchargedCount": 1,
    "balancedCount": 2,
    "wellChargedCount": 1,
    "saturatedCount": 1,
    "avgChargeLevel": 0.52,
    "avgDielectricStrength": 0.45,
    "avgBreakdownRisk": 38,
    "avgQualityFactor": 3.2,
    "avgPolarization": 0.12
  },
  "profiles": [
    {
      "pair": "STX/sBTC",
      "poolId": 1,
      "activeBin": 8388608,
      "binsAnalyzed": 25,
      "totalUsd": 140000,
      "totalCapacitance": 85000,
      "avgBinCapacitance": 3400,
      "maxCapacitanceBin": 8388608,
      "maxCapacitanceValue": 12500,
      "minCapacitanceBin": 8388638,
      "minCapacitanceValue": 45,
      "chargeLevel": 0.45,
      "dischargeHeadroom": 126000,
      "dielectricStrength": 0.52,
      "rcTimeConstant": 12.5,
      "impedance": 8.3,
      "reactance": 3200,
      "resonantFrequency": 0.0023,
      "energyStored": 425000000,
      "maxEnergyCapacity": 1200000000,
      "chargeDistributionEntropy": 0.78,
      "leakageCurrent": 0.35,
      "breakdownRisk": 42,
      "parallelCapacitance": 85000,
      "seriesCapacitance": 12.5,
      "capacitiveGradient": -180,
      "polarization": 0.08,
      "hysteresisLoss": 0.22,
      "qualityFactor": 3.8,
      "capacitanceIndex": 52,
      "saturationState": "BALANCED",
      "circuitClass": "STANDARD",
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

- Capacitance uses a spatial snapshot, not temporal charging curves. True capacitance characterization requires observing charge/discharge dynamics over time; this analyzer uses the static reserve-to-distance ratio as a proxy.
- The voltage analog (distance from active bin) is linear. Real DLMM price spacing may be logarithmic (constant basis points per bin), so the actual price difference between bins grows geometrically. The linear distance approximation is consistent within a narrow range around the active bin but diverges at the extremes.
- Dielectric strength assumes a Gaussian reserve distribution as the baseline. Pools with intentionally non-uniform distributions (e.g., concentrated liquidity strategies) may show artificially low dielectric strength despite being structurally sound.
- The RC time constant uses TVL/volume as the resistance proxy. This captures average flow resistance but not instantaneous resistance, which varies with trade size and bin positioning.
- Resonant frequency derivation uses a simple inductance analog (second derivative of reserves). Real resonant behavior in DLMM pools involves complex feedback between trading activity, LP behavior, and external price movements that cannot be captured by bin reserve structure alone.
- Series capacitance is dominated by the lowest-capacitance bin. A single empty or near-empty bin in the range can make series capacitance appear very low even if the pool is otherwise well-provisioned.
- Breakdown risk uses Gini coefficient which is sensitive to the number of bins analyzed. Comparing breakdown risk across pools with different numbers of populated bins should be done cautiously.
- Quality factor combines multiple loss mechanisms with equal weighting. Different trading strategies may weight these losses differently — an arbitrage bot may care more about leakage current than hysteresis loss.
- Read-only; does not reflect pending mempool transactions.
- Bitflow BFF API and Hiro API must be reachable; rate limits may slow batch bin fetching.
