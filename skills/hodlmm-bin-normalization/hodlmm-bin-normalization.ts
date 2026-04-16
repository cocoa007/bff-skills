#!/usr/bin/env bun
/**
 * hodlmm-bin-normalization.ts — Day 184 cocoa007 Bitflow Skills Comp
 *
 * Normalization analyzer — models the air-cool heat-treatment step
 * applied to an austenitized iron-carbon alloy. Normalization sits
 * between full annealing (very slow furnace cool, coarse pearlite and
 * equilibrium structure) and quenching (very fast cool, martensite).
 * The intermediate air cooling rate produces a fine, regular pearlite
 * lamellar structure plus pro-eutectoid ferrite (hypoeutectoid) or
 * pro-eutectoid cementite (hypereutectoid) with a standardized fine
 * grain size. Normalization is the most common grain-refinement and
 * property-standardization treatment for medium-carbon steels, forgings,
 * castings, and weldments.
 *
 * Complements the phase-transformation series:
 *   austenitization (Day 183) → normalization (Day 184) → annealing
 *     (Day 129) or quench → martensite (Day 177), bainite (Day 178),
 *     pearlite (Day 179), widmanstatten (Day 180), spheroidite (Day 181),
 *     tempering (Day 182).
 *
 * Physical stages (continuous cool from above AC3/Acm to room T):
 *
 *   Stage 0 — AUSTENITIC_HOLD (above AC3/Acm, still in γ):
 *     Alloy is fully austenitized; no transformation yet. Cooling just
 *     started; austenite grain size set by prior austenitizing cycle.
 *
 *   Stage 1 — PRO_EUTECTOID_FORMATION (AC3 → AC1 for hypoeutectoid,
 *              Acm → AC1 for hypereutectoid):
 *     First daughter phase nucleates at austenite grain boundaries.
 *     Hypoeutectoid: pro-eutectoid α-ferrite (allotriomorphic/idio-
 *     morphic). Hypereutectoid: pro-eutectoid cementite (grain-boundary
 *     networks). Amount predicted by lever rule at the eutectoid
 *     temperature. Nucleation is heterogeneous; growth is diffusion-
 *     controlled along grain boundaries. For eutectoid composition,
 *     this stage is absent.
 *
 *   Stage 2 — PEARLITE_NUCLEATION (at or just below AC1, ~727 °C):
 *     Remaining austenite (at or near eutectoid C content) decomposes
 *     cooperatively into alternating α-ferrite + Fe3C lamellae. First
 *     pearlite colonies nucleate at prior-austenite grain boundaries,
 *     at intersections of grain boundary triple lines, and on pro-
 *     eutectoid α/γ or Fe3C/γ interfaces. The Hillert lever-rule
 *     relation sets lamellar spacing:
 *         λ = [2·σ·V_m·T_e] / [ΔS·ΔT]
 *     where σ = α/Fe3C interfacial energy, V_m = molar volume of
 *     pearlite, T_e = eutectoid temperature, ΔS = entropy of
 *     transformation, ΔT = undercooling below AC1.
 *     Air cooling provides moderate ΔT (50-100 °C) → intermediate λ.
 *
 *   Stage 3 — PEARLITE_GROWTH (below AC1 with moderate undercooling):
 *     Pearlite colonies grow radially from nucleation sites with
 *     cooperative edgewise growth. Growth velocity v follows Zener-
 *     Hillert: v = D·(c_α - c_θ) / (λ·c_eut) with D the carbon
 *     diffusivity in austenite. Faster cooling → smaller λ →
 *     higher v but less coarsening.
 *
 *   Stage 4 — FINE_PEARLITE (at completion of transformation):
 *     All remaining γ consumed. Microstructure = pro-eutectoid phase
 *     (ferrite or cementite) + fine pearlite. Interlamellar spacing
 *     λ ≈ 0.1-0.3 μm (vs 0.3-1.0 μm in annealed, coarse pearlite;
 *     or > 1.0 μm in slow-furnace-cooled structures).
 *     Typical mechanical outcome (plain-carbon steel):
 *        - Hardness 180-250 HV (anneal: 120-180; quench-martensite:
 *          500-700)
 *        - Yield strength 300-400 MPa (anneal: 200-300)
 *        - Elongation 15-25% (anneal: 25-35)
 *        - Grain size ASTM 7-10 (refined vs anneal ASTM 4-6)
 *     Hall-Petch: σ_y = σ_0 + k·λ^(-1/2); finer λ → higher σ_y.
 *
 *   Stage 5 — STANDARDIZED (after full cool to RT):
 *     Homogeneous properties across cross-section. Grain size uniform
 *     regardless of prior thermomechanical history. Internal stresses
 *     from prior forming operations largely relieved. This is the
 *     engineering use case: "normalize to standardize".
 *
 *   Stage 6 (pathological) — NON_UNIFORM_COOL:
 *     Irregular air flow or thick section → cooling rate gradient across
 *     cross-section → mixed microstructures (pearlite near surface,
 *     coarser pearlite or even bainite in core for thick sections).
 *     Detected by reserveCV and grain-size variance.
 *
 * Kinetics:
 *   - Continuous cooling transformation (CCT) curve — passing through
 *     the pearlite nose with a moderate cooling rate.
 *   - Cooling rate CR (°C/s) = dT/dt for the air-cool phase.
 *     Plain carbon: CR_AIR ≈ 1-10 °C/s; CR_FURNACE ≈ 0.01-0.1 °C/s;
 *     CR_OIL ≈ 30-60 °C/s; CR_WATER ≈ 100+ °C/s.
 *   - Lamellar spacing: λ = A/ΔT with A ≈ 30-40 μm·°C for Fe-C pearlite.
 *   - JMA kinetics for transformation: X = 1 - exp(-(k·t)^n)
 *     with n ≈ 2-3 for continuous cooling and boundary nucleation.
 *   - Grain size D from austenite: D_α = f(D_γ, CR) where finer
 *     prior-γ and faster cooling give finer daughter.
 *
 * In DLMM context, normalization tracks the formation of a fine,
 * regular matrix + minority-cluster pattern from a previously
 * homogenized (austenitized) pool as activity moderately decays:
 *
 *   - Stage 0 (austenitic hold): bin reserves are uniform (low xFrac
 *     stdev); pool is still in high-activity equivalent.
 *
 *   - Stage 1 (pro-eutectoid formation): first minority bins appear
 *     at "grain boundaries" of the matrix (detected by nucleation
 *     sites = bins that have shifted away from xFrac = 0.5 toward
 *     minority role). Count of early minority cluster nuclei rises.
 *
 *   - Stage 2 (pearlite nucleation): alternating short runs of
 *     matrix/minority begin forming (initial lamellar pattern).
 *     Short runs (1-2 bins each) of alternating role, tracked by
 *     lamellarAlternationCount.
 *
 *   - Stage 3 (pearlite growth): alternating pattern spreads across
 *     the pool; lamellar region grows. Tracked by average alternation
 *     run length and fraction of pool in the lamellar pattern.
 *
 *   - Stage 4 (fine pearlite): fine regular pattern with λ analog
 *     ≤ NORMALIZATION_LAMELLA_SPACING = 2.0 bins. Grain size is
 *     standardized.
 *
 *   - Stage 5 (standardized): full cross-section uniform; reserveCV
 *     low; grain-size dispersion low.
 *
 *   - Stage 6 (non-uniform): grain-size dispersion high (some regions
 *     fine-pearlite, others coarse-pearlite or bainite-like).
 *
 * DLMM phase-diagram analog:
 *   - Carbon content ≈ minorityFraction.
 *   - Temperature ≈ drivingForce (turnover); cooling = decreasing
 *     drivingForce from a previous peak (inferred from activity vs
 *     volume baseline).
 *   - Cooling rate ≈ estimated decay rate (how quickly drivingForce
 *     dropped from its eutectoid-crossing peak).
 *   - AC1 threshold: drivingForce > AC1_ACTIVITY = 0.2 still austenitic
 *     territory; < 0.2 = pearlite-forming domain.
 *   - AC3 threshold: composition-adjusted upper boundary.
 *   - Undercooling ΔT: AC1_ACTIVITY − current drivingForce when active.
 *
 * Normalization verdicts:
 *   AUSTENITIC_HOLD              — still in γ region, no transformation.
 *   PRO_EUTECTOID_FORMATION      — first daughter phase nucleating at
 *                                   γ grain boundaries.
 *   PEARLITE_NUCLEATION          — pearlite colonies starting.
 *   PEARLITE_GROWTH              — lamellar structure expanding.
 *   FINE_PEARLITE                — transformation complete, fine λ.
 *   STANDARDIZED                 — full cool, uniform properties.
 *   NON_UNIFORM                  — cooling-rate gradient indicated.
 *   NO_NORMALIZATION_DRIVE       — no prior peak, cannot infer cooling.
 *   INTERMEDIATE_NORMALIZATION   — mixed indicators.
 *
 * Measured structural signatures (per-bin):
 *   - proEutectoidSignal: bin is minority-role on edge of long matrix
 *     run (analog of pro-eutectoid ferrite/cementite at grain boundary).
 *   - lamellarSignal: bin is in a run of length ≤ NORMALIZATION_LAMELLA_SPACING
 *     with role alternating within ALTERNATION_WINDOW = 4 bins.
 *   - standardizationSignal: bin's neighborhood reserveCV is low.
 *   - grainBoundaryPos: 1 if bin is at a role transition (matrix ↔
 *     minority boundary).
 *   - lambdaLocal: estimated local lamellar spacing in bins (inverse
 *     of alternation frequency in a 5-bin window).
 *   - coolingRateLocal: estimated cooling-rate analog from activity
 *     decay × distance-from-active.
 *   - hallPetchProxy: 1/sqrt(lambdaLocal), normalized.
 *   - proEutectoidFraction: estimated pro-eutectoid fraction (lever
 *     rule analog on minority fraction vs. eutectoid).
 *   - normalizationDegree: per-bin composite 0-1.
 *
 * Pool-level metrics:
 *   - drivingForce: current turnover proxy.
 *   - priorPeakDrivingForce: estimated historical peak (using
 *     volume / TVL ratio amplified).
 *   - coolingRate: estimated normalized cooling rate from priorPeak −
 *     current / log(volume).
 *   - coolingRegime: FURNACE | AIR | OIL | WATER (normalized).
 *   - lamellarAlternationCount: number of role transitions in
 *     populated-bin sequence.
 *   - lamellarRunFraction: fraction of bins in short alternating
 *     (≤ NORMALIZATION_LAMELLA_SPACING) runs.
 *   - proEutectoidFraction: fraction of minority bins in long matrix
 *     runs' boundaries.
 *   - grainSize: average matrix run length.
 *   - grainSizeCV: coefficient of variation of grain lengths.
 *   - reserveCV: coefficient of variation of bin reserves.
 *   - lambdaEstimate: average lamellar spacing in bins.
 *   - hallPetchStrength: normalized strength proxy 1/sqrt(λ).
 *   - hallPetchHardness: normalized hardness proxy.
 *   - ductilityProxy: inverse of hardness proxy.
 *   - astmGrainSize: mapped grain-size number analog (finer → higher).
 *   - ac1Crossed / ac3Crossed: flags.
 *   - standardizationIndex: composite 0-1 of uniformity metrics.
 *   - jmaProgress: JMA fraction transformed.
 *   - stageProgress: composite 0-1.
 *   - dominantStage: 0-6.
 *   - uniformityRisk: risk of non-uniform cooling.
 *   - overNormalizationRisk: grain-size-dispersion risk.
 *   - normalizationVerdict + normalizationRegime.
 *   - normalizationIndex: composite 0-100.
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

// AC1 / AC3 activity thresholds on the drivingForce axis.
const AC1_ACTIVITY = 0.2;
const AC3_ACTIVITY_BASE = 0.5;
const AC3_SKEW_OFFSET = 0.15;

// Eutectoid window.
const EUTECTOID_SKEW_WINDOW = 0.1;

// Lamellar spacing thresholds (bin-count analog of λ).
// Fine pearlite (air-cooled) ≈ 1-2 bins; coarse (furnace) ≈ 3-5 bins.
const NORMALIZATION_LAMELLA_SPACING = 2.0;
const COARSE_PEARLITE_SPACING = 5.0;

// Alternation window: count role transitions within this window as
// lamellar.
const ALTERNATION_WINDOW = 4;

// Minimum alternation count for a region to be "lamellar".
const MIN_LAMELLAR_ALTERNATIONS = 2;

// Grain-size coefficient-of-variation threshold for "uniform".
const UNIFORM_GRAIN_CV = 0.4;

// Cooling-rate bins (normalized).
const COOLING_FURNACE_MAX = 0.15; // slow
const COOLING_AIR_MAX = 0.45;     // medium
const COOLING_OIL_MAX = 0.75;     // fast
// >0.75 = water quench

// Hall-Petch constants (normalized).
const HP_K = 0.7;                  // strengthening coefficient
const HP_SIGMA_0 = 0.3;            // base strength

// Stage thresholds on composite stageProgress.
const STAGE_1_BOUND = 0.15;
const STAGE_2_BOUND = 0.3;
const STAGE_3_BOUND = 0.5;
const STAGE_4_BOUND = 0.7;
const STAGE_5_BOUND = 0.85;

// Pro-eutectoid cap (lever rule): pro-eutectoid fraction at AC1 is
// (eutectoidC - compositionC)/(eutectoidC - ferriteC) for hypoeut.
// We approximate using |hypoeutectoidSkew|.
const PRO_EUT_SKEW_MAX = 0.5;

// JMA exponent for continuous cooling (typically 2-3).
const JMA_N_EXPONENT = 2.2;

// Arrhenius Q/RT normalized (same family as tempering/austenitization).
const ARRHENIUS_Q_OVER_RT = 5.0;

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

interface BinNormalization {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  proEutectoidSignal: number;   // 0-1
  lamellarSignal: number;       // 0-1
  standardizationSignal: number; // 0-1
  grainBoundaryPos: number;     // 0 or 1
  lambdaLocal: number;          // bins
  coolingRateLocal: number;     // 0-1 normalized
  hallPetchProxy: number;       // 0-1
  proEutectoidFraction: number; // 0-1 (pool-level feeds in)
  stageBin: number;             // 0-6
  jmaProgress: number;          // 0-1
  arrheniusActivation: number;  // 0-1
  inMatrix: number;
  inMinority: number;
  matrixRole: number;
  roleMinorityMargin: number;
  normalizationDegree: number;  // 0-1 composite
}

interface NormalizationProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  drivingForce: number;
  priorPeakDrivingForce: number;
  coolingRate: number;           // 0-1 normalized
  coolingRegime: string;          // FURNACE | AIR | OIL | WATER | NONE
  arrheniusActivation: number;
  jmaProgress: number;
  minorityFraction: number;
  hypoeutectoidSkew: number;
  ac1Activity: number;
  ac3Activity: number;
  ac1Crossed: number;
  ac3Crossed: number;
  lamellarAlternationCount: number;
  lamellarRunFraction: number;    // 0-1
  proEutectoidFraction: number;   // 0-1
  grainSize: number;              // avg matrix run length
  maxGrainSize: number;
  grainSizeCV: number;            // coefficient of variation
  reserveCV: number;
  lambdaEstimate: number;         // avg lamellar spacing (bins)
  hallPetchStrength: number;      // 0-1
  hallPetchHardness: number;      // 0-1
  ductilityProxy: number;         // 0-1
  astmGrainSize: number;          // 1-12, mapped from grainSize
  stageProgress: number;
  dominantStage: number;          // 0-6
  matrixGrainCount: number;
  minorityClusterCount: number;
  reserveXFracStdev: number;
  standardizationIndex: number;   // 0-1
  uniformityRisk: number;         // 0-1
  overNormalizationRisk: number;  // 0-1
  eutectoidWindow: number;
  xMatrixCount: number;
  yMatrixCount: number;
  minorityRoleCount: number;
  normalizationIndex: number;     // composite 0-100
  normalizationRegime: string;
  normalizationVerdict: string;
  stageDistribution: number[];     // [s0, s1, s2, s3, s4, s5, s6]
  topBins: BinNormalization[];
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

// Count role transitions (analog of lamellar alternations) within
// runs of consecutive populated bins.
function countRoleTransitions(sortedBins: BinReserves[]): number {
  if (sortedBins.length < 2) return 0;
  let trans = 0;
  let lastRole = dominanceRole(sortedBins[0]);
  let lastBinId = sortedBins[0].binId;
  for (let i = 1; i < sortedBins.length; i++) {
    const b = sortedBins[i];
    const r = dominanceRole(b);
    const adj = b.binId - lastBinId === 1;
    if (adj && r !== 0 && lastRole !== 0 && r !== lastRole) trans++;
    if (r !== 0) lastRole = r;
    lastBinId = b.binId;
  }
  return trans;
}

// Lamellar regions: windows of ALTERNATION_WINDOW populated bins with
// ≥ MIN_LAMELLAR_ALTERNATIONS transitions.
function identifyLamellarBins(sortedBins: BinReserves[]): Set<number> {
  const out = new Set<number>();
  if (sortedBins.length < ALTERNATION_WINDOW) return out;
  for (let i = 0; i <= sortedBins.length - ALTERNATION_WINDOW; i++) {
    const window = sortedBins.slice(i, i + ALTERNATION_WINDOW);
    // Require bins to be adjacent.
    let adj = true;
    for (let j = 1; j < window.length; j++) {
      if (window[j].binId - window[j - 1].binId !== 1) { adj = false; break; }
    }
    if (!adj) continue;
    const trans = countRoleTransitions(window);
    if (trans >= MIN_LAMELLAR_ALTERNATIONS) {
      for (const b of window) out.add(b.binId);
    }
  }
  return out;
}

// Estimate local lamellar spacing: inverse of role-transition density
// in a 5-bin centered window (clamped to at least 1 bin).
function localLambda(sortedBins: BinReserves[], index: number): number {
  const lo = Math.max(0, index - 2);
  const hi = Math.min(sortedBins.length, index + 3);
  const win = sortedBins.slice(lo, hi);
  const trans = countRoleTransitions(win);
  if (trans === 0) return COARSE_PEARLITE_SPACING;
  return Math.max(1, win.length / Math.max(1, trans));
}

// JMA fraction transformed for continuous cooling.
function jmaTransformed(driving: number, arrhenius: number): number {
  const k = arrhenius;
  const t = Math.max(0.05, 1 - driving); // "time below AC1" proxy
  const kt = k * t;
  if (kt <= 0) return 0;
  const x = 1 - Math.exp(-Math.pow(kt, JMA_N_EXPONENT));
  return Math.max(0, Math.min(1, x));
}

function coolingRegimeOf(rate: number): string {
  if (rate < COOLING_FURNACE_MAX) return "FURNACE";
  if (rate < COOLING_AIR_MAX) return "AIR";
  if (rate < COOLING_OIL_MAX) return "OIL";
  return "WATER";
}

// AC3 activity depends on composition (hypoeutectoidSkew).
function ac3Activity(hypoeutectoidSkew: number): number {
  return Math.min(0.95, AC3_ACTIVITY_BASE + Math.abs(hypoeutectoidSkew) * AC3_SKEW_OFFSET);
}

// Hall-Petch analog: normalized strength from λ.
function hallPetchStrength(lambda: number): number {
  const lam = Math.max(0.5, lambda);
  const raw = HP_SIGMA_0 + HP_K / Math.sqrt(lam);
  return Math.max(0, Math.min(1, raw));
}

// ASTM grain size number mapping: finer grain → higher ASTM number.
// Grain size bin-length ~1 → ASTM ~10; ~10 → ASTM ~3.
function astmGrainSize(grain: number): number {
  if (grain <= 1) return 10;
  const n = 10 - 2 * Math.log2(Math.max(1, grain));
  return Math.max(1, Math.min(12, Math.round(n * 10) / 10));
}

// Pro-eutectoid fraction (lever rule analog on skew).
function proEutectoidFraction(skew: number): number {
  return Math.max(0, Math.min(1, Math.abs(skew) / PRO_EUT_SKEW_MAX));
}

function computeBinNormalization(
  bin: BinReserves,
  index: number,
  activeBin: number,
  sortedBins: BinReserves[],
  matrixRoleGlobal: number,
  matrixRunOfBin: Map<number, BinReserves[]>,
  minorityClusterOfBin: Map<number, BinReserves[]>,
  lamellarBinSet: Set<number>,
  poolDriving: number,
  poolArrhenius: number,
  poolCoolingRate: number,
  poolProEutFrac: number,
  poolStageProg: number,
  neighborhoodCV: number[]
): BinNormalization {
  const distance = Math.abs(bin.binId - activeBin);
  const role = dominanceRole(bin);
  const total = bin.reserveXUsd + bin.reserveYUsd;
  const xFrac = total > 0 ? bin.reserveXUsd / total : 0.5;
  const rawMargin = (xFrac - 0.5) * 2;
  const signedAsymmetry = matrixRoleGlobal === 1 ? rawMargin : -rawMargin;
  const roleMinorityMargin = r4(signedAsymmetry);

  const inMatrix = role === matrixRoleGlobal ? 1 : 0;
  const inMinority = role === -matrixRoleGlobal ? 1 : 0;

  // Grain boundary detection: adjacent to a role transition.
  const prev = index > 0 ? sortedBins[index - 1] : null;
  const next = index < sortedBins.length - 1 ? sortedBins[index + 1] : null;
  const prevAdjacent = prev && prev.binId === bin.binId - 1;
  const nextAdjacent = next && next.binId === bin.binId + 1;
  const prevRole = prevAdjacent ? dominanceRole(prev) : 0;
  const nextRole = nextAdjacent ? dominanceRole(next) : 0;
  const grainBoundaryPos =
    (role !== 0 && prevRole !== 0 && role !== prevRole) ||
    (role !== 0 && nextRole !== 0 && role !== nextRole)
      ? 1
      : 0;

  // Pro-eutectoid signal: minority bin on the edge of a matrix run
  // (analog of α-ferrite at γ grain boundary for hypoeutectoid).
  let proEutectoidSignal = 0;
  if (inMinority === 1) {
    const hasLongMatrixNeighbor =
      (prevRole === matrixRoleGlobal && matrixRunOfBin.get(prev!.binId)?.length! >= 3) ||
      (nextRole === matrixRoleGlobal && matrixRunOfBin.get(next!.binId)?.length! >= 3);
    if (hasLongMatrixNeighbor) {
      proEutectoidSignal = Math.min(1, poolProEutFrac + 0.3);
    }
  }
  proEutectoidSignal = r4(proEutectoidSignal);

  // Lamellar signal: bin in an identified lamellar region.
  const lamellarSignal = r4(lamellarBinSet.has(bin.binId) ? 1 : 0);

  // Standardization signal: neighborhood reserve CV is low.
  const cvNorm = neighborhoodCV[index] ?? 0;
  const standardizationSignal = r4(Math.max(0, Math.min(1, 1 - cvNorm / 0.8)));

  // Local lambda.
  const lambdaLocal = r2(localLambda(sortedBins, index));

  // Local cooling rate = pool cooling rate with small distance attenuation.
  const coolingRateLocal = r4(Math.max(0, Math.min(1,
    poolCoolingRate * (1 - Math.min(0.3, distance / 100))
  )));

  // Hall-Petch proxy at the bin.
  const hallPetchProxy = r4(hallPetchStrength(lambdaLocal));

  // Stage assignment.
  let stageBin = 0;
  if (poolStageProg < STAGE_1_BOUND) {
    stageBin = 0;
  } else if (lamellarSignal > 0 && standardizationSignal > 0.7 && poolStageProg > STAGE_5_BOUND) {
    stageBin = 5;
  } else if (lamellarSignal > 0 && poolStageProg > STAGE_4_BOUND) {
    stageBin = 4;
  } else if (lamellarSignal > 0) {
    stageBin = 3;
  } else if (poolStageProg > STAGE_3_BOUND && inMinority === 1 && grainBoundaryPos === 0) {
    stageBin = 2;
  } else if (proEutectoidSignal > 0.3) {
    stageBin = 1;
  } else {
    stageBin = 0;
  }

  // Non-uniform stage 6: large grain with high grain-size CV globally.
  // Handled at pool level; bin inherits if grain membership is atypical.

  const jmaProgress = r4(jmaTransformed(poolDriving, poolArrhenius));
  const arrheniusActivation = r4(poolArrhenius);

  const normalizationDegree = r4(Math.max(0, Math.min(1,
    lamellarSignal * 0.3 +
    standardizationSignal * 0.25 +
    proEutectoidSignal * 0.15 +
    hallPetchProxy * 0.15 +
    (stageBin / 5) * 0.15
  )));

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    proEutectoidSignal,
    lamellarSignal,
    standardizationSignal,
    grainBoundaryPos,
    lambdaLocal,
    coolingRateLocal,
    hallPetchProxy,
    proEutectoidFraction: r4(poolProEutFrac),
    stageBin,
    jmaProgress,
    arrheniusActivation,
    inMatrix,
    inMinority,
    matrixRole: matrixRoleGlobal,
    roleMinorityMargin,
    normalizationDegree,
  };
}

function analyzeNormalization(bins: BinReserves[], pool: AppPool): NormalizationProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;

  const turnover = pool.tvlUsd > 0 ? volume / pool.tvlUsd : 0;
  const drivingForce = Math.min(1, turnover * 0.8 + 0.1);

  // Prior peak: amplified turnover proxy — assume recent activity
  // has been at 1.3× current plus a volume-baseline.
  const priorPeakDrivingForce = Math.min(1, drivingForce * 1.3 + 0.15);

  // Cooling rate analog: drop from prior peak to now, divided by a
  // log-volume timescale (larger pools have slower perceived cooling).
  const dropMagnitude = Math.max(0, priorPeakDrivingForce - drivingForce);
  const tScale = Math.max(0.3, Math.log10(Math.max(10, volume)) / 5);
  const coolingRate = Math.max(0, Math.min(1, dropMagnitude / Math.max(0.01, tScale) * 2));
  const coolingRegime = coolingRegimeOf(coolingRate);

  const arrheniusActivation = Math.max(0.01, Math.min(1,
    Math.exp(-ARRHENIUS_Q_OVER_RT / Math.max(0.05, coolingRate + 0.05))
  ));

  const jmaProg = jmaTransformed(drivingForce, arrheniusActivation);

  // Skew & roles.
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

  // Matrix runs (grains).
  const matrixRuns = findRoleRuns(sorted, matrixRole);
  const matrixRunOfBin = new Map<number, BinReserves[]>();
  for (const run of matrixRuns) {
    for (const b of run) matrixRunOfBin.set(b.binId, run);
  }
  const grainLens = matrixRuns.map((r) => r.length);
  const grainSize = grainLens.length > 0
    ? grainLens.reduce((s, v) => s + v, 0) / grainLens.length
    : 0;
  const maxGrainSize = grainLens.length > 0 ? Math.max(...grainLens) : 0;
  const grainMean = grainSize;
  const grainVar = grainLens.length > 1 && grainMean > 0
    ? grainLens.reduce((s, v) => s + (v - grainMean) ** 2, 0) / grainLens.length
    : 0;
  const grainSizeCV = grainMean > 0 ? Math.sqrt(grainVar) / grainMean : 0;

  // Minority clusters.
  const minorityRuns = findRoleRuns(sorted, minorityRole);
  const minorityClusterOfBin = new Map<number, BinReserves[]>();
  for (const run of minorityRuns) {
    for (const b of run) minorityClusterOfBin.set(b.binId, run);
  }
  const totalMinorityBins = minorityRuns.reduce((s, r) => s + r.length, 0);
  const minorityFraction = n > 0 ? totalMinorityBins / n : 0;

  // Reserves CV.
  const totalMean = n > 0 ? totalUsd / n : 0;
  const totalVar = n > 1 && totalMean > 0
    ? sorted.reduce((s, b) => s + (b.totalUsd - totalMean) ** 2, 0) / n
    : 0;
  const reserveCV = totalMean > 0 ? Math.sqrt(totalVar) / totalMean : 0;

  const xFracs = sorted.map((b) => xFracOf(b));
  const xFracMean = xFracs.length > 0 ? xFracs.reduce((s, v) => s + v, 0) / xFracs.length : 0.5;
  const xFracVar = xFracs.length > 1
    ? xFracs.reduce((s, v) => s + (v - xFracMean) ** 2, 0) / xFracs.length
    : 0;
  const reserveXFracStdev = Math.sqrt(xFracVar);

  // Lamellar analysis.
  const lamellarAlternationCount = countRoleTransitions(sorted);
  const lamellarBinSet = identifyLamellarBins(sorted);
  const lamellarRunFraction = n > 0 ? lamellarBinSet.size / n : 0;

  // Lambda estimate: average local lambda over populated bins.
  const localLambdas = sorted.map((_, i) => localLambda(sorted, i));
  const lambdaEstimate = localLambdas.length > 0
    ? localLambdas.reduce((s, v) => s + v, 0) / localLambdas.length
    : COARSE_PEARLITE_SPACING;

  // Neighborhood CV for standardization signal.
  const neighborhoodCV: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const lo = Math.max(0, i - 2);
    const hi = Math.min(sorted.length, i + 3);
    const window = sorted.slice(lo, hi);
    const mean = window.reduce((s, b) => s + b.totalUsd, 0) / window.length;
    const v = mean > 0
      ? Math.sqrt(window.reduce((s, b) => s + (b.totalUsd - mean) ** 2, 0) / window.length) / mean
      : 0;
    neighborhoodCV.push(v);
  }

  // Pro-eutectoid fraction.
  const proEutFrac = proEutectoidFraction(hypoeutectoidSkew);

  // Standardization index: low reserveCV + low grainSizeCV + lamellar fraction.
  const standardizationIndex = Math.max(0, Math.min(1,
    (1 - Math.min(1, reserveCV / 0.8)) * 0.35 +
    (1 - Math.min(1, grainSizeCV / 0.8)) * 0.35 +
    lamellarRunFraction * 0.3
  ));

  // Hall-Petch derived strength and hardness.
  const hpStrength = hallPetchStrength(lambdaEstimate);
  const hpHardness = r4(Math.min(1, hpStrength * 0.9));
  const ductilityProxy = r4(Math.max(0, Math.min(1, 1 - hpStrength * 0.6)));
  const astm = astmGrainSize(grainSize);

  // Stage progress: weighted composite of cooling, lamellar, pro-eut, uniform.
  const stageProgress = Math.max(0, Math.min(1,
    Math.min(1, coolingRate) * 0.2 +
    lamellarRunFraction * 0.3 +
    (1 - Math.min(1, drivingForce / Math.max(0.1, priorPeakDrivingForce))) * 0.15 +
    standardizationIndex * 0.2 +
    proEutFrac * 0.1 +
    (ac1Crossed ? 0 : 0.05)   // being sub-AC1 = cool finished
  ));

  // Dominant stage 0-6.
  let dominantStage = 0;
  if (grainSizeCV > 0.8 && lamellarAlternationCount >= MIN_LAMELLAR_ALTERNATIONS) {
    dominantStage = 6; // non-uniform
  } else if (stageProgress >= STAGE_5_BOUND) {
    dominantStage = 5;
  } else if (stageProgress >= STAGE_4_BOUND) {
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

  // Uniformity risk.
  const uniformityRisk = Math.max(0, Math.min(1,
    grainSizeCV / Math.max(0.01, UNIFORM_GRAIN_CV) - 0.5
  ));
  const overNormalizationRisk = Math.max(0, Math.min(1,
    (grainSize > 8 ? 0.5 : 0) + (grainSizeCV > 0.6 ? 0.5 : 0)
  ));

  // Per-bin analysis.
  const binRecs = sorted.map((b, i) =>
    computeBinNormalization(
      b, i, activeBin, sorted, matrixRole,
      matrixRunOfBin, minorityClusterOfBin, lamellarBinSet,
      drivingForce, arrheniusActivation, coolingRate, proEutFrac,
      stageProgress, neighborhoodCV
    )
  );

  const stageDistribution = [0, 0, 0, 0, 0, 0, 0];
  for (const b of binRecs) {
    stageDistribution[Math.min(6, Math.max(0, b.stageBin))]++;
  }

  const xMatrixCount = sorted.filter((b) => dominanceRole(b) === 1).length;
  const yMatrixCount = sorted.filter((b) => dominanceRole(b) === -1).length;
  const minorityRoleCount = sorted.filter((b) => dominanceRole(b) === minorityRole).length;

  // Composite normalization index 0-100.
  const stageScore = Math.min(25, stageProgress * 25);
  const standardizationScore = Math.min(25, standardizationIndex * 25);
  const propertyScore = Math.min(25, hpStrength * 15 + astm * 10 / 12);
  const structureScore = Math.min(25,
    lamellarRunFraction * 12 +
    proEutFrac * 6 +
    (coolingRegime === "AIR" ? 7 : coolingRegime === "OIL" ? 4 : coolingRegime === "FURNACE" ? 3 : 2)
  );
  const normalizationIndex = Math.round(
    Math.min(100, stageScore + standardizationScore + propertyScore + structureScore)
  );

  // Regime classification.
  let normalizationRegime: string;
  if (priorPeakDrivingForce < AC1_ACTIVITY) {
    normalizationRegime = "NO_NORMALIZATION_DRIVE";
  } else if (ac3Crossed === 1 && stageProgress < STAGE_1_BOUND) {
    normalizationRegime = "AUSTENITIC_HOLD";
  } else if (grainSizeCV > 0.8 && lamellarAlternationCount >= MIN_LAMELLAR_ALTERNATIONS) {
    normalizationRegime = "NON_UNIFORM";
  } else if (stageProgress >= STAGE_5_BOUND && standardizationIndex > 0.7) {
    normalizationRegime = "STANDARDIZED";
  } else if (lamellarRunFraction > 0.4 && stageProgress >= STAGE_4_BOUND) {
    normalizationRegime = "FINE_PEARLITE";
  } else if (lamellarRunFraction > 0.2 && stageProgress >= STAGE_3_BOUND) {
    normalizationRegime = "PEARLITE_GROWTH";
  } else if (lamellarAlternationCount >= MIN_LAMELLAR_ALTERNATIONS && stageProgress >= STAGE_2_BOUND) {
    normalizationRegime = "PEARLITE_NUCLEATION";
  } else if (proEutFrac > 0.2 && stageProgress >= STAGE_1_BOUND) {
    normalizationRegime = "PRO_EUTECTOID_FORMATION";
  } else if (ac3Crossed === 1) {
    normalizationRegime = "AUSTENITIC_HOLD";
  } else {
    normalizationRegime = "NO_NORMALIZATION_DRIVE";
  }

  // Verdict.
  let normalizationVerdict: string;
  if (priorPeakDrivingForce < AC1_ACTIVITY) {
    normalizationVerdict = "NO_NORMALIZATION_DRIVE";
  } else if (overNormalizationRisk > 0.7) {
    normalizationVerdict = "NON_UNIFORM";
  } else if (normalizationRegime === "STANDARDIZED") {
    normalizationVerdict = "STANDARDIZED";
  } else if (normalizationRegime === "FINE_PEARLITE") {
    normalizationVerdict = "FINE_PEARLITE";
  } else if (normalizationRegime === "PEARLITE_GROWTH") {
    normalizationVerdict = "PEARLITE_GROWTH";
  } else if (normalizationRegime === "PEARLITE_NUCLEATION") {
    normalizationVerdict = "PEARLITE_NUCLEATION";
  } else if (normalizationRegime === "PRO_EUTECTOID_FORMATION") {
    normalizationVerdict = "PRO_EUTECTOID_FORMATION";
  } else if (normalizationRegime === "AUSTENITIC_HOLD") {
    normalizationVerdict = "AUSTENITIC_HOLD";
  } else {
    normalizationVerdict = "INTERMEDIATE_NORMALIZATION";
  }

  const topBins = [...binRecs]
    .sort((a, b) => b.normalizationDegree - a.normalizationDegree)
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
    priorPeakDrivingForce: r4(priorPeakDrivingForce),
    coolingRate: r4(coolingRate),
    coolingRegime,
    arrheniusActivation: r4(arrheniusActivation),
    jmaProgress: r4(jmaProg),
    minorityFraction: r4(minorityFraction),
    hypoeutectoidSkew,
    ac1Activity: r4(AC1_ACTIVITY),
    ac3Activity: r4(ac3Act),
    ac1Crossed,
    ac3Crossed,
    lamellarAlternationCount,
    lamellarRunFraction: r4(lamellarRunFraction),
    proEutectoidFraction: r4(proEutFrac),
    grainSize: r2(grainSize),
    maxGrainSize,
    grainSizeCV: r4(grainSizeCV),
    reserveCV: r4(reserveCV),
    lambdaEstimate: r2(lambdaEstimate),
    hallPetchStrength: r4(hpStrength),
    hallPetchHardness: hpHardness,
    ductilityProxy,
    astmGrainSize: astm,
    stageProgress: r4(stageProgress),
    dominantStage,
    matrixGrainCount: matrixRuns.length,
    minorityClusterCount: minorityRuns.length,
    reserveXFracStdev: r4(reserveXFracStdev),
    standardizationIndex: r4(standardizationIndex),
    uniformityRisk: r4(uniformityRisk),
    overNormalizationRisk: r4(overNormalizationRisk),
    eutectoidWindow,
    xMatrixCount,
    yMatrixCount,
    minorityRoleCount,
    normalizationIndex,
    normalizationRegime,
    normalizationVerdict,
    stageDistribution,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Normalization — Doctor ===\n");
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

  const profiles: NormalizationProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeNormalization(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgNormalizationIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.normalizationIndex)))
      : 0,
    avgDrivingForce: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.drivingForce)))
      : 0,
    avgCoolingRate: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.coolingRate)))
      : 0,
    noDriveCount:             profiles.filter((p) => p.normalizationRegime === "NO_NORMALIZATION_DRIVE").length,
    austeniticHoldCount:      profiles.filter((p) => p.normalizationRegime === "AUSTENITIC_HOLD").length,
    proEutectoidCount:        profiles.filter((p) => p.normalizationRegime === "PRO_EUTECTOID_FORMATION").length,
    pearliteNucleationCount:  profiles.filter((p) => p.normalizationRegime === "PEARLITE_NUCLEATION").length,
    pearliteGrowthCount:      profiles.filter((p) => p.normalizationRegime === "PEARLITE_GROWTH").length,
    finePearliteCount:        profiles.filter((p) => p.normalizationRegime === "FINE_PEARLITE").length,
    standardizedCount:        profiles.filter((p) => p.normalizationRegime === "STANDARDIZED").length,
    nonUniformCount:          profiles.filter((p) => p.normalizationRegime === "NON_UNIFORM").length,
    furnaceCoolCount:         profiles.filter((p) => p.coolingRegime === "FURNACE").length,
    airCoolCount:             profiles.filter((p) => p.coolingRegime === "AIR").length,
    oilCoolCount:             profiles.filter((p) => p.coolingRegime === "OIL").length,
    waterCoolCount:           profiles.filter((p) => p.coolingRegime === "WATER").length,
    avgStageProgress: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.stageProgress)))
      : 0,
    avgStandardizationIndex: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.standardizationIndex)))
      : 0,
    avgLamellarRunFraction: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.lamellarRunFraction)))
      : 0,
    avgProEutectoidFraction: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.proEutectoidFraction)))
      : 0,
    avgGrainSize: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.grainSize)))
      : 0,
    avgGrainSizeCV: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.grainSizeCV)))
      : 0,
    avgLambdaEstimate: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.lambdaEstimate)))
      : 0,
    avgHallPetchStrength: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.hallPetchStrength)))
      : 0,
    avgAstmGrainSize: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.astmGrainSize)))
      : 0,
    avgJmaProgress: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.jmaProgress)))
      : 0,
    avgReserveCV: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.reserveCV)))
      : 0,
    avgUniformityRisk: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.uniformityRisk)))
      : 0,
    totalMatrixGrains: profiles.reduce((s, p) => s + p.matrixGrainCount, 0),
    totalMinorityClusters: profiles.reduce((s, p) => s + p.minorityClusterCount, 0),
    totalLamellarAlternations: profiles.reduce((s, p) => s + p.lamellarAlternationCount, 0),
    ac1CrossedCount: profiles.filter((p) => p.ac1Crossed === 1).length,
    ac3CrossedCount: profiles.filter((p) => p.ac3Crossed === 1).length,
    eutectoidWindowCount: profiles.filter((p) => p.eutectoidWindow === 1).length,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-normalization").description("HODLMM bin normalization / air-cool heat-treatment analyzer (pro-eutectoid formation, pearlite nucleation/growth, fine-pearlite lamellar pattern, Hall-Petch strengthening, grain-size standardization)");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin normalization state")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
