#!/usr/bin/env bun
/**
 * hodlmm-bin-permeability.ts — Day 106 cocoa007 Bitflow Skills Comp
 *
 * Bin liquidity permeability analyzer — measures how easily trades flow
 * through HODLMM bin ranges. High permeability = trades pass through
 * (thin liquidity). Low permeability = trades absorbed (dense liquidity).
 * The inverse concept to viscosity.
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

interface AbsorptionZone {
  binRange: [number, number];
  avgPermeability: number;
  binCount: number;
  absorptionEfficiency: number;
}

interface LeakageZone {
  binRange: [number, number];
  avgPermeability: number;
  binCount: number;
  leakageRisk: number;
}

interface TransmissionPoint {
  binsTraversed: number;
  fractionRemaining: number;
  fractionAbsorbed: number;
}

interface PermeabilityProfile {
  populatedBins: number;
  scannedTvlUsd: number;
  activeBinTvlUsd: number;

  localPermeability: { binId: number; permeability: number }[];
  avgPermeability: number;
  peakPermeability: number;
  minPermeability: number;

  permeabilityGradient: number[];
  maxGradient: number;
  avgGradient: number;

  transmissionCurveBuy: TransmissionPoint[];
  transmissionCurveSell: TransmissionPoint[];

  absorptionZones: AbsorptionZone[];
  leakageZones: LeakageZone[];

  buyPermeability: number;
  sellPermeability: number;
  directionalPermeability: { buy: number; sell: number };
  permeabilityAsymmetry: number;

  permeabilityClass: "impermeable" | "resistant" | "semi-permeable" | "permeable" | "porous";
  permeabilityIndex: number;

  asciiPermeabilityMap: string;
}

interface PermeabilityAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  profile: PermeabilityProfile;
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

// -- Permeability Analysis ----------------------------------------------------

/**
 * Compute local permeability for each bin.
 * Permeability = inverse of how well a bin absorbs trades.
 * A bin with low reserves relative to neighbors is highly permeable (trades pass through).
 * A bin with high reserves absorbs trades (low permeability).
 */
function computeLocalPermeability(bins: BinReserves[]): { binId: number; permeability: number }[] {
  if (bins.length < 3) return bins.map((b) => ({ binId: b.binId, permeability: 1 }));

  const maxReserve = Math.max(...bins.map((b) => b.totalUsd), 1);
  const result: { binId: number; permeability: number }[] = [];

  for (let i = 0; i < bins.length; i++) {
    const curr = bins[i].totalUsd;
    const prev = i > 0 ? bins[i - 1].totalUsd : curr;
    const next = i < bins.length - 1 ? bins[i + 1].totalUsd : curr;

    // Depth factor: how thin is this bin relative to max? Thinner = more permeable
    const depthFactor = 1 - (curr / maxReserve);

    // Transmission factor: how much less reserves does this bin have vs neighbors?
    const neighborAvg = (prev + next) / 2;
    const transmissionFactor = neighborAvg > 0.01
      ? Math.min(1, Math.max(0, 1 - curr / (neighborAvg + 0.01)))
      : (curr < 0.01 ? 1 : 0);

    // Gap factor: discontinuity with neighbors increases permeability
    const gapFactor = Math.abs(curr - neighborAvg) / (Math.max(curr, neighborAvg, 0.01));

    // Composite: heavily weight depth (thin bins are permeable), add transmission and gap
    const permeability = Math.min(1, Math.max(0,
      depthFactor * 0.5 + transmissionFactor * 0.3 + gapFactor * 0.2
    ));
    result.push({ binId: bins[i].binId, permeability: Number(permeability.toFixed(4)) });
  }

  return result;
}

/**
 * Compute gradient of permeability across bins.
 * Rapid changes mark boundaries between permeable/impermeable zones.
 */
function computePermeabilityGradient(permeabilities: number[]): number[] {
  if (permeabilities.length < 2) return [];
  const gradients: number[] = [];
  for (let i = 1; i < permeabilities.length; i++) {
    gradients.push(Number(Math.abs(permeabilities[i] - permeabilities[i - 1]).toFixed(4)));
  }
  return gradients;
}

/**
 * Compute transmission curve: cumulative fraction of a trade that passes through
 * N bins without being absorbed. Starts at 1.0, decreases as bins absorb.
 */
function computeTransmissionCurve(
  bins: BinReserves[],
  activeBinIdx: number,
  direction: "buy" | "sell"
): TransmissionPoint[] {
  const points: TransmissionPoint[] = [];
  let remaining = 1.0;

  const maxReserve = Math.max(...bins.map((b) => b.totalUsd), 1);

  if (direction === "sell") {
    for (let i = activeBinIdx - 1; i >= 0 && points.length < 25; i--) {
      // Absorption rate = how much of the remaining trade this bin captures
      const absorptionRate = Math.min(0.95, bins[i].totalUsd / maxReserve);
      remaining *= (1 - absorptionRate);
      points.push({
        binsTraversed: activeBinIdx - i,
        fractionRemaining: Number(remaining.toFixed(4)),
        fractionAbsorbed: Number((1 - remaining).toFixed(4)),
      });
    }
  } else {
    for (let i = activeBinIdx + 1; i < bins.length && points.length < 25; i++) {
      const absorptionRate = Math.min(0.95, bins[i].totalUsd / maxReserve);
      remaining *= (1 - absorptionRate);
      points.push({
        binsTraversed: i - activeBinIdx,
        fractionRemaining: Number(remaining.toFixed(4)),
        fractionAbsorbed: Number((1 - remaining).toFixed(4)),
      });
    }
  }

  return points;
}

/**
 * Detect absorption zones: contiguous runs of low-permeability bins
 * that collectively absorb most trade volume.
 */
function detectAbsorptionZones(
  localPermeability: { binId: number; permeability: number }[],
  threshold: number
): AbsorptionZone[] {
  const zones: AbsorptionZone[] = [];
  let zoneStart = -1;

  for (let i = 0; i <= localPermeability.length; i++) {
    const isLow = i < localPermeability.length && localPermeability[i].permeability < threshold;
    if (isLow && zoneStart === -1) {
      zoneStart = i;
    } else if (!isLow && zoneStart !== -1) {
      const slice = localPermeability.slice(zoneStart, i);
      const avgPerm = slice.reduce((s, v) => s + v.permeability, 0) / slice.length;
      // Absorption efficiency: how well this zone stops trades (inverse of permeability)
      const efficiency = Number(((1 - avgPerm) * 100).toFixed(1));
      zones.push({
        binRange: [slice[0].binId, slice[slice.length - 1].binId],
        avgPermeability: Number(avgPerm.toFixed(4)),
        binCount: slice.length,
        absorptionEfficiency: efficiency,
      });
      zoneStart = -1;
    }
  }

  return zones.sort((a, b) => a.avgPermeability - b.avgPermeability).slice(0, 8);
}

/**
 * Detect leakage zones: contiguous runs of high-permeability bins
 * where trades leak through without being absorbed.
 */
function detectLeakageZones(
  localPermeability: { binId: number; permeability: number }[],
  threshold: number
): LeakageZone[] {
  const zones: LeakageZone[] = [];
  let zoneStart = -1;

  for (let i = 0; i <= localPermeability.length; i++) {
    const isHigh = i < localPermeability.length && localPermeability[i].permeability > threshold;
    if (isHigh && zoneStart === -1) {
      zoneStart = i;
    } else if (!isHigh && zoneStart !== -1) {
      const slice = localPermeability.slice(zoneStart, i);
      const avgPerm = slice.reduce((s, v) => s + v.permeability, 0) / slice.length;
      // Leakage risk: how much trade volume escapes through this zone
      const risk = Number((avgPerm * slice.length / localPermeability.length * 100).toFixed(1));
      zones.push({
        binRange: [slice[0].binId, slice[slice.length - 1].binId],
        avgPermeability: Number(avgPerm.toFixed(4)),
        binCount: slice.length,
        leakageRisk: risk,
      });
      zoneStart = -1;
    }
  }

  return zones.sort((a, b) => b.avgPermeability - a.avgPermeability).slice(0, 8);
}

function classifyPermeability(index: number): "impermeable" | "resistant" | "semi-permeable" | "permeable" | "porous" {
  if (index < 20) return "impermeable";
  if (index < 40) return "resistant";
  if (index < 60) return "semi-permeable";
  if (index < 80) return "permeable";
  return "porous";
}

function buildAsciiPermeabilityMap(
  localPermeability: { binId: number; permeability: number }[],
  activeBinId: number,
  absorptionZones: AbsorptionZone[],
  leakageZones: LeakageZone[]
): string {
  const width = 30;
  const lines: string[] = ["PERMEABILITY MAP (transmission profile across bin range)"];
  lines.push(`${"Bin".padStart(8)} | ${"Permeability".padEnd(width + 12)} |`);

  const absorptionBins = new Set<number>();
  for (const z of absorptionZones) {
    for (let b = z.binRange[0]; b <= z.binRange[1]; b++) absorptionBins.add(b);
  }
  const leakageBins = new Set<number>();
  for (const z of leakageZones) {
    for (let b = z.binRange[0]; b <= z.binRange[1]; b++) leakageBins.add(b);
  }

  const step = Math.max(1, Math.floor(localPermeability.length / 40));
  for (let i = 0; i < localPermeability.length; i += step) {
    const lp = localPermeability[i];
    const barLen = Math.round(lp.permeability * width);
    const bar = "\u2591".repeat(Math.max(barLen, 0));
    let marker = "";
    if (lp.binId === activeBinId) {
      marker = " **ACTIVE**";
    } else if (leakageBins.has(lp.binId)) {
      marker = " <<LEAK>>";
    } else if (absorptionBins.has(lp.binId)) {
      marker = " [ABSORB]";
    }
    const pct = (lp.permeability * 100).toFixed(0);
    lines.push(`${String(lp.binId).padStart(8)} | ${bar.padEnd(width)} ${pct.padStart(3)}%${marker}`);
  }

  return lines.join("\n");
}

function analyzePermeability(bins: BinReserves[], activeBinId: number): PermeabilityProfile {
  const populated = bins.filter((b) => b.totalUsd > 0);
  const totalTvl = bins.reduce((s, b) => s + b.totalUsd, 0);
  const activeBin = bins.find((b) => b.binId === activeBinId);
  const activeBinTvl = activeBin?.totalUsd ?? 0;

  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const activeBinIdx = sorted.findIndex((b) => b.binId === activeBinId);

  const localPermeability = computeLocalPermeability(sorted);
  const permeabilityValues = localPermeability.map((v) => v.permeability);

  const avgPermeability = permeabilityValues.length > 0
    ? Number((permeabilityValues.reduce((a, b) => a + b, 0) / permeabilityValues.length).toFixed(4))
    : 0;
  const peakPermeability = permeabilityValues.length > 0 ? Math.max(...permeabilityValues) : 0;
  const minPermeability = permeabilityValues.length > 0 ? Math.min(...permeabilityValues) : 0;

  const permeabilityGradient = computePermeabilityGradient(permeabilityValues);
  const maxGradient = permeabilityGradient.length > 0 ? Math.max(...permeabilityGradient) : 0;
  const avgGradient = permeabilityGradient.length > 0
    ? Number((permeabilityGradient.reduce((a, b) => a + b, 0) / permeabilityGradient.length).toFixed(4))
    : 0;

  // Transmission curves
  const transmissionCurveSell = computeTransmissionCurve(sorted, activeBinIdx, "sell");
  const transmissionCurveBuy = computeTransmissionCurve(sorted, activeBinIdx, "buy");

  // Zone detection
  const absorptionZones = detectAbsorptionZones(localPermeability, 0.35);
  const leakageZones = detectLeakageZones(localPermeability, 0.65);

  // Directional permeability
  const sellSidePermeabilities = activeBinIdx > 0
    ? permeabilityValues.slice(0, activeBinIdx)
    : [];
  const buySidePermeabilities = activeBinIdx < permeabilityValues.length - 1
    ? permeabilityValues.slice(activeBinIdx + 1)
    : [];

  const sellPermeability = sellSidePermeabilities.length > 0
    ? Number((sellSidePermeabilities.reduce((a, b) => a + b, 0) / sellSidePermeabilities.length).toFixed(4))
    : 0;
  const buyPermeability = buySidePermeabilities.length > 0
    ? Number((buySidePermeabilities.reduce((a, b) => a + b, 0) / buySidePermeabilities.length).toFixed(4))
    : 0;

  const totalPerm = buyPermeability + sellPermeability;
  const permeabilityAsymmetry = totalPerm > 0
    ? Number(((buyPermeability - sellPermeability) / totalPerm).toFixed(4))
    : 0;

  // Composite scoring — higher index = more permeable = worse for trade execution
  const depthScore = Math.min(30, avgPermeability * 30);
  const gradientPenalty = Math.min(15, avgGradient * 50);
  const leakagePenalty = Math.min(20, leakageZones.length * 4 + leakageZones.reduce((s, z) => s + z.binCount, 0) * 0.5);
  const absorptionBonus = Math.min(15, absorptionZones.reduce((s, z) => s + z.binCount, 0) * 0.3);
  const asymmetryPenalty = Math.min(10, Math.abs(permeabilityAsymmetry) * 10);
  const emptinessPenalty = Math.min(10, ((bins.length - populated.length) / Math.max(bins.length, 1)) * 10);

  const permeabilityIndex = Math.round(Math.min(100, Math.max(0,
    depthScore + gradientPenalty + leakagePenalty - absorptionBonus + asymmetryPenalty + emptinessPenalty
  )));

  const permeabilityClass = classifyPermeability(permeabilityIndex);

  const asciiPermeabilityMap = buildAsciiPermeabilityMap(
    localPermeability, activeBinId, absorptionZones, leakageZones
  );

  return {
    populatedBins: populated.length,
    scannedTvlUsd: totalTvl,
    activeBinTvlUsd: activeBinTvl,
    localPermeability,
    avgPermeability,
    peakPermeability,
    minPermeability,
    permeabilityGradient,
    maxGradient,
    avgGradient,
    transmissionCurveBuy,
    transmissionCurveSell,
    absorptionZones,
    leakageZones,
    buyPermeability,
    sellPermeability,
    directionalPermeability: { buy: buyPermeability, sell: sellPermeability },
    permeabilityAsymmetry,
    permeabilityClass,
    permeabilityIndex,
    asciiPermeabilityMap,
  };
}

function generateRecommendation(p: PermeabilityProfile): string {
  const parts: string[] = [];

  switch (p.permeabilityClass) {
    case "impermeable":
      parts.push("Extremely low permeability — dense liquidity absorbs trades completely. Excellent execution quality; even large trades are captured within the range.");
      break;
    case "resistant":
      parts.push("Low permeability — most trade volume is absorbed by the bin range. Good execution for moderate-to-large trades with predictable slippage.");
      break;
    case "semi-permeable":
      parts.push("Moderate permeability — some trade volume passes through while the rest is absorbed. Standard trades execute well but large orders may leak beyond the range.");
      break;
    case "permeable":
      parts.push("High permeability — trades pass through much of the range without full absorption. Significant slippage risk for anything above small orders.");
      break;
    case "porous":
      parts.push("Extremely high permeability — liquidity is too thin to absorb trades. Price moves freely through the range. Avoid large trades entirely.");
      break;
  }

  if (p.leakageZones.length > 0) {
    const worst = p.leakageZones[0];
    parts.push(`${p.leakageZones.length} leakage zone(s) detected. Worst at bins ${worst.binRange[0]}-${worst.binRange[1]} (avg permeability ${(worst.avgPermeability * 100).toFixed(0)}%). Trades entering these zones pass through without price impact — indicates liquidity gaps.`);
  } else {
    parts.push("No significant leakage zones — all bin ranges provide meaningful trade absorption.");
  }

  if (p.absorptionZones.length > 0) {
    const best = p.absorptionZones[0];
    parts.push(`${p.absorptionZones.length} absorption zone(s) found. Strongest at bins ${best.binRange[0]}-${best.binRange[1]} (${best.absorptionEfficiency.toFixed(0)}% efficient). These zones reliably catch trade volume.`);
  }

  if (Math.abs(p.permeabilityAsymmetry) > 0.3) {
    const leakier = p.permeabilityAsymmetry > 0 ? "buy" : "sell";
    const tighter = p.permeabilityAsymmetry > 0 ? "sell" : "buy";
    parts.push(`Directional asymmetry (${p.permeabilityAsymmetry.toFixed(2)}). ${leakier}-side is more permeable — trades leak through more easily. ${tighter}-side absorbs better.`);
  } else {
    parts.push(`Symmetric permeability (asymmetry ${p.permeabilityAsymmetry.toFixed(2)}). Both directions transmit trades similarly.`);
  }

  if (p.maxGradient > 0.3) {
    parts.push(`Sharp permeability gradient (max ${p.maxGradient.toFixed(2)}). Abrupt transitions between permeable and impermeable zones create unpredictable execution boundaries.`);
  } else if (p.maxGradient < 0.1) {
    parts.push("Smooth permeability gradient — transmission characteristics change gradually across the range.");
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

  const results: PermeabilityAnalysis[] = [];
  for (const pool of targets) {
    const poolId = pool.poolId!;
    try {
      const activeBin = pool.activeBinId ?? (await getActiveBin(poolId));
      const bins = await scanBins(poolId, activeBin, pool, BIN_SCAN_RADIUS);
      const profile = analyzePermeability(bins, activeBin);
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
        profile: {} as PermeabilityProfile,
        recommendation: `Error: ${e.message}`,
      });
    }
  }

  const avgIdx =
    results.filter((r) => r.profile.permeabilityIndex != null).length > 0
      ? Math.round(
          results.filter((r) => r.profile.permeabilityIndex != null).reduce((s, r) => s + r.profile.permeabilityIndex, 0) /
            results.filter((r) => r.profile.permeabilityIndex != null).length
        )
      : 0;

  console.log(
    JSON.stringify(
      {
        result: "permeability_analysis",
        data: {
          pools: results,
          summary: { poolsAnalyzed: results.length, avgPermeabilityIndex: avgIdx },
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
      const profile = analyzePermeability(bins, activeBin);

      summaries.push({
        poolId,
        pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
        tvlUsd: pool.tvlUsd,
        permeabilityIndex: profile.permeabilityIndex,
        permeabilityClass: profile.permeabilityClass,
        avgPermeability: profile.avgPermeability,
        peakPermeability: profile.peakPermeability,
        buyPermeability: profile.buyPermeability,
        sellPermeability: profile.sellPermeability,
        permeabilityAsymmetry: profile.permeabilityAsymmetry,
        absorptionZoneCount: profile.absorptionZones.length,
        leakageZoneCount: profile.leakageZones.length,
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

  console.log(JSON.stringify({ result: "permeability_status", pools: summaries }, null, 2));
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();
program.name("hodlmm-bin-permeability").description("HODLMM bin liquidity permeability analyzer");

program.command("doctor").description("Check API connectivity").action(cmdDoctor);

program
  .command("run")
  .description("Full permeability analysis")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "3")
  .action(cmdRun);

program.command("status").description("Quick permeability summary").action(cmdStatus);

program.parse();
