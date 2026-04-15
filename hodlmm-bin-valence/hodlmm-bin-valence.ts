#!/usr/bin/env bun
/**
 * hodlmm-bin-valence.ts — Day 141 cocoa007 Bitflow Skills Comp
 *
 * Valence analyzer — measures the bonding capacity of HODLMM bins,
 * how they form connections with neighbors through shared liquidity.
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
const BOND_THRESHOLD = 0.1;

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

interface BondInfo {
  fromBin: number;
  toBin: number;
  bondStrength: number;
  bondType: string;
  reserveOverlap: number;
  directionality: number;
}

interface BinValenceData {
  binId: number;
  reserveUsd: number;
  valenceNumber: number;
  effectiveValence: number;
  bonds: BondInfo[];
  electronegativity: number;
  ionizationEnergy: number;
  electronAffinity: number;
  covalentRadius: number;
  hybridization: string;
  octetSatisfaction: number;
  bondOrderSum: number;
  formalCharge: number;
  isNobleGas: boolean;
}

interface ValenceProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsScanned: number;
  binsPopulated: number;
  totalUsd: number;
  totalBonds: number;
  avgValenceNumber: number;
  maxValenceNumber: number;
  avgBondStrength: number;
  avgElectronegativity: number;
  avgIonizationEnergy: number;
  avgCovalentRadius: number;
  covalentBondCount: number;
  ionicBondCount: number;
  metallicBondCount: number;
  vanDerWaalsBondCount: number;
  networkConnectivity: number;
  bondDensity: number;
  avgOctetSatisfaction: number;
  nobleGasCount: number;
  avgFormalCharge: number;
  formalChargeSpread: number;
  bondOrderDistribution: { single: number; double: number; triple: number; aromatic: number };
  hybridizationDistribution: { sp: number; sp2: number; sp3: number; unhybridized: number };
  latticeEnergy: number;
  bondDissociationEnergy: number;
  electronegativityRange: number;
  polarizability: number;
  dipoleMoment: number;
  resonanceEnergy: number;
  conjugationLength: number;
  aromaticRingCount: number;
  valenceIndex: number;
  valenceClass: string;
  bondingVerdict: string;
  topBins: BinValenceData[];
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

function classifyBond(strength: number, directionality: number): string {
  if (strength < BOND_THRESHOLD) return "van_der_waals";
  if (directionality > 0.7) return "ionic";
  if (strength > 0.6 && directionality < 0.3) return "metallic";
  return "covalent";
}

function classifyBondOrder(strength: number): { order: number; label: string } {
  if (strength >= 0.8) return { order: 3, label: "triple" };
  if (strength >= 0.55) return { order: 2, label: "double" };
  if (strength >= 0.3) return { order: 1.5, label: "aromatic" };
  if (strength >= BOND_THRESHOLD) return { order: 1, label: "single" };
  return { order: 0, label: "none" };
}

function classifyHybridization(valence: number, bondOrderSum: number): string {
  if (valence <= 1) return "unhybridized";
  const avgOrder = valence > 0 ? bondOrderSum / valence : 0;
  if (avgOrder >= 2.5) return "sp";
  if (avgOrder >= 1.8) return "sp2";
  return "sp3";
}

function computeBinValence(
  bin: BinReserves,
  allBins: BinReserves[],
  avgReserve: number,
  totalUsd: number
): BinValenceData {
  const binMap = new Map(allBins.map((b) => [b.binId, b]));
  const bonds: BondInfo[] = [];

  for (let d = -3; d <= 3; d++) {
    if (d === 0) continue;
    const neighbor = binMap.get(bin.binId + d);
    if (!neighbor) continue;

    const minReserve = Math.min(bin.totalUsd, neighbor.totalUsd);
    const maxReserve = Math.max(bin.totalUsd, neighbor.totalUsd);
    const reserveOverlap = maxReserve > 0 ? minReserve / maxReserve : 0;
    const distanceFactor = 1 / Math.abs(d);
    const bondStrength = r4(reserveOverlap * distanceFactor);
    const directionality = maxReserve > 0
      ? r4(Math.abs(bin.totalUsd - neighbor.totalUsd) / maxReserve)
      : 0;

    if (bondStrength >= BOND_THRESHOLD * 0.5) {
      bonds.push({
        fromBin: bin.binId,
        toBin: neighbor.binId,
        bondStrength,
        bondType: classifyBond(bondStrength, directionality),
        reserveOverlap: r4(reserveOverlap),
        directionality,
      });
    }
  }

  const valenceNumber = bonds.filter((b) => b.bondStrength >= BOND_THRESHOLD).length;
  const effectiveValence = r4(
    bonds.reduce((s, b) => s + b.bondStrength, 0)
  );
  const bondOrderSum = r4(
    bonds.reduce((s, b) => s + classifyBondOrder(b.bondStrength).order, 0)
  );

  const electronegativity = totalUsd > 0
    ? r4(bin.totalUsd / avgReserve)
    : 0;

  const neighborReserves = bonds.map((b) => {
    const nb = binMap.get(b.toBin);
    return nb ? nb.totalUsd : 0;
  });
  const avgNeighborReserve = neighborReserves.length > 0
    ? neighborReserves.reduce((s, v) => s + v, 0) / neighborReserves.length
    : 0;

  const ionizationEnergy = avgReserve > 0
    ? r4(bin.totalUsd / avgReserve * (1 + valenceNumber * 0.1))
    : 0;

  const electronAffinity = avgNeighborReserve > 0
    ? r4((avgNeighborReserve - bin.totalUsd) / avgNeighborReserve)
    : 0;

  const maxBondDist = bonds.length > 0
    ? Math.max(...bonds.map((b) => Math.abs(b.toBin - bin.binId)))
    : 0;
  const covalentRadius = r4(maxBondDist * (effectiveValence / Math.max(1, bonds.length)));

  const hybridization = classifyHybridization(valenceNumber, bondOrderSum);

  const idealValence = 4;
  const octetSatisfaction = r4(Math.min(1, valenceNumber / idealValence));

  const expectedReserve = avgReserve;
  const formalCharge = expectedReserve > 0
    ? r4((bin.totalUsd - expectedReserve) / expectedReserve)
    : 0;

  const isNobleGas = valenceNumber === 0 && bin.totalUsd < avgReserve * 0.1;

  return {
    binId: bin.binId,
    reserveUsd: r2(bin.totalUsd),
    valenceNumber,
    effectiveValence,
    bonds,
    electronegativity,
    ionizationEnergy,
    electronAffinity,
    covalentRadius,
    hybridization,
    octetSatisfaction,
    bondOrderSum,
    formalCharge,
    isNobleGas,
  };
}

function analyzeValence(bins: BinReserves[], pool: AppPool): ValenceProfile {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  const n = sorted.length;
  const activeBin = pool.activeBinId || sorted[Math.floor(n / 2)].binId;
  const totalUsd = sorted.reduce((s, b) => s + b.totalUsd, 0);
  const avgReserve = totalUsd / n;
  const binsScanned = BIN_SCAN_RADIUS * 2 + 1;

  const binValences = sorted.map((b) => computeBinValence(b, sorted, avgReserve, totalUsd));

  const allBonds = binValences.flatMap((bv) => bv.bonds);
  const uniqueBonds = new Map<string, BondInfo>();
  for (const bond of allBonds) {
    const key = [Math.min(bond.fromBin, bond.toBin), Math.max(bond.fromBin, bond.toBin)].join("-");
    if (!uniqueBonds.has(key) || (uniqueBonds.get(key)!.bondStrength < bond.bondStrength)) {
      uniqueBonds.set(key, bond);
    }
  }
  const totalBonds = uniqueBonds.size;

  const valenceNumbers = binValences.map((bv) => bv.valenceNumber);
  const avgValenceNumber = valenceNumbers.length > 0
    ? r4(valenceNumbers.reduce((s, v) => s + v, 0) / valenceNumbers.length)
    : 0;
  const maxValenceNumber = Math.max(0, ...valenceNumbers);

  const bondStrengths = [...uniqueBonds.values()].map((b) => b.bondStrength);
  const avgBondStrength = bondStrengths.length > 0
    ? r4(bondStrengths.reduce((s, v) => s + v, 0) / bondStrengths.length)
    : 0;

  const avgElectronegativity = r4(
    binValences.reduce((s, bv) => s + bv.electronegativity, 0) / n
  );
  const avgIonizationEnergy = r4(
    binValences.reduce((s, bv) => s + bv.ionizationEnergy, 0) / n
  );
  const avgCovalentRadius = r4(
    binValences.reduce((s, bv) => s + bv.covalentRadius, 0) / n
  );

  const bondTypes = [...uniqueBonds.values()];
  const covalentBondCount = bondTypes.filter((b) => b.bondType === "covalent").length;
  const ionicBondCount = bondTypes.filter((b) => b.bondType === "ionic").length;
  const metallicBondCount = bondTypes.filter((b) => b.bondType === "metallic").length;
  const vanDerWaalsBondCount = bondTypes.filter((b) => b.bondType === "van_der_waals").length;

  const maxPossibleBonds = n * (n - 1) / 2;
  const networkConnectivity = maxPossibleBonds > 0 ? r4(totalBonds / maxPossibleBonds) : 0;
  const bondDensity = n > 0 ? r4(totalBonds / n) : 0;

  const avgOctetSatisfaction = r4(
    binValences.reduce((s, bv) => s + bv.octetSatisfaction, 0) / n
  );
  const nobleGasCount = binValences.filter((bv) => bv.isNobleGas).length;

  const formalCharges = binValences.map((bv) => bv.formalCharge);
  const avgFormalCharge = r4(formalCharges.reduce((s, v) => s + v, 0) / n);
  const formalChargeSpread = r4(
    Math.max(0, ...formalCharges) - Math.min(0, ...formalCharges)
  );

  const bondOrders = [...uniqueBonds.values()].map((b) => classifyBondOrder(b.bondStrength));
  const bondOrderDistribution = {
    single: bondOrders.filter((bo) => bo.label === "single").length,
    double: bondOrders.filter((bo) => bo.label === "double").length,
    triple: bondOrders.filter((bo) => bo.label === "triple").length,
    aromatic: bondOrders.filter((bo) => bo.label === "aromatic").length,
  };

  const hybridizations = binValences.map((bv) => bv.hybridization);
  const hybridizationDistribution = {
    sp: hybridizations.filter((h) => h === "sp").length,
    sp2: hybridizations.filter((h) => h === "sp2").length,
    sp3: hybridizations.filter((h) => h === "sp3").length,
    unhybridized: hybridizations.filter((h) => h === "unhybridized").length,
  };

  const latticeEnergy = r4(
    avgBondStrength * totalBonds * (1 - networkConnectivity) * 10
  );

  const bondDissociationEnergy = avgBondStrength > 0
    ? r4(avgBondStrength * avgIonizationEnergy)
    : 0;

  const electronegativities = binValences.map((bv) => bv.electronegativity);
  const electronegativityRange = r4(
    Math.max(0, ...electronegativities) - Math.min(0, ...electronegativities)
  );

  const reserveVariance = sorted.reduce((s, b) => s + (b.totalUsd - avgReserve) ** 2, 0) / n;
  const polarizability = avgReserve > 0
    ? r4(Math.sqrt(reserveVariance) / avgReserve)
    : 0;

  const leftReserves = sorted.filter((b) => b.binId < activeBin).reduce((s, b) => s + b.totalUsd, 0);
  const rightReserves = sorted.filter((b) => b.binId > activeBin).reduce((s, b) => s + b.totalUsd, 0);
  const dipoleMoment = totalUsd > 0
    ? r4(Math.abs(leftReserves - rightReserves) / totalUsd)
    : 0;

  let conjugationLength = 0;
  let maxConjugation = 0;
  let currentRun = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const key = [sorted[i].binId, sorted[i + 1].binId].join("-");
    const bond = uniqueBonds.get(key);
    if (bond && bond.bondStrength >= 0.3) {
      currentRun++;
      maxConjugation = Math.max(maxConjugation, currentRun);
    } else {
      currentRun = 0;
    }
  }
  conjugationLength = maxConjugation;

  const resonanceEnergy = conjugationLength > 2
    ? r4(conjugationLength * avgBondStrength * 0.15)
    : 0;

  let aromaticRingCount = 0;
  if (conjugationLength >= 6) {
    aromaticRingCount = Math.floor(conjugationLength / 6);
  }

  const connectivityScore = Math.min(25, networkConnectivity * 250);
  const strengthScore = Math.min(25, avgBondStrength * 25);
  const octetScore = Math.min(25, avgOctetSatisfaction * 25);
  const stabilityScore = Math.min(25, (1 - polarizability) * 12.5 + (1 - dipoleMoment) * 12.5);
  const valenceIndex = Math.round(
    Math.min(100, connectivityScore + strengthScore + octetScore + stabilityScore)
  );

  let valenceClass: string;
  if (valenceIndex >= 80) valenceClass = "NOBLE_LATTICE";
  else if (valenceIndex >= 60) valenceClass = "COVALENT_NETWORK";
  else if (valenceIndex >= 40) valenceClass = "IONIC_CRYSTAL";
  else if (valenceIndex >= 20) valenceClass = "METALLIC_CLUSTER";
  else valenceClass = "ATOMIC_GAS";

  let bondingVerdict: string;
  if (avgBondStrength > 0.6 && networkConnectivity > 0.05) bondingVerdict = "STRONGLY_BONDED";
  else if (avgBondStrength > 0.4 && networkConnectivity > 0.03) bondingVerdict = "WELL_BONDED";
  else if (avgBondStrength > 0.2) bondingVerdict = "MODERATELY_BONDED";
  else if (avgBondStrength > 0.1) bondingVerdict = "WEAKLY_BONDED";
  else bondingVerdict = "UNBONDED";

  const topBins = [...binValences]
    .sort((a, b) => b.effectiveValence - a.effectiveValence)
    .slice(0, 10)
    .map((bv) => ({ ...bv, bonds: bv.bonds.slice(0, 4) }));

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId: pool.poolId || 0,
    activeBin,
    binsScanned,
    binsPopulated: n,
    totalUsd: r2(totalUsd),
    totalBonds,
    avgValenceNumber,
    maxValenceNumber,
    avgBondStrength,
    avgElectronegativity,
    avgIonizationEnergy,
    avgCovalentRadius,
    covalentBondCount,
    ionicBondCount,
    metallicBondCount,
    vanDerWaalsBondCount,
    networkConnectivity,
    bondDensity,
    avgOctetSatisfaction,
    nobleGasCount,
    avgFormalCharge,
    formalChargeSpread,
    bondOrderDistribution,
    hybridizationDistribution,
    latticeEnergy,
    bondDissociationEnergy,
    electronegativityRange,
    polarizability,
    dipoleMoment,
    resonanceEnergy,
    conjugationLength,
    aromaticRingCount,
    valenceIndex,
    valenceClass,
    bondingVerdict,
    topBins,
    tvlUsd: pool.tvlUsd,
  };
}

function r2(v: number): number { return Math.round(v * 100) / 100; }
function r4(v: number): number { return Math.round(v * 10000) / 10000; }

async function runDoctor(): Promise<void> {
  console.log("=== HODLMM Bin Valence — Doctor ===\n");
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

  const profiles: ValenceProfile[] = [];

  for (const pool of targets) {
    try {
      const activeBin = pool.activeBinId || (await fetchActiveBin(pool.poolId || 0));
      pool.activeBinId = activeBin;
      const bins = await fetchBinReserves(pool.poolId || 0, activeBin, pool);
      if (bins.length < MIN_POPULATED_BINS) continue;
      profiles.push(analyzeValence(bins, pool));
    } catch {
      continue;
    }
  }

  const summary = {
    poolsAnalyzed: profiles.length,
    avgValenceIndex: profiles.length > 0
      ? r2(profiles.reduce((s, p) => s + p.valenceIndex, 0) / profiles.length)
      : 0,
    nobleLatticeCount: profiles.filter((p) => p.valenceClass === "NOBLE_LATTICE").length,
    covalentNetworkCount: profiles.filter((p) => p.valenceClass === "COVALENT_NETWORK").length,
    ionicCrystalCount: profiles.filter((p) => p.valenceClass === "IONIC_CRYSTAL").length,
    metallicClusterCount: profiles.filter((p) => p.valenceClass === "METALLIC_CLUSTER").length,
    atomicGasCount: profiles.filter((p) => p.valenceClass === "ATOMIC_GAS").length,
    avgBondStrength: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.avgBondStrength, 0) / profiles.length)
      : 0,
    avgNetworkConnectivity: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.networkConnectivity, 0) / profiles.length)
      : 0,
    totalBonds: profiles.reduce((s, p) => s + p.totalBonds, 0),
    avgGini: profiles.length > 0
      ? r4(profiles.reduce((s, p) => s + p.polarizability, 0) / profiles.length)
      : 0,
  };

  console.log(JSON.stringify({ result: "success", summary, profiles }, null, 2));
}

const program = new Command();
program.name("hodlmm-bin-valence").description("HODLMM bin valence analyzer");

program.command("doctor").description("Check environment and APIs").action(runDoctor);
program.command("status").description("List available pools").action(runStatus);
program
  .command("run")
  .description("Analyze bin valence bonding")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "5")
  .action(runAnalysis);

program.parse();
