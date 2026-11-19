# Resolve claimable balance predicate and clawback treatment

**Complexity** High

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Avoid posting an automatic release with no ledger change.

## Scope

Verify expiry semantics and separately derive actual clawback movements.

## Where

`docs/research`, `packages/stellar-ingest/src/classifiers`

## Acceptance criteria

- Avoid posting an automatic release with no ledger change.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Capture clawback and exercise expired claim eligibility.
- Run the repository typecheck, lint, and tests.
