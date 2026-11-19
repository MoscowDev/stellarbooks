# Validate ledger headers and close times

**Complexity** Medium

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Reject a response with a mismatched sequence or timestamp.

## Scope

Check sequence and close time against decoded header.

## Where

`packages/stellar-ingest/src/deltas`

## Acceptance criteria

- Reject a response with a mismatched sequence or timestamp.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Use the captured testnet ledger and mutate its outer fields.
- Run the repository typecheck, lint, and tests.
