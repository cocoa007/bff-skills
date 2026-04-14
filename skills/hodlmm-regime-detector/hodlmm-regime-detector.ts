#!/usr/bin/env bun
/**
 * hodlmm-regime-detector.ts
 *
 * HODLMM Market Regime Detector — Classifies current market conditions for
 * DLMM pools by analyzing on-chain bin reserve distributions, active bin
 * drift patterns, and liquidity concentration dynamics. Recommends optimal
 * LP strategies for each detected regime.
 *
 * Regimes:
 *  - TRENDING: sustained directional drift in active bin position
 *  - RANGING: active bin oscillates within a narrow corridor
 *  - VOLATILE: rapid bin movements with wide reserve dispersion
 *  - QUIET: minimal bin movement, tight reserve concentration
 *
 * Key metrics:
 *  - Active bin drift velocity (bins/block)
 *  - Bin oscillation range (spread of recent active bins)
 *  - Reserve distribution skew (directional pressure)
 *  - Concentration coefficient (how tightly reserves cluster)
 *  - Regime confidence score (0-100)
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 65).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 30;
const EVENT_SCAN_LIMIT = 50;

// Regime thresholds
const DRIFT_TRENDING_THRESHOLD = 0.15; // bins per event — high = trending
const DRIFT_QUIET_THRESHOLD = 0.03;    // bins per event — low = quiet
const OSCILLATION_NARROW = 5;          // bin range — narrow = ranging/quiet
const OSCILLATION_WIDE = 15;           // bin range — wide = volatile/trending
const SKEW_THRESHOLD = 0.25;           // reserve skew — high = directional

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

type RegimeType = "TRENDING" | "RANGING" | "VOLATILE" | "QUIET";
type TrendDirection = "BULLISH" | "BEARISH" | "NEUTRAL";

interface BinData {
  binId: number;
  reserveX: number;
  reserveY: number;
  totalUsd: number;
  pctOfTvl: number;
}

interface RegimeAnalysis {
  pool: string;
  pair: string;
  tvlUsd: number;
  activeBinId: number;
  regime: RegimeType;
  regimeConfidence: number;
  trendDirection: TrendDirection;
  drift: {
    velocity: number;
    direction: TrendDirection;
    activeBinRange: number;
    activeBinsObserved: number[];
    driftMagnitude: number;
  };
  distribution: {
    skew: number;
    skewDirection: string;
    concentrationCoeff: number;
    binsWithLiquidity: number;
    totalBinsScanned: number;
    topBinPct: number;
    top5BinPct: number;
  };
  volatility: {
    binSpread: number;
    reserveDispersion: number;
    asymmetryRatio: number;
  };
  strategy: {
    recommendation: string;
    binRange: string;
    rebalanceFrequency: string;
    riskLevel: string;
    rationale: string;
  };
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

function regimeIcon(r: RegimeType): string {
  switch (r) {
    case "TRENDING": return "📈";
    case "RANGING": return "↔️";
    case "VOLATILE": return "⚡";
    case "QUIET": return "🧘";
  }
}

function directionIcon(d: TrendDirection): string {
  switch (d) {
    case "BULLISH": return "🟢";
    case "BEARISH": return "🔴";
    case "NEUTRAL": return "⚪";
  }
}

function riskIcon(level: string): string {
  switch (level) {
    case "LOW": return "🟢";
    case "MEDIUM": return "🟡";
    case "HIGH": return "🟠";
    case "VERY HIGH": return "🔴";
    default: return "⚪";
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

function analyzeBinDistribution(
  bins: BinData[],
  pool: AppPool,
  activeBinId: number,
): {
  skew: number;
  skewDirection: string;
  concentrationCoeff: number;
  binsWithLiquidity: number;
  topBinPct: number;
  top5BinPct: number;
} {
  // Price-weight bins
  for (const bin of bins) {
    const rx = bin.reserveX / 10 ** pool.token0Decimals;
    const ry = bin.reserveY / 10 ** pool.token1Decimals;
    bin.totalUsd = rx * pool.token0PriceUsd + ry * pool.token1PriceUsd;
  }

  const totalUsd = bins.reduce((s, b) => s + b.totalUsd, 0);
  if (totalUsd === 0) {
    return {
      skew: 0,
      skewDirection: "NEUTRAL",
      concentrationCoeff: 0,
      binsWithLiquidity: 0,
      topBinPct: 0,
      top5BinPct: 0,
    };
  }

  for (const bin of bins) {
    bin.pctOfTvl = (bin.totalUsd / totalUsd) * 100;
  }

  // Skew: weighted average bin position relative to active bin
  let weightedPos = 0;
  for (const bin of bins) {
    weightedPos += (bin.binId - activeBinId) * (bin.totalUsd / totalUsd);
  }
  const skew = weightedPos / BIN_SCAN_RADIUS; // normalized to [-1, 1]

  let skewDirection: string;
  if (skew > SKEW_THRESHOLD) skewDirection = "HEAVY_RIGHT (token1 dominant)";
  else if (skew < -SKEW_THRESHOLD) skewDirection = "HEAVY_LEFT (token0 dominant)";
  else skewDirection = "BALANCED";

  // Concentration: how tightly reserves cluster around active bin
  let concentrationMass = 0;
  for (const bin of bins) {
    const distance = Math.abs(bin.binId - activeBinId);
    if (distance <= 3) concentrationMass += bin.totalUsd;
  }
  const concentrationCoeff = totalUsd > 0 ? concentrationMass / totalUsd : 0;

  // Top bin and top-5 bin percentages
  const sorted = [...bins].sort((a, b) => b.totalUsd - a.totalUsd);
  const topBinPct = sorted[0]?.pctOfTvl ?? 0;
  const top5BinPct = sorted.slice(0, 5).reduce((s, b) => s + b.pctOfTvl, 0);

  return {
    skew,
    skewDirection,
    concentrationCoeff,
    binsWithLiquidity: bins.filter((b) => b.totalUsd > 0).length,
    topBinPct,
    top5BinPct,
  };
}

function extractActiveBinDrift(
  events: any[],
  poolId: number,
): { activeBinsObserved: number[]; velocity: number; direction: TrendDirection; driftMagnitude: number } {
  const activeBins: number[] = [];

  for (const event of events) {
    if (event.event_type !== "smart_contract_log") continue;
    const repr = event?.contract_log?.value?.repr ?? "";

    // Look for events that reference our pool and contain active-bin info
    const pidMatch = repr.match(/pool-id\s+u(\d+)/);
    if (pidMatch && parseInt(pidMatch[1]) !== poolId) continue;

    const binMatch = repr.match(/active-id\s+u(\d+)/) ?? repr.match(/bin-id\s+u(\d+)/);
    if (binMatch) {
      activeBins.push(parseInt(binMatch[1]));
    }
  }

  if (activeBins.length < 2) {
    return {
      activeBinsObserved: activeBins,
      velocity: 0,
      direction: "NEUTRAL",
      driftMagnitude: 0,
    };
  }

  // Velocity: average bin change between consecutive observations
  let totalDrift = 0;
  for (let i = 1; i < activeBins.length; i++) {
    totalDrift += activeBins[i] - activeBins[i - 1];
  }
  const avgDrift = totalDrift / (activeBins.length - 1);
  const velocity = Math.abs(avgDrift);

  // Net drift magnitude: how far we moved from start to end
  const driftMagnitude = Math.abs(activeBins[activeBins.length - 1] - activeBins[0]);

  let direction: TrendDirection = "NEUTRAL";
  if (avgDrift > DRIFT_QUIET_THRESHOLD) direction = "BULLISH";
  else if (avgDrift < -DRIFT_QUIET_THRESHOLD) direction = "BEARISH";

  return { activeBinsObserved: activeBins, velocity, direction, driftMagnitude };
}

function classifyRegime(
  drift: { velocity: number; driftMagnitude: number; activeBinsObserved: number[] },
  dist: { skew: number; concentrationCoeff: number },
): { regime: RegimeType; confidence: number } {
  const binRange =
    drift.activeBinsObserved.length >= 2
      ? Math.max(...drift.activeBinsObserved) - Math.min(...drift.activeBinsObserved)
      : 0;

  // Score each regime
  let trendingScore = 0;
  let rangingScore = 0;
  let volatileScore = 0;
  let quietScore = 0;

  // Drift velocity signals
  if (drift.velocity >= DRIFT_TRENDING_THRESHOLD) {
    trendingScore += 35;
    volatileScore += 15;
  } else if (drift.velocity <= DRIFT_QUIET_THRESHOLD) {
    quietScore += 30;
    rangingScore += 20;
  } else {
    rangingScore += 25;
    volatileScore += 10;
  }

  // Bin range signals
  if (binRange >= OSCILLATION_WIDE) {
    if (drift.driftMagnitude > binRange * 0.6) trendingScore += 25;
    else volatileScore += 30;
  } else if (binRange <= OSCILLATION_NARROW) {
    if (drift.velocity <= DRIFT_QUIET_THRESHOLD) quietScore += 25;
    else rangingScore += 25;
  } else {
    rangingScore += 15;
    volatileScore += 10;
  }

  // Directional drift: strong net movement = trending
  if (drift.driftMagnitude >= 10) {
    trendingScore += 20;
  } else if (drift.driftMagnitude <= 3) {
    rangingScore += 15;
    quietScore += 10;
  }

  // Distribution signals
  if (Math.abs(dist.skew) > SKEW_THRESHOLD) {
    trendingScore += 15;
    volatileScore += 5;
  } else {
    rangingScore += 10;
    quietScore += 5;
  }

  if (dist.concentrationCoeff > 0.6) {
    quietScore += 15;
    rangingScore += 10;
  } else if (dist.concentrationCoeff < 0.2) {
    volatileScore += 15;
    trendingScore += 5;
  }

  // Pick winner
  const scores = [
    { regime: "TRENDING" as RegimeType, score: trendingScore },
    { regime: "RANGING" as RegimeType, score: rangingScore },
    { regime: "VOLATILE" as RegimeType, score: volatileScore },
    { regime: "QUIET" as RegimeType, score: quietScore },
  ].sort((a, b) => b.score - a.score);

  const topScore = scores[0].score;
  const totalScore = scores.reduce((s, x) => s + x.score, 0);
  const confidence = totalScore > 0 ? Math.round((topScore / totalScore) * 100) : 0;

  return { regime: scores[0].regime, confidence };
}

function recommendStrategy(
  regime: RegimeType,
  direction: TrendDirection,
  confidence: number,
): {
  recommendation: string;
  binRange: string;
  rebalanceFrequency: string;
  riskLevel: string;
  rationale: string;
} {
  switch (regime) {
    case "TRENDING":
      return {
        recommendation: direction === "BULLISH"
          ? "Shift bins above active bin — ride the trend with asymmetric upside exposure"
          : "Shift bins below active bin — position for continued downward movement",
        binRange: "±5-10 bins (asymmetric toward trend direction)",
        rebalanceFrequency: "Every 2-4 hours — rebalance when active bin exits your range",
        riskLevel: "HIGH",
        rationale: `Sustained ${direction.toLowerCase()} drift detected (confidence: ${confidence}%). Concentrated liquidity benefits from directional positioning. Risk: trend reversal leaves position out of range. Use stop-loss bin monitoring.`,
      };
    case "RANGING":
      return {
        recommendation: "Center liquidity around active bin with symmetric range — collect fees on oscillations",
        binRange: "±8-15 bins (symmetric around active bin)",
        rebalanceFrequency: "Every 12-24 hours — only rebalance on range breach",
        riskLevel: "LOW",
        rationale: `Price oscillating within narrow corridor (confidence: ${confidence}%). Wide symmetric ranges capture fees on each oscillation without requiring frequent rebalancing. Ideal market for passive LPs.`,
      };
    case "VOLATILE":
      return {
        recommendation: "Widen range significantly or reduce position size — volatile conditions increase IL risk",
        binRange: "±15-25 bins (wide range to avoid frequent range exits)",
        rebalanceFrequency: "Every 1-2 hours if actively managing; consider pausing LP entirely",
        riskLevel: "VERY HIGH",
        rationale: `Rapid bin movements with wide dispersion (confidence: ${confidence}%). High IL risk from unpredictable price swings. Only experienced LPs should provide liquidity in volatile regimes. Fee income may not compensate for IL.`,
      };
    case "QUIET":
      return {
        recommendation: "Concentrate tightly around active bin — maximize fee capture from minimal price movement",
        binRange: "±2-5 bins (tight concentration for maximum fee share)",
        rebalanceFrequency: "Every 24-48 hours — minimal movement expected",
        riskLevel: "LOW",
        rationale: `Minimal bin movement with tight reserve concentration (confidence: ${confidence}%). Tight ranges capture disproportionate fee share when price barely moves. Risk: sudden regime shift to volatile. Set alerts for breakouts.`,
      };
  }
}

async function analyzeRegime(pool: AppPool): Promise<RegimeAnalysis> {
  const poolId = pool.poolId ?? parseInt(pool.id);
  const pair = `${pool.token0Symbol}-${pool.token1Symbol}`;
  const activeBinId = pool.activeBinId ?? 0;

  // Fetch bin reserves and contract events in parallel
  const [bins, events] = await Promise.all([
    fetchBinReserves(poolId, activeBinId, BIN_SCAN_RADIUS),
    fetchContractEvents(0, EVENT_SCAN_LIMIT),
  ]);

  // Analyze distribution
  const dist = analyzeBinDistribution(bins, pool, activeBinId);

  // Analyze drift from events
  const driftData = extractActiveBinDrift(events, poolId);

  // Classify regime
  const { regime, confidence } = classifyRegime(driftData, dist);

  // Determine trend direction
  const trendDirection = driftData.direction;

  // Bin spread (range of bins with liquidity)
  const liquidBins = bins.filter((b) => b.totalUsd > 0).map((b) => b.binId);
  const binSpread = liquidBins.length >= 2
    ? Math.max(...liquidBins) - Math.min(...liquidBins)
    : 0;

  // Reserve dispersion: std dev of bin values
  const avgBinValue = bins.reduce((s, b) => s + b.totalUsd, 0) / Math.max(bins.length, 1);
  const variance = bins.reduce((s, b) => s + (b.totalUsd - avgBinValue) ** 2, 0) / Math.max(bins.length, 1);
  const reserveDispersion = Math.sqrt(variance);

  // Asymmetry: ratio of reserves left vs right of active bin
  const leftTotal = bins.filter((b) => b.binId < activeBinId).reduce((s, b) => s + b.totalUsd, 0);
  const rightTotal = bins.filter((b) => b.binId > activeBinId).reduce((s, b) => s + b.totalUsd, 0);
  const asymmetryRatio = (leftTotal + rightTotal) > 0
    ? (rightTotal - leftTotal) / (leftTotal + rightTotal)
    : 0;

  // Strategy recommendation
  const strategy = recommendStrategy(regime, trendDirection, confidence);

  // Interpretation
  const interpretations: Record<RegimeType, string> = {
    TRENDING: `${pair} is in a ${trendDirection.toLowerCase()} trend — active bin drifting ${trendDirection === "BULLISH" ? "upward" : "downward"} with ${fmtPct(Math.abs(dist.skew * 100))} reserve skew. LPs should position asymmetrically in the trend direction and rebalance frequently.`,
    RANGING: `${pair} is range-bound — price oscillating within a ${driftData.activeBinsObserved.length >= 2 ? Math.max(...driftData.activeBinsObserved) - Math.min(...driftData.activeBinsObserved) : 0}-bin corridor. Symmetric LP positions with moderate width will capture fees efficiently with low rebalance cost.`,
    VOLATILE: `${pair} is experiencing high volatility — rapid bin movements across ${binSpread} bins with dispersed reserves. IL risk is elevated. Consider widening ranges or reducing exposure until conditions stabilize.`,
    QUIET: `${pair} is in a quiet regime — minimal bin movement with ${fmtPct(dist.concentrationCoeff * 100)} of reserves concentrated near the active bin. Ideal conditions for tight, concentrated LP positions to maximize fee capture.`,
  };

  const verdict = [
    `${regimeIcon(regime)} ${pair}: ${regime} (${confidence}% confidence)`,
    `Direction: ${directionIcon(trendDirection)} ${trendDirection} | Drift: ${driftData.velocity.toFixed(3)} bins/event`,
    `Strategy: ${strategy.binRange} | Risk: ${riskIcon(strategy.riskLevel)} ${strategy.riskLevel}`,
  ].join("\n");

  return {
    pool: pool.id,
    pair,
    tvlUsd: pool.tvlUsd,
    activeBinId,
    regime,
    regimeConfidence: confidence,
    trendDirection,
    drift: {
      velocity: driftData.velocity,
      direction: trendDirection,
      activeBinRange: driftData.activeBinsObserved.length >= 2
        ? Math.max(...driftData.activeBinsObserved) - Math.min(...driftData.activeBinsObserved)
        : 0,
      activeBinsObserved: driftData.activeBinsObserved,
      driftMagnitude: driftData.driftMagnitude,
    },
    distribution: {
      skew: dist.skew,
      skewDirection: dist.skewDirection,
      concentrationCoeff: dist.concentrationCoeff,
      binsWithLiquidity: dist.binsWithLiquidity,
      totalBinsScanned: BIN_SCAN_RADIUS * 2 + 1,
      topBinPct: dist.topBinPct,
      top5BinPct: dist.top5BinPct,
    },
    volatility: {
      binSpread,
      reserveDispersion,
      asymmetryRatio,
    },
    strategy,
    interpretation: interpretations[regime],
    verdict,
  };
}

// ── Display ───────────────────────────────────────────────────────────────────

function displayRegimeAnalysis(r: RegimeAnalysis): void {
  console.log("\n" + "═".repeat(72));
  console.log(`  HODLMM MARKET REGIME DETECTOR — ${r.pair}`);
  console.log("═".repeat(72));

  console.log(`\n  Pool:         ${r.pool}`);
  console.log(`  TVL:          ${fmtUsd(r.tvlUsd)}`);
  console.log(`  Active Bin:   ${r.activeBinId}`);

  console.log("\n── Regime Classification ───────────────────────────");
  console.log(`  Regime:       ${regimeIcon(r.regime)} ${r.regime}`);
  console.log(`  Confidence:   ${r.regimeConfidence}% ${barChart(r.regimeConfidence, 100, 25)}`);
  console.log(`  Direction:    ${directionIcon(r.trendDirection)} ${r.trendDirection}`);

  console.log("\n── Drift Analysis ─────────────────────────────────");
  console.log(`  Velocity:     ${r.drift.velocity.toFixed(4)} bins/event`);
  console.log(`  Net Drift:    ${r.drift.driftMagnitude} bins`);
  console.log(`  Active Range: ${r.drift.activeBinRange} bins`);
  console.log(`  Observations: ${r.drift.activeBinsObserved.length} active bin readings`);
  if (r.drift.activeBinsObserved.length > 0) {
    const minBin = Math.min(...r.drift.activeBinsObserved);
    const maxBin = Math.max(...r.drift.activeBinsObserved);
    console.log(`  Bin Corridor: ${minBin} → ${maxBin}`);
  }

  console.log("\n── Reserve Distribution ────────────────────────────");
  console.log(`  Skew:           ${r.distribution.skew.toFixed(3)} → ${r.distribution.skewDirection}`);
  console.log(`  Concentration:  ${fmtPct(r.distribution.concentrationCoeff * 100)} within ±3 bins`);
  console.log(`  Liquid Bins:    ${r.distribution.binsWithLiquidity} / ${r.distribution.totalBinsScanned} scanned`);
  console.log(`  Top Bin Share:  ${fmtPct(r.distribution.topBinPct)}`);
  console.log(`  Top-5 Share:    ${fmtPct(r.distribution.top5BinPct)}`);

  console.log("\n── Volatility Indicators ───────────────────────────");
  console.log(`  Bin Spread:     ${r.volatility.binSpread} bins`);
  console.log(`  Reserve StdDev: ${fmtUsd(r.volatility.reserveDispersion)}`);
  console.log(`  Asymmetry:      ${(r.volatility.asymmetryRatio * 100).toFixed(1)}% ${r.volatility.asymmetryRatio > 0 ? "(right-heavy)" : r.volatility.asymmetryRatio < 0 ? "(left-heavy)" : "(balanced)"}`);

  console.log("\n── LP Strategy ────────────────────────────────────");
  console.log(`  ${riskIcon(r.strategy.riskLevel)} Risk Level: ${r.strategy.riskLevel}`);
  console.log(`  Range:       ${r.strategy.binRange}`);
  console.log(`  Rebalance:   ${r.strategy.rebalanceFrequency}`);
  console.log(`\n  ${r.strategy.recommendation}`);
  console.log(`\n  Rationale: ${r.strategy.rationale}`);

  console.log("\n── Interpretation ─────────────────────────────────");
  console.log(`  ${r.interpretation}`);

  console.log("\n── Verdict ────────────────────────────────────────");
  console.log(`  ${r.verdict.split("\n").join("\n  ")}`);

  console.log("\n" + "═".repeat(72));
}

function displayMultiPool(results: RegimeAnalysis[]): void {
  console.log("\n" + "═".repeat(80));
  console.log("  HODLMM MARKET REGIME DETECTOR — MULTI-POOL SCAN");
  console.log("═".repeat(80));

  const sorted = [...results].sort((a, b) => b.tvlUsd - a.tvlUsd);

  console.log(`\n  ${"Pair".padEnd(16)} ${"Regime".padEnd(12)} ${"Conf".padEnd(8)} ${"Dir".padEnd(10)} ${"Drift".padEnd(10)} ${"Skew".padEnd(10)} ${"Risk".padEnd(12)} Range`);
  console.log("  " + "─".repeat(78));

  for (const r of sorted) {
    console.log(
      `  ${r.pair.padEnd(16)} ${regimeIcon(r.regime)} ${r.regime.padEnd(10)} ${(r.regimeConfidence + "%").padEnd(8)} ${directionIcon(r.trendDirection)} ${r.trendDirection.padEnd(8)} ${r.drift.velocity.toFixed(3).padEnd(10)} ${r.distribution.skew.toFixed(2).padEnd(10)} ${riskIcon(r.strategy.riskLevel)} ${r.strategy.riskLevel.padEnd(10)} ±${r.drift.activeBinRange}`
    );
  }

  // Regime distribution summary
  const regimeCounts: Record<RegimeType, number> = { TRENDING: 0, RANGING: 0, VOLATILE: 0, QUIET: 0 };
  for (const r of results) regimeCounts[r.regime]++;

  console.log("\n── Market Regime Distribution ───────────────────────");
  console.log(`  ${regimeIcon("TRENDING")} Trending:  ${regimeCounts.TRENDING} pools`);
  console.log(`  ${regimeIcon("RANGING")} Ranging:   ${regimeCounts.RANGING} pools`);
  console.log(`  ${regimeIcon("VOLATILE")} Volatile:  ${regimeCounts.VOLATILE} pools`);
  console.log(`  ${regimeIcon("QUIET")} Quiet:     ${regimeCounts.QUIET} pools`);

  // Market-wide sentiment
  const bullish = results.filter((r) => r.trendDirection === "BULLISH").length;
  const bearish = results.filter((r) => r.trendDirection === "BEARISH").length;
  const neutral = results.filter((r) => r.trendDirection === "NEUTRAL").length;
  const avgConfidence = results.reduce((s, r) => s + r.regimeConfidence, 0) / results.length;

  console.log("\n── Ecosystem Sentiment ─────────────────────────────");
  console.log(`  🟢 Bullish: ${bullish}  🔴 Bearish: ${bearish}  ⚪ Neutral: ${neutral}`);
  console.log(`  Avg Confidence: ${avgConfidence.toFixed(0)}%`);

  if (regimeCounts.VOLATILE > 0) {
    const volPools = results.filter((r) => r.regime === "VOLATILE");
    console.log(`\n  ⚠️  Volatile pools (elevated IL risk):`);
    for (const p of volPools) {
      console.log(`     ${p.pair}: drift ${p.drift.velocity.toFixed(3)}, spread ${p.volatility.binSpread} bins`);
    }
  }

  console.log("\n" + "═".repeat(80));
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-regime-detector")
  .description(
    "Classify market regimes (TRENDING, RANGING, VOLATILE, QUIET) for HODLMM pools " +
    "by analyzing on-chain bin dynamics. Recommends optimal LP strategies per regime."
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

      console.log(`Detecting market regimes for ${sorted.length} pools...`);
      const results: RegimeAnalysis[] = [];

      for (const pool of sorted) {
        try {
          const result = await analyzeRegime(pool);
          results.push(result);
          process.stderr.write(`  ✓ ${pool.token0Symbol}-${pool.token1Symbol} — ${result.regime} (${result.regimeConfidence}%)\n`);
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

      console.log(`Detecting market regime for ${pool.token0Symbol}-${pool.token1Symbol}...`);
      const result = await analyzeRegime(pool);

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        displayRegimeAnalysis(result);
      }
    }
  });

program.parse();
