#!/usr/bin/env bun
/**
 * hodlmm-bin-amplitude.ts — Day 99 cocoa007 Bitflow Skills Comp
 *
 * Liquidity amplitude analyzer — peak-to-trough magnitudes, amplitude
 * decay from active bin, resonance detection, dominant wavelength,
 * amplitude asymmetry, SNR scoring.
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 30;

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

interface Oscillation {
  peakBin: number;
  troughBin: number;
  peakValue: number;
  troughValue: number;
  amplitude: number;
  wavelength: number;
  peakOffset: number;
}

interface ResonancePattern {
  wavelength: number;
  strength: number;
  occurrences: number;
}

interface AmplitudeProfile {
  populatedBins: number;
  totalBins: number;
  scannedTvlUsd: number;
  peakAmplitude: number;
  avgAmplitude: number;
  medianAmplitude: number;
  oscillationCount: number;
  oscillations: Oscillation[];
  decayRate: number;
  decayR2: number;
  dominantWavelength: number;
  resonances: ResonancePattern[];
  amplitudeAsymmetry: number;
  leftAvgAmplitude: number;
  rightAvgAmplitude: number;
  snr: number;
  noiseFloor: number;
  signalPower: number;
  amplitudeScore: number;
  asciiAmplitudeMap: string;
}

interface AmplitudeAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  profile: AmplitudeProfile;
  recommendation: string;
}

// -- Helpers ------------------------------------------------------------------

async function fetchJson(url: string): Promise<any> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`);
  return resp.json();
}

async function callReadOnly(fn: string, args: string[]): Promise<any> {
  const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/${fn}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sender: SENDER, arguments: args }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} calling ${fn}`);
  return resp.json();
}

function cvUint(n: number): string {
  const hex = n.toString(16).padStart(32, "0");
  return `0x01${hex}`;
}

function parseUintResult(hex: string): number {
  if (hex.startsWith("0x")) hex = hex.slice(2);
  if (hex.startsWith("00")) hex = hex.slice(2);
  const tag = hex.slice(0, 2);
  if (tag === "01") return parseInt(hex.slice(2), 16);
  return 0;
}

function parseTupleReserves(hex: string): { reserveX: number; reserveY: number } {
  const fallback = { reserveX: 0, reserveY: 0 };
  if (!hex || hex.length < 10) return fallback;
  if (hex.startsWith("0x")) hex = hex.slice(2);
  try {
    let pos = 0;
    if (hex.slice(pos, pos + 2) === "00") pos += 2;
    const tag = hex.slice(pos, pos + 2);
    pos += 2;
    if (tag !== "0c") return fallback;
    const numKeys = parseInt(hex.slice(pos, pos + 8), 16);
    pos += 8;
    const values: Record<string, number> = {};
    for (let i = 0; i < numKeys; i++) {
      const nameLen = parseInt(hex.slice(pos, pos + 2), 16);
      pos += 2;
      const nameBytes = hex.slice(pos, pos + nameLen * 2);
      pos += nameLen * 2;
      const name = Buffer.from(nameBytes, "hex").toString("ascii");
      const valTag = hex.slice(pos, pos + 2);
      pos += 2;
      if (valTag === "01") {
        const raw = hex.slice(pos, pos + 32);
        pos += 32;
        values[name] = parseInt(raw, 16);
      } else {
        break;
      }
    }
    return {
      reserveX: values["reserve-x"] ?? values["reserveX"] ?? 0,
      reserveY: values["reserve-y"] ?? values["reserveY"] ?? 0,
    };
  } catch {
    return fallback;
  }
}

function fmtUsd(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 1) return v.toFixed(2);
  if (v >= 0.001) return v.toFixed(4);
  return v.toFixed(6);
}

// -- Pool discovery -----------------------------------------------------------

async function discoverPools(): Promise<AppPool[]> {
  const data = await fetchJson(`${BFF_APP_BASE}/pools`);
  const pools: any[] = data.data ?? data.results ?? data.pools ?? [];
  return pools
    .filter((p: any) => {
      const tvl = Number(p.tvlUsd ?? p.tvl ?? 0);
      const id = String(p.poolId ?? "");
      return tvl >= MIN_TVL_USD && id.startsWith("dlmm_");
    })
    .map((p: any) => {
      const tx = p.tokens?.tokenX ?? {};
      const ty = p.tokens?.tokenY ?? {};
      const numericId = parseInt(String(p.poolId).replace("dlmm_", ""), 10);
      const feeBps = p.baseFee != null ? Math.round(Number(p.baseFee) * 10000) : undefined;
      return {
        id: p.poolId ?? `${tx.symbol}-${ty.symbol}`,
        token0Symbol: tx.symbol ?? "?",
        token1Symbol: ty.symbol ?? "?",
        tvlUsd: Number(p.tvlUsd ?? 0),
        volume24hUsd: Number(p.volumeUsd1d ?? 0),
        poolId: numericId,
        token0Decimals: Number(tx.decimals ?? 8),
        token1Decimals: Number(ty.decimals ?? 6),
        token0PriceUsd: Number(tx.priceUsd ?? 0),
        token1PriceUsd: Number(ty.priceUsd ?? 0),
        activeBinId: p.activeBinId != null ? Number(p.activeBinId) : undefined,
        feeBps,
      };
    });
}

// -- On-chain reads -----------------------------------------------------------

async function getActiveBin(poolId: number): Promise<number> {
  const res = await callReadOnly("get-active-bin-id", [cvUint(poolId)]);
  return parseUintResult(res.result ?? "");
}

async function getBinReserves(
  poolId: number,
  binId: number,
  p: AppPool
): Promise<BinReserves> {
  const res = await callReadOnly("get-bin-reserves", [
    cvUint(poolId),
    cvUint(binId),
  ]);
  const hex = res.result ?? "";
  const { reserveX, reserveY } = parseTupleReserves(hex);

  const rx = reserveX / 10 ** p.token0Decimals;
  const ry = reserveY / 10 ** p.token1Decimals;
  const rxUsd = rx * p.token0PriceUsd;
  const ryUsd = ry * p.token1PriceUsd;
  const totalUsd = rxUsd + ryUsd;

  return { binId, reserveX: rx, reserveY: ry, reserveXUsd: rxUsd, reserveYUsd: ryUsd, totalUsd };
}

async function scanBins(
  poolId: number,
  activeBin: number,
  pool: AppPool,
  radius: number
): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const start = activeBin - radius;
  const end = activeBin + radius;

  const batch = 5;
  for (let i = start; i <= end; i += batch) {
    const chunk = [];
    for (let j = i; j < Math.min(i + batch, end + 1); j++) {
      chunk.push(getBinReserves(poolId, j, pool));
    }
    const results = await Promise.all(chunk);
    bins.push(...results);
  }
  return bins.sort((a, b) => a.binId - b.binId);
}

// -- Amplitude math -----------------------------------------------------------

function findLocalExtrema(values: number[]): { peaks: number[]; troughs: number[] } {
  const peaks: number[] = [];
  const troughs: number[] = [];

  for (let i = 1; i < values.length - 1; i++) {
    if (values[i] > values[i - 1] && values[i] > values[i + 1]) {
      peaks.push(i);
    }
    if (values[i] < values[i - 1] && values[i] < values[i + 1]) {
      troughs.push(i);
    }
  }

  if (values[0] > values[1]) peaks.unshift(0);
  else troughs.unshift(0);
  const last = values.length - 1;
  if (values[last] > values[last - 1]) peaks.push(last);
  else troughs.push(last);

  return { peaks, troughs };
}

function extractOscillations(
  bins: BinReserves[],
  activeBinId: number
): Oscillation[] {
  const values = bins.map(b => b.totalUsd);
  const { peaks, troughs } = findLocalExtrema(values);
  const oscillations: Oscillation[] = [];

  for (const peakIdx of peaks) {
    let nearestTrough = -1;
    let minDist = Infinity;

    for (const troughIdx of troughs) {
      const dist = Math.abs(peakIdx - troughIdx);
      if (dist > 0 && dist < minDist) {
        minDist = dist;
        nearestTrough = troughIdx;
      }
    }

    if (nearestTrough >= 0) {
      const peakVal = values[peakIdx];
      const troughVal = values[nearestTrough];
      const amp = peakVal - troughVal;

      if (amp > 0.01) {
        oscillations.push({
          peakBin: bins[peakIdx].binId,
          troughBin: bins[nearestTrough].binId,
          peakValue: Math.round(peakVal * 100) / 100,
          troughValue: Math.round(troughVal * 100) / 100,
          amplitude: Math.round(amp * 100) / 100,
          wavelength: Math.abs(peakIdx - nearestTrough) * 2,
          peakOffset: bins[peakIdx].binId - activeBinId,
        });
      }
    }
  }

  return oscillations.sort((a, b) => b.amplitude - a.amplitude);
}

function computeAmplitudeDecay(
  oscillations: Oscillation[],
  activeBinId: number
): { decayRate: number; r2: number } {
  if (oscillations.length < 3) return { decayRate: 0, r2: 0 };

  const points = oscillations.map(o => ({
    distance: Math.abs(o.peakOffset),
    amplitude: o.amplitude,
  }));
  points.sort((a, b) => a.distance - b.distance);

  const logPoints = points
    .filter(p => p.amplitude > 0.01)
    .map(p => ({ x: p.distance, y: Math.log(p.amplitude) }));

  if (logPoints.length < 2) return { decayRate: 0, r2: 0 };

  const n = logPoints.length;
  const sumX = logPoints.reduce((s, p) => s + p.x, 0);
  const sumY = logPoints.reduce((s, p) => s + p.y, 0);
  const sumXY = logPoints.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = logPoints.reduce((s, p) => s + p.x * p.x, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return { decayRate: 0, r2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const meanY = sumY / n;
  const ssRes = logPoints.reduce((s, p) => {
    const pred = slope * p.x + intercept;
    return s + (p.y - pred) ** 2;
  }, 0);
  const ssTot = logPoints.reduce((s, p) => s + (p.y - meanY) ** 2, 0);
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  const decayRate = Math.max(0, Math.min(1, -slope / 2));

  return {
    decayRate: Math.round(decayRate * 1000) / 1000,
    r2: Math.round(r2 * 1000) / 1000,
  };
}

function detectResonance(values: number[], minWavelength: number = 3): ResonancePattern[] {
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const centered = values.map(v => v - mean);
  const maxLag = Math.floor(n / 2);

  const variance = centered.reduce((s, v) => s + v * v, 0) / n;
  if (variance < 0.001) return [];

  const correlations: { lag: number; corr: number }[] = [];

  for (let lag = minWavelength; lag <= maxLag; lag++) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < n - lag; i++) {
      sum += centered[i] * centered[i + lag];
      count++;
    }
    if (count > 0) {
      const corr = sum / count / variance;
      correlations.push({ lag, corr });
    }
  }

  const resonances: ResonancePattern[] = [];
  for (let i = 1; i < correlations.length - 1; i++) {
    const prev = correlations[i - 1].corr;
    const curr = correlations[i].corr;
    const next = correlations[i + 1].corr;

    if (curr > prev && curr > next && curr > 0.2) {
      const wavelength = correlations[i].lag;
      const occurrences = Math.floor(n / wavelength);
      resonances.push({
        wavelength,
        strength: Math.round(curr * 1000) / 1000,
        occurrences,
      });
    }
  }

  return resonances.sort((a, b) => b.strength - a.strength).slice(0, 5);
}

function computeAmplitudeAsymmetry(
  oscillations: Oscillation[]
): { asymmetry: number; leftAvg: number; rightAvg: number } {
  const left = oscillations.filter(o => o.peakOffset < 0);
  const right = oscillations.filter(o => o.peakOffset > 0);

  const leftAvg = left.length > 0
    ? left.reduce((s, o) => s + o.amplitude, 0) / left.length
    : 0;
  const rightAvg = right.length > 0
    ? right.reduce((s, o) => s + o.amplitude, 0) / right.length
    : 0;

  const denominator = Math.max(leftAvg, rightAvg, 0.01);
  const asymmetry = denominator > 0
    ? (leftAvg + 0.001) / (rightAvg + 0.001)
    : 1;

  return {
    asymmetry: Math.round(Math.min(3, asymmetry) * 1000) / 1000,
    leftAvg: Math.round(leftAvg * 100) / 100,
    rightAvg: Math.round(rightAvg * 100) / 100,
  };
}

function computeSNR(values: number[]): { snr: number; noiseFloor: number; signalPower: number } {
  if (values.length < 5) return { snr: 0, noiseFloor: 0, signalPower: 0 };

  const windowSize = 3;
  const smoothed: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(values.length, i + Math.floor(windowSize / 2) + 1);
    const slice = values.slice(start, end);
    smoothed.push(slice.reduce((s, v) => s + v, 0) / slice.length);
  }

  const signalPower = smoothed.reduce((s, v) => s + v * v, 0) / smoothed.length;
  const noise = values.map((v, i) => v - smoothed[i]);
  const noisePower = noise.reduce((s, v) => s + v * v, 0) / noise.length;

  const snr = noisePower > 0 ? signalPower / noisePower : 100;

  return {
    snr: Math.round(Math.min(100, snr) * 100) / 100,
    noiseFloor: Math.round(Math.sqrt(noisePower) * 100) / 100,
    signalPower: Math.round(Math.sqrt(signalPower) * 100) / 100,
  };
}

function computeAmplitudeScore(
  decayRate: number,
  decayR2: number,
  snr: number,
  asymmetry: number,
  resonances: ResonancePattern[],
  oscillationCount: number
): number {
  let score = 50;

  if (decayRate > 0.1 && decayRate < 0.6) score += 10;
  else if (decayRate >= 0.6) score -= 5;

  score += Math.min(15, decayR2 * 15);

  if (snr > 5) score += 10;
  else if (snr > 2) score += 5;
  else score -= 5;

  const asymDiff = Math.abs(asymmetry - 1);
  if (asymDiff < 0.3) score += 10;
  else if (asymDiff > 1) score -= 10;

  if (resonances.length > 0) {
    score += Math.min(10, resonances.length * 3);
    score += Math.min(5, resonances[0].strength * 10);
  }

  if (oscillationCount >= 3 && oscillationCount <= 15) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// -- ASCII amplitude map ------------------------------------------------------

function buildAmplitudeMap(
  bins: BinReserves[],
  oscillations: Oscillation[],
  activeBinId: number
): string {
  const populated = bins.filter(b => b.totalUsd > 0.01);
  if (populated.length === 0) return "(no populated bins)";

  const maxVal = Math.max(...bins.map(b => b.totalUsd), 0.001);
  const barWidth = 30;

  const peakBins = new Set(oscillations.slice(0, 10).map(o => o.peakBin));
  const troughBins = new Set(oscillations.slice(0, 10).map(o => o.troughBin));

  const lines: string[] = [
    "AMPLITUDE MAP (liquidity waveform with peaks/troughs)",
    "",
    "  offset  |  $value  |  waveform                       | flags",
    "  --------+----------+---------------------------------+------",
  ];

  const step = bins.length > 40 ? 2 : 1;
  for (let i = 0; i < bins.length; i += step) {
    const bin = bins[i];
    const offset = bin.binId - activeBinId;
    const label = `${offset >= 0 ? "+" : ""}${offset}`;
    const usd = fmtUsd(bin.totalUsd).padStart(7);

    const norm = bin.totalUsd / maxVal;
    const barLen = Math.round(norm * barWidth);
    const bar = "\u2588".repeat(Math.max(0, barLen));

    const flags: string[] = [];
    if (offset === 0) flags.push("\u25c4");
    if (peakBins.has(bin.binId)) flags.push("\u25b2");
    if (troughBins.has(bin.binId)) flags.push("\u25bc");

    lines.push(
      `  ${label.padStart(6)}  | ${usd} | ${bar.padEnd(barWidth)} | ${flags.join("")}`
    );
  }

  lines.push("");
  lines.push(
    "\u2588 = liquidity  \u25b2 = peak  \u25bc = trough  \u25c4 = active bin"
  );
  return lines.join("\n");
}

// -- Profile ------------------------------------------------------------------

function buildProfile(bins: BinReserves[], activeBinId: number): AmplitudeProfile {
  const populated = bins.filter(b => b.totalUsd > 0.01);
  const scannedTvl = populated.reduce((s, b) => s + b.totalUsd, 0);
  const values = bins.map(b => b.totalUsd);

  const oscillations = extractOscillations(bins, activeBinId);
  const { decayRate, r2: decayR2 } = computeAmplitudeDecay(oscillations, activeBinId);
  const resonances = detectResonance(values);
  const { asymmetry, leftAvg, rightAvg } = computeAmplitudeAsymmetry(oscillations);
  const { snr, noiseFloor, signalPower } = computeSNR(values);

  const amplitudes = oscillations.map(o => o.amplitude);
  const peakAmplitude = amplitudes.length > 0 ? Math.max(...amplitudes) : 0;
  const avgAmplitude = amplitudes.length > 0
    ? amplitudes.reduce((s, a) => s + a, 0) / amplitudes.length
    : 0;

  const sorted = [...amplitudes].sort((a, b) => a - b);
  const medianAmplitude = sorted.length > 0
    ? sorted[Math.floor(sorted.length / 2)]
    : 0;

  const dominantWavelength = resonances.length > 0
    ? resonances[0].wavelength
    : (oscillations.length > 1
      ? Math.round(oscillations.reduce((s, o) => s + o.wavelength, 0) / oscillations.length)
      : 0);

  const amplitudeScore = computeAmplitudeScore(
    decayRate, decayR2, snr, asymmetry, resonances, oscillations.length
  );

  const asciiAmplitudeMap = buildAmplitudeMap(bins, oscillations, activeBinId);

  return {
    populatedBins: populated.length,
    totalBins: bins.length,
    scannedTvlUsd: Math.round(scannedTvl * 100) / 100,
    peakAmplitude: Math.round(peakAmplitude * 100) / 100,
    avgAmplitude: Math.round(avgAmplitude * 100) / 100,
    medianAmplitude: Math.round(medianAmplitude * 100) / 100,
    oscillationCount: oscillations.length,
    oscillations: oscillations.slice(0, 15),
    decayRate,
    decayR2,
    dominantWavelength,
    resonances,
    amplitudeAsymmetry: asymmetry,
    leftAvgAmplitude: leftAvg,
    rightAvgAmplitude: rightAvg,
    snr,
    noiseFloor,
    signalPower,
    amplitudeScore,
    asciiAmplitudeMap,
  };
}

function buildRecommendation(pair: string, profile: AmplitudeProfile): string {
  const parts: string[] = [];

  parts.push(
    `${pair} amplitude analysis: peak ${fmtUsd(profile.peakAmplitude)} USD, ` +
    `avg ${fmtUsd(profile.avgAmplitude)} USD, ` +
    `${profile.oscillationCount} oscillations detected. ` +
    `Overall amplitude score: ${profile.amplitudeScore}/100.`
  );

  if (profile.decayRate > 0) {
    const decayLabel = profile.decayRate > 0.6 ? "rapid" : profile.decayRate > 0.3 ? "moderate" : "gradual";
    parts.push(
      `Amplitude decay: ${decayLabel} (rate ${profile.decayRate}, R²=${profile.decayR2}). ` +
      `${profile.decayRate > 0.6
        ? "Liquidity amplitude falls off steeply — effective depth is concentrated near the active bin."
        : profile.decayRate < 0.3
        ? "Amplitude persists far from center — broad structural features throughout the range."
        : "Moderate decay — balanced amplitude falloff from center."}`
    );
  }

  if (profile.dominantWavelength > 0) {
    parts.push(
      `Dominant wavelength: ${profile.dominantWavelength} bins. ` +
      `${profile.dominantWavelength <= 5
        ? "Tight oscillations suggest algorithmic or frequent rebalancing LP strategies."
        : profile.dominantWavelength <= 10
        ? "Medium-period waves indicate structured manual positioning."
        : "Long-period structures — broad institutional or passive LP zones."}`
    );
  }

  if (profile.resonances.length > 0) {
    parts.push(
      `${profile.resonances.length} resonance pattern(s) detected. ` +
      `Strongest at wavelength ${profile.resonances[0].wavelength} with ` +
      `correlation ${profile.resonances[0].strength}. ` +
      `Repeating structures suggest coordinated LP behavior.`
    );
  }

  const asymLabel = profile.amplitudeAsymmetry > 1.5
    ? "left-heavy (bearish LP bias)"
    : profile.amplitudeAsymmetry < 0.67
    ? "right-heavy (bullish LP bias)"
    : "balanced";
  parts.push(
    `Amplitude asymmetry: ${profile.amplitudeAsymmetry.toFixed(2)} — ${asymLabel}. ` +
    `Left avg: ${fmtUsd(profile.leftAvgAmplitude)}, right avg: ${fmtUsd(profile.rightAvgAmplitude)}.`
  );

  const snrLabel = profile.snr > 5 ? "clean" : profile.snr > 2 ? "moderate" : "noisy";
  parts.push(
    `SNR: ${profile.snr.toFixed(1)} — ${snrLabel} signal. ` +
    `${profile.snr > 5
      ? "Clear structural patterns. LP positioning is predictable."
      : profile.snr < 2
      ? "High noise floor — amplitude variations are largely random."
      : "Mix of structural patterns and noise."}`
  );

  return parts.join(" ");
}

// -- Main analysis ------------------------------------------------------------

async function analyzeAmplitude(pool: AppPool): Promise<AmplitudeAnalysis> {
  const poolId = pool.poolId!;
  const activeBinId = pool.activeBinId ?? await getActiveBin(poolId);
  const rawBins = await scanBins(poolId, activeBinId, pool, BIN_SCAN_RADIUS);

  const populated = rawBins.filter(b => b.totalUsd > 0.01);
  const scannedTvl = populated.reduce((s, b) => s + b.totalUsd, 0);

  const profile = buildProfile(rawBins, activeBinId);
  const recommendation = buildRecommendation(
    `${pool.token0Symbol}/${pool.token1Symbol}`,
    profile,
  );

  return {
    poolId,
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    feeBps: pool.feeBps ?? 30,
    activeBinId,
    binsScanned: rawBins.length,
    binsPopulated: populated.length,
    scannedTvlUsd: Math.round(scannedTvl * 100) / 100,
    profile,
    recommendation,
  };
}

function makeErrorResult(pool: AppPool, errMsg: string): AmplitudeAnalysis {
  return {
    poolId: pool.poolId!,
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    feeBps: pool.feeBps ?? 30,
    activeBinId: 0,
    binsScanned: 0,
    binsPopulated: 0,
    scannedTvlUsd: 0,
    profile: {
      populatedBins: 0, totalBins: 0, scannedTvlUsd: 0,
      peakAmplitude: 0, avgAmplitude: 0, medianAmplitude: 0,
      oscillationCount: 0, oscillations: [],
      decayRate: 0, decayR2: 0, dominantWavelength: 0,
      resonances: [], amplitudeAsymmetry: 1,
      leftAvgAmplitude: 0, rightAvgAmplitude: 0,
      snr: 0, noiseFloor: 0, signalPower: 0,
      amplitudeScore: 0, asciiAmplitudeMap: "",
    },
    recommendation: `Analysis failed: ${errMsg}`,
  };
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();

program
  .name("hodlmm-bin-amplitude")
  .description("HODLMM Bin Amplitude Analyzer — peak-to-trough magnitudes, decay, resonance, SNR");

program
  .command("doctor")
  .description("Check environment readiness")
  .action(async () => {
    try {
      const pools = await discoverPools();
      const dlmmPools = pools.filter(p => p.poolId != null);
      console.log(JSON.stringify({
        result: "ready",
        details: {
          bffApi: "reachable",
          hiroApi: "reachable",
          dlmmPoolsFound: dlmmPools.length,
          minTvlFilter: `$${MIN_TVL_USD}`,
          scanRadius: BIN_SCAN_RADIUS,
          analyses: [
            "peak-to-trough amplitude extraction",
            "amplitude decay rate (exponential fit)",
            "resonance detection (autocorrelation)",
            "dominant wavelength estimation",
            "amplitude asymmetry (left vs right)",
            "signal-to-noise ratio",
            "oscillation counting and profiling",
          ],
        },
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Doctor failed: ${err.message}` }));
    }
  });

program
  .command("run")
  .description("Analyze liquidity amplitude for HODLMM pools")
  .option("--pool <id>", "Specific pool ID to analyze")
  .option("--top <n>", "Number of top pools by TVL", "3")
  .action(async (opts) => {
    try {
      const pools = await discoverPools();
      const dlmmPools = pools.filter(p => p.poolId != null);

      if (dlmmPools.length === 0) {
        console.log(JSON.stringify({ error: "No DLMM pools found above TVL threshold" }));
        return;
      }

      let targets: AppPool[];
      if (opts.pool) {
        const match = dlmmPools.find(p => String(p.poolId) === opts.pool);
        if (!match) {
          console.log(JSON.stringify({ error: `Pool ${opts.pool} not found` }));
          return;
        }
        targets = [match];
      } else {
        targets = dlmmPools
          .sort((a, b) => b.tvlUsd - a.tvlUsd)
          .slice(0, parseInt(opts.top));
      }

      const results: AmplitudeAnalysis[] = [];
      for (const pool of targets) {
        try {
          const analysis = await analyzeAmplitude(pool);
          results.push(analysis);
        } catch (err: any) {
          results.push(makeErrorResult(pool, err.message));
        }
      }

      const summary = {
        poolsAnalyzed: results.length,
        avgAmplitudeScore: Math.round(
          results.reduce((s, r) => s + r.profile.amplitudeScore, 0) / results.length
        ),
        avgDecayRate: Math.round(
          results.reduce((s, r) => s + r.profile.decayRate, 0) / results.length * 1000
        ) / 1000,
        avgSNR: Math.round(
          results.reduce((s, r) => s + r.profile.snr, 0) / results.length * 100
        ) / 100,
        totalOscillations: results.reduce((s, r) => s + r.profile.oscillationCount, 0),
        totalResonances: results.reduce((s, r) => s + r.profile.resonances.length, 0),
        highestAmplitude: results.reduce((best, r) =>
          r.profile.peakAmplitude > best.profile.peakAmplitude ? r : best, results[0]),
        cleanestSignal: results.reduce((best, r) =>
          r.profile.snr > best.profile.snr ? r : best, results[0]),
      };

      console.log(JSON.stringify({
        result: "amplitude_analysis",
        data: { pools: results, summary },
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Run failed: ${err.message}` }));
    }
  });

program
  .command("status")
  .description("Quick amplitude summary for top pools")
  .action(async () => {
    try {
      const pools = await discoverPools();
      const dlmmPools = pools
        .filter(p => p.poolId != null)
        .sort((a, b) => b.tvlUsd - a.tvlUsd)
        .slice(0, 5);

      const summaries = [];
      for (const pool of dlmmPools) {
        try {
          const analysis = await analyzeAmplitude(pool);
          summaries.push({
            pair: analysis.pair,
            poolId: analysis.poolId,
            tvlUsd: analysis.tvlUsd,
            amplitudeScore: analysis.profile.amplitudeScore,
            peakAmplitude: analysis.profile.peakAmplitude,
            avgAmplitude: analysis.profile.avgAmplitude,
            oscillations: analysis.profile.oscillationCount,
            decayRate: analysis.profile.decayRate,
            dominantWavelength: analysis.profile.dominantWavelength,
            snr: analysis.profile.snr,
            asymmetry: analysis.profile.amplitudeAsymmetry,
            resonances: analysis.profile.resonances.length,
          });
        } catch {
          summaries.push({
            pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
            poolId: pool.poolId,
            tvlUsd: pool.tvlUsd,
            amplitudeScore: -1,
          });
        }
      }

      console.log(JSON.stringify({ result: "amplitude_status", data: summaries }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Status failed: ${err.message}` }));
    }
  });

program.parse();
