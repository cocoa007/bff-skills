#!/usr/bin/env bun
/**
 * hodlmm-bin-inertia.ts
 *
 * HODLMM Bin Inertia Analyzer — Measures how resistant each bin's liquidity
 * is to state changes. High-inertia bins have sticky, committed liquidity that
 * persists through market movements. Low-inertia bins have flighty capital that
 * disappears under pressure. This helps LPs identify stable zones vs. tourist
 * liquidity that may vanish when most needed.
 *
 * Metrics:
 *  1. Reserve mass: absolute USD value acting as gravitational anchor
 *  2. Concentration ratio: bin's share of total scanned TVL (mass density)
 *  3. Neighbor coherence: how similar a bin's reserves are to its neighbors
 *  4. Distance penalty: bins far from active bin attract less trade flow
 *  5. Momentum resistance: capacity to absorb directional pressure
 *  6. Inertia score (0-100): composite measure of liquidity stickiness
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 89).
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 25;
const COHERENCE_RADIUS = 2;

type InertiaClass = "ANCHORED" | "STEADY" | "MODERATE" | "DRIFTING" | "VOLATILE";

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

interface BinInertia {
  binId: number;
  offset: number;
  reserveUsd: number;
  reserveMass: number;
  concentrationRatio: number;
  neighborCoherence: number;
  distancePenalty: number;
  momentumResistance: number;
  inertiaScore: number;
  inertiaClass: InertiaClass;
  isAnchor: boolean;
  isTourist: boolean;
}

interface InertiaProfile {
  totalBins: number;
  populatedBins: number;
  anchoredBins: number;
  touristBins: number;
  avgInertiaScore: number;
  medianInertiaScore: number;
  inertiaGini: number;
  massConcentrationTop5: number;
  stableCoreWidthBins: number;
  touristFraction: number;
  highestInertiaBin: { binId: number; score: number } | null;
  lowestInertiaBin: { binId: number; score: number } | null;
}

interface InertiaAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  profile: InertiaProfile;
  bins: BinInertia[];
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

// -- Inertia analysis ---------------------------------------------------------

const ANCHOR_THRESHOLD = 70;
const TOURIST_THRESHOLD = 25;

function computeNeighborCoherence(
  bins: BinReserves[],
  idx: number,
  radius: number
): number {
  const center = bins[idx].totalUsd;
  if (center < 0.01) return 0;

  let totalDiff = 0;
  let count = 0;
  for (let d = 1; d <= radius; d++) {
    if (idx - d >= 0 && bins[idx - d].totalUsd > 0.01) {
      totalDiff += Math.abs(bins[idx - d].totalUsd - center) / center;
      count++;
    }
    if (idx + d < bins.length && bins[idx + d].totalUsd > 0.01) {
      totalDiff += Math.abs(bins[idx + d].totalUsd - center) / center;
      count++;
    }
  }
  if (count === 0) return 0;
  const avgRelDiff = totalDiff / count;
  return Math.max(0, Math.min(100, Math.round((1 - Math.min(avgRelDiff, 1)) * 100)));
}

function computeMomentumResistance(
  bins: BinReserves[],
  idx: number,
  scannedTvl: number,
  volume24h: number
): number {
  const bin = bins[idx];
  if (bin.totalUsd < 0.01) return 0;

  const volumePerBin = volume24h / Math.max(bins.filter(b => b.totalUsd > 0.01).length, 1);
  if (volumePerBin < 0.01) return bin.totalUsd > 0 ? 100 : 0;

  const ratio = bin.totalUsd / volumePerBin;
  return Math.min(100, Math.round(ratio * 25));
}

function computeBinInertia(
  bins: BinReserves[],
  idx: number,
  activeBinId: number,
  scannedTvl: number,
  volume24h: number
): BinInertia {
  const bin = bins[idx];
  const offset = bin.binId - activeBinId;

  const reserveMass = bin.totalUsd;
  const concentrationRatio = scannedTvl > 0
    ? Math.round((bin.totalUsd / scannedTvl) * 10000) / 100
    : 0;

  const neighborCoherence = computeNeighborCoherence(bins, idx, COHERENCE_RADIUS);

  const absOffset = Math.abs(offset);
  const distancePenalty = Math.min(absOffset * 3, 50);

  const momentumResistance = computeMomentumResistance(bins, idx, scannedTvl, volume24h);

  const massComponent = Math.min(concentrationRatio * 10, 30);
  const coherenceComponent = neighborCoherence * 0.25;
  const resistanceComponent = momentumResistance * 0.2;
  const distanceDeduction = distancePenalty * 0.25;

  let rawScore = massComponent + coherenceComponent + resistanceComponent - distanceDeduction;
  const inertiaScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  let inertiaClass: InertiaClass;
  if (inertiaScore >= 80) inertiaClass = "ANCHORED";
  else if (inertiaScore >= 60) inertiaClass = "STEADY";
  else if (inertiaScore >= 40) inertiaClass = "MODERATE";
  else if (inertiaScore >= 25) inertiaClass = "DRIFTING";
  else inertiaClass = "VOLATILE";

  return {
    binId: bin.binId,
    offset,
    reserveUsd: Math.round(reserveMass * 100) / 100,
    reserveMass: Math.round(reserveMass * 100) / 100,
    concentrationRatio,
    neighborCoherence,
    distancePenalty: Math.round(distancePenalty * 100) / 100,
    momentumResistance,
    inertiaScore,
    inertiaClass,
    isAnchor: inertiaScore >= ANCHOR_THRESHOLD,
    isTourist: inertiaScore < TOURIST_THRESHOLD && bin.totalUsd > 0.01,
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

function buildProfile(allInertia: BinInertia[]): InertiaProfile {
  const populated = allInertia.filter(b => b.reserveUsd > 0.01);
  if (populated.length === 0) {
    return {
      totalBins: allInertia.length,
      populatedBins: 0,
      anchoredBins: 0,
      touristBins: 0,
      avgInertiaScore: 0,
      medianInertiaScore: 0,
      inertiaGini: 0,
      massConcentrationTop5: 0,
      stableCoreWidthBins: 0,
      touristFraction: 0,
      highestInertiaBin: null,
      lowestInertiaBin: null,
    };
  }

  const scores = populated.map(b => b.inertiaScore).sort((a, b) => a - b);
  const avg = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
  const median = scores[Math.floor(scores.length / 2)];
  const gini = computeGini(scores);

  const anchored = populated.filter(b => b.isAnchor).length;
  const tourist = populated.filter(b => b.isTourist).length;

  const topMasses = populated
    .sort((a, b) => b.reserveUsd - a.reserveUsd)
    .slice(0, 5);
  const totalMass = populated.reduce((s, b) => s + b.reserveUsd, 0);
  const top5Concentration = totalMass > 0
    ? Math.round((topMasses.reduce((s, b) => s + b.reserveUsd, 0) / totalMass) * 100)
    : 0;

  const stableCore = populated.filter(b => b.inertiaScore >= 40).length;

  const highest = populated.reduce((max, b) => b.inertiaScore > max.inertiaScore ? b : max);
  const lowest = populated.reduce((min, b) => b.inertiaScore < min.inertiaScore ? b : min);

  return {
    totalBins: allInertia.length,
    populatedBins: populated.length,
    anchoredBins: anchored,
    touristBins: tourist,
    avgInertiaScore: avg,
    medianInertiaScore: median,
    inertiaGini: gini,
    massConcentrationTop5: top5Concentration,
    stableCoreWidthBins: stableCore,
    touristFraction: populated.length > 0
      ? Math.round((tourist / populated.length) * 100)
      : 0,
    highestInertiaBin: { binId: highest.binId, score: highest.inertiaScore },
    lowestInertiaBin: { binId: lowest.binId, score: lowest.inertiaScore },
  };
}

function buildAsciiMap(allInertia: BinInertia[], activeBinId: number): string {
  const populated = allInertia.filter(b => b.reserveUsd > 0.01);
  if (populated.length === 0) return "(no populated bins)";

  const maxScore = Math.max(...populated.map(b => b.inertiaScore), 1);
  const barWidth = 30;
  const lines: string[] = ["INERTIA MAP", ""];

  for (const bin of populated) {
    const offset = bin.binId - activeBinId;
    const len = Math.max(1, Math.round((bin.inertiaScore / maxScore) * barWidth));

    let marker = " ";
    if (bin.binId === activeBinId) marker = "*";
    else if (bin.isTourist) marker = "~";
    else if (bin.isAnchor) marker = "#";

    const bar = bin.isTourist
      ? "░".repeat(len)
      : bin.isAnchor
        ? "█".repeat(len)
        : "▒".repeat(len);

    const label = `${offset >= 0 ? "+" : ""}${offset}`;
    lines.push(
      `${label.padStart(4)} ${marker} ${bar} i=${bin.inertiaScore} $${fmtUsd(bin.reserveUsd)} [${bin.inertiaClass}]`
    );
  }

  lines.push("");
  lines.push("* = active  # = anchored  ~ = tourist  █ = anchored  ▒ = normal  ░ = tourist");
  return lines.join("\n");
}

function buildRecommendation(
  pair: string,
  profile: InertiaProfile,
  volume24h: number,
  scannedTvl: number
): string {
  const parts: string[] = [];

  parts.push(
    `${pair} inertia profile: avg score ${profile.avgInertiaScore}/100, ` +
    `${profile.anchoredBins} anchored bins, ${profile.touristBins} tourist bins.`
  );

  if (profile.touristFraction > 40) {
    parts.push(
      `WARNING: ${profile.touristFraction}% of liquidity is tourist capital — may flee during volatility.`
    );
  }

  if (profile.inertiaGini > 0.5) {
    parts.push(
      `High inertia inequality (Gini ${profile.inertiaGini}) — stability is concentrated in few bins.`
    );
  }

  if (profile.massConcentrationTop5 > 80) {
    parts.push(
      `Top 5 bins hold ${profile.massConcentrationTop5}% of mass — concentrated but potentially fragile if those bins withdraw.`
    );
  }

  if (profile.stableCoreWidthBins >= 10) {
    parts.push(
      `Stable core spans ${profile.stableCoreWidthBins} bins — broad, reliable liquidity base for trading.`
    );
  } else if (profile.stableCoreWidthBins <= 3) {
    parts.push(
      `Narrow stable core (${profile.stableCoreWidthBins} bins) — thin reliable liquidity, watch for gaps.`
    );
  }

  if (profile.avgInertiaScore >= 60) {
    parts.push("High overall inertia — liquidity appears sticky and committed. Good for concentrated LP.");
  } else if (profile.avgInertiaScore >= 40) {
    parts.push("Moderate inertia — reasonable stability, but monitor tourist bins during market stress.");
  } else {
    parts.push("Low inertia — flighty liquidity dominates. Consider wider ranges to buffer against sudden withdrawals.");
  }

  return parts.join(" ");
}

// -- Main analysis ------------------------------------------------------------

async function analyzeInertia(pool: AppPool): Promise<InertiaAnalysis> {
  const poolId = pool.poolId!;
  const activeBinId = pool.activeBinId ?? await getActiveBin(poolId);
  const rawBins = await scanBins(poolId, activeBinId, pool, BIN_SCAN_RADIUS);

  const populated = rawBins.filter(b => b.totalUsd > 0.01);
  const scannedTvl = populated.reduce((s, b) => s + b.totalUsd, 0);

  const allInertia: BinInertia[] = rawBins.map((_, idx) =>
    computeBinInertia(rawBins, idx, activeBinId, scannedTvl, pool.volume24hUsd)
  );

  const profile = buildProfile(allInertia);
  const asciiMap = buildAsciiMap(allInertia, activeBinId);
  const recommendation = buildRecommendation(
    `${pool.token0Symbol}/${pool.token1Symbol}`,
    profile,
    pool.volume24hUsd,
    scannedTvl
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
    bins: allInertia.filter(b => b.reserveUsd > 0.01).slice(0, 30),
    asciiMap,
    recommendation,
  };
}

function makeErrorResult(pool: AppPool, errMsg: string): InertiaAnalysis {
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
      anchoredBins: 0,
      touristBins: 0,
      avgInertiaScore: 0,
      medianInertiaScore: 0,
      inertiaGini: 0,
      massConcentrationTop5: 0,
      stableCoreWidthBins: 0,
      touristFraction: 0,
      highestInertiaBin: null,
      lowestInertiaBin: null,
    },
    bins: [],
    asciiMap: "",
    recommendation: `Analysis failed: ${errMsg}`,
  };
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();

program
  .name("hodlmm-bin-inertia")
  .description("HODLMM Bin Inertia Analyzer — measures liquidity stickiness and commitment");

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
          coherenceRadius: COHERENCE_RADIUS,
        },
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Doctor failed: ${err.message}` }));
    }
  });

program
  .command("run")
  .description("Analyze bin inertia for top HODLMM pools")
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

      const results: InertiaAnalysis[] = [];
      for (const pool of targets) {
        try {
          const analysis = await analyzeInertia(pool);
          results.push(analysis);
        } catch (err: any) {
          results.push(makeErrorResult(pool, err.message));
        }
      }

      const summary = {
        poolsAnalyzed: results.length,
        highestInertia: results.reduce((max, r) =>
          r.profile.avgInertiaScore > max.profile.avgInertiaScore ? r : max, results[0]),
        lowestInertia: results.reduce((min, r) =>
          r.profile.avgInertiaScore < min.profile.avgInertiaScore ? r : min, results[0]),
        avgInertiaScore: Math.round(
          results.reduce((s, r) => s + r.profile.avgInertiaScore, 0) / results.length
        ),
        totalAnchoredBins: results.reduce((s, r) => s + r.profile.anchoredBins, 0),
        totalTouristBins: results.reduce((s, r) => s + r.profile.touristBins, 0),
      };

      console.log(JSON.stringify({
        result: "inertia_analysis",
        data: { pools: results, summary },
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Run failed: ${err.message}` }));
    }
  });

program
  .command("status")
  .description("Quick inertia summary for top pools")
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
          const analysis = await analyzeInertia(pool);
          summaries.push({
            pair: analysis.pair,
            poolId: analysis.poolId,
            tvlUsd: analysis.tvlUsd,
            avgInertia: analysis.profile.avgInertiaScore,
            anchoredBins: analysis.profile.anchoredBins,
            touristBins: analysis.profile.touristBins,
            touristFraction: `${analysis.profile.touristFraction}%`,
            stableCoreWidth: analysis.profile.stableCoreWidthBins,
            gini: analysis.profile.inertiaGini,
            top5MassConcentration: `${analysis.profile.massConcentrationTop5}%`,
          });
        } catch {
          summaries.push({
            pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
            poolId: pool.poolId,
            tvlUsd: pool.tvlUsd,
            avgInertia: -1,
          });
        }
      }

      console.log(JSON.stringify({ result: "inertia_status", data: summaries }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Status failed: ${err.message}` }));
    }
  });

program.parse();
