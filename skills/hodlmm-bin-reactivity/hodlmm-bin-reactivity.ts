#!/usr/bin/env bun
/**
 * hodlmm-bin-reactivity.ts — Day 116 cocoa007 Bitflow Skills Comp
 *
 * Bin reactivity analyzer — measures reserve response intensity,
 * activation energy, chain reactions, catalytic/inhibitor bins,
 * reaction order, equilibrium constants, and Le Chatelier index.
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

interface CatalyticBin {
  binId: number;
  offset: number;
  type: "catalytic" | "inhibitor";
  reserveFraction: number;
  surroundingGradient: number;
  amplificationRatio: number;
}

interface ReactivityProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsAnalyzed: number;
  activeBinCount: number;
  inertBinCount: number;
  reactivityIndex: number;
  reactivityClass: string;
  responseAmplitude: number;
  activationEnergy: number;
  chainReactionPotential: number;
  chainReactionClass: string;
  catalyticBins: CatalyticBin[];
  inhibitorBins: CatalyticBin[];
  reactionOrder: string;
  reactionOrderR2: number;
  keqProfile: { binId: number; offset: number; keq: number }[];
  keqSkew: number;
  keqSkewDirection: string;
  leChatelierIndex: number;
  leChatelierClass: string;
  tvlUsd: number;
  volume24hUsd: number;
}

async function fetchPools(): Promise<AppPool[]> {
  const res = await fetch(`${BFF_APP_BASE}/pools`);
  if (!res.ok) throw new Error(`BFF pools API: ${res.status}`);
  const body = (await res.json()) as any;
  const pools: AppPool[] = body.data?.pools ?? body.pools ?? body ?? [];
  return pools.filter((p: AppPool) => (p.tvlUsd ?? 0) >= MIN_TVL_USD && p.poolId != null);
}

async function fetchActiveBin(poolId: number): Promise<number> {
  const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-active-bin`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: SENDER,
      arguments: [`0x0100000000000000000000000000000${poolId.toString(16).padStart(3, "0")}`],
    }),
  });
  if (!res.ok) throw new Error(`Active bin fetch failed: ${res.status}`);
  const data = (await res.json()) as any;
  if (!data.okay || !data.result) throw new Error("Active bin read failed");
  const hex = data.result.replace("0x", "");
  if (hex.startsWith("09")) {
    const tupleHex = hex.slice(2);
    let offset = 0;
    const numEntries = parseInt(tupleHex.slice(offset, offset + 2), 16);
    offset += 2;
    for (let i = 0; i < numEntries; i++) {
      const nameLen = parseInt(tupleHex.slice(offset, offset + 2), 16);
      offset += 2;
      const nameBytes = tupleHex.slice(offset, offset + nameLen * 2);
      offset += nameLen * 2;
      const name = Buffer.from(nameBytes, "hex").toString("ascii");
      if (name === "active-bin-id" || name === "bin-id") {
        const typePrefix = tupleHex.slice(offset, offset + 2);
        offset += 2;
        if (typePrefix === "01") {
          return parseInt(tupleHex.slice(offset, offset + 32), 16);
        }
      } else {
        const typePrefix = tupleHex.slice(offset, offset + 2);
        offset += 2;
        if (typePrefix === "01" || typePrefix === "00") offset += 32;
        else if (typePrefix === "0a") offset += 32;
        else break;
      }
    }
  }
  const match = hex.match(/01([0-9a-f]{32})/);
  if (match) return parseInt(match[1], 16);
  throw new Error("Cannot parse active bin");
}

async function fetchBinReserves(
  poolId: number,
  activeBin: number,
  pool: AppPool
): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const start = activeBin - BIN_SCAN_RADIUS;
  const end = activeBin + BIN_SCAN_RADIUS;
  const batchSize = 5;
  for (let i = start; i <= end; i += batchSize) {
    const batch = [];
    for (let j = i; j < Math.min(i + batchSize, end + 1); j++) {
      batch.push(j);
    }
    const results = await Promise.all(
      batch.map(async (binId) => {
        try {
          const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-bin-reserves`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sender: SENDER,
              arguments: [
                `0x0100000000000000000000000000000${poolId.toString(16).padStart(3, "0")}`,
                `0x01000000000000000000000000${binId.toString(16).padStart(8, "0")}`,
              ],
            }),
          });
          if (!res.ok) return null;
          const data = (await res.json()) as any;
          if (!data.okay || !data.result) return null;
          const hex = data.result.replace("0x", "");
          let reserveX = 0,
            reserveY = 0;
          if (hex.startsWith("09")) {
            const tupleHex = hex.slice(2);
            let offset = 0;
            const numEntries = parseInt(tupleHex.slice(offset, offset + 2), 16);
            offset += 2;
            for (let e = 0; e < numEntries; e++) {
              const nameLen = parseInt(tupleHex.slice(offset, offset + 2), 16);
              offset += 2;
              const nameRaw = tupleHex.slice(offset, offset + nameLen * 2);
              offset += nameLen * 2;
              const nm = Buffer.from(nameRaw, "hex").toString("ascii");
              const typePrefix = tupleHex.slice(offset, offset + 2);
              offset += 2;
              const val = parseInt(tupleHex.slice(offset, offset + 32), 16);
              offset += 32;
              if (nm === "reserve-x") reserveX = val;
              else if (nm === "reserve-y") reserveY = val;
            }
          } else {
            const uints = hex.match(/01([0-9a-f]{32})/g) ?? [];
            if (uints.length >= 2) {
              reserveX = parseInt(uints[0].slice(2), 16);
              reserveY = parseInt(uints[1].slice(2), 16);
            }
          }
          const decX = pool.token0Decimals || 8;
          const decY = pool.token1Decimals || 6;
          const rX = reserveX / 10 ** decX;
          const rY = reserveY / 10 ** decY;
          const rXUsd = rX * (pool.token0PriceUsd || 0);
          const rYUsd = rY * (pool.token1PriceUsd || 0);
          return {
            binId,
            reserveX: rX,
            reserveY: rY,
            reserveXUsd: rXUsd,
            reserveYUsd: rYUsd,
            totalUsd: rXUsd + rYUsd,
          } as BinReserves;
        } catch {
          return null;
        }
      })
    );
    for (const r of results) {
      if (r && (r.reserveX > 0 || r.reserveY > 0)) bins.push(r);
    }
  }
  return bins;
}

function computeResponseAmplitude(bins: BinReserves[]): number {
  if (bins.length < 2) return 0;
  const vals = bins.map((b) => b.totalUsd);
  const maxVal = Math.max(...vals) || 1;
  let totalVariation = 0;
  for (let i = 1; i < vals.length; i++) {
    totalVariation += Math.abs(vals[i] - vals[i - 1]) / maxVal;
  }
  return round(totalVariation / (bins.length - 1));
}

function computeActivationEnergy(bins: BinReserves[]): number {
  const vals = bins.map((b) => b.totalUsd);
  const maxVal = Math.max(...vals) || 1;
  const fractions = vals.map((v) => v / maxVal);
  const sorted = [...fractions].sort((a, b) => a - b);
  const nonZero = sorted.filter((f) => f > 0);
  if (nonZero.length === 0) return 1;
  const q25Index = Math.floor(nonZero.length * 0.25);
  return round(nonZero[q25Index] || nonZero[0]);
}

function computeChainReactionPotential(bins: BinReserves[]): { potential: number; chainClass: string } {
  if (bins.length < 4) return { potential: 0, chainClass: "insufficient-data" };
  const vals = bins.map((b) => b.totalUsd);
  const gradients: number[] = [];
  for (let i = 1; i < vals.length; i++) {
    gradients.push(vals[i] - vals[i - 1]);
  }
  if (gradients.length < 3) return { potential: 0, chainClass: "insufficient-data" };

  const meanGrad = gradients.reduce((a, b) => a + b, 0) / gradients.length;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < gradients.length - 1; i++) {
    numerator += (gradients[i] - meanGrad) * (gradients[i + 1] - meanGrad);
    denominator += (gradients[i] - meanGrad) ** 2;
  }
  const autocorrelation = denominator > 0 ? numerator / denominator : 0;
  const clamped = Math.max(-1, Math.min(1, autocorrelation));

  let chainClass: string;
  if (clamped > 0.6) chainClass = "propagating";
  else if (clamped > 0.2) chainClass = "mixed";
  else if (clamped > -0.2) chainClass = "dampened";
  else chainClass = "absorbing";

  return { potential: round(clamped), chainClass };
}

function detectCatalyticInhibitor(bins: BinReserves[], activeBin: number): {
  catalytic: CatalyticBin[];
  inhibitor: CatalyticBin[];
} {
  if (bins.length < 3) return { catalytic: [], inhibitor: [] };

  const vals = bins.map((b) => b.totalUsd);
  const maxVal = Math.max(...vals) || 1;
  const fractions = vals.map((v) => v / maxVal);

  const surroundingGradients: number[] = [];
  for (let i = 1; i < bins.length - 1; i++) {
    const leftGrad = Math.abs(vals[i] - vals[i - 1]) / maxVal;
    const rightGrad = Math.abs(vals[i + 1] - vals[i]) / maxVal;
    surroundingGradients.push((leftGrad + rightGrad) / 2);
  }

  const sortedFractions = [...fractions.slice(1, -1)].sort((a, b) => a - b);
  const sortedGradients = [...surroundingGradients].sort((a, b) => a - b);
  const medianFraction = sortedFractions[Math.floor(sortedFractions.length / 2)] || 0;
  const medianGradient = sortedGradients[Math.floor(sortedGradients.length / 2)] || 0;

  const catalytic: CatalyticBin[] = [];
  const inhibitor: CatalyticBin[] = [];

  for (let i = 1; i < bins.length - 1; i++) {
    const frac = fractions[i];
    const grad = surroundingGradients[i - 1];
    const ampRatio = frac > 0 ? grad / frac : grad * 10;

    if (frac < medianFraction && grad > medianGradient) {
      catalytic.push({
        binId: bins[i].binId,
        offset: bins[i].binId - activeBin,
        type: "catalytic",
        reserveFraction: round(frac),
        surroundingGradient: round(grad),
        amplificationRatio: round(ampRatio),
      });
    } else if (frac > medianFraction && grad < medianGradient) {
      inhibitor.push({
        binId: bins[i].binId,
        offset: bins[i].binId - activeBin,
        type: "inhibitor",
        reserveFraction: round(frac),
        surroundingGradient: round(grad),
        amplificationRatio: round(ampRatio),
      });
    }
  }

  return {
    catalytic: catalytic.sort((a, b) => b.amplificationRatio - a.amplificationRatio).slice(0, 10),
    inhibitor: inhibitor.sort((a, b) => a.amplificationRatio - b.amplificationRatio).slice(0, 10),
  };
}

function fitReactionOrder(bins: BinReserves[], activeBin: number): { order: string; r2: number } {
  const distances: number[] = [];
  const values: number[] = [];
  const maxVal = Math.max(...bins.map((b) => b.totalUsd)) || 1;

  for (const b of bins) {
    const d = Math.abs(b.binId - activeBin);
    if (d > 0 && b.totalUsd > 0) {
      distances.push(d);
      values.push(b.totalUsd / maxVal);
    }
  }

  if (distances.length < 3) return { order: "undefined", r2: 0 };

  const fitR2 = (predicted: number[]): number => {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const ssTot = values.reduce((s, v) => s + (v - mean) ** 2, 0);
    const ssRes = values.reduce((s, v, i) => s + (v - predicted[i]) ** 2, 0);
    return ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  };

  const maxDist = Math.max(...distances);
  const zeroOrder = distances.map((d) => Math.max(0, 1 - d / maxDist));
  const zeroR2 = fitR2(zeroOrder);

  const logValues = values.map((v) => Math.log(v + 1e-10));
  const logMeanY = logValues.reduce((a, b) => a + b, 0) / logValues.length;
  const meanX = distances.reduce((a, b) => a + b, 0) / distances.length;
  let slopeNum = 0, slopeDen = 0;
  for (let i = 0; i < distances.length; i++) {
    slopeNum += (distances[i] - meanX) * (logValues[i] - logMeanY);
    slopeDen += (distances[i] - meanX) ** 2;
  }
  const expSlope = slopeDen > 0 ? slopeNum / slopeDen : 0;
  const expIntercept = logMeanY - expSlope * meanX;
  const firstOrder = distances.map((d) => Math.exp(expIntercept + expSlope * d));
  const firstR2 = fitR2(firstOrder);

  const logDist = distances.map((d) => Math.log(d + 1e-10));
  const logMeanD = logDist.reduce((a, b) => a + b, 0) / logDist.length;
  let powNum = 0, powDen = 0;
  for (let i = 0; i < logDist.length; i++) {
    powNum += (logDist[i] - logMeanD) * (logValues[i] - logMeanY);
    powDen += (logDist[i] - logMeanD) ** 2;
  }
  const powSlope = powDen > 0 ? powNum / powDen : 0;
  const powIntercept = logMeanY - powSlope * logMeanD;
  const secondOrder = distances.map((d) => Math.exp(powIntercept + powSlope * Math.log(d + 1e-10)));
  const secondR2 = fitR2(secondOrder);

  const best = Math.max(zeroR2, firstR2, secondR2);
  if (best === zeroR2) return { order: "zero-order", r2: round(zeroR2) };
  if (best === firstR2) return { order: "first-order", r2: round(firstR2) };
  return { order: "second-order", r2: round(secondR2) };
}

function computeEquilibriumConstants(
  bins: BinReserves[],
  activeBin: number
): { profile: { binId: number; offset: number; keq: number }[]; skew: number; direction: string } {
  const profile: { binId: number; offset: number; keq: number }[] = [];

  for (const b of bins) {
    if (b.reserveXUsd > 0 && b.reserveYUsd > 0) {
      const keq = b.reserveXUsd / b.reserveYUsd;
      profile.push({
        binId: b.binId,
        offset: b.binId - activeBin,
        keq: round(keq),
      });
    }
  }

  if (profile.length === 0) return { profile, skew: 1, direction: "balanced" };

  const sorted = [...profile].sort((a, b) => a.keq - b.keq);
  const median = sorted[Math.floor(sorted.length / 2)].keq;

  let direction: string;
  if (median > 2) direction = "strongly-X-heavy";
  else if (median > 1.3) direction = "X-heavy";
  else if (median > 0.77) direction = "balanced";
  else if (median > 0.5) direction = "Y-heavy";
  else direction = "strongly-Y-heavy";

  return { profile: profile.slice(0, 20), skew: round(median), direction };
}

function computeLeChatelierIndex(bins: BinReserves[]): { index: number; leClass: string } {
  const vals = bins.map((b) => b.totalUsd);
  const total = vals.reduce((a, b) => a + b, 0);
  if (total === 0) return { index: 0, leClass: "inert" };

  const mean = total / vals.length;
  const cv = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length) / (mean || 1);
  const uniformityScore = Math.max(0, 1 - cv) * 35;

  let smoothGradients = 0;
  let totalGradients = 0;
  for (let i = 2; i < vals.length; i++) {
    const g1 = vals[i - 1] - vals[i - 2];
    const g2 = vals[i] - vals[i - 1];
    if (Math.sign(g1) === Math.sign(g2) || Math.abs(g2) < mean * 0.05) smoothGradients++;
    totalGradients++;
  }
  const smoothnessScore = totalGradients > 0 ? (smoothGradients / totalGradients) * 35 : 0;

  const activeFraction = vals.filter((v) => v > mean * 0.1).length / vals.length;
  const participationScore = activeFraction * 30;

  const index = Math.min(100, Math.max(0, uniformityScore + smoothnessScore + participationScore));

  let leClass: string;
  if (index >= 70) leClass = "strongly-restorative";
  else if (index >= 50) leClass = "restorative";
  else if (index >= 30) leClass = "neutral";
  else if (index >= 15) leClass = "vulnerable";
  else leClass = "fragile";

  return { index: Math.round(index), leClass };
}

function computeReactivityIndex(
  responseAmplitude: number,
  chainPotential: number,
  activeFraction: number,
  leChatelierIdx: number,
  reactionR2: number
): number {
  const responseScore = Math.min(responseAmplitude / 0.3, 1) * 25;
  const chainScore = Math.max(0, (chainPotential + 1) / 2) * 20;
  const activeScore = activeFraction * 20;
  const stabilityScore = (leChatelierIdx / 100) * 20;
  const fitScore = reactionR2 * 15;
  return Math.min(100, Math.max(0, responseScore + chainScore + activeScore + stabilityScore + fitScore));
}

function classifyReactivity(index: number): string {
  if (index < 15) return "inert";
  if (index < 30) return "sluggish";
  if (index < 50) return "moderate";
  if (index < 70) return "responsive";
  return "hyper-reactive";
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function analyzeReactivity(bins: BinReserves[], activeBin: number, pool: AppPool): ReactivityProfile {
  const responseAmplitude = computeResponseAmplitude(bins);
  const activationEnergy = computeActivationEnergy(bins);
  const chain = computeChainReactionPotential(bins);
  const catInh = detectCatalyticInhibitor(bins, activeBin);
  const rxnOrder = fitReactionOrder(bins, activeBin);
  const keq = computeEquilibriumConstants(bins, activeBin);
  const leChatelier = computeLeChatelierIndex(bins);

  const vals = bins.map((b) => b.totalUsd);
  const maxVal = Math.max(...vals) || 1;
  const activeBinCount = vals.filter((v) => v / maxVal >= activationEnergy).length;
  const inertBinCount = bins.length - activeBinCount;
  const activeFraction = bins.length > 0 ? activeBinCount / bins.length : 0;

  const reactivityIndex = computeReactivityIndex(
    responseAmplitude,
    chain.potential,
    activeFraction,
    leChatelier.index,
    rxnOrder.r2
  );

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId!,
    activeBin,
    binsAnalyzed: bins.length,
    activeBinCount,
    inertBinCount,
    reactivityIndex: Math.round(reactivityIndex),
    reactivityClass: classifyReactivity(reactivityIndex),
    responseAmplitude,
    activationEnergy,
    chainReactionPotential: chain.potential,
    chainReactionClass: chain.chainClass,
    catalyticBins: catInh.catalytic,
    inhibitorBins: catInh.inhibitor,
    reactionOrder: rxnOrder.order,
    reactionOrderR2: rxnOrder.r2,
    keqProfile: keq.profile,
    keqSkew: keq.skew,
    keqSkewDirection: keq.direction,
    leChatelierIndex: leChatelier.index,
    leChatelierClass: leChatelier.leClass,
    tvlUsd: round(pool.tvlUsd),
    volume24hUsd: round(pool.volume24hUsd),
  };
}

function renderReactivityMap(profile: ReactivityProfile, bins: BinReserves[]): string {
  const lines: string[] = [];
  lines.push(`\n=== REACTIVITY MAP: ${profile.pair} (pool ${profile.poolId}) ===`);
  lines.push(`Reactivity Index: ${profile.reactivityIndex}/100 (${profile.reactivityClass})`);
  lines.push(`Response Amplitude: ${profile.responseAmplitude} | Activation Energy: ${profile.activationEnergy}`);
  lines.push(`Chain Reaction: ${profile.chainReactionPotential} (${profile.chainReactionClass})`);
  lines.push(`Reaction Order: ${profile.reactionOrder} (R²=${profile.reactionOrderR2})`);
  lines.push(`Keq Skew: ${profile.keqSkew} (${profile.keqSkewDirection})`);
  lines.push(`Le Chatelier: ${profile.leChatelierIndex}/100 (${profile.leChatelierClass})`);
  lines.push(`Active bins: ${profile.activeBinCount} | Inert: ${profile.inertBinCount}`);
  lines.push("");

  if (bins.length > 0) {
    const vals = bins.map((b) => b.totalUsd);
    const max = Math.max(...vals) || 1;
    const width = 40;
    lines.push("Reactivity Profile (reserve density + annotations):");
    const step = Math.max(1, Math.floor(bins.length / 30));
    for (let i = 0; i < bins.length; i += step) {
      const b = bins[i];
      const barLen = Math.round((b.totalUsd / max) * width);
      const offset = b.binId - profile.activeBin;
      const marker = offset === 0 ? ">>>" : "   ";

      const catHit = profile.catalyticBins.find((c) => c.binId === b.binId);
      const inhHit = profile.inhibitorBins.find((c) => c.binId === b.binId);
      let tag = "";
      if (catHit) tag = " [CAT]";
      else if (inhHit) tag = " [INH]";

      lines.push(
        `${marker} ${String(offset).padStart(4)} | ${"█".repeat(barLen)}${"░".repeat(width - barLen)}${tag}`
      );
    }
    lines.push("");
  }

  if (profile.catalyticBins.length > 0) {
    lines.push("Catalytic Bins (amplifiers):");
    for (const c of profile.catalyticBins.slice(0, 5)) {
      lines.push(
        `  Bin ${c.binId} (offset ${c.offset > 0 ? "+" : ""}${c.offset}): reserve=${c.reserveFraction} grad=${c.surroundingGradient} amp=${c.amplificationRatio}`
      );
    }
    lines.push("");
  }

  if (profile.inhibitorBins.length > 0) {
    lines.push("Inhibitor Bins (dampeners):");
    for (const c of profile.inhibitorBins.slice(0, 5)) {
      lines.push(
        `  Bin ${c.binId} (offset ${c.offset > 0 ? "+" : ""}${c.offset}): reserve=${c.reserveFraction} grad=${c.surroundingGradient} amp=${c.amplificationRatio}`
      );
    }
    lines.push("");
  }

  if (profile.keqProfile.length > 0) {
    lines.push("Equilibrium Constant Profile (Keq = X/Y reserve ratio):");
    const step = Math.max(1, Math.floor(profile.keqProfile.length / 10));
    for (let i = 0; i < profile.keqProfile.length; i += step) {
      const k = profile.keqProfile[i];
      const bar = k.keq > 1 ? "X".repeat(Math.min(20, Math.round(k.keq * 5))) : "Y".repeat(Math.min(20, Math.round((1 / k.keq) * 5)));
      const dir = k.keq > 1 ? "X-heavy" : k.keq < 1 ? "Y-heavy" : "balanced";
      lines.push(`  offset ${k.offset > 0 ? "+" : ""}${k.offset}: Keq=${k.keq} ${bar} (${dir})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function analyzePool(
  pool: AppPool
): Promise<{ profile: ReactivityProfile; bins: BinReserves[] } | null> {
  try {
    const activeBin = pool.activeBinId ?? (await fetchActiveBin(pool.poolId!));
    const bins = await fetchBinReserves(pool.poolId!, activeBin, pool);
    if (bins.length < MIN_POPULATED_BINS) return null;
    const profile = analyzeReactivity(bins, activeBin, pool);
    return { profile, bins };
  } catch {
    return null;
  }
}

const program = new Command();

program
  .name("hodlmm-bin-reactivity")
  .description("HODLMM bin reactivity analyzer — response intensity, chain reactions, catalytic bins, Le Chatelier");

program
  .command("doctor")
  .description("Validate API connectivity")
  .action(async () => {
    try {
      const [bffRes, hiroRes] = await Promise.all([
        fetch(`${BFF_APP_BASE}/pools`).then((r) => ({ ok: r.ok, status: r.status })),
        fetch(`${HIRO_API}/v2/info`).then((r) => ({ ok: r.ok, status: r.status })),
      ]);
      console.log(
        JSON.stringify({
          result: "doctor",
          data: {
            bff: { ok: bffRes.ok, status: bffRes.status },
            hiro: { ok: hiroRes.ok, status: hiroRes.status },
            allHealthy: bffRes.ok && hiroRes.ok,
            analyses: ["run", "status"],
          },
        })
      );
    } catch (e: any) {
      console.log(JSON.stringify({ error: e.message }));
    }
  });

program
  .command("run")
  .description("Full reactivity analysis")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "3")
  .action(async (opts) => {
    try {
      const pools = await fetchPools();
      let selected: AppPool[];
      if (opts.pool) {
        selected = pools.filter((p) => p.poolId === parseInt(opts.pool));
        if (selected.length === 0) {
          console.log(JSON.stringify({ error: `Pool ${opts.pool} not found` }));
          return;
        }
      } else {
        selected = pools.sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, parseInt(opts.top));
      }

      const results: ReactivityProfile[] = [];
      let outputText = "";

      for (const pool of selected) {
        const result = await analyzePool(pool);
        if (result) {
          results.push(result.profile);
          outputText += renderReactivityMap(result.profile, result.bins);
        }
      }

      const avgIndex =
        results.length > 0 ? results.reduce((s, r) => s + r.reactivityIndex, 0) / results.length : 0;

      console.log(
        JSON.stringify({
          result: "reactivity_analysis",
          data: {
            pools: results,
            summary: {
              poolsAnalyzed: results.length,
              avgReactivityIndex: Math.round(avgIndex),
              hyperReactive: results.filter((r) => r.reactivityIndex >= 70).length,
              responsive: results.filter((r) => r.reactivityIndex >= 50).length,
              inert: results.filter((r) => r.reactivityIndex < 15).length,
              avgChainReaction: round(
                results.reduce((s, r) => s + r.chainReactionPotential, 0) / (results.length || 1)
              ),
              avgLeChatelier: Math.round(
                results.reduce((s, r) => s + r.leChatelierIndex, 0) / (results.length || 1)
              ),
            },
          },
        })
      );

      if (outputText) console.error(outputText);
    } catch (e: any) {
      console.log(JSON.stringify({ error: e.message }));
    }
  });

program
  .command("status")
  .description("Quick reactivity summary for top pools")
  .action(async () => {
    try {
      const pools = await fetchPools();
      const top = pools.sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, 5);
      const results: any[] = [];

      for (const pool of top) {
        const result = await analyzePool(pool);
        if (result) {
          results.push({
            pair: result.profile.pair,
            poolId: result.profile.poolId,
            reactivityIndex: result.profile.reactivityIndex,
            reactivityClass: result.profile.reactivityClass,
            chainReaction: result.profile.chainReactionPotential,
            chainClass: result.profile.chainReactionClass,
            catalyticCount: result.profile.catalyticBins.length,
            inhibitorCount: result.profile.inhibitorBins.length,
            reactionOrder: result.profile.reactionOrder,
            keqSkew: result.profile.keqSkew,
            leChatelier: result.profile.leChatelierIndex,
          });
        }
      }

      console.log(
        JSON.stringify({
          result: "reactivity_status",
          data: { pools: results, timestamp: new Date().toISOString() },
        })
      );
    } catch (e: any) {
      console.log(JSON.stringify({ error: e.message }));
    }
  });

program.parse();
