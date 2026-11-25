# Architecture decision records

Each record explains one significant decision: its context, what was decided, and the
consequences. Accepted records are not edited; a change of direction is a new record that refines
or supersedes the old one ([ADR-0001](0001-record-architecture-decisions.md)). Start new records
from the [template](0000-template.md).

| ADR                                             | Decision                                                                 | Status                  |
| ----------------------------------------------- | ------------------------------------------------------------------------ | ----------------------- |
| [0001](0001-record-architecture-decisions.md)   | Record architecture decisions                                            | Accepted                |
| [0002](0002-typescript-pnpm-monorepo.md)        | TypeScript pnpm monorepo, Node 22.12+, TypeScript 6.0.x                  | Accepted                |
| [0003](0003-ingestion-source.md)                | Ingestion source is ledger meta XDR behind a pluggable `LedgerSource`    | Accepted                |
| [0004](0004-money-representation.md)            | Money is integer minor units (`bigint`), with per-asset scale            | Accepted                |
| [0005](0005-multi-asset-balancing.md)           | Balance per asset, with explicit conversion (trading) accounts          | Accepted                |
| [0006](0006-database-integrity.md)              | Database-enforced balance, append-only and idempotency                   | Accepted                |
| [0007](0007-dependencies.md)                    | Runtime and development dependencies                                     | Accepted                |
| [0008](0008-derivation-precedence.md)           | Economic events come from meta deltas, classified by operations          | Accepted                |
| [0009](0009-dev-tooling.md)                     | Lint, format and CI tooling; audit exception policy                      | Accepted                |
| [0010](0010-posting-and-source-keys.md)         | Separate source keys from posting keys (refines 0006)                    | Accepted                |
| [0011](0011-whole-ledger-decoding.md)           | Whole-ledger decoding, residual suspense and transfer event indexes      | Proposed (implemented)  |
