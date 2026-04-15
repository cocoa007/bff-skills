#!/usr/bin/env bun
/**
 * hodlmm-bin-tunneling.ts — Day 146 cocoa007 Bitflow Skills Comp
 *
 * Quantum tunneling analyzer — models how trade impact penetrates through
 * liquidity barriers and empty bin gaps in HODLMM pools.
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

interface BinTunneling {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  barrierHeight: number;
  barrierWidth: number;
  tunnelProbability: number;
  waveFunction: number;
  decayConstant: number;
  transmissionCoeff: number;
  reflectionCoeff: number;
  evanescentDepth: number;
  resonanceEnergy: number;
  classicalTurningPoint: number;
  gamowFactor: number;
  dwellTime: number;
  tunnelingCurrent: number;
  wkbApprox: number;
  phaseFactor: number;
}

interface TunnelingProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  gapCount: number;
  totalGapWidth: number;
  maxGapWidth: number;
  avgBarrierHeight: number;
  peakBarrierHeight: number;
  peakBarrierBin: number;
  avgTunnelProbability: number;
  minTunnelProbability: number;
  avgTransmissionCoeff: number;
  avgReflectionCoeff: number;
  avgEvanescentDepth: number;
  avgDecayConstant: number;
  totalGamowFactor: number;
  avgDwellTime: number;
  avgTunnelingCurrent: number;
  avgWkbApprox: number;
  tunnelingGini: number;
  tunnelingCoherence: number;
  permeabilityFactor: number;
  tunnelingIndex: number;
  tunnelingRegime: string;
  barrierVerdict: string;
  topBins: BinTunneling[];
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

function identifyGaps(
  bins: BinReserves[],
  activeBin: number
): { start: number; end: number; width: number }[] {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const gaps: { start: number; end: number; width: number }[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapWidth = sorted[i + 1].binId - sorted[i].binId - 1;
    if (gapWidth > 0) {
      gaps.push({
        start: sorted[i].binId,
        end: sorted[i + 1].binId,
        width: gapWidth,
      });
    }
  }
  return gaps;
}

function computeBinTunneling(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  gaps: { start: number; end: number; width: number }[]
): BinTunneling {
  const distance = Math.abs(bin.binId - activeBin);
  const maxReserve = Math.max(...allBins.map((b) => b.totalUsd));
  const reserveFraction = maxReserve > 0 ? bin.totalUsd / maxReserve : 0;

  const barrierHeight = r4(reserveFraction);

  const nearestGap = gaps.reduce<{ start: number; end: number; width: number } | null>(
    (closest, g) => {
      const gapCenter = (g.start + g.end) / 2;
      const dist = Math.abs(bin.binId - gapCenter);
      if (!closest) return g;
      const closestCenter = (closest.start + closest.end) / 2;
      return dist < Math.abs(bin.binId - closestCenter) ? g : closest;
    },
    null
  );
  const barrierWidth = nearestGap ? r4(nearestGap.width) : 0;

  const kappa = barrierHeight > 0 ? Math.sqrt(barrierHeight) : 0.01;
  const tunnelProbability = r4(
    Math.exp(-2 * kappa * (barrierWidth > 0 ? barrierWidth : 1))
  );

  const waveFunction = r4(Math.exp(-kappa * distance));

  const decayConstant = r4(kappa);

  const transmissionCoeff = r4(tunnelProbability / (1 + tunnelProbability));
  const reflectionCoeff = r4(1 - transmissionCoeff);

  const evanescentDepth = kappa > 0 ? r4(1 / kappa) : r4(100);

  const proximityWeight = Math.exp(-distance * 0.3);
  const estimatedBinVolume = volume24hUsd > 0
    ? volume24hUsd * (totalUsd > 0 ? bin.totalUsd / totalUsd : 0) * proximityWeight
    : 0;
  const energyRatio = bin.totalUsd > 0 ? estimatedBinVolume / bin.totalUsd : 0;
  const resonanceEnergy = r4(Math.min(1, energyRatio));

  const classicalTurningPoint = r4(
    barrierHeight > 0 ? Math.min(BIN_SCAN_RADIUS, 1 / barrierHeight) : BIN_SCAN_RADIUS
  );

  const gamowFactor = r4(2 * kappa * Math.max(1, barrierWidth));

  const dwellTime = r4(
    barrierWidth > 0 ? barrierWidth / (kappa > 0 ? kappa : 0.01) : 0
  );

  const tunnelingCurrent = r4(tunnelProbability * resonanceEnergy);

  const wkbExponent = -kappa * Math.max(1, barrierWidth);
  const wkbApprox = r4(Math.exp(2 * wkbExponent));

  const phaseFactor = r4(
    Math.cos(2 * Math.PI * distance / (allBins.length > 1 ? allBins.length : 1)) * 0.5 + 0.5
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    barrierHeight,
    barrierWidth,
    tunnelProbability,
    waveFunction,
    decayConstant,
    transmissionCoeff,
    reflectionCoeff,
    evanescentDepth,
    resonanceEnergy,
    classicalTurningPoint,
    gamowFactor,
    dwellTime,
    tunnelingCurrent,
    wkbApprox,
    phaseFactor,
  };
}

function analyzeTunneling(bins: BinReserves[], pool: AppPool): TunnelingProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;

  const gaps = identifyGaps(sorted, activeBin);
  const gapCount = gaps.length;
  const totalGapWidth = gaps.reduce((s, g) => s + g.width, 0);
  const maxGapWidth = gaps.length > 0 ? Math.max(...gaps.map((g) => g.width)) : 0;

  const binTun = sorted.map((b) =>
    computeBinTunneling(b, activeBin, sorted, totalUsd, volume, gaps)
  );

  const barriers = binTun.map((bt) => bt.barrierHeight);
  const avgBarrierHeight = r4(barriers.reduce((s, v) => s + v, 0) / n);
  const peakBarrierHeight = r4(Math.max(0, ...barriers));
  const peakBarrierData = binTun.find((bt) => bt.barrierHeight === peakBarrierHeight);
  const peakBarrierBin = peakBarrierData ? peakBarrierData.binId : activeBin;

  const tunnelProbs = binTun.map((bt) => bt.tunnelProbability);
  const avgTunnelProbability = r4(tunnelProbs.reduce((s, v) => s + v, 0) / n);
  const minTunnelProbability = r4(Math.min(...tunnelProbs));

  const avgTransmissionCoeff = r4(binTun.reduce((s, bt) => s + bt.transmissionCoeff, 0) / n);
  const avgReflectionCoeff = r4(binTun.reduce((s, bt) => s + bt.reflectionCoeff, 0) / n);
  const avgEvanescentDepth = r4(binTun.reduce((s, bt) => s + bt.evanescentDepth, 0) / n);
  const avgDecayConstant = r4(binTun.reduce((s, bt) => s + bt.decayConstant, 0) / n);
  const totalGamowFactor = r4(binTun.reduce((s, bt) => s + bt.gamowFactor, 0));
  const avgDwellTime = r4(binTun.reduce((s, bt) => s + bt.dwellTime, 0) / n);
  const avgTunnelingCurrent = r4(binTun.reduce((s, bt) => s + bt.tunnelingCurrent, 0) / n);
  const avgWkbApprox = r4(binTun.reduce((s, bt) => s + bt.wkbApprox, 0) / n);

  const sortedProbs = [...tunnelProbs].sort((a, b) => b - a);
  const totalProb = sortedProbs.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedProbs[i];
  }
  const tunnelingGini = totalProb > 0
    ? r4(Math.abs(giniSum) / (n * totalProb))
    : 0;

  let tunnelingCoherence = 0;
  if (n >= 3) {
    const waves = binTun.map((bt) => bt.waveFunction);
    const avgWave = waves.reduce((s, w) => s + w, 0) / n;
    const waveVariance = waves.reduce((s, w) => s + (w - avgWave) ** 2, 0) / n;
    tunnelingCoherence = r4(Math.max(0, 1 - Math.sqrt(waveVariance) * 2));
  }

  const permeabilityFactor = r4(
    avgTunnelProbability * (1 - tunnelingGini) * (gapCount > 0 ? 1 / (1 + Math.log(1 + totalGapWidth)) : 1)
  );

  const transmissionScore = Math.min(25, avgTunnelProbability * 25);
  const lowBarrierScore = Math.min(25, (1 - avgBarrierHeight) * 25);
  const coherenceScore = Math.min(25, tunnelingCoherence * 25);
  const permeabilityScore = Math.min(25, permeabilityFactor * 25);
  const tunnelingIndex = Math.round(
    Math.min(100, transmissionScore + lowBarrierScore + coherenceScore + permeabilityScore)
  );

  let tunnelingRegime: string;
  if (tunnelingIndex >= 80) tunnelingRegime = "SUPERFLUID";
  else if (tunnelingIndex >= 60) tunnelingRegime = "PERMEABLE";
  else if (tunnelingIndex >= 40) tunnelingRegime = "SEMI_PERMEABLE";
  else if (tunnelingIndex >= 20) tunnelingRegime = "RESISTIVE";
  else tunnelingRegime = "IMPENETRABLE";

  let barrierVerdict: string;
  const lowBarrierCount = binTun.filter((bt) => bt.barrierHeight < 0.2).length;
  const highBarrierCount = binTun.filter((bt) => bt.barrierHeight >= 0.7).length;
  if (gapCount === 0 && avgBarrierHeight < 0.2)
    barrierVerdict = "NO_BARRIERS";
  else if (lowBarrierCount > n * 0.7)
    barrierVerdict = "SHALLOW_BARRIERS";
  else if (highBarrierCount > n * 0.4)
    barrierVerdict = "DEEP_BARRIERS";
  else if (maxGapWidth > 5)
    barrierVerdict = "WIDE_GAPS";
  else
    barrierVerdict = "MIXED_TERRAIN";

  const topBins = [...binTun]
    .sort((a, b) => b.barrierHeight - a.barrierHeight)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    gapCount,
    totalGapWidth,
    maxGapWidth,
    avgBarrierHeight,
    peakBarrierHeight,
    peakBarrierBin,
    avgTunnelProbability,
    minTunnelProbability,
    avgTransmissionCoeff,
    avgReflectionCoeff,
    avgEvanescentDepth,
    avgDecayConstant,
    totalGamowFactor,
    avgDwellTime,
    avgTunnelingCurrent,
    avgWkbApprox,
    tunnelingGini,
    tunnelingCoherence,
    permeabilityFactor,
    tunnelingIndex,
    tunnelingRegime,
    barrierVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Tunneling — Doctor ===\n");
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

  const profiles: TunnelingProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeTunneling(bins, pool));
    } catch {
      continue;
    }
  }

  const summary = {
    poolsAnalyzed: profiles.length,
    avgTunnelingIndex: profiles.length > 0
      ? r2(profiles.reduce((s, p) => s + p.tunnelingIndex, 0) / profiles.length)
      : 0,
    superfluidCount: profiles.filter((p) => p.tunnelingRegime === "SUPERFLUID").length,
    permeableCount: profiles.filter((p) => p.tunnelingRegime === "PERMEABLE").length,
    semiPermeableCount: profiles.filter((p) => p.tunnelingRegime === "SEMI_PERMEABLE").length,
    resistiveCount: profiles.filter((p) => p.tunnelingRegime === "RESISTIVE").length,
    impenetrableCount: profiles.filter((p) => p.tunnelingRegime === "IMPENETRABLE").length,
    avgBarrierHeight: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.avgBarrierHeight, 0) / profiles.length)
      : 0,
    avgTunnelProbability: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.avgTunnelProbability, 0) / profiles.length)
      : 0,
    totalGaps: profiles.reduce((s, p) => s + p.gapCount, 0),
    maxGapWidth: profiles.length > 0 ? Math.max(...profiles.map((p) => p.maxGapWidth)) : 0,
    avgTunnelingGini: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.tunnelingGini, 0) / profiles.length)
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-tunneling").description("HODLMM bin tunneling analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin tunneling dynamics")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
