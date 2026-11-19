# StellarBooks

StellarBooks is a pre-alpha TypeScript library for recording Stellar activity in a
double-entry journal. It is designed for developers building payroll, remittance,
invoice finance, and merchant applications on Stellar.

## Quick start

Use Node.js 22.13 or later and the pnpm version pinned in `package.json`. From the
repository root:

```sh
pnpm install --frozen-lockfile
pnpm run build
node examples/raw-payment.mjs
```

The offline example reads committed testnet ledger **5796891** and verifies a
**10,000,000-stroop XLM payment** and **100-stroop fee** against the transaction's
balance changes. It prints separate journal entries and a trial balance. The balance
comparison uses a synthetic opening and closing balance for the selected transaction.

- Run `node examples/raw-payment.mjs --custom-rule` to apply a supplier-specific rule.
- Run `node packages/cli/dist/bin.js demo --mismatch` to see a synthetic one-stroop
  reconciliation discrepancy and exit status 1.

## What works today

| Area                                                             | Available                                                                                                                                             |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Core](packages/core/README.md)                                  | Bigint amounts, per-asset journal validation, deterministic posting keys, reversals, and configurable chart templates and rules                       |
| [Ingestion](packages/stellar-ingest/README.md)                   | Raw ledger header inspection, envelope-to-result matching, bounded RPC pagination, and decoding of one supported native-payment transaction at a time |
| [PostgreSQL](packages/storage-postgres/README.md)                | Journal posting, replay, transactional checkpoints, period cutoffs, sealed lines, and source and reversal round-trips                                 |
| [Reports](packages/reports/README.md)                            | General ledger, trial balance, account statements, balance snapshots, CSV and JSON exports, and exact valuation with manual quotes                    |
| [Reconciliation](packages/core/README.md#offline-reconciliation) | Exact comparison against a supplied ledger balance snapshot with provenance                                                                           |

## Current limits

Whole-ledger classic and Soroban decoding, independent same-ledger reconciliation,
closing journal entries, persisted reconciliation and quotes, and the operational CLI
are in progress. Full historical backfills also require a provider with suitable
retention. The library is read-only with respect to Stellar and handles public ledger data.
StellarBooks is unaudited and provides no tax or legal advice.

## Documentation and verification

- **Stellar Wave reviewers:** start with the [submission notes](docs/WAVE-SUBMISSION.md).
- **Contributors:** see the [prioritized roadmap](docs/ROADMAP.md), [open questions](docs/OPEN-QUESTIONS.md),
  and [contribution guide](CONTRIBUTING.md).
- **Integrators:** see the [architecture](docs/ARCHITECTURE.md), [domain model](docs/DOMAIN-MODEL.md),
  [accounting rules](docs/ACCOUNTING-RULES.md), and [Stellar mapping](docs/STELLAR-MAPPING.md).

Run `pnpm run check` for typechecking, lint, formatting, tests, and generated API
documentation in `docs/api/`. Run `pnpm run audit` for the dependency audit. The
[PostgreSQL package guide](packages/storage-postgres/README.md) explains how to enable the
database integration test.

MIT licensed. See [LICENSE](LICENSE).
