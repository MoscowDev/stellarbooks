# Represent trustline and sponsorship reserve effects

**Complexity** High

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Show how available balance changes without inventing a cash movement.

## Scope

Track base reserve obligations and sponsorship changes.

## Where

`packages/stellar-ingest/src/classifiers`

## Acceptance criteria

- Show how available balance changes without inventing a cash movement.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Capture sponsored trustline creation and removal.
- Run the repository typecheck, lint, and tests.
