# StellarBooks (working title)

StellarBooks is an open-source TypeScript library, currently in development. It turns activity on
the [Stellar](https://stellar.org) network into double-entry accounting records that you can audit.
It is meant to be embedded in other Stellar projects, such as payroll, invoice finance, remittance,
streaming payments and merchant apps.

> **Status: pre-alpha, not usable yet.** The repository holds the research, the plan and the
> scaffolding. No functionality has been implemented. See [PLAN.md](PLAN.md) for milestones and
> [CHANGELOG.md](CHANGELOG.md) for progress.

## What it will do

- Read ledger data for the accounts and contracts you track (read-only, with no secret keys), and
  turn it into normalized economic events: payments, path payments, fees, claimable balances,
  liquidity pools, clawbacks, Soroban token transfers and more.
- Map those events to journal entries using configurable rules and chart-of-accounts templates.
- Store them in an append-only journal in PostgreSQL. Every entry balances in every asset. Posting is
  idempotent and deterministic, and corrections are made only with reversing entries.
- Produce a general ledger, trial balance, account statements, balance snapshots and period close,
  exported as CSV or JSON.
- Prove that computed balances equal the balances on chain at a given ledger.

## Who it is for

Developers building on Stellar who need books derived from chain activity, and who want to check how
each figure was produced.

## Honest limitations

- **Not a tax tool and not legal advice.** Measurement policy (for example IFRS or US GAAP treatment
  of crypto assets), tax rules and cost-basis choices remain with the user and their advisers.
- **Not audited or certified.** No third party has reviewed this software.
- **Full history needs a suitable data source.** By default, Stellar RPC keeps about 7 days of
  transactions. A complete backfill needs an RPC node backed by a data lake. See
  [ADR-0003](docs/adr/0003-ingestion-source.md).
- **Other projects in this space.** Other Stellar bookkeeping and accounting projects exist. See
  [docs/prior-art.md](docs/prior-art.md).

## Repository layout

| Path                        | Contents                                                                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`             | Pure domain logic, with no I/O                                                                                                                             |
| `packages/stellar-ingest`   | Stellar ledger data turned into economic events                                                                                                            |
| `packages/storage-postgres` | Migrations and repositories                                                                                                                                |
| `packages/reports`          | Reports and exports                                                                                                                                        |
| `packages/cli`              | Command-line interface                                                                                                                                     |
| `docs/`                     | Architecture, domain model, accounting rules, Stellar mapping, [ADRs](docs/adr), [research notes](docs/research), [open questions](docs/OPEN-QUESTIONS.md) |

## Development

Requires Node.js 22.13 or later and pnpm 11.

```sh
pnpm install
pnpm run check   # typecheck, lint, format check, tests, API docs
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

MIT. See [LICENSE](LICENSE).
