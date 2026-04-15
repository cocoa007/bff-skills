#!/usr/bin/env bun
/**
 * hodlmm-bin-capacitance.ts — Day 110 cocoa007 Bitflow Skills Comp
 *
 * Bin liquidity capacitance analyzer — measures how much additional
 * liquidity each bin can absorb before saturation, charge/discharge
 * asymmetry, dielectric breakdown thresholds, and energy storage density.
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

interface OverchargedBin {
  binId: number;
  chargeLevel: number;
  excessUsd: number;
  neighborAvgUsd: number;
}

interface UnderchargedBin {
  binId: number;
  chargeLevel: number;
  absorptionCapacityUsd: number;
  neighborAvgUsd: number;
}

interface CapacitanceProfile {
  populatedBins: number;
  scannedTvlUsd: number;
  activeBinTvlUsd: number;

  chargeLevel: { binId: number; charge: number }[];
  avgChargeLevel: number;
  peakChargeLevel: number;
  minChargeLevel: number;

  saturationRatio: number;
  totalAbsorptionCapacityUsd: number;

  overchargedBins: OverchargedBin[];
  underchargedBins: UnderchargedBin[];

  chargeAsymmetryBuy: number;
  chargeAsymmetrySell: number;
  chargeAsymmetryIndex: number;

  dielectricBreakdownUsd: number;
  leakageRate: number;

  capacitanceClass: "supercapacitor" | "well-charged" | "moderate" | "depleted" | "flat";
  capacitanceIndex: number;

  asciiCapacitanceMap: string;
}

interface CapacitanceAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  profile: CapacitanceProfile;
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

// -- Capacitance Analysis -----------------------------------------------------

function computeChargeLevel(bins: BinReserves[]): { binId: number; charge: number }[] {
  if (bins.length < 3) return bins.map((b) => ({ binId: b.binId, charge: b.totalUsd > 0 ? 0.5 : 0 }));

  const windowSize = 5;
  const result: { binId: number; charge: number }[] = [];

  for (let i = 0; i < bins.length; i++) {
    const start = Math.max(0, i - windowSize);
    const end = Math.min(bins.length, i + windowSize + 1);
    const window = bins.slice(start, end);
    const localMax = Math.max(...window.map((b) => b.totalUsd), 0.01);

    const charge = bins[i].totalUsd / localMax;
    result.push({ binId: bins[i].binId, charge: Number(Math.min(1, charge).toFixed(4)) });
  }

  return result;
}

function detectOverchargedBins(
  bins: BinReserves[],
  chargeLevel: { binId: number; charge: number }[],
  threshold: number = 0.85
): OverchargedBin[] {
  const overcharged: OverchargedBin[] = [];

  for (let i = 1; i < bins.length - 1; i++) {
    const curr = bins[i].totalUsd;
    const prevUsd = bins[i - 1].totalUsd;
    const nextUsd = bins[i + 1].totalUsd;
    const neighborAvg = (prevUsd + nextUsd) / 2;

    if (chargeLevel[i].charge >= threshold && curr > neighborAvg * 1.5 && neighborAvg > 0.01) {
      overcharged.push({
        binId: bins[i].binId,
        chargeLevel: chargeLevel[i].charge,
        excessUsd: Number((curr - neighborAvg).toFixed(2)),
        neighborAvgUsd: Number(neighborAvg.toFixed(2)),
      });
    }
  }

  return overcharged.sort((a, b) => b.excessUsd - a.excessUsd).slice(0, 8);
}

function detectUnderchargedBins(
  bins: BinReserves[],
  chargeLevel: { binId: number; charge: number }[],
  threshold: number = 0.25
): UnderchargedBin[] {
  const undercharged: UnderchargedBin[] = [];

  for (let i = 1; i < bins.length - 1; i++) {
    const curr = bins[i].totalUsd;
    const prevUsd = bins[i - 1].totalUsd;
    const nextUsd = bins[i + 1].totalUsd;
    const neighborAvg = (prevUsd + nextUsd) / 2;

    if (chargeLevel[i].charge <= threshold && neighborAvg > curr * 1.5 && neighborAvg > 0.01) {
      undercharged.push({
        binId: bins[i].binId,
        chargeLevel: chargeLevel[i].charge,
        absorptionCapacityUsd: Number((neighborAvg - curr).toFixed(2)),
        neighborAvgUsd: Number(neighborAvg.toFixed(2)),
      });
    }
  }

  return undercharged.sort((a, b) => b.absorptionCapacityUsd - a.absorptionCapacityUsd).slice(0, 8);
}

function computeLeakageRate(bins: BinReserves[], activeBinIdx: number): number {
  if (bins.length < 5 || activeBinIdx < 0) return 1;

  const activeTvl = bins[activeBinIdx].totalUsd;
  if (activeTvl < 0.01) return 1;

  let totalDecay = 0;
  let count = 0;

  for (let offset = 1; offset <= Math.min(10, bins.length - activeBinIdx - 1); offset++) {
    const idx = activeBinIdx + offset;
    if (idx >= bins.length) break;
    const ratio = bins[idx].totalUsd / activeTvl;
    totalDecay += 1 - Math.min(1, ratio);
    count++;
  }

  for (let offset = 1; offset <= Math.min(10, activeBinIdx); offset++) {
    const idx = activeBinIdx - offset;
    if (idx < 0) break;
    const ratio = bins[idx].totalUsd / activeTvl;
    totalDecay += 1 - Math.min(1, ratio);
    count++;
  }

  return count > 0 ? Number((totalDecay / count).toFixed(4)) : 1;
}

function computeDielectricBreakdown(bins: BinReserves[], activeBinIdx: number): number {
  const activeRange = 5;
  const start = Math.max(0, activeBinIdx - activeRange);
  const end = Math.min(bins.length, activeBinIdx + activeRange + 1);

  let minPopulated = Infinity;
  for (let i = start; i < end; i++) {
    if (bins[i].totalUsd > 0.01 && bins[i].totalUsd < minPopulated) {
      minPopulated = bins[i].totalUsd;
    }
  }

  return minPopulated === Infinity ? 0 : Number(minPopulated.toFixed(2));
}

function classifyCapacitance(index: number): "supercapacitor" | "well-charged" | "moderate" | "depleted" | "flat" {
  if (index > 80) return "supercapacitor";
  if (index > 60) return "well-charged";
  if (index > 40) return "moderate";
  if (index > 20) return "depleted";
  return "flat";
}

function buildAsciiCapacitanceMap(
  chargeLevel: { binId: number; charge: number }[],
  activeBinId: number,
  overcharged: OverchargedBin[],
  undercharged: UnderchargedBin[]
): string {
  const width = 30;
  const lines: string[] = ["CAPACITANCE MAP (charge level across bin range)"];
  lines.push(`${"Bin".padStart(8)} | ${"Charge Level".padEnd(width + 12)} |`);

  const overchargedIds = new Set(overcharged.map((b) => b.binId));
  const underchargedIds = new Set(undercharged.map((b) => b.binId));

  const step = Math.max(1, Math.floor(chargeLevel.length / 40));
  for (let i = 0; i < chargeLevel.length; i += step) {
    const cl = chargeLevel[i];
    const barLen = Math.round(cl.charge * width);
    const bar = "\u2588".repeat(Math.max(barLen, 0));
    let marker = "";
    if (cl.binId === activeBinId) {
      marker = " **ACTIVE**";
    } else if (overchargedIds.has(cl.binId)) {
      marker = " [OVERCHARGED]";
    } else if (underchargedIds.has(cl.binId)) {
      marker = " <<UNDERCHARGED>>";
    }
    const pct = (cl.charge * 100).toFixed(0);
    lines.push(`${String(cl.binId).padStart(8)} | ${bar.padEnd(width)} ${pct.padStart(3)}%${marker}`);
  }

  return lines.join("\n");
}

function analyzeCapacitance(bins: BinReserves[], activeBinId: number): CapacitanceProfile {
  const populated = bins.filter((b) => b.totalUsd > 0);
  const totalTvl = bins.reduce((s, b) => s + b.totalUsd, 0);
  const activeBin = bins.find((b) => b.binId === activeBinId);
  const activeBinTvl = activeBin?.totalUsd ?? 0;

  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const activeBinIdx = sorted.findIndex((b) => b.binId === activeBinId);

  const chargeLevel = computeChargeLevel(sorted);
  const chargeValues = chargeLevel.map((v) => v.charge);

  const avgCharge = chargeValues.length > 0
    ? Number((chargeValues.reduce((a, b) => a + b, 0) / chargeValues.length).toFixed(4))
    : 0;
  const peakCharge = chargeValues.length > 0 ? Math.max(...chargeValues) : 0;
  const minCharge = chargeValues.length > 0 ? Math.min(...chargeValues) : 0;

  const maxTvl = Math.max(...sorted.map((b) => b.totalUsd), 1);
  const saturationRatio = populated.length > 0
    ? Number((populated.reduce((s, b) => s + b.totalUsd / maxTvl, 0) / populated.length).toFixed(4))
    : 0;

  const totalAbsorptionCapacity = sorted.reduce((s, b) => {
    const headroom = maxTvl - b.totalUsd;
    return s + Math.max(0, headroom);
  }, 0);

  const overchargedBins = detectOverchargedBins(sorted, chargeLevel);
  const underchargedBins = detectUnderchargedBins(sorted, chargeLevel);

  // Charge asymmetry
  const buySideCharges = activeBinIdx >= 0 && activeBinIdx < chargeValues.length - 1
    ? chargeValues.slice(activeBinIdx + 1)
    : [];
  const sellSideCharges = activeBinIdx > 0
    ? chargeValues.slice(0, activeBinIdx)
    : [];

  const chargeAsymmetryBuy = buySideCharges.length > 0
    ? Number((buySideCharges.reduce((a, b) => a + b, 0) / buySideCharges.length).toFixed(4))
    : 0;
  const chargeAsymmetrySell = sellSideCharges.length > 0
    ? Number((sellSideCharges.reduce((a, b) => a + b, 0) / sellSideCharges.length).toFixed(4))
    : 0;

  const totalAsymmetry = chargeAsymmetryBuy + chargeAsymmetrySell;
  const chargeAsymmetryIndex = totalAsymmetry > 0
    ? Number(((chargeAsymmetryBuy - chargeAsymmetrySell) / totalAsymmetry).toFixed(4))
    : 0;

  const dielectricBreakdownUsd = computeDielectricBreakdown(sorted, activeBinIdx);
  const leakageRate = computeLeakageRate(sorted, activeBinIdx);

  // Composite scoring
  const distributionScore = avgCharge * 30;
  const headroomScore = Math.min(20, (1 - saturationRatio) * 25);
  const symmetryScore = Math.min(15, (1 - Math.abs(chargeAsymmetryIndex)) * 15);
  const populationScore = Math.min(15, (populated.length / Math.max(sorted.length, 1)) * 15);
  const overchargePenalty = Math.min(10, overchargedBins.length * 2);
  const leakagePenalty = Math.min(10, leakageRate * 10);
  const breakdownBonus = Math.min(10, Math.log10(Math.max(dielectricBreakdownUsd, 1)) * 2);

  const capacitanceIndex = Math.round(Math.min(100, Math.max(0,
    distributionScore + headroomScore + symmetryScore + populationScore - overchargePenalty - leakagePenalty + breakdownBonus
  )));

  const capacitanceClass = classifyCapacitance(capacitanceIndex);

  const asciiCapacitanceMap = buildAsciiCapacitanceMap(
    chargeLevel, activeBinId, overchargedBins, underchargedBins
  );

  return {
    populatedBins: populated.length,
    scannedTvlUsd: totalTvl,
    activeBinTvlUsd: activeBinTvl,
    chargeLevel,
    avgChargeLevel: avgCharge,
    peakChargeLevel: peakCharge,
    minChargeLevel: minCharge,
    saturationRatio,
    totalAbsorptionCapacityUsd: Number(totalAbsorptionCapacity.toFixed(2)),
    overchargedBins,
    underchargedBins,
    chargeAsymmetryBuy,
    chargeAsymmetrySell,
    chargeAsymmetryIndex,
    dielectricBreakdownUsd,
    leakageRate,
    capacitanceClass,
    capacitanceIndex,
    asciiCapacitanceMap,
  };
}

function generateRecommendation(p: CapacitanceProfile): string {
  const parts: string[] = [];

  switch (p.capacitanceClass) {
    case "supercapacitor":
      parts.push("Extremely high capacitance — bins have abundant absorption headroom with well-distributed charge levels. Pool can absorb large inflows without structural shifts. Excellent for new LP deposits of any size.");
      break;
    case "well-charged":
      parts.push("High capacitance — most bins have healthy charge levels with meaningful absorption room. Pool handles moderate-to-large inflows gracefully. Good candidate for new LP positions.");
      break;
    case "moderate":
      parts.push("Moderate capacitance — some bins are well-charged while others are near-empty or saturated. New deposits should target undercharged zones for best capital efficiency.");
      break;
    case "depleted":
      parts.push("Low capacitance — bins are mostly empty or highly concentrated in a few peaks. Limited absorption capacity outside the active bin region. Small deposits only, or target specific undercharged bins.");
      break;
    case "flat":
      parts.push("Near-zero capacitance — minimal liquidity storage across the range. Pool has virtually no absorption headroom. Avoid new deposits — any inflow will create extreme concentration.");
      break;
  }

  if (p.overchargedBins.length > 0) {
    const top = p.overchargedBins[0];
    parts.push(`${p.overchargedBins.length} overcharged bin(s) detected. Most overcharged at bin ${top.binId} (${(top.chargeLevel * 100).toFixed(0)}% charge, $${fmtUsd(top.excessUsd)} excess). These bins may see withdrawal pressure as LPs rebalance.`);
  } else {
    parts.push("No overcharged bins — charge distribution is even across the range.");
  }

  if (p.underchargedBins.length > 0) {
    const top = p.underchargedBins[0];
    parts.push(`${p.underchargedBins.length} undercharged bin(s) found. Best opportunity at bin ${top.binId} ($${fmtUsd(top.absorptionCapacityUsd)} absorption capacity). These bins can absorb new deposits with minimal competition.`);
  } else {
    parts.push("No significantly undercharged bins — limited opportunities for low-competition deposits.");
  }

  if (p.dielectricBreakdownUsd > 0) {
    parts.push(`Dielectric breakdown at $${fmtUsd(p.dielectricBreakdownUsd)} — trades above this size risk overwhelming the weakest bin in the active range, causing discontinuous price impact.`);
  }

  if (Math.abs(p.chargeAsymmetryIndex) > 0.3) {
    const fuller = p.chargeAsymmetryIndex > 0 ? "buy" : "sell";
    const emptier = p.chargeAsymmetryIndex > 0 ? "sell" : "buy";
    parts.push(`Charge asymmetry (${p.chargeAsymmetryIndex.toFixed(2)}). ${fuller}-side bins are fuller — more resilient to ${fuller}-side pressure. ${emptier}-side has more absorption room for new deposits.`);
  } else {
    parts.push(`Symmetric charge distribution (asymmetry ${p.chargeAsymmetryIndex.toFixed(2)}). Both sides have similar charge levels and absorption capacity.`);
  }

  if (p.leakageRate > 0.7) {
    parts.push(`High leakage rate (${(p.leakageRate * 100).toFixed(0)}%) — liquidity is tightly concentrated near the active bin. Rapid charge decay away from center.`);
  } else if (p.leakageRate < 0.3) {
    parts.push(`Low leakage rate (${(p.leakageRate * 100).toFixed(0)}%) — liquidity is well-distributed across the range. Slow charge decay with broad coverage.`);
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

  const results: CapacitanceAnalysis[] = [];
  for (const pool of targets) {
    const poolId = pool.poolId!;
    try {
      const activeBin = pool.activeBinId ?? (await getActiveBin(poolId));
      const bins = await scanBins(poolId, activeBin, pool, BIN_SCAN_RADIUS);
      const profile = analyzeCapacitance(bins, activeBin);
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
        profile: {} as CapacitanceProfile,
        recommendation: `Error: ${e.message}`,
      });
    }
  }

  const avgIdx =
    results.filter((r) => r.profile.capacitanceIndex != null).length > 0
      ? Math.round(
          results.filter((r) => r.profile.capacitanceIndex != null).reduce((s, r) => s + r.profile.capacitanceIndex, 0) /
            results.filter((r) => r.profile.capacitanceIndex != null).length
        )
      : 0;

  console.log(
    JSON.stringify(
      {
        result: "capacitance_analysis",
        data: {
          pools: results,
          summary: { poolsAnalyzed: results.length, avgCapacitanceIndex: avgIdx },
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
      const profile = analyzeCapacitance(bins, activeBin);

      summaries.push({
        poolId,
        pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
        tvlUsd: pool.tvlUsd,
        capacitanceIndex: profile.capacitanceIndex,
        capacitanceClass: profile.capacitanceClass,
        avgChargeLevel: profile.avgChargeLevel,
        saturationRatio: profile.saturationRatio,
        totalAbsorptionCapacityUsd: profile.totalAbsorptionCapacityUsd,
        chargeAsymmetryBuy: profile.chargeAsymmetryBuy,
        chargeAsymmetrySell: profile.chargeAsymmetrySell,
        chargeAsymmetryIndex: profile.chargeAsymmetryIndex,
        dielectricBreakdownUsd: profile.dielectricBreakdownUsd,
        leakageRate: profile.leakageRate,
        overchargedCount: profile.overchargedBins.length,
        underchargedCount: profile.underchargedBins.length,
      });
    } catch (e: any) {
      summaries.push({
        poolId,
        pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
        error: e.message,
      });
    }
  }

  console.log(JSON.stringify({ result: "capacitance_status", pools: summaries }, null, 2));
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();
program.name("hodlmm-bin-capacitance").description("HODLMM bin liquidity capacitance analyzer");

program.command("doctor").description("Check API connectivity").action(cmdDoctor);

program
  .command("run")
  .description("Full capacitance analysis")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "3")
  .action(cmdRun);

program.command("status").description("Quick capacitance summary").action(cmdStatus);

program.parse();
