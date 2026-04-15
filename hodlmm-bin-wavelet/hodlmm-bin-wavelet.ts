#!/usr/bin/env bun
/**
 * hodlmm-bin-wavelet.ts — Day 136 cocoa007 Bitflow Skills Comp
 *
 * Wavelet decomposition analyzer — decomposes HODLMM bin reserve distributions
 * into multi-scale frequency components using Haar wavelet transform.
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

interface WaveletLevel {
  level: number;
  scale: number;
  energy: number;
  energyFraction: number;
  maxCoefficient: number;
  minCoefficient: number;
  meanCoefficient: number;
  stdCoefficient: number;
  coefficientCount: number;
  anomalyBins: number[];
}

interface WaveletProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsAnalyzed: number;
  totalUsd: number;
  decompositionLevels: number;
  totalEnergy: number;
  approximationEnergy: number;
  detailEnergy: number;
  approximationFraction: number;
  detailFraction: number;
  waveletEntropy: number;
  dominantScale: number;
  dominantScaleLevel: number;
  energyConcentration: number;
  spectralFlatness: number;
  spectralCentroid: number;
  spectralRolloff: number;
  multiResolutionComplexity: number;
  denoiseResidualEnergy: number;
  denoiseSnr: number;
  trendStrength: number;
  noiseRatio: number;
  scaleTransitionSharpness: number;
  highFreqDominance: number;
  lowFreqDominance: number;
  crossScaleCorrelation: number;
  waveletKurtosis: number;
  waveletSkewness: number;
  persistenceIndex: number;
  waveletIndex: number;
  structureClass: string;
  scaleRegime: string;
  levels: WaveletLevel[];
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

function haarForward(signal: number[]): { approximation: number[]; details: number[][] } {
  let current = [...signal];
  const n = current.length;
  const maxLevels = Math.floor(Math.log2(n));
  const details: number[][] = [];

  for (let level = 0; level < maxLevels && current.length >= 2; level++) {
    const len = current.length;
    const pairs = Math.floor(len / 2);
    const approx: number[] = [];
    const detail: number[] = [];

    for (let i = 0; i < pairs; i++) {
      const a = current[2 * i];
      const b = current[2 * i + 1];
      approx.push((a + b) / Math.SQRT2);
      detail.push((a - b) / Math.SQRT2);
    }
    if (len % 2 === 1) {
      approx.push(current[len - 1] / Math.SQRT2);
    }

    details.push(detail);
    current = approx;
  }

  return { approximation: current, details };
}

function analyzeWavelet(bins: BinReserves[], pool: AppPool): WaveletProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const reserves = sorted.map((b) => b.totalUsd);

  const { approximation, details } = haarForward(reserves);

  const approxEnergy = approximation.reduce((s, c) => s + c * c, 0);
  const detailEnergies = details.map((d) => d.reduce((s, c) => s + c * c, 0));
  const totalDetailEnergy = detailEnergies.reduce((s, e) => s + e, 0);
  const totalEnergy = approxEnergy + totalDetailEnergy;

  const levels: WaveletLevel[] = details.map((d, i) => {
    const energy = detailEnergies[i];
    const absCoeffs = d.map((c) => Math.abs(c));
    const mean = d.reduce((s, c) => s + c, 0) / d.length;
    const variance = d.reduce((s, c) => s + (c - mean) ** 2, 0) / d.length;
    const std = Math.sqrt(variance);
    const threshold = mean + 2 * std;

    const anomalyBins: number[] = [];
    for (let j = 0; j < d.length; j++) {
      if (Math.abs(d[j]) > Math.abs(threshold) + std) {
        const binIdx = Math.min(j * Math.pow(2, i + 1), n - 1);
        anomalyBins.push(sorted[Math.floor(binIdx)]?.binId || activeBin);
      }
    }

    return {
      level: i + 1,
      scale: Math.pow(2, i + 1),
      energy: r2(energy),
      energyFraction: totalEnergy > 0 ? r4(energy / totalEnergy) : 0,
      maxCoefficient: r2(Math.max(...absCoeffs)),
      minCoefficient: r2(Math.min(...absCoeffs)),
      meanCoefficient: r2(mean),
      stdCoefficient: r2(std),
      coefficientCount: d.length,
      anomalyBins: anomalyBins.slice(0, 5),
    };
  });

  const energyFractions = detailEnergies.map((e) => (totalEnergy > 0 ? e / totalEnergy : 0));
  const approxFraction = totalEnergy > 0 ? approxEnergy / totalEnergy : 1;

  let waveletEntropy = 0;
  const allFractions = [approxFraction, ...energyFractions].filter((f) => f > 0);
  for (const f of allFractions) {
    waveletEntropy -= f * Math.log2(f);
  }
  const maxEntropy = Math.log2(allFractions.length);
  waveletEntropy = maxEntropy > 0 ? waveletEntropy / maxEntropy : 0;

  let dominantDetailIdx = 0;
  let dominantDetailEnergy = 0;
  for (let i = 0; i < detailEnergies.length; i++) {
    if (detailEnergies[i] > dominantDetailEnergy) {
      dominantDetailEnergy = detailEnergies[i];
      dominantDetailIdx = i;
    }
  }
  const dominantScale = Math.pow(2, dominantDetailIdx + 1);
  const dominantScaleLevel = dominantDetailIdx + 1;

  const energyConcentration = totalEnergy > 0
    ? Math.max(approxFraction, ...energyFractions)
    : 1;

  const geometricMean = allFractions.length > 0
    ? Math.exp(allFractions.reduce((s, f) => s + Math.log(f + 1e-12), 0) / allFractions.length)
    : 0;
  const arithmeticMean = allFractions.length > 0
    ? allFractions.reduce((s, f) => s + f, 0) / allFractions.length
    : 0;
  const spectralFlatness = arithmeticMean > 0 ? geometricMean / arithmeticMean : 0;

  let spectralCentroid = 0;
  let totalWeight = 0;
  for (let i = 0; i < detailEnergies.length; i++) {
    spectralCentroid += (i + 1) * detailEnergies[i];
    totalWeight += detailEnergies[i];
  }
  spectralCentroid = totalWeight > 0 ? spectralCentroid / totalWeight : 0;

  let cumulativeEnergy = 0;
  let spectralRolloff = details.length;
  for (let i = 0; i < detailEnergies.length; i++) {
    cumulativeEnergy += detailEnergies[i];
    if (cumulativeEnergy >= totalDetailEnergy * 0.85) {
      spectralRolloff = i + 1;
      break;
    }
  }

  const multiResolutionComplexity = levels.filter((l) => l.energyFraction > 0.05).length;

  const finestDetails = details[0] || [];
  const denoiseResidualEnergy = finestDetails.reduce((s, c) => s + c * c, 0);
  const denoiseSnr = denoiseResidualEnergy > 0
    ? r2(10 * Math.log10((totalEnergy - denoiseResidualEnergy) / denoiseResidualEnergy))
    : 99;

  const trendStrength = r4(approxFraction);
  const noiseRatio = totalEnergy > 0 ? r4(denoiseResidualEnergy / totalEnergy) : 0;

  let maxTransition = 0;
  for (let i = 1; i < energyFractions.length; i++) {
    const diff = Math.abs(energyFractions[i] - energyFractions[i - 1]);
    if (diff > maxTransition) maxTransition = diff;
  }
  const scaleTransitionSharpness = r4(maxTransition);

  const halfIdx = Math.floor(details.length / 2);
  const highFreqEnergy = detailEnergies.slice(0, halfIdx).reduce((s, e) => s + e, 0);
  const lowFreqEnergy = detailEnergies.slice(halfIdx).reduce((s, e) => s + e, 0);
  const highFreqDominance = totalDetailEnergy > 0 ? r4(highFreqEnergy / totalDetailEnergy) : 0;
  const lowFreqDominance = totalDetailEnergy > 0 ? r4(lowFreqEnergy / totalDetailEnergy) : 0;

  let crossScaleCorr = 0;
  if (details.length >= 2) {
    let corrCount = 0;
    for (let i = 0; i < details.length - 1; i++) {
      const d1 = details[i];
      const d2 = details[i + 1];
      const minLen = Math.min(d1.length, d2.length);
      if (minLen < 2) continue;
      const m1 = d1.slice(0, minLen).reduce((s, c) => s + c, 0) / minLen;
      const m2 = d2.slice(0, minLen).reduce((s, c) => s + c, 0) / minLen;
      let num = 0, den1 = 0, den2 = 0;
      for (let j = 0; j < minLen; j++) {
        num += (d1[j] - m1) * (d2[j] - m2);
        den1 += (d1[j] - m1) ** 2;
        den2 += (d2[j] - m2) ** 2;
      }
      const denom = Math.sqrt(den1 * den2);
      if (denom > 0) {
        crossScaleCorr += Math.abs(num / denom);
        corrCount++;
      }
    }
    crossScaleCorr = corrCount > 0 ? crossScaleCorr / corrCount : 0;
  }

  const allDetailCoeffs = details.flat();
  const detailMean = allDetailCoeffs.length > 0
    ? allDetailCoeffs.reduce((s, c) => s + c, 0) / allDetailCoeffs.length
    : 0;
  const detailVariance = allDetailCoeffs.length > 0
    ? allDetailCoeffs.reduce((s, c) => s + (c - detailMean) ** 2, 0) / allDetailCoeffs.length
    : 0;
  const detailStd = Math.sqrt(detailVariance);

  const waveletKurtosis = detailStd > 0
    ? allDetailCoeffs.reduce((s, c) => s + ((c - detailMean) / detailStd) ** 4, 0) / allDetailCoeffs.length
    : 3;

  const waveletSkewness = detailStd > 0
    ? allDetailCoeffs.reduce((s, c) => s + ((c - detailMean) / detailStd) ** 3, 0) / allDetailCoeffs.length
    : 0;

  let persistenceCount = 0;
  let persistenceTotal = 0;
  for (let i = 0; i < details.length - 1; i++) {
    const d1 = details[i];
    const d2 = details[i + 1];
    const minLen = Math.min(d1.length, d2.length);
    for (let j = 0; j < minLen; j++) {
      if (Math.sign(d1[j]) === Math.sign(d2[j]) && d1[j] !== 0 && d2[j] !== 0) {
        persistenceCount++;
      }
      persistenceTotal++;
    }
  }
  const persistenceIndex = persistenceTotal > 0 ? r4(persistenceCount / persistenceTotal) : 0;

  const entropyScore = Math.min(20, waveletEntropy * 20);
  const complexityScore = Math.min(20, multiResolutionComplexity * 5);
  const flatnessScore = Math.min(20, spectralFlatness * 20);
  const correlationScore = Math.min(20, crossScaleCorrelation * 20);
  const kurtosisScore = Math.min(20, Math.max(0, (waveletKurtosis - 3)) * 4);
  const waveletIndex = Math.round(
    Math.min(100, entropyScore + complexityScore + flatnessScore + correlationScore + kurtosisScore)
  );

  let structureClass: string;
  if (waveletIndex >= 80) structureClass = "FRACTAL";
  else if (waveletIndex >= 60) structureClass = "MULTISCALE";
  else if (waveletIndex >= 40) structureClass = "STRUCTURED";
  else if (waveletIndex >= 20) structureClass = "SMOOTH";
  else structureClass = "FLAT";

  let scaleRegime: string;
  if (highFreqDominance > 0.7) scaleRegime = "NOISY";
  else if (lowFreqDominance > 0.7) scaleRegime = "TRENDING";
  else if (spectralFlatness > 0.7) scaleRegime = "BROADBAND";
  else if (energyConcentration > 0.6) scaleRegime = "NARROWBAND";
  else scaleRegime = "MIXED";

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsAnalyzed: n,
    totalUsd: r2(totalUsd),
    decompositionLevels: details.length,
    totalEnergy: r2(totalEnergy),
    approximationEnergy: r2(approxEnergy),
    detailEnergy: r2(totalDetailEnergy),
    approximationFraction: r4(approxFraction),
    detailFraction: r4(totalDetailEnergy / (totalEnergy || 1)),
    waveletEntropy: r3(waveletEntropy),
    dominantScale,
    dominantScaleLevel,
    energyConcentration: r4(energyConcentration),
    spectralFlatness: r4(spectralFlatness),
    spectralCentroid: r4(spectralCentroid),
    spectralRolloff,
    multiResolutionComplexity,
    denoiseResidualEnergy: r2(denoiseResidualEnergy),
    denoiseSnr,
    trendStrength,
    noiseRatio,
    scaleTransitionSharpness,
    highFreqDominance,
    lowFreqDominance,
    crossScaleCorrelation: r4(crossScaleCorr),
    waveletKurtosis: r4(waveletKurtosis),
    waveletSkewness: r4(waveletSkewness),
    persistenceIndex,
    waveletIndex,
    structureClass,
    scaleRegime,
    levels,
    tvlUsd: pool.tvlUsd,
  };
}

function emptyProfile(pool: AppPool, activeBin: number, n: number, totalUsd: number): WaveletProfile {
  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsAnalyzed: n,
    totalUsd: r2(totalUsd),
    decompositionLevels: 0, totalEnergy: 0, approximationEnergy: 0, detailEnergy: 0,
    approximationFraction: 1, detailFraction: 0, waveletEntropy: 0,
    dominantScale: 0, dominantScaleLevel: 0, energyConcentration: 1,
    spectralFlatness: 0, spectralCentroid: 0, spectralRolloff: 0,
    multiResolutionComplexity: 0, denoiseResidualEnergy: 0, denoiseSnr: 99,
    trendStrength: 1, noiseRatio: 0, scaleTransitionSharpness: 0,
    highFreqDominance: 0, lowFreqDominance: 0, crossScaleCorrelation: 0,
    waveletKurtosis: 3, waveletSkewness: 0, persistenceIndex: 0,
    waveletIndex: 0, structureClass: "FLAT", scaleRegime: "TRENDING",
    levels: [], tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r3(v: number): number { return Math.round(v * 1000) / 1000; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Wavelet — Doctor ===\n");
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

  const profiles: WaveletProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeWavelet(bins, pool));
    } catch {
      continue;
    }
  }

  const summary = {
    poolsAnalyzed: profiles.length,
    avgWaveletIndex: profiles.length > 0
      ? r2(profiles.reduce((s, p) => s + p.waveletIndex, 0) / profiles.length)
      : 0,
    flatCount: profiles.filter((p) => p.structureClass === "FLAT").length,
    smoothCount: profiles.filter((p) => p.structureClass === "SMOOTH").length,
    structuredCount: profiles.filter((p) => p.structureClass === "STRUCTURED").length,
    multiscaleCount: profiles.filter((p) => p.structureClass === "MULTISCALE").length,
    fractalCount: profiles.filter((p) => p.structureClass === "FRACTAL").length,
    avgWaveletEntropy: profiles.length > 0
      ? r3(profiles.reduce((s, p) => s + p.waveletEntropy, 0) / profiles.length)
      : 0,
    avgSpectralFlatness: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.spectralFlatness, 0) / profiles.length)
      : 0,
    avgDenoiseSnr: profiles.length > 0
      ? r2(profiles.reduce((s, p) => s + p.denoiseSnr, 0) / profiles.length)
      : 0,
    avgTrendStrength: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.trendStrength, 0) / profiles.length)
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-wavelet").description("HODLMM bin wavelet decomposition analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze wavelet decomposition")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
