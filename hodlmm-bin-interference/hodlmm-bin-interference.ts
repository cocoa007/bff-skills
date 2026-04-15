#!/usr/bin/env bun
/**
 * hodlmm-bin-interference.ts — Day 143 cocoa007 Bitflow Skills Comp
 *
 * Interference analyzer — models liquidity wave superposition across HODLMM bins,
 * detecting constructive/destructive interference patterns that amplify or cancel
 * market-making capacity.
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

interface BinInterference {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  waveAmplitude: number;
  phaseAngle: number;
  superpositionAmplitude: number;
  interferenceType: string;
  fringeVisibility: number;
  coherenceLength: number;
  pathDifference: number;
  standingWaveRatio: number;
  nodalProximity: number;
  diffractionOrder: number;
  waveNumber: number;
  groupVelocity: number;
  phaseVelocity: number;
  beatFrequency: number;
}

interface InterferenceProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgWaveAmplitude: number;
  peakSuperposition: number;
  peakBin: number;
  constructiveCount: number;
  destructiveCount: number;
  partialCount: number;
  avgFringeVisibility: number;
  avgCoherenceLength: number;
  maxStandingWaveRatio: number;
  avgStandingWaveRatio: number;
  nodalCount: number;
  antinodalCount: number;
  avgPathDifference: number;
  avgDiffractionOrder: number;
  avgGroupVelocity: number;
  avgPhaseVelocity: number;
  dispersionIndex: number;
  interferenceGini: number;
  patternPeriodicity: number;
  envelopeDecay: number;
  interferenceIndex: number;
  waveRegime: string;
  patternVerdict: string;
  topBins: BinInterference[];
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

function computeBinInterference(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  avgReserve: number,
  totalUsd: number,
  volume24hUsd: number,
  feeBps: number
): BinInterference {
  const distance = Math.abs(bin.binId - activeBin);
  const n = allBins.length;
  const maxReserve = Math.max(...allBins.map((b) => b.totalUsd));

  const waveAmplitude = maxReserve > 0 ? r4(bin.totalUsd / maxReserve) : 0;

  const reserveRatioX = bin.reserveXUsd / Math.max(1, bin.totalUsd);
  const phaseAngle = r4(reserveRatioX * Math.PI);

  const neighbors = allBins.filter(
    (b) => Math.abs(b.binId - bin.binId) <= 2 && b.binId !== bin.binId
  );
  let superpositionAmplitude = waveAmplitude;
  for (const nb of neighbors) {
    const nbAmplitude = maxReserve > 0 ? nb.totalUsd / maxReserve : 0;
    const nbPhase = (nb.reserveXUsd / Math.max(1, nb.totalUsd)) * Math.PI;
    const phaseDiff = Math.abs(phaseAngle - nbPhase);
    superpositionAmplitude += nbAmplitude * Math.cos(phaseDiff);
  }
  superpositionAmplitude = r4(Math.max(0, superpositionAmplitude / (1 + neighbors.length)));

  let interferenceType: string;
  if (neighbors.length === 0) {
    interferenceType = "isolated";
  } else {
    const avgNeighborAmp = neighbors.reduce(
      (s, nb) => s + (maxReserve > 0 ? nb.totalUsd / maxReserve : 0), 0
    ) / neighbors.length;
    const ampRatio = avgNeighborAmp > 0 ? superpositionAmplitude / avgNeighborAmp : 0;
    if (ampRatio > 1.3) interferenceType = "constructive";
    else if (ampRatio < 0.5) interferenceType = "destructive";
    else interferenceType = "partial";
  }

  let fringeVisibility = 0;
  if (neighbors.length > 0) {
    const amps = [waveAmplitude, ...neighbors.map((nb) => maxReserve > 0 ? nb.totalUsd / maxReserve : 0)];
    const maxA = Math.max(...amps);
    const minA = Math.min(...amps);
    fringeVisibility = maxA + minA > 0 ? r4((maxA - minA) / (maxA + minA)) : 0;
  }

  let coherentNeighbors = 0;
  for (const nb of neighbors) {
    const nbPhase = (nb.reserveXUsd / Math.max(1, nb.totalUsd)) * Math.PI;
    if (Math.abs(phaseAngle - nbPhase) < Math.PI / 4) coherentNeighbors++;
  }
  const coherenceLength = neighbors.length > 0
    ? r4(coherentNeighbors / neighbors.length)
    : 0;

  const pathDifference = r4(distance * (1 - waveAmplitude));

  const forwardNeighbor = allBins.find((b) => b.binId === bin.binId + 1);
  const backwardNeighbor = allBins.find((b) => b.binId === bin.binId - 1);
  let standingWaveRatio = 1;
  if (forwardNeighbor && backwardNeighbor) {
    const incidentAmp = Math.max(forwardNeighbor.totalUsd, backwardNeighbor.totalUsd);
    const reflectedAmp = Math.min(forwardNeighbor.totalUsd, backwardNeighbor.totalUsd);
    standingWaveRatio = incidentAmp > 0
      ? r4((incidentAmp + reflectedAmp) / (incidentAmp - reflectedAmp + 1))
      : 1;
  }

  const nodalProximity = neighbors.length > 0
    ? r4(1 - superpositionAmplitude / Math.max(0.001, waveAmplitude))
    : 0;

  const wavelength = n > 1 ? n / 2 : 1;
  const diffractionOrder = r4(distance / wavelength);

  const waveNumber = r4(2 * Math.PI / Math.max(1, wavelength));

  const proximityWeight = Math.exp(-distance * 0.3);
  const reserveFraction = totalUsd > 0 ? bin.totalUsd / totalUsd : 0;
  const estimatedBinVolume = volume24hUsd * reserveFraction * proximityWeight;
  const groupVelocity = bin.totalUsd > 0
    ? r4(estimatedBinVolume / bin.totalUsd)
    : 0;

  const phaseVelocity = bin.totalUsd > 0
    ? r4(estimatedBinVolume * (feeBps / 10000) / bin.totalUsd * 100)
    : 0;

  let beatFrequency = 0;
  if (neighbors.length >= 2) {
    const neighborAmps = neighbors.map((nb) => maxReserve > 0 ? nb.totalUsd / maxReserve : 0);
    neighborAmps.sort((a, b) => b - a);
    beatFrequency = r4(Math.abs(neighborAmps[0] - neighborAmps[neighborAmps.length - 1]));
  }

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    waveAmplitude,
    phaseAngle,
    superpositionAmplitude,
    interferenceType,
    fringeVisibility,
    coherenceLength,
    pathDifference,
    standingWaveRatio,
    nodalProximity,
    diffractionOrder,
    waveNumber,
    groupVelocity,
    phaseVelocity,
    beatFrequency,
  };
}

function analyzeInterference(bins: BinReserves[], pool: AppPool): InterferenceProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const avgReserve = totalUsd / n;
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const feeBps = pool.feeBps || 30;

  const binInt = sorted.map((b) =>
    computeBinInterference(b, activeBin, sorted, avgReserve, totalUsd, volume, feeBps)
  );

  const avgWaveAmplitude = r4(
    binInt.reduce((s, bi) => s + bi.waveAmplitude, 0) / n
  );

  const superpositions = binInt.map((bi) => bi.superpositionAmplitude);
  const peakSuperposition = r4(Math.max(0, ...superpositions));
  const peakBinData = binInt.find((bi) => bi.superpositionAmplitude === peakSuperposition);
  const peakBin = peakBinData ? peakBinData.binId : activeBin;

  const constructiveCount = binInt.filter((bi) => bi.interferenceType === "constructive").length;
  const destructiveCount = binInt.filter((bi) => bi.interferenceType === "destructive").length;
  const partialCount = binInt.filter((bi) => bi.interferenceType === "partial").length;

  const avgFringeVisibility = r4(
    binInt.reduce((s, bi) => s + bi.fringeVisibility, 0) / n
  );
  const avgCoherenceLength = r4(
    binInt.reduce((s, bi) => s + bi.coherenceLength, 0) / n
  );

  const swrValues = binInt.map((bi) => bi.standingWaveRatio);
  const maxStandingWaveRatio = r4(Math.max(1, ...swrValues));
  const avgStandingWaveRatio = r4(
    swrValues.reduce((s, v) => s + v, 0) / n
  );

  const nodalThreshold = 0.5;
  const nodalCount = binInt.filter((bi) => bi.nodalProximity > nodalThreshold).length;
  const antinodalCount = binInt.filter((bi) => bi.nodalProximity < -0.1).length;

  const avgPathDifference = r4(
    binInt.reduce((s, bi) => s + bi.pathDifference, 0) / n
  );
  const avgDiffractionOrder = r4(
    binInt.reduce((s, bi) => s + bi.diffractionOrder, 0) / n
  );

  const avgGroupVelocity = r4(
    binInt.reduce((s, bi) => s + bi.groupVelocity, 0) / n
  );
  const avgPhaseVelocity = r4(
    binInt.reduce((s, bi) => s + bi.phaseVelocity, 0) / n
  );

  const dispersionIndex = avgGroupVelocity > 0
    ? r4(Math.abs(avgPhaseVelocity - avgGroupVelocity) / avgGroupVelocity)
    : 0;

  const sortedSuperpositions = [...superpositions].sort((a, b) => b - a);
  const totalSuperposition = sortedSuperpositions.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedSuperpositions[i];
  }
  const interferenceGini = totalSuperposition > 0
    ? r4(Math.abs(giniSum) / (n * totalSuperposition))
    : 0;

  let patternPeriodicity = 0;
  if (n >= 6) {
    const amps = binInt.map((bi) => bi.waveAmplitude);
    let bestPeriod = 0;
    let bestCorr = -1;
    for (let period = 2; period <= Math.floor(n / 2); period++) {
      let corr = 0;
      let count = 0;
      for (let i = 0; i < n - period; i++) {
        corr += amps[i] * amps[i + period];
        count++;
      }
      const avgCorr = count > 0 ? corr / count : 0;
      if (avgCorr > bestCorr) {
        bestCorr = avgCorr;
        bestPeriod = period;
      }
    }
    const variance = amps.reduce((s, a) => s + (a - avgWaveAmplitude) ** 2, 0) / n;
    patternPeriodicity = variance > 0 ? r4(Math.min(1, bestCorr / variance)) : 0;
  }

  const binsByDistance = binInt
    .filter((bi) => bi.superpositionAmplitude > 0)
    .sort((a, b) => a.distanceFromActive - b.distanceFromActive);
  let envelopeDecay = 0;
  if (binsByDistance.length >= 3) {
    const nearAmp = binsByDistance.slice(0, 3).reduce((s, bi) => s + bi.superpositionAmplitude, 0) / 3;
    const farAmp = binsByDistance.slice(-3).reduce((s, bi) => s + bi.superpositionAmplitude, 0) / 3;
    envelopeDecay = nearAmp > 0 ? r4(1 - farAmp / nearAmp) : 0;
  }

  const constructiveScore = Math.min(25, (constructiveCount / Math.max(1, n)) * 50);
  const coherenceScore = Math.min(25, avgCoherenceLength * 25);
  const visibilityScore = Math.min(25, (1 - avgFringeVisibility) * 25);
  const dispersionScore = Math.min(25, (1 - Math.min(1, dispersionIndex)) * 25);
  const interferenceIndex = Math.round(
    Math.min(100, constructiveScore + coherenceScore + visibilityScore + dispersionScore)
  );

  let waveRegime: string;
  if (interferenceIndex >= 80) waveRegime = "COHERENT_AMPLIFICATION";
  else if (interferenceIndex >= 60) waveRegime = "STANDING_WAVE";
  else if (interferenceIndex >= 40) waveRegime = "PARTIAL_COHERENCE";
  else if (interferenceIndex >= 20) waveRegime = "DECOHERENT";
  else waveRegime = "DESTRUCTIVE_COLLAPSE";

  let patternVerdict: string;
  if (constructiveCount > destructiveCount * 3 && avgCoherenceLength > 0.6)
    patternVerdict = "REINFORCING";
  else if (constructiveCount > destructiveCount * 1.5)
    patternVerdict = "CONSTRUCTIVE";
  else if (constructiveCount > destructiveCount)
    patternVerdict = "MIXED_POSITIVE";
  else if (destructiveCount > constructiveCount)
    patternVerdict = "CANCELING";
  else patternVerdict = "NEUTRAL";

  const topBins = [...binInt]
    .sort((a, b) => b.superpositionAmplitude - a.superpositionAmplitude)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgWaveAmplitude,
    peakSuperposition,
    peakBin,
    constructiveCount,
    destructiveCount,
    partialCount,
    avgFringeVisibility,
    avgCoherenceLength,
    maxStandingWaveRatio,
    avgStandingWaveRatio,
    nodalCount,
    antinodalCount,
    avgPathDifference,
    avgDiffractionOrder,
    avgGroupVelocity,
    avgPhaseVelocity,
    dispersionIndex,
    interferenceGini,
    patternPeriodicity,
    envelopeDecay,
    interferenceIndex,
    waveRegime,
    patternVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Interference — Doctor ===\n");
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

  const profiles: InterferenceProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeInterference(bins, pool));
    } catch {
      continue;
    }
  }

  const summary = {
    poolsAnalyzed: profiles.length,
    avgInterferenceIndex: profiles.length > 0
      ? r2(profiles.reduce((s, p) => s + p.interferenceIndex, 0) / profiles.length)
      : 0,
    coherentAmplificationCount: profiles.filter((p) => p.waveRegime === "COHERENT_AMPLIFICATION").length,
    standingWaveCount: profiles.filter((p) => p.waveRegime === "STANDING_WAVE").length,
    partialCoherenceCount: profiles.filter((p) => p.waveRegime === "PARTIAL_COHERENCE").length,
    decoherentCount: profiles.filter((p) => p.waveRegime === "DECOHERENT").length,
    destructiveCollapseCount: profiles.filter((p) => p.waveRegime === "DESTRUCTIVE_COLLAPSE").length,
    avgCoherenceLength: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.avgCoherenceLength, 0) / profiles.length)
      : 0,
    avgFringeVisibility: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.avgFringeVisibility, 0) / profiles.length)
      : 0,
    totalConstructive: profiles.reduce((s, p) => s + p.constructiveCount, 0),
    totalDestructive: profiles.reduce((s, p) => s + p.destructiveCount, 0),
    avgInterferenceGini: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.interferenceGini, 0) / profiles.length)
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-interference").description("HODLMM bin interference analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin interference patterns")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
