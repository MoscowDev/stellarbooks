# Domain Model

This describes `@stellarbooks/core` as of M1. The generated API reference (`pnpm run docs:api`,
output in `docs/api/`) is authoritative for exact signatures. This document explains the concepts
and invariants.

## Amounts and assets (ADR-0004)

| Concept    | Type                                | Notes                                                                                            |
| ---------- | ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| Asset      | `AssetId` (branded string)          | One canonical spelling per asset: `native`, `classic:CODE:ISSUER`, `pool:<64 hex>`, `sep41:C...` |
| Amount     | `{ asset: AssetId; units: bigint }` | Minor units. Never a float. Range-checked to i128.                                               |
| Scale      | `protocolScale(asset)`              | 7 for native, classic and pool shares. SEP-41 decimals are supplied by the caller (Q-020).       |
| Formatting | `formatUnits` / `parseUnits`        | Exact. Parsing rejects excess precision instead of rounding.                                     |

**Address checks in `core` are structural only:** prefix, length and base32 alphabet. Checksums are
verified in `stellar-ingest` with the official SDK. Counterparties are always **base** addresses
(`G...` or `C...`). Muxed IDs are carried separately (`muxedId`, `counterpartyMuxedId`).

## Chart of accounts

- An `Account` has a `code`, `name`, `type` (asset, liability, equity, income or expense) and an
  optional `parent` of the same type.
- `createChart(accounts, system)` validates and freezes the chart.
- **System accounts** must be designated in every chart:

| Role                | Required type | Purpose                                                                  |
| ------------------- | ------------- | ------------------------------------------------------------------------ |
| `wallets`           | asset         | On-chain balances. Lines carry the wallet address as a sub-ledger.       |
| `escrow`            | asset         | Value locked in claimable balances created by tracked wallets            |
| `internalTransfers` | asset         | Clearing account for transfers between tracked wallets. It nets to zero. |
| `conversion`        | equity        | Trading account balancing each asset leg of an exchange (ADR-0005)       |
| `suspense`          | any           | Unexplained balance changes awaiting review (Q-016)                      |
| `networkFees`       | expense       | Network fees                                                             |
| `retainedEarnings`  | equity        | Target of period close (M6)                                              |

## Source positions

- A `SourcePosition` locates a fact on chain:
  - `network`, `ledger`, `txIndex` and `txHash`
  - `stage`: `fee`, `operation` or `post_apply`
  - `opIndex` and `eventIndex`
- `compareSourcePositions` gives a total order: ledger, then transactions in apply order. Within a
  transaction the fee comes first, then operations. Post-apply facts, such as Soroban refunds from
  Protocol 23, come after all transactions in their ledger.

## Economic events

Normalized facts about **one** tracked wallet (`EconomicEvent`, discriminated by `kind`):

| Kind                  | Meaning                                 | Key fields                                                              |
| --------------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| `fee`                 | Fee charged to the fee-paying wallet    | `amount` (native)                                                       |
| `fee_refund`          | Part of a fee refunded                  | `amount` (native)                                                       |
| `transfer`            | Value in or out, one asset              | `direction`, `amount`, `counterparty?`, `counterpartyMuxedId?`, `via`   |
| `exchange`            | Gave some assets, received others       | `given[]`, `received[]`, `via`                                          |
| `escrow`              | Claimable balance created by the wallet | `action` (lock, reclaim, release or clawed_back), `amount`, `balanceId` |
| `unclassified_change` | Balance change nobody explained         | signed `delta`, `reason`                                                |

`transfer.via` is one of the following:

- `payment`
- `path_payment`
- `create_account`
- `account_merge`
- `claimable_balance`
- `clawback`
- `contract_transfer`
- `contract_mint`
- `contract_burn`
- `contract_clawback`

`exchange.via` is one of `path_payment`, `offer`, `liquidity_pool_deposit` or
`liquidity_pool_withdraw`.

A path payment sent by a tracked wallet is **two** events: an `exchange` (what it gave and what was
delivered) and an outgoing `transfer` of the delivered amount. The receiver sees one incoming
`transfer`.

## Journal entries

- `JournalEntry` fields:
  - `postingKey` and `sourceKey`
  - `date`, the ledger close time in ISO 8601 UTC. Fractional seconds are allowed, for Protocol 30
    millisecond close times.
  - `description` and `lines`
  - optional: `source`, `ruleId`, `ruleSetVersion`, `reverses` and `meta`
- `JournalLine` fields:
  - `account` and a signed `amount`. **Positive is a debit, negative is a credit.**
  - optional: `wallet`, `counterparty` and `note`
- `canonicalEntryJson(entry)` gives a byte-stable serialization. Keys are sorted, bigints become
  strings and `undefined` is omitted. Storage hashes it to detect a replay that changes content.

## Keys (ADR-0006, ADR-0010)

- `sourceKey`: `chain/<network>/<ledger>/<txHash>/<stage>/<opIndex or ->/<eventIndex>/<ruleId>`
- `postingKey`: `<sourceKey>@<ruleSetVersion>`
- reversal: `reversal/<postingKey>`
- manual: `manual/<id>`

## Mapping rules

- A `RuleSet` has an `id`, a `version` and ordered `rules`. **The first matching rule wins.**
- `mapEvents(events, ruleSet, { chart, trackedWallets })` sorts events by source position, validates
  each one, applies the first matching rule and validates the entry. A duplicate posting key within a batch is reported as `ENTRY_KEY_DUPLICATE`. It returns `entries`,
  `unmatched` and `failures`. Nothing is silently dropped, and a throwing rule becomes a failure.
- Custom rules: `defineRule` and `extendRuleSet(base, { id, version, rules })` place your rules ahead
  of a template's. The templates' rules are available through `standardRules(system, policy)`.
- Templates: `freelancerTemplate()`, `merchantTemplate()` and `payrollTemplate()`. Their mappings are
  listed in [ACCOUNTING-RULES.md](ACCOUNTING-RULES.md#template-mapping-m1).

## Invariants and where they are enforced

| #   | Invariant                                                                  | Code                                        | Tests                                     |
| --- | -------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------- |
| 1   | Each entry sums to zero per asset                                          | `validateEntry` (later also the DB trigger) | `journal.test.ts` property                |
| 2   | Amounts are bigint, non-zero and within i128                               | `amount`, `validateEntry`                   | `asset-amount.test.ts`, `journal.test.ts` |
| 3   | An entry plus its reversal net to zero for every account, asset and wallet | `reverseEntry`                              | `journal.test.ts` property                |
| 4   | Mapping is deterministic and independent of input order                    | `mapEvents`                                 | `mapping.test.ts` property                |
| 5   | Every template handles every event kind                                    | templates                                   | `mapping.test.ts` property                |
| 6   | Mapped entries always balance                                              | `mapEvents`                                 | `mapping.test.ts` property                |
| 7   | `core` has no I/O or dependencies                                          | lint and structure test                     | `test/repo-structure.test.ts`             |
