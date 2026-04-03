#!/usr/bin/env bun
/**
 * hodlmm-arb-scanner.ts
 *
 * HODLMM Arbitrage Scanner — Detects cross-pool price discrepancies,
 * estimates profit after fees, ranks opportunities by edge size.
 *
 * Part of cocoa007's Bitflow Skills Competition entry (Day 33).
 */

import { Command } from "commander";

// ── Constants ──────────────────────────────────────────────────────────────────

const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";
const SENDER = "SP000000000000000000002Q6VF78";

const MIN_TVL_USD = 1000;
const DEFAULT_MIN_EDGE_BPS = 10;
const DEFAULT_FEE_BPS = 30; // conservative per-leg fee estimate

// Edge verdict thresholds (basis points)
const ACTIONABLE_BPS = 50;
const MARGINAL_BPS = 20;

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

interface TokenPoolEntry {
  poolId: number;
  pair: string;
  tvlUsd: number;
  impliedPriceUsd: number;
  feeBps: number;
  otherToken: string;
  volume24hUsd: number;
}

type Verdict = "ACTIONABLE" | "MARGINAL" | "NOISE";
type MarketEfficiency = "HIGH" | "MODERATE" | "LOW" | "FRAGMENTED";

interface ArbOpportunity {
  buyPool: { id: number; pair: string; impliedPrice: number };
  sellPool: { id: number; pair: string; impliedPrice: number };
  rawEdgeBps: number;
  estimatedFeeBps: number;
  netEdgeBps: number;
  profitPerUnit: number;
  verdict: Verdict;
  reasoning: string;
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

function encodeUint(n: number): string {
  const hex = n.toString(16).padStart(32, "0");
  return "0x01" + hex;
}

function extractTupleField(repr: string, field: string): number {
  const pattern = new RegExp(`${field}\\s+u(\\d+)`);
  const match = repr.match(pattern);
  return match ? parseInt(match[1], 10) : 0;
}

// ── Data Fetching ──────────────────────────────────────────────────────────────

async function fetchAppPools(): Promise<AppPool[]> {
  try {
    const resp = await fetchJson(`${BFF_APP_BASE}/pools`);
    const pools = resp.data || resp.pools || resp || [];
    return Array.isArray(pools) ? pools : [];
  } catch {
    return [];
  }
}

async function fetchActiveBinPrice(
  poolId: number,
  token0Decimals: number,
  token1Decimals: number
): Promise<number | null> {
  try {
    const result = await callReadOnly("get-active-bin", [encodeUint(poolId)]);
    const repr = result.result?.repr || result.repr || "";

    // Extract active bin ID
    const directMatch = repr.match(/\(ok\s+u(\d+)\)/);
    let binId: number;
    if (directMatch) {
      binId = parseInt(directMatch[1], 10);
    } else {
      binId = extractTupleField(repr, "active-bin-id") || extractTupleField(repr, "bin-id");
    }
    if (!binId) return null;

    // Get bin reserves for price calculation
    const binResult = await callReadOnly("get-bin", [encodeUint(poolId), encodeUint(binId)]);
    const binRepr = binResult.result?.repr || binResult.repr || "";

    const reserveX = extractTupleField(binRepr, "reserve-x");
    const reserveY = extractTupleField(binRepr, "reserve-y");

    if (reserveX === 0 && reserveY === 0) return null;

    // Price of token-x in terms of token-y from bin reserves
    // Adjust for decimal differences
    if (reserveX === 0) return null;

    const decimalAdjust = Math.pow(10, token0Decimals - token1Decimals);
    const price = (reserveY / reserveX) * decimalAdjust;
    return price;
  } catch {
    return null;
  }
}

// ── Analysis Engine ────────────────────────────────────────────────────────────

function groupPoolsByToken(pools: AppPool[]): Map<string, TokenPoolEntry[]> {
  const tokenMap = new Map<string, TokenPoolEntry[]>();

  for (const pool of pools) {
    if (!pool.poolId || pool.poolId <= 0) continue;
    if ((pool.tvlUsd || 0) < MIN_TVL_USD) continue;

    const feeBps = pool.feeBps || DEFAULT_FEE_BPS;

    // Add token0 entry
    const t0 = pool.token0Symbol?.toUpperCase();
    if (t0) {
      if (!tokenMap.has(t0)) tokenMap.set(t0, []);
      tokenMap.get(t0)!.push({
        poolId: pool.poolId,
        pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
        tvlUsd: Math.round(pool.tvlUsd || 0),
        impliedPriceUsd: pool.token0PriceUsd || 0,
        feeBps,
        otherToken: pool.token1Symbol,
        volume24hUsd: pool.volume24hUsd || 0,
      });
    }

    // Add token1 entry
    const t1 = pool.token1Symbol?.toUpperCase();
    if (t1) {
      if (!tokenMap.has(t1)) tokenMap.set(t1, []);
      tokenMap.get(t1)!.push({
        poolId: pool.poolId,
        pair: `${pool.token0Symbol}-${pool.token1Symbol}`,
        tvlUsd: Math.round(pool.tvlUsd || 0),
        impliedPriceUsd: pool.token1PriceUsd || 0,
        feeBps,
        otherToken: pool.token0Symbol,
        volume24hUsd: pool.volume24hUsd || 0,
      });
    }
  }

  return tokenMap;
}

function findArbOpportunities(
  token: string,
  entries: TokenPoolEntry[],
  minEdgeBps: number
): ArbOpportunity[] {
  const opportunities: ArbOpportunity[] = [];

  // Filter entries with valid prices
  const priced = entries.filter((e) => e.impliedPriceUsd > 0);
  if (priced.length < 2) return [];

  // Compare all pairs
  for (let i = 0; i < priced.length; i++) {
    for (let j = i + 1; j < priced.length; j++) {
      const a = priced[i];
      const b = priced[j];

      // Determine which is cheaper (buy pool) and which is more expensive (sell pool)
      const [buyEntry, sellEntry] =
        a.impliedPriceUsd <= b.impliedPriceUsd ? [a, b] : [b, a];

      if (buyEntry.impliedPriceUsd === 0) continue;

      const rawEdgeBps = Math.round(
        ((sellEntry.impliedPriceUsd - buyEntry.impliedPriceUsd) /
          buyEntry.impliedPriceUsd) *
          10000
      );

      // Estimate total fees (buy leg + sell leg)
      const totalFeeBps = buyEntry.feeBps + sellEntry.feeBps;
      const netEdgeBps = rawEdgeBps - totalFeeBps;

      if (netEdgeBps < minEdgeBps) continue;

      const profitPerUnit =
        sellEntry.impliedPriceUsd - buyEntry.impliedPriceUsd -
        (buyEntry.impliedPriceUsd * totalFeeBps) / 10000;

      let verdict: Verdict;
      if (netEdgeBps >= ACTIONABLE_BPS) verdict = "ACTIONABLE";
      else if (netEdgeBps >= MARGINAL_BPS) verdict = "MARGINAL";
      else verdict = "NOISE";

      const reasoning = `${token} is ${rawEdgeBps}bps cheaper on pool ${buyEntry.poolId} (${buyEntry.pair}) vs pool ${sellEntry.poolId} (${sellEntry.pair}). After ${buyEntry.feeBps}bps + ${sellEntry.feeBps}bps fees, net edge is ${netEdgeBps}bps.`;

      opportunities.push({
        buyPool: {
          id: buyEntry.poolId,
          pair: buyEntry.pair,
          impliedPrice: Math.round(buyEntry.impliedPriceUsd * 100) / 100,
        },
        sellPool: {
          id: sellEntry.poolId,
          pair: sellEntry.pair,
          impliedPrice: Math.round(sellEntry.impliedPriceUsd * 100) / 100,
        },
        rawEdgeBps,
        estimatedFeeBps: totalFeeBps,
        netEdgeBps,
        profitPerUnit: Math.round(profitPerUnit * 100) / 100,
        verdict,
        reasoning,
      });
    }
  }

  return opportunities.sort((a, b) => b.netEdgeBps - a.netEdgeBps);
}

function classifyEfficiency(opportunities: ArbOpportunity[]): MarketEfficiency {
  const actionable = opportunities.filter((o) => o.verdict === "ACTIONABLE").length;
  const marginal = opportunities.filter((o) => o.verdict === "MARGINAL").length;

  if (actionable >= 3) return "FRAGMENTED";
  if (actionable >= 1) return "LOW";
  if (marginal >= 2) return "MODERATE";
  return "HIGH";
}

// ── Command Handlers ───────────────────────────────────────────────────────────

async function runDoctor(): Promise<void> {
  const results: Record<string, string> = {};

  try {
    await fetchJson(`${BFF_APP_BASE}/pools`);
    results["bitflow_app_api"] = "ok";
  } catch (e: any) {
    results["bitflow_app_api"] = `error: ${e.message}`;
  }

  try {
    await fetchJson(`${HIRO_API}/v2/info`);
    results["hiro_api"] = "ok";
  } catch (e: any) {
    results["hiro_api"] = `error: ${e.message}`;
  }

  try {
    const testResult = await callReadOnly("get-active-bin", [encodeUint(1)]);
    results["dlmm_contract"] = testResult.result ? "ok" : "no result";
  } catch (e: any) {
    results["dlmm_contract"] = `error: ${e.message}`;
  }

  console.log(
    JSON.stringify({
      tool: "hodlmm-arb-scanner",
      command: "doctor",
      status: Object.values(results).every((v) => v === "ok") ? "healthy" : "degraded",
      checks: results,
      timestamp: new Date().toISOString(),
    })
  );
}

async function runInstallPacks(): Promise<void> {
  console.log(
    JSON.stringify({
      tool: "hodlmm-arb-scanner",
      command: "install-packs",
      status: "ok",
      message: "No additional dependencies required. Uses commander (workspace) + native fetch.",
      timestamp: new Date().toISOString(),
    })
  );
}

async function runTokenScan(options: {
  token?: string;
  minEdge?: string;
}): Promise<void> {
  const tokenQuery = (options.token || "sBTC").toUpperCase();
  const minEdgeBps = options.minEdge ? parseInt(options.minEdge, 10) : DEFAULT_MIN_EDGE_BPS;

  const appPools = await fetchAppPools();
  if (appPools.length === 0) {
    console.log(
      JSON.stringify({
        tool: "hodlmm-arb-scanner",
        error: "Could not fetch pool list from Bitflow API",
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  const tokenMap = groupPoolsByToken(appPools);
  const entries = tokenMap.get(tokenQuery);

  if (!entries || entries.length === 0) {
    console.log(
      JSON.stringify({
        tool: "hodlmm-arb-scanner",
        command: "run",
        token: tokenQuery,
        poolCount: 0,
        opportunities: [],
        summary: {
          totalOpportunities: 0,
          bestNetEdgeBps: 0,
          avgNetEdgeBps: 0,
          marketEfficiency: "HIGH",
        },
        note: `Token ${tokenQuery} not found in any HODLMM pool`,
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  if (entries.length < 2) {
    console.log(
      JSON.stringify({
        tool: "hodlmm-arb-scanner",
        command: "run",
        token: tokenQuery,
        poolCount: entries.length,
        opportunities: [],
        summary: {
          totalOpportunities: 0,
          bestNetEdgeBps: 0,
          avgNetEdgeBps: 0,
          marketEfficiency: "HIGH",
        },
        note: `${tokenQuery} only appears in ${entries.length} pool — need 2+ for cross-pool comparison`,
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  const opportunities = findArbOpportunities(tokenQuery, entries, minEdgeBps);
  const efficiency = classifyEfficiency(opportunities);

  const bestEdge = opportunities.length > 0 ? opportunities[0].netEdgeBps : 0;
  const avgEdge =
    opportunities.length > 0
      ? Math.round(
          opportunities.reduce((s, o) => s + o.netEdgeBps, 0) / opportunities.length
        )
      : 0;

  console.log(
    JSON.stringify({
      tool: "hodlmm-arb-scanner",
      command: "run",
      token: tokenQuery,
      poolCount: entries.length,
      pools: entries.map((e) => ({
        poolId: e.poolId,
        pair: e.pair,
        impliedPriceUsd: Math.round(e.impliedPriceUsd * 100) / 100,
        tvlUsd: e.tvlUsd,
        feeBps: e.feeBps,
      })),
      opportunities,
      summary: {
        totalOpportunities: opportunities.length,
        bestNetEdgeBps: bestEdge,
        avgNetEdgeBps: avgEdge,
        marketEfficiency: efficiency,
        actionable: opportunities.filter((o) => o.verdict === "ACTIONABLE").length,
        marginal: opportunities.filter((o) => o.verdict === "MARGINAL").length,
        noise: opportunities.filter((o) => o.verdict === "NOISE").length,
      },
      timestamp: new Date().toISOString(),
    })
  );
}

async function runScanAll(options: {
  top?: string;
  minTvl?: string;
}): Promise<void> {
  const topN = options.top ? parseInt(options.top, 10) : 10;
  const minTvl = options.minTvl ? parseInt(options.minTvl, 10) : MIN_TVL_USD;

  const appPools = await fetchAppPools();
  if (appPools.length === 0) {
    console.log(
      JSON.stringify({
        tool: "hodlmm-arb-scanner",
        error: "Could not fetch pool list from Bitflow API",
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  // Override MIN_TVL for this scan
  const filteredPools = appPools.filter((p) => (p.tvlUsd || 0) >= minTvl);
  const tokenMap = groupPoolsByToken(filteredPools);

  // Find tokens in 2+ pools
  const crossPoolTokens: string[] = [];
  for (const [token, entries] of tokenMap) {
    if (entries.length >= 2) crossPoolTokens.push(token);
  }

  const allOpportunities: Array<{ token: string } & ArbOpportunity> = [];

  for (const token of crossPoolTokens) {
    const entries = tokenMap.get(token)!;
    const opps = findArbOpportunities(token, entries, DEFAULT_MIN_EDGE_BPS);
    for (const opp of opps) {
      allOpportunities.push({ token, ...opp });
    }
  }

  // Sort by net edge descending
  allOpportunities.sort((a, b) => b.netEdgeBps - a.netEdgeBps);
  const ranked = allOpportunities.slice(0, topN).map((o, i) => ({ rank: i + 1, ...o }));

  const overallEfficiency = classifyEfficiency(allOpportunities);

  console.log(
    JSON.stringify({
      tool: "hodlmm-arb-scanner",
      command: "scan",
      crossPoolTokens: crossPoolTokens.length,
      tokensScanned: crossPoolTokens,
      totalOpportunities: allOpportunities.length,
      topOpportunities: ranked,
      summary: {
        actionable: allOpportunities.filter((o) => o.verdict === "ACTIONABLE").length,
        marginal: allOpportunities.filter((o) => o.verdict === "MARGINAL").length,
        noise: allOpportunities.filter((o) => o.verdict === "NOISE").length,
        bestNetEdgeBps:
          allOpportunities.length > 0 ? allOpportunities[0].netEdgeBps : 0,
        avgNetEdgeBps:
          allOpportunities.length > 0
            ? Math.round(
                allOpportunities.reduce((s, o) => s + o.netEdgeBps, 0) /
                  allOpportunities.length
              )
            : 0,
        marketEfficiency: overallEfficiency,
      },
      timestamp: new Date().toISOString(),
    })
  );
}

// ── CLI Setup ──────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("hodlmm-arb-scanner")
  .description(
    "HODLMM Arbitrage Scanner — Cross-pool price discrepancies, fee-adjusted edges, opportunity ranking"
  )
  .version("1.0.0");

program
  .command("doctor")
  .description("Check API connectivity and dependencies")
  .action(runDoctor);

program
  .command("install-packs")
  .description("Install dependencies (none required beyond workspace)")
  .action(runInstallPacks);

program
  .command("run")
  .description("Scan arbitrage opportunities for a specific token")
  .option("--token <symbol>", "Token symbol to scan (e.g., sBTC, STX)", "sBTC")
  .option("--min-edge <bps>", "Minimum net edge in basis points to report", String(DEFAULT_MIN_EDGE_BPS))
  .action(runTokenScan);

program
  .command("scan")
  .description("Scan all tokens for cross-pool arbitrage opportunities")
  .option("--top <n>", "Number of opportunities to show", "10")
  .option("--min-tvl <usd>", "Minimum pool TVL to consider", String(MIN_TVL_USD))
  .action(runScanAll);

program.parse();
