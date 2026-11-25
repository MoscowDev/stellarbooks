# Stellar Mapping

How Stellar data is turned into `EconomicEvent`s: which XDR fields are read, and how amounts,
counterparties, memos and muxed IDs are found.

`decodeLedger` (`packages/stellar-ingest/src/deltas/ledger-decoder.ts`) turns one ledger's
`LedgerCloseMeta` into normalized transaction records. `classifyTransaction` turns those records
into events for the tracked wallets. [ACCOUNTING-RULES.md](ACCOUNTING-RULES.md) lists what each
operation becomes and how it was verified.

## Sources of truth (ADR-0003, ADR-0008)

1. **Balance deltas:** ledger-entry changes in `TransactionMeta`.
2. **Classification:** operation type and result.
3. **Fees:** `feeCharged` and the fee-processing changes.
4. **Cross-check:** CAP-67 / SAC events, when present (not decoded yet).
5. **Non-SAC SEP-41 tokens:** contract events (not decoded yet).

## Transactions

- **Order and hashes:** envelopes are matched to results by hash for the configured network
  passphrase, in apply order (`matchLedgerTransactions`).
- **Fee payer:** the fee-bump `feeSource` when the envelope is a fee-bump, otherwise the
  transaction source. Muxed sources are reduced to their base `G` address.
- **Fee:** `TransactionResult.feeCharged`. The decoder sums the fee payer's XLM changes in
  `feeProcessing`, `postTxApplyFeeProcessing` (Protocol 23+) and transaction-level changes
  (`txChangesBefore`/`txChangesAfter`, which carry the pre-Protocol 23 Soroban refund). The total must
  equal `-feeCharged`, and any other account in fee processing is an error.
- **Success:** `txSuccess` or `txFeeBumpInnerSuccess`. Failed transactions keep their operation list
  for reference but have no operation deltas.
- **Metadata versions:** `TransactionMeta` V0 (`operations`) through V4 are read. Only V4 has been
  checked against real data (Q-012).

## Balance deltas

For each account (XLM) and trustline (issued asset or pool share), the delta is the value in a
`CREATED` or `UPDATED` change minus the preceding `STATE` (or `RESTORED`) value. A `REMOVED`
change subtracts the preceding state. An update or removal without a preceding state is an error.
Deltas are computed per change list:

| Change list                                         | Attributed to                               |
| --------------------------------------------------- | ------------------------------------------- |
| `feeProcessing`, `postTxApplyFeeProcessing`         | the fee (checked against `feeCharged`)      |
| `txChangesBefore`, `txChangesAfter` (fee payer XLM) | the fee                                     |
| `txChangesBefore`, `txChangesAfter` (other)         | a transaction-level delta without `opIndex` |
| `operations[i].changes`                             | operation `i` (`opIndex: i`)                |

Offers, claimable balances, liquidity pools and contract data are not wallet balances and are not
reported as deltas. Records from `decodeLedger` set `deltasComplete: true`, so the classifier
compares amounts: any part of a tracked wallet's change that no event explains is posted to
suspense.

## Assets

| Ledger form                       | `AssetId`                 |
| --------------------------------- | ------------------------- |
| Native                            | `native`                  |
| `CREDIT_ALPHANUM4` / `12`         | `classic:<code>:<issuer>` |
| Trustline `POOL_SHARE`            | `pool:<64 hex pool ID>`   |
| SEP-41 contract (events, pending) | `sep41:<C address>`       |

## Muxed accounts and memos

- Operation details hold the base `G` address (`destination`, `from`), plus the full `M` address in
  `destinationMuxed`, `fromMuxed` or `sourceMuxed` when a muxed account was used. Balances and
  tracking always use the base address. Payment events record the tracked wallet's own muxed ID as
  `muxedId` and the other party's as `counterpartyMuxedId`; counterparties stay base addresses, as
  `core` requires. Both IDs are kept in the journal entry metadata.
- Memos map to `{ type, value }`: `id` as a decimal string, `hash` and `return` as 64 lowercase hex
  characters, `text` as UTF-8. Text that is not valid UTF-8 is kept in the reversible SEP-51
  escape form (Q-041).

## Verification

- **Captured ledger 5796891:** all 25 transactions decode. Exact assertions cover the XLM payment
  (also checked against `decodeNativePayment`), create account, account merge, a path payment to
  self, two failed transactions and a Soroban fee-bump.
- **Captured operation ledgers:** eight more real ledgers in `fixtures/data/captured/` cover a
  muxed issued-asset payment, a clawback, claimable-balance create and claim, both path payment
  kinds, a pool deposit, a trustline removal and a claimable-balance clawback.
- **Live testnet:** the opt-in test `packages/stellar-ingest/test/rpc-source.testnet.test.ts` reads
  recent ledgers through `RpcLedgerSource`, tracks every wallet that appears, and requires zero
  mapping failures and an exact match between journal wallet totals and on-chain changes. A manual
  run on 2026-11-25 covered 200 ledgers and about 4,300 transactions with no failures or mismatches.
  These totals use the decoder's own deltas, so they prove the classifier and mapping lose nothing;
  decoder correctness rests on the fee and amount cross-checks above.

## Still to be written

- Sponsorship and reserves as metadata
- Soroban contract events (CAP-67 and SEP-41)
- Protocol 30 XDR changes (Q-030)
