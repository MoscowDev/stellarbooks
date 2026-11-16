# ADR-0008: Economic events come from meta deltas, classified by operations

- Status: Accepted
- Approved: 2026-11-16 (maintainer approved PLAN.md with defaults)
- Date: 2026-11-16

## Context
- **Results often lack amounts:** many result types carry no amount, for example liquidity-pool
  deposit/withdraw, claimable-balance claim and clawback (docs/research/stellar-operations.md).
- **Fees:** the amount charged is `feeCharged`, never the `fee` bid. A Soroban refund may arrive
  later in `postTxApplyFeeProcessing` (Protocol 23+).
- **Failed transactions** still pay fees.

## Decision
`stellar-ingest` emits normalized `EconomicEvent`s:
1. **Fee events** come from fee-processing changes in meta: the charge, and any refund as a separate
   event. They are attributed to the fee-paying account, which is the outer account for fee-bumps.
2. **Successful operations:** each operation is classified by its type and result. Its amounts come
   from that operation's ledger-entry changes, scoped to the tracked accounts.
3. **Failed transactions** produce only fee events.
4. **Unclassified deltas:** any ledger-entry balance delta for a tracked account that no classifier
   explains becomes an `UnclassifiedBalanceChange` event, posted to a suspense account. Nothing is
   silently dropped.
5. **Non-balance facts** (reserves, sponsorship, subentries) are emitted as metadata events for
   reporting "available vs locked". They are never journal entries, because no value moves.

## Consequences
- **Completeness:** for tracked accounts, every balance change ends up in the journal (via suspense),
  so reconciliation can be exact.
- **Risks:** classifier logic must be verified against real testnet fixtures for every operation
  type. OPEN-QUESTIONS lists the derivations not yet verified, for example OP-2 (strict-receive
  amount sent).
