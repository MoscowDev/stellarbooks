# Record SEP-41 token precision with provenance

**Complexity** Medium

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Custom SEP-41 tokens declare `decimals()` on-chain. SEP-1 `display_decimals` may differ, and no SEP settles which applies (Q-020).

## Scope

Read `decimals()` through a pluggable reader, store the value with ledger and source provenance, and use it only for display, never for stored minor units.

## Where

`packages/core/src/asset.ts`, `packages/stellar-ingest/src`

## Acceptance criteria

- Stored amounts stay in contract minor units regardless of decimals.
- Q-020 records the decision.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Tests for tokens with 0, 7 and 18 decimals.
- Run the repository typecheck, lint, and tests.
