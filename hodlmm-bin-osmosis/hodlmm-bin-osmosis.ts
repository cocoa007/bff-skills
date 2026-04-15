#!/usr/bin/env bun
/**
 * hodlmm-bin-osmosis.ts — Day 152 cocoa007 Bitflow Skills Comp
 *
 * Osmosis analyzer — models osmotic pressure dynamics across HODLMM bins.
 * Reserves act as solute in solution; bins are separated by semi-permeable
 * membranes. Van't Hoff equation governs osmotic pressure; Fick's law
 * governs diffusive flux from hypertonic to hypotonic bins.
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

interface BinOsmosis {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  soluteConcentration: number;
  osmoticPressure: number;
  membranePotential: number;
  osmoticFlux: number;
  tonicity: number;
  reflectionCoefficient: number;
  hydrostaticPressure: number;
  turgorPressure: number;
  osmoticGradient: number;
  waterPotential: number;
  plasmolysis: number;
  lysisRisk: number;
  osmoticEquilibrium: number;
  diffusionCoefficient: number;
}

interface OsmosisProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgSoluteConcentration: number;
  maxSoluteConcentration: number;
  avgOsmoticPressure: number;
  maxOsmoticPressure: number;
  avgMembranePotential: number;
  maxMembranePotential: number;
  avgOsmoticFlux: number;
  maxOsmoticFlux: number;
  avgTonicity: number;
  hypertonicCount: number;
  hypotonicCount: number;
  isotonicCount: number;
  avgReflectionCoefficient: number;
  minReflectionCoefficient: number;
  avgHydrostaticPressure: number;
  maxHydrostaticPressure: number;
  avgTurgorPressure: number;
  maxTurgorPressure: number;
  avgOsmoticGradient: number;
  maxOsmoticGradient: number;
  avgWaterPotential: number;
  minWaterPotential: number;
  avgPlasmolysis: number;
  maxPlasmolysis: number;
  avgLysisRisk: number;
  maxLysisRisk: number;
  avgOsmoticEquilibrium: number;
  minOsmoticEquilibrium: number;
  avgDiffusionCoefficient: number;
  maxDiffusionCoefficient: number;
  highFluxCount: number;
  highFluxFraction: number;
  equilibriumCount: number;
  equilibriumFraction: number;
  osmosisGini: number;
  osmosisIndex: number;
  osmosisPhase: string;
  osmosisVerdict: string;
  topBins: BinOsmosis[];
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

function computeBinOsmosis(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  maxReserve: number
): BinOsmosis {
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

  // 1. soluteConcentration — reserve density as molarity analog
  const soluteConcentration = r4(
    Math.min(1, reserveFraction)
  );

  // 2. osmoticPressure — van't Hoff: pi = iMRT
  const dissociationFactor = 1 + volumeRatio * 0.5;
  const temperature = Math.max(0.1, 0.5 + volumeRatio * 2);
  const osmoticPressure = r4(
    Math.min(10, dissociationFactor * soluteConcentration * temperature * 2)
  );

  // 3. membranePotential — osmotic gradient between this bin and neighbors
  const neighborConcentration = neighborAvg / (maxReserve || 1);
  const membranePotential = r4(
    Math.max(-5, Math.min(5, (soluteConcentration - neighborConcentration) * 5))
  );

  // 4. osmoticFlux — Fick's law: flux proportional to concentration gradient
  const concentrationGradient = Math.abs(soluteConcentration - neighborConcentration);
  const osmoticFlux = r4(
    Math.min(1, concentrationGradient * temperature * 1.5 * (1 + volumeRatio * 0.3))
  );

  // 5. tonicity — relative concentration vs neighbors (0-1 scale)
  const tonicity = r4(
    Math.min(1, Math.max(0, neighborConcentration > 0
      ? soluteConcentration / (soluteConcentration + neighborConcentration)
      : soluteConcentration > 0 ? 1 : 0.5))
  );

  // 6. reflectionCoefficient — Staverman: membrane selectivity (0-1)
  const reflectionCoefficient = r4(
    Math.min(1, Math.max(0, 1 - Math.exp(-distance * 0.15) * (1 - volumeRatio * 0.2)))
  );

  // 7. hydrostaticPressure — opposing pressure from reserve depth
  const hydrostaticPressure = r4(
    Math.min(10, soluteConcentration * 4 * (1 + neighbors.length * 0.1))
  );

  // 8. turgorPressure — net pressure: hydrostatic minus external osmotic
  const externalOsmotic = neighborConcentration * temperature * 2;
  const turgorPressure = r4(
    Math.max(-5, Math.min(5, hydrostaticPressure - externalOsmotic))
  );

  // 9. osmoticGradient — slope of concentration across adjacent bins
  const leftBin = allBins.find(b => b.binId === bin.binId - 1);
  const rightBin = allBins.find(b => b.binId === bin.binId + 1);
  const leftConc = leftBin ? leftBin.totalUsd / (maxReserve || 1) : 0;
  const rightConc = rightBin ? rightBin.totalUsd / (maxReserve || 1) : 0;
  const osmoticGradient = r4(
    Math.min(2, Math.abs(
      (rightConc - leftConc) / 2
    ) * 5)
  );

  // 10. waterPotential — combined osmotic + pressure potential
  const waterPotential = r4(
    Math.max(-10, -osmoticPressure + hydrostaticPressure * 0.5)
  );

  // 11. plasmolysis — reserve shrinkage in hypertonic surroundings
  const plasmolysis = r4(
    Math.min(1, Math.max(0, (neighborConcentration - soluteConcentration) * 2 * (1 - reflectionCoefficient)))
  );

  // 12. lysisRisk — risk of bin overflow from osmotic influx
  const lysisRisk = r4(
    Math.min(1, Math.max(0,
      soluteConcentration > 0.8
        ? soluteConcentration * osmoticFlux * (1 - reflectionCoefficient)
        : 0
    ))
  );

  // 13. osmoticEquilibrium — closeness to osmotic balance (1 = perfect, 0 = max imbalance)
  const osmoticEquilibrium = r4(
    1 - Math.min(1, concentrationGradient * 3)
  );

  // 14. diffusionCoefficient — effective reserve diffusivity across bin boundaries
  const diffusionCoefficient = r4(
    Math.min(1, Math.max(0,
      (1 - reflectionCoefficient) * (1 + volumeRatio * 0.5) * Math.exp(-distance * 0.05) * 0.8
    ))
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    soluteConcentration,
    osmoticPressure,
    membranePotential,
    osmoticFlux,
    tonicity,
    reflectionCoefficient,
    hydrostaticPressure,
    turgorPressure,
    osmoticGradient,
    waterPotential,
    plasmolysis,
    lysisRisk,
    osmoticEquilibrium,
    diffusionCoefficient,
  };
}

function analyzeOsmosis(bins: BinReserves[], pool: AppPool): OsmosisProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));

  const binOsm = sorted.map((b) =>
    computeBinOsmosis(b, activeBin, sorted, totalUsd, volume, maxReserve)
  );

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgSoluteConcentration = r4(avg(binOsm.map((b) => b.soluteConcentration)));
  const maxSoluteConcentration = r4(Math.max(...binOsm.map((b) => b.soluteConcentration)));
  const avgOsmoticPressure = r4(avg(binOsm.map((b) => b.osmoticPressure)));
  const maxOsmoticPressure = r4(Math.max(...binOsm.map((b) => b.osmoticPressure)));
  const avgMembranePotential = r4(avg(binOsm.map((b) => b.membranePotential)));
  const maxMembranePotential = r4(Math.max(...binOsm.map((b) => Math.abs(b.membranePotential))));
  const avgOsmoticFlux = r4(avg(binOsm.map((b) => b.osmoticFlux)));
  const maxOsmoticFlux = r4(Math.max(...binOsm.map((b) => b.osmoticFlux)));
  const avgTonicity = r4(avg(binOsm.map((b) => b.tonicity)));
  const hypertonicCount = binOsm.filter((b) => b.tonicity > 0.6).length;
  const hypotonicCount = binOsm.filter((b) => b.tonicity < 0.4).length;
  const isotonicCount = binOsm.filter((b) => b.tonicity >= 0.4 && b.tonicity <= 0.6).length;
  const avgReflectionCoefficient = r4(avg(binOsm.map((b) => b.reflectionCoefficient)));
  const minReflectionCoefficient = r4(Math.min(...binOsm.map((b) => b.reflectionCoefficient)));
  const avgHydrostaticPressure = r4(avg(binOsm.map((b) => b.hydrostaticPressure)));
  const maxHydrostaticPressure = r4(Math.max(...binOsm.map((b) => b.hydrostaticPressure)));
  const avgTurgorPressure = r4(avg(binOsm.map((b) => b.turgorPressure)));
  const maxTurgorPressure = r4(Math.max(...binOsm.map((b) => b.turgorPressure)));
  const avgOsmoticGradient = r4(avg(binOsm.map((b) => b.osmoticGradient)));
  const maxOsmoticGradient = r4(Math.max(...binOsm.map((b) => b.osmoticGradient)));
  const avgWaterPotential = r4(avg(binOsm.map((b) => b.waterPotential)));
  const minWaterPotential = r4(Math.min(...binOsm.map((b) => b.waterPotential)));
  const avgPlasmolysis = r4(avg(binOsm.map((b) => b.plasmolysis)));
  const maxPlasmolysis = r4(Math.max(...binOsm.map((b) => b.plasmolysis)));
  const avgLysisRisk = r4(avg(binOsm.map((b) => b.lysisRisk)));
  const maxLysisRisk = r4(Math.max(...binOsm.map((b) => b.lysisRisk)));
  const avgOsmoticEquilibrium = r4(avg(binOsm.map((b) => b.osmoticEquilibrium)));
  const minOsmoticEquilibrium = r4(Math.min(...binOsm.map((b) => b.osmoticEquilibrium)));
  const avgDiffusionCoefficient = r4(avg(binOsm.map((b) => b.diffusionCoefficient)));
  const maxDiffusionCoefficient = r4(Math.max(...binOsm.map((b) => b.diffusionCoefficient)));
  const highFluxCount = binOsm.filter((b) => b.osmoticFlux > 0.3).length;
  const highFluxFraction = r4(highFluxCount / n);
  const equilibriumCount = binOsm.filter((b) => b.osmoticEquilibrium > 0.7).length;
  const equilibriumFraction = r4(equilibriumCount / n);

  // Gini coefficient on osmotic flux
  const fluxes = binOsm.map((b) => b.osmoticFlux);
  const sortedFluxes = [...fluxes].sort((a, b) => b - a);
  const totalFluxes = sortedFluxes.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedFluxes[i];
  }
  const osmosisGini = totalFluxes > 0
    ? r4(Math.abs(giniSum) / (n * totalFluxes))
    : 0;

  // Composite osmosis index (0-100)
  const fluxScore = Math.min(25, avgOsmoticFlux * 50);
  const pressureScore = Math.min(25, avgOsmoticPressure * 5);
  const gradientScore = Math.min(25, avgOsmoticGradient * 25);
  const imbalanceScore = Math.min(25, (1 - avgOsmoticEquilibrium) * 50);
  const osmosisIndex = Math.round(
    Math.min(100, fluxScore + pressureScore + gradientScore + imbalanceScore)
  );

  let osmosisPhase: string;
  if (osmosisIndex >= 80) osmosisPhase = "OSMOTIC_SHOCK";
  else if (osmosisIndex >= 60) osmosisPhase = "OSMOTIC_STRESS";
  else if (osmosisIndex >= 40) osmosisPhase = "ACTIVE_TRANSPORT";
  else if (osmosisIndex >= 20) osmosisPhase = "FACILITATED_DIFFUSION";
  else osmosisPhase = "OSMOTIC_EQUILIBRIUM";

  let osmosisVerdict: string;
  if (highFluxFraction > 0.4 && avgOsmoticGradient > 0.5)
    osmosisVerdict = "OSMOTIC_CASCADE";
  else if (highFluxFraction < 0.15 && maxOsmoticFlux > 0.5)
    osmosisVerdict = "SELECTIVE_TRANSPORT";
  else if (avgPlasmolysis > 0.3 && hypotonicCount < hypertonicCount)
    osmosisVerdict = "PLASMOLYSIS_WAVE";
  else if (equilibriumFraction > 0.7)
    osmosisVerdict = "TURGOR_BALANCE";
  else if (hypotonicCount > hypertonicCount * 2 && avgOsmoticFlux > 0.2)
    osmosisVerdict = "HYPOTONIC_FLOOD";
  else
    osmosisVerdict = "TURGOR_BALANCE";

  const topBins = [...binOsm]
    .sort((a, b) => b.osmoticFlux - a.osmoticFlux)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgSoluteConcentration,
    maxSoluteConcentration,
    avgOsmoticPressure,
    maxOsmoticPressure,
    avgMembranePotential,
    maxMembranePotential,
    avgOsmoticFlux,
    maxOsmoticFlux,
    avgTonicity,
    hypertonicCount,
    hypotonicCount,
    isotonicCount,
    avgReflectionCoefficient,
    minReflectionCoefficient,
    avgHydrostaticPressure,
    maxHydrostaticPressure,
    avgTurgorPressure,
    maxTurgorPressure,
    avgOsmoticGradient,
    maxOsmoticGradient,
    avgWaterPotential,
    minWaterPotential,
    avgPlasmolysis,
    maxPlasmolysis,
    avgLysisRisk,
    maxLysisRisk,
    avgOsmoticEquilibrium,
    minOsmoticEquilibrium,
    avgDiffusionCoefficient,
    maxDiffusionCoefficient,
    highFluxCount,
    highFluxFraction,
    equilibriumCount,
    equilibriumFraction,
    osmosisGini,
    osmosisIndex,
    osmosisPhase,
    osmosisVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

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

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgOsmosisIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.osmosisIndex)))
      : 0,
    osmoticShockCount: profiles.filter((p) => p.osmosisPhase === "OSMOTIC_SHOCK").length,
    osmoticStressCount: profiles.filter((p) => p.osmosisPhase === "OSMOTIC_STRESS").length,
    activeTransportCount: profiles.filter((p) => p.osmosisPhase === "ACTIVE_TRANSPORT").length,
    facilitatedDiffusionCount: profiles.filter((p) => p.osmosisPhase === "FACILITATED_DIFFUSION").length,
    osmoticEquilibriumCount: profiles.filter((p) => p.osmosisPhase === "OSMOTIC_EQUILIBRIUM").length,
    avgOsmoticFlux: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgOsmoticFlux)))
      : 0,
    avgOsmoticPressure: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgOsmoticPressure)))
      : 0,
    totalHighFluxBins: profiles.reduce((s, p) => s + p.highFluxCount, 0),
    avgOsmosisGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.osmosisGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-osmosis").description("HODLMM bin osmosis analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin osmotic pressure dynamics")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
