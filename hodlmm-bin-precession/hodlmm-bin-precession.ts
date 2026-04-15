#!/usr/bin/env bun
/**
 * hodlmm-bin-precession.ts — Day 144 cocoa007 Bitflow Skills Comp
 *
 * Precession analyzer — models gyroscopic precession physics across HODLMM bins,
 * treating each bin as a spinning body whose angular momentum (reserve depth x volume)
 * resists compositional perturbation. External torque from neighbor imbalance causes
 * steady precession (drift) and nutation (wobble) around equilibrium.
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

interface BinPrecession {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  angularMomentum: number;
  precessionRate: number;
  nutationAmplitude: number;
  torqueMagnitude: number;
  gyroscopicStability: number;
  eulerAngle: number;
  momentOfInertia: number;
  precessionPeriod: number;
  nutationFrequency: number;
  wobbleDecay: number;
  spinAxisTilt: number;
  larmorFrequency: number;
  coneAngle: number;
  geometricPhase: number;
  stabilityMargin: number;
}

interface PrecessionProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgAngularMomentum: number;
  peakGyroscopicStability: number;
  peakBin: number;
  stableCount: number;
  precessingCount: number;
  nutatingCount: number;
  tumblingCount: number;
  toppledCount: number;
  avgPrecessionRate: number;
  avgNutationAmplitude: number;
  avgTorqueMagnitude: number;
  maxConeAngle: number;
  avgConeAngle: number;
  avgSpinAxisTilt: number;
  avgLarmorFrequency: number;
  avgMomentOfInertia: number;
  avgWobbleDecay: number;
  avgGeometricPhase: number;
  avgStabilityMargin: number;
  precessionGini: number;
  spinCoherence: number;
  torqueAlignment: number;
  precessionIndex: number;
  spinRegime: string;
  patternVerdict: string;
  topBins: BinPrecession[];
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

function computeBinPrecession(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  avgReserve: number,
  totalUsd: number,
  volume24hUsd: number,
  feeBps: number
): BinPrecession {
  const distance = Math.abs(bin.binId - activeBin);
  const n = allBins.length;
  const maxReserve = Math.max(...allBins.map((b) => b.totalUsd));

  const reserveFraction = totalUsd > 0 ? bin.totalUsd / totalUsd : 0;
  const proximityWeight = Math.exp(-distance * 0.3);
  const estimatedBinVolume = volume24hUsd * reserveFraction * proximityWeight;

  const spinSpeed = maxReserve > 0 ? bin.totalUsd / maxReserve : 0;
  const volumeFactor = totalUsd > 0 ? Math.min(1, estimatedBinVolume / Math.max(1, bin.totalUsd)) : 0;
  const angularMomentum = r4(spinSpeed * (0.6 + 0.4 * volumeFactor));

  const xRatio = bin.totalUsd > 0 ? bin.reserveXUsd / bin.totalUsd : 0.5;
  const eulerAngle = r4(xRatio * Math.PI);

  const neighbors = allBins.filter(
    (b) => Math.abs(b.binId - bin.binId) <= 2 && b.binId !== bin.binId
  );

  let torqueMagnitude = 0;
  if (neighbors.length > 0) {
    const avgNeighborXRatio = neighbors.reduce(
      (s, nb) => s + (nb.totalUsd > 0 ? nb.reserveXUsd / nb.totalUsd : 0.5), 0
    ) / neighbors.length;
    torqueMagnitude = r4(Math.abs(xRatio - avgNeighborXRatio));
  }

  const precessionRate = angularMomentum > 0
    ? r4(torqueMagnitude / angularMomentum)
    : r4(torqueMagnitude);

  let nutationAmplitude = 0;
  if (neighbors.length >= 2) {
    const neighborXRatios = neighbors.map(
      (nb) => nb.totalUsd > 0 ? nb.reserveXUsd / nb.totalUsd : 0.5
    );
    const maxRatio = Math.max(...neighborXRatios);
    const minRatio = Math.min(...neighborXRatios);
    nutationAmplitude = r4(maxRatio - minRatio);
  }

  const gyroscopicStability = r4(
    angularMomentum * (1 - precessionRate) * (1 - Math.min(1, nutationAmplitude))
  );

  const momentOfInertia = r4(
    1 - 2 * Math.abs(xRatio - 0.5)
  );

  const precessionPeriod = precessionRate > 0.01
    ? r4(2 * Math.PI / precessionRate)
    : 999;

  const nutationFrequency = nutationAmplitude > 0.01
    ? r4(nutationAmplitude * 2 * Math.PI)
    : 0;

  let wobbleDecay = 0.5;
  if (neighbors.length >= 2) {
    const innerNeighbors = allBins.filter(
      (b) => Math.abs(b.binId - bin.binId) === 1 && b.binId !== bin.binId
    );
    const outerNeighbors = allBins.filter(
      (b) => Math.abs(b.binId - bin.binId) === 2 && b.binId !== bin.binId
    );
    if (innerNeighbors.length > 0 && outerNeighbors.length > 0) {
      const innerTorque = innerNeighbors.reduce(
        (s, nb) => s + Math.abs((nb.totalUsd > 0 ? nb.reserveXUsd / nb.totalUsd : 0.5) - xRatio), 0
      ) / innerNeighbors.length;
      const outerTorque = outerNeighbors.reduce(
        (s, nb) => s + Math.abs((nb.totalUsd > 0 ? nb.reserveXUsd / nb.totalUsd : 0.5) - xRatio), 0
      ) / outerNeighbors.length;
      wobbleDecay = innerTorque > 0 ? r4(Math.min(1, outerTorque / innerTorque)) : 0;
    }
  }

  const spinAxisTilt = r4(Math.abs(xRatio - 0.5) * 2);

  const neighborFieldStrength = neighbors.length > 0
    ? neighbors.reduce((s, nb) => s + (maxReserve > 0 ? nb.totalUsd / maxReserve : 0), 0) / neighbors.length
    : 0;
  const larmorFrequency = r4(neighborFieldStrength * (1 - spinAxisTilt));

  const coneAngle = r4(
    precessionRate > 0 ? Math.min(Math.PI / 2, Math.atan(precessionRate / Math.max(0.01, angularMomentum))) : 0
  );

  const geometricPhase = r4(
    2 * Math.PI * (1 - Math.cos(coneAngle))
  );

  const stabilityMargin = r4(
    Math.max(0, Math.min(1, angularMomentum - torqueMagnitude))
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    angularMomentum,
    precessionRate,
    nutationAmplitude,
    torqueMagnitude,
    gyroscopicStability,
    eulerAngle,
    momentOfInertia,
    precessionPeriod,
    nutationFrequency,
    wobbleDecay,
    spinAxisTilt,
    larmorFrequency,
    coneAngle,
    geometricPhase,
    stabilityMargin,
  };
}

function analyzePrecession(bins: BinReserves[], pool: AppPool): PrecessionProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const avgReserve = totalUsd / n;
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const feeBps = pool.feeBps || 30;

  const binPrec = sorted.map((b) =>
    computeBinPrecession(b, activeBin, sorted, avgReserve, totalUsd, volume, feeBps)
  );

  const avgAngularMomentum = r4(
    binPrec.reduce((s, bp) => s + bp.angularMomentum, 0) / n
  );

  const stabilities = binPrec.map((bp) => bp.gyroscopicStability);
  const peakGyroscopicStability = r4(Math.max(0, ...stabilities));
  const peakBinData = binPrec.find((bp) => bp.gyroscopicStability === peakGyroscopicStability);
  const peakBin = peakBinData ? peakBinData.binId : activeBin;

  const stableCount = binPrec.filter((bp) => bp.gyroscopicStability >= 0.6).length;
  const precessingCount = binPrec.filter((bp) => bp.gyroscopicStability >= 0.35 && bp.gyroscopicStability < 0.6).length;
  const nutatingCount = binPrec.filter((bp) => bp.gyroscopicStability >= 0.15 && bp.gyroscopicStability < 0.35 && bp.nutationAmplitude > 0.1).length;
  const tumblingCount = binPrec.filter((bp) => bp.gyroscopicStability >= 0.05 && bp.gyroscopicStability < 0.15).length;
  const toppledCount = binPrec.filter((bp) => bp.gyroscopicStability < 0.05).length;

  const avgPrecessionRate = r4(binPrec.reduce((s, bp) => s + bp.precessionRate, 0) / n);
  const avgNutationAmplitude = r4(binPrec.reduce((s, bp) => s + bp.nutationAmplitude, 0) / n);
  const avgTorqueMagnitude = r4(binPrec.reduce((s, bp) => s + bp.torqueMagnitude, 0) / n);

  const coneAngles = binPrec.map((bp) => bp.coneAngle);
  const maxConeAngle = r4(Math.max(0, ...coneAngles));
  const avgConeAngle = r4(coneAngles.reduce((s, v) => s + v, 0) / n);

  const avgSpinAxisTilt = r4(binPrec.reduce((s, bp) => s + bp.spinAxisTilt, 0) / n);
  const avgLarmorFrequency = r4(binPrec.reduce((s, bp) => s + bp.larmorFrequency, 0) / n);
  const avgMomentOfInertia = r4(binPrec.reduce((s, bp) => s + bp.momentOfInertia, 0) / n);
  const avgWobbleDecay = r4(binPrec.reduce((s, bp) => s + bp.wobbleDecay, 0) / n);
  const avgGeometricPhase = r4(binPrec.reduce((s, bp) => s + bp.geometricPhase, 0) / n);
  const avgStabilityMargin = r4(binPrec.reduce((s, bp) => s + bp.stabilityMargin, 0) / n);

  const sortedStabilities = [...stabilities].sort((a, b) => b - a);
  const totalStability = sortedStabilities.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedStabilities[i];
  }
  const precessionGini = totalStability > 0
    ? r4(Math.abs(giniSum) / (n * totalStability))
    : 0;

  let spinCoherence = 0;
  if (n >= 3) {
    const tilts = binPrec.map((bp) => bp.spinAxisTilt);
    const avgTilt = tilts.reduce((s, t) => s + t, 0) / n;
    const tiltVariance = tilts.reduce((s, t) => s + (t - avgTilt) ** 2, 0) / n;
    spinCoherence = r4(Math.max(0, 1 - Math.sqrt(tiltVariance)));
  }

  let torqueAlignment = 0;
  if (n >= 3) {
    const xRatios = sorted.map((b) => b.totalUsd > 0 ? b.reserveXUsd / b.totalUsd : 0.5);
    let alignedPairs = 0;
    for (let i = 0; i < n - 1; i++) {
      const diff = xRatios[i + 1] - xRatios[i];
      if (i < n - 2) {
        const nextDiff = xRatios[i + 2] - xRatios[i + 1];
        if ((diff > 0 && nextDiff > 0) || (diff < 0 && nextDiff < 0) || (Math.abs(diff) < 0.05 && Math.abs(nextDiff) < 0.05)) {
          alignedPairs++;
        }
      }
    }
    torqueAlignment = n > 2 ? r4(alignedPairs / (n - 2)) : 0;
  }

  const stabilityScore = Math.min(25, (stableCount / Math.max(1, n)) * 50);
  const marginScore = Math.min(25, avgStabilityMargin * 25);
  const coherenceScore = Math.min(25, spinCoherence * 25);
  const lowPrecessionScore = Math.min(25, (1 - Math.min(1, avgPrecessionRate * 5)) * 25);
  const precessionIndex = Math.round(
    Math.min(100, stabilityScore + marginScore + coherenceScore + lowPrecessionScore)
  );

  let spinRegime: string;
  if (precessionIndex >= 80) spinRegime = "GYROSCOPICALLY_STABLE";
  else if (precessionIndex >= 60) spinRegime = "STEADY_PRECESSION";
  else if (precessionIndex >= 40) spinRegime = "NUTATING";
  else if (precessionIndex >= 20) spinRegime = "TUMBLING";
  else spinRegime = "TOPPLED";

  let patternVerdict: string;
  if (stableCount > n * 0.6 && avgStabilityMargin > 0.4)
    patternVerdict = "LOCKED";
  else if (stableCount + precessingCount > n * 0.6)
    patternVerdict = "PRECESSING";
  else if (nutatingCount > n * 0.3)
    patternVerdict = "WOBBLING";
  else if (tumblingCount + toppledCount > n * 0.4)
    patternVerdict = "UNSTABLE";
  else patternVerdict = "CHAOTIC";

  const topBins = [...binPrec]
    .sort((a, b) => b.gyroscopicStability - a.gyroscopicStability)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgAngularMomentum,
    peakGyroscopicStability,
    peakBin,
    stableCount,
    precessingCount,
    nutatingCount,
    tumblingCount,
    toppledCount,
    avgPrecessionRate,
    avgNutationAmplitude,
    avgTorqueMagnitude,
    maxConeAngle,
    avgConeAngle,
    avgSpinAxisTilt,
    avgLarmorFrequency,
    avgMomentOfInertia,
    avgWobbleDecay,
    avgGeometricPhase,
    avgStabilityMargin,
    precessionGini,
    spinCoherence,
    torqueAlignment,
    precessionIndex,
    spinRegime,
    patternVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Precession — Doctor ===\n");
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
        volume24hUsd: p.volume24hUsd,
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

  const profiles: PrecessionProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzePrecession(bins, pool));
    } catch {
      continue;
    }
  }

  const summary = {
    poolsAnalyzed: profiles.length,
    avgPrecessionIndex: profiles.length > 0
      ? r2(profiles.reduce((s, p) => s + p.precessionIndex, 0) / profiles.length)
      : 0,
    gyroscopicallyStableCount: profiles.filter((p) => p.spinRegime === "GYROSCOPICALLY_STABLE").length,
    steadyPrecessionCount: profiles.filter((p) => p.spinRegime === "STEADY_PRECESSION").length,
    nutatingPoolCount: profiles.filter((p) => p.spinRegime === "NUTATING").length,
    tumblingPoolCount: profiles.filter((p) => p.spinRegime === "TUMBLING").length,
    toppledPoolCount: profiles.filter((p) => p.spinRegime === "TOPPLED").length,
    avgAngularMomentum: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.avgAngularMomentum, 0) / profiles.length)
      : 0,
    avgStabilityMargin: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.avgStabilityMargin, 0) / profiles.length)
      : 0,
    totalStableBins: profiles.reduce((s, p) => s + p.stableCount, 0),
    totalToppledBins: profiles.reduce((s, p) => s + p.toppledCount, 0),
    avgPrecessionGini: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.precessionGini, 0) / profiles.length)
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-precession").description("HODLMM bin precession analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin precession dynamics")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
