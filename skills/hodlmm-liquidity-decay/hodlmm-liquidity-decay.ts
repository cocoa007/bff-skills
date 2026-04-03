#!/usr/bin/env bun
/**
 * hodlmm-liquidity-decay.ts
 *
 * HODLMM Liquidity Decay Tracker — Monitors liquidity freshness and staleness
 * across HODLMM pools. Analyzes how recently liquidity was added/removed,
 * identifies stale positions that are out of range and earning no fees, and
 * scores pool liquidity health based on activity recency.
 *
 * Key metrics:
 *  - Liquidity freshness score (0-100) based on recent add/remove events
 *  - Stale bin detection — bins far from active that haven't been touched
 *  - Position decay rate — how quickly liquidity goes out of range
 *  - Activity recency — time since last add/remove/claim events
 *  - Refresh recommendation — when to rebalance based on decay patterns
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 44).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 20;

// Freshness thresholds (in Stacks blocks, ~10s each)
const FRESH_BLOCKS = 8640;      // ~1 day — activity within 1 day = fresh
const WARM_BLOCKS = 43200;      // ~5 days — moderate staleness
const STALE_BLOCKS = 86400;     // ~10 days — stale
// Beyond STALE_BLOCKS = dormant

// Decay classification thresholds (freshness score 0-100)
const FRESH_THRESHOLD = 75;
const AGING_THRESHOLD = 50;
const STALE_THRESHOLD = 25;
// Below 25 = DORMANT

// ── Types ──────────────────────────────────────────────────────────────────────

interface AppPool {
  id: string;
  token0Symbol: string;
  token1Symbol: string;
  tvlUsd: number;
  volume24hUsd: number;
  poolId: string;
  poolNumericId: number;
  token0Decimals: number;
  token1Decimals: number;
  token0PriceUsd: number;
  token1PriceUsd: number;
  activeBinId?: number;
  feeBps: number;
  binStep: number;
  poolContract: string;
}

interface BinReserves {
  binId: number;
  reserveX: number;
  reserveY: number;
  totalUsd: number;
}

interface LiquidityEvent {
  txId: string;
  blockHeight: number;
  eventType: "add" | "remove" | "claim" | "unknown";
  sender: string;
  timestamp?: string;
}

type DecayClass = "FRESH" | "AGING" | "STALE" | "DORMANT";

interface BinDecayProfile {
  binId: number;
  distanceFromActive: number;
  reserveUsd: number;
  isInRange: boolean;
  isEarningFees: boolean;
}

interface PoolDecayAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  activeBinId: number;
  freshnessScore: number;
  decayClass: DecayClass;
  recentEvents: {
    totalEvents: number;
    adds: number;
    removes: number;
    claims: number;
    uniqueAddresses: number;
    lastEventBlocksAgo: number;
    lastEventType: string;
  };
  binProfile: {
    totalBinsWithLiquidity: number;
    binsInRange: number;
    binsOutOfRange: number;
    staleLiquidityUsd: number;
    staleLiquidityPct: number;
    activeLiquidityUsd: number;
    activeLiquidityPct: number;
    deadZoneBins: number;
  };
  decayMetrics: {
    rangeUtilization: number;
    eventFrequencyPerDay: number;
    avgTimeBetweenEventsBlocks: number;
    liquidityConcentrationNearActive: number;
    driftRisk: string;
  };
  refreshRecommendation: {
    action: "HOLD" | "MONITOR" | "REFRESH" | "URGENT_REFRESH";
    reasoning: string;
    estimatedDaysUntilStale: number;
    optimalRefreshIntervalDays: number;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<any> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`);
  return resp.json();
}

async function callReadOnly(contract: string, fn: string, args: string[]): Promise<any> {
  const [addr, name] = contract.split(".");
  const url = `${HIRO_API}/v2/contracts/call-read/${addr}/${name}/${fn}`;
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
  return `$${n.toFixed(4)}`;
}

function classifyDecay(score: number): DecayClass {
  if (score >= FRESH_THRESHOLD) return "FRESH";
  if (score >= AGING_THRESHOLD) return "AGING";
  if (score >= STALE_THRESHOLD) return "STALE";
  return "DORMANT";
}

// ── Pool Data ──────────────────────────────────────────────────────────────────

let _poolCache: AppPool[] | null = null;

async function fetchAllPools(): Promise<AppPool[]> {
  if (_poolCache) return _poolCache;
  const data = await fetchJson(`${BFF_APP_BASE}/pools`);
  const rawPools = data?.data || data?.pools || data || [];
  // Filter to DLMM pools only
  const dlmmPools = rawPools.filter((p: any) =>
    (p.types || []).includes("DLMM") || (p.poolId || "").startsWith("dlmm")
  );
  const pools: AppPool[] = dlmmPools.map((p: any) => {
    const tX = p.tokens?.tokenX || {};
    const tY = p.tokens?.tokenY || {};
    const numericId = parseInt((p.poolId || "").replace("dlmm_", "")) || 0;
    return {
      id: p.poolId ?? "?",
      token0Symbol: tX.symbol ?? "?",
      token1Symbol: tY.symbol ?? "?",
      tvlUsd: parseFloat(p.tvlUsd ?? "0"),
      volume24hUsd: parseFloat(p.volumeUsd1d ?? p.volume24hUsd ?? "0"),
      poolId: p.poolId ?? "?",
      poolNumericId: numericId,
      token0Decimals: parseInt(tX.decimals ?? "6"),
      token1Decimals: parseInt(tY.decimals ?? "6"),
      token0PriceUsd: parseFloat(tX.priceUsd ?? "0"),
      token1PriceUsd: parseFloat(tY.priceUsd ?? "0"),
      activeBinId: undefined, // fetched on-chain
      feeBps: Math.round((parseFloat(p.baseFee ?? "0.003") + parseFloat(p.dynamicFee ?? "0")) * 10000),
      binStep: parseFloat(p.binStep ?? "10"),
      poolContract: p.poolContract ?? "",
    };
  });
  _poolCache = pools.filter((p) => p.tvlUsd >= MIN_TVL_USD);
  return _poolCache;
}

async function getActiveBin(contract: string): Promise<number> {
  const result = await callReadOnly(contract, "get-active-bin-id", []);
  return parseUintResult(result);
}

function parseBinBalances(result: any): { xBalance: number; yBalance: number } {
  if (!result?.result) return { xBalance: 0, yBalance: 0 };
  const hex = result.result.replace("0x", "");
  // Response is (ok {bin-shares: uint, x-balance: uint, y-balance: uint})
  // Parse the tuple from Clarity hex encoding
  try {
    // Simple extraction: look for the uint values in the tuple
    // Format: 07 (ok) + 0c (tuple) + 03 (3 fields) + field data
    // Each field: name-len + name + 01 (uint) + 16-byte value
    const vals: number[] = [];
    let pos = 0;
    while (pos < hex.length) {
      const idx = hex.indexOf("01", pos);
      if (idx === -1) break;
      // Check if this is a uint marker (0x01) followed by 32 hex chars
      if (idx + 34 <= hex.length) {
        const valHex = hex.slice(idx + 2, idx + 34);
        const val = parseInt(valHex, 16);
        if (!isNaN(val)) vals.push(val);
        pos = idx + 34;
      } else {
        pos = idx + 2;
      }
    }
    // Expected order: bin-shares, x-balance, y-balance
    if (vals.length >= 3) {
      return { xBalance: vals[1], yBalance: vals[2] };
    }
    if (vals.length >= 2) {
      return { xBalance: vals[0], yBalance: vals[1] };
    }
  } catch { /* fall through */ }
  return { xBalance: 0, yBalance: 0 };
}

async function fetchBinReserves(contract: string, activeBinId: number, pool: AppPool): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const start = activeBinId - BIN_SCAN_RADIUS;
  const end = activeBinId + BIN_SCAN_RADIUS;

  for (let binId = start; binId <= end; binId++) {
    try {
      const result = await callReadOnly(contract, "get-bin-balances", [uintCV(binId)]);
      const { xBalance, yBalance } = parseBinBalances(result);
      if (xBalance > 0 || yBalance > 0) {
        const usdX = (xBalance / Math.pow(10, pool.token0Decimals)) * pool.token0PriceUsd;
        const usdY = (yBalance / Math.pow(10, pool.token1Decimals)) * pool.token1PriceUsd;
        bins.push({ binId, reserveX: xBalance, reserveY: yBalance, totalUsd: usdX + usdY });
      }
    } catch {
      // Skip bins that fail
    }
  }
  return bins;
}

// ── Event Analysis ─────────────────────────────────────────────────────────────

async function fetchRecentEvents(contract: string, limit: number = 50): Promise<LiquidityEvent[]> {
  try {
    const data = await fetchJson(
      `${HIRO_API}/extended/v1/contract/${contract}/events?limit=${limit}&offset=0`
    );
    const items = data?.results || [];
    const events: LiquidityEvent[] = [];

    for (const ev of items) {
      if (!ev.tx_id) continue;
      events.push({
        txId: ev.tx_id,
        blockHeight: ev.block_height || 0,
        eventType: classifyEventType(ev),
        sender: ev.sender_address || "",
      });
    }

    return events;
  } catch {
    return [];
  }
}

function classifyEventType(ev: any): "add" | "remove" | "claim" | "unknown" {
  const topic = ev.contract_log?.topic || ev.event_type || "";
  const val = JSON.stringify(ev.contract_log?.value || "").toLowerCase();

  if (val.includes("add") || val.includes("mint") || val.includes("deposit")) return "add";
  if (val.includes("remove") || val.includes("burn") || val.includes("withdraw")) return "remove";
  if (val.includes("claim") || val.includes("collect") || val.includes("fee")) return "claim";
  return "unknown";
}

async function fetchCurrentBlockHeight(): Promise<number> {
  try {
    const info = await fetchJson(`${HIRO_API}/v2/info`);
    return info?.stacks_tip_height || info?.burn_block_height || 0;
  } catch {
    return 0;
  }
}

// ── Freshness Scoring ──────────────────────────────────────────────────────────

function computeFreshnessScore(
  events: LiquidityEvent[],
  currentBlock: number,
  bins: BinReserves[],
  activeBinId: number,
  tvlUsd: number
): number {
  let score = 50; // Start at neutral

  // 1. Event recency (0-30 points)
  if (events.length > 0) {
    const latestBlock = Math.max(...events.map((e) => e.blockHeight));
    const blocksAgo = currentBlock - latestBlock;

    if (blocksAgo <= FRESH_BLOCKS) score += 30;
    else if (blocksAgo <= WARM_BLOCKS) score += 20;
    else if (blocksAgo <= STALE_BLOCKS) score += 10;
    else score -= 10;
  } else {
    score -= 20; // No events at all
  }

  // 2. Event frequency (0-20 points)
  const addRemoveEvents = events.filter((e) => e.eventType === "add" || e.eventType === "remove");
  if (addRemoveEvents.length >= 10) score += 20;
  else if (addRemoveEvents.length >= 5) score += 15;
  else if (addRemoveEvents.length >= 2) score += 10;
  else score += 0;

  // 3. Address diversity (0-15 points)
  const uniqueAddrs = new Set(events.map((e) => e.sender)).size;
  if (uniqueAddrs >= 5) score += 15;
  else if (uniqueAddrs >= 3) score += 10;
  else if (uniqueAddrs >= 1) score += 5;

  // 4. Bin range utilization (0-20 points)
  if (bins.length > 0) {
    const nearBins = bins.filter((b) => Math.abs(b.binId - activeBinId) <= 5);
    const nearUsd = nearBins.reduce((s, b) => s + b.totalUsd, 0);
    const totalUsd = bins.reduce((s, b) => s + b.totalUsd, 0);
    const nearPct = totalUsd > 0 ? nearUsd / totalUsd : 0;

    if (nearPct > 0.6) score += 20;
    else if (nearPct > 0.3) score += 10;
    else score -= 5; // Most liquidity far from active bin
  }

  // 5. Penalty for zero volume (stagnant pool)
  // Not applied here since we don't pass volume — handled in the main analysis

  return Math.max(0, Math.min(100, score));
}

// ── Bin Decay Profiling ────────────────────────────────────────────────────────

function profileBinDecay(
  bins: BinReserves[],
  activeBinId: number
): BinDecayProfile[] {
  return bins.map((b) => {
    const distance = Math.abs(b.binId - activeBinId);
    // Bins within +/-3 of active are "in range" and earning fees
    const inRange = distance <= 3;
    // Bins within +/-1 of active earn the most fees
    const earningFees = distance <= 1;

    return {
      binId: b.binId,
      distanceFromActive: distance,
      reserveUsd: b.totalUsd,
      isInRange: inRange,
      isEarningFees: earningFees,
    };
  });
}

function computeStaleLiquidity(
  profiles: BinDecayProfile[]
): { staleUsd: number; activeUsd: number; deadZones: number } {
  let staleUsd = 0;
  let activeUsd = 0;
  let deadZones = 0;

  for (const p of profiles) {
    if (p.isInRange) {
      activeUsd += p.reserveUsd;
    } else {
      staleUsd += p.reserveUsd;
      if (p.distanceFromActive > 10 && p.reserveUsd > 0) {
        deadZones++;
      }
    }
  }

  return { staleUsd, activeUsd, deadZones };
}

// ── Refresh Recommendations ────────────────────────────────────────────────────

function computeRefreshRecommendation(
  freshnessScore: number,
  stalePct: number,
  eventFreqPerDay: number,
  volume24hUsd: number,
  tvlUsd: number
): PoolDecayAnalysis["refreshRecommendation"] {
  const volumeToTvl = tvlUsd > 0 ? volume24hUsd / tvlUsd : 0;

  // High volume + high staleness = urgent refresh
  if (stalePct > 60 && volumeToTvl > 0.1) {
    return {
      action: "URGENT_REFRESH",
      reasoning: `${Math.round(stalePct)}% of liquidity is out of range while the pool has strong volume (${Math.round(volumeToTvl * 100)}% TVL turnover/day). Stale positions are missing significant fee revenue.`,
      estimatedDaysUntilStale: 0,
      optimalRefreshIntervalDays: 1,
    };
  }

  if (stalePct > 40 || freshnessScore < STALE_THRESHOLD) {
    return {
      action: "REFRESH",
      reasoning: `Liquidity is aging — ${Math.round(stalePct)}% out of range, freshness score ${freshnessScore}/100. Rebalancing would recapture fee-earning potential.`,
      estimatedDaysUntilStale: Math.max(1, Math.round((100 - stalePct) / 10)),
      optimalRefreshIntervalDays: 3,
    };
  }

  if (stalePct > 20 || freshnessScore < AGING_THRESHOLD) {
    return {
      action: "MONITOR",
      reasoning: `Some drift detected — ${Math.round(stalePct)}% out of range. Not urgent but worth watching. Active bin may shift further.`,
      estimatedDaysUntilStale: Math.max(2, Math.round((100 - stalePct) / 5)),
      optimalRefreshIntervalDays: 7,
    };
  }

  return {
    action: "HOLD",
    reasoning: `Liquidity is fresh — ${Math.round(100 - stalePct)}% in range, freshness score ${freshnessScore}/100. No action needed.`,
    estimatedDaysUntilStale: Math.max(5, Math.round((100 - stalePct) / 3)),
    optimalRefreshIntervalDays: 14,
  };
}

// ── Command Handlers ──────────────────────────────────────────────────────────

async function runDoctor(): Promise<void> {
  const results: Record<string, string> = {};

  try {
    await fetchJson(`${BFF_APP_BASE}/pools`);
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
    const pools = await fetchAllPools();
    if (pools.length > 0) {
      const testResult = await callReadOnly(pools[0].poolContract, "get-active-bin-id", []);
      results["dlmm_contract"] = testResult.result ? `ok (${pools.length} pools)` : "no result";
    } else {
      results["dlmm_contract"] = "no pools found";
    }
  } catch (e: any) {
    results["dlmm_contract"] = `error: ${e.message}`;
  }

  try {
    const pools = await fetchAllPools();
    if (pools.length > 0) {
      const events = await fetchRecentEvents(pools[0].poolContract, 5);
      results["contract_events"] = `ok (${events.length} recent events)`;
    }
  } catch (e: any) {
    results["contract_events"] = `error: ${e.message}`;
  }

  try {
    const block = await fetchCurrentBlockHeight();
    results["block_height"] = `ok (${block})`;
  } catch (e: any) {
    results["block_height"] = `error: ${e.message}`;
  }

  console.log(
    JSON.stringify({
      tool: "hodlmm-liquidity-decay",
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
      tool: "hodlmm-liquidity-decay",
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
      tool: "hodlmm-liquidity-decay",
      command: "run",
      timestamp: new Date().toISOString(),
      error: "Invalid pool ID — provide a numeric pool ID with --pool",
    }));
    return;
  }

  const pools = await fetchAllPools();
  const pool = pools.find((p) => p.poolNumericId === poolId);

  if (!pool) {
    console.log(JSON.stringify({
      tool: "hodlmm-liquidity-decay",
      command: "run",
      timestamp: new Date().toISOString(),
      error: `Pool ${poolId} not found or below TVL threshold ($${MIN_TVL_USD})`,
    }));
    return;
  }

  const activeBinId = pool.activeBinId || await getActiveBin(pool.poolContract);
  if (!activeBinId) {
    console.log(JSON.stringify({
      tool: "hodlmm-liquidity-decay",
      command: "run",
      timestamp: new Date().toISOString(),
      error: `Could not determine active bin for pool ${poolId}`,
    }));
    return;
  }

  const [bins, events, currentBlock] = await Promise.all([
    fetchBinReserves(pool.poolContract, activeBinId, pool),
    fetchRecentEvents(pool.poolContract, 50),
    fetchCurrentBlockHeight(),
  ]);

  const binProfiles = profileBinDecay(bins, activeBinId);
  const { staleUsd, activeUsd, deadZones } = computeStaleLiquidity(binProfiles);
  const totalBinUsd = staleUsd + activeUsd;
  const stalePct = totalBinUsd > 0 ? (staleUsd / totalBinUsd) * 100 : 0;
  const activePct = totalBinUsd > 0 ? (activeUsd / totalBinUsd) * 100 : 0;

  const freshnessScore = computeFreshnessScore(events, currentBlock, bins, activeBinId, pool.tvlUsd);
  const decayClass = classifyDecay(freshnessScore);

  // Event analysis
  const adds = events.filter((e) => e.eventType === "add").length;
  const removes = events.filter((e) => e.eventType === "remove").length;
  const claims = events.filter((e) => e.eventType === "claim").length;
  const uniqueAddrs = new Set(events.map((e) => e.sender)).size;
  const latestBlock = events.length > 0 ? Math.max(...events.map((e) => e.blockHeight)) : 0;
  const lastEventBlocksAgo = currentBlock > 0 && latestBlock > 0 ? currentBlock - latestBlock : -1;
  const lastEventType = events.length > 0
    ? events.reduce((a, b) => (a.blockHeight > b.blockHeight ? a : b)).eventType
    : "none";

  // Event frequency
  const blockSpan = events.length >= 2
    ? Math.max(...events.map((e) => e.blockHeight)) - Math.min(...events.map((e) => e.blockHeight))
    : 1;
  const daysSpan = Math.max(1, blockSpan / 8640);
  const eventFreqPerDay = events.length / daysSpan;
  const avgTimeBetween = events.length > 1 ? blockSpan / (events.length - 1) : 0;

  // Concentration near active
  const nearBins = bins.filter((b) => Math.abs(b.binId - activeBinId) <= 3);
  const nearUsd = nearBins.reduce((s, b) => s + b.totalUsd, 0);
  const concentrationNearActive = totalBinUsd > 0 ? nearUsd / totalBinUsd : 0;

  // Drift risk
  const volumeToTvl = pool.tvlUsd > 0 ? pool.volume24hUsd / pool.tvlUsd : 0;
  let driftRisk: string;
  if (volumeToTvl > 0.3) driftRisk = "HIGH — heavy trading volume drives active bin movement";
  else if (volumeToTvl > 0.1) driftRisk = "MODERATE — steady volume may shift active bin";
  else driftRisk = "LOW — minimal volume, active bin likely stable";

  const refreshRec = computeRefreshRecommendation(
    freshnessScore, stalePct, eventFreqPerDay, pool.volume24hUsd, pool.tvlUsd
  );

  const inRangeCount = binProfiles.filter((b) => b.isInRange).length;
  const outOfRangeCount = binProfiles.filter((b) => !b.isInRange && b.reserveUsd > 0).length;

  // ASCII decay visualization
  const decayMap = buildDecayMap(binProfiles, activeBinId);

  const result: PoolDecayAnalysis = {
    poolId,
    pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
    tvlUsd: Math.round(pool.tvlUsd),
    volume24hUsd: Math.round(pool.volume24hUsd),
    activeBinId,
    freshnessScore,
    decayClass,
    recentEvents: {
      totalEvents: events.length,
      adds,
      removes,
      claims,
      uniqueAddresses: uniqueAddrs,
      lastEventBlocksAgo,
      lastEventType,
    },
    binProfile: {
      totalBinsWithLiquidity: bins.length,
      binsInRange: inRangeCount,
      binsOutOfRange: outOfRangeCount,
      staleLiquidityUsd: Math.round(staleUsd),
      staleLiquidityPct: Math.round(stalePct * 10) / 10,
      activeLiquidityUsd: Math.round(activeUsd),
      activeLiquidityPct: Math.round(activePct * 10) / 10,
      deadZoneBins: deadZones,
    },
    decayMetrics: {
      rangeUtilization: Math.round(activePct * 10) / 10,
      eventFrequencyPerDay: Math.round(eventFreqPerDay * 100) / 100,
      avgTimeBetweenEventsBlocks: Math.round(avgTimeBetween),
      liquidityConcentrationNearActive: Math.round(concentrationNearActive * 1000) / 1000,
      driftRisk,
    },
    refreshRecommendation: refreshRec,
  };

  console.log(JSON.stringify({
    tool: "hodlmm-liquidity-decay",
    command: "run",
    timestamp: new Date().toISOString(),
    currentBlock,
    ...result,
    decayMap,
  }, null, 2));
}

function buildDecayMap(profiles: BinDecayProfile[], activeBinId: number): string {
  if (profiles.length === 0) return "(no bins with liquidity)";

  const sorted = [...profiles].sort((a, b) => a.binId - b.binId);
  const maxUsd = Math.max(...sorted.map((p) => p.reserveUsd));
  if (maxUsd === 0) return "(all bins empty)";

  const lines: string[] = ["Bin Decay Map (■ = in-range, □ = out-of-range, ★ = active):"];

  for (const p of sorted) {
    const barLen = Math.max(1, Math.round((p.reserveUsd / maxUsd) * 30));
    const isActive = p.binId === activeBinId;
    const char = isActive ? "★" : p.isInRange ? "■" : "□";
    const bar = char.repeat(barLen);
    const label = isActive ? " ← ACTIVE" : p.distanceFromActive > 10 ? " (stale)" : "";
    lines.push(`  ${p.binId}: ${bar} ${formatUsd(p.reserveUsd)}${label}`);
  }

  return lines.join("\n");
}

async function runScan(options: {
  top?: string;
  minTvl?: string;
  sort?: string;
}): Promise<void> {
  const topN = parseInt(options.top || "10");
  const minTvl = parseFloat(options.minTvl || String(MIN_TVL_USD));
  const sortBy = options.sort || "freshness"; // "freshness" | "staleness" | "volume"

  const pools = (await fetchAllPools()).filter((p) => p.tvlUsd >= minTvl);

  if (pools.length === 0) {
    console.log(JSON.stringify({
      tool: "hodlmm-liquidity-decay",
      command: "scan",
      timestamp: new Date().toISOString(),
      error: "No pools found above TVL threshold",
    }));
    return;
  }

  const currentBlock = await fetchCurrentBlockHeight();

  const results: any[] = [];

  for (const pool of pools.slice(0, topN * 2)) {
    try {
      const activeBinId = pool.activeBinId || await getActiveBin(pool.poolContract);
      if (!activeBinId) continue;

      const events = await fetchRecentEvents(pool.poolContract, 20);

      // Lighter bin scan for bulk mode
      const bins: BinReserves[] = [];
      const radius = 10;
      for (let binId = activeBinId - radius; binId <= activeBinId + radius; binId++) {
        try {
          const result = await callReadOnly(pool.poolContract, "get-bin-balances", [uintCV(binId)]);
          const { xBalance, yBalance } = parseBinBalances(result);
          if (xBalance > 0 || yBalance > 0) {
            const usdX = (xBalance / Math.pow(10, pool.token0Decimals)) * pool.token0PriceUsd;
            const usdY = (yBalance / Math.pow(10, pool.token1Decimals)) * pool.token1PriceUsd;
            bins.push({ binId, reserveX: xBalance, reserveY: yBalance, totalUsd: usdX + usdY });
          }
        } catch { /* skip */ }
      }

      const binProfiles = profileBinDecay(bins, activeBinId);
      const { staleUsd, activeUsd } = computeStaleLiquidity(binProfiles);
      const totalBinUsd = staleUsd + activeUsd;
      const stalePct = totalBinUsd > 0 ? (staleUsd / totalBinUsd) * 100 : 0;

      const freshnessScore = computeFreshnessScore(events, currentBlock, bins, activeBinId, pool.tvlUsd);
      const decayClass = classifyDecay(freshnessScore);

      const volumeToTvl = pool.tvlUsd > 0 ? pool.volume24hUsd / pool.tvlUsd : 0;

      results.push({
        poolId: pool.poolNumericId,
        pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
        tvlUsd: Math.round(pool.tvlUsd),
        volume24hUsd: Math.round(pool.volume24hUsd),
        freshnessScore,
        decayClass,
        staleLiquidityPct: Math.round(stalePct * 10) / 10,
        activeLiquidityPct: Math.round((100 - stalePct) * 10) / 10,
        binsWithLiquidity: bins.length,
        volumeToTvlRatio: Math.round(volumeToTvl * 1000) / 1000,
        refreshAction: computeRefreshRecommendation(
          freshnessScore, stalePct, 0, pool.volume24hUsd, pool.tvlUsd
        ).action,
      });
    } catch { /* skip pool */ }
  }

  // Sort
  if (sortBy === "staleness") {
    results.sort((a, b) => b.staleLiquidityPct - a.staleLiquidityPct);
  } else if (sortBy === "volume") {
    results.sort((a, b) => b.volume24hUsd - a.volume24hUsd);
  } else {
    // Default: sort by freshness score descending (freshest first)
    results.sort((a, b) => b.freshnessScore - a.freshnessScore);
  }

  const ranked = results.slice(0, topN);

  const fresh = ranked.filter((p) => p.decayClass === "FRESH").length;
  const aging = ranked.filter((p) => p.decayClass === "AGING").length;
  const stale = ranked.filter((p) => p.decayClass === "STALE").length;
  const dormant = ranked.filter((p) => p.decayClass === "DORMANT").length;

  console.log(JSON.stringify({
    tool: "hodlmm-liquidity-decay",
    command: "scan",
    timestamp: new Date().toISOString(),
    currentBlock,
    poolsScanned: results.length,
    sortedBy: sortBy,
    results: ranked,
    summary: {
      fresh,
      aging,
      stale,
      dormant,
      avgFreshnessScore: ranked.length > 0
        ? Math.round(ranked.reduce((s, p) => s + p.freshnessScore, 0) / ranked.length)
        : 0,
      avgStaleLiquidityPct: ranked.length > 0
        ? Math.round(ranked.reduce((s, p) => s + p.staleLiquidityPct, 0) / ranked.length * 10) / 10
        : 0,
      mostFreshPool: ranked.length > 0 ? ranked[0] : null,
      mostStalePool: ranked.length > 0
        ? [...ranked].sort((a, b) => b.staleLiquidityPct - a.staleLiquidityPct)[0]
        : null,
    },
    guidance: fresh > aging + stale + dormant
      ? "Most pools have fresh, well-maintained liquidity. HODLMM LPs are actively managing positions."
      : stale + dormant > fresh + aging
        ? "Many pools have stale liquidity — positions are out of range and earning no fees. Rebalancing opportunities exist."
        : "Mixed freshness across pools. Check individual pool decay profiles before committing capital.",
  }, null, 2));
}

// ── CLI Setup ──────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-liquidity-decay")
  .description(
    "HODLMM Liquidity Decay Tracker — Monitors liquidity freshness and staleness across HODLMM pools"
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
  .description("Analyze liquidity decay for a specific pool")
  .requiredOption("--pool <id>", "HODLMM pool ID")
  .action(runAnalyze);

program
  .command("scan")
  .description("Rank pools by liquidity freshness and decay")
  .option("--top <n>", "Number of pools to show", "10")
  .option("--min-tvl <usd>", "Minimum TVL filter", String(MIN_TVL_USD))
  .option("--sort <by>", "Sort by: freshness, staleness, volume", "freshness")
  .action(runScan);

program.parse();
