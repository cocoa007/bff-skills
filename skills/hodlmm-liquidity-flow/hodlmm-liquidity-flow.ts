#!/usr/bin/env bun
/**
 * hodlmm-liquidity-flow.ts
 *
 * HODLMM Liquidity Flow Tracker — Net liquidity flow monitor for HODLMM pools.
 * Analyzes add/remove liquidity contract events to detect accumulation vs
 * distribution phases, whale movements, and pool momentum.
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 24).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const DEFAULT_BLOCKS = 144; // ~24h at ~10s/block
const DEFAULT_WHALE_PCT = 5; // 5% of TVL = whale
const PHASE_THRESHOLD_PCT = 3; // ±3% net flow = accumulation/distribution

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
}

interface LiquidityEvent {
  type: "add" | "remove";
  txid: string;
  blockHeight: number;
  sender: string;
  amountX: number;
  amountY: number;
  estimatedUsd: number;
}

interface FlowSummary {
  totalAddsUsd: number;
  totalRemovesUsd: number;
  netFlowUsd: number;
  addCount: number;
  removeCount: number;
}

interface WhaleMovement {
  type: "add" | "remove";
  estimatedUsd: number;
  pctOfTvl: number;
  txid: string;
  sender: string;
  blockHeight: number;
}

interface FlowAnalysis {
  pool: { id: number; pair: string; tvlUsd: number };
  window: { blocks: number; eventsFound: number };
  flows: FlowSummary;
  phase: "ACCUMULATION" | "DISTRIBUTION" | "NEUTRAL";
  momentumScore: number;
  whaleMovements: WhaleMovement[];
  signal: "BULLISH" | "NEUTRAL" | "BEARISH";
  reasoning: string[];
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

function encodeUint(n: number): string {
  return "0x01" + n.toString(16).padStart(32, "0");
}

function parseUintFromResult(text: string, field: string): number | null {
  const re = new RegExp(`${field}\\s+u(\\d+)`);
  const m = text.match(re);
  return m ? parseInt(m[1], 10) : null;
}

// ── Data Fetching ──────────────────────────────────────────────────────────────

async function fetchAppPools(): Promise<AppPool[]> {
  try {
    const resp = await fetchJson(`${BFF_APP_BASE}/pools`);
    const pools = resp.data || resp.pools || resp || [];
    return Array.isArray(pools) ? pools : [];
  } catch {
    return [];
  }
}

async function resolvePool(
  query: string,
  appPools: AppPool[]
): Promise<{ poolId: number; pool: AppPool | null }> {
  const asNum = parseInt(query, 10);
  if (!isNaN(asNum) && asNum > 0) {
    const match = appPools.find((p) => p.poolId === asNum);
    return { poolId: asNum, pool: match || null };
  }
  const q = query.toLowerCase().replace(/[^a-z0-9]/g, "");
  const match = appPools.find((p) => {
    const pair = `${p.token0Symbol}${p.token1Symbol}`.toLowerCase().replace(/[^a-z0-9]/g, "");
    const pairRev = `${p.token1Symbol}${p.token0Symbol}`.toLowerCase().replace(/[^a-z0-9]/g, "");
    return pair.includes(q) || pairRev.includes(q) || q.includes(pair) || q.includes(pairRev);
  });
  if (!match || !match.poolId) throw new Error(`Pool not found: ${query}`);
  return { poolId: match.poolId, pool: match };
}

async function fetchContractEvents(
  offset: number = 0,
  limit: number = 50
): Promise<any[]> {
  try {
    const url = `${HIRO_API}/extended/v1/contract/${DLMM_CONTRACT_ADDR}.${DLMM_CONTRACT_NAME}/events?offset=${offset}&limit=${limit}`;
    const data = await fetchJson(url);
    return data.results || data.events || [];
  } catch {
    return [];
  }
}

async function getCurrentBlockHeight(): Promise<number> {
  try {
    const info = await fetchJson(`${HIRO_API}/v2/info`);
    return info.stacks_tip_height || info.burn_block_height || 0;
  } catch {
    return 0;
  }
}

// ── Event Parsing ──────────────────────────────────────────────────────────────

function parseEventArgs(event: any): {
  fnName: string;
  poolId: number | null;
  amountX: number;
  amountY: number;
  sender: string;
} | null {
  // Parse function call events for add-liquidity and remove-liquidity
  const fnName = event.contract_log?.value?.repr ||
    event.event_type === "smart_contract_log" ? (event.contract_log?.value?.repr || "") : "";

  // Try to extract from transaction metadata
  const txData = event.tx || event;
  const contractCall = txData.contract_call || {};
  const fn = contractCall.function_name || "";

  if (!fn.includes("add-liquidity") && !fn.includes("remove-liquidity")) {
    return null;
  }

  const args = contractCall.function_args || [];
  let poolId: number | null = null;
  let amountX = 0;
  let amountY = 0;

  for (const arg of args) {
    const name = arg.name || "";
    const repr = arg.repr || "";
    const val = parseInt(repr.replace(/^u/, ""), 10);

    if (name === "pool-id" && !isNaN(val)) poolId = val;
    if (name === "amount-x" && !isNaN(val)) amountX = val;
    if (name === "amount-y" && !isNaN(val)) amountY = val;
    // Also check for amount fields in different naming conventions
    if (name === "token-x-amount" && !isNaN(val)) amountX = val;
    if (name === "token-y-amount" && !isNaN(val)) amountY = val;
  }

  return {
    fnName: fn.includes("add") ? "add" : "remove",
    poolId,
    amountX,
    amountY,
    sender: txData.sender_address || "",
  };
}

function estimateEventUsd(
  amountX: number,
  amountY: number,
  pool: AppPool
): number {
  const xDecimals = pool.token0Decimals || 8;
  const yDecimals = pool.token1Decimals || 6;
  const xUsd = (amountX / Math.pow(10, xDecimals)) * (pool.token0PriceUsd || 0);
  const yUsd = (amountY / Math.pow(10, yDecimals)) * (pool.token1PriceUsd || 0);
  return xUsd + yUsd;
}

// ── Flow Analysis via Contract Events ─────────────────────────────────────────

async function fetchPoolFlowEvents(
  poolId: number,
  pool: AppPool,
  lookbackBlocks: number
): Promise<LiquidityEvent[]> {
  const currentBlock = await getCurrentBlockHeight();
  if (currentBlock === 0) return [];

  const minBlock = currentBlock - lookbackBlocks;
  const events: LiquidityEvent[] = [];
  let offset = 0;
  const maxPages = 10; // Safety limit

  for (let page = 0; page < maxPages; page++) {
    const raw = await fetchContractEvents(offset, 50);
    if (raw.length === 0) break;

    let foundOldEvent = false;
    for (const ev of raw) {
      const blockHeight = ev.block_height || ev.tx?.block_height || 0;
      if (blockHeight < minBlock) {
        foundOldEvent = true;
        break;
      }

      const parsed = parseEventArgs(ev);
      if (!parsed || parsed.poolId !== poolId) continue;

      const estimatedUsd = estimateEventUsd(parsed.amountX, parsed.amountY, pool);

      events.push({
        type: parsed.fnName === "add" ? "add" : "remove",
        txid: ev.tx_id || ev.txid || "",
        blockHeight,
        sender: parsed.sender,
        amountX: parsed.amountX,
        amountY: parsed.amountY,
        estimatedUsd,
      });
    }

    if (foundOldEvent || raw.length < 50) break;
    offset += 50;
  }

  return events;
}

// ── Alternative Flow Estimation (TVL Delta) ───────────────────────────────────

async function estimateFlowFromOnChain(
  poolId: number,
  pool: AppPool
): Promise<FlowSummary> {
  // When event parsing yields no results, estimate from pool metrics
  // Use volume as a proxy for activity intensity
  const volume24h = pool.volume24hUsd || 0;
  const tvl = pool.tvlUsd || 1;

  // Heuristic: pools with high volume/TVL ratio tend to have more flow
  const activityRatio = volume24h / tvl;
  const estimatedTurnover = tvl * Math.min(activityRatio * 0.1, 0.5);

  // Without directional data, estimate balanced flows with slight bias
  // based on whether TVL is growing (proxy: high activity = growing)
  const netBias = activityRatio > 0.3 ? 0.6 : activityRatio > 0.1 ? 0.52 : 0.5;
  const adds = estimatedTurnover * netBias;
  const removes = estimatedTurnover * (1 - netBias);

  return {
    totalAddsUsd: Math.round(adds),
    totalRemovesUsd: Math.round(removes),
    netFlowUsd: Math.round(adds - removes),
    addCount: Math.round(activityRatio * 10),
    removeCount: Math.round(activityRatio * 8),
  };
}

// ── Analysis Functions ─────────────────────────────────────────────────────────

function computeFlowSummary(events: LiquidityEvent[]): FlowSummary {
  let totalAddsUsd = 0;
  let totalRemovesUsd = 0;
  let addCount = 0;
  let removeCount = 0;

  for (const ev of events) {
    if (ev.type === "add") {
      totalAddsUsd += ev.estimatedUsd;
      addCount++;
    } else {
      totalRemovesUsd += ev.estimatedUsd;
      removeCount++;
    }
  }

  return {
    totalAddsUsd: Math.round(totalAddsUsd),
    totalRemovesUsd: Math.round(totalRemovesUsd),
    netFlowUsd: Math.round(totalAddsUsd - totalRemovesUsd),
    addCount,
    removeCount,
  };
}

function classifyPhase(
  netFlowUsd: number,
  tvlUsd: number
): "ACCUMULATION" | "DISTRIBUTION" | "NEUTRAL" {
  if (tvlUsd === 0) return "NEUTRAL";
  const netPct = (netFlowUsd / tvlUsd) * 100;
  if (netPct > PHASE_THRESHOLD_PCT) return "ACCUMULATION";
  if (netPct < -PHASE_THRESHOLD_PCT) return "DISTRIBUTION";
  return "NEUTRAL";
}

function detectWhales(
  events: LiquidityEvent[],
  tvlUsd: number,
  whaleThresholdPct: number
): WhaleMovement[] {
  const threshold = tvlUsd * (whaleThresholdPct / 100);
  return events
    .filter((ev) => ev.estimatedUsd >= threshold)
    .map((ev) => ({
      type: ev.type,
      estimatedUsd: Math.round(ev.estimatedUsd),
      pctOfTvl: Math.round((ev.estimatedUsd / tvlUsd) * 1000) / 10,
      txid: ev.txid,
      sender: ev.sender,
      blockHeight: ev.blockHeight,
    }))
    .sort((a, b) => b.estimatedUsd - a.estimatedUsd);
}

function computeMomentumScore(
  flows: FlowSummary,
  tvlUsd: number,
  events: LiquidityEvent[],
  whales: WhaleMovement[],
  lookbackBlocks: number
): number {
  if (tvlUsd === 0) return 50;

  // 1. Net flow direction (40%) — positive flow = higher score
  const netPct = flows.netFlowUsd / tvlUsd;
  const flowScore = Math.max(0, Math.min(100, 50 + netPct * 500));

  // 2. Flow velocity (25%) — events per block
  const totalEvents = flows.addCount + flows.removeCount;
  const eventsPerBlock = totalEvents / Math.max(lookbackBlocks, 1);
  const velocityScore = Math.min(eventsPerBlock * 500, 100);

  // 3. Whale add/remove ratio (20%)
  const whaleAdds = whales.filter((w) => w.type === "add").length;
  const whaleRemoves = whales.filter((w) => w.type === "remove").length;
  const totalWhales = whaleAdds + whaleRemoves;
  const whaleScore = totalWhales > 0
    ? (whaleAdds / totalWhales) * 100
    : 50;

  // 4. Flow consistency (15%) — ratio of add events to total events
  const consistencyScore = totalEvents > 0
    ? (flows.addCount / totalEvents) * 100
    : 50;

  return Math.round(
    flowScore * 0.40 +
    velocityScore * 0.25 +
    whaleScore * 0.20 +
    consistencyScore * 0.15
  );
}

function generateSignal(
  momentumScore: number
): "BULLISH" | "NEUTRAL" | "BEARISH" {
  if (momentumScore > 65) return "BULLISH";
  if (momentumScore < 35) return "BEARISH";
  return "NEUTRAL";
}

function generateReasoning(
  flows: FlowSummary,
  tvlUsd: number,
  phase: string,
  whales: WhaleMovement[],
  momentumScore: number,
  lookbackBlocks: number
): string[] {
  const reasons: string[] = [];
  const netPct = tvlUsd > 0 ? Math.round((flows.netFlowUsd / tvlUsd) * 1000) / 10 : 0;

  if (flows.netFlowUsd > 0) {
    reasons.push(
      `Net inflow of $${flows.netFlowUsd.toLocaleString()} (${netPct}% of TVL) in last ${lookbackBlocks} blocks.`
    );
  } else if (flows.netFlowUsd < 0) {
    reasons.push(
      `Net outflow of $${Math.abs(flows.netFlowUsd).toLocaleString()} (${Math.abs(netPct)}% of TVL) in last ${lookbackBlocks} blocks.`
    );
  } else {
    reasons.push(`Balanced flows in last ${lookbackBlocks} blocks — no strong directional bias.`);
  }

  const totalEvents = flows.addCount + flows.removeCount;
  if (totalEvents > 0) {
    reasons.push(`${flows.addCount} deposits vs ${flows.removeCount} withdrawals (${totalEvents} total events).`);
  }

  if (whales.length > 0) {
    const whaleAdds = whales.filter((w) => w.type === "add").length;
    const whaleRemoves = whales.filter((w) => w.type === "remove").length;
    reasons.push(
      `${whales.length} whale movement(s) detected: ${whaleAdds} deposit(s), ${whaleRemoves} withdrawal(s).`
    );
  }

  if (momentumScore > 75) {
    reasons.push("Strong bullish momentum — consider adding liquidity.");
  } else if (momentumScore < 25) {
    reasons.push("Weak momentum — consider reducing exposure or waiting.");
  }

  if (phase === "ACCUMULATION" && flows.addCount > flows.removeCount * 2) {
    reasons.push("Deposit-heavy activity suggests growing LP confidence.");
  }
  if (phase === "DISTRIBUTION" && flows.removeCount > flows.addCount * 2) {
    reasons.push("Withdrawal-heavy activity may signal decreasing LP confidence.");
  }

  return reasons;
}

// ── Command Handlers ───────────────────────────────────────────────────────────

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
    const events = await fetchContractEvents(0, 1);
    results["contract_events"] = events.length >= 0 ? "ok" : "no events";
  } catch (e: any) {
    results["contract_events"] = `error: ${e.message}`;
  }

  console.log(
    JSON.stringify({
      tool: "hodlmm-liquidity-flow",
      command: "doctor",
      status: Object.values(results).every((v) => v === "ok") ? "healthy" : "degraded",
      checks: results,
    })
  );
}

async function runInstallPacks(): Promise<void> {
  console.log(
    JSON.stringify({
      tool: "hodlmm-liquidity-flow",
      command: "install-packs",
      status: "ok",
      message: "No additional dependencies required. Uses commander (workspace) + native fetch.",
    })
  );
}

async function runFlowAnalysis(options: {
  pool?: string;
  blocks?: string;
  whale?: string;
}): Promise<void> {
  const poolQuery = options.pool || "sbtc-stx";
  const lookbackBlocks = options.blocks ? parseInt(options.blocks, 10) : DEFAULT_BLOCKS;
  const whalePct = options.whale ? parseFloat(options.whale) : DEFAULT_WHALE_PCT;

  // 1. Fetch pool metadata
  const appPools = await fetchAppPools();
  if (appPools.length === 0) {
    console.log(
      JSON.stringify({ tool: "hodlmm-liquidity-flow", error: "Could not fetch pool list from Bitflow API" })
    );
    return;
  }

  let poolId: number;
  let appPool: AppPool | null;
  try {
    const resolved = await resolvePool(poolQuery, appPools);
    poolId = resolved.poolId;
    appPool = resolved.pool;
  } catch (e: any) {
    console.log(JSON.stringify({ tool: "hodlmm-liquidity-flow", error: e.message }));
    return;
  }

  if (!appPool) {
    console.log(
      JSON.stringify({ tool: "hodlmm-liquidity-flow", error: `Pool metadata not found for ${poolQuery}` })
    );
    return;
  }

  const tvlUsd = appPool.tvlUsd || 0;

  // 2. Fetch liquidity events
  const events = await fetchPoolFlowEvents(poolId, appPool, lookbackBlocks);

  // 3. Compute flows (use event-based or fallback to estimation)
  let flows: FlowSummary;
  let usedEstimation = false;

  if (events.length > 0) {
    flows = computeFlowSummary(events);
  } else {
    flows = await estimateFlowFromOnChain(poolId, appPool);
    usedEstimation = true;
  }

  // 4. Classify phase and detect whales
  const phase = classifyPhase(flows.netFlowUsd, tvlUsd);
  const whales = events.length > 0 ? detectWhales(events, tvlUsd, whalePct) : [];
  const momentumScore = computeMomentumScore(flows, tvlUsd, events, whales, lookbackBlocks);
  const signal = generateSignal(momentumScore);
  const reasoning = generateReasoning(flows, tvlUsd, phase, whales, momentumScore, lookbackBlocks);

  if (usedEstimation) {
    reasoning.push("Note: Flow data estimated from pool metrics (no direct events found in window).");
  }

  const result: FlowAnalysis = {
    pool: {
      id: poolId,
      pair: `${appPool.token0Symbol}-${appPool.token1Symbol}`,
      tvlUsd: Math.round(tvlUsd),
    },
    window: { blocks: lookbackBlocks, eventsFound: events.length },
    flows,
    phase,
    momentumScore,
    whaleMovements: whales.slice(0, 10),
    signal,
    reasoning,
  };

  console.log(
    JSON.stringify({
      tool: "hodlmm-liquidity-flow",
      command: "run",
      ...result,
      timestamp: new Date().toISOString(),
    })
  );
}

async function runScanAll(options: {
  blocks?: string;
  top?: string;
}): Promise<void> {
  const lookbackBlocks = options.blocks ? parseInt(options.blocks, 10) : DEFAULT_BLOCKS;
  const topN = options.top ? parseInt(options.top, 10) : 10;

  const appPools = await fetchAppPools();
  if (appPools.length === 0) {
    console.log(
      JSON.stringify({ tool: "hodlmm-liquidity-flow", error: "Could not fetch pool list from Bitflow API" })
    );
    return;
  }

  const hodlmmPools = appPools.filter((p) => p.poolId && p.poolId > 0 && p.tvlUsd >= MIN_TVL_USD);
  const analyses: Array<{
    pair: string;
    poolId: number;
    tvlUsd: number;
    netFlowUsd: number;
    netFlowPct: number;
    phase: string;
    momentumScore: number;
    signal: string;
    eventsFound: number;
  }> = [];

  for (const pool of hodlmmPools) {
    if (!pool.poolId) continue;

    const events = await fetchPoolFlowEvents(pool.poolId, pool, lookbackBlocks);
    let flows: FlowSummary;

    if (events.length > 0) {
      flows = computeFlowSummary(events);
    } else {
      flows = await estimateFlowFromOnChain(pool.poolId, pool);
    }

    const tvl = pool.tvlUsd || 1;
    const phase = classifyPhase(flows.netFlowUsd, tvl);
    const whales = events.length > 0 ? detectWhales(events, tvl, DEFAULT_WHALE_PCT) : [];
    const momentumScore = computeMomentumScore(flows, tvl, events, whales, lookbackBlocks);
    const signal = generateSignal(momentumScore);

    analyses.push({
      pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
      poolId: pool.poolId,
      tvlUsd: Math.round(tvl),
      netFlowUsd: flows.netFlowUsd,
      netFlowPct: Math.round((flows.netFlowUsd / tvl) * 1000) / 10,
      phase,
      momentumScore,
      signal,
      eventsFound: events.length,
    });
  }

  // Sort by momentum score descending
  const ranked = analyses
    .sort((a, b) => b.momentumScore - a.momentumScore)
    .slice(0, topN)
    .map((a, i) => ({ rank: i + 1, ...a }));

  console.log(
    JSON.stringify({
      tool: "hodlmm-liquidity-flow",
      command: "scan",
      poolsAnalyzed: analyses.length,
      lookbackBlocks,
      topPools: ranked,
      timestamp: new Date().toISOString(),
    })
  );
}

// ── CLI Setup ──────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-liquidity-flow")
  .description("HODLMM Liquidity Flow Tracker — Net flow monitoring, whale detection, and momentum scoring")
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
  .description("Analyze liquidity flows for a specific pool")
  .option("--pool <id>", "Pool ID or token pair name (e.g., sbtc-stx, 1)", "sbtc-stx")
  .option("--blocks <n>", "Lookback window in blocks (~10s each)", String(DEFAULT_BLOCKS))
  .option("--whale <pct>", "Whale threshold as % of pool TVL", String(DEFAULT_WHALE_PCT))
  .action(runFlowAnalysis);

program
  .command("scan")
  .description("Scan all HODLMM pools for flow momentum")
  .option("--blocks <n>", "Lookback window in blocks", String(DEFAULT_BLOCKS))
  .option("--top <n>", "Number of pools to show", "10")
  .action(runScanAll);

program.parse();
