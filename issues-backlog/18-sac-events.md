# Decode Stellar Asset Contract events

**Complexity** High

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Identify duplicate representations before journal mapping.

## Scope

Parse transfer, mint, burn and clawback and cross-check classic balances.

## Where

`packages/stellar-ingest/src/deltas`

## Acceptance criteria

- Identify duplicate representations before journal mapping.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Capture all four event types and a delegated transfer.
- Run the repository typecheck, lint, and tests.
