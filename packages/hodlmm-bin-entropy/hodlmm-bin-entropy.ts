#!/usr/bin/env bun
/**
 * hodlmm-bin-entropy.ts
 *
 * HODLMM Bin Entropy Analyzer — Measures Shannon entropy of liquidity
 * distribution across bins to quantify how spread or concentrated
 * liquidity is. Entropy provides a more nuanced view than Gini:
 *   - Max entropy = perfectly uniform distribution (every bin equal)
 *   - Zero entropy = all liquidity in a single bin
 *   - Entropy trends reveal if pools are becoming more/less organized
 *
 * Key metrics:
 *  - Shannon entropy (bits) of bin reserve distribution
 *  - Normalized entropy (0-1 scale, 1 = perfectly uniform)
 *  - Effective bin count (2^entropy — how many bins "matter")
 *  - Entropy asymmetry (token X vs token Y distribution divergence)
 *  - KL divergence from ideal uniform distribution
 *  - Distribution classification (CONCENTRATED / CLUSTERED / SPREAD / UNIFORM)
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 59).
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
  shareOfTotal: number;
}

interface EntropyResult {
  shannonBits: number;
  normalizedEntropy: number;
  maxEntropy: number;
  effectiveBinCount: number;
  totalBinsWithLiquidity: number;
  klDivergence: number;
}

interface AsymmetryResult {
  entropyX: EntropyResult;
  entropyY: EntropyResult;
  asymmetryScore: number;
  dominantSide: "X" | "Y" | "balanced";
}

interface EntropyAnalysis {
  pool: string;
  pair: string;
  tvlUsd: number;
  activeBinId: number;
  binsScanned: number;
  binsWithLiquidity: number;
  totalEntropy: EntropyResult;
  asymmetry: AsymmetryResult;
  classification: "CONCENTRATED" | "CLUSTERED" | "SPREAD" | "UNIFORM";
  topBinsConcentration: number;
  binDistribution: BinData[];
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

// ── Shannon Entropy ──────────────────────────────────────────────────────────

function calculateEntropy(values: number[]): EntropyResult {
  const total = values.reduce((s, v) => s + v, 0);
  if (total === 0) {
    return {
      shannonBits: 0,
      normalizedEntropy: 0,
      maxEntropy: 0,
      effectiveBinCount: 0,
      totalBinsWithLiquidity: 0,
      klDivergence: 0,
    };
  }

  const nonZero = values.filter((v) => v > 0);
  const n = nonZero.length;
  if (n <= 1) {
    return {
      shannonBits: 0,
      normalizedEntropy: 0,
      maxEntropy: n > 0 ? Math.log2(n) : 0,
      effectiveBinCount: n,
      totalBinsWithLiquidity: n,
      klDivergence: 0,
    };
  }

  const probs = nonZero.map((v) => v / total);
  const shannonBits = -probs.reduce((s, p) => s + p * Math.log2(p), 0);
  const maxEntropy = Math.log2(n);
  const normalizedEntropy = maxEntropy > 0 ? shannonBits / maxEntropy : 0;
  const effectiveBinCount = Math.pow(2, shannonBits);

  const uniformProb = 1 / n;
  const klDivergence = probs.reduce(
    (s, p) => s + p * Math.log2(p / uniformProb),
    0
  );

  return {
    shannonBits,
    normalizedEntropy,
    maxEntropy,
    effectiveBinCount,
    totalBinsWithLiquidity: n,
    klDivergence: Math.max(0, klDivergence),
  };
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

async function fetchActiveBinId(poolId: number): Promise<number> {
  const url =
    `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-active-bin-id`;
  const body = {
    sender: SENDER,
    arguments: [`0x0100000000000000000000000000000${poolId.toString(16).padStart(3, "0")}`],
  };
  const resp = await fetchJson(url + `?sender=${SENDER}&arguments[]=${body.arguments[0]}`);
  if (resp?.result) {
    const match = resp.result.match(/u(\d+)/);
    if (match) return parseInt(match[1]);
  }
  return 8388608;
}

async function fetchBinReserves(
  poolId: number,
  binId: number,
): Promise<{ reserveX: number; reserveY: number }> {
  const poolHex = `0x0100000000000000000000000000000${poolId.toString(16).padStart(3, "0")}`;
  const binHex = `0x0100000000000000000000000000${binId.toString(16).padStart(6, "0")}`;
  const url =
    `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-bin` +
    `?sender=${SENDER}&arguments[]=${poolHex}&arguments[]=${binHex}`;

  try {
    const resp = await fetchJson(url);
    if (resp?.result) {
      const rxMatch = resp.result.match(/reserve-x\s+u(\d+)/);
      const ryMatch = resp.result.match(/reserve-y\s+u(\d+)/);
      return {
        reserveX: rxMatch ? parseInt(rxMatch[1]) : 0,
        reserveY: ryMatch ? parseInt(ryMatch[1]) : 0,
      };
    }
  } catch {}
  return { reserveX: 0, reserveY: 0 };
}

async function scanBins(
  pool: AppPool,
  activeBinId: number,
  radius: number
): Promise<BinData[]> {
  const bins: BinData[] = [];
  const dec0 = pool.token0Decimals || 6;
  const dec1 = pool.token1Decimals || 6;
  const p0 = pool.token0PriceUsd || 0;
  const p1 = pool.token1PriceUsd || 0;
  const poolId = pool.poolId ?? 1;

  const startBin = activeBinId - radius;
  const endBin = activeBinId + radius;

  const batchSize = 5;
  for (let i = startBin; i <= endBin; i += batchSize) {
    const batch = Array.from(
      { length: Math.min(batchSize, endBin - i + 1) },
      (_, k) => i + k
    );

    const results = await Promise.all(
      batch.map((binId) => fetchBinReserves(poolId, binId))
    );

    for (let k = 0; k < batch.length; k++) {
      const { reserveX, reserveY } = results[k];
      const rx = reserveX / 10 ** dec0;
      const ry = reserveY / 10 ** dec1;
      const totalUsd = rx * p0 + ry * p1;

      bins.push({
        binId: batch[k],
        reserveX: rx,
        reserveY: ry,
        totalUsd,
        shareOfTotal: 0,
      });
    }

    if (i + batchSize <= endBin) await sleep(200);
  }

  const totalLiq = bins.reduce((s, b) => s + b.totalUsd, 0);
  for (const b of bins) {
    b.shareOfTotal = totalLiq > 0 ? b.totalUsd / totalLiq : 0;
  }

  return bins;
}

// ── Analysis ─────────────────────────────────────────────────────────────────

function classifyDistribution(
  normalized: number,
  effectiveBins: number,
  totalBins: number
): "CONCENTRATED" | "CLUSTERED" | "SPREAD" | "UNIFORM" {
  const ratio = totalBins > 0 ? effectiveBins / totalBins : 0;

  if (normalized < 0.3 || ratio < 0.15) return "CONCENTRATED";
  if (normalized < 0.6 || ratio < 0.4) return "CLUSTERED";
  if (normalized < 0.85 || ratio < 0.7) return "SPREAD";
  return "UNIFORM";
}

function analyzeAsymmetry(bins: BinData[]): AsymmetryResult {
  const xValues = bins.map((b) => b.reserveX);
  const yValues = bins.map((b) => b.reserveY);

  const entropyX = calculateEntropy(xValues);
  const entropyY = calculateEntropy(yValues);

  const maxE = Math.max(entropyX.normalizedEntropy, entropyY.normalizedEntropy);
  const minE = Math.min(entropyX.normalizedEntropy, entropyY.normalizedEntropy);
  const asymmetryScore = maxE > 0 ? (maxE - minE) / maxE : 0;

  let dominantSide: "X" | "Y" | "balanced" = "balanced";
  if (asymmetryScore > 0.15) {
    dominantSide = entropyX.normalizedEntropy > entropyY.normalizedEntropy ? "X" : "Y";
  }

  return { entropyX, entropyY, asymmetryScore, dominantSide };
}

function topBinsConcentration(bins: BinData[], count: number = 3): number {
  const sorted = [...bins].sort((a, b) => b.totalUsd - a.totalUsd);
  const total = bins.reduce((s, b) => s + b.totalUsd, 0);
  if (total === 0) return 0;
  const topSum = sorted.slice(0, count).reduce((s, b) => s + b.totalUsd, 0);
  return topSum / total;
}

function generateVerdict(analysis: EntropyAnalysis): string {
  const { classification, totalEntropy, asymmetry, topBinsConcentration: topConc } = analysis;

  const lines: string[] = [];

  switch (classification) {
    case "CONCENTRATED":
      lines.push(
        `Liquidity is highly concentrated — only ${totalEntropy.effectiveBinCount.toFixed(1)} effective bins ` +
        `out of ${totalEntropy.totalBinsWithLiquidity} with reserves. Top 3 bins hold ${fmtPct(topConc)} of all liquidity.`
      );
      lines.push("This increases IL risk from sudden price moves outside the narrow range.");
      break;
    case "CLUSTERED":
      lines.push(
        `Liquidity is clustered around a subset of bins — ${totalEntropy.effectiveBinCount.toFixed(1)} effective bins ` +
        `(normalized entropy: ${totalEntropy.normalizedEntropy.toFixed(3)}).`
      );
      lines.push("Moderate concentration; typical for actively managed DLMM pools.");
      break;
    case "SPREAD":
      lines.push(
        `Liquidity is well-spread across ${totalEntropy.effectiveBinCount.toFixed(1)} effective bins ` +
        `(entropy: ${totalEntropy.shannonBits.toFixed(2)} bits, ${fmtPct(totalEntropy.normalizedEntropy)} of max).`
      );
      lines.push("Good diversification; trades across a wide range without large gaps.");
      break;
    case "UNIFORM":
      lines.push(
        `Near-uniform liquidity distribution (${fmtPct(totalEntropy.normalizedEntropy)} normalized entropy). ` +
        `${totalEntropy.effectiveBinCount.toFixed(1)} effective bins across ${totalEntropy.totalBinsWithLiquidity} occupied bins.`
      );
      lines.push("Capital may be inefficiently spread — most DLMM strategies benefit from some concentration.");
      break;
  }

  if (asymmetry.asymmetryScore > 0.3) {
    const side = asymmetry.dominantSide === "X" ? analysis.pair.split("-")[0] : analysis.pair.split("-")[1];
    lines.push(
      `Notable asymmetry: ${side ?? asymmetry.dominantSide} reserves are more evenly spread ` +
      `(asymmetry score: ${asymmetry.asymmetryScore.toFixed(2)}). May indicate directional pressure.`
    );
  }

  if (totalEntropy.klDivergence > 1.0) {
    lines.push(
      `KL divergence from uniform: ${totalEntropy.klDivergence.toFixed(3)} bits — ` +
      `significant departure from even distribution.`
    );
  }

  return lines.join(" ");
}

// ── Display ──────────────────────────────────────────────────────────────────

function displayAnalysis(analysis: EntropyAnalysis, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(analysis, null, 2));
    return;
  }

  const { totalEntropy: te, asymmetry: asym } = analysis;

  console.log(`\n${"═".repeat(70)}`);
  console.log(`  HODLMM BIN ENTROPY ANALYZER`);
  console.log(`${"═".repeat(70)}`);

  console.log(`\n  Pool:           ${analysis.pool}`);
  console.log(`  Pair:           ${analysis.pair}`);
  console.log(`  TVL:            ${fmtUsd(analysis.tvlUsd)}`);
  console.log(`  Active Bin:     ${analysis.activeBinId}`);
  console.log(`  Bins Scanned:   ${analysis.binsScanned}`);
  console.log(`  Bins w/ Liq:    ${te.totalBinsWithLiquidity}`);

  console.log(`\n${"─".repeat(70)}`);
  console.log(`  ENTROPY METRICS`);
  console.log(`${"─".repeat(70)}`);

  console.log(`  Shannon Entropy:      ${te.shannonBits.toFixed(3)} bits`);
  console.log(`  Max Possible:         ${te.maxEntropy.toFixed(3)} bits`);
  console.log(`  Normalized (0-1):     ${te.normalizedEntropy.toFixed(3)} ${barChart(te.normalizedEntropy, 1, 15)}`);
  console.log(`  Effective Bins:       ${te.effectiveBinCount.toFixed(1)} / ${te.totalBinsWithLiquidity}`);
  console.log(`  KL Divergence:        ${te.klDivergence.toFixed(3)} bits`);
  console.log(`  Top-3 Concentration:  ${fmtPct(analysis.topBinsConcentration)}`);
  console.log(`  Classification:       ${analysis.classification}`);

  console.log(`\n${"─".repeat(70)}`);
  console.log(`  TOKEN ASYMMETRY`);
  console.log(`${"─".repeat(70)}`);

  const t0 = analysis.pair.split("-")[0] || "X";
  const t1 = analysis.pair.split("-")[1] || "Y";

  console.log(`  ${t0} Entropy:   ${asym.entropyX.shannonBits.toFixed(3)} bits (norm: ${asym.entropyX.normalizedEntropy.toFixed(3)})`);
  console.log(`  ${t1} Entropy:   ${asym.entropyY.shannonBits.toFixed(3)} bits (norm: ${asym.entropyY.normalizedEntropy.toFixed(3)})`);
  console.log(`  Asymmetry:        ${asym.asymmetryScore.toFixed(3)} ${asym.dominantSide !== "balanced" ? `(${asym.dominantSide} more spread)` : "(balanced)"}`);

  // ASCII entropy heatmap
  console.log(`\n${"─".repeat(70)}`);
  console.log(`  BIN LIQUIDITY HEATMAP (by share of total)`);
  console.log(`${"─".repeat(70)}`);

  const withLiq = analysis.binDistribution.filter((b) => b.totalUsd > 0.01);
  if (withLiq.length > 0) {
    const maxShare = Math.max(...withLiq.map((b) => b.shareOfTotal));
    const displayBins = withLiq.slice(0, 40);

    for (const bin of displayBins) {
      const marker = bin.binId === analysis.activeBinId ? "→" : " ";
      const shareBar = barChart(bin.shareOfTotal, maxShare, 25);
      console.log(
        `  ${marker} Bin ${String(bin.binId).padStart(8)} │ ${shareBar} │ ${fmtPct(bin.shareOfTotal).padStart(6)} │ ${fmtUsd(bin.totalUsd).padStart(10)}`
      );
    }

    if (withLiq.length > 40) {
      console.log(`  ... and ${withLiq.length - 40} more bins with liquidity`);
    }
  } else {
    console.log("  No bins with liquidity found in scan range.");
  }

  console.log(`\n${"─".repeat(70)}`);
  console.log(`  VERDICT`);
  console.log(`${"─".repeat(70)}`);
  console.log(`  ${analysis.verdict}`);
  console.log(`\n${"═".repeat(70)}\n`);
}

// ── Scan All Pools ───────────────────────────────────────────────────────────

async function displayPoolRankings(pools: AppPool[], json: boolean): Promise<void> {
  console.log("\nScanning pool entropy rankings...\n");

  const results: {
    pair: string;
    tvlUsd: number;
    normalizedEntropy: number;
    effectiveBins: number;
    classification: string;
  }[] = [];

  for (const pool of pools.slice(0, 15)) {
    try {
      const activeBinId = pool.activeBinId ?? (await fetchActiveBinId(pool.poolId ?? 1));
      const bins = await scanBins(pool, activeBinId, 20);
      const totalValues = bins.map((b) => b.totalUsd);
      const entropy = calculateEntropy(totalValues);
      const classification = classifyDistribution(
        entropy.normalizedEntropy,
        entropy.effectiveBinCount,
        entropy.totalBinsWithLiquidity
      );

      results.push({
        pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
        tvlUsd: pool.tvlUsd,
        normalizedEntropy: entropy.normalizedEntropy,
        effectiveBins: entropy.effectiveBinCount,
        classification,
      });
    } catch {
      // skip failed pools
    }

    await sleep(500);
  }

  if (json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  results.sort((a, b) => b.normalizedEntropy - a.normalizedEntropy);

  console.log(`${"═".repeat(70)}`);
  console.log(`  HODLMM POOL ENTROPY RANKINGS`);
  console.log(`${"═".repeat(70)}`);
  console.log(
    `  ${"Pair".padEnd(18)} ${"TVL".padStart(10)} ${"Entropy".padStart(9)} ${"Eff.Bins".padStart(9)} ${"Class".padStart(14)}`
  );
  console.log(`  ${"─".repeat(62)}`);

  for (const r of results) {
    console.log(
      `  ${r.pair.padEnd(18)} ${fmtUsd(r.tvlUsd).padStart(10)} ${r.normalizedEntropy.toFixed(3).padStart(9)} ` +
      `${r.effectiveBins.toFixed(1).padStart(9)} ${r.classification.padStart(14)}`
    );
  }

  console.log(`\n  ${results.length} pools ranked by normalized entropy (higher = more evenly spread)`);
  console.log(`${"═".repeat(70)}\n`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

const program = new Command();
program
  .name("hodlmm-bin-entropy")
  .description(
    "Shannon entropy analysis of HODLMM bin liquidity distribution. " +
    "Measures how concentrated or uniform liquidity is spread across bins, " +
    "identifies effective bin counts, token asymmetry, and KL divergence from ideal."
  )
  .argument("[pool]", "Pool ID or token pair (e.g. STX-sBTC). Omit to rank all pools.")
  .option("--radius <n>", "Number of bins to scan on each side of active bin", "30")
  .option("--json", "Output in JSON format", false)
  .action(async (poolQuery?: string) => {
    const opts = program.opts();
    const radius = parseInt(opts.radius) || BIN_SCAN_RADIUS;
    const jsonOutput = opts.json;

    try {
      const pools = await fetchPools();
      if (pools.length === 0) {
        console.error("No HODLMM pools found with sufficient TVL.");
        process.exit(1);
      }

      if (!poolQuery) {
        await displayPoolRankings(pools, jsonOutput);
        return;
      }

      const pool = findPool(poolQuery, pools);
      if (!pool) {
        console.error(`Pool "${poolQuery}" not found. Available pools:`);
        for (const p of pools.slice(0, 10)) {
          console.error(`  ${p.token0Symbol}-${p.token1Symbol} (${fmtUsd(p.tvlUsd)})`);
        }
        process.exit(1);
      }

      const pair = `${pool.token0Symbol}-${pool.token1Symbol}`;
      console.log(`\nAnalyzing bin entropy for ${pair}...`);

      const activeBinId = pool.activeBinId ?? (await fetchActiveBinId(pool.poolId ?? 1));
      const bins = await scanBins(pool, activeBinId, radius);
      const totalValues = bins.map((b) => b.totalUsd);
      const totalEntropy = calculateEntropy(totalValues);
      const asymmetry = analyzeAsymmetry(bins);
      const classification = classifyDistribution(
        totalEntropy.normalizedEntropy,
        totalEntropy.effectiveBinCount,
        totalEntropy.totalBinsWithLiquidity
      );
      const topConc = topBinsConcentration(bins, 3);

      const analysis: EntropyAnalysis = {
        pool: pool.id,
        pair,
        tvlUsd: pool.tvlUsd,
        activeBinId,
        binsScanned: bins.length,
        binsWithLiquidity: bins.filter((b) => b.totalUsd > 0.01).length,
        totalEntropy,
        asymmetry,
        classification,
        topBinsConcentration: topConc,
        binDistribution: bins,
        verdict: "",
      };

      analysis.verdict = generateVerdict(analysis);
      displayAnalysis(analysis, jsonOutput);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
