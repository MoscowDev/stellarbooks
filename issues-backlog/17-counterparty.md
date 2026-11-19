# Decode muxed addresses and memos

**Complexity** Medium

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Retain the exact unsigned muxed ID through journal mapping.

## Scope

Preserve optional memo kinds and muxed ID while tracking the base account.

## Where

`packages/stellar-ingest/src/deltas`

## Acceptance criteria

- Retain the exact unsigned muxed ID through journal mapping.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Capture muxed payment and exercise all memo union arms.
- Run the repository typecheck, lint, and tests.
