# Add independently reviewed journal goldens

**Complexity** Medium

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Assert source keys, lines and amounts exactly.

## Scope

Store explicit expected events and postings apart from mapper execution.

## Where

`fixtures`

## Acceptance criteria

- Assert source keys, lines and amounts exactly.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Prove a one-unit mutation fails fixture comparison.
- Run the repository typecheck, lint, and tests.
