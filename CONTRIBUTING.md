# Contributing to StellarBooks

Thank you for your interest. This project puts **correctness, auditability and documentation** ahead
of speed. Please read this guide before opening a pull request.

## Ground rules

1. **Docs first.** Before you change behaviour that depends on Stellar, an SDK or a library, read the
   current official documentation. If the behaviour is new to the project, add or update a note in
   `docs/research/`, with source URLs and the date you retrieved them.
2. **Never guess.** If documentation is unclear, add an entry to
   [docs/OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md) and raise it in the issue. Do not invent
   behaviour, function names, endpoints or fields.
3. **Money is exact.** Amounts are `bigint` minor units. Never use floating point for money
   (ADR-0004).
4. **The journal is append-only.** Never update or delete posted entries. Corrections use reversing
   entries (ADR-0006).
5. **No secrets.** The library is read-only and never handles secret keys. Do not log sensitive data.
6. **Understand your change.** Submissions you cannot explain, including unreviewed AI-generated code,
   will be closed.

## Definition of done

A change is done only when all of the following hold:

- Tests cover it: unit tests, plus property-based tests or captured-ledger fixtures where relevant.
- `pnpm run check` passes (typecheck, lint, format, tests, API docs).
- Every exported symbol has TSDoc.
- The relevant docs are updated: README, `docs/*.md`, ADRs, `docs/ACCOUNTING-RULES.md` for mapping
  changes, and `CHANGELOG.md` under "Unreleased".

## Workflow

1. Pick an issue, or open one describing the problem. Wait to be assigned before starting work.
2. Create a branch from `main`.
3. Use [Conventional Commits](https://www.conventionalcommits.org/), for example
   `feat(core): add reversal entries` or `fix(ingest): handle fee-bump refunds`.
4. Open a pull request using the template, and reference the issue with `Closes #N`.
5. A maintainer reviews it. Expect requests for tests or documentation.

## Development setup

```sh
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run docs:api
```

Requires Node.js 22.13 or later and pnpm 11. `pnpm run check` runs everything CI runs except the
dependency audit (`pnpm run audit`) and the opt-in suites below.

## Tests

| Suite                    | Where                                                            | How to run                                                                                         |
| ------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Unit and property-based  | `packages/*/test`, `test/`                                       | `pnpm run test`                                                                                    |
| Captured testnet ledgers | `packages/stellar-ingest/test/{ledger-decoder,captured}.test.ts` | `pnpm run test` (offline, uses `fixtures/data`)                                                    |
| PostgreSQL integration   | `packages/storage-postgres/test/checkpoint.postgres.test.ts`     | Set `STELLARBOOKS_TEST_DATABASE_URL`; see the [storage guide](packages/storage-postgres/README.md) |
| Live testnet             | `packages/stellar-ingest/test/rpc-source.testnet.test.ts`        | Set `STELLARBOOKS_TESTNET_RPC_URL=https://soroban-testnet.stellar.org`                             |

Fixtures must be real chain data or clearly labelled synthetic cases; see
[fixtures/README.md](fixtures/README.md). To add a real ledger for an operation, use
`tools/fixture-gen` (`capture.js`), then write exact assertions and check amounts against a second
source in the same XDR. Never derive expected journal entries by running the mapper under test.

## Architecture decisions

Significant decisions are recorded in [docs/adr/](docs/adr). To change one, propose a new ADR that
supersedes it. Do not edit an accepted ADR.

## Code of Conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
