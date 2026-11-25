# Generate closing journal entries at period close

**Complexity** High

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). `closePeriod` blocks postings into a closed period but does not create closing entries that move income and expense balances to equity (Q-037). See `docs/research/accounting.md`.

## Scope

Add a pure function that builds per-asset closing entries for a period, and a repository method that posts them and closes the period in one database transaction.

## Where

`packages/core/src`, `packages/reports/src`, `packages/storage-postgres/src/repository.ts`

## Acceptance criteria

- After closing, income and expense accounts have a zero balance per asset for the period.
- Closing entries balance per asset and are idempotent on replay.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Property test: closing entries always balance and zero every income and expense account.
- PostgreSQL test that posting the closing entries and closing the period are atomic.
- Run the repository typecheck, lint, and tests.
