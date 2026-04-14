#!/usr/bin/env bun
/**
 * hodlmm-bin-gradient.ts — Day 98 cocoa007 Bitflow Skills Comp
 *
 * Liquidity gradient analyzer — first/second derivatives of reserve
 * distributions, cliff/plateau detection, inflection points, gradient
 * symmetry around the active bin.
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

interface GradientPoint {
  binId: number;
  offset: number;
  value: number;
  firstDerivative: number;
  secondDerivative: number;
}

interface CliffZone {
  startBin: number;
  endBin: number;
  dropMagnitude: number;
  dropPct: number;
  direction: "down" | "up";
}

interface PlateauZone {
  startBin: number;
  endBin: number;
  width: number;
  avgValue: number;
  stability: number;
}

interface InflectionPoint {
  binId: number;
  offset: number;
  type: "concave-to-convex" | "convex-to-concave";
  curvatureChange: number;
}

interface GradientProfile {
  populatedBins: number;
  totalBins: number;
  scannedTvlUsd: number;
  maxGradient: number;
  avgAbsGradient: number;
  gradientSymmetry: number;
  leftSlopeAvg: number;
  rightSlopeAvg: number;
  cliffs: CliffZone[];
  plateaus: PlateauZone[];
  inflectionPoints: InflectionPoint[];
  smoothness: number;
  steepnessScore: number;
  gradientScore: number;
  asciiGradientMap: string;
}

interface GradientAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  profile: GradientProfile;
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

// -- Gradient math ------------------------------------------------------------

function computeGradientPoints(bins: BinReserves[], activeBinId: number): GradientPoint[] {
  const values = bins.map(b => b.totalUsd);
  const points: GradientPoint[] = [];

  for (let i = 0; i < bins.length; i++) {
    let firstDeriv = 0;
    if (i === 0) {
      firstDeriv = values[1] !== undefined ? values[1] - values[0] : 0;
    } else if (i === bins.length - 1) {
      firstDeriv = values[i] - values[i - 1];
    } else {
      firstDeriv = (values[i + 1] - values[i - 1]) / 2;
    }

    let secondDeriv = 0;
    if (i > 0 && i < bins.length - 1) {
      secondDeriv = values[i + 1] - 2 * values[i] + values[i - 1];
    }

    points.push({
      binId: bins[i].binId,
      offset: bins[i].binId - activeBinId,
      value: values[i],
      firstDerivative: Math.round(firstDeriv * 10000) / 10000,
      secondDerivative: Math.round(secondDeriv * 10000) / 10000,
    });
  }

  return points;
}

function detectCliffs(points: GradientPoint[], threshold: number): CliffZone[] {
  const cliffs: CliffZone[] = [];
  const maxVal = Math.max(...points.map(p => p.value), 0.01);

  for (let i = 1; i < points.length; i++) {
    const drop = Math.abs(points[i].value - points[i - 1].value);
    const dropPct = drop / maxVal;

    if (dropPct >= threshold) {
      const direction = points[i].value < points[i - 1].value ? "down" : "up";
      const existing = cliffs.length > 0 ? cliffs[cliffs.length - 1] : null;

      if (existing && existing.endBin === points[i - 1].binId && existing.direction === direction) {
        existing.endBin = points[i].binId;
        existing.dropMagnitude += drop;
        existing.dropPct = existing.dropMagnitude / maxVal;
      } else {
        cliffs.push({
          startBin: points[i - 1].binId,
          endBin: points[i].binId,
          dropMagnitude: Math.round(drop * 100) / 100,
          dropPct: Math.round(dropPct * 10000) / 10000,
          direction,
        });
      }
    }
  }

  return cliffs;
}

function detectPlateaus(points: GradientPoint[], varianceThreshold: number): PlateauZone[] {
  const plateaus: PlateauZone[] = [];
  const minWidth = 3;

  let start = 0;
  while (start < points.length) {
    if (points[start].value < 0.01) {
      start++;
      continue;
    }

    let end = start + 1;
    while (end < points.length) {
      const slice = points.slice(start, end + 1).map(p => p.value);
      const avg = slice.reduce((s, v) => s + v, 0) / slice.length;
      const variance = slice.reduce((s, v) => s + (v - avg) ** 2, 0) / slice.length;
      const cv = avg > 0 ? Math.sqrt(variance) / avg : 999;

      if (cv > varianceThreshold) break;
      end++;
    }

    const width = end - start;
    if (width >= minWidth) {
      const slice = points.slice(start, end).map(p => p.value);
      const avg = slice.reduce((s, v) => s + v, 0) / slice.length;
      const variance = slice.reduce((s, v) => s + (v - avg) ** 2, 0) / slice.length;
      const cv = avg > 0 ? Math.sqrt(variance) / avg : 0;

      plateaus.push({
        startBin: points[start].binId,
        endBin: points[end - 1].binId,
        width,
        avgValue: Math.round(avg * 100) / 100,
        stability: Math.round((1 - cv) * 10000) / 10000,
      });
      start = end;
    } else {
      start++;
    }
  }

  return plateaus;
}

function detectInflections(points: GradientPoint[]): InflectionPoint[] {
  const inflections: InflectionPoint[] = [];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1].secondDerivative;
    const curr = points[i].secondDerivative;

    if (prev !== 0 && curr !== 0 && Math.sign(prev) !== Math.sign(curr)) {
      const type = prev > 0 && curr < 0 ? "convex-to-concave" : "concave-to-convex";
      inflections.push({
        binId: points[i].binId,
        offset: points[i].offset,
        type,
        curvatureChange: Math.round(Math.abs(curr - prev) * 10000) / 10000,
      });
    }
  }

  return inflections.sort((a, b) => b.curvatureChange - a.curvatureChange);
}

function computeGradientSymmetry(points: GradientPoint[]): number {
  const center = points.findIndex(p => p.offset === 0);
  if (center < 0) return 0;

  const maxRadius = Math.min(center, points.length - 1 - center);
  if (maxRadius === 0) return 1;

  let symmetrySum = 0;
  let count = 0;

  for (let r = 1; r <= maxRadius; r++) {
    const left = points[center - r].value;
    const right = points[center + r].value;
    const maxVal = Math.max(left, right, 0.001);
    symmetrySum += 1 - Math.abs(left - right) / maxVal;
    count++;
  }

  return count > 0 ? Math.round((symmetrySum / count) * 1000) / 1000 : 0;
}

function computeSmoothness(points: GradientPoint[]): number {
  if (points.length < 3) return 1;

  const secondDerivs = points
    .filter(p => p.value > 0.01)
    .map(p => Math.abs(p.secondDerivative));

  if (secondDerivs.length === 0) return 1;

  const maxVal = Math.max(...points.map(p => p.value), 0.01);
  const normalizedRoughness = secondDerivs.reduce((s, v) => s + v, 0) / secondDerivs.length / maxVal;

  return Math.round(Math.max(0, Math.min(1, 1 - normalizedRoughness * 10)) * 1000) / 1000;
}

function computeSteepnessScore(points: GradientPoint[]): number {
  const absGradients = points.map(p => Math.abs(p.firstDerivative));
  const maxVal = Math.max(...points.map(p => p.value), 0.01);

  const normalizedGradients = absGradients.map(g => g / maxVal);
  const avgNormGradient = normalizedGradients.reduce((s, v) => s + v, 0) / normalizedGradients.length;
  const maxNormGradient = Math.max(...normalizedGradients);

  const score = (avgNormGradient * 50 + maxNormGradient * 50);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function computeGradientScore(
  smoothness: number,
  symmetry: number,
  steepness: number,
  cliffs: CliffZone[],
  plateaus: PlateauZone[]
): number {
  let score = 50;
  score += smoothness * 15;
  score += symmetry * 15;
  score -= Math.min(20, cliffs.length * 5);
  score += Math.min(10, plateaus.length * 3);
  score -= steepness * 0.1;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// -- ASCII gradient map -------------------------------------------------------

function buildGradientMap(
  bins: BinReserves[],
  points: GradientPoint[],
  activeBinId: number,
  cliffs: CliffZone[],
  inflections: InflectionPoint[]
): string {
  const populated = bins.filter(b => b.totalUsd > 0.01);
  if (populated.length === 0) return "(no populated bins)";

  const maxVal = Math.max(...bins.map(b => b.totalUsd), 0.001);
  const maxGrad = Math.max(...points.map(p => Math.abs(p.firstDerivative)), 0.001);
  const barWidth = 25;
  const gradWidth = 15;

  const cliffBins = new Set<number>();
  for (const c of cliffs) {
    cliffBins.add(c.startBin);
    cliffBins.add(c.endBin);
  }
  const inflectionBins = new Set(inflections.slice(0, 5).map(ip => ip.binId));

  const lines: string[] = [
    "GRADIENT MAP (liquidity + first derivative)",
    "",
    "  offset  |  $value  |  liquidity               | gradient        | flags",
    "  --------+----------+--------------------------+-----------------+------",
  ];

  const step = bins.length > 40 ? 2 : 1;
  for (let i = 0; i < bins.length; i += step) {
    const bin = bins[i];
    const pt = points[i];
    const offset = bin.binId - activeBinId;
    const label = `${offset >= 0 ? "+" : ""}${offset}`;
    const usd = fmtUsd(bin.totalUsd).padStart(7);

    const liqLen = Math.round((bin.totalUsd / maxVal) * barWidth);
    const liqBar = "\u2588".repeat(Math.max(0, liqLen));

    const gradNorm = pt.firstDerivative / maxGrad;
    const gradLen = Math.round(Math.abs(gradNorm) * gradWidth);
    let gradBar: string;
    if (gradNorm >= 0) {
      gradBar = " ".repeat(gradWidth) + "\u2592".repeat(Math.max(0, gradLen));
    } else {
      const pad = gradWidth - gradLen;
      gradBar = " ".repeat(Math.max(0, pad)) + "\u2591".repeat(Math.max(0, gradLen)) + " ".repeat(gradWidth);
    }

    const flags: string[] = [];
    if (offset === 0) flags.push("\u25c4");
    if (cliffBins.has(bin.binId)) flags.push("!");
    if (inflectionBins.has(bin.binId)) flags.push("~");

    lines.push(
      `  ${label.padStart(6)}  | ${usd} | ${liqBar.padEnd(barWidth)} | ${gradBar.substring(0, gradWidth * 2)} | ${flags.join("")}`
    );
  }

  lines.push("");
  lines.push("\u2588 = liquidity  \u2592 = positive gradient  \u2591 = negative gradient  ! = cliff  ~ = inflection  \u25c4 = active");
  return lines.join("\n");
}

// -- Profile ------------------------------------------------------------------

function buildProfile(bins: BinReserves[], activeBinId: number): GradientProfile {
  const populated = bins.filter(b => b.totalUsd > 0.01);
  const scannedTvl = populated.reduce((s, b) => s + b.totalUsd, 0);

  const points = computeGradientPoints(bins, activeBinId);
  const cliffs = detectCliffs(points, 0.15);
  const plateaus = detectPlateaus(points, 0.25);
  const inflectionPoints = detectInflections(points);
  const gradientSymmetry = computeGradientSymmetry(points);
  const smoothness = computeSmoothness(points);

  const absGradients = points.map(p => Math.abs(p.firstDerivative));
  const maxGradient = Math.round(Math.max(...absGradients) * 10000) / 10000;
  const avgAbsGradient = Math.round(
    (absGradients.reduce((s, v) => s + v, 0) / absGradients.length) * 10000
  ) / 10000;

  const centerIdx = points.findIndex(p => p.offset === 0);
  const leftPoints = centerIdx > 0 ? points.slice(0, centerIdx) : [];
  const rightPoints = centerIdx < points.length - 1 ? points.slice(centerIdx + 1) : [];

  const leftSlopeAvg = leftPoints.length > 0
    ? Math.round((leftPoints.reduce((s, p) => s + p.firstDerivative, 0) / leftPoints.length) * 10000) / 10000
    : 0;
  const rightSlopeAvg = rightPoints.length > 0
    ? Math.round((rightPoints.reduce((s, p) => s + p.firstDerivative, 0) / rightPoints.length) * 10000) / 10000
    : 0;

  const steepnessScore = computeSteepnessScore(points);
  const gradientScore = computeGradientScore(smoothness, gradientSymmetry, steepnessScore, cliffs, plateaus);

  const asciiGradientMap = buildGradientMap(bins, points, activeBinId, cliffs, inflectionPoints);

  return {
    populatedBins: populated.length,
    totalBins: bins.length,
    scannedTvlUsd: Math.round(scannedTvl * 100) / 100,
    maxGradient,
    avgAbsGradient,
    gradientSymmetry,
    leftSlopeAvg,
    rightSlopeAvg,
    cliffs,
    plateaus,
    inflectionPoints: inflectionPoints.slice(0, 10),
    smoothness,
    steepnessScore,
    gradientScore,
    asciiGradientMap,
  };
}

function buildRecommendation(pair: string, profile: GradientProfile): string {
  const parts: string[] = [];

  parts.push(
    `${pair} gradient analysis: steepness ${profile.steepnessScore}/100, ` +
    `smoothness ${(profile.smoothness * 100).toFixed(0)}%, ` +
    `symmetry ${(profile.gradientSymmetry * 100).toFixed(0)}%. ` +
    `Overall gradient score: ${profile.gradientScore}/100.`
  );

  parts.push(
    `Left slope avg: ${profile.leftSlopeAvg > 0 ? "+" : ""}${profile.leftSlopeAvg} ` +
    `(${profile.leftSlopeAvg > 0 ? "building toward center" : "declining from edge"}). ` +
    `Right slope avg: ${profile.rightSlopeAvg > 0 ? "+" : ""}${profile.rightSlopeAvg} ` +
    `(${profile.rightSlopeAvg < 0 ? "declining from center" : "building from center"}).`
  );

  if (profile.cliffs.length > 0) {
    parts.push(
      `${profile.cliffs.length} cliff zone(s) detected — sudden liquidity drop-offs ` +
      `where trades may face abrupt slippage increases. ` +
      `Largest cliff: ${(profile.cliffs[0].dropPct * 100).toFixed(1)}% drop.`
    );
  } else {
    parts.push("No cliff zones — liquidity transitions smoothly across the range.");
  }

  if (profile.plateaus.length > 0) {
    const totalPlateauWidth = profile.plateaus.reduce((s, p) => s + p.width, 0);
    parts.push(
      `${profile.plateaus.length} plateau zone(s) spanning ${totalPlateauWidth} bins — ` +
      `stable liquidity regions where trade execution is predictable.`
    );
  }

  if (profile.inflectionPoints.length > 0) {
    parts.push(
      `${profile.inflectionPoints.length} inflection point(s) — transitions between ` +
      `concave and convex curvature. Key structural boundaries in the liquidity landscape.`
    );
  }

  if (profile.gradientSymmetry > 0.7) {
    parts.push("High symmetry — liquidity builds and decays evenly around the active bin. " +
      "Balanced LP behavior on both sides.");
  } else if (profile.gradientSymmetry < 0.4) {
    parts.push("Low symmetry — significant imbalance between left and right sides. " +
      "LPs are directionally positioned, suggesting price expectation bias.");
  }

  if (profile.smoothness > 0.7) {
    parts.push("Smooth gradient — gradual transitions make execution predictable. " +
      "Good for larger trades that walk through multiple bins.");
  } else if (profile.smoothness < 0.3) {
    parts.push("Rough gradient — jagged transitions between bins. " +
      "Trade execution may be unpredictable across the range.");
  }

  return parts.join(" ");
}

// -- Main analysis ------------------------------------------------------------

async function analyzeGradient(pool: AppPool): Promise<GradientAnalysis> {
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

function makeErrorResult(pool: AppPool, errMsg: string): GradientAnalysis {
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
      maxGradient: 0, avgAbsGradient: 0, gradientSymmetry: 0,
      leftSlopeAvg: 0, rightSlopeAvg: 0,
      cliffs: [], plateaus: [], inflectionPoints: [],
      smoothness: 0, steepnessScore: 0, gradientScore: 0,
      asciiGradientMap: "",
    },
    recommendation: `Analysis failed: ${errMsg}`,
  };
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();

program
  .name("hodlmm-bin-gradient")
  .description("HODLMM Bin Gradient Analyzer — liquidity rate-of-change, cliffs, plateaus, inflections");

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
            "first derivative (rate of change)",
            "second derivative (curvature)",
            "cliff detection (sudden drops/rises)",
            "plateau detection (stable zones)",
            "inflection points (curvature sign changes)",
            "gradient symmetry around active bin",
            "smoothness score",
            "steepness score",
          ],
        },
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Doctor failed: ${err.message}` }));
    }
  });

program
  .command("run")
  .description("Analyze liquidity gradient for HODLMM pools")
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

      const results: GradientAnalysis[] = [];
      for (const pool of targets) {
        try {
          const analysis = await analyzeGradient(pool);
          results.push(analysis);
        } catch (err: any) {
          results.push(makeErrorResult(pool, err.message));
        }
      }

      const summary = {
        poolsAnalyzed: results.length,
        avgGradientScore: Math.round(
          results.reduce((s, r) => s + r.profile.gradientScore, 0) / results.length
        ),
        avgSmoothness: Math.round(
          results.reduce((s, r) => s + r.profile.smoothness, 0) / results.length * 1000
        ) / 1000,
        avgSymmetry: Math.round(
          results.reduce((s, r) => s + r.profile.gradientSymmetry, 0) / results.length * 1000
        ) / 1000,
        totalCliffs: results.reduce((s, r) => s + r.profile.cliffs.length, 0),
        totalPlateaus: results.reduce((s, r) => s + r.profile.plateaus.length, 0),
        totalInflections: results.reduce((s, r) => s + r.profile.inflectionPoints.length, 0),
        steepest: results.reduce((best, r) =>
          r.profile.steepnessScore > best.profile.steepnessScore ? r : best, results[0]),
        smoothest: results.reduce((best, r) =>
          r.profile.smoothness > best.profile.smoothness ? r : best, results[0]),
      };

      console.log(JSON.stringify({
        result: "gradient_analysis",
        data: { pools: results, summary },
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Run failed: ${err.message}` }));
    }
  });

program
  .command("status")
  .description("Quick gradient summary for top pools")
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
          const analysis = await analyzeGradient(pool);
          summaries.push({
            pair: analysis.pair,
            poolId: analysis.poolId,
            tvlUsd: analysis.tvlUsd,
            gradientScore: analysis.profile.gradientScore,
            steepnessScore: analysis.profile.steepnessScore,
            smoothness: analysis.profile.smoothness,
            symmetry: analysis.profile.gradientSymmetry,
            cliffs: analysis.profile.cliffs.length,
            plateaus: analysis.profile.plateaus.length,
            inflections: analysis.profile.inflectionPoints.length,
            leftSlope: analysis.profile.leftSlopeAvg,
            rightSlope: analysis.profile.rightSlopeAvg,
          });
        } catch {
          summaries.push({
            pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
            poolId: pool.poolId,
            tvlUsd: pool.tvlUsd,
            gradientScore: -1,
          });
        }
      }

      console.log(JSON.stringify({ result: "gradient_status", data: summaries }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Status failed: ${err.message}` }));
    }
  });

program.parse();
