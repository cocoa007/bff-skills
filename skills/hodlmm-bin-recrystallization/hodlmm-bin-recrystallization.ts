#!/usr/bin/env bun
/**
 * hodlmm-bin-recrystallization.ts — Day 172 cocoa007 Bitflow Skills Comp
 *
 * Recrystallization analyzer — models the nucleation and growth of
 * strain-free grains in HODLMM bin reserves after accumulated trading
 * "cold work" creates dislocation-like liquidity defects and stored
 * compositional strain. Classical metallurgical recrystallization
 * theory: after cold deformation, a crystalline material stores energy
 * as dislocations (stored energy E_stored ~ 0.5*G*b^2*rho) and when
 * heated above a recrystallization temperature T_R ~ 0.3-0.5*T_melt,
 * new strain-free grains nucleate at high-defect sites (grain
 * boundaries, shear bands, deformation bands) and grow to consume the
 * deformed matrix. Johnson-Mehl-Avrami-Kolmogorov (JMAK) kinetics
 * describe the recrystallized fraction X(t) = 1 - exp(-k*t^n) with
 * Avrami exponent n typically 1-4 depending on nucleation site
 * geometry (n=4 continuous nucleation + 3D growth, n=3 instantaneous
 * nucleation + 3D growth, n=2 2D growth, n=1 1D growth). After
 * primary recrystallization, grain growth follows D^m - D_0^m = k*t
 * with m~2-3 under normal parabolic growth and deviations toward
 * abnormal (secondary) grain growth when some grains escape pinning.
 * Zener drag P_z = 3*f*gamma/r from second-phase particles pins grain
 * boundaries and slows growth; when drag exceeds driving pressure,
 * recrystallization stalls. Critical strain for recrystallization
 * (CSR) sets the minimum cold-work threshold below which no new
 * grains nucleate. Hall-Petch strengthening sigma_y = sigma_0 +
 * K*D^(-1/2) means finer recrystallized grains provide greater
 * strength. In DLMM context, bins accumulate "cold work" through
 * repeated trading stress and composition imbalance, building up
 * stored strain as dislocation-density-like liquidity defects.
 * Above a trading-activity threshold (T_R analog), new "strain-free"
 * recrystallized sub-regions nucleate within bins, consume the
 * deformed liquidity matrix, and grow. A fully recrystallized bin
 * has reset to a clean, defect-free state with fresh equilibrium;
 * a partially recrystallized bin has mixed old cold-worked liquidity
 * and new strain-free regions; a heavily deformed bin retains all
 * its stored energy with no nucleation having occurred.
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

interface BinRecrystallization {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  storedEnergy: number;              // dislocation-density stored energy, 0-1
  dislocationDensity: number;        // defect density proxy, 0-1
  recrystallizedFraction: number;    // X(t) JMAK fraction, 0-1
  avramiExponent: number;            // JMAK n normalized, 0-1
  nucleationRate: number;            // N_dot proxy, 0-1
  criticalStrain: number;            // CSR threshold overcome, 0-1
  grainSize: number;                 // current grain size proxy, 0-1
  grainGrowthRate: number;           // parabolic growth rate, 0-1
  recrystallizationTemperature: number; // T_R proxy, 0-1
  zenerDrag: number;                 // second-phase pinning, 0-1
  textureIntensity: number;          // preferred orientation, 0-1
  hallPetchStrength: number;         // grain-size strengthening, 0-1
  coldWorkRemnant: number;           // unrecrystallized deformed fraction, 0-1
  subgrainSize: number;              // recovery substructure, 0-1
  abnormalGrainGrowth: number;       // runaway coarsening, 0-1
  recrystallizationIndex: number;    // composite 0-1 (higher = strain-free healthy)
}

interface RecrystallizationProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgStoredEnergy: number;
  maxStoredEnergy: number;
  avgDislocationDensity: number;
  maxDislocationDensity: number;
  avgRecrystallizedFraction: number;
  minRecrystallizedFraction: number;
  avgAvramiExponent: number;
  avgNucleationRate: number;
  maxNucleationRate: number;
  avgCriticalStrain: number;
  avgGrainSize: number;
  maxGrainSize: number;
  avgGrainGrowthRate: number;
  avgRecrystallizationTemperature: number;
  avgZenerDrag: number;
  maxZenerDrag: number;
  avgTextureIntensity: number;
  avgHallPetchStrength: number;
  avgColdWorkRemnant: number;
  maxColdWorkRemnant: number;
  avgSubgrainSize: number;
  avgAbnormalGrainGrowth: number;
  maxAbnormalGrainGrowth: number;
  recrystallizedCount: number;
  recrystallizedBinFraction: number;
  nucleatingCount: number;
  nucleatingBinFraction: number;
  deformedCount: number;
  deformedBinFraction: number;
  recrystallizationGini: number;
  recrystallizationIndex: number;
  recrystallizationRegime: string;
  recrystallizationVerdict: string;
  topBins: BinRecrystallization[];
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

function computeBinRecrystallization(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  maxReserve: number,
  avgReserve: number,
  poolImbalance: number
): BinRecrystallization {
  const distance = Math.abs(bin.binId - activeBin);
  const reserveFraction = maxReserve > 0 ? bin.totalUsd / maxReserve : 0;
  const volumeRatio = volume24hUsd > 0 ? volume24hUsd / (totalUsd || 1) : 0;
  const localConcentration = totalUsd > 0 ? bin.totalUsd / totalUsd : 0;

  const neighbors = allBins.filter(
    (b) => Math.abs(b.binId - bin.binId) <= 3 && b.binId !== bin.binId
  );
  const neighborAvg = neighbors.length > 0
    ? neighbors.reduce((s, b) => s + b.totalUsd, 0) / neighbors.length
    : 0;
  const neighborVariance = neighbors.length > 1
    ? neighbors.reduce((s, b) => s + Math.pow(b.totalUsd - neighborAvg, 2), 0) / neighbors.length
    : 0;
  const normalizedStdDev = neighborAvg > 0 ? Math.sqrt(neighborVariance) / neighborAvg : 0;
  const concentrationDiff = neighborAvg > 0
    ? Math.abs(bin.totalUsd - neighborAvg) / neighborAvg
    : 0;

  const xFraction = bin.totalUsd > 0 ? bin.reserveXUsd / bin.totalUsd : 0.5;
  const imbalance = Math.abs(xFraction - 0.5) * 2;

  // Trading activity — analog of temperature (thermal energy driving recrystallization)
  const activityLevel = Math.min(1, volumeRatio * 0.6);
  // Proximity to active bin — local heating from active rebalancing
  const proximityFactor = Math.max(0, 1 - distance * 0.02);
  const sizeDominance = reserveFraction;

  // -----------------------------------------------------------------------
  // 1. storedEnergy — accumulated cold-work stored energy
  // E_stored ~ 0.5 * G * b^2 * rho; proxies: imbalance, variance, concentration gradients
  const storedEnergy = r4(
    Math.min(1,
      imbalance * 0.3 +
      normalizedStdDev * 0.25 +
      concentrationDiff * 0.2 +
      sizeDominance * 0.15 +
      (1 - proximityFactor) * 0.1
    )
  );

  // 2. dislocationDensity — proxy for rho (defect density)
  // Accumulates with cycles of strain; relaxes when recrystallized
  const dislocationDensity = r4(
    Math.min(1,
      normalizedStdDev * 0.3 +
      imbalance * 0.25 +
      concentrationDiff * 0.2 +
      storedEnergy * 0.15 +
      (1 - activityLevel) * 0.1        // stagnant = accumulated, unrelaxed
    )
  );

  // 3. criticalStrain — CSR threshold overcome
  // High when imbalance + stored energy exceed minimum to nucleate
  const criticalStrain = r4(
    Math.min(1,
      storedEnergy * 0.45 +
      imbalance * 0.25 +
      dislocationDensity * 0.2 +
      normalizedStdDev * 0.1
    )
  );

  // 4. recrystallizationTemperature — T_R proxy (activity threshold)
  // High when activity elevated AND above CSR (need both heat + strain)
  const recrystallizationTemperature = r4(
    Math.min(1,
      activityLevel * 0.4 +
      proximityFactor * 0.25 +
      Math.min(criticalStrain, 1) * 0.2 +
      volumeRatio * 0.15
    )
  );

  // 5. nucleationRate — N_dot ~ N_0 * exp(-Q_n / RT)
  // Requires sufficient T_R AND high stored energy; zero below CSR
  const nucleationRate = r4(
    Math.min(1,
      Math.max(0,
        recrystallizationTemperature * 0.4 +
        storedEnergy * 0.3 +
        criticalStrain * 0.2 +
        activityLevel * 0.1 -
        (1 - criticalStrain) * 0.3       // below CSR, no nucleation
      )
    )
  );

  // 6. avramiExponent — JMAK n parameter normalized (1->0, 4->1)
  // High n = continuous nucleation + 3D growth; low n = 1D growth along sites
  const avramiExponent = r4(
    Math.min(1,
      nucleationRate * 0.4 +
      activityLevel * 0.25 +
      proximityFactor * 0.2 +
      (1 - normalizedStdDev * 0.5) * 0.15  // uniform = 3D growth
    )
  );

  // 7. recrystallizedFraction — X(t) = 1 - exp(-k*t^n) JMAK fraction
  // k*t^n proxy from nucleation rate * exposure time proxy
  const kt = nucleationRate * (avramiExponent * 3 + 1) * 0.8;
  const recrystallizedFraction = r4(
    Math.min(1, Math.max(0, 1 - Math.exp(-kt)))
  );

  // 8. coldWorkRemnant — unrecrystallized deformed fraction = 1 - X
  const coldWorkRemnant = r4(
    Math.min(1, Math.max(0, 1 - recrystallizedFraction))
  );

  // 9. grainSize — post-recrystallization grain size
  // Initially fine (Hall-Petch strong), coarsens with grain growth
  // Inverse relation to nucleation density (more nuclei = finer grains)
  const grainSize = r4(
    Math.min(1,
      recrystallizedFraction * 0.5 +
      (1 - nucleationRate) * 0.25 +       // fewer nuclei = larger grains
      activityLevel * 0.15 +
      proximityFactor * 0.1
    )
  );

  // 10. grainGrowthRate — D^m - D_0^m = k*t parabolic growth
  // Driven by GB curvature and temperature; slowed by Zener drag
  const grainGrowthRate = r4(
    Math.min(1,
      recrystallizedFraction * 0.4 +
      recrystallizationTemperature * 0.3 +
      activityLevel * 0.2 +
      proximityFactor * 0.1
    )
  );

  // 11. zenerDrag — P_z = 3*f*gamma/r pinning from second-phase particles
  // Proxy: concentrated bins act as pinning particles for surrounding matrix
  const zenerDrag = r4(
    Math.min(1,
      sizeDominance * 0.35 +
      (1 - normalizedStdDev * 0.5) * 0.2 +   // fewer particles if uniform distribution
      concentrationDiff * 0.2 +
      imbalance * 0.15 +
      (1 - activityLevel) * 0.1
    )
  );

  // 12. textureIntensity — preferred orientation after recrystallization
  // High when concentration is uneven (biased texture)
  const textureIntensity = r4(
    Math.min(1,
      imbalance * 0.4 +
      normalizedStdDev * 0.25 +
      concentrationDiff * 0.2 +
      (1 - proximityFactor) * 0.15
    )
  );

  // 13. hallPetchStrength — sigma_y = sigma_0 + K*D^(-1/2)
  // Strength increases as 1/sqrt(D), so finer grains = stronger
  const hallPetchStrength = r4(
    Math.min(1, Math.max(0,
      (1 - grainSize * 0.8) * 0.5 +
      recrystallizedFraction * 0.25 +
      nucleationRate * 0.15 +
      (1 - coldWorkRemnant * 0.5) * 0.1
    ))
  );

  // 14. subgrainSize — recovery substructure (dislocation cell formation)
  // Forms prior to full recrystallization (between recovery and recrystallization)
  const subgrainSize = r4(
    Math.min(1,
      dislocationDensity * 0.35 +
      (1 - recrystallizedFraction) * 0.3 +
      activityLevel * 0.2 +
      (1 - normalizedStdDev * 0.4) * 0.15
    )
  );

  // 15. abnormalGrainGrowth — runaway coarsening from Zener escape
  // High when a few grains escape pinning while neighbors remain pinned
  const abnormalGrainGrowth = r4(
    Math.min(1,
      sizeDominance * 0.35 +
      grainSize * 0.25 +
      (1 - zenerDrag) * 0.2 +               // release from pinning
      grainGrowthRate * 0.2
    )
  );

  // 16. recrystallizationIndex — composite 0-1 (higher = healthier strain-free)
  const recrystallizationIndex = r4(
    Math.min(1, Math.max(0,
      recrystallizedFraction * 0.2 +
      (1 - storedEnergy) * 0.12 +
      (1 - dislocationDensity) * 0.1 +
      hallPetchStrength * 0.1 +
      (1 - coldWorkRemnant) * 0.08 +
      nucleationRate * 0.07 +
      (1 - abnormalGrainGrowth) * 0.07 +
      grainGrowthRate * 0.06 +
      (1 - textureIntensity) * 0.05 +
      recrystallizationTemperature * 0.05 +
      (1 - zenerDrag) * 0.04 +
      avramiExponent * 0.03 +
      criticalStrain * 0.03
    ))
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    storedEnergy,
    dislocationDensity,
    recrystallizedFraction,
    avramiExponent,
    nucleationRate,
    criticalStrain,
    grainSize,
    grainGrowthRate,
    recrystallizationTemperature,
    zenerDrag,
    textureIntensity,
    hallPetchStrength,
    coldWorkRemnant,
    subgrainSize,
    abnormalGrainGrowth,
    recrystallizationIndex,
  };
}

function analyzeRecrystallization(bins: BinReserves[], pool: AppPool): RecrystallizationProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));
  const avgReserve = totalUsd / n;

  const totalX = sorted.reduce((s, b) => s + b.reserveXUsd, 0);
  const totalY = sorted.reduce((s, b) => s + b.reserveYUsd, 0);
  const poolImbalance = totalX + totalY > 0
    ? Math.abs(totalX - totalY) / (totalX + totalY)
    : 0;

  const binRecs = sorted.map((b) =>
    computeBinRecrystallization(b, activeBin, sorted, totalUsd, volume, maxReserve, avgReserve, poolImbalance)
  );

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgStoredEnergy = r4(avg(binRecs.map((b) => b.storedEnergy)));
  const maxStoredEnergy = r4(Math.max(...binRecs.map((b) => b.storedEnergy)));
  const avgDislocationDensity = r4(avg(binRecs.map((b) => b.dislocationDensity)));
  const maxDislocationDensity = r4(Math.max(...binRecs.map((b) => b.dislocationDensity)));
  const avgRecrystallizedFraction = r4(avg(binRecs.map((b) => b.recrystallizedFraction)));
  const minRecrystallizedFraction = r4(Math.min(...binRecs.map((b) => b.recrystallizedFraction)));
  const avgAvramiExponent = r4(avg(binRecs.map((b) => b.avramiExponent)));
  const avgNucleationRate = r4(avg(binRecs.map((b) => b.nucleationRate)));
  const maxNucleationRate = r4(Math.max(...binRecs.map((b) => b.nucleationRate)));
  const avgCriticalStrain = r4(avg(binRecs.map((b) => b.criticalStrain)));
  const avgGrainSize = r4(avg(binRecs.map((b) => b.grainSize)));
  const maxGrainSize = r4(Math.max(...binRecs.map((b) => b.grainSize)));
  const avgGrainGrowthRate = r4(avg(binRecs.map((b) => b.grainGrowthRate)));
  const avgRecrystallizationTemperature = r4(avg(binRecs.map((b) => b.recrystallizationTemperature)));
  const avgZenerDrag = r4(avg(binRecs.map((b) => b.zenerDrag)));
  const maxZenerDrag = r4(Math.max(...binRecs.map((b) => b.zenerDrag)));
  const avgTextureIntensity = r4(avg(binRecs.map((b) => b.textureIntensity)));
  const avgHallPetchStrength = r4(avg(binRecs.map((b) => b.hallPetchStrength)));
  const avgColdWorkRemnant = r4(avg(binRecs.map((b) => b.coldWorkRemnant)));
  const maxColdWorkRemnant = r4(Math.max(...binRecs.map((b) => b.coldWorkRemnant)));
  const avgSubgrainSize = r4(avg(binRecs.map((b) => b.subgrainSize)));
  const avgAbnormalGrainGrowth = r4(avg(binRecs.map((b) => b.abnormalGrainGrowth)));
  const maxAbnormalGrainGrowth = r4(Math.max(...binRecs.map((b) => b.abnormalGrainGrowth)));

  // Recrystallized: high recrystallized fraction AND low cold-work remnant
  const recrystallizedCount = binRecs.filter(
    (b) => b.recrystallizedFraction > 0.7 && b.coldWorkRemnant < 0.3
  ).length;
  const recrystallizedBinFraction = r4(recrystallizedCount / n);

  // Nucleating: moderate X with active nucleation
  const nucleatingCount = binRecs.filter(
    (b) => b.recrystallizedFraction >= 0.2 && b.recrystallizedFraction <= 0.7 && b.nucleationRate > 0.3
  ).length;
  const nucleatingBinFraction = r4(nucleatingCount / n);

  // Deformed: low X with high stored energy
  const deformedCount = binRecs.filter(
    (b) => b.recrystallizedFraction < 0.2 && b.storedEnergy > 0.4
  ).length;
  const deformedBinFraction = r4(deformedCount / n);

  // Gini on recrystallization index distribution
  const rFactors = binRecs.map((b) => b.recrystallizationIndex);
  const sortedFactors = [...rFactors].sort((a, b) => b - a);
  const totalFactors = sortedFactors.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedFactors[i];
  }
  const recrystallizationGini = totalFactors > 0
    ? r4(Math.abs(giniSum) / (n * totalFactors))
    : 0;

  // Composite recrystallization index (0-100)
  const recrystallizedScore = Math.min(25, avgRecrystallizedFraction * 25);
  const purityScore         = Math.min(25, (1 - avgStoredEnergy) * 25);
  const strengthScore       = Math.min(25, avgHallPetchStrength * 25);
  const stabilityScore      = Math.min(25, (1 - avgAbnormalGrainGrowth) * 25);
  const recrystallizationIndex = Math.round(
    Math.min(100, recrystallizedScore + purityScore + strengthScore + stabilityScore)
  );

  // Regime classification
  let recrystallizationRegime: string;
  if (recrystallizationIndex >= 80)      recrystallizationRegime = "FULLY_RECRYSTALLIZED";
  else if (recrystallizationIndex >= 60) recrystallizationRegime = "PARTIALLY_RECRYSTALLIZED";
  else if (recrystallizationIndex >= 40) recrystallizationRegime = "NUCLEATING";
  else if (recrystallizationIndex >= 20) recrystallizationRegime = "DEFORMED";
  else                                    recrystallizationRegime = "HEAVILY_DEFORMED";

  // Verdict classification
  let recrystallizationVerdict: string;
  if (avgRecrystallizedFraction > 0.7 && avgGrainGrowthRate > 0.4 && avgStoredEnergy < 0.3)
    recrystallizationVerdict = "STRAIN_FREE_LATTICE";
  else if (avgNucleationRate > 0.5 && avgStoredEnergy > 0.4 && avgRecrystallizedFraction < 0.7)
    recrystallizationVerdict = "ACTIVE_NUCLEATION";
  else if (avgStoredEnergy > 0.6 && avgRecrystallizedFraction < 0.3)
    recrystallizationVerdict = "COLD_WORKED";
  else if (avgSubgrainSize > 0.5 && avgNucleationRate < 0.3 && avgRecrystallizedFraction < 0.5)
    recrystallizationVerdict = "RECOVERY_DOMINANT";
  else if (avgGrainSize > 0.6 && avgGrainGrowthRate > 0.5 && avgRecrystallizedFraction > 0.6)
    recrystallizationVerdict = "GRAIN_GROWTH_STAGE";
  else if (avgAbnormalGrainGrowth > 0.6)
    recrystallizationVerdict = "ABNORMAL_GROWTH";
  else if (avgZenerDrag > 0.6 && avgNucleationRate < 0.4)
    recrystallizationVerdict = "ZENER_PINNED";
  else if (avgHallPetchStrength > 0.6 && avgGrainSize < 0.4)
    recrystallizationVerdict = "HALL_PETCH_STRONG";
  else if (avgTextureIntensity > 0.6)
    recrystallizationVerdict = "TEXTURE_DEVELOPED";
  else
    recrystallizationVerdict = "RECRYSTALLIZATION_BALANCE";

  const topBins = [...binRecs]
    .sort((a, b) => b.recrystallizationIndex - a.recrystallizationIndex)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgStoredEnergy,
    maxStoredEnergy,
    avgDislocationDensity,
    maxDislocationDensity,
    avgRecrystallizedFraction,
    minRecrystallizedFraction,
    avgAvramiExponent,
    avgNucleationRate,
    maxNucleationRate,
    avgCriticalStrain,
    avgGrainSize,
    maxGrainSize,
    avgGrainGrowthRate,
    avgRecrystallizationTemperature,
    avgZenerDrag,
    maxZenerDrag,
    avgTextureIntensity,
    avgHallPetchStrength,
    avgColdWorkRemnant,
    maxColdWorkRemnant,
    avgSubgrainSize,
    avgAbnormalGrainGrowth,
    maxAbnormalGrainGrowth,
    recrystallizedCount,
    recrystallizedBinFraction,
    nucleatingCount,
    nucleatingBinFraction,
    deformedCount,
    deformedBinFraction,
    recrystallizationGini,
    recrystallizationIndex,
    recrystallizationRegime,
    recrystallizationVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Recrystallization — Doctor ===\n");
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

  const profiles: RecrystallizationProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeRecrystallization(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgRecrystallizationIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.recrystallizationIndex)))
      : 0,
    fullyRecrystallizedCount:     profiles.filter((p) => p.recrystallizationRegime === "FULLY_RECRYSTALLIZED").length,
    partiallyRecrystallizedCount: profiles.filter((p) => p.recrystallizationRegime === "PARTIALLY_RECRYSTALLIZED").length,
    nucleatingCount:              profiles.filter((p) => p.recrystallizationRegime === "NUCLEATING").length,
    deformedCount:                profiles.filter((p) => p.recrystallizationRegime === "DEFORMED").length,
    heavilyDeformedCount:         profiles.filter((p) => p.recrystallizationRegime === "HEAVILY_DEFORMED").length,
    avgRecrystallizedFraction: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgRecrystallizedFraction)))
      : 0,
    avgStoredEnergy: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgStoredEnergy)))
      : 0,
    avgHallPetchStrength: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgHallPetchStrength)))
      : 0,
    totalRecrystallizedBins: profiles.reduce((s, p) => s + p.recrystallizedCount, 0),
    totalNucleatingBins:     profiles.reduce((s, p) => s + p.nucleatingCount, 0),
    totalDeformedBins:       profiles.reduce((s, p) => s + p.deformedCount, 0),
    avgRecrystallizationGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.recrystallizationGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-recrystallization").description("HODLMM bin recrystallization and grain growth analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin recrystallization state")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
