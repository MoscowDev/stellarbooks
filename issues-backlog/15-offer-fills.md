# Detect fills of tracked resting offers

**Complexity** High

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Attribute only executed amounts to the maker.

## Scope

Resolve Q-026 by comparing offer changes and actual trades.

## Where

`packages/stellar-ingest/src/classifiers`

## Acceptance criteria

- Attribute only executed amounts to the maker.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Capture resting, partial and full fills.
- Run the repository typecheck, lint, and tests.
