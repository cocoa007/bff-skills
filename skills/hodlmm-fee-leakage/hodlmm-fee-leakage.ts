#!/usr/bin/env bun
/**
 * hodlmm-fee-leakage.ts
 *
 * HODLMM Fee Leakage Pathology Analyzer — Diagnoses the root causes of fee
 * loss in concentrated liquidity positions. Goes beyond simple capture rates
 * to classify leakage into distinct pathologies: range drift, concentration
 * gaps, asymmetric depletion, dead capital zones, and fee-zone sparsity.
 *
 * Key metrics:
 *  - Total fee leakage rate and USD estimate
 *  - Leakage pathology breakdown (drift, gap, asymmetry, dead capital, sparsity)
 *  - Severity scoring per pathology (0-100)
 *  - Composite leakage health score
 *  - Pathology-specific remediation recommendations
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 50).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const BIN_SCAN_RADIUS = 20;
const FEE_EARNING_RADIUS = 1;
const FALLBACK_STX_PRICE_USD = 0.80;

type HealthGrade = "HEALTHY" | "MINOR" | "MODERATE" | "SEVERE" | "CRITICAL";

const GRADE_THRESHOLDS = {
  HEALTHY: 85,
  MINOR: 70,
  MODERATE: 50,
  SEVERE: 25,
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

interface Pathology {
  name: string;
  severity: number;       // 0-100
  leakagePct: number;     // % of total leakage attributable
  leakageUsd: number;     // daily USD
  description: string;
  remediation: string;
}

interface LeakageAnalysis {
  poolId: number;
  pair: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBinId: number;
  totalLeakageRate: number;       // 0-100%
  totalLeakageDailyUsd: number;
  totalLeakageAnnualUsd: number;
  healthScore: number;            // 0-100
  healthGrade: HealthGrade;
  pathologies: Pathology[];
  binSnapshot: BinSnapshot[];
  topRemediation: string;
}

interface BinSnapshot {
  binId: number;
  usd: number;
  pctOfTotal: number;
  distFromActive: number;
  zone: "fee-earning" | "near" | "far" | "dead";
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

function formatUsd(n: number): string {
  if (n < 0) return `-${formatUsd(-n)}`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(6)}`;
}

function formatPct(n: number): string {
  if (Math.abs(n) >= 100) return `${Math.round(n)}%`;
  if (Math.abs(n) >= 1) return `${n.toFixed(2)}%`;
  return `${n.toFixed(4)}%`;
}

function getGrade(score: number): HealthGrade {
  if (score >= GRADE_THRESHOLDS.HEALTHY) return "HEALTHY";
  if (score >= GRADE_THRESHOLDS.MINOR) return "MINOR";
  if (score >= GRADE_THRESHOLDS.MODERATE) return "MODERATE";
  if (score >= GRADE_THRESHOLDS.SEVERE) return "SEVERE";
  return "CRITICAL";
}

function gradeColor(grade: HealthGrade): string {
  switch (grade) {
    case "HEALTHY": return "\x1b[32m";
    case "MINOR": return "\x1b[36m";
    case "MODERATE": return "\x1b[33m";
    case "SEVERE": return "\x1b[31m";
    case "CRITICAL": return "\x1b[35m";
  }
}

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

// ── Pool Data ──────────────────────────────────────────────────────────────────

let _poolCache: AppPool[] | null = null;

async function fetchAllPools(): Promise<AppPool[]> {
  if (_poolCache) return _poolCache;
  const data = await fetchJson(`${BFF_APP_BASE}/pools`);
  const raw: any[] = data?.data || data?.pools || data || [];
  const pools: AppPool[] = raw
    .filter((p: any) => (p.types || []).includes("DLMM"))
    .map((p: any) => {
      const idStr = String(p.poolId ?? p.id ?? "0");
      const numericId = parseInt(idStr.replace(/\D/g, "")) || 0;
      const baseFee = parseFloat(p.baseFee ?? "0.003");
      return {
        id: idStr,
        token0Symbol: p.tokens?.tokenX?.symbol ?? p.token0Symbol ?? "?",
        token1Symbol: p.tokens?.tokenY?.symbol ?? p.token1Symbol ?? "?",
        tvlUsd: parseFloat(p.tvlUsd ?? p.tvl ?? "0"),
        volume24hUsd: parseFloat(p.volumeUsd1d ?? p.volume24hUsd ?? "0"),
        poolId: numericId,
        token0Decimals: parseInt(p.tokens?.tokenX?.decimals ?? p.token0Decimals ?? "6"),
        token1Decimals: parseInt(p.tokens?.tokenY?.decimals ?? p.token1Decimals ?? "6"),
        token0PriceUsd: parseFloat(p.tokens?.tokenX?.priceUsd ?? p.token0PriceUsd ?? "0"),
        token1PriceUsd: parseFloat(p.tokens?.tokenY?.priceUsd ?? p.token1PriceUsd ?? "0"),
        activeBinId: parseInt(p.activeBinId ?? "0") || undefined,
        feeBps: Math.round(baseFee * 10_000),
      };
    });
  _poolCache = pools.filter((p) => p.tvlUsd >= MIN_TVL_USD);
  return _poolCache;
}

async function getActiveBin(poolId: number): Promise<number> {
  const result = await callReadOnly("get-active-bin-id", [uintCV(poolId)]);
  return parseUintResult(result);
}

async function fetchBinReserves(poolId: number, activeBinId: number, pool: AppPool): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const start = activeBinId - BIN_SCAN_RADIUS;
  const end = activeBinId + BIN_SCAN_RADIUS;

  for (let binId = start; binId <= end; binId++) {
    try {
      const result = await callReadOnly("get-bin", [uintCV(poolId), uintCV(binId)]);
      const parsed = parseUintResult(result);
      if (parsed > 0) {
        const ratioX = pool.token0PriceUsd / (pool.token0PriceUsd + pool.token1PriceUsd + 0.001);
        const reserveX = parsed * ratioX;
        const reserveY = parsed * (1 - ratioX);
        const usdX = (reserveX / Math.pow(10, pool.token0Decimals)) * pool.token0PriceUsd;
        const usdY = (reserveY / Math.pow(10, pool.token1Decimals)) * pool.token1PriceUsd;
        bins.push({ binId, reserveX, reserveY, totalUsd: usdX + usdY });
      }
    } catch {
      // Skip bins that error
    }
  }
  return bins;
}

// ── Pathology Detection Engine ───────────────────────────────────────────────

function classifyBinZone(dist: number): "fee-earning" | "near" | "far" | "dead" {
  if (dist <= FEE_EARNING_RADIUS) return "fee-earning";
  if (dist <= 5) return "near";
  if (dist <= 12) return "far";
  return "dead";
}

function detectPathologies(
  bins: BinReserves[],
  activeBinId: number,
  pool: AppPool
): { pathologies: Pathology[]; totalLeakageRate: number; totalLeakageDailyUsd: number } {
  const totalLiq = bins.reduce((s, b) => s + b.totalUsd, 0);
  const feeRate = (pool.feeBps || 30) / 10_000;
  const dailyFees = pool.volume24hUsd * feeRate;

  let feeZoneLiq = 0;
  let nearZoneLiq = 0;
  let farZoneLiq = 0;
  let deadZoneLiq = 0;

  for (const bin of bins) {
    const dist = Math.abs(bin.binId - activeBinId);
    const zone = classifyBinZone(dist);
    switch (zone) {
      case "fee-earning": feeZoneLiq += bin.totalUsd; break;
      case "near": nearZoneLiq += bin.totalUsd; break;
      case "far": farZoneLiq += bin.totalUsd; break;
      case "dead": deadZoneLiq += bin.totalUsd; break;
    }
  }

  const captureRate = totalLiq > 0 ? feeZoneLiq / totalLiq : 0;
  const totalLeakageRate = (1 - captureRate) * 100;
  const totalLeakageDailyUsd = dailyFees * (1 - captureRate);

  const pathologies: Pathology[] = [];

  // 1. Range Drift — liquidity center of mass has drifted from active bin
  const weightedCenter = totalLiq > 0
    ? bins.reduce((s, b) => s + b.binId * b.totalUsd, 0) / totalLiq
    : activeBinId;
  const drift = Math.abs(weightedCenter - activeBinId);
  const driftSeverity = Math.min(100, drift * 12);
  const driftLeakagePct = totalLeakageRate > 0 && drift > 1
    ? Math.min(40, (drift / BIN_SCAN_RADIUS) * 60)
    : 0;
  if (driftSeverity > 10) {
    pathologies.push({
      name: "Range Drift",
      severity: Math.round(driftSeverity),
      leakagePct: Math.round(driftLeakagePct),
      leakageUsd: totalLeakageDailyUsd * (driftLeakagePct / 100),
      description: `Liquidity center of mass is ${drift.toFixed(1)} bins from active bin. Price has moved away from where most capital sits.`,
      remediation: `Rebalance position to center liquidity around bin #${activeBinId}. Consider a tighter ±${Math.max(2, Math.ceil(drift))} bin range.`,
    });
  }

  // 2. Concentration Gap — fee zone has disproportionately low liquidity
  const feeZoneBins = bins.filter(b => Math.abs(b.binId - activeBinId) <= FEE_EARNING_RADIUS && b.totalUsd > 0);
  const expectedFeeZonePct = totalLiq > 0 ? ((2 * FEE_EARNING_RADIUS + 1) / bins.length) * 100 : 0;
  const actualFeeZonePct = totalLiq > 0 ? (feeZoneLiq / totalLiq) * 100 : 0;
  const gapRatio = expectedFeeZonePct > 0 ? actualFeeZonePct / expectedFeeZonePct : 1;
  const gapSeverity = gapRatio < 1 ? Math.min(100, (1 - gapRatio) * 120) : 0;
  const gapLeakagePct = gapSeverity > 10 ? Math.min(30, gapSeverity * 0.35) : 0;
  if (gapSeverity > 10) {
    pathologies.push({
      name: "Concentration Gap",
      severity: Math.round(gapSeverity),
      leakagePct: Math.round(gapLeakagePct),
      leakageUsd: totalLeakageDailyUsd * (gapLeakagePct / 100),
      description: `Fee zone holds ${formatPct(actualFeeZonePct)} of liquidity vs ${formatPct(expectedFeeZonePct)} expected. Active bins are under-capitalized.`,
      remediation: `Add liquidity specifically to bins ${activeBinId - FEE_EARNING_RADIUS} through ${activeBinId + FEE_EARNING_RADIUS} to boost fee capture.`,
    });
  }

  // 3. Asymmetric Depletion — one side heavily depleted vs the other
  const leftBins = bins.filter(b => b.binId < activeBinId);
  const rightBins = bins.filter(b => b.binId > activeBinId);
  const leftLiq = leftBins.reduce((s, b) => s + b.totalUsd, 0);
  const rightLiq = rightBins.reduce((s, b) => s + b.totalUsd, 0);
  const totalSides = leftLiq + rightLiq;
  const asymmetry = totalSides > 0 ? Math.abs(leftLiq - rightLiq) / totalSides : 0;
  const asymSeverity = Math.min(100, asymmetry * 130);
  const asymLeakagePct = asymSeverity > 15 ? Math.min(25, asymmetry * 35) : 0;
  const heavySide = leftLiq > rightLiq ? "left (lower bins)" : "right (upper bins)";
  const lightSide = leftLiq > rightLiq ? "right (upper bins)" : "left (lower bins)";
  if (asymSeverity > 15) {
    pathologies.push({
      name: "Asymmetric Depletion",
      severity: Math.round(asymSeverity),
      leakagePct: Math.round(asymLeakagePct),
      leakageUsd: totalLeakageDailyUsd * (asymLeakagePct / 100),
      description: `${formatPct(asymmetry * 100)} imbalance — ${heavySide} holds most liquidity. The ${lightSide} may be depleted by directional trades.`,
      remediation: `Add liquidity to the ${lightSide} to restore balance and capture fees from both buy and sell pressure.`,
    });
  }

  // 4. Dead Capital — liquidity stranded far from active bin (>12 bins away)
  const deadCapitalPct = totalLiq > 0 ? (deadZoneLiq / totalLiq) * 100 : 0;
  const deadSeverity = Math.min(100, deadCapitalPct * 1.5);
  const deadLeakagePct = deadCapitalPct > 5 ? Math.min(35, deadCapitalPct * 0.8) : 0;
  if (deadSeverity > 8) {
    pathologies.push({
      name: "Dead Capital",
      severity: Math.round(deadSeverity),
      leakagePct: Math.round(deadLeakagePct),
      leakageUsd: totalLeakageDailyUsd * (deadLeakagePct / 100),
      description: `${formatUsd(deadZoneLiq)} (${formatPct(deadCapitalPct)}) sits >12 bins from active — essentially earning nothing with minimal chance of becoming active.`,
      remediation: `Remove liquidity from dead-zone bins and redeploy within ±5 bins of active bin #${activeBinId} for immediate fee capture potential.`,
    });
  }

  // 5. Fee-Zone Sparsity — active bin area has too few bins with liquidity
  const possibleFeeZoneBins = 2 * FEE_EARNING_RADIUS + 1;
  const fillRate = feeZoneBins.length / possibleFeeZoneBins;
  const sparsitySeverity = fillRate < 1 ? Math.min(100, (1 - fillRate) * 120) : 0;
  const sparsityLeakagePct = sparsitySeverity > 15 ? Math.min(20, sparsitySeverity * 0.25) : 0;
  if (sparsitySeverity > 15) {
    pathologies.push({
      name: "Fee-Zone Sparsity",
      severity: Math.round(sparsitySeverity),
      leakagePct: Math.round(sparsityLeakagePct),
      leakageUsd: totalLeakageDailyUsd * (sparsityLeakagePct / 100),
      description: `Only ${feeZoneBins.length} of ${possibleFeeZoneBins} fee-zone bins have liquidity. Gaps mean some trades have no local liquidity to earn from.`,
      remediation: `Fill empty fee-zone bins (${activeBinId - FEE_EARNING_RADIUS} to ${activeBinId + FEE_EARNING_RADIUS}) to capture all swap traffic through the active range.`,
    });
  }

  // Sort by severity descending
  pathologies.sort((a, b) => b.severity - a.severity);

  return { pathologies, totalLeakageRate, totalLeakageDailyUsd };
}

// ── Analysis ─────────────────────────────────────────────────────────────────

async function analyzePool(pool: AppPool): Promise<LeakageAnalysis> {
  const poolId = pool.poolId!;
  const activeBinId = pool.activeBinId || await getActiveBin(poolId);
  const bins = await fetchBinReserves(poolId, activeBinId, pool);

  const { pathologies, totalLeakageRate, totalLeakageDailyUsd } = detectPathologies(bins, activeBinId, pool);

  const healthScore = Math.max(0, Math.min(100, 100 - totalLeakageRate));
  const healthGrade = getGrade(healthScore);

  const totalLiq = bins.reduce((s, b) => s + b.totalUsd, 0);
  const binSnapshot: BinSnapshot[] = bins
    .filter(b => b.totalUsd > 0)
    .sort((a, b) => a.binId - b.binId)
    .map(b => {
      const dist = Math.abs(b.binId - activeBinId);
      return {
        binId: b.binId,
        usd: Math.round(b.totalUsd * 100) / 100,
        pctOfTotal: totalLiq > 0 ? Math.round((b.totalUsd / totalLiq) * 10000) / 100 : 0,
        distFromActive: b.binId - activeBinId,
        zone: classifyBinZone(dist),
      };
    });

  const topRemediation = pathologies.length > 0
    ? pathologies[0].remediation
    : "No significant fee leakage detected. Position is well-optimized.";

  return {
    poolId,
    pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
    tvlUsd: pool.tvlUsd,
    volume24hUsd: pool.volume24hUsd,
    feeBps: pool.feeBps || 30,
    activeBinId,
    totalLeakageRate: Math.round(totalLeakageRate * 100) / 100,
    totalLeakageDailyUsd: Math.round(totalLeakageDailyUsd * 100) / 100,
    totalLeakageAnnualUsd: Math.round(totalLeakageDailyUsd * 365 * 100) / 100,
    healthScore: Math.round(healthScore * 100) / 100,
    healthGrade,
    pathologies,
    binSnapshot,
    topRemediation,
  };
}

// ── Output Formatting ─────────────────────────────────────────────────────────

function printLeakageReport(a: LeakageAnalysis): void {
  const gc = gradeColor(a.healthGrade);

  console.log("");
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}  HODLMM Fee Leakage Pathology — Pool #${a.poolId} (${a.pair})${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log("");

  // Health overview
  console.log(`${BOLD}  Leakage Health Score:  ${gc}${a.healthScore}/100 [${a.healthGrade}]${RESET}`);
  console.log(`  Total Leakage Rate:    ${a.totalLeakageRate > 30 ? "\x1b[31m" : a.totalLeakageRate > 15 ? "\x1b[33m" : "\x1b[32m"}${formatPct(a.totalLeakageRate)}${RESET}`);
  console.log(`  Daily Fee Leakage:     ${a.totalLeakageDailyUsd > 10 ? "\x1b[31m" : "\x1b[33m"}${formatUsd(a.totalLeakageDailyUsd)}/day${RESET}`);
  console.log(`  Annual Fee Leakage:    ${formatUsd(a.totalLeakageAnnualUsd)}/year`);
  console.log("");

  // Pool context
  console.log(`${BOLD}  ── Pool Context ──────────────────────────────────────────${RESET}`);
  console.log(`  TVL:                   ${formatUsd(a.tvlUsd)}`);
  console.log(`  24h Volume:            ${formatUsd(a.volume24hUsd)}`);
  console.log(`  Fee Rate:              ${a.feeBps} bps`);
  console.log(`  Active Bin:            #${a.activeBinId}`);
  console.log("");

  // Pathology breakdown
  if (a.pathologies.length > 0) {
    console.log(`${BOLD}  ── Pathology Breakdown ───────────────────────────────────${RESET}`);
    console.log(`  ${DIM}${"Pathology".padEnd(24)}${"Severity".padEnd(12)}${"Leakage%".padEnd(12)}${"USD/day".padEnd(14)}${RESET}`);
    console.log(`  ${DIM}${"─".repeat(60)}${RESET}`);

    for (const p of a.pathologies) {
      const sevColor = p.severity >= 70 ? "\x1b[31m" : p.severity >= 40 ? "\x1b[33m" : "\x1b[36m";
      const sevBar = "█".repeat(Math.min(10, Math.round(p.severity / 10)));
      console.log(
        `  ${p.name.padEnd(24)}${sevColor}${String(p.severity).padEnd(4)}${RESET}${DIM}${sevBar.padEnd(12)}${RESET}${formatPct(p.leakagePct).padEnd(12)}${formatUsd(p.leakageUsd)}`
      );
    }
    console.log("");

    // Detailed pathology cards
    console.log(`${BOLD}  ── Pathology Details ─────────────────────────────────────${RESET}`);
    for (const p of a.pathologies) {
      const sevColor = p.severity >= 70 ? "\x1b[31m" : p.severity >= 40 ? "\x1b[33m" : "\x1b[36m";
      console.log(`  ${sevColor}■${RESET} ${BOLD}${p.name}${RESET} (severity: ${sevColor}${p.severity}/100${RESET})`);
      console.log(`    ${p.description}`);
      console.log(`    ${DIM}Fix:${RESET} ${p.remediation}`);
      console.log("");
    }
  } else {
    console.log(`  ${BOLD}\x1b[32m✓ No pathologies detected — fee capture is healthy${RESET}`);
    console.log("");
  }

  // Bin snapshot with zone coloring
  if (a.binSnapshot.length > 0) {
    console.log(`${BOLD}  ── Bin Snapshot (Zone Map) ───────────────────────────────${RESET}`);
    console.log(`  ${DIM}${"Bin".padEnd(10)}${"Dist".padEnd(8)}${"USD".padEnd(14)}${"% Total".padEnd(10)}${"Zone".padEnd(14)}${RESET}`);
    console.log(`  ${DIM}${"─".repeat(56)}${RESET}`);

    for (const b of a.binSnapshot) {
      const distLabel = b.distFromActive === 0 ? "ACTIVE" : (b.distFromActive > 0 ? `+${b.distFromActive}` : `${b.distFromActive}`);
      let zoneColor: string;
      switch (b.zone) {
        case "fee-earning": zoneColor = "\x1b[32m"; break;
        case "near": zoneColor = "\x1b[36m"; break;
        case "far": zoneColor = "\x1b[33m"; break;
        case "dead": zoneColor = "\x1b[31m"; break;
      }
      const bar = "█".repeat(Math.min(15, Math.round(b.pctOfTotal / 5)));

      console.log(
        `  ${String(b.binId).padEnd(10)}${distLabel.padEnd(8)}${formatUsd(b.usd).padEnd(14)}${formatPct(b.pctOfTotal).padEnd(10)}${zoneColor}${b.zone.toUpperCase().padEnd(14)}${RESET}${DIM}${bar}${RESET}`
      );
    }
    console.log("");
    console.log(`  ${DIM}Zone legend: ${"\x1b[32m"}FEE-EARNING${RESET}${DIM} (±${FEE_EARNING_RADIUS}) | ${"\x1b[36m"}NEAR${RESET}${DIM} (±5) | ${"\x1b[33m"}FAR${RESET}${DIM} (±12) | ${"\x1b[31m"}DEAD${RESET}${DIM} (>12)${RESET}`);
    console.log("");
  }

  // Top remediation
  console.log(`${BOLD}  ── Priority Action ──────────────────────────────────────${RESET}`);
  console.log(`  ${BOLD}>${RESET} ${a.topRemediation}`);
  console.log("");
  console.log(`${DIM}  Timestamp: ${new Date().toISOString()}${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log("");
}

function printScanTable(analyses: LeakageAnalysis[]): void {
  console.log("");
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}  HODLMM Fee Leakage Pathology — All Pools Scan${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════════════════════════════${RESET}`);
  console.log("");

  console.log(
    `  ${DIM}${"#".padEnd(6)}${"Pair".padEnd(18)}${"Health".padEnd(10)}${"Grade".padEnd(12)}${"Leak%".padEnd(10)}${"Leak/d".padEnd(14)}${"#Path".padEnd(8)}${"Top Pathology".padEnd(22)}${RESET}`
  );
  console.log(`  ${DIM}${"─".repeat(96)}${RESET}`);

  const sorted = [...analyses].sort((a, b) => a.healthScore - b.healthScore);

  for (const a of sorted) {
    const gc = gradeColor(a.healthGrade);
    const topPath = a.pathologies.length > 0 ? a.pathologies[0].name : "—";
    console.log(
      `  ${String(a.poolId).padEnd(6)}${a.pair.padEnd(18)}${gc}${String(a.healthScore).padEnd(10)}${a.healthGrade.padEnd(12)}${RESET}${formatPct(a.totalLeakageRate).padEnd(10)}${formatUsd(a.totalLeakageDailyUsd).padEnd(14)}${String(a.pathologies.length).padEnd(8)}${topPath}`
    );
  }

  console.log("");

  // Summary stats
  const totalDailyLeak = analyses.reduce((s, a) => s + a.totalLeakageDailyUsd, 0);
  const avgHealth = analyses.reduce((s, a) => s + a.healthScore, 0) / (analyses.length || 1);
  const criticalCount = analyses.filter(a => a.healthGrade === "CRITICAL" || a.healthGrade === "SEVERE").length;

  console.log(`${BOLD}  Summary${RESET}`);
  console.log(`  Pools scanned:         ${analyses.length}`);
  console.log(`  Avg health score:      ${avgHealth.toFixed(1)}/100`);
  console.log(`  Total daily leakage:   ${formatUsd(totalDailyLeak)}`);
  console.log(`  Critical/Severe pools: ${criticalCount}`);
  console.log("");
  console.log(`${DIM}  Timestamp: ${new Date().toISOString()}${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════════════════════════════${RESET}`);
  console.log("");
}

function printComparisonTable(analyses: LeakageAnalysis[]): void {
  console.log("");
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}  HODLMM Fee Leakage — Pool Comparison${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log("");

  const sorted = [...analyses].sort((a, b) => b.healthScore - a.healthScore);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  for (const a of sorted) {
    const gc = gradeColor(a.healthGrade);
    const pathNames = a.pathologies.map(p => p.name).join(", ") || "none";
    console.log(`  ${BOLD}Pool #${a.poolId} (${a.pair})${RESET}`);
    console.log(`    Health: ${gc}${a.healthScore}/100 [${a.healthGrade}]${RESET} | Leakage: ${formatPct(a.totalLeakageRate)} (${formatUsd(a.totalLeakageDailyUsd)}/day)`);
    console.log(`    Pathologies: ${pathNames}`);
    console.log(`    Action: ${a.topRemediation}`);
    console.log("");
  }

  if (sorted.length >= 2) {
    console.log(`${BOLD}  Verdict:${RESET} Pool #${best.poolId} (${best.pair}) has the healthiest fee capture.`);
    console.log(`  Pool #${worst.poolId} (${worst.pair}) needs the most attention.`);
    console.log("");
  }

  console.log(`${DIM}  Timestamp: ${new Date().toISOString()}${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log("");
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-fee-leakage")
  .description("HODLMM Fee Leakage Pathology Analyzer — diagnoses root causes of fee loss in concentrated LP positions")
  .version("1.0.0");

program
  .command("analyze")
  .description("Analyze fee leakage pathologies for a specific pool")
  .argument("<pool-id>", "HODLMM pool ID")
  .option("--json", "Output raw JSON")
  .action(async (poolIdStr: string, opts: any) => {
    const poolId = parseInt(poolIdStr);
    if (isNaN(poolId)) {
      console.error("Invalid pool ID");
      process.exit(1);
    }

    const pools = await fetchAllPools();
    const pool = pools.find((p) => p.poolId === poolId);
    if (!pool) {
      console.error(`Pool #${poolId} not found or below ${formatUsd(MIN_TVL_USD)} TVL minimum`);
      process.exit(1);
    }

    const analysis = await analyzePool(pool);

    if (opts.json) {
      console.log(JSON.stringify(analysis, null, 2));
    } else {
      printLeakageReport(analysis);
    }
  });

program
  .command("scan")
  .description("Scan all HODLMM pools for fee leakage pathologies")
  .option("--top <n>", "Show top N worst pools", "10")
  .option("--json", "Output raw JSON")
  .action(async (opts: any) => {
    const pools = await fetchAllPools();
    const topN = parseInt(opts.top) || 10;

    console.log(`${DIM}Scanning ${pools.length} pools for fee leakage pathologies...${RESET}`);

    const analyses: LeakageAnalysis[] = [];
    for (const pool of pools) {
      if (!pool.poolId) continue;
      try {
        const analysis = await analyzePool(pool);
        analyses.push(analysis);
        process.stdout.write(`${DIM}.${RESET}`);
      } catch {
        // Skip pools that error
      }
    }
    console.log("");

    const topAnalyses = analyses
      .sort((a, b) => a.healthScore - b.healthScore)
      .slice(0, topN);

    if (opts.json) {
      console.log(JSON.stringify(topAnalyses, null, 2));
    } else {
      printScanTable(topAnalyses);
    }
  });

program
  .command("compare")
  .description("Compare fee leakage between multiple pools")
  .argument("<pool-ids...>", "Two or more pool IDs to compare")
  .option("--json", "Output raw JSON")
  .action(async (poolIds: string[], opts: any) => {
    if (poolIds.length < 2) {
      console.error("Provide at least 2 pool IDs to compare");
      process.exit(1);
    }

    const pools = await fetchAllPools();
    const analyses: LeakageAnalysis[] = [];

    for (const idStr of poolIds) {
      const poolId = parseInt(idStr);
      const pool = pools.find((p) => p.poolId === poolId);
      if (!pool) {
        console.error(`Pool #${poolId} not found`);
        continue;
      }
      analyses.push(await analyzePool(pool));
    }

    if (analyses.length < 2) {
      console.error("Need at least 2 valid pools to compare");
      process.exit(1);
    }

    if (opts.json) {
      console.log(JSON.stringify(analyses, null, 2));
    } else {
      printComparisonTable(analyses);
    }
  });

program.parse();
