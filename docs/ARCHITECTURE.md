# Architecture

StellarBooks is a TypeScript monorepo of small packages with one-way dependencies. Data flows
from Stellar ledgers to normalized economic events, then to journal entries, storage and reports.
The [approved plan](../PLAN.md) sets the scope; the [roadmap](ROADMAP.md) tracks progress.

## Pipeline

```text
LedgerSource ──► decodeLedger ──► classifyTransaction ──► mapEvents ──► JournalEntry[]
(RPC getLedgers,  (every tx: fee,    (events for tracked     (chart-of-      (balanced per asset,
 fixtures)         memo, operations,  wallets; residual to    accounts rules)  deterministic keys)
                   balance deltas)    suspense)                                     │
                                                                                    ▼
             reports ◄──────────── storage-postgres (append-only journal, triggers, checkpoints)
             (ledger, trial balance, statements, CSV/JSON, valuation)
                                                                                    │
                                                    reconcileBalances vs a balance snapshot
```

| Stage        | Code                                                   | Status                                                                                                 |
| ------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Read ledgers | `RpcLedgerSource`, `FixtureLedgerSource`               | Implemented. A SEP-54 data-lake reader for full history is planned (ADR-0003).                         |
| Decode       | `decodeLedger`                                         | Implemented for classic data and Soroban fees. Contract events are not decoded yet.                    |
| Classify     | `classifyTransaction`, `extractEvents`                 | Implemented for the operations in [ACCOUNTING-RULES.md](ACCOUNTING-RULES.md); the rest go to suspense. |
| Map          | `mapEvents`, templates, `extendRuleSet`                | Implemented.                                                                                           |
| Store        | `createPostgresRepository`, `runMigrations`            | Implemented. Book and chart registration APIs are still missing (Q-036).                               |
| Report       | `generalLedger`, `trialBalance`, `accountStatement`, … | Implemented. Closing entries are not (issue 37).                                                       |
| Reconcile    | `reconcileBalances`                                    | Implemented against a supplied snapshot. Reading the snapshot from the chain is open (issue 28).       |

[ADR-0011](adr/0011-whole-ledger-decoding.md) describes the decoding and classification design.

## Packages and dependency rules

| Package            | Responsibility                                                       | May depend on                                   |
| ------------------ | -------------------------------------------------------------------- | ----------------------------------------------- |
| `core`             | Domain types, validation, mapping rules, balances and reconciliation | nothing at runtime (enforced by lint and tests) |
| `stellar-ingest`   | Ledger sources, XDR decoding, event classification                   | `core`, `@stellar/stellar-sdk`                  |
| `storage-postgres` | SQL migrations, repositories, idempotent posting                     | `core`, `pg`                                    |
| `reports`          | Report builders, exporters, valuation                                | `core`                                          |
| `cli`              | Operator commands                                                    | all of the above                                |

`tools/fixture-gen` is a private development tool for capturing real testnet ledgers.

## Key decisions

- **Ingestion:** raw ledger metadata is canonical, behind a pluggable `LedgerSource`
  ([ADR-0003](adr/0003-ingestion-source.md)).
- **Amounts:** `bigint` minor units ([ADR-0004](adr/0004-money-representation.md)).
- **Balancing:** per asset, with a conversion account for exchanges
  ([ADR-0005](adr/0005-multi-asset-balancing.md)).
- **Database integrity:** enforced by PostgreSQL constraints and triggers
  ([ADR-0006](adr/0006-database-integrity.md)).
- **Event derivation:** amounts from ledger-entry changes, unexplained changes to suspense
  ([ADR-0008](adr/0008-derivation-precedence.md), [ADR-0011](adr/0011-whole-ledger-decoding.md)).
- **Keys:** source and posting keys ([ADR-0010](adr/0010-posting-and-source-keys.md)).

## Determinism and replay

- The same ledger data and rule-set version always produce identical events and journal entries,
  including posting keys. `mapEvents` sorts events by source position, so its output does not depend
  on input order (property-tested).
- Posting is idempotent: the repository skips an entry whose posting key already exists in the
  book, so replaying a ledger range posts nothing twice. It does not compare content, so a replay
  with changed content under the same key is ignored (issue 45). Posting keys are currently unique
  across the whole database rather than per book (issue 43).
- Suspense entries are numbered from the transaction's own data, so their keys do not change when
  the set of tracked wallets changes (ADR-0011).
- A checkpoint posted with a batch commits atomically with it; older checkpoints are ignored. The
  caller must ensure each ledger is complete before checkpointing it. Resuming and gap detection
  across runs are planned (issue 36).

## Completeness

For decoded ledgers, every balance change of a tracked wallet reaches the journal. The classifier
compares each wallet's actual change per asset with what its events explain and posts any
difference to suspense. The scheduled testnet test checks that journal wallet totals equal the
decoded changes for every wallet in recent ledgers.
