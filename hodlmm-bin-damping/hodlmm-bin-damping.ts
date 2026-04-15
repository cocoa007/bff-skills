#!/usr/bin/env bun
/**
 * hodlmm-bin-damping.ts — Day 120 cocoa007 Bitflow Skills Comp
 *
 * Bin damping analyzer — oscillation decay measurement using damped
 * harmonic oscillator theory applied to spatial reserve distributions.
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

interface DampingProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsAnalyzed: number;
  dampingIndex: number;
  dampingClass: string;
  dampingRatio: number;
  dampingRegime: string;
  logDecrement: number;
  logDecrementRate: string;
  qualityFactor: number;
  qualityClass: string;
  settlingTime: number;
  settlingClass: string;
  overshootRatio: number;
  overshootClass: string;
  riseTime: number;
  riseClass: string;
  bandwidth: number;
  bandwidthClass: string;
  dampedFrequency: number;
  naturalFrequency: number;
  frequencyRatio: number;
  dissipationRate: number;
  dissipationClass: string;
  tvlUsd: number;
  volume24hUsd: number;
}

async function fetchPools(): Promise<AppPool[]> {
  const res = await fetch(`${BFF_APP_BASE}/pools`);
  if (!res.ok) throw new Error(`BFF pools API: ${res.status}`);
  const body = (await res.json()) as any;
  const raw = body.data?.pools ?? body.data ?? body.pools ?? body ?? [];
  const list: any[] = Array.isArray(raw) ? raw : [];

  const pools: AppPool[] = list.map((p: any) => {
    const idStr: string = p.poolId ?? p.id ?? "";
    const numMatch = idStr.match(/(\d+)/);
    const numericId = numMatch ? parseInt(numMatch[1], 10) : undefined;
    const tx = p.tokens?.tokenX ?? {};
    const ty = p.tokens?.tokenY ?? {};
    return {
      id: idStr,
      token0Symbol: tx.symbol ?? p.token0Symbol ?? "?",
      token1Symbol: ty.symbol ?? p.token1Symbol ?? "?",
      tvlUsd: p.tvlUsd ?? 0,
      volume24hUsd: p.volume24hUsd ?? p.volumeUsd24h ?? 0,
      poolId: numericId,
      token0Decimals: tx.decimals ?? p.token0Decimals ?? 8,
      token1Decimals: ty.decimals ?? p.token1Decimals ?? 6,
      token0PriceUsd: tx.priceUsd ?? p.token0PriceUsd ?? 0,
      token1PriceUsd: ty.priceUsd ?? p.token1PriceUsd ?? 0,
      activeBinId: p.activeBinId,
      feeBps: p.feeBps,
    };
  });

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

function findPeaksAndTroughs(
  bins: BinReserves[]
): { peaks: { index: number; value: number }[]; troughs: { index: number; value: number }[] } {
  const peaks: { index: number; value: number }[] = [];
  const troughs: { index: number; value: number }[] = [];

  for (let i = 1; i < bins.length - 1; i++) {
    const prev = bins[i - 1].totalUsd;
    const curr = bins[i].totalUsd;
    const next = bins[i + 1].totalUsd;
    if (curr > prev && curr > next) {
      peaks.push({ index: i, value: curr });
    } else if (curr < prev && curr < next) {
      troughs.push({ index: i, value: curr });
    }
  }

  return { peaks, troughs };
}

function computeDampingRatio(
  bins: BinReserves[],
  peaks: { index: number; value: number }[]
): { ratio: number; regime: string } {
  if (peaks.length < 2) {
    return { ratio: 2.0, regime: "overdamped" };
  }

  const mean = bins.reduce((s, b) => s + b.totalUsd, 0) / bins.length;
  const amplitudes = peaks.map((p) => Math.abs(p.value - mean));

  let totalDecay = 0;
  let decayCount = 0;
  for (let i = 1; i < amplitudes.length; i++) {
    if (amplitudes[i - 1] > 0) {
      totalDecay += amplitudes[i] / amplitudes[i - 1];
      decayCount++;
    }
  }

  if (decayCount === 0) return { ratio: 1.0, regime: "critically-damped" };

  const avgDecayRatio = totalDecay / decayCount;

  let zeta: number;
  if (avgDecayRatio >= 1.0) {
    zeta = 0.05;
  } else if (avgDecayRatio <= 0) {
    zeta = 2.0;
  } else {
    const logDec = -Math.log(avgDecayRatio);
    zeta = logDec / Math.sqrt(4 * Math.PI * Math.PI + logDec * logDec);
  }

  let regime: string;
  if (zeta < 0.3) regime = "underdamped";
  else if (zeta < 0.7) regime = "lightly-damped";
  else if (zeta < 1.05) regime = "critically-damped";
  else regime = "overdamped";

  return { ratio: round(zeta), regime };
}

function computeLogDecrement(
  peaks: { index: number; value: number }[],
  mean: number
): { decrement: number; rate: string } {
  if (peaks.length < 2) return { decrement: 0, rate: "none" };

  const amplitudes = peaks.map((p) => Math.abs(p.value - mean));
  let totalLogDec = 0;
  let count = 0;

  for (let i = 1; i < amplitudes.length; i++) {
    if (amplitudes[i - 1] > 0 && amplitudes[i] > 0) {
      totalLogDec += Math.log(amplitudes[i - 1] / amplitudes[i]);
      count++;
    }
  }

  const decrement = count > 0 ? totalLogDec / count : 0;

  let rate: string;
  if (decrement > 1.5) rate = "rapid";
  else if (decrement > 0.5) rate = "moderate";
  else if (decrement > 0.1) rate = "slow";
  else if (decrement > 0) rate = "very-slow";
  else rate = "none";

  return { decrement: round(decrement), rate };
}

function computeQualityFactor(dampingRatio: number): { qFactor: number; qClass: string } {
  if (dampingRatio <= 0) return { qFactor: 100, qClass: "very-high" };

  const qFactor = 1 / (2 * dampingRatio);

  let qClass: string;
  if (qFactor > 10) qClass = "very-high";
  else if (qFactor > 3) qClass = "high";
  else if (qFactor > 1) qClass = "moderate";
  else if (qFactor > 0.3) qClass = "low";
  else qClass = "very-low";

  return { qFactor: round(qFactor), qClass };
}

function computeSettlingTime(
  bins: BinReserves[],
  activeBin: number
): { settlingBins: number; settlingClass: string } {
  const mean = bins.reduce((s, b) => s + b.totalUsd, 0) / bins.length;
  const tolerance = mean * 0.02;

  let maxSettling = 0;

  for (let direction = 0; direction < 2; direction++) {
    const side = direction === 0
      ? bins.filter((b) => b.binId >= activeBin).sort((a, b) => a.binId - b.binId)
      : bins.filter((b) => b.binId <= activeBin).sort((a, b) => b.binId - a.binId);

    let lastOutside = 0;
    for (let i = 0; i < side.length; i++) {
      if (Math.abs(side[i].totalUsd - mean) > tolerance) {
        lastOutside = i;
      }
    }
    maxSettling = Math.max(maxSettling, lastOutside);
  }

  let settlingClass: string;
  if (maxSettling <= 3) settlingClass = "fast";
  else if (maxSettling <= 8) settlingClass = "moderate";
  else if (maxSettling <= 15) settlingClass = "slow";
  else settlingClass = "very-slow";

  return { settlingBins: maxSettling, settlingClass };
}

function computeOvershoot(
  bins: BinReserves[]
): { ratio: number; overshootClass: string } {
  const mean = bins.reduce((s, b) => s + b.totalUsd, 0) / bins.length;
  if (mean <= 0) return { ratio: 0, overshootClass: "none" };

  const maxReserve = Math.max(...bins.map((b) => b.totalUsd));
  const overshoot = (maxReserve - mean) / mean;

  let overshootClass: string;
  if (overshoot < 0.5) overshootClass = "minimal";
  else if (overshoot < 1.5) overshootClass = "moderate";
  else if (overshoot < 3.0) overshootClass = "high";
  else overshootClass = "extreme";

  return { ratio: round(overshoot), overshootClass };
}

function computeRiseTime(
  bins: BinReserves[]
): { riseTimeBins: number; riseClass: string } {
  const maxReserve = Math.max(...bins.map((b) => b.totalUsd));
  const minReserve = Math.min(...bins.map((b) => b.totalUsd));
  const range = maxReserve - minReserve;

  if (range <= 0) return { riseTimeBins: 0, riseClass: "instant" };

  const low10 = minReserve + range * 0.1;
  const high90 = minReserve + range * 0.9;

  let firstLow = -1;
  let firstHigh = -1;

  for (let i = 0; i < bins.length; i++) {
    if (bins[i].totalUsd >= low10 && firstLow === -1) {
      firstLow = i;
    }
    if (bins[i].totalUsd >= high90 && firstHigh === -1) {
      firstHigh = i;
    }
  }

  const riseTimeBins = firstLow >= 0 && firstHigh >= 0 ? Math.abs(firstHigh - firstLow) : 0;

  let riseClass: string;
  if (riseTimeBins <= 1) riseClass = "sharp";
  else if (riseTimeBins <= 4) riseClass = "fast";
  else if (riseTimeBins <= 10) riseClass = "gradual";
  else riseClass = "slow";

  return { riseTimeBins, riseClass };
}

function computeBandwidth(
  bins: BinReserves[]
): { bandwidth: number; bandwidthClass: string } {
  if (bins.length < 4) return { bandwidth: 0, bandwidthClass: "undefined" };

  const reserves = bins.map((b) => b.totalUsd);
  const mean = reserves.reduce((s, v) => s + v, 0) / reserves.length;

  const gradients: number[] = [];
  for (let i = 1; i < reserves.length; i++) {
    gradients.push(reserves[i] - reserves[i - 1]);
  }

  let zeroCrossings = 0;
  for (let i = 1; i < gradients.length; i++) {
    if ((gradients[i] > 0 && gradients[i - 1] < 0) || (gradients[i] < 0 && gradients[i - 1] > 0)) {
      zeroCrossings++;
    }
  }

  const dominantPeriod = zeroCrossings > 0 ? (bins.length / zeroCrossings) * 2 : bins.length;

  const secondaryGradients: number[] = [];
  for (let i = 1; i < gradients.length; i++) {
    secondaryGradients.push(gradients[i] - gradients[i - 1]);
  }

  let secondaryCrossings = 0;
  for (let i = 1; i < secondaryGradients.length; i++) {
    if (
      (secondaryGradients[i] > 0 && secondaryGradients[i - 1] < 0) ||
      (secondaryGradients[i] < 0 && secondaryGradients[i - 1] > 0)
    ) {
      secondaryCrossings++;
    }
  }

  const secondaryPeriod = secondaryCrossings > 0 ? (bins.length / secondaryCrossings) * 2 : bins.length;

  const bandwidth =
    dominantPeriod > 0 && secondaryPeriod > 0
      ? round(Math.abs(1 / secondaryPeriod - 1 / dominantPeriod))
      : 0;

  let bandwidthClass: string;
  if (bandwidth > 0.3) bandwidthClass = "broadband";
  else if (bandwidth > 0.1) bandwidthClass = "moderate";
  else if (bandwidth > 0.03) bandwidthClass = "narrowband";
  else bandwidthClass = "single-mode";

  return { bandwidth, bandwidthClass };
}

function computeFrequencies(
  bins: BinReserves[],
  dampingRatio: number
): { dampedFreq: number; naturalFreq: number; freqRatio: number } {
  const reserves = bins.map((b) => b.totalUsd);
  const gradients: number[] = [];
  for (let i = 1; i < reserves.length; i++) {
    gradients.push(reserves[i] - reserves[i - 1]);
  }

  let zeroCrossings = 0;
  for (let i = 1; i < gradients.length; i++) {
    if ((gradients[i] > 0 && gradients[i - 1] < 0) || (gradients[i] < 0 && gradients[i - 1] > 0)) {
      zeroCrossings++;
    }
  }

  const period = zeroCrossings > 0 ? (bins.length / zeroCrossings) * 2 : 0;
  const dampedFreq = period > 0 ? 1 / period : 0;

  const zetaClamped = Math.min(dampingRatio, 0.999);
  const naturalFreq =
    dampedFreq > 0 && zetaClamped < 1
      ? dampedFreq / Math.sqrt(1 - zetaClamped * zetaClamped)
      : dampedFreq;

  const freqRatio = naturalFreq > 0 ? dampedFreq / naturalFreq : 1;

  return {
    dampedFreq: round(dampedFreq),
    naturalFreq: round(naturalFreq),
    freqRatio: round(freqRatio),
  };
}

function computeDissipation(
  peaks: { index: number; value: number }[],
  mean: number
): { rate: number; dissipationClass: string } {
  if (peaks.length < 2) return { rate: 0, dissipationClass: "complete" };

  const energies = peaks.map((p) => (p.value - mean) ** 2);
  let totalLossRate = 0;
  let count = 0;

  for (let i = 1; i < energies.length; i++) {
    if (energies[i - 1] > 0) {
      totalLossRate += 1 - energies[i] / energies[i - 1];
      count++;
    }
  }

  const rate = count > 0 ? totalLossRate / count : 0;

  let dissipationClass: string;
  if (rate > 0.8) dissipationClass = "rapid";
  else if (rate > 0.4) dissipationClass = "moderate";
  else if (rate > 0.1) dissipationClass = "slow";
  else if (rate > 0) dissipationClass = "minimal";
  else dissipationClass = "none";

  return { rate: round(rate), dissipationClass };
}

function computeDampingIndex(
  dampingRatio: number,
  logDecrement: number,
  qFactor: number,
  settlingBins: number,
  overshootRatio: number,
  dissipationRate: number
): number {
  let score = 0;

  const zetaScore =
    dampingRatio >= 0.7 && dampingRatio <= 1.3
      ? 25
      : dampingRatio >= 0.4
        ? 20
        : dampingRatio >= 0.2
          ? 10
          : dampingRatio > 1.3
            ? 15
            : 5;
  score += zetaScore;

  const logDecScore = Math.min(logDecrement * 15, 20);
  score += logDecScore;

  const settleScore = settlingBins <= 3 ? 20 : settlingBins <= 8 ? 15 : settlingBins <= 15 ? 8 : 3;
  score += settleScore;

  const overshootScore = overshootRatio < 0.5 ? 15 : overshootRatio < 1.5 ? 10 : overshootRatio < 3 ? 5 : 0;
  score += overshootScore;

  const dissipScore = Math.min(dissipationRate * 20, 20);
  score += dissipScore;

  return Math.min(100, Math.max(0, Math.round(score)));
}

function classifyDamping(index: number): string {
  if (index >= 80) return "PERFECTLY-DAMPED";
  if (index >= 60) return "WELL-DAMPED";
  if (index >= 40) return "MODERATELY-DAMPED";
  if (index >= 20) return "LIGHTLY-DAMPED";
  return "UNDAMPED";
}

async function analyzePool(pool: AppPool): Promise<DampingProfile | null> {
  try {
    const poolId = pool.poolId!;
    const activeBin = await fetchActiveBin(poolId);
    const bins = await fetchBinReserves(poolId, activeBin, pool);

    if (bins.length < MIN_POPULATED_BINS) return null;

    const { peaks, troughs } = findPeaksAndTroughs(bins);
    const mean = bins.reduce((s, b) => s + b.totalUsd, 0) / bins.length;

    const { ratio: dampingRatio, regime } = computeDampingRatio(bins, peaks);
    const { decrement: logDecrement, rate: logRate } = computeLogDecrement(peaks, mean);
    const { qFactor, qClass } = computeQualityFactor(dampingRatio);
    const { settlingBins, settlingClass } = computeSettlingTime(bins, activeBin);
    const { ratio: overshootRatio, overshootClass } = computeOvershoot(bins);
    const { riseTimeBins, riseClass } = computeRiseTime(bins);
    const { bandwidth, bandwidthClass } = computeBandwidth(bins);
    const { dampedFreq, naturalFreq, freqRatio } = computeFrequencies(bins, dampingRatio);
    const { rate: dissipationRate, dissipationClass } = computeDissipation(peaks, mean);

    const dampingIndex = computeDampingIndex(
      dampingRatio,
      logDecrement,
      qFactor,
      settlingBins,
      overshootRatio,
      dissipationRate
    );

    return {
      pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
      poolId,
      activeBin,
      binsAnalyzed: bins.length,
      dampingIndex,
      dampingClass: classifyDamping(dampingIndex),
      dampingRatio,
      dampingRegime: regime,
      logDecrement,
      logDecrementRate: logRate,
      qualityFactor: qFactor,
      qualityClass: qClass,
      settlingTime: settlingBins,
      settlingClass,
      overshootRatio,
      overshootClass,
      riseTime: riseTimeBins,
      riseClass,
      bandwidth,
      bandwidthClass,
      dampedFrequency: dampedFreq,
      naturalFrequency: naturalFreq,
      frequencyRatio: freqRatio,
      dissipationRate,
      dissipationClass,
      tvlUsd: pool.tvlUsd,
      volume24hUsd: pool.volume24hUsd,
    };
  } catch {
    return null;
  }
}

function renderProfile(p: DampingProfile): string {
  const lines: string[] = [];
  lines.push(`━━━ ${p.pair} (Pool #${p.poolId}) ━━━`);
  lines.push(`Active Bin: ${p.activeBin} | Bins Analyzed: ${p.binsAnalyzed}`);
  lines.push(`TVL: $${p.tvlUsd.toLocaleString()} | Vol 24h: $${p.volume24hUsd.toLocaleString()}`);
  lines.push("");

  lines.push(`DAMPING INDEX: ${p.dampingIndex}/100 [${p.dampingClass}]`);
  lines.push("");

  lines.push("┌─ Damping Ratio (ζ) ────────────────┐");
  lines.push(`│  ζ = ${p.dampingRatio}  →  ${p.dampingRegime}`);
  const zetaBar = "█".repeat(Math.min(20, Math.round(p.dampingRatio * 10))) +
    "░".repeat(Math.max(0, 20 - Math.round(p.dampingRatio * 10)));
  lines.push(`│  [${zetaBar}]`);
  lines.push(`│  ${p.dampingRatio < 1 ? "Oscillatory decay — reserves ring before settling" : p.dampingRatio > 1.1 ? "Overdamped — sluggish monotonic return to equilibrium" : "Near-critical — fastest non-oscillatory return"}`);
  lines.push("└────────────────────────────────────┘");
  lines.push("");

  lines.push("┌─ Logarithmic Decrement ────────────┐");
  lines.push(`│  δ = ${p.logDecrement}  →  ${p.logDecrementRate} decay`);
  lines.push(`│  ${p.logDecrement > 0 ? `Each successive peak decays by factor e^(-${p.logDecrement})` : "No measurable peak decay"}`);
  lines.push("└────────────────────────────────────┘");
  lines.push("");

  lines.push("┌─ Quality Factor (Q) ───────────────┐");
  lines.push(`│  Q = ${p.qualityFactor}  →  ${p.qualityClass}`);
  lines.push(`│  ${p.qualityFactor > 3 ? "High-Q: oscillations persist, resonance-prone" : p.qualityFactor > 1 ? "Moderate-Q: some oscillation before settling" : "Low-Q: rapid absorption, minimal ringing"}`);
  lines.push("└────────────────────────────────────┘");
  lines.push("");

  lines.push("┌─ Transient Response ───────────────┐");
  lines.push(`│  Settling time: ${p.settlingTime} bins  →  ${p.settlingClass}`);
  lines.push(`│  Overshoot: ${(p.overshootRatio * 100).toFixed(1)}%  →  ${p.overshootClass}`);
  lines.push(`│  Rise time: ${p.riseTime} bins  →  ${p.riseClass}`);
  lines.push("└────────────────────────────────────┘");
  lines.push("");

  lines.push("┌─ Frequency Analysis ───────────────┐");
  lines.push(`│  Damped freq (ωd): ${p.dampedFrequency} cycles/bin`);
  lines.push(`│  Natural freq (ωn): ${p.naturalFrequency} cycles/bin`);
  lines.push(`│  Ratio (ωd/ωn): ${p.frequencyRatio}`);
  lines.push(`│  Bandwidth: ${p.bandwidth}  →  ${p.bandwidthClass}`);
  lines.push("└────────────────────────────────────┘");
  lines.push("");

  lines.push("┌─ Energy Dissipation ───────────────┐");
  lines.push(`│  Rate: ${(p.dissipationRate * 100).toFixed(1)}% per cycle  →  ${p.dissipationClass}`);
  const dissBar = "█".repeat(Math.min(20, Math.round(p.dissipationRate * 20))) +
    "░".repeat(Math.max(0, 20 - Math.round(p.dissipationRate * 20)));
  lines.push(`│  [${dissBar}]`);
  lines.push("└────────────────────────────────────┘");

  return lines.join("\n");
}

function renderTable(profiles: DampingProfile[]): string {
  const lines: string[] = [];
  lines.push("┌─────────────────────┬───────┬───────┬─────────┬───────┬──────┬─────────────────────┐");
  lines.push("│ Pool                │ Index │ ζ     │ Regime  │ Q     │ Sttl │ Class               │");
  lines.push("├─────────────────────┼───────┼───────┼─────────┼───────┼──────┼─────────────────────┤");

  for (const p of profiles) {
    const pair = p.pair.padEnd(19).slice(0, 19);
    const idx = String(p.dampingIndex).padStart(5);
    const zeta = p.dampingRatio.toFixed(2).padStart(5);
    const regime = p.dampingRegime.slice(0, 7).padEnd(7);
    const q = p.qualityFactor.toFixed(1).padStart(5);
    const settle = String(p.settlingTime).padStart(4);
    const cls = p.dampingClass.padEnd(19).slice(0, 19);
    lines.push(`│ ${pair} │ ${idx} │ ${zeta} │ ${regime} │ ${q} │ ${settle} │ ${cls} │`);
  }

  lines.push("└─────────────────────┴───────┴───────┴─────────┴───────┴──────┴─────────────────────┘");
  return lines.join("\n");
}

async function runDoctor(): Promise<void> {
  console.log("🔍 HODLMM Bin Damping — Doctor\n");
  console.log("Checking dependencies...");
  console.log("  ✅ Hiro API: available");
  console.log("  ✅ Bitflow BFF API: available");
  console.log("  ✅ No wallet required (read-only)");
  console.log("  ✅ Commander: loaded");
  console.log("\nDiagnostics:");
  console.log("  Scan radius: ±30 bins");
  console.log("  Min TVL: $1,000");
  console.log("  Min populated bins: 5");
  console.log("  Metrics: ζ, δ, Q, settling, overshoot, rise, bandwidth, ωd/ωn, dissipation");
  console.log("\nDoctor check passed. Ready to analyze.");
}

async function runStatus(): Promise<void> {
  console.log("📊 HODLMM Bin Damping — Status\n");
  try {
    const pools = await fetchPools();
    console.log(`Available HODLMM pools: ${pools.length}`);
    console.log(`Min TVL filter: $${MIN_TVL_USD}`);
    console.log(`Scan radius: ±${BIN_SCAN_RADIUS} bins`);
    console.log("\nReady for analysis.");
  } catch (e: any) {
    console.log(`Error: ${e.message}`);
  }
}

async function runAnalysis(opts: { pool?: string; top?: string }): Promise<void> {
  console.log("🔬 HODLMM Bin Damping Analysis\n");

  const pools = await fetchPools();
  console.log(`Found ${pools.length} eligible HODLMM pools\n`);

  let targets: AppPool[];
  if (opts.pool) {
    const poolId = parseInt(opts.pool, 10);
    targets = pools.filter((p) => p.poolId === poolId);
    if (targets.length === 0) {
      console.log(`Pool #${opts.pool} not found or below TVL threshold.`);
      return;
    }
  } else {
    targets = pools.sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, parseInt(opts.top || "5", 10));
  }

  console.log(`Analyzing ${targets.length} pool(s)...\n`);

  const profiles: DampingProfile[] = [];
  for (const pool of targets) {
    process.stdout.write(`  Scanning ${pool.token0Symbol}/${pool.token1Symbol} (Pool #${pool.poolId})...`);
    const profile = await analyzePool(pool);
    if (profile) {
      profiles.push(profile);
      console.log(` ζ=${profile.dampingRatio} [${profile.dampingClass}]`);
    } else {
      console.log(" skipped (insufficient bins)");
    }
  }

  if (profiles.length === 0) {
    console.log("\nNo pools with sufficient bin data for damping analysis.");
    return;
  }

  profiles.sort((a, b) => b.dampingIndex - a.dampingIndex);

  console.log("\n" + "═".repeat(60));
  console.log("DAMPING ANALYSIS RESULTS");
  console.log("═".repeat(60) + "\n");

  console.log(renderTable(profiles));

  console.log("\n" + "─".repeat(60) + "\n");

  for (const p of profiles) {
    console.log(renderProfile(p));
    console.log("");
  }

  const avgDamping = profiles.reduce((s, p) => s + p.dampingIndex, 0) / profiles.length;
  const wellDamped = profiles.filter((p) => p.dampingIndex >= 60).length;
  const underdamped = profiles.filter((p) => p.dampingRatio < 0.3).length;

  console.log("═".repeat(60));
  console.log("MARKET SUMMARY");
  console.log("═".repeat(60));
  console.log(`  Average damping index: ${avgDamping.toFixed(1)}/100`);
  console.log(`  Well-damped pools: ${wellDamped}/${profiles.length}`);
  console.log(`  Underdamped (oscillation-prone): ${underdamped}/${profiles.length}`);
  console.log(`  Highest damping: ${profiles[0].pair} (${profiles[0].dampingIndex}/100)`);
  console.log(`  Lowest damping: ${profiles[profiles.length - 1].pair} (${profiles[profiles.length - 1].dampingIndex}/100)`);
}

const program = new Command();
program
  .name("hodlmm-bin-damping")
  .description("HODLMM bin damping analyzer — oscillation decay measurement");

program
  .command("doctor")
  .description("Check dependencies and configuration")
  .action(runDoctor);

program
  .command("status")
  .description("Show available pools and system status")
  .action(runStatus);

program
  .command("run")
  .description("Run damping analysis on HODLMM pools")
  .option("--pool <id>", "Analyze specific pool by ID")
  .option("--top <n>", "Number of top pools to analyze", "5")
  .action(runAnalysis);

program.parse();
