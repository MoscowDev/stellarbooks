# Research: Stellar data sources for StellarBooks

Status: evidence for an ADR. This file contains no decision. Every factual section cites official sources, all retrieved 2026-11-16.
Scope: read-only ingestion of historical and ongoing activity for chosen accounts and contracts, to be turned into double-entry records.

---

## 1. Horizon: official status

- The APIs overview says: "Horizon is nearing end-of-life and will eventually be deprecated in favor of Stellar RPC and Portfolio APIs." It "will continue to receive updates to maintain compatibility with upcoming protocol releases" but "it won't receive new feature development." [S1]
- No official shutdown date or deprecation date has been published. None of the pages reviewed gave one [S1, S2, S9, S13]. The Protocol 30 (Bell) upgrade guide still ships **Horizon v30.0.0** alongside RPC v30.0.0 [S14].
- The official wording was inconsistent until recently. stellar/stellar-docs issue #3007, opened 2026-11-02, reported that the Lab API Explorer card said "Horizon is considered deprecated" while other pages said "nearing end-of-life". PR #3020 aligned the card to "nearing end-of-life" and the issue was closed 2026-11-03 [S10]. **The canonical wording is "nearing end-of-life", not "deprecated".**
- History on the SDF-hosted Horizon: "On August 1, 2024, the publicly accessible SDF-hosted Horizon had its historical data truncated to one year." [S2, S3] The data products comparison lists Horizon history as "1 year on SDF-hosted instances" [S9].
- The "Stellar RPC has arrived" blog post (undated on the page; it refers to the Protocol 22 era) says Horizon "won't see additional features added in support of smart contracts" and "won't be significantly overhauled to support performance needs for large historical data sets." It also says "Horizon's database is growing at a rate of 1 TB per month." [S11]
- Horizon carries no smart contract data. The comparison table lists it as curated and parsed data "(no smart contract data)" [S9].
- A self-hosted Horizon can serve full history, but the docs say "it is not the recommended tool for that. Use Hubble or Galexie instead." [S1]

### Horizon pagination and rate limits
- Pagination uses `_links.next` and `_links.prev`. Each record has a `paging_token`, and links carry `cursor`, `limit` and `order` [S4]. **The page does not state the default or maximum `limit`** (see Open questions).
- Rate limit: "Horizon rate limits on a per-IP-address basis," with a default of 3600 requests per hour, set by `PER_HOUR_RATE_LIMIT`. Exceeding it returns `429 Too Many Requests`, and "each update of the stream counts as a request" [S5]. These are the defaults for self-run instances. **No published limit exists for the SDF public instance.**

### Horizon endpoints
- Testnet: `https://horizon-testnet.stellar.org`. Futurenet: `https://horizon-futurenet.stellar.org`. Mainnet: "Multiple providers available" [S6]. The data products table says SDF hosts Horizon on mainnet, testnet and futurenet [S9], but the networks page does not list an SDF mainnet URL (see Open questions).
- Horizon providers [S3]:
  - Blockdaemon is the only provider documented as offering full history ("Blockdaemon provides full historical data for Horizon").
  - Validation Cloud, QuickNode, Ankr, Obsrvr and Nodies also provide Horizon on mainnet.
  - LOBSTR runs a public mainnet Horizon at `https://horizon.stellar.lobstr.co`.

---

## 2. Stellar RPC

- "RPC is the recommended API for accessing and interacting with Stellar network data in real-time." [S1] "For any new builders coming to Stellar, Stellar RPC should be your starting point." [S7]
- RPC is not a historical indexer: "Use RPC as your gateway to the blockchain, but ingest and index only the data you care about." It is not "a drop-in replacement for Horizon." [S7, S11]

### Retention
- A single `HISTORY_RETENTION_WINDOW` setting covers "transactions and events." "The default is `120960` ledgers, which is about 7 days." "RPC treats this value as a target, not an exact count." "A larger `HISTORY_RETENTION_WINDOW` on its own does not add older ledgers." [S8]
- The configuration page states **no maximum**, and there is no separate retention setting for events [S8].
- The `getEvents` page describes the same "stock default of 120960 ledgers" [S12]. The events concept page says "RPC providers typically only keep short chunks (less than a week) of history around" [S19].
- `getHealth` reports `ledgerRetentionWindow`, `oldestLedger` and `latestLedger` [S12]. Use it to discover a provider's actual window at runtime.

### Full-history `getLedgers` through a data lake
- "RPC version 23.0 introduces data lake integration for the `getLedgers` endpoint." "All other RPC endpoints will still operate based on the `HISTORY_RETENTION_WINDOW`." [S15]
- To enable it, set `SERVE_LEDGERS_FROM_DATASTORE = true` and configure `[datastore_config]` with type GCS or S3 [S15].
- The public lake is in AWS Open Data at `s3://aws-public-blockchain/v1.1/stellar/ledgers/pubnet` [S15].
- The "RPC now with infinite scroll" blog says getLedgers "will be the first and only endpoint to support this new functionality." The lake holds "the metadata of each Stellar ledger from genesis to the present." It describes the AWS lake as provided by a third party through the AWS Open Data program [S16].
- The providers page footnote marks providers with an "RPC Archive" (full-history getLedgers) [S17]. Which providers are marked was not extracted.

### Method limits and pagination

| Method | Cursor | `limit` default | `limit` max | Range parameters | Key payload |
|---|---|---|---|---|---|
| `getTransactions` | opaque `cursor`; omit `startLedger` when using it | 50 | 200 | `startLedger` (inclusive) | `envelopeXdr`, `resultXdr`, `resultMetaXdr`, optional `diagnosticEventsXdr`, `events.transactionEventsXdr`, `events.contractEventsXdr` (per operation), `status`, `applicationOrder`, `feeBump`, `ledger`, `createdAt`, `txHash` |
| `getLedgers` | opaque `cursor` | 50 | 200 | `startLedger` | `hash`, `sequence`, `ledgerCloseTime`, `headerXdr` (LedgerHeaderHistoryEntry), `metadataXdr` (LedgerCloseMeta) |
| `getEvents` | opaque `cursor` | 100 | 10000 | `startLedger` (inclusive), `endLedger` (exclusive) | see soroban-events.md |

Sources: [S12, S18, S20].

- The `xdrFormat` parameter accepts `base64` (default) or `json`. The JSON form has no stable schema: "you should not rely on any schema for the JSON." [S18, S12]
- `getTransactions` requests error when `startLedger` falls outside the node's stored range [S18].
- `getEvents` ids combine a TOID with an event index. The docs say to deduplicate on `id` [S12].
- The `getTransactions` page says the `events` field is "Available only on RPC v23.x (currently testnet only)." Mainnet has run RPC v23 and later since 2025 [S13], so this note looks stale (see Open questions).

### RPC endpoints and providers
- SDF runs RPC on testnet (`https://soroban-testnet.stellar.org`) and futurenet (`https://rpc-futurenet.stellar.org`) only. Mainnet RPC is "Third-party providers only" [S6, S17].
- Testnet resets happen "roughly two to four times a year". The next scheduled reset is **2026-12-16** [S6]. Testnet history therefore cannot be relied on.
- **No rate limits or usage policy are published** for SDF RPC endpoints [S6, S17].
- RPC providers on the official list:
  - Blockdaemon, Validation Cloud, QuickNode, NowNodes, Gateway, Ankr, Infstones, Obsrvr, Nodies, OnFinality, Lightsail Network (Quasar), Uniblock, Exaion, Alchemy, GetBlock, node101, Chainstack.
  - Public endpoints are also listed for Liquify and sorobanrpc.com [S17].

---

## 3. Full-history pipelines: Galexie, data lake, CDP, Ingest SDK, Hubble

- **Galexie** is "a tool for extracting, processing, exporting Stellar ledger metadata to external storage." It exports compressed XDR to cloud storage and is "the foundation of the Composable Data Pipeline (CDP)" [S21, S22]. It supports AWS S3 and GCS [S15, S16].
- **SEP-54 (Ledger Metadata Storage)**, status **Active**, v0.2.0, updated 2026-01-07, defines the data lake format [S23]:
  - Each object is a zstd-compressed `LedgerCloseMetaBatch` named `<batch>.xdr.zst`.
  - Batch and partition names use the inverted start ledger, so newest sorts first.
  - A `/.config.json` manifest records `networkPassphrase`, `version`, `compression`, `ledgersPerBatch` and `batchesPerPartition`.
  - The oldest batch starts at ledger 2.
- **The data products page says "SDF doesn't host a data lake; third-party providers offer public ones"** [S9]. The AWS Open Data lake is the one public lake named in the docs [S15, S16].
- **Ingest SDK**: "A set of Golang packages which can be used within an application" for reading ledger metadata [S22]. There is **no official TypeScript or JS equivalent** in the sources reviewed.
- **Hubble**: "a complete historical record of the Stellar network" on BigQuery. It is "updated in intraday batches" and "should not be used for real-time data retrieval." Users pay BigQuery query costs [S24].
- **Portfolio APIs**, Horizon-like indexed data from third parties, are offered by Alchemy (live), Allium (building), OBSRVR Gateway and Horizon [S22]. They are third-party, with no determinism guarantees documented.
- SDF's `stellar-dev-skill` repo lists the lake as "~3.8TB, growing ~0.5TB/year." For guaranteed full history it recommends Hubble, then Galexie, then your own indexer [S25]. This is an official SDF repo, but it is not normative documentation.

---

## 4. Getting transaction meta for balance-change derivation

- `getTransactions` returns `resultMetaXdr`, the TransactionMeta, which you parse yourself [S18, S26]. `getLedgers` returns the full `LedgerCloseMeta` per ledger [S20]. With a data lake behind it, this works back to genesis [S15, S16].
- From Protocol 23, CAP-67 events cover transfer, mint, burn, clawback, fee and set_authorized movements for classic and SAC activity. The migration guide notes:
  - "Anything CAP-67 does not model, such as signer updates, data entry changes, sequence number bumps... has to come from the meta XDR of the transaction" [S26].
  - Trades must be inferred: "there is no direct 'trade event' in RPC" [S26].
- **Classic events are off by default.** They require Core `EMIT_CLASSIC_EVENTS=true`. Pre-Protocol-23 ledgers also need `BACKFILL_STELLAR_ASSET_EVENTS=true` [S26, S19]. CAP-67 says classic events "are not hashed into the ledger" and are config-flagged [S27]. Whether events appear in a given RPC or data lake source therefore depends on how that operator configured it (see soroban-events.md).
- Current balances come from `getLedgerEntries` (account and trustline keys). "RPC will not provide trustline information associated with the account directly." [S26]
- Ledger entry changes (`LedgerEntryChanges` in `TransactionMetaV4` and `OperationMetaV2`) are the consensus-derived ground truth for balance deltas [S27]. Unlike classic events, they do not depend on an emission flag. This is an inference from the meta structure; the docs do not state a ranking.

### Upcoming XDR break
- Protocol 30 (Bell) has a mainnet vote on **2026-11-23**. It changes `LedgerHeader`, `StellarValue` and `LedgerCloseMeta` (CAP-88, millisecond close times) and adds the `SC_ADDRESS_TYPE_MUXED_CONTRACT` / `W` strkey (CAP-84).
- "Consumers that decode ... LedgerCloseMeta ... must update" or decoding fails. The recommended JS SDK is v17.3.0 [S14]. StellarBooks' XDR layer must be on the P30 definitions from day one.

---

## 5. Comparison table

| Criterion | Horizon (SDF) | Horizon (self-hosted or full-history provider) | Stellar RPC (default) | RPC + data lake (`getLedgers`) | Galexie / SEP-54 data lake read directly | Hubble (BigQuery) |
|---|---|---|---|---|---|---|
| Official status | "nearing end-of-life" [S1] | same | recommended [S1] | recommended (RPC ≥ 23.0) [S15] | foundation of CDP [S22] | official analytics product [S24] |
| History | 1 year [S2] | full, if run with full history [S1, S3] | about 7 days (120960 ledgers) [S8] | genesis to present for getLedgers only [S16] | genesis to present (SEP-54) [S23] | full [S24] |
| Mainnet SDF endpoint | listed as SDF-hosted [S9] (URL not on networks page) | n/a | none, third parties only [S6] | provider-dependent | none hosted by SDF; AWS Open Data lake [S9, S15] | public BigQuery dataset [S24] |
| Smart contract data | no [S9] | no | yes | yes (raw meta) | yes (raw meta) | yes [S9] |
| Granularity | parsed operations, payments, effects | same | tx, events, ledgers | raw LedgerCloseMeta | raw LedgerCloseMeta | SQL tables |
| Determinism and reproducibility | derived views; provider-specific | derived views | raw XDR (deterministic); events depend on config flags | raw XDR | raw XDR, immutable files | ETL-derived, batch latency |
| Real-time | yes (streaming) | yes | yes | yes (local ingest) | Galexie can stream new ledgers [S21] | no [S24] |
| Pagination | `cursor`/`limit`/`order`, limits undocumented [S4] | same | cursor; 200 tx/ledgers, 10000 events [S12, S18, S20] | cursor, 200 ledgers per page | object listing per SEP-54 | SQL |
| Rate limits | 3600/h per IP default (self-host) [S5]; SDF public not published | operator-defined | not published | provider-defined | cloud egress or requester-pays (not documented) | BigQuery pricing [S24] |
| Address filtering | yes, server-side | yes | getEvents filters (5 filters × 5 contracts); getTransactions has none | none, must scan every ledger | none, must scan | SQL |
| TS/JS tooling | js-stellar-sdk | same | js-stellar-sdk | js-stellar-sdk (`getLedgers`) | Go ingest SDK only (official) [S22] | BigQuery client |

---

## 6. Evidence for a recommendation (for the ADR author)

Requirements: full history, determinism, read-only, TypeScript.

1. **Canonical source: `LedgerCloseMeta` / `TransactionMeta` XDR, not Horizon.**
   - Horizon is on an end-of-life path with no date [S1, S10]. The SDF instance holds 1 year of history [S2]. It has no smart contract data [S9].
   - Raw meta is consensus output and can be re-processed. Re-running the same ledger range always gives the same input, which supports deterministic re-derivation of journals.
2. **Historical backfill: RPC `getLedgers` against a data-lake-backed RPC (RPC ≥ 23.0), or direct reads of a SEP-54 lake** (the AWS Open Data pubnet lake or a self-run Galexie lake) [S15, S16, S23].
   - Trade-off: no per-account index, so backfill must scan every ledger in the range. The lake is about 3.8 TB [S25].
   - Trade-off: reading SEP-54 directly from TS means implementing zstd + XDR batch decoding without an official TS library.
   - Trade-off: the public AWS lake is third-party-provided, not SDF [S9, S16].
3. **Ongoing ingestion: RPC `getLedgers` (cursor), or `getTransactions` plus `getEvents` within the about-7-day window.** The consumer must checkpoint well inside the retention window, and must persist everything it needs, because events and transactions expire [S8, S19].
4. **CAP-67 events are a useful decoder, not the source of truth.**
   - Classic events are off unless the operator sets `EMIT_CLASSIC_EVENTS`, and need `BACKFILL_STELLAR_ASSET_EVENTS` for pre-P23 ledgers. They are not hashed into the ledger [S26, S27].
   - Option (a): derive balance deltas from ledger-entry changes in meta and cross-check them against events.
   - Option (b): require a source with classic events enabled and document that dependency.
5. **Pluggable source adapters:** RPC `getLedgers`, a SEP-54 lake reader, and optionally Horizon as a legacy or convenience adapter. Provider retention differs, so call `getHealth` before any range request [S12].
6. **Hubble** is a good independent reconciliation oracle for audits. It is unsuitable as a primary feed because of batch latency and BigQuery cost [S24].

---

## Sources (all retrieved 2026-11-16)

- [S1] APIs overview: https://developers.stellar.org/docs/data/apis
- [S2] Horizon: https://developers.stellar.org/docs/data/apis/horizon
- [S3] Horizon providers: https://developers.stellar.org/docs/data/apis/horizon/providers
- [S4] Horizon pagination: https://developers.stellar.org/docs/data/apis/horizon/api-reference/structure/pagination
- [S5] Horizon rate limiting: https://developers.stellar.org/docs/data/apis/horizon/api-reference/structure/rate-limiting
- [S6] Networks: https://developers.stellar.org/docs/networks
- [S7] RPC: https://developers.stellar.org/docs/data/apis/rpc
- [S8] RPC configuring: https://developers.stellar.org/docs/data/apis/rpc/admin-guide/configuring
- [S9] Data products overview / compare: https://developers.stellar.org/docs/data
- [S10] stellar-docs issue #3007: https://github.com/stellar/stellar-docs/issues/3007
- [S11] Blog, "Stellar RPC has arrived": https://stellar.org/blog/foundation-news/stellar-rpc-has-arrived
- [S12] getEvents: https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getEvents
- [S13] Software versions: https://developers.stellar.org/docs/networks/software-versions
- [S14] Blog, Bell (Protocol 30) upgrade guide: https://stellar.org/blog/developers/bell-protocol-30-upgrade-guide
- [S15] RPC data lake integration: https://developers.stellar.org/docs/data/apis/rpc/admin-guide/data-lake-integration
- [S16] Blog, "RPC now with infinite scroll": https://stellar.org/blog/developers/rpc-now-with-infinite-scroll
- [S17] RPC providers: https://developers.stellar.org/docs/data/apis/rpc/providers
- [S18] getTransactions: https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getTransactions
- [S19] Events concept: https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/events
- [S20] getLedgers: https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getLedgers
- [S21] Galexie: https://developers.stellar.org/docs/data/indexers/build-your-own/galexie
- [S22] Indexers overview: https://developers.stellar.org/docs/data/indexers
- [S23] SEP-54: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0054.md
- [S24] Hubble: https://developers.stellar.org/docs/data/analytics/hubble
- [S25] stellar-dev-skill data skill: https://github.com/stellar/stellar-dev-skill/blob/main/skills/data/SKILL.md
- [S26] Migrate from Horizon to RPC: https://developers.stellar.org/docs/data/apis/migrate-from-horizon-to-rpc
- [S27] CAP-67: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0067.md
- Also consulted: blog "CDP and RPC": https://stellar.org/blog/developers/cdp-and-rpc-more-like-ez-and-pz

## Open questions

1. **Horizon shutdown date:** none published. The wording is "nearing end-of-life" [S1, S10]. Does SDF intend to retire the SDF-hosted mainnet Horizon, and when?
2. **SDF mainnet Horizon URL and limits:** the data products table says SDF hosts mainnet Horizon [S9], but the networks page lists only "Multiple providers available" for mainnet [S6]. The public URL and rate limits are unconfirmed.
3. **Horizon `limit` default and max:** not stated on the pagination page [S4].
4. **RPC rate limits:** no official rate limits or usage policy for SDF testnet and futurenet RPC.
5. **Retention maximum:** no documented maximum for `HISTORY_RETENTION_WINDOW`, and no per-provider retention figures.
6. **AWS public lake details:** HTTPS form, requester-pays or egress terms, SLA, completeness (start ledger), and who operates it ("third party" per [S16]) are not documented. Whether its objects include classic CAP-67 events depends on the Galexie/Core config, which is undocumented.
7. **Stale docs note:** the `getTransactions` `events` field says "RPC v23.x (currently testnet only)" [S18], but mainnet runs RPC ≥ 23 [S13]. This needs confirmation.
8. **Classic events on hosted providers:** which providers (and the SDF testnet RPC) run with `EMIT_CLASSIC_EVENTS=true` and `BACKFILL_STELLAR_ASSET_EVENTS=true`? This is not documented.
9. **TypeScript tooling:** is there an official TS/JS reader for SEP-54 lakes, or a JS ingest SDK? None was found; the official Ingest SDK is Go.
10. **Which RPC providers offer "RPC Archive"** (full-history getLedgers)? This was not extracted from the providers table.

## Continuation check (2026-11-18)

- The official RPC reference describes `ledgerCloseTime` as a Unix timestamp string and `metadataXdr` as the Base64 `LedgerCloseMeta` union. The response has no normalized `transactions` array. [getLedgers](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getLedgers)
- The installed SDK declaration `lib/esm/rpc/api.d.ts` types the SDK's parsed `metadataXdr` as `LedgerCloseMeta`. The raw RPC response and the parsed SDK response therefore need distinct handling.
- `getLedgerEntries` reads live state and reports the snapshot ledger as `latestLedger`. It accepts ledger keys and an encoding option. Historical reconciliation requires independently captured state at the target ledger or an archive that provides it. [getLedgerEntries](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getLedgerEntries)
- Testnet reported protocol 30, and SDK 17.4.0 decoded ledger 5796891 as LedgerCloseMeta v2. The raw RPC response is stored in fixtures/data/testnet-ledger.json.
- The [official ledger XDR definitions](https://raw.githubusercontent.com/stellar/stellar-xdr/master/Stellar-ledger.x), rechecked 2026-11-18, show that all three close-meta variants carry the ledger header and transaction results in apply order. The transaction set is a separate structure. The SDK declarations expose these common fields through the union's `value` property.
- Transaction matching research, 2026-11-18. The [official ledger XDR](https://raw.githubusercontent.com/stellar/stellar-xdr/master/Stellar-ledger.x) defines legacy sets, sequential generalized components, and parallel stages containing clusters of envelopes. Flatten the set for lookup and use the result list for apply order. The installed SDK's `TransactionBuilder.fromXdr` and `TransactionBase.hash()` compute the envelope hash using the supplied network passphrase.
Offline reconciliation design, 2026-11-18. The [RPC getLedgerEntries reference](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getLedgerEntries) identifies the response snapshot by `latestLedger`. The comparison accepts a caller-supplied snapshot with an explicit ledger, network and close timestamp. Missing positions remain distinguishable from explicit zeroes.
Pagination follow-up, 2026-11-18. The [RPC getLedgers reference](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getLedgers) describes `latestLedger` as the tip at request time and the page limit as a maximum. Pin unbounded reads to the first response's tip and treat an empty page before the requested end as a missing range.
Offline payment example research, 2026-11-19. The [official ledger XDR](https://raw.githubusercontent.com/stellar/stellar-xdr/master/Stellar-ledger.x) separates pre-application fee changes from operation metadata. The installed SDK types expose V4 operation changes as state and updated ledger entries and account balances as bigint. Captured testnet ledger 5796891, apply index 6, has a successful single native payment with a 100-stroop charged fee and no post-application fee changes. This example checks the separate balance effects against the payment amount and result fee.
