#!/usr/bin/env bun
/**
 * hodlmm-bin-absorption.ts
 *
 * HODLMM Bin Absorption Analyzer — Measures how well each bin absorbs incoming
 * trade flow without excessive price movement. High-absorption bins have deep,
 * balanced reserves that can handle large trades. Low-absorption bins deplete
 * quickly under pressure, causing slippage cascades into neighboring bins.
 *
 * Metrics:
 *  1. Reserve depth: total USD value available for trade absorption
 *  2. Absorption capacity: max single-side trade before depletion (USD)
 *  3. Balance ratio: symmetry of X/Y reserves (1.0 = perfect balance)
 *  4. Cushion depth: consecutive populated neighbors providing backup
 *  5. Flow resistance: reserves relative to typical trade volume per bin
 *  6. Absorption score (0-100): composite measure of trade absorption quality
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 90).
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 25;

type AbsorptionClass = "FORTRESS" | "ROBUST" | "ADEQUATE" | "THIN" | "FRAGILE";

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

interface BinAbsorption {
  binId: number;
  offset: number;
  reserveUsd: number;
  reserveXUsd: number;
  reserveYUsd: number;
  absorptionCapacityUsd: number;
  balanceRatio: number;
  cushionDepthLeft: number;
  cushionDepthRight: number;
  flowResistance: number;
  absorptionScore: number;
  absorptionClass: AbsorptionClass;
  weakSide: "X" | "Y" | "BALANCED";
  depletionRiskPct: number;
}

interface AbsorptionProfile {
  totalBins: number;
  populatedBins: number;
  fortressBins: number;
  fragileBins: number;
  avgAbsorptionScore: number;
  medianAbsorptionScore: number;
  absorptionGini: number;
  totalAbsorptionCapacityUsd: number;
  avgBalanceRatio: number;
  maxSingleTradeUsd: number;
  weakSideDominance: { X: number; Y: number; BALANCED: number };
  avgCushionDepth: number;
  absorptionCoverageRatio: number;
  deepestBin: { binId: number; capacityUsd: number } | null;
  thinnestBin: { binId: number; capacityUsd: number } | null;
}

interface AbsorptionAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  profile: AbsorptionProfile;
  bins: BinAbsorption[];
  asciiMap: string;
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

// -- Absorption analysis ------------------------------------------------------

function computeCushionDepth(
  bins: BinReserves[],
  idx: number,
  direction: "left" | "right"
): number {
  let depth = 0;
  const step = direction === "left" ? -1 : 1;
  let pos = idx + step;
  while (pos >= 0 && pos < bins.length && bins[pos].totalUsd > 0.01) {
    depth++;
    pos += step;
  }
  return depth;
}

function computeFlowResistance(
  binUsd: number,
  populatedBins: number,
  volume24h: number
): number {
  if (binUsd < 0.01) return 0;
  const volumePerBin = volume24h / Math.max(populatedBins, 1);
  if (volumePerBin < 0.01) return 100;
  const ratio = binUsd / volumePerBin;
  return Math.min(100, Math.round(ratio * 20));
}

function computeBinAbsorption(
  bins: BinReserves[],
  idx: number,
  activeBinId: number,
  volume24h: number
): BinAbsorption {
  const bin = bins[idx];
  const offset = bin.binId - activeBinId;

  const absorptionCapacity = Math.min(bin.reserveXUsd, bin.reserveYUsd) * 2;
  const totalUsd = bin.totalUsd;

  let balanceRatio = 0;
  if (totalUsd > 0.01) {
    const smaller = Math.min(bin.reserveXUsd, bin.reserveYUsd);
    const larger = Math.max(bin.reserveXUsd, bin.reserveYUsd);
    balanceRatio = larger > 0 ? Math.round((smaller / larger) * 100) / 100 : 0;
  }

  let weakSide: "X" | "Y" | "BALANCED" = "BALANCED";
  if (totalUsd > 0.01) {
    const diff = Math.abs(bin.reserveXUsd - bin.reserveYUsd);
    if (diff / totalUsd > 0.2) {
      weakSide = bin.reserveXUsd < bin.reserveYUsd ? "X" : "Y";
    }
  }

  const depletionRiskPct = totalUsd > 0.01
    ? Math.round((1 - balanceRatio) * 100)
    : 100;

  const cushionLeft = computeCushionDepth(bins, idx, "left");
  const cushionRight = computeCushionDepth(bins, idx, "right");

  const populatedCount = bins.filter(b => b.totalUsd > 0.01).length;
  const flowResistance = computeFlowResistance(totalUsd, populatedCount, volume24h);

  const depthComponent = Math.min(30, (absorptionCapacity / Math.max(totalUsd, 0.01)) * 30);
  const balanceComponent = balanceRatio * 25;
  const cushionComponent = Math.min(20, ((cushionLeft + cushionRight) / 2) * 2.5);
  const flowComponent = flowResistance * 0.25;
  const distancePenalty = Math.min(Math.abs(offset) * 2, 20);

  let rawScore = depthComponent + balanceComponent + cushionComponent + flowComponent - distancePenalty;
  if (totalUsd < 0.01) rawScore = 0;
  const absorptionScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  let absorptionClass: AbsorptionClass;
  if (absorptionScore >= 80) absorptionClass = "FORTRESS";
  else if (absorptionScore >= 60) absorptionClass = "ROBUST";
  else if (absorptionScore >= 40) absorptionClass = "ADEQUATE";
  else if (absorptionScore >= 20) absorptionClass = "THIN";
  else absorptionClass = "FRAGILE";

  return {
    binId: bin.binId,
    offset,
    reserveUsd: Math.round(totalUsd * 100) / 100,
    reserveXUsd: Math.round(bin.reserveXUsd * 100) / 100,
    reserveYUsd: Math.round(bin.reserveYUsd * 100) / 100,
    absorptionCapacityUsd: Math.round(absorptionCapacity * 100) / 100,
    balanceRatio,
    cushionDepthLeft: cushionLeft,
    cushionDepthRight: cushionRight,
    flowResistance,
    absorptionScore,
    absorptionClass,
    weakSide,
    depletionRiskPct,
  };
}

function computeGini(values: number[]): number {
  if (values.length <= 1) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  if (mean === 0) return 0;

  let sumDiff = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumDiff += Math.abs(sorted[i] - sorted[j]);
    }
  }
  return Math.round((sumDiff / (2 * n * n * mean)) * 100) / 100;
}

function buildProfile(allAbsorption: BinAbsorption[], volume24h: number): AbsorptionProfile {
  const populated = allAbsorption.filter(b => b.reserveUsd > 0.01);
  if (populated.length === 0) {
    return {
      totalBins: allAbsorption.length,
      populatedBins: 0,
      fortressBins: 0,
      fragileBins: 0,
      avgAbsorptionScore: 0,
      medianAbsorptionScore: 0,
      absorptionGini: 0,
      totalAbsorptionCapacityUsd: 0,
      avgBalanceRatio: 0,
      maxSingleTradeUsd: 0,
      weakSideDominance: { X: 0, Y: 0, BALANCED: 0 },
      avgCushionDepth: 0,
      absorptionCoverageRatio: 0,
      deepestBin: null,
      thinnestBin: null,
    };
  }

  const scores = populated.map(b => b.absorptionScore).sort((a, b) => a - b);
  const avg = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
  const median = scores[Math.floor(scores.length / 2)];
  const gini = computeGini(scores);

  const fortress = populated.filter(b => b.absorptionClass === "FORTRESS").length;
  const fragile = populated.filter(b => b.absorptionClass === "FRAGILE").length;

  const totalCapacity = populated.reduce((s, b) => s + b.absorptionCapacityUsd, 0);
  const avgBalance = Math.round(
    (populated.reduce((s, b) => s + b.balanceRatio, 0) / populated.length) * 100
  ) / 100;

  const maxTrade = Math.max(...populated.map(b => b.absorptionCapacityUsd));

  const weakSides = { X: 0, Y: 0, BALANCED: 0 };
  for (const b of populated) weakSides[b.weakSide]++;

  const avgCushion = Math.round(
    (populated.reduce((s, b) => s + (b.cushionDepthLeft + b.cushionDepthRight) / 2, 0) /
      populated.length) * 10
  ) / 10;

  const coverageRatio = volume24h > 0
    ? Math.round((totalCapacity / volume24h) * 100) / 100
    : 0;

  const deepest = populated.reduce((max, b) =>
    b.absorptionCapacityUsd > max.absorptionCapacityUsd ? b : max);
  const thinnest = populated.reduce((min, b) =>
    b.absorptionCapacityUsd < min.absorptionCapacityUsd ? b : min);

  return {
    totalBins: allAbsorption.length,
    populatedBins: populated.length,
    fortressBins: fortress,
    fragileBins: fragile,
    avgAbsorptionScore: avg,
    medianAbsorptionScore: median,
    absorptionGini: gini,
    totalAbsorptionCapacityUsd: Math.round(totalCapacity * 100) / 100,
    avgBalanceRatio: avgBalance,
    maxSingleTradeUsd: Math.round(maxTrade * 100) / 100,
    weakSideDominance: weakSides,
    avgCushionDepth: avgCushion,
    absorptionCoverageRatio: coverageRatio,
    deepestBin: { binId: deepest.binId, capacityUsd: deepest.absorptionCapacityUsd },
    thinnestBin: { binId: thinnest.binId, capacityUsd: thinnest.absorptionCapacityUsd },
  };
}

function buildAsciiMap(allAbsorption: BinAbsorption[], activeBinId: number): string {
  const populated = allAbsorption.filter(b => b.reserveUsd > 0.01);
  if (populated.length === 0) return "(no populated bins)";

  const maxScore = Math.max(...populated.map(b => b.absorptionScore), 1);
  const barWidth = 30;
  const lines: string[] = ["ABSORPTION MAP", ""];

  for (const bin of populated) {
    const offset = bin.binId - activeBinId;
    const len = Math.max(1, Math.round((bin.absorptionScore / maxScore) * barWidth));

    let marker = " ";
    if (bin.binId === activeBinId) marker = "*";
    else if (bin.absorptionClass === "FRAGILE") marker = "!";
    else if (bin.absorptionClass === "FORTRESS") marker = "#";

    const bar = bin.absorptionClass === "FRAGILE"
      ? "░".repeat(len)
      : bin.absorptionClass === "FORTRESS"
        ? "█".repeat(len)
        : "▒".repeat(len);

    const side = bin.weakSide === "BALANCED" ? "=" : bin.weakSide === "X" ? "<" : ">";
    const label = `${offset >= 0 ? "+" : ""}${offset}`;
    lines.push(
      `${label.padStart(4)} ${marker} ${bar} a=${bin.absorptionScore} $${fmtUsd(bin.absorptionCapacityUsd)} ${side} [${bin.absorptionClass}]`
    );
  }

  lines.push("");
  lines.push("* = active  # = fortress  ! = fragile  < = weak X  > = weak Y  = = balanced");
  lines.push("█ = fortress  ▒ = normal  ░ = fragile");
  return lines.join("\n");
}

function buildRecommendation(
  pair: string,
  profile: AbsorptionProfile,
  volume24h: number
): string {
  const parts: string[] = [];

  parts.push(
    `${pair} absorption profile: avg score ${profile.avgAbsorptionScore}/100, ` +
    `${profile.fortressBins} fortress bins, ${profile.fragileBins} fragile bins.`
  );

  if (profile.absorptionCoverageRatio > 0) {
    parts.push(
      `Total absorption capacity $${fmtUsd(profile.totalAbsorptionCapacityUsd)} ` +
      `covers ${profile.absorptionCoverageRatio}x daily volume.`
    );
  }

  if (profile.avgBalanceRatio < 0.3) {
    parts.push(
      `WARNING: Low average balance ratio (${profile.avgBalanceRatio}) — bins are heavily skewed, ` +
      `reducing effective absorption capacity.`
    );
  }

  if (profile.fragileBins > profile.populatedBins * 0.4) {
    parts.push(
      `WARNING: ${Math.round((profile.fragileBins / profile.populatedBins) * 100)}% of bins are fragile — ` +
      `large trades will cascade through multiple bins causing high slippage.`
    );
  }

  const { X, Y, BALANCED } = profile.weakSideDominance;
  if (X > Y * 2 && X > BALANCED) {
    parts.push(`Pool is X-side weak — better at absorbing sells than buys.`);
  } else if (Y > X * 2 && Y > BALANCED) {
    parts.push(`Pool is Y-side weak — better at absorbing buys than sells.`);
  }

  if (profile.absorptionGini > 0.5) {
    parts.push(
      `High absorption inequality (Gini ${profile.absorptionGini}) — capacity concentrated in few bins.`
    );
  }

  if (profile.avgCushionDepth >= 8) {
    parts.push("Deep cushion across bins — cascading trades have ample backup liquidity.");
  } else if (profile.avgCushionDepth <= 3) {
    parts.push("Shallow cushion — large trades may quickly exhaust available absorption depth.");
  }

  if (profile.avgAbsorptionScore >= 60) {
    parts.push("Strong absorption — pool handles large trades with minimal slippage. Favorable for concentrated LP.");
  } else if (profile.avgAbsorptionScore >= 40) {
    parts.push("Moderate absorption — adequate for typical trade sizes but watch for large single trades.");
  } else {
    parts.push("Weak absorption — pool is vulnerable to large trades. LPs should use wider ranges for protection.");
  }

  return parts.join(" ");
}

// -- Main analysis ------------------------------------------------------------

async function analyzeAbsorption(pool: AppPool): Promise<AbsorptionAnalysis> {
  const poolId = pool.poolId!;
  const activeBinId = pool.activeBinId ?? await getActiveBin(poolId);
  const rawBins = await scanBins(poolId, activeBinId, pool, BIN_SCAN_RADIUS);

  const populated = rawBins.filter(b => b.totalUsd > 0.01);
  const scannedTvl = populated.reduce((s, b) => s + b.totalUsd, 0);

  const allAbsorption: BinAbsorption[] = rawBins.map((_, idx) =>
    computeBinAbsorption(rawBins, idx, activeBinId, pool.volume24hUsd)
  );

  const profile = buildProfile(allAbsorption, pool.volume24hUsd);
  const asciiMap = buildAsciiMap(allAbsorption, activeBinId);
  const recommendation = buildRecommendation(
    `${pool.token0Symbol}/${pool.token1Symbol}`,
    profile,
    pool.volume24hUsd
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
    bins: allAbsorption.filter(b => b.reserveUsd > 0.01).slice(0, 30),
    asciiMap,
    recommendation,
  };
}

function makeErrorResult(pool: AppPool, errMsg: string): AbsorptionAnalysis {
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
      totalBins: 0,
      populatedBins: 0,
      fortressBins: 0,
      fragileBins: 0,
      avgAbsorptionScore: 0,
      medianAbsorptionScore: 0,
      absorptionGini: 0,
      totalAbsorptionCapacityUsd: 0,
      avgBalanceRatio: 0,
      maxSingleTradeUsd: 0,
      weakSideDominance: { X: 0, Y: 0, BALANCED: 0 },
      avgCushionDepth: 0,
      absorptionCoverageRatio: 0,
      deepestBin: null,
      thinnestBin: null,
    },
    bins: [],
    asciiMap: "",
    recommendation: `Analysis failed: ${errMsg}`,
  };
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();

program
  .name("hodlmm-bin-absorption")
  .description("HODLMM Bin Absorption Analyzer — measures trade absorption capacity per bin");

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
        },
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Doctor failed: ${err.message}` }));
    }
  });

program
  .command("run")
  .description("Analyze bin absorption for top HODLMM pools")
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

      const results: AbsorptionAnalysis[] = [];
      for (const pool of targets) {
        try {
          const analysis = await analyzeAbsorption(pool);
          results.push(analysis);
        } catch (err: any) {
          results.push(makeErrorResult(pool, err.message));
        }
      }

      const summary = {
        poolsAnalyzed: results.length,
        highestAbsorption: results.reduce((max, r) =>
          r.profile.avgAbsorptionScore > max.profile.avgAbsorptionScore ? r : max, results[0]),
        lowestAbsorption: results.reduce((min, r) =>
          r.profile.avgAbsorptionScore < min.profile.avgAbsorptionScore ? r : min, results[0]),
        avgAbsorptionScore: Math.round(
          results.reduce((s, r) => s + r.profile.avgAbsorptionScore, 0) / results.length
        ),
        totalFortressBins: results.reduce((s, r) => s + r.profile.fortressBins, 0),
        totalFragileBins: results.reduce((s, r) => s + r.profile.fragileBins, 0),
        totalAbsorptionCapacityUsd: Math.round(
          results.reduce((s, r) => s + r.profile.totalAbsorptionCapacityUsd, 0) * 100
        ) / 100,
      };

      console.log(JSON.stringify({
        result: "absorption_analysis",
        data: { pools: results, summary },
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Run failed: ${err.message}` }));
    }
  });

program
  .command("status")
  .description("Quick absorption summary for top pools")
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
          const analysis = await analyzeAbsorption(pool);
          summaries.push({
            pair: analysis.pair,
            poolId: analysis.poolId,
            tvlUsd: analysis.tvlUsd,
            avgAbsorption: analysis.profile.avgAbsorptionScore,
            fortressBins: analysis.profile.fortressBins,
            fragileBins: analysis.profile.fragileBins,
            totalCapacityUsd: analysis.profile.totalAbsorptionCapacityUsd,
            avgBalanceRatio: analysis.profile.avgBalanceRatio,
            coverageRatio: analysis.profile.absorptionCoverageRatio,
            avgCushionDepth: analysis.profile.avgCushionDepth,
            gini: analysis.profile.absorptionGini,
          });
        } catch {
          summaries.push({
            pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
            poolId: pool.poolId,
            tvlUsd: pool.tvlUsd,
            avgAbsorption: -1,
          });
        }
      }

      console.log(JSON.stringify({ result: "absorption_status", data: summaries }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Status failed: ${err.message}` }));
    }
  });

program.parse();
