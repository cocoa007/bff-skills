#!/usr/bin/env bun
/**
 * hodlmm-bin-reluctance.ts — Day 112 cocoa007 Bitflow Skills Comp
 *
 * Bin liquidity reluctance analyzer — measures resistance to flux
 * passage through the bin circuit, air gaps, MMF, leakage flux,
 * and reluctance network topology.
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 30;
const AIR_GAP_THRESHOLD_FRACTION = 0.001;
const LEAKAGE_DISTANCE_FRACTION = 0.7;

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

interface AirGap {
  startBin: number;
  endBin: number;
  width: number;
  reluctanceContribution: number;
  side: "buy" | "sell" | "spanning";
}

interface ReluctanceProfile {
  populatedBins: number;
  scannedTvlUsd: number;
  activeBinTvlUsd: number;

  perBinReluctance: { binId: number; reluctance: number }[];
  avgReluctance: number;
  peakReluctance: number;
  minReluctance: number;

  magnetomotiveForceUsd: number;
  netFluxUsd: number;
  circuitEfficiency: number;

  airGaps: AirGap[];
  totalAirGapWidth: number;
  airGapReluctanceFraction: number;

  leakageFluxFraction: number;
  leakageBins: number;

  networkTopology: "series" | "parallel" | "mixed";
  seriesFraction: number;
  parallelPathCount: number;

  reluctanceTorque: number;
  buySideReluctance: number;
  sellSideReluctance: number;

  reluctanceClass: "superconductor" | "low-friction" | "moderate" | "high-barrier" | "blocked";
  reluctanceIndex: number;

  asciiReluctanceMap: string;
}

interface ReluctanceAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  profile: ReluctanceProfile;
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

// -- Reluctance Analysis ------------------------------------------------------

function computePerBinReluctance(bins: BinReserves[]): { binId: number; reluctance: number }[] {
  const totalTvl = bins.reduce((s, b) => s + b.totalUsd, 0);
  if (totalTvl < 0.01) return bins.map((b) => ({ binId: b.binId, reluctance: 1 }));

  const maxTvl = Math.max(...bins.map((b) => b.totalUsd));
  if (maxTvl < 0.01) return bins.map((b) => ({ binId: b.binId, reluctance: 1 }));

  return bins.map((b, idx) => {
    const crossSection = b.totalUsd / maxTvl;
    const hasNeighborGap =
      (idx > 0 && bins[idx - 1].totalUsd < totalTvl * AIR_GAP_THRESHOLD_FRACTION) ||
      (idx < bins.length - 1 && bins[idx + 1].totalUsd < totalTvl * AIR_GAP_THRESHOLD_FRACTION);
    const pathLengthFactor = hasNeighborGap ? 1.5 : 1.0;

    const reluctance = crossSection > 0.001
      ? Number(Math.min(1, pathLengthFactor / (crossSection + 0.01)).toFixed(4))
      : 1;
    return { binId: b.binId, reluctance };
  });
}

function detectAirGaps(bins: BinReserves[], activeBinId: number): AirGap[] {
  const totalTvl = bins.reduce((s, b) => s + b.totalUsd, 0);
  const threshold = totalTvl * AIR_GAP_THRESHOLD_FRACTION;
  const gaps: AirGap[] = [];

  let gapStart = -1;
  for (let i = 0; i < bins.length; i++) {
    if (bins[i].totalUsd < threshold) {
      if (gapStart === -1) gapStart = i;
    } else {
      if (gapStart !== -1) {
        const startBin = bins[gapStart].binId;
        const endBin = bins[i - 1].binId;
        const width = i - gapStart;
        const side = endBin < activeBinId ? "sell" : startBin > activeBinId ? "buy" : "spanning";
        const reluctanceContribution = Number((width / bins.length).toFixed(4));
        gaps.push({ startBin, endBin, width, reluctanceContribution, side });
        gapStart = -1;
      }
    }
  }
  if (gapStart !== -1) {
    const startBin = bins[gapStart].binId;
    const endBin = bins[bins.length - 1].binId;
    const width = bins.length - gapStart;
    const side = endBin < activeBinId ? "sell" : startBin > activeBinId ? "buy" : "spanning";
    const reluctanceContribution = Number((width / bins.length).toFixed(4));
    gaps.push({ startBin, endBin, width, reluctanceContribution, side });
  }

  return gaps;
}

function computeMMF(bins: BinReserves[], activeBinIdx: number): number {
  if (bins.length < 3 || activeBinIdx < 0) return 0;

  let buySideReserve = 0;
  let sellSideReserve = 0;
  for (let i = 0; i < bins.length; i++) {
    if (i < activeBinIdx) sellSideReserve += bins[i].totalUsd;
    else if (i > activeBinIdx) buySideReserve += bins[i].totalUsd;
  }

  return Number(Math.abs(buySideReserve - sellSideReserve).toFixed(2));
}

function computeNetFlux(bins: BinReserves[]): number {
  if (bins.length < 2) return 0;

  let flux = 0;
  for (let i = 0; i < bins.length - 1; i++) {
    flux += Math.abs(bins[i + 1].totalUsd - bins[i].totalUsd);
  }

  return Number((flux / Math.max(bins.length - 1, 1)).toFixed(2));
}

function computeLeakageFlux(bins: BinReserves[], activeBinIdx: number): { fraction: number; count: number } {
  if (bins.length < 5 || activeBinIdx < 0) return { fraction: 0, count: 0 };

  const totalTvl = bins.reduce((s, b) => s + b.totalUsd, 0);
  if (totalTvl < 0.01) return { fraction: 0, count: 0 };

  const halfRange = bins.length / 2;
  const leakageThreshold = halfRange * LEAKAGE_DISTANCE_FRACTION;

  let leakageTvl = 0;
  let leakageBins = 0;
  for (let i = 0; i < bins.length; i++) {
    const distFromActive = Math.abs(i - activeBinIdx);
    if (distFromActive > leakageThreshold && bins[i].totalUsd > 0) {
      leakageTvl += bins[i].totalUsd;
      leakageBins++;
    }
  }

  return {
    fraction: Number((leakageTvl / totalTvl).toFixed(4)),
    count: leakageBins,
  };
}

function classifyNetworkTopology(bins: BinReserves[]): {
  topology: "series" | "parallel" | "mixed";
  seriesFraction: number;
  parallelPaths: number;
} {
  const populated = bins.filter((b) => b.totalUsd > 0.01);
  if (populated.length < 3) return { topology: "series", seriesFraction: 1, parallelPaths: 1 };

  let consecutivePairs = 0;
  let totalPairs = 0;
  for (let i = 0; i < populated.length - 1; i++) {
    totalPairs++;
    if (populated[i + 1].binId - populated[i].binId === 1) {
      consecutivePairs++;
    }
  }

  const seriesFraction = totalPairs > 0 ? consecutivePairs / totalPairs : 0;

  const tvlValues = populated.map((b) => b.totalUsd);
  const avgTvl = tvlValues.reduce((s, v) => s + v, 0) / tvlValues.length;
  const similarBins = tvlValues.filter((v) => Math.abs(v - avgTvl) < avgTvl * 0.5).length;
  const parallelPaths = Math.max(1, Math.floor(similarBins / Math.max(1, Math.ceil(populated.length * 0.3))));

  let topology: "series" | "parallel" | "mixed";
  if (seriesFraction > 0.8) topology = "series";
  else if (seriesFraction < 0.4 && parallelPaths > 2) topology = "parallel";
  else topology = "mixed";

  return {
    topology,
    seriesFraction: Number(seriesFraction.toFixed(4)),
    parallelPaths,
  };
}

function computeReluctanceTorque(bins: BinReserves[], activeBinIdx: number): {
  torque: number;
  buySide: number;
  sellSide: number;
} {
  if (bins.length < 3 || activeBinIdx < 0) return { torque: 0, buySide: 0, sellSide: 0 };

  const totalTvl = bins.reduce((s, b) => s + b.totalUsd, 0);
  if (totalTvl < 0.01) return { torque: 0, buySide: 0, sellSide: 0 };

  let buyReluctance = 0;
  let buyCount = 0;
  for (let i = activeBinIdx + 1; i < bins.length; i++) {
    const crossSection = bins[i].totalUsd / totalTvl;
    buyReluctance += crossSection > 0.001 ? 1 / (crossSection + 0.01) : 10;
    buyCount++;
  }

  let sellReluctance = 0;
  let sellCount = 0;
  for (let i = activeBinIdx - 1; i >= 0; i--) {
    const crossSection = bins[i].totalUsd / totalTvl;
    sellReluctance += crossSection > 0.001 ? 1 / (crossSection + 0.01) : 10;
    sellCount++;
  }

  const avgBuy = buyCount > 0 ? buyReluctance / buyCount : 0;
  const avgSell = sellCount > 0 ? sellReluctance / sellCount : 0;
  const maxSide = Math.max(avgBuy, avgSell, 0.01);
  const torque = Number(((avgBuy - avgSell) / maxSide).toFixed(4));

  return {
    torque: Math.max(-1, Math.min(1, torque)),
    buySide: Number(Math.min(1, avgBuy / 10).toFixed(4)),
    sellSide: Number(Math.min(1, avgSell / 10).toFixed(4)),
  };
}

function classifyReluctance(index: number): "superconductor" | "low-friction" | "moderate" | "high-barrier" | "blocked" {
  if (index < 20) return "superconductor";
  if (index < 40) return "low-friction";
  if (index < 60) return "moderate";
  if (index < 80) return "high-barrier";
  return "blocked";
}

function buildAsciiReluctanceMap(
  perBin: { binId: number; reluctance: number }[],
  activeBinId: number,
  airGaps: AirGap[]
): string {
  const width = 30;
  const lines: string[] = ["RELUCTANCE MAP (resistance to flux across bin range)"];
  lines.push(`${"Bin".padStart(8)} | ${"Reluctance".padEnd(width + 12)} |`);

  const gapBins = new Set<number>();
  for (const gap of airGaps) {
    for (let b = gap.startBin; b <= gap.endBin; b++) gapBins.add(b);
  }

  const step = Math.max(1, Math.floor(perBin.length / 40));
  for (let i = 0; i < perBin.length; i += step) {
    const entry = perBin[i];
    const barLen = Math.round(entry.reluctance * width);
    const bar = "\u2588".repeat(Math.max(barLen, 0));
    let marker = "";
    if (entry.binId === activeBinId) {
      marker = " **ACTIVE**";
    } else if (gapBins.has(entry.binId)) {
      marker = " [AIR GAP]";
    }
    const pct = (entry.reluctance * 100).toFixed(0);
    lines.push(`${String(entry.binId).padStart(8)} | ${bar.padEnd(width)} ${pct.padStart(3)}%${marker}`);
  }

  return lines.join("\n");
}

function analyzeReluctance(bins: BinReserves[], activeBinId: number): ReluctanceProfile {
  const populated = bins.filter((b) => b.totalUsd > 0);
  const totalTvl = bins.reduce((s, b) => s + b.totalUsd, 0);
  const activeBin = bins.find((b) => b.binId === activeBinId);
  const activeBinTvl = activeBin?.totalUsd ?? 0;

  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const activeBinIdx = sorted.findIndex((b) => b.binId === activeBinId);

  const perBinReluctance = computePerBinReluctance(sorted);
  const reluctanceValues = perBinReluctance.map((v) => v.reluctance);

  const avgReluctance = reluctanceValues.length > 0
    ? Number((reluctanceValues.reduce((a, b) => a + b, 0) / reluctanceValues.length).toFixed(4))
    : 0;
  const peakReluctance = reluctanceValues.length > 0 ? Math.max(...reluctanceValues) : 0;
  const minReluctance = reluctanceValues.length > 0 ? Math.min(...reluctanceValues) : 0;

  const airGaps = detectAirGaps(sorted, activeBinId);
  const totalAirGapWidth = airGaps.reduce((s, g) => s + g.width, 0);
  const airGapReluctanceFraction = airGaps.reduce((s, g) => s + g.reluctanceContribution, 0);

  const magnetomotiveForceUsd = computeMMF(sorted, activeBinIdx);
  const netFluxUsd = computeNetFlux(sorted);
  const circuitEfficiency = magnetomotiveForceUsd > 0.01
    ? Number(Math.min(1, netFluxUsd / magnetomotiveForceUsd).toFixed(4))
    : 0;

  const leakage = computeLeakageFlux(sorted, activeBinIdx);
  const network = classifyNetworkTopology(sorted);
  const torque = computeReluctanceTorque(sorted, activeBinIdx);

  // Composite scoring
  const avgReluctanceScore = avgReluctance * 25;
  const airGapScore = Math.min(25, airGapReluctanceFraction * 100);
  const leakageScore = leakage.fraction * 15;
  const torqueAsymmetry = Math.abs(torque.torque) * 10;
  const efficiencyPenalty = (1 - circuitEfficiency) * 10;
  const populationBonus = Math.min(10, (1 - populated.length / Math.max(sorted.length, 1)) * 15);
  const networkPenalty = network.topology === "series" ? 5 : network.topology === "mixed" ? 2.5 : 0;

  const reluctanceIndex = Math.round(Math.min(100, Math.max(0,
    avgReluctanceScore + airGapScore + leakageScore + torqueAsymmetry +
    efficiencyPenalty + populationBonus + networkPenalty
  )));

  const reluctanceClass = classifyReluctance(reluctanceIndex);

  const asciiReluctanceMap = buildAsciiReluctanceMap(
    perBinReluctance, activeBinId, airGaps
  );

  return {
    populatedBins: populated.length,
    scannedTvlUsd: totalTvl,
    activeBinTvlUsd: activeBinTvl,
    perBinReluctance,
    avgReluctance,
    peakReluctance,
    minReluctance,
    magnetomotiveForceUsd,
    netFluxUsd,
    circuitEfficiency,
    airGaps,
    totalAirGapWidth,
    airGapReluctanceFraction,
    leakageFluxFraction: leakage.fraction,
    leakageBins: leakage.count,
    networkTopology: network.topology,
    seriesFraction: network.seriesFraction,
    parallelPathCount: network.parallelPaths,
    reluctanceTorque: torque.torque,
    buySideReluctance: torque.buySide,
    sellSideReluctance: torque.sellSide,
    reluctanceClass,
    reluctanceIndex,
    asciiReluctanceMap,
  };
}

function generateRecommendation(p: ReluctanceProfile): string {
  const parts: string[] = [];

  switch (p.reluctanceClass) {
    case "blocked":
      parts.push("Extremely high reluctance — the bin circuit is nearly blocked. Multiple air gaps and sparse reserves create severe barriers to flux passage. Large trades will encounter significant resistance and potential price discontinuities. Only suitable for small trades or as a warning signal for LPs.");
      break;
    case "high-barrier":
      parts.push("High reluctance — significant resistance to flux passage. Air gaps and uneven reserve distribution create barriers that impede smooth trade execution. Large trades may stall at gap boundaries. LPs should monitor for trapped liquidity on either side of gaps.");
      break;
    case "moderate":
      parts.push("Moderate reluctance — reasonable resistance to flux. Some air gaps or uneven distribution exists but flow can still propagate across the range. Suitable for medium-sized trades. LPs face manageable execution risk.");
      break;
    case "low-friction":
      parts.push("Low reluctance — flux passes through the circuit with minimal resistance. Dense, well-connected bin structure with few or no air gaps. Good for traders seeking smooth execution. LPs benefit from even flow distribution.");
      break;
    case "superconductor":
      parts.push("Near-zero reluctance — the bin circuit offers virtually no resistance to flux. Highly dense, uniform reserve distribution with no air gaps. Excellent execution quality but LPs should be aware that directional pressure propagates instantly across the entire range.");
      break;
  }

  if (p.airGaps.length > 0) {
    const gapSummary = p.airGaps.length === 1
      ? `1 air gap (width: ${p.airGaps[0].width} bins, ${p.airGaps[0].side}-side)`
      : `${p.airGaps.length} air gaps (total width: ${p.totalAirGapWidth} bins)`;
    parts.push(`${gapSummary}. Air gaps account for ${(p.airGapReluctanceFraction * 100).toFixed(0)}% of total circuit reluctance. These create price discontinuities where trades must jump across empty bins.`);
  } else {
    parts.push("No air gaps detected — continuous bin coverage provides smooth flux passage across the entire scanned range.");
  }

  if (p.circuitEfficiency > 0.5) {
    parts.push(`High circuit efficiency (${(p.circuitEfficiency * 100).toFixed(0)}%). The MMF-to-flux ratio shows reserves flow efficiently through the circuit. Low energy waste.`);
  } else if (p.circuitEfficiency > 0) {
    parts.push(`Low circuit efficiency (${(p.circuitEfficiency * 100).toFixed(0)}%). Significant driving pressure (MMF: $${fmtUsd(p.magnetomotiveForceUsd)}) produces relatively little net flux ($${fmtUsd(p.netFluxUsd)}/bin). Reserve distribution is inefficient.`);
  }

  if (Math.abs(p.reluctanceTorque) > 0.3) {
    const higherSide = p.reluctanceTorque > 0 ? "buy" : "sell";
    const lowerSide = p.reluctanceTorque > 0 ? "sell" : "buy";
    parts.push(`Directional bias: ${higherSide}-side reluctance is ${(Math.abs(p.reluctanceTorque) * 100).toFixed(0)}% higher than ${lowerSide}-side. Flow encounters more resistance on the ${higherSide} side, creating structural asymmetry in execution quality.`);
  } else {
    parts.push(`Symmetric reluctance (torque: ${(p.reluctanceTorque * 100).toFixed(0)}%). Both directions face similar resistance to flux passage.`);
  }

  if (p.leakageFluxFraction > 0.1) {
    parts.push(`Leakage flux: ${(p.leakageFluxFraction * 100).toFixed(0)}% of reserves sit in peripheral bins (${p.leakageBins} bins) far from the active bin. This capital rarely participates in trading — consider migrating to tighter ranges.`);
  }

  parts.push(`Network topology: ${p.networkTopology} (${(p.seriesFraction * 100).toFixed(0)}% series, ${p.parallelPathCount} parallel paths). ${p.networkTopology === "series" ? "Flow must traverse bins sequentially — vulnerable to bottlenecks at any single weak bin." : p.networkTopology === "parallel" ? "Multiple flow paths available — more resilient to individual bin depletion." : "Mixed topology provides partial redundancy with some sequential dependencies."}`);

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

  const results: ReluctanceAnalysis[] = [];
  for (const pool of targets) {
    const poolId = pool.poolId!;
    try {
      const activeBin = pool.activeBinId ?? (await getActiveBin(poolId));
      const bins = await scanBins(poolId, activeBin, pool, BIN_SCAN_RADIUS);
      const profile = analyzeReluctance(bins, activeBin);
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
        profile: {} as ReluctanceProfile,
        recommendation: `Error: ${e.message}`,
      });
    }
  }

  const avgIdx =
    results.filter((r) => r.profile.reluctanceIndex != null).length > 0
      ? Math.round(
          results.filter((r) => r.profile.reluctanceIndex != null).reduce((s, r) => s + r.profile.reluctanceIndex, 0) /
            results.filter((r) => r.profile.reluctanceIndex != null).length
        )
      : 0;

  console.log(
    JSON.stringify(
      {
        result: "reluctance_analysis",
        data: {
          pools: results,
          summary: { poolsAnalyzed: results.length, avgReluctanceIndex: avgIdx },
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
      const profile = analyzeReluctance(bins, activeBin);

      summaries.push({
        poolId,
        pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
        tvlUsd: pool.tvlUsd,
        reluctanceIndex: profile.reluctanceIndex,
        reluctanceClass: profile.reluctanceClass,
        avgReluctance: profile.avgReluctance,
        airGapCount: profile.airGaps.length,
        totalAirGapWidth: profile.totalAirGapWidth,
        circuitEfficiency: profile.circuitEfficiency,
        magnetomotiveForceUsd: profile.magnetomotiveForceUsd,
        netFluxUsd: profile.netFluxUsd,
        leakageFluxFraction: profile.leakageFluxFraction,
        reluctanceTorque: profile.reluctanceTorque,
        networkTopology: profile.networkTopology,
      });
    } catch (e: any) {
      summaries.push({
        poolId,
        pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
        error: e.message,
      });
    }
  }

  console.log(JSON.stringify({ result: "reluctance_status", pools: summaries }, null, 2));
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();
program.name("hodlmm-bin-reluctance").description("HODLMM bin liquidity reluctance analyzer");

program.command("doctor").description("Check API connectivity").action(cmdDoctor);

program
  .command("run")
  .description("Full reluctance analysis")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "3")
  .action(cmdRun);

program.command("status").description("Quick reluctance summary").action(cmdStatus);

program.parse();
