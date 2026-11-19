# Verify classic asset clawbacks

**Complexity** Medium

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Separate holder movement from supply accounting.

## Scope

Derive holder loss and document issuer mapping policy.

## Where

`packages/stellar-ingest/src/classifiers`

## Acceptance criteria

- Separate holder movement from supply accounting.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Capture partial and full holder clawbacks.
- Run the repository typecheck, lint, and tests.
