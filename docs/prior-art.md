# Prior art: Stellar projects related to StellarBooks

Retrieved: 2026-11-16. Sources are each project's GitHub README, LICENSE file and repository
metadata (GitHub REST API, unauthenticated), plus a short web search. No code was copied or reviewed;
statements about what a project does come from its own README and are **self-reported**, not verified.

"Last push" is the repository `pushed_at` timestamp at retrieval time. It shows recent activity, not
release status.

## Summary table

| Project | Repo | Licence (LICENSE file) | Language | Created / last push | What it is | Overlap with StellarBooks |
|---|---|---|---|---|---|---|
| Tallybook | [Tallybook-Org/tallybook](https://github.com/Tallybook-Org/tallybook) | Apache-2.0 | Go | 2026-09-08 / 2026-11-16 | Settlement bookkeeping for per-request (x402/MPP) paid APIs: metering, settlement daemon, Soroban event indexer, Postgres | Medium: Postgres-backed Soroban ingestion and usage-vs-settled reconciliation. Not general double-entry |
| Esure | [Esureorg/Esure](https://github.com/Esureorg/Esure) | MIT | TypeScript | 2026-09-07 / 2026-10-23 | Testnet-only scenario runner and dashboard for payment flows | Low: could produce test fixtures |
| Nirium | [nirium-protocol/nirium](https://github.com/nirium-protocol/nirium) (also [nirium-core](https://github.com/nirium-protocol/nirium-core)) | Apache-2.0 | TypeScript | 2026-06-15 / 2026-11-16 | Verifiable receipts (Audit Trail), x402/MPP payments, treasury execution, with a hosted "Reporting" node | Low to medium: audit and CSV/JSON reporting over its own receipts, not a general ledger |
| Stellar Alerts | [stellar-alerts-labs/stellar-alerts](https://github.com/stellar-alerts-labs/stellar-alerts) | MIT | TypeScript | 2026-07-02 / 2026-11-16 | Wallet payment monitoring, Soroban event ingestion, multi-channel alerts, Postgres | Medium on ingestion (Horizon SSE, cursor recovery). None on accounting |
| SoroScan (a) | [SoroScan/soroscan](https://github.com/SoroScan/soroscan) | README says MIT, but **no LICENSE file found** at repo root; GitHub reports no licence | Python (Django) + Rust | 2026-01-19 / 2026-11-09 | Soroban event indexer with GraphQL/REST/webhooks | Medium on Soroban event ingestion |
| SoroScan (b) | [soroscan-io/soroscan](https://github.com/soroscan-io/soroscan) | MIT | TypeScript | 2026-08-23 / 2026-09-03 | Stellar block explorer (soroscan.io) | Low: possible deep-link target |
| Orbital | [orbital-stellar/orbital_stellar](https://github.com/orbital-stellar/orbital_stellar) | MIT | TypeScript | 2026-03-15 / 2026-10-26 | Typed event layer: event engine (Horizon, Soroban, CAP-67), ABI/event-schema registry, webhooks, React hooks | High on ingestion and normalisation. Candidate dependency |
| Stellar Address Kit | [Boxkit-Labs/stellar-address-kit](https://github.com/Boxkit-Labs/stellar-address-kit) | MIT | Dart (GitHub's label; also ships TypeScript and Go) | 2026-02-17 / 2026-10-23 | G/M/C address parsing and deposit-routing (memo vs muxed) | Medium: counterparty and sub-account attribution. Candidate dependency |

Other Stellar accounting, bookkeeping and tax-export tools found (see below for details):

| Project | Repo | Licence | Language | Created / last push | What it is |
|---|---|---|---|---|---|
| Bookee | [alexanderkoh/bookee](https://github.com/alexanderkoh/bookee) | Apache-2.0 (GitHub metadata and README badge) | TypeScript (Tauri desktop) | 2026-08-31 / 2026-11-03 | Local-first, read-only Stellar bookkeeping app with CSV and QuickBooks CSV export |
| Welyvra | [welyvra/welyvra-platform](https://github.com/welyvra/welyvra-platform) | Apache-2.0 | TypeScript | 2026-11-06 / 2026-11-13 | Reconciliation layer for businesses: attribution, double-entry ledger, reconciliation, exceptions |
| Stellar Ledger Tax | [Ledger-Tax/ledgertax-core](https://github.com/Ledger-Tax/ledgertax-core) (+ `ledgertax-api`, `ledgertax-web`) | MIT | TypeScript | 2026-11-07 / 2026-11-08 | Classifies Stellar history into typed events, plus FIFO cost basis and CSV reports |
| Toolnook "contracts" (ledgerlite) | [toolnook/contracts](https://github.com/toolnook/contracts) | MIT (GitHub metadata) | Python | 2026-11-05 / 2026-11-06 | Small local double-entry CLI ledger with Horizon payment sync |
| Commercial tax tools | Koinly, CoinTracker | Proprietary | n/a | n/a | Crypto tax software with Stellar address sync and/or CSV import |

---

## Per-project notes

### Tallybook

- **URL:** https://github.com/Tallybook-Org/tallybook (owner: `Tallybook-Org`). A companion repo,
  `Tallybook-Org/tallybook-contracts` (Rust, Apache-2.0), holds its Soroban contracts.
- **Disambiguation:** "tallybook" matches many unrelated repos, for example Chinese expense-tracker
  apps and `magna-nz/tallybook` (prices AI coding sessions). Only `Tallybook-Org/tallybook` is
  Stellar-related (topics: `stellar`, `soroban`, `x402`).
- **Licence:** Apache License 2.0 (LICENSE file). **Language:** Go. **Last push:** 2026-11-16.
- **What it does:** "Tallybook is settlement bookkeeping for services that charge per HTTP request —
  APIs paid by AI agents and other machines over Stellar, using the x402 protocol, MPP charge mode, or
  MPP payment channels." It runs three services on one Postgres: a collector (metering), a settler
  (sweeps payment-channel revenue before the payer can reclaim it), and an indexer that "ingests Soroban
  events into Postgres so metered usage can be reconciled against what actually settled". It holds an
  operator signing key, so it is not read-only.
- **Overlap:** Soroban event ingestion into Postgres, and reconciliation of off-chain records against
  on-chain settlement.
- **Differences / interop:** Tallybook is an operator-side metering and settlement system that holds a
  signing key, scoped to per-request API billing. StellarBooks is a read-only, general double-entry
  library with GL, trial balance, statements and period close. An operator could run Tallybook for
  billing and StellarBooks to book the resulting on-chain settlements, for example channel
  settlements as revenue. There is no shared language (Go vs TypeScript).
- **Naming:** "Tallybook" and "StellarBooks" both use the "books" theme. Probably no conflict, but
  worth noting when choosing the final name.

### Esure

- **URL:** https://github.com/Esureorg/Esure (owner: `Esureorg`). Other "esure" repos relate to the
  UK insurer or are unrelated.
- **Licence:** MIT (LICENSE: "Copyright (c) 2026 Esureorg"). **Language:** TypeScript (Fastify,
  Next.js). **Last push:** 2026-10-23.
- **What it does:** "an open-source testing and simulation toolkit that helps developers validate
  Stellar payment flows before integrating them into production applications". It runs 13 bundled
  Testnet scenarios (XLM and issued-asset payments, trustlines, expected failures) and reports
  balance changes. It is Testnet-only by design.
- **Overlap:** It works with payment flows and balance changes, but it does no accounting.
- **Differences / interop:** Esure generates and checks transactions on Testnet. StellarBooks only
  reads history and books it. Esure scenarios (such as `issued-asset-payment` and
  `multi-operation-transaction`) could be a convenient way to create real Testnet histories for
  StellarBooks integration fixtures.

### Nirium

- **URL:** https://github.com/nirium-protocol/nirium (owner: `nirium-protocol`). Related repos:
  `nirium-core` (Apache-2.0, TypeScript), `nirium-pollar-adapter`. Other "nirium" repos, such as a
  Linux installer, are unrelated.
- **Licence:** Apache License 2.0 (LICENSE file). The `nirium-core` README says the hosted agent API
  (`packages/agent`) is private and not part of the public repo. **Language:** TypeScript (also a
  Python SDK). **Last push:** 2026-11-16.
- **What it does:** "Open-source verifiable receipts (Audit Trail), agentic payments (x402/MPP) and
  treasury execution for Stellar/Soroban." Audit records are SHA-256 hashes pinned to IPFS. The
  `nirium-core` README lists a "Reporting" node: "Institutional-format summaries and CSV/JSON exports
  over anchored receipts. Read-only; regulatory filings remain the client's responsibility."
- **Overlap:** Both aim at auditability and both produce read-only exports.
- **Differences / interop:** Nirium is a payments, receipts and treasury platform with a hosted API,
  and its reporting covers its own receipts. StellarBooks books arbitrary on-chain account activity
  into a double-entry ledger and does not move funds. A possible link: StellarBooks journal entries
  could carry a reference to a Nirium Audit Trail CID as supporting documentation. The README also
  mentions **AgentLedger** (agentpayments.fi), an x402-related product that was not investigated.

### Stellar Alerts

- **URL:** https://github.com/stellar-alerts-labs/stellar-alerts (owner: `stellar-alerts-labs`).
- **Licence:** MIT (LICENSE: "Copyright (c) 2026 stellar-alerts-labs"). **Language:** TypeScript
  (Fastify, Next.js, BullMQ, Postgres). **Last push:** 2026-11-16.
- **What it does:** "monitors registered Stellar public wallets in real time for incoming transactions
  ... records payment history in PostgreSQL and dispatches multi-channel alerts (Telegram, WhatsApp,
  Email, Webhooks) without ever requesting or storing secret keys." It covers Horizon SSE ingestion
  of `payment` and `create_account`, Soroban `getEvents`, and ingestion-gap detection with bounded
  backfill.
- **Overlap:** Non-custodial ingestion into Postgres, plus cursor and gap-recovery concerns.
- **Differences / interop:** It is a notification product and its payment history is not an accounting
  ledger. Its ingestion covers payments and account creation, not the full set of classic operations.
  It is an application, not a library. StellarBooks could emit events that a tool like this consumes,
  or the two could run side by side. There is no direct dependency fit.

### SoroScan (ambiguous: two Stellar-related projects)

I could not tell which one was meant, so both are listed.

**(a) SoroScan/soroscan**, the Soroban event indexer

- **URL:** https://github.com/SoroScan/soroscan (owner: `SoroScan`).
- **Licence:** The README states "This project is licensed under the MIT License" (its link points to that repo's own `LICENSE`) and shows an
  MIT badge. However, the GitHub API reports no detected licence, and no LICENSE file was present in
  the repo root listing on 2026-11-16. **Treat the licence as unconfirmed.**
- **Language:** Python (Django, Strawberry GraphQL, Celery) plus Rust Soroban contracts. **Last
  push:** 2026-11-09.
- **What it does:** "The Graph for Soroban — index, query, and subscribe to smart contract events."
- **Overlap / interop:** Soroban event ingestion. StellarBooks could, in principle, read Soroban token
  events from a SoroScan instance as an alternative source with longer retention than RPC's. That
  would require a source adapter, and SoroScan's own contract-based "standardized event emission"
  model may not cover arbitrary SEP-41 token contracts. This needs checking.

**(b) soroscan-io/soroscan**, the block explorer

- **URL:** https://github.com/soroscan-io/soroscan. **Licence:** MIT ("Copyright (c) 2026 Fajrin
  Firmana and Soroscan contributors"). **Language:** TypeScript (React, Vite). **Last push:**
  2026-09-03.
- **What it does:** "A Stellar block explorer for Mainnet, Testnet, and Futurenet, live at soroscan.io."
- **Overlap / interop:** Minimal. Reports could deep-link transaction hashes to an explorer (this one,
  or others such as stellar.expert) for auditors.

### Orbital (orbital_stellar)

- **URL:** https://github.com/orbital-stellar/orbital_stellar (owner: `orbital-stellar`). It has a
  mirror, `orbital_stellar-archived-pretransfer`, and an older `grantfoxprojects/orbital-stellar`.
  Unrelated "orbital stellar" astronomy repos exist.
- **Licence:** MIT (LICENSE: "Copyright (c) 2026 Orbital Contributors"). **Language:** TypeScript
  (strict). It is published to npm as `@orbital-stellar/*`, v0.2.0 (2026-09-23). **Last push:**
  2026-10-26.
- **What it does:** "Orbital ships the typed event layer once, openly". It includes an open
  ABI/event-schema registry, "a typed event engine that normalizes Horizon, Soroban and CAP-67 unified
  events into application-shaped `NormalizedEvent`s", codegen, webhooks, React hooks and anchor
  clients. `pulse-core` lists the full classic operation set (payments, path payments, offers,
  claimable balances, liquidity pools, etc.), CAP-67 transfer/mint/burn/clawback/fee decoders, and
  cursor persistence including Postgres. The README notes that RPC history is bounded at about 7 days.
- **Overlap:** High on ingestion and normalisation, which is StellarBooks' Stellar-ingestion layer.
- **Differences / interop:** Orbital stops at normalised events and does no accounting. StellarBooks
  could depend on `pulse-core` or the ABI registry for decoding, or define its own source interface
  with an Orbital adapter. CAP-67 unified events, which include fee events, are relevant to booking
  fees correctly. The version (0.x), API stability and supply-chain risk should be assessed before
  taking a dependency. The repo has `docs/competitive-landscape.md`, which covers SEP-48, Mercury and
  other indexers. It was not read here but is worth reading.

### Stellar Address Kit

- **URL:** https://github.com/Boxkit-Labs/stellar-address-kit (owner: `Boxkit-Labs`). Docs:
  https://stellaraddresskit.mintlify.app/docs/introduction.
- **Licence:** MIT (LICENSE: "Copyright (c) 2026 Boxkit Labs"). **Language:** GitHub reports Dart.
  The README lists packages for TypeScript (`stellar-address-kit` on npm), Go and Dart. **Last
  push:** 2026-10-23.
- **What it does:** "a specialized, multi-language library designed to solve the complexity of deposit
  routing on the Stellar network ... G-addresses (classic), M-addresses (muxed), and C-addresses
  (contracts)". Its use cases include "Exchange Deposit Reconciliation" and extracting a routing ID
  from a muxed address or memo.
- **Overlap:** Counterparty and sub-account attribution, for example mapping muxed IDs or memos to
  customer sub-ledgers.
- **Differences / interop:** It is a narrow utility. StellarBooks could use it, or follow the same
  rules, to normalise addresses before mapping them to accounts or dimensions. Its handling of
  W-addresses (muxed contract addresses), which Welyvra mentions, was not checked.

---

## Other Stellar accounting, bookkeeping and tax-export tools

### Bookee: closest in spirit (read-only bookkeeping, end-user app)

- https://github.com/alexanderkoh/bookee. Apache-2.0, TypeScript (Tauri 2, React, SQLite), created
  2026-08-31, last push 2026-11-03.
- "A local-first, read-only ledger that turns a Stellar account's on-chain history into books you can
  actually read." It imports payments, path payments, account creation, merges, and SAC transfers,
  mints, burns and clawbacks. It uses decimal arithmetic, detects internal transfers between your own
  accounts, applies classification rules, and keeps totals per asset ("5 XLM plus 5 USDC is not 10 of
  anything"). Exports are "raw CSV with exact amounts, a QuickBooks Online bank CSV (3- or 4-column),
  and a monthly report". Diagnostics cover records it cannot interpret.
- **Vs StellarBooks:** Bookee is a desktop app built on SQLite with a categorised ledger. Its README
  does not describe a chart of accounts, double-entry journal, trial balance or period close. StellarBooks
  is an embeddable library with Postgres and a CLI. There is strong overlap in design principles
  (read-only, exact amounts, per-asset, internal-transfer detection, surfacing unknowns), so its
  decisions are worth studying. Interop could include a compatible CSV export format.

### Welyvra: closest in mechanism (double-entry plus reconciliation, business-facing)

- https://github.com/welyvra/welyvra-platform. Apache-2.0, TypeScript, created 2026-11-06, last push
  2026-11-13. Pre-alpha, Testnet only.
- "attributes every deposit to the right customer, records it exactly once in a double-entry ledger,
  reconciles on-chain activity against internal records". Components: idempotent ingestion,
  attribution (memo, `M` and `W` addresses), an append-only double-entry journal, reconciliation,
  exception case management, REST API and webhooks, and a dashboard. It does not do custody, KYC or
  exchange.
- **Vs StellarBooks:** It has significant overlap (double-entry, reconciliation, non-custodial). Welyvra
  is a platform (API, dashboard, webhooks) focused on attributing incoming deposits for businesses.
  StellarBooks is scoped as an embeddable library covering general account activity, with financial
  statements and period close. Welyvra's README does not mention statements or period close. The two
  could share ideas, and possibly an exchange format for journal entries.

### Stellar Ledger Tax (ledgertax-core / -api / -web)

- https://github.com/Ledger-Tax/ledgertax-core. MIT, TypeScript, npm `@veronicdev/ledgertax-core`,
  created 2026-11-07, last push 2026-11-08. The org also has `ledgertax-api` (MIT: "FIFO cost basis, CSV
  reports and HTTP API"), `ledgertax-web` (MIT) and `ledger-tax` (specs; no licence detected).
- The core is a "TypeScript library that classifies the public Stellar history of an address into typed
  events". It is described as "Accounting export, not tax advice", read-only, and returns `unknown`
  rather than hiding events. Not yet implemented: liquidity pools, Soroban contract events, multiple
  linked addresses. The README also notes that SDF Horizon keeps about one year of history.
- **Vs StellarBooks:** It overlaps on classifying classic history. Its focus is cost basis and tax
  export, which StellarBooks excludes. A possible design: StellarBooks consumes its classified events,
  or the two share a classification vocabulary.

### Toolnook "contracts" (ledgerlite)

- https://github.com/toolnook/contracts. MIT, Python, created 2026-11-05. "A small, local-first
  bookkeeping ledger with Stellar payment sync". It is a CLI double-entry ledger stored in a JSON file
  that imports Horizon payments. It is small in scope. It is listed for completeness, and the
  repository name does not match its content.

### Commercial / proprietary

- **Koinly** supports Stellar address sync and CSV upload, for example for LOBSTR exports.
- **CoinTracker** offers Stellar integration pages. Its user feedback reports problems with non-native
  Stellar tokens and missing history. It also posted a note that XLM support was rebuilt (date unclear).
- **StellarExpert** reportedly has an "Export data" CSV button on account transaction lists, according
  to a wallet help article. This was not verified directly.
- These are tax and portfolio tools, not double-entry accounting libraries. StellarBooks could export
  in formats they import, but it is explicitly not a tax tool.

Not investigated: Stellar Sentinel / Specula (account screening dashboards), stellar-lens (account
inspector), and any SDF-maintained tooling for anchors or SDP reporting.

---

## Positioning

These are factual observations, not claims of uniqueness.

1. **Double-entry on Stellar exists already.** Welyvra (double-entry journal plus reconciliation) and
   toolnook/ledgerlite (small double-entry CLI) both do it. Bookee does read-only bookkeeping with
   QuickBooks CSV export. Stellar Ledger Tax classifies events for tax export. All of them are recent:
   most were created between August and November 2026 and are at pre-alpha or 0.x stage.
2. **What StellarBooks plans to combine:** an embeddable TypeScript library, a Postgres store, classic
   operations plus Soroban token events, GL, trial balance, financial statements, period close, a CLI,
   and reconciliation against on-chain balances. Among the projects above, none of the READMEs
   describes that combination, especially statements and period close. A README describes intent, so
   this needs confirming by checking the code and docs before any public claim is made.
3. **Ingestion is largely a solved and shared problem.** Orbital (TypeScript, MIT) and SoroScan (a)
   already normalise or index Horizon, Soroban and CAP-67 events. StellarBooks could put its ingestion
   behind a source interface and offer adapters rather than rebuilding everything. Address handling
   could similarly reuse stellar-address-kit.
4. **History retention is a shared constraint.** Several READMEs note RPC's roughly 7-day Soroban event
   retention and Horizon's roughly 1-year public history. StellarBooks' reconciliation and backfill
   design must state how it obtains complete history, for example a self-hosted Horizon, Galexie or
   data lake, an indexer, or a CAP-67 unified-events source.
5. **Licence compatibility:** every project with a confirmed licence is MIT or Apache-2.0. Both are
   compatible with either choice for StellarBooks, given proper attribution and NOTICE handling for
   Apache-2.0. SoroScan (a)'s licence is unconfirmed (no LICENSE file).

## Open questions

- Which "SoroScan" did the requester mean: the indexer (SoroScan/soroscan) or the explorer
  (soroscan-io/soroscan)? Will SoroScan/soroscan add a LICENSE file to match its README?
- Should StellarBooks depend on Orbital's `pulse-core` and ABI registry, or only provide an adapter?
  This depends on its API stability (v0.2.0) and maintenance.
- Is there value in talking to the Welyvra and Bookee maintainers about a shared journal-entry or
  CSV export format, or a shared classification vocabulary (also with ledgertax-core)?
- Does Bookee's or Welyvra's code actually implement anything resembling period close or statements?
  Only READMEs were read.
- How do these tools treat fees, path payments, claimable balances, liquidity pools and SAC/SEP-41
  events? These are useful comparison points for StellarBooks' booking rules.
- Name check: "StellarBooks" vs "Tallybook" and "Bookee". Does any trademark or npm/GitHub name
  collision exist for "stellarbooks"? Not checked.
- AgentLedger (agentpayments.fi), mentioned in Nirium's README, was not investigated.

## Sources (retrieved 2026-11-16)

- https://github.com/Tallybook-Org/tallybook (README, LICENSE, repo metadata)
- https://github.com/Esureorg/Esure (README, LICENSE, repo metadata)
- https://github.com/nirium-protocol/nirium and https://github.com/nirium-protocol/nirium-core (README, LICENSE, repo metadata)
- https://github.com/stellar-alerts-labs/stellar-alerts (README, LICENSE, repo metadata)
- https://github.com/SoroScan/soroscan (README, root listing, repo metadata; no LICENSE found)
- https://github.com/soroscan-io/soroscan (README, LICENSE, repo metadata)
- https://github.com/orbital-stellar/orbital_stellar (README, LICENSE, repo metadata)
- https://github.com/Boxkit-Labs/stellar-address-kit (README, LICENSE, repo metadata)
- https://github.com/alexanderkoh/bookee (README, repo metadata)
- https://github.com/welyvra/welyvra-platform (README, repo metadata)
- https://github.com/Ledger-Tax/ledgertax-core (README, repo metadata); GitHub search results for the Ledger-Tax org
- https://github.com/toolnook/contracts (README, repo metadata)
- GitHub repository search API (queries: names above; "stellar accounting", "stellar bookkeeping", "stellar double-entry", "stellar tax", "soroban accounting")
- https://koinly.io/integrations/lobstr-wallet/
- https://www.cointracker.io/integrations/stellar
- https://feedback.cointracker.io/product-feedback/p/support-non-native-stellar-lumens-xlm-tokens
- https://feedback.cointracker.io/bugs/p/missing-xlm-transactions-on-stellar-wallet
- https://support.atomicwallet.io/article/143-how-to-export-history-in-csv (StellarExpert CSV export mention)
