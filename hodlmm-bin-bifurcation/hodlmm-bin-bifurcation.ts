#!/usr/bin/env bun
/**
 * hodlmm-bin-bifurcation.ts — Day 119 cocoa007 Bitflow Skills Comp
 *
 * Bin bifurcation analyzer — critical threshold detection where pool behavior
 * undergoes qualitative regime changes using dynamical systems theory.
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

interface BifurcationProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsAnalyzed: number;
  bifurcationIndex: number;
  bifurcationClass: string;
  saddleNodeCount: number;
  saddleNodeNearestOffset: number;
  saddleNodeCriticalReserve: number;
  pitchforkStrength: number;
  pitchforkType: string;
  pitchforkCriticalRatio: number;
  hopfAmplitude: number;
  hopfPeriod: number;
  hopfClass: string;
  criticalSlowingVariance: number;
  criticalSlowingAutocorr: number;
  criticalSlowingSignal: string;
  basinRadius: number;
  basinClass: string;
  bifurcationParameter: string;
  parameterDistance: number;
  catastropheType: string;
  catastropheFolds: number;
  hysteresisIndex: number;
  hysteresisClass: string;
  codimension: number;
  codimensionClass: string;
  tvlUsd: number;
  volume24hUsd: number;
}

async function fetchPools(): Promise<AppPool[]> {
  const res = await fetch(`${BFF_APP_BASE}/pools`);
  if (!res.ok) throw new Error(`BFF pools API: ${res.status}`);
  const body = (await res.json()) as any;
  const pools: AppPool[] = body.data?.pools ?? body.pools ?? body ?? [];
  return pools.filter((p: AppPool) => (p.tvlUsd ?? 0) >= MIN_TVL_USD && p.poolId != null);
}

async function fetchActiveBin(poolId: number): Promise<number> {
  const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-active-bin`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: SENDER,
      arguments: [`0x0100000000000000000000000000000${poolId.toString(16).padStart(3, "0")}`],
    }),
  });
  if (!res.ok) throw new Error(`Active bin fetch failed: ${res.status}`);
  const data = (await res.json()) as any;
  if (!data.okay || !data.result) throw new Error("Active bin read failed");
  const hex = data.result.replace("0x", "");
  if (hex.startsWith("09")) {
    const tupleHex = hex.slice(2);
    let offset = 0;
    const numEntries = parseInt(tupleHex.slice(offset, offset + 2), 16);
    offset += 2;
    for (let i = 0; i < numEntries; i++) {
      const nameLen = parseInt(tupleHex.slice(offset, offset + 2), 16);
      offset += 2;
      const nameBytes = tupleHex.slice(offset, offset + nameLen * 2);
      offset += nameLen * 2;
      const name = Buffer.from(nameBytes, "hex").toString("ascii");
      if (name === "active-bin-id" || name === "bin-id") {
        const typePrefix = tupleHex.slice(offset, offset + 2);
        offset += 2;
        if (typePrefix === "01") {
          return parseInt(tupleHex.slice(offset, offset + 32), 16);
        }
      } else {
        const typePrefix = tupleHex.slice(offset, offset + 2);
        offset += 2;
        if (typePrefix === "01" || typePrefix === "00") offset += 32;
        else if (typePrefix === "0a") offset += 32;
        else break;
      }
    }
  }
  const match = hex.match(/01([0-9a-f]{32})/);
  if (match) return parseInt(match[1], 16);
  throw new Error("Cannot parse active bin");
}

async function fetchBinReserves(
  poolId: number,
  activeBin: number,
  pool: AppPool
): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const start = activeBin - BIN_SCAN_RADIUS;
  const end = activeBin + BIN_SCAN_RADIUS;
  const batchSize = 5;
  for (let i = start; i <= end; i += batchSize) {
    const batch = [];
    for (let j = i; j < Math.min(i + batchSize, end + 1); j++) {
      batch.push(j);
    }
    const results = await Promise.all(
      batch.map(async (binId) => {
        try {
          const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-bin-reserves`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sender: SENDER,
              arguments: [
                `0x0100000000000000000000000000000${poolId.toString(16).padStart(3, "0")}`,
                `0x01000000000000000000000000${binId.toString(16).padStart(8, "0")}`,
              ],
            }),
          });
          if (!res.ok) return null;
          const data = (await res.json()) as any;
          if (!data.okay || !data.result) return null;
          const hex = data.result.replace("0x", "");
          let reserveX = 0,
            reserveY = 0;
          if (hex.startsWith("09")) {
            const tupleHex = hex.slice(2);
            let offset = 0;
            const numEntries = parseInt(tupleHex.slice(offset, offset + 2), 16);
            offset += 2;
            for (let e = 0; e < numEntries; e++) {
              const nameLen = parseInt(tupleHex.slice(offset, offset + 2), 16);
              offset += 2;
              const nameRaw = tupleHex.slice(offset, offset + nameLen * 2);
              offset += nameLen * 2;
              const nm = Buffer.from(nameRaw, "hex").toString("ascii");
              const typePrefix = tupleHex.slice(offset, offset + 2);
              offset += 2;
              const val = parseInt(tupleHex.slice(offset, offset + 32), 16);
              offset += 32;
              if (nm === "reserve-x") reserveX = val;
              else if (nm === "reserve-y") reserveY = val;
            }
          } else {
            const uints = hex.match(/01([0-9a-f]{32})/g) ?? [];
            if (uints.length >= 2) {
              reserveX = parseInt(uints[0].slice(2), 16);
              reserveY = parseInt(uints[1].slice(2), 16);
            }
          }
          const decX = pool.token0Decimals || 8;
          const decY = pool.token1Decimals || 6;
          const rX = reserveX / 10 ** decX;
          const rY = reserveY / 10 ** decY;
          const rXUsd = rX * (pool.token0PriceUsd || 0);
          const rYUsd = rY * (pool.token1PriceUsd || 0);
          return {
            binId,
            reserveX: rX,
            reserveY: rY,
            reserveXUsd: rXUsd,
            reserveYUsd: rYUsd,
            totalUsd: rXUsd + rYUsd,
          } as BinReserves;
        } catch {
          return null;
        }
      })
    );
    for (const r of results) {
      if (r && (r.reserveX > 0 || r.reserveY > 0)) bins.push(r);
    }
  }
  return bins;
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function detectSaddleNodes(
  bins: BinReserves[],
  activeBin: number
): { count: number; nearestOffset: number; criticalReserve: number } {
  let count = 0;
  let nearestOffset = 999;
  let criticalReserve = 0;

  const avgReserve = bins.reduce((s, b) => s + b.totalUsd, 0) / (bins.length || 1);
  const threshold = avgReserve * 0.05;

  for (let i = 1; i < bins.length; i++) {
    const prev = bins[i - 1];
    const curr = bins[i];
    const prevAbove = prev.totalUsd > threshold;
    const currAbove = curr.totalUsd > threshold;

    if (prevAbove !== currAbove) {
      count++;
      const offset = Math.abs(curr.binId - activeBin);
      if (offset < Math.abs(nearestOffset)) {
        nearestOffset = curr.binId - activeBin;
        criticalReserve = Math.min(prev.totalUsd, curr.totalUsd);
      }
    }
  }

  return {
    count,
    nearestOffset: count > 0 ? nearestOffset : 0,
    criticalReserve: round(criticalReserve),
  };
}

function detectPitchfork(
  bins: BinReserves[],
  activeBin: number
): { strength: number; type: string; criticalRatio: number } {
  const leftBins = bins.filter((b) => b.binId < activeBin);
  const rightBins = bins.filter((b) => b.binId > activeBin);

  if (leftBins.length === 0 || rightBins.length === 0) {
    return { strength: 0, type: "none", criticalRatio: 1 };
  }

  const leftXTotal = leftBins.reduce((s, b) => s + b.reserveXUsd, 0);
  const leftYTotal = leftBins.reduce((s, b) => s + b.reserveYUsd, 0);
  const rightXTotal = rightBins.reduce((s, b) => s + b.reserveXUsd, 0);
  const rightYTotal = rightBins.reduce((s, b) => s + b.reserveYUsd, 0);

  const leftRatio = leftYTotal > 0 ? leftXTotal / leftYTotal : 999;
  const rightRatio = rightYTotal > 0 ? rightXTotal / rightYTotal : 999;

  const asymmetry = Math.abs(leftRatio - rightRatio) / (Math.max(leftRatio, rightRatio) || 1);

  let divergenceRate = 0;
  const halfLen = Math.min(leftBins.length, rightBins.length);
  for (let i = 0; i < halfLen; i++) {
    const lBin = leftBins[leftBins.length - 1 - i];
    const rBin = rightBins[i];
    const lRatio = lBin.reserveYUsd > 0 ? lBin.reserveXUsd / lBin.reserveYUsd : 0;
    const rRatio = rBin.reserveYUsd > 0 ? rBin.reserveXUsd / rBin.reserveYUsd : 0;
    divergenceRate += Math.abs(lRatio - rRatio);
  }
  divergenceRate /= halfLen || 1;

  const strength = round(asymmetry * 100);

  let type: string;
  if (asymmetry < 0.1) type = "symmetric";
  else if (divergenceRate > asymmetry * 2) type = "subcritical";
  else type = "supercritical";

  const criticalRatio = round(
    (leftRatio + rightRatio) / 2
  );

  return { strength, type, criticalRatio };
}

function detectHopf(
  bins: BinReserves[]
): { amplitude: number; period: number; hopfClass: string } {
  if (bins.length < 6) return { amplitude: 0, period: 0, hopfClass: "stable" };

  const gradients: number[] = [];
  for (let i = 1; i < bins.length; i++) {
    gradients.push(bins[i].totalUsd - bins[i - 1].totalUsd);
  }

  let zeroCrossings = 0;
  for (let i = 1; i < gradients.length; i++) {
    if ((gradients[i] > 0 && gradients[i - 1] < 0) || (gradients[i] < 0 && gradients[i - 1] > 0)) {
      zeroCrossings++;
    }
  }

  const period = zeroCrossings > 0 ? (bins.length / zeroCrossings) * 2 : 0;

  const avgReserve = bins.reduce((s, b) => s + b.totalUsd, 0) / bins.length;
  let peakSum = 0;
  let peakCount = 0;
  for (let i = 1; i < bins.length - 1; i++) {
    if (
      (bins[i].totalUsd > bins[i - 1].totalUsd && bins[i].totalUsd > bins[i + 1].totalUsd) ||
      (bins[i].totalUsd < bins[i - 1].totalUsd && bins[i].totalUsd < bins[i + 1].totalUsd)
    ) {
      peakSum += Math.abs(bins[i].totalUsd - avgReserve);
      peakCount++;
    }
  }
  const amplitude = avgReserve > 0 ? (peakSum / (peakCount || 1)) / avgReserve : 0;

  let amplitudeGrowth = 0;
  if (peakCount >= 4) {
    const peaks: number[] = [];
    for (let i = 1; i < bins.length - 1; i++) {
      if (bins[i].totalUsd > bins[i - 1].totalUsd && bins[i].totalUsd > bins[i + 1].totalUsd) {
        peaks.push(bins[i].totalUsd);
      }
    }
    if (peaks.length >= 2) {
      const firstHalf = peaks.slice(0, Math.floor(peaks.length / 2));
      const secondHalf = peaks.slice(Math.floor(peaks.length / 2));
      const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
      amplitudeGrowth = avgFirst > 0 ? (avgSecond - avgFirst) / avgFirst : 0;
    }
  }

  let hopfClass: string;
  if (zeroCrossings < 2) hopfClass = "stable";
  else if (amplitudeGrowth > 0.1) hopfClass = "supercritical";
  else if (amplitudeGrowth < -0.1) hopfClass = "subcritical";
  else if (zeroCrossings >= 4) hopfClass = "limit-cycle";
  else hopfClass = "damped";

  return {
    amplitude: round(amplitude),
    period: round(period),
    hopfClass,
  };
}

function computeCriticalSlowing(
  bins: BinReserves[]
): { variance: number; autocorr: number; signal: string } {
  if (bins.length < 5) return { variance: 0, autocorr: 0, signal: "insufficient-data" };

  const reserves = bins.map((b) => b.totalUsd);
  const mean = reserves.reduce((s, v) => s + v, 0) / reserves.length;

  const variance = reserves.reduce((s, v) => s + (v - mean) ** 2, 0) / reserves.length;
  const normalizedVar = mean > 0 ? variance / (mean * mean) : 0;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < reserves.length - 1; i++) {
    numerator += (reserves[i] - mean) * (reserves[i + 1] - mean);
    denominator += (reserves[i] - mean) ** 2;
  }
  const autocorr = denominator > 0 ? numerator / denominator : 0;

  const halfPoint = Math.floor(bins.length / 2);
  const firstHalf = reserves.slice(0, halfPoint);
  const secondHalf = reserves.slice(halfPoint);
  const varFirst =
    firstHalf.reduce((s, v) => s + (v - mean) ** 2, 0) / firstHalf.length;
  const varSecond =
    secondHalf.reduce((s, v) => s + (v - mean) ** 2, 0) / secondHalf.length;
  const varianceGrowth = varFirst > 0 ? (varSecond - varFirst) / varFirst : 0;

  let signal: string;
  if (autocorr > 0.8 && normalizedVar > 0.5) signal = "critical";
  else if (autocorr > 0.6 && normalizedVar > 0.3) signal = "approaching";
  else if (autocorr > 0.4 || varianceGrowth > 0.5) signal = "early-warning";
  else signal = "stable";

  return {
    variance: round(normalizedVar),
    autocorr: round(autocorr),
    signal,
  };
}

function computeBasinOfAttraction(
  bins: BinReserves[],
  activeBin: number
): { radius: number; basinClass: string } {
  const activeBinData = bins.find((b) => b.binId === activeBin);
  if (!activeBinData) return { radius: 0, basinClass: "undefined" };

  const avgReserve = bins.reduce((s, b) => s + b.totalUsd, 0) / bins.length;
  const threshold = avgReserve * 0.1;

  let leftRadius = 0;
  let rightRadius = 0;

  for (let i = bins.length - 1; i >= 0; i--) {
    if (bins[i].binId < activeBin && bins[i].totalUsd < threshold) {
      leftRadius = activeBin - bins[i].binId;
      break;
    }
  }
  if (leftRadius === 0) {
    const leftmost = bins.find((b) => b.binId < activeBin);
    leftRadius = leftmost ? activeBin - leftmost.binId : BIN_SCAN_RADIUS;
  }

  for (const b of bins) {
    if (b.binId > activeBin && b.totalUsd < threshold) {
      rightRadius = b.binId - activeBin;
      break;
    }
  }
  if (rightRadius === 0) {
    const rightBins = bins.filter((b) => b.binId > activeBin);
    const rightmost = rightBins[rightBins.length - 1];
    rightRadius = rightmost ? rightmost.binId - activeBin : BIN_SCAN_RADIUS;
  }

  const radius = Math.min(leftRadius, rightRadius);

  let basinClass: string;
  if (radius >= 20) basinClass = "deep";
  else if (radius >= 10) basinClass = "moderate";
  else if (radius >= 5) basinClass = "shallow";
  else basinClass = "critical";

  return { radius, basinClass };
}

function identifyBifurcationParameter(
  bins: BinReserves[],
  activeBin: number
): { parameter: string; distance: number } {
  const totalX = bins.reduce((s, b) => s + b.reserveXUsd, 0);
  const totalY = bins.reduce((s, b) => s + b.reserveYUsd, 0);
  const concentrationRatio = (totalX + totalY) > 0 ? totalX / (totalX + totalY) : 0.5;

  const activeBinData = bins.find((b) => b.binId === activeBin);
  const activeFraction = activeBinData
    ? activeBinData.totalUsd / (bins.reduce((s, b) => s + b.totalUsd, 0) || 1)
    : 0;

  const concDistance = Math.abs(concentrationRatio - 0.5) / 0.5;
  const fragDistance = 1 - activeFraction * bins.length;

  let parameter: string;
  let distance: number;

  if (concDistance > fragDistance) {
    parameter = "reserve-asymmetry";
    distance = round(1 - concDistance);
  } else {
    parameter = "concentration-ratio";
    distance = round(Math.max(0, fragDistance));
  }

  return { parameter, distance };
}

function classifyCatastrophe(
  bins: BinReserves[]
): { type: string; folds: number } {
  const reserves = bins.map((b) => b.totalUsd);
  const mean = reserves.reduce((s, v) => s + v, 0) / reserves.length;

  let inflections = 0;
  for (let i = 2; i < reserves.length; i++) {
    const d2Prev = reserves[i - 1] - reserves[i - 2];
    const d2Curr = reserves[i] - reserves[i - 1];
    const curvPrev = d2Curr - d2Prev;
    if (i >= 3) {
      const d2PrevPrev = reserves[i - 2] - reserves[i - 3];
      const curvPrevPrev = d2Prev - d2PrevPrev;
      if ((curvPrev > 0 && curvPrevPrev < 0) || (curvPrev < 0 && curvPrevPrev > 0)) {
        inflections++;
      }
    }
  }

  let type: string;
  if (inflections <= 1) type = "fold";
  else if (inflections <= 3) type = "cusp";
  else if (inflections <= 6) type = "swallowtail";
  else type = "butterfly";

  return { type, folds: inflections };
}

function computeHysteresis(
  bins: BinReserves[],
  activeBin: number
): { index: number; hysteresisClass: string } {
  const leftBins = bins.filter((b) => b.binId <= activeBin).sort((a, b) => a.binId - b.binId);
  const rightBins = bins.filter((b) => b.binId >= activeBin).sort((a, b) => a.binId - b.binId);

  let forwardGap = 0;
  let reverseGap = 0;

  for (let i = 1; i < rightBins.length; i++) {
    const drop = rightBins[i - 1].totalUsd - rightBins[i].totalUsd;
    if (drop > 0) forwardGap += drop;
  }

  for (let i = leftBins.length - 2; i >= 0; i--) {
    const drop = leftBins[i + 1].totalUsd - leftBins[i].totalUsd;
    if (drop > 0) reverseGap += drop;
  }

  const totalReserve = bins.reduce((s, b) => s + b.totalUsd, 0) || 1;
  const index = round(Math.abs(forwardGap - reverseGap) / totalReserve * 100);

  let hysteresisClass: string;
  if (index < 5) hysteresisClass = "reversible";
  else if (index < 20) hysteresisClass = "mild";
  else if (index < 50) hysteresisClass = "significant";
  else hysteresisClass = "irreversible";

  return { index, hysteresisClass };
}

function computeCodimension(
  saddleNodes: number,
  pitchforkStrength: number,
  hopfClass: string,
  criticalSignal: string
): { codimension: number; codimClass: string } {
  let dim = 0;

  if (saddleNodes > 0) dim++;
  if (pitchforkStrength > 20) dim++;
  if (hopfClass !== "stable" && hopfClass !== "damped") dim++;
  if (criticalSignal === "critical" || criticalSignal === "approaching") dim++;

  let codimClass: string;
  if (dim === 0) codimClass = "robust";
  else if (dim === 1) codimClass = "single-parameter";
  else if (dim === 2) codimClass = "two-parameter";
  else codimClass = "multi-parameter";

  return { codimension: dim, codimClass };
}

function computeBifurcationIndex(
  saddleCount: number,
  pitchforkStrength: number,
  hopfClass: string,
  criticalSignal: string,
  basinRadius: number,
  hysteresisIndex: number,
  paramDistance: number
): number {
  let score = 0;

  const saddleScore = Math.min(saddleCount * 8, 20);
  score += saddleScore;

  const pitchScore = Math.min(pitchforkStrength / 5, 20);
  score += pitchScore;

  let hopfScore = 0;
  if (hopfClass === "supercritical") hopfScore = 20;
  else if (hopfClass === "limit-cycle") hopfScore = 15;
  else if (hopfClass === "subcritical") hopfScore = 10;
  else if (hopfClass === "damped") hopfScore = 5;
  score += hopfScore;

  let csScore = 0;
  if (criticalSignal === "critical") csScore = 20;
  else if (criticalSignal === "approaching") csScore = 15;
  else if (criticalSignal === "early-warning") csScore = 8;
  score += csScore;

  const basinScore = basinRadius <= 3 ? 20 : basinRadius <= 7 ? 12 : basinRadius <= 15 ? 5 : 0;
  score += basinScore;

  return Math.min(100, Math.max(0, Math.round(score)));
}

function classifyBifurcation(index: number): string {
  if (index >= 80) return "critical";
  if (index >= 60) return "approaching";
  if (index >= 40) return "pre-bifurcation";
  if (index >= 20) return "distant";
  return "stable";
}

function analyzeBifurcation(bins: BinReserves[], activeBin: number, pool: AppPool): BifurcationProfile {
  const saddle = detectSaddleNodes(bins, activeBin);
  const pitchfork = detectPitchfork(bins, activeBin);
  const hopf = detectHopf(bins);
  const cs = computeCriticalSlowing(bins);
  const basin = computeBasinOfAttraction(bins, activeBin);
  const param = identifyBifurcationParameter(bins, activeBin);
  const catastrophe = classifyCatastrophe(bins);
  const hyst = computeHysteresis(bins, activeBin);
  const codim = computeCodimension(saddle.count, pitchfork.strength, hopf.hopfClass, cs.signal);

  const bifIdx = computeBifurcationIndex(
    saddle.count,
    pitchfork.strength,
    hopf.hopfClass,
    cs.signal,
    basin.radius,
    hyst.index,
    param.distance
  );

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId!,
    activeBin,
    binsAnalyzed: bins.length,
    bifurcationIndex: bifIdx,
    bifurcationClass: classifyBifurcation(bifIdx),
    saddleNodeCount: saddle.count,
    saddleNodeNearestOffset: saddle.nearestOffset,
    saddleNodeCriticalReserve: saddle.criticalReserve,
    pitchforkStrength: pitchfork.strength,
    pitchforkType: pitchfork.type,
    pitchforkCriticalRatio: pitchfork.criticalRatio,
    hopfAmplitude: hopf.amplitude,
    hopfPeriod: hopf.period,
    hopfClass: hopf.hopfClass,
    criticalSlowingVariance: cs.variance,
    criticalSlowingAutocorr: cs.autocorr,
    criticalSlowingSignal: cs.signal,
    basinRadius: basin.radius,
    basinClass: basin.basinClass,
    bifurcationParameter: param.parameter,
    parameterDistance: param.distance,
    catastropheType: catastrophe.type,
    catastropheFolds: catastrophe.folds,
    hysteresisIndex: hyst.index,
    hysteresisClass: hyst.hysteresisClass,
    codimension: codim.codimension,
    codimensionClass: codim.codimClass,
    tvlUsd: round(pool.tvlUsd),
    volume24hUsd: round(pool.volume24hUsd),
  };
}

function renderBifurcationMap(profile: BifurcationProfile, bins: BinReserves[]): string {
  const lines: string[] = [];

  lines.push(`\n=== BIFURCATION MAP: ${profile.pair} (pool ${profile.poolId}) ===`);
  lines.push(`Bifurcation Index: ${profile.bifurcationIndex}/100 (${profile.bifurcationClass})`);
  lines.push(`Saddle-Node: ${profile.saddleNodeCount} boundaries (nearest offset ${profile.saddleNodeNearestOffset}, critical $${profile.saddleNodeCriticalReserve})`);
  lines.push(`Pitchfork: strength ${profile.pitchforkStrength} (${profile.pitchforkType}, critical ratio ${profile.pitchforkCriticalRatio})`);
  lines.push(`Hopf: amplitude ${profile.hopfAmplitude}, period ${profile.hopfPeriod} bins (${profile.hopfClass})`);
  lines.push(`Critical Slowing: variance ${profile.criticalSlowingVariance}, autocorr ${profile.criticalSlowingAutocorr} (${profile.criticalSlowingSignal})`);
  lines.push(`Basin of Attraction: radius ${profile.basinRadius} bins (${profile.basinClass})`);
  lines.push(`Control Parameter: ${profile.bifurcationParameter} (distance to critical: ${profile.parameterDistance})`);
  lines.push(`Catastrophe: ${profile.catastropheType} (${profile.catastropheFolds} folds)`);
  lines.push(`Hysteresis: ${profile.hysteresisIndex}% (${profile.hysteresisClass})`);
  lines.push(`Codimension: ${profile.codimension} (${profile.codimensionClass})`);
  lines.push("");

  if (bins.length > 0) {
    const maxReserve = Math.max(...bins.map((b) => b.totalUsd)) || 1;
    const avgReserve = bins.reduce((s, b) => s + b.totalUsd, 0) / bins.length;
    const threshold = avgReserve * 0.05;
    const width = 40;

    lines.push("Stability Landscape (reserve profile with bifurcation boundaries):");
    const step = Math.max(1, Math.floor(bins.length / 25));
    for (let i = 0; i < bins.length; i += step) {
      const b = bins[i];
      const offset = b.binId - profile.activeBin;
      const barLen = Math.round((b.totalUsd / maxReserve) * width);

      let marker = "   ";
      if (offset === 0) marker = " * ";
      else if (b.totalUsd < threshold && i > 0 && bins[i - 1].totalUsd >= threshold) marker = ">>>";
      else if (b.totalUsd >= threshold && i > 0 && bins[i - 1].totalUsd < threshold) marker = "<<<";

      const region =
        Math.abs(offset) <= profile.basinRadius ? "=" : b.totalUsd < threshold ? "." : "-";

      lines.push(
        `${marker} ${String(offset).padStart(4)} | ${"█".repeat(barLen)}${"░".repeat(width - barLen)} ${region}`
      );
    }
    lines.push("  Legend: * active bin, >>> saddle-node (collapse), <<< saddle-node (emerge)");
    lines.push("          = basin of attraction, - exterior, . depleted zone");
    lines.push("");

    lines.push("Symmetry Breaking Diagram (X vs Y reserve asymmetry):");
    const leftBins = bins.filter((b) => b.binId < profile.activeBin);
    const rightBins = bins.filter((b) => b.binId > profile.activeBin);
    const leftX = leftBins.reduce((s, b) => s + b.reserveXUsd, 0);
    const leftY = leftBins.reduce((s, b) => s + b.reserveYUsd, 0);
    const rightX = rightBins.reduce((s, b) => s + b.reserveXUsd, 0);
    const rightY = rightBins.reduce((s, b) => s + b.reserveYUsd, 0);
    const maxSide = Math.max(leftX, leftY, rightX, rightY) || 1;
    const lxBar = Math.round((leftX / maxSide) * 20);
    const lyBar = Math.round((leftY / maxSide) * 20);
    const rxBar = Math.round((rightX / maxSide) * 20);
    const ryBar = Math.round((rightY / maxSide) * 20);

    lines.push(`  Left X  ${"█".repeat(lxBar)}${"░".repeat(20 - lxBar)} $${leftX.toFixed(0)}`);
    lines.push(`  Left Y  ${"█".repeat(lyBar)}${"░".repeat(20 - lyBar)} $${leftY.toFixed(0)}`);
    const pfArrow =
      profile.pitchforkType === "supercritical"
        ? "  >>> DIVERGING >>>"
        : profile.pitchforkType === "subcritical"
        ? "  <<< CONVERGING <<<"
        : "  === SYMMETRIC ===";
    lines.push(pfArrow);
    lines.push(`  Right X ${"█".repeat(rxBar)}${"░".repeat(20 - rxBar)} $${rightX.toFixed(0)}`);
    lines.push(`  Right Y ${"█".repeat(ryBar)}${"░".repeat(20 - ryBar)} $${rightY.toFixed(0)}`);
    lines.push("");
  }

  return lines.join("\n");
}

async function analyzePool(
  pool: AppPool
): Promise<{ profile: BifurcationProfile; bins: BinReserves[] } | null> {
  try {
    const activeBin = pool.activeBinId ?? (await fetchActiveBin(pool.poolId!));
    const bins = await fetchBinReserves(pool.poolId!, activeBin, pool);
    if (bins.length < MIN_POPULATED_BINS) return null;
    const profile = analyzeBifurcation(bins, activeBin, pool);
    return { profile, bins };
  } catch {
    return null;
  }
}

const program = new Command();

program
  .name("hodlmm-bin-bifurcation")
  .description("HODLMM bin bifurcation analyzer — critical threshold detection and regime change proximity");

program
  .command("doctor")
  .description("Validate API connectivity")
  .action(async () => {
    try {
      const [bffRes, hiroRes] = await Promise.all([
        fetch(`${BFF_APP_BASE}/pools`).then((r) => ({ ok: r.ok, status: r.status })),
        fetch(`${HIRO_API}/v2/info`).then((r) => ({ ok: r.ok, status: r.status })),
      ]);
      console.log(
        JSON.stringify({
          result: "doctor",
          data: {
            bff: { ok: bffRes.ok, status: bffRes.status },
            hiro: { ok: hiroRes.ok, status: hiroRes.status },
            allHealthy: bffRes.ok && hiroRes.ok,
            analyses: ["run", "status"],
          },
        })
      );
    } catch (e: any) {
      console.log(JSON.stringify({ error: e.message }));
    }
  });

program
  .command("run")
  .description("Full bifurcation analysis")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "3")
  .action(async (opts) => {
    try {
      const pools = await fetchPools();
      let selected: AppPool[];
      if (opts.pool) {
        selected = pools.filter((p) => p.poolId === parseInt(opts.pool));
        if (selected.length === 0) {
          console.log(JSON.stringify({ error: `Pool ${opts.pool} not found` }));
          return;
        }
      } else {
        selected = pools.sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, parseInt(opts.top));
      }

      const results: BifurcationProfile[] = [];
      let outputText = "";

      for (const pool of selected) {
        const result = await analyzePool(pool);
        if (result) {
          results.push(result.profile);
          outputText += renderBifurcationMap(result.profile, result.bins);
        }
      }

      const avgIndex =
        results.length > 0 ? results.reduce((s, r) => s + r.bifurcationIndex, 0) / results.length : 0;

      console.log(
        JSON.stringify({
          result: "bifurcation_analysis",
          data: {
            pools: results,
            summary: {
              poolsAnalyzed: results.length,
              avgBifurcationIndex: Math.round(avgIndex),
              critical: results.filter((r) => r.bifurcationIndex >= 80).length,
              approaching: results.filter((r) => r.bifurcationIndex >= 60).length,
              preBifurcation: results.filter((r) => r.bifurcationIndex >= 40).length,
              stable: results.filter((r) => r.bifurcationIndex < 20).length,
              avgBasinRadius: round(
                results.reduce((s, r) => s + r.basinRadius, 0) / (results.length || 1)
              ),
              avgHysteresis: round(
                results.reduce((s, r) => s + r.hysteresisIndex, 0) / (results.length || 1)
              ),
              catastropheDistribution: {
                fold: results.filter((r) => r.catastropheType === "fold").length,
                cusp: results.filter((r) => r.catastropheType === "cusp").length,
                swallowtail: results.filter((r) => r.catastropheType === "swallowtail").length,
                butterfly: results.filter((r) => r.catastropheType === "butterfly").length,
              },
              criticalSlowingDistribution: {
                critical: results.filter((r) => r.criticalSlowingSignal === "critical").length,
                approaching: results.filter((r) => r.criticalSlowingSignal === "approaching").length,
                earlyWarning: results.filter((r) => r.criticalSlowingSignal === "early-warning").length,
                stable: results.filter((r) => r.criticalSlowingSignal === "stable").length,
              },
            },
          },
        })
      );

      if (outputText) console.error(outputText);
    } catch (e: any) {
      console.log(JSON.stringify({ error: e.message }));
    }
  });

program
  .command("status")
  .description("Quick bifurcation summary for top pools")
  .action(async () => {
    try {
      const pools = await fetchPools();
      const top = pools.sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, 5);
      const results: any[] = [];

      for (const pool of top) {
        const result = await analyzePool(pool);
        if (result) {
          results.push({
            pair: result.profile.pair,
            poolId: result.profile.poolId,
            bifurcationIndex: result.profile.bifurcationIndex,
            bifurcationClass: result.profile.bifurcationClass,
            saddleNodeCount: result.profile.saddleNodeCount,
            pitchforkType: result.profile.pitchforkType,
            hopfClass: result.profile.hopfClass,
            criticalSlowingSignal: result.profile.criticalSlowingSignal,
            basinRadius: result.profile.basinRadius,
            basinClass: result.profile.basinClass,
            catastropheType: result.profile.catastropheType,
            hysteresisClass: result.profile.hysteresisClass,
            codimensionClass: result.profile.codimensionClass,
          });
        }
      }

      console.log(
        JSON.stringify({
          result: "bifurcation_status",
          data: { pools: results, timestamp: new Date().toISOString() },
        })
      );
    } catch (e: any) {
      console.log(JSON.stringify({ error: e.message }));
    }
  });

program.parse();
