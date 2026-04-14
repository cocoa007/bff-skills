#!/usr/bin/env bun
/**
 * hodlmm-bin-gravity.ts
 *
 * HODLMM Gravitational Liquidity Model — Treats bin liquidity as "mass" and
 * measures gravitational pull toward high-liquidity bins using an inverse-square
 * law. Identifies gravity wells (bins that attract trade flow), repulsion zones
 * (areas where liquidity is fleeing), equilibrium points where buy/sell forces
 * balance, and tidal asymmetries between sides of the orderbook.
 *
 * Key metrics:
 *  - Gravity score per bin (based on liquidity "mass" and distance from active bin)
 *  - Gravity wells: bins/regions with strongest pull (highest concentration)
 *  - Repulsion zones: bins with declining/minimal liquidity that push flow away
 *  - Gravitational center: the "center of mass" of all liquidity (weighted avg bin)
 *  - Tidal forces: asymmetry between buy-side vs sell-side gravitational pull
 *  - Equilibrium point: where buy/sell gravity balances
 *  - Active bin offset from gravitational center (divergence signal)
 *  - ASCII gravity map visualization showing pull direction per bin
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 76).
 */

import { Command } from "commander";

// -- Constants ----------------------------------------------------------------

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 25;
const REPULSION_THRESHOLD = 0.05; // bins below 5% of avg are repulsion zones
const WELL_THRESHOLD_MULT = 2.0; // bins above 2x avg gravity are wells

// -- Types --------------------------------------------------------------------

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
  balanceRatio: number;
}

interface BinGravity {
  binId: number;
  mass: number; // totalUsd
  gravityScore: number; // total gravitational pull this bin exerts on active bin
  netFieldAtBin: number; // net gravitational field felt AT this bin from all others
  fieldDirection: "PULL_UP" | "PULL_DOWN" | "NEUTRAL"; // net pull direction
  isWell: boolean;
  isRepulsion: boolean;
  distFromActive: number;
  distFromCenter: number;
}

interface GravityWell {
  binId: number;
  mass: number;
  gravityScore: number;
  rank: number;
  side: "BUY" | "SELL" | "ACTIVE";
  distFromActive: number;
}

interface RepulsionZone {
  startBin: number;
  endBin: number;
  width: number;
  avgMass: number;
  side: "BUY" | "SELL";
  distFromActive: number;
}

type GravityPattern =
  | "BALANCED" // symmetric gravity on both sides
  | "BUY_HEAVY" // gravity pulls toward buy side
  | "SELL_HEAVY" // gravity pulls toward sell side
  | "CONCENTRATED" // nearly all mass at/near active bin
  | "DISPERSED" // mass spread with no clear center
  | "EMPTY"; // no meaningful liquidity

interface GravityAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  totalMass: number;
  gravitationalCenter: number;
  centerOffset: number; // active bin - gravitational center
  centerOffsetDirection: "BUY_SIDE" | "SELL_SIDE" | "CENTERED";
  equilibriumBin: number;
  equilibriumOffset: number;
  buySideGravity: number;
  sellSideGravity: number;
  tidalForce: number; // |buy - sell| / total
  tidalDirection: "BUY" | "SELL" | "BALANCED";
  pattern: GravityPattern;
  wells: GravityWell[];
  repulsionZones: RepulsionZone[];
  binGravities: BinGravity[];
  recommendation: string;
  asciiMap: string;
}

// -- Helpers ------------------------------------------------------------------

async function fetchJson(url: string): Promise<any> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`);
  return resp.json();
}

async function callReadOnly(fn: string, args: string[]): Promise<any> {
  const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/${fn}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sender: SENDER, arguments: args }),
  });
  if (!resp.ok) throw new Error(`Contract call ${fn} failed: HTTP ${resp.status}`);
  return resp.json();
}

function uintCV(n: number): string {
  const hex = n.toString(16).padStart(32, "0");
  return `0x01${hex}`;
}

function parseUintResult(result: any): number {
  if (!result?.result) return 0;
  const hex = result.result.replace("0x", "");
  if (hex.startsWith("07")) {
    const inner = hex.slice(2);
    const valHex = inner.slice(2);
    return parseInt(valHex, 16) || 0;
  }
  if (hex.startsWith("01")) return parseInt(hex.slice(2), 16) || 0;
  return 0;
}

function formatUsd(n: number): string {
  if (n < 0) return "N/A";
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(6)}`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

// -- Pool Data ----------------------------------------------------------------

let _poolCache: AppPool[] | null = null;

async function fetchAllPools(): Promise<AppPool[]> {
  if (_poolCache) return _poolCache;
  const data = await fetchJson(`${BFF_APP_BASE}/pools/hodlmm`);
  const pools: AppPool[] = (data?.pools || data || []).map((p: any) => ({
    id: p.id ?? p.poolId ?? "?",
    token0Symbol: p.token0Symbol ?? p.tokenXSymbol ?? "?",
    token1Symbol: p.token1Symbol ?? p.tokenYSymbol ?? "?",
    tvlUsd: parseFloat(p.tvlUsd ?? p.tvl ?? "0"),
    volume24hUsd: parseFloat(p.volume24hUsd ?? p.volume24h ?? "0"),
    poolId: parseInt(p.poolId ?? p.id ?? "0"),
    token0Decimals: parseInt(p.token0Decimals ?? p.tokenXDecimals ?? "6"),
    token1Decimals: parseInt(p.token1Decimals ?? p.tokenYDecimals ?? "6"),
    token0PriceUsd: parseFloat(p.token0PriceUsd ?? p.tokenXPriceUsd ?? "0"),
    token1PriceUsd: parseFloat(p.token1PriceUsd ?? p.tokenYPriceUsd ?? "0"),
    activeBinId: parseInt(p.activeBinId ?? "0") || undefined,
    feeBps: parseFloat(p.feeBps ?? p.fee ?? "30"),
  }));
  _poolCache = pools.filter((p) => p.tvlUsd >= MIN_TVL_USD);
  return _poolCache;
}

async function getActiveBin(poolId: number): Promise<number> {
  const result = await callReadOnly("get-active-bin-id", [uintCV(poolId)]);
  return parseUintResult(result);
}

async function fetchBinReserves(
  poolId: number,
  activeBinId: number,
  pool: AppPool
): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const start = activeBinId - BIN_SCAN_RADIUS;
  const end = activeBinId + BIN_SCAN_RADIUS;

  for (let binId = start; binId <= end; binId++) {
    try {
      const result = await callReadOnly("get-bin", [uintCV(poolId), uintCV(binId)]);
      const parsed = parseUintResult(result);
      if (parsed > 0) {
        const priceSum = pool.token0PriceUsd + pool.token1PriceUsd + 0.001;
        const ratioX = pool.token0PriceUsd / priceSum;
        const reserveX = parsed * ratioX;
        const reserveY = parsed * (1 - ratioX);
        const reserveXUsd =
          (reserveX / Math.pow(10, pool.token0Decimals)) * pool.token0PriceUsd;
        const reserveYUsd =
          (reserveY / Math.pow(10, pool.token1Decimals)) * pool.token1PriceUsd;
        const totalUsd = reserveXUsd + reserveYUsd;
        const balanceRatio = totalUsd > 0 ? reserveXUsd / totalUsd : 0.5;
        bins.push({ binId, reserveX, reserveY, reserveXUsd, reserveYUsd, totalUsd, balanceRatio });
      } else {
        bins.push({
          binId,
          reserveX: 0,
          reserveY: 0,
          reserveXUsd: 0,
          reserveYUsd: 0,
          totalUsd: 0,
          balanceRatio: 0.5,
        });
      }
    } catch {
      bins.push({
        binId,
        reserveX: 0,
        reserveY: 0,
        reserveXUsd: 0,
        reserveYUsd: 0,
        totalUsd: 0,
        balanceRatio: 0.5,
      });
    }
  }
  return bins;
}

// -- Gravity Calculations -----------------------------------------------------

/**
 * Compute the gravitational pull that bin `source` exerts on bin `target`.
 * Uses inverse-square law: G = mass / distance^2.
 * Returns signed value: positive = pull toward higher bin IDs, negative = lower.
 */
function gravitationalPull(source: BinReserves, targetBinId: number): number {
  const dist = source.binId - targetBinId;
  if (dist === 0) return 0;
  const absDist = Math.abs(dist);
  const magnitude = source.totalUsd / (absDist * absDist);
  return dist > 0 ? magnitude : -magnitude; // positive = source is above target
}

/**
 * Compute gravitational center of mass: weighted average bin position.
 */
function computeGravitationalCenter(bins: BinReserves[]): number {
  let weightedSum = 0;
  let totalMass = 0;
  for (const b of bins) {
    if (b.totalUsd > 0) {
      weightedSum += b.binId * b.totalUsd;
      totalMass += b.totalUsd;
    }
  }
  return totalMass > 0 ? weightedSum / totalMass : 0;
}

/**
 * Find the equilibrium bin where buy-side and sell-side gravity balance.
 * Walks from lowest to highest bin, tracking cumulative gravity from each side.
 */
function findEquilibriumBin(bins: BinReserves[], activeBinId: number): number {
  const populated = bins.filter((b) => b.totalUsd > 0);
  if (populated.length === 0) return activeBinId;

  let bestBin = activeBinId;
  let minImbalance = Infinity;

  for (const candidate of bins) {
    let pullBelow = 0; // gravity from bins below this candidate
    let pullAbove = 0; // gravity from bins above this candidate

    for (const src of populated) {
      if (src.binId === candidate.binId) continue;
      const dist = Math.abs(src.binId - candidate.binId);
      const force = src.totalUsd / (dist * dist);
      if (src.binId < candidate.binId) {
        pullBelow += force;
      } else {
        pullAbove += force;
      }
    }

    const imbalance = Math.abs(pullAbove - pullBelow);
    if (imbalance < minImbalance) {
      minImbalance = imbalance;
      bestBin = candidate.binId;
    }
  }

  return bestBin;
}

/**
 * Compute per-bin gravity metrics for the entire scan range.
 */
function computeBinGravities(
  bins: BinReserves[],
  activeBinId: number,
  gravCenter: number
): BinGravity[] {
  const populated = bins.filter((b) => b.totalUsd > 0);
  const totalMass = populated.reduce((s, b) => s + b.totalUsd, 0);
  const avgMass = populated.length > 0 ? totalMass / populated.length : 0;

  // Compute gravity score each bin exerts on the active bin
  const gravities: BinGravity[] = bins.map((bin) => {
    const distFromActive = bin.binId - activeBinId;
    const absDist = Math.abs(distFromActive);
    const gravityScore =
      absDist === 0 ? bin.totalUsd : bin.totalUsd / (absDist * absDist);

    // Net gravitational field felt AT this bin from all others
    let netField = 0;
    for (const src of populated) {
      if (src.binId === bin.binId) continue;
      netField += gravitationalPull(src, bin.binId);
    }

    const fieldDirection: "PULL_UP" | "PULL_DOWN" | "NEUTRAL" =
      netField > avgMass * 0.01
        ? "PULL_UP"
        : netField < -avgMass * 0.01
          ? "PULL_DOWN"
          : "NEUTRAL";

    const isWell = gravityScore >= avgMass * WELL_THRESHOLD_MULT && bin.totalUsd > 0;
    const isRepulsion =
      bin.totalUsd > 0 && bin.totalUsd < avgMass * REPULSION_THRESHOLD;

    return {
      binId: bin.binId,
      mass: bin.totalUsd,
      gravityScore: Math.round(gravityScore * 100) / 100,
      netFieldAtBin: Math.round(netField * 100) / 100,
      fieldDirection,
      isWell,
      isRepulsion: bin.totalUsd === 0 ? false : isRepulsion,
      distFromActive,
      distFromCenter: Math.round((bin.binId - gravCenter) * 100) / 100,
    };
  });

  return gravities;
}

/**
 * Identify gravity wells -- bins with outsized gravitational pull.
 */
function identifyWells(
  binGravities: BinGravity[],
  activeBinId: number,
  maxWells: number
): GravityWell[] {
  const wells = binGravities
    .filter((bg) => bg.isWell)
    .sort((a, b) => b.gravityScore - a.gravityScore)
    .slice(0, maxWells)
    .map((bg, idx) => ({
      binId: bg.binId,
      mass: Math.round(bg.mass * 100) / 100,
      gravityScore: bg.gravityScore,
      rank: idx + 1,
      side:
        bg.binId === activeBinId
          ? ("ACTIVE" as const)
          : bg.binId < activeBinId
            ? ("BUY" as const)
            : ("SELL" as const),
      distFromActive: bg.distFromActive,
    }));

  return wells;
}

/**
 * Identify repulsion zones -- contiguous regions of very low liquidity.
 */
function identifyRepulsionZones(
  bins: BinReserves[],
  binGravities: BinGravity[],
  activeBinId: number
): RepulsionZone[] {
  const zones: RepulsionZone[] = [];
  let currentZone: BinGravity[] = [];

  const avgMass =
    bins.filter((b) => b.totalUsd > 0).reduce((s, b) => s + b.totalUsd, 0) /
    Math.max(bins.filter((b) => b.totalUsd > 0).length, 1);

  for (const bg of binGravities) {
    const isLow = bg.mass === 0 || bg.mass < avgMass * REPULSION_THRESHOLD;
    if (isLow) {
      currentZone.push(bg);
    } else {
      if (currentZone.length >= 2) {
        const startBin = currentZone[0].binId;
        const endBin = currentZone[currentZone.length - 1].binId;
        const zoneAvg =
          currentZone.reduce((s, b) => s + b.mass, 0) / currentZone.length;
        zones.push({
          startBin,
          endBin,
          width: endBin - startBin + 1,
          avgMass: Math.round(zoneAvg * 100) / 100,
          side: startBin < activeBinId ? "BUY" : "SELL",
          distFromActive: Math.min(
            Math.abs(startBin - activeBinId),
            Math.abs(endBin - activeBinId)
          ),
        });
      }
      currentZone = [];
    }
  }

  // flush remaining zone
  if (currentZone.length >= 2) {
    const startBin = currentZone[0].binId;
    const endBin = currentZone[currentZone.length - 1].binId;
    const zoneAvg =
      currentZone.reduce((s, b) => s + b.mass, 0) / currentZone.length;
    zones.push({
      startBin,
      endBin,
      width: endBin - startBin + 1,
      avgMass: Math.round(zoneAvg * 100) / 100,
      side: startBin < activeBinId ? "BUY" : "SELL",
      distFromActive: Math.min(
        Math.abs(startBin - activeBinId),
        Math.abs(endBin - activeBinId)
      ),
    });
  }

  return zones.sort((a, b) => b.width - a.width);
}

/**
 * Compute buy-side and sell-side gravity relative to the active bin.
 */
function computeTidalForces(
  bins: BinReserves[],
  activeBinId: number
): { buySide: number; sellSide: number; tidalForce: number; direction: "BUY" | "SELL" | "BALANCED" } {
  let buySide = 0;
  let sellSide = 0;

  for (const bin of bins) {
    if (bin.totalUsd === 0 || bin.binId === activeBinId) continue;
    const dist = Math.abs(bin.binId - activeBinId);
    const force = bin.totalUsd / (dist * dist);
    if (bin.binId < activeBinId) {
      buySide += force;
    } else {
      sellSide += force;
    }
  }

  const total = buySide + sellSide;
  const tidalForce = total > 0 ? Math.abs(buySide - sellSide) / total : 0;
  const direction: "BUY" | "SELL" | "BALANCED" =
    tidalForce < 0.1 ? "BALANCED" : buySide > sellSide ? "BUY" : "SELL";

  return {
    buySide: Math.round(buySide * 100) / 100,
    sellSide: Math.round(sellSide * 100) / 100,
    tidalForce: Math.round(tidalForce * 1000) / 1000,
    direction,
  };
}

/**
 * Classify the overall gravity pattern.
 */
function classifyPattern(
  tidalForce: number,
  tidalDir: string,
  wells: GravityWell[],
  repulsionZones: RepulsionZone[],
  populationRate: number
): GravityPattern {
  if (populationRate < 0.1) return "EMPTY";

  const activeWells = wells.filter((w) => w.side === "ACTIVE");
  const hasStrongCenter =
    activeWells.length > 0 && activeWells[0].rank === 1;

  if (hasStrongCenter && tidalForce < 0.15) return "CONCENTRATED";
  if (tidalForce < 0.15) return "BALANCED";
  if (repulsionZones.length >= 3 && tidalForce < 0.3) return "DISPERSED";
  if (tidalDir === "BUY") return "BUY_HEAVY";
  if (tidalDir === "SELL") return "SELL_HEAVY";
  return "BALANCED";
}

// -- ASCII Gravity Map --------------------------------------------------------

function buildAsciiGravityMap(
  bins: BinReserves[],
  binGravities: BinGravity[],
  wells: GravityWell[],
  activeBinId: number,
  gravCenter: number,
  equilibriumBin: number
): string {
  const lines: string[] = [];
  lines.push("  Gravitational Field Map");
  lines.push("  ============================================================");
  lines.push("  Legend: # = mass  < = pull down  > = pull up  * = well");
  lines.push(`         @ = active bin  G = grav center  E = equilibrium`);
  lines.push("");

  const maxMass = Math.max(...bins.map((b) => b.totalUsd), 0.01);
  const maxField = Math.max(
    ...binGravities.map((bg) => Math.abs(bg.netFieldAtBin)),
    0.01
  );
  const barWidth = 30;
  const fieldWidth = 15;
  const wellBinIds = new Set(wells.map((w) => w.binId));
  const roundedCenter = Math.round(gravCenter);

  for (let i = 0; i < bins.length; i++) {
    const bin = bins[i];
    const bg = binGravities[i];
    const dist = bin.binId - activeBinId;
    const distStr = dist >= 0 ? `+${dist}`.padStart(4) : `${dist}`.padStart(4);

    // Markers column
    let marker = " ";
    if (bin.binId === activeBinId) marker = "@";
    else if (bin.binId === roundedCenter) marker = "G";
    else if (bin.binId === equilibriumBin) marker = "E";

    // Mass bar
    const massLen = Math.max(0, Math.round((bin.totalUsd / maxMass) * barWidth));
    const massChar = wellBinIds.has(bin.binId) ? "*" : "#";
    const massBar = bin.totalUsd > 0 ? massChar.repeat(Math.max(1, massLen)) : "";

    // Field direction arrow
    const fieldMag = Math.abs(bg.netFieldAtBin);
    const arrowLen = Math.max(0, Math.round((fieldMag / maxField) * fieldWidth));
    let fieldViz: string;
    if (bg.fieldDirection === "PULL_UP") {
      fieldViz = ">".repeat(Math.max(1, arrowLen));
    } else if (bg.fieldDirection === "PULL_DOWN") {
      fieldViz = "<".repeat(Math.max(1, arrowLen));
    } else {
      fieldViz = "-";
    }

    const massStr = bin.totalUsd > 0 ? formatUsd(bin.totalUsd) : "";
    lines.push(
      `  ${marker}${distStr} |${massBar.padEnd(barWidth)}| ${fieldViz.padEnd(fieldWidth)} ${massStr}`
    );
  }

  lines.push("");
  lines.push(`  Gravitational Center: bin ${gravCenter.toFixed(1)} (offset ${(activeBinId - gravCenter).toFixed(1)} from active)`);
  lines.push(`  Equilibrium Point:    bin ${equilibriumBin}`);
  lines.push("");

  return lines.join("\n");
}

// -- Command Handlers ---------------------------------------------------------

async function runDoctor(): Promise<void> {
  const results: Record<string, string> = {};

  try {
    await fetchJson(`${BFF_APP_BASE}/pools/hodlmm`);
    results["bitflow_app_api"] = "ok";
  } catch (e: any) {
    results["bitflow_app_api"] = `error: ${e.message}`;
  }

  try {
    await fetchJson(`${HIRO_API}/v2/info`);
    results["hiro_api"] = "ok";
  } catch (e: any) {
    results["hiro_api"] = `error: ${e.message}`;
  }

  try {
    const testResult = await callReadOnly("get-active-bin-id", [uintCV(1)]);
    results["dlmm_contract"] = testResult.result ? "ok" : "no result";
  } catch (e: any) {
    results["dlmm_contract"] = `error: ${e.message}`;
  }

  console.log(
    JSON.stringify({
      tool: "hodlmm-bin-gravity",
      command: "doctor",
      status: Object.values(results).every((v) => v.startsWith("ok"))
        ? "healthy"
        : "degraded",
      checks: results,
      timestamp: new Date().toISOString(),
    })
  );
}

async function runInstallPacks(): Promise<void> {
  console.log(
    JSON.stringify({
      tool: "hodlmm-bin-gravity",
      command: "install-packs",
      status: "ok",
      message:
        "No additional dependencies required. Uses commander (workspace) + native fetch.",
      timestamp: new Date().toISOString(),
    })
  );
}

async function runAnalyze(options: { pool: string }): Promise<void> {
  const poolId = parseInt(options.pool);
  if (isNaN(poolId)) {
    console.log(
      JSON.stringify({
        tool: "hodlmm-bin-gravity",
        command: "run",
        timestamp: new Date().toISOString(),
        error: "Invalid pool ID -- provide a numeric pool ID with --pool",
      })
    );
    return;
  }

  const pools = await fetchAllPools();
  const pool = pools.find((p) => p.poolId === poolId);

  if (!pool) {
    console.log(
      JSON.stringify({
        tool: "hodlmm-bin-gravity",
        command: "run",
        timestamp: new Date().toISOString(),
        error: `Pool ${poolId} not found or below TVL threshold ($${MIN_TVL_USD})`,
      })
    );
    return;
  }

  const activeBinId = pool.activeBinId || (await getActiveBin(poolId));
  if (!activeBinId) {
    console.log(
      JSON.stringify({
        tool: "hodlmm-bin-gravity",
        command: "run",
        timestamp: new Date().toISOString(),
        error: `Could not determine active bin for pool ${poolId}`,
      })
    );
    return;
  }

  const rawBins = await fetchBinReserves(poolId, activeBinId, pool);
  const binsPopulated = rawBins.filter((b) => b.totalUsd > 0).length;
  const totalMass = rawBins.reduce((s, b) => s + b.totalUsd, 0);
  const populationRate =
    rawBins.length > 0 ? binsPopulated / rawBins.length : 0;

  // Gravity computations
  const gravCenter = computeGravitationalCenter(rawBins);
  const equilibriumBin = findEquilibriumBin(rawBins, activeBinId);
  const binGravities = computeBinGravities(rawBins, activeBinId, gravCenter);
  const wells = identifyWells(binGravities, activeBinId, 5);
  const repulsionZones = identifyRepulsionZones(rawBins, binGravities, activeBinId);
  const tidal = computeTidalForces(rawBins, activeBinId);

  const centerOffset = activeBinId - gravCenter;
  const centerOffsetDirection: "BUY_SIDE" | "SELL_SIDE" | "CENTERED" =
    Math.abs(centerOffset) < 0.5
      ? "CENTERED"
      : centerOffset > 0
        ? "SELL_SIDE"
        : "BUY_SIDE";

  const pattern = classifyPattern(
    tidal.tidalForce,
    tidal.direction,
    wells,
    repulsionZones,
    populationRate
  );

  const asciiMap = buildAsciiGravityMap(
    rawBins,
    binGravities,
    wells,
    activeBinId,
    gravCenter,
    equilibriumBin
  );

  // Generate recommendation
  let recommendation: string;
  switch (pattern) {
    case "EMPTY":
      recommendation =
        "No meaningful liquidity in scan range. Pool may be inactive or liquidity is outside the scanned window.";
      break;
    case "CONCENTRATED":
      recommendation = `Liquidity highly concentrated near active bin. Gravitational center is only ${Math.abs(centerOffset).toFixed(1)} bins from active. `;
      recommendation +=
        "Tight LP ranges are well-supported. Watch for sudden mass migration if price moves sharply.";
      break;
    case "BALANCED":
      recommendation = `Symmetric gravity distribution (tidal force ${pct(tidal.tidalForce)}). `;
      recommendation += `${wells.length} gravity well(s) anchor liquidity. `;
      recommendation +=
        "Balanced pools are stable for LP -- position around the equilibrium point for best fee capture.";
      break;
    case "BUY_HEAVY":
      recommendation = `Buy-side gravity dominates (${pct(tidal.tidalForce)} tidal asymmetry). `;
      recommendation += `Gravitational center at bin ${gravCenter.toFixed(0)} is ${Math.abs(centerOffset).toFixed(1)} bins below active. `;
      recommendation +=
        "Price may drift downward toward the mass center. Consider LP positions skewed toward buy side.";
      break;
    case "SELL_HEAVY":
      recommendation = `Sell-side gravity dominates (${pct(tidal.tidalForce)} tidal asymmetry). `;
      recommendation += `Gravitational center at bin ${gravCenter.toFixed(0)} is ${Math.abs(centerOffset).toFixed(1)} bins above active. `;
      recommendation +=
        "Price may drift upward toward the mass center. Consider LP positions skewed toward sell side.";
      break;
    case "DISPERSED":
      recommendation = `Dispersed mass with ${repulsionZones.length} repulsion zone(s) and weak gravitational anchors. `;
      recommendation +=
        "No strong pull in any direction. Wide LP ranges needed but fee efficiency will be low.";
      break;
  }

  const out: GravityAnalysis = {
    poolId,
    pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
    tvlUsd: Math.round(pool.tvlUsd),
    volume24hUsd: Math.round(pool.volume24hUsd),
    feeBps: pool.feeBps || 30,
    activeBinId,
    binsScanned: rawBins.length,
    binsPopulated,
    totalMass: Math.round(totalMass * 100) / 100,
    gravitationalCenter: Math.round(gravCenter * 100) / 100,
    centerOffset: Math.round(centerOffset * 100) / 100,
    centerOffsetDirection,
    equilibriumBin,
    equilibriumOffset: equilibriumBin - activeBinId,
    buySideGravity: tidal.buySide,
    sellSideGravity: tidal.sellSide,
    tidalForce: tidal.tidalForce,
    tidalDirection: tidal.direction,
    pattern,
    wells,
    repulsionZones,
    binGravities,
    recommendation,
    asciiMap,
  };

  console.log(
    JSON.stringify(
      {
        tool: "hodlmm-bin-gravity",
        command: "run",
        timestamp: new Date().toISOString(),
        ...out,
      },
      null,
      2
    )
  );
}

async function runScan(options: {
  top?: string;
  minTvl?: string;
  sort?: string;
}): Promise<void> {
  const topN = parseInt(options.top || "10");
  const minTvl = parseFloat(options.minTvl || String(MIN_TVL_USD));
  const sortBy = options.sort || "tidal";

  const pools = (await fetchAllPools()).filter((p) => p.tvlUsd >= minTvl);

  if (pools.length === 0) {
    console.log(
      JSON.stringify({
        tool: "hodlmm-bin-gravity",
        command: "scan",
        timestamp: new Date().toISOString(),
        error: "No pools found above TVL threshold",
      })
    );
    return;
  }

  const poolResults: any[] = [];

  for (const pool of pools.slice(0, topN * 2)) {
    try {
      const activeBinId =
        pool.activeBinId || (await getActiveBin(pool.poolId!));
      if (!activeBinId) continue;

      const radius = 15;
      const rawBins: BinReserves[] = [];
      for (
        let binId = activeBinId - radius;
        binId <= activeBinId + radius;
        binId++
      ) {
        try {
          const result = await callReadOnly("get-bin", [
            uintCV(pool.poolId!),
            uintCV(binId),
          ]);
          const parsed = parseUintResult(result);
          if (parsed > 0) {
            const priceSum =
              pool.token0PriceUsd + pool.token1PriceUsd + 0.001;
            const ratioX = pool.token0PriceUsd / priceSum;
            const reserveX = parsed * ratioX;
            const reserveY = parsed * (1 - ratioX);
            const reserveXUsd =
              (reserveX / Math.pow(10, pool.token0Decimals)) *
              pool.token0PriceUsd;
            const reserveYUsd =
              (reserveY / Math.pow(10, pool.token1Decimals)) *
              pool.token1PriceUsd;
            const totalUsd = reserveXUsd + reserveYUsd;
            const balanceRatio = totalUsd > 0 ? reserveXUsd / totalUsd : 0.5;
            rawBins.push({
              binId,
              reserveX,
              reserveY,
              reserveXUsd,
              reserveYUsd,
              totalUsd,
              balanceRatio,
            });
          } else {
            rawBins.push({
              binId,
              reserveX: 0,
              reserveY: 0,
              reserveXUsd: 0,
              reserveYUsd: 0,
              totalUsd: 0,
              balanceRatio: 0.5,
            });
          }
        } catch {
          rawBins.push({
            binId,
            reserveX: 0,
            reserveY: 0,
            reserveXUsd: 0,
            reserveYUsd: 0,
            totalUsd: 0,
            balanceRatio: 0.5,
          });
        }
      }

      const binsPopulated = rawBins.filter((b) => b.totalUsd > 0).length;
      const populationRate =
        rawBins.length > 0 ? binsPopulated / rawBins.length : 0;
      const gravCenter = computeGravitationalCenter(rawBins);
      const centerOffset = activeBinId - gravCenter;
      const tidal = computeTidalForces(rawBins, activeBinId);
      const binGravities = computeBinGravities(rawBins, activeBinId, gravCenter);
      const wells = identifyWells(binGravities, activeBinId, 3);
      const repulsionZones = identifyRepulsionZones(
        rawBins,
        binGravities,
        activeBinId
      );
      const pattern = classifyPattern(
        tidal.tidalForce,
        tidal.direction,
        wells,
        repulsionZones,
        populationRate
      );

      poolResults.push({
        poolId: pool.poolId,
        pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
        tvlUsd: Math.round(pool.tvlUsd),
        volume24hUsd: Math.round(pool.volume24hUsd),
        pattern,
        gravitationalCenter: Math.round(gravCenter * 10) / 10,
        centerOffset: Math.round(centerOffset * 10) / 10,
        tidalForce: tidal.tidalForce,
        tidalDirection: tidal.direction,
        buySideGravity: tidal.buySide,
        sellSideGravity: tidal.sellSide,
        wellCount: wells.length,
        repulsionZones: repulsionZones.length,
        binsPopulated,
        populationRate: Math.round(populationRate * 100),
      });
    } catch {
      /* skip pool */
    }
  }

  // Sort results
  if (sortBy === "offset") {
    poolResults.sort(
      (a, b) => Math.abs(b.centerOffset) - Math.abs(a.centerOffset)
    );
  } else if (sortBy === "wells") {
    poolResults.sort((a, b) => b.wellCount - a.wellCount);
  } else if (sortBy === "repulsion") {
    poolResults.sort((a, b) => b.repulsionZones - a.repulsionZones);
  } else {
    // default: tidal
    poolResults.sort((a, b) => b.tidalForce - a.tidalForce);
  }

  const ranked = poolResults.slice(0, topN);

  const avgTidal =
    ranked.length > 0
      ? Math.round(
          (ranked.reduce((s, p) => s + p.tidalForce, 0) / ranked.length) * 1000
        ) / 1000
      : 0;
  const buyHeavy = ranked.filter((p) => p.pattern === "BUY_HEAVY").length;
  const sellHeavy = ranked.filter((p) => p.pattern === "SELL_HEAVY").length;
  const balanced = ranked.filter(
    (p) => p.pattern === "BALANCED" || p.pattern === "CONCENTRATED"
  ).length;

  console.log(
    JSON.stringify(
      {
        tool: "hodlmm-bin-gravity",
        command: "scan",
        timestamp: new Date().toISOString(),
        poolsScanned: poolResults.length,
        sortedBy: sortBy,
        results: ranked,
        summary: {
          avgTidalForce: avgTidal,
          buyHeavyPools: buyHeavy,
          sellHeavyPools: sellHeavy,
          balancedPools: balanced,
        },
        guidance:
          buyHeavy > sellHeavy
            ? `${buyHeavy} pool(s) show buy-side gravitational dominance -- price may drift downward toward concentrated buy liquidity. LPs should consider buy-side skewed positions.`
            : sellHeavy > buyHeavy
              ? `${sellHeavy} pool(s) show sell-side gravitational dominance -- price may drift upward toward sell liquidity concentrations.`
              : `Most pools show balanced gravity (avg tidal force ${avgTidal}). Liquidity distribution is symmetric around active bins.`,
      },
      null,
      2
    )
  );
}

// -- CLI Setup ----------------------------------------------------------------

const program = new Command();

program
  .name("hodlmm-bin-gravity")
  .description(
    "HODLMM Gravitational Liquidity Model -- Measures gravitational pull between bins using inverse-square law to identify wells, repulsion zones, tidal forces, and equilibrium points"
  )
  .version("1.0.0");

program
  .command("doctor")
  .description("Check API connectivity and dependencies")
  .action(runDoctor);

program
  .command("install-packs")
  .description("Install dependencies (none required beyond workspace)")
  .action(runInstallPacks);

program
  .command("run")
  .description(
    "Analyze gravitational liquidity model for a specific pool"
  )
  .requiredOption("--pool <id>", "HODLMM pool ID")
  .action(runAnalyze);

program
  .command("scan")
  .description(
    "Rank pools by gravitational metrics: tidal forces, center offset, wells"
  )
  .option("--top <n>", "Number of pools to show", "10")
  .option("--min-tvl <usd>", "Minimum TVL filter", String(MIN_TVL_USD))
  .option(
    "--sort <by>",
    "Sort by: tidal, offset, wells, repulsion",
    "tidal"
  )
  .action(runScan);

program.parse();
