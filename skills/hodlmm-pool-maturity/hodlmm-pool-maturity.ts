#!/usr/bin/env bun
/**
 * hodlmm-pool-maturity.ts
 *
 * HODLMM Pool Maturity Analyzer — Evaluates pool establishment level by
 * examining on-chain activity depth, liquidity stability, LP participation
 * patterns, and bin utilization consistency. Produces a maturity grade
 * (NASCENT / GROWING / ESTABLISHED / MATURE) to help LPs assess pool
 * reliability before committing capital.
 *
 * Key metrics:
 *  - Event history depth (transaction count and recency)
 *  - Liquidity provider count and concentration (HHI)
 *  - Bin utilization spread and consistency
 *  - Reserve distribution stability
 *  - TVL-to-volume ratio (organic activity indicator)
 *  - Active bin steadiness (low drift = more mature)
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 66).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 500;
const BIN_SCAN_RADIUS = 25;
const EVENT_SCAN_LIMIT = 50;

type MaturityGrade = "NASCENT" | "GROWING" | "ESTABLISHED" | "MATURE";

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

interface BinData {
  binId: number;
  reserveX: number;
  reserveY: number;
  totalUsd: number;
  pctOfTvl: number;
}

interface LpActivity {
  address: string;
  eventCount: number;
  isAdd: boolean;
}

interface MaturityAnalysis {
  pool: string;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  activeBinId: number;
  grade: MaturityGrade;
  maturityScore: number;
  dimensions: {
    activityDepth: { score: number; eventCount: number; addEvents: number; removeEvents: number; swapEvents: number; uniqueAddresses: number };
    liquidityStability: { score: number; binsWithLiquidity: number; totalBinsScanned: number; utilizationPct: number; concentrationCoeff: number; topBinPct: number; top5BinPct: number };
    lpDiversity: { score: number; uniqueLps: number; hhi: number; topLpPct: number; avgEventsPerLp: number };
    volumeOrganicity: { score: number; volumeToTvlRatio: number; dailyTurnover: string; classification: string };
    binSteadiness: { score: number; activeBinDrift: number; activeBinsObserved: number; binCorridor: number };
  };
  riskFlags: string[];
  recommendation: string;
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

function gradeIcon(g: MaturityGrade): string {
  switch (g) {
    case "NASCENT": return "🌱";
    case "GROWING": return "🌿";
    case "ESTABLISHED": return "🌳";
    case "MATURE": return "🏛️";
  }
}

function gradeColor(g: MaturityGrade): string {
  switch (g) {
    case "NASCENT": return "🔴";
    case "GROWING": return "🟡";
    case "ESTABLISHED": return "🟢";
    case "MATURE": return "💎";
  }
}

function scoreIcon(score: number): string {
  if (score >= 80) return "🟢";
  if (score >= 60) return "🟡";
  if (score >= 40) return "🟠";
  return "🔴";
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

async function fetchBinReserves(
  poolId: number,
  activeBinId: number,
  radius: number = BIN_SCAN_RADIUS,
): Promise<BinData[]> {
  const bins: BinData[] = [];
  const startBin = activeBinId - radius;
  const endBin = activeBinId + radius;

  const batchSize = 10;
  for (let i = startBin; i <= endBin; i += batchSize) {
    const batchEnd = Math.min(i + batchSize - 1, endBin);
    const promises: Promise<any>[] = [];

    for (let binId = i; binId <= batchEnd; binId++) {
      const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-bin`;
      promises.push(
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: SENDER,
            arguments: [
              `0x0100000000000000000000000000000${poolId.toString(16).padStart(4, "0")}`,
              `0x0100000000000000000000000000${binId.toString(16).padStart(8, "0")}`,
            ],
          }),
        })
          .then((r) => r.json())
          .then((data) => ({ binId, data }))
          .catch(() => ({ binId, data: null }))
      );
    }

    const results = await Promise.all(promises);
    for (const { binId, data } of results) {
      if (!data?.result) continue;
      const repr = data.result;
      const rxMatch = repr.match(/reserve-x\s+u(\d+)/);
      const ryMatch = repr.match(/reserve-y\s+u(\d+)/);
      const rx = rxMatch ? parseInt(rxMatch[1]) : 0;
      const ry = ryMatch ? parseInt(ryMatch[1]) : 0;
      if (rx > 0 || ry > 0) {
        bins.push({ binId, reserveX: rx, reserveY: ry, totalUsd: 0, pctOfTvl: 0 });
      }
    }

    if (i + batchSize <= endBin) await sleep(200);
  }

  return bins;
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

// ── Analysis ──────────────────────────────────────────────────────────────────

function analyzeActivityDepth(
  events: any[],
  poolId: number,
): { score: number; eventCount: number; addEvents: number; removeEvents: number; swapEvents: number; uniqueAddresses: number } {
  const addresses = new Set<string>();
  let addEvents = 0;
  let removeEvents = 0;
  let swapEvents = 0;
  let poolEventCount = 0;

  for (const event of events) {
    if (event.event_type !== "smart_contract_log") continue;
    const repr = event?.contract_log?.value?.repr ?? "";

    const pidMatch = repr.match(/pool-id\s+u(\d+)/);
    if (pidMatch && parseInt(pidMatch[1]) !== poolId) continue;
    if (!pidMatch) continue;

    poolEventCount++;

    if (event.tx_id) addresses.add(event.tx_id.substring(0, 66));

    if (repr.includes("add-liquidity") || repr.includes("mint")) addEvents++;
    else if (repr.includes("remove-liquidity") || repr.includes("burn")) removeEvents++;
    else if (repr.includes("swap")) swapEvents++;
  }

  // Score: more events + more unique addresses = higher maturity
  let score = 0;
  score += Math.min(poolEventCount * 2, 30); // up to 30 for event count
  score += Math.min(addresses.size * 5, 25); // up to 25 for unique addresses
  score += Math.min(addEvents * 3, 20); // up to 20 for add-liquidity events
  score += Math.min(swapEvents * 2, 15); // up to 15 for swap activity
  score += removeEvents > 0 && addEvents > removeEvents ? 10 : 0; // net positive LP flow

  return {
    score: Math.min(score, 100),
    eventCount: poolEventCount,
    addEvents,
    removeEvents,
    swapEvents,
    uniqueAddresses: addresses.size,
  };
}

function analyzeLiquidityStability(
  bins: BinData[],
  pool: AppPool,
  activeBinId: number,
): { score: number; binsWithLiquidity: number; totalBinsScanned: number; utilizationPct: number; concentrationCoeff: number; topBinPct: number; top5BinPct: number } {
  const totalScanned = BIN_SCAN_RADIUS * 2 + 1;

  for (const bin of bins) {
    const rx = bin.reserveX / 10 ** pool.token0Decimals;
    const ry = bin.reserveY / 10 ** pool.token1Decimals;
    bin.totalUsd = rx * pool.token0PriceUsd + ry * pool.token1PriceUsd;
  }

  const totalUsd = bins.reduce((s, b) => s + b.totalUsd, 0);
  for (const bin of bins) {
    bin.pctOfTvl = totalUsd > 0 ? (bin.totalUsd / totalUsd) * 100 : 0;
  }

  const binsWithLiquidity = bins.filter((b) => b.totalUsd > 0).length;
  const utilizationPct = (binsWithLiquidity / totalScanned) * 100;

  // Concentration around active bin
  let concentrationMass = 0;
  for (const bin of bins) {
    const distance = Math.abs(bin.binId - activeBinId);
    if (distance <= 3) concentrationMass += bin.totalUsd;
  }
  const concentrationCoeff = totalUsd > 0 ? concentrationMass / totalUsd : 0;

  const sorted = [...bins].sort((a, b) => b.totalUsd - a.totalUsd);
  const topBinPct = sorted[0]?.pctOfTvl ?? 0;
  const top5BinPct = sorted.slice(0, 5).reduce((s, b) => s + b.pctOfTvl, 0);

  // Score: moderate concentration + good utilization = stable/mature
  let score = 0;

  // Utilization: more spread = more established (but not too sparse)
  if (utilizationPct >= 30) score += 25;
  else if (utilizationPct >= 15) score += 15;
  else score += 5;

  // Concentration: moderate is best (not too concentrated, not too dispersed)
  if (concentrationCoeff >= 0.3 && concentrationCoeff <= 0.7) score += 25;
  else if (concentrationCoeff >= 0.15) score += 15;
  else score += 5;

  // Top bin dominance: lower is more mature (less single-whale risk)
  if (topBinPct < 20) score += 25;
  else if (topBinPct < 40) score += 15;
  else score += 5;

  // Top-5 share: broader distribution = more mature
  if (top5BinPct < 60) score += 25;
  else if (top5BinPct < 80) score += 15;
  else score += 5;

  return {
    score: Math.min(score, 100),
    binsWithLiquidity,
    totalBinsScanned: totalScanned,
    utilizationPct,
    concentrationCoeff,
    topBinPct,
    top5BinPct,
  };
}

function analyzeLpDiversity(
  events: any[],
  poolId: number,
): { score: number; uniqueLps: number; hhi: number; topLpPct: number; avgEventsPerLp: number } {
  const lpActivity: Map<string, number> = new Map();

  for (const event of events) {
    if (event.event_type !== "smart_contract_log") continue;
    const repr = event?.contract_log?.value?.repr ?? "";

    const pidMatch = repr.match(/pool-id\s+u(\d+)/);
    if (pidMatch && parseInt(pidMatch[1]) !== poolId) continue;
    if (!pidMatch) continue;

    // Extract sender address from the event
    const senderMatch = repr.match(/sender\s+(SP[A-Z0-9]+)/) ?? repr.match(/owner\s+(SP[A-Z0-9]+)/);
    if (senderMatch) {
      const addr = senderMatch[1];
      lpActivity.set(addr, (lpActivity.get(addr) ?? 0) + 1);
    }
  }

  const uniqueLps = lpActivity.size;
  const totalEvents = Array.from(lpActivity.values()).reduce((s, v) => s + v, 0);
  const avgEventsPerLp = uniqueLps > 0 ? totalEvents / uniqueLps : 0;

  // HHI: Herfindahl-Hirschman Index (sum of squared market shares)
  let hhi = 0;
  let topLpPct = 0;
  if (totalEvents > 0) {
    const shares = Array.from(lpActivity.values()).map((v) => v / totalEvents);
    hhi = shares.reduce((s, share) => s + share * share, 0);
    topLpPct = Math.max(...shares) * 100;
  }

  // Score: more LPs + lower concentration = more mature
  let score = 0;
  score += Math.min(uniqueLps * 8, 30); // up to 30 for LP count
  if (hhi < 0.25) score += 30; // low concentration
  else if (hhi < 0.5) score += 20;
  else if (hhi < 0.75) score += 10;
  else score += 5;
  if (topLpPct < 30) score += 20; // no dominant LP
  else if (topLpPct < 50) score += 10;
  else score += 5;
  score += Math.min(avgEventsPerLp * 5, 20); // active LPs

  return {
    score: Math.min(score, 100),
    uniqueLps,
    hhi,
    topLpPct,
    avgEventsPerLp,
  };
}

function analyzeVolumeOrganicity(
  pool: AppPool,
): { score: number; volumeToTvlRatio: number; dailyTurnover: string; classification: string } {
  const ratio = pool.tvlUsd > 0 ? pool.volume24hUsd / pool.tvlUsd : 0;

  let classification: string;
  let score: number;

  if (ratio >= 0.5 && ratio <= 5.0) {
    classification = "HEALTHY";
    score = 90;
  } else if (ratio >= 0.1 && ratio < 0.5) {
    classification = "LOW_ACTIVITY";
    score = 50;
  } else if (ratio > 5.0 && ratio <= 20.0) {
    classification = "HIGH_TURNOVER";
    score = 60;
  } else if (ratio > 20.0) {
    classification = "WASH_SUSPECT";
    score = 20;
  } else if (ratio > 0) {
    classification = "DORMANT";
    score = 30;
  } else {
    classification = "NO_VOLUME";
    score = 10;
  }

  let dailyTurnover: string;
  if (ratio >= 1) dailyTurnover = `${ratio.toFixed(1)}x TVL`;
  else dailyTurnover = `${(ratio * 100).toFixed(1)}% of TVL`;

  return { score, volumeToTvlRatio: ratio, dailyTurnover, classification };
}

function analyzeBinSteadiness(
  events: any[],
  poolId: number,
  currentActiveBin: number,
): { score: number; activeBinDrift: number; activeBinsObserved: number; binCorridor: number } {
  const activeBins: number[] = [];

  for (const event of events) {
    if (event.event_type !== "smart_contract_log") continue;
    const repr = event?.contract_log?.value?.repr ?? "";

    const pidMatch = repr.match(/pool-id\s+u(\d+)/);
    if (pidMatch && parseInt(pidMatch[1]) !== poolId) continue;

    const binMatch = repr.match(/active-id\s+u(\d+)/) ?? repr.match(/bin-id\s+u(\d+)/);
    if (binMatch) {
      activeBins.push(parseInt(binMatch[1]));
    }
  }

  if (activeBins.length < 2) {
    return { score: 50, activeBinDrift: 0, activeBinsObserved: activeBins.length, binCorridor: 0 };
  }

  const minBin = Math.min(...activeBins);
  const maxBin = Math.max(...activeBins);
  const binCorridor = maxBin - minBin;

  // Average absolute drift between consecutive observations
  let totalDrift = 0;
  for (let i = 1; i < activeBins.length; i++) {
    totalDrift += Math.abs(activeBins[i] - activeBins[i - 1]);
  }
  const avgDrift = totalDrift / (activeBins.length - 1);

  // Low drift = more stable = more mature
  let score: number;
  if (avgDrift < 1) score = 95;
  else if (avgDrift < 3) score = 80;
  else if (avgDrift < 8) score = 60;
  else if (avgDrift < 15) score = 40;
  else score = 20;

  // Narrow corridor bonus
  if (binCorridor < 5) score = Math.min(score + 10, 100);
  else if (binCorridor > 30) score = Math.max(score - 15, 0);

  return { score, activeBinDrift: avgDrift, activeBinsObserved: activeBins.length, binCorridor };
}

function classifyMaturity(overallScore: number): MaturityGrade {
  if (overallScore >= 75) return "MATURE";
  if (overallScore >= 55) return "ESTABLISHED";
  if (overallScore >= 35) return "GROWING";
  return "NASCENT";
}

function identifyRiskFlags(analysis: MaturityAnalysis): string[] {
  const flags: string[] = [];
  const d = analysis.dimensions;

  if (d.activityDepth.eventCount < 5) flags.push("Very low on-chain activity — pool may be too new or abandoned");
  if (d.activityDepth.uniqueAddresses < 3) flags.push("Few unique participants — limited validation of pool mechanics");
  if (d.lpDiversity.uniqueLps < 2) flags.push("Single LP dominance — high rug risk if whale exits");
  if (d.lpDiversity.hhi > 0.5) flags.push("High LP concentration (HHI > 0.50) — whale dependency");
  if (d.lpDiversity.topLpPct > 60) flags.push(`Top LP controls ${d.lpDiversity.topLpPct.toFixed(0)}% of activity — exit risk`);
  if (d.liquidityStability.topBinPct > 50) flags.push(`Single bin holds ${d.liquidityStability.topBinPct.toFixed(0)}% of TVL — fragile distribution`);
  if (d.volumeOrganicity.classification === "WASH_SUSPECT") flags.push("Volume/TVL ratio > 20x — possible wash trading");
  if (d.volumeOrganicity.classification === "NO_VOLUME") flags.push("Zero 24h volume — pool may be inactive");
  if (d.binSteadiness.activeBinDrift > 10) flags.push("High active bin drift — unstable price discovery");
  if (analysis.tvlUsd < 5000) flags.push("TVL below $5K — insufficient depth for meaningful LP returns");
  if (d.activityDepth.removeEvents > d.activityDepth.addEvents && d.activityDepth.removeEvents > 2) {
    flags.push("More liquidity removals than additions — net LP outflow");
  }

  return flags;
}

function generateRecommendation(grade: MaturityGrade, score: number, flags: string[]): string {
  const criticalFlags = flags.length;

  switch (grade) {
    case "MATURE":
      if (criticalFlags === 0) return "Pool shows strong maturity signals across all dimensions. Suitable for larger positions with standard risk management.";
      return `Pool is generally mature but has ${criticalFlags} flag(s) to monitor. Suitable for medium-to-large positions with targeted risk awareness.`;
    case "ESTABLISHED":
      if (criticalFlags <= 1) return "Pool has reasonable establishment metrics. Suitable for moderate positions. Monitor LP diversity and volume trends.";
      return `Pool shows establishment signs but ${criticalFlags} flags warrant caution. Start with smaller positions and scale up as metrics improve.`;
    case "GROWING":
      return `Pool is still developing (${criticalFlags} risk flags). Only commit capital you're comfortable losing. Watch for improving LP count and volume consistency.`;
    case "NASCENT":
      return `Pool is very new or underdeveloped (${criticalFlags} risk flags). High uncertainty — treat any position as speculative. Wait for more on-chain history before committing significant capital.`;
  }
}

async function analyzeMaturity(pool: AppPool): Promise<MaturityAnalysis> {
  const poolId = pool.poolId ?? parseInt(pool.id);
  const pair = `${pool.token0Symbol}-${pool.token1Symbol}`;
  const activeBinId = pool.activeBinId ?? 0;

  const [bins, events] = await Promise.all([
    fetchBinReserves(poolId, activeBinId, BIN_SCAN_RADIUS),
    fetchContractEvents(0, EVENT_SCAN_LIMIT),
  ]);

  const activityDepth = analyzeActivityDepth(events, poolId);
  const liquidityStability = analyzeLiquidityStability(bins, pool, activeBinId);
  const lpDiversity = analyzeLpDiversity(events, poolId);
  const volumeOrganicity = analyzeVolumeOrganicity(pool);
  const binSteadiness = analyzeBinSteadiness(events, poolId, activeBinId);

  // Weighted composite score
  const maturityScore = Math.round(
    activityDepth.score * 0.25 +
    liquidityStability.score * 0.20 +
    lpDiversity.score * 0.25 +
    volumeOrganicity.score * 0.15 +
    binSteadiness.score * 0.15
  );

  const grade = classifyMaturity(maturityScore);

  const result: MaturityAnalysis = {
    pool: pool.id,
    pair,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    activeBinId,
    grade,
    maturityScore,
    dimensions: {
      activityDepth,
      liquidityStability,
      lpDiversity,
      volumeOrganicity,
      binSteadiness,
    },
    riskFlags: [],
    recommendation: "",
    interpretation: "",
    verdict: "",
  };

  result.riskFlags = identifyRiskFlags(result);
  result.recommendation = generateRecommendation(grade, maturityScore, result.riskFlags);

  const gradeDescriptions: Record<MaturityGrade, string> = {
    NASCENT: `${pair} is a nascent pool with limited on-chain history. Activity depth, LP diversity, and volume patterns suggest the pool is still in its earliest stages. LPs should treat positions as exploratory and monitor closely for signs of organic growth.`,
    GROWING: `${pair} is a growing pool showing early signs of establishment. Some on-chain activity and LP participation exist, but the pool hasn't yet reached stable maturity. Suitable for smaller, actively-managed positions.`,
    ESTABLISHED: `${pair} is an established pool with reasonable maturity indicators. LP diversity, activity depth, and volume patterns suggest organic usage. Suitable for moderate positions with standard monitoring.`,
    MATURE: `${pair} is a mature pool with strong establishment signals across all dimensions. Deep activity history, diverse LP participation, and healthy volume patterns indicate a reliable venue for liquidity provision.`,
  };

  result.interpretation = gradeDescriptions[grade];

  result.verdict = [
    `${gradeIcon(grade)} ${pair}: ${grade} (score: ${maturityScore}/100)`,
    `TVL: ${fmtUsd(pool.tvlUsd)} | Volume: ${fmtUsd(pool.volume24hUsd)} | LPs: ${lpDiversity.uniqueLps}`,
    result.riskFlags.length > 0
      ? `⚠️ ${result.riskFlags.length} risk flag(s) detected`
      : "✅ No critical risk flags",
  ].join("\n");

  return result;
}

// ── Display ───────────────────────────────────────────────────────────────────

function displayMaturityAnalysis(r: MaturityAnalysis): void {
  console.log("\n" + "═".repeat(72));
  console.log(`  HODLMM POOL MATURITY ANALYZER — ${r.pair}`);
  console.log("═".repeat(72));

  console.log(`\n  Pool:         ${r.pool}`);
  console.log(`  TVL:          ${fmtUsd(r.tvlUsd)}`);
  console.log(`  Volume 24h:   ${fmtUsd(r.volume24hUsd)}`);
  console.log(`  Active Bin:   ${r.activeBinId}`);

  console.log("\n── Maturity Grade ─────────────────────────────────");
  console.log(`  Grade:        ${gradeIcon(r.grade)} ${r.grade}`);
  console.log(`  Score:        ${r.maturityScore}/100 ${barChart(r.maturityScore, 100, 25)}`);

  const d = r.dimensions;

  console.log("\n── Dimension Scores ───────────────────────────────");
  console.log(`  ${scoreIcon(d.activityDepth.score)} Activity Depth:      ${d.activityDepth.score}/100  ${barChart(d.activityDepth.score, 100, 15)}`);
  console.log(`  ${scoreIcon(d.liquidityStability.score)} Liquidity Stability: ${d.liquidityStability.score}/100  ${barChart(d.liquidityStability.score, 100, 15)}`);
  console.log(`  ${scoreIcon(d.lpDiversity.score)} LP Diversity:        ${d.lpDiversity.score}/100  ${barChart(d.lpDiversity.score, 100, 15)}`);
  console.log(`  ${scoreIcon(d.volumeOrganicity.score)} Volume Organicity:   ${d.volumeOrganicity.score}/100  ${barChart(d.volumeOrganicity.score, 100, 15)}`);
  console.log(`  ${scoreIcon(d.binSteadiness.score)} Bin Steadiness:      ${d.binSteadiness.score}/100  ${barChart(d.binSteadiness.score, 100, 15)}`);

  console.log("\n── Activity Depth ─────────────────────────────────");
  console.log(`  Pool Events:      ${d.activityDepth.eventCount}`);
  console.log(`  Add Liquidity:    ${d.activityDepth.addEvents}`);
  console.log(`  Remove Liquidity: ${d.activityDepth.removeEvents}`);
  console.log(`  Swaps:            ${d.activityDepth.swapEvents}`);
  console.log(`  Unique Addresses: ${d.activityDepth.uniqueAddresses}`);

  console.log("\n── Liquidity Stability ────────────────────────────");
  console.log(`  Bins with Liq:   ${d.liquidityStability.binsWithLiquidity} / ${d.liquidityStability.totalBinsScanned}`);
  console.log(`  Utilization:     ${fmtPct(d.liquidityStability.utilizationPct)}`);
  console.log(`  Concentration:   ${fmtPct(d.liquidityStability.concentrationCoeff * 100)} within ±3 bins`);
  console.log(`  Top Bin Share:   ${fmtPct(d.liquidityStability.topBinPct)}`);
  console.log(`  Top-5 Share:     ${fmtPct(d.liquidityStability.top5BinPct)}`);

  console.log("\n── LP Diversity ───────────────────────────────────");
  console.log(`  Unique LPs:      ${d.lpDiversity.uniqueLps}`);
  console.log(`  HHI:             ${d.lpDiversity.hhi.toFixed(4)} ${d.lpDiversity.hhi < 0.25 ? "(diversified)" : d.lpDiversity.hhi < 0.5 ? "(moderate)" : "(concentrated)"}`);
  console.log(`  Top LP Share:    ${fmtPct(d.lpDiversity.topLpPct)}`);
  console.log(`  Avg Events/LP:   ${d.lpDiversity.avgEventsPerLp.toFixed(1)}`);

  console.log("\n── Volume Organicity ──────────────────────────────");
  console.log(`  Vol/TVL Ratio:   ${d.volumeOrganicity.volumeToTvlRatio.toFixed(2)}`);
  console.log(`  Daily Turnover:  ${d.volumeOrganicity.dailyTurnover}`);
  console.log(`  Classification:  ${d.volumeOrganicity.classification}`);

  console.log("\n── Bin Steadiness ─────────────────────────────────");
  console.log(`  Avg Drift:       ${d.binSteadiness.activeBinDrift.toFixed(2)} bins/event`);
  console.log(`  Observations:    ${d.binSteadiness.activeBinsObserved} active bin readings`);
  console.log(`  Bin Corridor:    ${d.binSteadiness.binCorridor} bins`);

  if (r.riskFlags.length > 0) {
    console.log("\n── Risk Flags ─────────────────────────────────────");
    for (const flag of r.riskFlags) {
      console.log(`  ⚠️  ${flag}`);
    }
  }

  console.log("\n── Recommendation ─────────────────────────────────");
  console.log(`  ${r.recommendation}`);

  console.log("\n── Interpretation ─────────────────────────────────");
  console.log(`  ${r.interpretation}`);

  console.log("\n── Verdict ────────────────────────────────────────");
  console.log(`  ${r.verdict.split("\n").join("\n  ")}`);

  console.log("\n" + "═".repeat(72));
}

function displayMultiPool(results: MaturityAnalysis[]): void {
  console.log("\n" + "═".repeat(85));
  console.log("  HODLMM POOL MATURITY ANALYZER — MULTI-POOL SCAN");
  console.log("═".repeat(85));

  const sorted = [...results].sort((a, b) => b.maturityScore - a.maturityScore);

  console.log(`\n  ${"Pair".padEnd(16)} ${"Grade".padEnd(14)} ${"Score".padEnd(8)} ${"TVL".padEnd(10)} ${"LPs".padEnd(6)} ${"HHI".padEnd(8)} ${"Vol/TVL".padEnd(10)} Flags`);
  console.log("  " + "─".repeat(83));

  for (const r of sorted) {
    const d = r.dimensions;
    console.log(
      `  ${r.pair.padEnd(16)} ${gradeIcon(r.grade)} ${r.grade.padEnd(12)} ${(r.maturityScore + "").padEnd(8)} ${fmtUsd(r.tvlUsd).padEnd(10)} ${(d.lpDiversity.uniqueLps + "").padEnd(6)} ${d.lpDiversity.hhi.toFixed(2).padEnd(8)} ${d.volumeOrganicity.volumeToTvlRatio.toFixed(2).padEnd(10)} ${r.riskFlags.length > 0 ? "⚠️" + r.riskFlags.length : "✅"}`
    );
  }

  // Grade distribution
  const gradeCounts: Record<MaturityGrade, number> = { NASCENT: 0, GROWING: 0, ESTABLISHED: 0, MATURE: 0 };
  for (const r of results) gradeCounts[r.grade]++;

  console.log("\n── Maturity Distribution ───────────────────────────");
  console.log(`  ${gradeIcon("MATURE")} Mature:       ${gradeCounts.MATURE} pools`);
  console.log(`  ${gradeIcon("ESTABLISHED")} Established:  ${gradeCounts.ESTABLISHED} pools`);
  console.log(`  ${gradeIcon("GROWING")} Growing:      ${gradeCounts.GROWING} pools`);
  console.log(`  ${gradeIcon("NASCENT")} Nascent:      ${gradeCounts.NASCENT} pools`);

  // Ecosystem summary
  const avgScore = results.reduce((s, r) => s + r.maturityScore, 0) / results.length;
  const totalFlags = results.reduce((s, r) => s + r.riskFlags.length, 0);
  const avgLps = results.reduce((s, r) => s + r.dimensions.lpDiversity.uniqueLps, 0) / results.length;

  console.log("\n── Ecosystem Health ────────────────────────────────");
  console.log(`  Avg Maturity Score: ${avgScore.toFixed(0)}/100`);
  console.log(`  Total Risk Flags:   ${totalFlags}`);
  console.log(`  Avg LPs per Pool:   ${avgLps.toFixed(1)}`);

  if (gradeCounts.NASCENT > 0) {
    const nascent = results.filter((r) => r.grade === "NASCENT");
    console.log(`\n  🌱 Nascent pools (use caution):`);
    for (const p of nascent) {
      console.log(`     ${p.pair}: score ${p.maturityScore}, ${p.riskFlags.length} flags`);
    }
  }

  console.log("\n" + "═".repeat(85));
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-pool-maturity")
  .description(
    "Evaluate HODLMM pool maturity by analyzing on-chain activity depth, LP diversity, " +
    "liquidity stability, volume organicity, and bin steadiness. Grades pools as " +
    "NASCENT / GROWING / ESTABLISHED / MATURE to help LPs assess pool reliability."
  )
  .argument("[pool]", "Pool ID or token pair (e.g., 'STX-sBTC')")
  .option("--all", "Scan all pools with sufficient TVL")
  .option("--top <n>", "Scan top N pools by TVL", "5")
  .option("--json", "Output raw JSON")
  .action(async (poolQuery: string | undefined, opts: any) => {
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

      console.log(`Analyzing pool maturity for ${sorted.length} pools...`);
      const results: MaturityAnalysis[] = [];

      for (const pool of sorted) {
        try {
          const result = await analyzeMaturity(pool);
          results.push(result);
          process.stderr.write(`  ✓ ${pool.token0Symbol}-${pool.token1Symbol} — ${result.grade} (${result.maturityScore}/100)\n`);
        } catch (e: any) {
          process.stderr.write(`  ✗ ${pool.token0Symbol}-${pool.token1Symbol}: ${e.message}\n`);
        }
        await sleep(500);
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

      console.log(`Analyzing pool maturity for ${pool.token0Symbol}-${pool.token1Symbol}...`);
      const result = await analyzeMaturity(pool);

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        displayMaturityAnalysis(result);
      }
    }
  });

program.parse();
