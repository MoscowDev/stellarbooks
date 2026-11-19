# Record valuations with quote provenance

**Complexity** High

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Retain source, timestamp and asset pair for every valuation.

## Scope

Define the quote source and exact-rate arithmetic with documented rounding.

## Where

`packages/reports`, `packages/storage-postgres`

## Acceptance criteria

- Retain source, timestamp and asset pair for every valuation.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Cover missing quotes, fractional rates and amounts above safe integer range.
- Run the repository typecheck, lint, and tests.
