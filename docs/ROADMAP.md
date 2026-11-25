# StellarBooks roadmap

The [approved plan](../PLAN.md) defines the target library and its milestones. This page tracks
where each milestone stands. [Open questions](OPEN-QUESTIONS.md) record decisions and verification
gaps, and the [issue drafts](../issues-backlog/) break the remaining work into contributor-sized
pieces.

## Milestone status

| Milestone (PLAN.md)         | Status      | Evidence and what remains                                                                                                                                                                                                                                             |
| --------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 Scaffolding              | Done        | Workspace, CI (typecheck, lint, format, tests, API docs, audit), project documents and templates.                                                                                                                                                                     |
| M1 Core domain              | Done        | Amounts, chart templates, rules, validation, keys and reversals, with property-based tests.                                                                                                                                                                           |
| M2 Fixtures                 | Mostly done | Ten real testnet ledgers with exact assertions, and a capture tool. Remaining: operations rare on testnet, such as pool withdrawals (issue 34).                                                                                                                       |
| M3 Stellar ingest (classic) | Mostly done | Whole-ledger decoding with fee checks and a scheduled live test. Remaining: offer fills (15), path payments to others (08, 09), claims (12, Q-042), refund events (05), fee-bump keys (31, Q-022).                                                                    |
| M4 Soroban                  | Not started | Contract events are not decoded; their balance changes reach suspense. Issues 18, 19, 42.                                                                                                                                                                             |
| M5 Storage                  | Mostly done | Migrations, database-enforced integrity and atomic checkpoints, tested on PostgreSQL 15 and 18. Remaining: book and chart registration (Q-036), resume and gap detection (36), per-book posting keys (43), PostgreSQL entry filters (44), replay content checks (45). |
| M6 Reports and period close | Mostly done | Ledger, trial balance, statements, snapshots, CSV/JSON and period cutoffs. Remaining: closing entries (37).                                                                                                                                                           |
| M7 Reconciliation           | Partly done | Exact comparison against a supplied snapshot. Remaining: reading the snapshot from the chain at a ledger (28) and persisted runs (38).                                                                                                                                |
| M8 Valuation                | Partly done | Exact valuation with recorded provenance and a manual price source. Remaining: CSV price source and persisted quotes (39).                                                                                                                                            |
| M9 CLI and examples         | Partly done | Offline demo command and two tested examples. Remaining: operational commands (30).                                                                                                                                                                                   |

## Next priorities

1. **Stellar Wave:** the four first-Wave issues in the [submission notes](WAVE-SUBMISSION.md).
2. **Fewer suspense entries:** Soroban token events (18, 19), offer fills (15), path payments to
   other accounts (08, 09) and claimable-balance claims (12).
3. **Operations:** book and chart registration, resume with gap detection (36), and CLI commands (30).
4. **Proof:** an on-chain balance snapshot at a given ledger for independent reconciliation (28).
