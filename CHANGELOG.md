# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project will use
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it publishes releases.

## [Unreleased]

### Added

- A runnable offline example that verifies a captured XLM payment and fee and demonstrates a custom rule.
- PostgreSQL journal posting with transactional checkpoints, period cutoffs, sealed lines, and
  source and reversal persistence. Integration checks passed on PostgreSQL 15 and 18.
- General ledger, trial balance, statements, snapshots, and CSV and JSON exports.
- Offline reconciliation using supplied snapshots and exact valuations using manual price quotes.
- A prioritized Stellar Wave submission guide and first-Wave issue shortlist.

- M1 `@stellarbooks/core`:
  - **Amounts and assets:** exact bigint amounts and canonical asset IDs.
  - **Chart of accounts:** with validated system accounts.
  - **Economic events:** six event kinds with validation.
  - **Journal entries:** per-asset balanced, with canonical JSON.
  - **Keys:** source and posting keys (ADR-0010).
  - **Reversals:** reversing entries.
  - **Mapping:** first-match rules engine with `extendRuleSet`.
  - **Templates:** freelancer, merchant and payroll.
  - **Balances:** balance aggregation.
  - **Tests:** unit tests and fast-check property tests (balance, reversal netting, deterministic and order-independent mapping, template coverage).
- Phase 0 research notes (`docs/research/`), prior-art review, ADRs 0001–0008 and the Phase 1 plan.
- M0 scaffolding:
  - **Tooling:** a pnpm workspace with five package skeletons, strict TypeScript 6.0 config, ESLint
    (typed rules, plus core no-I/O and no-`parseFloat` restrictions), Prettier, Vitest, TypeDoc with
    documentation validation, and CI.
  - **Tests:** repository-structure tests.
  - **Project files:** licence, code of conduct, contributing guide, security policy, issue and PR
    templates.
  - **Doc skeletons:** architecture, domain model, accounting rules and Stellar mapping.
