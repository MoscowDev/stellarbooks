# Verify failed transactions post the fee only

**Complexity** Medium

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). A failed transaction still charges its fee, but none of its operations apply. The classifier returns early when `successful` is false, but only synthetic cases exercise this (see `fixtures/README.md`).

## Scope

Capture a failed testnet transaction, decode its result code and fee from raw meta, and assert that only a fee event is produced.

## Where

`packages/stellar-ingest/src/deltas`, `fixtures/data`

## Acceptance criteria

- The decoder reads success from the transaction result, not from a normalized flag.
- Exactly one fee journal entry is produced, for the charged fee.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Golden fixture from a real failed testnet transaction.
- A test fails if any operation event is emitted for a failed transaction.
- Run the repository typecheck, lint, and tests.
