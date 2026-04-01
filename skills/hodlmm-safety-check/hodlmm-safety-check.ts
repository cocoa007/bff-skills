#!/usr/bin/env bun
/**
 * hodlmm-safety-check — Pre-deployment security scanner for Bitflow HODLMM pools.
 *
 * Fetches Clarity source for token contracts in HODLMM pools and scans for
 * common vulnerability patterns: admin centralization, unchecked mints,
 * missing access controls, proxy patterns, and more.
 *
 * Read-only. No wallet required. No transactions submitted.
 *
 * Usage:
 *   bun run skills/hodlmm-safety-check/hodlmm-safety-check.ts doctor
 *   bun run skills/hodlmm-safety-check/hodlmm-safety-check.ts check --pool-id dlmm_1
 *   bun run skills/hodlmm-safety-check/hodlmm-safety-check.ts scan [--min-tvl 1000]
 *   bun run skills/hodlmm-safety-check/hodlmm-safety-check.ts audit --contract SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sbtc-token
 */

import { Command } from "commander";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BITFLOW_APP_API = "https://bff.bitflowapis.finance/api/app/v1";
const HIRO_API = "https://api.hiro.so";
const FETCH_TIMEOUT_MS = 30_000;
const NETWORK = "mainnet";

// Known safe tokens that don't need deep analysis
const KNOWN_SAFE_TOKENS = new Set([
  "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token",
  "SM3KNVZS30WM7F89SXKVVFY4SN9RMPZZ9FX929N0V.sbtc-token",
  "SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sbtc-token",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AppPool {
  poolId: string;
  tvlUsd: number;
  tokens: {
    tokenX: { symbol: string; contract?: string; priceUsd: number };
    tokenY: { symbol: string; contract?: string; priceUsd: number };
  };
}

interface AppPoolsResponse {
  data: AppPool[];
}

type Severity = "critical" | "high" | "medium" | "low" | "info";
type Verdict = "SAFE" | "CAUTION" | "UNSAFE" | "UNKNOWN";

interface Finding {
  severity: Severity;
  category: string;
  description: string;
  line?: number;
  snippet?: string;
}

interface ContractAnalysis {
  contract: string;
  sourceAvailable: boolean;
  findings: Finding[];
  score: number; // 0-100, higher = safer
  verdict: Verdict;
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function out(data: Record<string, unknown>): void {
  console.log(JSON.stringify(data, null, 2));
}

function fail(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  console.log(JSON.stringify({ error: message }, null, 2));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${url}`);
  return res.json() as Promise<T>;
}

async function getAllPools(): Promise<AppPool[]> {
  const data = await fetchJson<AppPoolsResponse>(`${BITFLOW_APP_API}/pools`);
  return data.data ?? [];
}

async function getContractSource(
  contractAddr: string,
  contractName: string
): Promise<string | null> {
  try {
    const data = await fetchJson<{ source: string }>(
      `${HIRO_API}/v2/contracts/source/${contractAddr}/${contractName}`
    );
    return data.source ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Clarity static analysis patterns
// ---------------------------------------------------------------------------

function analyzeClarity(source: string, contractId: string): Finding[] {
  const findings: Finding[] = [];
  const lines = source.split("\n");

  // Track defined functions and their access patterns
  const publicFns: string[] = [];
  const hasOwnerCheck = new Map<string, boolean>();

  let currentFn = "";
  let currentFnIsPublic = false;
  let fnHasOwnerCheck = false;
  let nestingDepth = 0;
  let maxNesting = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNum = i + 1;
    const trimmed = line.trim();

    // Track nesting
    const opens = (trimmed.match(/\(/g) || []).length;
    const closes = (trimmed.match(/\)/g) || []).length;
    nestingDepth += opens - closes;
    if (nestingDepth > maxNesting) maxNesting = nestingDepth;

    // Track public function definitions
    if (trimmed.startsWith("(define-public")) {
      const match = trimmed.match(/\(define-public\s+\((\S+)/);
      if (match) {
        currentFn = match[1]!;
        currentFnIsPublic = true;
        fnHasOwnerCheck = false;
        publicFns.push(currentFn);
      }
    }

    // Track owner/admin checks within functions
    if (
      currentFnIsPublic &&
      (trimmed.includes("contract-caller") ||
        trimmed.includes("tx-sender") ||
        trimmed.includes("is-eq") ||
        trimmed.includes("contract-owner"))
    ) {
      fnHasOwnerCheck = true;
    }

    // End of function (heuristic: back to depth 0)
    if (currentFnIsPublic && nestingDepth <= 0) {
      hasOwnerCheck.set(currentFn, fnHasOwnerCheck);
      currentFnIsPublic = false;
      currentFn = "";
    }

    // --- Pattern: Unchecked ft-mint? in public function ---
    if (currentFnIsPublic && trimmed.includes("ft-mint?")) {
      // Check if there's an owner/sender check nearby (within 10 lines above)
      const contextStart = Math.max(0, i - 10);
      const context = lines.slice(contextStart, i + 1).join("\n");
      const hasGuard =
        context.includes("contract-caller") ||
        context.includes("tx-sender") ||
        context.includes("is-eq");

      if (!hasGuard) {
        findings.push({
          severity: "critical",
          category: "unchecked-mint",
          description: `ft-mint? in public function '${currentFn}' without caller validation`,
          line: lineNum,
          snippet: trimmed.slice(0, 100),
        });
      }
    }

    // --- Pattern: Unchecked ft-burn? in public function ---
    if (currentFnIsPublic && trimmed.includes("ft-burn?")) {
      const contextStart = Math.max(0, i - 10);
      const context = lines.slice(contextStart, i + 1).join("\n");
      const hasGuard =
        context.includes("contract-caller") ||
        context.includes("tx-sender");

      if (!hasGuard) {
        findings.push({
          severity: "high",
          category: "unchecked-burn",
          description: `ft-burn? in public function '${currentFn}' without caller validation`,
          line: lineNum,
          snippet: trimmed.slice(0, 100),
        });
      }
    }

    // --- Pattern: Admin centralization (owner can set critical vars) ---
    if (
      trimmed.includes("var-set") &&
      currentFnIsPublic &&
      (currentFn.includes("set-owner") ||
        currentFn.includes("set-admin") ||
        currentFn.includes("set-contract-owner") ||
        currentFn.includes("transfer-ownership"))
    ) {
      // Check if it requires multisig or timelock
      const contextStart = Math.max(0, i - 15);
      const context = lines.slice(contextStart, i + 1).join("\n");
      const hasMultisig =
        context.includes("multisig") || context.includes("timelock");

      if (!hasMultisig) {
        findings.push({
          severity: "critical",
          category: "admin-centralization",
          description: `Ownership transfer in '${currentFn}' without multisig or timelock protection`,
          line: lineNum,
          snippet: trimmed.slice(0, 100),
        });
      }
    }

    // --- Pattern: Proxy/upgrade via mutable contract reference ---
    if (
      trimmed.includes("define-data-var") &&
      trimmed.includes("principal")
    ) {
      const match = trimmed.match(
        /define-data-var\s+(\S+)\s+principal/
      );
      if (match) {
        const varName = match[1]!;
        // Check if this var is used in contract-call? (proxy pattern)
        const fullSource = source;
        if (
          fullSource.includes(`var-get ${varName}`) &&
          fullSource.includes("contract-call?")
        ) {
          findings.push({
            severity: "medium",
            category: "proxy-pattern",
            description: `Mutable principal var '${varName}' may be used as upgradeable proxy`,
            line: lineNum,
            snippet: trimmed.slice(0, 100),
          });
        }
      }
    }

    // --- Pattern: unwrap-panic (missing error codes) ---
    if (trimmed.includes("unwrap-panic")) {
      findings.push({
        severity: "low",
        category: "missing-error-handling",
        description: "unwrap-panic used instead of unwrap! with error code",
        line: lineNum,
        snippet: trimmed.slice(0, 100),
      });
    }

    // --- Pattern: Hardcoded principal (potential backdoor) ---
    const principalMatch = trimmed.match(/'(SP[A-Z0-9]{38,})/g);
    if (principalMatch && currentFnIsPublic) {
      for (const p of principalMatch) {
        // Skip if it's the contract's own address
        if (!p.includes(contractId.split(".")[0]!)) {
          findings.push({
            severity: "info",
            category: "hardcoded-principal",
            description: `Hardcoded principal ${p.slice(0, 20)}... in public function '${currentFn}'`,
            line: lineNum,
          });
        }
      }
    }

    // --- Pattern: ft-transfer? without sender validation ---
    if (currentFnIsPublic && trimmed.includes("ft-transfer?")) {
      const contextStart = Math.max(0, i - 5);
      const context = lines.slice(contextStart, i + 1).join("\n");
      const senderChecked =
        context.includes("tx-sender") ||
        context.includes("contract-caller");

      if (!senderChecked) {
        findings.push({
          severity: "high",
          category: "unchecked-transfer",
          description: `ft-transfer? in '${currentFn}' without tx-sender/contract-caller check`,
          line: lineNum,
          snippet: trimmed.slice(0, 100),
        });
      }
    }
  }

  // --- Global patterns ---

  // Check for SIP-010 trait implementation
  if (
    !source.includes("impl-trait") ||
    !source.includes("sip-010")
  ) {
    // Not necessarily bad, but worth noting
    if (
      source.includes("ft-mint?") ||
      source.includes("ft-transfer?")
    ) {
      findings.push({
        severity: "medium",
        category: "missing-trait",
        description:
          "Token contract does not implement SIP-010 trait — may not be standard-compliant",
      });
    }
  }

  // Code complexity check
  if (publicFns.length > 30) {
    findings.push({
      severity: "info",
      category: "complexity",
      description: `${publicFns.length} public functions — high surface area increases audit difficulty`,
    });
  }

  if (maxNesting > 15) {
    findings.push({
      severity: "info",
      category: "complexity",
      description: `Maximum nesting depth of ${maxNesting} — complex logic harder to reason about`,
    });
  }

  // Check for no-owner-check public mutable functions
  for (const [fn, hasCheck] of hasOwnerCheck) {
    if (
      !hasCheck &&
      (fn.includes("set-") || fn.includes("update-") || fn.includes("admin"))
    ) {
      findings.push({
        severity: "high",
        category: "missing-access-control",
        description: `Public state-mutating function '${fn}' has no caller validation`,
      });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 30,
  high: 15,
  medium: 5,
  low: 2,
  info: 0,
};

function computeScore(findings: Finding[]): number {
  const deductions = findings.reduce(
    (sum, f) => sum + SEVERITY_WEIGHTS[f.severity],
    0
  );
  return Math.max(0, 100 - deductions);
}

function scoreToVerdict(score: number): Verdict {
  if (score >= 80) return "SAFE";
  if (score >= 50) return "CAUTION";
  return "UNSAFE";
}

// ---------------------------------------------------------------------------
// Contract analysis pipeline
// ---------------------------------------------------------------------------

async function analyzeContract(contractId: string): Promise<ContractAnalysis> {
  // Known safe tokens get a pass
  if (KNOWN_SAFE_TOKENS.has(contractId)) {
    return {
      contract: contractId,
      sourceAvailable: true,
      findings: [],
      score: 100,
      verdict: "SAFE",
    };
  }

  const parts = contractId.split(".");
  if (parts.length !== 2) {
    return {
      contract: contractId,
      sourceAvailable: false,
      findings: [
        {
          severity: "high",
          category: "invalid-contract-id",
          description: `Invalid contract ID format: ${contractId}`,
        },
      ],
      score: 0,
      verdict: "UNKNOWN",
    };
  }

  const [addr, name] = parts as [string, string];
  const source = await getContractSource(addr, name);

  if (!source) {
    return {
      contract: contractId,
      sourceAvailable: false,
      findings: [
        {
          severity: "medium",
          category: "source-unavailable",
          description:
            "Contract source not available on Hiro API — cannot verify safety",
        },
      ],
      score: 50,
      verdict: "UNKNOWN",
    };
  }

  const findings = analyzeClarity(source, contractId);
  const score = computeScore(findings);
  const verdict =
    findings.some((f) => f.severity === "critical")
      ? "UNSAFE"
      : scoreToVerdict(score);

  return {
    contract: contractId,
    sourceAvailable: true,
    findings,
    score,
    verdict,
  };
}

// ---------------------------------------------------------------------------
// Pool token extraction
// ---------------------------------------------------------------------------

function extractContractIds(pool: AppPool): string[] {
  const ids: string[] = [];
  const tokenX = pool.tokens?.tokenX;
  const tokenY = pool.tokens?.tokenY;

  if (tokenX?.contract) ids.push(tokenX.contract);
  if (tokenY?.contract) ids.push(tokenY.contract);

  return ids;
}

// ---------------------------------------------------------------------------
// Subcommand: doctor
// ---------------------------------------------------------------------------

async function doctor(): Promise<void> {
  const checks: Array<{
    check: string;
    status: "ok" | "fail";
    detail: string;
  }> = [];

  // Bitflow API
  try {
    const data = await fetchJson<AppPoolsResponse>(`${BITFLOW_APP_API}/pools`);
    const count = data.data?.length ?? 0;
    checks.push({
      check: "bitflow_app_api",
      status: "ok",
      detail: `${count} pools available`,
    });
  } catch (e) {
    checks.push({
      check: "bitflow_app_api",
      status: "fail",
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // Hiro API
  try {
    const data = await fetchJson<{ source: string }>(
      `${HIRO_API}/v2/contracts/source/SP000000000000000000002Q6VF78/pox-4`
    );
    checks.push({
      check: "hiro_contracts_api",
      status: data.source ? "ok" : "fail",
      detail: data.source
        ? "Contract source fetch working"
        : "No source returned",
    });
  } catch (e) {
    checks.push({
      check: "hiro_contracts_api",
      status: "fail",
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  const allOk = checks.every((c) => c.status === "ok");
  out({
    status: allOk ? "ready" : "degraded",
    network: NETWORK,
    checks,
    note: "Read-only skill — no wallet required",
  });
  if (!allOk) process.exit(1);
}

// ---------------------------------------------------------------------------
// Subcommand: check
// ---------------------------------------------------------------------------

async function check(opts: { poolId: string }): Promise<void> {
  const allPools = await getAllPools();
  const pool = allPools.find((p) => p.poolId === opts.poolId);

  if (!pool) {
    fail(`Pool '${opts.poolId}' not found. Use 'scan' to list available pools.`);
  }

  const contractIds = extractContractIds(pool);
  if (contractIds.length === 0) {
    fail(
      `No token contract IDs found for pool '${opts.poolId}'. Pool data may be incomplete.`
    );
  }

  const analyses = await Promise.all(
    contractIds.map((id) => analyzeContract(id))
  );

  // Pool-level verdict: worst of all token verdicts
  const verdictPriority: Record<Verdict, number> = {
    UNSAFE: 0,
    UNKNOWN: 1,
    CAUTION: 2,
    SAFE: 3,
  };
  const poolVerdict = analyses.reduce<Verdict>((worst, a) => {
    return verdictPriority[a.verdict] < verdictPriority[worst]
      ? a.verdict
      : worst;
  }, "SAFE");

  const poolScore = Math.min(...analyses.map((a) => a.score));

  const totalFindings = analyses.reduce(
    (sum, a) => sum + a.findings.length,
    0
  );
  const criticalCount = analyses.reduce(
    (sum, a) => sum + a.findings.filter((f) => f.severity === "critical").length,
    0
  );
  const highCount = analyses.reduce(
    (sum, a) => sum + a.findings.filter((f) => f.severity === "high").length,
    0
  );

  out({
    status: "success",
    network: NETWORK,
    timestamp: new Date().toISOString(),
    poolId: opts.poolId,
    pair: `${pool.tokens.tokenX.symbol}-${pool.tokens.tokenY.symbol}`,
    tvlUsd: `$${pool.tvlUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
    verdict: poolVerdict,
    score: poolScore,
    summary: {
      totalFindings,
      critical: criticalCount,
      high: highCount,
      recommendation:
        poolVerdict === "SAFE"
          ? "Pool tokens pass safety checks. Proceed to deployment pipeline."
          : poolVerdict === "CAUTION"
            ? `${highCount} high-severity finding(s). Review before deploying.`
            : `${criticalCount} CRITICAL finding(s). Do NOT deploy liquidity.`,
    },
    tokens: analyses.map((a) => ({
      contract: a.contract,
      sourceAvailable: a.sourceAvailable,
      verdict: a.verdict,
      score: a.score,
      findings: a.findings.sort(
        (x, y) =>
          SEVERITY_WEIGHTS[y.severity] - SEVERITY_WEIGHTS[x.severity]
      ),
    })),
  });
}

// ---------------------------------------------------------------------------
// Subcommand: scan
// ---------------------------------------------------------------------------

async function scan(opts: { minTvl: number }): Promise<void> {
  const allPools = await getAllPools();
  // Filter to HODLMM (DLMM) pools only
  const dlmmPools = allPools.filter(
    (p) => p.poolId.startsWith("dlmm") && p.tvlUsd >= opts.minTvl
  );

  const results: Array<{
    poolId: string;
    pair: string;
    tvlUsd: string;
    verdict: Verdict;
    score: number;
    criticalFindings: number;
    highFindings: number;
  }> = [];

  // Process pools with a small delay to respect rate limits
  for (const pool of dlmmPools) {
    const contractIds = extractContractIds(pool);
    const analyses = await Promise.all(
      contractIds.map((id) => analyzeContract(id))
    );

    const poolScore = analyses.length > 0
      ? Math.min(...analyses.map((a) => a.score))
      : 50;
    const criticalCount = analyses.reduce(
      (sum, a) =>
        sum + a.findings.filter((f) => f.severity === "critical").length,
      0
    );
    const highCount = analyses.reduce(
      (sum, a) =>
        sum + a.findings.filter((f) => f.severity === "high").length,
      0
    );

    const poolVerdict =
      criticalCount > 0
        ? "UNSAFE" as Verdict
        : poolScore >= 80
          ? "SAFE" as Verdict
          : poolScore >= 50
            ? "CAUTION" as Verdict
            : "UNSAFE" as Verdict;

    results.push({
      poolId: pool.poolId,
      pair: `${pool.tokens.tokenX.symbol}-${pool.tokens.tokenY.symbol}`,
      tvlUsd: `$${pool.tvlUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
      verdict: poolVerdict,
      score: poolScore,
      criticalFindings: criticalCount,
      highFindings: highCount,
    });
  }

  // Sort: safest first
  results.sort((a, b) => b.score - a.score);

  const unsafeCount = results.filter((r) => r.verdict === "UNSAFE").length;
  const cautionCount = results.filter((r) => r.verdict === "CAUTION").length;

  out({
    status: "success",
    network: NETWORK,
    timestamp: new Date().toISOString(),
    scannedPools: results.length,
    summary: {
      safe: results.filter((r) => r.verdict === "SAFE").length,
      caution: cautionCount,
      unsafe: unsafeCount,
      recommendation:
        unsafeCount > 0
          ? `${unsafeCount} pool(s) flagged UNSAFE — avoid deploying to these.`
          : "All scanned pools pass basic safety checks.",
    },
    pools: results,
  });
}

// ---------------------------------------------------------------------------
// Subcommand: audit
// ---------------------------------------------------------------------------

async function audit(opts: { contract: string }): Promise<void> {
  const analysis = await analyzeContract(opts.contract);

  out({
    status: "success",
    network: NETWORK,
    timestamp: new Date().toISOString(),
    contract: analysis.contract,
    sourceAvailable: analysis.sourceAvailable,
    verdict: analysis.verdict,
    score: analysis.score,
    findingsCount: analysis.findings.length,
    findings: analysis.findings.sort(
      (a, b) =>
        SEVERITY_WEIGHTS[b.severity] - SEVERITY_WEIGHTS[a.severity]
    ),
    recommendation:
      analysis.verdict === "SAFE"
        ? "No significant issues found."
        : analysis.verdict === "CAUTION"
          ? "Review findings before interacting with this contract."
          : analysis.verdict === "UNSAFE"
            ? "Critical issues found. Do not deploy funds."
            : "Source unavailable — treat with caution.",
  });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name("hodlmm-safety-check")
  .description(
    "Pre-deployment security scanner for Bitflow HODLMM pools. " +
      "Analyzes token contract source for vulnerabilities before agents commit liquidity. " +
      "Read-only, no wallet required."
  )
  .version("1.0.0");

program
  .command("doctor")
  .description("Verify Bitflow API and Hiro API connectivity")
  .action(async () => {
    try {
      await doctor();
    } catch (e) {
      fail(e);
    }
  });

program
  .command("check")
  .description(
    "Deep safety analysis of both token contracts in a HODLMM pool"
  )
  .requiredOption("--pool-id <id>", "Pool identifier (e.g. dlmm_1)")
  .action(async (opts: { poolId: string }) => {
    try {
      await check(opts);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("scan")
  .description(
    "Quick safety triage across all HODLMM pools. Flags pools with critical findings."
  )
  .option(
    "--min-tvl <usd>",
    "Minimum pool TVL in USD to include",
    (v) => parseFloat(v),
    500
  )
  .action(async (opts: { minTvl: number }) => {
    try {
      await scan(opts);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("audit")
  .description("Analyze any single Clarity contract by its fully-qualified ID")
  .requiredOption(
    "--contract <principal>",
    "Contract principal (e.g. SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sbtc-token)"
  )
  .action(async (opts: { contract: string }) => {
    try {
      await audit(opts);
    } catch (e) {
      fail(e);
    }
  });

program.parse(process.argv);
