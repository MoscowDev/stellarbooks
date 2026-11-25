# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project will use
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it publishes releases.

## [Unreleased]

### Added

- **Whole-ledger ingestion:** `decodeLedger` decodes every transaction in a ledger: fee payer
  (outer source for fee-bumps), `feeCharged`, success, memo, operations, and account and trustline
  balance deltas with their operation index. It checks that fee changes net to exactly
  `-feeCharged` (ADR-0011).
- `RpcLedgerSource` decodes real ledgers. It takes a `networkPassphrase` option and checks it
  against the server before reading.
- Payment events record the tracked wallet's muxed ID and the counterparty's muxed ID.
- Path payment details include `sendAmount`/`destMin` or `sendMax`/`destAmount`.
- `toCsv` accepts `{ escapeFormulas }` (see Security).
- **Real fixtures:** `tools/fixture-gen` (`capture.js`) captures real testnet ledgers by operation
  type without keys. Nine captured ledgers are committed with exact assertions.
- **Live verification:** an opt-in testnet test (`STELLARBOOKS_TESTNET_RPC_URL`) and a scheduled CI
  job that book every wallet in recent testnet ledgers and require an exact match with on-chain
  changes.
- `examples/whole-ledger.mjs`, an offline end-to-end example, and tests that run both examples.
- ADR-0011 (whole-ledger decoding), an ADR index, and backlog issues 31 to 45.
- PostgreSQL journal posting with transactional checkpoints, period cutoffs, sealed lines, and
  source and reversal persistence. Integration checks pass on PostgreSQL 15 and 18.
- General ledger, trial balance, statements, snapshots, and CSV and JSON exports.
- Offline reconciliation using supplied snapshots and exact valuations using manual price quotes.
- A runnable offline example that verifies a captured XLM payment and fee and demonstrates a custom
  rule.
- A prioritized Stellar Wave submission guide and first-Wave issue shortlist.
- `@stellarbooks/core` (M1):
  - **Amounts and assets:** exact bigint amounts and canonical asset IDs.
  - **Chart of accounts:** with validated system accounts.
  - **Economic events:** six event kinds with validation.
  - **Journal entries:** per-asset balanced, with canonical JSON.
  - **Keys:** source and posting keys (ADR-0010).
  - **Reversals:** reversing entries.
  - **Mapping:** first-match rules engine with `extendRuleSet`.
  - **Templates:** freelancer, merchant and payroll.
  - **Balances:** balance aggregation.
  - **Tests:** unit tests and fast-check property tests (balance, reversal netting, deterministic
    and order-independent mapping, template coverage).
- Phase 0 research notes (`docs/research/`), prior-art review, ADRs 0001 to 0008 and the Phase 1
  plan.
- M0 scaffolding:
  - **Tooling:** a pnpm workspace with five package skeletons, strict TypeScript 6.0 config, ESLint
    (typed rules, plus core no-I/O and no-`parseFloat` restrictions), Prettier, Vitest, TypeDoc with
    documentation validation, and CI.
  - **Tests:** repository-structure tests.
  - **Project files:** licence, code of conduct, contributing guide, security policy, issue and PR
    templates.
  - **Doc skeletons:** architecture, domain model, accounting rules and Stellar mapping.

### Changed

- **Breaking:** `RpcLedgerSource` requires a `networkPassphrase` option.
- **Breaking:** the receiver side of a transfer now has `eventIndex` 1 (the sender side keeps 0), so
  receiver-side posting keys changed (ADR-0011).
- Documentation rewritten to match the implementation: README, architecture, domain model,
  accounting rules, Stellar mapping, roadmap, package guides and contributing guide.
- Added `repository`, `homepage` and `bugs` metadata for `github.com/MoscowDev/stellarbooks` and
  enabled source links in the generated API reference (Q-003).
- `SECURITY.md` and `CODE_OF_CONDUCT.md` point to GitHub private vulnerability reporting for
  security and conduct reports (Q-004). The copyright holder stays "StellarBooks contributors"
  (Q-002).
- Renamed the synthetic classifier dataset from `fixtures/data/golden-fixtures.ts` to
  `fixtures/data/synthetic-cases.ts` (`GOLDEN_FIXTURES` is now `SYNTHETIC_CASES`). Each case is
  tagged `provenance: 'synthetic'`, and the fixtures guide states that these cases use invented
  ledgers and mapper-generated expectations, so they do not verify chain behavior (Q-035).
- Ignored the local `.pnpm-store/` directory.

### Fixed

- A muxed transaction source keeps its muxed ID (`sourceMuxed`, `muxedId`, `counterpartyMuxedId`);
  it was reduced to the base address and the ID was lost.
- Suspense (`unclassified_change`) event indexes no longer depend on which wallets are tracked, so
  replaying after tracking another wallet cannot post the same suspense amount twice.
- A clawback or burn is booked as a write-off even when the issuer is also tracked; it was booked
  through internal clearing (1190), which never netted to zero.
- `claim_claimable_balance` no longer books a `release` for every unrelated tracked wallet. Claims
  go to suspense until they can be matched to a lock (Q-042).
- When both sides of a transfer are tracked, the two events have distinct source positions, so the
  second entry is no longer rejected as a duplicate.
- Sponsored `create_account` with a 0 starting balance and merges of empty accounts no longer
  produce invalid zero-amount events.
- With complete deltas, the classifier compares amounts per wallet and asset, so an unexplained part
  of a change reaches suspense instead of being hidden by another event in the same asset.

### Security

- `toCsv` neutralizes text cells that a spreadsheet could evaluate as formulas (for example a
  Stellar memo beginning with `=`) by prefixing `'`. Numbers are unchanged. Pass
  `{ escapeFormulas: false }` to disable this for programmatic consumers (Q-040).
