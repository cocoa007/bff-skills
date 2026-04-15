#!/usr/bin/env bun
/**
 * hodlmm-bin-luminescence.ts — Day 142 cocoa007 Bitflow Skills Comp
 *
 * Luminescence analyzer — measures the fee-emission radiance of HODLMM bins,
 * how brightly each bin glows from trading activity relative to its reserves.
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

interface BinLuminescence {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  luminousIntensity: number;
  quantumYield: number;
  emissionType: string;
  spectralClass: string;
  excitationEnergy: number;
  stokesShift: number;
  absorptionEdge: number;
  fluorescenceRatio: number;
  phosphorescenceRatio: number;
  blackbodyTemp: number;
  photonFlux: number;
  radiativeFraction: number;
  quenchingFactor: number;
  emissionBandwidth: number;
}

interface LuminescenceProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  totalLuminousFlux: number;
  avgLuminousIntensity: number;
  peakIntensity: number;
  peakBin: number;
  luminousEfficacy: number;
  avgQuantumYield: number;
  spectrumWidth: number;
  spectrumSkew: number;
  fluorescenceFraction: number;
  phosphorescenceFraction: number;
  avgBlackbodyTemp: number;
  avgStokesShift: number;
  totalPhotonFlux: number;
  avgRadiativeFraction: number;
  avgQuenchingFactor: number;
  emissionConcentration: number;
  darkBinCount: number;
  brightBinCount: number;
  supernovaCount: number;
  emissionGini: number;
  emissionDecayRate: number;
  emissionHalfWidth: number;
  luminescenceIndex: number;
  stellarClass: string;
  emissionVerdict: string;
  topBins: BinLuminescence[];
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

function computeBinLuminescence(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  avgReserve: number,
  totalUsd: number,
  volume24hUsd: number,
  feeBps: number
): BinLuminescence {
  const distance = Math.abs(bin.binId - activeBin);
  const n = allBins.length;

  const proximityWeight = Math.exp(-distance * 0.3);
  const reserveFraction = totalUsd > 0 ? bin.totalUsd / totalUsd : 0;
  const estimatedBinVolume = volume24hUsd * reserveFraction * proximityWeight;
  const estimatedFees = estimatedBinVolume * (feeBps / 10000);

  const luminousIntensity = bin.totalUsd > 0
    ? r4(estimatedFees / bin.totalUsd)
    : 0;

  const maxPossibleFees = bin.totalUsd * (feeBps / 10000) * 10;
  const quantumYield = maxPossibleFees > 0
    ? r4(Math.min(1, estimatedFees / maxPossibleFees))
    : 0;

  let emissionType: string;
  if (distance <= 1) emissionType = "fluorescence";
  else if (distance <= 5) emissionType = "phosphorescence";
  else if (distance <= 15) emissionType = "chemiluminescence";
  else emissionType = "bioluminescence";

  const reserveRatio = avgReserve > 0 ? bin.totalUsd / avgReserve : 0;
  let spectralClass: string;
  if (luminousIntensity > 0.1 && reserveRatio < 0.5) spectralClass = "WHITE_DWARF";
  else if (luminousIntensity > 0.05 && reserveRatio > 2.0) spectralClass = "RED_GIANT";
  else if (luminousIntensity > 0.01) spectralClass = "MAIN_SEQUENCE";
  else if (luminousIntensity > 0.001) spectralClass = "BROWN_DWARF";
  else spectralClass = "BLACK_HOLE";

  const excitationEnergy = bin.totalUsd > 0
    ? r4(bin.totalUsd * 0.001 * (1 + distance * 0.1))
    : 0;

  const stokesShift = r4(distance * 0.05 * (1 + (1 - quantumYield)));

  const absorptionEdge = r4(avgReserve * 0.05 * (1 + distance * 0.02));

  const fluorescenceRatio = distance <= 3
    ? r4(Math.exp(-distance * 0.5))
    : 0;
  const phosphorescenceRatio = distance > 1
    ? r4(Math.exp(-(distance - 1) * 0.15) * 0.5)
    : 0;

  const normalizedIntensity = luminousIntensity * 10;
  const blackbodyTemp = r2(1000 + normalizedIntensity * 50000);

  const photonFlux = r4(estimatedFees * (1 / (feeBps / 10000 + 0.01)));

  const totalEmission = estimatedFees;
  const thermalLoss = estimatedFees * (1 - quantumYield);
  const radiativeFraction = totalEmission > 0
    ? r4(1 - thermalLoss / totalEmission)
    : 0;

  const neighborBins = allBins.filter(
    (b) => Math.abs(b.binId - bin.binId) <= 2 && b.binId !== bin.binId
  );
  const avgNeighborReserve = neighborBins.length > 0
    ? neighborBins.reduce((s, b) => s + b.totalUsd, 0) / neighborBins.length
    : 0;
  const quenchingFactor = avgNeighborReserve > 0 && bin.totalUsd > 0
    ? r4(Math.min(1, avgNeighborReserve / (bin.totalUsd * 2)))
    : 0;

  const reserveSpread = allBins.map((b) => Math.abs(b.binId - bin.binId));
  const maxSpread = Math.max(1, ...reserveSpread);
  const emissionBandwidth = r4(
    (neighborBins.length / Math.max(1, n - 1)) * maxSpread * 0.1
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    luminousIntensity,
    quantumYield,
    emissionType,
    spectralClass,
    excitationEnergy,
    stokesShift,
    absorptionEdge,
    fluorescenceRatio,
    phosphorescenceRatio,
    blackbodyTemp,
    photonFlux,
    radiativeFraction,
    quenchingFactor,
    emissionBandwidth,
  };
}

function analyzeLuminescence(bins: BinReserves[], pool: AppPool): LuminescenceProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const avgReserve = totalUsd / n;
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const feeBps = pool.feeBps || 30;

  const binLum = sorted.map((b) =>
    computeBinLuminescence(b, activeBin, sorted, avgReserve, totalUsd, volume, feeBps)
  );

  const intensities = binLum.map((bl) => bl.luminousIntensity);
  const totalLuminousFlux = r4(intensities.reduce((s, v) => s + v, 0));
  const avgLuminousIntensity = r4(totalLuminousFlux / n);
  const peakIntensity = r4(Math.max(0, ...intensities));
  const peakBinData = binLum.find((bl) => bl.luminousIntensity === peakIntensity);
  const peakBin = peakBinData ? peakBinData.binId : activeBin;

  const luminousEfficacy = totalUsd > 0
    ? r4(totalLuminousFlux / (totalUsd / 10000))
    : 0;

  const avgQuantumYield = r4(
    binLum.reduce((s, bl) => s + bl.quantumYield, 0) / n
  );

  const populatedPositions = sorted.map((b) => b.binId);
  const spectrumWidth = populatedPositions.length > 1
    ? populatedPositions[populatedPositions.length - 1] - populatedPositions[0]
    : 0;

  const leftIntensity = binLum
    .filter((bl) => bl.binId < activeBin)
    .reduce((s, bl) => s + bl.luminousIntensity, 0);
  const rightIntensity = binLum
    .filter((bl) => bl.binId > activeBin)
    .reduce((s, bl) => s + bl.luminousIntensity, 0);
  const spectrumSkew = totalLuminousFlux > 0
    ? r4((rightIntensity - leftIntensity) / totalLuminousFlux)
    : 0;

  const fluorescenceCount = binLum.filter((bl) => bl.emissionType === "fluorescence").length;
  const phosphorescenceCount = binLum.filter(
    (bl) => bl.emissionType === "phosphorescence"
  ).length;
  const fluorescenceFraction = r4(fluorescenceCount / n);
  const phosphorescenceFraction = r4(phosphorescenceCount / n);

  const avgBlackbodyTemp = r2(
    binLum.reduce((s, bl) => s + bl.blackbodyTemp, 0) / n
  );
  const avgStokesShift = r4(
    binLum.reduce((s, bl) => s + bl.stokesShift, 0) / n
  );

  const totalPhotonFlux = r4(
    binLum.reduce((s, bl) => s + bl.photonFlux, 0)
  );
  const avgRadiativeFraction = r4(
    binLum.reduce((s, bl) => s + bl.radiativeFraction, 0) / n
  );
  const avgQuenchingFactor = r4(
    binLum.reduce((s, bl) => s + bl.quenchingFactor, 0) / n
  );

  const sortedIntensities = [...intensities].sort((a, b) => b - a);
  const top20pct = Math.max(1, Math.ceil(n * 0.2));
  const top20sum = sortedIntensities.slice(0, top20pct).reduce((s, v) => s + v, 0);
  const emissionConcentration = totalLuminousFlux > 0
    ? r4(top20sum / totalLuminousFlux)
    : 0;

  const darkThreshold = avgLuminousIntensity * 0.1;
  const brightThreshold = avgLuminousIntensity * 3;
  const darkBinCount = binLum.filter((bl) => bl.luminousIntensity < darkThreshold).length;
  const brightBinCount = binLum.filter((bl) => bl.luminousIntensity > brightThreshold).length;
  const supernovaCount = binLum.filter((bl) => bl.luminousIntensity > avgLuminousIntensity * 10).length;

  const sortedByIntensity = [...intensities].sort((a, b) => b - a);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedByIntensity[i];
  }
  const emissionGini = totalLuminousFlux > 0
    ? r4(Math.abs(giniSum) / (n * totalLuminousFlux))
    : 0;

  const binsByDistance = binLum
    .filter((bl) => bl.luminousIntensity > 0)
    .sort((a, b) => a.distanceFromActive - b.distanceFromActive);
  let emissionDecayRate = 0;
  if (binsByDistance.length >= 3) {
    const nearIntensity = binsByDistance.slice(0, 3).reduce((s, bl) => s + bl.luminousIntensity, 0) / 3;
    const farIntensity = binsByDistance.slice(-3).reduce((s, bl) => s + bl.luminousIntensity, 0) / 3;
    emissionDecayRate = nearIntensity > 0
      ? r4(1 - farIntensity / nearIntensity)
      : 0;
  }

  let emissionHalfWidth = 0;
  if (peakIntensity > 0) {
    const halfMax = peakIntensity / 2;
    const aboveHalf = binLum.filter((bl) => bl.luminousIntensity >= halfMax);
    if (aboveHalf.length > 1) {
      const positions = aboveHalf.map((bl) => bl.binId);
      emissionHalfWidth = Math.max(...positions) - Math.min(...positions);
    }
  }

  const efficacyScore = Math.min(25, luminousEfficacy * 250);
  const yieldScore = Math.min(25, avgQuantumYield * 25);
  const coverageScore = Math.min(25, (1 - emissionConcentration) * 25 + (1 - emissionGini) * 12.5);
  const tempScore = Math.min(25, Math.min(1, (avgBlackbodyTemp - 1000) / 50000) * 25);
  const luminescenceIndex = Math.round(
    Math.min(100, efficacyScore + yieldScore + coverageScore + tempScore)
  );

  let stellarClass: string;
  if (luminescenceIndex >= 80) stellarClass = "SUPERNOVA";
  else if (luminescenceIndex >= 60) stellarClass = "MAIN_SEQUENCE";
  else if (luminescenceIndex >= 40) stellarClass = "RED_GIANT";
  else if (luminescenceIndex >= 20) stellarClass = "WHITE_DWARF";
  else stellarClass = "BLACK_HOLE";

  let emissionVerdict: string;
  if (avgQuantumYield > 0.5 && luminousEfficacy > 0.05) emissionVerdict = "RADIANT";
  else if (avgQuantumYield > 0.3 && luminousEfficacy > 0.02) emissionVerdict = "LUMINOUS";
  else if (avgQuantumYield > 0.15) emissionVerdict = "GLOWING";
  else if (avgQuantumYield > 0.05) emissionVerdict = "DIM";
  else emissionVerdict = "DARK";

  const topBins = [...binLum]
    .sort((a, b) => b.luminousIntensity - a.luminousIntensity)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    totalLuminousFlux,
    avgLuminousIntensity,
    peakIntensity,
    peakBin,
    luminousEfficacy,
    avgQuantumYield,
    spectrumWidth,
    spectrumSkew,
    fluorescenceFraction,
    phosphorescenceFraction,
    avgBlackbodyTemp,
    avgStokesShift,
    totalPhotonFlux,
    avgRadiativeFraction,
    avgQuenchingFactor,
    emissionConcentration,
    darkBinCount,
    brightBinCount,
    supernovaCount,
    emissionGini,
    emissionDecayRate,
    emissionHalfWidth,
    luminescenceIndex,
    stellarClass,
    emissionVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Luminescence — Doctor ===\n");
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

  const profiles: LuminescenceProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeLuminescence(bins, pool));
    } catch {
      continue;
    }
  }

  const summary = {
    poolsAnalyzed: profiles.length,
    avgLuminescenceIndex: profiles.length > 0
      ? r2(profiles.reduce((s, p) => s + p.luminescenceIndex, 0) / profiles.length)
      : 0,
    supernovaCount: profiles.filter((p) => p.stellarClass === "SUPERNOVA").length,
    mainSequenceCount: profiles.filter((p) => p.stellarClass === "MAIN_SEQUENCE").length,
    redGiantCount: profiles.filter((p) => p.stellarClass === "RED_GIANT").length,
    whiteDwarfCount: profiles.filter((p) => p.stellarClass === "WHITE_DWARF").length,
    blackHoleCount: profiles.filter((p) => p.stellarClass === "BLACK_HOLE").length,
    avgQuantumYield: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.avgQuantumYield, 0) / profiles.length)
      : 0,
    avgLuminousEfficacy: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.luminousEfficacy, 0) / profiles.length)
      : 0,
    totalPhotonFlux: r4(profiles.reduce((s, p) => s + p.totalPhotonFlux, 0)),
    avgEmissionGini: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.emissionGini, 0) / profiles.length)
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-luminescence").description("HODLMM bin luminescence analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin luminescence emission")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
