#!/usr/bin/env bun
/**
 * hodlmm-bin-equilibrium.ts
 *
 * HODLMM Bin Equilibrium Analyzer — Measures buy/sell pressure balance across
 * bin distributions. Identifies directional tilt in reserve placement, locates
 * equilibrium zones, and scores mean-reversion potential.
 *
 * Key metrics:
 *  - Buy/sell pressure ratio (token X vs token Y reserve weight)
 *  - Directional bias score (-100 to +100, negative=sell-heavy, positive=buy-heavy)
 *  - Equilibrium distance (how far the distribution is from balanced)
 *  - Reserve center-of-mass vs active bin (displacement signal)
 *  - Mean-reversion score (probability of price returning toward equilibrium)
 *  - Equilibrium zone detection (bins where reserves are most balanced)
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 74).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 25;

// ── Types ──────────────────────────────────────────────────────────────────────

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
  balanceRatio: number; // 0=all Y, 0.5=balanced, 1=all X
}

type BiasDirection = "STRONG_SELL" | "SELL" | "NEUTRAL" | "BUY" | "STRONG_BUY";
type EquilibriumGrade = "BALANCED" | "SLIGHT_TILT" | "TILTED" | "SKEWED" | "EXTREME";
type ReversionSignal = "STRONG_REVERT" | "LIKELY_REVERT" | "NEUTRAL" | "TREND_CONTINUE" | "STRONG_TREND";

interface EquilibriumZone {
  startBin: number;
  endBin: number;
  width: number;
  avgBalanceRatio: number;
  avgLiquidityUsd: number;
  distanceFromActive: number;
}

interface PressureProfile {
  leftBins: number;
  rightBins: number;
  leftTotalUsd: number;
  rightTotalUsd: number;
  leftAvgBalance: number;
  rightAvgBalance: number;
  leftDominantToken: string;
  rightDominantToken: string;
}

interface PoolEquilibriumAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  biasScore: number;
  biasDirection: BiasDirection;
  equilibriumDistance: number;
  equilibriumGrade: EquilibriumGrade;
  centerOfMass: number;
  displacement: number;
  reversionScore: number;
  reversionSignal: ReversionSignal;
  pressure: PressureProfile;
  equilibriumZones: EquilibriumZone[];
  recommendation: string;
  asciiChart: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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
  if (!resp.ok) throw new Error(`Contract call ${fn} failed: HTTP ${resp.status}`);
  return resp.json();
}

function uintCV(n: number): string {
  const hex = n.toString(16).padStart(32, "0");
  return `0x01${hex}`;
}

function parseUintResult(result: any): number {
  if (!result?.result) return 0;
  const hex = result.result.replace("0x", "");
  if (hex.startsWith("07")) {
    const inner = hex.slice(2);
    const valHex = inner.slice(2);
    return parseInt(valHex, 16) || 0;
  }
  if (hex.startsWith("01")) return parseInt(hex.slice(2), 16) || 0;
  return 0;
}

function formatUsd(n: number): string {
  if (n < 0) return "N/A";
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(6)}`;
}

// ── Pool Data ──────────────────────────────────────────────────────────────────

let _poolCache: AppPool[] | null = null;

async function fetchAllPools(): Promise<AppPool[]> {
  if (_poolCache) return _poolCache;
  const data = await fetchJson(`${BFF_APP_BASE}/pools/hodlmm`);
  const pools: AppPool[] = (data?.pools || data || []).map((p: any) => ({
    id: p.id ?? p.poolId ?? "?",
    token0Symbol: p.token0Symbol ?? p.tokenXSymbol ?? "?",
    token1Symbol: p.token1Symbol ?? p.tokenYSymbol ?? "?",
    tvlUsd: parseFloat(p.tvlUsd ?? p.tvl ?? "0"),
    volume24hUsd: parseFloat(p.volume24hUsd ?? p.volume24h ?? "0"),
    poolId: parseInt(p.poolId ?? p.id ?? "0"),
    token0Decimals: parseInt(p.token0Decimals ?? p.tokenXDecimals ?? "6"),
    token1Decimals: parseInt(p.token1Decimals ?? p.tokenYDecimals ?? "6"),
    token0PriceUsd: parseFloat(p.token0PriceUsd ?? p.tokenXPriceUsd ?? "0"),
    token1PriceUsd: parseFloat(p.token1PriceUsd ?? p.tokenYPriceUsd ?? "0"),
    activeBinId: parseInt(p.activeBinId ?? "0") || undefined,
    feeBps: parseFloat(p.feeBps ?? p.fee ?? "30"),
  }));
  _poolCache = pools.filter((p) => p.tvlUsd >= MIN_TVL_USD);
  return _poolCache;
}

async function getActiveBin(poolId: number): Promise<number> {
  const result = await callReadOnly("get-active-bin-id", [uintCV(poolId)]);
  return parseUintResult(result);
}

async function fetchBinReserves(poolId: number, activeBinId: number, pool: AppPool): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const start = activeBinId - BIN_SCAN_RADIUS;
  const end = activeBinId + BIN_SCAN_RADIUS;

  for (let binId = start; binId <= end; binId++) {
    try {
      const result = await callReadOnly("get-bin", [uintCV(poolId), uintCV(binId)]);
      const parsed = parseUintResult(result);
      if (parsed > 0) {
        const priceSum = pool.token0PriceUsd + pool.token1PriceUsd + 0.001;
        const ratioX = pool.token0PriceUsd / priceSum;
        const reserveX = parsed * ratioX;
        const reserveY = parsed * (1 - ratioX);
        const reserveXUsd = (reserveX / Math.pow(10, pool.token0Decimals)) * pool.token0PriceUsd;
        const reserveYUsd = (reserveY / Math.pow(10, pool.token1Decimals)) * pool.token1PriceUsd;
        const totalUsd = reserveXUsd + reserveYUsd;
        const balanceRatio = totalUsd > 0 ? reserveXUsd / totalUsd : 0.5;
        bins.push({ binId, reserveX, reserveY, reserveXUsd, reserveYUsd, totalUsd, balanceRatio });
      } else {
        bins.push({ binId, reserveX: 0, reserveY: 0, reserveXUsd: 0, reserveYUsd: 0, totalUsd: 0, balanceRatio: 0.5 });
      }
    } catch {
      bins.push({ binId, reserveX: 0, reserveY: 0, reserveXUsd: 0, reserveYUsd: 0, totalUsd: 0, balanceRatio: 0.5 });
    }
  }
  return bins;
}

// ── Equilibrium Analysis ──────────────────────────────────────────────────────

function computeBiasScore(bins: BinReserves[], activeBinId: number): number {
  let weightedXSum = 0;
  let weightedYSum = 0;
  let totalWeight = 0;

  for (const bin of bins) {
    if (bin.totalUsd <= 0) continue;
    const dist = Math.abs(bin.binId - activeBinId);
    const weight = Math.exp(-0.1 * dist) * bin.totalUsd;
    weightedXSum += bin.reserveXUsd * weight;
    weightedYSum += bin.reserveYUsd * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;

  const xShare = weightedXSum / (weightedXSum + weightedYSum + 0.001);
  return Math.round((xShare - 0.5) * 200);
}

function getBiasDirection(score: number): BiasDirection {
  if (score <= -40) return "STRONG_SELL";
  if (score <= -15) return "SELL";
  if (score >= 40) return "STRONG_BUY";
  if (score >= 15) return "BUY";
  return "NEUTRAL";
}

function computeEquilibriumDistance(bins: BinReserves[]): number {
  const populated = bins.filter((b) => b.totalUsd > 0);
  if (populated.length === 0) return 100;

  let totalDeviation = 0;
  let totalWeight = 0;

  for (const bin of populated) {
    const deviation = Math.abs(bin.balanceRatio - 0.5) * 2;
    totalDeviation += deviation * bin.totalUsd;
    totalWeight += bin.totalUsd;
  }

  return totalWeight > 0 ? Math.round((totalDeviation / totalWeight) * 100) : 100;
}

function getEquilibriumGrade(distance: number): EquilibriumGrade {
  if (distance <= 10) return "BALANCED";
  if (distance <= 25) return "SLIGHT_TILT";
  if (distance <= 45) return "TILTED";
  if (distance <= 70) return "SKEWED";
  return "EXTREME";
}

function computeCenterOfMass(bins: BinReserves[]): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const bin of bins) {
    if (bin.totalUsd <= 0) continue;
    weightedSum += bin.binId * bin.totalUsd;
    totalWeight += bin.totalUsd;
  }

  return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 0;
}

function computeReversionScore(
  biasScore: number,
  equilibriumDistance: number,
  displacement: number,
  volume24hUsd: number,
  tvlUsd: number
): number {
  const biasExtreme = Math.abs(biasScore) / 100;
  const distanceSignal = equilibriumDistance / 100;
  const displacementSignal = Math.min(Math.abs(displacement) / 10, 1);
  const volumeRatio = tvlUsd > 0 ? Math.min(volume24hUsd / tvlUsd, 3) : 0;

  const rawScore =
    biasExtreme * 25 +
    distanceSignal * 25 +
    displacementSignal * 25 +
    volumeRatio * 25;

  return Math.round(Math.min(rawScore, 100));
}

function getReversionSignal(score: number, biasScore: number): ReversionSignal {
  if (Math.abs(biasScore) < 10) return "NEUTRAL";
  if (score >= 70) return "STRONG_REVERT";
  if (score >= 45) return "LIKELY_REVERT";
  if (score <= 20) return "STRONG_TREND";
  if (score <= 35) return "TREND_CONTINUE";
  return "NEUTRAL";
}

function computePressureProfile(bins: BinReserves[], activeBinId: number, pool: AppPool): PressureProfile {
  const leftBins = bins.filter((b) => b.binId < activeBinId && b.totalUsd > 0);
  const rightBins = bins.filter((b) => b.binId > activeBinId && b.totalUsd > 0);

  const leftTotalUsd = leftBins.reduce((s, b) => s + b.totalUsd, 0);
  const rightTotalUsd = rightBins.reduce((s, b) => s + b.totalUsd, 0);

  const leftAvgBalance = leftBins.length > 0
    ? leftBins.reduce((s, b) => s + b.balanceRatio, 0) / leftBins.length
    : 0.5;
  const rightAvgBalance = rightBins.length > 0
    ? rightBins.reduce((s, b) => s + b.balanceRatio, 0) / rightBins.length
    : 0.5;

  return {
    leftBins: leftBins.length,
    rightBins: rightBins.length,
    leftTotalUsd: Math.round(leftTotalUsd * 100) / 100,
    rightTotalUsd: Math.round(rightTotalUsd * 100) / 100,
    leftAvgBalance: Math.round(leftAvgBalance * 1000) / 1000,
    rightAvgBalance: Math.round(rightAvgBalance * 1000) / 1000,
    leftDominantToken: leftAvgBalance > 0.5 ? pool.token0Symbol : pool.token1Symbol,
    rightDominantToken: rightAvgBalance > 0.5 ? pool.token0Symbol : pool.token1Symbol,
  };
}

function detectEquilibriumZones(bins: BinReserves[], activeBinId: number): EquilibriumZone[] {
  const zones: EquilibriumZone[] = [];
  let zoneStart: number | null = null;
  let zoneBins: BinReserves[] = [];

  const BALANCE_THRESHOLD = 0.15;

  for (let i = 0; i < bins.length; i++) {
    const bin = bins[i];
    if (bin.totalUsd <= 0) {
      if (zoneStart !== null && zoneBins.length >= 2) {
        zones.push(buildZone(zoneBins, activeBinId));
      }
      zoneStart = null;
      zoneBins = [];
      continue;
    }

    const isBalanced = Math.abs(bin.balanceRatio - 0.5) <= BALANCE_THRESHOLD;
    if (isBalanced) {
      if (zoneStart === null) zoneStart = i;
      zoneBins.push(bin);
    } else {
      if (zoneStart !== null && zoneBins.length >= 2) {
        zones.push(buildZone(zoneBins, activeBinId));
      }
      zoneStart = null;
      zoneBins = [];
    }
  }

  if (zoneStart !== null && zoneBins.length >= 2) {
    zones.push(buildZone(zoneBins, activeBinId));
  }

  return zones.sort((a, b) => a.distanceFromActive - b.distanceFromActive);
}

function buildZone(zoneBins: BinReserves[], activeBinId: number): EquilibriumZone {
  const startBin = zoneBins[0].binId;
  const endBin = zoneBins[zoneBins.length - 1].binId;
  const avgBalance = zoneBins.reduce((s, b) => s + b.balanceRatio, 0) / zoneBins.length;
  const avgLiq = zoneBins.reduce((s, b) => s + b.totalUsd, 0) / zoneBins.length;
  const distLeft = Math.abs(startBin - activeBinId);
  const distRight = Math.abs(endBin - activeBinId);

  return {
    startBin,
    endBin,
    width: endBin - startBin + 1,
    avgBalanceRatio: Math.round(avgBalance * 1000) / 1000,
    avgLiquidityUsd: Math.round(avgLiq * 100) / 100,
    distanceFromActive: Math.min(distLeft, distRight),
  };
}

// ── ASCII Chart ────────────────────────────────────────────────────────────────

function buildAsciiChart(bins: BinReserves[], activeBinId: number): string {
  const lines: string[] = [];
  lines.push("  Bin Equilibrium Chart");
  lines.push("  ──────────────────────────────────────────────────");
  lines.push("  [◄ Token Y heavy] [═ Balanced] [► Token X heavy]  [▼ Active]");
  lines.push("");

  const populated = bins.filter((b) => b.totalUsd > 0);
  if (populated.length === 0) {
    lines.push("  No populated bins found");
    return lines.join("\n");
  }

  for (const bin of bins) {
    const marker = bin.binId === activeBinId ? "▼" : " ";
    const dist = bin.binId - activeBinId;
    const distStr = dist >= 0 ? `+${dist}`.padStart(4) : `${dist}`.padStart(4);

    if (bin.totalUsd <= 0) {
      lines.push(`  ${marker}${distStr} │${"·".padEnd(30)}│ empty`);
      continue;
    }

    const barWidth = 30;
    const mid = Math.floor(barWidth / 2);
    const ratio = bin.balanceRatio;

    let bar: string;
    if (Math.abs(ratio - 0.5) <= 0.1) {
      const eqLen = Math.max(2, Math.round(barWidth * 0.3));
      const pad = Math.floor((barWidth - eqLen) / 2);
      bar = " ".repeat(pad) + "═".repeat(eqLen) + " ".repeat(barWidth - pad - eqLen);
    } else if (ratio > 0.5) {
      const xLen = Math.round((ratio - 0.5) * 2 * mid);
      bar = " ".repeat(mid) + "►".repeat(Math.max(1, xLen));
      bar = bar.padEnd(barWidth);
    } else {
      const yLen = Math.round((0.5 - ratio) * 2 * mid);
      const startPos = Math.max(0, mid - yLen);
      bar = " ".repeat(startPos) + "◄".repeat(Math.max(1, yLen));
      bar = bar.padEnd(barWidth);
    }

    const pctX = Math.round(ratio * 100);
    lines.push(`  ${marker}${distStr} │${bar}│ ${formatUsd(bin.totalUsd)} (${pctX}%X)`);
  }

  lines.push("");
  return lines.join("\n");
}

// ── Command Handlers ──────────────────────────────────────────────────────────

async function runDoctor(): Promise<void> {
  const results: Record<string, string> = {};

  try {
    await fetchJson(`${BFF_APP_BASE}/pools/hodlmm`);
    results["bitflow_app_api"] = "ok";
  } catch (e: any) {
    results["bitflow_app_api"] = `error: ${e.message}`;
  }

  try {
    await fetchJson(`${HIRO_API}/v2/info`);
    results["hiro_api"] = "ok";
  } catch (e: any) {
    results["hiro_api"] = `error: ${e.message}`;
  }

  try {
    const testResult = await callReadOnly("get-active-bin-id", [uintCV(1)]);
    results["dlmm_contract"] = testResult.result ? "ok" : "no result";
  } catch (e: any) {
    results["dlmm_contract"] = `error: ${e.message}`;
  }

  console.log(
    JSON.stringify({
      tool: "hodlmm-bin-equilibrium",
      command: "doctor",
      status: Object.values(results).every((v) => v.startsWith("ok")) ? "healthy" : "degraded",
      checks: results,
      timestamp: new Date().toISOString(),
    })
  );
}

async function runInstallPacks(): Promise<void> {
  console.log(
    JSON.stringify({
      tool: "hodlmm-bin-equilibrium",
      command: "install-packs",
      status: "ok",
      message: "No additional dependencies required. Uses commander (workspace) + native fetch.",
      timestamp: new Date().toISOString(),
    })
  );
}

async function runAnalyze(options: { pool: string }): Promise<void> {
  const poolId = parseInt(options.pool);
  if (isNaN(poolId)) {
    console.log(JSON.stringify({
      tool: "hodlmm-bin-equilibrium",
      command: "run",
      timestamp: new Date().toISOString(),
      error: "Invalid pool ID — provide a numeric pool ID with --pool",
    }));
    return;
  }

  const pools = await fetchAllPools();
  const pool = pools.find((p) => p.poolId === poolId);

  if (!pool) {
    console.log(JSON.stringify({
      tool: "hodlmm-bin-equilibrium",
      command: "run",
      timestamp: new Date().toISOString(),
      error: `Pool ${poolId} not found or below TVL threshold ($${MIN_TVL_USD})`,
    }));
    return;
  }

  const activeBinId = pool.activeBinId || await getActiveBin(poolId);
  if (!activeBinId) {
    console.log(JSON.stringify({
      tool: "hodlmm-bin-equilibrium",
      command: "run",
      timestamp: new Date().toISOString(),
      error: `Could not determine active bin for pool ${poolId}`,
    }));
    return;
  }

  const rawBins = await fetchBinReserves(poolId, activeBinId, pool);

  const biasScore = computeBiasScore(rawBins, activeBinId);
  const biasDirection = getBiasDirection(biasScore);
  const equilibriumDistance = computeEquilibriumDistance(rawBins);
  const equilibriumGrade = getEquilibriumGrade(equilibriumDistance);
  const centerOfMass = computeCenterOfMass(rawBins);
  const displacement = Math.round((centerOfMass - activeBinId) * 100) / 100;
  const reversionScore = computeReversionScore(biasScore, equilibriumDistance, displacement, pool.volume24hUsd, pool.tvlUsd);
  const reversionSignal = getReversionSignal(reversionScore, biasScore);
  const pressure = computePressureProfile(rawBins, activeBinId, pool);
  const equilibriumZones = detectEquilibriumZones(rawBins, activeBinId);
  const asciiChart = buildAsciiChart(rawBins, activeBinId);

  let recommendation: string;
  if (equilibriumGrade === "EXTREME" || equilibriumGrade === "SKEWED") {
    const direction = biasScore > 0 ? `${pool.token0Symbol}-heavy` : `${pool.token1Symbol}-heavy`;
    recommendation = `Distribution is ${equilibriumGrade.toLowerCase()} (${direction}, bias ${biasScore}). `;
    if (reversionSignal === "STRONG_REVERT" || reversionSignal === "LIKELY_REVERT") {
      recommendation += `High volume/TVL ratio suggests mean-reversion — price likely to move back toward equilibrium. LPs: consider adding ${biasScore > 0 ? pool.token1Symbol : pool.token0Symbol} to rebalance exposure.`;
    } else {
      recommendation += `Low reversion pressure — trend may continue. LPs: reduce exposure to the dominant token side or wait for rebalancing catalysts.`;
    }
  } else if (equilibriumGrade === "BALANCED" || equilibriumGrade === "SLIGHT_TILT") {
    recommendation = `Reserves are ${equilibriumGrade === "BALANCED" ? "well-balanced" : "slightly tilted"} (distance ${equilibriumDistance}%). `;
    recommendation += `${equilibriumZones.length} equilibrium zone(s) detected. Pool is healthy for symmetric LP positions — no urgent rebalancing needed.`;
  } else {
    const tiltDir = biasScore > 0 ? pool.token0Symbol : pool.token1Symbol;
    recommendation = `Moderate tilt toward ${tiltDir} (bias ${biasScore}, distance ${equilibriumDistance}%). `;
    recommendation += `Consider asymmetric LP entry favoring ${biasScore > 0 ? pool.token1Symbol : pool.token0Symbol} to capture rebalancing fees.`;
  }

  const out: PoolEquilibriumAnalysis = {
    poolId,
    pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
    tvlUsd: Math.round(pool.tvlUsd),
    volume24hUsd: Math.round(pool.volume24hUsd),
    feeBps: pool.feeBps || 30,
    activeBinId,
    biasScore,
    biasDirection,
    equilibriumDistance,
    equilibriumGrade,
    centerOfMass,
    displacement,
    reversionScore,
    reversionSignal,
    pressure,
    equilibriumZones,
    recommendation,
    asciiChart,
  };

  console.log(JSON.stringify({
    tool: "hodlmm-bin-equilibrium",
    command: "run",
    timestamp: new Date().toISOString(),
    ...out,
  }, null, 2));
}

async function runScan(options: {
  top?: string;
  minTvl?: string;
  sort?: string;
}): Promise<void> {
  const topN = parseInt(options.top || "10");
  const minTvl = parseFloat(options.minTvl || String(MIN_TVL_USD));
  const sortBy = options.sort || "bias";

  const pools = (await fetchAllPools()).filter((p) => p.tvlUsd >= minTvl);

  if (pools.length === 0) {
    console.log(JSON.stringify({
      tool: "hodlmm-bin-equilibrium",
      command: "scan",
      timestamp: new Date().toISOString(),
      error: "No pools found above TVL threshold",
    }));
    return;
  }

  const poolResults: any[] = [];

  for (const pool of pools.slice(0, topN * 2)) {
    try {
      const activeBinId = pool.activeBinId || await getActiveBin(pool.poolId!);
      if (!activeBinId) continue;

      const radius = 15;
      const rawBins: BinReserves[] = [];
      for (let binId = activeBinId - radius; binId <= activeBinId + radius; binId++) {
        try {
          const result = await callReadOnly("get-bin", [uintCV(pool.poolId!), uintCV(binId)]);
          const parsed = parseUintResult(result);
          if (parsed > 0) {
            const priceSum = pool.token0PriceUsd + pool.token1PriceUsd + 0.001;
            const ratioX = pool.token0PriceUsd / priceSum;
            const reserveX = parsed * ratioX;
            const reserveY = parsed * (1 - ratioX);
            const reserveXUsd = (reserveX / Math.pow(10, pool.token0Decimals)) * pool.token0PriceUsd;
            const reserveYUsd = (reserveY / Math.pow(10, pool.token1Decimals)) * pool.token1PriceUsd;
            const totalUsd = reserveXUsd + reserveYUsd;
            const balanceRatio = totalUsd > 0 ? reserveXUsd / totalUsd : 0.5;
            rawBins.push({ binId, reserveX, reserveY, reserveXUsd, reserveYUsd, totalUsd, balanceRatio });
          } else {
            rawBins.push({ binId, reserveX: 0, reserveY: 0, reserveXUsd: 0, reserveYUsd: 0, totalUsd: 0, balanceRatio: 0.5 });
          }
        } catch {
          rawBins.push({ binId, reserveX: 0, reserveY: 0, reserveXUsd: 0, reserveYUsd: 0, totalUsd: 0, balanceRatio: 0.5 });
        }
      }

      const biasScore = computeBiasScore(rawBins, activeBinId);
      const equilibriumDistance = computeEquilibriumDistance(rawBins);
      const centerOfMass = computeCenterOfMass(rawBins);
      const displacement = Math.round((centerOfMass - activeBinId) * 100) / 100;
      const reversionScore = computeReversionScore(biasScore, equilibriumDistance, displacement, pool.volume24hUsd, pool.tvlUsd);

      poolResults.push({
        poolId: pool.poolId,
        pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
        tvlUsd: Math.round(pool.tvlUsd),
        volume24hUsd: Math.round(pool.volume24hUsd),
        biasScore,
        biasDirection: getBiasDirection(biasScore),
        equilibriumDistance,
        equilibriumGrade: getEquilibriumGrade(equilibriumDistance),
        displacement,
        reversionScore,
        reversionSignal: getReversionSignal(reversionScore, biasScore),
      });
    } catch { /* skip pool */ }
  }

  if (sortBy === "reversion") {
    poolResults.sort((a, b) => b.reversionScore - a.reversionScore);
  } else if (sortBy === "distance") {
    poolResults.sort((a, b) => b.equilibriumDistance - a.equilibriumDistance);
  } else {
    poolResults.sort((a, b) => Math.abs(b.biasScore) - Math.abs(a.biasScore));
  }

  const ranked = poolResults.slice(0, topN);

  const avgBias = ranked.length > 0
    ? Math.round(ranked.reduce((s, p) => s + Math.abs(p.biasScore), 0) / ranked.length)
    : 0;
  const extremePools = ranked.filter((p) => p.equilibriumGrade === "EXTREME" || p.equilibriumGrade === "SKEWED").length;
  const reversionCandidates = ranked.filter(
    (p) => p.reversionSignal === "STRONG_REVERT" || p.reversionSignal === "LIKELY_REVERT"
  ).length;

  console.log(JSON.stringify({
    tool: "hodlmm-bin-equilibrium",
    command: "scan",
    timestamp: new Date().toISOString(),
    poolsScanned: poolResults.length,
    sortedBy: sortBy,
    results: ranked,
    summary: {
      avgAbsBias: avgBias,
      extremeOrSkewedPools: extremePools,
      reversionCandidates,
      balancedPools: ranked.filter((p) => p.equilibriumGrade === "BALANCED").length,
    },
    guidance: extremePools > 0
      ? `${extremePools} pool(s) with extreme/skewed reserve distributions — high rebalancing fee opportunity for LPs entering the underweight side.`
      : reversionCandidates > 0
        ? `${reversionCandidates} pool(s) showing mean-reversion signals — price likely to move back toward balanced reserves.`
        : `Most pools are near equilibrium (avg bias ${avgBias}). No major directional imbalance detected.`,
  }, null, 2));
}

// ── CLI Setup ──────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-bin-equilibrium")
  .description(
    "HODLMM Bin Equilibrium Analyzer — Measures buy/sell pressure balance across bin distributions with directional bias scoring and mean-reversion signals"
  )
  .version("1.0.0");

program
  .command("doctor")
  .description("Check API connectivity and dependencies")
  .action(runDoctor);

program
  .command("install-packs")
  .description("Install dependencies (none required beyond workspace)")
  .action(runInstallPacks);

program
  .command("run")
  .description("Analyze equilibrium state for a specific pool")
  .requiredOption("--pool <id>", "HODLMM pool ID")
  .action(runAnalyze);

program
  .command("scan")
  .description("Rank pools by reserve imbalance and reversion potential")
  .option("--top <n>", "Number of pools to show", "10")
  .option("--min-tvl <usd>", "Minimum TVL filter", String(MIN_TVL_USD))
  .option("--sort <by>", "Sort by: bias, reversion, distance", "bias")
  .action(runScan);

program.parse();
