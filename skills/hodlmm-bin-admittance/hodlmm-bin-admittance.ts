#!/usr/bin/env bun
/**
 * hodlmm-bin-admittance.ts — Day 109 cocoa007 Bitflow Skills Comp
 *
 * Bin trade flow admittance analyzer — measures how easily trades pass
 * through each bin. Admittance is the inverse of impedance: high admittance
 * means low resistance, smooth execution, and predictable slippage.
 *
 * Decomposes admittance into conductance (real: reserve depth) and
 * susceptance (imaginary: directional bias that stores energy as skew).
 * Maps admittance topology to find high-throughput corridors and
 * susceptance traps where directional trades get absorbed.
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

interface BinAdmittance {
  binId: number;
  admittance: number;      // total admittance Y = sqrt(G^2 + B^2)
  conductance: number;     // G: real part — ease of flow from reserve depth
  susceptance: number;     // B: imaginary part — directional bias storing energy
  phaseAngle: number;      // arctan(B/G) — how reactive vs resistive the bin is
}

interface AdmittanceCorridor {
  binRange: [number, number];
  binCount: number;
  avgAdmittance: number;
  avgConductance: number;
  avgSusceptance: number;
  throughputScore: number;  // 0-100 — how well trades flow through this corridor
}

interface SusceptanceTrap {
  binRange: [number, number];
  binCount: number;
  avgSusceptance: number;
  trapStrength: number;     // how strongly directional trades get absorbed
  biasDirection: "buy" | "sell" | "neutral";
}

interface AdmittanceProfile {
  populatedBins: number;
  scannedTvlUsd: number;
  activeBinTvlUsd: number;

  binAdmittances: BinAdmittance[];
  avgAdmittance: number;
  peakAdmittance: number;
  minAdmittance: number;
  medianAdmittance: number;

  avgConductance: number;
  avgSusceptance: number;
  avgPhaseAngle: number;

  buyAdmittance: number;
  sellAdmittance: number;
  directionalAdmittance: { buy: number; sell: number };
  admittanceAsymmetry: number;

  highThroughputCorridors: AdmittanceCorridor[];
  susceptanceTraps: SusceptanceTrap[];

  admittanceUniformity: number;  // 0-1: how evenly distributed admittance is
  admittanceGradient: number;    // rate of change across the range

  admittanceClass: "superconductive" | "high-throughput" | "moderate-throughput" | "restricted" | "blocked";
  admittanceIndex: number;       // 0-100 — HIGHER = better (more permissive)

  asciiAdmittanceMap: string;
}

interface AdmittanceAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  profile: AdmittanceProfile;
  recommendation: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function round(n: number, d: number): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

// ---------------------------------------------------------------------------
// Pool discovery
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// On-chain reads
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Admittance computation
// ---------------------------------------------------------------------------

function computeBinAdmittances(bins: BinReserves[]): BinAdmittance[] {
  if (bins.length === 0) return [];

  const maxReserve = Math.max(...bins.map((b) => b.totalUsd), 1);
  const result: BinAdmittance[] = [];

  for (const bin of bins) {
    // Conductance G: real component — proportional to reserve depth
    // Deep bins allow trades to flow easily (high conductance)
    const depthRatio = bin.totalUsd / maxReserve;
    const conductance = round(Math.min(1, depthRatio * 1.2), 4);

    // Susceptance B: imaginary component — directional bias
    // A balanced bin (50/50 X/Y) has zero susceptance
    // A skewed bin stores "energy" as directional pressure
    const totalReserveUsd = bin.reserveXUsd + bin.reserveYUsd;
    let susceptance = 0;
    if (totalReserveUsd > 0.01) {
      const xRatio = bin.reserveXUsd / totalReserveUsd;
      // Susceptance ranges from -1 (all Y, sell-biased) to +1 (all X, buy-biased)
      susceptance = round((xRatio - 0.5) * 2, 4);
    }

    // Admittance magnitude: Y = sqrt(G^2 + B^2)
    const admittance = round(Math.sqrt(conductance ** 2 + susceptance ** 2), 4);

    // Phase angle: arctan(B/G) in degrees
    // 0 = purely conductive (balanced reserves)
    // +/-90 = purely susceptive (completely skewed)
    const phaseAngle = conductance > 0.001
      ? round(Math.atan2(Math.abs(susceptance), conductance) * (180 / Math.PI), 1)
      : (susceptance !== 0 ? 90 : 0);

    result.push({ binId: bin.binId, admittance, conductance, susceptance, phaseAngle });
  }

  return result;
}

function detectHighThroughputCorridors(
  admittances: BinAdmittance[],
  threshold: number
): AdmittanceCorridor[] {
  const corridors: AdmittanceCorridor[] = [];
  let corridorStart = -1;

  for (let i = 0; i <= admittances.length; i++) {
    const isHigh = i < admittances.length && admittances[i].admittance >= threshold;

    if (isHigh && corridorStart === -1) {
      corridorStart = i;
    } else if (!isHigh && corridorStart !== -1) {
      const slice = admittances.slice(corridorStart, i);
      if (slice.length >= 3) {
        const avgA = round(slice.reduce((s, v) => s + v.admittance, 0) / slice.length, 4);
        const avgG = round(slice.reduce((s, v) => s + v.conductance, 0) / slice.length, 4);
        const avgB = round(slice.reduce((s, v) => s + Math.abs(v.susceptance), 0) / slice.length, 4);

        // Throughput score: high conductance + low susceptance = best flow
        const throughputScore = round(Math.min(100, avgG * 80 + (1 - avgB) * 20), 1);

        corridors.push({
          binRange: [slice[0].binId, slice[slice.length - 1].binId],
          binCount: slice.length,
          avgAdmittance: avgA,
          avgConductance: avgG,
          avgSusceptance: avgB,
          throughputScore,
        });
      }
      corridorStart = -1;
    }
  }

  return corridors.sort((a, b) => b.throughputScore - a.throughputScore).slice(0, 8);
}

function detectSusceptanceTraps(admittances: BinAdmittance[]): SusceptanceTrap[] {
  // Susceptance traps: consecutive bins with high |susceptance| in the same direction
  // These absorb directional trades, creating "energy storage" zones
  const traps: SusceptanceTrap[] = [];
  const threshold = 0.3;
  let trapStart = -1;
  let trapSign = 0;

  for (let i = 0; i <= admittances.length; i++) {
    const curr = i < admittances.length ? admittances[i] : null;
    const isTrapped = curr !== null && Math.abs(curr.susceptance) >= threshold;
    const sign = curr ? Math.sign(curr.susceptance) : 0;

    if (isTrapped && (trapStart === -1 || sign === trapSign)) {
      if (trapStart === -1) {
        trapStart = i;
        trapSign = sign;
      }
    } else if (trapStart !== -1) {
      const slice = admittances.slice(trapStart, i);
      if (slice.length >= 2) {
        const avgS = round(slice.reduce((s, v) => s + Math.abs(v.susceptance), 0) / slice.length, 4);
        const trapStrength = round(Math.min(100, avgS * slice.length * 20), 1);
        const biasDirection: "buy" | "sell" | "neutral" =
          trapSign > 0 ? "buy" : trapSign < 0 ? "sell" : "neutral";

        traps.push({
          binRange: [slice[0].binId, slice[slice.length - 1].binId],
          binCount: slice.length,
          avgSusceptance: avgS,
          trapStrength,
          biasDirection,
        });
      }
      trapStart = -1;
      trapSign = 0;
      // Re-check current bin as potential new trap start
      if (isTrapped) {
        trapStart = i;
        trapSign = sign;
      }
    }
  }

  return traps.sort((a, b) => b.trapStrength - a.trapStrength).slice(0, 8);
}

function classifyAdmittance(index: number): AdmittanceProfile["admittanceClass"] {
  if (index >= 80) return "superconductive";
  if (index >= 60) return "high-throughput";
  if (index >= 40) return "moderate-throughput";
  if (index >= 20) return "restricted";
  return "blocked";
}

function buildAsciiAdmittanceMap(
  admittances: BinAdmittance[],
  activeBinId: number,
  corridors: AdmittanceCorridor[],
  traps: SusceptanceTrap[]
): string {
  const width = 30;
  const lines: string[] = ["ADMITTANCE MAP (trade flow ease across bin range)"];
  lines.push(`${"Bin".padStart(8)} | ${"Admittance".padEnd(width + 14)} |`);

  const corridorBins = new Set<number>();
  for (const c of corridors) {
    for (let b = c.binRange[0]; b <= c.binRange[1]; b++) corridorBins.add(b);
  }
  const trapBins = new Set<number>();
  for (const t of traps) {
    for (let b = t.binRange[0]; b <= t.binRange[1]; b++) trapBins.add(b);
  }

  const step = Math.max(1, Math.floor(admittances.length / 40));
  for (let i = 0; i < admittances.length; i += step) {
    const a = admittances[i];
    const barLen = Math.round(a.admittance * width);
    const bar = "\u2588".repeat(Math.max(barLen, 0));
    let marker = "";
    if (a.binId === activeBinId) {
      marker = " **ACTIVE**";
    } else if (trapBins.has(a.binId)) {
      marker = ` ~~TRAP(${a.susceptance > 0 ? "buy" : "sell"})~~`;
    } else if (corridorBins.has(a.binId)) {
      marker = " [CORRIDOR]";
    }
    const pct = (a.admittance * 100).toFixed(0);
    const phase = a.phaseAngle.toFixed(0);
    lines.push(`${String(a.binId).padStart(8)} | ${bar.padEnd(width)} ${pct.padStart(3)}% ${phase.padStart(3)}deg${marker}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Full admittance analysis
// ---------------------------------------------------------------------------

function analyzeAdmittance(bins: BinReserves[], activeBinId: number): AdmittanceProfile {
  const populated = bins.filter((b) => b.totalUsd > 0);
  const totalTvl = bins.reduce((s, b) => s + b.totalUsd, 0);
  const activeBin = bins.find((b) => b.binId === activeBinId);
  const activeBinTvl = activeBin?.totalUsd ?? 0;

  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const activeBinIdx = sorted.findIndex((b) => b.binId === activeBinId);

  const binAdmittances = computeBinAdmittances(sorted);
  const aValues = binAdmittances.map((v) => v.admittance);
  const gValues = binAdmittances.map((v) => v.conductance);
  const bValues = binAdmittances.map((v) => Math.abs(v.susceptance));
  const phiValues = binAdmittances.map((v) => v.phaseAngle);

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const median = (arr: number[]) => {
    if (arr.length === 0) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  const avgAdmittance = round(avg(aValues), 4);
  const peakAdmittance = aValues.length > 0 ? Math.max(...aValues) : 0;
  const minAdmittance = aValues.length > 0 ? Math.min(...aValues) : 0;
  const medianAdmittance = round(median(aValues), 4);

  const avgConductance = round(avg(gValues), 4);
  const avgSusceptance = round(avg(bValues), 4);
  const avgPhaseAngle = round(avg(phiValues), 1);

  // Directional admittance
  const sellSide = activeBinIdx > 0
    ? binAdmittances.slice(0, activeBinIdx)
    : [];
  const buySide = activeBinIdx < binAdmittances.length - 1
    ? binAdmittances.slice(activeBinIdx + 1)
    : [];

  const sellAdmittance = round(avg(sellSide.map((a) => a.admittance)), 4);
  const buyAdmittance = round(avg(buySide.map((a) => a.admittance)), 4);

  const totalA = buyAdmittance + sellAdmittance;
  const admittanceAsymmetry = totalA > 0
    ? round((buyAdmittance - sellAdmittance) / totalA, 4)
    : 0;

  // High-throughput corridors
  const admittanceThreshold = Math.max(0.3, avgAdmittance * 0.8);
  const highThroughputCorridors = detectHighThroughputCorridors(binAdmittances, admittanceThreshold);

  // Susceptance traps
  const susceptanceTraps = detectSusceptanceTraps(binAdmittances);

  // Uniformity: coefficient of variation (lower = more uniform)
  const stdDev = Math.sqrt(avg(aValues.map((v) => (v - avgAdmittance) ** 2)));
  const cv = avgAdmittance > 0 ? stdDev / avgAdmittance : 1;
  const admittanceUniformity = round(Math.max(0, Math.min(1, 1 - cv)), 4);

  // Gradient: average absolute change between adjacent bins
  let gradientSum = 0;
  for (let i = 1; i < aValues.length; i++) {
    gradientSum += Math.abs(aValues[i] - aValues[i - 1]);
  }
  const admittanceGradient = aValues.length > 1
    ? round(gradientSum / (aValues.length - 1), 4)
    : 0;

  // Composite scoring — HIGHER index = better (more permissive)
  const conductanceScore = avgConductance * 35;
  const uniformityScore = admittanceUniformity * 20;
  const corridorBonus = Math.min(15, highThroughputCorridors.reduce((s, c) => s + c.binCount, 0) * 0.4);
  const trapPenalty = Math.min(10, susceptanceTraps.reduce((s, t) => s + t.trapStrength, 0) * 0.08);
  const phasePenalty = Math.min(10, avgPhaseAngle / 9); // 90deg max -> 10 penalty
  const emptinessPenalty = Math.min(10, ((bins.length - populated.length) / Math.max(bins.length, 1)) * 10);
  const asymmetryPenalty = Math.min(5, Math.abs(admittanceAsymmetry) * 5);
  const gradientPenalty = Math.min(5, admittanceGradient * 25);

  const admittanceIndex = Math.round(Math.min(100, Math.max(0,
    conductanceScore + uniformityScore + corridorBonus - trapPenalty - phasePenalty - emptinessPenalty - asymmetryPenalty - gradientPenalty
  )));

  const admittanceClass = classifyAdmittance(admittanceIndex);

  const asciiAdmittanceMap = buildAsciiAdmittanceMap(
    binAdmittances, activeBinId, highThroughputCorridors, susceptanceTraps
  );

  return {
    populatedBins: populated.length,
    scannedTvlUsd: totalTvl,
    activeBinTvlUsd: activeBinTvl,
    binAdmittances,
    avgAdmittance,
    peakAdmittance,
    minAdmittance,
    medianAdmittance,
    avgConductance,
    avgSusceptance,
    avgPhaseAngle,
    buyAdmittance,
    sellAdmittance,
    directionalAdmittance: { buy: buyAdmittance, sell: sellAdmittance },
    admittanceAsymmetry,
    highThroughputCorridors,
    susceptanceTraps,
    admittanceUniformity,
    admittanceGradient,
    admittanceClass,
    admittanceIndex,
    asciiAdmittanceMap,
  };
}

function generateRecommendation(p: AdmittanceProfile): string {
  const parts: string[] = [];

  switch (p.admittanceClass) {
    case "superconductive":
      parts.push("Superconductive pool — trades pass through with near-zero resistance. Deep, balanced reserves create a frictionless execution environment. Ideal for all trade sizes.");
      break;
    case "high-throughput":
      parts.push("High-throughput pool — strong admittance across the bin range. Trades flow easily with predictable slippage. Good for moderate-to-large trades.");
      break;
    case "moderate-throughput":
      parts.push("Moderate throughput — admittance is adequate but uneven. Some bins restrict flow. Use high-throughput corridors for best execution.");
      break;
    case "restricted":
      parts.push("Restricted flow — low admittance indicates thin reserves or heavy directional skew. Small trades only. Route through corridors where possible.");
      break;
    case "blocked":
      parts.push("Blocked — near-zero admittance. Reserves are too thin or too skewed for reliable execution. Expect extreme slippage and unpredictable fills.");
      break;
  }

  if (p.highThroughputCorridors.length > 0) {
    const best = p.highThroughputCorridors[0];
    parts.push(`${p.highThroughputCorridors.length} high-throughput corridor(s). Best at bins ${best.binRange[0]}-${best.binRange[1]} (${best.binCount} bins, ${best.throughputScore.toFixed(0)}% throughput). Trades within corridors see minimal resistance.`);
  } else {
    parts.push("No high-throughput corridors found — admittance is uniformly low or fragmented across the range.");
  }

  if (p.susceptanceTraps.length > 0) {
    const worst = p.susceptanceTraps[0];
    parts.push(`${p.susceptanceTraps.length} susceptance trap(s). Strongest at bins ${worst.binRange[0]}-${worst.binRange[1]} (strength ${worst.trapStrength.toFixed(0)}, ${worst.biasDirection}-biased). Directional trades in these zones get absorbed by skewed reserves.`);
  } else {
    parts.push("No susceptance traps — reserves are balanced enough that directional trades flow through without getting absorbed.");
  }

  if (p.avgPhaseAngle > 30) {
    parts.push(`High average phase angle (${p.avgPhaseAngle.toFixed(0)} deg). The pool is more reactive than conductive — reserves are skewed and trades encounter directional bias before they encounter depth.`);
  } else if (p.avgPhaseAngle < 10) {
    parts.push(`Low average phase angle (${p.avgPhaseAngle.toFixed(0)} deg). Nearly purely conductive — balanced reserves, minimal directional bias.`);
  }

  if (Math.abs(p.admittanceAsymmetry) > 0.3) {
    const easier = p.admittanceAsymmetry > 0 ? "buy" : "sell";
    const harder = p.admittanceAsymmetry > 0 ? "sell" : "buy";
    parts.push(`Directional asymmetry (${p.admittanceAsymmetry.toFixed(2)}). ${easier}-side has higher admittance — trades flow more easily. ${harder}-side is more restricted.`);
  } else {
    parts.push(`Symmetric admittance (${p.admittanceAsymmetry.toFixed(2)}). Both directions face similar flow conditions.`);
  }

  parts.push(`Uniformity: ${(p.admittanceUniformity * 100).toFixed(0)}%. Gradient: ${p.admittanceGradient.toFixed(4)}/bin. Conductance: ${(p.avgConductance * 100).toFixed(0)}%. Susceptance: ${(p.avgSusceptance * 100).toFixed(0)}%.`);

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

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

  const results: AdmittanceAnalysis[] = [];
  for (const pool of targets) {
    const poolId = pool.poolId!;
    try {
      const activeBin = pool.activeBinId ?? (await getActiveBin(poolId));
      const bins = await scanBins(poolId, activeBin, pool, BIN_SCAN_RADIUS);
      const profile = analyzeAdmittance(bins, activeBin);
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
        profile: {} as AdmittanceProfile,
        recommendation: `Error: ${e.message}`,
      });
    }
  }

  const avgIdx =
    results.filter((r) => r.profile.admittanceIndex != null).length > 0
      ? Math.round(
          results.filter((r) => r.profile.admittanceIndex != null).reduce((s, r) => s + r.profile.admittanceIndex, 0) /
            results.filter((r) => r.profile.admittanceIndex != null).length
        )
      : 0;

  console.log(
    JSON.stringify(
      {
        result: "admittance_analysis",
        data: {
          pools: results,
          summary: { poolsAnalyzed: results.length, avgAdmittanceIndex: avgIdx },
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
      const profile = analyzeAdmittance(bins, activeBin);

      summaries.push({
        poolId,
        pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
        tvlUsd: pool.tvlUsd,
        admittanceIndex: profile.admittanceIndex,
        admittanceClass: profile.admittanceClass,
        avgAdmittance: profile.avgAdmittance,
        avgConductance: profile.avgConductance,
        avgSusceptance: profile.avgSusceptance,
        avgPhaseAngle: profile.avgPhaseAngle,
        buyAdmittance: profile.buyAdmittance,
        sellAdmittance: profile.sellAdmittance,
        admittanceAsymmetry: profile.admittanceAsymmetry,
        admittanceUniformity: profile.admittanceUniformity,
        highThroughputCorridorCount: profile.highThroughputCorridors.length,
        susceptanceTrapCount: profile.susceptanceTraps.length,
      });
    } catch (e: any) {
      summaries.push({
        poolId,
        pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
        error: e.message,
      });
    }
  }

  console.log(JSON.stringify({ result: "admittance_status", pools: summaries }, null, 2));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const program = new Command();
program.name("hodlmm-bin-admittance").description("HODLMM bin trade flow admittance analyzer — measures how easily trades pass through bins");

program.command("doctor").description("Check API connectivity").action(cmdDoctor);

program
  .command("run")
  .description("Full admittance analysis")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "3")
  .action(cmdRun);

program.command("status").description("Quick admittance summary").action(cmdStatus);

program.parse();
