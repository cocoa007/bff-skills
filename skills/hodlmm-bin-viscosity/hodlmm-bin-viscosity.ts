#!/usr/bin/env bun
/**
 * hodlmm-bin-viscosity.ts — Day 105 cocoa007 Bitflow Skills Comp
 *
 * Bin liquidity viscosity analyzer — measures resistance to price movement
 * across HODLMM bin ranges. Local viscosity, shear stress detection, flow
 * resistance profiling, directional asymmetry, and composite scoring.
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

interface ShearZone {
  binRange: [number, number];
  offset: number;
  shearMagnitude: number;
  direction: "thickening" | "thinning";
  leftViscosity: number;
  rightViscosity: number;
}

interface FlowResistancePoint {
  binsFromActive: number;
  cumulativeResistance: number;
  marginalResistance: number;
}

interface ViscosityProfile {
  populatedBins: number;
  scannedTvlUsd: number;
  activeBinTvlUsd: number;

  localViscosities: { binId: number; viscosity: number }[];
  avgViscosity: number;
  peakViscosity: number;
  minViscosity: number;

  viscosityGradient: number[];
  maxGradient: number;
  avgGradient: number;

  shearZones: ShearZone[];
  maxShearStress: number;

  buyFlowResistance: FlowResistancePoint[];
  sellFlowResistance: FlowResistancePoint[];
  buyViscosity: number;
  sellViscosity: number;
  viscosityAsymmetry: number;

  viscosityClass: "solid" | "viscous" | "fluid" | "gaseous" | "vacuum";
  viscosityIndex: number;

  asciiViscosityMap: string;
}

interface ViscosityAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  profile: ViscosityProfile;
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

// -- Viscosity Analysis -------------------------------------------------------

function computeLocalViscosity(bins: BinReserves[]): { binId: number; viscosity: number }[] {
  if (bins.length < 3) return bins.map((b) => ({ binId: b.binId, viscosity: 0 }));

  const maxReserve = Math.max(...bins.map((b) => b.totalUsd), 1);
  const result: { binId: number; viscosity: number }[] = [];

  for (let i = 0; i < bins.length; i++) {
    const curr = bins[i].totalUsd;
    const prev = i > 0 ? bins[i - 1].totalUsd : curr;
    const next = i < bins.length - 1 ? bins[i + 1].totalUsd : curr;

    const depthFactor = curr / maxReserve;
    const neighborAvg = (prev + next) / 2;
    const smoothness = neighborAvg > 0.01 ? Math.min(1, curr / (neighborAvg + 0.01)) : 0;
    const continuity = 1 - Math.abs(curr - neighborAvg) / (Math.max(curr, neighborAvg, 0.01));

    const viscosity = Math.min(1, depthFactor * 0.5 + smoothness * 0.3 + Math.max(0, continuity) * 0.2);
    result.push({ binId: bins[i].binId, viscosity: Number(viscosity.toFixed(4)) });
  }

  return result;
}

function computeViscosityGradient(viscosities: number[]): number[] {
  if (viscosities.length < 2) return [];
  const gradients: number[] = [];
  for (let i = 1; i < viscosities.length; i++) {
    gradients.push(Number(Math.abs(viscosities[i] - viscosities[i - 1]).toFixed(4)));
  }
  return gradients;
}

function detectShearZones(
  localViscosities: { binId: number; viscosity: number }[],
  windowSize: number,
  threshold: number
): ShearZone[] {
  const zones: ShearZone[] = [];
  if (localViscosities.length < windowSize * 2) return zones;

  for (let i = windowSize; i <= localViscosities.length - windowSize; i++) {
    let leftSum = 0;
    let rightSum = 0;

    for (let j = i - windowSize; j < i; j++) {
      leftSum += localViscosities[j].viscosity;
    }
    for (let j = i; j < i + windowSize; j++) {
      rightSum += localViscosities[j].viscosity;
    }

    const leftAvg = leftSum / windowSize;
    const rightAvg = rightSum / windowSize;
    const shear = Math.abs(leftAvg - rightAvg);

    if (shear >= threshold) {
      zones.push({
        binRange: [localViscosities[i - 1].binId, localViscosities[i].binId],
        offset: i,
        shearMagnitude: Number(shear.toFixed(4)),
        direction: rightAvg > leftAvg ? "thickening" : "thinning",
        leftViscosity: Number(leftAvg.toFixed(4)),
        rightViscosity: Number(rightAvg.toFixed(4)),
      });
    }
  }

  return zones.sort((a, b) => b.shearMagnitude - a.shearMagnitude).slice(0, 8);
}

function computeFlowResistance(
  bins: BinReserves[],
  activeBinIdx: number,
  direction: "buy" | "sell"
): FlowResistancePoint[] {
  const points: FlowResistancePoint[] = [];
  let cumulative = 0;

  const maxReserve = Math.max(...bins.map((b) => b.totalUsd), 1);

  if (direction === "sell") {
    for (let i = activeBinIdx - 1; i >= 0 && points.length < 25; i--) {
      const resistance = bins[i].totalUsd / maxReserve;
      cumulative += resistance;
      points.push({
        binsFromActive: activeBinIdx - i,
        cumulativeResistance: Number(cumulative.toFixed(4)),
        marginalResistance: Number(resistance.toFixed(4)),
      });
    }
  } else {
    for (let i = activeBinIdx + 1; i < bins.length && points.length < 25; i++) {
      const resistance = bins[i].totalUsd / maxReserve;
      cumulative += resistance;
      points.push({
        binsFromActive: i - activeBinIdx,
        cumulativeResistance: Number(cumulative.toFixed(4)),
        marginalResistance: Number(resistance.toFixed(4)),
      });
    }
  }

  return points;
}

function classifyViscosity(index: number): "solid" | "viscous" | "fluid" | "gaseous" | "vacuum" {
  if (index >= 80) return "solid";
  if (index >= 60) return "viscous";
  if (index >= 40) return "fluid";
  if (index >= 20) return "gaseous";
  return "vacuum";
}

function buildAsciiViscosityMap(
  localViscosities: { binId: number; viscosity: number }[],
  activeBinId: number,
  shearZones: ShearZone[]
): string {
  const width = 30;
  const lines: string[] = ["VISCOSITY MAP (thickness profile across bin range)"];
  lines.push(`${"Bin".padStart(8)} | ${"Viscosity".padEnd(width + 12)} |`);

  const shearBins = new Set(shearZones.flatMap((z) => [z.binRange[0], z.binRange[1]]));

  const step = Math.max(1, Math.floor(localViscosities.length / 40));
  for (let i = 0; i < localViscosities.length; i += step) {
    const lv = localViscosities[i];
    const barLen = Math.round(lv.viscosity * width);
    const bar = "\u2588".repeat(Math.max(barLen, 0));
    const marker = lv.binId === activeBinId ? " **ACTIVE**" : shearBins.has(lv.binId) ? " <<SHEAR>>" : "";
    const pct = (lv.viscosity * 100).toFixed(0);
    lines.push(`${String(lv.binId).padStart(8)} | ${bar.padEnd(width)} ${pct.padStart(3)}%${marker}`);
  }

  return lines.join("\n");
}

function analyzeViscosity(bins: BinReserves[], activeBinId: number): ViscosityProfile {
  const populated = bins.filter((b) => b.totalUsd > 0);
  const totalTvl = bins.reduce((s, b) => s + b.totalUsd, 0);
  const activeBin = bins.find((b) => b.binId === activeBinId);
  const activeBinTvl = activeBin?.totalUsd ?? 0;

  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const activeBinIdx = sorted.findIndex((b) => b.binId === activeBinId);

  const localViscosities = computeLocalViscosity(sorted);
  const viscosityValues = localViscosities.map((v) => v.viscosity);

  const avgViscosity = viscosityValues.length > 0
    ? Number((viscosityValues.reduce((a, b) => a + b, 0) / viscosityValues.length).toFixed(4))
    : 0;
  const peakViscosity = viscosityValues.length > 0 ? Math.max(...viscosityValues) : 0;
  const minViscosity = viscosityValues.length > 0 ? Math.min(...viscosityValues) : 0;

  const viscosityGradient = computeViscosityGradient(viscosityValues);
  const maxGradient = viscosityGradient.length > 0 ? Math.max(...viscosityGradient) : 0;
  const avgGradient = viscosityGradient.length > 0
    ? Number((viscosityGradient.reduce((a, b) => a + b, 0) / viscosityGradient.length).toFixed(4))
    : 0;

  const shearZones = detectShearZones(localViscosities, 3, 0.15);
  const maxShearStress = shearZones.length > 0 ? shearZones[0].shearMagnitude : 0;

  const sellFlowResistance = computeFlowResistance(sorted, activeBinIdx, "sell");
  const buyFlowResistance = computeFlowResistance(sorted, activeBinIdx, "buy");

  const sellSideViscosities = activeBinIdx > 0
    ? viscosityValues.slice(0, activeBinIdx)
    : [];
  const buySideViscosities = activeBinIdx < viscosityValues.length - 1
    ? viscosityValues.slice(activeBinIdx + 1)
    : [];

  const sellViscosity = sellSideViscosities.length > 0
    ? Number((sellSideViscosities.reduce((a, b) => a + b, 0) / sellSideViscosities.length).toFixed(4))
    : 0;
  const buyViscosity = buySideViscosities.length > 0
    ? Number((buySideViscosities.reduce((a, b) => a + b, 0) / buySideViscosities.length).toFixed(4))
    : 0;

  const totalVisc = buyViscosity + sellViscosity;
  const viscosityAsymmetry = totalVisc > 0
    ? Number(((buyViscosity - sellViscosity) / totalVisc).toFixed(4))
    : 0;

  // Composite scoring
  const depthScore = Math.min(30, avgViscosity * 30);
  const smoothnessScore = Math.min(25, (1 - Math.min(1, avgGradient * 5)) * 25);
  const shearPenalty = Math.min(15, shearZones.length * 3);
  const symmetryScore = Math.min(15, (1 - Math.abs(viscosityAsymmetry)) * 15);
  const coverageScore = Math.min(15, (populated.length / bins.length) * 15);
  const viscosityIndex = Math.round(Math.min(100, Math.max(0,
    depthScore + smoothnessScore - shearPenalty + symmetryScore + coverageScore
  )));

  const viscosityClass = classifyViscosity(viscosityIndex);

  const asciiViscosityMap = buildAsciiViscosityMap(localViscosities, activeBinId, shearZones);

  return {
    populatedBins: populated.length,
    scannedTvlUsd: totalTvl,
    activeBinTvlUsd: activeBinTvl,
    localViscosities,
    avgViscosity,
    peakViscosity,
    minViscosity,
    viscosityGradient,
    maxGradient,
    avgGradient,
    shearZones,
    maxShearStress,
    buyFlowResistance,
    sellFlowResistance,
    buyViscosity,
    sellViscosity,
    viscosityAsymmetry,
    viscosityClass,
    viscosityIndex,
    asciiViscosityMap,
  };
}

function generateRecommendation(p: ViscosityProfile): string {
  const parts: string[] = [];

  switch (p.viscosityClass) {
    case "solid":
      parts.push("Extremely high viscosity — dense liquidity absorbs large trades with minimal price impact. Excellent execution quality across the range.");
      break;
    case "viscous":
      parts.push("High viscosity — thick liquidity provides strong resistance to price movement. Good execution for moderate-to-large trades.");
      break;
    case "fluid":
      parts.push("Moderate viscosity — adequate liquidity for standard trades but large orders may experience noticeable slippage.");
      break;
    case "gaseous":
      parts.push("Low viscosity — thin liquidity offers little resistance. Price moves easily on modest volume. Use caution with trade sizing.");
      break;
    case "vacuum":
      parts.push("Near-zero viscosity — negligible liquidity resistance. Even small trades cause significant price movement.");
      break;
  }

  if (Math.abs(p.viscosityAsymmetry) > 0.3) {
    const thicker = p.viscosityAsymmetry > 0 ? "buy" : "sell";
    const thinner = p.viscosityAsymmetry > 0 ? "sell" : "buy";
    parts.push(`Significant directional asymmetry (${p.viscosityAsymmetry.toFixed(2)}). ${thicker}-side is thicker — ${thinner}-side trades face less resistance and more slippage.`);
  } else {
    parts.push(`Symmetric viscosity (asymmetry ${p.viscosityAsymmetry.toFixed(2)}). Both directions offer similar execution quality.`);
  }

  if (p.shearZones.length > 0) {
    const worst = p.shearZones[0];
    parts.push(`${p.shearZones.length} shear zone(s) detected. Strongest at bins ${worst.binRange[0]}-${worst.binRange[1]} (magnitude ${worst.shearMagnitude.toFixed(2)}, ${worst.direction}). Trade size should account for these breakpoints.`);
  } else {
    parts.push("No significant shear zones — viscosity transitions smoothly across the range.");
  }

  if (p.maxGradient > 0.3) {
    parts.push(`High viscosity gradient (max ${p.maxGradient.toFixed(2)}). Abrupt density changes mean execution quality varies sharply between adjacent bins.`);
  } else if (p.maxGradient < 0.1) {
    parts.push("Smooth viscosity gradient — consistent resistance profile. Slippage scales predictably with trade size.");
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

  const results: ViscosityAnalysis[] = [];
  for (const pool of targets) {
    const poolId = pool.poolId!;
    try {
      const activeBin = pool.activeBinId ?? (await getActiveBin(poolId));
      const bins = await scanBins(poolId, activeBin, pool, BIN_SCAN_RADIUS);
      const profile = analyzeViscosity(bins, activeBin);
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
        profile: {} as ViscosityProfile,
        recommendation: `Error: ${e.message}`,
      });
    }
  }

  const avgIdx =
    results.filter((r) => r.profile.viscosityIndex != null).length > 0
      ? Math.round(
          results.filter((r) => r.profile.viscosityIndex != null).reduce((s, r) => s + r.profile.viscosityIndex, 0) /
            results.filter((r) => r.profile.viscosityIndex != null).length
        )
      : 0;

  console.log(
    JSON.stringify(
      {
        result: "viscosity_analysis",
        data: {
          pools: results,
          summary: { poolsAnalyzed: results.length, avgViscosityIndex: avgIdx },
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
      const profile = analyzeViscosity(bins, activeBin);

      summaries.push({
        poolId,
        pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
        tvlUsd: pool.tvlUsd,
        viscosityIndex: profile.viscosityIndex,
        viscosityClass: profile.viscosityClass,
        avgViscosity: profile.avgViscosity,
        peakViscosity: profile.peakViscosity,
        buyViscosity: profile.buyViscosity,
        sellViscosity: profile.sellViscosity,
        viscosityAsymmetry: profile.viscosityAsymmetry,
        shearZoneCount: profile.shearZones.length,
        maxShearStress: profile.maxShearStress,
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

  console.log(JSON.stringify({ result: "viscosity_status", pools: summaries }, null, 2));
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();
program.name("hodlmm-bin-viscosity").description("HODLMM bin liquidity viscosity analyzer");

program.command("doctor").description("Check API connectivity").action(cmdDoctor);

program
  .command("run")
  .description("Full viscosity analysis")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "3")
  .action(cmdRun);

program.command("status").description("Quick viscosity summary").action(cmdStatus);

program.parse();
