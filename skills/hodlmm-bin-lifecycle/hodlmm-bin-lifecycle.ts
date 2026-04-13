#!/usr/bin/env bun
/**
 * hodlmm-bin-lifecycle.ts
 *
 * HODLMM Bin Lifecycle Analyzer — Classifies each bin's lifecycle stage
 * based on reserve levels, proximity to active bin, and reserve composition.
 *
 * Lifecycle stages:
 *   EMPTY    — no reserves
 *   SEEDING  — minimal reserves, newly provisioned
 *   ACTIVE   — healthy reserves, within trading range
 *   PEAK     — highest concentration bins, heavily utilized
 *   DECLINING — reserves thinning, drifting from active range
 *   DORMANT  — residual reserves far from active bin, unlikely to trade
 *
 * Key metrics:
 *  - Per-bin lifecycle classification with confidence scores
 *  - Stage distribution summary (% of bins in each stage)
 *  - Pool maturity profile (NASCENT / GROWING / MATURE / TOP-HEAVY / HOLLOWING)
 *  - Active zone width and boundary detection
 *  - Reserve velocity gradient (how fast reserves decay from center)
 *  - Lifecycle transition zones (where bins shift between stages)
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 61).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 30;

// Lifecycle thresholds (fraction of mean bin reserve)
const SEEDING_THRESHOLD = 0.1;   // < 10% of mean → seeding
const ACTIVE_LOW = 0.3;          // 30-150% of mean → active
const PEAK_THRESHOLD = 1.5;      // > 150% of mean → peak
const DORMANT_DISTANCE = 15;     // bins > 15 from active with low reserves → dormant

// ── Types ─────────────────────────────────────────────────────────────────────

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

type LifecycleStage = "EMPTY" | "SEEDING" | "ACTIVE" | "PEAK" | "DECLINING" | "DORMANT";

interface BinLifecycle {
  binId: number;
  reserveX: number;
  reserveY: number;
  totalUsd: number;
  shareOfTotal: number;
  distanceFromActive: number;
  stage: LifecycleStage;
  confidence: number;
  reserveRatio: number; // X / (X + Y), 0-1
}

type PoolMaturity = "NASCENT" | "GROWING" | "MATURE" | "TOP-HEAVY" | "HOLLOWING";

interface LifecycleAnalysis {
  pool: string;
  pair: string;
  tvlUsd: number;
  activeBinId: number;
  binsScanned: number;
  binsWithLiquidity: number;
  stageDistribution: Record<LifecycleStage, { count: number; pct: number; totalUsd: number }>;
  poolMaturity: PoolMaturity;
  maturityScore: number;
  activeZone: { lower: number; upper: number; width: number };
  decayGradient: number;
  transitionZones: { binId: number; from: LifecycleStage; to: LifecycleStage }[];
  bins: BinLifecycle[];
  verdict: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (!r.ok) {
        if (r.status === 429 && i < retries) { await sleep(2000 * (i + 1)); continue; }
        throw new Error(`HTTP ${r.status} for ${url}`);
      }
      return r.json();
    } catch (e: any) {
      if (i === retries) throw e;
      await sleep(1000 * (i + 1));
    }
  }
}

function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function barChart(value: number, maxValue: number, width: number = 20): string {
  if (maxValue === 0) return "░".repeat(width);
  const filled = Math.round((value / maxValue) * width);
  return "█".repeat(Math.min(filled, width)) + "░".repeat(Math.max(width - filled, 0));
}

function stageIcon(stage: LifecycleStage): string {
  switch (stage) {
    case "EMPTY":     return "·";
    case "SEEDING":   return "○";
    case "ACTIVE":    return "●";
    case "PEAK":      return "★";
    case "DECLINING": return "◐";
    case "DORMANT":   return "◌";
  }
}

// ── Data Fetching ─────────────────────────────────────────────────────────────

async function fetchPools(): Promise<AppPool[]> {
  const data = await fetchJson(`${BFF_APP_BASE}/hodlmm/pools`);
  const pools = Array.isArray(data) ? data : data?.data ?? data?.pools ?? [];
  return pools.filter((p: any) => (p.tvlUsd ?? 0) >= MIN_TVL_USD);
}

function findPool(query: string, pools: AppPool[]): AppPool | null {
  const q = query.toLowerCase();
  return (
    pools.find((p) => p.id?.toLowerCase() === q) ??
    pools.find((p) => {
      const pair = `${p.token0Symbol}-${p.token1Symbol}`.toLowerCase();
      return pair.includes(q) || q.includes(pair);
    }) ??
    pools.find((p) => {
      const sym = `${p.token0Symbol}${p.token1Symbol}`.toLowerCase();
      return sym.includes(q) || q.includes(sym);
    }) ??
    null
  );
}

async function fetchActiveBinId(poolId: number): Promise<number> {
  const url =
    `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-active-bin-id`;
  const body = {
    sender: SENDER,
    arguments: [`0x0100000000000000000000000000000${poolId.toString(16).padStart(3, "0")}`],
  };
  const resp = await fetchJson(url + `?sender=${SENDER}&arguments[]=${body.arguments[0]}`);
  if (resp?.result) {
    const match = resp.result.match(/u(\d+)/);
    if (match) return parseInt(match[1]);
  }
  return 8388608;
}

async function fetchBinReserves(
  poolId: number,
  binId: number,
): Promise<{ reserveX: number; reserveY: number }> {
  const poolHex = `0x0100000000000000000000000000000${poolId.toString(16).padStart(3, "0")}`;
  const binHex = `0x0100000000000000000000000000${binId.toString(16).padStart(6, "0")}`;
  const url =
    `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/get-bin` +
    `?sender=${SENDER}&arguments[]=${poolHex}&arguments[]=${binHex}`;

  try {
    const resp = await fetchJson(url);
    if (resp?.result) {
      const rxMatch = resp.result.match(/reserve-x\s+u(\d+)/);
      const ryMatch = resp.result.match(/reserve-y\s+u(\d+)/);
      return {
        reserveX: rxMatch ? parseInt(rxMatch[1]) : 0,
        reserveY: ryMatch ? parseInt(ryMatch[1]) : 0,
      };
    }
  } catch {}
  return { reserveX: 0, reserveY: 0 };
}

async function scanBins(
  pool: AppPool,
  activeBinId: number,
  radius: number
): Promise<BinLifecycle[]> {
  const bins: BinLifecycle[] = [];
  const dec0 = pool.token0Decimals || 6;
  const dec1 = pool.token1Decimals || 6;
  const p0 = pool.token0PriceUsd || 0;
  const p1 = pool.token1PriceUsd || 0;
  const poolId = pool.poolId ?? 1;

  const startBin = activeBinId - radius;
  const endBin = activeBinId + radius;

  const batchSize = 5;
  for (let i = startBin; i <= endBin; i += batchSize) {
    const batch = Array.from(
      { length: Math.min(batchSize, endBin - i + 1) },
      (_, k) => i + k
    );

    const results = await Promise.all(
      batch.map((binId) => fetchBinReserves(poolId, binId))
    );

    for (let k = 0; k < batch.length; k++) {
      const { reserveX, reserveY } = results[k];
      const rx = reserveX / 10 ** dec0;
      const ry = reserveY / 10 ** dec1;
      const totalUsd = rx * p0 + ry * p1;
      const rawTotal = rx + ry;

      bins.push({
        binId: batch[k],
        reserveX: rx,
        reserveY: ry,
        totalUsd,
        shareOfTotal: 0,
        distanceFromActive: Math.abs(batch[k] - activeBinId),
        stage: "EMPTY",
        confidence: 0,
        reserveRatio: rawTotal > 0 ? rx / rawTotal : 0.5,
      });
    }

    if (i + batchSize <= endBin) await sleep(200);
  }

  const totalLiq = bins.reduce((s, b) => s + b.totalUsd, 0);
  for (const b of bins) {
    b.shareOfTotal = totalLiq > 0 ? b.totalUsd / totalLiq : 0;
  }

  return bins;
}

// ── Lifecycle Classification ────────────────────────────────────────────────

function classifyBins(bins: BinLifecycle[], activeBinId: number): void {
  const nonEmpty = bins.filter((b) => b.totalUsd > 0.01);
  if (nonEmpty.length === 0) {
    for (const b of bins) { b.stage = "EMPTY"; b.confidence = 1.0; }
    return;
  }

  const meanUsd = nonEmpty.reduce((s, b) => s + b.totalUsd, 0) / nonEmpty.length;

  for (const bin of bins) {
    if (bin.totalUsd < 0.01) {
      bin.stage = "EMPTY";
      bin.confidence = 1.0;
      continue;
    }

    const ratio = bin.totalUsd / meanUsd;
    const dist = bin.distanceFromActive;

    if (ratio >= PEAK_THRESHOLD) {
      bin.stage = "PEAK";
      bin.confidence = Math.min(1.0, ratio / (PEAK_THRESHOLD * 2));
    } else if (ratio >= ACTIVE_LOW) {
      if (dist > DORMANT_DISTANCE) {
        bin.stage = "DECLINING";
        bin.confidence = 0.6 + 0.4 * Math.min(1, dist / (DORMANT_DISTANCE * 2));
      } else {
        bin.stage = "ACTIVE";
        bin.confidence = 0.5 + 0.5 * Math.min(1, ratio / PEAK_THRESHOLD);
      }
    } else if (ratio >= SEEDING_THRESHOLD) {
      if (dist > DORMANT_DISTANCE) {
        bin.stage = "DORMANT";
        bin.confidence = 0.5 + 0.5 * Math.min(1, dist / (DORMANT_DISTANCE * 2));
      } else if (dist <= 5) {
        bin.stage = "SEEDING";
        bin.confidence = 0.6;
      } else {
        bin.stage = "DECLINING";
        bin.confidence = 0.5 + 0.3 * (dist / DORMANT_DISTANCE);
      }
    } else {
      if (dist > DORMANT_DISTANCE) {
        bin.stage = "DORMANT";
        bin.confidence = 0.8;
      } else {
        bin.stage = "SEEDING";
        bin.confidence = 0.5;
      }
    }
  }
}

// ── Pool Maturity ───────────────────────────────────────────────────────────

function classifyPoolMaturity(
  dist: Record<LifecycleStage, { count: number; pct: number; totalUsd: number }>,
  decayGradient: number
): { maturity: PoolMaturity; score: number } {
  const peakPct = dist.PEAK.pct;
  const activePct = dist.ACTIVE.pct;
  const seedingPct = dist.SEEDING.pct;
  const dormantPct = dist.DORMANT.pct;
  const decliningPct = dist.DECLINING.pct;

  let score = 0;
  score += activePct * 40;
  score += peakPct * 30;
  score += seedingPct * 10;
  score -= dormantPct * 15;
  score -= decliningPct * 10;
  score = Math.max(0, Math.min(100, score));

  let maturity: PoolMaturity;
  if (seedingPct > 0.5) {
    maturity = "NASCENT";
  } else if (activePct > 0.4 && peakPct < 0.3) {
    maturity = "GROWING";
  } else if (activePct > 0.3 && peakPct >= 0.1 && dormantPct < 0.2) {
    maturity = "MATURE";
  } else if (peakPct > 0.4) {
    maturity = "TOP-HEAVY";
  } else {
    maturity = "HOLLOWING";
  }

  return { maturity, score };
}

// ── Analysis ────────────────────────────────────────────────────────────────

function computeDecayGradient(bins: BinLifecycle[], activeBinId: number): number {
  const sorted = bins
    .filter((b) => b.totalUsd > 0.01)
    .sort((a, b) => a.distanceFromActive - b.distanceFromActive);

  if (sorted.length < 3) return 0;

  const near = sorted.slice(0, Math.ceil(sorted.length * 0.3));
  const far = sorted.slice(Math.floor(sorted.length * 0.7));

  const nearAvg = near.reduce((s, b) => s + b.totalUsd, 0) / near.length;
  const farAvg = far.reduce((s, b) => s + b.totalUsd, 0) / far.length;

  if (nearAvg === 0) return 0;
  return (nearAvg - farAvg) / nearAvg;
}

function findActiveZone(bins: BinLifecycle[]): { lower: number; upper: number; width: number } {
  const active = bins.filter((b) => b.stage === "ACTIVE" || b.stage === "PEAK");
  if (active.length === 0) return { lower: 0, upper: 0, width: 0 };

  const sorted = active.sort((a, b) => a.binId - b.binId);
  return {
    lower: sorted[0].binId,
    upper: sorted[sorted.length - 1].binId,
    width: sorted[sorted.length - 1].binId - sorted[0].binId + 1,
  };
}

function findTransitionZones(
  bins: BinLifecycle[]
): { binId: number; from: LifecycleStage; to: LifecycleStage }[] {
  const transitions: { binId: number; from: LifecycleStage; to: LifecycleStage }[] = [];
  const sorted = [...bins].sort((a, b) => a.binId - b.binId);

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].stage;
    const curr = sorted[i].stage;
    if (prev !== curr && prev !== "EMPTY" && curr !== "EMPTY") {
      transitions.push({ binId: sorted[i].binId, from: prev, to: curr });
    }
  }

  return transitions;
}

function computeStageDistribution(
  bins: BinLifecycle[]
): Record<LifecycleStage, { count: number; pct: number; totalUsd: number }> {
  const stages: LifecycleStage[] = ["EMPTY", "SEEDING", "ACTIVE", "PEAK", "DECLINING", "DORMANT"];
  const total = bins.length;
  const dist = {} as Record<LifecycleStage, { count: number; pct: number; totalUsd: number }>;

  for (const stage of stages) {
    const matching = bins.filter((b) => b.stage === stage);
    dist[stage] = {
      count: matching.length,
      pct: total > 0 ? matching.length / total : 0,
      totalUsd: matching.reduce((s, b) => s + b.totalUsd, 0),
    };
  }

  return dist;
}

function generateVerdict(analysis: LifecycleAnalysis): string {
  const { poolMaturity, maturityScore, stageDistribution: sd, activeZone, decayGradient } = analysis;
  const lines: string[] = [];

  switch (poolMaturity) {
    case "NASCENT":
      lines.push(
        `Pool is nascent — ${fmtPct(sd.SEEDING.pct)} of bins still seeding. ` +
        `Liquidity is thin and fragmented. Early-stage risk is high but fee capture opportunity exists for first movers.`
      );
      break;
    case "GROWING":
      lines.push(
        `Pool is in growth phase — ${fmtPct(sd.ACTIVE.pct)} active bins with healthy distribution. ` +
        `Active zone spans ${activeZone.width} bins. Good time to enter concentrated positions near the active range.`
      );
      break;
    case "MATURE":
      lines.push(
        `Mature pool with balanced lifecycle distribution (score: ${maturityScore.toFixed(0)}/100). ` +
        `${fmtPct(sd.ACTIVE.pct)} active, ${fmtPct(sd.PEAK.pct)} at peak. ` +
        `Stable for LP positions but fee competition is higher.`
      );
      break;
    case "TOP-HEAVY":
      lines.push(
        `Top-heavy pool — ${fmtPct(sd.PEAK.pct)} of bins at peak concentration. ` +
        `Liquidity is heavily concentrated in a few bins. Risk of rapid IL if price moves outside the narrow peak zone.`
      );
      break;
    case "HOLLOWING":
      lines.push(
        `Pool is hollowing out — ${fmtPct(sd.DECLINING.pct)} declining, ${fmtPct(sd.DORMANT.pct)} dormant. ` +
        `LPs may be withdrawing or price has drifted significantly. Consider rebalancing or exiting positions.`
      );
      break;
  }

  if (decayGradient > 0.8) {
    lines.push(`Steep reserve decay gradient (${(decayGradient * 100).toFixed(0)}%) — liquidity drops off sharply from center.`);
  } else if (decayGradient < 0.3) {
    lines.push(`Flat reserve profile (${(decayGradient * 100).toFixed(0)}% gradient) — liquidity is evenly spread, reducing concentration risk.`);
  }

  return lines.join(" ");
}

// ── Display ─────────────────────────────────────────────────────────────────

function displayAnalysis(analysis: LifecycleAnalysis, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(analysis, null, 2));
    return;
  }

  const { stageDistribution: sd } = analysis;

  console.log(`\n${"═".repeat(70)}`);
  console.log(`  HODLMM BIN LIFECYCLE ANALYZER`);
  console.log(`${"═".repeat(70)}`);

  console.log(`\n  Pool:             ${analysis.pool}`);
  console.log(`  Pair:             ${analysis.pair}`);
  console.log(`  TVL:              ${fmtUsd(analysis.tvlUsd)}`);
  console.log(`  Active Bin:       ${analysis.activeBinId}`);
  console.log(`  Bins Scanned:     ${analysis.binsScanned}`);
  console.log(`  Bins w/ Liq:      ${analysis.binsWithLiquidity}`);

  console.log(`\n${"─".repeat(70)}`);
  console.log(`  POOL MATURITY`);
  console.log(`${"─".repeat(70)}`);
  console.log(`  Maturity:         ${analysis.poolMaturity}`);
  console.log(`  Score:            ${analysis.maturityScore.toFixed(0)}/100`);
  console.log(`  Decay Gradient:   ${(analysis.decayGradient * 100).toFixed(1)}%`);
  console.log(`  Active Zone:      bins ${analysis.activeZone.lower}–${analysis.activeZone.upper} (${analysis.activeZone.width} wide)`);

  console.log(`\n${"─".repeat(70)}`);
  console.log(`  STAGE DISTRIBUTION`);
  console.log(`${"─".repeat(70)}`);

  const stages: LifecycleStage[] = ["PEAK", "ACTIVE", "SEEDING", "DECLINING", "DORMANT", "EMPTY"];
  const maxCount = Math.max(...stages.map((s) => sd[s].count));

  for (const stage of stages) {
    const d = sd[stage];
    const icon = stageIcon(stage);
    const bar = barChart(d.count, maxCount, 15);
    console.log(
      `  ${icon} ${stage.padEnd(10)} ${bar} ${String(d.count).padStart(3)} bins (${fmtPct(d.pct).padStart(6)}) │ ${fmtUsd(d.totalUsd).padStart(10)}`
    );
  }

  // ASCII lifecycle map
  console.log(`\n${"─".repeat(70)}`);
  console.log(`  BIN LIFECYCLE MAP (· empty  ○ seeding  ● active  ★ peak  ◐ declining  ◌ dormant)`);
  console.log(`${"─".repeat(70)}`);

  const sorted = [...analysis.bins].sort((a, b) => a.binId - b.binId);
  const maxUsd = Math.max(...sorted.map((b) => b.totalUsd));

  const displayBins = sorted.filter(
    (b) => b.totalUsd > 0.01 || b.distanceFromActive <= 5
  ).slice(0, 50);

  for (const bin of displayBins) {
    const marker = bin.binId === analysis.activeBinId ? ">" : " ";
    const icon = stageIcon(bin.stage);
    const bar = barChart(bin.totalUsd, maxUsd, 20);
    const dist = bin.distanceFromActive === 0 ? " [active]" :
      ` ${bin.binId < analysis.activeBinId ? "-" : "+"}${bin.distanceFromActive}`;
    console.log(
      `  ${marker}${icon} Bin ${String(bin.binId).padStart(8)} │ ${bar} │ ${fmtUsd(bin.totalUsd).padStart(10)} │ ${bin.stage.padEnd(10)}${dist}`
    );
  }

  if (sorted.filter((b) => b.totalUsd > 0.01).length > 50) {
    console.log(`  ... and more bins with liquidity`);
  }

  // Transition zones
  if (analysis.transitionZones.length > 0) {
    console.log(`\n${"─".repeat(70)}`);
    console.log(`  TRANSITION ZONES`);
    console.log(`${"─".repeat(70)}`);
    for (const tz of analysis.transitionZones.slice(0, 10)) {
      console.log(`  Bin ${tz.binId}: ${tz.from} → ${tz.to}`);
    }
    if (analysis.transitionZones.length > 10) {
      console.log(`  ... ${analysis.transitionZones.length - 10} more transitions`);
    }
  }

  console.log(`\n${"─".repeat(70)}`);
  console.log(`  VERDICT`);
  console.log(`${"─".repeat(70)}`);
  console.log(`  ${analysis.verdict}`);
  console.log(`\n${"═".repeat(70)}\n`);
}

// ── Scan All Pools ──────────────────────────────────────────────────────────

async function displayPoolRankings(pools: AppPool[], json: boolean): Promise<void> {
  console.log("\nScanning pool lifecycle maturity...\n");

  const results: {
    pair: string;
    tvlUsd: number;
    maturity: PoolMaturity;
    score: number;
    activeZoneWidth: number;
    peakPct: number;
    activePct: number;
  }[] = [];

  for (const pool of pools.slice(0, 15)) {
    try {
      const activeBinId = pool.activeBinId ?? (await fetchActiveBinId(pool.poolId ?? 1));
      const bins = await scanBins(pool, activeBinId, 20);
      classifyBins(bins, activeBinId);
      const dist = computeStageDistribution(bins);
      const zone = findActiveZone(bins);
      const decay = computeDecayGradient(bins, activeBinId);
      const { maturity, score } = classifyPoolMaturity(dist, decay);

      results.push({
        pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
        tvlUsd: pool.tvlUsd,
        maturity,
        score,
        activeZoneWidth: zone.width,
        peakPct: dist.PEAK.pct,
        activePct: dist.ACTIVE.pct,
      });
    } catch {}

    await sleep(500);
  }

  if (json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  results.sort((a, b) => b.score - a.score);

  console.log(`${"═".repeat(78)}`);
  console.log(`  HODLMM POOL LIFECYCLE RANKINGS`);
  console.log(`${"═".repeat(78)}`);
  console.log(
    `  ${"Pair".padEnd(18)} ${"TVL".padStart(10)} ${"Score".padStart(6)} ${"Maturity".padStart(12)} ${"Zone".padStart(5)} ${"Peak%".padStart(7)} ${"Active%".padStart(8)}`
  );
  console.log(`  ${"─".repeat(70)}`);

  for (const r of results) {
    console.log(
      `  ${r.pair.padEnd(18)} ${fmtUsd(r.tvlUsd).padStart(10)} ${r.score.toFixed(0).padStart(6)} ` +
      `${r.maturity.padStart(12)} ${String(r.activeZoneWidth).padStart(5)} ` +
      `${fmtPct(r.peakPct).padStart(7)} ${fmtPct(r.activePct).padStart(8)}`
    );
  }

  console.log(`\n  ${results.length} pools ranked by lifecycle maturity score (higher = healthier lifecycle)`);
  console.log(`${"═".repeat(78)}\n`);
}

// ── Main ────────────────────────────────────────────────────────────────────

const program = new Command();
program
  .name("hodlmm-bin-lifecycle")
  .description(
    "Bin lifecycle stage analyzer for HODLMM pools. Classifies each bin as " +
    "EMPTY/SEEDING/ACTIVE/PEAK/DECLINING/DORMANT based on reserve levels, " +
    "proximity to active bin, and composition. Produces pool maturity profiles, " +
    "active zone boundaries, decay gradients, and transition zone detection."
  )
  .argument("[pool]", "Pool ID or token pair (e.g. STX-sBTC). Omit to rank all pools.")
  .option("--radius <n>", "Number of bins to scan on each side of active bin", "30")
  .option("--json", "Output in JSON format", false)
  .action(async (poolQuery?: string) => {
    const opts = program.opts();
    const radius = parseInt(opts.radius) || BIN_SCAN_RADIUS;
    const jsonOutput = opts.json;

    try {
      const pools = await fetchPools();
      if (pools.length === 0) {
        console.error("No HODLMM pools found with sufficient TVL.");
        process.exit(1);
      }

      if (!poolQuery) {
        await displayPoolRankings(pools, jsonOutput);
        return;
      }

      const pool = findPool(poolQuery, pools);
      if (!pool) {
        console.error(`Pool "${poolQuery}" not found. Available pools:`);
        for (const p of pools.slice(0, 10)) {
          console.error(`  ${p.token0Symbol}-${p.token1Symbol} (${fmtUsd(p.tvlUsd)})`);
        }
        process.exit(1);
      }

      const pair = `${pool.token0Symbol}-${pool.token1Symbol}`;
      console.log(`\nAnalyzing bin lifecycle for ${pair}...`);

      const activeBinId = pool.activeBinId ?? (await fetchActiveBinId(pool.poolId ?? 1));
      const bins = await scanBins(pool, activeBinId, radius);
      classifyBins(bins, activeBinId);

      const dist = computeStageDistribution(bins);
      const zone = findActiveZone(bins);
      const decay = computeDecayGradient(bins, activeBinId);
      const transitions = findTransitionZones(bins);
      const { maturity, score } = classifyPoolMaturity(dist, decay);

      const analysis: LifecycleAnalysis = {
        pool: pool.id,
        pair,
        tvlUsd: pool.tvlUsd,
        activeBinId,
        binsScanned: bins.length,
        binsWithLiquidity: bins.filter((b) => b.totalUsd > 0.01).length,
        stageDistribution: dist,
        poolMaturity: maturity,
        maturityScore: score,
        activeZone: zone,
        decayGradient: decay,
        transitionZones: transitions,
        bins,
        verdict: "",
      };

      analysis.verdict = generateVerdict(analysis);
      displayAnalysis(analysis, jsonOutput);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
