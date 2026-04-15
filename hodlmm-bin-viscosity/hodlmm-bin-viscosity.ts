#!/usr/bin/env bun
/**
 * hodlmm-bin-viscosity.ts — Day 131 cocoa007 Bitflow Skills Comp
 *
 * Viscosity analyzer — measures resistance to liquidity flow across bins,
 * shear rates, Reynolds numbers, and flow regime classification.
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

interface ViscosityProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsAnalyzed: number;
  totalUsd: number;
  dynamicViscosity: number;
  kinematicViscosity: number;
  avgShearRate: number;
  maxShearRate: number;
  maxShearBin: number;
  avgShearStress: number;
  reynoldsNumber: number;
  viscosityGradient: number;
  leftViscosity: number;
  rightViscosity: number;
  viscosityAsymmetry: number;
  yieldStressUsd: number;
  thixotropyIndex: number;
  stagnantZones: number;
  stagnantFraction: number;
  flowResistanceIndex: number;
  viscosityIndex: number;
  flowRegime: string;
  viscosityClass: string;
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

function analyzeViscosity(bins: BinReserves[], pool: AppPool): ViscosityProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const avgUsd = totalUsd / n;

  const shearRates: number[] = [];
  const shearStresses: number[] = [];
  const localViscosities: number[] = [];
  let maxShearRate = 0;
  let maxShearBin = activeBin;

  for (let i = 1; i < n; i++) {
    const delta = Math.abs(sorted[i].totalUsd - sorted[i - 1].totalUsd);
    const binGap = sorted[i].binId - sorted[i - 1].binId;
    const shearRate = binGap > 0 ? delta / binGap : delta;
    shearRates.push(shearRate);

    const localDensity = (sorted[i].totalUsd + sorted[i - 1].totalUsd) / 2;
    const shearStress = shearRate * (localDensity > 0 ? localDensity / avgUsd : 1);
    shearStresses.push(shearStress);

    const localVisc = shearRate > 0 ? shearStress / shearRate : 0;
    localViscosities.push(localVisc);

    if (shearRate > maxShearRate) {
      maxShearRate = shearRate;
      maxShearBin = sorted[i].binId;
    }
  }

  const avgShearRate = shearRates.length > 0
    ? shearRates.reduce((s, r) => s + r, 0) / shearRates.length
    : 0;
  const avgShearStress = shearStresses.length > 0
    ? shearStresses.reduce((s, r) => s + r, 0) / shearStresses.length
    : 0;

  const dynamicViscosity = avgShearRate > 0 ? avgShearStress / avgShearRate : 0;
  const kinematicViscosity = avgUsd > 0 ? dynamicViscosity / (avgUsd / 1000) : 0;

  const inertialForce = pool.volume24hUsd > 0 ? pool.volume24hUsd / n : avgUsd;
  const viscousForce = dynamicViscosity * avgShearRate;
  const reynoldsNumber = viscousForce > 0 ? inertialForce / viscousForce : inertialForce > 0 ? 999 : 0;

  const activeIdx = sorted.findIndex((b) => b.binId >= activeBin);
  const midIdx = activeIdx >= 0 ? activeIdx : Math.floor(n / 2);
  const leftBins = sorted.slice(0, midIdx);
  const rightBins = sorted.slice(midIdx);

  const computeSideViscosity = (sideBins: BinReserves[]): number => {
    if (sideBins.length < 2) return 0;
    let sideShear = 0;
    let sideStress = 0;
    for (let i = 1; i < sideBins.length; i++) {
      const delta = Math.abs(sideBins[i].totalUsd - sideBins[i - 1].totalUsd);
      const gap = sideBins[i].binId - sideBins[i - 1].binId;
      const sr = gap > 0 ? delta / gap : delta;
      const ld = (sideBins[i].totalUsd + sideBins[i - 1].totalUsd) / 2;
      sideShear += sr;
      sideStress += sr * (ld > 0 ? ld / avgUsd : 1);
    }
    const avgSr = sideShear / (sideBins.length - 1);
    const avgSs = sideStress / (sideBins.length - 1);
    return avgSr > 0 ? avgSs / avgSr : 0;
  };

  const leftViscosity = computeSideViscosity(leftBins);
  const rightViscosity = computeSideViscosity(rightBins);
  const viscTotal = leftViscosity + rightViscosity;
  const viscosityAsymmetry = viscTotal > 0 ? Math.abs(leftViscosity - rightViscosity) / viscTotal : 0;

  let viscGradientSum = 0;
  for (let i = 1; i < localViscosities.length; i++) {
    viscGradientSum += Math.abs(localViscosities[i] - localViscosities[i - 1]);
  }
  const viscosityGradient = localViscosities.length > 1
    ? viscGradientSum / (localViscosities.length - 1)
    : 0;

  const sortedByUsd = [...sorted].sort((a, b) => a.totalUsd - b.totalUsd);
  const yieldStressUsd = sortedByUsd[Math.floor(n * 0.1)]?.totalUsd || 0;

  const shearVariance = shearRates.length > 0
    ? shearRates.reduce((s, r) => s + (r - avgShearRate) ** 2, 0) / shearRates.length
    : 0;
  const shearStdDev = Math.sqrt(shearVariance);
  const thixotropyIndex = avgShearRate > 0
    ? Math.min(1, shearStdDev / avgShearRate)
    : 0;

  const stagnantThreshold = avgUsd * 0.05;
  let stagnantZones = 0;
  for (let i = 1; i < n; i++) {
    const delta = Math.abs(sorted[i].totalUsd - sorted[i - 1].totalUsd);
    if (delta < stagnantThreshold && sorted[i].totalUsd < avgUsd * 0.3) {
      stagnantZones++;
    }
  }
  const stagnantFraction = n > 1 ? stagnantZones / (n - 1) : 0;

  const flowResistanceIndex = Math.min(100, Math.round(
    dynamicViscosity * 20 +
    viscosityGradient * 15 +
    stagnantFraction * 30 +
    viscosityAsymmetry * 20 +
    thixotropyIndex * 15
  ));

  const smoothFlow = Math.max(0, 25 - dynamicViscosity * 10);
  const lowGradient = Math.max(0, 20 - viscosityGradient * 8);
  const symmetryPart = (1 - viscosityAsymmetry) * 15;
  const flowPart = reynoldsNumber > 50 ? 15 : reynoldsNumber > 10 ? 10 : reynoldsNumber > 2 ? 5 : 0;
  const noStagnant = (1 - stagnantFraction) * 15;
  const lowThixo = (1 - thixotropyIndex) * 10;
  const viscosityIndex = Math.round(
    Math.min(100, smoothFlow + lowGradient + symmetryPart + flowPart + noStagnant + lowThixo)
  );

  let flowRegime: string;
  if (reynoldsNumber > 100) flowRegime = "TURBULENT";
  else if (reynoldsNumber > 10) flowRegime = "TRANSITIONAL";
  else if (reynoldsNumber > 0.5) flowRegime = "LAMINAR";
  else flowRegime = "STAGNANT";

  let viscosityClass: string;
  if (dynamicViscosity < 0.5 && viscosityGradient < 0.3) viscosityClass = "SUPERFLUID";
  else if (dynamicViscosity < 1.0) viscosityClass = "FLUID";
  else if (dynamicViscosity < 2.0) viscosityClass = "VISCOUS";
  else viscosityClass = "GELATINOUS";

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsAnalyzed: n,
    totalUsd: Math.round(totalUsd * 100) / 100,
    dynamicViscosity: Math.round(dynamicViscosity * 1000) / 1000,
    kinematicViscosity: Math.round(kinematicViscosity * 1000) / 1000,
    avgShearRate: Math.round(avgShearRate * 100) / 100,
    maxShearRate: Math.round(maxShearRate * 100) / 100,
    maxShearBin,
    avgShearStress: Math.round(avgShearStress * 100) / 100,
    reynoldsNumber: Math.round(reynoldsNumber * 100) / 100,
    viscosityGradient: Math.round(viscosityGradient * 1000) / 1000,
    leftViscosity: Math.round(leftViscosity * 1000) / 1000,
    rightViscosity: Math.round(rightViscosity * 1000) / 1000,
    viscosityAsymmetry: Math.round(viscosityAsymmetry * 1000) / 1000,
    yieldStressUsd: Math.round(yieldStressUsd * 100) / 100,
    thixotropyIndex: Math.round(thixotropyIndex * 1000) / 1000,
    stagnantZones,
    stagnantFraction: Math.round(stagnantFraction * 1000) / 1000,
    flowResistanceIndex,
    viscosityIndex,
    flowRegime,
    viscosityClass,
    tvlUsd: pool.tvlUsd,
  };
}

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Viscosity — Doctor ===\n");
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

  const profiles: ViscosityProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeViscosity(bins, pool));
    } catch {
      continue;
    }
  }

  const summary = {
    poolsAnalyzed: profiles.length,
    avgViscosityIndex: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + p.viscosityIndex, 0) / profiles.length) * 10) / 10
      : 0,
    superfluidCount: profiles.filter((p) => p.viscosityClass === "SUPERFLUID").length,
    fluidCount: profiles.filter((p) => p.viscosityClass === "FLUID").length,
    viscousCount: profiles.filter((p) => p.viscosityClass === "VISCOUS").length,
    gelatinousCount: profiles.filter((p) => p.viscosityClass === "GELATINOUS").length,
    turbulentCount: profiles.filter((p) => p.flowRegime === "TURBULENT").length,
    transitionalCount: profiles.filter((p) => p.flowRegime === "TRANSITIONAL").length,
    laminarCount: profiles.filter((p) => p.flowRegime === "LAMINAR").length,
    stagnantCount: profiles.filter((p) => p.flowRegime === "STAGNANT").length,
    avgDynamicViscosity: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + p.dynamicViscosity, 0) / profiles.length) * 1000) / 1000
      : 0,
    avgReynoldsNumber: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + p.reynoldsNumber, 0) / profiles.length) * 100) / 100
      : 0,
    avgViscosityAsymmetry: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + p.viscosityAsymmetry, 0) / profiles.length) * 1000) / 1000
      : 0,
    totalStagnantZones: profiles.reduce((s, p) => s + p.stagnantZones, 0),
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-viscosity").description("HODLMM bin viscosity analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze viscosity")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
