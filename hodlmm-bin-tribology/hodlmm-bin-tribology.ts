#!/usr/bin/env bun
/**
 * hodlmm-bin-tribology.ts — Day 160 cocoa007 Bitflow Skills Comp
 *
 * Tribology analyzer — models friction, lubrication, and wear dynamics of
 * HODLMM bins under applied trade-flow forces. In tribology, interacting
 * surfaces are characterized by friction coefficients (resistance to relative
 * motion), lubrication film thickness (fluid separation between surfaces),
 * and wear rates (material removal from repetitive contact). In DLMM context,
 * trades moving between bins create friction at bin boundaries (slippage and
 * resistance), liquidity depth provides lubrication (smoothing trade flow
 * between bins), and cumulative trading causes wear (IL degradation over time).
 * Friction coefficient mu, static friction, kinetic friction, lubrication film
 * thickness, wear rate, surface roughness Ra, contact pressure, adhesion
 * strength, abrasion index, fatigue life, tribo-film formation, coefficient
 * of restitution, Hertzian contact stress, and Stribeck parameter reveal the
 * complete tribological character of each bin and guide LP strategy selection.
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

interface BinTribology {
  binId: number;
  reserveUsd: number;
  distanceFromActive: number;
  frictionCoefficient: number;   // mu — resistance to trade flow, 0-1
  staticFriction: number;        // minimum force to initiate reserve movement, 0-1
  kineticFriction: number;       // resistance during active reserve displacement, 0-1
  lubricationFilm: number;       // liquidity buffer between bin transitions, 0-1
  wearRate: number;              // cumulative IL degradation per unit trade volume, 0-1
  surfaceRoughness: number;      // Ra — irregularity of reserve distribution, 0-1
  contactPressure: number;       // trade volume force per unit contact area, 0-10
  adhesionStrength: number;      // how strongly reserves stick to current config, 0-1
  abrasionIndex: number;         // rate of reserve erosion from repetitive trades, 0-1
  fatigueLife: number;           // estimated cycles before degradation, 0-1 normalized
  triboFilm: number;             // development of protective liquidity layers, 0-1
  restitution: number;           // elasticity of bin-to-bin price bounces, 0-1
  hertzianStress: number;        // peak stress at bin transition points, 0-10
  stribeckParameter: number;     // lubrication regime indicator, 0-10
  tribologyFactor: number;       // composite 0-1
}

interface TribologyProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  volume24hUsd: number;
  avgFrictionCoefficient: number;
  maxFrictionCoefficient: number;
  avgStaticFriction: number;
  maxStaticFriction: number;
  avgKineticFriction: number;
  maxKineticFriction: number;
  avgLubricationFilm: number;
  minLubricationFilm: number;
  avgWearRate: number;
  maxWearRate: number;
  avgSurfaceRoughness: number;
  maxSurfaceRoughness: number;
  avgContactPressure: number;
  maxContactPressure: number;
  avgAdhesionStrength: number;
  maxAdhesionStrength: number;
  avgAbrasionIndex: number;
  maxAbrasionIndex: number;
  avgFatigueLife: number;
  minFatigueLife: number;
  avgTriboFilm: number;
  maxTriboFilm: number;
  avgRestitution: number;
  maxRestitution: number;
  avgHertzianStress: number;
  maxHertzianStress: number;
  avgStribeckParameter: number;
  maxStribeckParameter: number;
  // Derived counts
  highFrictionCount: number;     // bins with mu > 0.5
  highFrictionFraction: number;
  wellLubricatedCount: number;   // bins with lubricationFilm > 0.5
  wellLubricatedFraction: number;
  // Summary
  tribologyGini: number;
  tribologyIndex: number;
  tribologicalRegime: string;
  tribologyVerdict: string;
  topBins: BinTribology[];
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

function computeBinTribology(
  bin: BinReserves,
  activeBin: number,
  allBins: BinReserves[],
  totalUsd: number,
  volume24hUsd: number,
  maxReserve: number
): BinTribology {
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
  const imbalance = Math.abs(xFraction - 0.5) * 2; // 0 = balanced, 1 = fully one-sided

  // Neighbor imbalance for gradient calculations
  const neighborImbalances = neighbors.map((b) => {
    const nxf = b.totalUsd > 0 ? b.reserveXUsd / b.totalUsd : 0.5;
    return Math.abs(nxf - 0.5) * 2;
  });
  const neighborImbalanceAvg = neighborImbalances.length > 0
    ? neighborImbalances.reduce((s, v) => s + v, 0) / neighborImbalances.length
    : 0;

  // Reserve ratio spatial gradient — proxy for surface roughness
  const imbalanceGradient = Math.abs(imbalance - neighborImbalanceAvg);

  // TVL variation among neighbors — proxy for surface irregularity
  const neighborVariance = neighbors.length > 1
    ? neighbors.reduce((s, b) => s + Math.pow(b.totalUsd - neighborAvg, 2), 0) / neighbors.length
    : 0;
  const normalizedStdDev = neighborAvg > 0 ? Math.sqrt(neighborVariance) / neighborAvg : 0;

  // -----------------------------------------------------------------------
  // 1. contactPressure — trade volume force per unit contact area between bins
  // High = large trade volume concentrated on small reserve — heavy mechanical loading
  const contactPressure = r4(
    Math.min(10,
      volumeRatio * n * 0.5 * (1 + localConcentration * 3) / (1 + distance * 0.2)
    )
  );

  // 2. surfaceRoughness (Ra) — irregularity of reserve distribution across bins
  // High = rough surface with jagged reserve allocation — creates friction points
  const surfaceRoughness = r4(
    Math.min(1,
      normalizedStdDev * 0.4 +
      imbalanceGradient * 0.3 +
      (1 - reserveFraction) * 0.15 +
      (neighbors.length < 2 ? 0.2 : 0) * 0.15
    )
  );

  // 3. frictionCoefficient (mu) — overall resistance to trade flow between adjacent bins
  // mu = friction force / normal force; High = high resistance at bin boundaries
  const frictionCoefficient = r4(
    Math.min(1,
      surfaceRoughness * 0.3 +
      imbalance * 0.25 +
      (1 - reserveFraction) * 0.2 +
      imbalanceGradient * 0.15 +
      distance * 0.005 +
      normalizedStdDev * 0.1
    )
  );

  // 4. staticFriction — minimum force to initiate reserve movement
  // Always >= kinetic friction; High = reserves locked until threshold force applied
  const staticFriction = r4(
    Math.min(1,
      frictionCoefficient * 1.2 * 0.4 +
      (1 - reserveFraction) * 0.2 +
      imbalance * 0.15 +
      (neighbors.length < 2 ? 0.25 : 0) +
      distance * 0.006
    )
  );

  // 5. kineticFriction — resistance during active reserve displacement
  // Typically lower than static friction; High = sustained resistance during flow
  const kineticFriction = r4(
    Math.min(1,
      frictionCoefficient * 0.85 * 0.4 +
      surfaceRoughness * 0.25 +
      volumeRatio * 0.15 * (1 - reserveFraction * 0.3) +
      imbalanceGradient * 0.2
    )
  );

  // 6. lubricationFilm — liquidity buffer between bin transitions
  // Thick film = deep liquidity smoothing transitions; Thin = dry contact
  const lubricationFilm = r4(
    Math.min(1,
      reserveFraction * 0.4 +
      (1 - imbalance) * 0.25 +
      localConcentration * n * 0.03 +
      (1 - normalizedStdDev * 0.5) * 0.15 +
      (1 - distance * 0.01) * 0.1
    )
  );

  // 7. wearRate — cumulative IL degradation per unit trade volume
  // High = rapid reserve erosion from trading activity
  const wearRate = r4(
    Math.min(1,
      volumeRatio * 0.3 * (1 - reserveFraction * 0.3) +
      imbalance * 0.25 +
      (1 - lubricationFilm) * 0.2 +
      frictionCoefficient * 0.15 +
      contactPressure / 10 * 0.1
    )
  );

  // 8. adhesionStrength — how strongly reserves stick to current configuration
  // High = reserves resist displacement, bonded to current ratio
  const adhesionStrength = r4(
    Math.min(1,
      reserveFraction * 0.35 +
      (1 - volumeRatio * 0.5) * 0.2 +
      staticFriction * 0.2 +
      (1 - imbalanceGradient) * 0.15 +
      (1 - normalizedStdDev * 0.5) * 0.1
    )
  );

  // 9. abrasionIndex — rate of reserve erosion from repetitive small trades
  // High = small trades steadily eroding reserves through cumulative friction
  const abrasionIndex = r4(
    Math.min(1,
      volumeRatio * 0.25 * (1 + surfaceRoughness) +
      (1 - lubricationFilm) * 0.25 +
      frictionCoefficient * 0.2 +
      (1 - adhesionStrength) * 0.15 +
      wearRate * 0.15
    )
  );

  // 10. fatigueLife — estimated cycles before bin performance degrades (0-1, higher = longer life)
  // High = durable bin that withstands many trade cycles before degradation
  const fatigueLife = r4(
    Math.min(1,
      lubricationFilm * 0.3 +
      (1 - wearRate) * 0.25 +
      adhesionStrength * 0.2 +
      (1 - abrasionIndex) * 0.15 +
      reserveFraction * 0.1
    )
  );

  // 11. triboFilm — development of protective liquidity layers
  // High = bin has developed protective film from sustained liquidity provision
  const triboFilm = r4(
    Math.min(1,
      reserveFraction * 0.35 +
      (1 - imbalance) * 0.25 +
      lubricationFilm * 0.2 +
      localConcentration * n * 0.03 +
      (1 - surfaceRoughness) * 0.1
    )
  );

  // 12. restitution — elasticity of bin-to-bin price bounces (coefficient of restitution)
  // High = elastic collisions, price bounces back; Low = inelastic, price sticks
  const restitution = r4(
    Math.min(1,
      reserveFraction * 0.3 +
      (1 - imbalance) * 0.25 +
      (1 - wearRate) * 0.2 +
      triboFilm * 0.15 +
      (1 - distance * 0.01) * 0.1
    )
  );

  // 13. hertzianStress — peak stress at bin transition points
  // Hertz contact theory: stress concentrates at contact points between curved surfaces
  // High = extreme stress concentration at bin boundaries
  const hertzianStress = r4(
    Math.min(10,
      contactPressure * 0.4 +
      (1 - lubricationFilm) * 3 +
      surfaceRoughness * 2 +
      imbalanceGradient * 3 +
      frictionCoefficient * 2
    )
  );

  // 14. stribeckParameter — lubrication regime indicator
  // Stribeck curve maps from boundary (low) through mixed to hydrodynamic (high) lubrication
  // High = hydrodynamic regime (full fluid film); Low = boundary regime (surface contact)
  const stribeckParameter = r4(
    Math.min(10,
      lubricationFilm * 4 +
      triboFilm * 2 +
      reserveFraction * 2 +
      (1 - frictionCoefficient) * 2
    )
  );

  // 15. tribologyFactor — composite 0-1
  // Balances low friction, good lubrication, minimal wear, and structural durability
  const tribologyFactor = r4(
    Math.min(1,
      (1 - frictionCoefficient) * 0.15 +
      lubricationFilm * 0.15 +
      (1 - wearRate) * 0.12 +
      fatigueLife * 0.12 +
      triboFilm * 0.10 +
      restitution * 0.10 +
      (1 - surfaceRoughness) * 0.08 +
      adhesionStrength * 0.08 +
      (1 - abrasionIndex) * 0.05 +
      stribeckParameter / 10 * 0.05
    )
  );

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    distanceFromActive: distance,
    frictionCoefficient,
    staticFriction,
    kineticFriction,
    lubricationFilm,
    wearRate,
    surfaceRoughness,
    contactPressure,
    adhesionStrength,
    abrasionIndex,
    fatigueLife,
    triboFilm,
    restitution,
    hertzianStress,
    stribeckParameter,
    tribologyFactor,
  };
}

function analyzeTribology(bins: BinReserves[], pool: AppPool): TribologyProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;
  const volume = pool.volume24hUsd || 0;
  const maxReserve = Math.max(...sorted.map((b) => b.totalUsd));

  const binTribologies = sorted.map((b) =>
    computeBinTribology(b, activeBin, sorted, totalUsd, volume, maxReserve)
  );

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const avgFrictionCoefficient = r4(avg(binTribologies.map((b) => b.frictionCoefficient)));
  const maxFrictionCoefficient = r4(Math.max(...binTribologies.map((b) => b.frictionCoefficient)));
  const avgStaticFriction = r4(avg(binTribologies.map((b) => b.staticFriction)));
  const maxStaticFriction = r4(Math.max(...binTribologies.map((b) => b.staticFriction)));
  const avgKineticFriction = r4(avg(binTribologies.map((b) => b.kineticFriction)));
  const maxKineticFriction = r4(Math.max(...binTribologies.map((b) => b.kineticFriction)));
  const avgLubricationFilm = r4(avg(binTribologies.map((b) => b.lubricationFilm)));
  const minLubricationFilm = r4(Math.min(...binTribologies.map((b) => b.lubricationFilm)));
  const avgWearRate = r4(avg(binTribologies.map((b) => b.wearRate)));
  const maxWearRate = r4(Math.max(...binTribologies.map((b) => b.wearRate)));
  const avgSurfaceRoughness = r4(avg(binTribologies.map((b) => b.surfaceRoughness)));
  const maxSurfaceRoughness = r4(Math.max(...binTribologies.map((b) => b.surfaceRoughness)));
  const avgContactPressure = r4(avg(binTribologies.map((b) => b.contactPressure)));
  const maxContactPressure = r4(Math.max(...binTribologies.map((b) => b.contactPressure)));
  const avgAdhesionStrength = r4(avg(binTribologies.map((b) => b.adhesionStrength)));
  const maxAdhesionStrength = r4(Math.max(...binTribologies.map((b) => b.adhesionStrength)));
  const avgAbrasionIndex = r4(avg(binTribologies.map((b) => b.abrasionIndex)));
  const maxAbrasionIndex = r4(Math.max(...binTribologies.map((b) => b.abrasionIndex)));
  const avgFatigueLife = r4(avg(binTribologies.map((b) => b.fatigueLife)));
  const minFatigueLife = r4(Math.min(...binTribologies.map((b) => b.fatigueLife)));
  const avgTriboFilm = r4(avg(binTribologies.map((b) => b.triboFilm)));
  const maxTriboFilm = r4(Math.max(...binTribologies.map((b) => b.triboFilm)));
  const avgRestitution = r4(avg(binTribologies.map((b) => b.restitution)));
  const maxRestitution = r4(Math.max(...binTribologies.map((b) => b.restitution)));
  const avgHertzianStress = r4(avg(binTribologies.map((b) => b.hertzianStress)));
  const maxHertzianStress = r4(Math.max(...binTribologies.map((b) => b.hertzianStress)));
  const avgStribeckParameter = r4(avg(binTribologies.map((b) => b.stribeckParameter)));
  const maxStribeckParameter = r4(Math.max(...binTribologies.map((b) => b.stribeckParameter)));

  // High friction: bins with mu > 0.5
  const highFrictionCount = binTribologies.filter((b) => b.frictionCoefficient > 0.5).length;
  const highFrictionFraction = r4(highFrictionCount / n);

  // Well lubricated: bins with lubricationFilm > 0.5
  const wellLubricatedCount = binTribologies.filter((b) => b.lubricationFilm > 0.5).length;
  const wellLubricatedFraction = r4(wellLubricatedCount / n);

  // Gini coefficient on tribologyFactor distribution
  const tfFactors = binTribologies.map((b) => b.tribologyFactor);
  const sortedFactors = [...tfFactors].sort((a, b) => b - a);
  const totalFactors = sortedFactors.reduce((s, v) => s + v, 0);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedFactors[i];
  }
  const tribologyGini = totalFactors > 0
    ? r4(Math.abs(giniSum) / (n * totalFactors))
    : 0;

  // Composite tribology index (0-100)
  // Rewards low friction, thick lubrication, minimal wear, and high fatigue life
  const frictionScore     = Math.min(25, (1 - avgFrictionCoefficient) * 25);
  const lubricationScore  = Math.min(25, avgLubricationFilm * 25);
  const wearScore         = Math.min(25, (1 - avgWearRate) * 25);
  const durabilityScore   = Math.min(25, avgFatigueLife * 25);
  const tribologyIndex    = Math.round(
    Math.min(100, frictionScore + lubricationScore + wearScore + durabilityScore)
  );

  // Tribological regime classification
  let tribologicalRegime: string;
  if (tribologyIndex >= 80)      tribologicalRegime = "HYDRODYNAMIC";
  else if (tribologyIndex >= 60) tribologicalRegime = "ELASTOHYDRODYNAMIC";
  else if (tribologyIndex >= 40) tribologicalRegime = "MIXED_LUBRICATION";
  else if (tribologyIndex >= 20) tribologicalRegime = "BOUNDARY_LUBRICATION";
  else                           tribologicalRegime = "DRY_CONTACT";

  // Verdict classification
  let tribologyVerdict: string;
  if (avgFrictionCoefficient < 0.2 && avgLubricationFilm > 0.5)
    tribologyVerdict = "FRICTIONLESS_FLOW";
  else if (avgWearRate < 0.3 && avgFrictionCoefficient >= 0.2 && avgFatigueLife > 0.5)
    tribologyVerdict = "WEAR_RESISTANT";
  else if (avgAdhesionStrength > 0.5 && avgStaticFriction > 0.4)
    tribologyVerdict = "ADHESIVE_LOCK";
  else if (avgAbrasionIndex > 0.4 && avgLubricationFilm < 0.4)
    tribologyVerdict = "ABRASIVE_EROSION";
  else if (avgFatigueLife < 0.3 && avgHertzianStress > 4)
    tribologyVerdict = "FATIGUE_FAILURE";
  else
    tribologyVerdict = "WEAR_RESISTANT";

  const topBins = [...binTribologies]
    .sort((a, b) => b.tribologyFactor - a.tribologyFactor)
    .slice(0, 10);

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    volume24hUsd: r2(volume),
    avgFrictionCoefficient,
    maxFrictionCoefficient,
    avgStaticFriction,
    maxStaticFriction,
    avgKineticFriction,
    maxKineticFriction,
    avgLubricationFilm,
    minLubricationFilm,
    avgWearRate,
    maxWearRate,
    avgSurfaceRoughness,
    maxSurfaceRoughness,
    avgContactPressure,
    maxContactPressure,
    avgAdhesionStrength,
    maxAdhesionStrength,
    avgAbrasionIndex,
    maxAbrasionIndex,
    avgFatigueLife,
    minFatigueLife,
    avgTriboFilm,
    maxTriboFilm,
    avgRestitution,
    maxRestitution,
    avgHertzianStress,
    maxHertzianStress,
    avgStribeckParameter,
    maxStribeckParameter,
    highFrictionCount,
    highFrictionFraction,
    wellLubricatedCount,
    wellLubricatedFraction,
    tribologyGini,
    tribologyIndex,
    tribologicalRegime,
    tribologyVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Tribology — Doctor ===\n");
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

  const profiles: TribologyProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeTribology(bins, pool));
    } catch {
      continue;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const summary = {
    poolsAnalyzed: profiles.length,
    avgTribologyIndex: profiles.length > 0
      ? r2(avg(profiles.map((p) => p.tribologyIndex)))
      : 0,
    hydrodynamicCount:          profiles.filter((p) => p.tribologicalRegime === "HYDRODYNAMIC").length,
    elastohydrodynamicCount:    profiles.filter((p) => p.tribologicalRegime === "ELASTOHYDRODYNAMIC").length,
    mixedLubricationCount:      profiles.filter((p) => p.tribologicalRegime === "MIXED_LUBRICATION").length,
    boundaryLubricationCount:   profiles.filter((p) => p.tribologicalRegime === "BOUNDARY_LUBRICATION").length,
    dryContactCount:            profiles.filter((p) => p.tribologicalRegime === "DRY_CONTACT").length,
    avgFrictionCoefficient: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgFrictionCoefficient)))
      : 0,
    avgLubricationFilm: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgLubricationFilm)))
      : 0,
    avgWearRate: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.avgWearRate)))
      : 0,
    totalHighFrictionBins: profiles.reduce((s, p) => s + p.highFrictionCount, 0),
    totalWellLubricatedBins: profiles.reduce((s, p) => s + p.wellLubricatedCount, 0),
    avgTribologyGini: profiles.length > 0
      ? r4(avg(profiles.map((p) => p.tribologyGini)))
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-tribology").description("HODLMM bin tribology analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin tribology dynamics")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
