#!/usr/bin/env bun
/**
 * hodlmm-bin-scattering.ts — Day 145 cocoa007 Bitflow Skills Comp
 *
 * Scattering analyzer — models particle scattering physics across HODLMM bins,
 * treating each bin as a scattering center whose cross-section (reserve depth)
 * determines how trade impact disperses across the bin range.
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

interface BinScattering {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  crossSection: number;
  meanFreePath: number;
  scatteringAngle: number;
  opacity: number;
  albedo: number;
  attenuation: number;
  forwardScatteringRatio: number;
  backscatterFraction: number;
  phaseFunction: number;
  extinctionCoeff: number;
  absorptionCoeff: number;
  opticalDepth: number;
  impactParameter: number;
  differentialCrossSection: number;
  totalCrossSection: number;
}

interface ScatteringProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgCrossSection: number;
  peakCrossSection: number;
  peakBin: number;
  transparentCount: number;
  translucentCount: number;
  opaqueCount: number;
  absorbingCount: number;
  opaqueWallCount: number;
  avgMeanFreePath: number;
  avgScatteringAngle: number;
  avgOpacity: number;
  avgAlbedo: number;
  avgAttenuation: number;
  avgForwardScatteringRatio: number;
  avgBackscatterFraction: number;
  avgExtinctionCoeff: number;
  avgAbsorptionCoeff: number;
  avgOpticalDepth: number;
  totalOpticalDepth: number;
  scatteringGini: number;
  scatteringCoherence: number;
  anisotropyFactor: number;
  scatteringIndex: number;
  scatteringRegime: string;
  patternVerdict: string;
  topBins: BinScattering[];
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

function computeBinScattering(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number
): BinScattering {
  const distance = Math.abs(bin.binId - activeBin);
  const n = allBins.length;
  const maxReserve = Math.max(...allBins.map((b) => b.totalUsd));

  const crossSection = maxReserve > 0 ? r4(bin.totalUsd / maxReserve) : 0;

  const neighbors = allBins.filter(
    (b) => Math.abs(b.binId - bin.binId) <= 3 && b.binId !== bin.binId
  );
  const binIndex = allBins.findIndex((b) => b.binId === bin.binId);

  let meanFreePath = 1;
  if (binIndex >= 0) {
    const gaps: number[] = [];
    for (let i = 0; i < allBins.length - 1; i++) {
      gaps.push(allBins[i + 1].binId - allBins[i].binId);
    }
    if (gaps.length > 0) {
      meanFreePath = r4(gaps.reduce((s, g) => s + g, 0) / gaps.length);
    }
  }

  const xRatio = bin.totalUsd > 0 ? bin.reserveXUsd / bin.totalUsd : 0.5;
  let neighborAvgXRatio = 0.5;
  if (neighbors.length > 0) {
    neighborAvgXRatio = neighbors.reduce(
      (s, nb) => s + (nb.totalUsd > 0 ? nb.reserveXUsd / nb.totalUsd : 0.5), 0
    ) / neighbors.length;
  }
  const compositionDelta = Math.abs(xRatio - neighborAvgXRatio);
  const scatteringAngle = r4(compositionDelta * Math.PI);

  const reserveFraction = totalUsd > 0 ? bin.totalUsd / totalUsd : 0;
  const proximityWeight = Math.exp(-distance * 0.3);
  const estimatedBinVolume = volume24hUsd * reserveFraction * proximityWeight;
  const volumeAbsorption = bin.totalUsd > 0
    ? Math.min(1, estimatedBinVolume / bin.totalUsd)
    : 0;

  const opacity = r4(crossSection * (0.5 + 0.5 * volumeAbsorption));

  const albedo = r4(1 - volumeAbsorption);

  const attenuation = r4(Math.exp(-crossSection * (distance + 1) * 0.2));

  let forwardNeighborReserve = 0;
  let backNeighborReserve = 0;
  const forwardBins = allBins.filter(
    (b) => b.binId > bin.binId && b.binId <= bin.binId + 3
  );
  const backBins = allBins.filter(
    (b) => b.binId < bin.binId && b.binId >= bin.binId - 3
  );
  forwardNeighborReserve = forwardBins.reduce((s, b) => s + b.totalUsd, 0);
  backNeighborReserve = backBins.reduce((s, b) => s + b.totalUsd, 0);
  const totalNeighborReserve = forwardNeighborReserve + backNeighborReserve;
  const forwardScatteringRatio = totalNeighborReserve > 0
    ? r4(forwardNeighborReserve / totalNeighborReserve)
    : 0.5;
  const backscatterFraction = r4(1 - forwardScatteringRatio);

  const phaseFunction = r4(
    (1 + Math.cos(scatteringAngle)) / 2
  );

  const extinctionCoeff = r4(crossSection * (1 + compositionDelta));
  const absorptionCoeff = r4(extinctionCoeff * volumeAbsorption);

  const opticalDepth = r4(extinctionCoeff * meanFreePath);

  const impactParameter = r4(
    distance > 0 ? Math.min(1, 1 / distance) : 1
  );

  const differentialCrossSection = r4(
    crossSection * phaseFunction * impactParameter
  );

  const totalCrossSection = r4(
    crossSection * (1 + 0.5 * compositionDelta)
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    crossSection,
    meanFreePath,
    scatteringAngle,
    opacity,
    albedo,
    attenuation,
    forwardScatteringRatio,
    backscatterFraction,
    phaseFunction,
    extinctionCoeff,
    absorptionCoeff,
    opticalDepth,
    impactParameter,
    differentialCrossSection,
    totalCrossSection,
  };
}

function analyzeScattering(bins: BinReserves[], pool: AppPool): ScatteringProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;

  const binScat = sorted.map((b) =>
    computeBinScattering(b, activeBin, sorted, totalUsd, volume)
  );

  const crossSections = binScat.map((bs) => bs.crossSection);
  const avgCrossSection = r4(crossSections.reduce((s, v) => s + v, 0) / n);
  const peakCrossSection = r4(Math.max(0, ...crossSections));
  const peakBinData = binScat.find((bs) => bs.crossSection === peakCrossSection);
  const peakBin = peakBinData ? peakBinData.binId : activeBin;

  const transparentCount = binScat.filter((bs) => bs.opacity < 0.15).length;
  const translucentCount = binScat.filter((bs) => bs.opacity >= 0.15 && bs.opacity < 0.4).length;
  const opaqueCount = binScat.filter((bs) => bs.opacity >= 0.4 && bs.opacity < 0.7).length;
  const absorbingCount = binScat.filter((bs) => bs.opacity >= 0.7 && bs.opacity < 0.9).length;
  const opaqueWallCount = binScat.filter((bs) => bs.opacity >= 0.9).length;

  const avgMeanFreePath = r4(binScat.reduce((s, bs) => s + bs.meanFreePath, 0) / n);
  const avgScatteringAngle = r4(binScat.reduce((s, bs) => s + bs.scatteringAngle, 0) / n);
  const avgOpacity = r4(binScat.reduce((s, bs) => s + bs.opacity, 0) / n);
  const avgAlbedo = r4(binScat.reduce((s, bs) => s + bs.albedo, 0) / n);
  const avgAttenuation = r4(binScat.reduce((s, bs) => s + bs.attenuation, 0) / n);
  const avgForwardScatteringRatio = r4(binScat.reduce((s, bs) => s + bs.forwardScatteringRatio, 0) / n);
  const avgBackscatterFraction = r4(binScat.reduce((s, bs) => s + bs.backscatterFraction, 0) / n);
  const avgExtinctionCoeff = r4(binScat.reduce((s, bs) => s + bs.extinctionCoeff, 0) / n);
  const avgAbsorptionCoeff = r4(binScat.reduce((s, bs) => s + bs.absorptionCoeff, 0) / n);
  const avgOpticalDepth = r4(binScat.reduce((s, bs) => s + bs.opticalDepth, 0) / n);
  const totalOpticalDepth = r4(binScat.reduce((s, bs) => s + bs.opticalDepth, 0));

  const sortedOpacities = [...binScat.map((bs) => bs.opacity)].sort((a, b) => b - a);
  const totalOpacity = sortedOpacities.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedOpacities[i];
  }
  const scatteringGini = totalOpacity > 0
    ? r4(Math.abs(giniSum) / (n * totalOpacity))
    : 0;

  let scatteringCoherence = 0;
  if (n >= 3) {
    const angles = binScat.map((bs) => bs.scatteringAngle);
    const avgAngle = angles.reduce((s, a) => s + a, 0) / n;
    const angleVariance = angles.reduce((s, a) => s + (a - avgAngle) ** 2, 0) / n;
    scatteringCoherence = r4(Math.max(0, 1 - Math.sqrt(angleVariance) * 2));
  }

  const anisotropyFactor = r4(
    avgForwardScatteringRatio > 0.5
      ? (avgForwardScatteringRatio - 0.5) * 2
      : -(0.5 - avgForwardScatteringRatio) * 2
  );

  const transparencyScore = Math.min(25, (1 - avgOpacity) * 25);
  const coherenceScore = Math.min(25, scatteringCoherence * 25);
  const lowExtinctionScore = Math.min(25, (1 - Math.min(1, avgExtinctionCoeff)) * 25);
  const forwardScore = Math.min(25, avgForwardScatteringRatio * 25);
  const scatteringIndex = Math.round(
    Math.min(100, transparencyScore + coherenceScore + lowExtinctionScore + forwardScore)
  );

  let scatteringRegime: string;
  if (scatteringIndex >= 80) scatteringRegime = "BALLISTIC";
  else if (scatteringIndex >= 60) scatteringRegime = "FORWARD_DOMINATED";
  else if (scatteringIndex >= 40) scatteringRegime = "DIFFUSIVE";
  else if (scatteringIndex >= 20) scatteringRegime = "ABSORPTIVE";
  else scatteringRegime = "OPAQUE_WALL";

  let patternVerdict: string;
  if (transparentCount > n * 0.6 && avgOpacity < 0.2)
    patternVerdict = "TRANSPARENT";
  else if (transparentCount + translucentCount > n * 0.6)
    patternVerdict = "TRANSLUCENT";
  else if (opaqueCount > n * 0.3)
    patternVerdict = "SCATTERING";
  else if (absorbingCount + opaqueWallCount > n * 0.4)
    patternVerdict = "ABSORBING";
  else patternVerdict = "OPAQUE";

  const topBins = [...binScat]
    .sort((a, b) => b.crossSection - a.crossSection)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgCrossSection,
    peakCrossSection,
    peakBin,
    transparentCount,
    translucentCount,
    opaqueCount,
    absorbingCount,
    opaqueWallCount,
    avgMeanFreePath,
    avgScatteringAngle,
    avgOpacity,
    avgAlbedo,
    avgAttenuation,
    avgForwardScatteringRatio,
    avgBackscatterFraction,
    avgExtinctionCoeff,
    avgAbsorptionCoeff,
    avgOpticalDepth,
    totalOpticalDepth,
    scatteringGini,
    scatteringCoherence,
    anisotropyFactor,
    scatteringIndex,
    scatteringRegime,
    patternVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Scattering — Doctor ===\n");
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

  const profiles: ScatteringProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeScattering(bins, pool));
    } catch {
      continue;
    }
  }

  const summary = {
    poolsAnalyzed: profiles.length,
    avgScatteringIndex: profiles.length > 0
      ? r2(profiles.reduce((s, p) => s + p.scatteringIndex, 0) / profiles.length)
      : 0,
    ballisticCount: profiles.filter((p) => p.scatteringRegime === "BALLISTIC").length,
    forwardDominatedCount: profiles.filter((p) => p.scatteringRegime === "FORWARD_DOMINATED").length,
    diffusiveCount: profiles.filter((p) => p.scatteringRegime === "DIFFUSIVE").length,
    absorptiveCount: profiles.filter((p) => p.scatteringRegime === "ABSORPTIVE").length,
    opaqueWallCount: profiles.filter((p) => p.scatteringRegime === "OPAQUE_WALL").length,
    avgCrossSection: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.avgCrossSection, 0) / profiles.length)
      : 0,
    avgOpacity: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.avgOpacity, 0) / profiles.length)
      : 0,
    totalTransparentBins: profiles.reduce((s, p) => s + p.transparentCount, 0),
    totalOpaqueBins: profiles.reduce((s, p) => s + p.opaqueWallCount, 0),
    avgScatteringGini: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.scatteringGini, 0) / profiles.length)
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-scattering").description("HODLMM bin scattering analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin scattering dynamics")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
