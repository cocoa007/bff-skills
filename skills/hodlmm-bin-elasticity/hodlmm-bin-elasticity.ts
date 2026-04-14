#!/usr/bin/env bun
/**
 * hodlmm-bin-elasticity.ts — Day 103 cocoa007 Bitflow Skills Comp
 *
 * Bin reserve elasticity analyzer — measures how rapidly reserves decay
 * as distance from active bin increases. Fits exponential decay curves,
 * computes elasticity coefficients, asymmetry between buy/sell sides,
 * half-life distance, effective range, and composite elasticity scoring.
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

interface DecayCurve {
  coefficient: number;
  rSquared: number;
  halfLife: number;
  effectiveRange: number;
  peakReserveUsd: number;
  dataPoints: number;
}

interface ElasticityProfile {
  populatedBins: number;
  scannedTvlUsd: number;
  activeBinTvlUsd: number;
  activeBinShare: number;

  leftCurve: DecayCurve;
  rightCurve: DecayCurve;
  combinedCurve: DecayCurve;

  asymmetryRatio: number;
  asymmetryDirection: "left-heavy" | "right-heavy" | "balanced";

  elasticityClass: "rigid" | "stiff" | "moderate" | "elastic" | "hyper-elastic";
  concentrationIndex: number;
  taperSmoothness: number;

  leftReserveProfile: number[];
  rightReserveProfile: number[];

  outlierBins: { binId: number; offset: number; reserveUsd: number; expectedUsd: number; ratio: number }[];

  elasticityScore: number;
  asciiDecayMap: string;
}

interface ElasticityAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  profile: ElasticityProfile;
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

// -- Elasticity Analysis ------------------------------------------------------

function fitExponentialDecay(distances: number[], reserves: number[]): DecayCurve {
  if (distances.length < 2) {
    return { coefficient: 0, rSquared: 0, halfLife: Infinity, effectiveRange: 0, peakReserveUsd: reserves[0] ?? 0, dataPoints: distances.length };
  }

  const peak = reserves[0] ?? 0;
  if (peak <= 0) {
    return { coefficient: 0, rSquared: 0, halfLife: Infinity, effectiveRange: 0, peakReserveUsd: 0, dataPoints: distances.length };
  }

  const logRatios: number[] = [];
  const validDistances: number[] = [];
  for (let i = 0; i < reserves.length; i++) {
    if (reserves[i] > 0 && distances[i] > 0) {
      logRatios.push(Math.log(reserves[i] / peak));
      validDistances.push(distances[i]);
    }
  }

  if (validDistances.length < 2) {
    return { coefficient: 0, rSquared: 0, halfLife: Infinity, effectiveRange: distances.length, peakReserveUsd: peak, dataPoints: distances.length };
  }

  const n = validDistances.length;
  const sumX = validDistances.reduce((a, b) => a + b, 0);
  const sumY = logRatios.reduce((a, b) => a + b, 0);
  const sumXY = validDistances.reduce((s, x, i) => s + x * logRatios[i], 0);
  const sumX2 = validDistances.reduce((s, x) => s + x * x, 0);

  const denom = n * sumX2 - sumX * sumX;
  const lambda = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const coefficient = Math.abs(lambda);

  const meanY = sumY / n;
  const ssRes = validDistances.reduce((s, x, i) => {
    const predicted = lambda * x;
    return s + (logRatios[i] - predicted) ** 2;
  }, 0);
  const ssTot = logRatios.reduce((s, y) => s + (y - meanY) ** 2, 0);
  const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  const halfLife = coefficient > 0 ? Math.LN2 / coefficient : Infinity;

  let effectiveRange = distances.length;
  const threshold = peak * 0.05;
  for (let i = 0; i < reserves.length; i++) {
    if (reserves[i] < threshold) {
      effectiveRange = distances[i] || i;
      break;
    }
  }

  return {
    coefficient: Number(coefficient.toFixed(6)),
    rSquared: Number(rSquared.toFixed(4)),
    halfLife: Number(Math.min(halfLife, 999).toFixed(2)),
    effectiveRange,
    peakReserveUsd: peak,
    dataPoints: distances.length,
  };
}

function classifyElasticity(coeff: number): "rigid" | "stiff" | "moderate" | "elastic" | "hyper-elastic" {
  if (coeff < 0.02) return "rigid";
  if (coeff < 0.05) return "stiff";
  if (coeff < 0.12) return "moderate";
  if (coeff < 0.25) return "elastic";
  return "hyper-elastic";
}

function computeTaperSmoothness(reserves: number[]): number {
  if (reserves.length < 3) return 1;

  let totalJerk = 0;
  let maxReserve = Math.max(...reserves, 1);
  for (let i = 1; i < reserves.length - 1; i++) {
    const secondDeriv = reserves[i + 1] - 2 * reserves[i] + reserves[i - 1];
    totalJerk += Math.abs(secondDeriv) / maxReserve;
  }

  const avgJerk = totalJerk / (reserves.length - 2);
  return Number(Math.max(0, Math.min(1, 1 - avgJerk)).toFixed(4));
}

function findOutliers(
  bins: BinReserves[],
  activeBinId: number,
  curve: DecayCurve,
  side: "left" | "right"
): { binId: number; offset: number; reserveUsd: number; expectedUsd: number; ratio: number }[] {
  const outliers: typeof bins extends any[] ? { binId: number; offset: number; reserveUsd: number; expectedUsd: number; ratio: number }[] : never = [];
  if (curve.coefficient <= 0 || curve.peakReserveUsd <= 0) return outliers;

  for (const bin of bins) {
    const offset = Math.abs(bin.binId - activeBinId);
    if (offset === 0) continue;
    const expected = curve.peakReserveUsd * Math.exp(-curve.coefficient * offset);
    if (expected < 0.01) continue;
    const ratio = bin.totalUsd / expected;
    if (ratio > 3 || (ratio < 0.33 && bin.totalUsd > 1)) {
      outliers.push({ binId: bin.binId, offset: side === "left" ? -offset : offset, reserveUsd: bin.totalUsd, expectedUsd: Number(expected.toFixed(2)), ratio: Number(ratio.toFixed(2)) });
    }
  }

  return outliers.sort((a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1)).slice(0, 5);
}

function buildAsciiDecayMap(
  leftReserves: number[],
  rightReserves: number[],
  activeBinReserve: number,
  activeBinId: number
): string {
  const allReserves = [...leftReserves.reverse(), activeBinReserve, ...rightReserves];
  const maxR = Math.max(...allReserves, 1);
  const width = 40;
  const lines: string[] = ["ELASTICITY DECAY MAP (left ← active → right)"];

  const startOffset = -leftReserves.length;
  for (let i = 0; i < allReserves.length; i++) {
    const offset = startOffset + i;
    const barLen = Math.round((allReserves[i] / maxR) * width);
    const marker = offset === 0 ? "*" : " ";
    const bar = "█".repeat(Math.max(barLen, 0)) + "░".repeat(Math.max(width - barLen, 0));
    const label = `${offset >= 0 ? "+" : ""}${offset}`;
    lines.push(`${label.padStart(4)}${marker}| ${bar} $${fmtUsd(allReserves[i])}`);
  }

  leftReserves.reverse();
  return lines.join("\n");
}

function analyzeElasticity(bins: BinReserves[], activeBinId: number): ElasticityProfile {
  const populated = bins.filter((b) => b.totalUsd > 0);
  const totalTvl = bins.reduce((s, b) => s + b.totalUsd, 0);
  const activeBin = bins.find((b) => b.binId === activeBinId);
  const activeBinTvl = activeBin?.totalUsd ?? 0;
  const activeBinShare = totalTvl > 0 ? activeBinTvl / totalTvl : 0;

  const leftBins = bins.filter((b) => b.binId < activeBinId).sort((a, b) => b.binId - a.binId);
  const rightBins = bins.filter((b) => b.binId > activeBinId).sort((a, b) => a.binId - b.binId);

  const leftDistances = leftBins.map((b) => activeBinId - b.binId);
  const leftReserves = leftBins.map((b) => b.totalUsd);
  const rightDistances = rightBins.map((b) => b.binId - activeBinId);
  const rightReserves = rightBins.map((b) => b.totalUsd);

  const allDistances = [...leftDistances, ...rightDistances].sort((a, b) => a - b);
  const allReserves = allDistances.map((d) => {
    const leftBin = leftBins.find((b) => activeBinId - b.binId === d);
    const rightBin = rightBins.find((b) => b.binId - activeBinId === d);
    const lv = leftBin?.totalUsd ?? 0;
    const rv = rightBin?.totalUsd ?? 0;
    return (lv + rv) / (lv > 0 && rv > 0 ? 2 : 1);
  });

  const leftCurve = fitExponentialDecay(leftDistances, leftReserves);
  const rightCurve = fitExponentialDecay(rightDistances, rightReserves);

  const uniqueDistances = [...new Set(allDistances)].sort((a, b) => a - b);
  const avgReserves = uniqueDistances.map((d) => {
    const vals = allDistances.reduce((acc: number[], dist, i) => {
      if (dist === d) acc.push(allReserves[i]);
      return acc;
    }, []);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  });
  const combinedCurve = fitExponentialDecay(uniqueDistances, avgReserves);

  const leftTvl = leftBins.reduce((s, b) => s + b.totalUsd, 0);
  const rightTvl = rightBins.reduce((s, b) => s + b.totalUsd, 0);
  const maxSide = Math.max(leftTvl, rightTvl);
  const minSide = Math.min(leftTvl, rightTvl);
  const asymmetryRatio = minSide > 0 ? maxSide / minSide : maxSide > 0 ? Infinity : 1;
  const asymmetryDirection: "left-heavy" | "right-heavy" | "balanced" =
    asymmetryRatio < 1.5 ? "balanced" : leftTvl > rightTvl ? "left-heavy" : "right-heavy";

  const elasticityClass = classifyElasticity(combinedCurve.coefficient);

  const concentrationIndex = totalTvl > 0
    ? bins.reduce((s, b) => s + (b.totalUsd / totalTvl) ** 2, 0)
    : 0;

  const taperSmoothness = computeTaperSmoothness([
    ...leftReserves.reverse(),
    activeBinTvl,
    ...rightReserves,
  ]);
  leftReserves.reverse();

  const leftOutliers = findOutliers(leftBins, activeBinId, leftCurve, "left");
  const rightOutliers = findOutliers(rightBins, activeBinId, rightCurve, "right");
  const outlierBins = [...leftOutliers, ...rightOutliers].sort((a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1)).slice(0, 5);

  // Composite scoring
  const fitQuality = combinedCurve.rSquared * 25;
  const smoothnessScore = taperSmoothness * 25;
  const balanceScore = Math.max(0, 1 - Math.abs(Math.log(Math.max(asymmetryRatio, 0.01))) / 2) * 20;
  const rangeScore = Math.min(1, combinedCurve.effectiveRange / BIN_SCAN_RADIUS) * 15;
  const outlierPenalty = Math.min(15, outlierBins.length * 3);
  const elasticityScore = Math.round(Math.min(100, Math.max(0, fitQuality + smoothnessScore + balanceScore + rangeScore + 15 - outlierPenalty)));

  const leftReserveProfile = leftReserves.map((r) => Number(r.toFixed(2)));
  const rightReserveProfile = rightReserves.map((r) => Number(r.toFixed(2)));

  const asciiDecayMap = buildAsciiDecayMap(
    [...leftReserves].reverse(),
    rightReserves,
    activeBinTvl,
    activeBinId
  );

  return {
    populatedBins: populated.length,
    scannedTvlUsd: totalTvl,
    activeBinTvlUsd: activeBinTvl,
    activeBinShare: Number(activeBinShare.toFixed(4)),
    leftCurve,
    rightCurve,
    combinedCurve,
    asymmetryRatio: Number(Math.min(asymmetryRatio, 999).toFixed(3)),
    asymmetryDirection,
    elasticityClass,
    concentrationIndex: Number(concentrationIndex.toFixed(6)),
    taperSmoothness,
    leftReserveProfile,
    rightReserveProfile,
    outlierBins,
    elasticityScore,
    asciiDecayMap,
  };
}

function generateRecommendation(p: ElasticityProfile): string {
  const parts: string[] = [];

  switch (p.elasticityClass) {
    case "rigid":
      parts.push("Near-flat reserve distribution — liquidity spread broadly with minimal decay. Low concentration risk but diluted fee capture.");
      break;
    case "stiff":
      parts.push("Gentle reserve taper — liquidity reaches far from active price. Good for volatile pairs but may underperform in tight ranges.");
      break;
    case "moderate":
      parts.push("Balanced elasticity — reserves decay at a healthy rate. Good tradeoff between depth and range coverage.");
      break;
    case "elastic":
      parts.push("Sharp reserve decay — liquidity concentrated near active price. High fee capture efficiency but vulnerable to price moves.");
      break;
    case "hyper-elastic":
      parts.push("Extreme concentration — reserves drop off very rapidly. Maximum fee capture at current price but high rebalance risk.");
      break;
  }

  if (p.asymmetryDirection !== "balanced") {
    parts.push(`Reserve asymmetry: ${p.asymmetryDirection} (${p.asymmetryRatio.toFixed(1)}x ratio). Directional bias in liquidity provision.`);
  }

  if (p.combinedCurve.rSquared < 0.5) {
    parts.push("Poor exponential fit — reserve decay is irregular, not following a clean curve. Multiple LP strategies may be overlapping.");
  }

  if (p.outlierBins.length > 2) {
    parts.push(`${p.outlierBins.length} outlier bins deviate significantly from the decay curve. Possible whale positions or strategic placements.`);
  }

  if (p.taperSmoothness < 0.5) {
    parts.push("Rough taper profile — reserves change abruptly between adjacent bins. May cause uneven slippage.");
  }

  const hl = p.combinedCurve.halfLife;
  if (hl < Infinity && hl < 999) {
    parts.push(`Half-life: ${hl.toFixed(1)} bins — reserves drop to 50% within ${Math.ceil(hl)} bins of active price.`);
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

  const results: ElasticityAnalysis[] = [];
  for (const pool of targets) {
    const poolId = pool.poolId!;
    try {
      const activeBin = pool.activeBinId ?? (await getActiveBin(poolId));
      const bins = await scanBins(poolId, activeBin, pool, BIN_SCAN_RADIUS);
      const profile = analyzeElasticity(bins, activeBin);
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
        profile: { ...profile, leftReserveProfile: [], rightReserveProfile: [] },
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
        profile: {} as ElasticityProfile,
        recommendation: `Error: ${e.message}`,
      });
    }
  }

  const avgScore =
    results.filter((r) => r.profile.elasticityScore != null).length > 0
      ? Math.round(
          results.filter((r) => r.profile.elasticityScore != null).reduce((s, r) => s + r.profile.elasticityScore, 0) /
            results.filter((r) => r.profile.elasticityScore != null).length
        )
      : 0;

  console.log(
    JSON.stringify(
      {
        result: "elasticity_analysis",
        data: {
          pools: results,
          summary: { poolsAnalyzed: results.length, avgElasticityScore: avgScore },
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
      const profile = analyzeElasticity(bins, activeBin);

      summaries.push({
        poolId,
        pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
        tvlUsd: pool.tvlUsd,
        elasticityScore: profile.elasticityScore,
        elasticityClass: profile.elasticityClass,
        decayCoefficient: profile.combinedCurve.coefficient,
        halfLife: profile.combinedCurve.halfLife,
        rSquared: profile.combinedCurve.rSquared,
        asymmetryDirection: profile.asymmetryDirection,
        asymmetryRatio: profile.asymmetryRatio,
        activeBinShare: profile.activeBinShare,
        concentrationIndex: profile.concentrationIndex,
      });
    } catch (e: any) {
      summaries.push({
        poolId,
        pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
        error: e.message,
      });
    }
  }

  console.log(JSON.stringify({ result: "elasticity_status", pools: summaries }, null, 2));
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();
program.name("hodlmm-bin-elasticity").description("HODLMM bin reserve elasticity analyzer");

program.command("doctor").description("Check API connectivity").action(cmdDoctor);

program
  .command("run")
  .description("Full elasticity analysis")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "3")
  .action(cmdRun);

program.command("status").description("Quick elasticity summary").action(cmdStatus);

program.parse();
