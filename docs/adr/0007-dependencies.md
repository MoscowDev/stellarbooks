# ADR-0007: Runtime and development dependencies

- Status: Accepted
- Approved: 2026-11-16 (maintainer approved PLAN.md with defaults)
- Date: 2026-11-16

Versions are from npm on 2026-11-16 (docs/research/tooling-libraries.md, stellar-js-sdk.md). All
versions are pinned exactly.

| Package | Version | Licence | Used in | Why |
|---|---|---|---|---|
| @stellar/stellar-sdk | 17.4.0 | Apache-2.0 | stellar-ingest | Official SDK; XDR for Protocol 30; `rpc.Server`. `@stellar/stellar-base` is deprecated and must not be added. |
| pg | 8.23.1 | MIT | storage-postgres | Mature, widely used; returns int8/numeric as strings (exact). Wrapped behind an internal executor interface. |
| @types/pg | 8.23.1 | MIT | dev | Types for pg. |
| vitest | 5.1.0 | MIT | dev | Test runner with native ESM/TS support. |
| fast-check | 4.10.2 | MIT | dev | Property-based tests. |
| typedoc | 0.28.20 | Apache-2.0 | dev | API reference from TSDoc. |
| typescript | latest 6.0.x | Apache-2.0 | dev | See ADR-0002. |

The linter, formatter, CLI argument parser and CSV writer will be chosen at the start of Phase 2,
after reading their READMEs and types, and recorded here as an amendment before acceptance.

## Rejected
- `node-pg-migrate` 9.0.0: removed on 2026-11-18. The existing runner uses pg and a SQL file, and the unused migration dependency brought in an affected version of glob.
- `postgres` (porsager) 4.1.1: Unlicense, a single maintainer, and a fresh major (2026-10-29) that
  changed bigint parameter typing.
- `@stellar/stellar-base`: deprecated, and folded into the SDK.
