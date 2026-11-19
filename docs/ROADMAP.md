# StellarBooks roadmap

The [approved plan](../PLAN.md) defines the target library. The [open questions](OPEN-QUESTIONS.md)
track implementation decisions and verification gaps.

## Priority order

| Priority                         | Status and completion evidence                                                                                                                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stellar Wave submission**      | The offline raw-payment and custom-rule examples run from the committed ledger. The [submission notes](WAVE-SUBMISSION.md) identify four contributor drafts, verification results, and the scope to communicate to reviewers. |
| **Whole-ledger ingestion**       | Expand from one verified XLM payment and fee to classic and Soroban operations, including refunds and sponsorship. Demonstrate contiguous backfill and replay.                                                                |
| **Accounting workflows**         | Add closing journal entries, reconciliation and quote persistence, and CSV price input. The posting cutoff, offline comparison, and exact valuation are implemented.                                                          |
| **Operational CLI and examples** | Add commands and runnable PostgreSQL workflows. The offline payment, custom-rule, and mismatch demos are available.                                                                                                           |

Fresh testnet capture and live verification are deferred. That pass will add real operation and event fixtures, independently reviewed expected entries, and a same-ledger on-chain balance proof.

## Verified milestones

Core amount and journal invariants, mapping templates, and report exports are exercised
by the offline suite. The PostgreSQL 15 and 18 integration test passed for concurrent
replay, rollback, cutoff enforcement, line sealing, and metadata round-trips.
The [30 local issue drafts](../issues-backlog/) include work beyond the first Wave.
