# Research: Soroban and unified asset events

Status: evidence only. Every factual section cites official sources, all retrieved 2026-11-16.

---

## 1. Event model

- **Types** (`ContractEventType`) [E1]:
  - **CONTRACT**: "events emitted by contracts that use the `contract_event` host function to convey state changes."
  - **SYSTEM**: "events emitted by the host. At the moment, there's only one system event emitted by the host."
  - **DIAGNOSTIC**: "meant for debugging and will not be emitted unless the host instance explicitly enables it." They are "not hashed into the ledger, and therefore are not part of the protocol." They are enabled by `ENABLE_SOROBAN_DIAGNOSTIC_EVENTS=true`.
- **Structure**: a `ContractEvent` has a `contractID`, `topics` (a vector of ScVal, mixed types allowed) and a `data` ScVal of any type [E1].
- **getEvents limits** [E2]:
  - Topic filters match 1 to 4 segments, so filterable topics are capped at 4 segments per filter.
  - The page does not state a maximum number of topics per event.
- **Location in meta (TransactionMetaV4, Protocol 23+)** [E1, E3]:
  - Operation-level events are in `OperationMetaV2.events`.
  - Transaction-level events (currently only `fee`) are in the top-level `events` vector as `TransactionEvent` (stage + event).
  - `diagnosticEvents` is separate.
  - For V3 Soroban meta, `events` "will only be populated if the transaction succeeds".
- **Hashing**: Soroban contract event hashes are still committed under `INVOKE_HOST_FUNCTION_SUCCESS`. "Classic events are not hashed into the ledger." Meta emission is controlled by a config flag because meta is not part of the protocol [E3].

## 2. RPC `getEvents`

- **Retention**: "history-retention-window setting with a stock default of 120960 ledgers" (about 7 days). Requests outside `[oldestLedger, latestLedger]` error [E2]. The events concept page says providers "typically only keep short chunks (less than a week)" and calls events "ephemeral" [E1].
- **Pagination**: an opaque `cursor`, with `limit` from 1 to 10000 (default 100). `startLedger` is inclusive and `endLedger` exclusive. Omit both when using a cursor [E2].
- **Filters**: up to 5 filters, each with up to 5 `contractIds`. `type` is `system` or `contract`. Topic matchers are base64 ScVal, `*` or `**` (last position only). Events matching any filter are returned [E2].
- **Response**:
  - Top level: `events`, `latestLedger`, `oldestLedger`, `latestLedgerCloseTime`, `oldestLedgerCloseTime`, `cursor`.
  - Per event: `type`, `ledger`, `ledgerClosedAt`, `contractId`, `id`, `transactionIndex`, `operationIndex`, `topic`, `value`, `txHash`.
  - `id` is a 19-character TOID plus a 10-character event index. **Deduplicate on `id`** [E2].
  - `xdrFormat` is `base64` (default) or `json`, and the JSON schema is not stable [E2].
- **Classic events in getEvents** require Core `EMIT_CLASSIC_EVENTS=true`. Pre-P23 ledgers also need `BACKFILL_STELLAR_ASSET_EVENTS=true`. "Classic events are not on by default." [E4, E1]
- `getTransactions` also returns `events.transactionEventsXdr` and `events.contractEventsXdr` (an array per operation) [E5].
- **Implication for StellarBooks**: RPC holds events for about 7 days only. The library must checkpoint (store the cursor or last ledger) and persist raw events and meta itself. Re-deriving older events needs `getLedgers` with a data lake or a SEP-54 lake (see data-sources.md).

## 3. CAP-67 Unified Asset Events

- **Status: Final, Protocol 23** [E3]. Protocol 23 ("Whisk", Unified Events CAP-67) activated on mainnet **2025-09-03** and on testnet 2025-08-14 [E6].
- **Goal**: "Emit an event for every movement of an `Asset`" [E3].
- **Contract address**: events use the asset's reserved SAC address. "The Stellar Asset Contract instance is not required to be deployed for the asset"; events "will be published using the reserved contract address regardless of deployment status." [E3]

### Formats (Protocol 23+)

| Event | Topics | Data |
|---|---|---|
| transfer | `["transfer", from:Address, to:Address, sep0011_asset:String]` | `amount:i128`, or map `{amount, to_muxed_id}` |
| mint | `["mint", to:Address, sep0011_asset:String]` (admin removed) | `amount:i128`, or map `{amount, to_muxed_id}` |
| burn | `["burn", from:Address, sep0011_asset:String]` | `amount:i128` |
| clawback | `["clawback", from:Address, sep0011_asset:String]` (admin removed) | `amount:i128` |
| set_authorized | `["set_authorized", id:Address, sep0011_asset:String]` (admin removed) | `authorize:bool` |
| fee | `["fee", from:Address]`, emitted by the native asset contract, with no asset topic | `amount:i128` |

Source: [E3].

### Semantics
- **Issuer rule**: a transfer from the issuer emits `mint`, and a transfer to the issuer emits `burn`, instead of `transfer`. This applies to SAC and to classic operations [E3].
- **Classic operation coverage** [E3]:
  - Payment emits transfer, mint or burn.
  - Path payment emits one event per trade side plus a final source-to-destination transfer.
  - Create account and account merge emit native transfers.
  - Creating and claiming a claimable balance emits transfers to or from the balance (mint or burn for the issuer).
  - Liquidity pool deposit and withdraw emit transfers into or out of the pool.
  - Manage buy/sell offers and passive offers emit 2 events per trade.
  - Clawback and clawback claimable balance emit clawback.
  - Allow trust and set trustline flags emit `set_authorized`. Revocation that creates claimable balances from pool assets also emits transfers.
  - Inflation emits a mint per winner.
  - **No events** for Change Trust or Set Options.
- **Addresses**: new `ScAddress` types `SC_ADDRESS_TYPE_CLAIMABLE_BALANCE`, `SC_ADDRESS_TYPE_LIQUIDITY_POOL` and `SC_ADDRESS_TYPE_MUXED_ACCOUNT` are added. The first two are "disallowed by host", meaning they cannot be used in contracts and appear only in events. "The muxed account is always represented as a pair of (non-muxed ScAddress, muxed_id)." [E3]
- **Fee events** [E3]:
  - Emitted at the transaction level. `from` is the fee-bump fee account, or otherwise the tx source.
  - A positive amount is a charge and a negative amount is a refund.
  - The initial charge is at `TRANSACTION_EVENT_STAGE_BEFORE_ALL_TXS`. From P23, refunds are at `AFTER_ALL_TXS` and only when non-zero.
  - "The total fee is the sum of all fee event amounts."
- **Pre-protocol-8 XLM mint/burn bugs**: a net diff event is emitted per affected account (mints first, burns last) so that "consumers should be able to track balances correctly." [E3]
- **Replay / backfill**: a config flag (off by default) emits V20 to V22 SAC events in the V23 format [E3]. This is the `BACKFILL_STELLAR_ASSET_EVENTS` setting in docs [E1, E4].

### Muxed and memo handling (CAP-67)
- The SAC `transfer` takes `to: MuxedAddress`. The `to` topic is always the underlying (non-muxed) address, and the ID goes into data as `to_muxed_id` [E3, E7].
- `to_muxed_id` can be u64, bytes or string [E3]:
  - For **classic** ops with a non-muxed destination, the tx memo maps to it: `MEMO_ID` becomes u64, `MEMO_TEXT` becomes string, `MEMO_HASH` and `MEMO_RETURN` become bytes.
  - A muxed destination ID takes precedence over the memo.
  - No memo is emitted when the destination is a claimable balance or a liquidity pool. Offers, LP deposits and inflation carry no `to_muxed_id`.
- Without muxed info, data stays a plain `i128`. **Consumers must handle both shapes** [E3].
- Muxed addresses are rejected in contract data storage keys [E3].

### Determinism caveat
Classic events are **not consensus data**: they are not hashed and depend on a config flag [E3, E4]. Two data sources may differ in whether they contain them. Ledger entry changes in meta are the consensus-bound record.

## 4. Stellar Asset Contract (SAC)

- **CAP-46-06**: status **Final**, Protocol 20 [E8]. The SAC implements SEP-41 for Stellar assets directly on trustlines and native balances [E7].
- **Address**: "Every Stellar asset on Stellar has reserved a contract address." It is deterministic: the sha256 of the contract ID preimage XDR [E7].
- **Admin**: the admin functions are `set_admin`, `admin`, `set_authorized`, `authorized`, `mint`, `clawback` and `trust`. The issuer is the initial admin. The native asset has no admin and "cannot be burned" [E7].
- **Balances**: contract balances are i128. Trustline balances are i64, so amounts beyond that range fail [E7].
- **Original (P20) SAC event formats per CAP-46-06**, with `sep0011_asset: String` as the last topic in every event [E8]:
  - approve: `["approve", from, spender, asset]`, data `[amount:i128, live_until_ledger:u32]`
  - transfer: `["transfer", from, to, asset]`, data `amount:i128`
  - burn: `["burn", from, asset]`, data `amount`
  - set_admin: `["set_admin", admin, asset]`, data `new_admin:Address`
  - set_authorized: `["set_authorized", admin, id, asset]`, data `authorize:bool`
  - mint: `["mint", admin, to, asset]`, data `amount`
  - clawback: `["clawback", admin, from, asset]`, data `amount`
- **Change at P23 (CAP-67)**: the admin is removed from mint, clawback and set_authorized topics, and issuer transfers become mint or burn [E3]. **A decoder must branch on ledger protocol version, or on topic arity**, for SAC events emitted before P23, unless the source re-emitted them in V23 format via backfill.
- **`sep0011_asset` string format**: CAP-46-06 and CAP-67 do not define it beyond "String" [E3, E8]. SEP-11 defines asset strings as `native` or `CODE:ISSUER` (see seps.md). The link is implied by the name but not stated in the CAPs.

## 5. SEP-41 Token Interface

- **Status: Draft**, v0.5.2, updated 2026-08-24 [E9].
- **Functions**:
  - `allowance`
  - `approve(from, spender, amount, live_until_ledger)`
  - `balance`
  - `transfer(from, to: MuxedAddress, amount)`
  - `transfer_from(spender, from, to: Address, amount)`
  - `burn`, `burn_from`
  - `decimals`, `name`, `symbol`

  There are no `mint`, `clawback`, `set_admin` or `set_authorized` functions. Mint and clawback are defined only as events [E9].
- **Events**: consumers **must accept both** a single-value/vec data format and a map data format with Symbol keys (v0.5.0) [E9].

| Event | Topics | Vec/single data | Map data |
|---|---|---|---|
| approve | `"approve", from, spender` | `[amount:i128, live_until_ledger:u32]` | `{amount, live_until_ledger}` |
| transfer (transfer and transfer_from) | `"transfer", from, to` | `amount:i128` | `{amount, to_muxed_id?}` |
| burn (burn and burn_from) | `"burn", from` | `amount` | `{amount}` |
| mint | `"mint", to` | `amount` | `{amount, to_muxed_id?}` |
| clawback | `"clawback", from` | `amount` | `{amount}` |

- `to_muxed_id` is `Option<u64 | String | BytesN<32>>`. String and bytes are for legacy Stellar-asset memos [E9].
- "Implementers may emit additional topics." The SAC adds `sep0011_asset` as an extra topic [E9, E3]. Consumers should therefore match on topic[0] and the positional prefix, not on exact arity.
- A mint event must increase supply and clawback must reduce it. Clawback emits no separate burn or transfer [E9].
- An allowance is "a spending limit, not a reservation" [E9]. For accounting, approve events are memo/off-balance information, not movements.
- **Trust caveat for custom tokens**: SEP-41 is a convention. Non-SAC contracts may misreport or omit events. SEP-1 notes that contract token "behavior ... can vary" (see seps.md).

## 6. Muxed contract addresses (CAP-84, Protocol 30): upcoming

- **CAP-84**: status "Implemented", Protocol 30, created 2026-06-24 [E10].
  - Adds `SC_ADDRESS_TYPE_MUXED_CONTRACT = 5` (contract ID + u64), with strkey prefix `W` per SEP-23.
  - Only the destination is muxed. In events, the topic holds the plain contract address and data holds `{amount, to_muxed_id: u64}`.
  - The CAP-67 memo-to-`to_muxed_id` rule does not apply.
  - Muxed contract addresses are only accepted as the SAC `transfer` destination.
- **Protocol 30 "Bell"**:
  - Testnet vote 2026-11-03. **Mainnet vote 2026-11-23 17:00 UTC**, which is pending as of today.
  - It also includes CAP-88, which changes ledger header and close-meta XDR.
  - The SDK upgrade "is not optional this cycle", and the guide recommends JS SDK v17.3.0 [E11].

## 7. Implications for StellarBooks (evidence-based notes, not decisions)

1. Event decoders must handle:
   - pre-P23 SAC formats (with the admin topic) and P23+ formats;
   - plain `i128` data and map data;
   - `to_muxed_id` as u64, string or bytes;
   - ScAddress variants account, contract, muxed account, claimable balance, liquidity pool and (P30) muxed contract.
2. Fee accounting: sum `fee` events per tx, including negative refunds, and attribute them to the fee-bump payer when present [E3].
3. Events expire from RPC after about 7 days, so persistence and checkpointing are mandatory [E1, E2].
4. Classic events are config-dependent and not hashed. For determinism, cross-check against ledger entry changes in meta [E3, E4].

---

## Sources (all retrieved 2026-11-16)

- [E1] Events concept: https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/events
- [E2] getEvents: https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getEvents
- [E3] CAP-67: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0067.md
- [E4] Migrate from Horizon to RPC: https://developers.stellar.org/docs/data/apis/migrate-from-horizon-to-rpc
- [E5] getTransactions: https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getTransactions
- [E6] Software versions: https://developers.stellar.org/docs/networks/software-versions
- [E7] Stellar Asset Contract: https://developers.stellar.org/docs/tokens/stellar-asset-contract
- [E8] CAP-46-06: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0046-06.md
- [E9] SEP-41: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md
- [E10] CAP-84: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0084.md
- [E11] Blog, Bell (Protocol 30) upgrade guide: https://stellar.org/blog/developers/bell-protocol-30-upgrade-guide

## Open questions

1. **`sep0011_asset` value format** is not defined in CAP-46-06 or CAP-67. Is it exactly SEP-11 `native` / `CODE:ISSUER`, and how are AlphaNum12 codes padded?
2. **Failed transactions**: CAP-67 says "We currently clear all `OperationMeta` when a transaction fails" but does not state explicitly that no operation events are emitted for failed txs. Fee events presumably still apply. This needs confirmation.
3. **Which single SYSTEM event** the host emits is not named on the events page [E1].
4. **Completeness**: CAP-67 states the goal of an event "for every movement" but gives no formal completeness guarantee or reconciliation procedure. Are there known gaps, for example sponsorship reserve changes (not balances) or LP share balances?
5. **Classic event availability by provider**: which providers, the SDF testnet RPC and the AWS lake have `EMIT_CLASSIC_EVENTS` / `BACKFILL_STELLAR_ASSET_EVENTS` enabled? This is not documented.
6. **Backfilled pre-P23 events** are "emitted in the V23 format". Do backfilled SAC events from P20 to P22 drop the admin topic, so that one decoder is enough? This is implied by [E3] but not explicit.
7. **`inSuccessfulContractCall`** is not documented on the current getEvents page. Can failed-call events still appear?
8. **CAP-84 / Protocol 30** mainnet activation is pending (vote 2026-11-23). The CAP's Test Cases and Implementation sections still say "TBD" despite the "Implemented" status [E10].
9. **SEP-44 vs CAP-67 `to_muxed_id`**: SEP-44 (Draft, 2024) defines a memo as a 5th topic of transfer. Its relation to SEP-41 v0.4+ `to_muxed_id` is not addressed in either document.
