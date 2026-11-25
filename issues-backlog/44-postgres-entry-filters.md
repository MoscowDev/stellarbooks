# Apply every getEntries filter in PostgreSQL

**Complexity** Medium

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). `GetEntriesOptions` offers `fromLedger`, `toLedger`, `accountCode` and `wallet`. The in-memory repository applies them, but the PostgreSQL `getEntries` applies only `fromDate` and `toDate`, so the same call returns different results from the two backends.

## Scope

Implement the four missing filters in SQL with the same semantics as the in-memory repository.

## Where

`packages/storage-postgres/src/repository.ts`

## Acceptance criteria

- Both repositories return the same entries for every filter combination.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- A shared test suite run against both repositories, with the PostgreSQL run gated on `STELLARBOOKS_TEST_DATABASE_URL`.
- Run the repository typecheck, lint, and tests.
