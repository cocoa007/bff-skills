#!/usr/bin/env bun
/**
 * hodlmm-fee-harvester.ts
 * Fee harvest timing optimizer for Bitflow HODLMM concentrated liquidity positions.
 * Analyzes accumulated fees across bins, estimates gas costs, and recommends
 * optimal harvest timing — compound, claim, wait, or insufficient.
 *
 * Author: cocoa007 (Fluid Briar) — FastPool CEO
 * Competition: AIBTC x BFF Skills Comp Day 19
 *
 * Read-only. No wallet required. No transactions.
 * All data from Hiro API (on-chain read-only calls) and Bitflow public APIs.
 */

import { Command } from "commander";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const HIRO_API = "https://api.hiro.so";
const DLMM_CONTRACT_ADDR = "SP3B5B8HNE2N01GS0ZTMHPKV5DFN09JC7GBQZNTE";
const DLMM_CONTRACT_NAME = "dlmm-core-v-1-1";
const BFF_APP_BASE = "https://bff.bitflowapis.finance/api/app/v1";

const GAS_COST_STX = 0.01; // Estimated STX cost for a harvest transaction
const SENDER = "SP000000000000000000002Q6VF78"; // Read-only sender (standard)

const DISCLAIMER =
  "Fee accumulation estimates use on-chain snapshots and may not reflect real-time accrual. " +
  "Gas costs are estimates — actual costs depend on network conditions. " +
  "This tool does not execute transactions. Not financial advice.";

// ---------------------------------------------------------------------------
// Clarity value encoding helpers
// ---------------------------------------------------------------------------

/** Encode a uint as a Clarity hex value for read-only calls. */
function encodeUint(n: number): string {
  // Clarity uint is 0x01 prefix + 16-byte big-endian unsigned integer
  const hex = n.toString(16).padStart(32, "0");
  return "0x01" + hex;
}

/** Encode a standard principal as a Clarity hex value. */
function encodePrincipal(address: string): string {
  // For read-only calls, we pass the principal as a string argument
  // The Hiro API accepts Clarity value representations
  // Standard principal: 0x05 + version byte + hash160
  // Simpler: use the string representation format
  return address;
}

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------
interface FeeResult {
  pool: string;
  positionOwner: string;
  fees: { tokenX: number; tokenY: number; totalUsd: number | null };
  gasCostEstimate: number;
  feeToGasRatio: number;
  dailyAccrualEstimate: { tokenX: number; tokenY: number };
  daysUntilOptimalHarvest: number;
  recommendation: "HARVEST_NOW" | "COMPOUND" | "WAIT" | "INSUFFICIENT";
  reasoning: string;
  timestamp: string;
}

interface PoolInfo {
  poolId: string;
  tokenX: { symbol: string; decimals: number; priceUsd: number };
  tokenY: { symbol: string; decimals: number; priceUsd: number };
  binStep: number;
  activeBinId: number;
  feeRate: number; // basis points
  totalFeesTokenX: number;
  totalFeesTokenY: number;
  volume24hUsd: number;
  tvlUsd: number;
}

interface BinFeeData {
  binId: number;
  feeX: number;
  feeY: number;
  reserveX: number;
  reserveY: number;
}

interface AppPool {
  pool_id?: string;
  poolId?: string;
  pool_name?: string;
  name?: string;
  volume_24h?: number;
  volume24h?: number;
  volumeUsd1d?: number;
  tvl?: number;
  tvlUsd?: number;
  fee_bps?: number;
  fee?: number;
  baseFee?: number;
  binStep?: number;
  token_x?: { symbol: string; decimals: number; price_usd?: number; priceUsd?: number };
  token_y?: { symbol: string; decimals: number; price_usd?: number; priceUsd?: number };
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "hodlmm-fee-harvester/1.0",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}: ${await res.text()}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// On-chain read-only calls via Hiro API
// ---------------------------------------------------------------------------
async function callReadOnly(
  functionName: string,
  args: string[]
): Promise<unknown> {
  const url = `${HIRO_API}/v2/contracts/call-read/${DLMM_CONTRACT_ADDR}/${DLMM_CONTRACT_NAME}/${functionName}`;
  const body = { sender: SENDER, arguments: args };
  return fetchJson(url, { method: "POST", body: JSON.stringify(body) });
}

/**
 * Parse a Clarity response value.
 * Handles (ok ...) and (some ...) wrappers, extracts uint/int values.
 */
function parseClarityValue(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const r = result as Record<string, unknown>;

  // Hiro API returns { okay: true, result: "0x..." } or { okay: true, result: "(ok ...)" }
  if ("result" in r) {
    const val = r.result;
    if (typeof val === "string") {
      return parseClarityString(val);
    }
    return val;
  }
  return result;
}

function parseClarityString(s: string): unknown {
  // Handle hex-encoded Clarity values
  if (s.startsWith("0x")) {
    return decodeClarityHex(s);
  }

  // Handle string representations
  const trimmed = s.trim();

  // (ok value)
  const okMatch = trimmed.match(/^\(ok\s+(.+)\)$/);
  if (okMatch) return parseClarityString(okMatch[1]);

  // (some value)
  const someMatch = trimmed.match(/^\(some\s+(.+)\)$/);
  if (someMatch) return parseClarityString(someMatch[1]);

  // (tuple ...)
  if (trimmed.startsWith("(tuple") || trimmed.startsWith("{")) {
    return parseClarityTuple(trimmed);
  }

  // uint
  const uintMatch = trimmed.match(/^u(\d+)$/);
  if (uintMatch) return parseInt(uintMatch[1]);

  // int
  const intMatch = trimmed.match(/^(-?\d+)$/);
  if (intMatch) return parseInt(intMatch[1]);

  // none
  if (trimmed === "none") return null;

  // true/false
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  return trimmed;
}

function parseClarityTuple(s: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  // Simple tuple parser: extract key-value pairs
  // Format: { key1: value1, key2: value2 } or (tuple (key1 value1) (key2 value2))
  const cleaned = s.replace(/^\{|\}$/g, "").replace(/^\(tuple\s*/, "").replace(/\)$/, "");

  // Match key: value pairs
  const kvRegex = /(\w[\w-]*)\s*:\s*([^,}]+)/g;
  let match;
  while ((match = kvRegex.exec(cleaned)) !== null) {
    result[match[1]] = parseClarityString(match[2].trim());
  }

  // Also try (key value) format
  const tupleRegex = /\((\w[\w-]*)\s+([^)]+)\)/g;
  while ((match = tupleRegex.exec(cleaned)) !== null) {
    result[match[1]] = parseClarityString(match[2].trim());
  }

  return result;
}

function decodeClarityHex(hex: string): unknown {
  // Remove 0x prefix
  const bytes = hex.slice(2);
  if (bytes.length === 0) return null;

  const typeId = parseInt(bytes.slice(0, 2), 16);

  switch (typeId) {
    case 0x00: // int
    case 0x01: { // uint
      const numHex = bytes.slice(2, 34);
      // Parse as BigInt then convert to number if safe
      const val = BigInt("0x" + numHex);
      if (val <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(val);
      return val.toString();
    }
    case 0x03: // true
      return true;
    case 0x04: // false
      return false;
    case 0x07: // ok
      return decodeClarityHex("0x" + bytes.slice(2));
    case 0x08: // err
      return { error: decodeClarityHex("0x" + bytes.slice(2)) };
    case 0x09: // none
      return null;
    case 0x0a: // some
      return decodeClarityHex("0x" + bytes.slice(2));
    case 0x0c: { // tuple
      // Tuple: 0x0c + 4-byte count + entries
      const count = parseInt(bytes.slice(2, 10), 16);
      const result: Record<string, unknown> = {};
      let offset = 10;
      for (let i = 0; i < count; i++) {
        // Key: 1-byte name length + name bytes
        const nameLen = parseInt(bytes.slice(offset, offset + 2), 16);
        offset += 2;
        const nameBytes = bytes.slice(offset, offset + nameLen * 2);
        const name = Buffer.from(nameBytes, "hex").toString("ascii");
        offset += nameLen * 2;
        // Value: recursively decode
        const { value, consumed } = decodeClarityHexWithLength("0x" + bytes.slice(offset));
        result[name] = value;
        offset += consumed;
      }
      return result;
    }
    default:
      return hex; // Return raw hex if we can't decode
  }
}

function decodeClarityHexWithLength(hex: string): { value: unknown; consumed: number } {
  const bytes = hex.slice(2);
  const typeId = parseInt(bytes.slice(0, 2), 16);

  switch (typeId) {
    case 0x00: // int
    case 0x01: { // uint
      const numHex = bytes.slice(2, 34);
      const val = BigInt("0x" + numHex);
      const value = val <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(val) : val.toString();
      return { value, consumed: 34 };
    }
    case 0x03: // true
      return { value: true, consumed: 2 };
    case 0x04: // false
      return { value: false, consumed: 2 };
    case 0x07: // ok
    case 0x08: // err
    case 0x0a: { // some
      const inner = decodeClarityHexWithLength("0x" + bytes.slice(2));
      return { value: inner.value, consumed: 2 + inner.consumed };
    }
    case 0x09: // none
      return { value: null, consumed: 2 };
    case 0x0c: { // tuple
      const count = parseInt(bytes.slice(2, 10), 16);
      const result: Record<string, unknown> = {};
      let offset = 10;
      for (let i = 0; i < count; i++) {
        const nameLen = parseInt(bytes.slice(offset, offset + 2), 16);
        offset += 2;
        const nameBytes = bytes.slice(offset, offset + nameLen * 2);
        const name = Buffer.from(nameBytes, "hex").toString("ascii");
        offset += nameLen * 2;
        const inner = decodeClarityHexWithLength("0x" + bytes.slice(offset));
        result[name] = inner.value;
        offset += inner.consumed;
      }
      return { value: result, consumed: offset };
    }
    default:
      return { value: hex, consumed: bytes.length };
  }
}

// ---------------------------------------------------------------------------
// Bitflow App API helpers
// ---------------------------------------------------------------------------
async function fetchAppPools(): Promise<AppPool[]> {
  const data = await fetchJson(`${BFF_APP_BASE}/pools`);
  if (Array.isArray(data)) return data as AppPool[];
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.data)) return d.data as AppPool[];
  if (Array.isArray(d.pools)) return d.pools as AppPool[];
  throw new Error("Unexpected pools response shape");
}

function getPoolId(pool: AppPool): string {
  return (pool.poolId ?? pool.pool_id ?? "") as string;
}

function getPoolName(pool: AppPool): string {
  return (pool.pool_name ?? pool.name ?? getPoolId(pool)) as string;
}

function getVolume24h(pool: AppPool): number {
  return (pool.volumeUsd1d ?? pool.volume_24h ?? pool.volume24h ?? 0) as number;
}

function getTvl(pool: AppPool): number {
  return (pool.tvlUsd ?? pool.tvl ?? 0) as number;
}

function getFeeBps(pool: AppPool): number {
  const raw = pool.baseFee ?? pool.fee_bps ?? pool.fee ?? 0.003;
  if (typeof raw === "number" && raw < 1) return Math.round(raw * 10000);
  return raw as number;
}

function getTokenXPrice(pool: AppPool): number {
  if (!pool.token_x) return 0;
  return (pool.token_x.price_usd ?? (pool.token_x as Record<string, unknown>).priceUsd ?? 0) as number;
}

function getTokenYPrice(pool: AppPool): number {
  if (!pool.token_y) return 0;
  return (pool.token_y.price_usd ?? (pool.token_y as Record<string, unknown>).priceUsd ?? 0) as number;
}

function getTokenXDecimals(pool: AppPool): number {
  return pool.token_x?.decimals ?? 6;
}

function getTokenYDecimals(pool: AppPool): number {
  return pool.token_y?.decimals ?? 6;
}

function getTokenXSymbol(pool: AppPool): string {
  return pool.token_x?.symbol ?? "tokenX";
}

function getTokenYSymbol(pool: AppPool): string {
  return pool.token_y?.symbol ?? "tokenY";
}

// ---------------------------------------------------------------------------
// On-chain data fetchers
// ---------------------------------------------------------------------------

/**
 * Fetch position data for a given owner in a pool.
 * Calls get-position on the DLMM contract.
 */
async function fetchPosition(
  poolId: number,
  owner: string
): Promise<Record<string, unknown> | null> {
  try {
    const result = await callReadOnly("get-position", [
      encodeUint(poolId),
      owner,
    ]);
    const parsed = parseClarityValue(result);
    if (parsed === null || (typeof parsed === "object" && "error" in (parsed as Record<string, unknown>))) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Fetch bin data for a specific bin in a pool.
 * Calls get-bin on the DLMM contract.
 */
async function fetchBin(
  poolId: number,
  binId: number
): Promise<Record<string, unknown> | null> {
  try {
    const result = await callReadOnly("get-bin", [
      encodeUint(poolId),
      encodeUint(binId),
    ]);
    const parsed = parseClarityValue(result);
    if (parsed === null) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Fetch pool parameters.
 * Calls get-pool on the DLMM contract.
 */
async function fetchPool(poolId: number): Promise<Record<string, unknown> | null> {
  try {
    const result = await callReadOnly("get-pool", [encodeUint(poolId)]);
    const parsed = parseClarityValue(result);
    if (parsed === null) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Fetch pool reserves.
 * Calls get-pool-reserves on the DLMM contract.
 */
async function fetchPoolReserves(poolId: number): Promise<Record<string, unknown> | null> {
  try {
    const result = await callReadOnly("get-pool-reserves", [encodeUint(poolId)]);
    const parsed = parseClarityValue(result);
    if (parsed === null) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round6(n: number): number {
  return Math.round(n * 1000000) / 1000000;
}

function safeNum(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Fee estimation logic
// ---------------------------------------------------------------------------

/**
 * Estimate accumulated fees from on-chain bin data.
 * Each bin tracks fee growth; a position's unclaimed fees are proportional
 * to its liquidity share in each bin times the fee growth since last claim.
 *
 * Since we may not have the exact last-claim checkpoint, we use the bin's
 * current fee accumulators as an upper-bound estimate. The Bitflow App API
 * pool data provides volume/TVL which we use for daily accrual estimation.
 */
function estimateFeesFromPool(
  volume24hUsd: number,
  feeBps: number,
  tvlUsd: number,
  positionSharePct: number
): { dailyFeeUsd: number; dailyFeeTokenX: number; dailyFeeTokenY: number } {
  if (tvlUsd === 0) return { dailyFeeUsd: 0, dailyFeeTokenX: 0, dailyFeeTokenY: 0 };

  // Daily fees generated by the entire pool
  const poolDailyFeeUsd = volume24hUsd * (feeBps / 10000);

  // Position's share of daily fees (assuming proportional to TVL share)
  const positionDailyFeeUsd = poolDailyFeeUsd * (positionSharePct / 100);

  // Split 50/50 between tokenX and tokenY (approximation)
  return {
    dailyFeeUsd: round6(positionDailyFeeUsd),
    dailyFeeTokenX: round6(positionDailyFeeUsd / 2),
    dailyFeeTokenY: round6(positionDailyFeeUsd / 2),
  };
}

/**
 * Given accumulated fees and gas cost, determine the harvest recommendation.
 *
 * Thresholds:
 *   - INSUFFICIENT: totalFeeUsd < gasCostUsd (fees don't cover gas)
 *   - WAIT: feeToGasRatio < 5 (fees are too small relative to gas)
 *   - COMPOUND: feeToGasRatio >= 5 AND feeToGasRatio < 20 (worth reinvesting)
 *   - HARVEST_NOW: feeToGasRatio >= 20 (clear profit to claim)
 */
function getRecommendation(
  totalFeeUsd: number,
  gasCostUsd: number,
  daysAccrued: number
): {
  recommendation: FeeResult["recommendation"];
  reasoning: string;
  daysUntilOptimal: number;
} {
  if (gasCostUsd <= 0) gasCostUsd = 0.001; // Avoid division by zero

  const ratio = totalFeeUsd / gasCostUsd;

  if (ratio < 1) {
    // Fees don't even cover gas
    const dailyRate = daysAccrued > 0 ? totalFeeUsd / daysAccrued : 0;
    const daysNeeded = dailyRate > 0 ? Math.ceil(gasCostUsd / dailyRate) : 999;
    return {
      recommendation: "INSUFFICIENT",
      reasoning:
        `Accumulated fees ($${totalFeeUsd.toFixed(4)}) are less than estimated gas cost ($${gasCostUsd.toFixed(4)}). ` +
        `Wait approximately ${daysNeeded} days for fees to exceed gas costs.`,
      daysUntilOptimal: daysNeeded,
    };
  }

  if (ratio < 5) {
    const dailyRate = daysAccrued > 0 ? totalFeeUsd / daysAccrued : totalFeeUsd;
    const targetFee = gasCostUsd * 5;
    const daysNeeded = dailyRate > 0 ? Math.ceil((targetFee - totalFeeUsd) / dailyRate) : 30;
    return {
      recommendation: "WAIT",
      reasoning:
        `Fee-to-gas ratio is ${ratio.toFixed(1)}x (target: 5x minimum). ` +
        `Fees are $${totalFeeUsd.toFixed(4)} vs $${gasCostUsd.toFixed(4)} gas. ` +
        `Wait ~${Math.max(1, daysNeeded)} more days for an efficient harvest.`,
      daysUntilOptimal: Math.max(1, daysNeeded),
    };
  }

  if (ratio < 20) {
    return {
      recommendation: "COMPOUND",
      reasoning:
        `Fee-to-gas ratio is ${ratio.toFixed(1)}x — sufficient for a cost-effective harvest. ` +
        `Consider compounding (reinvesting fees back into the position) to maximize returns. ` +
        `Total fees: $${totalFeeUsd.toFixed(4)}, gas estimate: $${gasCostUsd.toFixed(4)}.`,
      daysUntilOptimal: 0,
    };
  }

  // ratio >= 20
  return {
    recommendation: "HARVEST_NOW",
    reasoning:
      `Fee-to-gas ratio is ${ratio.toFixed(1)}x — well above the 20x threshold for efficient harvesting. ` +
      `Accumulated fees ($${totalFeeUsd.toFixed(4)}) significantly exceed gas costs ($${gasCostUsd.toFixed(4)}). ` +
      `Harvest and either compound or withdraw.`,
    daysUntilOptimal: 0,
  };
}

// ---------------------------------------------------------------------------
// Output helper
// ---------------------------------------------------------------------------
function output(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdDoctor(): Promise<void> {
  const checks: Array<{ check: string; status: "ok" | "error"; detail: string }> = [];

  // Check Hiro API
  try {
    const result = await callReadOnly("get-pool", [encodeUint(1)]);
    const parsed = parseClarityValue(result);
    checks.push({
      check: "hiro_api_dlmm",
      status: parsed !== null ? "ok" : "error",
      detail: parsed !== null ? "DLMM contract reachable via Hiro API" : "DLMM contract returned null",
    });
  } catch (e) {
    checks.push({ check: "hiro_api_dlmm", status: "error", detail: String(e) });
  }

  // Check Bitflow App API
  try {
    const pools = await fetchAppPools();
    const dlmm = pools.filter((p) => {
      const id = getPoolId(p);
      return id.startsWith("dlmm") || id.includes("hodlmm");
    });
    checks.push({
      check: "bitflow_app_pools",
      status: "ok",
      detail: `${pools.length} pools, ${dlmm.length} DLMM`,
    });
  } catch (e) {
    checks.push({ check: "bitflow_app_pools", status: "error", detail: String(e) });
  }

  // Check Hiro API general connectivity
  try {
    const info = await fetchJson(`${HIRO_API}/v2/info`);
    const stxHeight = (info as Record<string, unknown>).stacks_tip_height ?? "unknown";
    checks.push({
      check: "hiro_api_general",
      status: "ok",
      detail: `Stacks tip height: ${stxHeight}`,
    });
  } catch (e) {
    checks.push({ check: "hiro_api_general", status: "error", detail: String(e) });
  }

  const allOk = checks.every((c) => c.status === "ok");
  output({
    status: allOk ? "ready" : "degraded",
    checks,
    message: allOk
      ? "All data sources reachable. Ready to analyze fee harvesting."
      : "Some data sources unavailable — fee estimates may be incomplete.",
  });
}

async function cmdRun(opts: {
  pool: string;
  positionOwner: string;
  daysHeld?: number;
  stxPriceUsd?: number;
}): Promise<void> {
  const { pool, positionOwner } = opts;
  const daysHeld = opts.daysHeld ?? 7; // Default assumption: position held for 7 days
  const stxPriceUsd = opts.stxPriceUsd ?? 0.5; // Default STX price estimate

  // Extract numeric pool ID if prefixed with "dlmm_"
  let poolNumeric: number;
  const numericMatch = pool.match(/(\d+)/);
  if (numericMatch) {
    poolNumeric = parseInt(numericMatch[1]);
  } else {
    output({ error: `Cannot extract numeric pool ID from "${pool}". Expected format: dlmm_1 or just 1.` });
    process.exit(1);
  }

  // Fetch on-chain pool data and Bitflow app data in parallel
  let onChainPool: Record<string, unknown> | null = null;
  let onChainReserves: Record<string, unknown> | null = null;
  let appPool: AppPool | undefined;

  try {
    const [poolData, reserves, appPools] = await Promise.all([
      fetchPool(poolNumeric),
      fetchPoolReserves(poolNumeric),
      fetchAppPools(),
    ]);

    onChainPool = poolData;
    onChainReserves = reserves;
    appPool = appPools.find((p) => getPoolId(p) === pool || getPoolId(p) === `dlmm_${poolNumeric}`);

    if (!appPool) {
      // Try matching by numeric suffix
      appPool = appPools.find((p) => {
        const id = getPoolId(p);
        return id.includes(String(poolNumeric)) && (id.startsWith("dlmm") || id.includes("hodlmm"));
      });
    }
  } catch (e) {
    output({ error: `Failed to fetch pool data: ${String(e)}` });
    process.exit(1);
  }

  if (!onChainPool && !appPool) {
    output({ error: `Pool ${pool} not found on-chain or in Bitflow API.` });
    process.exit(1);
  }

  // Extract pool parameters
  const feeBps = appPool ? getFeeBps(appPool) : safeNum((onChainPool as Record<string, unknown>)?.["base-fee"] ?? 30);
  const volume24h = appPool ? getVolume24h(appPool) : 0;
  const tvlUsd = appPool ? getTvl(appPool) : 0;
  const poolName = appPool ? getPoolName(appPool) : `dlmm_${poolNumeric}`;

  const tokenXSymbol = appPool ? getTokenXSymbol(appPool) : "tokenX";
  const tokenYSymbol = appPool ? getTokenYSymbol(appPool) : "tokenY";
  const tokenXPrice = appPool ? getTokenXPrice(appPool) : 0;
  const tokenYPrice = appPool ? getTokenYPrice(appPool) : 0;
  const tokenXDecimals = appPool ? getTokenXDecimals(appPool) : 6;
  const tokenYDecimals = appPool ? getTokenYDecimals(appPool) : 6;

  // Try to fetch on-chain position data
  let positionData: Record<string, unknown> | null = null;
  try {
    positionData = await fetchPosition(poolNumeric, positionOwner);
  } catch {
    // Non-fatal — we'll estimate from pool-level data
  }

  // Estimate position's share of the pool
  let positionSharePct = 1.0; // Default: assume 1% of pool
  let feeX = 0;
  let feeY = 0;
  let positionBins: number[] = [];

  if (positionData) {
    // Extract bin IDs from position
    const bins = positionData["bin-ids"] ?? positionData["binIds"] ?? positionData["bins"];
    if (Array.isArray(bins)) {
      positionBins = bins.map((b: unknown) => safeNum(b));
    }

    // Extract liquidity share if available
    const liqShare = positionData["liquidity-share"] ?? positionData["share"];
    if (liqShare !== undefined) {
      positionSharePct = safeNum(liqShare);
    }

    // Extract unclaimed fees if directly available
    const unclaimedX = positionData["fee-x"] ?? positionData["feeX"] ?? positionData["unclaimed-fee-x"];
    const unclaimedY = positionData["fee-y"] ?? positionData["feeY"] ?? positionData["unclaimed-fee-y"];
    if (unclaimedX !== undefined) feeX = safeNum(unclaimedX);
    if (unclaimedY !== undefined) feeY = safeNum(unclaimedY);
  }

  // If we have bin data, fetch individual bin fee info
  if (positionBins.length > 0 && feeX === 0 && feeY === 0) {
    // Fetch a sample of bins (limit to 10 to avoid rate limits)
    const binsToFetch = positionBins.slice(0, 10);
    const binResults = await Promise.all(
      binsToFetch.map((binId) => fetchBin(poolNumeric, binId))
    );

    for (const binData of binResults) {
      if (!binData) continue;
      // Accumulate fee data from bins
      const bfx = safeNum(binData["accum-fee-x"] ?? binData["fee-x"] ?? binData["feeX"] ?? 0);
      const bfy = safeNum(binData["accum-fee-y"] ?? binData["fee-y"] ?? binData["feeY"] ?? 0);
      feeX += bfx;
      feeY += bfy;
    }

    // Scale fees by position share if we have bin-level data
    if (positionSharePct < 100) {
      feeX *= positionSharePct / 100;
      feeY *= positionSharePct / 100;
    }
  }

  // Convert raw fees to human-readable amounts
  const feeXHuman = feeX / Math.pow(10, tokenXDecimals);
  const feeYHuman = feeY / Math.pow(10, tokenYDecimals);

  // Calculate USD value of fees
  let totalFeeUsd: number | null = null;
  if (tokenXPrice > 0 || tokenYPrice > 0) {
    totalFeeUsd = round6(feeXHuman * tokenXPrice + feeYHuman * tokenYPrice);
  }

  // If no on-chain fee data, estimate from volume/TVL
  let estimatedFromVolume = false;
  if (feeX === 0 && feeY === 0 && volume24h > 0 && tvlUsd > 0) {
    estimatedFromVolume = true;
    const estimated = estimateFeesFromPool(volume24h, feeBps, tvlUsd, positionSharePct);
    // Estimate accumulated fees over the hold period
    totalFeeUsd = round6(estimated.dailyFeeUsd * daysHeld);
    if (tokenXPrice > 0) {
      feeX = (totalFeeUsd / 2) / tokenXPrice;
    }
    if (tokenYPrice > 0) {
      feeY = (totalFeeUsd / 2) / tokenYPrice;
    }
  }

  // Gas cost in USD
  const gasCostUsd = round6(GAS_COST_STX * stxPriceUsd);

  // Fee-to-gas ratio
  const effectiveFeeUsd = totalFeeUsd ?? 0;
  const feeToGasRatio = gasCostUsd > 0 ? round4(effectiveFeeUsd / gasCostUsd) : 0;

  // Daily accrual estimate
  const dailyAccrual = estimateFeesFromPool(volume24h, feeBps, tvlUsd, positionSharePct);

  // Days until optimal harvest (20x gas ratio threshold)
  const targetFeeUsd = gasCostUsd * 20;
  let daysUntilOptimal = 0;
  if (effectiveFeeUsd < targetFeeUsd && dailyAccrual.dailyFeeUsd > 0) {
    daysUntilOptimal = Math.ceil((targetFeeUsd - effectiveFeeUsd) / dailyAccrual.dailyFeeUsd);
  }

  // Get recommendation
  const { recommendation, reasoning, daysUntilOptimal: recDays } = getRecommendation(
    effectiveFeeUsd,
    gasCostUsd,
    daysHeld
  );

  const finalDaysUntilOptimal = recommendation === "HARVEST_NOW" || recommendation === "COMPOUND"
    ? 0
    : Math.max(daysUntilOptimal, recDays);

  // Build output
  const result: FeeResult = {
    pool: poolName,
    positionOwner,
    fees: {
      tokenX: round6(feeXHuman || feeX),
      tokenY: round6(feeYHuman || feeY),
      totalUsd: totalFeeUsd,
    },
    gasCostEstimate: gasCostUsd,
    feeToGasRatio,
    dailyAccrualEstimate: {
      tokenX: round6(dailyAccrual.dailyFeeTokenX / (tokenXPrice || 1)),
      tokenY: round6(dailyAccrual.dailyFeeTokenY / (tokenYPrice || 1)),
    },
    daysUntilOptimalHarvest: finalDaysUntilOptimal,
    recommendation,
    reasoning,
    timestamp: new Date().toISOString(),
  };

  const warnings: string[] = [];
  if (estimatedFromVolume) {
    warnings.push(
      "Fee amounts estimated from pool volume/TVL (no on-chain position fee data available). " +
      "Actual accumulated fees may differ."
    );
  }
  if (!positionData) {
    warnings.push(
      "Could not fetch on-chain position data. Fee estimates are based on pool-level metrics " +
      `assuming a ${positionSharePct}% pool share over ${daysHeld} days held.`
    );
  }
  if (tokenXPrice === 0 && tokenYPrice === 0) {
    warnings.push("Token prices unavailable — USD values are estimates.");
  }
  if (volume24h < 1000) {
    warnings.push(`Low 24h volume ($${volume24h.toLocaleString()}). Daily accrual estimates may be unreliable.`);
  }

  output({
    status: "success",
    ...result,
    pool_details: {
      pool_id: pool,
      pool_name: poolName,
      fee_bps: feeBps,
      volume_24h_usd: volume24h,
      tvl_usd: tvlUsd,
      token_x: { symbol: tokenXSymbol, price_usd: tokenXPrice },
      token_y: { symbol: tokenYSymbol, price_usd: tokenYPrice },
      position_share_pct: positionSharePct,
      days_held_estimate: daysHeld,
    },
    gas_details: {
      gas_cost_stx: GAS_COST_STX,
      stx_price_usd: stxPriceUsd,
      gas_cost_usd: gasCostUsd,
    },
    thresholds: {
      insufficient: "fee/gas < 1x",
      wait: "fee/gas < 5x",
      compound: "fee/gas 5x-20x",
      harvest_now: "fee/gas >= 20x",
    },
    warnings,
    disclaimer: DISCLAIMER,
  });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const program = new Command();

program
  .name("hodlmm-fee-harvester")
  .description("Fee harvest timing optimizer for Bitflow HODLMM concentrated liquidity positions.")
  .version("1.0.0");

program
  .command("doctor")
  .description("Check Hiro API and Bitflow API connectivity")
  .action(async () => {
    try {
      await cmdDoctor();
    } catch (e) {
      output({ error: String(e) });
      process.exit(1);
    }
  });

program
  .command("install-packs")
  .description("Install required packages (no external dependencies needed)")
  .action(() => {
    output({
      status: "ok",
      message: "No external packages required. Uses built-in fetch and bun runtime.",
      dependencies: ["commander (peer — provided by bun)"],
    });
  });

program
  .command("run")
  .description("Analyze accumulated fees and recommend harvest timing")
  .requiredOption("--pool <id>", "Pool ID (e.g. dlmm_1)")
  .requiredOption("--position-owner <address>", "STX address of the position owner")
  .option("--days-held <n>", "Estimated days position has been held (for accrual estimation)", "7")
  .option("--stx-price <usd>", "STX price in USD for gas cost calculation", "0.5")
  .action(async (opts) => {
    try {
      await cmdRun({
        pool: opts.pool,
        positionOwner: opts.positionOwner,
        daysHeld: parseFloat(opts.daysHeld) || 7,
        stxPriceUsd: parseFloat(opts.stxPrice) || 0.5,
      });
    } catch (e) {
      output({ error: String(e) });
      process.exit(1);
    }
  });

program.parse(process.argv);
