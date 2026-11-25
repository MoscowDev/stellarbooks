# StellarBooks

[![CI](https://github.com/MoscowDev/stellarbooks/actions/workflows/ci.yml/badge.svg)](https://github.com/MoscowDev/stellarbooks/actions/workflows/ci.yml)
[![Testnet](https://github.com/MoscowDev/stellarbooks/actions/workflows/testnet.yml/badge.svg)](https://github.com/MoscowDev/stellarbooks/actions/workflows/testnet.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

StellarBooks is a pre-alpha TypeScript library that turns Stellar network activity into
double-entry accounting records. It reads ledgers from Stellar RPC, works out what each tracked
wallet gained, spent or exchanged, and produces balanced, append-only journal entries with
reports and an exact reconciliation against the chain.

It is meant to be embedded by Stellar applications that need books, such as payroll, remittance,
invoice finance, streaming payments and merchant tools. It is a library, not an app: there is no UI,
it never handles secret keys, and it is not a tax tool.

## How it works

```text
Stellar RPC ──► stellar-ingest ──► economic events ──► core rules ──► journal entries ──► reports
getLedgers      decode every        fee, transfer,     chart-of-       balanced per        ledger, trial
                transaction,        exchange, escrow,  accounts        asset, with         balance,
                balance changes     suspense           templates       idempotent keys     CSV/JSON
                                                                             │
                                                         storage-postgres ◄──┘ append-only journal
```

- **Exact money.** Amounts are `bigint` minor units (stroops for XLM), never floating point.
- **Balanced by construction.** Every entry balances per asset, checked in code and in PostgreSQL.
- **Append-only and replayable.** Entries are never edited; corrections are reversing entries.
  Each entry has a deterministic posting key, so replaying a ledger posts nothing twice.
- **Nothing is dropped.** A balance change the library cannot explain yet goes to a suspense
  account for review, so the journal always matches the chain.

## Quick start

Requires Node.js 22.13 or later and pnpm 11 to develop (the packages themselves declare Node.js
22.12 or later). The packages are not published to npm yet, so use
them from this repository:

```sh
pnpm install --frozen-lockfile
pnpm run build
node examples/whole-ledger.mjs
```

[`whole-ledger.mjs`](examples/whole-ledger.mjs) decodes all 25 transactions of a captured
testnet ledger, books three wallets' activity (a payment, a swap and a Soroban call), prints a
trial balance, and checks that every wallet balance in the journal equals its change on chain.
It runs offline.

Other runnable examples:

- `node examples/raw-payment.mjs` books a single captured XLM payment and reconciles it against a
  balance snapshot. Add `--custom-rule` to see a custom mapping rule.
- `node packages/cli/dist/bin.js demo --mismatch` shows a one-stroop reconciliation mismatch and
  exits with status 1.

## Use it in code

The snippet below reads live ledgers. It also needs `@stellar/stellar-sdk` (for `Networks`) in
your application.

```ts
import { Networks } from '@stellar/stellar-sdk';
import { freelancerTemplate, mapEvents } from '@stellarbooks/core';
import { trialBalance } from '@stellarbooks/reports';
import { RpcLedgerSource, extractEvents } from '@stellarbooks/stellar-ingest';

const tracked = new Set(['G...']); // the wallets you keep books for
const { chart, ruleSet } = freelancerTemplate();
const source = new RpcLedgerSource({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  network: 'testnet',
  networkPassphrase: Networks.TESTNET,
});

for await (const ledger of source.ledgers(startLedger, endLedger)) {
  const { entries, unmatched, failures } = mapEvents(extractEvents(ledger, tracked), ruleSet, {
    chart,
    trackedWallets: tracked,
  });
  // Post `entries` with @stellarbooks/storage-postgres, or report on them directly:
  console.log(trialBalance(entries));
}
```

Built-in chart-of-accounts templates cover freelancer, merchant and payroll books, and
`extendRuleSet` adds your own rules ahead of them. See the
[accounting rules](docs/ACCOUNTING-RULES.md) for what each Stellar operation becomes.

## What works today

| Package                                                   | Available                                                                                                                                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`core`](packages/core/README.md)                         | Exact amounts and asset IDs, chart-of-accounts templates, mapping rules, per-asset journal validation, deterministic keys, reversing entries, reconciliation against a balance snapshot          |
| [`stellar-ingest`](packages/stellar-ingest/README.md)     | Whole-ledger decoding from RPC: fees (fee-bumps, failed transactions, Soroban refunds), memos, muxed IDs, and every account and trustline balance change. Classification of the operations below |
| [`storage-postgres`](packages/storage-postgres/README.md) | Migrations, idempotent posting with atomic checkpoints, database-enforced balancing and immutability, and period cutoffs checked by the repository                                               |
| [`reports`](packages/reports/README.md)                   | General ledger, trial balance, account statements, balance snapshots, CSV and JSON export, exact valuation with recorded rate provenance                                                         |
| [`cli`](packages/cli/README.md)                           | An offline demo command                                                                                                                                                                          |

Classified today: payments (including muxed addresses), account creation and merge, path payments
to self, claimable-balance creation, clawbacks and liquidity-pool deposits. Fees are booked for
every transaction, including failed ones.

## Current limits

- **Not classified yet:** Soroban token events, offer fills, path payments to another account and
  claimable-balance claims. Their balance changes reach the journal through the suspense account.
- **Not built yet:** closing journal entries, persisted reconciliation runs and price quotes, an
  independent on-chain balance proof at a given ledger, and operational CLI commands.
- **History:** plain Stellar RPC keeps only recent ledgers. Full backfills need a provider with
  longer retention ([ADR-0003](docs/adr/0003-ingestion-source.md)).
- StellarBooks is unaudited, pre-alpha software. It provides no tax, accounting or legal advice.

See the [roadmap](docs/ROADMAP.md) for what comes next.

## How it is verified

- **Unit and property-based tests** for the accounting invariants: entries always balance, replay is
  deterministic, and reversals net to zero.
- **Real ledgers:** ten unmodified testnet ledgers are committed under [`fixtures/`](fixtures/README.md),
  with exact assertions cross-checked between operation data and ledger-entry changes.
- **Live testnet:** a [scheduled job](.github/workflows/testnet.yml) books every wallet in recent
  testnet ledgers and requires zero mapping failures and an exact match with on-chain changes.
- **PostgreSQL 15 and 18** integration tests run in CI, along with typecheck, lint, formatting,
  generated API docs and a dependency audit.

Run the main checks locally with `pnpm run check`, and the dependency audit with `pnpm run audit`. The
[PostgreSQL guide](packages/storage-postgres/README.md) explains the database test.

## Documentation

| If you want to…                       | Read                                                                                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Understand the design                 | [Architecture](docs/ARCHITECTURE.md), [domain model](docs/DOMAIN-MODEL.md), [decision records](docs/adr/)                                    |
| Know how Stellar data becomes entries | [Stellar mapping](docs/STELLAR-MAPPING.md), [accounting rules](docs/ACCOUNTING-RULES.md)                                                     |
| Look up an API                        | Run `pnpm run docs:api` and open `docs/api/index.html`                                                                                       |
| Contribute                            | [Contributing guide](CONTRIBUTING.md), [roadmap](docs/ROADMAP.md), [issue drafts](issues-backlog/), [open questions](docs/OPEN-QUESTIONS.md) |
| Review the Stellar Wave submission    | [Submission notes](docs/WAVE-SUBMISSION.md)                                                                                                  |
| See related projects                  | [Prior art](docs/prior-art.md)                                                                                                               |

## Security and conduct

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md). Everyone taking part
agrees to the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) © StellarBooks contributors
