# Make posting keys unique per book

**Complexity** High

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). `journal_entry.posting_key` is `UNIQUE` across the whole database (`001-initial-schema.sql`), but chain posting keys contain no book, and the repository checks for duplicates per book. Two books that track the same wallet with the same rule-set version produce the same key, so the second book's batch fails with a unique violation.

## Scope

Add a migration that replaces the global constraint with `UNIQUE (book_id, posting_key)`, check every query and reversal link that assumes global uniqueness, and update ADR-0006 or write a new ADR.

## Where

`packages/storage-postgres/src/migrations`, `packages/storage-postgres/src/repository.ts`

## Acceptance criteria

- Two books can post entries with the same posting key.
- Duplicate keys within one book are still skipped.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- PostgreSQL integration test with two books tracking the same wallet.
- Run the repository typecheck, lint, and tests.
