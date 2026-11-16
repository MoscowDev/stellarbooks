# Accounting Rules

How each Stellar operation and event becomes journal entries. This document is normative: the
mapping code and its golden fixtures must match it, and a change to either must update this file.

> **Status:** skeleton (M0). The "Journal entries" column is filled in milestones M3 and M4, and each
> row is verified against a golden fixture from a real testnet transaction. Until then, every row
> is **TBD**. The balance-effect column summarises
> [docs/research/stellar-operations.md](research/stellar-operations.md) and is not yet verified with
> fixtures.

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

| Source                                | Balance effect (research)                                  | Journal entries | Fixture |
| ------------------------------------- | ---------------------------------------------------------- | --------------- | ------- |
| Fee charged (successful or failed tx) | Fee-paying account loses `feeCharged`                      | TBD (M3)        | TBD     |
| Soroban fee refund                    | Refundable part returned (P23+: post-apply fee processing) | TBD (M3/M4)     | TBD     |
| Failed transaction                    | Fee only; operations have no effect                        | TBD (M3)        | TBD     |

## Operations

| #   | Operation                          | Balance effect (research)                                   | Journal entries | Fixture |
| --- | ---------------------------------- | ----------------------------------------------------------- | --------------- | ------- |
| 0   | `create_account`                   | XLM from source to new account                              | TBD (M3)        | TBD     |
| 1   | `payment`                          | Asset from source to destination                            | TBD (M3)        | TBD     |
| 2   | `path_payment_strict_receive`      | Multi-asset; received = `last.amount`, sent derived (Q-021) | TBD (M3)        | TBD     |
| 3   | `manage_sell_offer`                | Moves only if it crosses                                    | TBD (M3)        | TBD     |
| 4   | `create_passive_sell_offer`        | Moves only if it crosses                                    | TBD (M3)        | TBD     |
| 5   | `set_options`                      | None (reserve only)                                         | none (metadata) | TBD     |
| 6   | `change_trust`                     | None (reserve only)                                         | none (metadata) | TBD     |
| 7   | `allow_trust` (deprecated)         | Indirect (offer removal, LP redemption)                     | TBD (M3)        | TBD     |
| 8   | `account_merge`                    | All XLM from source to destination                          | TBD (M3)        | TBD     |
| 9   | `inflation` (retired)              | None (`opNOT_SUPPORTED`)                                    | none            | n/a     |
| 10  | `manage_data`                      | None (reserve only)                                         | none (metadata) | TBD     |
| 11  | `bump_sequence`                    | None                                                        | none            | TBD     |
| 12  | `manage_buy_offer`                 | Moves only if it crosses                                    | TBD (M3)        | TBD     |
| 13  | `path_payment_strict_send`         | Multi-asset                                                 | TBD (M3)        | TBD     |
| 14  | `create_claimable_balance`         | Asset from source to escrow                                 | TBD (M3)        | TBD     |
| 15  | `claim_claimable_balance`          | Escrow to claimant (amount from meta)                       | TBD (M3)        | TBD     |
| 16  | `begin_sponsoring_future_reserves` | None                                                        | none (metadata) | TBD     |
| 17  | `end_sponsoring_future_reserves`   | None                                                        | none (metadata) | TBD     |
| 18  | `revoke_sponsorship`               | None (reserve shifts)                                       | none (metadata) | TBD     |
| 19  | `clawback`                         | Holder's asset destroyed                                    | TBD (M3)        | TBD     |
| 20  | `clawback_claimable_balance`       | Escrowed asset destroyed                                    | TBD (M3)        | TBD     |
| 21  | `set_trust_line_flags`             | Indirect (offer removal, LP redemption)                     | TBD (M3)        | TBD     |
| 22  | `liquidity_pool_deposit`           | Two assets to pool, shares minted (meta only)               | TBD (M3)        | TBD     |
| 23  | `liquidity_pool_withdraw`          | Shares burned, two assets returned (meta only)              | TBD (M3)        | TBD     |
| 24  | `invoke_host_function`             | Contract-dependent (meta plus SAC/SEP-41 events)            | TBD (M4)        | TBD     |
| 25  | `extend_footprint_ttl`             | Fee only                                                    | none            | TBD     |
| 26  | `restore_footprint`                | Fee only                                                    | none            | TBD     |

## Soroban token events (M4)

| Event                   | Journal entries | Fixture |
| ----------------------- | --------------- | ------- |
| SEP-41 / SAC `transfer` | TBD             | TBD     |
| `mint`                  | TBD             | TBD     |
| `burn`                  | TBD             | TBD     |
| `clawback`              | TBD             | TBD     |
