#!/usr/bin/env bun
/**
 * hodlmm-bin-effusion.ts — Day 150 cocoa007 Bitflow Skills Comp
 *
 * Effusion analyzer — models the escape of reserve "molecules" through
 * narrow openings (gaps between populated bins) into vacuum (depleted
 * regions). Graham's law: lighter molecules (lower reserves) effuse
 * faster. Knudsen number distinguishes true effusion from bulk flow.
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

interface BinEffusion {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  molecularMass: number;
  kineticEnergy: number;
  maxwellSpeed: number;
  orificeArea: number;
  pressureDifferential: number;
  effusionRate: number;
  meanFreePath: number;
  knudsenNumber: number;
  collisionFrequency: number;
  escapeVelocity: number;
  thermalVelocity: number;
  effusionFlux: number;
  residenceTime: number;
  backflowRate: number;
}

interface EffusionProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgMolecularMass: number;
  minMolecularMass: number;
  avgKineticEnergy: number;
  avgMaxwellSpeed: number;
  maxMaxwellSpeed: number;
  avgOrificeArea: number;
  maxOrificeArea: number;
  avgPressureDifferential: number;
  maxPressureDifferential: number;
  avgEffusionRate: number;
  maxEffusionRate: number;
  avgMeanFreePath: number;
  avgKnudsenNumber: number;
  maxKnudsenNumber: number;
  avgCollisionFrequency: number;
  avgEscapeVelocity: number;
  avgThermalVelocity: number;
  maxThermalVelocity: number;
  avgEffusionFlux: number;
  maxEffusionFlux: number;
  avgResidenceTime: number;
  minResidenceTime: number;
  avgBackflowRate: number;
  maxBackflowRate: number;
  highEffusionCount: number;
  highEffusionFraction: number;
  containedCount: number;
  containedFraction: number;
  effusionGini: number;
  effusionIndex: number;
  effusionPhase: string;
  effusionVerdict: string;
  topBins: BinEffusion[];
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

function computeBinEffusion(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  maxReserve: number
): BinEffusion {
  const distance = Math.abs(bin.binId - activeBin);
  const sorted = [...allBins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const reserveFraction = maxReserve > 0 ? bin.totalUsd / maxReserve : 0;
  const volumeRatio = volume24hUsd > 0 ? volume24hUsd / (totalUsd || 1) : 0;

  const neighbors = sorted.filter(
    (b) => Math.abs(b.binId - bin.binId) <= 3 && b.binId !== bin.binId
  );
  const neighborAvg = neighbors.length > 0
    ? neighbors.reduce((s, b) => s + b.totalUsd, 0) / neighbors.length
    : 0;

  // Find gaps to immediate neighbors (populated bins)
  const binIdx = sorted.findIndex((b) => b.binId === bin.binId);
  const leftGap = binIdx > 0 ? bin.binId - sorted[binIdx - 1].binId : BIN_SCAN_RADIUS;
  const rightGap = binIdx < n - 1 ? sorted[binIdx + 1].binId - bin.binId : BIN_SCAN_RADIUS;
  const avgGap = (leftGap + rightGap) / 2;

  // 1. molecularMass — reserve depth as inertial mass (heavier = slower effusion)
  const molecularMass = r4(
    Math.min(10, reserveFraction * 10)
  );

  // 2. kineticEnergy — thermal energy from trading volume driving molecular motion
  const kineticEnergy = r4(
    Math.min(10, volumeRatio * (1 + distance * 0.05) * 5)
  );

  // 3. maxwellSpeed — most probable molecular speed: sqrt(kineticEnergy / mass)
  const maxwellSpeed = r4(
    molecularMass > 0.01
      ? Math.min(10, Math.sqrt(kineticEnergy / molecularMass))
      : kineticEnergy > 0 ? 10 : 0
  );

  // 4. orificeArea — gap size between this bin and neighbors (wider gap = faster effusion)
  const orificeArea = r4(
    Math.min(1, avgGap / BIN_SCAN_RADIUS)
  );

  // 5. pressureDifferential — reserve imbalance with neighbors driving directional flow
  const pressureDifferential = r4(
    neighborAvg > 0
      ? Math.min(1, Math.abs(bin.totalUsd - neighborAvg) / (maxReserve || 1))
      : reserveFraction
  );

  // 6. effusionRate — Graham's law: inversely proportional to sqrt(molecularMass)
  const grahamsInverse = molecularMass > 0.01
    ? 1 / Math.sqrt(molecularMass)
    : 10;
  const effusionRate = r4(
    Math.min(1, (grahamsInverse / 10) * orificeArea * pressureDifferential * (1 + volumeRatio))
  );

  // 7. meanFreePath — average distance before colliding with another bin's reserves
  const density = n > 0 ? n / (BIN_SCAN_RADIUS * 2 + 1) : 0;
  const meanFreePath = r4(
    density > 0.01
      ? Math.min(10, 1 / (density * (reserveFraction + 0.01)))
      : 10
  );

  // 8. knudsenNumber — meanFreePath / orifice diameter; Kn >> 1 = true effusion
  const orificeDiameter = Math.max(0.01, orificeArea);
  const knudsenNumber = r4(
    Math.min(100, meanFreePath / orificeDiameter)
  );

  // 9. collisionFrequency — how often reserves interact with bin boundaries
  const collisionFrequency = r4(
    Math.min(1, volumeRatio * reserveFraction * (1 + 1 / (meanFreePath + 0.1)))
  );

  // 10. escapeVelocity — minimum speed to permanently leave the bin
  const latticeBinding = reserveFraction * (1 + (neighborAvg / (maxReserve || 1)));
  const escapeVelocity = r4(
    Math.min(10, Math.sqrt(2 * latticeBinding * n * 0.5))
  );

  // 11. thermalVelocity — RMS speed of reserve movement from volume fluctuations
  const thermalVelocity = r4(
    molecularMass > 0.01
      ? Math.min(10, Math.sqrt(3 * kineticEnergy / molecularMass))
      : kineticEnergy > 0 ? 10 : 0
  );

  // 12. effusionFlux — mass flow rate through the orifice per unit area
  const effusionFlux = r4(
    Math.min(1, effusionRate * pressureDifferential * (1 + orificeArea))
  );

  // 13. residenceTime — expected time reserves remain before effusing out
  const residenceTime = r4(
    effusionRate > 0.001
      ? Math.min(100, molecularMass / effusionRate)
      : 100
  );

  // 14. backflowRate — reverse effusion from neighbors back into this bin
  const neighborPressure = neighbors.length > 0
    ? neighbors.reduce((s, b) => s + b.totalUsd, 0) / (totalUsd || 1)
    : 0;
  const backflowRate = r4(
    Math.min(1, neighborPressure * orificeArea * (1 - reserveFraction) * (1 + volumeRatio * 0.5))
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    molecularMass,
    kineticEnergy,
    maxwellSpeed,
    orificeArea,
    pressureDifferential,
    effusionRate,
    meanFreePath,
    knudsenNumber,
    collisionFrequency,
    escapeVelocity,
    thermalVelocity,
    effusionFlux,
    residenceTime,
    backflowRate,
  };
}

function analyzeEffusion(bins: BinReserves[], pool: AppPool): EffusionProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));

  const binEff = sorted.map((b) =>
    computeBinEffusion(b, activeBin, sorted, totalUsd, volume, maxReserve)
  );

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgMolecularMass = r4(avg(binEff.map((b) => b.molecularMass)));
  const minMolecularMass = r4(Math.min(...binEff.map((b) => b.molecularMass)));
  const avgKineticEnergy = r4(avg(binEff.map((b) => b.kineticEnergy)));
  const avgMaxwellSpeed = r4(avg(binEff.map((b) => b.maxwellSpeed)));
  const maxMaxwellSpeed = r4(Math.max(...binEff.map((b) => b.maxwellSpeed)));
  const avgOrificeArea = r4(avg(binEff.map((b) => b.orificeArea)));
  const maxOrificeArea = r4(Math.max(...binEff.map((b) => b.orificeArea)));
  const avgPressureDifferential = r4(avg(binEff.map((b) => b.pressureDifferential)));
  const maxPressureDifferential = r4(Math.max(...binEff.map((b) => b.pressureDifferential)));
  const avgEffusionRate = r4(avg(binEff.map((b) => b.effusionRate)));
  const maxEffusionRate = r4(Math.max(...binEff.map((b) => b.effusionRate)));
  const avgMeanFreePath = r4(avg(binEff.map((b) => b.meanFreePath)));
  const avgKnudsenNumber = r4(avg(binEff.map((b) => b.knudsenNumber)));
  const maxKnudsenNumber = r4(Math.max(...binEff.map((b) => b.knudsenNumber)));
  const avgCollisionFrequency = r4(avg(binEff.map((b) => b.collisionFrequency)));
  const avgEscapeVelocity = r4(avg(binEff.map((b) => b.escapeVelocity)));
  const avgThermalVelocity = r4(avg(binEff.map((b) => b.thermalVelocity)));
  const maxThermalVelocity = r4(Math.max(...binEff.map((b) => b.thermalVelocity)));
  const avgEffusionFlux = r4(avg(binEff.map((b) => b.effusionFlux)));
  const maxEffusionFlux = r4(Math.max(...binEff.map((b) => b.effusionFlux)));
  const avgResidenceTime = r4(avg(binEff.map((b) => b.residenceTime)));
  const minResidenceTime = r4(Math.min(...binEff.map((b) => b.residenceTime)));
  const avgBackflowRate = r4(avg(binEff.map((b) => b.backflowRate)));
  const maxBackflowRate = r4(Math.max(...binEff.map((b) => b.backflowRate)));
  const highEffusionCount = binEff.filter((b) => b.effusionRate > 0.3).length;
  const highEffusionFraction = r4(highEffusionCount / n);
  const containedCount = binEff.filter((b) => b.effusionRate < 0.05).length;
  const containedFraction = r4(containedCount / n);

  // Gini coefficient on effusion rates
  const rates = binEff.map((b) => b.effusionRate);
  const sortedRates = [...rates].sort((a, b) => b - a);
  const totalRates = sortedRates.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedRates[i];
  }
  const effusionGini = totalRates > 0
    ? r4(Math.abs(giniSum) / (n * totalRates))
    : 0;

  // Composite effusion index (0-100)
  const effusionRateScore = Math.min(25, avgEffusionRate * 50);
  const fluxScore = Math.min(25, avgEffusionFlux * 50);
  const speedScore = Math.min(25, (avgMaxwellSpeed / 10) * 25);
  const pressureScore = Math.min(25, avgPressureDifferential * 25);
  const effusionIndex = Math.round(
    Math.min(100, effusionRateScore + fluxScore + speedScore + pressureScore)
  );

  let effusionPhase: string;
  if (effusionIndex >= 80) effusionPhase = "EXPLOSIVE_EFFUSION";
  else if (effusionIndex >= 60) effusionPhase = "RAPID_EFFUSION";
  else if (effusionIndex >= 40) effusionPhase = "MODERATE_EFFUSION";
  else if (effusionIndex >= 20) effusionPhase = "SLOW_EFFUSION";
  else effusionPhase = "CONTAINED";

  let effusionVerdict: string;
  if (highEffusionFraction > 0.4 && maxPressureDifferential > 0.6)
    effusionVerdict = "PRESSURE_BLOWOUT";
  else if (highEffusionFraction < 0.15 && maxEffusionRate > 0.5)
    effusionVerdict = "SELECTIVE_LEAK";
  else if (avgBackflowRate > 0.15 && Math.abs(avgEffusionRate - avgBackflowRate) < 0.1)
    effusionVerdict = "THERMAL_EQUILIBRIUM";
  else if (containedFraction > 0.7)
    effusionVerdict = "VACUUM_SEAL";
  else if (avgKnudsenNumber < 1)
    effusionVerdict = "BULK_FLOW";
  else
    effusionVerdict = "THERMAL_EQUILIBRIUM";

  const topBins = [...binEff]
    .sort((a, b) => b.effusionRate - a.effusionRate)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgMolecularMass,
    minMolecularMass,
    avgKineticEnergy,
    avgMaxwellSpeed,
    maxMaxwellSpeed,
    avgOrificeArea,
    maxOrificeArea,
    avgPressureDifferential,
    maxPressureDifferential,
    avgEffusionRate,
    maxEffusionRate,
    avgMeanFreePath,
    avgKnudsenNumber,
    maxKnudsenNumber,
    avgCollisionFrequency,
    avgEscapeVelocity,
    avgThermalVelocity,
    maxThermalVelocity,
    avgEffusionFlux,
    maxEffusionFlux,
    avgResidenceTime,
    minResidenceTime,
    avgBackflowRate,
    maxBackflowRate,
    highEffusionCount,
    highEffusionFraction,
    containedCount,
    containedFraction,
    effusionGini,
    effusionIndex,
    effusionPhase,
    effusionVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Effusion — Doctor ===\n");
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

  const profiles: EffusionProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeEffusion(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgEffusionIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.effusionIndex)))
      : 0,
    explosiveEffusionCount: profiles.filter((p) => p.effusionPhase === "EXPLOSIVE_EFFUSION").length,
    rapidEffusionCount: profiles.filter((p) => p.effusionPhase === "RAPID_EFFUSION").length,
    moderateEffusionCount: profiles.filter((p) => p.effusionPhase === "MODERATE_EFFUSION").length,
    slowEffusionCount: profiles.filter((p) => p.effusionPhase === "SLOW_EFFUSION").length,
    containedCount: profiles.filter((p) => p.effusionPhase === "CONTAINED").length,
    avgEffusionRate: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgEffusionRate)))
      : 0,
    avgPressureDifferential: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgPressureDifferential)))
      : 0,
    totalHighEffusionBins: profiles.reduce((s, p) => s + p.highEffusionCount, 0),
    avgEffusionGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.effusionGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-effusion").description("HODLMM bin effusion analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin effusion dynamics")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
