# Enforce accounting period close

**Complexity** High

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Preserve historical entries and reject backdated posts after close.

## Scope

Define closing postings and concurrent close semantics.

## Where

`packages/reports`, `packages/storage-postgres`

## Acceptance criteria

- Preserve historical entries and reject backdated posts after close.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Cover racing post and close, duplicate close, and multiple assets.
- Run the repository typecheck, lint, and tests.
