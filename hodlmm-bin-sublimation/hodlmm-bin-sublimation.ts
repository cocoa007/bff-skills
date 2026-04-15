#!/usr/bin/env bun
/**
 * hodlmm-bin-sublimation.ts — Day 149 cocoa007 Bitflow Skills Comp
 *
 * Sublimation analyzer — models the direct phase transition from solid
 * (concentrated, locked reserves) to gas (rapid dispersal) without
 * passing through a liquid intermediate, capturing sudden reserve
 * evaporation dynamics in HODLMM bins.
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

interface BinSublimation {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  vaporPressure: number;
  sublimationEnthalpy: number;
  latticeEnergy: number;
  surfaceArea: number;
  desorptionRate: number;
  clausiusClapeyronSlope: number;
  triplePointDistance: number;
  sublimationFlux: number;
  condensationCoefficient: number;
  netSublimationRate: number;
  vaporFraction: number;
  solidFraction: number;
  frostLine: number;
  depositionRate: number;
  sublimationHeatTransfer: number;
}

interface SublimationProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgVaporPressure: number;
  maxVaporPressure: number;
  avgSublimationEnthalpy: number;
  avgLatticeEnergy: number;
  avgSurfaceArea: number;
  avgDesorptionRate: number;
  maxDesorptionRate: number;
  avgClausiusClapeyronSlope: number;
  avgTriplePointDistance: number;
  avgSublimationFlux: number;
  maxSublimationFlux: number;
  avgCondensationCoefficient: number;
  avgNetSublimationRate: number;
  maxNetSublimationRate: number;
  avgVaporFraction: number;
  avgSolidFraction: number;
  avgFrostLine: number;
  avgDepositionRate: number;
  avgSublimationHeatTransfer: number;
  sublimatingCount: number;
  sublimatingFraction: number;
  frozenCount: number;
  frozenFraction: number;
  sublimationGini: number;
  sublimationIndex: number;
  sublimationPhase: string;
  sublimationVerdict: string;
  topBins: BinSublimation[];
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

function computeBinSublimation(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  maxReserve: number
): BinSublimation {
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

  const localVariance = neighbors.length > 0
    ? neighbors.reduce((s, b) => s + Math.abs(b.totalUsd - bin.totalUsd), 0) / neighbors.length / (maxReserve || 1)
    : 0;

  const vaporPressure = r4(
    Math.min(1, volumeRatio * (1 - reserveFraction) * (1 + localVariance))
  );

  const latticeEnergy = r4(
    Math.min(10, reserveFraction * n * (1 + (neighborAvg > 0 ? Math.min(1, neighborAvg / (maxReserve || 1)) : 0)))
  );

  const sublimationEnthalpy = r4(
    Math.min(10, latticeEnergy * (1 + reserveFraction * 2))
  );

  const surfaceArea = r4(
    Math.min(1, (distance > 0 ? 1 / (1 + distance * 0.3) : 1) * (1 + localVariance))
  );

  const desorptionRate = r4(
    Math.min(1, vaporPressure * surfaceArea * (1 + volumeRatio))
  );

  const clausiusClapeyronSlope = r4(
    sublimationEnthalpy > 0
      ? Math.min(5, (vaporPressure * 10) / sublimationEnthalpy)
      : 0
  );

  const equilibriumReserve = totalUsd / n;
  const triplePointDistance = r4(
    Math.min(1, Math.abs(bin.totalUsd - equilibriumReserve) / (maxReserve || 1))
  );

  const sublimationFlux = r4(
    Math.min(1, desorptionRate * (1 - reserveFraction) * (1 + vaporPressure))
  );

  const condensationCoefficient = r4(
    Math.min(1, reserveFraction * (neighborAvg > 0 ? Math.min(2, bin.totalUsd / (neighborAvg || 1)) : 0.5) * (1 - volumeRatio))
  );

  const netSublimationRate = r4(
    Math.max(-1, Math.min(1, sublimationFlux - condensationCoefficient * 0.5))
  );

  const vaporFraction = r4(1 - reserveFraction);
  const solidFraction = r4(reserveFraction);

  const frostLine = r4(
    distance > 0
      ? Math.min(1, (surfaceArea * volumeRatio) / (1 + distance * 0.1))
      : surfaceArea * volumeRatio
  );

  const depositionRate = r4(
    Math.min(1, condensationCoefficient * (1 - vaporPressure) * solidFraction)
  );

  const sublimationHeatTransfer = r4(
    Math.min(1, volumeRatio * surfaceArea * (1 + Math.abs(netSublimationRate)))
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    vaporPressure,
    sublimationEnthalpy,
    latticeEnergy,
    surfaceArea,
    desorptionRate,
    clausiusClapeyronSlope,
    triplePointDistance,
    sublimationFlux,
    condensationCoefficient,
    netSublimationRate,
    vaporFraction,
    solidFraction,
    frostLine,
    depositionRate,
    sublimationHeatTransfer,
  };
}

function analyzeSublimation(bins: BinReserves[], pool: AppPool): SublimationProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));

  const binSub = sorted.map((b) =>
    computeBinSublimation(b, activeBin, sorted, totalUsd, volume, maxReserve)
  );

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgVaporPressure = r4(avg(binSub.map((b) => b.vaporPressure)));
  const maxVaporPressure = r4(Math.max(...binSub.map((b) => b.vaporPressure)));
  const avgSublimationEnthalpy = r4(avg(binSub.map((b) => b.sublimationEnthalpy)));
  const avgLatticeEnergy = r4(avg(binSub.map((b) => b.latticeEnergy)));
  const avgSurfaceArea = r4(avg(binSub.map((b) => b.surfaceArea)));
  const avgDesorptionRate = r4(avg(binSub.map((b) => b.desorptionRate)));
  const maxDesorptionRate = r4(Math.max(...binSub.map((b) => b.desorptionRate)));
  const avgClausiusClapeyronSlope = r4(avg(binSub.map((b) => b.clausiusClapeyronSlope)));
  const avgTriplePointDistance = r4(avg(binSub.map((b) => b.triplePointDistance)));
  const avgSublimationFlux = r4(avg(binSub.map((b) => b.sublimationFlux)));
  const maxSublimationFlux = r4(Math.max(...binSub.map((b) => b.sublimationFlux)));
  const avgCondensationCoefficient = r4(avg(binSub.map((b) => b.condensationCoefficient)));
  const avgNetSublimationRate = r4(avg(binSub.map((b) => b.netSublimationRate)));
  const maxNetSublimationRate = r4(Math.max(...binSub.map((b) => b.netSublimationRate)));
  const avgVaporFraction = r4(avg(binSub.map((b) => b.vaporFraction)));
  const avgSolidFraction = r4(avg(binSub.map((b) => b.solidFraction)));
  const avgFrostLine = r4(avg(binSub.map((b) => b.frostLine)));
  const avgDepositionRate = r4(avg(binSub.map((b) => b.depositionRate)));
  const avgSublimationHeatTransfer = r4(avg(binSub.map((b) => b.sublimationHeatTransfer)));
  const sublimatingCount = binSub.filter((b) => b.netSublimationRate > 0.3).length;
  const sublimatingFraction = r4(sublimatingCount / n);
  const frozenCount = binSub.filter((b) => b.solidFraction > 0.8).length;
  const frozenFraction = r4(frozenCount / n);

  const reserves = sorted.map((b) => b.totalUsd);
  const sortedReserves = [...reserves].sort((a, b) => b - a);
  const totalRes = sortedReserves.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedReserves[i];
  }
  const sublimationGini = totalRes > 0
    ? r4(Math.abs(giniSum) / (n * totalRes))
    : 0;

  const vaporScore = Math.min(25, avgVaporPressure * 25);
  const fluxScore = Math.min(25, avgSublimationFlux * 25);
  const netSubScore = Math.min(25, Math.max(0, avgNetSublimationRate) * 25);
  const vaporFractionScore = Math.min(25, avgVaporFraction * 25);
  const sublimationIndex = Math.round(
    Math.min(100, vaporScore + fluxScore + netSubScore + vaporFractionScore)
  );

  let sublimationPhase: string;
  if (sublimationIndex >= 80) sublimationPhase = "ABLATION";
  else if (sublimationIndex >= 60) sublimationPhase = "RAPID_SUBLIMATION";
  else if (sublimationIndex >= 40) sublimationPhase = "ACTIVE_SUBLIMATION";
  else if (sublimationIndex >= 20) sublimationPhase = "SLOW_SUBLIMATION";
  else sublimationPhase = "FROZEN";

  let sublimationVerdict: string;
  if (sublimatingFraction > 0.5 && maxSublimationFlux > 0.7)
    sublimationVerdict = "FLASH_SUBLIMATION";
  else if (avgNetSublimationRate > 0.3 && avgDepositionRate < 0.1)
    sublimationVerdict = "IRREVERSIBLE_LOSS";
  else if (avgDepositionRate > 0.3 && avgNetSublimationRate < 0.1)
    sublimationVerdict = "FROST_ACCUMULATION";
  else if (frozenFraction > 0.7)
    sublimationVerdict = "DEEP_FREEZE";
  else
    sublimationVerdict = "DYNAMIC_EQUILIBRIUM";

  const topBins = [...binSub]
    .sort((a, b) => b.netSublimationRate - a.netSublimationRate)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgVaporPressure,
    maxVaporPressure,
    avgSublimationEnthalpy,
    avgLatticeEnergy,
    avgSurfaceArea,
    avgDesorptionRate,
    maxDesorptionRate,
    avgClausiusClapeyronSlope,
    avgTriplePointDistance,
    avgSublimationFlux,
    maxSublimationFlux,
    avgCondensationCoefficient,
    avgNetSublimationRate,
    maxNetSublimationRate,
    avgVaporFraction,
    avgSolidFraction,
    avgFrostLine,
    avgDepositionRate,
    avgSublimationHeatTransfer,
    sublimatingCount,
    sublimatingFraction,
    frozenCount,
    frozenFraction,
    sublimationGini,
    sublimationIndex,
    sublimationPhase,
    sublimationVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Sublimation — Doctor ===\n");
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

  const profiles: SublimationProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeSublimation(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgSublimationIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.sublimationIndex)))
      : 0,
    ablationCount: profiles.filter((p) => p.sublimationPhase === "ABLATION").length,
    rapidSublimationCount: profiles.filter((p) => p.sublimationPhase === "RAPID_SUBLIMATION").length,
    activeSublimationCount: profiles.filter((p) => p.sublimationPhase === "ACTIVE_SUBLIMATION").length,
    slowSublimationCount: profiles.filter((p) => p.sublimationPhase === "SLOW_SUBLIMATION").length,
    frozenCount: profiles.filter((p) => p.sublimationPhase === "FROZEN").length,
    avgVaporPressure: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgVaporPressure)))
      : 0,
    avgNetSublimationRate: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgNetSublimationRate)))
      : 0,
    totalSublimatingBins: profiles.reduce((s, p) => s + p.sublimatingCount, 0),
    avgSublimationGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.sublimationGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-sublimation").description("HODLMM bin sublimation analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin sublimation dynamics")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
