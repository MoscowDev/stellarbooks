# Verify claimable balance creation and claim

**Complexity** Medium

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Deduplicate release and receipt when both wallets are tracked.

## Scope

Carry the balance ID and asset through lock and release.

## Where

`packages/stellar-ingest/src/classifiers`

## Acceptance criteria

- Deduplicate release and receipt when both wallets are tracked.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Capture a funded balance and subsequent claim.
- Run the repository typecheck, lint, and tests.
