#!/usr/bin/env bun
/**
 * hodlmm-bin-capacitance.ts — Day 134 cocoa007 Bitflow Skills Comp
 *
 * Capacitance analyzer — models how much additional liquidity each bin range
 * can absorb before saturation using electrical capacitance analogies.
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

interface CapacitanceProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsAnalyzed: number;
  totalUsd: number;
  totalCapacitance: number;
  avgBinCapacitance: number;
  maxCapacitanceBin: number;
  maxCapacitanceValue: number;
  minCapacitanceBin: number;
  minCapacitanceValue: number;
  chargeLevel: number;
  dischargeHeadroom: number;
  dielectricStrength: number;
  rcTimeConstant: number;
  impedance: number;
  reactance: number;
  resonantFrequency: number;
  energyStored: number;
  maxEnergyCapacity: number;
  chargeDistributionEntropy: number;
  leakageCurrent: number;
  breakdownRisk: number;
  parallelCapacitance: number;
  seriesCapacitance: number;
  capacitiveGradient: number;
  polarization: number;
  hysteresisLoss: number;
  qualityFactor: number;
  capacitanceIndex: number;
  saturationState: string;
  circuitClass: string;
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

function analyzeCapacitance(bins: BinReserves[], pool: AppPool): CapacitanceProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const reserves = sorted.map((b) => b.totalUsd);
  const meanReserve = totalUsd / n;
  const maxReserve = Math.max(...reserves);

  // Capacitance per bin: C = Q/V — reserves (charge) / distance from active bin (voltage)
  const binCapacitances: number[] = sorted.map((b) => {
    const distance = Math.abs(b.binId - activeBin) + 1;
    return b.totalUsd / distance;
  });

  const totalCapacitance = Math.round(binCapacitances.reduce((s, c) => s + c, 0) * 100) / 100;
  const avgBinCapacitance = Math.round((totalCapacitance / n) * 100) / 100;

  const maxCapIdx = binCapacitances.indexOf(Math.max(...binCapacitances));
  const minCapIdx = binCapacitances.indexOf(Math.min(...binCapacitances));

  // Charge level: how full the pool is relative to theoretical max
  const theoreticalMax = maxReserve * n;
  const chargeLevel = theoreticalMax > 0
    ? Math.round((totalUsd / theoreticalMax) * 1000) / 1000
    : 0;

  // Discharge headroom: how much can be withdrawn before critical depletion
  const minViable = totalUsd * 0.1;
  const dischargeHeadroom = Math.round((totalUsd - minViable) * 100) / 100;

  // Dielectric strength: resistance to breakdown under stress
  const reserveStdDev = Math.sqrt(reserves.reduce((s, r) => s + (r - meanReserve) ** 2, 0) / n);
  const coeffOfVariation = meanReserve > 0 ? reserveStdDev / meanReserve : 1;
  const dielectricStrength = Math.round(Math.max(0, 1 - coeffOfVariation) * 1000) / 1000;

  // RC time constant: how quickly the pool can absorb/release liquidity
  const volumeEfficiency = pool.volume24hUsd > 0 ? pool.tvlUsd / pool.volume24hUsd : 100;
  const resistance = volumeEfficiency;
  const rcTimeConstant = Math.round(resistance * (totalCapacitance / 1000) * 100) / 100;

  // Impedance: total opposition to liquidity flow
  let reactanceSum = 0;
  for (let i = 1; i < n; i++) {
    reactanceSum += Math.abs(reserves[i] - reserves[i - 1]);
  }
  const reactance = n > 1
    ? Math.round((reactanceSum / (n - 1)) * 100) / 100
    : 0;
  const impedance = Math.round(Math.sqrt(resistance ** 2 + reactance ** 2) * 100) / 100;

  // Resonant frequency: natural frequency of liquidity oscillation
  let inductance = 0;
  for (let i = 2; i < n; i++) {
    const accel = reserves[i] - 2 * reserves[i - 1] + reserves[i - 2];
    inductance += accel ** 2;
  }
  inductance = n > 2 ? Math.sqrt(inductance / (n - 2)) + 0.001 : 1;
  const resonantFrequency = totalCapacitance > 0
    ? Math.round((1 / (2 * Math.PI * Math.sqrt(inductance * totalCapacitance / 1000))) * 10000) / 10000
    : 0;

  // Energy stored: E = 0.5 * C * V²
  const avgVoltage = meanReserve;
  const energyStored = Math.round(0.5 * (totalCapacitance / 1000) * avgVoltage ** 2 * 100) / 100;

  // Max energy capacity
  const maxEnergyCapacity = Math.round(0.5 * (totalCapacitance / 1000) * maxReserve ** 2 * 100) / 100;

  // Charge distribution entropy
  const totalForEntropy = reserves.reduce((s, r) => s + r, 0) || 1;
  const probs = reserves.map((r) => r / totalForEntropy);
  const maxEntropy = Math.log(n);
  let entropy = 0;
  for (const p of probs) {
    if (p > 0) entropy -= p * Math.log(p);
  }
  const chargeDistributionEntropy = maxEntropy > 0
    ? Math.round((entropy / maxEntropy) * 1000) / 1000
    : 0;

  // Leakage current: volume draining reserves
  const leakageCurrent = pool.volume24hUsd > 0
    ? Math.round((pool.volume24hUsd / totalUsd) * 1000) / 1000
    : 0;

  // Breakdown risk: extreme concentration (Gini coefficient)
  const gini = computeGini(reserves);
  const breakdownRisk = Math.round(gini * 100);

  // Parallel capacitance: sum of all (total absorption)
  const parallelCapacitance = totalCapacitance;

  // Series capacitance: 1/Ctotal = sum(1/Ci) — bottleneck
  let seriesInverse = 0;
  for (const c of binCapacitances) {
    if (c > 0) seriesInverse += 1 / c;
  }
  const seriesCapacitance = seriesInverse > 0
    ? Math.round((1 / seriesInverse) * 100) / 100
    : 0;

  // Capacitive gradient: rate of change across bins
  let gradientSum = 0;
  for (let i = 1; i < n; i++) {
    gradientSum += binCapacitances[i] - binCapacitances[i - 1];
  }
  const capacitiveGradient = n > 1
    ? Math.round((gradientSum / (n - 1)) * 100) / 100
    : 0;

  // Polarization: directional bias
  const activeIdx = sorted.findIndex((b) => b.binId >= activeBin);
  const midIdx = activeIdx >= 0 ? activeIdx : Math.floor(n / 2);
  const leftCharge = reserves.slice(0, midIdx).reduce((s, r) => s + r, 0);
  const rightCharge = reserves.slice(midIdx).reduce((s, r) => s + r, 0);
  const totalCharge = leftCharge + rightCharge;
  const polarization = totalCharge > 0
    ? Math.round(((rightCharge - leftCharge) / totalCharge) * 1000) / 1000
    : 0;

  // Hysteresis loss: charge curve asymmetry
  let asymmetryArea = 0;
  for (let i = 0; i < Math.floor(n / 2); i++) {
    const mirror = n - 1 - i;
    asymmetryArea += Math.abs(reserves[i] - reserves[mirror]);
  }
  const hysteresisLoss = totalUsd > 0
    ? Math.round((asymmetryArea / totalUsd) * 1000) / 1000
    : 0;

  // Quality factor: Q = 1/(loss factor)
  const lossFactor = hysteresisLoss + leakageCurrent * 0.1 + coeffOfVariation * 0.1;
  const qualityFactor = lossFactor > 0
    ? Math.round((1 / lossFactor) * 100) / 100
    : 100;

  // Composite capacitance index (0-100)
  const chargeScore = Math.min(20, chargeDistributionEntropy * 20);
  const strengthScore = Math.min(20, dielectricStrength * 20);
  const headroomScore = Math.min(20, (1 - chargeLevel) * 20);
  const qualityScore = Math.min(20, Math.min(qualityFactor, 10) * 2);
  const seriesScore = Math.min(20, (seriesCapacitance / (avgBinCapacitance + 0.01)) * 20);
  const capacitanceIndex = Math.round(
    Math.min(100, chargeScore + strengthScore + headroomScore + qualityScore + seriesScore)
  );

  // Saturation state
  let saturationState: string;
  if (chargeLevel < 0.2) saturationState = "DEPLETED";
  else if (chargeLevel < 0.4) saturationState = "UNDERCHARGED";
  else if (chargeLevel < 0.6) saturationState = "BALANCED";
  else if (chargeLevel < 0.8) saturationState = "WELL_CHARGED";
  else saturationState = "SATURATED";

  // Circuit class
  let circuitClass: string;
  if (capacitanceIndex >= 80) circuitClass = "SUPERCAPACITOR";
  else if (capacitanceIndex >= 60) circuitClass = "HIGH_CAPACITY";
  else if (capacitanceIndex >= 40) circuitClass = "STANDARD";
  else if (capacitanceIndex >= 20) circuitClass = "LOW_CAPACITY";
  else circuitClass = "DEPLETED_CELL";

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsAnalyzed: n,
    totalUsd: Math.round(totalUsd * 100) / 100,
    totalCapacitance,
    avgBinCapacitance,
    maxCapacitanceBin: sorted[maxCapIdx].binId,
    maxCapacitanceValue: Math.round(binCapacitances[maxCapIdx] * 100) / 100,
    minCapacitanceBin: sorted[minCapIdx].binId,
    minCapacitanceValue: Math.round(binCapacitances[minCapIdx] * 100) / 100,
    chargeLevel,
    dischargeHeadroom,
    dielectricStrength,
    rcTimeConstant,
    impedance,
    reactance,
    resonantFrequency,
    energyStored,
    maxEnergyCapacity,
    chargeDistributionEntropy,
    leakageCurrent,
    breakdownRisk,
    parallelCapacitance,
    seriesCapacitance,
    capacitiveGradient,
    polarization,
    hysteresisLoss,
    qualityFactor,
    capacitanceIndex,
    saturationState,
    circuitClass,
    tvlUsd: pool.tvlUsd,
  };
}

function computeGini(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const total = sorted.reduce((s, v) => s + v, 0);
  if (total === 0 || n === 0) return 0;
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sorted[i];
  }
  return Math.round((giniSum / (n * total)) * 1000) / 1000;
}

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Capacitance — Doctor ===\n");
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

  const profiles: CapacitanceProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeCapacitance(bins, pool));
    } catch {
      continue;
    }
  }

  const summary = {
    poolsAnalyzed: profiles.length,
    avgCapacitanceIndex: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + p.capacitanceIndex, 0) / profiles.length) * 10) / 10
      : 0,
    depletedCount: profiles.filter((p) => p.saturationState === "DEPLETED").length,
    underchargedCount: profiles.filter((p) => p.saturationState === "UNDERCHARGED").length,
    balancedCount: profiles.filter((p) => p.saturationState === "BALANCED").length,
    wellChargedCount: profiles.filter((p) => p.saturationState === "WELL_CHARGED").length,
    saturatedCount: profiles.filter((p) => p.saturationState === "SATURATED").length,
    avgChargeLevel: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + p.chargeLevel, 0) / profiles.length) * 1000) / 1000
      : 0,
    avgDielectricStrength: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + p.dielectricStrength, 0) / profiles.length) * 1000) / 1000
      : 0,
    avgBreakdownRisk: profiles.length > 0
      ? Math.round(profiles.reduce((s, p) => s + p.breakdownRisk, 0) / profiles.length)
      : 0,
    avgQualityFactor: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + p.qualityFactor, 0) / profiles.length) * 100) / 100
      : 0,
    avgPolarization: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + Math.abs(p.polarization), 0) / profiles.length) * 1000) / 1000
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-capacitance").description("HODLMM bin capacitance analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze capacitance")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
