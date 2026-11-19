# Decode fee charges and payer

**Complexity** High

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Produce one charged fee event for each tracked payer even on failure.

## Scope

Read charged fees from protocol metadata and handle fee-bump payer attribution.

## Where

`packages/stellar-ingest/src/deltas`

## Acceptance criteria

- Produce one charged fee event for each tracked payer even on failure.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Capture normal, failed and fee-bump testnet transactions.
- Run the repository typecheck, lint, and tests.
