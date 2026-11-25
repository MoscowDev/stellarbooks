# Detect gaps and out-of-order ledgers during backfill

**Complexity** High

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). The plan requires handling backfill, out-of-order data and gaps. `RpcLedgerSource` rejects gaps within one request and storage has `source_checkpoint`, but no pipeline ties them together across runs.

## Scope

Add an ingestion runner that resumes from the stored checkpoint, rejects ledgers older than the checkpoint unless replaying, and reports any missing range instead of skipping it.

## Where

`packages/stellar-ingest/src`, `packages/storage-postgres/src/repository.ts`

## Acceptance criteria

- Replaying an already-posted range produces no new entries.
- A missing ledger stops ingestion with an error naming the gap.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Property test: any delivery order of the same ledgers yields identical journal contents.
- PostgreSQL integration test for resuming after an interruption.
- Run the repository typecheck, lint, and tests.
