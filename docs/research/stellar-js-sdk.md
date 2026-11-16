# Research: Stellar JavaScript SDK (`@stellar/stellar-sdk`)

Retrieved 2026-11-16. Facts below come from npm registry metadata, the installed
package (README + `.d.ts` files of `@stellar/stellar-sdk@17.4.0`, installed with
`npm install --ignore-scripts` in a throwaway directory outside the repo), and
official Stellar / GitHub pages. File paths in this document are relative to
`node_modules/@stellar/stellar-sdk/lib/esm/` unless stated otherwise.

## 1. Package facts

| Item | `@stellar/stellar-sdk` | `@stellar/stellar-base` |
|---|---|---|
| Latest (`npm view ... version`) | **17.4.0** (published 2026-10-25) | 15.0.0 (published 2026-06-18) |
| Other dist-tags | `lts-16` = 16.4.1, `rc` = 17.0.0-rc.2 | — |
| Licence | Apache-2.0 | Apache-2.0 |
| `engines.node` | `>=22.12.0` | `>=20.0.0` |
| Module format | `"type": "module"`; dual build: `exports["."]` → `import`: `./lib/esm/index.js`, `require`: `./lib/cjs/index.js`, `types`: `./lib/esm/index.d.ts` | — |
| Status | Active; published via GitHub Actions trusted publishing (OIDC) per `npm view _npmUser` | **Deprecated on npm**: "This package is now rolled into @stellar/stellar-sdk. Please use @stellar/stellar-sdk to continue receiving updates and support." |

Key points from the SDK README (installed copy, v17.4.0):

- "`@stellar/stellar-base` is now folded into `@stellar/stellar-sdk`. Its classes and functions
  are bundled in and re-exported from the top level ... The fold-in landed in
  `@stellar/stellar-sdk` v16.0.0". **"Don't keep both packages installed. Two copies of the base
  library cause confusing runtime errors, such as `instanceof` checks failing"**.
  → StellarBooks must depend only on `@stellar/stellar-sdk` and must not depend on `@stellar/stellar-base`.
- Offline primitives can be imported from the subpath `@stellar/stellar-sdk/base`
  (StrKey, Keypair, TransactionBuilder, xdr, ...) which avoids loading Horizon/RPC/axios/eventsource.
  Other subpaths in `package.json#exports`: `./rpc`, `./xdr`, `./contract`, `./base`, (README also mentions `./axios`).
- "Use either the latest version (v17) or v16 ... Version 16 remains supported through March 2027
  for protocol compatibility and security fixes ... older unsupported SDK versions may fail to
  decode newer data (for example, newer XDR)."
- Default HTTP transport is native `fetch` (no axios). Horizon `.stream()` uses an `EventSource`
  dependency (`eventsource` ^4.1.0).
- Node: "`require(esm)` is unflagged from Node 22.12.0, the minimum this SDK supports". Compilation
  target must be `es2020`+ (native `BigInt`).
- Runtime deps of 17.4.0 (npm): `@stellar/js-xdr ^5.0.0`, `bignumber.js ^11.1.4`, `@noble/hashes`,
  `@noble/ed25519`, `eventsource`, `axios 1.20.0`, `feaxios`, `commander`, `smol-toml`,
  `@exodus/bytes`, `uint8array-extras`, `@types/json-schema`. Unpacked size ≈ 51.8 MB (includes browser bundles + CLI).

### v17 breaking changes (GitHub release notes v17.0.0, Protocol 28)

From https://github.com/stellar/js-stellar-sdk/releases/tag/v17.0.0:

- Minimum Node raised to 22.12.0.
- "Public APIs use `Uint8Array` instead of Node's `Buffer`".
- "every XDR value now has a different API": unions are discriminated classes with a `.type`
  string literal; enums are singletons; absent optional fields decode to `null`; integers are
  plain `number`/`bigint` ("Integers are `number` or `bigint` instead of class wrappers").
- Acronym renames, "with no back-compat aliases (e.g. `validateXDR()` is now `validateXdr()`)" for
  XDR values (but see below: some classes keep deprecated `XDR` aliases in the 17.4.0 typings).
- Silent behaviour changes relevant to us: `scValToNative` may return `Uint8Array` for invalid
  UTF-8 `scvString`; `Operation.fromXdrObject` decodes some string fields as UTF-8.
- Protocol 28 / CAP-71 auth defaults (not relevant to read-only ingestion).

**Implication:** Code written against v13–v16 examples (e.g. `xdr.TransactionMeta.fromXDR(b64, 'base64').v3().operations()`) will not type-check against v17. StellarBooks should target v17 and the new XDR API.

## 2. Top-level exports

`index.d.ts`:

```ts
export * as Horizon from "./horizon/index.js";
export * as rpc from "./rpc/index.js";
export * as contract from "./contract/index.js";
export * from "./base/index.js";   // xdr, StrKey, Asset, MuxedAccount, Networks, Transaction, FeeBumpTransaction, TransactionBuilder, Address, scValToNative, ...
```

`horizon/index.d.ts`: `export { HorizonServer as Server } from "./server.js";` (so `Horizon.Server`).
`rpc/index.d.ts`: `export { RpcServer as Server, BasicSleepStrategy, LinearSleepStrategy, Durability } from "./server.js";` plus `export * from "./api.js"` (the `Api` namespace) and `parseRawEvents`, `parseRawQueryEvents`, `parseRawSimulation`.

## 3. Horizon (`Horizon.Server`)

`horizon/server.d.ts`:

```ts
export declare class HorizonServer {
    readonly serverURL: URL;
    readonly httpClient: HttpClient;
    constructor(serverURL: string, opts?: HorizonServer.Options);
    feeStats(): Promise<HorizonApi.FeeStatsResponse>;
    root(): Promise<HorizonApi.RootResponse>;
    ledgers(): LedgerCallBuilder;
    transactions(): TransactionCallBuilder;
    operations(): OperationCallBuilder;
    payments(): PaymentCallBuilder;
    effects(): EffectCallBuilder;
    loadAccount(accountId: string): Promise<AccountResponse>;
    ...
}
namespace HorizonServer { interface Options { allowHttp?: boolean; appName?: string; appVersion?: string; authToken?: string; headers?: Record<string, string>; } }
```

Call builder base (`horizon/call_builder.d.ts`):

```ts
call(): Promise<T>;
stream(options?: EventSourceOptions<T extends ServerApi.CollectionPage<infer U> ? U : T>): () => void;
cursor(cursor: string): this;
limit(recordsNumber: number): this;
order(direction: "asc" | "desc"): this;
join(include: "transactions"): this;   // only operations & payments endpoints

export interface EventSourceOptions<T> {
    onmessage?: (value: ...) => void;
    onerror?: (event: MessageEvent) => void;
    reconnectTimeout?: number;          // default 15 s
}
```

Filters:

- `horizon/transaction_call_builder.d.ts`: `transaction(transactionId: string): CallBuilder<ServerApi.TransactionRecord>`, `forAccount(accountId)`, `forClaimableBalance(id)`, `forLedger(sequence: number | string)`, `forLiquidityPool(poolId)`, `includeFailed(value: boolean)`.
- `horizon/operation_call_builder.d.ts`: `operation(operationId)`, `forAccount`, `forClaimableBalance`, `forLedger`, `forTransaction(transactionId)`, `forLiquidityPool`, `includeFailed`.
- `horizon/effect_call_builder.d.ts`: `forAccount(accountId)`, `forLedger(sequence)`, `forTransaction(transactionId)`, `forOperation(operationId)`, `forLiquidityPool(poolId)`.
- `horizon/payment_call_builder.d.ts`: `forAccount`, `forLedger`, `forTransaction`, `includeFailed`.

Paging (`horizon/server_api.d.ts`):

```ts
export interface CollectionPage<T extends HorizonApi.BaseResponse = HorizonApi.BaseResponse> {
    records: T[];
    next: () => Promise<CollectionPage<T>>;
    prev: () => Promise<CollectionPage<T>>;
}
```

Every record carries `paging_token: string` (use as the persistent cursor).

Transaction record (`horizon/horizon_api.d.ts`, `HorizonApi.TransactionResponse`): `id`, `hash`, `ledger`,
`created_at`, `successful`, `envelope_xdr`, `result_xdr`, `result_meta_xdr`, `fee_meta_xdr`,
`fee_charged: number | string`, `max_fee`, `fee_account`, `source_account`, `source_account_sequence`,
`memo_type`, `memo?`, `memo_bytes?`, `operation_count`, `paging_token`, `signatures`,
`inner_transaction?: { hash; signatures; max_fee }`, `fee_bump_transaction?: { hash; signatures }`, `preconditions?`.
`ServerApi.TransactionRecord` renames `ledger` → `ledger_attr` and adds link-follow functions
(`operations()`, `effects()`, `ledger()`, ...).

Horizon returns amounts as decimal strings (e.g. operation `amount: string` in `base/operations/types.d.ts`).

Official status (https://developers.stellar.org/docs/data/apis/horizon): the page does not call
Horizon deprecated; "On August 1, 2024, the publicly accessible SDF-hosted Horizon had its historical
data truncated to one year"; it suggests third-party Horizon providers for longer retention.
https://developers.stellar.org/docs/data/apis/rpc: "Stellar RPC should be your starting point" for new
builders, but RPC "is not a drop-in replacement for Horizon"; "RPC retains only a bounded, recent window
of history (about 7 days by default)."

## 4. Stellar RPC (`rpc.Server`)

`rpc/server.d.ts`:

```ts
export declare class RpcServer {
    readonly serverURL: URL;
    // constructor(serverURL: string, opts?: RpcServer.Options)   -- Options below
    getTransaction(hash: string): Promise<Api.GetTransactionResponse>;
    getTransactions(request: Api.GetTransactionsRequest): Promise<Api.GetTransactionsResponse>;
    getLedgers(request: Api.GetLedgersRequest): Promise<Api.GetLedgersResponse>;
    getEvents(request: Api.GetEventsRequest): Promise<Api.GetEventsResponse>;
    queryEvents(request: Api.QueryEventsRequest): Promise<Api.QueryEventsResponse>;
    getNetwork(): Promise<Api.GetNetworkResponse>;
    getLatestLedger(): Promise<Api.GetLatestLedgerResponse>;
    getHealth(): Promise<Api.GetHealthResponse>;
    getVersionInfo(): Promise<Api.GetVersionInfoResponse>;
    getFeeStats(): Promise<Api.GetFeeStatsResponse>;
    pollTransaction(hash: string, opts?: RpcServer.PollingOptions): Promise<Api.GetTransactionResponse>;
    // raw (undecoded base64) variants: _getTransaction, _getTransactions, _getLedgers, _getEvents, _queryEvents, _getLatestLedger
}
namespace RpcServer { interface Options { allowHttp?: boolean; timeout?: number; headers?: Record<string, string>; } }
```

Request / response types (`rpc/api.d.ts`, namespace `Api`):

```ts
export type GetTransactionsRequest =
  | { startLedger: number; pagination?: { cursor?: never; limit?: number } }
  | { startLedger?: never; pagination: { cursor: string; limit?: number } };

export interface GetTransactionsResponse {
    transactions: TransactionInfo[];
    latestLedger: number; latestLedgerCloseTimestamp: number;
    oldestLedger: number; oldestLedgerCloseTimestamp: number;
    cursor: string;
}
export interface TransactionInfo {
    status: GetTransactionStatus;      // enum: SUCCESS | NOT_FOUND | FAILED
    ledger: number; createdAt: number; applicationOrder: number; feeBump: boolean; txHash: string;
    envelopeXdr: TransactionEnvelope; resultXdr: TransactionResult; resultMetaXdr: TransactionMeta;
    returnValue?: ScVal; diagnosticEventsXdr?: DiagnosticEvent[];
    events: TransactionEvents;         // { transactionEventsXdr: TransactionEvent[]; contractEventsXdr: ContractEvent[][] }
}

export type GetTransactionResponse = GetSuccessfulTransactionResponse | GetFailedTransactionResponse | GetMissingTransactionResponse;
// Success/Failed carry: ledger, createdAt, applicationOrder, feeBump, envelopeXdr, resultXdr, resultMetaXdr, diagnosticEventsXdr?, events (+ returnValue? on success)

export type GetLedgersRequest =   // same startLedger XOR pagination.cursor shape; limit 1-10000, default 100 (per JSDoc)
export interface GetLedgersResponse { ledgers: LedgerResponse[]; latestLedger; latestLedgerCloseTime; oldestLedger; oldestLedgerCloseTime; cursor: string; }
export interface LedgerResponse { hash: string; sequence: number; ledgerCloseTime: string; headerXdr: LedgerHeaderHistoryEntry; metadataXdr: LedgerCloseMeta; }

export type GetEventsRequest =
  | { filters: Api.EventFilter[]; startLedger: number; endLedger?: number; cursor?: never; limit?: number }
  | { filters: Api.EventFilter[]; cursor: string; startLedger?: never; endLedger?: never; limit?: number };
export type EventType = "contract" | "system";
export interface EventFilter { type?: EventType; contractIds?: string[]; topics?: string[][]; }
export interface GetEventsResponse extends RetentionState { events: EventResponse[]; cursor: string; }
export interface EventResponse extends BaseEventResponse { contractId?: Contract; topic: ScVal[]; value: ScVal; }
// BaseEventResponse: id, type, ledger, ledgerClosedAt, transactionIndex, operationIndex, txHash, inSuccessfulContractCall? (@deprecated)

export type QueryEventsRequest = QueryEventsRangeRequest | QueryEventsCursorRequest;  // minLedger/maxLedger/order/filters  XOR  cursor
export interface QueryEventsResponse { events: EventResponse[]; cursor?: string; scanStatus: QueryEventsScanStatus; scannedLedger; oldestLedger; latestLedger; }
export enum QueryEventsScanStatus { HAS_MORE, WAITING_FOR_LEDGERS, OLDEST_REACHED, COMPLETE }

export interface GetNetworkResponse { friendbotUrl?: string; passphrase: string; protocolVersion: string; }
export interface GetLatestLedgerResponse { id: string; sequence: number; protocolVersion: string; closeTime: string; headerXdr: LedgerHeader; metadataXdr: LedgerCloseMeta; }
```

Notes:

- JSDoc on `queryEvents`: "only the archival RPC node serves (in beta)". Loop on `scanStatus`.
- Official getTransactions docs (https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getTransactions):
  `pagination.limit` range 1–200 (hardcoded), default 50; `xdrFormat` `base64` (default) or `json`
  ("do not rely on the JSON schema"); `events` field is noted as RPC v23.x; pagination works only within
  the provider's history retention; `oldestLedger` shows the node's current window.
- The SDK already decodes base64 into XDR objects in the non-underscore methods (the typed fields are
  `TransactionEnvelope`, `TransactionMeta`, etc., not strings).

## 5. XDR parsing (`xdr` namespace, v17 API)

Base class `xdr/values/xdr-value.d.ts`:

```ts
export declare abstract class XdrValue {
    toXdr(): Uint8Array; toXdr(format: "raw"): Uint8Array; toXdr(format: "hex" | "base64"): string;
    toJson(): JsonValue;
    equals(other: XdrValue): boolean;
    static fromXdr<Wire, Instance extends XdrValue>(this: XdrValueConstructor<Wire, Instance>, input: Uint8Array): Instance;
    static fromXdr<Wire, Instance extends XdrValue>(this: XdrValueConstructor<Wire, Instance>, input: string, format: "hex" | "base64"): Instance;
    static validateXdr(...): boolean;
    /** @deprecated Use {@link XdrValue.fromXdr} instead. Deprecated in version v17.0.0 */ static fromXDR(...)
    /** @deprecated Use {@link toXdr} instead. Deprecated in version v17 */ toXDR(): Uint8Array;
}
```

So decoding Horizon fields is `xdr.TransactionMeta.fromXdr(record.result_meta_xdr, "base64")`.

Unions (`xdr/generated/transaction-meta.d.ts`):

```ts
union TransactionMeta switch (int v) { case 0: OperationMeta operations<>; case 1: TransactionMetaV1 v1;
  case 2: TransactionMetaV2 v2; case 3: TransactionMetaV3 v3; case 4: TransactionMetaV4 v4; };
export type TransactionMeta = TransactionMetaOperations | TransactionMetaV1Arm | TransactionMetaV2Arm | TransactionMetaV3Arm | TransactionMetaV4Arm;
// discriminate on `.type`: "operations" | "v1" | "v2" | "v3" | "v4"; arm payload on `.v4` etc. or `.value`
static is(value: unknown): value is TransactionMeta;   // use instead of instanceof
```

**Latest meta version in 17.4.0 typings: `TransactionMetaV4`** (`xdr/generated/transaction-meta-v4.d.ts`):

```ts
export declare class TransactionMetaV4 extends XdrValue {
    readonly ext: ExtensionPoint;
    readonly txChangesBefore: LedgerEntryChange[];
    readonly operations: OperationMetaV2[];
    readonly txChangesAfter: LedgerEntryChange[];
    readonly sorobanMeta: SorobanTransactionMetaV2 | null;
    readonly events: TransactionEvent[];          // TransactionEvent { stage: TransactionEventStage; event: ContractEvent }
    readonly diagnosticEvents: DiagnosticEvent[];
}
```

`TransactionEventStage` values: `transactionEventStageBeforeAllTxs`, `transactionEventStageAfterTx`,
`transactionEventStageAfterAllTxs` (`xdr/generated/transaction-event-stage.d.ts`).

`LedgerCloseMeta` (`xdr/generated/ledger-close-meta.d.ts`): arms `v0 | v1 | v2` (latest **V2**).

`TransactionEnvelope` (`xdr/generated/transaction-envelope.d.ts`): `.type` is
`"envelopeTypeTxV0" | "envelopeTypeTx" | "envelopeTypeTxFeeBump"` with payload fields `.v0`, `.v1`, `.feeBump`.

`TransactionResult` (`xdr/generated/transaction-result.d.ts`): `readonly feeCharged: bigint; readonly result: TransactionResultResult; readonly ext`.
`TransactionResultResult` arms (`transaction-result-result.d.ts`) include `txSuccess`, `txFailed`,
`txFeeBumpInnerSuccess`, `txFeeBumpInnerFailed`, ... `txSorobanInvalid`, `txFrozenKeyAccessed`.

Integers: `export type Int64 = bigint;` with `Int64.MAX_VALUE`/`MIN_VALUE` helpers (`xdr/index.d.ts`);
128/256-bit helpers `Int128`, `Uint128`, `Int256`, `Uint256`. Stellar amounts therefore arrive as `bigint` stroops from XDR.

Higher-level wrappers (`base/`):

```ts
// base/transaction_builder.d.ts
static fromXdr(envelope: TransactionEnvelope | string, networkPassphrase: string): FeeBumpTransaction | Transaction;
/** @deprecated Use {@link TransactionBuilder.fromXdr} instead. */ static fromXDR(...)
static buildFeeBumpTransaction(feeSource: Keypair | string, baseFee: string, innerTx: Transaction, networkPassphrase: string): FeeBumpTransaction;

// base/transaction.d.ts
class Transaction extends TransactionBase<XdrTransaction | TransactionV0> {
  constructor(envelope: TransactionEnvelope | string, networkPassphrase: string);
  get source(): string; get sequence(): string; get operations(): OperationRecord[]; get memo(): Memo; get timeBounds() ...
}
// base/fee_bump_transaction.d.ts
class FeeBumpTransaction extends TransactionBase<XdrFeeBumpTransaction> {
  constructor(envelope: TransactionEnvelope | string, networkPassphrase: string);
  get innerTransaction(): Transaction; get operations(): OperationRecord[]; get feeSource(): string;
}
// base/transaction_base.d.ts
get fee(): string; get networkPassphrase(): string; get signatures(): DecoratedSignature[];
hash(): Uint8Array; toEnvelope(): TransactionEnvelope; toXdr(): string;
```

Fee-bump accounting note: the fee is paid by `feeSource` (Horizon `fee_account`), not the inner source.

## 6. Addresses, assets, values, networks

`base/strkey.d.ts` (`StrKey`, all static): `encodeEd25519PublicKey/decodeEd25519PublicKey/isValidEd25519PublicKey`
(G...), `encodeMed25519PublicKey/decodeMed25519PublicKey/isValidMed25519PublicKey` (M... muxed),
`encodeContract/decodeContract/isValidContract` (C...), `encodeClaimableBalance/...` (B...),
`encodeLiquidityPool/...` (L...), `encodeMuxedContract/...`, `encodeSignedPayload/...`,
`encodePreAuthTx`, `encodeSha256Hash`, `getVersionByteForPrefix(address: string): VersionByteName | undefined`.

Muxed accounts:

```ts
// base/muxed_account.d.ts
class MuxedAccount { constructor(baseAccount: Account, id: string); static fromAddress(mAddress: string, sequenceNum: string): MuxedAccount;
  baseAccount(): Account; accountId(): string; id(): string; toXdrObject(): XdrMuxedAccount;
  /** @deprecated Use toXdrObject */ toXDRObject(); }
// base/util/decode_encode_muxed_account.d.ts
export declare function decodeAddressToMuxedAccount(address: string): MuxedAccount;   // returns xdr MuxedAccount
export declare function encodeMuxedAccountToAddress(muxedAccount: MuxedAccount): string;
export declare function encodeMuxedAccount(address: string, id: string): MuxedAccount;
export declare function extractBaseAddress(address: string): string;                 // M... -> G...
export declare function encodeMuxedContractAddress(contractId: string, id: string): string;
```

`base/address.d.ts`: `class Address { constructor(address: string); static fromString; static fromScVal(scVal: ScVal); static fromScAddress(scAddress: ScAddress); toString(): string; toScAddress(): ScAddress; static account/contract/claimableBalance/liquidityPool/muxedAccount/muxedContract(buffer: Uint8Array) }`.

`base/asset.d.ts`:

```ts
class Asset { readonly code: string; readonly issuer: string | undefined;
  constructor(code: string, issuer?: string); static native(): Asset; static fromOperation(assetXdr: XdrAsset): Asset;
  toXdrObject(): XdrAsset; contractId(networkPassphrase: string): string;   // SAC contract id
  getCode(); getIssuer(); getAssetType(): AssetType; isNative(): boolean; equals(asset: Asset): boolean; toString(): string;
  static compare(assetA: Asset, assetB: Asset): -1 | 0 | 1; }
AssetType: native = "native", credit4 = "credit_alphanum4", credit12 = "credit_alphanum12", liquidityPoolShares = "liquidity_pool_shares"
```

`base/scval.d.ts`: `export declare function scValToNative(scv: ScVal): any;` — u64/i64/u128/i128/u256/i256 → `bigint`,
u32/i32 → `number`, bytes → `Uint8Array`, symbol → `string`, string → `string` or `Uint8Array` if not valid UTF-8;
throws `TypeError` on colliding map keys. Also `nativeToScVal`, `scvSortedMap`; `base/events.d.ts`: `humanizeEvents(events)`.

`base/network.d.ts`:

```ts
export declare enum Networks {
    PUBLIC = "Public Global Stellar Network ; September 2015",
    TESTNET = "Test SDF Network ; September 2015",
    FUTURENET = "Test SDF Future Network ; October 2022",
    SANDBOX = "Local Sandbox Stellar Network ; September 2022",
    STANDALONE = "Standalone Network ; February 2017"
}
```

## 7. Amount representation (official)

https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/assets: "Each asset amount is
encoded as a signed 64-bit integer in the XDR structures"; scaled by 10,000,000 ("seven decimal places of
precision"); smallest unit a stroop = 0.0000001; maximum 922,337,203,685.4775807. This equals PostgreSQL
`bigint` max (see postgresql.md). Soroban token amounts are `i128` (via `scValToNative` → `bigint`) and can
exceed int64 — store as `numeric`.

## 8. Deprecations observed in 17.4.0 typings

- `@stellar/stellar-base` npm package (whole package deprecated).
- All `*XDR*` spellings: `XdrValue.fromXDR`, `toXDR`, `validateXDR`, `TransactionBuilder.fromXDR`,
  `Asset.toXDRObject`, `MuxedAccount.toXDRObject`, `Memo.fromXDRObject`, `Claimant.fromXDR`, `LiquidityPoolId.toXDRObject`, `TransactionBase.toXDR` — "Deprecated in version v17.0.0".
- `RpcServer.GetEventsRequest` type alias → use `Api.GetEventsRequest`.
- `rpc.Server.requestAirdrop` → `fundAddress`; `getSACBalance` and `getTrustline` → `getAssetBalance`.
- `BaseEventResponse.inSuccessfulContractCall` — "Newer RPC servers no longer return this field; it will be removed in the next major release."

## Sources

- npm registry: `npm view @stellar/stellar-sdk` / `@stellar/stellar-base` (version, license, engines, exports, dist-tags, time, deprecated) — https://www.npmjs.com/package/@stellar/stellar-sdk, https://www.npmjs.com/package/@stellar/stellar-base — retrieved 2026-11-16
- Installed package `@stellar/stellar-sdk@17.4.0`: `README.md`, `package.json`, `lib/esm/**/*.d.ts` — retrieved 2026-11-16
- https://github.com/stellar/js-stellar-sdk/releases/tag/v17.0.0 — retrieved 2026-11-16
- https://developers.stellar.org/docs/data/apis/rpc — retrieved 2026-11-16
- https://developers.stellar.org/docs/data/apis/horizon — retrieved 2026-11-16
- https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getTransactions — retrieved 2026-11-16
- https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/assets — retrieved 2026-11-16

## Open questions

1. Which network protocol version is live on Mainnet today (P28?) and does it emit `TransactionMetaV4` for all transactions (classic included) or only some? Check `current_protocol_version` on Horizon root / `getNetwork()` before fixing a parser strategy.
2. Do unified CAP-67-style `TransactionEvent`s (transfer/fee events) cover all classic balance changes, so ledger entries could be derived from events instead of `LedgerEntryChange` diffs? Not verified from official docs in this pass.
3. RPC history retention is "about 7 days by default"; for historical backfill we need Horizon (public SDF: 1 year), a third-party provider, the archival `queryEvents` node (beta), or a data-lake/ledger-meta source. Which backfill source is in scope?
4. `getEvents` JSDoc refers to a `pagingToken` field on events and shows `type: "diagnostic"` in an example, but the `EventType` type is `"contract" | "system"` and `BaseEventResponse` has no `pagingToken` — docs/typing inconsistency; rely on `cursor`/`id`.
5. The v17.0.0 notes say renames have "no back-compat aliases", yet 17.4.0 ships deprecated `fromXDR`/`toXDR` aliases. Treat aliases as unstable; use `fromXdr`/`toXdr` only.
6. Should StellarBooks support SDK v16 (LTS to March 2027) as a peer range, or v17 only? v17's XDR API is incompatible with v16, so dual support would need an adapter.
