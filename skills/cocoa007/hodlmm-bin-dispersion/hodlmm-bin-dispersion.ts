#!/usr/bin/env bun
/**
 * hodlmm-bin-dispersion.ts
 *
 * HODLMM Bin Dispersion Analyzer — Statistical dispersion profiling of
 * liquidity distribution across DLMM bins. Uses CV, skewness, kurtosis,
 * IQR, Theil index, and range ratio to classify how spread out or
 * concentrated pool liquidity is.
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 95).
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 30;

type DispersionClass = "TIGHT" | "MODERATE" | "SPREAD" | "DISPERSED" | "SCATTERED";

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

interface DispersionStats {
  mean: number;
  median: number;
  stdDev: number;
  cv: number;
  skewness: number;
  kurtosis: number;
  iqr: number;
  iqrRatio: number;
  rangeRatio: number;
  theilIndex: number;
  weightedCentroid: number;
  centroidOffset: number;
}

interface DispersionProfile {
  populatedBins: number;
  totalBins: number;
  scannedTvlUsd: number;
  stats: DispersionStats;
  dispersionScore: number;
  dispersionClass: DispersionClass;
  tailAnalysis: {
    leftTailBins: number;
    rightTailBins: number;
    leftTailUsd: number;
    rightTailUsd: number;
    tailAsymmetry: number;
    tailPct: number;
  };
  concentrationZones: {
    core: { bins: number; usd: number; pct: number };
    mid: { bins: number; usd: number; pct: number };
    outer: { bins: number; usd: number; pct: number };
  };
  asciiHistogram: string;
}

interface DispersionAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  profile: DispersionProfile;
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

// -- Statistical functions ----------------------------------------------------

function computeStats(values: number[]): { mean: number; median: number; stdDev: number } {
  const n = values.length;
  if (n === 0) return { mean: 0, median: 0, stdDev: 0 };

  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  return { mean, median, stdDev };
}

function computeSkewness(values: number[], mean: number, stdDev: number): number {
  if (stdDev === 0 || values.length < 3) return 0;
  const n = values.length;
  const m3 = values.reduce((s, v) => s + ((v - mean) / stdDev) ** 3, 0) / n;
  return Math.round(m3 * 1000) / 1000;
}

function computeKurtosis(values: number[], mean: number, stdDev: number): number {
  if (stdDev === 0 || values.length < 4) return 0;
  const n = values.length;
  const m4 = values.reduce((s, v) => s + ((v - mean) / stdDev) ** 4, 0) / n;
  return Math.round((m4 - 3) * 1000) / 1000;
}

function computeIQR(values: number[]): { iqr: number; q1: number; q3: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n < 4) return { iqr: 0, q1: sorted[0] ?? 0, q3: sorted[n - 1] ?? 0 };

  const q1Idx = Math.floor(n * 0.25);
  const q3Idx = Math.floor(n * 0.75);
  const q1 = sorted[q1Idx];
  const q3 = sorted[q3Idx];
  return { iqr: q3 - q1, q1, q3 };
}

function computeTheilIndex(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  if (mean === 0) return 0;

  let theil = 0;
  for (const v of values) {
    if (v > 0) {
      theil += (v / mean) * Math.log(v / mean);
    }
  }
  return Math.round((theil / n) * 1000) / 1000;
}

// -- Dispersion analysis ------------------------------------------------------

function computeDispersionStats(
  bins: BinReserves[],
  activeBinId: number
): DispersionStats {
  const populated = bins.filter(b => b.totalUsd > 0.01);
  const values = populated.map(b => b.totalUsd);

  const { mean, median, stdDev } = computeStats(values);
  const cv = mean > 0 ? Math.round((stdDev / mean) * 1000) / 1000 : 0;
  const skewness = computeSkewness(values, mean, stdDev);
  const kurtosis = computeKurtosis(values, mean, stdDev);
  const { iqr, q1, q3 } = computeIQR(values);
  const iqrRatio = median > 0 ? Math.round((iqr / median) * 1000) / 1000 : 0;

  const offsets = populated.map(b => Math.abs(b.binId - activeBinId));
  const maxOffset = offsets.length > 0 ? Math.max(...offsets) : 0;
  const minOffset = offsets.length > 0 ? Math.min(...offsets) : 0;
  const rangeRatio = BIN_SCAN_RADIUS > 0
    ? Math.round((maxOffset / BIN_SCAN_RADIUS) * 1000) / 1000
    : 0;

  const theilIndex = computeTheilIndex(values);

  const totalUsd = values.reduce((s, v) => s + v, 0);
  const weightedCentroid = totalUsd > 0
    ? populated.reduce((s, b) => s + b.binId * b.totalUsd, 0) / totalUsd
    : activeBinId;
  const centroidOffset = Math.round((weightedCentroid - activeBinId) * 100) / 100;

  return {
    mean: Math.round(mean * 100) / 100,
    median: Math.round(median * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100,
    cv,
    skewness,
    kurtosis,
    iqr: Math.round(iqr * 100) / 100,
    iqrRatio,
    rangeRatio,
    theilIndex,
    weightedCentroid: Math.round(weightedCentroid * 100) / 100,
    centroidOffset,
  };
}

function computeTailAnalysis(
  bins: BinReserves[],
  activeBinId: number
): DispersionProfile["tailAnalysis"] {
  const populated = bins.filter(b => b.totalUsd > 0.01);
  const totalUsd = populated.reduce((s, b) => s + b.totalUsd, 0);
  const tailThreshold = BIN_SCAN_RADIUS * 0.6;

  const leftTail = populated.filter(b => (activeBinId - b.binId) > tailThreshold);
  const rightTail = populated.filter(b => (b.binId - activeBinId) > tailThreshold);

  const leftUsd = leftTail.reduce((s, b) => s + b.totalUsd, 0);
  const rightUsd = rightTail.reduce((s, b) => s + b.totalUsd, 0);
  const tailTotal = leftUsd + rightUsd;

  const tailAsymmetry = tailTotal > 0
    ? Math.round(((rightUsd - leftUsd) / tailTotal) * 1000) / 1000
    : 0;

  return {
    leftTailBins: leftTail.length,
    rightTailBins: rightTail.length,
    leftTailUsd: Math.round(leftUsd * 100) / 100,
    rightTailUsd: Math.round(rightUsd * 100) / 100,
    tailAsymmetry,
    tailPct: totalUsd > 0 ? Math.round(tailTotal / totalUsd * 10000) / 100 : 0,
  };
}

function computeConcentrationZones(
  bins: BinReserves[],
  activeBinId: number
): DispersionProfile["concentrationZones"] {
  const populated = bins.filter(b => b.totalUsd > 0.01);
  const totalUsd = populated.reduce((s, b) => s + b.totalUsd, 0);

  const coreRadius = 5;
  const midRadius = 15;

  const core = populated.filter(b => Math.abs(b.binId - activeBinId) <= coreRadius);
  const mid = populated.filter(b => {
    const d = Math.abs(b.binId - activeBinId);
    return d > coreRadius && d <= midRadius;
  });
  const outer = populated.filter(b => Math.abs(b.binId - activeBinId) > midRadius);

  const coreUsd = core.reduce((s, b) => s + b.totalUsd, 0);
  const midUsd = mid.reduce((s, b) => s + b.totalUsd, 0);
  const outerUsd = outer.reduce((s, b) => s + b.totalUsd, 0);

  return {
    core: {
      bins: core.length,
      usd: Math.round(coreUsd * 100) / 100,
      pct: totalUsd > 0 ? Math.round(coreUsd / totalUsd * 10000) / 100 : 0,
    },
    mid: {
      bins: mid.length,
      usd: Math.round(midUsd * 100) / 100,
      pct: totalUsd > 0 ? Math.round(midUsd / totalUsd * 10000) / 100 : 0,
    },
    outer: {
      bins: outer.length,
      usd: Math.round(outerUsd * 100) / 100,
      pct: totalUsd > 0 ? Math.round(outerUsd / totalUsd * 10000) / 100 : 0,
    },
  };
}

function buildAsciiHistogram(
  bins: BinReserves[],
  activeBinId: number
): string {
  const populated = bins.filter(b => b.totalUsd > 0.01);
  if (populated.length === 0) return "(no populated bins)";

  const maxUsd = Math.max(...populated.map(b => b.totalUsd));
  const barWidth = 30;

  const lines: string[] = ["LIQUIDITY DISPERSION MAP", ""];
  lines.push("  offset  |  $value  | distribution");
  lines.push("  --------+----------+----------------------------------");

  const allBins = bins.filter(b => {
    const off = Math.abs(b.binId - activeBinId);
    return off <= BIN_SCAN_RADIUS;
  });

  const step = allBins.length > 40 ? 2 : 1;
  for (let i = 0; i < allBins.length; i += step) {
    const bin = allBins[i];
    const offset = bin.binId - activeBinId;
    const label = `${offset >= 0 ? "+" : ""}${offset}`;
    const usd = fmtUsd(bin.totalUsd).padStart(7);

    const normalizedLen = maxUsd > 0 ? Math.round((bin.totalUsd / maxUsd) * barWidth) : 0;
    const bar = bin.totalUsd > 0.01 ? "█".repeat(Math.max(1, normalizedLen)) : "·";
    const marker = offset === 0 ? " ◄ active" : "";

    lines.push(`  ${label.padStart(6)}  | ${usd} | ${bar}${marker}`);
  }

  lines.push("");
  lines.push("█ = liquidity    · = empty    ◄ = active bin");
  return lines.join("\n");
}

function classifyDispersion(score: number): DispersionClass {
  if (score < 20) return "TIGHT";
  if (score < 40) return "MODERATE";
  if (score < 60) return "SPREAD";
  if (score < 80) return "DISPERSED";
  return "SCATTERED";
}

function computeDispersionScore(
  stats: DispersionStats,
  zones: DispersionProfile["concentrationZones"],
  tails: DispersionProfile["tailAnalysis"]
): number {
  const cvComponent = Math.min(stats.cv / 2.5, 1) * 20;

  const coreConcentration = zones.core.pct;
  const coreComponent = Math.max(0, (100 - coreConcentration) / 100) * 25;

  const iqrComponent = Math.min(stats.iqrRatio / 3, 1) * 15;

  const rangeComponent = Math.min(stats.rangeRatio, 1) * 15;

  const tailComponent = Math.min(tails.tailPct / 20, 1) * 15;

  const theilComponent = Math.min(stats.theilIndex / 2, 1) * 10;

  const raw = cvComponent + coreComponent + iqrComponent + rangeComponent + tailComponent + theilComponent;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function buildProfile(
  bins: BinReserves[],
  activeBinId: number
): DispersionProfile {
  const populated = bins.filter(b => b.totalUsd > 0.01);
  const scannedTvl = populated.reduce((s, b) => s + b.totalUsd, 0);

  const stats = computeDispersionStats(bins, activeBinId);
  const tailAnalysis = computeTailAnalysis(bins, activeBinId);
  const concentrationZones = computeConcentrationZones(bins, activeBinId);
  const asciiHistogram = buildAsciiHistogram(bins, activeBinId);

  const dispersionScore = computeDispersionScore(stats, concentrationZones, tailAnalysis);
  const dispersionClass = classifyDispersion(dispersionScore);

  return {
    populatedBins: populated.length,
    totalBins: bins.length,
    scannedTvlUsd: Math.round(scannedTvl * 100) / 100,
    stats,
    dispersionScore,
    dispersionClass,
    tailAnalysis,
    concentrationZones,
    asciiHistogram,
  };
}

function buildRecommendation(pair: string, profile: DispersionProfile): string {
  const parts: string[] = [];
  const s = profile.stats;
  const z = profile.concentrationZones;

  parts.push(
    `${pair} dispersion: ${profile.dispersionClass} (score ${profile.dispersionScore}/100). ` +
    `CV=${s.cv}, skewness=${s.skewness}, kurtosis=${s.kurtosis}, Theil=${s.theilIndex}.`
  );

  parts.push(
    `Zone breakdown: core ${z.core.pct}% ($${fmtUsd(z.core.usd)}), ` +
    `mid ${z.mid.pct}% ($${fmtUsd(z.mid.usd)}), outer ${z.outer.pct}% ($${fmtUsd(z.outer.usd)}).`
  );

  if (s.centroidOffset !== 0) {
    const dir = s.centroidOffset > 0 ? "right (higher bins)" : "left (lower bins)";
    parts.push(`Liquidity centroid offset: ${s.centroidOffset > 0 ? "+" : ""}${s.centroidOffset} bins ${dir} from active bin.`);
  }

  const t = profile.tailAnalysis;
  if (t.tailPct > 5) {
    parts.push(`Tail liquidity: ${t.tailPct}% of scanned TVL sits in extreme bins (${t.leftTailBins} left, ${t.rightTailBins} right).`);
    if (Math.abs(t.tailAsymmetry) > 0.3) {
      const heavier = t.tailAsymmetry > 0 ? "right" : "left";
      parts.push(`Asymmetric tails — ${heavier} side is heavier, suggesting directional positioning.`);
    }
  }

  if (s.skewness > 1) {
    parts.push("Strongly right-skewed: a few bins hold disproportionately large reserves. Whale concentration likely.");
  } else if (s.skewness < -1) {
    parts.push("Left-skewed: liquidity bunched in lower-value bins with a few dominant upper bins.");
  }

  if (s.kurtosis > 3) {
    parts.push("Leptokurtic (heavy tails): extreme outlier bins present. Position sizing should account for liquidity cliffs.");
  } else if (s.kurtosis < -1) {
    parts.push("Platykurtic (thin tails): liquidity is uniformly spread — minimal concentration risk but also no deep anchor points.");
  }

  if (profile.dispersionClass === "TIGHT") {
    parts.push("Highly concentrated liquidity — most capital near active bin. Good for LPs seeking fee density but vulnerable to price moves outside the tight range.");
  } else if (profile.dispersionClass === "MODERATE") {
    parts.push("Balanced spread — healthy mix of core concentration and range coverage. Typical of well-managed pools.");
  } else if (profile.dispersionClass === "SPREAD") {
    parts.push("Notable spread — liquidity reaches significantly beyond the active zone. May indicate passive LPs or stale positions at the edges.");
  } else if (profile.dispersionClass === "DISPERSED") {
    parts.push("Widely dispersed — capital is thin across many bins. Fee competition is low but so is depth at any single price point.");
  } else {
    parts.push("Extremely scattered — liquidity spread thinly across the full scan range. Effective depth is much lower than TVL suggests. Active LPs concentrating near the active bin would capture outsized fees.");
  }

  return parts.join(" ");
}

// -- Main analysis ------------------------------------------------------------

async function analyzeDispersion(pool: AppPool): Promise<DispersionAnalysis> {
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

function makeErrorResult(pool: AppPool, errMsg: string): DispersionAnalysis {
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
      stats: {
        mean: 0, median: 0, stdDev: 0, cv: 0, skewness: 0, kurtosis: 0,
        iqr: 0, iqrRatio: 0, rangeRatio: 0, theilIndex: 0,
        weightedCentroid: 0, centroidOffset: 0,
      },
      dispersionScore: 0, dispersionClass: "TIGHT",
      tailAnalysis: {
        leftTailBins: 0, rightTailBins: 0, leftTailUsd: 0, rightTailUsd: 0,
        tailAsymmetry: 0, tailPct: 0,
      },
      concentrationZones: {
        core: { bins: 0, usd: 0, pct: 0 },
        mid: { bins: 0, usd: 0, pct: 0 },
        outer: { bins: 0, usd: 0, pct: 0 },
      },
      asciiHistogram: "",
    },
    recommendation: `Analysis failed: ${errMsg}`,
  };
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();

program
  .name("hodlmm-bin-dispersion")
  .description("HODLMM Bin Dispersion Analyzer — statistical spread profiling of liquidity distribution");

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
          metrics: ["CV", "skewness", "kurtosis", "IQR", "Theil index", "range ratio", "centroid offset"],
        },
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Doctor failed: ${err.message}` }));
    }
  });

program
  .command("run")
  .description("Analyze liquidity dispersion for HODLMM pools")
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

      const results: DispersionAnalysis[] = [];
      for (const pool of targets) {
        try {
          const analysis = await analyzeDispersion(pool);
          results.push(analysis);
        } catch (err: any) {
          results.push(makeErrorResult(pool, err.message));
        }
      }

      const summary = {
        poolsAnalyzed: results.length,
        mostDispersed: results.reduce((best, r) =>
          r.profile.dispersionScore > best.profile.dispersionScore ? r : best, results[0]),
        tightest: results.reduce((best, r) =>
          r.profile.dispersionScore < best.profile.dispersionScore ? r : best, results[0]),
        avgDispersionScore: Math.round(
          results.reduce((s, r) => s + r.profile.dispersionScore, 0) / results.length
        ),
        avgCV: Math.round(
          results.reduce((s, r) => s + r.profile.stats.cv, 0) / results.length * 1000
        ) / 1000,
        classCounts: {
          TIGHT: results.filter(r => r.profile.dispersionClass === "TIGHT").length,
          MODERATE: results.filter(r => r.profile.dispersionClass === "MODERATE").length,
          SPREAD: results.filter(r => r.profile.dispersionClass === "SPREAD").length,
          DISPERSED: results.filter(r => r.profile.dispersionClass === "DISPERSED").length,
          SCATTERED: results.filter(r => r.profile.dispersionClass === "SCATTERED").length,
        },
      };

      console.log(JSON.stringify({
        result: "dispersion_analysis",
        data: { pools: results, summary },
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Run failed: ${err.message}` }));
    }
  });

program
  .command("status")
  .description("Quick dispersion summary for top pools")
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
          const analysis = await analyzeDispersion(pool);
          summaries.push({
            pair: analysis.pair,
            poolId: analysis.poolId,
            tvlUsd: analysis.tvlUsd,
            dispersionScore: analysis.profile.dispersionScore,
            dispersionClass: analysis.profile.dispersionClass,
            cv: analysis.profile.stats.cv,
            skewness: analysis.profile.stats.skewness,
            kurtosis: analysis.profile.stats.kurtosis,
            theilIndex: analysis.profile.stats.theilIndex,
            corePct: analysis.profile.concentrationZones.core.pct,
            centroidOffset: analysis.profile.stats.centroidOffset,
          });
        } catch {
          summaries.push({
            pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
            poolId: pool.poolId,
            tvlUsd: pool.tvlUsd,
            dispersionScore: -1,
          });
        }
      }

      console.log(JSON.stringify({ result: "dispersion_status", data: summaries }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Status failed: ${err.message}` }));
    }
  });

program.parse();
