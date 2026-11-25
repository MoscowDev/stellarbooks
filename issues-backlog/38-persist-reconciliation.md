# Persist reconciliation runs

**Complexity** Medium

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). `reconcileBalances` returns a report, and the schema has a `reconciliation_run` table, but the repository does not write or read it (Q-037).

## Scope

Add repository methods to save and list reconciliation runs with their snapshot provenance and per-row differences.

## Where

`packages/storage-postgres/src/repository.ts`, `packages/storage-postgres/src/migrations`

## Acceptance criteria

- A saved run round-trips exactly, including bigint differences and provenance.
- Saved runs are append-only.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- In-memory and PostgreSQL repository tests for save and list.
- Run the repository typecheck, lint, and tests.
