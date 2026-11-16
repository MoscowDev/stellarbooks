# ADR-0003: Ingestion source is ledger meta XDR behind a pluggable `LedgerSource`

- Status: Proposed (pending Phase 1 approval; see OPEN-QUESTIONS Q-010)
- Date: 2026-11-16

## Context
Evidence is in docs/research/data-sources.md, soroban-events.md and stellar-transactions-fees-results.md.
- **Horizon** is officially "nearing end-of-life and will eventually be deprecated in favor of
  Stellar RPC". It has no shutdown date. SDF's Horizon keeps 1 year of history, has no
  smart-contract data, and does not serve transaction meta.
- **Stellar RPC** is the recommended interface. Its default retention is 120960 ledgers (about 7
  days) for transactions and events.
  - `getLedgers` can serve full history when the node has a data lake behind it (RPC >= 23.0).
  - The lake format is SEP-54 (Galexie). An AWS Open Data pubnet lake exists, provided by a third
    party.
- **Determinism:** `LedgerCloseMeta` / `TransactionMeta` XDR is consensus output. Its ledger-entry
  changes give exact balance deltas for every account and trustline, including amounts that results
  do not carry, such as liquidity-pool deposits and withdrawals and claimable-balance claims.
- **CAP-67 classic events (Protocol 23+)** are not hashed into the ledger. They also depend on the
  node's `EMIT_CLASSIC_EVENTS` and `BACKFILL_STELLAR_ASSET_EVENTS` settings.
- **Non-SAC SEP-41 tokens** keep balances in contract-specific storage. Their contract events are the
  only practical, interoperable signal.
- **Protocol 30** (mainnet vote 2026-11-23) changes the `LedgerCloseMeta` XDR. We need SDK >= 17.3.0.

## Decision
1. **Raw ledger data is the canonical input.** For each transaction we use the `LedgerCloseMeta`, or
   the envelope, result and `TransactionMeta` taken from it.
2. **Balance deltas** for native assets, classic assets and SAC balances are derived from ledger-entry
   changes in meta. Operation and result data classify the economic event (payment, swap and so on).
   CAP-67 / SAC events, when present, are a cross-check: if they disagree, ingestion fails and records
   the conflict.
3. **Non-SAC SEP-41 tokens** are derived from their contract events (transfer/mint/burn/clawback).
   This is documented as a weaker guarantee, because events are not hashed consensus data in the same
   way.
4. **Sources sit behind a `LedgerSource` interface**: "give me `LedgerCloseMeta` for ledgers N..M,
   in order".
   - **v0.1 adapters:**
     - `RpcLedgerSource`, using `rpc.Server.getLedgers` with cursor paging and a `getHealth`
       retention check.
     - `FixtureLedgerSource`, which reads XDR files saved in the repo. Tests and golden fixtures use it.
   - **Later adapter:** a SEP-54 data-lake reader, tracked in the backlog.
   - **Horizon** is not a source, because it does not provide meta.
5. **Account filtering is done client-side.** The ingester scans the requested ledger range and keeps
   transactions that touch the tracked accounts or contracts. Backfill cost is proportional to the
   ledger range, not to the account's activity. This is documented as a limitation.
6. **Checkpointing:** ingestion persists a checkpoint (the last fully processed ledger) per source.
   Ongoing ingestion must run more often than the source's retention window, and the ingester warns
   when a gap exceeds it.

## Consequences
- **Positive:** deterministic, replayable and protocol-faithful. It covers effects that Horizon and
  results do not expose, and it does not depend on Horizon's end of life.
- **Negative:** a full-history backfill needs a data-lake-backed RPC or a lake reader, and scanning is
  costly. We must also maintain XDR decoding across protocol upgrades.
- **Follow-up:**
  - Fixtures are captured from testnet RPC as raw XDR within the retention window. Testnet resets
    periodically, so fixtures are committed to the repo.

## Alternatives considered
- **Horizon operations and effects:** convenient filtering, but end-of-life, 1-year history on SDF,
  no meta and no contract data.
- **RPC `getTransactions` plus `getEvents` only:** limited to about 7 days, and there is no
  per-account filter on `getTransactions`.
- **CAP-67 events as the sole source:** not consensus-hashed, and depends on node configuration.
- **Hubble/BigQuery:** batch latency and cost. Useful as an external audit oracle, but not as the feed.
