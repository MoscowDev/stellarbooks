# Accounting Rules

How each Stellar operation and event becomes journal entries. This document is normative: the
mapping code and its golden fixtures must match it, and a change to either must update this file.

`decodeLedger` decodes every transaction in a ledger, and `classifyTransaction` turns tracked
wallets' activity into events. **Captured** means exact assertions on testnet ledger 5796891
(`packages/stellar-ingest/test/ledger-decoder.test.ts`). **Live check** means the operation
appeared in the opt-in testnet run, which requires zero mapping failures and an exact match between
journal wallet totals and on-chain changes, but makes no per-operation assertions. Anything the
classifier cannot explain goes to `Suspense`, so "suspense" below is a documented gap, not a loss.
The balance-effect column summarises [Stellar operations research](research/stellar-operations.md).

## Conventions

- **Signed amounts:** debits are positive and credits are negative. Each entry sums to zero **per
  asset** (ADR-0005).
- **Exchanges** go through the `Conversion` account.
- **Fees** are charged to the fee-paying account (the outer account for fee-bump transactions), and
  are booked as network fees expense, which is the default policy (Q-015).
- **Unexplained balance changes** on a tracked account go to `Suspense` (Q-016, ADR-0008).
- **Reserves and sponsorship** move no value. They are reported as locked-balance information, never
  as journal entries.

## Transaction-level

| Source                                | Balance effect (research)                                  | Journal entries                                                                                                       | Fixture                                        |
| ------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Fee charged (successful or failed tx) | Fee-paying account loses `feeCharged`                      | Debit network fees, credit fee payer wallet, for `feeCharged`                                                         | Captured (25 transactions); live check         |
| Soroban fee refund                    | Refundable part returned (P23+: post-apply fee processing) | Netted into the single fee entry (`feeCharged` is already net). ADR-0008 asks for a separate refund event (issue 05). | Captured (17 Soroban transactions); live check |
| Fee-bump transaction                  | Outer fee source pays; inner source runs the operations    | Fee entry on the outer fee source                                                                                     | Captured (tx 9); live check                    |
| Failed transaction                    | Fee only; operations have no effect                        | Fee entry only                                                                                                        | Captured (txs 1 and 3); live check             |

The decoder checks every transaction: the fee payer's XLM changes in fee processing,
`postTxApplyFeeProcessing` and transaction-level changes must net to exactly `-feeCharged`.

## Operations

| #   | Operation                          | Balance effect (research)                                   | Journal entries                                                                                     | Fixture                               |
| --- | ---------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 0   | `create_account`                   | XLM from source to new account                              | `transfer` (`create_account`) on each tracked side; none when the starting balance is 0 (sponsored) | Captured (tx 4); live check           |
| 1   | `payment`                          | Asset from source to destination                            | `transfer` (`payment`) on each tracked side                                                         | Captured (tx 6); live check           |
| 2   | `path_payment_strict_receive`      | Multi-asset; received = `last.amount`, sent derived (Q-021) | Payment to self: `exchange`. To another account: both legs to suspense (issue 09)                   | Live check                            |
| 3   | `manage_sell_offer`                | Moves only if it crosses                                    | Crossing amounts to suspense (issue 15)                                                             | Captured, no cross (tx 0); live check |
| 4   | `create_passive_sell_offer`        | Moves only if it crosses                                    | Crossing amounts to suspense (issue 15)                                                             | Not observed                          |
| 5   | `set_options`                      | None (reserve only)                                         | none (metadata)                                                                                     | Live check                            |
| 6   | `change_trust`                     | None (reserve only)                                         | none (metadata)                                                                                     | Live check                            |
| 7   | `allow_trust` (deprecated)         | Indirect (offer removal, LP redemption)                     | Any balance change to suspense                                                                      | Not observed                          |
| 8   | `account_merge`                    | All XLM from source to destination                          | `transfer` (`account_merge`) for the amount the destination received; none when it is 0             | Captured (tx 5); live check           |
| 9   | `inflation` (retired)              | None (`opNOT_SUPPORTED`)                                    | none                                                                                                | n/a                                   |
| 10  | `manage_data`                      | None (reserve only)                                         | none (metadata)                                                                                     | Captured (failed tx 3); live check    |
| 11  | `bump_sequence`                    | None                                                        | none                                                                                                | Live check                            |
| 12  | `manage_buy_offer`                 | Moves only if it crosses                                    | Crossing amounts to suspense (issue 15)                                                             | Live check                            |
| 13  | `path_payment_strict_send`         | Multi-asset                                                 | Payment to self: `exchange`. To another account: both legs to suspense (issue 08)                   | Captured, to self (tx 2); live check  |
| 14  | `create_claimable_balance`         | Asset from source to escrow                                 | `escrow` `lock` for the creator; balance ID from the created entry                                  | Live check                            |
| 15  | `claim_claimable_balance`          | Escrow to claimant (amount from meta)                       | Claimant's change to suspense; the creator side needs a balance-ID lookup (Q-042, issue 12)         | Live check                            |
| 16  | `begin_sponsoring_future_reserves` | None                                                        | none (metadata)                                                                                     | Live check                            |
| 17  | `end_sponsoring_future_reserves`   | None                                                        | none (metadata)                                                                                     | Live check                            |
| 18  | `revoke_sponsorship`               | None (reserve shifts)                                       | none (metadata)                                                                                     | Not observed                          |
| 19  | `clawback`                         | Holder's asset destroyed                                    | `transfer` (`clawback`) out of the holder, booked as a write-off                                    | Live check                            |
| 20  | `clawback_claimable_balance`       | Escrowed asset destroyed                                    | Not classified; no wallet balance changes                                                           | Not observed                          |
| 21  | `set_trust_line_flags`             | Indirect (offer removal, LP redemption)                     | Any balance change to suspense                                                                      | Live check                            |
| 22  | `liquidity_pool_deposit`           | Two assets to pool, shares minted (meta only)               | `exchange` from the source's own deltas                                                             | Not observed                          |
| 23  | `liquidity_pool_withdraw`          | Shares burned, two assets returned (meta only)              | `exchange` from the source's own deltas                                                             | Not observed                          |
| 24  | `invoke_host_function`             | Contract-dependent (meta plus SAC/SEP-41 events)            | Contract events are not decoded yet; balance changes to suspense (issues 18, 19)                    | Captured (17 txs); live check         |
| 25  | `extend_footprint_ttl`             | Fee only                                                    | none                                                                                                | Live check                            |
| 26  | `restore_footprint`                | Fee only                                                    | none                                                                                                | Live check                            |

## Soroban token events (M4)

`decodeLedger` does not decode contract events yet. A token movement that changes a tracked
account's XLM or trustline balance still reaches the journal through suspense. Balances held by
contract (`C`) addresses are not read (Q-025).

| Event                   | Journal entries                                                  | Fixture        |
| ----------------------- | ---------------------------------------------------------------- | -------------- |
| SEP-41 / SAC `transfer` | Classifier ready for decoded events; decoding pending (issue 18) | Synthetic only |
| `mint`                  | Classifier ready for decoded events; decoding pending (issue 18) | Synthetic only |
| `burn`                  | Classifier ready for decoded events; decoding pending (issue 18) | Synthetic only |
| `clawback`              | Classifier ready for decoded events; decoding pending (issue 18) | Synthetic only |

## Template mapping (M1)

How the built-in templates (`standardRules`) turn each economic event into lines. Signs: `+` is a
debit and `−` is a credit. **W** is the wallets account (1100) with the wallet sub-ledger. The first
matching rule wins, in the order listed. Templates differ only in the policy accounts:

| Template   | Inflow (`transfer-in`)         | Outflow (`transfer-out`, escrow `release`) | Write-off |
| ---------- | ------------------------------ | ------------------------------------------ | --------- |
| freelancer | 4100 Client income             | 6100 Business expenses                     | 6950      |
| merchant   | 4100 Sales                     | 6100 Supplier payments and refunds         | 6950      |
| payroll    | 3100 Employer funding (equity) | 6100 Salaries and wages                    | 6950      |

| Rule id              | Event                                                                               | Lines                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `fee`                | `fee`                                                                               | + 6900 Network fees, − W                                                                              |
| `fee-refund`         | `fee_refund`                                                                        | + W, − 6900                                                                                           |
| `transfer-internal`  | `transfer` whose counterparty is a tracked wallet (including itself: self-payments) | in: + W, − 1190; out: + 1190, − W                                                                     |
| `transfer-write-off` | `transfer` out via `clawback`, `contract_clawback` or `contract_burn`               | + write-off, − W                                                                                      |
| `transfer-in`        | other incoming `transfer`                                                           | + W, − inflow                                                                                         |
| `transfer-out`       | other outgoing `transfer`                                                           | + outflow, − W                                                                                        |
| `exchange`           | `exchange`                                                                          | per given asset: − W, + 3900 Conversion; per received asset: + W, − 3900                              |
| `escrow`             | `escrow` lock / reclaim / release / clawed_back                                     | lock: + 1150, − W; reclaim: + W, − 1150; release: + outflow, − 1150; clawed_back: + write-off, − 1150 |
| `unclassified`       | `unclassified_change`                                                               | + W by the signed delta, − 2990 Suspense                                                              |

These are **defaults, not advice**. For example, a payroll wallet receiving money from an employer's
treasury is booked as equity funding. If your treasury is a tracked wallet, the transfer is internal
instead. Override with `extendRuleSet`.

Operations marked "suspense" above still reach the journal exactly. They need review, or a
dedicated classifier, before they land in the right account.

## Captured XLM example

The default freelancer rules debit expenses (6100) and credit the sender wallet (1100)
by 10,000,000 stroops. The fee rule debits network fees (6900) and credits the sender wallet
(1100) by 100 stroops. See [the runnable example](../examples/raw-payment.mjs).
