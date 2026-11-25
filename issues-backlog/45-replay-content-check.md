# Reject replays that change an entry's content

**Complexity** Medium

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). ADR-0010 says a replay with differing canonical content is an error. The repository currently skips any existing posting key without comparing content, so a changed entry is silently ignored. `canonicalEntryJson` in `core` gives a byte-stable form to compare.

## Scope

Store a hash of `canonicalEntryJson` with each entry and compare it when a posting key already exists. Report a mismatch as an error instead of a duplicate.

## Where

`packages/storage-postgres/src/migrations`, `packages/storage-postgres/src/repository.ts`

## Acceptance criteria

- An identical replay is still counted as a duplicate.
- A replay with changed content under an existing key fails without posting anything.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Tests for both repositories, including a one-unit change in a line amount.
- Run the repository typecheck, lint, and tests.
