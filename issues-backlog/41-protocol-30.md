# Confirm decoding of Protocol 30 ledger metadata

**Complexity** Medium

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Protocol 30 changes the `LedgerCloseMeta` XDR (Q-030). The pinned SDK must decode it once testnet upgrades.

## Scope

Capture a post-upgrade testnet ledger and check that the pinned SDK decodes it. If it does not, upgrade the SDK and record the change in an ADR.

## Where

`packages/stellar-ingest`, `fixtures/data`, `docs/research/data-sources.md`

## Acceptance criteria

- A committed Protocol 30 ledger decodes with `inspectLedgerHeader`.
- Q-030 is answered with the SDK version used.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Fixture test for the Protocol 30 ledger header and transaction count.
- Run the repository typecheck, lint, and tests.
