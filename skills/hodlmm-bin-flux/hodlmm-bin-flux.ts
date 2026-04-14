#!/usr/bin/env bun
/**
 * hodlmm-bin-flux.ts — Day 102 cocoa007 Bitflow Skills Comp
 *
 * Inter-bin reserve flow gradient analyzer — measures reserve deltas between
 * adjacent bins, detects convergence/divergence zones, net flux direction,
 * flow velocity, token asymmetry, Gini inequality, and composite scoring.
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 30;
const CONVERGENCE_THRESH = 0.02;
const MIN_ZONE_WIDTH = 2;

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

interface BinFluxEdge {
  fromBinId: number;
  toBinId: number;
  fromOffset: number;
  toOffset: number;
  deltaX: number;
  deltaY: number;
  deltaXUsd: number;
  deltaYUsd: number;
  deltaTotalUsd: number;
  magnitude: number;
  direction: "inward" | "outward" | "neutral";
  normalizedMagnitude: number;
}

interface FluxZone {
  startBinId: number;
  endBinId: number;
  startOffset: number;
  endOffset: number;
  width: number;
  avgMagnitude: number;
  type: "convergence" | "divergence";
  totalFluxUsd: number;
}

interface FluxProfile {
  populatedBins: number;
  totalEdges: number;
  scannedTvlUsd: number;

  edges: BinFluxEdge[];
  avgFluxMagnitude: number;
  medianFluxMagnitude: number;
  peakFlux: { fromBinId: number; toBinId: number; magnitude: number; offset: number };
  minFlux: { fromBinId: number; toBinId: number; magnitude: number; offset: number };

  netFluxDirection: "inward" | "outward" | "neutral";
  netFluxStrength: number;

  convergenceZones: FluxZone[];
  divergenceZones: FluxZone[];
  convergenceCount: number;
  divergenceCount: number;

  fluxAsymmetry: number;
  fluxVelocity: number;
  fluxGini: number;

  leftFluxAvg: number;
  rightFluxAvg: number;

  fluxScore: number;
  asciiFluxMap: string;
}

interface FluxAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  profile: FluxProfile;
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

// -- Flux Analysis ------------------------------------------------------------

function computeFluxEdges(bins: BinReserves[], activeBinId: number): BinFluxEdge[] {
  const edges: BinFluxEdge[] = [];
  const totalTvl = bins.reduce((s, b) => s + b.totalUsd, 0);
  if (totalTvl === 0) return edges;

  for (let i = 0; i < bins.length - 1; i++) {
    const from = bins[i];
    const to = bins[i + 1];
    const fromOffset = from.binId - activeBinId;
    const toOffset = to.binId - activeBinId;

    const deltaX = to.reserveX - from.reserveX;
    const deltaY = to.reserveY - from.reserveY;
    const deltaXUsd = to.reserveXUsd - from.reserveXUsd;
    const deltaYUsd = to.reserveYUsd - from.reserveYUsd;
    const deltaTotalUsd = to.totalUsd - from.totalUsd;
    const magnitude = Math.abs(deltaTotalUsd);
    const normalizedMagnitude = magnitude / totalTvl;

    const midOffset = (fromOffset + toOffset) / 2;
    let direction: "inward" | "outward" | "neutral" = "neutral";
    if (Math.abs(deltaTotalUsd) > totalTvl * 0.001) {
      if (midOffset < 0) {
        direction = deltaTotalUsd > 0 ? "inward" : "outward";
      } else if (midOffset > 0) {
        direction = deltaTotalUsd < 0 ? "inward" : "outward";
      } else {
        direction = "neutral";
      }
    }

    edges.push({
      fromBinId: from.binId,
      toBinId: to.binId,
      fromOffset,
      toOffset,
      deltaX,
      deltaY,
      deltaXUsd,
      deltaYUsd,
      deltaTotalUsd,
      magnitude,
      direction,
      normalizedMagnitude,
    });
  }

  return edges;
}

function detectZones(edges: BinFluxEdge[], totalTvl: number): { convergence: FluxZone[]; divergence: FluxZone[] } {
  const convergence: FluxZone[] = [];
  const divergence: FluxZone[] = [];

  let zoneStart = -1;
  let zoneType: "convergence" | "divergence" | null = null;
  let zoneMags: number[] = [];
  let zoneFlux = 0;

  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    const edgeType = e.direction === "inward" ? "convergence" : e.direction === "outward" ? "divergence" : null;

    if (edgeType && edgeType === zoneType) {
      zoneMags.push(e.normalizedMagnitude);
      zoneFlux += e.magnitude;
    } else {
      if (zoneType && zoneMags.length >= MIN_ZONE_WIDTH) {
        const zone: FluxZone = {
          startBinId: edges[zoneStart].fromBinId,
          endBinId: edges[zoneStart + zoneMags.length - 1].toBinId,
          startOffset: edges[zoneStart].fromOffset,
          endOffset: edges[zoneStart + zoneMags.length - 1].toOffset,
          width: zoneMags.length,
          avgMagnitude: zoneMags.reduce((a, b) => a + b, 0) / zoneMags.length,
          type: zoneType,
          totalFluxUsd: zoneFlux,
        };
        (zoneType === "convergence" ? convergence : divergence).push(zone);
      }
      zoneStart = i;
      zoneType = edgeType;
      zoneMags = edgeType ? [e.normalizedMagnitude] : [];
      zoneFlux = edgeType ? e.magnitude : 0;
    }
  }

  if (zoneType && zoneMags.length >= MIN_ZONE_WIDTH) {
    const zone: FluxZone = {
      startBinId: edges[zoneStart].fromBinId,
      endBinId: edges[zoneStart + zoneMags.length - 1].toBinId,
      startOffset: edges[zoneStart].fromOffset,
      endOffset: edges[zoneStart + zoneMags.length - 1].toOffset,
      width: zoneMags.length,
      avgMagnitude: zoneMags.reduce((a, b) => a + b, 0) / zoneMags.length,
      type: zoneType,
      totalFluxUsd: zoneFlux,
    };
    (zoneType === "convergence" ? convergence : divergence).push(zone);
  }

  return { convergence, divergence };
}

function computeGini(values: number[]): number {
  if (values.length < 2) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  if (mean === 0) return 0;
  let sumDiff = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumDiff += Math.abs(sorted[i] - sorted[j]);
    }
  }
  return sumDiff / (2 * n * n * mean);
}

function buildAsciiFluxMap(edges: BinFluxEdge[], activeBinId: number): string {
  if (edges.length === 0) return "No edges to display";
  const maxMag = Math.max(...edges.map((e) => e.normalizedMagnitude), 0.001);
  const width = 40;
  const lines: string[] = ["FLUX MAP (← outward | → inward | = neutral)"];

  for (const e of edges) {
    const offset = e.fromOffset;
    const barLen = Math.round((e.normalizedMagnitude / maxMag) * width);
    const marker = e.fromBinId <= activeBinId && e.toBinId >= activeBinId ? "*" : " ";
    let arrow: string;
    if (e.direction === "inward") arrow = "▸".repeat(Math.max(barLen, 1));
    else if (e.direction === "outward") arrow = "◂".repeat(Math.max(barLen, 1));
    else arrow = "═".repeat(Math.max(barLen, 1));
    const label = `${offset >= 0 ? "+" : ""}${offset}`;
    lines.push(`${label.padStart(4)}${marker}| ${arrow} $${fmtUsd(e.magnitude)}`);
  }

  return lines.join("\n");
}

function analyzeFlux(bins: BinReserves[], activeBinId: number): FluxProfile {
  const populated = bins.filter((b) => b.totalUsd > 0);
  const totalTvl = bins.reduce((s, b) => s + b.totalUsd, 0);
  const edges = computeFluxEdges(bins, activeBinId);

  if (edges.length === 0) {
    return {
      populatedBins: populated.length,
      totalEdges: 0,
      scannedTvlUsd: totalTvl,
      edges: [],
      avgFluxMagnitude: 0,
      medianFluxMagnitude: 0,
      peakFlux: { fromBinId: 0, toBinId: 0, magnitude: 0, offset: 0 },
      minFlux: { fromBinId: 0, toBinId: 0, magnitude: 0, offset: 0 },
      netFluxDirection: "neutral",
      netFluxStrength: 0,
      convergenceZones: [],
      divergenceZones: [],
      convergenceCount: 0,
      divergenceCount: 0,
      fluxAsymmetry: 1,
      fluxVelocity: 0,
      fluxGini: 0,
      leftFluxAvg: 0,
      rightFluxAvg: 0,
      fluxScore: 50,
      asciiFluxMap: "No data",
    };
  }

  const magnitudes = edges.map((e) => e.normalizedMagnitude);
  const sortedMags = [...magnitudes].sort((a, b) => a - b);
  const avgMag = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
  const medianMag =
    sortedMags.length % 2 === 0
      ? (sortedMags[sortedMags.length / 2 - 1] + sortedMags[sortedMags.length / 2]) / 2
      : sortedMags[Math.floor(sortedMags.length / 2)];

  const peakEdge = edges.reduce((max, e) => (e.magnitude > max.magnitude ? e : max), edges[0]);
  const minEdge = edges.reduce((min, e) => (e.magnitude < min.magnitude ? e : min), edges[0]);

  const inwardCount = edges.filter((e) => e.direction === "inward").length;
  const outwardCount = edges.filter((e) => e.direction === "outward").length;
  const inwardMag = edges.filter((e) => e.direction === "inward").reduce((s, e) => s + e.normalizedMagnitude, 0);
  const outwardMag = edges.filter((e) => e.direction === "outward").reduce((s, e) => s + e.normalizedMagnitude, 0);
  const totalDirectional = inwardMag + outwardMag;
  const netStrength = totalDirectional > 0 ? (inwardMag - outwardMag) / totalDirectional : 0;
  const netDir: "inward" | "outward" | "neutral" =
    netStrength > 0.1 ? "inward" : netStrength < -0.1 ? "outward" : "neutral";

  const { convergence, divergence } = detectZones(edges, totalTvl);

  const totalDeltaXUsd = edges.reduce((s, e) => s + Math.abs(e.deltaXUsd), 0);
  const totalDeltaYUsd = edges.reduce((s, e) => s + Math.abs(e.deltaYUsd), 0);
  const fluxAsymmetry = totalDeltaYUsd > 0 ? totalDeltaXUsd / totalDeltaYUsd : totalDeltaXUsd > 0 ? Infinity : 1;

  const fluxVelocity = totalTvl > 0 ? edges.reduce((s, e) => s + e.magnitude, 0) / totalTvl : 0;

  const fluxGini = computeGini(magnitudes);

  const leftEdges = edges.filter((e) => e.fromOffset < 0);
  const rightEdges = edges.filter((e) => e.fromOffset >= 0);
  const leftFluxAvg = leftEdges.length > 0 ? leftEdges.reduce((s, e) => s + e.deltaTotalUsd, 0) / leftEdges.length : 0;
  const rightFluxAvg = rightEdges.length > 0 ? rightEdges.reduce((s, e) => s + e.deltaTotalUsd, 0) / rightEdges.length : 0;

  // Composite scoring
  const smoothness = Math.max(0, 1 - fluxGini) * 30;
  const balance = Math.max(0, 1 - Math.abs(netStrength)) * 25;
  const zoneHealth = Math.max(0, 1 - (convergence.length + divergence.length) / Math.max(edges.length / 3, 1)) * 20;
  const lowPeak = Math.max(0, 1 - (peakEdge.magnitude / Math.max(totalTvl, 1)) * 5) * 15;
  const symmetry = fluxAsymmetry !== Infinity ? Math.max(0, 1 - Math.abs(Math.log(Math.max(fluxAsymmetry, 0.01)))) * 10 : 0;
  const fluxScore = Math.round(Math.min(100, Math.max(0, smoothness + balance + zoneHealth + lowPeak + symmetry)));

  const asciiFluxMap = buildAsciiFluxMap(edges, activeBinId);

  return {
    populatedBins: populated.length,
    totalEdges: edges.length,
    scannedTvlUsd: totalTvl,
    edges,
    avgFluxMagnitude: avgMag,
    medianFluxMagnitude: medianMag,
    peakFlux: { fromBinId: peakEdge.fromBinId, toBinId: peakEdge.toBinId, magnitude: peakEdge.magnitude, offset: peakEdge.fromOffset },
    minFlux: { fromBinId: minEdge.fromBinId, toBinId: minEdge.toBinId, magnitude: minEdge.magnitude, offset: minEdge.fromOffset },
    netFluxDirection: netDir,
    netFluxStrength: Number(netStrength.toFixed(4)),
    convergenceZones: convergence,
    divergenceZones: divergence,
    convergenceCount: convergence.length,
    divergenceCount: divergence.length,
    fluxAsymmetry: Number(Math.min(fluxAsymmetry, 999).toFixed(3)),
    fluxVelocity: Number(fluxVelocity.toFixed(4)),
    fluxGini: Number(fluxGini.toFixed(4)),
    leftFluxAvg: Number(leftFluxAvg.toFixed(2)),
    rightFluxAvg: Number(rightFluxAvg.toFixed(2)),
    fluxScore,
    asciiFluxMap,
  };
}

function generateRecommendation(p: FluxProfile): string {
  const parts: string[] = [];
  if (p.fluxScore >= 70) parts.push("Smooth flow field — liquidity transitions gradually between bins.");
  else if (p.fluxScore >= 40) parts.push("Moderate flow turbulence — some sharp transitions between bins.");
  else parts.push("Turbulent flow — steep liquidity cliffs between bins. Watch for slippage.");

  if (p.netFluxDirection === "inward") parts.push("Net inward flow — capital concentrating toward active price.");
  else if (p.netFluxDirection === "outward") parts.push("Net outward flow — capital dispersing from active price.");

  if (p.convergenceCount > 2) parts.push(`${p.convergenceCount} convergence zones — multiple capital accumulation points.`);
  if (p.divergenceCount > 2) parts.push(`${p.divergenceCount} divergence zones — capital fragmenting across range.`);
  if (p.fluxAsymmetry > 2) parts.push("High token asymmetry in flow — one-sided directional pressure.");
  if (p.fluxGini > 0.5) parts.push("High flux inequality — a few transitions dominate the flow field.");

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

  const results: FluxAnalysis[] = [];
  for (const pool of targets) {
    const poolId = pool.poolId!;
    try {
      const activeBin = pool.activeBinId ?? (await getActiveBin(poolId));
      const bins = await scanBins(poolId, activeBin, pool, BIN_SCAN_RADIUS);
      const profile = analyzeFlux(bins, activeBin);
      const recommendation = generateRecommendation(profile);

      const { edges, ...profileSummary } = profile;

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
        profile: { ...profileSummary, edges: [], asciiFluxMap: profile.asciiFluxMap } as FluxProfile,
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
        profile: {} as FluxProfile,
        recommendation: `Error: ${e.message}`,
      });
    }
  }

  const avgScore =
    results.filter((r) => r.profile.fluxScore != null).length > 0
      ? Math.round(
          results.filter((r) => r.profile.fluxScore != null).reduce((s, r) => s + r.profile.fluxScore, 0) /
            results.filter((r) => r.profile.fluxScore != null).length
        )
      : 0;

  console.log(
    JSON.stringify(
      {
        result: "flux_analysis",
        data: {
          pools: results,
          summary: { poolsAnalyzed: results.length, avgFluxScore: avgScore },
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
      const profile = analyzeFlux(bins, activeBin);

      summaries.push({
        poolId,
        pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
        tvlUsd: pool.tvlUsd,
        fluxScore: profile.fluxScore,
        netFluxDirection: profile.netFluxDirection,
        netFluxStrength: profile.netFluxStrength,
        avgFluxMagnitude: profile.avgFluxMagnitude,
        convergenceZones: profile.convergenceCount,
        divergenceZones: profile.divergenceCount,
        fluxGini: profile.fluxGini,
      });
    } catch (e: any) {
      summaries.push({
        poolId,
        pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
        error: e.message,
      });
    }
  }

  console.log(JSON.stringify({ result: "flux_status", pools: summaries }, null, 2));
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();
program.name("hodlmm-bin-flux").description("HODLMM inter-bin reserve flux analyzer");

program.command("doctor").description("Check API connectivity").action(cmdDoctor);

program
  .command("run")
  .description("Full flux analysis")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "3")
  .action(cmdRun);

program.command("status").description("Quick flux summary").action(cmdStatus);

program.parse();
