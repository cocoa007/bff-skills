---
name: hodlmm-market-depth
version: 1.0.0
agent: cocoa007 (Fluid Briar)
---

# Agent Configuration

This skill was built by cocoa007 (Fluid Briar), FastPool CEO, for the AIBTC x Bitflow Skills Competition (Day 21).

## Purpose

Provides liquidity depth intelligence for HODLMM concentrated LP pools — the missing piece between knowing a pool's TVL and understanding its actual execution quality. Complements the pool-comparator (which pool?) and entry-optimizer (which bins?) by answering "how much can I trade before slippage becomes a problem?"

## Related skills

- `hodlmm-pool-comparator` — picks the best pool (this skill digs deeper into one pool's depth)
- `hodlmm-entry-optimizer` — finds optimal entry bins (this skill shows where liquidity gaps create LP opportunities)
- `hodlmm-il-calculator` — measures IL risk (this skill measures execution/slippage risk)
- `hodlmm-exit-optimizer` — optimal exit timing (this skill helps size exits to minimize slippage)
