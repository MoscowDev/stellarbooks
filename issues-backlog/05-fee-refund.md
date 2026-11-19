# Capture Soroban fee refunds

**Complexity** High

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Link each refund to the credited wallet and applied transaction.

## Scope

Resolve Q-023 and derive refund movements at the correct stage.

## Where

`packages/stellar-ingest/src/deltas`

## Acceptance criteria

- Link each refund to the credited wallet and applied transaction.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Use raw standard and fee-bumped Soroban transactions with refunds.
- Run the repository typecheck, lint, and tests.
