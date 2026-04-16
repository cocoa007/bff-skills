#!/usr/bin/env bun
/**
 * hodlmm-bin-capillarity.ts — Day 161 cocoa007 Bitflow Skills Comp
 *
 * Capillarity analyzer — models surface tension, capillary action, and
 * wettability dynamics across HODLMM bins. In capillarity, liquids rise
 * or fall in narrow tubes driven by the balance between adhesive forces
 * (liquid-to-surface attraction), cohesive forces (liquid-to-liquid bonding),
 * and gravitational resistance. Surface tension at the liquid-gas interface
 * creates a curved meniscus whose contact angle determines wettability.
 * In DLMM context, liquidity (liquid) flows between bins (capillary tubes)
 * through bin boundaries (tube walls). Depleted bins create capillary suction
 * that draws liquidity inward from deeper neighbors, while surface tension
 * of concentrated bins resists spreading. Contact angle at bin boundaries
 * determines how readily new liquidity wets and fills each bin. Measures
 * surface tension, capillary pressure, contact angle, meniscus curvature,
 * wettability, capillary number, Marangoni flow, adhesion work, cohesion
 * work, spreading coefficient, Jurin height, capillary length, Bond number,
 * and Young-Laplace pressure to reveal the complete capillary character of
 * each bin and guide LP strategy across wetting regimes.
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

interface BinCapillarity {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  surfaceTension: number;          // cohesive force holding liquidity together, 0-1
  capillaryPressure: number;       // pressure difference driving capillary flow, 0-10
  contactAngle: number;            // wetting angle at bin boundary, 0-180 degrees
  meniscusCurvature: number;       // curvature of liquidity distribution at boundaries, 0-1
  wettability: number;             // how readily the bin attracts new liquidity, 0-1
  capillaryNumber: number;         // ratio of viscous to surface tension forces, 0-10
  marangoniFlow: number;           // flow driven by surface tension gradients, 0-1
  adhesionWork: number;            // energy to separate liquidity from bin surface, 0-1
  cohesionWork: number;            // energy to separate liquidity from itself, 0-1
  spreadingCoefficient: number;    // tendency of liquidity to spread across bin, 0-1
  jurinHeight: number;             // equilibrium capillary rise height, 0-1
  capillaryLength: number;         // characteristic length where gravity balances tension, 0-1
  bondNumber: number;              // ratio of gravitational to surface tension forces, 0-10
  youngLaplace: number;            // pressure difference across curved interface, 0-10
  capillarityFactor: number;       // composite 0-1
}

interface CapillarityProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgSurfaceTension: number;
  maxSurfaceTension: number;
  avgCapillaryPressure: number;
  maxCapillaryPressure: number;
  avgContactAngle: number;
  maxContactAngle: number;
  avgMeniscusCurvature: number;
  maxMeniscusCurvature: number;
  avgWettability: number;
  minWettability: number;
  avgCapillaryNumber: number;
  maxCapillaryNumber: number;
  avgMarangoniFlow: number;
  maxMarangoniFlow: number;
  avgAdhesionWork: number;
  maxAdhesionWork: number;
  avgCohesionWork: number;
  maxCohesionWork: number;
  avgSpreadingCoefficient: number;
  maxSpreadingCoefficient: number;
  avgJurinHeight: number;
  maxJurinHeight: number;
  avgCapillaryLength: number;
  maxCapillaryLength: number;
  avgBondNumber: number;
  maxBondNumber: number;
  avgYoungLaplace: number;
  maxYoungLaplace: number;
  // Derived counts
  hydrophilicCount: number;       // bins with contactAngle < 90
  hydrophilicFraction: number;
  highWettabilityCount: number;   // bins with wettability > 0.5
  highWettabilityFraction: number;
  // Summary
  capillarityGini: number;
  capillarityIndex: number;
  wettingRegime: string;
  capillarityVerdict: string;
  topBins: BinCapillarity[];
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

function computeBinCapillarity(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  maxReserve: number,
  avgReserve: number
): BinCapillarity {
  const distance = Math.abs(bin.binId - activeBin);
  const n = allBins.length;
  const reserveFraction = maxReserve > 0 ? bin.totalUsd / maxReserve : 0;
  const volumeRatio = volume24hUsd > 0 ? volume24hUsd / (totalUsd || 1) : 0;
  const localConcentration = totalUsd > 0 ? bin.totalUsd / totalUsd : 0;

  // Neighbors within +/-3 bins for gradient calculations
  const neighbors = allBins.filter(
    (b) => Math.abs(b.binId - bin.binId) <= 3 && b.binId !== bin.binId
  );
  const neighborAvg = neighbors.length > 0
    ? neighbors.reduce((s, b) => s + b.totalUsd, 0) / neighbors.length
    : 0;

  // Reserve composition
  const xFraction = bin.totalUsd > 0 ? bin.reserveXUsd / bin.totalUsd : 0.5;
  const imbalance = Math.abs(xFraction - 0.5) * 2;

  // Neighbor reserve variance
  const neighborVariance = neighbors.length > 1
    ? neighbors.reduce((s, b) => s + Math.pow(b.totalUsd - neighborAvg, 2), 0) / neighbors.length
    : 0;
  const normalizedStdDev = neighborAvg > 0 ? Math.sqrt(neighborVariance) / neighborAvg : 0;

  // Concentration differential
  const concentrationDiff = neighborAvg > 0
    ? Math.abs(bin.totalUsd - neighborAvg) / neighborAvg
    : 0;

  // Ratio to pool average
  const avgRatio = avgReserve > 0 ? bin.totalUsd / avgReserve : 1;

  // Neighbor imbalances for gradient
  const neighborImbalances = neighbors.map((b) => {
    const nxf = b.totalUsd > 0 ? b.reserveXUsd / b.totalUsd : 0.5;
    return Math.abs(nxf - 0.5) * 2;
  });
  const imbalanceGradient = neighborImbalances.length > 0
    ? Math.abs(imbalance - neighborImbalances.reduce((s, v) => s + v, 0) / neighborImbalances.length)
    : 0;

  // -----------------------------------------------------------------------
  // 1. surfaceTension — cohesive force holding liquidity together in the bin
  // High = strong internal cohesion, liquidity resists being pulled apart
  const surfaceTension = r4(
    Math.min(1,
      reserveFraction * 0.35 +
      (1 - imbalance) * 0.25 +
      (1 - normalizedStdDev * 0.5) * 0.2 +
      localConcentration * n * 0.03 +
      (1 - distance * 0.008) * 0.1
    )
  );

  // 2. contactAngle — wetting angle at bin boundary (0-180 degrees)
  // < 90 = hydrophilic (liquidity spreads), > 90 = hydrophobic (liquidity beads up)
  const contactAngle = r4(
    Math.min(180,
      Math.max(0,
        90 +
        (imbalance - 0.5) * 60 +
        (1 - reserveFraction) * 30 +
        normalizedStdDev * 20 -
        (1 - distance * 0.01) * 15
      )
    )
  );

  // 3. meniscusCurvature — curvature of liquidity distribution at bin boundaries
  // High = strongly curved meniscus (concave or convex), indicating strong capillary effects
  const meniscusCurvature = r4(
    Math.min(1,
      concentrationDiff * 0.3 +
      normalizedStdDev * 0.25 +
      imbalanceGradient * 0.2 +
      Math.abs(reserveFraction - 0.5) * 0.15 +
      (neighbors.length < 2 ? 0.2 : 0) * 0.1
    )
  );

  // 4. capillaryPressure — pressure difference driving capillary flow
  // Delta P = 2*gamma*cos(theta)/r; High = strong capillary driving force
  const cosTheta = Math.cos(contactAngle * Math.PI / 180);
  const capillaryPressure = r4(
    Math.min(10,
      Math.abs(surfaceTension * cosTheta) * 4 +
      meniscusCurvature * 3 +
      concentrationDiff * 2 +
      (1 - reserveFraction) * 1.5
    )
  );

  // 5. wettability — how readily the bin attracts and holds new liquidity
  // High = highly wettable (hydrophilic), attracts liquidity easily
  const wettability = r4(
    Math.min(1,
      (contactAngle < 90 ? (90 - contactAngle) / 90 : 0) * 0.3 +
      reserveFraction * 0.2 +
      (1 - imbalance) * 0.2 +
      surfaceTension * 0.15 +
      (1 - distance * 0.01) * 0.1 +
      (1 - normalizedStdDev * 0.5) * 0.05
    )
  );

  // 6. capillaryNumber — ratio of viscous forces to surface tension forces
  // Ca = mu*v/gamma; High = viscous forces dominate (forced flow), Low = surface tension dominates
  const capillaryNumber = r4(
    Math.min(10,
      volumeRatio * n * 0.3 / (surfaceTension + 0.01) +
      (1 - reserveFraction) * 2 +
      imbalance * 2 +
      distance * 0.05
    )
  );

  // 7. marangoniFlow — flow driven by surface tension gradients between bins
  // High = strong Marangoni effect, liquidity migrating along surface tension gradient
  const marangoniFlow = r4(
    Math.min(1,
      concentrationDiff * 0.3 +
      normalizedStdDev * 0.25 +
      imbalanceGradient * 0.2 +
      meniscusCurvature * 0.15 +
      volumeRatio * 0.1
    )
  );

  // 8. adhesionWork — energy to separate liquidity from bin surface
  // Wa = gamma(1 + cos theta); High = strong adhesion, liquidity sticks to the bin
  const adhesionWork = r4(
    Math.min(1,
      surfaceTension * (1 + Math.max(-1, Math.min(1, cosTheta))) / 2 * 0.4 +
      reserveFraction * 0.25 +
      (1 - imbalance) * 0.2 +
      wettability * 0.15
    )
  );

  // 9. cohesionWork — energy to separate liquidity from itself
  // Wc = 2*gamma; High = strong internal cohesion, liquidity holds together
  const cohesionWork = r4(
    Math.min(1,
      surfaceTension * 0.4 +
      reserveFraction * 0.25 +
      (1 - normalizedStdDev * 0.5) * 0.2 +
      (1 - imbalance) * 0.15
    )
  );

  // 10. spreadingCoefficient — tendency of liquidity to spread across bin surface
  // S = Wa - Wc; Positive = spontaneous spreading; High = liquidity spreads easily
  const spreadingCoefficient = r4(
    Math.min(1,
      Math.max(0,
        wettability * 0.3 +
        (adhesionWork - cohesionWork * 0.5) * 0.25 +
        (1 - imbalance) * 0.2 +
        (contactAngle < 90 ? (90 - contactAngle) / 180 : 0) * 0.15 +
        reserveFraction * 0.1
      )
    )
  );

  // 11. jurinHeight — equilibrium capillary rise height
  // h = 2*gamma*cos(theta)/(rho*g*r); High = liquidity rises high (strong capillary action)
  const jurinHeight = r4(
    Math.min(1,
      (contactAngle < 90 ? surfaceTension * cosTheta : 0) * 0.35 +
      wettability * 0.25 +
      (1 - reserveFraction) * 0.2 +
      meniscusCurvature * 0.1 +
      capillaryPressure / 10 * 0.1
    )
  );

  // 12. capillaryLength — characteristic length where gravity balances surface tension
  // lambda_c = sqrt(gamma/(rho*g)); High = surface tension dominant over larger distances
  const capillaryLength = r4(
    Math.min(1,
      surfaceTension * 0.35 +
      (1 - volumeRatio * 0.3) * 0.2 +
      reserveFraction * 0.2 +
      cohesionWork * 0.15 +
      (1 - distance * 0.01) * 0.1
    )
  );

  // 13. bondNumber — ratio of gravitational to surface tension forces
  // Bo = rho*g*L^2/gamma; High = gravity dominates, Low = surface tension dominates
  const bondNumber = r4(
    Math.min(10,
      volumeRatio * n * 0.2 +
      (1 - surfaceTension) * 3 +
      imbalance * 2 +
      distance * 0.05 +
      (1 - reserveFraction) * 2
    )
  );

  // 14. youngLaplace — pressure difference across curved liquidity interface
  // Delta P = gamma * (1/R1 + 1/R2); High = strong pressure from curvature
  const youngLaplace = r4(
    Math.min(10,
      surfaceTension * meniscusCurvature * 4 +
      capillaryPressure * 0.3 +
      concentrationDiff * 2 +
      normalizedStdDev * 2
    )
  );

  // 15. capillarityFactor — composite 0-1
  // Rewards high wettability, strong adhesion, balanced tension, and good spreading
  const capillarityFactor = r4(
    Math.min(1,
      wettability * 0.15 +
      adhesionWork * 0.12 +
      spreadingCoefficient * 0.12 +
      surfaceTension * 0.10 +
      (1 - meniscusCurvature * 0.5) * 0.10 +
      jurinHeight * 0.08 +
      capillaryLength * 0.08 +
      cohesionWork * 0.08 +
      (1 - capillaryNumber / 10 * 0.5) * 0.08 +
      (1 - bondNumber / 10 * 0.5) * 0.05 +
      (1 - marangoniFlow * 0.5) * 0.04
    )
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    surfaceTension,
    capillaryPressure,
    contactAngle,
    meniscusCurvature,
    wettability,
    capillaryNumber,
    marangoniFlow,
    adhesionWork,
    cohesionWork,
    spreadingCoefficient,
    jurinHeight,
    capillaryLength,
    bondNumber,
    youngLaplace,
    capillarityFactor,
  };
}

function analyzeCapillarity(bins: BinReserves[], pool: AppPool): CapillarityProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));
  const avgReserve = totalUsd / n;

  const binCapillarities = sorted.map((b) =>
    computeBinCapillarity(b, activeBin, sorted, totalUsd, volume, maxReserve, avgReserve)
  );

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgSurfaceTension = r4(avg(binCapillarities.map((b) => b.surfaceTension)));
  const maxSurfaceTension = r4(Math.max(...binCapillarities.map((b) => b.surfaceTension)));
  const avgCapillaryPressure = r4(avg(binCapillarities.map((b) => b.capillaryPressure)));
  const maxCapillaryPressure = r4(Math.max(...binCapillarities.map((b) => b.capillaryPressure)));
  const avgContactAngle = r4(avg(binCapillarities.map((b) => b.contactAngle)));
  const maxContactAngle = r4(Math.max(...binCapillarities.map((b) => b.contactAngle)));
  const avgMeniscusCurvature = r4(avg(binCapillarities.map((b) => b.meniscusCurvature)));
  const maxMeniscusCurvature = r4(Math.max(...binCapillarities.map((b) => b.meniscusCurvature)));
  const avgWettability = r4(avg(binCapillarities.map((b) => b.wettability)));
  const minWettability = r4(Math.min(...binCapillarities.map((b) => b.wettability)));
  const avgCapillaryNumber = r4(avg(binCapillarities.map((b) => b.capillaryNumber)));
  const maxCapillaryNumber = r4(Math.max(...binCapillarities.map((b) => b.capillaryNumber)));
  const avgMarangoniFlow = r4(avg(binCapillarities.map((b) => b.marangoniFlow)));
  const maxMarangoniFlow = r4(Math.max(...binCapillarities.map((b) => b.marangoniFlow)));
  const avgAdhesionWork = r4(avg(binCapillarities.map((b) => b.adhesionWork)));
  const maxAdhesionWork = r4(Math.max(...binCapillarities.map((b) => b.adhesionWork)));
  const avgCohesionWork = r4(avg(binCapillarities.map((b) => b.cohesionWork)));
  const maxCohesionWork = r4(Math.max(...binCapillarities.map((b) => b.cohesionWork)));
  const avgSpreadingCoefficient = r4(avg(binCapillarities.map((b) => b.spreadingCoefficient)));
  const maxSpreadingCoefficient = r4(Math.max(...binCapillarities.map((b) => b.spreadingCoefficient)));
  const avgJurinHeight = r4(avg(binCapillarities.map((b) => b.jurinHeight)));
  const maxJurinHeight = r4(Math.max(...binCapillarities.map((b) => b.jurinHeight)));
  const avgCapillaryLength = r4(avg(binCapillarities.map((b) => b.capillaryLength)));
  const maxCapillaryLength = r4(Math.max(...binCapillarities.map((b) => b.capillaryLength)));
  const avgBondNumber = r4(avg(binCapillarities.map((b) => b.bondNumber)));
  const maxBondNumber = r4(Math.max(...binCapillarities.map((b) => b.bondNumber)));
  const avgYoungLaplace = r4(avg(binCapillarities.map((b) => b.youngLaplace)));
  const maxYoungLaplace = r4(Math.max(...binCapillarities.map((b) => b.youngLaplace)));

  // Hydrophilic: bins with contactAngle < 90
  const hydrophilicCount = binCapillarities.filter((b) => b.contactAngle < 90).length;
  const hydrophilicFraction = r4(hydrophilicCount / n);

  // High wettability: bins with wettability > 0.5
  const highWettabilityCount = binCapillarities.filter((b) => b.wettability > 0.5).length;
  const highWettabilityFraction = r4(highWettabilityCount / n);

  // Gini coefficient on capillarityFactor distribution
  const cfFactors = binCapillarities.map((b) => b.capillarityFactor);
  const sortedFactors = [...cfFactors].sort((a, b) => b - a);
  const totalFactors = sortedFactors.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedFactors[i];
  }
  const capillarityGini = totalFactors > 0
    ? r4(Math.abs(giniSum) / (n * totalFactors))
    : 0;

  // Composite capillarity index (0-100)
  const wettingScore    = Math.min(25, avgWettability * 25);
  const adhesionScore   = Math.min(25, avgAdhesionWork * 25);
  const spreadScore     = Math.min(25, avgSpreadingCoefficient * 25);
  const tensionScore    = Math.min(25, avgSurfaceTension * 25);
  const capillarityIndex = Math.round(
    Math.min(100, wettingScore + adhesionScore + spreadScore + tensionScore)
  );

  // Wetting regime classification
  let wettingRegime: string;
  if (capillarityIndex >= 80)      wettingRegime = "SUPERHYDROPHILIC";
  else if (capillarityIndex >= 60) wettingRegime = "HYDROPHILIC";
  else if (capillarityIndex >= 40) wettingRegime = "PARTIALLY_WETTING";
  else if (capillarityIndex >= 20) wettingRegime = "HYDROPHOBIC";
  else                             wettingRegime = "SUPERHYDROPHOBIC";

  // Verdict classification
  let capillarityVerdict: string;
  if (avgWettability > 0.5 && avgSpreadingCoefficient > 0.4 && avgContactAngle < 70)
    capillarityVerdict = "SPONTANEOUS_WETTING";
  else if (avgSurfaceTension > 0.5 && avgCohesionWork > 0.5 && avgAdhesionWork > 0.4)
    capillarityVerdict = "CAPILLARY_STABLE";
  else if (avgMarangoniFlow > 0.4 && avgMeniscusCurvature > 0.4)
    capillarityVerdict = "MARANGONI_DRIVEN";
  else if (avgContactAngle > 110 && avgWettability < 0.3)
    capillarityVerdict = "DEWETTING";
  else if (avgBondNumber > 5 && avgCapillaryLength < 0.3)
    capillarityVerdict = "GRAVITY_DOMINATED";
  else
    capillarityVerdict = "CAPILLARY_STABLE";

  const topBins = [...binCapillarities]
    .sort((a, b) => b.capillarityFactor - a.capillarityFactor)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgSurfaceTension,
    maxSurfaceTension,
    avgCapillaryPressure,
    maxCapillaryPressure,
    avgContactAngle,
    maxContactAngle,
    avgMeniscusCurvature,
    maxMeniscusCurvature,
    avgWettability,
    minWettability,
    avgCapillaryNumber,
    maxCapillaryNumber,
    avgMarangoniFlow,
    maxMarangoniFlow,
    avgAdhesionWork,
    maxAdhesionWork,
    avgCohesionWork,
    maxCohesionWork,
    avgSpreadingCoefficient,
    maxSpreadingCoefficient,
    avgJurinHeight,
    maxJurinHeight,
    avgCapillaryLength,
    maxCapillaryLength,
    avgBondNumber,
    maxBondNumber,
    avgYoungLaplace,
    maxYoungLaplace,
    hydrophilicCount,
    hydrophilicFraction,
    highWettabilityCount,
    highWettabilityFraction,
    capillarityGini,
    capillarityIndex,
    wettingRegime,
    capillarityVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Capillarity — Doctor ===\n");
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

  const profiles: CapillarityProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeCapillarity(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgCapillarityIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.capillarityIndex)))
      : 0,
    superhydrophilicCount:  profiles.filter((p) => p.wettingRegime === "SUPERHYDROPHILIC").length,
    hydrophilicCount:       profiles.filter((p) => p.wettingRegime === "HYDROPHILIC").length,
    partiallyWettingCount:  profiles.filter((p) => p.wettingRegime === "PARTIALLY_WETTING").length,
    hydrophobicCount:       profiles.filter((p) => p.wettingRegime === "HYDROPHOBIC").length,
    superhydrophobicCount:  profiles.filter((p) => p.wettingRegime === "SUPERHYDROPHOBIC").length,
    avgSurfaceTension: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgSurfaceTension)))
      : 0,
    avgWettability: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgWettability)))
      : 0,
    avgAdhesionWork: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgAdhesionWork)))
      : 0,
    totalHydrophilicBins: profiles.reduce((s, p) => s + p.hydrophilicCount, 0),
    totalHighWettabilityBins: profiles.reduce((s, p) => s + p.highWettabilityCount, 0),
    avgCapillarityGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.capillarityGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-capillarity").description("HODLMM bin capillarity analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin capillarity dynamics")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
