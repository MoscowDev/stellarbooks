# Stellar research: base reserve, minimum balance, sponsored reserves

Status: research notes for StellarBooks (Phase 0). No code. Retrieved 2026-11-16.

Key accounting point up front: **reserves are not transfers.** A reserve is a portion of an
account's own XLM balance that it may not spend. Sponsorship moves the *requirement* from one
account to another; no XLM moves (CAP-33 describes no balance transfers; the sponsorship guide
describes shifting base-reserve requirements via counters) [S3][S4]. StellarBooks should model
reserves as **memo/restricted-balance information**, not as journal entries, unless the user opts
into a "restricted cash" presentation.

---

## 1. Base reserve

- "One base reserve is currently 0.5 XLM." Validators can vote to change it [S1].
- The authoritative value is `LedgerHeader.baseReserve` ("account base reserve in stroops") in every
  ledger header [S2]. Read it per ledger; do not hard-code.

## 2. Minimum balance formula

```
minimumBalance = (2 + numSubEntries + numSponsoring - numSponsored) * baseReserve
```

- Formula as given in the sponsored-reserves guide [S4]; CAP-33 states the invariant "No operation
  can cause an account to have `balance < (2 + numSubEntries + numSponsoring - numSponsored) *
  baseReserve + liabilities.selling`" [S3].
- "Selling liabilities ... are not part of the minimum balance"; available balance = balance -
  minimum balance - selling liabilities [S1].
- Example from docs: an account with one trustline, two offers and a claimable balance with one
  claimant needs 3 XLM (1 XLM base + 1.5 XLM for three sub-entries + 0.5 XLM for one claimant) [S1].

### 2.1 What counts

| Item | Reserve units | Counted in | Source |
|---|---|---|---|
| Account itself | 2 | base "2" (or sponsor's `numSponsoring` if sponsored) | [S1][S3] |
| Trustline (classic asset) | 1 | `numSubEntries` | [S1][S5] |
| Pool-share trustline | 2 | `numSubEntries` | [S1][S5][S6] |
| Offer | 1 | `numSubEntries` | [S1] |
| Additional signer | 1 | `numSubEntries` | [S1] |
| Data entry (`manage_data`) | 1 | `numSubEntries` | [S1][S5] |
| Claimable balance | 1 per claimant | creator's (or its sponsor's) `numSponsoring`; **not** a sub-entry | [S1][S3] |
| Liquidity pool entry | 0 | - ("This proposal does not require a reserve for a `LiquidityPoolEntry`") | [S6] |
| Soroban contract storage | n/a | Paid via rent in Soroban resource fees; sponsorship does not cover it | [S4][S7] |

- Max 1,000 sub-entries per account [S5].
- CAP-33 multipliers: "2 for ACCOUNT, claimants.size() for CLAIMABLE_BALANCE, 1 otherwise" [S3].

## 3. Sponsored reserves (CAP-33, Protocol 14/15, Final)

### 3.1 Mechanics
- "Anything that increases the minimum balance can be sponsored": account creation, offers,
  trustlines, data entries, signers, claimable balances [S4].
- Pattern: `BEGIN_SPONSORING_FUTURE_RESERVES(sponsoredID)` (source = sponsor) ... operations that create
  entries ... `END_SPONSORING_FUTURE_RESERVES` (source = sponsored account), all in **one transaction**;
  an unclosed relationship fails the tx with `txBAD_SPONSORSHIP` [S4][S8][S9].
- Ledger representation [S2]:
  - each sponsored `LedgerEntry` has `ext.v1.sponsoringID` = sponsor's `AccountID`;
  - each sponsored signer has an entry in `AccountEntryExtensionV2.signerSponsoringIDs`;
  - sponsor's `numSponsoring` and sponsored account's `numSponsored` are incremented by the entry's
    reserve weight.
- Sponsored account creation: the creator provides `startingBalance` (which may be 0) while the sponsor
  carries the 2 base reserves; the new account must sign the `END` op [S3][S4].
- Sponsorship "does not cover transaction fees or smart contract storage" [S4].

### 3.2 Removal and transfer
- "When a sponsored entry or subentry is removed, numSponsoring is decreased on the sponsoring account"
  and `numSponsored` decreased on the sponsored account [S4].
- `REVOKE_SPONSORSHIP` (source must be current sponsor, or owner if unsponsored) [S4][S8]:
  - sponsored entry, source sponsored by someone (inside a begin/end sandwich) -> sponsorship
    **transfers** to the new sponsor;
  - sponsored entry, otherwise -> sponsorship **removed**, owner carries the reserve again (fails with
    `REVOKE_SPONSORSHIP_LOW_RESERVE` if the owner cannot afford it);
  - unsponsored entry with source being sponsored -> establishes sponsorship; otherwise no-op.
- Claimable balances: "All claimable balances are sponsored through built-in logic" - the creator
  carries the reserve and gets it back when the balance is claimed/removed [S4]. Their sponsorship can
  only be transferred, never removed (`REVOKE_SPONSORSHIP_ONLY_TRANSFERABLE`) [S3][S8].
- Account merge is blocked while the account is a sponsor (`ACCOUNT_MERGE_IS_SPONSOR`, i.e.
  `numSponsoring > 0`, or an open begin/end relationship in the same tx). Being sponsored does not
  block a merge, and signers (incl. sponsored signers) are removed automatically [S8].
- Pool-share redemption on revocation (CAP-38): resulting claimable balances "will be sponsored by the
  sponsor of the pool share trust line" [S6].
- Clawback of a sponsored claimable balance: "the reserve held in sponsorship will be freed for the
  sponsor" [S10].

### 3.3 Result codes (for reference) [S9]
- Begin: `MALFORMED -1`, `ALREADY_SPONSORED -2`, `RECURSIVE -3`.
- End: `NOT_SPONSORED -1`.
- Revoke: `DOES_NOT_EXIST -1`, `NOT_SPONSOR -2`, `LOW_RESERVE -3`, `ONLY_TRANSFERABLE -4`, `MALFORMED -5`.
- Op-level: `opTOO_MANY_SPONSORING -6` ("account is sponsoring too many entries").
- Tx-level: `txBAD_SPONSORSHIP -14` ("sponsorship not confirmed").

### 3.4 Horizon sponsorship effects [S11]
`account_sponsorship_created/updated/removed` (60-62), `trustline_sponsorship_*` (63-65),
`data_sponsorship_*` (66-68), `claimable_balance_sponsorship_*` (69-71), `signer_sponsorship_*` (72-74).
Offers have no sponsorship effect type in this list (see Open questions RS-3).

## 4. Accounting implications (design notes, not protocol facts)

1. Reserve locked for account A at ledger L =
   `(2 + numSubEntries + numSponsoring - numSponsored) * baseReserve(L)`, computable from the
   `AccountEntry` after each change plus the ledger header. Report as "XLM locked as reserve" and
   "XLM committed to sell offers" (selling liabilities), separate from free balance.
2. Sponsorship changes *who* has XLM locked; it produces no debit/credit. A sponsor's books show
   increased restricted XLM; the sponsored account's restricted XLM falls (can go below its own
   base 2 reserves, e.g. a 0-XLM sponsored account).
3. Claimable balance reserve (one per claimant) is locked on the **creator**, not on claimants, until
   the balance is claimed or clawed back.

---

## Sources

All retrieved 2026-11-16.

- [S1] Lumens: https://developers.stellar.org/docs/learn/fundamentals/lumens
- [S2] stellar-xdr `curr` (commit 579a90b): `Stellar-ledger-entries.x`, `Stellar-ledger.x` - https://github.com/stellar/stellar-xdr/tree/curr
- [S3] CAP-33 Sponsored reserves: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0033.md
- [S4] Sponsored reserves guide: https://developers.stellar.org/docs/build/guides/transactions/sponsored-reserves
- [S5] Accounts: https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/accounts
- [S6] CAP-38 Automated market makers: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0038.md
- [S7] Fees, resource limits and metering: https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering
- [S8] List of operations: https://developers.stellar.org/docs/learn/fundamentals/transactions/list-of-operations
- [S9] stellar-xdr `curr` `Stellar-transaction.x`: https://github.com/stellar/stellar-xdr/blob/curr/Stellar-transaction.x
- [S10] CAP-35 Asset clawback: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0035.md
- [S11] Horizon effect type constants: https://github.com/stellar/stellar-horizon/blob/main/internal/db2/history/main.go

## Open questions

- **RS-1** Docs disagree on pool-share trustline wording: Accounts page and CAP-38 say "two subentries"; the Liquidity page phrases it as requiring "2 base reserves". Economically the same (2 reserves); confirm `numSubEntries` increments by 2 via meta.
- **RS-2** CAP-23 (original claimable balances) described deducting `claimants * baseReserve` XLM from the creator into the entry; CAP-33 removed the entry's `reserve` field and the sponsorship guide says claimable balances are sponsored "through built-in logic". Current behaviour should be: no XLM moves, creator's `numSponsoring` rises. Verify on Mainnet meta that the creator's `balance` does not drop by the reserve.
- **RS-3** Offer sponsorship: offers are sponsorable per the guide, but Horizon has no `offer_sponsorship_*` effect. Determine how offer sponsorship is surfaced (meta `sponsoringID` only?).
- **RS-4** CAP-33 does not say what happens to a merged account's own sponsored entries/signers beyond "signers are removed automatically" (docs). Confirm sponsor counters are decremented on merge.
- **RS-5** Should StellarBooks emit memo entries (off-balance) for reserve changes, or only report reserve as a computed balance attribute? Product decision.
