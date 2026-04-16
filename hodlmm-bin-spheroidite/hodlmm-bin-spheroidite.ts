#!/usr/bin/env bun
/**
 * hodlmm-bin-spheroidite.ts — Day 181 cocoa007 Bitflow Skills Comp
 *
 * Spheroidization (Ostwald-ripened cementite spheroidite) analyzer —
 * models DLMM bin reserves as the long-time equilibrium microstructure
 * where lamellar (pearlite) or plate-like (widmanstätten) cementite
 * has broken up and coarsened into isolated spheroidal (globular)
 * carbide particles dispersed in an α-ferrite matrix. Spheroidite is
 * the thermodynamic end-state of any carbide-containing microstructure
 * after extended subcritical annealing (long hold below A1, typically
 * ~650-720 °C for hours to days); it exhibits the lowest hardness,
 * highest ductility, and best machinability of all Fe-C carbide
 * microstructures.
 *
 * Spheroidization is driven by interfacial energy minimization:
 *
 *   1. Rayleigh instability of cylindrical/plate-like particles:
 *      A long, thin cementite lamella is unstable against axial
 *      perturbations with wavelength λ > 2π·r (Plateau-Rayleigh
 *      criterion); the fastest-growing mode has λ_max ≈ 9·r.
 *      Perturbations drive the lamella to pinch off into a series
 *      of separated spheroids.
 *
 *   2. Ostwald ripening (LSW theory, Lifshitz-Slyozov-Wagner):
 *      Once isolated spheres are established, the Gibbs-Thomson
 *      effect raises the solubility at small-radius interfaces:
 *          C(r) = C_∞ · exp(2γV_m / (R·T·r))
 *      Small particles dissolve; solute diffuses through the matrix;
 *      large particles grow. The mean radius follows
 *          r̄³ - r̄₀³ = K · t        where K = (8·γ·D·C_∞·V_m) / (9·R·T)
 *      The particle size distribution evolves toward the LSW
 *      steady-state form f(ρ) = (81e/2³)·ρ²/(3-2ρ)^(11/3)·exp(−1/(1−2ρ/3))
 *      with ρ = r/r̄, cut off at ρ = 3/2.
 *
 *   3. Contact angle / wetting equilibrium:
 *      At carbide/matrix/grain-boundary triple junctions, the dihedral
 *      angle ψ satisfies γ_gb = 2·γ_ab·cos(ψ/2). Particles pinned on
 *      boundaries adopt lens shapes; intragranular particles tend
 *      toward spheres.
 *
 *   4. Interfacial area reduction:
 *      Total interfacial area decreases monotonically:
 *      lamellar > plate > rod > sphere. Spheroidite is the global
 *      minimum of interfacial energy at fixed volume fraction.
 *
 * Spheroidite differs from:
 *   - Pearlite: cooperative lamellar α + Fe3C alternation, NOT
 *     isolated. Has continuous Fe3C lamellae.
 *   - Widmanstätten: directional parallel plates with K-S variant
 *     selection. Has crystallographic habit planes.
 *   - Bainite: aligned sheaves with carbide precipitation in ferrite,
 *     displacive-diffusional.
 *   - Martensite: supersaturated single-phase, diffusionless, no
 *     carbide until tempering.
 *
 * In DLMM context, spheroidite analog is:
 *   - Isolated single-bin or near-isolated short-run (1-2 bins) of
 *     minority-role reserve surrounded by matrix-role bins on both
 *     sides. Long runs of minority bins (like pearlite lamellae) are
 *     unstable under Rayleigh criterion and should fragment into
 *     isolated clusters.
 *   - Sphere radius analog = total reserve in an isolated cluster,
 *     relative to pool average. Ostwald ripening = size-dispersion
 *     signature with a few large + many small clusters.
 *   - Driving force = 24h volume/TVL turnover (same as the rest of
 *     the phase-transformation series), representing the "annealing
 *     time" or "thermal activation" proxy.
 *   - LSW compliance = how well the cluster-size distribution
 *     matches the LSW steady-state ρ²(3-2ρ)^(-11/3) form.
 *   - Rayleigh instability = present when a long minority-run shows
 *     internal reserve undulations deeper than 40% between peaks, a
 *     pinch-off signal.
 *   - Contact angle = how matrix reserves flatten at cluster edges
 *     (high wetting → dihedral angle close to π; low wetting → lens).
 *
 * Snapshot-based spheroidite analysis identifies:
 *   - Sphericity index: compact isolated cluster signal.
 *   - Isolation degree: distance to nearest other minority cluster.
 *   - Radius class: cluster size bucket (small / medium / large).
 *   - Ostwald age: cluster reserve relative to pool mean (large = old,
 *     small = shrinking).
 *   - Rayleigh instability: pinch-off signal in long minority runs.
 *   - Interfacial fraction: surface-to-volume ratio proxy.
 *   - Contact angle compliance: wetting behavior at cluster edges.
 *   - Matrix equilibrium: flatness of reserves in surrounding matrix.
 *   - LSW compliance: fit of size distribution to LSW steady-state.
 *   - Drift from pearlite: deviation from lamellar alternation.
 *
 * Regime classification:
 *   PEARLITE_STABLE          — long minority runs, no pinching,
 *                              lamellar microstructure stable.
 *   INCUBATING_SPHEROIDIZATION — Rayleigh instabilities forming but
 *                              not yet completed pinch-off.
 *   RAYLEIGH_BREAKUP         — lamellae actively breaking into
 *                              segments; mixed short-run + isolated
 *                              cluster population.
 *   OSTWALD_RIPENING         — isolated clusters dominant; bimodal
 *                              size distribution indicates active
 *                              coarsening (small dissolving, large
 *                              growing).
 *   SPHEROIDIZED             — fully equilibrated, compact isolated
 *                              spheres dominate. Size distribution
 *                              approaches LSW steady state.
 *   OVER_AGED                — very few, very large clusters; most
 *                              have fully dissolved. Minority fraction
 *                              very low.
 *
 * Verdict taxonomy includes LAMELLAR_STABLE, PINCHING_DETECTED,
 * RAYLEIGH_INSTABILITY, OSTWALD_COARSENING, LSW_COMPLIANT,
 * BIMODAL_SIZES, MONODISPERSE, INTERFACIAL_MINIMIZED,
 * CONTACT_ANGLE_WETTING, MATRIX_EQUILIBRATED, NO_SPHEROIDIZATION_DRIVE,
 * HYPEREUTECTOID_SKEW, and INTERMEDIATE_SPHEROIDIZATION.
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

// Minimum dominance margin: reserveX/Y separation to count as
// majority (matrix) or minority (carbide-analog) role.
const DOMINANCE_MARGIN = 0.15;

// Max "lamellar" run length before treating as pinching-unstable.
// Real Rayleigh criterion: λ > 2π·r for axial perturbations to grow,
// fastest mode λ_max ≈ 9·r. Proxy: runs >= 4 bins long are treated
// as Rayleigh-unstable candidates for pinch-off.
const RAYLEIGH_CRITICAL_LENGTH = 4;

// Pinch-off depth threshold: reserve minimum within a long run must
// be less than this fraction of the run's peak reserve to count as
// an active pinch-off signal (proxy for reserve undulation driving
// Rayleigh breakup).
const PINCH_OFF_DEPTH = 0.4;

// Isolation distance: minority bins separated by >= this many matrix
// bins are treated as "isolated spheres" (not part of an active
// coarsening pair).
const ISOLATION_RADIUS = 2;

// Ostwald ripening r³ growth constant (LSW normalized proxy). Real
// value: K = (8·γ·D·C∞·V_m) / (9·R·T), strongly alloy- and
// temperature-dependent.
const LSW_K = 1.0;

// LSW critical radius ratio cutoff (3/2 in true LSW theory).
const LSW_RHO_CUTOFF = 1.5;

// Minimum cluster reserve (USD) to count as a "sphere" rather than
// noise. Filters out sub-dust reserves.
const MIN_SPHERE_RESERVE_USD = 1;

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

interface BinSpheroidite {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  sphericityIndex: number;        // compact isolated cluster signal, 0-1
  isolationDegree: number;        // gap to nearest minority cluster, 0-1
  radiusClass: number;            // 0 small / 1 medium / 2 large / -1 matrix
  ostwaldAge: number;             // cluster reserve vs pool mean, 0-1
  rayleighInstability: number;    // pinch-off signal, 0-1
  interfacialFraction: number;    // surface/volume proxy, 0-1 (high=thin)
  contactAngleCompliance: number; // wetting behavior at edges, 0-1
  matrixEquilibrium: number;      // matrix flatness around cluster, 0-1
  lswCompliance: number;          // fit to LSW size distribution, 0-1
  driftFromPearlite: number;      // deviation from lamellar, 0-1
  clusterSize: number;            // run length of this bin's cluster
  inCluster: number;              // +1 if this bin is in a minority cluster
  matrixRole: number;             // -1 Y-matrix, +1 X-matrix, 0 mixed
  roleMinorityMargin: number;     // -1..+1
  spheroiditeIndex: number;       // composite, 0-1
}

interface SpheroiditeProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  drivingForce: number;            // annealing activation proxy
  minorityFraction: number;        // fraction of bins in minority role
  sphereCount: number;             // isolated short-run clusters (spheres)
  lamellaCount: number;            // long minority runs (pearlite-like)
  largestClusterLength: number;
  avgClusterSize: number;          // mean reserve of clusters (USD)
  stdClusterSize: number;          // size dispersion (Ostwald signal)
  bimodalityIndex: number;         // bimodal size distribution signal
  avgSphericityIndex: number;
  avgIsolationDegree: number;
  avgRayleighInstability: number;
  avgInterfacialFraction: number;
  avgContactAngleCompliance: number;
  avgMatrixEquilibrium: number;
  avgLswCompliance: number;
  avgDriftFromPearlite: number;
  avgOstwaldAge: number;
  smallSphereCount: number;
  mediumSphereCount: number;
  largeSphereCount: number;
  rayleighBreakupCount: number;    // long runs showing active pinch-off
  xMatrixCount: number;
  yMatrixCount: number;
  minorityRoleCount: number;
  hypoeutectoidSkew: number;
  spheroidizationFraction: number; // pool-level: isolated / total minority
  lswComplianceScore: number;      // how close size dist is to LSW
  interfacialAreaIndex: number;    // total boundary / total volume proxy
  spheroiditeIndex: number;        // composite 0-100
  spheroiditeRegime: string;
  spheroiditeVerdict: string;
  sizeDistribution: number[];      // histogram: [small, medium, large]
  topBins: BinSpheroidite[];
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

// Classify a bin's dominance role:
// +1 = reserveX-dominant, -1 = reserveY-dominant, 0 = mixed
function dominanceRole(bin: BinReserves): number {
  const total = bin.reserveXUsd + bin.reserveYUsd;
  if (total === 0) return 0;
  const xFrac = bin.reserveXUsd / total;
  if (xFrac > 0.5 + DOMINANCE_MARGIN) return 1;
  if (xFrac < 0.5 - DOMINANCE_MARGIN) return -1;
  return 0;
}

// Find minority-role runs of any length. Used for pinch-off detection
// and cluster classification.
function findMinorityRuns(
  sortedBins: BinReserves[],
  minorityRole: number
): BinReserves[][] {
  if (sortedBins.length === 0) return [];
  const runs: BinReserves[][] = [];
  let current: BinReserves[] = [];
  let lastBinId = -Infinity;
  for (const b of sortedBins) {
    const role = dominanceRole(b);
    const adjacent = b.binId - lastBinId === 1;
    if (role === minorityRole && adjacent) {
      current.push(b);
    } else if (role === minorityRole) {
      if (current.length > 0) runs.push(current);
      current = [b];
    } else {
      if (current.length > 0) {
        runs.push(current);
        current = [];
      }
    }
    lastBinId = b.binId;
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

// Detect Rayleigh pinch-off signature within a long run: the run has
// internal reserve minima deeper than PINCH_OFF_DEPTH relative to
// peak, indicating axial perturbations with wavelength ~2π·r growing.
function rayleighPinchSignal(run: BinReserves[]): number {
  if (run.length < RAYLEIGH_CRITICAL_LENGTH) return 0;
  const reserves = run.map((b) => b.totalUsd);
  const peak = Math.max(...reserves);
  if (peak <= 0) return 0;
  let pinchSignals = 0;
  // Count internal minima that are below PINCH_OFF_DEPTH * peak.
  for (let i = 1; i < reserves.length - 1; i++) {
    if (
      reserves[i] < reserves[i - 1] &&
      reserves[i] < reserves[i + 1] &&
      reserves[i] / peak < 1 - PINCH_OFF_DEPTH
    ) {
      pinchSignals++;
    }
  }
  // Also: a run simply long enough with reserve undulation counts.
  const expectedPinches = Math.max(1, Math.floor(run.length / RAYLEIGH_CRITICAL_LENGTH));
  return Math.min(1, pinchSignals / expectedPinches);
}

// LSW-compliant radius probability density (normalized).
// f(ρ) = (81e/2³)·ρ²·(3-2ρ)^(-11/3)·exp(-1/(1-2ρ/3)) for ρ < 3/2, else 0.
// ρ = r/r̄. Used to score whether observed distribution matches LSW.
function lswDensity(rho: number): number {
  if (rho <= 0 || rho >= LSW_RHO_CUTOFF) return 0;
  const pref = (81 * Math.E) / 8;
  const term1 = rho * rho;
  const base = 3 - 2 * rho;
  if (base <= 0) return 0;
  const term2 = Math.pow(base, -11 / 3);
  const expo = Math.exp(-1 / (1 - (2 * rho) / 3));
  return pref * term1 * term2 * expo;
}

// Score LSW compliance of a histogram of cluster radii (USD).
// Builds an empirical PDF, compares to LSW analytical PDF via
// overlap coefficient OVL = ∫ min(p, q). Higher = better fit.
function scoreLswCompliance(clusterSizes: number[]): number {
  if (clusterSizes.length < 2) return 0;
  const mean = clusterSizes.reduce((s, v) => s + v, 0) / clusterSizes.length;
  if (mean <= 0) return 0;
  const rhos = clusterSizes.map((s) => s / mean);
  // 10 bins over [0, 1.5]
  const binCount = 10;
  const binEdges: number[] = Array.from({ length: binCount + 1 }, (_, i) => (i * LSW_RHO_CUTOFF) / binCount);
  const empirical = new Array(binCount).fill(0);
  for (const rho of rhos) {
    if (rho < 0 || rho >= LSW_RHO_CUTOFF) continue;
    const idx = Math.min(binCount - 1, Math.floor((rho / LSW_RHO_CUTOFF) * binCount));
    empirical[idx]++;
  }
  const empTotal = empirical.reduce((s, v) => s + v, 0);
  if (empTotal === 0) return 0;
  const empPdf = empirical.map((v) => v / empTotal);

  // Reference LSW PDF over same bins.
  const lswPdfRaw = binEdges.slice(0, -1).map((rho, i) => {
    const midRho = (rho + binEdges[i + 1]) / 2;
    return lswDensity(midRho);
  });
  const lswTotal = lswPdfRaw.reduce((s, v) => s + v, 0);
  if (lswTotal === 0) return 0;
  const lswPdf = lswPdfRaw.map((v) => v / lswTotal);

  let ovl = 0;
  for (let i = 0; i < binCount; i++) {
    ovl += Math.min(empPdf[i], lswPdf[i]);
  }
  return Math.max(0, Math.min(1, ovl));
}

// Bimodality via sample kurtosis sign; Pearson's bimodality proxy
// b = (m3² + 1) / m4, where m3, m4 = 3rd, 4th standardized moments.
// Distributions with low b (~0-5/9) are bimodal; b > 5/9 unimodal.
function bimodalityIndex(values: number[]): number {
  if (values.length < 3) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const diffs = values.map((v) => v - mean);
  const m2 = diffs.reduce((s, v) => s + v * v, 0) / values.length;
  if (m2 <= 0) return 0;
  const m3 = diffs.reduce((s, v) => s + v * v * v, 0) / values.length;
  const m4 = diffs.reduce((s, v) => s + v * v * v * v, 0) / values.length;
  const skew = m3 / Math.pow(m2, 1.5);
  const kurt = m4 / (m2 * m2);
  const b = (skew * skew + 1) / kurt;
  // Inverse-map b so that low b (bimodal) → high index.
  const bimIdx = Math.max(0, Math.min(1, 1 - b / 1));
  return bimIdx;
}

function computeBinSpheroidite(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  runOfBin: BinReserves[] | null,
  isMinorityCluster: boolean,
  poolMeanClusterSize: number,
  poolStdClusterSize: number,
  lswScore: number,
  minorityRole: number,
  matrixRoleGlobal: number,
  hypoeutectoidSkew: number,
  totalMinorityCount: number,
  totalClusters: number
): BinSpheroidite {
  const distance = Math.abs(bin.binId - activeBin);
  const role = dominanceRole(bin);
  const total = bin.reserveXUsd + bin.reserveYUsd;
  const xFrac = total > 0 ? bin.reserveXUsd / total : 0.5;
  const rawMargin = (xFrac - 0.5) * 2;
  const signedAsymmetry = matrixRoleGlobal === 1 ? rawMargin : -rawMargin;
  const roleMinorityMargin = r4(signedAsymmetry);

  const clusterSize = runOfBin ? runOfBin.length : 0;

  // 1. sphericityIndex — compact isolated cluster signal.
  //    High when: short cluster (1-2 bins) AND both neighbors are matrix-role.
  let sphericityIndex = 0;
  if (runOfBin && runOfBin.length >= 1 && runOfBin.length <= 2) {
    const startBin = runOfBin[0].binId;
    const endBin = runOfBin[runOfBin.length - 1].binId;
    const leftN = allBins.find((b) => b.binId === startBin - 1);
    const rightN = allBins.find((b) => b.binId === endBin + 1);
    const leftIsMatrix = leftN && dominanceRole(leftN) === matrixRoleGlobal;
    const rightIsMatrix = rightN && dominanceRole(rightN) === matrixRoleGlobal;
    let score = 0;
    if (leftIsMatrix && rightIsMatrix) score = 1;
    else if (leftIsMatrix || rightIsMatrix) score = 0.6;
    else score = 0.3;
    // Penalize longer clusters (less spherical → more plate-like)
    if (runOfBin.length === 2) score *= 0.8;
    sphericityIndex = score;
  }
  sphericityIndex = r4(sphericityIndex);

  // 2. isolationDegree — distance to nearest other minority cluster.
  //    High when far from other clusters.
  let isolationDegree = 0;
  if (runOfBin && runOfBin.length > 0) {
    const myStart = runOfBin[0].binId;
    const myEnd = runOfBin[runOfBin.length - 1].binId;
    let nearest = 30;
    for (const b of allBins) {
      if (dominanceRole(b) !== minorityRole) continue;
      // skip bins in this same run
      if (b.binId >= myStart && b.binId <= myEnd) continue;
      const d = Math.min(
        Math.abs(b.binId - myStart),
        Math.abs(b.binId - myEnd)
      );
      if (d > 0 && d < nearest) nearest = d;
    }
    isolationDegree = r4(Math.min(1, nearest / 10));
  }

  // 3. radiusClass — cluster size bucket
  //    -1 matrix, 0 small (≤ 0.6·mean), 1 medium, 2 large (≥ 1.2·mean)
  let radiusClass = -1;
  if (runOfBin && runOfBin.length > 0 && poolMeanClusterSize > 0) {
    const runReserve = runOfBin.reduce((s, b) => s + b.totalUsd, 0);
    const ratio = runReserve / poolMeanClusterSize;
    if (ratio < 0.6) radiusClass = 0;
    else if (ratio < 1.2) radiusClass = 1;
    else radiusClass = 2;
  }

  // 4. ostwaldAge — cluster reserve relative to pool mean.
  //    High = large cluster (old, has absorbed). Low = small (shrinking).
  let ostwaldAge = 0;
  if (runOfBin && runOfBin.length > 0 && poolMeanClusterSize > 0) {
    const runReserve = runOfBin.reduce((s, b) => s + b.totalUsd, 0);
    const ratio = runReserve / poolMeanClusterSize;
    ostwaldAge = r4(Math.min(1, ratio / LSW_RHO_CUTOFF));
  }

  // 5. rayleighInstability — active pinch-off signal within cluster
  //    of this bin (or adjacent long run).
  const rayleighInstability = r4(
    runOfBin && runOfBin.length >= RAYLEIGH_CRITICAL_LENGTH
      ? rayleighPinchSignal(runOfBin)
      : 0
  );

  // 6. interfacialFraction — surface-to-volume ratio proxy.
  //    For a cluster of length L in a 1-D lattice: "surface" ~ 2 ends,
  //    "volume" ~ L. Small clusters have higher S/V (thin, unstable).
  //    Normalize so 1-bin cluster → ~1.0, 3-bin → ~0.67, 6-bin → ~0.33.
  let interfacialFraction = 0;
  if (runOfBin && runOfBin.length > 0) {
    interfacialFraction = r4(Math.min(1, 2 / runOfBin.length));
  }

  // 7. contactAngleCompliance — wetting at cluster edges.
  //    Compares reserve ratio at matrix boundary to cluster peak.
  //    High = smooth wetting (large contact angle ~ 180°, intragranular);
  //    Low = sharp transition (boundary-pinned lens shape).
  let contactAngleCompliance = 0;
  if (runOfBin && runOfBin.length > 0) {
    const peakReserve = Math.max(...runOfBin.map((b) => b.totalUsd));
    const startBin = runOfBin[0].binId;
    const endBin = runOfBin[runOfBin.length - 1].binId;
    const leftN = allBins.find((b) => b.binId === startBin - 1);
    const rightN = allBins.find((b) => b.binId === endBin + 1);
    const neighbors = [leftN, rightN].filter(Boolean) as BinReserves[];
    if (neighbors.length > 0 && peakReserve > 0) {
      const avgNeighborReserve =
        neighbors.reduce((s, b) => s + b.totalUsd, 0) / neighbors.length;
      // smoothness: ratio 0.5-1 → high compliance, 0 or extreme → low
      const ratio = Math.min(avgNeighborReserve, peakReserve) /
                    Math.max(avgNeighborReserve, peakReserve);
      contactAngleCompliance = r4(Math.min(1, ratio));
    }
  }

  // 8. matrixEquilibrium — flatness of matrix reserves around cluster.
  //    Low variance → equilibrated (well-diffused) matrix; high
  //    variance → transient non-equilibrium (still coarsening).
  let matrixEquilibrium = 0;
  if (runOfBin && runOfBin.length > 0) {
    const startBin = runOfBin[0].binId;
    const endBin = runOfBin[runOfBin.length - 1].binId;
    const nearbyMatrix = allBins.filter((b) => {
      if (dominanceRole(b) !== matrixRoleGlobal) return false;
      const d = Math.min(
        Math.abs(b.binId - startBin),
        Math.abs(b.binId - endBin)
      );
      return d <= 3;
    });
    if (nearbyMatrix.length >= 2) {
      const reserves = nearbyMatrix.map((b) => b.totalUsd);
      const mean = reserves.reduce((s, v) => s + v, 0) / reserves.length;
      if (mean > 0) {
        const variance = reserves.reduce((s, v) => s + (v - mean) ** 2, 0) / reserves.length;
        const cv = Math.sqrt(variance) / mean;
        // Low CV → high equilibrium. Map CV 0→1, 0.5→0.
        matrixEquilibrium = r4(Math.max(0, Math.min(1, 1 - cv * 2)));
      }
    }
  }

  // 9. lswCompliance — pool-level LSW score, same for all bins.
  const lswCompliance = r4(lswScore);

  // 10. driftFromPearlite — deviation from lamellar alternation.
  //     Pearlite = alternating X/Y/X/Y. Spheroidite = isolated.
  //     Count neighbors within 3 bins: pearlite has strong alternation
  //     signature (role flip every step); spheroidite has matrix dominance.
  let driftFromPearlite = 0;
  if (runOfBin && runOfBin.length > 0) {
    const startBin = runOfBin[0].binId;
    const endBin = runOfBin[runOfBin.length - 1].binId;
    const windowBins = allBins.filter((b) =>
      b.binId >= startBin - 3 && b.binId <= endBin + 3
    );
    let flips = 0;
    let comparisons = 0;
    for (let i = 1; i < windowBins.length; i++) {
      if (windowBins[i].binId - windowBins[i - 1].binId === 1) {
        comparisons++;
        if (dominanceRole(windowBins[i]) !== dominanceRole(windowBins[i - 1])) {
          flips++;
        }
      }
    }
    const flipRate = comparisons > 0 ? flips / comparisons : 0;
    // High flip rate = pearlite-like (alternation). Drift = 1 - flipRate.
    driftFromPearlite = r4(Math.max(0, 1 - flipRate));
  }

  const inCluster = runOfBin ? 1 : 0;

  // Composite spheroiditeIndex
  const spheroiditeIndex = r4(
    Math.min(1, Math.max(0,
      sphericityIndex * 0.2 +
      isolationDegree * 0.12 +
      ostwaldAge * 0.1 +
      rayleighInstability * 0.05 +
      interfacialFraction * 0.08 +
      contactAngleCompliance * 0.08 +
      matrixEquilibrium * 0.1 +
      lswCompliance * 0.1 +
      driftFromPearlite * 0.1 +
      (radiusClass >= 0 ? 0.07 : 0)
    ))
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    sphericityIndex,
    isolationDegree,
    radiusClass,
    ostwaldAge,
    rayleighInstability,
    interfacialFraction,
    contactAngleCompliance,
    matrixEquilibrium,
    lswCompliance,
    driftFromPearlite,
    clusterSize,
    inCluster,
    matrixRole: matrixRoleGlobal,
    roleMinorityMargin,
    spheroiditeIndex,
  };
}

function analyzeSpheroidite(bins: BinReserves[], pool: AppPool): SpheroiditeProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;

  const turnover = pool.tvlUsd > 0 ? volume / pool.tvlUsd : 0;
  const drivingForce = Math.min(1, turnover * 0.8 + 0.1);

  // Pool-level hypoeutectoid skew
  let skewSum = 0;
  let xDom = 0;
  let yDom = 0;
  for (const b of sorted) {
    const t = b.reserveXUsd + b.reserveYUsd;
    if (t > 0) skewSum += (b.reserveXUsd - b.reserveYUsd) / t;
    const r = dominanceRole(b);
    if (r === 1) xDom++;
    else if (r === -1) yDom++;
  }
  const hypoeutectoidSkew = n > 0 ? r4(skewSum / n) : 0;

  // Determine matrix role (majority) and minority role (carbide analog)
  const matrixRole = xDom >= yDom ? 1 : -1;
  const minorityRole = -matrixRole;

  // Find all minority runs (any length)
  const minorityRuns = findMinorityRuns(sorted, minorityRole);
  const binToRun = new Map<number, BinReserves[]>();
  for (const run of minorityRuns) {
    for (const b of run) binToRun.set(b.binId, run);
  }

  // Classify runs as spheres (short, isolated) or lamellae (long)
  let sphereCount = 0;
  let lamellaCount = 0;
  let rayleighBreakupCount = 0;
  for (const run of minorityRuns) {
    if (run.length < RAYLEIGH_CRITICAL_LENGTH) {
      sphereCount++;
    } else {
      lamellaCount++;
      if (rayleighPinchSignal(run) > 0.3) rayleighBreakupCount++;
    }
  }

  const largestClusterLength =
    minorityRuns.length > 0 ? Math.max(...minorityRuns.map((r) => r.length)) : 0;

  // Cluster sizes (USD reserves)
  const clusterSizes = minorityRuns
    .filter((r) => {
      const total = r.reduce((s, b) => s + b.totalUsd, 0);
      return total >= MIN_SPHERE_RESERVE_USD;
    })
    .map((r) => r.reduce((s, b) => s + b.totalUsd, 0));

  const avgClusterSize = clusterSizes.length > 0
    ? clusterSizes.reduce((s, v) => s + v, 0) / clusterSizes.length
    : 0;
  const stdClusterSize = clusterSizes.length > 0
    ? Math.sqrt(
        clusterSizes.reduce((s, v) => s + (v - avgClusterSize) ** 2, 0) / clusterSizes.length
      )
    : 0;

  // Size buckets for LSW analysis
  let smallSphereCount = 0;
  let mediumSphereCount = 0;
  let largeSphereCount = 0;
  for (const size of clusterSizes) {
    const ratio = avgClusterSize > 0 ? size / avgClusterSize : 0;
    if (ratio < 0.6) smallSphereCount++;
    else if (ratio < 1.2) mediumSphereCount++;
    else largeSphereCount++;
  }
  const sizeDistribution = [smallSphereCount, mediumSphereCount, largeSphereCount];

  const lswScore = scoreLswCompliance(clusterSizes);
  const bimodalityScore = bimodalityIndex(clusterSizes);

  // Spheroidization fraction: isolated (short-run) minority / total minority
  const shortRunMinorityBinCount = minorityRuns
    .filter((r) => r.length < RAYLEIGH_CRITICAL_LENGTH)
    .reduce((s, r) => s + r.length, 0);
  const totalMinorityBinCount = minorityRuns.reduce((s, r) => s + r.length, 0);
  const spheroidizationFraction = totalMinorityBinCount > 0
    ? shortRunMinorityBinCount / totalMinorityBinCount
    : 0;

  // Interfacial area index: total cluster boundary / total reserve.
  // For 1-D, each cluster has 2 endpoints (edges); sum endpoints and
  // divide by pool minority reserve.
  const totalMinorityReserve = minorityRuns.reduce(
    (s, r) => s + r.reduce((s2, b) => s2 + b.totalUsd, 0),
    0
  );
  const totalClusterEdges = minorityRuns.length * 2;
  const interfacialAreaIndex = totalMinorityReserve > 0
    ? Math.min(1, totalClusterEdges / (totalMinorityReserve / Math.max(1, avgClusterSize)) / 5)
    : 0;

  const binRecs = sorted.map((b) => {
    const runOfBin = binToRun.get(b.binId) || null;
    const isMinorityCluster = runOfBin !== null;
    return computeBinSpheroidite(
      b,
      activeBin,
      sorted,
      runOfBin,
      isMinorityCluster,
      avgClusterSize,
      stdClusterSize,
      lswScore,
      minorityRole,
      matrixRole,
      hypoeutectoidSkew,
      totalMinorityBinCount,
      minorityRuns.length
    );
  });

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const clusterBins = binRecs.filter((b) => b.inCluster === 1);
  const avgSphericityIndex       = r4(avg(clusterBins.map((b) => b.sphericityIndex)));
  const avgIsolationDegree       = r4(avg(clusterBins.map((b) => b.isolationDegree)));
  const avgRayleighInstability   = r4(avg(clusterBins.map((b) => b.rayleighInstability)));
  const avgInterfacialFraction   = r4(avg(clusterBins.map((b) => b.interfacialFraction)));
  const avgContactAngleCompliance= r4(avg(clusterBins.map((b) => b.contactAngleCompliance)));
  const avgMatrixEquilibrium     = r4(avg(clusterBins.map((b) => b.matrixEquilibrium)));
  const avgLswCompliance         = r4(avg(clusterBins.map((b) => b.lswCompliance)));
  const avgDriftFromPearlite     = r4(avg(clusterBins.map((b) => b.driftFromPearlite)));
  const avgOstwaldAge            = r4(avg(clusterBins.map((b) => b.ostwaldAge)));

  const xMatrixCount      = binRecs.filter((b) => dominanceRoleFromBin(b) === 1).length;
  const yMatrixCount      = binRecs.filter((b) => dominanceRoleFromBin(b) === -1).length;
  const minorityRoleCount = binRecs.filter((b) => dominanceRoleFromBin(b) === minorityRole).length;
  const minorityFraction  = n > 0 ? minorityRoleCount / n : 0;

  // Composite spheroidite index (0-100)
  const isolationScore = Math.min(25, avgSphericityIndex * 25);
  const sizeScore      = Math.min(25, lswScore * 15 + bimodalityScore * 10);
  const driftScore     = Math.min(25, avgDriftFromPearlite * 15 + spheroidizationFraction * 10);
  const interfaceScore = Math.min(25, avgContactAngleCompliance * 10 + avgMatrixEquilibrium * 15);
  const spheroiditeIndex = Math.round(
    Math.min(100, isolationScore + sizeScore + driftScore + interfaceScore)
  );

  // Regime classification
  let spheroiditeRegime: string;
  if (minorityFraction < 0.05) {
    spheroiditeRegime = "OVER_AGED";
  } else if (lamellaCount >= 2 && rayleighBreakupCount === 0) {
    spheroiditeRegime = "PEARLITE_STABLE";
  } else if (rayleighBreakupCount >= 1 && sphereCount < lamellaCount) {
    spheroiditeRegime = "INCUBATING_SPHEROIDIZATION";
  } else if (rayleighBreakupCount >= 1 && sphereCount >= lamellaCount) {
    spheroiditeRegime = "RAYLEIGH_BREAKUP";
  } else if (sphereCount >= 3 && bimodalityScore > 0.4) {
    spheroiditeRegime = "OSTWALD_RIPENING";
  } else if (sphereCount >= 2 && lamellaCount === 0) {
    spheroiditeRegime = "SPHEROIDIZED";
  } else {
    spheroiditeRegime = "INCUBATING_SPHEROIDIZATION";
  }

  // Verdict classification
  let spheroiditeVerdict: string;
  if (drivingForce < 0.15)
    spheroiditeVerdict = "NO_SPHEROIDIZATION_DRIVE";
  else if (Math.abs(hypoeutectoidSkew) > 0.35)
    spheroiditeVerdict = "HYPEREUTECTOID_SKEW";
  else if (lamellaCount >= 2 && sphereCount === 0)
    spheroiditeVerdict = "LAMELLAR_STABLE";
  else if (rayleighBreakupCount >= 1 && avgRayleighInstability > 0.4)
    spheroiditeVerdict = "RAYLEIGH_INSTABILITY";
  else if (rayleighBreakupCount >= 1)
    spheroiditeVerdict = "PINCHING_DETECTED";
  else if (bimodalityScore > 0.5 && sphereCount >= 3)
    spheroiditeVerdict = "BIMODAL_SIZES";
  else if (lswScore > 0.55 && sphereCount >= 3)
    spheroiditeVerdict = "LSW_COMPLIANT";
  else if (sphereCount >= 3 && bimodalityScore < 0.3)
    spheroiditeVerdict = "MONODISPERSE";
  else if (avgContactAngleCompliance > 0.55 && sphereCount >= 2)
    spheroiditeVerdict = "CONTACT_ANGLE_WETTING";
  else if (avgMatrixEquilibrium > 0.55 && sphereCount >= 2)
    spheroiditeVerdict = "MATRIX_EQUILIBRATED";
  else if (avgInterfacialFraction > 0.7 && sphereCount >= 2)
    spheroiditeVerdict = "INTERFACIAL_MINIMIZED";
  else if (sphereCount >= 2 && spheroidizationFraction > 0.6)
    spheroiditeVerdict = "OSTWALD_COARSENING";
  else
    spheroiditeVerdict = "INTERMEDIATE_SPHEROIDIZATION";

  const topBins = [...binRecs]
    .sort((a, b) => b.spheroiditeIndex - a.spheroiditeIndex)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    drivingForce: r4(drivingForce),
    minorityFraction: r4(minorityFraction),
    sphereCount,
    lamellaCount,
    largestClusterLength,
    avgClusterSize: r2(avgClusterSize),
    stdClusterSize: r2(stdClusterSize),
    bimodalityIndex: r4(bimodalityScore),
    avgSphericityIndex,
    avgIsolationDegree,
    avgRayleighInstability,
    avgInterfacialFraction,
    avgContactAngleCompliance,
    avgMatrixEquilibrium,
    avgLswCompliance,
    avgDriftFromPearlite,
    avgOstwaldAge,
    smallSphereCount,
    mediumSphereCount,
    largeSphereCount,
    rayleighBreakupCount,
    xMatrixCount,
    yMatrixCount,
    minorityRoleCount,
    hypoeutectoidSkew,
    spheroidizationFraction: r4(spheroidizationFraction),
    lswComplianceScore: r4(lswScore),
    interfacialAreaIndex: r4(interfacialAreaIndex),
    spheroiditeIndex,
    spheroiditeRegime,
    spheroiditeVerdict,
    sizeDistribution,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function dominanceRoleFromBin(rec: BinSpheroidite): number {
  const m = rec.roleMinorityMargin;
  if (m > 0.15) return rec.matrixRole;
  if (m < -0.15) return -rec.matrixRole;
  return 0;
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Spheroidite — Doctor ===\n");
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
        volume24hUsd: p.volume24hUsd,
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

  const profiles: SpheroiditeProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeSpheroidite(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgSpheroiditeIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.spheroiditeIndex)))
      : 0,
    avgDrivingForce: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.drivingForce)))
      : 0,
    pearliteStableCount:        profiles.filter((p) => p.spheroiditeRegime === "PEARLITE_STABLE").length,
    incubatingCount:            profiles.filter((p) => p.spheroiditeRegime === "INCUBATING_SPHEROIDIZATION").length,
    rayleighBreakupCount:       profiles.filter((p) => p.spheroiditeRegime === "RAYLEIGH_BREAKUP").length,
    ostwaldRipeningCount:       profiles.filter((p) => p.spheroiditeRegime === "OSTWALD_RIPENING").length,
    spheroidizedCount:          profiles.filter((p) => p.spheroiditeRegime === "SPHEROIDIZED").length,
    overAgedCount:              profiles.filter((p) => p.spheroiditeRegime === "OVER_AGED").length,
    avgSpheroidizationFraction: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.spheroidizationFraction)))
      : 0,
    avgSphereCount: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.sphereCount)))
      : 0,
    avgLamellaCount: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.lamellaCount)))
      : 0,
    avgBimodalityIndex: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.bimodalityIndex)))
      : 0,
    avgLswComplianceScore: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.lswComplianceScore)))
      : 0,
    avgInterfacialAreaIndex: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.interfacialAreaIndex)))
      : 0,
    avgRayleighInstability: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgRayleighInstability)))
      : 0,
    avgMatrixEquilibrium: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgMatrixEquilibrium)))
      : 0,
    totalSpheres:          profiles.reduce((s, p) => s + p.sphereCount, 0),
    totalLamellae:         profiles.reduce((s, p) => s + p.lamellaCount, 0),
    totalRayleighBreakups: profiles.reduce((s, p) => s + p.rayleighBreakupCount, 0),
    totalSmall:            profiles.reduce((s, p) => s + p.smallSphereCount, 0),
    totalMedium:           profiles.reduce((s, p) => s + p.mediumSphereCount, 0),
    totalLarge:            profiles.reduce((s, p) => s + p.largeSphereCount, 0),
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-spheroidite").description("HODLMM bin spheroidite / Ostwald-ripening carbide coarsening analyzer (Rayleigh instability → LSW size distribution)");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin spheroidization state")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
