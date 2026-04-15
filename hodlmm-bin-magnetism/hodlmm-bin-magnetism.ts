#!/usr/bin/env bun
/**
 * hodlmm-bin-magnetism.ts — Day 139 cocoa007 Bitflow Skills Comp
 *
 * Magnetism analyzer — measures how bins attract or repel liquidity
 * based on reserve mass, fee generation potential, and proximity effects.
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

interface MagneticPole {
  binId: number;
  reserveUsd: number;
  fieldStrength: number;
  polarity: string;
  influenceRadius: number;
  nearestPoleDistance: number;
}

interface FieldInteraction {
  bin1: number;
  bin2: number;
  separation: number;
  interactionStrength: number;
  type: string;
}

interface MagnetismProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  poleCount: number;
  northPoles: number;
  southPoles: number;
  strongestPoleStrength: number;
  weakestPoleStrength: number;
  avgFieldStrength: number;
  fieldUniformity: number;
  dipoleMoment: number;
  totalMagnetization: number;
  remanence: number;
  susceptibility: number;
  coercivity: number;
  hysteresisArea: number;
  attractionZones: number;
  repulsionZones: number;
  neutralZones: number;
  avgAttractionStrength: number;
  avgRepulsionStrength: number;
  fieldGradientMax: number;
  fieldGradientAvg: number;
  curieDistance: number;
  domainCount: number;
  avgDomainSize: number;
  domainAlignment: number;
  activeBinFieldStrength: number;
  activeBinPolarity: string;
  concentrationGini: number;
  magnetismIndex: number;
  magnetismClass: string;
  fieldVerdict: string;
  poles: MagneticPole[];
  interactions: FieldInteraction[];
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

function computeFieldStrength(reserveUsd: number, avgReserveUsd: number): number {
  if (avgReserveUsd === 0) return 0;
  return reserveUsd / avgReserveUsd;
}

function analyzeMagnetism(bins: BinReserves[], pool: AppPool): MagnetismProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const avgReserve = totalUsd / n;
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;

  // Field strength per bin (reserve mass relative to average)
  const fieldStrengths = sorted.map((b) => computeFieldStrength(b.totalUsd, avgReserve));

  // Identify magnetic poles: bins with field strength > 1.5x average (north) or < 0.5x (south)
  const poles: MagneticPole[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const fs = fieldStrengths[i];
    if (fs > 1.5 || fs < 0.5) {
      const polarity = fs > 1.5 ? "NORTH" : "SOUTH";
      // Influence radius: how far the field effect extends
      let influenceRadius = 0;
      for (let j = 1; j <= 10; j++) {
        const leftIdx = sorted.findIndex((b) => b.binId === sorted[i].binId - j);
        const rightIdx = sorted.findIndex((b) => b.binId === sorted[i].binId + j);
        const leftFs = leftIdx >= 0 ? fieldStrengths[leftIdx] : 1;
        const rightFs = rightIdx >= 0 ? fieldStrengths[rightIdx] : 1;
        if (polarity === "NORTH" && (leftFs > 1.2 || rightFs > 1.2)) {
          influenceRadius = j;
        } else if (polarity === "SOUTH" && (leftFs < 0.8 || rightFs < 0.8)) {
          influenceRadius = j;
        } else {
          break;
        }
      }
      poles.push({
        binId: sorted[i].binId,
        reserveUsd: r2(sorted[i].totalUsd),
        fieldStrength: r4(fs),
        polarity,
        influenceRadius,
        nearestPoleDistance: 0,
      });
    }
  }

  // Compute nearest pole distances
  for (let i = 0; i < poles.length; i++) {
    let minDist = Infinity;
    for (let j = 0; j < poles.length; j++) {
      if (i === j) continue;
      const dist = Math.abs(poles[i].binId - poles[j].binId);
      if (dist < minDist) minDist = dist;
    }
    poles[i].nearestPoleDistance = minDist === Infinity ? 0 : minDist;
  }

  const northPoles = poles.filter((p) => p.polarity === "NORTH").length;
  const southPoles = poles.filter((p) => p.polarity === "SOUTH").length;

  // Field interactions between significant poles
  const interactions: FieldInteraction[] = [];
  const significantPoles = poles.sort((a, b) => b.fieldStrength - a.fieldStrength).slice(0, 10);
  for (let i = 0; i < significantPoles.length; i++) {
    for (let j = i + 1; j < significantPoles.length; j++) {
      const sep = Math.abs(significantPoles[i].binId - significantPoles[j].binId);
      const strength = (significantPoles[i].fieldStrength * significantPoles[j].fieldStrength) / (sep * sep || 1);
      const samePolarity = significantPoles[i].polarity === significantPoles[j].polarity;
      interactions.push({
        bin1: significantPoles[i].binId,
        bin2: significantPoles[j].binId,
        separation: sep,
        interactionStrength: r4(strength),
        type: samePolarity ? "REPULSION" : "ATTRACTION",
      });
    }
  }
  interactions.sort((a, b) => b.interactionStrength - a.interactionStrength);

  // Magnetic field statistics
  const strongestPole = poles.length > 0 ? Math.max(...poles.map((p) => p.fieldStrength)) : 0;
  const weakestPole = poles.length > 0 ? Math.min(...poles.map((p) => p.fieldStrength)) : 0;
  const avgFs = fieldStrengths.length > 0
    ? fieldStrengths.reduce((s, v) => s + v, 0) / fieldStrengths.length
    : 0;

  // Field uniformity: 1 - coefficient of variation (1.0 = perfectly uniform)
  const fsVariance = fieldStrengths.length > 0
    ? fieldStrengths.reduce((s, v) => s + (v - avgFs) ** 2, 0) / fieldStrengths.length
    : 0;
  const fsCv = avgFs > 0 ? Math.sqrt(fsVariance) / avgFs : 0;
  const fieldUniformity = r4(Math.max(0, 1 - fsCv));

  // Dipole moment: directional asymmetry of reserve mass relative to active bin
  let leftMass = 0;
  let rightMass = 0;
  let leftWeighted = 0;
  let rightWeighted = 0;
  for (const b of sorted) {
    const dist = b.binId - activeBin;
    if (dist < 0) {
      leftMass += b.totalUsd;
      leftWeighted += b.totalUsd * Math.abs(dist);
    } else if (dist > 0) {
      rightMass += b.totalUsd;
      rightWeighted += b.totalUsd * dist;
    }
  }
  const dipoleMoment = totalUsd > 0 ? r4((rightWeighted - leftWeighted) / (totalUsd * BIN_SCAN_RADIUS)) : 0;

  // Total magnetization: net field strength (positive = overall attractive, negative = repulsive)
  const totalMagnetization = r4(
    poles.reduce((s, p) => s + (p.polarity === "NORTH" ? p.fieldStrength : -p.fieldStrength), 0) /
      Math.max(1, poles.length)
  );

  // Remanence: residual field strength after removing the active bin's influence
  const activeBinData = sorted.find((b) => b.binId === activeBin);
  const activeBinFs = activeBinData ? computeFieldStrength(activeBinData.totalUsd, avgReserve) : 1;
  const nonActiveFs = fieldStrengths.filter((_, i) => sorted[i].binId !== activeBin);
  const remanence = nonActiveFs.length > 0
    ? r4(nonActiveFs.reduce((s, v) => s + Math.abs(v - 1), 0) / nonActiveFs.length)
    : 0;

  // Susceptibility: how responsive the field is to reserve changes
  // Measured as variance of field strength normalized by mean
  const susceptibility = avgFs > 0 ? r4(fsVariance / avgFs) : 0;

  // Coercivity: the reserve threshold needed to flip a bin's polarity
  // Approximated as the gap between average north and south pole strengths
  const northAvg = northPoles > 0
    ? poles.filter((p) => p.polarity === "NORTH").reduce((s, p) => s + p.fieldStrength, 0) / northPoles
    : 1;
  const southAvg = southPoles > 0
    ? poles.filter((p) => p.polarity === "SOUTH").reduce((s, p) => s + p.fieldStrength, 0) / southPoles
    : 1;
  const coercivity = r4(Math.abs(northAvg - southAvg));

  // Hysteresis area: product of coercivity and remanence (path-dependent behavior proxy)
  const hysteresisArea = r4(coercivity * remanence);

  // Zone classification: attraction (above avg), repulsion (below avg), neutral
  let attractionZones = 0;
  let repulsionZones = 0;
  let neutralZones = 0;
  let attractionSum = 0;
  let repulsionSum = 0;
  for (const fs of fieldStrengths) {
    if (fs > 1.2) { attractionZones++; attractionSum += fs; }
    else if (fs < 0.8) { repulsionZones++; repulsionSum += fs; }
    else neutralZones++;
  }
  const avgAttractionStrength = attractionZones > 0 ? r4(attractionSum / attractionZones) : 0;
  const avgRepulsionStrength = repulsionZones > 0 ? r4(repulsionSum / repulsionZones) : 0;

  // Field gradient: rate of field change between adjacent bins
  const gradients: number[] = [];
  for (let i = 1; i < fieldStrengths.length; i++) {
    if (sorted[i].binId - sorted[i - 1].binId === 1) {
      gradients.push(Math.abs(fieldStrengths[i] - fieldStrengths[i - 1]));
    }
  }
  const fieldGradientMax = gradients.length > 0 ? r4(Math.max(...gradients)) : 0;
  const fieldGradientAvg = gradients.length > 0
    ? r4(gradients.reduce((s, v) => s + v, 0) / gradients.length)
    : 0;

  // Curie distance: distance from active bin where field strength drops below 0.5
  let curieDistance = BIN_SCAN_RADIUS;
  for (let d = 1; d <= BIN_SCAN_RADIUS; d++) {
    const leftBin = sorted.find((b) => b.binId === activeBin - d);
    const rightBin = sorted.find((b) => b.binId === activeBin + d);
    const leftFs = leftBin ? computeFieldStrength(leftBin.totalUsd, avgReserve) : 0;
    const rightFs = rightBin ? computeFieldStrength(rightBin.totalUsd, avgReserve) : 0;
    if (leftFs < 0.5 && rightFs < 0.5) {
      curieDistance = d;
      break;
    }
  }

  // Magnetic domains: contiguous regions with same polarity tendency
  const domains: { start: number; end: number; polarity: string }[] = [];
  let domStart = 0;
  let domPolarity = fieldStrengths[0] >= 1 ? "NORTH" : "SOUTH";
  for (let i = 1; i <= fieldStrengths.length; i++) {
    const curPol = i < fieldStrengths.length ? (fieldStrengths[i] >= 1 ? "NORTH" : "SOUTH") : "";
    if (curPol !== domPolarity || i === fieldStrengths.length) {
      domains.push({
        start: sorted[domStart].binId,
        end: sorted[i - 1].binId,
        polarity: domPolarity,
      });
      if (i < fieldStrengths.length) {
        domStart = i;
        domPolarity = curPol;
      }
    }
  }
  const domainCount = domains.length;
  const avgDomainSize = domainCount > 0
    ? r4(n / domainCount)
    : 0;

  // Domain alignment: fraction of bins aligned with the dominant polarity
  const northCount = fieldStrengths.filter((f) => f >= 1).length;
  const southCount = fieldStrengths.filter((f) => f < 1).length;
  const domainAlignment = n > 0
    ? r4(Math.max(northCount, southCount) / n)
    : 0;

  // Active bin field
  const activeBinFieldStrength = r4(activeBinFs);
  const activeBinPolarity = activeBinFs >= 1.5 ? "STRONG_NORTH" :
    activeBinFs >= 1.0 ? "NORTH" :
    activeBinFs >= 0.5 ? "SOUTH" : "STRONG_SOUTH";

  // Gini coefficient
  const reserves = sorted.map((b) => b.totalUsd);
  const sortedReserves = [...reserves].sort((a, b) => a - b);
  let giniNum = 0;
  for (let i = 0; i < sortedReserves.length; i++) {
    giniNum += (2 * (i + 1) - sortedReserves.length - 1) * sortedReserves[i];
  }
  const giniDenom = sortedReserves.length * sortedReserves.reduce((s, v) => s + v, 0);
  const concentrationGini = giniDenom > 0 ? r4(giniNum / giniDenom) : 0;

  // Composite magnetism index (0-100)
  const uniformityScore = Math.min(25, fieldUniformity * 25);
  const strengthScore = Math.min(25, Math.min(avgFs, 2) / 2 * 25);
  const alignmentScore = Math.min(25, domainAlignment * 25);
  const curieScore = Math.min(25, (curieDistance / BIN_SCAN_RADIUS) * 25);
  const magnetismIndex = Math.round(
    Math.min(100, uniformityScore + strengthScore + alignmentScore + curieScore)
  );

  let magnetismClass: string;
  if (magnetismIndex >= 80) magnetismClass = "FERROMAGNETIC";
  else if (magnetismIndex >= 60) magnetismClass = "PARAMAGNETIC";
  else if (magnetismIndex >= 40) magnetismClass = "DIAMAGNETIC";
  else if (magnetismIndex >= 20) magnetismClass = "ANTIFERROMAGNETIC";
  else magnetismClass = "DEMAGNETIZED";

  let fieldVerdict: string;
  if (fieldUniformity > 0.7 && curieDistance > 15) fieldVerdict = "STRONG_FIELD";
  else if (fieldUniformity > 0.5 && curieDistance > 8) fieldVerdict = "MODERATE_FIELD";
  else if (poles.length > 0 && curieDistance > 3) fieldVerdict = "WEAK_FIELD";
  else if (poles.length > 0) fieldVerdict = "SCATTERED_POLES";
  else fieldVerdict = "NO_FIELD";

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    poleCount: poles.length,
    northPoles,
    southPoles,
    strongestPoleStrength: r4(strongestPole),
    weakestPoleStrength: r4(weakestPole),
    avgFieldStrength: r4(avgFs),
    fieldUniformity,
    dipoleMoment,
    totalMagnetization,
    remanence,
    susceptibility,
    coercivity,
    hysteresisArea,
    attractionZones,
    repulsionZones,
    neutralZones,
    avgAttractionStrength,
    avgRepulsionStrength,
    fieldGradientMax,
    fieldGradientAvg,
    curieDistance,
    domainCount,
    avgDomainSize,
    domainAlignment,
    activeBinFieldStrength,
    activeBinPolarity,
    concentrationGini,
    magnetismIndex,
    magnetismClass,
    fieldVerdict,
    poles: poles.slice(0, 10),
    interactions: interactions.slice(0, 10),
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Magnetism — Doctor ===\n");
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

  const profiles: MagnetismProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeMagnetism(bins, pool));
    } catch {
      continue;
    }
  }

  const summary = {
    poolsAnalyzed: profiles.length,
    avgMagnetismIndex: profiles.length > 0
      ? r2(profiles.reduce((s, p) => s + p.magnetismIndex, 0) / profiles.length)
      : 0,
    ferromagneticCount: profiles.filter((p) => p.magnetismClass === "FERROMAGNETIC").length,
    paramagneticCount: profiles.filter((p) => p.magnetismClass === "PARAMAGNETIC").length,
    diamagneticCount: profiles.filter((p) => p.magnetismClass === "DIAMAGNETIC").length,
    antiferromagneticCount: profiles.filter((p) => p.magnetismClass === "ANTIFERROMAGNETIC").length,
    demagnetizedCount: profiles.filter((p) => p.magnetismClass === "DEMAGNETIZED").length,
    avgFieldUniformity: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.fieldUniformity, 0) / profiles.length)
      : 0,
    avgSusceptibility: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.susceptibility, 0) / profiles.length)
      : 0,
    avgCurieDistance: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.curieDistance, 0) / profiles.length)
      : 0,
    avgGini: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.concentrationGini, 0) / profiles.length)
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-magnetism").description("HODLMM bin magnetism analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin magnetism")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
