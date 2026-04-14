#!/usr/bin/env bun
/**
 * hodlmm-bin-pressure.ts
 *
 * HODLMM Bin Pressure Analyzer — Measures directional buy/sell pressure on
 * individual bins by examining reserve asymmetry. When a bin holds more of
 * token X (base) relative to Y (quote) in USD terms, it indicates sell
 * pressure absorbed. Vice versa for buy pressure. Aggregates per-bin
 * readings into pool-wide pressure maps.
 *
 * Key metrics:
 *  - Per-bin pressure score: -100 (max sell) to +100 (max buy)
 *  - Pressure walls: bins absorbing extreme one-sided flow
 *  - Pressure gradient: how directional force shifts across bins
 *  - Near vs far divergence: reversal signals when inner/outer pressure disagree
 *  - Absorption capacity: remaining room for each side before depletion
 *  - Pressure momentum: whether force is building or fading near active bin
 *  - Pool-wide net pressure and conviction score
 *  - ASCII pressure heatmap
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 80).
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

const NEAR_RADIUS = 5;
const WALL_THRESHOLD = 80; // pressure score >= 80 = wall
const STRONG_PRESSURE = 40; // |score| >= 40 = notable

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

type PressureDirection = "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL";

interface BinPressure {
  binId: number;
  reserveXUsd: number;
  reserveYUsd: number;
  totalUsd: number;
  pressureScore: number; // -100 to +100 (+buy, -sell)
  direction: PressureDirection;
  xDominancePct: number; // % of bin value in token X
  yDominancePct: number;
  absorptionCapacity: { buyRoom: number; sellRoom: number }; // USD room before depletion
  isWall: boolean;
  wallType: "BUY_WALL" | "SELL_WALL" | null;
  distanceFromActive: number;
}

type PressureTrend = "BUILDING_BUY" | "BUILDING_SELL" | "FADING" | "STABLE" | "MIXED";
type DivergenceSignal = "BULLISH_DIVERGENCE" | "BEARISH_DIVERGENCE" | "ALIGNED" | "INSUFFICIENT_DATA";
type ConvictionLevel = "HIGH" | "MODERATE" | "LOW" | "CONFLICTED";

interface PressureAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  // Aggregate pressure
  netPressureScore: number; // weighted average across bins (-100 to +100)
  netDirection: PressureDirection;
  conviction: ConvictionLevel;
  // Near active bin
  nearPressure: number; // avg pressure within NEAR_RADIUS
  nearDirection: PressureDirection;
  // Far pressure
  farPressureAbove: number;
  farPressureBelow: number;
  // Divergence
  divergence: DivergenceSignal;
  // Pressure trend
  trend: PressureTrend;
  // Walls
  buyWalls: BinPressure[];
  sellWalls: BinPressure[];
  totalBuyWalls: number;
  totalSellWalls: number;
  strongestBuyWall: BinPressure | null;
  strongestSellWall: BinPressure | null;
  // Absorption
  totalBuyAbsorption: number; // total USD room for more buying
  totalSellAbsorption: number;
  absorptionRatio: number; // buy/sell absorption balance (>1 = more buy room)
  // Distribution
  binsWithBuyPressure: number;
  binsWithSellPressure: number;
  binsNeutral: number;
  pressureSkew: number; // -1 to +1, how skewed pressure distribution is
  // Per-bin data
  bins: BinPressure[];
  recommendation: string;
  asciiMap: string;
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

// -- Pressure analysis --------------------------------------------------------

function classifyDirection(score: number): PressureDirection {
  if (score >= STRONG_PRESSURE) return "STRONG_BUY";
  if (score > 10) return "BUY";
  if (score <= -STRONG_PRESSURE) return "STRONG_SELL";
  if (score < -10) return "SELL";
  return "NEUTRAL";
}

function computeBinPressure(bin: BinReserves, activeBin: number): BinPressure {
  const total = bin.reserveXUsd + bin.reserveYUsd;

  let pressureScore = 0;
  let xDom = 50;
  let yDom = 50;

  if (total > 0) {
    xDom = (bin.reserveXUsd / total) * 100;
    yDom = (bin.reserveYUsd / total) * 100;
    // X-heavy = sell pressure absorbed (sellers dumped X into bin)
    // Y-heavy = buy pressure absorbed (buyers took X, left Y)
    // Score: +100 = all Y (max buy pressure), -100 = all X (max sell pressure)
    pressureScore = yDom - xDom; // range: -100 to +100
  }

  const direction = classifyDirection(pressureScore);
  const isWall = Math.abs(pressureScore) >= WALL_THRESHOLD && total > 0;
  let wallType: BinPressure["wallType"] = null;
  if (isWall) {
    wallType = pressureScore > 0 ? "BUY_WALL" : "SELL_WALL";
  }

  // Absorption capacity: how much more USD can flow in each direction
  // before the bin is fully depleted on one side
  const buyRoom = bin.reserveXUsd; // buyers take X, so X remaining = buy room
  const sellRoom = bin.reserveYUsd; // sellers take Y, so Y remaining = sell room

  return {
    binId: bin.binId,
    reserveXUsd: bin.reserveXUsd,
    reserveYUsd: bin.reserveYUsd,
    totalUsd: total,
    pressureScore: Math.round(pressureScore * 10) / 10,
    direction,
    xDominancePct: Math.round(xDom * 10) / 10,
    yDominancePct: Math.round(yDom * 10) / 10,
    absorptionCapacity: {
      buyRoom: Math.round(buyRoom * 100) / 100,
      sellRoom: Math.round(sellRoom * 100) / 100,
    },
    isWall,
    wallType,
    distanceFromActive: bin.binId - activeBin,
  };
}

function computeWeightedPressure(bins: BinPressure[]): number {
  const populated = bins.filter(b => b.totalUsd > 0);
  if (populated.length === 0) return 0;

  const totalWeight = populated.reduce((s, b) => s + b.totalUsd, 0);
  if (totalWeight === 0) return 0;

  return populated.reduce(
    (s, b) => s + b.pressureScore * (b.totalUsd / totalWeight),
    0
  );
}

function detectTrend(bins: BinPressure[], activeBin: number): PressureTrend {
  const nearBins = bins.filter(
    b => Math.abs(b.distanceFromActive) <= NEAR_RADIUS && b.totalUsd > 0
  );
  if (nearBins.length < 3) return "STABLE";

  // Sort by distance from active (ascending)
  const sorted = [...nearBins].sort(
    (a, b) => Math.abs(a.distanceFromActive) - Math.abs(b.distanceFromActive)
  );

  // Check if pressure intensifies toward active bin
  const innerHalf = sorted.slice(0, Math.ceil(sorted.length / 2));
  const outerHalf = sorted.slice(Math.ceil(sorted.length / 2));

  const innerAvg = innerHalf.reduce((s, b) => s + b.pressureScore, 0) / innerHalf.length;
  const outerAvg = outerHalf.reduce((s, b) => s + b.pressureScore, 0) / outerHalf.length;

  const diff = innerAvg - outerAvg;

  if (diff > 15 && innerAvg > 10) return "BUILDING_BUY";
  if (diff < -15 && innerAvg < -10) return "BUILDING_SELL";
  if (Math.abs(innerAvg) < Math.abs(outerAvg) * 0.5) return "FADING";
  if (innerAvg > 10 && outerAvg < -10 || innerAvg < -10 && outerAvg > 10) return "MIXED";
  return "STABLE";
}

function detectDivergence(
  nearPressure: number,
  farAbove: number,
  farBelow: number
): DivergenceSignal {
  if (farAbove === 0 && farBelow === 0) return "INSUFFICIENT_DATA";

  const farAvg = (farAbove + farBelow) / 2;

  // Bullish divergence: near-term sell pressure but far bins show buy buildup
  if (nearPressure < -10 && farAvg > 15) return "BULLISH_DIVERGENCE";
  // Bearish divergence: near-term buy pressure but far bins show sell buildup
  if (nearPressure > 10 && farAvg < -15) return "BEARISH_DIVERGENCE";

  return "ALIGNED";
}

function assessConviction(bins: BinPressure[], netScore: number): ConvictionLevel {
  const populated = bins.filter(b => b.totalUsd > 0);
  if (populated.length < 3) return "LOW";

  // Check consistency — do most bins agree on direction?
  const agreeing = populated.filter(
    b => Math.sign(b.pressureScore) === Math.sign(netScore)
  ).length;
  const agreementRatio = agreeing / populated.length;

  const absNet = Math.abs(netScore);

  if (absNet >= STRONG_PRESSURE && agreementRatio >= 0.7) return "HIGH";
  if (absNet >= 20 && agreementRatio >= 0.5) return "MODERATE";
  if (agreementRatio < 0.4) return "CONFLICTED";
  return "LOW";
}

function buildAsciiMap(bins: BinPressure[], activeBin: number): string {
  const populated = bins.filter(b => b.totalUsd > 0 || b.binId === activeBin);
  if (populated.length === 0) return "  (no populated bins)";

  const lines: string[] = [];
  lines.push("  Bin    | Pressure | Direction    | X%/Y%      | Absorption     | Map");
  lines.push("  -------+----------+--------------+------------+----------------+----");

  const maxTotal = Math.max(...populated.map(b => b.totalUsd), 1);
  const barWidth = 30;

  for (const b of populated) {
    const marker = b.binId === activeBin ? ">" : " ";
    const scoreStr = (b.pressureScore >= 0 ? "+" : "") + b.pressureScore.toFixed(0);

    let dirLabel = b.direction.padEnd(11);
    if (b.isWall) dirLabel = (b.wallType === "BUY_WALL" ? "BUY WALL" : "SELL WALL").padEnd(11);

    const ratioStr = `${b.xDominancePct.toFixed(0)}/${b.yDominancePct.toFixed(0)}`;
    const absorbStr = `B:$${fmtUsd(b.absorptionCapacity.buyRoom)} S:$${fmtUsd(b.absorptionCapacity.sellRoom)}`;

    // Pressure bar: left = sell (X), right = buy (Y)
    const totalBar = Math.round((b.totalUsd / maxTotal) * barWidth);
    const midpoint = Math.round(totalBar / 2);
    const offset = Math.round((b.pressureScore / 100) * midpoint);

    let bar = "";
    if (totalBar > 0) {
      const sellLen = Math.max(0, midpoint - offset);
      const buyLen = Math.max(0, midpoint + offset);
      const sellPart = "◀".repeat(Math.min(sellLen, barWidth));
      const buyPart = "▶".repeat(Math.min(buyLen, barWidth));
      bar = sellPart + "|" + buyPart;
    }

    lines.push(
      `${marker} ${String(b.binId).padStart(5)} | ${scoreStr.padStart(6)}   | ${dirLabel} | ${ratioStr.padStart(8)}   | ${absorbStr.padEnd(14)} | ${bar}`
    );
  }

  return lines.join("\n");
}

function fmtUsd(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 1) return v.toFixed(0);
  return v.toFixed(2);
}

function generateRecommendation(a: Omit<PressureAnalysis, "recommendation" | "asciiMap">): string {
  const parts: string[] = [];

  // Net pressure
  parts.push(
    `Net pressure: ${a.netPressureScore > 0 ? "+" : ""}${a.netPressureScore.toFixed(1)} (${a.netDirection}, ${a.conviction} conviction).`
  );

  // Trend
  if (a.trend !== "STABLE") {
    const trendMap: Record<PressureTrend, string> = {
      BUILDING_BUY: "Buy pressure intensifying toward active bin",
      BUILDING_SELL: "Sell pressure intensifying toward active bin",
      FADING: "Pressure dissipating near active bin",
      MIXED: "Conflicting pressure signals near active bin",
      STABLE: "",
    };
    parts.push(`${trendMap[a.trend]}.`);
  }

  // Divergence
  if (a.divergence === "BULLISH_DIVERGENCE") {
    parts.push("Bullish divergence: near-term selling but far bins show buy accumulation — potential reversal setup.");
  } else if (a.divergence === "BEARISH_DIVERGENCE") {
    parts.push("Bearish divergence: near-term buying but far bins show sell buildup — watch for reversal.");
  }

  // Walls
  if (a.totalBuyWalls > 0 || a.totalSellWalls > 0) {
    const wallParts: string[] = [];
    if (a.totalBuyWalls > 0 && a.strongestBuyWall) {
      wallParts.push(`${a.totalBuyWalls} buy wall(s), strongest at bin ${a.strongestBuyWall.binId} (score +${a.strongestBuyWall.pressureScore.toFixed(0)})`);
    }
    if (a.totalSellWalls > 0 && a.strongestSellWall) {
      wallParts.push(`${a.totalSellWalls} sell wall(s), strongest at bin ${a.strongestSellWall.binId} (score ${a.strongestSellWall.pressureScore.toFixed(0)})`);
    }
    parts.push(`Pressure walls: ${wallParts.join("; ")}.`);
  }

  // Absorption
  if (a.absorptionRatio > 2) {
    parts.push(`Buy absorption ${a.absorptionRatio.toFixed(1)}x sell absorption — pool can absorb significantly more buying before depleting.`);
  } else if (a.absorptionRatio < 0.5) {
    parts.push(`Sell absorption ${(1 / a.absorptionRatio).toFixed(1)}x buy absorption — pool can absorb significantly more selling.`);
  }

  // Skew
  if (Math.abs(a.pressureSkew) > 0.3) {
    const side = a.pressureSkew > 0 ? "buy" : "sell";
    parts.push(`Pressure distribution skewed toward ${side} (${(a.pressureSkew * 100).toFixed(0)}% skew).`);
  }

  // LP advice
  if (a.conviction === "HIGH") {
    if (a.netPressureScore > 0) {
      parts.push("LP advice: Strong buy pressure — concentrated positions below active bin may capture rebalance fees as price pushes up.");
    } else {
      parts.push("LP advice: Strong sell pressure — concentrated positions above active bin may capture fees as price pushes down.");
    }
  } else if (a.conviction === "CONFLICTED") {
    parts.push("LP advice: Mixed signals — wider range positions recommended until pressure resolves.");
  }

  return parts.join(" ");
}

// -- Main analysis ------------------------------------------------------------

async function analyzePressure(pool: AppPool): Promise<PressureAnalysis> {
  const poolId = pool.poolId!;
  const activeBin = pool.activeBinId ?? (await getActiveBin(poolId));
  const rawBins = await scanBins(poolId, activeBin, pool, BIN_SCAN_RADIUS);

  const bins = rawBins.map(b => computeBinPressure(b, activeBin));
  const populated = bins.filter(b => b.totalUsd > 0);

  // Net pressure (TVL-weighted)
  const netPressureScore = Math.round(computeWeightedPressure(bins) * 10) / 10;
  const netDirection = classifyDirection(netPressureScore);

  // Near-bin pressure
  const nearBins = populated.filter(b => Math.abs(b.distanceFromActive) <= NEAR_RADIUS);
  const nearPressure = nearBins.length > 0
    ? Math.round(computeWeightedPressure(nearBins) * 10) / 10
    : 0;
  const nearDirection = classifyDirection(nearPressure);

  // Far pressure (above and below)
  const farAbove = populated.filter(b => b.distanceFromActive > NEAR_RADIUS);
  const farBelow = populated.filter(b => b.distanceFromActive < -NEAR_RADIUS);
  const farPressureAbove = farAbove.length > 0
    ? Math.round(computeWeightedPressure(farAbove) * 10) / 10
    : 0;
  const farPressureBelow = farBelow.length > 0
    ? Math.round(computeWeightedPressure(farBelow) * 10) / 10
    : 0;

  // Divergence
  const divergence = detectDivergence(nearPressure, farPressureAbove, farPressureBelow);

  // Trend
  const trend = detectTrend(bins, activeBin);

  // Conviction
  const conviction = assessConviction(bins, netPressureScore);

  // Walls
  const buyWalls = populated.filter(b => b.wallType === "BUY_WALL")
    .sort((a, b) => b.pressureScore - a.pressureScore);
  const sellWalls = populated.filter(b => b.wallType === "SELL_WALL")
    .sort((a, b) => a.pressureScore - b.pressureScore);

  // Absorption
  const totalBuyAbsorption = populated.reduce((s, b) => s + b.absorptionCapacity.buyRoom, 0);
  const totalSellAbsorption = populated.reduce((s, b) => s + b.absorptionCapacity.sellRoom, 0);
  const absorptionRatio = totalSellAbsorption > 0
    ? Math.round((totalBuyAbsorption / totalSellAbsorption) * 100) / 100
    : totalBuyAbsorption > 0 ? 999 : 1;

  // Distribution
  const binsWithBuyPressure = populated.filter(b => b.pressureScore > 10).length;
  const binsWithSellPressure = populated.filter(b => b.pressureScore < -10).length;
  const binsNeutral = populated.length - binsWithBuyPressure - binsWithSellPressure;

  const pressureSkew = populated.length > 0
    ? Math.round(((binsWithBuyPressure - binsWithSellPressure) / populated.length) * 100) / 100
    : 0;

  const partial: Omit<PressureAnalysis, "recommendation" | "asciiMap"> = {
    poolId,
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    feeBps: pool.feeBps ?? 0,
    activeBinId: activeBin,
    binsScanned: rawBins.length,
    binsPopulated: populated.length,
    netPressureScore,
    netDirection,
    conviction,
    nearPressure,
    nearDirection,
    farPressureAbove,
    farPressureBelow,
    divergence,
    trend,
    buyWalls,
    sellWalls,
    totalBuyWalls: buyWalls.length,
    totalSellWalls: sellWalls.length,
    strongestBuyWall: buyWalls[0] ?? null,
    strongestSellWall: sellWalls[0] ?? null,
    totalBuyAbsorption,
    totalSellAbsorption,
    absorptionRatio,
    binsWithBuyPressure,
    binsWithSellPressure,
    binsNeutral,
    pressureSkew,
    bins,
  };

  const recommendation = generateRecommendation(partial);
  const asciiMap = buildAsciiMap(bins, activeBin);

  return { ...partial, recommendation, asciiMap };
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();

program
  .name("hodlmm-bin-pressure")
  .description(
    "HODLMM Bin Pressure Analyzer — Measures directional buy/sell pressure on " +
    "individual bins via reserve asymmetry. Detects pressure walls, divergences, " +
    "absorption capacity, and momentum. Part of cocoa007's Bitflow Skills Comp (Day 80)."
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

      const results: PressureAnalysis[] = [];
      for (const pool of targets) {
        console.log(`\nAnalyzing ${pool.token0Symbol}/${pool.token1Symbol} (pool ${pool.poolId})...\n`);
        const analysis = await analyzePressure(pool);
        results.push(analysis);

        if (opts.json) {
          console.log(JSON.stringify(analysis, null, 2));
        } else {
          console.log(`  Pool ${analysis.poolId}: ${analysis.pair}`);
          console.log(`  TVL: $${(analysis.tvlUsd / 1000).toFixed(1)}k | Volume 24h: $${(analysis.volume24hUsd / 1000).toFixed(1)}k | Fee: ${analysis.feeBps} bps`);
          console.log(`  Active Bin: ${analysis.activeBinId} | Scanned: ${analysis.binsScanned} | Populated: ${analysis.binsPopulated}`);
          console.log();
          console.log(`  ┌─ PRESSURE ───────────────────────────────────────────┐`);
          console.log(`  │ Net: ${(analysis.netPressureScore >= 0 ? "+" : "") + analysis.netPressureScore.toFixed(1).padEnd(8)} Direction: ${analysis.netDirection.padEnd(12)} │`);
          console.log(`  │ Conviction: ${analysis.conviction.padEnd(12)} Trend: ${analysis.trend.padEnd(16)} │`);
          console.log(`  │ Near active: ${(analysis.nearPressure >= 0 ? "+" : "") + analysis.nearPressure.toFixed(1).padEnd(8)} (${analysis.nearDirection})${" ".repeat(Math.max(0, 15 - analysis.nearDirection.length))}│`);
          console.log(`  └────────────────────────────────────────────────────────┘`);
          console.log();

          // Divergence
          if (analysis.divergence !== "ALIGNED" && analysis.divergence !== "INSUFFICIENT_DATA") {
            console.log(`  ⚡ DIVERGENCE: ${analysis.divergence.replace(/_/g, " ")}`);
            console.log(`     Far above: ${analysis.farPressureAbove >= 0 ? "+" : ""}${analysis.farPressureAbove.toFixed(1)} | Far below: ${analysis.farPressureBelow >= 0 ? "+" : ""}${analysis.farPressureBelow.toFixed(1)}`);
            console.log();
          }

          // Walls
          if (analysis.totalBuyWalls > 0 || analysis.totalSellWalls > 0) {
            console.log(`  PRESSURE WALLS:`);
            for (const w of analysis.buyWalls.slice(0, 3)) {
              console.log(`    BUY WALL  bin ${w.binId} — score +${w.pressureScore.toFixed(0)}, $${fmtUsd(w.totalUsd)} total`);
            }
            for (const w of analysis.sellWalls.slice(0, 3)) {
              console.log(`    SELL WALL bin ${w.binId} — score ${w.pressureScore.toFixed(0)}, $${fmtUsd(w.totalUsd)} total`);
            }
            console.log();
          }

          // Absorption
          console.log(`  ABSORPTION CAPACITY:`);
          console.log(`    Buy room:  $${fmtUsd(analysis.totalBuyAbsorption)} | Sell room: $${fmtUsd(analysis.totalSellAbsorption)} | Ratio: ${analysis.absorptionRatio.toFixed(2)}`);
          console.log();

          // Distribution
          console.log(`  DISTRIBUTION: ${analysis.binsWithBuyPressure} buy | ${analysis.binsNeutral} neutral | ${analysis.binsWithSellPressure} sell (skew: ${(analysis.pressureSkew * 100).toFixed(0)}%)`);
          console.log();

          console.log(analysis.asciiMap);
          console.log();
          console.log(`  💡 ${analysis.recommendation}`);
          console.log();
          console.log("─".repeat(70));
        }
      }

      if (!opts.json && results.length > 1) {
        console.log("\n  CROSS-POOL PRESSURE COMPARISON:");
        console.log("  " + "-".repeat(74));
        console.log(
          "  " +
          "Pool".padEnd(18) +
          "Net".padEnd(8) +
          "Direction".padEnd(13) +
          "Conviction".padEnd(12) +
          "Trend".padEnd(16) +
          "BuyW".padEnd(6) +
          "SellW"
        );
        console.log("  " + "-".repeat(74));
        for (const r of results) {
          console.log(
            "  " +
            r.pair.padEnd(18) +
            ((r.netPressureScore >= 0 ? "+" : "") + r.netPressureScore.toFixed(1)).padEnd(8) +
            r.netDirection.padEnd(13) +
            r.conviction.padEnd(12) +
            r.trend.padEnd(16) +
            String(r.totalBuyWalls).padStart(2).padEnd(6) +
            String(r.totalSellWalls).padStart(2)
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
