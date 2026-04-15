#!/usr/bin/env bun
/**
 * hodlmm-bin-sublimation.ts — Day 127 cocoa007 Bitflow Skills Comp
 *
 * Bin sublimation analyzer — detects direct phase transitions in DLMM bin
 * liquidity where bins jump between dormant and hyperactive states without
 * passing through intermediate warming phases.
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

interface PhaseProfile {
  dormant: number;
  cool: number;
  warm: number;
  active: number;
  hyperactive: number;
}

interface SublimationEdge {
  fromBin: number;
  toBin: number;
  fromPhase: string;
  toPhase: string;
  phasesSkipped: number;
  energyDelta: number;
}

interface SublimationProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsAnalyzed: number;
  phaseDistribution: PhaseProfile;
  bimodalityIndex: number;
  sublimationEdges: SublimationEdge[];
  sublimationRate: number;
  avgPhasesSkipped: number;
  maxPhasesSkipped: number;
  transitionAsymmetry: number;
  sublimationEnergy: number;
  phaseGap: number;
  phaseSeparation: number;
  sublimationIndex: number;
  sublimationClass: string;
  transitionRisk: string;
  tvlUsd: number;
  volume24hUsd: number;
}

// --- API helpers ---

async function fetchPools(): Promise<AppPool[]> {
  const res = await fetch(`${BFF_APP_BASE}/pools`);
  if (!res.ok) throw new Error(`BFF pools API: ${res.status}`);
  const body = (await res.json()) as any;
  const raw = body.data?.pools ?? body.data ?? body.pools ?? body ?? [];
  const list: any[] = Array.isArray(raw) ? raw : [];

  const pools: AppPool[] = list.map((p: any) => {
    const idStr: string = p.poolId ?? p.id ?? "";
    const numMatch = idStr.match(/(\d+)/);
    const numericId = numMatch ? parseInt(numMatch[1], 10) : undefined;
    const tx = p.tokens?.tokenX ?? {};
    const ty = p.tokens?.tokenY ?? {};
    return {
      id: idStr,
      token0Symbol: tx.symbol ?? p.token0Symbol ?? "?",
      token1Symbol: ty.symbol ?? p.token1Symbol ?? "?",
      tvlUsd: p.tvlUsd ?? 0,
      volume24hUsd: p.volume24hUsd ?? p.volumeUsd24h ?? 0,
      poolId: numericId,
      token0Decimals: tx.decimals ?? p.token0Decimals ?? 8,
      token1Decimals: ty.decimals ?? p.token1Decimals ?? 6,
      token0PriceUsd: tx.priceUsd ?? p.token0PriceUsd ?? 0,
      token1PriceUsd: ty.priceUsd ?? p.token1PriceUsd ?? 0,
      activeBinId: p.activeBinId,
      feeBps: p.feeBps,
    };
  });

  return pools.filter(
    (p: AppPool) => (p.tvlUsd ?? 0) >= MIN_TVL_USD && p.poolId != null
  );
}

async function fetchActiveBin(poolId: number): Promise<number> {
  const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-active-bin`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: SENDER,
      arguments: [
        `0x0100000000000000000000000000000${poolId
          .toString(16)
          .padStart(3, "0")}`,
      ],
    }),
  });
  if (!res.ok) throw new Error(`Active bin fetch failed: ${res.status}`);
  const data = (await res.json()) as any;
  if (!data.okay || !data.result) throw new Error("Active bin read failed");
  const hex = data.result.replace("0x", "");
  if (hex.startsWith("09")) {
    const tupleHex = hex.slice(2);
    let offset = 0;
    const numEntries = parseInt(tupleHex.slice(offset, offset + 2), 16);
    offset += 2;
    for (let i = 0; i < numEntries; i++) {
      const nameLen = parseInt(tupleHex.slice(offset, offset + 2), 16);
      offset += 2;
      const nameBytes = tupleHex.slice(offset, offset + nameLen * 2);
      offset += nameLen * 2;
      const name = Buffer.from(nameBytes, "hex").toString("ascii");
      if (name === "active-bin-id" || name === "bin-id") {
        const typePrefix = tupleHex.slice(offset, offset + 2);
        offset += 2;
        if (typePrefix === "01") {
          return parseInt(tupleHex.slice(offset, offset + 32), 16);
        }
      } else {
        const typePrefix = tupleHex.slice(offset, offset + 2);
        offset += 2;
        if (typePrefix === "01" || typePrefix === "00") offset += 32;
        else if (typePrefix === "0a") offset += 32;
        else break;
      }
    }
  }
  const match = hex.match(/01([0-9a-f]{32})/);
  if (match) return parseInt(match[1], 16);
  throw new Error("Cannot parse active bin");
}

async function fetchBinReserves(
  poolId: number,
  activeBin: number,
  pool: AppPool
): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const start = activeBin - BIN_SCAN_RADIUS;
  const end = activeBin + BIN_SCAN_RADIUS;
  const batchSize = 5;
  for (let i = start; i <= end; i += batchSize) {
    const batch = [];
    for (let j = i; j < Math.min(i + batchSize, end + 1); j++) {
      batch.push(j);
    }
    const results = await Promise.all(
      batch.map(async (binId) => {
        try {
          const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-bin-reserves`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sender: SENDER,
              arguments: [
                `0x0100000000000000000000000000000${poolId
                  .toString(16)
                  .padStart(3, "0")}`,
                `0x01000000000000000000000000${binId
                  .toString(16)
                  .padStart(8, "0")}`,
              ],
            }),
          });
          if (!res.ok) return null;
          const data = (await res.json()) as any;
          if (!data.okay || !data.result) return null;
          const hex = data.result.replace("0x", "");
          let reserveX = 0,
            reserveY = 0;
          if (hex.startsWith("09")) {
            const tupleHex = hex.slice(2);
            let offset = 0;
            const numEntries = parseInt(
              tupleHex.slice(offset, offset + 2),
              16
            );
            offset += 2;
            for (let e = 0; e < numEntries; e++) {
              const nameLen = parseInt(
                tupleHex.slice(offset, offset + 2),
                16
              );
              offset += 2;
              const nameRaw = tupleHex.slice(offset, offset + nameLen * 2);
              offset += nameLen * 2;
              const nm = Buffer.from(nameRaw, "hex").toString("ascii");
              const typePrefix = tupleHex.slice(offset, offset + 2);
              offset += 2;
              const val = parseInt(tupleHex.slice(offset, offset + 32), 16);
              offset += 32;
              if (nm === "reserve-x") reserveX = val;
              else if (nm === "reserve-y") reserveY = val;
            }
          } else {
            const uints = hex.match(/01([0-9a-f]{32})/g) ?? [];
            if (uints.length >= 2) {
              reserveX = parseInt(uints[0].slice(2), 16);
              reserveY = parseInt(uints[1].slice(2), 16);
            }
          }
          const decX = pool.token0Decimals || 8;
          const decY = pool.token1Decimals || 6;
          const rX = reserveX / 10 ** decX;
          const rY = reserveY / 10 ** decY;
          const rXUsd = rX * (pool.token0PriceUsd || 0);
          const rYUsd = rY * (pool.token1PriceUsd || 0);
          return {
            binId,
            reserveX: rX,
            reserveY: rY,
            reserveXUsd: rXUsd,
            reserveYUsd: rYUsd,
            totalUsd: rXUsd + rYUsd,
          } as BinReserves;
        } catch {
          return null;
        }
      })
    );
    for (const r of results) {
      if (r && (r.reserveX > 0 || r.reserveY > 0)) bins.push(r);
    }
  }
  return bins;
}

// --- Math helpers ---

function round(n: number, decimals = 4): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

// --- Phase classification ---

const PHASES = ["dormant", "cool", "warm", "active", "hyperactive"] as const;
type Phase = (typeof PHASES)[number];

function classifyBinPhase(value: number, thresholds: number[]): Phase {
  if (value <= thresholds[0]) return "dormant";
  if (value <= thresholds[1]) return "cool";
  if (value <= thresholds[2]) return "warm";
  if (value <= thresholds[3]) return "active";
  return "hyperactive";
}

function computePhaseThresholds(values: number[]): number[] {
  if (values.length === 0) return [0, 0, 0, 0];
  const sorted = [...values].sort((a, b) => a - b);
  const p = (frac: number) => sorted[Math.min(Math.floor(frac * sorted.length), sorted.length - 1)];
  return [p(0.2), p(0.4), p(0.6), p(0.8)];
}

function phaseIndex(phase: Phase): number {
  return PHASES.indexOf(phase);
}

// --- Sublimation detection ---

function buildSpectrum(bins: BinReserves[]): { values: number[]; binIds: number[] } {
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);
  if (sorted.length === 0) return { values: [], binIds: [] };
  const minBin = sorted[0].binId;
  const maxBin = sorted[sorted.length - 1].binId;
  const binMap = new Map(sorted.map((b) => [b.binId, b.totalUsd]));
  const values: number[] = [];
  const binIds: number[] = [];
  for (let id = minBin; id <= maxBin; id++) {
    values.push(binMap.get(id) ?? 0);
    binIds.push(id);
  }
  return { values, binIds };
}

function computePhaseDistribution(phases: Phase[]): PhaseProfile {
  const counts: PhaseProfile = { dormant: 0, cool: 0, warm: 0, active: 0, hyperactive: 0 };
  for (const p of phases) counts[p]++;
  const total = phases.length || 1;
  return {
    dormant: round(counts.dormant / total, 4),
    cool: round(counts.cool / total, 4),
    warm: round(counts.warm / total, 4),
    active: round(counts.active / total, 4),
    hyperactive: round(counts.hyperactive / total, 4),
  };
}

function computeBimodality(phases: Phase[]): number {
  if (phases.length === 0) return 0;
  const total = phases.length;
  const extremes = phases.filter((p) => p === "dormant" || p === "hyperactive").length;
  const intermediates = phases.filter((p) => p === "cool" || p === "warm" || p === "active").length;
  const extremeRatio = extremes / total;
  const intermediateRatio = intermediates / total;
  if (extremeRatio === 0) return 0;
  return round(extremeRatio / (intermediateRatio + 0.01), 4);
}

function detectSublimationEdges(
  phases: Phase[],
  binIds: number[],
  values: number[]
): SublimationEdge[] {
  const edges: SublimationEdge[] = [];
  for (let i = 1; i < phases.length; i++) {
    const fromIdx = phaseIndex(phases[i - 1]);
    const toIdx = phaseIndex(phases[i]);
    const skipped = Math.abs(toIdx - fromIdx);
    if (skipped >= 2) {
      edges.push({
        fromBin: binIds[i - 1],
        toBin: binIds[i],
        fromPhase: phases[i - 1],
        toPhase: phases[i],
        phasesSkipped: skipped,
        energyDelta: round(Math.abs(values[i] - values[i - 1]), 2),
      });
    }
  }
  return edges.sort((a, b) => b.phasesSkipped - a.phasesSkipped);
}

function computeTransitionAsymmetry(edges: SublimationEdge[]): number {
  if (edges.length === 0) return 0;
  let upward = 0;
  let downward = 0;
  for (const e of edges) {
    const fromIdx = phaseIndex(e.fromPhase as Phase);
    const toIdx = phaseIndex(e.toPhase as Phase);
    if (toIdx > fromIdx) upward++;
    else downward++;
  }
  const total = upward + downward;
  if (total === 0) return 0;
  return round((upward - downward) / total, 4);
}

function computePhaseSeparation(values: number[], thresholds: number[]): number {
  if (values.length < 2) return 0;
  const phases = values.map((v) => classifyBinPhase(v, thresholds));
  let transitions = 0;
  let totalSkip = 0;
  for (let i = 1; i < phases.length; i++) {
    const dist = Math.abs(phaseIndex(phases[i]) - phaseIndex(phases[i - 1]));
    if (dist > 0) {
      transitions++;
      totalSkip += dist;
    }
  }
  if (transitions === 0) return 0;
  const avgSkip = totalSkip / transitions;
  return round(Math.min(avgSkip / 4, 1), 4);
}

function computePhaseGap(dist: PhaseProfile): number {
  const middle = dist.cool + dist.warm + dist.active;
  const extreme = dist.dormant + dist.hyperactive;
  if (extreme === 0) return 0;
  return round(1 - middle / (extreme + middle + 0.001), 4);
}

// --- Composite scoring ---

function computeSublimationIndex(
  sublimationRate: number,
  avgSkipped: number,
  bimodality: number,
  phaseGap: number,
  phaseSeparation: number,
  totalBins: number
): number {
  const rateScore = Math.min(sublimationRate * 100, 25);
  const skipScore = Math.min((avgSkipped / 4) * 25, 25);
  const bimodalScore = Math.min(bimodality * 10, 20);
  const gapScore = Math.min(phaseGap * 15, 15);
  const sepScore = Math.min(phaseSeparation * 15, 15);

  return Math.round(
    Math.min(Math.max(rateScore + skipScore + bimodalScore + gapScore + sepScore, 0), 100)
  );
}

function classifySublimation(index: number): string {
  if (index < 15) return "CONTINUOUS";
  if (index < 35) return "MIXED";
  if (index < 60) return "SUBLIMATING";
  return "STRONGLY_SUBLIMATING";
}

function classifyTransitionRisk(
  index: number,
  sublimationRate: number,
  maxSkipped: number
): string {
  if (index < 15) return "NONE";
  if (maxSkipped >= 4 && sublimationRate > 0.3) return "HIGH";
  if (index >= 60) return "HIGH";
  if (index >= 35) return "MODERATE";
  return "LOW";
}

// --- Core analysis ---

function analyzeSublimation(
  bins: BinReserves[],
  activeBin: number,
  pool: AppPool
): SublimationProfile {
  const pair = `${pool.token0Symbol}/${pool.token1Symbol}`;
  const poolId = pool.poolId!;

  const { values, binIds } = buildSpectrum(bins);
  const thresholds = computePhaseThresholds(values);
  const phases = values.map((v) => classifyBinPhase(v, thresholds));

  const phaseDistribution = computePhaseDistribution(phases);
  const bimodalityIndex = computeBimodality(phases);
  const edges = detectSublimationEdges(phases, binIds, values);

  const totalTransitions = phases.length > 1 ? phases.length - 1 : 1;
  const sublimationRate = round(edges.length / totalTransitions, 4);
  const avgSkipped = edges.length > 0 ? round(mean(edges.map((e) => e.phasesSkipped)), 2) : 0;
  const maxSkipped = edges.length > 0 ? Math.max(...edges.map((e) => e.phasesSkipped)) : 0;
  const transitionAsymmetry = computeTransitionAsymmetry(edges);
  const sublimationEnergy = round(
    edges.reduce((s, e) => s + e.energyDelta, 0),
    2
  );
  const phaseGap = computePhaseGap(phaseDistribution);
  const phaseSeparation = computePhaseSeparation(values, thresholds);

  const sublimationIndex = computeSublimationIndex(
    sublimationRate,
    avgSkipped,
    bimodalityIndex,
    phaseGap,
    phaseSeparation,
    values.length
  );

  const sublimationClass = classifySublimation(sublimationIndex);
  const transitionRisk = classifyTransitionRisk(sublimationIndex, sublimationRate, maxSkipped);

  return {
    pair,
    poolId,
    activeBin,
    binsAnalyzed: bins.length,
    phaseDistribution,
    bimodalityIndex,
    sublimationEdges: edges.slice(0, 10),
    sublimationRate,
    avgPhasesSkipped: avgSkipped,
    maxPhasesSkipped: maxSkipped,
    transitionAsymmetry,
    sublimationEnergy,
    phaseGap,
    phaseSeparation,
    sublimationIndex,
    sublimationClass,
    transitionRisk,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
  };
}

// --- CLI ---

const program = new Command();
program
  .name("hodlmm-bin-sublimation")
  .description("HODLMM bin sublimation analyzer — Day 127 cocoa007")
  .version("1.0.0");

program
  .command("doctor")
  .description("Check API connectivity and environment")
  .action(async () => {
    const checks: { name: string; ok: boolean; detail: string }[] = [];

    checks.push({
      name: "bun-runtime",
      ok: typeof Bun !== "undefined",
      detail: typeof Bun !== "undefined" ? `v${Bun.version}` : "not Bun",
    });

    try {
      const r = await fetch(`${BFF_APP_BASE}/pools`, { method: "GET" });
      checks.push({ name: "bff-pools", ok: r.ok, detail: `HTTP ${r.status}` });
    } catch (e: any) {
      checks.push({ name: "bff-pools", ok: false, detail: e.message });
    }

    try {
      const r = await fetch(`${HIRO_API}/v2/info`, { method: "GET" });
      checks.push({ name: "hiro-api", ok: r.ok, detail: `HTTP ${r.status}` });
    } catch (e: any) {
      checks.push({ name: "hiro-api", ok: false, detail: e.message });
    }

    const allOk = checks.every((c) => c.ok);
    console.log(
      JSON.stringify({ result: allOk ? "success" : "degraded", checks })
    );

    console.error("\n  HODLMM Bin Sublimation — Doctor\n");
    for (const c of checks) {
      const icon = c.ok ? "[OK]" : "[FAIL]";
      console.error(`  ${icon} ${c.name.padEnd(16)} ${c.detail}`);
    }
    console.error("");
  });

program
  .command("status")
  .description("List available HODLMM pools above TVL threshold")
  .action(async () => {
    try {
      const pools = await fetchPools();
      const sorted = pools.sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, 20);
      console.log(
        JSON.stringify({
          result: "success",
          poolCount: pools.length,
          pools: sorted.map((p) => ({
            poolId: p.poolId,
            pair: `${p.token0Symbol}/${p.token1Symbol}`,
            tvlUsd: p.tvlUsd,
            volume24hUsd: p.volume24hUsd,
          })),
        })
      );

      console.error("\n  HODLMM Pools (TVL >= $1000)\n");
      console.error(
        "  " +
          "Pool".padEnd(6) +
          "Pair".padEnd(18) +
          "TVL ($)".padStart(14) +
          "Vol 24h ($)".padStart(14)
      );
      console.error("  " + "-".repeat(52));
      for (const p of sorted) {
        console.error(
          "  " +
            String(p.poolId).padEnd(6) +
            `${p.token0Symbol}/${p.token1Symbol}`.padEnd(18) +
            p.tvlUsd.toFixed(0).padStart(14) +
            p.volume24hUsd.toFixed(0).padStart(14)
        );
      }
      console.error(`\n  Total: ${pools.length} pools\n`);
    } catch (e: any) {
      console.log(JSON.stringify({ error: e.message }));
    }
  });

program
  .command("run")
  .description("Run sublimation analysis on HODLMM pools")
  .option("--pool <id>", "Analyze a specific pool by numeric ID")
  .option("--top <n>", "Number of top pools to analyze", "5")
  .action(async (opts) => {
    try {
      const pools = await fetchPools();
      let targets: AppPool[];

      if (opts.pool) {
        const pid = parseInt(opts.pool, 10);
        const match = pools.find((p) => p.poolId === pid);
        if (!match) {
          console.log(JSON.stringify({ error: `Pool #${pid} not found` }));
          return;
        }
        targets = [match];
      } else {
        const topN = parseInt(opts.top, 10) || 5;
        targets = pools.sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, topN);
      }

      const profiles: SublimationProfile[] = [];

      for (const pool of targets) {
        try {
          const activeBin = await fetchActiveBin(pool.poolId!);
          const bins = await fetchBinReserves(pool.poolId!, activeBin, pool);
          if (bins.length < MIN_POPULATED_BINS) {
            console.error(
              `  [SKIP] Pool ${pool.poolId} (${pool.token0Symbol}/${pool.token1Symbol}): only ${bins.length} populated bins`
            );
            continue;
          }
          const profile = analyzeSublimation(bins, activeBin, pool);
          profiles.push(profile);
        } catch (e: any) {
          console.error(
            `  [ERR] Pool ${pool.poolId} (${pool.token0Symbol}/${pool.token1Symbol}): ${e.message}`
          );
        }
      }

      const avgIdx =
        profiles.length > 0
          ? round(mean(profiles.map((p) => p.sublimationIndex)), 1)
          : 0;
      const classCounts = {
        continuousCount: profiles.filter((p) => p.sublimationClass === "CONTINUOUS").length,
        mixedCount: profiles.filter((p) => p.sublimationClass === "MIXED").length,
        sublimatingCount: profiles.filter((p) => p.sublimationClass === "SUBLIMATING").length,
        stronglySublimatingCount: profiles.filter((p) => p.sublimationClass === "STRONGLY_SUBLIMATING").length,
      };
      const riskCounts = {
        noneCount: profiles.filter((p) => p.transitionRisk === "NONE").length,
        lowCount: profiles.filter((p) => p.transitionRisk === "LOW").length,
        moderateCount: profiles.filter((p) => p.transitionRisk === "MODERATE").length,
        highCount: profiles.filter((p) => p.transitionRisk === "HIGH").length,
      };

      const output = {
        result: "success",
        summary: {
          poolsAnalyzed: profiles.length,
          avgSublimationIndex: avgIdx,
          ...classCounts,
          ...riskCounts,
          avgSublimationRate: round(mean(profiles.map((p) => p.sublimationRate)), 4),
          avgBimodality: round(mean(profiles.map((p) => p.bimodalityIndex)), 4),
          avgPhaseGap: round(mean(profiles.map((p) => p.phaseGap)), 4),
          avgPhaseSeparation: round(mean(profiles.map((p) => p.phaseSeparation)), 4),
        },
        profiles: profiles.map((p) => ({
          pair: p.pair,
          poolId: p.poolId,
          sublimationIndex: p.sublimationIndex,
          sublimationClass: p.sublimationClass,
          transitionRisk: p.transitionRisk,
          sublimationRate: p.sublimationRate,
          avgPhasesSkipped: p.avgPhasesSkipped,
          maxPhasesSkipped: p.maxPhasesSkipped,
          bimodalityIndex: p.bimodalityIndex,
          transitionAsymmetry: p.transitionAsymmetry,
          sublimationEnergy: p.sublimationEnergy,
          phaseGap: p.phaseGap,
          phaseSeparation: p.phaseSeparation,
          phaseDistribution: p.phaseDistribution,
          tvlUsd: p.tvlUsd,
        })),
      };

      console.log(JSON.stringify(output));

      console.error("\n  HODLMM Bin Sublimation Analysis\n");
      console.error(
        "  " +
          "Pool".padEnd(6) +
          "Pair".padEnd(16) +
          "Idx".padStart(5) +
          "Class".padStart(24) +
          "Risk".padStart(10) +
          "Rate".padStart(7) +
          "Skip".padStart(6) +
          "Bimod".padStart(7) +
          "Gap".padStart(7) +
          "Sep".padStart(7) +
          "Asym".padStart(7)
      );
      console.error("  " + "-".repeat(102));
      for (const p of profiles) {
        console.error(
          "  " +
            String(p.poolId).padEnd(6) +
            p.pair.padEnd(16) +
            String(p.sublimationIndex).padStart(5) +
            p.sublimationClass.padStart(24) +
            p.transitionRisk.padStart(10) +
            p.sublimationRate.toFixed(3).padStart(7) +
            p.avgPhasesSkipped.toFixed(1).padStart(6) +
            p.bimodalityIndex.toFixed(2).padStart(7) +
            p.phaseGap.toFixed(3).padStart(7) +
            p.phaseSeparation.toFixed(3).padStart(7) +
            p.transitionAsymmetry.toFixed(2).padStart(7)
        );
      }

      console.error("\n  Phase Distribution\n");
      for (const p of profiles) {
        const d = p.phaseDistribution;
        console.error(
          `  Pool ${String(p.poolId).padStart(3)} (${p.pair}): ` +
            `D=${(d.dormant * 100).toFixed(0)}% ` +
            `C=${(d.cool * 100).toFixed(0)}% ` +
            `W=${(d.warm * 100).toFixed(0)}% ` +
            `A=${(d.active * 100).toFixed(0)}% ` +
            `H=${(d.hyperactive * 100).toFixed(0)}%`
        );
      }

      console.error("\n  Top Sublimation Edges\n");
      for (const p of profiles) {
        if (p.sublimationEdges.length === 0) continue;
        console.error(`  Pool ${p.poolId} (${p.pair}):`);
        for (const e of p.sublimationEdges.slice(0, 5)) {
          console.error(
            `    Bin ${String(e.fromBin).padStart(8)} -> ${String(e.toBin).padStart(8)} | ` +
              `${e.fromPhase.padEnd(11)} -> ${e.toPhase.padEnd(11)} | ` +
              `skip ${e.phasesSkipped} | $${e.energyDelta.toFixed(2)}`
          );
        }
      }

      console.error(
        `\n  Summary: ${profiles.length} pools | avg sublimation idx ${avgIdx} | ` +
          `${classCounts.continuousCount} continuous, ` +
          `${classCounts.mixedCount} mixed, ` +
          `${classCounts.sublimatingCount} sublimating, ` +
          `${classCounts.stronglySublimatingCount} strong | ` +
          `risk: ${riskCounts.noneCount}N/${riskCounts.lowCount}L/${riskCounts.moderateCount}M/${riskCounts.highCount}H\n`
      );
    } catch (e: any) {
      console.log(JSON.stringify({ error: e.message }));
    }
  });

program.parse();
