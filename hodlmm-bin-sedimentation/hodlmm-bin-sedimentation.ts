#!/usr/bin/env bun
/**
 * hodlmm-bin-sedimentation.ts — Day 154 cocoa007 Bitflow Skills Comp
 *
 * Sedimentation analyzer — models reserve settling dynamics across HODLMM bins.
 * The bin range acts as a sedimentation column where token reserves behave as
 * particles settling under gravitational forces. Settling velocity, buoyancy,
 * drag, and consolidation metrics reveal accumulation patterns.
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

interface BinSedimentation {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  settlingVelocity: number;
  sedimentationCoefficient: number;
  buoyancyFactor: number;
  stokesRadius: number;
  centrifugalForce: number;
  dragCoefficient: number;
  terminalVelocity: number;
  densityGradient: number;
  boundaryLayer: number;
  pecletNumber: number;
  consolidationRatio: number;
  hinderedSettling: number;
  clarityIndex: number;
  sedimentationFactor: number;
}

interface SedimentationProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgSettlingVelocity: number;
  maxSettlingVelocity: number;
  avgSedimentationCoefficient: number;
  maxSedimentationCoefficient: number;
  avgBuoyancyFactor: number;
  minBuoyancyFactor: number;
  avgStokesRadius: number;
  maxStokesRadius: number;
  avgCentrifugalForce: number;
  maxCentrifugalForce: number;
  avgDragCoefficient: number;
  maxDragCoefficient: number;
  avgTerminalVelocity: number;
  maxTerminalVelocity: number;
  avgDensityGradient: number;
  maxDensityGradient: number;
  avgBoundaryLayer: number;
  maxBoundaryLayer: number;
  avgPecletNumber: number;
  maxPecletNumber: number;
  avgConsolidationRatio: number;
  maxConsolidationRatio: number;
  avgHinderedSettling: number;
  maxHinderedSettling: number;
  avgClarityIndex: number;
  minClarityIndex: number;
  heavySettlerCount: number;
  heavySettlerFraction: number;
  wellConsolidatedCount: number;
  wellConsolidatedFraction: number;
  sedimentationGini: number;
  sedimentationIndex: number;
  sedimentationPhase: string;
  sedimentationVerdict: string;
  topBins: BinSedimentation[];
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

function computeBinSedimentation(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  maxReserve: number
): BinSedimentation {
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

  // 1. settlingVelocity — Stokes settling: v = (d^2 * (rho_p - rho_f) * g) / (18 * mu)
  // Maps reserve concentration relative to surroundings as density differential
  const densityDiff = neighborAvg > 0 ? (bin.totalUsd - neighborAvg) / neighborAvg : 0;
  const settlingVelocity = r4(
    Math.min(10, Math.max(-10, densityDiff * reserveFraction * 5))
  );

  // 2. sedimentationCoefficient — S = v / a, normalized settling rate per unit acceleration
  const sedimentationCoefficient = r4(
    Math.min(10, Math.abs(settlingVelocity) * (1 + distance * 0.03))
  );

  // 3. buoyancyFactor — (rho_p - rho_f) / rho_p, how heavy/light the particle is relative to medium
  const avgReserve = totalUsd / n;
  const buoyancyFactor = r4(
    avgReserve > 0
      ? Math.min(1, Math.max(-1, (bin.totalUsd - avgReserve) / (avgReserve + bin.totalUsd)))
      : 0
  );

  // 4. stokesRadius — effective hydrodynamic radius of the reserve cluster
  const stokesRadius = r4(
    Math.min(10, Math.sqrt(reserveFraction) * (1 + Math.abs(buoyancyFactor)) * 3)
  );

  // 5. centrifugalForce — trading-driven acceleration on reserves
  const centrifugalForce = r4(
    Math.min(10, volumeRatio * reserveFraction * (1 + distance * 0.05) * 5)
  );

  // 6. dragCoefficient — Cd, resistance to reserve movement through the bin column
  const localConcentration = totalUsd > 0 ? bin.totalUsd / totalUsd : 0;
  const dragCoefficient = r4(
    Math.min(5, (1 - reserveFraction) * 2 + localConcentration * n * 0.5)
  );

  // 7. terminalVelocity — maximum settling speed when drag equals gravitational pull
  const terminalVelocity = r4(
    dragCoefficient > 0.01
      ? Math.min(10, Math.abs(settlingVelocity * buoyancyFactor) / dragCoefficient * 3)
      : Math.abs(settlingVelocity)
  );

  // 8. densityGradient — reserve concentration change across neighboring bins
  const leftBins = allBins.filter(b => b.binId < bin.binId && b.binId >= bin.binId - 3);
  const rightBins = allBins.filter(b => b.binId > bin.binId && b.binId <= bin.binId + 3);
  const leftAvg = leftBins.length > 0 ? leftBins.reduce((s, b) => s + b.totalUsd, 0) / leftBins.length : 0;
  const rightAvg = rightBins.length > 0 ? rightBins.reduce((s, b) => s + b.totalUsd, 0) / rightBins.length : 0;
  const densityGradient = r4(
    bin.totalUsd > 0
      ? Math.min(5, Math.abs(leftAvg - rightAvg) / bin.totalUsd * 2)
      : 0
  );

  // 9. boundaryLayer — thickness of the interface between settled and suspended reserves
  const neighborVariance = neighbors.length > 1
    ? neighbors.reduce((s, b) => s + Math.pow(b.totalUsd - neighborAvg, 2), 0) / neighbors.length
    : 0;
  const normalizedStdDev = totalUsd > 0 ? Math.sqrt(neighborVariance) / (totalUsd / n) : 0;
  const boundaryLayer = r4(
    Math.min(5, normalizedStdDev * (1 + distance * 0.02) * 1.5)
  );

  // 10. pecletNumber — Pe = v*L/D, ratio of sedimentation to diffusion
  const diffusionEstimate = volumeRatio * 0.5 + 0.01;
  const pecletNumber = r4(
    Math.min(100, Math.abs(settlingVelocity) * n / (diffusionEstimate * 10))
  );

  // 11. consolidationRatio — how much settling has already occurred (0=suspended, 1=fully settled)
  const consolidationRatio = r4(
    Math.min(1, reserveFraction * (1 + Math.abs(buoyancyFactor)) * 0.7)
  );

  // 12. hinderedSettling — concentration-dependent reduction in settling rate
  const phi = localConcentration * n;
  const hinderedSettling = r4(
    Math.min(1, phi > 0.01 ? Math.min(1, phi * (1 - phi * 0.5) * 2) : 0)
  );

  // 13. clarityIndex — supernatant clarity, how depleted the low-reserve regions are
  const clarityIndex = r4(
    Math.min(1, Math.max(0, 1 - reserveFraction * (1 + hinderedSettling)))
  );

  // 14. sedimentationFactor — composite quality metric
  const sedimentationFactor = r4(
    Math.min(1,
      Math.abs(settlingVelocity) / 10 * 0.25 +
      consolidationRatio * 0.25 +
      (1 - clarityIndex) * 0.25 +
      sedimentationCoefficient / 10 * 0.25
    )
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    settlingVelocity,
    sedimentationCoefficient,
    buoyancyFactor,
    stokesRadius,
    centrifugalForce,
    dragCoefficient,
    terminalVelocity,
    densityGradient,
    boundaryLayer,
    pecletNumber,
    consolidationRatio,
    hinderedSettling,
    clarityIndex,
    sedimentationFactor,
  };
}

function analyzeSedimentation(bins: BinReserves[], pool: AppPool): SedimentationProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));

  const binSed = sorted.map((b) =>
    computeBinSedimentation(b, activeBin, sorted, totalUsd, volume, maxReserve)
  );

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgSettlingVelocity = r4(avg(binSed.map((b) => b.settlingVelocity)));
  const maxSettlingVelocity = r4(Math.max(...binSed.map((b) => b.settlingVelocity)));
  const avgSedimentationCoefficient = r4(avg(binSed.map((b) => b.sedimentationCoefficient)));
  const maxSedimentationCoefficient = r4(Math.max(...binSed.map((b) => b.sedimentationCoefficient)));
  const avgBuoyancyFactor = r4(avg(binSed.map((b) => b.buoyancyFactor)));
  const minBuoyancyFactor = r4(Math.min(...binSed.map((b) => b.buoyancyFactor)));
  const avgStokesRadius = r4(avg(binSed.map((b) => b.stokesRadius)));
  const maxStokesRadius = r4(Math.max(...binSed.map((b) => b.stokesRadius)));
  const avgCentrifugalForce = r4(avg(binSed.map((b) => b.centrifugalForce)));
  const maxCentrifugalForce = r4(Math.max(...binSed.map((b) => b.centrifugalForce)));
  const avgDragCoefficient = r4(avg(binSed.map((b) => b.dragCoefficient)));
  const maxDragCoefficient = r4(Math.max(...binSed.map((b) => b.dragCoefficient)));
  const avgTerminalVelocity = r4(avg(binSed.map((b) => b.terminalVelocity)));
  const maxTerminalVelocity = r4(Math.max(...binSed.map((b) => b.terminalVelocity)));
  const avgDensityGradient = r4(avg(binSed.map((b) => b.densityGradient)));
  const maxDensityGradient = r4(Math.max(...binSed.map((b) => b.densityGradient)));
  const avgBoundaryLayer = r4(avg(binSed.map((b) => b.boundaryLayer)));
  const maxBoundaryLayer = r4(Math.max(...binSed.map((b) => b.boundaryLayer)));
  const avgPecletNumber = r4(avg(binSed.map((b) => b.pecletNumber)));
  const maxPecletNumber = r4(Math.max(...binSed.map((b) => b.pecletNumber)));
  const avgConsolidationRatio = r4(avg(binSed.map((b) => b.consolidationRatio)));
  const maxConsolidationRatio = r4(Math.max(...binSed.map((b) => b.consolidationRatio)));
  const avgHinderedSettling = r4(avg(binSed.map((b) => b.hinderedSettling)));
  const maxHinderedSettling = r4(Math.max(...binSed.map((b) => b.hinderedSettling)));
  const avgClarityIndex = r4(avg(binSed.map((b) => b.clarityIndex)));
  const minClarityIndex = r4(Math.min(...binSed.map((b) => b.clarityIndex)));
  const heavySettlerCount = binSed.filter((b) => b.buoyancyFactor > 0.3).length;
  const heavySettlerFraction = r4(heavySettlerCount / n);
  const wellConsolidatedCount = binSed.filter((b) => b.consolidationRatio > 0.5).length;
  const wellConsolidatedFraction = r4(wellConsolidatedCount / n);

  // Gini coefficient on sedimentation coefficients
  const sedCoeffs = binSed.map((b) => b.sedimentationCoefficient);
  const sortedCoeffs = [...sedCoeffs].sort((a, b) => b - a);
  const totalCoeffs = sortedCoeffs.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedCoeffs[i];
  }
  const sedimentationGini = totalCoeffs > 0
    ? r4(Math.abs(giniSum) / (n * totalCoeffs))
    : 0;

  // Composite sedimentation index (0-100)
  const settlingScore = Math.min(25, Math.abs(avgSettlingVelocity) / 10 * 25);
  const consolidationScore = Math.min(25, avgConsolidationRatio * 25);
  const hinderedScore = Math.min(25, avgHinderedSettling * 25);
  const gradientScore = Math.min(25, avgDensityGradient / 5 * 25);
  const sedimentationIndex = Math.round(
    Math.min(100, settlingScore + consolidationScore + hinderedScore + gradientScore)
  );

  let sedimentationPhase: string;
  if (sedimentationIndex >= 80) sedimentationPhase = "COMPACTED_SEDIMENT";
  else if (sedimentationIndex >= 60) sedimentationPhase = "HINDERED_SETTLING";
  else if (sedimentationIndex >= 40) sedimentationPhase = "FLOCCULATION_ZONE";
  else if (sedimentationIndex >= 20) sedimentationPhase = "FREE_SETTLING";
  else sedimentationPhase = "SUSPENDED_COLLOID";

  let sedimentationVerdict: string;
  if (avgDensityGradient > 2 && avgBoundaryLayer > 2)
    sedimentationVerdict = "TURBIDITY_STORM";
  else if (avgBuoyancyFactor < -0.2 && heavySettlerFraction < 0.2)
    sedimentationVerdict = "DENSITY_INVERSION";
  else if (avgConsolidationRatio > 0.6 && avgHinderedSettling > 0.5)
    sedimentationVerdict = "GRAVITATIONAL_COLLAPSE";
  else if (avgClarityIndex > 0.7 && avgConsolidationRatio < 0.3)
    sedimentationVerdict = "CLEAR_SUPERNATANT";
  else if (avgHinderedSettling > 0.4 && avgClarityIndex < 0.5)
    sedimentationVerdict = "FLOC_ENTRAPMENT";
  else
    sedimentationVerdict = "CLEAR_SUPERNATANT";

  const topBins = [...binSed]
    .sort((a, b) => b.sedimentationFactor - a.sedimentationFactor)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgSettlingVelocity,
    maxSettlingVelocity,
    avgSedimentationCoefficient,
    maxSedimentationCoefficient,
    avgBuoyancyFactor,
    minBuoyancyFactor,
    avgStokesRadius,
    maxStokesRadius,
    avgCentrifugalForce,
    maxCentrifugalForce,
    avgDragCoefficient,
    maxDragCoefficient,
    avgTerminalVelocity,
    maxTerminalVelocity,
    avgDensityGradient,
    maxDensityGradient,
    avgBoundaryLayer,
    maxBoundaryLayer,
    avgPecletNumber,
    maxPecletNumber,
    avgConsolidationRatio,
    maxConsolidationRatio,
    avgHinderedSettling,
    maxHinderedSettling,
    avgClarityIndex,
    minClarityIndex,
    heavySettlerCount,
    heavySettlerFraction,
    wellConsolidatedCount,
    wellConsolidatedFraction,
    sedimentationGini,
    sedimentationIndex,
    sedimentationPhase,
    sedimentationVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Sedimentation — Doctor ===\n");
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

  const profiles: SedimentationProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeSedimentation(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgSedimentationIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.sedimentationIndex)))
      : 0,
    compactedSedimentCount: profiles.filter((p) => p.sedimentationPhase === "COMPACTED_SEDIMENT").length,
    hinderedSettlingCount: profiles.filter((p) => p.sedimentationPhase === "HINDERED_SETTLING").length,
    flocculationZoneCount: profiles.filter((p) => p.sedimentationPhase === "FLOCCULATION_ZONE").length,
    freeSettlingCount: profiles.filter((p) => p.sedimentationPhase === "FREE_SETTLING").length,
    suspendedColloidCount: profiles.filter((p) => p.sedimentationPhase === "SUSPENDED_COLLOID").length,
    avgSettlingVelocity: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgSettlingVelocity)))
      : 0,
    avgConsolidationRatio: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgConsolidationRatio)))
      : 0,
    totalHeavySettlerBins: profiles.reduce((s, p) => s + p.heavySettlerCount, 0),
    avgSedimentationGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.sedimentationGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-sedimentation").description("HODLMM bin sedimentation analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin sedimentation dynamics")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
