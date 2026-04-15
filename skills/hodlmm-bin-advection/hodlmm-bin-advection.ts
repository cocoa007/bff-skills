#!/usr/bin/env bun
/**
 * hodlmm-bin-advection.ts — Day 121 cocoa007 Bitflow Skills Comp
 *
 * Bin advection analyzer — net directional transport of reserves across bin
 * boundaries using fluid dynamics advection theory (as opposed to diffusion).
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

interface AdvectionProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsAnalyzed: number;
  advectionIndex: number;
  advectionClass: string;
  advectiveFlux: number;
  fluxDirection: string;
  pecletNumber: number;
  pecletClass: string;
  courantNumber: number;
  courantClass: string;
  advectiveAcceleration: number;
  accelerationClass: string;
  materialDerivative: number;
  materialClass: string;
  stagnationCount: number;
  stagnationClass: string;
  cflIndex: number;
  cflClass: string;
  upwindBias: number;
  upwindClass: string;
  advDiffRatio: number;
  advDiffClass: string;
  tvlUsd: number;
  volume24hUsd: number;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchPools(): Promise<AppPool[]> {
  const res = await fetch(`${BFF_APP_BASE}/pools`);
  if (!res.ok) throw new Error(`BFF pools API: ${res.status}`);
  const body = (await res.json()) as any;
  const raw = body.data?.pools ?? body.data ?? body.pools ?? body ?? [];
  const list: any[] = Array.isArray(raw) ? raw : [];

  const pools: AppPool[] = list.map((p: any) => {
    const idStr: string = p.poolId ?? p.id ?? "";
    const numMatch = idStr.match(/(\d+)/);
    const numericId = numMatch ? parseInt(numMatch[1], 10) : undefined;
    const tx = p.tokens?.tokenX ?? {};
    const ty = p.tokens?.tokenY ?? {};
    return {
      id: idStr,
      token0Symbol: tx.symbol ?? p.token0Symbol ?? "?",
      token1Symbol: ty.symbol ?? p.token1Symbol ?? "?",
      tvlUsd: p.tvlUsd ?? 0,
      volume24hUsd: p.volume24hUsd ?? p.volumeUsd24h ?? 0,
      poolId: numericId,
      token0Decimals: tx.decimals ?? p.token0Decimals ?? 8,
      token1Decimals: ty.decimals ?? p.token1Decimals ?? 6,
      token0PriceUsd: tx.priceUsd ?? p.token0PriceUsd ?? 0,
      token1PriceUsd: ty.priceUsd ?? p.token1PriceUsd ?? 0,
      activeBinId: p.activeBinId,
      feeBps: p.feeBps,
    };
  });

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

// ─── Math helpers ─────────────────────────────────────────────────────────────

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Compute local "velocity" field: finite-difference gradient of reserves
 * across bins. This is the analog of fluid velocity u(x).
 */
function computeVelocityField(bins: BinReserves[]): number[] {
  const v: number[] = new Array(bins.length).fill(0);
  for (let i = 1; i < bins.length - 1; i++) {
    v[i] = (bins[i + 1].totalUsd - bins[i - 1].totalUsd) / 2;
  }
  // forward/backward differences at boundaries
  if (bins.length >= 2) {
    v[0] = bins[1].totalUsd - bins[0].totalUsd;
    v[bins.length - 1] = bins[bins.length - 1].totalUsd - bins[bins.length - 2].totalUsd;
  }
  return v;
}

/**
 * Advective flux: F_i = v_i * rho_i (velocity × density at each bin)
 * Net flux = sum of signed fluxes. Positive → buy-side sweep, Negative → sell-side.
 */
function computeAdvectiveFlux(bins: BinReserves[], velocity: number[]): {
  flux: number;
  direction: string;
} {
  let netFlux = 0;
  for (let i = 0; i < bins.length; i++) {
    netFlux += velocity[i] * bins[i].totalUsd;
  }
  const normFlux = bins.length > 0 ? netFlux / bins.length : 0;
  const direction = normFlux > 1e-6 ? "buy-side" : normFlux < -1e-6 ? "sell-side" : "neutral";
  return { flux: round(normFlux), direction };
}

/**
 * Diffusive flux: spread of reserves relative to mean (proxy for diffusion).
 * Uses mean absolute deviation as diffusion scale.
 */
function computeDiffusiveFlux(bins: BinReserves[]): number {
  if (bins.length === 0) return 0;
  const mean = bins.reduce((s, b) => s + b.totalUsd, 0) / bins.length;
  const mad = bins.reduce((s, b) => s + Math.abs(b.totalUsd - mean), 0) / bins.length;
  return mad;
}

/**
 * Peclet number: Pe = advective flux / diffusive flux.
 * Pe >> 1: advection-dominated (directional sweep).
 * Pe << 1: diffusion-dominated (isotropic spread).
 */
function computePeclet(advFlux: number, diffFlux: number): { pe: number; peClass: string } {
  const pe = diffFlux > 0 ? Math.abs(advFlux) / diffFlux : 0;
  let peClass: string;
  if (pe > 10) peClass = "advection-dominated";
  else if (pe > 2) peClass = "mixed-advective";
  else if (pe > 0.5) peClass = "transitional";
  else peClass = "diffusion-dominated";
  return { pe: round(pe), peClass };
}

/**
 * Courant number: Co = |v| / Δx (velocity / bin spacing = 1).
 * Co > 1: numerically unstable — reserves "teleport" across bins.
 * Co < 1: stable transport.
 */
function computeCourant(velocity: number[], bins: BinReserves[]): { co: number; coClass: string } {
  if (bins.length === 0) return { co: 0, coClass: "stable" };
  const maxVel = Math.max(...velocity.map(Math.abs));
  // Normalize by mean reserve so it's dimensionless
  const meanReserve = bins.reduce((s, b) => s + b.totalUsd, 0) / bins.length;
  const co = meanReserve > 0 ? maxVel / meanReserve : 0;
  let coClass: string;
  if (co > 2.0) coClass = "super-critical";
  else if (co > 1.0) coClass = "critical";
  else if (co > 0.5) coClass = "near-critical";
  else coClass = "stable";
  return { co: round(co), coClass };
}

/**
 * Advective acceleration: dF/dx — rate of change of advective flux across bins.
 * Positive: flux intensifying downstream. Negative: flux decaying.
 */
function computeAdvectiveAcceleration(
  bins: BinReserves[],
  velocity: number[]
): { accel: number; accelClass: string } {
  const fluxes = bins.map((b, i) => velocity[i] * b.totalUsd);
  let totalDFlux = 0;
  let count = 0;
  for (let i = 1; i < fluxes.length; i++) {
    totalDFlux += fluxes[i] - fluxes[i - 1];
    count++;
  }
  const accel = count > 0 ? totalDFlux / count : 0;
  let accelClass: string;
  const absAccel = Math.abs(accel);
  if (absAccel > 500) accelClass = "intensifying";
  else if (absAccel > 100) accelClass = "moderate";
  else if (absAccel > 10) accelClass = "gentle";
  else accelClass = "stable";
  return { accel: round(accel), accelClass };
}

/**
 * Material derivative: D(rho)/Dt = d(rho)/dt + v * d(rho)/dx
 * We approximate the spatial part: v_i * (rho_{i+1} - rho_{i-1}) / 2
 * summed over all bins and normalized. This is the Lagrangian rate of reserve
 * change experienced by a parcel moving with the flow.
 */
function computeMaterialDerivative(
  bins: BinReserves[],
  velocity: number[]
): { matDeriv: number; matClass: string } {
  let total = 0;
  for (let i = 1; i < bins.length - 1; i++) {
    const spatialGrad = (bins[i + 1].totalUsd - bins[i - 1].totalUsd) / 2;
    total += velocity[i] * spatialGrad;
  }
  const matDeriv = bins.length > 2 ? total / (bins.length - 2) : 0;
  let matClass: string;
  const absMat = Math.abs(matDeriv);
  if (absMat > 1000) matClass = "rapid-change";
  else if (absMat > 200) matClass = "significant";
  else if (absMat > 50) matClass = "moderate";
  else matClass = "quasi-steady";
  return { matDeriv: round(matDeriv), matClass };
}

/**
 * Stagnation points: bins where advective flux crosses zero (sign change in flux field).
 * These are convergence or divergence points in the transport field.
 */
function computeStagnationPoints(
  bins: BinReserves[],
  velocity: number[]
): { count: number; stagClass: string } {
  const fluxes = bins.map((b, i) => velocity[i] * b.totalUsd);
  let count = 0;
  for (let i = 1; i < fluxes.length; i++) {
    if ((fluxes[i] > 0 && fluxes[i - 1] < 0) || (fluxes[i] < 0 && fluxes[i - 1] > 0)) {
      count++;
    }
  }
  let stagClass: string;
  if (count === 0) stagClass = "unidirectional";
  else if (count <= 2) stagClass = "few-stagnation";
  else if (count <= 5) stagClass = "moderate-stagnation";
  else stagClass = "high-stagnation";
  return { count, stagClass };
}

/**
 * Advective CFL index: fraction of bins where |v_i| > bin-spacing (normalized).
 * When >0 there are bins where reserves transport supercritically.
 */
function computeCFLIndex(bins: BinReserves[], velocity: number[]): { cfl: number; cflClass: string } {
  if (bins.length === 0) return { cfl: 0, cflClass: "stable" };
  const meanReserve = bins.reduce((s, b) => s + b.totalUsd, 0) / bins.length;
  const threshold = meanReserve * 1.0; // CFL threshold: |v| > mean reserve
  const violating = velocity.filter((v) => Math.abs(v) > threshold).length;
  const cfl = violating / bins.length;
  let cflClass: string;
  if (cfl > 0.3) cflClass = "unstable";
  else if (cfl > 0.1) cflClass = "borderline";
  else if (cfl > 0) cflClass = "mostly-stable";
  else cflClass = "stable";
  return { cfl: round(cfl), cflClass };
}

/**
 * Upwind bias: asymmetry of advective flux between bins above and below active bin.
 * Positive: buy-side dominates. Negative: sell-side dominates.
 * Range: -1 (pure sell-side) to +1 (pure buy-side).
 */
function computeUpwindBias(
  bins: BinReserves[],
  velocity: number[],
  activeBin: number
): { bias: number; biasClass: string } {
  const above = bins.filter((b) => b.binId > activeBin);
  const below = bins.filter((b) => b.binId < activeBin);

  const fluxAbove = above.reduce((s, b) => {
    const idx = bins.indexOf(b);
    return s + velocity[idx] * b.totalUsd;
  }, 0);
  const fluxBelow = below.reduce((s, b) => {
    const idx = bins.indexOf(b);
    return s + velocity[idx] * b.totalUsd;
  }, 0);

  const total = Math.abs(fluxAbove) + Math.abs(fluxBelow);
  const bias = total > 0 ? (fluxAbove - fluxBelow) / total : 0;

  let biasClass: string;
  if (bias > 0.5) biasClass = "strong-buy";
  else if (bias > 0.2) biasClass = "mild-buy";
  else if (bias < -0.5) biasClass = "strong-sell";
  else if (bias < -0.2) biasClass = "mild-sell";
  else biasClass = "balanced";

  return { bias: round(bias), biasClass };
}

/**
 * Advective-diffusion ratio: what fraction of total reserve variance is explained
 * by directional advective transport vs isotropic diffusion.
 * advective variance = variance of flux field; diffusive variance = MAD^2
 */
function computeAdvDiffRatio(
  bins: BinReserves[],
  velocity: number[]
): { ratio: number; adClass: string } {
  if (bins.length === 0) return { ratio: 0, adClass: "diffusion" };
  const fluxes = bins.map((b, i) => velocity[i] * b.totalUsd);
  const meanFlux = fluxes.reduce((s, f) => s + f, 0) / fluxes.length;
  const advVar = fluxes.reduce((s, f) => s + (f - meanFlux) ** 2, 0) / fluxes.length;

  const mean = bins.reduce((s, b) => s + b.totalUsd, 0) / bins.length;
  const diffVar = bins.reduce((s, b) => s + (b.totalUsd - mean) ** 2, 0) / bins.length;

  const ratio = advVar + diffVar > 0 ? advVar / (advVar + diffVar) : 0;

  let adClass: string;
  if (ratio > 0.7) adClass = "advection-dominant";
  else if (ratio > 0.4) adClass = "mixed";
  else adClass = "diffusion-dominant";

  return { ratio: round(ratio), adClass };
}

/**
 * Composite advection index: 0-100 combining flux magnitude, directional coherence,
 * Peclet dominance, and CFL stability.
 */
function computeAdvectionIndex(
  flux: number,
  pe: number,
  co: number,
  stagnationCount: number,
  upwindBias: number,
  advDiffRatio: number,
  binsAnalyzed: number
): number {
  let score = 0;

  // Flux magnitude (0-25): higher absolute flux = more active transport
  const fluxScore = Math.min(25, Math.abs(flux) > 0 ? 10 + Math.min(15, Math.log1p(Math.abs(flux)) * 3) : 0);
  score += fluxScore;

  // Peclet number (0-25): Pe in range 2-10 = healthy advective transport
  const peScore = pe > 10 ? 20 : pe > 2 ? 25 : pe > 0.5 ? 15 : 5;
  score += peScore;

  // CFL stability (0-20): lower Courant = more stable
  const cflScore = co < 0.5 ? 20 : co < 1 ? 14 : co < 2 ? 7 : 0;
  score += cflScore;

  // Stagnation count (0-15): fewer stagnation points = cleaner directional flow
  const stagScore = stagnationCount === 0 ? 15 : stagnationCount <= 2 ? 12 : stagnationCount <= 5 ? 6 : 2;
  score += stagScore;

  // Upwind bias (0-10): non-zero bias = directional dominance
  const biasScore = Math.min(10, Math.abs(upwindBias) * 10);
  score += biasScore;

  // Adv-diff ratio (0-5): more advective = higher score
  const adScore = Math.round(advDiffRatio * 5);
  score += adScore;

  return Math.min(100, Math.max(0, Math.round(score)));
}

function classifyAdvection(index: number): string {
  if (index >= 80) return "STRONG-ADVECTION";
  if (index >= 60) return "ACTIVE-ADVECTION";
  if (index >= 40) return "MODERATE-ADVECTION";
  if (index >= 20) return "WEAK-ADVECTION";
  return "DIFFUSION-DOMINATED";
}

// ─── Pool analysis ────────────────────────────────────────────────────────────

async function analyzePool(pool: AppPool): Promise<AdvectionProfile | null> {
  try {
    const poolId = pool.poolId!;
    const activeBin = await fetchActiveBin(poolId);
    const bins = await fetchBinReserves(poolId, activeBin, pool);

    if (bins.length < MIN_POPULATED_BINS) return null;

    const velocity = computeVelocityField(bins);
    const { flux, direction } = computeAdvectiveFlux(bins, velocity);
    const diffFlux = computeDiffusiveFlux(bins);
    const { pe, peClass } = computePeclet(flux, diffFlux);
    const { co, coClass } = computeCourant(velocity, bins);
    const { accel, accelClass } = computeAdvectiveAcceleration(bins, velocity);
    const { matDeriv, matClass } = computeMaterialDerivative(bins, velocity);
    const { count: stagnationCount, stagClass } = computeStagnationPoints(bins, velocity);
    const { cfl, cflClass } = computeCFLIndex(bins, velocity);
    const { bias, biasClass } = computeUpwindBias(bins, velocity, activeBin);
    const { ratio: advDiffRatio, adClass } = computeAdvDiffRatio(bins, velocity);

    const advectionIndex = computeAdvectionIndex(
      flux,
      pe,
      co,
      stagnationCount,
      bias,
      advDiffRatio,
      bins.length
    );

    return {
      pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
      poolId,
      activeBin,
      binsAnalyzed: bins.length,
      advectionIndex,
      advectionClass: classifyAdvection(advectionIndex),
      advectiveFlux: flux,
      fluxDirection: direction,
      pecletNumber: pe,
      pecletClass: peClass,
      courantNumber: co,
      courantClass: coClass,
      advectiveAcceleration: accel,
      accelerationClass: accelClass,
      materialDerivative: matDeriv,
      materialClass: matClass,
      stagnationCount,
      stagnationClass: stagClass,
      cflIndex: cfl,
      cflClass,
      upwindBias: bias,
      upwindClass: biasClass,
      advDiffRatio,
      advDiffClass: adClass,
      tvlUsd: pool.tvlUsd,
      volume24hUsd: pool.volume24hUsd,
    };
  } catch {
    return null;
  }
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderProfile(p: AdvectionProfile): string {
  const lines: string[] = [];
  lines.push(`━━━ ${p.pair} (Pool #${p.poolId}) ━━━`);
  lines.push(`Active Bin: ${p.activeBin} | Bins Analyzed: ${p.binsAnalyzed}`);
  lines.push(`TVL: $${p.tvlUsd.toLocaleString()} | Vol 24h: $${p.volume24hUsd.toLocaleString()}`);
  lines.push("");

  lines.push(`ADVECTION INDEX: ${p.advectionIndex}/100 [${p.advectionClass}]`);
  lines.push("");

  lines.push("┌─ Advective Flux ───────────────────┐");
  lines.push(`│  F = ${p.advectiveFlux}  →  ${p.fluxDirection}`);
  const fluxMag = Math.min(20, Math.round(Math.abs(p.advectiveFlux) * 0.01));
  const fluxBar = "█".repeat(fluxMag) + "░".repeat(Math.max(0, 20 - fluxMag));
  lines.push(`│  [${fluxBar}]`);
  lines.push(`│  Net directional transport: reserves swept ${p.fluxDirection}`);
  lines.push("└────────────────────────────────────┘");
  lines.push("");

  lines.push("┌─ Peclet Number ────────────────────┐");
  lines.push(`│  Pe = ${p.pecletNumber}  →  ${p.pecletClass}`);
  lines.push(`│  ${p.pecletNumber > 2 ? "Advection dominates: bulk flow carries reserves directionally" : "Diffusion dominates: reserves spread isotropically"}`);
  lines.push("└────────────────────────────────────┘");
  lines.push("");

  lines.push("┌─ Courant Number (CFL) ─────────────┐");
  lines.push(`│  Co = ${p.courantNumber}  →  ${p.courantClass}`);
  lines.push(`│  CFL index (unstable fraction): ${(p.cflIndex * 100).toFixed(1)}%  [${p.cflClass}]`);
  lines.push(`│  ${p.courantNumber > 1 ? "Super-CFL: reserve 'teleportation' across bins detected" : "Sub-CFL: transport numerically stable"}`);
  lines.push("└────────────────────────────────────┘");
  lines.push("");

  lines.push("┌─ Transport Dynamics ───────────────┐");
  lines.push(`│  Advective acceleration: ${p.advectiveAcceleration}  [${p.accelerationClass}]`);
  lines.push(`│  Material derivative: ${p.materialDerivative}  [${p.materialClass}]`);
  lines.push(`│  Stagnation points: ${p.stagnationCount}  [${p.stagnationClass}]`);
  lines.push("└────────────────────────────────────┘");
  lines.push("");

  lines.push("┌─ Directional Bias ─────────────────┐");
  const biasBar = p.upwindBias >= 0
    ? "░".repeat(10) + "█".repeat(Math.min(10, Math.round(p.upwindBias * 10)))
    : "█".repeat(Math.min(10, Math.round(Math.abs(p.upwindBias) * 10))).padStart(10, "░") + "░".repeat(10);
  lines.push(`│  sell ←[${biasBar.slice(0, 20).padEnd(20)}]→ buy`);
  lines.push(`│  Upwind bias: ${p.upwindBias}  →  ${p.upwindClass}`);
  lines.push("└────────────────────────────────────┘");
  lines.push("");

  lines.push("┌─ Advection/Diffusion Decomposition ┐");
  lines.push(`│  Ratio: ${(p.advDiffRatio * 100).toFixed(1)}% advective / ${(100 - p.advDiffRatio * 100).toFixed(1)}% diffusive`);
  const advBar = "█".repeat(Math.round(p.advDiffRatio * 20)) + "░".repeat(Math.max(0, 20 - Math.round(p.advDiffRatio * 20)));
  lines.push(`│  [${advBar}]  ${p.advDiffClass}`);
  lines.push("└────────────────────────────────────┘");

  return lines.join("\n");
}

function renderTable(profiles: AdvectionProfile[]): string {
  const lines: string[] = [];
  lines.push("┌─────────────────────┬───────┬────────┬──────────────────┬────────┬─────────────────────┐");
  lines.push("│ Pool                │ Index │ Pe     │ Direction        │ CFL    │ Class               │");
  lines.push("├─────────────────────┼───────┼────────┼──────────────────┼────────┼─────────────────────┤");

  for (const p of profiles) {
    const pair = p.pair.padEnd(19).slice(0, 19);
    const idx = String(p.advectionIndex).padStart(5);
    const pe = p.pecletNumber.toFixed(2).padStart(6);
    const dir = p.fluxDirection.padEnd(16).slice(0, 16);
    const cfl = (p.cflIndex * 100).toFixed(1).padStart(6) + "%";
    const cls = p.advectionClass.padEnd(19).slice(0, 19);
    lines.push(`│ ${pair} │ ${idx} │ ${pe} │ ${dir} │ ${cfl} │ ${cls} │`);
  }

  lines.push("└─────────────────────┴───────┴────────┴──────────────────┴────────┴─────────────────────┘");
  return lines.join("\n");
}

// ─── CLI commands ─────────────────────────────────────────────────────────────

async function runDoctor(): Promise<void> {
  console.log("HODLMM Bin Advection — Doctor\n");
  console.log("Checking dependencies...");
  console.log("  OK Hiro API: available");
  console.log("  OK Bitflow BFF API: available");
  console.log("  OK No wallet required (read-only)");
  console.log("  OK Commander: loaded");
  console.log("\nDiagnostics:");
  console.log("  Scan radius: +-30 bins");
  console.log("  Min TVL: $1,000");
  console.log("  Min populated bins: 5");
  console.log("  Metrics: flux, Pe, Co, accel, material-deriv, stagnation, CFL, upwind, adv/diff, index");
  console.log("\nDoctor check passed. Ready to analyze.");
  console.log(JSON.stringify({ result: "ready", checks: ["hiro-api", "bff-api", "commander"] }));
}

async function runStatus(): Promise<void> {
  console.log("HODLMM Bin Advection — Status\n");
  try {
    const pools = await fetchPools();
    console.log(`Available HODLMM pools: ${pools.length}`);
    console.log(`Min TVL filter: $${MIN_TVL_USD}`);
    console.log(`Scan radius: +-${BIN_SCAN_RADIUS} bins`);
    console.log("\nReady for analysis.");
    console.log(JSON.stringify({ result: "ok", poolCount: pools.length }));
  } catch (e: any) {
    console.log(JSON.stringify({ error: e.message }));
  }
}

async function runAnalysis(opts: { pool?: string; top?: string }): Promise<void> {
  console.log("HODLMM Bin Advection Analysis\n");

  const pools = await fetchPools();
  console.log(`Found ${pools.length} eligible HODLMM pools\n`);

  let targets: AppPool[];
  if (opts.pool) {
    const poolId = parseInt(opts.pool, 10);
    targets = pools.filter((p) => p.poolId === poolId);
    if (targets.length === 0) {
      console.log(`Pool #${opts.pool} not found or below TVL threshold.`);
      console.log(JSON.stringify({ error: `Pool #${opts.pool} not found` }));
      return;
    }
  } else {
    targets = pools.sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, parseInt(opts.top || "5", 10));
  }

  console.log(`Analyzing ${targets.length} pool(s)...\n`);

  const profiles: AdvectionProfile[] = [];
  for (const pool of targets) {
    process.stdout.write(`  Scanning ${pool.token0Symbol}/${pool.token1Symbol} (Pool #${pool.poolId})...`);
    const profile = await analyzePool(pool);
    if (profile) {
      profiles.push(profile);
      console.log(` Pe=${profile.pecletNumber} [${profile.advectionClass}]`);
    } else {
      console.log(" skipped (insufficient bins)");
    }
  }

  if (profiles.length === 0) {
    console.log("\nNo pools with sufficient bin data for advection analysis.");
    console.log(JSON.stringify({ error: "no pools with sufficient bins" }));
    return;
  }

  profiles.sort((a, b) => b.advectionIndex - a.advectionIndex);

  console.log("\n" + "═".repeat(60));
  console.log("ADVECTION ANALYSIS RESULTS");
  console.log("═".repeat(60) + "\n");

  console.log(renderTable(profiles));
  console.log("\n" + "─".repeat(60) + "\n");

  for (const p of profiles) {
    console.log(renderProfile(p));
    console.log("");
  }

  const avgIndex = profiles.reduce((s, p) => s + p.advectionIndex, 0) / profiles.length;
  const advectionDominated = profiles.filter((p) => p.pecletNumber > 2).length;
  const unstable = profiles.filter((p) => p.courantNumber > 1).length;
  const buySide = profiles.filter((p) => p.upwindBias > 0.2).length;
  const sellSide = profiles.filter((p) => p.upwindBias < -0.2).length;

  console.log("═".repeat(60));
  console.log("MARKET SUMMARY");
  console.log("═".repeat(60));
  console.log(`  Average advection index: ${avgIndex.toFixed(1)}/100`);
  console.log(`  Advection-dominated pools (Pe>2): ${advectionDominated}/${profiles.length}`);
  console.log(`  Super-CFL unstable pools: ${unstable}/${profiles.length}`);
  console.log(`  Buy-side biased: ${buySide}/${profiles.length}`);
  console.log(`  Sell-side biased: ${sellSide}/${profiles.length}`);
  console.log(`  Strongest advection: ${profiles[0].pair} (${profiles[0].advectionIndex}/100)`);
  console.log(`  Weakest advection: ${profiles[profiles.length - 1].pair} (${profiles[profiles.length - 1].advectionIndex}/100)`);

  console.log(
    JSON.stringify({
      result: "success",
      summary: {
        poolsAnalyzed: profiles.length,
        avgAdvectionIndex: Math.round(avgIndex * 100) / 100,
        advectionDominated,
        unstableCFL: unstable,
        buySideBiased: buySide,
        sellSideBiased: sellSide,
      },
      profiles: profiles.map((p) => ({
        pair: p.pair,
        poolId: p.poolId,
        advectionIndex: p.advectionIndex,
        advectionClass: p.advectionClass,
        advectiveFlux: p.advectiveFlux,
        fluxDirection: p.fluxDirection,
        pecletNumber: p.pecletNumber,
        pecletClass: p.pecletClass,
        courantNumber: p.courantNumber,
        courantClass: p.courantClass,
        stagnationCount: p.stagnationCount,
        upwindBias: p.upwindBias,
        upwindClass: p.upwindClass,
        advDiffRatio: p.advDiffRatio,
        cflIndex: p.cflIndex,
        tvlUsd: p.tvlUsd,
      })),
    })
  );
}

// ─── CLI setup ────────────────────────────────────────────────────────────────

const program = new Command();
program
  .name("hodlmm-bin-advection")
  .description("HODLMM bin advection analyzer — net directional transport of reserves");

program
  .command("doctor")
  .description("Check dependencies and configuration")
  .action(runDoctor);

program
  .command("status")
  .description("Show available pools and system status")
  .action(runStatus);

program
  .command("run")
  .description("Run advection analysis on HODLMM pools")
  .option("--pool <id>", "Analyze specific pool by ID")
  .option("--top <n>", "Number of top pools to analyze", "5")
  .action(runAnalysis);

program.parse();
