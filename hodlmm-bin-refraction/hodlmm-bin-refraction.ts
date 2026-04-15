#!/usr/bin/env bun
/**
 * hodlmm-bin-refraction.ts — Day 122 cocoa007 Bitflow Skills Comp
 *
 * Bin refraction analyzer — models reserve density as an optical medium where
 * each bin has a refractive index proportional to its density. Applies Snell's
 * law, critical angle analysis, TIR detection, Brewster angle computation, and
 * dispersion analysis across trade-size wavelengths.
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

// Dispersion wavelengths: small, medium, large trade sizes as fraction of mean bin reserve
const WAVELENGTHS = [0.01, 0.1, 1.0];
const WAVELENGTH_LABELS = ["small", "medium", "large"];

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

interface BoundaryMetrics {
  binIdLeft: number;
  binIdRight: number;
  n1: number;
  n2: number;
  snellRatio: number;
  criticalAngleDeg: number | null;
  brewsterAngleDeg: number;
  isTIR: boolean;
}

interface RefractionProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsAnalyzed: number;
  refractionIndex: number;
  refractionClass: string;
  meanRefractiveIndex: number;
  maxRefractiveIndex: number;
  minRefractiveIndex: number;
  refractiveStdDev: number;
  snellDeviationMean: number;
  snellDeviationMax: number;
  criticalAngleCount: number;
  criticalAngleMeanDeg: number;
  tirZoneCount: number;
  tirZoneBins: number[];
  brewsterOptimalBin: number;
  brewsterMinAngleDeg: number;
  dispersion: number;
  dispersionClass: string;
  dispersionByWavelength: { label: string; effectiveN: number }[];
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

  return pools.filter(
    (p: AppPool) => (p.tvlUsd ?? 0) >= MIN_TVL_USD && p.poolId != null
  );
}

async function fetchActiveBin(poolId: number): Promise<number> {
  const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-active-bin`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: SENDER,
      arguments: [
        `0x0100000000000000000000000000000${poolId
          .toString(16)
          .padStart(3, "0")}`,
      ],
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
                `0x0100000000000000000000000000000${poolId
                  .toString(16)
                  .padStart(3, "0")}`,
                `0x01000000000000000000000000${binId
                  .toString(16)
                  .padStart(8, "0")}`,
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
            const numEntries = parseInt(
              tupleHex.slice(offset, offset + 2),
              16
            );
            offset += 2;
            for (let e = 0; e < numEntries; e++) {
              const nameLen = parseInt(
                tupleHex.slice(offset, offset + 2),
                16
              );
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

function round(n: number, decimals = 4): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

// ─── Refractive index computation ─────────────────────────────────────────────

/**
 * Compute the refractive index for each bin. n_i = density_i / mean_density.
 * Bins with n > 1 are denser than average (optically thick — flow slows).
 * Bins with n < 1 are sparser (optically thin — flow speeds through).
 * Minimum n is clamped to 0.01 to avoid division-by-zero in Snell computations.
 */
function computeRefractiveIndices(bins: BinReserves[]): number[] {
  const densities = bins.map((b) => b.totalUsd);
  const meanDensity = mean(densities);
  if (meanDensity <= 0) return bins.map(() => 1.0);
  return densities.map((d) => Math.max(d / meanDensity, 0.01));
}

/**
 * Compute wavelength-dependent refractive index. Smaller "wavelengths"
 * (trade sizes) interact more with density variations (Cauchy dispersion model):
 *   n_eff(lambda) = n_base + B / lambda^2
 * where B is proportional to local density variance.
 */
function computeDispersedRefractiveIndex(
  bins: BinReserves[],
  baseIndices: number[],
  wavelength: number
): number[] {
  const densities = bins.map((b) => b.totalUsd);
  const meanD = mean(densities);
  if (meanD <= 0) return baseIndices.slice();

  // Local density variance (rolling window of 3 bins) as dispersion coefficient
  return baseIndices.map((n, i) => {
    const lo = Math.max(0, i - 1);
    const hi = Math.min(bins.length - 1, i + 1);
    const localVals = [];
    for (let k = lo; k <= hi; k++) localVals.push(densities[k]);
    const localVar = stdDev(localVals) / (meanD || 1);
    // Cauchy-like dispersion: stronger refraction for smaller wavelength
    const B = localVar * 0.1;
    return Math.max(n + B / (wavelength * wavelength), 0.01);
  });
}

// ─── Boundary analysis (Snell, critical angle, Brewster, TIR) ─────────────────

/**
 * Analyze every adjacent bin boundary using Snell's law.
 * For each boundary between bin i and bin i+1:
 *   - Snell ratio = n1 / n2
 *   - Critical angle = arcsin(n2/n1) when n2 < n1 (total internal reflection threshold)
 *   - Brewster angle = arctan(n2/n1) (zero reflection, maximum transmission)
 *   - TIR = true if n2/n1 < 0.3 (density drop > 70%, flow cannot escape at most angles)
 */
function analyzeBoundaries(
  bins: BinReserves[],
  refractiveIndices: number[]
): BoundaryMetrics[] {
  const boundaries: BoundaryMetrics[] = [];
  for (let i = 0; i < bins.length - 1; i++) {
    const n1 = refractiveIndices[i];
    const n2 = refractiveIndices[i + 1];
    const snellRatio = n2 > 0 ? n1 / n2 : Infinity;

    // Critical angle: exists only when going from denser to sparser medium (n1 > n2)
    let criticalAngleDeg: number | null = null;
    if (n1 > n2) {
      const sinCrit = n2 / n1;
      criticalAngleDeg = round(radToDeg(Math.asin(Math.min(sinCrit, 1.0))), 2);
    }

    // Brewster angle: always defined, arctan(n2/n1)
    const brewsterAngleDeg = round(radToDeg(Math.atan(n2 / n1)), 2);

    // TIR detection: when density ratio is extreme, nearly all flow reflects
    // The TIR condition is when the ratio n2/n1 is very small, meaning
    // even shallow-angle flow exceeds the critical angle
    const isTIR = n1 > n2 && n2 / n1 < 0.3;

    boundaries.push({
      binIdLeft: bins[i].binId,
      binIdRight: bins[i + 1].binId,
      n1: round(n1),
      n2: round(n2),
      snellRatio: round(snellRatio),
      criticalAngleDeg,
      brewsterAngleDeg,
      isTIR,
    });
  }
  return boundaries;
}

// ─── Dispersion analysis ──────────────────────────────────────────────────────

/**
 * Compute dispersion: how much the effective refractive index varies across
 * different trade-size wavelengths. High dispersion means small and large
 * trades experience fundamentally different pool dynamics (like a prism
 * splitting white light into a spectrum).
 *
 * Returns dispersion magnitude (std dev of mean n across wavelengths) and
 * per-wavelength effective n.
 */
function computeDispersion(
  bins: BinReserves[],
  baseIndices: number[]
): { dispersion: number; byWavelength: { label: string; effectiveN: number }[] } {
  const results: { label: string; effectiveN: number }[] = [];
  const meanNs: number[] = [];

  for (let w = 0; w < WAVELENGTHS.length; w++) {
    const dispersedN = computeDispersedRefractiveIndex(
      bins,
      baseIndices,
      WAVELENGTHS[w]
    );
    const avgN = mean(dispersedN);
    results.push({ label: WAVELENGTH_LABELS[w], effectiveN: round(avgN) });
    meanNs.push(avgN);
  }

  // Dispersion = spread of effective refractive index across wavelengths
  const dispersion = round(stdDev(meanNs), 4);
  return { dispersion, byWavelength: results };
}

// ─── Composite refraction index ───────────────────────────────────────────────

/**
 * Composite refraction index (0-100) combining:
 *   - TIR zone fraction (0-25): more TIR zones = higher score
 *   - Snell deviation (0-25): higher mean |snellRatio - 1| = more heterogeneous
 *   - Dispersion (0-25): higher dispersion = more trade-size dependent
 *   - Critical angle density (0-25): more boundaries near TIR = more constrained
 */
function computeRefractionIndex(
  boundaries: BoundaryMetrics[],
  dispersion: number,
  numBins: number
): number {
  if (boundaries.length === 0) return 0;

  // TIR zone fraction (0-25)
  const tirCount = boundaries.filter((b) => b.isTIR).length;
  const tirFraction = tirCount / boundaries.length;
  const tirScore = Math.min(tirFraction * 100, 25);

  // Snell deviation from unity (0-25)
  const snellDevs = boundaries.map((b) =>
    Math.abs(b.snellRatio === Infinity ? 10 : b.snellRatio - 1)
  );
  const meanSnellDev = mean(snellDevs);
  const snellScore = Math.min(meanSnellDev * 25, 25);

  // Dispersion (0-25) — normalized: dispersion > 1 is extreme
  const dispScore = Math.min(dispersion * 50, 25);

  // Critical angle density (0-25) — fraction of boundaries with critical angles
  const critCount = boundaries.filter((b) => b.criticalAngleDeg !== null).length;
  const critFraction = critCount / boundaries.length;
  // Weight by how low the critical angles are (lower = closer to TIR)
  const critAngles = boundaries
    .filter((b) => b.criticalAngleDeg !== null)
    .map((b) => b.criticalAngleDeg!);
  const meanCritAngle = critAngles.length > 0 ? mean(critAngles) : 90;
  // Lower mean critical angle = more constrained = higher score
  const critScore = Math.min(critFraction * (1 - meanCritAngle / 90) * 100, 25);

  return Math.round(
    Math.min(tirScore + snellScore + dispScore + Math.max(critScore, 0), 100)
  );
}

function classifyRefraction(index: number, tirCount: number, dispersion: number): string {
  if (tirCount >= 3 || index >= 75) return "TOTAL-REFLECTION";
  if (dispersion > 0.3 || (index >= 40 && dispersion > 0.15)) return "PRISMATIC";
  if (index >= 25) return "REFRACTIVE";
  return "TRANSPARENT";
}

function classifyDispersion(dispersion: number): string {
  if (dispersion > 0.5) return "extreme";
  if (dispersion > 0.2) return "high";
  if (dispersion > 0.05) return "moderate";
  return "low";
}

// ─── Core analysis ────────────────────────────────────────────────────────────

function analyzeRefraction(
  bins: BinReserves[],
  activeBin: number,
  pool: AppPool
): RefractionProfile {
  const pair = `${pool.token0Symbol}/${pool.token1Symbol}`;
  const poolId = pool.poolId!;

  // 1. Compute base refractive indices
  const refractiveIndices = computeRefractiveIndices(bins);
  const meanN = round(mean(refractiveIndices));
  const maxN = round(Math.max(...refractiveIndices));
  const minN = round(Math.min(...refractiveIndices));
  const nStdDev = round(stdDev(refractiveIndices));

  // 2. Analyze all bin boundaries
  const boundaries = analyzeBoundaries(bins, refractiveIndices);

  // Snell deviation stats
  const snellDevs = boundaries.map((b) =>
    Math.abs(b.snellRatio === Infinity ? 10 : b.snellRatio - 1)
  );
  const snellDevMean = round(mean(snellDevs));
  const snellDevMax = round(Math.max(...snellDevs, 0));

  // Critical angle stats
  const critBoundaries = boundaries.filter((b) => b.criticalAngleDeg !== null);
  const critAngles = critBoundaries.map((b) => b.criticalAngleDeg!);
  const critMeanDeg = critAngles.length > 0 ? round(mean(critAngles), 2) : 0;

  // TIR zones
  const tirBoundaries = boundaries.filter((b) => b.isTIR);
  const tirBins = [...new Set(tirBoundaries.flatMap((b) => [b.binIdLeft, b.binIdRight]))];

  // Brewster optimal: boundary with angle closest to 45 deg (maximum transmission)
  let brewsterOptBin = activeBin;
  let brewsterMinAngle = 90;
  for (const b of boundaries) {
    const dist = Math.abs(b.brewsterAngleDeg - 45);
    if (dist < Math.abs(brewsterMinAngle - 45)) {
      brewsterMinAngle = b.brewsterAngleDeg;
      brewsterOptBin = b.binIdRight; // entry point is the bin you'd move into
    }
  }

  // 3. Dispersion analysis
  const { dispersion, byWavelength } = computeDispersion(bins, refractiveIndices);

  // 4. Composite index and classification
  const refractionIndex = computeRefractionIndex(boundaries, dispersion, bins.length);
  const refractionClass = classifyRefraction(
    refractionIndex,
    tirBoundaries.length,
    dispersion
  );

  return {
    pair,
    poolId,
    activeBin,
    binsAnalyzed: bins.length,
    refractionIndex,
    refractionClass,
    meanRefractiveIndex: meanN,
    maxRefractiveIndex: maxN,
    minRefractiveIndex: minN,
    refractiveStdDev: nStdDev,
    snellDeviationMean: snellDevMean,
    snellDeviationMax: snellDevMax,
    criticalAngleCount: critBoundaries.length,
    criticalAngleMeanDeg: critMeanDeg,
    tirZoneCount: tirBoundaries.length,
    tirZoneBins: tirBins.slice(0, 10), // cap for output readability
    brewsterOptimalBin: brewsterOptBin,
    brewsterMinAngleDeg: round(brewsterMinAngle, 2),
    dispersion,
    dispersionClass: classifyDispersion(dispersion),
    dispersionByWavelength: byWavelength,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const program = new Command();
program
  .name("hodlmm-bin-refraction")
  .description("HODLMM bin refraction analyzer — Day 122 cocoa007")
  .version("1.0.0");

// ── doctor ────────────────────────────────────────────────────────────────────

program
  .command("doctor")
  .description("Check API connectivity and environment")
  .action(async () => {
    const checks: { name: string; ok: boolean; detail: string }[] = [];

    // Bun runtime
    checks.push({
      name: "bun-runtime",
      ok: typeof Bun !== "undefined",
      detail: typeof Bun !== "undefined" ? `v${Bun.version}` : "not Bun",
    });

    // BFF API
    try {
      const r = await fetch(`${BFF_APP_BASE}/pools`, { method: "GET" });
      checks.push({
        name: "bff-pools",
        ok: r.ok,
        detail: r.ok ? `HTTP ${r.status}` : `HTTP ${r.status}`,
      });
    } catch (e: any) {
      checks.push({ name: "bff-pools", ok: false, detail: e.message });
    }

    // Hiro API
    try {
      const r = await fetch(`${HIRO_API}/v2/info`, { method: "GET" });
      checks.push({
        name: "hiro-api",
        ok: r.ok,
        detail: r.ok ? `HTTP ${r.status}` : `HTTP ${r.status}`,
      });
    } catch (e: any) {
      checks.push({ name: "hiro-api", ok: false, detail: e.message });
    }

    const allOk = checks.every((c) => c.ok);
    console.log(
      JSON.stringify({ result: allOk ? "success" : "degraded", checks })
    );

    // Human-readable table to stderr
    console.error("\n  HODLMM Bin Refraction — Doctor\n");
    for (const c of checks) {
      const icon = c.ok ? "[OK]" : "[FAIL]";
      console.error(`  ${icon} ${c.name.padEnd(16)} ${c.detail}`);
    }
    console.error("");
  });

// ── status ────────────────────────────────────────────────────────────────────

program
  .command("status")
  .description("List available HODLMM pools above TVL threshold")
  .action(async () => {
    try {
      const pools = await fetchPools();
      const sorted = pools.sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, 20);
      console.log(
        JSON.stringify({
          result: "success",
          poolCount: pools.length,
          pools: sorted.map((p) => ({
            poolId: p.poolId,
            pair: `${p.token0Symbol}/${p.token1Symbol}`,
            tvlUsd: p.tvlUsd,
            volume24hUsd: p.volume24hUsd,
          })),
        })
      );

      console.error("\n  HODLMM Pools (TVL >= $1000)\n");
      console.error(
        "  " +
          "Pool".padEnd(6) +
          "Pair".padEnd(18) +
          "TVL ($)".padStart(14) +
          "Vol 24h ($)".padStart(14)
      );
      console.error("  " + "-".repeat(52));
      for (const p of sorted) {
        console.error(
          "  " +
            String(p.poolId).padEnd(6) +
            `${p.token0Symbol}/${p.token1Symbol}`.padEnd(18) +
            p.tvlUsd.toFixed(0).padStart(14) +
            p.volume24hUsd.toFixed(0).padStart(14)
        );
      }
      console.error(`\n  Total: ${pools.length} pools\n`);
    } catch (e: any) {
      console.log(JSON.stringify({ error: e.message }));
    }
  });

// ── run ───────────────────────────────────────────────────────────────────────

program
  .command("run")
  .description("Run refraction analysis on HODLMM pools")
  .option("--pool <id>", "Analyze a specific pool by numeric ID")
  .option("--top <n>", "Number of top pools to analyze", "5")
  .action(async (opts) => {
    try {
      const pools = await fetchPools();
      let targets: AppPool[];

      if (opts.pool) {
        const pid = parseInt(opts.pool, 10);
        const match = pools.find((p) => p.poolId === pid);
        if (!match) {
          console.log(JSON.stringify({ error: `Pool #${pid} not found` }));
          return;
        }
        targets = [match];
      } else {
        const topN = parseInt(opts.top, 10) || 5;
        targets = pools.sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, topN);
      }

      const profiles: RefractionProfile[] = [];

      for (const pool of targets) {
        try {
          const activeBin = await fetchActiveBin(pool.poolId!);
          const bins = await fetchBinReserves(pool.poolId!, activeBin, pool);
          if (bins.length < MIN_POPULATED_BINS) {
            console.error(
              `  [SKIP] Pool ${pool.poolId} (${pool.token0Symbol}/${pool.token1Symbol}): only ${bins.length} populated bins`
            );
            continue;
          }
          const profile = analyzeRefraction(bins, activeBin, pool);
          profiles.push(profile);
        } catch (e: any) {
          console.error(
            `  [ERR] Pool ${pool.poolId} (${pool.token0Symbol}/${pool.token1Symbol}): ${e.message}`
          );
        }
      }

      // Summary
      const avgIdx =
        profiles.length > 0
          ? round(mean(profiles.map((p) => p.refractionIndex)), 1)
          : 0;
      const classCounts = {
        transparentCount: profiles.filter((p) => p.refractionClass === "TRANSPARENT").length,
        refractiveCount: profiles.filter((p) => p.refractionClass === "REFRACTIVE").length,
        prismaticCount: profiles.filter((p) => p.refractionClass === "PRISMATIC").length,
        totalReflectionCount: profiles.filter((p) => p.refractionClass === "TOTAL-REFLECTION").length,
      };
      const tirTotal = profiles.reduce((s, p) => s + p.tirZoneCount, 0);

      const output = {
        result: "success",
        summary: {
          poolsAnalyzed: profiles.length,
          avgRefractionIndex: avgIdx,
          ...classCounts,
          tirZoneTotal: tirTotal,
        },
        profiles: profiles.map((p) => ({
          pair: p.pair,
          poolId: p.poolId,
          refractionIndex: p.refractionIndex,
          refractionClass: p.refractionClass,
          meanRefractiveIndex: p.meanRefractiveIndex,
          maxRefractiveIndex: p.maxRefractiveIndex,
          snellDeviationMean: p.snellDeviationMean,
          criticalAngleCount: p.criticalAngleCount,
          criticalAngleMeanDeg: p.criticalAngleMeanDeg,
          tirZoneCount: p.tirZoneCount,
          brewsterOptimalBin: p.brewsterOptimalBin,
          brewsterMinAngleDeg: p.brewsterMinAngleDeg,
          dispersion: p.dispersion,
          dispersionClass: p.dispersionClass,
          tvlUsd: p.tvlUsd,
        })),
      };

      console.log(JSON.stringify(output));

      // Human-readable table to stderr
      console.error("\n  HODLMM Bin Refraction Analysis\n");
      console.error(
        "  " +
          "Pool".padEnd(6) +
          "Pair".padEnd(16) +
          "Idx".padStart(5) +
          "Class".padStart(20) +
          "Mean n".padStart(8) +
          "Max n".padStart(8) +
          "Snell d".padStart(9) +
          "Crit#".padStart(7) +
          "TIR#".padStart(6) +
          "Disp".padStart(7) +
          "DispCls".padStart(12)
      );
      console.error("  " + "-".repeat(104));
      for (const p of profiles) {
        console.error(
          "  " +
            String(p.poolId).padEnd(6) +
            p.pair.padEnd(16) +
            String(p.refractionIndex).padStart(5) +
            p.refractionClass.padStart(20) +
            p.meanRefractiveIndex.toFixed(2).padStart(8) +
            p.maxRefractiveIndex.toFixed(2).padStart(8) +
            p.snellDeviationMean.toFixed(3).padStart(9) +
            String(p.criticalAngleCount).padStart(7) +
            String(p.tirZoneCount).padStart(6) +
            p.dispersion.toFixed(4).padStart(7) +
            p.dispersionClass.padStart(12)
        );
      }

      // Dispersion detail sub-table
      console.error("\n  Dispersion by Trade-Size Wavelength\n");
      console.error(
        "  " +
          "Pool".padEnd(6) +
          "Pair".padEnd(16) +
          "Small n".padStart(10) +
          "Medium n".padStart(10) +
          "Large n".padStart(10) +
          "Brewster Bin".padStart(14) +
          "Brewster Deg".padStart(14)
      );
      console.error("  " + "-".repeat(80));
      for (const p of profiles) {
        const wl = p.dispersionByWavelength;
        const smallN = wl.find((w) => w.label === "small")?.effectiveN ?? 0;
        const medN = wl.find((w) => w.label === "medium")?.effectiveN ?? 0;
        const largeN = wl.find((w) => w.label === "large")?.effectiveN ?? 0;
        console.error(
          "  " +
            String(p.poolId).padEnd(6) +
            p.pair.padEnd(16) +
            smallN.toFixed(4).padStart(10) +
            medN.toFixed(4).padStart(10) +
            largeN.toFixed(4).padStart(10) +
            String(p.brewsterOptimalBin).padStart(14) +
            p.brewsterMinAngleDeg.toFixed(2).padStart(14)
        );
      }

      console.error(
        `\n  Summary: ${profiles.length} pools | avg index ${avgIdx} | ` +
          `${classCounts.transparentCount} transparent, ` +
          `${classCounts.refractiveCount} refractive, ` +
          `${classCounts.prismaticCount} prismatic, ` +
          `${classCounts.totalReflectionCount} total-reflection | ` +
          `${tirTotal} TIR zones total\n`
      );
    } catch (e: any) {
      console.log(JSON.stringify({ error: e.message }));
    }
  });

program.parse();
