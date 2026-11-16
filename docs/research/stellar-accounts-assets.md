# Stellar research: accounts, native XLM, issued assets, trustlines, amounts

Status: research notes for StellarBooks (Phase 0). No code. All facts below are taken from
the cited official sources (retrieved 2026-11-16). Anything not confirmed by a source is listed
under "Open questions" instead of being stated as fact.

Protocol context (retrieved 2026-11-16): the latest Mainnet protocol listed by SDF is
**Protocol 29** (Mainnet 2026-10-01, security fixes, no new CAPs). Protocol 26 (2026-05-06)
added CAP-77 (frozen ledger keys) and CAP-73 (SAC can create G-account balances); Protocol 23
"Whisk" (2025-09-03) added CAP-67 (unified asset events) and CAP-63 (meta changes).
Source: [S1]. The XDR quoted in these notes is from the `curr` branch of `stellar/stellar-xdr`
(commit `579a90b`, 2026-10-07), which the repo README describes as "the current protocol XDR" [S2].

---

## 1. Accounts

### 1.1 Account kinds

| Kind | Address prefix | On ledger? | Notes |
|---|---|---|---|
| Stellar account | `G...` | Yes, `AccountEntry` | Holds native XLM balance directly; holds other classic assets via trustlines. [S3] |
| Contract account | `C...` | Contract instance + contract data | "There are two types of accounts on Stellar: Stellar accounts (`G...` addresses) and contract accounts (`C...` addresses)." [S3] Balances of contract addresses in a Stellar asset live in contract storage of the Stellar Asset Contract (SAC), not in trustlines (see Open questions). |
| Muxed account | `M...` | **No** | Virtual sub-account = `G` account + 64-bit ID. Balances belong to the underlying `G` account. See `stellar-cb-lp-clawback-merge-muxed-memo.md`. [S7] |

### 1.2 AccountEntry fields relevant to accounting (XDR, `Stellar-ledger-entries.x`) [S2]

| Field | Type | Accounting relevance |
|---|---|---|
| `accountID` | `AccountID` (ed25519 public key) | Ledger account identity. |
| `balance` | `int64` | Native XLM balance **in stroops** (comment: "in stroops"). |
| `seqNum` | `int64` | Consumed by every applied tx (success or failure); not a monetary value. |
| `numSubEntries` | `uint32` | "number of sub-entries this account has / drives the reserve". |
| `flags` | `uint32` | Issuer flags (see 3.2). |
| `signers<20>` | `Signer[]` | `MAX_SIGNERS = 20`. Each extra signer is a sub-entry. |
| `ext.v1.liabilities` | `{buying int64, selling int64}` | Native-asset liabilities from open offers. Selling liabilities reduce spendable XLM. |
| `ext.v1.ext.v2.numSponsored` / `numSponsoring` | `uint32` | Reserve-sponsorship counters (see `stellar-reserves-sponsorship.md`). |
| `ext.v1.ext.v2.signerSponsoringIDs` | `AccountID*[]` | Sponsor of each signer. |
| `ext...v3.seqLedger` / `seqTime` | | Ledger/time at which `seqNum` last changed. |

Every `LedgerEntry` additionally carries `lastModifiedLedgerSeq` and an optional
`ext.v1.sponsoringID` (the sponsor of that entry's reserve). [S2]

### 1.3 Account creation and minimum balance

- Accounts "can only exist with a valid keypair and the required minimum balance of XLM." [S3]
- Minimum balance = two base reserves + one per sub-entry, adjusted for sponsorship; one base reserve
  is "currently 0.5 XLM", so a bare account needs 1 XLM. [S4] Full formula and sponsorship effects
  are in `stellar-reserves-sponsorship.md`.
- Since CAP-33, `CreateAccountOp` accepts `startingBalance >= 0` (a sponsored account can be created
  with 0 XLM). [S10]
- CAP-73 (Protocol 26): an XLM `transfer` through the native SAC to a non-existent `G` address
  creates the account "as long as the transfer amount covers the minimum allowed account balance"
  (1 XLM at the time of the CAP). [S11] **Accounting impact:** accounts can now be created by a
  Soroban `invoke_host_function`, not only by `create_account`.
- Subentry limit: "An account cannot have more than 1,000 subentries." [S3]

---

## 2. Native asset (XLM / lumens)

- Asset type `ASSET_TYPE_NATIVE = 0`; no issuer, no trustline. Balance is `AccountEntry.balance`. [S2]
- `LedgerHeader.totalCoins`: "total number of stroops in existence. 10,000,000 stroops in 1 XLM". [S2]
- `LedgerHeader.feePool`: "fees burned since last inflation run". [S2] The Lumens page says transaction
  fee lumens "go into a locked account and are not given to or used by anyone" / "The Fee Pool is where
  network fees collect" and are non-circulating. [S4][S12] **Accounting impact:** fees are an expense
  to the payer with no on-chain counterparty account; model the counter-side as a "network fees
  (burned / fee pool)" sink.
- `LedgerHeader.baseFee` (stroops per op) and `LedgerHeader.baseReserve` (stroops) are in every
  ledger header and can change by validator vote. [S2][S4]
- Inflation is disabled: since Protocol 12 an `Inflation` operation "always return[s]
  `opNOT_SUPPORTED`". [S13]

---

## 3. Issued (credit) assets

### 3.1 Identity and codes

- "Assets are uniquely identified by the combination of their asset code and issuer." [S5]
- XDR [S2]:
  - `ASSET_TYPE_CREDIT_ALPHANUM4 = 1`: `AssetCode4` = `opaque[4]`, "1-4 alphanumeric characters
    right-padded with 0 bytes".
  - `ASSET_TYPE_CREDIT_ALPHANUM12 = 2`: `AssetCode12` = `opaque[12]`, "5-12 alphanumeric characters
    right-padded with 0 bytes".
  - `ASSET_TYPE_POOL_SHARE = 3`: only valid in `ChangeTrustAsset` / `TrustLineAsset` (pool shares,
    identified by `PoolID`), not in the plain `Asset` union.
- Allowed characters: a-z, A-Z, 0-9; alphanum4 may be shorter than 4 with trailing bytes empty;
  alphanum12 is 5-12 characters. [S6]
- **Accounting impact:** the canonical asset key must be `(type, code, issuer)`. Same code with a
  different issuer is a different asset. `USD` as alphanum4 and a 5+ char code are disjoint by
  construction (lengths do not overlap).

### 3.2 Issuer account flags (`AccountFlags`) [S2][S6]

| Flag | Value | Meaning (source wording) |
|---|---|---|
| `AUTH_REQUIRED_FLAG` | 0x1 | "an issuer must approve an account before that account can hold its asset" |
| `AUTH_REVOCABLE_FLAG` | 0x2 | issuer can revoke a trustline's authorization ("freezing the asset held by an account"); full revocation cancels open orders |
| `AUTH_IMMUTABLE_FLAG` | 0x4 | auth flags become read-only and "the issuing account can't be merged" |
| `AUTH_CLAWBACK_ENABLED_FLAG` | 0x8 | trustlines created *after* it is set get clawback enabled; requires `AUTH_REVOCABLE` |

### 3.3 Issuance and burning (issuer semantics)

- "There is no dedicated operation to create an asset on Stellar." An issuer creates supply by paying
  the asset. [S5]
- "To burn an asset, send it back to its issuing account." [S5] An issuer "can't actually hold a
  balance of its own asset." [S6] `PAYMENT_NO_DESTINATION` is not returned when the receiver is the
  issuer, i.e. the asset is being burned. [S8]
- `ChangeTrust` with the source trusting itself fails with `CHANGE_TRUST_SELF_NOT_ALLOWED`. [S8]
- CAP-67 (Protocol 23) events: a classic movement *from* the issuer emits `mint`; *to* the issuer
  emits `burn`. [S9]
- **Accounting impact:** for an issuer's books, outgoing issued asset = liability issued (mint),
  incoming = redemption (burn). For a holder, it is an ordinary transfer. There is no issuer
  "balance" to reconcile against; issuer-side supply must be derived (sum of trustline balances +
  claimable balances + LP reserves + SAC contract balances) - see Open questions.

---

## 4. Trustlines

### 4.1 TrustLineEntry (XDR) [S2]

| Field | Notes |
|---|---|
| `accountID` | Holder. |
| `asset` (`TrustLineAsset`) | alphanum4 / alphanum12 / pool share (`PoolID`). Native is not a valid trustline. |
| `balance` int64 | "how much of this asset the user has". |
| `limit` int64 | "balance cannot be above this". |
| `flags` uint32 | `AUTHORIZED_FLAG = 1`, `AUTHORIZED_TO_MAINTAIN_LIABILITIES_FLAG = 2`, `TRUSTLINE_CLAWBACK_ENABLED_FLAG = 4`. |
| `ext.v1.liabilities` | buying/selling liabilities from open offers in this asset. |
| `ext.v1.ext.v2.liquidityPoolUseCount` | number of pool-share trustlines referencing this trustline. |

- `ChangeTrustOp { ChangeTrustAsset line; int64 limit; }` - XDR comment: "if limit is set to 0, deletes
  the trust line". [S2] Deleting a trustline with a non-zero balance fails with
  `CHANGE_TRUST_INVALID_LIMIT`; deleting one still referenced by a pool fails with
  `CHANGE_TRUST_CANNOT_DELETE`. [S8]
- Trustlines track liabilities: the balance must cover selling liabilities, and stay below the limit
  by enough to cover buying liabilities. [S3]
- A trustline to a classic asset costs 1 sub-entry; a pool-share trustline costs 2. [S3][S4]
- CAP-73: SAC `trust(address)` creates a trustline with limit `i64::MAX`, paid by the owner
  (sponsorship not supported) and **emits no event**. [S11]

### 4.2 Authorization levels [S6]

| State | Can do |
|---|---|
| Authorized (`AUTHORIZED_FLAG`) | Send/receive, trade, deposit into pools. |
| Authorized to maintain liabilities (flag 2) | Keep existing offers, cancel offers, withdraw from pools; cannot otherwise transact. |
| Unauthorized (neither flag) | Frozen; full revocation removes the account's open offers in that asset. Revocation also force-redeems pool shares into claimable balances (see `stellar-cb-lp-clawback-merge-muxed-memo.md`). |

Authorization is changed by the issuer with `SetTrustLineFlags` (or the deprecated `AllowTrust`).
CAP-67 emits `set_authorized` only when `AUTHORIZED` is added or removed. [S9]

### 4.3 Frozen ledger keys (CAP-77, Protocol 26) [S14]

Validators can vote to put accounts, trustlines (excluding pool-share and issuer trustlines) and
Soroban entries into a `frozenLedgerKeys` network setting. Transactions touching them are rejected
at validation with `txFROZEN_KEY_ACCESSED` (normally never included in a ledger), or, for claimable
balance and liquidity pool operations, fail at apply time with `*_TRUSTLINE_FROZEN` result codes.
Offers that would change a frozen account/trustline are removed during matching and their
liabilities released. **Accounting impact:** a frozen balance is still owned; this is an
"inaccessible" state, not a balance change.

---

## 5. Amount precision

- All amounts are `int64`. "Dividing the integer by 10,000,000 gives the user-facing unit", i.e. 7
  decimal places; one stroop (0.0000001) is integer 1; maximum amount is 922,337,203,685.4775807
  units. [S5]
- "In JavaScript, use an arbitrary-precision decimal library to avoid precision loss." [S5]
- The same scale (7 decimals) applies to XLM and to every classic issued asset; it is not configurable
  per asset at the protocol level. [S5]
- Soroban/SAC amounts are `i128` in events (CAP-67 `transfer` data `amount` (i128)). [S9] For SAC
  assets the classic `int64` cap still applies to classic balances (trustlines/accounts) since those
  fields are `int64`. [S2]
- Prices are rationals: `struct Price { int32 n; int32 d; }`. [S2]
- **Accounting impact:** store amounts as integer stroops (`bigint`), never JS `number`; convert to
  decimal strings only at the presentation boundary. Non-SAC Soroban tokens (SEP-41) may use other
  decimals (see Open questions).

### 5.1 Available (spendable) balance

"Available balance = balance - minimum balance - selling liabilities" for XLM; "Selling liabilities
(the amount an account has committed to open sell offers) are not part of the minimum balance." [S4]
For issued assets, the trustline must cover selling liabilities. [S3]

---

## Sources

All retrieved 2026-11-16.

- [S1] Software versions: https://developers.stellar.org/docs/networks/software-versions
- [S2] stellar-xdr `curr` branch (commit 579a90b, 2026-10-07): https://github.com/stellar/stellar-xdr/tree/curr - files `Stellar-ledger-entries.x`, `Stellar-transaction.x`, `Stellar-ledger.x`, `Stellar-types.x`, `README.md`
- [S3] Accounts: https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/accounts
- [S4] Lumens (base reserve, minimum balance, fee pool): https://developers.stellar.org/docs/learn/fundamentals/lumens
- [S5] Assets: https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/assets
- [S6] Control asset access: https://developers.stellar.org/docs/tokens/control-asset-access
- [S7] Pooled accounts, muxed accounts and memos: https://developers.stellar.org/docs/build/guides/transactions/pooled-accounts-muxed-accounts-memos
- [S8] List of operations: https://developers.stellar.org/docs/learn/fundamentals/transactions/list-of-operations
- [S9] CAP-67 Unified asset events: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0067.md
- [S10] CAP-33 Sponsored reserves: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0033.md
- [S11] CAP-73 Allow SAC to create G-account balances: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0073.md
- [S12] Fees, resource limits and metering: https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering
- [S13] CAP-26 Disable inflation: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0026.md
- [S14] CAP-77 Freeze ledger entries via network configuration: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0077.md

## Open questions

- **AA-1** Default/maximum trustline limit when `ChangeTrust` omits a specific limit: the docs do not state it (XDR only says limit 0 deletes). SDK default is not a protocol fact; confirm before relying on it.
- **AA-2** Where exactly a `C...` (contract) address's balance of a classic asset lives (SAC contract-data entry layout) and how to read it from meta: not covered in the pages read. Needed if StellarBooks tracks contract-held SAC balances.
- **AA-3** SEP-41 (non-SAC) Soroban tokens: decimals are contract-defined; we did not verify the SEP-41 `decimals()` interface in this pass. Scope decision needed: in or out of v1?
- **AA-4** Issuer-side supply reconciliation: no official doc gives a formula for outstanding supply of an issued asset; deriving it (trustlines + claimable balances + LP reserves + SAC contract balances) is our inference.
- **AA-5** Whether `baseReserve` has ever changed on Mainnet / how to treat a mid-period change: docs say it "can" change by vote; StellarBooks should read it from each `LedgerHeader` rather than hard-code 0.5 XLM.
- **AA-6** Lumens page states the fee pool is "locked" while XDR calls `feePool` "fees burned since last inflation run". Terminology differs (burned vs. locked); accounting treatment (expense with no counterparty) is the same either way, but labelling should be agreed.
