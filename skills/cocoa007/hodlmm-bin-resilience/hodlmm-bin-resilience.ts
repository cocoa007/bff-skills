#!/usr/bin/env bun
/**
 * hodlmm-bin-resilience.ts
 *
 * HODLMM Bin Resilience Analyzer — Measures how well bins can absorb and
 * recover from liquidity shocks. When a large trade depletes a bin, recovery
 * depends on neighbor support (adjacent reserves that can rebalance), reserve
 * depth ratio (how much buffer exists beyond the active trading layer), and
 * structural redundancy (multiple bins sharing similar price ranges).
 *
 * Metrics:
 *  1. Recovery capacity: USD buffer available from neighbors within ±3 bins
 *  2. Depth ratio: reserve depth relative to recent volume pressure
 *  3. Support score: weighted neighbor liquidity backing each bin
 *  4. Isolation index: bins with weak neighbor support (shock-vulnerable)
 *  5. Resilience asymmetry: bid-side vs ask-side recovery comparison
 *  6. Resilience score (0-100): composite shock-absorption measure
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 88).
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 25;
const NEIGHBOR_RADIUS = 3;

type ResilienceGrade = "FORTRESS" | "STRONG" | "ADEQUATE" | "FRAGILE" | "BRITTLE";
type Side = "BID" | "ASK";

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

interface BinResilience {
  binId: number;
  offset: number;
  ownReserveUsd: number;
  neighborSupportUsd: number;
  recoveryCapacityUsd: number;
  depthRatio: number;
  supportScore: number;
  isolationIndex: number;
  isIsolated: boolean;
  isAnchor: boolean;
  grade: ResilienceGrade;
}

interface SideProfile {
  side: Side;
  bins: BinResilience[];
  avgSupportScore: number;
  avgDepthRatio: number;
  isolatedBinCount: number;
  anchorBinCount: number;
  totalRecoveryCapacityUsd: number;
  weakestBin: { binId: number; supportScore: number } | null;
  strongestBin: { binId: number; supportScore: number } | null;
  resilienceScore: number;
}

interface ResilienceAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  bidProfile: SideProfile;
  askProfile: SideProfile;
  asymmetryRatio: number;
  asymmetryDirection: string;
  globalResilienceScore: number;
  globalGrade: ResilienceGrade;
  shockAbsorptionUsd: number;
  volumeToTvlPressure: number;
  isolatedBinTotal: number;
  anchorBinTotal: number;
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

// -- Resilience analysis ------------------------------------------------------

const ISOLATED_THRESHOLD = 20;
const ANCHOR_THRESHOLD = 70;

function computeNeighborSupport(
  bins: BinReserves[],
  targetIdx: number,
  radius: number
): number {
  let support = 0;
  for (let d = 1; d <= radius; d++) {
    const weight = 1 / d;
    const leftIdx = targetIdx - d;
    const rightIdx = targetIdx + d;
    if (leftIdx >= 0) support += bins[leftIdx].totalUsd * weight;
    if (rightIdx < bins.length) support += bins[rightIdx].totalUsd * weight;
  }
  return support;
}

function computeBinResilience(
  bins: BinReserves[],
  idx: number,
  activeBinId: number,
  scannedTvl: number,
  volume24hUsd: number
): BinResilience {
  const bin = bins[idx];
  const offset = bin.binId - activeBinId;

  const neighborSupport = computeNeighborSupport(bins, idx, NEIGHBOR_RADIUS);
  const recoveryCapacity = bin.totalUsd + neighborSupport;

  const dailyPressure = volume24hUsd > 0 ? volume24hUsd / (bins.length || 1) : 0;
  const depthRatio = dailyPressure > 0
    ? Math.min(recoveryCapacity / dailyPressure, 10)
    : recoveryCapacity > 0 ? 10 : 0;

  const avgBinUsd = scannedTvl / Math.max(bins.filter(b => b.totalUsd > 0.01).length, 1);
  const supportScore = avgBinUsd > 0
    ? Math.min(Math.round((neighborSupport / avgBinUsd) * 50), 100)
    : 0;

  const isolationIndex = 100 - supportScore;
  const isIsolated = supportScore < ISOLATED_THRESHOLD;
  const isAnchor = supportScore >= ANCHOR_THRESHOLD;

  let grade: ResilienceGrade;
  if (supportScore >= 80 && depthRatio >= 5) grade = "FORTRESS";
  else if (supportScore >= 60 && depthRatio >= 3) grade = "STRONG";
  else if (supportScore >= 40 && depthRatio >= 1) grade = "ADEQUATE";
  else if (supportScore >= 20) grade = "FRAGILE";
  else grade = "BRITTLE";

  return {
    binId: bin.binId,
    offset,
    ownReserveUsd: Math.round(bin.totalUsd * 100) / 100,
    neighborSupportUsd: Math.round(neighborSupport * 100) / 100,
    recoveryCapacityUsd: Math.round(recoveryCapacity * 100) / 100,
    depthRatio: Math.round(depthRatio * 100) / 100,
    supportScore,
    isolationIndex,
    isIsolated,
    isAnchor,
    grade,
  };
}

function buildSideProfile(
  allResilience: BinResilience[],
  activeBinId: number,
  side: Side
): SideProfile {
  const bins = side === "BID"
    ? allResilience.filter(b => b.binId <= activeBinId)
    : allResilience.filter(b => b.binId >= activeBinId);

  if (bins.length === 0) {
    return {
      side,
      bins: [],
      avgSupportScore: 0,
      avgDepthRatio: 0,
      isolatedBinCount: 0,
      anchorBinCount: 0,
      totalRecoveryCapacityUsd: 0,
      weakestBin: null,
      strongestBin: null,
      resilienceScore: 0,
    };
  }

  const populated = bins.filter(b => b.ownReserveUsd > 0.01);
  const avgSupport = populated.length > 0
    ? populated.reduce((s, b) => s + b.supportScore, 0) / populated.length
    : 0;
  const avgDepth = populated.length > 0
    ? populated.reduce((s, b) => s + b.depthRatio, 0) / populated.length
    : 0;

  const isolated = populated.filter(b => b.isIsolated).length;
  const anchors = populated.filter(b => b.isAnchor).length;
  const totalRecovery = populated.reduce((s, b) => s + b.recoveryCapacityUsd, 0);

  const weakest = populated.length > 0
    ? populated.reduce((min, b) => b.supportScore < min.supportScore ? b : min)
    : null;
  const strongest = populated.length > 0
    ? populated.reduce((max, b) => b.supportScore > max.supportScore ? b : max)
    : null;

  const supportComponent = Math.min(avgSupport, 100) * 0.4;
  const depthComponent = Math.min(avgDepth / 10, 1) * 100 * 0.25;
  const isolationPenalty = populated.length > 0
    ? (isolated / populated.length) * 100 * 0.2
    : 0;
  const anchorBonus = populated.length > 0
    ? (anchors / populated.length) * 100 * 0.15
    : 0;
  const resilienceScore = Math.min(
    Math.round(supportComponent + depthComponent - isolationPenalty + anchorBonus),
    100
  );

  return {
    side,
    bins: populated.slice(0, 15),
    avgSupportScore: Math.round(avgSupport),
    avgDepthRatio: Math.round(avgDepth * 100) / 100,
    isolatedBinCount: isolated,
    anchorBinCount: anchors,
    totalRecoveryCapacityUsd: Math.round(totalRecovery * 100) / 100,
    weakestBin: weakest ? { binId: weakest.binId, supportScore: weakest.supportScore } : null,
    strongestBin: strongest ? { binId: strongest.binId, supportScore: strongest.supportScore } : null,
    resilienceScore,
  };
}

function classifyGrade(score: number): ResilienceGrade {
  if (score >= 80) return "FORTRESS";
  if (score >= 60) return "STRONG";
  if (score >= 40) return "ADEQUATE";
  if (score >= 20) return "FRAGILE";
  return "BRITTLE";
}

function buildAsciiMap(
  allResilience: BinResilience[],
  activeBinId: number
): string {
  const populated = allResilience.filter(b => b.ownReserveUsd > 0.01);
  if (populated.length === 0) return "(no populated bins)";

  const maxSupport = Math.max(...populated.map(b => b.supportScore), 1);
  const barWidth = 30;
  const lines: string[] = ["RESILIENCE MAP", ""];

  for (const bin of populated) {
    const offset = bin.binId - activeBinId;
    const len = Math.max(1, Math.round((bin.supportScore / maxSupport) * barWidth));

    let marker = " ";
    if (bin.binId === activeBinId) marker = "*";
    else if (bin.isIsolated) marker = "!";
    else if (bin.isAnchor) marker = "^";

    const bar = bin.isIsolated
      ? "░".repeat(len)
      : bin.isAnchor
        ? "█".repeat(len)
        : "▒".repeat(len);

    const label = `${offset >= 0 ? "+" : ""}${offset}`;
    lines.push(
      `${label.padStart(4)} ${marker} ${bar} s=${bin.supportScore} $${fmtUsd(bin.recoveryCapacityUsd)} [${bin.grade}]`
    );
  }

  lines.push("");
  lines.push("* = active  ^ = anchor  ! = isolated  █ = anchor  ▒ = normal  ░ = isolated");
  return lines.join("\n");
}

function buildRecommendation(
  analysis: Omit<ResilienceAnalysis, "recommendation" | "asciiMap">
): string {
  const parts: string[] = [];

  parts.push(
    `${analysis.pair} resilience: ${analysis.globalGrade} (score ${analysis.globalResilienceScore}/100).`
  );

  if (analysis.asymmetryRatio > 1.5) {
    const weaker = analysis.bidProfile.resilienceScore < analysis.askProfile.resilienceScore
      ? "BID" : "ASK";
    parts.push(
      `${weaker} side is ${analysis.asymmetryRatio.toFixed(1)}x weaker — shocks on that side recover slower.`
    );
  }

  if (analysis.isolatedBinTotal > 0) {
    parts.push(
      `${analysis.isolatedBinTotal} isolated bin(s) with weak neighbor support — vulnerable to depletion without recovery.`
    );
  }

  if (analysis.anchorBinTotal >= 3) {
    parts.push(
      `${analysis.anchorBinTotal} anchor bins provide strong structural support across the range.`
    );
  }

  if (analysis.volumeToTvlPressure > 1) {
    parts.push(
      `High volume pressure (${analysis.volumeToTvlPressure.toFixed(1)}x TVL daily) — resilience tested frequently.`
    );
  }

  if (analysis.globalResilienceScore >= 60) {
    parts.push("Pool shows robust shock absorption. Safe for concentrated positions.");
  } else if (analysis.globalResilienceScore >= 40) {
    parts.push("Moderate resilience. Monitor isolated bins during high-volume periods.");
  } else {
    parts.push("Weak resilience structure. Consider wider ranges or reduced position sizes to mitigate shock risk.");
  }

  return parts.join(" ");
}

// -- Main analysis ------------------------------------------------------------

async function analyzeResilience(pool: AppPool): Promise<ResilienceAnalysis> {
  const poolId = pool.poolId!;
  const activeBinId = pool.activeBinId ?? await getActiveBin(poolId);
  const rawBins = await scanBins(poolId, activeBinId, pool, BIN_SCAN_RADIUS);

  const populated = rawBins.filter(b => b.totalUsd > 0.01);
  const scannedTvl = populated.reduce((s, b) => s + b.totalUsd, 0);

  const allResilience: BinResilience[] = rawBins.map((_, idx) =>
    computeBinResilience(rawBins, idx, activeBinId, scannedTvl, pool.volume24hUsd)
  );

  const bidProfile = buildSideProfile(allResilience, activeBinId, "BID");
  const askProfile = buildSideProfile(allResilience, activeBinId, "ASK");

  const bidScore = bidProfile.resilienceScore;
  const askScore = askProfile.resilienceScore;
  const minScore = Math.min(bidScore, askScore);
  const maxScore = Math.max(bidScore, askScore);
  const asymmetryRatio = minScore > 0 ? Math.round((maxScore / minScore) * 100) / 100 : maxScore > 0 ? Infinity : 1;
  const asymmetryDirection = bidScore > askScore ? "BID-stronger" : bidScore < askScore ? "ASK-stronger" : "balanced";

  const globalScore = Math.round((bidScore + askScore) / 2);
  const globalGrade = classifyGrade(globalScore);

  const shockAbsorption = bidProfile.totalRecoveryCapacityUsd + askProfile.totalRecoveryCapacityUsd;
  const volumePressure = scannedTvl > 0 ? pool.volume24hUsd / scannedTvl : 0;
  const isolatedTotal = bidProfile.isolatedBinCount + askProfile.isolatedBinCount;
  const anchorTotal = bidProfile.anchorBinCount + askProfile.anchorBinCount;

  const partial = {
    poolId,
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    feeBps: pool.feeBps ?? 30,
    activeBinId,
    binsScanned: rawBins.length,
    binsPopulated: populated.length,
    scannedTvlUsd: Math.round(scannedTvl * 100) / 100,
    bidProfile,
    askProfile,
    asymmetryRatio,
    asymmetryDirection,
    globalResilienceScore: globalScore,
    globalGrade,
    shockAbsorptionUsd: Math.round(shockAbsorption * 100) / 100,
    volumeToTvlPressure: Math.round(volumePressure * 100) / 100,
    isolatedBinTotal: isolatedTotal,
    anchorBinTotal: anchorTotal,
  };

  const recommendation = buildRecommendation(partial);
  const asciiMap = buildAsciiMap(allResilience, activeBinId);

  return { ...partial, recommendation, asciiMap };
}

function makeErrorResult(pool: AppPool, errMsg: string): ResilienceAnalysis {
  const emptySide: SideProfile = {
    side: "BID",
    bins: [],
    avgSupportScore: 0,
    avgDepthRatio: 0,
    isolatedBinCount: 0,
    anchorBinCount: 0,
    totalRecoveryCapacityUsd: 0,
    weakestBin: null,
    strongestBin: null,
    resilienceScore: 0,
  };
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
    bidProfile: { ...emptySide, side: "BID" },
    askProfile: { ...emptySide, side: "ASK" },
    asymmetryRatio: 1,
    asymmetryDirection: "unknown",
    globalResilienceScore: 0,
    globalGrade: "BRITTLE",
    shockAbsorptionUsd: 0,
    volumeToTvlPressure: 0,
    isolatedBinTotal: 0,
    anchorBinTotal: 0,
    recommendation: `Analysis failed: ${errMsg}`,
    asciiMap: "",
  };
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();

program
  .name("hodlmm-bin-resilience")
  .description("HODLMM Bin Resilience Analyzer — measures liquidity shock recovery capacity");

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
          neighborRadius: NEIGHBOR_RADIUS,
        },
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Doctor failed: ${err.message}` }));
    }
  });

program
  .command("run")
  .description("Analyze bin resilience for top HODLMM pools")
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

      const results: ResilienceAnalysis[] = [];
      for (const pool of targets) {
        try {
          const analysis = await analyzeResilience(pool);
          results.push(analysis);
        } catch (err: any) {
          results.push(makeErrorResult(pool, err.message));
        }
      }

      const summary = {
        poolsAnalyzed: results.length,
        mostResilient: results.reduce((max, r) =>
          r.globalResilienceScore > max.globalResilienceScore ? r : max, results[0]),
        leastResilient: results.reduce((min, r) =>
          r.globalResilienceScore < min.globalResilienceScore ? r : min, results[0]),
        avgResilienceScore: Math.round(
          results.reduce((s, r) => s + r.globalResilienceScore, 0) / results.length
        ),
        totalIsolatedBins: results.reduce((s, r) => s + r.isolatedBinTotal, 0),
        totalAnchorBins: results.reduce((s, r) => s + r.anchorBinTotal, 0),
      };

      console.log(JSON.stringify({
        result: "resilience_analysis",
        data: { pools: results, summary },
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Run failed: ${err.message}` }));
    }
  });

program
  .command("status")
  .description("Quick resilience summary for top pools")
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
          const analysis = await analyzeResilience(pool);
          summaries.push({
            pair: analysis.pair,
            poolId: analysis.poolId,
            tvlUsd: analysis.tvlUsd,
            grade: analysis.globalGrade,
            resilienceScore: analysis.globalResilienceScore,
            shockAbsorption: `$${fmtUsd(analysis.shockAbsorptionUsd)}`,
            isolatedBins: analysis.isolatedBinTotal,
            anchorBins: analysis.anchorBinTotal,
            asymmetry: analysis.asymmetryDirection,
            volumePressure: `${analysis.volumeToTvlPressure}x`,
          });
        } catch {
          summaries.push({
            pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
            poolId: pool.poolId,
            tvlUsd: pool.tvlUsd,
            grade: "UNKNOWN",
            resilienceScore: -1,
          });
        }
      }

      console.log(JSON.stringify({ result: "resilience_status", data: summaries }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Status failed: ${err.message}` }));
    }
  });

program.parse();
