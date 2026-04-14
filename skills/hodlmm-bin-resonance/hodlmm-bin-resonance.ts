#!/usr/bin/env bun
/**
 * hodlmm-bin-resonance.ts — Day 104 cocoa007 Bitflow Skills Comp
 *
 * Bin reserve resonance analyzer — detects harmonic symmetry patterns in
 * HODLMM bin distributions. Measures phase alignment between buy/sell sides,
 * standing wave detection, constructive/destructive interference zones,
 * dominant frequency extraction via DFT, and composite resonance scoring.
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

interface HarmonicComponent {
  frequency: number;
  amplitude: number;
  phase: number;
  power: number;
}

interface InterferenceZone {
  offsetRange: [number, number];
  type: "constructive" | "destructive";
  strength: number;
  leftReserveAvg: number;
  rightReserveAvg: number;
}

interface StandingWave {
  wavelength: number;
  nodes: number[];
  antinodes: number[];
  amplitude: number;
  quality: number;
}

interface ResonanceProfile {
  populatedBins: number;
  scannedTvlUsd: number;
  activeBinTvlUsd: number;

  symmetryCorrelation: number;
  phaseCoherence: number;

  dominantHarmonics: HarmonicComponent[];
  spectralEntropy: number;
  spectralCentroid: number;

  interferenceZones: InterferenceZone[];
  constructiveCount: number;
  destructiveCount: number;
  netInterference: number;

  standingWaves: StandingWave[];

  resonanceClass: "harmonic" | "quasi-harmonic" | "aperiodic" | "chaotic" | "silent";
  resonanceScore: number;

  asciiResonanceMap: string;
}

interface ResonanceAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  profile: ResonanceProfile;
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
  return bins;
}

// -- Resonance Analysis -------------------------------------------------------

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  return denominator > 0 ? numerator / denominator : 0;
}

function computeDFT(signal: number[], maxFreqs: number): HarmonicComponent[] {
  const N = signal.length;
  if (N < 4) return [];

  const mean = signal.reduce((a, b) => a + b, 0) / N;
  const centered = signal.map((v) => v - mean);

  const components: HarmonicComponent[] = [];
  const maxK = Math.min(Math.floor(N / 2), 15);

  let totalPower = 0;

  for (let k = 1; k <= maxK; k++) {
    let real = 0;
    let imag = 0;
    for (let n = 0; n < N; n++) {
      const angle = (2 * Math.PI * k * n) / N;
      real += centered[n] * Math.cos(angle);
      imag -= centered[n] * Math.sin(angle);
    }
    real /= N;
    imag /= N;

    const amplitude = 2 * Math.sqrt(real * real + imag * imag);
    const phase = Math.atan2(imag, real);
    const power = amplitude * amplitude;
    totalPower += power;

    components.push({
      frequency: k,
      amplitude: Number(amplitude.toFixed(4)),
      phase: Number(phase.toFixed(4)),
      power: Number(power.toFixed(6)),
    });
  }

  components.sort((a, b) => b.power - a.power);

  return components.slice(0, maxFreqs).map((c) => ({
    ...c,
    power: totalPower > 0 ? Number((c.power / totalPower).toFixed(4)) : 0,
  }));
}

function computeSpectralEntropy(harmonics: HarmonicComponent[]): number {
  const powers = harmonics.map((h) => h.power).filter((p) => p > 0);
  if (powers.length === 0) return 1;

  const total = powers.reduce((a, b) => a + b, 0);
  if (total <= 0) return 1;

  const normalized = powers.map((p) => p / total);
  const entropy = -normalized.reduce((s, p) => s + (p > 0 ? p * Math.log2(p) : 0), 0);
  const maxEntropy = Math.log2(powers.length);

  return maxEntropy > 0 ? Number((entropy / maxEntropy).toFixed(4)) : 0;
}

function computeSpectralCentroid(harmonics: HarmonicComponent[]): number {
  let weightedSum = 0;
  let totalPower = 0;
  for (const h of harmonics) {
    weightedSum += h.frequency * h.power;
    totalPower += h.power;
  }
  return totalPower > 0 ? Number((weightedSum / totalPower).toFixed(2)) : 0;
}

function detectInterferenceZones(
  leftReserves: number[],
  rightReserves: number[],
  windowSize: number
): InterferenceZone[] {
  const zones: InterferenceZone[] = [];
  const n = Math.min(leftReserves.length, rightReserves.length);
  if (n < windowSize) return zones;

  for (let i = 0; i <= n - windowSize; i += Math.max(1, Math.floor(windowSize / 2))) {
    let leftSum = 0;
    let rightSum = 0;
    let productSum = 0;

    for (let j = i; j < i + windowSize; j++) {
      leftSum += leftReserves[j];
      rightSum += rightReserves[j];
      productSum += leftReserves[j] * rightReserves[j];
    }

    const leftAvg = leftSum / windowSize;
    const rightAvg = rightSum / windowSize;
    const avgProduct = productSum / windowSize;

    if (leftAvg < 0.01 && rightAvg < 0.01) continue;

    const maxAvg = Math.max(leftAvg, rightAvg, 0.01);
    const diff = Math.abs(leftAvg - rightAvg);
    const sum = leftAvg + rightAvg;

    const isConstructive = diff / maxAvg < 0.5 && leftAvg > 0.01 && rightAvg > 0.01;
    const isDestructive = diff / maxAvg > 0.7;

    if (isConstructive || isDestructive) {
      zones.push({
        offsetRange: [i + 1, i + windowSize],
        type: isConstructive ? "constructive" : "destructive",
        strength: Number((isConstructive ? 1 - diff / maxAvg : diff / maxAvg).toFixed(3)),
        leftReserveAvg: Number(leftAvg.toFixed(2)),
        rightReserveAvg: Number(rightAvg.toFixed(2)),
      });
    }
  }

  return zones.sort((a, b) => b.strength - a.strength).slice(0, 8);
}

function detectStandingWaves(signal: number[], harmonics: HarmonicComponent[]): StandingWave[] {
  const waves: StandingWave[] = [];
  if (harmonics.length === 0 || signal.length < 6) return waves;

  for (const h of harmonics.slice(0, 3)) {
    if (h.power < 0.05) continue;

    const wavelength = signal.length / h.frequency;
    if (wavelength < 3) continue;

    const nodes: number[] = [];
    const antinodes: number[] = [];

    const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
    const maxAmp = Math.max(...signal.map((v) => Math.abs(v - mean)), 1);

    for (let i = 1; i < signal.length - 1; i++) {
      const dev = Math.abs(signal[i] - mean) / maxAmp;
      const isLocalMin = signal[i] <= signal[i - 1] && signal[i] <= signal[i + 1];
      const isLocalMax = signal[i] >= signal[i - 1] && signal[i] >= signal[i + 1];

      if (dev < 0.15 && isLocalMin) nodes.push(i);
      if (dev > 0.6 && isLocalMax) antinodes.push(i);
    }

    const expectedNodes = Math.floor(signal.length / wavelength) * 2;
    const quality = expectedNodes > 0
      ? Math.min(1, nodes.length / Math.max(expectedNodes, 1))
      : 0;

    waves.push({
      wavelength: Number(wavelength.toFixed(2)),
      nodes,
      antinodes,
      amplitude: h.amplitude,
      quality: Number(quality.toFixed(3)),
    });
  }

  return waves.sort((a, b) => b.quality - a.quality);
}

function computePhaseCoherence(leftReserves: number[], rightReserves: number[]): number {
  const n = Math.min(leftReserves.length, rightReserves.length);
  if (n < 3) return 0;

  let coherentBins = 0;
  for (let i = 1; i < n; i++) {
    const leftDelta = leftReserves[i] - leftReserves[i - 1];
    const rightDelta = rightReserves[i] - rightReserves[i - 1];
    if ((leftDelta >= 0 && rightDelta >= 0) || (leftDelta < 0 && rightDelta < 0)) {
      coherentBins++;
    }
  }

  return Number((coherentBins / (n - 1)).toFixed(4));
}

function classifyResonance(
  symmetryCorr: number,
  spectralEntropy: number,
  phaseCoherence: number,
  dominantPower: number
): "harmonic" | "quasi-harmonic" | "aperiodic" | "chaotic" | "silent" {
  if (dominantPower < 0.01) return "silent";
  if (symmetryCorr > 0.7 && spectralEntropy < 0.5 && phaseCoherence > 0.6) return "harmonic";
  if (symmetryCorr > 0.4 && spectralEntropy < 0.7) return "quasi-harmonic";
  if (spectralEntropy > 0.85) return "chaotic";
  return "aperiodic";
}

function buildAsciiResonanceMap(
  leftReserves: number[],
  rightReserves: number[],
  activeBinReserve: number
): string {
  const n = Math.min(leftReserves.length, rightReserves.length, 20);
  const width = 20;
  const maxR = Math.max(...leftReserves, ...rightReserves, activeBinReserve, 1);

  const lines: string[] = ["RESONANCE MAP (left | active | right — aligned by distance)"];
  lines.push(`${"Dist".padStart(4)} | ${"Left".padStart(width + 6)}  ${"Right".padEnd(width + 6)}`);

  const activeLine = "█".repeat(Math.round((activeBinReserve / maxR) * width));
  lines.push(`  0  | ${activeLine.padStart(width)} ** ${activeLine.padEnd(width)}`);

  for (let i = 0; i < n; i++) {
    const lBar = Math.round((leftReserves[i] / maxR) * width);
    const rBar = Math.round((rightReserves[i] / maxR) * width);
    const match = Math.abs(leftReserves[i] - rightReserves[i]) / Math.max(leftReserves[i], rightReserves[i], 0.01) < 0.3;
    const marker = match ? "==" : "><";
    const leftStr = "█".repeat(Math.max(lBar, 0)).padStart(width);
    const rightStr = "█".repeat(Math.max(rBar, 0)).padEnd(width);
    lines.push(`${String(i + 1).padStart(4)} | ${leftStr} ${marker} ${rightStr} $${fmtUsd(leftReserves[i])} / $${fmtUsd(rightReserves[i])}`);
  }

  return lines.join("\n");
}

function analyzeResonance(bins: BinReserves[], activeBinId: number): ResonanceProfile {
  const populated = bins.filter((b) => b.totalUsd > 0);
  const totalTvl = bins.reduce((s, b) => s + b.totalUsd, 0);
  const activeBin = bins.find((b) => b.binId === activeBinId);
  const activeBinTvl = activeBin?.totalUsd ?? 0;

  const leftBins = bins.filter((b) => b.binId < activeBinId).sort((a, b) => b.binId - a.binId);
  const rightBins = bins.filter((b) => b.binId > activeBinId).sort((a, b) => a.binId - b.binId);

  const leftReserves = leftBins.map((b) => b.totalUsd);
  const rightReserves = rightBins.map((b) => b.totalUsd);

  const symmetryCorrelation = Number(pearsonCorrelation(leftReserves, rightReserves).toFixed(4));
  const phaseCoherence = computePhaseCoherence(leftReserves, rightReserves);

  const combinedSignal = bins.sort((a, b) => a.binId - b.binId).map((b) => b.totalUsd);
  const dominantHarmonics = computeDFT(combinedSignal, 5);
  const spectralEntropy = computeSpectralEntropy(dominantHarmonics);
  const spectralCentroid = computeSpectralCentroid(dominantHarmonics);

  const interferenceZones = detectInterferenceZones(leftReserves, rightReserves, 3);
  const constructiveCount = interferenceZones.filter((z) => z.type === "constructive").length;
  const destructiveCount = interferenceZones.filter((z) => z.type === "destructive").length;
  const netInterference = constructiveCount - destructiveCount;

  const standingWaves = detectStandingWaves(combinedSignal, dominantHarmonics);

  const dominantPower = dominantHarmonics.length > 0 ? dominantHarmonics[0].power : 0;
  const resonanceClass = classifyResonance(symmetryCorrelation, spectralEntropy, phaseCoherence, dominantPower);

  // Composite scoring
  const symmetryScore = Math.max(0, symmetryCorrelation) * 25;
  const coherenceScore = phaseCoherence * 20;
  const spectralScore = (1 - spectralEntropy) * 20;
  const interferenceScore = Math.min(15, constructiveCount * 3);
  const waveScore = standingWaves.length > 0
    ? Math.min(20, standingWaves.reduce((s, w) => s + w.quality * 10, 0))
    : 0;
  const resonanceScore = Math.round(Math.min(100, Math.max(0, symmetryScore + coherenceScore + spectralScore + interferenceScore + waveScore)));

  const asciiResonanceMap = buildAsciiResonanceMap(leftReserves, rightReserves, activeBinTvl);

  return {
    populatedBins: populated.length,
    scannedTvlUsd: totalTvl,
    activeBinTvlUsd: activeBinTvl,
    symmetryCorrelation,
    phaseCoherence,
    dominantHarmonics,
    spectralEntropy,
    spectralCentroid,
    interferenceZones,
    constructiveCount,
    destructiveCount,
    netInterference,
    standingWaves,
    resonanceClass,
    resonanceScore,
    asciiResonanceMap,
  };
}

function generateRecommendation(p: ResonanceProfile): string {
  const parts: string[] = [];

  switch (p.resonanceClass) {
    case "harmonic":
      parts.push("Strong harmonic resonance — buy and sell sides mirror each other closely with clear periodic patterns. LPs are positioning symmetrically around the active price.");
      break;
    case "quasi-harmonic":
      parts.push("Partial harmonic resonance — some symmetric patterns but with notable irregularities. Mixed LP strategies with partial coordination.");
      break;
    case "aperiodic":
      parts.push("Aperiodic reserve distribution — no clear harmonic patterns. Independent LP positioning on each side of the active price.");
      break;
    case "chaotic":
      parts.push("Chaotic reserve distribution — high spectral entropy with no dominant frequency. Many competing LP strategies creating unpredictable depth.");
      break;
    case "silent":
      parts.push("Minimal reserve activity — insufficient liquidity to detect meaningful patterns.");
      break;
  }

  if (p.symmetryCorrelation > 0.7) {
    parts.push(`High left-right symmetry (r=${p.symmetryCorrelation.toFixed(2)}). Slippage is balanced for both buy and sell trades.`);
  } else if (p.symmetryCorrelation < 0.2) {
    parts.push(`Low symmetry (r=${p.symmetryCorrelation.toFixed(2)}). Buy and sell sides have very different depth profiles — slippage will differ significantly by direction.`);
  }

  if (p.constructiveCount > p.destructiveCount) {
    parts.push(`Net constructive interference: ${p.constructiveCount} zones where both sides reinforce depth. Strong bilateral support.`);
  } else if (p.destructiveCount > p.constructiveCount) {
    parts.push(`Net destructive interference: ${p.destructiveCount} zones where one side is thin while the other is deep. Directional vulnerability.`);
  }

  if (p.standingWaves.length > 0 && p.standingWaves[0].quality > 0.3) {
    const w = p.standingWaves[0];
    parts.push(`Standing wave detected: wavelength ${w.wavelength.toFixed(1)} bins, ${w.nodes.length} nodes, ${w.antinodes.length} antinodes. Reserve peaks and troughs recur at regular intervals.`);
  }

  if (p.spectralEntropy > 0.8) {
    parts.push("High spectral entropy — no single frequency dominates. Depth varies unpredictably across bins.");
  } else if (p.spectralEntropy < 0.3 && p.dominantHarmonics.length > 0) {
    parts.push(`Low spectral entropy — dominant frequency ${p.dominantHarmonics[0].frequency} captures ${(p.dominantHarmonics[0].power * 100).toFixed(0)}% of variance. Highly structured distribution.`);
  }

  return parts.join(" ");
}

// -- Commands -----------------------------------------------------------------

async function cmdDoctor() {
  const checks: Record<string, string> = {};
  try {
    const pools = await discoverPools();
    const dlmm = pools.filter((p) => p.poolId != null);
    checks["bitflow_api"] = `ok (${dlmm.length} DLMM pools)`;
  } catch (e: any) {
    checks["bitflow_api"] = `fail: ${e.message}`;
  }
  try {
    const res = await callReadOnly("get-active-bin-id", [cvUint(1)]);
    checks["hiro_api"] = res.result ? "ok" : "fail: empty result";
  } catch (e: any) {
    checks["hiro_api"] = `fail: ${e.message}`;
  }
  console.log(JSON.stringify({ result: "doctor", checks }, null, 2));
}

async function cmdRun(opts: { pool?: string; top?: string }) {
  const allPools = await discoverPools();
  const dlmmPools = allPools
    .filter((p) => p.poolId != null)
    .sort((a, b) => b.tvlUsd - a.tvlUsd);

  let targets: AppPool[];
  if (opts.pool) {
    const pid = parseInt(opts.pool, 10);
    targets = dlmmPools.filter((p) => p.poolId === pid);
    if (targets.length === 0) {
      console.log(JSON.stringify({ error: `Pool ${pid} not found among ${dlmmPools.length} DLMM pools` }));
      return;
    }
  } else {
    const top = parseInt(opts.top ?? "3", 10);
    targets = dlmmPools.slice(0, top);
  }

  const results: ResonanceAnalysis[] = [];
  for (const pool of targets) {
    const poolId = pool.poolId!;
    try {
      const activeBin = pool.activeBinId ?? (await getActiveBin(poolId));
      const bins = await scanBins(poolId, activeBin, pool, BIN_SCAN_RADIUS);
      const profile = analyzeResonance(bins, activeBin);
      const recommendation = generateRecommendation(profile);

      results.push({
        poolId,
        pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
        tvlUsd: pool.tvlUsd,
        volume24hUsd: pool.volume24hUsd,
        feeBps: pool.feeBps ?? 0,
        activeBinId: activeBin,
        binsScanned: bins.length,
        binsPopulated: profile.populatedBins,
        scannedTvlUsd: profile.scannedTvlUsd,
        profile,
        recommendation,
      });
    } catch (e: any) {
      results.push({
        poolId,
        pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
        tvlUsd: pool.tvlUsd,
        volume24hUsd: pool.volume24hUsd,
        feeBps: pool.feeBps ?? 0,
        activeBinId: 0,
        binsScanned: 0,
        binsPopulated: 0,
        scannedTvlUsd: 0,
        profile: {} as ResonanceProfile,
        recommendation: `Error: ${e.message}`,
      });
    }
  }

  const avgScore =
    results.filter((r) => r.profile.resonanceScore != null).length > 0
      ? Math.round(
          results.filter((r) => r.profile.resonanceScore != null).reduce((s, r) => s + r.profile.resonanceScore, 0) /
            results.filter((r) => r.profile.resonanceScore != null).length
        )
      : 0;

  console.log(
    JSON.stringify(
      {
        result: "resonance_analysis",
        data: {
          pools: results,
          summary: { poolsAnalyzed: results.length, avgResonanceScore: avgScore },
        },
      },
      null,
      2
    )
  );
}

async function cmdStatus() {
  const allPools = await discoverPools();
  const dlmmPools = allPools
    .filter((p) => p.poolId != null)
    .sort((a, b) => b.tvlUsd - a.tvlUsd)
    .slice(0, 5);

  const summaries: any[] = [];
  for (const pool of dlmmPools) {
    const poolId = pool.poolId!;
    try {
      const activeBin = pool.activeBinId ?? (await getActiveBin(poolId));
      const bins = await scanBins(poolId, activeBin, pool, BIN_SCAN_RADIUS);
      const profile = analyzeResonance(bins, activeBin);

      summaries.push({
        poolId,
        pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
        tvlUsd: pool.tvlUsd,
        resonanceScore: profile.resonanceScore,
        resonanceClass: profile.resonanceClass,
        symmetryCorrelation: profile.symmetryCorrelation,
        phaseCoherence: profile.phaseCoherence,
        spectralEntropy: profile.spectralEntropy,
        spectralCentroid: profile.spectralCentroid,
        dominantFrequency: profile.dominantHarmonics[0]?.frequency ?? 0,
        dominantPower: profile.dominantHarmonics[0]?.power ?? 0,
        constructiveZones: profile.constructiveCount,
        destructiveZones: profile.destructiveCount,
      });
    } catch (e: any) {
      summaries.push({
        poolId,
        pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
        error: e.message,
      });
    }
  }

  console.log(JSON.stringify({ result: "resonance_status", pools: summaries }, null, 2));
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();
program.name("hodlmm-bin-resonance").description("HODLMM bin reserve resonance analyzer");

program.command("doctor").description("Check API connectivity").action(cmdDoctor);

program
  .command("run")
  .description("Full resonance analysis")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "3")
  .action(cmdRun);

program.command("status").description("Quick resonance summary").action(cmdStatus);

program.parse();
