# Stellar research: transactions, fee-bump, fees, failed transactions, results, meta, effects

Status: research notes for StellarBooks (Phase 0). No code. Retrieved 2026-11-16.
XDR references are to the `curr` branch of `stellar/stellar-xdr` (commit `579a90b`,
2026-10-07) [S1]. Latest Mainnet protocol per SDF: 29 (2026-10-01) [S2].

---

## 1. Transactions

### 1.1 Envelope types [S1]

| `EnvelopeType` | Envelope | Notes |
|---|---|---|
| `ENVELOPE_TYPE_TX_V0 = 0` | `TransactionV0Envelope` | Legacy (pre-P13) form: raw ed25519 source, `uint32 fee`, `TimeBounds*`. Still decodable in history. |
| `ENVELOPE_TYPE_TX = 2` | `TransactionV1Envelope` | Current form. |
| `ENVELOPE_TYPE_TX_FEE_BUMP = 5` | `FeeBumpTransactionEnvelope` | Wraps a `TransactionV1Envelope`. |

`Transaction` (V1) fields [S1]: `MuxedAccount sourceAccount`, `uint32 fee` ("the fee the
sourceAccount will pay" - a **maximum bid**), `SequenceNumber seqNum`, `Preconditions cond`
(none / time bounds / V2: time bounds, ledger bounds, minSeqNum, minSeqAge, minSeqLedgerGap,
up to 2 extra signers), `Memo memo`, `Operation operations<100>` (`MAX_OPS_PER_TX = 100`),
`ext` (v1 = `SorobanTransactionData`). Up to 20 signatures.

- "The transaction's source account always provides the sequence number, and it pays the fee unless
  the transaction is wrapped in a fee-bump transaction." [S3]
- Soroban transactions (`InvokeHostFunction`, `ExtendFootprintTTL`, `RestoreFootprint`) contain exactly
  one operation [S3].
- Transactions are atomic: "if one operation in a transaction fails, all operations fail" [S3].

### 1.2 Lifecycle and what a failed transaction costs [S4]

- Invalid transactions are rejected by Stellar Core before inclusion; no fee is consumed [S4]. These
  never appear in a ledger, so **StellarBooks never sees them** (no accounting entry).
- At ledger close "Fees are collected for all transactions simultaneously" (step 9), then each tx is
  applied and "the account's sequence number is consumed (increased by 1)"; "The entire transaction
  will fail if any operation fails, and all previous operations will be rolled back" (step 10) [S4].
- Therefore a transaction **included in a ledger with result `txFAILED` (or another failure code)
  still pays its fee and consumes its sequence number, but has no operation effects.** CAP-22 (status
  *Draft*) states the same: "Failed transactions increase the sequence number ..., charge a fee ...,
  and yield a result with TransactionResult.code txFAILED" [S5]. The SDF Token Transfer Processor
  emits fee events "for all transactions, whether they succeed or fail" [S6].
- **Accounting impact:** every included transaction produces at least a fee entry for the fee payer;
  failed transactions produce *only* that.

---

## 2. Fees

### 2.1 Classic (inclusion) fee [S7]

- "inclusion fee = # of operations * effective base fee"; the effective base fee "cannot be lower than
  100 stroops per operation (the network minimum)". The tx `fee` field is a per-tx maximum bid.
- Outside surge pricing, the tx pays only the network minimum, even if it bid more.
- Under surge pricing, "the user pays the minimum inclusion fee in their transaction set" - i.e. the
  lowest included bid, not the user's own bid. Transactions are prioritised by fee when the set is
  too large [S4][S7].
- **The amount actually charged is `TransactionResult.feeCharged`** ("actual fee charged for the
  transaction") [S1]. Never use `tx.fee` (the bid) as the expense.

### 2.2 Soroban resource fee and refunds

- `Tx.fee = sorobanData.resourceFee + inclusion fee`; `inclusionFee` used for prioritisation is
  `tx.fee - resourceFee` [S1][S7].
- Non-refundable components: CPU instructions, read bytes, write bytes, bandwidth (tx size). Refundable:
  rent, events, return value [S7]. XDR comment: non-refundable part "is charged regardless of the
  success of the transaction"; refundable part is charged on actual usage and "will be `0` for failed
  transactions" [S1].
- `SorobanTransactionMetaExtV1` reports `totalNonRefundableResourceFeeCharged`,
  `totalRefundableResourceFeeCharged`, `rentFeeCharged` (part of refundable); and
  `resourceFeeCharged <= sorobanData.resourceFee`; `result.feeCharged = resourceFeeCharged +
  inclusionFeeCharged` [S1].
- Mechanics: the full declared fee is debited up front during fee processing; the unused refundable
  portion is refunded after execution [S7][S8]. Location of the refund in meta:
  - before Protocol 23: in `TransactionMeta.txChangesAfter`, applied after each tx [S8];
  - from Protocol 23 (CAP-63): in `TransactionResultMetaV1.postTxApplyFeeProcessing` inside
    `LedgerCloseMetaV2`, applied after all transactions [S1][S8].
- CAP-67 fee events: initial charge emitted at `TRANSACTION_EVENT_STAGE_BEFORE_ALL_TXS`; refund
  emitted only if non-zero, **as a negative amount**, at `AFTER_TX` (pre-P23) or `AFTER_ALL_TXS`
  (P23+). "The final fee paid can be calculated by taking the sum" of all `fee` events [S9].
- **Accounting impact:** the net fee expense = `feeCharged` = initial debit - refund. If StellarBooks
  books from meta, it must net `feeProcessing` against `postTxApplyFeeProcessing` (or
  `txChangesAfter` pre-P23); an intermediate balance can be lower than the final one.

### 2.3 Fee-bump transactions (CAP-15, Protocol 13)

- `FeeBumpTransaction { MuxedAccount feeSource; int64 fee; innerTx (TransactionV1Envelope); ext }` [S1].
- **Who pays:** the fee account (`feeSource`) "will incur the fee instead of the source account
  specified in the inner transaction"; "The sequence number is still taken from the source account" [S10].
- Fee rules: must be >= network minimum for (inner ops + 1) and >= the inner tx's fee; replace-by-fee
  requires 10x [S10][S11]. "A fee-bump transaction has an effective number of operations equal to one
  plus the number of operations in the inner transaction." [S11]
- The inner tx's sequence number "is always consumed at apply time" [S10].
- Results: outer `TransactionResult.code` is `txFEE_BUMP_INNER_SUCCESS (1)` or
  `txFEE_BUMP_INNER_FAILED (-13)` carrying `InnerTransactionResultPair { Hash transactionHash; //
  hash of the inner transaction; InnerTransactionResult result; }`. `InnerTransactionResult.feeCharged`
  is "Always 0. Here for binary compatibility." [S1][S10]. The outer `feeCharged` is what the fee
  account paid.
- Hashes: two hashes exist - the outer (fee-bump envelope) hash and the inner tx hash (exposed in
  `InnerTransactionResultPair.transactionHash`) [S1]. The fee-bump guide's example comment says "A
  fee-bump transaction is found by its own hash, not the inner transaction's hash" [S10].
- **Accounting impact:** fee expense is booked to `feeSource`, while operation effects belong to the
  inner tx's (and ops') source accounts. A sponsor paying fees for a user is a real XLM transfer of
  value (fee subsidy) that should be visible in the books of the fee payer only.

### 2.4 Where fees go
"The lumens collected from transaction fees go into a locked account and are not given to or used by
anyone" [S7]; tracked as `LedgerHeader.feePool` [S1]. No counterparty account receives them.

---

## 3. Results

### 3.1 `TransactionResult` [S1]

```
struct TransactionResult {
    int64 feeCharged; // actual fee charged for the transaction
    union switch (TransactionResultCode code) {
      case txFEE_BUMP_INNER_SUCCESS: case txFEE_BUMP_INNER_FAILED: InnerTransactionResultPair innerResultPair;
      case txSUCCESS: case txFAILED: OperationResult results<>;
      default (all other codes): void;
    } result;
    ext;
};
```

### 3.2 `TransactionResultCode` (complete, from XDR) [S1]

| Code | Value | XDR comment |
|---|---|---|
| `txFEE_BUMP_INNER_SUCCESS` | 1 | fee bump inner transaction succeeded |
| `txSUCCESS` | 0 | all operations succeeded |
| `txFAILED` | -1 | one of the operations failed (none were applied) |
| `txTOO_EARLY` | -2 | ledger closeTime before minTime |
| `txTOO_LATE` | -3 | ledger closeTime after maxTime |
| `txMISSING_OPERATION` | -4 | no operation was specified |
| `txBAD_SEQ` | -5 | sequence number does not match source account |
| `txBAD_AUTH` | -6 | too few valid signatures / wrong network |
| `txINSUFFICIENT_BALANCE` | -7 | fee would bring account below reserve |
| `txNO_ACCOUNT` | -8 | source account not found |
| `txINSUFFICIENT_FEE` | -9 | fee is too small |
| `txBAD_AUTH_EXTRA` | -10 | unused signatures attached to transaction |
| `txINTERNAL_ERROR` | -11 | an unknown error occurred |
| `txNOT_SUPPORTED` | -12 | transaction type not supported |
| `txFEE_BUMP_INNER_FAILED` | -13 | fee bump inner transaction failed |
| `txBAD_SPONSORSHIP` | -14 | sponsorship not confirmed |
| `txBAD_MIN_SEQ_AGE_OR_GAP` | -15 | minSeqAge or minSeqLedgerGap conditions not met |
| `txMALFORMED` | -16 | precondition is invalid |
| `txSOROBAN_INVALID` | -17 | soroban-specific preconditions were not met |
| `txFROZEN_KEY_ACCESSED` | -18 | a 'frozen' ledger key is accessed by any operation (CAP-77, P26) |

Horizon maps these to snake_case strings (`tx_success`, `tx_failed`, `tx_bad_seq`,
`tx_no_source_account`, ...) [S12]. Operation-level codes are in `stellar-operations.md`.

### 3.3 Interpreting success for accounting
- Apply operation effects only if code is `txSUCCESS` or `txFEE_BUMP_INNER_SUCCESS` (then inner code
  `txSUCCESS`).
- Always book `feeCharged` for any transaction present in a ledger's result set.
- Codes such as `txTOO_LATE`, `txBAD_SEQ` can appear for transactions that were included but failed
  at apply time; in those cases also only the fee applies (inferred from [S4]; see Open questions TX-3).

---

## 4. Transaction meta

### 4.1 Versions [S1]

| `TransactionMeta` arm | Struct | Notes |
|---|---|---|
| 0 | `OperationMeta operations<>` | oldest |
| 1 | `TransactionMetaV1 { txChanges; operations }` | |
| 2 | `TransactionMetaV2 { txChangesBefore; operations; txChangesAfter }` | |
| 3 | `TransactionMetaV3 { ext; txChangesBefore; operations; txChangesAfter; SorobanTransactionMeta* sorobanMeta }` | Soroban (P20+). `sorobanMeta` has `events`, `returnValue`, `diagnosticEvents`, fee breakdown ext. |
| **4 (latest)** | `TransactionMetaV4 { ext; txChangesBefore; OperationMetaV2 operations<>; txChangesAfter; SorobanTransactionMetaV2* sorobanMeta; TransactionEvent events<>; DiagnosticEvent diagnosticEvents<> }` | P23 (CAP-67). `OperationMetaV2 { ext; changes; ContractEvent events<> }` - per-op events. `TransactionEvent { stage; event }` holds fee events. |

XDR comment on `TransactionMeta`: "this is the meta produced when applying transactions / it does not
include pre-apply updates such as fees" [S1]. Fee debits are in `TransactionResultMeta.feeProcessing`.

Ledger-level wrappers [S1]:
- `TransactionResultMeta { result; LedgerEntryChanges feeProcessing; TransactionMeta txApplyProcessing }`
  (used by `LedgerCloseMetaV0/V1`).
- `TransactionResultMetaV1 { ext; result; feeProcessing; txApplyProcessing; LedgerEntryChanges
  postTxApplyFeeProcessing }` (used by `LedgerCloseMetaV2`, P23+, CAP-63).
- `LedgerCloseMeta` arms 0, 1, 2. "transactions are sorted in apply order here / fees for all
  transactions are processed first / followed by applying transactions".

### 4.2 How balance changes appear [S1]

`LedgerEntryChange` types: `LEDGER_ENTRY_CREATED 0`, `UPDATED 1`, `REMOVED 2` (carries only a
`LedgerKey`), `STATE 3` (value of the entry before the change), `RESTORED 4` (archived entry restored).

Balance-bearing entries: `AccountEntry.balance` (XLM), `TrustLineEntry.balance` (issued asset or pool
shares), `ClaimableBalanceEntry.amount`, `LiquidityPoolEntry.reserveA/reserveB/totalPoolShares`,
`OfferEntry.amount` (an offer amount is *not* a balance - it is a commitment backed by liabilities),
and Soroban `ContractData` (SAC balances of contract addresses).

Recipe (our design inference from the XDR; verify - see TX-1): for each entry, delta = (value in
`CREATED`/`UPDATED`) - (value in the preceding `STATE`), and for `REMOVED` delta = - (preceding
`STATE` value). Sum across `feeProcessing`, each op's `changes`, `txChangesBefore/After` and
`postTxApplyFeeProcessing`, attributing:
- `feeProcessing` + `postTxApplyFeeProcessing` (and pre-P23 refund in `txChangesAfter`) -> fee;
- `operations[i].changes` -> operation i.

### 4.3 Events (alternative balance-change stream)
- From P23, classic ops emit `transfer`/`mint`/`burn`/`clawback`/`fee`/`set_authorized` events in the
  SAC format; per-op events are in `OperationMetaV2.events`, fee events in `TransactionMetaV4.events`
  [S9][S13]. Emission requires node config `EMIT_CLASSIC_EVENTS=true`;
  `BACKFILL_STELLAR_ASSET_EVENTS=true` emits them for older ledgers on replay [S13].
- Classic events "are not hashed into the ledger" [S9] - unlike ledger entries they are not
  consensus-verified.
- Contract events "will only be populated if the transaction succeeds" [S13].
- SDF's Token Transfer Processor (Go, ingest SDK) is a reference implementation that derives
  transfer/mint/burn/clawback/fee events for all protocol versions [S6].

### 4.4 Horizon effects (derived, not protocol)

"Effects represent specific changes that occur in the ledger as a result of successful operations"
[S14]. Complete list with numeric codes from the Horizon source [S15]:

| Group | Effects (type_i) |
|---|---|
| Account | `account_created` 0, `account_removed` 1, `account_credited` 2, `account_debited` 3, `account_thresholds_updated` 4, `account_home_domain_updated` 5, `account_flags_updated` 6, `account_inflation_destination_updated` 7 |
| Signer | `signer_created` 10, `signer_removed` 11, `signer_updated` 12 |
| Trustline | `trustline_created` 20, `trustline_removed` 21, `trustline_updated` 22, `trustline_authorized` 23, `trustline_deauthorized` 24, `trustline_authorized_to_maintain_liabilities` 25, `trustline_flags_updated` 26 |
| Trading | `offer_created/removed/updated` 30-32 (unused, not emitted), `trade` 33 |
| Data / seq | `data_created` 40, `data_removed` 41, `data_updated` 42, `sequence_bumped` 43 |
| Claimable balance | `claimable_balance_created` 50, `claimable_balance_claimant_created` 51, `claimable_balance_claimed` 52, `claimable_balance_clawed_back` 80 |
| Sponsorship | account 60-62, trustline 63-65, data 66-68, claimable balance 69-71, signer 72-74 (created/updated/removed) |
| Liquidity pool | `liquidity_pool_deposited` 90, `liquidity_pool_withdrew` 91, `liquidity_pool_trade` 92, `liquidity_pool_created` 93, `liquidity_pool_removed` 94, `liquidity_pool_revoked` 95 |
| Contract | `contract_credited` 96, `contract_debited` 97 |

Notes: the public docs page lists names but not codes and omits `claimable_balance_clawed_back`,
`trustline_flags_updated`, `trustline_authorized_to_maintain_liabilities`, and the contract effects
[S14] vs [S15]. **No effect exists for fees** - fees are only on the transaction (`fee_charged`).
`account_credited/debited` also cover SAC transfers/mints/burns per the Horizon source comment [S15].
Horizon's `result_meta_xdr` was announced for removal from SDF-hosted Horizon in Q3 2024, with RPC
`getTransactions` recommended instead [S16].

---

## Sources

All retrieved 2026-11-16.

- [S1] stellar-xdr `curr` (commit 579a90b, 2026-10-07): `Stellar-transaction.x`, `Stellar-ledger.x` - https://github.com/stellar/stellar-xdr/tree/curr
- [S2] Software versions: https://developers.stellar.org/docs/networks/software-versions
- [S3] Operations and transactions: https://developers.stellar.org/docs/learn/fundamentals/transactions/operations-and-transactions
- [S4] Transaction lifecycle: https://developers.stellar.org/docs/learn/fundamentals/transactions/transaction-lifecycle
- [S5] CAP-22 (Draft): https://github.com/stellar/stellar-protocol/blob/master/core/cap-0022.md
- [S6] Token Transfer Processor: https://developers.stellar.org/docs/data/indexers/build-your-own/processors/token-transfer-processor
- [S7] Fees, resource limits and metering: https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering
- [S8] CAP-63 Parallelism-friendly transaction scheduling: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0063.md
- [S9] CAP-67 Unified asset events: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0067.md
- [S10] Fee-bump transactions guide: https://developers.stellar.org/docs/build/guides/transactions/fee-bump-transactions
- [S11] CAP-15 Fee-bump transactions: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0015.md
- [S12] Horizon transaction result codes: https://developers.stellar.org/docs/data/apis/horizon/api-reference/errors/result-codes/transactions
- [S13] Events: https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/events
- [S14] Horizon effect types: https://developers.stellar.org/docs/data/apis/horizon/api-reference/resources/effects/types
- [S15] Horizon effect type constants (`stellar/stellar-horizon`, `internal/db2/history/main.go`): https://github.com/stellar/stellar-horizon/blob/main/internal/db2/history/main.go
- [S16] Horizon transaction object: https://developers.stellar.org/docs/data/apis/horizon/api-reference/resources/transactions/object
- [S17] RPC getTransaction: https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getTransaction

## Open questions

- **TX-1** No official doc gives a "compute balance deltas from meta" recipe. The STATE/UPDATED pairing logic above is inferred from XDR. Validate against real meta for every version (V0-V4) and both `LedgerCloseMeta` V1/V2, especially fee-bump + Soroban refund.
- **TX-2** Failed-transaction fee charging is documented only indirectly (lifecycle ordering, Draft CAP-22, TTP). No official page states it in one sentence. Confirm with on-chain samples (result `txFAILED` with non-zero `feeCharged` and an account debit in `feeProcessing`).
- **TX-3** Which non-`txFAILED` failure codes (`txTOO_LATE`, `txBAD_SEQ`, `txINSUFFICIENT_BALANCE`, `txFROZEN_KEY_ACCESSED`, ...) can actually appear in ledger results (and therefore cost a fee) vs. only at submission? CAP-77 says frozen-key txs "never" get included, but does not say whether a fee is charged in edge cases.
- **TX-4** Fee-bump hashes: which hash appears in `TransactionResultPair.transactionHash` and in RPC `getTransaction`/Horizon for fee-bumps? Only an SDK code comment ("found by its own hash") was found. StellarBooks should store both hashes; confirm the canonical ID.
- **TX-5** Fee-bump + Soroban: is the refundable-fee refund credited to the fee-bump `feeSource`? CAP-67 says the fee event `from` is the fee-bump fee account; refund recipient is implied but not explicitly stated in sources read.
- **TX-6** Surge pricing with generalized transaction sets (separate classic/Soroban/DEX lanes): docs describe a single "minimum inclusion fee in the transaction set". Not needed for accounting if we always use `feeCharged`, but noted.
- **TX-7** Docs example for surge pricing quotes XLM units in a way that conflicts with the stroop minimum (flagged by the docs page itself). Irrelevant if `feeCharged` is used.
- **TX-8** Data source strategy: Horizon is de-emphasised (meta removed from SDF Horizon) and RPC retains only ~7 days by default. Full history requires Galexie/data lake, Hubble, or own captive-core. Needs an ADR.
- **TX-9** CAP-67 classic events require node config and are not hashed into the ledger; can StellarBooks rely on them as a primary source, or only as a cross-check against ledger-entry deltas?
