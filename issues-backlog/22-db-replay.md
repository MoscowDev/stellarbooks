# Make posting race-safe

**Complexity** High

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Maintain one active entry for a source across replays and reversals.

## Scope

Handle concurrent exact duplicates and reject conflicting payloads.

## Where

`packages/storage-postgres/src/repository.ts`

## Acceptance criteria

- Maintain one active entry for a source across replays and reversals.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Run concurrent sessions using duplicate and conflicting batches.
- Run the repository typecheck, lint, and tests.
