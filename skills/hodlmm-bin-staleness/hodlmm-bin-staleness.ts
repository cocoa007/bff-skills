#!/usr/bin/env bun
/**
 * hodlmm-bin-staleness.ts
 *
 * HODLMM Bin Staleness Detector — Identifies stale/zombie liquidity bins
 * by analyzing reserve patterns that suggest abandoned or unmanaged positions.
 *
 * Metrics:
 *  1. Distance decay: bins far from active bin with reserves → likely stale
 *  2. Single-sided ratio: bins with only X or only Y reserves at distant offsets
 *  3. Isolation score: populated bins surrounded by empty bins
 *  4. Zombie capital: estimated USD value locked in likely-stale bins
 *  5. Effective TVL: pool TVL minus zombie capital (real active liquidity)
 *  6. Staleness score (0-100): composite measure of stale liquidity burden
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 94).
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 30;
const STALE_DISTANCE_THRESHOLD = 15;
const ISOLATION_GAP_THRESHOLD = 3;

type StalenessClass = "FRESH" | "AGING" | "STALE" | "ZOMBIE" | "ABANDONED";

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
  xRatio: number;
}

interface BinStaleness {
  binId: number;
  offset: number;
  totalUsd: number;
  xRatio: number;
  distanceScore: number;
  singleSidedScore: number;
  isolationScore: number;
  compositeScore: number;
  classification: StalenessClass;
  reason: string;
}

interface ZombieSummary {
  zombieBins: number;
  zombieCapitalUsd: number;
  effectiveTvlUsd: number;
  zombiePct: number;
  worstOffender: { binId: number; offset: number; usd: number } | null;
  zombieByZone: { inner: number; mid: number; outer: number };
}

interface StalenessProfile {
  totalBins: number;
  populatedBins: number;
  staleBins: BinStaleness[];
  freshBins: number;
  agingBins: number;
  staleBinCount: number;
  zombieBinCount: number;
  abandonedBinCount: number;
  zombie: ZombieSummary;
  avgStaleness: number;
  maxStaleness: number;
  stalenessScore: number;
  stalenessClass: StalenessClass;
  asciiMap: string;
}

interface StalenessAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  profile: StalenessProfile;
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

  const xRatio = totalUsd > 0.01 ? rxUsd / totalUsd : 0;

  return {
    binId,
    reserveX: rx,
    reserveY: ry,
    reserveXUsd: rxUsd,
    reserveYUsd: ryUsd,
    totalUsd,
    xRatio,
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

// -- Staleness analysis -------------------------------------------------------

function computeDistanceScore(offset: number): number {
  const absOffset = Math.abs(offset);
  if (absOffset <= 3) return 0;
  if (absOffset <= 8) return (absOffset - 3) / 5 * 0.3;
  if (absOffset <= STALE_DISTANCE_THRESHOLD) return 0.3 + (absOffset - 8) / 7 * 0.3;
  return Math.min(1, 0.6 + (absOffset - STALE_DISTANCE_THRESHOLD) / 15 * 0.4);
}

function computeSingleSidedScore(bin: BinReserves, offset: number): number {
  if (bin.totalUsd < 0.01) return 0;
  const absOffset = Math.abs(offset);
  const singleSidedness = Math.abs(bin.xRatio - 0.5) * 2;

  if (absOffset <= 5) return singleSidedness * 0.2;
  if (absOffset <= STALE_DISTANCE_THRESHOLD) return singleSidedness * 0.6;
  return singleSidedness * 1.0;
}

function computeIsolationScore(
  binId: number,
  populatedSet: Set<number>,
  radius: number
): number {
  let gapsBefore = 0;
  let gapsAfter = 0;

  for (let d = 1; d <= radius; d++) {
    if (!populatedSet.has(binId - d)) gapsBefore++;
    else break;
  }
  for (let d = 1; d <= radius; d++) {
    if (!populatedSet.has(binId + d)) gapsAfter++;
    else break;
  }

  const minGap = Math.min(gapsBefore, gapsAfter);
  const maxGap = Math.max(gapsBefore, gapsAfter);

  if (minGap >= ISOLATION_GAP_THRESHOLD) return Math.min(1, maxGap / 8);
  if (maxGap >= ISOLATION_GAP_THRESHOLD + 2) return Math.min(0.6, maxGap / 12);
  return 0;
}

function classifyStaleness(score: number): StalenessClass {
  if (score < 0.15) return "FRESH";
  if (score < 0.35) return "AGING";
  if (score < 0.55) return "STALE";
  if (score < 0.75) return "ZOMBIE";
  return "ABANDONED";
}

function stalenessReason(bin: BinStaleness): string {
  const parts: string[] = [];
  if (bin.distanceScore > 0.5) parts.push(`far from active bin (offset ${bin.offset >= 0 ? "+" : ""}${bin.offset})`);
  if (bin.singleSidedScore > 0.5) parts.push(`heavily single-sided (${Math.round(bin.xRatio * 100)}% X)`);
  if (bin.isolationScore > 0.3) parts.push("isolated — surrounded by empty bins");
  if (parts.length === 0) parts.push("minimal staleness indicators");
  return parts.join(", ");
}

function analyzeBinStaleness(
  bins: BinReserves[],
  activeBinId: number
): BinStaleness[] {
  const populated = bins.filter(b => b.totalUsd > 0.01);
  const populatedSet = new Set(populated.map(b => b.binId));

  return populated.map(bin => {
    const offset = bin.binId - activeBinId;
    const distanceScore = computeDistanceScore(offset);
    const singleSidedScore = computeSingleSidedScore(bin, offset);
    const isolationScore = computeIsolationScore(bin.binId, populatedSet, 5);

    const compositeScore = Math.min(1,
      distanceScore * 0.45 +
      singleSidedScore * 0.30 +
      isolationScore * 0.25
    );

    const classification = classifyStaleness(compositeScore);

    const result: BinStaleness = {
      binId: bin.binId,
      offset,
      totalUsd: Math.round(bin.totalUsd * 100) / 100,
      xRatio: Math.round(bin.xRatio * 1000) / 1000,
      distanceScore: Math.round(distanceScore * 1000) / 1000,
      singleSidedScore: Math.round(singleSidedScore * 1000) / 1000,
      isolationScore: Math.round(isolationScore * 1000) / 1000,
      compositeScore: Math.round(compositeScore * 1000) / 1000,
      classification,
      reason: "",
    };
    result.reason = stalenessReason(result);
    return result;
  });
}

function computeZombieSummary(
  staleBins: BinStaleness[],
  scannedTvlUsd: number,
  activeBinId: number
): ZombieSummary {
  const zombies = staleBins.filter(b =>
    b.classification === "ZOMBIE" || b.classification === "ABANDONED" || b.classification === "STALE"
  );

  const zombieCapital = zombies.reduce((s, b) => s + b.totalUsd, 0);
  const effectiveTvl = Math.max(0, scannedTvlUsd - zombieCapital);
  const zombiePct = scannedTvlUsd > 0
    ? Math.round(zombieCapital / scannedTvlUsd * 10000) / 100
    : 0;

  let worstOffender: { binId: number; offset: number; usd: number } | null = null;
  if (zombies.length > 0) {
    const worst = zombies.reduce((w, b) => b.totalUsd > w.totalUsd ? b : w, zombies[0]);
    worstOffender = { binId: worst.binId, offset: worst.offset, usd: worst.totalUsd };
  }

  const innerRadius = 8;
  const midRadius = 16;
  const zombieByZone = {
    inner: zombies.filter(b => Math.abs(b.offset) <= innerRadius).reduce((s, b) => s + b.totalUsd, 0),
    mid: zombies.filter(b => {
      const d = Math.abs(b.offset);
      return d > innerRadius && d <= midRadius;
    }).reduce((s, b) => s + b.totalUsd, 0),
    outer: zombies.filter(b => Math.abs(b.offset) > midRadius).reduce((s, b) => s + b.totalUsd, 0),
  };

  return {
    zombieBins: zombies.length,
    zombieCapitalUsd: Math.round(zombieCapital * 100) / 100,
    effectiveTvlUsd: Math.round(effectiveTvl * 100) / 100,
    zombiePct,
    worstOffender,
    zombieByZone: {
      inner: Math.round(zombieByZone.inner * 100) / 100,
      mid: Math.round(zombieByZone.mid * 100) / 100,
      outer: Math.round(zombieByZone.outer * 100) / 100,
    },
  };
}

function buildAsciiMap(
  staleBins: BinStaleness[],
  activeBinId: number
): string {
  if (staleBins.length === 0) return "(no populated bins)";

  const lines: string[] = ["STALENESS MAP", ""];
  lines.push("  offset  |  $value  |  score  | class      | visualization");
  lines.push("  --------+----------+---------+------------+------------------");

  const sorted = [...staleBins].sort((a, b) => a.offset - b.offset);

  for (const bin of sorted) {
    const label = `${bin.offset >= 0 ? "+" : ""}${bin.offset}`;
    const usd = fmtUsd(bin.totalUsd).padStart(7);

    const barLen = Math.round(bin.compositeScore * 15);
    const barChar = bin.classification === "ABANDONED" ? "X"
      : bin.classification === "ZOMBIE" ? "#"
      : bin.classification === "STALE" ? "="
      : bin.classification === "AGING" ? "~"
      : ".";
    const bar = barChar.repeat(Math.max(1, barLen));

    const marker = bin.offset === 0 ? " *" : "  ";

    lines.push(
      `  ${label.padStart(6)}  | ${usd} | ${bin.compositeScore.toFixed(2).padStart(5)}   | ${bin.classification.padEnd(10)} | ${bar}${marker}`
    );
  }

  lines.push("");
  lines.push("* = active bin   . = fresh   ~ = aging   = = stale   # = zombie   X = abandoned");
  lines.push("Score: 0.0 = perfectly fresh, 1.0 = certainly abandoned");
  return lines.join("\n");
}

function buildProfile(
  bins: BinReserves[],
  activeBinId: number
): StalenessProfile {
  const staleBins = analyzeBinStaleness(bins, activeBinId);
  const populated = bins.filter(b => b.totalUsd > 0.01);
  const scannedTvl = populated.reduce((s, b) => s + b.totalUsd, 0);

  const freshCount = staleBins.filter(b => b.classification === "FRESH").length;
  const agingCount = staleBins.filter(b => b.classification === "AGING").length;
  const staleCount = staleBins.filter(b => b.classification === "STALE").length;
  const zombieCount = staleBins.filter(b => b.classification === "ZOMBIE").length;
  const abandonedCount = staleBins.filter(b => b.classification === "ABANDONED").length;

  const zombie = computeZombieSummary(staleBins, scannedTvl, activeBinId);
  const asciiMap = buildAsciiMap(staleBins, activeBinId);

  const avgStaleness = staleBins.length > 0
    ? staleBins.reduce((s, b) => s + b.compositeScore, 0) / staleBins.length
    : 0;
  const maxStaleness = staleBins.length > 0
    ? Math.max(...staleBins.map(b => b.compositeScore))
    : 0;

  // Composite staleness score
  const zombiePctComponent = Math.min(zombie.zombiePct / 40, 1) * 35;
  const avgComponent = Math.min(avgStaleness / 0.5, 1) * 25;
  const maxComponent = Math.min(maxStaleness / 0.8, 1) * 15;
  const staleFractionComponent = staleBins.length > 0
    ? ((staleCount + zombieCount + abandonedCount) / staleBins.length) * 25
    : 0;

  const rawScore = zombiePctComponent + avgComponent + maxComponent + staleFractionComponent;
  const stalenessScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  let stalenessClass: StalenessClass;
  if (stalenessScore >= 70) stalenessClass = "ABANDONED";
  else if (stalenessScore >= 50) stalenessClass = "ZOMBIE";
  else if (stalenessScore >= 30) stalenessClass = "STALE";
  else if (stalenessScore >= 15) stalenessClass = "AGING";
  else stalenessClass = "FRESH";

  return {
    totalBins: bins.length,
    populatedBins: populated.length,
    staleBins,
    freshBins: freshCount,
    agingBins: agingCount,
    staleBinCount: staleCount,
    zombieBinCount: zombieCount,
    abandonedBinCount: abandonedCount,
    zombie,
    avgStaleness: Math.round(avgStaleness * 1000) / 1000,
    maxStaleness: Math.round(maxStaleness * 1000) / 1000,
    stalenessScore,
    stalenessClass,
    asciiMap,
  };
}

function buildRecommendation(pair: string, profile: StalenessProfile): string {
  const parts: string[] = [];

  parts.push(
    `${pair} staleness: ${profile.stalenessClass} (score ${profile.stalenessScore}/100), ` +
    `${profile.populatedBins} bins analyzed, ` +
    `${profile.freshBins} fresh / ${profile.agingBins} aging / ${profile.staleBinCount} stale / ` +
    `${profile.zombieBinCount} zombie / ${profile.abandonedBinCount} abandoned.`
  );

  const z = profile.zombie;
  parts.push(
    `Zombie capital: $${fmtUsd(z.zombieCapitalUsd)} (${z.zombiePct}% of scanned TVL). ` +
    `Effective TVL after removing stale liquidity: $${fmtUsd(z.effectiveTvlUsd)}.`
  );

  if (z.worstOffender) {
    parts.push(
      `Worst offender: bin ${z.worstOffender.binId} (offset ${z.worstOffender.offset >= 0 ? "+" : ""}${z.worstOffender.offset}) ` +
      `holding $${fmtUsd(z.worstOffender.usd)} in likely-stale reserves.`
    );
  }

  if (z.zombieByZone.outer > z.zombieByZone.inner * 2) {
    parts.push("Most stale capital sits in outer bins — typical of old positions that drifted out of range.");
  } else if (z.zombieByZone.inner > z.zombieByZone.outer * 2) {
    parts.push("Unusual: stale capital concentrated near active bin. May indicate positions that were once active but stopped being managed.");
  }

  if (profile.stalenessClass === "FRESH") {
    parts.push("Pool liquidity is well-managed — most capital is positioned near the active bin with minimal staleness indicators. TVL numbers are reliable.");
  } else if (profile.stalenessClass === "AGING") {
    parts.push("Some liquidity showing age. Consider whether the effective TVL (minus stale) changes your assessment of this pool's depth.");
  } else if (profile.stalenessClass === "STALE") {
    parts.push("Significant stale liquidity detected. Pool TVL overstates real depth. LPs with active positions may face less competition for fees than TVL suggests.");
  } else if (profile.stalenessClass === "ZOMBIE") {
    parts.push("Heavy zombie capital burden. Reported TVL is misleading — a large fraction is likely abandoned. Active LPs capturing disproportionate fees relative to stated TVL.");
  } else {
    parts.push("Severe staleness — pool TVL is substantially inflated by abandoned positions. Effective liquidity is much lower than reported. High fee opportunity for active managers.");
  }

  if (profile.avgStaleness > 0.3 && profile.zombie.zombiePct > 10) {
    parts.push(`TIP: Active LPs in this pool compete against only $${fmtUsd(z.effectiveTvlUsd)} of real liquidity, not the reported TVL. Fee yields may be higher than they appear.`);
  }

  return parts.join(" ");
}

// -- Main analysis ------------------------------------------------------------

async function analyzeStaleness(pool: AppPool): Promise<StalenessAnalysis> {
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

function makeErrorResult(pool: AppPool, errMsg: string): StalenessAnalysis {
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
      totalBins: 0, populatedBins: 0, staleBins: [],
      freshBins: 0, agingBins: 0, staleBinCount: 0, zombieBinCount: 0, abandonedBinCount: 0,
      zombie: {
        zombieBins: 0, zombieCapitalUsd: 0, effectiveTvlUsd: 0, zombiePct: 0,
        worstOffender: null, zombieByZone: { inner: 0, mid: 0, outer: 0 },
      },
      avgStaleness: 0, maxStaleness: 0, stalenessScore: 0, stalenessClass: "FRESH",
      asciiMap: "",
    },
    recommendation: `Analysis failed: ${errMsg}`,
  };
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();

program
  .name("hodlmm-bin-staleness")
  .description("HODLMM Bin Staleness Detector — identifies zombie/abandoned liquidity bins");

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
          staleDistanceThreshold: STALE_DISTANCE_THRESHOLD,
          isolationGapThreshold: ISOLATION_GAP_THRESHOLD,
        },
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Doctor failed: ${err.message}` }));
    }
  });

program
  .command("run")
  .description("Analyze bin staleness for HODLMM pools")
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

      const results: StalenessAnalysis[] = [];
      for (const pool of targets) {
        try {
          const analysis = await analyzeStaleness(pool);
          results.push(analysis);
        } catch (err: any) {
          results.push(makeErrorResult(pool, err.message));
        }
      }

      const summary = {
        poolsAnalyzed: results.length,
        mostStale: results.reduce((best, r) =>
          r.profile.stalenessScore > best.profile.stalenessScore ? r : best, results[0]),
        freshest: results.reduce((best, r) =>
          r.profile.stalenessScore < best.profile.stalenessScore ? r : best, results[0]),
        avgStalenessScore: Math.round(
          results.reduce((s, r) => s + r.profile.stalenessScore, 0) / results.length
        ),
        totalZombieCapitalUsd: Math.round(
          results.reduce((s, r) => s + r.profile.zombie.zombieCapitalUsd, 0) * 100
        ) / 100,
        totalEffectiveTvlUsd: Math.round(
          results.reduce((s, r) => s + r.profile.zombie.effectiveTvlUsd, 0) * 100
        ) / 100,
        classCounts: {
          FRESH: results.filter(r => r.profile.stalenessClass === "FRESH").length,
          AGING: results.filter(r => r.profile.stalenessClass === "AGING").length,
          STALE: results.filter(r => r.profile.stalenessClass === "STALE").length,
          ZOMBIE: results.filter(r => r.profile.stalenessClass === "ZOMBIE").length,
          ABANDONED: results.filter(r => r.profile.stalenessClass === "ABANDONED").length,
        },
      };

      console.log(JSON.stringify({
        result: "staleness_analysis",
        data: { pools: results, summary },
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Run failed: ${err.message}` }));
    }
  });

program
  .command("status")
  .description("Quick staleness summary for top pools")
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
          const analysis = await analyzeStaleness(pool);
          summaries.push({
            pair: analysis.pair,
            poolId: analysis.poolId,
            tvlUsd: analysis.tvlUsd,
            stalenessScore: analysis.profile.stalenessScore,
            stalenessClass: analysis.profile.stalenessClass,
            zombieCapitalUsd: analysis.profile.zombie.zombieCapitalUsd,
            effectiveTvlUsd: analysis.profile.zombie.effectiveTvlUsd,
            zombiePct: analysis.profile.zombie.zombiePct,
            freshBins: analysis.profile.freshBins,
            staleBins: analysis.profile.staleBinCount + analysis.profile.zombieBinCount + analysis.profile.abandonedBinCount,
          });
        } catch {
          summaries.push({
            pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
            poolId: pool.poolId,
            tvlUsd: pool.tvlUsd,
            stalenessScore: -1,
          });
        }
      }

      console.log(JSON.stringify({ result: "staleness_status", data: summaries }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Status failed: ${err.message}` }));
    }
  });

program.parse();
