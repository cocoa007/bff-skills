#!/usr/bin/env bun
/**
 * hodlmm-bin-annealing.ts — Day 130 cocoa007 Bitflow Skills Comp
 *
 * Simulated annealing analyzer — measures how well a pool's liquidity
 * distribution has settled into an optimal configuration vs. being in
 * a stressed/quenched state with high configurational energy.
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

interface AnnealingProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsAnalyzed: number;
  totalUsd: number;
  configEnergy: number;
  optimalEnergy: number;
  excessEnergy: number;
  temperature: number;
  roughness: number;
  smoothness: number;
  peakToValleyRatio: number;
  stressHotspots: number;
  gapCount: number;
  gapFraction: number;
  symmetryScore: number;
  centerOfMass: number;
  centerOfMassOffset: number;
  boltzmannFit: number;
  annealingIndex: number;
  annealingClass: string;
  annealingState: string;
  tvlUsd: number;
}

async function fetchPools(): Promise<AppPool[]> {
  const resp = await fetch(`${BFF_APP_BASE}/pools`);
  if (!resp.ok) throw new Error(`BFF API ${resp.status}`);
  const data = (await resp.json()) as any;
  const pools: any[] = data.pools || data.data || data;
  return pools
    .filter((p: any) => (p.tvlUsd || 0) >= MIN_TVL_USD)
    .map((p: any) => ({
      id: p.id || p.poolId?.toString() || "0",
      token0Symbol: p.token0Symbol || p.tokenXSymbol || "?",
      token1Symbol: p.token1Symbol || p.tokenYSymbol || "?",
      tvlUsd: p.tvlUsd || 0,
      volume24hUsd: p.volume24hUsd || p.volumeUsd24h || 0,
      poolId: p.poolId || parseInt(p.id) || 0,
      token0Decimals: p.token0Decimals || p.tokenXDecimals || 6,
      token1Decimals: p.token1Decimals || p.tokenYDecimals || 6,
      token0PriceUsd: p.token0PriceUsd || p.tokenXPriceUsd || 0,
      token1PriceUsd: p.token1PriceUsd || p.tokenYPriceUsd || 0,
      activeBinId: p.activeBinId || p.activeId || undefined,
      feeBps: p.feeBps || p.baseFee || undefined,
    }));
}

async function fetchActiveBin(poolId: number): Promise<number> {
  const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-active-bin-id`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: SENDER,
      arguments: [`0x0100000000000000000000000000000${poolId.toString(16).padStart(3, "0")}`],
    }),
  });
  if (!resp.ok) throw new Error(`Hiro API ${resp.status}`);
  const data = (await resp.json()) as any;
  if (!data.okay || data.result === undefined) throw new Error("get-active-bin-id failed");
  const hex = data.result.replace("0x", "");
  if (hex.startsWith("09")) {
    const inner = hex.slice(2);
    if (inner.startsWith("01")) return parseInt(inner.slice(2), 16);
  }
  if (hex.startsWith("01")) return parseInt(hex.slice(2), 16);
  return parseInt(hex, 16);
}

async function fetchBinReserves(
  poolId: number,
  activeBin: number,
  pool: AppPool
): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  for (let offset = -BIN_SCAN_RADIUS; offset <= BIN_SCAN_RADIUS; offset++) {
    const binId = activeBin + offset;
    const pIdHex = poolId.toString(16).padStart(3, "0");
    const bIdHex = binId < 0
      ? (0x100000000 + binId).toString(16).padStart(8, "0")
      : binId.toString(16).padStart(8, "0");

    const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-bin`;
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: SENDER,
          arguments: [
            `0x0100000000000000000000000000000${pIdHex}`,
            `0x01000000000000000000000000${bIdHex}`,
          ],
        }),
      });
      if (!resp.ok) continue;
      const data = (await resp.json()) as any;
      if (!data.okay) continue;

      const hex = data.result.replace("0x", "");
      const reserveX = extractReserve(hex, "reserve-x");
      const reserveY = extractReserve(hex, "reserve-y");
      if (reserveX === 0 && reserveY === 0) continue;

      const reserveXUsd = (reserveX / Math.pow(10, pool.token0Decimals)) * pool.token0PriceUsd;
      const reserveYUsd = (reserveY / Math.pow(10, pool.token1Decimals)) * pool.token1PriceUsd;

      bins.push({
        binId,
        reserveX,
        reserveY,
        reserveXUsd,
        reserveYUsd,
        totalUsd: reserveXUsd + reserveYUsd,
      });
    } catch {
      continue;
    }
  }
  return bins;
}

function extractReserve(hex: string, field: string): number {
  const fieldHex = Buffer.from(field).toString("hex");
  const idx = hex.indexOf(fieldHex);
  if (idx === -1) return 0;
  const afterField = hex.slice(idx + fieldHex.length);
  if (afterField.startsWith("01")) {
    return parseInt(afterField.slice(2, 34), 16);
  }
  return 0;
}

function computeOptimalDistribution(bins: BinReserves[], activeBin: number): number[] {
  const totalUsd = bins.reduce((s, b) => s + b.totalUsd, 0);
  const sigma = Math.max(bins.length / 4, 3);
  const rawWeights = bins.map((b) => {
    const dist = Math.abs(b.binId - activeBin);
    return Math.exp(-(dist * dist) / (2 * sigma * sigma));
  });
  const weightSum = rawWeights.reduce((s, w) => s + w, 0);
  return rawWeights.map((w) => (w / weightSum) * totalUsd);
}

function analyzeAnnealing(bins: BinReserves[], pool: AppPool): AnnealingProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const avgUsd = totalUsd / n;

  const optimal = computeOptimalDistribution(sorted, activeBin);

  let configEnergy = 0;
  let optimalEnergy = 0;
  for (let i = 0; i < n; i++) {
    const actual = sorted[i].totalUsd;
    const opt = optimal[i];
    configEnergy += (actual - avgUsd) * (actual - avgUsd);
    optimalEnergy += (opt - avgUsd) * (opt - avgUsd);
  }
  configEnergy = Math.sqrt(configEnergy / n);
  optimalEnergy = Math.sqrt(optimalEnergy / n);
  const excessEnergy = configEnergy > 0 ? Math.max(0, configEnergy - optimalEnergy) / configEnergy : 0;

  let roughnessSum = 0;
  for (let i = 1; i < n; i++) {
    const diff = Math.abs(sorted[i].totalUsd - sorted[i - 1].totalUsd);
    roughnessSum += diff;
  }
  const roughness = avgUsd > 0 ? roughnessSum / ((n - 1) * avgUsd) : 0;
  const smoothness = Math.max(0, 1 - roughness);

  const maxUsd = Math.max(...sorted.map((b) => b.totalUsd));
  const minUsd = Math.min(...sorted.map((b) => b.totalUsd));
  const peakToValleyRatio = minUsd > 0 ? maxUsd / minUsd : maxUsd > 0 ? Infinity : 1;

  let stressHotspots = 0;
  for (let i = 1; i < n - 1; i++) {
    const leftDiff = Math.abs(sorted[i].totalUsd - sorted[i - 1].totalUsd);
    const rightDiff = Math.abs(sorted[i].totalUsd - sorted[i + 1].totalUsd);
    const localStress = (leftDiff + rightDiff) / 2;
    if (localStress > avgUsd * 1.5) stressHotspots++;
  }

  const fullRange = sorted[n - 1].binId - sorted[0].binId + 1;
  const gapCount = fullRange - n;
  const gapFraction = fullRange > 0 ? gapCount / fullRange : 0;

  let leftSum = 0;
  let rightSum = 0;
  for (const b of sorted) {
    if (b.binId < activeBin) leftSum += b.totalUsd;
    else if (b.binId > activeBin) rightSum += b.totalUsd;
  }
  const sideTotal = leftSum + rightSum;
  const symmetryScore = sideTotal > 0 ? 1 - Math.abs(leftSum - rightSum) / sideTotal : 1;

  let weightedBinSum = 0;
  for (const b of sorted) {
    weightedBinSum += b.binId * b.totalUsd;
  }
  const centerOfMass = totalUsd > 0 ? weightedBinSum / totalUsd : activeBin;
  const centerOfMassOffset = centerOfMass - activeBin;

  let boltzmannNumerator = 0;
  let boltzmannDenominator = 0;
  for (let i = 0; i < n; i++) {
    const actual = sorted[i].totalUsd;
    const opt = optimal[i];
    if (opt > 0) {
      boltzmannNumerator += Math.min(actual, opt);
      boltzmannDenominator += opt;
    }
  }
  const boltzmannFit = boltzmannDenominator > 0 ? boltzmannNumerator / boltzmannDenominator : 0;

  const temperature = excessEnergy * (1 + roughness) * (1 + gapFraction);

  const smoothnessScore = smoothness * 25;
  const fitScore = boltzmannFit * 25;
  const symmetryPart = symmetryScore * 15;
  const gapPenalty = (1 - gapFraction) * 15;
  const stressPenalty = Math.max(0, 1 - stressHotspots / Math.max(n / 3, 1)) * 10;
  const energyScore = (1 - Math.min(excessEnergy, 1)) * 10;
  const annealingIndex = Math.round(
    Math.min(100, smoothnessScore + fitScore + symmetryPart + gapPenalty + stressPenalty + energyScore)
  );

  let annealingClass: string;
  if (annealingIndex >= 75) annealingClass = "ANNEALED";
  else if (annealingIndex >= 55) annealingClass = "TEMPERING";
  else if (annealingIndex >= 35) annealingClass = "STRESSED";
  else annealingClass = "QUENCHED";

  let annealingState: string;
  if (temperature < 0.15) annealingState = "GROUND_STATE";
  else if (temperature < 0.4) annealingState = "LOW_ENERGY";
  else if (temperature < 0.7) annealingState = "EXCITED";
  else annealingState = "SUPERHEATED";

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsAnalyzed: n,
    totalUsd: Math.round(totalUsd * 100) / 100,
    configEnergy: Math.round(configEnergy * 100) / 100,
    optimalEnergy: Math.round(optimalEnergy * 100) / 100,
    excessEnergy: Math.round(excessEnergy * 1000) / 1000,
    temperature: Math.round(temperature * 1000) / 1000,
    roughness: Math.round(roughness * 1000) / 1000,
    smoothness: Math.round(smoothness * 1000) / 1000,
    peakToValleyRatio: peakToValleyRatio === Infinity ? 999 : Math.round(peakToValleyRatio * 100) / 100,
    stressHotspots,
    gapCount,
    gapFraction: Math.round(gapFraction * 1000) / 1000,
    symmetryScore: Math.round(symmetryScore * 1000) / 1000,
    centerOfMass: Math.round(centerOfMass * 100) / 100,
    centerOfMassOffset: Math.round(centerOfMassOffset * 100) / 100,
    boltzmannFit: Math.round(boltzmannFit * 1000) / 1000,
    annealingIndex,
    annealingClass,
    annealingState,
    tvlUsd: pool.tvlUsd,
  };
}

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Annealing — Doctor ===\n");
  let ok = true;

  try {
    const r = await fetch(`${BFF_APP_BASE}/pools`);
    console.log(`  BFF API:  ${r.ok ? "OK" : "FAIL"} (${r.status})`);
    if (!r.ok) ok = false;
  } catch (e: any) {
    console.log(`  BFF API:  FAIL (${e.message})`);
    ok = false;
  }

  try {
    const r = await fetch(`${HIRO_API}/v2/info`);
    console.log(`  Hiro API: ${r.ok ? "OK" : "FAIL"} (${r.status})`);
    if (!r.ok) ok = false;
  } catch (e: any) {
    console.log(`  Hiro API: FAIL (${e.message})`);
    ok = false;
  }

  console.log(`\n  Result: ${ok ? "PASS" : "FAIL"}`);
  if (!ok) process.exit(1);
}

async function runStatus(): Promise<void> {
  const pools = await fetchPools();
  console.log(
    JSON.stringify({
      result: "success",
      poolsAvailable: pools.length,
      pools: pools.slice(0, 10).map((p) => ({
        pair: `${p.token0Symbol}/${p.token1Symbol}`,
        poolId: p.poolId,
        tvlUsd: p.tvlUsd,
      })),
    })
  );
}

async function runAnalysis(opts: { pool?: string; top?: string }): Promise<void> {
  const pools = await fetchPools();
  let targets: AppPool[];

  if (opts.pool) {
    const pid = parseInt(opts.pool);
    targets = pools.filter((p) => p.poolId === pid);
    if (targets.length === 0) {
      console.log(JSON.stringify({ error: `Pool #${opts.pool} not found` }));
      return;
    }
  } else {
    const topN = parseInt(opts.top || "5");
    targets = pools.sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, topN);
  }

  const profiles: AnnealingProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeAnnealing(bins, pool));
    } catch {
      continue;
    }
  }

  const summary = {
    poolsAnalyzed: profiles.length,
    avgAnnealingIndex: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + p.annealingIndex, 0) / profiles.length) * 10) / 10
      : 0,
    annealedCount: profiles.filter((p) => p.annealingClass === "ANNEALED").length,
    temperingCount: profiles.filter((p) => p.annealingClass === "TEMPERING").length,
    stressedCount: profiles.filter((p) => p.annealingClass === "STRESSED").length,
    quenchedCount: profiles.filter((p) => p.annealingClass === "QUENCHED").length,
    groundStateCount: profiles.filter((p) => p.annealingState === "GROUND_STATE").length,
    lowEnergyCount: profiles.filter((p) => p.annealingState === "LOW_ENERGY").length,
    excitedCount: profiles.filter((p) => p.annealingState === "EXCITED").length,
    superheatedCount: profiles.filter((p) => p.annealingState === "SUPERHEATED").length,
    avgSmoothness: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + p.smoothness, 0) / profiles.length) * 1000) / 1000
      : 0,
    avgBoltzmannFit: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + p.boltzmannFit, 0) / profiles.length) * 1000) / 1000
      : 0,
    avgSymmetry: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + p.symmetryScore, 0) / profiles.length) * 1000) / 1000
      : 0,
    totalStressHotspots: profiles.reduce((s, p) => s + p.stressHotspots, 0),
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-annealing").description("HODLMM bin annealing state analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze annealing state")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
