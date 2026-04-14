#!/usr/bin/env bun
/**
 * hodlmm-bin-topology.ts
 *
 * HODLMM Bin Topology Analyzer — Maps the topological features of on-chain
 * liquidity distributions. Identifies peaks, valleys, plateaus, cliffs, and
 * gaps in the bin reserve landscape to help LPs understand structural liquidity
 * shape and find optimal positioning.
 *
 * Metrics:
 *  1. Feature detection: peaks, valleys, plateaus, cliffs, gaps
 *  2. Smoothness index: how regular/irregular the distribution is
 *  3. Symmetry score: left-right balance around active bin
 *  4. Ruggedness: frequency of elevation changes
 *  5. Dominant feature type and count
 *  6. Topology score (0-100): composite structural quality
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 91).
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 25;

type FeatureType = "PEAK" | "VALLEY" | "PLATEAU" | "CLIFF_UP" | "CLIFF_DOWN" | "GAP" | "SLOPE_UP" | "SLOPE_DOWN";
type TopoClass = "SMOOTH" | "ROLLING" | "JAGGED" | "FRAGMENTED" | "BARREN";

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

interface TopoFeature {
  binId: number;
  offset: number;
  type: FeatureType;
  magnitude: number;
  reserveUsd: number;
  description: string;
}

interface TopoProfile {
  totalBins: number;
  populatedBins: number;
  features: TopoFeature[];
  featureCounts: Record<FeatureType, number>;
  dominantFeature: FeatureType;
  peakCount: number;
  valleyCount: number;
  plateauCount: number;
  cliffCount: number;
  gapCount: number;
  smoothnessIndex: number;
  symmetryScore: number;
  ruggedness: number;
  elevationRange: { min: number; max: number; ratio: number };
  centroidOffset: number;
  topoScore: number;
  topoClass: TopoClass;
}

interface TopoAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  profile: TopoProfile;
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

  return {
    binId,
    reserveX: rx,
    reserveY: ry,
    reserveXUsd: rxUsd,
    reserveYUsd: ryUsd,
    totalUsd: rxUsd + ryUsd,
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

// -- Topology analysis --------------------------------------------------------

function detectFeatures(
  bins: BinReserves[],
  activeBinId: number
): TopoFeature[] {
  const features: TopoFeature[] = [];
  const populated = bins.filter(b => b.totalUsd > 0.01);
  if (populated.length < 3) return features;

  const maxUsd = Math.max(...populated.map(b => b.totalUsd));
  const threshold = maxUsd * 0.05;

  for (let i = 0; i < bins.length; i++) {
    const curr = bins[i];
    const prev = i > 0 ? bins[i - 1] : null;
    const next = i < bins.length - 1 ? bins[i + 1] : null;
    const offset = curr.binId - activeBinId;

    if (curr.totalUsd < 0.01 && prev && prev.totalUsd > threshold && next && next.totalUsd > threshold) {
      features.push({
        binId: curr.binId,
        offset,
        type: "GAP",
        magnitude: Math.min(prev.totalUsd, next.totalUsd),
        reserveUsd: 0,
        description: `Gap at bin ${curr.binId} — empty between populated neighbors`,
      });
      continue;
    }

    if (curr.totalUsd < 0.01) continue;

    const prevUsd = prev?.totalUsd ?? 0;
    const nextUsd = next?.totalUsd ?? 0;

    if (curr.totalUsd > prevUsd && curr.totalUsd > nextUsd && curr.totalUsd > threshold) {
      const prominence = curr.totalUsd - Math.max(prevUsd, nextUsd);
      if (prominence > threshold * 0.5) {
        features.push({
          binId: curr.binId,
          offset,
          type: "PEAK",
          magnitude: prominence,
          reserveUsd: curr.totalUsd,
          description: `Peak at bin ${curr.binId} ($${fmtUsd(curr.totalUsd)}) — local maximum`,
        });
        continue;
      }
    }

    if (curr.totalUsd < prevUsd && curr.totalUsd < nextUsd && prevUsd > threshold && nextUsd > threshold) {
      const depth = Math.min(prevUsd, nextUsd) - curr.totalUsd;
      if (depth > threshold * 0.3) {
        features.push({
          binId: curr.binId,
          offset,
          type: "VALLEY",
          magnitude: depth,
          reserveUsd: curr.totalUsd,
          description: `Valley at bin ${curr.binId} ($${fmtUsd(curr.totalUsd)}) — local minimum`,
        });
        continue;
      }
    }

    if (prev && Math.abs(curr.totalUsd - prevUsd) < threshold * 0.15 && curr.totalUsd > threshold) {
      let plateauLen = 1;
      let j = i + 1;
      while (j < bins.length && Math.abs(bins[j].totalUsd - curr.totalUsd) < threshold * 0.15) {
        plateauLen++;
        j++;
      }
      if (plateauLen >= 3) {
        features.push({
          binId: curr.binId,
          offset,
          type: "PLATEAU",
          magnitude: plateauLen,
          reserveUsd: curr.totalUsd,
          description: `Plateau starting bin ${curr.binId} — ${plateauLen} bins at ~$${fmtUsd(curr.totalUsd)}`,
        });
        continue;
      }
    }

    if (prev && prevUsd > 0.01) {
      const change = curr.totalUsd - prevUsd;
      const changeRatio = Math.abs(change) / Math.max(prevUsd, curr.totalUsd);
      if (changeRatio > 0.5 && Math.abs(change) > threshold) {
        features.push({
          binId: curr.binId,
          offset,
          type: change > 0 ? "CLIFF_UP" : "CLIFF_DOWN",
          magnitude: Math.abs(change),
          reserveUsd: curr.totalUsd,
          description: `Cliff ${change > 0 ? "up" : "down"} at bin ${curr.binId} — ${Math.round(changeRatio * 100)}% change`,
        });
        continue;
      }
    }

    if (prev && prevUsd > 0.01) {
      const change = curr.totalUsd - prevUsd;
      const changeRatio = Math.abs(change) / Math.max(prevUsd, curr.totalUsd);
      if (changeRatio > 0.15) {
        features.push({
          binId: curr.binId,
          offset,
          type: change > 0 ? "SLOPE_UP" : "SLOPE_DOWN",
          magnitude: Math.abs(change),
          reserveUsd: curr.totalUsd,
          description: `${change > 0 ? "Rising" : "Falling"} slope at bin ${curr.binId}`,
        });
      }
    }
  }

  return features;
}

function computeSmoothnessIndex(bins: BinReserves[]): number {
  const populated = bins.filter(b => b.totalUsd > 0.01);
  if (populated.length < 3) return 0;

  let totalVariation = 0;
  for (let i = 1; i < populated.length; i++) {
    const diff = Math.abs(populated[i].totalUsd - populated[i - 1].totalUsd);
    const avg = (populated[i].totalUsd + populated[i - 1].totalUsd) / 2;
    if (avg > 0) totalVariation += diff / avg;
  }

  const avgVariation = totalVariation / (populated.length - 1);
  return Math.max(0, Math.min(100, Math.round((1 - Math.min(avgVariation, 1)) * 100)));
}

function computeSymmetry(bins: BinReserves[], activeBinId: number): number {
  const left: number[] = [];
  const right: number[] = [];

  for (const bin of bins) {
    if (bin.totalUsd < 0.01) continue;
    const offset = bin.binId - activeBinId;
    if (offset < 0) left.push(bin.totalUsd);
    else if (offset > 0) right.push(bin.totalUsd);
  }

  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0 || right.length === 0) return 0;

  const leftTotal = left.reduce((s, v) => s + v, 0);
  const rightTotal = right.reduce((s, v) => s + v, 0);
  const maxTotal = Math.max(leftTotal, rightTotal);
  if (maxTotal === 0) return 0;

  const volumeSymmetry = Math.min(leftTotal, rightTotal) / maxTotal;

  const maxLen = Math.max(left.length, right.length);
  const countSymmetry = Math.min(left.length, right.length) / maxLen;

  return Math.round((volumeSymmetry * 0.6 + countSymmetry * 0.4) * 100);
}

function computeRuggedness(bins: BinReserves[]): number {
  const populated = bins.filter(b => b.totalUsd > 0.01);
  if (populated.length < 3) return 0;

  let directionChanges = 0;
  let prevDirection = 0;

  for (let i = 1; i < populated.length; i++) {
    const diff = populated[i].totalUsd - populated[i - 1].totalUsd;
    const direction = diff > 0 ? 1 : diff < 0 ? -1 : 0;
    if (direction !== 0 && prevDirection !== 0 && direction !== prevDirection) {
      directionChanges++;
    }
    if (direction !== 0) prevDirection = direction;
  }

  const maxChanges = populated.length - 2;
  if (maxChanges <= 0) return 0;
  return Math.round((directionChanges / maxChanges) * 100);
}

function computeCentroidOffset(bins: BinReserves[], activeBinId: number): number {
  const populated = bins.filter(b => b.totalUsd > 0.01);
  if (populated.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;
  for (const bin of populated) {
    const offset = bin.binId - activeBinId;
    weightedSum += offset * bin.totalUsd;
    totalWeight += bin.totalUsd;
  }

  return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : 0;
}

function buildProfile(
  bins: BinReserves[],
  features: TopoFeature[],
  activeBinId: number
): TopoProfile {
  const populated = bins.filter(b => b.totalUsd > 0.01);

  const featureCounts: Record<FeatureType, number> = {
    PEAK: 0, VALLEY: 0, PLATEAU: 0, CLIFF_UP: 0,
    CLIFF_DOWN: 0, GAP: 0, SLOPE_UP: 0, SLOPE_DOWN: 0,
  };
  for (const f of features) featureCounts[f.type]++;

  let dominantFeature: FeatureType = "PEAK";
  let maxCount = 0;
  for (const [type, count] of Object.entries(featureCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantFeature = type as FeatureType;
    }
  }

  const smoothness = computeSmoothnessIndex(bins);
  const symmetry = computeSymmetry(bins, activeBinId);
  const ruggedness = computeRuggedness(bins);
  const centroid = computeCentroidOffset(bins, activeBinId);

  const usdValues = populated.map(b => b.totalUsd);
  const minUsd = usdValues.length > 0 ? Math.min(...usdValues) : 0;
  const maxUsd = usdValues.length > 0 ? Math.max(...usdValues) : 0;
  const elevationRatio = maxUsd > 0 ? Math.round((minUsd / maxUsd) * 100) / 100 : 0;

  const smoothComponent = smoothness * 0.3;
  const symmetryComponent = symmetry * 0.2;
  const ruggednessComponent = (100 - ruggedness) * 0.2;
  const gapPenalty = Math.min(featureCounts.GAP * 5, 15);
  const cliffPenalty = Math.min((featureCounts.CLIFF_UP + featureCounts.CLIFF_DOWN) * 3, 10);
  const populationBonus = Math.min((populated.length / bins.length) * 25, 25);

  let rawScore = smoothComponent + symmetryComponent + ruggednessComponent + populationBonus - gapPenalty - cliffPenalty;
  const topoScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  let topoClass: TopoClass;
  if (topoScore >= 75) topoClass = "SMOOTH";
  else if (topoScore >= 55) topoClass = "ROLLING";
  else if (topoScore >= 35) topoClass = "JAGGED";
  else if (topoScore >= 15) topoClass = "FRAGMENTED";
  else topoClass = "BARREN";

  return {
    totalBins: bins.length,
    populatedBins: populated.length,
    features,
    featureCounts,
    dominantFeature,
    peakCount: featureCounts.PEAK,
    valleyCount: featureCounts.VALLEY,
    plateauCount: featureCounts.PLATEAU,
    cliffCount: featureCounts.CLIFF_UP + featureCounts.CLIFF_DOWN,
    gapCount: featureCounts.GAP,
    smoothnessIndex: smoothness,
    symmetryScore: symmetry,
    ruggedness,
    elevationRange: { min: Math.round(minUsd * 100) / 100, max: Math.round(maxUsd * 100) / 100, ratio: elevationRatio },
    centroidOffset: centroid,
    topoScore,
    topoClass,
  };
}

function buildAsciiMap(bins: BinReserves[], features: TopoFeature[], activeBinId: number): string {
  const populated = bins.filter(b => b.totalUsd > 0.01);
  if (populated.length === 0) return "(no populated bins)";

  const maxUsd = Math.max(...populated.map(b => b.totalUsd));
  const barWidth = 30;
  const lines: string[] = ["TOPOLOGY MAP", ""];

  const featureMap = new Map<number, TopoFeature>();
  for (const f of features) featureMap.set(f.binId, f);

  for (const bin of populated) {
    const offset = bin.binId - activeBinId;
    const len = Math.max(1, Math.round((bin.totalUsd / maxUsd) * barWidth));
    const feature = featureMap.get(bin.binId);

    let marker = " ";
    if (bin.binId === activeBinId) marker = "*";
    else if (feature?.type === "PEAK") marker = "^";
    else if (feature?.type === "VALLEY") marker = "v";
    else if (feature?.type === "PLATEAU") marker = "=";
    else if (feature?.type === "CLIFF_UP") marker = "/";
    else if (feature?.type === "CLIFF_DOWN") marker = "\\";
    else if (feature?.type === "GAP") marker = "!";

    let bar: string;
    if (feature?.type === "PEAK") bar = "█".repeat(len);
    else if (feature?.type === "VALLEY") bar = "░".repeat(len);
    else if (feature?.type === "PLATEAU") bar = "═".repeat(len);
    else if (feature?.type === "CLIFF_UP" || feature?.type === "CLIFF_DOWN") bar = "▓".repeat(len);
    else bar = "▒".repeat(len);

    const label = `${offset >= 0 ? "+" : ""}${offset}`;
    const featureTag = feature ? ` [${feature.type}]` : "";
    lines.push(
      `${label.padStart(4)} ${marker} ${bar} $${fmtUsd(bin.totalUsd)}${featureTag}`
    );
  }

  lines.push("");
  lines.push("* = active  ^ = peak  v = valley  = = plateau  / = cliff up  \\ = cliff down  ! = gap");
  lines.push("█ = peak  ░ = valley  ═ = plateau  ▓ = cliff  ▒ = normal");
  return lines.join("\n");
}

function buildRecommendation(pair: string, profile: TopoProfile): string {
  const parts: string[] = [];

  parts.push(
    `${pair} topology: ${profile.topoClass} (score ${profile.topoScore}/100), ` +
    `${profile.populatedBins}/${profile.totalBins} bins populated.`
  );

  parts.push(
    `Features: ${profile.peakCount} peaks, ${profile.valleyCount} valleys, ` +
    `${profile.plateauCount} plateaus, ${profile.cliffCount} cliffs, ${profile.gapCount} gaps.`
  );

  parts.push(
    `Smoothness ${profile.smoothnessIndex}/100, symmetry ${profile.symmetryScore}/100, ` +
    `ruggedness ${profile.ruggedness}/100.`
  );

  if (profile.centroidOffset > 3) {
    parts.push(`Liquidity centroid shifted +${profile.centroidOffset} bins right of active — sell-side heavy.`);
  } else if (profile.centroidOffset < -3) {
    parts.push(`Liquidity centroid shifted ${profile.centroidOffset} bins left of active — buy-side heavy.`);
  }

  if (profile.gapCount > 0) {
    parts.push(`WARNING: ${profile.gapCount} gap(s) detected — discontinuous liquidity causes slippage spikes.`);
  }

  if (profile.cliffCount > 2) {
    parts.push(`WARNING: ${profile.cliffCount} cliffs — abrupt reserve changes indicate fragile distribution.`);
  }

  if (profile.smoothnessIndex >= 70 && profile.symmetryScore >= 60) {
    parts.push("Well-shaped distribution — smooth and balanced. Favorable for concentrated LP with tight ranges.");
  } else if (profile.smoothnessIndex >= 50) {
    parts.push("Moderate topology — some irregularities but generally workable for LP positioning.");
  } else {
    parts.push("Rough topology — irregular distribution with significant features. Use wider LP ranges for safety.");
  }

  if (profile.plateauCount > 0) {
    parts.push("Plateaus indicate stable price zones where liquidity providers have reached consensus.");
  }

  if (profile.peakCount === 1 && profile.valleyCount === 0) {
    parts.push("Unimodal distribution — single concentration point. Classic bell-curve shape is healthy.");
  } else if (profile.peakCount >= 2) {
    parts.push(`Multimodal distribution (${profile.peakCount} peaks) — liquidity split across price levels. Watch for bifurcation.`);
  }

  return parts.join(" ");
}

// -- Main analysis ------------------------------------------------------------

async function analyzeTopology(pool: AppPool): Promise<TopoAnalysis> {
  const poolId = pool.poolId!;
  const activeBinId = pool.activeBinId ?? await getActiveBin(poolId);
  const rawBins = await scanBins(poolId, activeBinId, pool, BIN_SCAN_RADIUS);

  const populated = rawBins.filter(b => b.totalUsd > 0.01);
  const scannedTvl = populated.reduce((s, b) => s + b.totalUsd, 0);

  const features = detectFeatures(rawBins, activeBinId);
  const profile = buildProfile(rawBins, features, activeBinId);
  const asciiMap = buildAsciiMap(rawBins, features, activeBinId);
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

function makeErrorResult(pool: AppPool, errMsg: string): TopoAnalysis {
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
      totalBins: 0, populatedBins: 0, features: [],
      featureCounts: { PEAK: 0, VALLEY: 0, PLATEAU: 0, CLIFF_UP: 0, CLIFF_DOWN: 0, GAP: 0, SLOPE_UP: 0, SLOPE_DOWN: 0 },
      dominantFeature: "PEAK", peakCount: 0, valleyCount: 0, plateauCount: 0,
      cliffCount: 0, gapCount: 0, smoothnessIndex: 0, symmetryScore: 0,
      ruggedness: 0, elevationRange: { min: 0, max: 0, ratio: 0 },
      centroidOffset: 0, topoScore: 0, topoClass: "BARREN",
    },
    asciiMap: "",
    recommendation: `Analysis failed: ${errMsg}`,
  };
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();

program
  .name("hodlmm-bin-topology")
  .description("HODLMM Bin Topology Analyzer — maps structural features of liquidity distributions");

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
  .description("Analyze bin topology for top HODLMM pools")
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

      const results: TopoAnalysis[] = [];
      for (const pool of targets) {
        try {
          const analysis = await analyzeTopology(pool);
          results.push(analysis);
        } catch (err: any) {
          results.push(makeErrorResult(pool, err.message));
        }
      }

      const summary = {
        poolsAnalyzed: results.length,
        smoothestPool: results.reduce((best, r) =>
          r.profile.topoScore > best.profile.topoScore ? r : best, results[0]),
        roughestPool: results.reduce((worst, r) =>
          r.profile.topoScore < worst.profile.topoScore ? r : worst, results[0]),
        avgTopoScore: Math.round(
          results.reduce((s, r) => s + r.profile.topoScore, 0) / results.length
        ),
        totalPeaks: results.reduce((s, r) => s + r.profile.peakCount, 0),
        totalGaps: results.reduce((s, r) => s + r.profile.gapCount, 0),
        totalCliffs: results.reduce((s, r) => s + r.profile.cliffCount, 0),
        avgSmoothness: Math.round(
          results.reduce((s, r) => s + r.profile.smoothnessIndex, 0) / results.length
        ),
        avgSymmetry: Math.round(
          results.reduce((s, r) => s + r.profile.symmetryScore, 0) / results.length
        ),
      };

      console.log(JSON.stringify({
        result: "topology_analysis",
        data: { pools: results, summary },
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Run failed: ${err.message}` }));
    }
  });

program
  .command("status")
  .description("Quick topology summary for top pools")
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
          const analysis = await analyzeTopology(pool);
          summaries.push({
            pair: analysis.pair,
            poolId: analysis.poolId,
            tvlUsd: analysis.tvlUsd,
            topoScore: analysis.profile.topoScore,
            topoClass: analysis.profile.topoClass,
            peaks: analysis.profile.peakCount,
            valleys: analysis.profile.valleyCount,
            plateaus: analysis.profile.plateauCount,
            cliffs: analysis.profile.cliffCount,
            gaps: analysis.profile.gapCount,
            smoothness: analysis.profile.smoothnessIndex,
            symmetry: analysis.profile.symmetryScore,
            ruggedness: analysis.profile.ruggedness,
            centroidOffset: analysis.profile.centroidOffset,
          });
        } catch {
          summaries.push({
            pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
            poolId: pool.poolId,
            tvlUsd: pool.tvlUsd,
            topoScore: -1,
          });
        }
      }

      console.log(JSON.stringify({ result: "topology_status", data: summaries }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Status failed: ${err.message}` }));
    }
  });

program.parse();
