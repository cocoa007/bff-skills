#!/usr/bin/env bun
/**
 * hodlmm-bin-density.ts
 *
 * HODLMM Bin Density Scanner — Maps liquidity density across active trading
 * bins to identify competitive positioning opportunities. Thin bins (low
 * liquidity) mean higher fee share per unit capital; crowded bins mean more
 * competition and lower returns per LP.
 *
 * Key metrics:
 *  - Per-bin liquidity density (reserves / total active reserves)
 *  - Bin competition score (density vs uniform distribution)
 *  - Thin bin detection (underweight bins with high fee potential)
 *  - Crowded bin detection (overweight bins with diminished returns)
 *  - Density Gini coefficient (inequality of liquidity distribution)
 *  - Optimal bin placement zones for new LPs
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 41).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const HIRO_BASE = "https://api.hiro.so";
const DLMM_CONTRACT = "SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.dlmm-core-v-1-1";
const MIN_TVL_USD = 100;

// Density classification thresholds
const DENSITY_THIN = 0.5;      // below 50% of uniform density = thin
const DENSITY_CROWDED = 2.0;   // above 200% of uniform density = crowded
const DENSITY_SWEET = 0.8;     // sweet spot: 50%-80% of uniform = good fee share

// ── Types ──────────────────────────────────────────────────────────────────────

interface AppPool {
  id: string;
  poolId: number;
  token0Symbol: string;
  token1Symbol: string;
  tvlUsd: number;
  volume24hUsd: number;
  feeBps: number;
  activeBin: number;
  token0PriceUsd: number;
  token1PriceUsd: number;
}

interface BinReserves {
  binId: number;
  reserveX: number;
  reserveY: number;
  totalReserveUsd: number;
}

interface BinDensityEntry {
  binId: number;
  offset: number;            // distance from active bin
  reserveX: number;
  reserveY: number;
  reserveUsd: number;
  densityRatio: number;      // actual density / uniform density
  densityClass: string;      // THIN | NORMAL | SWEET | CROWDED
  feeSharePct: number;       // estimated % of fees this bin captures
  competitionScore: number;  // 0-100, lower = less competition
}

interface DensityReport {
  timestamp: string;
  pool: {
    poolId: number;
    pair: string;
    activeBin: number;
    tvlUsd: number;
    volume24hUsd: number;
    feeBps: number;
    fees24hUsd: number;
  };
  density: {
    binsScanned: number;
    binsWithLiquidity: number;
    thinBins: number;
    crowdedBins: number;
    sweetSpotBins: number;
    giniCoefficient: number;
    giniClass: string;
    uniformDensityUsd: number;
    peakDensityRatio: number;
    peakBinOffset: number;
  };
  bins: BinDensityEntry[];
  thinZones: { startOffset: number; endOffset: number; avgDensity: number }[];
  crowdedZones: { startOffset: number; endOffset: number; avgDensity: number }[];
  recommendations: string[];
  insights: string[];
  summary: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<any> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`);
  return resp.json();
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
  return `${(n * 100).toFixed(1)}%`;
}

function computeGini(values: number[]): number {
  if (values.length <= 1) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  if (mean === 0) return 0;
  let sumDiff = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumDiff += Math.abs(sorted[i] - sorted[j]);
    }
  }
  return sumDiff / (2 * n * n * mean);
}

function classifyGini(g: number): string {
  if (g >= 0.6) return "HIGHLY_UNEQUAL";
  if (g >= 0.4) return "UNEQUAL";
  if (g >= 0.2) return "MODERATE";
  return "EVEN";
}

// ── Pool Data ──────────────────────────────────────────────────────────────────

async function fetchAllPools(): Promise<AppPool[]> {
  const data = await fetchJson(`${BFF_APP_BASE}/pools`);
  const rawPools = data?.data || data?.pools || data || [];
  return rawPools
    .map((p: any) => {
      const tx = p.tokens?.tokenX || {};
      const ty = p.tokens?.tokenY || {};
      const poolIdStr = p.poolId || p.id || "0";
      const numericId = parseInt(poolIdStr.toString().replace(/^dlmm_/, "")) || 0;
      return {
        id: poolIdStr,
        poolId: numericId,
        token0Symbol: tx.symbol || p.token0Symbol || "?",
        token1Symbol: ty.symbol || p.token1Symbol || "?",
        tvlUsd: parseFloat(p.tvlUsd ?? "0"),
        volume24hUsd: parseFloat(p.volumeUsd1d ?? p.volume24hUsd ?? "0"),
        feeBps: parseFloat(p.feeBps ?? "30"),
        activeBin: parseInt(p.activeBinId ?? p.activeBin ?? "0"),
        token0PriceUsd: parseFloat(tx.priceUsd ?? p.token0PriceUsd ?? "0"),
        token1PriceUsd: parseFloat(ty.priceUsd ?? p.token1PriceUsd ?? "0"),
      };
    })
    .filter((p: AppPool) => p.tvlUsd >= MIN_TVL_USD);
}

async function fetchBinReserves(
  poolId: number,
  activeBin: number,
  radius: number,
  token0Price: number,
  token1Price: number,
): Promise<BinReserves[]> {
  const bins: BinReserves[] = [];
  const startBin = activeBin - radius;
  const endBin = activeBin + radius;

  for (let binId = startBin; binId <= endBin; binId++) {
    try {
      const url =
        `${HIRO_BASE}/v2/contracts/call-read/` +
        `${DLMM_CONTRACT.split(".")[0]}/${DLMM_CONTRACT.split(".")[1]}/get-bin`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: DLMM_CONTRACT.split(".")[0],
          arguments: [
            `0x0100000000000000000000000000000${poolId.toString(16).padStart(4, "0")}`,
            `0x0100000000000000000000000000${binId.toString(16).padStart(6, "0")}`,
          ],
        }),
      });

      if (!resp.ok) continue;
      const data = await resp.json();
      if (!data.okay || data.result === "0x09") continue;

      // Parse Clarity tuple response
      const hex = data.result || "";
      const reserveX = parseClarityUint(hex, "reserve-x") / 1e6;
      const reserveY = parseClarityUint(hex, "reserve-y") / 1e6;
      const usd = reserveX * token0Price + reserveY * token1Price;

      bins.push({ binId, reserveX, reserveY, totalReserveUsd: usd });
    } catch {
      continue;
    }
  }

  return bins;
}

function parseClarityUint(hex: string, _field: string): number {
  // Simplified parser — extract uint values from Clarity tuple response
  // In practice, bin reserves come as (ok {reserve-x: uint, reserve-y: uint})
  // We'll extract sequentially: first uint = reserve-x, second = reserve-y
  const uintPattern = /01([0-9a-f]{32})/gi;
  const matches = [...hex.matchAll(uintPattern)];
  if (_field === "reserve-x" && matches.length >= 1) {
    return parseInt(matches[0][1], 16);
  }
  if (_field === "reserve-y" && matches.length >= 2) {
    return parseInt(matches[1][1], 16);
  }
  return 0;
}

// ── Core Analysis ──────────────────────────────────────────────────────────────

async function buildDensityReport(opts: {
  poolId: number;
  radius: number;
  limit: number;
}): Promise<DensityReport> {
  const pools = await fetchAllPools();
  const pool = pools.find((p) => p.poolId === opts.poolId);
  if (!pool) {
    const available = pools
      .sort((a, b) => b.tvlUsd - a.tvlUsd)
      .slice(0, 10)
      .map((p) => `  ${p.poolId}: ${p.token0Symbol}/${p.token1Symbol} (${formatUsd(p.tvlUsd)})`)
      .join("\n");
    throw new Error(`Pool ${opts.poolId} not found. Top pools:\n${available}`);
  }

  const bins = await fetchBinReserves(
    pool.poolId,
    pool.activeBin,
    opts.radius,
    pool.token0PriceUsd,
    pool.token1PriceUsd,
  );

  const binsWithLiq = bins.filter((b) => b.totalReserveUsd > 0);
  const totalReserveUsd = binsWithLiq.reduce((s, b) => s + b.totalReserveUsd, 0);
  const uniformDensity = binsWithLiq.length > 0 ? totalReserveUsd / (opts.radius * 2 + 1) : 0;
  const fees24h = pool.volume24hUsd * (pool.feeBps / 10_000);

  // Build density entries
  const entries: BinDensityEntry[] = bins.map((b) => {
    const offset = b.binId - pool.activeBin;
    const density = uniformDensity > 0 ? b.totalReserveUsd / uniformDensity : 0;
    let densityClass: string;
    if (b.totalReserveUsd === 0) densityClass = "EMPTY";
    else if (density <= DENSITY_THIN) densityClass = "THIN";
    else if (density <= DENSITY_SWEET) densityClass = "SWEET";
    else if (density >= DENSITY_CROWDED) densityClass = "CROWDED";
    else densityClass = "NORMAL";

    const feeShare = totalReserveUsd > 0 ? b.totalReserveUsd / totalReserveUsd : 0;
    // Competition score: lower density = less competition = lower score
    const competition = Math.min(100, Math.round(density * 50));

    return {
      binId: b.binId,
      offset,
      reserveX: b.reserveX,
      reserveY: b.reserveY,
      reserveUsd: b.totalReserveUsd,
      densityRatio: density,
      densityClass,
      feeSharePct: feeShare,
      competitionScore: competition,
    };
  });

  // Classify counts
  const thinBins = entries.filter((e) => e.densityClass === "THIN").length;
  const crowdedBins = entries.filter((e) => e.densityClass === "CROWDED").length;
  const sweetBins = entries.filter((e) => e.densityClass === "SWEET").length;

  // Gini on reserves
  const reserveValues = entries.filter((e) => e.reserveUsd > 0).map((e) => e.reserveUsd);
  const gini = computeGini(reserveValues);

  // Find peak
  const peakEntry = entries.reduce(
    (best, e) => (e.densityRatio > best.densityRatio ? e : best),
    entries[0],
  );

  // Detect contiguous zones
  const thinZones = findZones(entries, "THIN");
  const crowdedZones = findZones(entries, "CROWDED");

  // Recommendations
  const recommendations: string[] = [];
  const sweetEntries = entries.filter((e) => e.densityClass === "SWEET");
  if (sweetEntries.length > 0) {
    const bestSweet = sweetEntries.sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset))[0];
    recommendations.push(
      `SWEET SPOT: Bin ${bestSweet.binId} (offset ${bestSweet.offset > 0 ? "+" : ""}${bestSweet.offset}) has ${formatPct(bestSweet.densityRatio)} of uniform density — good fee share with moderate risk`,
    );
  }

  if (thinBins > 0) {
    const nearestThin = entries
      .filter((e) => e.densityClass === "THIN")
      .sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset))[0];
    recommendations.push(
      `OPPORTUNITY: ${thinBins} thin bin(s) detected. Nearest: bin ${nearestThin.binId} (offset ${nearestThin.offset > 0 ? "+" : ""}${nearestThin.offset}) at ${formatPct(nearestThin.densityRatio)} density — high fee share potential but higher drift risk`,
    );
  }

  if (crowdedBins > 0) {
    recommendations.push(
      `AVOID: ${crowdedBins} crowded bin(s) with >2x uniform density — fee share diluted by competition`,
    );
  }

  const activeBinEntry = entries.find((e) => e.offset === 0);
  if (activeBinEntry) {
    if (activeBinEntry.densityClass === "CROWDED") {
      recommendations.push(
        `Active bin is CROWDED (${formatPct(activeBinEntry.densityRatio)} of uniform) — consider adjacent bins for better fee economics`,
      );
    } else if (activeBinEntry.densityClass === "THIN") {
      recommendations.push(
        `Active bin is THIN (${formatPct(activeBinEntry.densityRatio)} of uniform) — high fee share opportunity at the current price`,
      );
    }
  }

  // Insights
  const insights: string[] = [];
  const giniClass = classifyGini(gini);
  if (giniClass === "HIGHLY_UNEQUAL") {
    insights.push(`Liquidity is highly concentrated in a few bins — Gini ${gini.toFixed(3)}`);
  } else if (giniClass === "EVEN") {
    insights.push(`Liquidity is evenly spread across bins — Gini ${gini.toFixed(3)}`);
  }

  const emptyBins = entries.filter((e) => e.reserveUsd === 0).length;
  if (emptyBins > entries.length * 0.5) {
    insights.push(`${emptyBins} of ${entries.length} scanned bins are empty — sparse liquidity around active bin`);
  }

  if (fees24h > 0 && thinBins > 0) {
    const thinFeeShare = entries
      .filter((e) => e.densityClass === "THIN")
      .reduce((s, e) => s + e.feeSharePct, 0);
    insights.push(
      `Thin bins capture ~${formatPct(thinFeeShare)} of pool fees (${formatUsd(fees24h * thinFeeShare)}/day) — underserved liquidity zones`,
    );
  }

  const summary =
    `Pool ${pool.poolId} (${pool.token0Symbol}/${pool.token1Symbol}): Scanned ${entries.length} bins around active bin ${pool.activeBin}. ` +
    `${binsWithLiq.length} bins with liquidity. ` +
    `${thinBins} thin, ${sweetBins} sweet spot, ${crowdedBins} crowded. ` +
    `Gini: ${gini.toFixed(3)} (${giniClass}). ` +
    `Total reserves: ${formatUsd(totalReserveUsd)}.`;

  return {
    timestamp: new Date().toISOString(),
    pool: {
      poolId: pool.poolId,
      pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
      activeBin: pool.activeBin,
      tvlUsd: pool.tvlUsd,
      volume24hUsd: pool.volume24hUsd,
      feeBps: pool.feeBps,
      fees24hUsd: fees24h,
    },
    density: {
      binsScanned: entries.length,
      binsWithLiquidity: binsWithLiq.length,
      thinBins,
      crowdedBins,
      sweetSpotBins: sweetBins,
      giniCoefficient: gini,
      giniClass,
      uniformDensityUsd: uniformDensity,
      peakDensityRatio: peakEntry?.densityRatio ?? 0,
      peakBinOffset: peakEntry?.offset ?? 0,
    },
    bins: entries.slice(0, opts.limit),
    thinZones,
    crowdedZones,
    recommendations,
    insights,
    summary,
  };
}

function findZones(
  entries: BinDensityEntry[],
  targetClass: string,
): { startOffset: number; endOffset: number; avgDensity: number }[] {
  const zones: { startOffset: number; endOffset: number; avgDensity: number }[] = [];
  const sorted = [...entries].sort((a, b) => a.offset - b.offset);
  let zoneStart: number | null = null;
  let zoneDensities: number[] = [];

  for (const e of sorted) {
    if (e.densityClass === targetClass) {
      if (zoneStart === null) {
        zoneStart = e.offset;
        zoneDensities = [e.densityRatio];
      } else {
        zoneDensities.push(e.densityRatio);
      }
    } else {
      if (zoneStart !== null) {
        zones.push({
          startOffset: zoneStart,
          endOffset: sorted[sorted.indexOf(e) - 1]?.offset ?? zoneStart,
          avgDensity: zoneDensities.reduce((s, v) => s + v, 0) / zoneDensities.length,
        });
        zoneStart = null;
        zoneDensities = [];
      }
    }
  }
  if (zoneStart !== null) {
    zones.push({
      startOffset: zoneStart,
      endOffset: sorted[sorted.length - 1].offset,
      avgDensity: zoneDensities.reduce((s, v) => s + v, 0) / zoneDensities.length,
    });
  }

  return zones;
}

// ── CLI ────────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-bin-density")
  .description("Scan bin liquidity density to find thin vs crowded zones for LP placement")
  .requiredOption("--pool <id>", "Pool ID to analyze")
  .option("--radius <n>", "Number of bins to scan in each direction from active bin", "10")
  .option("--limit <n>", "Max bins to display", "25")
  .option("--json", "Output raw JSON")
  .action(async (opts) => {
    try {
      const report = await buildDensityReport({
        poolId: parseInt(opts.pool),
        radius: parseInt(opts.radius),
        limit: parseInt(opts.limit),
      });

      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }

      // Header
      console.log(`\n╔══════════════════════════════════════════════════════╗`);
      console.log(`║  HODLMM Bin Density Scanner                         ║`);
      console.log(`╚══════════════════════════════════════════════════════╝`);

      // Pool info
      const p = report.pool;
      console.log(`\n  Pool: ${p.pair} (#${p.poolId})`);
      console.log(`  ─────────────────────────────────────────────`);
      console.log(`  Active Bin:     ${p.activeBin}`);
      console.log(`  TVL:            ${formatUsd(p.tvlUsd)}`);
      console.log(`  24h Volume:     ${formatUsd(p.volume24hUsd)}`);
      console.log(`  24h Fees:       ${formatUsd(p.fees24hUsd)} (${p.feeBps}bps)`);

      // Density overview
      const d = report.density;
      console.log(`\n  Density Analysis`);
      console.log(`  ─────────────────────────────────────────────`);
      console.log(`  Bins Scanned:       ${d.binsScanned}`);
      console.log(`  With Liquidity:     ${d.binsWithLiquidity}`);
      console.log(`  Thin Bins:          ${d.thinBins} (<50% uniform density)`);
      console.log(`  Sweet Spot Bins:    ${d.sweetSpotBins} (50-80% — optimal)`);
      console.log(`  Crowded Bins:       ${d.crowdedBins} (>200% uniform density)`);
      console.log(`  Gini Coefficient:   ${d.giniCoefficient.toFixed(3)} (${d.giniClass})`);
      console.log(`  Uniform Density:    ${formatUsd(d.uniformDensityUsd)} per bin`);
      console.log(`  Peak Density:       ${formatPct(d.peakDensityRatio)} at offset ${d.peakBinOffset > 0 ? "+" : ""}${d.peakBinOffset}`);

      // Density heatmap
      if (report.bins.length > 0) {
        console.log(`\n  Bin Density Map (relative to uniform distribution)`);
        console.log(`  ─────────────────────────────────────────────────────────────`);

        const classSymbol: Record<string, string> = {
          EMPTY: "  ",
          THIN: "░░",
          SWEET: "▒▒",
          NORMAL: "▓▓",
          CROWDED: "██",
        };

        const classLabel: Record<string, string> = {
          EMPTY: "EMPTY",
          THIN: "THIN",
          SWEET: "SWEET",
          NORMAL: "NORM",
          CROWDED: "CRWD",
        };

        console.log(`  ${"Offset".padEnd(8)} ${"Bin".padEnd(10)} ${"Reserve".padEnd(14)} ${"Density".padEnd(10)} ${"Class".padEnd(7)} ${"Competition".padEnd(12)} Visual`);
        for (const e of report.bins) {
          const offsetStr = `${e.offset > 0 ? "+" : ""}${e.offset}`;
          const marker = e.offset === 0 ? " <-- ACTIVE" : "";
          const bar = classSymbol[e.densityClass] || "??";
          const barLen = Math.max(1, Math.min(20, Math.round(e.densityRatio * 5)));
          const visual = bar.charAt(0).repeat(barLen);
          console.log(
            `  ${offsetStr.padEnd(8)} ${e.binId.toString().padEnd(10)} ${formatUsd(e.reserveUsd).padEnd(14)} ${formatPct(e.densityRatio).padEnd(10)} ${(classLabel[e.densityClass] || "?").padEnd(7)} ${(e.competitionScore + "/100").padEnd(12)} ${visual}${marker}`,
          );
        }

        console.log(`\n  Legend: ░░ THIN  ▒▒ SWEET  ▓▓ NORMAL  ██ CROWDED`);
      }

      // Zones
      if (report.thinZones.length > 0) {
        console.log(`\n  Thin Zones (opportunity)`);
        console.log(`  ─────────────────────────────────────────────`);
        for (const z of report.thinZones) {
          console.log(
            `  Offset ${z.startOffset > 0 ? "+" : ""}${z.startOffset} to ${z.endOffset > 0 ? "+" : ""}${z.endOffset} — avg density ${formatPct(z.avgDensity)}`,
          );
        }
      }

      if (report.crowdedZones.length > 0) {
        console.log(`\n  Crowded Zones (avoid)`);
        console.log(`  ─────────────────────────────────────────────`);
        for (const z of report.crowdedZones) {
          console.log(
            `  Offset ${z.startOffset > 0 ? "+" : ""}${z.startOffset} to ${z.endOffset > 0 ? "+" : ""}${z.endOffset} — avg density ${formatPct(z.avgDensity)}`,
          );
        }
      }

      // Recommendations
      if (report.recommendations.length > 0) {
        console.log(`\n  Recommendations`);
        console.log(`  ─────────────────────────────────────────────`);
        for (const r of report.recommendations) {
          console.log(`  • ${r}`);
        }
      }

      // Insights
      if (report.insights.length > 0) {
        console.log(`\n  Insights`);
        console.log(`  ─────────────────────────────────────────────`);
        for (const i of report.insights) {
          console.log(`  • ${i}`);
        }
      }

      console.log(`\n  ${report.summary}`);
      console.log();
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
