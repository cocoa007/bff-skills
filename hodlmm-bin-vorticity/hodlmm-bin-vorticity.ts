#!/usr/bin/env bun
/**
 * hodlmm-bin-vorticity.ts — Day 135 cocoa007 Bitflow Skills Comp
 *
 * Vorticity analyzer — models rotational flow patterns in HODLMM bin
 * reserve distributions using fluid dynamics vorticity theory.
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

interface VorticityProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsAnalyzed: number;
  totalUsd: number;
  meanVorticity: number;
  maxVorticity: number;
  maxVorticityBin: number;
  minVorticity: number;
  minVorticityBin: number;
  enstrophy: number;
  circulation: number;
  helicity: number;
  rossbyNumber: number;
  vortexCoreCount: number;
  vortexCoreBins: number[];
  taylorMicroscale: number;
  vortexStretching: number;
  palinstrophy: number;
  sheddingFrequency: number;
  lambOseenRadius: number;
  swirlNumber: number;
  qCriterion: number;
  vorticityEntropy: number;
  vorticitySkewness: number;
  vorticityFlatness: number;
  enstrophyProduction: number;
  enstrophyDissipation: number;
  vorticityFlux: number;
  vorticityIndex: number;
  flowRegime: string;
  vortexClass: string;
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

function analyzeVorticity(bins: BinReserves[], pool: AppPool): VorticityProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const reserves = sorted.map((b) => b.totalUsd);
  const meanReserve = totalUsd / n;

  const velocity: number[] = [];
  for (let i = 1; i < n; i++) {
    velocity.push(reserves[i] - reserves[i - 1]);
  }

  const vorticity: number[] = [];
  for (let i = 1; i < velocity.length; i++) {
    vorticity.push(velocity[i] - velocity[i - 1]);
  }

  if (vorticity.length === 0) {
    return emptyProfile(pool, activeBin, n, totalUsd);
  }

  const absVorticity = vorticity.map((v) => Math.abs(v));
  const meanVort = vorticity.reduce((s, v) => s + v, 0) / vorticity.length;
  const maxVort = Math.max(...absVorticity);
  const maxVortIdx = absVorticity.indexOf(maxVort);
  const minVort = Math.min(...absVorticity);
  const minVortIdx = absVorticity.indexOf(minVort);

  const enstrophy = vorticity.reduce((s, v) => s + v * v, 0) / vorticity.length;

  const circulation = velocity.reduce((s, v) => s + v, 0);

  let helicitySum = 0;
  for (let i = 0; i < vorticity.length; i++) {
    helicitySum += velocity[i] * vorticity[i];
  }
  const helicity = vorticity.length > 0 ? helicitySum / vorticity.length : 0;

  const meanAbsVelocity = velocity.reduce((s, v) => s + Math.abs(v), 0) / velocity.length;
  const meanAbsVorticity = absVorticity.reduce((s, v) => s + v, 0) / absVorticity.length;
  const rossbyNumber = meanAbsVorticity > 0 ? meanAbsVelocity / (meanAbsVorticity * n) : 0;

  const vortexThreshold = meanAbsVorticity * 1.5;
  const vortexCoreBins: number[] = [];
  for (let i = 0; i < vorticity.length; i++) {
    if (Math.abs(vorticity[i]) > vortexThreshold) {
      vortexCoreBins.push(sorted[i + 1].binId);
    }
  }

  const vorticityGradient: number[] = [];
  for (let i = 1; i < vorticity.length; i++) {
    vorticityGradient.push(vorticity[i] - vorticity[i - 1]);
  }
  const meanGradSq = vorticityGradient.length > 0
    ? vorticityGradient.reduce((s, g) => s + g * g, 0) / vorticityGradient.length
    : 1;
  const taylorMicroscale = meanGradSq > 0 ? Math.sqrt(enstrophy / meanGradSq) : 0;

  let stretchSum = 0;
  for (let i = 0; i < vorticity.length - 1; i++) {
    stretchSum += vorticity[i] * (velocity[i + 1] - velocity[i]);
  }
  const vortexStretching = vorticity.length > 1 ? stretchSum / (vorticity.length - 1) : 0;

  const palinstrophy = vorticityGradient.length > 0
    ? vorticityGradient.reduce((s, g) => s + g * g, 0) / vorticityGradient.length
    : 0;

  let signChanges = 0;
  for (let i = 1; i < vorticity.length; i++) {
    if (vorticity[i] * vorticity[i - 1] < 0) signChanges++;
  }
  const sheddingFrequency = vorticity.length > 1 ? signChanges / (vorticity.length - 1) : 0;

  const peakIdx = maxVortIdx;
  let decayIdx = peakIdx;
  const halfPeak = maxVort * 0.5;
  for (let i = peakIdx + 1; i < absVorticity.length; i++) {
    if (absVorticity[i] < halfPeak) {
      decayIdx = i;
      break;
    }
  }
  const lambOseenRadius = Math.abs(decayIdx - peakIdx) + 1;

  const tangentialMomentum = absVorticity.reduce((s, v) => s + v, 0);
  const axialMomentum = velocity.reduce((s, v) => s + Math.abs(v), 0) + 0.001;
  const swirlNumber = tangentialMomentum / axialMomentum;

  const strainRate: number[] = [];
  for (let i = 0; i < velocity.length - 1; i++) {
    strainRate.push((velocity[i + 1] - velocity[i]) / 2);
  }
  const meanStrainSq = strainRate.length > 0
    ? strainRate.reduce((s, sr) => s + sr * sr, 0) / strainRate.length
    : 0;
  const qCriterion = 0.5 * (enstrophy - 2 * meanStrainSq);

  const totalAbsVort = absVorticity.reduce((s, v) => s + v, 0) || 1;
  const vortProbs = absVorticity.map((v) => v / totalAbsVort);
  const maxEntropy = Math.log(vorticity.length);
  let vorticityEntropy = 0;
  for (const p of vortProbs) {
    if (p > 0) vorticityEntropy -= p * Math.log(p);
  }
  vorticityEntropy = maxEntropy > 0 ? vorticityEntropy / maxEntropy : 0;

  const vortStdDev = Math.sqrt(Math.max(0, enstrophy - meanVort * meanVort));
  const vorticitySkewness = vortStdDev > 0
    ? vorticity.reduce((s, v) => s + ((v - meanVort) / vortStdDev) ** 3, 0) / vorticity.length
    : 0;

  const vorticityFlatness = vortStdDev > 0
    ? vorticity.reduce((s, v) => s + ((v - meanVort) / vortStdDev) ** 4, 0) / vorticity.length
    : 3;

  const enstrophyProduction = Math.abs(vortexStretching);

  const volumeRatio = pool.volume24hUsd > 0 ? pool.volume24hUsd / pool.tvlUsd : 0.1;
  const enstrophyDissipation = palinstrophy * volumeRatio;

  const vorticityFlux = vorticity[vorticity.length - 1] - vorticity[0];

  const entropyScore = Math.min(20, vorticityEntropy * 20);
  const sheddingScore = Math.min(20, sheddingFrequency * 40);
  const swirlScore = Math.min(20, Math.min(swirlNumber, 2) * 10);
  const scaleScore = Math.min(20, Math.min(taylorMicroscale, 5) * 4);
  const coreScore = Math.min(20, Math.min(vortexCoreBins.length, 5) * 4);
  const vorticityIndex = Math.round(
    Math.min(100, entropyScore + sheddingScore + swirlScore + scaleScore + coreScore)
  );

  let flowRegime: string;
  if (enstrophy < meanReserve * 0.01) flowRegime = "LAMINAR";
  else if (enstrophy < meanReserve * 0.1) flowRegime = "TRANSITIONAL";
  else if (enstrophy < meanReserve * 1.0) flowRegime = "TURBULENT";
  else flowRegime = "CHAOTIC";

  let vortexClass: string;
  if (vorticityIndex >= 80) vortexClass = "SUPERCELL";
  else if (vorticityIndex >= 60) vortexClass = "CYCLONE";
  else if (vorticityIndex >= 40) vortexClass = "EDDY";
  else if (vorticityIndex >= 20) vortexClass = "RIPPLE";
  else vortexClass = "STAGNANT";

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsAnalyzed: n,
    totalUsd: r2(totalUsd),
    meanVorticity: r2(meanVort),
    maxVorticity: r2(maxVort),
    maxVorticityBin: sorted[maxVortIdx + 1]?.binId || activeBin,
    minVorticity: r2(minVort),
    minVorticityBin: sorted[minVortIdx + 1]?.binId || activeBin,
    enstrophy: r2(enstrophy),
    circulation: r2(circulation),
    helicity: r2(helicity),
    rossbyNumber: r4(rossbyNumber),
    vortexCoreCount: vortexCoreBins.length,
    vortexCoreBins: vortexCoreBins.slice(0, 10),
    taylorMicroscale: r4(taylorMicroscale),
    vortexStretching: r2(vortexStretching),
    palinstrophy: r2(palinstrophy),
    sheddingFrequency: r4(sheddingFrequency),
    lambOseenRadius,
    swirlNumber: r4(swirlNumber),
    qCriterion: r2(qCriterion),
    vorticityEntropy: r3(vorticityEntropy),
    vorticitySkewness: r4(vorticitySkewness),
    vorticityFlatness: r4(vorticityFlatness),
    enstrophyProduction: r2(enstrophyProduction),
    enstrophyDissipation: r2(enstrophyDissipation),
    vorticityFlux: r2(vorticityFlux),
    vorticityIndex,
    flowRegime,
    vortexClass,
    tvlUsd: pool.tvlUsd,
  };
}

function emptyProfile(pool: AppPool, activeBin: number, n: number, totalUsd: number): VorticityProfile {
  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsAnalyzed: n,
    totalUsd: r2(totalUsd),
    meanVorticity: 0, maxVorticity: 0, maxVorticityBin: activeBin,
    minVorticity: 0, minVorticityBin: activeBin,
    enstrophy: 0, circulation: 0, helicity: 0, rossbyNumber: 0,
    vortexCoreCount: 0, vortexCoreBins: [],
    taylorMicroscale: 0, vortexStretching: 0, palinstrophy: 0,
    sheddingFrequency: 0, lambOseenRadius: 0, swirlNumber: 0,
    qCriterion: 0, vorticityEntropy: 0, vorticitySkewness: 0,
    vorticityFlatness: 3, enstrophyProduction: 0, enstrophyDissipation: 0,
    vorticityFlux: 0, vorticityIndex: 0,
    flowRegime: "LAMINAR", vortexClass: "STAGNANT", tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r3(v: number): number { return Math.round(v * 1000) / 1000; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Vorticity — Doctor ===\n");
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

  const profiles: VorticityProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeVorticity(bins, pool));
    } catch {
      continue;
    }
  }

  const summary = {
    poolsAnalyzed: profiles.length,
    avgVorticityIndex: profiles.length > 0
      ? r2(profiles.reduce((s, p) => s + p.vorticityIndex, 0) / profiles.length)
      : 0,
    laminarCount: profiles.filter((p) => p.flowRegime === "LAMINAR").length,
    transitionalCount: profiles.filter((p) => p.flowRegime === "TRANSITIONAL").length,
    turbulentCount: profiles.filter((p) => p.flowRegime === "TURBULENT").length,
    chaoticCount: profiles.filter((p) => p.flowRegime === "CHAOTIC").length,
    avgEnstrophy: profiles.length > 0
      ? r2(profiles.reduce((s, p) => s + p.enstrophy, 0) / profiles.length)
      : 0,
    avgCirculation: profiles.length > 0
      ? r2(profiles.reduce((s, p) => s + p.circulation, 0) / profiles.length)
      : 0,
    avgSwirlNumber: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.swirlNumber, 0) / profiles.length)
      : 0,
    avgSheddingFrequency: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.sheddingFrequency, 0) / profiles.length)
      : 0,
    totalVortexCores: profiles.reduce((s, p) => s + p.vortexCoreCount, 0),
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-vorticity").description("HODLMM bin vorticity analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze vorticity")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
