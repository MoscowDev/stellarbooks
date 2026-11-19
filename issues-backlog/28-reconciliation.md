# Compare journal and chain snapshots at one ledger

**Complexity** High

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Reject mismatched snapshot heights and distinguish missing positions.

## Scope

Compare matching wallet and asset positions at the same ledger and persist the discrepancy report.

## Where

`packages/core`, `packages/stellar-ingest`, `packages/storage-postgres`

## Acceptance criteria

- Reject mismatched snapshot heights and distinguish missing positions.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Reconcile independently captured testnet state and inject a discrepancy.
- Run the repository typecheck, lint, and tests.
