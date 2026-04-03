#!/usr/bin/env bun
/**
 * hodlmm-liquidity-heatmap.ts
 *
 * HODLMM Liquidity Heatmap — bin-level liquidity distribution profiler.
 * Maps reserve concentration across the full bin range, identifies clusters,
 * gaps, walls, and distribution shape for HODLMM concentrated LP pools.
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 35).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const BFF_POOLS_URL = "https://bff.bitflowapis.finance/api/app/v1/pools";
const MIN_TVL_USD = 1000;

// Scan up to this many token IDs for bin balances
const MAX_BIN_SCAN = 500;
// Stop scanning after this many consecutive empty bins
const EMPTY_STREAK_LIMIT = 50;

// Heatmap intensity thresholds (fraction of max bin)
const HEAT_LEVELS = [
  { threshold: 0.80, label: "WALL", symbol: "█" },
  { threshold: 0.50, label: "HOT", symbol: "▓" },
  { threshold: 0.25, label: "WARM", symbol: "▒" },
  { threshold: 0.05, label: "COOL", symbol: "░" },
  { threshold: 0.00, label: "EMPTY", symbol: "·" },
] as const;

// ── Types ──────────────────────────────────────────────────────────────────────

interface PoolInfo {
  poolId: string;
  poolContract: string;
  contractAddr: string;
  contractName: string;
  tokenXSymbol: string;
  tokenYSymbol: string;
  tokenXDecimals: number;
  tokenYDecimals: number;
  tokenXPriceUsd: number;
  tokenYPriceUsd: number;
  tvlUsd: number;
  volume24hUsd: number;
  binStep: number;
}

interface BinData {
  tokenId: number;
  xBalance: number;
  yBalance: number;
  binShares: number;
  xUsd: number;
  yUsd: number;
  totalUsd: number;
  intensity: number;
  heatLevel: string;
  symbol: string;
}

type DistributionShape = "UNIFORM" | "CONCENTRATED" | "BIMODAL" | "LEFT_SKEWED" | "RIGHT_SKEWED" | "SPARSE";

interface LiquidityCluster {
  startId: number;
  endId: number;
  width: number;
  totalUsd: number;
  peakId: number;
  peakUsd: number;
  pctOfTotal: number;
}

interface LiquidityGap {
  startId: number;
  endId: number;
  width: number;
}

interface LiquidityWall {
  tokenId: number;
  totalUsd: number;
  pctOfTotal: number;
  dominant: "X" | "Y" | "MIXED";
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<any> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`);
  return resp.json();
}

function uintCV(n: number): string {
  const hex = n.toString(16).padStart(32, "0");
  return `0x01${hex}`;
}

function parseUint128Hex(hex: string): number {
  // Parse a 32-char hex string as uint128
  // For values that fit in JS number safely
  return parseInt(hex, 16) || 0;
}

function parseBinBalancesResult(result: string): { binShares: number; xBalance: number; yBalance: number } | null {
  // Result format: 0x07 0c 00000003 [field1] [field2] [field3]
  // Each field: length-prefixed name (0a + "bin-shares", etc.) + type byte (01=uint128) + 16-byte value
  const hex = result.replace("0x", "");
  if (!hex.startsWith("070c")) return null;

  try {
    // Find the three uint128 values after their field names
    // bin-shares, x-balance, y-balance
    // Each field name is preceded by its length byte
    // After the name comes 01 (uint128 type) + 32 hex chars of value

    const values: number[] = [];
    let pos = 12; // skip "070c00000003"

    for (let i = 0; i < 3; i++) {
      // Read name length
      const nameLen = parseInt(hex.slice(pos, pos + 2), 16);
      pos += 2;
      // Skip name
      pos += nameLen * 2;
      // Read type byte (should be 01 for uint128)
      const typeByte = hex.slice(pos, pos + 2);
      pos += 2;
      if (typeByte === "01") {
        const valHex = hex.slice(pos, pos + 32);
        values.push(parseUint128Hex(valHex));
        pos += 32;
      } else {
        values.push(0);
        pos += 32; // skip anyway
      }
    }

    return { binShares: values[0], xBalance: values[1], yBalance: values[2] };
  } catch {
    return null;
  }
}

function classifyHeat(intensity: number): { label: string; symbol: string } {
  for (const level of HEAT_LEVELS) {
    if (intensity >= level.threshold) return { label: level.label, symbol: level.symbol };
  }
  return { label: "EMPTY", symbol: "·" };
}

// ── Pool Data ──────────────────────────────────────────────────────────────────

async function fetchAllPools(): Promise<PoolInfo[]> {
  const data = await fetchJson(BFF_POOLS_URL);
  const raw: any[] = data?.data || data?.pools || data || [];
  return raw
    .filter((p: any) => (p.types || []).includes("DLMM"))
    .map((p: any) => {
      const tx = p.tokens?.tokenX || {};
      const ty = p.tokens?.tokenY || {};
      const contract = p.poolContract || "";
      const [addr, name] = contract.split(".");
      return {
        poolId: p.poolId ?? "?",
        poolContract: contract,
        contractAddr: addr || "",
        contractName: name || "",
        tokenXSymbol: tx.symbol ?? "?",
        tokenYSymbol: ty.symbol ?? "?",
        tokenXDecimals: parseInt(tx.decimals ?? "6"),
        tokenYDecimals: parseInt(ty.decimals ?? "6"),
        tokenXPriceUsd: parseFloat(tx.priceUsd ?? "0"),
        tokenYPriceUsd: parseFloat(ty.priceUsd ?? "0"),
        tvlUsd: parseFloat(p.tvlUsd ?? "0"),
        volume24hUsd: parseFloat(p.volumeUsd1d ?? "0"),
        binStep: parseFloat(p.binStep ?? "10"),
      };
    })
    .filter((p) => p.tvlUsd >= MIN_TVL_USD && p.contractAddr && p.contractName);
}

async function callPoolReadOnly(pool: PoolInfo, fn: string, args: string[]): Promise<any> {
  const url = `${HIRO_API}/v2/contracts/call-read/${pool.contractAddr}/${pool.contractName}/${fn}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sender: pool.contractAddr, arguments: args }),
  });
  if (!resp.ok) throw new Error(`Contract call ${fn} failed: HTTP ${resp.status}`);
  return resp.json();
}

async function scanBinBalances(pool: PoolInfo, maxBins: number): Promise<BinData[]> {
  const bins: BinData[] = [];
  let emptyStreak = 0;

  for (let tokenId = 1; tokenId <= maxBins; tokenId++) {
    try {
      const result = await callPoolReadOnly(pool, "get-bin-balances", [uintCV(tokenId)]);
      if (!result?.result) continue;

      const parsed = parseBinBalancesResult(result.result);
      if (!parsed) continue;

      const { binShares, xBalance, yBalance } = parsed;
      if (xBalance === 0 && yBalance === 0) {
        emptyStreak++;
        if (emptyStreak >= EMPTY_STREAK_LIMIT && bins.length > 0) break;
        continue;
      }

      emptyStreak = 0;
      const xUsd = (xBalance / Math.pow(10, pool.tokenXDecimals)) * pool.tokenXPriceUsd;
      const yUsd = (yBalance / Math.pow(10, pool.tokenYDecimals)) * pool.tokenYPriceUsd;

      bins.push({
        tokenId,
        xBalance,
        yBalance,
        binShares,
        xUsd,
        yUsd,
        totalUsd: xUsd + yUsd,
        intensity: 0,
        heatLevel: "EMPTY",
        symbol: "·",
      });
    } catch {
      emptyStreak++;
      if (emptyStreak >= EMPTY_STREAK_LIMIT && bins.length > 0) break;
    }
  }

  // Normalize intensities
  const maxUsd = Math.max(...bins.map((b) => b.totalUsd), 1);
  for (const b of bins) {
    b.intensity = b.totalUsd / maxUsd;
    const heat = classifyHeat(b.intensity);
    b.heatLevel = heat.label;
    b.symbol = heat.symbol;
  }

  return bins;
}

// ── Distribution Analysis ──────────────────────────────────────────────────────

function detectClusters(bins: BinData[]): LiquidityCluster[] {
  if (bins.length === 0) return [];
  const totalUsd = bins.reduce((s, b) => s + b.totalUsd, 0);
  if (totalUsd === 0) return [];

  // Group consecutive bins (allowing small gaps of 1)
  const clusters: LiquidityCluster[] = [];
  let clusterBins: BinData[] = [bins[0]];

  for (let i = 1; i < bins.length; i++) {
    const gap = bins[i].tokenId - bins[i - 1].tokenId;
    if (gap <= 2) {
      clusterBins.push(bins[i]);
    } else {
      if (clusterBins.length >= 2) {
        const cTotal = clusterBins.reduce((s, b) => s + b.totalUsd, 0);
        const peak = clusterBins.reduce((max, b) => (b.totalUsd > max.totalUsd ? b : max), clusterBins[0]);
        clusters.push({
          startId: clusterBins[0].tokenId,
          endId: clusterBins[clusterBins.length - 1].tokenId,
          width: clusterBins.length,
          totalUsd: cTotal,
          peakId: peak.tokenId,
          peakUsd: peak.totalUsd,
          pctOfTotal: Math.round((cTotal / totalUsd) * 100),
        });
      }
      clusterBins = [bins[i]];
    }
  }
  // Final cluster
  if (clusterBins.length >= 2) {
    const cTotal = clusterBins.reduce((s, b) => s + b.totalUsd, 0);
    const peak = clusterBins.reduce((max, b) => (b.totalUsd > max.totalUsd ? b : max), clusterBins[0]);
    clusters.push({
      startId: clusterBins[0].tokenId,
      endId: clusterBins[clusterBins.length - 1].tokenId,
      width: clusterBins.length,
      totalUsd: cTotal,
      peakId: peak.tokenId,
      peakUsd: peak.totalUsd,
      pctOfTotal: Math.round((cTotal / totalUsd) * 100),
    });
  }

  return clusters.sort((a, b) => b.totalUsd - a.totalUsd);
}

function detectGaps(bins: BinData[]): LiquidityGap[] {
  const gaps: LiquidityGap[] = [];
  if (bins.length < 2) return gaps;

  for (let i = 1; i < bins.length; i++) {
    const gap = bins[i].tokenId - bins[i - 1].tokenId;
    if (gap > 2) {
      gaps.push({
        startId: bins[i - 1].tokenId + 1,
        endId: bins[i].tokenId - 1,
        width: gap - 1,
      });
    }
  }
  return gaps.sort((a, b) => b.width - a.width);
}

function detectWalls(bins: BinData[]): LiquidityWall[] {
  const totalUsd = bins.reduce((s, b) => s + b.totalUsd, 0);
  if (totalUsd === 0) return [];

  const threshold = totalUsd * 0.10; // bins holding >10% = wall
  return bins
    .filter((b) => b.totalUsd >= threshold)
    .map((b) => ({
      tokenId: b.tokenId,
      totalUsd: b.totalUsd,
      pctOfTotal: Math.round((b.totalUsd / totalUsd) * 100),
      dominant: b.xUsd > b.yUsd * 2 ? ("X" as const) : b.yUsd > b.xUsd * 2 ? ("Y" as const) : ("MIXED" as const),
    }))
    .sort((a, b) => b.totalUsd - a.totalUsd);
}

function classifyDistribution(bins: BinData[]): DistributionShape {
  if (bins.length < 3) return "SPARSE";

  const totalUsd = bins.reduce((s, b) => s + b.totalUsd, 0);
  const sorted = [...bins].sort((a, b) => b.totalUsd - a.totalUsd);

  // Check concentration
  const top3Share = sorted.slice(0, 3).reduce((s, b) => s + b.totalUsd, 0) / totalUsd;
  if (top3Share > 0.6 && bins.length <= 5) return "CONCENTRATED";

  // Check bimodal
  const clusters = detectClusters(bins);
  if (clusters.length >= 2 && clusters[0].pctOfTotal > 20 && clusters[1].pctOfTotal > 20) {
    return "BIMODAL";
  }

  // Check skew: compare first half vs second half
  const mid = Math.floor(bins.length / 2);
  const firstHalf = bins.slice(0, mid).reduce((s, b) => s + b.totalUsd, 0);
  const secondHalf = bins.slice(mid).reduce((s, b) => s + b.totalUsd, 0);
  const skewRatio = totalUsd > 0 ? (secondHalf - firstHalf) / totalUsd : 0;

  if (skewRatio > 0.3) return "RIGHT_SKEWED";
  if (skewRatio < -0.3) return "LEFT_SKEWED";

  // Check uniformity
  const mean = totalUsd / bins.length;
  const variance = bins.reduce((s, b) => s + Math.pow(b.totalUsd - mean, 2), 0) / bins.length;
  const cv = Math.sqrt(variance) / (mean + 0.001);
  if (cv < 0.5) return "UNIFORM";

  return "CONCENTRATED";
}

// Build full heatmap string including gaps
function buildHeatmapString(bins: BinData[]): string {
  if (bins.length === 0) return "";
  const chars: string[] = [];
  for (let i = 0; i < bins.length; i++) {
    if (i > 0) {
      const gap = bins[i].tokenId - bins[i - 1].tokenId;
      if (gap > 1) {
        // Insert empty markers for gaps (max 5 dots for readability)
        const dots = Math.min(gap - 1, 5);
        for (let j = 0; j < dots; j++) chars.push("·");
      }
    }
    chars.push(bins[i].symbol);
  }
  return chars.join("");
}

// ── Commands ───────────────────────────────────────────────────────────────────

async function doctor(): Promise<void> {
  const out: any = {
    tool: "hodlmm-liquidity-heatmap",
    command: "doctor",
    timestamp: new Date().toISOString(),
    checks: {},
  };
  try {
    const pools = await fetchAllPools();
    out.checks.bitflow = `ok (${pools.length} DLMM pools)`;
  } catch (e: any) {
    out.checks.bitflow = `FAIL: ${e.message}`;
  }
  try {
    await fetchJson(`${HIRO_API}/v2/info`);
    out.checks.hiro = "ok";
  } catch (e: any) {
    out.checks.hiro = `FAIL: ${e.message}`;
  }
  out.status = !out.checks.bitflow?.startsWith("FAIL") && out.checks.hiro === "ok" ? "healthy" : "degraded";
  console.log(JSON.stringify(out, null, 2));
}

async function run(poolIdArg: string): Promise<void> {
  const pools = await fetchAllPools();

  // Match by dlmm_N format or numeric ID
  const pool = pools.find(
    (p) => p.poolId === poolIdArg || p.poolId === `dlmm_${poolIdArg}` || p.poolId.endsWith(`_${poolIdArg}`)
  );

  if (!pool) {
    console.log(
      JSON.stringify({
        tool: "hodlmm-liquidity-heatmap",
        command: "run",
        timestamp: new Date().toISOString(),
        error: `Pool ${poolIdArg} not found. Available: ${pools.map((p) => p.poolId).join(", ")}`,
      })
    );
    return;
  }

  // Get active bin ID from pool contract
  let activeBinId: number | null = null;
  try {
    const abResult = await callPoolReadOnly(pool, "get-active-bin-id", []);
    if (abResult?.result) {
      const hex = abResult.result.replace("0x", "");
      // 07 = ok, 00 = int128, then 32 hex chars
      if (hex.startsWith("0700")) {
        const valHex = hex.slice(4);
        const raw = BigInt("0x" + valHex);
        const maxInt = BigInt(1) << BigInt(127);
        activeBinId = raw >= maxInt ? Number(raw - (BigInt(1) << BigInt(128))) : Number(raw);
      }
    }
  } catch {
    // Active bin not critical for heatmap
  }

  // Scan bin balances
  const bins = await scanBinBalances(pool, MAX_BIN_SCAN);

  if (bins.length === 0) {
    console.log(
      JSON.stringify({
        tool: "hodlmm-liquidity-heatmap",
        command: "run",
        timestamp: new Date().toISOString(),
        poolId: pool.poolId,
        pair: `${pool.tokenXSymbol}-${pool.tokenYSymbol}`,
        error: "No bins with liquidity found in scan range",
      })
    );
    return;
  }

  const totalUsd = bins.reduce((s, b) => s + b.totalUsd, 0);
  const totalXUsd = bins.reduce((s, b) => s + b.xUsd, 0);
  const totalYUsd = bins.reduce((s, b) => s + b.yUsd, 0);

  // Build heatmap
  const heatmap = buildHeatmapString(bins);

  // Distribution analysis
  const clusters = detectClusters(bins);
  const gaps = detectGaps(bins);
  const walls = detectWalls(bins);
  const shape = classifyDistribution(bins);

  // Concentration metrics
  const sorted = [...bins].sort((a, b) => b.totalUsd - a.totalUsd);
  const top1Pct = sorted.length > 0 ? Math.round((sorted[0].totalUsd / totalUsd) * 100) : 0;
  const top3Pct = Math.round((sorted.slice(0, 3).reduce((s, b) => s + b.totalUsd, 0) / totalUsd) * 100);
  const top5Pct = Math.round((sorted.slice(0, 5).reduce((s, b) => s + b.totalUsd, 0) / totalUsd) * 100);

  // Token balance split
  const xPct = Math.round((totalXUsd / (totalUsd + 0.01)) * 100);
  const yPct = 100 - xPct;

  // Top bins detail
  const topBins = sorted.slice(0, 10).map((b) => ({
    tokenId: b.tokenId,
    totalUsd: Math.round(b.totalUsd),
    xUsd: Math.round(b.xUsd),
    yUsd: Math.round(b.yUsd),
    pctOfTotal: Math.round((b.totalUsd / totalUsd) * 100),
    heatLevel: b.heatLevel,
  }));

  const out = {
    tool: "hodlmm-liquidity-heatmap",
    command: "run",
    timestamp: new Date().toISOString(),
    poolId: pool.poolId,
    pair: `${pool.tokenXSymbol}-${pool.tokenYSymbol}`,
    tvlUsd: Math.round(pool.tvlUsd),
    activeBinId,
    binStep: pool.binStep,
    heatmap,
    heatmapLegend: "█=WALL(80%+) ▓=HOT(50%+) ▒=WARM(25%+) ░=COOL(5%+) ·=EMPTY",
    distribution: {
      shape,
      binsWithLiquidity: bins.length,
      tokenIdRange: { first: bins[0].tokenId, last: bins[bins.length - 1].tokenId },
      span: bins[bins.length - 1].tokenId - bins[0].tokenId + 1,
    },
    concentration: {
      top1BinPct: top1Pct,
      top3BinsPct: top3Pct,
      top5BinsPct: top5Pct,
      peakBin: sorted.length > 0
        ? { tokenId: sorted[0].tokenId, usd: Math.round(sorted[0].totalUsd) }
        : null,
    },
    tokenBalance: {
      xSymbol: pool.tokenXSymbol,
      ySymbol: pool.tokenYSymbol,
      xPct,
      yPct,
      totalXUsd: Math.round(totalXUsd),
      totalYUsd: Math.round(totalYUsd),
      totalUsd: Math.round(totalUsd),
    },
    clusters: clusters.slice(0, 5),
    gaps: gaps.slice(0, 5),
    walls: walls.slice(0, 5),
    topBins,
  };

  console.log(JSON.stringify(out, null, 2));
}

async function scan(opts: { top: string; minTvl: string }): Promise<void> {
  const topN = parseInt(opts.top) || 10;
  const minTvl = parseFloat(opts.minTvl) || MIN_TVL_USD;

  const pools = (await fetchAllPools()).filter((p) => p.tvlUsd >= minTvl);
  if (pools.length === 0) {
    console.log(
      JSON.stringify({
        tool: "hodlmm-liquidity-heatmap",
        command: "scan",
        timestamp: new Date().toISOString(),
        error: "No pools found above TVL threshold",
      })
    );
    return;
  }

  const results: any[] = [];
  for (const pool of pools.slice(0, topN)) {
    try {
      // Lighter scan — fewer bins
      const bins = await scanBinBalances(pool, 100);
      if (bins.length === 0) continue;

      const totalUsd = bins.reduce((s, b) => s + b.totalUsd, 0);
      const shape = classifyDistribution(bins);
      const heatmap = buildHeatmapString(bins);
      const sorted = [...bins].sort((a, b) => b.totalUsd - a.totalUsd);
      const top3Pct = Math.round((sorted.slice(0, 3).reduce((s, b) => s + b.totalUsd, 0) / totalUsd) * 100);

      results.push({
        poolId: pool.poolId,
        pair: `${pool.tokenXSymbol}-${pool.tokenYSymbol}`,
        tvlUsd: Math.round(pool.tvlUsd),
        heatmap,
        shape,
        binsWithLiquidity: bins.length,
        top3Concentration: top3Pct,
      });
    } catch {
      /* skip */
    }
  }

  console.log(
    JSON.stringify(
      {
        tool: "hodlmm-liquidity-heatmap",
        command: "scan",
        timestamp: new Date().toISOString(),
        poolsScanned: results.length,
        results,
        summary: {
          shapes: Object.entries(
            results.reduce(
              (acc: Record<string, number>, r) => {
                acc[r.shape] = (acc[r.shape] || 0) + 1;
                return acc;
              },
              {}
            )
          ).map(([shape, count]) => ({ shape, count })),
        },
      },
      null,
      2
    )
  );
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const program = new Command();
program
  .name("hodlmm-liquidity-heatmap")
  .description("Bin-level liquidity distribution profiler for HODLMM pools")
  .version("1.0.0");

program.command("doctor").description("Check API connectivity").action(doctor);
program
  .command("install-packs")
  .description("No extra deps needed")
  .action(() => {
    console.log(
      JSON.stringify({
        tool: "hodlmm-liquidity-heatmap",
        command: "install-packs",
        timestamp: new Date().toISOString(),
        message: "No additional packages required. Uses workspace commander + native fetch.",
      })
    );
  });

program
  .command("run")
  .description("Full liquidity heatmap for a specific pool")
  .requiredOption("--pool <id>", "HODLMM pool ID (e.g. 3 or dlmm_3)")
  .action((opts) => run(opts.pool));

program
  .command("scan")
  .description("Compare liquidity distribution across pools")
  .option("--top <n>", "Number of pools to show", "10")
  .option("--min-tvl <usd>", "Minimum TVL filter", String(MIN_TVL_USD))
  .action(scan);

program.parse();
