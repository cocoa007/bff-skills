#!/usr/bin/env bun
/**
 * hodlmm-bin-cascade.ts
 *
 * HODLMM Bin Cascade Risk Analyzer — Measures how liquidity depletion in one
 * bin would propagate to neighbors, identifying cascade vulnerability zones.
 * When a large trade drains the active bin, the next bin absorbs the overflow.
 * Thin neighbor bins create "cascade chains" where price moves accelerate
 * through multiple bins rapidly, causing outsized slippage.
 *
 * Metrics:
 *  1. Cascade depth: how many consecutive bins a trade would traverse
 *  2. Cascade velocity: speed of propagation (inverse of resistance)
 *  3. Absorption capacity: how much USD each bin can absorb before depleting
 *  4. Vulnerability zones: thin-bin sequences that amplify price impact
 *  5. Asymmetry: bid-side vs ask-side cascade risk comparison
 *  6. Cascade risk score (0-100): composite fragility measure
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 87).
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 25;

type CascadeRisk = "CRITICAL" | "HIGH" | "MODERATE" | "LOW" | "MINIMAL";
type CascadeDirection = "BID" | "ASK";

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

interface CascadeStep {
  binId: number;
  offset: number;
  absorptionUsd: number;
  cumulativeUsd: number;
  resistanceFactor: number;
  isThin: boolean;
  isGap: boolean;
}

interface CascadeChain {
  direction: CascadeDirection;
  steps: CascadeStep[];
  depth: number;
  totalAbsorptionUsd: number;
  thinBinCount: number;
  gapCount: number;
  velocityScore: number;
  worstStretchStart: number;
  worstStretchEnd: number;
  worstStretchDepth: number;
}

interface VulnerabilityZone {
  startBin: number;
  endBin: number;
  width: number;
  direction: CascadeDirection;
  avgAbsorptionUsd: number;
  totalAbsorptionUsd: number;
  thinBinRatio: number;
  severity: CascadeRisk;
}

interface CascadeAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  bidCascade: CascadeChain;
  askCascade: CascadeChain;
  asymmetryRatio: number;
  asymmetryDirection: string;
  vulnerabilityZones: VulnerabilityZone[];
  cascadeRiskScore: number;
  cascadeRisk: CascadeRisk;
  maxSingleTradeUsd: number;
  tradeToBreachActive: number;
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

// -- Cascade analysis ---------------------------------------------------------

const THIN_BIN_THRESHOLD_PCT = 2;
const GAP_THRESHOLD_USD = 0.01;

function buildCascadeChain(
  bins: BinReserves[],
  activeBinId: number,
  direction: CascadeDirection,
  scannedTvl: number
): CascadeChain {
  const sorted = direction === "BID"
    ? [...bins].filter(b => b.binId <= activeBinId).sort((a, b) => b.binId - a.binId)
    : [...bins].filter(b => b.binId >= activeBinId).sort((a, b) => a.binId - b.binId);

  const thinThreshold = scannedTvl * (THIN_BIN_THRESHOLD_PCT / 100);
  let cumulative = 0;
  const steps: CascadeStep[] = [];

  for (const bin of sorted) {
    const offset = bin.binId - activeBinId;
    const absorption = direction === "BID" ? bin.reserveYUsd : bin.reserveXUsd;
    cumulative += absorption;

    const isGap = bin.totalUsd < GAP_THRESHOLD_USD;
    const isThin = !isGap && absorption < thinThreshold;
    const resistance = isGap ? 0 : isThin ? 0.3 : Math.min(absorption / Math.max(thinThreshold, 1), 3);

    steps.push({
      binId: bin.binId,
      offset,
      absorptionUsd: absorption,
      cumulativeUsd: cumulative,
      resistanceFactor: Math.round(resistance * 100) / 100,
      isThin,
      isGap,
    });
  }

  const thinCount = steps.filter(s => s.isThin).length;
  const gapCount = steps.filter(s => s.isGap).length;

  const totalResistance = steps.reduce((s, st) => s + st.resistanceFactor, 0);
  const maxResistance = steps.length * 3;
  const velocityScore = maxResistance > 0
    ? Math.round((1 - totalResistance / maxResistance) * 100)
    : 100;

  const { start: wsStart, end: wsEnd, depth: wsDepth } = findWorstStretch(steps);

  return {
    direction,
    steps,
    depth: steps.length,
    totalAbsorptionUsd: cumulative,
    thinBinCount: thinCount,
    gapCount,
    velocityScore,
    worstStretchStart: wsStart,
    worstStretchEnd: wsEnd,
    worstStretchDepth: wsDepth,
  };
}

function findWorstStretch(steps: CascadeStep[]): { start: number; end: number; depth: number } {
  let maxLen = 0;
  let maxStart = 0;
  let maxEnd = 0;
  let curStart = 0;
  let curLen = 0;

  for (let i = 0; i < steps.length; i++) {
    if (steps[i].isThin || steps[i].isGap) {
      if (curLen === 0) curStart = steps[i].binId;
      curLen++;
      if (curLen > maxLen) {
        maxLen = curLen;
        maxStart = curStart;
        maxEnd = steps[i].binId;
      }
    } else {
      curLen = 0;
    }
  }

  return { start: maxStart, end: maxEnd, depth: maxLen };
}

function detectVulnerabilityZones(
  bidChain: CascadeChain,
  askChain: CascadeChain,
  scannedTvl: number
): VulnerabilityZone[] {
  const zones: VulnerabilityZone[] = [];

  for (const chain of [bidChain, askChain]) {
    let currentZone: CascadeStep[] = [];
    for (const step of chain.steps) {
      if (step.isThin || step.isGap) {
        currentZone.push(step);
      } else {
        if (currentZone.length >= 2) {
          zones.push(buildVulnZone(currentZone, chain.direction, scannedTvl));
        }
        currentZone = [];
      }
    }
    if (currentZone.length >= 2) {
      zones.push(buildVulnZone(currentZone, chain.direction, scannedTvl));
    }
  }

  return zones.sort((a, b) => a.avgAbsorptionUsd - b.avgAbsorptionUsd).slice(0, 6);
}

function buildVulnZone(
  steps: CascadeStep[],
  direction: CascadeDirection,
  scannedTvl: number
): VulnerabilityZone {
  const binIds = steps.map(s => s.binId);
  const start = Math.min(...binIds);
  const end = Math.max(...binIds);
  const totalAbs = steps.reduce((s, st) => s + st.absorptionUsd, 0);
  const avgAbs = totalAbs / steps.length;
  const thinRatio = steps.filter(s => s.isThin || s.isGap).length / steps.length;

  let severity: CascadeRisk;
  if (avgAbs < scannedTvl * 0.005 && steps.length >= 4) severity = "CRITICAL";
  else if (avgAbs < scannedTvl * 0.01 && steps.length >= 3) severity = "HIGH";
  else if (avgAbs < scannedTvl * 0.02) severity = "MODERATE";
  else severity = "LOW";

  return {
    startBin: start,
    endBin: end,
    width: end - start + 1,
    direction,
    avgAbsorptionUsd: Math.round(avgAbs * 100) / 100,
    totalAbsorptionUsd: Math.round(totalAbs * 100) / 100,
    thinBinRatio: Math.round(thinRatio * 1000) / 1000,
    severity,
  };
}

function computeCascadeRiskScore(
  bidChain: CascadeChain,
  askChain: CascadeChain,
  vulnZones: VulnerabilityZone[],
  scannedTvl: number,
  volume24hUsd: number
): number {
  const avgVelocity = (bidChain.velocityScore + askChain.velocityScore) / 2;
  const velocityComponent = avgVelocity * 0.3;

  const totalThin = bidChain.thinBinCount + askChain.thinBinCount;
  const totalBins = bidChain.depth + askChain.depth;
  const thinRatio = totalBins > 0 ? totalThin / totalBins : 0;
  const thinComponent = Math.min(thinRatio * 100, 30) * 0.3;

  const criticalZones = vulnZones.filter(z => z.severity === "CRITICAL").length;
  const highZones = vulnZones.filter(z => z.severity === "HIGH").length;
  const zoneComponent = Math.min((criticalZones * 15 + highZones * 8), 25);

  const volumeRatio = scannedTvl > 0 ? volume24hUsd / scannedTvl : 0;
  const volumeComponent = Math.min(volumeRatio * 20, 15);

  return Math.min(Math.round(velocityComponent + thinComponent + zoneComponent + volumeComponent), 100);
}

function classifyCascadeRisk(score: number): CascadeRisk {
  if (score >= 75) return "CRITICAL";
  if (score >= 55) return "HIGH";
  if (score >= 35) return "MODERATE";
  if (score >= 15) return "LOW";
  return "MINIMAL";
}

function buildAsciiMap(
  bins: BinReserves[],
  activeBinId: number,
  bidChain: CascadeChain,
  askChain: CascadeChain
): string {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const populated = sorted.filter(b => b.totalUsd > 0.01);
  if (populated.length === 0) return "(no populated bins)";

  const maxUsd = Math.max(...populated.map(b => b.totalUsd));
  const barWidth = 30;
  const lines: string[] = ["CASCADE RISK MAP", ""];

  const bidSteps = new Map(bidChain.steps.map(s => [s.binId, s]));
  const askSteps = new Map(askChain.steps.map(s => [s.binId, s]));

  for (const bin of populated) {
    const offset = bin.binId - activeBinId;
    const len = Math.max(1, Math.round((bin.totalUsd / maxUsd) * barWidth));
    const step = bidSteps.get(bin.binId) ?? askSteps.get(bin.binId);

    let marker = " ";
    if (bin.binId === activeBinId) marker = "*";
    else if (step?.isGap) marker = "!";
    else if (step?.isThin) marker = "~";

    const bar = step?.isGap ? "░".repeat(len) : step?.isThin ? "▒".repeat(len) : "█".repeat(len);
    const label = `${offset >= 0 ? "+" : ""}${offset}`;
    lines.push(`${label.padStart(4)} ${marker} ${bar} $${fmtUsd(bin.totalUsd)}`);
  }

  lines.push("");
  lines.push("* = active bin  ~ = thin  ! = gap  █ = solid  ▒ = thin  ░ = gap");
  return lines.join("\n");
}

function buildRecommendation(
  score: number,
  risk: CascadeRisk,
  bidChain: CascadeChain,
  askChain: CascadeChain,
  vulnZones: VulnerabilityZone[],
  asymmetryRatio: number,
  pool: AppPool
): string {
  const parts: string[] = [];
  const pair = `${pool.token0Symbol}/${pool.token1Symbol}`;

  parts.push(`${pair} cascade risk: ${risk} (score ${score}/100).`);

  if (asymmetryRatio > 2) {
    const weaker = bidChain.velocityScore > askChain.velocityScore ? "BID" : "ASK";
    parts.push(`${weaker} side ${asymmetryRatio.toFixed(1)}x more vulnerable — cascades propagate faster there.`);
  }

  const critZones = vulnZones.filter(z => z.severity === "CRITICAL");
  if (critZones.length > 0) {
    parts.push(`${critZones.length} CRITICAL vulnerability zone(s) — thin/empty bin sequences that amplify price impact.`);
  }

  if (bidChain.worstStretchDepth >= 3 || askChain.worstStretchDepth >= 3) {
    const worse = bidChain.worstStretchDepth >= askChain.worstStretchDepth ? bidChain : askChain;
    parts.push(`Worst thin stretch: ${worse.worstStretchDepth} consecutive bins (${worse.direction} side, bins ${worse.worstStretchStart}–${worse.worstStretchEnd}).`);
  }

  if (score >= 55) {
    parts.push("LPs should consider tighter ranges or exit if volume doesn't justify the cascade exposure.");
  } else if (score >= 35) {
    parts.push("Monitor during high-volume periods — cascade risk increases under heavy flow.");
  } else {
    parts.push("Liquidity distribution provides adequate cascade resistance.");
  }

  return parts.join(" ");
}

// -- Main analysis ------------------------------------------------------------

async function analyzeCascade(pool: AppPool): Promise<CascadeAnalysis> {
  const poolId = pool.poolId!;
  const activeBinId = pool.activeBinId ?? await getActiveBin(poolId);
  const rawBins = await scanBins(poolId, activeBinId, pool, BIN_SCAN_RADIUS);

  const populated = rawBins.filter(b => b.totalUsd > 0.01);
  const scannedTvl = populated.reduce((s, b) => s + b.totalUsd, 0);

  const bidChain = buildCascadeChain(rawBins, activeBinId, "BID", scannedTvl);
  const askChain = buildCascadeChain(rawBins, activeBinId, "ASK", scannedTvl);

  const bidAbs = bidChain.totalAbsorptionUsd;
  const askAbs = askChain.totalAbsorptionUsd;
  const asymmetryRatio = Math.min(bidAbs, askAbs) > 0
    ? Math.max(bidAbs, askAbs) / Math.min(bidAbs, askAbs)
    : bidAbs + askAbs > 0 ? Infinity : 1;
  const asymmetryDirection = bidAbs > askAbs ? "BID-heavy" : bidAbs < askAbs ? "ASK-heavy" : "balanced";

  const vulnZones = detectVulnerabilityZones(bidChain, askChain, scannedTvl);
  const cascadeRiskScore = computeCascadeRiskScore(
    bidChain, askChain, vulnZones, scannedTvl, pool.volume24hUsd
  );
  const cascadeRisk = classifyCascadeRisk(cascadeRiskScore);

  const activeBin = rawBins.find(b => b.binId === activeBinId);
  const tradeToBreachActive = activeBin ? activeBin.totalUsd : 0;

  const maxSingleTradeUsd = Math.min(bidAbs, askAbs);

  const asciiMap = buildAsciiMap(rawBins, activeBinId, bidChain, askChain);
  const recommendation = buildRecommendation(
    cascadeRiskScore, cascadeRisk, bidChain, askChain, vulnZones, asymmetryRatio, pool
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
    bidCascade: {
      ...bidChain,
      steps: bidChain.steps.filter(s => s.absorptionUsd > 0 || s.isGap).slice(0, 15),
    },
    askCascade: {
      ...askChain,
      steps: askChain.steps.filter(s => s.absorptionUsd > 0 || s.isGap).slice(0, 15),
    },
    asymmetryRatio: Math.round(asymmetryRatio * 100) / 100,
    asymmetryDirection,
    vulnerabilityZones: vulnZones,
    cascadeRiskScore,
    cascadeRisk,
    maxSingleTradeUsd: Math.round(maxSingleTradeUsd * 100) / 100,
    tradeToBreachActive: Math.round(tradeToBreachActive * 100) / 100,
    recommendation,
    asciiMap,
  };
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();

program
  .name("hodlmm-bin-cascade")
  .description("HODLMM Bin Cascade Risk Analyzer — measures liquidity cascade propagation risk");

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
  .description("Analyze cascade risk for top HODLMM pools")
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

      const results: CascadeAnalysis[] = [];
      for (const pool of targets) {
        try {
          const analysis = await analyzeCascade(pool);
          results.push(analysis);
        } catch (err: any) {
          results.push({
            poolId: pool.poolId!,
            pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
            tvlUsd: pool.tvlUsd,
            volume24hUsd: pool.volume24hUsd,
            feeBps: pool.feeBps ?? 30,
            activeBinId: 0,
            binsScanned: 0,
            binsPopulated: 0,
            scannedTvlUsd: 0,
            bidCascade: { direction: "BID", steps: [], depth: 0, totalAbsorptionUsd: 0, thinBinCount: 0, gapCount: 0, velocityScore: 0, worstStretchStart: 0, worstStretchEnd: 0, worstStretchDepth: 0 },
            askCascade: { direction: "ASK", steps: [], depth: 0, totalAbsorptionUsd: 0, thinBinCount: 0, gapCount: 0, velocityScore: 0, worstStretchStart: 0, worstStretchEnd: 0, worstStretchDepth: 0 },
            asymmetryRatio: 1,
            asymmetryDirection: "unknown",
            vulnerabilityZones: [],
            cascadeRiskScore: 0,
            cascadeRisk: "MINIMAL",
            maxSingleTradeUsd: 0,
            tradeToBreachActive: 0,
            recommendation: `Analysis failed: ${err.message}`,
            asciiMap: "",
          });
        }
      }

      // Summary
      const summary = {
        poolsAnalyzed: results.length,
        highestRisk: results.reduce((max, r) => r.cascadeRiskScore > max.cascadeRiskScore ? r : max, results[0]),
        avgRiskScore: Math.round(results.reduce((s, r) => s + r.cascadeRiskScore, 0) / results.length),
        criticalZonesTotal: results.reduce((s, r) => s + r.vulnerabilityZones.filter(z => z.severity === "CRITICAL").length, 0),
      };

      console.log(JSON.stringify({
        result: "cascade_risk_analysis",
        data: { pools: results, summary },
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Run failed: ${err.message}` }));
    }
  });

program
  .command("status")
  .description("Quick cascade risk summary for top pools")
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
          const analysis = await analyzeCascade(pool);
          summaries.push({
            pair: analysis.pair,
            poolId: analysis.poolId,
            tvlUsd: analysis.tvlUsd,
            cascadeRisk: analysis.cascadeRisk,
            cascadeRiskScore: analysis.cascadeRiskScore,
            bidAbsorption: `$${fmtUsd(analysis.bidCascade.totalAbsorptionUsd)}`,
            askAbsorption: `$${fmtUsd(analysis.askCascade.totalAbsorptionUsd)}`,
            asymmetry: analysis.asymmetryDirection,
            vulnZones: analysis.vulnerabilityZones.length,
          });
        } catch {
          summaries.push({
            pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
            poolId: pool.poolId,
            tvlUsd: pool.tvlUsd,
            cascadeRisk: "UNKNOWN",
            cascadeRiskScore: -1,
          });
        }
      }

      console.log(JSON.stringify({ result: "cascade_status", data: summaries }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Status failed: ${err.message}` }));
    }
  });

program.parse();
