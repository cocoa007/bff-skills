#!/usr/bin/env bun
/**
 * hodlmm-bin-torque.ts — Day 117 cocoa007 Bitflow Skills Comp
 *
 * Bin torque analyzer — rotational force analysis of reserve distributions
 * around the active bin pivot point.
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

interface TorqueProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsAnalyzed: number;
  torqueIndex: number;
  torqueClass: string;
  netTorque: number;
  netTorqueDirection: string;
  torqueMagnitude: number;
  clockwiseTorque: number;
  counterClockwiseTorque: number;
  momentOfInertia: number;
  inertiaClass: string;
  angularMomentum: number;
  angularVelocity: number;
  rotationalEquilibrium: number;
  equilibriumClass: string;
  leverArmAsymmetry: number;
  leverArmDirection: string;
  torqueDensityLeft: number;
  torqueDensityRight: number;
  precessionAngle: number;
  precessionClass: string;
  gyroscopicStability: number;
  stabilityClass: string;
  pivotStress: number;
  pivotStressClass: string;
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

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function computeTorque(bins: BinReserves[], activeBin: number): {
  netTorque: number;
  magnitude: number;
  clockwise: number;
  counterClockwise: number;
  direction: string;
} {
  let clockwise = 0;
  let counterClockwise = 0;

  for (const b of bins) {
    const arm = b.binId - activeBin;
    const force = b.totalUsd;
    const torque = arm * force;
    if (torque > 0) counterClockwise += torque;
    else if (torque < 0) clockwise += Math.abs(torque);
  }

  const netTorque = counterClockwise - clockwise;
  const magnitude = counterClockwise + clockwise;
  let direction: string;
  if (magnitude === 0) direction = "zero";
  else if (Math.abs(netTorque) / magnitude < 0.1) direction = "balanced";
  else if (netTorque > 0) direction = "counter-clockwise";
  else direction = "clockwise";

  return {
    netTorque: round(netTorque),
    magnitude: round(magnitude),
    clockwise: round(clockwise),
    counterClockwise: round(counterClockwise),
    direction,
  };
}

function computeMomentOfInertia(bins: BinReserves[], activeBin: number): {
  moi: number;
  moiClass: string;
} {
  let moi = 0;
  for (const b of bins) {
    const r = Math.abs(b.binId - activeBin);
    moi += b.totalUsd * r * r;
  }
  const totalMass = bins.reduce((s, b) => s + b.totalUsd, 0) || 1;
  const normalizedMoi = moi / totalMass;

  let moiClass: string;
  if (normalizedMoi < 10) moiClass = "compact";
  else if (normalizedMoi < 50) moiClass = "moderate";
  else if (normalizedMoi < 200) moiClass = "spread";
  else moiClass = "dispersed";

  return { moi: round(normalizedMoi), moiClass };
}

function computeAngularMomentum(bins: BinReserves[], activeBin: number): {
  angularMomentum: number;
  angularVelocity: number;
} {
  const totalMass = bins.reduce((s, b) => s + b.totalUsd, 0) || 1;
  let weightedOffset = 0;
  for (const b of bins) {
    weightedOffset += (b.binId - activeBin) * b.totalUsd;
  }
  const centerOfMass = weightedOffset / totalMass;

  let moi = 0;
  for (const b of bins) {
    const r = Math.abs(b.binId - activeBin);
    moi += b.totalUsd * r * r;
  }

  const xMoment = bins.reduce((s, b) => s + (b.reserveXUsd - b.reserveYUsd) * (b.binId - activeBin), 0);
  const angularVelocity = moi > 0 ? xMoment / moi : 0;
  const angularMomentum = moi * angularVelocity;

  return {
    angularMomentum: round(angularMomentum),
    angularVelocity: round(angularVelocity),
  };
}

function computeRotationalEquilibrium(bins: BinReserves[], activeBin: number): {
  equilibrium: number;
  eqClass: string;
} {
  const torqueResult = computeTorque(bins, activeBin);
  if (torqueResult.magnitude === 0) return { equilibrium: 100, eqClass: "perfect" };

  const ratio = 1 - Math.abs(torqueResult.netTorque) / torqueResult.magnitude;
  const score = Math.max(0, Math.min(100, ratio * 100));

  let eqClass: string;
  if (score >= 90) eqClass = "perfect";
  else if (score >= 70) eqClass = "stable";
  else if (score >= 50) eqClass = "tilted";
  else if (score >= 30) eqClass = "unbalanced";
  else eqClass = "extreme-tilt";

  return { equilibrium: Math.round(score), eqClass };
}

function computeLeverArmAsymmetry(bins: BinReserves[], activeBin: number): {
  asymmetry: number;
  direction: string;
  densityLeft: number;
  densityRight: number;
} {
  let leftMass = 0, rightMass = 0;
  let leftWeightedArm = 0, rightWeightedArm = 0;
  let leftCount = 0, rightCount = 0;

  for (const b of bins) {
    const offset = b.binId - activeBin;
    if (offset < 0) {
      leftMass += b.totalUsd;
      leftWeightedArm += Math.abs(offset) * b.totalUsd;
      leftCount++;
    } else if (offset > 0) {
      rightMass += b.totalUsd;
      rightWeightedArm += offset * b.totalUsd;
      rightCount++;
    }
  }

  const avgLeftArm = leftMass > 0 ? leftWeightedArm / leftMass : 0;
  const avgRightArm = rightMass > 0 ? rightWeightedArm / rightMass : 0;
  const maxArm = Math.max(avgLeftArm, avgRightArm) || 1;
  const asymmetry = Math.abs(avgLeftArm - avgRightArm) / maxArm;

  let direction: string;
  if (asymmetry < 0.1) direction = "symmetric";
  else if (avgLeftArm > avgRightArm) direction = "left-extended";
  else direction = "right-extended";

  const densityLeft = leftCount > 0 ? leftMass / leftCount : 0;
  const densityRight = rightCount > 0 ? rightMass / rightCount : 0;

  return {
    asymmetry: round(asymmetry),
    direction,
    densityLeft: round(densityLeft),
    densityRight: round(densityRight),
  };
}

function computePrecession(bins: BinReserves[], activeBin: number): {
  angle: number;
  preClass: string;
} {
  let xTorque = 0, yTorque = 0;
  for (const b of bins) {
    const arm = b.binId - activeBin;
    xTorque += arm * b.reserveXUsd;
    yTorque += arm * b.reserveYUsd;
  }

  const totalTorque = Math.sqrt(xTorque * xTorque + yTorque * yTorque) || 1;
  const angle = Math.atan2(yTorque, xTorque) * (180 / Math.PI);

  let preClass: string;
  const absAngle = Math.abs(angle);
  if (absAngle < 15) preClass = "aligned-X";
  else if (absAngle > 75 && absAngle < 105) preClass = "aligned-Y";
  else if (angle > 0) preClass = "precessing-Y";
  else preClass = "precessing-X";

  return { angle: round(angle), preClass };
}

function computeGyroscopicStability(bins: BinReserves[], activeBin: number): {
  stability: number;
  stabClass: string;
} {
  const moiResult = computeMomentOfInertia(bins, activeBin);
  const eqResult = computeRotationalEquilibrium(bins, activeBin);
  const leverResult = computeLeverArmAsymmetry(bins, activeBin);

  const inertiaScore = Math.min(moiResult.moi / 100, 1) * 30;
  const eqScore = (eqResult.equilibrium / 100) * 40;
  const symmetryScore = (1 - leverResult.asymmetry) * 30;

  const stability = Math.min(100, Math.max(0, inertiaScore + eqScore + symmetryScore));

  let stabClass: string;
  if (stability >= 80) stabClass = "gyroscopic";
  else if (stability >= 60) stabClass = "stable";
  else if (stability >= 40) stabClass = "wobbly";
  else if (stability >= 20) stabClass = "unstable";
  else stabClass = "tumbling";

  return { stability: Math.round(stability), stabClass };
}

function computePivotStress(bins: BinReserves[], activeBin: number): {
  stress: number;
  stressClass: string;
} {
  const pivotBin = bins.find((b) => b.binId === activeBin);
  const pivotReserve = pivotBin ? pivotBin.totalUsd : 0;
  const totalReserve = bins.reduce((s, b) => s + b.totalUsd, 0) || 1;

  let forceOnPivot = 0;
  for (const b of bins) {
    if (b.binId === activeBin) continue;
    const dist = Math.abs(b.binId - activeBin);
    forceOnPivot += b.totalUsd / (dist || 1);
  }

  const pivotFraction = pivotReserve / totalReserve;
  const stressRatio = pivotFraction > 0 ? forceOnPivot / (pivotReserve || 1) : forceOnPivot;
  const normalized = Math.min(100, stressRatio * 10);

  let stressClass: string;
  if (normalized >= 80) stressClass = "critical";
  else if (normalized >= 60) stressClass = "high";
  else if (normalized >= 40) stressClass = "moderate";
  else if (normalized >= 20) stressClass = "low";
  else stressClass = "minimal";

  return { stress: Math.round(normalized), stressClass };
}

function computeTorqueIndex(
  eqScore: number,
  gyroStab: number,
  pivotStress: number,
  moiNorm: number,
  asymmetry: number
): number {
  const eqComponent = (eqScore / 100) * 25;
  const stabComponent = (gyroStab / 100) * 25;
  const stressComponent = (1 - pivotStress / 100) * 20;
  const inertiaComponent = Math.min(moiNorm / 100, 1) * 15;
  const symComponent = (1 - asymmetry) * 15;
  return Math.min(100, Math.max(0, eqComponent + stabComponent + stressComponent + inertiaComponent + symComponent));
}

function classifyTorque(index: number): string {
  if (index < 15) return "tumbling";
  if (index < 30) return "wobbly";
  if (index < 50) return "tilted";
  if (index < 70) return "balanced";
  return "gyroscopic";
}

function analyzeTorque(bins: BinReserves[], activeBin: number, pool: AppPool): TorqueProfile {
  const torque = computeTorque(bins, activeBin);
  const moi = computeMomentOfInertia(bins, activeBin);
  const angular = computeAngularMomentum(bins, activeBin);
  const eq = computeRotationalEquilibrium(bins, activeBin);
  const lever = computeLeverArmAsymmetry(bins, activeBin);
  const precession = computePrecession(bins, activeBin);
  const gyro = computeGyroscopicStability(bins, activeBin);
  const pivot = computePivotStress(bins, activeBin);

  const torqueIndex = computeTorqueIndex(eq.equilibrium, gyro.stability, pivot.stress, moi.moi, lever.asymmetry);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId!,
    activeBin,
    binsAnalyzed: bins.length,
    torqueIndex: Math.round(torqueIndex),
    torqueClass: classifyTorque(torqueIndex),
    netTorque: torque.netTorque,
    netTorqueDirection: torque.direction,
    torqueMagnitude: torque.magnitude,
    clockwiseTorque: torque.clockwise,
    counterClockwiseTorque: torque.counterClockwise,
    momentOfInertia: moi.moi,
    inertiaClass: moi.moiClass,
    angularMomentum: angular.angularMomentum,
    angularVelocity: angular.angularVelocity,
    rotationalEquilibrium: eq.equilibrium,
    equilibriumClass: eq.eqClass,
    leverArmAsymmetry: lever.asymmetry,
    leverArmDirection: lever.direction,
    torqueDensityLeft: lever.densityLeft,
    torqueDensityRight: lever.densityRight,
    precessionAngle: precession.angle,
    precessionClass: precession.preClass,
    gyroscopicStability: gyro.stability,
    stabilityClass: gyro.stabClass,
    pivotStress: pivot.stress,
    pivotStressClass: pivot.stressClass,
    tvlUsd: round(pool.tvlUsd),
    volume24hUsd: round(pool.volume24hUsd),
  };
}

function renderTorqueMap(profile: TorqueProfile, bins: BinReserves[]): string {
  const lines: string[] = [];
  lines.push(`\n=== TORQUE MAP: ${profile.pair} (pool ${profile.poolId}) ===`);
  lines.push(`Torque Index: ${profile.torqueIndex}/100 (${profile.torqueClass})`);
  lines.push(`Net Torque: ${profile.netTorque} (${profile.netTorqueDirection})`);
  lines.push(`CW: ${profile.clockwiseTorque} | CCW: ${profile.counterClockwiseTorque} | Magnitude: ${profile.torqueMagnitude}`);
  lines.push(`Moment of Inertia: ${profile.momentOfInertia} (${profile.inertiaClass})`);
  lines.push(`Angular Momentum: ${profile.angularMomentum} | Velocity: ${profile.angularVelocity}`);
  lines.push(`Rotational Eq: ${profile.rotationalEquilibrium}/100 (${profile.equilibriumClass})`);
  lines.push(`Lever Arm: ${profile.leverArmAsymmetry} asymmetry (${profile.leverArmDirection})`);
  lines.push(`Precession: ${profile.precessionAngle}° (${profile.precessionClass})`);
  lines.push(`Gyroscopic Stability: ${profile.gyroscopicStability}/100 (${profile.stabilityClass})`);
  lines.push(`Pivot Stress: ${profile.pivotStress}/100 (${profile.pivotStressClass})`);
  lines.push("");

  if (bins.length > 0) {
    const vals = bins.map((b) => b.totalUsd);
    const max = Math.max(...vals) || 1;
    const width = 40;
    lines.push("Torque Distribution (reserve × lever arm):");
    const step = Math.max(1, Math.floor(bins.length / 30));
    for (let i = 0; i < bins.length; i += step) {
      const b = bins[i];
      const offset = b.binId - profile.activeBin;
      const torqueVal = Math.abs(offset * b.totalUsd);
      const maxTorque = Math.max(...bins.map((bb) => Math.abs((bb.binId - profile.activeBin) * bb.totalUsd))) || 1;
      const barLen = Math.round((torqueVal / maxTorque) * width);
      const marker = offset === 0 ? ">>>" : "   ";
      const dir = offset < 0 ? "CW" : offset > 0 ? "CC" : "**";
      lines.push(
        `${marker} ${String(offset).padStart(4)} | ${"█".repeat(barLen)}${"░".repeat(width - barLen)} [${dir}]`
      );
    }
    lines.push("");

    lines.push("Reserve Balance Beam:");
    const leftBins = bins.filter((b) => b.binId < profile.activeBin);
    const rightBins = bins.filter((b) => b.binId > profile.activeBin);
    const leftTotal = leftBins.reduce((s, b) => s + b.totalUsd, 0);
    const rightTotal = rightBins.reduce((s, b) => s + b.totalUsd, 0);
    const beamMax = Math.max(leftTotal, rightTotal) || 1;
    const leftBar = Math.round((leftTotal / beamMax) * 20);
    const rightBar = Math.round((rightTotal / beamMax) * 20);
    lines.push(`  Left  ${"█".repeat(leftBar)}${"░".repeat(20 - leftBar)} $${leftTotal.toFixed(0)}`);
    lines.push(`  Pivot ---- ▲ ----`);
    lines.push(`  Right ${"█".repeat(rightBar)}${"░".repeat(20 - rightBar)} $${rightTotal.toFixed(0)}`);
    lines.push("");
  }

  return lines.join("\n");
}

async function analyzePool(
  pool: AppPool
): Promise<{ profile: TorqueProfile; bins: BinReserves[] } | null> {
  try {
    const activeBin = pool.activeBinId ?? (await fetchActiveBin(pool.poolId!));
    const bins = await fetchBinReserves(pool.poolId!, activeBin, pool);
    if (bins.length < MIN_POPULATED_BINS) return null;
    const profile = analyzeTorque(bins, activeBin, pool);
    return { profile, bins };
  } catch {
    return null;
  }
}

const program = new Command();

program
  .name("hodlmm-bin-torque")
  .description("HODLMM bin torque analyzer — rotational forces, angular momentum, gyroscopic stability");

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
  .description("Full torque analysis")
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

      const results: TorqueProfile[] = [];
      let outputText = "";

      for (const pool of selected) {
        const result = await analyzePool(pool);
        if (result) {
          results.push(result.profile);
          outputText += renderTorqueMap(result.profile, result.bins);
        }
      }

      const avgIndex =
        results.length > 0 ? results.reduce((s, r) => s + r.torqueIndex, 0) / results.length : 0;

      console.log(
        JSON.stringify({
          result: "torque_analysis",
          data: {
            pools: results,
            summary: {
              poolsAnalyzed: results.length,
              avgTorqueIndex: Math.round(avgIndex),
              gyroscopic: results.filter((r) => r.torqueIndex >= 70).length,
              balanced: results.filter((r) => r.torqueIndex >= 50).length,
              tumbling: results.filter((r) => r.torqueIndex < 15).length,
              avgEquilibrium: Math.round(
                results.reduce((s, r) => s + r.rotationalEquilibrium, 0) / (results.length || 1)
              ),
              avgGyroStability: Math.round(
                results.reduce((s, r) => s + r.gyroscopicStability, 0) / (results.length || 1)
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
  .description("Quick torque summary for top pools")
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
            torqueIndex: result.profile.torqueIndex,
            torqueClass: result.profile.torqueClass,
            netTorqueDirection: result.profile.netTorqueDirection,
            equilibrium: result.profile.rotationalEquilibrium,
            equilibriumClass: result.profile.equilibriumClass,
            gyroStability: result.profile.gyroscopicStability,
            stabilityClass: result.profile.stabilityClass,
            pivotStress: result.profile.pivotStress,
            inertiaClass: result.profile.inertiaClass,
          });
        }
      }

      console.log(
        JSON.stringify({
          result: "torque_status",
          data: { pools: results, timestamp: new Date().toISOString() },
        })
      );
    } catch (e: any) {
      console.log(JSON.stringify({ error: e.message }));
    }
  });

program.parse();
