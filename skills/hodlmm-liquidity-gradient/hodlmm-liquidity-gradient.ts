#!/usr/bin/env bun
/**
 * hodlmm-liquidity-gradient.ts
 *
 * HODLMM Liquidity Gradient Analyzer — Measures the rate of change of
 * liquidity across adjacent bins, detecting cliffs (sudden dropoffs),
 * slopes (gradual changes), and plateaus (uniform regions). Helps LPs
 * understand where liquidity terrain is smooth vs treacherous.
 *
 * Key metrics:
 *  - Gradient per bin: signed rate of change in USD liquidity
 *  - Cliff detection: bins where gradient exceeds threshold
 *  - Plateau detection: contiguous bins with near-zero gradient
 *  - Slope classification: STEEP_UP / GENTLE_UP / FLAT / GENTLE_DOWN / STEEP_DOWN
 *  - Terrain roughness: standard deviation of gradients (smooth vs jagged)
 *  - Symmetry score: gradient balance above vs below active bin
 *  - Gradient momentum: whether liquidity is concentrating or dispersing
 *  - Support/resistance zones: where steep gradients create natural barriers
 *  - ASCII gradient profile showing liquidity terrain
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 79).
 */

import { Command } from "commander";

// -- Constants ----------------------------------------------------------------

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 25;

const CLIFF_THRESHOLD_PCT = 50; // gradient > 50% of max liquidity = cliff
const PLATEAU_THRESHOLD_PCT = 5; // gradient < 5% of avg liquidity = plateau
const STEEP_THRESHOLD_PCT = 25; // gradient > 25% of avg = steep

// -- Types --------------------------------------------------------------------

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

type SlopeClass =
  | "STEEP_UP"    // sharp liquidity increase moving to higher bins
  | "GENTLE_UP"   // gradual increase
  | "FLAT"         // minimal change
  | "GENTLE_DOWN"  // gradual decrease
  | "STEEP_DOWN";  // sharp liquidity drop

interface BinGradient {
  binId: number;
  liquidityUsd: number;
  gradientUsd: number; // change from previous bin (signed)
  gradientPct: number; // percentage change
  slopeClass: SlopeClass;
  isCliff: boolean;
  isPlateau: boolean;
  cumulativeGradient: number;
}

interface PlateauZone {
  startBin: number;
  endBin: number;
  width: number;
  avgLiquidityUsd: number;
  position: "ABOVE" | "BELOW" | "SPANNING"; // relative to active bin
}

interface CliffZone {
  binId: number;
  gradientUsd: number;
  gradientPct: number;
  direction: "DROP" | "RISE";
  severity: "MODERATE" | "SEVERE" | "EXTREME";
  position: "ABOVE" | "BELOW"; // relative to active bin
}

interface SupportResistance {
  binId: number;
  type: "SUPPORT" | "RESISTANCE";
  strength: number; // 0-100
  liquidityWallUsd: number;
}

type TerrainType =
  | "SMOOTH"     // low roughness, gradual transitions
  | "TERRACED"   // plateaus with steps between them
  | "JAGGED"     // high roughness, unpredictable gradients
  | "CLIFF_SIDED" // one or both sides have sharp dropoffs
  | "PEAKED";     // liquidity concentrated in narrow peak

interface GradientAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  // Gradient metrics
  avgGradientUsd: number;
  maxGradientUsd: number;
  minGradientUsd: number;
  // Terrain
  terrainType: TerrainType;
  roughnessScore: number; // 0-100, stddev of gradients normalized
  smoothnessIndex: number; // inverse of roughness, 0-100
  // Cliffs
  cliffs: CliffZone[];
  totalCliffs: number;
  cliffsAbove: number;
  cliffsBelow: number;
  // Plateaus
  plateaus: PlateauZone[];
  totalPlateaus: number;
  widestPlateau: PlateauZone | null;
  // Symmetry
  avgGradientAbove: number;
  avgGradientBelow: number;
  symmetryScore: number; // 0-1, how symmetric gradients are
  gradientBias: "STEEPER_ABOVE" | "STEEPER_BELOW" | "SYMMETRIC";
  // Support / Resistance
  supportLevels: SupportResistance[];
  resistanceLevels: SupportResistance[];
  // Concentration
  gradientMomentum: "CONCENTRATING" | "DISPERSING" | "STABLE";
  peakBin: number;
  peakLiquidityUsd: number;
  liquidityAbove: number;
  liquidityBelow: number;
  // Per-bin data
  gradients: BinGradient[];
  recommendation: string;
  asciiProfile: string;
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
  if (hex.startsWith("00")) hex = hex.slice(2); // response wrapper
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

// -- Gradient analysis --------------------------------------------------------

function classifySlope(gradientPct: number, avgLiquidity: number, maxLiquidity: number): SlopeClass {
  const absPct = Math.abs(gradientPct);
  if (absPct < PLATEAU_THRESHOLD_PCT) return "FLAT";
  if (gradientPct > 0) {
    return absPct >= STEEP_THRESHOLD_PCT ? "STEEP_UP" : "GENTLE_UP";
  }
  return absPct >= STEEP_THRESHOLD_PCT ? "STEEP_DOWN" : "GENTLE_DOWN";
}

function isCliff(gradientPct: number): boolean {
  return Math.abs(gradientPct) >= CLIFF_THRESHOLD_PCT;
}

function computeGradients(bins: BinReserves[], activeBin: number): BinGradient[] {
  if (bins.length < 2) return [];

  const populated = bins.filter(b => b.totalUsd > 0);
  const avgLiquidity = populated.length > 0
    ? populated.reduce((s, b) => s + b.totalUsd, 0) / populated.length
    : 1;
  const maxLiquidity = Math.max(...bins.map(b => b.totalUsd), 1);

  const gradients: BinGradient[] = [];
  let cumulative = 0;

  for (let i = 0; i < bins.length; i++) {
    const bin = bins[i];
    let gradientUsd = 0;
    let gradientPct = 0;

    if (i > 0) {
      const prev = bins[i - 1];
      gradientUsd = bin.totalUsd - prev.totalUsd;
      const base = Math.max(prev.totalUsd, avgLiquidity * 0.01);
      gradientPct = (gradientUsd / base) * 100;
    }

    cumulative += gradientUsd;
    const slope = classifySlope(gradientPct, avgLiquidity, maxLiquidity);
    const cliff = isCliff(gradientPct);
    const plateau = Math.abs(gradientPct) < PLATEAU_THRESHOLD_PCT && bin.totalUsd > 0;

    gradients.push({
      binId: bin.binId,
      liquidityUsd: bin.totalUsd,
      gradientUsd,
      gradientPct,
      slopeClass: slope,
      isCliff: cliff,
      isPlateau: plateau,
      cumulativeGradient: cumulative,
    });
  }

  return gradients;
}

function detectCliffs(gradients: BinGradient[], activeBin: number): CliffZone[] {
  return gradients
    .filter(g => g.isCliff)
    .map(g => {
      const absPct = Math.abs(g.gradientPct);
      let severity: CliffZone["severity"] = "MODERATE";
      if (absPct >= 200) severity = "EXTREME";
      else if (absPct >= 100) severity = "SEVERE";

      return {
        binId: g.binId,
        gradientUsd: g.gradientUsd,
        gradientPct: g.gradientPct,
        direction: g.gradientUsd < 0 ? "DROP" as const : "RISE" as const,
        severity,
        position: g.binId >= activeBin ? "ABOVE" as const : "BELOW" as const,
      };
    });
}

function detectPlateaus(gradients: BinGradient[], activeBin: number): PlateauZone[] {
  const plateaus: PlateauZone[] = [];
  let start = -1;
  let sum = 0;
  let count = 0;

  for (let i = 0; i < gradients.length; i++) {
    if (gradients[i].isPlateau) {
      if (start === -1) {
        start = i;
        sum = 0;
        count = 0;
      }
      sum += gradients[i].liquidityUsd;
      count++;
    } else if (start !== -1) {
      if (count >= 2) {
        const startBin = gradients[start].binId;
        const endBin = gradients[i - 1].binId;
        let position: PlateauZone["position"] = "ABOVE";
        if (endBin < activeBin) position = "BELOW";
        else if (startBin <= activeBin && endBin >= activeBin) position = "SPANNING";

        plateaus.push({
          startBin,
          endBin,
          width: count,
          avgLiquidityUsd: sum / count,
          position,
        });
      }
      start = -1;
    }
  }

  if (start !== -1 && count >= 2) {
    const startBin = gradients[start].binId;
    const endBin = gradients[gradients.length - 1].binId;
    let position: PlateauZone["position"] = "ABOVE";
    if (endBin < activeBin) position = "BELOW";
    else if (startBin <= activeBin && endBin >= activeBin) position = "SPANNING";

    plateaus.push({
      startBin,
      endBin,
      width: count,
      avgLiquidityUsd: sum / count,
      position,
    });
  }

  return plateaus;
}

function detectSupportResistance(gradients: BinGradient[], activeBin: number): {
  support: SupportResistance[];
  resistance: SupportResistance[];
} {
  const support: SupportResistance[] = [];
  const resistance: SupportResistance[] = [];
  const maxLiq = Math.max(...gradients.map(g => g.liquidityUsd), 1);

  for (const g of gradients) {
    if (!g.isCliff) continue;

    const strength = Math.min(100, Math.round((g.liquidityUsd / maxLiq) * 100));

    if (g.binId < activeBin && g.gradientUsd > 0) {
      // Rising liquidity below active = support
      support.push({
        binId: g.binId,
        type: "SUPPORT",
        strength,
        liquidityWallUsd: g.liquidityUsd,
      });
    } else if (g.binId > activeBin && g.gradientUsd > 0) {
      // Rising liquidity above active = resistance
      resistance.push({
        binId: g.binId,
        type: "RESISTANCE",
        strength,
        liquidityWallUsd: g.liquidityUsd,
      });
    }
  }

  return { support, resistance };
}

function classifyTerrain(
  roughness: number,
  cliffs: CliffZone[],
  plateaus: PlateauZone[],
  gradients: BinGradient[]
): TerrainType {
  const populated = gradients.filter(g => g.liquidityUsd > 0);
  if (populated.length === 0) return "SMOOTH";

  // Check for peaked distribution
  const maxLiq = Math.max(...gradients.map(g => g.liquidityUsd));
  const totalLiq = gradients.reduce((s, g) => s + g.liquidityUsd, 0);
  const peakBins = gradients.filter(g => g.liquidityUsd > maxLiq * 0.5);
  if (peakBins.length <= 3 && totalLiq > 0 && maxLiq / totalLiq > 0.3) {
    return "PEAKED";
  }

  if (cliffs.length >= 2) return "CLIFF_SIDED";
  if (plateaus.length >= 2 && cliffs.length >= 1) return "TERRACED";
  if (roughness > 60) return "JAGGED";
  return "SMOOTH";
}

function computeRoughness(gradients: BinGradient[]): number {
  const populated = gradients.filter(g => g.liquidityUsd > 0);
  if (populated.length < 2) return 0;

  const avgGrad = populated.reduce((s, g) => s + Math.abs(g.gradientPct), 0) / populated.length;
  const variance = populated.reduce(
    (s, g) => s + (Math.abs(g.gradientPct) - avgGrad) ** 2,
    0
  ) / populated.length;
  const stddev = Math.sqrt(variance);

  // Normalize to 0-100 (stddev of 100% = roughness 100)
  return Math.min(100, Math.round(stddev));
}

function determineGradientMomentum(gradients: BinGradient[], activeBin: number): "CONCENTRATING" | "DISPERSING" | "STABLE" {
  // Look at gradient direction near active bin
  const nearActive = gradients.filter(g => Math.abs(g.binId - activeBin) <= 5);
  if (nearActive.length < 3) return "STABLE";

  const belowGrads = nearActive.filter(g => g.binId < activeBin);
  const aboveGrads = nearActive.filter(g => g.binId > activeBin);

  const belowRising = belowGrads.filter(g => g.gradientUsd > 0).length;
  const aboveDropping = aboveGrads.filter(g => g.gradientUsd < 0).length;

  // Concentrating: liquidity rising toward active bin from both sides
  if (belowRising > belowGrads.length * 0.5 && aboveDropping > aboveGrads.length * 0.5) {
    return "CONCENTRATING";
  }

  const belowDropping = belowGrads.filter(g => g.gradientUsd < 0).length;
  const aboveRising = aboveGrads.filter(g => g.gradientUsd > 0).length;

  if (belowDropping > belowGrads.length * 0.5 && aboveRising > aboveGrads.length * 0.5) {
    return "DISPERSING";
  }

  return "STABLE";
}

function buildAsciiProfile(gradients: BinGradient[], activeBin: number): string {
  const populated = gradients.filter(g => g.liquidityUsd > 0 || g.binId === activeBin);
  if (populated.length === 0) return "  (no populated bins)";

  const maxLiq = Math.max(...populated.map(g => g.liquidityUsd), 1);
  const width = 40;
  const lines: string[] = [];

  lines.push("  Bin    | Liquidity    | Gradient          | Terrain");
  lines.push("  -------+--------------+-------------------+--------");

  for (const g of populated) {
    const marker = g.binId === activeBin ? ">" : " ";
    const barLen = Math.round((g.liquidityUsd / maxLiq) * width);
    const bar = "█".repeat(barLen);

    let gradSymbol = "  ·";
    if (g.isCliff && g.gradientUsd > 0) gradSymbol = " ⬆⬆";
    else if (g.isCliff && g.gradientUsd < 0) gradSymbol = " ⬇⬇";
    else if (g.slopeClass === "STEEP_UP") gradSymbol = "  ↑";
    else if (g.slopeClass === "GENTLE_UP") gradSymbol = "  ⌐";
    else if (g.slopeClass === "STEEP_DOWN") gradSymbol = "  ↓";
    else if (g.slopeClass === "GENTLE_DOWN") gradSymbol = "  ⌙";
    else if (g.isPlateau) gradSymbol = "  ═";

    const liqStr = g.liquidityUsd >= 1000
      ? `$${(g.liquidityUsd / 1000).toFixed(1)}k`
      : `$${g.liquidityUsd.toFixed(0)}`;

    const gradStr = g.gradientPct >= 0
      ? `+${g.gradientPct.toFixed(0)}%`
      : `${g.gradientPct.toFixed(0)}%`;

    lines.push(
      `${marker} ${String(g.binId).padStart(5)} | ${liqStr.padStart(10)}  | ${gradStr.padStart(7)} ${gradSymbol} | ${bar}`
    );
  }

  return lines.join("\n");
}

function generateRecommendation(analysis: Omit<GradientAnalysis, "recommendation" | "asciiProfile">): string {
  const parts: string[] = [];

  // Terrain summary
  parts.push(`Terrain: ${analysis.terrainType} (roughness ${analysis.roughnessScore}/100, smoothness ${analysis.smoothnessIndex}/100).`);

  // Cliff warnings
  if (analysis.totalCliffs > 0) {
    const severeCliffs = analysis.cliffs.filter(c => c.severity !== "MODERATE");
    if (severeCliffs.length > 0) {
      parts.push(`⚠ ${severeCliffs.length} severe cliff(s) detected — liquidity drops sharply at bin${severeCliffs.length > 1 ? "s" : ""} ${severeCliffs.map(c => c.binId).join(", ")}.`);
    }
    if (analysis.cliffsBelow > analysis.cliffsAbove) {
      parts.push("More cliffs below active bin — downside liquidity is fragile.");
    } else if (analysis.cliffsAbove > analysis.cliffsBelow) {
      parts.push("More cliffs above active bin — upside liquidity thins quickly.");
    }
  }

  // Plateau info
  if (analysis.widestPlateau) {
    parts.push(`Widest plateau: bins ${analysis.widestPlateau.startBin}-${analysis.widestPlateau.endBin} (${analysis.widestPlateau.width} bins, ~$${(analysis.widestPlateau.avgLiquidityUsd / 1000).toFixed(1)}k avg).`);
  }

  // Support/resistance
  if (analysis.supportLevels.length > 0) {
    const strongest = analysis.supportLevels.sort((a, b) => b.strength - a.strength)[0];
    parts.push(`Strongest support: bin ${strongest.binId} (strength ${strongest.strength}/100, $${(strongest.liquidityWallUsd / 1000).toFixed(1)}k wall).`);
  }
  if (analysis.resistanceLevels.length > 0) {
    const strongest = analysis.resistanceLevels.sort((a, b) => b.strength - a.strength)[0];
    parts.push(`Strongest resistance: bin ${strongest.binId} (strength ${strongest.strength}/100, $${(strongest.liquidityWallUsd / 1000).toFixed(1)}k wall).`);
  }

  // Symmetry
  if (analysis.gradientBias !== "SYMMETRIC") {
    parts.push(`Gradient asymmetry: ${analysis.gradientBias.toLowerCase().replace("_", " ")} — one side has steeper transitions.`);
  }

  // Momentum
  if (analysis.gradientMomentum !== "STABLE") {
    parts.push(`Gradient momentum: ${analysis.gradientMomentum.toLowerCase()} — liquidity is ${analysis.gradientMomentum === "CONCENTRATING" ? "tightening around active bin" : "spreading away from center"}.`);
  }

  // LP advice
  if (analysis.terrainType === "PEAKED") {
    parts.push("LP advice: Liquidity is concentrated in a narrow peak. Wide-range LPs will have low utilization.");
  } else if (analysis.terrainType === "SMOOTH") {
    parts.push("LP advice: Smooth terrain means predictable slippage. Good for concentrated positions near active bin.");
  } else if (analysis.terrainType === "CLIFF_SIDED") {
    parts.push("LP advice: Cliff edges create slippage discontinuities. Avoid ranges that span cliffs.");
  }

  return parts.join(" ");
}

// -- Main analysis ------------------------------------------------------------

async function analyzeGradient(pool: AppPool): Promise<GradientAnalysis> {
  const poolId = pool.poolId!;

  const activeBin = pool.activeBinId ?? (await getActiveBin(poolId));
  const bins = await scanBins(poolId, activeBin, pool, BIN_SCAN_RADIUS);

  const populated = bins.filter(b => b.totalUsd > 0);
  const gradients = computeGradients(bins, activeBin);
  const cliffs = detectCliffs(gradients, activeBin);
  const plateaus = detectPlateaus(gradients, activeBin);
  const { support, resistance } = detectSupportResistance(gradients, activeBin);
  const roughness = computeRoughness(gradients);
  const smoothness = 100 - roughness;
  const terrain = classifyTerrain(roughness, cliffs, plateaus, gradients);
  const momentum = determineGradientMomentum(gradients, activeBin);

  // Gradient stats
  const gradUsd = gradients.map(g => g.gradientUsd);
  const avgGrad = gradUsd.length > 0
    ? gradUsd.reduce((s, v) => s + Math.abs(v), 0) / gradUsd.length
    : 0;
  const maxGrad = Math.max(...gradUsd.map(Math.abs), 0);
  const minGrad = Math.min(...gradUsd.map(Math.abs), 0);

  // Symmetry
  const aboveGrads = gradients.filter(g => g.binId > activeBin && g.liquidityUsd > 0);
  const belowGrads = gradients.filter(g => g.binId < activeBin && g.liquidityUsd > 0);

  const avgAbove = aboveGrads.length > 0
    ? aboveGrads.reduce((s, g) => s + Math.abs(g.gradientPct), 0) / aboveGrads.length
    : 0;
  const avgBelow = belowGrads.length > 0
    ? belowGrads.reduce((s, g) => s + Math.abs(g.gradientPct), 0) / belowGrads.length
    : 0;

  const maxAvg = Math.max(avgAbove, avgBelow, 1);
  const symmetry = 1 - Math.abs(avgAbove - avgBelow) / maxAvg;

  let gradBias: GradientAnalysis["gradientBias"] = "SYMMETRIC";
  if (symmetry < 0.6) {
    gradBias = avgAbove > avgBelow ? "STEEPER_ABOVE" : "STEEPER_BELOW";
  }

  // Peak
  const peakBin = populated.length > 0
    ? populated.reduce((best, b) => (b.totalUsd > best.totalUsd ? b : best)).binId
    : activeBin;
  const peakLiq = populated.length > 0
    ? Math.max(...populated.map(b => b.totalUsd))
    : 0;

  const liqAbove = populated
    .filter(b => b.binId > activeBin)
    .reduce((s, b) => s + b.totalUsd, 0);
  const liqBelow = populated
    .filter(b => b.binId < activeBin)
    .reduce((s, b) => s + b.totalUsd, 0);

  // Cliffs above/below
  const cliffsAbove = cliffs.filter(c => c.position === "ABOVE").length;
  const cliffsBelow = cliffs.filter(c => c.position === "BELOW").length;

  // Widest plateau
  const widestPlateau = plateaus.length > 0
    ? plateaus.reduce((best, p) => (p.width > best.width ? p : best))
    : null;

  const partial: Omit<GradientAnalysis, "recommendation" | "asciiProfile"> = {
    poolId,
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    feeBps: pool.feeBps ?? 0,
    activeBinId: activeBin,
    binsScanned: bins.length,
    binsPopulated: populated.length,
    avgGradientUsd: avgGrad,
    maxGradientUsd: maxGrad,
    minGradientUsd: minGrad,
    terrainType: terrain,
    roughnessScore: roughness,
    smoothnessIndex: smoothness,
    cliffs,
    totalCliffs: cliffs.length,
    cliffsAbove,
    cliffsBelow,
    plateaus,
    totalPlateaus: plateaus.length,
    widestPlateau,
    avgGradientAbove: avgAbove,
    avgGradientBelow: avgBelow,
    symmetryScore: symmetry,
    gradientBias: gradBias,
    supportLevels: support,
    resistanceLevels: resistance,
    gradientMomentum: momentum,
    peakBin,
    peakLiquidityUsd: peakLiq,
    liquidityAbove: liqAbove,
    liquidityBelow: liqBelow,
    gradients,
  };

  const recommendation = generateRecommendation(partial);
  const asciiProfile = buildAsciiProfile(gradients, activeBin);

  return { ...partial, recommendation, asciiProfile };
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();

program
  .name("hodlmm-liquidity-gradient")
  .description(
    "HODLMM Liquidity Gradient Analyzer — Measures rate of change of liquidity " +
    "across adjacent bins. Detects cliffs, slopes, plateaus, support/resistance " +
    "zones, and terrain roughness. Part of cocoa007's Bitflow Skills Comp (Day 79)."
  )
  .option("-p, --pool <id>", "Specific pool ID to analyze")
  .option("-t, --top <n>", "Analyze top N pools by TVL", "3")
  .option("--json", "Output raw JSON instead of formatted text")
  .action(async (opts) => {
    try {
      const pools = await discoverPools();

      if (pools.length === 0) {
        console.log("No HODLMM pools found above TVL threshold.");
        return;
      }

      let targets: AppPool[];
      if (opts.pool) {
        const pid = Number(opts.pool);
        const match = pools.find((p) => p.poolId === pid);
        if (!match) {
          console.log(`Pool ${pid} not found. Available: ${pools.map(p => `${p.poolId} (${p.token0Symbol}/${p.token1Symbol})`).join(", ")}`);
          return;
        }
        targets = [match];
      } else {
        targets = pools
          .sort((a, b) => b.tvlUsd - a.tvlUsd)
          .slice(0, Number(opts.top));
      }

      const results: GradientAnalysis[] = [];
      for (const pool of targets) {
        console.log(`\nAnalyzing ${pool.token0Symbol}/${pool.token1Symbol} (pool ${pool.poolId})...\n`);
        const analysis = await analyzeGradient(pool);
        results.push(analysis);

        if (opts.json) {
          console.log(JSON.stringify(analysis, null, 2));
        } else {
          console.log(`  Pool ${analysis.poolId}: ${analysis.pair}`);
          console.log(`  TVL: $${(analysis.tvlUsd / 1000).toFixed(1)}k | Volume 24h: $${(analysis.volume24hUsd / 1000).toFixed(1)}k | Fee: ${analysis.feeBps} bps`);
          console.log(`  Active Bin: ${analysis.activeBinId} | Scanned: ${analysis.binsScanned} | Populated: ${analysis.binsPopulated}`);
          console.log();
          console.log(`  ┌─ TERRAIN ─────────────────────────────────────────┐`);
          console.log(`  │ Type: ${analysis.terrainType.padEnd(15)} Roughness: ${String(analysis.roughnessScore).padStart(3)}/100 │`);
          console.log(`  │ Smoothness: ${String(analysis.smoothnessIndex).padStart(3)}/100     Momentum: ${analysis.gradientMomentum.padEnd(14)}│`);
          console.log(`  └──────────────────────────────────────────────────┘`);
          console.log();

          if (analysis.totalCliffs > 0) {
            console.log(`  CLIFFS (${analysis.totalCliffs}): ${analysis.cliffsBelow} below, ${analysis.cliffsAbove} above active bin`);
            for (const c of analysis.cliffs.slice(0, 5)) {
              console.log(`    Bin ${c.binId}: ${c.direction} ${c.severity} (${c.gradientPct > 0 ? "+" : ""}${c.gradientPct.toFixed(0)}%)`);
            }
            console.log();
          }

          if (analysis.totalPlateaus > 0) {
            console.log(`  PLATEAUS (${analysis.totalPlateaus}):`);
            for (const p of analysis.plateaus.slice(0, 5)) {
              console.log(`    Bins ${p.startBin}-${p.endBin} (${p.width} wide, ${p.position}, ~$${(p.avgLiquidityUsd / 1000).toFixed(1)}k avg)`);
            }
            console.log();
          }

          if (analysis.supportLevels.length > 0 || analysis.resistanceLevels.length > 0) {
            console.log("  SUPPORT / RESISTANCE:");
            for (const s of analysis.supportLevels.slice(0, 3)) {
              console.log(`    SUPPORT  bin ${s.binId} — strength ${s.strength}/100, $${(s.liquidityWallUsd / 1000).toFixed(1)}k wall`);
            }
            for (const r of analysis.resistanceLevels.slice(0, 3)) {
              console.log(`    RESIST   bin ${r.binId} — strength ${r.strength}/100, $${(r.liquidityWallUsd / 1000).toFixed(1)}k wall`);
            }
            console.log();
          }

          console.log(`  SYMMETRY: ${(analysis.symmetryScore * 100).toFixed(0)}% — ${analysis.gradientBias.toLowerCase().replace(/_/g, " ")}`);
          console.log(`  Peak: bin ${analysis.peakBin} ($${(analysis.peakLiquidityUsd / 1000).toFixed(1)}k)`);
          console.log(`  Liquidity: $${(analysis.liquidityBelow / 1000).toFixed(1)}k below | $${(analysis.liquidityAbove / 1000).toFixed(1)}k above`);
          console.log();
          console.log(analysis.asciiProfile);
          console.log();
          console.log(`  💡 ${analysis.recommendation}`);
          console.log();
          console.log("─".repeat(70));
        }
      }

      if (!opts.json && results.length > 1) {
        console.log("\n  CROSS-POOL GRADIENT COMPARISON:");
        console.log("  " + "-".repeat(66));
        console.log(
          "  " +
          "Pool".padEnd(20) +
          "Terrain".padEnd(14) +
          "Rough".padEnd(8) +
          "Cliffs".padEnd(8) +
          "Plateaus".padEnd(10) +
          "Symmetry"
        );
        console.log("  " + "-".repeat(66));
        for (const r of results) {
          console.log(
            "  " +
            r.pair.padEnd(20) +
            r.terrainType.padEnd(14) +
            String(r.roughnessScore).padStart(3).padEnd(8) +
            String(r.totalCliffs).padStart(3).padEnd(8) +
            String(r.totalPlateaus).padStart(3).padEnd(10) +
            `${(r.symmetryScore * 100).toFixed(0)}%`
          );
        }
        console.log();
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
