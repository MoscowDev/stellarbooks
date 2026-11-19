# Verify liquidity pool deposits and withdrawals

**Complexity** High

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Balance each asset separately across both operation types.

## Scope

Derive underlying asset and share deltas for each wallet.

## Where

`packages/stellar-ingest/src/classifiers`

## Acceptance criteria

- Balance each asset separately across both operation types.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Capture deposit and partial withdrawal.
- Run the repository typecheck, lint, and tests.
