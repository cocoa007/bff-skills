#!/usr/bin/env bun
/**
 * hodlmm-liquidity-shock.ts
 *
 * HODLMM Liquidity Shock Detector — Monitors on-chain events for sudden large
 * liquidity additions or removals that could destabilize DLMM pools. Analyzes
 * recent contract events to identify whale LP operations, measures shock
 * magnitude relative to pool TVL, and warns LPs about potential instability.
 *
 * Key metrics:
 *  - Shock magnitude (% of TVL added/removed in a single event)
 *  - Shock frequency (large events per recent block window)
 *  - Net flow direction (accumulation vs distribution)
 *  - Whale concentration (top depositor share of recent activity)
 *  - Pool stability score (0-100, higher = more stable)
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 64).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const SHOCK_THRESHOLD_PCT = 5; // events >= 5% of TVL are "shocks"
const MAJOR_SHOCK_PCT = 15; // events >= 15% are "major shocks"
const EVENT_SCAN_LIMIT = 50; // max events to scan
const BIN_SCAN_RADIUS = 30;

// ── Types ─────────────────────────────────────────────────────────────────────

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

type ShockType = "ADD" | "REMOVE";
type Severity = "NORMAL" | "SHOCK" | "MAJOR_SHOCK";
type StabilityGrade = "STABLE" | "MODERATE" | "VOLATILE" | "CRITICAL";

interface LiquidityEvent {
  txId: string;
  sender: string;
  type: ShockType;
  amountX: number;
  amountY: number;
  usdValue: number;
  pctOfTvl: number;
  severity: Severity;
  blockHeight: number;
  burnBlockTime?: number;
}

interface ShockAnalysis {
  pool: string;
  pair: string;
  tvlUsd: number;
  eventsScanned: number;
  totalEvents: number;
  addEvents: number;
  removeEvents: number;
  shockEvents: LiquidityEvent[];
  netFlow: {
    addUsd: number;
    removeUsd: number;
    netUsd: number;
    direction: "ACCUMULATION" | "DISTRIBUTION" | "BALANCED";
  };
  whaleConcentration: {
    uniqueAddresses: number;
    topAddress: string;
    topAddressPct: number;
    hhi: number;
  };
  shockMetrics: {
    shockCount: number;
    majorShockCount: number;
    avgShockPct: number;
    maxShockPct: number;
    shockFrequency: string;
  };
  stabilityScore: number;
  stabilityGrade: StabilityGrade;
  interpretation: string;
  verdict: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (!r.ok) {
        if (r.status === 429 && i < retries) { await sleep(2000 * (i + 1)); continue; }
        throw new Error(`HTTP ${r.status} for ${url}`);
      }
      return r.json();
    } catch (e: any) {
      if (i === retries) throw e;
      await sleep(1000 * (i + 1));
    }
  }
}

function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(2)}%`;
}

function barChart(value: number, maxValue: number, width: number = 20): string {
  if (maxValue === 0) return "░".repeat(width);
  const filled = Math.round((value / maxValue) * width);
  return "█".repeat(Math.min(filled, width)) + "░".repeat(Math.max(width - filled, 0));
}

function shortenAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function severityIcon(s: Severity): string {
  switch (s) {
    case "MAJOR_SHOCK": return "🔴";
    case "SHOCK": return "🟡";
    case "NORMAL": return "🟢";
  }
}

function gradeIcon(g: StabilityGrade): string {
  switch (g) {
    case "STABLE": return "🟢";
    case "MODERATE": return "🟡";
    case "VOLATILE": return "🟠";
    case "CRITICAL": return "🔴";
  }
}

// ── Data Fetching ─────────────────────────────────────────────────────────────

async function fetchPools(): Promise<AppPool[]> {
  const data = await fetchJson(`${BFF_APP_BASE}/hodlmm/pools`);
  const pools = Array.isArray(data) ? data : data?.data ?? data?.pools ?? [];
  return pools.filter((p: any) => (p.tvlUsd ?? 0) >= MIN_TVL_USD);
}

function findPool(query: string, pools: AppPool[]): AppPool | null {
  const q = query.toLowerCase();
  return (
    pools.find((p) => p.id?.toLowerCase() === q) ??
    pools.find((p) => {
      const pair = `${p.token0Symbol}-${p.token1Symbol}`.toLowerCase();
      return pair.includes(q) || q.includes(pair);
    }) ??
    pools.find((p) => {
      const sym = `${p.token0Symbol}${p.token1Symbol}`.toLowerCase();
      return sym.includes(q) || q.includes(sym);
    }) ??
    null
  );
}

async function fetchContractEvents(
  offset: number = 0,
  limit: number = EVENT_SCAN_LIMIT,
): Promise<any[]> {
  const url =
    `${HIRO_API}/extended/v1/contract/${DLMM_CONTRACT_ADDR}.${DLMM_CONTRACT_NAME}/events?offset=${offset}&limit=${limit}`;
  const data = await fetchJson(url);
  return data?.results ?? data?.events ?? [];
}

// ── Event Parsing ─────────────────────────────────────────────────────────────

function parseEventValue(repr: string): number {
  const match = repr.match(/u(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

function parseLiquidityEvent(
  event: any,
  pool: AppPool,
  poolId: number,
): LiquidityEvent | null {
  if (event.event_type !== "smart_contract_log") return null;

  const repr = event?.contract_log?.value?.repr ?? "";

  // Match add-liquidity and remove-liquidity events
  const isAdd = repr.includes("add-liquidity") || repr.includes("mint");
  const isRemove = repr.includes("remove-liquidity") || repr.includes("burn");
  if (!isAdd && !isRemove) return null;

  // Check if this event is for our pool
  const poolIdMatch = repr.match(/pool-id\s+u(\d+)/);
  if (poolIdMatch && parseInt(poolIdMatch[1]) !== poolId) return null;

  // Extract amounts
  const amtXMatch = repr.match(/amount-x\s+u(\d+)/);
  const amtYMatch = repr.match(/amount-y\s+u(\d+)/);

  const rawX = amtXMatch ? parseInt(amtXMatch[1]) : 0;
  const rawY = amtYMatch ? parseInt(amtYMatch[1]) : 0;

  if (rawX === 0 && rawY === 0) return null;

  const amountX = rawX / 10 ** pool.token0Decimals;
  const amountY = rawY / 10 ** pool.token1Decimals;
  const usdValue = amountX * pool.token0PriceUsd + amountY * pool.token1PriceUsd;
  const pctOfTvl = pool.tvlUsd > 0 ? (usdValue / pool.tvlUsd) * 100 : 0;

  let severity: Severity = "NORMAL";
  if (pctOfTvl >= MAJOR_SHOCK_PCT) severity = "MAJOR_SHOCK";
  else if (pctOfTvl >= SHOCK_THRESHOLD_PCT) severity = "SHOCK";

  return {
    txId: event.tx_id ?? "unknown",
    sender: event.contract_log?.contract_id?.split(".")[0] ?? event.sender_address ?? "unknown",
    type: isAdd ? "ADD" : "REMOVE",
    amountX,
    amountY,
    usdValue,
    pctOfTvl,
    severity,
    blockHeight: event.block_height ?? 0,
    burnBlockTime: event.burn_block_time,
  };
}

// ── Analysis ──────────────────────────────────────────────────────────────────

async function analyzeShocks(pool: AppPool): Promise<ShockAnalysis> {
  const poolId = pool.poolId ?? parseInt(pool.id);
  const pair = `${pool.token0Symbol}-${pool.token1Symbol}`;

  // Fetch recent contract events
  const rawEvents = await fetchContractEvents(0, EVENT_SCAN_LIMIT);

  // Parse events relevant to this pool
  const events: LiquidityEvent[] = [];
  for (const raw of rawEvents) {
    const parsed = parseLiquidityEvent(raw, pool, poolId);
    if (parsed) events.push(parsed);
  }

  const addEvents = events.filter((e) => e.type === "ADD");
  const removeEvents = events.filter((e) => e.type === "REMOVE");
  const shockEvents = events.filter((e) => e.severity !== "NORMAL");

  // Net flow
  const addUsd = addEvents.reduce((s, e) => s + e.usdValue, 0);
  const removeUsd = removeEvents.reduce((s, e) => s + e.usdValue, 0);
  const netUsd = addUsd - removeUsd;
  let flowDirection: "ACCUMULATION" | "DISTRIBUTION" | "BALANCED" = "BALANCED";
  if (netUsd > pool.tvlUsd * 0.02) flowDirection = "ACCUMULATION";
  else if (netUsd < -pool.tvlUsd * 0.02) flowDirection = "DISTRIBUTION";

  // Whale concentration
  const senderTotals = new Map<string, number>();
  for (const e of events) {
    senderTotals.set(e.sender, (senderTotals.get(e.sender) ?? 0) + e.usdValue);
  }
  const sortedSenders = [...senderTotals.entries()].sort((a, b) => b[1] - a[1]);
  const totalActivity = events.reduce((s, e) => s + e.usdValue, 0);
  const topAddress = sortedSenders[0]?.[0] ?? "none";
  const topAddressPct = totalActivity > 0 ? ((sortedSenders[0]?.[1] ?? 0) / totalActivity) * 100 : 0;

  // HHI concentration index
  let hhi = 0;
  if (totalActivity > 0) {
    for (const [, vol] of senderTotals) {
      const share = vol / totalActivity;
      hhi += share * share;
    }
  }
  hhi = Math.round(hhi * 10000);

  // Shock metrics
  const shockCount = shockEvents.filter((e) => e.severity === "SHOCK").length;
  const majorShockCount = shockEvents.filter((e) => e.severity === "MAJOR_SHOCK").length;
  const avgShockPct = shockEvents.length > 0
    ? shockEvents.reduce((s, e) => s + e.pctOfTvl, 0) / shockEvents.length
    : 0;
  const maxShockPct = shockEvents.length > 0
    ? Math.max(...shockEvents.map((e) => e.pctOfTvl))
    : 0;

  // Block range for frequency calculation
  const blockHeights = events.map((e) => e.blockHeight).filter((b) => b > 0);
  const blockRange = blockHeights.length >= 2
    ? Math.max(...blockHeights) - Math.min(...blockHeights)
    : 1;
  const shockFrequency = blockRange > 0 && shockEvents.length > 0
    ? `${shockEvents.length} shocks in ~${blockRange} blocks (~${(blockRange / shockEvents.length).toFixed(0)} blocks/shock)`
    : "No shocks detected";

  // Stability score (0-100, higher = more stable)
  let stabilityScore = 100;

  // Penalize for shock events
  stabilityScore -= shockCount * 8;
  stabilityScore -= majorShockCount * 20;

  // Penalize for whale concentration
  if (topAddressPct > 50) stabilityScore -= 15;
  else if (topAddressPct > 30) stabilityScore -= 8;

  // Penalize for distribution flow
  if (flowDirection === "DISTRIBUTION") stabilityScore -= 10;

  // Penalize for HHI concentration
  if (hhi > 5000) stabilityScore -= 10;
  else if (hhi > 2500) stabilityScore -= 5;

  // Penalize for high max shock
  if (maxShockPct > 30) stabilityScore -= 15;
  else if (maxShockPct > 15) stabilityScore -= 8;

  stabilityScore = Math.max(0, Math.min(100, stabilityScore));

  let stabilityGrade: StabilityGrade;
  if (stabilityScore >= 80) stabilityGrade = "STABLE";
  else if (stabilityScore >= 60) stabilityGrade = "MODERATE";
  else if (stabilityScore >= 35) stabilityGrade = "VOLATILE";
  else stabilityGrade = "CRITICAL";

  // Interpretation
  let interpretation: string;
  if (stabilityGrade === "STABLE") {
    interpretation = "Pool liquidity is stable — no significant shock events detected. LP positions are unlikely to be disrupted by sudden liquidity changes.";
  } else if (stabilityGrade === "MODERATE") {
    interpretation = `Some notable liquidity events detected (${shockEvents.length} shocks). Monitor for acceleration — current activity is within normal ranges but trending toward instability.`;
  } else if (stabilityGrade === "VOLATILE") {
    interpretation = `Elevated liquidity volatility — ${shockEvents.length} shock events detected, including ${majorShockCount} major shocks. Large LP movements may cause slippage spikes and temporary price dislocations. Consider tightening positions.`;
  } else {
    interpretation = `CRITICAL instability — ${majorShockCount} major shock events detected with up to ${fmtPct(maxShockPct)} TVL moved in single transactions. Pool may experience cascading withdrawals. Exercise extreme caution.`;
  }

  const verdict = [
    `${gradeIcon(stabilityGrade)} ${pair}: ${stabilityGrade} (Score: ${stabilityScore}/100)`,
    `Shocks: ${shockEvents.length} (${majorShockCount} major) | Flow: ${flowDirection}`,
    `Top whale: ${fmtPct(topAddressPct)} of activity | Net: ${netUsd >= 0 ? "+" : ""}${fmtUsd(netUsd)}`,
  ].join("\n");

  return {
    pool: pool.id,
    pair,
    tvlUsd: pool.tvlUsd,
    eventsScanned: rawEvents.length,
    totalEvents: events.length,
    addEvents: addEvents.length,
    removeEvents: removeEvents.length,
    shockEvents,
    netFlow: { addUsd, removeUsd, netUsd, direction: flowDirection },
    whaleConcentration: {
      uniqueAddresses: senderTotals.size,
      topAddress,
      topAddressPct,
      hhi,
    },
    shockMetrics: {
      shockCount,
      majorShockCount,
      avgShockPct,
      maxShockPct,
      shockFrequency,
    },
    stabilityScore,
    stabilityGrade,
    interpretation,
    verdict,
  };
}

// ── Display ───────────────────────────────────────────────────────────────────

function displayShockAnalysis(r: ShockAnalysis): void {
  console.log("\n" + "═".repeat(72));
  console.log(`  HODLMM LIQUIDITY SHOCK DETECTOR — ${r.pair}`);
  console.log("═".repeat(72));

  console.log(`\n  Pool:           ${r.pool}`);
  console.log(`  TVL:            ${fmtUsd(r.tvlUsd)}`);
  console.log(`  Events Scanned: ${r.eventsScanned} (${r.totalEvents} liquidity events)`);
  console.log(`  Add Events:     ${r.addEvents}`);
  console.log(`  Remove Events:  ${r.removeEvents}`);

  console.log("\n── Net Flow ────────────────────────────────────────");
  const maxFlow = Math.max(r.netFlow.addUsd, r.netFlow.removeUsd);
  console.log(`  Inflows:    ${fmtUsd(r.netFlow.addUsd).padStart(10)} | ${barChart(r.netFlow.addUsd, maxFlow, 25)}`);
  console.log(`  Outflows:   ${fmtUsd(r.netFlow.removeUsd).padStart(10)} | ${barChart(r.netFlow.removeUsd, maxFlow, 25)}`);
  console.log(`  Net:        ${r.netFlow.netUsd >= 0 ? "+" : ""}${fmtUsd(r.netFlow.netUsd).padStart(9)} → ${r.netFlow.direction}`);

  console.log("\n── Shock Events ────────────────────────────────────");
  if (r.shockEvents.length === 0) {
    console.log("  No shock events detected — all activity within normal ranges.");
  } else {
    console.log(`  ${"Type".padEnd(8)} ${"Severity".padEnd(14)} ${"USD Value".padEnd(12)} ${"% TVL".padEnd(10)} ${"Block".padEnd(10)} Sender`);
    console.log("  " + "─".repeat(66));
    const displayShocks = r.shockEvents
      .sort((a, b) => b.pctOfTvl - a.pctOfTvl)
      .slice(0, 10);
    for (const e of displayShocks) {
      console.log(
        `  ${e.type.padEnd(8)} ${severityIcon(e.severity)} ${e.severity.padEnd(12)} ${fmtUsd(e.usdValue).padEnd(12)} ${fmtPct(e.pctOfTvl).padEnd(10)} ${String(e.blockHeight).padEnd(10)} ${shortenAddr(e.sender)}`
      );
    }
    if (r.shockEvents.length > 10) {
      console.log(`  ... and ${r.shockEvents.length - 10} more shock events`);
    }
  }

  console.log("\n── Shock Metrics ───────────────────────────────────");
  console.log(`  Total Shocks:   ${r.shockMetrics.shockCount} standard + ${r.shockMetrics.majorShockCount} major`);
  console.log(`  Avg Shock Size: ${fmtPct(r.shockMetrics.avgShockPct)} of TVL`);
  console.log(`  Max Shock Size: ${fmtPct(r.shockMetrics.maxShockPct)} of TVL`);
  console.log(`  Frequency:      ${r.shockMetrics.shockFrequency}`);

  console.log("\n── Whale Concentration ─────────────────────────────");
  console.log(`  Unique Addresses: ${r.whaleConcentration.uniqueAddresses}`);
  console.log(`  Top Address:      ${shortenAddr(r.whaleConcentration.topAddress)} (${fmtPct(r.whaleConcentration.topAddressPct)} of activity)`);
  console.log(`  HHI Index:        ${r.whaleConcentration.hhi} ${r.whaleConcentration.hhi > 2500 ? "(concentrated)" : "(diversified)"}`);

  console.log("\n── Stability Assessment ────────────────────────────");
  console.log(`  Score:  ${r.stabilityScore}/100 ${barChart(r.stabilityScore, 100, 25)}`);
  console.log(`  Grade:  ${gradeIcon(r.stabilityGrade)} ${r.stabilityGrade}`);
  console.log(`\n  ${r.interpretation}`);

  console.log("\n── Verdict ─────────────────────────────────────────");
  console.log(`  ${r.verdict.split("\n").join("\n  ")}`);

  console.log("\n" + "═".repeat(72));
}

function displayMultiPool(results: ShockAnalysis[]): void {
  console.log("\n" + "═".repeat(80));
  console.log("  HODLMM LIQUIDITY SHOCK DETECTOR — MULTI-POOL SCAN");
  console.log("═".repeat(80));

  const sorted = [...results].sort((a, b) => a.stabilityScore - b.stabilityScore);

  console.log(`\n  ${"Pair".padEnd(16)} ${"Grade".padEnd(12)} ${"Score".padEnd(8)} ${"Shocks".padEnd(10)} ${"Max %TVL".padEnd(10)} ${"Flow".padEnd(14)} Top Whale`);
  console.log("  " + "─".repeat(78));

  for (const r of sorted) {
    console.log(
      `  ${r.pair.padEnd(16)} ${gradeIcon(r.stabilityGrade)} ${r.stabilityGrade.padEnd(10)} ${String(r.stabilityScore).padEnd(8)} ${String(r.shockMetrics.shockCount + r.shockMetrics.majorShockCount).padEnd(10)} ${fmtPct(r.shockMetrics.maxShockPct).padEnd(10)} ${r.netFlow.direction.padEnd(14)} ${fmtPct(r.whaleConcentration.topAddressPct)}`
    );
  }

  // Summary
  const stable = sorted.filter((r) => r.stabilityGrade === "STABLE").length;
  const moderate = sorted.filter((r) => r.stabilityGrade === "MODERATE").length;
  const volatile_ = sorted.filter((r) => r.stabilityGrade === "VOLATILE").length;
  const critical = sorted.filter((r) => r.stabilityGrade === "CRITICAL").length;
  const avgScore = sorted.reduce((s, r) => s + r.stabilityScore, 0) / sorted.length;

  console.log("\n── Ecosystem Stability Summary ──────────────────────");
  console.log(`  Stable:     ${stable} pools`);
  console.log(`  Moderate:   ${moderate} pools`);
  console.log(`  Volatile:   ${volatile_} pools`);
  console.log(`  Critical:   ${critical} pools`);
  console.log(`  Avg Score:  ${avgScore.toFixed(0)}/100`);

  if (critical > 0) {
    const critPools = sorted.filter((r) => r.stabilityGrade === "CRITICAL");
    console.log(`\n  ⚠️  CRITICAL pools requiring attention:`);
    for (const p of critPools) {
      console.log(`     ${p.pair}: score ${p.stabilityScore}, ${p.shockMetrics.majorShockCount} major shocks, max ${fmtPct(p.shockMetrics.maxShockPct)} TVL`);
    }
  }

  console.log("\n" + "═".repeat(80));
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-liquidity-shock")
  .description(
    "Detect sudden large liquidity events in HODLMM pools that could destabilize " +
    "LP positions. Monitors for whale additions/removals and scores pool stability."
  )
  .argument("[pool]", "Pool ID or token pair (e.g., 'STX-sBTC')")
  .option("--all", "Scan all pools with sufficient TVL")
  .option("--top <n>", "Scan top N pools by TVL", "5")
  .option("--json", "Output raw JSON")
  .option("--threshold <pct>", "Shock threshold as % of TVL (default: 5)", "5")
  .action(async (poolQuery: string | undefined, opts: any) => {
    const threshold = parseFloat(opts.threshold) || SHOCK_THRESHOLD_PCT;

    let pools: AppPool[];
    try {
      pools = await fetchPools();
    } catch (e: any) {
      console.error(`Failed to fetch pools: ${e.message}`);
      process.exit(1);
    }

    if (pools.length === 0) {
      console.error("No pools found above minimum TVL threshold.");
      process.exit(1);
    }

    if (opts.all || !poolQuery) {
      const topN = opts.all ? pools.length : Math.min(parseInt(opts.top) || 5, pools.length);
      const sorted = [...pools].sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, topN);

      console.log(`Scanning ${sorted.length} pools for liquidity shocks (threshold: ${threshold}% TVL)...`);
      const results: ShockAnalysis[] = [];

      for (const pool of sorted) {
        try {
          const result = await analyzeShocks(pool);
          results.push(result);
          process.stderr.write(`  ✓ ${pool.token0Symbol}-${pool.token1Symbol} — ${result.stabilityGrade}\n`);
        } catch (e: any) {
          process.stderr.write(`  ✗ ${pool.token0Symbol}-${pool.token1Symbol}: ${e.message}\n`);
        }
        await sleep(300);
      }

      if (results.length === 0) {
        console.error("No pools could be analyzed.");
        process.exit(1);
      }

      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        displayMultiPool(results);
      }
    } else {
      const pool = findPool(poolQuery, pools);
      if (!pool) {
        console.error(`Pool not found: "${poolQuery}"`);
        console.error("Available pools:");
        pools.sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, 10).forEach((p) =>
          console.error(`  ${p.token0Symbol}-${p.token1Symbol} (${fmtUsd(p.tvlUsd)})`)
        );
        process.exit(1);
      }

      console.log(`Scanning ${pool.token0Symbol}-${pool.token1Symbol} for liquidity shocks...`);
      const result = await analyzeShocks(pool);

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        displayShockAnalysis(result);
      }
    }
  });

program.parse();
