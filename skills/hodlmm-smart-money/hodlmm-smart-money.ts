#!/usr/bin/env bun
/**
 * hodlmm-smart-money.ts
 *
 * HODLMM Smart Money Tracker — Profiles LP addresses by analyzing on-chain
 * event patterns to identify sophisticated positioning behavior in HODLMM pools.
 *
 * Key metrics:
 *  - Address profiling: frequency, size, timing of LP operations
 *  - Smart money score (0-100): measures positioning sophistication
 *  - Whale vs retail classification based on position sizing
 *  - Concentration analysis: how focused smart money is across bins
 *  - Net flow direction: is smart money entering or exiting?
 *  - Conviction scoring: position hold duration, add/remove ratio
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 37).
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

// Smart money classification thresholds
const WHALE_USD_THRESHOLD = 10_000;        // $10k+ per operation = whale
const LARGE_USD_THRESHOLD = 1_000;         // $1k+ = large
const SMART_SCORE_HIGH = 70;               // 70+ = smart money
const SMART_SCORE_MEDIUM = 40;             // 40-69 = informed
const MIN_OPERATIONS_FOR_PROFILE = 2;      // Need 2+ events to profile

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
  binId?: number;
}

interface AddressProfile {
  address: string;
  shortAddress: string;
  totalOperations: number;
  addCount: number;
  removeCount: number;
  totalAddedUsd: number;
  totalRemovedUsd: number;
  netFlowUsd: number;
  avgOperationUsd: number;
  maxOperationUsd: number;
  operationSpanBlocks: number;
  addRemoveRatio: number;
  sizeClass: "WHALE" | "LARGE" | "MEDIUM" | "RETAIL";
  smartScore: number;
  smartClass: "SMART_MONEY" | "INFORMED" | "RETAIL";
  conviction: "HIGH" | "MEDIUM" | "LOW";
  direction: "ACCUMULATING" | "DISTRIBUTING" | "NEUTRAL" | "EXITING";
  scoreBreakdown: {
    sizeScore: number;
    frequencyScore: number;
    convictionScore: number;
    timingScore: number;
    precisionScore: number;
  };
}

interface SmartMoneyAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  activeBinId: number;
  totalEventsScanned: number;
  uniqueAddresses: number;
  profiles: AddressProfile[];
  aggregateMetrics: {
    smartMoneyCount: number;
    smartMoneyNetFlowUsd: number;
    smartMoneyDirection: "BULLISH" | "BEARISH" | "NEUTRAL";
    whaleCount: number;
    whaleNetFlowUsd: number;
    retailCount: number;
    concentrationHHI: number;
    dominantAddress: string;
    dominantAddressSharePct: number;
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
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(6)}`;
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

async function fetchStxPriceUsd(): Promise<number> {
  try {
    const pools = await fetchAllPools();
    const stables = ["USDA", "USDT", "SUSDT", "XUSD", "AUSD"];
    for (const p of pools) {
      const t0 = p.token0Symbol.toUpperCase();
      const t1 = p.token1Symbol.toUpperCase();
      if (t0 === "STX" && stables.some((s) => t1.includes(s)))
        return p.token0PriceUsd > 0 ? p.token0PriceUsd : FALLBACK_STX_PRICE_USD;
      if (t1 === "STX" && stables.some((s) => t0.includes(s)))
        return p.token1PriceUsd > 0 ? p.token1PriceUsd : FALLBACK_STX_PRICE_USD;
    }
    for (const p of pools) {
      if (p.token0Symbol.toUpperCase() === "STX" && p.token0PriceUsd > 0) return p.token0PriceUsd;
      if (p.token1Symbol.toUpperCase() === "STX" && p.token1PriceUsd > 0) return p.token1PriceUsd;
    }
    return FALLBACK_STX_PRICE_USD;
  } catch {
    return FALLBACK_STX_PRICE_USD;
  }
}

async function getActiveBin(poolId: number): Promise<number> {
  try {
    const result = await callReadOnly("get-active-bin-id", [uintCV(poolId)]);
    return parseUintResult(result);
  } catch {
    return 0;
  }
}

// ── Event Fetching ────────────────────────────────────────────────────────────

async function fetchLpEvents(pool: AppPool, limit: number = EVENTS_LIMIT): Promise<LpEvent[]> {
  const events: LpEvent[] = [];

  // Use pool-specific contract for events, fall back to core DLMM contract
  const contractId = pool.poolContract || FULL_CONTRACT_ID;

  // Primary: fetch transaction history for the pool contract
  const txUrl = `${HIRO_API}/extended/v1/address/${contractId}/transactions?limit=${limit}`;
  try {
    const txData = await fetchJson(txUrl);
    const txs = txData?.results || [];

    for (const tx of txs) {
      if (tx.tx_type !== "contract_call") continue;
      const fnName = tx.contract_call?.function_name || "";
      const isAdd = fnName.includes("add") || fnName.includes("mint") || fnName.includes("deposit");
      const isRemove = fnName.includes("remove") || fnName.includes("burn") || fnName.includes("withdraw");
      if (!isAdd && !isRemove) continue;

      const sender = tx.sender_address || "unknown";
      const args = tx.contract_call?.function_args || [];

      let amountX = 0, amountY = 0;
      for (const arg of args) {
        const val = parseInt(arg.repr?.replace(/^u/, "") || "0");
        if (arg.name?.includes("x") || arg.name?.includes("token-x")) amountX = val;
        if (arg.name?.includes("y") || arg.name?.includes("token-y")) amountY = val;
        // Also catch generic amount args
        if (arg.name === "amount" || arg.name === "liquidity") {
          amountX = Math.floor(val / 2);
          amountY = Math.floor(val / 2);
        }
      }

      const usdX = (amountX / Math.pow(10, pool.token0Decimals)) * pool.token0PriceUsd;
      const usdY = (amountY / Math.pow(10, pool.token1Decimals)) * pool.token1PriceUsd;

      events.push({
        sender,
        type: isAdd ? "add" : "remove",
        amountX,
        amountY,
        estimatedUsd: usdX + usdY,
        blockHeight: tx.block_height || 0,
        txId: tx.tx_id || "",
      });
    }
  } catch {
    // Fallback: fetch contract events
    try {
      const evtUrl = `${HIRO_API}/extended/v1/contract/${contractId}/events?limit=${limit}&offset=0`;
      const data = await fetchJson(evtUrl);
      const rawEvents = data?.events || data?.results || [];

      for (const evt of rawEvents) {
        if (!evt.contract_log?.value?.repr) continue;
        const repr = evt.contract_log.value.repr;

        const isAdd = repr.includes("add-liquidity") || repr.includes("mint");
        const isRemove = repr.includes("remove-liquidity") || repr.includes("burn");
        if (!isAdd && !isRemove) continue;

        const sender = evt.tx_id ? await extractSenderFromTx(evt.tx_id) : "unknown";

        const amountX = extractAmount(repr, "amount-x") || extractAmount(repr, "token-x-amount") || 0;
        const amountY = extractAmount(repr, "amount-y") || extractAmount(repr, "token-y-amount") || 0;

        const usdX = (amountX / Math.pow(10, pool.token0Decimals)) * pool.token0PriceUsd;
        const usdY = (amountY / Math.pow(10, pool.token1Decimals)) * pool.token1PriceUsd;

        events.push({
          sender,
          type: isAdd ? "add" : "remove",
          amountX,
          amountY,
          estimatedUsd: usdX + usdY,
          blockHeight: evt.block_height || 0,
          txId: evt.tx_id || "",
          binId: extractAmount(repr, "bin-id"),
        });
      }
    } catch {
      // Both methods failed
    }
  }

  return events;
}

async function extractSenderFromTx(txId: string): Promise<string> {
  try {
    const data = await fetchJson(`${HIRO_API}/extended/v1/tx/${txId}`);
    return data?.sender_address || "unknown";
  } catch {
    return "unknown";
  }
}

function extractAmount(repr: string, field: string): number {
  const regex = new RegExp(`${field}\\s+u(\\d+)`);
  const match = repr.match(regex);
  return match ? parseInt(match[1]) : 0;
}

// ── Smart Money Scoring ────────────────────────────────────────────────────────

function computeSmartScore(profile: {
  totalOperations: number;
  avgOperationUsd: number;
  maxOperationUsd: number;
  addRemoveRatio: number;
  operationSpanBlocks: number;
  netFlowUsd: number;
  totalAddedUsd: number;
  totalRemovedUsd: number;
}): { total: number; breakdown: AddressProfile["scoreBreakdown"] } {
  // 1. Size score (0-25): larger operations suggest more capital / sophistication
  let sizeScore = 0;
  if (profile.avgOperationUsd >= WHALE_USD_THRESHOLD) sizeScore = 25;
  else if (profile.avgOperationUsd >= LARGE_USD_THRESHOLD) sizeScore = 18;
  else if (profile.avgOperationUsd >= 100) sizeScore = 10;
  else sizeScore = 3;

  // 2. Frequency score (0-25): multiple operations suggest active management
  let frequencyScore = 0;
  if (profile.totalOperations >= 10) frequencyScore = 25;
  else if (profile.totalOperations >= 5) frequencyScore = 18;
  else if (profile.totalOperations >= 3) frequencyScore = 12;
  else frequencyScore = 5;

  // 3. Conviction score (0-25): strong directional bias suggests informed view
  let convictionScore = 0;
  const totalVolume = profile.totalAddedUsd + profile.totalRemovedUsd;
  if (totalVolume > 0) {
    const directionality = Math.abs(profile.netFlowUsd) / totalVolume;
    convictionScore = Math.round(directionality * 25);
  }

  // 4. Timing score (0-15): operations spread over time suggest strategic timing
  let timingScore = 0;
  if (profile.operationSpanBlocks > 1000) timingScore = 15;
  else if (profile.operationSpanBlocks > 500) timingScore = 10;
  else if (profile.operationSpanBlocks > 100) timingScore = 6;
  else timingScore = 2;

  // 5. Precision score (0-10): balanced add/remove suggests active management
  let precisionScore = 0;
  if (profile.totalOperations >= 3) {
    const ratio = profile.addRemoveRatio;
    // Both adding and removing = active management
    if (ratio > 0.3 && ratio < 3.0 && profile.addRemoveRatio !== Infinity) {
      precisionScore = 10;
    } else if (ratio > 0.1 && ratio < 10) {
      precisionScore = 5;
    }
    // Pure one-directional still gets some points for size
    else precisionScore = 2;
  }

  const total = Math.min(100, sizeScore + frequencyScore + convictionScore + timingScore + precisionScore);

  return {
    total,
    breakdown: { sizeScore, frequencyScore, convictionScore, timingScore, precisionScore },
  };
}

function classifySize(avgUsd: number): AddressProfile["sizeClass"] {
  if (avgUsd >= WHALE_USD_THRESHOLD) return "WHALE";
  if (avgUsd >= LARGE_USD_THRESHOLD) return "LARGE";
  if (avgUsd >= 100) return "MEDIUM";
  return "RETAIL";
}

function classifyDirection(profile: { netFlowUsd: number; totalAddedUsd: number; totalRemovedUsd: number }): AddressProfile["direction"] {
  const totalVol = profile.totalAddedUsd + profile.totalRemovedUsd;
  if (totalVol === 0) return "NEUTRAL";
  const ratio = profile.netFlowUsd / totalVol;
  if (ratio > 0.3) return "ACCUMULATING";
  if (ratio < -0.3) return "DISTRIBUTING";
  if (profile.totalRemovedUsd > 0 && profile.totalAddedUsd === 0) return "EXITING";
  return "NEUTRAL";
}

function classifyConviction(score: number, operationSpan: number): AddressProfile["conviction"] {
  if (score >= 60 && operationSpan > 200) return "HIGH";
  if (score >= 30 || operationSpan > 100) return "MEDIUM";
  return "LOW";
}

// ── Profile Builder ───────────────────────────────────────────────────────────

function buildProfiles(events: LpEvent[]): AddressProfile[] {
  const byAddress = new Map<string, LpEvent[]>();

  for (const evt of events) {
    if (evt.sender === "unknown") continue;
    const existing = byAddress.get(evt.sender) || [];
    existing.push(evt);
    byAddress.set(evt.sender, existing);
  }

  const profiles: AddressProfile[] = [];

  for (const [address, addrEvents] of byAddress) {
    if (addrEvents.length < MIN_OPERATIONS_FOR_PROFILE) continue;

    const adds = addrEvents.filter((e) => e.type === "add");
    const removes = addrEvents.filter((e) => e.type === "remove");
    const totalAddedUsd = adds.reduce((s, e) => s + e.estimatedUsd, 0);
    const totalRemovedUsd = removes.reduce((s, e) => s + e.estimatedUsd, 0);
    const netFlowUsd = totalAddedUsd - totalRemovedUsd;
    const avgOperationUsd = (totalAddedUsd + totalRemovedUsd) / addrEvents.length;
    const maxOperationUsd = Math.max(...addrEvents.map((e) => e.estimatedUsd));
    const blocks = addrEvents.map((e) => e.blockHeight).filter((b) => b > 0);
    const operationSpanBlocks = blocks.length >= 2 ? Math.max(...blocks) - Math.min(...blocks) : 0;
    const addRemoveRatio = removes.length > 0 ? adds.length / removes.length : adds.length > 0 ? Infinity : 0;

    const { total: smartScore, breakdown } = computeSmartScore({
      totalOperations: addrEvents.length,
      avgOperationUsd,
      maxOperationUsd,
      addRemoveRatio,
      operationSpanBlocks,
      netFlowUsd,
      totalAddedUsd,
      totalRemovedUsd,
    });

    const smartClass: AddressProfile["smartClass"] =
      smartScore >= SMART_SCORE_HIGH ? "SMART_MONEY" :
      smartScore >= SMART_SCORE_MEDIUM ? "INFORMED" : "RETAIL";

    profiles.push({
      address,
      shortAddress: shortenAddr(address),
      totalOperations: addrEvents.length,
      addCount: adds.length,
      removeCount: removes.length,
      totalAddedUsd,
      totalRemovedUsd,
      netFlowUsd,
      avgOperationUsd,
      maxOperationUsd,
      operationSpanBlocks,
      addRemoveRatio,
      sizeClass: classifySize(avgOperationUsd),
      smartScore,
      smartClass,
      conviction: classifyConviction(smartScore, operationSpanBlocks),
      direction: classifyDirection({ netFlowUsd, totalAddedUsd, totalRemovedUsd }),
      scoreBreakdown: breakdown,
    });
  }

  // Sort by smart score descending
  profiles.sort((a, b) => b.smartScore - a.smartScore);
  return profiles;
}

// ── Aggregate Metrics ─────────────────────────────────────────────────────────

function computeAggregateMetrics(profiles: AddressProfile[]): SmartMoneyAnalysis["aggregateMetrics"] {
  const smartMoney = profiles.filter((p) => p.smartClass === "SMART_MONEY");
  const whales = profiles.filter((p) => p.sizeClass === "WHALE");
  const retail = profiles.filter((p) => p.smartClass === "RETAIL");

  const smartNetFlow = smartMoney.reduce((s, p) => s + p.netFlowUsd, 0);
  const whaleNetFlow = whales.reduce((s, p) => s + p.netFlowUsd, 0);

  // HHI concentration: how concentrated is total volume across addresses
  const totalVolume = profiles.reduce((s, p) => s + p.totalAddedUsd + p.totalRemovedUsd, 0);
  let hhi = 0;
  if (totalVolume > 0) {
    for (const p of profiles) {
      const share = (p.totalAddedUsd + p.totalRemovedUsd) / totalVolume;
      hhi += share * share;
    }
  }
  hhi = Math.round(hhi * 10000); // Scale to 0-10000

  // Dominant address
  let dominant = profiles[0] || { shortAddress: "none", totalAddedUsd: 0, totalRemovedUsd: 0 };
  let dominantShare = totalVolume > 0
    ? ((dominant.totalAddedUsd + dominant.totalRemovedUsd) / totalVolume) * 100
    : 0;

  // By volume not smart score for dominance
  const byVolume = [...profiles].sort((a, b) =>
    (b.totalAddedUsd + b.totalRemovedUsd) - (a.totalAddedUsd + a.totalRemovedUsd)
  );
  if (byVolume.length > 0) {
    dominant = byVolume[0];
    dominantShare = totalVolume > 0
      ? ((dominant.totalAddedUsd + dominant.totalRemovedUsd) / totalVolume) * 100
      : 0;
  }

  const smartDirection: "BULLISH" | "BEARISH" | "NEUTRAL" =
    smartNetFlow > 100 ? "BULLISH" :
    smartNetFlow < -100 ? "BEARISH" : "NEUTRAL";

  return {
    smartMoneyCount: smartMoney.length,
    smartMoneyNetFlowUsd: Math.round(smartNetFlow * 100) / 100,
    smartMoneyDirection: smartDirection,
    whaleCount: whales.length,
    whaleNetFlowUsd: Math.round(whaleNetFlow * 100) / 100,
    retailCount: retail.length,
    concentrationHHI: hhi,
    dominantAddress: dominant.shortAddress,
    dominantAddressSharePct: Math.round(dominantShare * 100) / 100,
  };
}

// ── ASCII Visualization ────────────────────────────────────────────────────────

function renderProfileTable(profiles: AddressProfile[]): string {
  const lines: string[] = [];
  lines.push("┌──────────────────┬───────┬─────┬──────────────┬──────────────┬───────┬───────────────┐");
  lines.push("│ Address          │ Score │ Ops │ Added        │ Removed      │ Class │ Direction     │");
  lines.push("├──────────────────┼───────┼─────┼──────────────┼──────────────┼───────┼───────────────┤");

  for (const p of profiles.slice(0, 15)) {
    const addr = p.shortAddress.padEnd(16);
    const score = String(p.smartScore).padStart(5);
    const ops = String(p.totalOperations).padStart(3);
    const added = formatUsd(p.totalAddedUsd).padStart(12);
    const removed = formatUsd(p.totalRemovedUsd).padStart(12);
    const cls = p.smartClass.slice(0, 5).padEnd(5);
    const dir = p.direction.slice(0, 13).padEnd(13);
    lines.push(`│ ${addr} │ ${score} │ ${ops} │ ${added} │ ${removed} │ ${cls} │ ${dir} │`);
  }

  lines.push("└──────────────────┴───────┴─────┴──────────────┴──────────────┴───────┴───────────────┘");
  return lines.join("\n");
}

function renderFlowChart(profiles: AddressProfile[]): string {
  const lines: string[] = [];
  lines.push("\n📊 Net Flow by Address (top 10):");
  lines.push("─".repeat(60));

  const top = profiles.slice(0, 10);
  const maxAbs = Math.max(...top.map((p) => Math.abs(p.netFlowUsd)), 1);
  const barWidth = 30;

  for (const p of top) {
    const normalized = (p.netFlowUsd / maxAbs) * barWidth;
    const label = p.shortAddress.padEnd(14);
    let bar: string;
    if (normalized >= 0) {
      const filled = Math.round(normalized);
      bar = " ".repeat(barWidth) + "│" + "█".repeat(filled);
    } else {
      const filled = Math.round(-normalized);
      bar = " ".repeat(barWidth - filled) + "█".repeat(filled) + "│";
    }
    const amount = `${p.netFlowUsd >= 0 ? "+" : ""}${formatUsd(p.netFlowUsd)}`;
    lines.push(`${label} ${bar} ${amount}`);
  }

  lines.push(" ".repeat(30) + "0");
  lines.push("         ◄── removing ──          ── adding ──►");
  return lines.join("\n");
}

// ── Summary Builder ───────────────────────────────────────────────────────────

function buildSummary(analysis: SmartMoneyAnalysis): string {
  const agg = analysis.aggregateMetrics;
  const lines: string[] = [];

  lines.push(`Pool ${analysis.poolId} (${analysis.pair}): ${analysis.totalEventsScanned} events from ${analysis.uniqueAddresses} addresses.`);

  if (agg.smartMoneyCount > 0) {
    lines.push(`Smart money (${agg.smartMoneyCount} addr): net ${agg.smartMoneyDirection} ${formatUsd(Math.abs(agg.smartMoneyNetFlowUsd))}.`);
  } else {
    lines.push("No smart money profiles detected (insufficient event history).");
  }

  if (agg.whaleCount > 0) {
    const whaleDir = agg.whaleNetFlowUsd > 100 ? "accumulating" : agg.whaleNetFlowUsd < -100 ? "distributing" : "neutral";
    lines.push(`Whales (${agg.whaleCount}): ${whaleDir}, net ${formatUsd(Math.abs(agg.whaleNetFlowUsd))}.`);
  }

  if (agg.concentrationHHI > 2500) {
    lines.push(`High concentration (HHI ${agg.concentrationHHI}): ${agg.dominantAddress} controls ${agg.dominantAddressSharePct.toFixed(1)}% of volume.`);
  } else if (agg.concentrationHHI > 1500) {
    lines.push(`Moderate concentration (HHI ${agg.concentrationHHI}).`);
  } else {
    lines.push(`Low concentration (HHI ${agg.concentrationHHI}) — diverse LP base.`);
  }

  return lines.join(" ");
}

// ── Command Handlers ────────────────────────────────────────────────────────────

async function runDoctor(): Promise<void> {
  const results: Record<string, string> = {};

  try {
    const poolData = await fetchJson(`${BFF_APP_BASE}/pools`);
    const dlmmCount = (poolData?.data || []).length;
    results["bitflow_app_api"] = `ok (${dlmmCount} pools)`;
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

  try {
    const url = `${HIRO_API}/extended/v1/contract/${FULL_CONTRACT_ID}/events?limit=1`;
    await fetchJson(url);
    results["contract_events"] = "ok";
  } catch (e: any) {
    results["contract_events"] = `error: ${e.message}`;
  }

  console.log(
    JSON.stringify({
      tool: "hodlmm-smart-money",
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
      tool: "hodlmm-smart-money",
      command: "install-packs",
      status: "ok",
      message: "No additional dependencies required. Uses commander (workspace) + native fetch.",
      timestamp: new Date().toISOString(),
    })
  );
}

async function runAnalyze(options: { pool: string; limit?: string }): Promise<void> {
  const poolArg = options.pool;
  const eventsLimit = parseInt(options.limit || String(EVENTS_LIMIT));
  const pools = await fetchAllPools();

  // Match by numeric ID, string ID (dlmm_N), or token pair substring
  const poolId = parseInt(poolArg);
  const pool = pools.find((p) =>
    p.poolId === poolId ||
    p.id === poolArg ||
    p.id === `dlmm_${poolArg}` ||
    `${p.token0Symbol}/${p.token1Symbol}`.toLowerCase().includes(poolArg.toLowerCase())
  );

  if (!pool) {
    console.log(JSON.stringify({
      tool: "hodlmm-smart-money",
      command: "run",
      timestamp: new Date().toISOString(),
      error: `Pool "${poolArg}" not found or below ${formatUsd(MIN_TVL_USD)} TVL minimum`,
      available_pools: pools.slice(0, 10).map((p) => ({
        poolId: p.id,
        numericId: p.poolId,
        pair: `${p.token0Symbol}/${p.token1Symbol}`,
        tvlUsd: Math.round(p.tvlUsd),
      })),
    }));
    return;
  }

  const pair = `${pool.token0Symbol}/${pool.token1Symbol}`;
  const activeBinId = pool.activeBinId || (await getActiveBin(pool.poolId));

  // Fetch LP events
  const events = await fetchLpEvents(pool, eventsLimit);

  // Build address profiles
  const profiles = buildProfiles(events);
  const aggregateMetrics = computeAggregateMetrics(profiles);

  const analysis: SmartMoneyAnalysis = {
    poolId: pool.poolId,
    pair,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    activeBinId,
    totalEventsScanned: events.length,
    uniqueAddresses: new Set(events.map((e) => e.sender).filter((s) => s !== "unknown")).size,
    profiles: profiles.slice(0, 15),
    aggregateMetrics,
    summary: "",
  };

  analysis.summary = buildSummary(analysis);

  // Render output
  const output: string[] = [];
  output.push(`\n${"═".repeat(70)}`);
  output.push(`  HODLMM SMART MONEY TRACKER — Pool ${poolId} (${pair})`);
  output.push(`${"═".repeat(70)}`);
  output.push(`  TVL: ${formatUsd(pool.tvlUsd)} | 24h Vol: ${formatUsd(pool.volume24hUsd)} | Active Bin: ${activeBinId}`);
  output.push(`  Events scanned: ${events.length} | Unique addresses: ${analysis.uniqueAddresses}`);
  output.push(`${"─".repeat(70)}`);

  if (profiles.length > 0) {
    output.push("\n🧠 ADDRESS PROFILES (by Smart Score):");
    output.push(renderProfileTable(profiles));
    output.push(renderFlowChart(profiles));
  } else {
    output.push("\n  No address profiles — insufficient LP event data.");
    output.push("  Try increasing --limit or check that this pool has recent LP activity.");
  }

  output.push(`\n${"─".repeat(70)}`);
  output.push("📈 AGGREGATE METRICS:");
  output.push(`  Smart Money: ${aggregateMetrics.smartMoneyCount} addresses, net flow ${formatUsd(aggregateMetrics.smartMoneyNetFlowUsd)}, direction: ${aggregateMetrics.smartMoneyDirection}`);
  output.push(`  Whales: ${aggregateMetrics.whaleCount} addresses, net flow ${formatUsd(aggregateMetrics.whaleNetFlowUsd)}`);
  output.push(`  Retail: ${aggregateMetrics.retailCount} addresses`);
  output.push(`  Concentration HHI: ${aggregateMetrics.concentrationHHI} (${aggregateMetrics.concentrationHHI > 2500 ? "HIGH" : aggregateMetrics.concentrationHHI > 1500 ? "MODERATE" : "LOW"})`);
  if (aggregateMetrics.dominantAddress !== "none") {
    output.push(`  Dominant: ${aggregateMetrics.dominantAddress} (${aggregateMetrics.dominantAddressSharePct.toFixed(1)}% of volume)`);
  }

  output.push(`\n${"─".repeat(70)}`);
  output.push(`SUMMARY: ${analysis.summary}`);
  output.push(`${"═".repeat(70)}\n`);

  console.log(output.join("\n"));

  // Also output structured JSON
  console.log(JSON.stringify({
    tool: "hodlmm-smart-money",
    command: "run",
    timestamp: new Date().toISOString(),
    analysis: {
      poolId: analysis.poolId,
      pair: analysis.pair,
      tvlUsd: analysis.tvlUsd,
      volume24hUsd: analysis.volume24hUsd,
      activeBinId: analysis.activeBinId,
      totalEventsScanned: analysis.totalEventsScanned,
      uniqueAddresses: analysis.uniqueAddresses,
      profiles: analysis.profiles.map((p) => ({
        address: p.address,
        smartScore: p.smartScore,
        smartClass: p.smartClass,
        sizeClass: p.sizeClass,
        direction: p.direction,
        conviction: p.conviction,
        totalOperations: p.totalOperations,
        netFlowUsd: Math.round(p.netFlowUsd * 100) / 100,
        totalAddedUsd: Math.round(p.totalAddedUsd * 100) / 100,
        totalRemovedUsd: Math.round(p.totalRemovedUsd * 100) / 100,
        scoreBreakdown: p.scoreBreakdown,
      })),
      aggregateMetrics: analysis.aggregateMetrics,
      summary: analysis.summary,
    },
  }, null, 2));
}

async function runList(): Promise<void> {
  const pools = await fetchAllPools();
  const sorted = [...pools].sort((a, b) => b.tvlUsd - a.tvlUsd);

  console.log(`\n${"═".repeat(50)}`);
  console.log("  HODLMM Pools — Smart Money Tracker");
  console.log(`${"═".repeat(50)}`);
  console.log("  ID  | Pair                 | TVL         | 24h Vol");
  console.log(`${"─".repeat(50)}`);

  for (const p of sorted.slice(0, 20)) {
    const id = String(p.poolId).padStart(4);
    const pair = `${p.token0Symbol}/${p.token1Symbol}`.padEnd(20);
    const tvl = formatUsd(p.tvlUsd).padStart(11);
    const vol = formatUsd(p.volume24hUsd).padStart(11);
    console.log(`  ${id} | ${pair} | ${tvl} | ${vol}`);
  }

  console.log(`${"═".repeat(50)}\n`);
  console.log(`Total: ${sorted.length} pools above ${formatUsd(MIN_TVL_USD)} TVL`);
}

async function runScan(): Promise<void> {
  const pools = await fetchAllPools();
  const sorted = [...pools].sort((a, b) => b.volume24hUsd - a.volume24hUsd).slice(0, 5);

  console.log(`\n${"═".repeat(70)}`);
  console.log("  HODLMM SMART MONEY SCAN — Top 5 Pools by Volume");
  console.log(`${"═".repeat(70)}\n`);

  for (const pool of sorted) {
    const pair = `${pool.token0Symbol}/${pool.token1Symbol}`;
    const poolId = pool.poolId!;

    try {
      const events = await fetchLpEvents(pool, 30);
      const profiles = buildProfiles(events);
      const agg = computeAggregateMetrics(profiles);

      const smartEmoji = agg.smartMoneyDirection === "BULLISH" ? "🟢" :
        agg.smartMoneyDirection === "BEARISH" ? "🔴" : "⚪";

      console.log(`  Pool ${poolId} (${pair}): TVL ${formatUsd(pool.tvlUsd)}, Vol ${formatUsd(pool.volume24hUsd)}`);
      console.log(`    ${smartEmoji} Smart: ${agg.smartMoneyCount} addr, ${agg.smartMoneyDirection} (${formatUsd(agg.smartMoneyNetFlowUsd)})`);
      console.log(`    🐋 Whales: ${agg.whaleCount} | 👤 Retail: ${agg.retailCount} | HHI: ${agg.concentrationHHI}`);
      console.log("");
    } catch (e: any) {
      console.log(`  Pool ${poolId} (${pair}): Error — ${e.message}`);
      console.log("");
    }
  }

  console.log(`${"═".repeat(70)}\n`);
}

// ── CLI ─────────────────────────────────────────────────────────────────────────

const program = new Command();
program
  .name("hodlmm-smart-money")
  .description("HODLMM Smart Money Tracker — profiles LP addresses to identify sophisticated positioning behavior")
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
  .description("Analyze smart money activity for a specific pool")
  .requiredOption("--pool <id>", "HODLMM pool ID to analyze")
  .option("--limit <n>", "Number of events to scan (default 50)")
  .action(runAnalyze);

program
  .command("list")
  .description("List available HODLMM pools")
  .action(runList);

program
  .command("scan")
  .description("Quick smart money scan across top pools by volume")
  .action(runScan);

program.parse(process.argv);
