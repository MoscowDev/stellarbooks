# Stellar research: claimable balances, liquidity pools, clawback, account merge, muxed accounts, memos

Status: research notes for StellarBooks (Phase 0). No code. Retrieved 2026-11-16.
XDR is from `stellar/stellar-xdr` branch `curr` (commit `579a90b`, 2026-10-07) [S1].

---

## 1. Claimable balances (CAP-23, Protocol 14, Final)

### 1.1 Structure [S1]
- `ClaimableBalanceEntry { ClaimableBalanceID balanceID; Claimant claimants<10>; Asset asset; int64 amount; ext (v1: flags) }`.
- `ClaimableBalanceID` = `CLAIMABLE_BALANCE_ID_TYPE_V0` + 32-byte hash. The ID is "a SHA-256 hash of the
  OperationID", predictable before submission, and returned by a successful create [S2].
- `Claimant` = `{ AccountID destination; ClaimPredicate predicate; }`, 1-10 per balance; empty list or
  duplicate destinations are malformed [S1][S3].
- `CLAIMABLE_BALANCE_CLAWBACK_ENABLED_FLAG = 0x1` [S1].

### 1.2 Predicates [S1][S2][S3]

| Type | Value | Meaning |
|---|---|---|
| `UNCONDITIONAL` | 0 | always claimable |
| `AND` | 1 | both of 2 sub-predicates |
| `OR` | 2 | either of 2 |
| `NOT` | 3 | negation |
| `BEFORE_ABSOLUTE_TIME` | 4 | "true if closeTime < absBefore" (unix seconds) |
| `BEFORE_RELATIVE_TIME` | 5 | seconds since creation ledger close; **converted to absolute at creation** by adding `relBefore` to `closeTime` (saturating at `INT64_MAX`) |

### 1.3 Lifecycle and balance effects
- **Create**: creator's asset balance `-amount`; amount sits in the entry (owned by nobody until
  claimed). Creator needs a trustline + authorization (`NO_TRUST`, `NOT_AUTHORIZED`). Reserve: one base
  reserve per claimant on the creator via built-in sponsorship [S2][S3][S4]. CAP-67: `transfer` to the
  balance ID, or `mint` if from issuer [S5].
- **Claim**: the **entire** amount moves to the claimant (op source); entry deleted; no partial claims
  are described [S2][S3]. Claimant needs a trustline ("A trustline must be established by the claimant
  to the asset before it can claim") [S2]. Creator's reserve is released [S4]. CAP-67: `transfer`
  from balance to claimant, or `burn` if claimant is the issuer [S5].
- **Expiry**: there is **no expiry mechanism**. "if a claimable balance isn't claimed, it sits on the
  ledger forever"; "there is no recovery mechanism for a claimable balance in general." Docs recommend
  adding the creator as a claimant (e.g. with `NOT(BEFORE_...)`) to be able to reclaim [S2]. A
  predicate that can no longer be satisfied does not return funds automatically.
- **Clawback**: `CLAWBACK_CLAIMABLE_BALANCE` burns the whole balance ("all or nothing"); source must be
  the issuer; requires the balance's clawback flag, which is set at creation if the creator's trustline
  had `TRUSTLINE_CLAWBACK_ENABLED_FLAG` (or, for issuer-created balances, from the issuer's account
  flags); the sponsorship reserve "will be freed for the sponsor" [S6][S7].
- Also created implicitly by **authorization revocation of pool participants** (see 2.5).

### 1.4 Accounting model (design notes)
Treat a claimable balance as an **in-transit / escrow sub-ledger** keyed by `balanceID`:
creator Dr Escrow / Cr Asset on create; claimant Dr Asset / Cr Escrow on claim. Ownership at
creation is ambiguous (multiple claimants, conditional predicates) - see Open questions.

---

## 2. Liquidity pools (CAP-38, Protocol 18, Final)

### 2.1 Structure [S1][S8]
- Only `LIQUIDITY_POOL_CONSTANT_PRODUCT`. Params `{ assetA, assetB (assetA < assetB), int32 fee }`;
  `LIQUIDITY_POOL_FEE_V18 = 30` (bps = 0.30%).
- `PoolID` = SHA256(`LiquidityPoolParameters`); one pool per asset pair; computable locally [S1][S9].
- Entry fields: `reserveA`, `reserveB`, `totalPoolShares`, `poolSharesTrustLineCount`.
- Pool shares are held in a pool-share trustline (2 sub-entries) and "cannot be transferred"; only
  deposit/withdraw (and change_trust) act on them [S8][S9].

### 2.2 Deposit [S8]
- Empty pool: deposits exactly `maxAmountA`/`maxAmountB`; shares minted = floor(sqrt(A*B)).
- Non-empty pool: shares = min(floor(total*maxA/reserveA), floor(total*maxB/reserveB)); amounts
  deposited = ceil(shares*reserve/total) per asset.
- Bounded by `minPrice`/`maxPrice` (`BAD_PRICE`), `POOL_FULL` if reserves/shares would exceed INT64_MAX.
- **Result is `void`** - actual amounts and shares only in meta/events [S1].

### 2.3 Withdraw [S8]
- Amounts returned = floor(amount/totalPoolShares * reserve) per asset (rounding against withdrawer),
  subject to `minAmountA/B`. Result `void` [S1].
- Fees accrue to holders inside reserves and are "collected on withdrawal" [S9].

### 2.4 Trading through pools [S8][S9]
- Path payments price each hop against both the order book and the pool; better price wins, ties go to
  the pool; per hop, not interleaved. Pool trades appear as `CLAIM_ATOM_TYPE_LIQUIDITY_POOL` atoms
  (`ClaimLiquidityAtom`) in the path payment result.
- Manage buy/sell/passive offers do **not** trade against pools.
- Fee: invariant `(X + x - Fx)(Y - y) >= XY`, F = 0.003. The fee is embedded in the price (no separate
  fee transfer); it stays in reserves.

### 2.5 Forced redemption on revocation [S8][S9]
If the issuer of A or B revokes authorization (`SetTrustLineFlags`/`AllowTrust`), "the account will
automatically withdraw from every liquidity pool containing that asset"; each pool-share trustline is
deleted and a claimable balance is created per withdrawn asset (unless the holder is that asset's
issuer), claimable by the trustline owner and sponsored by the pool-share trustline's sponsor. IDs
derive from `ENVELOPE_TYPE_POOL_REVOKE_OP_ID`. Horizon effect: `liquidity_pool_revoked` (95) [S10].
**Accounting impact:** an operation sourced by the *issuer* changes the *holder's* position (shares
-> escrowed claimable balances).

### 2.6 Accounting model (design notes)
Pool shares are a distinct asset per `PoolID`. Deposit = exchange of A and B for shares (cost basis
= fair value of A+B). Withdraw = exchange of shares for A and B (realised gain/loss vs basis). Fee
income is not separately observable; it is embedded in the withdraw proceeds.

---

## 3. Clawback (CAP-35, Protocol 17, Final)

- Requirements: issuer has `AUTH_REVOCABLE` and had `AUTH_CLAWBACK_ENABLED` when the holder's trustline
  was created (cannot be retro-enabled; flag can be cleared per trustline but not set) [S6][S7][S11].
- `CLAWBACK { asset, MuxedAccount from, amount }`: "The amount of the asset clawed back is burned and is
  not sent to any other address." Fails `UNDERFUNDED` if balance net of selling liabilities is
  insufficient; to reach amounts in offers the issuer first revokes authorization (which removes the
  offers) [S6]. Malformed if `from` is the issuer itself [S6].
- Holder's signature not required [S6].
- CAP-67 event: `clawback` (topics `from`; data `amount`) [S5]. Horizon: `account_debited` /
  `claimable_balance_clawed_back` [S10].
- **Accounting impact:** for the holder, an involuntary loss (write-off) of the asset; for the issuer,
  a reduction of outstanding liability (like a burn).

---

## 4. Account merge

- Op body: `MuxedAccount destination`; threshold high [S1][S12].
- Effect: "Transfers the XLM balance of an account to another account and removes the source account
  from the ledger" [S12]. Success result `int64 sourceAccountBalance` "how much got transferred from
  source account" [S1] - use this as the exact amount. CAP-67: native `transfer` of the merged balance
  [S5]. Horizon: `account_removed`, `account_credited` on destination.
- Only XLM moves: the source must have **no trustlines, offers or data entries**
  (`ACCOUNT_MERGE_HAS_SUB_ENTRIES -4`). Signers (including sponsored ones) are removed automatically [S12].
- Other blockers: `MALFORMED -1` (merge onto itself), `NO_ACCOUNT -2`, `IMMUTABLE_SET -3` (source has
  `AUTH_IMMUTABLE`), `SEQNUM_TOO_FAR -5` (seq must be < ledgerSeq << 32), `DEST_FULL -6`, `IS_SPONSOR
  -7` (source sponsoring reserves) [S1][S12]. Being sponsored does not block merge [S12].
- **Accounting impact:** close all asset sub-ledgers of the merged account (they must be zero/removed
  already); move remaining XLM; the account can later be re-created with the same ID (new history
  epoch - see Open questions).

---

## 5. Muxed accounts (CAP-27, Protocol 13; SEP-23 strkey)

- `MuxedAccount` union: `KEY_TYPE_ED25519` (plain) or `KEY_TYPE_MUXED_ED25519 { uint64 id; uint256
  ed25519; }` [S1]. M-address = G account + 64-bit ID [S13].
- "Muxed accounts do not exist on the ledger, but their shared underlying `GABC...` account does."
  Balances, reserves and sequence numbers belong to the base account [S13].
- Allowed where XDR uses `MuxedAccount`: tx source, op source, fee-bump fee source, destination of
  payment / path payments / account merge, `from` of clawback [S1][S13]. Not allowed in create
  account, trustline ops (`AccountID` fields) [S1][S13].
- "There's no validation on IDs"; operations behave as if no muxed account were used [S13].
- From Protocol 25, `InvokeHostFunction` txs cannot use a muxed tx/op source nor carry a memo
  (`txSOROBAN_INVALID`); contracts can receive muxed IDs only via `MuxedAddress` args such as SAC
  `transfer` `to` [S13].
- CAP-67 events: muxed destination info is carried as `to_muxed_id` in the event data map; a memo is
  mapped to `to_muxed_id` only when the destination is a non-muxed classic account, and a muxed
  destination takes precedence over the memo. Claimable balance, LP and offer events never carry it [S5].
- If a tx has both a muxed ID and a memo ID that differ, docs call it malformed and recommend not
  submitting - but the network does not reject it [S13].
- **Accounting impact:** muxed IDs (and memos) are *sub-ledger / customer tags* on the base account,
  not separate on-chain balances. StellarBooks can offer optional sub-accounting by muxed ID / memo.

## 6. Memos

| Type | Value | Content | Limit |
|---|---|---|---|
| `MEMO_NONE` | 0 | - | - |
| `MEMO_TEXT` | 1 | `string text<28>` ASCII/UTF-8 | 28 bytes |
| `MEMO_ID` | 2 | `uint64` | 64-bit unsigned |
| `MEMO_HASH` | 3 | `Hash` | 32 bytes |
| `MEMO_RETURN` | 4 | `Hash` - "the hash of the tx you are rejecting" (refund reference) | 32 bytes |

Sources: XDR [S1]; operations-and-transactions page [S14]. One memo per **transaction**, not per
operation [S1]. Use `uint64`-safe handling for `MEMO_ID` (exceeds JS `Number` precision).

---

## Sources

All retrieved 2026-11-16.

- [S1] stellar-xdr `curr` (commit 579a90b): `Stellar-transaction.x`, `Stellar-ledger-entries.x`, `Stellar-types.x` - https://github.com/stellar/stellar-xdr/tree/curr
- [S2] Claimable balances guide: https://developers.stellar.org/docs/build/guides/transactions/claimable-balances
- [S3] CAP-23 Two-part payments / claimable balances: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0023.md
- [S4] Sponsored reserves guide: https://developers.stellar.org/docs/build/guides/transactions/sponsored-reserves
- [S5] CAP-67 Unified asset events: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0067.md
- [S6] CAP-35 Asset clawback: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0035.md
- [S7] Clawbacks guide: https://developers.stellar.org/docs/build/guides/transactions/clawbacks
- [S8] CAP-38 Automated market makers: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0038.md
- [S9] Liquidity on Stellar: https://developers.stellar.org/docs/learn/fundamentals/liquidity-on-stellar-sdex-liquidity-pools
- [S10] Horizon effect type constants: https://github.com/stellar/stellar-horizon/blob/main/internal/db2/history/main.go
- [S11] Control asset access: https://developers.stellar.org/docs/tokens/control-asset-access
- [S12] List of operations: https://developers.stellar.org/docs/learn/fundamentals/transactions/list-of-operations
- [S13] Pooled accounts, muxed accounts and memos: https://developers.stellar.org/docs/build/guides/transactions/pooled-accounts-muxed-accounts-memos
- [S14] Operations and transactions: https://developers.stellar.org/docs/learn/fundamentals/transactions/operations-and-transactions

## Open questions

- **CL-1** Claimable balance ownership for accounting: when the creator is also a claimant (refund path) or there are several claimants, who "owns" the escrow? Proposal: creator keeps it as "in transit" until a claim; needs product decision.
- **CL-2** CAP-23 text says the reserve returns to the creator, or to the claimant if the creator no longer exists; CAP-33 later replaced the reserve field with sponsorship. What happens to the sponsorship when the creator account has been merged? (Merge is blocked while sponsoring, so likely the creator cannot be merged - confirm.)
- **CL-3** Claim-amount source: claim result is `void`; amount must come from the removed entry's prior `STATE` in meta. Confirm meta always includes the `STATE` of the removed claimable balance.
- **CL-4** Exact LP fee income is not observable per trade for a liquidity provider. Is an approximation (proceeds vs. basis) acceptable for v1?
- **CL-5** Re-created accounts: after a merge, the same G address can be created again. Should StellarBooks treat it as a new ledger account (epoch) or continue the same one?
- **CL-6** Muxed `from` on clawback: XDR allows `MuxedAccount`; CAP-35 does not discuss muxed semantics. Assume ID is metadata only.
- **CL-7** Muxed ID vs. memo conflicts are "malformed" per docs but accepted by the network; which tag should StellarBooks prefer? CAP-67 says muxed takes precedence over memo - propose following CAP-67.
- **CL-8** MEMO_TEXT is "ASCII or UTF-8"; invalid UTF-8 bytes are possible in XDR (`string<28>`). Decide on lossless storage (raw bytes + best-effort decoded string).
