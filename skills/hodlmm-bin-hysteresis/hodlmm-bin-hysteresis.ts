#!/usr/bin/env bun
/**
 * hodlmm-bin-hysteresis.ts — Day 113 cocoa007 Bitflow Skills Comp
 *
 * Bin liquidity hysteresis analyzer — measures directional memory
 * in reserve response, coercivity, remanence, loop area, and
 * Barkhausen noise from discrete reserve jumps.
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 30;
const COERCIVITY_THRESHOLD = 0.15;
const REMANENCE_THRESHOLD = 0.10;
const BARKHAUSEN_JUMP_THRESHOLD = 0.05;

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

interface HysteresisLoop {
  binId: number;
  forwardResponse: number;
  reverseResponse: number;
  loopWidth: number;
  loopArea: number;
  coercivity: number;
  remanence: number;
}

interface BarkhausenEvent {
  binId: number;
  jumpMagnitude: number;
  direction: "forward" | "reverse";
  binGap: number;
}

interface HysteresisProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsAnalyzed: number;
  hysteresisIndex: number;
  hysteresisClass: string;
  avgLoopArea: number;
  maxLoopArea: number;
  totalCoercivity: number;
  avgRemanence: number;
  barkhausenCount: number;
  barkhausenIntensity: number;
  directionalBias: number;
  energyLoss: number;
  saturationAsymmetry: number;
  loops: HysteresisLoop[];
  barkhausenEvents: BarkhausenEvent[];
  asciiLoopMap: string;
}

async function fetchJson(url: string): Promise<any> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}

async function fetchPools(): Promise<AppPool[]> {
  const data = await fetchJson(`${BFF_APP_BASE}/dlmm/pools`);
  const pools: AppPool[] = (data.data || data.results || data || [])
    .filter((p: any) => (p.tvlUsd ?? 0) >= MIN_TVL_USD)
    .sort((a: any, b: any) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0));
  return pools;
}

function cvToNumber(cv: any): number {
  if (!cv) return 0;
  if (cv.type === "uint" || cv.type === "int") return Number(cv.value ?? 0);
  if (typeof cv.value === "string") return Number(cv.value) || 0;
  return Number(cv) || 0;
}

async function fetchBinReserves(
  poolId: number,
  activeBin: number,
  pool: AppPool
): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const start = activeBin - BIN_SCAN_RADIUS;
  const end = activeBin + BIN_SCAN_RADIUS;

  const promises: Promise<void>[] = [];
  for (let id = start; id <= end; id++) {
    const p = (async () => {
      try {
        const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-bin`;
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: SENDER,
            arguments: [
              `0x0100000000000000000000000000000${poolId.toString(16).padStart(4, "0")}`,
              `0x0100000000000000000000000000${id.toString(16).padStart(8, "0")}`,
            ],
          }),
        });
        if (!resp.ok) return;
        const result = await resp.json();
        if (!result.okay || !result.result) return;
        const hex = result.result;
        const rx = parseInt(hex.slice(18, 50), 16) || 0;
        const ry = parseInt(hex.slice(50, 82), 16) || 0;
        const decX = pool.token0Decimals || 8;
        const decY = pool.token1Decimals || 6;
        const reserveX = rx / 10 ** decX;
        const reserveY = ry / 10 ** decY;
        const reserveXUsd = reserveX * (pool.token0PriceUsd || 0);
        const reserveYUsd = reserveY * (pool.token1PriceUsd || 0);
        bins.push({
          binId: id,
          reserveX,
          reserveY,
          reserveXUsd,
          reserveYUsd,
          totalUsd: reserveXUsd + reserveYUsd,
        });
      } catch {}
    })();
    promises.push(p);
  }
  await Promise.all(promises);
  bins.sort((a, b) => a.binId - b.binId);
  return bins;
}

function computeHysteresisLoops(
  bins: BinReserves[],
  activeBin: number
): HysteresisLoop[] {
  if (bins.length < 3) return [];
  const loops: HysteresisLoop[] = [];
  const maxTotal = Math.max(...bins.map((b) => b.totalUsd), 1);

  for (let i = 1; i < bins.length - 1; i++) {
    const prev = bins[i - 1];
    const curr = bins[i];
    const next = bins[i + 1];

    const forwardDelta = (curr.totalUsd - prev.totalUsd) / maxTotal;
    const reverseDelta = (curr.totalUsd - next.totalUsd) / maxTotal;

    const forwardResponse = Math.abs(forwardDelta);
    const reverseResponse = Math.abs(reverseDelta);

    const loopWidth = Math.abs(forwardResponse - reverseResponse);
    const loopArea = 0.5 * (forwardResponse + reverseResponse) * loopWidth;

    const xFrac = curr.reserveXUsd / Math.max(curr.totalUsd, 0.01);
    const yFrac = curr.reserveYUsd / Math.max(curr.totalUsd, 0.01);
    const coercivity = Math.abs(xFrac - yFrac);

    const distFromActive = Math.abs(curr.binId - activeBin);
    const normalizedDist = distFromActive / BIN_SCAN_RADIUS;
    const remanence = (curr.totalUsd / maxTotal) * normalizedDist;

    loops.push({
      binId: curr.binId,
      forwardResponse,
      reverseResponse,
      loopWidth,
      loopArea,
      coercivity,
      remanence,
    });
  }
  return loops;
}

function detectBarkhausenEvents(bins: BinReserves[]): BarkhausenEvent[] {
  if (bins.length < 2) return [];
  const events: BarkhausenEvent[] = [];
  const maxTotal = Math.max(...bins.map((b) => b.totalUsd), 1);

  for (let i = 1; i < bins.length; i++) {
    const prev = bins[i - 1];
    const curr = bins[i];
    const jump = Math.abs(curr.totalUsd - prev.totalUsd) / maxTotal;
    const binGap = curr.binId - prev.binId;

    if (jump > BARKHAUSEN_JUMP_THRESHOLD) {
      events.push({
        binId: curr.binId,
        jumpMagnitude: jump,
        direction: curr.totalUsd > prev.totalUsd ? "forward" : "reverse",
        binGap,
      });
    }
  }
  return events;
}

function computeSaturationAsymmetry(
  bins: BinReserves[],
  activeBin: number
): number {
  const lower = bins.filter((b) => b.binId < activeBin);
  const upper = bins.filter((b) => b.binId > activeBin);
  const lowerTotal = lower.reduce((s, b) => s + b.totalUsd, 0);
  const upperTotal = upper.reduce((s, b) => s + b.totalUsd, 0);
  const total = lowerTotal + upperTotal;
  if (total === 0) return 0;
  return (upperTotal - lowerTotal) / total;
}

function classifyHysteresis(index: number): string {
  if (index < 15) return "reversible";
  if (index < 30) return "soft";
  if (index < 50) return "moderate";
  if (index < 70) return "hard";
  return "permanent";
}

function buildAsciiLoopMap(loops: HysteresisLoop[], activeBin: number): string {
  if (loops.length === 0) return "  (no bins)";
  const width = 50;
  const maxArea = Math.max(...loops.map((l) => l.loopArea), 0.001);
  const lines: string[] = [];
  lines.push("  Bin  | Hysteresis Loop Area");
  lines.push("  -----+--" + "-".repeat(width));

  for (const loop of loops) {
    const barLen = Math.round((loop.loopArea / maxArea) * width);
    const marker = loop.binId === activeBin ? ">" : " ";
    const bar = "█".repeat(Math.max(barLen, 0));
    const tag =
      loop.coercivity > COERCIVITY_THRESHOLD
        ? " [H]"
        : loop.remanence > REMANENCE_THRESHOLD
          ? " [R]"
          : "";
    lines.push(
      `${marker}${String(loop.binId).padStart(5)} | ${bar}${tag}`
    );
  }
  lines.push("");
  lines.push("  [H] = high coercivity  [R] = high remanence");
  return lines.join("\n");
}

async function analyzePool(pool: AppPool): Promise<HysteresisProfile | null> {
  const poolId = pool.poolId ?? Number(pool.id);
  if (!poolId || !pool.activeBinId) return null;

  const bins = await fetchBinReserves(poolId, pool.activeBinId, pool);
  if (bins.length < 5) return null;

  const loops = computeHysteresisLoops(bins, pool.activeBinId);
  const barkhausenEvents = detectBarkhausenEvents(bins);
  const saturationAsymmetry = computeSaturationAsymmetry(bins, pool.activeBinId);

  const avgLoopArea =
    loops.length > 0
      ? loops.reduce((s, l) => s + l.loopArea, 0) / loops.length
      : 0;
  const maxLoopArea =
    loops.length > 0 ? Math.max(...loops.map((l) => l.loopArea)) : 0;
  const totalCoercivity = loops.reduce((s, l) => s + l.coercivity, 0);
  const avgRemanence =
    loops.length > 0
      ? loops.reduce((s, l) => s + l.remanence, 0) / loops.length
      : 0;

  const barkhausenIntensity =
    barkhausenEvents.length > 0
      ? barkhausenEvents.reduce((s, e) => s + e.jumpMagnitude, 0) /
        barkhausenEvents.length
      : 0;

  const forwardTotal = loops.reduce((s, l) => s + l.forwardResponse, 0);
  const reverseTotal = loops.reduce((s, l) => s + l.reverseResponse, 0);
  const responseTotal = forwardTotal + reverseTotal;
  const directionalBias =
    responseTotal > 0 ? (forwardTotal - reverseTotal) / responseTotal : 0;

  const energyLoss = avgLoopArea * loops.length;

  const hysteresisIndex = Math.min(
    100,
    Math.round(
      avgLoopArea * 300 +
        (totalCoercivity / Math.max(loops.length, 1)) * 100 +
        avgRemanence * 80 +
        barkhausenIntensity * 120 +
        Math.abs(saturationAsymmetry) * 50
    )
  );

  return {
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    poolId,
    activeBin: pool.activeBinId,
    binsAnalyzed: bins.length,
    hysteresisIndex,
    hysteresisClass: classifyHysteresis(hysteresisIndex),
    avgLoopArea: +avgLoopArea.toFixed(6),
    maxLoopArea: +maxLoopArea.toFixed(6),
    totalCoercivity: +totalCoercivity.toFixed(4),
    avgRemanence: +avgRemanence.toFixed(4),
    barkhausenCount: barkhausenEvents.length,
    barkhausenIntensity: +barkhausenIntensity.toFixed(4),
    directionalBias: +directionalBias.toFixed(4),
    energyLoss: +energyLoss.toFixed(6),
    saturationAsymmetry: +saturationAsymmetry.toFixed(4),
    loops,
    barkhausenEvents,
    asciiLoopMap: buildAsciiLoopMap(loops, pool.activeBinId),
  };
}

const program = new Command();
program.name("hodlmm-bin-hysteresis").version("1.0.0");

program
  .command("doctor")
  .description("Validate connectivity")
  .action(async () => {
    const checks: Record<string, string> = {};
    try {
      await fetchJson(`${HIRO_API}/v2/info`);
      checks["hiro_api"] = "ok";
    } catch (e: any) {
      checks["hiro_api"] = `fail: ${e.message}`;
    }
    try {
      await fetchJson(`${BFF_APP_BASE}/dlmm/pools`);
      checks["bff_api"] = "ok";
    } catch (e: any) {
      checks["bff_api"] = `fail: ${e.message}`;
    }
    console.log(
      JSON.stringify({
        result: "doctor",
        data: {
          checks,
          analyses: [
            "hysteresis_loop — directional reserve response asymmetry",
            "coercivity — reserve composition resistance to reversal",
            "remanence — residual reserve concentration after price moves away",
            "barkhausen_noise — discrete reserve jumps between bins",
            "saturation_asymmetry — directional saturation imbalance",
            "energy_loss — cumulative hysteresis loop area (dissipated value)",
          ],
        },
      })
    );
  });

program
  .command("run")
  .description("Full hysteresis analysis")
  .option("--pool <id>", "Specific pool ID")
  .option("--top <n>", "Top N pools by TVL", "3")
  .action(async (opts) => {
    try {
      const pools = await fetchPools();
      let targets: AppPool[];
      if (opts.pool) {
        const pid = Number(opts.pool);
        targets = pools.filter(
          (p) => (p.poolId ?? Number(p.id)) === pid
        );
        if (targets.length === 0) {
          console.log(JSON.stringify({ error: `Pool ${pid} not found` }));
          return;
        }
      } else {
        targets = pools.slice(0, Number(opts.top) || 3);
      }

      const results: HysteresisProfile[] = [];
      for (const pool of targets) {
        const profile = await analyzePool(pool);
        if (profile) results.push(profile);
      }

      const avgIndex =
        results.length > 0
          ? Math.round(
              results.reduce((s, r) => s + r.hysteresisIndex, 0) /
                results.length
            )
          : 0;

      console.log(
        JSON.stringify({
          result: "hysteresis_analysis",
          data: {
            pools: results.map((r) => ({
              poolId: r.poolId,
              pair: r.pair,
              profile: {
                hysteresisIndex: r.hysteresisIndex,
                hysteresisClass: r.hysteresisClass,
                avgLoopArea: r.avgLoopArea,
                maxLoopArea: r.maxLoopArea,
                totalCoercivity: r.totalCoercivity,
                avgRemanence: r.avgRemanence,
                barkhausenCount: r.barkhausenCount,
                barkhausenIntensity: r.barkhausenIntensity,
                directionalBias: r.directionalBias,
                energyLoss: r.energyLoss,
                saturationAsymmetry: r.saturationAsymmetry,
                binsAnalyzed: r.binsAnalyzed,
              },
              asciiLoopMap: r.asciiLoopMap,
            })),
            summary: {
              poolsAnalyzed: results.length,
              avgHysteresisIndex: avgIndex,
            },
          },
        })
      );
    } catch (e: any) {
      console.log(JSON.stringify({ error: e.message }));
    }
  });

program
  .command("status")
  .description("Quick hysteresis summary")
  .action(async () => {
    try {
      const pools = await fetchPools();
      const targets = pools.slice(0, 5);
      const summaries: any[] = [];

      for (const pool of targets) {
        const profile = await analyzePool(pool);
        if (profile) {
          summaries.push({
            poolId: profile.poolId,
            pair: profile.pair,
            hysteresisIndex: profile.hysteresisIndex,
            hysteresisClass: profile.hysteresisClass,
            barkhausenCount: profile.barkhausenCount,
            directionalBias: profile.directionalBias,
            saturationAsymmetry: profile.saturationAsymmetry,
          });
        }
      }

      console.log(
        JSON.stringify({
          result: "hysteresis_status",
          data: { pools: summaries },
        })
      );
    } catch (e: any) {
      console.log(JSON.stringify({ error: e.message }));
    }
  });

program.parse();
