#!/usr/bin/env bun
/**
 * hodlmm-bin-turnover.ts
 *
 * HODLMM Bin Turnover Analyzer — Estimates reserve turnover intensity per bin
 * by analyzing reserve composition patterns. Bins near the active price with
 * mixed reserves (both token X and Y) indicate recent trade flow, while bins
 * with single-token reserves far from the active bin are stale capital that
 * hasn't participated in swaps.
 *
 * Metrics:
 *  1. Turnover score (0-100): composite of reserve mix, proximity activity,
 *     composition gradient coherence, and capital freshness
 *  2. Reserve mix ratio: balance between token X and Y in each bin
 *  3. Active trading zone: contiguous bins showing mixed-reserve signatures
 *  4. Stale capital detection: bins with single-token reserves outside active zone
 *  5. Composition gradient: how smoothly reserves transition from X to Y dominant
 *  6. Capital freshness: fraction of TVL in actively-traded bins
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 86).
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 25;

type TurnoverClass = "HIGH_TURNOVER" | "MODERATE_TURNOVER" | "LOW_TURNOVER" | "STALE" | "DORMANT";
type FreshnessGrade = "FRESH" | "AGING" | "STALE" | "FOSSILIZED";

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

interface BinTurnover {
  binId: number;
  offset: number;
  reserveXUsd: number;
  reserveYUsd: number;
  totalUsd: number;
  mixRatio: number;
  turnoverScore: number;
  turnoverClass: TurnoverClass;
  isActiveZone: boolean;
  isStale: boolean;
}

interface TurnoverZone {
  startBin: number;
  endBin: number;
  width: number;
  side: "BID" | "ASK" | "CENTER";
  avgMixRatio: number;
  totalUsd: number;
  avgTurnoverScore: number;
}

interface TurnoverAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  bins: BinTurnover[];
  activeZone: TurnoverZone;
  staleZones: TurnoverZone[];
  poolTurnoverScore: number;
  poolTurnoverClass: TurnoverClass;
  capitalFreshness: number;
  freshnessGrade: FreshnessGrade;
  activeTvlUsd: number;
  staleTvlUsd: number;
  activePct: number;
  stalePct: number;
  gradientCoherence: number;
  volumeToTvl: number;
  impliedTurnoverPerDay: number;
  recommendation: string;
  asciiHeatmap: string;
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

function fmtPct(v: number): string {
  return v.toFixed(1) + "%";
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

// -- Turnover analysis --------------------------------------------------------

function computeMixRatio(rxUsd: number, ryUsd: number): number {
  const total = rxUsd + ryUsd;
  if (total < 0.01) return 0;
  const min = Math.min(rxUsd, ryUsd);
  return (min / total) * 2;
}

function computeBinTurnoverScore(
  mixRatio: number,
  offset: number,
  maxOffset: number
): number {
  const mixScore = mixRatio * 50;
  const proximityDecay = Math.max(0, 1 - Math.abs(offset) / (maxOffset + 1));
  const proximityScore = proximityDecay * 30;
  const expectedMix = Math.max(0, 1 - Math.abs(offset) / (maxOffset * 0.6));
  const surpriseFactor = mixRatio > expectedMix ? 1.2 : mixRatio < expectedMix * 0.3 ? 0.7 : 1.0;
  const adjustedScore = (mixScore + proximityScore) * surpriseFactor;
  const volumeBonus = mixRatio > 0.3 && Math.abs(offset) <= 3 ? 20 : 0;
  return Math.min(Math.round(adjustedScore + volumeBonus), 100);
}

function classifyTurnover(score: number): TurnoverClass {
  if (score >= 70) return "HIGH_TURNOVER";
  if (score >= 45) return "MODERATE_TURNOVER";
  if (score >= 25) return "LOW_TURNOVER";
  if (score >= 10) return "STALE";
  return "DORMANT";
}

function classifyFreshness(pct: number): FreshnessGrade {
  if (pct >= 60) return "FRESH";
  if (pct >= 35) return "AGING";
  if (pct >= 15) return "STALE";
  return "FOSSILIZED";
}

function computeGradientCoherence(bins: BinTurnover[]): number {
  if (bins.length < 3) return 1;
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const populated = sorted.filter((b) => b.totalUsd > 0.01);
  if (populated.length < 3) return 1;

  let coherentTransitions = 0;
  let totalTransitions = 0;

  for (let i = 1; i < populated.length; i++) {
    const prev = populated[i - 1];
    const curr = populated[i];
    totalTransitions++;
    const prevXDominance = prev.reserveXUsd / Math.max(prev.totalUsd, 0.01);
    const currXDominance = curr.reserveXUsd / Math.max(curr.totalUsd, 0.01);
    if (currXDominance <= prevXDominance + 0.3) {
      coherentTransitions++;
    }
  }

  return totalTransitions > 0 ? coherentTransitions / totalTransitions : 1;
}

function detectActiveZone(bins: BinTurnover[]): TurnoverZone {
  const activeBins = bins.filter((b) => b.isActiveZone);
  if (activeBins.length === 0) {
    return {
      startBin: 0,
      endBin: 0,
      width: 0,
      side: "CENTER",
      avgMixRatio: 0,
      totalUsd: 0,
      avgTurnoverScore: 0,
    };
  }

  const start = Math.min(...activeBins.map((b) => b.binId));
  const end = Math.max(...activeBins.map((b) => b.binId));
  const totalUsd = activeBins.reduce((s, b) => s + b.totalUsd, 0);
  const avgMix = activeBins.reduce((s, b) => s + b.mixRatio, 0) / activeBins.length;
  const avgScore = activeBins.reduce((s, b) => s + b.turnoverScore, 0) / activeBins.length;
  const avgOffset = activeBins.reduce((s, b) => s + b.offset, 0) / activeBins.length;

  let side: "BID" | "ASK" | "CENTER" = "CENTER";
  if (avgOffset < -2) side = "BID";
  else if (avgOffset > 2) side = "ASK";

  return {
    startBin: start,
    endBin: end,
    width: end - start + 1,
    side,
    avgMixRatio: Math.round(avgMix * 1000) / 1000,
    totalUsd,
    avgTurnoverScore: Math.round(avgScore),
  };
}

function detectStaleZones(bins: BinTurnover[]): TurnoverZone[] {
  const staleBins = bins.filter((b) => b.isStale && b.totalUsd > 0.01);
  if (staleBins.length === 0) return [];

  const zones: TurnoverZone[] = [];
  let currentZone: BinTurnover[] = [staleBins[0]];

  for (let i = 1; i < staleBins.length; i++) {
    if (staleBins[i].binId - staleBins[i - 1].binId <= 2) {
      currentZone.push(staleBins[i]);
    } else {
      if (currentZone.length >= 1) zones.push(buildZone(currentZone));
      currentZone = [staleBins[i]];
    }
  }
  if (currentZone.length >= 1) zones.push(buildZone(currentZone));

  return zones.sort((a, b) => b.totalUsd - a.totalUsd).slice(0, 5);
}

function buildZone(bins: BinTurnover[]): TurnoverZone {
  const start = Math.min(...bins.map((b) => b.binId));
  const end = Math.max(...bins.map((b) => b.binId));
  const totalUsd = bins.reduce((s, b) => s + b.totalUsd, 0);
  const avgMix = bins.reduce((s, b) => s + b.mixRatio, 0) / bins.length;
  const avgScore = bins.reduce((s, b) => s + b.turnoverScore, 0) / bins.length;
  const avgOffset = bins.reduce((s, b) => s + b.offset, 0) / bins.length;

  let side: "BID" | "ASK" | "CENTER" = "CENTER";
  if (avgOffset < -1) side = "BID";
  else if (avgOffset > 1) side = "ASK";

  return {
    startBin: start,
    endBin: end,
    width: end - start + 1,
    side,
    avgMixRatio: Math.round(avgMix * 1000) / 1000,
    totalUsd,
    avgTurnoverScore: Math.round(avgScore),
  };
}

function analyzeTurnover(
  pool: AppPool,
  activeBinId: number,
  rawBins: BinReserves[]
): TurnoverAnalysis {
  const populated = rawBins.filter((b) => b.totalUsd > 0.01);
  const scannedTvl = populated.reduce((s, b) => s + b.totalUsd, 0);
  const feeBps = pool.feeBps ?? 30;
  const maxOffset = BIN_SCAN_RADIUS;

  const bins: BinTurnover[] = rawBins.map((b) => {
    const offset = b.binId - activeBinId;
    const mixRatio = computeMixRatio(b.reserveXUsd, b.reserveYUsd);
    const turnoverScore = b.totalUsd > 0.01
      ? computeBinTurnoverScore(mixRatio, offset, maxOffset)
      : 0;
    const turnoverClass = classifyTurnover(turnoverScore);
    const isActiveZone = turnoverScore >= 40 && b.totalUsd > 0.01;
    const isStale = turnoverScore < 20 && b.totalUsd > 0.01 && Math.abs(offset) > 3;

    return {
      binId: b.binId,
      offset,
      reserveXUsd: b.reserveXUsd,
      reserveYUsd: b.reserveYUsd,
      totalUsd: b.totalUsd,
      mixRatio: Math.round(mixRatio * 1000) / 1000,
      turnoverScore,
      turnoverClass,
      isActiveZone,
      isStale,
    };
  });

  const activeZone = detectActiveZone(bins);
  const staleZones = detectStaleZones(bins);

  const activeBins = bins.filter((b) => b.isActiveZone);
  const staleBins = bins.filter((b) => b.isStale);
  const activeTvlUsd = activeBins.reduce((s, b) => s + b.totalUsd, 0);
  const staleTvlUsd = staleBins.reduce((s, b) => s + b.totalUsd, 0);
  const activePct = scannedTvl > 0 ? (activeTvlUsd / scannedTvl) * 100 : 0;
  const stalePct = scannedTvl > 0 ? (staleTvlUsd / scannedTvl) * 100 : 0;

  const populatedBins = bins.filter((b) => b.totalUsd > 0.01);
  const poolTurnoverScore = populatedBins.length > 0
    ? Math.round(
        populatedBins.reduce((s, b) => s + b.turnoverScore * b.totalUsd, 0) /
        Math.max(scannedTvl, 0.01)
      )
    : 0;
  const poolTurnoverClass = classifyTurnover(poolTurnoverScore);

  const capitalFreshness = activePct;
  const freshnessGrade = classifyFreshness(capitalFreshness);
  const gradientCoherence = computeGradientCoherence(bins);

  const volumeToTvl = pool.tvlUsd > 0
    ? pool.volume24hUsd / pool.tvlUsd
    : 0;
  const impliedTurnoverPerDay = volumeToTvl;

  const asciiHeatmap = buildAsciiHeatmap(bins, activeBinId, scannedTvl);

  const recommendation = buildRecommendation(
    poolTurnoverScore,
    poolTurnoverClass,
    capitalFreshness,
    freshnessGrade,
    activeZone,
    staleZones,
    activePct,
    stalePct,
    gradientCoherence,
    volumeToTvl,
    pool
  );

  return {
    poolId: pool.poolId!,
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    feeBps,
    activeBinId,
    binsScanned: rawBins.length,
    binsPopulated: populated.length,
    scannedTvlUsd: scannedTvl,
    bins: bins.filter((b) => b.totalUsd > 0.01),
    activeZone,
    staleZones,
    poolTurnoverScore,
    poolTurnoverClass,
    capitalFreshness: Math.round(capitalFreshness * 10) / 10,
    freshnessGrade,
    activeTvlUsd,
    staleTvlUsd,
    activePct: Math.round(activePct * 10) / 10,
    stalePct: Math.round(stalePct * 10) / 10,
    gradientCoherence: Math.round(gradientCoherence * 1000) / 1000,
    volumeToTvl: Math.round(volumeToTvl * 1000) / 1000,
    impliedTurnoverPerDay: Math.round(impliedTurnoverPerDay * 1000) / 1000,
    recommendation,
    asciiHeatmap,
  };
}

// -- ASCII heatmap ------------------------------------------------------------

function buildAsciiHeatmap(
  bins: BinTurnover[],
  activeBinId: number,
  scannedTvl: number
): string {
  const populated = bins.filter((b) => b.totalUsd > 0.01);
  if (populated.length === 0) return "  No populated bins.";

  const maxTvl = Math.max(...populated.map((b) => b.totalUsd), 0.01);
  const barWidth = 24;
  const heatChars = [" ", "░", "▒", "▓", "█"];
  const lines: string[] = [];

  lines.push("  Offset | $TVL         | Turnover | Mix  | Heatmap");
  lines.push("  -------+--------------+----------+------+" + "-".repeat(barWidth + 2));

  for (const b of populated) {
    const tvlBar = Math.round((b.totalUsd / maxTvl) * barWidth);
    const heatIdx = Math.min(Math.floor(b.turnoverScore / 25), 4);
    const heatChar = heatChars[heatIdx];
    const bar = heatChar.repeat(tvlBar).padEnd(barWidth);
    const marker = b.binId === activeBinId ? " ◄" : "";
    const label = b.offset === 0 ? "ACTIVE" : String(b.offset);

    lines.push(
      `  ${label.padStart(6)} | $${fmtUsd(b.totalUsd).padStart(11)} | ` +
      `${String(b.turnoverScore).padStart(5)}/100 | ${fmtPct(b.mixRatio * 100).padStart(4)} | ${bar}${marker}`
    );
  }

  lines.push("");
  lines.push("  Heat: ' '=DORMANT  ░=STALE  ▒=LOW  ▓=MODERATE  █=HIGH TURNOVER");

  return lines.join("\n");
}

// -- Recommendation -----------------------------------------------------------

function buildRecommendation(
  score: number,
  cls: TurnoverClass,
  freshness: number,
  freshnessGrade: FreshnessGrade,
  activeZone: TurnoverZone,
  staleZones: TurnoverZone[],
  activePct: number,
  stalePct: number,
  gradient: number,
  volumeToTvl: number,
  pool: AppPool
): string {
  const parts: string[] = [];

  const classLabels: Record<TurnoverClass, string> = {
    HIGH_TURNOVER: "HIGH TURNOVER",
    MODERATE_TURNOVER: "MODERATE TURNOVER",
    LOW_TURNOVER: "LOW TURNOVER",
    STALE: "MOSTLY STALE",
    DORMANT: "DORMANT",
  };

  parts.push(
    `${classLabels[cls]} (score ${score}/100) — ` +
    `Capital freshness: ${fmtPct(freshness)} (${freshnessGrade}). ` +
    `Active zone: ${activeZone.width} bins with avg turnover ${activeZone.avgTurnoverScore}/100. ` +
    `Volume/TVL ratio: ${(volumeToTvl * 100).toFixed(1)}% daily.`
  );

  if (freshness >= 60) {
    parts.push(
      "FRESH CAPITAL — Most liquidity sits in bins that are actively participating in " +
      "swaps. This pool efficiently deploys its TVL with minimal idle reserves. " +
      "LPs are earning fees proportional to their capital commitment."
    );
  } else if (freshness >= 35) {
    parts.push(
      "AGING CAPITAL — A significant portion of liquidity sits in bins that haven't " +
      "seen recent trade flow. Some LP positions may need rebalancing to move capital " +
      "closer to the active price range where fees are generated."
    );
  } else {
    parts.push(
      "STALE CAPITAL — Most TVL is parked in bins far from active trading. LPs are " +
      "earning minimal fees relative to their capital. Consider narrowing positions " +
      "closer to the active bin for better capital efficiency."
    );
  }

  if (stalePct > 40) {
    const totalStaleUsd = staleZones.reduce((s, z) => s + z.totalUsd, 0);
    parts.push(
      `STALE CAPITAL WARNING: ${fmtPct(stalePct)} of scanned TVL ($${fmtUsd(totalStaleUsd)}) ` +
      `sits in stale bins. ` +
      `${staleZones.length} stale zone${staleZones.length > 1 ? "s" : ""} detected — ` +
      `largest on the ${staleZones[0]?.side ?? "?"} side ` +
      `($${fmtUsd(staleZones[0]?.totalUsd ?? 0)}). ` +
      "This capital is not participating in price discovery or fee generation."
    );
  }

  if (activeZone.width > 0) {
    parts.push(
      `ACTIVE TRADING ZONE: bins ${activeZone.startBin} to ${activeZone.endBin} ` +
      `(${activeZone.width} bins, ${activeZone.side} side). ` +
      `Average mix ratio: ${fmtPct(activeZone.avgMixRatio * 100)} — ` +
      `${activeZone.avgMixRatio > 0.6 ? "highly mixed (frequent two-way flow)" : activeZone.avgMixRatio > 0.3 ? "moderately mixed (directional bias)" : "weakly mixed (one-sided flow)"}. ` +
      `$${fmtUsd(activeZone.totalUsd)} TVL in active zone (${fmtPct(activePct)} of scanned).`
    );
  }

  if (gradient < 0.6) {
    parts.push(
      `IRREGULAR GRADIENT (coherence: ${fmtPct(gradient * 100)}) — The transition from ` +
      `token-X-dominant to token-Y-dominant bins is not smooth. This can indicate ` +
      `fragmented LP positions with gaps, or bins that were added at different times ` +
      `without coordinated range coverage.`
    );
  }

  if (volumeToTvl > 0.5) {
    parts.push(
      `HIGH VELOCITY: Volume is ${(volumeToTvl * 100).toFixed(0)}% of TVL per day. ` +
      `Reserves are turning over rapidly — active bins are likely being swept frequently. ` +
      `LPs should monitor for impermanent loss from directional price moves.`
    );
  } else if (volumeToTvl < 0.05 && pool.tvlUsd > 5000) {
    parts.push(
      `LOW VELOCITY: Volume is only ${(volumeToTvl * 100).toFixed(1)}% of TVL per day. ` +
      `Even actively-positioned bins are seeing minimal trade flow. Fee generation ` +
      `is limited — consider whether the fee tier justifies capital deployment here.`
    );
  }

  return parts.join("\n\n");
}

// -- Output -------------------------------------------------------------------

function printAnalysis(a: TurnoverAnalysis, format: string): void {
  if (format === "json") {
    console.log(JSON.stringify(a, null, 2));
    return;
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(`  HODLMM BIN TURNOVER — ${a.pair} (Pool #${a.poolId})`);
  console.log(`${"=".repeat(72)}`);
  console.log(`  TVL: $${fmtUsd(a.tvlUsd)}  |  Vol 24h: $${fmtUsd(a.volume24hUsd)}  |  Fee: ${a.feeBps} bps`);
  console.log(`  Active Bin: ${a.activeBinId}  |  Scanned: ${a.binsScanned} bins  |  Populated: ${a.binsPopulated}`);
  console.log(`  Scanned TVL: $${fmtUsd(a.scannedTvlUsd)}`);

  console.log(`\n── Pool Turnover ${"─".repeat(55)}`);
  console.log(`  Turnover Score:     ${a.poolTurnoverScore}/100 (${a.poolTurnoverClass})`);
  console.log(`  Capital Freshness:  ${fmtPct(a.capitalFreshness)} (${a.freshnessGrade})`);
  console.log(`  Active TVL:         $${fmtUsd(a.activeTvlUsd)} (${fmtPct(a.activePct)})`);
  console.log(`  Stale TVL:          $${fmtUsd(a.staleTvlUsd)} (${fmtPct(a.stalePct)})`);
  console.log(`  Gradient Coherence: ${fmtPct(a.gradientCoherence * 100)}`);
  console.log(`  Volume/TVL:         ${fmtPct(a.volumeToTvl * 100)} daily`);
  console.log(`  Implied Turnover:   ${a.impliedTurnoverPerDay.toFixed(3)}x per day`);

  if (a.activeZone.width > 0) {
    console.log(`\n── Active Trading Zone ${"─".repeat(50)}`);
    console.log(`  Range:     bins ${a.activeZone.startBin} — ${a.activeZone.endBin} (${a.activeZone.width} bins, ${a.activeZone.side})`);
    console.log(`  TVL:       $${fmtUsd(a.activeZone.totalUsd)}`);
    console.log(`  Avg Mix:   ${fmtPct(a.activeZone.avgMixRatio * 100)}`);
    console.log(`  Avg Score: ${a.activeZone.avgTurnoverScore}/100`);
  }

  if (a.staleZones.length > 0) {
    console.log(`\n── Stale Zones ${"─".repeat(57)}`);
    console.log(`  Zone           | Side   | Width | TVL          | Avg Score`);
    console.log(`  ---------------+--------+-------+--------------+----------`);
    for (const z of a.staleZones) {
      console.log(
        `  ${String(z.startBin).padStart(6)}–${String(z.endBin).padEnd(6)} | ` +
        `${z.side.padEnd(6)} | ${String(z.width).padStart(5)} | ` +
        `$${fmtUsd(z.totalUsd).padStart(11)} | ${String(z.avgTurnoverScore).padStart(5)}/100`
      );
    }
  }

  console.log(`\n── Turnover Heatmap ${"─".repeat(52)}`);
  console.log(a.asciiHeatmap);

  console.log(`\n── Recommendation ${"─".repeat(54)}`);
  console.log(a.recommendation);
  console.log();
}

// -- Main ---------------------------------------------------------------------

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("hodlmm-bin-turnover")
    .description("HODLMM Bin Turnover Analyzer — measures reserve turnover intensity to identify actively-traded vs stale bins")
    .option("-p, --pool <id>", "Pool ID to analyze")
    .option("-s, --search <pair>", "Search for pool by token pair (e.g. STX/sBTC)")
    .option("-r, --radius <n>", "Bin scan radius", String(BIN_SCAN_RADIUS))
    .option("-f, --format <fmt>", "Output format: text | json", "text")
    .parse(process.argv);

  const opts = program.opts();
  const radius = parseInt(opts.radius) || BIN_SCAN_RADIUS;
  const format = opts.format || "text";

  console.log("Discovering HODLMM pools...");
  const pools = await discoverPools();

  if (pools.length === 0) {
    console.error("No HODLMM pools found with sufficient TVL.");
    process.exit(1);
  }

  let targetPool: AppPool | undefined;

  if (opts.pool) {
    const poolId = parseInt(opts.pool);
    targetPool = pools.find((p) => p.poolId === poolId);
    if (!targetPool) {
      console.error(`Pool ${poolId} not found. Available: ${pools.map((p) => `${p.poolId} (${p.token0Symbol}/${p.token1Symbol})`).join(", ")}`);
      process.exit(1);
    }
  } else if (opts.search) {
    const q = opts.search.toLowerCase();
    targetPool = pools.find(
      (p) =>
        `${p.token0Symbol}/${p.token1Symbol}`.toLowerCase().includes(q) ||
        `${p.token1Symbol}/${p.token0Symbol}`.toLowerCase().includes(q) ||
        p.token0Symbol.toLowerCase() === q ||
        p.token1Symbol.toLowerCase() === q
    );
    if (!targetPool) {
      console.error(`No pool matching "${opts.search}". Available: ${pools.map((p) => `${p.token0Symbol}/${p.token1Symbol}`).join(", ")}`);
      process.exit(1);
    }
  } else {
    targetPool = pools.sort((a, b) => b.tvlUsd - a.tvlUsd)[0];
    console.log(`No pool specified — using highest-TVL: ${targetPool.token0Symbol}/${targetPool.token1Symbol}`);
  }

  console.log(`Analyzing turnover for ${targetPool.token0Symbol}/${targetPool.token1Symbol} (Pool #${targetPool.poolId})...`);

  const activeBin = targetPool.activeBinId ?? (await getActiveBin(targetPool.poolId!));
  console.log(`  Active bin: ${activeBin}, scanning +/-${radius} bins...`);

  const rawBins = await scanBins(targetPool.poolId!, activeBin, targetPool, radius);
  const analysis = analyzeTurnover(targetPool, activeBin, rawBins);

  printAnalysis(analysis, format);
}

main().catch((err) => {
  console.error("Fatal:", err.message ?? err);
  process.exit(1);
});
