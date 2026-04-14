#!/usr/bin/env bun
/**
 * hodlmm-bin-divergence.ts — Day 97 cocoa007 Bitflow Skills Comp
 *
 * Statistical distance metrics between actual bin reserve distributions
 * and theoretical reference distributions (uniform, Gaussian, Laplace).
 * KL-divergence, Jensen-Shannon divergence, Wasserstein distance,
 * Bhattacharyya coefficient, total variation distance.
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 30;

type ReferenceDistribution = "uniform" | "gaussian" | "laplace";

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

interface DistanceMetrics {
  klDivergence: number;
  jsDistance: number;
  wasserstein: number;
  bhattacharyya: number;
  totalVariation: number;
  hellingerDistance: number;
}

interface ReferenceComparison {
  reference: ReferenceDistribution;
  metrics: DistanceMetrics;
  fitScore: number;
}

interface DivergenceProfile {
  populatedBins: number;
  totalBins: number;
  scannedTvlUsd: number;
  actualEntropy: number;
  maxEntropy: number;
  entropyRatio: number;
  bestFit: ReferenceDistribution;
  bestFitScore: number;
  comparisons: ReferenceComparison[];
  tailWeight: { left: number; right: number };
  peakedness: number;
  asymmetry: number;
  divergenceScore: number;
  asciiDistributionMap: string;
}

interface DivergenceAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  profile: DivergenceProfile;
  recommendation: string;
}

// -- Helpers ------------------------------------------------------------------

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
  if (!resp.ok) throw new Error(`HTTP ${resp.status} calling ${fn}`);
  return resp.json();
}

function cvUint(n: number): string {
  const hex = n.toString(16).padStart(32, "0");
  return `0x01${hex}`;
}

function parseUintResult(hex: string): number {
  if (hex.startsWith("0x")) hex = hex.slice(2);
  if (hex.startsWith("00")) hex = hex.slice(2);
  const tag = hex.slice(0, 2);
  if (tag === "01") return parseInt(hex.slice(2), 16);
  return 0;
}

function parseTupleReserves(hex: string): { reserveX: number; reserveY: number } {
  const fallback = { reserveX: 0, reserveY: 0 };
  if (!hex || hex.length < 10) return fallback;
  if (hex.startsWith("0x")) hex = hex.slice(2);
  try {
    let pos = 0;
    if (hex.slice(pos, pos + 2) === "00") pos += 2;
    const tag = hex.slice(pos, pos + 2);
    pos += 2;
    if (tag !== "0c") return fallback;
    const numKeys = parseInt(hex.slice(pos, pos + 8), 16);
    pos += 8;
    const values: Record<string, number> = {};
    for (let i = 0; i < numKeys; i++) {
      const nameLen = parseInt(hex.slice(pos, pos + 2), 16);
      pos += 2;
      const nameBytes = hex.slice(pos, pos + nameLen * 2);
      pos += nameLen * 2;
      const name = Buffer.from(nameBytes, "hex").toString("ascii");
      const valTag = hex.slice(pos, pos + 2);
      pos += 2;
      if (valTag === "01") {
        const raw = hex.slice(pos, pos + 32);
        pos += 32;
        values[name] = parseInt(raw, 16);
      } else {
        break;
      }
    }
    return {
      reserveX: values["reserve-x"] ?? values["reserveX"] ?? 0,
      reserveY: values["reserve-y"] ?? values["reserveY"] ?? 0,
    };
  } catch {
    return fallback;
  }
}

function fmtUsd(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 1) return v.toFixed(2);
  if (v >= 0.001) return v.toFixed(4);
  return v.toFixed(6);
}

// -- Pool discovery -----------------------------------------------------------

async function discoverPools(): Promise<AppPool[]> {
  const data = await fetchJson(`${BFF_APP_BASE}/pools`);
  const pools: any[] = data.data ?? data.results ?? data.pools ?? [];
  return pools
    .filter((p: any) => {
      const tvl = Number(p.tvlUsd ?? p.tvl ?? 0);
      const id = String(p.poolId ?? "");
      return tvl >= MIN_TVL_USD && id.startsWith("dlmm_");
    })
    .map((p: any) => {
      const tx = p.tokens?.tokenX ?? {};
      const ty = p.tokens?.tokenY ?? {};
      const numericId = parseInt(String(p.poolId).replace("dlmm_", ""), 10);
      const feeBps = p.baseFee != null ? Math.round(Number(p.baseFee) * 10000) : undefined;
      return {
        id: p.poolId ?? `${tx.symbol}-${ty.symbol}`,
        token0Symbol: tx.symbol ?? "?",
        token1Symbol: ty.symbol ?? "?",
        tvlUsd: Number(p.tvlUsd ?? 0),
        volume24hUsd: Number(p.volumeUsd1d ?? 0),
        poolId: numericId,
        token0Decimals: Number(tx.decimals ?? 8),
        token1Decimals: Number(ty.decimals ?? 6),
        token0PriceUsd: Number(tx.priceUsd ?? 0),
        token1PriceUsd: Number(ty.priceUsd ?? 0),
        activeBinId: p.activeBinId != null ? Number(p.activeBinId) : undefined,
        feeBps,
      };
    });
}

// -- On-chain reads -----------------------------------------------------------

async function getActiveBin(poolId: number): Promise<number> {
  const res = await callReadOnly("get-active-bin-id", [cvUint(poolId)]);
  return parseUintResult(res.result ?? "");
}

async function getBinReserves(
  poolId: number,
  binId: number,
  p: AppPool
): Promise<BinReserves> {
  const res = await callReadOnly("get-bin-reserves", [
    cvUint(poolId),
    cvUint(binId),
  ]);
  const hex = res.result ?? "";
  const { reserveX, reserveY } = parseTupleReserves(hex);

  const rx = reserveX / 10 ** p.token0Decimals;
  const ry = reserveY / 10 ** p.token1Decimals;
  const rxUsd = rx * p.token0PriceUsd;
  const ryUsd = ry * p.token1PriceUsd;
  const totalUsd = rxUsd + ryUsd;

  return { binId, reserveX: rx, reserveY: ry, reserveXUsd: rxUsd, reserveYUsd: ryUsd, totalUsd };
}

async function scanBins(
  poolId: number,
  activeBin: number,
  pool: AppPool,
  radius: number
): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const start = activeBin - radius;
  const end = activeBin + radius;

  const batch = 5;
  for (let i = start; i <= end; i += batch) {
    const chunk = [];
    for (let j = i; j < Math.min(i + batch, end + 1); j++) {
      chunk.push(getBinReserves(poolId, j, pool));
    }
    const results = await Promise.all(chunk);
    bins.push(...results);
  }
  return bins.sort((a, b) => a.binId - b.binId);
}

// -- Distribution math --------------------------------------------------------

function normalize(values: number[]): number[] {
  const sum = values.reduce((s, v) => s + v, 0);
  if (sum === 0) return values.map(() => 1 / values.length);
  return values.map(v => v / sum);
}

function smoothDistribution(dist: number[], epsilon = 1e-10): number[] {
  return dist.map(v => v + epsilon);
}

function shannonEntropy(dist: number[]): number {
  const norm = normalize(smoothDistribution(dist));
  return -norm.reduce((s, p) => s + (p > 0 ? p * Math.log2(p) : 0), 0);
}

function generateUniform(n: number): number[] {
  return new Array(n).fill(1 / n);
}

function generateGaussian(n: number, sigma?: number): number[] {
  const center = (n - 1) / 2;
  const s = sigma ?? n / 6;
  const raw = Array.from({ length: n }, (_, i) =>
    Math.exp(-0.5 * ((i - center) / s) ** 2)
  );
  return normalize(raw);
}

function generateLaplace(n: number, b?: number): number[] {
  const center = (n - 1) / 2;
  const scale = b ?? n / 6;
  const raw = Array.from({ length: n }, (_, i) =>
    Math.exp(-Math.abs(i - center) / scale)
  );
  return normalize(raw);
}

function klDivergence(p: number[], q: number[]): number {
  const pNorm = normalize(smoothDistribution(p));
  const qNorm = normalize(smoothDistribution(q));
  let kl = 0;
  for (let i = 0; i < pNorm.length; i++) {
    if (pNorm[i] > 0 && qNorm[i] > 0) {
      kl += pNorm[i] * Math.log2(pNorm[i] / qNorm[i]);
    }
  }
  return Math.max(0, kl);
}

function jensenShannonDistance(p: number[], q: number[]): number {
  const pNorm = normalize(smoothDistribution(p));
  const qNorm = normalize(smoothDistribution(q));
  const m = pNorm.map((v, i) => (v + qNorm[i]) / 2);
  const jsd = (klDivergence(pNorm, m) + klDivergence(qNorm, m)) / 2;
  return Math.sqrt(Math.max(0, jsd));
}

function wassersteinDistance(p: number[], q: number[]): number {
  const pNorm = normalize(smoothDistribution(p));
  const qNorm = normalize(smoothDistribution(q));
  let cdfP = 0;
  let cdfQ = 0;
  let dist = 0;
  for (let i = 0; i < pNorm.length; i++) {
    cdfP += pNorm[i];
    cdfQ += qNorm[i];
    dist += Math.abs(cdfP - cdfQ);
  }
  return dist;
}

function bhattacharyyaCoefficient(p: number[], q: number[]): number {
  const pNorm = normalize(smoothDistribution(p));
  const qNorm = normalize(smoothDistribution(q));
  let bc = 0;
  for (let i = 0; i < pNorm.length; i++) {
    bc += Math.sqrt(pNorm[i] * qNorm[i]);
  }
  return Math.min(1, bc);
}

function totalVariationDistance(p: number[], q: number[]): number {
  const pNorm = normalize(smoothDistribution(p));
  const qNorm = normalize(smoothDistribution(q));
  let tv = 0;
  for (let i = 0; i < pNorm.length; i++) {
    tv += Math.abs(pNorm[i] - qNorm[i]);
  }
  return tv / 2;
}

function hellingerDistance(p: number[], q: number[]): number {
  const pNorm = normalize(smoothDistribution(p));
  const qNorm = normalize(smoothDistribution(q));
  let sum = 0;
  for (let i = 0; i < pNorm.length; i++) {
    const diff = Math.sqrt(pNorm[i]) - Math.sqrt(qNorm[i]);
    sum += diff * diff;
  }
  return Math.sqrt(sum / 2);
}

function computeDistanceMetrics(actual: number[], reference: number[]): DistanceMetrics {
  return {
    klDivergence: Math.round(klDivergence(actual, reference) * 10000) / 10000,
    jsDistance: Math.round(jensenShannonDistance(actual, reference) * 10000) / 10000,
    wasserstein: Math.round(wassersteinDistance(actual, reference) * 10000) / 10000,
    bhattacharyya: Math.round(bhattacharyyaCoefficient(actual, reference) * 10000) / 10000,
    totalVariation: Math.round(totalVariationDistance(actual, reference) * 10000) / 10000,
    hellingerDistance: Math.round(hellingerDistance(actual, reference) * 10000) / 10000,
  };
}

function fitScore(metrics: DistanceMetrics): number {
  const jsNorm = Math.max(0, 1 - metrics.jsDistance);
  const tvNorm = Math.max(0, 1 - metrics.totalVariation);
  const bcNorm = metrics.bhattacharyya;
  const hNorm = Math.max(0, 1 - metrics.hellingerDistance);
  const score = (jsNorm * 30 + tvNorm * 25 + bcNorm * 25 + hNorm * 20);
  return Math.round(score);
}

function computeTailWeight(dist: number[]): { left: number; right: number } {
  const n = dist.length;
  if (n < 6) return { left: 0, right: 0 };
  const norm = normalize(dist);
  const tailSize = Math.max(2, Math.floor(n * 0.2));
  const leftTail = norm.slice(0, tailSize).reduce((s, v) => s + v, 0);
  const rightTail = norm.slice(n - tailSize).reduce((s, v) => s + v, 0);
  return {
    left: Math.round(leftTail * 10000) / 10000,
    right: Math.round(rightTail * 10000) / 10000,
  };
}

function computePeakedness(dist: number[]): number {
  const norm = normalize(dist);
  const n = norm.length;
  if (n === 0) return 0;
  const mean = norm.reduce((s, v, i) => s + v * i, 0);
  const variance = norm.reduce((s, v, i) => s + v * (i - mean) ** 2, 0);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  const kurtosis = norm.reduce((s, v, i) => s + v * ((i - mean) / std) ** 4, 0) - 3;
  return Math.round(kurtosis * 1000) / 1000;
}

function computeAsymmetry(dist: number[]): number {
  const norm = normalize(dist);
  const n = norm.length;
  if (n === 0) return 0;
  const mean = norm.reduce((s, v, i) => s + v * i, 0);
  const variance = norm.reduce((s, v, i) => s + v * (i - mean) ** 2, 0);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  const skewness = norm.reduce((s, v, i) => s + v * ((i - mean) / std) ** 3, 0);
  return Math.round(skewness * 1000) / 1000;
}

function computeDivergenceScore(
  comparisons: ReferenceComparison[],
  entropyRatio: number,
  peakedness: number,
  asymmetry: number
): number {
  const bestFitScore = Math.max(...comparisons.map(c => c.fitScore));
  let score = bestFitScore * 0.5;
  score += entropyRatio * 20;
  score += Math.max(0, 10 - Math.abs(peakedness) * 2);
  score += Math.max(0, 10 - Math.abs(asymmetry) * 3);
  score += (1 - Math.max(...comparisons.map(c => c.metrics.totalVariation))) * 10;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// -- ASCII map ----------------------------------------------------------------

function buildDistributionMap(
  bins: BinReserves[],
  activeBinId: number,
  comparisons: ReferenceComparison[]
): string {
  const populated = bins.filter(b => b.totalUsd > 0.01);
  if (populated.length === 0) return "(no populated bins)";

  const values = bins.map(b => b.totalUsd);
  const maxVal = Math.max(...values, 0.001);
  const barWidth = 30;

  const lines: string[] = [
    "DISTRIBUTION MAP (actual vs best-fit reference)",
    "",
    "  offset  |  $value  |  actual                         | best-fit",
    "  --------+----------+---------------------------------+---------",
  ];

  const bestRef = comparisons.reduce((a, b) => a.fitScore > b.fitScore ? a : b);
  let refDist: number[];
  if (bestRef.reference === "uniform") refDist = generateUniform(bins.length);
  else if (bestRef.reference === "gaussian") refDist = generateGaussian(bins.length);
  else refDist = generateLaplace(bins.length);
  const refScaled = refDist.map(v => v * values.reduce((s, x) => s + x, 0));

  const step = bins.length > 40 ? 2 : 1;
  for (let i = 0; i < bins.length; i += step) {
    const bin = bins[i];
    const offset = bin.binId - activeBinId;
    const label = `${offset >= 0 ? "+" : ""}${offset}`;
    const usd = fmtUsd(bin.totalUsd).padStart(7);
    const actualLen = Math.round((bin.totalUsd / maxVal) * barWidth);
    const refLen = Math.round((refScaled[i] / maxVal) * barWidth);
    const actualBar = "█".repeat(Math.max(0, actualLen));
    const refBar = "░".repeat(Math.max(0, refLen));
    const marker = offset === 0 ? " ◄" : "";
    lines.push(
      `  ${label.padStart(6)}  | ${usd} | ${actualBar.padEnd(barWidth)} | ${refBar}${marker}`
    );
  }

  lines.push("");
  lines.push(`█ = actual    ░ = ${bestRef.reference} reference (fit: ${bestRef.fitScore}/100)`);
  return lines.join("\n");
}

// -- Profile ------------------------------------------------------------------

function buildProfile(bins: BinReserves[], activeBinId: number): DivergenceProfile {
  const populated = bins.filter(b => b.totalUsd > 0.01);
  const scannedTvl = populated.reduce((s, b) => s + b.totalUsd, 0);
  const values = bins.map(b => b.totalUsd);

  const actualEntropy = shannonEntropy(values);
  const maxEntropy = Math.log2(populated.length || 1);
  const entropyRatio = maxEntropy > 0 ? actualEntropy / maxEntropy : 0;

  const refs: { name: ReferenceDistribution; dist: number[] }[] = [
    { name: "uniform", dist: generateUniform(bins.length) },
    { name: "gaussian", dist: generateGaussian(bins.length) },
    { name: "laplace", dist: generateLaplace(bins.length) },
  ];

  const comparisons: ReferenceComparison[] = refs.map(r => {
    const metrics = computeDistanceMetrics(values, r.dist);
    return { reference: r.name, metrics, fitScore: fitScore(metrics) };
  });

  const bestComparison = comparisons.reduce((a, b) =>
    a.fitScore > b.fitScore ? a : b
  );

  const tailWeight = computeTailWeight(values);
  const peakedness = computePeakedness(values);
  const asymmetry = computeAsymmetry(values);
  const divergenceScore = computeDivergenceScore(
    comparisons, entropyRatio, peakedness, asymmetry
  );

  const asciiDistributionMap = buildDistributionMap(bins, activeBinId, comparisons);

  return {
    populatedBins: populated.length,
    totalBins: bins.length,
    scannedTvlUsd: Math.round(scannedTvl * 100) / 100,
    actualEntropy: Math.round(actualEntropy * 1000) / 1000,
    maxEntropy: Math.round(maxEntropy * 1000) / 1000,
    entropyRatio: Math.round(entropyRatio * 1000) / 1000,
    bestFit: bestComparison.reference,
    bestFitScore: bestComparison.fitScore,
    comparisons,
    tailWeight,
    peakedness,
    asymmetry,
    divergenceScore,
    asciiDistributionMap,
  };
}

function buildRecommendation(pair: string, profile: DivergenceProfile): string {
  const parts: string[] = [];

  parts.push(
    `${pair} divergence: best fit is ${profile.bestFit} (score ${profile.bestFitScore}/100). ` +
    `Entropy ratio ${profile.entropyRatio} (${(profile.entropyRatio * 100).toFixed(0)}% of max). ` +
    `Overall divergence score: ${profile.divergenceScore}/100.`
  );

  parts.push(
    `Distribution shape: peakedness=${profile.peakedness} (${profile.peakedness > 0 ? "leptokurtic" : profile.peakedness < -0.5 ? "platykurtic" : "mesokurtic"}), ` +
    `asymmetry=${profile.asymmetry} (${Math.abs(profile.asymmetry) < 0.3 ? "symmetric" : profile.asymmetry > 0 ? "right-skewed" : "left-skewed"}).`
  );

  parts.push(
    `Tail weight: left=${(profile.tailWeight.left * 100).toFixed(1)}%, ` +
    `right=${(profile.tailWeight.right * 100).toFixed(1)}%.`
  );

  if (profile.bestFit === "gaussian") {
    parts.push(
      "Best matched by Gaussian — bell-curve liquidity centered on the active bin. " +
      "Well-structured for range-bound markets. LPs concentrated near the center " +
      "capture fees efficiently."
    );
  } else if (profile.bestFit === "laplace") {
    parts.push(
      "Best matched by Laplace — sharper peak than Gaussian with heavier tails. " +
      "Strong active-bin concentration with meaningful outlier liquidity. " +
      "Good for moderate volatility scenarios."
    );
  } else {
    parts.push(
      "Best matched by uniform — liquidity spread relatively evenly across bins. " +
      "Capital efficiency is low but resilient to price moves. Consider concentrating " +
      "around the active bin for better fee capture."
    );
  }

  if (profile.entropyRatio > 0.9) {
    parts.push("High entropy ratio — liquidity is nearly uniformly spread. " +
      "Minimal information structure. Large trades face consistent depth but diluted fees.");
  } else if (profile.entropyRatio < 0.5) {
    parts.push("Low entropy ratio — highly concentrated distribution. " +
      "Strong price-level conviction among LPs but fragile to breakouts.");
  }

  const worstFit = profile.comparisons.reduce((a, b) =>
    a.fitScore < b.fitScore ? a : b
  );
  parts.push(
    `Worst fit: ${worstFit.reference} (score ${worstFit.fitScore}/100, ` +
    `TV distance=${worstFit.metrics.totalVariation}, JS distance=${worstFit.metrics.jsDistance}).`
  );

  return parts.join(" ");
}

// -- Main analysis ------------------------------------------------------------

async function analyzeDivergence(pool: AppPool): Promise<DivergenceAnalysis> {
  const poolId = pool.poolId!;
  const activeBinId = pool.activeBinId ?? await getActiveBin(poolId);
  const rawBins = await scanBins(poolId, activeBinId, pool, BIN_SCAN_RADIUS);

  const populated = rawBins.filter(b => b.totalUsd > 0.01);
  const scannedTvl = populated.reduce((s, b) => s + b.totalUsd, 0);

  const profile = buildProfile(rawBins, activeBinId);
  const recommendation = buildRecommendation(
    `${pool.token0Symbol}/${pool.token1Symbol}`,
    profile,
  );

  return {
    poolId,
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    feeBps: pool.feeBps ?? 30,
    activeBinId,
    binsScanned: rawBins.length,
    binsPopulated: populated.length,
    scannedTvlUsd: Math.round(scannedTvl * 100) / 100,
    profile,
    recommendation,
  };
}

function makeErrorResult(pool: AppPool, errMsg: string): DivergenceAnalysis {
  return {
    poolId: pool.poolId!,
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    feeBps: pool.feeBps ?? 30,
    activeBinId: 0,
    binsScanned: 0,
    binsPopulated: 0,
    scannedTvlUsd: 0,
    profile: {
      populatedBins: 0, totalBins: 0, scannedTvlUsd: 0,
      actualEntropy: 0, maxEntropy: 0, entropyRatio: 0,
      bestFit: "uniform", bestFitScore: 0,
      comparisons: [], tailWeight: { left: 0, right: 0 },
      peakedness: 0, asymmetry: 0, divergenceScore: 0,
      asciiDistributionMap: "",
    },
    recommendation: `Analysis failed: ${errMsg}`,
  };
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();

program
  .name("hodlmm-bin-divergence")
  .description("HODLMM Bin Divergence Analyzer — statistical distance from theoretical distributions");

program
  .command("doctor")
  .description("Check environment readiness")
  .action(async () => {
    try {
      const pools = await discoverPools();
      const dlmmPools = pools.filter(p => p.poolId != null);
      console.log(JSON.stringify({
        result: "ready",
        details: {
          bffApi: "reachable",
          hiroApi: "reachable",
          dlmmPoolsFound: dlmmPools.length,
          minTvlFilter: `$${MIN_TVL_USD}`,
          scanRadius: BIN_SCAN_RADIUS,
          metrics: [
            "KL divergence", "Jensen-Shannon distance", "Wasserstein distance",
            "Bhattacharyya coefficient", "total variation distance", "Hellinger distance",
            "Shannon entropy", "peakedness (kurtosis)", "asymmetry (skewness)",
          ],
          referenceDistributions: ["uniform", "gaussian", "laplace"],
        },
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Doctor failed: ${err.message}` }));
    }
  });

program
  .command("run")
  .description("Analyze distribution divergence for HODLMM pools")
  .option("--pool <id>", "Specific pool ID to analyze")
  .option("--top <n>", "Number of top pools by TVL", "3")
  .action(async (opts) => {
    try {
      const pools = await discoverPools();
      const dlmmPools = pools.filter(p => p.poolId != null);

      if (dlmmPools.length === 0) {
        console.log(JSON.stringify({ error: "No DLMM pools found above TVL threshold" }));
        return;
      }

      let targets: AppPool[];
      if (opts.pool) {
        const match = dlmmPools.find(p => String(p.poolId) === opts.pool);
        if (!match) {
          console.log(JSON.stringify({ error: `Pool ${opts.pool} not found` }));
          return;
        }
        targets = [match];
      } else {
        targets = dlmmPools
          .sort((a, b) => b.tvlUsd - a.tvlUsd)
          .slice(0, parseInt(opts.top));
      }

      const results: DivergenceAnalysis[] = [];
      for (const pool of targets) {
        try {
          const analysis = await analyzeDivergence(pool);
          results.push(analysis);
        } catch (err: any) {
          results.push(makeErrorResult(pool, err.message));
        }
      }

      const summary = {
        poolsAnalyzed: results.length,
        bestFitDistribution: {
          uniform: results.filter(r => r.profile.bestFit === "uniform").length,
          gaussian: results.filter(r => r.profile.bestFit === "gaussian").length,
          laplace: results.filter(r => r.profile.bestFit === "laplace").length,
        },
        avgDivergenceScore: Math.round(
          results.reduce((s, r) => s + r.profile.divergenceScore, 0) / results.length
        ),
        avgEntropyRatio: Math.round(
          results.reduce((s, r) => s + r.profile.entropyRatio, 0) / results.length * 1000
        ) / 1000,
        avgBestFitScore: Math.round(
          results.reduce((s, r) => s + r.profile.bestFitScore, 0) / results.length
        ),
        mostPeaked: results.reduce((best, r) =>
          Math.abs(r.profile.peakedness) > Math.abs(best.profile.peakedness) ? r : best, results[0]),
        mostAsymmetric: results.reduce((best, r) =>
          Math.abs(r.profile.asymmetry) > Math.abs(best.profile.asymmetry) ? r : best, results[0]),
      };

      console.log(JSON.stringify({
        result: "divergence_analysis",
        data: { pools: results, summary },
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Run failed: ${err.message}` }));
    }
  });

program
  .command("status")
  .description("Quick divergence summary for top pools")
  .action(async () => {
    try {
      const pools = await discoverPools();
      const dlmmPools = pools
        .filter(p => p.poolId != null)
        .sort((a, b) => b.tvlUsd - a.tvlUsd)
        .slice(0, 5);

      const summaries = [];
      for (const pool of dlmmPools) {
        try {
          const analysis = await analyzeDivergence(pool);
          summaries.push({
            pair: analysis.pair,
            poolId: analysis.poolId,
            tvlUsd: analysis.tvlUsd,
            divergenceScore: analysis.profile.divergenceScore,
            bestFit: analysis.profile.bestFit,
            bestFitScore: analysis.profile.bestFitScore,
            entropyRatio: analysis.profile.entropyRatio,
            peakedness: analysis.profile.peakedness,
            asymmetry: analysis.profile.asymmetry,
            tailWeightLeft: analysis.profile.tailWeight.left,
            tailWeightRight: analysis.profile.tailWeight.right,
          });
        } catch {
          summaries.push({
            pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
            poolId: pool.poolId,
            tvlUsd: pool.tvlUsd,
            divergenceScore: -1,
          });
        }
      }

      console.log(JSON.stringify({ result: "divergence_status", data: summaries }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Status failed: ${err.message}` }));
    }
  });

program.parse();
