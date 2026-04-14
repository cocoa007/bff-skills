#!/usr/bin/env bun
/**
 * hodlmm-bin-conductivity.ts — Day 107 cocoa007 Bitflow Skills Comp
 *
 * Bin liquidity conductivity analyzer — measures how well reserve changes
 * propagate across HODLMM bin ranges. High conductivity = well-coupled
 * bins with smooth price curves. Low conductivity = isolated bins with
 * abrupt price jumps.
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

interface ConductionPath {
  binRange: [number, number];
  avgConductivity: number;
  binCount: number;
  couplingStrength: number;
}

interface InsulationZone {
  binRange: [number, number];
  avgConductivity: number;
  binCount: number;
  isolationSeverity: number;
}

interface ConductivityProfile {
  populatedBins: number;
  scannedTvlUsd: number;
  activeBinTvlUsd: number;

  localConductivity: { binId: number; conductivity: number }[];
  avgConductivity: number;
  peakConductivity: number;
  minConductivity: number;

  conductivityGradient: number[];
  maxGradient: number;
  avgGradient: number;

  propagationDepthBuy: number;
  propagationDepthSell: number;

  conductionPaths: ConductionPath[];
  insulationZones: InsulationZone[];

  buyConductivity: number;
  sellConductivity: number;
  directionalConductivity: { buy: number; sell: number };
  conductivityAsymmetry: number;

  conductivityClass: "superconductor" | "conductive" | "semi-conductive" | "resistive" | "insulator";
  conductivityIndex: number;

  asciiConductivityMap: string;
}

interface ConductivityAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  profile: ConductivityProfile;
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

// -- Conductivity Analysis ----------------------------------------------------

/**
 * Compute local conductivity for each bin.
 * Conductivity = how well-coupled a bin is with its neighbors.
 * A bin with reserves similar to its neighbors has high conductivity (changes propagate).
 * A bin with reserves very different from neighbors is isolated (low conductivity).
 */
function computeLocalConductivity(bins: BinReserves[]): { binId: number; conductivity: number }[] {
  if (bins.length < 3) return bins.map((b) => ({ binId: b.binId, conductivity: 0.5 }));

  const maxReserve = Math.max(...bins.map((b) => b.totalUsd), 1);
  const result: { binId: number; conductivity: number }[] = [];

  for (let i = 0; i < bins.length; i++) {
    const curr = bins[i].totalUsd;
    const prev = i > 0 ? bins[i - 1].totalUsd : curr;
    const next = i < bins.length - 1 ? bins[i + 1].totalUsd : curr;

    // Similarity factor: how close is this bin's reserves to the average of its neighbors?
    const neighborAvg = (prev + next) / 2;
    const maxVal = Math.max(curr, neighborAvg, 0.01);
    const similarityFactor = 1 - Math.abs(curr - neighborAvg) / maxVal;

    // Presence factor: both this bin and neighbors must have reserves for conduction
    const presenceFactor = curr > 0.01 && neighborAvg > 0.01 ? 1 : 0;

    // Density factor: well-filled bins conduct better than sparse ones
    const densityFactor = Math.min(1, (curr / maxReserve) * 2);

    // Continuity factor: smooth transitions between prev-curr-next indicate good coupling
    const spread = Math.max(prev, curr, next, 0.01) - Math.min(prev, curr, next);
    const continuityFactor = 1 - Math.min(1, spread / Math.max(prev, curr, next, 0.01));

    const conductivity = Math.min(1, Math.max(0,
      similarityFactor * 0.35 + presenceFactor * 0.25 + densityFactor * 0.2 + continuityFactor * 0.2
    ));
    result.push({ binId: bins[i].binId, conductivity: Number(conductivity.toFixed(4)) });
  }

  return result;
}

/**
 * Compute gradient of conductivity across bins.
 */
function computeConductivityGradient(conductivities: number[]): number[] {
  if (conductivities.length < 2) return [];
  const gradients: number[] = [];
  for (let i = 1; i < conductivities.length; i++) {
    gradients.push(Number(Math.abs(conductivities[i] - conductivities[i - 1]).toFixed(4)));
  }
  return gradients;
}

/**
 * Compute propagation depth: how many bins away from active bin
 * a change would propagate before conductivity drops below threshold.
 */
function computePropagationDepth(
  localConductivity: { binId: number; conductivity: number }[],
  activeBinIdx: number,
  direction: "buy" | "sell",
  threshold: number = 0.3
): number {
  let depth = 0;
  let dampening = 1.0;

  if (direction === "buy") {
    for (let i = activeBinIdx + 1; i < localConductivity.length; i++) {
      dampening *= localConductivity[i].conductivity;
      if (dampening < threshold) break;
      depth++;
    }
  } else {
    for (let i = activeBinIdx - 1; i >= 0; i--) {
      dampening *= localConductivity[i].conductivity;
      if (dampening < threshold) break;
      depth++;
    }
  }

  return depth;
}

/**
 * Detect conduction paths: contiguous runs of high-conductivity bins
 * where liquidity is well-coupled.
 */
function detectConductionPaths(
  localConductivity: { binId: number; conductivity: number }[],
  threshold: number
): ConductionPath[] {
  const paths: ConductionPath[] = [];
  let pathStart = -1;

  for (let i = 0; i <= localConductivity.length; i++) {
    const isHigh = i < localConductivity.length && localConductivity[i].conductivity >= threshold;
    if (isHigh && pathStart === -1) {
      pathStart = i;
    } else if (!isHigh && pathStart !== -1) {
      const slice = localConductivity.slice(pathStart, i);
      const avgCond = slice.reduce((s, v) => s + v.conductivity, 0) / slice.length;
      const couplingStrength = Number((avgCond * slice.length / localConductivity.length * 100).toFixed(1));
      paths.push({
        binRange: [slice[0].binId, slice[slice.length - 1].binId],
        avgConductivity: Number(avgCond.toFixed(4)),
        binCount: slice.length,
        couplingStrength,
      });
      pathStart = -1;
    }
  }

  return paths.sort((a, b) => b.avgConductivity - a.avgConductivity).slice(0, 8);
}

/**
 * Detect insulation zones: contiguous runs of low-conductivity bins
 * where liquidity propagation is blocked.
 */
function detectInsulationZones(
  localConductivity: { binId: number; conductivity: number }[],
  threshold: number
): InsulationZone[] {
  const zones: InsulationZone[] = [];
  let zoneStart = -1;

  for (let i = 0; i <= localConductivity.length; i++) {
    const isLow = i < localConductivity.length && localConductivity[i].conductivity < threshold;
    if (isLow && zoneStart === -1) {
      zoneStart = i;
    } else if (!isLow && zoneStart !== -1) {
      const slice = localConductivity.slice(zoneStart, i);
      const avgCond = slice.reduce((s, v) => s + v.conductivity, 0) / slice.length;
      const isolationSeverity = Number(((1 - avgCond) * 100).toFixed(1));
      zones.push({
        binRange: [slice[0].binId, slice[slice.length - 1].binId],
        avgConductivity: Number(avgCond.toFixed(4)),
        binCount: slice.length,
        isolationSeverity,
      });
      zoneStart = -1;
    }
  }

  return zones.sort((a, b) => b.isolationSeverity - a.isolationSeverity).slice(0, 8);
}

function classifyConductivity(index: number): "superconductor" | "conductive" | "semi-conductive" | "resistive" | "insulator" {
  if (index > 80) return "superconductor";
  if (index > 60) return "conductive";
  if (index > 40) return "semi-conductive";
  if (index > 20) return "resistive";
  return "insulator";
}

function buildAsciiConductivityMap(
  localConductivity: { binId: number; conductivity: number }[],
  activeBinId: number,
  conductionPaths: ConductionPath[],
  insulationZones: InsulationZone[]
): string {
  const width = 30;
  const lines: string[] = ["CONDUCTIVITY MAP (coupling profile across bin range)"];
  lines.push(`${"Bin".padStart(8)} | ${"Conductivity".padEnd(width + 12)} |`);

  const conductionBins = new Set<number>();
  for (const p of conductionPaths) {
    for (let b = p.binRange[0]; b <= p.binRange[1]; b++) conductionBins.add(b);
  }
  const insulationBins = new Set<number>();
  for (const z of insulationZones) {
    for (let b = z.binRange[0]; b <= z.binRange[1]; b++) insulationBins.add(b);
  }

  const step = Math.max(1, Math.floor(localConductivity.length / 40));
  for (let i = 0; i < localConductivity.length; i += step) {
    const lc = localConductivity[i];
    const barLen = Math.round(lc.conductivity * width);
    const bar = "\u2588".repeat(Math.max(barLen, 0));
    let marker = "";
    if (lc.binId === activeBinId) {
      marker = " **ACTIVE**";
    } else if (conductionBins.has(lc.binId)) {
      marker = " [CONDUCT]";
    } else if (insulationBins.has(lc.binId)) {
      marker = " <<INSULATE>>";
    }
    const pct = (lc.conductivity * 100).toFixed(0);
    lines.push(`${String(lc.binId).padStart(8)} | ${bar.padEnd(width)} ${pct.padStart(3)}%${marker}`);
  }

  return lines.join("\n");
}

function analyzeConductivity(bins: BinReserves[], activeBinId: number): ConductivityProfile {
  const populated = bins.filter((b) => b.totalUsd > 0);
  const totalTvl = bins.reduce((s, b) => s + b.totalUsd, 0);
  const activeBin = bins.find((b) => b.binId === activeBinId);
  const activeBinTvl = activeBin?.totalUsd ?? 0;

  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const activeBinIdx = sorted.findIndex((b) => b.binId === activeBinId);

  const localConductivity = computeLocalConductivity(sorted);
  const conductivityValues = localConductivity.map((v) => v.conductivity);

  const avgConductivity = conductivityValues.length > 0
    ? Number((conductivityValues.reduce((a, b) => a + b, 0) / conductivityValues.length).toFixed(4))
    : 0;
  const peakConductivity = conductivityValues.length > 0 ? Math.max(...conductivityValues) : 0;
  const minConductivity = conductivityValues.length > 0 ? Math.min(...conductivityValues) : 0;

  const conductivityGradient = computeConductivityGradient(conductivityValues);
  const maxGradient = conductivityGradient.length > 0 ? Math.max(...conductivityGradient) : 0;
  const avgGradient = conductivityGradient.length > 0
    ? Number((conductivityGradient.reduce((a, b) => a + b, 0) / conductivityGradient.length).toFixed(4))
    : 0;

  // Propagation depth
  const propagationDepthBuy = computePropagationDepth(localConductivity, activeBinIdx, "buy");
  const propagationDepthSell = computePropagationDepth(localConductivity, activeBinIdx, "sell");

  // Zone detection
  const conductionPaths = detectConductionPaths(localConductivity, 0.55);
  const insulationZones = detectInsulationZones(localConductivity, 0.3);

  // Directional conductivity
  const sellSideConductivities = activeBinIdx > 0
    ? conductivityValues.slice(0, activeBinIdx)
    : [];
  const buySideConductivities = activeBinIdx < conductivityValues.length - 1
    ? conductivityValues.slice(activeBinIdx + 1)
    : [];

  const sellConductivity = sellSideConductivities.length > 0
    ? Number((sellSideConductivities.reduce((a, b) => a + b, 0) / sellSideConductivities.length).toFixed(4))
    : 0;
  const buyConductivity = buySideConductivities.length > 0
    ? Number((buySideConductivities.reduce((a, b) => a + b, 0) / buySideConductivities.length).toFixed(4))
    : 0;

  const totalCond = buyConductivity + sellConductivity;
  const conductivityAsymmetry = totalCond > 0
    ? Number(((buyConductivity - sellConductivity) / totalCond).toFixed(4))
    : 0;

  // Composite scoring — higher index = better connected = smoother execution
  const baseScore = avgConductivity * 40;
  const depthBonus = Math.min(20, (propagationDepthBuy + propagationDepthSell) * 0.8);
  const pathBonus = Math.min(15, conductionPaths.reduce((s, p) => s + p.binCount, 0) * 0.4);
  const insulationPenalty = Math.min(15, insulationZones.length * 3 + insulationZones.reduce((s, z) => s + z.binCount, 0) * 0.4);
  const asymmetryPenalty = Math.min(10, Math.abs(conductivityAsymmetry) * 10);
  const emptinessPenalty = Math.min(10, ((bins.length - populated.length) / Math.max(bins.length, 1)) * 10);
  const smoothnessBonus = Math.min(10, (1 - avgGradient) * 10);

  const conductivityIndex = Math.round(Math.min(100, Math.max(0,
    baseScore + depthBonus + pathBonus - insulationPenalty - asymmetryPenalty - emptinessPenalty + smoothnessBonus
  )));

  const conductivityClass = classifyConductivity(conductivityIndex);

  const asciiConductivityMap = buildAsciiConductivityMap(
    localConductivity, activeBinId, conductionPaths, insulationZones
  );

  return {
    populatedBins: populated.length,
    scannedTvlUsd: totalTvl,
    activeBinTvlUsd: activeBinTvl,
    localConductivity,
    avgConductivity,
    peakConductivity,
    minConductivity,
    conductivityGradient,
    maxGradient,
    avgGradient,
    propagationDepthBuy,
    propagationDepthSell,
    conductionPaths,
    insulationZones,
    buyConductivity,
    sellConductivity,
    directionalConductivity: { buy: buyConductivity, sell: sellConductivity },
    conductivityAsymmetry,
    conductivityClass,
    conductivityIndex,
    asciiConductivityMap,
  };
}

function generateRecommendation(p: ConductivityProfile): string {
  const parts: string[] = [];

  switch (p.conductivityClass) {
    case "superconductor":
      parts.push("Extremely high conductivity — bins are tightly coupled with smooth reserve transitions. Price impact propagates evenly. Excellent structural quality for all trade sizes.");
      break;
    case "conductive":
      parts.push("High conductivity — most bins are well-coupled with continuous reserve profiles. Changes propagate predictably. Good structural quality for moderate-to-large trades.");
      break;
    case "semi-conductive":
      parts.push("Moderate conductivity — some bins are coupled while others are isolated. Price impact may be smooth in some ranges but abrupt in others. Check conduction paths before large trades.");
      break;
    case "resistive":
      parts.push("Low conductivity — bins are mostly isolated with weak coupling. Price impact is unpredictable with potential jumps between bins. Best for small trades only.");
      break;
    case "insulator":
      parts.push("Near-zero conductivity — bins are completely isolated. No meaningful propagation of reserve changes. Expect abrupt, discontinuous price impact. Avoid large trades.");
      break;
  }

  if (p.conductionPaths.length > 0) {
    const best = p.conductionPaths[0];
    parts.push(`${p.conductionPaths.length} conduction path(s) found. Strongest at bins ${best.binRange[0]}-${best.binRange[1]} (${best.binCount} bins, ${(best.avgConductivity * 100).toFixed(0)}% avg conductivity). Trades within these ranges execute smoothly.`);
  } else {
    parts.push("No significant conduction paths — liquidity is fragmented across the range.");
  }

  if (p.insulationZones.length > 0) {
    const worst = p.insulationZones[0];
    parts.push(`${p.insulationZones.length} insulation zone(s) detected. Most severe at bins ${worst.binRange[0]}-${worst.binRange[1]} (${worst.isolationSeverity.toFixed(0)}% isolation). These zones block smooth price propagation and create execution cliffs.`);
  } else {
    parts.push("No insulation zones — reserve changes propagate freely across the entire range.");
  }

  const totalDepth = p.propagationDepthBuy + p.propagationDepthSell;
  if (totalDepth > 20) {
    parts.push(`Deep propagation reach (buy: ${p.propagationDepthBuy} bins, sell: ${p.propagationDepthSell} bins). Changes at the active bin ripple far through the range.`);
  } else if (totalDepth < 5) {
    parts.push(`Shallow propagation reach (buy: ${p.propagationDepthBuy} bins, sell: ${p.propagationDepthSell} bins). Changes at the active bin are quickly dampened.`);
  }

  if (Math.abs(p.conductivityAsymmetry) > 0.3) {
    const better = p.conductivityAsymmetry > 0 ? "buy" : "sell";
    const worse = p.conductivityAsymmetry > 0 ? "sell" : "buy";
    parts.push(`Directional asymmetry (${p.conductivityAsymmetry.toFixed(2)}). ${better}-side is better connected — smoother execution. ${worse}-side has weaker coupling.`);
  } else {
    parts.push(`Symmetric conductivity (asymmetry ${p.conductivityAsymmetry.toFixed(2)}). Both directions have similar coupling quality.`);
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

  const results: ConductivityAnalysis[] = [];
  for (const pool of targets) {
    const poolId = pool.poolId!;
    try {
      const activeBin = pool.activeBinId ?? (await getActiveBin(poolId));
      const bins = await scanBins(poolId, activeBin, pool, BIN_SCAN_RADIUS);
      const profile = analyzeConductivity(bins, activeBin);
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
        profile: {} as ConductivityProfile,
        recommendation: `Error: ${e.message}`,
      });
    }
  }

  const avgIdx =
    results.filter((r) => r.profile.conductivityIndex != null).length > 0
      ? Math.round(
          results.filter((r) => r.profile.conductivityIndex != null).reduce((s, r) => s + r.profile.conductivityIndex, 0) /
            results.filter((r) => r.profile.conductivityIndex != null).length
        )
      : 0;

  console.log(
    JSON.stringify(
      {
        result: "conductivity_analysis",
        data: {
          pools: results,
          summary: { poolsAnalyzed: results.length, avgConductivityIndex: avgIdx },
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
      const profile = analyzeConductivity(bins, activeBin);

      summaries.push({
        poolId,
        pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
        tvlUsd: pool.tvlUsd,
        conductivityIndex: profile.conductivityIndex,
        conductivityClass: profile.conductivityClass,
        avgConductivity: profile.avgConductivity,
        peakConductivity: profile.peakConductivity,
        buyConductivity: profile.buyConductivity,
        sellConductivity: profile.sellConductivity,
        conductivityAsymmetry: profile.conductivityAsymmetry,
        propagationDepthBuy: profile.propagationDepthBuy,
        propagationDepthSell: profile.propagationDepthSell,
        conductionPathCount: profile.conductionPaths.length,
        insulationZoneCount: profile.insulationZones.length,
        maxGradient: profile.maxGradient,
      });
    } catch (e: any) {
      summaries.push({
        poolId,
        pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
        error: e.message,
      });
    }
  }

  console.log(JSON.stringify({ result: "conductivity_status", pools: summaries }, null, 2));
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();
program.name("hodlmm-bin-conductivity").description("HODLMM bin liquidity conductivity analyzer");

program.command("doctor").description("Check API connectivity").action(cmdDoctor);

program
  .command("run")
  .description("Full conductivity analysis")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "3")
  .action(cmdRun);

program.command("status").description("Quick conductivity summary").action(cmdStatus);

program.parse();
