# Seal journal lines after posting

**Complexity** High

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Reject update, delete, truncate and balanced line extensions under the app role.

## Scope

Prevent additions to completed entries and protect headers and lines.

## Where

`packages/storage-postgres/src/migrations`

## Acceptance criteria

- Reject update, delete, truncate and balanced line extensions under the app role.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Use direct SQL on PostgreSQL 15 and 18.
- Run the repository typecheck, lint, and tests.
