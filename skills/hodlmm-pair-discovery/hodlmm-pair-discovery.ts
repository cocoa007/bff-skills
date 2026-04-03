#!/usr/bin/env bun
/**
 * hodlmm-pair-discovery.ts
 *
 * HODLMM Pair Discovery — Scans all HODLMM pools to identify high-alpha
 * opportunities by measuring volume efficiency, LP competition density,
 * fee capture opportunity, and liquidity depth quality.
 *
 * Key metrics:
 *  - Volume efficiency: volume/TVL ratio (higher = more fee yield per $ deployed)
 *  - LP competition: unique addresses per $1k TVL (lower = less crowded)
 *  - Fee capture: estimated daily fees vs gas costs
 *  - Depth quality: how well liquidity is concentrated around active bin
 *  - Alpha score: composite 0-100 ranking of opportunity attractiveness
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 38).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const FULL_CONTRACT_ID = `${DLMM_CONTRACT_ADDR}.${DLMM_CONTRACT_NAME}`;
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 50;
const EVENTS_LIMIT = 50;
const FALLBACK_STX_PRICE_USD = 0.80;

// Alpha scoring weights
const WEIGHT_VOLUME_EFFICIENCY = 0.30;
const WEIGHT_FEE_CAPTURE = 0.25;
const WEIGHT_COMPETITION = 0.20;
const WEIGHT_DEPTH_QUALITY = 0.15;
const WEIGHT_SIZE = 0.10;

// Thresholds
const HIGH_VOLUME_EFFICIENCY = 0.5;    // 50% daily volume/TVL = high efficiency
const LOW_COMPETITION_THRESHOLD = 5;   // <5 unique LPs per $10k TVL = uncrowded
const MIN_FEE_TO_GAS_RATIO = 3;       // 3x fee/gas minimum for profitability
const ESTIMATED_GAS_STX = 0.05;       // ~50k uSTX per LP operation

// ── Types ──────────────────────────────────────────────────────────────────────

interface AppPool {
  id: string;
  poolContract: string;
  token0Symbol: string;
  token1Symbol: string;
  tvlUsd: number;
  volume24hUsd: number;
  poolId: number;
  token0Decimals: number;
  token1Decimals: number;
  token0PriceUsd: number;
  token1PriceUsd: number;
  activeBinId?: number;
  feeBps?: number;
}

interface LpEvent {
  sender: string;
  type: "add" | "remove";
  amountX: number;
  amountY: number;
  estimatedUsd: number;
  blockHeight: number;
  txId: string;
}

interface PoolOpportunity {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  volumeEfficiency: number;
  estimatedDailyFeesUsd: number;
  feeToGasRatio: number;
  uniqueLpCount: number;
  competitionDensity: number;
  avgOperationUsd: number;
  depthScore: number;
  netFlowUsd: number;
  flowDirection: "INFLOW" | "OUTFLOW" | "BALANCED";
  alphaScore: number;
  alphaClass: "HIGH_ALPHA" | "MODERATE" | "EFFICIENT" | "CROWDED" | "AVOID";
  signals: string[];
}

interface DiscoveryScan {
  timestamp: string;
  totalPoolsScanned: number;
  qualifiedPools: number;
  opportunities: PoolOpportunity[];
  topPicks: PoolOpportunity[];
  marketOverview: {
    totalTvlUsd: number;
    totalVolume24hUsd: number;
    avgVolumeEfficiency: number;
    avgCompetitionDensity: number;
    highAlphaCount: number;
    moderateCount: number;
    crowdedCount: number;
  };
  summary: string;
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
  if (n < 0) return `-${formatUsd(-n)}`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(6)}`;
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function shortenAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ── Pool Data ──────────────────────────────────────────────────────────────────

let _poolCache: AppPool[] | null = null;

async function fetchAllPools(): Promise<AppPool[]> {
  if (_poolCache) return _poolCache;
  const data = await fetchJson(`${BFF_APP_BASE}/pools`);
  const rawPools = data?.data || data?.pools || data || [];
  const pools: AppPool[] = rawPools.map((p: any) => {
    const tx = p.tokens?.tokenX || {};
    const ty = p.tokens?.tokenY || {};
    const poolIdStr = p.poolId || p.id || "0";
    const numericId = parseInt(poolIdStr.toString().replace(/^dlmm_/, "")) || 0;
    return {
      id: poolIdStr,
      poolContract: p.poolContract || "",
      token0Symbol: tx.symbol || p.token0Symbol || "?",
      token1Symbol: ty.symbol || p.token1Symbol || "?",
      tvlUsd: parseFloat(p.tvlUsd ?? "0"),
      volume24hUsd: parseFloat(p.volumeUsd1d ?? p.volume24hUsd ?? "0"),
      poolId: numericId,
      token0Decimals: parseInt(tx.decimals ?? p.token0Decimals ?? "6"),
      token1Decimals: parseInt(ty.decimals ?? p.token1Decimals ?? "6"),
      token0PriceUsd: parseFloat(tx.priceUsd ?? p.token0PriceUsd ?? "0"),
      token1PriceUsd: parseFloat(ty.priceUsd ?? p.token1PriceUsd ?? "0"),
      activeBinId: parseInt(p.activeBinId ?? "0") || undefined,
      feeBps: parseFloat(p.feeBps ?? "30"),
    };
  });
  _poolCache = pools.filter((p) => p.tvlUsd >= MIN_TVL_USD);
  return _poolCache;
}

function findPool(pools: AppPool[], id: number): AppPool | undefined {
  return pools.find((p) => p.poolId === id);
}

// ── Event Fetching ─────────────────────────────────────────────────────────────

async function fetchLpEvents(pool: AppPool, limit: number): Promise<LpEvent[]> {
  const events: LpEvent[] = [];

  for (const eventName of ["add-liquidity", "remove-liquidity"]) {
    try {
      const url = `${HIRO_API}/extended/v1/contract/${FULL_CONTRACT_ID}/events?limit=${limit}&offset=0`;
      const data = await fetchJson(url);
      const rawEvents = data?.results || [];

      for (const e of rawEvents) {
        if (e.event_type !== "smart_contract_log") continue;
        const val = e.contract_log?.value;
        if (!val) continue;

        const repr = val.repr || "";
        if (!repr.includes(eventName)) continue;

        const pairIdMatch = repr.match(/pair-id\s+u(\d+)/);
        if (!pairIdMatch || parseInt(pairIdMatch[1]) !== pool.poolId) continue;

        const senderMatch = repr.match(/sender\s+(SP[A-Z0-9]+)/);
        const amtXMatch = repr.match(/amount-x\s+u(\d+)/);
        const amtYMatch = repr.match(/amount-y\s+u(\d+)/);
        const binIdMatch = repr.match(/bin-id\s+u(\d+)/);

        const amountX = amtXMatch ? parseInt(amtXMatch[1]) / Math.pow(10, pool.token0Decimals) : 0;
        const amountY = amtYMatch ? parseInt(amtYMatch[1]) / Math.pow(10, pool.token1Decimals) : 0;
        const usdValue = amountX * (pool.token0PriceUsd || FALLBACK_STX_PRICE_USD) +
                         amountY * (pool.token1PriceUsd || FALLBACK_STX_PRICE_USD);

        events.push({
          sender: senderMatch ? senderMatch[1] : "unknown",
          type: eventName === "add-liquidity" ? "add" : "remove",
          amountX,
          amountY,
          estimatedUsd: usdValue,
          blockHeight: e.block_height || 0,
          txId: e.tx_id || "",
        });
      }
    } catch {
      // silently skip event type failures
    }
  }

  return events.sort((a, b) => b.blockHeight - a.blockHeight);
}

// ── On-Chain Bin Analysis ──────────────────────────────────────────────────────

async function analyzeBinDepth(pool: AppPool): Promise<{
  depthScore: number;
  activeBinPct: number;
  nearBinsPct: number;
  spreadBins: number;
}> {
  if (!pool.activeBinId) return { depthScore: 0, activeBinPct: 0, nearBinsPct: 0, spreadBins: 0 };

  const binIds = [];
  for (let d = -5; d <= 5; d++) {
    binIds.push(pool.activeBinId + d);
  }

  let totalReserve = 0;
  let activeBinReserve = 0;
  let nearBinsReserve = 0;
  let occupiedBins = 0;

  for (const binId of binIds) {
    try {
      const result = await callReadOnly("get-bin", [uintCV(pool.poolId), uintCV(binId)]);
      const reserveX = parseUintResult({ result: result?.result?.value?.["reserve-x"]?.value || result?.result }) || 0;
      const reserveY = parseUintResult({ result: result?.result?.value?.["reserve-y"]?.value || result?.result }) || 0;

      const reserveXNorm = reserveX / Math.pow(10, pool.token0Decimals);
      const reserveYNorm = reserveY / Math.pow(10, pool.token1Decimals);
      const usd = reserveXNorm * (pool.token0PriceUsd || FALLBACK_STX_PRICE_USD) +
                  reserveYNorm * (pool.token1PriceUsd || FALLBACK_STX_PRICE_USD);

      totalReserve += usd;
      if (binId === pool.activeBinId) activeBinReserve = usd;
      if (Math.abs(binId - pool.activeBinId) <= 2) nearBinsReserve += usd;
      if (usd > 0.01) occupiedBins++;
    } catch {
      continue;
    }
  }

  const activeBinPct = totalReserve > 0 ? activeBinReserve / totalReserve : 0;
  const nearBinsPct = totalReserve > 0 ? nearBinsReserve / totalReserve : 0;

  // Depth is good when liquidity is concentrated near active bin
  const depthScore = Math.min(100, Math.round(
    nearBinsPct * 60 + activeBinPct * 30 + (occupiedBins / 11) * 10
  ));

  return { depthScore, activeBinPct, nearBinsPct, spreadBins: occupiedBins };
}

// ── Opportunity Scoring ────────────────────────────────────────────────────────

function computeOpportunity(
  pool: AppPool,
  events: LpEvent[],
  depthInfo: { depthScore: number; activeBinPct: number; nearBinsPct: number; spreadBins: number }
): PoolOpportunity {
  // Volume efficiency
  const volumeEfficiency = pool.tvlUsd > 0 ? pool.volume24hUsd / pool.tvlUsd : 0;

  // Fee estimation
  const feePct = (pool.feeBps || 30) / 10_000;
  const estimatedDailyFeesUsd = pool.volume24hUsd * feePct;
  const gasCostUsd = ESTIMATED_GAS_STX * FALLBACK_STX_PRICE_USD;
  const feeToGasRatio = gasCostUsd > 0 ? estimatedDailyFeesUsd / gasCostUsd : 0;

  // LP competition
  const uniqueAddresses = new Set(events.map(e => e.sender));
  const uniqueLpCount = uniqueAddresses.size;
  const competitionDensity = pool.tvlUsd > 0 ? uniqueLpCount / (pool.tvlUsd / 10_000) : 0;

  // Average operation size
  const totalUsd = events.reduce((s, e) => s + e.estimatedUsd, 0);
  const avgOperationUsd = events.length > 0 ? totalUsd / events.length : 0;

  // Net flow
  const addUsd = events.filter(e => e.type === "add").reduce((s, e) => s + e.estimatedUsd, 0);
  const removeUsd = events.filter(e => e.type === "remove").reduce((s, e) => s + e.estimatedUsd, 0);
  const netFlowUsd = addUsd - removeUsd;
  const flowRatio = (addUsd + removeUsd) > 0 ? netFlowUsd / (addUsd + removeUsd) : 0;
  const flowDirection: "INFLOW" | "OUTFLOW" | "BALANCED" =
    flowRatio > 0.2 ? "INFLOW" : flowRatio < -0.2 ? "OUTFLOW" : "BALANCED";

  // Component scores (0-100)
  const volEffScore = Math.min(100, (volumeEfficiency / HIGH_VOLUME_EFFICIENCY) * 100);
  const feeScore = Math.min(100, (feeToGasRatio / (MIN_FEE_TO_GAS_RATIO * 5)) * 100);
  const compScore = competitionDensity <= 0 ? 80 :
    Math.min(100, (LOW_COMPETITION_THRESHOLD / Math.max(competitionDensity, 0.1)) * 20);
  const depthScoreNorm = depthInfo.depthScore;
  const sizeScore = Math.min(100, Math.log10(Math.max(pool.tvlUsd, 1)) * 20);

  // Alpha composite
  const alphaScore = Math.round(
    volEffScore * WEIGHT_VOLUME_EFFICIENCY +
    feeScore * WEIGHT_FEE_CAPTURE +
    compScore * WEIGHT_COMPETITION +
    depthScoreNorm * WEIGHT_DEPTH_QUALITY +
    sizeScore * WEIGHT_SIZE
  );

  const alphaClass: PoolOpportunity["alphaClass"] =
    alphaScore >= 75 ? "HIGH_ALPHA" :
    alphaScore >= 55 ? "MODERATE" :
    alphaScore >= 40 ? "EFFICIENT" :
    alphaScore >= 25 ? "CROWDED" : "AVOID";

  // Generate signals
  const signals: string[] = [];
  if (volumeEfficiency > HIGH_VOLUME_EFFICIENCY) signals.push("HIGH_VOLUME_EFFICIENCY");
  if (volumeEfficiency > 1.0) signals.push("EXCEPTIONAL_TURNOVER");
  if (competitionDensity < LOW_COMPETITION_THRESHOLD && competitionDensity > 0) signals.push("LOW_COMPETITION");
  if (uniqueLpCount <= 3) signals.push("FEW_LPS_OPPORTUNITY");
  if (feeToGasRatio > MIN_FEE_TO_GAS_RATIO * 3) signals.push("STRONG_FEE_YIELD");
  if (feeToGasRatio < MIN_FEE_TO_GAS_RATIO) signals.push("THIN_MARGINS");
  if (flowDirection === "INFLOW") signals.push("GROWING_INTEREST");
  if (flowDirection === "OUTFLOW") signals.push("LP_EXODUS");
  if (depthInfo.depthScore > 70) signals.push("DEEP_LIQUIDITY");
  if (depthInfo.depthScore < 30) signals.push("SHALLOW_DEPTH");
  if (pool.tvlUsd < 500) signals.push("MICRO_POOL");
  if (pool.tvlUsd > 100_000) signals.push("ESTABLISHED_POOL");

  return {
    poolId: pool.poolId,
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    feeBps: pool.feeBps || 30,
    activeBinId: pool.activeBinId || 0,
    volumeEfficiency,
    estimatedDailyFeesUsd,
    feeToGasRatio,
    uniqueLpCount,
    competitionDensity,
    avgOperationUsd,
    depthScore: depthInfo.depthScore,
    netFlowUsd,
    flowDirection,
    alphaScore,
    alphaClass,
    signals,
  };
}

// ── Output Formatting ──────────────────────────────────────────────────────────

function printOpportunityCard(opp: PoolOpportunity, rank: number): void {
  const classEmoji =
    opp.alphaClass === "HIGH_ALPHA" ? "🟢" :
    opp.alphaClass === "MODERATE" ? "🟡" :
    opp.alphaClass === "EFFICIENT" ? "🔵" :
    opp.alphaClass === "CROWDED" ? "🟠" : "🔴";

  const flowEmoji =
    opp.flowDirection === "INFLOW" ? "📈" :
    opp.flowDirection === "OUTFLOW" ? "📉" : "➡️";

  console.log(`  #${rank} ${classEmoji} Pool ${opp.poolId} — ${opp.pair}`);
  console.log(`     Alpha Score: ${opp.alphaScore}/100 (${opp.alphaClass})`);
  console.log(`     TVL: ${formatUsd(opp.tvlUsd)} | Volume 24h: ${formatUsd(opp.volume24hUsd)} | Fee: ${opp.feeBps}bps`);
  console.log(`     Vol/TVL: ${formatPct(opp.volumeEfficiency)} | Daily Fees: ${formatUsd(opp.estimatedDailyFeesUsd)} | Fee/Gas: ${opp.feeToGasRatio.toFixed(1)}x`);
  console.log(`     LPs: ${opp.uniqueLpCount} | Competition: ${opp.competitionDensity.toFixed(1)}/10k TVL | Depth: ${opp.depthScore}/100`);
  console.log(`     ${flowEmoji} Flow: ${opp.flowDirection} (${formatUsd(opp.netFlowUsd)} net)`);
  if (opp.signals.length > 0) {
    console.log(`     Signals: ${opp.signals.join(", ")}`);
  }
  console.log("");
}

function printAlphaMatrix(opps: PoolOpportunity[]): void {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  HODLMM ALPHA MATRIX`);
  console.log(`${"═".repeat(70)}`);
  console.log(`  ${"Pool".padEnd(8)} ${"Pair".padEnd(14)} ${"Alpha".padEnd(7)} ${"Vol/TVL".padEnd(9)} ${"Fees/d".padEnd(10)} ${"LPs".padEnd(5)} ${"Class".padEnd(12)}`);
  console.log(`  ${"─".repeat(65)}`);

  for (const opp of opps.slice(0, 15)) {
    const classEmoji =
      opp.alphaClass === "HIGH_ALPHA" ? "🟢" :
      opp.alphaClass === "MODERATE" ? "🟡" :
      opp.alphaClass === "EFFICIENT" ? "🔵" :
      opp.alphaClass === "CROWDED" ? "🟠" : "🔴";

    console.log(
      `  ${String(opp.poolId).padEnd(8)} ` +
      `${opp.pair.padEnd(14)} ` +
      `${String(opp.alphaScore).padEnd(7)} ` +
      `${formatPct(opp.volumeEfficiency).padEnd(9)} ` +
      `${formatUsd(opp.estimatedDailyFeesUsd).padEnd(10)} ` +
      `${String(opp.uniqueLpCount).padEnd(5)} ` +
      `${classEmoji} ${opp.alphaClass}`
    );
  }
  console.log(`${"═".repeat(70)}\n`);
}

// ── Commands ───────────────────────────────────────────────────────────────────

async function runDoctor() {
  console.log("HODLMM Pair Discovery — Doctor Check\n");

  console.log("1. Bitflow API...");
  try {
    const pools = await fetchAllPools();
    console.log(`   ✅ ${pools.length} pools loaded (TVL >= $${MIN_TVL_USD})`);
  } catch (e: any) {
    console.log(`   ❌ Bitflow API error: ${e.message}`);
  }

  console.log("2. Hiro API (contract events)...");
  try {
    const url = `${HIRO_API}/extended/v1/contract/${FULL_CONTRACT_ID}/events?limit=1`;
    const data = await fetchJson(url);
    console.log(`   ✅ Events accessible (${data?.results?.length || 0} sample)`);
  } catch (e: any) {
    console.log(`   ❌ Hiro API error: ${e.message}`);
  }

  console.log("3. On-chain read (get-bin)...");
  try {
    const result = await callReadOnly("get-bin", [uintCV(1), uintCV(8388608)]);
    console.log(`   ✅ Contract read works`);
  } catch (e: any) {
    console.log(`   ❌ Contract read error: ${e.message}`);
  }

  console.log("\nDoctor check complete.");
}

async function runInstallPacks() {
  console.log("hodlmm-pair-discovery uses only the Bun runtime and built-in fetch.");
  console.log("No additional packs needed. ✅");
}

async function runList() {
  const pools = await fetchAllPools();
  const sorted = [...pools].sort((a, b) => b.tvlUsd - a.tvlUsd);

  console.log(`\nHODLMM Pools (${sorted.length} with TVL >= $${MIN_TVL_USD})\n`);
  console.log(`  ${"ID".padEnd(8)} ${"Pair".padEnd(16)} ${"TVL".padEnd(12)} ${"Volume 24h".padEnd(14)} ${"Vol/TVL".padEnd(10)}`);
  console.log(`  ${"─".repeat(60)}`);

  for (const p of sorted) {
    const pair = `${p.token0Symbol}/${p.token1Symbol}`;
    const volEff = p.tvlUsd > 0 ? (p.volume24hUsd / p.tvlUsd * 100).toFixed(1) + "%" : "N/A";
    console.log(
      `  ${String(p.poolId).padEnd(8)} ${pair.padEnd(16)} ${formatUsd(p.tvlUsd).padEnd(12)} ${formatUsd(p.volume24hUsd).padEnd(14)} ${volEff.padEnd(10)}`
    );
  }
}

async function runAnalyze(opts: { pool: string }) {
  const poolId = parseInt(opts.pool);
  if (!poolId) { console.error("Invalid pool ID"); process.exit(1); }

  console.log(`\nHODLMM Pair Discovery — Deep Analysis for Pool ${poolId}\n`);

  const pools = await fetchAllPools();
  const pool = findPool(pools, poolId);
  if (!pool) { console.error(`Pool ${poolId} not found`); process.exit(1); }

  const pair = `${pool.token0Symbol}/${pool.token1Symbol}`;
  console.log(`Pool: ${pair} (ID ${poolId})`);
  console.log(`TVL: ${formatUsd(pool.tvlUsd)} | Volume 24h: ${formatUsd(pool.volume24hUsd)} | Fee: ${pool.feeBps}bps`);
  console.log(`Active Bin: ${pool.activeBinId || "N/A"}\n`);

  console.log("Fetching LP events...");
  const events = await fetchLpEvents(pool, EVENTS_LIMIT);
  console.log(`  ${events.length} events found\n`);

  console.log("Analyzing bin depth...");
  const depthInfo = await analyzeBinDepth(pool);
  console.log(`  Depth score: ${depthInfo.depthScore}/100`);
  console.log(`  Active bin: ${formatPct(depthInfo.activeBinPct)} of reserves`);
  console.log(`  Near bins (±2): ${formatPct(depthInfo.nearBinsPct)} of reserves`);
  console.log(`  Occupied bins: ${depthInfo.spreadBins}/11\n`);

  const opp = computeOpportunity(pool, events, depthInfo);

  console.log(`${"═".repeat(70)}`);
  console.log(`  OPPORTUNITY ANALYSIS`);
  console.log(`${"═".repeat(70)}\n`);

  printOpportunityCard(opp, 1);

  // Detailed breakdown
  console.log(`  Score Breakdown:`);
  console.log(`    Volume Efficiency: ${formatPct(opp.volumeEfficiency)} (${opp.volumeEfficiency >= HIGH_VOLUME_EFFICIENCY ? "ABOVE" : "below"} ${formatPct(HIGH_VOLUME_EFFICIENCY)} target)`);
  console.log(`    Daily Fee Capture: ${formatUsd(opp.estimatedDailyFeesUsd)} at ${opp.feeBps}bps`);
  console.log(`    Fee/Gas Ratio: ${opp.feeToGasRatio.toFixed(1)}x (need ${MIN_FEE_TO_GAS_RATIO}x+ for profitability)`);
  console.log(`    LP Competition: ${opp.uniqueLpCount} addresses, density ${opp.competitionDensity.toFixed(2)}/10k TVL`);
  console.log(`    Depth Quality: ${opp.depthScore}/100`);

  if (opp.alphaClass === "HIGH_ALPHA") {
    console.log(`\n  💡 HIGH ALPHA — This pool shows strong fee yield with manageable competition.`);
    console.log(`     Consider entering with a concentrated position around bin ${opp.activeBinId}.`);
  } else if (opp.alphaClass === "MODERATE") {
    console.log(`\n  💡 MODERATE — Decent opportunity with room for improvement.`);
    console.log(`     Monitor volume trends before committing large capital.`);
  } else if (opp.alphaClass === "CROWDED") {
    console.log(`\n  ⚠️  CROWDED — High competition may compress yields.`);
    console.log(`     Consider alternative pools or wait for LP exits.`);
  }

  console.log(`\n${"═".repeat(70)}`);
}

async function runScan() {
  console.log(`\nHODLMM Pair Discovery — Full Market Scan`);
  console.log(`${"═".repeat(70)}\n`);

  const pools = await fetchAllPools();
  console.log(`Scanning ${pools.length} pools...\n`);

  const opportunities: PoolOpportunity[] = [];

  // Sort by volume to prioritize active pools
  const sorted = [...pools].sort((a, b) => b.volume24hUsd - a.volume24hUsd);

  for (const pool of sorted) {
    const pair = `${pool.token0Symbol}/${pool.token1Symbol}`;
    try {
      process.stdout.write(`  Scanning ${pair} (Pool ${pool.poolId})...`);
      const events = await fetchLpEvents(pool, 30);
      const depthInfo = await analyzeBinDepth(pool);
      const opp = computeOpportunity(pool, events, depthInfo);
      opportunities.push(opp);
      console.log(` Alpha: ${opp.alphaScore} (${opp.alphaClass})`);
    } catch (e: any) {
      console.log(` Error: ${e.message}`);
    }
  }

  // Sort by alpha score
  opportunities.sort((a, b) => b.alphaScore - a.alphaScore);

  // Market overview
  const totalTvlUsd = opportunities.reduce((s, o) => s + o.tvlUsd, 0);
  const totalVolume = opportunities.reduce((s, o) => s + o.volume24hUsd, 0);
  const avgVolEff = totalTvlUsd > 0 ? totalVolume / totalTvlUsd : 0;
  const avgCompDensity = opportunities.length > 0 ?
    opportunities.reduce((s, o) => s + o.competitionDensity, 0) / opportunities.length : 0;
  const highAlpha = opportunities.filter(o => o.alphaClass === "HIGH_ALPHA").length;
  const moderate = opportunities.filter(o => o.alphaClass === "MODERATE").length;
  const crowded = opportunities.filter(o => o.alphaClass === "CROWDED").length;

  console.log(`\n${"═".repeat(70)}`);
  console.log(`  MARKET OVERVIEW`);
  console.log(`${"═".repeat(70)}`);
  console.log(`  Total TVL: ${formatUsd(totalTvlUsd)}`);
  console.log(`  Total 24h Volume: ${formatUsd(totalVolume)}`);
  console.log(`  Avg Volume Efficiency: ${formatPct(avgVolEff)}`);
  console.log(`  Avg Competition Density: ${avgCompDensity.toFixed(2)}/10k TVL`);
  console.log(`  High Alpha: ${highAlpha} | Moderate: ${moderate} | Crowded: ${crowded}`);

  // Alpha matrix
  printAlphaMatrix(opportunities);

  // Top picks
  const topPicks = opportunities.filter(o => o.alphaScore >= 55).slice(0, 5);
  if (topPicks.length > 0) {
    console.log(`TOP PICKS — Best Alpha Opportunities:\n`);
    topPicks.forEach((opp, i) => printOpportunityCard(opp, i + 1));
  }

  // Summary
  const best = opportunities[0];
  if (best) {
    console.log(`\n📊 Summary: Scanned ${opportunities.length} pools. ${highAlpha} high-alpha opportunities.`);
    console.log(`   Best: Pool ${best.poolId} (${best.pair}) — Alpha ${best.alphaScore}, ${formatPct(best.volumeEfficiency)} vol/TVL, ${formatUsd(best.estimatedDailyFeesUsd)}/day fees.`);
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────────

const program = new Command();
program
  .name("hodlmm-pair-discovery")
  .description("HODLMM Pair Discovery — find high-alpha LP opportunities by volume efficiency, competition, and depth quality")
  .version("1.0.0");

program
  .command("doctor")
  .description("Check API connectivity and data availability")
  .action(runDoctor);

program
  .command("install-packs")
  .description("Verify dependencies are available")
  .action(runInstallPacks);

program
  .command("run")
  .description("Deep-analyze a specific pool for LP opportunity")
  .requiredOption("--pool <id>", "HODLMM pool ID to analyze")
  .action(runAnalyze);

program
  .command("list")
  .description("List available HODLMM pools with volume efficiency")
  .action(runList);

program
  .command("scan")
  .description("Full market scan — rank all pools by alpha score")
  .action(runScan);

program.parse(process.argv);
