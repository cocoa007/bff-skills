#!/usr/bin/env bun
/**
 * hodlmm-bin-coherence.ts — Day 100 cocoa007 Bitflow Skills Comp
 *
 * Bin coherence analyzer — measures how coherently adjacent bins' reserves
 * correlate. Pairwise Pearson correlation, coherence zones, fragmentation
 * index, directional asymmetry, coherence decay, and composite scoring.
 */

import { Command } from "commander";

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 30;
const COHERENCE_WINDOW = 5;       // sliding window size for Pearson correlation
const HIGH_COHERENCE_THRESH = 0.7; // threshold for a coherence zone
const LOW_COHERENCE_THRESH = 0.3;  // threshold for a fragmented transition

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

/** Per-adjacent-pair coherence (between bin[i] and bin[i+1]) */
interface PairCoherence {
  leftBinId: number;
  rightBinId: number;
  offset: number;        // offset of leftBin from activeBin
  coherence: number;     // -1 to 1 Pearson-like score using sliding windows
}

/** Contiguous zone of high coherence */
interface CoherenceZone {
  startBinId: number;
  endBinId: number;
  startOffset: number;
  endOffset: number;
  width: number;
  avgCoherence: number;
}

interface CoherenceProfile {
  populatedBins: number;
  totalBins: number;
  scannedTvlUsd: number;

  // Pairwise
  pairwiseCoherences: PairCoherence[];
  avgPairwiseCoherence: number;
  medianPairwiseCoherence: number;

  // Zones
  coherenceZones: CoherenceZone[];
  zoneCount: number;
  avgZoneWidth: number;

  // Fragmentation
  fragmentedTransitions: number;
  totalTransitions: number;
  fragmentationIndex: number; // 0-1

  // Directional
  leftCoherence: number;   // below active bin (bearish side)
  rightCoherence: number;  // above active bin (bullish side)
  directionalAsymmetry: number; // leftCoherence / rightCoherence

  // Decay
  coherenceDecayRate: number; // 0-1, how fast coherence drops away from active bin
  coherenceDecayR2: number;

  // Composite
  coherenceScore: number; // 0-100

  // Visual
  asciiCoherenceMap: string;
}

interface CoherenceAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  binsScanned: number;
  binsPopulated: number;
  scannedTvlUsd: number;
  profile: CoherenceProfile;
  recommendation: string;
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
  if (!resp.ok) throw new Error(`HTTP ${resp.status} calling ${fn}`);
  return resp.json();
}

function cvUint(n: number): string {
  const hex = n.toString(16).padStart(32, "0");
  return `0x01${hex}`;
}

function parseUintResult(hex: string): number {
  if (hex.startsWith("0x")) hex = hex.slice(2);
  if (hex.startsWith("00")) hex = hex.slice(2);
  const tag = hex.slice(0, 2);
  if (tag === "01") return parseInt(hex.slice(2), 16);
  return 0;
}

function parseTupleReserves(hex: string): { reserveX: number; reserveY: number } {
  const fallback = { reserveX: 0, reserveY: 0 };
  if (!hex || hex.length < 10) return fallback;
  if (hex.startsWith("0x")) hex = hex.slice(2);
  try {
    let pos = 0;
    if (hex.slice(pos, pos + 2) === "00") pos += 2;
    const tag = hex.slice(pos, pos + 2);
    pos += 2;
    if (tag !== "0c") return fallback;
    const numKeys = parseInt(hex.slice(pos, pos + 8), 16);
    pos += 8;
    const values: Record<string, number> = {};
    for (let i = 0; i < numKeys; i++) {
      const nameLen = parseInt(hex.slice(pos, pos + 2), 16);
      pos += 2;
      const nameBytes = hex.slice(pos, pos + nameLen * 2);
      pos += nameLen * 2;
      const name = Buffer.from(nameBytes, "hex").toString("ascii");
      const valTag = hex.slice(pos, pos + 2);
      pos += 2;
      if (valTag === "01") {
        const raw = hex.slice(pos, pos + 32);
        pos += 32;
        values[name] = parseInt(raw, 16);
      } else {
        break;
      }
    }
    return {
      reserveX: values["reserve-x"] ?? values["reserveX"] ?? 0,
      reserveY: values["reserve-y"] ?? values["reserveY"] ?? 0,
    };
  } catch {
    return fallback;
  }
}

function fmtUsd(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 1) return v.toFixed(2);
  if (v >= 0.001) return v.toFixed(4);
  return v.toFixed(6);
}

// -- Pool discovery -----------------------------------------------------------

async function discoverPools(): Promise<AppPool[]> {
  const data = await fetchJson(`${BFF_APP_BASE}/pools`);
  const pools: any[] = data.data ?? data.results ?? data.pools ?? [];
  return pools
    .filter((p: any) => {
      const tvl = Number(p.tvlUsd ?? p.tvl ?? 0);
      const id = String(p.poolId ?? "");
      return tvl >= MIN_TVL_USD && id.startsWith("dlmm_");
    })
    .map((p: any) => {
      const tx = p.tokens?.tokenX ?? {};
      const ty = p.tokens?.tokenY ?? {};
      const numericId = parseInt(String(p.poolId).replace("dlmm_", ""), 10);
      const feeBps = p.baseFee != null ? Math.round(Number(p.baseFee) * 10000) : undefined;
      return {
        id: p.poolId ?? `${tx.symbol}-${ty.symbol}`,
        token0Symbol: tx.symbol ?? "?",
        token1Symbol: ty.symbol ?? "?",
        tvlUsd: Number(p.tvlUsd ?? 0),
        volume24hUsd: Number(p.volumeUsd1d ?? 0),
        poolId: numericId,
        token0Decimals: Number(tx.decimals ?? 8),
        token1Decimals: Number(ty.decimals ?? 6),
        token0PriceUsd: Number(tx.priceUsd ?? 0),
        token1PriceUsd: Number(ty.priceUsd ?? 0),
        activeBinId: p.activeBinId != null ? Number(p.activeBinId) : undefined,
        feeBps,
      };
    });
}

// -- On-chain reads -----------------------------------------------------------

async function getActiveBin(poolId: number): Promise<number> {
  const res = await callReadOnly("get-active-bin-id", [cvUint(poolId)]);
  return parseUintResult(res.result ?? "");
}

async function getBinReserves(
  poolId: number,
  binId: number,
  p: AppPool
): Promise<BinReserves> {
  const res = await callReadOnly("get-bin-reserves", [
    cvUint(poolId),
    cvUint(binId),
  ]);
  const hex = res.result ?? "";
  const { reserveX, reserveY } = parseTupleReserves(hex);

  const rx = reserveX / 10 ** p.token0Decimals;
  const ry = reserveY / 10 ** p.token1Decimals;
  const rxUsd = rx * p.token0PriceUsd;
  const ryUsd = ry * p.token1PriceUsd;
  const totalUsd = rxUsd + ryUsd;

  return { binId, reserveX: rx, reserveY: ry, reserveXUsd: rxUsd, reserveYUsd: ryUsd, totalUsd };
}

async function scanBins(
  poolId: number,
  activeBin: number,
  pool: AppPool,
  radius: number
): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const start = activeBin - radius;
  const end = activeBin + radius;

  const batch = 5;
  for (let i = start; i <= end; i += batch) {
    const chunk = [];
    for (let j = i; j < Math.min(i + batch, end + 1); j++) {
      chunk.push(getBinReserves(poolId, j, pool));
    }
    const results = await Promise.all(chunk);
    bins.push(...results);
  }
  return bins.sort((a, b) => a.binId - b.binId);
}

// -- Coherence math -----------------------------------------------------------

/**
 * Pearson correlation of two numeric arrays.
 * Returns 0 if either array has zero variance.
 */
function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;

  const meanX = xs.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const meanY = ys.slice(0, n).reduce((s, v) => s + v, 0) / n;

  let num = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denom = Math.sqrt(denomX * denomY);
  if (denom < 1e-12) return 0;
  return num / denom;
}

/**
 * For each adjacent bin pair (i, i+1), compute a coherence score using
 * a sliding window of COHERENCE_WINDOW bins centered on each bin.
 * The correlation is computed between the totalUsd values within each window.
 * Returns a value in [-1, 1].
 */
function computePairwiseCoherences(
  bins: BinReserves[],
  activeBinId: number
): PairCoherence[] {
  const values = bins.map(b => b.totalUsd);
  const n = values.length;
  const half = Math.floor(COHERENCE_WINDOW / 2);
  const result: PairCoherence[] = [];

  for (let i = 0; i < n - 1; i++) {
    // Window centered around bin i
    const startI = Math.max(0, i - half);
    const endI = Math.min(n, i + half + 1);
    const windowI = values.slice(startI, endI);

    // Window centered around bin i+1
    const startJ = Math.max(0, i + 1 - half);
    const endJ = Math.min(n, i + 1 + half + 1);
    const windowJ = values.slice(startJ, endJ);

    // Align windows to the same length
    const minLen = Math.min(windowI.length, windowJ.length);
    const corr = pearson(windowI.slice(0, minLen), windowJ.slice(0, minLen));

    result.push({
      leftBinId: bins[i].binId,
      rightBinId: bins[i + 1].binId,
      offset: bins[i].binId - activeBinId,
      coherence: Math.round(corr * 1000) / 1000,
    });
  }

  return result;
}

/**
 * Find contiguous zones where coherence stays above HIGH_COHERENCE_THRESH.
 */
function findCoherenceZones(pairs: PairCoherence[]): CoherenceZone[] {
  const zones: CoherenceZone[] = [];
  let zoneStart: number | null = null;
  let zoneItems: PairCoherence[] = [];

  for (let i = 0; i <= pairs.length; i++) {
    const pair = pairs[i];
    const inZone = pair && pair.coherence >= HIGH_COHERENCE_THRESH;

    if (inZone && zoneStart === null) {
      zoneStart = i;
      zoneItems = [pair];
    } else if (inZone && zoneStart !== null) {
      zoneItems.push(pair);
    } else if (!inZone && zoneStart !== null) {
      if (zoneItems.length >= 2) {
        const avgCoh = zoneItems.reduce((s, p) => s + p.coherence, 0) / zoneItems.length;
        zones.push({
          startBinId: zoneItems[0].leftBinId,
          endBinId: zoneItems[zoneItems.length - 1].rightBinId,
          startOffset: zoneItems[0].offset,
          endOffset: zoneItems[zoneItems.length - 1].offset,
          width: zoneItems.length + 1,
          avgCoherence: Math.round(avgCoh * 1000) / 1000,
        });
      }
      zoneStart = null;
      zoneItems = [];
    }
  }

  return zones.sort((a, b) => b.avgCoherence - a.avgCoherence);
}

/**
 * Fragmentation index: fraction of transitions where coherence < LOW_COHERENCE_THRESH.
 */
function computeFragmentationIndex(pairs: PairCoherence[]): {
  fragmentedTransitions: number;
  totalTransitions: number;
  fragmentationIndex: number;
} {
  const total = pairs.length;
  const fragmented = pairs.filter(p => p.coherence < LOW_COHERENCE_THRESH).length;
  return {
    fragmentedTransitions: fragmented,
    totalTransitions: total,
    fragmentationIndex: total > 0 ? Math.round((fragmented / total) * 1000) / 1000 : 0,
  };
}

/**
 * Directional coherence: average coherence on left (below active) vs right (above active).
 */
function computeDirectionalCoherence(
  pairs: PairCoherence[]
): { leftCoherence: number; rightCoherence: number; directionalAsymmetry: number } {
  const leftPairs = pairs.filter(p => p.offset < 0);
  const rightPairs = pairs.filter(p => p.offset >= 0);

  const leftCoh = leftPairs.length > 0
    ? leftPairs.reduce((s, p) => s + p.coherence, 0) / leftPairs.length
    : 0;
  const rightCoh = rightPairs.length > 0
    ? rightPairs.reduce((s, p) => s + p.coherence, 0) / rightPairs.length
    : 0;

  const asymmetry = (rightCoh + 0.001) > 0
    ? (leftCoh + 0.001) / (rightCoh + 0.001)
    : 1;

  return {
    leftCoherence: Math.round(leftCoh * 1000) / 1000,
    rightCoherence: Math.round(rightCoh * 1000) / 1000,
    directionalAsymmetry: Math.round(Math.min(3, Math.max(0, asymmetry)) * 1000) / 1000,
  };
}

/**
 * Coherence decay: how quickly coherence falls as distance from active bin increases.
 * Uses linear regression of |coherence| vs |offset|.
 * Returns decay rate in [0, 1] and R².
 */
function computeCoherenceDecay(
  pairs: PairCoherence[]
): { coherenceDecayRate: number; coherenceDecayR2: number } {
  // Use absolute coherence values (we care about magnitude, not sign)
  const points = pairs.map(p => ({
    x: Math.abs(p.offset),
    y: Math.abs(p.coherence),
  }));

  if (points.length < 3) return { coherenceDecayRate: 0, coherenceDecayR2: 0 };

  // Log transform for exponential fit: ln(y) = a - decay*x
  const logPoints = points
    .filter(p => p.y > 0.001)
    .map(p => ({ x: p.x, y: Math.log(Math.max(p.y, 0.001)) }));

  if (logPoints.length < 2) return { coherenceDecayRate: 0, coherenceDecayR2: 0 };

  const n = logPoints.length;
  const sumX = logPoints.reduce((s, p) => s + p.x, 0);
  const sumY = logPoints.reduce((s, p) => s + p.y, 0);
  const sumXY = logPoints.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = logPoints.reduce((s, p) => s + p.x * p.x, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return { coherenceDecayRate: 0, coherenceDecayR2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const meanY = sumY / n;
  const ssRes = logPoints.reduce((s, p) => {
    const pred = slope * p.x + intercept;
    return s + (p.y - pred) ** 2;
  }, 0);
  const ssTot = logPoints.reduce((s, p) => s + (p.y - meanY) ** 2, 0);
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  // Decay rate: steeper negative slope = faster decay. Clamp to [0, 1].
  const decayRate = Math.max(0, Math.min(1, -slope / 2));

  return {
    coherenceDecayRate: Math.round(decayRate * 1000) / 1000,
    coherenceDecayR2: Math.round(r2 * 1000) / 1000,
  };
}

/**
 * Composite coherence score (0-100) combining all metrics.
 */
function computeCoherenceScore(
  avgPairwiseCoherence: number,
  fragmentationIndex: number,
  zoneCount: number,
  avgZoneWidth: number,
  directionalAsymmetry: number,
  coherenceDecayRate: number,
  coherenceDecayR2: number
): number {
  let score = 50;

  // Base: average pairwise coherence (range -1 to 1, scale to contribution)
  score += Math.round(avgPairwiseCoherence * 20); // up to +/-20

  // Fragmentation penalty: more fragmented = lower score
  score -= Math.round(fragmentationIndex * 25);

  // Zones: more zones with wider widths = more organized liquidity
  if (zoneCount > 0) {
    score += Math.min(10, zoneCount * 2);
    score += Math.min(5, avgZoneWidth / 3);
  }

  // Directional asymmetry: close to 1 = symmetric = good
  const asymDiff = Math.abs(directionalAsymmetry - 1);
  if (asymDiff < 0.2) score += 8;
  else if (asymDiff < 0.5) score += 3;
  else if (asymDiff > 1.5) score -= 8;

  // Decay: moderate decay preferred
  if (coherenceDecayRate > 0.05 && coherenceDecayRate < 0.4) score += 7;
  else if (coherenceDecayRate >= 0.4) score -= 5;

  // Good fit to exponential model = more orderly behavior
  score += Math.round(coherenceDecayR2 * 5);

  return Math.max(0, Math.min(100, Math.round(score)));
}

// -- ASCII coherence map ------------------------------------------------------

function buildCoherenceMap(
  bins: BinReserves[],
  pairs: PairCoherence[],
  activeBinId: number
): string {
  if (bins.length === 0) return "(no bins)";

  const pairMap = new Map<number, number>();
  for (const p of pairs) {
    pairMap.set(p.leftBinId, p.coherence);
  }

  const lines: string[] = [
    "COHERENCE MAP (pairwise coherence to next bin, liquidity bar)",
    "",
    "  offset  |  $value  |  liquidity bar               | coh  | level",
    "  --------+----------+------------------------------+------+------",
  ];

  const maxVal = Math.max(...bins.map(b => b.totalUsd), 0.001);
  const barWidth = 28;
  const step = bins.length > 40 ? 2 : 1;

  for (let i = 0; i < bins.length; i += step) {
    const bin = bins[i];
    const offset = bin.binId - activeBinId;
    const label = `${offset >= 0 ? "+" : ""}${offset}`;
    const usd = fmtUsd(bin.totalUsd).padStart(7);

    const norm = bin.totalUsd / maxVal;
    const barLen = Math.round(norm * barWidth);
    const bar = "\u2588".repeat(Math.max(0, barLen)).padEnd(barWidth);

    const coh = pairMap.get(bin.binId);
    const cohStr = coh != null ? coh.toFixed(2).padStart(5) : "  n/a";
    const level =
      coh == null ? "  ---"
      : coh >= HIGH_COHERENCE_THRESH ? " HIGH"
      : coh < LOW_COHERENCE_THRESH ? "  LOW"
      : "  MED";

    const activeMarker = offset === 0 ? "\u25c4" : " ";

    lines.push(
      `  ${label.padStart(6)}  | ${usd} | ${bar} |${cohStr} |${level} ${activeMarker}`
    );
  }

  lines.push("");
  lines.push(
    "\u2588 = liquidity  \u25c4 = active bin  HIGH = coh >= 0.7  MED = 0.3-0.7  LOW = coh < 0.3"
  );
  return lines.join("\n");
}

// -- Profile ------------------------------------------------------------------

function buildProfile(bins: BinReserves[], activeBinId: number): CoherenceProfile {
  const populated = bins.filter(b => b.totalUsd > 0.01);
  const scannedTvl = populated.reduce((s, b) => s + b.totalUsd, 0);

  const pairs = computePairwiseCoherences(bins, activeBinId);

  // Pairwise stats
  const cohValues = pairs.map(p => p.coherence);
  const avgPairwise = cohValues.length > 0
    ? cohValues.reduce((s, c) => s + c, 0) / cohValues.length
    : 0;
  const sorted = [...cohValues].sort((a, b) => a - b);
  const medianPairwise = sorted.length > 0
    ? sorted[Math.floor(sorted.length / 2)]
    : 0;

  // Zones
  const zones = findCoherenceZones(pairs);
  const avgZoneWidth = zones.length > 0
    ? zones.reduce((s, z) => s + z.width, 0) / zones.length
    : 0;

  // Fragmentation
  const { fragmentedTransitions, totalTransitions, fragmentationIndex } =
    computeFragmentationIndex(pairs);

  // Directional
  const { leftCoherence, rightCoherence, directionalAsymmetry } =
    computeDirectionalCoherence(pairs);

  // Decay
  const { coherenceDecayRate, coherenceDecayR2 } = computeCoherenceDecay(pairs);

  // Score
  const coherenceScore = computeCoherenceScore(
    avgPairwise,
    fragmentationIndex,
    zones.length,
    avgZoneWidth,
    directionalAsymmetry,
    coherenceDecayRate,
    coherenceDecayR2
  );

  // ASCII map
  const asciiCoherenceMap = buildCoherenceMap(bins, pairs, activeBinId);

  return {
    populatedBins: populated.length,
    totalBins: bins.length,
    scannedTvlUsd: Math.round(scannedTvl * 100) / 100,

    pairwiseCoherences: pairs,
    avgPairwiseCoherence: Math.round(avgPairwise * 1000) / 1000,
    medianPairwiseCoherence: Math.round(medianPairwise * 1000) / 1000,

    coherenceZones: zones,
    zoneCount: zones.length,
    avgZoneWidth: Math.round(avgZoneWidth * 10) / 10,

    fragmentedTransitions,
    totalTransitions,
    fragmentationIndex,

    leftCoherence,
    rightCoherence,
    directionalAsymmetry,

    coherenceDecayRate,
    coherenceDecayR2,

    coherenceScore,
    asciiCoherenceMap,
  };
}

function buildRecommendation(pair: string, profile: CoherenceProfile): string {
  const parts: string[] = [];

  parts.push(
    `${pair} coherence analysis: avg pairwise coherence ${profile.avgPairwiseCoherence.toFixed(3)}, ` +
    `fragmentation index ${(profile.fragmentationIndex * 100).toFixed(1)}%, ` +
    `${profile.zoneCount} coherence zone(s) detected. ` +
    `Composite coherence score: ${profile.coherenceScore}/100.`
  );

  // Pairwise coherence interpretation
  if (profile.avgPairwiseCoherence > 0.6) {
    parts.push(
      `High inter-bin coherence (${profile.avgPairwiseCoherence.toFixed(3)}) — ` +
      `adjacent bins move together, indicating coordinated or algorithmically managed liquidity.`
    );
  } else if (profile.avgPairwiseCoherence < 0.2) {
    parts.push(
      `Low inter-bin coherence (${profile.avgPairwiseCoherence.toFixed(3)}) — ` +
      `bin reserves are largely independent, suggesting fragmented or opportunistic LP behavior.`
    );
  } else {
    parts.push(
      `Moderate inter-bin coherence (${profile.avgPairwiseCoherence.toFixed(3)}) — ` +
      `mixed coordination; some clusters of aligned liquidity exist alongside independent bins.`
    );
  }

  // Fragmentation
  if (profile.fragmentationIndex > 0.5) {
    parts.push(
      `High fragmentation (${(profile.fragmentationIndex * 100).toFixed(1)}% of transitions are low-coherence) — ` +
      `pool depth is discontinuous. LPs may face unexpected slippage near gap boundaries.`
    );
  } else if (profile.fragmentationIndex < 0.2) {
    parts.push(
      `Low fragmentation (${(profile.fragmentationIndex * 100).toFixed(1)}%) — ` +
      `smooth reserve transitions throughout. Consistent depth profile.`
    );
  } else {
    parts.push(
      `Moderate fragmentation (${(profile.fragmentationIndex * 100).toFixed(1)}%) — ` +
      `some discontinuities but generally cohesive reserve profile.`
    );
  }

  // Zones
  if (profile.zoneCount > 0) {
    parts.push(
      `${profile.zoneCount} high-coherence zone(s), avg width ${profile.avgZoneWidth.toFixed(1)} bins. ` +
      `${profile.zoneCount >= 3
        ? "Multiple structured zones suggest algorithmic LP rebalancing."
        : "Coherence zones indicate localized LP coordination."}`
    );
  } else {
    parts.push(
      `No high-coherence zones detected — reserves change independently across all bin transitions.`
    );
  }

  // Directional
  const asymLabel = profile.directionalAsymmetry > 1.3
    ? "left-dominant (bearish LP bias)"
    : profile.directionalAsymmetry < 0.77
    ? "right-dominant (bullish LP bias)"
    : "balanced";
  parts.push(
    `Directional coherence — left: ${profile.leftCoherence.toFixed(3)}, right: ${profile.rightCoherence.toFixed(3)} ` +
    `(asymmetry: ${profile.directionalAsymmetry.toFixed(2)} — ${asymLabel}). ` +
    `${Math.abs(profile.directionalAsymmetry - 1) > 0.4
      ? "Significant side imbalance may reflect directional LP strategies or recent price movement."
      : "Balanced coherence on both sides."}`
  );

  // Decay
  if (profile.coherenceDecayRate > 0) {
    const decayLabel = profile.coherenceDecayRate > 0.4 ? "rapid" : profile.coherenceDecayRate > 0.15 ? "moderate" : "slow";
    parts.push(
      `Coherence decay: ${decayLabel} (rate ${profile.coherenceDecayRate.toFixed(3)}, R²=${profile.coherenceDecayR2.toFixed(3)}). ` +
      `${profile.coherenceDecayRate > 0.4
        ? "Bins far from active quickly become uncorrelated — depth coordination is narrow."
        : profile.coherenceDecayRate < 0.1
        ? "Coherence persists far from active bin — wide coordinated depth range."
        : "Moderate coherence decay — coordination tapers naturally outward."}`
    );
  }

  return parts.join(" ");
}

// -- Main analysis ------------------------------------------------------------

async function analyzeCoherence(pool: AppPool): Promise<CoherenceAnalysis> {
  const poolId = pool.poolId!;
  const activeBinId = pool.activeBinId ?? await getActiveBin(poolId);
  const rawBins = await scanBins(poolId, activeBinId, pool, BIN_SCAN_RADIUS);

  const populated = rawBins.filter(b => b.totalUsd > 0.01);
  const scannedTvl = populated.reduce((s, b) => s + b.totalUsd, 0);

  const profile = buildProfile(rawBins, activeBinId);
  const recommendation = buildRecommendation(
    `${pool.token0Symbol}/${pool.token1Symbol}`,
    profile
  );

  return {
    poolId,
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    feeBps: pool.feeBps ?? 30,
    activeBinId,
    binsScanned: rawBins.length,
    binsPopulated: populated.length,
    scannedTvlUsd: Math.round(scannedTvl * 100) / 100,
    profile,
    recommendation,
  };
}

function makeErrorResult(pool: AppPool, errMsg: string): CoherenceAnalysis {
  return {
    poolId: pool.poolId!,
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    feeBps: pool.feeBps ?? 30,
    activeBinId: 0,
    binsScanned: 0,
    binsPopulated: 0,
    scannedTvlUsd: 0,
    profile: {
      populatedBins: 0, totalBins: 0, scannedTvlUsd: 0,
      pairwiseCoherences: [], avgPairwiseCoherence: 0, medianPairwiseCoherence: 0,
      coherenceZones: [], zoneCount: 0, avgZoneWidth: 0,
      fragmentedTransitions: 0, totalTransitions: 0, fragmentationIndex: 0,
      leftCoherence: 0, rightCoherence: 0, directionalAsymmetry: 1,
      coherenceDecayRate: 0, coherenceDecayR2: 0,
      coherenceScore: 0, asciiCoherenceMap: "",
    },
    recommendation: `Analysis failed: ${errMsg}`,
  };
}

// -- CLI ----------------------------------------------------------------------

const program = new Command();

program
  .name("hodlmm-bin-coherence")
  .description("HODLMM Bin Coherence Analyzer — pairwise correlation, zones, fragmentation, directional asymmetry, decay");

program
  .command("doctor")
  .description("Check environment readiness")
  .action(async () => {
    try {
      const pools = await discoverPools();
      const dlmmPools = pools.filter(p => p.poolId != null);
      console.log(JSON.stringify({
        result: "ready",
        details: {
          bffApi: "reachable",
          hiroApi: "reachable",
          dlmmPoolsFound: dlmmPools.length,
          minTvlFilter: `$${MIN_TVL_USD}`,
          scanRadius: BIN_SCAN_RADIUS,
          coherenceWindow: COHERENCE_WINDOW,
          highCoherenceThreshold: HIGH_COHERENCE_THRESH,
          lowCoherenceThreshold: LOW_COHERENCE_THRESH,
          analyses: [
            "pairwise Pearson coherence (sliding window)",
            "coherence zones (contiguous high-coherence ranges)",
            "fragmentation index (fraction of low-coherence transitions)",
            "directional coherence (left vs right of active bin)",
            "directional asymmetry ratio",
            "coherence decay rate (exponential fit)",
            "composite coherence score (0-100)",
            "ASCII coherence map",
          ],
        },
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Doctor failed: ${err.message}` }));
    }
  });

program
  .command("run")
  .description("Analyze bin coherence for HODLMM pools")
  .option("--pool <id>", "Specific pool ID to analyze")
  .option("--top <n>", "Number of top pools by TVL", "3")
  .action(async (opts) => {
    try {
      const pools = await discoverPools();
      const dlmmPools = pools.filter(p => p.poolId != null);

      if (dlmmPools.length === 0) {
        console.log(JSON.stringify({ error: "No DLMM pools found above TVL threshold" }));
        return;
      }

      let targets: AppPool[];
      if (opts.pool) {
        const match = dlmmPools.find(p => String(p.poolId) === opts.pool);
        if (!match) {
          console.log(JSON.stringify({ error: `Pool ${opts.pool} not found` }));
          return;
        }
        targets = [match];
      } else {
        targets = dlmmPools
          .sort((a, b) => b.tvlUsd - a.tvlUsd)
          .slice(0, parseInt(opts.top));
      }

      const results: CoherenceAnalysis[] = [];
      for (const pool of targets) {
        try {
          const analysis = await analyzeCoherence(pool);
          results.push(analysis);
        } catch (err: any) {
          results.push(makeErrorResult(pool, err.message));
        }
      }

      const summary = {
        poolsAnalyzed: results.length,
        avgCoherenceScore: Math.round(
          results.reduce((s, r) => s + r.profile.coherenceScore, 0) / results.length
        ),
        avgPairwiseCoherence: Math.round(
          results.reduce((s, r) => s + r.profile.avgPairwiseCoherence, 0) / results.length * 1000
        ) / 1000,
        avgFragmentationIndex: Math.round(
          results.reduce((s, r) => s + r.profile.fragmentationIndex, 0) / results.length * 1000
        ) / 1000,
        totalCoherenceZones: results.reduce((s, r) => s + r.profile.zoneCount, 0),
        mostCoherent: results.reduce((best, r) =>
          r.profile.avgPairwiseCoherence > best.profile.avgPairwiseCoherence ? r : best, results[0]),
        leastFragmented: results.reduce((best, r) =>
          r.profile.fragmentationIndex < best.profile.fragmentationIndex ? r : best, results[0]),
      };

      console.log(JSON.stringify({
        result: "coherence_analysis",
        data: { pools: results, summary },
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Run failed: ${err.message}` }));
    }
  });

program
  .command("status")
  .description("Quick coherence summary for top pools")
  .action(async () => {
    try {
      const pools = await discoverPools();
      const dlmmPools = pools
        .filter(p => p.poolId != null)
        .sort((a, b) => b.tvlUsd - a.tvlUsd)
        .slice(0, 5);

      const summaries = [];
      for (const pool of dlmmPools) {
        try {
          const analysis = await analyzeCoherence(pool);
          summaries.push({
            pair: analysis.pair,
            poolId: analysis.poolId,
            tvlUsd: analysis.tvlUsd,
            coherenceScore: analysis.profile.coherenceScore,
            avgPairwiseCoherence: analysis.profile.avgPairwiseCoherence,
            medianPairwiseCoherence: analysis.profile.medianPairwiseCoherence,
            fragmentationIndex: analysis.profile.fragmentationIndex,
            zoneCount: analysis.profile.zoneCount,
            avgZoneWidth: analysis.profile.avgZoneWidth,
            leftCoherence: analysis.profile.leftCoherence,
            rightCoherence: analysis.profile.rightCoherence,
            directionalAsymmetry: analysis.profile.directionalAsymmetry,
            coherenceDecayRate: analysis.profile.coherenceDecayRate,
          });
        } catch {
          summaries.push({
            pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
            poolId: pool.poolId,
            tvlUsd: pool.tvlUsd,
            coherenceScore: -1,
          });
        }
      }

      console.log(JSON.stringify({ result: "coherence_status", data: summaries }));
    } catch (err: any) {
      console.log(JSON.stringify({ error: `Status failed: ${err.message}` }));
    }
  });

program.parse();
