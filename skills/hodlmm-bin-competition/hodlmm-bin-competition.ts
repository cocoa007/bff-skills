#!/usr/bin/env bun
/**
 * hodlmm-bin-competition.ts
 *
 * HODLMM Bin Competition Analyzer — Measures LP competition density within
 * bins to identify underserved fee opportunities. When bins near the active
 * price are overcrowded, per-LP fee capture drops; bins with high volume but
 * low liquidity offer better returns per dollar deployed.
 *
 * Key metrics:
 *  - Competition density per bin (liquidity per bin relative to pool TVL)
 *  - Fee opportunity score (volume-weighted vs liquidity-weighted)
 *  - Crowding index (how concentrated LPs are around the active bin)
 *  - Underserved bin detection (high implied volume, low liquidity)
 *  - Optimal positioning recommendation (best bins for new capital)
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 72).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 20;

// Competition thresholds
const CROWDED_SHARE_THRESHOLD = 0.15;   // Bin has >15% of pool TVL = crowded
const SPARSE_SHARE_THRESHOLD = 0.02;    // Bin has <2% of TVL = sparse/underserved
const HIGH_OPPORTUNITY_SCORE = 3.0;     // Fee-per-dollar 3x above average
const LOW_OPPORTUNITY_SCORE = 0.5;      // Below 50% of average fee-per-dollar

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
  feeBps?: number;
}

interface BinReserves {
  binId: number;
  reserveX: number;
  reserveY: number;
  totalUsd: number;
}

type CompetitionLevel = "OVERCROWDED" | "COMPETITIVE" | "MODERATE" | "UNDERSERVED" | "EMPTY";

interface BinCompetition {
  binId: number;
  distanceFromActive: number;
  liquidityUsd: number;
  shareOfPool: number;
  estimatedFeeSharePct: number;
  feePerDollar: number;
  opportunityScore: number;
  competitionLevel: CompetitionLevel;
}

interface CrowdingProfile {
  giniCoefficient: number;
  hhi: number;
  topBinConcentration: number;
  binsWithLiquidity: number;
  totalBinsScanned: number;
  crowdingVerdict: "HIGHLY_CONCENTRATED" | "MODERATELY_CONCENTRATED" | "WELL_DISTRIBUTED";
}

interface PoolCompetitionAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  bins: BinCompetition[];
  crowding: CrowdingProfile;
  bestOpportunities: BinCompetition[];
  worstBins: BinCompetition[];
  recommendation: string;
  asciiHeatmap: string;
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
  if (n < 0) return "N/A";
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(6)}`;
}

function classifyCompetition(shareOfPool: number, opportunityScore: number): CompetitionLevel {
  if (shareOfPool <= 0.001) return "EMPTY";
  if (shareOfPool >= CROWDED_SHARE_THRESHOLD) return "OVERCROWDED";
  if (opportunityScore >= HIGH_OPPORTUNITY_SCORE) return "UNDERSERVED";
  if (shareOfPool >= 0.08) return "COMPETITIVE";
  return "MODERATE";
}

// ── Pool Data ──────────────────────────────────────────────────────────────────

let _poolCache: AppPool[] | null = null;

async function fetchAllPools(): Promise<AppPool[]> {
  if (_poolCache) return _poolCache;
  const data = await fetchJson(`${BFF_APP_BASE}/pools/hodlmm`);
  const pools: AppPool[] = (data?.pools || data || []).map((p: any) => ({
    id: p.id ?? p.poolId ?? "?",
    token0Symbol: p.token0Symbol ?? p.tokenXSymbol ?? "?",
    token1Symbol: p.token1Symbol ?? p.tokenYSymbol ?? "?",
    tvlUsd: parseFloat(p.tvlUsd ?? p.tvl ?? "0"),
    volume24hUsd: parseFloat(p.volume24hUsd ?? p.volume24h ?? "0"),
    poolId: parseInt(p.poolId ?? p.id ?? "0"),
    token0Decimals: parseInt(p.token0Decimals ?? p.tokenXDecimals ?? "6"),
    token1Decimals: parseInt(p.token1Decimals ?? p.tokenYDecimals ?? "6"),
    token0PriceUsd: parseFloat(p.token0PriceUsd ?? p.tokenXPriceUsd ?? "0"),
    token1PriceUsd: parseFloat(p.token1PriceUsd ?? p.tokenYPriceUsd ?? "0"),
    activeBinId: parseInt(p.activeBinId ?? "0") || undefined,
    feeBps: parseFloat(p.feeBps ?? p.fee ?? "30"),
  }));
  _poolCache = pools.filter((p) => p.tvlUsd >= MIN_TVL_USD);
  return _poolCache;
}

async function getActiveBin(poolId: number): Promise<number> {
  const result = await callReadOnly("get-active-bin-id", [uintCV(poolId)]);
  return parseUintResult(result);
}

async function fetchBinReserves(poolId: number, activeBinId: number, pool: AppPool): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const start = activeBinId - BIN_SCAN_RADIUS;
  const end = activeBinId + BIN_SCAN_RADIUS;

  for (let binId = start; binId <= end; binId++) {
    try {
      const result = await callReadOnly("get-bin", [uintCV(poolId), uintCV(binId)]);
      const parsed = parseUintResult(result);
      if (parsed > 0) {
        const ratioX = pool.token0PriceUsd / (pool.token0PriceUsd + pool.token1PriceUsd + 0.001);
        const reserveX = parsed * ratioX;
        const reserveY = parsed * (1 - ratioX);
        const usdX = (reserveX / Math.pow(10, pool.token0Decimals)) * pool.token0PriceUsd;
        const usdY = (reserveY / Math.pow(10, pool.token1Decimals)) * pool.token1PriceUsd;
        bins.push({ binId, reserveX, reserveY, totalUsd: usdX + usdY });
      } else {
        bins.push({ binId, reserveX: 0, reserveY: 0, totalUsd: 0 });
      }
    } catch {
      bins.push({ binId, reserveX: 0, reserveY: 0, totalUsd: 0 });
    }
  }
  return bins;
}

// ── Competition Analysis ───────────────────────────────────────────────────────

function computeVolumeWeight(distanceFromActive: number): number {
  // Bins closer to active bin see more trade volume.
  // Exponential decay: active bin = 1.0, +/-1 = 0.7, +/-3 = 0.34, +/-10 = 0.03
  return Math.exp(-0.35 * Math.abs(distanceFromActive));
}

function analyzeBinCompetition(
  bins: BinReserves[],
  activeBinId: number,
  tvlUsd: number,
  volume24hUsd: number,
  feeBps: number
): BinCompetition[] {
  const totalBinUsd = bins.reduce((s, b) => s + b.totalUsd, 0);
  const effectiveTvl = totalBinUsd > 0 ? totalBinUsd : tvlUsd;
  const poolDailyFees = (volume24hUsd * feeBps) / 10_000;

  // Compute total volume weight across all bins with liquidity
  const totalVolumeWeight = bins
    .filter((b) => b.totalUsd > 0)
    .reduce((s, b) => s + computeVolumeWeight(b.binId - activeBinId), 0);

  // Average fee-per-dollar for normalization
  const avgFeePerDollar = effectiveTvl > 0 ? poolDailyFees / effectiveTvl : 0;

  return bins.map((bin) => {
    const dist = bin.binId - activeBinId;
    const shareOfPool = effectiveTvl > 0 ? bin.totalUsd / effectiveTvl : 0;
    const volumeWeight = computeVolumeWeight(dist);

    // Estimated fee share: proportional to volume weight of this bin
    const estimatedFeeSharePct = totalVolumeWeight > 0
      ? (volumeWeight / totalVolumeWeight) * 100
      : 0;

    // Fee per dollar: how much fee income per dollar of liquidity in this bin
    const binDailyFees = totalVolumeWeight > 0
      ? poolDailyFees * (volumeWeight / totalVolumeWeight)
      : 0;
    const feePerDollar = bin.totalUsd > 0 ? binDailyFees / bin.totalUsd : 0;

    // Opportunity score: fee-per-dollar relative to pool average
    const opportunityScore = avgFeePerDollar > 0 ? feePerDollar / avgFeePerDollar : 0;

    const competitionLevel = classifyCompetition(shareOfPool, opportunityScore);

    return {
      binId: bin.binId,
      distanceFromActive: dist,
      liquidityUsd: Math.round(bin.totalUsd * 100) / 100,
      shareOfPool: Math.round(shareOfPool * 10000) / 10000,
      estimatedFeeSharePct: Math.round(estimatedFeeSharePct * 100) / 100,
      feePerDollar: Math.round(feePerDollar * 1000000) / 1000000,
      opportunityScore: Math.round(opportunityScore * 100) / 100,
      competitionLevel,
    };
  });
}

function computeCrowdingProfile(bins: BinCompetition[]): CrowdingProfile {
  const withLiquidity = bins.filter((b) => b.liquidityUsd > 0);
  const n = withLiquidity.length;

  if (n === 0) {
    return {
      giniCoefficient: 0,
      hhi: 0,
      topBinConcentration: 0,
      binsWithLiquidity: 0,
      totalBinsScanned: bins.length,
      crowdingVerdict: "WELL_DISTRIBUTED",
    };
  }

  // Gini coefficient
  const shares = withLiquidity.map((b) => b.shareOfPool).sort((a, b) => a - b);
  const mean = shares.reduce((s, v) => s + v, 0) / n;
  let giniNumerator = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      giniNumerator += Math.abs(shares[i] - shares[j]);
    }
  }
  const gini = mean > 0 ? giniNumerator / (2 * n * n * mean) : 0;

  // HHI (Herfindahl–Hirschman Index)
  const hhi = withLiquidity.reduce((s, b) => s + Math.pow(b.shareOfPool * 100, 2), 0);

  // Top bin concentration
  const sorted = [...withLiquidity].sort((a, b) => b.shareOfPool - a.shareOfPool);
  const topBinConcentration = sorted.length > 0 ? sorted[0].shareOfPool : 0;

  let crowdingVerdict: CrowdingProfile["crowdingVerdict"];
  if (gini > 0.6 || hhi > 3000) crowdingVerdict = "HIGHLY_CONCENTRATED";
  else if (gini > 0.35 || hhi > 1500) crowdingVerdict = "MODERATELY_CONCENTRATED";
  else crowdingVerdict = "WELL_DISTRIBUTED";

  return {
    giniCoefficient: Math.round(gini * 1000) / 1000,
    hhi: Math.round(hhi),
    topBinConcentration: Math.round(topBinConcentration * 10000) / 10000,
    binsWithLiquidity: n,
    totalBinsScanned: bins.length,
    crowdingVerdict,
  };
}

function buildAsciiHeatmap(bins: BinCompetition[], activeBinId: number): string {
  const lines: string[] = [];
  lines.push("  Bin Competition Heatmap (density vs opportunity)");
  lines.push("  ─────────────────────────────────────────────────");
  lines.push("  [█ Overcrowded] [▓ Competitive] [▒ Moderate] [░ Underserved] [· Empty]");
  lines.push("");

  const maxLiq = Math.max(...bins.map((b) => b.liquidityUsd), 1);

  for (const bin of bins) {
    const marker = bin.binId === activeBinId ? "→" : " ";
    const distStr = bin.distanceFromActive >= 0
      ? `+${bin.distanceFromActive}`.padStart(4)
      : `${bin.distanceFromActive}`.padStart(4);

    let block: string;
    switch (bin.competitionLevel) {
      case "OVERCROWDED": block = "█"; break;
      case "COMPETITIVE": block = "▓"; break;
      case "MODERATE": block = "▒"; break;
      case "UNDERSERVED": block = "░"; break;
      case "EMPTY": block = "·"; break;
    }

    const barLen = Math.max(0, Math.round((bin.liquidityUsd / maxLiq) * 30));
    const bar = block.repeat(barLen);
    const oppStr = bin.opportunityScore > 0 ? ` opp:${bin.opportunityScore.toFixed(1)}x` : "";
    const liqStr = bin.liquidityUsd > 0 ? ` ${formatUsd(bin.liquidityUsd)}` : "";

    lines.push(`  ${marker}${distStr} │${bar.padEnd(30)}│${liqStr}${oppStr}`);
  }

  lines.push("");
  return lines.join("\n");
}

// ── Command Handlers ────────────────────────────────────────────────────────────

async function runDoctor(): Promise<void> {
  const results: Record<string, string> = {};

  try {
    await fetchJson(`${BFF_APP_BASE}/pools/hodlmm`);
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
    const testResult = await callReadOnly("get-active-bin-id", [uintCV(1)]);
    results["dlmm_contract"] = testResult.result ? "ok" : "no result";
  } catch (e: any) {
    results["dlmm_contract"] = `error: ${e.message}`;
  }

  console.log(
    JSON.stringify({
      tool: "hodlmm-bin-competition",
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
      tool: "hodlmm-bin-competition",
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
      tool: "hodlmm-bin-competition",
      command: "run",
      timestamp: new Date().toISOString(),
      error: "Invalid pool ID — provide a numeric pool ID with --pool",
    }));
    return;
  }

  const pools = await fetchAllPools();
  const pool = pools.find((p) => p.poolId === poolId);

  if (!pool) {
    console.log(JSON.stringify({
      tool: "hodlmm-bin-competition",
      command: "run",
      timestamp: new Date().toISOString(),
      error: `Pool ${poolId} not found or below TVL threshold ($${MIN_TVL_USD})`,
    }));
    return;
  }

  const activeBinId = pool.activeBinId || await getActiveBin(poolId);
  if (!activeBinId) {
    console.log(JSON.stringify({
      tool: "hodlmm-bin-competition",
      command: "run",
      timestamp: new Date().toISOString(),
      error: `Could not determine active bin for pool ${poolId}`,
    }));
    return;
  }

  const rawBins = await fetchBinReserves(poolId, activeBinId, pool);
  const binAnalysis = analyzeBinCompetition(rawBins, activeBinId, pool.tvlUsd, pool.volume24hUsd, pool.feeBps!);
  const crowding = computeCrowdingProfile(binAnalysis);

  // Best opportunities: underserved or moderate bins with high opportunity scores, close to active
  const bestOpportunities = [...binAnalysis]
    .filter((b) => b.opportunityScore > 1.0 && Math.abs(b.distanceFromActive) <= 10)
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, 5);

  // Worst bins: overcrowded with low fee-per-dollar
  const worstBins = [...binAnalysis]
    .filter((b) => b.competitionLevel === "OVERCROWDED" || b.opportunityScore < LOW_OPPORTUNITY_SCORE)
    .sort((a, b) => a.opportunityScore - b.opportunityScore)
    .slice(0, 5);

  const heatmap = buildAsciiHeatmap(binAnalysis, activeBinId);

  // Recommendation
  let recommendation: string;
  if (crowding.crowdingVerdict === "HIGHLY_CONCENTRATED") {
    const bestBin = bestOpportunities[0];
    recommendation = bestBin
      ? `Pool liquidity is highly concentrated — most LPs crowd the same bins. Best opportunity: bin ${bestBin.binId} (${bestBin.distanceFromActive >= 0 ? "+" : ""}${bestBin.distanceFromActive} from active) with ${bestBin.opportunityScore.toFixed(1)}x fee opportunity. Deploying to underserved bins earns more per dollar.`
      : "Pool is highly concentrated around the active bin. All nearby bins are competitive. Consider a wider range to capture asymmetric moves.";
  } else if (crowding.crowdingVerdict === "MODERATELY_CONCENTRATED") {
    recommendation = `Moderate LP competition. ${bestOpportunities.length} bins offer above-average fee opportunity. Avoid the top-concentrated bin (${Math.round(crowding.topBinConcentration * 100)}% of TVL). Spread across ${crowding.binsWithLiquidity > 5 ? "5-8" : "3-5"} bins for diversified fee capture.`;
  } else {
    recommendation = `Liquidity is well-distributed (Gini: ${crowding.giniCoefficient.toFixed(2)}). Competition is even across bins. Focus on bins within +/-3 of active for highest volume exposure. Fee advantage from positioning is minimal — volume drives returns here.`;
  }

  const overcrowded = binAnalysis.filter((b) => b.competitionLevel === "OVERCROWDED").length;
  const underserved = binAnalysis.filter((b) => b.competitionLevel === "UNDERSERVED").length;
  const empty = binAnalysis.filter((b) => b.competitionLevel === "EMPTY").length;

  const out: PoolCompetitionAnalysis = {
    poolId,
    pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
    tvlUsd: Math.round(pool.tvlUsd),
    volume24hUsd: Math.round(pool.volume24hUsd),
    feeBps: pool.feeBps || 30,
    activeBinId,
    bins: binAnalysis,
    crowding,
    bestOpportunities,
    worstBins,
    recommendation,
    asciiHeatmap: heatmap,
  };

  console.log(JSON.stringify({
    tool: "hodlmm-bin-competition",
    command: "run",
    timestamp: new Date().toISOString(),
    ...out,
    summary: {
      overcrowdedBins: overcrowded,
      underservedBins: underserved,
      emptyBins: empty,
      competitiveBins: binAnalysis.filter((b) => b.competitionLevel === "COMPETITIVE").length,
      moderateBins: binAnalysis.filter((b) => b.competitionLevel === "MODERATE").length,
    },
  }, null, 2));
}

async function runScan(options: {
  top?: string;
  minTvl?: string;
  sort?: string;
}): Promise<void> {
  const topN = parseInt(options.top || "10");
  const minTvl = parseFloat(options.minTvl || String(MIN_TVL_USD));
  const sortBy = options.sort || "crowding"; // "crowding" | "opportunity" | "gini"

  const pools = (await fetchAllPools()).filter((p) => p.tvlUsd >= minTvl);

  if (pools.length === 0) {
    console.log(JSON.stringify({
      tool: "hodlmm-bin-competition",
      command: "scan",
      timestamp: new Date().toISOString(),
      error: "No pools found above TVL threshold",
    }));
    return;
  }

  const poolResults: any[] = [];

  for (const pool of pools.slice(0, topN * 2)) {
    try {
      const activeBinId = pool.activeBinId || await getActiveBin(pool.poolId!);
      if (!activeBinId) continue;

      // Lighter scan: fewer bins for bulk mode
      const radius = 10;
      const rawBins: BinReserves[] = [];
      for (let binId = activeBinId - radius; binId <= activeBinId + radius; binId++) {
        try {
          const result = await callReadOnly("get-bin", [uintCV(pool.poolId!), uintCV(binId)]);
          const parsed = parseUintResult(result);
          const ratioX = pool.token0PriceUsd / (pool.token0PriceUsd + pool.token1PriceUsd + 0.001);
          const reserveX = parsed > 0 ? parsed * ratioX : 0;
          const reserveY = parsed > 0 ? parsed * (1 - ratioX) : 0;
          const usdX = (reserveX / Math.pow(10, pool.token0Decimals)) * pool.token0PriceUsd;
          const usdY = (reserveY / Math.pow(10, pool.token1Decimals)) * pool.token1PriceUsd;
          rawBins.push({ binId, reserveX, reserveY, totalUsd: usdX + usdY });
        } catch {
          rawBins.push({ binId, reserveX: 0, reserveY: 0, totalUsd: 0 });
        }
      }

      const binAnalysis = analyzeBinCompetition(rawBins, activeBinId, pool.tvlUsd, pool.volume24hUsd, pool.feeBps!);
      const crowding = computeCrowdingProfile(binAnalysis);

      const bestOpp = [...binAnalysis]
        .filter((b) => b.opportunityScore > 1.0)
        .sort((a, b) => b.opportunityScore - a.opportunityScore)[0];

      poolResults.push({
        poolId: pool.poolId,
        pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
        tvlUsd: Math.round(pool.tvlUsd),
        volume24hUsd: Math.round(pool.volume24hUsd),
        feeBps: pool.feeBps || 30,
        gini: crowding.giniCoefficient,
        hhi: crowding.hhi,
        crowdingVerdict: crowding.crowdingVerdict,
        binsWithLiquidity: crowding.binsWithLiquidity,
        topBinConcentration: crowding.topBinConcentration,
        bestOpportunityBin: bestOpp ? bestOpp.binId : null,
        bestOpportunityScore: bestOpp ? bestOpp.opportunityScore : 0,
        overcrowdedBins: binAnalysis.filter((b) => b.competitionLevel === "OVERCROWDED").length,
        underservedBins: binAnalysis.filter((b) => b.competitionLevel === "UNDERSERVED").length,
      });
    } catch { /* skip pool */ }
  }

  // Sort
  if (sortBy === "opportunity") {
    poolResults.sort((a, b) => b.bestOpportunityScore - a.bestOpportunityScore);
  } else if (sortBy === "gini") {
    poolResults.sort((a, b) => b.gini - a.gini);
  } else {
    // Default: most concentrated first (highest crowding)
    poolResults.sort((a, b) => b.hhi - a.hhi);
  }

  const ranked = poolResults.slice(0, topN);

  const highConc = ranked.filter((p) => p.crowdingVerdict === "HIGHLY_CONCENTRATED").length;
  const modConc = ranked.filter((p) => p.crowdingVerdict === "MODERATELY_CONCENTRATED").length;
  const wellDist = ranked.filter((p) => p.crowdingVerdict === "WELL_DISTRIBUTED").length;

  console.log(JSON.stringify({
    tool: "hodlmm-bin-competition",
    command: "scan",
    timestamp: new Date().toISOString(),
    poolsScanned: poolResults.length,
    sortedBy: sortBy,
    results: ranked,
    summary: {
      highlyConcentrated: highConc,
      moderatelyConcentrated: modConc,
      wellDistributed: wellDist,
      avgGini: ranked.length > 0
        ? Math.round((ranked.reduce((s, p) => s + p.gini, 0) / ranked.length) * 1000) / 1000
        : 0,
      poolsWithOpportunity: ranked.filter((p) => p.bestOpportunityScore >= HIGH_OPPORTUNITY_SCORE).length,
    },
    guidance: highConc > wellDist
      ? "Most pools have concentrated liquidity — look for underserved bins near the active price for above-average fee capture."
      : wellDist > highConc
        ? "Liquidity is generally well-distributed. Positioning advantage is minimal — focus on high-volume pools instead."
        : "Mixed concentration across pools. Run detailed analysis on individual pools to find the best positioning opportunities.",
  }, null, 2));
}

// ── CLI Setup ──────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-bin-competition")
  .description(
    "HODLMM Bin Competition Analyzer — Measures LP competition density within bins to find underserved fee opportunities"
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
  .description("Analyze bin competition for a specific pool")
  .requiredOption("--pool <id>", "HODLMM pool ID")
  .action(runAnalyze);

program
  .command("scan")
  .description("Rank pools by LP competition and opportunity")
  .option("--top <n>", "Number of pools to show", "10")
  .option("--min-tvl <usd>", "Minimum TVL filter", String(MIN_TVL_USD))
  .option("--sort <by>", "Sort by: crowding, opportunity, gini", "crowding")
  .action(runScan);

program.parse();
