#!/usr/bin/env bun
/**
 * hodlmm-bin-soliton.ts — Day 126 cocoa007 Bitflow Skills Comp
 *
 * Bin soliton analyzer — detects stable, self-reinforcing liquidity peaks
 * in DLMM bin reserve distributions. Soliton shape fitting, isolation scoring,
 * collision proximity, amplitude/width characterization, stability classification.
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

interface DetectedSoliton {
  peakBin: number;
  amplitude: number;
  width: number;
  shapeFidelity: number;
  energy: number;
  isolationDistance: number;
  peakToBackground: number;
}

interface SolitonProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsAnalyzed: number;
  solitonCount: number;
  solitons: DetectedSoliton[];
  totalSolitonEnergy: number;
  backgroundEnergy: number;
  solitonEnergyFraction: number;
  avgShapeFidelity: number;
  avgAmplitude: number;
  avgWidth: number;
  minIsolationDistance: number;
  collisionProximity: number;
  solitonDensity: number;
  peakConfinement: number;
  solitonIndex: number;
  solitonClass: string;
  stabilityRisk: string;
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

// --- Soliton detection ---

function buildFullSpectrum(bins: BinReserves[]): { values: number[]; startBin: number } {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  if (sorted.length === 0) return { values: [], startBin: 0 };
  const minBin = sorted[0].binId;
  const maxBin = sorted[sorted.length - 1].binId;
  const binMap = new Map(sorted.map((b) => [b.binId, b.totalUsd]));
  const values: number[] = [];
  for (let id = minBin; id <= maxBin; id++) {
    values.push(binMap.get(id) ?? 0);
  }
  return { values, startBin: minBin };
}

function sech2(x: number): number {
  const ex = Math.exp(x);
  const emx = Math.exp(-x);
  const ch = (ex + emx) / 2;
  return 1 / (ch * ch);
}

function fitSolitonShape(
  spectrum: number[],
  peakIdx: number,
  backgroundLevel: number
): { width: number; fidelity: number; energy: number } {
  const peakVal = spectrum[peakIdx] - backgroundLevel;
  if (peakVal <= 0) return { width: 0, fidelity: 0, energy: 0 };

  let halfMaxLeft = peakIdx;
  let halfMaxRight = peakIdx;
  const halfHeight = peakVal / 2 + backgroundLevel;

  for (let i = peakIdx - 1; i >= 0; i--) {
    if (spectrum[i] < halfHeight) {
      halfMaxLeft = i + 1;
      break;
    }
    if (i === 0) halfMaxLeft = 0;
  }

  for (let i = peakIdx + 1; i < spectrum.length; i++) {
    if (spectrum[i] < halfHeight) {
      halfMaxRight = i - 1;
      break;
    }
    if (i === spectrum.length - 1) halfMaxRight = spectrum.length - 1;
  }

  const fwhm = Math.max(halfMaxRight - halfMaxLeft + 1, 1);
  const sigma = fwhm / 2.634;

  let ssRes = 0;
  let ssTot = 0;
  let energy = 0;
  const fitRadius = Math.max(fwhm * 2, 3);
  const fitStart = Math.max(0, peakIdx - fitRadius);
  const fitEnd = Math.min(spectrum.length - 1, peakIdx + fitRadius);

  for (let i = fitStart; i <= fitEnd; i++) {
    const x = (i - peakIdx) / Math.max(sigma, 0.5);
    const predicted = peakVal * sech2(x) + backgroundLevel;
    const actual = spectrum[i];
    ssRes += (actual - predicted) ** 2;
    ssTot += (actual - backgroundLevel) ** 2;
    energy += Math.max(actual - backgroundLevel, 0);
  }

  const fidelity = ssTot > 0 ? Math.max(1 - ssRes / ssTot, 0) : 0;
  return { width: round(fwhm, 1), fidelity: round(fidelity, 4), energy: round(energy, 2) };
}

function detectPeaks(spectrum: number[], threshold: number): number[] {
  const peaks: number[] = [];
  for (let i = 1; i < spectrum.length - 1; i++) {
    if (
      spectrum[i] > spectrum[i - 1] &&
      spectrum[i] > spectrum[i + 1] &&
      spectrum[i] > threshold
    ) {
      peaks.push(i);
    }
  }
  return peaks;
}

function computeBackgroundLevel(spectrum: number[]): number {
  if (spectrum.length === 0) return 0;
  const sorted = [...spectrum].sort((a, b) => a - b);
  const lower40 = sorted.slice(0, Math.ceil(sorted.length * 0.4));
  return mean(lower40);
}

function detectSolitons(
  spectrum: number[],
  startBin: number
): { solitons: DetectedSoliton[]; backgroundLevel: number; totalEnergy: number } {
  const backgroundLevel = computeBackgroundLevel(spectrum);
  const threshold = backgroundLevel + (mean(spectrum) - backgroundLevel) * 0.5;
  const peakIndices = detectPeaks(spectrum, threshold);

  const totalEnergy = spectrum.reduce((s, v) => s + Math.max(v - backgroundLevel, 0), 0);

  const solitons: DetectedSoliton[] = [];
  for (const pi of peakIndices) {
    const fit = fitSolitonShape(spectrum, pi, backgroundLevel);
    if (fit.width < 1 || fit.fidelity < 0.1) continue;

    const amplitude = round(spectrum[pi] - backgroundLevel, 2);
    const peakToBackground =
      backgroundLevel > 0 ? round(spectrum[pi] / backgroundLevel, 2) : round(spectrum[pi], 2);

    let minDist = Infinity;
    for (const oi of peakIndices) {
      if (oi !== pi) {
        const d = Math.abs(oi - pi);
        if (d < minDist) minDist = d;
      }
    }
    if (minDist === Infinity) minDist = spectrum.length;

    solitons.push({
      peakBin: startBin + pi,
      amplitude,
      width: fit.width,
      shapeFidelity: fit.fidelity,
      energy: fit.energy,
      isolationDistance: minDist,
      peakToBackground,
    });
  }

  solitons.sort((a, b) => b.amplitude - a.amplitude);
  return { solitons, backgroundLevel, totalEnergy };
}

function computeCollisionProximity(solitons: DetectedSoliton[]): number {
  if (solitons.length < 2) return 0;

  let minGap = Infinity;
  for (let i = 0; i < solitons.length; i++) {
    for (let j = i + 1; j < solitons.length; j++) {
      const dist = Math.abs(solitons[i].peakBin - solitons[j].peakBin);
      const combinedWidth = (solitons[i].width + solitons[j].width) / 2;
      const gap = dist / Math.max(combinedWidth, 1);
      if (gap < minGap) minGap = gap;
    }
  }

  return minGap === Infinity ? 0 : round(Math.max(1 - minGap / 5, 0), 4);
}

function computePeakConfinement(spectrum: number[], backgroundLevel: number): number {
  if (spectrum.length === 0) return 0;
  const totalAboveBackground = spectrum.reduce(
    (s, v) => s + Math.max(v - backgroundLevel, 0),
    0
  );
  if (totalAboveBackground === 0) return 0;

  const sorted = [...spectrum]
    .map((v) => Math.max(v - backgroundLevel, 0))
    .sort((a, b) => b - a);

  const top20pct = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.2)));
  const top20energy = top20pct.reduce((s, v) => s + v, 0);
  return round(top20energy / totalAboveBackground, 4);
}

// --- Composite scoring ---

function computeSolitonIndex(
  solitonCount: number,
  avgFidelity: number,
  avgAmplitude: number,
  energyFraction: number,
  collisionProximity: number,
  peakConfinement: number,
  backgroundLevel: number
): number {
  const countScore = Math.min(solitonCount * 8, 20);
  const fidelityScore = Math.min(avgFidelity * 25, 25);
  const amplitudeScore =
    backgroundLevel > 0
      ? Math.min((avgAmplitude / backgroundLevel) * 5, 15)
      : Math.min(avgAmplitude > 0 ? 10 : 0, 15);
  const energyScore = Math.min(energyFraction * 20, 15);
  const confinementScore = Math.min(peakConfinement * 15, 15);
  const collisionPenalty = collisionProximity * 5;

  return Math.round(
    Math.min(
      Math.max(
        countScore + fidelityScore + amplitudeScore + energyScore + confinementScore - collisionPenalty,
        0
      ),
      100
    )
  );
}

function classifySoliton(index: number): string {
  if (index < 15) return "DIFFUSE";
  if (index < 35) return "WEAK_PEAKS";
  if (index < 60) return "SOLITONIC";
  return "STRONGLY_SOLITONIC";
}

function classifyStabilityRisk(
  index: number,
  collisionProximity: number,
  avgFidelity: number
): string {
  if (index < 15) return "NONE";
  if (collisionProximity > 0.7) return "HIGH";
  if (index >= 60 && avgFidelity > 0.6) return "LOW";
  if (index >= 35) return "MODERATE";
  return "LOW";
}

// --- Core analysis ---

function analyzeSolitons(
  bins: BinReserves[],
  activeBin: number,
  pool: AppPool
): SolitonProfile {
  const pair = `${pool.token0Symbol}/${pool.token1Symbol}`;
  const poolId = pool.poolId!;

  const { values: spectrum, startBin } = buildFullSpectrum(bins);
  const { solitons, backgroundLevel, totalEnergy } = detectSolitons(spectrum, startBin);

  const solitonEnergy = solitons.reduce((s, sol) => s + sol.energy, 0);
  const backgroundEnergy = Math.max(totalEnergy - solitonEnergy, 0);
  const energyFraction = totalEnergy > 0 ? solitonEnergy / totalEnergy : 0;

  const avgFidelity = solitons.length > 0 ? mean(solitons.map((s) => s.shapeFidelity)) : 0;
  const avgAmplitude = solitons.length > 0 ? mean(solitons.map((s) => s.amplitude)) : 0;
  const avgWidth = solitons.length > 0 ? mean(solitons.map((s) => s.width)) : 0;
  const minIsolation =
    solitons.length > 0 ? Math.min(...solitons.map((s) => s.isolationDistance)) : 0;

  const collisionProximity = computeCollisionProximity(solitons);
  const solitonDensity =
    spectrum.length > 0 ? round(solitons.length / spectrum.length, 4) : 0;
  const peakConfinement = computePeakConfinement(spectrum, backgroundLevel);

  const solitonIndex = computeSolitonIndex(
    solitons.length,
    avgFidelity,
    avgAmplitude,
    energyFraction,
    collisionProximity,
    peakConfinement,
    backgroundLevel
  );

  const solitonClass = classifySoliton(solitonIndex);
  const stabilityRisk = classifyStabilityRisk(solitonIndex, collisionProximity, avgFidelity);

  return {
    pair,
    poolId,
    activeBin,
    binsAnalyzed: bins.length,
    solitonCount: solitons.length,
    solitons: solitons.slice(0, 8),
    totalSolitonEnergy: round(solitonEnergy, 2),
    backgroundEnergy: round(backgroundEnergy, 2),
    solitonEnergyFraction: round(energyFraction, 4),
    avgShapeFidelity: round(avgFidelity, 4),
    avgAmplitude: round(avgAmplitude, 2),
    avgWidth: round(avgWidth, 1),
    minIsolationDistance: minIsolation,
    collisionProximity: round(collisionProximity, 4),
    solitonDensity,
    peakConfinement,
    solitonIndex,
    solitonClass,
    stabilityRisk,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
  };
}

// --- CLI ---

const program = new Command();
program
  .name("hodlmm-bin-soliton")
  .description("HODLMM bin soliton analyzer — Day 126 cocoa007")
  .version("1.0.0");

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

    console.error("\n  HODLMM Bin Soliton — Doctor\n");
    for (const c of checks) {
      const icon = c.ok ? "[OK]" : "[FAIL]";
      console.error(`  ${icon} ${c.name.padEnd(16)} ${c.detail}`);
    }
    console.error("");
  });

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

program
  .command("run")
  .description("Run soliton analysis on HODLMM pools")
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

      const profiles: SolitonProfile[] = [];

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
          const profile = analyzeSolitons(bins, activeBin, pool);
          profiles.push(profile);
        } catch (e: any) {
          console.error(
            `  [ERR] Pool ${pool.poolId} (${pool.token0Symbol}/${pool.token1Symbol}): ${e.message}`
          );
        }
      }

      const avgIdx =
        profiles.length > 0
          ? round(mean(profiles.map((p) => p.solitonIndex)), 1)
          : 0;
      const classCounts = {
        diffuseCount: profiles.filter((p) => p.solitonClass === "DIFFUSE").length,
        weakPeaksCount: profiles.filter((p) => p.solitonClass === "WEAK_PEAKS").length,
        solitonicCount: profiles.filter((p) => p.solitonClass === "SOLITONIC").length,
        stronglySolitonicCount: profiles.filter((p) => p.solitonClass === "STRONGLY_SOLITONIC").length,
      };
      const riskCounts = {
        noneCount: profiles.filter((p) => p.stabilityRisk === "NONE").length,
        lowCount: profiles.filter((p) => p.stabilityRisk === "LOW").length,
        moderateCount: profiles.filter((p) => p.stabilityRisk === "MODERATE").length,
        highCount: profiles.filter((p) => p.stabilityRisk === "HIGH").length,
      };

      const output = {
        result: "success",
        summary: {
          poolsAnalyzed: profiles.length,
          avgSolitonIndex: avgIdx,
          ...classCounts,
          ...riskCounts,
          avgSolitonCount: round(mean(profiles.map((p) => p.solitonCount)), 1),
          avgShapeFidelity: round(mean(profiles.map((p) => p.avgShapeFidelity)), 4),
          avgEnergyFraction: round(mean(profiles.map((p) => p.solitonEnergyFraction)), 4),
          avgCollisionProximity: round(mean(profiles.map((p) => p.collisionProximity)), 4),
        },
        profiles: profiles.map((p) => ({
          pair: p.pair,
          poolId: p.poolId,
          solitonIndex: p.solitonIndex,
          solitonClass: p.solitonClass,
          stabilityRisk: p.stabilityRisk,
          solitonCount: p.solitonCount,
          avgShapeFidelity: p.avgShapeFidelity,
          avgAmplitude: p.avgAmplitude,
          avgWidth: p.avgWidth,
          solitonEnergyFraction: p.solitonEnergyFraction,
          collisionProximity: p.collisionProximity,
          peakConfinement: p.peakConfinement,
          minIsolationDistance: p.minIsolationDistance,
          tvlUsd: p.tvlUsd,
        })),
      };

      console.log(JSON.stringify(output));

      console.error("\n  HODLMM Bin Soliton Analysis\n");
      console.error(
        "  " +
          "Pool".padEnd(6) +
          "Pair".padEnd(16) +
          "Idx".padStart(5) +
          "Class".padStart(22) +
          "Risk".padStart(10) +
          "#Sol".padStart(6) +
          "Fidel".padStart(7) +
          "Amp".padStart(9) +
          "Width".padStart(7) +
          "E-Frac".padStart(8) +
          "Coll".padStart(7)
      );
      console.error("  " + "-".repeat(103));
      for (const p of profiles) {
        console.error(
          "  " +
            String(p.poolId).padEnd(6) +
            p.pair.padEnd(16) +
            String(p.solitonIndex).padStart(5) +
            p.solitonClass.padStart(22) +
            p.stabilityRisk.padStart(10) +
            String(p.solitonCount).padStart(6) +
            p.avgShapeFidelity.toFixed(3).padStart(7) +
            p.avgAmplitude.toFixed(1).padStart(9) +
            p.avgWidth.toFixed(1).padStart(7) +
            p.solitonEnergyFraction.toFixed(3).padStart(8) +
            p.collisionProximity.toFixed(3).padStart(7)
        );
      }

      console.error("\n  Soliton Detail\n");
      for (const p of profiles) {
        if (p.solitons.length === 0) continue;
        console.error(`  Pool ${p.poolId} (${p.pair}):`);
        for (const s of p.solitons.slice(0, 5)) {
          console.error(
            `    Bin ${String(s.peakBin).padStart(8)} | Amp $${s.amplitude.toFixed(1).padStart(8)} | W ${s.width.toFixed(1).padStart(4)} | Fit ${s.shapeFidelity.toFixed(3)} | P/B ${s.peakToBackground.toFixed(1)} | Iso ${s.isolationDistance}`
          );
        }
      }

      console.error(
        `\n  Summary: ${profiles.length} pools | avg soliton idx ${avgIdx} | ` +
          `${classCounts.diffuseCount} diffuse, ` +
          `${classCounts.weakPeaksCount} weak, ` +
          `${classCounts.solitonicCount} solitonic, ` +
          `${classCounts.stronglySolitonicCount} strong | ` +
          `risk: ${riskCounts.noneCount}N/${riskCounts.lowCount}L/${riskCounts.moderateCount}M/${riskCounts.highCount}H\n`
      );
    } catch (e: any) {
      console.log(JSON.stringify({ error: e.message }));
    }
  });

program.parse();
