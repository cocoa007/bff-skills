#!/usr/bin/env bun
/**
 * hodlmm-bin-chirality.ts — Day 123 cocoa007 Bitflow Skills Comp
 *
 * Bin chirality analyzer — measures handedness/asymmetry of reserve distributions
 * around the active bin using stereochemistry analogies: enantiomeric excess,
 * chiral centers, mirror mismatch, optical rotation, and stereochemical purity.
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

interface ChiralCenter {
  binId: number;
  leftHandedness: number;
  rightHandedness: number;
  flipMagnitude: number;
}

interface MirrorPair {
  leftBinId: number;
  rightBinId: number;
  offset: number;
  leftUsd: number;
  rightUsd: number;
  mismatch: number;
  dominantSide: string;
}

interface ChiralityProfile {
  pair: string;
  poolId: number;
  activeBin: number;
  binsAnalyzed: number;
  chiralityIndex: number;
  chiralityClass: string;
  handedness: string;
  enantiomericExcess: number;
  mirrorMismatchMean: number;
  mirrorMismatchMax: number;
  mirrorPairCount: number;
  chiralCenterCount: number;
  chiralCenters: ChiralCenter[];
  stereochemicalPurity: number;
  opticalRotation: number;
  rotationDirection: string;
  leftMassUsd: number;
  rightMassUsd: number;
  racemizationRisk: number;
  tvlUsd: number;
  volume24hUsd: number;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

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

// ─── Math helpers ─────────────────────────────────────────────────────────────

function round(n: number, decimals = 4): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

// ─── Chirality computation ────────────────────────────────────────────────────

/**
 * Compute local handedness for each bin: ratio of reserve-X to reserve-Y (USD).
 * Values > 0 = left-handed (token X dominant), < 0 = right-handed (token Y dominant).
 * Normalized to [-1, 1] range.
 */
function computeLocalHandedness(bins: BinReserves[]): number[] {
  return bins.map((b) => {
    const total = b.reserveXUsd + b.reserveYUsd;
    if (total <= 0) return 0;
    return (b.reserveXUsd - b.reserveYUsd) / total;
  });
}

/**
 * Find mirror pairs: bins equidistant from the active bin on opposite sides.
 * Measures how symmetric the reserve distribution is around the center.
 */
function findMirrorPairs(
  bins: BinReserves[],
  activeBin: number
): MirrorPair[] {
  const binMap = new Map<number, BinReserves>();
  for (const b of bins) binMap.set(b.binId, b);

  const pairs: MirrorPair[] = [];
  for (let offset = 1; offset <= BIN_SCAN_RADIUS; offset++) {
    const leftBinId = activeBin - offset;
    const rightBinId = activeBin + offset;
    const left = binMap.get(leftBinId);
    const right = binMap.get(rightBinId);

    if (left && right) {
      const leftUsd = left.totalUsd;
      const rightUsd = right.totalUsd;
      const maxUsd = Math.max(leftUsd, rightUsd);
      const mismatch = maxUsd > 0 ? Math.abs(leftUsd - rightUsd) / maxUsd : 0;

      pairs.push({
        leftBinId,
        rightBinId,
        offset,
        leftUsd: round(leftUsd, 2),
        rightUsd: round(rightUsd, 2),
        mismatch: round(mismatch),
        dominantSide: leftUsd > rightUsd ? "left" : rightUsd > leftUsd ? "right" : "equal",
      });
    }
  }
  return pairs;
}

/**
 * Detect chiral centers: bins where local handedness flips sign.
 * In stereochemistry, chiral centers are atoms where substituent
 * arrangement creates non-superimposable mirror images. Here, they
 * are bins where the dominant token switches from X to Y or vice versa.
 */
function findChiralCenters(
  bins: BinReserves[],
  handedness: number[]
): ChiralCenter[] {
  const centers: ChiralCenter[] = [];
  for (let i = 1; i < bins.length; i++) {
    const prev = handedness[i - 1];
    const curr = handedness[i];
    if ((prev > 0.05 && curr < -0.05) || (prev < -0.05 && curr > 0.05)) {
      centers.push({
        binId: bins[i].binId,
        leftHandedness: round(prev),
        rightHandedness: round(curr),
        flipMagnitude: round(Math.abs(prev - curr)),
      });
    }
  }
  return centers;
}

/**
 * Enantiomeric excess: how far from a racemic (50/50) distribution.
 * ee = |leftMass - rightMass| / (leftMass + rightMass) * 100
 * Where leftMass = total USD in bins below active, rightMass = bins above active.
 */
function computeEnantiomericExcess(
  bins: BinReserves[],
  activeBin: number
): { ee: number; leftMass: number; rightMass: number } {
  let leftMass = 0;
  let rightMass = 0;
  for (const b of bins) {
    if (b.binId < activeBin) leftMass += b.totalUsd;
    else if (b.binId > activeBin) rightMass += b.totalUsd;
  }
  const total = leftMass + rightMass;
  const ee = total > 0 ? (Math.abs(leftMass - rightMass) / total) * 100 : 0;
  return { ee: round(ee, 2), leftMass: round(leftMass, 2), rightMass: round(rightMass, 2) };
}

/**
 * Optical rotation: the weighted directional bias of handedness.
 * Positive = net left-handed (token X dominant flow), negative = right-handed.
 * Weighted by bin reserve magnitude (dense bins contribute more).
 */
function computeOpticalRotation(
  bins: BinReserves[],
  handedness: number[]
): number {
  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < bins.length; i++) {
    const weight = bins[i].totalUsd;
    weightedSum += handedness[i] * weight;
    totalWeight += weight;
  }
  if (totalWeight <= 0) return 0;
  return round((weightedSum / totalWeight) * 100, 2);
}

/**
 * Stereochemical purity: consistency of handedness direction.
 * 100% = all bins have the same sign handedness (pure enantiomer).
 * 0% = equal mix of left and right handed bins (racemic).
 */
function computeStereochemicalPurity(handedness: number[]): number {
  const significant = handedness.filter((h) => Math.abs(h) > 0.05);
  if (significant.length === 0) return 0;
  const leftCount = significant.filter((h) => h > 0).length;
  const rightCount = significant.filter((h) => h < 0).length;
  const dominant = Math.max(leftCount, rightCount);
  return round((dominant / significant.length) * 100, 2);
}

/**
 * Racemization risk: how likely the distribution is to become symmetric
 * over time. High risk = chiral centers near active bin + low ee + high volume.
 */
function computeRacemizationRisk(
  chiralCenters: ChiralCenter[],
  activeBin: number,
  ee: number,
  volume24hUsd: number,
  tvlUsd: number
): number {
  // More chiral centers near active bin = more mixing
  const nearCenters = chiralCenters.filter(
    (c) => Math.abs(c.binId - activeBin) <= 5
  ).length;
  const centerFactor = Math.min(nearCenters / 3, 1) * 30;

  // Low ee = already close to racemic, higher risk of full racemization
  const eeFactor = Math.max(0, (100 - ee) / 100) * 30;

  // High volume/TVL ratio = more mixing flow
  const turnover = tvlUsd > 0 ? volume24hUsd / tvlUsd : 0;
  const turnoverFactor = Math.min(turnover * 20, 25);

  // Low stereochemical purity = unstable configuration
  const purityPenalty = 15;

  return Math.round(
    Math.min(centerFactor + eeFactor + turnoverFactor + purityPenalty * (nearCenters > 0 ? 1 : 0), 100)
  );
}

// ─── Composite chirality index ────────────────────────────────────────────────

function computeChiralityIndex(
  ee: number,
  mirrorMismatchMean: number,
  chiralCenterCount: number,
  stereoPurity: number,
  binCount: number
): number {
  // ee contribution (0-30): higher ee = more chiral
  const eeScore = Math.min((ee / 100) * 30, 30);

  // Mirror mismatch (0-25): higher mean mismatch = more asymmetric
  const mirrorScore = Math.min(mirrorMismatchMean * 25, 25);

  // Chiral center density (0-20): more centers per bin = more complex chirality
  const centerDensity = binCount > 0 ? chiralCenterCount / binCount : 0;
  const centerScore = Math.min(centerDensity * 200, 20);

  // Stereochemical purity (0-25): high purity = strong consistent handedness
  const purityScore = (stereoPurity / 100) * 25;

  return Math.round(Math.min(eeScore + mirrorScore + centerScore + purityScore, 100));
}

function classifyChirality(index: number, ee: number): string {
  if (ee < 10 && index < 20) return "RACEMIC";
  if (ee < 30 || index < 35) return "SCALEMIC";
  if (ee < 70 || index < 60) return "ENANTIOENRICHED";
  return "ENANTIOPURE";
}

function classifyHandedness(
  leftMass: number,
  rightMass: number
): string {
  const total = leftMass + rightMass;
  if (total <= 0) return "RACEMIC";
  const ratio = (leftMass - rightMass) / total;
  if (Math.abs(ratio) < 0.05) return "RACEMIC";
  return ratio > 0 ? "LEFT" : "RIGHT";
}

// ─── Core analysis ────────────────────────────────────────────────────────────

function analyzeChirality(
  bins: BinReserves[],
  activeBin: number,
  pool: AppPool
): ChiralityProfile {
  const pair = `${pool.token0Symbol}/${pool.token1Symbol}`;
  const poolId = pool.poolId!;

  const handednessArr = computeLocalHandedness(bins);
  const mirrorPairs = findMirrorPairs(bins, activeBin);
  const chiralCenters = findChiralCenters(bins, handednessArr);
  const { ee, leftMass, rightMass } = computeEnantiomericExcess(bins, activeBin);
  const opticalRotation = computeOpticalRotation(bins, handednessArr);
  const stereoPurity = computeStereochemicalPurity(handednessArr);

  const mismatches = mirrorPairs.map((p) => p.mismatch);
  const mirrorMismatchMean = round(mean(mismatches));
  const mirrorMismatchMax = round(mismatches.length > 0 ? Math.max(...mismatches) : 0);

  const chiralityIndex = computeChiralityIndex(
    ee,
    mirrorMismatchMean,
    chiralCenters.length,
    stereoPurity,
    bins.length
  );

  const chiralityClass = classifyChirality(chiralityIndex, ee);
  const handedness = classifyHandedness(leftMass, rightMass);

  const racemizationRisk = computeRacemizationRisk(
    chiralCenters,
    activeBin,
    ee,
    pool.volume24hUsd,
    pool.tvlUsd
  );

  return {
    pair,
    poolId,
    activeBin,
    binsAnalyzed: bins.length,
    chiralityIndex,
    chiralityClass,
    handedness,
    enantiomericExcess: ee,
    mirrorMismatchMean,
    mirrorMismatchMax,
    mirrorPairCount: mirrorPairs.length,
    chiralCenterCount: chiralCenters.length,
    chiralCenters: chiralCenters.slice(0, 8),
    stereochemicalPurity: stereoPurity,
    opticalRotation,
    rotationDirection: opticalRotation > 0 ? "dextrorotatory" : opticalRotation < 0 ? "levorotatory" : "optically-inactive",
    leftMassUsd: leftMass,
    rightMassUsd: rightMass,
    racemizationRisk,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const program = new Command();
program
  .name("hodlmm-bin-chirality")
  .description("HODLMM bin chirality analyzer — Day 123 cocoa007")
  .version("1.0.0");

// ── doctor ────────────────────────────────────────────────────────────────────

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
      checks.push({
        name: "bff-pools",
        ok: r.ok,
        detail: `HTTP ${r.status}`,
      });
    } catch (e: any) {
      checks.push({ name: "bff-pools", ok: false, detail: e.message });
    }

    try {
      const r = await fetch(`${HIRO_API}/v2/info`, { method: "GET" });
      checks.push({
        name: "hiro-api",
        ok: r.ok,
        detail: `HTTP ${r.status}`,
      });
    } catch (e: any) {
      checks.push({ name: "hiro-api", ok: false, detail: e.message });
    }

    const allOk = checks.every((c) => c.ok);
    console.log(
      JSON.stringify({ result: allOk ? "success" : "degraded", checks })
    );

    console.error("\n  HODLMM Bin Chirality — Doctor\n");
    for (const c of checks) {
      const icon = c.ok ? "[OK]" : "[FAIL]";
      console.error(`  ${icon} ${c.name.padEnd(16)} ${c.detail}`);
    }
    console.error("");
  });

// ── status ────────────────────────────────────────────────────────────────────

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

// ── run ───────────────────────────────────────────────────────────────────────

program
  .command("run")
  .description("Run chirality analysis on HODLMM pools")
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

      const profiles: ChiralityProfile[] = [];

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
          const profile = analyzeChirality(bins, activeBin, pool);
          profiles.push(profile);
        } catch (e: any) {
          console.error(
            `  [ERR] Pool ${pool.poolId} (${pool.token0Symbol}/${pool.token1Symbol}): ${e.message}`
          );
        }
      }

      // Summary
      const avgIdx =
        profiles.length > 0
          ? round(mean(profiles.map((p) => p.chiralityIndex)), 1)
          : 0;
      const classCounts = {
        racemicCount: profiles.filter((p) => p.chiralityClass === "RACEMIC").length,
        scalemicCount: profiles.filter((p) => p.chiralityClass === "SCALEMIC").length,
        enantioenrichedCount: profiles.filter((p) => p.chiralityClass === "ENANTIOENRICHED").length,
        enantiopureCount: profiles.filter((p) => p.chiralityClass === "ENANTIOPURE").length,
      };
      const handednessCounts = {
        leftCount: profiles.filter((p) => p.handedness === "LEFT").length,
        rightCount: profiles.filter((p) => p.handedness === "RIGHT").length,
        racemicHandCount: profiles.filter((p) => p.handedness === "RACEMIC").length,
      };

      const output = {
        result: "success",
        summary: {
          poolsAnalyzed: profiles.length,
          avgChiralityIndex: avgIdx,
          ...classCounts,
          ...handednessCounts,
          avgEnantiomericExcess: round(mean(profiles.map((p) => p.enantiomericExcess)), 2),
          totalChiralCenters: profiles.reduce((s, p) => s + p.chiralCenterCount, 0),
        },
        profiles: profiles.map((p) => ({
          pair: p.pair,
          poolId: p.poolId,
          chiralityIndex: p.chiralityIndex,
          chiralityClass: p.chiralityClass,
          handedness: p.handedness,
          enantiomericExcess: p.enantiomericExcess,
          mirrorMismatchMean: p.mirrorMismatchMean,
          chiralCenterCount: p.chiralCenterCount,
          stereochemicalPurity: p.stereochemicalPurity,
          opticalRotation: p.opticalRotation,
          rotationDirection: p.rotationDirection,
          racemizationRisk: p.racemizationRisk,
          tvlUsd: p.tvlUsd,
        })),
      };

      console.log(JSON.stringify(output));

      // Human-readable table
      console.error("\n  HODLMM Bin Chirality Analysis\n");
      console.error(
        "  " +
          "Pool".padEnd(6) +
          "Pair".padEnd(16) +
          "Idx".padStart(5) +
          "Class".padStart(18) +
          "Hand".padStart(8) +
          "ee%".padStart(8) +
          "Mirror".padStart(8) +
          "Chiral#".padStart(9) +
          "Purity%".padStart(9) +
          "Rotation".padStart(10) +
          "RacRisk".padStart(9)
      );
      console.error("  " + "-".repeat(106));
      for (const p of profiles) {
        console.error(
          "  " +
            String(p.poolId).padEnd(6) +
            p.pair.padEnd(16) +
            String(p.chiralityIndex).padStart(5) +
            p.chiralityClass.padStart(18) +
            p.handedness.padStart(8) +
            p.enantiomericExcess.toFixed(1).padStart(8) +
            p.mirrorMismatchMean.toFixed(3).padStart(8) +
            String(p.chiralCenterCount).padStart(9) +
            p.stereochemicalPurity.toFixed(1).padStart(9) +
            p.opticalRotation.toFixed(2).padStart(10) +
            String(p.racemizationRisk).padStart(9)
        );
      }

      // Mirror pair detail
      console.error("\n  Mass Distribution (USD)\n");
      console.error(
        "  " +
          "Pool".padEnd(6) +
          "Pair".padEnd(16) +
          "Left Mass".padStart(14) +
          "Right Mass".padStart(14) +
          "Direction".padStart(18) +
          "Mirror Pairs".padStart(14)
      );
      console.error("  " + "-".repeat(82));
      for (const p of profiles) {
        console.error(
          "  " +
            String(p.poolId).padEnd(6) +
            p.pair.padEnd(16) +
            p.leftMassUsd.toFixed(2).padStart(14) +
            p.rightMassUsd.toFixed(2).padStart(14) +
            p.rotationDirection.padStart(18) +
            String(p.mirrorPairCount).padStart(14)
        );
      }

      console.error(
        `\n  Summary: ${profiles.length} pools | avg chirality ${avgIdx} | ` +
          `${classCounts.racemicCount} racemic, ` +
          `${classCounts.scalemicCount} scalemic, ` +
          `${classCounts.enantioenrichedCount} enantioenriched, ` +
          `${classCounts.enantiopureCount} enantiopure | ` +
          `${handednessCounts.leftCount}L/${handednessCounts.rightCount}R/${handednessCounts.racemicHandCount}balanced\n`
      );
    } catch (e: any) {
      console.log(JSON.stringify({ error: e.message }));
    }
  });

program.parse();
