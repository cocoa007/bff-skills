#!/usr/bin/env bun
/**
 * hodlmm-bin-convexity.ts
 *
 * HODLMM Bin Convexity Analyzer — second-derivative analysis of the liquidity
 * distribution curve across DLMM bins. Measures curvature intensity, detects
 * inflection points, classifies overall shape (CONVEX/CONCAVE/LINEAR/SADDLE/
 * IRREGULAR), and profiles acceleration zones where liquidity ramps up or
 * tapers off.
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 96).
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 30;

type ShapeClass = "CONVEX" | "CONCAVE" | "LINEAR" | "SADDLE" | "IRREGULAR";

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

interface InflectionPoint {
  binId: number;
  offset: number;
  secondDerivative: number;
  type: "concave-to-convex" | "convex-to-concave";
  magnitudeUsd: number;
}

interface CurvatureZone {
  startBin: number;
  endBin: number;
  startOffset: number;
  endOffset: number;
  avgCurvature: number;
  type: "accelerating" | "decelerating" | "flat";
  totalUsd: number;
}

interface ConvexityProfile {
  populatedBins: number;
  totalBins: number;
  scannedTvlUsd: number;
  meanCurvature: number;
  maxCurvature: number;
  minCurvature: number;
  curvatureStdDev: number;
  convexityScore: number;
  shapeClass: ShapeClass;
  inflectionPoints: InflectionPoint[];
  curvatureZones: CurvatureZone[];
  leftWing: { avgCurvature: number; dominantShape: "convex" | "concave" | "flat" };
  rightWing: { avgCurvature: number; dominantShape: "convex" | "concave" | "flat" };
  peakSharpness: number;
  curvatureEnergy: number;
  asciiCurvatureMap: string;
}

interface ConvexityAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  profile: ConvexityProfile;
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

// -- Convexity analysis -------------------------------------------------------

function computeSecondDerivatives(bins: BinReserves[]): number[] {
  const n = bins.length;
  if (n < 3) return [];
  const d2: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    const prev = bins[i - 1].totalUsd;
    const curr = bins[i].totalUsd;
    const next = bins[i + 1].totalUsd;
    d2.push(next - 2 * curr + prev);
  }
  return d2;
}

function findInflectionPoints(
  bins: BinReserves[],
  d2: number[],
  activeBinId: number
): InflectionPoint[] {
  const points: InflectionPoint[] = [];
  for (let i = 1; i < d2.length; i++) {
    if (d2[i - 1] * d2[i] < 0) {
      const bin = bins[i + 1];
      points.push({
        binId: bin.binId,
        offset: bin.binId - activeBinId,
        secondDerivative: Math.round(d2[i] * 100) / 100,
        type: d2[i - 1] < 0 ? "concave-to-convex" : "convex-to-concave",
        magnitudeUsd: Math.round(bin.totalUsd * 100) / 100,
      });
    }
  }
  return points;
}

function identifyCurvatureZones(
  bins: BinReserves[],
  d2: number[],
  activeBinId: number
): CurvatureZone[] {
  if (d2.length === 0) return [];

  const zones: CurvatureZone[] = [];
  const threshold = 0.01;

  let zoneStart = 0;
  let currentType: CurvatureZone["type"] =
    d2[0] > threshold ? "accelerating" : d2[0] < -threshold ? "decelerating" : "flat";

  for (let i = 1; i <= d2.length; i++) {
    const newType: CurvatureZone["type"] =
      i < d2.length
        ? d2[i] > threshold ? "accelerating" : d2[i] < -threshold ? "decelerating" : "flat"
        : currentType;

    if (newType !== currentType || i === d2.length) {
      const startBin = bins[zoneStart + 1];
      const endBin = bins[i];
      const zoneBins = bins.slice(zoneStart + 1, i + 1);
      const zoneD2 = d2.slice(zoneStart, i);
      const avgCurv = zoneD2.length > 0
        ? zoneD2.reduce((s, v) => s + v, 0) / zoneD2.length
        : 0;
      const totalUsd = zoneBins.reduce((s, b) => s + b.totalUsd, 0);

      zones.push({
        startBin: startBin.binId,
        endBin: endBin.binId,
        startOffset: startBin.binId - activeBinId,
        endOffset: endBin.binId - activeBinId,
        avgCurvature: Math.round(avgCurv * 1000) / 1000,
        type: currentType,
        totalUsd: Math.round(totalUsd * 100) / 100,
      });

      zoneStart = i;
      currentType = newType;
    }
  }

  return zones;
}

function computeWingShape(
  d2Values: number[]
): { avgCurvature: number; dominantShape: "convex" | "concave" | "flat" } {
  if (d2Values.length === 0) return { avgCurvature: 0, dominantShape: "flat" };
  const avg = d2Values.reduce((s, v) => s + v, 0) / d2Values.length;
  const dominant = avg > 0.1 ? "convex" : avg < -0.1 ? "concave" : "flat";
  return { avgCurvature: Math.round(avg * 1000) / 1000, dominantShape: dominant };
}

function computePeakSharpness(bins: BinReserves[], activeBinId: number): number {
  const activeBin = bins.find(b => b.binId === activeBinId);
  if (!activeBin || activeBin.totalUsd < 0.01) return 0;

  const neighbors = bins.filter(b => Math.abs(b.binId - activeBinId) === 1);
  if (neighbors.length === 0) return 100;

  const avgNeighbor = neighbors.reduce((s, b) => s + b.totalUsd, 0) / neighbors.length;
  if (avgNeighbor === 0) return activeBin.totalUsd > 0 ? 100 : 0;

  const ratio = activeBin.totalUsd / avgNeighbor;
  return Math.min(100, Math.round(Math.max(0, (ratio - 1) * 50)));
}

function computeCurvatureEnergy(d2: number[]): number {
  if (d2.length === 0) return 0;
  const energy = d2.reduce((s, v) => s + v * v, 0);
  return Math.round(Math.sqrt(energy / d2.length) * 1000) / 1000;
}

function classifyShape(
  d2: number[],
  inflections: InflectionPoint[],
  leftWing: { dominantShape: string },
  rightWing: { dominantShape: string },
  peakSharpness: number
): ShapeClass {
  if (d2.length === 0) return "LINEAR";

  const positiveCount = d2.filter(v => v > 0.01).length;
  const negativeCount = d2.filter(v => v < -0.01).length;
  const total = d2.length;

  const positiveFrac = positiveCount / total;
  const negativeFrac = negativeCount / total;

  if (positiveFrac > 0.65) return "CONVEX";
  if (negativeFrac > 0.65) return "CONCAVE";

  if (positiveFrac < 0.15 && negativeFrac < 0.15) return "LINEAR";

  if (inflections.length <= 2 &&
    leftWing.dominantShape !== rightWing.dominantShape &&
    leftWing.dominantShape !== "flat" &&
    rightWing.dominantShape !== "flat") {
    return "SADDLE";
  }

  return "IRREGULAR";
}

function computeConvexityScore(
  d2: number[],
  shapeClass: ShapeClass,
  inflections: InflectionPoint[],
  peakSharpness: number,
  curvatureEnergy: number
): number {
  let score = 50;

  if (shapeClass === "CONCAVE") score += 20;
  else if (shapeClass === "CONVEX") score -= 10;
  else if (shapeClass === "SADDLE") score -= 5;
  else if (shapeClass === "LINEAR") score += 5;

  score += Math.min(peakSharpness / 5, 15);

  const inflectionPenalty = Math.min(inflections.length * 3, 15);
  score -= inflectionPenalty;

  score += Math.min(curvatureEnergy * 2, 10);

  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildCurvatureMap(
  bins: BinReserves[],
  d2: number[],
  activeBinId: number
): string {
  if (d2.length === 0) return "(insufficient data)";

  const lines: string[] = ["CURVATURE MAP (second derivative)", ""];
  lines.push("  offset  |  $value  |  d²  | shape");
  lines.push("  --------+----------+------+----------------------------------");

  const maxAbs = Math.max(...d2.map(Math.abs), 0.001);
  const barWidth = 25;

  const step = bins.length > 40 ? 2 : 1;
  for (let i = 1; i < bins.length - 1; i += step) {
    const bin = bins[i];
    const d2Val = d2[i - 1];
    const offset = bin.binId - activeBinId;
    const label = `${offset >= 0 ? "+" : ""}${offset}`;
    const usd = fmtUsd(bin.totalUsd).padStart(7);
    const d2Str = (d2Val >= 0 ? "+" : "") + d2Val.toFixed(1);

    const normalizedLen = Math.round(Math.abs(d2Val) / maxAbs * barWidth);
    const barChar = d2Val > 0.01 ? "▲" : d2Val < -0.01 ? "▼" : "─";
    const bar = barChar.repeat(Math.max(1, normalizedLen));
    const marker = offset === 0 ? " ◄ active" : "";

    lines.push(`  ${label.padStart(6)}  | ${usd} | ${d2Str.padStart(4)} | ${bar}${marker}`);
  }

  lines.push("");
  lines.push("▲ = convex (accelerating)    ▼ = concave (decelerating)    ─ = flat");
  return lines.join("\n");
}

// -- Profile ------------------------------------------------------------------

function buildProfile(
  bins: BinReserves[],
  activeBinId: number
): ConvexityProfile {
  const populated = bins.filter(b => b.totalUsd > 0.01);
  const scannedTvl = populated.reduce((s, b) => s + b.totalUsd, 0);

  const d2 = computeSecondDerivatives(bins);
  const inflectionPoints = findInflectionPoints(bins, d2, activeBinId);
  const curvatureZones = identifyCurvatureZones(bins, d2, activeBinId);

  const d2Values = d2.filter(v => !isNaN(v));
  const meanCurvature = d2Values.length > 0
    ? d2Values.reduce((s, v) => s + v, 0) / d2Values.length : 0;
  const maxCurvature = d2Values.length > 0 ? Math.max(...d2Values) : 0;
  const minCurvature = d2Values.length > 0 ? Math.min(...d2Values) : 0;
  const variance = d2Values.length > 0
    ? d2Values.reduce((s, v) => s + (v - meanCurvature) ** 2, 0) / d2Values.length : 0;
  const curvatureStdDev = Math.sqrt(variance);

  const midIdx = Math.floor(d2Values.length / 2);
  const leftD2 = d2Values.slice(0, midIdx);
  const rightD2 = d2Values.slice(midIdx);
  const leftWing = computeWingShape(leftD2);
  const rightWing = computeWingShape(rightD2);

  const peakSharpness = computePeakSharpness(bins, activeBinId);
  const curvatureEnergy = computeCurvatureEnergy(d2Values);

  const shapeClass = classifyShape(d2Values, inflectionPoints, leftWing, rightWing, peakSharpness);
  const convexityScore = computeConvexityScore(
    d2Values, shapeClass, inflectionPoints, peakSharpness, curvatureEnergy
  );

  const asciiCurvatureMap = buildCurvatureMap(bins, d2, activeBinId);

  return {
    populatedBins: populated.length,
    totalBins: bins.length,
    scannedTvlUsd: Math.round(scannedTvl * 100) / 100,
    meanCurvature: Math.round(meanCurvature * 1000) / 1000,
    maxCurvature: Math.round(maxCurvature * 100) / 100,
    minCurvature: Math.round(minCurvature * 100) / 100,
    curvatureStdDev: Math.round(curvatureStdDev * 1000) / 1000,
    convexityScore,
    shapeClass,
    inflectionPoints,
    curvatureZones,
    leftWing,
    rightWing,
    peakSharpness,
    curvatureEnergy,
    asciiCurvatureMap,
  };
}

function buildRecommendation(pair: string, profile: ConvexityProfile): string {
  const parts: string[] = [];

  parts.push(
    `${pair} curvature: ${profile.shapeClass} (score ${profile.convexityScore}/100). ` +
    `Mean d²=${profile.meanCurvature}, energy=${profile.curvatureEnergy}, ` +
    `peak sharpness=${profile.peakSharpness}/100.`
  );

  parts.push(
    `${profile.inflectionPoints.length} inflection point(s) detected across ` +
    `${profile.curvatureZones.length} curvature zone(s).`
  );

  parts.push(
    `Wings: left=${profile.leftWing.dominantShape} (d²=${profile.leftWing.avgCurvature}), ` +
    `right=${profile.rightWing.dominantShape} (d²=${profile.rightWing.avgCurvature}).`
  );

  if (profile.shapeClass === "CONCAVE") {
    parts.push(
      "Dome-shaped distribution — liquidity peaks near center and tapers smoothly. " +
      "Well-suited for range-bound trading. LPs benefit from concentrated fee capture."
    );
  } else if (profile.shapeClass === "CONVEX") {
    parts.push(
      "Bowl-shaped distribution — liquidity is heavier at the edges than the center. " +
      "Unusual pattern that may indicate stale positions or deliberate range bracketing. " +
      "Active bin may have weak depth despite apparent TVL."
    );
  } else if (profile.shapeClass === "LINEAR") {
    parts.push(
      "Near-linear distribution — minimal curvature. Liquidity changes gradually " +
      "across bins. Predictable depth profile but potentially less capital efficient."
    );
  } else if (profile.shapeClass === "SADDLE") {
    parts.push(
      "Saddle-shaped — opposing curvatures on each side of the active bin. " +
      "Left and right wings have different profiles. May indicate asymmetric " +
      "market expectations or mixed LP strategies."
    );
  } else {
    parts.push(
      "Irregular curvature — multiple shape changes across the distribution. " +
      "Complex liquidity landscape with varied LP strategies. Monitor inflection " +
      "points where curvature flips — these are potential fragility boundaries."
    );
  }

  if (profile.peakSharpness > 70) {
    parts.push("Sharp peak at active bin — high concentration but fragile. Small price moves could shift trading to poorly supported adjacent bins.");
  } else if (profile.peakSharpness > 40) {
    parts.push("Moderate peak at active bin — reasonable concentration with some cushion from neighboring bins.");
  }

  const accelZones = profile.curvatureZones.filter(z => z.type === "accelerating");
  const decelZones = profile.curvatureZones.filter(z => z.type === "decelerating");
  if (accelZones.length > 0 || decelZones.length > 0) {
    parts.push(
      `${accelZones.length} acceleration zone(s) (liquidity ramping up) and ` +
      `${decelZones.length} deceleration zone(s) (liquidity tapering off).`
    );
  }

  return parts.join(" ");
}

// -- Main analysis ------------------------------------------------------------

async function analyzeConvexity(pool: AppPool): Promise<ConvexityAnalysis> {
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

function makeErrorResult(pool: AppPool, errMsg: string): ConvexityAnalysis {
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
      meanCurvature: 0, maxCurvature: 0, minCurvature: 0, curvatureStdDev: 0,
      convexityScore: 0, shapeClass: "LINEAR",
      inflectionPoints: [], curvatureZones: [],
      leftWing: { avgCurvature: 0, dominantShape: "flat" },
      rightWing: { avgCurvature: 0, dominantShape: "flat" },
      peakSharpness: 0, curvatureEnergy: 0, asciiCurvatureMap: "",
    },
    recommendation: `Analysis failed: ${errMsg}`,
  };
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();

program
  .name("hodlmm-bin-convexity")
  .description("HODLMM Bin Convexity Analyzer — second-derivative curvature profiling of liquidity distribution");

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
          metrics: [
            "second derivative", "inflection points", "curvature zones",
            "peak sharpness", "curvature energy", "wing shape analysis",
          ],
        },
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Doctor failed: ${err.message}` }));
    }
  });

program
  .command("run")
  .description("Analyze curvature profile for HODLMM pools")
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

      const results: ConvexityAnalysis[] = [];
      for (const pool of targets) {
        try {
          const analysis = await analyzeConvexity(pool);
          results.push(analysis);
        } catch (err: any) {
          results.push(makeErrorResult(pool, err.message));
        }
      }

      const summary = {
        poolsAnalyzed: results.length,
        shapes: {
          CONVEX: results.filter(r => r.profile.shapeClass === "CONVEX").length,
          CONCAVE: results.filter(r => r.profile.shapeClass === "CONCAVE").length,
          LINEAR: results.filter(r => r.profile.shapeClass === "LINEAR").length,
          SADDLE: results.filter(r => r.profile.shapeClass === "SADDLE").length,
          IRREGULAR: results.filter(r => r.profile.shapeClass === "IRREGULAR").length,
        },
        avgConvexityScore: Math.round(
          results.reduce((s, r) => s + r.profile.convexityScore, 0) / results.length
        ),
        avgPeakSharpness: Math.round(
          results.reduce((s, r) => s + r.profile.peakSharpness, 0) / results.length
        ),
        totalInflectionPoints: results.reduce(
          (s, r) => s + r.profile.inflectionPoints.length, 0
        ),
        sharpestPeak: results.reduce((best, r) =>
          r.profile.peakSharpness > best.profile.peakSharpness ? r : best, results[0]),
        smoothest: results.reduce((best, r) =>
          r.profile.curvatureEnergy < best.profile.curvatureEnergy ? r : best, results[0]),
      };

      console.log(JSON.stringify({
        result: "convexity_analysis",
        data: { pools: results, summary },
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Run failed: ${err.message}` }));
    }
  });

program
  .command("status")
  .description("Quick curvature summary for top pools")
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
          const analysis = await analyzeConvexity(pool);
          summaries.push({
            pair: analysis.pair,
            poolId: analysis.poolId,
            tvlUsd: analysis.tvlUsd,
            convexityScore: analysis.profile.convexityScore,
            shapeClass: analysis.profile.shapeClass,
            meanCurvature: analysis.profile.meanCurvature,
            peakSharpness: analysis.profile.peakSharpness,
            curvatureEnergy: analysis.profile.curvatureEnergy,
            inflectionPoints: analysis.profile.inflectionPoints.length,
            leftWing: analysis.profile.leftWing.dominantShape,
            rightWing: analysis.profile.rightWing.dominantShape,
          });
        } catch {
          summaries.push({
            pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
            poolId: pool.poolId,
            tvlUsd: pool.tvlUsd,
            convexityScore: -1,
          });
        }
      }

      console.log(JSON.stringify({ result: "convexity_status", data: summaries }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Status failed: ${err.message}` }));
    }
  });

program.parse();
