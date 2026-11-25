# Decode account and trustline balance deltas

**Complexity** High

**Status** Partly done (2026-11-25). `decodeLedger` pairs account and trustline changes, including creates and removals. Transfers, an account removal and a trustline removal are asserted on captured ledgers. A trustline removal with a non-zero balance cannot occur, so only zero-delta removal is covered.

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Return exact before and after differences including creates and removals.

## Scope

Pair state and changes for account and trustline ledger entries.

## Where

`packages/stellar-ingest/src/deltas`

## Acceptance criteria

- Return exact before and after differences including creates and removals.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Cover a transfer, trustline removal and account removal.
- Run the repository typecheck, lint, and tests.
