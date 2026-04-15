#!/usr/bin/env bun
/**
 * hodlmm-bin-inductance.ts — Day 111 cocoa007 Bitflow Skills Comp
 *
 * Bin liquidity inductance analyzer — measures how bins resist changes
 * in reserve flow rate, back-EMF effects, mutual inductance between
 * adjacent bins, and flow energy storage.
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 30;

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

interface MutualInductancePair {
  binA: number;
  binB: number;
  coupling: number;
}

interface InductanceProfile {
  populatedBins: number;
  scannedTvlUsd: number;
  activeBinTvlUsd: number;

  selfInductance: { binId: number; inductance: number }[];
  avgSelfInductance: number;
  peakSelfInductance: number;
  minSelfInductance: number;

  mutualInductancePairs: MutualInductancePair[];
  avgMutualInductance: number;
  couplingStrength: number;

  backEmfBuy: number;
  backEmfSell: number;
  backEmfIndex: number;

  flowEnergyUsd: number;
  resonantFrequencyBins: number;
  eddyLossFraction: number;

  inductanceClass: "superconductor" | "low-inertia" | "moderate" | "high-inertia" | "immovable";
  inductanceIndex: number;

  asciiInductanceMap: string;
}

interface InductanceAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  profile: InductanceProfile;
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
  return bins;
}

// -- Inductance Analysis ------------------------------------------------------

function computeSelfInductance(bins: BinReserves[]): { binId: number; inductance: number }[] {
  const totalTvl = bins.reduce((s, b) => s + b.totalUsd, 0);
  if (totalTvl < 0.01) return bins.map((b) => ({ binId: b.binId, inductance: 0 }));

  return bins.map((b) => {
    const massFraction = b.totalUsd / totalTvl;
    const inductance = Number(Math.min(1, Math.sqrt(massFraction) * Math.sqrt(bins.length)).toFixed(4));
    return { binId: b.binId, inductance };
  });
}

function computeMutualInductance(bins: BinReserves[]): MutualInductancePair[] {
  const populated = bins.filter((b) => b.totalUsd > 0.01);
  if (populated.length < 2) return [];

  const pairs: MutualInductancePair[] = [];
  const maxTvl = Math.max(...populated.map((b) => b.totalUsd));

  for (let i = 0; i < populated.length - 1; i++) {
    const a = populated[i];
    const b = populated[i + 1];
    const distance = Math.abs(b.binId - a.binId);
    const reserveCorrelation = Math.min(a.totalUsd, b.totalUsd) / Math.max(a.totalUsd, b.totalUsd, 0.01);
    const proximityFactor = 1 / (1 + distance * 0.3);
    const massFactor = ((a.totalUsd + b.totalUsd) / (2 * maxTvl));
    const coupling = Number((reserveCorrelation * proximityFactor * massFactor).toFixed(4));

    pairs.push({ binA: a.binId, binB: b.binId, coupling });
  }

  return pairs.sort((a, b) => b.coupling - a.coupling).slice(0, 15);
}

function computeBackEmf(bins: BinReserves[], activeBinIdx: number): { buy: number; sell: number } {
  if (bins.length < 3 || activeBinIdx < 0) return { buy: 0, sell: 0 };

  const totalTvl = bins.reduce((s, b) => s + b.totalUsd, 0);
  if (totalTvl < 0.01) return { buy: 0, sell: 0 };

  let buyResistance = 0;
  let buyCount = 0;
  for (let i = activeBinIdx + 1; i < bins.length; i++) {
    const gradient = bins[i].totalUsd - (bins[i - 1]?.totalUsd ?? 0);
    const normalizedGradient = gradient / totalTvl;
    buyResistance += Math.abs(normalizedGradient);
    buyCount++;
  }

  let sellResistance = 0;
  let sellCount = 0;
  for (let i = activeBinIdx - 1; i >= 0; i--) {
    const gradient = bins[i].totalUsd - (bins[i + 1]?.totalUsd ?? 0);
    const normalizedGradient = gradient / totalTvl;
    sellResistance += Math.abs(normalizedGradient);
    sellCount++;
  }

  const buy = buyCount > 0 ? Number(Math.min(1, buyResistance / buyCount * 10).toFixed(4)) : 0;
  const sell = sellCount > 0 ? Number(Math.min(1, sellResistance / sellCount * 10).toFixed(4)) : 0;
  return { buy, sell };
}

function computeFlowEnergy(bins: BinReserves[], activeBinIdx: number): number {
  if (bins.length < 3 || activeBinIdx < 0) return 0;

  let energy = 0;
  for (let i = 0; i < bins.length - 1; i++) {
    const flowGradient = Math.abs(bins[i + 1].totalUsd - bins[i].totalUsd);
    const distanceFromActive = Math.abs(i - activeBinIdx) + 1;
    energy += flowGradient / distanceFromActive;
  }

  return Number(energy.toFixed(2));
}

function computeResonantFrequency(bins: BinReserves[]): number {
  const populated = bins.filter((b) => b.totalUsd > 0.01);
  if (populated.length < 4) return 0;

  const diffs: number[] = [];
  for (let i = 1; i < populated.length; i++) {
    diffs.push(populated[i].totalUsd - populated[i - 1].totalUsd);
  }

  let signChanges = 0;
  for (let i = 1; i < diffs.length; i++) {
    if ((diffs[i] > 0 && diffs[i - 1] < 0) || (diffs[i] < 0 && diffs[i - 1] > 0)) {
      signChanges++;
    }
  }

  if (signChanges === 0) return populated.length;
  return Number((populated.length / signChanges).toFixed(2));
}

function computeEddyLossFraction(bins: BinReserves[], activeBinIdx: number): number {
  if (bins.length < 5 || activeBinIdx < 0) return 0;

  const totalTvl = bins.reduce((s, b) => s + b.totalUsd, 0);
  if (totalTvl < 0.01) return 0;

  const eddyRadius = 3;
  const start = Math.max(0, activeBinIdx - eddyRadius);
  const end = Math.min(bins.length, activeBinIdx + eddyRadius + 1);

  let circularFlow = 0;
  for (let i = start; i < end - 1; i++) {
    const diff = Math.abs(bins[i + 1].totalUsd - bins[i].totalUsd);
    circularFlow += diff;
  }

  let totalFlow = 0;
  for (let i = 0; i < bins.length - 1; i++) {
    totalFlow += Math.abs(bins[i + 1].totalUsd - bins[i].totalUsd);
  }

  return totalFlow > 0 ? Number((circularFlow / totalFlow).toFixed(4)) : 0;
}

function classifyInductance(index: number): "superconductor" | "low-inertia" | "moderate" | "high-inertia" | "immovable" {
  if (index < 20) return "superconductor";
  if (index < 40) return "low-inertia";
  if (index < 60) return "moderate";
  if (index < 80) return "high-inertia";
  return "immovable";
}

function buildAsciiInductanceMap(
  selfInductance: { binId: number; inductance: number }[],
  activeBinId: number,
  mutualPairs: MutualInductancePair[]
): string {
  const width = 30;
  const lines: string[] = ["INDUCTANCE MAP (self-inductance across bin range)"];
  lines.push(`${"Bin".padStart(8)} | ${"Self-Inductance".padEnd(width + 12)} |`);

  const highCouplingBins = new Set<number>();
  for (const p of mutualPairs.slice(0, 5)) {
    highCouplingBins.add(p.binA);
    highCouplingBins.add(p.binB);
  }

  const step = Math.max(1, Math.floor(selfInductance.length / 40));
  for (let i = 0; i < selfInductance.length; i += step) {
    const si = selfInductance[i];
    const barLen = Math.round(si.inductance * width);
    const bar = "\u2588".repeat(Math.max(barLen, 0));
    let marker = "";
    if (si.binId === activeBinId) {
      marker = " **ACTIVE**";
    } else if (highCouplingBins.has(si.binId)) {
      marker = " [COUPLED]";
    }
    const pct = (si.inductance * 100).toFixed(0);
    lines.push(`${String(si.binId).padStart(8)} | ${bar.padEnd(width)} ${pct.padStart(3)}%${marker}`);
  }

  return lines.join("\n");
}

function analyzeInductance(bins: BinReserves[], activeBinId: number): InductanceProfile {
  const populated = bins.filter((b) => b.totalUsd > 0);
  const totalTvl = bins.reduce((s, b) => s + b.totalUsd, 0);
  const activeBin = bins.find((b) => b.binId === activeBinId);
  const activeBinTvl = activeBin?.totalUsd ?? 0;

  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const activeBinIdx = sorted.findIndex((b) => b.binId === activeBinId);

  const selfInductance = computeSelfInductance(sorted);
  const inductanceValues = selfInductance.map((v) => v.inductance);

  const avgSelf = inductanceValues.length > 0
    ? Number((inductanceValues.reduce((a, b) => a + b, 0) / inductanceValues.length).toFixed(4))
    : 0;
  const peakSelf = inductanceValues.length > 0 ? Math.max(...inductanceValues) : 0;
  const minSelf = inductanceValues.length > 0 ? Math.min(...inductanceValues) : 0;

  const mutualPairs = computeMutualInductance(sorted);
  const avgMutual = mutualPairs.length > 0
    ? Number((mutualPairs.reduce((s, p) => s + p.coupling, 0) / mutualPairs.length).toFixed(4))
    : 0;
  const couplingStrength = Number(Math.min(1, avgMutual * 5).toFixed(4));

  const backEmf = computeBackEmf(sorted, activeBinIdx);
  const backEmfIndex = Number(((backEmf.buy + backEmf.sell) / 2).toFixed(4));

  const flowEnergyUsd = computeFlowEnergy(sorted, activeBinIdx);
  const resonantFrequencyBins = computeResonantFrequency(sorted);
  const eddyLossFraction = computeEddyLossFraction(sorted, activeBinIdx);

  // Composite scoring
  const massScore = avgSelf * 25;
  const couplingScore = couplingStrength * 20;
  const backEmfScore = backEmfIndex * 20;
  const energyScore = Math.min(15, Math.log10(Math.max(flowEnergyUsd, 1)) * 3);
  const populationScore = Math.min(10, (populated.length / Math.max(sorted.length, 1)) * 10);
  const concentrationBonus = Math.min(10, peakSelf * 10);
  const eddyPenalty = Math.min(10, eddyLossFraction * 15);

  const inductanceIndex = Math.round(Math.min(100, Math.max(0,
    massScore + couplingScore + backEmfScore + energyScore + populationScore + concentrationBonus - eddyPenalty
  )));

  const inductanceClass = classifyInductance(inductanceIndex);

  const asciiInductanceMap = buildAsciiInductanceMap(
    selfInductance, activeBinId, mutualPairs
  );

  return {
    populatedBins: populated.length,
    scannedTvlUsd: totalTvl,
    activeBinTvlUsd: activeBinTvl,
    selfInductance,
    avgSelfInductance: avgSelf,
    peakSelfInductance: peakSelf,
    minSelfInductance: minSelf,
    mutualInductancePairs: mutualPairs,
    avgMutualInductance: avgMutual,
    couplingStrength,
    backEmfBuy: backEmf.buy,
    backEmfSell: backEmf.sell,
    backEmfIndex,
    flowEnergyUsd,
    resonantFrequencyBins,
    eddyLossFraction,
    inductanceClass,
    inductanceIndex,
    asciiInductanceMap,
  };
}

function generateRecommendation(p: InductanceProfile): string {
  const parts: string[] = [];

  switch (p.inductanceClass) {
    case "immovable":
      parts.push("Extremely high inductance — bins strongly resist flow changes. Large trades face significant back-EMF resistance, providing natural cushioning against volatility. Pool absorbs directional pressure gradually, ideal for patient LPs seeking stability.");
      break;
    case "high-inertia":
      parts.push("High inductance — bins resist flow changes with meaningful inertia. Moderate-to-large trades encounter back-EMF damping. Good for LPs who want stability over responsiveness. Trades are cushioned but may experience delayed price discovery.");
      break;
    case "moderate":
      parts.push("Moderate inductance — balanced resistance to flow changes. Pool responds to directional pressure with proportional damping. Suitable for most LP strategies. Neither excessively sluggish nor overly reactive.");
      break;
    case "low-inertia":
      parts.push("Low inductance — bins respond quickly to flow changes with minimal damping. Pool is reactive and capital-efficient for small trades but offers little cushioning during directional pressure. Better for active LPs who can rebalance frequently.");
      break;
    case "superconductor":
      parts.push("Near-zero inductance — minimal resistance to flow changes. Pool responds instantly to any trade pressure with no damping. Extremely volatile bin structure. Only suitable for sophisticated traders or very short-term positions.");
      break;
  }

  if (p.couplingStrength > 0.6) {
    parts.push(`Strong coupling (${(p.couplingStrength * 100).toFixed(0)}%). Adjacent bins are tightly linked — reserve changes propagate across the range. The pool acts as a unified body, distributing pressure evenly.`);
  } else if (p.couplingStrength < 0.2) {
    parts.push(`Weak coupling (${(p.couplingStrength * 100).toFixed(0)}%). Bins are loosely connected — individual bins can be drained without affecting neighbors. Watch for isolated depletion events.`);
  } else {
    parts.push(`Moderate coupling (${(p.couplingStrength * 100).toFixed(0)}%). Bins are reasonably connected with partial pressure distribution across neighbors.`);
  }

  if (Math.abs(p.backEmfBuy - p.backEmfSell) > 0.2) {
    const stronger = p.backEmfBuy > p.backEmfSell ? "buy" : "sell";
    const weaker = p.backEmfBuy > p.backEmfSell ? "sell" : "buy";
    parts.push(`Asymmetric back-EMF: ${stronger}-side resistance (${(Math.max(p.backEmfBuy, p.backEmfSell) * 100).toFixed(0)}%) is stronger than ${weaker}-side (${(Math.min(p.backEmfBuy, p.backEmfSell) * 100).toFixed(0)}%). Pool resists ${stronger}-side pressure more effectively. ${weaker}-side is more vulnerable to sustained directional flow.`);
  } else {
    parts.push(`Symmetric back-EMF (buy: ${(p.backEmfBuy * 100).toFixed(0)}%, sell: ${(p.backEmfSell * 100).toFixed(0)}%). Both directions face similar resistance to sustained flow.`);
  }

  if (p.resonantFrequencyBins > 0 && p.resonantFrequencyBins < 5) {
    parts.push(`Low resonant frequency (${p.resonantFrequencyBins.toFixed(1)} bins). Pool structure amplifies oscillations at short wavelengths — watch for resonance effects during cyclic trading patterns.`);
  }

  if (p.eddyLossFraction > 0.5) {
    parts.push(`High eddy losses (${(p.eddyLossFraction * 100).toFixed(0)}%). Significant reserve gradients near the active bin create circular flow patterns that dissipate inertial energy. Active bin region is turbulent.`);
  }

  if (p.flowEnergyUsd > 0) {
    parts.push(`Flow field energy: $${fmtUsd(p.flowEnergyUsd)}. This represents the total inertial potential stored in reserve gradients across the range.`);
  }

  return parts.join(" ");
}

// -- Commands -----------------------------------------------------------------

async function cmdDoctor() {
  const checks: Record<string, string> = {};
  try {
    const pools = await discoverPools();
    const dlmm = pools.filter((p) => p.poolId != null);
    checks["bitflow_api"] = `ok (${dlmm.length} DLMM pools)`;
  } catch (e: any) {
    checks["bitflow_api"] = `fail: ${e.message}`;
  }
  try {
    const res = await callReadOnly("get-active-bin-id", [cvUint(1)]);
    checks["hiro_api"] = res.result ? "ok" : "fail: empty result";
  } catch (e: any) {
    checks["hiro_api"] = `fail: ${e.message}`;
  }
  console.log(JSON.stringify({ result: "doctor", checks }, null, 2));
}

async function cmdRun(opts: { pool?: string; top?: string }) {
  const allPools = await discoverPools();
  const dlmmPools = allPools
    .filter((p) => p.poolId != null)
    .sort((a, b) => b.tvlUsd - a.tvlUsd);

  let targets: AppPool[];
  if (opts.pool) {
    const pid = parseInt(opts.pool, 10);
    targets = dlmmPools.filter((p) => p.poolId === pid);
    if (targets.length === 0) {
      console.log(JSON.stringify({ error: `Pool ${pid} not found among ${dlmmPools.length} DLMM pools` }));
      return;
    }
  } else {
    const top = parseInt(opts.top ?? "3", 10);
    targets = dlmmPools.slice(0, top);
  }

  const results: InductanceAnalysis[] = [];
  for (const pool of targets) {
    const poolId = pool.poolId!;
    try {
      const activeBin = pool.activeBinId ?? (await getActiveBin(poolId));
      const bins = await scanBins(poolId, activeBin, pool, BIN_SCAN_RADIUS);
      const profile = analyzeInductance(bins, activeBin);
      const recommendation = generateRecommendation(profile);

      results.push({
        poolId,
        pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
        tvlUsd: pool.tvlUsd,
        volume24hUsd: pool.volume24hUsd,
        feeBps: pool.feeBps ?? 0,
        activeBinId: activeBin,
        binsScanned: bins.length,
        binsPopulated: profile.populatedBins,
        scannedTvlUsd: profile.scannedTvlUsd,
        profile,
        recommendation,
      });
    } catch (e: any) {
      results.push({
        poolId,
        pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
        tvlUsd: pool.tvlUsd,
        volume24hUsd: pool.volume24hUsd,
        feeBps: pool.feeBps ?? 0,
        activeBinId: 0,
        binsScanned: 0,
        binsPopulated: 0,
        scannedTvlUsd: 0,
        profile: {} as InductanceProfile,
        recommendation: `Error: ${e.message}`,
      });
    }
  }

  const avgIdx =
    results.filter((r) => r.profile.inductanceIndex != null).length > 0
      ? Math.round(
          results.filter((r) => r.profile.inductanceIndex != null).reduce((s, r) => s + r.profile.inductanceIndex, 0) /
            results.filter((r) => r.profile.inductanceIndex != null).length
        )
      : 0;

  console.log(
    JSON.stringify(
      {
        result: "inductance_analysis",
        data: {
          pools: results,
          summary: { poolsAnalyzed: results.length, avgInductanceIndex: avgIdx },
        },
      },
      null,
      2
    )
  );
}

async function cmdStatus() {
  const allPools = await discoverPools();
  const dlmmPools = allPools
    .filter((p) => p.poolId != null)
    .sort((a, b) => b.tvlUsd - a.tvlUsd)
    .slice(0, 5);

  const summaries: any[] = [];
  for (const pool of dlmmPools) {
    const poolId = pool.poolId!;
    try {
      const activeBin = pool.activeBinId ?? (await getActiveBin(poolId));
      const bins = await scanBins(poolId, activeBin, pool, BIN_SCAN_RADIUS);
      const profile = analyzeInductance(bins, activeBin);

      summaries.push({
        poolId,
        pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
        tvlUsd: pool.tvlUsd,
        inductanceIndex: profile.inductanceIndex,
        inductanceClass: profile.inductanceClass,
        avgSelfInductance: profile.avgSelfInductance,
        couplingStrength: profile.couplingStrength,
        backEmfBuy: profile.backEmfBuy,
        backEmfSell: profile.backEmfSell,
        backEmfIndex: profile.backEmfIndex,
        flowEnergyUsd: profile.flowEnergyUsd,
        resonantFrequencyBins: profile.resonantFrequencyBins,
        eddyLossFraction: profile.eddyLossFraction,
      });
    } catch (e: any) {
      summaries.push({
        poolId,
        pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
        error: e.message,
      });
    }
  }

  console.log(JSON.stringify({ result: "inductance_status", pools: summaries }, null, 2));
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();
program.name("hodlmm-bin-inductance").description("HODLMM bin liquidity inductance analyzer");

program.command("doctor").description("Check API connectivity").action(cmdDoctor);

program
  .command("run")
  .description("Full inductance analysis")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "3")
  .action(cmdRun);

program.command("status").description("Quick inductance summary").action(cmdStatus);

program.parse();
