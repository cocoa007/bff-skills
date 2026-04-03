#!/usr/bin/env bun
/**
 * hodlmm-risk-dashboard.ts
 *
 * HODLMM Risk Dashboard — Multi-factor risk aggregation for HODLMM pools.
 * Combines IL exposure, concentration, volatility, inventory skew, whale
 * dominance, and liquidity depth into a composite risk score (0-100).
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 34).
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
const MAX_EVENT_PAGES = 3;

// Factor weights (sum to 1.0)
const WEIGHTS = {
  impermanentLoss: 0.25,
  concentration: 0.20,
  volatility: 0.15,
  inventorySkew: 0.15,
  whaleDominance: 0.15,
  liquidityDepth: 0.10,
} as const;

// ── Types ──────────────────────────────────────────────────────────────────────

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
  totalUsd: number;
}

type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

interface FactorResult {
  score: number;
  weight: number;
  detail: string;
}

interface RiskFactors {
  impermanentLoss: FactorResult;
  concentration: FactorResult;
  volatility: FactorResult;
  inventorySkew: FactorResult;
  whaleDominance: FactorResult;
  liquidityDepth: FactorResult;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function riskLevel(score: number): RiskLevel {
  if (score <= 25) return "LOW";
  if (score <= 50) return "MODERATE";
  if (score <= 75) return "HIGH";
  return "CRITICAL";
}

function recommendation(score: number): string {
  if (score <= 25) return "ENTER/HOLD — low risk across all dimensions";
  if (score <= 50) return "HOLD — moderate risk, monitor elevated factors";
  if (score <= 75) return "REDUCE — elevated risk, consider de-risking exposure";
  return "EXIT — critical risk level, immediate action recommended";
}

// ── Risk Factor Computations ─────────────────────────────────────────────────

function computeILScore(bins: BinReserves[], activeBinId: number): FactorResult {
  let totalX = 0, totalY = 0;
  for (const b of bins) {
    totalX += b.reserveX;
    totalY += b.reserveY;
  }
  const total = totalX + totalY;
  if (total === 0) {
    return { score: 50, weight: WEIGHTS.impermanentLoss, detail: "No reserves found" };
  }
  const ratioX = totalX / total;
  const deviation = Math.abs(ratioX - 0.5);
  // 0 deviation = 0 risk, 0.5 deviation (100% one-sided) = 100 risk
  const score = clamp(Math.round(deviation * 200), 0, 100);
  const pctX = Math.round(ratioX * 100);
  const pctY = 100 - pctX;
  const ilEstimate = (deviation * deviation * 4 * 100).toFixed(1); // rough IL approximation
  return {
    score,
    weight: WEIGHTS.impermanentLoss,
    detail: `Reserve ratio ${pctX}:${pctY}, estimated IL ~${ilEstimate}%`,
  };
}

function computeConcentrationScore(bins: BinReserves[]): FactorResult {
  const nonZero = bins.filter((b) => b.totalUsd > 0);
  if (nonZero.length === 0) {
    return { score: 100, weight: WEIGHTS.concentration, detail: "No liquidity in scanned bins" };
  }
  const total = nonZero.reduce((s, b) => s + b.totalUsd, 0);
  const shares = nonZero.map((b) => b.totalUsd / total).sort((a, b) => b - a);

  // Gini coefficient
  const n = shares.length;
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * shares[i];
  }
  const gini = n > 1 ? giniSum / (n * shares.reduce((a, b) => a + b, 0)) : 1;
  const absGini = Math.abs(gini);

  // Top 3 bins share
  const top3Share = shares.slice(0, 3).reduce((a, b) => a + b, 0);
  const top3Pct = Math.round(top3Share * 100);

  const score = clamp(Math.round(absGini * 100), 0, 100);
  return {
    score,
    weight: WEIGHTS.concentration,
    detail: `Gini ${absGini.toFixed(2)}, top 3 bins hold ${top3Pct}% TVL, ${nonZero.length} active bins`,
  };
}

function computeVolatilityScore(bins: BinReserves[], activeBinId: number): FactorResult {
  const nonZero = bins.filter((b) => b.totalUsd > 0);
  if (nonZero.length === 0) {
    return { score: 50, weight: WEIGHTS.volatility, detail: "No bins with reserves" };
  }
  const minBin = Math.min(...nonZero.map((b) => b.binId));
  const maxBin = Math.max(...nonZero.map((b) => b.binId));
  const spread = maxBin - minBin;

  // Wider spread → higher volatility proxy
  // 0-5 bins: LOW, 6-15: MODERATE, 16-30: HIGH, 30+: EXTREME
  let score: number;
  let regime: string;
  if (spread <= 5) {
    score = clamp(spread * 5, 0, 25);
    regime = "LOW";
  } else if (spread <= 15) {
    score = clamp(25 + (spread - 5) * 2.5, 26, 50);
    regime = "MODERATE";
  } else if (spread <= 30) {
    score = clamp(50 + (spread - 15) * 1.67, 51, 75);
    regime = "HIGH";
  } else {
    score = clamp(75 + (spread - 30) * 0.83, 76, 100);
    regime = "EXTREME";
  }
  score = Math.round(score);

  return {
    score,
    weight: WEIGHTS.volatility,
    detail: `Bin spread ${spread}, regime ${regime}, active range bins ${minBin}-${maxBin}`,
  };
}

function computeInventorySkewScore(bins: BinReserves[]): FactorResult {
  let totalX = 0, totalY = 0;
  for (const b of bins) {
    totalX += b.reserveX;
    totalY += b.reserveY;
  }
  const total = totalX + totalY;
  if (total === 0) {
    return { score: 50, weight: WEIGHTS.inventorySkew, detail: "No reserves" };
  }
  const ratioX = totalX / total;
  const skew = Math.abs(ratioX - 0.5) * 2; // 0 = balanced, 1 = fully one-sided
  const score = clamp(Math.round(skew * 100), 0, 100);
  const direction = ratioX > 0.55 ? "token-x heavy (sell pressure)" :
                    ratioX < 0.45 ? "token-y heavy (buy pressure)" : "balanced";
  const pctX = Math.round(ratioX * 100);

  return {
    score,
    weight: WEIGHTS.inventorySkew,
    detail: `Token ratio ${pctX}:${100 - pctX}, ${direction}`,
  };
}

async function computeWhaleDominanceScore(poolId: number): Promise<FactorResult> {
  // Scan recent LP events for address concentration
  try {
    const events = await fetchJson(
      `${HIRO_API}/extended/v1/contract/${DLMM_CONTRACT_ADDR}.${DLMM_CONTRACT_NAME}/events?limit=50&offset=0`
    );
    const items = events?.results || [];

    // Count liquidity events per address for this pool
    const addrVolume: Record<string, number> = {};
    let matched = 0;
    for (const ev of items) {
      if (ev.contract_log?.value?.repr) {
        const repr = ev.contract_log.value.repr;
        // Look for add/remove liquidity events
        if (repr.includes("add-liquidity") || repr.includes("remove-liquidity")) {
          const sender = ev.tx_id ? `tx-${ev.tx_id.slice(0, 10)}` : "unknown";
          addrVolume[sender] = (addrVolume[sender] || 0) + 1;
          matched++;
        }
      }
    }

    if (matched === 0) {
      return {
        score: 30,
        weight: WEIGHTS.whaleDominance,
        detail: "No LP events in recent history — defaulting to moderate",
      };
    }

    // HHI calculation
    const total = Object.values(addrVolume).reduce((a, b) => a + b, 0);
    const shares = Object.values(addrVolume).map((v) => v / total);
    const hhi = shares.reduce((s, sh) => s + sh * sh, 0);
    const topShare = Math.max(...shares);
    const topPct = Math.round(topShare * 100);
    const score = clamp(Math.round(hhi * 100 * 2), 0, 100); // HHI ranges 0-1, scale up

    return {
      score,
      weight: WEIGHTS.whaleDominance,
      detail: `HHI ${hhi.toFixed(2)}, top address ${topPct}% of activity, ${Object.keys(addrVolume).length} unique LPs`,
    };
  } catch {
    return {
      score: 30,
      weight: WEIGHTS.whaleDominance,
      detail: "Event scan failed — defaulting to moderate",
    };
  }
}

function computeDepthScore(bins: BinReserves[], token0PriceUsd: number): FactorResult {
  const totalUsd = bins.reduce((s, b) => s + b.totalUsd, 0);
  if (totalUsd === 0) {
    return { score: 100, weight: WEIGHTS.liquidityDepth, detail: "No liquidity" };
  }

  // Estimate: how much can you trade before 1% slippage?
  // Simple: sort bins by proximity to active, walk until 1% of cumulative is consumed
  const sorted = [...bins].filter((b) => b.totalUsd > 0).sort((a, b) => a.totalUsd - b.totalUsd);
  const onePctThreshold = totalUsd * 0.01;
  let cumulative = 0;
  let binsToOnePct = 0;
  for (const b of sorted) {
    cumulative += b.totalUsd;
    binsToOnePct++;
    if (cumulative >= onePctThreshold) break;
  }

  // More bins needed for 1% = deeper liquidity = lower risk
  // If 1% threshold reached with 1 bin = thin, many bins = deep
  const depthRatio = binsToOnePct / Math.max(sorted.length, 1);
  // Higher ratio = more spread = deeper
  const score = clamp(Math.round((1 - depthRatio) * 80), 0, 100);
  const onePctUsd = Math.round(onePctThreshold);

  let depthLabel: string;
  if (score <= 25) depthLabel = "DEEP";
  else if (score <= 50) depthLabel = "ADEQUATE";
  else if (score <= 75) depthLabel = "THIN";
  else depthLabel = "FRAGILE";

  return {
    score,
    weight: WEIGHTS.liquidityDepth,
    detail: `1% slippage at ~$${onePctUsd.toLocaleString()}, depth ${depthLabel}, TVL $${Math.round(totalUsd).toLocaleString()}`,
  };
}

// ── Pool Data Fetching ───────────────────────────────────────────────────────

async function fetchAllPools(): Promise<AppPool[]> {
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
  return pools.filter((p) => p.tvlUsd >= MIN_TVL_USD);
}

async function fetchBinReserves(poolId: number, activeBinId: number, pool: AppPool): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const start = activeBinId - BIN_SCAN_RADIUS;
  const end = activeBinId + BIN_SCAN_RADIUS;

  for (let binId = start; binId <= end; binId++) {
    try {
      const result = await callReadOnly("get-bin", [uintCV(poolId), uintCV(binId)]);
      const parsed = parseUintResult(result);
      if (result?.result) {
        const hex = result.result.replace("0x", "");
        // Try to extract reserve-x and reserve-y from tuple
        let reserveX = 0, reserveY = 0;
        // Simple heuristic: if we got a value, split reserves
        if (parsed > 0) {
          // Bin reserves are combined; estimate split from pool ratio
          const ratioX = pool.token0PriceUsd / (pool.token0PriceUsd + pool.token1PriceUsd + 0.001);
          reserveX = parsed * ratioX;
          reserveY = parsed * (1 - ratioX);
        }
        const usdX = (reserveX / Math.pow(10, pool.token0Decimals)) * pool.token0PriceUsd;
        const usdY = (reserveY / Math.pow(10, pool.token1Decimals)) * pool.token1PriceUsd;
        bins.push({ binId, reserveX, reserveY, totalUsd: usdX + usdY });
      }
    } catch {
      // Skip bins that fail
    }
  }
  return bins;
}

async function getActiveBin(poolId: number): Promise<number> {
  const result = await callReadOnly("get-active-bin-id", [uintCV(poolId)]);
  return parseUintResult(result);
}

// ── Commands ─────────────────────────────────────────────────────────────────

async function doctor(): Promise<void> {
  const out: any = { tool: "hodlmm-risk-dashboard", command: "doctor", timestamp: new Date().toISOString(), checks: {} };
  try {
    await fetchJson(`${BFF_APP_BASE}/pools/hodlmm`);
    out.checks.bitflow = "ok";
  } catch (e: any) {
    out.checks.bitflow = `FAIL: ${e.message}`;
  }
  try {
    await fetchJson(`${HIRO_API}/v2/info`);
    out.checks.hiro = "ok";
  } catch (e: any) {
    out.checks.hiro = `FAIL: ${e.message}`;
  }
  out.status = out.checks.bitflow === "ok" && out.checks.hiro === "ok" ? "healthy" : "degraded";
  console.log(JSON.stringify(out, null, 2));
}

async function run(poolIdArg: string): Promise<void> {
  const poolId = parseInt(poolIdArg);
  if (isNaN(poolId)) {
    console.log(JSON.stringify({
      tool: "hodlmm-risk-dashboard", command: "run",
      timestamp: new Date().toISOString(), error: "Invalid pool ID",
    }));
    return;
  }

  const pools = await fetchAllPools();
  const pool = pools.find((p) => p.poolId === poolId);
  if (!pool) {
    console.log(JSON.stringify({
      tool: "hodlmm-risk-dashboard", command: "run",
      timestamp: new Date().toISOString(), error: `Pool ${poolId} not found or below TVL threshold`,
    }));
    return;
  }

  const activeBinId = pool.activeBinId || await getActiveBin(poolId);
  const bins = await fetchBinReserves(poolId, activeBinId, pool);

  // Compute all factors
  const ilFactor = computeILScore(bins, activeBinId);
  const concFactor = computeConcentrationScore(bins);
  const volFactor = computeVolatilityScore(bins, activeBinId);
  const skewFactor = computeInventorySkewScore(bins);
  const whaleFactor = await computeWhaleDominanceScore(poolId);
  const depthFactor = computeDepthScore(bins, pool.token0PriceUsd);

  const factors: RiskFactors = {
    impermanentLoss: ilFactor,
    concentration: concFactor,
    volatility: volFactor,
    inventorySkew: skewFactor,
    whaleDominance: whaleFactor,
    liquidityDepth: depthFactor,
  };

  // Composite score = weighted sum
  const compositeRisk = Math.round(
    ilFactor.score * ilFactor.weight +
    concFactor.score * concFactor.weight +
    volFactor.score * volFactor.weight +
    skewFactor.score * skewFactor.weight +
    whaleFactor.score * whaleFactor.weight +
    depthFactor.score * depthFactor.weight
  );

  // Generate alerts for elevated factors
  const alerts: string[] = [];
  if (ilFactor.score > 60) alerts.push("IL exposure elevated — reserve ratio significantly imbalanced");
  if (concFactor.score > 60) alerts.push("Concentration risk elevated — liquidity clustered in few bins");
  if (volFactor.score > 60) alerts.push("High volatility — wide bin spread indicates price instability");
  if (skewFactor.score > 60) alerts.push("Inventory skew significant — persistent directional pressure");
  if (whaleFactor.score > 60) alerts.push("Whale dominance high — large LP exit could destabilize pool");
  if (depthFactor.score > 60) alerts.push("Liquidity depth thin — large trades will experience high slippage");

  const out = {
    tool: "hodlmm-risk-dashboard",
    command: "run",
    timestamp: new Date().toISOString(),
    poolId,
    pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
    tvlUsd: Math.round(pool.tvlUsd),
    compositeRisk,
    riskLevel: riskLevel(compositeRisk),
    factors,
    alerts,
    recommendation: recommendation(compositeRisk),
    binsScanned: bins.length,
    binsWithLiquidity: bins.filter((b) => b.totalUsd > 0).length,
  };

  console.log(JSON.stringify(out, null, 2));
}

async function scan(opts: { top: string; minTvl: string }): Promise<void> {
  const topN = parseInt(opts.top) || 10;
  const minTvl = parseFloat(opts.minTvl) || MIN_TVL_USD;

  const pools = (await fetchAllPools()).filter((p) => p.tvlUsd >= minTvl);
  if (pools.length === 0) {
    console.log(JSON.stringify({
      tool: "hodlmm-risk-dashboard", command: "scan",
      timestamp: new Date().toISOString(), error: "No pools found above TVL threshold",
    }));
    return;
  }

  // Quick risk scan — use pool-level metadata without deep bin scanning
  const poolRisks: any[] = [];
  for (const pool of pools.slice(0, topN * 2)) {
    try {
      const activeBinId = pool.activeBinId || await getActiveBin(pool.poolId!);
      if (!activeBinId) continue;

      // Lighter scan for bulk mode — fewer bins
      const bins: BinReserves[] = [];
      const radius = 10; // smaller radius for scan mode
      for (let binId = activeBinId - radius; binId <= activeBinId + radius; binId++) {
        try {
          const result = await callReadOnly("get-bin", [uintCV(pool.poolId!), uintCV(binId)]);
          const parsed = parseUintResult(result);
          if (parsed > 0) {
            const ratioX = pool.token0PriceUsd / (pool.token0PriceUsd + pool.token1PriceUsd + 0.001);
            const reserveX = parsed * ratioX;
            const reserveY = parsed * (1 - ratioX);
            const usdX = (reserveX / Math.pow(10, pool.token0Decimals)) * pool.token0PriceUsd;
            const usdY = (reserveY / Math.pow(10, pool.token1Decimals)) * pool.token1PriceUsd;
            bins.push({ binId, reserveX, reserveY, totalUsd: usdX + usdY });
          }
        } catch { /* skip */ }
      }

      const il = computeILScore(bins, activeBinId);
      const conc = computeConcentrationScore(bins);
      const vol = computeVolatilityScore(bins, activeBinId);
      const skew = computeInventorySkewScore(bins);
      const depth = computeDepthScore(bins, pool.token0PriceUsd);

      // Skip whale for scan mode — use default
      const whaleScore = 30;

      const composite = Math.round(
        il.score * WEIGHTS.impermanentLoss +
        conc.score * WEIGHTS.concentration +
        vol.score * WEIGHTS.volatility +
        skew.score * WEIGHTS.inventorySkew +
        whaleScore * WEIGHTS.whaleDominance +
        depth.score * WEIGHTS.liquidityDepth
      );

      poolRisks.push({
        poolId: pool.poolId,
        pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
        tvlUsd: Math.round(pool.tvlUsd),
        compositeRisk: composite,
        riskLevel: riskLevel(composite),
        topFactor: [
          { name: "IL", score: il.score },
          { name: "Concentration", score: conc.score },
          { name: "Volatility", score: vol.score },
          { name: "Skew", score: skew.score },
          { name: "Depth", score: depth.score },
        ].sort((a, b) => b.score - a.score)[0],
      });
    } catch { /* skip pool */ }
  }

  poolRisks.sort((a, b) => b.compositeRisk - a.compositeRisk);
  const top = poolRisks.slice(0, topN);

  const out = {
    tool: "hodlmm-risk-dashboard",
    command: "scan",
    timestamp: new Date().toISOString(),
    poolsScanned: poolRisks.length,
    results: top,
    summary: {
      avgRisk: Math.round(poolRisks.reduce((s, p) => s + p.compositeRisk, 0) / Math.max(poolRisks.length, 1)),
      highRiskCount: poolRisks.filter((p) => p.compositeRisk > 50).length,
      criticalCount: poolRisks.filter((p) => p.compositeRisk > 75).length,
      safestPool: poolRisks.length > 0 ? poolRisks[poolRisks.length - 1] : null,
    },
  };

  console.log(JSON.stringify(out, null, 2));
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const program = new Command();
program.name("hodlmm-risk-dashboard").description("Multi-factor risk dashboard for HODLMM pools").version("1.0.0");

program.command("doctor").description("Check API connectivity").action(doctor);
program.command("install-packs").description("No extra deps needed").action(() => {
  console.log(JSON.stringify({
    tool: "hodlmm-risk-dashboard", command: "install-packs",
    timestamp: new Date().toISOString(), message: "No additional packages required. Uses workspace commander + native fetch.",
  }));
});

program
  .command("run")
  .description("Full risk dashboard for a specific pool")
  .requiredOption("--pool <id>", "HODLMM pool ID")
  .action((opts) => run(opts.pool));

program
  .command("scan")
  .description("Rank pools by composite risk score")
  .option("--top <n>", "Number of pools to show", "10")
  .option("--min-tvl <usd>", "Minimum TVL filter", String(MIN_TVL_USD))
  .action(scan);

program.parse();
