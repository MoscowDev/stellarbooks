# Commit ledger progress atomically

**Complexity** High

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Rollback posting and progress together and prevent regression.

## Scope

Store entries and contiguous progress in one transaction.

## Where

`packages/storage-postgres/src/repository.ts`

## Acceptance criteria

- Rollback posting and progress together and prevent regression.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Exercise failed commit, retry and concurrent ledger claims.
- Run the repository typecheck, lint, and tests.
