#!/usr/bin/env bun
/**
 * hodlmm-bin-ionization.ts — Day 148 cocoa007 Bitflow Skills Comp
 *
 * Ionization analyzer — models how bins are stripped of reserves
 * under increasing energy input, like atoms losing electrons
 * through successive ionization stages.
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

interface BinIonization {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  ionizationStage: number;
  ionizationEnergy: number;
  electronShells: number;
  outerShellOccupancy: number;
  electronAffinity: number;
  ionizationPotential: number;
  recombinationRate: number;
  chargeState: number;
  effectiveNuclearCharge: number;
  shieldingConstant: number;
  ionicRadius: number;
  plasmaFrequency: number;
  photoionizationCrossSection: number;
  augerProbability: number;
  electronTemperature: number;
}

interface IonizationProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgIonizationStage: number;
  maxIonizationStage: number;
  avgIonizationEnergy: number;
  totalIonizationEnergy: number;
  avgElectronShells: number;
  avgOuterShellOccupancy: number;
  avgElectronAffinity: number;
  avgIonizationPotential: number;
  avgRecombinationRate: number;
  maxRecombinationRate: number;
  avgChargeState: number;
  maxChargeState: number;
  avgEffectiveNuclearCharge: number;
  avgShieldingConstant: number;
  avgIonicRadius: number;
  avgPlasmaFrequency: number;
  avgPhotoionizationCrossSection: number;
  avgAugerProbability: number;
  avgElectronTemperature: number;
  maxElectronTemperature: number;
  fullyIonizedCount: number;
  fullyIonizedFraction: number;
  neutralCount: number;
  neutralFraction: number;
  ionizationGini: number;
  ionizationIndex: number;
  ionizationPhase: string;
  ionizationVerdict: string;
  topBins: BinIonization[];
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

function computeBinIonization(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  maxReserve: number
): BinIonization {
  const distance = Math.abs(bin.binId - activeBin);
  const sorted = [...allBins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const binIndex = sorted.findIndex((b) => b.binId === bin.binId);
  const reserveFraction = maxReserve > 0 ? bin.totalUsd / maxReserve : 0;

  const neighbors = sorted.filter(
    (b) => Math.abs(b.binId - bin.binId) <= 3 && b.binId !== bin.binId
  );
  const neighborAvg = neighbors.length > 0
    ? neighbors.reduce((s, b) => s + b.totalUsd, 0) / neighbors.length
    : 0;

  const shellThresholds = [0.2, 0.4, 0.6, 0.8, 1.0];
  const electronShells = shellThresholds.filter((t) => reserveFraction >= t * 0.1).length || 1;
  const maxShells = 5;

  const depletionRatio = 1 - reserveFraction;
  const ionizationStage = Math.min(maxShells, Math.round(depletionRatio * maxShells));

  const outerShellOccupancy = r4(
    reserveFraction > 0
      ? Math.min(1, (reserveFraction * maxShells) % 1 || (reserveFraction === 1 ? 1 : 0))
      : 0
  );
  if (outerShellOccupancy === 0 && reserveFraction > 0) {
    // partial shell
  }
  const adjustedOuter = reserveFraction > 0 ? r4(Math.max(0.01, reserveFraction - Math.floor(reserveFraction * maxShells) / maxShells) * maxShells) : 0;

  const ionizationEnergy = r4(
    bin.totalUsd > 0
      ? Math.min(10, (bin.totalUsd / Math.max(1, volume24hUsd)) * n * (ionizationStage + 1))
      : 0
  );

  const electronAffinity = r4(
    Math.min(1, reserveFraction * (neighborAvg > 0 ? Math.min(2, neighborAvg / (bin.totalUsd || 1)) : 0.5))
  );

  const ionizationPotential = r4(
    Math.min(10, ionizationEnergy * (1 + ionizationStage * 0.3))
  );

  const volumeRatio = volume24hUsd > 0 ? volume24hUsd / (totalUsd || 1) : 0;
  const recombinationRate = r4(
    Math.min(1, electronAffinity * (1 - volumeRatio) * reserveFraction)
  );

  const chargeState = r4(ionizationStage / maxShells);

  const effectiveNuclearCharge = r4(
    reserveFraction > 0
      ? Math.min(5, (bin.totalUsd / (totalUsd / n || 1)) * (1 + ionizationStage * 0.2))
      : 0
  );

  const shieldingConstant = r4(
    neighborAvg > 0
      ? Math.min(1, neighborAvg / (maxReserve || 1))
      : 0
  );

  const ionicRadius = r4(
    chargeState > 0
      ? Math.min(5, (1 - reserveFraction) * (1 + chargeState) * 2)
      : reserveFraction > 0 ? r4(1 - reserveFraction) : 1
  );

  const plasmaFrequency = r4(
    Math.min(1, Math.sqrt(chargeState * volumeRatio))
  );

  const photoionizationCrossSection = r4(
    Math.min(1, (1 - reserveFraction) * (distance > 0 ? Math.min(2, distance / 15) : 0.5) * volumeRatio)
  );

  const localVariance = neighbors.length > 0
    ? neighbors.reduce((s, b) => s + Math.abs(b.totalUsd - bin.totalUsd), 0) / neighbors.length / (maxReserve || 1)
    : 0;
  const augerProbability = r4(
    Math.min(1, localVariance * chargeState * 2)
  );

  const electronTemperature = r4(
    Math.min(1, volumeRatio * (1 + localVariance))
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    ionizationStage,
    ionizationEnergy,
    electronShells,
    outerShellOccupancy: adjustedOuter,
    electronAffinity,
    ionizationPotential,
    recombinationRate,
    chargeState,
    effectiveNuclearCharge,
    shieldingConstant,
    ionicRadius,
    plasmaFrequency,
    photoionizationCrossSection,
    augerProbability,
    electronTemperature,
  };
}

function analyzeIonization(bins: BinReserves[], pool: AppPool): IonizationProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));

  const binIon = sorted.map((b) =>
    computeBinIonization(b, activeBin, sorted, totalUsd, volume, maxReserve)
  );

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgIonizationStage = r4(avg(binIon.map((b) => b.ionizationStage)));
  const maxIonizationStage = Math.max(...binIon.map((b) => b.ionizationStage));
  const avgIonizationEnergy = r4(avg(binIon.map((b) => b.ionizationEnergy)));
  const totalIonizationEnergy = r4(binIon.reduce((s, b) => s + b.ionizationEnergy, 0));
  const avgElectronShells = r4(avg(binIon.map((b) => b.electronShells)));
  const avgOuterShellOccupancy = r4(avg(binIon.map((b) => b.outerShellOccupancy)));
  const avgElectronAffinity = r4(avg(binIon.map((b) => b.electronAffinity)));
  const avgIonizationPotential = r4(avg(binIon.map((b) => b.ionizationPotential)));
  const avgRecombinationRate = r4(avg(binIon.map((b) => b.recombinationRate)));
  const maxRecombinationRate = r4(Math.max(...binIon.map((b) => b.recombinationRate)));
  const avgChargeState = r4(avg(binIon.map((b) => b.chargeState)));
  const maxChargeState = r4(Math.max(...binIon.map((b) => b.chargeState)));
  const avgEffectiveNuclearCharge = r4(avg(binIon.map((b) => b.effectiveNuclearCharge)));
  const avgShieldingConstant = r4(avg(binIon.map((b) => b.shieldingConstant)));
  const avgIonicRadius = r4(avg(binIon.map((b) => b.ionicRadius)));
  const avgPlasmaFrequency = r4(avg(binIon.map((b) => b.plasmaFrequency)));
  const avgPhotoionizationCrossSection = r4(avg(binIon.map((b) => b.photoionizationCrossSection)));
  const avgAugerProbability = r4(avg(binIon.map((b) => b.augerProbability)));
  const avgElectronTemperature = r4(avg(binIon.map((b) => b.electronTemperature)));
  const maxElectronTemperature = r4(Math.max(...binIon.map((b) => b.electronTemperature)));
  const fullyIonizedCount = binIon.filter((b) => b.ionizationStage >= 4).length;
  const fullyIonizedFraction = r4(fullyIonizedCount / n);
  const neutralCount = binIon.filter((b) => b.ionizationStage === 0).length;
  const neutralFraction = r4(neutralCount / n);

  const reserves = sorted.map((b) => b.totalUsd);
  const sortedReserves = [...reserves].sort((a, b) => b - a);
  const totalRes = sortedReserves.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedReserves[i];
  }
  const ionizationGini = totalRes > 0
    ? r4(Math.abs(giniSum) / (n * totalRes))
    : 0;

  const chargeScore = Math.min(25, avgChargeState * 25);
  const depletionScore = Math.min(25, fullyIonizedFraction * 25);
  const temperatureScore = Math.min(25, avgElectronTemperature * 25);
  const affinityInverse = Math.min(25, (1 - avgRecombinationRate) * 25);
  const ionizationIndex = Math.round(
    Math.min(100, chargeScore + depletionScore + temperatureScore + affinityInverse)
  );

  let ionizationPhase: string;
  if (ionizationIndex >= 80) ionizationPhase = "PLASMA";
  else if (ionizationIndex >= 60) ionizationPhase = "IONIZED";
  else if (ionizationIndex >= 40) ionizationPhase = "PARTIALLY_IONIZED";
  else if (ionizationIndex >= 20) ionizationPhase = "WEAKLY_IONIZED";
  else ionizationPhase = "NEUTRAL";

  let ionizationVerdict: string;
  if (fullyIonizedFraction > 0.5 && avgElectronTemperature > 0.5)
    ionizationVerdict = "THERMAL_PLASMA";
  else if (avgChargeState > 0.6 && avgRecombinationRate < 0.2)
    ionizationVerdict = "SUSTAINED_IONIZATION";
  else if (avgRecombinationRate > 0.5 && avgChargeState < 0.3)
    ionizationVerdict = "RECOMBINING";
  else if (neutralFraction > 0.7)
    ionizationVerdict = "GROUND_STATE";
  else
    ionizationVerdict = "MIXED_IONIZATION";

  const topBins = [...binIon]
    .sort((a, b) => b.chargeState - a.chargeState)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgIonizationStage,
    maxIonizationStage,
    avgIonizationEnergy,
    totalIonizationEnergy,
    avgElectronShells,
    avgOuterShellOccupancy,
    avgElectronAffinity,
    avgIonizationPotential,
    avgRecombinationRate,
    maxRecombinationRate,
    avgChargeState,
    maxChargeState,
    avgEffectiveNuclearCharge,
    avgShieldingConstant,
    avgIonicRadius,
    avgPlasmaFrequency,
    avgPhotoionizationCrossSection,
    avgAugerProbability,
    avgElectronTemperature,
    maxElectronTemperature,
    fullyIonizedCount,
    fullyIonizedFraction,
    neutralCount,
    neutralFraction,
    ionizationGini,
    ionizationIndex,
    ionizationPhase,
    ionizationVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Ionization — Doctor ===\n");
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

  const profiles: IonizationProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeIonization(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgIonizationIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.ionizationIndex)))
      : 0,
    plasmaCount: profiles.filter((p) => p.ionizationPhase === "PLASMA").length,
    ionizedCount: profiles.filter((p) => p.ionizationPhase === "IONIZED").length,
    partiallyIonizedCount: profiles.filter((p) => p.ionizationPhase === "PARTIALLY_IONIZED").length,
    weaklyIonizedCount: profiles.filter((p) => p.ionizationPhase === "WEAKLY_IONIZED").length,
    neutralCount: profiles.filter((p) => p.ionizationPhase === "NEUTRAL").length,
    avgChargeState: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgChargeState)))
      : 0,
    avgRecombinationRate: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgRecombinationRate)))
      : 0,
    totalFullyIonized: profiles.reduce((s, p) => s + p.fullyIonizedCount, 0),
    avgIonizationGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.ionizationGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-ionization").description("HODLMM bin ionization analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin ionization dynamics")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
