#!/usr/bin/env bun
/**
 * hodlmm-bin-anisotropy.ts — Day 124 cocoa007 Bitflow Skills Comp
 *
 * Bin anisotropy analyzer — measures directional dependence of liquidity properties.
 * In physics, anisotropy means properties vary by direction. Applied to DLMM bins:
 * buy-side vs sell-side depth, gradient asymmetry, directional elasticity,
 * reserve decay rates, and composite isotropy scoring.
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 30;
const MIN_POPULATED_BINS = 5;

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
  reserveXUsd: number;
  reserveYUsd: number;
  totalUsd: number;
}

interface DirectionalProfile {
  direction: string;
  binCount: number;
  totalUsd: number;
  meanUsd: number;
  maxUsd: number;
  gradient: number;
  decayRate: number;
  depthAt5: number;
  depthAt10: number;
  depthAt20: number;
  gapCount: number;
  longestGap: number;
}

interface AnisotropyProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsAnalyzed: number;
  anisotropyIndex: number;
  anisotropyClass: string;
  dominantDirection: string;
  buySide: DirectionalProfile;
  sellSide: DirectionalProfile;
  depthRatio: number;
  gradientRatio: number;
  decayAsymmetry: number;
  gapAsymmetry: number;
  elasticityBuy: number;
  elasticitySell: number;
  elasticityRatio: number;
  directionalBias: number;
  isotropyScore: number;
  tvlUsd: number;
  volume24hUsd: number;
}

// --- API helpers ---

async function fetchPools(): Promise<AppPool[]> {
  const res = await fetch(`${BFF_APP_BASE}/pools`);
  if (!res.ok) throw new Error(`BFF pools API: ${res.status}`);
  const body = (await res.json()) as any;
  const raw = body.data?.pools ?? body.data ?? body.pools ?? body ?? [];
  const list: any[] = Array.isArray(raw) ? raw : [];

  const pools: AppPool[] = list.map((p: any) => {
    const idStr: string = p.poolId ?? p.id ?? "";
    const numMatch = idStr.match(/(\d+)/);
    const numericId = numMatch ? parseInt(numMatch[1], 10) : undefined;
    const tx = p.tokens?.tokenX ?? {};
    const ty = p.tokens?.tokenY ?? {};
    return {
      id: idStr,
      token0Symbol: tx.symbol ?? p.token0Symbol ?? "?",
      token1Symbol: ty.symbol ?? p.token1Symbol ?? "?",
      tvlUsd: p.tvlUsd ?? 0,
      volume24hUsd: p.volume24hUsd ?? p.volumeUsd24h ?? 0,
      poolId: numericId,
      token0Decimals: tx.decimals ?? p.token0Decimals ?? 8,
      token1Decimals: ty.decimals ?? p.token1Decimals ?? 6,
      token0PriceUsd: tx.priceUsd ?? p.token0PriceUsd ?? 0,
      token1PriceUsd: ty.priceUsd ?? p.token1PriceUsd ?? 0,
      activeBinId: p.activeBinId,
      feeBps: p.feeBps,
    };
  });

  return pools.filter(
    (p: AppPool) => (p.tvlUsd ?? 0) >= MIN_TVL_USD && p.poolId != null
  );
}

async function fetchActiveBin(poolId: number): Promise<number> {
  const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-active-bin`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: SENDER,
      arguments: [
        `0x0100000000000000000000000000000${poolId
          .toString(16)
          .padStart(3, "0")}`,
      ],
    }),
  });
  if (!res.ok) throw new Error(`Active bin fetch failed: ${res.status}`);
  const data = (await res.json()) as any;
  if (!data.okay || !data.result) throw new Error("Active bin read failed");
  const hex = data.result.replace("0x", "");
  if (hex.startsWith("09")) {
    const tupleHex = hex.slice(2);
    let offset = 0;
    const numEntries = parseInt(tupleHex.slice(offset, offset + 2), 16);
    offset += 2;
    for (let i = 0; i < numEntries; i++) {
      const nameLen = parseInt(tupleHex.slice(offset, offset + 2), 16);
      offset += 2;
      const nameBytes = tupleHex.slice(offset, offset + nameLen * 2);
      offset += nameLen * 2;
      const name = Buffer.from(nameBytes, "hex").toString("ascii");
      if (name === "active-bin-id" || name === "bin-id") {
        const typePrefix = tupleHex.slice(offset, offset + 2);
        offset += 2;
        if (typePrefix === "01") {
          return parseInt(tupleHex.slice(offset, offset + 32), 16);
        }
      } else {
        const typePrefix = tupleHex.slice(offset, offset + 2);
        offset += 2;
        if (typePrefix === "01" || typePrefix === "00") offset += 32;
        else if (typePrefix === "0a") offset += 32;
        else break;
      }
    }
  }
  const match = hex.match(/01([0-9a-f]{32})/);
  if (match) return parseInt(match[1], 16);
  throw new Error("Cannot parse active bin");
}

async function fetchBinReserves(
  poolId: number,
  activeBin: number,
  pool: AppPool
): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const start = activeBin - BIN_SCAN_RADIUS;
  const end = activeBin + BIN_SCAN_RADIUS;
  const batchSize = 5;
  for (let i = start; i <= end; i += batchSize) {
    const batch = [];
    for (let j = i; j < Math.min(i + batchSize, end + 1); j++) {
      batch.push(j);
    }
    const results = await Promise.all(
      batch.map(async (binId) => {
        try {
          const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-bin-reserves`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sender: SENDER,
              arguments: [
                `0x0100000000000000000000000000000${poolId
                  .toString(16)
                  .padStart(3, "0")}`,
                `0x01000000000000000000000000${binId
                  .toString(16)
                  .padStart(8, "0")}`,
              ],
            }),
          });
          if (!res.ok) return null;
          const data = (await res.json()) as any;
          if (!data.okay || !data.result) return null;
          const hex = data.result.replace("0x", "");
          let reserveX = 0,
            reserveY = 0;
          if (hex.startsWith("09")) {
            const tupleHex = hex.slice(2);
            let offset = 0;
            const numEntries = parseInt(
              tupleHex.slice(offset, offset + 2),
              16
            );
            offset += 2;
            for (let e = 0; e < numEntries; e++) {
              const nameLen = parseInt(
                tupleHex.slice(offset, offset + 2),
                16
              );
              offset += 2;
              const nameRaw = tupleHex.slice(offset, offset + nameLen * 2);
              offset += nameLen * 2;
              const nm = Buffer.from(nameRaw, "hex").toString("ascii");
              const typePrefix = tupleHex.slice(offset, offset + 2);
              offset += 2;
              const val = parseInt(tupleHex.slice(offset, offset + 32), 16);
              offset += 32;
              if (nm === "reserve-x") reserveX = val;
              else if (nm === "reserve-y") reserveY = val;
            }
          } else {
            const uints = hex.match(/01([0-9a-f]{32})/g) ?? [];
            if (uints.length >= 2) {
              reserveX = parseInt(uints[0].slice(2), 16);
              reserveY = parseInt(uints[1].slice(2), 16);
            }
          }
          const decX = pool.token0Decimals || 8;
          const decY = pool.token1Decimals || 6;
          const rX = reserveX / 10 ** decX;
          const rY = reserveY / 10 ** decY;
          const rXUsd = rX * (pool.token0PriceUsd || 0);
          const rYUsd = rY * (pool.token1PriceUsd || 0);
          return {
            binId,
            reserveX: rX,
            reserveY: rY,
            reserveXUsd: rXUsd,
            reserveYUsd: rYUsd,
            totalUsd: rXUsd + rYUsd,
          } as BinReserves;
        } catch {
          return null;
        }
      })
    );
    for (const r of results) {
      if (r && (r.reserveX > 0 || r.reserveY > 0)) bins.push(r);
    }
  }
  return bins;
}

// --- Math helpers ---

function round(n: number, decimals = 4): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function linearRegSlope(ys: number[]): number {
  if (ys.length < 2) return 0;
  const n = ys.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += ys[i];
    sumXY += i * ys[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

// --- Directional analysis ---

function buildDirectionalProfile(
  bins: BinReserves[],
  activeBin: number,
  direction: "buy" | "sell"
): DirectionalProfile {
  const dirBins =
    direction === "buy"
      ? bins.filter((b) => b.binId < activeBin).sort((a, b) => b.binId - a.binId)
      : bins.filter((b) => b.binId > activeBin).sort((a, b) => a.binId - b.binId);

  const totalUsd = dirBins.reduce((s, b) => s + b.totalUsd, 0);
  const meanUsd = dirBins.length > 0 ? totalUsd / dirBins.length : 0;
  const maxUsd = dirBins.length > 0 ? Math.max(...dirBins.map((b) => b.totalUsd)) : 0;

  const reserves = dirBins.map((b) => b.totalUsd);
  const gradient = linearRegSlope(reserves);

  let decayRate = 0;
  if (reserves.length >= 2 && reserves[0] > 0) {
    const lastNonZero = reserves.findIndex((r) => r <= 0);
    const effectiveLen = lastNonZero === -1 ? reserves.length : lastNonZero;
    if (effectiveLen >= 2 && reserves[0] > 0) {
      decayRate = 1 - Math.pow(Math.max(reserves[effectiveLen - 1], 0.01) / reserves[0], 1 / effectiveLen);
    }
  }

  let cumUsd = 0;
  let depthAt5 = 0, depthAt10 = 0, depthAt20 = 0;
  for (let i = 0; i < dirBins.length; i++) {
    cumUsd += dirBins[i].totalUsd;
    if (i === 4) depthAt5 = cumUsd;
    if (i === 9) depthAt10 = cumUsd;
    if (i === 19) depthAt20 = cumUsd;
  }
  if (dirBins.length < 20) depthAt20 = cumUsd;
  if (dirBins.length < 10) depthAt10 = cumUsd;
  if (dirBins.length < 5) depthAt5 = cumUsd;

  let gapCount = 0;
  let longestGap = 0;
  let currentGap = 0;
  const allBinIds = dirBins.map((b) => b.binId);
  if (dirBins.length >= 2) {
    const minId = Math.min(...allBinIds);
    const maxId = Math.max(...allBinIds);
    const binSet = new Set(allBinIds);
    for (let id = minId; id <= maxId; id++) {
      if (!binSet.has(id)) {
        currentGap++;
        gapCount++;
        longestGap = Math.max(longestGap, currentGap);
      } else {
        currentGap = 0;
      }
    }
  }

  return {
    direction,
    binCount: dirBins.length,
    totalUsd: round(totalUsd, 2),
    meanUsd: round(meanUsd, 2),
    maxUsd: round(maxUsd, 2),
    gradient: round(gradient, 4),
    decayRate: round(decayRate, 4),
    depthAt5: round(depthAt5, 2),
    depthAt10: round(depthAt10, 2),
    depthAt20: round(depthAt20, 2),
    gapCount,
    longestGap,
  };
}

function computeDirectionalElasticity(
  bins: BinReserves[],
  activeBin: number,
  direction: "buy" | "sell"
): number {
  const dirBins =
    direction === "buy"
      ? bins.filter((b) => b.binId < activeBin).sort((a, b) => b.binId - a.binId)
      : bins.filter((b) => b.binId > activeBin).sort((a, b) => a.binId - b.binId);

  if (dirBins.length < 2) return 0;

  let totalElasticity = 0;
  let count = 0;
  for (let i = 1; i < dirBins.length; i++) {
    const prev = dirBins[i - 1].totalUsd;
    const curr = dirBins[i].totalUsd;
    if (prev > 0) {
      const pctChange = (curr - prev) / prev;
      totalElasticity += Math.abs(pctChange);
      count++;
    }
  }

  return count > 0 ? round(totalElasticity / count, 4) : 0;
}

// --- Composite scoring ---

function computeAnisotropyIndex(
  depthRatio: number,
  gradientRatio: number,
  decayAsymmetry: number,
  gapAsymmetry: number,
  elasticityRatio: number
): number {
  const depthScore = Math.min(Math.abs(1 - depthRatio) * 40, 30);
  const gradientScore = Math.min(gradientRatio * 10, 20);
  const decayScore = Math.min(decayAsymmetry * 30, 20);
  const gapScore = Math.min(gapAsymmetry * 15, 15);
  const elasticityScore = Math.min(Math.abs(1 - elasticityRatio) * 20, 15);

  return Math.round(Math.min(depthScore + gradientScore + decayScore + gapScore + elasticityScore, 100));
}

function classifyAnisotropy(index: number): string {
  if (index < 15) return "ISOTROPIC";
  if (index < 35) return "WEAKLY_ANISOTROPIC";
  if (index < 60) return "ANISOTROPIC";
  return "STRONGLY_ANISOTROPIC";
}

// --- Core analysis ---

function analyzeAnisotropy(
  bins: BinReserves[],
  activeBin: number,
  pool: AppPool
): AnisotropyProfile {
  const pair = `${pool.token0Symbol}/${pool.token1Symbol}`;
  const poolId = pool.poolId!;

  const buySide = buildDirectionalProfile(bins, activeBin, "buy");
  const sellSide = buildDirectionalProfile(bins, activeBin, "sell");

  const totalDepth = buySide.totalUsd + sellSide.totalUsd;
  const depthRatio = sellSide.totalUsd > 0 ? buySide.totalUsd / sellSide.totalUsd : buySide.totalUsd > 0 ? 999 : 1;

  const buyGradMag = Math.abs(buySide.gradient);
  const sellGradMag = Math.abs(sellSide.gradient);
  const maxGrad = Math.max(buyGradMag, sellGradMag);
  const gradientRatio = maxGrad > 0 ? Math.abs(buyGradMag - sellGradMag) / maxGrad : 0;

  const maxDecay = Math.max(Math.abs(buySide.decayRate), Math.abs(sellSide.decayRate));
  const decayAsymmetry = maxDecay > 0 ? Math.abs(buySide.decayRate - sellSide.decayRate) / maxDecay : 0;

  const maxGaps = Math.max(buySide.gapCount, sellSide.gapCount);
  const gapAsymmetry = maxGaps > 0 ? Math.abs(buySide.gapCount - sellSide.gapCount) / maxGaps : 0;

  const elasticityBuy = computeDirectionalElasticity(bins, activeBin, "buy");
  const elasticitySell = computeDirectionalElasticity(bins, activeBin, "sell");
  const maxElasticity = Math.max(elasticityBuy, elasticitySell);
  const elasticityRatio = maxElasticity > 0 ? Math.min(elasticityBuy, elasticitySell) / maxElasticity : 1;

  const anisotropyIndex = computeAnisotropyIndex(
    depthRatio,
    gradientRatio,
    decayAsymmetry,
    gapAsymmetry,
    elasticityRatio
  );

  const anisotropyClass = classifyAnisotropy(anisotropyIndex);

  const directionalBias = totalDepth > 0
    ? round(((buySide.totalUsd - sellSide.totalUsd) / totalDepth) * 100, 2)
    : 0;

  const dominantDirection =
    Math.abs(directionalBias) < 5 ? "BALANCED" : directionalBias > 0 ? "BUY_HEAVY" : "SELL_HEAVY";

  const isotropyScore = Math.max(0, 100 - anisotropyIndex);

  return {
    pair,
    poolId,
    activeBin,
    binsAnalyzed: bins.length,
    anisotropyIndex,
    anisotropyClass,
    dominantDirection,
    buySide,
    sellSide,
    depthRatio: round(depthRatio, 4),
    gradientRatio: round(gradientRatio, 4),
    decayAsymmetry: round(decayAsymmetry, 4),
    gapAsymmetry: round(gapAsymmetry, 4),
    elasticityBuy,
    elasticitySell,
    elasticityRatio: round(elasticityRatio, 4),
    directionalBias,
    isotropyScore,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
  };
}

// --- CLI ---

const program = new Command();
program
  .name("hodlmm-bin-anisotropy")
  .description("HODLMM bin anisotropy analyzer — Day 124 cocoa007")
  .version("1.0.0");

// -- doctor --

program
  .command("doctor")
  .description("Check API connectivity and environment")
  .action(async () => {
    const checks: { name: string; ok: boolean; detail: string }[] = [];

    checks.push({
      name: "bun-runtime",
      ok: typeof Bun !== "undefined",
      detail: typeof Bun !== "undefined" ? `v${Bun.version}` : "not Bun",
    });

    try {
      const r = await fetch(`${BFF_APP_BASE}/pools`, { method: "GET" });
      checks.push({ name: "bff-pools", ok: r.ok, detail: `HTTP ${r.status}` });
    } catch (e: any) {
      checks.push({ name: "bff-pools", ok: false, detail: e.message });
    }

    try {
      const r = await fetch(`${HIRO_API}/v2/info`, { method: "GET" });
      checks.push({ name: "hiro-api", ok: r.ok, detail: `HTTP ${r.status}` });
    } catch (e: any) {
      checks.push({ name: "hiro-api", ok: false, detail: e.message });
    }

    const allOk = checks.every((c) => c.ok);
    console.log(
      JSON.stringify({ result: allOk ? "success" : "degraded", checks })
    );

    console.error("\n  HODLMM Bin Anisotropy — Doctor\n");
    for (const c of checks) {
      const icon = c.ok ? "[OK]" : "[FAIL]";
      console.error(`  ${icon} ${c.name.padEnd(16)} ${c.detail}`);
    }
    console.error("");
  });

// -- status --

program
  .command("status")
  .description("List available HODLMM pools above TVL threshold")
  .action(async () => {
    try {
      const pools = await fetchPools();
      const sorted = pools.sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, 20);
      console.log(
        JSON.stringify({
          result: "success",
          poolCount: pools.length,
          pools: sorted.map((p) => ({
            poolId: p.poolId,
            pair: `${p.token0Symbol}/${p.token1Symbol}`,
            tvlUsd: p.tvlUsd,
            volume24hUsd: p.volume24hUsd,
          })),
        })
      );

      console.error("\n  HODLMM Pools (TVL >= $1000)\n");
      console.error(
        "  " +
          "Pool".padEnd(6) +
          "Pair".padEnd(18) +
          "TVL ($)".padStart(14) +
          "Vol 24h ($)".padStart(14)
      );
      console.error("  " + "-".repeat(52));
      for (const p of sorted) {
        console.error(
          "  " +
            String(p.poolId).padEnd(6) +
            `${p.token0Symbol}/${p.token1Symbol}`.padEnd(18) +
            p.tvlUsd.toFixed(0).padStart(14) +
            p.volume24hUsd.toFixed(0).padStart(14)
        );
      }
      console.error(`\n  Total: ${pools.length} pools\n`);
    } catch (e: any) {
      console.log(JSON.stringify({ error: e.message }));
    }
  });

// -- run --

program
  .command("run")
  .description("Run anisotropy analysis on HODLMM pools")
  .option("--pool <id>", "Analyze a specific pool by numeric ID")
  .option("--top <n>", "Number of top pools to analyze", "5")
  .action(async (opts) => {
    try {
      const pools = await fetchPools();
      let targets: AppPool[];

      if (opts.pool) {
        const pid = parseInt(opts.pool, 10);
        const match = pools.find((p) => p.poolId === pid);
        if (!match) {
          console.log(JSON.stringify({ error: `Pool #${pid} not found` }));
          return;
        }
        targets = [match];
      } else {
        const topN = parseInt(opts.top, 10) || 5;
        targets = pools.sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, topN);
      }

      const profiles: AnisotropyProfile[] = [];

      for (const pool of targets) {
        try {
          const activeBin = await fetchActiveBin(pool.poolId!);
          const bins = await fetchBinReserves(pool.poolId!, activeBin, pool);
          if (bins.length < MIN_POPULATED_BINS) {
            console.error(
              `  [SKIP] Pool ${pool.poolId} (${pool.token0Symbol}/${pool.token1Symbol}): only ${bins.length} populated bins`
            );
            continue;
          }
          const profile = analyzeAnisotropy(bins, activeBin, pool);
          profiles.push(profile);
        } catch (e: any) {
          console.error(
            `  [ERR] Pool ${pool.poolId} (${pool.token0Symbol}/${pool.token1Symbol}): ${e.message}`
          );
        }
      }

      const avgIdx =
        profiles.length > 0
          ? round(mean(profiles.map((p) => p.anisotropyIndex)), 1)
          : 0;
      const classCounts = {
        isotropicCount: profiles.filter((p) => p.anisotropyClass === "ISOTROPIC").length,
        weaklyAnisotropicCount: profiles.filter((p) => p.anisotropyClass === "WEAKLY_ANISOTROPIC").length,
        anisotropicCount: profiles.filter((p) => p.anisotropyClass === "ANISOTROPIC").length,
        stronglyAnisotropicCount: profiles.filter((p) => p.anisotropyClass === "STRONGLY_ANISOTROPIC").length,
      };
      const dirCounts = {
        buyHeavyCount: profiles.filter((p) => p.dominantDirection === "BUY_HEAVY").length,
        sellHeavyCount: profiles.filter((p) => p.dominantDirection === "SELL_HEAVY").length,
        balancedCount: profiles.filter((p) => p.dominantDirection === "BALANCED").length,
      };

      const output = {
        result: "success",
        summary: {
          poolsAnalyzed: profiles.length,
          avgAnisotropyIndex: avgIdx,
          ...classCounts,
          ...dirCounts,
          avgDepthRatio: round(mean(profiles.map((p) => p.depthRatio)), 2),
          avgDirectionalBias: round(mean(profiles.map((p) => p.directionalBias)), 2),
        },
        profiles: profiles.map((p) => ({
          pair: p.pair,
          poolId: p.poolId,
          anisotropyIndex: p.anisotropyIndex,
          anisotropyClass: p.anisotropyClass,
          dominantDirection: p.dominantDirection,
          depthRatio: p.depthRatio,
          gradientRatio: p.gradientRatio,
          decayAsymmetry: p.decayAsymmetry,
          elasticityRatio: p.elasticityRatio,
          directionalBias: p.directionalBias,
          isotropyScore: p.isotropyScore,
          buySideDepth: p.buySide.totalUsd,
          sellSideDepth: p.sellSide.totalUsd,
          tvlUsd: p.tvlUsd,
        })),
      };

      console.log(JSON.stringify(output));

      // Human-readable table
      console.error("\n  HODLMM Bin Anisotropy Analysis\n");
      console.error(
        "  " +
          "Pool".padEnd(6) +
          "Pair".padEnd(16) +
          "Idx".padStart(5) +
          "Class".padStart(24) +
          "Dir".padStart(12) +
          "Depth$".padStart(10) +
          "Bias%".padStart(8) +
          "Grad-R".padStart(8) +
          "Decay-A".padStart(9) +
          "Elast-R".padStart(9)
      );
      console.error("  " + "-".repeat(107));
      for (const p of profiles) {
        console.error(
          "  " +
            String(p.poolId).padEnd(6) +
            p.pair.padEnd(16) +
            String(p.anisotropyIndex).padStart(5) +
            p.anisotropyClass.padStart(24) +
            p.dominantDirection.padStart(12) +
            p.depthRatio.toFixed(2).padStart(10) +
            p.directionalBias.toFixed(1).padStart(8) +
            p.gradientRatio.toFixed(3).padStart(8) +
            p.decayAsymmetry.toFixed(3).padStart(9) +
            p.elasticityRatio.toFixed(3).padStart(9)
        );
      }

      // Directional depth detail
      console.error("\n  Directional Depth (USD)\n");
      console.error(
        "  " +
          "Pool".padEnd(6) +
          "Pair".padEnd(16) +
          "Buy Depth".padStart(14) +
          "Sell Depth".padStart(14) +
          "Buy @5".padStart(12) +
          "Sell @5".padStart(12) +
          "Buy Gaps".padStart(10) +
          "Sell Gaps".padStart(10)
      );
      console.error("  " + "-".repeat(94));
      for (const p of profiles) {
        console.error(
          "  " +
            String(p.poolId).padEnd(6) +
            p.pair.padEnd(16) +
            p.buySide.totalUsd.toFixed(2).padStart(14) +
            p.sellSide.totalUsd.toFixed(2).padStart(14) +
            p.buySide.depthAt5.toFixed(2).padStart(12) +
            p.sellSide.depthAt5.toFixed(2).padStart(12) +
            String(p.buySide.gapCount).padStart(10) +
            String(p.sellSide.gapCount).padStart(10)
        );
      }

      console.error(
        `\n  Summary: ${profiles.length} pools | avg anisotropy ${avgIdx} | ` +
          `${classCounts.isotropicCount} isotropic, ` +
          `${classCounts.weaklyAnisotropicCount} weak, ` +
          `${classCounts.anisotropicCount} anisotropic, ` +
          `${classCounts.stronglyAnisotropicCount} strong | ` +
          `${dirCounts.buyHeavyCount}B/${dirCounts.sellHeavyCount}S/${dirCounts.balancedCount}bal\n`
      );
    } catch (e: any) {
      console.log(JSON.stringify({ error: e.message }));
    }
  });

program.parse();
