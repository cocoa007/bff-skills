#!/usr/bin/env bun
/**
 * hodlmm-bin-oscillation.ts
 *
 * HODLMM Bin Oscillation Detector — Analyzes periodic patterns in bin reserve
 * distributions to detect cyclical behavior: regular rebalancing, arbitrage
 * sweeps, market-maker pulsing, and natural price oscillation signatures.
 *
 * Metrics:
 *  1. Reserve alternation: X-dominant / Y-dominant bin pattern detection
 *  2. Amplitude profiling: magnitude of reserve swings across bins
 *  3. Frequency estimation: how often the distribution oscillates
 *  4. Phase coherence: whether oscillations are correlated or random
 *  5. Damping analysis: whether oscillations grow or decay from active bin
 *  6. Oscillation score (0-100): composite cyclicality metric
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 92).
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 25;

type OscClass = "RHYTHMIC" | "PULSING" | "IRREGULAR" | "FLAT" | "CHAOTIC";
type DampingType = "GROWING" | "STEADY" | "DECAYING" | "NONE";

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
  skew: number; // -1 (all Y) to +1 (all X)
}

interface OscillationPeak {
  binId: number;
  offset: number;
  skew: number;
  amplitude: number;
  type: "CREST" | "TROUGH";
}

interface OscillationCycle {
  startBin: number;
  endBin: number;
  wavelength: number;
  amplitude: number;
  crests: number;
  troughs: number;
}

interface DampingProfile {
  type: DampingType;
  rate: number;
  innerAmplitude: number;
  outerAmplitude: number;
  description: string;
}

interface OscProfile {
  totalBins: number;
  populatedBins: number;
  peaks: OscillationPeak[];
  cycles: OscillationCycle[];
  avgWavelength: number;
  avgAmplitude: number;
  maxAmplitude: number;
  peakCount: number;
  troughCount: number;
  frequency: number;
  phaseCoherence: number;
  damping: DampingProfile;
  skewTrend: number;
  oscScore: number;
  oscClass: OscClass;
}

interface OscAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  profile: OscProfile;
  asciiWave: string;
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
  const pools: any[] = data.results ?? data.pools ?? data ?? [];
  return pools
    .filter((p: any) => {
      const tvl = Number(p.tvlUsd ?? p.tvl ?? 0);
      return tvl >= MIN_TVL_USD && p.poolId != null;
    })
    .map((p: any) => ({
      id: p.id ?? `${p.token0Symbol}-${p.token1Symbol}`,
      token0Symbol: p.token0Symbol ?? "?",
      token1Symbol: p.token1Symbol ?? "?",
      tvlUsd: Number(p.tvlUsd ?? p.tvl ?? 0),
      volume24hUsd: Number(p.volume24hUsd ?? p.volume24h ?? 0),
      poolId: Number(p.poolId),
      token0Decimals: Number(p.token0Decimals ?? 8),
      token1Decimals: Number(p.token1Decimals ?? 6),
      token0PriceUsd: Number(p.token0PriceUsd ?? 0),
      token1PriceUsd: Number(p.token1PriceUsd ?? 0),
      activeBinId: p.activeBinId != null ? Number(p.activeBinId) : undefined,
      feeBps: p.feeBps != null ? Number(p.feeBps) : undefined,
    }));
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

  let skew = 0;
  if (totalUsd > 0.01) {
    skew = (rxUsd - ryUsd) / totalUsd; // -1 to +1
  }

  return {
    binId,
    reserveX: rx,
    reserveY: ry,
    reserveXUsd: rxUsd,
    reserveYUsd: ryUsd,
    totalUsd,
    skew,
  };
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

// -- Oscillation analysis -----------------------------------------------------

function detectPeaks(bins: BinReserves[], activeBinId: number): OscillationPeak[] {
  const peaks: OscillationPeak[] = [];
  const populated = bins.filter(b => b.totalUsd > 0.01);
  if (populated.length < 3) return peaks;

  for (let i = 1; i < populated.length - 1; i++) {
    const prev = populated[i - 1];
    const curr = populated[i];
    const next = populated[i + 1];

    if (curr.skew > prev.skew && curr.skew > next.skew && curr.skew > 0.1) {
      peaks.push({
        binId: curr.binId,
        offset: curr.binId - activeBinId,
        skew: Math.round(curr.skew * 1000) / 1000,
        amplitude: Math.round(Math.abs(curr.skew - Math.min(prev.skew, next.skew)) * 1000) / 1000,
        type: "CREST",
      });
    }

    if (curr.skew < prev.skew && curr.skew < next.skew && curr.skew < -0.1) {
      peaks.push({
        binId: curr.binId,
        offset: curr.binId - activeBinId,
        skew: Math.round(curr.skew * 1000) / 1000,
        amplitude: Math.round(Math.abs(curr.skew - Math.max(prev.skew, next.skew)) * 1000) / 1000,
        type: "TROUGH",
      });
    }
  }

  return peaks;
}

function detectCycles(peaks: OscillationPeak[]): OscillationCycle[] {
  const cycles: OscillationCycle[] = [];
  if (peaks.length < 2) return cycles;

  const crests = peaks.filter(p => p.type === "CREST");

  for (let i = 0; i < crests.length - 1; i++) {
    const start = crests[i];
    const end = crests[i + 1];
    const wavelength = end.binId - start.binId;
    const amplitude = (start.amplitude + end.amplitude) / 2;

    const troughsBetween = peaks.filter(
      p => p.type === "TROUGH" && p.binId > start.binId && p.binId < end.binId
    );

    cycles.push({
      startBin: start.binId,
      endBin: end.binId,
      wavelength,
      amplitude: Math.round(amplitude * 1000) / 1000,
      crests: 2,
      troughs: troughsBetween.length,
    });
  }

  return cycles;
}

function computePhaseCoherence(cycles: OscillationCycle[]): number {
  if (cycles.length < 2) return 0;

  const wavelengths = cycles.map(c => c.wavelength);
  const avgWL = wavelengths.reduce((s, w) => s + w, 0) / wavelengths.length;
  if (avgWL === 0) return 0;

  const variance = wavelengths.reduce((s, w) => s + (w - avgWL) ** 2, 0) / wavelengths.length;
  const cv = Math.sqrt(variance) / avgWL;

  return Math.max(0, Math.min(100, Math.round((1 - Math.min(cv, 1)) * 100)));
}

function analyzeDamping(
  peaks: OscillationPeak[],
  activeBinId: number
): DampingProfile {
  if (peaks.length < 4) {
    return { type: "NONE", rate: 0, innerAmplitude: 0, outerAmplitude: 0, description: "Insufficient peaks for damping analysis" };
  }

  const sorted = [...peaks].sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset));
  const half = Math.floor(sorted.length / 2);
  const inner = sorted.slice(0, half);
  const outer = sorted.slice(half);

  const innerAvg = inner.reduce((s, p) => s + p.amplitude, 0) / inner.length;
  const outerAvg = outer.reduce((s, p) => s + p.amplitude, 0) / outer.length;

  const ratio = innerAvg > 0 ? outerAvg / innerAvg : 1;

  let type: DampingType;
  let description: string;

  if (ratio > 1.3) {
    type = "GROWING";
    description = "Oscillations amplify away from active bin — unstable distribution, possible divergence risk";
  } else if (ratio < 0.7) {
    type = "DECAYING";
    description = "Oscillations dampen away from active bin — healthy, naturally stabilizing distribution";
  } else {
    type = "STEADY";
    description = "Consistent oscillation amplitude across range — sustained periodic activity";
  }

  return {
    type,
    rate: Math.round((ratio - 1) * 100) / 100,
    innerAmplitude: Math.round(innerAvg * 1000) / 1000,
    outerAmplitude: Math.round(outerAvg * 1000) / 1000,
    description,
  };
}

function computeSkewTrend(bins: BinReserves[]): number {
  const populated = bins.filter(b => b.totalUsd > 0.01);
  if (populated.length < 3) return 0;

  let sumXY = 0, sumX = 0, sumY = 0, sumX2 = 0;
  const n = populated.length;

  for (let i = 0; i < n; i++) {
    sumXY += i * populated[i].skew;
    sumX += i;
    sumY += populated[i].skew;
    sumX2 += i * i;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  return Math.round(slope * 1000) / 1000;
}

function buildOscProfile(
  bins: BinReserves[],
  activeBinId: number
): OscProfile {
  const populated = bins.filter(b => b.totalUsd > 0.01);
  const peaks = detectPeaks(bins, activeBinId);
  const cycles = detectCycles(peaks);
  const coherence = computePhaseCoherence(cycles);
  const damping = analyzeDamping(peaks, activeBinId);
  const skewTrend = computeSkewTrend(bins);

  const crests = peaks.filter(p => p.type === "CREST");
  const troughs = peaks.filter(p => p.type === "TROUGH");

  const avgWavelength = cycles.length > 0
    ? Math.round(cycles.reduce((s, c) => s + c.wavelength, 0) / cycles.length * 10) / 10
    : 0;

  const allAmplitudes = peaks.map(p => p.amplitude);
  const avgAmplitude = allAmplitudes.length > 0
    ? Math.round(allAmplitudes.reduce((s, a) => s + a, 0) / allAmplitudes.length * 1000) / 1000
    : 0;
  const maxAmplitude = allAmplitudes.length > 0
    ? Math.round(Math.max(...allAmplitudes) * 1000) / 1000
    : 0;

  const frequency = populated.length > 0 && peaks.length > 0
    ? Math.round((peaks.length / populated.length) * 100) / 100
    : 0;

  // Composite score
  const peakDensity = Math.min(peaks.length / 4, 1) * 25; // up to 25 for having peaks
  const coherenceComponent = coherence * 0.25; // up to 25 for regular spacing
  const amplitudeComponent = Math.min(avgAmplitude / 0.5, 1) * 25; // up to 25 for strong swings
  const cycleComponent = Math.min(cycles.length / 3, 1) * 25; // up to 25 for complete cycles

  const rawScore = peakDensity + coherenceComponent + amplitudeComponent + cycleComponent;
  const oscScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  let oscClass: OscClass;
  if (oscScore >= 75 && coherence >= 60) oscClass = "RHYTHMIC";
  else if (oscScore >= 50) oscClass = "PULSING";
  else if (oscScore >= 30 && peaks.length >= 3) oscClass = "IRREGULAR";
  else if (peaks.length <= 1) oscClass = "FLAT";
  else oscClass = "CHAOTIC";

  return {
    totalBins: bins.length,
    populatedBins: populated.length,
    peaks,
    cycles,
    avgWavelength,
    avgAmplitude,
    maxAmplitude,
    peakCount: crests.length,
    troughCount: troughs.length,
    frequency,
    phaseCoherence: coherence,
    damping,
    skewTrend,
    oscScore,
    oscClass,
  };
}

function buildAsciiWave(bins: BinReserves[], peaks: OscillationPeak[], activeBinId: number): string {
  const populated = bins.filter(b => b.totalUsd > 0.01);
  if (populated.length === 0) return "(no populated bins)";

  const width = 40;
  const lines: string[] = ["OSCILLATION WAVE MAP", ""];
  lines.push(`${"".padStart(6)}${"-1.0".padStart(5)}${"0".padStart(width / 2 - 2)}${"+1.0".padStart(width / 2 + 1)}`);
  lines.push(`${"".padStart(6)}${"<-- Y-dom".padStart(12)}${"X-dom -->".padStart(width - 6)}`);
  lines.push("");

  const peakMap = new Map<number, OscillationPeak>();
  for (const p of peaks) peakMap.set(p.binId, p);

  for (const bin of populated) {
    const offset = bin.binId - activeBinId;
    const center = Math.floor(width / 2);
    const pos = Math.round(center + bin.skew * center);
    const clampedPos = Math.max(0, Math.min(width - 1, pos));

    const peak = peakMap.get(bin.binId);
    let marker = "·";
    if (bin.binId === activeBinId) marker = "*";
    else if (peak?.type === "CREST") marker = "^";
    else if (peak?.type === "TROUGH") marker = "v";

    const line = " ".repeat(clampedPos) + marker;
    const label = `${offset >= 0 ? "+" : ""}${offset}`;
    const peakTag = peak ? ` [${peak.type}]` : "";
    lines.push(`${label.padStart(4)}  |${line.padEnd(width)}| ${bin.skew >= 0 ? "+" : ""}${bin.skew.toFixed(2)}${peakTag}`);
  }

  lines.push("");
  lines.push("* = active  ^ = crest (X-heavy)  v = trough (Y-heavy)");
  lines.push("Skew: -1.0 = all token-Y, +1.0 = all token-X");
  return lines.join("\n");
}

function buildRecommendation(pair: string, profile: OscProfile): string {
  const parts: string[] = [];

  parts.push(
    `${pair} oscillation: ${profile.oscClass} (score ${profile.oscScore}/100), ` +
    `${profile.peakCount} crests, ${profile.troughCount} troughs across ${profile.populatedBins} bins.`
  );

  if (profile.cycles.length > 0) {
    parts.push(
      `Detected ${profile.cycles.length} complete cycle(s), avg wavelength ${profile.avgWavelength} bins, ` +
      `avg amplitude ${profile.avgAmplitude}, phase coherence ${profile.phaseCoherence}/100.`
    );
  } else {
    parts.push("No complete oscillation cycles detected.");
  }

  parts.push(`Damping: ${profile.damping.type} — ${profile.damping.description}.`);

  if (profile.skewTrend > 0.02) {
    parts.push(`Skew trending toward token-X dominance across bins (slope +${profile.skewTrend}).`);
  } else if (profile.skewTrend < -0.02) {
    parts.push(`Skew trending toward token-Y dominance across bins (slope ${profile.skewTrend}).`);
  }

  if (profile.oscClass === "RHYTHMIC") {
    parts.push("Highly regular oscillation suggests active market-making or periodic rebalancing. LPs can time entries at troughs for X exposure or crests for Y exposure.");
  } else if (profile.oscClass === "PULSING") {
    parts.push("Moderate oscillation — some periodic structure. Consider wider ranges to capture both sides of the swing.");
  } else if (profile.oscClass === "IRREGULAR") {
    parts.push("Irregular oscillation — no consistent pattern. Reserve skew shifts unpredictably between bins.");
  } else if (profile.oscClass === "FLAT") {
    parts.push("Minimal oscillation — reserves are consistently balanced or one-sided. Low complexity distribution.");
  } else {
    parts.push("Chaotic skew pattern — high-frequency noise without structure. Avoid narrow ranges near volatile bins.");
  }

  if (profile.damping.type === "GROWING") {
    parts.push("WARNING: Growing oscillations at range edges indicate potential instability — outer bins may experience extreme skew.");
  }

  if (profile.maxAmplitude > 0.8) {
    parts.push(`WARNING: Extreme skew swing detected (amplitude ${profile.maxAmplitude}) — some bins flip between near-100% X and Y reserves.`);
  }

  return parts.join(" ");
}

// -- Main analysis ------------------------------------------------------------

async function analyzeOscillation(pool: AppPool): Promise<OscAnalysis> {
  const poolId = pool.poolId!;
  const activeBinId = pool.activeBinId ?? await getActiveBin(poolId);
  const rawBins = await scanBins(poolId, activeBinId, pool, BIN_SCAN_RADIUS);

  const populated = rawBins.filter(b => b.totalUsd > 0.01);
  const scannedTvl = populated.reduce((s, b) => s + b.totalUsd, 0);

  const profile = buildOscProfile(rawBins, activeBinId);
  const asciiWave = buildAsciiWave(rawBins, profile.peaks, activeBinId);
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
    asciiWave,
    recommendation,
  };
}

function makeErrorResult(pool: AppPool, errMsg: string): OscAnalysis {
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
      totalBins: 0, populatedBins: 0, peaks: [], cycles: [],
      avgWavelength: 0, avgAmplitude: 0, maxAmplitude: 0,
      peakCount: 0, troughCount: 0, frequency: 0, phaseCoherence: 0,
      damping: { type: "NONE", rate: 0, innerAmplitude: 0, outerAmplitude: 0, description: "N/A" },
      skewTrend: 0, oscScore: 0, oscClass: "FLAT",
    },
    asciiWave: "",
    recommendation: `Analysis failed: ${errMsg}`,
  };
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();

program
  .name("hodlmm-bin-oscillation")
  .description("HODLMM Bin Oscillation Detector — analyzes periodic reserve skew patterns");

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
        },
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Doctor failed: ${err.message}` }));
    }
  });

program
  .command("run")
  .description("Analyze bin oscillation patterns for HODLMM pools")
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

      const results: OscAnalysis[] = [];
      for (const pool of targets) {
        try {
          const analysis = await analyzeOscillation(pool);
          results.push(analysis);
        } catch (err: any) {
          results.push(makeErrorResult(pool, err.message));
        }
      }

      const summary = {
        poolsAnalyzed: results.length,
        mostRhythmic: results.reduce((best, r) =>
          r.profile.oscScore > best.profile.oscScore ? r : best, results[0]),
        leastRhythmic: results.reduce((worst, r) =>
          r.profile.oscScore < worst.profile.oscScore ? r : worst, results[0]),
        avgOscScore: Math.round(
          results.reduce((s, r) => s + r.profile.oscScore, 0) / results.length
        ),
        totalCrests: results.reduce((s, r) => s + r.profile.peakCount, 0),
        totalTroughs: results.reduce((s, r) => s + r.profile.troughCount, 0),
        totalCycles: results.reduce((s, r) => s + r.profile.cycles.length, 0),
        avgCoherence: Math.round(
          results.reduce((s, r) => s + r.profile.phaseCoherence, 0) / results.length
        ),
      };

      console.log(JSON.stringify({
        result: "oscillation_analysis",
        data: { pools: results, summary },
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Run failed: ${err.message}` }));
    }
  });

program
  .command("status")
  .description("Quick oscillation summary for top pools")
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
          const analysis = await analyzeOscillation(pool);
          summaries.push({
            pair: analysis.pair,
            poolId: analysis.poolId,
            tvlUsd: analysis.tvlUsd,
            oscScore: analysis.profile.oscScore,
            oscClass: analysis.profile.oscClass,
            crests: analysis.profile.peakCount,
            troughs: analysis.profile.troughCount,
            cycles: analysis.profile.cycles.length,
            avgWavelength: analysis.profile.avgWavelength,
            avgAmplitude: analysis.profile.avgAmplitude,
            coherence: analysis.profile.phaseCoherence,
            damping: analysis.profile.damping.type,
            skewTrend: analysis.profile.skewTrend,
          });
        } catch {
          summaries.push({
            pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
            poolId: pool.poolId,
            tvlUsd: pool.tvlUsd,
            oscScore: -1,
          });
        }
      }

      console.log(JSON.stringify({ result: "oscillation_status", data: summaries }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Status failed: ${err.message}` }));
    }
  });

program.parse();
