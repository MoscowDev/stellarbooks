# Persist journal source and reversal metadata

**Complexity** Medium

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Compare canonical serialized input with fetched output.

## Scope

Round-trip all JournalEntry and JournalLine fields.

## Where

`packages/storage-postgres/src/repository.ts`

## Acceptance criteria

- Compare canonical serialized input with fetched output.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Use fee-bump source, reversal, memo and non-native asset.
- Run the repository typecheck, lint, and tests.
