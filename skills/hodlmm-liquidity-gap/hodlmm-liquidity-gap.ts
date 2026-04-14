#!/usr/bin/env bun
/**
 * hodlmm-liquidity-gap.ts
 *
 * HODLMM Liquidity Gap Detector — Scans on-chain bin reserves to find gaps
 * (empty or near-empty bins) in the liquidity distribution around the active
 * price. Gaps near trading activity create slippage risk for swappers and
 * outsized fee opportunities for LPs who fill them.
 *
 * Key metrics:
 *  - Gap detection (consecutive empty bins near active price)
 *  - Gap severity scoring (size, proximity to active bin, surrounding density)
 *  - Slippage risk assessment per gap
 *  - Fill opportunity ranking (best gaps to deploy capital into)
 *  - Continuity score (overall bin coverage health)
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 73).
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
const EMPTY_THRESHOLD_USD = 1;

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
  totalUsd: number;
}

type GapSeverity = "CRITICAL" | "HIGH" | "MODERATE" | "LOW" | "NEGLIGIBLE";

interface LiquidityGap {
  startBin: number;
  endBin: number;
  width: number;
  distanceFromActive: number;
  closestSideToActive: "left" | "right" | "spanning";
  severity: GapSeverity;
  severityScore: number;
  estimatedSlippageBps: number;
  surroundingLiquidityUsd: number;
  fillOpportunityScore: number;
  recommendation: string;
}

interface ContinuityProfile {
  totalBinsScanned: number;
  binsWithLiquidity: number;
  emptyBins: number;
  coverageRatio: number;
  longestGapWidth: number;
  gapCount: number;
  continuityScore: number;
  continuityGrade: "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "FRAGMENTED";
}

interface PoolGapAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  gaps: LiquidityGap[];
  continuity: ContinuityProfile;
  criticalGaps: LiquidityGap[];
  bestFillOpportunities: LiquidityGap[];
  recommendation: string;
  asciiMap: string;
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
        const ratioX = pool.token0PriceUsd / (pool.token0PriceUsd + pool.token1PriceUsd + 0.001);
        const reserveX = parsed * ratioX;
        const reserveY = parsed * (1 - ratioX);
        const usdX = (reserveX / Math.pow(10, pool.token0Decimals)) * pool.token0PriceUsd;
        const usdY = (reserveY / Math.pow(10, pool.token1Decimals)) * pool.token1PriceUsd;
        bins.push({ binId, reserveX, reserveY, totalUsd: usdX + usdY });
      } else {
        bins.push({ binId, reserveX: 0, reserveY: 0, totalUsd: 0 });
      }
    } catch {
      bins.push({ binId, reserveX: 0, reserveY: 0, totalUsd: 0 });
    }
  }
  return bins;
}

// ── Gap Detection ──────────────────────────────────────────────────────────────

function detectGaps(bins: BinReserves[], activeBinId: number, pool: AppPool): LiquidityGap[] {
  const gaps: LiquidityGap[] = [];
  let gapStart: number | null = null;

  for (let i = 0; i < bins.length; i++) {
    const isEmpty = bins[i].totalUsd < EMPTY_THRESHOLD_USD;

    if (isEmpty && gapStart === null) {
      gapStart = i;
    } else if (!isEmpty && gapStart !== null) {
      const startBin = bins[gapStart].binId;
      const endBin = bins[i - 1].binId;
      const width = endBin - startBin + 1;

      const gap = buildGapAnalysis(startBin, endBin, width, activeBinId, bins, gapStart, i - 1, pool);
      gaps.push(gap);
      gapStart = null;
    }
  }

  if (gapStart !== null) {
    const startBin = bins[gapStart].binId;
    const endBin = bins[bins.length - 1].binId;
    const width = endBin - startBin + 1;
    const gap = buildGapAnalysis(startBin, endBin, width, activeBinId, bins, gapStart, bins.length - 1, pool);
    gaps.push(gap);
  }

  return gaps.sort((a, b) => b.severityScore - a.severityScore);
}

function buildGapAnalysis(
  startBin: number,
  endBin: number,
  width: number,
  activeBinId: number,
  bins: BinReserves[],
  startIdx: number,
  endIdx: number,
  pool: AppPool
): LiquidityGap {
  const distLeft = Math.abs(startBin - activeBinId);
  const distRight = Math.abs(endBin - activeBinId);
  const distanceFromActive = Math.min(distLeft, distRight);

  let closestSide: "left" | "right" | "spanning";
  if (startBin <= activeBinId && endBin >= activeBinId) {
    closestSide = "spanning";
  } else if (endBin < activeBinId) {
    closestSide = "left";
  } else {
    closestSide = "right";
  }

  // Surrounding liquidity (bins adjacent to the gap)
  let surroundingLiquidityUsd = 0;
  if (startIdx > 0) surroundingLiquidityUsd += bins[startIdx - 1].totalUsd;
  if (endIdx < bins.length - 1) surroundingLiquidityUsd += bins[endIdx + 1].totalUsd;

  // Severity based on proximity and width
  const proximitySeverity = distanceFromActive <= 2 ? 5 : distanceFromActive <= 5 ? 3 : distanceFromActive <= 10 ? 2 : 1;
  const widthSeverity = width >= 5 ? 5 : width >= 3 ? 3 : width >= 2 ? 2 : 1;
  const spanningSeverity = closestSide === "spanning" ? 5 : 0;
  const severityScore = proximitySeverity * 2 + widthSeverity + spanningSeverity;

  let severity: GapSeverity;
  if (severityScore >= 13 || closestSide === "spanning") severity = "CRITICAL";
  else if (severityScore >= 9) severity = "HIGH";
  else if (severityScore >= 6) severity = "MODERATE";
  else if (severityScore >= 3) severity = "LOW";
  else severity = "NEGLIGIBLE";

  // Estimated slippage: wider gaps near active bin = more slippage
  const baseSlippage = width * 5;
  const proximityMultiplier = distanceFromActive <= 3 ? 3 : distanceFromActive <= 8 ? 1.5 : 0.5;
  const estimatedSlippageBps = Math.round(baseSlippage * proximityMultiplier);

  // Fill opportunity: volume-weighted. Closer to active + higher surrounding volume = better
  const volumeWeight = Math.exp(-0.3 * distanceFromActive);
  const dailyFees = (pool.volume24hUsd * (pool.feeBps || 30)) / 10_000;
  const feeShareEstimate = volumeWeight * width * 0.02;
  const fillOpportunityScore = Math.round(
    (feeShareEstimate * dailyFees * 10 + surroundingLiquidityUsd * 0.01) * 100
  ) / 100;

  let recommendation: string;
  if (severity === "CRITICAL") {
    recommendation = `URGENT: ${width}-bin gap ${closestSide === "spanning" ? "spans" : "near"} active price. Filling creates monopoly fee capture with zero competition.`;
  } else if (severity === "HIGH") {
    recommendation = `High-value gap: ${width} empty bins at distance ${distanceFromActive} from active. Low competition zone — good fee capture potential.`;
  } else if (severity === "MODERATE") {
    recommendation = `Moderate gap at distance ${distanceFromActive}. Worth filling if deploying >$500 to capture fees when price moves through this range.`;
  } else {
    recommendation = `Minor gap at distance ${distanceFromActive}. Low priority — price unlikely to reach this range frequently.`;
  }

  return {
    startBin,
    endBin,
    width,
    distanceFromActive,
    closestSideToActive: closestSide,
    severity,
    severityScore,
    estimatedSlippageBps,
    surroundingLiquidityUsd: Math.round(surroundingLiquidityUsd * 100) / 100,
    fillOpportunityScore,
    recommendation,
  };
}

// ── Continuity Analysis ────────────────────────────────────────────────────────

function computeContinuity(bins: BinReserves[], gaps: LiquidityGap[]): ContinuityProfile {
  const total = bins.length;
  const withLiquidity = bins.filter((b) => b.totalUsd >= EMPTY_THRESHOLD_USD).length;
  const empty = total - withLiquidity;
  const coverageRatio = total > 0 ? withLiquidity / total : 0;

  const longestGapWidth = gaps.length > 0 ? Math.max(...gaps.map((g) => g.width)) : 0;

  // Continuity score: 0-100
  // Penalize: low coverage, wide gaps, many gaps, gaps near active price
  const coveragePenalty = (1 - coverageRatio) * 40;
  const widthPenalty = Math.min(longestGapWidth * 3, 25);
  const countPenalty = Math.min(gaps.length * 2, 15);
  const criticalPenalty = gaps.filter((g) => g.severity === "CRITICAL" || g.severity === "HIGH").length * 10;

  const continuityScore = Math.max(0, Math.round(100 - coveragePenalty - widthPenalty - countPenalty - criticalPenalty));

  let continuityGrade: ContinuityProfile["continuityGrade"];
  if (continuityScore >= 85) continuityGrade = "EXCELLENT";
  else if (continuityScore >= 70) continuityGrade = "GOOD";
  else if (continuityScore >= 50) continuityGrade = "FAIR";
  else if (continuityScore >= 30) continuityGrade = "POOR";
  else continuityGrade = "FRAGMENTED";

  return {
    totalBinsScanned: total,
    binsWithLiquidity: withLiquidity,
    emptyBins: empty,
    coverageRatio: Math.round(coverageRatio * 10000) / 10000,
    longestGapWidth,
    gapCount: gaps.length,
    continuityScore,
    continuityGrade,
  };
}

// ── ASCII Map ──────────────────────────────────────────────────────────────────

function buildAsciiMap(bins: BinReserves[], activeBinId: number, gaps: LiquidityGap[]): string {
  const lines: string[] = [];
  lines.push("  Liquidity Coverage Map");
  lines.push("  ──────────────────────────────────────────────────");
  lines.push("  [█ Filled] [░ Low] [· Empty/Gap] [▼ Active Bin]");
  lines.push("");

  const maxLiq = Math.max(...bins.map((b) => b.totalUsd), 1);

  // Build gap set for highlighting
  const gapBins = new Set<number>();
  for (const gap of gaps) {
    for (let b = gap.startBin; b <= gap.endBin; b++) gapBins.add(b);
  }

  for (const bin of bins) {
    const marker = bin.binId === activeBinId ? "▼" : " ";
    const dist = bin.binId - activeBinId;
    const distStr = dist >= 0 ? `+${dist}`.padStart(4) : `${dist}`.padStart(4);

    const isEmpty = bin.totalUsd < EMPTY_THRESHOLD_USD;
    const isLow = !isEmpty && bin.totalUsd < maxLiq * 0.05;
    const isGap = gapBins.has(bin.binId);

    let block: string;
    if (isEmpty) block = isGap ? "·" : "·";
    else if (isLow) block = "░";
    else block = "█";

    const barLen = isEmpty ? 0 : Math.max(1, Math.round((bin.totalUsd / maxLiq) * 30));
    const bar = block.repeat(barLen);
    const gapMarker = isGap && isEmpty ? " ← GAP" : "";
    const liqStr = !isEmpty ? ` ${formatUsd(bin.totalUsd)}` : "";

    lines.push(`  ${marker}${distStr} │${bar.padEnd(30)}│${liqStr}${gapMarker}`);
  }

  lines.push("");
  return lines.join("\n");
}

// ── Command Handlers ────────────────────────────────────────────────────────────

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
      tool: "hodlmm-liquidity-gap",
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
      tool: "hodlmm-liquidity-gap",
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
      tool: "hodlmm-liquidity-gap",
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
      tool: "hodlmm-liquidity-gap",
      command: "run",
      timestamp: new Date().toISOString(),
      error: `Pool ${poolId} not found or below TVL threshold ($${MIN_TVL_USD})`,
    }));
    return;
  }

  const activeBinId = pool.activeBinId || await getActiveBin(poolId);
  if (!activeBinId) {
    console.log(JSON.stringify({
      tool: "hodlmm-liquidity-gap",
      command: "run",
      timestamp: new Date().toISOString(),
      error: `Could not determine active bin for pool ${poolId}`,
    }));
    return;
  }

  const rawBins = await fetchBinReserves(poolId, activeBinId, pool);
  const gaps = detectGaps(rawBins, activeBinId, pool);
  const continuity = computeContinuity(rawBins, gaps);

  const criticalGaps = gaps.filter((g) => g.severity === "CRITICAL" || g.severity === "HIGH");
  const bestFillOpportunities = [...gaps]
    .sort((a, b) => b.fillOpportunityScore - a.fillOpportunityScore)
    .slice(0, 5);

  const asciiMap = buildAsciiMap(rawBins, activeBinId, gaps);

  let recommendation: string;
  if (criticalGaps.length > 0) {
    const worst = criticalGaps[0];
    recommendation = `${criticalGaps.length} critical/high gap(s) detected. Worst: ${worst.width}-bin gap at distance ${worst.distanceFromActive} from active (${worst.closestSideToActive} side). Filling this gap eliminates ~${worst.estimatedSlippageBps}bps of slippage and captures monopoly fees with zero LP competition.`;
  } else if (continuity.continuityGrade === "EXCELLENT" || continuity.continuityGrade === "GOOD") {
    recommendation = `Bin coverage is ${continuity.continuityGrade.toLowerCase()} (${Math.round(continuity.coverageRatio * 100)}% filled). ${gaps.length} minor gap(s) at pool edges. No urgent fill opportunities — liquidity is well-distributed.`;
  } else {
    recommendation = `${gaps.length} gap(s) found with ${continuity.continuityGrade.toLowerCase()} coverage (${Math.round(continuity.coverageRatio * 100)}% filled). Best opportunity: fill gaps closest to active bin for highest fee capture.`;
  }

  const out: PoolGapAnalysis = {
    poolId,
    pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
    tvlUsd: Math.round(pool.tvlUsd),
    volume24hUsd: Math.round(pool.volume24hUsd),
    feeBps: pool.feeBps || 30,
    activeBinId,
    gaps,
    continuity,
    criticalGaps,
    bestFillOpportunities,
    recommendation,
    asciiMap,
  };

  console.log(JSON.stringify({
    tool: "hodlmm-liquidity-gap",
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
  const sortBy = options.sort || "gaps";

  const pools = (await fetchAllPools()).filter((p) => p.tvlUsd >= minTvl);

  if (pools.length === 0) {
    console.log(JSON.stringify({
      tool: "hodlmm-liquidity-gap",
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
          const ratioX = pool.token0PriceUsd / (pool.token0PriceUsd + pool.token1PriceUsd + 0.001);
          const reserveX = parsed > 0 ? parsed * ratioX : 0;
          const reserveY = parsed > 0 ? parsed * (1 - ratioX) : 0;
          const usdX = (reserveX / Math.pow(10, pool.token0Decimals)) * pool.token0PriceUsd;
          const usdY = (reserveY / Math.pow(10, pool.token1Decimals)) * pool.token1PriceUsd;
          rawBins.push({ binId, reserveX, reserveY, totalUsd: usdX + usdY });
        } catch {
          rawBins.push({ binId, reserveX: 0, reserveY: 0, totalUsd: 0 });
        }
      }

      const gaps = detectGaps(rawBins, activeBinId, pool);
      const continuity = computeContinuity(rawBins, gaps);
      const criticalCount = gaps.filter((g) => g.severity === "CRITICAL" || g.severity === "HIGH").length;
      const bestOpp = gaps.length > 0
        ? gaps.sort((a, b) => b.fillOpportunityScore - a.fillOpportunityScore)[0]
        : null;

      poolResults.push({
        poolId: pool.poolId,
        pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
        tvlUsd: Math.round(pool.tvlUsd),
        volume24hUsd: Math.round(pool.volume24hUsd),
        gapCount: gaps.length,
        criticalGaps: criticalCount,
        longestGap: continuity.longestGapWidth,
        coverageRatio: continuity.coverageRatio,
        continuityScore: continuity.continuityScore,
        continuityGrade: continuity.continuityGrade,
        bestFillBin: bestOpp ? bestOpp.startBin : null,
        bestFillScore: bestOpp ? bestOpp.fillOpportunityScore : 0,
        bestFillSeverity: bestOpp ? bestOpp.severity : "NONE",
      });
    } catch { /* skip pool */ }
  }

  if (sortBy === "opportunity") {
    poolResults.sort((a, b) => b.bestFillScore - a.bestFillScore);
  } else if (sortBy === "coverage") {
    poolResults.sort((a, b) => a.coverageRatio - b.coverageRatio);
  } else {
    poolResults.sort((a, b) => b.criticalGaps - a.criticalGaps || b.gapCount - a.gapCount);
  }

  const ranked = poolResults.slice(0, topN);

  const totalCritical = ranked.reduce((s, p) => s + p.criticalGaps, 0);
  const avgCoverage = ranked.length > 0
    ? Math.round((ranked.reduce((s, p) => s + p.coverageRatio, 0) / ranked.length) * 1000) / 10
    : 0;
  const fragmented = ranked.filter((p) => p.continuityGrade === "FRAGMENTED" || p.continuityGrade === "POOR").length;

  console.log(JSON.stringify({
    tool: "hodlmm-liquidity-gap",
    command: "scan",
    timestamp: new Date().toISOString(),
    poolsScanned: poolResults.length,
    sortedBy: sortBy,
    results: ranked,
    summary: {
      totalCriticalGaps: totalCritical,
      avgCoveragePercent: avgCoverage,
      fragmentedPools: fragmented,
      poolsWithOpportunity: ranked.filter((p) => p.bestFillScore > 0).length,
    },
    guidance: totalCritical > 0
      ? `${totalCritical} critical gap(s) across scanned pools — these are high-value fill opportunities with zero LP competition near the active price.`
      : fragmented > 0
        ? `${fragmented} pool(s) with poor/fragmented coverage. These need liquidity to reduce slippage and attract more trading volume.`
        : `Pools have generally good coverage (${avgCoverage}% avg). Minor gaps at edges — limited opportunity for gap-filling strategies.`,
  }, null, 2));
}

// ── CLI Setup ──────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-liquidity-gap")
  .description(
    "HODLMM Liquidity Gap Detector — Finds empty bins in the liquidity distribution to identify slippage risk and LP fill opportunities"
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
  .description("Detect liquidity gaps for a specific pool")
  .requiredOption("--pool <id>", "HODLMM pool ID")
  .action(runAnalyze);

program
  .command("scan")
  .description("Rank pools by gap severity and fill opportunities")
  .option("--top <n>", "Number of pools to show", "10")
  .option("--min-tvl <usd>", "Minimum TVL filter", String(MIN_TVL_USD))
  .option("--sort <by>", "Sort by: gaps, opportunity, coverage", "gaps")
  .action(runScan);

program.parse();
