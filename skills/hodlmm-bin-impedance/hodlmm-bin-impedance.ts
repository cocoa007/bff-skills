#!/usr/bin/env bun
/**
 * hodlmm-bin-impedance.ts — Day 108 cocoa007 Bitflow Skills Comp
 *
 * Bin trade flow impedance analyzer — measures how much resistance each
 * bin offers to trade execution. Low impedance = smooth flow. High
 * impedance = friction, reflection, and unpredictable execution.
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

interface MatchedCorridor {
  binRange: [number, number];
  avgImpedance: number;
  binCount: number;
  avgReflection: number;
  flowQuality: number;
}

interface StandingWaveZone {
  binRange: [number, number];
  avgOscillation: number;
  binCount: number;
  riskLevel: number;
}

interface ImpedanceProfile {
  populatedBins: number;
  scannedTvlUsd: number;
  activeBinTvlUsd: number;

  localImpedance: { binId: number; impedance: number; resistive: number; reactive: number }[];
  avgImpedance: number;
  peakImpedance: number;
  minImpedance: number;

  reflectionCoefficients: { binBoundary: [number, number]; coefficient: number }[];
  avgReflection: number;
  maxReflection: number;

  matchedCorridors: MatchedCorridor[];
  standingWaveZones: StandingWaveZone[];

  characteristicImpedance: number;
  impedanceBandwidth: number;

  buyImpedance: number;
  sellImpedance: number;
  directionalImpedance: { buy: number; sell: number };
  impedanceAsymmetry: number;

  impedanceClass: "transparent" | "low-impedance" | "moderate-impedance" | "high-impedance" | "opaque";
  impedanceIndex: number;

  asciiImpedanceMap: string;
}

interface ImpedanceAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  profile: ImpedanceProfile;
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

// -- Impedance Analysis -------------------------------------------------------

function computeLocalImpedance(bins: BinReserves[]): { binId: number; impedance: number; resistive: number; reactive: number }[] {
  if (bins.length < 3) return bins.map((b) => ({ binId: b.binId, impedance: 0.5, resistive: 0.5, reactive: 0 }));

  const maxReserve = Math.max(...bins.map((b) => b.totalUsd), 1);
  const result: { binId: number; impedance: number; resistive: number; reactive: number }[] = [];

  for (let i = 0; i < bins.length; i++) {
    const curr = bins[i];

    // Resistive component: inverse of reserve depth normalized to pool max
    // Thin bins have high resistance, deep bins have low resistance
    const depthRatio = curr.totalUsd / maxReserve;
    const resistive = Number((1 - Math.min(1, depthRatio * 1.5)).toFixed(4));

    // Reactive component: directional pressure asymmetry
    // A bin with highly skewed X/Y reserves responds asymmetrically to buy vs sell
    const totalReserveUsd = curr.reserveXUsd + curr.reserveYUsd;
    let reactive = 0;
    if (totalReserveUsd > 0.01) {
      const xRatio = curr.reserveXUsd / totalReserveUsd;
      const skew = Math.abs(xRatio - 0.5) * 2; // 0 = balanced, 1 = fully skewed
      reactive = Number((skew * 0.8).toFixed(4));
    } else {
      reactive = 0.5; // empty bins have moderate reactive impedance
    }

    // Neighbor mismatch adds to impedance — bins that differ greatly from neighbors
    // create flow resistance from discontinuity
    const prev = i > 0 ? bins[i - 1].totalUsd : curr.totalUsd;
    const next = i < bins.length - 1 ? bins[i + 1].totalUsd : curr.totalUsd;
    const neighborAvg = (prev + next) / 2;
    const mismatchFactor = neighborAvg > 0.01
      ? Math.min(1, Math.abs(curr.totalUsd - neighborAvg) / Math.max(neighborAvg, 0.01))
      : (curr.totalUsd > 0.01 ? 0.5 : 0);

    // Composite impedance: weighted combination
    const impedance = Number(Math.min(1, Math.max(0,
      resistive * 0.45 + reactive * 0.25 + mismatchFactor * 0.3
    )).toFixed(4));

    result.push({ binId: curr.binId, impedance, resistive, reactive });
  }

  return result;
}

function computeReflectionCoefficients(
  localImpedance: { binId: number; impedance: number }[]
): { binBoundary: [number, number]; coefficient: number }[] {
  const coefficients: { binBoundary: [number, number]; coefficient: number }[] = [];

  for (let i = 0; i < localImpedance.length - 1; i++) {
    const z1 = localImpedance[i].impedance;
    const z2 = localImpedance[i + 1].impedance;

    // Reflection coefficient: |Z2 - Z1| / (Z2 + Z1)
    // 0 = perfect impedance match (no reflection)
    // 1 = total mismatch (full reflection)
    const sum = z1 + z2;
    const coefficient = sum > 0
      ? Number((Math.abs(z2 - z1) / sum).toFixed(4))
      : 0;

    coefficients.push({
      binBoundary: [localImpedance[i].binId, localImpedance[i + 1].binId],
      coefficient,
    });
  }

  return coefficients;
}

function detectMatchedCorridors(
  localImpedance: { binId: number; impedance: number }[],
  reflectionCoefficients: { binBoundary: [number, number]; coefficient: number }[],
  reflectionThreshold: number
): MatchedCorridor[] {
  const corridors: MatchedCorridor[] = [];
  let corridorStart = -1;

  for (let i = 0; i <= reflectionCoefficients.length; i++) {
    const isMatched = i < reflectionCoefficients.length && reflectionCoefficients[i].coefficient < reflectionThreshold;

    if (isMatched && corridorStart === -1) {
      corridorStart = i;
    } else if (!isMatched && corridorStart !== -1) {
      const startBin = localImpedance[corridorStart].binId;
      const endBin = localImpedance[i].binId;
      const slice = localImpedance.slice(corridorStart, i + 1);
      const refSlice = reflectionCoefficients.slice(corridorStart, i);

      const avgImpedance = Number((slice.reduce((s, v) => s + v.impedance, 0) / slice.length).toFixed(4));
      const avgReflection = refSlice.length > 0
        ? Number((refSlice.reduce((s, v) => s + v.coefficient, 0) / refSlice.length).toFixed(4))
        : 0;
      const flowQuality = Number(((1 - avgImpedance) * (1 - avgReflection) * 100).toFixed(1));

      if (slice.length >= 3) {
        corridors.push({
          binRange: [startBin, endBin],
          avgImpedance,
          binCount: slice.length,
          avgReflection,
          flowQuality,
        });
      }
      corridorStart = -1;
    }
  }

  return corridors.sort((a, b) => b.flowQuality - a.flowQuality).slice(0, 8);
}

function detectStandingWaveZones(
  localImpedance: { binId: number; impedance: number }[]
): StandingWaveZone[] {
  // Standing waves = alternating high/low impedance patterns
  const zones: StandingWaveZone[] = [];
  const oscillations: number[] = [];

  for (let i = 1; i < localImpedance.length - 1; i++) {
    const prev = localImpedance[i - 1].impedance;
    const curr = localImpedance[i].impedance;
    const next = localImpedance[i + 1].impedance;

    // Oscillation strength: how much does this bin differ from the trend of its neighbors?
    const neighborTrend = (prev + next) / 2;
    const osc = Math.abs(curr - neighborTrend);
    oscillations.push(osc);
  }

  // Find runs of high oscillation
  const oscThreshold = 0.15;
  let zoneStart = -1;

  for (let i = 0; i <= oscillations.length; i++) {
    const isOscillating = i < oscillations.length && oscillations[i] > oscThreshold;

    if (isOscillating && zoneStart === -1) {
      zoneStart = i;
    } else if (!isOscillating && zoneStart !== -1) {
      const startIdx = zoneStart + 1; // offset by 1 because oscillations array is shifted
      const endIdx = i + 1;
      const slice = oscillations.slice(zoneStart, i);

      if (slice.length >= 3) {
        const avgOsc = Number((slice.reduce((s, v) => s + v, 0) / slice.length).toFixed(4));
        const riskLevel = Number((avgOsc * slice.length * 10).toFixed(1));

        zones.push({
          binRange: [localImpedance[startIdx].binId, localImpedance[Math.min(endIdx, localImpedance.length - 1)].binId],
          avgOscillation: avgOsc,
          binCount: slice.length,
          riskLevel: Math.min(100, riskLevel),
        });
      }
      zoneStart = -1;
    }
  }

  return zones.sort((a, b) => b.riskLevel - a.riskLevel).slice(0, 8);
}

function classifyImpedance(index: number): "transparent" | "low-impedance" | "moderate-impedance" | "high-impedance" | "opaque" {
  if (index < 20) return "transparent";
  if (index < 40) return "low-impedance";
  if (index < 60) return "moderate-impedance";
  if (index < 80) return "high-impedance";
  return "opaque";
}

function buildAsciiImpedanceMap(
  localImpedance: { binId: number; impedance: number }[],
  activeBinId: number,
  matchedCorridors: MatchedCorridor[],
  standingWaveZones: StandingWaveZone[]
): string {
  const width = 30;
  const lines: string[] = ["IMPEDANCE MAP (trade flow resistance across bin range)"];
  lines.push(`${"Bin".padStart(8)} | ${"Impedance".padEnd(width + 12)} |`);

  const matchedBins = new Set<number>();
  for (const c of matchedCorridors) {
    for (let b = c.binRange[0]; b <= c.binRange[1]; b++) matchedBins.add(b);
  }
  const waveBins = new Set<number>();
  for (const z of standingWaveZones) {
    for (let b = z.binRange[0]; b <= z.binRange[1]; b++) waveBins.add(b);
  }

  const step = Math.max(1, Math.floor(localImpedance.length / 40));
  for (let i = 0; i < localImpedance.length; i += step) {
    const li = localImpedance[i];
    const barLen = Math.round(li.impedance * width);
    const bar = "\u2588".repeat(Math.max(barLen, 0));
    let marker = "";
    if (li.binId === activeBinId) {
      marker = " **ACTIVE**";
    } else if (waveBins.has(li.binId)) {
      marker = " ~~WAVE~~";
    } else if (matchedBins.has(li.binId)) {
      marker = " [MATCHED]";
    }
    const pct = (li.impedance * 100).toFixed(0);
    lines.push(`${String(li.binId).padStart(8)} | ${bar.padEnd(width)} ${pct.padStart(3)}%${marker}`);
  }

  return lines.join("\n");
}

function analyzeImpedance(bins: BinReserves[], activeBinId: number): ImpedanceProfile {
  const populated = bins.filter((b) => b.totalUsd > 0);
  const totalTvl = bins.reduce((s, b) => s + b.totalUsd, 0);
  const activeBin = bins.find((b) => b.binId === activeBinId);
  const activeBinTvl = activeBin?.totalUsd ?? 0;

  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const activeBinIdx = sorted.findIndex((b) => b.binId === activeBinId);

  const localImpedance = computeLocalImpedance(sorted);
  const impedanceValues = localImpedance.map((v) => v.impedance);

  const avgImpedance = impedanceValues.length > 0
    ? Number((impedanceValues.reduce((a, b) => a + b, 0) / impedanceValues.length).toFixed(4))
    : 0;
  const peakImpedance = impedanceValues.length > 0 ? Math.max(...impedanceValues) : 0;
  const minImpedance = impedanceValues.length > 0 ? Math.min(...impedanceValues) : 0;

  // Reflection coefficients at each bin boundary
  const reflectionCoefficients = computeReflectionCoefficients(localImpedance);
  const refValues = reflectionCoefficients.map((r) => r.coefficient);
  const avgReflection = refValues.length > 0
    ? Number((refValues.reduce((a, b) => a + b, 0) / refValues.length).toFixed(4))
    : 0;
  const maxReflection = refValues.length > 0 ? Math.max(...refValues) : 0;

  // Matched corridors (low reflection, consistent impedance)
  const matchedCorridors = detectMatchedCorridors(localImpedance, reflectionCoefficients, 0.15);

  // Standing wave zones (alternating impedance patterns)
  const standingWaveZones = detectStandingWaveZones(localImpedance);

  // Characteristic impedance: median impedance of populated bins
  const populatedImpedances = localImpedance
    .filter((li) => {
      const bin = sorted.find((b) => b.binId === li.binId);
      return bin && bin.totalUsd > 0;
    })
    .map((li) => li.impedance)
    .sort((a, b) => a - b);
  const characteristicImpedance = populatedImpedances.length > 0
    ? Number(populatedImpedances[Math.floor(populatedImpedances.length / 2)].toFixed(4))
    : 0.5;

  // Impedance bandwidth: fraction of bins within 20% of characteristic impedance
  const bandwidthBins = populatedImpedances.filter(
    (z) => Math.abs(z - characteristicImpedance) / Math.max(characteristicImpedance, 0.01) < 0.2
  ).length;
  const impedanceBandwidth = populatedImpedances.length > 0
    ? Number((bandwidthBins / populatedImpedances.length).toFixed(4))
    : 0;

  // Directional impedance
  const sellSideImpedances = activeBinIdx > 0
    ? impedanceValues.slice(0, activeBinIdx)
    : [];
  const buySideImpedances = activeBinIdx < impedanceValues.length - 1
    ? impedanceValues.slice(activeBinIdx + 1)
    : [];

  const sellImpedance = sellSideImpedances.length > 0
    ? Number((sellSideImpedances.reduce((a, b) => a + b, 0) / sellSideImpedances.length).toFixed(4))
    : 0;
  const buyImpedance = buySideImpedances.length > 0
    ? Number((buySideImpedances.reduce((a, b) => a + b, 0) / buySideImpedances.length).toFixed(4))
    : 0;

  const totalImp = buyImpedance + sellImpedance;
  const impedanceAsymmetry = totalImp > 0
    ? Number(((buyImpedance - sellImpedance) / totalImp).toFixed(4))
    : 0;

  // Composite scoring — LOWER index = better (less resistance)
  const baseScore = avgImpedance * 40;
  const reflectionScore = avgReflection * 20;
  const waveScore = Math.min(15, standingWaveZones.reduce((s, z) => s + z.riskLevel, 0) * 0.15);
  const corridorBonus = Math.min(15, matchedCorridors.reduce((s, c) => s + c.binCount, 0) * 0.3);
  const emptinessPenalty = Math.min(10, ((bins.length - populated.length) / Math.max(bins.length, 1)) * 10);
  const asymmetryPenalty = Math.min(10, Math.abs(impedanceAsymmetry) * 10);
  const bandwidthBonus = Math.min(10, impedanceBandwidth * 10);

  const impedanceIndex = Math.round(Math.min(100, Math.max(0,
    baseScore + reflectionScore + waveScore - corridorBonus + emptinessPenalty + asymmetryPenalty - bandwidthBonus
  )));

  const impedanceClass = classifyImpedance(impedanceIndex);

  const asciiImpedanceMap = buildAsciiImpedanceMap(
    localImpedance, activeBinId, matchedCorridors, standingWaveZones
  );

  return {
    populatedBins: populated.length,
    scannedTvlUsd: totalTvl,
    activeBinTvlUsd: activeBinTvl,
    localImpedance,
    avgImpedance,
    peakImpedance,
    minImpedance,
    reflectionCoefficients,
    avgReflection,
    maxReflection,
    matchedCorridors,
    standingWaveZones,
    characteristicImpedance,
    impedanceBandwidth,
    buyImpedance,
    sellImpedance,
    directionalImpedance: { buy: buyImpedance, sell: sellImpedance },
    impedanceAsymmetry,
    impedanceClass,
    impedanceIndex,
    asciiImpedanceMap,
  };
}

function generateRecommendation(p: ImpedanceProfile): string {
  const parts: string[] = [];

  switch (p.impedanceClass) {
    case "transparent":
      parts.push("Near-zero impedance — trade flow meets almost no resistance. Deep reserves, well-matched bins, and smooth transitions. Excellent for all trade sizes.");
      break;
    case "low-impedance":
      parts.push("Low impedance — trades flow with minimal friction. Reserve depth is sufficient and bins are reasonably well-matched. Good for moderate-to-large trades.");
      break;
    case "moderate-impedance":
      parts.push("Moderate impedance — noticeable resistance to trade flow. Some bins are thin or mismatched. Check matched corridors for optimal execution ranges.");
      break;
    case "high-impedance":
      parts.push("High impedance — significant resistance to trade flow. Thin reserves and mismatched bins create friction. Best for small trades only. Route through matched corridors when possible.");
      break;
    case "opaque":
      parts.push("Near-total impedance — trades face extreme resistance. Very thin or absent reserves with severe mismatches. Avoid large trades. Expect significant slippage and unpredictable execution.");
      break;
  }

  if (p.matchedCorridors.length > 0) {
    const best = p.matchedCorridors[0];
    parts.push(`${p.matchedCorridors.length} matched corridor(s). Best at bins ${best.binRange[0]}-${best.binRange[1]} (${best.binCount} bins, ${best.flowQuality.toFixed(0)}% flow quality). Trades within matched corridors execute with minimal reflection.`);
  } else {
    parts.push("No matched corridors found — impedance varies significantly across the range, creating reflection at every boundary.");
  }

  if (p.standingWaveZones.length > 0) {
    const worst = p.standingWaveZones[0];
    parts.push(`${p.standingWaveZones.length} standing-wave zone(s). Most severe at bins ${worst.binRange[0]}-${worst.binRange[1]} (risk level ${worst.riskLevel.toFixed(0)}). Alternating impedance creates price oscillation risk.`);
  } else {
    parts.push("No standing-wave patterns — impedance transitions are gradual without oscillation risk.");
  }

  if (p.avgReflection > 0.3) {
    parts.push(`High average reflection (${(p.avgReflection * 100).toFixed(0)}%). Trade impact frequently bounces at bin boundaries. Expect price reversions after large trades.`);
  } else if (p.avgReflection < 0.1) {
    parts.push(`Low average reflection (${(p.avgReflection * 100).toFixed(0)}%). Trade impact transmits cleanly across bin boundaries.`);
  }

  if (Math.abs(p.impedanceAsymmetry) > 0.3) {
    const harder = p.impedanceAsymmetry > 0 ? "buy" : "sell";
    const easier = p.impedanceAsymmetry > 0 ? "sell" : "buy";
    parts.push(`Directional asymmetry (${p.impedanceAsymmetry.toFixed(2)}). ${harder}-side has higher impedance — more resistance. ${easier}-side flows more easily.`);
  } else {
    parts.push(`Symmetric impedance (${p.impedanceAsymmetry.toFixed(2)}). Both directions face similar resistance.`);
  }

  parts.push(`Characteristic impedance: ${(p.characteristicImpedance * 100).toFixed(0)}%. Bandwidth: ${(p.impedanceBandwidth * 100).toFixed(0)}% of bins within tolerance.`);

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

  const results: ImpedanceAnalysis[] = [];
  for (const pool of targets) {
    const poolId = pool.poolId!;
    try {
      const activeBin = pool.activeBinId ?? (await getActiveBin(poolId));
      const bins = await scanBins(poolId, activeBin, pool, BIN_SCAN_RADIUS);
      const profile = analyzeImpedance(bins, activeBin);
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
        profile: {} as ImpedanceProfile,
        recommendation: `Error: ${e.message}`,
      });
    }
  }

  const avgIdx =
    results.filter((r) => r.profile.impedanceIndex != null).length > 0
      ? Math.round(
          results.filter((r) => r.profile.impedanceIndex != null).reduce((s, r) => s + r.profile.impedanceIndex, 0) /
            results.filter((r) => r.profile.impedanceIndex != null).length
        )
      : 0;

  console.log(
    JSON.stringify(
      {
        result: "impedance_analysis",
        data: {
          pools: results,
          summary: { poolsAnalyzed: results.length, avgImpedanceIndex: avgIdx },
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
      const profile = analyzeImpedance(bins, activeBin);

      summaries.push({
        poolId,
        pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
        tvlUsd: pool.tvlUsd,
        impedanceIndex: profile.impedanceIndex,
        impedanceClass: profile.impedanceClass,
        characteristicImpedance: profile.characteristicImpedance,
        avgImpedance: profile.avgImpedance,
        avgReflection: profile.avgReflection,
        maxReflection: profile.maxReflection,
        buyImpedance: profile.buyImpedance,
        sellImpedance: profile.sellImpedance,
        impedanceAsymmetry: profile.impedanceAsymmetry,
        impedanceBandwidth: profile.impedanceBandwidth,
        matchedCorridorCount: profile.matchedCorridors.length,
        standingWaveZoneCount: profile.standingWaveZones.length,
      });
    } catch (e: any) {
      summaries.push({
        poolId,
        pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
        error: e.message,
      });
    }
  }

  console.log(JSON.stringify({ result: "impedance_status", pools: summaries }, null, 2));
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();
program.name("hodlmm-bin-impedance").description("HODLMM bin trade flow impedance analyzer");

program.command("doctor").description("Check API connectivity").action(cmdDoctor);

program
  .command("run")
  .description("Full impedance analysis")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "3")
  .action(cmdRun);

program.command("status").description("Quick impedance summary").action(cmdStatus);

program.parse();
