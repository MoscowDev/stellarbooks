# ADR-0011: Whole-ledger decoding, residual suspense and transfer event indexes

- Status: Proposed (implemented in commit 549ccb2; awaiting maintainer review)
- Date: 2026-11-25
- Refines: ADR-0003 (ingestion source) and ADR-0008 (derivation precedence)

## Context

ADR-0003 and ADR-0008 chose raw ledger metadata as the source of truth and ledger-entry changes as
the source of amounts. Until this change, the only decoder accepted a single unmuxed XLM payment,
and `RpcLedgerSource` rejected every real ledger. Running a whole-ledger decoder against live
testnet traffic exposed four classifier defects that synthetic fixtures had not:

- a claimable-balance claim was booked as a `release` for every other tracked wallet;
- when both sides of a transfer were tracked, both events had the same source position, so the
  second entry was rejected as a duplicate;
- sponsored accounts created with 0 XLM produced invalid zero-amount events;
- an unexplained change was hidden when another event touched the same wallet and asset.

Sources: [transactions, fees and results](../research/stellar-transactions-fees-results.md)
(§2.2 refunds, §4.2 balance changes), [claimable balances and muxed accounts](../research/stellar-cb-lp-clawback-merge-muxed-memo.md),
and the SDK's installed type definitions ([SDK notes](../research/stellar-js-sdk.md)).

## Decision

1. **`decodeLedger`** decodes every transaction in a `LedgerCloseMeta`. The fee payer is the
   fee-bump `feeSource` if present, otherwise the transaction source. Balance deltas are computed per
   change list as in research §4.2, for accounts and trustlines only. Operation deltas carry their
   `opIndex`. Failed transactions have no operation deltas.
2. **Fee integrity check.** The fee payer's XLM changes in `feeProcessing`,
   `postTxApplyFeeProcessing` and transaction-level changes must net to exactly
   `-TransactionResult.feeCharged`, and no other account may appear in fee processing. Any
   difference throws instead of producing a wrong journal.
3. **Net fees.** The classifier books one `fee` event for `feeCharged`, which is already net of any
   Soroban refund. This deviates from ADR-0008, which asks for separate charge and refund events
   (Q-043, issue 05). Totals are exact either way.
4. **Residual to suspense.** Records from `decodeLedger` set `deltasComplete: true`. The classifier
   then compares each tracked wallet's actual change per asset with what its events explain, and
   posts any difference as `unclassified_change`. Normalized input without that flag keeps the
   earlier wallet-and-asset matching.
5. **Transfer sides are separate facts.** Within an operation, the sender side of a transfer has
   `eventIndex` 0 and the receiver side has `eventIndex` 1; contract event *i* uses `2i` and `2i + 1`.
   Suspense events start at `eventIndex` 1000, plus the position of their wallet and asset among
   all of the transaction's balance changes, sorted. None of these indexes depends on which wallets
   are tracked, so a wallet's keys stay stable if its counterparty is tracked later.
6. **No guessing.** Claimable-balance claims emit no escrow event, because the ledger entry does not
   record its creator (Q-042). Zero-value creations and merges emit no transfer. Muxed addresses
   reduce to their base account; the IDs travel as `muxedId` and `counterpartyMuxedId`.
7. **`RpcLedgerSource`** requires a `networkPassphrase` and checks it against the server's
   `getNetwork` before reading.

## Consequences

- **Positive:** real ledgers decode end to end. A run over 200 live testnet ledgers (about 4,300
  transactions) produced no mapping failures, and journal wallet totals matched decoded changes
  exactly. A scheduled CI job repeats this check daily on the 50 most recent ledgers.
- **Negative:** more activity lands in suspense until classifiers exist for Soroban events, offer
  fills, path payments to other accounts and claims. Posting keys for receiver-side and suspense
  events changed; no data had been published, so no migration is needed.
- **Related fix:** the template rule for clawbacks and burns (`transfer-write-off`) now comes before
  `transfer-internal`. A destroyed amount has no receiving wallet, so booking it through internal
  clearing when the issuer is tracked would leave account 1190 unbalanced.
- **Not yet implemented from ADR-0003:** the `getHealth` retention check, the CAP-67 event
  cross-check and the data-lake reader. `RpcLedgerSource` pages by start ledger rather than cursor.

## Alternatives considered

- **Keep per-transaction decoders for each operation:** rejected; it cannot guarantee that every
  balance change is seen.
- **Infer the claimable-balance creator from the entry's sponsor:** rejected; the sponsor is not
  necessarily the creator.
- **Number events in emission order:** rejected; keys would change with the tracked wallet set.
