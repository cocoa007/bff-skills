#!/usr/bin/env bun
/**
 * hodlmm-bin-resonance.ts — Day 114 cocoa007 Bitflow Skills Comp
 *
 * Bin liquidity resonance analyzer — detects natural oscillation
 * frequencies in reserve patterns, Q-factor, damping ratios,
 * standing wave nodes, and resonant amplification zones.
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
const RESONANCE_SIGNIFICANCE_THRESHOLD = 0.10;
const DAMPING_CRITICAL_THRESHOLD = 1.0;

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

interface ResonantMode {
  modeNumber: number;
  wavelength: number;
  frequency: number;
  amplitude: number;
  phase: number;
  power: number;
  powerFraction: number;
}

interface StandingWaveNode {
  binId: number;
  offset: number;
  nodeType: "node" | "antinode";
  amplitude: number;
}

interface ResonanceProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsAnalyzed: number;
  resonanceIndex: number;
  resonanceClass: string;
  fundamentalWavelength: number;
  fundamentalFrequency: number;
  dominantModes: ResonantMode[];
  qFactor: number;
  qClass: string;
  dampingRatio: number;
  dampingClass: string;
  standingWaveNodes: StandingWaveNode[];
  spectralEntropy: number;
  spectralConcentration: number;
  peakAmplification: number;
  bandwidthBins: number;
  tvlUsd: number;
  volume24hUsd: number;
}

async function fetchPools(): Promise<AppPool[]> {
  const res = await fetch(`${BFF_APP_BASE}/pools`);
  if (!res.ok) throw new Error(`BFF pools API: ${res.status}`);
  const body = await res.json() as any;
  const pools: AppPool[] = (body.data?.pools ?? body.pools ?? body ?? []);
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
  const data = await res.json() as any;
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

function parseClarityUint(hex: string): number {
  const clean = hex.replace("0x", "");
  if (clean.startsWith("01")) return parseInt(clean.slice(2, 34), 16);
  if (clean.startsWith("00")) return parseInt(clean.slice(2, 34), 16);
  const m = clean.match(/01([0-9a-f]{32})/);
  return m ? parseInt(m[1], 16) : 0;
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

function computeDFT(signal: number[]): { frequency: number; amplitude: number; phase: number; power: number }[] {
  const N = signal.length;
  if (N < 3) return [];
  const mean = signal.reduce((a, b) => a + b, 0) / N;
  const centered = signal.map((v) => v - mean);
  const results: { frequency: number; amplitude: number; phase: number; power: number }[] = [];
  const maxK = Math.floor(N / 2);
  for (let k = 1; k <= maxK; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const angle = (2 * Math.PI * k * n) / N;
      re += centered[n] * Math.cos(angle);
      im -= centered[n] * Math.sin(angle);
    }
    re /= N;
    im /= N;
    const amplitude = 2 * Math.sqrt(re * re + im * im);
    const phase = Math.atan2(im, re);
    const power = amplitude * amplitude;
    results.push({ frequency: k / N, amplitude, phase, power });
  }
  return results;
}

function analyzeResonance(bins: BinReserves[], activeBin: number, pool: AppPool): ResonanceProfile {
  const totalSignal = bins.map((b) => b.totalUsd);

  const spectrum = computeDFT(totalSignal);
  const totalPower = spectrum.reduce((s, m) => s + m.power, 0) || 1;

  const modes: ResonantMode[] = spectrum
    .map((s, i) => ({
      modeNumber: i + 1,
      wavelength: totalSignal.length / (i + 1),
      frequency: s.frequency,
      amplitude: s.amplitude,
      phase: s.phase,
      power: s.power,
      powerFraction: s.power / totalPower,
    }))
    .sort((a, b) => b.power - a.power);

  const dominantModes = modes.filter((m) => m.powerFraction >= RESONANCE_SIGNIFICANCE_THRESHOLD).slice(0, 5);
  if (dominantModes.length === 0 && modes.length > 0) {
    dominantModes.push(modes[0]);
  }

  const fundamental = dominantModes[0] || { wavelength: bins.length, frequency: 1 / bins.length, amplitude: 0, power: 0, powerFraction: 0 };

  const qFactor = computeQFactor(spectrum, modes);

  const dampingRatio = qFactor > 0 ? 1 / (2 * qFactor) : 1.0;

  const nodes = detectStandingWaveNodes(bins, activeBin, fundamental);

  const spectralEntropy = computeSpectralEntropy(spectrum, totalPower);
  const maxEntropy = Math.log2(spectrum.length || 1);
  const spectralConcentration = maxEntropy > 0 ? 1 - spectralEntropy / maxEntropy : 0;

  const peakAmplification = fundamental.amplitude / (Math.max(...totalSignal) - Math.min(...totalSignal) || 1);

  const halfPowerLevel = (fundamental.power || 0) / 2;
  let bandwidthBins = 0;
  for (const m of modes) {
    if (m.power >= halfPowerLevel) bandwidthBins++;
  }

  const resonanceIndex = computeResonanceIndex(spectralConcentration, qFactor, dominantModes, dampingRatio);
  const resonanceClass = classifyResonance(resonanceIndex);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId!,
    activeBin,
    binsAnalyzed: bins.length,
    resonanceIndex: Math.round(resonanceIndex),
    resonanceClass,
    fundamentalWavelength: round(fundamental.wavelength),
    fundamentalFrequency: round(fundamental.frequency),
    dominantModes: dominantModes.map((m) => ({
      ...m,
      amplitude: round(m.amplitude),
      phase: round(m.phase),
      power: round(m.power),
      powerFraction: round(m.powerFraction),
      wavelength: round(m.wavelength),
      frequency: round(m.frequency),
    })),
    qFactor: round(qFactor),
    qClass: classifyQ(qFactor),
    dampingRatio: round(dampingRatio),
    dampingClass: classifyDamping(dampingRatio),
    standingWaveNodes: nodes,
    spectralEntropy: round(spectralEntropy),
    spectralConcentration: round(spectralConcentration),
    peakAmplification: round(peakAmplification),
    bandwidthBins,
    tvlUsd: round(pool.tvlUsd),
    volume24hUsd: round(pool.volume24hUsd),
  };
}

function computeQFactor(
  spectrum: { frequency: number; amplitude: number; power: number }[],
  modes: ResonantMode[]
): number {
  if (modes.length === 0) return 0;
  const peak = modes[0];
  const peakPower = peak.power;
  const halfPower = peakPower / 2;

  let lowerIdx = -1;
  let upperIdx = -1;
  const sorted = [...spectrum].sort((a, b) => a.frequency - b.frequency);

  const peakIdx = sorted.findIndex((s) => Math.abs(s.frequency - peak.frequency) < 1e-9);
  if (peakIdx < 0) return 1;

  for (let i = peakIdx; i >= 0; i--) {
    if (sorted[i].power < halfPower) { lowerIdx = i; break; }
  }
  for (let i = peakIdx; i < sorted.length; i++) {
    if (sorted[i].power < halfPower) { upperIdx = i; break; }
  }

  if (lowerIdx < 0) lowerIdx = 0;
  if (upperIdx < 0) upperIdx = sorted.length - 1;

  const bandwidth = sorted[upperIdx].frequency - sorted[lowerIdx].frequency;
  if (bandwidth <= 0) return spectrum.length;

  return peak.frequency / bandwidth;
}

function detectStandingWaveNodes(
  bins: BinReserves[],
  activeBin: number,
  fundamental: ResonantMode
): StandingWaveNode[] {
  const nodes: StandingWaveNode[] = [];
  if (bins.length < 3) return nodes;

  const vals = bins.map((b) => b.totalUsd);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const maxDev = Math.max(...vals.map((v) => Math.abs(v - mean))) || 1;

  for (let i = 1; i < bins.length - 1; i++) {
    const prev = vals[i - 1] - mean;
    const curr = vals[i] - mean;
    const next = vals[i + 1] - mean;

    if ((prev > 0 && next < 0) || (prev < 0 && next > 0) || Math.abs(curr) < maxDev * 0.05) {
      if (Math.abs(curr) < maxDev * 0.15) {
        nodes.push({
          binId: bins[i].binId,
          offset: bins[i].binId - activeBin,
          nodeType: "node",
          amplitude: round(Math.abs(curr) / maxDev),
        });
      }
    }

    if (Math.abs(curr) > Math.abs(prev) && Math.abs(curr) > Math.abs(next)) {
      if (Math.abs(curr) > maxDev * 0.5) {
        nodes.push({
          binId: bins[i].binId,
          offset: bins[i].binId - activeBin,
          nodeType: "antinode",
          amplitude: round(Math.abs(curr) / maxDev),
        });
      }
    }
  }

  return nodes.slice(0, 20);
}

function computeSpectralEntropy(
  spectrum: { power: number }[],
  totalPower: number
): number {
  if (totalPower === 0 || spectrum.length === 0) return 0;
  let entropy = 0;
  for (const s of spectrum) {
    const p = s.power / totalPower;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  return entropy;
}

function computeResonanceIndex(
  spectralConcentration: number,
  qFactor: number,
  dominantModes: ResonantMode[],
  dampingRatio: number
): number {
  const concScore = spectralConcentration * 30;
  const qScore = Math.min(qFactor / 10, 1) * 25;
  const modeScore = dominantModes.length > 0 ? (dominantModes[0].powerFraction * 25) : 0;
  const dampScore = dampingRatio < DAMPING_CRITICAL_THRESHOLD ? (1 - dampingRatio) * 20 : 0;
  return Math.min(100, Math.max(0, concScore + qScore + modeScore + dampScore));
}

function classifyResonance(index: number): string {
  if (index < 15) return "flat";
  if (index < 30) return "weak";
  if (index < 50) return "moderate";
  if (index < 70) return "strong";
  return "sharp";
}

function classifyQ(q: number): string {
  if (q < 1) return "overdamped";
  if (q < 5) return "low-Q";
  if (q < 15) return "moderate-Q";
  if (q < 30) return "high-Q";
  return "ultra-high-Q";
}

function classifyDamping(zeta: number): string {
  if (zeta > 1.0) return "overdamped";
  if (zeta > 0.7) return "underdamped-heavy";
  if (zeta > 0.3) return "underdamped-moderate";
  if (zeta > 0.05) return "underdamped-light";
  return "undamped";
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function renderResonanceMap(profile: ResonanceProfile, bins: BinReserves[]): string {
  const lines: string[] = [];
  lines.push(`\n=== RESONANCE MAP: ${profile.pair} (pool ${profile.poolId}) ===`);
  lines.push(`Resonance Index: ${profile.resonanceIndex}/100 (${profile.resonanceClass})`);
  lines.push(`Q-Factor: ${profile.qFactor} (${profile.qClass}) | Damping: ${profile.dampingRatio} (${profile.dampingClass})`);
  lines.push(`Fundamental: λ=${profile.fundamentalWavelength} bins, f=${profile.fundamentalFrequency}`);
  lines.push(`Spectral concentration: ${(profile.spectralConcentration * 100).toFixed(1)}% | Bandwidth: ${profile.bandwidthBins} modes`);
  lines.push("");

  if (bins.length > 0) {
    const vals = bins.map((b) => b.totalUsd);
    const max = Math.max(...vals) || 1;
    const width = 40;
    lines.push("Bin Reserve Pattern (amplitude envelope):");
    const step = Math.max(1, Math.floor(bins.length / 30));
    for (let i = 0; i < bins.length; i += step) {
      const b = bins[i];
      const barLen = Math.round((b.totalUsd / max) * width);
      const offset = b.binId - profile.activeBin;
      const marker = offset === 0 ? ">>>" : "   ";
      const nodeMarker = profile.standingWaveNodes.find((n) => n.binId === b.binId);
      const nodeTag = nodeMarker ? (nodeMarker.nodeType === "node" ? " [NODE]" : " [ANTI]") : "";
      lines.push(`${marker} ${String(offset).padStart(4)} | ${"█".repeat(barLen)}${"░".repeat(width - barLen)}${nodeTag}`);
    }
    lines.push("");
  }

  if (profile.dominantModes.length > 0) {
    lines.push("Dominant Resonant Modes:");
    lines.push("  Mode | Wavelength | Frequency | Power%  | Phase");
    lines.push("  " + "-".repeat(55));
    for (const m of profile.dominantModes) {
      lines.push(
        `  ${String(m.modeNumber).padStart(4)} | ${String(m.wavelength.toFixed(1)).padStart(10)} | ${String(m.frequency.toFixed(4)).padStart(9)} | ${String((m.powerFraction * 100).toFixed(1)).padStart(6)}% | ${m.phase.toFixed(3)}`
      );
    }
    lines.push("");
  }

  if (profile.standingWaveNodes.length > 0) {
    lines.push("Standing Wave Features:");
    for (const n of profile.standingWaveNodes.slice(0, 10)) {
      lines.push(`  Bin ${n.binId} (offset ${n.offset > 0 ? "+" : ""}${n.offset}): ${n.nodeType.toUpperCase()} amplitude=${n.amplitude}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function analyzePool(pool: AppPool): Promise<{ profile: ResonanceProfile; bins: BinReserves[] } | null> {
  try {
    const activeBin = pool.activeBinId ?? (await fetchActiveBin(pool.poolId!));
    const bins = await fetchBinReserves(pool.poolId!, activeBin, pool);
    if (bins.length < MIN_POPULATED_BINS) return null;
    const profile = analyzeResonance(bins, activeBin, pool);
    return { profile, bins };
  } catch {
    return null;
  }
}

const program = new Command();

program
  .name("hodlmm-bin-resonance")
  .description("HODLMM bin liquidity resonance analyzer — natural oscillation frequencies, Q-factor, damping, standing waves");

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
  .description("Full resonance analysis")
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

      const results: ResonanceProfile[] = [];
      let outputText = "";

      for (const pool of selected) {
        const result = await analyzePool(pool);
        if (result) {
          results.push(result.profile);
          outputText += renderResonanceMap(result.profile, result.bins);
        }
      }

      const avgIndex = results.length > 0 ? results.reduce((s, r) => s + r.resonanceIndex, 0) / results.length : 0;

      console.log(
        JSON.stringify({
          result: "resonance_analysis",
          data: {
            pools: results,
            summary: {
              poolsAnalyzed: results.length,
              avgResonanceIndex: Math.round(avgIndex),
              sharpResonance: results.filter((r) => r.resonanceIndex >= 70).length,
              strongResonance: results.filter((r) => r.resonanceIndex >= 50).length,
              flatProfiles: results.filter((r) => r.resonanceIndex < 15).length,
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
  .description("Quick resonance summary for top pools")
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
            resonanceIndex: result.profile.resonanceIndex,
            resonanceClass: result.profile.resonanceClass,
            qFactor: result.profile.qFactor,
            dampingClass: result.profile.dampingClass,
            fundamentalWavelength: result.profile.fundamentalWavelength,
            dominantModes: result.profile.dominantModes.length,
            nodes: result.profile.standingWaveNodes.filter((n) => n.nodeType === "node").length,
            antinodes: result.profile.standingWaveNodes.filter((n) => n.nodeType === "antinode").length,
          });
        }
      }

      console.log(
        JSON.stringify({
          result: "resonance_status",
          data: { pools: results, timestamp: new Date().toISOString() },
        })
      );
    } catch (e: any) {
      console.log(JSON.stringify({ error: e.message }));
    }
  });

program.parse();
