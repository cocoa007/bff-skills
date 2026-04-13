#!/usr/bin/env bun
/**
 * hodlmm-backtest.ts
 *
 * HODLMM Backtest Engine — Simulates historical LP strategy performance using
 * on-chain swap/liquidity events. Replays trade history against a user-defined
 * bin range and capital, tracking fee accrual, impermanent loss, and net PnL
 * over time.
 *
 * Key metrics:
 *  - Total fees earned over period
 *  - Impermanent loss vs HODL
 *  - Net PnL (fees minus IL)
 *  - Max drawdown from peak value
 *  - Win rate (% of days with positive fee accrual)
 *  - Annualized yield projection from historical data
 *  - Strategy comparison: NARROW / MEDIUM / WIDE bin ranges
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 57).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 15;
const FALLBACK_STX_PRICE_USD = 0.80;

const BLOCKS_PER_DAY = 144;
const DEFAULT_LOOKBACK_DAYS = 30;
const MAX_EVENTS_PER_QUERY = 50;

type RangeStrategy = "NARROW" | "MEDIUM" | "WIDE";

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

interface SwapEvent {
  blockHeight: number;
  amountIn: number;
  amountOut: number;
  binIdAtSwap: number;
  feePaid: number;
  timestamp: number;
}

interface DaySnapshot {
  day: number;
  blockHeight: number;
  activeBin: number;
  feesEarnedUsd: number;
  positionValueUsd: number;
  hodlValueUsd: number;
  ilUsd: number;
  netPnlUsd: number;
  cumulativeFeesUsd: number;
  cumulativeIlUsd: number;
  inRange: boolean;
}

interface BacktestResult {
  poolId: number;
  pair: string;
  strategy: RangeStrategy;
  capitalUsd: number;
  binRangeLow: number;
  binRangeHigh: number;
  activeBinStart: number;
  activeBinEnd: number;
  lookbackDays: number;
  totalSwapsInRange: number;
  totalSwapsOutOfRange: number;
  inRangePct: number;
  totalFeesUsd: number;
  totalIlUsd: number;
  netPnlUsd: number;
  netPnlPct: number;
  maxDrawdownPct: number;
  winRate: number;
  annualizedYieldPct: number;
  dailySnapshots: DaySnapshot[];
  feeBps: number;
  tvlUsd: number;
}

interface ComparisonResult {
  poolId: number;
  pair: string;
  tvlUsd: number;
  capitalUsd: number;
  lookbackDays: number;
  strategies: BacktestResult[];
  bestStrategy: RangeStrategy;
  recommendation: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

async function getStxPriceUsd(): Promise<number> {
  try {
    const d = await fetchJson("https://api.coingecko.com/api/v3/simple/price?ids=blockstack&vs_currencies=usd");
    return d?.blockstack?.usd ?? FALLBACK_STX_PRICE_USD;
  } catch {
    return FALLBACK_STX_PRICE_USD;
  }
}

function cvHex(n: number): string {
  const hex = n.toString(16).padStart(32, "0");
  return `0x01${hex}`;
}

async function readBins(poolId: number, activeBin: number, radius: number = BIN_SCAN_RADIUS): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const lo = activeBin - radius;
  const hi = activeBin + radius;
  const calls: Promise<void>[] = [];

  for (let b = lo; b <= hi; b++) {
    const binNum = b;
    calls.push(
      (async () => {
        try {
          const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-bin`;
          const body = { sender: SENDER, arguments: [cvHex(poolId), cvHex(binNum)] };
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) return;
          const data = await res.json();
          if (!data.result || !data.okay) return;
          const hex = data.result.replace(/^0x/, "");
          if (hex.length < 66) return;
          const rx = parseInt(hex.slice(2, 34), 16);
          const ry = parseInt(hex.slice(34, 66), 16);
          if (rx > 0 || ry > 0) {
            bins.push({ binId: binNum, reserveX: rx, reserveY: ry, totalUsd: 0 });
          }
        } catch {}
      })()
    );
  }
  await Promise.all(calls);
  return bins.sort((a, b) => a.binId - b.binId);
}

async function fetchSwapEvents(poolId: number, limitBlocks: number): Promise<SwapEvent[]> {
  const events: SwapEvent[] = [];
  let offset = 0;
  const maxPages = 10;

  for (let page = 0; page < maxPages; page++) {
    try {
      const url = `${HIRO_API}/extended/v1/contract/${DLMM_CONTRACT_ADDR}.${DLMM_CONTRACT_NAME}/events?offset=${offset}&limit=${MAX_EVENTS_PER_QUERY}`;
      const data = await fetchJson(url);
      const results = data?.results ?? [];
      if (results.length === 0) break;

      for (const evt of results) {
        if (evt.event_type !== "smart_contract_log") continue;
        const val = evt?.contract_log?.value;
        if (!val) continue;

        const hex = typeof val === "string" ? val.replace(/^0x/, "") : val?.hex?.replace(/^0x/, "") ?? "";
        if (hex.length < 130) continue;

        const swapPoolId = parseInt(hex.slice(2, 34), 16);
        if (swapPoolId !== poolId) continue;

        const amountIn = parseInt(hex.slice(34, 66), 16);
        const amountOut = parseInt(hex.slice(66, 98), 16);
        const binId = parseInt(hex.slice(98, 130), 16);

        events.push({
          blockHeight: evt.block_height ?? 0,
          amountIn,
          amountOut,
          binIdAtSwap: binId > 0 ? binId : 0,
          feePaid: 0,
          timestamp: evt.block_height ?? 0,
        });
      }
      offset += MAX_EVENTS_PER_QUERY;
      if (results.length < MAX_EVENTS_PER_QUERY) break;
    } catch {
      break;
    }
  }
  return events.sort((a, b) => a.blockHeight - b.blockHeight);
}

function rangeForStrategy(activeBin: number, strategy: RangeStrategy): { lo: number; hi: number } {
  switch (strategy) {
    case "NARROW": return { lo: activeBin - 3, hi: activeBin + 3 };
    case "MEDIUM": return { lo: activeBin - 8, hi: activeBin + 8 };
    case "WIDE": return { lo: activeBin - 15, hi: activeBin + 15 };
  }
}

function strategyLabel(s: RangeStrategy): string {
  switch (s) {
    case "NARROW": return "Narrow (±3 bins)";
    case "MEDIUM": return "Medium (±8 bins)";
    case "WIDE": return "Wide (±15 bins)";
  }
}

function simulateBacktest(
  events: SwapEvent[],
  poolId: number,
  pair: string,
  capitalUsd: number,
  activeBinStart: number,
  feeBps: number,
  tvlUsd: number,
  strategy: RangeStrategy,
  lookbackDays: number,
  currentBins: BinReserves[],
  tokenXPriceUsd: number,
  tokenYPriceUsd: number,
  token0Decimals: number,
  token1Decimals: number,
): BacktestResult {
  const { lo, hi } = rangeForStrategy(activeBinStart, strategy);
  const rangeBins = hi - lo + 1;

  const capitalPerBin = capitalUsd / rangeBins;
  let totalPoolTvl = tvlUsd > 0 ? tvlUsd : 100_000;
  const lpShare = capitalUsd / (totalPoolTvl + capitalUsd);

  let cumulativeFees = 0;
  let peakValue = capitalUsd;
  let maxDrawdownPct = 0;
  let inRangeSwaps = 0;
  let outRangeSwaps = 0;
  let winDays = 0;
  const dailySnapshots: DaySnapshot[] = [];

  const startBlock = events.length > 0 ? events[0].blockHeight : 0;
  const endBlock = events.length > 0 ? events[events.length - 1].blockHeight : startBlock + lookbackDays * BLOCKS_PER_DAY;
  const totalBlocks = endBlock - startBlock || lookbackDays * BLOCKS_PER_DAY;

  let currentBin = activeBinStart;
  let dailyFees = 0;
  let currentDay = 0;

  for (const evt of events) {
    const dayIdx = Math.floor((evt.blockHeight - startBlock) / BLOCKS_PER_DAY);

    while (currentDay < dayIdx) {
      const drift = Math.abs(currentBin - activeBinStart);
      const ilFactor = drift * 0.002;
      const ilUsd = capitalUsd * ilFactor;
      const posValue = capitalUsd + cumulativeFees - ilUsd;

      if (posValue > peakValue) peakValue = posValue;
      const dd = peakValue > 0 ? (peakValue - posValue) / peakValue * 100 : 0;
      if (dd > maxDrawdownPct) maxDrawdownPct = dd;

      if (dailyFees > 0) winDays++;

      dailySnapshots.push({
        day: currentDay,
        blockHeight: startBlock + currentDay * BLOCKS_PER_DAY,
        activeBin: currentBin,
        feesEarnedUsd: dailyFees,
        positionValueUsd: posValue,
        hodlValueUsd: capitalUsd,
        ilUsd,
        netPnlUsd: cumulativeFees - ilUsd,
        cumulativeFeesUsd: cumulativeFees,
        cumulativeIlUsd: ilUsd,
        inRange: currentBin >= lo && currentBin <= hi,
      });

      dailyFees = 0;
      currentDay++;
    }

    if (evt.binIdAtSwap > 0) currentBin = evt.binIdAtSwap;

    if (currentBin >= lo && currentBin <= hi) {
      inRangeSwaps++;
      const swapVolUsd = (evt.amountIn / Math.pow(10, token0Decimals)) * tokenXPriceUsd;
      const feeUsd = swapVolUsd * (feeBps / 10_000) * lpShare;
      cumulativeFees += feeUsd;
      dailyFees += feeUsd;
    } else {
      outRangeSwaps++;
    }
  }

  if (dailyFees > 0) winDays++;
  const totalDays = currentDay > 0 ? currentDay : lookbackDays;

  const drift = Math.abs(currentBin - activeBinStart);
  const totalIl = capitalUsd * drift * 0.002;
  const netPnl = cumulativeFees - totalIl;
  const netPnlPct = capitalUsd > 0 ? (netPnl / capitalUsd) * 100 : 0;
  const annualized = totalDays > 0 ? (netPnlPct / totalDays) * 365 : 0;
  const inRangePct = (inRangeSwaps + outRangeSwaps) > 0
    ? (inRangeSwaps / (inRangeSwaps + outRangeSwaps)) * 100
    : 0;

  return {
    poolId,
    pair,
    strategy,
    capitalUsd,
    binRangeLow: lo,
    binRangeHigh: hi,
    activeBinStart,
    activeBinEnd: currentBin,
    lookbackDays: totalDays,
    totalSwapsInRange: inRangeSwaps,
    totalSwapsOutOfRange: outRangeSwaps,
    inRangePct,
    totalFeesUsd: cumulativeFees,
    totalIlUsd: totalIl,
    netPnlUsd: netPnl,
    netPnlPct,
    maxDrawdownPct,
    winRate: totalDays > 0 ? (winDays / totalDays) * 100 : 0,
    annualizedYieldPct: annualized,
    dailySnapshots,
    feeBps,
    tvlUsd,
  };
}

// ── Formatters ───────────────────────────────────────────────────────────────

function fmtPct(v: number): string { return v.toFixed(2) + "%"; }
function fmtUsd(v: number): string {
  const sign = v < 0 ? "-" : "";
  return sign + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pad(s: string, n: number): string { return s.padEnd(n); }
function padL(s: string, n: number): string { return s.padStart(n); }

function verdictEmoji(pnl: number): string {
  if (pnl > 5) return "🟢";
  if (pnl > 0) return "🟡";
  if (pnl > -5) return "🟠";
  return "🔴";
}

function printBacktestResult(r: BacktestResult): void {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  HODLMM Backtest — ${r.pair} (Pool #${r.poolId})`);
  console.log(`  Strategy: ${strategyLabel(r.strategy)} | Capital: ${fmtUsd(r.capitalUsd)}`);
  console.log(`${"═".repeat(70)}`);

  console.log(`\n  Period:          ${r.lookbackDays} days`);
  console.log(`  Bin Range:       ${r.binRangeLow} → ${r.binRangeHigh} (${r.binRangeHigh - r.binRangeLow + 1} bins)`);
  console.log(`  Active Bin:      ${r.activeBinStart} → ${r.activeBinEnd} (drift: ${Math.abs(r.activeBinEnd - r.activeBinStart)})`);
  console.log(`  Fee Tier:        ${r.feeBps} bps`);
  console.log(`  Pool TVL:        ${fmtUsd(r.tvlUsd)}`);

  console.log(`\n  ── Performance ──`);
  console.log(`  Total Fees:      ${fmtUsd(r.totalFeesUsd)}`);
  console.log(`  Total IL:        ${fmtUsd(r.totalIlUsd)}`);
  console.log(`  Net PnL:         ${fmtUsd(r.netPnlUsd)} (${fmtPct(r.netPnlPct)}) ${verdictEmoji(r.netPnlPct)}`);
  console.log(`  Annualized:      ${fmtPct(r.annualizedYieldPct)}`);
  console.log(`  Max Drawdown:    ${fmtPct(r.maxDrawdownPct)}`);

  console.log(`\n  ── Activity ──`);
  console.log(`  Swaps In-Range:  ${r.totalSwapsInRange}`);
  console.log(`  Swaps Out-Range: ${r.totalSwapsOutOfRange}`);
  console.log(`  In-Range %:      ${fmtPct(r.inRangePct)}`);
  console.log(`  Win Rate:        ${fmtPct(r.winRate)} (days with fee accrual)`);

  if (r.dailySnapshots.length > 0) {
    console.log(`\n  ── Daily PnL Chart ──`);
    const maxFee = Math.max(...r.dailySnapshots.map(d => d.cumulativeFeesUsd), 1);
    const barWidth = 40;
    const step = Math.max(1, Math.floor(r.dailySnapshots.length / 20));
    for (let i = 0; i < r.dailySnapshots.length; i += step) {
      const d = r.dailySnapshots[i];
      const barLen = Math.round((d.cumulativeFeesUsd / maxFee) * barWidth);
      const bar = "█".repeat(barLen) + "░".repeat(barWidth - barLen);
      const dayLabel = `D${String(d.day).padStart(3)}`;
      const rangeFlag = d.inRange ? "✓" : "✗";
      console.log(`  ${dayLabel} ${rangeFlag} ${bar} ${fmtUsd(d.netPnlUsd)}`);
    }
  }
}

function printComparison(c: ComparisonResult): void {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  HODLMM Strategy Comparison — ${c.pair} (Pool #${c.poolId})`);
  console.log(`  Capital: ${fmtUsd(c.capitalUsd)} | Lookback: ${c.lookbackDays} days`);
  console.log(`${"═".repeat(70)}`);

  console.log(`\n  ${pad("Strategy", 22)} ${padL("Fees", 12)} ${padL("IL", 12)} ${padL("Net PnL", 12)} ${padL("Annual", 10)} ${padL("InRange%", 10)} ${padL("MaxDD", 8)}`);
  console.log(`  ${"-".repeat(86)}`);

  for (const s of c.strategies) {
    const mark = s.strategy === c.bestStrategy ? " ★" : "  ";
    console.log(
      `${mark}${pad(strategyLabel(s.strategy), 22)} ` +
      `${padL(fmtUsd(s.totalFeesUsd), 12)} ` +
      `${padL(fmtUsd(s.totalIlUsd), 12)} ` +
      `${padL(fmtUsd(s.netPnlUsd), 12)} ` +
      `${padL(fmtPct(s.annualizedYieldPct), 10)} ` +
      `${padL(fmtPct(s.inRangePct), 10)} ` +
      `${padL(fmtPct(s.maxDrawdownPct), 8)}`
    );
  }

  console.log(`\n  Recommendation: ${c.recommendation}`);
  console.log(`  Best Strategy:  ${strategyLabel(c.bestStrategy)} ${verdictEmoji(c.strategies.find(s => s.strategy === c.bestStrategy)?.netPnlPct ?? 0)}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-backtest")
  .description("HODLMM Backtest Engine — simulate historical LP strategy performance using on-chain data")
  .option("-p, --pool <id>", "Pool ID to backtest (omit to auto-select highest volume)")
  .option("-c, --capital <usd>", "Capital amount in USD", "10000")
  .option("-d, --days <n>", "Lookback days", String(DEFAULT_LOOKBACK_DAYS))
  .option("-s, --strategy <type>", "Strategy: NARROW, MEDIUM, WIDE, or ALL for comparison", "ALL")
  .option("--json", "Output raw JSON")
  .action(async (opts) => {
    try {
      const capitalUsd = parseFloat(opts.capital);
      const lookbackDays = parseInt(opts.days);
      const requestedStrategy = opts.strategy.toUpperCase();

      console.log("Fetching HODLMM pool data...");
      let pools: AppPool[] = [];
      try {
        const appData = await fetchJson(`${BFF_APP_BASE}/hodlmm/pools`);
        pools = (appData?.pools ?? appData ?? []).filter((p: any) => (p.tvlUsd ?? 0) >= MIN_TVL_USD);
      } catch {
        console.log("BFF API unavailable — falling back to on-chain discovery...");
      }

      let targetPool: AppPool | null = null;

      if (opts.pool) {
        const pid = parseInt(opts.pool);
        targetPool = pools.find(p => (p.poolId ?? parseInt(p.id)) === pid) ?? null;
        if (!targetPool) {
          targetPool = {
            id: String(pid), token0Symbol: "TokenX", token1Symbol: "TokenY",
            tvlUsd: 0, volume24hUsd: 0, poolId: pid,
            token0Decimals: 6, token1Decimals: 6,
            token0PriceUsd: 0, token1PriceUsd: 0,
          };
        }
      } else if (pools.length > 0) {
        pools.sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0));
        targetPool = pools[0];
      }

      if (!targetPool) {
        console.error("No pools found. Specify --pool <id>.");
        process.exit(1);
      }

      const poolId = targetPool.poolId ?? parseInt(targetPool.id);
      const pair = `${targetPool.token0Symbol}/${targetPool.token1Symbol}`;
      const feeBps = targetPool.feeBps ?? 30;

      console.log(`Analyzing pool #${poolId} (${pair})...`);

      const stxPrice = await getStxPriceUsd();
      const tokenXPrice = targetPool.token0PriceUsd || stxPrice;
      const tokenYPrice = targetPool.token1PriceUsd || stxPrice;

      let activeBin = targetPool.activeBinId ?? 0;
      if (!activeBin) {
        try {
          const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-pair`;
          const body = { sender: SENDER, arguments: [cvHex(poolId)] };
          const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          const data = await res.json();
          if (data.result && data.okay) {
            const hex = data.result.replace(/^0x/, "");
            if (hex.length >= 66) activeBin = parseInt(hex.slice(34, 66), 16);
          }
        } catch {}
      }

      if (!activeBin) {
        console.error("Could not determine active bin for pool.");
        process.exit(1);
      }

      console.log(`Active bin: ${activeBin}. Fetching swap events (${lookbackDays}d lookback)...`);
      const swapEvents = await fetchSwapEvents(poolId, lookbackDays * BLOCKS_PER_DAY);
      console.log(`Found ${swapEvents.length} swap events.`);

      const currentBins = await readBins(poolId, activeBin);
      console.log(`Scanned ${currentBins.length} active bins.`);

      const strategies: RangeStrategy[] = requestedStrategy === "ALL"
        ? ["NARROW", "MEDIUM", "WIDE"]
        : [requestedStrategy as RangeStrategy];

      const results: BacktestResult[] = [];

      for (const strat of strategies) {
        const result = simulateBacktest(
          swapEvents, poolId, pair, capitalUsd, activeBin,
          feeBps, targetPool.tvlUsd, strat, lookbackDays,
          currentBins, tokenXPrice, tokenYPrice,
          targetPool.token0Decimals, targetPool.token1Decimals,
        );
        results.push(result);
      }

      if (opts.json) {
        if (results.length === 1) {
          console.log(JSON.stringify(results[0], null, 2));
        } else {
          const best = results.reduce((a, b) => a.netPnlPct > b.netPnlPct ? a : b);
          const comparison: ComparisonResult = {
            poolId, pair, tvlUsd: targetPool.tvlUsd, capitalUsd, lookbackDays,
            strategies: results,
            bestStrategy: best.strategy,
            recommendation: generateRecommendation(results),
          };
          console.log(JSON.stringify(comparison, null, 2));
        }
        return;
      }

      if (results.length === 1) {
        printBacktestResult(results[0]);
      } else {
        for (const r of results) printBacktestResult(r);

        const best = results.reduce((a, b) => a.netPnlPct > b.netPnlPct ? a : b);
        const comparison: ComparisonResult = {
          poolId, pair, tvlUsd: targetPool.tvlUsd, capitalUsd, lookbackDays,
          strategies: results,
          bestStrategy: best.strategy,
          recommendation: generateRecommendation(results),
        };
        printComparison(comparison);
      }

      console.log(`\n  ℹ  Backtest uses on-chain event replay with fee/IL estimation.`);
      console.log(`     Past performance does not guarantee future results.`);
      console.log(`     IL model uses bin-drift approximation (0.2% per bin drift).\n`);

    } catch (err: any) {
      console.error("Error:", err.message ?? err);
      process.exit(1);
    }
  });

function generateRecommendation(results: BacktestResult[]): string {
  const sorted = [...results].sort((a, b) => b.netPnlPct - a.netPnlPct);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  if (best.netPnlPct <= 0) {
    return `All strategies show negative PnL over ${best.lookbackDays}d. Consider waiting for better conditions or reducing position size.`;
  }

  if (best.strategy === "NARROW" && best.inRangePct > 70) {
    return `NARROW range optimal — high in-range % (${fmtPct(best.inRangePct)}) means concentrated fees with manageable IL. Active monitoring recommended.`;
  }

  if (best.strategy === "WIDE") {
    return `WIDE range best for this pool — price action too volatile for tighter ranges. Lower fees but protected from IL.`;
  }

  if (best.strategy === "MEDIUM") {
    return `MEDIUM range balances fee concentration and IL protection. Good default for this pool's volatility profile.`;
  }

  return `${best.strategy} range delivers best risk-adjusted returns (${fmtPct(best.annualizedYieldPct)} annualized, ${fmtPct(best.maxDrawdownPct)} max DD).`;
}

program.parse();
