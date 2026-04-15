#!/usr/bin/env bun
/**
 * hodlmm-bin-diffusion.ts — Day 115 cocoa007 Bitflow Skills Comp
 *
 * Liquidity diffusion analyzer — models how reserves spread across
 * bins using Fick's laws, concentration gradients, Peclet numbers,
 * penetration depth, and Gaussian profile fitting.
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

interface ConcentrationGradient {
  binId: number;
  offset: number;
  gradient: number;
  gradientClass: string;
}

interface DiffusionFront {
  binId: number;
  offset: number;
  side: "left" | "right";
  sharpness: number;
}

interface SourceSink {
  binId: number;
  offset: number;
  type: "source" | "sink";
  intensity: number;
}

interface DiffusionProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsAnalyzed: number;
  diffusionIndex: number;
  diffusionClass: string;
  diffusionCoefficient: number;
  pecletNumber: number;
  pecletClass: string;
  penetrationDepthLeft: number;
  penetrationDepthRight: number;
  penetrationAsymmetry: number;
  gaussianFitR2: number;
  gaussianFitClass: string;
  gaussianSigma: number;
  kurtosis: number;
  kurtosisClass: string;
  maxGradient: number;
  avgGradient: number;
  gradientProfile: ConcentrationGradient[];
  diffusionFronts: DiffusionFront[];
  sourcesSinks: SourceSink[];
  tvlUsd: number;
  volume24hUsd: number;
}

async function fetchPools(): Promise<AppPool[]> {
  const res = await fetch(`${BFF_APP_BASE}/pools`);
  if (!res.ok) throw new Error(`BFF pools API: ${res.status}`);
  const body = await res.json() as any;
  const pools: AppPool[] = (body.data?.pools ?? body.pools ?? body ?? []);
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
  const data = await res.json() as any;
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

function computeConcentrationGradients(bins: BinReserves[], activeBin: number): ConcentrationGradient[] {
  const gradients: ConcentrationGradient[] = [];
  for (let i = 1; i < bins.length; i++) {
    const dC = bins[i].totalUsd - bins[i - 1].totalUsd;
    const dx = bins[i].binId - bins[i - 1].binId;
    const grad = dx !== 0 ? dC / dx : 0;
    gradients.push({
      binId: bins[i].binId,
      offset: bins[i].binId - activeBin,
      gradient: round(grad),
      gradientClass: classifyGradient(Math.abs(grad), bins),
    });
  }
  return gradients;
}

function classifyGradient(absGrad: number, bins: BinReserves[]): string {
  const maxUsd = Math.max(...bins.map((b) => b.totalUsd)) || 1;
  const relGrad = absGrad / maxUsd;
  if (relGrad < 0.02) return "flat";
  if (relGrad < 0.10) return "gentle";
  if (relGrad < 0.30) return "moderate";
  if (relGrad < 0.60) return "steep";
  return "cliff";
}

function computeDiffusionCoefficient(bins: BinReserves[], activeBin: number): number {
  const vals = bins.map((b) => b.totalUsd);
  const total = vals.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;

  const positions = bins.map((b) => b.binId - activeBin);
  const weights = vals.map((v) => v / total);

  const meanPos = positions.reduce((s, p, i) => s + p * weights[i], 0);
  const variance = positions.reduce((s, p, i) => s + weights[i] * (p - meanPos) ** 2, 0);

  return variance / 2;
}

function computePecletNumber(bins: BinReserves[], activeBin: number): number {
  const vals = bins.map((b) => b.totalUsd);
  const total = vals.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;

  const positions = bins.map((b) => b.binId - activeBin);
  const weights = vals.map((v) => v / total);

  const meanPos = positions.reduce((s, p, i) => s + p * weights[i], 0);
  const variance = positions.reduce((s, p, i) => s + weights[i] * (p - meanPos) ** 2, 0);
  const sigma = Math.sqrt(variance) || 1;

  const advectiveVelocity = Math.abs(meanPos);
  return (advectiveVelocity * bins.length) / (sigma * sigma || 1);
}

function computePenetrationDepth(
  bins: BinReserves[],
  activeBin: number
): { left: number; right: number; asymmetry: number } {
  const maxUsd = Math.max(...bins.map((b) => b.totalUsd)) || 1;
  const threshold = maxUsd * 0.05;

  let leftDepth = 0;
  let rightDepth = 0;

  for (const b of bins) {
    if (b.totalUsd >= threshold) {
      const offset = b.binId - activeBin;
      if (offset < 0) leftDepth = Math.max(leftDepth, Math.abs(offset));
      else rightDepth = Math.max(rightDepth, offset);
    }
  }

  const totalDepth = leftDepth + rightDepth || 1;
  const asymmetry = Math.abs(leftDepth - rightDepth) / totalDepth;

  return { left: leftDepth, right: rightDepth, asymmetry: round(asymmetry) };
}

function fitGaussian(bins: BinReserves[], activeBin: number): { r2: number; sigma: number; fitClass: string } {
  const vals = bins.map((b) => b.totalUsd);
  const total = vals.reduce((a, b) => a + b, 0);
  if (total === 0) return { r2: 0, sigma: 0, fitClass: "none" };

  const positions = bins.map((b) => b.binId - activeBin);
  const weights = vals.map((v) => v / total);

  const mu = positions.reduce((s, p, i) => s + p * weights[i], 0);
  const sigma = Math.sqrt(positions.reduce((s, p, i) => s + weights[i] * (p - mu) ** 2, 0)) || 1;

  const amplitude = Math.max(...vals);

  const predicted = positions.map((p) => amplitude * Math.exp(-0.5 * ((p - mu) / sigma) ** 2));

  const meanActual = vals.reduce((a, b) => a + b, 0) / vals.length;
  const ssTot = vals.reduce((s, v) => s + (v - meanActual) ** 2, 0);
  const ssRes = vals.reduce((s, v, i) => s + (v - predicted[i]) ** 2, 0);

  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  let fitClass: string;
  if (r2 > 0.9) fitClass = "excellent";
  else if (r2 > 0.7) fitClass = "good";
  else if (r2 > 0.4) fitClass = "moderate";
  else if (r2 > 0.1) fitClass = "poor";
  else fitClass = "none";

  return { r2: round(Math.max(0, r2)), sigma: round(sigma), fitClass };
}

function computeKurtosis(bins: BinReserves[], activeBin: number): { kurtosis: number; kurtosisClass: string } {
  const vals = bins.map((b) => b.totalUsd);
  const total = vals.reduce((a, b) => a + b, 0);
  if (total === 0) return { kurtosis: 0, kurtosisClass: "undefined" };

  const positions = bins.map((b) => b.binId - activeBin);
  const weights = vals.map((v) => v / total);

  const mu = positions.reduce((s, p, i) => s + p * weights[i], 0);
  const m2 = positions.reduce((s, p, i) => s + weights[i] * (p - mu) ** 2, 0);
  const m4 = positions.reduce((s, p, i) => s + weights[i] * (p - mu) ** 4, 0);

  const kurtosis = m2 > 0 ? m4 / (m2 * m2) - 3 : 0;

  let kurtosisClass: string;
  if (kurtosis > 2) kurtosisClass = "leptokurtic-extreme";
  else if (kurtosis > 0.5) kurtosisClass = "leptokurtic";
  else if (kurtosis > -0.5) kurtosisClass = "mesokurtic";
  else if (kurtosis > -2) kurtosisClass = "platykurtic";
  else kurtosisClass = "platykurtic-extreme";

  return { kurtosis: round(kurtosis), kurtosisClass };
}

function detectDiffusionFronts(bins: BinReserves[], activeBin: number): DiffusionFront[] {
  const fronts: DiffusionFront[] = [];
  const vals = bins.map((b) => b.totalUsd);
  const maxUsd = Math.max(...vals) || 1;

  for (let i = 1; i < bins.length - 1; i++) {
    const leftGrad = Math.abs(vals[i] - vals[i - 1]) / maxUsd;
    const rightGrad = Math.abs(vals[i + 1] - vals[i]) / maxUsd;

    if (leftGrad > 0.15 || rightGrad > 0.15) {
      const sharpness = Math.max(leftGrad, rightGrad);
      const offset = bins[i].binId - activeBin;
      if (sharpness > 0.2) {
        fronts.push({
          binId: bins[i].binId,
          offset,
          side: offset < 0 ? "left" : "right",
          sharpness: round(sharpness),
        });
      }
    }
  }

  return fronts
    .sort((a, b) => b.sharpness - a.sharpness)
    .slice(0, 10);
}

function detectSourcesSinks(bins: BinReserves[], activeBin: number): SourceSink[] {
  const results: SourceSink[] = [];
  const vals = bins.map((b) => b.totalUsd);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const maxDev = Math.max(...vals.map((v) => Math.abs(v - mean))) || 1;

  for (let i = 1; i < bins.length - 1; i++) {
    const dev = vals[i] - mean;
    const relDev = dev / maxDev;

    if (relDev > 0.5 && vals[i] > vals[i - 1] && vals[i] > vals[i + 1]) {
      results.push({
        binId: bins[i].binId,
        offset: bins[i].binId - activeBin,
        type: "source",
        intensity: round(relDev),
      });
    } else if (relDev < -0.3 && vals[i] < vals[i - 1] && vals[i] < vals[i + 1]) {
      results.push({
        binId: bins[i].binId,
        offset: bins[i].binId - activeBin,
        type: "sink",
        intensity: round(Math.abs(relDev)),
      });
    }
  }

  return results
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, 15);
}

function computeDiffusionIndex(
  gaussianR2: number,
  penetrationAsymmetry: number,
  pecletNumber: number,
  kurtosis: number,
  diffusionCoeff: number,
  binsAnalyzed: number
): number {
  const gaussianScore = gaussianR2 * 25;

  const spreadScore = Math.min(diffusionCoeff / (binsAnalyzed || 1), 1) * 20;

  const symmetryScore = (1 - penetrationAsymmetry) * 20;

  const diffusiveScore = pecletNumber < 10 ? (1 - pecletNumber / 10) * 20 : 0;

  const shapeScore = Math.abs(kurtosis) < 2 ? (1 - Math.abs(kurtosis) / 2) * 15 : 0;

  return Math.min(100, Math.max(0, gaussianScore + spreadScore + symmetryScore + diffusiveScore + shapeScore));
}

function classifyDiffusion(index: number): string {
  if (index < 15) return "concentrated";
  if (index < 30) return "limited";
  if (index < 50) return "partial";
  if (index < 70) return "well-diffused";
  return "fully-diffused";
}

function classifyPeclet(pe: number): string {
  if (pe < 1) return "diffusion-dominated";
  if (pe < 5) return "mixed";
  if (pe < 20) return "advection-leaning";
  return "advection-dominated";
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function analyzeDiffusion(bins: BinReserves[], activeBin: number, pool: AppPool): DiffusionProfile {
  const gradients = computeConcentrationGradients(bins, activeBin);
  const diffCoeff = computeDiffusionCoefficient(bins, activeBin);
  const peclet = computePecletNumber(bins, activeBin);
  const penetration = computePenetrationDepth(bins, activeBin);
  const gaussian = fitGaussian(bins, activeBin);
  const kurt = computeKurtosis(bins, activeBin);
  const fronts = detectDiffusionFronts(bins, activeBin);
  const sourcesSinks = detectSourcesSinks(bins, activeBin);

  const absGrads = gradients.map((g) => Math.abs(g.gradient));
  const maxGrad = absGrads.length > 0 ? Math.max(...absGrads) : 0;
  const avgGrad = absGrads.length > 0 ? absGrads.reduce((a, b) => a + b, 0) / absGrads.length : 0;

  const diffusionIndex = computeDiffusionIndex(
    gaussian.r2,
    penetration.asymmetry,
    peclet,
    kurt.kurtosis,
    diffCoeff,
    bins.length
  );

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId!,
    activeBin,
    binsAnalyzed: bins.length,
    diffusionIndex: Math.round(diffusionIndex),
    diffusionClass: classifyDiffusion(diffusionIndex),
    diffusionCoefficient: round(diffCoeff),
    pecletNumber: round(peclet),
    pecletClass: classifyPeclet(peclet),
    penetrationDepthLeft: penetration.left,
    penetrationDepthRight: penetration.right,
    penetrationAsymmetry: penetration.asymmetry,
    gaussianFitR2: gaussian.r2,
    gaussianFitClass: gaussian.fitClass,
    gaussianSigma: gaussian.sigma,
    kurtosis: kurt.kurtosis,
    kurtosisClass: kurt.kurtosisClass,
    maxGradient: round(maxGrad),
    avgGradient: round(avgGrad),
    gradientProfile: gradients.filter((g) => g.gradientClass !== "flat").slice(0, 15),
    diffusionFronts: fronts,
    sourcesSinks,
    tvlUsd: round(pool.tvlUsd),
    volume24hUsd: round(pool.volume24hUsd),
  };
}

function renderDiffusionMap(profile: DiffusionProfile, bins: BinReserves[]): string {
  const lines: string[] = [];
  lines.push(`\n=== DIFFUSION MAP: ${profile.pair} (pool ${profile.poolId}) ===`);
  lines.push(`Diffusion Index: ${profile.diffusionIndex}/100 (${profile.diffusionClass})`);
  lines.push(`D=${profile.diffusionCoefficient} | Pe=${profile.pecletNumber} (${profile.pecletClass})`);
  lines.push(`Gaussian fit: R²=${profile.gaussianFitR2} (${profile.gaussianFitClass}) | σ=${profile.gaussianSigma} bins`);
  lines.push(`Kurtosis: ${profile.kurtosis} (${profile.kurtosisClass})`);
  lines.push(`Penetration: L=${profile.penetrationDepthLeft} R=${profile.penetrationDepthRight} bins | asymmetry=${profile.penetrationAsymmetry}`);
  lines.push("");

  if (bins.length > 0) {
    const vals = bins.map((b) => b.totalUsd);
    const max = Math.max(...vals) || 1;
    const width = 40;
    lines.push("Concentration Profile (reserve density):");
    const step = Math.max(1, Math.floor(bins.length / 30));
    for (let i = 0; i < bins.length; i += step) {
      const b = bins[i];
      const barLen = Math.round((b.totalUsd / max) * width);
      const offset = b.binId - profile.activeBin;
      const marker = offset === 0 ? ">>>" : "   ";

      const frontHit = profile.diffusionFronts.find((f) => f.binId === b.binId);
      const ssHit = profile.sourcesSinks.find((s) => s.binId === b.binId);
      let tag = "";
      if (frontHit) tag = " [FRONT]";
      else if (ssHit) tag = ssHit.type === "source" ? " [SRC]" : " [SINK]";

      lines.push(`${marker} ${String(offset).padStart(4)} | ${"█".repeat(barLen)}${"░".repeat(width - barLen)}${tag}`);
    }
    lines.push("");
  }

  if (profile.diffusionFronts.length > 0) {
    lines.push("Diffusion Fronts:");
    for (const f of profile.diffusionFronts.slice(0, 5)) {
      lines.push(`  Bin ${f.binId} (${f.side}, offset ${f.offset > 0 ? "+" : ""}${f.offset}): sharpness=${f.sharpness}`);
    }
    lines.push("");
  }

  if (profile.sourcesSinks.length > 0) {
    lines.push("Sources & Sinks:");
    for (const s of profile.sourcesSinks.slice(0, 8)) {
      lines.push(`  Bin ${s.binId} (offset ${s.offset > 0 ? "+" : ""}${s.offset}): ${s.type.toUpperCase()} intensity=${s.intensity}`);
    }
    lines.push("");
  }

  if (profile.gradientProfile.length > 0) {
    lines.push("Steepest Concentration Gradients:");
    const sorted = [...profile.gradientProfile].sort((a, b) => Math.abs(b.gradient) - Math.abs(a.gradient));
    for (const g of sorted.slice(0, 5)) {
      lines.push(`  Bin ${g.binId} (offset ${g.offset > 0 ? "+" : ""}${g.offset}): dC/dx=${g.gradient} (${g.gradientClass})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function analyzePool(pool: AppPool): Promise<{ profile: DiffusionProfile; bins: BinReserves[] } | null> {
  try {
    const activeBin = pool.activeBinId ?? (await fetchActiveBin(pool.poolId!));
    const bins = await fetchBinReserves(pool.poolId!, activeBin, pool);
    if (bins.length < MIN_POPULATED_BINS) return null;
    const profile = analyzeDiffusion(bins, activeBin, pool);
    return { profile, bins };
  } catch {
    return null;
  }
}

const program = new Command();

program
  .name("hodlmm-bin-diffusion")
  .description("HODLMM bin liquidity diffusion analyzer — Fick's laws, concentration gradients, Peclet numbers");

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
  .description("Full diffusion analysis")
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

      const results: DiffusionProfile[] = [];
      let outputText = "";

      for (const pool of selected) {
        const result = await analyzePool(pool);
        if (result) {
          results.push(result.profile);
          outputText += renderDiffusionMap(result.profile, result.bins);
        }
      }

      const avgIndex = results.length > 0 ? results.reduce((s, r) => s + r.diffusionIndex, 0) / results.length : 0;

      console.log(
        JSON.stringify({
          result: "diffusion_analysis",
          data: {
            pools: results,
            summary: {
              poolsAnalyzed: results.length,
              avgDiffusionIndex: Math.round(avgIndex),
              fullyDiffused: results.filter((r) => r.diffusionIndex >= 70).length,
              wellDiffused: results.filter((r) => r.diffusionIndex >= 50).length,
              concentrated: results.filter((r) => r.diffusionIndex < 15).length,
              avgPeclet: round(results.reduce((s, r) => s + r.pecletNumber, 0) / (results.length || 1)),
              avgGaussianR2: round(results.reduce((s, r) => s + r.gaussianFitR2, 0) / (results.length || 1)),
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
  .description("Quick diffusion summary for top pools")
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
            diffusionIndex: result.profile.diffusionIndex,
            diffusionClass: result.profile.diffusionClass,
            pecletNumber: result.profile.pecletNumber,
            pecletClass: result.profile.pecletClass,
            gaussianR2: result.profile.gaussianFitR2,
            penetrationL: result.profile.penetrationDepthLeft,
            penetrationR: result.profile.penetrationDepthRight,
            sources: result.profile.sourcesSinks.filter((s) => s.type === "source").length,
            sinks: result.profile.sourcesSinks.filter((s) => s.type === "sink").length,
          });
        }
      }

      console.log(
        JSON.stringify({
          result: "diffusion_status",
          data: { pools: results, timestamp: new Date().toISOString() },
        })
      );
    } catch (e: any) {
      console.log(JSON.stringify({ error: e.message }));
    }
  });

program.parse();
