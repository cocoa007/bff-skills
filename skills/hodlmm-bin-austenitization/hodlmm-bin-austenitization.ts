#!/usr/bin/env bun
/**
 * hodlmm-bin-austenitization.ts — Day 183 cocoa007 Bitflow Skills Comp
 *
 * Austenitization analyzer — models the parent-phase-formation step
 * that precedes all quench-and-temper transformations (the predecessor
 * of martensite Day 177, bainite Day 178, pearlite Day 179,
 * widmanstatten Day 180, spheroidite Day 181, and tempering Day 182).
 * Austenitization is the heat-treatment operation where an iron-carbon
 * alloy is raised above a critical boundary (AC1/AC3 for hypoeutectoid,
 * AC1/Acm for hypereutectoid) to dissolve the original multi-phase
 * microstructure (ferrite + pearlite, or pearlite + cementite) into a
 * single homogeneous FCC γ-austenite. All subsequent microstructural
 * outcomes depend on achieving a correct austenitized seed.
 *
 * Physical stages:
 *
 *   Stage 0 — SUB_CRITICAL (below AC1, ~727 °C at eutectoid):
 *     No austenite forms. Microstructure is pro-eutectoid ferrite +
 *     pearlite (hypoeutectoid), 100% pearlite (eutectoid), or
 *     pro-eutectoid cementite + pearlite (hypereutectoid). The bct
 *     α-Fe + orthorhombic Fe3C two-phase structure is stable.
 *
 *   Stage 1 — AC1_NUCLEATION (just above AC1):
 *     Austenite nuclei appear at ferrite/cementite interfaces in
 *     pearlite colonies. The nucleation is heterogeneous — γ grains
 *     form preferentially on the α/Fe3C lamellae. Pearlite transforms
 *     first because it has the highest density of interfacial sites.
 *     Activation Q ≈ 300-400 kJ/mol (Fe self-diffusion in austenite).
 *
 *   Stage 2 — AC3_APPROACH (between AC1 and AC3):
 *     Hypoeutectoid: pro-eutectoid α-ferrite dissolves into γ. Carbon
 *     diffuses outward from pearlite-origin regions into ferrite-origin
 *     regions. Hypereutectoid: pro-eutectoid cementite dissolves into γ
 *     between AC1 and Acm. At this stage austenite is single-phase but
 *     carbon-heterogeneous, with C gradients of 0.3-0.8 wt% across
 *     a few microns.
 *
 *   Stage 3 — HOMOGENIZATION (above AC3/Acm):
 *     All α and Fe3C dissolved. Single-phase austenite. Carbon diffuses
 *     down concentration gradients over tens of seconds to minutes.
 *     Homogeneity is measured by C CV across the austenite volume.
 *     Activation Q for C diffusion in γ ≈ 130-140 kJ/mol.
 *
 *   Stage 4 — COARSENING (extended hold or overheat):
 *     Austenite grains grow via curvature-driven boundary migration
 *     following a parabolic law D² - D₀² = k·t with k = k0·exp(-Q/RT),
 *     Q ≈ 250-350 kJ/mol. Grain coarsening reduces the density of
 *     nucleation sites for subsequent transformation — coarser γ grains
 *     produce coarser daughter martensite/bainite/pearlite, typically
 *     reducing toughness.
 *
 *   Stage 5 (pathological) — OVERHEATED / BURNED:
 *     Very high temperatures (> 1200 °C in steel) cause severe grain
 *     coarsening. Near solidus, grain-boundary liquation or oxidation
 *     (burning) makes the damage irreversible — the steel cannot be
 *     restored by further heat treatment.
 *
 * Kinetics:
 *   - Austenite nucleation rate follows classical heterogeneous
 *     nucleation theory: I = I0·exp(-ΔG-star over kT).
 *   - Pearlite-to-austenite dissolution follows Johnson-Mehl-Avrami-
 *     Kolmogorov X = 1 - exp(-(k·t)^n) with n ≈ 1-2 (boundary-
 *     nucleated, interface-controlled) and k = k0·exp(-Q/RT).
 *   - Ferrite dissolution (AC1 → AC3) is diffusion-controlled with
 *     Q ≈ 130 kJ/mol (C in γ).
 *   - Homogenization time t_h ≈ L²/D where L is diffusion distance and
 *     D = D0·exp(-Q/RT). For typical austenitizing at 850 °C, D ≈ 10⁻¹¹
 *     m²/s and L ≈ 10 µm give t_h ≈ 10 s.
 *   - Grain growth D² - D₀² = k·t (parabolic). At 850 °C, k ≈ 10⁻¹⁴
 *     m²/s giving typical growth 50 → 70 µm after 1 hr.
 *
 * In DLMM context, austenitization tracks the dissolution of a
 * pre-existing two-phase microstructure (matrix + minority clusters)
 * into a homogeneous high-activity state where all bins approach a
 * uniform reserve ratio. As pool activity (turnover) rises:
 *   - Stage 0 (sub-critical): minority clusters remain distinct,
 *     matrix runs stable, pearlite-analog (alternating bins) intact.
 *   - Stage 1 (AC1 active): minority clusters at edges begin
 *     dissolving — adjacent matrix bins develop intermediate
 *     reserve ratios (nucleation-like). Indicator:
 *     nucleationSignal = matrix bins adjacent to minority with
 *     xFrac moving toward 0.5.
 *   - Stage 2 (AC3 approach): minority cluster count drops; only
 *     the largest pro-eutectoid clusters remain. Indicator:
 *     dissolutionFraction = 1 - (current clusters / initial clusters
 *     expected for the minority fraction).
 *   - Stage 3 (homogenization): all bins approaching uniform reserve
 *     ratio; reserve CV drops. Indicator: homogeneityIndex.
 *   - Stage 4 (coarsening): matrix runs merge into long spans;
 *     average run length grows. Indicator: grainSize.
 *   - Stage 5 (overheat): pathological if grainSize > threshold
 *     while minorityFraction < floor.
 *
 * DLMM phase-diagram analog:
 *   - Carbon content ≈ minorityFraction (fraction of bins that are
 *     minority-role rather than matrix-role).
 *   - Temperature ≈ drivingForce (volume/TVL turnover).
 *   - Time ≈ log(volume).
 *   - AC1 threshold: drivingForce > AC1_ACTIVITY = 0.2.
 *   - AC3 (hypoeutectoid) or Acm (hypereutectoid) threshold:
 *     composition-dependent activity threshold (higher for more
 *     extreme compositions).
 *   - Eutectoid composition: |hypoeutectoidSkew| ≈ 0 with minority
 *     fraction near 0.5 (balanced).
 *
 * Austenitization verdicts:
 *   SUB_CRITICAL                  — below AC1, no transformation.
 *   AC1_NUCLEATION                — austenite nucleating at pearlite
 *                                   boundaries.
 *   AC3_APPROACH                  — pro-eutectoid phase dissolving.
 *   FULLY_AUSTENITIZED            — single-phase γ, C still heterogeneous.
 *   HOMOGENIZED                   — single-phase γ, uniform C.
 *   GRAIN_COARSENING              — extended hold, grain growth active.
 *   OVERHEATED                    — pathological coarsening.
 *   BURNED                        — irreversible damage analog.
 *   EUTECTOID_ENTRY               — balanced composition, AC1 cross-over.
 *   NO_AUSTENITIZATION_DRIVE      — drivingForce < 0.15.
 *   INTERMEDIATE_AUSTENITIZATION  — no extreme indicators, mixed.
 *
 * Measured structural signatures (per-bin):
 *   - dissolutionSignal: minority bin with adjacent matrix and
 *     reducing reserve (approximated by small reserve relative to
 *     cluster mean).
 *   - nucleationSignal: matrix bin adjacent to minority cluster
 *     with intermediate xFrac (evidence of boundary austenite).
 *   - homogenizationSignal: bin xFrac close to 0.5 (balanced
 *     reserve ratio).
 *   - grainMembershipLen: length of matrix run containing this bin.
 *   - overheatMember: flag if in a matrix run > OVERHEAT_GRAIN_LEN.
 *   - localHj: normalized Hollomon-Jaffe for this bin stage.
 *   - arrheniusActivation: normalized activation proxy.
 *   - jmaProgress: JMAK fraction transformed for this bin.
 *   - austeniteFraction: composite of dissolution + homogenization.
 *   - austenitizednessIndex: overall bin composite 0-1.
 *
 * Pool-level metrics:
 *   - drivingForce, arrheniusActivation, hjParameter, jmaProgress.
 *   - ac1Crossed (bool), ac3Crossed (bool).
 *   - nucleationDensity: fraction of matrix bins with nucleation signal.
 *   - dissolutionFraction: 1 - (current minority clusters /
 *     initial estimate based on minorityFraction and pool length).
 *   - homogeneityIndex: 1 - normalized CV of bin xFrac around 0.5.
 *   - grainSize: average matrix run length (in bins).
 *   - maxGrainSize: largest matrix run length.
 *   - coarsenedGrainCount: runs > COARSENING_GRAIN_LEN.
 *   - stageProgress: composite 0-1.
 *   - dominantStage: 0-5.
 *   - overheatingRisk: 0-1, high if grainSize extreme with low
 *     minority fraction.
 *   - burnedRisk: 0-1, pathological extreme combination.
 *   - austenitizationIndex: composite 0-100.
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

// Dominance margin to call a bin matrix vs minority role.
const DOMINANCE_MARGIN = 0.15;

// AC1 / AC3 / Acm activity thresholds on the drivingForce axis.
// Real AC1 = 727 °C at eutectoid; AC3/Acm vary with composition.
// Here we normalize to turnover.
const AC1_ACTIVITY = 0.2;
const AC3_ACTIVITY_BASE = 0.5;

// Additional AC3 offset for hypoeutectoid: more pro-eutectoid ferrite
// takes longer to dissolve, shifting AC3 upward in activity.
// Acm offset for hypereutectoid: more pro-eutectoid cementite takes
// longer to dissolve, shifting Acm upward.
const AC3_SKEW_OFFSET = 0.15;

// Eutectoid window: |hypoeutectoidSkew| < this → eutectoid-like.
const EUTECTOID_SKEW_WINDOW = 0.1;

// Coarsening grain length threshold (matrix bins).
const COARSENING_GRAIN_LEN = 6;

// Overheating grain length threshold (matrix bins) — pathological.
const OVERHEAT_GRAIN_LEN = 10;

// Burned regime: overheated + minority near-depleted.
const BURNED_MINORITY_FLOOR = 0.05;

// Homogenization: reserve xFrac standard deviation below this is
// considered homogenized. Real systems use C CV < 5-10%.
const HOMOGENIZATION_CV_THRESHOLD = 0.12;

// Minimum matrix run length to count as a "grain".
const MIN_GRAIN_LEN = 1;

// Hollomon-Jaffe constant (same family as tempering, normalized).
const HJ_CONSTANT = 20.0;

// JMA exponent for boundary-nucleated austenitization (1-2 typical).
const JMA_N_EXPONENT = 1.5;

// Arrhenius Q/RT normalized (same as tempering).
const ARRHENIUS_Q_OVER_RT = 5.0;

// Stage classification thresholds on composite stage progress 0-1.
const STAGE_1_BOUND = 0.2;
const STAGE_2_BOUND = 0.4;
const STAGE_3_BOUND = 0.65;
const STAGE_4_BOUND = 0.85;

// Nucleation signal: a matrix bin adjacent to a minority bin whose
// xFrac has moved away from dominance margin toward 0.5 counts as
// nucleation analog.
const NUCLEATION_DEVIATION_MAX = 0.3;

// Minimum cluster reserve (USD) to count as a real cluster vs noise.
const MIN_CLUSTER_RESERVE_USD = 1;

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

interface BinAustenitization {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  dissolutionSignal: number;        // 0-1: minority bin dissolving
  nucleationSignal: number;         // 0-1: matrix bin adjacent to dissolving minority
  homogenizationSignal: number;     // 0-1: xFrac close to 0.5
  grainMembershipLen: number;       // length of matrix run containing this bin
  overheatMember: number;           // 1 if in pathologically long matrix run
  stageBin: number;                 // 0-5 dominant austenitization stage
  jmaProgress: number;              // bin-level JMA fraction transformed
  arrheniusActivation: number;      // bin-level activation proxy
  hjLocal: number;                  // local Hollomon-Jaffe, normalized
  austeniteFraction: number;        // composite 0-1
  inMatrix: number;
  inMinority: number;
  matrixRole: number;
  roleMinorityMargin: number;
  austenitizednessIndex: number;    // bin composite 0-1
}

interface AustenitizationProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  drivingForce: number;
  arrheniusActivation: number;
  hjParameter: number;
  jmaProgress: number;
  minorityFraction: number;
  hypoeutectoidSkew: number;
  ac1Activity: number;
  ac3Activity: number;              // composition-adjusted
  ac1Crossed: number;               // 1 or 0
  ac3Crossed: number;
  nucleationDensity: number;        // Stage 1 metric
  dissolutionFraction: number;      // Stage 2 metric
  homogeneityIndex: number;         // Stage 3 metric
  grainSize: number;                // average matrix run length
  maxGrainSize: number;
  coarsenedGrainCount: number;
  overheatedGrainCount: number;
  stageProgress: number;
  dominantStage: number;            // 0-5
  matrixGrainCount: number;
  minorityClusterCount: number;
  reserveXFracStdev: number;        // CV of xFrac
  reserveTotalCV: number;
  hardnessSeedProxy: number;        // future-martensite hardness seed (coarse γ → coarse martensite)
  toughnessSeedProxy: number;       // future-martensite toughness seed (fine γ → high toughness)
  overheatingRisk: number;
  burnedRisk: number;
  eutectoidWindow: number;          // 1 if |skew| < EUTECTOID_SKEW_WINDOW
  xMatrixCount: number;
  yMatrixCount: number;
  minorityRoleCount: number;
  austenitizationIndex: number;     // composite 0-100
  austenitizationRegime: string;
  austenitizationVerdict: string;
  stageDistribution: number[];      // [s0, s1, s2, s3, s4, s5]
  topBins: BinAustenitization[];
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

function dominanceRole(bin: BinReserves): number {
  const total = bin.reserveXUsd + bin.reserveYUsd;
  if (total === 0) return 0;
  const xFrac = bin.reserveXUsd / total;
  if (xFrac > 0.5 + DOMINANCE_MARGIN) return 1;
  if (xFrac < 0.5 - DOMINANCE_MARGIN) return -1;
  return 0;
}

function xFracOf(bin: BinReserves): number {
  const t = bin.reserveXUsd + bin.reserveYUsd;
  if (t === 0) return 0.5;
  return bin.reserveXUsd / t;
}

// Find runs of consecutive bins with the given role.
function findRoleRuns(
  sortedBins: BinReserves[],
  role: number
): BinReserves[][] {
  if (sortedBins.length === 0) return [];
  const runs: BinReserves[][] = [];
  let current: BinReserves[] = [];
  let lastBinId = -Infinity;
  for (const b of sortedBins) {
    const r = dominanceRole(b);
    const adjacent = b.binId - lastBinId === 1;
    if (r === role && adjacent) {
      current.push(b);
    } else if (r === role) {
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

// JMA fraction transformed: X = 1 - exp(-(k·t)^n).
function jmaTransformed(driving: number, arrhenius: number): number {
  const k = arrhenius;
  const t = driving;
  const kt = k * t;
  if (kt <= 0) return 0;
  const x = 1 - Math.exp(-Math.pow(kt, JMA_N_EXPONENT));
  return Math.max(0, Math.min(1, x));
}

// Hollomon-Jaffe parameter HJ = T·(C + log10(t)), normalized.
function hjParameter(driving: number, volume: number): number {
  const tNorm = Math.max(0.05, driving);
  const timeProxy = Math.max(1.0, Math.log10(Math.max(1, volume) + 10));
  const hj = tNorm * (HJ_CONSTANT + Math.log10(timeProxy + 1));
  return Math.max(0, Math.min(1, hj / 25.0));
}

// AC3 activity depends on composition (hypoeutectoidSkew).
// The more extreme the composition, the higher AC3 (or Acm).
function ac3Activity(hypoeutectoidSkew: number): number {
  return Math.min(0.95, AC3_ACTIVITY_BASE + Math.abs(hypoeutectoidSkew) * AC3_SKEW_OFFSET);
}

// Hardness seed proxy: fine γ grains seed fine daughter martensite
// (high hardness/toughness). Coarse γ grains seed coarse daughter
// (high hardness but low toughness).
function hardnessSeedFromGrain(grainSize: number): number {
  // Decreases weakly with grain size; capped.
  if (grainSize <= 1) return 0.5;
  return Math.max(0.3, Math.min(1, 1 - (grainSize - 1) / 20));
}

function toughnessSeedFromGrain(grainSize: number): number {
  // Hall-Petch analog: finer grains → higher toughness.
  if (grainSize <= 1) return 1.0;
  return Math.max(0, Math.min(1, 1 - (grainSize - 1) / 10));
}

function computeBinAustenitization(
  bin: BinReserves,
  index: number,
  activeBin: number,
  sortedBins: BinReserves[],
  matrixRoleGlobal: number,
  minorityClusterOfBin: Map<number, BinReserves[]>,
  matrixRunOfBin: Map<number, BinReserves[]>,
  poolDriving: number,
  poolArrhenius: number,
  poolHj: number,
  poolStageProg: number,
  ac3Act: number
): BinAustenitization {
  const distance = Math.abs(bin.binId - activeBin);
  const role = dominanceRole(bin);
  const total = bin.reserveXUsd + bin.reserveYUsd;
  const xFrac = total > 0 ? bin.reserveXUsd / total : 0.5;
  const rawMargin = (xFrac - 0.5) * 2;
  const signedAsymmetry = matrixRoleGlobal === 1 ? rawMargin : -rawMargin;
  const roleMinorityMargin = r4(signedAsymmetry);

  const inMatrix = role === matrixRoleGlobal ? 1 : 0;
  const inMinority = role === -matrixRoleGlobal ? 1 : 0;

  // Neighbors (same-sorted-index +/-1 since sortedBins sorted by binId).
  const prev = index > 0 ? sortedBins[index - 1] : null;
  const next = index < sortedBins.length - 1 ? sortedBins[index + 1] : null;
  const prevAdjacent = prev && prev.binId === bin.binId - 1;
  const nextAdjacent = next && next.binId === bin.binId + 1;
  const prevRole = prevAdjacent ? dominanceRole(prev) : 0;
  const nextRole = nextAdjacent ? dominanceRole(next) : 0;

  // Dissolution signal: minority bin whose reserve is small relative
  // to its cluster mean (edge of a dissolving cluster).
  let dissolutionSignal = 0;
  if (inMinority === 1) {
    const cluster = minorityClusterOfBin.get(bin.binId);
    if (cluster && cluster.length > 0) {
      const clusterMean = cluster.reduce((s, b) => s + b.totalUsd, 0) / cluster.length;
      if (clusterMean > 0) {
        const relRes = bin.totalUsd / clusterMean;
        // Smaller-than-mean minority bin = dissolving edge.
        if (relRes < 1.0) {
          dissolutionSignal = Math.max(0, Math.min(1, 1 - relRes));
        }
      }
      // Also credit short clusters as more-dissolved (near spheroidite).
      if (cluster.length <= 2) dissolutionSignal = Math.max(dissolutionSignal, 0.4);
    }
    // Scale by activity above AC1 (dissolution requires T > AC1).
    const activityFactor = poolDriving > AC1_ACTIVITY
      ? Math.min(1, (poolDriving - AC1_ACTIVITY) / (ac3Act - AC1_ACTIVITY + 0.001))
      : 0;
    dissolutionSignal *= activityFactor;
  }
  dissolutionSignal = r4(dissolutionSignal);

  // Nucleation signal: matrix bin adjacent to a minority bin whose
  // xFrac has shifted toward 0.5 (boundary austenite forming).
  let nucleationSignal = 0;
  if (inMatrix === 1) {
    const adjacentToMinority =
      (prevRole === -matrixRoleGlobal) || (nextRole === -matrixRoleGlobal);
    if (adjacentToMinority) {
      // Distance from dominance threshold toward 0.5.
      const dominanceThreshold = matrixRoleGlobal === 1
        ? 0.5 + DOMINANCE_MARGIN
        : 0.5 - DOMINANCE_MARGIN;
      const distToMid = Math.abs(xFrac - 0.5);
      const distToThreshold = Math.abs(xFrac - dominanceThreshold);
      // Bins with xFrac moved away from dominance threshold toward 0.5
      // count as nucleation. If we're above threshold (dominant) but
      // the deviation below is small, nucleation is high.
      if (distToMid < NUCLEATION_DEVIATION_MAX) {
        nucleationSignal = Math.max(0, Math.min(1,
          1 - distToThreshold / NUCLEATION_DEVIATION_MAX
        ));
      }
    }
    // Scale by activity above AC1.
    const activityFactor = poolDriving > AC1_ACTIVITY
      ? Math.min(1, (poolDriving - AC1_ACTIVITY) / (ac3Act - AC1_ACTIVITY + 0.001))
      : 0;
    nucleationSignal *= activityFactor;
  }
  nucleationSignal = r4(nucleationSignal);

  // Homogenization signal: xFrac close to 0.5 means bin is
  // approaching a fully-austenitized balanced state.
  const homogenizationSignal = r4(Math.max(0, Math.min(1,
    1 - Math.abs(xFrac - 0.5) * 2
  )));

  // Grain membership length (matrix runs).
  let grainMembershipLen = 0;
  if (inMatrix === 1) {
    const run = matrixRunOfBin.get(bin.binId);
    grainMembershipLen = run ? run.length : 1;
  }

  const overheatMember = grainMembershipLen >= OVERHEAT_GRAIN_LEN ? 1 : 0;

  // Determine bin stage by dominant signal.
  // Stage 0: sub-critical (dominant bin role, no nucleation/dissolution).
  // Stage 1: nucleationSignal present.
  // Stage 2: dissolutionSignal present.
  // Stage 3: homogenizationSignal high.
  // Stage 4: grainMembershipLen > COARSENING_GRAIN_LEN.
  // Stage 5: overheatMember.
  let stageBin = 0;
  if (overheatMember === 1) {
    stageBin = 5;
  } else if (grainMembershipLen >= COARSENING_GRAIN_LEN && poolStageProg > STAGE_4_BOUND) {
    stageBin = 4;
  } else if (homogenizationSignal > 0.7 && poolStageProg > STAGE_3_BOUND) {
    stageBin = 3;
  } else if (dissolutionSignal > 0.3) {
    stageBin = 2;
  } else if (nucleationSignal > 0.15) {
    stageBin = 1;
  } else {
    stageBin = 0;
  }

  // Bin-level JMA progress.
  const localArrhenius = poolArrhenius;
  const localDriving = poolDriving * (0.7 + 0.3 * (stageBin / 5));
  const jmaProgress = r4(jmaTransformed(localDriving, localArrhenius));
  const arrheniusActivation = r4(localArrhenius);
  const hjLocal = r4(poolHj * (0.7 + 0.3 * (stageBin / 5)));

  // Austenite fraction = composite of dissolution + homogenization.
  const austeniteFraction = r4(Math.max(0, Math.min(1,
    dissolutionSignal * 0.25 +
    nucleationSignal * 0.25 +
    homogenizationSignal * 0.35 +
    (stageBin / 5) * 0.15
  )));

  // Austenitizedness composite.
  const austenitizednessIndex = r4(Math.max(0, Math.min(1,
    jmaProgress * 0.2 +
    hjLocal * 0.15 +
    austeniteFraction * 0.35 +
    homogenizationSignal * 0.2 +
    (stageBin / 5) * 0.1
  )));

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    dissolutionSignal,
    nucleationSignal,
    homogenizationSignal,
    grainMembershipLen,
    overheatMember,
    stageBin,
    jmaProgress,
    arrheniusActivation,
    hjLocal,
    austeniteFraction,
    inMatrix,
    inMinority,
    matrixRole: matrixRoleGlobal,
    roleMinorityMargin,
    austenitizednessIndex,
  };
}

function analyzeAustenitization(bins: BinReserves[], pool: AppPool): AustenitizationProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;

  const turnover = pool.tvlUsd > 0 ? volume / pool.tvlUsd : 0;
  const drivingForce = Math.min(1, turnover * 0.8 + 0.1);

  const arrheniusActivation = Math.max(0.01, Math.min(1,
    Math.exp(-ARRHENIUS_Q_OVER_RT / Math.max(0.05, drivingForce))
  ));

  const hjParam = hjParameter(drivingForce, volume);
  const jmaProg = jmaTransformed(drivingForce, arrheniusActivation);

  // Skew + role counts.
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
  const matrixRole = xDom >= yDom ? 1 : -1;
  const minorityRole = -matrixRole;

  const ac3Act = ac3Activity(hypoeutectoidSkew);
  const ac1Crossed = drivingForce > AC1_ACTIVITY ? 1 : 0;
  const ac3Crossed = drivingForce > ac3Act ? 1 : 0;
  const eutectoidWindow = Math.abs(hypoeutectoidSkew) < EUTECTOID_SKEW_WINDOW ? 1 : 0;

  // Matrix runs for grain size.
  const matrixRuns = findRoleRuns(sorted, matrixRole);
  const matrixRunOfBin = new Map<number, BinReserves[]>();
  for (const run of matrixRuns) {
    for (const b of run) matrixRunOfBin.set(b.binId, run);
  }
  const validGrains = matrixRuns.filter((r) => r.length >= MIN_GRAIN_LEN);
  const grainLens = validGrains.map((r) => r.length);
  const grainSize = grainLens.length > 0
    ? grainLens.reduce((s, v) => s + v, 0) / grainLens.length
    : 0;
  const maxGrainSize = grainLens.length > 0 ? Math.max(...grainLens) : 0;
  const coarsenedGrainCount = validGrains.filter((r) => r.length >= COARSENING_GRAIN_LEN).length;
  const overheatedGrainCount = validGrains.filter((r) => r.length >= OVERHEAT_GRAIN_LEN).length;

  // Minority runs/clusters.
  const minorityRuns = findRoleRuns(sorted, minorityRole);
  const minorityClusterOfBin = new Map<number, BinReserves[]>();
  for (const run of minorityRuns) {
    for (const b of run) minorityClusterOfBin.set(b.binId, run);
  }
  const totalMinorityBins = minorityRuns.reduce((s, r) => s + r.length, 0);
  const minorityFraction = n > 0 ? totalMinorityBins / n : 0;

  // xFrac stats for homogeneity.
  const xFracs = sorted.map((b) => xFracOf(b));
  const xFracMean = xFracs.length > 0 ? xFracs.reduce((s, v) => s + v, 0) / xFracs.length : 0.5;
  const xFracVar = xFracs.length > 1
    ? xFracs.reduce((s, v) => s + (v - xFracMean) ** 2, 0) / xFracs.length
    : 0;
  const reserveXFracStdev = Math.sqrt(xFracVar);

  const totalMean = n > 0 ? totalUsd / n : 0;
  const totalVar = n > 1 && totalMean > 0
    ? sorted.reduce((s, b) => s + (b.totalUsd - totalMean) ** 2, 0) / n
    : 0;
  const reserveTotalCV = totalMean > 0 ? Math.sqrt(totalVar) / totalMean : 0;

  // Homogeneity index: low xFrac stdev around 0.5 = homogenized.
  const homogeneityIndex = Math.max(0, Math.min(1,
    1 - reserveXFracStdev / Math.max(HOMOGENIZATION_CV_THRESHOLD, 0.01) * HOMOGENIZATION_CV_THRESHOLD
  ));

  // Nucleation density: matrix bins adjacent to minority with
  // xFrac moved toward 0.5.
  let nucCount = 0;
  const matrixBinCount = sorted.filter((b) => dominanceRole(b) === matrixRole).length;
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    if (dominanceRole(b) !== matrixRole) continue;
    const prev = i > 0 ? sorted[i - 1] : null;
    const next = i < sorted.length - 1 ? sorted[i + 1] : null;
    const prevR = prev && (prev.binId === b.binId - 1) ? dominanceRole(prev) : 0;
    const nextR = next && (next.binId === b.binId + 1) ? dominanceRole(next) : 0;
    if (prevR === minorityRole || nextR === minorityRole) {
      const xf = xFracOf(b);
      if (Math.abs(xf - 0.5) < NUCLEATION_DEVIATION_MAX) {
        nucCount++;
      }
    }
  }
  const nucleationDensity = matrixBinCount > 0 ? nucCount / matrixBinCount : 0;

  // Dissolution fraction: 1 - (current clusters / expected initial).
  // Expected initial ≈ sqrt(n · minorityFraction_eutectoid) for
  // a uniform random pearlite-analog — but simpler: assume a
  // baseline of n/4 clusters at fully-sub-critical and fewer at higher
  // stages.
  const expectedInitialClusters = Math.max(1, Math.round(n / 4));
  const dissolutionFraction = Math.max(0, Math.min(1,
    1 - minorityRuns.length / expectedInitialClusters
  ));

  // Stage progress — weighted composite.
  // Each stage indicator contributes, capped at 1.
  const stageProgress = Math.max(0, Math.min(1,
    nucleationDensity * 0.15 +
    dissolutionFraction * 0.25 +
    homogeneityIndex * 0.3 +
    Math.min(1, grainSize / OVERHEAT_GRAIN_LEN) * 0.2 +
    (ac1Crossed ? 0.05 : 0) +
    (ac3Crossed ? 0.05 : 0)
  ));

  // Dominant stage 0-5.
  let dominantStage = 0;
  if (overheatedGrainCount > 0 && minorityFraction < BURNED_MINORITY_FLOOR) {
    dominantStage = 5;
  } else if (coarsenedGrainCount > 0 && stageProgress >= STAGE_4_BOUND) {
    dominantStage = 4;
  } else if (stageProgress >= STAGE_3_BOUND) {
    dominantStage = 3;
  } else if (stageProgress >= STAGE_2_BOUND) {
    dominantStage = 2;
  } else if (stageProgress >= STAGE_1_BOUND) {
    dominantStage = 1;
  } else {
    dominantStage = 0;
  }

  const hardnessSeedProxy = hardnessSeedFromGrain(grainSize);
  const toughnessSeedProxy = toughnessSeedFromGrain(grainSize);

  // Overheating risk: peaks when grainSize is large with low minority.
  const overheatingRisk = Math.max(0, Math.min(1,
    (grainSize / OVERHEAT_GRAIN_LEN) * (1 - Math.min(1, minorityFraction * 5))
  ));
  const burnedRisk = overheatedGrainCount > 0 && minorityFraction < BURNED_MINORITY_FLOOR
    ? 1
    : overheatingRisk > 0.8 ? 0.5 : 0;

  // Per-bin analysis.
  const binRecs = sorted.map((b, i) =>
    computeBinAustenitization(
      b, i, activeBin, sorted, matrixRole,
      minorityClusterOfBin, matrixRunOfBin,
      drivingForce, arrheniusActivation, hjParam,
      stageProgress, ac3Act
    )
  );

  const stageDistribution = [0, 0, 0, 0, 0, 0];
  for (const b of binRecs) {
    stageDistribution[Math.min(5, Math.max(0, b.stageBin))]++;
  }

  const xMatrixCount = sorted.filter((b) => dominanceRole(b) === 1).length;
  const yMatrixCount = sorted.filter((b) => dominanceRole(b) === -1).length;
  const minorityRoleCount = sorted.filter((b) => dominanceRole(b) === minorityRole).length;

  // Composite austenitization index 0-100.
  const stageScore = Math.min(25, stageProgress * 25);
  const homogeneityScore = Math.min(25, homogeneityIndex * 25);
  const kineticScore = Math.min(25, jmaProg * 15 + hjParam * 10);
  const structureScore = Math.min(25,
    dissolutionFraction * 10 +
    nucleationDensity * 5 +
    (ac1Crossed ? 5 : 0) +
    (ac3Crossed ? 5 : 0)
  );
  const austenitizationIndex = Math.round(
    Math.min(100, stageScore + homogeneityScore + kineticScore + structureScore)
  );

  // Regime classification.
  let austenitizationRegime: string;
  if (drivingForce < 0.15) {
    austenitizationRegime = "SUB_CRITICAL";
  } else if (overheatedGrainCount > 0 && minorityFraction < BURNED_MINORITY_FLOOR) {
    austenitizationRegime = "BURNED";
  } else if (coarsenedGrainCount > 0 && stageProgress >= STAGE_4_BOUND) {
    austenitizationRegime = "GRAIN_COARSENING";
  } else if (stageProgress >= STAGE_3_BOUND && homogeneityIndex > 0.7) {
    austenitizationRegime = "HOMOGENIZED";
  } else if (ac3Crossed === 1) {
    austenitizationRegime = "FULLY_AUSTENITIZED";
  } else if (ac1Crossed === 1 && stageProgress >= STAGE_2_BOUND) {
    austenitizationRegime = "AC3_APPROACH";
  } else if (ac1Crossed === 1) {
    austenitizationRegime = "AC1_NUCLEATION";
  } else {
    austenitizationRegime = "SUB_CRITICAL";
  }

  // Verdict.
  let austenitizationVerdict: string;
  if (drivingForce < 0.15) {
    austenitizationVerdict = "NO_AUSTENITIZATION_DRIVE";
  } else if (burnedRisk >= 1) {
    austenitizationVerdict = "BURNED";
  } else if (overheatingRisk > 0.7 && overheatedGrainCount > 0) {
    austenitizationVerdict = "OVERHEATED";
  } else if (coarsenedGrainCount > 0 && stageProgress >= STAGE_4_BOUND) {
    austenitizationVerdict = "GRAIN_COARSENING";
  } else if (stageProgress >= STAGE_3_BOUND && homogeneityIndex > 0.7) {
    austenitizationVerdict = "HOMOGENIZED";
  } else if (ac3Crossed === 1 && homogeneityIndex <= 0.7) {
    austenitizationVerdict = "FULLY_AUSTENITIZED";
  } else if (ac1Crossed === 1 && stageProgress >= STAGE_2_BOUND) {
    austenitizationVerdict = "AC3_APPROACH";
  } else if (ac1Crossed === 1 && nucleationDensity > 0.15) {
    austenitizationVerdict = "AC1_NUCLEATION";
  } else if (ac1Crossed === 1 && eutectoidWindow === 1) {
    austenitizationVerdict = "EUTECTOID_ENTRY";
  } else if (drivingForce < AC1_ACTIVITY) {
    austenitizationVerdict = "SUB_CRITICAL";
  } else {
    austenitizationVerdict = "INTERMEDIATE_AUSTENITIZATION";
  }

  const topBins = [...binRecs]
    .sort((a, b) => b.austenitizednessIndex - a.austenitizednessIndex)
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
    arrheniusActivation: r4(arrheniusActivation),
    hjParameter: r4(hjParam),
    jmaProgress: r4(jmaProg),
    minorityFraction: r4(minorityFraction),
    hypoeutectoidSkew,
    ac1Activity: r4(AC1_ACTIVITY),
    ac3Activity: r4(ac3Act),
    ac1Crossed,
    ac3Crossed,
    nucleationDensity: r4(nucleationDensity),
    dissolutionFraction: r4(dissolutionFraction),
    homogeneityIndex: r4(homogeneityIndex),
    grainSize: r2(grainSize),
    maxGrainSize,
    coarsenedGrainCount,
    overheatedGrainCount,
    stageProgress: r4(stageProgress),
    dominantStage,
    matrixGrainCount: validGrains.length,
    minorityClusterCount: minorityRuns.length,
    reserveXFracStdev: r4(reserveXFracStdev),
    reserveTotalCV: r4(reserveTotalCV),
    hardnessSeedProxy: r4(hardnessSeedProxy),
    toughnessSeedProxy: r4(toughnessSeedProxy),
    overheatingRisk: r4(overheatingRisk),
    burnedRisk: r4(burnedRisk),
    eutectoidWindow,
    xMatrixCount,
    yMatrixCount,
    minorityRoleCount,
    austenitizationIndex,
    austenitizationRegime,
    austenitizationVerdict,
    stageDistribution,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Austenitization — Doctor ===\n");
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

  const profiles: AustenitizationProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeAustenitization(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgAustenitizationIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.austenitizationIndex)))
      : 0,
    avgDrivingForce: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.drivingForce)))
      : 0,
    subCriticalCount:       profiles.filter((p) => p.austenitizationRegime === "SUB_CRITICAL").length,
    ac1NucleationCount:     profiles.filter((p) => p.austenitizationRegime === "AC1_NUCLEATION").length,
    ac3ApproachCount:       profiles.filter((p) => p.austenitizationRegime === "AC3_APPROACH").length,
    fullyAustenitizedCount: profiles.filter((p) => p.austenitizationRegime === "FULLY_AUSTENITIZED").length,
    homogenizedCount:       profiles.filter((p) => p.austenitizationRegime === "HOMOGENIZED").length,
    grainCoarseningCount:   profiles.filter((p) => p.austenitizationRegime === "GRAIN_COARSENING").length,
    burnedCount:            profiles.filter((p) => p.austenitizationRegime === "BURNED").length,
    avgStageProgress: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.stageProgress)))
      : 0,
    avgHomogeneityIndex: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.homogeneityIndex)))
      : 0,
    avgNucleationDensity: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.nucleationDensity)))
      : 0,
    avgDissolutionFraction: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.dissolutionFraction)))
      : 0,
    avgGrainSize: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.grainSize)))
      : 0,
    avgHjParameter: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.hjParameter)))
      : 0,
    avgJmaProgress: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.jmaProgress)))
      : 0,
    avgArrheniusActivation: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.arrheniusActivation)))
      : 0,
    avgHardnessSeedProxy: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.hardnessSeedProxy)))
      : 0,
    avgToughnessSeedProxy: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.toughnessSeedProxy)))
      : 0,
    avgOverheatingRisk: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.overheatingRisk)))
      : 0,
    totalCoarsenedGrains: profiles.reduce((s, p) => s + p.coarsenedGrainCount, 0),
    totalOverheatedGrains: profiles.reduce((s, p) => s + p.overheatedGrainCount, 0),
    totalMatrixGrains: profiles.reduce((s, p) => s + p.matrixGrainCount, 0),
    totalMinorityClusters: profiles.reduce((s, p) => s + p.minorityClusterCount, 0),
    ac1CrossedCount:  profiles.filter((p) => p.ac1Crossed === 1).length,
    ac3CrossedCount:  profiles.filter((p) => p.ac3Crossed === 1).length,
    eutectoidWindowCount: profiles.filter((p) => p.eutectoidWindow === 1).length,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-austenitization").description("HODLMM bin austenitization / parent-phase-formation analyzer (AC1/AC3 crossing, pearlite dissolution, homogenization, grain coarsening, overheating)");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin austenitization state")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
