#!/usr/bin/env bun
/**
 * hodlmm-bin-saturation.ts — Day 101 cocoa007 Bitflow Skills Comp
 *
 * Bin saturation analyzer — measures how close each bin's capital is to
 * equilibrium share. Identifies oversaturated zones (capital competing for
 * limited volume), undersaturated gaps (opportunity), saturation gradient,
 * directional saturation bias, Gini inequality, and composite scoring.
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 30;
const OVERSATURATED_THRESH = 2.0;  // 2x expected = oversaturated
const UNDERSATURATED_THRESH = 0.3; // <30% of expected = undersaturated

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

interface BinSaturation {
  binId: number;
  offset: number;
  totalUsd: number;
  expectedUsd: number;
  saturationRatio: number; // actual / expected (1.0 = equilibrium)
  level: "OVERSATURATED" | "NORMAL" | "UNDERSATURATED" | "EMPTY";
}

interface SaturationZone {
  startBinId: number;
  endBinId: number;
  startOffset: number;
  endOffset: number;
  width: number;
  avgSaturation: number;
  type: "oversaturated" | "undersaturated";
  totalCapitalUsd: number;
}

interface SaturationProfile {
  populatedBins: number;
  totalBins: number;
  scannedTvlUsd: number;

  // Per-bin
  binSaturations: BinSaturation[];
  avgSaturation: number;
  medianSaturation: number;
  peakSaturation: { binId: number; offset: number; ratio: number };
  troughSaturation: { binId: number; offset: number; ratio: number };

  // Zones
  oversaturatedZones: SaturationZone[];
  undersaturatedZones: SaturationZone[];
  oversaturatedBinCount: number;
  undersaturatedBinCount: number;
  oversaturatedCapitalUsd: number;
  undersaturatedCapitalUsd: number;

  // Distribution
  saturationGini: number; // 0 = uniform, 1 = maximally unequal
  saturationStdDev: number;

  // Directional
  leftAvgSaturation: number;
  rightAvgSaturation: number;
  directionalBias: number; // left/right ratio; >1 = left heavier

  // Gradient
  saturationGradient: number; // slope of saturation from left to right
  gradientR2: number;

  // Composite
  saturationScore: number; // 0-100

  // Visual
  asciiSaturationMap: string;
}

interface SaturationAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  profile: SaturationProfile;
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

// -- Saturation math ----------------------------------------------------------

function computeExpectedDistribution(bins: BinReserves[], activeBinId: number): number[] {
  const totalUsd = bins.reduce((s, b) => s + b.totalUsd, 0);
  if (totalUsd === 0) return bins.map(() => 0);

  // Gaussian-weighted expected distribution centered on active bin
  // Sigma = 1/3 of the scan radius (most capital expected near active bin)
  const sigma = BIN_SCAN_RADIUS / 3;
  const weights = bins.map(b => {
    const dist = Math.abs(b.binId - activeBinId);
    return Math.exp(-(dist * dist) / (2 * sigma * sigma));
  });
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (totalWeight === 0) return bins.map(() => totalUsd / bins.length);
  return weights.map(w => (w / totalWeight) * totalUsd);
}

function computeBinSaturations(
  bins: BinReserves[],
  expected: number[],
  activeBinId: number
): BinSaturation[] {
  return bins.map((b, i) => {
    const exp = expected[i];
    const ratio = exp > 0.01 ? b.totalUsd / exp : (b.totalUsd > 0.01 ? 999 : 0);
    const level: BinSaturation["level"] =
      b.totalUsd < 0.01 ? "EMPTY"
      : ratio >= OVERSATURATED_THRESH ? "OVERSATURATED"
      : ratio <= UNDERSATURATED_THRESH ? "UNDERSATURATED"
      : "NORMAL";
    return {
      binId: b.binId,
      offset: b.binId - activeBinId,
      totalUsd: Math.round(b.totalUsd * 100) / 100,
      expectedUsd: Math.round(exp * 100) / 100,
      saturationRatio: Math.round(Math.min(ratio, 999) * 1000) / 1000,
      level,
    };
  });
}

function findSaturationZones(sats: BinSaturation[], type: "oversaturated" | "undersaturated"): SaturationZone[] {
  const thresh = type === "oversaturated" ? OVERSATURATED_THRESH : UNDERSATURATED_THRESH;
  const check = type === "oversaturated"
    ? (r: number) => r >= thresh
    : (r: number) => r > 0 && r <= thresh;

  const zones: SaturationZone[] = [];
  let zoneItems: BinSaturation[] = [];

  for (let i = 0; i <= sats.length; i++) {
    const s = sats[i];
    const inZone = s && s.level !== "EMPTY" && check(s.saturationRatio);

    if (inZone) {
      zoneItems.push(s);
    } else if (zoneItems.length > 0) {
      if (zoneItems.length >= 2) {
        const avgSat = zoneItems.reduce((sum, z) => sum + z.saturationRatio, 0) / zoneItems.length;
        const totalCap = zoneItems.reduce((sum, z) => sum + z.totalUsd, 0);
        zones.push({
          startBinId: zoneItems[0].binId,
          endBinId: zoneItems[zoneItems.length - 1].binId,
          startOffset: zoneItems[0].offset,
          endOffset: zoneItems[zoneItems.length - 1].offset,
          width: zoneItems.length,
          avgSaturation: Math.round(avgSat * 1000) / 1000,
          type,
          totalCapitalUsd: Math.round(totalCap * 100) / 100,
        });
      }
      zoneItems = [];
    }
  }

  return zones.sort((a, b) => b.avgSaturation - a.avgSaturation);
}

function computeGini(values: number[]): number {
  const sorted = [...values].filter(v => v > 0).sort((a, b) => a - b);
  const n = sorted.length;
  if (n < 2) return 0;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  if (mean === 0) return 0;

  let sumDiff = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumDiff += Math.abs(sorted[i] - sorted[j]);
    }
  }
  return Math.round((sumDiff / (2 * n * n * mean)) * 1000) / 1000;
}

function computeSaturationGradient(sats: BinSaturation[]): { gradient: number; r2: number } {
  const nonEmpty = sats.filter(s => s.level !== "EMPTY");
  if (nonEmpty.length < 3) return { gradient: 0, r2: 0 };

  const n = nonEmpty.length;
  const xs = nonEmpty.map(s => s.offset);
  const ys = nonEmpty.map(s => s.saturationRatio);

  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;

  let num = 0, denomX = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    num += dx * (ys[i] - meanY);
    denomX += dx * dx;
  }

  if (Math.abs(denomX) < 1e-10) return { gradient: 0, r2: 0 };
  const slope = num / denomX;
  const intercept = meanY - slope * meanX;

  const ssRes = nonEmpty.reduce((s, sat, i) => {
    const pred = slope * xs[i] + intercept;
    return s + (ys[i] - pred) ** 2;
  }, 0);
  const ssTot = nonEmpty.reduce((s, sat, i) => s + (ys[i] - meanY) ** 2, 0);
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  return {
    gradient: Math.round(slope * 10000) / 10000,
    r2: Math.round(r2 * 1000) / 1000,
  };
}

// -- ASCII saturation map -----------------------------------------------------

function buildSaturationMap(
  sats: BinSaturation[],
  activeBinId: number
): string {
  if (sats.length === 0) return "(no bins)";

  const lines: string[] = [
    "SATURATION MAP (ratio = actual/expected, bar = capital level)",
    "",
    "  offset  |  actual  | expected |  ratio  | level          | bar",
    "  --------+----------+----------+---------+----------------+----------------------------",
  ];

  const maxUsd = Math.max(...sats.map(s => s.totalUsd), 0.001);
  const barWidth = 24;
  const step = sats.length > 40 ? 2 : 1;

  for (let i = 0; i < sats.length; i += step) {
    const s = sats[i];
    const label = `${s.offset >= 0 ? "+" : ""}${s.offset}`;
    const actual = fmtUsd(s.totalUsd).padStart(7);
    const expected = fmtUsd(s.expectedUsd).padStart(7);
    const ratio = s.saturationRatio >= 999 ? "  999+" : s.saturationRatio.toFixed(2).padStart(6);

    const levelStr = s.level.padEnd(14);

    const norm = s.totalUsd / maxUsd;
    const barLen = Math.round(norm * barWidth);
    const bar = "\u2588".repeat(Math.max(0, barLen)).padEnd(barWidth);

    const activeMarker = s.offset === 0 ? " \u25c4" : "";

    lines.push(
      `  ${label.padStart(6)}  | ${actual} | ${expected} | ${ratio} | ${levelStr} | ${bar}${activeMarker}`
    );
  }

  lines.push("");
  lines.push(
    `\u2588 = capital  \u25c4 = active bin  OVER >= ${OVERSATURATED_THRESH}x  UNDER <= ${UNDERSATURATED_THRESH}x  NORMAL = between`
  );
  return lines.join("\n");
}

// -- Profile ------------------------------------------------------------------

function buildProfile(bins: BinReserves[], activeBinId: number): SaturationProfile {
  const populated = bins.filter(b => b.totalUsd > 0.01);
  const scannedTvl = populated.reduce((s, b) => s + b.totalUsd, 0);

  const expected = computeExpectedDistribution(bins, activeBinId);
  const sats = computeBinSaturations(bins, expected, activeBinId);

  // Non-empty saturations for stats
  const nonEmpty = sats.filter(s => s.level !== "EMPTY");
  const ratios = nonEmpty.map(s => s.saturationRatio);

  const avgSat = ratios.length > 0 ? ratios.reduce((s, r) => s + r, 0) / ratios.length : 0;
  const sortedRatios = [...ratios].sort((a, b) => a - b);
  const medianSat = sortedRatios.length > 0 ? sortedRatios[Math.floor(sortedRatios.length / 2)] : 0;

  // Peak and trough
  const peak = nonEmpty.reduce((best, s) =>
    s.saturationRatio > best.saturationRatio ? s : best,
    nonEmpty[0] ?? { binId: 0, offset: 0, saturationRatio: 0 }
  );
  const trough = nonEmpty.reduce((best, s) =>
    s.saturationRatio < best.saturationRatio ? s : best,
    nonEmpty[0] ?? { binId: 0, offset: 0, saturationRatio: 999 }
  );

  // Zones
  const oversaturatedZones = findSaturationZones(sats, "oversaturated");
  const undersaturatedZones = findSaturationZones(sats, "undersaturated");
  const overBins = sats.filter(s => s.level === "OVERSATURATED");
  const underBins = sats.filter(s => s.level === "UNDERSATURATED");
  const overCapital = overBins.reduce((s, b) => s + b.totalUsd, 0);
  const underCapital = underBins.reduce((s, b) => s + b.totalUsd, 0);

  // Gini
  const saturationGini = computeGini(ratios);

  // Std dev
  const variance = ratios.length > 1
    ? ratios.reduce((s, r) => s + (r - avgSat) ** 2, 0) / (ratios.length - 1)
    : 0;
  const saturationStdDev = Math.round(Math.sqrt(variance) * 1000) / 1000;

  // Directional
  const leftBins = nonEmpty.filter(s => s.offset < 0);
  const rightBins = nonEmpty.filter(s => s.offset > 0);
  const leftAvg = leftBins.length > 0 ? leftBins.reduce((s, b) => s + b.saturationRatio, 0) / leftBins.length : 0;
  const rightAvg = rightBins.length > 0 ? rightBins.reduce((s, b) => s + b.saturationRatio, 0) / rightBins.length : 0;
  const directionalBias = (rightAvg + 0.001) > 0 ? (leftAvg + 0.001) / (rightAvg + 0.001) : 1;

  // Gradient
  const { gradient: saturationGradient, r2: gradientR2 } = computeSaturationGradient(sats);

  // Composite score
  const saturationScore = computeSaturationScore(
    avgSat, saturationGini, saturationStdDev,
    overBins.length, underBins.length, populated.length,
    directionalBias, saturationGradient
  );

  // ASCII map
  const asciiSaturationMap = buildSaturationMap(sats, activeBinId);

  return {
    populatedBins: populated.length,
    totalBins: bins.length,
    scannedTvlUsd: Math.round(scannedTvl * 100) / 100,
    binSaturations: sats,
    avgSaturation: Math.round(avgSat * 1000) / 1000,
    medianSaturation: Math.round(medianSat * 1000) / 1000,
    peakSaturation: { binId: peak.binId, offset: peak.offset, ratio: peak.saturationRatio },
    troughSaturation: { binId: trough.binId, offset: trough.offset, ratio: trough.saturationRatio },
    oversaturatedZones,
    undersaturatedZones,
    oversaturatedBinCount: overBins.length,
    undersaturatedBinCount: underBins.length,
    oversaturatedCapitalUsd: Math.round(overCapital * 100) / 100,
    undersaturatedCapitalUsd: Math.round(underCapital * 100) / 100,
    saturationGini,
    saturationStdDev,
    leftAvgSaturation: Math.round(leftAvg * 1000) / 1000,
    rightAvgSaturation: Math.round(rightAvg * 1000) / 1000,
    directionalBias: Math.round(Math.min(3, Math.max(0, directionalBias)) * 1000) / 1000,
    saturationGradient,
    gradientR2,
    saturationScore,
    asciiSaturationMap,
  };
}

function computeSaturationScore(
  avgSat: number,
  gini: number,
  stdDev: number,
  overCount: number,
  underCount: number,
  totalPopulated: number,
  directionalBias: number,
  gradient: number
): number {
  let score = 50;

  // Average saturation near 1.0 is ideal (well-distributed)
  const avgDiff = Math.abs(avgSat - 1.0);
  if (avgDiff < 0.3) score += 15;
  else if (avgDiff < 0.6) score += 5;
  else score -= 10;

  // Low Gini = more uniform = healthier
  if (gini < 0.2) score += 12;
  else if (gini < 0.35) score += 5;
  else if (gini > 0.6) score -= 12;
  else score -= 3;

  // Low std dev = consistent saturation
  if (stdDev < 0.5) score += 8;
  else if (stdDev > 2.0) score -= 10;

  // Few oversaturated/undersaturated bins = good
  if (totalPopulated > 0) {
    const overFrac = overCount / totalPopulated;
    const underFrac = underCount / totalPopulated;
    if (overFrac < 0.1) score += 5;
    else if (overFrac > 0.3) score -= 8;
    if (underFrac < 0.1) score += 5;
    else if (underFrac > 0.3) score -= 8;
  }

  // Directional balance (close to 1 is symmetric)
  const biasDiff = Math.abs(directionalBias - 1);
  if (biasDiff < 0.2) score += 5;
  else if (biasDiff > 1.0) score -= 8;

  // Low gradient = even distribution across range
  if (Math.abs(gradient) < 0.01) score += 5;
  else if (Math.abs(gradient) > 0.05) score -= 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildRecommendation(pair: string, profile: SaturationProfile): string {
  const parts: string[] = [];

  parts.push(
    `${pair} saturation analysis: avg ratio ${profile.avgSaturation.toFixed(3)}, ` +
    `Gini ${profile.saturationGini.toFixed(3)}, ` +
    `${profile.oversaturatedBinCount} oversaturated / ${profile.undersaturatedBinCount} undersaturated bins. ` +
    `Composite saturation score: ${profile.saturationScore}/100.`
  );

  // Average saturation
  if (Math.abs(profile.avgSaturation - 1.0) < 0.3) {
    parts.push(
      `Average saturation near equilibrium (${profile.avgSaturation.toFixed(3)}) — ` +
      `capital distribution roughly matches expected Gaussian around active bin.`
    );
  } else if (profile.avgSaturation > 1.3) {
    parts.push(
      `Capital is concentrated above expected levels (avg ${profile.avgSaturation.toFixed(3)}) — ` +
      `some bins are attracting disproportionate capital, competing for limited swap volume.`
    );
  } else {
    parts.push(
      `Capital is spread thinner than expected (avg ${profile.avgSaturation.toFixed(3)}) — ` +
      `many bins carry less liquidity than their position warrants, creating depth gaps.`
    );
  }

  // Gini
  if (profile.saturationGini > 0.5) {
    parts.push(
      `High saturation inequality (Gini ${profile.saturationGini.toFixed(3)}) — ` +
      `a few bins dominate capital allocation while most are relatively starved.`
    );
  } else if (profile.saturationGini < 0.2) {
    parts.push(
      `Low saturation inequality (Gini ${profile.saturationGini.toFixed(3)}) — ` +
      `capital is evenly distributed relative to bin distance from active price.`
    );
  }

  // Zones
  if (profile.oversaturatedZones.length > 0) {
    const totalOverCap = fmtUsd(profile.oversaturatedCapitalUsd);
    parts.push(
      `${profile.oversaturatedZones.length} oversaturated zone(s) holding $${totalOverCap} — ` +
      `excess capital in these ranges competes for limited trade flow, diluting fee yield per dollar.`
    );
  }
  if (profile.undersaturatedZones.length > 0) {
    const totalUnderCap = fmtUsd(profile.undersaturatedCapitalUsd);
    parts.push(
      `${profile.undersaturatedZones.length} undersaturated zone(s) with only $${totalUnderCap} — ` +
      `LP opportunity: these ranges are below equilibrium share, offering better fee yield per dollar.`
    );
  }

  // Directional
  const biasLabel = profile.directionalBias > 1.3
    ? "left-heavy (bearish LP bias)"
    : profile.directionalBias < 0.77
    ? "right-heavy (bullish LP bias)"
    : "balanced";
  parts.push(
    `Directional saturation — left: ${profile.leftAvgSaturation.toFixed(3)}, right: ${profile.rightAvgSaturation.toFixed(3)} ` +
    `(bias: ${profile.directionalBias.toFixed(2)} — ${biasLabel}).`
  );

  // Gradient
  if (Math.abs(profile.saturationGradient) > 0.02) {
    const dir = profile.saturationGradient > 0 ? "left-to-right increasing" : "left-to-right decreasing";
    parts.push(
      `Saturation gradient: ${dir} (slope ${profile.saturationGradient.toFixed(4)}, R²=${profile.gradientR2.toFixed(3)}). ` +
      `Capital allocation tilts systematically across the range.`
    );
  }

  return parts.join(" ");
}

// -- Main analysis ------------------------------------------------------------

async function analyzeSaturation(pool: AppPool): Promise<SaturationAnalysis> {
  const poolId = pool.poolId!;
  const activeBinId = pool.activeBinId ?? await getActiveBin(poolId);
  const rawBins = await scanBins(poolId, activeBinId, pool, BIN_SCAN_RADIUS);

  const populated = rawBins.filter(b => b.totalUsd > 0.01);
  const scannedTvl = populated.reduce((s, b) => s + b.totalUsd, 0);

  const profile = buildProfile(rawBins, activeBinId);
  const recommendation = buildRecommendation(
    `${pool.token0Symbol}/${pool.token1Symbol}`,
    profile
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

function makeErrorResult(pool: AppPool, errMsg: string): SaturationAnalysis {
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
      binSaturations: [], avgSaturation: 0, medianSaturation: 0,
      peakSaturation: { binId: 0, offset: 0, ratio: 0 },
      troughSaturation: { binId: 0, offset: 0, ratio: 0 },
      oversaturatedZones: [], undersaturatedZones: [],
      oversaturatedBinCount: 0, undersaturatedBinCount: 0,
      oversaturatedCapitalUsd: 0, undersaturatedCapitalUsd: 0,
      saturationGini: 0, saturationStdDev: 0,
      leftAvgSaturation: 0, rightAvgSaturation: 0, directionalBias: 1,
      saturationGradient: 0, gradientR2: 0,
      saturationScore: 0, asciiSaturationMap: "",
    },
    recommendation: `Analysis failed: ${errMsg}`,
  };
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();

program
  .name("hodlmm-bin-saturation")
  .description("HODLMM Bin Saturation Analyzer — capital saturation levels, zones, Gini, gradient, directional bias");

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
          oversaturatedThreshold: OVERSATURATED_THRESH,
          undersaturatedThreshold: UNDERSATURATED_THRESH,
          analyses: [
            "per-bin saturation ratio (actual / Gaussian-expected)",
            "oversaturated zones (capital competing for volume)",
            "undersaturated zones (LP opportunity gaps)",
            "saturation Gini coefficient (inequality)",
            "saturation standard deviation",
            "directional saturation bias (left vs right)",
            "saturation gradient (slope across range)",
            "composite saturation score (0-100)",
            "ASCII saturation map",
          ],
        },
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Doctor failed: ${err.message}` }));
    }
  });

program
  .command("run")
  .description("Analyze bin saturation for HODLMM pools")
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

      const results: SaturationAnalysis[] = [];
      for (const pool of targets) {
        try {
          const analysis = await analyzeSaturation(pool);
          results.push(analysis);
        } catch (err: any) {
          results.push(makeErrorResult(pool, err.message));
        }
      }

      const summary = {
        poolsAnalyzed: results.length,
        avgSaturationScore: Math.round(
          results.reduce((s, r) => s + r.profile.saturationScore, 0) / results.length
        ),
        avgSaturation: Math.round(
          results.reduce((s, r) => s + r.profile.avgSaturation, 0) / results.length * 1000
        ) / 1000,
        avgGini: Math.round(
          results.reduce((s, r) => s + r.profile.saturationGini, 0) / results.length * 1000
        ) / 1000,
        totalOversaturatedZones: results.reduce((s, r) => s + r.profile.oversaturatedZones.length, 0),
        totalUndersaturatedZones: results.reduce((s, r) => s + r.profile.undersaturatedZones.length, 0),
        mostSaturated: results.reduce((best, r) =>
          r.profile.avgSaturation > best.profile.avgSaturation ? r : best, results[0]),
        lowestGini: results.reduce((best, r) =>
          r.profile.saturationGini < best.profile.saturationGini ? r : best, results[0]),
      };

      console.log(JSON.stringify({
        result: "saturation_analysis",
        data: { pools: results, summary },
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Run failed: ${err.message}` }));
    }
  });

program
  .command("status")
  .description("Quick saturation summary for top pools")
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
          const analysis = await analyzeSaturation(pool);
          summaries.push({
            pair: analysis.pair,
            poolId: analysis.poolId,
            tvlUsd: analysis.tvlUsd,
            saturationScore: analysis.profile.saturationScore,
            avgSaturation: analysis.profile.avgSaturation,
            medianSaturation: analysis.profile.medianSaturation,
            saturationGini: analysis.profile.saturationGini,
            oversaturatedBins: analysis.profile.oversaturatedBinCount,
            undersaturatedBins: analysis.profile.undersaturatedBinCount,
            oversaturatedCapitalUsd: analysis.profile.oversaturatedCapitalUsd,
            undersaturatedCapitalUsd: analysis.profile.undersaturatedCapitalUsd,
            directionalBias: analysis.profile.directionalBias,
            saturationGradient: analysis.profile.saturationGradient,
          });
        } catch {
          summaries.push({
            pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
            poolId: pool.poolId,
            tvlUsd: pool.tvlUsd,
            saturationScore: -1,
          });
        }
      }

      console.log(JSON.stringify({ result: "saturation_status", data: summaries }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Status failed: ${err.message}` }));
    }
  });

program.parse();
