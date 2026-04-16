#!/usr/bin/env bun
/**
 * hodlmm-bin-fatigue.ts — Day 163 cocoa007 Bitflow Skills Comp
 *
 * Fatigue analyzer — models cyclic loading damage accumulation across HODLMM
 * bins. In materials science, fatigue is the progressive localized damage
 * that occurs when a material is subjected to repeated cyclic stress, even
 * at stress levels well below its static yield strength. Unlike monotonic
 * loading where failure requires stress above ultimate strength, fatigue
 * failure results from the slow accumulation of microscopic damage over
 * many cycles. The S-N curve (Wohler curve) relates stress amplitude
 * to cycles-to-failure, Miner's linear damage rule sums partial damages
 * (D = sum(n_i/N_i)) with failure at D = 1, and Paris' law governs crack
 * propagation (da/dN = C * (delta K)^m). Below the endurance limit,
 * fatigue life is effectively infinite; above it, life decreases as
 * stress amplitude increases. In DLMM context, repeated trading activity
 * subjects bins to cyclic stress — each buy/sell reverses the load
 * direction. High-volume pools experience more cycles per unit time.
 * Bins accumulate damage gradually, initiating microcracks, growing
 * them through propagation, and eventually experiencing structural
 * breakdown as liquidity distributions become chaotic.
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

interface BinFatigue {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  stressAmplitude: number;          // peak-to-trough cyclic stress, 0-1
  meanStress: number;               // average stress around which cycling occurs, 0-1
  damageAccumulation: number;       // Miner's rule linear damage sum, 0-1
  cycleCount: number;               // relative total cycles experienced, 0-1
  enduranceLimit: number;           // stress threshold for infinite life, 0-1
  fatigueLife: number;              // remaining cycles before failure, 0-1
  stressConcentration: number;      // Kt stress riser factor, 0-10
  crackInitiation: number;          // probability of crack starting, 0-1
  crackPropagation: number;         // Paris law da/dN crack growth rate, 0-1
  striationDensity: number;         // fatigue striations indicator, 0-1
  notchSensitivity: number;         // sensitivity to stress concentrators, 0-1
  loadRatio: number;                // R ratio (min/max stress), -1 to 1
  fatigueStrengthCoefficient: number; // Basquin's sigma_f', 0-10
  fatigueStrengthExponent: number;  // Basquin's b exponent, 0-1
  lowCycleFatigue: number;          // plastic strain contribution, 0-1
  fatigueFactor: number;            // composite 0-1
}

interface FatigueProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgStressAmplitude: number;
  maxStressAmplitude: number;
  avgMeanStress: number;
  maxMeanStress: number;
  avgDamageAccumulation: number;
  maxDamageAccumulation: number;
  avgCycleCount: number;
  maxCycleCount: number;
  avgEnduranceLimit: number;
  maxEnduranceLimit: number;
  avgFatigueLife: number;
  minFatigueLife: number;
  avgStressConcentration: number;
  maxStressConcentration: number;
  avgCrackInitiation: number;
  maxCrackInitiation: number;
  avgCrackPropagation: number;
  maxCrackPropagation: number;
  avgStriationDensity: number;
  maxStriationDensity: number;
  avgNotchSensitivity: number;
  maxNotchSensitivity: number;
  avgLoadRatio: number;
  avgFatigueStrengthCoefficient: number;
  maxFatigueStrengthCoefficient: number;
  avgFatigueStrengthExponent: number;
  maxFatigueStrengthExponent: number;
  avgLowCycleFatigue: number;
  maxLowCycleFatigue: number;
  // Derived counts
  infiniteLifeCount: number;        // bins below endurance limit
  infiniteLifeFraction: number;
  crackingCount: number;            // bins with crackInitiation > 0.5
  crackingFraction: number;
  propagatingCount: number;         // bins with crackPropagation > 0.5
  propagatingFraction: number;
  // Summary
  fatigueGini: number;
  fatigueIndex: number;
  fatigueRegime: string;
  fatigueVerdict: string;
  topBins: BinFatigue[];
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

function computeBinFatigue(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  maxReserve: number,
  avgReserve: number
): BinFatigue {
  const distance = Math.abs(bin.binId - activeBin);
  const n = allBins.length;
  const reserveFraction = maxReserve > 0 ? bin.totalUsd / maxReserve : 0;
  const volumeRatio = volume24hUsd > 0 ? volume24hUsd / (totalUsd || 1) : 0;
  const localConcentration = totalUsd > 0 ? bin.totalUsd / totalUsd : 0;

  // Neighbors within +/-3 bins for gradient calculations
  const neighbors = allBins.filter(
    (b) => Math.abs(b.binId - bin.binId) <= 3 && b.binId !== bin.binId
  );
  const neighborAvg = neighbors.length > 0
    ? neighbors.reduce((s, b) => s + b.totalUsd, 0) / neighbors.length
    : 0;

  // Reserve composition (asymmetry indicates bidirectional stress history)
  const xFraction = bin.totalUsd > 0 ? bin.reserveXUsd / bin.totalUsd : 0.5;
  const imbalance = Math.abs(xFraction - 0.5) * 2;

  // Neighbor reserve variance — proxy for cyclic stress variation
  const neighborVariance = neighbors.length > 1
    ? neighbors.reduce((s, b) => s + Math.pow(b.totalUsd - neighborAvg, 2), 0) / neighbors.length
    : 0;
  const normalizedStdDev = neighborAvg > 0 ? Math.sqrt(neighborVariance) / neighborAvg : 0;

  // Concentration differential vs neighbors — proxy for local stress concentration
  const concentrationDiff = neighborAvg > 0
    ? Math.abs(bin.totalUsd - neighborAvg) / neighborAvg
    : 0;

  // Ratio to pool average
  const avgRatio = avgReserve > 0 ? bin.totalUsd / avgReserve : 1;

  // Distance decay factor — bins further from active see less cyclic stress
  const proximityFactor = Math.max(0, 1 - distance * 0.02);

  // -----------------------------------------------------------------------
  // 1. stressAmplitude — peak-to-trough cyclic stress variation per cycle
  // High = large stress swings, fatigue damage accumulates faster
  const stressAmplitude = r4(
    Math.min(1,
      Math.min(1, volumeRatio * 0.5) * 0.3 +
      imbalance * 0.25 +
      normalizedStdDev * 0.2 +
      concentrationDiff * 0.15 +
      proximityFactor * 0.1
    )
  );

  // 2. meanStress — average stress around which cycling occurs
  // High mean stress reduces fatigue life (Goodman/Soderberg effects)
  const meanStress = r4(
    Math.min(1,
      reserveFraction * 0.35 +
      localConcentration * n * 0.25 +
      (1 - Math.abs(1 - avgRatio)) * 0.2 +
      proximityFactor * 0.2
    )
  );

  // 3. damageAccumulation — Miner's rule linear damage sum (D = sum(n_i/N_i))
  // D = 0 means pristine, D = 1 means fatigue failure imminent
  const damageAccumulation = r4(
    Math.min(1,
      stressAmplitude * 0.3 +
      imbalance * 0.25 +
      Math.min(1, volumeRatio * 0.4) * 0.2 +
      concentrationDiff * 0.15 +
      (1 - reserveFraction) * 0.1
    )
  );

  // 4. cycleCount — relative total stress cycles experienced
  // High = many cycles accumulated from trading activity
  const cycleCount = r4(
    Math.min(1,
      Math.min(1, volumeRatio * 0.6) * 0.4 +
      proximityFactor * 0.3 +
      imbalance * 0.15 +
      normalizedStdDev * 0.15
    )
  );

  // 5. enduranceLimit — stress threshold below which infinite life applies
  // High = bin can survive indefinitely under current cyclic loading
  const enduranceLimit = r4(
    Math.min(1,
      reserveFraction * 0.35 +
      (1 - imbalance) * 0.25 +
      (1 - stressAmplitude) * 0.2 +
      (1 - normalizedStdDev * 0.5) * 0.2
    )
  );

  // 6. fatigueLife — remaining cycles before failure
  // High = long remaining life, low = near end-of-life
  const fatigueLife = r4(
    Math.min(1,
      enduranceLimit * 0.3 +
      (1 - damageAccumulation) * 0.35 +
      reserveFraction * 0.2 +
      (1 - stressAmplitude) * 0.15
    )
  );

  // 7. stressConcentration — Kt stress riser factor
  // High = localized stress amplification, accelerates crack initiation
  const stressConcentration = r4(
    Math.min(10,
      concentrationDiff * 4 +
      imbalance * 3 +
      normalizedStdDev * 2 +
      stressAmplitude * 1
    )
  );

  // 8. crackInitiation — probability of fatigue crack starting
  // Nucleation phase — slip band formation, persistent slip bands
  const crackInitiation = r4(
    Math.min(1,
      damageAccumulation * 0.35 +
      (stressConcentration / 10) * 0.25 +
      cycleCount * 0.2 +
      (1 - reserveFraction) * 0.1 +
      imbalance * 0.1
    )
  );

  // 9. crackPropagation — Paris law crack growth rate (da/dN = C*deltaK^m)
  // High = crack growing rapidly toward critical length
  const crackPropagation = r4(
    Math.min(1,
      crackInitiation * 0.4 +
      stressAmplitude * 0.25 +
      (stressConcentration / 10) * 0.2 +
      damageAccumulation * 0.15
    )
  );

  // 10. striationDensity — fatigue striations per unit area
  // Visual/structural evidence of cyclic crack advancement
  const striationDensity = r4(
    Math.min(1,
      crackPropagation * 0.35 +
      cycleCount * 0.3 +
      stressAmplitude * 0.2 +
      damageAccumulation * 0.15
    )
  );

  // 11. notchSensitivity — sensitivity to stress concentrators
  // High q = full response to notch, low q = benign response
  const notchSensitivity = r4(
    Math.min(1,
      (stressConcentration / 10) * 0.4 +
      (1 - enduranceLimit) * 0.25 +
      imbalance * 0.2 +
      concentrationDiff * 0.15
    )
  );

  // 12. loadRatio — R = sigma_min / sigma_max, -1 to 1
  // R = -1: fully reversed (symmetric), R = 0: zero-to-max, R > 0: tension-tension
  const xBias = xFraction - 0.5;
  const loadRatio = r4(
    Math.max(-1, Math.min(1,
      xBias * 2 * 0.5 +
      (avgRatio < 1 ? -0.3 : 0.3) * (1 - imbalance) +
      Math.sign(xBias) * imbalance * 0.3
    ))
  );

  // 13. fatigueStrengthCoefficient — Basquin's sigma_f' constant
  // High = strong fatigue resistance constant in Basquin's equation
  const fatigueStrengthCoefficient = r4(
    Math.min(10,
      enduranceLimit * 5 +
      reserveFraction * 3 +
      (1 - imbalance) * 2
    )
  );

  // 14. fatigueStrengthExponent — Basquin's b exponent (typically -0.05 to -0.12)
  // Represented here as positive magnitude, higher = steeper S-N slope
  const fatigueStrengthExponent = r4(
    Math.min(1,
      stressAmplitude * 0.3 +
      (1 - enduranceLimit) * 0.25 +
      damageAccumulation * 0.2 +
      normalizedStdDev * 0.15 +
      imbalance * 0.1
    )
  );

  // 15. lowCycleFatigue — plastic strain cycle contribution (Coffin-Manson)
  // High = bin experiencing plastic cycling, severe damage per cycle
  const lowCycleFatigue = r4(
    Math.min(1,
      imbalance * 0.3 +
      stressAmplitude * 0.25 +
      damageAccumulation * 0.2 +
      concentrationDiff * 0.15 +
      Math.min(1, volumeRatio * 0.5) * 0.1
    )
  );

  // 16. fatigueFactor — composite 0-1
  // Rewards high fatigue life, low damage, high endurance limit, no cracking
  const fatigueFactor = r4(
    Math.min(1,
      fatigueLife * 0.18 +
      enduranceLimit * 0.15 +
      (1 - damageAccumulation) * 0.12 +
      (1 - crackInitiation) * 0.1 +
      (1 - crackPropagation) * 0.1 +
      (fatigueStrengthCoefficient / 10) * 0.08 +
      (1 - striationDensity) * 0.07 +
      (1 - lowCycleFatigue) * 0.06 +
      (1 - notchSensitivity * 0.5) * 0.06 +
      (1 - stressConcentration / 10) * 0.04 +
      (1 - stressAmplitude * 0.5) * 0.04
    )
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    stressAmplitude,
    meanStress,
    damageAccumulation,
    cycleCount,
    enduranceLimit,
    fatigueLife,
    stressConcentration,
    crackInitiation,
    crackPropagation,
    striationDensity,
    notchSensitivity,
    loadRatio,
    fatigueStrengthCoefficient,
    fatigueStrengthExponent,
    lowCycleFatigue,
    fatigueFactor,
  };
}

function analyzeFatigue(bins: BinReserves[], pool: AppPool): FatigueProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));
  const avgReserve = totalUsd / n;

  const binFatigues = sorted.map((b) =>
    computeBinFatigue(b, activeBin, sorted, totalUsd, volume, maxReserve, avgReserve)
  );

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgStressAmplitude = r4(avg(binFatigues.map((b) => b.stressAmplitude)));
  const maxStressAmplitude = r4(Math.max(...binFatigues.map((b) => b.stressAmplitude)));
  const avgMeanStress = r4(avg(binFatigues.map((b) => b.meanStress)));
  const maxMeanStress = r4(Math.max(...binFatigues.map((b) => b.meanStress)));
  const avgDamageAccumulation = r4(avg(binFatigues.map((b) => b.damageAccumulation)));
  const maxDamageAccumulation = r4(Math.max(...binFatigues.map((b) => b.damageAccumulation)));
  const avgCycleCount = r4(avg(binFatigues.map((b) => b.cycleCount)));
  const maxCycleCount = r4(Math.max(...binFatigues.map((b) => b.cycleCount)));
  const avgEnduranceLimit = r4(avg(binFatigues.map((b) => b.enduranceLimit)));
  const maxEnduranceLimit = r4(Math.max(...binFatigues.map((b) => b.enduranceLimit)));
  const avgFatigueLife = r4(avg(binFatigues.map((b) => b.fatigueLife)));
  const minFatigueLife = r4(Math.min(...binFatigues.map((b) => b.fatigueLife)));
  const avgStressConcentration = r4(avg(binFatigues.map((b) => b.stressConcentration)));
  const maxStressConcentration = r4(Math.max(...binFatigues.map((b) => b.stressConcentration)));
  const avgCrackInitiation = r4(avg(binFatigues.map((b) => b.crackInitiation)));
  const maxCrackInitiation = r4(Math.max(...binFatigues.map((b) => b.crackInitiation)));
  const avgCrackPropagation = r4(avg(binFatigues.map((b) => b.crackPropagation)));
  const maxCrackPropagation = r4(Math.max(...binFatigues.map((b) => b.crackPropagation)));
  const avgStriationDensity = r4(avg(binFatigues.map((b) => b.striationDensity)));
  const maxStriationDensity = r4(Math.max(...binFatigues.map((b) => b.striationDensity)));
  const avgNotchSensitivity = r4(avg(binFatigues.map((b) => b.notchSensitivity)));
  const maxNotchSensitivity = r4(Math.max(...binFatigues.map((b) => b.notchSensitivity)));
  const avgLoadRatio = r4(avg(binFatigues.map((b) => b.loadRatio)));
  const avgFatigueStrengthCoefficient = r4(avg(binFatigues.map((b) => b.fatigueStrengthCoefficient)));
  const maxFatigueStrengthCoefficient = r4(Math.max(...binFatigues.map((b) => b.fatigueStrengthCoefficient)));
  const avgFatigueStrengthExponent = r4(avg(binFatigues.map((b) => b.fatigueStrengthExponent)));
  const maxFatigueStrengthExponent = r4(Math.max(...binFatigues.map((b) => b.fatigueStrengthExponent)));
  const avgLowCycleFatigue = r4(avg(binFatigues.map((b) => b.lowCycleFatigue)));
  const maxLowCycleFatigue = r4(Math.max(...binFatigues.map((b) => b.lowCycleFatigue)));

  // Infinite life: bins operating below their endurance limit
  const infiniteLifeCount = binFatigues.filter(
    (b) => b.stressAmplitude < b.enduranceLimit
  ).length;
  const infiniteLifeFraction = r4(infiniteLifeCount / n);

  // Cracking: bins with significant crack initiation
  const crackingCount = binFatigues.filter((b) => b.crackInitiation > 0.5).length;
  const crackingFraction = r4(crackingCount / n);

  // Propagating: bins with active crack growth
  const propagatingCount = binFatigues.filter((b) => b.crackPropagation > 0.5).length;
  const propagatingFraction = r4(propagatingCount / n);

  // Gini coefficient on fatigueFactor distribution
  const ffFactors = binFatigues.map((b) => b.fatigueFactor);
  const sortedFactors = [...ffFactors].sort((a, b) => b - a);
  const totalFactors = sortedFactors.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedFactors[i];
  }
  const fatigueGini = totalFactors > 0
    ? r4(Math.abs(giniSum) / (n * totalFactors))
    : 0;

  // Composite fatigue index (0-100)
  // High score means pristine: long fatigue life, high endurance limit, no cracking
  const lifeScore        = Math.min(25, avgFatigueLife * 25);
  const enduranceScore   = Math.min(25, avgEnduranceLimit * 25);
  const integrityScore   = Math.min(25, (1 - avgCrackInitiation) * 25);
  const damageScore      = Math.min(25, (1 - avgDamageAccumulation) * 25);
  const fatigueIndex = Math.round(
    Math.min(100, lifeScore + enduranceScore + integrityScore + damageScore)
  );

  // Fatigue regime classification (structural health spectrum)
  let fatigueRegime: string;
  if (fatigueIndex >= 80)      fatigueRegime = "PRISTINE";
  else if (fatigueIndex >= 60) fatigueRegime = "LOW_CYCLE";
  else if (fatigueIndex >= 40) fatigueRegime = "HIGH_CYCLE";
  else if (fatigueIndex >= 20) fatigueRegime = "INITIATION";
  else                         fatigueRegime = "PROPAGATION";

  // Verdict classification
  let fatigueVerdict: string;
  if (avgStressAmplitude < avgEnduranceLimit && avgDamageAccumulation < 0.2)
    fatigueVerdict = "INFINITE_LIFE";
  else if (avgFatigueLife > 0.6 && avgDamageAccumulation < 0.4)
    fatigueVerdict = "SAFE_LIFE";
  else if (avgDamageAccumulation > 0.5 && avgCrackInitiation < 0.4)
    fatigueVerdict = "DAMAGE_ACCUMULATING";
  else if (avgCrackInitiation > 0.5 && avgCrackPropagation < 0.5)
    fatigueVerdict = "CRACK_GROWTH";
  else if (avgCrackPropagation > 0.5 && propagatingFraction > 0.3)
    fatigueVerdict = "IMPENDING_FAILURE";
  else
    fatigueVerdict = "STRESS_BALANCE";

  const topBins = [...binFatigues]
    .sort((a, b) => b.fatigueFactor - a.fatigueFactor)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgStressAmplitude,
    maxStressAmplitude,
    avgMeanStress,
    maxMeanStress,
    avgDamageAccumulation,
    maxDamageAccumulation,
    avgCycleCount,
    maxCycleCount,
    avgEnduranceLimit,
    maxEnduranceLimit,
    avgFatigueLife,
    minFatigueLife,
    avgStressConcentration,
    maxStressConcentration,
    avgCrackInitiation,
    maxCrackInitiation,
    avgCrackPropagation,
    maxCrackPropagation,
    avgStriationDensity,
    maxStriationDensity,
    avgNotchSensitivity,
    maxNotchSensitivity,
    avgLoadRatio,
    avgFatigueStrengthCoefficient,
    maxFatigueStrengthCoefficient,
    avgFatigueStrengthExponent,
    maxFatigueStrengthExponent,
    avgLowCycleFatigue,
    maxLowCycleFatigue,
    infiniteLifeCount,
    infiniteLifeFraction,
    crackingCount,
    crackingFraction,
    propagatingCount,
    propagatingFraction,
    fatigueGini,
    fatigueIndex,
    fatigueRegime,
    fatigueVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Fatigue — Doctor ===\n");
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

  const profiles: FatigueProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeFatigue(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgFatigueIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.fatigueIndex)))
      : 0,
    pristineCount:     profiles.filter((p) => p.fatigueRegime === "PRISTINE").length,
    lowCycleCount:     profiles.filter((p) => p.fatigueRegime === "LOW_CYCLE").length,
    highCycleCount:    profiles.filter((p) => p.fatigueRegime === "HIGH_CYCLE").length,
    initiationCount:   profiles.filter((p) => p.fatigueRegime === "INITIATION").length,
    propagationCount:  profiles.filter((p) => p.fatigueRegime === "PROPAGATION").length,
    avgFatigueLife: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgFatigueLife)))
      : 0,
    avgEnduranceLimit: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgEnduranceLimit)))
      : 0,
    avgDamageAccumulation: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgDamageAccumulation)))
      : 0,
    totalCrackingBins: profiles.reduce((s, p) => s + p.crackingCount, 0),
    totalPropagatingBins: profiles.reduce((s, p) => s + p.propagatingCount, 0),
    avgFatigueGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.fatigueGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-fatigue").description("HODLMM bin fatigue analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin fatigue dynamics")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
