#!/usr/bin/env bun
/**
 * hodlmm-liquidity-clock.ts
 *
 * HODLMM Liquidity Clock — Analyzes time-of-day and day-of-week patterns in
 * liquidity add/remove events to identify optimal timing windows for LP
 * operations. Uses on-chain event replay to build a temporal heatmap of
 * liquidity activity, revealing when large deposits/withdrawals cluster.
 *
 * Key metrics:
 *  - Hourly liquidity flow histogram (adds vs removes)
 *  - Day-of-week activity patterns
 *  - Peak/trough hours for deposits and withdrawals
 *  - Timing advantage score (how much flow timing matters)
 *  - Optimal entry/exit windows based on historical patterns
 *  - Quiet-hour detection for low-competition entries
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 58).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const FALLBACK_STX_PRICE_USD = 0.80;
const MAX_EVENTS_PER_QUERY = 50;
const BLOCKS_PER_HOUR = 6;
const BLOCKS_PER_DAY = 144;
const DEFAULT_LOOKBACK_DAYS = 14;
const STACKS_GENESIS_TIMESTAMP = 1617235200;
const STACKS_GENESIS_BLOCK = 0;
const AVG_BLOCK_TIME_SEC = 600;

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

interface LiquidityEvent {
  blockHeight: number;
  type: "add" | "remove";
  amountX: number;
  amountY: number;
  totalUsd: number;
  sender: string;
  estimatedTimestamp: number;
}

interface HourBucket {
  hour: number;
  addCount: number;
  removeCount: number;
  addVolumeUsd: number;
  removeVolumeUsd: number;
  netFlowUsd: number;
  avgAddSizeUsd: number;
  avgRemoveSizeUsd: number;
}

interface DayBucket {
  day: string;
  dayIndex: number;
  addCount: number;
  removeCount: number;
  addVolumeUsd: number;
  removeVolumeUsd: number;
  netFlowUsd: number;
}

interface TimingWindow {
  type: "entry" | "exit";
  startHour: number;
  endHour: number;
  reason: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

interface ClockAnalysis {
  pool: string;
  pair: string;
  tvlUsd: number;
  lookbackDays: number;
  totalEvents: number;
  totalAddCount: number;
  totalRemoveCount: number;
  totalAddVolumeUsd: number;
  totalRemoveVolumeUsd: number;
  hourlyBuckets: HourBucket[];
  dailyBuckets: DayBucket[];
  peakAddHour: number;
  troughAddHour: number;
  peakRemoveHour: number;
  troughRemoveHour: number;
  busiestDay: string;
  quietestDay: string;
  timingAdvantageScore: number;
  optimalWindows: TimingWindow[];
  verdict: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (!r.ok) {
        if (r.status === 429 && i < retries) {
          await sleep(2000 * (i + 1));
          continue;
        }
        throw new Error(`HTTP ${r.status} for ${url}`);
      }
      return r.json();
    } catch (e: any) {
      if (i === retries) throw e;
      await sleep(1000 * (i + 1));
    }
  }
}

function estimateTimestamp(blockHeight: number): number {
  return STACKS_GENESIS_TIMESTAMP + blockHeight * AVG_BLOCK_TIME_SEC;
}

function getHourOfDay(timestamp: number): number {
  return new Date(timestamp * 1000).getUTCHours();
}

function getDayOfWeek(timestamp: number): number {
  return new Date(timestamp * 1000).getUTCDay();
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function barChart(value: number, maxValue: number, width: number = 20): string {
  if (maxValue === 0) return "░".repeat(width);
  const filled = Math.round((value / maxValue) * width);
  return "█".repeat(Math.min(filled, width)) + "░".repeat(Math.max(width - filled, 0));
}

// ── Data Fetching ─────────────────────────────────────────────────────────────

async function fetchPools(): Promise<AppPool[]> {
  const data = await fetchJson(`${BFF_APP_BASE}/hodlmm/pools`);
  const pools = Array.isArray(data) ? data : data?.data ?? data?.pools ?? [];
  return pools.filter((p: any) => (p.tvlUsd ?? 0) >= MIN_TVL_USD);
}

async function findPool(query: string, pools: AppPool[]): Promise<AppPool | null> {
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

async function fetchCurrentBlockHeight(): Promise<number> {
  const info = await fetchJson(`${HIRO_API}/v2/info`);
  return info.stacks_tip_height ?? 180000;
}

async function fetchLiquidityEvents(
  poolId: number,
  fromBlock: number,
  toBlock: number,
  token0PriceUsd: number,
  token1PriceUsd: number,
  token0Decimals: number,
  token1Decimals: number
): Promise<LiquidityEvent[]> {
  const events: LiquidityEvent[] = [];

  for (const fnName of ["add-liquidity", "remove-liquidity"]) {
    const eventType = fnName === "add-liquidity" ? "add" : "remove";
    let offset = 0;
    let fetched = 0;

    while (fetched < 500) {
      const url =
        `${HIRO_API}/extended/v1/contract/${DLMM_CONTRACT_ADDR}.${DLMM_CONTRACT_NAME}` +
        `/events?limit=${MAX_EVENTS_PER_QUERY}&offset=${offset}`;

      let data: any;
      try {
        data = await fetchJson(url);
      } catch {
        break;
      }

      const results = data?.results ?? data?.events ?? [];
      if (results.length === 0) break;

      for (const evt of results) {
        const bh = evt.block_height ?? evt.blockHeight ?? 0;
        if (bh < fromBlock) continue;
        if (bh > toBlock) continue;

        const args = evt.contract_log?.value?.repr ?? evt.value?.repr ?? "";
        const fnCall = evt.function_name ?? evt.contract_call?.function_name ?? "";

        if (fnCall && !fnCall.includes(fnName) && !fnCall.includes(eventType)) continue;

        const pIdMatch = args.match(/pool-id\s*u(\d+)/);
        if (pIdMatch && parseInt(pIdMatch[1]) !== poolId) continue;

        const amtXMatch = args.match(/amount-?[xX0]\s*u(\d+)/);
        const amtYMatch = args.match(/amount-?[yY1]\s*u(\d+)/);
        const senderMatch = args.match(/sender\s+'?(S[A-Z0-9]+)/);

        const rawX = amtXMatch ? parseInt(amtXMatch[1]) : 0;
        const rawY = amtYMatch ? parseInt(amtYMatch[1]) : 0;

        const amountX = rawX / 10 ** token0Decimals;
        const amountY = rawY / 10 ** token1Decimals;
        const totalUsd = amountX * token0PriceUsd + amountY * token1PriceUsd;

        if (totalUsd < 0.01) continue;

        events.push({
          blockHeight: bh,
          type: eventType,
          amountX,
          amountY,
          totalUsd,
          sender: senderMatch?.[1] ?? "unknown",
          estimatedTimestamp: estimateTimestamp(bh),
        });
      }

      offset += MAX_EVENTS_PER_QUERY;
      fetched += results.length;
      if (results.length < MAX_EVENTS_PER_QUERY) break;
      await sleep(300);
    }
  }

  events.sort((a, b) => a.blockHeight - b.blockHeight);
  return events;
}

// ── Analysis ──────────────────────────────────────────────────────────────────

function buildHourlyBuckets(events: LiquidityEvent[]): HourBucket[] {
  const buckets: HourBucket[] = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    addCount: 0,
    removeCount: 0,
    addVolumeUsd: 0,
    removeVolumeUsd: 0,
    netFlowUsd: 0,
    avgAddSizeUsd: 0,
    avgRemoveSizeUsd: 0,
  }));

  for (const evt of events) {
    const hour = getHourOfDay(evt.estimatedTimestamp);
    const bucket = buckets[hour];
    if (evt.type === "add") {
      bucket.addCount++;
      bucket.addVolumeUsd += evt.totalUsd;
    } else {
      bucket.removeCount++;
      bucket.removeVolumeUsd += evt.totalUsd;
    }
  }

  for (const b of buckets) {
    b.netFlowUsd = b.addVolumeUsd - b.removeVolumeUsd;
    b.avgAddSizeUsd = b.addCount > 0 ? b.addVolumeUsd / b.addCount : 0;
    b.avgRemoveSizeUsd = b.removeCount > 0 ? b.removeVolumeUsd / b.removeCount : 0;
  }

  return buckets;
}

function buildDailyBuckets(events: LiquidityEvent[]): DayBucket[] {
  const buckets: DayBucket[] = DAY_NAMES.map((name, i) => ({
    day: name,
    dayIndex: i,
    addCount: 0,
    removeCount: 0,
    addVolumeUsd: 0,
    removeVolumeUsd: 0,
    netFlowUsd: 0,
  }));

  for (const evt of events) {
    const dow = getDayOfWeek(evt.estimatedTimestamp);
    const bucket = buckets[dow];
    if (evt.type === "add") {
      bucket.addCount++;
      bucket.addVolumeUsd += evt.totalUsd;
    } else {
      bucket.removeCount++;
      bucket.removeVolumeUsd += evt.totalUsd;
    }
  }

  for (const b of buckets) {
    b.netFlowUsd = b.addVolumeUsd - b.removeVolumeUsd;
  }

  return buckets;
}

function calculateTimingAdvantage(hourly: HourBucket[]): number {
  const volumes = hourly.map((h) => h.addVolumeUsd + h.removeVolumeUsd);
  const total = volumes.reduce((s, v) => s + v, 0);
  if (total === 0) return 0;

  const mean = total / 24;
  const variance = volumes.reduce((s, v) => s + (v - mean) ** 2, 0) / 24;
  const cv = Math.sqrt(variance) / (mean || 1);

  return Math.min(cv / 2, 1);
}

function identifyOptimalWindows(
  hourly: HourBucket[],
  daily: DayBucket[]
): TimingWindow[] {
  const windows: TimingWindow[] = [];

  const avgAddVol = hourly.reduce((s, h) => s + h.addVolumeUsd, 0) / 24;
  const avgRemVol = hourly.reduce((s, h) => s + h.removeVolumeUsd, 0) / 24;

  // Find quiet hours for entry (low competition from other depositors)
  const quietEntryHours = hourly
    .filter((h) => h.addVolumeUsd < avgAddVol * 0.5 && h.removeVolumeUsd < avgRemVol * 1.5)
    .map((h) => h.hour)
    .sort((a, b) => a - b);

  if (quietEntryHours.length > 0) {
    const ranges = consolidateHours(quietEntryHours);
    for (const [start, end] of ranges) {
      windows.push({
        type: "entry",
        startHour: start,
        endHour: end,
        reason: "Low deposit competition — fewer LPs adding during this window",
        confidence: quietEntryHours.length >= 4 ? "HIGH" : "MEDIUM",
      });
    }
  }

  // Find peak remove hours for exit (high liquidity removal = price impact cover)
  const peakRemoveHours = hourly
    .filter((h) => h.removeVolumeUsd > avgRemVol * 1.5)
    .map((h) => h.hour)
    .sort((a, b) => a - b);

  if (peakRemoveHours.length > 0) {
    const ranges = consolidateHours(peakRemoveHours);
    for (const [start, end] of ranges) {
      windows.push({
        type: "exit",
        startHour: start,
        endHour: end,
        reason: "High removal activity — exits blend with crowd, lower relative impact",
        confidence: peakRemoveHours.length >= 3 ? "HIGH" : "MEDIUM",
      });
    }
  }

  // Net-positive inflow hours for entry confirmation
  const inflowHours = hourly
    .filter((h) => h.netFlowUsd > 0 && h.addCount >= 2)
    .map((h) => h.hour)
    .sort((a, b) => a - b);

  if (inflowHours.length > 0 && inflowHours.length <= 12) {
    const ranges = consolidateHours(inflowHours);
    for (const [start, end] of ranges) {
      windows.push({
        type: "entry",
        startHour: start,
        endHour: end,
        reason: "Net positive inflow — pool growing during these hours",
        confidence: "MEDIUM",
      });
    }
  }

  return windows;
}

function consolidateHours(hours: number[]): [number, number][] {
  if (hours.length === 0) return [];
  const ranges: [number, number][] = [];
  let start = hours[0];
  let prev = hours[0];

  for (let i = 1; i < hours.length; i++) {
    if (hours[i] === prev + 1) {
      prev = hours[i];
    } else {
      ranges.push([start, prev]);
      start = hours[i];
      prev = hours[i];
    }
  }
  ranges.push([start, prev]);
  return ranges;
}

function generateVerdict(analysis: ClockAnalysis): string {
  const { timingAdvantageScore, totalEvents, peakAddHour, troughAddHour, busiestDay, quietestDay } = analysis;

  if (totalEvents < 10) {
    return "INSUFFICIENT DATA — Too few liquidity events to establish reliable timing patterns. Pool may be too new or illiquid.";
  }

  if (timingAdvantageScore < 0.15) {
    return `FLAT DISTRIBUTION — Liquidity activity is evenly spread. Timing matters little — enter/exit at convenience. Busiest day: ${busiestDay}.`;
  }

  if (timingAdvantageScore < 0.4) {
    return `MILD PATTERN — Some clustering around ${peakAddHour}:00 UTC for deposits. Consider ${troughAddHour}:00 UTC for quieter entries. ${busiestDay}s see most activity.`;
  }

  return `STRONG PATTERN — Clear timing clusters. Peak deposits at ${peakAddHour}:00 UTC, quiet window at ${troughAddHour}:00 UTC. ${quietestDay}s are quietest. Timing advantage: ${fmtPct(timingAdvantageScore)}.`;
}

// ── Output Formatting ─────────────────────────────────────────────────────────

function printAnalysis(a: ClockAnalysis): void {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║           HODLMM LIQUIDITY CLOCK — TIME ANALYSIS           ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  console.log(`  Pool:            ${a.pair}`);
  console.log(`  TVL:             ${fmtUsd(a.tvlUsd)}`);
  console.log(`  Lookback:        ${a.lookbackDays} days`);
  console.log(`  Total Events:    ${a.totalEvents} (${a.totalAddCount} adds, ${a.totalRemoveCount} removes)`);
  console.log(`  Add Volume:      ${fmtUsd(a.totalAddVolumeUsd)}`);
  console.log(`  Remove Volume:   ${fmtUsd(a.totalRemoveVolumeUsd)}`);
  console.log(`  Timing Score:    ${fmtPct(a.timingAdvantageScore)} (higher = more patterned)`);

  // Hourly heatmap
  console.log("\n┌─────────────────────────────────────────────────────────────┐");
  console.log("│  HOURLY LIQUIDITY HEATMAP (UTC)                            │");
  console.log("├────┬────────────────────────┬───────────┬───────────┬───────┤");
  console.log("│ Hr │ Activity               │ Adds      │ Removes   │ Net   │");
  console.log("├────┼────────────────────────┼───────────┼───────────┼───────┤");

  const maxHourlyVol = Math.max(...a.hourlyBuckets.map((h) => h.addVolumeUsd + h.removeVolumeUsd), 1);

  for (const h of a.hourlyBuckets) {
    const totalVol = h.addVolumeUsd + h.removeVolumeUsd;
    const bar = barChart(totalVol, maxHourlyVol, 20);
    const net = h.netFlowUsd >= 0 ? `+${fmtUsd(h.netFlowUsd)}` : `-${fmtUsd(Math.abs(h.netFlowUsd))}`;
    const marker =
      h.hour === a.peakAddHour ? " ◄PEAK" :
      h.hour === a.troughAddHour ? " ◄QUIET" : "";
    console.log(
      `│ ${String(h.hour).padStart(2)} │ ${bar} │ ${String(h.addCount).padStart(4)}/${fmtUsd(h.addVolumeUsd).padStart(8)} │ ${String(h.removeCount).padStart(4)}/${fmtUsd(h.removeVolumeUsd).padStart(8)} │ ${net.padStart(5)} │${marker}`
    );
  }

  console.log("└────┴────────────────────────┴───────────┴───────────┴───────┘");

  // Day-of-week breakdown
  console.log("\n┌─────────────────────────────────────────────────────────────┐");
  console.log("│  DAY-OF-WEEK PATTERN                                       │");
  console.log("├─────┬────────────────────────┬───────────┬─────────┬────────┤");
  console.log("│ Day │ Activity               │ Adds      │ Removes │ Net    │");
  console.log("├─────┼────────────────────────┼───────────┼─────────┼────────┤");

  const maxDailyVol = Math.max(...a.dailyBuckets.map((d) => d.addVolumeUsd + d.removeVolumeUsd), 1);

  for (const d of a.dailyBuckets) {
    const totalVol = d.addVolumeUsd + d.removeVolumeUsd;
    const bar = barChart(totalVol, maxDailyVol, 20);
    const net = d.netFlowUsd >= 0 ? `+${fmtUsd(d.netFlowUsd)}` : `-${fmtUsd(Math.abs(d.netFlowUsd))}`;
    const marker = d.day === a.busiestDay ? " ◄BUSY" : d.day === a.quietestDay ? " ◄QUIET" : "";
    console.log(
      `│ ${d.day} │ ${bar} │ ${String(d.addCount).padStart(4)}/${fmtUsd(d.addVolumeUsd).padStart(8)} │ ${String(d.removeCount).padStart(4)}/${fmtUsd(d.removeVolumeUsd).padStart(6)} │ ${net.padStart(6)} │${marker}`
    );
  }

  console.log("└─────┴────────────────────────┴───────────┴─────────┴────────┘");

  // Optimal windows
  if (a.optimalWindows.length > 0) {
    console.log("\n┌─────────────────────────────────────────────────────────────┐");
    console.log("│  OPTIMAL TIMING WINDOWS                                    │");
    console.log("├────────┬────────────────┬──────┬──────────────────────────────┤");

    for (const w of a.optimalWindows) {
      const timeRange = `${String(w.startHour).padStart(2, "0")}:00-${String(w.endHour).padStart(2, "0")}:59 UTC`;
      console.log(`│ ${w.type.toUpperCase().padEnd(6)} │ ${timeRange.padEnd(14)} │ ${w.confidence.padEnd(4)} │ ${w.reason.slice(0, 28).padEnd(28)} │`);
    }

    console.log("└────────┴────────────────┴──────┴──────────────────────────────┘");
  }

  // Verdict
  console.log("\n┌─────────────────────────────────────────────────────────────┐");
  console.log("│  VERDICT                                                    │");
  console.log("├─────────────────────────────────────────────────────────────┤");

  const lines = a.verdict.match(/.{1,59}/g) ?? [a.verdict];
  for (const line of lines) {
    console.log(`│  ${line.padEnd(57)} │`);
  }

  console.log("└─────────────────────────────────────────────────────────────┘\n");
}

function printJson(a: ClockAnalysis): void {
  console.log(JSON.stringify(a, null, 2));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function analyze(poolQuery: string, days: number, json: boolean): Promise<void> {
  console.log(`\nFetching HODLMM pools…`);
  const pools = await fetchPools();
  if (pools.length === 0) {
    console.error("No pools found above minimum TVL threshold.");
    process.exit(1);
  }

  const pool = await findPool(poolQuery, pools);
  if (!pool) {
    console.error(`Pool "${poolQuery}" not found. Available pools:`);
    for (const p of pools.slice(0, 10)) {
      console.error(`  ${p.token0Symbol}-${p.token1Symbol} (TVL: ${fmtUsd(p.tvlUsd)})`);
    }
    process.exit(1);
  }

  const pair = `${pool.token0Symbol}-${pool.token1Symbol}`;
  const poolId = pool.poolId ?? parseInt(pool.id) ?? 0;
  console.log(`Analyzing ${pair} (TVL: ${fmtUsd(pool.tvlUsd)})…`);

  const currentBlock = await fetchCurrentBlockHeight();
  const fromBlock = currentBlock - days * BLOCKS_PER_DAY;

  console.log(`Scanning ${days} days of liquidity events (blocks ${fromBlock}–${currentBlock})…`);

  const events = await fetchLiquidityEvents(
    poolId,
    fromBlock,
    currentBlock,
    pool.token0PriceUsd ?? FALLBACK_STX_PRICE_USD,
    pool.token1PriceUsd ?? FALLBACK_STX_PRICE_USD,
    pool.token0Decimals ?? 6,
    pool.token1Decimals ?? 6
  );

  console.log(`Found ${events.length} liquidity events.`);

  const hourlyBuckets = buildHourlyBuckets(events);
  const dailyBuckets = buildDailyBuckets(events);
  const timingAdvantageScore = calculateTimingAdvantage(hourlyBuckets);

  const addEvents = events.filter((e) => e.type === "add");
  const removeEvents = events.filter((e) => e.type === "remove");

  const peakAddHour = hourlyBuckets.reduce((best, h) => (h.addVolumeUsd > best.addVolumeUsd ? h : best)).hour;
  const troughAddHour = hourlyBuckets.reduce((best, h) => (h.addVolumeUsd < best.addVolumeUsd ? h : best)).hour;
  const peakRemoveHour = hourlyBuckets.reduce((best, h) => (h.removeVolumeUsd > best.removeVolumeUsd ? h : best)).hour;
  const troughRemoveHour = hourlyBuckets.reduce((best, h) => (h.removeVolumeUsd < best.removeVolumeUsd ? h : best)).hour;

  const busiestDay = dailyBuckets.reduce((best, d) =>
    d.addVolumeUsd + d.removeVolumeUsd > best.addVolumeUsd + best.removeVolumeUsd ? d : best
  ).day;
  const quietestDay = dailyBuckets.reduce((best, d) =>
    d.addVolumeUsd + d.removeVolumeUsd < best.addVolumeUsd + best.removeVolumeUsd ? d : best
  ).day;

  const optimalWindows = identifyOptimalWindows(hourlyBuckets, dailyBuckets);

  const analysis: ClockAnalysis = {
    pool: pool.id,
    pair,
    tvlUsd: pool.tvlUsd,
    lookbackDays: days,
    totalEvents: events.length,
    totalAddCount: addEvents.length,
    totalRemoveCount: removeEvents.length,
    totalAddVolumeUsd: addEvents.reduce((s, e) => s + e.totalUsd, 0),
    totalRemoveVolumeUsd: removeEvents.reduce((s, e) => s + e.totalUsd, 0),
    hourlyBuckets,
    dailyBuckets,
    peakAddHour,
    troughAddHour,
    peakRemoveHour,
    troughRemoveHour,
    busiestDay,
    quietestDay,
    timingAdvantageScore,
    optimalWindows,
    verdict: "",
  };

  analysis.verdict = generateVerdict(analysis);

  if (json) {
    printJson(analysis);
  } else {
    printAnalysis(analysis);
  }
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-liquidity-clock")
  .description(
    "Analyze time-of-day and day-of-week liquidity patterns in HODLMM pools. " +
    "Identifies optimal timing windows for LP entry/exit based on historical " +
    "deposit and withdrawal activity."
  )
  .argument("<pool>", "Pool ID or token pair (e.g. STX-sBTC)")
  .option("-d, --days <n>", "Lookback period in days", String(DEFAULT_LOOKBACK_DAYS))
  .option("--json", "Output raw JSON instead of formatted tables", false)
  .action(async (pool: string, opts: any) => {
    const days = parseInt(opts.days) || DEFAULT_LOOKBACK_DAYS;
    await analyze(pool, days, opts.json);
  });

program.parse();
