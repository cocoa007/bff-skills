#!/usr/bin/env bun
/**
 * hodlmm-bin-piezoelectric.ts — Day 156 cocoa007 Bitflow Skills Comp
 *
 * Piezoelectric analyzer — models stress-to-charge conversion across HODLMM bins.
 * Trade pressure acts as mechanical stress applied to crystalline bin reserves;
 * fee yield acts as electrical charge generated through the direct piezoelectric
 * effect. Coupling factor, charge density, voltage output, and quality factor
 * metrics reveal transduction efficiency across the bin lattice.
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

interface BinPiezoelectric {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  stressTensor: number;
  strainResponse: number;
  chargeDensity: number;
  piezoCoefficient: number;
  voltageOutput: number;
  couplingFactor: number;
  dielectricConstant: number;
  crystalSymmetry: number;
  polingField: number;
  hysteresisLoss: number;
  depolarization: number;
  curieTemperature: number;
  mechanicalQuality: number;
  piezoelectricFactor: number;
}

interface PiezoelectricProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgStressTensor: number;
  maxStressTensor: number;
  avgStrainResponse: number;
  maxStrainResponse: number;
  avgChargeDensity: number;
  maxChargeDensity: number;
  avgPiezoCoefficient: number;
  maxPiezoCoefficient: number;
  avgVoltageOutput: number;
  maxVoltageOutput: number;
  avgCouplingFactor: number;
  maxCouplingFactor: number;
  avgDielectricConstant: number;
  maxDielectricConstant: number;
  avgCrystalSymmetry: number;
  maxCrystalSymmetry: number;
  avgPolingField: number;
  maxPolingField: number;
  avgHysteresisLoss: number;
  maxHysteresisLoss: number;
  avgDepolarization: number;
  maxDepolarization: number;
  avgCurieTemperature: number;
  maxCurieTemperature: number;
  avgMechanicalQuality: number;
  maxMechanicalQuality: number;
  efficientTransducerCount: number;
  efficientTransducerFraction: number;
  highCouplingCount: number;
  highCouplingFraction: number;
  piezoelectricGini: number;
  piezoelectricIndex: number;
  piezoelectricPhase: string;
  piezoelectricVerdict: string;
  topBins: BinPiezoelectric[];
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

function computeBinPiezoelectric(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  maxReserve: number
): BinPiezoelectric {
  const distance = Math.abs(bin.binId - activeBin);
  const n = allBins.length;
  const reserveFraction = maxReserve > 0 ? bin.totalUsd / maxReserve : 0;
  const volumeRatio = volume24hUsd > 0 ? volume24hUsd / (totalUsd || 1) : 0;

  const neighbors = allBins.filter(
    (b) => Math.abs(b.binId - bin.binId) <= 3 && b.binId !== bin.binId
  );
  const neighborAvg = neighbors.length > 0
    ? neighbors.reduce((s, b) => s + b.totalUsd, 0) / neighbors.length
    : 0;

  const xFraction = bin.totalUsd > 0 ? bin.reserveXUsd / bin.totalUsd : 0.5;
  const yFraction = 1 - xFraction;

  // 1. stressTensor — mechanical stress from trade pressure on this bin
  const stressTensor = r4(
    Math.min(10, volumeRatio * reserveFraction * 7 * (1 + 1 / (1 + distance * 0.25)))
  );

  // 2. strainResponse — deformation of reserve structure under stress
  const strainResponse = r4(
    Math.min(10, stressTensor * (1 - reserveFraction * 0.3) * 1.2)
  );

  // 3. chargeDensity — accumulated fee potential from applied stress
  const feeEstimate = volumeRatio * reserveFraction * (bin.totalUsd / (totalUsd || 1));
  const chargeDensity = r4(
    Math.min(10, feeEstimate * n * 6 * (1 + stressTensor * 0.15))
  );

  // 4. piezoCoefficient — d33, stress-to-charge conversion efficiency
  const piezoCoefficient = r4(
    stressTensor > 0.01
      ? Math.min(1, chargeDensity / (stressTensor * 1.8 + 0.01))
      : 0
  );

  // 5. voltageOutput — realized fee yield from charge separation
  const voltageOutput = r4(
    Math.min(10, chargeDensity * piezoCoefficient * 3 / (1 + distance * 0.05))
  );

  // 6. couplingFactor — k, electromechanical coupling efficiency
  const couplingFactor = r4(
    Math.min(1, Math.sqrt(piezoCoefficient * (voltageOutput / (stressTensor + 0.01))) * 0.8)
  );

  // 7. dielectricConstant — charge storage capacity without release
  const localConcentration = totalUsd > 0 ? bin.totalUsd / totalUsd : 0;
  const dielectricConstant = r4(
    Math.min(10, reserveFraction * n * 0.5 * (1 + localConcentration * 3))
  );

  // 8. crystalSymmetry — structural order of reserve distribution
  const neighborVariance = neighbors.length > 1
    ? neighbors.reduce((s, b) => s + Math.pow(b.totalUsd - neighborAvg, 2), 0) / neighbors.length
    : 0;
  const normalizedStdDev = neighborAvg > 0 ? Math.sqrt(neighborVariance) / neighborAvg : 0;
  const crystalSymmetry = r4(
    Math.min(1, Math.exp(-normalizedStdDev * 1.5) * (1 - Math.abs(xFraction - 0.5) * 0.6))
  );

  // 9. polingField — dipole alignment strength (directional bias in reserves)
  const polingField = r4(
    Math.min(10, Math.abs(xFraction - 0.5) * 2 * stressTensor * (1 + volumeRatio))
  );

  // 10. hysteresisLoss — energy lost in stress-strain cycling
  const hysteresisLoss = r4(
    Math.min(1, (1 - piezoCoefficient) * (1 - crystalSymmetry) * 1.3 + distance * 0.008)
  );

  // 11. depolarization — loss of piezoelectric response over time
  const depolarization = r4(
    Math.min(1, (1 - reserveFraction) * hysteresisLoss * 1.4 + (1 - couplingFactor) * 0.2)
  );

  // 12. curieTemperature — threshold beyond which piezoelectric properties vanish
  const curieTemperature = r4(
    Math.min(10, crystalSymmetry * reserveFraction * 8 + piezoCoefficient * 3)
  );

  // 13. mechanicalQuality — Qm, resonance sharpness
  const mechanicalQuality = r4(
    hysteresisLoss > 0.01
      ? Math.min(10, crystalSymmetry * couplingFactor * 5 / (hysteresisLoss + 0.01))
      : 0
  );

  // 14. piezoelectricFactor — composite 0-1
  const piezoelectricFactor = r4(
    Math.min(1,
      piezoCoefficient * 0.25 +
      voltageOutput / 10 * 0.25 +
      couplingFactor * 0.2 +
      crystalSymmetry * 0.15 +
      (1 - hysteresisLoss) * 0.15
    )
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    stressTensor,
    strainResponse,
    chargeDensity,
    piezoCoefficient,
    voltageOutput,
    couplingFactor,
    dielectricConstant,
    crystalSymmetry,
    polingField,
    hysteresisLoss,
    depolarization,
    curieTemperature,
    mechanicalQuality,
    piezoelectricFactor,
  };
}

function analyzePiezoelectric(bins: BinReserves[], pool: AppPool): PiezoelectricProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));

  const binPz = sorted.map((b) =>
    computeBinPiezoelectric(b, activeBin, sorted, totalUsd, volume, maxReserve)
  );

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgStressTensor = r4(avg(binPz.map((b) => b.stressTensor)));
  const maxStressTensor = r4(Math.max(...binPz.map((b) => b.stressTensor)));
  const avgStrainResponse = r4(avg(binPz.map((b) => b.strainResponse)));
  const maxStrainResponse = r4(Math.max(...binPz.map((b) => b.strainResponse)));
  const avgChargeDensity = r4(avg(binPz.map((b) => b.chargeDensity)));
  const maxChargeDensity = r4(Math.max(...binPz.map((b) => b.chargeDensity)));
  const avgPiezoCoefficient = r4(avg(binPz.map((b) => b.piezoCoefficient)));
  const maxPiezoCoefficient = r4(Math.max(...binPz.map((b) => b.piezoCoefficient)));
  const avgVoltageOutput = r4(avg(binPz.map((b) => b.voltageOutput)));
  const maxVoltageOutput = r4(Math.max(...binPz.map((b) => b.voltageOutput)));
  const avgCouplingFactor = r4(avg(binPz.map((b) => b.couplingFactor)));
  const maxCouplingFactor = r4(Math.max(...binPz.map((b) => b.couplingFactor)));
  const avgDielectricConstant = r4(avg(binPz.map((b) => b.dielectricConstant)));
  const maxDielectricConstant = r4(Math.max(...binPz.map((b) => b.dielectricConstant)));
  const avgCrystalSymmetry = r4(avg(binPz.map((b) => b.crystalSymmetry)));
  const maxCrystalSymmetry = r4(Math.max(...binPz.map((b) => b.crystalSymmetry)));
  const avgPolingField = r4(avg(binPz.map((b) => b.polingField)));
  const maxPolingField = r4(Math.max(...binPz.map((b) => b.polingField)));
  const avgHysteresisLoss = r4(avg(binPz.map((b) => b.hysteresisLoss)));
  const maxHysteresisLoss = r4(Math.max(...binPz.map((b) => b.hysteresisLoss)));
  const avgDepolarization = r4(avg(binPz.map((b) => b.depolarization)));
  const maxDepolarization = r4(Math.max(...binPz.map((b) => b.depolarization)));
  const avgCurieTemperature = r4(avg(binPz.map((b) => b.curieTemperature)));
  const maxCurieTemperature = r4(Math.max(...binPz.map((b) => b.curieTemperature)));
  const avgMechanicalQuality = r4(avg(binPz.map((b) => b.mechanicalQuality)));
  const maxMechanicalQuality = r4(Math.max(...binPz.map((b) => b.mechanicalQuality)));
  const efficientTransducerCount = binPz.filter((b) => b.piezoCoefficient > 0.5).length;
  const efficientTransducerFraction = r4(efficientTransducerCount / n);
  const highCouplingCount = binPz.filter((b) => b.couplingFactor > 0.5).length;
  const highCouplingFraction = r4(highCouplingCount / n);

  const pzFactors = binPz.map((b) => b.piezoelectricFactor);
  const sortedFactors = [...pzFactors].sort((a, b) => b - a);
  const totalFactors = sortedFactors.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedFactors[i];
  }
  const piezoelectricGini = totalFactors > 0
    ? r4(Math.abs(giniSum) / (n * totalFactors))
    : 0;

  const coeffScore = Math.min(25, avgPiezoCoefficient * 25);
  const voltageScore = Math.min(25, avgVoltageOutput / 10 * 25);
  const couplingScore = Math.min(25, avgCouplingFactor * 25);
  const symmetryScore = Math.min(25, avgCrystalSymmetry * 25);
  const piezoelectricIndex = Math.round(
    Math.min(100, coeffScore + voltageScore + couplingScore + symmetryScore)
  );

  let piezoelectricPhase: string;
  if (piezoelectricIndex >= 80) piezoelectricPhase = "RESONANT_TRANSDUCER";
  else if (piezoelectricIndex >= 60) piezoelectricPhase = "STRONG_PIEZO";
  else if (piezoelectricIndex >= 40) piezoelectricPhase = "MODERATE_RESPONSE";
  else if (piezoelectricIndex >= 20) piezoelectricPhase = "WEAK_PIEZO";
  else piezoelectricPhase = "INERT_CRYSTAL";

  let piezoelectricVerdict: string;
  if (avgPiezoCoefficient > 0.6 && avgVoltageOutput > 3)
    piezoelectricVerdict = "POWER_HARVEST";
  else if (avgMechanicalQuality > 4 && avgCouplingFactor > 0.5)
    piezoelectricVerdict = "RESONANT_AMPLIFIER";
  else if (avgDielectricConstant > 5 && avgVoltageOutput < 2)
    piezoelectricVerdict = "DIELECTRIC_SATURATION";
  else if (avgCouplingFactor > 0.4 && avgHysteresisLoss < 0.3)
    piezoelectricVerdict = "EFFICIENT_TRANSDUCER";
  else if (avgDepolarization > 0.5 && avgPiezoCoefficient < 0.2)
    piezoelectricVerdict = "DEPOLARIZED_CRYSTAL";
  else
    piezoelectricVerdict = "EFFICIENT_TRANSDUCER";

  const topBins = [...binPz]
    .sort((a, b) => b.piezoelectricFactor - a.piezoelectricFactor)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgStressTensor,
    maxStressTensor,
    avgStrainResponse,
    maxStrainResponse,
    avgChargeDensity,
    maxChargeDensity,
    avgPiezoCoefficient,
    maxPiezoCoefficient,
    avgVoltageOutput,
    maxVoltageOutput,
    avgCouplingFactor,
    maxCouplingFactor,
    avgDielectricConstant,
    maxDielectricConstant,
    avgCrystalSymmetry,
    maxCrystalSymmetry,
    avgPolingField,
    maxPolingField,
    avgHysteresisLoss,
    maxHysteresisLoss,
    avgDepolarization,
    maxDepolarization,
    avgCurieTemperature,
    maxCurieTemperature,
    avgMechanicalQuality,
    maxMechanicalQuality,
    efficientTransducerCount,
    efficientTransducerFraction,
    highCouplingCount,
    highCouplingFraction,
    piezoelectricGini,
    piezoelectricIndex,
    piezoelectricPhase,
    piezoelectricVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Piezoelectric — Doctor ===\n");
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

  const profiles: PiezoelectricProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzePiezoelectric(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgPiezoelectricIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.piezoelectricIndex)))
      : 0,
    resonantTransducerCount: profiles.filter((p) => p.piezoelectricPhase === "RESONANT_TRANSDUCER").length,
    strongPiezoCount: profiles.filter((p) => p.piezoelectricPhase === "STRONG_PIEZO").length,
    moderateResponseCount: profiles.filter((p) => p.piezoelectricPhase === "MODERATE_RESPONSE").length,
    weakPiezoCount: profiles.filter((p) => p.piezoelectricPhase === "WEAK_PIEZO").length,
    inertCrystalCount: profiles.filter((p) => p.piezoelectricPhase === "INERT_CRYSTAL").length,
    avgPiezoCoefficient: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgPiezoCoefficient)))
      : 0,
    avgVoltageOutput: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgVoltageOutput)))
      : 0,
    totalEfficientTransducerBins: profiles.reduce((s, p) => s + p.efficientTransducerCount, 0),
    avgPiezoelectricGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.piezoelectricGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-piezoelectric").description("HODLMM bin piezoelectric analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin piezoelectric dynamics")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
