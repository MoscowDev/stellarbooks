# Stellar research: every operation type and its balance effects

Status: research notes for StellarBooks (Phase 0). No code. Retrieved 2026-11-16.

Primary sources: the `OperationType` enum and result unions in `Stellar-transaction.x` on the
`curr` branch of `stellar/stellar-xdr` (commit `579a90b`, 2026-10-07) [S1], and the SDF
"List of operations" page [S2]. Supporting CAPs are cited per row.

## 0. Ground rules that apply to every operation

- **27 operation types** exist in XDR (`CREATE_ACCOUNT = 0` ... `RESTORE_FOOTPRINT = 26`). The docs
  page lists 26 because `INFLATION = 9` is retired (always `opNOT_SUPPORTED` since Protocol 12) [S1][S2][S13].
- Each operation has an optional `sourceAccount` (`MuxedAccount*`); if absent, the transaction source
  is used [S1]. **The operation source is the account whose balances move**, not necessarily the tx
  source or fee payer.
- Transactions are atomic: "if one operation in a transaction fails, all operations fail" [S3]. When a
  tx fails, **no operation balance effect happens; only the fee is charged** (see
  `stellar-transactions-fees-results.md`).
- `OperationResult` wraps every op result: `opINNER = 0` means the op-specific result below is valid;
  otherwise `opBAD_AUTH -1`, `opNO_ACCOUNT -2`, `opNOT_SUPPORTED -3`, `opTOO_MANY_SUBENTRIES -4`,
  `opEXCEEDED_WORK_LIMIT -5`, `opTOO_MANY_SPONSORING -6` [S1].
- **Most success results carry no amounts** (`void`). Only path payments, offers, account merge,
  create claimable balance, inflation and invoke host function return data. Authoritative balance
  deltas therefore must come from **transaction meta ledger-entry changes** (or CAP-67 events) - see
  `stellar-transactions-fees-results.md`.
- Since Protocol 23, CAP-67 defines `transfer` / `mint` / `burn` / `clawback` / `fee` /
  `set_authorized` events for classic operations (node config `EMIT_CLASSIC_EVENTS`) [S4][S5].
- Result codes present in XDR but **not** on the docs page: `PAYMENT_NO_ISSUER -9`,
  `PATH_PAYMENT_STRICT_{RECEIVE,SEND}_NO_ISSUER -9` (carries `Asset noIssuer`),
  `MANAGE_{SELL,BUY}_OFFER_SELL_NO_ISSUER -9` / `BUY_NO_ISSUER -10` [S1]. See Open questions.

Legend for "Balance effects": **src** = operation source account; **dst** = destination;
"reserve" = change in minimum-balance requirement (no XLM moves; see `stellar-reserves-sponsorship.md`).

---

## 1. Summary table

| # | Operation | Threshold | Moves value? | Success payload (XDR) | Where to get actual amounts |
|---|---|---|---|---|---|
| 0 | `create_account` | med | Yes, XLM src -> new account | void | op param `startingBalance` is exact; meta |
| 1 | `payment` | med | Yes | void | op param `amount` is exact; meta |
| 2 | `path_payment_strict_receive` | med | Yes, multi-asset | `offers<ClaimAtom>`, `last: SimplePaymentResult` | result (received = `last.amount`; sent derived) / meta |
| 3 | `manage_sell_offer` | med | Yes if it crosses | `ManageOfferSuccessResult` | `offersClaimed` / meta |
| 4 | `create_passive_sell_offer` | med | Yes if it crosses | `ManageSellOfferResult` | same |
| 5 | `set_options` | med/high | No (reserve only for signers) | void | - |
| 6 | `change_trust` | med | No (reserve only) | void | - |
| 7 | `allow_trust` (deprecated) | low | Indirect (offer removal, LP redemption) | void | meta |
| 8 | `account_merge` | high | Yes, all XLM src -> dst | `int64 sourceAccountBalance` | result |
| 9 | `inflation` (retired) | low | No (always `opNOT_SUPPORTED`) | `InflationPayout[]` historically | - |
| 10 | `manage_data` | med | No (reserve only) | void | - |
| 11 | `bump_sequence` | low | No | void | - |
| 12 | `manage_buy_offer` | med | Yes if it crosses | `ManageOfferSuccessResult` | `offersClaimed` / meta |
| 13 | `path_payment_strict_send` | med | Yes, multi-asset | `offers<ClaimAtom>`, `last` | result / meta |
| 14 | `create_claimable_balance` | med | Yes, src -> escrow entry | `ClaimableBalanceID balanceID` | op `amount` exact; meta |
| 15 | `claim_claimable_balance` | low | Yes, escrow -> claimant | void | meta (entry `amount`) |
| 16 | `begin_sponsoring_future_reserves` | med | No | void | - |
| 17 | `end_sponsoring_future_reserves` | med | No | void | - |
| 18 | `revoke_sponsorship` | med | No (reserve shifts) | void | - |
| 19 | `clawback` | med | Yes, holder -> burned | void | op `amount` exact; meta |
| 20 | `clawback_claimable_balance` | med | Yes, escrow -> burned | void | meta (entry `amount`) |
| 21 | `set_trust_line_flags` | low | Indirect (offer removal, LP redemption) | void | meta |
| 22 | `liquidity_pool_deposit` | med | Yes, 2 assets -> pool, shares minted | **void** | **meta only** (or CAP-67 events) |
| 23 | `liquidity_pool_withdraw` | med | Yes, shares burned, 2 assets -> holder | **void** | **meta only** (or events) |
| 24 | `invoke_host_function` | med | Possibly anything (contracts) | `Hash` of return value + events | meta + CAP-67/SEP-41 events |
| 25 | `extend_footprint_ttl` | low | No (fee only) | void | - |
| 26 | `restore_footprint` | low | No (fee only) | void | - |

---

## 2. Per-operation detail

### 0 `CREATE_ACCOUNT`
- Params: `AccountID destination`, `int64 startingBalance` [S1]. Destination is a plain `AccountID` (not muxed).
- Balance effects: src XLM `-startingBalance`; new account XLM `+startingBalance`; new `AccountEntry` created. Since CAP-33 `startingBalance >= 0` is allowed (sponsored creation) [S6]. CAP-67: native `transfer` creator -> new account [S4].
- Reserve: new account needs 2 base reserves, paid by itself or by a sponsor (`stellar-reserves-sponsorship.md`).
- Results: `SUCCESS 0`; `MALFORMED -1` invalid destination; `UNDERFUNDED -2` source can't fund while keeping its reserve + selling liabilities; `LOW_RESERVE -3` would create below minimum; `ALREADY_EXIST -4` [S1][S2].
- Note: since CAP-73 (P26) an account can also be created by an XLM SAC `transfer` inside `invoke_host_function` [S7].

### 1 `PAYMENT`
- Params: `MuxedAccount destination`, `Asset asset`, `int64 amount` [S1].
- Effects: src `-amount` of `asset`; dst `+amount`. If src is the issuer, it is a mint (no src balance change); if dst is the issuer, it is a burn (no dst balance change) [S2][S4][S8]. Destination muxed ID is metadata only; funds land in the base `G` account [S9].
- Results: `SUCCESS 0`, `MALFORMED -1`, `UNDERFUNDED -2`, `SRC_NO_TRUST -3`, `SRC_NOT_AUTHORIZED -4`, `NO_DESTINATION -5` (not returned when dst is the issuer), `NO_TRUST -6`, `NOT_AUTHORIZED -7`, `LINE_FULL -8`, `NO_ISSUER -9` (XDR only) [S1][S2].

### 2 `PATH_PAYMENT_STRICT_RECEIVE`
- Params: `sendAsset`, `int64 sendMax` ("maximum amount of sendAsset to send (excluding fees)"), `MuxedAccount destination`, `destAsset`, `int64 destAmount`, `Asset path<5>` [S1].
- Effects: src `-X sendAsset` where `X <= sendMax` is **not in the op**; dst `+destAmount destAsset`. Intermediate hops trade against order-book offers (offer owners' balances change) and/or liquidity pools (pool reserves change) [S1][S10]. CAP-67: a `transfer` pair per trade plus a final `transfer` src -> dst; an empty-path same-asset path payment is treated as a payment [S4].
- Success payload: `{ ClaimAtom offers<>; SimplePaymentResult last; }` where `SimplePaymentResult = { AccountID destination; Asset asset; int64 amount; }` [S1]. See section 3 for deriving the sent amount.
- Results: `SUCCESS 0`, `MALFORMED -1`, `UNDERFUNDED -2`, `SRC_NO_TRUST -3`, `SRC_NOT_AUTHORIZED -4`, `NO_DESTINATION -5`, `NO_TRUST -6`, `NOT_AUTHORIZED -7`, `LINE_FULL -8`, `NO_ISSUER -9` (XDR only), `TOO_FEW_OFFERS -10` (only paths of length <= 5 considered), `OFFER_CROSS_SELF -11`, `OVER_SENDMAX -12` [S1][S2].

### 3 `MANAGE_SELL_OFFER`
- Params: `selling`, `buying`, `int64 amount` (selling units; 0 deletes), `Price price` (price of 1 selling in buying), `int64 offerID` (0 = create) [S1].
- Effects: if the offer crosses existing offers, immediate trades move balances for src and each counterparty (one `ClaimAtom` per crossed offer). Any remainder rests on the book as an `OfferEntry` (1 sub-entry, reserve) and creates **liabilities** (not a balance change) [S1][S2]. Offers do **not** trade against liquidity pools (CAP-38) [S10]. CAP-67: two `transfer` events per trade; none if not marketable [S4].
- Success payload: `ManageOfferSuccessResult { ClaimAtom offersClaimed<>; offer: CREATED|UPDATED (OfferEntry) | DELETED }` [S1].
- Results: `SUCCESS 0`, `MALFORMED -1`, `SELL_NO_TRUST -2`, `BUY_NO_TRUST -3`, `SELL_NOT_AUTHORIZED -4`, `BUY_NOT_AUTHORIZED -5`, `LINE_FULL -6`, `UNDERFUNDED -7`, `CROSS_SELF -8`, `SELL_NO_ISSUER -9` / `BUY_NO_ISSUER -10` (XDR only), `NOT_FOUND -11`, `LOW_RESERVE -12` [S1][S2].
- **Accounting note:** a resting offer is later filled by *other* accounts' operations; those fills show up only in the counterparty's op result (`ClaimAtom` with `sellerID` = our account) and in meta. StellarBooks must watch meta / trades for accounts it tracks even when they are not the op source.

### 4 `CREATE_PASSIVE_SELL_OFFER`
- Params: `selling`, `buying`, `amount`, `price` [S1]. Creates an offer that "does not take a reverse offer at an equal price" [S2].
- Effects/payload/codes: identical to manage sell offer; result type is `ManageSellOfferResult` [S1][S2].

### 5 `SET_OPTIONS`
- Params (all optional): `inflationDest`, `clearFlags`, `setFlags`, `masterWeight`, `low/med/highThreshold`, `homeDomain` (string32), `signer` (weight 0 removes) [S1]. Threshold: high when changing weights/thresholds/signers, else medium [S2].
- Effects: no asset movement. Adding a signer adds 1 sub-entry (reserve); removing frees it.
- Results: `SUCCESS 0`, `LOW_RESERVE -1`, `TOO_MANY_SIGNERS -2` (max 20), `BAD_FLAGS -3`, `INVALID_INFLATION -4`, `CANT_CHANGE -5`, `UNKNOWN_FLAG -6`, `THRESHOLD_OUT_OF_RANGE -7`, `BAD_SIGNER -8`, `INVALID_HOME_DOMAIN -9`, `AUTH_REVOCABLE_REQUIRED -10` [S1][S2].

### 6 `CHANGE_TRUST`
- Params: `ChangeTrustAsset line` (alphanum4/12 or pool-share parameters), `int64 limit` (0 deletes) [S1].
- Effects: creates/updates/deletes a trustline; no balance movement. Classic trustline = 1 sub-entry; pool-share trustline = 2 sub-entries. Creating the first pool-share trustline for a pair creates the `LiquidityPoolEntry` (Horizon effect `liquidity_pool_created`), and removing the last removes it [S10][S11].
- Results: `SUCCESS 0`, `MALFORMED -1`, `NO_ISSUER -2`, `INVALID_LIMIT -3` (incl. deleting with non-zero balance), `LOW_RESERVE -4`, `SELF_NOT_ALLOWED -5`, `TRUST_LINE_MISSING -6` (asset trustline missing for pool), `CANNOT_DELETE -7` (still referenced by pool), `NOT_AUTH_MAINTAIN_LIABILITIES -8` [S1][S2].

### 7 `ALLOW_TRUST` (deprecated since Protocol 17 in favour of `set_trust_line_flags`) [S2]
- Params: `trustor`, `AssetCode asset`, `uint32 authorize` (0, 1 `AUTHORIZED`, 2 `AUTHORIZED_TO_MAINTAIN_LIABILITIES`) [S1].
- Effects: flag change. Revocation can **remove offers** (releasing liabilities) and **force-redeem pool shares** into claimable balances (CAP-38) - real balance changes visible only in meta [S10][S12].
- Results: `SUCCESS 0`, `MALFORMED -1`, `NO_TRUST_LINE -2`, `TRUST_NOT_REQUIRED -3`, `CANT_REVOKE -4`, `SELF_NOT_ALLOWED -5`, `LOW_RESERVE -6` (claimable balances can't be created on pool revocation) [S1][S2].

### 8 `ACCOUNT_MERGE`
- Params: `MuxedAccount destination` (op body) [S1]. Threshold high.
- Effects: entire XLM balance of src -> dst; src `AccountEntry` removed. Success payload `int64 sourceAccountBalance` "how much got transferred from source account" [S1]. Detail in `stellar-cb-lp-clawback-merge-muxed-memo.md`.
- Results: `SUCCESS 0`, `MALFORMED -1` (merge onto itself), `NO_ACCOUNT -2`, `IMMUTABLE_SET -3`, `HAS_SUB_ENTRIES -4`, `SEQNUM_TOO_FAR -5`, `DEST_FULL -6`, `IS_SPONSOR -7` [S1][S2].

### 9 `INFLATION` (retired)
- No params (`void`). Since CAP-26 (Protocol 12) always `opNOT_SUPPORTED` [S13]. Historical success payload `InflationPayout { AccountID destination; int64 amount; }[]`; result codes `INFLATION_SUCCESS 0`, `INFLATION_NOT_TIME -1` [S1]. Only relevant for importing pre-P12 history (CAP-67 models historical inflation payouts as `mint` [S4]).

### 10 `MANAGE_DATA`
- Params: `string64 dataName`, `DataValue* dataValue` (opaque<=64; null deletes) [S1].
- Effects: data entry = 1 sub-entry (reserve). No balance change.
- Results: `SUCCESS 0`, `NOT_SUPPORTED_YET -1`, `NAME_NOT_FOUND -2`, `LOW_RESERVE -3`, `INVALID_NAME -4` [S1][S2].

### 11 `BUMP_SEQUENCE`
- Params: `SequenceNumber bumpTo` [S1]. No balance effect.
- Results: `SUCCESS 0`, `BAD_SEQ -1` [S1].

### 12 `MANAGE_BUY_OFFER`
- Params: `selling`, `buying`, `int64 buyAmount` (0 deletes), `price` (price of 1 buying unit in selling units), `offerID` [S1].
- Effects/payload: as manage sell offer (`ManageOfferSuccessResult`).
- Results: `SUCCESS 0`, `MALFORMED -1`, `SELL_NO_TRUST -2`, `BUY_NO_TRUST -3`, `SELL_NOT_AUTHORIZED -4`, `BUY_NOT_AUTHORIZED -5`, `LINE_FULL -6`, `UNDERFUNDED -7`, `CROSS_SELF -8`, `SELL_NO_ISSUER -9` / `BUY_NO_ISSUER -10` (XDR only), `NOT_FOUND -11`, `LOW_RESERVE -12` [S1][S2].

### 13 `PATH_PAYMENT_STRICT_SEND`
- Params: `sendAsset`, `int64 sendAmount` ("amount of sendAsset to send (excluding fees)"), `MuxedAccount destination`, `destAsset`, `int64 destMin`, `Asset path<5>` [S1].
- Effects: src `-sendAmount sendAsset` (exact, from op); dst `+Y destAsset` with `Y >= destMin`, **Y only in result/meta**.
- Payload: same shape as strict receive.
- Results: `SUCCESS 0`, `MALFORMED -1`, `UNDERFUNDED -2`, `SRC_NO_TRUST -3`, `SRC_NOT_AUTHORIZED -4`, `NO_DESTINATION -5`, `NO_TRUST -6`, `NOT_AUTHORIZED -7`, `LINE_FULL -8`, `NO_ISSUER -9` (XDR only), `TOO_FEW_OFFERS -10`, `OFFER_CROSS_SELF -11`, `UNDER_DESTMIN -12` [S1][S2].

### 14 `CREATE_CLAIMABLE_BALANCE`
- Params: `Asset asset`, `int64 amount`, `Claimant claimants<10>` [S1].
- Effects: src `-amount asset` into a new `ClaimableBalanceEntry` (escrow, owned by nobody yet). Reserve: one base reserve per claimant, carried by the creator (or its sponsor) via sponsorship counting [S6][S14]. CAP-67: `transfer` to the balance ID, or `mint` if src is the issuer [S4].
- Payload: `ClaimableBalanceID balanceID` [S1].
- Results: `SUCCESS 0`, `MALFORMED -1`, `LOW_RESERVE -2`, `NO_TRUST -3`, `NOT_AUTHORIZED -4`, `UNDERFUNDED -5` [S1][S2].

### 15 `CLAIM_CLAIMABLE_BALANCE`
- Params: `ClaimableBalanceID balanceID` [S1].
- Effects: whole entry `amount` -> claimant (op source); entry deleted; creator's sponsorship reserve released [S14][S15]. Amount **not** in op or result -> read from the removed entry's prior state in meta (or CAP-67 `transfer`/`burn`) [S4].
- Results: `SUCCESS 0`, `DOES_NOT_EXIST -1`, `CANNOT_CLAIM -2`, `LINE_FULL -3`, `NO_TRUST -4`, `NOT_AUTHORIZED -5`, `TRUSTLINE_FROZEN -6` (CAP-77, P26) [S1][S2][S16].

### 16 `BEGIN_SPONSORING_FUTURE_RESERVES`
- Params: `AccountID sponsoredID` [S1]. No balance effect; must be closed by `END_...` in same tx.
- Results: `SUCCESS 0`, `MALFORMED -1`, `ALREADY_SPONSORED -2`, `RECURSIVE -3` [S1][S2].

### 17 `END_SPONSORING_FUTURE_RESERVES`
- No params (`void`) [S1]. Results: `SUCCESS 0`, `NOT_SPONSORED -1` [S1].

### 18 `REVOKE_SPONSORSHIP`
- Params: union `LEDGER_ENTRY (LedgerKey)` | `SIGNER {AccountID, SignerKey}` [S1].
- Effects: transfers or removes reserve sponsorship; no XLM moves [S14].
- Results: `SUCCESS 0`, `DOES_NOT_EXIST -1`, `NOT_SPONSOR -2`, `LOW_RESERVE -3`, `ONLY_TRANSFERABLE -4` (claimable balances), `MALFORMED -5` [S1][S2].

### 19 `CLAWBACK`
- Params: `Asset asset`, `MuxedAccount from`, `int64 amount` [S1]. Source must be issuer.
- Effects: `from` `-amount`; amount is **burned** ("burned and is not sent to any other address") [S17]. Limited to balance net of selling liabilities [S17]. CAP-67 `clawback` event [S4].
- Results: `SUCCESS 0`, `MALFORMED -1`, `NOT_CLAWBACK_ENABLED -2`, `NO_TRUST -3`, `UNDERFUNDED -4` [S1][S2].

### 20 `CLAWBACK_CLAIMABLE_BALANCE`
- Params: `ClaimableBalanceID balanceID` [S1]. Source must be issuer.
- Effects: whole escrow amount burned, entry deleted, sponsor's reserve freed [S17]. Amount from meta.
- Results: `SUCCESS 0`, `DOES_NOT_EXIST -1`, `NOT_ISSUER -2`, `NOT_CLAWBACK_ENABLED -3` [S1][S2].

### 21 `SET_TRUST_LINE_FLAGS`
- Params: `AccountID trustor`, `Asset asset`, `uint32 clearFlags`, `uint32 setFlags` [S1].
- Effects: as `allow_trust` (revocation can remove offers and redeem pool shares into claimable balances) [S10][S12]. Clawback flag can only be cleared, not set [S17].
- Results: `SUCCESS 0`, `MALFORMED -1`, `NO_TRUST_LINE -2`, `CANT_REVOKE -3`, `INVALID_STATE -4`, `LOW_RESERVE -5` [S1][S2].

### 22 `LIQUIDITY_POOL_DEPOSIT`
- Params: `PoolID liquidityPoolID`, `int64 maxAmountA`, `int64 maxAmountB`, `Price minPrice`, `Price maxPrice` [S1].
- Effects: src `-a assetA`, `-b assetB`; pool reserves `+a`, `+b`; src pool-share trustline `+shares`. Actual `a`, `b`, `shares` are computed by CAP-38 formulas and are **not returned in the result** (success arm is `void`) - read from meta (trustline + `LiquidityPoolEntry` deltas) or CAP-67 events [S1][S10].
- Results: `SUCCESS 0`, `MALFORMED -1`, `NO_TRUST -2`, `NOT_AUTHORIZED -3`, `UNDERFUNDED -4`, `LINE_FULL -5`, `BAD_PRICE -6`, `POOL_FULL -7`, `TRUSTLINE_FROZEN -8` (P26) [S1][S2].

### 23 `LIQUIDITY_POOL_WITHDRAW`
- Params: `PoolID liquidityPoolID`, `int64 amount` (shares), `int64 minAmountA`, `int64 minAmountB` [S1].
- Effects: src pool shares `-amount`; src `+a assetA`, `+b assetB` (rounded down); pool reserves decrease. Result `void` -> meta/events [S1][S10].
- Results: `SUCCESS 0`, `MALFORMED -1`, `NO_TRUST -2`, `UNDERFUNDED -3`, `LINE_FULL -4`, `UNDER_MINIMUM -5`, `TRUSTLINE_FROZEN -6` (P26) [S1][S2].

### 24 `INVOKE_HOST_FUNCTION` (Soroban)
- Params: `HostFunction hostFunction` (`INVOKE_CONTRACT 0` {contractAddress, functionName, args}, `CREATE_CONTRACT 1`, `UPLOAD_CONTRACT_WASM 2`, `CREATE_CONTRACT_V2 3` with constructor args), `SorobanAuthorizationEntry auth<>` [S1]. Soroban txs may contain only one operation [S2][S3].
- Effects: arbitrary. SAC calls can move XLM and classic assets between G accounts (visible as `AccountEntry`/`TrustLineEntry` changes in meta), between contract addresses (contract data), create G accounts (CAP-73 XLM transfer) and trustlines (`trust`, no event) [S7]. Non-SAC tokens only visible via contract events/contract data. Token movements are reported as SEP-41/SAC events (`transfer`, `mint`, `burn`, `clawback`) in `OperationMetaV2.events` (meta v4) [S4][S5].
- Payload: `Hash success` = sha256(`InvokeHostFunctionSuccessPreImage {returnValue, events}`) [S1].
- Results: `SUCCESS 0`, `MALFORMED -1`, `TRAPPED -2`, `RESOURCE_LIMIT_EXCEEDED -3`, `ENTRY_ARCHIVED -4`, `INSUFFICIENT_REFUNDABLE_FEE -5` [S1][S2].
- Restriction: from Protocol 25, a tx with `InvokeHostFunction` cannot use a muxed tx/op source and cannot carry a memo (`txSOROBAN_INVALID`) [S9].

### 25 `EXTEND_FOOTPRINT_TTL`
- Params: `ExtensionPoint ext`, `uint32 extendTo` (extends entries in the **readOnly** footprint so they live at least `extendTo` ledgers past the current one) [S1][S2].
- Effects: no asset movement; cost is the Soroban resource fee (rent is refundable-fee component) [S18].
- Results: `SUCCESS 0`, `MALFORMED -1`, `RESOURCE_LIMIT_EXCEEDED -2`, `INSUFFICIENT_REFUNDABLE_FEE -3` [S1][S2].

### 26 `RESTORE_FOOTPRINT`
- Params: `ExtensionPoint ext` (restores archived entries in the **readWrite** footprint) [S1][S2].
- Effects: no asset movement; fee only. Meta can contain `LEDGER_ENTRY_RESTORED` changes [S19].
- Results: `SUCCESS 0`, `MALFORMED -1`, `RESOURCE_LIMIT_EXCEEDED -2`, `INSUFFICIENT_REFUNDABLE_FEE -3` [S1][S2].

---

## 3. Path payments: determining actual amounts (from results, not request params)

Facts from XDR [S1]:
- `ClaimAtom` is a union: `CLAIM_ATOM_TYPE_V0` (`ClaimOfferAtomV0`, raw ed25519 seller, legacy pre-P18 encoding), `CLAIM_ATOM_TYPE_ORDER_BOOK` (`ClaimOfferAtom`: `sellerID`, `offerID`, `assetSold`, `amountSold`, `assetBought`, `amountBought`), `CLAIM_ATOM_TYPE_LIQUIDITY_POOL` (`ClaimLiquidityAtom`: `liquidityPoolID`, `assetSold`, `amountSold`, `assetBought`, `amountBought`).
- Field comments: `assetSold/amountSold` = "amount and asset taken from the owner" (or "from the pool"); `assetBought/amountBought` = "amount and asset sent to the owner" (or "to the pool").
- `last: SimplePaymentResult { destination, asset, amount }` - the final credit to the destination.

Derivation used by StellarBooks (our reading of the XDR; see Open questions OP-2):

| Quantity | Strict receive | Strict send |
|---|---|---|
| Amount received by destination | `last.amount` (equals `destAmount`) | `last.amount` (actual, `>= destMin`) |
| Amount sent by source | Sum of `amountBought` over atoms whose `assetBought == sendAsset` (first hop); if `offers` is empty (same asset, empty path) it equals `last.amount` | `sendAmount` from op; cross-check as for strict receive |
| Counterparty effects | each atom: owner/pool `-amountSold assetSold`, `+amountBought assetBought` | same |

Independent confirmations: Horizon's path payment operation object exposes `source_amount` ("Amount sent designated in the source asset") and `amount` ("Amount received designated in the destination asset") [S20]; CAP-67 emits a `transfer` for every trade plus a final source -> destination transfer [S4]; meta ledger-entry deltas give the net change per account. **Recommendation:** treat meta deltas as the source of truth and use result atoms for trade-level detail (realized FX rate, counterparty, pool vs order book).

Routing (CAP-38): each hop is priced against both the order book and the pool; the better price wins, and on a tie the pool is chosen; routing is per hop, not interleaved [S10]. Path payments never use the source's own offers (`OFFER_CROSS_SELF`) [S2][S21].

---

## Sources

All retrieved 2026-11-16.

- [S1] stellar-xdr `curr` `Stellar-transaction.x` (commit 579a90b, 2026-10-07): https://github.com/stellar/stellar-xdr/blob/curr/Stellar-transaction.x
- [S2] List of operations: https://developers.stellar.org/docs/learn/fundamentals/transactions/list-of-operations
- [S3] Operations and transactions: https://developers.stellar.org/docs/learn/fundamentals/transactions/operations-and-transactions
- [S4] CAP-67 Unified asset events: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0067.md
- [S5] Events: https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/events
- [S6] CAP-33 Sponsored reserves: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0033.md
- [S7] CAP-73 SAC create G-account balances: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0073.md
- [S8] Assets: https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/assets
- [S9] Pooled accounts, muxed accounts and memos: https://developers.stellar.org/docs/build/guides/transactions/pooled-accounts-muxed-accounts-memos
- [S10] CAP-38 Automated market makers: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0038.md
- [S11] Horizon effect types source (`stellar/stellar-horizon`, `internal/db2/history/main.go`): https://github.com/stellar/stellar-horizon/blob/main/internal/db2/history/main.go
- [S12] Liquidity on Stellar: https://developers.stellar.org/docs/learn/fundamentals/liquidity-on-stellar-sdex-liquidity-pools
- [S13] CAP-26 Disable inflation: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0026.md
- [S14] Sponsored reserves guide: https://developers.stellar.org/docs/build/guides/transactions/sponsored-reserves
- [S15] CAP-23 Claimable balances: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0023.md
- [S16] CAP-77 Frozen ledger keys: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0077.md
- [S17] CAP-35 Clawback: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0035.md and clawbacks guide https://developers.stellar.org/docs/build/guides/transactions/clawbacks
- [S18] Fees, resource limits and metering: https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering
- [S19] stellar-xdr `curr` `Stellar-ledger.x`: https://github.com/stellar/stellar-xdr/blob/curr/Stellar-ledger.x
- [S20] Horizon path payment strict send object: https://developers.stellar.org/docs/data/apis/horizon/api-reference/resources/operations/object/path-payment-strict-send
- [S21] Path payments guide: https://developers.stellar.org/docs/build/guides/transactions/path-payments

## Open questions

- **OP-1** `*_NO_ISSUER` result codes exist in XDR but are not on the docs page. Can they still be returned under the current protocol, or are they legacy-only? Treat as possible in historical data either way.
- **OP-2** No official doc states the formula for "amount sent" in a strict-receive path payment from result atoms. Our first-hop-sum derivation is inferred from XDR comments. Must be verified against meta deltas and Horizon `source_amount` on real Mainnet transactions (including multi-hop and pool hops) before shipping.
- **OP-3** Ordering of `offers<>` ClaimAtoms across hops (are they guaranteed in hop order?) is not documented in sources read.
- **OP-4** Exact LP deposit/withdraw amounts: result is `void`. We rely on meta deltas. Confirm that meta always contains both the `LiquidityPoolEntry` and the trustline/account updates for the depositor (expected, not verified on-chain).
- **OP-5** `invoke_host_function` balance changes for non-SAC (SEP-41) tokens are visible only via contract events/contract data. Is v1 scope limited to classic assets + SAC?
- **OP-6** CAP-73 `trust()` creates a trustline with no event; reserve effect is only visible in meta. Confirm Horizon/RPC exposure.
- **OP-7** Fills of a tracked account's *resting* offer come from other accounts' operations. Confirm the best official way to discover them (meta scan of all ledgers vs. Horizon trades endpoint vs. CAP-67 events filtered by address).
