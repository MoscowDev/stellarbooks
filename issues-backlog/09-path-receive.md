# Verify strict-receive path payments

**Complexity** Medium

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Exclude the unspent send allowance from postings.

## Scope

Resolve Q-021 by comparing the actual send with the maximum.

## Where

`packages/stellar-ingest/src/classifiers`

## Acceptance criteria

- Exclude the unspent send allowance from postings.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Capture a transaction whose actual send is below its maximum.
- Run the repository typecheck, lint, and tests.
