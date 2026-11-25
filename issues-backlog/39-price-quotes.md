# Persist price quotes and add a CSV price source

**Complexity** Medium

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). `manualPriceSource` keeps quotes in memory. The `price_quote` table exists but is unused, and there is no file-based source (Q-037). Rates must never be hardcoded.

## Scope

Add a `PriceSource` that reads quotes from CSV with explicit provenance columns, and repository methods to persist the quotes used in a valuation.

## Where

`packages/reports/src/valuation.ts`, `packages/storage-postgres/src/repository.ts`

## Acceptance criteria

- Every quote carries source and timestamp provenance.
- Malformed or ambiguous rows are rejected, not guessed.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Tests for exact rational rates and rejected rows.
- Round-trip test for persisted quotes.
- Run the repository typecheck, lint, and tests.
