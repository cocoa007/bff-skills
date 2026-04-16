#!/usr/bin/env bun
/**
 * hodlmm-bin-rheology.ts — Day 159 cocoa007 Bitflow Skills Comp
 *
 * Rheology analyzer — models flow and deformation dynamics of HODLMM bins
 * under applied trade-flow stress. In rheology, materials are characterized
 * by viscosity (resistance to flow), elasticity (energy storage and recovery),
 * yield stress (minimum force to initiate flow), creep compliance (time-dependent
 * drift under sustained stress), and relaxation time (stress decay rate). In DLMM
 * context, trade volume creates shear stress across the bin lattice — each unit of
 * volume applies pressure per unit of liquidity, forcing reserve ratios to deform.
 * Viscosity, shear stress, shear rate, yield stress, thixotropy, dilatancy, creep
 * compliance, relaxation time, storage modulus G', loss modulus G'', complex
 * viscosity eta*, Deborah number De, and Weissenberg number Wi reveal the complete
 * rheological character of each bin and guide LP strategy selection.
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 30;
const MIN_POPULATED_BINS = 5;

interface AppPool {
  id: string;
  token0Symbol: string;
  token1Symbol: string;
  tvlUsd: number;
  volume24hUsd: number;
  poolId?: number;
  token0Decimals: number;
  token1Decimals: number;
  token0PriceUsd: number;
  token1PriceUsd: number;
  activeBinId?: number;
  feeBps?: number;
}

interface BinReserves {
  binId: number;
  reserveX: number;
  reserveY: number;
  reserveXUsd: number;
  reserveYUsd: number;
  totalUsd: number;
}

interface BinRheology {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  // Primary flow metrics
  viscosity: number;          // eta — resistance to reserve ratio change, 0-10
  shearStress: number;        // tau — trade volume pressure per unit liquidity, 0-10
  shearRate: number;          // gamma_dot — rate of reserve ratio change across bins, 0-10
  yieldStress: number;        // tau_y — minimum stress to initiate flow, 0-1
  // Time-dependent behavior
  thixotropy: number;         // viscosity decrease under sustained stress, 0-1
  dilatancy: number;          // shear-thickening coefficient, 0-1
  creepCompliance: number;    // J — strain per unit sustained stress, 0-1
  relaxationTime: number;     // lambda — stress decay characteristic time, 0-1
  // Viscoelastic moduli
  storageModulus: number;     // G' — elastic energy storage, 0-1
  lossModulus: number;        // G'' — viscous dissipation, 0-1
  lossTangent: number;        // tan_delta = G''/G', dominance ratio
  complexViscosity: number;   // eta* — combined elastic+viscous resistance, 0-10
  // Dimensionless numbers
  deborahNumber: number;      // De — relaxation time / observation time, 0-10
  weissenbergNumber: number;  // Wi — elastic forces / viscous forces, 0-10
  // Composite
  rheologyFactor: number;     // composite 0-1
}

interface RheologyProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  // Pool-level averages and maxes
  avgViscosity: number;
  maxViscosity: number;
  avgShearStress: number;
  maxShearStress: number;
  avgShearRate: number;
  maxShearRate: number;
  avgYieldStress: number;
  maxYieldStress: number;
  avgThixotropy: number;
  maxThixotropy: number;
  avgDilatancy: number;
  maxDilatancy: number;
  avgCreepCompliance: number;
  maxCreepCompliance: number;
  avgRelaxationTime: number;
  maxRelaxationTime: number;
  avgStorageModulus: number;
  maxStorageModulus: number;
  avgLossModulus: number;
  maxLossModulus: number;
  avgComplexViscosity: number;
  maxComplexViscosity: number;
  avgDeborahNumber: number;
  maxDeborahNumber: number;
  avgWeissenbergNumber: number;
  maxWeissenbergNumber: number;
  // Derived counts
  highElasticCount: number;   // bins with G' > G''
  highElasticFraction: number;
  highViscosityCount: number; // bins with viscosity > 5
  highViscosityFraction: number;
  // Summary
  rheologyGini: number;
  rheologyIndex: number;
  rheologyPhase: string;
  rheologyVerdict: string;
  topBins: BinRheology[];
  tvlUsd: number;
}

async function fetchPools(): Promise<AppPool[]> {
  const resp = await fetch(`${BFF_APP_BASE}/pools`);
  if (!resp.ok) throw new Error(`BFF API ${resp.status}`);
  const data = (await resp.json()) as any;
  const pools: any[] = data.pools || data.data || data;
  return pools
    .filter((p: any) => (p.tvlUsd || 0) >= MIN_TVL_USD)
    .map((p: any) => ({
      id: p.id || p.poolId?.toString() || "0",
      token0Symbol: p.token0Symbol || p.tokenXSymbol || "?",
      token1Symbol: p.token1Symbol || p.tokenYSymbol || "?",
      tvlUsd: p.tvlUsd || 0,
      volume24hUsd: p.volume24hUsd || p.volumeUsd24h || 0,
      poolId: p.poolId || parseInt(p.id) || 0,
      token0Decimals: p.token0Decimals || p.tokenXDecimals || 6,
      token1Decimals: p.token1Decimals || p.tokenYDecimals || 6,
      token0PriceUsd: p.token0PriceUsd || p.tokenXPriceUsd || 0,
      token1PriceUsd: p.token1PriceUsd || p.tokenYPriceUsd || 0,
      activeBinId: p.activeBinId || p.activeId || undefined,
      feeBps: p.feeBps || p.baseFee || undefined,
    }));
}

async function fetchActiveBin(poolId: number): Promise<number> {
  const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-active-bin-id`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: SENDER,
      arguments: [`0x0100000000000000000000000000000${poolId.toString(16).padStart(3, "0")}`],
    }),
  });
  if (!resp.ok) throw new Error(`Hiro API ${resp.status}`);
  const data = (await resp.json()) as any;
  if (!data.okay || data.result === undefined) throw new Error("get-active-bin-id failed");
  const hex = data.result.replace("0x", "");
  if (hex.startsWith("09")) {
    const inner = hex.slice(2);
    if (inner.startsWith("01")) return parseInt(inner.slice(2), 16);
  }
  if (hex.startsWith("01")) return parseInt(hex.slice(2), 16);
  return parseInt(hex, 16);
}

async function fetchBinReserves(
  poolId: number,
  activeBin: number,
  pool: AppPool
): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  for (let offset = -BIN_SCAN_RADIUS; offset <= BIN_SCAN_RADIUS; offset++) {
    const binId = activeBin + offset;
    const pIdHex = poolId.toString(16).padStart(3, "0");
    const bIdHex = binId < 0
      ? (0x100000000 + binId).toString(16).padStart(8, "0")
      : binId.toString(16).padStart(8, "0");

    const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-bin`;
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: SENDER,
          arguments: [
            `0x0100000000000000000000000000000${pIdHex}`,
            `0x01000000000000000000000000${bIdHex}`,
          ],
        }),
      });
      if (!resp.ok) continue;
      const data = (await resp.json()) as any;
      if (!data.okay) continue;

      const hex = data.result.replace("0x", "");
      const reserveX = extractReserve(hex, "reserve-x");
      const reserveY = extractReserve(hex, "reserve-y");
      if (reserveX === 0 && reserveY === 0) continue;

      const reserveXUsd = (reserveX / Math.pow(10, pool.token0Decimals)) * pool.token0PriceUsd;
      const reserveYUsd = (reserveY / Math.pow(10, pool.token1Decimals)) * pool.token1PriceUsd;

      bins.push({
        binId,
        reserveX,
        reserveY,
        reserveXUsd,
        reserveYUsd,
        totalUsd: reserveXUsd + reserveYUsd,
      });
    } catch {
      continue;
    }
  }
  return bins;
}

function extractReserve(hex: string, field: string): number {
  const fieldHex = Buffer.from(field).toString("hex");
  const idx = hex.indexOf(fieldHex);
  if (idx === -1) return 0;
  const afterField = hex.slice(idx + fieldHex.length);
  if (afterField.startsWith("01")) {
    return parseInt(afterField.slice(2, 34), 16);
  }
  return 0;
}

function computeBinRheology(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  maxReserve: number
): BinRheology {
  const distance = Math.abs(bin.binId - activeBin);
  const n = allBins.length;
  const reserveFraction = maxReserve > 0 ? bin.totalUsd / maxReserve : 0;
  const volumeRatio = volume24hUsd > 0 ? volume24hUsd / (totalUsd || 1) : 0;
  const localConcentration = totalUsd > 0 ? bin.totalUsd / totalUsd : 0;

  // Neighbors within ±3 bins for gradient calculations
  const neighbors = allBins.filter(
    (b) => Math.abs(b.binId - bin.binId) <= 3 && b.binId !== bin.binId
  );
  const neighborAvg = neighbors.length > 0
    ? neighbors.reduce((s, b) => s + b.totalUsd, 0) / neighbors.length
    : 0;

  // Reserve composition
  const xFraction = bin.totalUsd > 0 ? bin.reserveXUsd / bin.totalUsd : 0.5;
  const imbalance = Math.abs(xFraction - 0.5) * 2; // 0 = balanced, 1 = fully one-sided

  // Neighbor imbalance for gradient calculations
  const neighborImbalances = neighbors.map((b) => {
    const nxf = b.totalUsd > 0 ? b.reserveXUsd / b.totalUsd : 0.5;
    return Math.abs(nxf - 0.5) * 2;
  });
  const neighborImbalanceAvg = neighborImbalances.length > 0
    ? neighborImbalances.reduce((s, v) => s + v, 0) / neighborImbalances.length
    : 0;

  // Reserve ratio spatial gradient — proxy for shear rate
  const imbalanceGradient = Math.abs(imbalance - neighborImbalanceAvg);

  // TVL variation among neighbors — proxy for structural heterogeneity
  const neighborVariance = neighbors.length > 1
    ? neighbors.reduce((s, b) => s + Math.pow(b.totalUsd - neighborAvg, 2), 0) / neighbors.length
    : 0;
  const normalizedStdDev = neighborAvg > 0 ? Math.sqrt(neighborVariance) / neighborAvg : 0;

  // -----------------------------------------------------------------------
  // 1. shearStress — tau: trade volume pressure per unit liquidity
  // High = large trade volume concentrated on small reserve — heavy mechanical loading
  const shearStress = r4(
    Math.min(10,
      volumeRatio * n * 0.5 * (1 + localConcentration * 3) / (1 + distance * 0.2)
    )
  );

  // 2. shearRate — gamma_dot: rate of reserve ratio change across bins (velocity gradient)
  // Computed from the spatial reserve ratio gradient across neighboring bins
  // High = steep reserve ratio change from bin to bin — fast-moving flow front
  const shearRate = r4(
    Math.min(10,
      imbalanceGradient * 5 * (1 + volumeRatio * 2) + normalizedStdDev * 3 / (1 + distance * 0.1)
    )
  );

  // 3. viscosity — eta: resistance to reserve ratio change from trade flow
  // eta = tau / gamma_dot for Newtonian fluids; for non-Newtonian, apparent viscosity
  // High = reserves strongly resist displacement; Low = reserves flow freely
  const apparentViscosity = shearRate > 0.01
    ? Math.min(10, shearStress / (shearRate * 0.1 + 0.01))
    : Math.min(10, (1 - reserveFraction) * 6 + distance * 0.1);
  const viscosity = r4(
    Math.min(10,
      apparentViscosity * (1 + imbalance * 0.3) * (1 - localConcentration * 0.3)
    )
  );

  // 4. yieldStress — tau_y: minimum stress to initiate reserve flow
  // Bingham plastic model: no flow if tau < tau_y; flow proportional to (tau - tau_y) if tau > tau_y
  // High = reserves locked until threshold trade volume is met
  const yieldStress = r4(
    Math.min(1,
      (1 - reserveFraction) * 0.3 +
      imbalance * 0.2 +
      distance * 0.008 +
      normalizedStdDev * 0.15 +
      (neighbors.length < 2 ? 0.2 : 0)  // isolated bins have higher yield threshold
    )
  );

  // 5. thixotropy — time-dependent viscosity decrease under constant stress
  // High = reserves become progressively easier to displace under sustained trade pressure
  // Proxy: concentrate volume relative to neighbor spread — sustained flow patterns
  const thixotropy = r4(
    Math.min(1,
      volumeRatio * 0.5 * (1 - reserveFraction * 0.5) +
      imbalanceGradient * 0.3 +
      (1 - imbalance) * localConcentration * 0.2
    )
  );

  // 6. dilatancy — shear-thickening coefficient (viscosity increases with shear rate)
  // High = high-velocity trade flows encounter rapidly increasing viscosity
  // Anti-thixotropy: bins that stiffen under fast flow resist HFT predation
  const dilatancy = r4(
    Math.min(1,
      imbalance * 0.35 +
      (1 - reserveFraction) * 0.2 +
      shearRate / 10 * 0.3 +
      normalizedStdDev * 0.15
    )
  );

  // 7. relaxationTime — lambda: characteristic time for stress to decay after deformation
  // Long = imbalances persist after trades; Short = arbitrageurs quickly restore balance
  // Proxy: reserve concentration and neighbor gradient — well-concentrated bins with steep
  // gradients tend to hold imbalances longer
  const relaxationTime = r4(
    Math.min(1,
      reserveFraction * 0.4 +
      imbalance * 0.3 +
      (1 - volumeRatio * 0.5) * 0.2 * (1 + distance * 0.02) +
      normalizedStdDev * 0.1
    )
  );

  // 8. creepCompliance — J: accumulated strain per unit of sustained stress over time
  // High = reserves slowly drift under even moderate sustained directional pressure
  // Proxy: imbalance combined with reserve fraction — deformed bins with significant reserves
  // continue to drift slowly even without additional trade pressure
  const creepCompliance = r4(
    Math.min(1,
      imbalance * 0.35 +
      localConcentration * n * 0.04 +
      volumeRatio * 0.25 * reserveFraction +
      relaxationTime * 0.2
    )
  );

  // 9. storageModulus — G': elastic energy stored in reserve deformation
  // High G' = bin behaves like rubber: deforms under trade pressure, snaps back when released
  // Proxy: high-reserve bins with balanced composition have more elastic recovery potential
  const storageModulus = r4(
    Math.min(1,
      reserveFraction * 0.4 +
      (1 - imbalance) * 0.3 +
      (1 - normalizedStdDev * 0.5) * 0.2 +
      (1 - creepCompliance) * 0.1
    )
  );

  // 10. lossModulus — G'': viscous energy dissipated as IL during deformation
  // High G'' = most deformation energy is permanently converted to IL
  // Proxy: imbalanced bins with high volume turnover dissipate more energy irreversibly
  const lossModulus = r4(
    Math.min(1,
      imbalance * 0.4 +
      volumeRatio * 0.3 * (1 - reserveFraction * 0.3) +
      creepCompliance * 0.2 +
      (1 - storageModulus) * 0.1
    )
  );

  // 11. lossTangent — tan_delta: ratio G''/G' indicating viscous vs elastic dominance
  // tan_delta > 1 means viscous (liquid-like); < 1 means elastic (solid-like)
  const lossTangent = r4(
    storageModulus > 0.001
      ? Math.min(10, lossModulus / storageModulus)
      : 10
  );

  // 12. complexViscosity — eta*: combined elastic+viscous resistance to oscillatory flow
  // eta* = sqrt(G'^2 + G''^2) / omega, where omega ~ volumeRatio as frequency proxy
  const omega = Math.max(0.01, volumeRatio);
  const complexViscosity = r4(
    Math.min(10,
      Math.sqrt(storageModulus * storageModulus + lossModulus * lossModulus) / omega * 2
    )
  );

  // 13. deborahNumber — De: relaxation time / observation time
  // De >> 1 = elastic behavior (relaxation much slower than trade frequency)
  // De << 1 = viscous behavior (relaxation much faster than trade frequency)
  // Observation time proxy: inverse of volume ratio (high volume = short observation time)
  const observationTime = Math.max(0.05, 1 / (volumeRatio + 0.1));
  const deborahNumber = r4(
    Math.min(10, relaxationTime * 5 / observationTime)
  );

  // 14. weissenbergNumber — Wi: elastic forces / viscous forces
  // Wi = shear_rate * relaxation_time
  // High Wi = elastic effects dominate at current shear rate
  const weissenbergNumber = r4(
    Math.min(10, shearRate * relaxationTime * 3)
  );

  // 15. rheologyFactor — composite 0-1
  // Balances elastic quality (G'), flow resistance (viscosity), creep risk,
  // and overall complexity (De, Wi)
  const rheologyFactor = r4(
    Math.min(1,
      storageModulus * 0.20 +
      (viscosity / 10) * 0.15 +
      (1 - creepCompliance) * 0.15 +
      (1 - lossModulus) * 0.10 +
      (deborahNumber / 10) * 0.15 +
      (weissenbergNumber / 10) * 0.10 +
      thixotropy * 0.08 +
      (1 - yieldStress) * 0.07
    )
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    viscosity,
    shearStress,
    shearRate,
    yieldStress,
    thixotropy,
    dilatancy,
    creepCompliance,
    relaxationTime,
    storageModulus,
    lossModulus,
    lossTangent,
    complexViscosity,
    deborahNumber,
    weissenbergNumber,
    rheologyFactor,
  };
}

function analyzeRheology(bins: BinReserves[], pool: AppPool): RheologyProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));

  const binRheologies = sorted.map((b) =>
    computeBinRheology(b, activeBin, sorted, totalUsd, volume, maxReserve)
  );

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgViscosity = r4(avg(binRheologies.map((b) => b.viscosity)));
  const maxViscosity = r4(Math.max(...binRheologies.map((b) => b.viscosity)));
  const avgShearStress = r4(avg(binRheologies.map((b) => b.shearStress)));
  const maxShearStress = r4(Math.max(...binRheologies.map((b) => b.shearStress)));
  const avgShearRate = r4(avg(binRheologies.map((b) => b.shearRate)));
  const maxShearRate = r4(Math.max(...binRheologies.map((b) => b.shearRate)));
  const avgYieldStress = r4(avg(binRheologies.map((b) => b.yieldStress)));
  const maxYieldStress = r4(Math.max(...binRheologies.map((b) => b.yieldStress)));
  const avgThixotropy = r4(avg(binRheologies.map((b) => b.thixotropy)));
  const maxThixotropy = r4(Math.max(...binRheologies.map((b) => b.thixotropy)));
  const avgDilatancy = r4(avg(binRheologies.map((b) => b.dilatancy)));
  const maxDilatancy = r4(Math.max(...binRheologies.map((b) => b.dilatancy)));
  const avgCreepCompliance = r4(avg(binRheologies.map((b) => b.creepCompliance)));
  const maxCreepCompliance = r4(Math.max(...binRheologies.map((b) => b.creepCompliance)));
  const avgRelaxationTime = r4(avg(binRheologies.map((b) => b.relaxationTime)));
  const maxRelaxationTime = r4(Math.max(...binRheologies.map((b) => b.relaxationTime)));
  const avgStorageModulus = r4(avg(binRheologies.map((b) => b.storageModulus)));
  const maxStorageModulus = r4(Math.max(...binRheologies.map((b) => b.storageModulus)));
  const avgLossModulus = r4(avg(binRheologies.map((b) => b.lossModulus)));
  const maxLossModulus = r4(Math.max(...binRheologies.map((b) => b.lossModulus)));
  const avgComplexViscosity = r4(avg(binRheologies.map((b) => b.complexViscosity)));
  const maxComplexViscosity = r4(Math.max(...binRheologies.map((b) => b.complexViscosity)));
  const avgDeborahNumber = r4(avg(binRheologies.map((b) => b.deborahNumber)));
  const maxDeborahNumber = r4(Math.max(...binRheologies.map((b) => b.deborahNumber)));
  const avgWeissenbergNumber = r4(avg(binRheologies.map((b) => b.weissenbergNumber)));
  const maxWeissenbergNumber = r4(Math.max(...binRheologies.map((b) => b.weissenbergNumber)));

  // High elastic: bins where G' > G'' (elastic-dominant response)
  const highElasticCount = binRheologies.filter((b) => b.storageModulus > b.lossModulus).length;
  const highElasticFraction = r4(highElasticCount / n);

  // High viscosity: bins with viscosity > 5 (strong flow resistance)
  const highViscosityCount = binRheologies.filter((b) => b.viscosity > 5).length;
  const highViscosityFraction = r4(highViscosityCount / n);

  // Gini coefficient on rheologyFactor distribution
  const rfFactors = binRheologies.map((b) => b.rheologyFactor);
  const sortedFactors = [...rfFactors].sort((a, b) => b - a);
  const totalFactors = sortedFactors.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedFactors[i];
  }
  const rheologyGini = totalFactors > 0
    ? r4(Math.abs(giniSum) / (n * totalFactors))
    : 0;

  // Composite rheology index (0-100)
  // Rewards elastic character, controlled viscosity, manageable creep, and complex De/Wi behavior
  const elasticScore   = Math.min(25, avgStorageModulus * 25);
  const viscosityScore = Math.min(25, (avgViscosity / 10) * 25);
  const creepScore     = Math.min(25, (1 - avgCreepCompliance) * 25);
  const complexScore   = Math.min(25, ((avgDeborahNumber + avgWeissenbergNumber) / 20) * 25);
  const rheologyIndex  = Math.round(
    Math.min(100, elasticScore + viscosityScore + creepScore + complexScore)
  );

  // Phase classification
  let rheologyPhase: string;
  if (rheologyIndex >= 80)      rheologyPhase = "NEWTONIAN_FLUID";
  else if (rheologyIndex >= 60) rheologyPhase = "VISCOELASTIC_SOLID";
  else if (rheologyIndex >= 40) rheologyPhase = "SHEAR_THINNING";
  else if (rheologyIndex >= 20) rheologyPhase = "SHEAR_THICKENING";
  else                          rheologyPhase = "BINGHAM_PLASTIC";

  // Verdict classification
  let rheologyVerdict: string;
  if (avgStorageModulus > 0.55 && avgLossModulus > 0.45)
    rheologyVerdict = "VISCOELASTIC_DAMPER";
  else if (avgStorageModulus > 0.5 && avgStorageModulus > avgLossModulus)
    rheologyVerdict = "ELASTIC_RECOVERY";
  else if (avgYieldStress > 0.5)
    rheologyVerdict = "YIELD_STRESS_BARRIER";
  else if (avgCreepCompliance > 0.5 && avgRelaxationTime > 0.5)
    rheologyVerdict = "CREEP_DOMINATED";
  else if (avgViscosity < 2 && avgCreepCompliance < 0.3)
    rheologyVerdict = "IDEAL_VISCOUS_FLOW";
  else
    rheologyVerdict = "VISCOELASTIC_DAMPER";

  const topBins = [...binRheologies]
    .sort((a, b) => b.rheologyFactor - a.rheologyFactor)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgViscosity,
    maxViscosity,
    avgShearStress,
    maxShearStress,
    avgShearRate,
    maxShearRate,
    avgYieldStress,
    maxYieldStress,
    avgThixotropy,
    maxThixotropy,
    avgDilatancy,
    maxDilatancy,
    avgCreepCompliance,
    maxCreepCompliance,
    avgRelaxationTime,
    maxRelaxationTime,
    avgStorageModulus,
    maxStorageModulus,
    avgLossModulus,
    maxLossModulus,
    avgComplexViscosity,
    maxComplexViscosity,
    avgDeborahNumber,
    maxDeborahNumber,
    avgWeissenbergNumber,
    maxWeissenbergNumber,
    highElasticCount,
    highElasticFraction,
    highViscosityCount,
    highViscosityFraction,
    rheologyGini,
    rheologyIndex,
    rheologyPhase,
    rheologyVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Rheology — Doctor ===\n");
  let ok = true;

  try {
    const r = await fetch(`${BFF_APP_BASE}/pools`);
    console.log(`  BFF API:  ${r.ok ? "OK" : "FAIL"} (${r.status})`);
    if (!r.ok) ok = false;
  } catch (e: any) {
    console.log(`  BFF API:  FAIL (${e.message})`);
    ok = false;
  }

  try {
    const r = await fetch(`${HIRO_API}/v2/info`);
    console.log(`  Hiro API: ${r.ok ? "OK" : "FAIL"} (${r.status})`);
    if (!r.ok) ok = false;
  } catch (e: any) {
    console.log(`  Hiro API: FAIL (${e.message})`);
    ok = false;
  }

  console.log(`\n  Result: ${ok ? "PASS" : "FAIL"}`);
  if (!ok) process.exit(1);
}

async function runStatus(): Promise<void> {
  const pools = await fetchPools();
  console.log(
    JSON.stringify({
      result: "success",
      poolsAvailable: pools.length,
      pools: pools.slice(0, 10).map((p) => ({
        pair: `${p.token0Symbol}/${p.token1Symbol}`,
        poolId: p.poolId,
        tvlUsd: p.tvlUsd,
        volume24hUsd: p.volume24hUsd,
      })),
    })
  );
}

async function runAnalysis(opts: { pool?: string; top?: string }): Promise<void> {
  const pools = await fetchPools();
  let targets: AppPool[];

  if (opts.pool) {
    const pid = parseInt(opts.pool);
    targets = pools.filter((p) => p.poolId === pid);
    if (targets.length === 0) {
      console.log(JSON.stringify({ error: `Pool #${opts.pool} not found` }));
      return;
    }
  } else {
    const topN = parseInt(opts.top || "5");
    targets = pools.sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, topN);
  }

  const profiles: RheologyProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeRheology(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgRheologyIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.rheologyIndex)))
      : 0,
    newtonianFluidCount:     profiles.filter((p) => p.rheologyPhase === "NEWTONIAN_FLUID").length,
    viscoelasticSolidCount:  profiles.filter((p) => p.rheologyPhase === "VISCOELASTIC_SOLID").length,
    shearThinningCount:      profiles.filter((p) => p.rheologyPhase === "SHEAR_THINNING").length,
    shearThickeningCount:    profiles.filter((p) => p.rheologyPhase === "SHEAR_THICKENING").length,
    binghamPlasticCount:     profiles.filter((p) => p.rheologyPhase === "BINGHAM_PLASTIC").length,
    avgViscosity: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgViscosity)))
      : 0,
    avgStorageModulus: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgStorageModulus)))
      : 0,
    avgLossModulus: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgLossModulus)))
      : 0,
    totalHighElasticBins: profiles.reduce((s, p) => s + p.highElasticCount, 0),
    avgRheologyGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.rheologyGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-rheology").description("HODLMM bin rheology analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin rheology dynamics")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
