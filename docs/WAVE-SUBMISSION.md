# Stellar Wave submission

StellarBooks helps Stellar apps record payments and network fees in a double-entry journal.
The [quick start](../README.md#quick-start) runs against a committed testnet ledger offline.
It checks one classic XLM payment and its fee against balance changes in the captured XDR,
then prints journal entries and a trial balance. Its reconciliation uses synthetic balances.

## Application summary

> StellarBooks is a pre-alpha TypeScript library for Stellar payroll, remittance, and merchant
> applications that need double-entry records for on-chain activity. The offline quick start
> reads a captured testnet ledger, verifies one XLM payment and its fee against XDR account
> changes, and produces balanced journal entries and a trial balance. It also demonstrates
> customizing an accounting rule. The reconciliation example uses synthetic balances.
> Whole-ledger classic and Soroban ingestion is in development. Our first Wave would focus on
> fixture coverage, pagination checks, and examples that make the library easier to adopt.

## First Wave

These draft issues are independent and have concrete acceptance tests. Review their scope
against the Wave's timeline and available reviewer capacity before nominating them.

| Draft                                                               | Contributor outcome                                                                          |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [Ledger continuity](../issues-backlog/02-ledger-continuity.md)      | Test RPC responses that start before or after the requested ledger.                          |
| [Native payment fixtures](../issues-backlog/07-classic-payments.md) | Add an independently reviewed result for the captured payment and both wallet perspectives.  |
| [Account statements](../issues-backlog/26-statements.md)            | Add a multicommodity statement example covering quiet periods and explicit opening balances. |
| [Report exports](../issues-backlog/27-report-export.md)             | Add export round-trip coverage and an example consumer for decimal-string minor units.       |

Follow the [Drips maintainer guide](https://docs.drips.network/wave/maintainers/participating-in-a-wave/)
to apply the public repository. Assign a reviewer to each nominated issue and check
applications and pull requests daily during the Wave.

Nominate the four drafts after repository approval. Confirm who will review ingestion
and reporting PRs during the Wave. One maintainer can cover both areas if available.

## Verification and scope

The captured demonstration covers one transaction. Whole-ledger ingestion, broader operation
coverage, and independent testnet reconciliation remain in the [roadmap](ROADMAP.md).
Review the [open questions](OPEN-QUESTIONS.md) for the dependency audit status before submission.

The 2026-11-19 verification recorded 160 passing offline tests, one skipped database case in the offline run, and successful PostgreSQL 15 and 18 integration runs in the storage pass. The dependency audit passed under the configured policy on that date. Rerun checks against the submission revision.
