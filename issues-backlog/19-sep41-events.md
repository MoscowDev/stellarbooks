# Decode custom SEP-41 events

**Complexity** High

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Retain i128 amount and contract identity.

## Scope

Decode token events and record precision provenance after Q-020.

## Where

`packages/stellar-ingest/src/deltas`

## Acceptance criteria

- Retain i128 amount and contract identity.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Capture custom-token events with non-seven decimal precision.
- Run the repository typecheck, lint, and tests.
