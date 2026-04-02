#!/usr/bin/env bun
/**
 * hodlmm-whale-detector.ts
 *
 * HODLMM Whale Detector — Scans contract events for large LP operations,
 * identifies whale addresses, measures LP concentration risk.
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 31).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const DLMM_CONTRACT_ID = `${DLMM_CONTRACT_ADDR}.${DLMM_CONTRACT_NAME}`;
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const DEFAULT_MIN_USD = 1000;
const DEFAULT_EVENT_LIMIT = 50;

// HHI thresholds
const HHI_DISTRIBUTED = 1000;
const HHI_MODERATE = 2500;
const HHI_CONCENTRATED = 5000;

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
}

interface LPEvent {
  address: string;
  type: "deposit" | "withdrawal";
  amountX: number;
  amountY: number;
  estimatedUsd: number;
  txid: string;
  blockHeight: number;
}

interface WhaleEntry {
  address: string;
  type: "deposit" | "withdrawal";
  estimatedUsd: number;
  poolSharePct: number;
  txid: string;
  blockHeight: number;
}

interface AddressStats {
  address: string;
  totalDepositedUsd: number;
  totalWithdrawnUsd: number;
  netUsd: number;
  eventCount: number;
  lastSeen: number;
}

interface ConcentrationResult {
  topAddress: string;
  topAddressSharePct: number;
  top3SharePct: number;
  top5SharePct: number;
  uniqueLPs: number;
  hhi: number;
  grade: "DISTRIBUTED" | "MODERATE" | "CONCENTRATED" | "MONOPOLISTIC";
  reasoning: string;
}

interface NetFlowResult {
  depositsUsd: number;
  withdrawalsUsd: number;
  netUsd: number;
  sentiment: "ACCUMULATION" | "NEUTRAL" | "DISTRIBUTION" | "EXODUS";
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

// ── Event Fetching & Parsing ──────────────────────────────────────────────────

async function fetchContractEvents(
  poolId: number,
  limit: number
): Promise<LPEvent[]> {
  const events: LPEvent[] = [];

  // Fetch smart contract events from Hiro
  const url = `${HIRO_API}/extended/v1/contract/${DLMM_CONTRACT_ID}/events?limit=${Math.min(limit, 50)}&offset=0`;

  try {
    const resp = await fetchJson(url);
    const rawEvents = resp.results || resp.events || [];

    for (const evt of rawEvents) {
      const parsed = parseContractEvent(evt, poolId);
      if (parsed) events.push(parsed);
    }
  } catch {
    // Try alternative: transaction events for the contract
    try {
      const txUrl = `${HIRO_API}/extended/v1/tx/events?address=${DLMM_CONTRACT_ID}&limit=${Math.min(limit, 50)}&offset=0&type=smart_contract_log`;
      const txResp = await fetchJson(txUrl);
      const rawEvents = txResp.results || txResp.events || [];

      for (const evt of rawEvents) {
        const parsed = parseContractEvent(evt, poolId);
        if (parsed) events.push(parsed);
      }
    } catch {
      // Events API not available — fall back to recent transactions
    }
  }

  // If events API didn't yield results, try fetching recent contract transactions
  if (events.length === 0) {
    try {
      const txsUrl = `${HIRO_API}/extended/v1/address/${DLMM_CONTRACT_ID}/transactions?limit=${Math.min(limit, 50)}`;
      const txsResp = await fetchJson(txsUrl);
      const txs = txsResp.results || [];

      for (const tx of txs) {
        const parsed = parseTxForLPEvent(tx, poolId);
        if (parsed) events.push(parsed);
      }
    } catch {
      // Transaction fetch failed
    }
  }

  return events;
}

function parseContractEvent(evt: any, targetPoolId: number): LPEvent | null {
  try {
    const repr = evt.contract_log?.value?.repr || evt.value?.repr || "";
    const txid = evt.tx_id || evt.txid || "";
    const blockHeight = evt.block_height || 0;
    const sender = evt.tx?.sender_address || evt.sender_address || "";

    // Look for add-liquidity or remove-liquidity patterns
    const isAdd = repr.includes("add-liquidity") || repr.includes("mint");
    const isRemove = repr.includes("remove-liquidity") || repr.includes("burn");

    if (!isAdd && !isRemove) return null;

    // Try to extract pool-id from event
    const poolIdMatch = repr.match(/pool-id\s+u(\d+)/);
    if (poolIdMatch && parseInt(poolIdMatch[1], 10) !== targetPoolId) return null;

    // Extract amounts
    const amountXMatch = repr.match(/amount-x\s+u(\d+)/);
    const amountYMatch = repr.match(/amount-y\s+u(\d+)/);
    const amountX = amountXMatch ? parseInt(amountXMatch[1], 10) : 0;
    const amountY = amountYMatch ? parseInt(amountYMatch[1], 10) : 0;

    return {
      address: sender,
      type: isAdd ? "deposit" : "withdrawal",
      amountX,
      amountY,
      estimatedUsd: 0, // calculated later with price data
      txid,
      blockHeight,
    };
  } catch {
    return null;
  }
}

function parseTxForLPEvent(tx: any, targetPoolId: number): LPEvent | null {
  try {
    const fnName = tx.contract_call?.function_name || "";
    const sender = tx.sender_address || "";
    const txid = tx.tx_id || "";
    const blockHeight = tx.block_height || 0;

    const isAdd = fnName.includes("add-liquidity") || fnName === "add_liquidity";
    const isRemove = fnName.includes("remove-liquidity") || fnName === "remove_liquidity";

    if (!isAdd && !isRemove) return null;

    // Check if this tx targets the right contract
    const contractId = tx.contract_call?.contract_id || "";
    if (!contractId.includes(DLMM_CONTRACT_NAME)) return null;

    // Try to extract pool-id from function args
    const args = tx.contract_call?.function_args || [];
    const poolIdArg = args.find((a: any) => a.name === "pool-id" || a.name === "pair-id");
    if (poolIdArg) {
      const pId = parseInt(poolIdArg.repr?.replace("u", "") || "0", 10);
      if (pId !== targetPoolId && pId !== 0) return null;
    }

    // Extract amounts from args or post-conditions
    let amountX = 0;
    let amountY = 0;

    // Try from function args
    const amtXArg = args.find((a: any) => a.name === "amount-x" || a.name === "amount-x-desired");
    const amtYArg = args.find((a: any) => a.name === "amount-y" || a.name === "amount-y-desired");
    if (amtXArg) amountX = parseInt(amtXArg.repr?.replace("u", "") || "0", 10);
    if (amtYArg) amountY = parseInt(amtYArg.repr?.replace("u", "") || "0", 10);

    // Fallback: try post-conditions for transfer amounts
    if (amountX === 0 && amountY === 0 && tx.post_conditions) {
      for (const pc of tx.post_conditions) {
        const amt = parseInt(pc.amount || "0", 10);
        if (amt > 0) {
          if (amountX === 0) amountX = amt;
          else if (amountY === 0) amountY = amt;
        }
      }
    }

    return {
      address: sender,
      type: isAdd ? "deposit" : "withdrawal",
      amountX,
      amountY,
      estimatedUsd: 0,
      txid,
      blockHeight,
    };
  } catch {
    return null;
  }
}

// ── Analysis Engine ────────────────────────────────────────────────────────────

function enrichEventsWithPrices(events: LPEvent[], pool: AppPool): LPEvent[] {
  const xDecimals = pool.token0Decimals || 8;
  const yDecimals = pool.token1Decimals || 6;
  const xPrice = pool.token0PriceUsd || 0;
  const yPrice = pool.token1PriceUsd || 0;

  return events.map((e) => ({
    ...e,
    estimatedUsd:
      (e.amountX / Math.pow(10, xDecimals)) * xPrice +
      (e.amountY / Math.pow(10, yDecimals)) * yPrice,
  }));
}

function analyzeAddressConcentration(events: LPEvent[], tvlUsd: number): ConcentrationResult {
  // Build per-address stats
  const addressMap = new Map<string, AddressStats>();

  for (const evt of events) {
    if (!evt.address) continue;
    const existing = addressMap.get(evt.address) || {
      address: evt.address,
      totalDepositedUsd: 0,
      totalWithdrawnUsd: 0,
      netUsd: 0,
      eventCount: 0,
      lastSeen: 0,
    };

    if (evt.type === "deposit") {
      existing.totalDepositedUsd += evt.estimatedUsd;
    } else {
      existing.totalWithdrawnUsd += evt.estimatedUsd;
    }
    existing.netUsd = existing.totalDepositedUsd - existing.totalWithdrawnUsd;
    existing.eventCount++;
    existing.lastSeen = Math.max(existing.lastSeen, evt.blockHeight);

    addressMap.set(evt.address, existing);
  }

  // Filter to addresses with positive net (currently providing liquidity)
  const activeLPs = Array.from(addressMap.values())
    .filter((a) => a.netUsd > 0)
    .sort((a, b) => b.netUsd - a.netUsd);

  if (activeLPs.length === 0) {
    return {
      topAddress: "N/A",
      topAddressSharePct: 0,
      top3SharePct: 0,
      top5SharePct: 0,
      uniqueLPs: 0,
      hhi: 0,
      grade: "DISTRIBUTED",
      reasoning: "No LP activity detected in scanned events.",
    };
  }

  const totalNet = activeLPs.reduce((s, a) => s + a.netUsd, 0);
  const refTotal = Math.max(totalNet, tvlUsd);

  // Calculate shares
  const shares = activeLPs.map((a) => ({
    address: a.address,
    sharePct: refTotal > 0 ? (a.netUsd / refTotal) * 100 : 0,
  }));

  const topAddress = shares[0]?.address || "N/A";
  const topAddressSharePct = Math.round((shares[0]?.sharePct || 0) * 100) / 100;
  const top3SharePct = Math.round(shares.slice(0, 3).reduce((s, a) => s + a.sharePct, 0) * 100) / 100;
  const top5SharePct = Math.round(shares.slice(0, 5).reduce((s, a) => s + a.sharePct, 0) * 100) / 100;

  // HHI = sum of squared percentage shares
  const hhi = Math.round(shares.reduce((s, a) => s + a.sharePct * a.sharePct, 0));

  let grade: ConcentrationResult["grade"];
  if (hhi <= HHI_DISTRIBUTED) grade = "DISTRIBUTED";
  else if (hhi <= HHI_MODERATE) grade = "MODERATE";
  else if (hhi <= HHI_CONCENTRATED) grade = "CONCENTRATED";
  else grade = "MONOPOLISTIC";

  let reasoning: string;
  if (grade === "DISTRIBUTED") {
    reasoning = `Well-distributed LP base with ${activeLPs.length} active providers. HHI ${hhi} indicates healthy decentralization.`;
  } else if (grade === "MODERATE") {
    reasoning = `Some LP concentration. Top address holds ${topAddressSharePct.toFixed(1)}%. HHI ${hhi} — manageable but monitor.`;
  } else if (grade === "CONCENTRATED") {
    reasoning = `High concentration risk. Top LP controls ${topAddressSharePct.toFixed(1)}% of observed liquidity. HHI ${hhi}.`;
  } else {
    reasoning = `Near-monopolistic LP control. Top address holds ${topAddressSharePct.toFixed(1)}%. Exit by this LP would devastate the pool.`;
  }

  return {
    topAddress,
    topAddressSharePct,
    top3SharePct,
    top5SharePct,
    uniqueLPs: activeLPs.length,
    hhi,
    grade,
    reasoning,
  };
}

function analyzeNetFlow(events: LPEvent[]): NetFlowResult {
  let depositsUsd = 0;
  let withdrawalsUsd = 0;

  for (const evt of events) {
    if (evt.type === "deposit") depositsUsd += evt.estimatedUsd;
    else withdrawalsUsd += evt.estimatedUsd;
  }

  depositsUsd = Math.round(depositsUsd);
  withdrawalsUsd = Math.round(withdrawalsUsd);
  const netUsd = depositsUsd - withdrawalsUsd;

  let sentiment: NetFlowResult["sentiment"];
  if (depositsUsd > withdrawalsUsd * 2) {
    sentiment = "ACCUMULATION";
  } else if (withdrawalsUsd > depositsUsd * 3) {
    sentiment = "EXODUS";
  } else if (withdrawalsUsd > depositsUsd * 2) {
    sentiment = "DISTRIBUTION";
  } else {
    sentiment = "NEUTRAL";
  }

  return { depositsUsd, withdrawalsUsd, netUsd, sentiment };
}

function filterWhales(events: LPEvent[], minUsd: number, tvlUsd: number): WhaleEntry[] {
  return events
    .filter((e) => e.estimatedUsd >= minUsd)
    .map((e) => ({
      address: e.address,
      type: e.type,
      estimatedUsd: Math.round(e.estimatedUsd),
      poolSharePct: tvlUsd > 0
        ? Math.round((e.estimatedUsd / tvlUsd) * 10000) / 100
        : 0,
      txid: e.txid,
      blockHeight: e.blockHeight,
    }))
    .sort((a, b) => b.estimatedUsd - a.estimatedUsd);
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
    const url = `${HIRO_API}/extended/v1/contract/${DLMM_CONTRACT_ID}/events?limit=1`;
    const resp = await fetchJson(url);
    results["contract_events"] = (resp.results || resp.events) ? "ok" : "no events";
  } catch (e: any) {
    results["contract_events"] = `error: ${e.message}`;
  }

  console.log(
    JSON.stringify({
      tool: "hodlmm-whale-detector",
      command: "doctor",
      status: Object.values(results).every((v) => v === "ok") ? "healthy" : "degraded",
      checks: results,
      timestamp: new Date().toISOString(),
    })
  );
}

async function runInstallPacks(): Promise<void> {
  console.log(
    JSON.stringify({
      tool: "hodlmm-whale-detector",
      command: "install-packs",
      status: "ok",
      message: "No additional dependencies required. Uses commander (workspace) + native fetch.",
      timestamp: new Date().toISOString(),
    })
  );
}

async function runWhaleDetect(options: {
  pool?: string;
  minUsd?: string;
  limit?: string;
}): Promise<void> {
  const poolQuery = options.pool || "sbtc-stx";
  const minUsd = options.minUsd ? parseInt(options.minUsd, 10) : DEFAULT_MIN_USD;
  const eventLimit = options.limit ? parseInt(options.limit, 10) : DEFAULT_EVENT_LIMIT;

  const appPools = await fetchAppPools();
  if (appPools.length === 0) {
    console.log(
      JSON.stringify({ tool: "hodlmm-whale-detector", error: "Could not fetch pool list from Bitflow API", timestamp: new Date().toISOString() })
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
    console.log(JSON.stringify({ tool: "hodlmm-whale-detector", error: e.message, timestamp: new Date().toISOString() }));
    return;
  }

  if (!appPool) {
    console.log(
      JSON.stringify({ tool: "hodlmm-whale-detector", error: `Pool metadata not found for ${poolQuery}`, timestamp: new Date().toISOString() })
    );
    return;
  }

  const tvlUsd = appPool.tvlUsd || 0;

  // Fetch and enrich events
  const rawEvents = await fetchContractEvents(poolId, eventLimit);
  const events = enrichEventsWithPrices(rawEvents, appPool);

  // Analyze
  const whaleActivity = filterWhales(events, minUsd, tvlUsd);
  const concentration = analyzeAddressConcentration(events, tvlUsd);
  const netFlow = analyzeNetFlow(events);

  const reasoning: string[] = [];
  reasoning.push(`Scanned ${events.length} LP events for pool ${appPool.token0Symbol}-${appPool.token1Symbol}.`);
  reasoning.push(`Found ${whaleActivity.length} whale-sized operations (>$${minUsd.toLocaleString()}).`);
  reasoning.push(`Concentration: ${concentration.grade} (HHI ${concentration.hhi}).`);
  reasoning.push(`Net flow: ${netFlow.sentiment} ($${netFlow.netUsd.toLocaleString()} net).`);

  if (concentration.grade === "CONCENTRATED" || concentration.grade === "MONOPOLISTIC") {
    reasoning.push(`WARNING: High concentration risk — top LP controls ${concentration.topAddressSharePct.toFixed(1)}% of observed liquidity.`);
  }

  if (netFlow.sentiment === "EXODUS") {
    reasoning.push(`WARNING: Sustained whale withdrawals detected — potential rug risk.`);
  }

  console.log(
    JSON.stringify({
      tool: "hodlmm-whale-detector",
      command: "run",
      pool: {
        id: poolId,
        pair: `${appPool.token0Symbol}-${appPool.token1Symbol}`,
        tvlUsd: Math.round(tvlUsd),
      },
      eventsScanned: events.length,
      whaleActivity: whaleActivity.slice(0, 20),
      concentration,
      netFlow,
      reasoning,
      timestamp: new Date().toISOString(),
    })
  );
}

async function runScanAll(options: {
  top?: string;
  sort?: string;
}): Promise<void> {
  const topN = options.top ? parseInt(options.top, 10) : 10;
  const sortBy = options.sort || "concentration";

  const appPools = await fetchAppPools();
  if (appPools.length === 0) {
    console.log(
      JSON.stringify({ tool: "hodlmm-whale-detector", error: "Could not fetch pool list from Bitflow API", timestamp: new Date().toISOString() })
    );
    return;
  }

  const hodlmmPools = appPools.filter((p) => p.poolId && p.poolId > 0 && p.tvlUsd >= MIN_TVL_USD);

  const analyses: Array<{
    pair: string;
    poolId: number;
    tvlUsd: number;
    eventsFound: number;
    whaleCount: number;
    hhi: number;
    concentrationGrade: string;
    topAddressSharePct: number;
    uniqueLPs: number;
    netFlowUsd: number;
    sentiment: string;
  }> = [];

  for (const pool of hodlmmPools) {
    if (!pool.poolId) continue;

    const rawEvents = await fetchContractEvents(pool.poolId, 30);
    const events = enrichEventsWithPrices(rawEvents, pool);
    const whales = filterWhales(events, DEFAULT_MIN_USD, pool.tvlUsd || 0);
    const concentration = analyzeAddressConcentration(events, pool.tvlUsd || 0);
    const netFlow = analyzeNetFlow(events);

    analyses.push({
      pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
      poolId: pool.poolId,
      tvlUsd: Math.round(pool.tvlUsd || 0),
      eventsFound: events.length,
      whaleCount: whales.length,
      hhi: concentration.hhi,
      concentrationGrade: concentration.grade,
      topAddressSharePct: concentration.topAddressSharePct,
      uniqueLPs: concentration.uniqueLPs,
      netFlowUsd: netFlow.netUsd,
      sentiment: netFlow.sentiment,
    });
  }

  let sorted: typeof analyses;
  switch (sortBy) {
    case "whale-count":
      sorted = analyses.sort((a, b) => b.whaleCount - a.whaleCount);
      break;
    case "tvl":
      sorted = analyses.sort((a, b) => b.tvlUsd - a.tvlUsd);
      break;
    default: // concentration — highest HHI first (most concentrated = highest risk)
      sorted = analyses.sort((a, b) => b.hhi - a.hhi);
  }

  const ranked = sorted.slice(0, topN).map((a, i) => ({ rank: i + 1, ...a }));

  console.log(
    JSON.stringify({
      tool: "hodlmm-whale-detector",
      command: "scan",
      poolsAnalyzed: analyses.length,
      sortBy,
      topPools: ranked,
      summary: {
        distributed: analyses.filter((a) => a.concentrationGrade === "DISTRIBUTED").length,
        moderate: analyses.filter((a) => a.concentrationGrade === "MODERATE").length,
        concentrated: analyses.filter((a) => a.concentrationGrade === "CONCENTRATED").length,
        monopolistic: analyses.filter((a) => a.concentrationGrade === "MONOPOLISTIC").length,
        avgHhi: analyses.length > 0
          ? Math.round(analyses.reduce((s, a) => s + a.hhi, 0) / analyses.length)
          : 0,
        totalWhaleEvents: analyses.reduce((s, a) => s + a.whaleCount, 0),
        poolsWithExodus: analyses.filter((a) => a.sentiment === "EXODUS").length,
      },
      timestamp: new Date().toISOString(),
    })
  );
}

// ── CLI Setup ──────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-whale-detector")
  .description("HODLMM Whale Detector — Large LP operation scanning, address concentration, rug risk")
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
  .description("Detect whale activity for a specific pool")
  .option("--pool <id>", "Pool ID or token pair name (e.g., sbtc-stx, 1)", "sbtc-stx")
  .option("--min-usd <n>", "Minimum operation size to flag as whale", String(DEFAULT_MIN_USD))
  .option("--limit <n>", "Maximum events to scan", String(DEFAULT_EVENT_LIMIT))
  .action(runWhaleDetect);

program
  .command("scan")
  .description("Scan all HODLMM pools for whale concentration risk")
  .option("--top <n>", "Number of pools to show", "10")
  .option("--sort <field>", "Sort by: concentration, whale-count, tvl", "concentration")
  .action(runScanAll);

program.parse();
