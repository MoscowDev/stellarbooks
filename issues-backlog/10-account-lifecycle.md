# Verify account creation and merge

**Complexity** Medium

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Keep fees distinct and reconcile removed accounts to zero.

## Scope

Map create-account funding and destination receipt on merge.

## Where

`packages/stellar-ingest/src/classifiers`

## Acceptance criteria

- Keep fees distinct and reconcile removed accounts to zero.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Capture each operation and both wallet perspectives.
- Run the repository typecheck, lint, and tests.
