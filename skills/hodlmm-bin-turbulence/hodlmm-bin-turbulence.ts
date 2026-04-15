#!/usr/bin/env bun
/**
 * hodlmm-bin-turbulence.ts — Day 133 cocoa007 Bitflow Skills Comp
 *
 * Turbulence analyzer — models chaotic fluctuations in liquidity distribution
 * across HODLMM bins using fluid dynamics turbulence theory.
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

interface TurbulenceProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsAnalyzed: number;
  totalUsd: number;
  reynoldsNumber: number;
  turbulenceIntensity: number;
  eddyCount: number;
  avgEddyScale: number;
  maxEddyAmplitude: number;
  maxEddyBin: number;
  turbulentKineticEnergy: number;
  dissipationRate: number;
  integralScale: number;
  kolmogorovScale: number;
  eddyViscosity: number;
  anisotropy: number;
  intermittency: number;
  turbulentFlux: number;
  taylorMicroscale: number;
  energySpectralSlope: number;
  reserveKurtosis: number;
  laminarFraction: number;
  turbulentFraction: number;
  turbulenceIndex: number;
  flowRegime: string;
  stabilityClass: string;
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

function analyzeTurbulence(bins: BinReserves[], pool: AppPool): TurbulenceProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const reserves = sorted.map((b) => b.totalUsd);
  const meanReserve = totalUsd / n;

  // Detrend: remove linear trend to isolate fluctuations
  const xVals = sorted.map((_, i) => i);
  const xMean = (n - 1) / 2;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xVals[i] - xMean) * (reserves[i] - meanReserve);
    sxx += (xVals[i] - xMean) ** 2;
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = meanReserve - slope * xMean;
  const trend = xVals.map((x) => slope * x + intercept);
  const fluctuations = reserves.map((r, i) => r - trend[i]);

  // Turbulence intensity: RMS of fluctuations / mean
  const rms = Math.sqrt(fluctuations.reduce((s, f) => s + f * f, 0) / n);
  const turbulenceIntensity = meanReserve > 0
    ? Math.round((rms / meanReserve) * 1000) / 1000
    : 0;

  // Reynolds number analog: volume * bins / (mean_reserve * viscosity_proxy)
  const viscosityProxy = rms > 0 ? rms : meanReserve * 0.01;
  const reynoldsNumber = meanReserve > 0
    ? Math.round((pool.volume24hUsd * n) / (meanReserve * viscosityProxy + 1) * 100) / 100
    : 0;

  // Eddy detection: local extrema in fluctuations
  const eddies: { bin: number; amplitude: number; start: number; end: number }[] = [];
  for (let i = 1; i < n - 1; i++) {
    const isPeak = fluctuations[i] > fluctuations[i - 1] && fluctuations[i] > fluctuations[i + 1];
    const isTrough = fluctuations[i] < fluctuations[i - 1] && fluctuations[i] < fluctuations[i + 1];
    if (isPeak || isTrough) {
      eddies.push({
        bin: sorted[i].binId,
        amplitude: Math.abs(fluctuations[i]),
        start: i > 0 ? i - 1 : i,
        end: i < n - 1 ? i + 1 : i,
      });
    }
  }

  const eddyCount = eddies.length;
  const avgEddyScale = eddyCount > 0
    ? Math.round((eddies.reduce((s, e) => s + (e.end - e.start), 0) / eddyCount) * 100) / 100
    : 0;
  const maxEddy = eddies.reduce((m, e) => e.amplitude > m.amplitude ? e : m,
    { bin: activeBin, amplitude: 0, start: 0, end: 0 });

  // Turbulent kinetic energy: 0.5 * variance of fluctuations
  const variance = fluctuations.reduce((s, f) => s + f * f, 0) / n;
  const turbulentKineticEnergy = Math.round(variance * 0.5 * 100) / 100;

  // Dissipation rate: rate of energy cascade (second derivative of fluctuations)
  let dissipationSum = 0;
  for (let i = 1; i < n - 1; i++) {
    const d2 = fluctuations[i + 1] - 2 * fluctuations[i] + fluctuations[i - 1];
    dissipationSum += d2 * d2;
  }
  const dissipationRate = n > 2
    ? Math.round((dissipationSum / (n - 2)) * 100) / 100
    : 0;

  // Integral scale: autocorrelation length (first zero crossing)
  let integralScale = n;
  const autoCorr: number[] = [];
  for (let lag = 0; lag < Math.floor(n / 2); lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) {
      sum += fluctuations[i] * fluctuations[i + lag];
    }
    autoCorr.push(sum / (n - lag));
    if (lag > 0 && autoCorr[lag] <= 0) {
      integralScale = lag;
      break;
    }
  }
  integralScale = Math.min(integralScale, n);

  // Kolmogorov scale: smallest turbulent scale
  const kolmogorovScale = dissipationRate > 0
    ? Math.round(Math.pow(viscosityProxy ** 3 / (dissipationRate + 0.01), 0.25) * 1000) / 1000
    : n;

  // Eddy viscosity: turbulent transport coefficient
  const eddyViscosity = turbulentKineticEnergy > 0 && dissipationRate > 0
    ? Math.round((turbulentKineticEnergy / Math.sqrt(dissipationRate + 0.01)) * 1000) / 1000
    : 0;

  // Anisotropy: directional bias in fluctuations (left vs right of active bin)
  const activeIdx = sorted.findIndex((b) => b.binId >= activeBin);
  const midIdx = activeIdx >= 0 ? activeIdx : Math.floor(n / 2);
  const leftFluct = fluctuations.slice(0, midIdx);
  const rightFluct = fluctuations.slice(midIdx);
  const leftRms = leftFluct.length > 0
    ? Math.sqrt(leftFluct.reduce((s, f) => s + f * f, 0) / leftFluct.length) : 0;
  const rightRms = rightFluct.length > 0
    ? Math.sqrt(rightFluct.reduce((s, f) => s + f * f, 0) / rightFluct.length) : 0;
  const totalRms = leftRms + rightRms;
  const anisotropy = totalRms > 0
    ? Math.round(Math.abs(leftRms - rightRms) / totalRms * 1000) / 1000
    : 0;

  // Intermittency: kurtosis-based burstiness measure
  const m4 = fluctuations.reduce((s, f) => s + f ** 4, 0) / n;
  const m2 = variance;
  const kurtosis = m2 > 0 ? m4 / (m2 * m2) : 3;
  const reserveKurtosis = Math.round(kurtosis * 100) / 100;
  const intermittency = Math.round(Math.max(0, Math.min(100, (kurtosis - 3) * 15 + 50)));

  // Turbulent flux: net directional transport
  let fluxSum = 0;
  for (let i = 1; i < n; i++) {
    fluxSum += fluctuations[i] * (fluctuations[i] - fluctuations[i - 1]);
  }
  const turbulentFlux = n > 1
    ? Math.round((fluxSum / (n - 1)) * 100) / 100
    : 0;

  // Taylor microscale: intermediate scale between integral and Kolmogorov
  const taylorMicroscale = variance > 0 && dissipationRate > 0
    ? Math.round(Math.sqrt(variance / (dissipationRate + 0.01)) * 1000) / 1000
    : 0;

  // Energy spectral slope: log-log slope of power spectrum
  const halfN = Math.floor(n / 2);
  const powerSpectrum: number[] = [];
  for (let k = 1; k <= halfN; k++) {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) {
      const angle = 2 * Math.PI * k * i / n;
      re += fluctuations[i] * Math.cos(angle);
      im -= fluctuations[i] * Math.sin(angle);
    }
    powerSpectrum.push((re * re + im * im) / n);
  }

  let spectralSlope = -5 / 3; // default Kolmogorov
  if (powerSpectrum.length >= 3) {
    const logK = powerSpectrum.map((_, i) => Math.log(i + 1));
    const logP = powerSpectrum.map((p) => Math.log(p + 0.001));
    const meanLogK = logK.reduce((s, v) => s + v, 0) / logK.length;
    const meanLogP = logP.reduce((s, v) => s + v, 0) / logP.length;
    let sxySpec = 0, sxxSpec = 0;
    for (let i = 0; i < logK.length; i++) {
      sxySpec += (logK[i] - meanLogK) * (logP[i] - meanLogP);
      sxxSpec += (logK[i] - meanLogK) ** 2;
    }
    spectralSlope = sxxSpec > 0 ? sxySpec / sxxSpec : -5 / 3;
  }
  const energySpectralSlope = Math.round(spectralSlope * 100) / 100;

  // Laminar vs turbulent fraction
  const threshold = rms * 0.5;
  let laminarCount = 0;
  for (const f of fluctuations) {
    if (Math.abs(f) < threshold) laminarCount++;
  }
  const laminarFraction = Math.round((laminarCount / n) * 1000) / 1000;
  const turbulentFraction = Math.round((1 - laminarFraction) * 1000) / 1000;

  // Composite turbulence index (0-100, higher = more turbulent)
  const intensityScore = Math.min(25, turbulenceIntensity * 50);
  const eddyScore = Math.min(20, eddyCount / n * 40);
  const reynoldsScore = Math.min(20, Math.log(1 + reynoldsNumber) * 3);
  const intermittencyScore = intermittency / 100 * 15;
  const anisotropyScore = anisotropy * 20;
  const turbulenceIndex = Math.round(
    Math.min(100, intensityScore + eddyScore + reynoldsScore + intermittencyScore + anisotropyScore)
  );

  // Flow regime classification
  let flowRegime: string;
  if (turbulenceIntensity < 0.1 && eddyCount <= 2) flowRegime = "LAMINAR";
  else if (turbulenceIntensity < 0.3 && eddyCount <= n * 0.3) flowRegime = "TRANSITIONAL";
  else if (turbulenceIntensity < 0.6) flowRegime = "TURBULENT";
  else flowRegime = "CHAOTIC";

  // Stability class (A-F like atmospheric stability)
  let stabilityClass: string;
  if (turbulenceIndex < 15) stabilityClass = "F_VERY_STABLE";
  else if (turbulenceIndex < 30) stabilityClass = "E_STABLE";
  else if (turbulenceIndex < 45) stabilityClass = "D_NEUTRAL";
  else if (turbulenceIndex < 60) stabilityClass = "C_SLIGHTLY_UNSTABLE";
  else if (turbulenceIndex < 75) stabilityClass = "B_UNSTABLE";
  else stabilityClass = "A_VERY_UNSTABLE";

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsAnalyzed: n,
    totalUsd: Math.round(totalUsd * 100) / 100,
    reynoldsNumber,
    turbulenceIntensity,
    eddyCount,
    avgEddyScale,
    maxEddyAmplitude: Math.round(maxEddy.amplitude * 100) / 100,
    maxEddyBin: maxEddy.bin,
    turbulentKineticEnergy,
    dissipationRate,
    integralScale,
    kolmogorovScale,
    eddyViscosity,
    anisotropy,
    intermittency,
    turbulentFlux,
    taylorMicroscale,
    energySpectralSlope,
    reserveKurtosis,
    laminarFraction,
    turbulentFraction,
    turbulenceIndex,
    flowRegime,
    stabilityClass,
    tvlUsd: pool.tvlUsd,
  };
}

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Turbulence — Doctor ===\n");
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

  const profiles: TurbulenceProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeTurbulence(bins, pool));
    } catch {
      continue;
    }
  }

  const summary = {
    poolsAnalyzed: profiles.length,
    avgTurbulenceIndex: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + p.turbulenceIndex, 0) / profiles.length) * 10) / 10
      : 0,
    laminarCount: profiles.filter((p) => p.flowRegime === "LAMINAR").length,
    transitionalCount: profiles.filter((p) => p.flowRegime === "TRANSITIONAL").length,
    turbulentCount: profiles.filter((p) => p.flowRegime === "TURBULENT").length,
    chaoticCount: profiles.filter((p) => p.flowRegime === "CHAOTIC").length,
    avgReynoldsNumber: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + p.reynoldsNumber, 0) / profiles.length) * 100) / 100
      : 0,
    avgTurbulenceIntensity: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + p.turbulenceIntensity, 0) / profiles.length) * 1000) / 1000
      : 0,
    totalEddies: profiles.reduce((s, p) => s + p.eddyCount, 0),
    avgIntermittency: profiles.length > 0
      ? Math.round(profiles.reduce((s, p) => s + p.intermittency, 0) / profiles.length)
      : 0,
    avgAnisotropy: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + p.anisotropy, 0) / profiles.length) * 1000) / 1000
      : 0,
    avgEnergySpectralSlope: profiles.length > 0
      ? Math.round((profiles.reduce((s, p) => s + p.energySpectralSlope, 0) / profiles.length) * 100) / 100
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-turbulence").description("HODLMM bin turbulence analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze turbulence")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
