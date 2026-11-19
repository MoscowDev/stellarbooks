# Expose read-only CLI workflows and examples

**Complexity** High

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Document runnable workflows, exit codes and required configuration.

## Scope

Wire ingestion, reports and reconciliation through supported library APIs.

## Where

`packages/cli`, `examples`

## Acceptance criteria

- Document runnable workflows, exit codes and required configuration.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Run CLI smoke tests using committed fixtures and a Postgres service.
- Run the repository typecheck, lint, and tests.
