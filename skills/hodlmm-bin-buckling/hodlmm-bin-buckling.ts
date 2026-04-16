#!/usr/bin/env bun
/**
 * hodlmm-bin-buckling.ts — Day 168 cocoa007 Bitflow Skills Comp
 *
 * Buckling stability analyzer — models elastic-plastic buckling
 * instability of HODLMM bins under compressive trading load. Treats
 * bins as slender columns where sustained one-sided pressure causes
 * bifurcation into bowed post-buckled states, mapping Euler column
 * theory to LP concentration collapse. The Euler critical load
 * P_cr = pi^2 * E * I / (K * L)^2 sets the threshold at which a
 * slender column bifurcates under axial compression, where E is
 * Young's modulus, I is the second moment of area, L is column
 * length, and K is the effective length factor that encodes boundary
 * conditions (K = 1.0 for pinned-pinned, 0.5 for fixed-fixed, 2.0
 * for fixed-free cantilever, 0.7 for fixed-pinned). The slenderness
 * ratio lambda = K * L / r where r = sqrt(I / A) is the radius of
 * gyration determines whether a column fails elastically by Euler
 * buckling (long columns, lambda > lambda_c) or by inelastic yielding
 * (short columns, lambda < lambda_c); the Johnson parabolic formula
 * bridges the two regimes with a tangent-modulus correction.
 * Buckling mode shapes are sinusoidal for pinned ends: mode 1 is a
 * single half-sine bow with maximum displacement at midspan, mode 2
 * is a full S-shape with a central node, and higher modes add
 * additional inflection points. Koiter's imperfection-sensitivity
 * theory shows that real columns buckle below the ideal Euler load
 * because geometric imperfections interact with the instability to
 * reduce the limit load. Post-buckling behavior ranges from stable
 * (plates, symmetric bifurcation with positive stiffness after
 * buckling) to unstable (cylindrical shells, asymmetric bifurcation
 * with snap-through collapse). Crippling is the post-buckling
 * ultimate strength where the buckled column sustains additional
 * load via redistribution before total collapse. In DLMM context,
 * bins experience one-sided compressive stress from sustained
 * directional trading pressure; when the stress exceeds the Euler-
 * like critical threshold the bin bifurcates into a post-buckled
 * state of extreme reserve asymmetry. Slender bins with high
 * imbalance and thin cross-section are most buckling-prone; stout
 * bins with balanced reserves remain in the pre-buckled straight
 * configuration.
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

interface BinBuckling {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  criticalLoad: number;              // P_cr Euler critical, 0-1
  slendernessRatio: number;          // lambda = KL/r, 0-1
  effectiveLength: number;           // KL, 0-1
  radiusOfGyration: number;          // r = sqrt(I/A), 0-1
  mode1Amplitude: number;            // fundamental half-sine, 0-1
  mode2Amplitude: number;            // S-shape, 0-1
  mode3Amplitude: number;            // triple-curvature, 0-1
  postBucklingStiffness: number;     // stiffness after bifurcation, 0-1
  imperfectionSensitivity: number;   // Koiter drop, 0-1
  snapThroughRisk: number;           // dynamic unstable collapse, 0-1
  cripplingStress: number;           // post-buckling ultimate strength, 0-1
  compressiveLoad: number;           // applied axial stress proxy, 0-1
  bucklingProximity: number;         // P/P_cr ratio, 0-1
  columnStrength: number;            // total resistance, 0-1
  bifurcationRisk: number;           // instability likelihood, 0-1
  bucklingFactor: number;            // composite 0-1 (higher = safer)
}

interface BucklingProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgCriticalLoad: number;
  maxCriticalLoad: number;
  avgSlendernessRatio: number;
  maxSlendernessRatio: number;
  avgEffectiveLength: number;
  maxEffectiveLength: number;
  avgRadiusOfGyration: number;
  minRadiusOfGyration: number;
  avgMode1Amplitude: number;
  maxMode1Amplitude: number;
  avgMode2Amplitude: number;
  maxMode2Amplitude: number;
  avgMode3Amplitude: number;
  maxMode3Amplitude: number;
  avgPostBucklingStiffness: number;
  minPostBucklingStiffness: number;
  avgImperfectionSensitivity: number;
  maxImperfectionSensitivity: number;
  avgSnapThroughRisk: number;
  maxSnapThroughRisk: number;
  avgCripplingStress: number;
  minCripplingStress: number;
  avgCompressiveLoad: number;
  maxCompressiveLoad: number;
  avgBucklingProximity: number;
  maxBucklingProximity: number;
  avgColumnStrength: number;
  minColumnStrength: number;
  avgBifurcationRisk: number;
  maxBifurcationRisk: number;
  // Derived counts
  stableCount: number;
  stableFraction: number;
  metastableCount: number;
  metastableFraction: number;
  collapsedCount: number;
  collapsedFraction: number;
  // Summary
  bucklingGini: number;
  bucklingIndex: number;
  bucklingRegime: string;
  bucklingVerdict: string;
  topBins: BinBuckling[];
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

function computeBinBuckling(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  maxReserve: number,
  avgReserve: number
): BinBuckling {
  const distance = Math.abs(bin.binId - activeBin);
  const reserveFraction = maxReserve > 0 ? bin.totalUsd / maxReserve : 0;
  const volumeRatio = volume24hUsd > 0 ? volume24hUsd / (totalUsd || 1) : 0;
  const localConcentration = totalUsd > 0 ? bin.totalUsd / totalUsd : 0;

  // Neighbors within +/-3 bins
  const neighbors = allBins.filter(
    (b) => Math.abs(b.binId - bin.binId) <= 3 && b.binId !== bin.binId
  );
  const neighborAvg = neighbors.length > 0
    ? neighbors.reduce((s, b) => s + b.totalUsd, 0) / neighbors.length
    : 0;

  // Reserve composition imbalance (applied compressive stress proxy)
  const xFraction = bin.totalUsd > 0 ? bin.reserveXUsd / bin.totalUsd : 0.5;
  const imbalance = Math.abs(xFraction - 0.5) * 2;

  // Neighbor variance (imperfection amplitude proxy)
  const neighborVariance = neighbors.length > 1
    ? neighbors.reduce((s, b) => s + Math.pow(b.totalUsd - neighborAvg, 2), 0) / neighbors.length
    : 0;
  const normalizedStdDev = neighborAvg > 0 ? Math.sqrt(neighborVariance) / neighborAvg : 0;

  // Concentration differential vs neighbors (geometric defect proxy)
  const concentrationDiff = neighborAvg > 0
    ? Math.abs(bin.totalUsd - neighborAvg) / neighborAvg
    : 0;

  // Distance decay — far bins experience less compressive stress
  const proximityFactor = Math.max(0, 1 - distance * 0.02);

  // Activity level — compressive load driver
  const activityLevel = Math.min(1, volumeRatio * 0.6);

  // Size dominance — large bins have thicker cross-section (robust radius of gyration)
  const sizeDominance = reserveFraction;

  // -----------------------------------------------------------------------
  // 1. criticalLoad — P_cr = pi^2 * E * I / (K * L)^2
  // High = bin can carry large compressive load before bifurcation
  const criticalLoad = r4(
    Math.min(1,
      sizeDominance * 0.3 +            // thick cross-section (large I) = high P_cr
      (1 - imbalance) * 0.25 +         // balanced reserves = stiffer column
      (1 - normalizedStdDev) * 0.2 +   // uniform = near-ideal P_cr
      proximityFactor * 0.15 +         // near-active = well-restrained
      (1 - concentrationDiff) * 0.1    // smooth gradient = good boundary conditions
    )
  );

  // 2. slendernessRatio — lambda = K * L / r
  // High = long thin column in Euler regime, low = stout yielding
  const slendernessRatio = r4(
    Math.min(1,
      (1 - sizeDominance) * 0.3 +      // thin = high slenderness
      distance / 30 * 0.25 +            // far from active = long column
      imbalance * 0.2 +                 // asymmetric = effective thinning
      (1 - proximityFactor) * 0.15 +
      normalizedStdDev * 0.1
    )
  );

  // 3. effectiveLength — K * L (boundary-condition-adjusted length)
  // High = weak end restraint amplifies buckling
  const effectiveLength = r4(
    Math.min(1,
      slendernessRatio * 0.4 +
      (1 - proximityFactor) * 0.25 +
      normalizedStdDev * 0.2 +
      (1 - sizeDominance) * 0.15
    )
  );

  // 4. radiusOfGyration — r = sqrt(I / A) cross-section thickness proxy
  // High = thick robust cross-section
  const radiusOfGyration = r4(
    Math.min(1,
      sizeDominance * 0.4 +
      (1 - imbalance) * 0.25 +
      proximityFactor * 0.2 +
      (1 - normalizedStdDev) * 0.15
    )
  );

  // 5. compressiveLoad — applied axial stress proxy
  // High = heavy compressive trading pressure
  const compressiveLoad = r4(
    Math.min(1,
      imbalance * 0.35 +               // directional pressure = compression
      activityLevel * 0.3 +            // trading volume = load
      concentrationDiff * 0.15 +
      sizeDominance * 0.1 +
      normalizedStdDev * 0.1
    )
  );

  // 6. bucklingProximity — P / P_cr ratio
  // High = operating near critical load with imminent bifurcation
  const proximityRaw = Math.max(0,
    compressiveLoad - criticalLoad + 0.5
  );
  const bucklingProximity = r4(
    Math.min(1, proximityRaw)
  );

  // 7. mode1Amplitude — fundamental half-sine buckling shape
  // High = dominant single-bow displacement from midspan
  const mode1Amplitude = r4(
    Math.min(1,
      bucklingProximity * 0.35 +       // near critical = mode excited
      imbalance * 0.25 +
      slendernessRatio * 0.2 +
      (1 - proximityFactor) * 0.1 +
      concentrationDiff * 0.1
    )
  );

  // 8. mode2Amplitude — S-shape second mode
  // Requires 4x P_cr of mode 1; excited under shear/asymmetric loading
  const mode2Amplitude = r4(
    Math.min(1,
      normalizedStdDev * 0.35 +
      concentrationDiff * 0.25 +
      bucklingProximity * 0.2 +
      activityLevel * 0.1 +
      imbalance * 0.1
    )
  );

  // 9. mode3Amplitude — triple-curvature third mode
  // Requires 9x P_cr of mode 1; rare, excited under complex loading
  const mode3Amplitude = r4(
    Math.min(1,
      normalizedStdDev * 0.4 +
      concentrationDiff * 0.3 +
      bucklingProximity * 0.15 +
      activityLevel * 0.15
    )
  );

  // 10. postBucklingStiffness — stiffness after bifurcation
  // High = stable post-buckled state with positive restoring force
  const postBucklingStiffness = r4(
    Math.min(1,
      criticalLoad * 0.3 +
      sizeDominance * 0.25 +
      (1 - normalizedStdDev) * 0.2 +
      radiusOfGyration * 0.15 +
      (1 - imbalance) * 0.1
    )
  );

  // 11. imperfectionSensitivity — Koiter drop from ideal Euler
  // High = buckles well below ideal Euler threshold
  const imperfectionSensitivity = r4(
    Math.min(1,
      normalizedStdDev * 0.35 +
      concentrationDiff * 0.25 +
      imbalance * 0.2 +
      (1 - sizeDominance) * 0.15 +
      slendernessRatio * 0.05
    )
  );

  // 12. snapThroughRisk — sudden mode jump likelihood
  // High = unstable bifurcation with dynamic collapse
  const snapThroughRisk = r4(
    Math.min(1,
      bucklingProximity * 0.3 +
      (1 - postBucklingStiffness) * 0.25 +
      imperfectionSensitivity * 0.2 +
      normalizedStdDev * 0.15 +
      imbalance * 0.1
    )
  );

  // 13. cripplingStress — post-buckling ultimate strength
  // High = significant reserve capacity after buckling
  const cripplingStress = r4(
    Math.min(1,
      postBucklingStiffness * 0.35 +
      criticalLoad * 0.25 +
      sizeDominance * 0.2 +
      (1 - imbalance) * 0.1 +
      (1 - snapThroughRisk) * 0.1
    )
  );

  // 14. columnStrength — total buckling resistance
  // High = robust overall load capacity
  const columnStrength = r4(
    Math.min(1,
      criticalLoad * 0.4 +
      cripplingStress * 0.25 +
      radiusOfGyration * 0.2 +
      postBucklingStiffness * 0.15
    )
  );

  // 15. bifurcationRisk — instability likelihood
  // High = bifurcation imminent
  const bifurcationRisk = r4(
    Math.min(1,
      bucklingProximity * 0.35 +
      imperfectionSensitivity * 0.25 +
      snapThroughRisk * 0.2 +
      (1 - columnStrength) * 0.15 +
      (1 - cripplingStress) * 0.05
    )
  );

  // 16. bucklingFactor — composite 0-1 (higher = safer, tougher reserve)
  // Rewards stability reserve, post-buckling strength, low proximity
  const bucklingFactor = r4(
    Math.min(1,
      criticalLoad * 0.15 +
      (1 - bucklingProximity) * 0.12 +
      postBucklingStiffness * 0.1 +
      cripplingStress * 0.1 +
      columnStrength * 0.1 +
      (1 - bifurcationRisk) * 0.1 +
      (1 - imperfectionSensitivity) * 0.08 +
      (1 - snapThroughRisk) * 0.07 +
      radiusOfGyration * 0.06 +
      (1 - slendernessRatio) * 0.05 +
      (1 - compressiveLoad) * 0.04 +
      (1 - effectiveLength) * 0.03
    )
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    criticalLoad,
    slendernessRatio,
    effectiveLength,
    radiusOfGyration,
    mode1Amplitude,
    mode2Amplitude,
    mode3Amplitude,
    postBucklingStiffness,
    imperfectionSensitivity,
    snapThroughRisk,
    cripplingStress,
    compressiveLoad,
    bucklingProximity,
    columnStrength,
    bifurcationRisk,
    bucklingFactor,
  };
}

function analyzeBuckling(bins: BinReserves[], pool: AppPool): BucklingProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));
  const avgReserve = totalUsd / n;

  const binBucklings = sorted.map((b) =>
    computeBinBuckling(b, activeBin, sorted, totalUsd, volume, maxReserve, avgReserve)
  );

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgCriticalLoad = r4(avg(binBucklings.map((b) => b.criticalLoad)));
  const maxCriticalLoad = r4(Math.max(...binBucklings.map((b) => b.criticalLoad)));
  const avgSlendernessRatio = r4(avg(binBucklings.map((b) => b.slendernessRatio)));
  const maxSlendernessRatio = r4(Math.max(...binBucklings.map((b) => b.slendernessRatio)));
  const avgEffectiveLength = r4(avg(binBucklings.map((b) => b.effectiveLength)));
  const maxEffectiveLength = r4(Math.max(...binBucklings.map((b) => b.effectiveLength)));
  const avgRadiusOfGyration = r4(avg(binBucklings.map((b) => b.radiusOfGyration)));
  const minRadiusOfGyration = r4(Math.min(...binBucklings.map((b) => b.radiusOfGyration)));
  const avgMode1Amplitude = r4(avg(binBucklings.map((b) => b.mode1Amplitude)));
  const maxMode1Amplitude = r4(Math.max(...binBucklings.map((b) => b.mode1Amplitude)));
  const avgMode2Amplitude = r4(avg(binBucklings.map((b) => b.mode2Amplitude)));
  const maxMode2Amplitude = r4(Math.max(...binBucklings.map((b) => b.mode2Amplitude)));
  const avgMode3Amplitude = r4(avg(binBucklings.map((b) => b.mode3Amplitude)));
  const maxMode3Amplitude = r4(Math.max(...binBucklings.map((b) => b.mode3Amplitude)));
  const avgPostBucklingStiffness = r4(avg(binBucklings.map((b) => b.postBucklingStiffness)));
  const minPostBucklingStiffness = r4(Math.min(...binBucklings.map((b) => b.postBucklingStiffness)));
  const avgImperfectionSensitivity = r4(avg(binBucklings.map((b) => b.imperfectionSensitivity)));
  const maxImperfectionSensitivity = r4(Math.max(...binBucklings.map((b) => b.imperfectionSensitivity)));
  const avgSnapThroughRisk = r4(avg(binBucklings.map((b) => b.snapThroughRisk)));
  const maxSnapThroughRisk = r4(Math.max(...binBucklings.map((b) => b.snapThroughRisk)));
  const avgCripplingStress = r4(avg(binBucklings.map((b) => b.cripplingStress)));
  const minCripplingStress = r4(Math.min(...binBucklings.map((b) => b.cripplingStress)));
  const avgCompressiveLoad = r4(avg(binBucklings.map((b) => b.compressiveLoad)));
  const maxCompressiveLoad = r4(Math.max(...binBucklings.map((b) => b.compressiveLoad)));
  const avgBucklingProximity = r4(avg(binBucklings.map((b) => b.bucklingProximity)));
  const maxBucklingProximity = r4(Math.max(...binBucklings.map((b) => b.bucklingProximity)));
  const avgColumnStrength = r4(avg(binBucklings.map((b) => b.columnStrength)));
  const minColumnStrength = r4(Math.min(...binBucklings.map((b) => b.columnStrength)));
  const avgBifurcationRisk = r4(avg(binBucklings.map((b) => b.bifurcationRisk)));
  const maxBifurcationRisk = r4(Math.max(...binBucklings.map((b) => b.bifurcationRisk)));

  // Stable: high stability reserve, low proximity
  const stableCount = binBucklings.filter(
    (b) => b.criticalLoad > 0.6 && b.bucklingProximity < 0.3
  ).length;
  const stableFraction = r4(stableCount / n);

  // Metastable: moderate proximity
  const metastableCount = binBucklings.filter(
    (b) => b.bucklingProximity >= 0.3 && b.bucklingProximity < 0.6
  ).length;
  const metastableFraction = r4(metastableCount / n);

  // Collapsed: imminent bifurcation
  const collapsedCount = binBucklings.filter((b) => b.bifurcationRisk >= 0.6).length;
  const collapsedFraction = r4(collapsedCount / n);

  // Gini on bucklingFactor distribution
  const bfFactors = binBucklings.map((b) => b.bucklingFactor);
  const sortedFactors = [...bfFactors].sort((a, b) => b - a);
  const totalFactors = sortedFactors.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedFactors[i];
  }
  const bucklingGini = totalFactors > 0
    ? r4(Math.abs(giniSum) / (n * totalFactors))
    : 0;

  // Composite buckling index (0-100)
  // High = healthy stability reserve, low bifurcation risk
  const loadScore       = Math.min(25, avgCriticalLoad * 25);
  const safetyScore     = Math.min(25, (1 - avgBucklingProximity) * 25);
  const stiffnessScore  = Math.min(25, avgPostBucklingStiffness * 25);
  const reserveScore    = Math.min(25, avgCripplingStress * 25);
  const bucklingIndex = Math.round(
    Math.min(100, loadScore + safetyScore + stiffnessScore + reserveScore)
  );

  // Buckling regime classification
  let bucklingRegime: string;
  if (bucklingIndex >= 80)      bucklingRegime = "STABLE";
  else if (bucklingIndex >= 60) bucklingRegime = "ROBUST";
  else if (bucklingIndex >= 40) bucklingRegime = "METASTABLE";
  else if (bucklingIndex >= 20) bucklingRegime = "SLENDER";
  else                           bucklingRegime = "COLLAPSED";

  // Verdict classification
  let bucklingVerdict: string;
  if (avgBucklingProximity > 0.7 && avgSlendernessRatio > 0.6)
    bucklingVerdict = "ELASTIC_BUCKLING_IMMINENT";
  else if (avgBucklingProximity > 0.6 && avgSlendernessRatio < 0.4)
    bucklingVerdict = "INELASTIC_YIELDING_IMMINENT";
  else if (avgCompressiveLoad > 0.6 && avgCriticalLoad > 0.6)
    bucklingVerdict = "STABLE_UNDER_HIGH_LOAD";
  else if (avgSnapThroughRisk > 0.6 && avgPostBucklingStiffness < 0.4)
    bucklingVerdict = "SNAP_THROUGH_WARNING";
  else if (avgMode1Amplitude > avgMode2Amplitude && avgMode1Amplitude > avgMode3Amplitude && avgMode1Amplitude > 0.5)
    bucklingVerdict = "MODE_1_DOMINANT";
  else if (avgImperfectionSensitivity > 0.6 && avgBucklingProximity > 0.4)
    bucklingVerdict = "IMPERFECTION_SENSITIVE";
  else if (avgCriticalLoad > 0.6 && avgBucklingProximity < 0.3)
    bucklingVerdict = "STABILITY_RESERVE";
  else
    bucklingVerdict = "BUCKLING_BALANCE";

  const topBins = [...binBucklings]
    .sort((a, b) => b.bucklingFactor - a.bucklingFactor)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgCriticalLoad,
    maxCriticalLoad,
    avgSlendernessRatio,
    maxSlendernessRatio,
    avgEffectiveLength,
    maxEffectiveLength,
    avgRadiusOfGyration,
    minRadiusOfGyration,
    avgMode1Amplitude,
    maxMode1Amplitude,
    avgMode2Amplitude,
    maxMode2Amplitude,
    avgMode3Amplitude,
    maxMode3Amplitude,
    avgPostBucklingStiffness,
    minPostBucklingStiffness,
    avgImperfectionSensitivity,
    maxImperfectionSensitivity,
    avgSnapThroughRisk,
    maxSnapThroughRisk,
    avgCripplingStress,
    minCripplingStress,
    avgCompressiveLoad,
    maxCompressiveLoad,
    avgBucklingProximity,
    maxBucklingProximity,
    avgColumnStrength,
    minColumnStrength,
    avgBifurcationRisk,
    maxBifurcationRisk,
    stableCount,
    stableFraction,
    metastableCount,
    metastableFraction,
    collapsedCount,
    collapsedFraction,
    bucklingGini,
    bucklingIndex,
    bucklingRegime,
    bucklingVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Buckling — Doctor ===\n");
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

  const profiles: BucklingProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeBuckling(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgBucklingIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.bucklingIndex)))
      : 0,
    stableCount:      profiles.filter((p) => p.bucklingRegime === "STABLE").length,
    robustCount:      profiles.filter((p) => p.bucklingRegime === "ROBUST").length,
    metastableCount:  profiles.filter((p) => p.bucklingRegime === "METASTABLE").length,
    slenderCount:     profiles.filter((p) => p.bucklingRegime === "SLENDER").length,
    collapsedCount:   profiles.filter((p) => p.bucklingRegime === "COLLAPSED").length,
    avgCriticalLoad: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgCriticalLoad)))
      : 0,
    avgBucklingProximity: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgBucklingProximity)))
      : 0,
    avgImperfectionSensitivity: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgImperfectionSensitivity)))
      : 0,
    totalStableBins:      profiles.reduce((s, p) => s + p.stableCount, 0),
    totalMetastableBins:  profiles.reduce((s, p) => s + p.metastableCount, 0),
    totalCollapsedBins:   profiles.reduce((s, p) => s + p.collapsedCount, 0),
    avgBucklingGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.bucklingGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-buckling").description("HODLMM bin buckling stability analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin buckling stability")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
