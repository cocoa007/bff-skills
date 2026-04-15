#!/usr/bin/env bun
/**
 * hodlmm-bin-resonance.ts — Day 125 cocoa007 Bitflow Skills Comp
 *
 * Bin resonance analyzer — detects periodic patterns and harmonic synchronization
 * in DLMM bin reserve distributions. Autocorrelation-based frequency detection,
 * spectral power distribution, quality factor, harmonic alignment risk scoring.
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

interface HarmonicPeak {
  period: number;
  autocorrelation: number;
  spectralPower: number;
  qualityFactor: number;
}

interface ResonanceProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsAnalyzed: number;
  dominantPeriod: number;
  dominantAutocorrelation: number;
  spectralEntropy: number;
  spectralConcentration: number;
  harmonicCount: number;
  harmonics: HarmonicPeak[];
  peakQualityFactor: number;
  harmonicAlignmentScore: number;
  resonanceAmplification: number;
  phaseCoherence: number;
  noiseFloor: number;
  signalToNoise: number;
  resonanceIndex: number;
  resonanceClass: string;
  resonanceRisk: string;
  tvlUsd: number;
  volume24hUsd: number;
}

// --- API helpers ---

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

  return pools.filter(
    (p: AppPool) => (p.tvlUsd ?? 0) >= MIN_TVL_USD && p.poolId != null
  );
}

async function fetchActiveBin(poolId: number): Promise<number> {
  const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-active-bin`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: SENDER,
      arguments: [
        `0x0100000000000000000000000000000${poolId
          .toString(16)
          .padStart(3, "0")}`,
      ],
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
                `0x0100000000000000000000000000000${poolId
                  .toString(16)
                  .padStart(3, "0")}`,
                `0x01000000000000000000000000${binId
                  .toString(16)
                  .padStart(8, "0")}`,
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
            const numEntries = parseInt(
              tupleHex.slice(offset, offset + 2),
              16
            );
            offset += 2;
            for (let e = 0; e < numEntries; e++) {
              const nameLen = parseInt(
                tupleHex.slice(offset, offset + 2),
                16
              );
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

// --- Math helpers ---

function round(n: number, decimals = 4): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

// --- Spectral analysis ---

function buildFullSpectrum(
  bins: BinReserves[],
  activeBin: number
): number[] {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  if (sorted.length === 0) return [];
  const minBin = sorted[0].binId;
  const maxBin = sorted[sorted.length - 1].binId;
  const spectrum: number[] = [];
  const binMap = new Map(sorted.map((b) => [b.binId, b.totalUsd]));
  for (let id = minBin; id <= maxBin; id++) {
    spectrum.push(binMap.get(id) ?? 0);
  }
  return spectrum;
}

function normalizeSignal(signal: number[]): number[] {
  const m = mean(signal);
  const s = stddev(signal);
  if (s === 0) return signal.map(() => 0);
  return signal.map((v) => (v - m) / s);
}

function autocorrelation(signal: number[], lag: number): number {
  const n = signal.length;
  if (lag >= n) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n - lag; i++) {
    sum += signal[i] * signal[i + lag];
    count++;
  }
  return count > 0 ? sum / count : 0;
}

function computeAutocorrelationSpectrum(
  signal: number[],
  maxLag: number
): number[] {
  const normalized = normalizeSignal(signal);
  const acf: number[] = [];
  for (let lag = 1; lag <= maxLag; lag++) {
    acf.push(autocorrelation(normalized, lag));
  }
  return acf;
}

function findHarmonicPeaks(
  acf: number[],
  threshold: number = 0.15
): HarmonicPeak[] {
  const peaks: HarmonicPeak[] = [];

  for (let i = 1; i < acf.length - 1; i++) {
    if (acf[i] > acf[i - 1] && acf[i] > (acf[i + 1] ?? 0) && acf[i] > threshold) {
      const period = i + 1;
      const ac = acf[i];

      const leftWidth = i > 0 ? ac - acf[i - 1] : ac;
      const rightWidth = i < acf.length - 1 ? ac - acf[i + 1] : ac;
      const avgWidth = (leftWidth + rightWidth) / 2;
      const qualityFactor = avgWidth > 0 ? ac / avgWidth : 1;

      peaks.push({
        period,
        autocorrelation: round(ac, 4),
        spectralPower: round(ac * ac, 4),
        qualityFactor: round(Math.min(qualityFactor, 20), 2),
      });
    }
  }

  return peaks.sort((a, b) => b.autocorrelation - a.autocorrelation);
}

function computeSpectralEntropy(acf: number[]): number {
  const powers = acf.map((v) => v * v);
  const totalPower = powers.reduce((s, v) => s + v, 0);
  if (totalPower === 0) return 1;

  const probs = powers.map((p) => p / totalPower);
  let entropy = 0;
  for (const p of probs) {
    if (p > 0) entropy -= p * Math.log2(p);
  }

  const maxEntropy = Math.log2(probs.length);
  return maxEntropy > 0 ? round(entropy / maxEntropy, 4) : 1;
}

function computeSpectralConcentration(acf: number[], topN: number = 3): number {
  const powers = acf.map((v) => v * v);
  const totalPower = powers.reduce((s, v) => s + v, 0);
  if (totalPower === 0) return 0;

  const sorted = [...powers].sort((a, b) => b - a);
  const topPower = sorted.slice(0, topN).reduce((s, v) => s + v, 0);
  return round(topPower / totalPower, 4);
}

function computeHarmonicAlignment(peaks: HarmonicPeak[]): number {
  if (peaks.length < 2) return 0;

  const dominant = peaks[0].period;
  let alignmentScore = 0;
  let checked = 0;

  for (let i = 1; i < peaks.length; i++) {
    const ratio = peaks[i].period / dominant;
    const nearestHarmonic = Math.round(ratio);
    if (nearestHarmonic > 0) {
      const deviation = Math.abs(ratio - nearestHarmonic) / nearestHarmonic;
      const alignment = Math.max(0, 1 - deviation * 5);
      alignmentScore += alignment * peaks[i].autocorrelation;
      checked++;
    }
  }

  return checked > 0 ? round(alignmentScore / checked, 4) : 0;
}

function computeResonanceAmplification(
  signal: number[],
  peaks: HarmonicPeak[]
): number {
  if (peaks.length === 0 || signal.length === 0) return 1;

  const m = mean(signal);
  if (m === 0) return 1;

  const dominant = peaks[0];
  let peakSum = 0;
  let peakCount = 0;
  for (let i = 0; i < signal.length; i++) {
    if ((i + 1) % dominant.period === 0) {
      peakSum += signal[i];
      peakCount++;
    }
  }

  if (peakCount === 0) return 1;
  const peakMean = peakSum / peakCount;
  return round(Math.max(peakMean / m, 0.1), 4);
}

function computePhaseCoherence(
  signal: number[],
  period: number
): number {
  if (period <= 0 || signal.length < period * 2) return 0;

  const phases: number[][] = [];
  for (let start = 0; start < period; start++) {
    const phase: number[] = [];
    for (let i = start; i < signal.length; i += period) {
      phase.push(signal[i]);
    }
    phases.push(phase);
  }

  const correlations: number[] = [];
  for (const phase of phases) {
    if (phase.length < 2) continue;
    const m = mean(phase);
    const s = stddev(phase);
    correlations.push(s > 0 ? 1 - Math.min(s / (Math.abs(m) + 0.001), 1) : 1);
  }

  return correlations.length > 0 ? round(mean(correlations), 4) : 0;
}

function computeNoiseFloor(acf: number[]): number {
  if (acf.length < 5) return 0;
  const sorted = [...acf.map(Math.abs)].sort((a, b) => a - b);
  const lower50 = sorted.slice(0, Math.ceil(sorted.length / 2));
  return round(mean(lower50), 4);
}

// --- Composite scoring ---

function computeResonanceIndex(
  dominantAcf: number,
  spectralConcentration: number,
  harmonicAlignment: number,
  phaseCoherence: number,
  signalToNoise: number
): number {
  const acfScore = Math.min(dominantAcf * 35, 25);
  const concScore = Math.min(spectralConcentration * 30, 25);
  const alignScore = Math.min(harmonicAlignment * 25, 20);
  const phaseScore = Math.min(phaseCoherence * 20, 15);
  const snrScore = Math.min(signalToNoise * 5, 15);

  return Math.round(Math.min(acfScore + concScore + alignScore + phaseScore + snrScore, 100));
}

function classifyResonance(index: number): string {
  if (index < 15) return "APERIODIC";
  if (index < 35) return "WEAKLY_PERIODIC";
  if (index < 60) return "RESONANT";
  return "STRONGLY_RESONANT";
}

function classifyRisk(index: number, amplification: number): string {
  if (index < 15) return "NONE";
  if (index < 35 && amplification < 1.5) return "LOW";
  if (index < 60 && amplification < 2.0) return "MODERATE";
  if (amplification >= 2.0) return "HIGH";
  return "MODERATE";
}

// --- Core analysis ---

function analyzeResonance(
  bins: BinReserves[],
  activeBin: number,
  pool: AppPool
): ResonanceProfile {
  const pair = `${pool.token0Symbol}/${pool.token1Symbol}`;
  const poolId = pool.poolId!;

  const spectrum = buildFullSpectrum(bins, activeBin);
  const maxLag = Math.min(Math.floor(spectrum.length / 2), 20);
  const acf = computeAutocorrelationSpectrum(spectrum, maxLag);

  const peaks = findHarmonicPeaks(acf, 0.1);
  const dominantPeriod = peaks.length > 0 ? peaks[0].period : 0;
  const dominantAcf = peaks.length > 0 ? peaks[0].autocorrelation : 0;

  const spectralEntropy = computeSpectralEntropy(acf);
  const spectralConcentration = computeSpectralConcentration(acf);
  const harmonicAlignment = computeHarmonicAlignment(peaks);
  const amplification = computeResonanceAmplification(spectrum, peaks);
  const phaseCoherence = dominantPeriod > 0
    ? computePhaseCoherence(spectrum, dominantPeriod)
    : 0;
  const noiseFloor = computeNoiseFloor(acf);
  const signalToNoise = noiseFloor > 0 ? round(dominantAcf / noiseFloor, 2) : dominantAcf > 0 ? 10 : 0;
  const peakQF = peaks.length > 0 ? Math.max(...peaks.map((p) => p.qualityFactor)) : 0;

  const resonanceIndex = computeResonanceIndex(
    dominantAcf,
    spectralConcentration,
    harmonicAlignment,
    phaseCoherence,
    signalToNoise
  );

  const resonanceClass = classifyResonance(resonanceIndex);
  const resonanceRisk = classifyRisk(resonanceIndex, amplification);

  return {
    pair,
    poolId,
    activeBin,
    binsAnalyzed: bins.length,
    dominantPeriod,
    dominantAutocorrelation: round(dominantAcf, 4),
    spectralEntropy,
    spectralConcentration,
    harmonicCount: peaks.length,
    harmonics: peaks.slice(0, 5),
    peakQualityFactor: peakQF,
    harmonicAlignmentScore: harmonicAlignment,
    resonanceAmplification: amplification,
    phaseCoherence,
    noiseFloor,
    signalToNoise,
    resonanceIndex,
    resonanceClass,
    resonanceRisk,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
  };
}

// --- CLI ---

const program = new Command();
program
  .name("hodlmm-bin-resonance")
  .description("HODLMM bin resonance analyzer — Day 125 cocoa007")
  .version("1.0.0");

// -- doctor --

program
  .command("doctor")
  .description("Check API connectivity and environment")
  .action(async () => {
    const checks: { name: string; ok: boolean; detail: string }[] = [];

    checks.push({
      name: "bun-runtime",
      ok: typeof Bun !== "undefined",
      detail: typeof Bun !== "undefined" ? `v${Bun.version}` : "not Bun",
    });

    try {
      const r = await fetch(`${BFF_APP_BASE}/pools`, { method: "GET" });
      checks.push({ name: "bff-pools", ok: r.ok, detail: `HTTP ${r.status}` });
    } catch (e: any) {
      checks.push({ name: "bff-pools", ok: false, detail: e.message });
    }

    try {
      const r = await fetch(`${HIRO_API}/v2/info`, { method: "GET" });
      checks.push({ name: "hiro-api", ok: r.ok, detail: `HTTP ${r.status}` });
    } catch (e: any) {
      checks.push({ name: "hiro-api", ok: false, detail: e.message });
    }

    const allOk = checks.every((c) => c.ok);
    console.log(
      JSON.stringify({ result: allOk ? "success" : "degraded", checks })
    );

    console.error("\n  HODLMM Bin Resonance — Doctor\n");
    for (const c of checks) {
      const icon = c.ok ? "[OK]" : "[FAIL]";
      console.error(`  ${icon} ${c.name.padEnd(16)} ${c.detail}`);
    }
    console.error("");
  });

// -- status --

program
  .command("status")
  .description("List available HODLMM pools above TVL threshold")
  .action(async () => {
    try {
      const pools = await fetchPools();
      const sorted = pools.sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, 20);
      console.log(
        JSON.stringify({
          result: "success",
          poolCount: pools.length,
          pools: sorted.map((p) => ({
            poolId: p.poolId,
            pair: `${p.token0Symbol}/${p.token1Symbol}`,
            tvlUsd: p.tvlUsd,
            volume24hUsd: p.volume24hUsd,
          })),
        })
      );

      console.error("\n  HODLMM Pools (TVL >= $1000)\n");
      console.error(
        "  " +
          "Pool".padEnd(6) +
          "Pair".padEnd(18) +
          "TVL ($)".padStart(14) +
          "Vol 24h ($)".padStart(14)
      );
      console.error("  " + "-".repeat(52));
      for (const p of sorted) {
        console.error(
          "  " +
            String(p.poolId).padEnd(6) +
            `${p.token0Symbol}/${p.token1Symbol}`.padEnd(18) +
            p.tvlUsd.toFixed(0).padStart(14) +
            p.volume24hUsd.toFixed(0).padStart(14)
        );
      }
      console.error(`\n  Total: ${pools.length} pools\n`);
    } catch (e: any) {
      console.log(JSON.stringify({ error: e.message }));
    }
  });

// -- run --

program
  .command("run")
  .description("Run resonance analysis on HODLMM pools")
  .option("--pool <id>", "Analyze a specific pool by numeric ID")
  .option("--top <n>", "Number of top pools to analyze", "5")
  .action(async (opts) => {
    try {
      const pools = await fetchPools();
      let targets: AppPool[];

      if (opts.pool) {
        const pid = parseInt(opts.pool, 10);
        const match = pools.find((p) => p.poolId === pid);
        if (!match) {
          console.log(JSON.stringify({ error: `Pool #${pid} not found` }));
          return;
        }
        targets = [match];
      } else {
        const topN = parseInt(opts.top, 10) || 5;
        targets = pools.sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, topN);
      }

      const profiles: ResonanceProfile[] = [];

      for (const pool of targets) {
        try {
          const activeBin = await fetchActiveBin(pool.poolId!);
          const bins = await fetchBinReserves(pool.poolId!, activeBin, pool);
          if (bins.length < MIN_POPULATED_BINS) {
            console.error(
              `  [SKIP] Pool ${pool.poolId} (${pool.token0Symbol}/${pool.token1Symbol}): only ${bins.length} populated bins`
            );
            continue;
          }
          const profile = analyzeResonance(bins, activeBin, pool);
          profiles.push(profile);
        } catch (e: any) {
          console.error(
            `  [ERR] Pool ${pool.poolId} (${pool.token0Symbol}/${pool.token1Symbol}): ${e.message}`
          );
        }
      }

      const avgIdx =
        profiles.length > 0
          ? round(mean(profiles.map((p) => p.resonanceIndex)), 1)
          : 0;
      const classCounts = {
        aperiodicCount: profiles.filter((p) => p.resonanceClass === "APERIODIC").length,
        weaklyPeriodicCount: profiles.filter((p) => p.resonanceClass === "WEAKLY_PERIODIC").length,
        resonantCount: profiles.filter((p) => p.resonanceClass === "RESONANT").length,
        stronglyResonantCount: profiles.filter((p) => p.resonanceClass === "STRONGLY_RESONANT").length,
      };
      const riskCounts = {
        noneCount: profiles.filter((p) => p.resonanceRisk === "NONE").length,
        lowCount: profiles.filter((p) => p.resonanceRisk === "LOW").length,
        moderateCount: profiles.filter((p) => p.resonanceRisk === "MODERATE").length,
        highCount: profiles.filter((p) => p.resonanceRisk === "HIGH").length,
      };

      const output = {
        result: "success",
        summary: {
          poolsAnalyzed: profiles.length,
          avgResonanceIndex: avgIdx,
          ...classCounts,
          ...riskCounts,
          avgDominantPeriod: round(mean(profiles.map((p) => p.dominantPeriod)), 1),
          avgAmplification: round(mean(profiles.map((p) => p.resonanceAmplification)), 2),
          avgSignalToNoise: round(mean(profiles.map((p) => p.signalToNoise)), 2),
        },
        profiles: profiles.map((p) => ({
          pair: p.pair,
          poolId: p.poolId,
          resonanceIndex: p.resonanceIndex,
          resonanceClass: p.resonanceClass,
          resonanceRisk: p.resonanceRisk,
          dominantPeriod: p.dominantPeriod,
          dominantAutocorrelation: p.dominantAutocorrelation,
          spectralConcentration: p.spectralConcentration,
          harmonicCount: p.harmonicCount,
          peakQualityFactor: p.peakQualityFactor,
          harmonicAlignmentScore: p.harmonicAlignmentScore,
          resonanceAmplification: p.resonanceAmplification,
          phaseCoherence: p.phaseCoherence,
          signalToNoise: p.signalToNoise,
          tvlUsd: p.tvlUsd,
        })),
      };

      console.log(JSON.stringify(output));

      console.error("\n  HODLMM Bin Resonance Analysis\n");
      console.error(
        "  " +
          "Pool".padEnd(6) +
          "Pair".padEnd(16) +
          "Idx".padStart(5) +
          "Class".padStart(20) +
          "Risk".padStart(10) +
          "Period".padStart(8) +
          "ACF".padStart(7) +
          "S-Conc".padStart(8) +
          "Align".padStart(7) +
          "Amp".padStart(7) +
          "SNR".padStart(7)
      );
      console.error("  " + "-".repeat(101));
      for (const p of profiles) {
        console.error(
          "  " +
            String(p.poolId).padEnd(6) +
            p.pair.padEnd(16) +
            String(p.resonanceIndex).padStart(5) +
            p.resonanceClass.padStart(20) +
            p.resonanceRisk.padStart(10) +
            String(p.dominantPeriod).padStart(8) +
            p.dominantAutocorrelation.toFixed(3).padStart(7) +
            p.spectralConcentration.toFixed(3).padStart(8) +
            p.harmonicAlignmentScore.toFixed(3).padStart(7) +
            p.resonanceAmplification.toFixed(2).padStart(7) +
            p.signalToNoise.toFixed(1).padStart(7)
        );
      }

      console.error("\n  Harmonic Detail\n");
      for (const p of profiles) {
        if (p.harmonics.length === 0) continue;
        console.error(`  Pool ${p.poolId} (${p.pair}):`);
        for (const h of p.harmonics) {
          console.error(
            `    Period ${String(h.period).padStart(3)} | ACF ${h.autocorrelation.toFixed(3)} | Power ${h.spectralPower.toFixed(4)} | Q ${h.qualityFactor.toFixed(1)}`
          );
        }
      }

      console.error(
        `\n  Summary: ${profiles.length} pools | avg resonance ${avgIdx} | ` +
          `${classCounts.aperiodicCount} aperiodic, ` +
          `${classCounts.weaklyPeriodicCount} weak, ` +
          `${classCounts.resonantCount} resonant, ` +
          `${classCounts.stronglyResonantCount} strong | ` +
          `risk: ${riskCounts.noneCount}N/${riskCounts.lowCount}L/${riskCounts.moderateCount}M/${riskCounts.highCount}H\n`
      );
    } catch (e: any) {
      console.log(JSON.stringify({ error: e.message }));
    }
  });

program.parse();
