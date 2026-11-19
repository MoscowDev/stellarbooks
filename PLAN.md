# StellarBooks implementation plan

The maintainer approved this plan on 2026-11-16. This document records the target
scope and original milestones. See the [roadmap](docs/ROADMAP.md) for current
priorities and [open questions](docs/OPEN-QUESTIONS.md) for outstanding work.

## 1. Scope

**What it is:** an embeddable, read-only TypeScript library that turns Stellar network activity for a
set of tracked accounts and contracts into an append-only, per-asset-balanced, double-entry journal.
It then produces reports and proves that its balances match the chain.

**What it does:**

1. **Ingest:** reads ledger data (`LedgerCloseMeta` XDR) from a pluggable `LedgerSource` (ADR-0003).
2. **Derive:** turns transactions into normalized **economic events** (payment, path payment, fee,
   fee refund, account created/merged, claimable balance created/claimed/clawed back, LP
   deposit/withdraw, offer fill, clawback, SEP-41 transfer/mint/burn/clawback, unclassified change).
   Amounts come from meta ledger-entry deltas; operations classify them (ADR-0008).
3. **Map:** applies configurable **mapping rules** that turn events into journal entries, against a
   chart of accounts. Built-in templates cover freelancer, merchant and payroll. Custom rules use a
   typed rule API.
4. **Post:** writes entries idempotently, keyed by a deterministic posting key, to an append-only
   store. Corrections are made only with reversing entries.
5. **Report:** general ledger, trial balance, account statement, balance snapshot and period close,
   exported as CSV or JSON.
6. **Valuation (optional):** converts amounts into a reporting currency through a pluggable
   `PriceSource`, recording rate provenance.
7. **Reconcile:** proves that computed per-asset balances equal on-chain balances at ledger L.

**Target users:** developers of Stellar payroll, invoice-finance, remittance, streaming and merchant
apps who need books derived from chain activity.

## 2. Non-goals

- **No custody:** no private keys, signing or submission in the library. The only exception is the
  dev-only fixture generator, pending Q-019.
- **Not a tax or legal tool:** no tax rules or jurisdiction-specific advice. Measurement policy
  (IFRS/ASU 2023-08) is the user's choice.
- **No app UI.** The CLI is for operators and developers.
- **Not tied to x402** or any single payment protocol.
- **Not an indexer or explorer:** no global index. We process only what the tracked accounts need.
- **No Horizon dependency** (Q-011).
- **No claim of being audited, certified or unique.**

## 3. Package layout (pnpm monorepo, ADR-0002)

```
packages/
  core/              pure domain, no I/O: Amount, AssetId, Account/ChartOfAccounts, JournalEntry,
                     validation, posting keys, reversal, rules engine, CoA templates, reports
                     computation over in-memory entries, reconciliation math
  stellar-ingest/    LedgerSource interface + RpcLedgerSource + FixtureLedgerSource; XDR decoding
                     (via @stellar/stellar-sdk), meta delta extraction, operation classifiers,
                     SEP-41/SAC event decoding, muxed/memo tagging -> EconomicEvent[]
  storage-postgres/  SQL migrations (roles, tables, triggers), repositories, idempotent poster,
                     checkpoints, advisory locking, retry
  reports/           report builders over a repository interface; CSV/JSON writers; period close
  cli/               `stellarbooks` CLI: init, ingest, post, report, reconcile, close-period
examples/            runnable: in-memory quick start, testnet ingest to Postgres, custom rule
tools/fixture-gen/   dev-only (unpublished) testnet fixture generator + capture (Q-019)
fixtures/            committed raw XDR + expected events + expected journal (golden)
docs/                architecture, domain model, accounting rules, Stellar mapping, ADRs, research
issues-backlog/      30-50 Wave-ready issue drafts (not created on GitHub)
```

Dependency direction: `cli → reports, storage-postgres, stellar-ingest → core`. `core` depends on
nothing at runtime.

## 4. Data model

**Core types (TypeScript):**

- `AssetId`: `native` | `classic:CODE:ISSUER` | `pool:<hex>` | `sep41:<C…>`, plus `scale`.
- `Amount { asset: AssetId; units: bigint }`.
- `Account { code, name, type: asset|liability|equity|income|expense, parent?, tags }`, with system
  accounts `Conversion`, `Suspense`, `Fees:Network`, `Equity:RetainedEarnings`.
- `EconomicEvent`: a discriminated union with `source: { network, ledger, closeTime, txHash,
feeBumpHash?, opIndex?, eventIndex? }`, `subject` (the tracked account plus muxed id), memo,
  counterparty, and amounts.
- `JournalEntry { postingKey, bookId, date, ledger, description, lines: JournalLine[], reverses?,
ruleId, ruleSetVersion, sourceRef, hash }` and `JournalLine { account, amount: Amount, memo?,
counterparty?, tags }`.
- `PostingKey`: a canonical string built from network, ledger, tx hash, op index, event index, rule
  ID and rule-set version (ADR-0006, Q-022).

**PostgreSQL schema (v1):**

| Table                | Purpose                                                           | Integrity                                                 |
| -------------------- | ----------------------------------------------------------------- | --------------------------------------------------------- |
| `book`               | one set of books (tracked accounts, network, functional currency) |                                                           |
| `ledger_account`     | chart of accounts per book                                        | unique (book, code)                                       |
| `asset`              | asset registry, with scale and provenance                         | unique id                                                 |
| `economic_event`     | normalized events (audit trail of derivation)                     | unique source key; append-only                            |
| `journal_entry`      | header                                                            | unique `posting_key`; append-only; `reverses_entry_id` FK |
| `journal_line`       | lines, `numeric(39,0)` signed amount                              | CHECK ≠ 0; deferred balance trigger; append-only          |
| `source_checkpoint`  | last fully processed ledger per (book, source)                    |                                                           |
| `price_quote`        | valuation inputs with provenance                                  | append-only                                               |
| `period`             | open/closed periods; posting into closed period rejected          |                                                           |
| `reconciliation_run` | results of proofs (expected, actual, diff per asset)              | append-only                                               |

**Roles:** `stellarbooks_owner` (migrations) and `stellarbooks_app` (SELECT/INSERT only on
append-only tables).

## 5. Public API (sketch, to be refined in M1/M2)

```ts
// core
createBook(config): Book
defineRule(rule: MappingRule): MappingRule
templates.freelancer | templates.merchant | templates.payroll
mapEvents(events, rules, chart): JournalEntry[]          // pure, deterministic
validateEntry(entry): Result<JournalEntry, ValidationError[]>
reverseEntry(entry, reason): JournalEntry
trialBalance(entries, asOf): TrialBalance
reconcile(computed, onChain): ReconciliationReport

// stellar-ingest
interface LedgerSource { ledgers(range): AsyncIterable<LedgerCloseMetaRecord> }
new RpcLedgerSource({ rpcUrl, network })
new FixtureLedgerSource(dir)
extractEvents(ledger, tracked: TrackedSet): EconomicEvent[]

// storage-postgres
migrate(connectionString)
createRepository(pool): JournalRepository
postEntries(repo, entries): PostResult   // idempotent

// reports
generalLedger | accountStatement | balanceSnapshot | closePeriod | toCsv | toJson
```

Every exported symbol carries TSDoc, and TypeDoc fails the build on undocumented exports.

## 6. Testing strategy

- **Unit tests:** every module in `core` and every classifier.
- **Property-based tests (fast-check):**
  - Generated entries always balance per asset or are rejected.
  - Mapping then replay is deterministic, giving byte-identical entries and hashes.
  - An entry plus its reversal nets to zero per account per asset.
  - Out-of-order and duplicate ingestion yields the same journal as in-order ingestion.
  - Amount formatting and parsing round-trips.
- **Golden fixtures:**
  - **Contents:** raw XDR of real testnet transactions, with the expected `EconomicEvent[]` and the
    expected journal as reviewed JSON.
  - **Coverage:** at least one per handled operation type and Soroban token event, including failed
    transactions, fee-bump, sponsorship, muxed and memo cases.
  - **Capture:** by `tools/fixture-gen` (Q-019). Testnet resets, so fixtures are committed.
- **Integration tests:**
  - **Postgres:** a real Postgres in Docker (15 and 18). Tests cover the triggers (an unbalanced
    insert fails, update/delete fails, a duplicate is a no-op) and the repository.
  - **Testnet:** RPC smoke tests, opt-in through an environment variable so CI is not flaky.
- **Reconciliation test:** the ingested journal balance at ledger L equals the ledger-entry balance
  (from meta and `getLedgerEntries`) for the fixture accounts.
- **CI (GitHub Actions):** lint, typecheck, unit and property tests, Postgres integration, TypeDoc
  with no warnings, `pnpm audit`, and a docs link check.

## 7. Milestones

Each milestone ends with: tests, lint and typecheck green; docs updated; a conventional commit; and a
status report to the maintainer.

| #   | Milestone                | Key deliverables                                                                                                                                                           |
| --- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0  | Scaffolding              | workspace, tsconfig, lint/format, vitest, CI, LICENSE, CONTRIBUTING, CoC, SECURITY, CHANGELOG, templates, README skeleton, doc skeletons                                   |
| M1  | Core domain              | Amount/AssetId, CoA + templates, JournalEntry validation, posting key, reversal, rules engine, property tests, DOMAIN-MODEL.md                                             |
| M2  | Fixtures                 | `tools/fixture-gen`, testnet capture of every operation type, fixture format doc                                                                                           |
| M3  | Stellar ingest (classic) | LedgerSource (fixture, RPC), XDR decode, meta deltas, classifiers incl. fees/fee-bump/failed/sponsorship/muxed/memo; golden tests; STELLAR-MAPPING.md, ACCOUNTING-RULES.md |
| M4  | Soroban                  | SAC + SEP-41 event decoding (pre/post P23 formats), CAP-67 cross-check, fixtures                                                                                           |
| M5  | Storage                  | migrations, roles, triggers, repository, idempotent posting, checkpoints, retries; integration tests                                                                       |
| M6  | Reports + period close   | GL, TB, statement, snapshot, close, CSV/JSON; golden report tests                                                                                                          |
| M7  | Reconciliation           | proof at ledger L, persisted runs, CLI command                                                                                                                             |
| M8  | Valuation                | PriceSource interface, provenance, manual/CSV price source; no hardcoded rates                                                                                             |
| M9  | CLI + examples           | `stellarbooks` CLI, three runnable examples                                                                                                                                |
| M10 | Docs + Wave readiness    | ARCHITECTURE, API reference, ROADMAP, issues-backlog (30-50), final report                                                                                                 |

## 8. Known limitations (planned to be stated in the README)

- A full-history backfill needs a data-lake-backed RPC (or a future lake reader). Plain RPC holds
  about 7 days.
- Backfill scans whole ledger ranges, because there is no per-account index.
- Non-SAC SEP-41 tokens rely on contract events, which are a weaker guarantee than meta deltas.
- Liquidity-pool fee income is not observable per trade.
- Fixtures cover testnet on the current protocol. Older protocol eras are decoded but have less test
  coverage.

## 9. Decisions needed before Phase 2

See `docs/OPEN-QUESTIONS.md`: Q-001 to Q-003, and Q-010 to Q-019. The proposed default is listed for
each.
