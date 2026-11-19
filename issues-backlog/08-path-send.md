# Verify strict-send path payments

**Complexity** Medium

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Keep conversion amounts separate by asset.

## Scope

Map sent and received legs from applied results and meta.

## Where

`packages/stellar-ingest/src/classifiers`

## Acceptance criteria

- Keep conversion amounts separate by asset.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Use a real fill with distinct input and output assets.
- Run the repository typecheck, lint, and tests.
