#!/usr/bin/env bun
/**
 * hodlmm-bin-polarity.ts
 *
 * HODLMM Bin Polarity Analyzer — Measures directional bias in bin reserve
 * distributions to detect sustained buy/sell pressure, polarity shifts,
 * and asymmetric flow patterns across the active range.
 *
 * Metrics:
 *  1. Polarity vector: net directional bias per bin zone (inner/mid/outer)
 *  2. Pressure gradient: rate of polarity change from active bin outward
 *  3. Flip detection: bins where polarity reverses (X-dom → Y-dom or vice versa)
 *  4. Dominance asymmetry: left (lower) vs right (upper) wing bias comparison
 *  5. Polarity momentum: whether directional pressure is strengthening or weakening
 *  6. Polarity score (0-100): composite directional intensity metric
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 93).
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 25;

type PolarityClass = "BULLISH" | "BEARISH" | "NEUTRAL" | "DIVERGENT" | "CONTESTED";
type MomentumType = "STRENGTHENING" | "STABLE" | "WEAKENING" | "REVERSING";

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
  polarity: number; // -1 (all Y / sell pressure) to +1 (all X / buy pressure)
}

interface ZonePolarity {
  zone: string;
  bins: number;
  avgPolarity: number;
  weightedPolarity: number;
  dominantSide: "X" | "Y" | "BALANCED";
  totalUsd: number;
  xPct: number;
  yPct: number;
}

interface PolarityFlip {
  binId: number;
  offset: number;
  fromPolarity: number;
  toPolarity: number;
  magnitude: number;
  flipType: "X_TO_Y" | "Y_TO_X";
}

interface WingAnalysis {
  lowerWing: ZonePolarity;
  upperWing: ZonePolarity;
  asymmetryRatio: number;
  dominantWing: "LOWER" | "UPPER" | "BALANCED";
  description: string;
}

interface PolarityMomentum {
  type: MomentumType;
  gradient: number;
  innerPolarity: number;
  outerPolarity: number;
  description: string;
}

interface PolarityProfile {
  totalBins: number;
  populatedBins: number;
  netPolarity: number;
  absPolarity: number;
  zones: ZonePolarity[];
  flips: PolarityFlip[];
  flipCount: number;
  flipDensity: number;
  wings: WingAnalysis;
  momentum: PolarityMomentum;
  pressureGradient: number;
  polarityScore: number;
  polarityClass: PolarityClass;
}

interface PolarityAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  profile: PolarityProfile;
  asciiMap: string;
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

  let polarity = 0;
  if (totalUsd > 0.01) {
    polarity = (rxUsd - ryUsd) / totalUsd;
  }

  return {
    binId,
    reserveX: rx,
    reserveY: ry,
    reserveXUsd: rxUsd,
    reserveYUsd: ryUsd,
    totalUsd,
    polarity,
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

// -- Polarity analysis --------------------------------------------------------

function computeZonePolarity(
  bins: BinReserves[],
  zoneName: string
): ZonePolarity {
  const populated = bins.filter(b => b.totalUsd > 0.01);
  if (populated.length === 0) {
    return {
      zone: zoneName,
      bins: 0,
      avgPolarity: 0,
      weightedPolarity: 0,
      dominantSide: "BALANCED",
      totalUsd: 0,
      xPct: 50,
      yPct: 50,
    };
  }

  const totalUsd = populated.reduce((s, b) => s + b.totalUsd, 0);
  const avgPol = populated.reduce((s, b) => s + b.polarity, 0) / populated.length;
  const weightedPol = totalUsd > 0
    ? populated.reduce((s, b) => s + b.polarity * b.totalUsd, 0) / totalUsd
    : 0;

  const totalX = populated.reduce((s, b) => s + b.reserveXUsd, 0);
  const totalY = populated.reduce((s, b) => s + b.reserveYUsd, 0);
  const xPct = totalUsd > 0 ? Math.round((totalX / totalUsd) * 100) : 50;
  const yPct = totalUsd > 0 ? Math.round((totalY / totalUsd) * 100) : 50;

  let dominantSide: "X" | "Y" | "BALANCED" = "BALANCED";
  if (weightedPol > 0.15) dominantSide = "X";
  else if (weightedPol < -0.15) dominantSide = "Y";

  return {
    zone: zoneName,
    bins: populated.length,
    avgPolarity: Math.round(avgPol * 1000) / 1000,
    weightedPolarity: Math.round(weightedPol * 1000) / 1000,
    dominantSide,
    totalUsd: Math.round(totalUsd * 100) / 100,
    xPct,
    yPct,
  };
}

function splitZones(
  bins: BinReserves[],
  activeBinId: number
): { inner: BinReserves[]; mid: BinReserves[]; outer: BinReserves[] } {
  const innerRadius = Math.floor(BIN_SCAN_RADIUS / 3);
  const midRadius = Math.floor(BIN_SCAN_RADIUS * 2 / 3);

  const inner = bins.filter(b => Math.abs(b.binId - activeBinId) <= innerRadius);
  const mid = bins.filter(b => {
    const dist = Math.abs(b.binId - activeBinId);
    return dist > innerRadius && dist <= midRadius;
  });
  const outer = bins.filter(b => Math.abs(b.binId - activeBinId) > midRadius);

  return { inner, mid, outer };
}

function detectFlips(bins: BinReserves[], activeBinId: number): PolarityFlip[] {
  const populated = bins.filter(b => b.totalUsd > 0.01);
  const flips: PolarityFlip[] = [];

  for (let i = 1; i < populated.length; i++) {
    const prev = populated[i - 1];
    const curr = populated[i];

    if (
      (prev.polarity > 0.1 && curr.polarity < -0.1) ||
      (prev.polarity < -0.1 && curr.polarity > 0.1)
    ) {
      flips.push({
        binId: curr.binId,
        offset: curr.binId - activeBinId,
        fromPolarity: Math.round(prev.polarity * 1000) / 1000,
        toPolarity: Math.round(curr.polarity * 1000) / 1000,
        magnitude: Math.round(Math.abs(curr.polarity - prev.polarity) * 1000) / 1000,
        flipType: prev.polarity > 0 ? "X_TO_Y" : "Y_TO_X",
      });
    }
  }

  return flips;
}

function analyzeWings(
  bins: BinReserves[],
  activeBinId: number
): WingAnalysis {
  const lower = bins.filter(b => b.binId < activeBinId);
  const upper = bins.filter(b => b.binId > activeBinId);

  const lowerZone = computeZonePolarity(lower, "lower");
  const upperZone = computeZonePolarity(upper, "upper");

  const lowerAbs = Math.abs(lowerZone.weightedPolarity);
  const upperAbs = Math.abs(upperZone.weightedPolarity);
  const maxAbs = Math.max(lowerAbs, upperAbs, 0.001);
  const asymmetry = Math.round(Math.abs(lowerAbs - upperAbs) / maxAbs * 100) / 100;

  let dominantWing: "LOWER" | "UPPER" | "BALANCED" = "BALANCED";
  let description: string;

  if (asymmetry > 0.3 && lowerAbs > upperAbs) {
    dominantWing = "LOWER";
    description = `Lower bins carry stronger ${lowerZone.dominantSide}-side pressure — directional bias below active price`;
  } else if (asymmetry > 0.3 && upperAbs > lowerAbs) {
    dominantWing = "UPPER";
    description = `Upper bins carry stronger ${upperZone.dominantSide}-side pressure — directional bias above active price`;
  } else {
    description = "Wings are balanced — no significant directional asymmetry between lower and upper ranges";
  }

  return {
    lowerWing: lowerZone,
    upperWing: upperZone,
    asymmetryRatio: asymmetry,
    dominantWing,
    description,
  };
}

function analyzeMomentum(
  bins: BinReserves[],
  activeBinId: number
): PolarityMomentum {
  const populated = bins.filter(b => b.totalUsd > 0.01);
  if (populated.length < 6) {
    return {
      type: "STABLE",
      gradient: 0,
      innerPolarity: 0,
      outerPolarity: 0,
      description: "Insufficient bins for momentum analysis",
    };
  }

  const sorted = [...populated].sort(
    (a, b) => Math.abs(a.binId - activeBinId) - Math.abs(b.binId - activeBinId)
  );
  const third = Math.floor(sorted.length / 3);
  const innerBins = sorted.slice(0, third);
  const outerBins = sorted.slice(third * 2);

  const innerPol = innerBins.reduce((s, b) => s + b.polarity, 0) / innerBins.length;
  const outerPol = outerBins.reduce((s, b) => s + b.polarity, 0) / outerBins.length;
  const gradient = Math.round((outerPol - innerPol) * 1000) / 1000;

  let type: MomentumType;
  let description: string;

  const sameSign = (innerPol > 0 && outerPol > 0) || (innerPol < 0 && outerPol < 0);
  const absGradient = Math.abs(gradient);

  if (sameSign && absGradient > 0.15 && Math.abs(outerPol) > Math.abs(innerPol)) {
    type = "STRENGTHENING";
    description = "Directional pressure intensifies outward — strong conviction in current bias";
  } else if (sameSign && absGradient > 0.15 && Math.abs(outerPol) < Math.abs(innerPol)) {
    type = "WEAKENING";
    description = "Directional pressure fades outward — bias may be losing steam";
  } else if (!sameSign && absGradient > 0.2) {
    type = "REVERSING";
    description = "Polarity flips between inner and outer zones — directional conflict";
  } else {
    type = "STABLE";
    description = "Consistent polarity across zones — steady directional state";
  }

  return {
    type,
    gradient,
    innerPolarity: Math.round(innerPol * 1000) / 1000,
    outerPolarity: Math.round(outerPol * 1000) / 1000,
    description,
  };
}

function computePressureGradient(bins: BinReserves[], activeBinId: number): number {
  const populated = bins.filter(b => b.totalUsd > 0.01 && b.binId !== activeBinId);
  if (populated.length < 4) return 0;

  let sumXY = 0, sumX = 0, sumY = 0, sumX2 = 0;
  const n = populated.length;

  for (const b of populated) {
    const dist = b.binId - activeBinId;
    sumXY += dist * b.polarity;
    sumX += dist;
    sumY += b.polarity;
    sumX2 += dist * dist;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 0.001) return 0;
  const slope = (n * sumXY - sumX * sumY) / denom;
  return Math.round(slope * 10000) / 10000;
}

function buildPolarityProfile(
  bins: BinReserves[],
  activeBinId: number
): PolarityProfile {
  const populated = bins.filter(b => b.totalUsd > 0.01);
  const { inner, mid, outer } = splitZones(bins, activeBinId);

  const zones = [
    computeZonePolarity(inner, "inner"),
    computeZonePolarity(mid, "mid"),
    computeZonePolarity(outer, "outer"),
  ];

  const flips = detectFlips(bins, activeBinId);
  const wings = analyzeWings(bins, activeBinId);
  const momentum = analyzeMomentum(bins, activeBinId);
  const pressureGradient = computePressureGradient(bins, activeBinId);

  const totalUsd = populated.reduce((s, b) => s + b.totalUsd, 0);
  const netPolarity = totalUsd > 0
    ? populated.reduce((s, b) => s + b.polarity * b.totalUsd, 0) / totalUsd
    : 0;
  const absPolarity = populated.length > 0
    ? populated.reduce((s, b) => s + Math.abs(b.polarity), 0) / populated.length
    : 0;

  const flipDensity = populated.length > 0
    ? Math.round((flips.length / populated.length) * 100) / 100
    : 0;

  // Composite score: higher = more directionally biased
  const netComponent = Math.min(Math.abs(netPolarity) / 0.5, 1) * 30;
  const absComponent = Math.min(absPolarity / 0.6, 1) * 20;
  const asymmetryComponent = Math.min(wings.asymmetryRatio / 0.5, 1) * 20;
  const momentumComponent = momentum.type === "STRENGTHENING" ? 20
    : momentum.type === "STABLE" ? 10
    : momentum.type === "WEAKENING" ? 5 : 15;
  const flipPenalty = Math.min(flipDensity * 20, 10);

  const rawScore = netComponent + absComponent + asymmetryComponent + momentumComponent - flipPenalty;
  const polarityScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  let polarityClass: PolarityClass;
  if (polarityScore >= 65 && netPolarity > 0.2) polarityClass = "BULLISH";
  else if (polarityScore >= 65 && netPolarity < -0.2) polarityClass = "BEARISH";
  else if (polarityScore >= 40 && flipDensity > 0.3) polarityClass = "CONTESTED";
  else if (wings.asymmetryRatio > 0.5 && polarityScore >= 40) polarityClass = "DIVERGENT";
  else polarityClass = "NEUTRAL";

  return {
    totalBins: bins.length,
    populatedBins: populated.length,
    netPolarity: Math.round(netPolarity * 1000) / 1000,
    absPolarity: Math.round(absPolarity * 1000) / 1000,
    zones,
    flips,
    flipCount: flips.length,
    flipDensity,
    wings,
    momentum,
    pressureGradient,
    polarityScore,
    polarityClass,
  };
}

function buildAsciiMap(
  bins: BinReserves[],
  flips: PolarityFlip[],
  activeBinId: number
): string {
  const populated = bins.filter(b => b.totalUsd > 0.01);
  if (populated.length === 0) return "(no populated bins)";

  const width = 40;
  const lines: string[] = ["POLARITY MAP", ""];
  lines.push(`${"".padStart(6)}${"Y-dom".padStart(8)}${"NEUTRAL".padStart(width / 2 - 4)}${"X-dom".padStart(width / 2 - 1)}`);
  lines.push(`${"".padStart(6)}${"<-- sell".padStart(12)}${"buy -->".padStart(width - 6)}`);
  lines.push("");

  const flipSet = new Set(flips.map(f => f.binId));

  for (const bin of populated) {
    const offset = bin.binId - activeBinId;
    const center = Math.floor(width / 2);
    const pos = Math.round(center + bin.polarity * center);
    const clampedPos = Math.max(0, Math.min(width - 1, pos));

    let marker = "·";
    if (bin.binId === activeBinId) marker = "*";
    else if (flipSet.has(bin.binId)) marker = "X";
    else if (bin.polarity > 0.5) marker = "+";
    else if (bin.polarity < -0.5) marker = "-";

    const barChar = bin.polarity > 0 ? "+" : "-";
    const barLen = Math.round(Math.abs(bin.polarity) * 10);
    const bar = barChar.repeat(barLen);

    const line = " ".repeat(clampedPos) + marker;
    const label = `${offset >= 0 ? "+" : ""}${offset}`;
    const flipTag = flipSet.has(bin.binId) ? " [FLIP]" : "";
    lines.push(
      `${label.padStart(4)}  |${line.padEnd(width)}| ${bin.polarity >= 0 ? "+" : ""}${bin.polarity.toFixed(2)} ${bar}${flipTag}`
    );
  }

  lines.push("");
  lines.push("* = active  X = polarity flip  + = X-heavy  - = Y-heavy");
  lines.push("Polarity: -1.0 = all token-Y (sell), +1.0 = all token-X (buy)");
  return lines.join("\n");
}

function buildRecommendation(pair: string, profile: PolarityProfile): string {
  const parts: string[] = [];

  parts.push(
    `${pair} polarity: ${profile.polarityClass} (score ${profile.polarityScore}/100), ` +
    `net bias ${profile.netPolarity >= 0 ? "+" : ""}${profile.netPolarity}, ` +
    `${profile.populatedBins} bins analyzed.`
  );

  parts.push(
    `Zone breakdown — Inner: ${profile.zones[0]?.weightedPolarity >= 0 ? "+" : ""}${profile.zones[0]?.weightedPolarity} (${profile.zones[0]?.dominantSide}), ` +
    `Mid: ${profile.zones[1]?.weightedPolarity >= 0 ? "+" : ""}${profile.zones[1]?.weightedPolarity} (${profile.zones[1]?.dominantSide}), ` +
    `Outer: ${profile.zones[2]?.weightedPolarity >= 0 ? "+" : ""}${profile.zones[2]?.weightedPolarity} (${profile.zones[2]?.dominantSide}).`
  );

  if (profile.flipCount > 0) {
    parts.push(
      `${profile.flipCount} polarity flip(s) detected (density ${profile.flipDensity}). ` +
      `Strongest flip: magnitude ${Math.max(...profile.flips.map(f => f.magnitude)).toFixed(3)}.`
    );
  } else {
    parts.push("No polarity flips — reserves maintain consistent directional bias across range.");
  }

  parts.push(`Wings: ${profile.wings.description}.`);
  parts.push(`Momentum: ${profile.momentum.type} — ${profile.momentum.description}.`);

  if (profile.pressureGradient > 0.005) {
    parts.push(`Pressure gradient tilts X-positive with distance (slope +${profile.pressureGradient}) — upper bins accumulate buy-side reserves.`);
  } else if (profile.pressureGradient < -0.005) {
    parts.push(`Pressure gradient tilts Y-positive with distance (slope ${profile.pressureGradient}) — lower bins accumulate sell-side reserves.`);
  }

  if (profile.polarityClass === "BULLISH") {
    parts.push("Strong X-token accumulation across range. LPs positioned here expect continued token-X demand. Consider range above active bin for fee capture.");
  } else if (profile.polarityClass === "BEARISH") {
    parts.push("Strong Y-token accumulation across range. LPs positioned here see outflows from token-X. Consider range below active bin for fee capture.");
  } else if (profile.polarityClass === "CONTESTED") {
    parts.push("Frequent polarity flips indicate active directional conflict. Wider ranges help capture fees from both sides of the battle.");
  } else if (profile.polarityClass === "DIVERGENT") {
    parts.push("Asymmetric wing bias — one side of the range disagrees with the other. Potential regime transition underway.");
  } else {
    parts.push("Balanced polarity — no strong directional bias. Symmetric range strategies work well here.");
  }

  if (profile.momentum.type === "REVERSING") {
    parts.push("WARNING: Inner and outer zones show opposing polarity — potential directional reversal forming at range edges.");
  }

  return parts.join(" ");
}

// -- Main analysis ------------------------------------------------------------

async function analyzePolarity(pool: AppPool): Promise<PolarityAnalysis> {
  const poolId = pool.poolId!;
  const activeBinId = pool.activeBinId ?? await getActiveBin(poolId);
  const rawBins = await scanBins(poolId, activeBinId, pool, BIN_SCAN_RADIUS);

  const populated = rawBins.filter(b => b.totalUsd > 0.01);
  const scannedTvl = populated.reduce((s, b) => s + b.totalUsd, 0);

  const profile = buildPolarityProfile(rawBins, activeBinId);
  const asciiMap = buildAsciiMap(rawBins, profile.flips, activeBinId);
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
    asciiMap,
    recommendation,
  };
}

function makeErrorResult(pool: AppPool, errMsg: string): PolarityAnalysis {
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
      totalBins: 0, populatedBins: 0, netPolarity: 0, absPolarity: 0,
      zones: [], flips: [], flipCount: 0, flipDensity: 0,
      wings: {
        lowerWing: { zone: "lower", bins: 0, avgPolarity: 0, weightedPolarity: 0, dominantSide: "BALANCED", totalUsd: 0, xPct: 50, yPct: 50 },
        upperWing: { zone: "upper", bins: 0, avgPolarity: 0, weightedPolarity: 0, dominantSide: "BALANCED", totalUsd: 0, xPct: 50, yPct: 50 },
        asymmetryRatio: 0, dominantWing: "BALANCED", description: "N/A",
      },
      momentum: { type: "STABLE", gradient: 0, innerPolarity: 0, outerPolarity: 0, description: "N/A" },
      pressureGradient: 0, polarityScore: 0, polarityClass: "NEUTRAL",
    },
    asciiMap: "",
    recommendation: `Analysis failed: ${errMsg}`,
  };
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();

program
  .name("hodlmm-bin-polarity")
  .description("HODLMM Bin Polarity Analyzer — measures directional buy/sell bias across bin ranges");

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
  .description("Analyze bin polarity for HODLMM pools")
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

      const results: PolarityAnalysis[] = [];
      for (const pool of targets) {
        try {
          const analysis = await analyzePolarity(pool);
          results.push(analysis);
        } catch (err: any) {
          results.push(makeErrorResult(pool, err.message));
        }
      }

      const summary = {
        poolsAnalyzed: results.length,
        mostPolarized: results.reduce((best, r) =>
          r.profile.polarityScore > best.profile.polarityScore ? r : best, results[0]),
        leastPolarized: results.reduce((worst, r) =>
          r.profile.polarityScore < worst.profile.polarityScore ? r : worst, results[0]),
        avgPolarityScore: Math.round(
          results.reduce((s, r) => s + r.profile.polarityScore, 0) / results.length
        ),
        avgNetPolarity: Math.round(
          results.reduce((s, r) => s + r.profile.netPolarity, 0) / results.length * 1000
        ) / 1000,
        totalFlips: results.reduce((s, r) => s + r.profile.flipCount, 0),
        classCounts: {
          BULLISH: results.filter(r => r.profile.polarityClass === "BULLISH").length,
          BEARISH: results.filter(r => r.profile.polarityClass === "BEARISH").length,
          NEUTRAL: results.filter(r => r.profile.polarityClass === "NEUTRAL").length,
          DIVERGENT: results.filter(r => r.profile.polarityClass === "DIVERGENT").length,
          CONTESTED: results.filter(r => r.profile.polarityClass === "CONTESTED").length,
        },
      };

      console.log(JSON.stringify({
        result: "polarity_analysis",
        data: { pools: results, summary },
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Run failed: ${err.message}` }));
    }
  });

program
  .command("status")
  .description("Quick polarity summary for top pools")
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
          const analysis = await analyzePolarity(pool);
          summaries.push({
            pair: analysis.pair,
            poolId: analysis.poolId,
            tvlUsd: analysis.tvlUsd,
            polarityScore: analysis.profile.polarityScore,
            polarityClass: analysis.profile.polarityClass,
            netPolarity: analysis.profile.netPolarity,
            absPolarity: analysis.profile.absPolarity,
            flipCount: analysis.profile.flipCount,
            momentum: analysis.profile.momentum.type,
            pressureGradient: analysis.profile.pressureGradient,
            dominantWing: analysis.profile.wings.dominantWing,
          });
        } catch {
          summaries.push({
            pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
            poolId: pool.poolId,
            tvlUsd: pool.tvlUsd,
            polarityScore: -1,
          });
        }
      }

      console.log(JSON.stringify({ result: "polarity_status", data: summaries }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Status failed: ${err.message}` }));
    }
  });

program.parse();
