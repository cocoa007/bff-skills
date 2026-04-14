#!/usr/bin/env bun
/**
 * hodlmm-bin-dominance.ts
 *
 * HODLMM Bin Dominance Analyzer — Identifies which bins control the most
 * liquidity and fee-earning potential. Measures power concentration across
 * bin ranges and detects unhealthy dominance patterns.
 *
 * Metrics:
 *  1. TVL dominance: % of pool liquidity each bin controls
 *  2. Fee dominance: proximity-weighted TVL share (bins near active earn more)
 *  3. Herfindahl index (HHI): market concentration across bins
 *  4. Top-N concentration: what % of TVL the top 1/3/5/10 bins hold
 *  5. Dominance tiers: DOMINANT / MAJOR / MODERATE / MINOR / DUST
 *  6. Power law fit: does distribution follow a power law (whale-dominated)?
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 82).
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 25;

// Dominance tier thresholds (% of scanned TVL)
const TIER_DOMINANT = 15;  // >= 15% of scanned TVL
const TIER_MAJOR = 8;      // >= 8%
const TIER_MODERATE = 3;   // >= 3%
const TIER_MINOR = 0.5;    // >= 0.5%
// Below MINOR = DUST

// HHI thresholds (0-10000 scale)
const HHI_CONCENTRATED = 2500;  // highly concentrated
const HHI_MODERATE = 1500;      // moderately concentrated
// Below 1500 = competitive/dispersed

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

type DominanceTier = "DOMINANT" | "MAJOR" | "MODERATE" | "MINOR" | "DUST";

interface BinDominance {
  binId: number;
  distanceFromActive: number;
  totalUsd: number;
  tvlSharePct: number;
  feeSharePct: number;
  combinedDominance: number;
  tier: DominanceTier;
  cumulativeTvlPct: number;
  rank: number;
}

interface DominanceAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  // Concentration metrics
  hhi: number;
  hhiClassification: string;
  top1Pct: number;
  top3Pct: number;
  top5Pct: number;
  top10Pct: number;
  giniCoefficient: number;
  // Power law analysis
  powerLawExponent: number;
  powerLawFit: number; // R² goodness of fit (0-1)
  isPowerLaw: boolean;
  // Tier distribution
  tierCounts: Record<DominanceTier, number>;
  tierTvl: Record<DominanceTier, number>;
  // Ranked bins
  bins: BinDominance[];
  topBins: BinDominance[];
  // Dominance asymmetry (left vs right of active bin)
  leftDominancePct: number;
  rightDominancePct: number;
  dominanceSkew: string;
  recommendation: string;
  asciiChart: string;
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
  if (v >= 1) return v.toFixed(0);
  return v.toFixed(2);
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

// -- Dominance analysis -------------------------------------------------------

function classifyTier(tvlSharePct: number): DominanceTier {
  if (tvlSharePct >= TIER_DOMINANT) return "DOMINANT";
  if (tvlSharePct >= TIER_MAJOR) return "MAJOR";
  if (tvlSharePct >= TIER_MODERATE) return "MODERATE";
  if (tvlSharePct >= TIER_MINOR) return "MINOR";
  return "DUST";
}

function computeHHI(shares: number[]): number {
  return shares.reduce((sum, s) => sum + s * s, 0);
}

function computeGini(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  const total = sorted.reduce((s, v) => s + v, 0);
  if (total <= 0) return 0;
  let cumulativeSum = 0;
  let giniNumerator = 0;
  for (let i = 0; i < n; i++) {
    cumulativeSum += sorted[i];
    giniNumerator += (2 * (i + 1) - n - 1) * sorted[i];
  }
  return giniNumerator / (n * total);
}

function fitPowerLaw(ranks: number[], values: number[]): { exponent: number; rSquared: number } {
  const valid = ranks.map((r, i) => ({ r, v: values[i] })).filter((p) => p.r > 0 && p.v > 0);
  if (valid.length < 3) return { exponent: 0, rSquared: 0 };

  const logR = valid.map((p) => Math.log(p.r));
  const logV = valid.map((p) => Math.log(p.v));
  const n = logR.length;

  const sumX = logR.reduce((s, v) => s + v, 0);
  const sumY = logV.reduce((s, v) => s + v, 0);
  const sumXY = logR.reduce((s, v, i) => s + v * logV[i], 0);
  const sumX2 = logR.reduce((s, v) => s + v * v, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return { exponent: 0, rSquared: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const meanY = sumY / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * logR[i];
    ssTot += (logV[i] - meanY) ** 2;
    ssRes += (logV[i] - predicted) ** 2;
  }
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { exponent: -slope, rSquared: Math.max(0, rSquared) };
}

function feeWeight(distanceFromActive: number): number {
  const lambda = Math.LN2 / 6;
  return Math.exp(-lambda * Math.abs(distanceFromActive));
}

function analyzeDominance(
  pool: AppPool,
  activeBinId: number,
  rawBins: BinReserves[]
): DominanceAnalysis {
  const populated = rawBins.filter((b) => b.totalUsd > 0.01);
  const scannedTvl = populated.reduce((s, b) => s + b.totalUsd, 0);

  // Compute fee-weighted TVL shares
  let totalFeeWeight = 0;
  const feeWeights = populated.map((b) => {
    const w = feeWeight(b.binId - activeBinId) * b.totalUsd;
    totalFeeWeight += w;
    return w;
  });

  // Build dominance records
  const binDominance: BinDominance[] = populated.map((b, i) => ({
    binId: b.binId,
    distanceFromActive: b.binId - activeBinId,
    totalUsd: b.totalUsd,
    tvlSharePct: scannedTvl > 0 ? (b.totalUsd / scannedTvl) * 100 : 0,
    feeSharePct: totalFeeWeight > 0 ? (feeWeights[i] / totalFeeWeight) * 100 : 0,
    combinedDominance: 0,
    tier: "DUST" as DominanceTier,
    cumulativeTvlPct: 0,
    rank: 0,
  }));

  // Combined dominance: 60% TVL share + 40% fee share
  for (const b of binDominance) {
    b.combinedDominance = b.tvlSharePct * 0.6 + b.feeSharePct * 0.4;
    b.tier = classifyTier(b.combinedDominance);
  }

  // Sort by combined dominance descending and assign ranks
  binDominance.sort((a, b) => b.combinedDominance - a.combinedDominance);
  let cumulativePct = 0;
  for (let i = 0; i < binDominance.length; i++) {
    binDominance[i].rank = i + 1;
    cumulativePct += binDominance[i].tvlSharePct;
    binDominance[i].cumulativeTvlPct = cumulativePct;
  }

  // Concentration metrics
  const tvlShares = binDominance.map((b) => b.tvlSharePct);
  const hhi = computeHHI(tvlShares);
  const gini = computeGini(populated.map((b) => b.totalUsd));

  const top1Pct = tvlShares.length >= 1 ? tvlShares[0] : 0;
  const top3Pct = tvlShares.slice(0, 3).reduce((s, v) => s + v, 0);
  const top5Pct = tvlShares.slice(0, 5).reduce((s, v) => s + v, 0);
  const top10Pct = tvlShares.slice(0, 10).reduce((s, v) => s + v, 0);

  // Power law fit
  const ranks = binDominance.map((_, i) => i + 1);
  const values = binDominance.map((b) => b.totalUsd);
  const { exponent: powerLawExponent, rSquared: powerLawFit } = fitPowerLaw(ranks, values);
  const isPowerLaw = powerLawFit >= 0.85 && powerLawExponent > 0.5;

  // Tier distribution
  const tierCounts: Record<DominanceTier, number> = { DOMINANT: 0, MAJOR: 0, MODERATE: 0, MINOR: 0, DUST: 0 };
  const tierTvl: Record<DominanceTier, number> = { DOMINANT: 0, MAJOR: 0, MODERATE: 0, MINOR: 0, DUST: 0 };
  for (const b of binDominance) {
    tierCounts[b.tier]++;
    tierTvl[b.tier] += b.totalUsd;
  }

  // Left/right dominance asymmetry
  let leftTvl = 0;
  let rightTvl = 0;
  for (const b of binDominance) {
    if (b.distanceFromActive < 0) leftTvl += b.totalUsd;
    else if (b.distanceFromActive > 0) rightTvl += b.totalUsd;
  }
  const sideTvl = leftTvl + rightTvl;
  const leftPct = sideTvl > 0 ? (leftTvl / sideTvl) * 100 : 50;
  const rightPct = sideTvl > 0 ? (rightTvl / sideTvl) * 100 : 50;
  const skewDiff = Math.abs(leftPct - rightPct);
  let dominanceSkew = "BALANCED";
  if (skewDiff > 40) dominanceSkew = leftPct > rightPct ? "HEAVY LEFT (token X dominant)" : "HEAVY RIGHT (token Y dominant)";
  else if (skewDiff > 20) dominanceSkew = leftPct > rightPct ? "LEFT-LEANING" : "RIGHT-LEANING";

  // HHI classification
  let hhiClassification = "Dispersed (competitive)";
  if (hhi >= HHI_CONCENTRATED) hhiClassification = "Highly concentrated";
  else if (hhi >= HHI_MODERATE) hhiClassification = "Moderately concentrated";

  // ASCII dominance chart
  const asciiChart = buildAsciiChart(binDominance.slice(0, 20), activeBinId);

  // Recommendation
  const recommendation = buildRecommendation(
    hhi, hhiClassification, isPowerLaw, top1Pct, top3Pct, gini,
    dominanceSkew, tierCounts, populated.length
  );

  return {
    poolId: pool.poolId!,
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    feeBps: pool.feeBps ?? 0,
    activeBinId,
    binsScanned: rawBins.length,
    binsPopulated: populated.length,
    scannedTvlUsd: scannedTvl,
    hhi: Math.round(hhi),
    hhiClassification,
    top1Pct,
    top3Pct,
    top5Pct,
    top10Pct,
    giniCoefficient: Math.round(gini * 1000) / 1000,
    powerLawExponent: Math.round(powerLawExponent * 100) / 100,
    powerLawFit: Math.round(powerLawFit * 1000) / 1000,
    isPowerLaw,
    tierCounts,
    tierTvl,
    bins: binDominance,
    topBins: binDominance.slice(0, 10),
    leftDominancePct: Math.round(leftPct * 10) / 10,
    rightDominancePct: Math.round(rightPct * 10) / 10,
    dominanceSkew,
    recommendation,
    asciiChart,
  };
}

function buildAsciiChart(bins: BinDominance[], activeBinId: number): string {
  if (bins.length === 0) return "(no populated bins)";
  const maxDom = Math.max(...bins.map((b) => b.combinedDominance));
  const barWidth = 40;
  const lines: string[] = ["  Bin  | Dist | Dominance | Tier     | Bar"];
  lines.push("-------+------+-----------+----------+" + "-".repeat(barWidth + 1));

  for (const b of bins) {
    const dist = b.distanceFromActive >= 0
      ? `+${b.distanceFromActive}`.padStart(4)
      : `${b.distanceFromActive}`.padStart(4);
    const barLen = maxDom > 0 ? Math.round((b.combinedDominance / maxDom) * barWidth) : 0;
    const marker = b.binId === activeBinId ? "*" : " ";
    const tierStr = b.tier.padEnd(8);
    const domStr = fmtPct(b.combinedDominance).padStart(8);
    lines.push(
      `${marker}${b.binId.toString().padStart(5)} | ${dist} | ${domStr}  | ${tierStr} | ${"█".repeat(barLen)}`
    );
  }
  return lines.join("\n");
}

function buildRecommendation(
  hhi: number,
  hhiClass: string,
  isPowerLaw: boolean,
  top1Pct: number,
  top3Pct: number,
  gini: number,
  skew: string,
  tierCounts: Record<DominanceTier, number>,
  populatedCount: number
): string {
  const parts: string[] = [];

  if (hhi >= HHI_CONCENTRATED) {
    parts.push(
      `⚠️ HIGH CONCENTRATION — HHI ${hhi} (${hhiClass}). ` +
      `Top bin controls ${fmtPct(top1Pct)} of scanned TVL. ` +
      "Liquidity is dangerously concentrated — a single bin removal would significantly impact pool depth."
    );
  } else if (hhi >= HHI_MODERATE) {
    parts.push(
      `📊 MODERATE CONCENTRATION — HHI ${hhi}. Top 3 bins hold ${fmtPct(top3Pct)}. ` +
      "Some concentration but within normal range for DLMM pools."
    );
  } else {
    parts.push(
      `✅ DISPERSED LIQUIDITY — HHI ${hhi}. Liquidity is well-distributed across bins. ` +
      "Pool is resilient to single-bin removals."
    );
  }

  if (isPowerLaw) {
    parts.push(
      "📈 Power law distribution detected — a few bins dominate while most hold dust. " +
      "Typical of whale-dominated pools."
    );
  }

  if (gini > 0.7) {
    parts.push(`⚠️ High Gini (${gini.toFixed(2)}) — extreme inequality in capital distribution.`);
  } else if (gini > 0.5) {
    parts.push(`📊 Moderate Gini (${gini.toFixed(2)}) — some inequality but not extreme.`);
  }

  if (skew.includes("HEAVY")) {
    parts.push(`📐 ${skew} — liquidity is asymmetric around the active bin. One-sided depletion risk.`);
  }

  if (tierCounts.DOMINANT >= 3) {
    parts.push(
      `🏛️ ${tierCounts.DOMINANT} DOMINANT bins — oligopoly structure. ` +
      "Monitor for coordinated removal risk."
    );
  }

  if (tierCounts.DUST > populatedCount * 0.7) {
    parts.push(
      `🧹 ${tierCounts.DUST} DUST bins (${fmtPct((tierCounts.DUST / populatedCount) * 100)} of populated). ` +
      "Most bins hold negligible liquidity — effective depth is much narrower than bin count suggests."
    );
  }

  return parts.join("\n\n");
}

// -- Output -------------------------------------------------------------------

function printAnalysis(a: DominanceAnalysis, format: string): void {
  if (format === "json") {
    console.log(JSON.stringify(a, null, 2));
    return;
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(`  HODLMM BIN DOMINANCE — ${a.pair} (Pool #${a.poolId})`);
  console.log(`${"=".repeat(72)}`);
  console.log(`  TVL: $${fmtUsd(a.tvlUsd)}  |  Vol 24h: $${fmtUsd(a.volume24hUsd)}  |  Fee: ${a.feeBps} bps`);
  console.log(`  Active Bin: ${a.activeBinId}  |  Scanned: ${a.binsScanned} bins  |  Populated: ${a.binsPopulated}`);
  console.log(`  Scanned TVL: $${fmtUsd(a.scannedTvlUsd)}`);

  console.log(`\n── Concentration Metrics ${"─".repeat(47)}`);
  console.log(`  HHI:          ${a.hhi.toLocaleString().padStart(6)}  (${a.hhiClassification})`);
  console.log(`  Gini:         ${a.giniCoefficient.toFixed(3).padStart(6)}`);
  console.log(`  Top 1 bin:    ${fmtPct(a.top1Pct).padStart(6)} of scanned TVL`);
  console.log(`  Top 3 bins:   ${fmtPct(a.top3Pct).padStart(6)} of scanned TVL`);
  console.log(`  Top 5 bins:   ${fmtPct(a.top5Pct).padStart(6)} of scanned TVL`);
  console.log(`  Top 10 bins:  ${fmtPct(a.top10Pct).padStart(6)} of scanned TVL`);

  console.log(`\n── Power Law Analysis ${"─".repeat(50)}`);
  console.log(`  Exponent:  ${a.powerLawExponent.toFixed(2)}  (higher = steeper drop-off)`);
  console.log(`  R² fit:    ${a.powerLawFit.toFixed(3)}  (>0.85 = power law)`);
  console.log(`  Verdict:   ${a.isPowerLaw ? "⚡ Power law — whale-dominated" : "📊 Not power law — more evenly spread"}`);

  console.log(`\n── Dominance Tiers ${"─".repeat(53)}`);
  const tiers: DominanceTier[] = ["DOMINANT", "MAJOR", "MODERATE", "MINOR", "DUST"];
  for (const t of tiers) {
    const count = a.tierCounts[t];
    const tvl = a.tierTvl[t];
    const pct = a.scannedTvlUsd > 0 ? (tvl / a.scannedTvlUsd) * 100 : 0;
    console.log(`  ${t.padEnd(10)} ${String(count).padStart(3)} bins  |  $${fmtUsd(tvl).padStart(8)}  |  ${fmtPct(pct).padStart(6)}`);
  }

  console.log(`\n── Directional Skew ${"─".repeat(52)}`);
  console.log(`  Left (< active):  ${fmtPct(a.leftDominancePct).padStart(6)}  |  Right (> active): ${fmtPct(a.rightDominancePct).padStart(6)}`);
  console.log(`  Skew: ${a.dominanceSkew}`);

  console.log(`\n── Top 10 Dominant Bins ${"─".repeat(49)}`);
  console.log(`  Rank | Bin    | Dist  | TVL        | TVL %  | Fee %  | Combined | Tier     | Cumul%`);
  console.log(`  -----+--------+-------+------------+--------+--------+----------+----------+-------`);
  for (const b of a.topBins) {
    const dist = b.distanceFromActive >= 0 ? `+${b.distanceFromActive}` : `${b.distanceFromActive}`;
    console.log(
      `  ${String(b.rank).padStart(4)} | ${String(b.binId).padStart(6)} | ${dist.padStart(5)} | $${fmtUsd(b.totalUsd).padStart(9)} | ${fmtPct(b.tvlSharePct).padStart(6)} | ${fmtPct(b.feeSharePct).padStart(6)} | ${fmtPct(b.combinedDominance).padStart(8)} | ${b.tier.padEnd(8)} | ${fmtPct(b.cumulativeTvlPct).padStart(6)}`
    );
  }

  console.log(`\n── Dominance Chart (Top 20) ${"─".repeat(44)}`);
  console.log(a.asciiChart);

  console.log(`\n── Recommendation ${"─".repeat(54)}`);
  console.log(a.recommendation);
  console.log();
}

// -- Main ---------------------------------------------------------------------

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("hodlmm-bin-dominance")
    .description("HODLMM Bin Dominance Analyzer — identifies which bins control the pool")
    .option("-p, --pool <id>", "Pool ID to analyze")
    .option("-s, --search <pair>", "Search for pool by token pair (e.g. STX/sBTC)")
    .option("-r, --radius <n>", "Bin scan radius", String(BIN_SCAN_RADIUS))
    .option("-f, --format <fmt>", "Output format: text | json", "text")
    .parse(process.argv);

  const opts = program.opts();
  const radius = parseInt(opts.radius) || BIN_SCAN_RADIUS;
  const format = opts.format || "text";

  console.log("🔍 Discovering HODLMM pools...");
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

  console.log(`📊 Analyzing ${targetPool.token0Symbol}/${targetPool.token1Symbol} (Pool #${targetPool.poolId})...`);

  const activeBin = targetPool.activeBinId ?? (await getActiveBin(targetPool.poolId!));
  console.log(`  Active bin: ${activeBin}, scanning ±${radius} bins...`);

  const rawBins = await scanBins(targetPool.poolId!, activeBin, targetPool, radius);
  const analysis = analyzeDominance(targetPool, activeBin, rawBins);

  printAnalysis(analysis, format);
}

main().catch((err) => {
  console.error("Fatal:", err.message ?? err);
  process.exit(1);
});
