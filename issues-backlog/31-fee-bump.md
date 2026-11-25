# Decode fee-bump transactions and settle their posting key

**Complexity** High

**Status** Partly done (2026-11-25). `decodeLedger` decodes fee-bump envelopes and charges the outer fee source; captured fee-bump tx 9 of ledger 5796891 is asserted. Still open: the posting-key decision (Q-022) and its ADR.

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). Fee-bump transactions charge the outer fee source, not the inner transaction source. `classifyTransaction` reads a `feeBump` flag from normalized input only, and Q-022 (outer or inner hash in the posting key) is still open. Research is in `docs/research/stellar-transactions-fees-results.md` (TX-4, TX-5).

## Scope

Decode fee-bump `TransactionEnvelope` variants from raw meta, attribute the fee to the outer fee source, and keep operations attributed to the inner source. Propose an answer to Q-022 in a new ADR before changing `chainSourceKey`.

## Where

`packages/stellar-ingest/src/deltas`, `packages/core/src/posting-key.ts`, `docs/adr/`

## Acceptance criteria

- A captured testnet fee-bump transaction decodes with the outer fee payer charged exactly `feeCharged`.
- The posting key for fee-bump transactions follows the ADR and stays stable on replay.
- Q-022 is moved to ANSWERED, or the ADR records why it stays open.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Golden fixture from a real testnet fee-bump transaction.
- A test proves the inner source is not charged the fee.
- Run the repository typecheck, lint, and tests.
