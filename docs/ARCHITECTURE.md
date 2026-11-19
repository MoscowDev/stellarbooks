# Architecture

The offline workflow below runs against captured ledger data. The pipeline diagram
describes the target architecture from the [approved plan](../PLAN.md). See the
[roadmap](ROADMAP.md) for implementation status.

## Pipeline

```
LedgerSource ──► stellar-ingest ──► EconomicEvent[] ──► core rules ──► JournalEntry[]
 (RPC getLedgers,   (XDR decode, meta      (normalized,       (mapping rules,    (validated, per-asset
  fixtures; lake      deltas, classifiers,   deterministic)     CoA templates)     balanced, posting key)
  reader later)       SEP-41 events)                                                    │
                                                                                         ▼
                      reports ◄── storage-postgres (append-only journal, triggers, checkpoints)
                      (GL, TB, statements, close, CSV/JSON)         │
                                                                    ▼
                                                     reconciliation vs on-chain balances
```

## Packages and dependency rules

| Package            | Responsibility                                                    | May depend on                                   |
| ------------------ | ----------------------------------------------------------------- | ----------------------------------------------- |
| `core`             | Domain types, validation, rules, report math, reconciliation math | nothing at runtime (enforced by lint and tests) |
| `stellar-ingest`   | Data sources, XDR decoding, event extraction                      | `core`, `@stellar/stellar-sdk`                  |
| `storage-postgres` | SQL migrations, repositories, idempotent posting                  | `core`, `pg`                                    |
| `reports`          | Report builders, exporters                                        | `core`                                          |
| `cli`              | Operator commands                                                 | all of the above                                |

## Key decisions

- **Ingestion:** ledger meta XDR is canonical, behind a pluggable `LedgerSource`
  ([ADR-0003](adr/0003-ingestion-source.md)).
- **Amounts:** bigint minor units ([ADR-0004](adr/0004-money-representation.md)).
- **Balancing:** per-asset balancing, with conversion accounts
  ([ADR-0005](adr/0005-multi-asset-balancing.md)).
- **Database integrity:** enforced in Postgres ([ADR-0006](adr/0006-database-integrity.md)).
- **Event derivation:** derivation precedence and the suspense account
  ([ADR-0008](adr/0008-derivation-precedence.md)).

## Determinism

The same ledger data and the same rule-set version always produce byte-identical journal entries,
with the same posting keys and hashes. Ingestion can be replayed out of order, and duplicates are
no-ops.

## Offline fixture workflow

The [raw payment example](../examples/raw-payment.mjs) reads committed XDR, matches
envelopes to results, verifies and classifies one payment and fee, maps events through
the freelancer template, and runs reports and a synthetic balance comparison.
