#!/usr/bin/env bun
/**
 * hodlmm-bin-solvation.ts — Day 140 cocoa007 Bitflow Skills Comp
 *
 * Solvation analyzer — measures how well liquidity dissolves into the bin
 * lattice using solvent-solute chemistry analogies.
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

interface SolvationShell {
  shellNumber: number;
  distance: number;
  binCount: number;
  totalUsd: number;
  avgUsd: number;
  shellDensity: number;
  cumulativeUsd: number;
  retentionRatio: number;
}

interface SolvationProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  soluteUsd: number;
  solventUsd: number;
  soluteRatio: number;
  shellCount: number;
  innerShellUsd: number;
  outerShellUsd: number;
  shellDecayRate: number;
  shellDecayHalfLife: number;
  dissolutionRate: number;
  saturationPoint: number;
  supersaturationRisk: number;
  precipitationRisk: number;
  solubilityIndex: number;
  ionicStrength: number;
  solvationEnergy: number;
  enthalpyOfMixing: number;
  entropyOfMixing: number;
  freeEnergyOfMixing: number;
  osmoticPressure: number;
  colligativeEffect: number;
  firstShellCoordination: number;
  secondShellCoordination: number;
  bulkSolventDensity: number;
  solvationNumber: number;
  debyeLength: number;
  activityCoefficient: number;
  concentrationGini: number;
  solvationIndex: number;
  solvationClass: string;
  solubilityVerdict: string;
  shells: SolvationShell[];
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

function analyzeSolvation(bins: BinReserves[], pool: AppPool): SolvationProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const avgReserve = totalUsd / n;
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;

  // Solute = active bin reserves (the dissolved particle)
  // Solvent = surrounding bin reserves (the dissolving medium)
  const activeBinData = sorted.find((b) => b.binId === activeBin);
  const soluteUsd = activeBinData ? activeBinData.totalUsd : 0;
  const solventUsd = totalUsd - soluteUsd;
  const soluteRatio = totalUsd > 0 ? r4(soluteUsd / totalUsd) : 0;

  // Build solvation shells: concentric layers around the active bin
  const maxShellDist = BIN_SCAN_RADIUS;
  const shells: SolvationShell[] = [];
  let cumulativeUsd = soluteUsd;

  for (let d = 1; d <= maxShellDist; d++) {
    const shellBins = sorted.filter((b) => Math.abs(b.binId - activeBin) === d);
    const shellUsd = shellBins.reduce((s, b) => s + b.totalUsd, 0);
    cumulativeUsd += shellUsd;
    const shellDensity = shellBins.length > 0 ? r4(shellUsd / (shellBins.length * avgReserve)) : 0;
    const retentionRatio = soluteUsd > 0 ? r4(shellUsd / soluteUsd) : 0;

    if (shellBins.length > 0) {
      shells.push({
        shellNumber: d,
        distance: d,
        binCount: shellBins.length,
        totalUsd: r2(shellUsd),
        avgUsd: r2(shellUsd / shellBins.length),
        shellDensity,
        cumulativeUsd: r2(cumulativeUsd),
        retentionRatio,
      });
    }
  }

  const shellCount = shells.length;
  const innerShellUsd = shells.length > 0 ? shells[0].totalUsd : 0;
  const outerShellUsd = shells.length > 0 ? shells[shells.length - 1].totalUsd : 0;

  // Shell decay rate: exponential decay of reserves as distance increases
  // Fit: shellUsd ~ A * exp(-k * distance)
  let shellDecayRate = 0;
  let shellDecayHalfLife = BIN_SCAN_RADIUS;
  if (shells.length >= 3) {
    const logRatios: number[] = [];
    for (let i = 1; i < shells.length; i++) {
      if (shells[i].totalUsd > 0 && shells[i - 1].totalUsd > 0) {
        const ratio = shells[i].totalUsd / shells[i - 1].totalUsd;
        if (ratio > 0 && ratio < 10) {
          logRatios.push(-Math.log(ratio));
        }
      }
    }
    if (logRatios.length > 0) {
      shellDecayRate = r4(logRatios.reduce((s, v) => s + v, 0) / logRatios.length);
      shellDecayHalfLife = shellDecayRate > 0 ? r4(Math.LN2 / shellDecayRate) : BIN_SCAN_RADIUS;
    }
  }

  // Dissolution rate: how evenly liquidity is spread (1.0 = perfectly dissolved)
  // Low value = concentrated/undissolved, high value = well-distributed
  const maxEntropy = Math.log(n);
  const reserves = sorted.map((b) => b.totalUsd);
  const probabilities = reserves.map((r) => totalUsd > 0 ? r / totalUsd : 1 / n);
  const entropy = -probabilities
    .filter((p) => p > 0)
    .reduce((s, p) => s + p * Math.log(p), 0);
  const dissolutionRate = maxEntropy > 0 ? r4(entropy / maxEntropy) : 0;

  // Saturation point: the bin distance at which 90% of total reserves are contained
  let saturationPoint = BIN_SCAN_RADIUS;
  let runningSum = soluteUsd;
  const target90 = totalUsd * 0.9;
  for (const shell of shells) {
    runningSum += shell.totalUsd;
    if (runningSum >= target90) {
      saturationPoint = shell.distance;
      break;
    }
  }

  // Supersaturation risk: ratio of active bin reserves to surrounding shell average
  // If solute >> first shell, the solution is supersaturated (unstable, may precipitate)
  const firstShellAvg = shells.length > 0 ? shells[0].avgUsd : avgReserve;
  const supersaturationRisk = firstShellAvg > 0
    ? r4(Math.max(0, (soluteUsd / firstShellAvg - 1)))
    : 0;

  // Precipitation risk: probability of liquidity "crashing out" of the bin lattice
  // High concentration at center + rapid shell decay + low outer reserves = high risk
  const precipitationRisk = r4(Math.min(1,
    (soluteRatio * 0.4) +
    (shellDecayRate * 0.3) +
    ((1 - dissolutionRate) * 0.3)
  ));

  // Solubility index: composite measure of how well liquidity integrates
  // High dissolution rate + low decay + low supersaturation = high solubility
  const solubilityIndex = r4(
    dissolutionRate * 0.35 +
    (1 - Math.min(1, shellDecayRate)) * 0.25 +
    (1 - Math.min(1, precipitationRisk)) * 0.25 +
    (shellCount / BIN_SCAN_RADIUS) * 0.15
  );

  // Ionic strength: measure of charge density in the bin lattice
  // Uses deviation from average as "charge"
  const ionicStrength = r4(
    sorted.reduce((s, b) => {
      const deviation = (b.totalUsd - avgReserve) / (avgReserve || 1);
      return s + deviation * deviation;
    }, 0) / (2 * n)
  );

  // Solvation energy: energy released when liquidity integrates into the lattice
  // Negative = favorable (exothermic dissolution), positive = unfavorable
  const idealAvg = totalUsd / binsScanned;
  const actualVariance = sorted.reduce((s, b) => s + (b.totalUsd - idealAvg) ** 2, 0) / n;
  const solvationEnergy = r4(-(1 - Math.sqrt(actualVariance) / (idealAvg || 1)));

  // Enthalpy of mixing: heat change from combining reserves
  // Negative = exothermic (favorable mixing), positive = endothermic
  const leftBins = sorted.filter((b) => b.binId < activeBin);
  const rightBins = sorted.filter((b) => b.binId > activeBin);
  const leftAvg = leftBins.length > 0 ? leftBins.reduce((s, b) => s + b.totalUsd, 0) / leftBins.length : 0;
  const rightAvg = rightBins.length > 0 ? rightBins.reduce((s, b) => s + b.totalUsd, 0) / rightBins.length : 0;
  const enthalpyOfMixing = r4(leftAvg > 0 && rightAvg > 0
    ? -Math.abs(leftAvg - rightAvg) / ((leftAvg + rightAvg) / 2)
    : 0);

  // Entropy of mixing: disorder from combining reserves (always positive for mixing)
  const entropyOfMixing = r4(dissolutionRate);

  // Free energy of mixing: enthalpy - T*entropy (negative = spontaneous dissolution)
  const freeEnergyOfMixing = r4(enthalpyOfMixing - entropyOfMixing);

  // Osmotic pressure: pressure from reserve concentration gradient across shells
  const innerConc = shells.length > 0 ? shells[0].shellDensity : 0;
  const outerConc = shells.length > 2 ? shells[shells.length - 1].shellDensity : 0;
  const osmoticPressure = r4(Math.abs(innerConc - outerConc));

  // Colligative effect: how the solute affects the bulk solvent properties
  // Measured as the degree to which the active bin distorts surrounding shells
  const expectedShellUsd = avgReserve * 2;
  const colligativeEffect = expectedShellUsd > 0 && shells.length > 0
    ? r4(Math.abs(shells[0].totalUsd - expectedShellUsd) / expectedShellUsd)
    : 0;

  // Coordination numbers: bins in first and second solvation shells
  const firstShellCoordination = shells.length > 0 ? shells[0].binCount : 0;
  const secondShellCoordination = shells.length > 1 ? shells[1].binCount : 0;

  // Bulk solvent density: average reserve density far from the solute
  const bulkShells = shells.filter((s) => s.distance > BIN_SCAN_RADIUS / 2);
  const bulkSolventDensity = bulkShells.length > 0
    ? r4(bulkShells.reduce((s, sh) => s + sh.shellDensity, 0) / bulkShells.length)
    : 0;

  // Solvation number: effective number of bins strongly influenced by the solute
  const solvationNumber = shells.filter((s) => s.retentionRatio > 0.3).length;

  // Debye length: characteristic screening distance (how quickly solute influence fades)
  let debyeLength = BIN_SCAN_RADIUS;
  for (const shell of shells) {
    if (shell.shellDensity < 0.5) {
      debyeLength = shell.distance;
      break;
    }
  }

  // Activity coefficient: ratio of effective concentration to ideal concentration
  const idealConcentration = 1.0;
  const effectiveConcentration = dissolutionRate;
  const activityCoefficient = r4(effectiveConcentration / idealConcentration);

  // Gini coefficient
  const sortedReserves = [...reserves].sort((a, b) => a - b);
  let giniNum = 0;
  for (let i = 0; i < sortedReserves.length; i++) {
    giniNum += (2 * (i + 1) - sortedReserves.length - 1) * sortedReserves[i];
  }
  const giniDenom = sortedReserves.length * sortedReserves.reduce((s, v) => s + v, 0);
  const concentrationGini = giniDenom > 0 ? r4(giniNum / giniDenom) : 0;

  // Composite solvation index (0-100)
  const dissolutionScore = Math.min(25, dissolutionRate * 25);
  const stabilityScore = Math.min(25, (1 - precipitationRisk) * 25);
  const spreadScore = Math.min(25, (shellCount / BIN_SCAN_RADIUS) * 25);
  const energyScore = Math.min(25, (freeEnergyOfMixing < 0 ? 1 : 0.5) * 25);
  const solvationIndex = Math.round(
    Math.min(100, dissolutionScore + stabilityScore + spreadScore + energyScore)
  );

  let solvationClass: string;
  if (solvationIndex >= 80) solvationClass = "FULLY_DISSOLVED";
  else if (solvationIndex >= 60) solvationClass = "WELL_SOLVATED";
  else if (solvationIndex >= 40) solvationClass = "PARTIALLY_SOLVATED";
  else if (solvationIndex >= 20) solvationClass = "POORLY_SOLVATED";
  else solvationClass = "PRECIPITATED";

  let solubilityVerdict: string;
  if (dissolutionRate > 0.8 && precipitationRisk < 0.2) solubilityVerdict = "HIGHLY_SOLUBLE";
  else if (dissolutionRate > 0.6 && precipitationRisk < 0.4) solubilityVerdict = "SOLUBLE";
  else if (dissolutionRate > 0.4) solubilityVerdict = "SPARINGLY_SOLUBLE";
  else if (dissolutionRate > 0.2) solubilityVerdict = "SLIGHTLY_SOLUBLE";
  else solubilityVerdict = "INSOLUBLE";

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    soluteUsd: r2(soluteUsd),
    solventUsd: r2(solventUsd),
    soluteRatio,
    shellCount,
    innerShellUsd: r2(innerShellUsd),
    outerShellUsd: r2(outerShellUsd),
    shellDecayRate,
    shellDecayHalfLife,
    dissolutionRate,
    saturationPoint,
    supersaturationRisk,
    precipitationRisk,
    solubilityIndex,
    ionicStrength,
    solvationEnergy,
    enthalpyOfMixing,
    entropyOfMixing,
    freeEnergyOfMixing,
    osmoticPressure,
    colligativeEffect,
    firstShellCoordination,
    secondShellCoordination,
    bulkSolventDensity,
    solvationNumber,
    debyeLength,
    activityCoefficient,
    concentrationGini,
    solvationIndex,
    solvationClass,
    solubilityVerdict,
    shells: shells.slice(0, 15),
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Solvation — Doctor ===\n");
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

  const profiles: SolvationProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeSolvation(bins, pool));
    } catch {
      continue;
    }
  }

  const summary = {
    poolsAnalyzed: profiles.length,
    avgSolvationIndex: profiles.length > 0
      ? r2(profiles.reduce((s, p) => s + p.solvationIndex, 0) / profiles.length)
      : 0,
    fullyDissolvedCount: profiles.filter((p) => p.solvationClass === "FULLY_DISSOLVED").length,
    wellSolvatedCount: profiles.filter((p) => p.solvationClass === "WELL_SOLVATED").length,
    partiallySolvatedCount: profiles.filter((p) => p.solvationClass === "PARTIALLY_SOLVATED").length,
    poorlySolvatedCount: profiles.filter((p) => p.solvationClass === "POORLY_SOLVATED").length,
    precipitatedCount: profiles.filter((p) => p.solvationClass === "PRECIPITATED").length,
    avgDissolutionRate: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.dissolutionRate, 0) / profiles.length)
      : 0,
    avgPrecipitationRisk: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.precipitationRisk, 0) / profiles.length)
      : 0,
    avgShellDecayRate: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.shellDecayRate, 0) / profiles.length)
      : 0,
    avgGini: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.concentrationGini, 0) / profiles.length)
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-solvation").description("HODLMM bin solvation analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin solvation")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
