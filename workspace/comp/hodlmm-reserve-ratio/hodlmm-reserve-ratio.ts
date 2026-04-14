#!/usr/bin/env bun
/**
 * hodlmm-reserve-ratio.ts
 *
 * HODLMM Reserve Ratio — Pool-wide token reserve balance tracker for DLMM pools.
 * Monitors the ratio of token0 to token1 reserves across all active bins,
 * detecting imbalance trends and providing alerts when ratios hit extreme levels.
 *
 * Key metrics:
 *  - Pool-wide reserve ratio: token0 value as a % of total pool value
 *  - Balance state classification: BALANCED / TILTED / IMBALANCED / CRITICAL
 *  - Depletion direction: which token is being drained by trading pressure
 *  - Ratio walls: clusters of bins concentrated in one token (liquidity walls)
 *  - Effective depth: how much can be sold before reserves on one side hit zero
 *  - LP guidance: which token to add and rebalancing signals
 *  - ASCII ratio distribution chart
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 69).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 500;
const DEFAULT_SCAN_RADIUS = 15;   // bins on each side of active bin
const BATCH_SIZE = 5;              // concurrent contract calls
const WALL_THRESHOLD = 0.85;       // bin ratio >= this = "ratio wall" for that token
const BALANCED_LOW = 0.40;         // 40% token0 lower bound for BALANCED
const BALANCED_HIGH = 0.60;        // 60% token0 upper bound for BALANCED
const TILTED_LOW = 0.30;
const TILTED_HIGH = 0.70;
const IMBALANCED_LOW = 0.20;
const IMBALANCED_HIGH = 0.80;

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

interface BinReserve {
  binId: number;
  reserveX: bigint;
  reserveY: bigint;
  reserveXUsd: number;
  reserveYUsd: number;
  totalUsd: number;
  token0Ratio: number;   // 0.0 = 100% token1, 1.0 = 100% token0
  distanceFromActive: number; // signed: negative = below active, positive = above
  isToken0Wall: boolean;
  isToken1Wall: boolean;
}

type BalanceState = "BALANCED" | "TILTED" | "IMBALANCED" | "CRITICAL";
type DrainDirection = "TOKEN0_DRAINING" | "TOKEN1_DRAINING" | "EVEN" | "UNKNOWN";

interface RatioWall {
  startBin: number;
  endBin: number;
  binCount: number;
  dominantToken: "TOKEN0" | "TOKEN1";
  avgRatio: number;
  totalUsd: number;
  distanceFromActive: number;
}

interface EffectiveDepth {
  token0SellDepthUsd: number;  // USD value of token0 available to sell
  token1SellDepthUsd: number;  // USD value of token1 available to sell
  token0BinsUntilEmpty: number;
  token1BinsUntilEmpty: number;
}

interface ReserveRatioAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsWithLiquidity: number;
  totalToken0Usd: number;
  totalToken1Usd: number;
  totalPoolUsd: number;
  poolToken0Ratio: number;   // token0 value / total value
  poolToken0Pct: number;
  poolToken1Pct: number;
  balanceState: BalanceState;
  drainDirection: DrainDirection;
  drainConfidence: number;   // 0-100
  ratioWalls: RatioWall[];
  effectiveDepth: EffectiveDepth;
  perBinRatios: BinReserve[];
  lpGuidance: string;
  riskFlags: string[];
  verdict: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string, retries = 3): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (!r.ok) {
        if (r.status === 429 && i < retries) {
          await sleep(2500 * (i + 1));
          continue;
        }
        throw new Error(`HTTP ${r.status} for ${url}`);
      }
      return r.json();
    } catch (e: any) {
      if (i === retries) throw e;
      await sleep(1200 * (i + 1));
    }
  }
}

function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`;
}

function profileBar(pct: number, width = 20): string {
  const filled = Math.round((pct / 100) * width);
  return "█".repeat(Math.min(filled, width)) + "░".repeat(Math.max(width - filled, 0));
}

function encodeUint(n: number): string {
  return "0x01" + n.toString(16).padStart(32, "0");
}

function parseReservesFromRepr(repr: string): { reserveX: bigint; reserveY: bigint } {
  const xMatch = repr.match(/reserve-x\s+u(\d+)/);
  const yMatch = repr.match(/reserve-y\s+u(\d+)/);
  return {
    reserveX: xMatch ? BigInt(xMatch[1]) : 0n,
    reserveY: yMatch ? BigInt(yMatch[1]) : 0n,
  };
}

function balanceStateIcon(state: BalanceState): string {
  switch (state) {
    case "BALANCED":   return "[OK]";
    case "TILTED":     return "[~]";
    case "IMBALANCED": return "[!]";
    case "CRITICAL":   return "[!!]";
  }
}

function drainIcon(dir: DrainDirection): string {
  switch (dir) {
    case "TOKEN0_DRAINING": return "(-T0)";
    case "TOKEN1_DRAINING": return "(-T1)";
    case "EVEN":            return "(=)";
    case "UNKNOWN":         return "(?)";
  }
}

function classifyBalance(token0Ratio: number): BalanceState {
  const r = token0Ratio;
  if (r >= BALANCED_LOW && r <= BALANCED_HIGH) return "BALANCED";
  if (r >= TILTED_LOW && r <= TILTED_HIGH)     return "TILTED";
  if (r >= IMBALANCED_LOW && r <= IMBALANCED_HIGH) return "IMBALANCED";
  return "CRITICAL";
}

// ── Data Fetching ─────────────────────────────────────────────────────────────

async function fetchPools(): Promise<AppPool[]> {
  const allPools: any[] = [];
  let url = `${BFF_APP_BASE}/pools?limit=50`;
  for (let page = 0; page < 10; page++) {
    const data = await fetchJson(url);
    const items: any[] = Array.isArray(data) ? data : data?.data ?? data?.pools ?? [];
    allPools.push(...items);
    if (!data?.hasMore || !data?.nextCursor) break;
    url = `${BFF_APP_BASE}/pools?limit=50&cursor=${encodeURIComponent(data.nextCursor)}`;
  }

  return allPools
    .filter((p: any) => {
      const types: string[] = p.types ?? [];
      return types.includes("DLMM") || types.includes("ALL_POOLS");
    })
    .map((p: any) => {
      const tx = p.tokens?.tokenX ?? {};
      const ty = p.tokens?.tokenY ?? {};
      const rawId: string = String(p.poolId ?? "0");
      const numericId = parseInt(rawId.replace(/\D+/g, "")) || 0;
      const feeBps = p.baseFee != null
        ? parseFloat(String(p.baseFee)) * 10_000
        : parseFloat(p.feeBps ?? "30");
      return {
        id: rawId,
        token0Symbol: tx.symbol ?? p.token0Symbol ?? "?",
        token1Symbol: ty.symbol ?? p.token1Symbol ?? "?",
        tvlUsd: parseFloat(String(p.tvlUsd ?? "0")),
        volume24hUsd: parseFloat(String(p.volumeUsd1d ?? p.volume24hUsd ?? "0")),
        poolId: numericId,
        token0Decimals: parseInt(String(tx.decimals ?? p.token0Decimals ?? "6")),
        token1Decimals: parseInt(String(ty.decimals ?? p.token1Decimals ?? "6")),
        token0PriceUsd: parseFloat(String(tx.priceUsd ?? p.token0PriceUsd ?? "0")),
        token1PriceUsd: parseFloat(String(ty.priceUsd ?? p.token1PriceUsd ?? "0")),
        activeBinId: parseInt(String(p.activeBinId ?? "0")) || undefined,
        feeBps,
      } as AppPool;
    })
    .filter((p: AppPool) => p.tvlUsd >= MIN_TVL_USD);
}

function findPool(query: string, pools: AppPool[]): AppPool | null {
  const q = query.toLowerCase();
  return (
    pools.find((p) => String(p.poolId) === q) ??
    pools.find((p) => p.id?.toLowerCase() === q) ??
    pools.find((p) => {
      const pair = `${p.token0Symbol}-${p.token1Symbol}`.toLowerCase();
      return pair.includes(q) || q.includes(pair);
    }) ??
    pools.find((p) => {
      const sym = `${p.token0Symbol}${p.token1Symbol}`.toLowerCase();
      return sym.includes(q);
    }) ??
    null
  );
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

async function fetchActiveBinId(poolId: number): Promise<number | null> {
  try {
    const result = await callReadOnly("get-active-bin-id", [encodeUint(poolId)]);
    const repr: string = result.result ?? "";
    const match = repr.match(/u(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}

async function fetchBinReserveData(
  poolId: number,
  binId: number,
  pool: AppPool
): Promise<BinReserve | null> {
  try {
    const result = await callReadOnly("get-bin", [encodeUint(poolId), encodeUint(binId)]);
    const repr: string = result.result ?? "";
    if (!repr || repr === "none") return null;

    const { reserveX, reserveY } = parseReservesFromRepr(repr);
    const xDecimals = pool.token0Decimals || 6;
    const yDecimals = pool.token1Decimals || 6;
    const xPrice = pool.token0PriceUsd || 0;
    const yPrice = pool.token1PriceUsd || 0;

    const reserveXUsd = (Number(reserveX) / Math.pow(10, xDecimals)) * xPrice;
    const reserveYUsd = (Number(reserveY) / Math.pow(10, yDecimals)) * yPrice;
    const totalUsd = reserveXUsd + reserveYUsd;

    if (totalUsd < 0.01) return null;

    const token0Ratio = reserveXUsd / totalUsd;

    return {
      binId,
      reserveX,
      reserveY,
      reserveXUsd,
      reserveYUsd,
      totalUsd,
      token0Ratio,
      distanceFromActive: 0, // set by caller
      isToken0Wall: token0Ratio >= WALL_THRESHOLD,
      isToken1Wall: token0Ratio <= (1 - WALL_THRESHOLD),
    };
  } catch {
    return null;
  }
}

// ── Bin Scanning ──────────────────────────────────────────────────────────────

async function scanBins(
  poolId: number,
  activeBinId: number,
  radius: number,
  pool: AppPool
): Promise<BinReserve[]> {
  // Build list of bin IDs to scan: active ± radius
  const binIds: number[] = [];
  for (let offset = -radius; offset <= radius; offset++) {
    binIds.push(activeBinId + offset);
  }

  const results: BinReserve[] = [];

  for (let i = 0; i < binIds.length; i += BATCH_SIZE) {
    const batch = binIds.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (binId) => {
        const data = await fetchBinReserveData(poolId, binId, pool);
        if (!data) return null;
        data.distanceFromActive = binId - activeBinId;
        return data;
      })
    );
    for (const r of batchResults) {
      if (r) results.push(r);
    }
    if (i + BATCH_SIZE < binIds.length) await sleep(200);
  }

  return results.sort((a, b) => a.binId - b.binId);
}

// ── Analysis ──────────────────────────────────────────────────────────────────

function detectRatioWalls(bins: BinReserve[]): RatioWall[] {
  const walls: RatioWall[] = [];

  // Scan for consecutive bins heavily concentrated in one token
  let wallStart: number | null = null;
  let wallToken: "TOKEN0" | "TOKEN1" | null = null;
  let wallBins: BinReserve[] = [];

  const flushWall = () => {
    if (wallStart === null || wallBins.length < 2) return;
    const avgRatio = wallBins.reduce((s, b) => s + b.token0Ratio, 0) / wallBins.length;
    const totalUsd = wallBins.reduce((s, b) => s + b.totalUsd, 0);
    const midBin = wallBins[Math.floor(wallBins.length / 2)];
    walls.push({
      startBin: wallBins[0].binId,
      endBin: wallBins[wallBins.length - 1].binId,
      binCount: wallBins.length,
      dominantToken: wallToken!,
      avgRatio,
      totalUsd,
      distanceFromActive: midBin.distanceFromActive,
    });
  };

  for (const bin of bins) {
    const isT0Wall = bin.isToken0Wall;
    const isT1Wall = bin.isToken1Wall;
    const currentToken: "TOKEN0" | "TOKEN1" | null = isT0Wall ? "TOKEN0" : isT1Wall ? "TOKEN1" : null;

    if (currentToken && currentToken === wallToken) {
      wallBins.push(bin);
    } else {
      flushWall();
      if (currentToken) {
        wallStart = bin.binId;
        wallToken = currentToken;
        wallBins = [bin];
      } else {
        wallStart = null;
        wallToken = null;
        wallBins = [];
      }
    }
  }
  flushWall();

  return walls.sort((a, b) => Math.abs(a.distanceFromActive) - Math.abs(b.distanceFromActive));
}

function detectDrainDirection(bins: BinReserve[], activeBinId: number): {
  direction: DrainDirection;
  confidence: number;
} {
  // Theory: if token0 is being drained, bins ABOVE active tend to be token1-heavy
  // (price moved up = token0 sold into pool). Bins BELOW active = token0-heavy
  // (token0 still sitting there, not yet reached by active trading).
  if (bins.length < 4) return { direction: "UNKNOWN", confidence: 0 };

  const aboveBins = bins.filter((b) => b.distanceFromActive > 0);
  const belowBins = bins.filter((b) => b.distanceFromActive < 0);

  if (aboveBins.length === 0 || belowBins.length === 0) return { direction: "UNKNOWN", confidence: 0 };

  const aboveAvgT0Ratio = aboveBins.reduce((s, b) => s + b.token0Ratio, 0) / aboveBins.length;
  const belowAvgT0Ratio = belowBins.reduce((s, b) => s + b.token0Ratio, 0) / belowBins.length;

  const diff = Math.abs(aboveAvgT0Ratio - belowAvgT0Ratio);

  // If above bins are token1-heavy (low token0 ratio) and below are token0-heavy:
  // token0 was consumed by upward price movement => TOKEN0_DRAINING
  if (aboveAvgT0Ratio < 0.45 && belowAvgT0Ratio > 0.55) {
    const confidence = Math.min(100, Math.round(diff * 200));
    return { direction: "TOKEN0_DRAINING", confidence };
  }

  // If above bins are token0-heavy and below are token1-heavy:
  // token1 was consumed by downward price movement => TOKEN1_DRAINING
  if (aboveAvgT0Ratio > 0.55 && belowAvgT0Ratio < 0.45) {
    const confidence = Math.min(100, Math.round(diff * 200));
    return { direction: "TOKEN1_DRAINING", confidence };
  }

  // Roughly symmetric
  if (diff < 0.10) return { direction: "EVEN", confidence: Math.round((1 - diff * 5) * 60) };

  return { direction: "UNKNOWN", confidence: 0 };
}

function computeEffectiveDepth(bins: BinReserve[]): EffectiveDepth {
  // token0 sell depth = sum of token0 USD across all bins (how much token0 can be sold)
  // token1 sell depth = sum of token1 USD across all bins
  // bins until empty = how many bins until a token reaches near-zero reserves
  let token0SellDepthUsd = 0;
  let token1SellDepthUsd = 0;

  for (const b of bins) {
    token0SellDepthUsd += b.reserveXUsd;
    token1SellDepthUsd += b.reserveYUsd;
  }

  // Count consecutive bins (outward from active) until token drops below 5%
  const sortedAbove = bins.filter((b) => b.distanceFromActive >= 0).sort((a, b) => a.distanceFromActive - b.distanceFromActive);
  const sortedBelow = bins.filter((b) => b.distanceFromActive <= 0).sort((a, b) => b.distanceFromActive - a.distanceFromActive);

  // token0 depth (how many bins above have meaningful token0 before empty)
  let token0BinsUntilEmpty = 0;
  for (const b of sortedAbove) {
    if (b.token0Ratio < 0.05) break;
    token0BinsUntilEmpty++;
  }

  // token1 depth (how many bins below have meaningful token1 before empty)
  let token1BinsUntilEmpty = 0;
  for (const b of sortedBelow) {
    if (b.token0Ratio > 0.95) break;
    token1BinsUntilEmpty++;
  }

  return { token0SellDepthUsd, token1SellDepthUsd, token0BinsUntilEmpty, token1BinsUntilEmpty };
}

// ── Core Pool Analysis ────────────────────────────────────────────────────────

async function analyzePool(pool: AppPool, scanRadius = DEFAULT_SCAN_RADIUS): Promise<ReserveRatioAnalysis> {
  const poolId = pool.poolId ?? parseInt(pool.id, 10);

  // Resolve active bin
  let activeBinId = pool.activeBinId ?? 0;
  if (!activeBinId) {
    const fetched = await fetchActiveBinId(poolId);
    activeBinId = fetched ?? 0;
  }

  if (!activeBinId) {
    // Return empty analysis
    return emptyAnalysis(pool, poolId);
  }

  const bins = await scanBins(poolId, activeBinId, scanRadius, pool);

  const totalToken0Usd = bins.reduce((s, b) => s + b.reserveXUsd, 0);
  const totalToken1Usd = bins.reduce((s, b) => s + b.reserveYUsd, 0);
  const totalPoolUsd = totalToken0Usd + totalToken1Usd;

  const poolToken0Ratio = totalPoolUsd > 0 ? totalToken0Usd / totalPoolUsd : 0.5;
  const poolToken0Pct = poolToken0Ratio * 100;
  const poolToken1Pct = 100 - poolToken0Pct;

  const balanceState = classifyBalance(poolToken0Ratio);
  const { direction: drainDirection, confidence: drainConfidence } = detectDrainDirection(bins, activeBinId);
  const ratioWalls = detectRatioWalls(bins);
  const effectiveDepth = computeEffectiveDepth(bins);

  // Risk flags
  const riskFlags: string[] = [];
  if (bins.length < 5) riskFlags.push("LOW_SCAN_DATA: fewer than 5 bins with liquidity found");
  if (balanceState === "CRITICAL") {
    riskFlags.push(`CRITICAL_IMBALANCE: pool is ${poolToken0Pct.toFixed(1)}% token0 — severe reserve depletion`);
  } else if (balanceState === "IMBALANCED") {
    riskFlags.push(`IMBALANCE: pool is ${poolToken0Pct.toFixed(1)}% token0 — one token significantly depleted`);
  }
  if (ratioWalls.length >= 2) riskFlags.push(`RATIO_WALLS: ${ratioWalls.length} concentrated token walls detected — potential price resistance`);
  if (effectiveDepth.token0BinsUntilEmpty <= 3 && effectiveDepth.token0SellDepthUsd < pool.tvlUsd * 0.15) {
    riskFlags.push("TOKEN0_SHALLOW: effective token0 depth is very low — large buy may exhaust reserves");
  }
  if (effectiveDepth.token1BinsUntilEmpty <= 3 && effectiveDepth.token1SellDepthUsd < pool.tvlUsd * 0.15) {
    riskFlags.push("TOKEN1_SHALLOW: effective token1 depth is very low — large sell may exhaust reserves");
  }
  if (drainDirection !== "EVEN" && drainDirection !== "UNKNOWN" && drainConfidence > 60) {
    const draining = drainDirection === "TOKEN0_DRAINING" ? pool.token0Symbol : pool.token1Symbol;
    riskFlags.push(`ACTIVE_DRAIN: ${draining} reserves draining (${drainConfidence}% confidence)`);
  }

  // LP guidance
  let lpGuidance: string;
  if (bins.length < 3) {
    lpGuidance = "Insufficient bin data. Wait for more on-chain activity before making LP decisions.";
  } else if (balanceState === "CRITICAL") {
    const depleted = poolToken0Ratio < IMBALANCED_LOW ? pool.token0Symbol : pool.token1Symbol;
    const abundant = depleted === pool.token0Symbol ? pool.token1Symbol : pool.token0Symbol;
    lpGuidance = `CRITICAL imbalance — ${depleted} nearly exhausted. Adding ${depleted} liquidity now captures high fee rates. Avoid adding ${abundant} until rebalancing occurs.`;
  } else if (balanceState === "IMBALANCED") {
    const light = poolToken0Ratio < 0.5 ? pool.token0Symbol : pool.token1Symbol;
    lpGuidance = `Pool is significantly tilted. Consider adding ${light} to improve balance and earn asymmetric fees as price reverts.`;
  } else if (balanceState === "TILTED") {
    const light = poolToken0Ratio < 0.5 ? pool.token0Symbol : pool.token1Symbol;
    lpGuidance = `Mild tilt toward ${poolToken0Ratio < 0.5 ? pool.token1Symbol : pool.token0Symbol}. ${light} LPs are underrepresented — consider single-sided ${light} deposit.`;
  } else if (drainDirection !== "EVEN" && drainDirection !== "UNKNOWN") {
    const draining = drainDirection === "TOKEN0_DRAINING" ? pool.token0Symbol : pool.token1Symbol;
    lpGuidance = `Pool balanced but ${draining} is being actively consumed. Monitor closely — imbalance may develop. Consider tighter range on ${draining} side.`;
  } else {
    lpGuidance = `Pool reserves are well-balanced (${fmtPct(poolToken0Pct)} ${pool.token0Symbol} / ${fmtPct(poolToken1Pct)} ${pool.token1Symbol}). Symmetric LP positioning is optimal.`;
  }

  const verdict = `${balanceStateIcon(balanceState)} ${balanceState} | ${fmtPct(poolToken0Pct)} ${pool.token0Symbol} / ${fmtPct(poolToken1Pct)} ${pool.token1Symbol} | ${drainIcon(drainDirection)} ${drainDirection} (${drainConfidence}% conf) | ${ratioWalls.length} ratio walls | Depth T0: ${fmtUsd(effectiveDepth.token0SellDepthUsd)} / T1: ${fmtUsd(effectiveDepth.token1SellDepthUsd)}`;

  return {
    poolId,
    pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    feeBps: pool.feeBps ?? 30,
    activeBinId,
    binsScanned: scanRadius * 2 + 1,
    binsWithLiquidity: bins.length,
    totalToken0Usd,
    totalToken1Usd,
    totalPoolUsd,
    poolToken0Ratio,
    poolToken0Pct,
    poolToken1Pct,
    balanceState,
    drainDirection,
    drainConfidence,
    ratioWalls,
    effectiveDepth,
    perBinRatios: bins,
    lpGuidance,
    riskFlags,
    verdict,
  };
}

function emptyAnalysis(pool: AppPool, poolId: number): ReserveRatioAnalysis {
  return {
    poolId,
    pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    feeBps: pool.feeBps ?? 30,
    activeBinId: 0,
    binsScanned: 0,
    binsWithLiquidity: 0,
    totalToken0Usd: 0,
    totalToken1Usd: 0,
    totalPoolUsd: 0,
    poolToken0Ratio: 0.5,
    poolToken0Pct: 50,
    poolToken1Pct: 50,
    balanceState: "BALANCED",
    drainDirection: "UNKNOWN",
    drainConfidence: 0,
    ratioWalls: [],
    effectiveDepth: { token0SellDepthUsd: 0, token1SellDepthUsd: 0, token0BinsUntilEmpty: 0, token1BinsUntilEmpty: 0 },
    perBinRatios: [],
    lpGuidance: "Unable to resolve active bin — no on-chain data available.",
    riskFlags: ["NO_ACTIVE_BIN: could not determine active bin for this pool"],
    verdict: "No data available.",
  };
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderAnalysis(a: ReserveRatioAnalysis, json: boolean): string {
  if (json) return JSON.stringify(a, null, 2);

  const lines: string[] = [];

  lines.push(`\n${"═".repeat(72)}`);
  lines.push(`  HODLMM RESERVE RATIO — ${a.pair} (Pool #${a.poolId})`);
  lines.push(`${"═".repeat(72)}`);
  lines.push(`  TVL: ${fmtUsd(a.tvlUsd)}  |  Vol 24h: ${fmtUsd(a.volume24hUsd)}  |  Fee: ${a.feeBps} bps  |  Active Bin: ${a.activeBinId}`);
  lines.push(`  Bins Scanned: ${a.binsScanned}  |  Bins with Liquidity: ${a.binsWithLiquidity}  |  Pool USD Tracked: ${fmtUsd(a.totalPoolUsd)}`);
  lines.push(`${"─".repeat(72)}`);

  // Pool-wide balance
  lines.push(`  ## Reserve Ratio Analysis`);
  lines.push(``);
  lines.push(`  Pool Token0 (${a.pair.split("-")[0]}): ${fmtUsd(a.totalToken0Usd)} (${fmtPct(a.poolToken0Pct)})`);
  lines.push(`  Pool Token1 (${a.pair.split("-")[1]}): ${fmtUsd(a.totalToken1Usd)} (${fmtPct(a.poolToken1Pct)})`);
  lines.push(``);

  // Ratio bar (token0 proportion)
  const barWidth = 40;
  const t0Filled = Math.round((a.poolToken0Pct / 100) * barWidth);
  const t1Filled = barWidth - t0Filled;
  const ratioBar = "▓".repeat(Math.max(t0Filled, 0)) + "░".repeat(Math.max(t1Filled, 0));
  lines.push(`  [${ratioBar}]`);
  lines.push(`   ${a.pair.split("-")[0].padEnd(barWidth / 2 - 1)} ${a.pair.split("-")[1]}`);
  lines.push(``);

  // Balance state
  const stateLabel = a.balanceState === "BALANCED"   ? "BALANCED   (40%-60%)" :
                     a.balanceState === "TILTED"     ? "TILTED     (30%-40% or 60%-70%)" :
                     a.balanceState === "IMBALANCED" ? "IMBALANCED (20%-30% or 70%-80%)" :
                                                       "CRITICAL   (<20% or >80%)";
  lines.push(`  Balance State: ${balanceStateIcon(a.balanceState)} ${stateLabel}`);
  lines.push(`  Drain Direction: ${drainIcon(a.drainDirection)} ${a.drainDirection} (confidence: ${a.drainConfidence}%)`);
  lines.push(`${"─".repeat(72)}`);

  // Per-bin ratio distribution chart
  lines.push(`  BIN RESERVE RATIO DISTRIBUTION (token0 % per bin):`);
  lines.push(`  [bin dist from active] | ratio bar (T0% of bin) | state`);
  lines.push(``);

  const chartBins = a.perBinRatios.slice();
  for (const b of chartBins) {
    const distLabel = b.distanceFromActive === 0
      ? " [ACTIVE]"
      : b.distanceFromActive > 0
        ? `+${b.distanceFromActive}      `.slice(0, 9)
        : `${b.distanceFromActive}      `.slice(0, 9);
    const pct = b.token0Ratio * 100;
    const bar = profileBar(pct, 20);
    const wall = b.isToken0Wall ? " WALL-T0" : b.isToken1Wall ? " WALL-T1" : "";
    const active = b.distanceFromActive === 0 ? " <--" : "";
    lines.push(`  ${distLabel} | ${bar} ${fmtPct(pct)}${wall}${active}`);
  }
  lines.push(``);

  // Ratio walls
  if (a.ratioWalls.length > 0) {
    lines.push(`${"─".repeat(72)}`);
    lines.push(`  RATIO WALLS (${a.ratioWalls.length} detected):`);
    for (const w of a.ratioWalls) {
      const side = w.distanceFromActive > 0 ? "above" : w.distanceFromActive < 0 ? "below" : "at";
      lines.push(`  Bins ${w.startBin}-${w.endBin} | ${w.binCount} bins | ${w.dominantToken} dominant | avg ${fmtPct(w.dominantToken === "TOKEN0" ? w.avgRatio * 100 : (1 - w.avgRatio) * 100)} | ${fmtUsd(w.totalUsd)} | ${Math.abs(w.distanceFromActive)} bins ${side} active`);
    }
    lines.push(``);
  }

  // Effective depth
  lines.push(`${"─".repeat(72)}`);
  lines.push(`  EFFECTIVE DEPTH:`);
  lines.push(`  Token0 (${a.pair.split("-")[0]}) sell depth: ${fmtUsd(a.effectiveDepth.token0SellDepthUsd)} across ${a.effectiveDepth.token0BinsUntilEmpty} bins`);
  lines.push(`  Token1 (${a.pair.split("-")[1]}) sell depth: ${fmtUsd(a.effectiveDepth.token1SellDepthUsd)} across ${a.effectiveDepth.token1BinsUntilEmpty} bins`);
  lines.push(``);

  // LP guidance
  lines.push(`${"─".repeat(72)}`);
  lines.push(`  LP GUIDANCE: ${a.lpGuidance}`);
  lines.push(``);

  // Risk flags
  if (a.riskFlags.length > 0) {
    lines.push(`  RISK FLAGS:`);
    for (const f of a.riskFlags) {
      lines.push(`    * ${f}`);
    }
    lines.push(``);
  }

  // Verdict
  lines.push(`${"─".repeat(72)}`);
  lines.push(`  VERDICT: ${a.verdict}`);
  lines.push(`${"═".repeat(72)}\n`);

  return lines.join("\n");
}

function renderMultiSummary(analyses: ReserveRatioAnalysis[], json: boolean): string {
  if (json) return JSON.stringify(analyses, null, 2);

  const lines: string[] = [];
  lines.push(`\n${"═".repeat(80)}`);
  lines.push(`  HODLMM RESERVE RATIO — MULTI-POOL SUMMARY`);
  lines.push(`${"═".repeat(80)}`);
  lines.push(`  ${"Pair".padEnd(16)} ${"State".padEnd(12)} ${"T0%".padEnd(7)} ${"T1%".padEnd(7)} ${"Drain".padEnd(16)} ${"Walls".padEnd(6)} ${"Depth T0".padEnd(10)} Depth T1`);
  lines.push(`  ${"─".repeat(76)}`);

  for (const a of analyses) {
    const pair   = a.pair.padEnd(16);
    const state  = `${balanceStateIcon(a.balanceState)} ${a.balanceState}`.padEnd(12);
    const t0pct  = fmtPct(a.poolToken0Pct).padEnd(7);
    const t1pct  = fmtPct(a.poolToken1Pct).padEnd(7);
    const drain  = `${drainIcon(a.drainDirection)} ${a.drainDirection}`.padEnd(16);
    const walls  = String(a.ratioWalls.length).padEnd(6);
    const dt0    = fmtUsd(a.effectiveDepth.token0SellDepthUsd).padEnd(10);
    const dt1    = fmtUsd(a.effectiveDepth.token1SellDepthUsd);
    lines.push(`  ${pair} ${state} ${t0pct} ${t1pct} ${drain} ${walls} ${dt0} ${dt1}`);
  }

  lines.push(`${"═".repeat(80)}\n`);
  return lines.join("\n");
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-reserve-ratio")
  .description(
    "HODLMM Reserve Ratio — Pool-wide token reserve balance tracker for DLMM pools. " +
    "Monitors token0/token1 ratio across all bins, detects imbalance and depletion trends, " +
    "identifies ratio walls, and provides LP guidance based on reserve health."
  )
  .argument("[pool]", "Pool ID, pair name, or token symbol (e.g., 'STX-sBTC', '1')")
  .option("-j, --json", "Output as JSON", false)
  .option("-a, --all", "Analyze all DLMM pools with sufficient TVL", false)
  .option("-t, --top <n>", "Analyze top N pools by TVL", "0")
  .option("-r, --radius <n>", "Bin scan radius around active bin", String(DEFAULT_SCAN_RADIUS))
  .action(async (poolQuery: string | undefined, opts: any) => {
    const scanRadius = Math.max(1, Math.min(50, parseInt(opts.radius) || DEFAULT_SCAN_RADIUS));

    try {
      const pools = await fetchPools();
      if (pools.length === 0) {
        console.log("No DLMM pools found with sufficient TVL.");
        return;
      }

      if (opts.all || parseInt(opts.top) > 0) {
        const sorted = [...pools].sort((a, b) => b.tvlUsd - a.tvlUsd);
        const limit = parseInt(opts.top) > 0 ? parseInt(opts.top) : sorted.length;
        const targets = sorted.slice(0, Math.min(limit, 10));

        console.log(`Analyzing reserve ratios for ${targets.length} DLMM pool(s) (radius: ${scanRadius} bins)...\n`);
        const results: ReserveRatioAnalysis[] = [];

        for (const pool of targets) {
          try {
            const analysis = await analyzePool(pool, scanRadius);
            results.push(analysis);
            if (!opts.json) {
              process.stdout.write(`  OK ${pool.token0Symbol}-${pool.token1Symbol}: ${balanceStateIcon(analysis.balanceState)} ${analysis.balanceState} | T0: ${fmtPct(analysis.poolToken0Pct)}\n`);
            }
          } catch (e: any) {
            if (!opts.json) {
              process.stdout.write(`  ERR ${pool.token0Symbol}-${pool.token1Symbol}: ${e.message}\n`);
            }
          }
          await sleep(400);
        }

        if (results.length > 0) {
          console.log(renderMultiSummary(results, opts.json));
          if (!opts.json) {
            for (const r of results) {
              console.log(renderAnalysis(r, false));
            }
          }
        }
      } else {
        if (!poolQuery) {
          console.log("Usage: hodlmm-reserve-ratio <pool> [options]");
          console.log(`       hodlmm-reserve-ratio --top 5`);
          console.log(`       hodlmm-reserve-ratio --all --json\n`);
          console.log("Available DLMM pools:");
          const sorted = [...pools].sort((a, b) => b.tvlUsd - a.tvlUsd);
          for (const p of sorted.slice(0, 15)) {
            console.log(`  Pool #${p.poolId ?? "?"} | ${p.token0Symbol}-${p.token1Symbol} | TVL: ${fmtUsd(p.tvlUsd)}`);
          }
          return;
        }

        const pool = findPool(poolQuery, pools);
        if (!pool) {
          console.log(`Pool not found: "${poolQuery}"`);
          console.log("\nAvailable DLMM pools:");
          for (const p of pools.slice(0, 10)) {
            console.log(`  Pool #${p.poolId ?? "?"} | ${p.token0Symbol}-${p.token1Symbol}`);
          }
          return;
        }

        console.log(`Scanning reserve ratios for ${pool.token0Symbol}-${pool.token1Symbol} (radius: ${scanRadius} bins)...`);
        const analysis = await analyzePool(pool, scanRadius);
        console.log(renderAnalysis(analysis, opts.json));
      }
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });

program.parse();
