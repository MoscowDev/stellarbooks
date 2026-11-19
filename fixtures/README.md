# StellarBooks Golden Fixtures

`data/testnet-ledger.json` captures public testnet ledger **5796891** on 2026-11-18
from the Stellar testnet RPC. Tests verify that the pinned SDK decodes its raw metadata.
Transaction-to-journal validation for this fixture remains open (Q-034).

The TypeScript datasets in `data/golden-fixtures.ts` are synthetic classifier cases.
Their journal expectations are generated with the same mapping function used by the tests.

Golden fixtures provide end-to-end verification datasets for StellarBooks. They couple
deterministic Stellar ledger transaction records with the exact `EconomicEvent[]` and
per-asset-balanced `JournalEntry[]` that the library is expected to produce.

## Coverage

- **Classic Operations:**
  - `payment` (native XLM and issued credit assets)
  - `path_payment_strict_send` & `path_payment_strict_receive`
  - `create_account`
  - `account_merge`
  - `create_claimable_balance` & `claim_claimable_balance`
  - `liquidity_pool_deposit` & `liquidity_pool_withdraw`
  - `clawback`
  - `manage_sell_offer` (orderbook crossing)
- **Transaction & System Levels:**
  - Regular fee charged to source
  - Fee bump transactions with outer fee source attribution
  - Failed transactions (fee-only, operations skipped)
  - Muxed addresses (`M...`) and transaction memos (text, id, hash, return)
- **Soroban Smart Contracts:**
  - Stellar Asset Contract (SAC) events: `transfer`, `mint`, `burn`, `clawback`
  - Custom SEP-41 token events
  - CAP-67 meta delta cross-checking

## Structure

Each fixture defines:
1. `id`: unique kebab-case test identifier.
2. `ledgerRecord`: sequence, timestamp, transactions, operations, meta balance deltas, and contract events.
3. `trackedWallets`: array of public keys (`G...`) tracked for the test.
4. `expectedEvents`: normalized `EconomicEvent[]`.
5. `expectedJournal`: resulting balanced `JournalEntry[]` mapped using the standard rules.
