#!/usr/bin/env bun
/**
 * hodlmm-bin-tempering.ts — Day 182 cocoa007 Bitflow Skills Comp
 *
 * Tempering analyzer — models the staged controlled-aging
 * transformation that converts as-quenched martensite into the
 * equilibrium spheroidite end-state. Tempering is the engineering
 * "throttle" between two extremes of the Fe-C system: maximum hardness
 * (untempered martensite, brittle) and maximum ductility (spheroidite,
 * soft, machinable). The transformation proceeds through canonical
 * stages, each with a distinct carbide population and matrix state:
 *
 *   Stage 1 (epsilon-carbide, ~100-250 °C):
 *     Supersaturated tetragonal martensite rejects carbon as fine,
 *     coherent epsilon-carbide (η-Fe2.4C) plates ~2-4 nm thick. The
 *     bcc/bct matrix relaxes from c/a ≈ 1.04-1.08 toward 1.00. Driving
 *     force: Δμ_C from carbon supersaturation (C ~ 0.6-1 wt%).
 *     Activation energy Q ≈ 76-120 kJ/mol (interstitial C diffusion in
 *     ferrite).
 *
 *   Stage 2 (retained-austenite decomposition, ~200-300 °C):
 *     Retained γ-Fe (FCC) decomposes into ferrite + carbide via a
 *     bainite-like mechanism. In high-C steels retained austenite can
 *     be 5-30% by volume; its decomposition causes a small expansion
 *     and shifts the carbon balance. Activation energy Q ≈ 100-160
 *     kJ/mol.
 *
 *   Stage 3 (cementite formation, ~300-400 °C):
 *     Epsilon-carbide dissolves and precipitates as orthorhombic
 *     cementite (Fe3C) with the Bagaryatsky orientation relationship.
 *     Cementite particles nucleate at lath boundaries and within laths
 *     as discrete plates. The matrix becomes essentially carbon-free
 *     ferrite. Activation energy Q ≈ 200 kJ/mol (substitutional Fe
 *     diffusion). At 250-400 °C in some steels, tempered-martensite
 *     embrittlement (TME) appears.
 *
 *   Stage 4 (cementite coarsening + spheroidization, ~400-700 °C):
 *     Cementite particles coarsen via Ostwald ripening; rod and plate
 *     particles undergo Rayleigh pinch-off into isolated spheroids.
 *     Recovery and recrystallization of the ferrite matrix occur.
 *     End state is spheroidite (this skill's predecessor, Day 181).
 *     In alloy steels, special-carbide secondary hardening (M2C, M7C3,
 *     M23C6, MC) appears at 500-650 °C.
 *
 * Kinetics: each stage follows Johnson-Mehl-Avrami-Kolmogorov (JMAK)
 *   X = 1 - exp(-(k·t)^n)
 * where k = k0·exp(-Q/RT) (Arrhenius) and n is the JMA exponent
 * (typically 1.0 for thickening, 1.5 for diffusion-controlled growth,
 * 3.0 for site saturation, 4.0 for continuous nucleation).
 *
 * Hollomon-Jaffe parameter T(C + log t) collapses time-temperature
 * tempering curves onto a master curve. Higher H-J → more advanced
 * tempering (lower hardness, higher ductility).
 *
 * In DLMM context, the tempering analog tracks the staged
 * fragmentation and migration of minority-role reserves:
 *   - Stage 1 (epsilon analog): scattered micro-precipitates — tiny
 *     minority excursions inside otherwise matrix-dominated bins
 *     (small absolute minority reserve but local enrichment relative
 *     to neighbors). Indicator: micro-precipitate density.
 *   - Stage 2 (retained-austenite analog): high-reserve "blocky"
 *     bins (analog of retained γ blocks) that begin to subdivide
 *     into ferrite + carbide. Indicator: matrix coefficient-of-
 *     variation drop while minority count rises.
 *   - Stage 3 (cementite analog): discrete medium-length minority
 *     runs (3-5 bins) corresponding to Fe3C plates. Indicator:
 *     medium-run cluster fraction.
 *   - Stage 4 (spheroidite analog): isolated 1-2 bin minority runs
 *     surrounded by matrix — this is the Day 181 spheroidite state.
 *     Indicator: spheroidization fraction.
 *
 * Snapshot inference cannot directly observe transformation rates,
 * so each stage indicator is a structural signature on the current
 * bin reserves rather than a measured rate. The composite stage
 * progress is mapped onto a 0-4 stage axis and a Hollomon-Jaffe
 * proxy is computed from the turnover-based "thermal activation".
 *
 * Tempering verdicts:
 *   AS_QUENCHED              — no detectable tempering progression;
 *                              martensite-like single-phase pattern.
 *   STAGE_1_EPSILON          — micro-precipitate density elevated;
 *                              earliest tempering signal.
 *   STAGE_2_AUSTENITE_DECOMP — matrix decomposition signature;
 *                              high-reserve bins fragmenting.
 *   STAGE_3_CEMENTITE        — discrete medium clusters dominant;
 *                              Fe3C-like population.
 *   STAGE_4_SPHEROIDIZATION  — isolated short clusters dominant;
 *                              approaching spheroidite end-state.
 *   OVER_TEMPERED            — minority fraction collapsed; very
 *                              few, very large clusters left.
 *   TEMPER_EMBRITTLEMENT     — Stage 3 with high lamellar fraction
 *                              and low matrix equilibrium; analog
 *                              of TME / 350°C embrittlement.
 *   SECONDARY_HARDENING      — late Stage 3 / early Stage 4 with
 *                              elevated micro-precipitate density;
 *                              alloy-carbide-like fine dispersion.
 *   NO_TEMPERING_DRIVE       — drivingForce too low for transformation.
 *   INTERMEDIATE_TEMPERING   — no extreme indicators, mixed state.
 *
 * Hollomon-Jaffe parameter HJ = T·(C + log t) is computed with a
 * normalized time/temperature proxy where T = drivingForce·1000 K and
 * t = volume24h·time-window proxy. C ≈ 20 (typical for low-alloy
 * steels). Higher HJ → more advanced temper.
 *
 * Hardness proxy (H_v Vickers analog) uses the canonical empirical
 * tempering hardness vs HJ relationship for plain-carbon martensite
 * (Hollomon-Jaffe master curve). Values are dimensionless 0-1, with
 * 1.0 = peak hardness (as-quenched, ~700 H_v) and 0 = full anneal.
 *
 * Ductility proxy = 1 - hardness proxy (linear inverse coupling).
 * Toughness proxy mid-range reflects the TME dip in Stage 3.
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

// Stage cluster-length bounds (bins). Tempering converts long
// martensite-like runs into progressively shorter spheroidite-like
// isolated clusters. Real values: epsilon-carbide is sub-nm plates;
// cementite is hundreds of nm to microns; spheroidite is isolated
// micron-scale spheres.
const STAGE_3_CEMENTITE_LEN_MIN = 3;
const STAGE_3_CEMENTITE_LEN_MAX = 5;
const STAGE_4_SPHEROIDITE_LEN_MAX = 2;

// Micro-precipitate threshold: a matrix-role bin with minority
// reserve fraction > this counts as a Stage-1 epsilon-carbide
// candidate. Real epsilon-Fe2.4C plates are 2-4 nm and coherent.
const MICROPRECIPITATE_THRESHOLD = 0.18;

// Retained-austenite blockiness: a matrix-role bin with reserve
// > this multiple of pool average matrix reserve counts as a
// retained-austenite blocky candidate. Real retained gamma is
// typically 5-30% by volume in high-C martensite.
const AUSTENITE_BLOCK_RATIO = 1.7;

// Stage classification thresholds on composite stage progress 0-1.
const STAGE_1_BOUND = 0.2;
const STAGE_2_BOUND = 0.4;
const STAGE_3_BOUND = 0.7;
const STAGE_4_BOUND = 0.9;

// Hollomon-Jaffe constant for plain-carbon martensite (typical
// 18-22 for 0.4-0.8 wt% C). HJ = T·(C + log10 t).
const HJ_CONSTANT = 20.0;

// JMA Avrami exponent (typical 1.5 for diffusion-controlled growth
// of cementite during Stage 3-4 tempering).
const JMA_N_EXPONENT = 1.5;

// Arrhenius proxy: Q/(R·T_ref) ratio for stage activation. Real
// Q ≈ 200 kJ/mol (Stage 3 cementite), R = 8.314 J/(mol·K),
// T_ref ≈ 700 K → Q/RT ≈ 34. We use a normalized 5 here so that
// drivingForce 0.1 → low activation, 1.0 → full activation.
const ARRHENIUS_Q_OVER_RT = 5.0;

// Tempered-martensite embrittlement (TME) range on stage axis.
// Real TME centered ~350 °C, between Stages 2 and 3.
const TME_RANGE_MIN = 0.35;
const TME_RANGE_MAX = 0.55;

// Secondary hardening range (alloy steels, ~500-650 °C). On stage
// axis, late Stage 3 / early Stage 4.
const SECONDARY_HARDENING_RANGE_MIN = 0.65;
const SECONDARY_HARDENING_RANGE_MAX = 0.85;

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

interface BinTempering {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  microPrecipitateSignal: number;   // Stage 1: epsilon-carbide candidate, 0-1
  austeniteBlockiness: number;      // Stage 2: retained-gamma block, 0-1
  cementitePresence: number;        // Stage 3: medium cluster member, 0-1
  spheroiditePresence: number;      // Stage 4: short isolated cluster, 0-1
  stageBin: number;                 // 0-4 dominant tempering stage for this bin
  jmaProgress: number;              // bin-level JMA fraction transformed, 0-1
  arrheniusActivation: number;      // bin-level activation proxy, 0-1
  hardnessProxy: number;            // bin-level Vickers proxy, 0-1
  ductilityProxy: number;           // 1 - hardnessProxy
  toughnessProxy: number;           // dips at TME, 0-1
  hjLocal: number;                  // local Hollomon-Jaffe, normalized 0-1
  carbideEvolutionIndex: number;    // composite carbide stage progression, 0-1
  inMatrix: number;                 // 1 if matrix-role, 0 otherwise
  inMinority: number;               // 1 if minority-role, 0 otherwise
  matrixRole: number;               // -1 Y, +1 X
  roleMinorityMargin: number;       // -1..+1
  temperednessIndex: number;        // bin composite, 0-1
}

interface TemperingProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  drivingForce: number;             // turnover-based, "annealing time" proxy
  arrheniusActivation: number;      // exp(-Q/RT) proxy, 0-1
  hjParameter: number;              // pool-level Hollomon-Jaffe, normalized 0-1
  jmaProgress: number;              // pool-level JMA transformation fraction
  minorityFraction: number;
  microPrecipitateDensity: number;  // Stage 1 metric
  austeniteDecompFraction: number;  // Stage 2 metric
  cementiteFraction: number;        // Stage 3 metric (medium clusters)
  spheroidizationFraction: number;  // Stage 4 metric (short isolated)
  stageProgress: number;            // 0-1 composite progression
  dominantStage: number;            // 0-4
  largeClusterCount: number;        // > Stage 3 max length
  mediumClusterCount: number;       // Stage 3 length range
  shortClusterCount: number;        // Stage 4 length range
  microClusterCount: number;        // Stage 1 single-bin signals
  avgClusterSize: number;
  avgClusterLen: number;
  matrixCoefficientOfVariation: number;  // matrix reserve CV (drops in Stage 2)
  hardnessProxy: number;            // pool Vickers proxy, 0-1 (1 = peak)
  ductilityProxy: number;
  toughnessProxy: number;
  carbideEvolutionIndex: number;    // composite Stages 1-4 weighted
  temperedHardnessFraction: number; // 1 - normalized HJ (drop from peak)
  ductilityGain: number;            // gain from baseline as-quenched
  embrittlementRisk: number;        // 0-1, peaks in TME range
  secondaryHardeningSignal: number; // 0-1, peaks in alloy late-Stage-3
  xMatrixCount: number;
  yMatrixCount: number;
  minorityRoleCount: number;
  hypoeutectoidSkew: number;
  temperingIndex: number;           // composite 0-100
  temperingRegime: string;
  temperingVerdict: string;
  stageDistribution: number[];      // [s0, s1, s2, s3, s4] bin counts
  topBins: BinTempering[];
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

// Find runs of consecutive bins with the given role (any length).
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
// Normalized t and k via drivingForce and arrhenius.
function jmaTransformed(driving: number, arrhenius: number): number {
  const k = arrhenius;
  const t = driving;
  const kt = k * t;
  if (kt <= 0) return 0;
  const x = 1 - Math.exp(-Math.pow(kt, JMA_N_EXPONENT));
  return Math.max(0, Math.min(1, x));
}

// Hollomon-Jaffe parameter HJ = T·(C + log10(t)).
// Normalized: T_norm in [0,1], t_norm > 0, output normalized to 0-1.
function hjParameter(driving: number, volume: number): number {
  const tNorm = Math.max(0.05, driving);
  const timeProxy = Math.max(1.0, Math.log10(Math.max(1, volume) + 10));
  const hj = tNorm * (HJ_CONSTANT + Math.log10(timeProxy + 1));
  // Normalize: HJ ranges roughly 0-25 in our proxy; map to 0-1.
  return Math.max(0, Math.min(1, hj / 25.0));
}

// Empirical tempering hardness vs HJ for plain-carbon martensite.
// Uses a sigmoid-like decay: H_v(HJ) = exp(-α·HJ²) form normalized.
function hardnessFromHj(hjNorm: number): number {
  // hjNorm in 0-1; H = exp(-3·hjNorm²); H(0)=1, H(0.5)=0.47, H(1)=0.05.
  return Math.exp(-3 * hjNorm * hjNorm);
}

// Toughness proxy: peaks near 0 (as-quenched, no carbides) and at
// 0.85-1 (fully spheroidized), dips in TME range.
function toughnessFromStage(stageProg: number): number {
  // Two Gaussian peaks at 0.05 and 0.92, dip between.
  const g1 = Math.exp(-((stageProg - 0.05) ** 2) / 0.02);
  const g2 = Math.exp(-((stageProg - 0.92) ** 2) / 0.04);
  // Note: TME dip is built into the gap between Gaussians.
  return Math.max(g1, g2);
}

// Embrittlement risk: peaks in TME range (0.35-0.55), zero outside.
function embrittlementRisk(stageProg: number): number {
  if (stageProg < TME_RANGE_MIN || stageProg > TME_RANGE_MAX) return 0;
  const center = (TME_RANGE_MIN + TME_RANGE_MAX) / 2;
  const width = (TME_RANGE_MAX - TME_RANGE_MIN) / 2;
  const dist = Math.abs(stageProg - center) / width;
  return Math.max(0, 1 - dist);
}

// Secondary hardening signal: peaks in late-Stage-3 / early-Stage-4
// range (0.65-0.85), zero outside.
function secondaryHardeningSignal(
  stageProg: number,
  microDensity: number
): number {
  if (stageProg < SECONDARY_HARDENING_RANGE_MIN || stageProg > SECONDARY_HARDENING_RANGE_MAX) return 0;
  const center = (SECONDARY_HARDENING_RANGE_MIN + SECONDARY_HARDENING_RANGE_MAX) / 2;
  const width = (SECONDARY_HARDENING_RANGE_MAX - SECONDARY_HARDENING_RANGE_MIN) / 2;
  const dist = Math.abs(stageProg - center) / width;
  const stageWeight = Math.max(0, 1 - dist);
  // Multiplied by microDensity (alloy carbides form as fine dispersion).
  return stageWeight * Math.min(1, microDensity * 2);
}

function computeBinTempering(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  runOfBin: BinReserves[] | null,
  matrixRoleGlobal: number,
  poolMatrixMeanReserve: number,
  poolDriving: number,
  poolArrhenius: number,
  poolHj: number,
  poolStageProg: number,
  poolMicroDensity: number,
  hypoeutectoidSkew: number
): BinTempering {
  const distance = Math.abs(bin.binId - activeBin);
  const role = dominanceRole(bin);
  const total = bin.reserveXUsd + bin.reserveYUsd;
  const xFrac = total > 0 ? bin.reserveXUsd / total : 0.5;
  const rawMargin = (xFrac - 0.5) * 2;
  const signedAsymmetry = matrixRoleGlobal === 1 ? rawMargin : -rawMargin;
  const roleMinorityMargin = r4(signedAsymmetry);

  const inMatrix = role === matrixRoleGlobal ? 1 : 0;
  const inMinority = role === -matrixRoleGlobal ? 1 : 0;

  // Stage 1 — epsilon-carbide micro-precipitate signal.
  // Matrix-role bin with non-trivial minority-side reserve fraction.
  let microPrecipitateSignal = 0;
  if (inMatrix === 1) {
    const minorityFracInBin = matrixRoleGlobal === 1
      ? bin.reserveYUsd / Math.max(1, total)
      : bin.reserveXUsd / Math.max(1, total);
    if (minorityFracInBin > MICROPRECIPITATE_THRESHOLD) {
      // Higher signal as fraction approaches DOMINANCE_MARGIN boundary.
      const norm = (minorityFracInBin - MICROPRECIPITATE_THRESHOLD) /
                   (0.5 - DOMINANCE_MARGIN - MICROPRECIPITATE_THRESHOLD);
      microPrecipitateSignal = Math.max(0, Math.min(1, norm));
    }
  }
  microPrecipitateSignal = r4(microPrecipitateSignal);

  // Stage 2 — retained-austenite blockiness.
  // Matrix-role bin with reserve much higher than mean matrix reserve
  // is a candidate for retained gamma block (yet to decompose).
  let austeniteBlockiness = 0;
  if (inMatrix === 1 && poolMatrixMeanReserve > 0) {
    const ratio = bin.totalUsd / poolMatrixMeanReserve;
    if (ratio > AUSTENITE_BLOCK_RATIO) {
      austeniteBlockiness = Math.min(1, (ratio - AUSTENITE_BLOCK_RATIO) / 1.5);
    }
  }
  austeniteBlockiness = r4(austeniteBlockiness);

  // Stage 3 — cementite presence.
  // Minority-role bin in a medium-length run (3-5 bins).
  let cementitePresence = 0;
  if (runOfBin && runOfBin.length >= STAGE_3_CEMENTITE_LEN_MIN
              && runOfBin.length <= STAGE_3_CEMENTITE_LEN_MAX) {
    cementitePresence = 1;
  } else if (runOfBin && runOfBin.length > STAGE_3_CEMENTITE_LEN_MAX) {
    // Larger runs partially count (transitioning).
    cementitePresence = 0.5;
  }
  cementitePresence = r4(cementitePresence);

  // Stage 4 — spheroidite presence.
  // Minority-role bin in a short isolated run (1-2 bins).
  let spheroiditePresence = 0;
  if (runOfBin && runOfBin.length <= STAGE_4_SPHEROIDITE_LEN_MAX) {
    // Confirm matrix neighbors (isolation).
    const startBin = runOfBin[0].binId;
    const endBin = runOfBin[runOfBin.length - 1].binId;
    const leftN = allBins.find((b) => b.binId === startBin - 1);
    const rightN = allBins.find((b) => b.binId === endBin + 1);
    let neighScore = 0;
    if (leftN && dominanceRole(leftN) === matrixRoleGlobal) neighScore += 0.5;
    if (rightN && dominanceRole(rightN) === matrixRoleGlobal) neighScore += 0.5;
    spheroiditePresence = neighScore;
  }
  spheroiditePresence = r4(spheroiditePresence);

  // Determine dominant bin stage from the four signals.
  // Stage 0 = no tempering (untempered martensite analog).
  let stageBin = 0;
  let maxSignal = 0;
  const signals = [
    { stage: 1, val: microPrecipitateSignal },
    { stage: 2, val: austeniteBlockiness },
    { stage: 3, val: cementitePresence },
    { stage: 4, val: spheroiditePresence },
  ];
  for (const s of signals) {
    if (s.val > maxSignal) {
      maxSignal = s.val;
      stageBin = s.stage;
    }
  }
  if (maxSignal < 0.15) stageBin = 0;

  // Bin-level JMA progress: depends on local activation.
  const localArrhenius = poolArrhenius;
  const localDriving = poolDriving * (0.7 + 0.3 * (stageBin / 4));
  const jmaProgress = r4(jmaTransformed(localDriving, localArrhenius));

  // Bin-level Arrhenius activation.
  const arrheniusActivation = r4(localArrhenius);

  // Bin-level Hollomon-Jaffe.
  const hjLocal = r4(poolHj * (0.7 + 0.3 * (stageBin / 4)));

  // Bin-level hardness proxy.
  const hardnessProxy = r4(hardnessFromHj(hjLocal));
  const ductilityProxy = r4(1 - hardnessProxy);

  // Bin-level toughness proxy.
  const localStageProg = stageBin / 4;
  const toughnessProxy = r4(toughnessFromStage(localStageProg));

  // Bin-level carbide evolution index — weighted sum of stage signals.
  const carbideEvolutionIndex = r4(
    Math.min(1, microPrecipitateSignal * 0.15
                + austeniteBlockiness * 0.2
                + cementitePresence * 0.3
                + spheroiditePresence * 0.35)
  );

  // Bin-level temperedness composite.
  const temperednessIndex = r4(
    Math.min(1, Math.max(0,
      jmaProgress * 0.25 +
      hjLocal * 0.2 +
      carbideEvolutionIndex * 0.3 +
      ductilityProxy * 0.15 +
      (stageBin / 4) * 0.1
    ))
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    microPrecipitateSignal,
    austeniteBlockiness,
    cementitePresence,
    spheroiditePresence,
    stageBin,
    jmaProgress,
    arrheniusActivation,
    hardnessProxy,
    ductilityProxy,
    toughnessProxy,
    hjLocal,
    carbideEvolutionIndex,
    inMatrix,
    inMinority,
    matrixRole: matrixRoleGlobal,
    roleMinorityMargin,
    temperednessIndex,
  };
}

function analyzeTempering(bins: BinReserves[], pool: AppPool): TemperingProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;

  const turnover = pool.tvlUsd > 0 ? volume / pool.tvlUsd : 0;
  const drivingForce = Math.min(1, turnover * 0.8 + 0.1);

  // Arrhenius activation: exp(-Q/RT) proxy.
  // T_norm = drivingForce; A = exp(-Q/(R·T_norm)) → exp(-Q_OVER_RT/T_norm).
  const arrheniusActivation = Math.max(0.01, Math.min(1,
    Math.exp(-ARRHENIUS_Q_OVER_RT / Math.max(0.05, drivingForce))
  ));

  // Pool-level Hollomon-Jaffe.
  const hjParam = hjParameter(drivingForce, volume);

  // Pool-level JMA fraction transformed.
  const jmaProg = jmaTransformed(drivingForce, arrheniusActivation);

  // Skew + role counts
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

  // Matrix mean reserve (for austenite blockiness baseline).
  const matrixBins = sorted.filter((b) => dominanceRole(b) === matrixRole);
  const poolMatrixMeanReserve = matrixBins.length > 0
    ? matrixBins.reduce((s, b) => s + b.totalUsd, 0) / matrixBins.length
    : 0;

  // Matrix coefficient of variation (drops as Stage 2 progresses).
  let matrixCV = 0;
  if (matrixBins.length >= 2 && poolMatrixMeanReserve > 0) {
    const variance = matrixBins.reduce(
      (s, b) => s + (b.totalUsd - poolMatrixMeanReserve) ** 2,
      0
    ) / matrixBins.length;
    matrixCV = Math.sqrt(variance) / poolMatrixMeanReserve;
  }

  // Find minority runs.
  const minorityRuns = findRoleRuns(sorted, minorityRole);
  const binToRun = new Map<number, BinReserves[]>();
  for (const run of minorityRuns) {
    for (const b of run) binToRun.set(b.binId, run);
  }

  // Cluster classification by run length.
  let microClusterCount = 0;
  let shortClusterCount = 0;
  let mediumClusterCount = 0;
  let largeClusterCount = 0;
  for (const run of minorityRuns) {
    if (run.length <= STAGE_4_SPHEROIDITE_LEN_MAX) {
      shortClusterCount++;
      if (run.length === 1) microClusterCount++;
    } else if (run.length >= STAGE_3_CEMENTITE_LEN_MIN
            && run.length <= STAGE_3_CEMENTITE_LEN_MAX) {
      mediumClusterCount++;
    } else if (run.length > STAGE_3_CEMENTITE_LEN_MAX) {
      largeClusterCount++;
    }
  }

  const totalClusters = minorityRuns.length;
  const totalMinorityBins = minorityRuns.reduce((s, r) => s + r.length, 0);
  const minorityFraction = n > 0 ? totalMinorityBins / n : 0;

  // Stage metrics.
  // microPrecipitateDensity = matrix bins with elevated minority fraction
  // / total matrix bins.
  let microPrecipMatch = 0;
  for (const b of matrixBins) {
    const t = b.reserveXUsd + b.reserveYUsd;
    if (t === 0) continue;
    const minorityFrac = matrixRole === 1
      ? b.reserveYUsd / t
      : b.reserveXUsd / t;
    if (minorityFrac > MICROPRECIPITATE_THRESHOLD) microPrecipMatch++;
  }
  const microPrecipitateDensity = matrixBins.length > 0
    ? microPrecipMatch / matrixBins.length
    : 0;

  // austeniteDecompFraction = matrix CV reduction proxy.
  // High CV = austenite blocks still present; low CV = decomposition complete.
  // Map CV in [0, 1.0] → austeniteDecompFraction in [1, 0].
  const austeniteDecompFraction = Math.max(0, Math.min(1, 1 - matrixCV));

  // cementiteFraction = medium clusters / total clusters.
  const cementiteFraction = totalClusters > 0
    ? mediumClusterCount / totalClusters
    : 0;

  // spheroidizationFraction = short clusters / total clusters.
  const spheroidizationFraction = totalClusters > 0
    ? shortClusterCount / totalClusters
    : 0;

  // Composite stage progress 0-1.
  // Each stage contributes its own metric weighted by progression.
  const stageProgress = Math.max(0, Math.min(1,
    microPrecipitateDensity * 0.15 +
    austeniteDecompFraction * 0.2 +
    cementiteFraction * 0.25 +
    spheroidizationFraction * 0.4
  ));

  // Map to dominant stage 0-4.
  let dominantStage = 0;
  if (stageProgress < STAGE_1_BOUND) dominantStage = 0;
  else if (stageProgress < STAGE_2_BOUND) dominantStage = 1;
  else if (stageProgress < STAGE_3_BOUND) dominantStage = 2;
  else if (stageProgress < STAGE_4_BOUND) dominantStage = 3;
  else dominantStage = 4;

  // Hardness, ductility, toughness proxies.
  const hardnessProxy = hardnessFromHj(hjParam);
  const ductilityProxy = 1 - hardnessProxy;
  const toughnessProxy = toughnessFromStage(stageProgress);

  // Embrittlement and secondary hardening signals.
  const embrittlement = embrittlementRisk(stageProgress);
  const secondaryHardening = secondaryHardeningSignal(stageProgress, microPrecipitateDensity);

  // Carbide evolution index — weighted sum of all stage metrics.
  const carbideEvolution = Math.max(0, Math.min(1,
    microPrecipitateDensity * 0.2 +
    austeniteDecompFraction * 0.2 +
    cementiteFraction * 0.25 +
    spheroidizationFraction * 0.35
  ));

  // Tempered hardness fraction = drop from peak (1 = full anneal).
  const temperedHardnessFraction = 1 - hardnessProxy;
  const ductilityGain = ductilityProxy;

  // Per-bin tempering analysis.
  const binRecs = sorted.map((b) => {
    const runOfBin = binToRun.get(b.binId) || null;
    return computeBinTempering(
      b,
      activeBin,
      sorted,
      runOfBin,
      matrixRole,
      poolMatrixMeanReserve,
      drivingForce,
      arrheniusActivation,
      hjParam,
      stageProgress,
      microPrecipitateDensity,
      hypoeutectoidSkew
    );
  });

  const stageDistribution = [0, 0, 0, 0, 0];
  for (const b of binRecs) {
    stageDistribution[b.stageBin]++;
  }

  const xMatrixCount = binRecs.filter((b) => dominanceRoleFromBin(b) === 1).length;
  const yMatrixCount = binRecs.filter((b) => dominanceRoleFromBin(b) === -1).length;
  const minorityRoleCount = binRecs.filter((b) => dominanceRoleFromBin(b) === minorityRole).length;

  // Cluster sizes.
  const clusterSizes = minorityRuns
    .filter((r) => r.reduce((s, b) => s + b.totalUsd, 0) >= MIN_CLUSTER_RESERVE_USD)
    .map((r) => r.reduce((s, b) => s + b.totalUsd, 0));
  const avgClusterSize = clusterSizes.length > 0
    ? clusterSizes.reduce((s, v) => s + v, 0) / clusterSizes.length
    : 0;
  const avgClusterLen = minorityRuns.length > 0
    ? minorityRuns.reduce((s, r) => s + r.length, 0) / minorityRuns.length
    : 0;

  // Composite tempering index 0-100.
  const stageScore = Math.min(25, stageProgress * 25);
  const carbideScore = Math.min(25, carbideEvolution * 25);
  const ductilityScore = Math.min(25, ductilityProxy * 25);
  const kineticScore = Math.min(25, jmaProg * 15 + hjParam * 10);
  const temperingIndex = Math.round(
    Math.min(100, stageScore + carbideScore + ductilityScore + kineticScore)
  );

  // Regime classification.
  let temperingRegime: string;
  if (drivingForce < 0.15) {
    temperingRegime = "AS_QUENCHED";
  } else if (minorityFraction < 0.05) {
    temperingRegime = "OVER_TEMPERED";
  } else if (stageProgress < STAGE_1_BOUND) {
    temperingRegime = "AS_QUENCHED";
  } else if (stageProgress < STAGE_2_BOUND) {
    temperingRegime = "STAGE_1_EPSILON";
  } else if (stageProgress < STAGE_3_BOUND) {
    temperingRegime = "STAGE_2_AUSTENITE_DECOMP";
  } else if (stageProgress < STAGE_4_BOUND) {
    temperingRegime = "STAGE_3_CEMENTITE";
  } else {
    temperingRegime = "STAGE_4_SPHEROIDIZATION";
  }

  // Verdict classification.
  let temperingVerdict: string;
  if (drivingForce < 0.15) {
    temperingVerdict = "NO_TEMPERING_DRIVE";
  } else if (Math.abs(hypoeutectoidSkew) > 0.35) {
    temperingVerdict = "INTERMEDIATE_TEMPERING";
  } else if (minorityFraction < 0.05 && stageProgress > 0.5) {
    temperingVerdict = "OVER_TEMPERED";
  } else if (embrittlement > 0.5 && largeClusterCount >= 1 && matrixCV > 0.4) {
    temperingVerdict = "TEMPER_EMBRITTLEMENT";
  } else if (secondaryHardening > 0.3) {
    temperingVerdict = "SECONDARY_HARDENING";
  } else if (stageProgress >= STAGE_4_BOUND && spheroidizationFraction > 0.5) {
    temperingVerdict = "STAGE_4_SPHEROIDIZATION";
  } else if (stageProgress >= STAGE_3_BOUND && cementiteFraction > 0.3) {
    temperingVerdict = "STAGE_3_CEMENTITE";
  } else if (stageProgress >= STAGE_2_BOUND && austeniteDecompFraction > 0.6) {
    temperingVerdict = "STAGE_2_AUSTENITE_DECOMP";
  } else if (stageProgress >= STAGE_1_BOUND && microPrecipitateDensity > 0.2) {
    temperingVerdict = "STAGE_1_EPSILON";
  } else if (stageProgress < STAGE_1_BOUND) {
    temperingVerdict = "AS_QUENCHED";
  } else {
    temperingVerdict = "INTERMEDIATE_TEMPERING";
  }

  const topBins = [...binRecs]
    .sort((a, b) => b.temperednessIndex - a.temperednessIndex)
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
    microPrecipitateDensity: r4(microPrecipitateDensity),
    austeniteDecompFraction: r4(austeniteDecompFraction),
    cementiteFraction: r4(cementiteFraction),
    spheroidizationFraction: r4(spheroidizationFraction),
    stageProgress: r4(stageProgress),
    dominantStage,
    largeClusterCount,
    mediumClusterCount,
    shortClusterCount,
    microClusterCount,
    avgClusterSize: r2(avgClusterSize),
    avgClusterLen: r2(avgClusterLen),
    matrixCoefficientOfVariation: r4(matrixCV),
    hardnessProxy: r4(hardnessProxy),
    ductilityProxy: r4(ductilityProxy),
    toughnessProxy: r4(toughnessProxy),
    carbideEvolutionIndex: r4(carbideEvolution),
    temperedHardnessFraction: r4(temperedHardnessFraction),
    ductilityGain: r4(ductilityGain),
    embrittlementRisk: r4(embrittlement),
    secondaryHardeningSignal: r4(secondaryHardening),
    xMatrixCount,
    yMatrixCount,
    minorityRoleCount,
    hypoeutectoidSkew,
    temperingIndex,
    temperingRegime,
    temperingVerdict,
    stageDistribution,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function dominanceRoleFromBin(rec: BinTempering): number {
  const m = rec.roleMinorityMargin;
  if (m > 0.15) return rec.matrixRole;
  if (m < -0.15) return -rec.matrixRole;
  return 0;
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Tempering — Doctor ===\n");
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

  const profiles: TemperingProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeTempering(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgTemperingIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.temperingIndex)))
      : 0,
    avgDrivingForce: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.drivingForce)))
      : 0,
    asQuenchedCount:                 profiles.filter((p) => p.temperingRegime === "AS_QUENCHED").length,
    stage1Count:                     profiles.filter((p) => p.temperingRegime === "STAGE_1_EPSILON").length,
    stage2Count:                     profiles.filter((p) => p.temperingRegime === "STAGE_2_AUSTENITE_DECOMP").length,
    stage3Count:                     profiles.filter((p) => p.temperingRegime === "STAGE_3_CEMENTITE").length,
    stage4Count:                     profiles.filter((p) => p.temperingRegime === "STAGE_4_SPHEROIDIZATION").length,
    overTemperedCount:               profiles.filter((p) => p.temperingRegime === "OVER_TEMPERED").length,
    avgStageProgress: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.stageProgress)))
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
    avgHardnessProxy: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.hardnessProxy)))
      : 0,
    avgDuctilityProxy: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.ductilityProxy)))
      : 0,
    avgToughnessProxy: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.toughnessProxy)))
      : 0,
    avgEmbrittlementRisk: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.embrittlementRisk)))
      : 0,
    avgSecondaryHardeningSignal: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.secondaryHardeningSignal)))
      : 0,
    avgCarbideEvolutionIndex: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.carbideEvolutionIndex)))
      : 0,
    avgMatrixCoefficientOfVariation: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.matrixCoefficientOfVariation)))
      : 0,
    avgSpheroidizationFraction: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.spheroidizationFraction)))
      : 0,
    avgCementiteFraction: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.cementiteFraction)))
      : 0,
    avgMicroPrecipitateDensity: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.microPrecipitateDensity)))
      : 0,
    totalLargeClusters:  profiles.reduce((s, p) => s + p.largeClusterCount, 0),
    totalMediumClusters: profiles.reduce((s, p) => s + p.mediumClusterCount, 0),
    totalShortClusters:  profiles.reduce((s, p) => s + p.shortClusterCount, 0),
    totalMicroClusters:  profiles.reduce((s, p) => s + p.microClusterCount, 0),
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-tempering").description("HODLMM bin tempering / staged martensite-to-spheroidite transformation analyzer (epsilon → cementite → spheroidite stages, JMA kinetics, Hollomon-Jaffe)");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin tempering state")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
