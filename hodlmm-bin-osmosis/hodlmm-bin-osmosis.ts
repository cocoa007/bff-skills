#!/usr/bin/env bun
/**
 * hodlmm-bin-osmosis.ts — Day 132 cocoa007 Bitflow Skills Comp
 *
 * Osmotic pressure analyzer — models liquidity concentration differentials
 * across bin boundaries as osmotic gradients driving rebalancing flow.
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

interface OsmosisProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsAnalyzed: number;
  totalUsd: number;
  avgOsmoticPressure: number;
  maxOsmoticPressure: number;
  maxOsmoticBin: number;
  osmoticGradient: number;
  semipermeability: number;
  tonicityLeft: number;
  tonicityRight: number;
  tonicityAsymmetry: number;
  hypertonicZones: number;
  hypotonicZones: number;
  isotonicZones: number;
  osmoticFlowDirection: string;
  netOsmoticFlux: number;
  plasmolysisRisk: number;
  lysisRisk: number;
  turgorPressure: number;
  osmoticEfficiency: number;
  concentrationGini: number;
  diffusionRate: number;
  equilibriumDistance: number;
  osmoticIndex: number;
  osmoticClass: string;
  flowTendency: string;
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

function analyzeOsmosis(bins: BinReserves[], pool: AppPool): OsmosisProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const avgUsd = totalUsd / n;

  const concentrations = sorted.map((b) => b.totalUsd / (avgUsd || 1));

  const osmoticPressures: number[] = [];
  let maxOsmoticPressure = 0;
  let maxOsmoticBin = activeBin;

  for (let i = 1; i < n; i++) {
    const cHigh = Math.max(concentrations[i], concentrations[i - 1]);
    const cLow = Math.min(concentrations[i], concentrations[i - 1]);
    const pressure = cLow > 0.01 ? Math.log(cHigh / cLow) : cHigh > 0.01 ? cHigh * 10 : 0;
    osmoticPressures.push(pressure);

    if (pressure > maxOsmoticPressure) {
      maxOsmoticPressure = pressure;
      maxOsmoticBin = sorted[i].binId;
    }
  }

  const avgOsmoticPressure = osmoticPressures.length > 0
    ? osmoticPressures.reduce((s, p) => s + p, 0) / osmoticPressures.length
    : 0;

  let gradientSum = 0;
  for (let i = 1; i < osmoticPressures.length; i++) {
    gradientSum += Math.abs(osmoticPressures[i] - osmoticPressures[i - 1]);
  }
  const osmoticGradient = osmoticPressures.length > 1
    ? gradientSum / (osmoticPressures.length - 1)
    : 0;

  const pressureVariance = osmoticPressures.length > 0
    ? osmoticPressures.reduce((s, p) => s + (p - avgOsmoticPressure) ** 2, 0) / osmoticPressures.length
    : 0;
  const semipermeability = avgOsmoticPressure > 0
    ? Math.min(1, 1 - Math.sqrt(pressureVariance) / (avgOsmoticPressure + 0.01))
    : 0;

  const activeIdx = sorted.findIndex((b) => b.binId >= activeBin);
  const midIdx = activeIdx >= 0 ? activeIdx : Math.floor(n / 2);
  const leftConc = concentrations.slice(0, midIdx);
  const rightConc = concentrations.slice(midIdx);

  const avgConc = (arr: number[]) => arr.length > 0 ? arr.reduce((s, c) => s + c, 0) / arr.length : 0;
  const tonicityLeft = avgConc(leftConc);
  const tonicityRight = avgConc(rightConc);
  const tonicityTotal = tonicityLeft + tonicityRight;
  const tonicityAsymmetry = tonicityTotal > 0
    ? Math.abs(tonicityLeft - tonicityRight) / tonicityTotal
    : 0;

  const hypertonicThreshold = 1.5;
  const hypotonicThreshold = 0.5;
  let hypertonicZones = 0;
  let hypotonicZones = 0;
  let isotonicZones = 0;

  for (let i = 1; i < n; i++) {
    const ratio = concentrations[i - 1] > 0.01
      ? concentrations[i] / concentrations[i - 1]
      : concentrations[i] > 0.01 ? 10 : 1;
    if (ratio > hypertonicThreshold || ratio < 1 / hypertonicThreshold) {
      hypertonicZones++;
    } else if (ratio > hypotonicThreshold && ratio < 1 / hypotonicThreshold) {
      hypotonicZones++;
    } else {
      isotonicZones++;
    }
  }

  let netFlux = 0;
  for (let i = 1; i < n; i++) {
    netFlux += concentrations[i] - concentrations[i - 1];
  }
  const netOsmoticFlux = n > 1 ? netFlux / (n - 1) : 0;

  const osmoticFlowDirection = tonicityLeft > tonicityRight * 1.1
    ? "LEFT_TO_RIGHT"
    : tonicityRight > tonicityLeft * 1.1
    ? "RIGHT_TO_LEFT"
    : "EQUILIBRIUM";

  const maxConc = Math.max(...concentrations);
  const plasmolysisRisk = maxConc > 3 ? Math.min(100, Math.round((maxConc - 3) * 20)) : 0;

  const minConc = Math.min(...concentrations.filter((c) => c > 0.01));
  const lysisRisk = minConc < 0.2 ? Math.min(100, Math.round((0.2 - minConc) * 500)) : 0;

  const turgorPressure = avgOsmoticPressure > 0
    ? Math.min(100, Math.round(avgOsmoticPressure * 30))
    : 0;

  const osmoticEfficiency = n > 1
    ? Math.max(0, Math.min(100, Math.round(
        100 - hypertonicZones / (n - 1) * 50 - osmoticGradient * 20 - tonicityAsymmetry * 30
      )))
    : 0;

  const sortedConc = [...concentrations].sort((a, b) => a - b);
  const cumulative: number[] = [];
  const concSum = sortedConc.reduce((s, c) => s + c, 0);
  let running = 0;
  for (const c of sortedConc) {
    running += c;
    cumulative.push(running / concSum);
  }
  const equalLine = cumulative.map((_, i) => (i + 1) / n);
  const giniNumerator = cumulative.reduce((s, c, i) => s + Math.abs(c - equalLine[i]), 0);
  const concentrationGini = Math.round((giniNumerator / n) * 2 * 1000) / 1000;

  const diffusionRate = pool.volume24hUsd > 0 && avgOsmoticPressure > 0
    ? Math.round((pool.volume24hUsd / totalUsd) / avgOsmoticPressure * 100) / 100
    : 0;

  const equilibriumDistance = avgOsmoticPressure > 0
    ? Math.round(Math.log(1 + avgOsmoticPressure * n) * 100) / 100
    : 0;

  const smoothness = Math.max(0, 25 - avgOsmoticPressure * 10);
  const lowGradient = Math.max(0, 20 - osmoticGradient * 10);
  const symmetryPart = (1 - tonicityAsymmetry) * 15;
  const efficiencyPart = osmoticEfficiency * 0.2;
  const lowGini = (1 - concentrationGini) * 10;
  const lowPlasmolysis = Math.max(0, 10 - plasmolysisRisk / 10);
  const osmoticIndex = Math.round(
    Math.min(100, smoothness + lowGradient + symmetryPart + efficiencyPart + lowGini + lowPlasmolysis)
  );

  let osmoticClass: string;
  if (avgOsmoticPressure < 0.3 && concentrationGini < 0.2) osmoticClass = "ISOTONIC";
  else if (avgOsmoticPressure < 0.8) osmoticClass = "MILDLY_HYPERTONIC";
  else if (avgOsmoticPressure < 1.5) osmoticClass = "HYPERTONIC";
  else osmoticClass = "SEVERELY_HYPERTONIC";

  let flowTendency: string;
  if (diffusionRate > 5) flowTendency = "RAPID_EQUILIBRATING";
  else if (diffusionRate > 1) flowTendency = "EQUILIBRATING";
  else if (diffusionRate > 0.2) flowTendency = "SLOW_DIFFUSION";
  else flowTendency = "OSMOTIC_LOCK";

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsAnalyzed: n,
    totalUsd: Math.round(totalUsd * 100) / 100,
    avgOsmoticPressure: Math.round(avgOsmoticPressure * 1000) / 1000,
    maxOsmoticPressure: Math.round(maxOsmoticPressure * 1000) / 1000,
    maxOsmoticBin,
    osmoticGradient: Math.round(osmoticGradient * 1000) / 1000,
    semipermeability: Math.round(semipermeability * 1000) / 1000,
    tonicityLeft: Math.round(tonicityLeft * 1000) / 1000,
    tonicityRight: Math.round(tonicityRight * 1000) / 1000,
    tonicityAsymmetry: Math.round(tonicityAsymmetry * 1000) / 1000,
    hypertonicZones,
    hypotonicZones,
    isotonicZones,
    osmoticFlowDirection,
    netOsmoticFlux: Math.round(netOsmoticFlux * 1000) / 1000,
    plasmolysisRisk,
    lysisRisk,
    turgorPressure,
    osmoticEfficiency,
    concentrationGini,
    diffusionRate,
    equilibriumDistance,
    osmoticIndex,
    osmoticClass,
    flowTendency,
    tvlUsd: pool.tvlUsd,
  };
}

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Osmosis — Doctor ===\n");
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

  const profiles: OsmosisProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeOsmosis(bins, pool));
    } catch {
      continue;
    }
  }

  const summary = {
    poolsAnalyzed: profiles.length,
    avgOsmoticIndex: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + p.osmoticIndex, 0) / profiles.length) * 10) / 10
      : 0,
    isotonicCount: profiles.filter((p) => p.osmoticClass === "ISOTONIC").length,
    mildlyHypertonicCount: profiles.filter((p) => p.osmoticClass === "MILDLY_HYPERTONIC").length,
    hypertonicCount: profiles.filter((p) => p.osmoticClass === "HYPERTONIC").length,
    severelyHypertonicCount: profiles.filter((p) => p.osmoticClass === "SEVERELY_HYPERTONIC").length,
    rapidEquilibratingCount: profiles.filter((p) => p.flowTendency === "RAPID_EQUILIBRATING").length,
    equilibratingCount: profiles.filter((p) => p.flowTendency === "EQUILIBRATING").length,
    slowDiffusionCount: profiles.filter((p) => p.flowTendency === "SLOW_DIFFUSION").length,
    osmoticLockCount: profiles.filter((p) => p.flowTendency === "OSMOTIC_LOCK").length,
    avgConcentrationGini: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + p.concentrationGini, 0) / profiles.length) * 1000) / 1000
      : 0,
    avgPlasmolysisRisk: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + p.plasmolysisRisk, 0) / profiles.length) * 10) / 10
      : 0,
    totalHypertonicZones: profiles.reduce((s, p) => s + p.hypertonicZones, 0),
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-osmosis").description("HODLMM bin osmotic pressure analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze osmotic pressure")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
