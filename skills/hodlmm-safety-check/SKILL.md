---
name: hodlmm-safety-check
description: "Pre-deployment security scanner for Bitflow HODLMM pools — analyzes underlying token contracts for admin centralization, unchecked mint functions, missing access controls, and other Clarity anti-patterns before agents commit liquidity."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | check --pool-id <id> | scan [--min-tvl 1000] | audit --contract <principal>"
  entry: "hodlmm-safety-check/hodlmm-safety-check.ts"
  requires: ""
  tags: "defi, security, read-only, mainnet-only, hodlmm, infrastructure"
---

# HODLMM Safety Check

Pre-deployment security scanner for Bitflow HODLMM concentrated-liquidity pools. Analyzes the Clarity source of every token contract in a pool before an agent commits capital.

## What it does

Answers the question **"is this pool safe to deploy into?"** by fetching and analyzing the Clarity source code of both token contracts in a HODLMM pool, scanning for common vulnerability patterns, and producing a composite safety score.

Three operating modes:

1. **Single pool** (`check --pool-id dlmm_1`) — deep analysis of both tokens in one pool. Returns per-token findings and a pool-level safety verdict.
2. **Cross-pool scan** (`scan`) — quick triage of all HODLMM pools ranked by safety score. Useful for filtering the opportunity set before running `hodlmm-pulse` or `hodlmm-advisor`.
3. **Single contract** (`audit --contract SP...`) — analyze any Clarity contract, not just pool tokens. Useful for ad-hoc security checks.

## Why agents need it

`hodlmm-pulse` tells you *when* to deploy. `hodlmm-advisor` tells you *where and how*. But neither checks whether the underlying tokens are safe. A pool with great momentum and high APR is worthless if one token has an unguarded mint function or a centralized admin key that can freeze transfers.

This skill is the missing safety gate in the HODLMM deployment workflow:

```
hodlmm-safety-check check --pool-id dlmm_1  ->  is it safe?
hodlmm-pulse scan                            ->  is now the right time?
hodlmm-advisor entry-plan --pool-id dlmm_1   ->  what bins and strategy?
bitflow add-liquidity-simple                  ->  deploy (human approval)
```

## Safety patterns checked

| Category | Pattern | Severity |
|----------|---------|----------|
| Admin centralization | Contract owner can mint, burn, freeze, or upgrade without multisig/timelock | Critical |
| Unchecked mint | `ft-mint?` callable without supply cap or access control | Critical |
| Missing transfer checks | `ft-transfer?` with no sender validation | High |
| No burn protection | `ft-burn?` callable by non-owner | High |
| Proxy/upgrade pattern | Contract delegates to mutable data-var for logic | Medium |
| Hardcoded addresses | Principal literals that could be admin backdoors | Medium |
| Missing error handling | `unwrap-panic` instead of `unwrap!` with error codes | Low |
| Code complexity | Excessive nesting depth or function count | Info |

## Commands

### doctor

Checks Bitflow API and Hiro API connectivity.

```bash
bun run skills/hodlmm-safety-check/hodlmm-safety-check.ts doctor
```

### check

Deep safety analysis of both token contracts in a HODLMM pool.

```bash
bun run skills/hodlmm-safety-check/hodlmm-safety-check.ts check --pool-id dlmm_1
```

### scan

Quick safety triage across all HODLMM pools. Flags pools with critical findings.

```bash
bun run skills/hodlmm-safety-check/hodlmm-safety-check.ts scan
bun run skills/hodlmm-safety-check/hodlmm-safety-check.ts scan --min-tvl 10000
```

### audit

Analyze any single Clarity contract by its fully-qualified principal.

```bash
bun run skills/hodlmm-safety-check/hodlmm-safety-check.ts audit --contract SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sbtc-token
```

## Output contract

All outputs are strict JSON to stdout.

**Success:**
```json
{ "status": "success", "network": "mainnet", "timestamp": "...", ... }
```

**Error:**
```json
{ "error": "descriptive message" }
```

## Data sources

| Source | Data | Endpoint |
|--------|------|----------|
| Bitflow App API | Pool list with token contract IDs | `bff.bitflowapis.finance/api/app/v1/pools` |
| Hiro Stacks API | Clarity contract source code | `api.hiro.so/v2/contracts/source/{addr}/{name}` |

## Known constraints

- Source analysis is static — it cannot detect runtime state (e.g., whether an admin key has been rotated)
- Some token contracts are closed-source (no source on Hiro) — flagged as `unknown` risk
- Pattern matching is heuristic, not formal verification — false positives possible on complex contracts
- Rate-limited by Hiro API (~50 req/min without API key)
