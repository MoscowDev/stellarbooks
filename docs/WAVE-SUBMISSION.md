# Stellar Wave submission

StellarBooks turns Stellar activity into balanced, append-only double-entry journal entries for
applications such as payroll, remittance and merchant tools. The
[quick start](../README.md#quick-start) runs offline: it decodes all 25 transactions of a captured
testnet ledger, books three wallets, prints a trial balance and checks the journal against the
chain. The ingestion package reads whole ledgers from Stellar RPC, and a scheduled CI job books every
wallet in recent live testnet ledgers and requires an exact match with on-chain changes.

## Application summary

> StellarBooks is a pre-alpha TypeScript library that gives Stellar payroll, remittance and
> merchant applications auditable double-entry books. It decodes whole ledgers from Stellar RPC,
> books fees, payments, account lifecycle, swaps, claimable balances and clawbacks with exact
> integer amounts, and posts anything it cannot classify yet, such as Soroban token events, to a
> suspense account rather than dropping it. Entries balance per asset, are append-only and are
> enforced by PostgreSQL. Our first Wave focuses on fixture coverage, pagination checks and
> examples that make the library easier to adopt.

## First Wave

These issues are independent and have concrete acceptance tests. Review their scope
against the Wave's timeline and available reviewer capacity before nominating them.

| Draft                                                                               | Contributor outcome                                                                          |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [#1 Ledger sequence validation](https://github.com/MoscowDev/stellarbooks/issues/1) | Test RPC responses that start before or after the requested ledger.                          |
| [#2 Both payment perspectives](https://github.com/MoscowDev/stellarbooks/issues/2)  | Add an independently reviewed result for the captured payment and both wallet perspectives.  |
| [#3 Account statements](https://github.com/MoscowDev/stellarbooks/issues/3)         | Add a multicommodity statement example covering quiet periods and explicit opening balances. |
| [#4 Report exports](https://github.com/MoscowDev/stellarbooks/issues/4)             | Add export round-trip coverage and an example consumer for decimal-string minor units.       |

Follow the [Drips maintainer guide](https://docs.drips.network/wave/maintainers/participating-in-a-wave/)
(checked 2026-11-25): install the Drips GitHub App, apply the public repository to a Wave Program,
and wait for approval. Each issue added to a Wave needs a complexity level, which sets its points
(Trivial 100, Medium 150, High 200). The four first-Wave issues exist on GitHub as #1 to #4
(Medium, Medium, Trivial, Trivial); the other drafts in `issues-backlog/` are not GitHub issues
yet. Assign contributors quickly and resolve issues before the
Wave ends so contributors receive their points.

Add issues #1 to #4 in the Drips dashboard after repository approval. Confirm who will review ingestion
and reporting PRs during the Wave. One maintainer can cover both areas if available.

## Verification and scope

Exact assertions cover ten captured testnet ledgers, and a scheduled CI job books recent live
testnet ledgers. Soroban event decoding, classifiers for offers and claims, and independent
on-chain balance reconciliation remain in the [roadmap](ROADMAP.md).
Review the [open questions](OPEN-QUESTIONS.md) for the dependency audit status before submission.

On 2026-11-25 every CI job passed on `main` (typecheck, lint, format, tests, API docs, dependency
audit, and PostgreSQL 15 and 18), and the testnet workflow passed against live testnet. Check the
[Actions tab](https://github.com/MoscowDev/stellarbooks/actions) for the submission revision.
