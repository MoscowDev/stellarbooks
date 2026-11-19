# Join transaction envelopes and results

**Complexity** High

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Preserve apply order for multi-transaction ledgers.

## Scope

Match envelopes to application results with explicit hash and index handling.

## Where

`packages/stellar-ingest/src/deltas`

## Acceptance criteria

- Preserve apply order for multi-transaction ledgers.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Compare all matched hashes against a real testnet ledger.
- Run the repository typecheck, lint, and tests.
